[目次](../README.md) › [CLI とビルド](README.md) › 第 15 回 / 全 16 回

# ng generate component の中身：@schematics/angular の 1 本を読む

> ng generate が collection.json から component の schematic を探し、schema.json で引数を検証して、component/index.ts の Rule を走らせる流れ。プロジェクトとパスの決め方、ファイルのテンプレート（\_\_name@dasherize\_\_ など）、standalone が既定のときと NgModule に declarations を足すとき（ast-utils）の違い、--dry-run の出力。

angular/angular-cli · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/schematics-component)

---

`ng generate component user-card`（`ng g c`）と打ってから、`CREATE src/app/user-card/user-card.ts` が出るまでを 1 本で追います。CLI が `collection.json` から component の schematic を探す所、`schema.json` で引数に既定値を入れて検証する所、`component/index.ts`（全 104 行）がプロジェクトとパスを決め、`files/` のテンプレートから Tree を作る所、standalone でないときだけ NgModule の `declarations` に足す所を、行番号を指して読みます。

読む対象は angular-cli リポジトリの `packages/angular/cli/src/commands/generate/cli.ts`・`command-builder/schematics-command-module.ts`、`packages/angular_devkit/schematics/tools/` の `node-module-engine-host.ts`・`file-system-engine-host-base.ts`・`schema-option-transform.ts`、`packages/schematics/angular/` の `collection.json`・`component/`（`index.ts`・`schema.json`・`files/`）・`utility/`（`project.ts`・`workspace.ts`・`parse-name.ts`・`find-module.ts`・`add-declaration-to-ng-module.ts`）です。

1. [1. 概観](01-cli-overview.md)
2. [2. ng build の段取り](02-build.md)
3. [3. AotCompilation](03-cli-angular-compilation.md)
4. [4. コンポーネントのスタイル](04-cli-component-styles.md)
5. [5. oxc の変換](05-cli-javascript-transformer.md)
6. [6. リンカー](06-cli-linker.md)
7. [7. 遅延チャンク](07-cli-code-splitting.md)
8. [8. budgets](08-cli-budgets.md)
9. [9. i18n](09-cli-i18n.md)
10. [10. 再ビルドとキャッシュ](10-cli-cache-watch.md)
11. [11. HMR](11-cli-hmr.md)
12. [12. unit-test と Vitest](12-cli-unit-test.md)
13. [13. Tree と sink](13-schematics.md)
14. [14. Rule の組み立て](14-schematics-rules.md)
15. **15. ng generate component**（この章）
16. [16. ng add と ng update](16-cli-add-update.md)

## 0. 全体の流れ

1. **サブコマンドを登録する**

   `ng generate` は、コレクション（`@schematics/angular`）の schematic を 1 つずつ yargs のサブコマンドにする。`c` は別名（1 節）。`ng` の起動から `handler` までは[起動シリーズ第 1 回](../boot/01-boot-ng-command.md)。
2. **コレクションと schematic を探す**

   パッケージの `package.json` の `schematics` → `collection.json` → `component` の `factory` と `schema`（2 節）。
3. **引数を整える**

   `angular.json` の既定値、`schema.json` の `$default` と `default` を入れてから、JSON Schema で検証（3 節）。
4. **Rule を作る**

   `component/index.ts` がワークスペースを読み、パス・セレクタ・クラス名を決め、テンプレートの Tree を組む（4〜6 節）。
5. **NgModule に足す（standalone でないときだけ）**

   `addDeclarationToNgModule` が TypeScript の AST で位置を求め、`UpdateRecorder` で挿入（7 節）。
6. **書き出す**

   [第 13 回](13-schematics.md)の sink。画面の `CREATE` は `DryRunSink` の報告（8 節）。

## 1. ng generate のサブコマンドは schematic の一覧から作られる

📄 `angular-cli/packages/angular/cli/src/commands/generate/cli.ts` L262–276 （▶ の行: 262, 264, 267, 270, 272, 275）

```ts
262 ▶     const [, schematicNameFromArgs] = this.parseSchematicInfo(
263 │       // positional = [generate, component] or [generate]
264 ▶       this.context.args.positional[1],
265 │     );
266 │ 
267 ▶     for await (const { schematicName, collectionName, schematicAliases } of this.getSchematics()) {
268 │       if (
269 │         schematicNameFromArgs &&
270 ▶         (schematicName === schematicNameFromArgs || schematicAliases?.has(schematicNameFromArgs))
271 │       ) {
272 ▶         return [[schematicName, collectionName]];
273 │       }
274 │ 
275 ▶       schematicsToRegister.push([schematicName, collectionName]);
276 │     }
```

262〜265 行目、コマンドラインの 2 番目の語（`ng generate component` の `component`、`ng g c` なら `c`）を取ります。267 行目でコレクションの schematic を順に見て、270 行目で**名前か別名が一致したら** 272 行目でその 1 つだけを返します。全部をサブコマンドにすると、全部の `schema.json` を読むことになるからです。一致しなければ 275 行目で全部を積みます（`ng generate --help` のとき）。

📄 `angular-cli/packages/angular/cli/src/command-builder/schematics-command-module.ts` L310–330 （▶ の行: 310–312, 317, 323–324）

```ts
310 ▶     const value =
311 ▶       getSchematicCollections(workspace?.getCli()) ??
312 ▶       getSchematicCollections(globalConfiguration.getCli());
313 │     if (value) {
314 │       return value;
315 │     }
316 │ 
317 ▶     return new Set([DEFAULT_SCHEMATICS_COLLECTION]);
318 │   }
319 │ 
320 │   protected parseSchematicInfo(
321 │     schematic: string | undefined,
322 │   ): [collectionName: string | undefined, schematicName: string | undefined] {
323 ▶     if (schematic?.includes(':')) {
324 ▶       const [collectionName, schematicName] = schematic.split(':', 2);
325 │ 
326 │       return [collectionName, schematicName];
327 │     }
328 │ 
329 │     return [undefined, schematic];
330 │   }
```

どのコレクションを見るかは 310〜312 行目、`angular.json` の `cli.schematicCollections`（ワークスペース → グローバル設定の順）で、どちらにも無ければ 317 行目の `DEFAULT_SCHEMATICS_COLLECTION`、つまり `@schematics/angular` です。323〜324 行目、`@angular/material:navigation` のように `:` を含めると、コレクション名を直接指定できます。

📄 `angular-cli/packages/angular/cli/src/commands/generate/cli.ts` L82–100 （▶ の行: 83, 87–88, 90, 92, 94）

```ts
 82 │       localYargs = localYargs.command({
 83 ▶         command: await this.generateCommandString(collectionName, schematicName, options),
 84 │         // When 'describe' is set to false, it results in a hidden command.
 85 │         describe: hidden === true ? false : typeof description === 'string' ? description : '',
 86 │         deprecated: xDeprecated === true || typeof xDeprecated === 'string' ? xDeprecated : false,
 87 ▶         aliases: Array.isArray(schematicAliases)
 88 ▶           ? await this.generateCommandAliasesStrings(collectionName, schematicAliases)
 89 │           : undefined,
 90 ▶         builder: (localYargs) => this.addSchemaOptionsToCommand(localYargs, options).strict(),
 91 │         handler: (options) =>
 92 ▶           this.handler({
 93 │             ...options,
 94 ▶             schematic: `${collectionName}:${schematicName}`,
 95 │           } as ArgumentsCamelCase<
 96 │             SchematicsCommandArgs & {
 97 │               schematic: string;
 98 │             }
 99 │           >),
100 │       });
```

📄 `angular-cli/packages/angular/cli/src/commands/generate/cli.ts` L106–126 （▶ の行: 107, 109, 115）

```ts
106 │   async run(options: Options<GenerateCommandArgs> & OtherOptions): Promise<number | void> {
107 ▶     const { dryRun, schematic, defaults, force, interactive, ...schematicOptions } = options;
108 │ 
109 ▶     const [collectionName, schematicName] = this.parseSchematicInfo(schematic);
110 │ 
111 │     if (!collectionName || !schematicName) {
112 │       throw new CommandModuleError('A collection and schematic is required during execution.');
113 │     }
114 │ 
115 ▶     return this.runSchematic({
116 │       collectionName,
117 │       schematicName,
118 │       schematicOptions,
119 │       executionOptions: {
120 │         dryRun,
121 │         defaults,
122 │         force,
123 │         interactive,
124 │       },
125 │     });
126 │   }
```

90 行目、`schema.json` のプロパティが yargs のオプション（`--style` など）になります。87〜89 行目で別名 `c` もサブコマンド名に足されます。94 行目、どの名前で呼ばれても `schematic` には `"@schematics/angular:component"` が入り、107 行目で CLI 自身のオプション（`dryRun`・`force` など）とそれ以外（schematic に渡すもの）に分けて、115 行目の `runSchematic` へ進みます。

## 2. collection.json から factory と schema を見つける

📄 `angular-cli/packages/angular_devkit/schematics/tools/node-module-engine-host.ts` L54–72 （▶ の行: 56–57, 59, 65, 67）

```ts
54 │     // Try to resolve as a package
55 │     try {
56 ▶       const packageJsonPath = require.resolve(`${name}/package.json`, resolveOptions);
57 ▶       const { schematics } = require(packageJsonPath);
58 │ 
59 ▶       if (!schematics || typeof schematics !== 'string') {
60 │         throw new NodePackageDoesNotSupportSchematics(name);
61 │       }
62 │ 
63 │       // If this is a relative path to the collection, then create the collection
64 │       // path in relation to the package path
65 ▶       if (schematics.startsWith('.')) {
66 │         const packageDirectory = dirname(packageJsonPath);
67 ▶         collectionPath = resolve(packageDirectory, schematics);
68 │       }
69 │       // Otherwise treat this as a package, and recurse to find the collection path
70 │       else {
71 │         collectionPath = this.resolve(schematics, packageJsonPath, references);
72 │       }
```

56 行目、コレクション名をパッケージ名として `@schematics/angular/package.json` を探し、57 行目でその `schematics` フィールドを読みます。`@schematics/angular` では `"./collection.json"` なので、65〜67 行目でパッケージのフォルダから解いたパスがコレクションです。この「`package.json` に `schematics` があれば schematics のパッケージ」という決まりは、[第 16 回](16-cli-add-update.md)の `ng add` でも使われます。

📄 `angular-cli/packages/schematics/angular/collection.json` L32–37 （▶ の行: 33–34, 36）

```json
32 │     "component": {
33 ▶       "aliases": ["c"],
34 ▶       "factory": "./component",
35 │       "description": "Create an Angular component.",
36 ▶       "schema": "./component/schema.json"
37 │     },
```

📄 `angular-cli/packages/angular_devkit/schematics/tools/file-system-engine-host-base.ts` L202–213 （▶ の行: 203, 205–206）

```ts
202 │     // Resolve aliases first.
203 ▶     for (const schematicName of Object.keys(collection.schematics)) {
204 │       const schematicDescription = collection.schematics[schematicName];
205 ▶       if (schematicDescription.aliases && schematicDescription.aliases.indexOf(name) != -1) {
206 ▶         name = schematicName;
207 │         break;
208 │       }
209 │     }
210 │ 
211 │     if (!(name in collection.schematics)) {
212 │       return null;
213 │     }
```

📄 `angular-cli/packages/angular_devkit/schematics/tools/file-system-engine-host-base.ts` L249–265 （▶ の行: 253, 255, 263–265）

```ts
249 │     let schema = partialDesc.schema;
250 │     let schemaJson: JsonObject | undefined = undefined;
251 │     if (schema) {
252 │       if (!isAbsolute(schema)) {
253 ▶         schema = join(collectionPath, schema);
254 │       }
255 ▶       schemaJson = readJsonFile(schema) as JsonObject;
256 │     }
257 │ 
258 │     // The schematic path is used to resolve URLs.
259 │     // We should be able to just do `dirname(resolvedRef.path)` but for compatibility with
260 │     // Bazel under Windows this directory needs to be resolved from the collection instead.
261 │     // This is needed because on Bazel under Windows the data files (such as the collection or
262 │     // url files) are not in the same place as the compiled JS.
263 ▶     const maybePath = join(collectionPath, partialDesc.factory);
264 ▶     const path =
265 ▶       existsSync(maybePath) && statSync(maybePath).isDirectory() ? maybePath : dirname(maybePath);
```

203〜208 行目、まず別名を本名に直します（`c` → `component`。collection.json の 33 行目）。255 行目、36 行目の `schema` を読んで `schemaJson` にします（1 節の 90 行目でオプションになったのはこれ）。263〜265 行目、34 行目の `factory`（`"./component"`）がフォルダならそれを、この schematic の `path` にします。[第 14 回](14-schematics-rules.md)の 3 節で見た `url('./files')` は、この `path` から解かれるので `component/files/` を指します。

## 3. 引数を整える：angular.json → $default → 検証

📄 `angular-cli/packages/angular/cli/src/command-builder/schematics-command-module.ts` L122–134 （▶ の行: 123, 130–131）

```ts
122 │       schemaValidation: true,
123 ▶       optionTransforms: [
124 │         // Add configuration file defaults
125 │         async (schematic, current) => {
126 │           const projectName =
127 │             typeof current?.project === 'string' ? current.project : this.getProjectName();
128 │ 
129 │           return {
130 ▶             ...(await getSchematicDefaults(schematic.collection.name, schematic.name, projectName)),
131 ▶             ...current,
132 │           };
133 │         },
134 │       ],
```

📄 `angular-cli/packages/angular/cli/src/command-builder/schematics-command-module.ts` L138–145 （▶ の行: 138, 140, 142–144）

```ts
138 ▶     workflow.registry.addPostTransform(schema.transforms.addUndefinedDefaults);
139 │     workflow.registry.useXDeprecatedProvider((msg) => logger.warn(msg));
140 ▶     workflow.registry.addSmartDefaultProvider('projectName', () => this.getProjectName());
141 │ 
142 ▶     const workingDir = devkitNormalize(relative(this.context.root, process.cwd()));
143 ▶     workflow.registry.addSmartDefaultProvider('workingDirectory', () =>
144 ▶       workingDir === '' ? undefined : workingDir,
145 │     );
```

📄 `angular-cli/packages/schematics/angular/component/schema.json` L9–33 （▶ の行: 12–13, 21–22, 28–30, 32）

```json
 9 │     "path": {
10 │       "type": "string",
11 │       "format": "path",
12 ▶       "$default": {
13 ▶         "$source": "workingDirectory"
14 │       },
15 │       "description": "The path where the component files should be created, relative to the current workspace. If not provided, a folder with the same name as the component will be created in the project's `src/app` directory.",
16 │       "visible": false
17 │     },
18 │     "project": {
19 │       "type": "string",
20 │       "description": "The name of the project where the component should be added. If not specified, the CLI will determine the project from the current directory.",
21 ▶       "$default": {
22 ▶         "$source": "projectName"
23 │       }
24 │     },
25 │     "name": {
26 │       "type": "string",
27 │       "description": "The name for the new component. This will be used to create the component's class, template, and stylesheet files. For example, if you provide `my-component`, the files will be named `my-component.ts`, `my-component.html`, and `my-component.css`.",
28 ▶       "$default": {
29 ▶         "$source": "argv",
30 ▶         "index": 0
31 │       },
32 ▶       "x-prompt": "What name would you like to use for the component?"
33 │     },
```

📄 `angular-cli/packages/angular_devkit/schematics/tools/schema-option-transform.ts` L24–52 （▶ の行: 31, 37–38, 41–42）

```ts
24 │ export function validateOptionsWithSchema(registry: schema.SchemaRegistry) {
25 │   return <T extends {} | null>(
26 │     schematic: FileSystemSchematicDescription,
27 │     options: T,
28 │     context?: FileSystemSchematicContext,
29 │   ): Observable<T> => {
30 │     // Prevent a schematic from changing the options object by making a copy of it.
31 ▶     options = structuredClone(options);
32 │ 
33 │     const withPrompts = context ? context.interactive : true;
34 │ 
35 │     if (schematic.schema && schematic.schemaJson) {
36 │       // Make a deep copy of options.
37 ▶       return from(registry.compile(schematic.schemaJson)).pipe(
38 ▶         mergeMap((validator) => validator(options, { withPrompts })),
39 │         first(),
40 │         map((result) => {
41 ▶           if (!result.success) {
42 ▶             throw new InvalidInputOptions(options, result.errors || []);
43 │           }
44 │ 
45 │           return options;
46 │         }),
47 │       );
48 │     }
49 │ 
50 │     return observableOf(options);
51 │   };
52 │ }
```

1. **angular.json の既定値（123〜133 行目）**

   130 行目、`angular.json` の `schematics["@schematics/angular:component"]` を読み、131 行目で**コマンドラインの値を後ろに**重ねます。このサイトの `angular.json` には `"style": "scss"` が書いてあるので、ここで `ng g c` を打つと `.scss` ができます。
2. **$default（schema.json 12〜13・21〜22・28〜30 行目）**

   `path` は `workingDirectory`、`project` は `projectName`、`name` は位置引数の 0 番目から。前の 2 つの値は 140・142〜145 行目で登録した関数が返します（ワークスペースの根で打てば `workingDirectory` は `undefined`）。
3. **default（138 行目）**

   `addUndefinedDefaults` が、値の無いプロパティに `schema.json` の `default` を入れます。
4. **プロンプト（32 行目）**

   `name` を打たなかったときは `x-prompt` で聞かれます。
5. **検証（schema-option-transform.ts 37〜43 行目）**

   31 行目で複製してから、37〜38 行目で `schema.json` を検証関数にして通し、42 行目、合わなければ `InvalidInputOptions`。`--style foo` のような値はここで止まり、Rule は 1 行も動きません。

📄 `angular-cli/packages/schematics/angular/component/schema.json` L87–117 （▶ の行: 90–91, 94–95, 99–100, 106, 111, 116）

```json
 87 │     "style": {
 88 │       "description": "Specify the type of stylesheet to be created for the component, or `none` to skip creating a stylesheet.",
 89 │       "type": "string",
 90 ▶       "default": "css",
 91 ▶       "enum": ["css", "scss", "sass", "less", "none"],
 92 │       "x-user-analytics": "ep.ng_style"
 93 │     },
 94 ▶     "type": {
 95 ▶       "type": "string",
 96 │       "description": "Append a custom type to the component's filename. For example, if you set the type to `container`, the file will be named `my-component.container.ts`."
 97 │     },
 98 │     "addTypeToClassName": {
 99 ▶       "type": "boolean",
100 ▶       "default": true,
101 │       "description": "When true, the 'type' option will be appended to the generated class name. When false, only the file name will include the type."
102 │     },
103 │     "skipTests": {
104 │       "type": "boolean",
105 │       "description": "Skip the generation of unit test files `spec.ts`.",
106 ▶       "default": false
107 │     },
108 │     "flat": {
109 │       "type": "boolean",
110 │       "description": "Create the component files directly in the project's `src/app` directory instead of creating a new folder for them.",
111 ▶       "default": false
112 │     },
113 │     "skipImport": {
114 │       "type": "boolean",
115 │       "description": "Do not automatically import the new component into its closest NgModule.",
116 ▶       "default": false
117 │     },
```

デモで使うオプションの定義です。90〜91 行目、`style` の既定は `css`。94〜97 行目、`type` には**既定値がありません**（6 節で効いてきます）。99〜100 行目の `addTypeToClassName` は既定 `true`、106・111・116 行目の `skipTests`・`flat`・`skipImport` は既定 `false`。`standalone` の既定（`true`）は、同じファイルの別の箇所を[standalone シリーズの概観](../standalone/01-standalone.md)で引用しています。

## 4. component/index.ts：ワークスペースとパス

📄 `angular-cli/packages/schematics/angular/utility/project.ts` L20–41 （▶ の行: 31–33, 36, 39）

```ts
20 │ export function createProjectSchematic<S extends { project: string }>(
21 │   factory: (
22 │     options: S,
23 │     projectContext: {
24 │       project: ProjectDefinition;
25 │       workspace: WorkspaceDefinition;
26 │       tree: Tree;
27 │       context: SchematicContext;
28 │     },
29 │   ) => Rule | Promise<Rule>,
30 │ ): (options: S) => Rule {
31 ▶   return (options) => async (tree, context) => {
32 ▶     const workspace = await getWorkspace(tree);
33 ▶     const project = workspace.projects.get(options.project);
34 │ 
35 │     if (!project) {
36 ▶       throw new SchematicsException(`Project "${options.project}" does not exist.`);
37 │     }
38 │ 
39 ▶     return factory(options, { project, workspace, tree, context });
40 │   };
41 │ }
```

component の Rule は `createProjectSchematic` で包まれています。31 行目、オプションを受け取って Rule を返し、その Rule の中で 32 行目、**Tree から**`angular.json` を読みます（ディスクではなく Tree なので、同じ実行の中で前の Rule が書き換えた内容も見えます）。33 行目でプロジェクトを取り、無ければ 36 行目で例外、あれば 39 行目で本体を呼びます。

📄 `angular-cli/packages/schematics/angular/component/index.ts` L43–66 （▶ の行: 45–46, 49, 51, 53–57, 59, 61–63, 65）

```ts
43 │ const componentSchematic: RuleFactory<ComponentOptions> = createProjectSchematic(
44 │   (options, { project, tree }) => {
45 ▶     if (options.path === undefined) {
46 ▶       options.path = buildDefaultPath(project);
47 │     }
48 │ 
49 ▶     options.module = findModuleFromOptions(tree, options);
50 │     // Schematic templates require a defined type value
51 ▶     options.type ??= '';
52 │ 
53 ▶     const parsedPath = parseName(options.path, options.name);
54 ▶     options.name = parsedPath.name;
55 ▶     options.path = parsedPath.path;
56 ▶     options.selector =
57 ▶       options.selector || buildSelector(options, (project && project.prefix) || '');
58 │ 
59 ▶     validateHtmlSelector(options.selector);
60 │ 
61 ▶     const classifiedName =
62 ▶       strings.classify(options.name) +
63 ▶       (options.addTypeToClassName && options.type ? strings.classify(options.type) : '');
64 │     validateClassName(classifiedName);
65 ▶     const zoneless = isZonelessApp(project);
66 │ 
```

📄 `angular-cli/packages/schematics/angular/utility/workspace.ts` L118–124 （▶ の行: 119, 121, 123）

```ts
118 │ export function buildDefaultPath(project: workspaces.ProjectDefinition): string {
119 ▶   const root = project.sourceRoot ? `/${project.sourceRoot}/` : `/${project.root}/src/`;
120 │   const projectDirName =
121 ▶     project.extensions['projectType'] === ProjectType.Application ? 'app' : 'lib';
122 │ 
123 ▶   return `${root}${projectDirName}`;
124 │ }
```

📄 `angular-cli/packages/schematics/angular/utility/parse-name.ts` L16–24 （▶ の行: 17–18）

```ts
16 │ export function parseName(path: string, name: string): Location {
17 ▶   const nameWithoutPath = basename(normalize(name));
18 ▶   const namePath = dirname(join(normalize(path), name));
19 │ 
20 │   return {
21 │     name: nameWithoutPath,
22 │     path: normalize('/' + namePath),
23 │   };
24 │ }
```

📄 `angular-cli/packages/schematics/angular/component/index.ts` L32–41 （▶ の行: 33, 35, 37）

```ts
32 │ function buildSelector(options: ComponentOptions, projectPrefix: string) {
33 ▶   let selector = strings.dasherize(options.name);
34 │   if (options.prefix) {
35 ▶     selector = `${options.prefix}-${selector}`;
36 │   } else if (options.prefix === undefined && projectPrefix) {
37 ▶     selector = `${projectPrefix}-${selector}`;
38 │   }
39 │ 
40 │   return selector;
41 │ }
```

1. **置き場所の既定（45〜47 行目）**

   3 節で `path` が入らなかったら `buildDefaultPath`。119 行目、`sourceRoot`（このサイトは `src`）から `/src/`、121 行目、アプリなら `app`。→ `/src/app`。
2. **NgModule を探す（49 行目）**

   `findModuleFromOptions`。standalone なら探さない（7 節）。
3. **type を空文字に（51 行目）**

   テンプレートの式 `<%= type ? … %>` とファイル名の `__type@dasherize__` が `undefined` で落ちないようにします（[第 14 回](14-schematics-rules.md)の 4 節）。
4. **name を分ける（53〜55 行目）**

   `parseName` の 17〜18 行目、`admin/UserCard` なら `name` は `UserCard`、`path` は `/src/app/admin`。
5. **セレクタ（56〜59 行目）**

   33 行目で `dasherize(name)`、37 行目でプロジェクトの `prefix`（このサイトは `app`）を前に付けて `app-user-card`。59 行目で HTML のセレクタとして正しいか検査。
6. **クラス名（61〜64 行目）**

   `classify(name)` に、`type` があって `addTypeToClassName` なら `classify(type)` を足す。`UserCard` か `UserCardComponent`。
7. **zoneless か（65 行目）**

   プロジェクトの設定から判定し、spec のテンプレートで `await fixture.whenStable()` と `fixture.detectChanges()` を選ぶのに使います。

## 5. component/index.ts：テンプレートの Tree

📄 `angular-cli/packages/schematics/angular/component/index.ts` L67–92 （▶ の行: 67–76, 78–79, 81, 83, 86, 91）

```ts
67 ▶     const skipStyleFile = options.inlineStyle || options.style === Style.None;
68 ▶     const templateSource = apply(url('./files'), [
69 ▶       options.skipTests ? filter((path) => !path.endsWith('.spec.ts.template')) : noop(),
70 ▶       skipStyleFile ? filter((path) => !path.endsWith('.__style__.template')) : noop(),
71 ▶       options.inlineTemplate ? filter((path) => !path.endsWith('.html.template')) : noop(),
72 ▶       applyTemplates({
73 ▶         ...strings,
74 ▶         'if-flat': (s: string) => (options.flat ? '' : s),
75 ▶         'ngext': options.ngHtml ? '.ng' : '',
76 ▶         ...options,
77 │         // Add a new variable for the classified name, conditionally including the type
78 ▶         classifiedName,
79 ▶         zoneless,
80 │       }),
81 ▶       !options.type
82 │         ? forEach(((file) => {
83 ▶             return file.path.includes('..')
84 │               ? {
85 │                   content: file.content,
86 ▶                   path: file.path.replace('..', '.'),
87 │                 }
88 │               : file;
89 │           }) as FileOperator)
90 │         : noop(),
91 ▶       move(parsedPath.path),
92 │     ]);
```

これが [第 14 回](14-schematics-rules.md)の `apply(url(...), [...])` の実物です。68 行目の `url('./files')` は `component/files/` の 4 ファイルを全部「作成」として持つ Tree になり、そこに 5 つの Rule を順にかけます。

📄 `angular-cli/packages/schematics/angular/component/files/ の中身`

```
__name@dasherize@if-flat__/
  __name@dasherize__.__type@dasherize__.__style__.template
  __name@dasherize__.__type@dasherize__.spec.ts.template
  __name@dasherize__.__type@dasherize__.ts.template
  __name@dasherize__.__type@dasherize____ngext__.html.template
```

1. **filter（69〜71 行目）**

   **置き換える前の名前**で落とします。`--skip-tests` は `.spec.ts.template`、`--inline-style` か `--style none`（67 行目）は `.__style__.template`、`--inline-template` は `.html.template`。条件が偽のときは `noop()`。
2. **applyTemplates（72〜80 行目）**

   73 行目で `dasherize` などの関数、74 行目で `if-flat`（`--flat` なら空文字を返す）、75 行目で `ngext`（`--ng-html` なら `.ng`）、76 行目で全オプション、78〜79 行目でクラス名と zoneless を 1 つのオブジェクトにして渡します。ファイル名の `__style__` は 76 行目の `options.style`（`css` など）になります。
3. **'..' を '.' に（81〜90 行目）**

   `type` が空だと `user-card.__type@dasherize__.ts` は `user-card..ts` になるので、86 行目で最初の `..` を `.` に直します。
4. **move（91 行目）**

   4 節の `parsedPath.path`（`/src/app`）の下へ動かします。

📄 `angular-cli/packages/schematics/angular/component/files/__name@dasherize@if-flat__/__name@dasherize__.__type@dasherize__.ts.template` L1–23 （▶ の行: 1, 3, 5–8, 14, 20, 22）

```
 1 ▶ import { <% if (changeDetection !== 'OnPush') { %>ChangeDetectionStrategy, <% } %>Component<% if (!!viewEncapsulation) { %>, ViewEncapsulation<% } %> } from '@angular/core';
 2 │ 
 3 ▶ @Component({<% if (changeDetection !== 'OnPush') { %>
 4 │   changeDetection: ChangeDetectionStrategy.<%= changeDetection %>,<% } %><% if (!!viewEncapsulation) { %>
 5 ▶   encapsulation: ViewEncapsulation.<%= viewEncapsulation %>,<% } %><% if (standalone) { %>
 6 ▶   imports: [],<% } %><% if (!skipSelector) { %>
 7 ▶   selector: '<%= selector %>',<% } %><% if (!standalone) { %>
 8 ▶   standalone: false,<% } %><% if (inlineStyle) { %>
 9 │   styles: `<% if (displayBlock) { %>
10 │     :host {
11 │       display: block;
12 │     }
13 │   <% } %>`,<% } else if (style !== 'none') { %>
14 ▶   styleUrl: './<%= dasherize(name) %><%= type ? '.' + dasherize(type): '' %>.<%= style %>',<% } %><% if (inlineTemplate) { %>
15 │   template: `
16 │     <p>
17 │       <%= dasherize(name) %> works!
18 │     </p>
19 │   `,<% } else { %>
20 ▶   templateUrl: './<%= dasherize(name) %><%= type ? '.' + dasherize(type): '' %><%= ngext %>.html',<% } %>
21 │ })
22 ▶ export <% if (exportDefault) { %>default <% } %>class <%= classifiedName %> {
23 │ }
```
*中身のテンプレート。&lt;% %&gt; の if 文は core の template が JavaScript としてそのまま実行する（第 14 回）*

中身も見ておきます。3〜4 行目、`changeDetection` が `OnPush`（schema.json の既定）のときは何も書きません。v22 では OnPush が既定だからです（1 行目の import からも外れます）。5〜6 行目、standalone なら `imports: []`、7〜8 行目、standalone でなければ `standalone: false` を書きます。14 行目の `styleUrl` と 20 行目の `templateUrl` は、ファイル名と同じ規則（`type` があれば `.` + `type`）で組み立てます。22 行目のクラス名は 4 節の `classifiedName` です。

## 6. v20 以降のファイル名：.component が付かない理由

3 節の schema.json 94〜97 行目のとおり `type` に既定値が無いので、4 節の 51 行目で空文字になり、5 節の 86 行目で `user-card..ts` → `user-card.ts`、クラス名は 4 節の 61〜63 行目で `UserCard` です。以前の名前（`user-card.component.ts` と `UserCardComponent`）にしたければ `--type component`、ファイル名だけにしたければ加えて `--add-type-to-class-name=false`（schema.json 99〜100 行目）。angular-cli のリポジトリの履歴では、`.component` を付けない生成は 20.0.0 に入った変更（「generate components without a `.component` extension/type」）で、`addTypeToClassName` は 21.0.0 で加わりました。

> **🧪 DEMO — 作られるファイルのパス**
>
> index.ts の 45〜92 行目のうち「パスを決める部分」だけを写した自作の関数です（実物は `@angular-devkit/schematics` を使いますが、ブラウザには入れていません）。プロジェクトはこのサイトと同じ `sourceRoot: "src"`・`prefix: "app"` のアプリとし、`style` は schema.json の既定 `css` から始めます（このサイトの angular.json の `scss` は反映していません）。このサイトのリポジトリで `ng g c … --dry-run` を実行した出力と、パスが一致することを確かめてあります。
>
> parseName → name `user-card`・path `/src/app`／ selector `app-user-card`／クラス名 `UserCard`
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/schematics-component)

## 7. standalone でないときだけ：NgModule の declarations に足す

📄 `angular-cli/packages/schematics/angular/component/index.ts` L94–104 （▶ の行: 94–95, 99）

```ts
 94 ▶     return chain([
 95 ▶       addDeclarationToNgModule({
 96 │         type: 'component',
 97 │         ...options,
 98 │       }),
 99 ▶       mergeWith(templateSource),
100 │     ]);
101 │   },
102 │ );
103 │ 
104 │ export default componentSchematic;
```

94 行目、最後に返す Rule は 2 つの `chain` です。95 行目の `addDeclarationToNgModule` が先、99 行目の `mergeWith(templateSource)` が後。

📄 `angular-cli/packages/schematics/angular/utility/find-module.ts` L31–39 （▶ の行: 32–33, 36–37, 39）

```ts
31 │ export function findModuleFromOptions(host: Tree, options: ModuleOptions): Path | undefined {
32 ▶   if (options.standalone || options.skipImport) {
33 ▶     return undefined;
34 │   }
35 │ 
36 ▶   if (!options.module) {
37 ▶     const pathToCheck = (options.path || '') + '/' + options.name;
38 │ 
39 ▶     return normalize(findModule(host, pathToCheck, options.moduleExt, options.routingModuleExt));
```

📄 `angular-cli/packages/schematics/angular/utility/find-module.ts` L98–116 （▶ の行: 99–100, 106–108, 115）

```ts
 98 │   while (dir) {
 99 ▶     const allMatches = dir.subfiles.filter((p) => moduleExtensions.some((m) => p.endsWith(m)));
100 ▶     const filteredMatches = allMatches.filter(
101 │       (p) => !routingModuleExtensions.some((m) => p.endsWith(m)),
102 │     );
103 │ 
104 │     foundRoutingModule = foundRoutingModule || allMatches.length !== filteredMatches.length;
105 │ 
106 ▶     if (filteredMatches.length == 1) {
107 ▶       return join(dir.path, filteredMatches[0]);
108 ▶     } else if (filteredMatches.length > 1) {
109 │       throw new Error(
110 │         `More than one module matches. Use the '--skip-import' option to skip importing ` +
111 │           'the component into the closest module or use the module option to specify a module.',
112 │       );
113 │     }
114 │ 
115 ▶     dir = dir.parent;
116 │   }
```

📄 `angular-cli/packages/schematics/angular/utility/add-declaration-to-ng-module.ts` L27–63 （▶ の行: 30–31, 37, 39, 45, 48, 54, 57, 60）

```ts
27 │ export function addDeclarationToNgModule(options: DeclarationToNgModuleOptions): Rule {
28 │   return (host: Tree) => {
29 │     const modulePath = options.module;
30 ▶     if (options.skipImport || options.standalone || !modulePath) {
31 ▶       return host;
32 │     }
33 │ 
34 │     const typeSeparator = options.typeSeparator ?? '.';
35 │ 
36 │     const sourceText = host.readText(modulePath);
37 ▶     const source = ts.createSourceFile(modulePath, sourceText, ts.ScriptTarget.Latest, true);
38 │ 
39 ▶     const filePath =
40 │       `/${options.path}/` +
41 │       (options.flat ? '' : strings.dasherize(options.name) + '/') +
42 │       strings.dasherize(options.name) +
43 │       (options.type ? typeSeparator + strings.dasherize(options.type) : '');
44 │ 
45 ▶     const importPath = buildRelativePath(modulePath, filePath);
46 │     const classifiedName =
47 │       strings.classify(options.name) + (options.type ? strings.classify(options.type) : '');
48 ▶     const changes = addDeclarationToModule(source, modulePath, classifiedName, importPath);
49 │ 
50 │     if (options.export) {
51 │       changes.push(...addSymbolToNgModuleMetadata(source, modulePath, 'exports', classifiedName));
52 │     }
53 │ 
54 ▶     const recorder = host.beginUpdate(modulePath);
55 │     for (const change of changes) {
56 │       if (change instanceof InsertChange) {
57 ▶         recorder.insertLeft(change.pos, change.toAdd);
58 │       }
59 │     }
60 ▶     host.commitUpdate(recorder);
61 │ 
62 │     return host;
63 │   };
```

1. **standalone なら何もしない（find-module.ts 32〜34 行目、add-declaration 30〜32 行目）**

   既定の `standalone: true` では 4 節の 49 行目で `module` は `undefined`、95 行目の Rule も 31 行目で Tree をそのまま返します。**既定の `ng g c` は既存のファイルを 1 つも書き換えません**。
2. **近い NgModule を探す（99〜115 行目）**

   `--standalone=false` のとき、作る場所のフォルダから親へ上りながら、99 行目で `-module.ts` か `.module.ts` で終わるファイルを探します。100〜102 行目でルーティング用を除き、106〜107 行目、1 つならそれ、108 行目、2 つ以上なら例外（`--module` か `--skip-import` を求める）。
3. **TypeScript で読む（37 行目）**

   `ts.createSourceFile` で NgModule のファイルを AST にします。
4. **足す場所を求める（39〜48 行目）**

   39〜43 行目で生成するファイルのパス、45 行目で NgModule からの相対 import パス、48 行目の `addDeclarationToModule`（`ast-utils.ts`）が `declarations` の配列と import 文の挿入位置を `InsertChange` の列で返します。
5. **UpdateRecorder で挿入（54〜60 行目）**

   [第 13 回](13-schematics.md)の 3 節の `beginUpdate` → `insertLeft` → `commitUpdate`。位置は元の文字列での位置なので、2 か所に挿入してもずれません。

## 8. 実行と --dry-run の出力

📄 `angular-cli/packages/angular/cli/src/command-builder/schematics-command-module.ts` L346–381 （▶ の行: 346, 349, 352, 359–360, 363–364, 366, 369, 372）

```ts
346 ▶     const { unsubscribe, files } = subscribeToWorkflow(workflow, logger);
347 │ 
348 │     try {
349 ▶       await workflow
350 │         .execute({
351 │           collection: collectionName,
352 ▶           schematic: schematicName,
353 │           options: schematicOptions,
354 │           logger,
355 │           allowPrivate: this.allowPrivateSchematics,
356 │         })
357 │         .toPromise();
358 │ 
359 ▶       if (!files.size) {
360 ▶         logger.info('Nothing to be done.');
361 │       }
362 │ 
363 ▶       if (executionOptions.dryRun) {
364 ▶         logger.warn(`\nNOTE: The "--dry-run" option means no changes were made.`);
365 │ 
366 ▶         return 0;
367 │       }
368 │ 
369 ▶       if (files.size) {
370 │         // Note: we could use a task executor to format the files but this is simpler.
371 │         try {
372 ▶           await formatFiles(this.context.root, files);
373 │         } catch (error) {
374 │           assertIsError(error);
375 │ 
376 │           logger.warn(
377 │             `WARNING: Formatting of files failed with the following error: ${error.message}`,
378 │           );
379 │         }
380 │       }
381 │ 
```

この直前で 3 節の設定を登録した `NodeWorkflow` を作り、346 行目で報告の購読を始め、349〜357 行目で `workflow.execute`。その中で何が起きるか（`HostTree` → sink）は[第 13 回](13-schematics.md)のとおりです。363〜366 行目、`--dry-run` なら最後に NOTE を出して終わります。そうでなければ 369〜372 行目、書いたファイルをワークスペースに prettier があれば整形します（`formatFiles`）。このサイトのリポジトリで `ng g c user-card --dry-run` を実行した出力は次のとおりでした（`style` は angular.json の `scss`）。

📄 `ng g c user-card --dry-run の出力（このサイトのリポジトリ、@angular/cli 22.1.7）`

```
CREATE src/app/user-card/user-card.scss (0 bytes)
CREATE src/app/user-card/user-card.spec.ts (547 bytes)
CREATE src/app/user-card/user-card.ts (197 bytes)
CREATE src/app/user-card/user-card.html (24 bytes)

NOTE: The "--dry-run" option means no changes were made.
```

この 4 行は、`DryRunSink` が「書けるはず」と判定した Action の一覧です（13 回の 9 節）。`UPDATE` の行が無いことで、既存のファイル（NgModule）に触れていないことも分かります。scss が 0 bytes なのは、スタイルのテンプレートが `displayBlock` のときしか中身を出さないからです。

## ここまでの呼び出し

- 👤 `ng g c user-card` — ターミナル
  - `GenerateCommandModule.builder` — commands/generate/cli.ts L43 — *getSchematicsToRegister で component だけ登録*
  - `GenerateCommandModule.run` — generate/cli.ts L106
    - `runSchematic({ collectionName: '@schematics/angular', schematicName: 'component' })` — schematics-command-module.ts L332
      - `workflow.execute` → `engine.createCollection` → `createSchematic('component')` — workflow/base.ts L156-160
        - `NodeModulesEngineHost.resolve` → `createSchematicDescription` — node-module-engine-host.ts L54 / file-system-engine-host-base.ts L198
        - `getSchematicDefaults` → `$default` / `default` → `validateOptionsWithSchema` — schematics-command-module.ts L130 / schema-option-transform.ts L24
        - `componentSchematic(options)` — schematics/angular/component/index.ts L43
          - `getWorkspace(tree)` → `buildDefaultPath` → `parseName` — utility/project.ts L32 / workspace.ts L118 / parse-name.ts L16
          - `chain([addDeclarationToNgModule, mergeWith(apply(url('./files'), [...]))])` — index.ts L94
      - `DryRunSink → エラー判定 → HostSink` — workflow/base.ts L117 — *第 13 回*

## 聞かれそうな質問

**Q. standalone は既定ですか？NgModule に勝手に足されますか？**

既定です（`schema.json` の `standalone` が `default: true`）。その場合 `findModuleFromOptions` は 32〜34 行目で `undefined` を返し、`addDeclarationToNgModule` は 30〜32 行目で何もしません。NgModule の `declarations` に足されるのは `--standalone=false` のときだけで、近い `*-module.ts` / `*.module.ts` を 99〜115 行目で親フォルダへ上りながら探します。

**Q. v20 からファイル名に `.component` が付かなくなったのはなぜですか？戻せますか？**

`type` に既定値が無く（schema.json 94〜97 行目）、index.ts 51 行目で空文字になり、86 行目で `..` が `.` に直るからです。`--type component` を付けるか、`angular.json` の `schematics["@schematics/angular:component"]` に `"type": "component"` を書けば、3 節の 130 行目の既定値として毎回入ります（このサイトの `"style": "scss"` と同じ仕組み）。

**Q. `--dry-run` の `CREATE … (547 bytes)` は何の大きさですか？**

テンプレートを置き換えたあとの中身のバイト数です。`DryRunSink` が報告する create の Action の `content` の長さを、CLI がそのまま出しています（[第 13 回](13-schematics.md)の 9 節）。`--dry-run` でも Rule は全部走っているので、本番で書かれる中身と同じ大きさです。

**Q. 同じ名前で 2 回 `ng g c` すると？**

99 行目の `mergeWith` が、テンプレートの Tree の create を既にあるファイルに重ねようとして `MergeConflictException` になり、「`A merge conflicted on path …`」で終わります。ディスクは変わりません（第 13 回の 5 節）。`merge` には「中身がまったく同じなら何もしない」規則もありますが、このサイトのリポジトリと同じ設定の作業フォルダで生成直後にもう 1 回打つと、`user-card.spec.ts` で衝突しました。1 回目の書き込みのあとに 369〜372 行目の `formatFiles` が prettier で整形したので、テンプレートの出力とディスクの中身が一致しなくなったためです。

**Q. どこで打っても `src/app` の下にできますか？**

いいえ。schema.json 12〜13 行目の `path` の既定は `workingDirectory` で、142〜145 行目のとおり今いるフォルダのワークスペースからの相対パスです。`src/app/admin` で打てば `src/app/admin/user-card/` にできます。ワークスペースの根で打ったときだけ `undefined` になり、index.ts 45〜47 行目の `buildDefaultPath` で `/src/app` になります。

## 読み終えて

- `ng generate` のサブコマンドは collection.json の schematic から作られる。`c` は collection.json の別名。
- 引数は angular.json の既定値 → `$default` → `default` の順に埋まり、`schema.json` で検証されてから Rule に渡る。
- index.ts はワークスペースを Tree から読み、パス・セレクタ・クラス名を決め、`apply(url('./files'), [filter, applyTemplates, '..' の修正, move])` の Tree を `mergeWith` する。
- ファイル名は `files/` の名前の置き換えで決まる。`type` に既定が無いので v20 以降は `user-card.ts` / `UserCard`。
- standalone（既定）なら既存のファイルには触れない。NgModule のときだけ AST で位置を求め、`UpdateRecorder` で `declarations` に足す。

---

← 前: [Rule の組み立て：chain・apply・url・template・mergeWith](14-schematics-rules.md)  
次: [ng add と ng update：パッケージを入れて、migrations を走らせる](16-cli-add-update.md) →
