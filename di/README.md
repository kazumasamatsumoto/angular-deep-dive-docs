[目次](../README.md)

# DI の内側

> inject() の 1 行が、どの注入器を、どの順で探すか

Angular の DI には 2 種類の注入器があります。テンプレートの要素ごとにある NodeInjector と、アプリやルートや standalone コンポーネントごとにある環境インジェクタ（R3Injector）です。inject(Foo) と書いた 1 行は、まずどちらの注入器を使うかを 2 つのグローバル変数で決め、要素の木をブルームフィルタで遡り、見つからなければ環境インジェクタの records を親へ辿ります。コンストラクタ引数がコンパイラによって ɵfac の inject 呼び出しになる手順、provider の 4 つの形が関数になる手順、循環依存の検出、self / skipSelf / host / optional の効き方、ElementRef が provider 無しで取れる理由、破棄と DestroyRef、新しい injectAsync まで、core と compiler の実際の行で 1 ステップずつ追います。

全 16 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/di)

1. [DI の概観：NodeInjector と環境インジェクタ、2 つの木と 1 本の探索順](01-di-overview.md)  
   Injector 抽象クラスの get の形、NodeInjector（要素ごと、LView に埋め込まれた配列）と R3Injector（records の Map）の違い、トークンの 3 種類（クラス / InjectionToken / HostAttributeToken）、inject(Foo) が要素の木 → 環境インジェクタの木 → NullInjector の順に探す全体図。シリーズ全体の地図。
2. [inject() の実装：ɵɵinject と 2 つのスイッチ（\_currentInjector と \_injectImplementation）](02-di-inject-function.md)  
   inject() は convertToBitFlags でオプションをビットにして ɵɵinject を呼ぶだけ。ɵɵinject は getInjectImplementation() があれば NodeInjector 用の ɵɵdirectiveInject、無ければ injectInjectorOnly で primitives の \_currentInjector に retrieve させる。誰がいつ 2 つのスイッチを切り替えるか（R3Injector.get、getNodeInjectable、pipe、runInInjectionContext）を行で追い、RetrievingInjector と NotFound の役割を示す。
3. [注入コンテキスト：いつ inject() が呼べて、いつ NG0203 になるか](03-di-injection-context.md)  
   注入コンテキストとは「\_currentInjector が undefined でない、または \_injectImplementation がある」区間のこと（isInInjectionContext の 1 行）。コンストラクタ・フィールド初期化子・factory・runInInjectionContext の中で立つ理由、setTimeout や await の後で消える理由、null のときの limp mode（injectRootLimpMode）、assertInInjectionContext を使う API（effect、toSignal、takeUntilDestroyed など）。デモで実際に NG0203 を捕まえて表示する。
4. [ɵfac の生成：コンストラクタ引数が ɵɵinject / ɵɵdirectiveInject の呼び出しになるまで](04-di-factory.md)  
   ngtsc の getConstructorDependencies が引数の型と @Inject / @Optional / @Self / @SkipSelf / @Host / @Attribute を読み、compiler の compileFactoryFunction が target（Injectable / Directive / Component / Pipe / NgModule）ごとに ɵɵinject か ɵɵdirectiveInject かを選ぶ。デコレータがビットになる行、型が解決できないとき AOT では NG2003 か ɵɵinvalidFactory()、JIT では ɵɵinvalidFactoryDep（NG0202）になる違い、親クラスの ɵfac を使う ɵɵgetInheritedFactory。実際の出力例を読む。
5. [@Injectable と @Service が ɵprov になるまで：providedIn・useFactory・autoProvided](05-di-injectable-compile.md)  
   ngtsc の InjectableDecoratorHandler と ServiceDecoratorHandler が何を読み（@Service はコンストラクタ注入を禁止する）、compiler の compileInjectable / compileService が ɵɵdefineInjectable({token, factory, providedIn}) をどう組み立てるか。useClass / useFactory / useValue / useExisting をデコレータに書いたときの factory の違い、ɵɵdefineService が providedIn を root にする行、ɵprov が無いクラスを provider に書いたときの getUndecoratedInjectableFactory。
6. [InjectionToken の中身と特殊トークン：factory 付きトークン、HostAttributeToken、HOST\_TAG\_NAME](06-di-injection-token.md)  
   InjectionToken のコンストラクタが options.factory から ɵprov を作る行、\_\_NG\_ELEMENT\_ID\_\_ を持つトークンが NodeInjector で特別扱いされる仕組み、HostAttributeToken が injectAttributeImpl で要素の属性を読む手順、HOST\_TAG\_NAME がタグ名を返す行、primitives/di の InjectionToken との関係。文字列トークンは型で拒否されるだけで実行時は Map のキーとして動くこと、NG0204 になる本当の条件。
7. [provider の 4 つの形が関数になるまで：providerToFactory・providerToRecord・injectArgs](07-di-provider-to-factory.md)  
   useValue / useClass / useExisting / useFactory（と deps）、クラスそのもの。R3Injector.processProvider が providerToRecord で Record { factory, value } に変え、providerToFactory が形ごとに作る関数を 1 行ずつ読む。deps 配列の要素に \[new Optional(), Token\] と書いたときの injectArgs のビット変換、useExisting が別名になる理由、useClass と型だけの provider の違い。
8. [R3Injector.get の全手順：records、NOT\_YET と CIRCULAR、親への委譲、NullInjector](08-di-r3-injector-get.md)  
   get が setCurrentInjector で自分を current にしてから records を引き、無ければ injectableDefInScope で tree-shakable な provider をその場で登録し、それも無ければ parent.get へ委ねる順番。hydrate が value を NOT\_YET → CIRCULAR → 実体に書き換えて循環依存（NG0200）を検出する行、エラーが get を抜けるたびに prependTokenToDependencyPath が ngTokenPath の先頭へトークンを積み、一番外側の get だけが「A -&gt; B -&gt; C」の経路に整形する仕組み、NullInjector が NG0201 を投げる行。
9. [multi: true の仕組み：環境インジェクタの配列と、要素の multiFactory](09-di-multi-providers.md)  
   R3Injector では multi の provider が multiRecord の配列に積まれ、hydrate で injectArgs により全部を作って配列で返す。NodeInjector では di\_setup.ts の multiFactory が providers と viewProviders の分を別々に持ち、コンポーネントのビューから見えるかどうかで返す配列が変わる。multi と非 multi を混ぜたときの挙動（開発ビルドではコード無しの Error、本番では順番次第で TypeError か上書き）と、受け取る側が配列でないと気づいたときの NG0209、HTTP\_INTERCEPTORS・APP\_INITIALIZER など実在の multi トークン。
10. [NodeInjector のブルームフィルタ：256 ビットで「この要素には無い」を即答する](10-di.md)  
   NodeInjector は要素ごとに 8 個の 32 ビット整数を持ち、トークンの ID の下位 8 ビットで 1 ビットを立てる。bloomAdd で登録し、bloomHasToken で探すときに「確実に無い」なら親へ飛ぶ。データ構造の実用例として読み、NodeInjector の探索（次章）の前提を作る。
11. [NodeInjector の探索：getOrCreateInjectable から環境インジェクタへ落ちるまで](11-di-node-injector-lookup.md)  
   ɵɵdirectiveInject → getOrCreateInjectable → lookupTokenUsingNodeInjector が、自分の要素 → 親要素 → コンポーネントの境界を越えて宣言元ビューへと RelativeInjectorLocation を辿る手順。searchTokensOnInjector と locateDirectiveOrProvider が tView.data の範囲を見る行、getNodeInjectable が factory を実体に置き換える行、要素で見つからなかったときの lookupTokenUsingModuleInjector と embedded view の注入器。
12. [self・skipSelf・host・optional：4 つのビットが探索のどこを止めるか](12-di-resolution-flags.md)  
   InternalInjectFlags の 4 ビットと ForPipe。NodeInjector 側（lookupTokenUsingNodeInjector の Self / SkipSelf、shouldSearchParent と @Host の境界、pipe の ForPipe）と R3Injector 側（get の Self / SkipSelf、host が無視される理由）で同じビットが違う場所で効く。デモで同じトークンを親子と環境に置き、4 つのオプションの組み合わせで何が返るかを確かめる。
13. [ElementRef・ChangeDetectorRef・ViewContainerRef・TemplateRef・Injector が provider 無しで取れる理由](13-di-special-tokens.md)  
   これらのクラスは static \_\_NG\_ELEMENT\_ID\_\_ を持ち、bloomHashBitOrFactory が数値ではなく関数を返したとき lookupTokenUsingNodeInjector がその関数を直接呼ぶ。injectElementRef / injectChangeDetectorRef / injectViewContainerRef / injectTemplateRef / createNodeInjector / injectDestroyRef が LView と TNode から何を作るかを 1 つずつ読む。環境インジェクタで ElementRef を取ろうとすると NG0201 になる理由。
14. [DestroyRef と破棄：R3Injector.destroy、サービスの ngOnDestroy、NodeInjectorDestroyRef](14-di-destroy.md)  
   R3Injector.destroy が onDestroy に積んだサービスの ngOnDestroy とコールバックを呼ぶ順番、hasOnDestroy で登録される行、destroy 後に get すると NG0205 になる行。要素側では provider の ngOnDestroy が registerDestroyHooksIfSupported で TView の destroyHooks に積まれ、inject(DestroyRef) は NodeInjectorDestroyRef（LView の破棄に連動）になる。takeUntilDestroyed がそれを使う行。
15. [injectAsync と onIdle：サービスを遅延読み込みする新しい API](15-di-inject-async.md)  
   injectAsync(() =&gt; import(...)) は注入コンテキストで inject(Injector) を捕まえ、呼ばれたときに 1 回だけ loader を実行して injector.get する関数を返す。maybeUnwrapDefaultExport による default export の扱い、prefetch オプションと onIdle が IDLE\_SERVICE の requestOnIdle を Promise にする行。@defer の idle トリガーとの関係と、使い所。
16. [DevTools が注入器の木を描ける理由：injector profiler と injector\_discovery\_utils](16-di-debug.md)  
   ngDevMode のときだけ inject のたびに emitInjectEvent / emitProviderConfiguredEvent / emitInstanceCreatedByInjectorEvent が呼ばれ、setInjectorProfiler に登録した関数へ届く。getInjectorProviders / getInjectorResolutionPath / getDependenciesFromInjectable が NodeInjector と R3Injector からどう情報を集めるか。本番ビルドでこれらが消える理由。デモで ng.getInjector 系の関数が使えるかどうかを確かめる。
