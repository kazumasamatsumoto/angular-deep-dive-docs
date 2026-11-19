[目次](../README.md) › [Router の読み残し：UrlTree と RouterState の小道具・provideRouter の残り・Router クラス・読み込みとガードを行で埋める](README.md) › 第 3 回 / 全 6 回

# provideRouter と RouterModule の残り：RouterFeatures の型、初期ナビゲーションの組み合わせ、withX の doc と本番の動き

> provide\_router.ts の未読の行（RouterFeatures の union と種類、初期ナビゲーションの 2 つの feature を両方渡したときの動き、本番で provider を返さない withDebugTracing、ROUTER\_PRELOADER、withExperimentalAutoCleanupInjectors、withNavigationErrorHandler・withComponentInputBinding・withViewTransitions の doc）と router\_module.ts の残り（import と doc コメント）。provideRoutes は v22.0.0 で消えている。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-provide-router)

---

`provideRouter` の本体と、各 `withX` が provide するものは[provideRouter の中身](../router/05-router-provide-router.md)で、`ExtraOptions` と forRoot の対応は[ExtraOptions と RouterModule](../rdir/05-rdir-options.md)で読みました。この章は、その 2 つが引いていない行、つまり **型の別名・doc コメント・小さなトークン**を埋めます。そこから分かるのは 3 つです。`RouterFeatures` の型は同じ種類の feature を 2 つ並べることを止めないこと、doc コメントの約束と本番ビルドの動きがずれる所（`withDebugTracing`）、そして forRoot の側に対応の無い feature があることです。

読む対象は `packages/router/src/provide_router.ts` と `router_module.ts` の残りの行、`packages/router/test/bootstrap.spec.ts` と `integration/navigation_errors.spec.ts` です（../angular、8576f161ae4）。要約に挙げていた `provideRoutes` は、もうありません。bdb6ae9dbc0（2026-02-24、`refactor(router): remove deprecated provideRoutes function`、v15 から非推奨、BREAKING CHANGE）で消え、v22.0.0 から入っていません。`ROUTES` を直接 multi で provide するか、`provideRouter` を使います。

1. [1. UrlTree・UrlSegment・ParamMap](01-rtl-url-tree.md)
2. [2. ActivatedRoute の Observable と継承](02-rtl-router-state.md)
3. **3. provideRouter と RouterModule の残り**（この章）
4. [4. Router クラスと Navigation の型](04-rtl-router-class.md)
5. [5. 読み込み・事前読み込み・再利用・関数ガード](05-rtl-load-guard.md)
6. [6. spec と issue](06-rtl-tests-issues.md)

## 1. RouterFeatures：12 の型の union と 13 の種類

📄 `angular/packages/router/src/provide_router.ts` L147–156 （▶ の行: 148, 155）

```ts
147 │ /**
148 ▶  * A type alias for providers returned by `withInMemoryScrolling` for use with `provideRouter`.
149 │  *
150 │  * @see {@link withInMemoryScrolling}
151 │  * @see {@link provideRouter}
152 │  *
153 │  * @publicApi
154 │  */
155 ▶ export type InMemoryScrollingFeature = RouterFeature<RouterFeatureKind.InMemoryScrollingFeature>;
156 │ 
```

155 行目が型の別名の形です。`RouterFeature<K>`（`ɵkind: K` と `ɵproviders` を持つオブジェクト。[provideRouter の中身](../router/05-router-provide-router.md)の 1 節）の `K` に、種類の定数を 1 つ入れます。withX ごとに 1 つずつ、この形の型があります。

📄 `angular/packages/router/src/provide_router.ts` L948–975 （▶ の行: 959–960, 962, 968, 970–971, 973–974）

```ts
948 │ 
949 │ /**
950 │  * A type alias that represents all Router features available for use with `provideRouter`.
951 │  * Features can be enabled by adding special functions to the `provideRouter` call.
952 │  * See documentation for each symbol to find corresponding function name. See also `provideRouter`
953 │  * documentation on how to use those functions.
954 │  *
955 │  * @see {@link provideRouter}
956 │  *
957 │  * @publicApi
958 │  */
959 ▶ export type RouterFeatures =
960 ▶   | PreloadingFeature
961 │   | DebugTracingFeature
962 ▶   | InitialNavigationFeature
963 │   | InMemoryScrollingFeature
964 │   | RouterConfigurationFeature
965 │   | NavigationErrorHandlerFeature
966 │   | ComponentInputBindingFeature
967 │   | ViewTransitionsFeature
968 ▶   | AutoCleanupInjectorsFeature
969 │   | RouterHashLocationFeature
970 ▶   | ExperimentalPlatformNavigationFeature
971 ▶   | RouterResourcesFeature;
972 │ 
973 ▶ /**
974 ▶  * The list of features as an enum to uniquely type each feature.
975 │  */
```

📄 `angular/packages/router/src/provide_router.ts` L344–368 （▶ の行: 353–354, 366–367）

```ts
344 │ /**
345 │  * A type alias for providers returned by `withEnabledBlockingInitialNavigation` for use with
346 │  * `provideRouter`.
347 │  *
348 │  * @see {@link withEnabledBlockingInitialNavigation}
349 │  * @see {@link provideRouter}
350 │  *
351 │  * @publicApi
352 │  */
353 ▶ export type EnabledBlockingInitialNavigationFeature =
354 ▶   RouterFeature<RouterFeatureKind.EnabledBlockingInitialNavigationFeature>;
355 │ 
356 │ /**
357 │  * A type alias for providers returned by `withEnabledBlockingInitialNavigation` or
358 │  * `withDisabledInitialNavigation` functions for use with `provideRouter`.
359 │  *
360 │  * @see {@link withEnabledBlockingInitialNavigation}
361 │  * @see {@link withDisabledInitialNavigation}
362 │  * @see {@link provideRouter}
363 │  *
364 │  * @publicApi
365 │  */
366 ▶ export type InitialNavigationFeature =
367 ▶   EnabledBlockingInitialNavigationFeature | DisabledInitialNavigationFeature;
368 │ 
```

959〜971 行目の `RouterFeatures` は 12 の型の union（どれか 1 つ）です。`provideRouter(routes, ...features: RouterFeatures[])` の `features` の 1 個 1 個がこの型なので、TypeScript が止めるのは「feature でない物」だけです。962 行目の `InitialNavigationFeature` は、366〜367 行目で blocking と disabled の 2 つの union です。種類の定数（973〜975 行目の doc のすぐ下の const enum `RouterFeatureKind`。デモの 1 つ目の表の `ɵkind` の数）は 13 個で、union の 12 個とは 1 つずれます。

`ɵkind` は型を分けるためだけにあり、packages/router/src の中で読むコードはありません（[provideRouter の中身](../router/05-router-provide-router.md)の 1 節）。`provideHttpClient` は開発モードで `ɵkind` を集めて「`withXsrfConfiguration()` と `withNoXsrfProtection()` の両方」を例外にします（[provideHttpClient](../http/02-http-provide.md)）が、Router には同じ検査がありません。だから `withEnabledBlockingInitialNavigation()` と `withDisabledInitialNavigation()` を両方渡しても、型も実行も止まりません。何が起きるかは 3 節で見ます。

📄 `angular/packages/router/src/provide_router.ts` L84–106 （▶ の行: 84–85, 92–93, 100）

````ts
 84 ▶  * You can also enable optional features in the Router by adding functions from the `RouterFeatures`
 85 ▶  * type:
 86 │  * ```ts
 87 │  * const appRoutes: Routes = [];
 88 │  * bootstrapApplication(AppComponent,
 89 │  *   {
 90 │  *     providers: [
 91 │  *       provideRouter(appRoutes,
 92 ▶  *         withDebugTracing(),
 93 ▶  *         withRouterConfig({paramsInheritanceStrategy: 'always'}))
 94 │  *     ]
 95 │  *   }
 96 │  * );
 97 │  * ```
 98 │  * @see [Router](guide/routing)
 99 │  *
100 ▶  * @see {@link RouterFeatures}
101 │  *
102 │  * @publicApi
103 │  * @param routes A set of `Route`s to use for the application routing table.
104 │  * @param features Optional features to configure additional router behaviors.
105 │  * @returns A set of providers to setup a Router.
106 │  */
````

`provideRouter` の doc コメントの 2 つ目の例（92〜93 行目）は、`withDebugTracing()` と `withRouterConfig({paramsInheritanceStrategy: 'always'})` を並べています。`'always'` は今の既定値と同じなので（[前回](02-rtl-router-state.md)の 5 節）、2 つ目は何も変えません。1 つ目は本番では何も足しません（4 節）。

## 2. 初期ナビゲーションの 2 つの feature の doc と provider

📄 `angular/packages/router/src/provide_router.ts` L369–401 （▶ の行: 370, 372–374, 397–399）

````ts
369 │ /**
370 ▶  * Configures initial navigation to start before the root component is created.
371 │  *
372 ▶  * The bootstrap is blocked until the initial navigation is complete. This should be set in case
373 ▶  * you use [server-side rendering](guide/ssr), but do not enable [hydration](guide/hydration) for
374 ▶  * your application.
375 │  *
376 │  * @usageNotes
377 │  *
378 │  * Basic example of how you can enable this navigation behavior:
379 │  * ```ts
380 │  * const appRoutes: Routes = [];
381 │  * bootstrapApplication(AppComponent,
382 │  *   {
383 │  *     providers: [
384 │  *       provideRouter(appRoutes, withEnabledBlockingInitialNavigation())
385 │  *     ]
386 │  *   }
387 │  * );
388 │  * ```
389 │  *
390 │  * @see {@link provideRouter}
391 │  *
392 │  * @publicApi
393 │  * @returns A set of providers for use with `provideRouter`.
394 │  */
395 │ export function withEnabledBlockingInitialNavigation(): EnabledBlockingInitialNavigationFeature {
396 │   const providers = [
397 ▶     {provide: IS_ENABLED_BLOCKING_INITIAL_NAVIGATION, useValue: true},
398 ▶     {provide: INITIAL_NAVIGATION, useValue: InitialNavigation.EnabledBlocking},
399 ▶     provideAppInitializer(() => {
400 │       const injector = inject(Injector);
401 │       const locationInitialized: Promise<any> = injector.get(
````

370〜374 行目は「ルートのコンポーネントを作る前に最初のナビゲーションを始め、終わるまで bootstrap を止める。SSR を使い、hydration を使わないときに設定する」と書いています。provider は 3 つで、397 行目の `ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION`（core の hydration が矛盾を警告するために読む印）、398 行目の `INITIAL_NAVIGATION`、399 行目からの `APP_INITIALIZER` です。APP\_INITIALIZER の中身（`afterPreactivation` で止める手順）は[初期ナビゲーション](../router/06-router-initial-navigation.md)にあります。

📄 `angular/packages/router/src/provide_router.ts` L440–475 （▶ の行: 444, 446–447, 471–472, 474）

````ts
440 │ export type DisabledInitialNavigationFeature =
441 │   RouterFeature<RouterFeatureKind.DisabledInitialNavigationFeature>;
442 │ 
443 │ /**
444 ▶  * Disables initial navigation.
445 │  *
446 ▶  * Use if there is a reason to have more control over when the router starts its initial navigation
447 ▶  * due to some complex initialization logic.
448 │  *
449 │  * @usageNotes
450 │  *
451 │  * Basic example of how you can disable initial navigation:
452 │  * ```ts
453 │  * const appRoutes: Routes = [];
454 │  * bootstrapApplication(AppComponent,
455 │  *   {
456 │  *     providers: [
457 │  *       provideRouter(appRoutes, withDisabledInitialNavigation())
458 │  *     ]
459 │  *   }
460 │  * );
461 │  * ```
462 │  *
463 │  * @see {@link provideRouter}
464 │  *
465 │  * @returns A set of providers for use with `provideRouter`.
466 │  *
467 │  * @publicApi
468 │  */
469 │ export function withDisabledInitialNavigation(): DisabledInitialNavigationFeature {
470 │   const providers = [
471 ▶     provideAppInitializer(() => {
472 ▶       inject(Router).setUpLocationChangeListener();
473 │     }),
474 ▶     {provide: INITIAL_NAVIGATION, useValue: InitialNavigation.Disabled},
475 │   ];
````

446〜447 行目は「初期ナビゲーションをいつ始めるかを自分で決めたいとき」に使うと書いています。provider は 2 つで、471〜472 行目の `APP_INITIALIZER` は `setUpLocationChangeListener()`（ブラウザの戻る・進むを聞き始める）だけを呼び、474 行目で `INITIAL_NAVIGATION` を `Disabled` にします。

📄 `angular/packages/router/src/provide_router.ts` L285–291 （▶ の行: 286–287, 290–291）

```ts
285 │ 
286 ▶     if (injector.get(INITIAL_NAVIGATION) === InitialNavigation.EnabledNonBlocking) {
287 ▶       router.initialNavigation();
288 │     }
289 │ 
290 ▶     injector.get(ROUTER_PRELOADER, null, {optional: true})?.setUpPreloading();
291 ▶     injector.get(ROUTER_SCROLLER, null, {optional: true})?.init();
```

`INITIAL_NAVIGATION` を読むのは、bootstrap のときに走る `getBootstrapListener` の 286 行目だけです。`EnabledNonBlocking`（どちらの feature も無いときの既定）のときだけ 287 行目で `initialNavigation()` を呼びます。

## 3. 2 つを両方渡すと、初期ナビゲーションは走る

1. **`INITIAL_NAVIGATION` は後ろの 1 つが勝つ**

   398 行目と 474 行目はどちらも `useValue` で、multi ではありません。`provideRouter` は features を並んだ順に provider にするので、後に書いた方の値が残ります。
2. **`APP_INITIALIZER` は両方とも走る**

   399 行目と 471 行目は `provideAppInitializer` で、こちらは multi です。blocking の方の初期化関数は、`INITIAL_NAVIGATION` がどちらの値でも `router.initialNavigation()` を呼びます。
3. **結果**

   どちらの順で書いても、`createApplication` の間に最初の `NavigationStart` が 1 回出て、bootstrap のあと `router.navigated` は `true` になります。`withDisabledInitialNavigation()` だけのときは、どちらも `0` と `false` です。開発モードでも本番でも同じで、警告も例外も出ません（下の記録と、5 節のデモのボタン）。

disabled を後ろに書いた場合、`INITIAL_NAVIGATION` は `Disabled` なので 287 行目は呼ばれませんが、blocking の初期化関数がすでに始めています。blocking を後ろに書いた場合は `EnabledBlocking` で、やはり 287 行目は呼ばれません。どちらの順でも 1 回だけ走るのは、そのためです。

## 4. withDebugTracing は本番で provider を 1 つも返さない

📄 `angular/packages/router/src/provide_router.ts` L487–519 （▶ の行: 490–491, 501, 513–516）

````ts
487 │ export type DebugTracingFeature = RouterFeature<RouterFeatureKind.DebugTracingFeature>;
488 │ 
489 │ /**
490 ▶  * Enables logging of all internal navigation events to the console.
491 ▶  * Extra logging might be useful for debugging purposes to inspect Router event sequence.
492 │  *
493 │  * @usageNotes
494 │  *
495 │  * Basic example of how you can enable debug tracing:
496 │  * ```ts
497 │  * const appRoutes: Routes = [];
498 │  * bootstrapApplication(AppComponent,
499 │  *   {
500 │  *     providers: [
501 ▶  *       provideRouter(appRoutes, withDebugTracing())
502 │  *     ]
503 │  *   }
504 │  * );
505 │  * ```
506 │  *
507 │  * @see {@link provideRouter}
508 │  *
509 │  * @returns A set of providers for use with `provideRouter`.
510 │  *
511 │  * @publicApi
512 │  */
513 ▶ export function withDebugTracing(): DebugTracingFeature {
514 ▶   let providers: Provider[] = [];
515 ▶   if (typeof ngDevMode === 'undefined' || ngDevMode) {
516 ▶     providers = [
517 │       {
518 │         provide: ENVIRONMENT_INITIALIZER,
519 │         multi: true,
````

📄 `angular/packages/router/src/provide_router.ts` L532–538 （▶ の行: 534–535, 537）

```ts
532 │       },
533 │     ];
534 ▶   } else {
535 ▶     providers = [];
536 │   }
537 ▶   return routerFeature(RouterFeatureKind.DebugTracingFeature, providers);
538 │ }
```

490〜491 行目の doc は「Router の全部のイベントをコンソールに出す。イベントの順を調べるのに役立つ」とだけ書きます。実際は 515 行目で `ngDevMode`（開発モードのときだけ真になる、ビルドで消える定数）を見ていて、本番では 534〜535 行目の `else` で空の配列になります。つまり本番のビルドで `withDebugTracing()` を書いても何も出ません。デモの「withX を全部呼んで並べる」で、このページ（本番ビルド）では `withDebugTracing()` の provider が `0` 個と表示されます。Node の開発モードでは 1 個（`ENVIRONMENT_INITIALIZER`）です。

この `if` は `provideRouter` を入れた 75df4044675（2022-08-01、#47010）からあり、forRoot の `enableTracing` も `ngDevMode` の中で `withDebugTracing().ɵproviders` を足します（[forRoot と ModuleWithProviders](../ngmodule/09-ngmodule-module-with-providers.md)）。`ExtraOptions` の `enableTracing` の doc（router\_config.ts）も「内部のナビゲーションのイベントを全部コンソールに出す。デバッグ用」とだけ書き、本番のことには触れていません（項目の一覧は[ExtraOptions と RouterModule](../rdir/05-rdir-options.md)）。`withDebugTracing` も `enableTracing` も、packages/router/test に使う spec がありません（grep で 0 件）。

## 5. 小さなトークンと、名前だけの feature

📄 `angular/packages/router/src/provide_router.ts` L539–553 （▶ の行: 540–542, 553）

```ts
539 │ 
540 ▶ const ROUTER_PRELOADER = new InjectionToken<RouterPreloader>(
541 ▶   typeof ngDevMode === 'undefined' || ngDevMode ? 'router preloader' : '',
542 ▶ );
543 │ 
544 │ /**
545 │  * A type alias that represents a feature which enables preloading in Router.
546 │  * The type is used to describe the return value of the `withPreloading` function.
547 │  *
548 │  * @see {@link withPreloading}
549 │  * @see {@link provideRouter}
550 │  *
551 │  * @publicApi
552 │  */
553 ▶ export type PreloadingFeature = RouterFeature<RouterFeatureKind.PreloadingFeature>;
```

540〜542 行目の `ROUTER_PRELOADER` は factory を持たないトークンです。`withPreloading` を書かなければ誰も provide しないので、2 節の 290 行目は `{optional: true}` で読み、無ければ `setUpPreloading()` を呼びません。`withPreloading` はこのトークンを `useExisting: RouterPreloader` にし、`PreloadingStrategy` を渡されたクラスにします。`RouterPreloader` の中身は[第 5 回](05-rtl-load-guard.md)です。291 行目の `ROUTER_SCROLLER` も同じ形で、`withInMemoryScrolling` を書いたときだけあります。

📄 `angular/packages/router/src/provide_router.ts` L765–776 （▶ の行: 769, 773–774）

```ts
765 │ 
766 │ /**
767 │  * Enables automatic destruction of unused route injectors.
768 │  *
769 ▶  * @deprecated Use `withAutoCleanupInjectors` instead.
770 │  * @see {@link withAutoCleanupInjectors}
771 │  * @publicApi
772 │  */
773 ▶ export function withExperimentalAutoCleanupInjectors(): AutoCleanupInjectorsFeature {
774 ▶   return withAutoCleanupInjectors();
775 │ }
776 │ 
```

769 行目で非推奨、774 行目で `withAutoCleanupInjectors()` を呼ぶだけです。7137a412230（2026-08-27、`feat(router): stabilize auto cleanup injectors feature`）で `withAutoCleanupInjectors` が安定版の名前になり、前の名前がこの形で残りました。返る `ɵkind` も provider も同じです（7 節の Node の記録で、どちらも `ɵkind 10`・`ROUTE_INJECTOR_CLEANUP（useValue）`）。

📄 `angular/packages/router/src/provide_router.ts` L686–697 （▶ の行: 689–690, 692–696）

```ts
686 │ /**
687 │  * Provides a function which is called when a navigation error occurs.
688 │  *
689 ▶  * This function is run inside application's [injection context](guide/di/dependency-injection-context)
690 ▶  * so you can use the [`inject`](api/core/inject) function.
691 │  *
692 ▶  * This function can return a `RedirectCommand` to convert the error to a redirect, similar to returning
693 ▶  * a `UrlTree` or `RedirectCommand` from a guard. This will also prevent the `Router` from emitting
694 ▶  * `NavigationError`; it will instead emit `NavigationCancel` with code NavigationCancellationCode.Redirect.
695 ▶  * Return values other than `RedirectCommand` are ignored and do not change any behavior with respect to
696 ▶  * how the `Router` handles the error.
697 │  *
```

689〜690 行目、ハンドラはアプリの注入コンテキストで走るので `inject` を使えます。692〜696 行目、`RedirectCommand` を返すとエラーがリダイレクトに変わり、`NavigationError` の代わりに `NavigationCancel`（code は `Redirect`）が出ます。それ以外の戻り値は無視されます。デモで `withNavigationErrorHandler` を付けて `/boom`（resolver が例外を投げる）へ移ると、`NavigationStart → NavigationCancel → NavigationStart → NavigationEnd`、Promise は `true`、`router.url` は `/recovered` です。付けないと `NavigationStart → NavigationError` で、Promise は reject します。

📄 `angular/packages/router/src/provide_router.ts` L817–849 （▶ の行: 817, 819–822, 824–825, 828–829, 846–848）

````ts
817 ▶  * The router bindings information from any of the following sources:
818 │  *
819 ▶  *  - query parameters
820 ▶  *  - path and matrix parameters
821 ▶  *  - static route data
822 ▶  *  - data from resolvers
823 │  *
824 ▶  * Duplicate keys are resolved in the same order from above, from least to greatest,
825 ▶  * meaning that resolvers have the highest precedence and override any of the other information
826 │  * from the route.
827 │  *
828 ▶  * Importantly, when an input does not have an item in the route data with a matching key, this
829 ▶  * input is set to `undefined`. This prevents previous information from being
830 │  * retained if the data got removed from the route (i.e. if a query parameter is removed).
831 │  * Default values can be provided with a resolver on the route to ensure the value is always present
832 │  * or an input and use an input transform in the component.
833 │  *
834 │  * Advanced example of how you can disable binding from certain sources:
835 │  * ```ts
836 │  * const appRoutes: Routes = [];
837 │  * bootstrapApplication(AppComponent,
838 │  *   {
839 │  *     providers: [
840 │  *       provideRouter(appRoutes, withComponentInputBinding({queryParams: false}))
841 │  *     ]
842 │  *   }
843 │  * );
844 │  * ```
845 │  *
846 ▶  * @see {@link /guide/components/inputs#input-transforms Input Transforms}
847 ▶  * @see {@link ComponentInputBindingOptions}
848 ▶  * @returns A set of providers for use with `provideRouter`.
849 │  */
````

817〜826 行目は入力に入れる値の出所と優先順（クエリ → パスとマトリクス → 静的な data → resolver、後ろが勝つ）、828〜830 行目は「対応するキーが無い入力には `undefined` を入れる」です。中身は[RouterOutlet の入力](../rdir/03-rdir-outlet.md)にあります。846〜848 行目でこの doc コメントは終わり、**`@publicApi` がありません**。provide\_router.ts の `withX` 14 個のうち、`@publicApi`・`@developerPreview`・`@experimental` のどれも付いていないのはこれだけです。この関数を入れた f982a3f9659（2023-03-24、#49633）から無く、origin/main（943ec3bd8d6）でも同じです。公開 API の一覧（goldens/public-api/router/index.api.md）には載っています。

📄 `angular/packages/router/src/provide_router.ts` L884–891 （▶ の行: 887–888, 890）

````ts
884 │  * ```
885 │  *
886 │  * @returns A set of providers for use with `provideRouter`.
887 ▶  * @see [View Transitions on MDN](https://developer.chrome.com/docs/web-platform/view-transitions/)
888 ▶  * @see [View Transitions API on MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API)
889 │  * @see [Route transition animations](guide/routing/route-transition-animations)
890 ▶  * @developerPreview 19.0
891 │  */
````

887 行目のリンクの文字は「View Transitions on MDN」ですが、URL は developer.chrome.com です。888 行目が MDN です。890 行目の `@developerPreview 19.0` は、origin/main では 64502f9ae23（2026-10-20、`feat(router): Mark view transitions as stable`）で `@publicApi 22.3` になりました。887 行目はそのままです。

## 6. router\_module.ts の残り：forRoot は withX の ɵproviders を借りる

📄 `angular/packages/router/src/router_module.ts` L34–51 （▶ の行: 35–42）

```ts
34 │ import {
35 ▶   getBootstrapListener,
36 ▶   rootRoute,
37 ▶   withComponentInputBinding,
38 ▶   withDebugTracing,
39 ▶   withDisabledInitialNavigation,
40 ▶   withEnabledBlockingInitialNavigation,
41 ▶   withPreloading,
42 ▶   withViewTransitions,
43 │ } from './provide_router';
44 │ import {Router} from './router';
45 │ import {ExtraOptions, ROUTER_CONFIGURATION} from './router_config';
46 │ import {RouterConfigLoader, ROUTES} from './router_config_loader';
47 │ import {ChildrenOutletContexts} from './router_outlet_context';
48 │ import {ROUTER_SCROLLER, RouterScroller} from './router_scroller';
49 │ import {ActivatedRoute} from './router_state';
50 │ import {DefaultUrlSerializer, UrlSerializer} from './url_tree';
51 │ 
```

35〜42 行目、router\_module.ts は provide\_router.ts から `getBootstrapListener`・`rootRoute` と 6 つの `withX` を import します。forRoot は `withDebugTracing().ɵproviders` のように `ɵproviders` を取り出して並べます（forRoot の本体は[forRoot と ModuleWithProviders](../ngmodule/09-ngmodule-module-with-providers.md)）。import していない `withAutoCleanupInjectors`・`withRouterResources`・`withExperimentalPlatformNavigation` は、`ExtraOptions` にも対応する項目が無く（router\_config.ts を grep して 0 件）、forRoot からは使えません。`importProvidersFrom(RouterModule.forRoot(...))` のアプリでこの 3 つが要るときは、forRoot と並べて `withX(...).ɵproviders` を provide することになり、`ɵ` の付いた名前に頼ることになります。

📄 `angular/packages/router/src/router_module.ts` L76–97 （▶ の行: 84–85, 88–91）

```ts
76 │ 
77 │ /**
78 │  * @description
79 │  *
80 │  * Adds directives and providers for in-app navigation among views defined in an application.
81 │  * Use the Angular `Router` service to declaratively specify application states and manage state
82 │  * transitions.
83 │  *
84 ▶  * You can import this NgModule multiple times, once for each lazy-loaded bundle.
85 ▶  * However, only one `Router` service can be active.
86 │  * To ensure this, there are two ways to register routes when importing this module:
87 │  *
88 ▶  * * The `forRoot()` method creates an `NgModule` that contains all the directives, the given
89 ▶  * routes, and the `Router` service itself.
90 ▶  * * The `forChild()` method creates an `NgModule` that contains all the directives and the given
91 ▶  * routes, but does not include the `Router` service.
92 │  *
93 │  * @see [Routing and Navigation guide](guide/routing/common-router-tasks) for an
94 │  * overview of how the `Router` service should be used.
95 │  *
96 │  * @publicApi
97 │  */
```

📄 `angular/packages/router/src/router_module.ts` L108–126 （▶ の行: 117, 122）

````ts
108 │ 
109 │   /**
110 │    * Creates and configures a module with all the router providers and directives.
111 │    * Optionally sets up an application listener to perform an initial navigation.
112 │    *
113 │    * When registering the NgModule at the root, import as follows:
114 │    *
115 │    * ```ts
116 │    * @NgModule({
117 ▶    *   imports: [RouterModule.forRoot(ROUTES)]
118 │    * })
119 │    * class MyNgModule {}
120 │    * ```
121 │    *
122 ▶    * @param routes An array of `Route` objects that define the navigation paths for the application.
123 │    * @param config An `ExtraOptions` configuration object that controls how navigation is performed.
124 │    * @return The new `NgModule`.
125 │    *
126 │    */
````

📄 `angular/packages/router/src/router_module.ts` L165–177 （▶ の行: 173）

````ts
165 │ 
166 │   /**
167 │    * Creates a module with all the router directives and a provider registering routes,
168 │    * without creating a new Router service.
169 │    * When registering for submodules and lazy-loaded submodules, create the NgModule as follows:
170 │    *
171 │    * ```ts
172 │    * @NgModule({
173 ▶    *   imports: [RouterModule.forChild(ROUTES)]
174 │    * })
175 │    * class MyNgModule {}
176 │    * ```
177 │    *
````

84〜85 行目は「この NgModule は遅延読み込みの束ごとに何回 import してもよい。ただし動く `Router` は 1 つだけ」と書き、88〜91 行目でそのための 2 つの入口を分けます。`forRoot()` は directive・ルート・`Router` を含み、`forChild()` は directive とルートだけで `Router` を含みません。2 つ目の forRoot をどう見つけるか（開発モードだけの `ROUTER_FORROOT_GUARD`）は[ExtraOptions と RouterModule](../rdir/05-rdir-options.md)の 5 節です。

117 行目と 173 行目の例は `RouterModule.forRoot(ROUTES)`・`forChild(ROUTES)` です。`ROUTES` は Router が持つ `InjectionToken<Route[][]>` の名前と同じで、122 行目の `@param routes An array of Route objects` と合いません。origin/main では bb41a49ecc4（2026-11-05、`docs(router): use a routes array in the RouterModule examples`）で `routes` に直っています。

## 7. 動かして確かめる

> **🧪 DEMO — withX の中身を並べ、選んだ withX でアプリを作って起動する**
>
> 1 つ目のボタンは、9 の `withX`（`withRouterConfig` だけ引数を変えて 2 回）をその場で呼び、返ってきた `ɵkind` と `ɵproviders` を並べます（どのアプリにも入れません）。名前の無いトークン（本番では説明の文字列が `''`）は、ソースの行で読んだ名前で書きます。残りの 5 つ（`withAutoCleanupInjectors`・`withExperimentalAutoCleanupInjectors`・`withRouterResources`・`withViewTransitions`・`withExperimentalPlatformNavigation`）は、このページのデモで import すると本番ビルドの Initial total が 499.86 kB から 511.94 kB に増えたので、下の Node の記録にだけ載せています。2 つ目からは、選んだ `withX` で `provideRouter` した別のアプリを `createApplication` で作り、文書に付けない div に bootstrap して、40 ms 後に `/boom` へ移り、読み終えたら `destroy` します。`PlatformLocation` と `ViewportScroller` は記録するだけの偽物なので、このページの URL・履歴・スクロールは変わりません。`withDebugTracing` を選んだときは、起動している間だけ `console.group`・`log`・`groupEnd` を記録するだけの関数に替え、終わったら戻します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-provide-router)

> [!NOTE]
> **ポイント**
>
> 「withRouterConfig を 2 回」を押すと、`ROUTER_CONFIGURATION` は後ろの `{"onSameUrlNavigation":"reload"}` だけになります（[provideRouter の中身](../router/05-router-provide-router.md)の 5 節が書いている「マージされない」）。前の `paramsInheritanceStrategy` は消えます。`withHashLocation()` を選ぶと、偽の `PlatformLocation` に書かれる URL が `#/` の形になります。`withInMemoryScrolling` を選ぶと、偽の `ViewportScroller` に `setHistoryScrollRestoration('manual')` が記録されます。

📄 `Node で動かした記録（domino の上の JIT、記録のスクリプトは第 2 回の record.mjs。記録したときのデモのファイルは 15 の呼び出しをしていて、ページの版はそこから 5 つを外したもの）`

```
$ node record.mjs ~/angular-research/angular-deep-dive rtl-provide-router.demo-features.ts rtlPrFeatureRows '[[]]'   # 開発モード
  blocking    ɵkind  2  provider 3  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION（useValue） ; INITIAL_NAVIGATION（useValue） ; makeEnvironmentProviders › APP_INITIALIZER（useValue, multi）
  disabled    ɵkind  3  provider 2  makeEnvironmentProviders › APP_INITIALIZER（useValue, multi） ; INITIAL_NAVIGATION（useValue）
  debug       ɵkind  1  provider 1  ENVIRONMENT_INITIALIZER（useFactory, multi）
  preload     ɵkind  0  provider 2  ROUTER_PRELOADER（useExisting） ; PreloadingStrategy（useExisting）
  config      ɵkind  5  provider 1  ROUTER_CONFIGURATION（useValue）
  config2     ɵkind  5  provider 1  ROUTER_CONFIGURATION（useValue）
  hash        ɵkind  6  provider 1  LocationStrategy（useClass）
  scroll      ɵkind  4  provider 1  ROUTER_SCROLLER（useFactory）
  error       ɵkind  7  provider 1  NAVIGATION_ERROR_HANDLER（useValue）
  inputs      ɵkind  8  provider 1  INPUT_BINDER（useFactory）
  cleanup     ɵkind 10  provider 1  ROUTE_INJECTOR_CLEANUP（useValue）
  cleanupOld  ɵkind 10  provider 1  ROUTE_INJECTOR_CLEANUP（useValue）
  resources   ɵkind 12  provider 1  ROUTER_RESOURCES_FEATURE（useValue）
  view        ɵkind  9  provider 2  CREATE_VIEW_TRANSITION（useValue） ; VIEW_TRANSITION_OPTIONS（useValue）
  platform    ɵkind 11  provider 3  StateManager（useExisting） ; Location（useClass） ; makeEnvironmentProviders › ENVIRONMENT_INITIALIZER（useValue, multi）
$ node record.mjs … runRtlPrApp '[[[]],[["blocking","disabled"]],[["disabled","blocking"]],[["disabled"]],[["blocking"]],[["debug"]]]'
  []  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION null / APP_INITIALIZER 0 / createApplication の間の NavigationStart 0 / bootstrap 後の navigated true / 差し替えた console に来た呼び出し 0
  [blocking, disabled]  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION true / APP_INITIALIZER 2 / createApplication の間の NavigationStart 1 / bootstrap 後の navigated true / 差し替えた console に来た呼び出し 0
  [disabled, blocking]  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION true / APP_INITIALIZER 2 / createApplication の間の NavigationStart 1 / bootstrap 後の navigated true / 差し替えた console に来た呼び出し 0
  [disabled]  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION null / APP_INITIALIZER 1 / createApplication の間の NavigationStart 0 / bootstrap 後の navigated false / 差し替えた console に来た呼び出し 0
  [blocking]  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION true / APP_INITIALIZER 1 / createApplication の間の NavigationStart 1 / bootstrap 後の navigated true / 差し替えた console に来た呼び出し 0
  [debug]  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION null / APP_INITIALIZER 0 / createApplication の間の NavigationStart 0 / bootstrap 後の navigated true / 差し替えた console に来た呼び出し 77

$ node record.mjs ~/angular-research/angular-deep-dive rtl-provide-router.demo-features.ts rtlPrFeatureRows '[[]]' prod   # 本番（ngDevMode = false）
  blocking    ɵkind  2  provider 3  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION（useValue） ; INITIAL_NAVIGATION（useValue） ; makeEnvironmentProviders › APP_INITIALIZER（useValue, multi）
  disabled    ɵkind  3  provider 2  makeEnvironmentProviders › APP_INITIALIZER（useValue, multi） ; INITIAL_NAVIGATION（useValue）
  debug       ɵkind  1  provider 0  （なし）
  preload     ɵkind  0  provider 2  ROUTER_PRELOADER（useExisting） ; PreloadingStrategy（useExisting）
  config      ɵkind  5  provider 1  ROUTER_CONFIGURATION（useValue）
  config2     ɵkind  5  provider 1  ROUTER_CONFIGURATION（useValue）
  hash        ɵkind  6  provider 1  LocationStrategy（useClass）
  scroll      ɵkind  4  provider 1  ROUTER_SCROLLER（useFactory）
  error       ɵkind  7  provider 1  NAVIGATION_ERROR_HANDLER（useValue）
  inputs      ɵkind  8  provider 1  INPUT_BINDER（useFactory）
  cleanup     ɵkind 10  provider 1  ROUTE_INJECTOR_CLEANUP（useValue）
  cleanupOld  ɵkind 10  provider 1  ROUTE_INJECTOR_CLEANUP（useValue）
  resources   ɵkind 12  provider 1  ROUTER_RESOURCES_FEATURE（useValue）
  view        ɵkind  9  provider 2  CREATE_VIEW_TRANSITION（useValue） ; VIEW_TRANSITION_OPTIONS（useValue）
  platform    ɵkind 11  provider 2  StateManager（useExisting） ; Location（useClass）
$ node record.mjs … runRtlPrApp '[[[]],[["blocking","disabled"]],[["disabled","blocking"]],[["disabled"]],[["blocking"]],[["debug"]]]' prod
  []  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION null / APP_INITIALIZER 0 / createApplication の間の NavigationStart 0 / bootstrap 後の navigated true / 差し替えた console に来た呼び出し 0
  [blocking, disabled]  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION true / APP_INITIALIZER 2 / createApplication の間の NavigationStart 1 / bootstrap 後の navigated true / 差し替えた console に来た呼び出し 0
  [disabled, blocking]  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION true / APP_INITIALIZER 2 / createApplication の間の NavigationStart 1 / bootstrap 後の navigated true / 差し替えた console に来た呼び出し 0
  [disabled]  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION null / APP_INITIALIZER 1 / createApplication の間の NavigationStart 0 / bootstrap 後の navigated false / 差し替えた console に来た呼び出し 0
  [blocking]  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION true / APP_INITIALIZER 1 / createApplication の間の NavigationStart 1 / bootstrap 後の navigated true / 差し替えた console に来た呼び出し 0
  [debug]  ɵIS_ENABLED_BLOCKING_INITIAL_NAVIGATION null / APP_INITIALIZER 0 / createApplication の間の NavigationStart 0 / bootstrap 後の navigated true / 差し替えた console に来た呼び出し 0
```

## テストと直し方

### spec と it

| ファイル（packages/router/test/ から） | describe › it（行） | 固めているもの |
| --- | --- | --- |
| `bootstrap.spec.ts` | `bootstrap`（40）› 106 `should complete when initial navigation fails and initialNavigation = enabledBlocking` ほか | 2 節の blocking |
| `regression_integration.spec.ts`・`view_transitions.spec.ts` | `withDisabledInitialNavigation()` を使う it（L551、L42・L98） | 2 節の disabled（ほかの機能を試すための前提として） |
| `integration/navigation_errors.spec.ts` | 118（forRoot）・158 `can redirect from error handler`・196 | 5 節の 692〜696 行目 |
| `router_preloader.spec.ts` | `RouterPreloader`（47）› 22 本 | 5 節の `withPreloading` |

📄 `angular/packages/router/test/bootstrap.spec.ts` L106–143 （▶ の行: 116–117, 122, 138, 142）

```ts
106 │   it('should complete when initial navigation fails and initialNavigation = enabledBlocking', async () => {
107 │     @NgModule({
108 │       imports: [BrowserModule],
109 │       declarations: [RootCmp],
110 │       bootstrap: [RootCmp],
111 │       providers: [
112 │         ...testProviders,
113 │         provideRouter(
114 │           [
115 │             {
116 ▶               matcher: () => {
117 ▶                 throw new Error('error in matcher');
118 │               },
119 │               children: [],
120 │             },
121 │           ],
122 ▶           withEnabledBlockingInitialNavigation(),
123 │         ),
124 │       ],
125 │       schemas: [CUSTOM_ELEMENTS_SCHEMA],
126 │     })
127 │     class TestModule {
128 │       constructor(router: Router) {
129 │         log.push('TestModule');
130 │         router.events.subscribe((e) => log.push(e.constructor.name));
131 │       }
132 │     }
133 │ 
134 │     await platformBrowser([])
135 │       .bootstrapModule(TestModule)
136 │       .then((res) => {
137 │         const router = res.injector.get(Router);
138 ▶         expect(router.navigated).toEqual(false);
139 │         expect(router.getCurrentNavigation()).toBeNull();
140 │         expect(router.currentNavigation()).toBeNull();
141 │         expect(log).toContain('TestModule');
142 ▶         expect(log).toContain('NavigationError');
143 │       });
```

📄 `angular/packages/router/test/integration/navigation_errors.spec.ts` L158–194 （▶ の行: 174–175, 190–193）

```ts
158 │   it('can redirect from error handler', async () => {
159 │     TestBed.configureTestingModule({
160 │       providers: [
161 │         provideRouter(
162 │           [
163 │             {
164 │               path: 'throw',
165 │               canMatch: [
166 │                 () => {
167 │                   throw new Error('');
168 │                 },
169 │               ],
170 │               component: BlankCmp,
171 │             },
172 │             {path: 'error', component: BlankCmp},
173 │           ],
174 ▶           withRouterConfig({resolveNavigationPromiseOnError: true}),
175 ▶           withNavigationErrorHandler(() => new RedirectCommand(inject(Router).parseUrl('/error'))),
176 │         ),
177 │       ],
178 │     });
179 │     const router = TestBed.inject(Router);
180 │     let emitNavigationError = false;
181 │     let emitNavigationCancelWithRedirect = false;
182 │     router.events.subscribe((e) => {
183 │       if (e instanceof NavigationError) {
184 │         emitNavigationError = true;
185 │       }
186 │       if (e instanceof NavigationCancel && e.code === NavigationCancellationCode.Redirect) {
187 │         emitNavigationCancelWithRedirect = true;
188 │       }
189 │     });
190 ▶     await router.navigateByUrl('/throw');
191 ▶     expect(router.url).toEqual('/error');
192 ▶     expect(emitNavigationError).toBe(false);
193 ▶     expect(emitNavigationCancelWithRedirect).toBe(true);
194 │   });
```

138 行目は、blocking で初期ナビゲーションが失敗しても bootstrap が終わり、`navigated` が `false` のままであることを確かめています。191〜193 行目は 5 節の doc のとおり「`NavigationError` は出ず、`Redirect` の `NavigationCancel` が出る」ことです。**blocking と disabled を両方渡す it、`withDebugTracing` の it、`withExperimentalAutoCleanupInjectors` の it はありません。**

### 手元で走らせた結果

📄 `走らせたコマンドと結果（2026-11-20、8576f161ae4）`

```
$ cd ~/angular-research/angular        # 8576f161ae4
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all "--test_arg=--filter=^bootstrap "
Ran 11 of 1170 specs、11 specs, 0 failures（bootstrap.spec.ts の describe('bootstrap')）
  --filter=can redirect from error handler            Ran 4 of 1170 specs、0 failures（navigation_errors.spec.ts L118・L158 など）
  --filter=error happens in NavigationErrorHandler    Ran 2 of 1170 specs、0 failures（L196）
  --filter=^RouterPreloader                           Ran 22 of 1170 specs、0 failures（router_preloader.spec.ts）
# withDebugTracing・enableTracing・withExperimentalAutoCleanupInjectors を使う spec は packages/router/test に 0 件（grep）
```

### 直すとしたら

- 3 節の組み合わせを止めるなら、provide\_router.ts の `provideRouter` で、`provideHttpClient` と同じく開発モードのときだけ `features.map((f) => f.ɵkind)` を集め、`EnabledBlockingInitialNavigationFeature` と `DisabledInitialNavigationFeature` が両方あれば例外（か警告）にする形です。spec は bootstrap.spec.ts の `describe('bootstrap')` に「両方を渡すと NG0… になる」を足します。今の動きを変えずに固めるだけなら、同じ場所に「両方を渡すと初期ナビゲーションが 1 回走る」の it を足します。
- 4 節は doc コメントだけです。provide\_router.ts の `withDebugTracing` の doc に「開発モードでだけ働き、本番のビルドでは provider を返さない」と足します。
- 5 節の `withComponentInputBinding` の doc の最後（848 行目の下）に `@publicApi` を足す形です。887 行目のリンクの文字は「View Transitions on Chrome for Developers」のように URL に合わせます。
- 6 節の 117・173 行目は origin/main の bb41a49ecc4 で直っています。

## 聞かれそうな質問

**Q. provideRouter に同じ種類の feature を 2 つ渡すとどうなりますか？**

型も実行も止めません（959〜971 行目の union は 1 個ずつの型しか見ず、`ɵkind` を読むコードも無い）。`useValue` のトークン（`ROUTER_CONFIGURATION`・`INITIAL_NAVIGATION` など）は後ろが勝ち、multi のもの（`APP_INITIALIZER`）は両方残ります。

**Q. withEnabledBlockingInitialNavigation と withDisabledInitialNavigation を両方書いたら？**

初期ナビゲーションは 1 回走ります。blocking の `APP_INITIALIZER`（399 行目）が `INITIAL_NAVIGATION` を見ずに `initialNavigation()` を呼ぶからです。書く順は関係ありません（3 節、デモの 2 つのボタン）。

**Q. 本番で withDebugTracing を外し忘れたら、ログが出ますか？**

出ません。515 行目の `ngDevMode` が偽なので、534〜535 行目で provider が空になります。このページ（本番ビルド）のデモの表で provider が 0 個です。

**Q. provideRoutes はどこへ行きましたか？**

bdb6ae9dbc0 で消え、v22.0.0 から入っていません。`{provide: ROUTES, multi: true, useValue: routes}` を直接書くか、`provideRouter` を使います。

**Q. RouterModule.forRoot で withRouterResources や withAutoCleanupInjectors は使えますか？**

forRoot には対応する `ExtraOptions` の項目がありません。router\_module.ts の 35〜42 行目が import している `withX` にもこの 2 つは無く、forRoot は provide しません。

## 読み終えて

- `RouterFeatures` は 12 の型の union、種類の定数は 13。型は同じ種類を 2 つ渡すことを止めない。
- blocking と disabled を両方渡すと、blocking の `APP_INITIALIZER` が初期ナビゲーションを始める。
- `withDebugTracing` は本番で provider 0 個。doc コメントには書かれていない。
- `ROUTER_PRELOADER`・`ROUTER_SCROLLER` は factory の無いトークンで、bootstrap のときに optional で読まれる。
- forRoot は withX の `ɵproviders` を借りる。新しい 3 つの feature は forRoot から使えない。

---

← 前: [ActivatedRoute の Observable と継承：toString・createEmptyState・paramMap と title・getInherited の既定値](02-rtl-router-state.md)  
次: [Router クラスと Navigation の型：公開メソッドの残りと Navigation の各項目](04-rtl-router-class.md) →
