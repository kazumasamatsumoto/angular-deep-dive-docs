[目次](../README.md) › [Navigation API と FakeNavigation](README.md) › 第 5 回 / 全 7 回

# Router の連携の残り：reload・URL の比較・push と replace の時機

> navigation\_state\_manager.ts で、Router の章が通り過ぎた行。reload を intercept しない修正（dbd50be7f71）、ネイティブの URL で比べる修正（fe721868a6e）、push と replace の時機の調整（37598cf6fe8）、新しい本家のダウンロードを intercept しない修正（e09bbed21a7）や traverse 中のリダイレクトの修正（3320da96da2）。開いている #71596（巻き戻しで再読み込みになる）を行から読む。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/navx-router-integration)

---

`NavigationStateManager` の大筋（URL を変える場所、外から来た遷移を捕まえる場所、取り消しで戻す場所）は[Router の Navigation API の章](../router/21-router-platform-navigation.md)が 611 行のうち 421 行を引いて読みました。この章はその章が通り過ぎた行を読み、その行を変えた修正を 1 本ずつ `git show` で確かめます。reload を intercept しない・URL を部品ごとに比べる・push と replace の時機・戻る遷移のリダイレクト、そして開いている #71596（巻き戻しでページが読み込み直される）です。

読む対象は `packages/router/src/statemanager/navigation_state_manager.ts` の残りの行と、`packages/router/test/with_platform_navigation.spec.ts` です。新しい本家（../angular-main、74961c66242）にだけある修正は、差分として読みます。

1. [1. 型と PlatformNavigation](01-navx-api-types.md)
2. [2. FakeNavigation の navigate](02-navx-fake-navigate.md)
3. [3. 戻る・進む](03-navx-fake-traverse.md)
4. [4. precommitHandler](04-navx-precommit.md)
5. **5. Router の連携の残り**（この章）
6. [6. テストの土台](06-navx-testing.md)
7. [7. spec と issue](07-navx-tests-issues.md)

## 1. 外から来た遷移を Router に渡す Subject

📄 `angular/packages/router/src/statemanager/navigation_state_manager.ts` L94–112 （▶ の行: 101–104, 107–108, 110）

```ts
 94 │ 
 95 │   /**
 96 │    * Subject used to notify listeners (typically the `Router`) of URL/state changes
 97 │    * that were initiated outside the Angular Router but detected via the Navigation API's
 98 │    * `navigate` event (e.g., user clicking browser back/forward, or manual URL changes if
 99 │    * interceptable by the Navigation API).
100 │    */
101 ▶   private nonRouterCurrentEntryChangeSubject = new Subject<{
102 ▶     path: string;
103 ▶     state: RestoredState | null | undefined;
104 ▶     hasUAVisualTransition?: boolean;
105 │   }>();
106 │ 
107 ▶   nonRouterEntryChangeListener?: SubscriptionLike;
108 ▶   private get registered() {
109 │     return (
110 ▶       this.nonRouterEntryChangeListener !== undefined && !this.nonRouterEntryChangeListener.closed
111 │     );
112 │   }
```

101〜105 行目の Subject は、Router を通らずに起きた navigate イベント（素の `<a href>`、戻るボタン、`navigation.navigate()` の直接の呼び出し）を Router に知らせるための通り道です。流すのは「アプリの中のパス」「state」「ブラウザが自分で画面の切り替えの見た目を出したか（`hasUAVisualTransition`）」の 3 つ。購読するのは `registerNonRouterCurrentEntryChangeListener` で、その戻り値を 107 行目に覚えます（流す行と購読する行は Router の章の 2 節と 4 節）。

108〜112 行目の `registered` は「Router がもう聞いているか」です。110 行目で、購読があり、まだ閉じていないときだけ `true`。Router が `initialNavigation()` を呼ぶ前（起動の途中）に外から navigate が来ると、`handleNavigate` はこれが `false` なのを見て、遷移に変えずに片付けます（Router の章の 4 節）。

## 2. reload とダウンロードは intercept しない

📄 `angular/packages/router/src/statemanager/navigation_state_manager.ts` L390–396 （▶ の行: 392–395）

```ts
390 │     // If the event cannot be intercepted (e.g., cross-origin, or some browser-internal
391 │     // navigations), let the browser handle it.
392 ▶     // We also do not convert reload navigation events to SPA navigations. Intercepting
393 ▶     // would prevent the generally expected hard refresh. If an application wants special
394 ▶     // handling for reloads, they can implement it in their own `navigate` event listener.
395 ▶     if (!event.canIntercept || event.navigationType === 'reload') {
396 │       return;
```

📄 `git show dbd50be7f71（2026-01-26、fixes #66746、v21.2.0 から）`

```
@@ -239,8 +239,7 @@  maybeCreateNavigationForTransition
       (navigationEvent &&
-        (navigationEvent.navigationType === 'traverse' ||
-          navigationEvent.navigationType === 'reload') &&
+        navigationEvent.navigationType === 'traverse' &&
         this.eventAndRouterDestinationsMatch(navigationEvent, transition))
@@ -388,7 +387,10 @@  handleNavigate
-    if (!event.canIntercept) {
+    // We also do not convert reload navigation events to SPA navigations. Intercepting
+    // would prevent the generally expected hard refresh. If an application wants special
+    // handling for reloads, they can implement it in their own `navigate` event listener.
+    if (!event.canIntercept || event.navigationType === 'reload') {
       return;
     }
```

#66746 は「`withExperimentalPlatformNavigation` を付けると `ng serve` の自動の読み込み直しが効かない」という報告でした。開発サーバーのクライアント（Vite の client.mjs）は、ファイルが変わると `location.reload()` でページを読み込み直します。それも `navigationType: 'reload'` の navigate イベントになり、Router が intercept していました。intercept すると「同じ文書の中の遷移」になるので、ページは読み込み直されません。修正は 395 行目に `|| event.navigationType === 'reload'` を足し、`maybeCreateNavigationForTransition` の「同じ行き先なら新しい navigate を作らない」の条件から reload を外しました。392〜394 行目のコメントは「読み込み直しを特別に扱いたいアプリは、自分の navigate のリスナーで」。

📄 `git show e09bbed21a7（../angular-main、2026-10-23、fixes #71551）`

```
-    if (!event.canIntercept || event.navigationType === 'reload') {
+    // Downloads are left to the browser as well. Intercepting them would turn them into
+    // same-document navigations and the file would never be downloaded.
+    if (!event.canIntercept || event.navigationType === 'reload' || event.downloadRequest != null) {
       return;
     }
```

同じ行に、新しい本家でもう 1 つ条件が足されました。`<a href="/file.txt" download>` の navigate イベントは `downloadRequest` がファイル名（文字列）で、これも intercept すると同じ文書の中の遷移になり、ファイルが落ちてこない（#71551）。issue を出した人が自分で直した PR（#71552）で、22.2.x の枝にも入っています（6ccbb0f6aa7）。spec は本物の `window.navigation` を使う側（テストと直し方の節で読む `real platform navigation`）に足されたので、Node では走りません。

## 3. URL を部品ごとに比べる：eventAndRouterDestinationsMatch

📄 `angular/packages/router/src/statemanager/navigation_state_manager.ts` L551–578 （▶ の行: 555–556, 558–560, 563–564, 574–576）

```ts
551 │   private eventAndRouterDestinationsMatch(
552 │     navigateEvent: NavigateEvent,
553 │     transition: RouterNavigation,
554 │   ): boolean {
555 ▶     const internalPath = this.createBrowserPath(transition);
556 ▶     const eventDestination = new URL(navigateEvent.destination.url);
557 │     // this might be a path or an actual URL depending on the baseHref
558 ▶     const routerDestination = new URL(
559 ▶       this.location.prepareExternalUrl(internalPath),
560 ▶       eventDestination.origin,
561 │     );
562 │ 
563 ▶     eventDestination.searchParams.sort();
564 ▶     routerDestination.searchParams.sort();
565 │ 
566 │     const {pathname: destPathname, search: destSearch, hash: hashDest} = routerDestination;
567 │     const {
568 │       pathname: eventDestPathname,
569 │       search: eventDestSearch,
570 │       hash: eventDestHash,
571 │     } = eventDestination;
572 │ 
573 │     return (
574 ▶       destSearch === eventDestSearch &&
575 ▶       hashDest === eventDestHash &&
576 ▶       Location.stripTrailingSlash(destPathname) === Location.stripTrailingSlash(eventDestPathname)
577 │     );
578 │   }
```

この関数を呼ぶのは `maybeCreateNavigationForTransition` の 1 か所だけで、「intercept 中のイベントが traverse で、その行き先が Router の目的地と同じなら、新しい navigate を作らない」の「同じ」を決めます（Router の章の 3 節）。

1. **555 行目：Router の目的地を、Router の URL の文字列にする**

   `createBrowserPath` は `UrlSerializer` で直列化したパスです。558〜561 行目で `prepareExternalUrl`（`<base href>` を前に付ける）を通し、イベントの側のオリジンで `URL` にします。
2. **563〜564 行目：両方の query を名前の順に並べ替える**

   `URLSearchParams.sort()` は `URL` の `search` も書き換えます。`?b=2&a=1` と `?a=1&b=2` が同じになります。
3. **574〜576 行目：search と hash はそのまま、pathname は末尾の `/` を落として比べる**

   `/foo/` と `/foo` が同じになります。オリジンは比べません（558〜561 行目でイベントのオリジンを使ったので同じです）。

📄 `git show fe721868a6e（2026-06-08、v22.1.0 から、抜粋）`

```
--- handleNavigate（Router の外から来た遷移だけ）
+      const {pathname: destPathname, origin: destOrigin} = new URL(event.destination.url);
+      const {pathname: rootPathname, origin: appOrigin} = this.appRootUrl;
+      const rootPath = rootPathname.endsWith('/') ? rootPathname : rootPathname + '/';
+
+      if (
+        destOrigin !== appOrigin ||
+        (destPathname !== rootPathname && !destPathname.startsWith(rootPath))
+      ) {
+        return;
+      }
--- handleNavigateEventTriggeredOutsideRouterAPIs
-    // TODO(atscott): Consider if the destination URL doesn't start with `appRootURL`.
-    // Should we ignore it or not intercept in the first place?
-    const path = event.destination.url.substring(this.appRootURL.length - 1);
+    // The url will always start with the appRootUrl because of the boundary check in handleNavigate.
+    const path = event.destination.url.substring(this.appRootUrl.href.length - 1);
--- eventAndRouterDestinationsMatch
-    const routerDestination = this.location.prepareExternalUrl(internalPath);
-    return new URL(routerDestination, eventDestination.origin).href === eventDestination.href;
+    const routerDestination = new URL(
+      this.location.prepareExternalUrl(internalPath),
+      eventDestination.origin,
+    );
+    eventDestination.searchParams.sort();
+    routerDestination.searchParams.sort();
+    ...（pathname は Location.stripTrailingSlash、search と hash はそのまま比べる）
```

前の版は `href` の文字列をまるごと比べていました。独自の `UrlSerializer` で末尾の `/` を落とすアプリでは、ブラウザの履歴に `/foo/` が残っていると、戻るたびに「違う」と判定され、traverse のあとに余分な navigate が作られていました。同じコミットは、Router の外から来た遷移が `<base href>` の外（同じオリジンの別のアプリ）なら intercept しない境界の判定も足しています（その行は Router の章の 4 節）。

📄 `angular/packages/router/test/with_platform_navigation.spec.ts` L282–314 （▶ の行: 286–287, 299, 301, 305, 308, 310, 313）

```ts
282 │     it('should not trigger new navigation when traversing back to a URL with trailing slash mismatch (with custom serializer)', async () => {
283 │       TestBed.resetTestingModule();
284 │       TestBed.configureTestingModule({
285 │         providers: [
286 ▶           {provide: UrlSerializer, useClass: TrailingSlashNormalizingUrlSerializer},
287 ▶           {provide: PRECOMMIT_HANDLER_SUPPORTED, useValue: false},
288 │           provideRouter(
289 │             [
290 │               {path: 'foo', children: []},
291 │               {path: 'bar', children: []},
292 │             ],
293 │             withExperimentalPlatformNavigation(),
294 │           ),
295 │         ],
296 │       });
297 │       navigation = TestBed.inject(PlatformNavigation);
298 │ 
299 ▶       navigation.navigate('/foo/');
300 │       await timeout();
301 ▶       navigation.navigate('/bar');
302 │       await timeout();
303 │ 
304 │       router = TestBed.inject(Router);
305 ▶       router.initialNavigation();
306 │       await navigation.transition?.finished;
307 │ 
308 ▶       const navigateSpy = spyOn(navigation, 'navigate').and.callThrough();
309 │ 
310 ▶       await navigation.back().finished;
311 │       await timeout();
312 │ 
313 ▶       expect(navigateSpy).not.toHaveBeenCalled();
314 │     });
```

fe721868a6e が足した it の 1 つです。286 行目で末尾の `/` を落とす `UrlSerializer`、287 行目で `PRECOMMIT_HANDLER_SUPPORTED` を `false` にします （precommitHandler があると、traverse の commit の扱いが別の経路になるからです。[第 4 回](04-navx-precommit.md)の 6 節）。299 行目で `/foo/` を履歴に積み、305 行目で Router を起こし、308 行目で `navigation.navigate` に spy を付けてから 310 行目で戻ります。313 行目で、Router が新しい navigate を作らなかったことを確かめます。

📄 `angular/packages/router/test/with_platform_navigation.spec.ts` L350–384 （▶ の行: 357–358, 369–370, 380, 383）

```ts
350 │     it('should not intercept navigations outside the app root', async () => {
351 │       TestBed.resetTestingModule();
352 │       TestBed.configureTestingModule({
353 │         providers: [
354 │           {
355 │             provide: MOCK_PLATFORM_LOCATION_CONFIG,
356 │             useValue: {
357 ▶               startUrl: 'http://localhost/my-app/',
358 ▶               appBaseHref: '/my-app/',
359 │             },
360 │           },
361 │           provideRouter([{path: '**', children: []}], withExperimentalPlatformNavigation()),
362 │         ],
363 │       });
364 │       navigation = TestBed.inject(PlatformNavigation);
365 │ 
366 │       let interceptCalled = false;
367 │       navigation.addEventListener('navigate', (e: any) => {
368 │         const originalIntercept = e.intercept;
369 ▶         e.intercept = function (...args: any[]) {
370 ▶           interceptCalled = true;
371 │           originalIntercept.apply(this, args);
372 │         };
373 │       });
374 │ 
375 │       router = TestBed.inject(Router);
376 │       router.initialNavigation();
377 │       await navigation.transition?.finished;
378 │ 
379 │       interceptCalled = false;
380 ▶       navigation.navigate('http://localhost/other-app/foo');
381 │       await timeout();
382 │ 
383 ▶       expect(interceptCalled).toBeFalse();
384 │     });
```

もう 1 つは境界の判定の it です。357〜358 行目でアプリを `/my-app/` の下に置き（`MOCK_PLATFORM_LOCATION_CONFIG` は[第 6 回](06-navx-testing.md)）、369〜372 行目で `intercept` を包んで呼ばれたかを記録し、380 行目で `/other-app/foo` へ navigate して、383 行目で intercept されなかったことを確かめます。

## 4. push と replace の時機：37598cf6fe8

📄 `angular/packages/router/src/statemanager/navigation_state_manager.ts` L278–284 （▶ の行: 278–283）

```ts
278 ▶     // https://issues.chromium.org/issues/460137775 - Bug in all browsers where URL might actually not be updated
279 ▶     // by the time we get here. replaceUrl was set to true in the Router when navigating to sync with the browser
280 ▶     // because it assumes the URL is already committed. In this scenario, we need to go back to 'push' behavior
281 ▶     // because it was not yet been committed and we should not replace the current entry.
282 ▶     if (!this.navigation.transition && this.currentNavigation.navigationEvent) {
283 ▶       transition.extras.replaceUrl = false;
284 │     }
```

📄 `git show 37598cf6fe8（2025-12-03、v21.1.0 から）`

```
     const info: NavigationInfo = {ɵrouterInfo: {intercept: true}};
+    // https://issues.chromium.org/issues/460137775 - Bug in all browsers where URL might actually not be updated
+    // by the time we get here. ...
+    if (!this.navigation.transition && this.currentNavigation.navigationEvent) {
+      transition.extras.replaceUrl = false;
+    }
```

Router の外から来た遷移を Router が同期するとき、precommitHandler が使えないブラウザでは `{ replaceUrl: true }` を付けます（「URL はもうブラウザが変えたので、Router は置き換えで追いつく」）。ところが 278〜281 行目のコメントによると、利用者がリンクを押したときは、ここに来た時点でまだ URL が変わっていないことがあります（Chromium の issue 460137775）。282 行目、`navigation.transition` が無いのに intercept 中のイベントを持っている、という形でそれを見分け、283 行目で `replaceUrl` を `false` に戻して push にします。コミットの本文は「`element.click()` では再現しないので、テストを足すのは難しい（webdriver が要る）」。**この 3 行を守る spec はありません**。

## 5. 取り消したあとの巻き戻し

📄 `angular/packages/router/src/statemanager/navigation_state_manager.ts` L375–388 （▶ の行: 376–380）

```ts
375 │   private resetInternalState(finalUrl: UrlTree | undefined, traversalReset: boolean): void {
376 ▶     this.routerState = this.stateMemento.routerState;
377 ▶     this.currentUrlTree = this.stateMemento.currentUrlTree;
378 ▶     this.rawUrlTree = traversalReset
379 ▶       ? this.stateMemento.rawUrlTree
380 ▶       : this.urlHandlingStrategy.merge(this.currentUrlTree, finalUrl ?? this.rawUrlTree);
381 │   }
382 │ 
383 │   /**
384 │    * Handles the `navigate` event from the browser's Navigation API.
385 │    * This is the core interception point.
386 │    *
387 │    * @param event The `NavigateEvent` from the Navigation API.
388 │    */
```

`cancel()`（Router の章の 5 節）が呼ぶ `resetInternalState` です。376〜377 行目で `routerState` と `currentUrlTree` を、遷移の前に覚えた `stateMemento` に戻します。378〜380 行目の `rawUrlTree` だけは分かれます。traverse で戻す（`canceledNavigationResolution: 'computed'` で、エントリの key が違う）なら覚えた値をそのまま、そうでなければ `UrlHandlingStrategy.merge` で取り消した遷移の URL と混ぜます（Router が扱わない部分の URL を残す仕組み。[ブラウザの URL と履歴の章](../router/16-router-browser-url.md)）。

📄 `git show f591d36fa7a（../angular-main、2026-10-02、fixes #71126）`

```
     if (isRedirectingEvent(cause)) {
+      if (
+        cause instanceof NavigationCancel &&
+        cause.code === NavigationCancellationCode.Redirect &&
+        this.routerState === transition.targetRouterState
+      ) {
+        this.resetInternalState(transition.finalUrl, false);
+      }
       return;
     }
```

新しい本家の f591d36fa7a は、この `resetInternalState` を呼ぶ場所を 1 つ増やしました。`withNavigationErrorHandler` が `RedirectCommand` を返すと、エラーは「リダイレクトの取り消し」になり、今の版は `isRedirectingEvent` で何も戻さずに return します。ところが `BeforeActivateRoutes` のあと（Router の状態を確定したあと）のエラーだと、半分しか作られていない状態が残り、次のリダイレクトの遷移がそれを前提に動いて止まらなくなる（#71126）。修正は「確定した状態が今の遷移のものなら戻す」で、`HistoryStateManager` にも同じ形の変更が入っています。

### 開いている #71596：巻き戻しでページが読み込み直される

📄 `angular/packages/router/src/statemanager/navigation_state_manager.ts` L365–371 （▶ の行: 366, 368–369）

```ts
365 │       handleResultRejections(
366 ▶         this.navigation.navigate(pathOrUrl, {
367 │           state: this.activeHistoryEntry.getState(),
368 ▶           history: 'replace',
369 ▶           info: {ɵrouterInfo: {intercept: false}} satisfies NavigationInfo,
370 │         }),
371 │       );
```

📄 `angular/packages/router/src/statemanager/navigation_state_manager.ts` L399–402 （▶ の行: 400–401）

```ts
399 │     const routerInfo = (event?.info as NavigationInfo | undefined)?.ɵrouterInfo;
400 ▶     if (routerInfo && !routerInfo.intercept) {
401 ▶       return;
402 │     }
```

#71596（2026-10-24、area: router、開いている）の報告は次の 3 行に集まります。

1. **366〜370 行目：URL を確定したあとで取り消すと、前の URL へ `history: 'replace'` で navigate する**

   369 行目で `info.ɵrouterInfo.intercept` を `false` にします。「これは Router の遷移ではない」という印です。
2. **400〜401 行目：その印を見た `handleNavigate` は、intercept せずに return する**

   Router の遷移にしないのは正しいのですが、**誰も intercept しない navigate は、ブラウザにとって普通のページの読み込み**です。前の URL を新しい文書として読み込み、アプリが起動し直します。
3. **FakeNavigation では読み込み直しが起きない**

   下の行のとおり、`FakeNavigation.navigate` は intercept されなかったときもエントリを同じ文書の中で書き換えるだけです（[第 2 回](02-navx-fake-navigate.md)）。

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L213–217 （▶ の行: 215–216）

```ts
213 │       info: options?.info,
214 │     });
215 ▶     if (!intercepted) {
216 ▶       this.updateNavigationEntriesForSameDocumentNavigation(this.navigateEvent!);
217 │     }
```

issue の本文はこう書きます。「Router の spec は 2 つの API の両方で巻き戻しを期待しているが、通るのは FakeNavigation が新しい文書を読み込まないからだ」。どんなときに確定後の取り消しになるかも挙げられています。既定の `'deferred'` では、URL を確定した直後のコンポーネントの生成で例外が出たとき（`inject()` の提供者が無いなど）。`urlUpdateStrategy: 'eager'` では、ガードが拒否したとき。precommitHandler の無い Safari 26.6 では、intercept した時点で URL が確定するので、非同期のガードの拒否・`canDeactivate` で「いいえ」・`window.stop()` でも起きる、と。`canDeactivate` は保存していない入力を守るためのガードなので、読み込み直しでそれが消えるのが一番悪い、とも書かれています。

PR #71597（同じ人、開いている）は 400 行目の `if` の中で、return の前に `event.intercept({ focusReset: 'manual', scroll: 'manual' })` を呼びます。handler を渡さないので、URL だけが変わり、Router の遷移にはなりません。spec は本物の `window.navigation` を使う側に足されています（FakeNavigation では再現しないので）。2026-11-07 の時点で、メンテナー（atscott）の approve が 2 回、「main との衝突で rebase が要る」というコメント、そして「patch には安全に入らないので `target: minor` に変える」というコメントが付いていて、22.2.x 向けの写し（#71853）も開いています。8 節のデモで「eager」と「ガードが false」を選ぶと、366〜370 行目の navigate が FakeNavigation に届くのを見られます。

## 6. 戻る遷移のリダイレクト：3320da96da2

[第 4 回](04-navx-precommit.md)の 6 節で、778b7486942 が traverse の redirect を空の関数にしたところまで読みました。その結果、戻る先のガードがリダイレクトを返すと、既定の `'deferred'` では、リダイレクトの `NavigationCancel` は「URL が未確定のリダイレクト」として取り消されず（navigate イベントを持ち続ける）、リダイレクト先の遷移の最後で空の redirect が呼ばれ、**戻る先のエントリがそのまま commit されます**。Router の URL はリダイレクト先、ブラウザの URL は戻る先で、ずれます。8 節のデモの「戻る先のガードがリダイレクト」がこれです。

📄 `angular/packages/router/src/statemanager/navigation_state_manager.ts` L479–481 （▶ の行: 479, 481）

```ts
479 ▶           if (this.navigation.transition?.navigationType === 'traverse') {
480 │             // TODO(atscott): Figure out correct behavior for redirecting traversals
481 ▶             resolve(() => {});
```

今の版で traverse を見分けているのは 479 行目で、481 行目で空の関数を渡します。

📄 `git show 3320da96da2（../angular-main、2026-10-20、PR #71433）`

```
@@ NavigationCancel / NavigationError（handleRouterEvent）
       if (redirectingBeforeUrlCommit) {
+        if (this.currentNavigation.navigationEvent?.navigationType === 'traverse') {
+          // Traversals cannot be redirected via controller.redirect().
+          // Commit the traversal first, then allow the redirect navigation
+          // to perform a new replace navigation to the redirect destination.
+          this.finishNavigation();
+        }
         return;
       }
@@ finishNavigation
-    this.currentNavigation.commitUrl?.();
+    this.currentNavigation.commitUrl?.()?.catch(() => {});
@@ handleNavigate
+      const isTraverse = event.navigationType === 'traverse';
       ...
-        (interceptOptions as any).precommitHandler = (controller: any) => {
-          if (this.navigation.transition?.navigationType === 'traverse') {
-            // TODO(atscott): Figure out correct behavior for redirecting traversals
-            resolve(() => {});
-          } else {
+        interceptOptions.precommitHandler = (controller: NavigationPrecommitController) => {
+          if (!isTraverse) {
             resolve(controller.redirect.bind(controller));
           }
@@ commitUrl
-        if (transition && !transition.extras.skipLocationChange) {
+        if (!isTraverse && transition && !transition.extras.skipLocationChange) {
 ...
-        return await this.navigation.transition?.committed;
+        try {
+          return await this.navigation.transition?.committed;
+        } catch {
+          return;
+        }
```

1. **リダイレクトの取り消しで、イベントが traverse なら `finishNavigation()`**

   戻る遷移を先に commit して終わらせます（`commitUrl` を呼び、handler を解決し、作業領域を空にする）。リダイレクト先の遷移は、持っている navigate イベントが無いので、新しい navigate を作ります。
2. **traverse かどうかは `event.navigationType` で決める**

   今の版の 479 行目は `this.navigation.transition?.navigationType` を見ていました。新しい版は intercept の時点のイベントの値を `isTraverse` に取っておきます。
3. **`commitUrl` は traverse なら redirect を呼ばず、`committed` の拒否も握りつぶす**

   finishNavigation が呼ぶ `commitUrl()` の Promise にも `.catch(() => {})` を付けています。

コミットの本文は「仕様では traverse に redirect は使えない（`InvalidStateError`）。History API と同じ振る舞いにするため、まず traverse を commit し、それから Router がリダイレクト先へ replace の navigate をする」。22.2.x の枝にも b8383a1987a として入っています（gh で 22.2.x のコミットを見て確かめました）。../angular（22.2.0-next.7）とサイトの依存の 22.1.6 には入っていません。

📄 `angular/packages/router/test/with_platform_navigation.spec.ts` L170–180 （▶ の行: 172, 176–179）

```ts
170 │     it('retains the original traversal NavigateEvent', async () => {
171 │       router.resetConfig([{path: '**', children: []}]);
172 ▶       await router.navigateByUrl('/first');
173 │       await timeout();
174 │ 
175 │       const navigateEvents: NavigateEvent[] = [];
176 ▶       navigation.addEventListener('navigate', (e: NavigateEvent) => navigateEvents.push(e));
177 ▶       await navigation.back().finished;
178 ▶       expect(navigateEvents.length).toBe(1);
179 ▶       expect(navigateEvents[0].navigationType).toBe('traverse');
180 │     });
```

今の版にある traverse の it はこれで、176〜179 行目は「戻ると navigate イベントは 1 つで、`'traverse'`」までです。リダイレクトは試していません。3320da96da2 は、この下に「戻る先のガードがリダイレクトすると、traverse を commit してから replace する」の it を足しました。その it を今の版に写すと落ちることを、テストと直し方の節で確かめます。

## 7. abort のリスナーと、Promise の拒否の握りつぶし

📄 `git show ed24615af8f（../angular-main、2026-10-06）`

```
-    event.signal.addEventListener('abort', abortHandler);
+    event.signal.addEventListener('abort', abortHandler, {once: true});
```

`handleNavigate` が `event.signal` に付ける abort のリスナー（Router の章の 4 節）は、遷移が終わるか `cancel()` を通るときにしか外されませんでした。Router の遷移が無いときに abort されると付いたまま残る、というのが ed24615af8f の本文で、`{ once: true }` で「1 回発火したら外れる」にしました。WebKit には、リスナーの付いた `AbortSignal` がガベージコレクションで回収されない不具合がある（bugs.webkit.org 298499）とも書かれています。

📄 `angular/packages/router/src/statemanager/navigation_state_manager.ts` L597–611 （▶ の行: 597, 607–609）

```ts
597 ▶ /**
598 │  * Attaches a no-op `.catch(() => {})` to the `committed` and `finished` promises of a
599 │  * `NavigationResult`. This is to prevent unhandled promise rejection errors in the console
600 │  * if the consumer of the navigation method (e.g., `router.navigate()`) doesn't explicitly
601 │  * handle rejections on both promises. Navigations can be legitimately aborted (e.g., by a
602 │  * subsequent navigation), and this shouldn't necessarily manifest as an unhandled error
603 │  * if the application code doesn't specifically need to react to the `committed` promise
604 │  * rejecting in such cases. The `finished` promise is more commonly used to determine
605 │  * overall success/failure.
606 │  */
607 ▶ function handleResultRejections(result: NavigationResult): NavigationResult {
608 ▶   result.finished?.catch(() => {});
609 ▶   result.committed?.catch(() => {});
610 │   return result;
611 │ }
```

ファイルの最後の関数です。`navigation.navigate()` と `traverseTo()` が返す `committed` と `finished` に、何もしない `catch` を付けます。598〜606 行目のコメントのとおり、遷移は次の遷移に取って代わられて普通に拒否されるので、そのたびに「拒否を誰も受け取っていない」というエラーがコンソールに出ないようにするためです。Router の章の navigate と cancel の行が、戻り値をこれに通しています。

## 8. DEMO：Router を FakeNavigation の上で動かした記録

> **🧪 DEMO — Router のイベントと、FakeNavigation の entries（Node で動かした記録の再生）**
>
> **これは Node で動かした記録です。**このページでは何も動かさず、下のスクリプトが残した結果を表にするだけです。このページで動かさない理由は、`ɵFakeNavigationPlatformLocation`（`@angular/common/testing`）が `@angular/core/testing` の `FakeNavigation` を `instanceof` で参照し、`@angular/core/testing` は読み込まれた時点で TestBed と JIT の部品を引き込んで、このサイトの初期の JS を約 60 kB 増やしてしまうからです。スクリプトは、サイトの依存の配布物（22.1.6）の `@angular/core`・`common`・`router`・`core/testing`・`common/testing` をそのまま読み込み、プラットフォームの注入器を親にした別の注入器（`ɵINJECTOR_SCOPE` は `'root'`）の中で本物の Router を作ります。`PlatformNavigation` は `ɵFakeNavigation`（`https://app.example/` から）、`PlatformLocation` は `ɵFakeNavigationPlatformLocation` で、`provideRouter(routes, withExperimentalPlatformNavigation(), withRouterConfig({ urlUpdateStrategy }))` を足します。場面ごとに、初回の遷移・`/first`・`/second` を済ませてから（ここは表に出しません）操作をし、終わったら注入器を壊します。2 つの設定の 4 通り × 6 つの操作の 24 場面を記録しました。
>
> 操作のボタンを押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/navx-router-integration)

📄 `record-router.mjs`

```js
// 第 5 回 navx-router-integration の記録を作るスクリプト（Node で動かす）。
// 使い方: NM=<angular-deep-dive の node_modules> node record-router.mjs <出力する .data.ts>
// サイトの依存の配布物（@angular/core・common・router と core/testing・common/testing、22.1.6）をそのまま読み込む。
// - 配布物は部分コンパイル（ɵɵngDeclare…）なので、Node では先に @angular/compiler を読み込んで JIT で仕上げる。
// - FakeNavigation に渡す Document は createElement が投げる小さな代わり。fake_navigation.ts 125〜130 行目の
//   「投げたら new EventTarget()」に入り、defaultView も null なので window の代わりも EventTarget になる。
// - Router は、プラットフォームの注入器を親にした別の注入器（ɵINJECTOR_SCOPE: 'root'）の中で作り、場面ごとに壊す。
import { writeFileSync, readFileSync } from 'node:fs';
const NM = process.env.NM.replace(/\/$/, '') + '/';
await import(NM + '@angular/compiler/fesm2022/compiler.mjs');
const core = await import(NM + '@angular/core/fesm2022/core.mjs');
const common = await import(NM + '@angular/common/fesm2022/common.mjs');
const ctesting = await import(NM + '@angular/common/fesm2022/testing.mjs');
const { ɵFakeNavigation } = await import(NM + '@angular/core/fesm2022/testing.mjs');
const routerPkg = await import(NM + '@angular/router/fesm2022/router.mjs');
const platform = core.platformCore();

const START = 'https://app.example/';
const path = (url) => { if (!url) return '(null)'; const u = new URL(url); return u.pathname + u.search + u.hash; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(router) {
  for (let i = 0; i < 20; i++) {
    await wait(10);
    if (!router.currentNavigation()) { await wait(10); if (!router.currentNavigation()) return; }
  }
}

async function runScenario(scenario, opts) {
  const doc = { createElement() { throw new Error('no DOM'); }, defaultView: null };
  const fake = new ɵFakeNavigation(doc, START);
  fake.setSynchronousTraversalsForTesting(true);
  let guardAllows = true;
  let redirectOnFirst = false;
  const routes = [
    { path: 'first', canActivate: [() => (redirectOnFirst ? core.inject(routerPkg.Router).parseUrl('/redirected') : true)], children: [] },
    { path: 'guarded', canActivate: [() => guardAllows], children: [] },
    { path: 'redir', canActivate: [() => core.inject(routerPkg.Router).parseUrl('/target')], children: [] },
    { path: '**', children: [] },
  ];
  const injector = core.createEnvironmentInjector([
    { provide: core.ɵINJECTOR_SCOPE, useValue: 'root' },
    core.provideZonelessChangeDetection(),
    { provide: common.DOCUMENT, useValue: doc },
    { provide: common.PlatformNavigation, useValue: fake },
    { provide: common.PlatformLocation, useClass: ctesting.ɵFakeNavigationPlatformLocation },
    { provide: common.ɵPRECOMMIT_HANDLER_SUPPORTED, useValue: opts.precommit },
    routerPkg.provideRouter(routes, routerPkg.withExperimentalPlatformNavigation(), routerPkg.withRouterConfig({ urlUpdateStrategy: opts.strategy })),
  ], platform.injector, 'record');

  const rows = [];
  let recording = false;
  let n = 0;
  const log = (source, text) => { if (recording) rows.push({ no: ++n, source, text, url: path(fake.currentEntry.url), entries: fake.entries().length }); };
  for (const type of ['navigate', 'currententrychange', 'navigatesuccess', 'navigateerror']) {
    fake.addEventListener(type, (e) => {
      if (type === 'navigate') {
        const info = e.info?.ɵrouterInfo;
        const who = info ? `info.ɵrouterInfo.intercept: ${info.intercept}` : 'info なし（Router の外から）';
        log('Navigation', `navigate '${e.navigationType}' → ${path(e.destination.url)}（${who}）`);
      } else log('Navigation', type);
    });
  }
  const C = routerPkg.NavigationCancellationCode;
  const codes = { [C.Redirect]: 'Redirect', [C.SupersededByNewNavigation]: 'SupersededByNewNavigation', [C.NoDataFromResolver]: 'NoDataFromResolver', [C.GuardRejected]: 'GuardRejected', [C.Aborted]: 'Aborted' };
  try {
    const router = injector.get(routerPkg.Router);
    router.events.subscribe((e) => {
      if (e instanceof routerPkg.NavigationStart) log('Router', `NavigationStart ${e.url}（trigger: ${e.navigationTrigger}）`);
      else if (e instanceof routerPkg.GuardsCheckEnd) log('Router', `GuardsCheckEnd ${e.url}（shouldActivate: ${e.shouldActivate}）`);
      else if (e instanceof routerPkg.ResolveEnd) log('Router', `ResolveEnd ${e.url}`);
      else if (e instanceof routerPkg.NavigationEnd) log('Router', `NavigationEnd ${e.urlAfterRedirects}`);
      else if (e instanceof routerPkg.NavigationCancel) log('Router', `NavigationCancel ${e.url}（code: ${codes[e.code] ?? e.code}）`);
      else if (e instanceof routerPkg.NavigationError) log('Router', `NavigationError ${e.url}`);
    });
    // 前置き（記録しない）：初回の遷移と、/first・/second の 2 つ。
    router.initialNavigation(); await settle(router);
    await router.navigateByUrl('/first'); await settle(router);
    await router.navigateByUrl('/second'); await settle(router);
    recording = true;
    switch (scenario) {
      case 'push': log('呼び出し', "router.navigateByUrl('/a')"); void router.navigateByUrl('/a'); break;
      case 'guard-false': guardAllows = false; log('呼び出し', "router.navigateByUrl('/guarded')（canActivate が false）"); void router.navigateByUrl('/guarded'); break;
      case 'guard-redirect': log('呼び出し', "router.navigateByUrl('/redir')（canActivate が /target の UrlTree）"); void router.navigateByUrl('/redir'); break;
      case 'outside': log('呼び出し', "navigation.navigate('/outside')（Router を通さない）"); fake.navigate('/outside').finished.catch(() => {}); break;
      case 'back': log('呼び出し', 'navigation.back()'); fake.back().finished.catch(() => {}); break;
      case 'back-redirect': redirectOnFirst = true; log('呼び出し', 'navigation.back()（戻る先 /first の canActivate が /redirected の UrlTree）'); fake.back().finished.catch(() => {}); break;
    }
    await settle(router); await wait(30);
    recording = false;
    const cur = fake.currentEntry;
    return {
      rows,
      entries: fake.entries().map((en) => ({ index: en.index, url: path(en.url), key: en.key, current: en === cur })),
      routerUrl: router.url,
      currentUrl: path(cur.url),
    };
  } finally {
    injector.destroy();
    fake.dispose();
  }
}

const RECORDS = {};
for (const precommit of [true, false]) for (const strategy of ['deferred', 'eager'])
  for (const s of ['push', 'guard-false', 'guard-redirect', 'outside', 'back', 'back-redirect'])
    RECORDS[`${precommit}|${strategy}|${s}`] = await runScenario(s, { precommit, strategy });

writeFileSync(process.argv[2], `// 自動生成 — 手で編集しないこと（record-router.mjs を Node ${process.version} で動かした記録、@angular/router ${routerPkg.VERSION.full}）。
export const RECORDS: Record<string, { rows: { no: number; source: string; text: string; url: string; entries: number }[]; entries: { index: number; url: string; key: string; current: boolean }[]; routerUrl: string; currentUrl: string }> = ${JSON.stringify(RECORDS)};
export const SCRIPT = ${JSON.stringify(readFileSync(new URL(import.meta.url), 'utf8'))};
`);
console.log(Object.keys(RECORDS).length, 'records');
process.exit(0);

```
*記録を作ったスクリプトの全文（Node で動かした記録です）*

試すと分かることです。

1. **precommit: true で navigateByUrl すると、navigate イベントは NavigationStart より前に 1 つだけ**

   currentEntry が変わるのは ResolveEnd のあと、NavigationEnd の前です（既定の deferred）。navigatesuccess は NavigationEnd のあとに来ます（描画のあとで handler を解決するから。Router の章の 3 節）。
2. **precommit: false にすると、navigate イベントは ResolveEnd のあとに出て、すぐに currentEntry が変わる**

   [第 4 回](04-navx-precommit.md)の 5 節で読んだ `NavigationStart` の分岐に入らないので、URL を変えてよい時点まで navigate を呼べません。
3. **ガードが false：precommit: true なら navigateerror が出て、currentEntry と entries は変わらない。false なら navigate イベントそのものが出ない**

   前者は intercept していたイベントを `cancel()` が拒否するからです。
4. **eager でガードが false：URL が先に変わり、そのあと `intercept: false` の `'replace'` の navigate で戻る**

   5 節の 366〜370 行目です。表の中の `intercept: false` の navigate がそれで、そのあとの navigatesuccess はこの巻き戻しの navigate のものです。entries は `/second` が 2 つ並びます（取り消した `/guarded` のエントリを replace で置き換えたので）。FakeNavigation は 215〜216 行目で同じ文書の中で戻すだけですが、本物のブラウザではここでページが読み込み直されます（#71596）。precommit: false でも同じ形です。
5. **ガードがリダイレクト：NavigationCancel（Redirect）のあとも navigate イベントは 1 つ。entries に /redir は入らない**

   [第 4 回](04-navx-precommit.md)の e8c44a00f9a の行です。precommit: false だと、/target への navigate が ResolveEnd のあとに 1 つ出ます。eager だと URL が先に /redir で確定するので、リダイレクトは「確定後の取り消し」になり、navigateerror のあと /target への `'replace'` の navigate が作り直されます。
6. **Router の外から navigate：info なしの navigate が Router の遷移になる。precommit: false だと、最初の navigate は navigateerror になり、Router が `'replace'` の navigate を作り直す**

   precommitHandler が無いと、Router が自分の state を載せるには navigate をやり直すしかないからです（Router の章の 3 節の `maybeCreateNavigationForTransition` は、traverse だけを特別扱いします）。
7. **戻る先のガードがリダイレクト（precommit: true、deferred）：router.url は /redirected なのに、currentEntry は /first のまま（ずれている）**

   6 節の、3320da96da2 が直した不具合そのものです。eager か precommit: false では、戻る遷移の URL がガードより前に確定するので、リダイレクトは確定後の取り消しになり、Router のリダイレクト先が `'replace'` の navigate で上書きして、ずれません（entries の index 1 が /redirected になる）。3320da96da2 の it が期待しているのも、この形です。

記録に切り替える前に、同じ 24 場面を本番ビルドのページの上で本物の Router を動かして表にしたこと（ヘッドレスの Chrome 155.0.8043.0、2026-11-07）があり、その結果と行の順も中身も同じでした。

## ここまでの呼び出し（戻る先のガードがリダイレクト、precommit: true、deferred、この版）

- 👤 `navigation.back()` — 戻るボタン
  - `handleNavigate(event)`（traverse）→ `intercept({ handler, precommitHandler })` — navigation\_state\_manager.ts（Router の章の 4 節）
    - `precommitHandler(controller)` → `resolve(() => {})` — navigation\_state\_manager.ts L479-481 — *traverse なので空の redirect*
  - `nonRouterCurrentEntryChangeSubject.next({ path: '/first', … })` — L101 の Subject
    - `NavigationStart /first` → ガード → `NavigationCancel`（Redirect） — Router のパイプライン
      - `redirectingBeforeUrlCommit` → return — navigation\_state\_manager.ts L209-215 — *イベントを持ち続ける*
    - `NavigationStart /redirected` → `BeforeActivateRoutes` → `commitUrl()` — Router の章の 3 節
      - `(await redirect)('/redirected', …)` は空の関数 — L509 — *FakeNavigation の destination は /first のまま*
      - `resolvePrecommitHandler()` → `commit()` → traverse の commit — fake\_navigation.ts（第 3 回） — *currentEntry は /first*
  - `NavigationEnd /redirected` — router.url は /redirected

## テストと直し方

### spec と it

| describe / it | 行 | この章のどこ | Node で走るか |
| --- | --- | --- | --- |
| `NavigateEvent and NavigationTransition` › `retains the original traversal NavigateEvent` | 170 | 6 節 | 走る |
| `URL comparison and extraction bugs` › trailing slash・query の順番・app root の 3 つ | 282・316・350 | 3 節（fe721868a6e が足した） | 走る |
| `real platform navigation` › `should convert navigations from regular anchors …` | 419 | 1 節 | 走らない（ブラウザだけ） |
| `real platform navigation` › `should not convert reload events to SPA navigations` | 428 | 2 節（dbd50be7f71 が足した） | 走らない（ブラウザだけ） |
| （無い）37598cf6fe8 の 282〜284 行目 | — | 4 節 | — |

📄 `angular/packages/router/test/with_platform_navigation.spec.ts` L397–426 （▶ の行: 397, 399, 404–405, 419）

```ts
397 ▶ if (typeof window !== 'undefined' && 'navigation' in window && !isFirefox()) {
398 │   describe('real platform navigation', () => {
399 ▶     const navigation = window.navigation as Navigation;
400 │     beforeEach(() => {
401 │       TestBed.configureTestingModule({
402 │         providers: [
403 │           provideRouter([{path: '**', children: []}], withExperimentalPlatformNavigation()),
404 ▶           {provide: PlatformLocation, useClass: BrowserPlatformLocation},
405 ▶           {provide: PlatformNavigation, useFactory: () => navigation},
406 │         ],
407 │       });
408 │     });
409 │ 
410 │     let router: Router;
411 │     beforeEach(async () => {
412 │       router = TestBed.inject(Router);
413 │       router.initialNavigation();
414 │       await new Promise((r) => setTimeout(r));
415 │     });
416 │ 
417 │     // This would cause tests to fail without the navigation API support with an error like:
418 │     // "Tests were interrupted because the page navigated to <localhost>/somewhere. This can happen when clicking a link, submitting a form or interacting with window.location."
419 ▶     it(
420 │       'should convert navigations from regular anchors to same-document router navigations',
421 │       withBody('<a href="/somewhere">link</a>', async () => {
422 │         document.querySelector('a')!.click();
423 │         await new Promise((r) => setTimeout(r));
424 │         expect(router.url).toBe('/somewhere');
425 │       }),
426 │     );
```

397 行目、`window.navigation` があり、Firefox でないときだけ、この describe を作ります。404〜405 行目で FakeNavigation の代わりに本物の `BrowserPlatformLocation` と `window.navigation` を入れます。Node には `window` が無いので、Node の spec の数には入りません。ブラウザの suite でだけ走ります。

📄 `angular/packages/router/test/with_platform_navigation.spec.ts` L428–450 （▶ の行: 433–434, 447, 449）

```ts
428 │     it('should not convert reload events to SPA navigations', async () => {
429 │       const navigation = TestBed.inject(PlatformNavigation);
430 │       navigation.addEventListener(
431 │         'navigate',
432 │         (e: NavigateEvent) => {
433 ▶           e.intercept({
434 ▶             handler: () => new Promise((_, reject) => setTimeout(reject, 2)),
435 │           });
436 │         },
437 │         {once: true},
438 │       );
439 │       const routerEvents: Event[] = [];
440 │       router.events.subscribe((e) => routerEvents.push(e));
441 │       router.resetConfig([
442 │         {
443 │           path: '**',
444 │           children: [],
445 │         },
446 │       ]);
447 ▶       navigation.reload();
448 │       await timeout(3);
449 ▶       expect(routerEvents).toEqual([]);
450 │     });
```

433〜435 行目、テストが自分で intercept して 2 ミリ秒後に reject する handler を付けます。こうすると、Router が intercept しなかったときにテストのページが本当に読み込み直されることを防げます。447 行目で `navigation.reload()` を呼び、449 行目で Router のイベントが 1 つも出ないことを確かめます。

### 手元で走らせた結果

📄 `../angular（22.2.0-next.7、8576f161ae4）、2026-11-07`

```
pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all --test_arg=--filter=withPlatformNavigation
  Ran 14 of 1170 specs / 14 specs, 0 failures
pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all "--test_arg=--filter=canceledNavigationResolution: 'computed' with navigation"
  Ran 18 of 1170 specs / 18 specs, 0 failures
pnpm bazel test //packages/router/test:test_web --nocache_test_results --test_output=all
  Chromium: 1180 passed, 0 failed   Firefox: 1178 passed, 0 failed
```

Chromium の数が Firefox より 2 多いのは、397 行目の条件で `real platform navigation` の 2 つが Chromium でだけ作られるからです（ログは scratchpad/nav-logs/b-web-router.log）。

新しい本家の修正と、今の版の spec の関係を、作業木で確かめました。

📄 `scratchpad/nav-logs/b-wt-traverse-before.log・b-wt-traverse-after.log・b-wt-fe72-revert.log（要点）`

```
# 作業木（8576f161ae4）に、../angular-main の 3320da96da2 が足した it
#   'handles redirects during traversal navigations by committing and replacing'
# だけを写して走らせる
pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=handles redirects during traversal"
1) withPlatformNavigation feature NavigateEvent and NavigationTransition handles redirects during traversal navigations by committing and replacing
    Expected 'http://_empty_/first' to contain '/redirected'.
1 spec, 1 failure

# 3320da96da2 の navigation_state_manager.ts の差分を git apply してから、もう一度
Ran 1 of 1171 specs
1 spec, 0 failures
# withPlatformNavigation 全体でも（足した 1 つを入れて 15 件）
Ran 15 of 1171 specs
15 specs, 0 failures

# 別の実験：fe721868a6e の比べ方を、前の「href が同じか」に戻す
1) ... should not trigger new navigation when traversing back to a URL with query param order mismatch (with custom serializer)
2) ... should not trigger new navigation when traversing back to a URL with trailing slash mismatch (with custom serializer)
Ran 14 of 1170 specs
14 specs, 2 failures
```

- 3320da96da2 の it は、今の版では `currentEntry` が `/first` のままで落ちます。デモの「戻る先のガードがリダイレクト」と同じずれです。差分を当てると通り、ほかの 14 件も壊れません。
- fe721868a6e の比べ方を前の版に戻すと、3 節の 2 つの it が落ちます。この 2 つは比べ方の 574〜576 行目を守っています。

### 直すとしたら

- 戻る遷移のリダイレクトは、3320da96da2 と同じ形で、`handleRouterEvent` の `redirectingBeforeUrlCommit` の中と `handleNavigate` の precommitHandler・`commitUrl` を変えます。spec は with\_platform\_navigation.spec.ts の describe `NavigateEvent and NavigationTransition` に足します。
- #71596 は 400〜401 行目の `if` の中です。FakeNavigation の上では再現しないので、spec は 397 行目の `real platform navigation` の中に置くことになります（#71597 がそうしています）。
- 4 節の 282〜284 行目は、利用者の本物のクリックでしか起きないので、Node の spec では守れません。
- issue の全体は[第 7 回](07-navx-tests-issues.md)です。

## 聞かれそうな質問

**Q. `withExperimentalPlatformNavigation` を付けたら、`location.reload()` が効かなくなりました。**

v21.2.0 より前の版です。dbd50be7f71 で、`handleNavigate` の最初の `if`（navigation\_state\_manager.ts 395 行目）に `navigationType === 'reload'` が足され、reload は intercept されなくなりました（#66746）。ダウンロードのリンクも、新しい本家の e09bbed21a7 から同じ扱いです。

**Q. 戻るボタンのとき、Router が余分な navigate を作ることはありますか？**

行き先が Router の目的地と「同じ」なら作りません。その「同じ」を決めるのが `eventAndRouterDestinationsMatch` で、query を並べ替え（563〜564 行目）、pathname の末尾の `/` を落として比べます（576 行目）。v22.1.0 の fe721868a6e より前は `href` の文字列の比較だったので、独自の `UrlSerializer` では作ることがありました。

**Q. ガードで取り消したのに、ページ全体が読み込み直されることがあるのはなぜですか？**

URL を確定したあとの取り消しでは、`cancel()` が前の URL へ `intercept: false` の印を付けて navigate し（366〜370 行目）、`handleNavigate` がそれを intercept せずに return する（400〜401 行目）からです。誰も intercept しない navigate はページの読み込みになります。開いている #71596 で、PR #71597 が「Router の遷移にはせず、intercept だけはする」直し方を出しています。

**Q. 戻る先のガードがリダイレクトを返すと、URL がずれるのはなぜですか？**

既定の `'deferred'` で precommitHandler が使えるときの話です。traverse は `redirect()` できないので、この版の Router は空の関数を使い（479〜481 行目）、リダイレクト先の遷移の最後に戻る先のエントリがそのまま commit されるからです。新しい本家の 3320da96da2（22.2.x では b8383a1987a）は、先に traverse を commit し、リダイレクト先へ replace で navigate します。

**Q. テストでは FakeNavigation を使うのに、本物のブラウザでしか確かめられない振る舞いはどう試しているのですか？**

with\_platform\_navigation.spec.ts の 397 行目の `real platform navigation` の describe で、本物の `window.navigation` と `BrowserPlatformLocation` を入れます（404〜405 行目）。ページが本当に移動しないよう、テストが自分の navigate のリスナーで intercept や `preventDefault()` をしてから試します（433〜435 行目）。

## 読み終えて

- Router の外から来た遷移は 101 行目の Subject で Router に渡る。Router が聞く前（`registered` が `false`）なら遷移にしない。
- intercept しないのは、できないもの・reload（dbd50be7f71）・ダウンロード（新しい本家の e09bbed21a7）・Router 自身の巻き戻し。最後のものが #71596 の原因。
- traverse の行き先が同じかどうかは、query を並べ替え、末尾の `/` を落として比べる（fe721868a6e）。
- この版では、戻る先のガードのリダイレクトで Router と currentEntry がずれる。新しい本家の 3320da96da2 が直し、その it を今の版に写すと落ちる。

---

← 前: [precommitHandler：URL の確定を遅らせ、途中でリダイレクトする](04-navx-precommit.md)  
次: [テストの土台：FakeNavigationPlatformLocation と provideFakePlatformNavigation](06-navx-testing.md) →
