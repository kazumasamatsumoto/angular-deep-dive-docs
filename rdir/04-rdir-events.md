[目次](../README.md) › [Router のディレクティブとイベントの残り：RouterLink・RouterLinkActive・RouterOutlet・events.ts を行で埋める](README.md) › 第 4 回 / 全 6 回

# events.ts の各クラス：toString と stringifyEvent・取り消しの理由のコードと reason

> events.ts の未読の行：各イベントのクラスの toString と、withDebugTracing だけが使う stringifyEvent の 2 本の道（NavigationSkipped だけ toString が無く String(e) が \[object Object\] になる）、state を 1 行にする serializeNode、id を持たない Route 単位の 6 クラス、NavigationCancellationCode・NavigationSkippedCode の値と、reason が本番でほぼ空になる理由。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rdir-events)

---

`router.events` に流れる 17 のクラスは、`console.log(String(e))` したときにどんな 1 行になるのか。`NavigationCancel` の `reason` は本番でも読めるのか。この章では events.ts の、まだ読んでいない行（各クラスの `toString`、`NavigationSkipped` の定義、Route 単位のイベント、`stringifyEvent` の残り）を読み、取り消しの理由のコードと文字列が、開発モードと本番でどう変わるかを、本物の Router を動かして確かめます。

読む対象は `packages/router/src/events.ts` と `navigation_canceling_error.ts`、`router_state.ts` の `toString` です（../angular、8576f161ae4）。イベントが出る順番と、それぞれを `events.next` している行は[Router.events の全種類](../router/17-router-events.md)にあり、ここでは繰り返しません。

1. [1. RouterLink の入力](01-rdir-link-inputs.md)
2. [2. RouterLinkActive の残り](02-rdir-link-active.md)
3. [3. RouterOutlet の入力と detach / attach](03-rdir-outlet.md)
4. **4. events.ts の各クラス**（この章）
5. [5. ExtraOptions と RouterModule](05-rdir-options.md)
6. [6. spec と issue](06-rdir-tests-issues.md)

## 1. 文字列にする道は 2 本ある

📄 `angular/packages/router/src/events.ts` L133–142 （▶ の行: 138–140）

```ts
133 │     super(id, url);
134 │     this.navigationTrigger = navigationTrigger;
135 │     this.restoredState = restoredState;
136 │   }
137 │ 
138 ▶   /** @docs-private */
139 ▶   override toString(): string {
140 ▶     return `NavigationStart(id: ${this.id}, url: '${this.url}')`;
141 │   }
142 │ }
```

📄 `angular/packages/router/src/events.ts` L164–171 （▶ の行: 167–169）

```ts
164 │     super(id, url);
165 │   }
166 │ 
167 ▶   /** @docs-private */
168 ▶   override toString(): string {
169 ▶     return `NavigationEnd(id: ${this.id}, url: '${this.url}', urlAfterRedirects: '${this.urlAfterRedirects}')`;
170 │   }
171 │ }
```

📄 `angular/packages/router/src/events.ts` L255–262 （▶ の行: 258–260）

```ts
255 │     super(id, url);
256 │   }
257 │ 
258 ▶   /** @docs-private */
259 ▶   override toString(): string {
260 ▶     return `NavigationCancel(id: ${this.id}, url: '${this.url}')`;
261 │   }
262 │ }
```

📄 `angular/packages/router/src/events.ts` L330–338 （▶ の行: 335–336）

```ts
330 │   ) {
331 │     super(id, url);
332 │   }
333 │ 
334 │   /** @docs-private */
335 ▶   override toString(): string {
336 ▶     return `NavigationError(id: ${this.id}, url: '${this.url}', error: ${this.error})`;
337 │   }
338 │ }
```

1 本目は各クラスの `toString` です。139〜140 行目の `NavigationStart` は `id` と `url` だけを出し、`navigationTrigger` も `restoredState` も出しません。168〜169 行目の `NavigationEnd` は `urlAfterRedirects` を足します。259〜260 行目の `NavigationCancel` は `reason` も `code` も出さないので、文字列だけでは取り消しの理由が分かりません。336 行目の `NavigationError` は `error: ${this.error}` と書くので、`Error` の `toString`（`Error: boom` の形）がそのまま入ります。138・167・258 行目の `@docs-private` は、API のドキュメントに出さないための印です（fc8140cff4c、2026-02-20 に `@docsNotRequired` から付け替えた）。

📄 `angular/packages/router/src/events.ts` L728–757 （▶ の行: 732–735, 738–739, 746–747, 752–753, 756）

```ts
728 │     case EventType.GuardsCheckEnd:
729 │       return `GuardsCheckEnd(id: ${routerEvent.id}, url: '${routerEvent.url}', urlAfterRedirects: '${routerEvent.urlAfterRedirects}', state: ${routerEvent.state}, shouldActivate: ${routerEvent.shouldActivate})`;
730 │     case EventType.GuardsCheckStart:
731 │       return `GuardsCheckStart(id: ${routerEvent.id}, url: '${routerEvent.url}', urlAfterRedirects: '${routerEvent.urlAfterRedirects}', state: ${routerEvent.state})`;
732 ▶     case EventType.NavigationCancel:
733 ▶       return `NavigationCancel(id: ${routerEvent.id}, url: '${routerEvent.url}')`;
734 ▶     case EventType.NavigationSkipped:
735 ▶       return `NavigationSkipped(id: ${routerEvent.id}, url: '${routerEvent.url}')`;
736 │     case EventType.NavigationEnd:
737 │       return `NavigationEnd(id: ${routerEvent.id}, url: '${routerEvent.url}', urlAfterRedirects: '${routerEvent.urlAfterRedirects}')`;
738 ▶     case EventType.NavigationError:
739 ▶       return `NavigationError(id: ${routerEvent.id}, url: '${routerEvent.url}', error: ${routerEvent.error})`;
740 │     case EventType.NavigationStart:
741 │       return `NavigationStart(id: ${routerEvent.id}, url: '${routerEvent.url}')`;
742 │     case EventType.ResolveEnd:
743 │       return `ResolveEnd(id: ${routerEvent.id}, url: '${routerEvent.url}', urlAfterRedirects: '${routerEvent.urlAfterRedirects}', state: ${routerEvent.state})`;
744 │     case EventType.ResolveStart:
745 │       return `ResolveStart(id: ${routerEvent.id}, url: '${routerEvent.url}', urlAfterRedirects: '${routerEvent.urlAfterRedirects}', state: ${routerEvent.state})`;
746 ▶     case EventType.RouteConfigLoadEnd:
747 ▶       return `RouteConfigLoadEnd(path: ${routerEvent.route.path})`;
748 │     case EventType.RouteConfigLoadStart:
749 │       return `RouteConfigLoadStart(path: ${routerEvent.route.path})`;
750 │     case EventType.RoutesRecognized:
751 │       return `RoutesRecognized(id: ${routerEvent.id}, url: '${routerEvent.url}', urlAfterRedirects: '${routerEvent.urlAfterRedirects}', state: ${routerEvent.state})`;
752 ▶     case EventType.Scroll:
753 ▶       const pos = routerEvent.position
754 │         ? `${routerEvent.position[0]}, ${routerEvent.position[1]}`
755 │         : null;
756 ▶       return `Scroll(anchor: '${routerEvent.anchor}', position: '${pos}')`;
757 │   }
```

2 本目が `stringifyEvent` です（L718から。前半の L718〜727は[Router.events の全種類](../router/17-router-events.md)の 1 節）。クラスのメソッドではなく、`type`（`EventType` の数）で分ける 1 つの関数で、呼ぶのは `withDebugTracing` の `console.log(stringifyEvent(e))`（provide\_router.ts L526）だけです。`@angular/router` の公開の入口からは export されていません（22.2.6 の `types/router.d.ts` の export に無い）。

2 本ある理由は、`stringifyEvent` を入れたコミット 41e2a68e30c（2021-11-16、`feat(router): add type properties to all router events`）の本文に書かれています。「`enableTracing` を `ngDevMode` で囲み、新しい `stringifyEvent` を使うことで、各イベントのクラスの文字列を作るコードを tree-shaking できるようにする。ただし壊れる変更を避けるため、元の `toString` は残す」。本番ビルドで `enableTracing` の分岐ごと消えれば `stringifyEvent` も消えますが、`toString` はクラスのメソッドなので、クラスを使うかぎり残ります。

## 2. NavigationSkipped だけ toString を持たない

📄 `angular/packages/router/src/events.ts` L272–302 （▶ の行: 280–281, 292, 298, 300–302）

```ts
272 │ /**
273 │  * An event triggered when a navigation is skipped.
274 │  * This can happen for a couple reasons including onSameUrlHandling
275 │  * is set to `ignore` and the navigation URL is not different than the
276 │  * current state.
277 │  *
278 │  * @publicApi
279 │  */
280 ▶ export class NavigationSkipped extends RouterEvent {
281 ▶   readonly type = EventType.NavigationSkipped;
282 │ 
283 │   constructor(
284 │     /** @docsNotRequired */
285 │     id: number,
286 │     /** @docsNotRequired */
287 │     url: string,
288 │     /**
289 │      * A description of why the navigation was skipped. For debug purposes only. Use `code`
290 │      * instead for a stable skipped reason that can be used in production.
291 │      */
292 ▶     public reason: string,
293 │     /**
294 │      * A code to indicate why the navigation was skipped. This code is stable for
295 │      * the reason and can be relied on whereas the `reason` string could change and should not be
296 │      * used in production.
297 │      */
298 ▶     readonly code?: NavigationSkippedCode,
299 │   ) {
300 ▶     super(id, url);
301 ▶   }
302 ▶ }
```

280 行目の `NavigationSkipped` は `RouterEvent` を継承し、292 行目の `reason` と 298 行目の `code` を持ちます。ところが 300〜302 行目でクラスが終わり、`toString` がありません。`RouterEvent`（L77〜84）にも `toString` は無いので、`String(e)` は `Object.prototype.toString` の `[object Object]` になります。

このクラスはコミット 73f03ad2d29（2022-11-10、`feat(router): Add new NavigationSkipped event for ignored navigations (#48024)`）で入りました。1 節の 41e2a68e30c のほうが 1 年早く、そのときから「新しい文字列は `stringifyEvent` に書く」形でした。73f03ad2d29 は `stringifyEvent` に 734〜735 行目の `case` を足しましたが、クラスに `toString` は足していません。だから `withDebugTracing` のログには `NavigationSkipped(id: …, url: '…')` と出て、利用者が自分で `String(e)` や `` `${e}` `` にすると `[object Object]` になります。

> **🧪 DEMO 1 — 17 のクラスを作って toString と stringifyEvent を並べる**
>
> ボタンを押すと、このページで `@angular/router` 22.2.6 のクラスを `new` して `String(e)` します（左）。右は同じ版を Node で読み、内部の `_router-chunk.mjs` から取り出した `stringifyEvent` に同じ引数のイベントを渡した記録です（記録のスクリプトは 5 節の下）。snapshot と state は、`routeConfig.path` が `'users'` のものと、`toString` が `Route(url:'users', path:'users')` を返すものを渡しています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rdir-events)

16 のクラスは 2 本の道で同じ文字列になり、`NavigationSkipped` だけが違います。`Scroll` の `anchor: 'null'` は、L645（[Router.events の全種類](../router/17-router-events.md)の引用）と 756 行目が `null` を引用符の中に入れるので、文字列の `'null'` と見分けがつかない形です。

## 3. state を持つ 5 つは、木を 1 行にする

📄 `angular/packages/router/src/events.ts` L340–365 （▶ の行: 345, 354, 356, 362–363）

```ts
340 │ /**
341 │  * An event triggered when routes are recognized.
342 │  *
343 │  * @publicApi
344 │  */
345 ▶ export class RoutesRecognized extends RouterEvent {
346 │   readonly type = EventType.RoutesRecognized;
347 │ 
348 │   constructor(
349 │     /** @docsNotRequired */
350 │     id: number,
351 │     /** @docsNotRequired */
352 │     url: string,
353 │     /** @docsNotRequired */
354 ▶     public urlAfterRedirects: string,
355 │     /** @docsNotRequired */
356 ▶     public state: RouterStateSnapshot,
357 │   ) {
358 │     super(id, url);
359 │   }
360 │ 
361 │   /** @docs-private */
362 ▶   override toString(): string {
363 ▶     return `RoutesRecognized(id: ${this.id}, url: '${this.url}', urlAfterRedirects: '${this.urlAfterRedirects}', state: ${this.state})`;
364 │   }
365 │ }
```

`RoutesRecognized`・`GuardsCheckStart`・`GuardsCheckEnd`・`ResolveStart`・`ResolveEnd` の 5 つは、354 行目の `urlAfterRedirects` と 356 行目の `state`（`RouterStateSnapshot`）を持ち、363 行目で `state: ${this.state}` と書きます。`RouterStateSnapshot` の `toString` は `serializeNode(this._root)` を返すだけです（router\_state.ts L536〜538、[ActivatedRoute と Snapshot](../router/14-router-router-state.md)の引用の範囲）。

📄 `angular/packages/router/src/router_state.ts` L540–549 （▶ の行: 546–548）

```ts
540 │ 
541 │ function setRouterState<U, T extends {_routerState: U}>(state: U, node: TreeNode<T>): void {
542 │   node.value._routerState = state;
543 │   node.children.forEach((c) => setRouterState(state, c));
544 │ }
545 │ 
546 ▶ function serializeNode(node: TreeNode<ActivatedRouteSnapshot>): string {
547 ▶   const c = node.children.length > 0 ? ` { ${node.children.map(serializeNode).join(', ')} } ` : '';
548 ▶   return `${node.value}${c}`;
549 │ }
```

📄 `angular/packages/router/src/router_state.ts` L486–495 （▶ の行: 491–494）

```ts
486 │   get queryParamMap(): ParamMap {
487 │     this._queryParamMap ??= convertToParamMap(this.queryParams);
488 │     return this._queryParamMap;
489 │   }
490 │ 
491 ▶   toString(): string {
492 ▶     const url = this.url.map((segment) => segment.toString()).join('/');
493 ▶     const matched = this.routeConfig ? this.routeConfig.path : '';
494 ▶     return `Route(url:'${url}', path:'${matched}')`;
495 │   }
```

547 行目、子があれば ` { 子, 子 } ` を前後の空白つきで足し、548 行目で自分（`ActivatedRouteSnapshot`）の `toString` を前に置きます。492 行目は自分の URL の区切りを `/` でつなぎ、493 行目は `routeConfig` が無ければ `''`。木の根は `routeConfig` を持たないので、いつも `Route(url:'', path:'')` から始まります。DEMO 2 の `RoutesRecognized` の行で、`Route(url:'', path:'') { Route(url:'guard-false', path:'guard-false') } ` の形が見えます（最後の空白も 547 行目のもの）。

## 4. Route 単位の 6 つ：id を持たず、path だけを出す

📄 `angular/packages/router/src/events.ts` L508–527 （▶ の行: 515, 520, 524–525）

```ts
508 │ /**
509 │  * An event triggered when a route has been lazy loaded.
510 │  *
511 │  * @see {@link RouteConfigLoadStart}
512 │  *
513 │  * @publicApi
514 │  */
515 ▶ export class RouteConfigLoadEnd {
516 │   readonly type = EventType.RouteConfigLoadEnd;
517 │ 
518 │   constructor(
519 │     /** @docsNotRequired */
520 ▶     public route: Route,
521 │   ) {}
522 │ 
523 │   /** @docs-private */
524 ▶   toString(): string {
525 ▶     return `RouteConfigLoadEnd(path: ${this.route.path})`;
526 │   }
527 │ }
```

📄 `angular/packages/router/src/events.ts` L537–572 （▶ の行: 537, 542, 546–548, 559, 564, 569–570）

```ts
537 ▶ export class ChildActivationStart {
538 │   readonly type = EventType.ChildActivationStart;
539 │ 
540 │   constructor(
541 │     /** @docsNotRequired */
542 ▶     public snapshot: ActivatedRouteSnapshot,
543 │   ) {}
544 │ 
545 │   /** @docs-private */
546 ▶   toString(): string {
547 ▶     const path = (this.snapshot.routeConfig && this.snapshot.routeConfig.path) || '';
548 ▶     return `ChildActivationStart(path: '${path}')`;
549 │   }
550 │ }
551 │ 
552 │ /**
553 │  * An event triggered at the end of the child-activation part
554 │  * of the Resolve phase of routing.
555 │  * @see {@link ChildActivationStart}
556 │  * @see {@link ResolveStart}
557 │  * @publicApi
558 │  */
559 ▶ export class ChildActivationEnd {
560 │   readonly type = EventType.ChildActivationEnd;
561 │ 
562 │   constructor(
563 │     /** @docsNotRequired */
564 ▶     public snapshot: ActivatedRouteSnapshot,
565 │   ) {}
566 │ 
567 │   /** @docs-private */
568 │   toString(): string {
569 ▶     const path = (this.snapshot.routeConfig && this.snapshot.routeConfig.path) || '';
570 ▶     return `ChildActivationEnd(path: '${path}')`;
571 │   }
572 │ }
```

📄 `angular/packages/router/src/events.ts` L605–618 （▶ の行: 605, 610, 615–616）

```ts
605 ▶ export class ActivationEnd {
606 │   readonly type = EventType.ActivationEnd;
607 │ 
608 │   constructor(
609 │     /** @docsNotRequired */
610 ▶     public snapshot: ActivatedRouteSnapshot,
611 │   ) {}
612 │ 
613 │   /** @docs-private */
614 │   toString(): string {
615 ▶     const path = (this.snapshot.routeConfig && this.snapshot.routeConfig.path) || '';
616 ▶     return `ActivationEnd(path: '${path}')`;
617 │   }
618 │ }
```

515 行目の `RouteConfigLoadEnd` も 537・559・605 行目の 3 つも、`RouterEvent` を継承しません。だから `id` も `url` も無く、どのナビゲーションのイベントかは文字列から分かりません。持っているのは 520 行目の `route`（`Route` の設定そのもの）か、542・564・610 行目の `snapshot`（`ActivatedRouteSnapshot`）です。

- 525 行目は `path: ${this.route.path}` と引用符なしで出します。`path` を書かず `matcher` だけの Route を遅延読み込みすると、`RouteConfigLoadStart(path: undefined)` になります。
- 547・569・615 行目は `(this.snapshot.routeConfig && this.snapshot.routeConfig.path) || ''` で、引用符つきです。`ChildActivationStart` は親の snapshot で出るので（[Router.events の全種類](../router/17-router-events.md)の 4 節）、親が木の根なら `ChildActivationStart(path: '')` です。
- 1 節の `stringifyEvent` は同じものを L721〜727で `routeConfig?.path || ''` と書いています。書き方は違いますが、DEMO 1 のとおり出力は同じです。

## 5. 取り消しの理由：code は残り、reason は本番で消える

`NavigationCancel` と `NavigationSkipped` は、理由を 2 つの形で持ちます。`code` は数の enum で、L179〜222の定義と、それぞれを作る行は[Router.events の全種類](../router/17-router-events.md)の 5 節にあります。値は次のとおりです（このページの本物の enum のオブジェクトから並べたもの）。

| enum | 名前 | 値 |
| --- | --- | --- |
| `NavigationCancellationCode` | `Redirect` | 0 |
| `NavigationCancellationCode` | `SupersededByNewNavigation` | 1 |
| `NavigationCancellationCode` | `NoDataFromResolver` | 2 |
| `NavigationCancellationCode` | `GuardRejected` | 3 |
| `NavigationCancellationCode` | `Aborted` | 4 |
| `NavigationSkippedCode` | `IgnoredSameUrlNavigation` | 0 |
| `NavigationSkippedCode` | `IgnoredByUrlHandlingStrategy` | 1 |

もう 1 つの `reason` は文字列で、L244〜245のコメントが「デバッグ用。本番では `code` を使う」と書いています。その理由は、`reason` を作る行のほとんどが `typeof ngDevMode === 'undefined' || ngDevMode ? '…' : ''` の形だからです（navigation\_transition.ts L467〜470・L479〜482・L714〜716・L881〜884など）。同じ版の Router を Node で、開発モードと `globalThis.ngDevMode = false`（本番ビルドと同じ）の 2 回走らせた記録です。

| シナリオ | イベント | code | reason（開発モード） | reason（本番） | Promise |
| --- | --- | --- | --- | --- | --- |
| ガードが false | `NavigationCancel` | 3 | `""` | `""` | false |
| ガードがリダイレクト | `NavigationCancel` | 0 | `"NavigationCancelingError: Redirecting to \"/b\""` | `"NavigationCancelingError: "` | true |
| 同じ URL | `NavigationSkipped` | 0 | `"Navigation to /b was ignored because it is the same as the current Router URL."` | `""` | false |
| 割り込み | `NavigationCancel` | 1 | `"Navigation ID 6 is not equal to the current navigation id 7"` | `""` | false |
| abort() | `NavigationCancel` | 4 | `"AbortError: This operation was aborted"` | `"AbortError: This operation was aborted"` | false |
| resolver が空 | `NavigationCancel` | 2 | `"At least one route resolver didn't emit any value."` | `""` | false |
| canLoad が false | `NavigationCancel` | 3 | `"NavigationCancelingError: Cannot load children because the guard of the route \"path: 'lazy'\" returned false"` | `"NavigationCancelingError: "` | false |
| UrlHandlingStrategy（2 回目） | `NavigationSkipped` | 1 | `"Navigation was ignored because the UrlHandlingStrategy indicated neither the current URL /legacy/1 nor target URL /legacy/2 should be processed."` | `""` | false |

本番で空にならない 3 つには、それぞれ行の理由があります。

📄 `angular/packages/router/src/navigation_canceling_error.ts` L45–62 （▶ の行: 45, 47, 51, 55–56, 60–61）

```ts
45 ▶   const error = new Error(`NavigationCancelingError: ${message || ''}`) as NavigationCancelingError;
46 │   error[NAVIGATION_CANCELING_ERROR] = true;
47 ▶   error.cancellationCode = code;
48 │   return error;
49 │ }
50 │ 
51 ▶ export function isRedirectingNavigationCancelingError(
52 │   error: unknown | RedirectingNavigationCancelingError,
53 │ ): error is RedirectingNavigationCancelingError {
54 │   return (
55 ▶     isNavigationCancelingError(error) &&
56 ▶     isUrlTree((error as RedirectingNavigationCancelingError).url)
57 │   );
58 │ }
59 │ 
60 ▶ export function isNavigationCancelingError(error: unknown): error is NavigationCancelingError {
61 ▶   return !!error && (error as NavigationCancelingError)[NAVIGATION_CANCELING_ERROR];
62 │ }
```

- **リダイレクトと canLoad：**ガードの `UrlTree`（`redirectingNavigationError`）と canLoad の false（apply\_redirects.ts の `canLoadFails`）は、どちらも例外の `Error` を投げ、catchError が `e.message` を `reason` にします（navigation\_transition.ts L916〜923）。45 行目がメッセージの頭に `NavigationCancelingError: ` を付けるので、中身が `ngDevMode` で空になっても頭だけ残ります。47 行目の `cancellationCode` がそのまま `code` です。
- **同じ GuardRejected の 2 つの道：**canActivate の false は navigation\_transition.ts L677で `cancelNavigationTransition(t, '', …)` と書くので、開発モードでも `reason` が空です。canLoad の false は上の道なので、開発モードでは Route の path まで入ります。`code` はどちらも 3 です。
- **abort()：**navigation\_transition.ts L844が `abortController.signal.reason + ''` で、`ngDevMode` で囲んでいません。`AbortSignal` の `reason`（`DOMException`）の文字列なので、メッセージは実行する環境が決めます（Node 24 は `This operation was aborted`、Chrome は `signal is aborted without reason`）。

55〜56 行目の `isRedirectingNavigationCancelingError` は、例外が `url`（`UrlTree`）を持つかで「リダイレクトの取り消し」を見分けます。持っていれば、取り消しのあとに非公開の `RedirectRequest` を流します（[Router.events の全種類](../router/17-router-events.md)の 5 節）。

> **🧪 DEMO 2 — 別のアプリの Router で取り消しと飛ばしを起こす**
>
> 最初にボタンを押したとき、`createApplication` でこのサイトとは別のアプリを作り、`provideRouter` の本物の Router を動かします。Router が使う `NavigationTransitions`・`StateManager`・`Location` は `providedIn: 'root'` なので、`createEnvironmentInjector` の子の注入器ではこのサイトの物が使われてしまいます。別のアプリにすれば、どれも新しく作られます。`PlatformLocation` だけを「URL を配列に積むだけ」の偽物に替えているので、このページの URL と履歴は変わりません。毎回 `'/'` へ戻してから始め、その移動のイベントは表に出しません。このページは本番ビルドなので、`reason` は上の表の「本番」の列と同じになります（2026-11-19 に headless Chrome で全部のボタンを押して確かめた。`abort()` の文字列だけは Chrome が `AbortError: signal is aborted without reason` と出す）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rdir-events)

> [!WARNING]
> **ハマりどころ**
>
> 「同じ URL」と「UrlHandlingStrategy」の行の `String(e)` が `[object Object]` になるのが 2 節の結果です。本番ビルドではクラスの名前が縮められて `e.constructor.name` が使えないので、表の 2 列目は `e.type`（L33〜51の `EventType` の順）から名前を引いています。

📄 `記録のスクリプト（events-record.mjs、DEMO 1 の右の列と 5 節の表）`

```
// rdir-events の記録: @angular/router（サイトの依存）の本物のクラスで toString と stringifyEvent を比べ、
// 別のアプリの Router で取り消し・飛ばしのシナリオを走らせて code と reason を集める。
// 使い方: node events-record.mjs <angular-deep-dive のディレクトリ> [prod]
//   prod を付けると @angular/* を読む前に globalThis.ngDevMode = false にする（本番ビルドと同じ）。
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';

const [root, mode] = process.argv.slice(2);
if (mode === 'prod') {
  globalThis.ngDevMode = false;
  globalThis.ngServerMode = false;
}
const req = createRequire(join(root, 'package.json'));
const serverDir = dirname(req.resolve('@angular/platform-server/package.json'));
const domino = (await import(pathToFileURL(join(serverDir, 'third_party/domino/bundled-domino.mjs')).href)).default;
const win = domino.createWindow('<html><head></head><body></body></html>', 'http://localhost/');
Object.assign(globalThis, domino.impl);
globalThis.window = win;
globalThis.document = win.document;
const load = (id) => import(pathToFileURL(req.resolve(id)).href);
await load('@angular/compiler');
const core = await load('@angular/core');
const common = await load('@angular/common');
const r = await load('@angular/router');
const rxjs = await load('rxjs');
const {createApplication} = await load('@angular/platform-browser');
// stringifyEvent は公開されていないので、同じ版の内部の塊から読む
const routerDir = dirname(req.resolve('@angular/router/package.json'));
const chunk = await import(pathToFileURL(join(routerDir, 'fesm2022/_router-chunk.mjs')).href);

// ---- 1. 17 のクラスを作って toString と stringifyEvent ----
const snap = {routeConfig: {path: 'users'}};
const stateLike = {toString: () => 'Route(url:\'users\', path:\'users\')'};
const make = [
  ['NavigationStart', () => new r.NavigationStart(1, '/users')],
  ['NavigationEnd', () => new r.NavigationEnd(1, '/old', '/users')],
  ['NavigationCancel', () => new r.NavigationCancel(1, '/users', 'reason', r.NavigationCancellationCode.GuardRejected)],
  ['NavigationSkipped', () => new r.NavigationSkipped(1, '/users', 'reason', r.NavigationSkippedCode.IgnoredSameUrlNavigation)],
  ['NavigationError', () => new r.NavigationError(1, '/users', new Error('boom'))],
  ['RoutesRecognized', () => new r.RoutesRecognized(1, '/users', '/users', stateLike)],
  ['GuardsCheckStart', () => new r.GuardsCheckStart(1, '/users', '/users', stateLike)],
  ['GuardsCheckEnd', () => new r.GuardsCheckEnd(1, '/users', '/users', stateLike, true)],
  ['ResolveStart', () => new r.ResolveStart(1, '/users', '/users', stateLike)],
  ['ResolveEnd', () => new r.ResolveEnd(1, '/users', '/users', stateLike)],
  ['RouteConfigLoadStart', () => new r.RouteConfigLoadStart({path: 'admin'})],
  ['RouteConfigLoadEnd', () => new r.RouteConfigLoadEnd({path: 'admin'})],
  ['ChildActivationStart', () => new r.ChildActivationStart(snap)],
  ['ChildActivationEnd', () => new r.ChildActivationEnd(snap)],
  ['ActivationStart', () => new r.ActivationStart(snap)],
  ['ActivationEnd', () => new r.ActivationEnd(snap)],
  ['Scroll', () => new r.Scroll(new r.NavigationEnd(1, '/a', '/a'), null, null)],
];
const classes = make.map(([name, f]) => {
  const e = f();
  return {name, type: e.type, toString: String(e), stringify: chunk.stringifyEvent(e), same: String(e) === chunk.stringifyEvent(e)};
});

// ---- 2. 別のアプリの Router でシナリオ ----
class FakePlatformLocation extends common.PlatformLocation {
  path = '/';
  stack = [{url: '/', state: null}];
  getBaseHrefFromDOM() { return '/'; }
  getState() { return this.stack.at(-1).state; }
  onPopState() { return () => {}; }
  onHashChange() { return () => {}; }
  get href() { return 'http://demo' + this.path; }
  get protocol() { return 'http:'; }
  get hostname() { return 'demo'; }
  get port() { return ''; }
  get pathname() { return this.path.split('?')[0].split('#')[0]; }
  get search() { return ''; }
  get hash() { return ''; }
  pushState(state, _t, url) { this.path = url; this.stack.push({url, state}); }
  replaceState(state, _t, url) { this.path = url; this.stack[this.stack.length - 1] = {url, state}; }
  forward() {}
  back() {}
  historyGo() {}
}
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
class SkipLegacy extends r.UrlHandlingStrategy {
  shouldProcessUrl(url) { return !url.toString().startsWith('/legacy'); }
  extract(url) { return url; }
  merge(newUrlPart) { return newUrlPart; }
}
const routes = [
  {path: '', children: []},
  {path: 'a', children: []},
  {path: 'b', children: []},
  {path: 'guard-false', canActivate: [() => false], children: []},
  {path: 'guard-redirect', canActivate: [() => core.inject(r.Router).parseUrl('/b')], children: []},
  {path: 'resolver-empty', resolve: {x: () => rxjs.EMPTY}, children: []},
  {path: 'slow', canActivate: [() => wait(30).then(() => true)], children: []},
  {path: 'lazy', canLoad: [() => false], loadChildren: () => []},
];
const app = await createApplication({
  providers: [
    core.provideZonelessChangeDetection(),
    r.provideRouter(routes),
    {provide: common.PlatformLocation, useFactory: () => new FakePlatformLocation()},
    {provide: r.UrlHandlingStrategy, useFactory: () => new SkipLegacy()},
  ],
});
const router = app.injector.get(r.Router);
let log = [];
router.events.subscribe((e) => {
  const row = {cls: e.constructor.name, toString: String(e)};
  if (e instanceof r.NavigationCancel || e instanceof r.NavigationSkipped) {
    row.code = e.code;
    row.reason = e.reason;
  }
  log.push(row);
});
const scenarios = [];
async function run(key, f) {
  log = [];
  let result;
  try {
    result = await f();
  } catch (e) {
    result = 'reject: ' + e;
  }
  await wait(50);
  scenarios.push({key, result: String(result), url: router.url, events: log.filter((x) => /Cancel|Skipped|NavigationStart|NavigationEnd|NavigationError/.test(x.cls))});
}
await run('first', () => router.navigateByUrl('/a'));
await run('guard-false', () => router.navigateByUrl('/guard-false'));
await run('guard-redirect', () => router.navigateByUrl('/guard-redirect'));
await run('same-url', () => router.navigateByUrl(router.url));
await run('superseded', () => { const p = router.navigateByUrl('/slow'); router.navigateByUrl('/a'); return p; });
await run('abort', () => { const p = router.navigateByUrl('/slow'); router.currentNavigation()?.abort(); return p; });
await run('resolver-empty', () => router.navigateByUrl('/resolver-empty'));
await run('can-load-false', () => router.navigateByUrl('/lazy'));
await run('legacy-1', () => router.navigateByUrl('/legacy/1'));
await run('legacy-2', () => router.navigateByUrl('/legacy/2'));
app.destroy();
console.log(JSON.stringify({version: core.VERSION.full, mode: mode ?? 'dev', classes, scenarios}, null, 2));

```

## 6. Event の説明にあるもの・無いもの

📄 `angular/packages/router/src/events.ts` L666–698 （▶ の行: 667, 669, 679, 681–682, 692–693, 695）

```ts
666 │ /**
667 ▶  * Router events that allow you to track the lifecycle of the router.
668 │  *
669 ▶  * The events occur in the following sequence:
670 │  *
671 │  * * [NavigationStart](api/router/NavigationStart): Navigation starts.
672 │  * * [RouteConfigLoadStart](api/router/RouteConfigLoadStart): Before
673 │  * the router [lazy loads](guide/routing/loading-strategies) a route configuration.
674 │  * * [RouteConfigLoadEnd](api/router/RouteConfigLoadEnd): After a route has been lazy loaded.
675 │  * * [RoutesRecognized](api/router/RoutesRecognized): When the router parses the URL
676 │  * and the routes are recognized.
677 │  * * [GuardsCheckStart](api/router/GuardsCheckStart): When the router begins the *guards*
678 │  * phase of routing.
679 ▶  * * [ChildActivationStart](api/router/ChildActivationStart): When the router
680 │  * begins activating a route's children.
681 ▶  * * [ActivationStart](api/router/ActivationStart): When the router begins activating a route.
682 ▶  * * [GuardsCheckEnd](api/router/GuardsCheckEnd): When the router finishes the *guards*
683 │  * phase of routing successfully.
684 │  * * [ResolveStart](api/router/ResolveStart): When the router begins the *resolve*
685 │  * phase of routing.
686 │  * * [ResolveEnd](api/router/ResolveEnd): When the router finishes the *resolve*
687 │  * phase of routing successfully.
688 │  * * [ChildActivationEnd](api/router/ChildActivationEnd): When the router finishes
689 │  * activating a route's children.
690 │  * * [ActivationEnd](api/router/ActivationEnd): When the router finishes activating a route.
691 │  * * [NavigationEnd](api/router/NavigationEnd): When navigation ends successfully.
692 ▶  * * [NavigationCancel](api/router/NavigationCancel): When navigation is canceled.
693 ▶  * * [NavigationError](api/router/NavigationError): When navigation fails
694 │  * due to an unexpected error.
695 ▶  * * [Scroll](api/router/Scroll): When the user scrolls.
696 │  *
697 │  * @publicApi
698 │  */
```

L699の `Event` 型（17 の union）の上の説明です。669 行目は「次の順で起きる」と書き、16 のクラスを並べますが、`NavigationSkipped` がありません（L716の union には入っている）。695 行目の `Scroll` は「利用者がスクロールしたとき」と書いていますが、`Scroll` を流すのは `RouterScroller` で、`NavigationEnd` か同じ URL の `NavigationSkipped` を受けたあとです（[Router.events の全種類](../router/17-router-events.md)の 4 節）。679・681 行目の `ChildActivationStart`・`ActivationStart` が 682 行目の `GuardsCheckEnd` より前にあるのは、実際の順（ガードの段の中で出る）と合っています。

📄 `angular/packages/router/src/events.ts` L14–24 （▶ の行: 17–19, 23–24）

```ts
14 │ /**
15 │  * Identifies the call or event that triggered a navigation.
16 │  *
17 ▶  * * 'imperative': Triggered by `router.navigateByUrl()` or `router.navigate()`.
18 ▶  * * 'popstate' : Triggered by a `popstate` event.
19 ▶  * * 'hashchange'-: Triggered by a `hashchange` event.
20 │  *
21 │  * @publicApi
22 │  */
23 ▶ export type NavigationTrigger = 'imperative' | 'popstate' | 'hashchange';
24 ▶ export const IMPERATIVE_NAVIGATION = 'imperative';
```

23 行目の `NavigationTrigger` は `NavigationStart.navigationTrigger` の型です。19 行目は `'hashchange'-:` と、ほかの 2 行の `:` の前に余計な `-` があります。24 行目の `IMPERATIVE_NAVIGATION` は公開されない定数で、`navigateByUrl` が `scheduleNavigation` に渡す値です。公開されないイベント（`BeforeActivateRoutes`・`BeforeRoutesRecognized`・`RedirectRequest`）と `isPublicRouterEvent` は[Router.events の全種類](../router/17-router-events.md)の 2 節にあります。`isPublicRouterEvent` は 72dd1330f22（2025-04-02）で、非公開の union の隣に移されました。コミットの本文は「非公開の union を変えるときに一緒に直すことが分かるように」です。

## テストと直し方

### spec と it

パスは `packages/router/test/integration/` から。この 4 つのファイルは `integration.spec.ts` の `for (const browserAPI of ['navigation', 'history'])` の中で 2 回ずつ登録されるので、走らせた数は it の倍です。

| ファイル | describe › it（行） | 確かめていること | この章 |
| --- | --- | --- | --- |
| `router_events.spec.ts` | `route events`（30）› 31 `should fire matching (Child)ActivationStart/End events` | 4 節の 4 つのクラスの `snapshot` と、出る順 | 4 節 |
| `guards.spec.ts` | `guards`（80）› `CanLoad`（1585）› 1602 `should not load children when CanLoad returns false` | `code` が `GuardRejected`（1641〜1643 行目） | 5 節 |
| `route_data.spec.ts` | `data`（45）› 167 `should not navigate when all resolvers return empty result` | `NoDataFromResolver`（L196） | 5 節 |
| `navigation.spec.ts` | `navigation`（62）› 478・506・539・577 `cancels navigation immediately …` | `SupersededByNewNavigation`（L503・L536・L574・L612） | 5 節 |
| `navigation.spec.ts` | `abort an ongoing navigation`（879）› 880 `resolves the promise, clears current navigation, and send NavigationCancel` | `toBeInstanceOf(NavigationCancel)` だけ（L891）。`code` が `Aborted` かは見ていない | 5 節 |
| `lazy_loading.spec.ts` | `custom url handling strategies`（886）› 930・1008 | `[NavigationSkipped, url]` のクラスと url（L987・L1045）。`code` は見ていない | 5 節 |

📄 `angular/packages/router/test/integration/guards.spec.ts` L1620–1643 （▶ の行: 1622, 1630, 1635, 1638, 1641–1642）

```ts
1620 │ 
1621 │         router.resetConfig([
1622 ▶           {path: 'lazyFalse', canLoad: [() => false], loadChildren: () => LoadedModule},
1623 │           {path: 'lazyTrue', canLoad: [() => true], loadChildren: () => LoadedModule},
1624 │         ]);
1625 │ 
1626 │         const recordedEvents: Event[] = [];
1627 │         router.events.forEach((e) => recordedEvents.push(e));
1628 │ 
1629 │         // failed navigation
1630 ▶         router.navigateByUrl('/lazyFalse/loaded');
1631 │         await advance(fixture);
1632 │ 
1633 │         expect(location.path()).toEqual('');
1634 │ 
1635 ▶         expectEvents(recordedEvents, [
1636 │           [NavigationStart, '/lazyFalse/loaded'],
1637 │           //  [GuardsCheckStart, '/lazyFalse/loaded'],
1638 ▶           [NavigationCancel, '/lazyFalse/loaded'],
1639 │         ]);
1640 │ 
1641 ▶         expect((recordedEvents[1] as NavigationCancel).code).toBe(
1642 ▶           NavigationCancellationCode.GuardRejected,
1643 │         );
```

1622 行目の `canLoad: [() => false]` は DEMO 2 の「canLoad が false」と同じ設定です。1635〜1638 行目、`GuardsCheckStart` がコメントになっているのは、canLoad は recognize の段（ガードの段より前）で止まるからです。1641〜1642 行目が `code` を確かめ、`reason` は見ていません。`reason` は 5 節のとおり開発モードと本番で変わるので、spec が見ないのは L244〜245のコメントと合っています。

`grep -rn "toString()" packages/router/test` で、イベントの `toString` を確かめているのは `RouteConfigLoadStart` / `RouteConfigLoadEnd` だけでした。`router_preloader.spec.ts` の 9 か所（L175など、`describe('RouterPreloader')` の中、`--filter=RouterPreloader` で 22 specs）と、`lazy_loading.spec.ts` 342〜343 行目（295 行目の `should emit RouteConfigLoadStart and RouteConfigLoadEnd event when route is lazy loaded`、2 specs）で、どれも `'RouteConfigLoadStart(path: lazy)'` の形です。ほかの 15 クラスの `toString`、`stringifyEvent`、`NavigationSkippedCode.` の値、`NavigationCancellationCode.Aborted` を確かめる spec は 0 件です。

### 手元で走らせた結果

📄 `走らせたコマンドと結果（2026-11-19、8576f161ae4）`

```
$ cd ~/angular-research/angular        # 8576f161ae4
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all
1170 specs, 0 failures
$ pnpm bazel test //packages/router/test:test_web --nocache_test_results --test_output=all
Chromium: 1180 passed, 0 failed / Firefox: 1178 passed, 0 failed
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all "--test_arg=--filter=route events"
Ran 8 of 1170 specs（4 本 × navigation / history）、0 failures
  --filter=CanLoad                          Ran 23 of 1170 specs、0 failures
  --filter=abort an ongoing navigation      Ran 14 of 1170 specs、0 failures
  --filter=custom url handling strategies   Ran 6 of 1170 specs、0 failures
  --filter=cancels navigation immediately   Ran 8 of 1170 specs、0 failures
  --filter=should not navigate when all resolvers return empty result   Ran 2 of 1170 specs、0 failures
  --filter=RouterPreloader                  Ran 22 of 1170 specs、0 failures
```

### 直すとしたら

2 節の `NavigationSkipped` は、events.ts の 301 行目のあとに、ほかのクラスと同じ形の `/** @docs-private */ override toString()` を足せば、`stringifyEvent` の 734〜735 行目と同じ文字列になります。spec は router\_events.spec.ts の `describe('route events')` に、同じ URL へ 2 回移動して `NavigationSkipped` の `toString()` を確かめる it を足す形です。作業木（8576f161ae4）でこの it だけを先に足すと、2 回（navigation と history）とも `Expected '[object Object]' to equal 'NavigationSkipped(id: 3, url: '/user/frodo')'.` で落ち（Ran 2 of 1172 specs、2 failures）、`toString` を足すと 2 specs, 0 failures、全体も 1172 specs, 0 failures でした。公開 API の golden（`goldens/public-api/router/index.api.md`）は変わります。`//packages/router:router_api` が `NavigationSkipped` に `+ toString(): string;` の 1 行が増えたと言って落ちました。fc8140cff4c が golden から消したのは `// (undocumented)` の注記だけで、ほかの 16 クラスの `toString(): string;` は golden に残っています。

6 節の 19 行目の `-` と、669 行目の一覧に `NavigationSkipped` が無いことは、doc コメントだけの話で、spec はありません。

## 聞かれそうな質問

**Q. console.log(String(event)) で NavigationSkipped が \[object Object\] になるのはなぜですか？**

NavigationSkipped のクラス（280〜302 行目）に `toString` が無く、親の `RouterEvent`（L77〜84）にも無いからです。ほかの 16 クラスはそれぞれ `toString` を持ちます。`withDebugTracing` は `stringifyEvent`（734〜735 行目に case がある）を使うので、トレースのログでは正しく出ます。

**Q. 本番で NavigationCancel の理由を出し分けたいとき、reason を見てよいですか？**

見ても空です。reason を作る行の多くが `ngDevMode` で囲まれ、本番では `''` になります（5 節の表）。リダイレクトと canLoad は頭の `NavigationCancelingError: ` だけが残ります（navigation\_canceling\_error.ts 45 行目）。出し分けは `code`（`NavigationCancellationCode` の 0〜4）でします。

**Q. canActivate の false と canLoad の false は、同じ code ですか？**

どちらも `GuardRejected`（3）です。ただし通り道が違い、canActivate は navigation\_transition.ts L677で reason を `''` にし、canLoad は `navigationCancelingError` の例外を catchError が受けて `e.message` を reason にします。開発モードでは canLoad の方だけ文字列があります。

**Q. ActivationEnd のイベントから、どのナビゲーションのものか分かりますか？**

イベント自身からは分かりません。Route 単位の 6 クラスは `RouterEvent` を継承せず（515・537・559・605 行目）、`id` を持ちません。直前の `NavigationStart` の `id` を覚えておくか、`router.currentNavigation()` を読みます。

**Q. stringifyEvent は何のためにあるのですか？**

41e2a68e30c の本文のとおり、`enableTracing` を `ngDevMode` の中に閉じ込め、文字列を作るコードを本番ビルドから消すためです。`toString` は壊れる変更を避けるために残されたので、同じ文字列を作るコードが 2 か所にあります。

## 読み終えて

- イベントを文字列にする道は、各クラスの `toString` と、`withDebugTracing` だけが使う `stringifyEvent` の 2 本。
- `NavigationSkipped` は `stringifyEvent` にだけ case があり、`toString` が無いので `String(e)` が `[object Object]`。spec も無い。
- state を持つ 5 つは `serializeNode` で木を 1 行にし、Route 単位の 6 つは `id` を持たず path だけを出す。
- `reason` は本番でほぼ空。残るのは `NavigationCancelingError: ` の頭と `abort()` の `AbortSignal` の理由だけで、安定しているのは `code`。

---

← 前: [RouterOutlet の入力と detach / attach：名前付きの出口と routerOutletData](03-rdir-outlet.md)  
次: [ExtraOptions と RouterModule.forRoot：設定の型と、withX との対応表](05-rdir-options.md) →
