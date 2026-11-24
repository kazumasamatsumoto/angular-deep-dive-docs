[目次](../README.md) › [ng コマンドの内側](README.md) › 第 7 回 / 全 10 回

# ng generate・new・run・version・cache

> src/commands/generate・new・run・version・cache・deploy ほか：collection と schematic の選び方（schematicCollections の順、collection:name）、ng new の collection、ng run の target の文字列、ng version の表の作り方、cache の場所と on/off、target の無い lint・e2e・deploy。

angular/angular-cli · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-generate-run)

---

この章で分かること：`ng generate` がどの collection のどの schematic をサブコマンドとして登録し、`collection:name` と `schematicCollections` の順がどう効くか。`ng new` の collection の選び方、`ng run` が `project:target:configuration` の文字列をどう切るか、`ng version` の表がどこから来るか、`ng cache` が何を書き何を数えるか。記録では、古い `cli.defaultCollection` は何も言わずに無視され、無い schematic の名前は「A collection and schematic is required during execution.」という別の意味の文で止まり、`ng run` の 4 つ目のコロンの後ろは黙って捨てられました。

読む対象は `packages/angular/cli/src/commands/` の `generate/cli.ts`・`new/cli.ts`・`run/cli.ts`・`version/`・`cache/`・`deploy/cli.ts` の、まだどの章も引いていない行です（../angular-cli、44129f66a3）。`ng generate component` が schematic を走らせて Tree に書くまでは[ng generate component の章](../cli/15-schematics-component.md)、schema の型が yargs のオプションになる規則は[第 2 回](02-ngx-options.md)、Architect が builder を探して走らせる手順は[Architect の章](../boot/02-boot-architect.md)、ビルドのキャッシュの中身は[再ビルドとキャッシュの章](../cli/10-cli-cache-watch.md)が読んでいます。

1. [1. ng と打ってから](01-ngx-entry.md)
2. [2. schema からオプション](02-ngx-options.md)
3. [3. angular.json と設定](03-ngx-config.md)
4. [4. パッケージマネージャー](04-ngx-package-managers.md)
5. [5. ng add](05-ngx-add.md)
6. [6. ng update](06-ngx-update.md)
7. **7. generate・new・run・version**（この章）
8. [8. analytics](08-ngx-analytics.md)
9. [9. ng mcp](09-ngx-mcp.md)
10. [10. spec と issue](10-ngx-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> collection（コレクション）は schematic をまとめた集まりで、パッケージの `collection.json` に「名前 → 作る関数と schema」が並んでいます。`@schematics/angular` は CLI が既定で使う collection です。この章の DEMO は、作業用の場所に 22.2.7 で作ったワークスペースに、自作の collection `my-schematics`（`hello`・別名 `hi` と、`@schematics/angular` と同じ名前の `component` を持つ）を置き、本物の `ng` を走らせた記録の再生です。手元の 22.2.7 と 44129f66a3 の違いは、この章の範囲では `generate/cli.ts` の説明文の 1 か所（`[collection:schematic]` を `` ` `` で囲む）、`version-info.ts` の 125 行目（6 節）、`cache/` の git worktree の扱い（7 節）、`deploy/cli.ts` の説明文（8 節）でした。

## 1. ng generate：サブコマンドを何個登録するか

📄 `angular-cli/packages/angular/cli/src/commands/generate/cli.ts` L43–58 （▶ の行: 44–46, 51, 54–55, 58）

```ts
43 │   override async builder(argv: Argv): Promise<Argv<GenerateCommandArgs>> {
44 ▶     let localYargs = (await super.builder(argv)).command({
45 ▶       command: '$0 <schematic>',
46 ▶       describe: 'Run the provided schematic.',
47 │       builder: (localYargs) =>
48 │         localYargs
49 │           .positional('schematic', {
50 │             describe: 'The [collection:schematic] to run.',
51 ▶             type: 'string',
52 │             demandOption: true,
53 │           })
54 ▶           .strict(),
55 ▶       handler: (options) => this.handler(options as ArgumentsCamelCase<GenerateCommandArgs>),
56 │     });
57 │ 
58 ▶     for (const [schematicName, collectionName] of await this.getSchematicsToRegister()) {
```

📄 `angular-cli/packages/angular/cli/src/commands/generate/cli.ts` L59–81 （▶ の行: 59–60, 69, 71–72, 77–78, 80）

```ts
59 ▶       const workflow = this.getOrCreateWorkflowForBuilder(collectionName);
60 ▶       const collection = workflow.engine.createCollection(collectionName);
61 │ 
62 │       const {
63 │         description: {
64 │           schemaJson,
65 │           aliases: schematicAliases,
66 │           hidden: schematicHidden,
67 │           description: schematicDescription,
68 │         },
69 ▶       } = collection.createSchematic(schematicName, true);
70 │ 
71 ▶       if (!schemaJson) {
72 ▶         continue;
73 │       }
74 │ 
75 │       const {
76 │         'x-deprecated': xDeprecated,
77 ▶         description = schematicDescription,
78 ▶         hidden = schematicHidden,
79 │       } = schemaJson;
80 ▶       const options = await this.getSchematicOptions(collection, schematicName, workflow);
81 │ 
```

45 行目の `$0 <schematic>` は「名前の分からない schematic を受ける」既定のサブコマンドで、54 行目で `strict()` です。58 行目から、`getSchematicsToRegister`（L258〜284、[ng generate component の章](../cli/15-schematics-component.md)が L262〜276 を引いている）が返す schematic を 1 つずつ、名前のサブコマンドとして登録します。`ng generate component foo` のように名前が分かっていれば、その 1 つだけを登録します（schema を読む手間を省く）。名前が無いとき（`ng generate --help`）と、名前が見つからないときは全部です。69 行目で schema を読み、71〜72 行目で schema の無い schematic は登録しません。78 行目、schema の `hidden` か collection.json の `hidden` なら一覧に出しません。

📄 `angular-cli/packages/angular/cli/src/commands/generate/cli.ts` L206–229 （▶ の行: 211–212, 216–219）

```ts
206 │   private async *getSchematics(): AsyncGenerator<{
207 │     schematicName: string;
208 │     schematicAliases?: Set<string>;
209 │     collectionName: string;
210 │   }> {
211 ▶     const seenNames = new Set<string>();
212 ▶     for (const collectionName of await this.getCollectionNames()) {
213 │       const workflow = this.getOrCreateWorkflowForBuilder(collectionName);
214 │       const collection = workflow.engine.createCollection(collectionName);
215 │ 
216 ▶       for (const schematicName of collection.listSchematicNames(true /** includeHidden */)) {
217 ▶         // If a schematic with this same name is already registered skip.
218 ▶         if (!seenNames.has(schematicName)) {
219 ▶           seenNames.add(schematicName);
220 │ 
221 │           yield {
222 │             schematicName,
223 │             collectionName,
224 │             schematicAliases: this.listSchematicAliases(collection, schematicName),
225 │           };
226 │         }
227 │       }
228 │     }
229 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/generate/cli.ts` L127–153 （▶ の行: 128–131, 134, 143–144, 150–151）

```ts
127 │ 
128 ▶   private async getCollectionNames(): Promise<string[]> {
129 ▶     const [collectionName] = this.parseSchematicInfo(
130 ▶       // positional = [generate, component] or [generate]
131 ▶       this.context.args.positional[1],
132 │     );
133 │ 
134 ▶     return collectionName ? [collectionName] : [...(await this.getSchematicCollections())];
135 │   }
136 │ 
137 │   private async shouldAddCollectionNameAsPartOfCommand(): Promise<boolean> {
138 │     const [collectionNameFromArgs] = this.parseSchematicInfo(
139 │       // positional = [generate, component] or [generate]
140 │       this.context.args.positional[1],
141 │     );
142 │ 
143 ▶     const schematicCollectionsFromConfig = await this.getSchematicCollections();
144 ▶     const collectionNames = await this.getCollectionNames();
145 │ 
146 │     // Only add the collection name as part of the command when it's not a known
147 │     // schematics collection or when it has been provided via the CLI.
148 │     // Ex:`ng generate @schematics/angular:c`
149 │     return (
150 ▶       !!collectionNameFromArgs ||
151 ▶       !collectionNames.some((c) => schematicCollectionsFromConfig.has(c))
152 │     );
153 │   }
```

1. **見る collection（134 行目）**

   `ng generate my-schematics:hello` のように `:` の前があればその 1 つ、無ければ設定の `getSchematicCollections()` の全部です。設定は schematics-command-module.ts L283〜318 で、カレントディレクトリのプロジェクトの `cli.schematicCollections` → ワークスペースの `cli.schematicCollections` → グローバルの設定 → `[@schematics/angular]` の順に、最初に見つかった配列です（読み方は[第 3 回](03-ngx-config.md)）。
2. **同じ名前は先の collection（211〜219 行目）**

   collection を配列の順に開き、218 行目で既に見た名前は飛ばします。`["my-schematics", "@schematics/angular"]` なら `ng g component baz` は my-schematics の `component`（記録では `CREATE my-component-baz.txt`）、逆の順なら `@schematics/angular` の component でした。
3. **collection の名前を表示に付けるか（143〜151 行目）**

   `:` の前を書いたとき、または設定に無い collection だけを見ているときは、一覧の名前を `my-schematics:hello` の形にします。

📄 `angular-cli/packages/angular/cli/src/commands/generate/cli.ts` L177–201 （▶ の行: 187–189, 191–192, 194, 196）

```ts
177 │   private async generateCommandString(
178 │     collectionName: string,
179 │     schematicName: string,
180 │     options: Option[],
181 │   ): Promise<string> {
182 │     const dasherizedSchematicName = strings.dasherize(schematicName);
183 │ 
184 │     // Only add the collection name as part of the command when it's not a known
185 │     // schematics collection or when it has been provided via the CLI.
186 │     // Ex:`ng generate @schematics/angular:component`
187 ▶     const commandName = (await this.shouldAddCollectionNameAsPartOfCommand())
188 ▶       ? collectionName + ':' + dasherizedSchematicName
189 ▶       : dasherizedSchematicName;
190 │ 
191 ▶     const positionalArgs = options
192 ▶       .filter((o) => o.positional !== undefined)
193 │       .map((o) => {
194 ▶         const label = `${strings.dasherize(o.name)}${o.type === 'array' ? ' ..' : ''}`;
195 │ 
196 ▶         return o.required ? `<${label}>` : `[${label}]`;
197 │       })
198 │       .join(' ');
199 │ 
200 │     return `${commandName}${positionalArgs ? ' ' + positionalArgs : ''}`;
201 │   }
```

一覧の `component [name]` と `component <name>` の違いは 196 行目の `o.required` です。どちらの schema も `name` を `required` に入れていますが、`@schematics/angular` の component には `x-prompt` があるので、聞けば埋まるとみなして `required` を外します（json-schema.ts L353〜356、[第 2 回](02-ngx-options.md)）。`x-prompt` の無い my-schematics は `<name>` です。端末でない記録で `ng g component` を名前なしで打つと、聞かずに schema の検査に進み「Data path "" must have required property 'name'.」でした。

DEMO の「1. ng generate」で確かめた、名前が見つからないとき：

1. **ng g hello x**

   どの collection にも `hello` が無いので全部を登録し、`hello` は 45 行目の `$0 <schematic>` が受け、余った `x` が 54 行目の `strict()` で「Error: Unknown argument: x」でした。名前が無いとは言いません。
2. **ng g hello**

   `$0` の handler から `run` に来て、`parseSchematicInfo('hello')` が collection 無しを返し、L110〜112 の「Error: A collection and schematic is required during execution.」でした（[ng generate component の章](../cli/15-schematics-component.md)の引用の範囲）。
3. **ng g @schematics/angular:hello**

   collection が決まっているので、engine から「Schematic "hello" not found in collection "@schematics/angular".」と分かる文が出ました。
4. **ng g nope:thing x**

   入っていない collection は「An unhandled exception occurred: Collection "nope" cannot be resolved.」で終了コード 127 です。builder の段の 60 行目の `createCollection` が投げ、ふつうのエラーの扱いを通りません。

DEMO の「2. schematicCollections」で、古い `cli.defaultCollection: "my-schematics"` だけを置くと、`ng g hello x` は上の 1 つ目と同じ「Unknown argument: x」でした。v22 の CLI のソースに `defaultCollection` を読む行は 1 つもなく（`git grep` で 0 件）、ワークスペースの schema（lib/config/workspace-schema.json）の `cliOptions` は `additionalProperties: false` ですが、`ng generate` は angular.json を schema で検査しないので、警告も出ません。`projects.ws22.cli.schematicCollections` にだけ置くと、ワークスペースの根でも `src/app` の中でも my-schematics の `component` が選ばれました。このプロジェクトの `root` が `""` で、どこにいても「このプロジェクトの中」だからです。この順の振る舞いは e2e の tests/e2e/tests/generate/schematics-collections.ts（L54〜82）が確かめています。

## 2. ng new：ワークスペースの外で、ng-new を持つ collection

📄 `angular-cli/packages/angular/cli/src/commands/new/cli.ts` L33–63 （▶ の行: 33–35, 43–44, 53–56, 60）

```ts
33 ▶   private readonly schematicName = 'ng-new';
34 ▶   override scope = CommandScope.Out;
35 ▶   protected override allowPrivateSchematics = true;
36 │ 
37 │   command = 'new [name]';
38 │   aliases = RootCommands['new'].aliases;
39 │   describe = 'Creates a new Angular workspace.';
40 │   longDescriptionPath = join(__dirname, 'long-description.md');
41 │ 
42 │   override async builder(argv: Argv): Promise<Argv<NewCommandArgs>> {
43 ▶     const localYargs = (await super.builder(argv)).option('collection', {
44 ▶       alias: 'c',
45 │       describe: 'A collection of schematics to use in generating the initial application.',
46 │       type: 'string',
47 │     });
48 │ 
49 │     const {
50 │       options: { collection: collectionNameFromArgs },
51 │     } = this.context.args;
52 │ 
53 ▶     const collectionName =
54 ▶       typeof collectionNameFromArgs === 'string'
55 ▶         ? collectionNameFromArgs
56 ▶         : await this.getCollectionFromConfig();
57 │ 
58 │     const workflow = this.getOrCreateWorkflowForBuilder(collectionName);
59 │     const collection = workflow.engine.createCollection(collectionName);
60 ▶     const options = await this.getSchematicOptions(collection, this.schematicName, workflow);
61 │ 
62 │     return this.addSchemaOptionsToCommand(localYargs, options);
63 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/new/cli.ts` L65–91 （▶ の行: 66–67, 75–78, 83）

```ts
65 │   async run(options: Options<NewCommandArgs> & OtherOptions): Promise<number | void> {
66 ▶     // Register the version of the CLI in the registry.
67 ▶     const collectionName = options.collection ?? (await this.getCollectionFromConfig());
68 │     const { dryRun, force, interactive, defaults, collection, ...schematicOptions } = options;
69 │     const workflow = await this.getOrCreateWorkflowForExecution(collectionName, {
70 │       dryRun,
71 │       force,
72 │       interactive,
73 │       defaults,
74 │     });
75 ▶     workflow.registry.addSmartDefaultProvider('ng-cli-version', () => VERSION.full);
76 ▶     workflow.registry.addSmartDefaultProvider(
77 ▶       'packageManager',
78 ▶       () => this.context.packageManager.name,
79 │     );
80 │ 
81 │     return this.runSchematic({
82 │       collectionName,
83 ▶       schematicName: this.schematicName,
84 │       schematicOptions,
85 │       executionOptions: {
86 │         dryRun,
87 │         force,
88 │         interactive,
89 │         defaults,
90 │       },
91 │     });
```

📄 `angular-cli/packages/angular/cli/src/commands/new/cli.ts` L93–108 （▶ の行: 96, 99, 101, 106）

```ts
 93 │ 
 94 │   /** Find a collection from config that has an `ng-new` schematic. */
 95 │   private async getCollectionFromConfig(): Promise<string> {
 96 ▶     for (const collectionName of await this.getSchematicCollections()) {
 97 │       const workflow = this.getOrCreateWorkflowForBuilder(collectionName);
 98 │       const collection = workflow.engine.createCollection(collectionName);
 99 ▶       const schematicsInCollection = collection.description.schematics;
100 │ 
101 ▶       if (Object.keys(schematicsInCollection).includes(this.schematicName)) {
102 │         return collectionName;
103 │       }
104 │     }
105 │ 
106 ▶     return DEFAULT_SCHEMATICS_COLLECTION;
107 │   }
108 │ }
```

1. **ワークスペースの外だけ（34 行目）**

   ワークスペースの中で打つと「This command is not available when running the Angular CLI inside a workspace.」で 1 でした。走らせる schematic は 33 行目の `ng-new` で固定、35 行目で private な schematic も呼べます。
2. **collection（53〜56 行目・96〜106 行目）**

   `-c` があればそれ、無ければ設定の collection（外ではグローバルの設定）を順に開き、99〜101 行目で `ng-new` を `schematics` に持つ最初のものです。どれにも無ければ 106 行目の `@schematics/angular`。解けない `-c my-schematics` は 1 節と同じく終了コード 127 でした。
3. **CLI から渡す既定値（75〜78 行目）**

   schema の `$default: {"$source": "ng-cli-version"}` と `packageManager` に、動いている CLI の版とパッケージマネージャーの名前を入れます。作られる package.json の `@angular/cli` の版（記録では `^22.2.7`）は、この値を schematics/angular の workspace/files/package.json.template L24 が `'^' + version` で書いたものです。66 行目のコメント「Register the version of the CLI in the registry.」は 67 行目ではなく 75 行目の説明です。

## 3. ng run：target の文字列

📄 `angular-cli/packages/angular/cli/src/commands/run/cli.ts` L36–73 （▶ の行: 42, 44–45, 47, 49–50, 52–54, 57–58, 63–64, 66, 71, 73）

```ts
36 │   async builder(argv: Argv): Promise<Argv<RunCommandArgs>> {
37 │     const { jsonHelp, getYargsCompletions, help } = this.context.args.options;
38 │ 
39 │     const localYargs: Argv<RunCommandArgs> = argv
40 │       .positional('target', {
41 │         describe:
42 ▶           'The Architect target to run provided in the following format `project:target[:configuration]`.',
43 │         type: 'string',
44 ▶         demandOption: true,
45 ▶         // Show only in when using --help and auto completion because otherwise comma seperated configuration values will be invalid.
46 │         // Also, hide choices from JSON help so that we don't display them in AIO.
47 ▶         choices: (getYargsCompletions || help) && !jsonHelp ? this.getTargetChoices() : undefined,
48 │       })
49 ▶       .middleware((args) => {
50 ▶         // TODO: remove in version 15.
51 │         const { configuration, target } = args;
52 ▶         if (typeof configuration === 'string' && target) {
53 ▶           const targetWithConfig = target.split(':', 2);
54 ▶           targetWithConfig.push(configuration);
55 │ 
56 │           throw new CommandModuleError(
57 ▶             'Unknown argument: configuration.\n' +
58 ▶               `Provide the configuration as part of the target 'ng run ${targetWithConfig.join(
59 │                 ':',
60 │               )}'.`,
61 │           );
62 │         }
63 ▶       }, true)
64 ▶       .strict();
65 │ 
66 ▶     const target = this.makeTargetSpecifier();
67 │     if (!target) {
68 │       return localYargs;
69 │     }
70 │ 
71 ▶     const schemaOptions = await this.getArchitectTargetOptions(target);
72 │ 
73 ▶     return this.addSchemaOptionsToCommand(localYargs, schemaOptions);
```

📄 `angular-cli/packages/angular/cli/src/commands/run/cli.ts` L75–99 （▶ の行: 78, 81, 84, 88, 93）

```ts
75 │ 
76 │   async run(options: Options<RunCommandArgs> & OtherOptions): Promise<number> {
77 │     const target = this.makeTargetSpecifier(options);
78 ▶     const { target: _target, ...extraOptions } = options;
79 │ 
80 │     if (!target) {
81 ▶       throw new CommandModuleError('Cannot determine project or target.');
82 │     }
83 │ 
84 ▶     return this.runSingleTarget(target, extraOptions);
85 │   }
86 │ 
87 │   protected makeTargetSpecifier(options?: Options<RunCommandArgs>): Target | undefined {
88 ▶     const architectTarget = options?.target ?? this.context.args.positional[1];
89 │     if (!architectTarget) {
90 │       return undefined;
91 │     }
92 │ 
93 ▶     const [project = '', target = '', configuration] = architectTarget.split(':');
94 │ 
95 │     return {
96 │       project,
97 │       target,
98 │       configuration,
99 │     };
```

1. **コロンで切る（93 行目）**

   `split(':')` の前から 3 つだけを使います。`ws22:build:development:ignored` は 4 つ目を何も言わずに捨て、`development` でビルドしました。42 行目の説明 `project:target[:configuration]` の外の形です。
2. **コンマは builder に渡る**

   `ws22:build:production,development` は 1 つの configuration の文字列として Architect に渡り、2 つを重ねてビルドしました（記録では production の budget で失敗）。45 行目のコメントが言うとおり、`choices` を常に付けるとこの形が通らなくなるので、47 行目で `--help` と補完のときだけ付けます。
3. **--configuration は受けない（49〜63 行目）**

   「Unknown argument: configuration. Provide the configuration as part of the target 'ng run ws22:build:production'.」です。50 行目の TODO「version 15 で消す」は v22 でも残っています。
4. **builder の option（66〜73 行目）**

   target が決まると、builder の schema を読んで option を足し（[第 2 回](02-ngx-options.md)）、64 行目の `strict()` で無い option は「Unknown argument: nope」です。`--output-hashing=all` は効きました。
5. **無いものの文**

   `ws22` だけ・`ws22:nope` は「Project target does not exist.」で 1、`ws22:build:nope` は Architect が投げて「An unhandled exception occurred: Configuration 'nope' for target 'build' in project 'ws22' is not set in the workspace.」で 127 でした。

## 4. ng version：表はどこから来るか

📄 `angular-cli/packages/angular/cli/src/commands/version/version-info.ts` L59–74 （▶ の行: 64–73）

```ts
59 │ /**
60 │  * A list of regular expression patterns that match package names that should be included in the
61 │  * version output.
62 │  */
63 │ const PACKAGE_PATTERNS = [
64 ▶   /^@angular\/.*/,
65 ▶   /^@angular-devkit\/.*/,
66 ▶   /^@ngtools\/.*/,
67 ▶   /^@schematics\/.*/,
68 ▶   /^rxjs$/,
69 ▶   /^typescript$/,
70 ▶   /^ng-packagr$/,
71 ▶   /^vitest$/,
72 ▶   /^webpack$/,
73 ▶   /^zone\.js$/,
74 │ ];
```

📄 `angular-cli/packages/angular/cli/src/commands/version/version-info.ts` L80–130 （▶ の行: 82, 86, 89–91, 93, 97, 99–100, 105, 112, 117, 124–125）

```ts
 80 │ export async function gatherVersionInfo(context: CommandContext): Promise<VersionInfo> {
 81 │   // Trailing slash is used to allow the path to be treated as a directory
 82 ▶   const workspaceRequire = createRequire(context.root + '/');
 83 │ 
 84 │   let workspacePackage: PartialPackageInfo | undefined;
 85 │   try {
 86 ▶     workspacePackage = workspaceRequire('./package.json');
 87 │   } catch {}
 88 │ 
 89 ▶   const allDependencies = {
 90 ▶     ...workspacePackage?.dependencies,
 91 ▶     ...workspacePackage?.devDependencies,
 92 │   };
 93 ▶   const packageNames = new Set(Object.keys(allDependencies));
 94 │ 
 95 │   const packages: Record<string, PackageVersionInfo> = {};
 96 │   for (const name of packageNames) {
 97 ▶     if (PACKAGE_PATTERNS.some((p) => p.test(name))) {
 98 │       packages[name] = {
 99 ▶         requested: allDependencies[name] ?? 'error',
100 ▶         installed: getVersion(name, workspaceRequire),
101 │       };
102 │     }
103 │   }
104 │ 
105 ▶   const angularCoreVersion = packages['@angular/core'];
106 │ 
107 │   return {
108 │     cli: {
109 │       version: VERSION.full,
110 │     },
111 │     framework: {
112 ▶       version: angularCoreVersion?.installed,
113 │     },
114 │     system: {
115 │       node: {
116 │         version: process.versions.node,
117 ▶         unsupported: !isNodeVersionSupported(),
118 │       },
119 │       os: {
120 │         platform: process.platform,
121 │         architecture: process.arch,
122 │       },
123 │       packageManager: {
124 ▶         name: context.packageManager.name,
125 ▶         version: await context.packageManager.getVersion(),
126 │       },
127 │     },
128 │     packages,
129 │   };
130 │ }
```

📄 `angular-cli/packages/angular/cli/src/commands/version/version-info.ts` L132–153 （▶ の行: 136, 139, 144, 149, 152）

```ts
132 │ /**
133 │  * Gets the version of a package.
134 │  * @param moduleName The name of the package.
135 │  * @param workspaceRequire A `require` function for the workspace.
136 ▶  * @param localRequire A `require` function for the CLI.
137 │  * @returns The version of the package, or `<error>` if it could not be found.
138 │  */
139 ▶ function getVersion(moduleName: string, workspaceRequire: NodeJS.Require): string {
140 │   let packageInfo: PartialPackageInfo | undefined;
141 │ 
142 │   // Try to find the package in the workspace
143 │   try {
144 ▶     packageInfo = workspaceRequire(`${moduleName}/package.json`);
145 │   } catch {}
146 │ 
147 │   // If found, attempt to get the version
148 │   if (packageInfo) {
149 ▶     return packageInfo.version;
150 │   }
151 │ 
152 ▶   return '<error>';
153 │ }
```

1. **package.json に書いたものだけ（86〜93 行目）**

   ワークスペースの package.json の `dependencies` と `devDependencies` の名前から、64〜73 行目の形に合うものだけを表にします。書いていない `@angular-devkit/core` や `@schematics/angular` は、入っていても出ません。書いてあっても形に合わない `tslib`・`jsdom`・`prettier` は出ません（記録の 12 行）。
2. **入っている版（144 行目）**

   ワークスペースから `<名前>/package.json` を require します。読めなければ 152 行目の `<error>`。99 行目の `'error'` は、93 行目で取った名前なので使われない枝です（`<error>` と形も違う）。136 行目の `@param localRequire` は 139 行目の引数にありません。
3. **Angular の版（105・112 行目）**

   表の `@angular/core` の入っている版です。ワークスペースの外では行ごと出ません。
4. **パッケージマネージャー（124〜125 行目）**

   44129f66a3 の 125 行目は `getVersion()` を try せずに待つので、マネージャーが無いと例外です。22.2.7 には 2e0f48e3ff（`fix(@angular/cli): keep ng version working when the package manager is not installed`）が入っていて、package.json の `packageManager` 欄を消し angular.json の `cli.packageManager` を入っていない `bun` にすると、「Package Manager : bun &lt;error&gt;」で表を出し、`--json` では `version` の鍵が無くなりました。`packageManager: "bun@1.2.0"` の欄があると、bun が入っていなくても「bun 1.2.0」と出ます。欄の版をそのまま返し、コマンドを走らせないからです（package-manager.ts L420〜423、[第 4 回](04-ngx-package-managers.md)）。

📄 `angular-cli/packages/angular/cli/src/commands/version/cli.ts` L57–95 （▶ の行: 61–63, 79, 81–82, 88, 92）

```ts
57 │   async run(options: { json?: boolean }): Promise<void> {
58 │     const { logger } = this.context;
59 │     const versionInfo = await gatherVersionInfo(this.context);
60 │ 
61 ▶     if (options.json) {
62 ▶       // eslint-disable-next-line no-console
63 ▶       console.log(JSON.stringify(versionInfo, null, 2));
64 │ 
65 │       return;
66 │     }
67 │ 
68 │     const {
69 │       cli: { version: ngCliVersion },
70 │       framework,
71 │       system: {
72 │         node: { version: nodeVersion, unsupported: unsupportedNodeVersion },
73 │         os: { platform: os, architecture: arch },
74 │         packageManager: { name: packageManagerName, version: packageManagerVersion },
75 │       },
76 │       packages,
77 │     } = versionInfo;
78 │ 
79 ▶     const headerInfo = [{ label: 'Angular CLI', value: ngCliVersion }];
80 │ 
81 ▶     if (framework.version) {
82 ▶       headerInfo.push({ label: 'Angular', value: framework.version });
83 │     }
84 │ 
85 │     headerInfo.push(
86 │       {
87 │         label: 'Node.js',
88 ▶         value: `${nodeVersion}${unsupportedNodeVersion ? colors.yellow(' (Unsupported)') : ''}`,
89 │       },
90 │       {
91 │         label: 'Package Manager',
92 ▶         value: `${packageManagerName} ${packageManagerVersion ?? '<error>'}`,
93 │       },
94 │       { label: 'Operating System', value: `${os} ${arch}` },
95 │     );
```

📄 `angular-cli/packages/angular/cli/src/commands/version/cli.ts` L122–157 （▶ の行: 123–125, 134, 144, 149–150, 153, 157）

```ts
122 │   private formatPackageTable(versions: Record<string, PackageVersionInfo>): string {
123 ▶     const versionKeys = Object.keys(versions);
124 ▶     if (versionKeys.length === 0) {
125 ▶       return '';
126 │     }
127 │ 
128 │     const headers = {
129 │       name: 'Package',
130 │       installed: 'Installed Version',
131 │       requested: 'Requested Version',
132 │     };
133 │ 
134 ▶     const maxNameLength = Math.max(headers.name.length, ...versionKeys.map((key) => key.length));
135 │     const maxInstalledLength = Math.max(
136 │       headers.installed.length,
137 │       ...versionKeys.map((key) => versions[key].installed.length),
138 │     );
139 │     const maxRequestedLength = Math.max(
140 │       headers.requested.length,
141 │       ...versionKeys.map((key) => versions[key].requested.length),
142 │     );
143 │ 
144 ▶     const tableRows = versionKeys
145 │       .map((module) => {
146 │         const { requested, installed } = versions[module];
147 │         const name = module.padEnd(maxNameLength);
148 │ 
149 ▶         const coloredInstalled =
150 ▶           installed === '<error>' ? colors.red(installed) : colors.cyan(installed);
151 │         const installedPadding = ' '.repeat(maxInstalledLength - installed.length);
152 │ 
153 ▶         return `│ ${name} │ ${coloredInstalled}${installedPadding} │ ${requested.padEnd(
154 │           maxRequestedLength,
155 │         )} │`;
156 │       })
157 ▶       .sort();
```

`--json` は 61〜63 行目で `gatherVersionInfo` の値をそのまま出します。`packages` の順は package.json の順（dependencies → devDependencies）で、表は 157 行目の `sort()` で名前の順です。表の行の文字列は 153 行目で `│ ` から始まり、名前の前に色の符号が入らないので、文字列のままの並べ替えが名前の順になります。

## 5. ng cache：設定を書く、数える

📄 `angular-cli/packages/angular/cli/src/commands/cache/cli.ts` L25–47 （▶ の行: 32, 35–40, 46）

```ts
25 │ export default class CacheCommandModule
26 │   extends CommandModule
27 │   implements CommandModuleImplementation
28 │ {
29 │   command = 'cache';
30 │   describe = 'Configure persistent disk cache and retrieve cache statistics.';
31 │   longDescriptionPath = join(__dirname, 'long-description.md');
32 ▶   override scope = CommandScope.In;
33 │ 
34 │   builder(localYargs: Argv): Argv {
35 ▶     const subcommands = [
36 ▶       CacheEnableModule,
37 ▶       CacheDisableModule,
38 ▶       CacheCleanModule,
39 ▶       CacheInfoCommandModule,
40 ▶     ].sort();
41 │ 
42 │     for (const module of subcommands) {
43 │       addCommandModuleToYargs(module, this.context);
44 │     }
45 │ 
46 ▶     return localYargs.demandCommand(1, demandCommandFailureMessage).strict();
47 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/cache/settings/cli.ts` L17–47 （▶ の行: 19–20, 29, 35–36, 45）

```ts
17 │ export class CacheDisableModule extends CommandModule implements CommandModuleImplementation {
18 │   command = 'disable';
19 ▶   aliases = 'off';
20 ▶   describe = 'Disables persistent disk cache for all projects in the workspace.';
21 │   longDescriptionPath: string | undefined;
22 │   override scope = CommandScope.In;
23 │ 
24 │   builder(localYargs: Argv): Argv {
25 │     return localYargs;
26 │   }
27 │ 
28 │   run(): Promise<void> {
29 ▶     return updateCacheConfig(this.getWorkspaceOrThrow(), 'enabled', false);
30 │   }
31 │ }
32 │ 
33 │ export class CacheEnableModule extends CommandModule implements CommandModuleImplementation {
34 │   command = 'enable';
35 ▶   aliases = 'on';
36 ▶   describe = 'Enables disk cache for all projects in the workspace.';
37 │   longDescriptionPath: string | undefined;
38 │   override scope = CommandScope.In;
39 │ 
40 │   builder(localYargs: Argv): Argv {
41 │     return localYargs;
42 │   }
43 │ 
44 │   run(): Promise<void> {
45 ▶     return updateCacheConfig(this.getWorkspaceOrThrow(), 'enabled', true);
46 │   }
47 │ }
```

📄 `angular-cli/packages/angular/cli/src/commands/cache/utilities.ts` L15–25 （▶ の行: 20–22, 24）

```ts
15 │ export function updateCacheConfig<K extends keyof Cache>(
16 │   workspace: AngularWorkspace,
17 │   key: K,
18 │   value: Cache[K],
19 │ ): Promise<void> {
20 ▶   const cli = (workspace.extensions['cli'] ??= {}) as Record<string, Record<string, unknown>>;
21 ▶   const cache = (cli['cache'] ??= {});
22 ▶   cache[key] = value;
23 │ 
24 ▶   return workspace.save();
25 │ }
```

35〜40 行目の `.sort()` はクラスの配列を並べます。比べ関数が無いので、クラスを文字列にしたもの（`class CacheCleanModule …` で始まるソース）の順になり、`ng cache --help` の並びは clean・disable・enable・info でした。`ng cache off` は 29 行目で `cli.cache.enabled` を `false` に、`on` は 45 行目で `true` にし、20〜21 行目で `cli` と `cache` が無ければ作ります（DEMO の差分は 4 行と 1 行）。消さずに `true` を書くので、一度 off にしたワークスペースは on にしても `cache` の項目が残ります。20 行目と 36 行目の説明は「Disables persistent disk cache」「Enables disk cache」と言い方がそろっていません。

📄 `angular-cli/packages/angular/cli/src/commands/cache/utilities.ts` L67–100 （▶ の行: 73–75, 78–79, 83–84, 89–91, 96）

```ts
 67 │ export function getCacheConfig(workspace: AngularWorkspace | undefined): Required<Cache> {
 68 │   if (!workspace) {
 69 │     throw new Error(`Cannot retrieve cache configuration as workspace is not defined.`);
 70 │   }
 71 │ 
 72 │   const defaultSettings: Required<Cache> = {
 73 ▶     path: getCacheBasePath(workspace.basePath, '.angular/cache'),
 74 ▶     environment: Environment.Local,
 75 ▶     enabled: true,
 76 │   };
 77 │ 
 78 ▶   const cliSetting = workspace.extensions['cli'];
 79 ▶   if (!cliSetting || !isJsonObject(cliSetting)) {
 80 │     return defaultSettings;
 81 │   }
 82 │ 
 83 ▶   const cacheSettings = cliSetting['cache'];
 84 ▶   if (!isJsonObject(cacheSettings)) {
 85 │     return defaultSettings;
 86 │   }
 87 │ 
 88 │   const {
 89 ▶     path = '.angular/cache',
 90 ▶     environment = defaultSettings.environment,
 91 ▶     enabled = defaultSettings.enabled,
 92 │     // eslint-disable-next-line @typescript-eslint/no-explicit-any
 93 │   } = cacheSettings as Record<string, any>;
 94 │ 
 95 │   return {
 96 ▶     path: getCacheBasePath(workspace.basePath, path),
 97 │     environment,
 98 │     enabled,
 99 │   };
100 │ }
```

📄 `angular-cli/packages/angular/cli/src/commands/cache/info/cli.ts` L31–70 （▶ の行: 32, 35–36, 41, 58–59）

```ts
31 │   async run(): Promise<void> {
32 ▶     const cacheConfig = getCacheConfig(this.context.workspace);
33 │     const { path, environment, enabled } = cacheConfig;
34 │ 
35 ▶     const effectiveStatus = this.effectiveEnabledStatus(cacheConfig);
36 ▶     const sizeOnDisk = await this.getSizeOfDirectory(path);
37 │ 
38 │     const info: { label: string; value: string }[] = [
39 │       {
40 │         label: 'Enabled',
41 ▶         value: enabled ? colors.green('Yes') : colors.red('No'),
42 │       },
43 │       {
44 │         label: 'Environment',
45 │         value: colors.cyan(environment),
46 │       },
47 │       {
48 │         label: 'Path',
49 │         value: colors.cyan(path),
50 │       },
51 │       {
52 │         label: 'Size on disk',
53 │         value: colors.cyan(sizeOnDisk),
54 │       },
55 │       {
56 │         label: 'Effective Status',
57 │         value:
58 ▶           (effectiveStatus ? colors.green('Enabled') : colors.red('Disabled')) +
59 ▶           ' (current machine)',
60 │       },
61 │     ];
62 │ 
63 │     const maxLabelLength = Math.max(...info.map((l) => l.label.length));
64 │ 
65 │     const output = info
66 │       .map(({ label, value }) => colors.bold(label.padEnd(maxLabelLength + 2)) + `: ${value}`)
67 │       .join('\n');
68 │ 
69 │     this.context.logger.info(`\n${colors.bold('Cache Information')}\n\n${output}\n`);
70 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/cache/info/cli.ts` L114–127 （▶ の行: 117–122, 126）

```ts
114 │   private effectiveEnabledStatus(cacheConfig: { enabled: boolean; environment: string }): boolean {
115 │     const { enabled, environment } = cacheConfig;
116 │ 
117 ▶     if (enabled) {
118 ▶       switch (environment) {
119 ▶         case 'ci':
120 ▶           return isCI;
121 ▶         case 'local':
122 ▶           return !isCI;
123 │       }
124 │     }
125 │ 
126 ▶     return enabled;
127 │   }
```

1. **既定（73〜75 行目）**

   道は `.angular/cache`、環境は `local`、有効。41 行目の「Enabled」はこの設定の値、58〜59 行目の「Effective Status」は 117〜123 行目で `CI` と組み合わせた結果です。
2. **CI の見分け**

   `CI=true` で「Enabled: Yes」「Effective Status: Disabled」、`CI=yes` では Enabled のままでした。`isCI` は `'1'` か `'true'`（大文字小文字は問わない）だけを CI とみなします（environment-options.ts、[第 8 回](08-ngx-analytics.md)の 1 節）。long-description.md の「CI 変数の有無と値で決める」は、値の形まで書いていません。ビルドの側の normalize-cache.ts も同じ判定です。
3. **environment: ci と path**

   `{"environment": "ci", "path": ".cache/ng"}` では、CI でない手元で Effective Status が Disabled、道は `<work>/ws22/.cache/ng` でした。

📄 `angular-cli/packages/angular/cli/src/commands/cache/info/cli.ts` L72–98 （▶ の行: 82–83, 87, 89–90, 93）

```ts
72 │   private async getSizeOfDirectory(path: string): Promise<string> {
73 │     const directoriesStack = [path];
74 │     let size = 0;
75 │ 
76 │     while (directoriesStack.length) {
77 │       // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
78 │       const dirPath = directoriesStack.pop()!;
79 │       let entries: string[] = [];
80 │ 
81 │       try {
82 ▶         entries = await fs.readdir(dirPath);
83 ▶       } catch {}
84 │ 
85 │       for (const entry of entries) {
86 │         const entryPath = join(dirPath, entry);
87 ▶         const stats = await fs.stat(entryPath);
88 │ 
89 ▶         if (stats.isDirectory()) {
90 ▶           directoriesStack.push(entryPath);
91 │         }
92 │ 
93 ▶         size += stats.size;
94 │       }
95 │     }
96 │ 
97 │     return this.formatSize(size);
98 │   }
```

「Size on disk」は 93 行目で、ファイルだけでなくディレクトリの `stat.size` も足します。記録のキャッシュ（ファイル 3 つ、ディレクトリ 2 つ）では、ファイルの合計 476.23 kB にディレクトリの 0.25 kB が足されて 476.48 kB でした（`du -sk` は 484 kB）。82〜83 行目の `readdir` は失敗を握りつぶしますが、87 行目の `stat` は try の外なので、壊れたシンボリックリンクがあると例外になります。

22.2.7 の `cache/` は 44129f66a3 から 3 つ変わっています。git worktree の中のワークスペースで、共有のキャッシュの道を「元のチェックアウトの根」ではなく「元のチェックアウトの中の同じ相対の道」にする（b198044048）、`ng cache info` が worktree の自分のキャッシュ（Local path）も出す（5bf18669bc）、`ng cache clean` がそれも消す（7de6927af8）です。この記録のワークスペースは git の外なので、44129f66a3 と同じ出力でした。

## 6. target が無いとき：lint・e2e・deploy

📄 `angular-cli/packages/angular/cli/src/commands/deploy/cli.ts` L14–43 （▶ の行: 18–22, 38, 41–42）

```ts
14 │ export default class DeployCommandModule
15 │   extends ArchitectCommandModule
16 │   implements CommandModuleImplementation
17 │ {
18 ▶   // The below choices should be kept in sync with the list in https://angular.dev/tools/cli/deployment
19 ▶   override missingTargetChoices: MissingTargetChoice[] = [
20 ▶     {
21 ▶       name: 'Amazon S3',
22 ▶       value: '@jefiozie/ngx-aws-deploy',
23 │     },
24 │     {
25 │       name: 'Firebase',
26 │       value: '@angular/fire',
27 │     },
28 │     {
29 │       name: 'Netlify',
30 │       value: '@netlify-builder/deploy',
31 │     },
32 │     {
33 │       name: 'GitHub Pages',
34 │       value: 'angular-cli-ghpages',
35 │     },
36 │   ];
37 │ 
38 ▶   multiTarget = false;
39 │   command = 'deploy [project]';
40 │   longDescriptionPath = join(__dirname, 'long-description.md');
41 ▶   describe =
42 ▶     'Invokes the deploy builder for a specified project or for the default project in the workspace.';
43 │ }
```

`ng lint`・`ng e2e`・`ng deploy` は、target が無いと `missingTargetChoices` の一覧を「For example: ESLint: ng add angular-eslint」の形で出して 1 で終わりました（端末なら選ばせて `ng add` する。architect-base-command-module.ts L231〜252、[第 2 回](02-ngx-options.md)）。18 行目のコメントのとおり deploy の一覧は angular.dev の deployment の頁と手で合わせる約束です。41〜42 行目の「or for the default project in the workspace」は、v14 で消えた `defaultProject` の言い方です。22.2.7 では 5887a6f8e0 で「the only project with a deploy target, or the project in the current working directory」に直り、記録の `ng deploy --help` もその文でした。38 行目の `multiTarget = false` で、deploy は 1 つのプロジェクトにしか走りません。

> **🧪 DEMO — 本物の ng generate・new・run・version・cache の記録**
>
> 作業用の場所の ws22（22.2.7）と、その外の空のディレクトリで、本物の `ng` を走らせた標準出力・標準エラー出力・終了コードと、書き換わった angular.json の差分です（2026-11-24）。angular.json を書き換えた記録は、記録のあと元に戻しました。長い出力は先頭だけです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-generate-run)

## ここまでの呼び出し（ng generate hello x、collection の設定あり）

- 👤 `ng g hello x` — ターミナル
  - `GenerateCommandModule.builder` — generate/cli.ts L43 — *$0 &lt;schematic&gt; を先に登録*
    - `getSchematicsToRegister → getSchematics` — L258 / L206
      - `getCollectionNames → getSchematicCollections` — L127 → schematics-command-module.ts L283 — *プロジェクト → ワークスペース → グローバル → 既定*
      - `collection.listSchematicNames(true)` — L216 — *同じ名前は先の collection（L218）*
    - `localYargs.command({ command: generateCommandString(…) })` — L82〜100 — *見つからないと全部を登録*
  - `yargs が $0 <schematic> に hello を渡す` — L45 — *x は strict で Unknown argument*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `src/commands/cache/utilities_spec.ts` | `CLI cache config utilities`（16）› `should resolve default cache path relative to workspace basePath in a standard repository`（39）・`… in a git worktree`（48・70）・`… in a git submodule`（94） | 5 節の 73・96 行目の `getCacheBasePath`。`getCacheConfig` の `environment` と `enabled` の既定は見ない |
| `tests/e2e/tests/generate/schematics-collections.ts` | （e2e、走らせていない）L54〜82 | 1 節の `schematicCollections` の順 |
| `tests/e2e/tests/commands/run-configuration-option.ts` | （e2e）L9〜21 | 3 節の `--configuration` の文 |
| `tests/e2e/tests/misc/version.ts` | （e2e）L5〜21 | 4 節の Node の版の警告 |
| `tests/e2e/tests/commands/cache/` | `cache-enable-disable.ts`（L6・L13）・`cache-info.ts`・`cache-clean.ts` | 5 節の on／off と info |

📄 `走らせたコマンド（2026-11-24）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=CLI cache config utilities"
```

結果は手元の bazel で `//packages/angular/cli:test` が 257 specs・0 failures、`CLI cache config utilities` で絞ると 4 specs・0 failures でした。`generate/cli.ts`・`new/cli.ts`・`run/cli.ts`・`version/` の unit の spec は 44129f66a3 にはありません（22.2.7 で `version-info_spec.ts` が足された）。

直すとしたら、1 節の「無い名前」は generate/cli.ts の `run`（L106〜126）で、collection が無く名前だけのとき「Schematic "hello" not found in the configured collections (…)」と言うようにし、`$0 <schematic>` の `strict()`（54 行目）の前に名前を確かめます。`defaultCollection` は schematics-command-module.ts の `getSchematicCollections` で見つけたら警告を出す形です。3 節の 4 つ目のコロンは run/cli.ts の 93 行目で `split(':')` の長さが 3 を超えたら `CommandModuleError` にし、50 行目の TODO の middleware は消すかコメントを直します。spec はどれも今は無いので、`RunCommandModule` の `makeTargetSpecifier` の spec を新しく作るのが一番小さい足し方です。

## 聞かれそうな質問

**Q. 自作の collection の schematic を `ng g hello` と短く打つには？**

angular.json の `cli.schematicCollections` に collection の名前を入れます（134 行目でその配列を見る）。`@schematics/angular` も使うなら両方を並べ、同じ名前は 218 行目で先の方が勝ちます。古い `defaultCollection` は読まれません。

**Q. `ng g hello x` の「Unknown argument: x」は何が起きていますか？**

`hello` がどの collection にも無いので、45 行目の既定のサブコマンド `$0 <schematic>` が `hello` を受け、残りの `x` を 54 行目の `strict()` が拒んでいます。名前を間違えたときの文です。

**Q. `ng run app:build:production` と `ng build -c production` の違いは？**

どちらも Architect に同じ target を渡します。`ng run` は 93 行目の文字列で configuration を受け、`--configuration` は 49〜63 行目で拒みます。コンマで 2 つ並べる形はどちらも通りました（3 節）。

**Q. `ng version` に `@angular-devkit/core` が出ないのはなぜ？**

89〜93 行目で、ワークスペースの package.json に名前があるものだけを数えるからです。依存の依存は入っていても出ません。

**Q. `ng cache off` はどこに何を書きますか？**

ワークスペースの angular.json の `cli.cache.enabled: false` です（settings/cli.ts 29 行目 → utilities.ts 20〜24 行目）。グローバルには書きません。ビルドはこの値を自分で読みます（normalize-cache.ts）。

## 読み終えて

- `ng generate` は名前が分かればその 1 つ、分からなければ全部の schematic をサブコマンドにする。見つからない名前は既定の `$0 <schematic>` に落ち、文が分かりにくい。
- collection は「指定 → プロジェクト → ワークスペース → グローバル → `@schematics/angular`」。同じ名前は配列の先が勝ち、`defaultCollection` は黙って無視される。
- `ng run` はコロンの前 3 つだけを使い、`--configuration` を拒む。
- `ng version` の表は package.json に書いた名前だけ。マネージャーの版は `packageManager` 欄があればそのまま出る。
- `ng cache` は angular.json の `cli.cache` を書くだけで、「Effective Status」は `CI` が `1`／`true` かで決まる。

---

← 前: [ng update：版を決めて migrations を走らせる](06-ngx-update.md)  
次: [analytics：何をいつ送るか](08-ngx-analytics.md) →
