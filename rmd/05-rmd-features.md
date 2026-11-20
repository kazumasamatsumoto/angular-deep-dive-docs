[目次](../README.md) › [Router の型と説明文の読み残し](README.md) › 第 5 回 / 全 9 回

# provideRouter の機能の説明文：withXxx の約束

> provide\_router.ts の未読の行：withInMemoryScrolling・withExperimentalPlatformNavigation・withPreloading・withRouterConfig・withHashLocation・withNavigationErrorHandler・withAutoCleanupInjectors・withComponentInputBinding・withViewTransitions・withRouterResources の説明文と型の別名。本物の Router で付けない / 付けるを比べ、withHashLocation の「history API の代わりに」が動きと合わないことを確かめる。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-features)

---

この章で分かること：`provideRouter` に渡す `withX` の doc コメント（angular.dev の API リファレンスになる文）が、それぞれ何を約束しているか。そして本物の Router で「付けない」と「付ける」を 2 回ずつ動かすと、その約束どおりに変わるか。`withHashLocation` の 1 文だけは、本物の動きと言い方が合いません。

読む対象は `packages/router/src/provide_router.ts` の、これまでの章が引いていない行です（../angular、8576f161ae4）。各 `withX` が何を provide するかは[provideRouter の中身](../router/05-router-provide-router.md)、型の別名・小さなトークン・`withDebugTracing` が本番で空になることは[provideRouter と RouterModule の残り](../rtl/03-rtl-provide-router.md)で読みました。ここではそれを繰り返さず、doc の文と動きを並べます。

1. [1. models.ts の小さな型](01-rmd-basic-types.md)
2. [2. Route の説明文](02-rmd-route.md)
3. [3. ガードの型](03-rmd-guards.md)
4. [4. Resolve と NavigationBehaviorOptions](04-rmd-resolve-nav.md)
5. **5. provideRouter の機能**（この章）
6. [6. ルーターのイベント](06-rmd-events.md)
7. [7. RouterLink と RouterOutlet](07-rmd-directives.md)
8. [8. URL とナビゲーションの小道具](08-rmd-url-rest.md)
9. [9. spec と issue](09-rmd-tests-issues.md)

## 1. import の並びが、feature の行き先を教える

📄 `angular/packages/router/src/provide_router.ts` L36–69 （▶ の行: 38, 42–43, 49, 53, 55, 63–65, 68）

```ts
36 │ import {of, Subject} from 'rxjs';
37 │ 
38 ▶ import {INPUT_BINDER, RoutedComponentInputBinder} from './directives/router_outlet';
39 │ import {createResourceOutletBindingEffects} from './router_resource';
40 │ import {Event, NavigationError, stringifyEvent} from './events';
41 │ import {RedirectCommand, Routes} from './models';
42 ▶ import {NAVIGATION_ERROR_HANDLER, NavigationTransitions} from './navigation_transition';
43 ▶ import {ROUTE_INJECTOR_CLEANUP, routeInjectorCleanup} from './route_injector_cleanup';
44 │ import {Router} from './router';
45 │ import {
46 │   ComponentInputBindingOptions,
47 │   InMemoryScrollingOptions,
48 │   ROUTER_CONFIGURATION,
49 ▶   RouterConfigOptions,
50 │ } from './router_config';
51 │ import {ROUTES} from './router_config_loader';
52 │ import {setupAndRunResources} from './operators/setup_and_run_resources';
53 ▶ import {PreloadingStrategy, RouterPreloader} from './router_preloader';
54 │ 
55 ▶ import {ROUTER_SCROLLER, RouterScroller} from './router_scroller';
56 │ 
57 │ import {getLoadedRoutes, getRouterInstance, navigateByUrl} from './router_devtools';
58 │ import {ActivatedRoute} from './router_state';
59 │ import {NavigationStateManager} from './statemanager/navigation_state_manager';
60 │ import {StateManager} from './statemanager/state_manager';
61 │ import {afterNextNavigation} from './utils/navigations';
62 │ import {
63 ▶   CREATE_VIEW_TRANSITION,
64 ▶   createViewTransition,
65 ▶   VIEW_TRANSITION_OPTIONS,
66 │   ViewTransitionsFeatureOptions,
67 │ } from './utils/view_transition';
68 ▶ import {ROUTER_RESOURCES_FEATURE} from './router_resource_feature';
69 │ 
```

provide\_router.ts が import しているものは、そのまま「どの `withX` が、どのファイルの何を差し込むか」の一覧です。38 行目の `INPUT_BINDER` と `RoutedComponentInputBinder` は `withComponentInputBinding`、42 行目の `NAVIGATION_ERROR_HANDLER` は `withNavigationErrorHandler`、43 行目の `ROUTE_INJECTOR_CLEANUP` は `withAutoCleanupInjectors`、49 行目の `RouterConfigOptions` は `withRouterConfig`、53 行目の `RouterPreloader` は `withPreloading`、55 行目の `ROUTER_SCROLLER` は `withInMemoryScrolling`、63〜65 行目は `withViewTransitions`、68 行目の `ROUTER_RESOURCES_FEATURE` は `withRouterResources` の行き先です。どれも「トークンに値を 1 つ置く」だけで、置いた値を読むのは各ファイルの側です（読む側の行は各節でリンクします）。

📄 `angular/packages/router/src/provide_router.ts` L70–83 （▶ の行: 71–72, 80）

````ts
70 │ /**
71 ▶  * Sets up providers necessary to enable `Router` functionality for the application.
72 ▶  * Allows to configure a set of routes as well as extra features that should be enabled.
73 │  *
74 │  * @usageNotes
75 │  *
76 │  * Basic example of how you can add a Router to your application:
77 │  * ```ts
78 │  * const appRoutes: Routes = [];
79 │  * bootstrapApplication(AppComponent, {
80 ▶  *   providers: [provideRouter(appRoutes)]
81 │  * });
82 │  * ```
83 │  *
````

71〜72 行目の約束は「Router に要る provider を用意し、ルートの集まりと追加の機能を設定できる」です。80 行目の例は `provideRouter(appRoutes)` だけで、feature を渡す 2 つ目の例（84〜97 行目）は[前のシリーズ](../rtl/03-rtl-provide-router.md)で読みました。

## 2. withInMemoryScrolling：付けると Scroll が流れ始める

📄 `angular/packages/router/src/provide_router.ts` L157–181 （▶ の行: 158, 168, 175, 178–179）

````ts
157 │ /**
158 ▶  * Enables customizable scrolling behavior for router navigations.
159 │  *
160 │  * @usageNotes
161 │  *
162 │  * Basic example of how you can enable scrolling feature:
163 │  * ```ts
164 │  * const appRoutes: Routes = [];
165 │  * bootstrapApplication(AppComponent,
166 │  *   {
167 │  *     providers: [
168 ▶  *       provideRouter(appRoutes, withInMemoryScrolling())
169 │  *     ]
170 │  *   }
171 │  * );
172 │  * ```
173 │  *
174 │  * @see {@link provideRouter}
175 ▶  * @see {@link ViewportScroller}
176 │  *
177 │  * @publicApi
178 ▶  * @param options Set of configuration parameters to customize scrolling behavior, see
179 ▶  *     `InMemoryScrollingOptions` for additional information.
180 │  * @returns A set of providers for use with `provideRouter`.
181 │  */
````

158 行目は「ナビゲーションのスクロールの振る舞いを設定できるようにする」、178〜179 行目は「options は `InMemoryScrollingOptions` を見よ」です。168 行目の例は引数なしで呼んでいます。引数なしのときに何が起きるかは、この doc には書かれていません。`RouterScroller` のコンストラクター（router\_scroller.ts、[Router.events の全種類](../router/17-router-events.md)の 6 節）は 2 つのオプションを `'disabled'` で埋めます。

下のデモで比べると、**付けない**ときは `Scroll` イベントが 0 個、**引数なしで付ける**と `/a`・`/b#part` の 2 回の移動で `Scroll` が 2 個流れ、`ViewportScroller` は 1 回も呼ばれません。`scrollPositionRestoration: 'top'` と `anchorScrolling: 'enabled'` を渡すと、起動時に `setHistoryScrollRestoration('manual')`、移動のたびに `scrollToPosition([0,0])` と `scrollToAnchor('part')` が呼ばれます。つまり引数なしの `withInMemoryScrolling()` は「`Scroll` イベントを出すだけ」で、自分で `Scroll` を受けてスクロールする形（`InMemoryScrollingOptions` の doc の例、[第 8 回](08-rmd-url-rest.md)）のための入口になります。

## 3. withExperimentalPlatformNavigation：「Location strategy」と書くが、差し替えるのは Location

📄 `angular/packages/router/src/provide_router.ts` L193–205 （▶ の行: 200, 202–203）

```ts
193 │ 
194 │ /**
195 │  * A type alias for providers returned by `withExperimentalPlatformNavigation` for use with `provideRouter`.
196 │  *
197 │  * @see {@link withExperimentalPlatformNavigation}
198 │  * @see {@link provideRouter}
199 │  *
200 ▶  * @experimental 21.1
201 │  */
202 ▶ export type ExperimentalPlatformNavigationFeature =
203 ▶   RouterFeature<RouterFeatureKind.ExperimentalPlatformNavigationFeature>;
204 │ 
205 │ /**
```

📄 `angular/packages/router/src/provide_router.ts` L226–246 （▶ の行: 235, 239, 244–245）

````ts
226 │  * @usageNotes
227 │  *
228 │  * ```typescript
229 │  * const appRoutes: Routes = [
230 │  *   { path: 'page', component: PageComponent },
231 │  * ];
232 │  *
233 │  * bootstrapApplication(AppComponent, {
234 │  *   providers: [
235 ▶  *     provideRouter(appRoutes, withExperimentalPlatformNavigation())
236 │  *   ]
237 │  * });
238 │  * ```
239 ▶  * 
240 │  * @see [Navigation API on WICG](https://github.com/WICG/navigation-api?tab=readme-ov-file#problem-statement)
241 │  * @see [Navigation API on Chrome from developers](https://developer.chrome.com/docs/web-platform/navigation-api/)
242 │  * @see [Navigation API on MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API)
243 │  *
244 ▶  * @experimental 21.1 
245 ▶  * @returns A `RouterFeature` that enables the platform navigation.
246 │  */
````

200・244 行目は `@experimental 21.1` です。この間の 206〜225 行目の説明（[Navigation API との統合](../router/21-router-platform-navigation.md)で引用）は「この関数はブラウザの `Navigation` API を使う `Location` strategy を provide する」と書きます。実装（同じ章の 266〜270 行目）が provide するのは `{provide: Location, useClass: ɵNavigationAdapterForLocation}` と `StateManager` で、`LocationStrategy` ではありません。`withHashLocation`（7 節）が差し替えるのは `LocationStrategy` なので、「strategy」という言葉で読むと 2 つの層を取り違えます。239・244 行目は行末に空白が残っていて、間の 222 行目（同じ章の引用）は先頭の `*` の無い空の行です（JSDoc としては読めます）。このページのデモには入れていません。import すると、この feature の中身がサイトの初期の JS に入るためです（[前のシリーズ](../rtl/03-rtl-provide-router.md)のデモの注と同じ理由）。

## 4. 型の別名の doc：withDisabledInitialNavigation と withDebugTracing

📄 `angular/packages/router/src/provide_router.ts` L430–439 （▶ の行: 432–433, 438）

```ts
430 │ 
431 │ /**
432 ▶  * A type alias for providers returned by `withDisabledInitialNavigation` for use with
433 ▶  * `provideRouter`.
434 │  *
435 │  * @see {@link withDisabledInitialNavigation}
436 │  * @see {@link provideRouter}
437 │  *
438 ▶  * @publicApi
439 │  */
```

📄 `angular/packages/router/src/provide_router.ts` L478–486 （▶ の行: 480, 485）

```ts
478 │ 
479 │ /**
480 ▶  * A type alias for providers returned by `withDebugTracing` for use with `provideRouter`.
481 │  *
482 │  * @see {@link withDebugTracing}
483 │  * @see {@link provideRouter}
484 │  *
485 ▶  * @publicApi
486 │  */
```

432・480 行目の形（「`withX` が返す provider の型の別名」）は、13 の feature の型すべてに同じ文で付いています。どちらも `@publicApi` で、関数の側の約束は[前のシリーズ](../rtl/03-rtl-provide-router.md)の 2 節と 4 節です。デモの表の最初の行は `withDebugTracing()` を付けて `/guarded` に移り、`console.group`・`log`・`groupEnd` への呼び出しを数えます。このページ（本番ビルド）では 0 回、Node の開発モードの記録では 44 回です。

## 5. withPreloading：移動しない lazy の Route が読まれる

📄 `angular/packages/router/src/provide_router.ts` L554–575 （▶ の行: 556–557, 567）

````ts
554 │ 
555 │ /**
556 ▶  * Allows to configure a preloading strategy to use. The strategy is configured by providing a
557 ▶  * reference to a class that implements a `PreloadingStrategy`.
558 │  *
559 │  * @usageNotes
560 │  *
561 │  * Basic example of how you can configure preloading:
562 │  * ```ts
563 │  * const appRoutes: Routes = [];
564 │  * bootstrapApplication(AppComponent,
565 │  *   {
566 │  *     providers: [
567 ▶  *       provideRouter(appRoutes, withPreloading(PreloadAllModules))
568 │  *     ]
569 │  *   }
570 │  * );
571 │  * ```
572 │  *
573 │  * @see {@link provideRouter}
574 │  *
575 │  * @param preloadingStrategy A reference to a class that implements a `PreloadingStrategy` that
````

556〜557 行目は「`PreloadingStrategy` を実装したクラスへの参照を渡して、事前読み込みの戦略を設定する」です。実装（583〜589 行目、[遅延読み込み](../router/11-router-lazy-loading.md)で引用）は `{provide: PreloadingStrategy, useExisting: preloadingStrategy}` なので、渡すクラスは注入できる必要があります（`PreloadAllModules` は `providedIn: 'root'`）。doc はこの条件に触れていません。デモでは、`loadChildren` を持つ `/lazy` に一度も移動しないのに、付けると起動のあとで `RouteConfigLoadStart(path: lazy)` と `RouteConfigLoadEnd` が出ます。付けないと 0 個です。

## 6. withRouterConfig：例の 1 つと、試した 4 つ

📄 `angular/packages/router/src/provide_router.ts` L590–601 （▶ の行: 592, 599）

```ts
590 │ 
591 │ /**
592 ▶  * A type alias for providers returned by `withRouterConfig` for use with `provideRouter`.
593 │  *
594 │  * @see {@link withRouterConfig}
595 │  * @see {@link provideRouter}
596 │  *
597 │  * @publicApi
598 │  */
599 ▶ export type RouterConfigurationFeature =
600 │   RouterFeature<RouterFeatureKind.RouterConfigurationFeature>;
601 │ 
```

📄 `angular/packages/router/src/provide_router.ts` L602–630 （▶ の行: 603, 613–614, 623–624）

````ts
602 │ /**
603 ▶  * Allows to provide extra parameters to configure Router.
604 │  *
605 │  * @usageNotes
606 │  *
607 │  * Basic example of how you can provide extra configuration options:
608 │  * ```ts
609 │  * const appRoutes: Routes = [];
610 │  * bootstrapApplication(AppComponent,
611 │  *   {
612 │  *     providers: [
613 ▶  *       provideRouter(appRoutes, withRouterConfig({
614 ▶  *          onSameUrlNavigation: 'reload'
615 │  *       }))
616 │  *     ]
617 │  *   }
618 │  * );
619 │  * ```
620 │  *
621 │  * @see {@link provideRouter}
622 │  *
623 ▶  * @param options A set of parameters to configure Router, see `RouterConfigOptions` for
624 ▶  *     additional information.
625 │  * @returns A set of providers for use with `provideRouter`.
626 │  *
627 │  * @see [Router configuration options](guide/routing/customizing-route-behavior#router-configuration-options)
628 │  *
629 │  * @publicApi
630 │  */
````

603 行目は「Router に追加の設定を渡せる」、623〜624 行目は「中身は `RouterConfigOptions` を見よ」です。各項目の doc と `ExtraOptions` との対応は[ExtraOptions と RouterModule](../rdir/05-rdir-options.md)で読みました。デモは 613〜614 行目の例（`onSameUrlNavigation: 'reload'`）をそのまま動かし、ほかに 4 つの項目を 1 つずつ付けて比べます。

1. **`onSameUrlNavigation: 'reload'`**

   付けないと 2 回目の `/a` は `NavigationSkipped` 1 個で、Promise は `false`。付けると `NavigationStart` から `NavigationEnd` まで全部流れ、`true`。
2. **`paramsInheritanceStrategy: 'emptyOnly'`**

   `/p/7/c`（`p/:id` はコンポーネントを持つ）の葉の `params` は、付けないと `{"id":"7"}`、付けると `{}`。今の既定は `'always'` だからです（[ActivatedRoute の Observable と継承](../rtl/02-rtl-router-state.md)の 5 節）。
3. **`defaultQueryParamsHandling: 'merge'`**

   `/a?x=1` の上で `createUrlTree(['/b'], {queryParams: {y: 2}})` が、付けないと `/b?y=2`、付けると `/b?x=1&y=2`。
4. **`urlUpdateStrategy: 'eager'`**

   `GuardsCheckStart` の時点で偽の `PlatformLocation` に積まれた `pushState` が、付けないと 0 回、付けると 1 回。URL がガードより先に書かれます。
5. **`resolveNavigationPromiseOnError: true`**

   例外を投げる resolver の `/boom` で、Promise が付けないと reject、付けると `false` で resolve。イベントはどちらも `NavigationStart → NavigationError`。

## 7. withHashLocation：「history API の代わりに」ではない

📄 `angular/packages/router/src/provide_router.ts` L635–669 （▶ の行: 637, 644, 647, 657, 664）

````ts
635 │ 
636 │ /**
637 ▶  * A type alias for providers returned by `withHashLocation` for use with `provideRouter`.
638 │  *
639 │  * @see {@link withHashLocation}
640 │  * @see {@link provideRouter}
641 │  *
642 │  * @publicApi
643 │  */
644 ▶ export type RouterHashLocationFeature = RouterFeature<RouterFeatureKind.RouterHashLocationFeature>;
645 │ 
646 │ /**
647 ▶  * Provides the location strategy that uses the URL fragment instead of the history API.
648 │  *
649 │  * @usageNotes
650 │  *
651 │  * Basic example of how you can use the hash location option:
652 │  * ```ts
653 │  * const appRoutes: Routes = [];
654 │  * bootstrapApplication(AppComponent,
655 │  *   {
656 │  *     providers: [
657 ▶  *       provideRouter(appRoutes, withHashLocation())
658 │  *     ]
659 │  *   }
660 │  * );
661 │  * ```
662 │  *
663 │  * @see {@link provideRouter}
664 ▶  * @see {@link /api/common/HashLocationStrategy HashLocationStrategy}
665 │  *
666 │  * @returns A set of providers for use with `provideRouter`.
667 │  *
668 │  * @publicApi
669 │  */
````

647 行目は「history API の代わりに URL の fragment を使う location strategy を provide する」と書きます。実装（670〜673 行目、[provideRouter の中身](../router/05-router-provide-router.md)で引用）は `{provide: LocationStrategy, useClass: HashLocationStrategy}` だけです。その `HashLocationStrategy.pushState` は、パスを `prepareExternalUrl` で `#` 付きにしてから `PlatformLocation.pushState` を呼び、ブラウザの `PlatformLocation` はそれを `history.pushState` に渡します（どちらも[browserUrl と Location](../router/16-router-browser-url.md)で引用）。`HashLocationStrategy` 自身の doc は次のとおりで、こちらは言い方が正確です。

📄 `angular/packages/common/src/location/hash_location_strategy.ts` L17–46 （▶ の行: 17–20, 22–23, 39）

```ts
17 ▶  * A {@link LocationStrategy} used to configure the {@link Location} service to
18 ▶  * represent its state in the
19 ▶  * [hash fragment](https://en.wikipedia.org/wiki/Uniform_Resource_Locator#Syntax)
20 ▶  * of the browser's URL.
21 │  *
22 ▶  * For instance, if you call `location.go('/foo')`, the browser's URL will become
23 ▶  * `example.com#/foo`.
24 │  *
25 │  * @usageNotes
26 │  *
27 │  * ### Example
28 │  *
29 │  * {@example common/location/ts/hash_location_component.ts region='LocationComponent'}
30 │  *
31 │  * @publicApi
32 │  */
33 │ @Injectable()
34 │ export class HashLocationStrategy extends LocationStrategy implements OnDestroy {
35 │   private _baseHref: string = '';
36 │   private _removeListenerFns: (() => void)[] = [];
37 │ 
38 │   constructor(
39 ▶     private _platformLocation: PlatformLocation,
40 │     @Optional() @Inject(APP_BASE_HREF) _baseHref?: string,
41 │   ) {
42 │     super();
43 │     if (_baseHref != null) {
44 │       this._baseHref = _baseHref;
45 │     }
46 │   }
```

📄 `angular/packages/common/src/location/hash_location_strategy.ts` L48–60 （▶ の行: 55, 57–58）

```ts
48 │   /** @docs-private */
49 │   ngOnDestroy(): void {
50 │     while (this._removeListenerFns.length) {
51 │       this._removeListenerFns.pop()!();
52 │     }
53 │   }
54 │ 
55 ▶   override onPopState(fn: LocationChangeListener): void {
56 │     this._removeListenerFns.push(
57 ▶       this._platformLocation.onPopState(fn),
58 ▶       this._platformLocation.onHashChange(fn),
59 │     );
60 │   }
```

17〜20 行目は「`Location` の状態をブラウザの URL の hash fragment で表す `LocationStrategy`」、22〜23 行目は「`location.go('/foo')` で URL は `example.com#/foo` になる」。history API を使わないとは書いていません。39 行目で受け取る `PlatformLocation` が、ブラウザでは history を持つ `BrowserPlatformLocation` です。

デモで偽の `PlatformLocation` に届いた呼び出しを見ると、付けないと `pushState('/a?x=1')`、付けると `pushState('#/a?x=1')` です。**どちらも history API の `pushState` を使っていて、違うのは渡す URL が fragment に入るかどうかだけ**です。647 行目の文は f58ad86e518（2022-11-30、#48301、`withHashLocation` を足したコミット）のままで、origin/main でも同じです。「パスの代わりに URL の fragment に経路を入れる（書き込みは history API の `pushState` のまま、戻る・進むは `popstate` と `hashchange` の両方で受ける）」が実際の動きです（`onPopState` が 57〜58 行目で両方を購読する）。

## 8. withNavigationErrorHandler：RedirectCommand だけが効く

📄 `angular/packages/router/src/provide_router.ts` L674–685 （▶ の行: 676, 683）

```ts
674 │ 
675 │ /**
676 ▶  * A type alias for providers returned by `withNavigationErrorHandler` for use with `provideRouter`.
677 │  *
678 │  * @see {@link withNavigationErrorHandler}
679 │  * @see {@link provideRouter}
680 │  *
681 │  * @publicApi
682 │  */
683 ▶ export type NavigationErrorHandlerFeature =
684 │   RouterFeature<RouterFeatureKind.NavigationErrorHandlerFeature>;
685 │ 
```

📄 `angular/packages/router/src/provide_router.ts` L692–721 （▶ の行: 692–696, 706–707）

````ts
692 ▶  * This function can return a `RedirectCommand` to convert the error to a redirect, similar to returning
693 ▶  * a `UrlTree` or `RedirectCommand` from a guard. This will also prevent the `Router` from emitting
694 ▶  * `NavigationError`; it will instead emit `NavigationCancel` with code NavigationCancellationCode.Redirect.
695 ▶  * Return values other than `RedirectCommand` are ignored and do not change any behavior with respect to
696 ▶  * how the `Router` handles the error.
697 │  *
698 │  * @usageNotes
699 │  *
700 │  * Basic example of how you can use the error handler option:
701 │  * ```ts
702 │  * const appRoutes: Routes = [];
703 │  * bootstrapApplication(AppComponent,
704 │  *   {
705 │  *     providers: [
706 ▶  *       provideRouter(appRoutes, withNavigationErrorHandler((e: NavigationError) =>
707 ▶  * inject(MyErrorTracker).trackError(e)))
708 │  *     ]
709 │  *   }
710 │  * );
711 │  * ```
712 │  *
713 │  * @see {@link NavigationError}
714 │  * @see {@link /api/core/inject inject}
715 │  * @see {@link runInInjectionContext}
716 │  * @see [Centralize error handling in withNavigationErrorHandler](guide/routing/data-resolvers#centralize-error-handling-in-withnavigationerrorhandler)
717 │  *
718 │  * @returns A set of providers for use with `provideRouter`.
719 │  *
720 │  * @publicApi
721 │  */
````

692〜694 行目は「`RedirectCommand` を返すとエラーをリダイレクトに変え、`NavigationError` の代わりに `NavigationCancellationCode.Redirect` の `NavigationCancel` を出す」、695〜696 行目は「それ以外の戻り値は無視する」です。実装は navigation\_transition.ts の `catchError` の中の 944〜971 行目で、949 行目の `instanceof RedirectCommand` だけを見ます（[Router クラスと Navigation の型](../rtl/04-rtl-router-class.md)）。

デモの 2 行は 692〜696 行目の両方の文に当たります。`RedirectCommand` を返すと `NavigationStart → NavigationCancel（code 0 = Redirect）→ NavigationStart → NavigationEnd` で、Promise は `true`、`router.url` は `/recovered`。同じ場所を指す **`UrlTree` を返すと無視され**、`NavigationError` が出て Promise は reject です。ガードでは `UrlTree` もリダイレクトになるので（693 行目の「ガードと同じく」）、ここだけ `RedirectCommand` に限られることは覚えておく所です。706〜707 行目の例は `inject` を使い、デモの handler も `inject(Router)` を使って動きます。この 2 文は 4a42961393b（2024-04-15、#55370）で入りました。

## 9. withAutoCleanupInjectors・withComponentInputBinding・withViewTransitions・withRouterResources の doc

📄 `angular/packages/router/src/provide_router.ts` L733–752 （▶ の行: 740, 750–751）

```ts
733 │ 
734 │ /**
735 │  * A type alias for providers returned by `withAutoCleanupInjectors` for use with `provideRouter`.
736 │  *
737 │  * @see {@link withAutoCleanupInjectors}
738 │  * @see {@link provideRouter}
739 │  *
740 ▶  * @publicApi 22.2
741 │  */
742 │ export type AutoCleanupInjectorsFeature =
743 │   RouterFeature<RouterFeatureKind.AutoCleanupInjectorsFeature>;
744 │ 
745 │ /**
746 │  * Enables automatic destruction of unused route injectors.
747 │  *
748 │  * @description
749 │  *
750 ▶  * When enabled, the router will automatically destroy `EnvironmentInjector`s associated with `Route`s
751 ▶  * that are no longer active or stored by the `RouteReuseStrategy`.
752 │  *
```

740 行目は `@publicApi 22.2`。750〜751 行目とその続きは「`RouteReuseStrategy.shouldDestroyInjector` が `true` を返す Route の注入器だけを壊す」と、壊す条件をはっきり書いています（中身は[読み込み・事前読み込み・再利用・関数ガード](../rtl/05-rtl-load-guard.md)）。

📄 `angular/packages/router/src/provide_router.ts` L777–816 （▶ の行: 785, 796, 799–801, 811）

````ts
777 │ /**
778 │  * A type alias for providers returned by `withComponentInputBinding` for use with `provideRouter`.
779 │  *
780 │  * @see {@link withComponentInputBinding}
781 │  * @see {@link provideRouter}
782 │  *
783 │  * @publicApi
784 │  */
785 ▶ export type ComponentInputBindingFeature =
786 │   RouterFeature<RouterFeatureKind.ComponentInputBindingFeature>;
787 │ 
788 │ /**
789 │  * A type alias for providers returned by `withViewTransitions` for use with `provideRouter`.
790 │  *
791 │  * @see {@link withViewTransitions}
792 │  * @see {@link provideRouter}
793 │  *
794 │  * @publicApi
795 │  */
796 ▶ export type ViewTransitionsFeature = RouterFeature<RouterFeatureKind.ViewTransitionsFeature>;
797 │ 
798 │ /**
799 ▶  * Enables binding information from the `Router` state directly to the inputs of the component in
800 ▶  * `Route` configurations. Can also accept an `ComponentInputBindingOptions` object to set which
801 ▶  * sources are allowed to bind.
802 │  *
803 │  * @usageNotes
804 │  *
805 │  * Basic example of how you can enable the feature:
806 │  * ```ts
807 │  * const appRoutes: Routes = [];
808 │  * bootstrapApplication(AppComponent,
809 │  *   {
810 │  *     providers: [
811 ▶  *       provideRouter(appRoutes, withComponentInputBinding())
812 │  *     ]
813 │  *   }
814 │  * );
815 │  * ```
816 │  *
````

799〜801 行目は「Router の状態をコンポーネントの入力に結び付け、`ComponentInputBindingOptions` で元を選べる」です。この続き（817 行目から、[前のシリーズ](../rtl/03-rtl-provide-router.md)で引用）は、元を「query → パスとマトリクス → 静的な data → resolver」の順に並べ、「後ろほど強い」「対応するキーが無い入力は `undefined` にする」と書きます。デモで `id` という入力を持つコンポーネントを置くと、付けないとどれも `undefined`、付けると `?id=query` だけなら `"query"`、`:id` があれば `"path"`、`data` があれば `"data の値"`、resolver があれば `"resolver の値"`、続けて `id` の無い URL に移ると `undefined` に戻ります。doc の順のとおりです。`{queryParams: false}` では `?id=query` が入らず、パスの `:id` は入ります。

> [!NOTE]
> **ポイント**
>
> doc の並びは「resolver がいちばん強い」で終わりますが、今の `RoutedComponentInputBinder` は resources をさらに上に置きます（router\_outlet.ts の 513〜520 行目のコメント「resources &gt; data (including resolvers) &gt; path params &gt; query params」、[Route の起動](../router/15-router-activate-routes.md)で引用）。「無い入力は `undefined`」も既定の `unmatchedInputBehavior: 'alwaysUndefined'` の話で、`'undefinedIfStale'` にすると一度も値の来ていない入力はそのまま残ります（router\_config.ts の `ComponentInputBindingOptions`、spec は directives/router\_outlet.spec.ts の 231 行目の it）。どちらも provide\_router.ts の doc には出てきません。

📄 `angular/packages/router/src/provide_router.ts` L863–883 （▶ の行: 865–866, 868–870）

````ts
863 │ 
864 │ /**
865 ▶  * Enables view transitions in the Router by running the route activation and deactivation inside of
866 ▶  * `document.startViewTransition`.
867 │  *
868 ▶  * Note: The View Transitions API is not available in all browsers. If the browser does not support
869 ▶  * view transitions, the Router will not attempt to start a view transition and continue processing
870 ▶  * the navigation as usual.
871 │  *
872 │  * @usageNotes
873 │  *
874 │  * Basic example of how you can enable the feature:
875 │  * ```ts
876 │  * const appRoutes: Routes = [];
877 │  * bootstrapApplication(AppComponent,
878 │  *   {
879 │  *     providers: [
880 │  *       provideRouter(appRoutes, withViewTransitions())
881 │  *     ]
882 │  *   }
883 │  * );
````

865〜866 行目は「Route の起動と終了を `document.startViewTransition` の中で走らせる」、868〜870 行目は「対応しないブラウザでは始めようとせず、普段どおり進む」です。utils/view\_transition.ts の `createViewTransition` の doc（[第 8 回](08-rmd-url-rest.md)で引用）も「ブラウザが対応していないか、すでに遷移を出しているときは呼ばない」と同じことを書き、実装は[View Transitions](../router/19-router-view-transitions.md)で読みました。

📄 `angular/packages/router/src/provide_router.ts` L905–935 （▶ の行: 912, 917, 927, 933）

````ts
905 │ 
906 │ /**
907 │  * A type alias for providers returned by `withRouterResources` for use with `provideRouter`.
908 │  *
909 │  * @see {@link withRouterResources}
910 │  * @see {@link provideRouter}
911 │  *
912 ▶  * @developerPreview 22.2
913 │  */
914 │ export type RouterResourcesFeature = RouterFeature<RouterFeatureKind.RouterResourcesFeature>;
915 │ 
916 │ /**
917 ▶  * Enables `resources` capabilities for Route definitions.
918 │  *
919 │  * @usageNotes
920 │  *
921 │  * Basic example of how you can enable the feature:
922 │  * ```ts
923 │  * const appRoutes: Routes = [];
924 │  * bootstrapApplication(AppComponent,
925 │  *   {
926 │  *     providers: [
927 ▶  *       provideRouter(appRoutes, withRouterResources())
928 │  *     ]
929 │  *   }
930 │  * );
931 │  * ```
932 │  *
933 ▶  * @developerPreview 22.2
934 │  * @returns A set of providers for use with `provideRouter`.
935 │  */
````

912・933 行目は `@developerPreview 22.2`、917 行目は「Route の定義で `resources` を使えるようにする」とだけ書きます。何が使えるようになるかは[Route の resources](../router/20-router-resources.md)で読みました。`withViewTransitions`・`withRouterResources`・`withAutoCleanupInjectors` も、3 節と同じ理由でこのページのデモには入れていません。

## 10. 動かして確かめる

> **🧪 DEMO — withX を付けない / 付けるで、本物の Router を 2 回ずつ動かす**
>
> ボタンを押すと、その行の `withX` を付けないアプリと付けたアプリを `createApplication` で 1 つずつ作り、文書に付けない div に bootstrap し、決まった移動をして、読み終えたら `destroy` します。子の注入器（`createEnvironmentInjector`）ではなく別のアプリにするのは、`withPreloading` と `withInMemoryScrolling` が働き始めるのが bootstrap のとき（`getBootstrapListener`）だからです。`PlatformLocation` と `ViewportScroller` は記録するだけの偽物なので、このページの URL・履歴・スクロールは変わりません。`withDebugTracing` の行だけ、動かしている間 `console.group`・`log`・`groupEnd` を記録する関数に替え、終わったら戻します。右端の列は、同じデモのファイルを Node（domino の上の JIT、開発モード）で走らせた記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-features)

このページの列と Node の列が違うのは `withDebugTracing` の行だけです（本番では provider が 0 個、[前のシリーズ](../rtl/03-rtl-provide-router.md)の 4 節）。ほかの 13 行は開発モードと本番で同じ文字列になりました。

## テストと直し方

### spec と it

| doc の約束 | spec（packages/router/test/ から） |
| --- | --- |
| 2 節 `withInMemoryScrolling` | `router_scroller.spec.ts`（`RouterScroller` を直接作る it と、`withInMemoryScrolling` を使う it） |
| 5 節 `withPreloading` | `router_preloader.spec.ts` |
| 6 節 `withRouterConfig` の各項目 | `integration/eager_url_update_strategy.spec.ts`・`integration/navigation_errors.spec.ts` ほか 13 ファイルが `withRouterConfig` を使う |
| 7 節 `withHashLocation` | **0 件**（`grep -rl withHashLocation packages/router/test` が何も返さない） |
| 8 節 692〜696 行目 | `integration/navigation_errors.spec.ts` の 158 行目 `can redirect from error handler`（`RedirectCommand` の側）。`UrlTree` を返すと無視される側の it は無い |
| 9 節 入力の優先順・`queryParams: false`・`undefined` | `directives/router_outlet.spec.ts` の `describe('component input binding')`（201 行目）› 260・335・486 行目ほか |
| 3 節 `withExperimentalPlatformNavigation` | `with_platform_navigation.spec.ts`（web の suite） |

### 手元で走らせた結果

../angular で `pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all` は `1170 specs, 0 failures`、PASSED でした（2026-11-21、8576f161ae4）。この章の約束に当たる describe だけを `--test_arg=--filter=` で絞った結果は[第 9 回](09-rmd-tests-issues.md)の表にまとめます。

### 直すとしたら

- 7 節は doc コメントだけです。provide\_router.ts の 647 行目を「パスの代わりに URL の fragment に経路を入れる location strategy を provide する」のように変えます。`HashLocationStrategy` の動きを固める it は packages/common にあるので、router の側に足すなら `bootstrap.spec.ts` などに「`withHashLocation()` で `Location.path()` が `#` の後ろから読まれる」を 1 本足す形です。
- 3 節は 213 行目の「`Location` strategy」を「`Location` の実装」に変え、222 行目に `*` を足し、239・244 行目の行末の空白を消します。
- 8 節の「`UrlTree` を返すと無視される」は、navigation\_errors.spec.ts の 158 行目の it の隣に、同じ形で `parseUrl('/error')` を返して `NavigationError` が出ることを確かめる it を足すと固まります。
- 9 節の doc の並びに resources を足すなら、provide\_router.ts の `withComponentInputBinding` の doc（817 行目から）と、directives/router\_outlet.spec.ts の 486 行目の it がすでに同じ順を確かめています。

## 聞かれそうな質問

**Q. withInMemoryScrolling() を引数なしで付けると、スクロールしますか？**

しません。`Scroll` イベントが流れ始めるだけです。デモで `ViewportScroller` は 1 回も呼ばれず、`scrollPositionRestoration` か `anchorScrolling` を渡したときだけ呼ばれました（2 節）。

**Q. withHashLocation にすると history API を使わなくなりますか？**

いいえ。`HashLocationStrategy.pushState` は `#` 付きの URL で `PlatformLocation.pushState` を呼び、それが `history.pushState` になります。647 行目の「instead of the history API」は実際の動きと合いません（7 節）。

**Q. withNavigationErrorHandler から UrlTree を返したら、リダイレクトになりますか？**

なりません。695〜696 行目のとおり無視され、`NavigationError` が出て Promise は reject です。`new RedirectCommand(tree)` で包むとリダイレクトになります（8 節のデモ）。

**Q. withComponentInputBinding で、query と resolver に同じキーがあったら？**

resolver が勝ちます。query → パス → data → resolver の順に後ろが強く、resources を使えばそれがさらに上です（9 節）。

**Q. withPreloading に自作のクラスを渡すときの注意は？**

実装が `useExisting` なので、そのクラスが注入できること（`providedIn: 'root'` か、別に provide してある）が要ります。556〜557 行目の doc はそこに触れていません（5 節）。

## 読み終えて

- provide\_router.ts の import の並びは、各 `withX` が値を置くトークンの一覧になっている。
- 引数なしの `withInMemoryScrolling()` は `Scroll` を出すだけで、スクロールはしない。
- `withHashLocation` の doc の「history API の代わりに」は言い過ぎで、実際は `#` 付きの URL で `pushState` する。
- `withNavigationErrorHandler` で効く戻り値は `RedirectCommand` だけ。`UrlTree` は無視される。
- `withComponentInputBinding` の優先順は doc のとおりで、その上に resources がある。

---

← 前: [Resolve・CanLoad・NavigationBehaviorOptions と型ガード](04-rmd-resolve-nav.md)  
次: [ルーターのイベントの説明文：EventType から stringifyEvent まで](06-rmd-events.md) →
