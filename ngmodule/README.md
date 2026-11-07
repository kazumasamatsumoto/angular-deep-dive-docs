[目次](../README.md)

# NgModule の内側

> declarations・imports・exports・providers が実際に何をするか

v19 以降コンポーネントは standalone が既定になり、NgModule は「書かなくてよいもの」になりました。それでもライブラリの forRoot、BrowserModule、TestBed、既存アプリの中で NgModule は動き続けています。@NgModule の 7 つのフィールドは、コンパイル時（テンプレートの依存解決＝スコープ）と実行時（R3Injector）の 2 つの仕事に分かれて処理されます。どのフィールドがどちらの仕事で、どの関数が、どの順で読むのかを 1 つずつ追います。

全 18 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/ngmodule)

1. [NgModule の概観：コンパイル時のスコープと実行時のインジェクタ、2 つの仕事](01-ngmodule.md)  
   @NgModule の 7 つのフィールド（declarations / imports / exports / providers / bootstrap / schemas / id）が、クラスに付く 3 つの静的フィールド ɵmod / ɵinj / ɵfac にどう分かれるか。NgModuleDef の形、standalone が既定になった行、シリーズ全体の地図。
2. [@NgModule デコレータが実行された瞬間：makeDecorator と compileNgModuleDefs](02-ngmodule-decorator.md)  
   makeDecorator が typeFn として compileNgModule を呼ぶ。Object.defineProperty で ɵmod / ɵfac / ɵinj を getter として遅延定義する手順、enqueueModuleForDelayedScoping と flushModuleScopingQueueAsMuchAsPossible が forwardRef を待つ仕組み、AOT ではこの経路が消えること。
3. [AOT が @NgModule を何に変換するか：ɵɵdefineNgModule・ɵɵdefineInjector・ɵɵsetNgModuleScope](03-ngmodule-aot-output.md)  
   ngtsc の NgModuleDecoratorHandler.analyze が各フィールドを読む順、compileNgModule（compiler）が出す 3 つの static フィールド、R3SelectorScopeMode（Inline / SideEffect / Omit）の違いと ngJitMode ガード、ランタイム側の ɵɵdefineNgModule と ɵɵsetNgModuleScope が受け取るもの。実際の出力例を行ごとに読む。
4. [コンパイルスコープ：テンプレートの &lt;app-x&gt; がどのコンポーネントか決まる仕組み](04-ngmodule-compilation-scope.md)  
   LocalModuleScopeRegistry.getScopeOfModuleInternal が imports → declarations → exports の順で compilation スコープと exported スコープを作る。コンポーネント側はそのスコープを directiveDefs / pipeDefs として自分の定義に閉じ込める。poisoned、remote scoping（ɵɵsetComponentScope）、.d.ts からは exports しか読まない理由。
5. [exports の意味：再エクスポートと「宣言したが export しない」の違い](05-ngmodule-exports.md)  
   exports に書けるのは 3 種類（NgModule / 自分の compilation スコープにある directive / pipe）。NgModule を export すると相手の exported がそのまま流れる。CommonModule（imports と exports が同じ配列）と BrowserModule（exports: \[CommonModule, ApplicationModule\]）を実物で読む。JIT だけ exported が compilation にも入る行とそのコメント。
6. [JIT のスコープ計算：transitiveScopesFor と patchComponentDefWithScope](06-ngmodule-jit-scope.md)  
   setScopeOnDeclaredComponents が declarations の各コンポーネントに directiveDefs / pipeDefs / schemas を書き込む。transitiveScopesFor → DepsTracker.getNgModuleScope の computeNgModuleScope が imports / declarations / exports を集める手順、ownerNgModule、verifySemanticsOfNgModuleDef が検出する重複宣言と standalone 混入。JIT が実際に動く場所。
7. [ɵinj と providers：NgModule が R3Injector になるまで](07-ngmodule-injector-def.md)  
   ɵɵdefineInjector が返す {providers, imports}、InjectorType と InjectorTypeWithProviders。NgModuleRef のコンストラクタが createInjectorWithoutInjectorInstances → new R3Injector で providers を records に積み、resolveInjectorInitializers で ENVIRONMENT\_INITIALIZER を流し、injector.get(ngModuleType) でモジュールクラス自身を new する順番。scopes に environment が入る行。
8. [imports の providers はどの順で入るか：walkProviderTree と後勝ち](08-ngmodule-walk-provider-tree.md)  
   provider\_collection.ts の walkProviderTree が imports を先に深さ優先で辿り、ModuleWithProviders の providers を後回しにし、自分の providers を最後に visitor へ渡す。dedup の Set、INJECTOR\_DEF\_TYPES と ENVIRONMENT\_INITIALIZER の自動追加、R3Injector.processProvider の records.set が後勝ちになる行。「ライブラリの provider をアプリで上書きできる」理由。
9. [forRoot / forChild と ModuleWithProviders：同じモジュールを 2 回 import しても provider が増えない理由](09-ngmodule-module-with-providers.md)  
   ModuleWithProviders は {ngModule, providers} のただのオブジェクト。RouterModule.forRoot / forChild の実物、ROUTER\_FORROOT\_GUARD が二重 forRoot を検出する仕組み、walkProviderTree の processInjectorTypesWithProviders、コンパイラ側 createModuleWithProvidersResolver が静的に ngModule を取り出す方法、maybeUnwrapModuleWithProviders。HttpClientModule が deprecated で provideHttpClient に置き換わった経緯。
10. [providedIn: 'root' / 'platform' / 'any' / SomeModule はどの注入器で解決されるか](10-ngmodule-provided-in.md)  
   ɵɵdefineInjectable の providedIn が R3Injector.get の injectableDefInScope でどう判定されるか。scopes（platform / root / environment）の Set がいつ作られるか、INJECTOR\_SCOPE トークン、injectorDefTypes の由来（walkProviderTree が足す INJECTOR\_DEF\_TYPES）。providedIn: SomeModule が「そのモジュールを import した注入器」でだけ解決される仕組みと、tree-shakable provider の実体。
11. [platformBrowser().bootstrapModule(AppModule) の全手順](11-ngmodule-bootstrap-module.md)  
   createPlatformFactory → PlatformRef.bootstrapModule → compileNgModuleFactory（ngJitMode の分岐）→ bootstrapModuleFactory（zoneless が既定で先頭に入る行、errorHandlerEnvironmentInitializer）→ createNgModuleRefWithProviders → bootstrap()（ngZone.run、resolveInjectorInitializers、ApplicationInitStatus.runInitializers、LOCALE\_ID）→ \_moduleDoBootstrap が bootstrap 配列か ngDoBootstrap を選ぶ。bootstrapApplication と同じ bootstrap() 関数のどこで分岐するか。
12. [BrowserModule・ApplicationModule・CommonModule の中身](12-ngmodule-browser-module.md)  
   BROWSER\_MODULE\_PROVIDERS の 1 つ 1 つ、BROWSER\_MODULE\_PROVIDERS\_MARKER で二重 import を検出するコンストラクタ、INTERNAL\_BROWSER\_PLATFORM\_PROVIDERS、ApplicationModule が ApplicationRef を eager に作るだけのクラスであること、CommonModule の COMMON\_DIRECTIVES / COMMON\_PIPES。bootstrapApplication が同じ BROWSER\_MODULE\_PROVIDERS 配列を使う行。
13. [standalone コンポーネントが NgModule を import したとき：StandaloneService と環境インジェクタ](13-ngmodule-standalone-imports.md)  
   ɵɵdefineComponent が standalone のときだけ getStandaloneInjector を付ける。StandaloneService.getOrCreateStandaloneInjector が internalImportProvidersFrom でモジュールの providers を集め、createEnvironmentInjector で子の環境インジェクタを作り、ComponentDef ごとにキャッシュする。createRootViewInjector の ChainedInjector、DepsTracker.computeStandaloneComponentScope が import した NgModule の exported を取り込む行。
14. [importProvidersFrom：NgModule の providers を bootstrapApplication と Route に持ち込む](14-ngmodule-import-providers-from.md)  
   importProvidersFrom が返す EnvironmentProviders（ɵproviders）、internalImportProvidersFrom の checkForStandaloneCmp、makeEnvironmentProviders と isEnvironmentProviders、EnvironmentProviders をコンポーネントの providers に入れたときのエラーの行。Route.providers → createEnvironmentInjector。standalone-bootstrap 移行が RouterModule.forRoot を provideRouter に書き換える箇所。
15. [createNgModule と loadChildren の NgModule：遅延モジュールの注入器はどこにぶら下がるか](15-ngmodule-lazy-module.md)  
   createNgModule / NgModuleFactory.create / createEnvironmentInjector / EnvironmentNgModuleRefAdapter の 4 つの入口が全部 R3Injector を作る。RouterConfigLoader が NgModuleFactory を受け取ったとき factory.create(parentInjector) し、injector.get(ROUTES, {self: true}) で forChild の routes を取り出す行。Compiler.compileModuleSync は new NgModuleFactory を返すだけ。destroy の連鎖、ViewContainerRef.createComponent の ngModuleRef / environmentInjector。
16. [schemas：CUSTOM\_ELEMENTS\_SCHEMA と NO\_ERRORS\_SCHEMA が止める検査](16-ngmodule-schemas.md)  
   SchemaMetadata はただの {name}。コンパイル時は RegistryDomSchemaChecker.checkElement / checkTemplateElementProperty、実行時（JIT）は validateElementIsKnown / isPropertyValid の matchingSchemas。tView.schemas === null が「AOT で検査済み」の印になる行、エラーメッセージが @NgModule.schemas と @Component.schemas を出し分ける行、strict mode のフラグ。
17. [TestBed.configureTestingModule は NgModule を作っている：DynamicTestModule と RootScopeModule](17-ngmodule-testbed.md)  
   TestBedCompiler が class DynamicTestModule を用意し、configureTestingModule の declarations / imports / providers を積み、finalize で compileNgModuleDefs → applyTransitiveScopes（transitiveScopesFor + patchComponentDefWithScope）→ applyProviderOverrides → new NgModuleRef → runInitializers と進む。overrideProvider が効く位置。本番 AOT のアプリでも、テストでは JIT のスコープ計算が動いている。
18. [standalone が既定になった後の NgModule：何が残り、何を移行するか](18-ngmodule-to-standalone.md)  
   standalone ?? true の行（ɵɵdefineDirective / ɵɵdefinePipe / JIT / ngtsc）。standalone を declarations や bootstrap に入れたときのエラー（NGMODULE\_DECLARATION\_IS\_STANDALONE / NGMODULE\_BOOTSTRAP\_IS\_STANDALONE）。ng generate @angular/core:standalone の 3 モード（to-standalone / prune-modules / standalone-bootstrap）が何を書き換えるか。残る NgModule：ライブラリの forRoot、BrowserModule（内部）、TestBed、CommonModule。
