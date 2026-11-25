[目次](../README.md) › [@angular-devkit の内側](README.md) › 第 8 回 / 全 12 回

# ワークフローと engine host：sink・workflow・tools・tasks

> schematics/src/workflow/\*・sink の残り・tools/\*・tasks/\*：BaseWorkflow と NodeWorkflow の実行の順と lifeCycle、reporter のイベントの順、schema の既定値が入る条件、collection.json を探す engine host（相対パス・node\_modules・別名・extends・名前のキャッシュ）、npm install と RunSchematicTask の task の実行。

angular/angular-cli · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-workflow)

---

この章で分かること：`ng generate` や `ng update` が作る `NodeWorkflow` が、[前の回](07-dvk-engine.md)のエンジンの前後で何をするか。lifeCycle（実行の始まりと終わりの合図）を出す順、schema の既定値が入る条件、`collection.json` を探す順（相対パス・node\_modules・別名・`extends`）、npm install を走らせる task が実際に打つコマンドです。

読む対象は `packages/angular_devkit/schematics/` の `src/workflow/`（`base.ts`・`interface.ts`）、`src/sink/` の残り、`tools/`（`workflow/node-workflow.ts`・`node-module-engine-host.ts`・`file-system-engine-host-base.ts`・`export-ref.ts`・`schema-option-transform.ts`）、`tasks/`（`node/index.ts`・`package-manager/`・`run-schematic/`）です（../angular-cli、44129f66a3）。sink が検査してから書く手順と `--dry-run` が省くものは[Tree と sink の章](../cli/13-schematics.md)、CLI が `NodeWorkflow` に渡す設定（angular.json の既定値と `$default`）と schema の検証の本体は[ng generate component の章](../cli/15-schematics-component.md)、パッケージマネージャーの選び方は[パッケージマネージャーの章](../ngx/04-ngx-package-managers.md)が読んでいます。

1. [1. パスと文字列](01-dvk-path.md)
2. [2. 仮想ファイルシステムの host](02-dvk-host.md)
3. [3. JSON schema の検査](03-dvk-schema.md)
4. [4. angular.json の読み書き](04-dvk-workspace.md)
5. [5. logger と小さな道具](05-dvk-logger.md)
6. [6. Tree](06-dvk-tree.md)
7. [7. エンジンと規則](07-dvk-engine.md)
8. **8. ワークフローと engine host**（この章）
9. [9. architect の jobs](09-dvk-jobs.md)
10. [10. Architect が builder を呼ぶまで](10-dvk-architect.md)
11. [11. テストの道具](11-dvk-testing.md)
12. [12. spec と issue](12-dvk-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> DEMO の記録は、ローカルの `@angular/cli` 22.2.7 が持つ `@angular-devkit/schematics` 22.2.7 の `NodeWorkflow` を、記録用のワークスペース（ディスクの上のフォルダ）で動かして取りました。schematic は `tools/wf/collection.json` の `ops`（create・overwrite・rename・delete を 1 つずつ）ほか 3 つ、探し方の記録は別のフォルダの `node_modules` に置いた小さなパッケージです。npm は記録用のフォルダの中だけで、依存は `file:` の 1 つ、offline で走らせました。44129f66a3 と v22.2.7 の差は、この章の範囲では `tasks/package-manager/executor.ts` の `UnknownPackageManagerException` と `schema-option-transform.ts` の `InvalidInputOptions` の `export` が外れたこと（ddd1760c1a）と、`tools/fallback-engine-host.ts` が消えたことだけです。

## 1. Workflow の約束と lifeCycle

📄 `angular-cli/packages/angular_devkit/schematics/src/workflow/interface.ts` L12–41 （▶ の行: 12–15, 18, 21–22, 25, 27–32, 38）

```ts
12 ▶ export interface RequiredWorkflowExecutionContext {
13 ▶   collection: string;
14 ▶   schematic: string;
15 ▶   options: object;
16 │ }
17 │ 
18 ▶ export interface WorkflowExecutionContext extends RequiredWorkflowExecutionContext {
19 │   debug: boolean;
20 │   logger: logging.Logger;
21 ▶   parentContext?: Readonly<WorkflowExecutionContext>;
22 ▶   allowPrivate?: boolean;
23 │ }
24 │ 
25 ▶ export interface LifeCycleEvent {
26 │   kind:
27 ▶     | 'start'
28 ▶     | 'end' // Start and end of the full workflow execution.
29 ▶     | 'workflow-start'
30 ▶     | 'workflow-end' // Start and end of a workflow execution. Can be more.
31 ▶     | 'post-tasks-start'
32 ▶     | 'post-tasks-end'; // Start and end of the post tasks execution.
33 │ }
34 │ 
35 │ export interface Workflow {
36 │   readonly context: Readonly<WorkflowExecutionContext>;
37 │ 
38 ▶   execute(
39 │     options: Partial<WorkflowExecutionContext> & RequiredWorkflowExecutionContext,
40 │   ): Observable<void>;
41 │ }
```

12〜16 行目、`execute` に必ず渡すのは collection・schematic・options の 3 つです。21 行目の `parentContext` は、実行の中から別の実行を始めたとき（3 節）の親で、22 行目の `allowPrivate` は private の schematic を呼んでよいかです。25〜33 行目の lifeCycle は 6 種類で、28 行目のコメントのとおり `start`・`end` は全体で 1 回ずつ、30 行目のとおり `workflow-start`・`workflow-end` は実行ごと（入れ子なら何回も）です。

📄 `angular-cli/packages/angular_devkit/schematics/src/workflow/base.ts` L59–91 （▶ の行: 66–67, 69, 78–82, 85, 87, 89–90）

```ts
59 │ export abstract class BaseWorkflow implements Workflow {
60 │   protected _engine: Engine<{}, {}>;
61 │   protected _engineHost: EngineHost<{}, {}>;
62 │   protected _registry: schema.CoreSchemaRegistry;
63 │ 
64 │   protected _host: virtualFs.Host;
65 │ 
66 ▶   protected _reporter: Subject<DryRunEvent> = new Subject();
67 ▶   protected _lifeCycle: Subject<LifeCycleEvent> = new Subject();
68 │ 
69 ▶   protected _context: WorkflowExecutionContext[];
70 │ 
71 │   protected _force: boolean;
72 │   protected _dryRun: boolean;
73 │ 
74 │   constructor(options: BaseWorkflowOptions) {
75 │     this._host = options.host;
76 │     this._engineHost = options.engineHost;
77 │ 
78 ▶     if (options.registry) {
79 ▶       this._registry = options.registry;
80 ▶     } else {
81 ▶       this._registry = new schema.CoreSchemaRegistry(standardFormats);
82 ▶       this._registry.addPostTransform(schema.transforms.addUndefinedDefaults);
83 │     }
84 │ 
85 ▶     this._engine = new SchematicEngine(this._engineHost, this);
86 │ 
87 ▶     this._context = [];
88 │ 
89 ▶     this._force = options.force || false;
90 ▶     this._dryRun = options.dryRun || false;
91 │   }
```

66〜67 行目、reporter と lifeCycle はただの `Subject` です。78〜83 行目、schema の登録簿（[第 3 回](03-dvk-schema.md)）を渡さなければ自分で作り、82 行目で「値の無いプロパティに schema の default を入れる」変換を足します。**登録簿を渡したときは足しません**。85 行目で[前の回](07-dvk-engine.md)の `SchematicEngine` を、自分（`this`）を workflow として作ります。

## 2. execute の前と後：context の積み下ろし

📄 `angular-cli/packages/angular_devkit/schematics/src/workflow/base.ts` L146–173 （▶ の行: 149, 151–152, 156, 158–160, 162, 164, 166, 169–170, 172）

```ts
146 │   execute(
147 │     options: Partial<WorkflowExecutionContext> & RequiredWorkflowExecutionContext,
148 │   ): Observable<void> {
149 ▶     const parentContext = this._context.at(-1);
150 │ 
151 ▶     if (!parentContext) {
152 ▶       this._lifeCycle.next({ kind: 'start' });
153 │     }
154 │ 
155 │     /** Create the collection and the schematic. */
156 ▶     const collection = this._engine.createCollection(options.collection);
157 │     // Only allow private schematics if called from the same collection.
158 ▶     const allowPrivate =
159 ▶       options.allowPrivate || (parentContext && parentContext.collection === options.collection);
160 ▶     const schematic = collection.createSchematic(options.schematic, allowPrivate);
161 │ 
162 ▶     const sinks = this._createSinks();
163 │ 
164 ▶     this._lifeCycle.next({ kind: 'workflow-start' });
165 │ 
166 ▶     const context = {
167 │       ...options,
168 │       debug: options.debug || false,
169 ▶       logger: options.logger || (parentContext && parentContext.logger) || new logging.NullLogger(),
170 ▶       parentContext,
171 │     };
172 ▶     this._context.push(context);
173 │ 
```

1. **149〜153 行目：親が無ければ `start`**

   `_context` の最後が親です。親が無いときだけ `start` を出します。
2. **156〜160 行目：collection と schematic を作る**

   エンジンの 2 つの関数（前の回の 2・3 節）です。159 行目、親と同じ collection なら private も呼べます。
3. **162・164 行目：sink を作り、`workflow-start`**

   sink の 3 つ（検査 → エラー判定 → 書く）の中身は[Tree と sink の章](../cli/13-schematics.md)の 7 節です。
4. **166〜172 行目：context を積む**

   logger は渡されたもの → 親のもの → `NullLogger` の順です。

ここまでは `execute()` を**呼んだ時点**で走ります。返る Observable を購読する前に `start` と `workflow-start` が出て、collection が無ければ例外もここで投げます。この後の Rule の実行と sink と post task は[Tree と sink の章](../cli/13-schematics.md)の 6 節です。

📄 `angular-cli/packages/angular_devkit/schematics/src/workflow/base.ts` L202–213 （▶ の行: 202–205, 207–208）

```ts
202 ▶         tap({
203 ▶           complete: () => {
204 ▶             this._lifeCycle.next({ kind: 'workflow-end' });
205 ▶             this._context.pop();
206 │ 
207 ▶             if (this._context.length == 0) {
208 ▶               this._lifeCycle.next({ kind: 'end' });
209 │             }
210 │           },
211 │         }),
212 │       );
213 │   }
```

積んだ context を下ろすのは 203 行目、`tap` の `complete` だけです。`error` のときは下ろしません。記録の「既にあるファイルを create → 同じ workflow でもう 1 回」では、1 回目が `UnsuccessfulWorkflowExecution` で終わったあと `_context` の長さは 1 のまま残り、2 回目の `execute` は 149 行目で失敗した 1 回目を親とみなしました。2 回目の lifeCycle には `start` も `end` も出ず、`workflow-start` から `workflow-end` までだけでした。CLI の画面は `end` か `post-tasks-start` で CREATE の行をまとめて出すので（[Tree と sink の章](../cli/13-schematics.md)の 9 節）、失敗のあとに同じ workflow で `--dry-run` の実行をすると、行を出す合図が来ません。`ng update` は失敗した migration で止まるので、今の CLI でこの形になる道は見つけていません。main も同じです。

## 3. NodeWorkflow：何を登録するか

📄 `angular-cli/packages/angular_devkit/schematics/tools/workflow/node-workflow.ts` L39–59 （▶ の行: 42–44, 50–52, 56–58）

```ts
39 │   constructor(hostOrRoot: virtualFs.Host | string, options: NodeWorkflowOptions & { root?: Path }) {
40 │     let host;
41 │     let root;
42 ▶     if (typeof hostOrRoot === 'string') {
43 ▶       root = normalize(hostOrRoot);
44 ▶       host = new virtualFs.ScopedHost(new NodeJsSyncHost(), root);
45 │     } else {
46 │       host = hostOrRoot;
47 │       root = options.root;
48 │     }
49 │ 
50 ▶     const engineHost =
51 ▶       options.engineHostCreator?.(options) || new NodeModulesEngineHost(options.resolvePaths);
52 ▶     super({
53 │       host,
54 │       engineHost,
55 │ 
56 ▶       force: options.force,
57 ▶       dryRun: options.dryRun,
58 ▶       registry: options.registry,
59 │     });
```

📄 `angular-cli/packages/angular_devkit/schematics/tools/workflow/node-workflow.ts` L61–84 （▶ の行: 61–66, 68, 71, 73, 75, 79–80）

```ts
61 ▶     engineHost.registerTaskExecutor(BuiltinTaskExecutor.NodePackage, {
62 ▶       allowPackageManagerOverride: true,
63 ▶       packageManager: options.packageManager,
64 ▶       force: options.packageManagerForce,
65 ▶       rootDirectory: root && getSystemPath(root),
66 ▶       registry: options.packageRegistry,
67 │     });
68 ▶     engineHost.registerTaskExecutor(BuiltinTaskExecutor.RepositoryInitializer, {
69 │       rootDirectory: root && getSystemPath(root),
70 │     });
71 ▶     engineHost.registerTaskExecutor(BuiltinTaskExecutor.RunSchematic);
72 │ 
73 ▶     if (options.optionTransforms) {
74 │       for (const transform of options.optionTransforms) {
75 ▶         engineHost.registerOptionsTransform(transform);
76 │       }
77 │     }
78 │ 
79 ▶     if (options.schemaValidation) {
80 ▶       engineHost.registerOptionsTransform(validateOptionsWithSchema(this.registry));
81 │     }
82 │ 
83 │     this._context = [];
84 │   }
```

42〜44 行目、文字列の root を受けたら、ディスクの host をそのフォルダに区切ります（[第 2 回](02-dvk-host.md)の `ScopedHost`）。51 行目の engine host は `NodeModulesEngineHost` で、CLI は `engineHostCreator` で自分の子のクラスに差し替えます。61〜71 行目で 3 つの task の実行係を登録し、73〜77 行目で渡された options の変換を順に、79〜81 行目の `schemaValidation` なら最後に schema の検証を足します。5bc3616f30（2020-09、`support schema validation in NodeWorkflow`）が足した行です。

記録の「options の変換」の 3 つで、`ops` の schema は `name`（default `"demo"`）と `count`（default `3`）です。

| NodeWorkflow の options | `ops` が受け取った options | 理由 |
| --- | --- | --- |
| `{ schemaValidation: true }` | `{"name":"demo","count":3}` | 1 節の 82 行目の変換は、80 行目の検証のときに走る |
| `{}` | `{}`（`created.txt` は `name=undefined`） | 検証が無いので 82 行目の変換も走らない |
| `{ schemaValidation: true, registry }` | `{}` | 登録簿を渡すと 82 行目が足されない。CLI は自分で足す（ng generate component の章の 3 節） |
| `schemaValidation` で `count: "x"` | （Rule は動かない） | 下の `InvalidInputOptions` |

📄 `angular-cli/packages/angular_devkit/schematics/tools/schema-option-transform.ts` L14–23 （▶ の行: 14, 18）

```ts
14 ▶ export class InvalidInputOptions<T = {}> extends schema.SchemaValidationException {
15 │   constructor(options: T, errors: schema.SchemaValidatorError[]) {
16 │     super(
17 │       errors,
18 ▶       `Schematic input does not validate against the Schema: ${JSON.stringify(options)}\nErrors:\n`,
19 │     );
20 │   }
21 │ }
22 │ 
23 │ // This can only be used in NodeJS.
```

18 行目の文に入力の JSON と、登録簿の検証の文（記録は `Data path "/count" must be number.`）が続きます。`workflow-start` の後に投げるので、記録の lifeCycle は `start`・`workflow-start` で止まり、ディスクは変わりませんでした。

## 4. reporter のイベントの順

📄 `angular-cli/packages/angular_devkit/schematics/src/sink/dryrun.ts` L14–44 （▶ の行: 15–16, 20, 24, 26, 29, 34, 36, 39）

```ts
14 │ export interface DryRunErrorEvent {
15 ▶   kind: 'error';
16 ▶   description: 'alreadyExist' | 'doesNotExist';
17 │   path: string;
18 │ }
19 │ export interface DryRunDeleteEvent {
20 ▶   kind: 'delete';
21 │   path: string;
22 │ }
23 │ export interface DryRunCreateEvent {
24 ▶   kind: 'create';
25 │   path: string;
26 ▶   content: ArrayBufferLike;
27 │ }
28 │ export interface DryRunUpdateEvent {
29 ▶   kind: 'update';
30 │   path: string;
31 │   content: ArrayBufferLike;
32 │ }
33 │ export interface DryRunRenameEvent {
34 ▶   kind: 'rename';
35 │   path: string;
36 ▶   to: string;
37 │ }
38 │ 
39 ▶ export type DryRunEvent =
40 │   | DryRunErrorEvent
41 │   | DryRunDeleteEvent
42 │   | DryRunCreateEvent
43 │   | DryRunUpdateEvent
44 │   | DryRunRenameEvent;
```

📄 `angular-cli/packages/angular_devkit/schematics/src/sink/dryrun.ts` L91–129 （▶ の行: 91, 93–94, 96, 100, 102–103, 105, 107–108, 113–115, 117, 120, 122–123, 126）

```ts
 91 ▶     this._filesToDelete.forEach((path) => {
 92 │       // Check if this is a renaming.
 93 ▶       for (const [from] of this._filesToRename) {
 94 ▶         if (from == path) {
 95 │           // The event is sent later on.
 96 ▶           return;
 97 │         }
 98 │       }
 99 │ 
100 ▶       this._subject.next({ kind: 'delete', path });
101 │     });
102 ▶     this._filesToRename.forEach(([path, to]) => {
103 ▶       this._subject.next({ kind: 'rename', path, to });
104 │     });
105 ▶     this._filesToCreate.forEach((content, path) => {
106 │       // Check if this is a renaming.
107 ▶       for (const [, to] of this._filesToRename) {
108 ▶         if (to == path) {
109 │           // The event is sent later on.
110 │           return;
111 │         }
112 │       }
113 ▶       if (
114 ▶         this._fileAlreadyExistExceptionSet.has(path) ||
115 ▶         this._fileDoesNotExistExceptionSet.has(path)
116 │       ) {
117 ▶         return;
118 │       }
119 │ 
120 ▶       this._subject.next({ kind: 'create', path, content });
121 │     });
122 ▶     this._filesToUpdate.forEach((content, path) => {
123 ▶       this._subject.next({ kind: 'update', path, content });
124 │     });
125 │ 
126 ▶     this._subject.complete();
127 │ 
128 │     return of<void>(undefined);
129 │   }
```

reporter に流れるのは 39〜44 行目の 5 種類で、`error` は 16 行目のとおり「既にある」か「無い」の 2 つだけです。`DryRunSink` の `_done` の残り（91〜129 行目）は、delete（91 行目）→ rename（102 行目）→ create（105 行目）→ update（122 行目）の順に流します。記録の「dryRun なし」でも「dryRun あり」でも、`ops` の中で create → overwrite → rename → delete の順に呼んだのに、reporter は `delete /delete-me.txt`・`rename /rename-me.txt → /renamed.txt`・`create /created.txt (10 bytes)`・`update /existing.txt (12 bytes)` の順でした。113〜118 行目、エラーになったパスの create は出しません。記録の「既にあるファイルを create」では `error(alreadyExist) /existing.txt` の後、同じ Rule で作った `/fine.txt` の create は出ましたが、`UnsuccessfulWorkflowExecution` で止まり、ディスクには書かれていません。

📄 `angular-cli/packages/angular_devkit/schematics/src/sink/sink.ts` L80–118 （▶ の行: 81, 83–84, 87, 89–90, 96, 99, 105, 107, 109, 111, 113, 116）

```ts
 80 │   protected _validateRenameAction(action: RenameFileAction): Observable<void> {
 81 ▶     return this._validateFileExists(action.path).pipe(
 82 │       map((b) => {
 83 ▶         if (!b) {
 84 ▶           this._fileDoesNotExistException(action.path);
 85 │         }
 86 │       }),
 87 ▶       mergeMap(() => this._validateFileExists(action.to)),
 88 │       map((b) => {
 89 ▶         if (b) {
 90 ▶           this._fileAlreadyExistException(action.to);
 91 │         }
 92 │       }),
 93 │     );
 94 │   }
 95 │   protected _validateDeleteAction(action: DeleteFileAction): Observable<void> {
 96 ▶     return this._validateFileExists(action.path).pipe(
 97 │       map((b) => {
 98 │         if (!b) {
 99 ▶           this._fileDoesNotExistException(action.path);
100 │         }
101 │       }),
102 │     );
103 │   }
104 │ 
105 ▶   validateSingleAction(action: Action): Observable<void> {
106 │     switch (action.kind) {
107 ▶       case 'o':
108 │         return this._validateOverwriteAction(action);
109 ▶       case 'c':
110 │         return this._validateCreateAction(action);
111 ▶       case 'r':
112 │         return this._validateRenameAction(action);
113 ▶       case 'd':
114 │         return this._validateDeleteAction(action);
115 │       default:
116 ▶         throw new UnknownActionException(action);
117 │     }
118 │   }
```

rename は 81〜86 行目で元が無ければ「無い」、87〜92 行目で行き先があれば「既にある」、delete は 98〜100 行目で無ければ「無い」です（create と overwrite の検査は Tree と sink の章の 8 節）。dryRun の有り無しで違うのは、記録のとおり post task の lifeCycle（`post-tasks-start`・`post-tasks-end`）とディスクの差分だけでした。

## 5. collection.json を探す：NodeModulesEngineHost

📄 `angular-cli/packages/angular_devkit/schematics/tools/node-module-engine-host.ts` L31–53 （▶ の行: 32, 36, 38–41, 45, 50–51）

```ts
31 │ export class NodeModulesEngineHost extends FileSystemEngineHostBase {
32 ▶   constructor(private readonly paths?: string[]) {
33 │     super();
34 │   }
35 │ 
36 ▶   private resolve(name: string, requester?: string, references = new Set<string>()): string {
37 │     // Keep track of the package requesting the schematic, in order to avoid infinite recursion
38 ▶     if (requester) {
39 ▶       if (references.has(requester)) {
40 ▶         references.add(requester);
41 ▶         throw new Error(
42 │           'Circular schematic reference detected: ' + JSON.stringify(Array.from(references)),
43 │         );
44 │       } else {
45 ▶         references.add(requester);
46 │       }
47 │     }
48 │ 
49 │     let collectionPath: string | undefined = undefined;
50 ▶     const resolveOptions = {
51 ▶       paths: requester ? [dirname(requester), ...(this.paths || [])] : this.paths,
52 │     };
53 │ 
```

📄 `angular-cli/packages/angular_devkit/schematics/tools/node-module-engine-host.ts` L73–103 （▶ の行: 73–75, 80, 82, 84, 91–92, 98–100）

```ts
 73 ▶     } catch (e) {
 74 ▶       if ((e as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
 75 ▶         throw e;
 76 │       }
 77 │     }
 78 │ 
 79 │     // If not a package, try to resolve as a file
 80 ▶     if (!collectionPath) {
 81 │       try {
 82 ▶         collectionPath = require.resolve(name, resolveOptions);
 83 │       } catch (e) {
 84 ▶         if ((e as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
 85 │           throw e;
 86 │         }
 87 │       }
 88 │     }
 89 │ 
 90 │     // If not a package or a file, error
 91 ▶     if (!collectionPath) {
 92 ▶       throw new CollectionCannotBeResolvedException(name);
 93 │     }
 94 │ 
 95 │     return collectionPath;
 96 │   }
 97 │ 
 98 ▶   protected _resolveCollectionPath(name: string, requester?: string): string {
 99 ▶     const collectionPath = this.resolve(name, requester);
100 ▶     readJsonFile(collectionPath);
101 │ 
102 │     return collectionPath;
103 │   }
```

名前をパッケージとして解く部分（package.json の `schematics`）は[ng generate component の章](../cli/15-schematics-component.md)の 2 節です。ここではその前後を見ます。

1. **50〜52 行目：どこから探すか**

   `requester`（頼んだ collection の場所）があればそのフォルダを先に、あとは 32 行目の `paths`（`NodeWorkflow` の `resolvePaths`）です。`paths` が無いと `require.resolve` はこのファイル自身の場所から探すので、記録の「相対パス（resolvePaths なし）」では `./tools/local/collection.json` が「cannot be resolved」でした。`resolvePaths: [ワークスペース]` なら見つかります。`./` を付けない `tools/local/collection.json` はパッケージの名前として探されて見つかりませんでした。
2. **73〜77 行目：見つからない以外の例外はそのまま**

   package.json に `schematics` が無いパッケージは、パッケージとして解く途中で投げた例外が `MODULE_NOT_FOUND` でないので、ここで止まります。記録は「Package "pkg-c" was found but does not support schematics.」でした。
3. **80〜88 行目：ファイルとして探す**

   パッケージで無ければ、名前をそのままファイルのパスとして `require.resolve` します。
4. **38〜47 行目：パッケージの循環**

   `"schematics": "pkg-loop"` のように自分を指すと、2 回目の `requester` で 39 行目が真になり、41 行目で投げます。40 行目の `add` は既にある値なので何も足さず、記録の文の配列は 1 つだけでした。
5. **98〜103 行目：見つけたら一度読む**

   JSON として読めるかを確かめます（`readJsonFile` は jsonc-parser で、末尾のカンマを許す）。

📄 `angular-cli/packages/angular_devkit/schematics/tools/export-ref.ts` L11–27 （▶ の行: 16–19, 23）

```ts
11 │ export class ExportStringRef<T> {
12 │   private _ref?: T;
13 │   private _module: string;
14 │   private _path: string;
15 │ 
16 ▶   constructor(ref: string, parentPath: string = process.cwd(), inner = true) {
17 ▶     const [path, name] = ref.split('#', 2);
18 ▶     this._module = path[0] == '.' ? resolve(parentPath, path) : path;
19 ▶     this._module = require.resolve(this._module);
20 │     this._path = dirname(this._module);
21 │ 
22 │     if (inner) {
23 ▶       this._ref = require(this._module)[name || 'default'];
24 │     } else {
25 │       this._ref = require(this._module);
26 │     }
27 │   }
```

`collection.json` の `"factory": "./ops/index#ops"` は、17 行目で `#` の前後に割り、18 行目で `.` で始まれば collection のフォルダから解き、23 行目で `require` した module の `ops`（無ければ `default`）を取り出します。ここで初めて schematic の JavaScript が読み込まれます。

## 6. 説明を作る：別名・extends・hidden・private

📄 `angular-cli/packages/angular_devkit/schematics/tools/file-system-engine-host-base.ts` L158–196 （▶ の行: 162–164, 169–170, 173, 182, 184, 186–188, 192）

```ts
158 │   createCollectionDescription(
159 │     name: string,
160 │     requester?: FileSystemCollectionDesc,
161 │   ): FileSystemCollectionDesc {
162 ▶     const path = this._resolveCollectionPath(name, requester?.path);
163 ▶     const jsonValue = readJsonFile(path);
164 ▶     if (!jsonValue || typeof jsonValue != 'object' || Array.isArray(jsonValue)) {
165 │       throw new InvalidCollectionJsonException(name, path);
166 │     }
167 │ 
168 │     // normalize extends property to an array
169 ▶     if (typeof jsonValue['extends'] === 'string') {
170 ▶       jsonValue['extends'] = [jsonValue['extends']];
171 │     }
172 │ 
173 ▶     const description = this._transformCollectionDescription(name, {
174 │       ...jsonValue,
175 │       path,
176 │     });
177 │     if (!description || !description.name) {
178 │       throw new InvalidCollectionJsonException(name, path);
179 │     }
180 │ 
181 │     // Validate aliases.
182 ▶     const allNames = Object.keys(description.schematics);
183 │     for (const schematicName of Object.keys(description.schematics)) {
184 ▶       const aliases = description.schematics[schematicName].aliases || [];
185 │ 
186 ▶       for (const alias of aliases) {
187 ▶         if (allNames.indexOf(alias) != -1) {
188 ▶           throw new SchematicNameCollisionException(alias);
189 │         }
190 │       }
191 │ 
192 ▶       allNames.push(...aliases);
193 │     }
194 │ 
195 │     return description;
196 │   }
```

162 行目で 5 節の探し方を呼び、169〜171 行目で `"extends": "x"` を `["x"]` にそろえます（前の回の 2 節の再帰はこの配列を回す）。182〜193 行目、別名がほかの schematic の名前か別名と重なれば `SchematicNameCollisionException` です。

📄 `angular-cli/packages/angular_devkit/schematics/tools/file-system-engine-host-base.ts` L214–248 （▶ の行: 215, 221–223, 227–228, 230, 232, 237–238, 240, 245–246）

```ts
214 │ 
215 ▶     const collectionPath = dirname(collection.path);
216 │     const partialDesc: Partial<FileSystemSchematicDesc> | null = collection.schematics[name];
217 │     if (!partialDesc) {
218 │       return null;
219 │     }
220 │ 
221 ▶     if (partialDesc.extends) {
222 ▶       const index = partialDesc.extends.indexOf(':');
223 ▶       const collectionName = index !== -1 ? partialDesc.extends.slice(0, index) : null;
224 │       const schematicName =
225 │         index === -1 ? partialDesc.extends : partialDesc.extends.slice(index + 1);
226 │ 
227 ▶       if (collectionName !== null) {
228 ▶         const extendCollection = this.createCollectionDescription(collectionName);
229 │ 
230 ▶         return this.createSchematicDescription(schematicName, extendCollection);
231 │       } else {
232 ▶         return this.createSchematicDescription(schematicName, collection);
233 │       }
234 │     }
235 │     // Use any on this ref as we don't have the OptionT here, but we don't need it (we only need
236 │     // the path).
237 ▶     if (!partialDesc.factory) {
238 ▶       throw new SchematicMissingFactoryException(name);
239 │     }
240 ▶     const resolvedRef = this._resolveReferenceString(
241 │       partialDesc.factory,
242 │       collectionPath,
243 │       collection,
244 │     );
245 ▶     if (!resolvedRef) {
246 ▶       throw new FactoryCannotBeResolvedException(name);
247 │     }
248 │ 
```

schematic の側にも `extends` があります。221〜234 行目、`"extends": "pkg-a:hello"` なら別の collection の `hello` の説明を、`"extends": "mine"` なら同じ collection の `mine` の説明を、そのまま自分の説明として返します。228 行目は `requester` を渡さないので、別の collection は 5 節の `paths` だけから探します（collection の `extends` は前の回の 2 節で `requester` を渡す）。

📄 `angular-cli/packages/angular_devkit/schematics/tools/file-system-engine-host-base.ts` L122–141 （▶ の行: 127–128, 131–136）

```ts
122 │   listSchematicNames(collection: FileSystemCollectionDesc, includeHidden?: boolean): string[] {
123 │     const schematics: string[] = [];
124 │     for (const key of Object.keys(collection.schematics)) {
125 │       const schematic = collection.schematics[key];
126 │ 
127 ▶       if ((schematic.hidden && !includeHidden) || schematic.private) {
128 ▶         continue;
129 │       }
130 │ 
131 ▶       // If extends is present without a factory it is an alias, do not return it
132 ▶       //   unless it is from another collection.
133 ▶       if (!schematic.extends || schematic.factory) {
134 ▶         schematics.push(key);
135 ▶       } else if (schematic.extends && schematic.extends.indexOf(':') !== -1) {
136 ▶         schematics.push(key);
137 │       }
138 │     }
139 │ 
140 │     return schematics;
141 │   }
```

記録の「collection の extends と schematic の extends」の結果をまとめます。`pkg-ext` は `"extends": ["pkg-a", "pkg-a2"]` で、`pkg-a` と `pkg-a2` の両方に `hello` があります。

| execute | 走ったもの（記録） | 理由 |
| --- | --- | --- |
| `pkg-ext:hello` | `pkg-a2` の hello | `bases` は `["pkg-a2","pkg-a"]`（前の回の 234 行目の `unshift`）。後に書いた方が先 |
| `pkg-ext:greet` | `pkg-a` の hello | 228〜230 行目 |
| `pkg-ext:hey` | `pkg-ext` の mine | 232 行目 |
| `listSchematicNames()` | `["greet","hello","mine","only2"]` | 133〜137 行目：`:` の無い `extends`（`hey`）は別名とみなして出さない |
| `pkg-a:hi`・`pkg-a:secret`・`pkg-a:priv` | hello が走る・走る・PrivateSchematicException | 別名は本名に、hidden（127 行目）は一覧から消すだけで呼べる、private は呼べない |
| `pkg-circ1`（`pkg-circ2` と互いに extends） | 「Circular collection reference "pkg-circ1".」 | 前の回の 220 行目 |

もう 1 つ、前の回の 197〜200 行目の「collection は名前でキャッシュ」がここで効きます。記録の「キャッシュ」では、`outer1` と `outer2` がそれぞれ自分の `node_modules` に版の違う `dup`（v1 と v2）を持ち、どちらも `externalSchematic('dup', 'which', {})` を呼びます。同じ workflow で `outer1:run` → `outer2:run` の順に実行すると、2 回とも `dup-from-v1.txt` ができました。`outer2:run` だけを新しい workflow で走らせると `dup-from-v2.txt` です。2 回目は `requester` が `outer2` でも、名前の `dup` でキャッシュの v1 が返るからです。main も同じです。

## 7. options の変換と task の実行係

📄 `angular-cli/packages/angular_devkit/schematics/tools/file-system-engine-host-base.ts` L302–324 （▶ の行: 307, 309–313, 319, 322–323）

```ts
302 │   transformOptions<OptionT extends object, ResultT extends object>(
303 │     schematic: FileSystemSchematicDesc,
304 │     options: OptionT,
305 │     context?: FileSystemSchematicContext,
306 │   ): Observable<ResultT> {
307 ▶     const transform = async () => {
308 │       let transformedOptions = options;
309 ▶       for (const transformer of this._transforms) {
310 ▶         const transformerResult = transformer(schematic, transformedOptions, context);
311 ▶         transformedOptions = await (isObservable(transformerResult)
312 ▶           ? lastValueFrom(transformerResult)
313 ▶           : transformerResult);
314 │       }
315 │ 
316 │       return transformedOptions;
317 │     };
318 │ 
319 ▶     return observableFrom(transform()) as unknown as Observable<ResultT>;
320 │   }
321 │ 
322 ▶   transformContext(context: FileSystemSchematicContext): FileSystemSchematicContext {
323 ▶     return this._contextTransforms.reduce((acc, curr) => curr(acc), context);
324 │   }
```

前の回の 63 行目の `transformOptions` の中身です。309〜314 行目、3 節で登録した変換を**登録した順に 1 つずつ**、前の結果を次に渡しながら待ちます（Observable なら最後の値、Promise なら解けた値）。CLI の `ng generate` では、angular.json の既定値を足す変換が先、schema の検証が最後です（3 節の 73〜81 行目の順）。

📄 `angular-cli/packages/angular_devkit/schematics/tools/file-system-engine-host-base.ts` L326–348 （▶ の行: 330, 333–334, 337–338, 340, 343, 346–347）

```ts
326 │   getSchematicRuleFactory<OptionT extends object>(
327 │     schematic: FileSystemSchematicDesc,
328 │     _collection: FileSystemCollectionDesc,
329 │   ): RuleFactory<OptionT> {
330 ▶     return schematic.factoryFn;
331 │   }
332 │ 
333 ▶   registerTaskExecutor<T>(factory: TaskExecutorFactory<T>, options?: T): void {
334 ▶     this._taskFactories.set(factory.name, () => observableFrom(factory.create(options)));
335 │   }
336 │ 
337 ▶   createTaskExecutor(name: string): Observable<TaskExecutor> {
338 ▶     const factory = this._taskFactories.get(name);
339 │     if (factory) {
340 ▶       return factory();
341 │     }
342 │ 
343 ▶     return throwError(new UnregisteredTaskException(name));
344 │   }
345 │ 
346 ▶   hasTaskExecutor(name: string): boolean {
347 ▶     return this._taskFactories.has(name);
348 │   }
```

📄 `angular-cli/packages/angular_devkit/schematics/tasks/node/index.ts` L20–34 （▶ の行: 21–23, 25, 27, 30, 32）

```ts
20 │ export class BuiltinTaskExecutor {
21 ▶   static readonly NodePackage: TaskExecutorFactory<NodePackageTaskFactoryOptions> = {
22 ▶     name: NodePackageName,
23 ▶     create: async (options) => NodePackageExecutor(options) as TaskExecutor<{}>,
24 │   };
25 ▶   static readonly RepositoryInitializer: TaskExecutorFactory<RepositoryInitializerTaskFactoryOptions> =
26 │     {
27 ▶       name: RepositoryInitializerName,
28 │       create: async (options) => RepositoryInitializerExecutor(options) as TaskExecutor<{}>,
29 │     };
30 ▶   static readonly RunSchematic: TaskExecutorFactory<{}> = {
31 │     name: RunSchematicName,
32 ▶     create: async () => RunSchematicExecutor() as TaskExecutor<{}>,
33 │   };
34 │ }
```

334 行目、実行係は「options を閉じ込めた作り方」として登録し、343 行目、無い名前は `UnregisteredTaskException` です。3 節の 61〜71 行目で登録する 3 つが 21〜33 行目で、名前は `node-package`・`repo-init`・`run-schematic` です（前の回の 286 行目はこの名前で `hasTaskExecutor` を聞く）。

📄 `angular-cli/packages/angular_devkit/schematics/tasks/run-schematic/executor.ts` L12–35 （▶ の行: 14, 20–21, 23, 27–29, 32）

```ts
12 │ export default function (): TaskExecutor<RunSchematicTaskOptions<{}>> {
13 │   return (options: RunSchematicTaskOptions<{}> | undefined, context: SchematicContext) => {
14 ▶     if (!options?.name) {
15 │       throw new Error(
16 │         'RunSchematicTask requires an options object with a non-empty name property.',
17 │       );
18 │     }
19 │ 
20 ▶     const maybeWorkflow = context.engine.workflow;
21 ▶     const collection = options.collection || context.schematic.collection.description.name;
22 │ 
23 ▶     if (!maybeWorkflow) {
24 │       throw new Error('Need Workflow to support executing schematics as post tasks.');
25 │     }
26 │ 
27 ▶     return maybeWorkflow.execute({
28 ▶       collection: collection,
29 ▶       schematic: options.name,
30 │       options: options.options,
31 │       // Allow private when calling from the same collection.
32 ▶       allowPrivate: collection == context.schematic.collection.description.name,
33 │     });
34 │   };
35 │ }
```

`RunSchematicTask` は、post task の中から同じ workflow の `execute` をもう 1 回呼びます（27 行目）。記録の「RunSchematicTask（入れ子の execute）」の lifeCycle は `start` → `workflow-start` → `post-tasks-start` → `workflow-start` → … → `workflow-end` → `post-tasks-end` → `workflow-end` → `end` で、2 節の 151 行目のとおり `start` と `end` は 1 回ずつでした。32 行目、同じ collection なら private も呼べます。

## 8. NodePackageInstallTask が打つコマンド

📄 `angular-cli/packages/angular_devkit/schematics/tasks/package-manager/install-task.ts` L21–33 （▶ の行: 22–24, 29–30, 32–33）

```ts
21 │ export class NodePackageInstallTask implements TaskConfigurationGenerator<NodePackageTaskOptions> {
22 ▶   quiet = true;
23 ▶   hideOutput = true;
24 ▶   allowScripts = false;
25 │   workingDirectory?: string;
26 │   packageManager?: string;
27 │   packageName?: string;
28 │ 
29 ▶   constructor(workingDirectory?: string);
30 ▶   constructor(options: NodePackageInstallTaskOptions);
31 │   constructor(options?: string | NodePackageInstallTaskOptions) {
32 ▶     if (typeof options === 'string') {
33 ▶       this.workingDirectory = options;
```

📄 `angular-cli/packages/angular_devkit/schematics/tasks/package-manager/install-task.ts` L56–69 （▶ の行: 58, 60–62, 66）

```ts
56 │   toConfiguration(): TaskConfiguration<NodePackageTaskOptions> {
57 │     return {
58 ▶       name: NodePackageName,
59 │       options: {
60 ▶         command: 'install',
61 ▶         quiet: this.quiet,
62 ▶         hideOutput: this.hideOutput,
63 │         workingDirectory: this.workingDirectory,
64 │         packageManager: this.packageManager,
65 │         packageName: this.packageName,
66 ▶         allowScripts: this.allowScripts,
67 │       },
68 │     };
69 │   }
```

22〜24 行目、既定は「静かに（`quiet`）」「出力を溜める（`hideOutput`）」「スクリプトを走らせない（`allowScripts: false`）」です。60 行目、`command` はいつも `install` です。

📄 `angular-cli/packages/angular_devkit/schematics/tasks/package-manager/executor.ts` L56–88 （▶ の行: 59–60, 62, 65, 67, 70–71, 79–81, 83–84, 86）

```ts
56 │ export default function (
57 │   factoryOptions: NodePackageTaskFactoryOptions = {},
58 │ ): TaskExecutor<NodePackageTaskOptions> {
59 ▶   const packageManagerName = factoryOptions.packageManager || 'npm';
60 ▶   const packageManagerProfile = packageManagers[packageManagerName];
61 │   if (!packageManagerProfile) {
62 ▶     throw new UnknownPackageManagerException(packageManagerName);
63 │   }
64 │ 
65 ▶   const rootDirectory = factoryOptions.rootDirectory || process.cwd();
66 │ 
67 ▶   return (options: NodePackageTaskOptions = { command: 'install' }) => {
68 │     let taskPackageManagerProfile = packageManagerProfile;
69 │     let taskPackageManagerName = packageManagerName;
70 ▶     if (factoryOptions.allowPackageManagerOverride && options.packageManager) {
71 ▶       taskPackageManagerProfile = packageManagers[options.packageManager];
72 │       if (!taskPackageManagerProfile) {
73 │         throw new UnknownPackageManagerException(options.packageManager);
74 │       }
75 │       taskPackageManagerName = options.packageManager;
76 │     }
77 │ 
78 │     const bufferedOutput: { stream: NodeJS.WriteStream; data: Buffer }[] = [];
79 ▶     const spawnOptions: SpawnOptions = {
80 ▶       shell: true,
81 ▶       cwd: path.join(rootDirectory, options.workingDirectory || ''),
82 │     };
83 ▶     if (options.hideOutput) {
84 ▶       spawnOptions.stdio = options.quiet ? ['ignore', 'ignore', 'pipe'] : 'pipe';
85 │     } else {
86 ▶       spawnOptions.stdio = options.quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit';
87 │     }
88 │ 
```

📄 `angular-cli/packages/angular_devkit/schematics/tasks/package-manager/executor.ts` L89–122 （▶ の行: 91–93, 95–97, 100, 102, 106, 108, 111, 115–116, 119–120）

```ts
 89 │     const args: string[] = [];
 90 │ 
 91 ▶     if (options.packageName) {
 92 ▶       if (options.command === 'install') {
 93 ▶         args.push(taskPackageManagerProfile.commands.installPackage);
 94 │       }
 95 ▶       args.push(options.packageName);
 96 ▶     } else if (options.command === 'install' && taskPackageManagerProfile.commands.installAll) {
 97 ▶       args.push(taskPackageManagerProfile.commands.installAll);
 98 │     }
 99 │ 
100 ▶     if (!options.allowScripts) {
101 │       // Yarn requires special handling since Yarn 2+ no longer has the `--ignore-scripts` flag
102 ▶       if (taskPackageManagerName === 'yarn') {
103 │         spawnOptions.env = {
104 │           ...process.env,
105 │           // Supported with yarn 1
106 ▶           'npm_config_ignore_scripts': 'true',
107 │           // Supported with yarn 2+
108 ▶           'YARN_ENABLE_SCRIPTS': 'false',
109 │         };
110 │       } else {
111 ▶         args.push('--ignore-scripts');
112 │       }
113 │     }
114 │ 
115 ▶     if (factoryOptions.registry) {
116 ▶       args.push(`--registry="${factoryOptions.registry}"`);
117 │     }
118 │ 
119 ▶     if (factoryOptions.force) {
120 ▶       args.push('--force');
121 │     }
122 │ 
```

📄 `angular-cli/packages/angular_devkit/schematics/tasks/package-manager/executor.ts` L123–153 （▶ の行: 124–125, 129, 132–133, 137–138, 140–141, 145–146, 149）

```ts
123 │     return new Promise<void>((resolve, reject) => {
124 ▶       const spinner = ora({
125 ▶         text: `Installing packages (${taskPackageManagerName})...`,
126 │         // Workaround for https://github.com/sindresorhus/ora/issues/136.
127 │         discardStdin: process.platform != 'win32',
128 │       }).start();
129 ▶       const childProcess = spawn(`${taskPackageManagerName} ${args.join(' ')}`, spawnOptions).on(
130 │         'close',
131 │         (code: number) => {
132 ▶           if (code === 0) {
133 ▶             spinner.succeed('Packages installed successfully.');
134 │             spinner.stop();
135 │             resolve();
136 │           } else {
137 ▶             if (options.hideOutput) {
138 ▶               bufferedOutput.forEach(({ stream, data }) => stream.write(data));
139 │             }
140 ▶             spinner.fail('Package install failed, see above.');
141 ▶             reject(new UnsuccessfulWorkflowExecution());
142 │           }
143 │         },
144 │       );
145 ▶       if (options.hideOutput) {
146 ▶         childProcess.stdout?.on('data', (data: Buffer) =>
147 │           bufferedOutput.push({ stream: process.stdout, data: data }),
148 │         );
149 ▶         childProcess.stderr?.on('data', (data: Buffer) =>
150 │           bufferedOutput.push({ stream: process.stderr, data: data }),
151 │         );
152 │       }
153 │     });
```

1. **59〜65 行目：どの npm を、どこで**

   パッケージマネージャーの名前は `NodeWorkflow` の `packageManager`（無ければ npm）、場所は root（3 節の 65 行目）です。70〜76 行目、`NodeWorkflow` は `allowPackageManagerOverride: true` なので、task の側の `packageManager` が勝ちます。
2. **79〜87 行目：シェルで、出力は溜めるか捨てる**

   既定の `quiet` と `hideOutput` では 84 行目の `['ignore', 'ignore', 'pipe']`、つまり標準出力は捨て、標準エラーだけを 149 行目で溜めます。
3. **91〜121 行目：引数**

   パッケージ名が無ければ `install`、スクリプトを止めるなら 111 行目の `--ignore-scripts`（yarn だけは 102〜109 行目の環境変数）。
4. **129 行目：1 本の文字列にして spawn**

   成功なら 133 行目、失敗なら 137〜138 行目で溜めた出力を出してから 141 行目で `UnsuccessfulWorkflowExecution` です。

記録用のワークスペースの `PATH` の先頭に、引数を書き留めてから本物の npm を呼ぶ小さな `npm` を置いて走らせました。既定の task では spawn は 1 回で `npm install --ignore-scripts`（cwd はワークスペース）、`node_modules/local-dep` ができ、package.json の `postinstall` は走りませんでした。`allowScripts: true` では `npm install` で、`postinstall` が作るファイル `POSTINSTALL_RAN` ができました。標準エラーには 124〜128 行目の spinner の「- Installing packages (npm)...」と 133 行目の「✔ Packages installed successfully.」が出ました。`--ignore-scripts` を既定にしたのは 0e6425fd88（2022-04、`disable package script execution by default in NodePackageInstallTask`）、yarn 2 の環境変数は 901f5dd7fc（2022-05）です。

> **🧪 DEMO — NodeWorkflow を記録用のワークスペースで動かした記録**
>
> 上のボタンで種類を選び、下のボタンで 1 つの記録を出します。`reporter` は `workflow.reporter`、`lifeCycle` は `workflow.lifeCycle` のイベント、`ディスク` は実行の前後のファイルの差分（+ 増えた・- 消えた・~ 変わった）です。探し方の記録は dryRun なので、`create` の行の矢印の右に、走った factory のファイルがあるフォルダ（`node_modules` の下）を出しています。
>
> 下の段のボタンを押すと記録が出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-workflow)

## ここまでの呼び出し（ng generate の下で）

- 👤 `new NodeWorkflow(root, { schemaValidation, optionTransforms, … })` — node-workflow.ts L39
  - `new NodeModulesEngineHost(resolvePaths)`・`registerTaskExecutor × 3` — L51・L61〜71
  - `registerOptionsTransform(validateOptionsWithSchema(registry))` — L80 — *最後に登録*
- 👤 `workflow.execute({ collection, schematic, options })` — base.ts L146 — *start・workflow-start は呼んだ時点*
  - `engine.createCollection` → `host.createCollectionDescription` — L156 → file-system-engine-host-base.ts L158
    - `NodeModulesEngineHost.resolve(name, requester)` — node-module-engine-host.ts L36 — *package → ファイル*
  - `collection.createSchematic` → `host.createSchematicDescription` — base.ts L160 — *別名・extends・factory（export-ref.ts L16）*
  - `schematic.call` → `host.transformOptions` — file-system-engine-host-base.ts L302 — *登録順に 1 つずつ*
  - `sink.commit × 3` → `DryRunSink._done` — dryrun.ts L91 — *delete → rename → create → update*
  - `executePostTasks` → `node-package` の実行係 — executor.ts L67 — *npm install --ignore-scripts*
  - `tap({ complete })` — base.ts L203 — *error では context を下ろさない*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `tools/workflow/node-workflow_spec.ts` | `NodeWorkflow`（14）› `works`（16、`xit`） | 止めてある（15 行目のコメント「this test seems to either not work on windows or on linux」）。`BaseWorkflow` の lifeCycle と context を確かめる it はどこにも無い |
| `tools/file-system-engine-host_spec.ts` | `FileSystemEngineHost`（16）› `understands aliases`（33）・`extends a collection with string`（94）・`extends multiple collections`（187）・`errors on simple circular collections`（213）・`does not list private schematics`（282）・`allows executing a schematic with a file-based task`（334）ほか、全 24 | 6 節。`replaces base schematics when extending`（166）は自分の schematic が base に勝つこと |
| `tools/node-module-engine-host_spec.ts` | `NodeModulesEngineHost`（17）› `should properly create collections with explicit collection path`（42） | 5 節の 1 つだけ。`resolvePaths` と循環とキャッシュは無い |
| `src/sink/dryrun_spec.ts`・`host_spec.ts` | `DryRunSink`（20）› `works when creating everything`（21）、`FileSystemSink`（13）› `complex tests`（41）の 5 つ | 4 節のイベントと書き込み |
| （無し） | `tasks/` の spec | 8 節の引数は spec で固めていない |

📄 `走らせたコマンド（2026-11-26）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular_devkit/schematics:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular_devkit/schematics/tools:test --nocache_test_results --test_output=all
（結果は下の段落）
```

手元の bazel で `schematics:test` は 101 specs・0 failures、`schematics/tools:test` は 31 specs・0 failures・2 pending でした。pending の 2 つは上の `node-workflow_spec.ts` の 16 行目と、`export-ref_spec.ts` の 43 行目の `xit('works on package names')` です。

直すとしたら、2 節の context は `base.ts` の 202〜211 行目の `tap` を `finalize`（complete でも error でも unsubscribe でも走る）にして、`_context.pop()` をそこへ移します。`workflow-end` と `end` を失敗のときにも出すかは決めごとで、出すなら `LifeCycleEvent` に成否を足す形になります。spec は `src/workflow/` に base\_spec.ts を作り、「失敗した execute の後の execute で `start` が出る」を足します。6 節のキャッシュは `engine.ts` の 197 行目の鍵に、host が解いたパス（説明の `path`）を使う形にします。名前だけで同じものを返す今の振る舞いに頼るコード（`ng update` が `createCollection` を何度も呼ぶ）があるので、名前 → パスの順に引く 2 段のキャッシュになります。

## 聞かれそうな質問

**Q. schema に default を書いたのに、自分で作った NodeWorkflow では入りません。**

`schemaValidation: true` を付けていないか、登録簿（`registry`）を渡しているからです。default を入れる変換（base.ts 82 行目）は検証のときにだけ走り、登録簿を渡すと足されません（78〜83 行目）。記録は 3 つとも表のとおりでした。

**Q. `--dry-run` でも reporter のイベントは同じですか？**

同じでした。イベントは 1 番目の sink（`DryRunSink`）が出すからです。違うのは post task の lifeCycle とディスクで、`--dry-run` では `post-tasks-start`・`post-tasks-end` が出ず、ディスクは変わりません。

**Q. schematic の中で create → overwrite → rename → delete の順に呼んだのに、表示の順が違います。**

`DryRunSink._done` が delete（91 行目）→ rename（102 行目）→ create（105 行目）→ update（122 行目）の順に流すからです。呼んだ順は残りません。

**Q. 2 つのパッケージが版の違う同じ名前の collection を `externalSchematic` で呼ぶと？**

同じ workflow の中では、先に作った方が両方に使われました（記録の「キャッシュ」）。エンジンの collection のキャッシュが名前だけを鍵にするからです（前の回の 197〜200 行目）。

**Q. NodePackageInstallTask は postinstall を走らせますか？**

既定では走らせません。`allowScripts` の既定が `false`（install-task.ts 24 行目）で、executor.ts 111 行目が `--ignore-scripts` を足します。記録の spawn は `npm install --ignore-scripts` でした。

## 読み終えて

- `execute` は呼んだ時点で `start`・`workflow-start` を出し、collection と schematic を作り、context を積む。下ろすのは complete のときだけで、失敗すると次の実行が入れ子扱いになる。
- schema の default は「検証の変換」と一緒に入る。`schemaValidation` が無いか、登録簿を渡すと入らない。
- reporter は delete → rename → create → update の順。dryRun で変わるのは post task とディスクだけ。
- collection は requester のフォルダ → `resolvePaths`、package → ファイルの順に探す。`extends` は後に書いた方が勝ち、名前のキャッシュが版の違いを隠す。
- `NodePackageInstallTask` の既定は `npm install --ignore-scripts`、標準出力は捨て、失敗のときだけ標準エラーを出す。

---

← 前: [エンジンと規則：engine・rules・formats](07-dvk-engine.md)  
次: [architect の jobs：scheduler・registry・strategy](09-dvk-jobs.md) →
