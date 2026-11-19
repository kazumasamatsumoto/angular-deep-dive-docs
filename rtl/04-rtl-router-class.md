[目次](../README.md) › [Router の読み残し：UrlTree と RouterState の小道具・provideRouter の残り・Router クラス・読み込みとガードを行で埋める](README.md) › 第 4 回 / 全 6 回

# Router クラスと Navigation の型：公開メソッドの残りと Navigation の各項目

> router.ts の未読の行（import と @Service、navigated・routeReuseStrategy・currentNavigation のフィールド、url・getCurrentNavigation・lastSuccessfulNavigation、dispose、navigate / navigateByUrl の Promise の約束と validateCommands、isActive の 3 通り）と、navigation\_transition.ts の Navigation・UrlCreationOptions の型と NavigationTransitions の宣言の前半。lastSuccessfulNavigation が書ける signal のまま返ることと、dispose のあとの events.subscribe() も確かめる。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-router-class)

---

`Router` クラスには、流れの章で通り過ぎた公開メンバーがまだ残っています。`url`・`getCurrentNavigation`・`lastSuccessfulNavigation`・`dispose`・`isActive` と、`navigate` / `navigateByUrl` の説明に書かれた約束です。この章では、それぞれが何を返し、どの値を読み、どのコミットで今の形になり、どの spec が固めているかを行で確かめます。後半は、`currentNavigation()` が返す `Navigation` 型の各項目と、それを持つ `NavigationTransitions` の宣言を読みます。

読む対象は `packages/router/src/router.ts` と `packages/router/src/navigation_transition.ts` の前半です（../angular、8576f161ae4）。`navigate` から `scheduleNavigation`・`handleNavigationRequest` までの流れは[navigate() から NavigationTransition まで](../router/07-router-navigation-request.md)に、その先のパイプラインは[ナビゲーションのパイプライン](../router/08-router-pipeline.md)にあり、ここでは繰り返しません。

1. [1. UrlTree・UrlSegment・ParamMap](01-rtl-url-tree.md)
2. [2. ActivatedRoute の Observable と継承](02-rtl-router-state.md)
3. [3. provideRouter と RouterModule の残り](03-rtl-provide-router.md)
4. **4. Router クラスと Navigation の型**（この章）
5. [5. 読み込み・事前読み込み・再利用・関数ガード](05-rtl-load-guard.md)
6. [6. spec と issue](06-rtl-tests-issues.md)

## 1. Router が頼っているもの：import と @Service

📄 `angular/packages/router/src/router.ts` L41–71 （▶ の行: 42, 44–46, 48, 50, 52, 58, 61–62, 65, 70–71）

```ts
41 │ import {NavigationBehaviorOptions, OnSameUrlNavigation, Routes} from './models';
42 ▶ import {
43 │   isBrowserTriggeredNavigation,
44 ▶   Navigation,
45 ▶   NavigationExtras,
46 ▶   NavigationTransitions,
47 │   RestoredState,
48 ▶   UrlCreationOptions,
49 │ } from './navigation_transition';
50 ▶ import {ROUTE_INJECTOR_CLEANUP} from './route_injector_cleanup';
51 │ 
52 ▶ import {RouteReuseStrategy} from './route_reuse_strategy';
53 │ 
54 │ import {ROUTER_CONFIGURATION} from './router_config';
55 │ import {ROUTES} from './router_config_loader';
56 │ import {RouterState} from './router_state';
57 │ import {Params} from './shared';
58 ▶ import {StateManager} from './statemanager/state_manager';
59 │ import {UrlHandlingStrategy} from './url_handling_strategy';
60 │ import {
61 ▶   containsTree,
62 ▶   exactMatchOptions,
63 │   IsActiveMatchOptions,
64 │   isUrlTree,
65 ▶   subsetMatchOptions,
66 │   UrlSegmentGroup,
67 │   UrlSerializer,
68 │   UrlTree,
69 │ } from './url_tree';
70 ▶ import {validateConfig} from './utils/config';
71 ▶ import {afterNextNavigation} from './utils/navigations';
```

import を見ると、`Router` が自分では持たないものが分かります。42〜49 行目は navigation\_transition.ts から、`Navigation`・`NavigationExtras`・`UrlCreationOptions` の 3 つの型と、実際に移動を進める `NavigationTransitions`（46 行目）を取ります。58 行目の `StateManager` は URL と履歴の状態（[ブラウザの URL を更新する](../router/16-router-browser-url.md)）、50 行目の `ROUTE_INJECTOR_CLEANUP` は[次の回](05-rtl-load-guard.md)で読む注入器の後片付けです。61・62・65 行目の `containsTree`・`exactMatchOptions`・`subsetMatchOptions` は 6 節の `isActive` のためだけにあり、70 行目の `validateConfig` は `resetConfig` が、71 行目の `afterNextNavigation` は `scheduleNavigation` が使います。

📄 `angular/packages/router/src/router.ts` L73–91 （▶ の行: 77, 87–91）

```ts
73 │ /**
74 │  * @description
75 │  *
76 │  * A service that facilitates navigation among views and URL manipulation capabilities.
77 ▶  * This service is provided in the root scope and configured with [provideRouter](api/router/provideRouter).
78 │  *
79 │  * @see {@link Route}
80 │  * @see {@link provideRouter}
81 │  * @see [Routing and Navigation Guide](guide/routing/common-router-tasks).
82 │  *
83 │  * @ngModule RouterModule
84 │  *
85 │  * @publicApi
86 │  */
87 ▶ @Service()
88 ▶ export class Router {
89 ▶   private get currentUrlTree() {
90 ▶     return this.stateManager.getCurrentUrlTree();
91 ▶   }
```

87 行目の `@Service()` は、引数なしなら「root の注入器に自動で provide される」印で、`@Injectable({providedIn: 'root'})` の代わりです（中身は[provideRouter が並べる provider](../router/05-router-provide-router.md)と[@Injectable のコンパイル](../di/05-di-injectable-compile.md)）。77 行目の説明のとおり、`Router` 自身は root に自動で provide され、`provideRouter` は設定（`ROUTES` や `ROUTER_CONFIGURATION`）を足す側です。`ROUTES` が無いときの `config` は空の配列です（L162の `?? []`）。89〜91 行目の `currentUrlTree` は private の getter で、毎回 `StateManager` に聞きに行きます。`Router` 自身は今の URL を持っていません。

## 2. 公開のフィールド：navigated・routeReuseStrategy・currentNavigation

📄 `angular/packages/router/src/router.ts` L132–150 （▶ の行: 136, 141–142, 144, 147, 149）

```ts
132 │   /**
133 │    * True if at least one navigation event has occurred,
134 │    * false otherwise.
135 │    */
136 ▶   navigated: boolean = false;
137 │ 
138 │   /**
139 │    * A strategy for re-using routes.
140 │    *
141 ▶    * @deprecated Configure using `providers` instead:
142 ▶    *   `{provide: RouteReuseStrategy, useClass: MyStrategy}`.
143 │    */
144 ▶   routeReuseStrategy: RouteReuseStrategy = inject(RouteReuseStrategy);
145 │ 
146 │   /** @internal */
147 ▶   readonly injectorCleanup = inject(ROUTE_INJECTOR_CLEANUP, {optional: true});
148 │ 
149 ▶   // TODO: Consider exposing releaseUnusedRouteInjectors as a public API
150 │ 
```

136 行目の `navigated` は「一度でもナビゲーションのイベントが起きたか」です。`true` にする行は `subscribeToNavigationEvents` の中（`NavigationEnd` と、リダイレクトと割り込み以外の `NavigationCancel`。[パイプライン](../router/08-router-pipeline.md)の 6 節）、`false` に戻す行は `resetConfig`（L401）です。この値は「同じ URL なら飛ばす」判定の `!router.navigated`（[navigate() から NavigationTransition まで](../router/07-router-navigation-request.md)の 6 節）と、`RouterLinkActive` の `update` の先頭（directives/router\_link\_active.ts L229）に効きます。そのため `resetConfig` を呼ぶと、次の同じ URL への移動は飛ばされずに走ります。DEMO の「resetConfig と同じ URL」で確かめます。

141〜144 行目の `routeReuseStrategy` は、注入した `RouteReuseStrategy` を公開のフィールドとして持つだけです。`@deprecated` で「`providers` で替える」ことを勧めていますが、フィールドに代入すれば今も効きます。読むのは注入した値ではなくこのフィールドで、パイプラインの `createRouterState`（navigation\_transition.ts L752）と `ActivateRoutes`（L804）が `router.routeReuseStrategy` を、L212の `injectorCleanup` の呼び出しが `this.routeReuseStrategy` を渡します。147 行目の `injectorCleanup` は `@internal` で、`withAutoCleanupInjectors()` を付けたときだけ値が入ります（`optional: true`）。149 行目の TODO は、その後片付けを公開の API にするかを決めていない、という印です。

📄 `angular/packages/router/src/router.ts` L171–178 （▶ の行: 173, 175, 177）

```ts
171 │ 
172 │   /**
173 ▶    * Signal of the current `Navigation` object when the router is navigating, and `null` when idle.
174 │    *
175 ▶    * Note: The current navigation becomes to null after the NavigationEnd event is emitted.
176 │    */
177 ▶   readonly currentNavigation = this.navigationTransitions.currentNavigation.asReadonly();
178 │ 
```

177 行目の `currentNavigation` は、`NavigationTransitions` が持つ書ける signal を `asReadonly()` で包んだものです。`set` も `update` もありません。175 行目の「`NavigationEnd` のあとで `null` になる」は、パイプラインの `finalize` で `currentNavigation.set(null)` する行（[パイプライン](../router/08-router-pipeline.md)の 4 節）のことです。この signal は 687c374826c（2025-08-05、#63011）で足されました。一度 d00b3fed584 で入り、ddf779e18fc で戻されてから入り直しています。

## 3. url・getCurrentNavigation・lastSuccessfulNavigation

📄 `angular/packages/router/src/router.ts` L358–381 （▶ の行: 360–361, 368, 370–371, 378–379）

```ts
358 │ 
359 │   /** The current URL. */
360 ▶   get url(): string {
361 ▶     return this.serializeUrl(this.currentUrlTree);
362 │   }
363 │ 
364 │   /**
365 │    * Returns the current `Navigation` object when the router is navigating,
366 │    * and `null` when idle.
367 │    *
368 ▶    * @deprecated 20.2 Use the `currentNavigation` signal instead.
369 │    */
370 ▶   getCurrentNavigation(): Navigation | null {
371 ▶     return untracked(this.navigationTransitions.currentNavigation);
372 │   }
373 │ 
374 │   /**
375 │    * The `Navigation` object of the most recent navigation to succeed and `null` if there
376 │    *     has not been a successful navigation yet.
377 │    */
378 ▶   get lastSuccessfulNavigation(): Signal<Navigation | null> {
379 ▶     return this.navigationTransitions.lastSuccessfulNavigation;
380 │   }
381 │ 
```

1. **url（360〜362 行目）**

   `serializeUrl(this.currentUrlTree)` です。プロパティを読むたびに `StateManager` の今の木を `UrlSerializer.serialize` で文字列にします。保存された文字列ではないので、`UrlSerializer` を替えれば形も変わります。今の木がいつ書き換わるかは[ブラウザの URL を更新する](../router/16-router-browser-url.md)にあります。
2. **getCurrentNavigation()（368〜372 行目）**

   中身は `untracked(this.navigationTransitions.currentNavigation)` の 1 行で、177 行目の signal と同じ値を返します。`untracked` なので、`computed` や `effect` の中で呼んでも依存になりません。368 行目で 20.2 から非推奨です。
3. **lastSuccessfulNavigation（378〜380 行目）**

   getter で、`NavigationTransitions` の signal をそのまま返します。型は `Signal<Navigation | null>` ですが、177 行目と違って `asReadonly()` を通していないので、返る物は書ける signal そのものです。DEMO の「2 つの signal」で、`typeof router.lastSuccessfulNavigation.set` は `'function'`、`currentNavigation.set` は `'undefined'` になります。

`lastSuccessfulNavigation` を signal にしたのは 4e0fc81491b（2025-08-08、#63057）です。本文は `BREAKING CHANGE: lastSuccessfulNavigation is now a signal and needs to be invoked` で、`ng update` の移行（`packages/core/schematics/migrations/router-last-successful-navigation`）が同じコミットに入っています。router.ts の差分は 378 行目の戻り値の型だけで、`asReadonly()` は足されていません。値を入れる行は、パイプラインの最後、`NavigationEnd` を流す直前の `this.lastSuccessfulNavigation.set(untracked(this.currentNavigation))`（[navigate() から NavigationTransition まで](../router/07-router-navigation-request.md)の 8 節の引用の上）で、`currentNavigation()` と同じオブジェクトが入ります。

## 4. dispose：何を止め、何を止めないか

📄 `angular/packages/router/src/router.ts` L403–423 （▶ の行: 405–406, 416–421）

```ts
403 │ 
404 │   /** @docs-private */
405 ▶   ngOnDestroy(): void {
406 ▶     this.dispose();
407 │   }
408 │ 
409 │   /** Disposes of the router. */
410 │   dispose(): void {
411 │     // We call `unsubscribe()` to release observers, as users may forget to
412 │     // unsubscribe manually when subscribing to `router.events`. We do not call
413 │     // `complete()` because it is unsafe; if someone subscribes using the `first`
414 │     // operator and the observable completes before emitting a value,
415 │     // RxJS will throw an error.
416 ▶     this._events.unsubscribe();
417 ▶     this.navigationTransitions.complete();
418 ▶     this.nonRouterCurrentEntryChangeSubscription?.unsubscribe();
419 ▶     this.nonRouterCurrentEntryChangeSubscription = undefined;
420 ▶     this.disposed = true;
421 ▶     this.eventsSubscription.unsubscribe();
422 │   }
423 │ 
```

1. **ngOnDestroy（405〜407 行目）**

   root の注入器が壊れるとき（アプリの `destroy()`）に呼ばれ、`dispose()` へ進みます。
2. **\_events.unsubscribe()（416 行目）**

   公開の `events`（L114の `Subject`）を `complete()` ではなく `unsubscribe()` します。411〜415 行目のコメントのとおり、`first()` で待っている利用者が値を受けずに完了するとエラーになるので、完了は流さず、購読者の配列を捨てるだけです。RxJS の `Subject` は `unsubscribe()` のあと `closed` になり、その後の `subscribe()` は `ObjectUnsubscribedError` を投げます（DEMO の「dispose」）。この行は 52a6710f54b（2024-12-28、#59327）で足されました。コミットの題は「complete router events」ですが、入った行は `unsubscribe()` です。
3. **navigationTransitions.complete()（417 行目）**

   L406の `this.transitions?.complete()` で、パイプラインの元の `BehaviorSubject` を完了させます。コンストラクタ（L182）の `setupNavigations(this).subscribe` はこれで終わります。
4. **履歴の購読を外し、disposed を立てる（418〜421 行目）**

   418〜419 行目で popstate の購読を外して `undefined` に戻します（712d8f41e86 で `?.` の形に短くした行）。420 行目の `disposed = true` を見るのは `scheduleNavigation` の先頭（L677〜679）で、そのあとの移動はすべて `Promise.resolve(false)` になります。421 行目は `NavigationTransitions.events` の購読（L194）を外します。

`setUpLocationChangeListener` は `??=`（L296）なので、`dispose` のあとにもう一度呼ぶと新しい購読ができます。router.spec.ts の `should be idempotent`（7 節）はこの振る舞いを固めています。コンストラクタの L184〜186のコメント（[パイプライン](../router/08-router-pipeline.md)の引用の中）は「壊されるときは `events` の subject が完了される」と書きますが、上のとおり完了されるのは `transitions` で、`events` は完了されません。

## 5. navigate と navigateByUrl の説明：Promise の約束

📄 `angular/packages/router/src/router.ts` L522–552 （▶ の行: 529–530, 548–550, 552）

````ts
522 │   /**
523 │    * Navigates to a view using an absolute route path.
524 │    *
525 │    * @param url An absolute path for a defined route. The function does not apply any delta to the
526 │    *     current URL.
527 │    * @param extras An object containing properties that modify the navigation strategy.
528 │    *
529 ▶    * @returns A Promise that resolves to 'true' when navigation succeeds,
530 ▶    * to 'false' when navigation fails, or is rejected on error.
531 │    *
532 │    * @usageNotes
533 │    *
534 │    * The following calls request navigation to an absolute path.
535 │    *
536 │    * ```ts
537 │    * router.navigateByUrl("/team/33/user/11");
538 │    *
539 │    * // Navigate without updating the URL
540 │    * router.navigateByUrl("/team/33/user/11", { skipLocationChange: true });
541 │    * ```
542 │    *
543 │    * @see [Routing and Navigation guide](guide/routing/common-router-tasks)
544 │    *
545 │    */
546 │   navigateByUrl(
547 │     url: string | UrlTree,
548 ▶     extras: NavigationBehaviorOptions = {
549 ▶       skipLocationChange: false,
550 ▶     },
551 │   ): Promise<boolean> {
552 ▶     const urlTree = isUrlTree(url) ? url : this.parseUrl(url);
````

📄 `angular/packages/router/src/router.ts` L558–594 （▶ の行: 570–572, 590, 592–593）

````ts
558 │   /**
559 │    * Navigate based on the provided array of commands and a starting point.
560 │    * If no starting route is provided, the navigation is absolute.
561 │    *
562 │    * @param commands An array of URL fragments with which to construct the target URL.
563 │    * If the path is static, can be the literal URL string. For a dynamic path, pass an array of path
564 │    * segments, followed by the parameters for each segment.
565 │    * The fragments are applied to the current URL or the one provided  in the `relativeTo` property
566 │    * of the options object, if supplied.
567 │    * @param extras An options object that determines how the URL should be constructed or
568 │    *     interpreted.
569 │    *
570 ▶    * @returns A Promise that resolves to `true` when navigation succeeds, or `false` when navigation
571 ▶    *     fails. The Promise is rejected when an error occurs if `resolveNavigationPromiseOnError` is
572 ▶    * not `true`.
573 │    *
574 │    * @usageNotes
575 │    *
576 │    * The following calls request navigation to a dynamic route path relative to the current URL.
577 │    *
578 │    * ```ts
579 │    * router.navigate(['team', 33, 'user', 11], {relativeTo: route});
580 │    *
581 │    * // Navigate without updating the URL, overriding the default behavior
582 │    * router.navigate(['team', 33, 'user', 11], {relativeTo: route, skipLocationChange: true});
583 │    * ```
584 │    *
585 │    * @see [Routing and Navigation guide](guide/routing/common-router-tasks)
586 │    *
587 │    */
588 │   navigate(
589 │     commands: readonly any[],
590 ▶     extras: NavigationExtras = {skipLocationChange: false},
591 │   ): Promise<boolean> {
592 ▶     validateCommands(commands);
593 ▶     return this.navigateByUrl(this.createUrlTree(commands, extras), extras);
594 │   }
````

529〜530 行目の `navigateByUrl` は「成功で `true`、失敗で `false`、エラーで reject」とだけ書き、570〜572 行目の `navigate` は「`resolveNavigationPromiseOnError` が `true` でなければ reject」と書き足しています。593 行目のとおり `navigate` は `navigateByUrl` を呼ぶだけなので、この設定は両方に効きます（読む行はパイプラインの `catchError`、L982の `this.options.resolveNavigationPromiseOnError`）。548〜550 行目と 590 行目の既定値 `{skipLocationChange: false}` は、引数を省いたときだけ使われます。593 行目は同じ `extras` を `createUrlTree` と `navigateByUrl` の両方に渡すので、`queryParams` や `relativeTo` も `Navigation.extras` に残ります（DEMO の「navigate」の `extras` の行）。

592 行目の `validateCommands` は、`commands` の中の `null` / `undefined` を NG04008 の `RuntimeError` として**同期で投げます**（中身は[navigate() から NavigationTransition まで](../router/07-router-navigation-request.md)の 1 節）。Promise の reject ではないので、`navigate(...).catch()` では受けられません。DEMO の「validateCommands のエラー」は `try / catch` で受けて、`code` と `message` を表に出します。このページは本番ビルドなので、message は L731の `ngDevMode &&` が落ちて、番号だけになります。`[]` ではなく `readonly any[]`（589 行目）を受けるのは 2419060fef4（2025-03-12、#60345）からで、`validateCommands` 自体は 46cb04d575b（2016-12-12）からあります。

## 6. isActive：true / false / オブジェクトの 3 通り

📄 `angular/packages/router/src/router.ts` L615–645 （▶ の行: 619, 622–623, 625, 630, 634, 641–645）

```ts
615 │ 
616 │   /**
617 │    * Returns whether the url is activated.
618 │    *
619 ▶    * @deprecated
620 │    * Use `IsActiveMatchOptions` instead.
621 │    *
622 ▶    * - The equivalent `IsActiveMatchOptions` for `true` is
623 ▶    * `{paths: 'exact', queryParams: 'exact', fragment: 'ignored', matrixParams: 'ignored'}`.
624 │    * - The equivalent for `false` is
625 ▶    * `{paths: 'subset', queryParams: 'subset', fragment: 'ignored', matrixParams: 'ignored'}`.
626 │    */
627 │   isActive(url: string | UrlTree, exact: boolean): boolean;
628 │   /**
629 │    * @see {@link isActive}
630 ▶    * @deprecated 21.1 - Use the `isActive` function instead.
631 │    */
632 │   isActive(url: string | UrlTree, matchOptions: Partial<IsActiveMatchOptions>): boolean;
633 │   /** @internal */
634 ▶   isActive(url: string | UrlTree, matchOptions: boolean | IsActiveMatchOptions): boolean;
635 │   /**
636 │    * @deprecated 21.1 - Use the `isActive` function instead.
637 │    * @see {@link isActive}
638 │    */
639 │   isActive(url: string | UrlTree, matchOptions: boolean | Partial<IsActiveMatchOptions>): boolean {
640 │     let options: IsActiveMatchOptions;
641 ▶     if (matchOptions === true) {
642 ▶       options = {...exactMatchOptions};
643 ▶     } else if (matchOptions === false) {
644 ▶       options = {...subsetMatchOptions};
645 ▶     } else {
```

オーバーロードは 3 つです。627 行目の `boolean` 版は 619 行目で非推奨（版の番号なし）で、632 行目のオブジェクト版も 630 行目で 21.1 から「`isActive` 関数を使う」になりました（関数の方は[第 1 回](01-rtl-url-tree.md)）。634 行目は `@internal` の、両方を受ける形です。641〜644 行目で、`true` は `exactMatchOptions` のコピー、`false` は `subsetMatchOptions` のコピーにし、645 行目の `else` の先（L646）で、オブジェクトは `subsetMatchOptions` の上に重ねます。622〜625 行目の説明の値は、url\_tree.ts の 2 つの定数（L87〜92・L98〜103）と同じです。オブジェクト版は「書かなかった項目は subset」になるので、`{paths: 'exact'}` は `queryParams` を subset で比べます。比べる本体の `containsTree` は[RouterLinkActive の判定](../router/18-router-link-active.md)にあります。

## 7. Navigation の型：各項目はどこで入るか

📄 `angular/packages/router/src/navigation_transition.ts` L227–250 （▶ の行: 230, 235, 237–238, 240–242, 245–247）

```ts
227 │ /**
228 │  * Information about a navigation operation.
229 │  * Retrieve the most recent navigation object with the
230 ▶  * [Router.currentNavigation() method](api/router/Router#currentNavigation) .
231 │  *
232 │  * * *id* : The unique identifier of the current navigation.
233 │  * * *initialUrl* : The target URL passed into the `Router#navigateByUrl()` call before navigation.
234 │  * This is the value before the router has parsed or applied redirects to it.
235 ▶  * * *extractedUrl* : The initial target URL after being parsed with `UrlSerializer.extract()`.
236 │  * * *finalUrl* : The extracted URL after redirects have been applied.
237 ▶  * This URL may not be available immediately, therefore this property can be `undefined`.
238 ▶  * It is guaranteed to be set after the `RoutesRecognized` event fires.
239 │  * * *trigger* : Identifies how this navigation was triggered.
240 ▶  * -- 'imperative'--Triggered by `router.navigateByUrl` or `router.navigate`.
241 ▶  * -- 'popstate'--Triggered by a popstate event.
242 ▶  * -- 'hashchange'--Triggered by a hashchange event.
243 │  * * *extras* : A `NavigationExtras` options object that controlled the strategy used for this
244 │  * navigation.
245 ▶  * * *previousNavigation* : The previously successful `Navigation` object. Only one previous
246 ▶  * navigation is available, therefore this previous `Navigation` object has a `null` value for its
247 ▶  * own `previousNavigation`.
248 │  *
249 │  * @publicApi
250 │  */
```

📄 `angular/packages/router/src/navigation_transition.ts` L251–282 （▶ の行: 255, 260, 262, 264, 270, 274, 276, 280, 282）

```ts
251 │ export interface Navigation {
252 │   /**
253 │    * The unique identifier of the current navigation.
254 │    */
255 ▶   id: number;
256 │   /**
257 │    * The target URL passed into the `Router#navigateByUrl()` call before navigation. This is
258 │    * the value before the router has parsed or applied redirects to it.
259 │    */
260 ▶   initialUrl: UrlTree;
261 │   /**
262 ▶    * The initial target URL after being parsed with `UrlHandlingStrategy.extract()`.
263 │    */
264 ▶   extractedUrl: UrlTree;
265 │   /**
266 │    * The extracted URL after redirects have been applied.
267 │    * This URL may not be available immediately, therefore this property can be `undefined`.
268 │    * It is guaranteed to be set after the `RoutesRecognized` event fires.
269 │    */
270 ▶   finalUrl?: UrlTree;
271 │   /**
272 │    * `UrlTree` to use when updating the browser URL for the navigation when `extras.browserUrl` is
273 │    * defined.
274 ▶    * @internal
275 │    */
276 ▶   readonly targetBrowserUrl?: UrlTree | string;
277 │   /**
278 │    * TODO(atscott): If we want to make StateManager public, they will need access to this. Note that
279 │    * it's already eventually exposed through router.routerState.
280 ▶    * @internal
281 │    */
282 ▶   targetRouterState?: RouterState;
```

📄 `angular/packages/router/src/navigation_transition.ts` L283–311 （▶ の行: 286, 291, 297, 303, 305–306, 308, 311）

```ts
283 │   /**
284 │    * Identifies how this navigation was triggered.
285 │    */
286 ▶   trigger: NavigationTrigger;
287 │   /**
288 │    * Options that controlled the strategy used for this navigation.
289 │    * See `NavigationExtras`.
290 │    */
291 ▶   extras: NavigationExtras;
292 │   /**
293 │    * The previously successful `Navigation` object. Only one previous navigation
294 │    * is available, therefore this previous `Navigation` object has a `null` value
295 │    * for its own `previousNavigation`.
296 │    */
297 ▶   previousNavigation: Navigation | null;
298 │ 
299 │   /**
300 │    * Aborts the navigation if it has not yet been completed or reached the point where routes are being activated.
301 │    * This function is a no-op if the navigation is beyond the point where it can be aborted.
302 │    */
303 ▶   readonly abort: () => void;
304 │ 
305 ▶   /** @internal */
306 ▶   routesRecognizeHandler: {deferredHandle?: Promise<void>};
307 │   /** @internal */
308 ▶   beforeActivateHandler: {deferredHandle?: Promise<void>};
309 │ }
310 │ 
311 ▶ const noop = () => {};
```

| 項目（行） | 入れる行 | 中身 |
| --- | --- | --- |
| `id`（255） | L426の `++this.navigationId` | Router ごとの通し番号。リダイレクトは新しい番号になる |
| `initialUrl`（260） | L483の `t.rawUrl` | `navigateByUrl` が `UrlHandlingStrategy.merge` したあとの木 |
| `extractedUrl`（264） | L434の `urlHandlingStrategy.extract` | 処理する部分だけの木。既定の戦略では `initialUrl` と同じ |
| `finalUrl`（270） | recognize のあとの `tap`、L559〜560 | リダイレクトのあとの木。それまで `undefined` |
| `targetBrowserUrl`（276、internal） | L485〜488 | `extras.browserUrl` が文字列なら parse した木 |
| `trigger`（286） | L489の `t.source` | `'imperative'` / `'popstate'` / `'hashchange'` |
| `extras`（291） | L490 | 渡した `extras` のオブジェクトそのもの |
| `previousNavigation`（297） | L491〜496 | 直前に成功した `Navigation` を浅くコピーし、その `previousNavigation` を `null` にしたもの |
| `abort`（303） | L497、成功で L822の `noop` | `AbortController.abort()` を呼ぶ関数 |

245〜247 行目と 293〜296 行目の「前の Navigation は 1 つだけ」は、L494〜495で `...lastSuccessfulNavigation` を広げてから `previousNavigation: null` を書く行のことです。2 つ前は辿れません。235 行目は `extractedUrl` を「`UrlSerializer.extract()` で parse した」と書きますが、`UrlSerializer` に `extract` はありません。262 行目の `UrlHandlingStrategy.extract()` が正しく、origin/main では 81389f21b9d（2026-09-18）が 235 行目を 262 行目と同じ言い方に直しています。274・280 行目の `@internal` の 2 つと、305〜308 行目の 2 つのハンドラは公開の型から外れます。280 行目の TODO は「`StateManager` を公開するならこれも要る」です。

## 8. UrlCreationOptions と NavigationTransitions の宣言

📄 `angular/packages/router/src/navigation_transition.ts` L161–195 （▶ の行: 168, 171, 176–177, 180–181, 184, 191, 194）

````ts
161 │ 
162 │   /**
163 │    * How to handle query parameters in the router link for the next navigation.
164 │    * One of:
165 │    * * `preserve` : Preserve current parameters.
166 │    * * `merge` : Merge new with current parameters.
167 │    *
168 ▶    * The "preserve" option discards any new query params:
169 │    * ```ts
170 │    * // from /view1?page=1 to/view2?page=1
171 ▶    * router.navigate(['/view2'], { queryParams: { page: 2 },  queryParamsHandling: "preserve"
172 │    * });
173 │    * ```
174 │    * The "merge" option appends new query params to the params from the current URL:
175 │    * ```ts
176 ▶    * // from /view1?page=1 to/view2?page=1&otherKey=2
177 ▶    * router.navigate(['/view2'], { queryParams: { otherKey: 2 },  queryParamsHandling: "merge"
178 │    * });
179 │    * ```
180 ▶    * In case of a key collision between current parameters and those in the `queryParams` object,
181 ▶    * the new value is used.
182 │    *
183 │    */
184 ▶   queryParamsHandling?: QueryParamsHandling | null;
185 │ 
186 │   /**
187 │    * When true, preserves the URL fragment for the next navigation
188 │    *
189 │    * ```ts
190 │    * // Preserve fragment from /results#top to /view#top
191 ▶    * router.navigate(['/view'], { preserveFragment: true });
192 │    * ```
193 │    */
194 ▶   preserveFragment?: boolean;
195 │ }
````

`UrlCreationOptions` の後半です（前半の `relativeTo`・`queryParams`・`fragment` は[navigate() から NavigationTransition まで](../router/07-router-navigation-request.md)の 2 節）。168〜172 行目の `'preserve'` は新しい `queryParams` を捨て、176〜177 行目の `'merge'` は今の値に重ね、180〜181 行目のとおり同じキーは新しい値が勝ちます。191 行目の `preserveFragment` は今の URL の `#` を引き継ぎます。これを読むのは `Router.createUrlTree` の前半（[createUrlTree の章](../router/03-router-create-url-tree.md)の 2 節）で、`merge` のあと `removeEmptyProps` が `null` / `undefined` の値を消します。DEMO の「createUrlTree」で `q: null` が消えることを確かめます（このサイトの 22.2.6 には origin/main の 2dd93cd949b が入っていて、`removeEmptyProps` は無く、同じことを create\_url\_tree.ts の `tree()` がします）。

📄 `angular/packages/router/src/navigation_transition.ts` L338–349 （▶ の行: 339, 341, 343, 345–346, 348–349）

```ts
338 │ 
339 ▶ export const NAVIGATION_ERROR_HANDLER = new InjectionToken<
340 │   (error: NavigationError) => unknown | RedirectCommand
341 ▶ >(typeof ngDevMode === 'undefined' || ngDevMode ? 'navigation error handler' : '');
342 │ 
343 ▶ @Service()
344 │ export class NavigationTransitions {
345 ▶   // Some G3 targets expect the navigation object to be mutated (and not getting a new reference on changes).
346 ▶   currentNavigation = signal<Navigation | null>(null, {equal: () => false});
347 │ 
348 ▶   currentTransition: NavigationTransition | null = null;
349 ▶   lastSuccessfulNavigation = signal<Navigation | null>(null);
```

346 行目の `currentNavigation` は `equal: () => false` で、同じオブジェクトを `set` / `update` しても毎回知らせます。345 行目のコメントのとおり、Google の中のコードが「同じオブジェクトが書き換わる」ことに頼っているので、`finalUrl` などは新しいオブジェクトを作らずに書き足します（L559〜560）。349 行目の `lastSuccessfulNavigation` は既定の比較の signal です。348 行目の `currentTransition` は signal ではない普通のフィールドで、`Router` の `subscribeToNavigationEvents`（L196）が読みます。339〜341 行目の `NAVIGATION_ERROR_HANDLER` は `withNavigationErrorHandler` が入れるトークンで、本番では名前が空になります。

📄 `angular/packages/router/src/navigation_transition.ts` L360–377 （▶ の行: 360, 366, 368–370, 373–374）

```ts
360 ▶   private readonly configLoader = inject(RouterConfigLoader);
361 │   private readonly environmentInjector = inject(EnvironmentInjector);
362 │   private readonly destroyRef = inject(DestroyRef);
363 │   private readonly urlSerializer = inject(UrlSerializer);
364 │   private readonly rootContexts = inject(ChildrenOutletContexts);
365 │   private readonly location = inject(Location);
366 ▶   private readonly inputBindingEnabled = inject(INPUT_BINDER, {optional: true}) !== null;
367 │   private readonly titleStrategy?: TitleStrategy = inject(TitleStrategy);
368 ▶   private readonly options = inject(ROUTER_CONFIGURATION, {optional: true}) || {};
369 ▶   private readonly paramsInheritanceStrategy =
370 ▶     this.options.paramsInheritanceStrategy || DEFAULT_PARAMS_INHERITANCE_STRATEGY;
371 │   private readonly urlHandlingStrategy = inject(UrlHandlingStrategy);
372 │   private readonly createViewTransition = inject(CREATE_VIEW_TRANSITION, {optional: true});
373 ▶   private readonly navigationErrorHandler = inject(NAVIGATION_ERROR_HANDLER, {optional: true});
374 ▶   private readonly routerResourcesFeature = inject(ROUTER_RESOURCES_FEATURE, {
375 │     optional: true,
376 │   });
377 │ 
```

`NavigationTransitions` が注入するものの並びです。360 行目の `RouterConfigLoader` は[次の回](05-rtl-load-guard.md)、366 行目の `INPUT_BINDER` は `withComponentInputBinding` の有無、369〜370 行目の `paramsInheritanceStrategy` は[第 2 回](02-rtl-router-state.md)の継承の既定です。368 行目の `options` は `Router` の L100と同じ `ROUTER_CONFIGURATION` を別々に注入しているので、同じ設定を 2 つのクラスがそれぞれ読みます。

> **🧪 DEMO — 別のアプリの Router の公開メソッドを呼ぶ**
>
> 最初にボタンを押したとき、`createApplication` でこのサイトとは別のアプリを作り、`provideRouter` の本物の Router（@angular/router 22.2.6）を動かします。ルートは `''`・`'a'`・`'b/:id'`・`'redirect'`（canActivate が `parseUrl('/a')` を返す）です。`PlatformLocation` は「URL を配列に積むだけ」の偽物、Router が警告を書く `ɵConsole` は「記録するだけ」の物に替えているので、このページの URL・履歴・コンソールは変わりません。毎回 `'/b/1?q=x'` に戻してから始めます（その移動は表に出しません）。「dispose」のあとは、次に押したときに作り直します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-router-class)

> [!NOTE]
> **ポイント**
>
> 「navigateByUrl（リダイレクトあり）」では、NavigationStart の時点の `id` と、終わったあとの `lastSuccessfulNavigation().id` が 1 つずれます。ガードが返した UrlTree は新しいナビゲーション（新しい `id`、`trigger` は `'imperative'`）になり、元の Promise をそのまま引き継ぐからです（[ガードの章](../router/12-router-guards.md)の 6 節）。`extras.info` の `'demo'` は、L222の行で次のナビゲーションへ運ばれます。「parseUrl」の 2 つ目は `DefaultUrlSerializer` が NG04010（`UNPARSABLE_URL`、閉じていない括弧。22.2.6 を Node で parse して確かめた）を投げ、`parseUrl`（L601〜614）が `console.warn` して `'/'` を返す道です。本番ビルドなので、記録される文字列は番号の `NG04018` だけです。

## テストと直し方

### spec と it

| ファイル（packages/router/test/） | describe › it（行） | 確かめていること | この章 |
| --- | --- | --- | --- |
| `router.spec.ts` | `Router`（29）› `resetConfig`（30）› 37 | `resetConfig` が配列と Route を浅くコピーする（`standardizeConfig`） | 2 節 |
| `router.spec.ts` | `setUpLocationChangeListener`（88）› 93 `should be idempotent` | 2 回呼んでも同じ購読、`dispose` のあとは新しい購読 | 4 節 |
| `router.spec.ts` | `parseUrl`（111）› 116 | parse に失敗すると警告して `'/'` | DEMO |
| `integration/integration.spec.ts` | 766 `should properly set currentNavigation when cancelling in-flight navigations`・790 `should set LastSuccessfulNavigation` | 2 つの signal の値の移り変わり | 2・3 節 |
| `integration/router_events.spec.ts` | 107 `should stop emitting events after the router is destroyed`・128 `should resolve navigation promise with false after the router is destroyed` | dispose の前に購読した人に流れない、dispose のあとの Promise が `false` | 4 節 |
| `integration/navigation_errors.spec.ts` | 430 `should throw an error when one of the commands is null/undefined` | `validateCommands` が同期で投げる | 5 節 |
| `router_navigation_extras.spec.ts` | 18（L52） | リダイレクトのあとも `getCurrentNavigation()?.extras.replaceUrl` が残る | 7 節 |

📄 `angular/packages/router/test/integration/integration.spec.ts` L790–804 （▶ の行: 795, 798–799, 802–803）

```ts
790 │     it('should set LastSuccessfulNavigation', async () => {
791 │       const router: Router = TestBed.inject(Router);
792 │       const fixture = TestBed.createComponent(RootCmp);
793 │       router.resetConfig([{path: 'user/:name', component: UserCmp}]);
794 │ 
795 ▶       expect(router.lastSuccessfulNavigation()).toBe(null);
796 │ 
797 │       router.navigateByUrl('/user/init');
798 ▶       const navigation = router.currentNavigation();
799 ▶       expect(router.lastSuccessfulNavigation()).toBe(null);
800 │       await advance(fixture);
801 │ 
802 ▶       expect(router.currentNavigation()).toBe(null);
803 ▶       expect(router.lastSuccessfulNavigation()).toEqual(navigation);
804 │     });
```

795 行目で最初は `null`、798 行目で移動の途中の `currentNavigation()` を取り、803 行目で終わったあとの `lastSuccessfulNavigation()` と比べます。比べ方は `toEqual`（中身が同じ）で、3 節で書いた「同じオブジェクトが入る」は `toBe` にしても通る強さですが、spec はそこまで固めていません。

📄 `angular/packages/router/test/integration/navigation_errors.spec.ts` L430–439 （▶ の行: 436–437）

```ts
430 │   it('should throw an error when one of the commands is null/undefined', async () => {
431 │     const router = TestBed.inject(Router);
432 │     await createRoot(router, RootCmp);
433 │ 
434 │     router.resetConfig([{path: 'query', component: EmptyQueryParamsCmp}]);
435 │ 
436 ▶     expect(() => router.navigate([undefined, 'query'])).toThrowError(
437 ▶       /The requested path contains undefined segment at index 0/,
438 │     );
439 │   });
```

📄 `angular/packages/router/test/router.spec.ts` L37–68 （▶ の行: 51, 57–58, 63–64）

```ts
37 │     it('should copy config to avoid mutations of user-provided objects', () => {
38 │       const r: Router = TestBed.inject(Router);
39 │       const configs: Routes = [
40 │         {
41 │           path: 'a',
42 │           component: TestComponent,
43 │           children: [
44 │             {path: 'b', component: TestComponent},
45 │             {path: 'c', component: TestComponent},
46 │           ],
47 │         },
48 │       ];
49 │       const children = configs[0].children!;
50 │ 
51 ▶       r.resetConfig(configs);
52 │ 
53 │       const rConfigs = r.config;
54 │       const rChildren = rConfigs[0].children!;
55 │ 
56 │       // routes array and shallow copy
57 ▶       expect(configs).not.toBe(rConfigs);
58 ▶       expect(configs[0]).not.toBe(rConfigs[0]);
59 │       expect(configs[0].path).toBe(rConfigs[0].path);
60 │       expect(configs[0].component).toBe(rConfigs[0].component);
61 │ 
62 │       // children should be new array and routes shallow copied
63 ▶       expect(children).not.toBe(rChildren);
64 ▶       expect(children[0]).not.toBe(rChildren[0]);
65 │       expect(children[0].path).toBe(rChildren[0].path);
66 │       expect(children[1]).not.toBe(rChildren[1]);
67 │       expect(children[1].path).toBe(rChildren[1].path);
68 │     });
```

📄 `angular/packages/router/test/router.spec.ts` L111–133 （▶ の行: 120, 127, 130–131）

```ts
111 │   describe('parseUrl', () => {
112 │     beforeEach(() => {
113 │       TestBed.configureTestingModule({imports: [RouterModule.forRoot([])]});
114 │     });
115 │ 
116 │     it('should log a warning and fall back to "/" when parsing fails', () => {
117 │       const router: Router = TestBed.inject(Router);
118 │       const urlSerializer: UrlSerializer = TestBed.inject(UrlSerializer);
119 │       const console: Console = TestBed.inject(Console);
120 ▶       spyOn(urlSerializer, 'parse').and.callFake((url: string) => {
121 │         if (url === 'invalid-url') {
122 │           throw new Error('test error');
123 │         }
124 │         // The fallback call should not be mocked
125 │         return new DefaultUrlSerializer().parse(url);
126 │       });
127 ▶       const spy = spyOn(console, 'warn');
128 │ 
129 │       const result = router.parseUrl('invalid-url');
130 ▶       expect(spy.calls.argsFor(0)).toMatch(/Error parsing URL/);
131 ▶       expect(result).toEqual(new DefaultUrlSerializer().parse('/'));
132 │     });
133 │   });
```

436〜437 行目は message の正規表現まで見るので、開発モードで走る spec ならではの確かめ方です。本番の message（DEMO の番号だけの形）は spec の外です。37〜68 行目の `resetConfig` の it は、コピーされることだけを見ていて、`navigated` が `false` に戻ること（L401）は見ていません。130 行目は `argsFor(0)` を `/Error parsing URL/` で見るので、これも開発モードの文字列に頼っています。

### 走らせた結果

📄 `走らせたコマンドと結果（2026-11-20、8576f161ae4）`

```
$ cd <8576f161ae4 の作業木>             # angular-fix から worktree add
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=errors \
    "--test_arg=--filter=^Router (resetConfig|resetRootComponentType|setUpLocationChangeListener|parseUrl) "
Ran 4 of 1170 specs、0 failures
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=errors \
    "--test_arg=--filter=should set LastSuccessfulNavigation|should properly set currentNavigation when cancelling"
Ran 4 of 1170 specs、0 failures（2 本 × navigation / history）
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=errors \
    "--test_arg=--filter=should throw an error when one of the commands is null"
Ran 2 of 1170 specs、0 failures
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=errors \
    "--test_arg=--filter=should stop emitting events after the router is destroyed|should resolve navigation promise with false after the router is destroyed"
Ran 4 of 1170 specs、0 failures
（フィルタなしの全体は 1170 specs, 0 failures）
```

`--filter` は jasmine の正規表現で、describe と it の名前をつないだ全体に当てます。integration の spec は `navigation` と `history` の 2 回登録されるので、数が倍になります（[前のシリーズの最終回](../rdir/06-rdir-tests-issues.md)の 1 節）。

### spec が無いところと、足すなら

- `Router.isActive`（6 節）を直接呼ぶ spec は packages/router/test にありません（`grep -rn "\.isActive(" packages/router/test` で当たるのは `RouterLinkActive` と url\_tree.spec.ts の `isActive` 関数だけ）。足すなら router.spec.ts に `describe('isActive')` を作り、`true` / `false` / `{paths: 'exact'}` の 3 通りを、DEMO と同じ `'/b/1?q=x'` で確かめます。
- `dispose()` のあとの `router.events.subscribe()` が `ObjectUnsubscribedError` になること（4 節）を固める spec はありません。手元の作業木で router.spec.ts と同じ形の it を足し、`TestBed` で `provideRouter([])` の Router を `dispose()` してから `subscribe()` すると、`ObjectUnsubscribedError: object unsubscribed` になりました。
- `lastSuccessfulNavigation` が書ける signal であること（3 節）も、同じ作業木の it で `typeof (router.lastSuccessfulNavigation as any).set` が `'function'`、`currentNavigation` は `'undefined'` でした。`currentNavigation` と揃えるなら、直す場所は router.ts 378〜380 行目の getter（`.asReadonly()` を付けるか、177 行目のようにフィールドにする）で、spec は integration.spec.ts の 790 行目の it の隣です。

## ここまでの呼び出し

- 👤 `router.navigate(commands, extras)` — router.ts L588 — *同期で validateCommands*
  - `validateCommands(commands)` — router.ts L725 — *null / undefined なら NG04008 を投げる*
  - `createUrlTree(commands, extras)` — router.ts L472 — *UrlCreationOptions を読む*
  - `navigateByUrl(tree, extras)` — router.ts L546
    - `scheduleNavigation(...)` — router.ts L665 — *disposed なら Promise.resolve(false)*
      - `NavigationTransitions.handleNavigationRequest` — navigation\_transition.ts L409 — *id を振る*
        - `currentNavigation.set({id, initialUrl, extractedUrl, trigger, extras, previousNavigation, abort})` — L481
        - `lastSuccessfulNavigation.set(currentNavigation())` — L825 — *成功したときだけ*
        - `currentNavigation.set(null)` — L894 — *finalize*
- 👤 `router.dispose()` — router.ts L410 — *events を unsubscribe、transitions を complete*

## 聞かれそうな質問

**Q. `router.url` は、ナビゲーションの途中で読むと新しい URL ですか？**

360〜362 行目のとおり `StateManager` の今の木を文字列にするだけなので、木が書き換わる前なら古い URL です。書き換わるタイミングは `urlUpdateStrategy` で変わり（[ブラウザの URL を更新する](../router/16-router-browser-url.md)）、移動先を途中で知りたいなら `currentNavigation()?.extractedUrl`（264 行目）か `finalUrl`（270 行目）を読みます。

**Q. `getCurrentNavigation()` と `currentNavigation()` は何が違いますか？**

値は同じです（371 行目と 177 行目が同じ signal を読む）。違いは `untracked` の有無だけで、`getCurrentNavigation()` は computed や effect の中で呼んでも依存になりません。`getCurrentNavigation` は 368 行目で 20.2 から非推奨です。

**Q. リダイレクトされたナビゲーションの `previousNavigation` は何ですか？**

リダイレクトされる前のナビゲーションではなく、直前に**成功した**ナビゲーションです（297 行目、L491〜496）。リダイレクトの元は `NavigationCancel`（code が Redirect）で終わり、`lastSuccessfulNavigation` に入らないので、DEMO の「navigateByUrl（リダイレクトあり）」でも `previousNavigation.extractedUrl` は `/b/1?q=x` です。

**Q. `navigate(['/a', undefined])` を `.catch()` で受けられないのはなぜですか？**

592 行目の `validateCommands` が Promise を作る前に同期で投げるからです。`scheduleNavigation` にも届かないので、`currentNavigation()` も `null` のままです（DEMO）。

**Q. `dispose()` のあとに `navigate` すると何が起きますか？**

420 行目で立てた `disposed` を `scheduleNavigation` の先頭（L677〜679）が見て、`Promise.resolve(false)` を返します。イベントは流れず、`router.events.subscribe()` は 416 行目の `unsubscribe()` のせいで `ObjectUnsubscribedError` を投げます。

**Q. `isActive('/b', {paths: 'exact'})` の queryParams はどう比べられますか？**

645 行目の `else` の先の L646で `subsetMatchOptions` の上に重ねるので、書かなかった `queryParams` は `'subset'` です。`true` を渡したときの `'exact'` とは違います。

## 読み終えて

- `Router` は今の URL を持たず、`url` も `routerState` も `StateManager` に毎回聞く。移動を進めるのは `NavigationTransitions`。
- `currentNavigation` は `asReadonly()` の signal、`lastSuccessfulNavigation` は書ける signal をそのまま返す getter。中身は同じ `Navigation` オブジェクトで、`previousNavigation` は 1 段だけ。
- `dispose` は events を unsubscribe し（complete ではない）、transitions を complete し、以後の移動を `false` で返す。
- `navigate` は `validateCommands` で同期に投げ、同じ `extras` を URL の組み立てと移動の両方に渡す。
- `Navigation` の型の説明は 235 行目の `UrlSerializer.extract()` だけが実際と違い、origin/main で直っている。

---

← 前: [provideRouter と RouterModule の残り：RouterFeatures の型、初期ナビゲーションの組み合わせ、withX の doc と本番の動き](03-rtl-provide-router.md)  
次: [読み込み・事前読み込み・再利用・関数ガード：小さな関数を行で埋める](05-rtl-load-guard.md) →
