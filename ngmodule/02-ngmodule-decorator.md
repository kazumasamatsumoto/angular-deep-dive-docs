[目次](../README.md) › [NgModule の内側](README.md) › 第 2 回 / 全 18 回

# @NgModule デコレータが実行された瞬間：makeDecorator と compileNgModuleDefs

> makeDecorator が typeFn として compileNgModule を呼ぶ。Object.defineProperty で ɵmod / ɵfac / ɵinj を getter として遅延定義する手順、enqueueModuleForDelayedScoping と flushModuleScopingQueueAsMuchAsPossible が forwardRef を待つ仕組み、AOT ではこの経路が消えること。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngmodule-decorator)

---

`@NgModule({...})` と書いたクラスは、その行が評価された瞬間に何をされるのでしょうか。この章では JIT（ブラウザでコンパイルする経路。`ng test` や `@angular/compiler` を読み込んだアプリ）で、デコレータ関数 → `compileNgModule` → `compileNgModuleDefs` が 3 つの getter をクラスに付けるまでを 1 行ずつ追います。「getter なので、初めて読まれるまでコンパイルされない」こと、`forwardRef` で後から決まる declarations を待つキュー、そして AOT ではこの経路がまるごと消えることを確認します。

読む対象は `packages/core/src/util/decorators.ts`、`packages/core/src/metadata/ng_module.ts`、`packages/core/src/render3/jit/module.ts`、`packages/compiler/src/jit_compiler_facade.ts` です。

1. 2 つの仕事
2. **デコレータの実行**（この章）
3. AOT の出力
4. コンパイルスコープ
5. exports の意味
6. JIT のスコープ計算
7. ɵinj → R3Injector
8. walkProviderTree
9. forRoot と ModuleWithProviders
10. providedIn の解決
11. bootstrapModule の全手順
12. BrowserModule の中身
13. standalone が import する NgModule
14. importProvidersFrom
15. 遅延モジュール
16. schemas
17. TestBed
18. standalone 既定の後

## 1. makeDecorator：デコレータ関数の作り方

`@Component` も `@NgModule` も `@Injectable` も、同じ `makeDecorator` で作られています。まず引数の意味を押さえます。

📄 `angular/packages/core/src/util/decorators.ts` L40–53 （▶ の行: 40, 47–49, 51–52）

```ts
40 ▶ export const ANNOTATIONS = '__annotations__';
41 │ export const PARAMETERS = '__parameters__';
42 │ export const PROP_METADATA = '__prop__metadata__';
43 │ 
44 │ /**
45 │  * @suppress {globalThis}
46 │  */
47 ▶ export function makeDecorator<T>(
48 ▶   name: string,
49 ▶   props?: (...args: any[]) => any,
50 │   parentClass?: any,
51 ▶   additionalProcessing?: (type: Type<T>) => void,
52 ▶   typeFn?: (type: Type<T>, ...args: any[]) => void,
53 │ ): {new (...args: any[]): any; (...args: any[]): any; (...args: any[]): (cls: any) => any} {
```

47 行目 `makeDecorator`。48 行目 `name` は `'NgModule'` のような表示名、49 行目 `props` はメタデータを整える関数、51 行目 `additionalProcessing` はクラスに対する追加処理、52 行目 `typeFn` が「**クラスとメタデータを受け取って何かする関数**」です。40 行目の `ANNOTATIONS` = `'__annotations__'` は、クラスにメタデータを保存するプロパティ名です。

📄 `angular/packages/core/src/util/decorators.ts` L54–80 （▶ の行: 57, 61, 66–68, 71–74, 76, 78）

```ts
54 │   return noSideEffects(() => {
55 │     const metaCtor = makeMetadataCtor(props);
56 │ 
57 ▶     function DecoratorFactory(
58 │       this: unknown | typeof DecoratorFactory,
59 │       ...args: any[]
60 │     ): (cls: Type<T>) => any {
61 ▶       if (this instanceof DecoratorFactory) {
62 │         metaCtor.call(this, ...args);
63 │         return this as typeof DecoratorFactory;
64 │       }
65 │ 
66 ▶       const annotationInstance = new (DecoratorFactory as any)(...args);
67 ▶       return function TypeDecorator(cls: Type<T>) {
68 ▶         if (typeFn) typeFn(cls, ...args);
69 │         // Use of Object.defineProperty is important since it creates non-enumerable property which
70 │         // prevents the property is copied during subclassing.
71 ▶         const annotations = Object.hasOwn(cls, ANNOTATIONS)
72 ▶           ? (cls as any)[ANNOTATIONS]
73 ▶           : (Object.defineProperty(cls, ANNOTATIONS, {value: []}) as any)[ANNOTATIONS];
74 ▶         annotations.push(annotationInstance);
75 │ 
76 ▶         if (additionalProcessing) additionalProcessing(cls);
77 │ 
78 ▶         return cls;
79 │       };
80 │     }
```

1. **57 行目：`@NgModule({...})` の `NgModule(...)` 部分が `DecoratorFactory` の呼び出し**

   61 行目、`new` で呼ばれたときはメタデータのインスタンス（`this.declarations = ...` のように props をコピーしたもの）を返します。普通に関数として呼ばれたときは 66 行目でその `new` を自分で行い、`annotationInstance` を作ります。
2. **67 行目：戻り値は `TypeDecorator(cls)` という関数**

   TypeScript のデコレータ構文は `NgModule(meta)(MyModule)` と展開されます。つまり `class MyModule` が評価された直後に、この `TypeDecorator` が `cls = MyModule` で呼ばれます。
3. **68 行目：`typeFn(cls, ...args)`。ここが本体**

   `typeFn` は `makeDecorator` の第 5 引数。`NgModule` では次の節で見るとおり `compileNgModule` です。**メタデータの保存（71〜74 行目）より先に呼ばれる**ことに注意してください。
4. **71〜74 行目：`cls.__annotations__` に push**

   `Object.hasOwn` で自分自身に配列があればそれを、無ければ `Object.defineProperty` で非列挙のプロパティとして作ります（コメント 69〜70 行目：サブクラスへコピーされないため）。この配列を読むのは `ReflectionCapabilities`（`reflectDependencies` など）と、テストの `TestBed` です。
5. **76 行目：`additionalProcessing`、78 行目：クラスをそのまま返す**

   `NgModule` は `additionalProcessing` を渡していないので何も起きません。クラスは差し替えられず、同じ `MyModule` が返ります。

## 2. NgModule は typeFn に compileNgModule を渡す

📄 `angular/packages/core/src/metadata/ng_module.ts` L204–224 （▶ の行: 207, 209–211, 223）

```ts
204 │ /**
205 │  * @Annotation
206 │  */
207 ▶ export const NgModule: NgModuleDecorator = makeDecorator(
208 │   'NgModule',
209 ▶   (ngModule: NgModule) => ngModule,
210 ▶   undefined,
211 ▶   undefined,
212 │   /**
213 │    * Decorator that marks the following class as an NgModule, and supplies
214 │    * configuration metadata for it.
215 │    *
216 │    * * The `declarations` option configures the compiler
217 │    * with information about what belongs to the NgModule.
218 │    * * The `providers` options configures the NgModule's injector to provide
219 │    * dependencies the NgModule members.
220 │    * * The `imports` and `exports` options bring in members from other modules, and make
221 │    * this module's members available to others.
222 │    */
223 ▶   (type: Type<any>, meta: NgModule) => compileNgModule(type, meta),
224 │ );
```

207 行目で `makeDecorator('NgModule', ...)`。209 行目の `props` は受け取ったオブジェクトをそのまま返すだけ。210〜211 行目、`parentClass` も `additionalProcessing` も `undefined`。223 行目、第 5 引数 `typeFn` が `(type, meta) => compileNgModule(type, meta)` です。1 節の 68 行目から、ここに飛びます。

📄 `angular/packages/core/src/render3/jit/module.ts` L100–117 （▶ の行: 105–110, 116）

```ts
100 │ /**
101 │  * Compiles a module in JIT mode.
102 │  *
103 │  * This function automatically gets called when a class has a `@NgModule` decorator.
104 │  */
105 ▶ export function compileNgModule(moduleType: Type<any>, ngModule: NgModule = {}): void {
106 ▶   patchModuleCompilation();
107 ▶   compileNgModuleDefs(moduleType as NgModuleType, ngModule);
108 ▶   if (ngModule.id !== undefined) {
109 ▶     registerNgModuleType(moduleType as NgModuleType, ngModule.id);
110 ▶   }
111 │ 
112 │   // Because we don't know if all declarations have resolved yet at the moment the
113 │   // NgModule decorator is executing, we're enqueueing the setting of module scope
114 │   // on its declarations to be run at a later time when all declarations for the module,
115 │   // including forward refs, have resolved.
116 ▶   enqueueModuleForDelayedScoping(moduleType, ngModule);
117 │ }
```

105 行目、`ngModule` の既定値は `{}`（`@NgModule()` と引数無しで書ける理由）。106 行目 `patchModuleCompilation()` は中身が空の関数です。107 行目 `compileNgModuleDefs` が本体（3 節）。108〜110 行目、`id` があれば `registerNgModuleType` で登録簿に入れます（AOT 出力の `ɵɵregisterNgModuleType` と同じ関数。[第 3 回](03-ngmodule-aot-output.md)）。116 行目 `enqueueModuleForDelayedScoping`。「まだ declarations が全部決まっていないかもしれないので、スコープの設定はキューに入れて後で」とコメント 112〜115 行目にあります。4 節で読みます。

📄 `angular/packages/core/src/render3/jit/module_patch.ts` L8–11 （▶ の行: 9–10）

```ts
 8 │ 
 9 ▶ export function patchModuleCompilation(): void {
10 ▶   // Does nothing, but exists as a target for patching.
11 │ }
```

9〜10 行目、`patchModuleCompilation` の中身は「何もしないが、パッチを当てる対象として存在する」というコメントだけです。

## 3. compileNgModuleDefs：3 つの getter を定義する

📄 `angular/packages/core/src/render3/jit/module.ts` L125–160 （▶ の行: 125, 128, 132–138, 141, 143, 148, 150–159）

```ts
125 ▶ export function compileNgModuleDefs(
126 │   moduleType: NgModuleType,
127 │   ngModule: NgModule,
128 ▶   allowDuplicateDeclarationsInRoot: boolean = false,
129 │ ): void {
130 │   ngDevMode && assertDefined(moduleType, 'Required value moduleType');
131 │   ngDevMode && assertDefined(ngModule, 'Required value ngModule');
132 ▶   const declarations: Type<any>[] = flatten(ngModule.declarations || EMPTY_ARRAY);
133 ▶   let ngModuleDef: any = null;
134 ▶   Object.defineProperty(moduleType, NG_MOD_DEF, {
135 ▶     configurable: true,
136 ▶     get: () => {
137 ▶       if (ngModuleDef === null) {
138 ▶         if (ngDevMode && ngModule.imports && ngModule.imports.indexOf(moduleType) > -1) {
139 │           // We need to assert this immediately, because allowing it to continue will cause it to
140 │           // go into an infinite loop before we've reached the point where we throw all the errors.
141 ▶           throw new Error(`'${stringifyForError(moduleType)}' module can't import itself`);
142 │         }
143 ▶         const compiler = getCompilerFacade({
144 │           usage: JitCompilerUsage.Decorator,
145 │           kind: 'NgModule',
146 │           type: moduleType,
147 │         });
148 ▶         ngModuleDef = compiler.compileNgModule(angularCoreEnv, `ng:///${moduleType.name}/ɵmod.js`, {
149 │           type: moduleType,
150 ▶           bootstrap: flatten(ngModule.bootstrap || EMPTY_ARRAY).map(resolveForwardRef),
151 ▶           declarations: declarations.map(resolveForwardRef),
152 ▶           imports: flatten(ngModule.imports || EMPTY_ARRAY)
153 ▶             .map(resolveForwardRef)
154 ▶             .map(expandModuleWithProviders),
155 ▶           exports: flatten(ngModule.exports || EMPTY_ARRAY)
156 ▶             .map(resolveForwardRef)
157 ▶             .map(expandModuleWithProviders),
158 ▶           schemas: ngModule.schemas ? flatten(ngModule.schemas) : null,
159 ▶           id: ngModule.id || null,
160 │         });
```

1. **132 行目：declarations を flatten**

   型が `Array<Type | any[]>` なので入れ子配列を平らにします。この時点では `forwardRef` はまだ解かれません。
2. **133〜136 行目：`ngModuleDef = null` のまま、`ɵmod` を getter として定義**

   `Object.defineProperty(moduleType, NG_MOD_DEF, {get: ...})`。**ここではコンパイルしません**。値を持たない getter を付けるだけです。135 行目 `configurable: true` なので、テストで差し替えられます。
3. **137 行目：初めて `MyModule.ɵmod` が読まれたとき、`ngModuleDef === null` なら中へ**

   138〜141 行目、開発モードで自分自身を `imports` に書いていたら即例外（無限ループになる前に止める、とコメント）。143 行目 `getCompilerFacade` は `@angular/compiler` が読み込まれていなければ例外を投げます（次の引用）。

   📄 `angular/packages/core/src/compiler/compiler_facade.ts` L29–48 （▶ の行: 29, 34, 45, 47）

   ```ts
   29 ▶   if (typeof ngDevMode === 'undefined' || ngDevMode) {
   30 │     // Log the type as an error so that a developer can easily navigate to the type from the
   31 │     // console.
   32 │     console.error(`JIT compilation failed for ${request.kind}`, request.type);
   33 │ 
   34 ▶     let message = `The ${request.kind} '${request.type.name}' needs to be compiled using the JIT compiler, but '@angular/compiler' is not available.\n\n`;
   35 │     if (request.usage === JitCompilerUsage.PartialDeclaration) {
   36 │       message += `The ${request.kind} is part of a library that has been partially compiled.\n`;
   37 │       message += `However, the Angular Linker has not processed the library such that JIT compilation is used as fallback.\n`;
   38 │       message += '\n';
   39 │       message += `Ideally, the library is processed using the Angular Linker to become fully AOT compiled.\n`;
   40 │     } else {
   41 │       message += `JIT compilation is discouraged for production use-cases! Consider using AOT mode instead.\n`;
   42 │     }
   43 │     message += `Alternatively, the JIT compiler should be loaded by bootstrapping using '@angular/platform-browser-dynamic' or '@angular/platform-server',\n`;
   44 │     message += `or manually provide the compiler with 'import "@angular/compiler";' before bootstrapping.`;
   45 ▶     throw new Error(message);
   46 │   } else {
   47 ▶     throw new Error('JIT compiler unavailable');
   48 │   }
   ```

   29 行目、開発モードなら 34 行目のメッセージ「The NgModule 'X' needs to be compiled using the JIT compiler, but '@angular/compiler' is not available.」を組んで 45 行目で投げます。本番モードでは 47 行目の短い「JIT compiler unavailable」です。
4. **148〜160 行目：`compiler.compileNgModule` に渡すメタデータ**

   150 行目 bootstrap、151 行目 declarations、152〜154 行目 imports、155〜157 行目 exports はそれぞれ `flatten` → `resolveForwardRef`（`forwardRef(() => X)` を `X` に）。imports と exports はさらに `expandModuleWithProviders`（`{ngModule, providers}` なら `ngModule` を取り出す）。**`ɵmod` には providers は渡しません**。158 行目 schemas、159 行目 id。

📄 `angular/packages/core/src/render3/jit/module.ts` L161–172 （▶ の行: 165–167, 169）

```ts
161 │         // Set `schemas` on ngModuleDef to an empty array in JIT mode to indicate that runtime
162 │         // should verify that there are no unknown elements in a template. In AOT mode, that check
163 │         // happens at compile time and `schemas` information is not present on Component and Module
164 │         // defs after compilation (so the check doesn't happen the second time at runtime).
165 ▶         if (!ngModuleDef.schemas) {
166 ▶           ngModuleDef.schemas = [];
167 ▶         }
168 │       }
169 ▶       return ngModuleDef;
170 │     },
171 │   });
172 │ 
```

165〜167 行目、schemas が無ければ `[]` を入れます。161〜164 行目のコメントが理由を書いています。「JIT では `schemas` を空配列にして、ランタイムが未知の要素を検査することを示す。AOT ではその検査はコンパイル時に済んでいて、コンパイル後の def に `schemas` 情報は無い（二重に検査しないため）」。第 1 回のデモで「AOT では schemas が ɵmod に出ない」としたのはこの対です。169 行目、2 回目以降は作ったものを返すだけです。

📄 `angular/packages/core/src/render3/jit/module.ts` L173–194 （▶ の行: 174, 176, 182, 185–186, 193）

```ts
173 │   let ngFactoryDef: any = null;
174 ▶   Object.defineProperty(moduleType, NG_FACTORY_DEF, {
175 │     get: () => {
176 ▶       if (ngFactoryDef === null) {
177 │         const compiler = getCompilerFacade({
178 │           usage: JitCompilerUsage.Decorator,
179 │           kind: 'NgModule',
180 │           type: moduleType,
181 │         });
182 ▶         ngFactoryDef = compiler.compileFactory(angularCoreEnv, `ng:///${moduleType.name}/ɵfac.js`, {
183 │           name: moduleType.name,
184 │           type: moduleType,
185 ▶           deps: reflectDependencies(moduleType),
186 ▶           target: compiler.FactoryTarget.NgModule,
187 │           typeArgumentCount: 0,
188 │         });
189 │       }
190 │       return ngFactoryDef;
191 │     },
192 │     // Make the property configurable in dev mode to allow overriding in tests
193 ▶     configurable: !!ngDevMode,
194 │   });
```

174 行目、`ɵfac` も同じ形の getter。176 行目で初回だけ 182 行目 `compiler.compileFactory` を呼びます。185 行目 `reflectDependencies(moduleType)` がコンストラクタ引数の型を取り出すので、`constructor(router: Router)` と書いた NgModule はここで依存が決まります。186 行目 `FactoryTarget.NgModule`。193 行目、`configurable` は開発モードのときだけ `true`（テストで上書きできるように）。

📄 `angular/packages/core/src/render3/jit/module.ts` L196–226 （▶ の行: 197, 199–200, 204–208, 215, 224）

```ts
196 │   let ngInjectorDef: any = null;
197 ▶   Object.defineProperty(moduleType, NG_INJ_DEF, {
198 │     get: () => {
199 ▶       if (ngInjectorDef === null) {
200 ▶         ngDevMode && verifySemanticsOfNgModuleDef(moduleType, allowDuplicateDeclarationsInRoot);
201 │         const meta: R3InjectorMetadataFacade = {
202 │           name: moduleType.name,
203 │           type: moduleType,
204 ▶           providers: ngModule.providers || EMPTY_ARRAY,
205 ▶           imports: [
206 ▶             (ngModule.imports || EMPTY_ARRAY).map(resolveForwardRef),
207 ▶             (ngModule.exports || EMPTY_ARRAY).map(resolveForwardRef),
208 ▶           ],
209 │         };
210 │         const compiler = getCompilerFacade({
211 │           usage: JitCompilerUsage.Decorator,
212 │           kind: 'NgModule',
213 │           type: moduleType,
214 │         });
215 ▶         ngInjectorDef = compiler.compileInjector(
216 │           angularCoreEnv,
217 │           `ng:///${moduleType.name}/ɵinj.js`,
218 │           meta,
219 │         );
220 │       }
221 │       return ngInjectorDef;
222 │     },
223 │     // Make the property configurable in dev mode to allow overriding in tests
224 ▶     configurable: !!ngDevMode,
225 │   });
226 │ }
```

197 行目、`ɵinj` の getter。199 行目で初回だけ中へ。**200 行目、開発モードなら `verifySemanticsOfNgModuleDef`**。「standalone を declarations に入れている」「同じクラスを 2 つのモジュールで宣言している」「exports に宣言も import もしていないものがある」などの検査はここで走ります（検査の中身は[第 6 回](06-ngmodule-jit-scope.md)）。つまり**JIT の意味検査は `ɵinj` が初めて読まれたとき**、具体的には `R3Injector` がこのモジュールを処理するときです。

204 行目 `providers`。205〜208 行目、`imports` は `[imports, exports]` の 2 要素配列です。**exports に書いた NgModule も注入器の imports として扱われる**。第 1 回 4 節で見た AOT 出力の `BModule.ɵinj = {imports: [AModule]}` と同じ結果に、JIT はこの 2 行でたどり着きます。215 行目 `compiler.compileInjector`。224 行目、`configurable` は開発モードのみ。

### compiler 側の受け口

📄 `angular/packages/compiler/src/jit_compiler_facade.ts` L223–244 （▶ の行: 223, 229, 237–238, 242–243）

```ts
223 ▶   compileNgModule(
224 │     angularCoreEnv: CoreEnvironment,
225 │     sourceMapUrl: string,
226 │     facade: R3NgModuleMetadataFacade,
227 │   ): any {
228 │     const meta: R3NgModuleMetadata = {
229 ▶       kind: R3NgModuleMetadataKind.Global,
230 │       type: wrapReference(facade.type),
231 │       bootstrap: facade.bootstrap.map(wrapReference),
232 │       declarations: facade.declarations.map(wrapReference),
233 │       publicDeclarationTypes: null, // only needed for types in AOT
234 │       imports: facade.imports.map(wrapReference),
235 │       includeImportTypes: true,
236 │       exports: facade.exports.map(wrapReference),
237 ▶       selectorScopeMode: R3SelectorScopeMode.Inline,
238 ▶       containsForwardDecls: false,
239 │       schemas: facade.schemas ? facade.schemas.map(wrapReference) : null,
240 │       id: facade.id ? new WrappedNodeExpr(facade.id) : null,
241 │     };
242 ▶     const res = compileNgModule(meta);
243 ▶     return this.jitExpression(res.expression, angularCoreEnv, sourceMapUrl, []);
244 │   }
```

📄 `angular/packages/compiler/src/jit_compiler_facade.ts` L195–211 （▶ の行: 195, 203–207, 209–210）

```ts
195 ▶   compileInjector(
196 │     angularCoreEnv: CoreEnvironment,
197 │     sourceMapUrl: string,
198 │     facade: R3InjectorMetadataFacade,
199 │   ): any {
200 │     const meta: R3InjectorMetadata = {
201 │       name: facade.name,
202 │       type: wrapReference(facade.type),
203 ▶       providers:
204 ▶         facade.providers && facade.providers.length > 0
205 ▶           ? new WrappedNodeExpr(facade.providers)
206 ▶           : null,
207 ▶       imports: facade.imports.map((i) => new WrappedNodeExpr(i)),
208 │     };
209 ▶     const res = compileInjector(meta);
210 ▶     return this.jitExpression(res.expression, angularCoreEnv, sourceMapUrl, []);
211 │   }
```

223 行目、`CompilerFacadeImpl.compileNgModule`。229 行目 `kind: Global`、**237 行目 `selectorScopeMode: Inline`**。AOT が使う `SideEffect`（`ɵɵsetNgModuleScope` を別の文で出す）ではなく、declarations / imports / exports を `ɵɵdefineNgModule` の引数に直接入れる形です（モードの定義は[第 3 回](03-ngmodule-aot-output.md)）。238 行目 `containsForwardDecls: false`。`resolveForwardRef` を core 側で済ませているので、compiler 側は閉包で包む必要がありません。242 行目で AOT と同じ `compileNgModule(meta)` を呼び、243 行目 `jitExpression` が出力 AST を `new Function` で評価して `NgModuleDef` オブジェクトを返します。

195 行目 `compileInjector` も同じ構造です。203〜206 行目、providers が空なら `null`（出力に `providers` キーが出ない）。207 行目、imports を 1 つずつ `WrappedNodeExpr` で包む。209〜210 行目、AOT と同じ `compileInjector(meta)` → `jitExpression`。

> [!TIP]
> **新卒エンジニアへ**
>
> 「デコレータを付けた瞬間にコンパイルされる」は半分だけ正しいです。付いた瞬間に起きるのは `Object.defineProperty` が 3 回と、キューへの push。実際に `@angular/compiler` が動くのは、`MyModule.ɵmod` / `ɵinj` / `ɵfac` が**初めて読まれたとき**です。読まれなければ永遠にコンパイルされません。だから `import` しただけで使っていない NgModule は JIT でもコストがかかりません。

## 4. forwardRef を待つキュー

`@NgModule({declarations: [forwardRef(() => LaterCmp)]})` のように、デコレータ評価時点でまだ定義されていないクラスを参照できます。その場合「このモジュールのスコープを宣言済みコンポーネントに設定する」作業は、すぐにはできません。

📄 `angular/packages/core/src/render3/jit/module.ts` L48–61 （▶ の行: 53, 59–60）

```ts
48 │ interface ModuleQueueItem {
49 │   moduleType: Type<any>;
50 │   ngModule: NgModule;
51 │ }
52 │ 
53 ▶ const moduleQueue: ModuleQueueItem[] = [];
54 │ 
55 │ /**
56 │  * Enqueues moduleDef to be checked later to see if scope can be set on its
57 │  * component declarations.
58 │  */
59 ▶ function enqueueModuleForDelayedScoping(moduleType: Type<any>, ngModule: NgModule) {
60 ▶   moduleQueue.push({moduleType, ngModule});
61 │ }
```

📄 `angular/packages/core/src/render3/jit/module.ts` L63–98 （▶ の行: 69–70, 73, 76, 78–79, 93–95, 97）

```ts
63 │ let flushingModuleQueue = false;
64 │ /**
65 │  * Loops over queued module definitions, if a given module definition has all of its
66 │  * declarations resolved, it dequeues that module definition and sets the scope on
67 │  * its declarations.
68 │  */
69 ▶ export function flushModuleScopingQueueAsMuchAsPossible() {
70 ▶   if (!flushingModuleQueue) {
71 │     flushingModuleQueue = true;
72 │     try {
73 ▶       for (let i = moduleQueue.length - 1; i >= 0; i--) {
74 │         const {moduleType, ngModule} = moduleQueue[i];
75 │ 
76 ▶         if (ngModule.declarations && ngModule.declarations.every(isResolvedDeclaration)) {
77 │           // dequeue
78 ▶           moduleQueue.splice(i, 1);
79 ▶           setScopeOnDeclaredComponents(moduleType, ngModule);
80 │         }
81 │       }
82 │     } finally {
83 │       flushingModuleQueue = false;
84 │     }
85 │   }
86 │ }
87 │ 
88 │ /**
89 │  * Returns truthy if a declaration has resolved. If the declaration happens to be
90 │  * an array of declarations, it will recurse to check each declaration in that array
91 │  * (which may also be arrays).
92 │  */
93 ▶ function isResolvedDeclaration(declaration: any[] | Type<any>): boolean {
94 ▶   if (Array.isArray(declaration)) {
95 ▶     return declaration.every(isResolvedDeclaration);
96 │   }
97 ▶   return !!resolveForwardRef(declaration);
98 │ }
```

1. **53 行目：モジュール単位のグローバルなキュー。59〜60 行目で push**

   2 節の 116 行目から呼ばれます。`@NgModule` が付くたびに 1 件増えます。
2. **69〜70 行目：`flushModuleScopingQueueAsMuchAsPossible`。再入防止フラグ付き**

   73 行目、キューを**後ろから**見ます（`splice` で取り除きながら回るため）。
3. **76 行目：declarations が全部 resolve 済みか**

   93〜97 行目 `isResolvedDeclaration`。配列なら再帰、そうでなければ `!!resolveForwardRef(declaration)`。`forwardRef(() => LaterCmp)` は `LaterCmp` のクラス定義がまだ評価されていない間は `undefined` を返すので `false` になり、そのモジュールはキューに残ります。
4. **78〜79 行目：取り出して `setScopeOnDeclaredComponents`**

📄 `angular/packages/core/src/render3/jit/module.ts` L512–537 （▶ の行: 517–518, 520, 523–524, 527–531, 534）

```ts
512 │ /**
513 │  * Some declared components may be compiled asynchronously, and thus may not have their
514 │  * ɵcmp set yet. If this is the case, then a reference to the module is written into
515 │  * the `ngSelectorScope` property of the declared type.
516 │  */
517 ▶ function setScopeOnDeclaredComponents(moduleType: Type<any>, ngModule: NgModule) {
518 ▶   const declarations: Type<any>[] = flatten(ngModule.declarations || EMPTY_ARRAY);
519 │ 
520 ▶   const transitiveScopes = transitiveScopesFor(moduleType);
521 │ 
522 │   declarations.forEach((declaration) => {
523 ▶     declaration = resolveForwardRef(declaration);
524 ▶     if (Object.hasOwn(declaration, NG_COMP_DEF)) {
525 │       // A `ɵcmp` field exists - go ahead and patch the component directly.
526 │       const component = declaration as Type<any> & {ɵcmp: ComponentDef<any>};
527 ▶       const componentDef = getComponentDef(component)!;
528 ▶       patchComponentDefWithScope(componentDef, transitiveScopes);
529 ▶     } else if (
530 ▶       !Object.hasOwn(declaration, NG_DIR_DEF) &&
531 ▶       !Object.hasOwn(declaration, NG_PIPE_DEF)
532 │     ) {
533 │       // Set `ngSelectorScope` for future reference when the component compilation finishes.
534 ▶       (declaration as Type<any> & {ngSelectorScope?: any}).ngSelectorScope = moduleType;
535 │     }
536 │   });
537 │ }
```

517〜518 行目、declarations を flatten。520 行目 `transitiveScopesFor(moduleType)` がモジュールの compilation スコープを計算します（ここで `MyModule.ɵmod` の getter が初めて発火することが多い。計算の中身は[第 6 回](06-ngmodule-jit-scope.md)）。523 行目で各 declaration の `forwardRef` を解き、524 行目、**既に `ɵcmp` を自分自身に持っているコンポーネントなら** 527〜528 行目で `patchComponentDefWithScope`。529〜534 行目、`ɵcmp` も `ɵdir` も `ɵpipe` も無い（= コンポーネントのコンパイルがまだ、または非同期で待っている）なら、クラスに `ngSelectorScope = moduleType` を書いておきます。

📄 `angular/packages/core/src/render3/jit/module.ts` L539–562 （▶ の行: 543, 547–548, 553–555, 561）

```ts
539 │ /**
540 │  * Patch the definition of a component with directives and pipes from the compilation scope of
541 │  * a given module.
542 │  */
543 ▶ export function patchComponentDefWithScope<C>(
544 │   componentDef: ComponentDef<C>,
545 │   transitiveScopes: NgModuleTransitiveScopes,
546 │ ) {
547 ▶   componentDef.directiveDefs = () =>
548 ▶     Array.from(transitiveScopes.compilation.directives)
549 │       .map((dir) =>
550 │         Object.hasOwn(dir, NG_COMP_DEF) ? getComponentDef(dir)! : getDirectiveDef(dir)!,
551 │       )
552 │       .filter((def) => !!def);
553 ▶   componentDef.pipeDefs = () =>
554 ▶     Array.from(transitiveScopes.compilation.pipes).map((pipe) => getPipeDef(pipe)!);
555 ▶   componentDef.schemas = transitiveScopes.schemas;
556 │ 
557 │   // Since we avoid Components/Directives/Pipes recompiling in case there are no overrides, we
558 │   // may face a problem where previously compiled defs available to a given Component/Directive
559 │   // are cached in TView and may become stale (in case any of these defs gets recompiled). In
560 │   // order to avoid this problem, we force fresh TView to be created.
561 ▶   componentDef.tView = null;
562 │ }
```

543 行目 `patchComponentDefWithScope`。547〜548 行目、`directiveDefs` を「compilation スコープの directives から def を集める関数」に差し替えます。553〜554 行目、`pipeDefs` も同様。555 行目、`schemas` もモジュールのものに。561 行目 `componentDef.tView = null`。既に作られていた `TView`（[ivy-tview](../ivy/05-ivy-tview.md)）を捨てて、次の描画で `directiveRegistry` を作り直させます。**JIT では「このコンポーネントのテンプレートで使える directive」は、この関数でモジュール側からコンポーネント def に書き込まれる**のです。AOT ではコンパイラが直接 `dependencies` として出力します（[第 4 回](04-ngmodule-compilation-scope.md)）。

### flush はいつ呼ばれるか

📄 `angular/packages/core/src/render3/jit/directive.ts` L187–208 （▶ の行: 192, 198, 205–207）

```ts
187 │         } finally {
188 │           // Ensure that the compilation depth is decremented even when the compilation failed.
189 │           compilationDepth--;
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
200 │ 
201 │         // If component compilation is async, then the @NgModule annotation which declares the
202 │         // component may execute and set an ngSelectorScope property on the component type. This
203 │         // allows the component to patch itself with directiveDefs from the module after it
204 │         // finishes compiling.
205 ▶         if (hasSelectorScope(type)) {
206 ▶           const scopes = transitiveScopesFor(type.ngSelectorScope);
207 ▶           patchComponentDefWithScope(ngComponentDef, scopes);
208 │         }
```

`core/src` の中で呼んでいるのは `compileComponent` の `ɵcmp` getter の中、1 か所だけです（ほかに `ɵflushModuleScopingQueueAsMuchAsPossible` として export され、`TestBed` が呼びます。[第 17 回](17-ngmodule-testbed.md)）。192 行目、`compilationDepth === 0`（入れ子でコンパイル中でない）なら 198 行目で flush。つまり**どれかのコンポーネントの `ɵcmp` が初めて読まれるたびに、キューに残っているモジュールが「もう全部 resolve できるか」を確かめられます**。205〜207 行目、4 節の 534 行目で `ngSelectorScope` が書かれていたコンポーネントは、ここで自分からモジュールのスコープを取りに行き `patchComponentDefWithScope` します。モジュール側から押す経路（528 行目）と、コンポーネント側から引く経路（207 行目）の 2 本があるわけです。

> **🧪 DEMO — @NgModule を付けたクラスに、いつ何が付くか**
>
> ステップを進めると、その時点で `MyModule` に定義されているプロパティと、getter の中身（コンパイル結果）が作られているかを表にします。ソースを読んで固定した表で、実際に JIT コンパイラは動かしていません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngmodule-decorator)

## 5. AOT ではこの経路が消える

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/ng_modules/all_options.js` L6–23 （▶ の行: 7–9, 11, 23）

```js
 6 │ export class MyModule {
 7 ▶     static ɵfac = function MyModule_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || MyModule)(); };
 8 ▶     static ɵmod = /*@__PURE__*/ i0.ɵɵdefineNgModule({ type: MyModule, bootstrap: [MyBootstrap], id: 'my-module-id' });
 9 ▶     static ɵinj = /*@__PURE__*/ i0.ɵɵdefineInjector({ imports: [MyImport] });
10 │ }
11 ▶ (() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(MyModule, [{
12 │         type: NgModule,
13 │         args: [{
14 │                 declarations: [MyDecl, MyExport],
15 │                 imports: [MyImport],
16 │                 exports: [MyExport],
17 │                 bootstrap: [forwardRef(() => MyBootstrap)],
18 │                 schemas: [NO_ERRORS_SCHEMA],
19 │                 id: 'my-module-id'
20 │             }]
21 │     }], null, null); })();
22 │ …
23 ▶ i0.ɵɵregisterNgModuleType(MyModule, 'my-module-id');
```
*第 1 回 5 節の all\_options.ts に対する AOT 出力（compliance テストの期待値。… は省略記号）。*

AOT（`ng build`。[application builder](../boot/04-boot-application-build.md)は既定で AOT）では、`@NgModule` デコレータは出力から**消えます**。7〜9 行目、`ɵfac` / `ɵmod` / `ɵinj` が getter ではなく `static` フィールドの**値**として直接書かれます。`makeDecorator` も `compileNgModuleDefs` も `moduleQueue` も実行されません。

11 行目の `ɵsetClassMetadata` は `ngDevMode` ガード付きで、開発ビルドでだけ元のデコレータ引数をクラスの静的フィールドに保存します。本番では消えます。

📄 `angular/packages/core/src/render3/metadata.ts` L87–102 （▶ の行: 87, 89, 96–98, 100）

```ts
 87 ▶ export function setClassMetadata(
 88 │   type: any,
 89 ▶   decorators: readonly any[] | null,
 90 │   ctorParameters: (() => any[]) | null,
 91 │   propDecorators: {[field: string]: any} | null,
 92 │ ): void {
 93 │   return noSideEffects(() => {
 94 │     const clazz = type as TypeWithMetadata;
 95 │ 
 96 ▶     if (decorators !== null) {
 97 ▶       if (Object.hasOwn(clazz, 'decorators') && clazz.decorators !== undefined) {
 98 ▶         clazz.decorators.push(...decorators);
 99 │       } else {
100 ▶         clazz.decorators = decorators as any[];
101 │       }
102 │     }
```

87〜89 行目、受け取るのはデコレータの配列、コンストラクタ引数、プロパティデコレータ。96〜100 行目、`MyModule.decorators` に既にあれば push、無ければ代入。この `decorators` / `ctorParameters` / `propDecorators` は `ReflectionCapabilities` が読む静的フィールドで、`TestBed.overrideModule` がメタデータを取り直すときに使われます。23 行目 `ɵɵregisterNgModuleType` は 2 節の 109 行目と同じ関数で、こちらは `id` があるときだけ出力されます。この出力をコンパイラがどう組み立てるかが[次回](03-ngmodule-aot-output.md)です。

> [!WARNING]
> **ハマりどころ**
>
> `ng test`（Karma / Vitest / Jest）は JIT です。テストで「needs to be compiled using the JIT compiler, but '@angular/compiler' is not available」や「standalone を declarations に入れている」というエラーが `TestBed.configureTestingModule` 直後ではなく `createComponent` のときに出るのは、3 節の getter が遅延しているからです。`ɵinj` が初めて読まれるのは `R3Injector` を作るときで、それは `TestBed` が `NgModuleRef` を作る `finalize` のタイミングです（[第 17 回](17-ngmodule-testbed.md)）。

## ここまでの呼び出し

- 👤 `@NgModule({ declarations: [...], imports: [...] }) class MyModule {}` — あなたのコード — *TS が NgModule(meta)(MyModule) に展開*
  - `DecoratorFactory(meta)` — core/src/util/decorators.ts L57 — *new DecoratorFactory(meta) でメタデータのインスタンスを作る（L66）*
  - `TypeDecorator(MyModule)` — decorators.ts L67
    - `typeFn = compileNgModule(MyModule, meta)` — metadata/ng\_module.ts L223 → render3/jit/module.ts L105
      - `patchModuleCompilation()` — jit/module.ts L106
      - `compileNgModuleDefs(MyModule, meta)` — jit/module.ts L107 → L125 — *Object.defineProperty × 3（ɵmod L134 / ɵfac L174 / ɵinj L197）。コンパイルはまだ*
      - `registerNgModuleType(MyModule, id)` — jit/module.ts L109 — *id があるときだけ*
      - `enqueueModuleForDelayedScoping(MyModule, meta)` — jit/module.ts L116 → L59 — *moduleQueue.push*
    - `annotations.push(annotationInstance)` — decorators.ts L74 — *MyModule.\_\_annotations\_\_*
    - `return cls` — decorators.ts L78
- 👤 `MyModule.ɵmod`（後で誰かが読む） — 例: transitiveScopesFor、NgModuleRef
  - `get()` — jit/module.ts L136 — *ngModuleDef === null なら*
    - `getCompilerFacade(...).compileNgModule(angularCoreEnv, 'ng:///MyModule/ɵmod.js', {...})` — jit/module.ts L143-160 → compiler/src/jit\_compiler\_facade.ts L223 — *selectorScopeMode: Inline*
      - `compileNgModule(meta)` → `jitExpression(...)` — jit\_compiler\_facade.ts L242-243 — *AOT と同じ compileNgModule。出力 AST を評価して NgModuleDef を返す*
- 👤 `MyModule.ɵinj`（後で R3Injector が読む） — walkProviderTree（第 8 回）
  - `get()` — jit/module.ts L198
    - `verifySemanticsOfNgModuleDef(MyModule, false)` — jit/module.ts L200 — *ngDevMode のみ*
    - `compiler.compileInjector(..., {providers, imports: [imports, exports]})` — jit/module.ts L215 → jit\_compiler\_facade.ts L195

## 聞かれそうな質問

**Q. @NgModule を付けた瞬間に何が起きますか？AOT と JIT で違いますか？**

JIT では decorators.ts 67〜68 行目の `TypeDecorator` が `compileNgModule`（jit/module.ts 105 行目）を呼び、`compileNgModuleDefs` が `Object.defineProperty` で `ɵmod`（134 行目）/ `ɵfac`（174 行目）/ `ɵinj`（197 行目）の getter を付け、`moduleQueue` に push します（116 行目）。コンパイル自体は getter が初めて読まれるまで走りません。AOT では 5 節のとおりデコレータは出力に残らず、3 つの static フィールドが値として直接書かれているので、実行時にはこの経路は 1 行も動きません。

**Q. forwardRef があるとき JIT はどう待ちますか？**

デコレータ実行時は `moduleQueue` に入れるだけです（59〜60 行目）。どれかのコンポーネントの `ɵcmp` が初めて読まれたとき（jit/directive.ts 198 行目）に `flushModuleScopingQueueAsMuchAsPossible` が呼ばれ、76 行目で declarations が全部 `resolveForwardRef` できる（93〜97 行目）モジュールだけを取り出して `setScopeOnDeclaredComponents` します。まだ `undefined` を返す forwardRef が 1 つでもあればキューに残り、次に別のコンポーネントがコンパイルされたときに再挑戦します。

**Q. JIT で standalone コンポーネントを declarations に入れたエラーは、どのタイミングで出ますか？**

`ɵinj` の getter の中、jit/module.ts 200 行目の `verifySemanticsOfNgModuleDef` です（開発モードのみ）。`ɵinj` は `R3Injector` がモジュールの providers を集めるときに初めて読まれるので、エラーが出るのはデコレータ適用時ではなく、注入器を作る時点です。

**Q. exports に書いた NgModule の providers が、import した側で使えるのはなぜですか？**

jit/module.ts 205〜208 行目で、`ɵinj` の `imports` に `[imports, exports]` の両方を渡しているからです。AOT 側も同じ結果になるよう、ng\_module handler の resolve が exports の NgModule を注入器の imports に足します（[第 3 回](03-ngmodule-aot-output.md)）。

**Q. @angular/compiler を読み込んでいない本番アプリで NgModule を new すると壊れますか？**

AOT ビルドなら壊れません。5 節の出力 7〜9 行目のように static フィールドは値として埋め込まれているので、getter も `getCompilerFacade` も呼ばれません。壊れるのは、AOT 出力に含まれないクラスを実行時に `@NgModule` で動的に作ったときで、そのときは 3 節の `getCompilerFacade` が「needs to be compiled using the JIT compiler, but '@angular/compiler' is not available」（compiler\_facade.ts 34 行目）を投げます。

## 読み終えて

- `@NgModule` は `makeDecorator` の産物。クラスに適用されると `typeFn` = `compileNgModule`（ng\_module.ts 223 行目）が先に呼ばれ、その後 `__annotations__` に push される
- `compileNgModuleDefs`（jit/module.ts 125〜226 行目）は `ɵmod` / `ɵfac` / `ɵinj` を**getter として**定義するだけ。コンパイルは初回アクセス時
- `ɵinj` の getter で `verifySemanticsOfNgModuleDef`（200 行目）が走り、`imports` には `[imports, exports]` の両方が入る（205〜208 行目）
- forwardRef は `moduleQueue` と `flushModuleScopingQueueAsMuchAsPossible`（69〜86 行目）で待つ。flush の呼び出し元はコンポーネントの `ɵcmp` getter（jit/directive.ts 198 行目）だけ
- AOT ではデコレータが消え、3 つの static フィールドが値として直接出る。次回はその出力を compiler がどう組むかを読む

---

← 前: [NgModule の概観：コンパイル時のスコープと実行時のインジェクタ、2 つの仕事](01-ngmodule.md)  
次: [AOT が @NgModule を何に変換するか：ɵɵdefineNgModule・ɵɵdefineInjector・ɵɵsetNgModuleScope](03-ngmodule-aot-output.md) →
