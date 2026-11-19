[目次](../README.md)

# Router の読み残し：UrlTree と RouterState の小道具・provideRouter の残り・Router クラス・読み込みとガードを行で埋める

> UrlTree / ParamMap と木の小道具・ActivatedRoute の Observable と継承・provideRouter と RouterModule の残り・Router クラスと Navigation の型・読み込み・事前読み込み・再利用・関数ガード・spec と issue

「Router の内側」は 1 本のパイプラインを、「Router のディレクティブとイベントの残り」はテンプレートに書く部品とイベントを読みました。それでも packages/router/src には、まだ 1 行も引いていない行がまとまって残っています。UrlTree・UrlSegment・ParamMap とそれを支える木の小道具、ActivatedRoute の Observable と params の継承、provideRouter の withX と RouterModule の残り、Router クラスの公開メソッドと Navigation の型、そしてルートの読み込み・事前読み込み・再利用・関数ガードの小さな関数です。このシリーズではそれを順に埋め、最後に spec と issue を読みます。デモは本物の @angular/router を、ブラウザの URL を変えない子の Router で動かします。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/rtl)

1. [UrlTree・UrlSegment・ParamMap：URL の木の公開 API と、木の小道具](01-rtl-url-tree.md)  
   url\_tree.ts の未読の行（queryParamMap と parameterMap のキャッシュ、UrlSegmentGroup の numberOfChildren と toString、equalSegments・equalPath・mapChildrenIntoArray、UrlSerializer と DefaultUrlSerializer の宣言）、shared.ts の Params・ParamMap・ParamsAsMap・convertToParamMap と defaultUrlMatcher の入口、utils/tree.ts の Tree の残りのメソッドと findNode / findPath。括弧の中の primary の「:」が往復で outlet に化ける不具合（8576f161ae4）と、それを直したコミットも。
2. [ActivatedRoute の Observable と継承：toString・createEmptyState・paramMap と title・getInherited の既定値](02-rtl-router-state.md)  
   router\_state.ts の未読の行：RouterState・RouterStateSnapshot・ActivatedRouteSnapshot・ActivatedRoute の toString と serializeNode、createEmptyState と createEmptyStateSnapshot（根の url の食い違い）、ActivatedRoute の title・paramMap の作り方、ActivatedRouteSnapshot の root・parent・firstChild・children・pathFromRoot と equalParamsAndUrlSegments、paramsInheritanceStrategy の既定値と古いままの getInherited の doc コメント、doc コメントの例。
3. [provideRouter と RouterModule の残り：RouterFeatures の型、初期ナビゲーションの組み合わせ、withX の doc と本番の動き](03-rtl-provide-router.md)  
   provide\_router.ts の未読の行（RouterFeatures の union と種類、初期ナビゲーションの 2 つの feature を両方渡したときの動き、本番で provider を返さない withDebugTracing、ROUTER\_PRELOADER、withExperimentalAutoCleanupInjectors、withNavigationErrorHandler・withComponentInputBinding・withViewTransitions の doc）と router\_module.ts の残り（import と doc コメント）。provideRoutes は v22.0.0 で消えている。
4. [Router クラスと Navigation の型：公開メソッドの残りと Navigation の各項目](04-rtl-router-class.md)  
   router.ts の未読の行（import と @Service、navigated・routeReuseStrategy・currentNavigation のフィールド、url・getCurrentNavigation・lastSuccessfulNavigation、dispose、navigate / navigateByUrl の Promise の約束と validateCommands、isActive の 3 通り）と、navigation\_transition.ts の Navigation・UrlCreationOptions の型と NavigationTransitions の宣言の前半。lastSuccessfulNavigation が書ける signal のまま返ることと、dispose のあとの events.subscribe() も確かめる。
5. [読み込み・事前読み込み・再利用・関数ガード：小さな関数を行で埋める](05-rtl-load-guard.md)  
   router\_config\_loader.ts（ROUTES・export された loadChildren・maybeResolveResources）・router\_preloader.ts（PreloadingStrategy・PreloadAllModules と NoPreloading・RouterPreloader）・route\_reuse\_strategy.ts（DetachedRouteHandle・destroyDetachedRouteHandle・BaseRouteReuseStrategy）・route\_injector\_cleanup.ts・utils/functional\_guards.ts（mapTo\*）・operators/check\_guards.ts・utils/config\_matching.ts の未読の行。親を保存したときの子の部品と注入器の扱いを作業木の spec で確かめる。
6. [spec と issue を読む：Router の読み残しを固めているテスト](06-rtl-tests-issues.md)  
   packages/router/test の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、router の開いている issue のうちこのシリーズの行に当たるものの表。
