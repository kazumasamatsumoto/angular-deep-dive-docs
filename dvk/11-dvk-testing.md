[目次](../README.md) › [@angular-devkit の内側](README.md) › 第 11 回 / 全 12 回

# テストの道具：SchematicTestRunner と TestingArchitectHost

> schematics/testing/\*・tools/node-modules-test-engine-host.ts・architect/testing/\*：schematic を手元で走らせる SchematicTestRunner（sink も post task も無い）、本番との違い、builder を試す TestingArchitectHost、テンプレートを写した一時フォルダの TestProjectHost。

angular/angular-cli · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-testing)

---

この章で分かること：schematic の spec で使う `SchematicTestRunner` が、本番の `NodeWorkflow`（[第 8 回](08-dvk-workflow.md)）と比べて何を省き、何が違うか。builder の spec で使う `TestingArchitectHost` が `WorkspaceNodeModulesArchitectHost`（[前の回](10-dvk-architect.md)）の代わりに何を返すか。古い統合テスト用の `TestProjectHost` が作る一時フォルダです。spec で通ったのに本番で違う、が起きる所を記録で見ます。

読む対象は `packages/angular_devkit/schematics/testing/schematic-test-runner.ts`・`schematics/tools/node-modules-test-engine-host.ts`、`packages/angular_devkit/architect/testing/` の `testing-architect-host.ts`・`test-project-host.ts` です（../angular-cli、44129f66a3）。`@schematics/angular` の spec がこの runner をどう使うかは[tsurge の章](../mig/04-mig-tsurge.md)の終わり（signal-input-migration を runner で走らせる）にも例があります。

1. [1. パスと文字列](01-dvk-path.md)
2. [2. 仮想ファイルシステムの host](02-dvk-host.md)
3. [3. JSON schema の検査](03-dvk-schema.md)
4. [4. angular.json の読み書き](04-dvk-workspace.md)
5. [5. logger と小さな道具](05-dvk-logger.md)
6. [6. Tree](06-dvk-tree.md)
7. [7. エンジンと規則](07-dvk-engine.md)
8. [8. ワークフローと engine host](08-dvk-workflow.md)
9. [9. architect の jobs](09-dvk-jobs.md)
10. [10. Architect が builder を呼ぶまで](10-dvk-architect.md)
11. **11. テストの道具**（この章）
12. [12. spec と issue](12-dvk-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> DEMO の記録は、ローカルの `@angular/cli` 22.2.7 が持つ `@angular-devkit/schematics` 22.2.7 と `@angular-devkit/architect` 0.2202.7 の testing を Node から直接使って取りました。走らせたのは[第 7 回](07-dvk-engine.md)の collection（`outer` と private の `inner`。この回のために logger に 1 行ずつ書く行を足した）、[第 8 回](08-dvk-workflow.md)の collection、[第 10 回](10-dvk-architect.md)の builder のパッケージです。`testing/` の 2 つのフォルダと `node-modules-test-engine-host.ts` は 44129f66a3 と v22.2.7 で同じです。

## 1. SchematicTestRunner が作るもの

📄 `angular-cli/packages/angular_devkit/schematics/testing/schematic-test-runner.ts` L45–75 （▶ の行: 51–53, 55–56, 59, 61, 63–64, 66–67, 69–72, 74）

```ts
45 │ export class SchematicTestRunner {
46 │   private _engineHost: NodeModulesTestEngineHost;
47 │   private _engine: SchematicEngine<{}, {}>;
48 │   private _collection: Collection<{}, {}>;
49 │   private _logger: logging.Logger;
50 │ 
51 ▶   constructor(
52 ▶     private _collectionName: string,
53 ▶     collectionPath: string,
54 │   ) {
55 ▶     this._engineHost = new NodeModulesTestEngineHost([
56 ▶       // Leverage the specified collection path as an additional base for resolving other
57 │       // collections by name. This is useful in e.g. pnpm workspaces where `@angular-devkit/schematics`
58 │       // doesn't necessarily have access to e.g. `@schematics/angular`.
59 ▶       collectionPath,
60 │     ]);
61 ▶     this._engine = new SchematicEngine(this._engineHost);
62 │ 
63 ▶     this._engineHost.registerCollection(_collectionName, collectionPath);
64 ▶     this._logger = new logging.Logger('test');
65 │ 
66 ▶     const registry = new schema.CoreSchemaRegistry(formats.standardFormats);
67 ▶     registry.addPostTransform(schema.transforms.addUndefinedDefaults);
68 │ 
69 ▶     this._engineHost.registerOptionsTransform(validateOptionsWithSchema(registry));
70 ▶     this._engineHost.registerTaskExecutor(BuiltinTaskExecutor.NodePackage);
71 ▶     this._engineHost.registerTaskExecutor(BuiltinTaskExecutor.RepositoryInitializer);
72 ▶     this._engineHost.registerTaskExecutor(BuiltinTaskExecutor.RunSchematic);
73 │ 
74 ▶     this._collection = this._engine.createCollection(this._collectionName);
75 │   }
```

1. **55〜60 行目：テスト用の engine host**

   2 つ目の引数の collection のパスを、別の collection を名前で探すときの場所にも使います。56〜58 行目のコメントのとおり pnpm のワークスペースのためで、2982c01655（2025-01、`ensure collections can be resolved via test runner in pnpm workspaces`）が足しました。
2. **61 行目：workflow 無しのエンジン**

   [第 7 回](07-dvk-engine.md)の `SchematicEngine` を、2 つ目の引数（workflow）無しで作ります。sink も lifeCycle も `executePostTasks` もありません。
3. **66〜69 行目：schema の検査と default**

   [第 8 回](08-dvk-workflow.md)の `NodeWorkflow` の `schemaValidation: true` と同じ形を、いつも登録します。
4. **70〜72 行目：組み込みの task 3 つだけ**

   自作の task の実行係は登録できません（足す公開の関数が無い）。

📄 `angular-cli/packages/angular_devkit/schematics/tools/node-modules-test-engine-host.ts` L13–47 （▶ の行: 14–15, 18–19, 21, 25–26, 29–30, 33–36, 38, 44–45）

```ts
13 │ /**
14 ▶  * An EngineHost that uses a registry to super seed locations of collection.json files, but
15 ▶  * revert back to using node modules resolution. This is done for testing.
16 │  */
17 │ export class NodeModulesTestEngineHost extends NodeModulesEngineHost {
18 ▶   #collections = new Map<string, string>();
19 ▶   #tasks: TaskConfiguration[] = [];
20 │ 
21 ▶   get tasks(): TaskConfiguration[] {
22 │     return this.#tasks;
23 │   }
24 │ 
25 ▶   clearTasks(): void {
26 ▶     this.#tasks = [];
27 │   }
28 │ 
29 ▶   registerCollection(name: string, path: string): void {
30 ▶     this.#collections.set(name, path);
31 │   }
32 │ 
33 ▶   override transformContext(context: FileSystemSchematicContext): FileSystemSchematicContext {
34 ▶     const oldAddTask = context.addTask.bind(context);
35 ▶     context.addTask = (task: TaskConfigurationGenerator, dependencies?: TaskId[]) => {
36 ▶       this.#tasks.push(task.toConfiguration());
37 │ 
38 ▶       return oldAddTask(task, dependencies);
39 │     };
40 │ 
41 │     return context;
42 │   }
43 │ 
44 ▶   protected override _resolveCollectionPath(name: string, requester?: string): string {
45 ▶     return this.#collections.get(name) ?? super._resolveCollectionPath(name, requester);
46 │   }
47 │ }
```

テスト用の engine host は 2 つだけ足します。44〜46 行目、`registerCollection` で覚えた名前を先に引き、無ければ普通の探し方（[第 8 回](08-dvk-workflow.md)の 5 節）です。33〜42 行目、`addTask` を包んで、予約された task を 36 行目で書き留めます（[第 7 回](07-dvk-engine.md)の 4 節の 271 行目の差し替えの機会を使う）。この `transformContext` は基底クラスのものを呼ばないので、`registerContextTransform` で足した変換は効きません。14 行目のコメントの「super seed」は supersede の書き損じです。

## 2. runSchematic：Tree を返すだけ、task は走らない

📄 `angular-cli/packages/angular_devkit/schematics/testing/schematic-test-runner.ts` L83–103 （▶ の行: 83–84, 87–88, 96–98, 100, 102）

```ts
 83 ▶   get tasks(): TaskConfiguration[] {
 84 ▶     return [...this._engineHost.tasks];
 85 │   }
 86 │ 
 87 ▶   registerCollection(collectionName: string, collectionPath: string): void {
 88 ▶     this._engineHost.registerCollection(collectionName, collectionPath);
 89 │   }
 90 │ 
 91 │   async runSchematic<SchematicSchemaT extends object>(
 92 │     schematicName: string,
 93 │     opts?: SchematicSchemaT,
 94 │     tree?: Tree,
 95 │   ): Promise<UnitTestTree> {
 96 ▶     const schematic = this._collection.createSchematic(schematicName, true);
 97 ▶     const host = observableOf(tree || new HostTree());
 98 ▶     this._engineHost.clearTasks();
 99 │ 
100 ▶     const newTree = await lastValueFrom(schematic.call(opts || {}, host, { logger: this._logger }));
101 │ 
102 ▶     return new UnitTestTree(newTree);
103 │   }
```

📄 `angular-cli/packages/angular_devkit/schematics/testing/schematic-test-runner.ts` L27–43 （▶ の行: 27–28, 30, 35, 37–38, 41）

```ts
27 ▶ export class UnitTestTree extends DelegateTree {
28 ▶   get files(): string[] {
29 │     const result: string[] = [];
30 ▶     this.visit((path) => result.push(path));
31 │ 
32 │     return result;
33 │   }
34 │ 
35 ▶   readContent(path: string): string {
36 │     const buffer = this.read(path);
37 ▶     if (buffer === null) {
38 ▶       return '';
39 │     }
40 │ 
41 ▶     return buffer.toString();
42 │   }
43 │ }
```

96 行目、`createSchematic(name, true)` なので private の schematic も直接呼べます。97 行目、Tree を渡さなければ空の `HostTree`、98 行目で前の実行の task の記録を消し、100 行目で `schematic.call` の最後の Tree を待ち、102 行目で `UnitTestTree`（`files` と `readContent` を足した Tree）に包んで返します。ディスクには何も書きません。

記録の「第 7 回の collection を runSchematic」です。

| 記録 | 結果 | 第 7・8 回との違い |
| --- | --- | --- |
| `runSchematic('outer', {})` | 「Unregistered task "log" in schematic "outer".」 | 第 7 回の記録は自作の task `log` を登録して走らせた。runner には 70〜72 行目の 3 つしか無い |
| （private の `_engineHost` に `log` を足して）同じ | `tree.files` は `["/inner.txt","/src/scoped.txt","/src/app/user-card/user-card.ts"]`、logger は `[outer] info: outer: name=UserCard` と `[inner] warn: inner: 呼ばれた` | `{}` でも schema の default の `UserCard` が入った（69 行目）。素のエンジンの第 7 回は入らなかった |
| `runner.tasks` | `["A","B","C (A に依存)","D","E (inner)"]`、「log の task が実行された」は 1 度も出ない | 予約した順のまま。第 7 回の実行の順（D → B → A → C → E）とは違う |
| `readContent('/nope')` | `""` | 37〜39 行目：無いファイルも空文字（`read` の `null` と区別できない） |
| `runSchematic('inner', …)` | `["/inner.txt"]`、`runner.tasks` は `["E (inner)"]` だけ | private を直接呼べる。98 行目で前の task は消える |

記録の「task は予約だけ・schema の検査」では、[第 8 回](08-dvk-workflow.md)の `install` の `runner.tasks` は `[{"name":"node-package","options":{"command":"install","quiet":true,"hideOutput":true,"allowScripts":false}}]` で npm は走らず、`post` の `RunSchematicTask` も予約の記録だけで `ops` は走りませんでした。`ops` に `{ count: 'x' }` を渡すと第 8 回と同じ `InvalidInputOptions` です。spec で task を確かめるときは、走った結果ではなく `runner.tasks` の中身を見ることになります。

## 3. 渡した Tree と本番のディスクの違い

`@schematics/angular` の spec は、`runSchematic('workspace')` → `runSchematic('application', …, appTree)` のように前の Tree を次に渡してワークスペースを作ります（component/index\_spec.ts の 54〜56 行目）。渡した Tree の中のファイルは、本番の「ディスクにあるファイル」と同じには見えません。

| 記録の「Tree に既にあるファイル」 | runner | 本番（第 8 回の記録） |
| --- | --- | --- |
| `/existing.txt` を create した Tree を渡し、Rule がもう一度 create | Rule の中で `FileAlreadyExistException`「Path "/existing.txt" already exist.」 | Rule は通り、sink の検査が `error(alreadyExist)` を報告して `UnsuccessfulWorkflowExecution` |
| 空の Tree で `ops`（`/existing.txt` を overwrite） | Rule の中で「Path "/existing.txt" does not exist.」 | ディスクにあれば update |

渡した Tree のファイルは、その Tree の記録（[第 6 回](06-dvk-tree.md)の CordHost のメモリ）にある「作成」なので、2 回目の create は Tree の中で止まります。本番のファイルはディスク（Tree の下の読むだけの host）にあるので、create は通って sink が止めます。例外のクラスも、止まる場所も違います。

## 4. runExternalSchematic と callRule

📄 `angular-cli/packages/angular_devkit/schematics/testing/schematic-test-runner.ts` L105–125 （▶ の行: 111–114, 116, 121–122, 124）

```ts
105 │   async runExternalSchematic<SchematicSchemaT extends object>(
106 │     collectionName: string,
107 │     schematicName: string,
108 │     opts?: SchematicSchemaT,
109 │     tree?: Tree,
110 │   ): Promise<UnitTestTree> {
111 ▶     const externalCollection = this._engine.createCollection(collectionName);
112 ▶     const schematic = externalCollection.createSchematic(schematicName, true);
113 ▶     const host = observableOf(tree || new HostTree());
114 ▶     this._engineHost.clearTasks();
115 │ 
116 ▶     const newTree = await lastValueFrom(schematic.call(opts || {}, host, { logger: this._logger }));
117 │ 
118 │     return new UnitTestTree(newTree);
119 │   }
120 │ 
121 ▶   callRule(rule: Rule, tree: Tree, parentContext?: Partial<SchematicContext>): Observable<Tree> {
122 ▶     const context = this._engine.createContext({} as Schematic<{}, {}>, parentContext);
123 │ 
124 ▶     return callRule(rule, observableOf(tree), context);
125 │   }
```

111 行目、別の collection は `requester` 無しで作るので、1 節の 59 行目の場所と `registerCollection` の名前から探します。121〜125 行目の `callRule` は、Rule を 1 つだけ試す道具で、122 行目で `{}` を schematic とみなして context を作ります。

記録の「runner.callRule」では、`callRule(rule, tree)` は動きましたが、3 つ目の引数に `{ logger }` を渡すと「TypeError: Cannot read properties of undefined (reading 'name')」でした。[第 7 回](07-dvk-engine.md)の `createContext` の 262 行目が、親の logger があると `schematic.description.name` で子の logger を作るのに、`{}` には `description` が無いからです。同じ理由で、callRule の中の `url('./files')` も「reading 'path'」で止まりました（schematic の場所が無い）。main も同じです。

## 5. TestingArchitectHost：builder と target を手で足す host

📄 `angular-cli/packages/angular_devkit/architect/testing/testing-architect-host.ts` L13–38 （▶ の行: 14–16, 25–27, 30, 33–34, 36–37）

```ts
13 │ export class TestingArchitectHost implements ArchitectHost {
14 ▶   private _builderImportMap = new Map<string, Builder>();
15 ▶   private _builderMap = new Map<string, BuilderInfo>();
16 ▶   private _targetMap = new Map<string, { builderName: string; options: json.JsonObject }>();
17 │ 
18 │   /**
19 │    * Can provide a backend host, in case of integration tests.
20 │    * @param workspaceRoot The workspace root to use.
21 │    * @param currentDirectory The current directory to use.
22 │    * @param _backendHost A host to defer calls that aren't resolved here.
23 │    */
24 │   constructor(
25 ▶     public workspaceRoot = '',
26 ▶     public currentDirectory: string = workspaceRoot,
27 ▶     private _backendHost: ArchitectHost | null = null,
28 │   ) {}
29 │ 
30 ▶   addBuilder(
31 │     builderName: string,
32 │     builder: Builder,
33 ▶     description = 'Testing only builder.',
34 ▶     optionSchema: json.schema.JsonSchema = { type: 'object' },
35 │   ): void {
36 ▶     this._builderImportMap.set(builderName, builder);
37 ▶     this._builderMap.set(builderName, { builderName, description, optionSchema });
38 │   }
```

📄 `angular-cli/packages/angular_devkit/architect/testing/testing-architect-host.ts` L71–99 （▶ の行: 72–75, 78, 82, 88, 90, 95, 98）

```ts
71 │   async getBuilderNameForTarget(target: Target): Promise<string | null> {
72 ▶     const name = targetStringFromTarget(target);
73 ▶     const maybeTarget = this._targetMap.get(name);
74 ▶     if (!maybeTarget) {
75 ▶       return this._backendHost?.getBuilderNameForTarget(target) ?? null;
76 │     }
77 │ 
78 ▶     return maybeTarget.builderName;
79 │   }
80 │ 
81 │   /**
82 ▶    * Resolve a builder. This needs to return a string which will be used in a dynamic `import()`
83 │    * clause. This should throw if no builder can be found. The dynamic import will throw if
84 │    * it is unsupported.
85 │    * @param builderName The name of the builder to be used.
86 │    * @returns All the info needed for the builder itself.
87 │    */
88 ▶   async resolveBuilder(builderName: string): Promise<BuilderInfo | null> {
89 │     return (
90 ▶       this._builderMap.get(builderName) || (this._backendHost?.resolveBuilder(builderName) ?? null)
91 │     );
92 │   }
93 │ 
94 │   async getCurrentDirectory(): Promise<string> {
95 ▶     return this.currentDirectory;
96 │   }
97 │   async getWorkspaceRoot(): Promise<string> {
98 ▶     return this.workspaceRoot;
99 │   }
```

📄 `angular-cli/packages/angular_devkit/architect/testing/testing-architect-host.ts` L101–119 （▶ の行: 102–103, 105, 108, 112, 116–117）

```ts
101 │   async getOptionsForTarget(target: Target): Promise<json.JsonObject | null> {
102 ▶     const name = targetStringFromTarget(target);
103 ▶     const maybeTarget = this._targetMap.get(name);
104 │     if (!maybeTarget) {
105 ▶       return this._backendHost?.getOptionsForTarget(target) ?? null;
106 │     }
107 │ 
108 ▶     return maybeTarget.options;
109 │   }
110 │ 
111 │   async getProjectMetadata(target: Target | string): Promise<json.JsonObject | null> {
112 ▶     return this._backendHost?.getProjectMetadata(target as string) ?? null;
113 │   }
114 │ 
115 │   async loadBuilder(info: BuilderInfo): Promise<Builder | null> {
116 ▶     return (
117 ▶       this._builderImportMap.get(info.builderName) || (this._backendHost?.loadBuilder(info) ?? null)
118 │     );
119 │   }
```

[前の回](10-dvk-architect.md)の 1 節の 8 つの関数を、3 つの `Map` で答えます。27 行目の `_backendHost` を渡せば、見つからないものをそちらに回します。違いは次のとおりで、記録の「TestingArchitectHost に builder と target を足す」で確かめました。

| 関数 | TestingArchitectHost | WorkspaceNodeModulesArchitectHost |
| --- | --- | --- |
| `getOptionsForTarget` | 102〜108 行目：target の文字列（configuration まで）で 1 つ引くだけ。記録で `p:build` は `a: 2`、`p:build:prod` は `a: 3`、足していない `p:build:dev` は「Job name "{p:build:dev}" does not exist.」 | options に configuration を重ね、`defaultConfiguration` とカンマ区切りも扱う |
| `getProjectMetadata` | 112 行目：backend が無ければ `null`。記録で builder の中から呼ぶと「Invalid target: "p".」 | `root`・`sourceRoot`・`prefix` と拡張のキー |
| `loadBuilder` | 116〜117 行目：足した builder をそのまま返す。`BuilderSymbol` を確かめない | `import()` して `BuilderSymbol` を確かめる |
| info の `builderName` | 37 行目：`addBuilder` の名前そのもの（`pkg:echo`） | `:` の右だけ（`echo`） |
| workspaceRoot・currentDirectory | コンストラクタの文字列（記録は `/ws` と `/ws/sub`） | root と `process.cwd()` |

最後から 2 つ目の違いのため、[前の回](10-dvk-architect.md)の 3 節の「別のパッケージの同じ名前の builder を取り違える」は、`TestingArchitectHost` の上の spec（index\_spec.ts）では起きません。82〜87 行目の JSDoc は `ArchitectHost` の写しで、「文字列を返す」と言いながら `BuilderInfo` を返します。

📄 `angular-cli/packages/angular_devkit/architect/testing/testing-architect-host.ts` L39–69 （▶ の行: 40–41, 49–50, 56, 58–60, 62–64, 68）

```ts
39 │   async addBuilderFromPackage(packageName: string): Promise<void> {
40 ▶     const packageJson = await import(packageName + '/package.json');
41 ▶     if (!('builders' in packageJson)) {
42 │       throw new Error('Invalid package.json, builders key not found.');
43 │     }
44 │ 
45 │     if (!packageJson.name) {
46 │       throw new Error('Invalid package name');
47 │     }
48 │ 
49 ▶     const builderJsonPath = packageName + '/' + packageJson['builders'];
50 ▶     const builderJson = await import(builderJsonPath);
51 │     const builders = builderJson['builders'];
52 │     if (!builders) {
53 │       throw new Error('Invalid builders.json, builders key not found.');
54 │     }
55 │ 
56 ▶     for (const builderName of Object.keys(builders)) {
57 │       const b = builders[builderName];
58 ▶       // TODO: remove this check as v1 is not supported anymore.
59 ▶       if (!b.implementation) {
60 ▶         continue;
61 │       }
62 ▶       const handler = (await import(builderJsonPath + '/../' + b.implementation)).default;
63 ▶       const optionsSchema = await import(builderJsonPath + '/../' + b.schema);
64 ▶       this.addBuilder(`${packageJson.name}:${builderName}`, handler, b.description, optionsSchema);
65 │     }
66 │   }
67 │   addTarget(target: Target, builderName: string, options: json.JsonObject = {}): void {
68 ▶     this._targetMap.set(targetStringFromTarget(target), { builderName, options });
69 │   }
```

`addBuilderFromPackage` は package.json の `builders` から全部を足します。記録で[前の回](10-dvk-architect.md)の `demo-builders` を読ませると、`echo`・`slow` などは足され、`scheduleBuilder('demo-builders:echo')` の `builderName` は `"demo-builders:echo"` でした。58〜61 行目の「v1 の形は飛ばす」の `implementation` の確かめで、2024-04 の 6d9a06a437 が入れた別名（`"again": "demo-builders:echo"`）も黙って飛ばされ、`again` は足されませんでした。パッケージの外を指す `outside`（`"../escape.js"`）は、前の回の 195 行目のような確かめが無いので足されました。40 行目の `import` はこのファイルの場所から探すので、ワークスペースではなく testing のパッケージから見える場所のパッケージだけを読めます（記録は `NODE_PATH` で見せた）。

## 6. TestProjectHost：テンプレートを写した一時フォルダ

📄 `angular-cli/packages/angular_devkit/architect/testing/test-project-host.ts` L35–60 （▶ の行: 35–36, 38, 42, 47–48, 54–55）

```ts
35 ▶ /**
36 ▶  * @deprecated
37 │  */
38 ▶ export class TestProjectHost extends NodeJsSyncHost {
39 │   private _currentRoot: Path | null = null;
40 │   private _scopedSyncHost: virtualFs.SyncDelegateHost<Stats> | null = null;
41 │ 
42 ▶   constructor(protected _templateRoot: Path) {
43 │     super();
44 │   }
45 │ 
46 │   root(): Path {
47 ▶     if (this._currentRoot === null) {
48 ▶       throw new Error('TestProjectHost must be initialized before being used.');
49 │     }
50 │ 
51 │     return this._currentRoot;
52 │   }
53 │ 
54 ▶   scopedSync(): virtualFs.SyncDelegateHost<Stats> {
55 ▶     if (this._currentRoot === null || this._scopedSyncHost === null) {
56 │       throw new Error('TestProjectHost must be initialized before being used.');
57 │     }
58 │ 
59 │     return this._scopedSyncHost;
60 │   }
```

📄 `angular-cli/packages/angular_devkit/architect/testing/test-project-host.ts` L62–96 （▶ の行: 63–64, 70, 72, 78, 81–83, 87, 90, 92）

```ts
62 │   initialize(): Observable<void> {
63 ▶     const recursiveList = (path: Path): Observable<Path> =>
64 ▶       this.list(path).pipe(
65 │         // Emit each fragment individually.
66 │         concatMap((fragments) => from(fragments)),
67 │         // Join the path with fragment.
68 │         map((fragment) => join(path, fragment)),
69 │         // Emit directory content paths instead of the directory path.
70 ▶         mergeMap((path) =>
71 │           this.isDirectory(path).pipe(
72 ▶             concatMap((isDir) => (isDir ? recursiveList(path) : of(path))),
73 │           ),
74 │         ),
75 │       );
76 │ 
77 │     // Find a unique folder that we can write to use as current root.
78 ▶     return this.findUniqueFolderPath().pipe(
79 │       // Save the path and create a scoped host for it.
80 │       tap((newFolderPath) => {
81 ▶         this._currentRoot = newFolderPath;
82 ▶         this._scopedSyncHost = new virtualFs.SyncDelegateHost(
83 ▶           new virtualFs.ScopedHost(this, this.root()),
84 │         );
85 │       }),
86 │       // List all files in root.
87 ▶       concatMap(() => recursiveList(this._templateRoot)),
88 │       // Copy them over to the current root.
89 │       concatMap((from) => {
90 ▶         const to = join(this.root(), relative(this._templateRoot, from));
91 │ 
92 ▶         return this.read(from).pipe(concatMap((buffer) => this.write(to, buffer)));
93 │       }),
94 │       map(() => {}),
95 │     );
96 │   }
```

📄 `angular-cli/packages/angular_devkit/architect/testing/test-project-host.ts` L98–127 （▶ の行: 99–100, 105–108, 110–111, 116, 120, 125）

```ts
 98 │   restore(): Observable<void> {
 99 ▶     if (this._currentRoot === null) {
100 ▶       return EMPTY;
101 │     }
102 │ 
103 │     // Delete the current root and clear the variables.
104 │     // Wait 50ms and retry up to 10 times, to give time for file locks to clear.
105 ▶     return this.exists(this.root()).pipe(
106 ▶       delay(50),
107 ▶       concatMap((exists) => (exists ? this.delete(this.root()) : EMPTY)),
108 ▶       retry(10),
109 │       finalize(() => {
110 ▶         this._currentRoot = null;
111 ▶         this._scopedSyncHost = null;
112 │       }),
113 │     );
114 │   }
115 │ 
116 ▶   writeMultipleFiles(files: { [path: string]: string | ArrayBufferLike | Buffer }): void {
117 │     Object.keys(files).forEach((fileName) => {
118 │       let content = files[fileName];
119 │       if (typeof content == 'string') {
120 ▶         content = new TextEncoder().encode(content).buffer;
121 │       } else if (content instanceof Buffer) {
122 │         content = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
123 │       }
124 │ 
125 ▶       this.scopedSync().write(normalize(fileName), content as ArrayBufferLike);
126 │     });
127 │   }
```

📄 `angular-cli/packages/angular_devkit/architect/testing/test-project-host.ts` L142–164 （▶ の行: 143, 145, 156–159, 162）

```ts
142 │   fileMatchExists(dir: string, regex: RegExp): PathFragment | undefined {
143 ▶     const [fileName] = this.scopedSync()
144 │       .list(normalize(dir))
145 ▶       .filter((name) => name.match(regex));
146 │ 
147 │     return fileName || undefined;
148 │   }
149 │ 
150 │   copyFile(from: string, to: string): void {
151 │     const content = this.scopedSync().read(normalize(from));
152 │     this.scopedSync().write(normalize(to), content);
153 │   }
154 │ 
155 │   private findUniqueFolderPath(): Observable<Path> {
156 ▶     // 11 character alphanumeric string.
157 ▶     const randomString = Math.random().toString(36).slice(2);
158 ▶     const newFolderName = `test-project-host-${basename(this._templateRoot)}-${randomString}`;
159 ▶     const newFolderPath = join(dirname(this._templateRoot), newFolderName);
160 │ 
161 │     return this.exists(newFolderPath).pipe(
162 ▶       concatMap((exists) => (exists ? this.findUniqueFolderPath() : of(newFolderPath))),
163 │     );
164 │   }
```

35〜37 行目のとおり `@deprecated`（2018-12 の 3dafcf416f から）で、44129f66a3 で使っているのは build\_angular の古い spec の 2 つ（`browser/specs/lazy-module_spec.ts`・`ng-packagr/works_spec.ts`）だけです。`initialize()` は 78 行目で**テンプレートの隣**（159 行目の `dirname(this._templateRoot)`）に新しいフォルダを決め、87〜93 行目で全部のファイルを写し、`restore()` は 105〜108 行目で 50ms 待ってから消し、失敗したら 10 回まで試します。

記録の「TestProjectHost の一時フォルダ」では、`initialize()` の前の `root()` は 48 行目の例外、後は `<work>/testing/test-project-host-tpl-coljxz15fga` で、`writeMultipleFiles`・`replaceInFile` は写しだけを変え、テンプレートの `main.ts` は元のままでした。`restore()` の後はフォルダが消え、`root()` はまた例外です。156 行目のコメントは「11 文字」ですが、157 行目の `Math.random().toString(36).slice(2)` を 2000 回試すと長さは 9〜12 文字でした（記録の 1 回は 11）。名前の重なりは 161〜163 行目で確かめるので、動きには困りません。`core/node/testing` にも一時フォルダの host（`TempScopedNodeJsSyncHost`、OS の一時フォルダの下）がありますが、44129f66a3 の packages の中に使う所はありません。

> **🧪 DEMO — テストの道具を Node で直接動かした記録**
>
> ボタンは、`SchematicTestRunner`・`TestingArchitectHost`・`TestProjectHost` を Node から使った記録を再生します。`logger` は `runner.logger` に流れた行です。パスは記録用の場所を `<work>` にしました。
>
> ボタンを押すと記録が出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-testing)

## ここまでの呼び出し（runSchematic と TestingArchitectHost）

- 👤 `new SchematicTestRunner(name, collectionPath)` — schematic-test-runner.ts L51
  - `new NodeModulesTestEngineHost([collectionPath])` → `new SchematicEngine(host)` — L55・L61 — *workflow 無し*
  - `registerOptionsTransform(validateOptionsWithSchema(registry))` — L69
- 👤 `runner.runSchematic(name, opts, tree?)` — L91
  - `collection.createSchematic(name, true)` → `schematic.call(opts, of(tree))` — L96・L100 — *sink も post task も無し*
    - `context.addTask` → `#tasks.push` — node-modules-test-engine-host.ts L35・L36 — *実行はしない*
  - `new UnitTestTree(newTree)` — L102
- 👤 `new Architect(new TestingArchitectHost(root, cwd), registry)` — testing-architect-host.ts L24
  - `addBuilder(name, createBuilder(fn))`・`addTarget(target, name, options)` — L30・L67
  - `scheduleTarget` → `getOptionsForTarget` → `loadBuilder` — L101・L115 — *configuration は重ねない*

## テストと直し方

| ファイル | 使い方（行） | 固めている約束 |
| --- | --- | --- |
| （無し） | `schematics/testing/`・`architect/testing/`・`node-modules-test-engine-host.ts` の spec | 道具そのものの spec はどこにも無い。使う側の spec が間接に確かめるだけ |
| `packages/schematics/angular/component/index_spec.ts` | `Component Schematic`（15）の `beforeEach`（54〜56）で `runSchematic('workspace')` → `'application'`、各 it で `readContent` | 2・3 節の使い方。`packages` の中で `SchematicTestRunner` を使う spec のファイルは 37（ほかに schematics\_cli の blank のテンプレートの spec の雛形） |
| `packages/angular_devkit/architect/src/index_spec.ts` | `architect`（19）の `beforeEach`（33〜62）で `addBuilder`・`addTarget` | 5 節の使い方 |

📄 `走らせたコマンド（2026-11-26）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular_devkit/architect:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular_devkit/schematics/tools:test --nocache_test_results --test_output=all
（結果は下の段落）
```

手元の bazel で `architect:test` は 68 specs・0 failures、`schematics/tools:test` は 31 specs・0 failures・2 pending、runner を使う側の例として `//packages/schematics/angular:test` を `--test_arg=--filter=Component Schematic` で絞ると 50 specs・0 failures でした。

直すとしたら、4 節の `callRule` は 122 行目の `{} as Schematic` の代わりに今の collection の schematic（無ければ `description: { name: 'callRule' }` を持つもの）を渡すと、logger を付けた parentContext でも動きます。道具の spec が無いので、`schematics/testing/` に schematic-test-runner\_spec.ts を作り、「parentContext に logger を渡した callRule」「`tasks` が予約の順」「private の schematic を runSchematic できる」を足すのが最初になります。5 節の別名は 58〜61 行目で文字列の項を本名に置き換えて足し、`implementation` と `schema` に前の回の 195・206 行目と同じ確かめを入れます。

## 聞かれそうな質問

**Q. schematic の spec で NodePackageInstallTask が走らないのはなぜですか？**

runner のエンジンには workflow が無く（61 行目）、`runSchematic` は Tree を返すだけで `executePostTasks` を呼ばないからです。予約は `runner.tasks`（83〜85 行目、テスト用の host の 36 行目）で確かめます。

**Q. spec では「already exist」で落ちたのに、本番の ng generate では「ERROR! … already exists.」になります。**

spec で渡した Tree のファイルは Tree の記録の中の「作成」で、2 回目の create は Rule の中で投げます。本番のファイルはディスクにあるので Rule は通り、sink の検査が報告します（3 節の表）。

**Q. spec で schema の default は入りますか？**

入ります。66〜69 行目で `addUndefinedDefaults` 付きの登録簿の検査をいつも足すからです。記録の `runSchematic('outer', {})` は `name=UserCard` でした。

**Q. TestingArchitectHost で configuration を試すには？**

`addTarget({ project, target, configuration: 'prod' }, builder, options)` のように、configuration ごとに別の target として足します。102〜108 行目は target の文字列で 1 つ引くだけで、options への重ね合わせも `defaultConfiguration` もありません。

**Q. TestProjectHost の一時フォルダはどこにできますか？**

テンプレートのフォルダの隣（159 行目）で、名前は `test-project-host-<テンプレート名>-<ランダム>`（158 行目）です。OS の一時フォルダではありません。`restore()` で消えます。

## 読み終えて

- `SchematicTestRunner` は workflow 無しのエンジンに、schema の検査と組み込みの 3 つの task を足したもの。sink も post task も無く、Tree を返すだけ。
- task は `runner.tasks` に予約の順で残るだけで走らない。自作の task は登録できない。
- 渡した Tree のファイルは「作成」の記録なので、本番の「ディスクのファイル」と止まる場所も例外も違う。`callRule` は parentContext に logger があると TypeError。
- `TestingArchitectHost` は configuration を重ねず、metadata を持たず、`BuilderSymbol` を確かめず、`builderName` にパッケージ名まで入れる。別名の builder は `addBuilderFromPackage` で飛ばされる。
- `TestProjectHost` は deprecated で、テンプレートの隣に写しを作り、`restore` で消す。

---

← 前: [Architect が builder を呼ぶまで：options・context・progress・結果](10-dvk-architect.md)  
次: [spec と issue を読む：@angular-devkit を固めているもの](12-dvk-tests-issues.md) →
