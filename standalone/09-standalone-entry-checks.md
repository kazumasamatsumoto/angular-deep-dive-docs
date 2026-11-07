[目次](../README.md) › [standalone コンポーネントの内側](README.md) › 第 9 回 / 全 14 回

# standalone でないコンポーネントを渡すと何が起きるか：assertStandaloneComponentType と orphan component

> bootstrapApplication の入口で assertStandaloneComponentType が NG0907 を投げる行、ApplicationRef.bootstrap のメッセージが standalone かどうかで変わる行、createComponent / ViewContainerRef で NgModule 未ロードのコンポーネントを描くと orphan として NG0981 になる verifyNotAnOrphanComponent、それを有効にする forbidOrphanComponents オプションと ɵsetClassDebugInfo、createComponent の directives オプションが standalone を要求する行。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/standalone-entry-checks)

---

standalone コンポーネントを前提にした入口に、standalone でないもの（`standalone: false` のコンポーネントや、NgModule にしか属していないコンポーネント）を渡すと何が起きるか。この章では「エラーになる」で終わらせず、**どの関数のどの行が投げるか**を入口ごとに示します。`bootstrapApplication` の `assertStandaloneComponentType`（NG0907）、`ApplicationRef.bootstrap` のメッセージが `isStandalone` で変わる行、`ComponentFactory.create` が呼ぶ `verifyNotAnOrphanComponent`（NG0981）とそれを有効にする `forbidOrphanComponents` → `ɵsetClassDebugInfo` の経路、`createComponent` の `directives` オプションが standalone を要求する行、そして Router の `loadComponent` です。

読む対象は `packages/core/src/application/create_application.ts`、`application_ref.ts`、`packages/core/src/render3/errors.ts`、`component_ref.ts`、`deps_tracker/deps_tracker.ts`、`debug/set_debug_info.ts`、コンパイラ側の `compiler-cli/src/ngtsc/annotations/common/src/debug_info.ts`、`compiler/src/render3/r3_class_debug_info_compiler.ts`、`compiler-cli/src/ngtsc/core/src/compiler.ts`、Router の `router_config_loader.ts` と `utils/config.ts` です。

1. [1. 概観](01-standalone.md)
2. [2. @Component 実行の瞬間（JIT）](02-standalone-decorator.md)
3. [3. imports の検証（AOT）](03-standalone-imports-check.md)
4. [4. 使った依存だけが残る](04-standalone-used-only.md)
5. [5. forwardRef と自己参照](05-standalone-forward-ref.md)
6. [6. ローカルコンパイル](06-standalone-local-compilation.md)
7. [7. 実行時の依存解決](07-standalone-directive-registry.md)
8. [8. providers の 2 つの行き先](08-standalone-providers-two-injectors.md)
9. **9. 入口の検査**（この章）
10. [10. hostDirectives](10-standalone-host-directives.md)
11. [11. @defer と imports](11-standalone-defer-deps.md)
12. [12. TestBed の差し替え](12-standalone-testbed-override.md)
13. [13. selectorless（実験的）](13-standalone-selectorless.md)
14. [14. foreignImports（内部向け）](14-standalone-foreign-imports.md)

## 1. bootstrapApplication：assertStandaloneComponentType（NG0907）

`bootstrapApplication(App)` は `internalCreateApplication` に入ります（全体は [boot-bootstrap-application](../boot/07-boot-bootstrap-application.md)）。その最初の仕事がこれです。

📄 `angular/packages/core/src/application/create_application.ts` L56–63 （▶ の行: 60–61）

```ts
56 │   try {
57 │     const platformInjector =
58 │       platformRef?.injector ?? createOrReusePlatformInjector(platformProviders as StaticProvider[]);
59 │ 
60 ▶     if ((typeof ngDevMode === 'undefined' || ngDevMode) && rootComponent !== undefined) {
61 ▶       assertStandaloneComponentType(rootComponent);
62 │     }
63 │ 
```

60 行目、条件は 2 つ。`ngDevMode`（未定義か真。**開発モードだけ**）と、`rootComponent !== undefined` （`createApplication()` のようにコンポーネント無しで呼ぶ経路もあるため）。61 行目で `assertStandaloneComponentType(rootComponent)`。

📄 `angular/packages/core/src/render3/errors.ts` L25–37 （▶ の行: 26–30, 34）

```ts
25 │ export function assertStandaloneComponentType(type: Type<unknown>) {
26 ▶   assertComponentDef(type);
27 ▶   const componentDef = getComponentDef(type)!;
28 ▶   if (!componentDef.standalone) {
29 ▶     throw new RuntimeError(
30 ▶       RuntimeErrorCode.TYPE_IS_NOT_STANDALONE,
31 │       `The ${stringifyForError(type)} component is not marked as standalone, ` +
32 │         `but Angular expects to have a standalone component here. ` +
33 │         `Please make sure the ${stringifyForError(type)} component does not have ` +
34 ▶         `the \`standalone: false\` flag in the decorator.`,
35 │     );
36 │   }
37 │ }
```

1. **26 行目：まず `assertComponentDef`**

   `ɵcmp` が無ければ（`@Component` を付けていないクラスを渡した）この時点で `MISSING_GENERATED_DEF`（NG0906）です。standalone の検査より前に「コンポーネントであること」を確かめます。
2. **27〜28 行目：`componentDef.standalone` を読む**

   [NgModule シリーズ第 19 回](../ngmodule/18-ngmodule-to-standalone.md)で見たとおり、`ɵɵdefineComponent` はこのフィールドを既定 `true` にし、AOT は `standalone: false` を書いたときだけ `ɵcmp` に `standalone: false` を書き出します。だから「何も書いていないコンポーネント」はここを通ります。
3. **29〜30 行目：`TYPE_IS_NOT_STANDALONE` を投げる**

   34 行目のメッセージが `standalone: false` フラグを外せと言っているのは、v19 以降は既定が standalone だからです。

📄 `angular/packages/core/src/errors.ts` L112–125 （▶ の行: 113, 123–124）

```ts
112 │   // standalone errors
113 ▶   IMPORT_PROVIDERS_FROM_STANDALONE = 800,
114 │ 
115 │   // JIT Compilation Errors
116 │   // Other
117 │   INVALID_DIFFER_INPUT = 900,
118 │   NO_SUPPORTING_DIFFER_FACTORY = 901,
119 │   VIEW_ALREADY_ATTACHED = 902,
120 │   INVALID_INHERITANCE = 903,
121 │   UNSAFE_VALUE_IN_RESOURCE_URL = 904,
122 │   UNSAFE_VALUE_IN_SCRIPT = 905,
123 ▶   MISSING_GENERATED_DEF = 906,
124 ▶   TYPE_IS_NOT_STANDALONE = 907,
125 │   MISSING_ZONEJS = 908,
```

124 行目、`TYPE_IS_NOT_STANDALONE = 907`。正の値なのでメッセージは本番でも残ります（ただし 1 節 60 行目の条件で本番では呼ばれません）。123 行目の 906 が上の `assertComponentDef`。113 行目の 800 は `importProvidersFrom` に standalone コンポーネントを渡したときの別件です （[第 14 回](../ngmodule/14-ngmodule-import-providers-from.md)）。

## 2. ApplicationRef.bootstrap：検査ではなくメッセージが変わる

`bootstrapApplication` は最終的に `ApplicationRef.bootstrap(rootComponent)` を呼びます。NgModule 経由の `bootstrapModule` も `ngDoBootstrap` から同じメソッドに来ます。ここに standalone の**検査はありません**。

📄 `angular/packages/core/src/application/application_ref.ts` L472–483 （▶ の行: 472, 474–475, 477–478, 480, 482）

```ts
472 ▶       if (!initStatus.done) {
473 │         let errorMessage = '';
474 ▶         if (typeof ngDevMode === 'undefined' || ngDevMode) {
475 ▶           const standalone = isStandalone(component);
476 │           errorMessage =
477 ▶             'Cannot bootstrap as there are still asynchronous initializers running.' +
478 ▶             (standalone
479 │               ? ''
480 ▶               : ' Bootstrap components in the `ngDoBootstrap` method of the root module.');
481 │         }
482 ▶         throw new RuntimeError(RuntimeErrorCode.ASYNC_INITIALIZERS_STILL_RUNNING, errorMessage);
483 │       }
```

472 行目、`APP_INITIALIZER` の非同期初期化がまだ終わっていないときだけの分岐です。474〜475 行目、開発モードなら `isStandalone(component)` を読み、477〜480 行目でメッセージを組みます。standalone なら「まだ非同期初期化が走っている」だけ、standalone でなければ「ルートモジュールの `ngDoBootstrap` でブートストラップせよ」と足します。482 行目で `ASYNC_INITIALIZERS_STILL_RUNNING`（NG0405）。**standalone かどうかはエラーの有無を変えず、助言の文だけを変えます**。standalone でないコンポーネントをここに渡すのは NgModule 経路では正常な使い方だからです。

📄 `angular/packages/core/src/render3/def_getters.ts` L77–87 （▶ の行: 79, 82, 84–86）

```ts
77 │ /**
78 │  * Checks whether a given Component, Directive or Pipe is marked as standalone.
79 ▶  * This will return false if passed anything other than a Component, Directive, or Pipe class
80 │  *
81 │  * @param type A reference to a Component, Directive or Pipe.
82 ▶  * @publicApi
83 │  */
84 ▶ export function isStandalone(type: Type<unknown>): boolean {
85 ▶   const def = getComponentDef(type) || getDirectiveDef(type) || getPipeDef(type);
86 ▶   return def !== null && def.standalone;
87 │ }
```

84〜86 行目、`isStandalone` は `ɵcmp` / `ɵdir` / `ɵpipe` のどれかを取り、その `standalone` を返します。79 行目のコメントどおり、どの def も無ければ `false`（NgModule クラスや普通のクラスを渡すと `false`）。82 行目、`@publicApi` なので `@angular/core` から `import { isStandalone }` できます。1 節の `assertStandaloneComponentType` は これを使わず 28 行目で `componentDef.standalone` を直接読んでいますが、見ている値は同じです。

## 3. ComponentFactory.create：orphan component（NG0981）

`createComponent()`、`ViewContainerRef.createComponent()`、Router の `RouterOutlet`、そして 2 節の `ApplicationRef.bootstrap` も、全部 `ComponentFactory.create` に集まります（[第 13 回](../ngmodule/13-ngmodule-standalone-imports.md)で経路を引用）。その入口にもう 1 つ検査があります。

📄 `angular/packages/core/src/render3/component_ref.ts` L278–286 （▶ の行: 280–282）

```ts
278 │     const prevConsumer = setActiveConsumer(null);
279 │     try {
280 ▶       const cmpDef = this.componentDef;
281 ▶       ngDevMode && verifyNotAnOrphanComponent(cmpDef);
282 ▶       const rootViewInjector = createRootViewInjector(
283 │         cmpDef,
284 │         environmentInjector || this.ngModule,
285 │         injector,
286 │       );
```

281 行目、`ngDevMode` のときだけ `verifyNotAnOrphanComponent(cmpDef)`。282 行目の `createRootViewInjector`（第 13 回）の直前です。

📄 `angular/packages/core/src/render3/component_ref.ts` L109–124 （▶ の行: 111–113, 115–117, 120）

```ts
109 │ function verifyNotAnOrphanComponent(componentDef: ComponentDef<unknown>) {
110 │   // TODO(pk): create assert that verifies ngDevMode
111 ▶   if (
112 ▶     (typeof ngJitMode === 'undefined' || ngJitMode) &&
113 ▶     componentDef.debugInfo?.forbidOrphanRendering
114 │   ) {
115 ▶     if (depsTracker.isOrphanComponent(componentDef.type as Type<any>)) {
116 ▶       throw new RuntimeError(
117 ▶         RuntimeErrorCode.RUNTIME_DEPS_ORPHAN_COMPONENT,
118 │         `Orphan component found! Trying to render the component ${debugStringifyTypeForError(
119 │           componentDef.type,
120 ▶         )} without first loading the NgModule that declares it. It is recommended to make this component standalone in order to avoid this error. If this is not possible now, import the component's NgModule in the appropriate NgModule, or the standalone component in which you are trying to render this component. If this is a lazy import, load the NgModule lazily as well and use its module injector.`,
121 │       );
122 │     }
123 │   }
124 │ }
```

1. **112 行目：`ngJitMode` が未定義か真**

   `ngJitMode` はビルド時に置き換えられるグローバルです。Angular CLI の AOT ビルドは `ngJitMode` を `false` に define します （[NgModule シリーズ第 3 回](../ngmodule/03-ngmodule-aot-output.md)で引用）。つまり **CLI の AOT ビルドでは 112 行目が偽になり、この検査は丸ごと飛びます**。走るのは JIT（`ngJitMode` が未定義のまま、または `true`）のときです。
2. **113 行目：`componentDef.debugInfo?.forbidOrphanRendering`**

   コンパイル時のオプションで付くフラグです（4 節）。付けていなければ `undefined` で、ここも偽。既定の設定ではこの 2 行のどちらかで止まるので、orphan 検査は**既定では動きません**。
3. **115 行目：`depsTracker.isOrphanComponent(type)`**

   両方の条件を越えたときだけ、実際に「孤児か」を調べます。
4. **116〜120 行目：`RUNTIME_DEPS_ORPHAN_COMPONENT`**

   120 行目のメッセージは長いですが要点は「宣言している NgModule を読み込む前に描こうとした。standalone にするのを推奨。できなければ NgModule を import するか、遅延なら NgModule も遅延で」です。

📄 `angular/packages/core/src/render3/deps_tracker/deps_tracker.ts` L295–306 （▶ の行: 296–297, 299–300, 303, 305）

```ts
295 │   /** @override */
296 ▶   isOrphanComponent(cmp: Type<any>): boolean {
297 ▶     const def = getComponentDef(cmp);
298 │ 
299 ▶     if (!def || def.standalone) {
300 ▶       return false;
301 │     }
302 │ 
303 ▶     this.resolveNgModulesDecls();
304 │ 
305 ▶     return !this.ownerNgModule.has(cmp as ComponentType<any>);
306 │   }
```

297〜300 行目、`ɵcmp` が無い、または `standalone` なら孤児ではありません。**standalone コンポーネントはここで必ず `false`**です。303 行目、`resolveNgModulesDecls` で登録済みの NgModule の `declarations` を全部辿り直し（JIT の `ɵɵsetNgModuleScope` が登録する。[第 6 回](../ngmodule/06-ngmodule-jit-scope.md)）、305 行目、`ownerNgModule` にこのコンポーネントが無ければ孤児。「宣言している NgModule のコードがまだ 1 行も実行されていない」＝「遅延ロードされていない」を、この Set の有無で判定しています。

📄 `angular/packages/core/src/errors.ts` L153–155 （▶ の行: 155）

```ts
153 │   // Runtime dependency tracker errors
154 │   RUNTIME_DEPS_INVALID_IMPORTED_TYPE = 980,
155 ▶   RUNTIME_DEPS_ORPHAN_COMPONENT = 981,
```

## 4. forbidOrphanRendering はどこから来るか

3 節 113 行目の `debugInfo.forbidOrphanRendering` を遡ります。出発点は `tsconfig.json` の `angularCompilerOptions` です。

📄 `angular/packages/compiler-cli/src/ngtsc/core/api/src/public_options.ts` L457–464 （▶ の行: 458–459, 461–462, 464）

```ts
457 │   /**
458 ▶    * Enables the runtime check to guard against rendering a component without first loading its
459 ▶    * NgModule.
460 │    *
461 ▶    * This check is only applied to the current compilation unit, i.e., a component imported from
462 ▶    * another library without option set will not issue error if rendered in orphan way.
463 │    */
464 ▶   forbidOrphanComponents?: boolean;
```

464 行目、`forbidOrphanComponents`。458〜459 行目の説明は 3 節そのものです。461〜462 行目、**いまコンパイルしている単位にだけ**効き、別ライブラリから来たコンポーネントには付きません（ライブラリ側でこのオプションを付けてコンパイルしていなければ）。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L1536–1541 （▶ の行: 1540）

```ts
1536 │         importTracker,
1537 │         supportTestBed,
1538 │         compilationMode,
1539 │         deferredSymbolsTracker,
1540 ▶         !!this.options.forbidOrphanComponents,
1541 │         this.enableBlockSyntax,
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1058–1064 （▶ の行: 1058, 1063）

```ts
1058 ▶         classDebugInfo: extractClassDebugInfo(
1059 │           node,
1060 │           this.reflector,
1061 │           this.compilerHost,
1062 │           this.rootDirs,
1063 ▶           /* forbidOrphanRenderering */ this.forbidOrphanRendering,
1064 │         ),
```

1540 行目、`NgCompiler` が `!!this.options.forbidOrphanComponents` を `ComponentDecoratorHandler` のコンストラクタに渡し、1058〜1063 行目、ハンドラの `analyze` がコンポーネントごとに `extractClassDebugInfo` へそれを渡します。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/common/src/debug_info.ts` L15–36 （▶ の行: 20, 29–31, 33–34）

```ts
15 │ export function extractClassDebugInfo(
16 │   clazz: DeclarationNode,
17 │   reflection: ReflectionHost,
18 │   compilerHost: Pick<ts.CompilerHost, 'getCanonicalFileName'>,
19 │   rootDirs: ReadonlyArray<string>,
20 ▶   forbidOrphanRendering: boolean,
21 │ ): R3ClassDebugInfo | null {
22 │   if (!reflection.isClass(clazz)) {
23 │     return null;
24 │   }
25 │ 
26 │   const srcFile = clazz.getSourceFile();
27 │   const srcFileMaybeRelativePath = getProjectRelativePath(srcFile.fileName, rootDirs, compilerHost);
28 │ 
29 ▶   return {
30 ▶     type: new WrappedNodeExpr(clazz.name),
31 ▶     className: literal(clazz.name.getText()),
32 │     filePath: srcFileMaybeRelativePath ? literal(srcFileMaybeRelativePath) : null,
33 ▶     lineNumber: literal(srcFile.getLineAndCharacterOfPosition(clazz.name.pos).line + 1),
34 ▶     forbidOrphanRendering,
35 │   };
36 │ }
```

29〜34 行目、クラス名（31 行目）、プロジェクト相対のファイルパス、行番号（33 行目）、そして 34 行目の `forbidOrphanRendering` をまとめます。DevTools がコンポーネントのソース位置を表示できるのはこの情報のおかげで、orphan のフラグはそこに相乗りしています。

📄 `angular/packages/compiler/src/render3/r3_class_debug_info_compiler.ts` L66–82 （▶ の行: 67–69, 73–74, 77–78, 80）

```ts
66 │   // Include file path and line number only if the file relative path is calculated successfully.
67 ▶   if (debugInfo.filePath) {
68 ▶     debugInfoObject.filePath = debugInfo.filePath;
69 ▶     debugInfoObject.lineNumber = debugInfo.lineNumber;
70 │   }
71 │ 
72 │   // Include forbidOrphanRendering only if it's set to true (to reduce generated code)
73 ▶   if (debugInfo.forbidOrphanRendering) {
74 ▶     debugInfoObject.forbidOrphanRendering = o.literal(true);
75 │   }
76 │ 
77 ▶   const fnCall = o
78 ▶     .importExpr(R3.setClassDebugInfo)
79 │     .callFn([debugInfo.type, mapLiteral(debugInfoObject)]);
80 ▶   const iife = o.arrowFn([], [devOnlyGuardedExpression(fnCall).toStmt()]);
81 │   return iife.callFn([]);
82 │ }
```

コード生成側です。73〜74 行目、`forbidOrphanRendering` は**真のときだけ**オブジェクトに書きます（偽なら省いてコードを小さくする）。だから既定では `debugInfo` にこのフィールドそのものが無く、3 節 113 行目の `?.` が `undefined` を返します。77〜78 行目で `ɵsetClassDebugInfo(Type, {...})` の呼び出しを作り、80 行目で `devOnlyGuardedExpression`、つまり `ngDevMode && ...` で包みます。67〜69 行目、ファイルパスと行番号は相対パスが計算できたときだけ入ります。

📄 `angular/packages/core/src/render3/debug/set_debug_info.ts` L18–26 （▶ の行: 22–24）

```ts
18 │ export function ɵsetClassDebugInfo(
19 │   type: Type<any> | AbstractType<any>,
20 │   debugInfo: ClassDebugInfo,
21 │ ): void {
22 ▶   const def = getComponentDef(type);
23 ▶   if (def !== null) {
24 ▶     def.debugInfo = debugInfo;
25 │   }
26 │ }
```

📄 `angular/packages/core/src/render3/interfaces/definition.ts` L52–57 （▶ の行: 53, 56）

```ts
52 │ export interface ClassDebugInfo {
53 ▶   className: string;
54 │   filePath?: string;
55 │   lineNumber?: number;
56 ▶   forbidOrphanRendering?: boolean;
57 │ }
```

実行時側は 3 行です。22〜24 行目、`ɵcmp` があればその `debugInfo` に代入するだけ。型は 53〜56 行目で、`forbidOrphanRendering` は省略可能。これで 3 節 113 行目まで戻ってきました。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L1493–1500 （▶ の行: 1493, 1496–1498）

```ts
1493 ▶     // Currently forbidOrphanComponents depends on the code generated behind ngJitMode flag. Until
1494 │     // we come up with a better design for these flags, it is necessary to have the JIT mode in
1495 │     // order for forbidOrphanComponents to be able to work properly.
1496 ▶     if (supportJitMode === false && this.options.forbidOrphanComponents) {
1497 ▶       throw new Error(
1498 ▶         'JIT mode support ("supportJitMode" option) cannot be disabled when forbidOrphanComponents is set to true',
1499 │       );
1500 │     }
```

1493〜1498 行目、`supportJitMode: false`（JIT 用の `ɵɵsetNgModuleScope` などの生成を省く設定）と `forbidOrphanComponents: true` は同時に指定できません。3 節 303〜305 行目の `ownerNgModule` が `ɵɵsetNgModuleScope` の登録に頼っているので、それを省くと孤児判定が成り立たないからです。

> [!WARNING]
> **ハマりどころ**
>
> まとめると orphan 検査が動く条件は 4 つ。`ngDevMode`（component\_ref.ts 281 行目）、`ngJitMode` が偽でない（112 行目）、`forbidOrphanComponents` 付きでコンパイルされている（113 行目）、そしてそのコンポーネントが standalone でない（deps\_tracker.ts 299 行目）。CLI の通常のアプリは 2 つ目で外れます。この検査は、JIT で動く環境（社内の大規模モノレポなど）で「NgModule を遅延ロードし忘れた」事故を早く見つけるためのものです。

## 5. createComponent の directives オプション（NG0907 ふたたび）

`createComponent(Cmp, { directives: [Dir] })` で動的に作るコンポーネントのホスト要素にディレクティブを足せます。その `Dir` には standalone が要求されます。`ComponentFactory.create` → `createRootTView` の中です。

📄 `angular/packages/core/src/render3/component_ref.ts` L495–513 （▶ の行: 495–496, 499–500, 503–505, 511）

```ts
495 ▶   const directivesToApply: DirectiveDef<unknown>[] = [componentDef];
496 ▶   if (directives) {
497 │     for (const directive of directives) {
498 │       const directiveType = typeof directive === 'function' ? directive : directive.type;
499 ▶       const directiveDef = ngDevMode
500 ▶         ? getDirectiveDefOrThrow(directiveType)
501 │         : getDirectiveDef(directiveType)!;
502 │ 
503 ▶       if (ngDevMode && !allowNonStandaloneDirectives && !directiveDef.standalone) {
504 ▶         throw new RuntimeError(
505 ▶           RuntimeErrorCode.TYPE_IS_NOT_STANDALONE,
506 │           `The ${stringifyForError(directiveType)} directive must be standalone in ` +
507 │             `order to be applied to a dynamically-created component.`,
508 │         );
509 │       }
510 │ 
511 ▶       directivesToApply.push(directiveDef);
512 │     }
513 │   }
```

495 行目、ホストに当てる def の配列はコンポーネント自身から始まります（[第 7 回](07-standalone-directive-registry.md)の「コンポーネントが先頭」と同じ並び）。499〜500 行目、開発モードなら `getDirectiveDefOrThrow`（`ɵdir` が無ければ投げる）。503 行目、`ngDevMode` かつ `allowNonStandaloneDirectives` が偽かつ `directiveDef.standalone` が偽なら、504〜505 行目で 1 節と同じ `TYPE_IS_NOT_STANDALONE`（NG0907）。通れば 511 行目で配列に足されます。

`allowNonStandaloneDirectives` という抜け道があります。`ComponentFactory.create` の最後の引数で、公開 API の `createComponent()` は渡しません。渡しているのは 1 か所です。

📄 `angular/packages/core/testing/src/test_bed.ts` L778–792 （▶ の行: 778–779, 783, 789, 791）

```ts
778 ▶       const hostRef = this.createComponentRef(
779 ▶         DirectiveTestHost,
780 │         tagName,
781 │         renderer,
782 │         undefined,
783 ▶         [
784 │           options?.bindings
785 │             ? {
786 │                 type,
787 │                 bindings: options.bindings,
788 │               }
789 ▶             : type,
790 │         ],
791 ▶         true,
792 │       );
```

`TestBed.createDirective(Dir)` です。778〜779 行目、内部のホストコンポーネント `DirectiveTestHost` を作り、783〜789 行目でテスト対象のディレクティブを `directives` に、791 行目で `true` を渡します。NgModule に属する古いディレクティブも単体でテストできるようにするための例外で、アプリのコードからは使えません。

## 6. Router の loadComponent

`{ path: 'x', loadComponent: () => import('./x').then(m => m.X) }` の `X` も検査されます。`RouterConfigLoader.loadComponent` の、読み込みが終わった直後です。

📄 `angular/packages/router/src/router_config_loader.ts` L70–73 （▶ の行: 70–72）

```ts
70 ▶         (typeof ngDevMode === 'undefined' || ngDevMode) &&
71 ▶           assertStandalone(route.path ?? '', component);
72 ▶         route._loadedComponent = component;
73 │         return component;
```

📄 `angular/packages/router/src/utils/config.ts` L74–85 （▶ の行: 74–75, 77–78, 80–81, 83）

```ts
74 ▶   if (component && isNgModule(component)) {
75 ▶     throw new RuntimeError(
76 │       RuntimeErrorCode.INVALID_ROUTE_CONFIG,
77 ▶       `Invalid configuration of route '${fullPath}'. You are using 'loadComponent' with a module, ` +
78 ▶         `but it must be used with standalone components. Use 'loadChildren' instead.`,
79 │     );
80 ▶   } else if (component && !isStandalone(component)) {
81 ▶     throw new RuntimeError(
82 │       RuntimeErrorCode.INVALID_ROUTE_CONFIG,
83 ▶       `Invalid configuration of route '${fullPath}'. The component must be standalone.`,
84 │     );
85 │   }
```

70〜71 行目、開発モードなら `assertStandalone(path, component)`。通れば 72 行目で `route._loadedComponent` に保存します。74〜78 行目、NgModule を返してしまったときは「`loadChildren` を使え」。80〜83 行目、2 節の `isStandalone` が偽なら「The component must be standalone」。どちらも Router の `INVALID_ROUTE_CONFIG`（NG04014）で、core の NG0907 とは別のコードです。`loadChildren` が `Routes` 配列を返した場合も、その中の `component` に同じ `assertStandalone` が掛かります （`requireStandaloneComponents`。[router-route-config](../router/04-router-route-config.md) と [router-lazy-loading](../router/11-router-lazy-loading.md)で引用）。

> [!NOTE]
> **ポイント**
>
> `hostDirectives` に standalone でないディレクティブを書いたときの NG0308（`HOST_DIRECTIVE_NOT_STANDALONE`）は、`ɵɵHostDirectivesFeature` の `validateHostDirective` が投げます。これは[次回](10-standalone-host-directives.md)の主題なので、下の表に載せるだけにします。

## 7. 入口ごとの一覧

| 入口 | 検査する関数 | 投げる行 | エラー | 開発モードだけ？ | 何を見るか |
| --- | --- | --- | --- | --- | --- |
| `bootstrapApplication(Cmp)` | `assertStandaloneComponentType` | render3/errors.ts 29 行目 | NG0907 `TYPE_IS_NOT_STANDALONE` | はい（create\_application.ts 60 行目） | `ɵcmp.standalone` |
| `ApplicationRef.bootstrap(Cmp)` | （検査なし）`isStandalone` はメッセージ用 | application\_ref.ts 482 行目（初期化未完了のときだけ） | NG0405 `ASYNC_INITIALIZERS_STILL_RUNNING` | メッセージの差だけ開発モード | `isStandalone(component)` |
| `createComponent` / `ViewContainerRef.createComponent` / `RouterOutlet`（全部 `ComponentFactory.create`） | `verifyNotAnOrphanComponent` | component\_ref.ts 116 行目 | NG0981 `RUNTIME_DEPS_ORPHAN_COMPONENT` | はい（281 行目）。さらに `ngJitMode` と `forbidOrphanRendering` が必要 | standalone でなく、かつ宣言 NgModule が未登録 |
| `createComponent(Cmp, { directives })` | `createRootTView` | component\_ref.ts 504 行目 | NG0907 `TYPE_IS_NOT_STANDALONE` | はい（503 行目）。`TestBed.createDirective` だけ免除 | `ɵdir.standalone` |
| `loadComponent` / `loadChildren` が返す `Routes` の `component` | `assertStandalone`（router） | utils/config.ts 75・81 行目 | NG04014 `INVALID_ROUTE_CONFIG` | はい（router\_config\_loader.ts 70 行目） | `isNgModule` / `isStandalone` |
| `hostDirectives: [Dir]` | `validateHostDirective` | host\_directives\_feature.ts（[第 10 回](10-standalone-host-directives.md)） | NG0308 `HOST_DIRECTIVE_NOT_STANDALONE` | はい | `ɵdir.standalone` |

## 8. DEMO：検査が読む値

`standalone: false` のコンポーネントを NgModule 無しで置くと AOT ではコンパイルが通らないので、実際に NG0907 を投げるデモは作れません。代わりに、この章のコンポーネント自身について**検査が読む値**を並べます。`isStandalone` は公開 API（2 節 82 行目）、`ɵcmp` は学習用に読むだけです。

> **🧪 DEMO — isStandalone と ɵcmp.debugInfo**
>
> `debugInfo` は 4 節の `ɵsetClassDebugInfo` が置いたものです。開発ビルドなので `className` とソース位置が入り、`forbidOrphanRendering` は `tsconfig` に `forbidOrphanComponents` を付けていないため**フィールドそのものが無い**（r3\_class\_debug\_info\_compiler.ts 73 行目）はずです。本番ビルドでは `ɵsetClassDebugInfo` の呼び出し全体が `ngDevMode` で消えるので `debugInfo` 自体が `undefined` になります。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/standalone-entry-checks)

## ここまでの呼び出し

- 👤 `bootstrapApplication(App, config)` — src/main.ts
  - `internalCreateApplication({ rootComponent, appProviders, platformProviders })` — core/src/application/create\_application.ts L38
    - `assertStandaloneComponentType(rootComponent)` — core/src/render3/errors.ts L25 — *ngDevMode だけ。ɵcmp 無し → NG0906、standalone: false → NG0907*
    - `bootstrap({ r3Injector, platformInjector, rootComponent })` — core/src/platform/bootstrap.ts
      - `ApplicationRef.bootstrap(rootComponent)` — core/src/application/application\_ref.ts L452 — *初期化未完了なら NG0405。文面だけ isStandalone で変わる（L475）*
        - `new ComponentFactory(componentDef, ngModule).create(...)` — core/src/render3/component\_ref.ts L266
          - `verifyNotAnOrphanComponent(cmpDef)` — component\_ref.ts L109 — *ngDevMode && ngJitMode && debugInfo.forbidOrphanRendering && isOrphanComponent → NG0981*
            - `depsTracker.isOrphanComponent(type)` — deps\_tracker/deps\_tracker.ts L296 — *standalone なら false。ownerNgModule に無ければ true*
          - `createRootViewInjector(cmpDef, environmentInjector, injector)` — component\_ref.ts L126 — *ここから先は第 13 回*
          - `createRootTView(rootSelectorOrNode, componentDef, bindings, directives, allowNonStandaloneDirectives)` — component\_ref.ts L442 — *directives の各 ɵdir.standalone を検査 → NG0907（L504）*

## 聞かれそうな質問

**Q. 本番ビルドでも NG0907 は出ますか？**

出ません。`bootstrapApplication` 側は create\_application.ts 60 行目の `ngDevMode`、`directives` オプション側は component\_ref.ts 503 行目の `ngDevMode` が条件で、本番ビルドでは `ngDevMode` が `false` に define されて両方とも消えます。本番で standalone でないコンポーネントを `bootstrapApplication` に渡すと、例外は出ずに `dependencies` が `null`（definition.ts、第 13 回）のまま描かれ、`directiveRegistry` が `null` なのでテンプレートの要素は何にも当たりません（[第 7 回](07-standalone-directive-registry.md)）。子コンポーネントが 1 つも描かれない画面になります。開発モードで必ず直してください。

**Q. orphan 検査が既定で動かない理由は？**

2 つの既定値のせいです。1 つ目、`forbidOrphanComponents`（public\_options.ts 464 行目）は既定で未指定なので、r3\_class\_debug\_info\_compiler.ts 73〜74 行目が `forbidOrphanRendering` を書き出さず、component\_ref.ts 113 行目が `undefined` になる。2 つ目、CLI の AOT ビルドは `ngJitMode` を `false` に define するので、112 行目で止まる。オプションを付けても CLI の AOT ビルドでは 2 つ目で動きません。JIT で動かす環境向けの検査です。

**Q. ApplicationRef.bootstrap に standalone でないコンポーネントを渡したらエラーになりますか？**

なりません。application\_ref.ts 472〜483 行目に standalone を条件にした `throw` は無く、475 行目の `isStandalone` は 477〜480 行目のメッセージを選ぶためだけに使われます。`bootstrapModule` → `ngDoBootstrap` → `appRef.bootstrap(Cmp)` は NgModule 経路の正規の使い方で、そこでは `Cmp` は standalone ではありません。standalone を要求するのは `bootstrapApplication` だけ（1 節 61 行目）です。

**Q. loadComponent に NgModule を返してしまったら？**

utils/config.ts 74〜78 行目で「`loadComponent` にモジュールを渡している。`loadChildren` を使え」という NG04014 になります。standalone でないコンポーネントを返した場合は 80〜83 行目の「The component must be standalone」。どちらも router\_config\_loader.ts 70 行目の `ngDevMode` の中なので、本番では検査されずそのまま `RouterOutlet` が `createComponent` し、上の 1 問目と同じ「子が描かれない」状態になります。

**Q. @Component を付け忘れたクラスを bootstrapApplication に渡すと NG0907 ですか？**

NG0906（`MISSING_GENERATED_DEF`、errors.ts 123 行目）です。render3/errors.ts 26 行目の `assertComponentDef` が 27〜28 行目より先に走り、`ɵcmp` が無い時点で投げます。standalone の検査には到達しません。

## 読み終えて

- `bootstrapApplication` だけが standalone を要求する。`assertStandaloneComponentType`（render3/errors.ts 28〜29 行目）が `ɵcmp.standalone` を見て NG0907。開発モード限定（create\_application.ts 60 行目）
- `ApplicationRef.bootstrap` は検査しない。`isStandalone`（def\_getters.ts 84〜86 行目、公開 API）は NG0405 の文面を選ぶだけ
- `ComponentFactory.create` の `verifyNotAnOrphanComponent`（component\_ref.ts 109〜124 行目）は `ngDevMode` + `ngJitMode` + `forbidOrphanRendering` + 非 standalone の 4 条件で NG0981。既定では動かない
- `forbidOrphanRendering` は tsconfig の `forbidOrphanComponents` → `extractClassDebugInfo` → `compileClassDebugInfo`（真のときだけ出力）→ `ɵsetClassDebugInfo` → `ɵcmp.debugInfo`
- `createComponent` の `directives`（component\_ref.ts 503〜505 行目）と Router の `loadComponent`（utils/config.ts 80〜83 行目）も standalone を要求する。前者は NG0907、後者は NG04014

---

← 前: [@Component の providers と imports の providers は別の注入器へ：ɵɵProvidersFeature と StandaloneService](08-standalone-providers-two-injectors.md)  
次: [hostDirectives が standalone 限定である理由：ɵɵHostDirectivesFeature と resolveHostDirectives](10-standalone-host-directives.md) →
