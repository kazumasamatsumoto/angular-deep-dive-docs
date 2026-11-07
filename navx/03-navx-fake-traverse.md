[目次](../README.md) › [Navigation API と FakeNavigation](README.md) › 第 3 回 / 全 7 回

# FakeNavigation の戻る・進む：traverseTo と、取り消された traverse

> traverseTo・back・forward・go が entries の中の位置を動かす行、synchronousTraversals、updateNavigationEntriesForSameDocumentNavigation が push・replace・traverse で entries を書き換える行、popstate と hashchange と currententrychange の順。取り消された traverse の修正（86dc1283e8c）と、仕様の更新に合わせた変更（d3552051988・5988bdedaeb、新しい本家の a8233232f5a）。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/navx-fake-traverse)

---

ブラウザの「戻る」「進む」は、Navigation API では `traverse`（既存のエントリへの移動）という種類の遷移です。この章では、偽物の `traverseTo`・`back`・`forward`・`go` が entries の中の位置を動かす行と、本物のブラウザの「別のプロセスとのやりとりで遅れる」を真似る `setTimeout` の待ち行列、push・replace・traverse の 3 つで entries を書き換える `updateNavigationEntriesForSameDocumentNavigation`、そして `currententrychange`・`popstate`・`hashchange` が配られる順を読みます。取り消された traverse の修正（86dc1283e8c）と、仕様の更新に合わせた変更（d3552051988・5988bdedaeb、新しい本家の a8233232f5a）も git show で読みます。

読む対象は `packages/core/primitives/dom-navigation/testing/fake_navigation.ts` の前半のメソッドと `FakeNavigationHistoryEntry`、イベントを作る関数です。navigate イベントを配って commit するまでの共通の流れは[第 2 回](02-navx-fake-navigate.md)で読みました。Router が戻る・進むをどう扱うかは[Router の Navigation API の章](../router/21-router-platform-navigation.md)にあります。

1. [1. 型と PlatformNavigation](01-navx-api-types.md)
2. [2. FakeNavigation の navigate](02-navx-fake-navigate.md)
3. **3. 戻る・進む**（この章）
4. [4. precommitHandler](04-navx-precommit.md)
5. [5. Router の連携の残り](05-navx-router-integration.md)
6. [6. テストの土台](06-navx-testing.md)
7. [7. spec と issue](07-navx-tests-issues.md)

## 1. traverse のための 4 つの欄

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L50–72 （▶ の行: 54, 60, 66, 72）

```ts
50 │   /**
51 │    * A Map of pending traversals, so that traversals to the same entry can be
52 │    * re-used.
53 │    */
54 ▶   private readonly traversalQueue = new Map<string, InternalNavigationResult>();
55 │ 
56 │   /**
57 │    * A Promise that resolves when the previous traversals have finished. Used to
58 │    * simulate the cross-process communication necessary for traversals.
59 │    */
60 ▶   private nextTraversal = Promise.resolve();
61 │ 
62 │   /**
63 │    * A prospective current active entry index, which includes unresolved
64 │    * traversals. Used by `go` to determine where navigations are intended to go.
65 │    */
66 ▶   private propsectiveTraversalDestinations: number[] = [];
67 │ 
68 │   /**
69 │    * A test-only option to make traversals synchronous, rather than emulate
70 │    * cross-process communication.
71 │    */
72 ▶   private synchronousTraversals = false;
```

- 54 行目 `traversalQueue`：行き先の `key` → 結果の入れ物。同じエントリへの traverse を 1 つにまとめます（2 節）。
- 60 行目 `nextTraversal`：前の traverse が終わったら resolve する Promise。コメントは「traverse に要るプロセス間のやりとりを真似る」と書いています（4 節）。
- 66 行目 `propsectiveTraversalDestinations`：まだ終わっていない traverse の行き先の番号の列。`go` がどこへ行くつもりかを決めるのに使います（綴りは原文のまま。prospective の誤り）。
- 72 行目 `synchronousTraversals`：テスト用に traverse を同期にするか。`TestBed` が使う `provideFakePlatformNavigation()` は `true` にします（[第 6 回](06-navx-testing.md)）。

## 2. traverseTo：行き先を探し、待ち行列に入れる

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L268–296 （▶ の行: 271–273, 276, 283, 285, 289–290, 292）

```ts
268 │   /** Equivalent to `navigation.traverseTo()`. */
269 │   traverseTo(key: string, options?: NavigationOptions): FakeNavigationResult {
270 │     const fromUrl = new URL(this.currentEntry.url!);
271 ▶     const entry = this.findEntry(key);
272 ▶     if (!entry) {
273 ▶       const domException = new DOMException('Invalid key', 'InvalidStateError');
274 │       const committed = Promise.reject(domException);
275 │       const finished = Promise.reject(domException);
276 ▶       committed.catch(() => {});
277 │       finished.catch(() => {});
278 │       return {
279 │         committed,
280 │         finished,
281 │       };
282 │     }
283 ▶     if (entry === this.currentEntry) {
284 │       return {
285 ▶         committed: Promise.resolve(this.currentEntry),
286 │         finished: Promise.resolve(this.currentEntry),
287 │       };
288 │     }
289 ▶     if (this.traversalQueue.has(entry.key)) {
290 ▶       const existingResult = this.traversalQueue.get(entry.key)!;
291 │       return {
292 ▶         committed: existingResult.committed,
293 │         finished: existingResult.finished,
294 │       };
295 │     }
296 │ 
```

1. **271〜282 行目：無い key なら、2 つとも reject 済みの Promise を返す**

   273 行目の `InvalidStateError` で reject し、276〜277 行目で空の catch を付けます。イベントは何も配られません。
2. **283〜288 行目：いまのエントリへの traverse は、すぐ resolve**

   これもイベントは配られません（spec の `traversal current entry`）。
3. **289〜295 行目：同じエントリへの traverse が待ち行列にあれば、その結果をそのまま返す**

   292 行目、返す `committed` は 1 回目と**同じ Promise オブジェクト**です。navigate イベントも 1 回しか配られません（spec の `second traversal to same entry`）。

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L297–329 （▶ の行: 297–298, 302, 304, 307, 309–313, 321–322）

```ts
297 ▶     const hashChange = isHashChange(fromUrl, new URL(entry.url!, this.currentEntry.url!));
298 ▶     const destination = new FakeNavigationDestination({
299 │       url: entry.url!,
300 │       state: entry.getState(),
301 │       historyState: entry.getHistoryState(),
302 ▶       key: entry.key,
303 │       id: entry.id,
304 ▶       index: entry.index,
305 │       sameDocument: entry.sameDocument,
306 │     });
307 ▶     this.propsectiveTraversalDestinations.push(entry.index);
308 │     const result = new InternalNavigationResult(this);
309 ▶     this.traversalQueue.set(entry.key, result);
310 ▶     this.runTraversal(() => {
311 ▶       this.traversalQueue.delete(entry.key);
312 ▶       const intercepted = this.userAgentNavigate(destination, result, {
313 ▶         navigationType: 'traverse',
314 │         cancelable: true,
315 │         canIntercept: true,
316 │         // Always false for traverseTo().
317 │         userInitiated: false,
318 │         hashChange,
319 │         info: options?.info,
320 │       });
321 ▶       if (!intercepted) {
322 ▶         this.userAgentTraverse(this.navigateEvent!);
323 │       }
324 │     });
325 │     return {
326 │       committed: result.committed,
327 │       finished: result.finished,
328 │     };
329 │   }
```

1. **298〜306 行目：行き先にエントリの値を写す**

   navigate と違い、302〜304 行目で `key`・`id`・`index` が入ります（[第 1 回](01-navx-api-types.md)の `NavigationDestination`）。297 行目、`hashChange` はいまの URL と行き先の URL で決めます。
2. **307 行目：行き先の番号を「これから行く」列に足す**

   86dc1283e8c が入れた行です（6 節）。
3. **309〜311 行目：待ち行列に登録し、順番が来たら外す**

   310 行目の `runTraversal` に渡す関数が「順番が来たときにやること」です。311 行目で待ち行列から外してから、312 行目で[第 2 回](02-navx-fake-navigate.md)の `userAgentNavigate` に `'traverse'` で入ります。
4. **321〜323 行目：横取りされなかったら、ここで traverse を反映する**

   第 2 回で読んだ navigate の「横取りされなかったときの書き換え」に当たる行です。横取りされたなら commit の中で同じ `userAgentTraverse` が呼ばれます。

## 3. back・forward・go：番号の決め方が違う

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L331–363 （▶ の行: 333–334, 344–345, 350, 361–362）

```ts
331 │   /** Equivalent to `navigation.back()`. */
332 │   back(options?: NavigationOptions): FakeNavigationResult {
333 ▶     if (this.currentEntryIndex === 0) {
334 ▶       const domException = new DOMException('Cannot go back', 'InvalidStateError');
335 │       const committed = Promise.reject(domException);
336 │       const finished = Promise.reject(domException);
337 │       committed.catch(() => {});
338 │       finished.catch(() => {});
339 │       return {
340 │         committed,
341 │         finished,
342 │       };
343 │     }
344 ▶     const entry = this.entriesArr[this.currentEntryIndex - 1];
345 ▶     return this.traverseTo(entry.key, options);
346 │   }
347 │ 
348 │   /** Equivalent to `navigation.forward()`. */
349 │   forward(options?: NavigationOptions): FakeNavigationResult {
350 ▶     if (this.currentEntryIndex === this.entriesArr.length - 1) {
351 │       const domException = new DOMException('Cannot go forward', 'InvalidStateError');
352 │       const committed = Promise.reject(domException);
353 │       const finished = Promise.reject(domException);
354 │       committed.catch(() => {});
355 │       finished.catch(() => {});
356 │       return {
357 │         committed,
358 │         finished,
359 │       };
360 │     }
361 ▶     const entry = this.entriesArr[this.currentEntryIndex + 1];
362 ▶     return this.traverseTo(entry.key, options);
363 │   }
```

344〜345 行目、`back()` は**いまの `currentEntryIndex`** の 1 つ前のエントリの `key` で `traverseTo` を呼ぶだけです。`forward()` も 361〜362 行目で同じ形です。333 行目と 350 行目、端にいれば `InvalidStateError` の reject です。なので、traverse が非同期のとき `back(); back();` と続けて呼ぶと、2 回とも同じエントリの `key` になり、2 節の 289 行目で 1 つにまとめられます。**1 つしか戻りません。**

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L365–384 （▶ の行: 367–368, 373–376, 379, 382）

```ts
365 │   /**
366 │    * Equivalent to `history.go()`.
367 ▶    * Note that this method does not actually work precisely to how Chrome
368 ▶    * does, instead choosing a simpler model with less unexpected behavior.
369 │    * Chrome has a few edge case optimizations, for instance with repeated
370 │    * `back(); forward()` chains it collapses certain traversals.
371 │    */
372 │   go(direction: number): void {
373 ▶     const targetIndex =
374 ▶       (this.propsectiveTraversalDestinations[this.propsectiveTraversalDestinations.length - 1] ??
375 ▶         this.currentEntryIndex) + direction;
376 ▶     if (targetIndex >= this.entriesArr.length || targetIndex < 0) {
377 │       return;
378 │     }
379 ▶     this.propsectiveTraversalDestinations.push(targetIndex);
380 │     this.runTraversal(() => {
381 │       // Check again that destination is in the entries array.
382 ▶       if (targetIndex >= this.entriesArr.length || targetIndex < 0) {
383 │         return;
384 │       }
```

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L385–410 （▶ の行: 388, 398–399, 406–407）

```ts
385 │       const fromUrl = new URL(this.currentEntry.url!);
386 │       const entry = this.entriesArr[targetIndex];
387 │       const hashChange = isHashChange(fromUrl, new URL(entry.url!, this.currentEntry.url!));
388 ▶       const destination = new FakeNavigationDestination({
389 │         url: entry.url!,
390 │         state: entry.getState(),
391 │         historyState: entry.getHistoryState(),
392 │         key: entry.key,
393 │         id: entry.id,
394 │         index: entry.index,
395 │         sameDocument: entry.sameDocument,
396 │       });
397 │       const result = new InternalNavigationResult(this);
398 ▶       const intercepted = this.userAgentNavigate(destination, result, {
399 ▶         navigationType: 'traverse',
400 │         cancelable: true,
401 │         canIntercept: true,
402 │         // Always false for go().
403 │         userInitiated: false,
404 │         hashChange,
405 │       });
406 ▶       if (!intercepted) {
407 ▶         this.userAgentTraverse(this.navigateEvent!);
408 │       }
409 │     });
410 │   }
```

`go(n)` は `history.go(n)` に当たり、戻り値はありません。373〜375 行目、基準は**「これから行く」列の最後**で、列が空のときだけ `currentEntryIndex` です。379 行目でその番号を列に足すので、`go(-1); go(-1);` は 2 つ戻ります。376 行目、範囲の外なら何もしません。382 行目、順番が来たときにもう一度確かめます（その間に push で後ろが消えているかもしれないため）。367〜370 行目のコメントは「Chrome の動きをそのままではなく、驚きの少ない単純なモデルにした」と書いています。

388 行目の行き先の作り方、398 行目の `'traverse'`、406〜407 行目の「横取りされなければ `userAgentTraverse`」は 2 節と同じです。

## 4. runTraversal：1 回の traverse に setTimeout 1 回

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L412–432 （▶ の行: 414–416, 420, 423, 425–428）

```ts
412 │   /** Runs a traversal synchronously or asynchronously */
413 │   private runTraversal(traversal: () => void) {
414 ▶     if (this.synchronousTraversals) {
415 ▶       traversal();
416 ▶       this.propsectiveTraversalDestinations.shift();
417 │       return;
418 │     }
419 │ 
420 ▶     // Each traversal occupies a single timeout resolution.
421 │     // This means that Promises added to commit and finish should resolve
422 │     // before the next traversal.
423 ▶     this.nextTraversal = this.nextTraversal.then(() => {
424 │       return new Promise<void>((resolve) => {
425 ▶         setTimeout(() => {
426 ▶           resolve();
427 ▶           traversal();
428 ▶           this.propsectiveTraversalDestinations.shift();
429 │         });
430 │       });
431 │     });
432 │   }
```

1. **414〜418 行目：同期のとき**

   その場で 415 行目で実行し、416 行目で「これから行く」列の先頭を取り除きます。`back()` が戻った時点で `currentEntry` はもう変わっています（spec の `traverse synchronously`）。
2. **423 行目：前の traverse の Promise につなぐ**

   `nextTraversal` を「前の traverse が終わったあと」の Promise に置き換えます。traverse は呼んだ順に 1 つずつ進みます。
3. **425〜429 行目：`setTimeout` の中で実行**

   426 行目で次の traverse の待ちを解いてから、427 行目で実行し、428 行目で列の先頭を取り除きます。420〜422 行目のコメントのとおり、1 つの traverse が `setTimeout` 1 回分を占めるので、その traverse の committed と finished に付けた処理（マイクロタスク）は、次の traverse より先に走ります。

## 5. userAgentTraverse と、entries の書き換え

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L526–550 （▶ の行: 529, 533–534, 537–539, 541–542, 545–548）

```ts
526 │   /**
527 │    * Implementation for a traverse navigation.
528 │    *
529 ▶    * https://whatpr.org/html/10919/browsing-the-web.html#apply-the-traverse-history-step
530 │    * ...
531 │    * > Let updateDocument be an algorithm step which performs update document for history step application given targetEntry's document, targetEntry, changingNavigableContinuation's update-only, scriptHistoryLength, scriptHistoryIndex, navigationType, entriesForNavigationAPI, and previousEntry.
532 │    * > If targetEntry's document is equal to displayedDocument, then perform updateDocument.
533 ▶    * https://whatpr.org/html/10919/browsing-the-web.html#update-document-for-history-step-application
534 ▶    * which then goes to https://whatpr.org/html/10919/nav-history-apis.html#update-the-navigation-api-entries-for-a-same-document-navigation
535 │    * @internal
536 │    */
537 ▶   userAgentTraverse(navigateEvent: InternalFakeNavigateEvent) {
538 ▶     const oldUrl = this.currentEntry.url!;
539 ▶     this.updateNavigationEntriesForSameDocumentNavigation(navigateEvent);
540 │     // Happens as part of "updating the document" steps https://whatpr.org/html/10919/browsing-the-web.html#updating-the-document
541 ▶     const popStateEvent = createPopStateEvent({
542 ▶       state: navigateEvent.destination.getHistoryState(),
543 │       hasUAVisualTransition: navigateEvent.hasUAVisualTransition,
544 │     });
545 ▶     this._window.dispatchEvent(popStateEvent);
546 ▶     if (navigateEvent.hashChange) {
547 ▶       const hashchangeEvent = createHashChangeEvent(oldUrl, this.currentEntry.url!);
548 ▶       this._window.dispatchEvent(hashchangeEvent);
549 │     }
550 │   }
```

529〜534 行目のコメントが、仕様の手順の名前の連なりです。「apply the traverse history step」→「update document for history step application」→「update the navigation API entries for a same-document navigation」。偽物はこれを 3 行に縮めています。

1. **538 行目：書き換える前の URL を覚える**

   hashchange に使います。
2. **539 行目：entries を書き換える**

   下の関数です。ここで `currententrychange` が配られます。
3. **541〜545 行目：`popstate` を `_window` に配る**

   542 行目、`state` は行き先の history state（`pushState` の第 1 引数で付けた値）です。540 行目のコメントは、これが仕様の「updating the document」の一部だと書いています。
4. **546〜549 行目：`#` だけの変化なら `hashchange` も**

   popstate のあとです。

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L130–136 （▶ の行: 132）

```ts
130 │       }
131 │     };
132 ▶     this._window = doc.defaultView ?? this.createEventTarget();
133 │     this.eventTarget = this.createEventTarget();
134 │     // First entry.
135 │     this.setInitialEntryForTesting(startURL);
136 │   }
```

**popstate と hashchange の宛先は、132 行目の `_window` です。**渡した `Document` に `defaultView` があればその window、無ければその Document で作った `div` です（[第 1 回](01-navx-api-types.md)）。`document.implementation.createHTMLDocument('')` を渡すと `defaultView` は `null` なので、**ページの `window` には popstate も hashchange も配られません**。偽物の外から受け取るには `fakeNavigation.window.addEventListener('popstate', …)` とします。`FakeNavigationPlatformLocation` もこの `window` にリスナーを付けています（[第 6 回](06-navx-testing.md)）。spec がグローバルの `document` を渡すのは、ブラウザで走る spec で本物の `window` の popstate を数えるためです。

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L552–574 （▶ の行: 553, 561, 563–564, 568–573）

```ts
552 │   /**
553 ▶    * https://whatpr.org/html/10919/nav-history-apis.html#update-the-navigation-api-entries-for-a-same-document-navigation
554 │    * @internal
555 │    */
556 │   updateNavigationEntriesForSameDocumentNavigation({
557 │     destination,
558 │     navigationType,
559 │     result,
560 │   }: InternalFakeNavigateEvent) {
561 ▶     const oldCurrentNHE = this.currentEntry;
562 │     const disposedNHEs = [];
563 ▶     if (navigationType === 'traverse') {
564 ▶       this.currentEntryIndex = destination.index;
565 │       if (this.currentEntryIndex === -1) {
566 │         throw new Error('unexpected current entry index');
567 │       }
568 ▶     } else if (navigationType === 'push') {
569 ▶       this.currentEntryIndex++;
570 ▶       this.propsectiveTraversalDestinations = []; // prospectiveEntryIndex isn't in the spec but is an implementation detail
571 ▶       disposedNHEs.push(...this.entriesArr.splice(this.currentEntryIndex));
572 ▶     } else if (navigationType === 'replace') {
573 ▶       disposedNHEs.push(oldCurrentNHE);
574 │     }
```

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L575–600 （▶ の行: 577–580, 582, 585, 589, 591–592, 596–598）

```ts
575 │     if (navigationType === 'push' || navigationType === 'replace') {
576 │       const index = this.currentEntryIndex;
577 ▶       const key =
578 ▶         navigationType === 'push'
579 ▶           ? String(this.nextKey++)
580 ▶           : (oldCurrentNHE?.key ?? String(this.nextKey++));
581 │       const newNHE = new FakeNavigationHistoryEntry(this.eventTarget, destination.url, {
582 ▶         id: String(this.nextId++),
583 │         key,
584 │         index,
585 ▶         sameDocument: true,
586 │         state: destination.getState(),
587 │         historyState: destination.getHistoryState(),
588 │       });
589 ▶       this.entriesArr[this.currentEntryIndex] = newNHE;
590 │     }
591 ▶     result.committedResolve(this.currentEntry);
592 ▶     const currentEntryChangeEvent = createFakeNavigationCurrentEntryChangeEvent({
593 │       from: oldCurrentNHE,
594 │       navigationType: navigationType,
595 │     });
596 ▶     this.eventTarget.dispatchEvent(currentEntryChangeEvent);
597 ▶     for (const disposedNHE of disposedNHEs) {
598 ▶       disposedNHE.dispose();
599 │     }
600 │   }
```

553 行目、仕様の「update the navigation API entries for a same-document navigation」です。3 つの種類で、entries がこう変わります。

| 種類 | currentEntryIndex | entries | 新しいエントリの key / id | 消えるエントリ |
| --- | --- | --- | --- | --- |
| traverse | 行き先の `index`（564 行目） | そのまま | 作らない | なし |
| push | +1（569 行目） | その位置から後ろを `splice` で切り取り（571 行目）、589 行目で新しいエントリを置く | 新しい key（579 行目）・新しい id（582 行目） | 前に進めたエントリ全部 |
| replace | そのまま | 同じ位置に新しいエントリを置く（589 行目） | 古いエントリの key を引き継ぐ（580 行目）・新しい id | 置き換えられた古いエントリ（573 行目） |

1. **570 行目：push は「これから行く」列を空にする**

   後ろが消えたので、待っている traverse の行き先は意味を失います。コメントは「仕様には無い、実装の都合」と書いています。
2. **585 行目：新しいエントリは常に `sameDocument: true`**

   行き先の `sameDocument` が `false` でも同じです（[第 2 回](02-navx-fake-navigate.md)の質問）。
3. **591 行目：結果の committed を、いまのエントリで resolve**

   traverse なら行き先の既存のエントリそのものです。
4. **592〜596 行目：`currententrychange`**

   `from` は書き換える前のエントリ、`navigationType` は種類です。
5. **597〜599 行目：消えたエントリに dispose を知らせる**

   `currententrychange` のあとです。中身は 7 節。

### 配られる順

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L1145–1165 （▶ の行: 1156–1158, 1162–1163）

```ts
1145 │ /**
1146 │  * Create a fake equivalent of `NavigationCurrentEntryChange`. This does not use
1147 │  * a class because ES5 transpiled JavaScript cannot extend native Event.
1148 │  */
1149 │ function createFakeNavigationCurrentEntryChangeEvent({
1150 │   from,
1151 │   navigationType,
1152 │ }: {
1153 │   from: FakeNavigationHistoryEntry;
1154 │   navigationType: NavigationType;
1155 │ }) {
1156 ▶   const event = new Event('currententrychange', {
1157 ▶     bubbles: false,
1158 ▶     cancelable: false,
1159 │   }) as {
1160 │     -readonly [P in keyof NavigationCurrentEntryChangeEvent]: NavigationCurrentEntryChangeEvent[P];
1161 │   };
1162 ▶   event.from = from;
1163 ▶   event.navigationType = navigationType;
1164 │   return event as FakeNavigationCurrentEntryChangeEvent;
1165 │ }
```

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L1167–1197 （▶ の行: 1178, 1182–1183, 1189, 1194–1195）

```ts
1167 │ /**
1168 │  * Create a fake equivalent of `PopStateEvent`. This does not use a class
1169 │  * because ES5 transpiled JavaScript cannot extend native Event.
1170 │  */
1171 │ function createPopStateEvent({
1172 │   state,
1173 │   hasUAVisualTransition,
1174 │ }: {
1175 │   state: unknown;
1176 │   hasUAVisualTransition?: boolean;
1177 │ }) {
1178 ▶   const event = new Event('popstate', {
1179 │     bubbles: false,
1180 │     cancelable: false,
1181 │   }) as {-readonly [P in keyof PopStateEvent]: PopStateEvent[P]};
1182 ▶   event.state = state;
1183 ▶   if (hasUAVisualTransition) {
1184 │     event.hasUAVisualTransition = true;
1185 │   }
1186 │   return event as PopStateEvent;
1187 │ }
1188 │ 
1189 ▶ function createHashChangeEvent(newURL: string, oldURL: string) {
1190 │   const event = new Event('hashchange', {
1191 │     bubbles: false,
1192 │     cancelable: false,
1193 │   }) as {-readonly [P in keyof HashChangeEvent]: HashChangeEvent[P]};
1194 ▶   event.newURL = newURL;
1195 ▶   event.oldURL = oldURL;
1196 │   return event as HashChangeEvent;
1197 │ }
```

3 つとも素の `new Event` に欄を書き足す形で、`bubbles: false`・`cancelable: false` です。横取りしてもしなくても、traverse 1 回で配られる順は次のとおりです（デモで確かめられます）。

- `navigate`（navigationType `'traverse'`） — 第 2 回の dispatch()
  - `currententrychange` — L596 — *entries の書き換えの直後*
  - `popstate` — L545 — *\_window に*
  - `hashchange` — L548 — *hashChange のときだけ、\_window に*
    - `committed` の then — マイクロタスク
    - `navigatesuccess` — 第 2 回の L1006
    - `finished` の then — マイクロタスク

> [!WARNING]
> **ハマりどころ**
>
> 1189 行目の `createHashChangeEvent` の引数は `(newURL, oldURL)` の順です。ところが 547 行目は `createHashChangeEvent(oldUrl, this.currentEntry.url!)` と、**古い URL を第 1 引数**に渡しています。結果として、偽物の hashchange は `oldURL` と `newURL` が入れ替わっています（`#two` から `#one` へ戻ると、`oldURL` が `#one`、`newURL` が `#two`）。デモの記録でも見えます。../angular-main の同じ行（558 行目）も同じで、spec に `oldURL`・`newURL` を確かめる `expect` はありません。gh で issue と PR を「hashchange」「FakeNavigation」で探しましたが、これを扱うものは見つかりませんでした（開いている PR #70705 の差分にもこの行の変更はありません）。Angular の `Location` は hashchange を受けて自分で URL を読み直すので、Router のテストには表れにくい違いです。

## 6. 取り消された traverse の修正（86dc1283e8c）

📄 `git show 86dc1283e8c -- fake_navigation.ts（抜粋）`

```
-  private prospectiveEntryIndex = 0;
+  private propsectiveTraversalDestinations: number[] = [];
 ...（traverseTo）
-    this.prospectiveEntryIndex = entry.index;
+    this.propsectiveTraversalDestinations.push(entry.index);
 ...（go）
-    const targetIndex = this.prospectiveEntryIndex + direction;
+    const targetIndex =
+      (this.propsectiveTraversalDestinations[this.propsectiveTraversalDestinations.length - 1] ??
+        this.currentEntryIndex) + direction;
 ...
-    this.prospectiveEntryIndex = targetIndex;
+    this.propsectiveTraversalDestinations.push(targetIndex);
 ...（runTraversal：同期と setTimeout の両方で）
       traversal();
+      this.propsectiveTraversalDestinations.shift();
 ...（updateNavigationEntriesForSameDocumentNavigation の push）
-      this.prospectiveEntryIndex = this.currentEntryIndex; // prospectiveEntryIndex isn't in the spec ...
+      this.propsectiveTraversalDestinations = []; // prospectiveEntryIndex isn't in the spec ...
```

2025-12-23、Andrew Scott の 86dc1283e8c（PR #66235）。説明は「precommitHandler などで取り消された traverse を正しく扱う。あとの traverse が正しいエントリに行くよう、見込みの番号を正しく計算する」です。

1. **前：見込みの番号は 1 つの数（`prospectiveEntryIndex`）**

   `traverseTo` がその数を行き先の番号に書き換え、push のときだけ `currentEntryIndex` に戻していました。traverse が取り消されて実際には動かなくても、数は行き先のままでした。
2. **何が壊れていたか**

   エントリが 3 つ（0・1・2）あり、いま 0 にいるとします。1 への traverse を precommitHandler の reject で取り消すと、`currentEntryIndex` は 0 のまま、`prospectiveEntryIndex` は 1 のままです。続けて `go(2)` を呼ぶと、基準が 1 なので行き先は 3、範囲の外で何も起きません（本当は 2 へ行くべき）。
3. **後：まだ終わっていない traverse の行き先の列**

   traverse を始めるときに列に足し（2 節の 307 行目・3 節の 379 行目）、**実行したら（成功でも取り消しでも）先頭を取り除く**（4 節の 416・428 行目）。`go` は列の最後か、空なら `currentEntryIndex` を基準にします（373〜375 行目）。取り消された traverse は実行のあとに列から消えるので、基準は 0 に戻ります。

📄 `angular/packages/core/primitives/dom-navigation/testing/test/fake_platform_navigation.spec.ts` L1482–1511 （▶ の行: 1485, 1491–1492, 1494–1497, 1502, 1504–1505, 1510）

```ts
1482 │     it('subsequent traversal works after cancelled traversal', async () => {
1483 │       const [firstPageEntry, secondPageEntry, thirdPageEntry] = await setUpEntries();
1484 │       // Go back to the first page so we have room to traverse forward
1485 ▶       await locals.navigation.traverseTo(firstPageEntry.key).finished;
1486 │       locals.navigateEvents.length = 0;
1487 │       locals.navigationCurrentEntryChangeEvents.length = 0;
1488 │       locals.popStateEvents.length = 0;
1489 │ 
1490 │       // Try to traverse to the second page but cancel it
1491 ▶       locals.pendingInterceptOptions.push({
1492 ▶         precommitHandler: () => Promise.reject(new Error('cancelled')),
1493 │       });
1494 ▶       const {committed, finished} = locals.navigation.traverseTo(secondPageEntry.key);
1495 ▶       await expectAsync(committed).toBeRejectedWithError(Error, /cancelled/);
1496 ▶       await expectAsync(finished).toBeRejectedWithError(Error, /cancelled/);
1497 ▶       expect(locals.navigation.currentEntry).toBe(firstPageEntry);
1498 │ 
1499 │       // Verify that we can still traverse to the third page correctly
1500 │       // Using go(2) ensures that the prospective index was reset correctly
1501 │       // (index 0 -> index 2 relative to current)
1502 ▶       locals.navigation.go(2);
1503 │       // We need to wait for the traversal to happen. go() is void, but we can check the next event.
1504 ▶       const navigateEvent = await locals.nextNavigateEvent();
1505 ▶       expect(navigateEvent.destination.key).toBe(thirdPageEntry.key);
1506 │       // Determine if we need to await committed/finished for go() or if nextNavigateEvent is enough.
1507 │       // go() uses internal mechanism, but eventually updates currentEntry.
1508 │       // We can wait for the loop to settle.
1509 │       await timeout();
1510 ▶       expect(locals.navigation.currentEntry.key).toBe(thirdPageEntry.key);
1511 │     });
```

同じコミットが足した it です。1485 行目で 0 に戻り、1491〜1494 行目で 1 への traverse を precommitHandler の reject で取り消し、1495〜1496 行目で両方の Promise が reject されること、1497 行目で 0 のままであることを確かめます。1502 行目の `go(2)` の行き先が 2 番目のエントリ（`thirdPageEntry`）であることを 1505 行目と 1510 行目で確かめています。

**修正を戻して走らせました。**`angular-fix` から 8576f161ae4 の作業木を一時的に作り、`git show 86dc1283e8c -- fake_navigation.ts | git apply -R` で src の側だけを戻して、`pnpm bazel test //packages/core/primitives/dom-navigation/testing/test:test --test_arg=--filter="cancelled traversal"` を走らせると、「Ran 1 of 91 specs」「1 spec, 1 failure」で、理由は `Timeout - Async function did not complete within 100ms` でした。`go(2)` が範囲の外で何もしないので、1504 行目の `nextNavigateEvent()` がいつまでも決着しないためです（作業木はあとで消しました）。

### d3552051988：finished は結果の committed も待つ

📄 `git show d3552051988 -- fake_navigation.ts`

```ts
@@ -956,10 +956,8 @@ function dispatchNavigateEvent({
     (navigation.transition as InternalNavigationTransition)?.committedResolve();
-    const promisesList = handlers.map((handler) => handler());
-    if (promisesList.length === 0) {
-      promisesList.push(Promise.resolve());
-    }
+    const promisesList: Array<Promise<unknown>> = handlers.map((handler) => handler());
+    promisesList.push(result.committed);
     Promise.all(promisesList)
```

2025-11-25、d3552051988。説明は「whatwg/html#11952 の更新に合わせる」だけです。[第 2 回](02-navx-fake-navigate.md)で読んだ `commit()` の、handler の Promise を集める一覧に、結果の入れ物の `committed` を足しました。前は、handler が無いと `Promise.resolve()` を 1 つ入れていました。

横取りしない traverse では、`commit()` は状態が `'none'` なので何もせず、entries の書き換えは dispatch から戻ったあとの 2 節の 322 行目です。どちらの形でも、この書き換えは同じ同期の処理の中で起きるので、配られる順は変わりません。足された 1 行は、[第 2 回](02-navx-fake-navigate.md)で見た「finished は commit のあと（committedTo が無ければ例外）」を、Promise の待ち合わせの側でも守る形です。commit が遅れる遷移（precommitHandler。[第 4 回](04-navx-precommit.md)）で、この順が効きます。

### 5988bdedaeb：transition.to

2025-12-03 の 5988bdedaeb は、`NavigationTransition` に `to` を足し、`new InternalNavigationTransition(navigation.currentEntry, event.destination, navigationType)` と行き先を渡すようにしました（whatwg/html の f19930f98af に合わせた。型は[第 1 回](01-navx-api-types.md)）。traverse の行き先は 2 節の 298〜306 行目でエントリの値を写したものなので、`navigation.transition.to.index` で「どこへ戻ろうとしているか」が分かります。

## 7. 履歴エントリと dispose

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L690–727 （▶ の行: 696–697, 703–704, 721–722, 725–726）

```ts
690 │ export class FakeNavigationHistoryEntry implements NavigationHistoryEntry {
691 │   readonly sameDocument: boolean;
692 │ 
693 │   readonly id: string;
694 │   readonly key: string;
695 │   readonly index: number;
696 ▶   private readonly state: unknown;
697 ▶   private readonly historyState: unknown;
698 │ 
699 │   // tslint:disable-next-line:no-any
700 │   ondispose: ((this: NavigationHistoryEntry, ev: Event) => any) | null = null;
701 │ 
702 │   constructor(
703 ▶     private eventTarget: EventTarget,
704 ▶     readonly url: string | null,
705 │     {
706 │       id,
707 │       key,
708 │       index,
709 │       sameDocument,
710 │       state,
711 │       historyState,
712 │     }: {
713 │       id: string;
714 │       key: string;
715 │       index: number;
716 │       sameDocument: boolean;
717 │       historyState: unknown;
718 │       state?: unknown;
719 │     },
720 │   ) {
721 ▶     this.id = id;
722 ▶     this.key = key;
723 │     this.index = index;
724 │     this.sameDocument = sameDocument;
725 ▶     this.state = state;
726 ▶     this.historyState = historyState;
727 │   }
```

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L741–768 （▶ の行: 741, 746, 757–758, 762–764, 766）

```ts
741 ▶   addEventListener(
742 │     type: string,
743 │     callback: EventListenerOrEventListenerObject,
744 │     options?: AddEventListenerOptions | boolean,
745 │   ): void {
746 ▶     this.eventTarget.addEventListener(type, callback, options);
747 │   }
748 │ 
749 │   removeEventListener(
750 │     type: string,
751 │     callback: EventListenerOrEventListenerObject,
752 │     options?: EventListenerOptions | boolean,
753 │   ): void {
754 │     this.eventTarget.removeEventListener(type, callback, options);
755 │   }
756 │ 
757 ▶   dispatchEvent(event: Event): boolean {
758 ▶     return this.eventTarget.dispatchEvent(event);
759 │   }
760 │ 
761 │   /** internal */
762 ▶   dispose() {
763 ▶     const disposeEvent = new Event('disposed');
764 ▶     this.dispatchEvent(disposeEvent);
765 │     // release current listeners
766 ▶     this.eventTarget = null!;
767 │   }
768 │ }
```

696〜697 行目、エントリは 2 種類の state を持ちます。`state` は Navigation API の `navigate(url, {state})` の値、`historyState` は `history.pushState(data)` の値で、popstate の `state` に使われるのは後者です（5 節の 542 行目）。

703 行目、エントリは自分の `EventTarget` を持たず、作るときに渡されたものを使います。5 節の 581 行目で渡しているのは `this.eventTarget`、つまり**navigation と同じ `EventTarget`** です。746 行目の `addEventListener` も、758 行目の `dispatchEvent` もそこに行きます。763〜764 行目、消えたエントリは `'disposed'` という名前のイベントを出し、766 行目で `eventTarget` を捨てます。

- **どのエントリに付けたリスナーにも、ほかのエントリの dispose が届きます。**`navigation.addEventListener('disposed', …)` にも届きます。デモの記録の `'disposed'` の行は、navigation に付けたリスナーが受け取ったものです。
- 仕様のイベント名は `dispose` です。新しい本家の a8233232f5a が `'disposed'` を `'dispose'` に直し、`ondispose` を実装しました。エントリが navigation と同じ `EventTarget` を使う形は ../angular-main でもそのままで、開いている PR #70705 は、エントリに `EventTarget` を作る関数を渡す形に変える変更を含んでいます。

## 8. DEMO：entries を積んで、戻る・進む

> **🧪 DEMO — 本物の FakeNavigation を 1 つ持ち続けて、push・replace・back・forward・go・traverseTo を混ぜる**
>
> 「始める」を押すと、このページで、配布物（`@angular/core` 22.1.6 の `fesm2022/testing.mjs`）の `FakeNavigation` の範囲を 1 文字も変えずに写したファイル（`navx-fake-navigation.vendor.ts`）を読み込み、`new ɵFakeNavigation(createHTMLDocument(''), 'https://example.com/')` を 1 つ作ります。navigate・currententrychange・navigatesuccess・navigateerror・`'disposed'` は navigation に、popstate と hashchange は `fake.window`（div）にリスナーを付けています。このページの `window` にも popstate と hashchange を数えるだけのリスナーを付けています（デモを閉じると外します）。このページの URL と履歴は変わりません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/navx-fake-traverse)

試してほしい順です。

- **/p1・/p2・/p3 と積んでから back()**：navigate（traverse）→ currententrychange → popstate（fake.window の div に）の順。「呼んだ直後の currentEntry」は、非同期のときは変わっておらず、同期にすると変わっています（4 節）。
- **back() を 2 回続けて**（非同期）：2 回目は「1 回目と同じ committed の Promise か: true」で、1 つしか戻りません（3 節の 344 行目と 2 節の 289 行目）。同期にすると、1 回目がその場で済むので 2 つ戻ります。ただし 1 回目の finished は「superseded」で reject されます。1 回目の navigate イベントは、finish の手順（[第 2 回](02-navx-fake-navigate.md)の `Promise.all` のあと）がマイクロタスクで来るまで「進行中」のままなので、2 回目の `userAgentNavigate` がそれを取り消すためです。
- **go(-1) を 2 回続けて**：「これから行く」列のおかげで 2 つ戻ります（373〜379 行目）。
- **戻ったあとで push**：前に進めたエントリが消え、`'disposed'` がその数だけ出ます。新しいエントリの key は使われていない数です（579 行目）。
- **replace**：key はそのまま、id だけ新しくなり、`'disposed'` が 1 つ出ます（573・580 行目）。
- **#h… を 2 つ積んで back()**：popstate のあとに hashchange が出ます。その `oldURL` と `newURL` が入れ替わっていることを確かめてください（5 節の警告）。
- どの操作のあとも、「このページの window に届いた popstate・hashchange」は 0 のままです（132 行目）。

**本番ビルドでデモを動かした結果。**ヘッドレスの Chrome（HeadlessChrome/155.0.8043.0）で本番ビルドのこのページを開き、非同期・intercept ありで /p1〜/p3 を積んで back・forward・「back() を 2 回」・「go(-1) を 2 回」・go(2)・back・push・replace・#h を 2 つ・back・traverseTo を、続けて同期・intercept なしで作り直して /p1〜/p3・「back() を 2 回」・forward・「go(-1) を 2 回」・back を押しました（2026-11-07）。非同期の「back() を 2 回」は「同じ committed の Promise か: true」で 1 つだけ戻り、「go(-1) を 2 回」は 2 つ戻りました。戻ったあとの push で 'disposed' が 2 回、replace で 1 回（key は '4' のまま、id は '4' から '5'）。#h7 から #h6 への back では popstate のあとに hashchange が出て、その oldURL は …#h6、newURL は …#h7 でした。同期の「back() を 2 回」は 2 つ戻り、1 回目の finished は「Navigation superseded by a new navigation.」で reject されました。先頭での back() は「Cannot go back」の reject です。このページの window に届いた popstate と hashchange は最後まで 0 件、押す前と後で location.href・history.length・navigation.entries().length・navigation.currentEntry.key は同じ、コンソールの警告とエラーは 0 件、外へ出た通信は 0 件です。デモを動かしたまま別の章へ移ってもエラーは出ませんでした（DestroyRef で window のリスナーを外す）。

## 9. 新しい本家の a8233232f5a で、この章の行はどう変わったか

2026-09-11 の a8233232f5a（PR #70531、「FakeNavigation を WHATWG の HTML 仕様に揃える」）は fake\_navigation.ts を 472 行足して 233 行消しました。この章の行に関係するのは次の 4 つです。

- 2 節の 298〜306 行目と 3 節の 388〜396 行目の同じ写しを、`createDestinationFromEntry(entry)` の 1 つにまとめた。
- 2 節の 271〜282 行目と 3 節の 333〜343・350〜360 行目の「reject 済みの 2 つの Promise を作る」を、`earlyErrorResult(error)` にまとめた。
- 5 節の `updateNavigationEntriesForSameDocumentNavigation` に `reload` の分岐（いまのエントリの state を差し替える）を足し、`reload()` を実装した。
- 7 節の dispose のイベント名を `'dispose'` に直した。

traverse の待ち行列（4 節）と、`propsectiveTraversalDestinations` の扱い（6 節）は変わっていません。

## テストと直し方

### spec と it

| describe › it | 行 | この章のどこ |
| --- | --- | --- |
| `navigation` › `traversal` › `traverses back`・`traverses forward` | 915・985 | 2・5 節 |
| `traverses back with hashchange`・`traverses forward with hashchange` | 1048・1062 | 5 節（hashChange が true。oldURL・newURL は見ていない） |
| `traverses to non-existent`・`back out of bounds`・`forward out of bounds` | 1175・1243・1321 | 2・3 節 |
| `traverse synchronously`・`traversal current entry`・`second traversal to same entry`・`queues traverses` | 1330・1341・1352・1367 | 2・4 節 |
| `integration` › `queues traverses after navigate`・`subsequent traversal works after cancelled traversal` | 1414・1482 | 4・6 節 |
| `history API` › `traversal` › `go back` … `go after synchronous navigate` | 1800〜2100 | 3 節（go） |

📄 `angular/packages/core/primitives/dom-navigation/testing/test/fake_platform_navigation.spec.ts` L941–970 （▶ の行: 943–944, 948, 950, 959, 961, 963–964, 966）

```ts
941 │       expect(navigateEvent.destination.getState()).toEqual(firstPageEntry.getState());
942 │       const committedEntry = await committed;
943 ▶       expect(committedEntry).toBe(firstPageEntry);
944 ▶       expect(locals.navigationCurrentEntryChangeEvents.length).toBe(1);
945 │       const currentEntryChangeEvent = locals.navigationCurrentEntryChangeEvents[0];
946 │       expect(currentEntryChangeEvent).toEqual(
947 │         jasmine.objectContaining({
948 ▶           navigationType: 'traverse',
949 │           from: jasmine.objectContaining({
950 ▶             url: thirdPageEntry.url!,
951 │             key: thirdPageEntry.key,
952 │             id: thirdPageEntry.id,
953 │             index: thirdPageEntry.index,
954 │             sameDocument: true,
955 │           }),
956 │         }),
957 │       );
958 │       expect(currentEntryChangeEvent.from.getState()).toEqual(thirdPageEntry.getState());
959 ▶       expect(locals.popStateEvents.length).toBe(1);
960 │       const popStateEvent = locals.popStateEvents[0];
961 ▶       expect(popStateEvent.state).toBeNull();
962 │       expect(Object.hasOwn(popStateEvent, 'hasUAVisualTransition')).toBeFalse();
963 ▶       expect(locals.navigation.canGoBack).toBeTrue();
964 ▶       expect(locals.navigation.canGoForward).toBeTrue();
965 │       const finishedEntry = await finished;
966 ▶       expect(finishedEntry).toBe(firstPageEntry);
967 │       expect(locals.navigation.currentEntry).toBe(firstPageEntry);
968 │       expect(locals.navigateEvents.length).toBe(1);
969 │       expect(locals.navigationCurrentEntryChangeEvents.length).toBe(1);
970 │       expect(locals.popStateEvents.length).toBe(1);
```

943 行目、committed は行き先の既存のエントリ**そのもの**（`toBe`）です。948〜950 行目で currententrychange の種類と `from` が出発点（3 番目のエントリ）であることを、959〜961 行目で popstate が 1 回、`state` が `null` であることを確かめます（`navigate()` で積んだエントリには history state が無いため）。963〜964 行目、真ん中に戻ったので `canGoBack` も `canGoForward` も `true` です。

📄 `angular/packages/core/primitives/dom-navigation/testing/test/fake_platform_navigation.spec.ts` L1330–1339 （▶ の行: 1332, 1334, 1336）

```ts
1330 │     it('traverse synchronously', async () => {
1331 │       const [, secondPageEntry] = await setUpEntries();
1332 ▶       locals.navigation.setSynchronousTraversalsForTesting(true);
1333 │ 
1334 ▶       const {committed, finished} = locals.navigation.back();
1335 │       // Synchronously navigates.
1336 ▶       expect(locals.navigation.currentEntry).toBe(secondPageEntry);
1337 │       await expectAsync(committed).toBeResolvedTo(secondPageEntry);
1338 │       await expectAsync(finished).toBeResolvedTo(secondPageEntry);
1339 │     });
```

📄 `angular/packages/core/primitives/dom-navigation/testing/test/fake_platform_navigation.spec.ts` L1352–1375 （▶ の行: 1354–1356, 1360, 1364, 1370–1371, 1373）

```ts
1352 │     it('second traversal to same entry', async () => {
1353 │       const [firstPageEntry] = await setUpEntries();
1354 ▶       const traverseResult = locals.navigation.traverseTo(firstPageEntry.key);
1355 ▶       const duplicateTraverseResult = locals.navigation.traverseTo(firstPageEntry.key);
1356 ▶       expect(traverseResult.committed).toBe(duplicateTraverseResult.committed);
1357 │       expect(traverseResult.finished).toBe(duplicateTraverseResult.finished);
1358 │       await Promise.all([traverseResult.committed, duplicateTraverseResult.committed]);
1359 │       // Only one NavigationCurrentEntryChangeEvent for duplicate traversals
1360 ▶       expect(locals.navigationCurrentEntryChangeEvents.length).toBe(1);
1361 │       expect(locals.popStateEvents.length).toBe(1);
1362 │       await Promise.all([traverseResult.finished, duplicateTraverseResult.finished]);
1363 │       // Only one NavigateEvent for duplicate traversals.
1364 ▶       expect(locals.navigateEvents.length).toBe(1);
1365 │     });
1366 │ 
1367 │     it('queues traverses', async () => {
1368 │       const [firstPageEntry, secondPageEntry] = await setUpEntries();
1369 │ 
1370 ▶       const firstTraverseResult = locals.navigation.traverseTo(firstPageEntry.key);
1371 ▶       const secondTraverseResult = locals.navigation.traverseTo(secondPageEntry.key);
1372 │ 
1373 ▶       const firstTraverseCommittedEntry = await firstTraverseResult.committed;
1374 │       expect(firstTraverseCommittedEntry).toBe(firstPageEntry);
1375 │       expect(locals.navigation.currentEntry).toBe(firstPageEntry);
```

1336 行目、同期にすると `back()` が戻った時点で `currentEntry` が変わっています。1356 行目、同じエントリへの 2 回の traverse は同じ Promise、1360・1364 行目でイベントも 1 回ずつです。1370〜1371 行目の別々のエントリへの 2 回は、1373 行目以降で 1 回目が先に済むことを確かめています（4 節の待ち行列）。

### 手元で走らせた結果

../angular で `pnpm bazel test //packages/core/primitives/dom-navigation/testing/test:test --nocache_test_results --test_output=all --test_arg=--filter=traversal` は「Ran 37 of 91 specs」「37 specs, 0 failures」でした（2026-11-07）。`traversal` という describe は 2 つあり（`navigation` の直下と `history API` の中）、さらに it の名前に traversal を含むものも拾います。`:test_web` では `--filter` が効かないので、全体を走らせて Chromium と Firefox で「91 passed, 0 failed」でした。

5 節の hashchange の引数については、6 節と同じ作業木に「traverse で戻ったときの hashchange の oldURL は前の URL、newURL はいまの URL」という it を足して走らせ、`Expected 'https://test.com/#one' to be 'https://test.com/#two'` と `Expected 'https://test.com/#two' to be 'https://test.com/#one'` で落ちることを確かめました。547 行目の引数を入れ替えると通り、ほかの 91 個も通りました。

### 直すとしたら

- hashchange：`userAgentTraverse` の 547 行目を `createHashChangeEvent(this.currentEntry.url!, oldUrl)` にする。spec は `traverses back with hashchange` の it に `window` の hashchange を受けて `oldURL`・`newURL` を確かめる `expect` を足す。[第 1 回](01-navx-api-types.md)のテストの節で見た `popStateListener` と同じ形で付けられます。
- traverse の中の `preventDefault`：navigate イベントのリスナーが traverse で `preventDefault()` だけを呼ぶと、322 行目（と 407 行目）の `this.navigateEvent!` が `null` で TypeError になります。非同期の traverse では `setTimeout` の中の例外なので、テストの外に「捕まえられない例外」として出ます（手元の Node で確かめた）。[第 2 回](02-navx-fake-navigate.md)の 11 節と同じ原因で、開いている PR #70705 の範囲です。
- dispose のイベント名：a8233232f5a が ../angular-main で直した。
- issue の全体は[第 7 回](07-navx-tests-issues.md)にまとめます。

## 聞かれそうな質問

**Q. FakeNavigation の back() は、呼んだ瞬間に currentEntry を変えますか？**

既定では変えません。`runTraversal`（412〜432 行目）が `setTimeout` の中で実行するので、`back()` が戻った時点では元のままです。`setSynchronousTraversalsForTesting(true)` にすると 415 行目でその場で実行されます。`TestBed` の `provideFakePlatformNavigation()` は同期にしています。

**Q. back() を 2 回続けて呼ぶと、2 つ戻りますか？**

非同期なら 1 つです。`back()` は 344 行目でいまの `currentEntryIndex` から行き先を決めるので、2 回とも同じ key になり、`traversalQueue`（289〜295 行目）で同じ結果が返ります。`go(-1)` を 2 回なら、373〜375 行目で「これから行く」列の最後を基準にするので 2 つ戻ります。同期にした場合は `back()` でも 2 つ戻りますが、1 回目の finished は 2 回目に取って代わられて reject されます。

**Q. replace すると key と id はどうなりますか？**

key は古いエントリのものを引き継ぎ（580 行目）、id は新しく振られます（582 行目）。古いエントリは消され（573 行目）、currententrychange のあとに dispose のイベントを出します（597〜599 行目）。

**Q. テストで FakeNavigation の popstate を受け取るには？**

`fakeNavigation.window.addEventListener('popstate', …)` です。宛先は 132 行目の `_window` で、渡した Document に `defaultView` があればその window、無ければ div です。`createHTMLDocument('')` を渡したなら、ページの `window` には届きません。

**Q. traverse のとき、currententrychange と popstate はどちらが先ですか？**

currententrychange が先です。`userAgentTraverse` は 539 行目で entries を書き換え（その中の 596 行目で currententrychange）、そのあと 545 行目で popstate、548 行目で hashchange を配ります。

**Q. 86dc1283e8c は何を直したのですか？**

取り消された traverse のあとの `go(n)` が、取り消された行き先を基準にしてしまう不具合です。見込みの番号を 1 つの数から「まだ終わっていない traverse の行き先の列」（66 行目）に変え、実行したら先頭を取り除く（416・428 行目）ようにしました。spec は 1482 行目の it が足され、src の修正を戻すとこの it は時間切れで落ちます。

## 読み終えて

- `traverseTo` は行き先のエントリを探して待ち行列に入れ、順番が来たら navigate イベント（`'traverse'`）を配る。`back`・`forward` はいまの位置の隣の key で `traverseTo` を呼ぶだけ
- `go` は「まだ終わっていない traverse の行き先の列」の最後を基準にする。86dc1283e8c は、取り消された traverse がこの基準を狂わせないようにした
- traverse 1 回は `setTimeout` 1 回分。テストでは同期にできる
- entries の書き換えは push（後ろを消して積む）・replace（key を引き継いで置き換え）・traverse（番号だけ動かす）。そのあと currententrychange → popstate → hashchange
- popstate と hashchange の宛先は `_window`。hashchange の `oldURL` と `newURL` は入れ替わっている

---

← 前: [FakeNavigation の navigate：navigate イベントを配り、intercept して commit するまで](02-navx-fake-navigate.md)  
次: [precommitHandler：URL の確定を遅らせ、途中でリダイレクトする](04-navx-precommit.md) →
