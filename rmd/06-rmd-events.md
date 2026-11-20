[目次](../README.md) › [Router の型と説明文の読み残し](README.md) › 第 6 回 / 全 9 回

# ルーターのイベントの説明文：EventType から stringifyEvent まで

> events.ts の未読の行：EventType と RouterEvent、NavigationStart の navigationTrigger と restoredState、NavigationEnd・Cancel・Error、GuardsCheck と Resolve、RouteConfigLoad、(Child)Activation、Scroll の説明文。本物のナビゲーションで出る順を記録し、「Resolve の段」「popstate のとき以外は null」などの食い違いを示す。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-events)

---

この章で分かること：events.ts の各イベントのクラスと、その上の doc コメント（angular.dev の API リファレンスの文）が、いつ・何を約束しているか。そして本物のナビゲーションで流れる順と比べて、どこが合わないか。合わないのは 4 か所です。`ChildActivationStart` などの 4 つが「Resolve の段の一部」と書かれていること、`NavigationStart.restoredState` の「popstate のとき以外は null」、`ResolveStart` の「解決するものが無くても出る」、そして `RouteConfigLoadStart` が `loadComponent` でも出ることです。

読む対象は `packages/router/src/events.ts` の、これまでの章が引いていない行です（../angular、8576f161ae4）。17 種類の一覧と、どこから送られるかは[Router.events の全種類](../router/17-router-events.md)、`toString` と取り消しの理由のコードは[イベントの文字列と取り消しの理由](../rdir/04-rdir-events.md)で読みました。

1. [1. models.ts の小さな型](01-rmd-basic-types.md)
2. [2. Route の説明文](02-rmd-route.md)
3. [3. ガードの型](03-rmd-guards.md)
4. [4. Resolve と NavigationBehaviorOptions](04-rmd-resolve-nav.md)
5. [5. provideRouter の機能](05-rmd-features.md)
6. **6. ルーターのイベント**（この章）
7. [7. RouterLink と RouterOutlet](07-rmd-directives.md)
8. [8. URL とナビゲーションの小道具](08-rmd-url-rest.md)
9. [9. spec と issue](09-rmd-tests-issues.md)

## 1. EventType と RouterEvent：2 つの系統の doc

📄 `angular/packages/router/src/events.ts` L6–13 （▶ の行: 9–12）

```ts
 6 │  * found in the LICENSE file at https://angular.dev/license
 7 │  */
 8 │ 
 9 ▶ import {NavigationBehaviorOptions, Route} from './models';
10 ▶ import type {Navigation} from './navigation_transition';
11 ▶ import {ActivatedRouteSnapshot, RouterStateSnapshot} from './router_state';
12 ▶ import {UrlTree} from './url_tree';
13 │ 
```

events.ts が import するのは 4 つだけです。10 行目の `Navigation` は `import type` で、navigation\_transition.ts を実行時には読みません（navigation\_transition.ts の側が events.ts を import するので、型だけにして循環を避ける形です）。

📄 `angular/packages/router/src/events.ts` L25–32 （▶ の行: 27, 31）

```ts
25 │ 
26 │ /**
27 ▶  * Identifies the type of a router event.
28 │  *
29 │  * @see [Router Lifecycle and Events](guide/routing/lifecycle-and-events)
30 │  *
31 ▶  * @publicApi
32 │  */
```

📄 `angular/packages/router/src/events.ts` L52–76 （▶ の行: 54–55, 60, 65–66）

````ts
52 │ 
53 │ /**
54 ▶  * Base for events the router goes through, as opposed to events tied to a specific
55 ▶  * route. Fired one time for any given navigation.
56 │  *
57 │  * The following code shows how a class subscribes to router events.
58 │  *
59 │  * ```ts
60 ▶  * import {Event, RouterEvent, Router} from '@angular/router';
61 │  *
62 │  * class MyService {
63 │  *   constructor(public router: Router) {
64 │  *     router.events.pipe(
65 ▶  *        filter((e: Event | RouterEvent): e is RouterEvent => e instanceof RouterEvent)
66 ▶  *     ).subscribe((e: RouterEvent) => {
67 │  *       // Do something
68 │  *     });
69 │  *   }
70 │  * }
71 │  * ```
72 │  *
73 │  * @see {@link Event}
74 │  * @see [Router events summary](guide/routing/router-reference#router-events)
75 │  * @publicApi
76 │  */
````

27 行目は `EventType` を「ルーターのイベントの種類を表す」とだけ書きます。値の並び（33〜51 行目）と、本番ビルドでクラス名の代わりに `type` で見分ける使い方は[Router.events の全種類](../router/17-router-events.md)の 1 節にあります。54〜55 行目は `RouterEvent` を「特定の Route に結び付いたイベントではなく、ルーターが通る段のイベントの基底。1 回のナビゲーションで 1 回ずつ出る」と書きます。65 行目の例は `e instanceof RouterEvent` で絞ります。

デモの表の「RouterEvent」の列が、この区別をそのまま見せます。`NavigationStart`・`RoutesRecognized`・`GuardsCheckStart` などは `true`、Route 単位の `RouteConfigLoadStart`・`ChildActivationStart`・`ActivationStart`（とその End）は `false` で、65 行目の `filter` を通りません。「1 回ずつ」は 1 つのナビゲーション ID の中の話で、リダイレクトの場面では `NavigationStart` が 2 回（ID 2 と 3）出ます。この例は 60 行目で import した `filter` の出どころ（rxjs）を書いておらず、63 行目はコンストラクターの引数で `Router` を受け取る書き方のままです（今のガイドは `inject(Router)`）。

## 2. NavigationStart：trigger と restoredState の doc

📄 `angular/packages/router/src/events.ts` L83–90 （▶ の行: 87, 89）

```ts
83 │   ) {}
84 │ }
85 │ 
86 │ /**
87 ▶  * An event triggered when a navigation starts.
88 │  *
89 ▶  * @publicApi
90 │  */
```

87 行目は「ナビゲーションが始まったときに出る」。この間の 94〜102 行目（[Router.events の全種類](../router/17-router-events.md)の引用）は `navigationTrigger` を「`imperative` は `router.navigateByUrl()` か `router.navigate()` の呼び出し」と書きます。デモでは、ほかに 2 つの `imperative` が見えます。初期ナビゲーション（router.ts の `initialNavigation` が `IMPERATIVE_NAVIGATION` を渡す）と、ガードや resolver によるリダイレクトの 2 本目です。

📄 `angular/packages/router/src/events.ts` L103–120 （▶ の行: 105–106, 113–114, 116–118）

```ts
103 │ 
104 │   /**
105 ▶    * The navigation state that was previously supplied to the `pushState` call,
106 ▶    * when the navigation is triggered by a `popstate` event. Otherwise null.
107 │    *
108 │    * The state object is defined by `NavigationExtras`, and contains any
109 │    * developer-defined state value, as well as a unique ID that
110 │    * the router assigns to every router transition/navigation.
111 │    *
112 │    * From the perspective of the router, the router never "goes back".
113 ▶    * When the user clicks on the back button in the browser,
114 ▶    * a new navigation ID is created.
115 │    *
116 ▶    * Use the ID in this previous-state object to differentiate between a newly created
117 ▶    * state and one returned to by a `popstate` event, so that you can restore some
118 ▶    * remembered state, such as scroll position.
119 │    *
120 │    */
```

105〜106 行目は「`popstate` で始まったナビゲーションなら、前に `pushState` に渡した state。そうでなければ null」です。実際に `restoredState` を決めるのは router.ts の `navigateToSyncWithBrowser` の `state?.navigationId ? state : null`（[browserUrl と Location](../router/16-router-browser-url.md)で引用）で、これを呼ぶのは popstate の listener と `initialNavigation` の 2 か所です。`initialNavigation` は `this.stateManager.restoredState()`（今の `history.state`）を渡すので、**再読み込みのあとの初期ナビゲーションは、trigger が `imperative` なのに `restoredState` が null ではありません**。

デモの最後の場面は、偽の `PlatformLocation` の `history.state` に `{navigationId: 7, from: '再読み込みの前'}` を置いてから `initialNavigation()` を呼びます。結果は `navigationTrigger=imperative restoredState={"navigationId":7,"from":"再読み込みの前"}` でした。この渡し方は 91c4da6709e（2023-10-04、#52032、location の処理を state\_manager.ts へ移したコミット）の前から `this.location.getState()` を渡していて、105〜106 行目の文は c40ae7f7cfb（2018-01-24、#21728、`restoredState` を足したコミット）からです。116〜118 行目の「popstate で戻ってきた state か、新しく作った state かを見分けて、スクロール位置などを戻す」使い方は、`RouterScroller` が `e.restoredState.navigationId` で行っています（[Router.events の全種類](../router/17-router-events.md)の 6 節）。

> [!WARNING]
> **ハマりどころ**
>
> `NavigationTrigger` の `'hashchange'`（19 行目、[前のシリーズ](../rdir/04-rdir-events.md)の引用）は、今の Router からは出ません。state\_manager.ts の `registerNonRouterCurrentEntryChangeListener`（[SPA のナビゲーション](../boot/13-boot-spa-navigation.md)で引用）は `event['type'] === 'popstate'` のときだけ listener を呼び、trigger には文字列の `'popstate'` を渡します。9e039ca68bf（2021-09-02、#43328、`fix(router): Only trigger router navigation on popstate events from Location subscription`）で、hashchange からナビゲーションを始めるのをやめたためです。本文は「ブラウザは hashchange の前に popstate を出すので、popstate だけを使う」。デモの「hash の変更」は、偽のブラウザが popstate と hashchange を続けて出し、`NavigationStart` は 1 回、trigger は `popstate` です。

## 3. NavigationEnd・NavigationCancel・NavigationError の doc

📄 `angular/packages/router/src/events.ts` L143–152 （▶ の行: 145）

```ts
143 │ 
144 │ /**
145 ▶  * An event triggered when a navigation ends successfully.
146 │  *
147 │  * @see {@link NavigationStart}
148 │  * @see {@link NavigationCancel}
149 │  * @see {@link NavigationError}
150 │  *
151 │  * @publicApi
152 │  */
```

📄 `angular/packages/router/src/events.ts` L172–179 （▶ の行: 174–175）

```ts
172 │ 
173 │ /**
174 ▶  * A code for the `NavigationCancel` event of the `Router` to indicate the
175 ▶  * reason a navigation failed.
176 │  *
177 │  * @publicApi
178 │  */
179 │ export enum NavigationCancellationCode {
```

174〜175 行目は `NavigationCancellationCode` を「`NavigationCancel` が、ナビゲーションが失敗した理由を示すコード」と書きます。各値の doc（180〜201 行目）は[Router.events の全種類](../router/17-router-events.md)の 5 節の引用です。その中の `Redirect` は「ガードが `UrlTree` を返してリダイレクトしたとき」と書きますが、デモでは **resolver が `RedirectCommand` を返したときも code 0（Redirect）**でした。`withNavigationErrorHandler` の `RedirectCommand` も同じ code です（[前回](05-rmd-features.md)の 8 節）。

📄 `angular/packages/router/src/events.ts` L223–234 （▶ の行: 225–227）

```ts
223 │ 
224 │ /**
225 ▶  * An event triggered when a navigation is canceled, directly or indirectly.
226 ▶  * This can happen for several reasons including when a route guard
227 ▶  * returns `false` or initiates a redirect by returning a `UrlTree`.
228 │  *
229 │  * @see {@link NavigationStart}
230 │  * @see {@link NavigationEnd}
231 │  * @see {@link NavigationError}
232 │  *
233 │  * @publicApi
234 │  */
```

📄 `angular/packages/router/src/events.ts` L303–312 （▶ の行: 305）

```ts
303 │ 
304 │ /**
305 ▶  * An event triggered when a navigation fails due to an unexpected error.
306 │  *
307 │  * @see {@link NavigationStart}
308 │  * @see {@link NavigationEnd}
309 │  * @see {@link NavigationCancel}
310 │  *
311 │  * @publicApi
312 │  */
```

225〜227 行目は「ガードが `false` を返したときや、`UrlTree` を返してリダイレクトしたときなどに出る」、305 行目は「予期しないエラーで失敗したときに出る」です。デモの「ガードが false」は code 3（GuardRejected）、「ガードが UrlTree」は code 0 のあとに 2 本目の `NavigationStart`。`NavigationError` の `target`（323〜329 行目の doc は「snapshot ができる前のエラーなら `undefined`」、[前のシリーズ](../rdir/04-rdir-events.md)の引用）は、resolver の例外では「ある」、一致する Route が無いとき（認識の段のエラー）は `undefined` でした。

## 4. GuardsCheck と Resolve の doc

📄 `angular/packages/router/src/events.ts` L366–402 （▶ の行: 368, 397）

```ts
366 │ 
367 │ /**
368 ▶  * An event triggered at the start of the Guard phase of routing.
369 │  *
370 │  * @see {@link GuardsCheckEnd}
371 │  *
372 │  * @publicApi
373 │  */
374 │ export class GuardsCheckStart extends RouterEvent {
375 │   readonly type = EventType.GuardsCheckStart;
376 │ 
377 │   constructor(
378 │     /** @docsNotRequired */
379 │     id: number,
380 │     /** @docsNotRequired */
381 │     url: string,
382 │     /** @docsNotRequired */
383 │     public urlAfterRedirects: string,
384 │     /** @docsNotRequired */
385 │     public state: RouterStateSnapshot,
386 │   ) {
387 │     super(id, url);
388 │   }
389 │ 
390 │   /** @docs-private */
391 │   override toString(): string {
392 │     return `GuardsCheckStart(id: ${this.id}, url: '${this.url}', urlAfterRedirects: '${this.urlAfterRedirects}', state: ${this.state})`;
393 │   }
394 │ }
395 │ 
396 │ /**
397 ▶  * An event triggered at the end of the Guard phase of routing.
398 │  *
399 │  * @see {@link GuardsCheckStart}
400 │  *
401 │  * @publicApi
402 │  */
```

📄 `angular/packages/router/src/events.ts` L420–457 （▶ の行: 428, 430–431）

```ts
420 │ 
421 │   /** @docs-private */
422 │   override toString(): string {
423 │     return `GuardsCheckEnd(id: ${this.id}, url: '${this.url}', urlAfterRedirects: '${this.urlAfterRedirects}', state: ${this.state}, shouldActivate: ${this.shouldActivate})`;
424 │   }
425 │ }
426 │ 
427 │ /**
428 ▶  * An event triggered at the start of the Resolve phase of routing.
429 │  *
430 ▶  * Runs in the "resolve" phase whether or not there is anything to resolve.
431 ▶  * In future, may change to only run when there are things to be resolved.
432 │  *
433 │  * @see {@link ResolveEnd}
434 │  *
435 │  * @publicApi
436 │  */
437 │ export class ResolveStart extends RouterEvent {
438 │   readonly type = EventType.ResolveStart;
439 │ 
440 │   constructor(
441 │     /** @docsNotRequired */
442 │     id: number,
443 │     /** @docsNotRequired */
444 │     url: string,
445 │     /** @docsNotRequired */
446 │     public urlAfterRedirects: string,
447 │     /** @docsNotRequired */
448 │     public state: RouterStateSnapshot,
449 │   ) {
450 │     super(id, url);
451 │   }
452 │ 
453 │   /** @docs-private */
454 │   override toString(): string {
455 │     return `ResolveStart(id: ${this.id}, url: '${this.url}', urlAfterRedirects: '${this.urlAfterRedirects}', state: ${this.state})`;
456 │   }
457 │ }
```

368・397 行目は「ガードの段の始まり / 終わりに出る」。428 行目は「Resolve の段の始まりに出る」で、430〜431 行目が「**解決するものがあってもなくても、Resolve の段で出る**。将来は解決するものがあるときだけにするかもしれない」です。

navigation\_transition.ts の 681〜683 行目（[Router.events の全種類](../router/17-router-events.md)の 4 節）は、`t.guards.canActivateChecks.length === 0` なら `ResolveStart` を作る前に返します。「解決するもの（resolver）」の有無は見ていないので、resolver の無い `/a` に新しく移ると `ResolveStart` / `ResolveEnd` は出ます。ところが **activate する Route が 1 つも無いナビゲーション（query だけの変更、同じ URL の reload）では出ません**。デモの「query だけ変える」は `GuardsCheckEnd` の次が `ActivationEnd` です。430 行目の「Resolve の段で出る」の段そのものが飛ばされます。この条件は、`ResolveStart` を足した 8a1a989a1c8（2017-07-01、#17601）のときから `preActivation.isActivating()` の形であり、doc の文も同じコミットからです。

📄 `angular/packages/router/src/events.ts` L458–493 （▶ の行: 460, 488）

```ts
458 │ 
459 │ /**
460 ▶  * An event triggered at the end of the Resolve phase of routing.
461 │  * @see {@link ResolveStart}
462 │  *
463 │  * @publicApi
464 │  */
465 │ export class ResolveEnd extends RouterEvent {
466 │   readonly type = EventType.ResolveEnd;
467 │ 
468 │   constructor(
469 │     /** @docsNotRequired */
470 │     id: number,
471 │     /** @docsNotRequired */
472 │     url: string,
473 │     /** @docsNotRequired */
474 │     public urlAfterRedirects: string,
475 │     /** @docsNotRequired */
476 │     public state: RouterStateSnapshot,
477 │   ) {
478 │     super(id, url);
479 │   }
480 │ 
481 │   /** @docs-private */
482 │   override toString(): string {
483 │     return `ResolveEnd(id: ${this.id}, url: '${this.url}', urlAfterRedirects: '${this.urlAfterRedirects}', state: ${this.state})`;
484 │   }
485 │ }
486 │ 
487 │ /**
488 ▶  * An event triggered before lazy loading a route configuration.
489 │  *
490 │  * @see {@link RouteConfigLoadEnd}
491 │  *
492 │  * @publicApi
493 │  */
```

488 行目は `RouteConfigLoadStart` を「Route の設定（configuration）を遅延読み込みする前に出る」と書きます。デモの `loadChildren` では `NavigationStart` の直後（`RoutesRecognized` の前）に出て、`Event` 型の doc の一覧（671〜674 行目、[前のシリーズ](../rdir/04-rdir-events.md)の引用）の位置と合います。**`loadComponent` でも同じイベントが出ます**。こちらは `ResolveEnd` のあと、`ActivationEnd` の前で、`RouteConfigLoadStart(path: lazy-c)` の形です。読み込むのは Route の設定ではなくコンポーネントで、一覧の位置（認識の前）とも違います。navigation\_transition.ts の「LOAD COMPONENTS」の段が `configLoader.loadComponent` を呼び、router\_config\_loader.ts の `loadComponent` が `loadChildren` と同じ `onLoadStartListener` を呼ぶためです（どちらも[遅延読み込み](../router/11-router-lazy-loading.md)で引用）。

## 5. ChildActivation と Activation：「Resolve の段の一部」ではない

📄 `angular/packages/router/src/events.ts` L528–536 （▶ の行: 530–531）

```ts
528 │ 
529 │ /**
530 ▶  * An event triggered at the start of the child-activation
531 ▶  * part of the Resolve phase of routing.
532 │  * @see {@link ChildActivationEnd}
533 │  * @see {@link ResolveStart}
534 │  *
535 │  * @publicApi
536 │  */
```

📄 `angular/packages/router/src/events.ts` L573–581 （▶ の行: 575–576）

```ts
573 │ 
574 │ /**
575 ▶  * An event triggered at the start of the activation part
576 ▶  * of the Resolve phase of routing.
577 │  * @see {@link ActivationEnd}
578 │  * @see {@link ResolveStart}
579 │  *
580 │  * @publicApi
581 │  */
```

📄 `angular/packages/router/src/events.ts` L596–604 （▶ の行: 598–599）

```ts
596 │ 
597 │ /**
598 ▶  * An event triggered at the end of the activation part
599 ▶  * of the Resolve phase of routing.
600 │  * @see {@link ActivationStart}
601 │  * @see {@link ResolveStart}
602 │  *
603 │  * @publicApi
604 │  */
```

530〜531・575〜576・598〜599 行目は、どれも「Resolve の段（Resolve phase）の、子の activate / activate の部分の始まり（終わり）に出る」と書きます。`ChildActivationEnd` の doc（553〜554 行目、[前のシリーズ](../rdir/04-rdir-events.md)の引用）も同じ文です。実際の出る場所は 2 つに分かれます。

1. **Start の 2 つはガードの段の中**

   operators/check\_guards.ts が、`canActivateChild` / `canActivate` を走らせる直前に `ChildActivationStart(親)` → `ActivationStart(自分)` を出します（[Router.events の全種類](../router/17-router-events.md)の 4 節）。デモの「成功」では `GuardsCheckStart` と `GuardsCheckEnd` の間に 4 つ並びます。
2. **End の 2 つは activate の段**

   operators/activate\_routes.ts が、Route を activate したあとに `ActivationEnd(子)` → `ChildActivationEnd(親)` を出します。デモでは `ResolveEnd` のあと、`NavigationEnd` の前です。
3. **Resolve の段には 1 つも無い**

   `ResolveStart` と `ResolveEnd` の間に、この 4 つはどれも出ません。

`Event` 型の上の一覧（679〜690 行目）は、Start を `GuardsCheckEnd` の前、End を `ResolveEnd` の後に置いていて、こちらは実際の順と合います（[前のシリーズ](../rdir/04-rdir-events.md)の 6 節）。合わないのは各クラスの doc の「of the Resolve phase」だけです。この文は `ChildActivationStart` を足した 49cd8513e45（2017-07-25）と `ActivationStart` を足した 8f7915022c6（2017-09-06）からで、当時から `fireChildActivationStart` はガードを走らせる `checkGuards` の中にありました。

📄 `angular/packages/router/src/events.ts` L619–626 （▶ の行: 621）

```ts
619 │ 
620 │ /**
621 ▶  * An event triggered by scrolling.
622 │  *
623 │  * @publicApi
624 │  */
625 │ export class Scroll {
626 │   readonly type = EventType.Scroll;
```

621 行目は `Scroll` を「スクロールによって出る」と書きますが、出すのは `RouterScroller` で、`NavigationEnd`（か同じ URL の `NavigationSkipped`）を受けたあとです。利用者のスクロールでは出ません（`Event` の一覧の 695 行目も同じ言い方で、[前のシリーズ](../rdir/04-rdir-events.md)の 6 節）。このページのデモには `withInMemoryScrolling` を入れていないので `Scroll` は出ません。付けたときの数は[前回](05-rmd-features.md)の 2 節です。

## 6. 動かして確かめる

> **🧪 DEMO — 本物のナビゲーションで流れるイベントを、doc の順と並べる**
>
> ボタンを押すと、子の環境インジェクター（`createEnvironmentInjector` に `INJECTOR_SCOPE = 'root'` を置き、Router などをこのサイトと共有しない）に `provideRouter(routes)` で Router を作り、`initialNavigation()` のあとにその場面の移動をして、`Router.events` を全部記録し、`destroy` します。`PlatformLocation` は配列で履歴を持つ偽物で、「戻る」と「hash の変更」はその偽物が popstate / hashchange の listener を呼んで真似ます。このページの URL と履歴は変わりません。「doc の順」の列は、`Event` 型の doc（671〜695 行目）の並びでの番号です。前の行より小さい番号に戻ったところを強調します（新しい `NavigationStart` からは数え直す）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-events)

Node（domino の上の JIT）で同じデモのファイルを開発モードと本番の両方で走らせると、13 の場面のイベントの並びは同じで、違ったのは「一致する Route が無い」の例外の文（本番では `NG04002: 'no/such/route'` と短くなる）だけでした。「同じ URL」の `toString()` が `[object Object]` になるのは、`NavigationSkipped` にだけ `toString` が無いためです（[前のシリーズ](../rdir/04-rdir-events.md)の 2 節）。

## テストと直し方

### spec と it

| doc の約束 | spec（packages/router/test/ から） |
| --- | --- |
| 5 節 ChildActivation / Activation の順 | `integration/router_events.spec.ts` の `describe('route events')`（30 行目）› 31 行目 `should fire matching (Child)ActivationStart/End events`。順は確かめるが、どの段の中かは確かめない |
| 2 節 imperative のとき restoredState は null | `integration/navigation.spec.ts` の 243 行目 `should set the restoredState to null when executing imperative navigations`。初期ナビゲーションで null でないことを確かめる it は無い |
| 2 節 popstate の restoredState | `integration/integration.spec.ts` の 387〜394 行目（`navigationTrigger` が `'popstate'`、`restoredState.navigationId`） |
| 2 節 hashchange では始めない | `regression_integration.spec.ts` の 396 行目 `works with a duplicate popstate/hashchange navigation (as seen in firefox)` |
| 4 節 activate が無いと ResolveStart が出ない | 確かめる it は無い（`grep -rn ResolveStart packages/router/test` で、出ないことを確かめるものは 0 件） |
| 4 節 loadComponent の RouteConfigLoadStart | `router_preloader.spec.ts` の 176・380・414 行目が `RouteConfigLoadStart(path: lazy)` の文字列を確かめる（`loadChildren` の事前読み込み）。`loadComponent` で出ることを確かめる it は無い（716 行目の `describe('should preload loadComponent configs')` は spy の呼ばれ方だけを見る） |

### 手元で走らせた結果

../angular で `pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all` は `1170 specs, 0 failures` でした（2026-11-21）。describe で絞った件数は[第 9 回](09-rmd-tests-issues.md)にまとめます。

### 直すとしたら

- 5 節は events.ts の 530〜531・553〜554・575〜576・598〜599 行目の doc だけです。Start の 2 つは「ガードの段で、`canActivateChild` / `canActivate` を走らせる前に出る」、End の 2 つは「Route を activate したあとに出る」と書けば、実装と router\_events.spec.ts の 31 行目の it の順に合います。
- 2 節は 105〜106 行目に「初期ナビゲーションでも、`history.state` に `navigationId` があれば入る」を足すか、「popstate のとき」を外します。spec は navigation.spec.ts の 243 行目の隣に、`Location` の state を先に置いてから `initialNavigation()` する it を足す形です。
- 4 節の 430〜431 行目は「activate する Route があるときだけ、resolver の有無に関係なく出る」とします。spec は router\_events.spec.ts に、query だけを変えて `ResolveStart` が出ないことを確かめる it を足します。
- 4 節の 488 行目は「Route の設定か、`loadComponent` のコンポーネントを読み込む前」とします。

## 聞かれそうな質問

**Q. ChildActivationStart は、resolver が動いている間に出ますか？**

出ません。ガードの段の中（`GuardsCheckStart` と `GuardsCheckEnd` の間）で、ガードを走らせる前に出ます。530〜531 行目の「Resolve の段」は実装と合いません（5 節のデモの「成功」）。

**Q. restoredState が null でなければ「戻る」ボタンだと言えますか？**

言えません。再読み込みのあとの初期ナビゲーションも、trigger は `imperative` のまま `restoredState` に `history.state` が入ります。trigger と組にして見ます（2 節）。

**Q. navigationTrigger が 'hashchange' になることはありますか？**

今の Router ではありません。9e039ca68bf から popstate だけでナビゲーションを始め、trigger は `'popstate'` です。型にだけ残っています（2 節の注）。

**Q. ResolveStart は毎回出ますか？**

activate する Route があるときだけです。query だけを変えたときや、同じ URL を reload したときは、Resolve の段ごと飛ばされて出ません（4 節）。

**Q. RouteConfigLoadStart を数えれば、loadChildren の読み込みだけを数えられますか？**

いいえ。`loadComponent` でも出ます。`route.loadChildren` か `route.loadComponent` を見て分けます（4 節）。

## 読み終えて

- `RouterEvent` を継承するのはナビゲーション単位のイベントで、Route 単位の 6 つは継承しない。
- 4 つの (Child)Activation の doc は「Resolve の段」と書くが、Start はガードの段、End は activate の段で出る。
- `restoredState` は初期ナビゲーションでも入る。`'hashchange'` の trigger は出ない。
- `ResolveStart` は activate する Route が無いと出ない。
- `RouteConfigLoadStart` は `loadComponent` でも、Resolve の段のあとに出る。

---

← 前: [provideRouter の機能の説明文：withXxx の約束](05-rmd-features.md)  
次: [RouterLink・RouterLinkActive・RouterOutlet の説明文](07-rmd-directives.md) →
