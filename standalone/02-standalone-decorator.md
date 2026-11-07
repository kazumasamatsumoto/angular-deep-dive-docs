[目次](../README.md) › [standalone コンポーネントの内側](README.md) › 第 2 回 / 全 14 回

# @Component が実行された瞬間（JIT）：compileComponent が ɵcmp を遅延定義し、imports を後から貼る

> compileComponent が Object.defineProperty で ɵcmp を getter にする行、directiveMetadata で standalone が既定 true になる行、JIT では declarations: \[\] で compile してから getStandaloneDefFunctions で directiveDefs / pipeDefs を貼る理由、hasDirectiveDependencies、schemas の扱い、compilationDepth と flushModuleScopingQueueAsMuchAsPossible の関係。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/standalone-decorator)

---

`@Component({...})` と書いたクラスが読み込まれた瞬間、JIT（実行時コンパイル）では何が起きるのでしょうか。この章では `compileComponent` を上から下まで読み、**ɵcmp がすぐには作られず getter として置かれる**こと、初回アクセスでコンパイラが `declarations: []`（依存ゼロ）で呼ばれること、その直後に standalone コンポーネントだけ `directiveDefs` / `pipeDefs` / `dependencies` が関数として貼り直されることを、1 ステップずつ確認します。AOT（ビルド時コンパイル）で同じ仕事をするのがコンパイラの ngtsc で、それは[次回](03-standalone-imports-check.md)からです。

読む対象は `packages/core/src/metadata/directives.ts`（デコレータ本体）、`packages/core/src/render3/jit/directive.ts`（`compileComponent`）、`packages/core/src/render3/deps_tracker/deps_tracker.ts`、`packages/compiler/src/jit_compiler_facade.ts` です。

1. [1. 概観](01-standalone.md)
2. **2. @Component 実行の瞬間（JIT）**（この章）
3. [3. imports の検証（AOT）](03-standalone-imports-check.md)
4. [4. 使った依存だけが残る](04-standalone-used-only.md)
5. [5. forwardRef と自己参照](05-standalone-forward-ref.md)
6. [6. ローカルコンパイル](06-standalone-local-compilation.md)
7. [7. 実行時の依存解決](07-standalone-directive-registry.md)
8. [8. providers の 2 つの行き先](08-standalone-providers-two-injectors.md)
9. [9. 入口の検査](09-standalone-entry-checks.md)
10. [10. hostDirectives](10-standalone-host-directives.md)
11. [11. @defer と imports](11-standalone-defer-deps.md)
12. [12. TestBed の差し替え](12-standalone-testbed-override.md)
13. [13. selectorless（実験的）](13-standalone-selectorless.md)
14. [14. foreignImports（内部向け）](14-standalone-foreign-imports.md)

## 1. @Component は compileComponent を呼ぶデコレータ

📄 `angular/packages/core/src/metadata/directives.ts` L674–686 （▶ の行: 680–683, 685）

```ts
674 │ /**
675 │  * Component decorator and metadata.
676 │  *
677 │  * @Annotation
678 │  * @publicApi
679 │  */
680 ▶ export const Component: ComponentDecorator = makeDecorator(
681 ▶   'Component',
682 ▶   (c: Component = {}) => ({changeDetection: ChangeDetectionStrategy.Eager, ...c}),
683 ▶   Directive,
684 │   undefined,
685 ▶   (type: Type<any>, meta: Component) => compileComponent(type, meta),
686 │ );
```

680 行目、`Component` は `makeDecorator` で作られます。682 行目で引数に `changeDetection: Eager` の既定値を混ぜ、683 行目で `Directive` を親にし、**685 行目の `(type, meta) => compileComponent(type, meta)` が、クラスにデコレータが適用された瞬間に呼ばれる関数**です。`makeDecorator` が返す `TypeDecorator` がこの関数（`typeFn`）を最初に呼ぶところは [NgModule シリーズ第 2 回](../ngmodule/02-ngmodule-decorator.md)で読みました。ここから先は `compileComponent` だけを追います。

## 2. ɵcmp は getter として置かれる

📄 `angular/packages/core/src/render3/jit/directive.ts` L70–99 （▶ の行: 70, 75, 78, 83, 85–88, 94–95）

```ts
70 ▶ export function compileComponent(type: Type<any>, metadata: Component): void {
71 │   // Initialize ngDevMode. This must be the first statement in compileComponent.
72 │   // See the `initNgDevMode` docstring for more information.
73 │   (typeof ngDevMode === 'undefined' || ngDevMode) && initNgDevMode();
74 │ 
75 ▶   let ngComponentDef: ComponentDef<unknown> | null = null;
76 │ 
77 │   // Metadata may have resources which need to be resolved.
78 ▶   maybeQueueResolutionOfComponentResources(type, metadata);
79 │ 
80 │   // Note that we're using the same function as `Directive`, because that's only subset of metadata
81 │   // that we need to create the ngFactoryDef. We're avoiding using the component metadata
82 │   // because we'd have to resolve the asynchronous templates.
83 ▶   addDirectiveFactoryDef(type, metadata);
84 │ 
85 ▶   Object.defineProperty(type, NG_COMP_DEF, {
86 ▶     get: () => {
87 ▶       if (ngComponentDef === null) {
88 ▶         const compiler = getCompilerFacade({
89 │           usage: JitCompilerUsage.Decorator,
90 │           kind: 'component',
91 │           type: type,
92 │         });
93 │ 
94 ▶         if (metadata.foreignImports !== undefined) {
95 ▶           throw new Error(
96 │             `Foreign components are not supported in JIT mode. ` +
97 │               `Component '${type.name}' cannot specify 'foreignImports'.`,
98 │           );
99 │         }
```

1. **75 行目：`ngComponentDef = null`**

   クロージャに閉じた変数です。ここに `ComponentDef` が入るのは、85 行目の getter が初めて呼ばれたときです。
2. **78 行目：`templateUrl` / `styleUrl` があれば解決待ちキューに入れる**

   JIT はファイルを読めないので、`templateUrl` のテンプレートは誰か（TestBed の `compileComponents()`）が `resolveComponentResources` で取ってくるまで待ちます。取ってくる前に ɵcmp を読むと 101〜113 行目のエラーになります（下）。
3. **83 行目：`ɵfac`（ファクトリ）も同じ形の getter で先に置く**

   コメント（80〜82 行目）のとおり、ファクトリの生成には `Directive` 相当のメタデータで足りるので、テンプレートの解決を待ちません。
4. **85〜86 行目：`Object.defineProperty(type, 'ɵcmp', { get })`**

   `NG_COMP_DEF` は文字列 `'ɵcmp'` です（render3/fields.ts）。**この時点では ɵcmp の中身は作られません**。87 行目、初回アクセスのときだけ中身を作ります。なぜ遅らせるかは「聞かれそうな質問」で答えます。
5. **88〜92 行目：コンパイラを取りに行く**

   `getCompilerFacade` は `@angular/compiler` が読み込まれていなければ失敗します（この節の最後）。
6. **94〜98 行目：`foreignImports` は JIT では例外**

   内部向けフィールドで、AOT 専用です（[第 14 回](14-standalone-foreign-imports.md)）。

📄 `angular/packages/core/src/render3/jit/directive.ts` L101–114 （▶ の行: 101–102, 112–113）

```ts
101 ▶         if (componentNeedsResolution(metadata)) {
102 ▶           const error = [`Component '${type.name}' is not resolved:`];
103 │           if (metadata.templateUrl) {
104 │             error.push(` - templateUrl: ${metadata.templateUrl}`);
105 │           }
106 │           if (metadata.styleUrls && metadata.styleUrls.length) {
107 │             error.push(` - styleUrls: ${JSON.stringify(metadata.styleUrls)}`);
108 │           }
109 │           if (metadata.styleUrl) {
110 │             error.push(` - styleUrl: ${metadata.styleUrl}`);
111 │           }
112 ▶           error.push(`Did you run and wait for 'resolveComponentResources()'?`);
113 ▶           throw new Error(error.join('\n'));
114 │         }
```

101 行目、`componentNeedsResolution`（`templateUrl` があって `template` が無い、または `styleUrl(s)` がある）なら、102〜113 行目でエラー。112 行目のメッセージ「Did you run and wait for 'resolveComponentResources()'?」は、TestBed で `await TestBed.compileComponents()` を忘れたときに見るものです。

### JIT コンパイラはどこにいるか

📄 `angular/packages/core/src/compiler/compiler_facade.ts` L23–34 （▶ の行: 24–26, 32, 34）

```ts
23 │ export function getCompilerFacade(request: JitCompilerUsageRequest): CompilerFacade {
24 ▶   const globalNg: ExportedCompilerFacade = global['ng'];
25 ▶   if (globalNg && globalNg.ɵcompilerFacade) {
26 ▶     return globalNg.ɵcompilerFacade;
27 │   }
28 │ 
29 │   if (typeof ngDevMode === 'undefined' || ngDevMode) {
30 │     // Log the type as an error so that a developer can easily navigate to the type from the
31 │     // console.
32 ▶     console.error(`JIT compilation failed for ${request.kind}`, request.type);
33 │ 
34 ▶     let message = `The ${request.kind} '${request.type.name}' needs to be compiled using the JIT compiler, but '@angular/compiler' is not available.\n\n`;
```

24〜26 行目、`global['ng'].ɵcompilerFacade` があればそれを返します。これを置くのは `@angular/compiler` パッケージの読み込み時です。無ければ 32〜34 行目、「needs to be compiled using the JIT compiler, but '@angular/compiler' is not available」。つまり**この章の処理が走るのは、`@angular/compiler` がバンドルに入っているときだけ**です。具体的には TestBed（`@angular/core/testing` が compiler を import する）と、`aot: false` の `ng serve`（[NgModule シリーズ第 6 回](../ngmodule/06-ngmodule-jit-scope.md)の builder schema）です。通常の `ng build` では ɵcmp はコンパイラが静的プロパティとして書き出すので、この getter は作られません。

## 3. メタデータを組む：declarations は空、standalone の印は 2 つ

📄 `angular/packages/core/src/render3/jit/directive.ts` L138–164 （▶ の行: 138–139, 150–155, 159–163）

```ts
138 ▶         const templateUrl = metadata.templateUrl || `ng:///${type.name}/template.html`;
139 ▶         const baseMeta = directiveMetadata(type, metadata);
140 │         const meta: R3ComponentMetadataFacade = {
141 │           ...baseMeta,
142 │           typeSourceSpan: compiler.createParseSourceSpan('Component', type.name, templateUrl),
143 │           template: metadata.template || '',
144 │           preserveWhitespaces,
145 │           styles:
146 │             typeof metadata.styles === 'string'
147 │               ? [metadata.styles]
148 │               : metadata.styles || EMPTY_ARRAY,
149 │           animations: metadata.animations,
150 ▶           // JIT components are always compiled against an empty set of `declarations`. Instead, the
151 ▶           // `directiveDefs` and `pipeDefs` are updated at a later point:
152 ▶           //  * for NgModule-based components, they're set when the NgModule which declares the
153 ▶           //    component resolves in the module scoping queue
154 ▶           //  * for standalone components, they're set just below, after `compileComponent`.
155 ▶           declarations: [],
156 │           changeDetection: metadata.changeDetection,
157 │           encapsulation,
158 │           viewProviders: metadata.viewProviders || null,
159 ▶           // We can't inspect whether any of the dependencies are actually directives, because they
160 ▶           // get patched on after compilation. That's why in JIT mode we consider that any
161 ▶           // dependency might be a directive dependency.
162 ▶           hasDirectiveDependencies:
163 ▶             !baseMeta.isStandalone || (metadata.imports != null && metadata.imports.length > 0),
164 │         };
```

1. **139 行目：`directiveMetadata(type, metadata)`**

   `Directive` と共通の部分（selector、inputs、providers など）を組みます。`isStandalone` が `metadata.standalone === undefined ? true : ...` で決まる行（405 行目）は [前回](01-standalone.md)で見ました。
2. **155 行目：`declarations: []`**

   150〜154 行目のコメントが理由です。**JIT のコンポーネントは常に「依存ゼロ」でコンパイルされ**、`directiveDefs` / `pipeDefs` は後から貼られます。NgModule のコンポーネントなら、宣言元の NgModule がキューから出たとき（[第 6 回](../ngmodule/06-ngmodule-jit-scope.md)）。standalone なら「`compileComponent` の直後」（4 節）。AOT ではここに「テンプレートで使った依存」が入り、コンパイラがテンプレート関数の中で直接参照できますが、JIT では依存の中身を見ずにコンパイルします。
3. **162〜163 行目：`hasDirectiveDependencies`**

   `!isStandalone || imports が 1 件以上`。159〜161 行目のコメント「依存が本当にディレクティブかどうかは、貼られるのが後なので分からない。だから JIT ではどの依存もディレクティブかもしれないと見なす」。この値がコンパイラ側で何を変えるかを次に見ます。

📄 `angular/packages/compiler/src/render3/view/compiler.ts` L201–211 （▶ の行: 201–204, 207, 211）

```ts
201 ▶   const compilationMode =
202 ▶     meta.isStandalone && !meta.hasDirectiveDependencies
203 ▶       ? TemplateCompilationMode.DomOnly
204 ▶       : TemplateCompilationMode.Full;
205 │ 
206 │   // First the template is ingested into IR:
207 ▶   const tpl = ingestComponent(
208 │     meta.name,
209 │     meta.template.nodes,
210 │     constantPool,
211 ▶     compilationMode,
```
*packages/compiler の compileComponentFromMetadata の中。JIT・AOT 共通。*

201〜204 行目、`isStandalone && !hasDirectiveDependencies` なら `TemplateCompilationMode.DomOnly`、そうでなければ `Full`。`DomOnly` はテンプレート関数に `ɵɵdomElement` のような「ディレクティブ照合をしない軽い命令」を出すモードで、207〜211 行目の `ingestComponent` に渡されます。standalone で `imports` が空なら、テンプレートの要素は全部ただの DOM だと分かっているからです。JIT では「`imports` が 1 件でもあれば `Full`」になります。

📄 `angular/packages/compiler/src/jit_compiler_facade.ts` L337–354 （▶ の行: 338, 352–353）

```ts
337 │     // Parse the template and check for errors.
338 ▶     const {template, defer} = parseJitTemplate(
339 │       facade.template,
340 │       facade.name,
341 │       sourceMapUrl,
342 │       facade.preserveWhitespaces,
343 │       undefined,
344 │     );
345 │ 
346 │     // Compile the component metadata, including template, into an expression.
347 │     const meta: R3ComponentMetadata<R3TemplateDependency> = {
348 │       ...facade,
349 │       ...convertDirectiveFacadeToMetadata(facade),
350 │       selector: facade.selector || this.elementSchemaRegistry.getDefaultComponentElementName(),
351 │       template,
352 ▶       declarations: facade.declarations.map(convertDeclarationFacadeToMetadata),
353 ▶       declarationListEmitMode: DeclarationListEmitMode.Direct,
354 │       defer,
```
*CompilerFacadeImpl.compileComponent（JIT 側の入口）。*

338 行目でテンプレート文字列をパースし、352 行目で `declarations`（JIT では空配列）を変換、353 行目 `DeclarationListEmitMode.Direct`。AOT の `Closure` / `RuntimeResolved` との違いは [第 4 回](../ngmodule/04-ngmodule-compilation-scope.md)と [第 5 回](05-standalone-forward-ref.md)で扱います。

## 4. compile して、standalone なら 3 つを貼り直す

📄 `angular/packages/core/src/render3/jit/directive.ts` L166–176 （▶ の行: 166, 168–169, 171–175）

```ts
166 ▶         compilationDepth++;
167 │         try {
168 ▶           if (meta.usesInheritance) {
169 ▶             addDirectiveDefToUndecoratedParents(type);
170 │           }
171 ▶           ngComponentDef = compiler.compileComponent(
172 ▶             angularCoreEnv,
173 ▶             templateUrl,
174 ▶             meta,
175 ▶           ) as ComponentDef<unknown>;
176 │ 
```

166 行目で `compilationDepth` を 1 増やし（理由はこの節の最後）、168〜170 行目、親クラスがあれば先に親の def を用意し、171〜175 行目で 3 節の `meta` をコンパイラに渡します。戻り値は `ɵɵdefineComponent(...)` を評価した `ComponentDef` です。この時点では `directiveDefs` も `pipeDefs` も空です（`declarations: []` だったので）。

続く 177〜186 行目は [NgModule シリーズ第 13 回](../ngmodule/13-ngmodule-standalone-imports.md)で引用済みです。要点は 3 行で、`meta.isStandalone` のとき `imports` を `flatten` し、`getStandaloneDefFunctions(type, imports)` が返す 2 つの関数を `directiveDefs` / `pipeDefs` に、`() => imports.map(resolveForwardRef)` を `dependencies` に入れます。**3 つとも配列ではなく関数**です。関数の中身を次の節で読みます。

📄 `angular/packages/core/src/render3/jit/directive.ts` L46–59 （▶ の行: 50–53, 56–57, 59）

```ts
46 │ /**
47 │  * Keep track of the compilation depth to avoid reentrancy issues during JIT compilation. This
48 │  * matters in the following scenario:
49 │  *
50 ▶  * Consider a component 'A' that extends component 'B', both declared in module 'M'. During
51 ▶  * the compilation of 'A' the definition of 'B' is requested to capture the inheritance chain,
52 ▶  * potentially triggering compilation of 'B'. If this nested compilation were to trigger
53 ▶  * `flushModuleScopingQueueAsMuchAsPossible` it may happen that module 'M' is still pending in the
54 │  * queue, resulting in 'A' and 'B' to be patched with the NgModule scope. As the compilation of
55 │  * 'A' is still in progress, this would introduce a circular dependency on its compilation. To avoid
56 ▶  * this issue, the module scope queue is only flushed for compilations at the depth 0, to ensure
57 ▶  * all compilations have finished.
58 │  */
59 ▶ let compilationDepth = 0;
```

📄 `angular/packages/core/src/render3/jit/directive.ts` L187–199 （▶ の行: 189, 192, 198）

```ts
187 │         } finally {
188 │           // Ensure that the compilation depth is decremented even when the compilation failed.
189 ▶           compilationDepth--;
190 │         }
191 │ 
192 ▶         if (compilationDepth === 0) {
193 │           // When NgModule decorator executed, we enqueued the module definition such that
194 │           // it would only dequeue and add itself as module scope to all of its declarations,
195 │           // but only if  if all of its declarations had resolved. This call runs the check
196 │           // to see if any modules that are in the queue can be dequeued and add scope to
197 │           // their declarations.
198 ▶           flushModuleScopingQueueAsMuchAsPossible();
199 │         }
```
*192〜208 行目は ngmodule-jit-scope で既出。ここは finally と depth 0 の判定だけ。*

189 行目、コンパイルが失敗しても `finally` で `compilationDepth` を戻します。192 行目、深さが 0 に戻ったときだけ 198 行目の `flushModuleScopingQueueAsMuchAsPossible()`。50〜57 行目のコメントが理由です。A が B を継承していて同じ NgModule M に属するとき、A のコンパイル中に B の def が要求されて B のコンパイルが始まります（深さ 2）。その途中で M のキューを流すと、A のコンパイルが終わっていないのに A に M のスコープが貼られて循環します。だから**いちばん外側のコンパイルが終わったときだけ**キューを流します。standalone コンポーネントにとってこのキューは無関係ですが、同じファイルに NgModule のコンポーネントが混在していれば、standalone コンポーネントの ɵcmp 初回アクセスが NgModule 側のスコープ付与を引き起こすことになります。

## 5. getStandaloneDefFunctions：imports を読む関数を 2 つ返す

📄 `angular/packages/core/src/render3/jit/directive.ts` L234–265 （▶ の行: 235–238, 247–252, 256–257, 260, 262–264）

```ts
234 │ /**
235 ▶  * Build memoized `directiveDefs` and `pipeDefs` functions for the component definition of a
236 ▶  * standalone component, which process `imports` and filter out directives and pipes. The use of
237 ▶  * memoized functions here allows for the delayed resolution of any `forwardRef`s present in the
238 ▶  * component's `imports`.
239 │  */
240 │ function getStandaloneDefFunctions(
241 │   type: Type<any>,
242 │   imports: Type<any>[],
243 │ ): {
244 │   directiveDefs: () => DirectiveDefList;
245 │   pipeDefs: () => PipeDefList;
246 │ } {
247 ▶   let cachedDirectiveDefs: DirectiveDefList | null = null;
248 ▶   let cachedPipeDefs: PipeDefList | null = null;
249 ▶   const directiveDefs = () => {
250 ▶     if (ngDevMode) {
251 ▶       for (const rawDep of imports) {
252 ▶         verifyStandaloneImport(rawDep, type);
253 │       }
254 │     }
255 │ 
256 ▶     if (!isComponent(type)) {
257 ▶       return [];
258 │     }
259 │ 
260 ▶     const scope = depsTracker.getStandaloneComponentScope(type, imports);
261 │ 
262 ▶     return [...scope.compilation.directives]
263 ▶       .map((p) => (getComponentDef(p) || getDirectiveDef(p))!)
264 ▶       .filter((d) => d !== null);
265 │   };
```

1. **235〜238 行目：なぜ関数か**

   コメント「memoized functions here allows for the delayed resolution of any `forwardRef`s」。`imports: [forwardRef(() => Child)]` のように、デコレータ実行時にはまだクラスが無いものを受け取れるようにするためです（[第 5 回](05-standalone-forward-ref.md)）。
2. **247〜248 行目：`cachedDirectiveDefs` / `cachedPipeDefs` は宣言だけ**

   この 2 つの変数は 249〜287 行目の関数本体のどこにも出てきません。実際のキャッシュは 260 行目の `depsTracker.getStandaloneComponentScope` が持ちます（下）。コメントの「memoized」はそちらで実現されています。
3. **250〜254 行目：開発モードで `verifyStandaloneImport`**

   import の各要素が standalone か、`ModuleWithProviders` でないかを検査します（jit/util.ts 63〜82 行目、[既出](../ngmodule/13-ngmodule-standalone-imports.md)）。
4. **256〜258 行目：コンポーネントでなければ空**

   `isComponent(type)` は `getComponentDef(type)` が `null` でないか（jit/util.ts）。`null` なら `imports` を読まずに空配列を返します。
5. **260 行目：`depsTracker.getStandaloneComponentScope(type, imports)`**

   import した NgModule の `exports` を展開し、standalone なものはそのまま入れた `compilation` スコープを返します （`computeStandaloneComponentScope` 244〜292 行目、[既出](../ngmodule/13-ngmodule-standalone-imports.md)）。
6. **262〜264 行目：型 → def に変換し、`null` を落とす**

   `scope.compilation.directives` は `Set<Type>` なので配列にし、各型の `ɵcmp` か `ɵdir` を取り出します。**ここで各依存の ɵcmp getter（2 節）が初めて評価されます**。つまり依存のコンパイルは、親の `directiveDefs()` が呼ばれるまで走りません。

📄 `angular/packages/core/src/render3/jit/directive.ts` L267–287 （▶ の行: 267, 278, 280）

```ts
267 ▶   const pipeDefs = () => {
268 │     if (ngDevMode) {
269 │       for (const rawDep of imports) {
270 │         verifyStandaloneImport(rawDep, type);
271 │       }
272 │     }
273 │ 
274 │     if (!isComponent(type)) {
275 │       return [];
276 │     }
277 │ 
278 ▶     const scope = depsTracker.getStandaloneComponentScope(type, imports);
279 │ 
280 ▶     return [...scope.compilation.pipes].map((p) => getPipeDef(p)!).filter((d) => d !== null);
281 │   };
282 │ 
283 │   return {
284 │     directiveDefs,
285 │     pipeDefs,
286 │   };
287 │ }
```

267〜281 行目、`pipeDefs` も同じ形で、280 行目は `scope.compilation.pipes` から `ɵpipe` を集めます。278 行目、スコープの計算は `directiveDefs` と共有です。2 回計算しないのは次のキャッシュのおかげです。

📄 `angular/packages/core/src/render3/deps_tracker/deps_tracker.ts` L229–242 （▶ の行: 230, 234–235, 238–239）

```ts
229 │   /** @override */
230 ▶   getStandaloneComponentScope(
231 │     type: ComponentType<any>,
232 │     rawImports?: RawScopeInfoFromDecorator[],
233 │   ): StandaloneComponentScope {
234 ▶     if (this.standaloneComponentsScopeCache.has(type)) {
235 ▶       return this.standaloneComponentsScopeCache.get(type)!;
236 │     }
237 │ 
238 ▶     const ans = this.computeStandaloneComponentScope(type, rawImports);
239 ▶     this.standaloneComponentsScopeCache.set(type, ans);
240 │ 
241 │     return ans;
242 │   }
```

234〜235 行目、`standaloneComponentsScopeCache`（キーはコンポーネント型）にあれば返す。238〜239 行目、無ければ計算して保存。`directiveDefs()` と `pipeDefs()` が `createTView` から別々に呼ばれても、`imports` の走査は 1 回です。TestBed が `overrideComponent` で `imports` を差し替えたときにこのキャッシュを消す必要があるのは、ここに保存されているからです（[第 12 回](12-standalone-testbed-override.md)）。

## 6. schemas と、getter の裏側の setter

📄 `angular/packages/core/src/render3/jit/directive.ts` L209–231 （▶ の行: 210–214, 220–221, 224, 226–227, 230）

```ts
209 │ 
210 ▶         if (metadata.schemas) {
211 ▶           if (meta.isStandalone) {
212 ▶             ngComponentDef.schemas = metadata.schemas;
213 ▶           } else {
214 ▶             throw new Error(
215 │               `The 'schemas' was specified for the ${stringifyForError(
216 │                 type,
217 │               )} but is only valid on a component that is standalone.`,
218 │             );
219 │           }
220 ▶         } else if (meta.isStandalone) {
221 ▶           ngComponentDef.schemas = [];
222 │         }
223 │       }
224 ▶       return ngComponentDef;
225 │     },
226 ▶     set: (def: ComponentDef<unknown> | null) => {
227 ▶       ngComponentDef = def;
228 │     },
229 │     // Make the property configurable in dev mode to allow overriding in tests
230 ▶     configurable: !!ngDevMode,
231 │   });
```

1. **210〜212 行目：standalone で `schemas` があれば、そのまま ɵcmp に**

   JIT では ɵcmp に `schemas` が入ります。AOT では入りません（[NgModule シリーズ第 16 回](../ngmodule/16-ngmodule-schemas.md)）。これが実行時に `validateElementIsKnown` が走るかどうかの分かれ目です。
2. **213〜218 行目：standalone でないのに `schemas` があれば例外**

   「The 'schemas' was specified for the X but is only valid on a component that is standalone.」。AOT の同じ検査は NG2010（[次回](03-standalone-imports-check.md)）。
3. **220〜222 行目：standalone で `schemas` が無ければ `[]`**

   NgModule のコンポーネントは `null` のまま（NgModule 側のスコープ付与で入る）。standalone は「空の配列」で、未知の要素は NG0304 で報告されます。
4. **224 行目：ここまで来て初めて `ngComponentDef` を返す**

   2 回目以降は 87 行目の `null` 判定が偽になり、即 224 行目です。
5. **226〜228 行目：setter**

   `type.ɵcmp = def` と代入すると、クロージャの `ngComponentDef` が差し替わります。230 行目、`configurable` は開発モードだけ `true`。TestBed は `Object.getOwnPropertyDescriptor` で元の記述子を保存し、テスト後に `Object.defineProperty` で戻します。`configurable: false` だと `defineProperty` のやり直しが TypeError になるので、本番ではこの差し替えはできません（[第 12 回](12-standalone-testbed-override.md)）。

## 7. まとめ：6 ステップ

1. **デコレータ適用 → `compileComponent(type, metadata)`**

   directives.ts 685 行目。
2. **ɵcmp を getter で遅延定義**

   jit/directive.ts 85〜86 行目。`ɵfac` も同じ（83 行目）。
3. **初回アクセスで `compiler.compileComponent`（`declarations: []`）**

   155 行目・171〜175 行目。`hasDirectiveDependencies`（162〜163 行目）で `DomOnly` / `Full` が決まる。
4. **standalone なら `directiveDefs` / `pipeDefs` を関数で貼る**

   177〜186 行目（既出）→ `getStandaloneDefFunctions` 240〜287 行目。
5. **`dependencies = () => imports.map(resolveForwardRef)`**

   185 行目（既出）。[前回](01-standalone.md)の `ComponentDef.dependencies` が JIT で関数になる理由。
6. **schemas を入れて返す**

   210〜224 行目。

## ここまでの呼び出し

- 👤 `@Component({ imports: [Child] }) class Parent {}` — あなたのコード（JIT 環境）
  - `TypeDecorator(Parent)` → `typeFn(Parent, meta)` — core/src/util/decorators.ts — *既出（ngmodule-decorator）*
    - `compileComponent(Parent, meta)` — render3/jit/directive.ts L70
      - `maybeQueueResolutionOfComponentResources` / `addDirectiveFactoryDef` — L78 / L83
      - `Object.defineProperty(Parent, 'ɵcmp', { get, set, configurable })` — L85 — *ここでデコレータは終わる。まだコンパイルしていない*
- 👤 `Parent.ɵcmp` を誰かが読む — createComponent / TestBed.createComponent / 親の directiveDefs()
  - `get()` — L86
    - `getCompilerFacade(…)` — core/src/compiler/compiler\_facade.ts L23 — *global.ng.ɵcompilerFacade*
    - `directiveMetadata(type, metadata)` — L139 — *isStandalone 既定 true（L405）*
    - `compiler.compileComponent(angularCoreEnv, templateUrl, meta)` — L171 → compiler/src/jit\_compiler\_facade.ts L332 — *declarations: \[\]。DomOnly / Full（view/compiler.ts L201-204）*
    - `getStandaloneDefFunctions(type, imports)` — L182（既出）→ L240 — *directiveDefs / pipeDefs / dependencies を関数に*
    - `flushModuleScopingQueueAsMuchAsPossible()` — L198（depth 0 のとき）
    - `ngComponentDef.schemas = metadata.schemas ?? []` — L210-222
- 👤 あとで `createTView` が `directiveDefs()` を呼ぶ — 第 7 回
  - `depsTracker.getStandaloneComponentScope(type, imports)` — L260 → deps\_tracker.ts L230 — *キャッシュ。無ければ computeStandaloneComponentScope（既出）*
  - `getComponentDef(Child)` — L263 — *Child.ɵcmp の getter が初めて評価される → Child のコンパイル*

## 聞かれそうな質問

**Q. なぜデコレータの実行時にすぐコンパイルせず、getter にするのですか？**

理由は 3 つあり、どれもソースにあります。(1) `templateUrl` の解決待ち。78 行目でキューに入れ、101〜113 行目で「解決前に読んだら例外」としています。解決は非同期なので、デコレータの同期処理では終われません。(2) `forwardRef`。235〜238 行目のコメントのとおり、`imports` の中身がまだ定義されていないクラスでも、使うときには定義済みです。(3) NgModule のスコープ付与。jit/directive.ts 201〜208 行目の `hasSelectorScope` の前のコメント（[既出](../ngmodule/06-ngmodule-jit-scope.md)）のとおり、宣言元の NgModule のデコレータはコンポーネントのデコレータより*後*に実行されるので、ɵcmp を作るのをその後まで延ばせます。

**Q. JIT では directiveDefs が配列ではなく関数なのはなぜですか？**

`compileComponent` はコンパイラに `declarations: []`（155 行目）を渡すので、コンパイラ自身は依存を 1 つも知りません。依存はコンパイル後に `getStandaloneDefFunctions`（240 行目）が返す関数として貼られます。関数にしておけば、呼ばれるまで（`createTView` まで）各依存の ɵcmp getter を評価しなくてよく、`forwardRef` も `resolveForwardRef` で遅れて解けます（235〜238 行目）。AOT では配列になります（[前回](01-standalone.md)の fixture、[第 5 回](05-standalone-forward-ref.md)の例外）。

**Q. hasDirectiveDependencies は何を変えるのですか？**

`packages/compiler` の `compileComponentFromMetadata` が、`isStandalone && !hasDirectiveDependencies` のとき `TemplateCompilationMode.DomOnly` を選びます（view/compiler.ts 201〜204 行目）。依存が無いと分かっている standalone コンポーネントのテンプレートは、ディレクティブ照合をしない命令で出力されます。JIT では 162〜163 行目のとおり `imports` が 1 件でもあれば `true`（`Full`）です。中身がディレクティブかパイプか NgModule かは、貼られるのが後なので見ていません（159〜161 行目）。

**Q. compilationDepth は何のためのカウンタですか？**

継承で入れ子になったコンパイルの途中で NgModule のスコープ付与キューを流さないためです（46〜59 行目のコメント）。166 行目で増やし、189 行目の `finally` で減らし、192 行目で 0 のときだけ 198 行目の `flushModuleScopingQueueAsMuchAsPossible` を呼びます。

**Q. standalone: false のコンポーネントに schemas を書くと JIT ではどうなりますか？**

213〜218 行目で `Error` です。「The 'schemas' was specified for the X but is only valid on a component that is standalone.」。AOT では ngtsc が同じ条件で NG2010 を出します（[次回](03-standalone-imports-check.md)）。

**Q. ɵcmp に setter があるのは誰のためですか？**

TestBed です。226〜228 行目の setter と 230 行目の `configurable: !!ngDevMode` によって、開発モードでは def を差し替えたり、元の記述子を `Object.defineProperty` で戻したりできます。本番ビルドでは `configurable: false` なので差し替えられません。具体的な手順は [第 12 回](12-standalone-testbed-override.md)。

## 読み終えて

- `@Component` は `compileComponent` を呼ぶ（directives.ts 685 行目）。`compileComponent` は ɵcmp を **getter** として置くだけで、コンパイルは初回アクセスまで延ばす（jit/directive.ts 85〜87 行目）
- JIT のコンパイルは常に `declarations: []`（155 行目）。standalone なら直後に `directiveDefs` / `pipeDefs` / `dependencies` を**関数**で貼る（177〜186 行目・240〜287 行目）
- 関数の中身は `depsTracker.getStandaloneComponentScope`（キャッシュ付き、deps\_tracker.ts 234〜239 行目）→ 各型の ɵcmp / ɵdir / ɵpipe を集める（262〜264 行目）。依存のコンパイルはこのとき初めて走る
- `hasDirectiveDependencies`（162〜163 行目）は `DomOnly` / `Full` の切り替え（view/compiler.ts 201〜204 行目）
- `schemas` は JIT でだけ ɵcmp に入る（210〜222 行目）。setter と `configurable` は TestBed のため（226〜230 行目）

---

← 前: [standalone コンポーネントの概観：imports が ɵcmp の dependencies になり、依存解決と注入器を自分で持つ](01-standalone.md)  
次: [imports の検証（AOT）：validateAndFlattenComponentImports・validateStandaloneImports・StandaloneComponentScopeReader](03-standalone-imports-check.md) →
