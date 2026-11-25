[目次](../README.md) › [@angular-devkit の内側](README.md) › 第 7 回 / 全 12 回

# エンジンと規則：engine・rules・formats

> schematics/src/engine/\*・rules/\*・formats/\*：SchematicEngine が collection・schematic・context を作る順と engine host に聞くこと、addTask の予約と TaskScheduler（同じ優先度は予約の逆順、別の context の TaskId は依存にできない）、Tree 以外を返したときの例外の文、url・schematic()・partitionApplyMerge・renameTemplateFiles の規則の残り、html-selector と path の format の検査。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-engine)

---

この章で分かること：`ng generate` の下で動く `SchematicEngine` が、collection（schematic の一覧を書いた `collection.json`）と schematic と context（Rule に渡る道具箱）を、どの順に、engine host（ファイルの探し方を知っている係）の何を呼んで作るか。`context.addTask` で予約した task（npm install などの後片付け）がどの順に走るか。`url`・`schematic()`・`partitionApplyMerge`・`renameTemplateFiles` と format の検査の、ほかの章で読んでいない残りです。

読む対象は `packages/angular_devkit/schematics/src/` の `engine/engine.ts`・`engine/schematic.ts`・`engine/interface.ts`、`rules/call.ts`・`rules/schematic.ts`・`rules/base.ts`・`rules/template.ts`、`formats/` です（../angular-cli、44129f66a3）。Rule が返してよい値と `chain`・`mergeWith`・`template`・`move`・`externalSchematic` は[Rule の組み立ての章](../cli/14-schematics-rules.md)、Tree に溜めた変更を sink がディスクへ書く所は[Tree と sink の章](../cli/13-schematics.md)、Tree そのものは[第 6 回](06-dvk-tree.md)が読んでいます。engine host の中身（collection.json の探し方）は[次の回](08-dvk-workflow.md)です。

1. [1. パスと文字列](01-dvk-path.md)
2. [2. 仮想ファイルシステムの host](02-dvk-host.md)
3. [3. JSON schema の検査](03-dvk-schema.md)
4. [4. angular.json の読み書き](04-dvk-workspace.md)
5. [5. logger と小さな道具](05-dvk-logger.md)
6. [6. Tree](06-dvk-tree.md)
7. **7. エンジンと規則**（この章）
8. [8. ワークフローと engine host](08-dvk-workflow.md)
9. [9. architect の jobs](09-dvk-jobs.md)
10. [10. Architect が builder を呼ぶまで](10-dvk-architect.md)
11. [11. テストの道具](11-dvk-testing.md)
12. [12. spec と issue](12-dvk-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> DEMO の記録は、ローカルの `@angular/cli` 22.2.7 が持つ `@angular-devkit/schematics` 22.2.7 を Node から直接使って取りました。記録用の collection は `outer`（別名 `o`）と、`private: true` の `inner` の 2 つで、`outer` が `schematic('inner', …)` で `inner` を呼びます。44129f66a3 と v22.2.7 の差は、この章の範囲では `rules/base.ts` の `chain`（cf1f3b9d43、Rule を 1 つずつ `await` する形になった）と `filter`、`rules/template.ts` の `applyContentTemplate`（3ed20d1db0、テンプレートの例外にパスを足す）だけで、`engine/` と `formats/` と、この章で引く範囲は同じです。記録は 22.2.7 の振る舞いです。

## 1. engine host と context の約束

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/interface.ts` L76–115 （▶ の行: 81–82, 84, 91, 94–95, 99, 102–103, 108, 110–112, 114）

```ts
 76 │ /**
 77 │  * The Host for the Engine. Specifically, the piece of the tooling responsible for resolving
 78 │  * collections and schematics descriptions. The SchematicMetadataT and CollectionMetadataT type
 79 │  * parameters contain additional metadata that you want to store while remaining type-safe.
 80 │  */
 81 ▶ export interface EngineHost<CollectionMetadataT extends object, SchematicMetadataT extends object> {
 82 ▶   createCollectionDescription(
 83 │     name: string,
 84 ▶     requester?: CollectionDescription<CollectionMetadataT>,
 85 │   ): CollectionDescription<CollectionMetadataT>;
 86 │   listSchematicNames(
 87 │     collection: CollectionDescription<CollectionMetadataT>,
 88 │     includeHidden?: boolean,
 89 │   ): string[];
 90 │ 
 91 ▶   createSchematicDescription(
 92 │     name: string,
 93 │     collection: CollectionDescription<CollectionMetadataT>,
 94 ▶   ): SchematicDescription<CollectionMetadataT, SchematicMetadataT> | null;
 95 ▶   getSchematicRuleFactory<OptionT extends object>(
 96 │     schematic: SchematicDescription<CollectionMetadataT, SchematicMetadataT>,
 97 │     collection: CollectionDescription<CollectionMetadataT>,
 98 │   ): RuleFactory<OptionT>;
 99 ▶   createSourceFromUrl(
100 │     url: Url,
101 │     context: TypedSchematicContext<CollectionMetadataT, SchematicMetadataT>,
102 ▶   ): Source | null;
103 ▶   transformOptions<OptionT extends object, ResultT extends object>(
104 │     schematic: SchematicDescription<CollectionMetadataT, SchematicMetadataT>,
105 │     options: OptionT,
106 │     context?: TypedSchematicContext<CollectionMetadataT, SchematicMetadataT>,
107 │   ): Observable<ResultT>;
108 ▶   transformContext(
109 │     context: TypedSchematicContext<CollectionMetadataT, SchematicMetadataT>,
110 ▶   ): TypedSchematicContext<CollectionMetadataT, SchematicMetadataT> | void;
111 ▶   createTaskExecutor(name: string): Observable<TaskExecutor>;
112 ▶   hasTaskExecutor(name: string): boolean;
113 │ 
114 ▶   readonly defaultMergeStrategy?: MergeStrategy;
115 │ }
```

`SchematicEngine` 自身はファイルを 1 つも読みません。読むのは 81 行目の `EngineHost` を実装した係で、エンジンは「この名前の collection の説明をくれ」（82 行目）、「この collection のこの名前の schematic の説明をくれ」（91 行目）、「その説明から RuleFactory をくれ」（95 行目）と聞くだけです。84 行目の `requester` は「どの collection から頼まれたか」で、別の collection の schematic を呼ぶときの探し方に使います。94 行目は見つからないとき `null`、102 行目は知らない URL のとき `null`、110 行目は context を変えないとき `void` を返してよい、という約束です。111〜112 行目が task の実行係、114 行目が既定の `MergeStrategy` です。

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/interface.ts` L187–211 （▶ の行: 195–201, 211）

```ts
187 │ /**
188 │  * A SchematicContext. Contains information necessary for Schematics to execute some rules, for
189 │  * example when using another schematics, as we need the engine and collection.
190 │  */
191 │ export interface TypedSchematicContext<
192 │   CollectionMetadataT extends object,
193 │   SchematicMetadataT extends object,
194 │ > {
195 ▶   readonly debug: boolean;
196 ▶   readonly engine: Engine<CollectionMetadataT, SchematicMetadataT>;
197 ▶   readonly logger: logging.LoggerApi;
198 ▶   readonly schematic: Schematic<CollectionMetadataT, SchematicMetadataT>;
199 ▶   readonly strategy: MergeStrategy;
200 ▶   readonly interactive: boolean;
201 ▶   addTask<T extends object>(
202 │     task: TaskConfigurationGenerator<T>,
203 │     dependencies?: Array<TaskId>,
204 │   ): TaskId;
205 │ }
206 │ 
207 │ /**
208 │  * This is used by the Schematics implementations in order to avoid needing to have typing from
209 │  * the tooling. Schematics are not specific to a tool.
210 │  */
211 ▶ export type SchematicContext = TypedSchematicContext<{}, {}>;
```

Rule の 2 つ目の引数の `context` の中身はこの 7 つです。196 行目の `engine` があるので、Rule の中から別の collection を作れます（`externalSchematic` がこれを使う）。199 行目の `strategy` は `mergeWith` の既定、201 行目の `addTask` が後片付けの予約です。211 行目の `SchematicContext` は型引数を `{}` にしたもので、schematic を書く人はこの型だけを使います。

## 2. collection を作る：キャッシュと extends

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/engine.ts` L171–209 （▶ の行: 174–175, 179, 182–183, 190, 197–199, 202, 204–206）

```ts
171 │ export class SchematicEngine<CollectionT extends object, SchematicT extends object>
172 │   implements Engine<CollectionT, SchematicT>
173 │ {
174 ▶   private _collectionCache = new Map<string, CollectionImpl<CollectionT, SchematicT>>();
175 ▶   private _schematicCache = new WeakMap<
176 │     Collection<CollectionT, SchematicT>,
177 │     Map<string, SchematicImpl<CollectionT, SchematicT>>
178 │   >();
179 ▶   private _taskSchedulers = new Array<TaskScheduler>();
180 │ 
181 │   constructor(
182 ▶     private _host: EngineHost<CollectionT, SchematicT>,
183 ▶     protected _workflow?: Workflow | undefined,
184 │   ) {}
185 │ 
186 │   get workflow(): Workflow | null {
187 │     return this._workflow || null;
188 │   }
189 │   get defaultMergeStrategy(): MergeStrategy {
190 ▶     return this._host.defaultMergeStrategy || MergeStrategy.Default;
191 │   }
192 │ 
193 │   createCollection(
194 │     name: string,
195 │     requester?: Collection<CollectionT, SchematicT>,
196 │   ): Collection<CollectionT, SchematicT> {
197 ▶     let collection = this._collectionCache.get(name);
198 ▶     if (collection) {
199 ▶       return collection;
200 │     }
201 │ 
202 ▶     const [description, bases] = this._createCollectionDescription(name, requester?.description);
203 │ 
204 ▶     collection = new CollectionImpl<CollectionT, SchematicT>(description, this, bases);
205 ▶     this._collectionCache.set(name, collection);
206 ▶     this._schematicCache.set(collection, new Map());
207 │ 
208 │     return collection;
209 │   }
```

174 行目、collection のキャッシュは**名前**が鍵です。197〜200 行目で同じ名前なら、2 つ目の引数の `requester` を見ずに前のものを返します。記録の「キャッシュ」では、同じパスで 2 回呼ぶと同じオブジェクトでした。202 行目で説明を作り、204 行目で `CollectionImpl` に包み、206 行目でその collection 用の schematic のキャッシュ（175 行目、collection を鍵にした `WeakMap`）を空で作ります。183 行目の `_workflow` は、[次の回](08-dvk-workflow.md)の `BaseWorkflow` が自分を渡す所です。

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/engine.ts` L211–239 （▶ の行: 216–218, 220–221, 225–228, 230–231, 234）

```ts
211 │   private _createCollectionDescription(
212 │     name: string,
213 │     requester?: CollectionDescription<CollectionT>,
214 │     parentNames?: Set<string>,
215 │   ): [CollectionDescription<CollectionT>, Array<CollectionDescription<CollectionT>>] {
216 ▶     const description = this._host.createCollectionDescription(name, requester);
217 ▶     if (!description) {
218 ▶       throw new UnknownCollectionException(name);
219 │     }
220 ▶     if (parentNames && parentNames.has(description.name)) {
221 ▶       throw new CircularCollectionException(name);
222 │     }
223 │ 
224 │     const bases = new Array<CollectionDescription<CollectionT>>();
225 ▶     if (description.extends) {
226 ▶       parentNames = (parentNames || new Set<string>()).add(description.name);
227 ▶       for (const baseName of description.extends) {
228 ▶         const [base, baseBases] = this._createCollectionDescription(
229 │           baseName,
230 ▶           description,
231 ▶           new Set(parentNames),
232 │         );
233 │ 
234 ▶         bases.unshift(base, ...baseBases);
235 │       }
236 │     }
237 │ 
238 │     return [description, bases];
239 │   }
```

1. **216〜219 行目：host に説明を頼む**

   host が何も返さなければ `Unknown collection`。実際の `NodeModulesEngineHost` は見つからないとき自分で例外を投げるので、ここまで来ません（次の回）。
2. **225〜236 行目：`extends` をたどる**

   `collection.json` の `"extends"` に書いた collection を、230 行目で今の説明を `requester` にして再帰で作ります。226 行目で自分の名前を積み、220 行目で同じ名前に戻ってきたら `Circular collection reference` です。
3. **234 行目：`unshift` で前に入れる**

   `extends: ["x", "y"]` なら、x を入れたあと y を前に入れるので、`bases` は `[y, …, x, …]` になります。3 節の 317 行目は `bases` を前から探すので、同じ名前の schematic があれば**後に書いた**方が使われます。

`requester` の引数は 5ce621e371（2020-09、`fix(@angular-devkit/schematics): resolve external schematics from requesting collection`）が足しました。それまでは `externalSchematic` の collection をワークスペースからしか探さず、schematic のパッケージが自分の依存に持っている collection を呼べませんでした。同じコミットで 175 行目のキャッシュの鍵も名前から collection に変わっています。

## 3. schematic を作る：別名・extends・private

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/engine.ts` L301–340 （▶ の行: 306, 308–309, 314, 316–318, 320, 327, 331–332, 335–336, 338）

```ts
301 │   createSchematic(
302 │     name: string,
303 │     collection: Collection<CollectionT, SchematicT>,
304 │     allowPrivate = false,
305 │   ): Schematic<CollectionT, SchematicT> {
306 ▶     const schematicMap = this._schematicCache.get(collection);
307 │ 
308 ▶     let schematic = schematicMap?.get(name);
309 ▶     if (schematic) {
310 │       return schematic;
311 │     }
312 │ 
313 │     let collectionDescription = collection.description;
314 ▶     let description = this._host.createSchematicDescription(name, collection.description);
315 │     if (!description) {
316 ▶       if (collection.baseDescriptions) {
317 ▶         for (const base of collection.baseDescriptions) {
318 ▶           description = this._host.createSchematicDescription(name, base);
319 │           if (description) {
320 ▶             collectionDescription = base;
321 │             break;
322 │           }
323 │         }
324 │       }
325 │       if (!description) {
326 │         // Report the error for the top level schematic collection
327 ▶         throw new UnknownSchematicException(name, collection.description);
328 │       }
329 │     }
330 │ 
331 ▶     if (description.private && !allowPrivate) {
332 ▶       throw new PrivateSchematicException(name, collection.description);
333 │     }
334 │ 
335 ▶     const factory = this._host.getSchematicRuleFactory(description, collectionDescription);
336 ▶     schematic = new SchematicImpl<CollectionT, SchematicT>(description, factory, collection, this);
337 │ 
338 ▶     schematicMap?.set(name, schematic);
339 │ 
340 │     return schematic;
```

308 行目のキャッシュの鍵は**呼んだ名前**です。別名の解決は 314 行目の host の中（次の回）なので、`'o'` と `'outer'` は別々に作られ、記録では `createSchematic('o') === createSchematic('outer')` が `false` でした。中身は同じ schematic です。316〜324 行目、自分の collection に無ければ 2 節の `bases` を前から探し、見つけた collection の説明を 335 行目の `getSchematicRuleFactory` に渡します。

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/engine.ts` L47–82 （▶ の行: 53, 55, 59, 61, 65, 67, 71, 74, 78, 80）

```ts
47 │ export class CircularCollectionException extends BaseException {
48 │   constructor(name: string) {
49 │     super(`Circular collection reference "${name}".`);
50 │   }
51 │ }
52 │ 
53 ▶ export class UnknownSchematicException extends BaseException {
54 │   constructor(name: string, collection: CollectionDescription<{}>) {
55 ▶     super(`Schematic "${name}" not found in collection "${collection.name}".`);
56 │   }
57 │ }
58 │ 
59 ▶ export class PrivateSchematicException extends BaseException {
60 │   constructor(name: string, collection: CollectionDescription<{}>) {
61 ▶     super(`Schematic "${name}" not found in collection "${collection.name}".`);
62 │   }
63 │ }
64 │ 
65 ▶ export class SchematicEngineConflictingException extends BaseException {
66 │   constructor() {
67 ▶     super(`A schematic was called from a different engine as its parent.`);
68 │   }
69 │ }
70 │ 
71 ▶ export class UnregisteredTaskException extends BaseException {
72 │   constructor(name: string, schematic?: SchematicDescription<{}, {}>) {
73 │     const addendum = schematic ? ` in schematic "${schematic.name}"` : '';
74 ▶     super(`Unregistered task "${name}"${addendum}.`);
75 │   }
76 │ }
77 │ 
78 ▶ export class UnknownTaskDependencyException extends BaseException {
79 │   constructor(id: TaskId) {
80 ▶     super(`Unknown task dependency [ID: ${id.id}].`);
81 │   }
82 │ }
```

331〜333 行目、`private: true` の schematic は `allowPrivate` が無ければ `PrivateSchematicException` です。その文は 61 行目で、55 行目の「無い」ときと**一字一句同じ**「Schematic "inner" not found in collection …」でした（記録の「private」）。例外のクラスは違うので、コードからは区別できますが、画面の文からは「無い」のか「private」なのか分かりません。main も同じです。

## 4. schematic.call と context：作る順

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/schematic.ts` L51–90 （▶ の行: 57, 59–61, 63, 66, 69, 71, 76, 78–81, 84–85）

```ts
51 │   call<OptionT extends object>(
52 │     options: OptionT,
53 │     host: Observable<Tree>,
54 │     parentContext?: Partial<TypedSchematicContext<CollectionT, SchematicT>>,
55 │     executionOptions?: Partial<ExecutionOptions>,
56 │   ): Observable<Tree> {
57 ▶     const context = this._engine.createContext(this, parentContext, executionOptions);
58 │ 
59 ▶     return host.pipe(
60 ▶       first(),
61 ▶       concatMap((tree) =>
62 │         this._engine
63 ▶           .transformOptions(this, options, context)
64 │           .pipe(map((o) => [tree, o] as [Tree, OptionT])),
65 │       ),
66 ▶       concatMap(([tree, transformedOptions]) => {
67 │         let input: Tree;
68 │         let scoped = false;
69 ▶         if (executionOptions && executionOptions.scope) {
70 │           scoped = true;
71 ▶           input = new ScopedTree(tree, executionOptions.scope);
72 │         } else {
73 │           input = tree;
74 │         }
75 │ 
76 ▶         return callRule(this._factory(transformedOptions), input, context).pipe(
77 │           map((output) => {
78 ▶             if (output === input) {
79 ▶               return tree;
80 ▶             } else if (scoped) {
81 ▶               tree.merge(output);
82 │ 
83 │               return tree;
84 ▶             } else {
85 ▶               return output;
86 │             }
87 │           }),
88 │         );
89 │       }),
90 │     );
```

1. **57 行目：context は `call()` を呼んだ時点で作る**

   Observable を購読する前です。記録の「flow」では `schematic.call`（7 番）のすぐ後に `createContext`（8・9 番）が出ました。
2. **60〜65 行目：Tree を 1 つ取り、options を変換する**

   `first()` で最初の Tree だけを使い、63 行目の `transformOptions` を待ちます。記録ではこれが 10 番、RuleFactory が呼ばれたのは 11 番で、変換の**後**です。
3. **66〜74 行目：scope**

   `executionOptions.scope` があれば、`ScopedTree`（そのフォルダを根に見せる Tree。第 6 回）を Rule に渡します。
4. **76 行目：factory を呼んで Rule を作り、`callRule` で流す**

   `callRule` の中身は[Rule の組み立ての章](../cli/14-schematics-rules.md)です。
5. **78〜86 行目：返す Tree を選ぶ**

   Rule が受け取った Tree をそのまま返したら元の `tree`（scope の包みを外す）、scope 付きなら 81 行目で元に重ね、それ以外は Rule が返した別の Tree です。

63 行目の変換が何をするかは engine host 次第です。記録で `SchematicEngine` を素の `NodeModulesEngineHost` で作ると、変換は何も登録されていないので options は素通しで、schema の `"default": "UserCard"` は入りませんでした。`{}` で呼ぶと、テンプレートの `name` が無く「Failed to apply content template to "/\_\_name@dasherize\_\_/…": name is not defined」です（記録の「options を {}」。パスが付くのは 22.2.7 の 3ed20d1db0 から）。default を入れるのはワークフローが登録する変換で、[次の回](08-dvk-workflow.md)で読みます。

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/engine.ts` L241–275 （▶ の行: 247–248, 251–252, 254–255, 258–260, 262–263, 265–266, 268, 271, 273）

```ts
241 │   createContext(
242 │     schematic: Schematic<CollectionT, SchematicT>,
243 │     parent?: Partial<TypedSchematicContext<CollectionT, SchematicT>>,
244 │     executionOptions?: Partial<ExecutionOptions>,
245 │   ): TypedSchematicContext<CollectionT, SchematicT> {
246 │     // Check for inconsistencies.
247 ▶     if (parent && parent.engine && parent.engine !== this) {
248 ▶       throw new SchematicEngineConflictingException();
249 │     }
250 │ 
251 ▶     let interactive = true;
252 ▶     if (executionOptions && executionOptions.interactive != undefined) {
253 │       interactive = executionOptions.interactive;
254 ▶     } else if (parent && parent.interactive != undefined) {
255 ▶       interactive = parent.interactive;
256 │     }
257 │ 
258 ▶     let context: TypedSchematicContext<CollectionT, SchematicT> = {
259 ▶       debug: (parent && parent.debug) || false,
260 ▶       engine: this,
261 │       logger:
262 ▶         (parent && parent.logger && parent.logger.createChild(schematic.description.name)) ||
263 ▶         new logging.NullLogger(),
264 │       schematic,
265 ▶       strategy:
266 ▶         parent && parent.strategy !== undefined ? parent.strategy : this.defaultMergeStrategy,
267 │       interactive,
268 ▶       addTask,
269 │     };
270 │ 
271 ▶     const maybeNewContext = this._host.transformContext(context);
272 │     if (maybeNewContext) {
273 ▶       context = maybeNewContext;
274 │     }
275 │ 
```

247〜249 行目、親の context が別のエンジンのものなら例外です。251〜256 行目、`interactive`（x-prompt で聞いてよいか）は実行のオプション → 親 → `true` の順。262 行目、logger は親の logger の子で、名前は schematic の名前です。記録の `outer` の Rule では `logger=outer`、そこから呼んだ `inner` では `logger=inner` でした。265〜266 行目、`strategy` は親から受け継ぎ、無ければエンジンの既定（記録では 0 = `MergeStrategy.Default`）。271〜274 行目で host に context を差し替える機会を与えます（テスト用の host が `addTask` を包むのに使う。[第 11 回](11-dvk-testing.md)）。この `interactive` の受け継ぎは cdbc1988f2（2018-08、`feat(@angular-devkit/schematics): allow schematic rules to control interactivity`）が入れました。

## 5. addTask と TaskScheduler：予約した順には走らない

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/engine.ts` L276–299 （▶ の行: 276, 278, 284, 286–287, 290, 292, 295）

```ts
276 ▶     const taskScheduler = new TaskScheduler(context);
277 │     const host = this._host;
278 ▶     this._taskSchedulers.push(taskScheduler);
279 │ 
280 │     function addTask<T extends object>(
281 │       task: TaskConfigurationGenerator<T>,
282 │       dependencies?: Array<TaskId>,
283 │     ): TaskId {
284 ▶       const config = task.toConfiguration();
285 │ 
286 ▶       if (!host.hasTaskExecutor(config.name)) {
287 ▶         throw new UnregisteredTaskException(config.name, schematic.description);
288 │       }
289 │ 
290 ▶       config.dependencies = config.dependencies || [];
291 │       if (dependencies) {
292 ▶         config.dependencies.unshift(...dependencies);
293 │       }
294 │ 
295 ▶       return taskScheduler.schedule(config);
296 │     }
297 │ 
298 │     return context;
299 │   }
```

276 行目、**context を 1 つ作るたびに**`TaskScheduler` を 1 つ作り、278 行目でエンジンの配列に積みます。`addTask` は 284 行目で task のオブジェクトから設定（名前と options）を取り出し、286〜288 行目で実行係が無い名前なら、予約の時点で `Unregistered task "nope" in schematic "outer".` です（記録の「登録の無い task」）。

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/engine.ts` L109–141 （▶ の行: 110–112, 117–118, 121, 132–134）

```ts
109 │ export class TaskScheduler {
110 ▶   private _queue = new PriorityQueue<TaskInfo>((x, y) => x.priority - y.priority);
111 ▶   private _taskIds = new Map<TaskId, TaskInfo>();
112 ▶   private static _taskIdCounter = 1;
113 │ 
114 │   constructor(private _context: SchematicContext) {}
115 │ 
116 │   private _calculatePriority(dependencies: Set<TaskInfo>): number {
117 ▶     if (dependencies.size === 0) {
118 ▶       return 0;
119 │     }
120 │ 
121 ▶     const prio = [...dependencies].reduce((prio, task) => prio + task.priority, 1);
122 │ 
123 │     return prio;
124 │   }
125 │ 
126 │   private _mapDependencies(dependencies?: Array<TaskId>): Set<TaskInfo> {
127 │     if (!dependencies) {
128 │       return new Set();
129 │     }
130 │ 
131 │     const tasks = dependencies.map((dep) => {
132 ▶       const task = this._taskIds.get(dep);
133 ▶       if (!task) {
134 ▶         throw new UnknownTaskDependencyException(dep);
135 │       }
136 │ 
137 │       return task;
138 │     });
139 │ 
140 │     return new Set(tasks);
141 │   }
```

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/engine.ts` L143–169 （▶ の行: 144–145, 148, 154, 156–157, 159, 163–165）

```ts
143 │   schedule<T extends object>(taskConfiguration: TaskConfiguration<T>): TaskId {
144 ▶     const dependencies = this._mapDependencies(taskConfiguration.dependencies);
145 ▶     const priority = this._calculatePriority(dependencies);
146 │ 
147 │     const task = {
148 ▶       id: TaskScheduler._taskIdCounter++,
149 │       priority,
150 │       configuration: taskConfiguration,
151 │       context: this._context,
152 │     };
153 │ 
154 ▶     this._queue.push(task);
155 │ 
156 ▶     const id = { id: task.id };
157 ▶     this._taskIds.set(id, task);
158 │ 
159 ▶     return id;
160 │   }
161 │ 
162 │   finalize(): ReadonlyArray<TaskInfo> {
163 ▶     const tasks = this._queue.toArray();
164 ▶     this._queue.clear();
165 ▶     this._taskIds.clear();
166 │ 
167 │     return tasks;
168 │   }
169 │ }
```

1. **優先度：依存の和 + 1**

   117〜119 行目、依存が無ければ 0。121 行目、あれば「依存の優先度の和 + 1」。依存されるものほど小さい数になります。
2. **110 行目：小さい順に並ぶ列**

   `PriorityQueue`（[第 5 回](05-dvk-logger.md)）は、入れるとき「比べて 0 以下になる最初の要素」の前に入れます。比較は優先度の差だけなので、**同じ優先度なら後から入れたものが前**に来ます。
3. **156〜157 行目：TaskId はその場で作ったオブジェクト**

   111 行目の `Map` の鍵は `{ id }` のオブジェクトそのものです。132 行目の `get` は同じオブジェクトでないと見つからず、134 行目で `Unknown task dependency` です。
4. **148 行目：番号は全部のエンジンで通し**

   112 行目の `static` なので、同じプロセスで作った別のエンジンとも番号を分け合います。

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/engine.ts` L383–407 （▶ の行: 384, 386–388, 391, 393, 396, 398, 400）

```ts
383 │   executePostTasks(): Observable<void> {
384 ▶     const executors = new Map<string, TaskExecutor>();
385 │ 
386 ▶     const taskObservable = observableFrom(this._taskSchedulers).pipe(
387 ▶       concatMap((scheduler) => scheduler.finalize()),
388 ▶       concatMap((task) => {
389 │         const { name, options } = task.configuration;
390 │ 
391 ▶         const executor = executors.get(name);
392 │         if (executor) {
393 ▶           return executor(options, task.context);
394 │         }
395 │ 
396 ▶         return this._host.createTaskExecutor(name).pipe(
397 │           concatMap((executor) => {
398 ▶             executors.set(name, executor);
399 │ 
400 ▶             return executor(options, task.context);
401 │           }),
402 │         );
403 │       }),
404 │     );
405 │ 
406 │     return taskObservable;
407 │   }
```

386〜387 行目、`executePostTasks` は scheduler を**作った順**（つまり context を作った順）に取り出し、それぞれの列を 163 行目の `toArray` の順に流します。396〜398 行目、実行係は名前ごとに 1 回だけ作ります（記録では `createTaskExecutor("log")` が 1 回）。

記録の「flow」の `outer` は A・B・C（A に依存）・D の順に予約しました。走った順は **D → B → A → C**、その後に `inner` の E でした。A・B・D は優先度 0 で、後から入れたものが前に来たからです。C は優先度 1 なので最後です。依存を書いた C は A の後で正しく走りますが、依存を書かない task 同士は予約の逆順になります。`@schematics/angular` の ng-new は、npm install の task を予約してから、git init の task をその TaskId を依存にして予約しているので、この並びの影響を受けません。

記録の「inner が outer の TaskId を依存に渡す」では、`outer` の A の TaskId（`{"id":1}`）を `inner` の `addTask` の依存に渡すと「Unknown task dependency \[ID: 1\].」でした。`inner` の context は 6 節の `schematic()` が呼ぶ `call` で新しく作られ、276 行目で別の scheduler を持つからです。番号を写した `{ id: 1 }` を新しく作って渡しても同じ例外です（132 行目の `get` がオブジェクトで比べる）。

## 6. 規則の残り：url・schematic()・partitionApplyMerge・renameTemplateFiles

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/engine.ts` L359–381 （▶ の行: 364, 368–372, 375–377）

```ts
359 │   transformOptions<OptionT extends object, ResultT extends object>(
360 │     schematic: Schematic<CollectionT, SchematicT>,
361 │     options: OptionT,
362 │     context?: TypedSchematicContext<CollectionT, SchematicT>,
363 │   ): Observable<ResultT> {
364 ▶     return this._host.transformOptions<OptionT, ResultT>(schematic.description, options, context);
365 │   }
366 │ 
367 │   createSourceFromUrl(url: Url, context: TypedSchematicContext<CollectionT, SchematicT>): Source {
368 ▶     switch (url.protocol) {
369 ▶       case 'null:':
370 ▶         return () => new NullTree();
371 ▶       case 'empty:':
372 ▶         return () => empty();
373 │     }
374 │ 
375 ▶     const hostSource = this._host.createSourceFromUrl(url, context);
376 ▶     if (!hostSource) {
377 ▶       throw new UnknownUrlSourceProtocol(url.toString());
378 │     }
379 │ 
380 │     return hostSource;
381 │   }
```

`url('./files')` は [Rule の組み立ての章](../cli/14-schematics-rules.md)で読んだとおり、ここに来ます。369〜372 行目の `null:` と `empty:` だけはエンジン自身が答え、記録では `url('null:')` は `NullTree`、`url('empty:')` は空の `HostTree` でした。それ以外は 375 行目で host に回し、host が `null` を返すと 377 行目の例外です。その文は「Unknown Protocol on url "\[object Object\]".」でした。`url` は Node の `url.parse()` が返す古い `Url` のオブジェクトで、`toString()` を持たず、`Object.prototype.toString` の文字列になるからです。`url.href`（`foo:bar`）を使えば URL が出ます。main も同じです。

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/schematic.ts` L44–71 （▶ の行: 57–58, 60–61, 63–65）

```ts
44 │ 
45 │ /**
46 │  * Run a schematic from the same collection.
47 │  *
48 │  * @param schematicName The name of the schematic to run.
49 │  * @param options The options to pass as input to the RuleFactory.
50 │  */
51 │ export function schematic<OptionT extends object>(
52 │   schematicName: string,
53 │   options: OptionT,
54 │   executionOptions?: Partial<ExecutionOptions>,
55 │ ): Rule {
56 │   return (input: Tree, context: SchematicContext) => {
57 ▶     const collection = context.schematic.collection;
58 ▶     const schematic = collection.createSchematic(schematicName, true);
59 │ 
60 ▶     return schematic.call(options, observableOf(branch(input)), context, executionOptions).pipe(
61 ▶       last(),
62 │       map((x) => {
63 ▶         // We allow overwrite conflict here because they're the only merge conflict we particularly
64 ▶         // don't want to deal with; the input tree might have an OVERWRITE which the sub
65 ▶         input.merge(x, MergeStrategy.AllowOverwriteConflict);
66 │ 
67 │         return input;
68 │       }),
69 │     );
70 │   };
71 │ }
```

同じ collection の schematic を呼ぶ `schematic()` です。57 行目で今の collection を使い（`createCollection` を呼ばないので、記録の 22 番は `createSchematicDescription("inner")` だけ）、58 行目で `allowPrivate` を `true` にするので private の `inner` も呼べます。60 行目で今の `context` を親として渡すので、4 節の `createContext` は `parent=context#1` でした。記録の 29 番のとおり、`inner` の Rule には `outer` がそこまでに作った 2 つのファイルが見えています（`branch(input)` は今の Tree の複製）。63〜64 行目のコメントは「the input tree might have an OVERWRITE which the sub」で文の途中で終わっています（`externalSchematic` の側にはコメントが無い）。

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/base.ts` L97–125 （▶ の行: 98, 100–101, 103, 108, 114, 116, 119）

```ts
 97 │ 
 98 ▶ export function when(predicate: FilePredicate<boolean>, operator: FileOperator): FileOperator {
 99 │   return (entry: FileEntry) => {
100 ▶     if (predicate(entry.path, entry)) {
101 ▶       return operator(entry);
102 │     } else {
103 ▶       return entry;
104 │     }
105 │   };
106 │ }
107 │ 
108 ▶ export function partitionApplyMerge(
109 │   predicate: FilePredicate<boolean>,
110 │   ruleYes: Rule,
111 │   ruleNo?: Rule,
112 │ ): Rule {
113 │   return (tree, context) => {
114 ▶     const [yes, no] = partition(tree, predicate);
115 │ 
116 ▶     return concat(callRule(ruleYes, yes, context), callRule(ruleNo || noop(), no, context)).pipe(
117 │       toArray(),
118 │       map(([yesTree, noTree]) => {
119 ▶         yesTree.merge(noTree, context.strategy);
120 │ 
121 │         return yesTree;
122 │       }),
123 │     );
124 │   };
125 │ }
```

98〜106 行目の `when` は、条件に合うファイルだけに `FileOperator`（ファイル 1 つを変える関数）をかけます。108〜125 行目の `partitionApplyMerge` は、114 行目で Tree を条件で 2 つに分け、116 行目で別々の Rule を順に流し、119 行目で no の側を yes の側に `context.strategy` で重ねます。

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/template.ts` L15–51 （▶ の行: 15, 17, 19, 23, 25, 29, 31, 42, 44, 48, 51）

```ts
15 ▶ export const TEMPLATE_FILENAME_RE: RegExp = /\.template$/;
16 │ 
17 ▶ export class OptionIsNotDefinedException extends BaseException {
18 │   constructor(name: string) {
19 ▶     super(`Option "${name}" is not defined.`);
20 │   }
21 │ }
22 │ 
23 ▶ export class UnknownPipeException extends BaseException {
24 │   constructor(name: string) {
25 ▶     super(`Pipe "${name}" is not defined.`);
26 │   }
27 │ }
28 │ 
29 ▶ export class InvalidPipeException extends BaseException {
30 │   constructor(name: string) {
31 ▶     super(`Pipe "${name}" is invalid.`);
32 │   }
33 │ }
34 │ 
35 │ export type PathTemplateValue = boolean | string | number | undefined;
36 │ export type PathTemplatePipeFunction = (x: string) => PathTemplateValue;
37 │ export type PathTemplateData = {
38 │   [key: string]: PathTemplateValue | PathTemplateData | PathTemplatePipeFunction;
39 │ };
40 │ 
41 │ export interface PathTemplateOptions {
42 ▶   // Interpolation start and end strings.
43 │   interpolationStart: string;
44 ▶   // Interpolation start and end strings.
45 │   interpolationEnd: string;
46 │ 
47 │   // Separator for pipes. Do not specify to remove pipe support.
48 ▶   pipeSeparator?: string;
49 │ }
50 │ 
51 ▶ const decoder = new TextDecoder('utf-8', { fatal: true });
```

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/template.ts` L156–175 （▶ の行: 157–158, 164, 166, 169）

```ts
156 │ 
157 ▶ export function pathTemplate<T extends PathTemplateData>(options: T): Rule {
158 ▶   return forEach(applyPathTemplate(options));
159 │ }
160 │ 
161 │ /**
162 │  * Remove every `.template` suffix from file names.
163 │  */
164 ▶ export function renameTemplateFiles(): Rule {
165 │   return forEach((entry) => {
166 ▶     if (entry.path.match(TEMPLATE_FILENAME_RE)) {
167 │       return {
168 │         content: entry.content,
169 ▶         path: normalize(entry.path.replace(TEMPLATE_FILENAME_RE, '')),
170 │       };
171 │     } else {
172 │       return entry;
173 │     }
174 │   });
175 │ }
```

15 行目の `.template` の正規表現を、164〜175 行目の `renameTemplateFiles` が使って拡張子を外します（169 行目で `normalize`）。`template()` と組むのがこれで、`applyTemplates` は自分で外します。17〜33 行目の 3 つの例外は、パスの `__x@pipe__` の置き換え（`applyPathTemplate`）が投げます。42 行目と 44 行目のコメントは同じ「Interpolation start and end strings.」で、44 行目は end の説明の写し間違いです。51 行目の `fatal: true` の decoder が、UTF-8 として読めないファイル（画像など）を見分けます。

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/call.ts` L14–47 （▶ の行: 15, 17, 19, 21–22, 24–27, 29, 39, 45）

```ts
14 │ function _getTypeOfResult(value?: {}): string {
15 ▶   if (value === undefined) {
16 │     return 'undefined';
17 ▶   } else if (value === null) {
18 │     return 'null';
19 ▶   } else if (typeof value == 'function') {
20 │     return `Function()`;
21 ▶   } else if (typeof value != 'object') {
22 ▶     return `${typeof value}(${JSON.stringify(value)})`;
23 │   } else {
24 ▶     if (Object.getPrototypeOf(value) == Object) {
25 ▶       return `Object(${JSON.stringify(value)})`;
26 ▶     } else if (value.constructor) {
27 ▶       return `Instance of class ${value.constructor.name}`;
28 │     } else {
29 ▶       return 'Unknown Object';
30 │     }
31 │   }
32 │ }
33 │ 
34 │ /**
35 │  * When a rule or source returns an invalid value.
36 │  */
37 │ export class InvalidRuleResultException extends BaseException {
38 │   constructor(value?: {}) {
39 ▶     super(`Invalid rule result: ${_getTypeOfResult(value)}.`);
40 │   }
41 │ }
42 │ 
43 │ export class InvalidSourceResultException extends BaseException {
44 │   constructor(value?: {}) {
45 ▶     super(`Invalid source result: ${_getTypeOfResult(value)}.`);
46 │   }
47 │ }
```

Rule や Source が Tree 以外を返したときの文を作る関数です。24 行目は「普通のオブジェクトなら `Object({…})` と中身を見せる」つもりの行ですが、`Object.getPrototypeOf({ a: 1 })` は `Object.prototype` で、`Object`（関数）ではないので、いつも偽です。記録の「Rule / Source が Tree 以外」では、`{ a: 1 }` を返すと 27 行目の「Invalid rule result: Instance of class Object.」でした。`Object.create(null)` は 29 行目の `Unknown Object` です。手元の 22.2.7 の写しの 24 行目を `Object.prototype` と比べる形に変えると、「Invalid rule result: Object({"a":1}).」になりました。数の `42` を返すと、この関数まで来ずに `callRule` の Tree の確かめ（`TreeSymbol in result`）が `TypeError: Cannot use 'in' operator …` を投げます。

## 7. format の検査：html-selector と path

📄 `angular-cli/packages/angular_devkit/schematics/src/formats/html-selector.ts` L11–50 （▶ の行: 11–13, 15, 33, 35, 37–38, 43, 46–47, 50）

```ts
11 ▶ // As per https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name
12 ▶ // * Without mandatory `-` as the application prefix will generally cover its inclusion
13 ▶ // * And an allowance for upper alpha characters
14 │ 
15 ▶ // NOTE: This should eventually be broken out into two formats: full and partial (allows for prefix)
16 │ 
17 │ const unicodeRanges = [
18 │   [0xc0, 0xd6],
19 │   [0xd8, 0xf6],
20 │   [0xf8, 0x37d],
21 │   [0x37f, 0x1fff],
22 │   [0x200c, 0x200d],
23 │   [0x203f, 0x2040],
24 │   [0x2070, 0x218f],
25 │   [0x2c00, 0x2fef],
26 │   [0x3001, 0xd7ff],
27 │   [0xf900, 0xfdcf],
28 │   [0xfdf0, 0xfffd],
29 │   [0x10000, 0xeffff],
30 │ ];
31 │ 
32 │ function isValidElementName(name: string) {
33 ▶   let regex = '^[a-zA-Z][';
34 │ 
35 ▶   regex += '-.0-9_a-zA-Z\\u{B7}';
36 │ 
37 ▶   for (const range of unicodeRanges) {
38 ▶     regex += `\\u{${range[0].toString(16)}}-\\u{${range[1].toString(16)}}`;
39 │   }
40 │ 
41 │   regex += ']*$';
42 │ 
43 ▶   return new RegExp(regex, 'u').test(name);
44 │ }
45 │ 
46 ▶ export const htmlSelectorFormat: schema.SchemaFormat = {
47 ▶   name: 'html-selector',
48 │   formatter: {
49 │     async: false,
50 ▶     validate: (name: unknown) => typeof name === 'string' && isValidElementName(name),
```

📄 `angular-cli/packages/angular_devkit/schematics/src/formats/path.ts` L9–23 （▶ の行: 12, 15, 17–20）

```ts
 9 │ import { normalize, schema } from '@angular-devkit/core';
10 │ 
11 │ export const pathFormat: schema.SchemaFormat = {
12 ▶   name: 'path',
13 │   formatter: {
14 │     async: false,
15 ▶     validate: (path: string) => {
16 │       // Check path is normalized already.
17 ▶       return path === normalize(path);
18 ▶       // TODO: check if path is valid (is that just checking if it's normalized?)
19 ▶       // TODO: check path is from root of schematics even if passed absolute
20 ▶       // TODO: error out if path is outside of host
21 │     },
22 │   },
23 │ };
```

schematic の `schema.json` の `"format": "html-selector"` と `"format": "path"` の中身です。schema の登録簿への足し方と検査の流れは[第 3 回](03-dvk-schema.md)で、ここは 2 つの判定だけを見ます。33 行目、1 文字目は英字、35〜39 行目、2 文字目からは `-.0-9_a-zA-Z` と `·` と 17〜30 行目の Unicode の範囲。12 行目のコメントのとおり `-` は必須でなく、記録では `app`・`AppRoot`・`app-`・`app--x`・`app-😀` が通り、`1app`・`app root`・空文字が落ちました。15 行目の NOTE（完全な名前と接頭辞つきの 2 つに分けたい）はまだそのままです。path は 17 行目、`normalize` して変わらないかだけを見ます。`a/b/`・`a//b`・`a/../b` は落ち、`../a` と空文字は通りました。20 行目の TODO（host の外を指すパスを弾く）はまだ無く、`../a` が通るのはそのためです。

> **🧪 DEMO — SchematicEngine を Node で直接動かした記録**
>
> ボタンは、記録用の collection（`outer`：テンプレートのフォルダ `files/` を `applyTemplates` → `move('src/app')` → `applyToSubtree('src', …)` → `schematic('inner')`、private の `inner`：ファイルを 1 つ作る）を `NodeModulesEngineHost` の子のクラス（全部の呼び出しを記録する）で動かした記録を再生します。task は名前 `log` の自作の実行係で、走ったことを記録するだけです。左の番号が起きた順、赤い印が例外、色の付いた行が task の実行です。
>
> ボタンを押すと記録が出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-engine)

## ここまでの呼び出し（記録の flow）

- 👤 `engine.createCollection('<work>/demo-col/collection.json')` — engine.ts L193
  - `_createCollectionDescription(name, requester)` → `host.createCollectionDescription` — L211・L216 — *extends は L228 で再帰*
- 👤 `collection.createSchematic('o')` — L301
  - `host.createSchematicDescription('o', …)` → `getSchematicRuleFactory` — L314・L335 — *別名は host が解く*
- 👤 `schematic.call(options, of(tree), { logger })` — schematic.ts L51
  - `engine.createContext(schematic, parent)` — engine.ts L241 — *call の時点で。scheduler も L276*
  - `engine.transformOptions` → `host.transformOptions` — schematic.ts L63・engine.ts L364
  - `callRule(this._factory(options), input, context)` — schematic.ts L76
    - `context.addTask(task, deps)` → `taskScheduler.schedule` — engine.ts L280・L143
    - `url('./files')` → `engine.createSourceFromUrl` — L367
    - `schematic('inner', …)` → `createSchematic('inner', collection, true)` — rules/schematic.ts L58 — *新しい context と scheduler*
- 👤 `engine.executePostTasks()` — engine.ts L383 — *scheduler の順 × 優先度の順*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `src/engine/schematic_spec.ts` | `Schematic`（50）› `works with a rule`（51）・`works with a rule that returns an observable`（72）・`works with nested chained function rules`（93）・`can be called with a scope`（141） | 4 節の `call`。`engine.ts` には spec のファイルが無く、TaskScheduler の並びと TaskId の約束を確かめる it はどこにも無い |
| `src/rules/call_spec.ts` | `callRule`（67）› `should throw InvalidRuleResultException when rule result is non-Tree object`（68）・`… is null`（76） | 6 節。例外のクラスだけを見ていて、文（`Instance of class Object`）は見ない |
| `src/rules/base_spec.ts` | `partitionApplyMerge`（187）› `works with simple rules`（188）・`applyToSubtree`（217）› `works`（218） | 6 節の `partitionApplyMerge` |
| `src/formats/html-selector_spec.ts`・`path_spec.ts` | `Schematics HTML selector format`（12）の 5 つ、`Schematics Path format`（12）の 2 つ | 7 節。`../a` と空文字の path は無い |
| `tools/file-system-engine-host_spec.ts` | `cannot instanciate a private schematic`（290）・`errors on simple circular collections`（213）ほか | 3 節の private と 2 節の循環（host の側から。次の回） |

📄 `走らせたコマンド（2026-11-26）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular_devkit/schematics:test --nocache_test_results --test_output=all
（結果は下の段落）
```

手元の bazel で `//packages/angular_devkit/schematics:test` は 101 specs・0 failures でした（`src/` の spec の全部）。

直すとしたら、5 節の並びは `engine.ts` の 110 行目の比較に `|| x.id - y.id` を足すと、同じ優先度は予約の順になります。手元の 22.2.7 の写しで試すと、記録の flow は A → B → D → C → E になりました。spec は `src/engine/` に engine\_spec.ts を作り、「依存の無い 3 つの task が予約の順に走る」と「別の context の TaskId を依存にすると `UnknownTaskDependencyException`」を足します（後者を許すなら、`_taskIds` を scheduler ごとでなくエンジンで 1 つにする）。6 節の 2 つは、`call.ts` の 24 行目を `Object.prototype` と比べる形にし、call\_spec.ts の 68 行目の it に文の確かめを足すこと、`engine.ts` の 377 行目に `url.href` を渡すことです。3 節の文は 61 行目を「is private」のような別の文にします。

## 聞かれそうな質問

**Q. addTask で 2 つ予約したら、書いた順に走りますか？**

依存を書かなければ逆順です。2 つとも優先度 0（117〜119 行目）で、110 行目の列は同じ優先度なら後から入れたものを前に置きます。記録は A・B・D の予約が D → B → A でした。順を決めたいときは、2 つ目の `addTask` の 2 つ目の引数に 1 つ目の戻り値を渡します（121 行目で優先度が 1 になる）。

**Q. 親の schematic で予約した task を、`schematic()` で呼んだ子の task の依存にできますか？**

できません。子の context は 276 行目で別の `TaskScheduler` を持ち、132 行目はその scheduler の `Map` だけを見るので「Unknown task dependency \[ID: 1\].」です。scheduler は作った順に流れる（386 行目）ので、親の task は子の task より先に走ります。

**Q. schematic の RuleFactory はいつ呼ばれますか？**

`schematic.call()` を呼んだときではなく、Tree が届いて options の変換が終わった後です（schematic.ts の 60〜65 行目の後、76 行目）。context はその前、57 行目で作られています。

**Q. private の schematic を呼ぶと「not found」と出ました。名前の間違いですか？**

名前が合っていても出ます。61 行目の `PrivateSchematicException` の文が 55 行目の「無い」と同じだからです。同じ collection の中からは `schematic()`（58 行目で `allowPrivate` が `true`）で呼べます。

**Q. SchematicEngine だけを作って schematic を走らせると、schema の default が入りません。**

default を入れるのはエンジンではなく、63 行目の変換（engine host に登録したもの）だからです。`NodeWorkflow` が登録簿の変換を足します（次の回）。素のエンジンでは options は素通しでした（記録）。

## 読み終えて

- エンジンは engine host に「説明をくれ」「RuleFactory をくれ」と聞くだけで、ファイルは読まない。collection は名前、schematic は呼んだ名前でキャッシュする。
- `extends` の `bases` は後に書いたものが前。private は `allowPrivate` が要り、その例外の文は「無い」と同じ。
- context は `call()` の時点で作り、logger は schematic の名前の子、strategy と interactive は親から受け継ぐ。RuleFactory は options の変換の後に呼ばれる。
- context ごとに TaskScheduler が 1 つ。同じ優先度の task は予約の逆順、別の context の TaskId は依存にできない。
- `_getTypeOfResult` の 24 行目と `UnknownUrlSourceProtocol` の文は、意図した中身を出さない（main も同じ）。

---

← 前: [Tree：schematic が触るファイルの木](06-dvk-tree.md)  
次: [ワークフローと engine host：sink・workflow・tools・tasks](08-dvk-workflow.md) →
