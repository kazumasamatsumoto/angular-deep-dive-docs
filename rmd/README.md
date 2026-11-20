[目次](../README.md)

# Router の型と説明文の読み残し

> models.ts の Route・ガード・Resolve の型、provideRouter の機能、イベント、RouterLink と RouterOutlet、URL の小道具の説明文を、本物の動きと突き合わせる

「Router の内側」と「Router の読み残し」で、ナビゲーションの流れの行はほぼ引き終えました。それでも packages/router/src には、1 行も引いていない行がまだ千行以上あります。大半は models.ts の Route・ガード・Resolve の型と、provideRouter の機能・イベント・ディレクティブに付いた説明文（JSDoc）です。この説明文は angular.dev の API リファレンスにそのまま載るので、説明と実装が食い違えば、読む人はみな同じ思い違いをします。このシリーズでは説明文を 1 段落ずつ読み、そこに書かれた約束を本物の @angular/router を動かして確かめ、最後に spec と issue を読みます。

全 9 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/rmd)

1. [models.ts の小さな型：GuardResult・RedirectCommand・UrlMatcher・Data・LoadChildren](01-rmd-basic-types.md)  
   models.ts の前半の型と説明文：OnSameUrlNavigation、DeprecatedGuard と DeprecatedResolve、GuardResult と RedirectCommand（返しても投げても redirect）、MaybeAsync、UrlMatchResult と UrlMatcher、Data と ResolveData、LoadChildrenCallback、QueryParamsHandling。ガードの戻り値を替えて本物の Router に移らせ、説明に書かれた約束を確かめる。
2. [Route インターフェースの説明文：各プロパティの約束](02-rmd-route.md)  
   models.ts の Route の説明文：Simple Configuration から Lazy Loading までの例を本物の Router に入れた結果、matcher・outlet・4 つのガード・data と resolve・children と loadChildren の説明、runGuardsAndResolvers の 6 通りを数えた表。「空の path だけが継ぐ」「prefix の redirect は無限ループ」など、今の実装より古い言い方。
3. [ガードの型：CanActivate から CanMatch まで](03-rmd-guards.md)  
   models.ts の LoadedRouterConfig と、CanActivate・CanActivateFn・CanActivateChild・CanDeactivate・CanMatch の説明文と例：どの引数が渡り、何を返すとどうなるか。説明文の例を本物の Router で動かす。
4. [Resolve・CanLoad・NavigationBehaviorOptions と型ガード](04-rmd-resolve-nav.md)  
   models.ts の後半（PartialMatchRouteSnapshot、Resolve と ResolveFn、CanLoad、NavigationBehaviorOptions）と utils/type\_guards.ts：resolver の例、onSameUrlNavigation・skipLocationChange・replaceUrl・state・info・browserUrl の約束。
5. [provideRouter の機能の説明文：withXxx の約束](05-rmd-features.md)  
   provide\_router.ts の未読の行：withInMemoryScrolling・withExperimentalPlatformNavigation・withPreloading・withRouterConfig・withHashLocation・withNavigationErrorHandler・withAutoCleanupInjectors・withComponentInputBinding・withViewTransitions・withRouterResources の説明文と型の別名。本物の Router で付けない / 付けるを比べ、withHashLocation の「history API の代わりに」が動きと合わないことを確かめる。
6. [ルーターのイベントの説明文：EventType から stringifyEvent まで](06-rmd-events.md)  
   events.ts の未読の行：EventType と RouterEvent、NavigationStart の navigationTrigger と restoredState、NavigationEnd・Cancel・Error、GuardsCheck と Resolve、RouteConfigLoad、(Child)Activation、Scroll の説明文。本物のナビゲーションで出る順を記録し、「Resolve の段」「popstate のとき以外は null」などの食い違いを示す。
7. [RouterLink・RouterLinkActive・RouterOutlet の説明文](07-rmd-directives.md)  
   directives/router\_link.ts・router\_link\_active.ts・router\_outlet.ts の未読の行：RouterLink の説明と例（差分の URL、相対パス、query、state、custom element）、入力と RouterLinkWithHref、RouterLinkActive と RouterOutlet の説明の残り。説明文の例を本物に入れて href と active を読む。
8. [URL とナビゲーションの小道具の残り](08-rmd-url-rest.md)  
   create\_url\_tree.ts・url\_tree.ts・recognize.ts・router.ts・navigation\_transition.ts・url\_handling\_strategy.ts・page\_title\_strategy.ts・router\_scroller.ts・router\_config.ts・router\_resource.ts・utils の未読の行：コマンドの説明と例、UrlCreationOptions、isActive の既定値、UrlHandlingStrategy と TitleStrategy の説明、内部のコメント。例を本物で全部当てる。
9. [spec と issue を読む：型と説明文を固めているもの](09-rmd-tests-issues.md)  
   packages/router/test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか（固めていないものも）、手元での走らせ方と件数、area: router の issue のうち説明文に当たるものの表、このシリーズで見つけた食い違いの一覧。
