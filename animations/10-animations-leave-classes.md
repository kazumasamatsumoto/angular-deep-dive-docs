[目次](../README.md) › [アニメーションの内側](README.md) › 第 10 回 / 全 20 回

# animate.leave のクラス：付けて、終わりを待って、消す

> animateLeaveClassRunner が動いている enter を止め、クラスを付けて offsetWidth で再計算させ、いちばん長いアニメーションの終わりで LView に置いた resolvers を全部呼ぶ仕組み。次のフレームでアニメーションが無いと分かったときの即時の片付けと、終わりのイベントが来ないとき長さ + 50 ms で片付ける setTimeout、ng-content を持つコンポーネントのホスト要素だけクラスを外す理由。22.1.6 の配布物では offsetWidth の行が rollup の設定で消えていること。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/animations-leave-classes)

---

[第 9 回](09-animations-leave-removal.md)で、要素を消す callback は「leave の Promise が全部終わったら」呼ばれると分かりました。この章は、その Promise を作って resolve する側です。`animate.leave="fade"` のようにクラスを渡したとき、`runLeaveAnimations` と `animateLeaveClassRunner` がクラスを付け、終わりを待ち、片付けるまでを 1 行ずつ読みます。

読む対象は `packages/core/src/render3/instructions/animation.ts` の 280〜398 行目と、`packages/core/src/animation/utils.ts` の `cancelAnimationsIfRunning`・`cleanupAfterLeaveAnimations` です。

1. [1. 全体像](01-animations-overview.md)
2. [2. テンプレートから命令へ](02-animations-compile.md)
3. [3. 命令がすること](03-animations-instructions.md)
4. [4. 待ち行列](04-animations-queue.md)
5. [5. enter のクラス](05-animations-enter-classes.md)
6. [6. いちばん長いアニメーション](06-animations-longest.md)
7. [7. 関数で動かす](07-animations-functions.md)
8. [8. 動かないとき](08-animations-disabled.md)
9. [9. 消すのを遅らせる](09-animations-leave-removal.md)
10. **10. leave のクラス**（この章）
11. [11. 入れ子の leave](11-animations-leave-nested.md)
12. [12. 並べ替えと出し直し](12-animations-leave-reorder.md)
13. [13. スタイルの後片付け](13-animations-styles-teardown.md)
14. [14. 旧パッケージの入口](14-animations-legacy-setup.md)
15. [15. 旧 DSL とキーフレーム](15-animations-legacy-dsl.md)
16. [16. TransitionAnimationEngine](16-animations-legacy-engine.md)
17. [17. 2 つが同居するとき](17-animations-legacy-compat.md)
18. [18. 移行](18-animations-migration.md)
19. [19. テスト](19-animations-testing.md)
20. [20. issue と変更を読む](20-animations-issues.md)

## 1. runLeaveAnimations：Promise を作り、resolver を LView に置く

`ɵɵanimateLeave` は、要素の `tNode.index` をキーにして「あとで `runLeaveAnimations` を呼ぶ関数」を LView に登録しました（[第 3 回](03-animations-instructions.md)）。第 9 回の `executeLeaveAnimations` がその関数を呼ぶと、ここに来ます。

📄 `angular/packages/core/src/render3/instructions/animation.ts` L280–310 （▶ の行: 286–287, 292–293, 295–297, 305–306, 309）

```ts
280 │ function runLeaveAnimations(
281 │   lView: LView,
282 │   tNode: TNode,
283 │   value: string | AnimationClassBindingFn,
284 │   ngZone: NgZone,
285 │ ): {promise: Promise<void>; resolve: VoidFunction} {
286 ▶   const {promise, resolve} = promiseWithResolvers<void>();
287 ▶   const nativeElement = getNativeByTNode(tNode, lView) as Element;
288 │ 
289 │   ngDevMode && assertElementNodes(nativeElement, 'animate.leave');
290 │ 
291 │   const renderer = lView[RENDERER];
292 ▶   allLeavingAnimations.add(lView[ID]);
293 ▶   (getLViewLeaveAnimations(lView).get(tNode.index)!.resolvers ??= []).push(resolve);
294 │ 
295 ▶   const activeClasses = getClassListFromValue(value);
296 ▶   if (activeClasses && activeClasses.length > 0) {
297 ▶     animateLeaveClassRunner(
298 │       nativeElement as HTMLElement,
299 │       tNode,
300 │       lView,
301 │       activeClasses,
302 │       renderer,
303 │       ngZone,
304 │     );
305 ▶   } else {
306 ▶     resolve();
307 │   }
308 │ 
309 ▶   return {promise, resolve};
310 │ }
```
*runLeaveAnimations（animation.ts）*

1. **286 行目：外から resolve できる Promise を作る**

   `promiseWithResolvers` は `{promise, resolve}` を返す小さな関数で、309 行目でそのまま返します。第 9 回の 162 行目はこの `promise` を集めて `allSettled` で待ちます。**resolve が呼ばれるまで要素は消えません。**
2. **292 行目：ビューを「leave の途中」の集合に入れる**

   第 9 回の 78 行目と同じ集合です。スタイルの後片付けがこれを見て待ちます（[第 13 回](13-animations-styles-teardown.md)）。
3. **293 行目：resolve を、自分の変数ではなく LView の Map に置く**

   同じ要素の leave の Map の項目に `resolvers` 配列を作り、そこへ `resolve` を足します。同じ要素に leave が 2 つあると（テンプレートの `animate.leave` と、ホストバインディングの `animate.leave` など）、`runLeaveAnimations` は 2 回呼ばれ、配列に 2 つ並びます。片付けるときは配列の全部を呼ぶので（3 節）、**短いほうが先に終わっても、自分の Promise だけ先に resolve されることがない**形になっています。この形は issue #64209（transition の delay があると leave が正しく動かない）を直したコミット e279f301992 で入りました。
4. **295〜307 行目：クラスがあれば付けに行き、無ければすぐ resolve**

   `getClassListFromValue` は文字列なら空白で割り、配列ならそのまま、関数なら呼んだ結果を使います。空なら 306 行目で即 resolve。つまり `[animate.leave]="cls()"` が空文字を返せば、待たずに消えます。

## 2. animateLeaveClassRunner の前半：enter を止め、終わりの判定を用意する

📄 `angular/packages/core/src/render3/instructions/animation.ts` L316–338 （▶ の行: 324, 326–328, 330–331, 333, 336–337）

```ts
316 │ function animateLeaveClassRunner(
317 │   el: HTMLElement,
318 │   tNode: TNode,
319 │   lView: LView,
320 │   classList: string[],
321 │   renderer: Renderer,
322 │   ngZone: NgZone,
323 │ ) {
324 ▶   cancelAnimationsIfRunning(el, renderer);
325 │   const cleanupFns: VoidFunction[] = [];
326 ▶   const componentResolvers = getLViewLeaveAnimations(lView).get(tNode.index)?.resolvers;
327 ▶   let fallbackTimeoutId: number | undefined;
328 ▶   let hasCompleted = false;
329 │ 
330 ▶   const handleOutAnimationEnd = (event: AnimationEvent | TransitionEvent | CustomEvent) => {
331 ▶     const target = getEventTarget(event as Event);
332 │     // Custom fallback events don't have a target, so we bypass this check for them.
333 ▶     if (target !== el && event.type !== 'animation-fallback') return;
334 │ 
335 │     if (
336 ▶       event.type === 'animation-fallback' ||
337 ▶       isLongestAnimation(event as TransitionEvent | AnimationEvent, el)
338 │     ) {
```
*animateLeaveClassRunner の冒頭と、終わりのイベントの判定*

📄 `angular/packages/core/src/animation/utils.ts` L284–302 （▶ の行: 289–290, 294, 296–297, 301）

```ts
284 │ /**
285 │  * Cancels any running enter animations on a given element to prevent them from interfering
286 │  * with leave animations.
287 │  */
288 │ export function cancelAnimationsIfRunning(element: HTMLElement, renderer: Renderer): void {
289 ▶   if (!areAnimationSupported) return;
290 ▶   const elementData = enterClassMap.get(element);
291 │   if (
292 │     elementData &&
293 │     elementData.classList.length > 0 &&
294 ▶     elementHasClassList(element, elementData.classList)
295 │   ) {
296 ▶     for (const klass of elementData.classList) {
297 ▶       renderer.removeClass(element as unknown as RElement, klass);
298 │     }
299 │   }
300 │   // We need to prevent any enter animation listeners from firing if they exist.
301 ▶   cleanupEnterClassData(element);
302 │ }
```
*cancelAnimationsIfRunning（utils.ts）*

1. **324 行目：まだ enter が動いていたら止める**

   出してすぐ消すと、要素には enter のクラスがまだ付いています。`cancelAnimationsIfRunning` は、`enterClassMap`（enter で付けたクラスの記録、[第 5 回](05-animations-enter-classes.md)）を見て、付いていれば 296〜298 行目で外し、301 行目で enter の終わりのリスナーと記録を消します。enter のクラスが残ったままだと、leave のクラスとどちらのアニメーションが効くかが CSS の詳細度次第になってしまいます。issue #63439（leave が enter を取り消さない）を直したのが ed3d1f246b1 で、291〜299 行目の「記録したクラスが付いていれば外す」形はそのとき入りました（当時は animation.ts の中）。
2. **326 行目：resolvers の配列を、いま取っておく**

   1 節の 293 行目で作った配列そのもの（同じオブジェクト）です。片付けで全部を呼びます。
3. **330〜338 行目：終わりのイベントを「いちばん長いものか」で選ぶ**

   `animationend` / `transitionend` は、子の要素のアニメーションからも bubbling で届きます。333 行目で、届いた先が自分（`el`）でなければ無視します。ただし `animation-fallback`（4 節の setTimeout が投げる自作のイベント）は target を持たないので、この検査を通します。337 行目の `isLongestAnimation` は、次のフレームで測った「いちばん長いアニメーション」の名前や property と、届いたイベントが合うかを見ます（[第 6 回](06-animations-longest.md)）。transition が 4 本あれば `transitionend` も 4 回届きますが、片付けに進むのはいちばん長い 1 本のときだけです。

## 3. 終わったときの片付け

📄 `angular/packages/core/src/render3/instructions/animation.ts` L339–370 （▶ の行: 339, 344–347, 349, 354, 357–358, 363–364, 366, 369）

```ts
339 ▶       hasCompleted = true;
340 │       // Now that we've found the longest animation, there's no need
341 │       // to keep bubbling up this event as it's not going to apply to
342 │       // other elements further up. We don't want it to inadvertently
343 │       // affect any other animations on the page.
344 ▶       if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
345 ▶       if (event.type !== 'animation-fallback') event.stopPropagation();
346 ▶       longestAnimations.delete(el);
347 ▶       clearLeavingNodes(tNode, el);
348 │ 
349 ▶       if (Array.isArray(tNode.projection)) {
350 │         // in the content projection case, the element is not destroyed.
351 │         // So we need to remove the class at the end so that it isn't left
352 │         // behind for whenever the item shows up again.
353 │         for (const item of classList) {
354 ▶           renderer.removeClass(el, item);
355 │         }
356 │       }
357 ▶       cleanupAfterLeaveAnimations(componentResolvers, cleanupFns);
358 ▶       clearLViewNodeAnimationResolvers(lView, tNode);
359 │     }
360 │   };
361 │ 
362 │   ngZone.runOutsideAngular(() => {
363 ▶     cleanupFns.push(renderer.listen(el, 'animationend', handleOutAnimationEnd));
364 ▶     cleanupFns.push(renderer.listen(el, 'transitionend', handleOutAnimationEnd));
365 │   });
366 ▶   trackLeavingNodes(tNode, el);
367 │ 
368 │   for (const item of classList) {
369 ▶     renderer.addClass(el, item);
370 │   }
```
*片付けと、リスナー・クラスを付ける行*

📄 `angular/packages/core/src/animation/utils.ts` L392–409 （▶ の行: 397–398, 401–402, 408）

```ts
392 │ export function cleanupAfterLeaveAnimations(
393 │   resolvers: VoidFunction[] | undefined,
394 │   cleanupFns: VoidFunction[],
395 │ ): void {
396 │   if (resolvers) {
397 ▶     for (const fn of resolvers) {
398 ▶       fn();
399 │     }
400 │   }
401 ▶   for (const fn of cleanupFns) {
402 ▶     fn();
403 │   }
404 │ }
405 │ 
406 │ export function clearLViewNodeAnimationResolvers(lView: LView, tNode: TNode) {
407 │   const nodeAnimations = getLViewLeaveAnimations(lView).get(tNode.index);
408 ▶   if (nodeAnimations) nodeAnimations.resolvers = undefined;
409 │ }
```
*cleanupAfterLeaveAnimations と clearLViewNodeAnimationResolvers（utils.ts）*

1. **339・344 行目：「終わった」印を立て、fallback のタイマーを止める**

   `hasCompleted` は 4 節の requestAnimationFrame が見ます。
2. **345 行目：本物のイベントなら `stopPropagation`**

   340〜343 行目のコメントの通り、このイベントは他の要素には関係ないので、親へ bubbling させません。そのため、親の要素に `(animationend)` を bubbling で書いても、leave のいちばん長いアニメーションの終わりは届きません（下のデモは capture で聞いています）。
3. **346〜347 行目：記録を消す**

   `longestAnimations` から自分を消し、`clearLeavingNodes` で「消える途中の要素」の記録からも外します（[第 12 回](12-animations-leave-reorder.md)）。
4. **349〜356 行目：コンテンツ投影のときだけ、leave のクラスを外す**

   `tNode.projection` が配列なのは、その要素が **`<ng-content>` を持つコンポーネントのホスト要素**のときです（`interfaces/node.ts` の `TNode.projection` の説明）。350〜352 行目のコメントの通り、その場合は要素が壊されずにもう一度表示されることがあるので、クラスを残すと次に出たとき消えかけの見た目で出てしまいます。ふつうの要素は DOM から外れて捨てられるので、クラスを外す必要がありません。
5. **357 行目 → 397〜403 行目：resolvers を全部呼び、リスナーを外す**

   398 行目で resolvers を順に呼ぶと、1 節の Promise が resolve され、第 9 回の `allSettled` が進みます。402 行目の `cleanupFns` には、363〜364 行目の `renderer.listen` が返した「リスナーを外す関数」と、4 節の `clearTimeout` が入っています。358 行目 → 408 行目で、LView の Map の resolvers も空にします（次の leave のときに古い resolve を呼ばないため）。
6. **362〜370 行目：リスナー → 記録 → クラス、の順**

   363〜364 行目で `animationend` と `transitionend` の両方を聞きます。`runOutsideAngular` の中なのは、zone.js がある構成でこのリスナーが変更検知を起こさないためです（zoneless では `NoopNgZone` なので何もしない）。366 行目で消える途中として記録し、368〜370 行目で `renderer.addClass` でクラスを付けます。**ここで CSS のアニメーションや transition が始まります。**

## 4. 次のフレーム：アニメーションが無ければ片付け、あれば保険のタイマー

📄 `angular/packages/core/src/render3/instructions/animation.ts` L371–398 （▶ の行: 374, 380–382, 384–386, 391–394）

```ts
371 │ 
372 │   // Force a reflow to ensure the browser registers the class addition and triggers the transition
373 │   // eslint-disable-next-line @typescript-eslint/no-unused-vars
374 ▶   const _reflow = el.offsetWidth;
375 │ 
376 │   // In the case that the classes added have no animations, we need to remove
377 │   // the element right away. This could happen because someone is intentionally
378 │   // preventing an animation via selector specificity.
379 │   ngZone.runOutsideAngular(() => {
380 ▶     requestAnimationFrame(() => {
381 ▶       if (hasCompleted) return;
382 ▶       determineLongestAnimation(el, longestAnimations, areAnimationSupported);
383 │       const longest = longestAnimations.get(el);
384 ▶       if (!longest) {
385 ▶         clearLeavingNodes(tNode, el);
386 ▶         cleanupAfterLeaveAnimations(componentResolvers, cleanupFns);
387 │         clearLViewNodeAnimationResolvers(lView, tNode);
388 │       } else {
389 │         // Fallback cleanup if the browser drops the transitionend/animationend event
390 │         // entirely due to off-screen optimizations or rapid DOM teardown.
391 ▶         fallbackTimeoutId = setTimeout(() => {
392 ▶           handleOutAnimationEnd(new CustomEvent('animation-fallback'));
393 ▶         }, longest.duration + 50) as unknown as number;
394 ▶         cleanupFns.push(() => clearTimeout(fallbackTimeoutId));
395 │       }
396 │     });
397 │   });
398 │ }
```
*offsetWidth、requestAnimationFrame、fallback の setTimeout*

1. **374 行目：`el.offsetWidth` を読んで再計算させる**

   372 行目のコメントは「クラスを付けたことをブラウザに登録させ、transition を始めさせるため」です。`offsetWidth` を読むと、ブラウザはその時点のスタイルとレイアウトを計算し直します。読まなければ、計算はふつう次の描画の前にまとめて行われます。変数 `_reflow` は使われないので、373 行目で lint の警告を止めています。
2. **380〜387 行目：次のフレームで、アニメーションが 1 つも無ければその場で片付ける**

   376〜378 行目のコメントの通り、付けたクラスにアニメーションが無いことがあります（詳細度でわざと止めている場合など）。382 行目の `determineLongestAnimation`（第 6 回）が何も見つけなければ、385〜387 行目で 3 節と同じ片付けをして resolve します。381 行目は、このフレームが来る前に（とても短いアニメーションで）もう終わっていたときに二重に片付けないための行です。
3. **389〜394 行目：終わりのイベントが来なかったときの保険**

   389〜390 行目のコメントの通り、画面外の最適化や DOM を急いで壊したときに、ブラウザが `transitionend` / `animationend` を出さないことがあります。そこで **いちばん長いアニメーションの長さ + 50 ms** で `new CustomEvent('animation-fallback')` を作り、3 節の判定へ自分で流します（392 行目）。+50 ms の理由はコメントに書かれていません。コードから読めるのは、いちばん長いアニメーションが終わる時刻より 50 ms あとに鳴ること、本物が先に来れば 344 行目でこのタイマーが消されることです。394 行目で `clearTimeout` を `cleanupFns` に足し、どちらの道で終わってもタイマーが残らないようにしています。fallback と `offsetWidth` の行は、どちらも 9e64147b731（issue #67400、ルートを移るときに子の要素が DOM に残る）で入りました。

> [!WARNING]
> **ハマりどころ**
>
> このサイトが使っている `@angular/core` 22.1.6 の配布物（`node_modules/@angular/core/fesm2022/_debug_node-chunk.mjs`）を grep すると、`animateLeaveClassRunner` の中に **374 行目の `const _reflow = el.offsetWidth;` がありません**。同じファイルの source map の `sourcesContent` には 372〜374 行目がそのまま入っており、v22.1.6 のタグのソースにもあります。パッケージを作る rules\_angular の `ng_package` の `rollup.config.js` が `treeshake` に `propertyReadSideEffects: false` を指定しているので、rollup が「使われない変数への property の読み出し」を副作用なしとみなして消した、と読めます。このサイトの transition のデモ（下の ②・③）はこの行の無い 22.1.6 で動いています。この行が無いことで振る舞いが変わる場面があるかは、確かめていません。

## 5. デモ：クラスの種類と、消えるまでの時刻

> **🧪 DEMO — 本物の animate.leave（Angular 22.1.6）**
>
> 4 つの箱は、それぞれ別の `@if` の中の本物の要素です。leave のクラスは ① `@keyframes` 600 ms、② transition 600 ms（opacity と transform の 2 本）、③ transition 300 ms + delay 400 ms、④ アニメーションの無いクラス（枠線だけ）。「消す」を押すと、そのときだけ `MutationObserver`（class と子の増減）と、capture の `animationend` / `transitionend` を付けて時刻を並べます。OS の設定で動きを減らしていても、このデモは動きます。
>
> ヘッドレスの Chromium で動かしたときの順番は次の通りでした。4 つの箱に leave のクラスが付き（待ち行列が流れたとき）、④は次のフレームで外れました（4 節の 384〜387 行目）。②は `transitionend` が 2 回（`opacity` と `transform`）届き、①・②は約 600 ms、③は約 700 ms で外れました。③は delay の 400 ms を含めた長さを待っています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-leave-classes)

> **🧪 再現 — 終わりのイベントを使わずに fallback で片付ける**
>
> 本物でブラウザに `animationend` を出させないようにするのは難しいので、**再現**です（Angular の関数は呼びません）。4 節の 380〜394 行目と同じ順で、クラスを付ける → 次のフレームで `getAnimations()` から長さを測る → 長さ + 50 ms の `setTimeout` で片付ける、を動かします。長さの測り方は第 6 回の `determineLongestAnimation` ではなく、`getComputedTiming().endTime` の最大を使う簡略版です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-leave-classes)

## ここまでの呼び出し

- `executeLeaveAnimations()` — node\_animations.ts L144 — *第 9 回。待ち行列から*
  - `animationFn()` → `runLeaveAnimations()` — animation.ts L280 — *Promise を作り resolver を LView に（L286・L293）*
    - `animateLeaveClassRunner()` — animation.ts L316
      - `cancelAnimationsIfRunning()` — utils.ts L288 — *enter のクラスとリスナーを外す*
      - `renderer.listen(el, 'animationend' / 'transitionend')` — L363-364
      - `trackLeavingNodes()` → `renderer.addClass()` — L366-370 — *ここで動き始める*
      - `el.offsetWidth` — L374 — *22.1.6 の配布物には無い*
      - `requestAnimationFrame` → `determineLongestAnimation()` — L380-382 — *無ければ即片付け／あれば長さ + 50 ms の setTimeout*
  - `handleOutAnimationEnd(event)` — L330 — *いちばん長いものの終わり、または animation-fallback*
    - `cleanupAfterLeaveAnimations(resolvers, cleanupFns)` — utils.ts L392 — *resolve → 第 9 回の allSettled が進む*

## テストと直し方

「いちばん長いものを待つ」は `describe('animate.leave')` の `it('should await the longest animation when multiple transitions are present')`（809 行目）が確かめています。issue #64209 を直した e279f301992 で足された it です。

📄 `angular/packages/core/test/acceptance/animation_spec.ts` L809–825 （▶ の行: 817–818, 825）

```ts
809 │     it('should await the longest animation when multiple transitions are present', fakeAsync(() => {
810 │       const multiple = `
811 │         .slide-out {
812 │           grid-template-rows: 0fr;
813 │           overflow: hidden;
814 │           opacity: 0;
815 │           translate: 0 -60px;
816 │           margin-top: -16px;
817 ▶           transition: grid-template-rows 1s ease 400ms, margin-top 1s ease 400ms,
818 ▶             opacity 400ms ease, translate 400ms ease;
819 │         }
820 │       `;
821 │       @Component({
822 │         changeDetection: ChangeDetectionStrategy.Eager,
823 │         selector: 'test-cmp',
824 │         styles: multiple,
825 ▶         template: '@if (show()) { <div animate.leave="slide-out"><p>Element with text</p></div> }',
```
*4 本の transition を持つ leave のクラス*

📄 `angular/packages/core/test/acceptance/animation_spec.ts` L838–865 （▶ の行: 841, 844, 847, 850, 854, 856, 859, 862–864）

```ts
838 │       expect(div.nativeElement.className).not.toContain('slide-out');
839 │       cmp.show.set(false);
840 │       fixture.detectChanges();
841 ▶       tickAnimationFrames(1);
842 │       expect(cmp.show()).toBeFalsy();
843 │       fixture.detectChanges();
844 ▶       expect(div.nativeElement.className).toContain('slide-out');
845 │       fixture.detectChanges();
846 │ 
847 ▶       div.nativeElement.dispatchEvent(
848 │         new TransitionEvent('transitionend', {propertyName: 'opacity'}),
849 │       );
850 ▶       div.nativeElement.dispatchEvent(
851 │         new TransitionEvent('transitionend', {propertyName: 'translate'}),
852 │       );
853 │ 
854 ▶       expect(fixture.nativeElement.outerHTML).toContain('slide-out');
855 │ 
856 ▶       div.nativeElement.dispatchEvent(
857 │         new TransitionEvent('transitionend', {propertyName: 'margin-top'}),
858 │       );
859 ▶       div.nativeElement.dispatchEvent(
860 │         new TransitionEvent('transitionend', {propertyName: 'grid-template-rows'}),
861 │       );
862 ▶       tick();
863 ▶       expect(fixture.nativeElement.outerHTML).not.toContain('slide-out');
864 ▶       expect(fixture.debugElement.query(By.css('div'))).toBeNull();
865 │     }));
```
*transitionend を 1 本ずつ手で投げる*

このクラスには 4 本の transition があり、長いのは delay 400 ms + 1 s の 2 本（`grid-template-rows` と `margin-top`、817〜818 行目）です。841 行目で待ち行列を流し、844 行目でクラスが付いたことを見たあと、847〜852 行目で短い 2 本（opacity・translate）の `transitionend` を投げても 854 行目でまだクラスが残っていること、856〜861 行目で残りを投げ、862 行目の `tick()` のあと 863〜864 行目で消えていることを確かめます。

1. **走らせ方と結果**

   `animation_spec.ts` はブラウザ版の `//packages/core/test/acceptance:acceptance_web_chromium` でしか中身が走りません（Node 版は 50〜53 行目で 1 本だけ）。2026-11-01 に `pnpm bazel test //packages/core/test/acceptance:acceptance_web_chromium --nocache_test_results` を走らせ、`2743 passed, 0 failed, 3 skipped`、`Finished running tests in 6.3s`、`PASSED in 6.8s` でした（ログは scratchpad/anim-logs/c-acceptance-web-chromium.log）。絞り込みの引数は無いので、1 本だけ見たいときは手元の作業コピーで `it` を `fit` にします（ここでは試していません）。
2. **この章に関わる it の数え方**

   クラスの leave を扱う it は `describe('animate.leave')`（76〜993 行目、17 本）に集まっています。`grep -n "^\s*it(" packages/core/test/acceptance/animation_spec.ts | awk -F: '$1>=76 && $1<=994'` で一覧が出ます。fallback の setTimeout（389〜394 行目）を直接確かめる it は acceptance にはありません。`integration/animations/e2e/src/animations.e2e-spec.ts` の `it('should remove element when animationend is dropped (fallback timeout)')`（76 行目）が、本物のブラウザで確かめています。
3. **読んでいて気づくこと**

   同じ describe の `it('should remove right away when classes have no animations')`（155 行目）は、最後に `@ViewChild` の値が `undefined` になったことを見ています。`@if` のビューが外れれば `@ViewChild` は要素が DOM に残っていても外れるので、「すぐ DOM から消えた」ことはこの行だけでは確かめられません。spec を書き直す練習の題材になります（本家に出すことは勧めません）。
4. **直すとしたら**

   クラスの付け外しと終わりの判定は `animation.ts` の `animateLeaveClassRunner`、いちばん長いものの判定は `longest_animation.ts` の `determineLongestAnimation` と `utils.ts` の `isLongestAnimation`、片付けは `utils.ts` の `cleanupAfterLeaveAnimations` です。spec は `acceptance/animation_spec.ts` の `describe('animate.leave')` に足します。
5. **最新の main では**

   7e678e0ed72（`#70764` の一部）で 349〜356 行目の `if (Array.isArray(tNode.projection))` が無くなり、終わったら**いつも**`removeClasses` で leave のクラスを外すようになりました。336 行目の条件にも `(event as CustomEvent).detail?.cancel` が足され、第 12 回の「取り消し」のイベントでも片付けに進むようになっています。どちらも ../angular と 22.1.6 には入っていません。

## 聞かれそうな質問

**Q. offsetWidth を読まないと何が起きますか？**

372 行目のコメントが言う目的は「クラスを付けたことをブラウザに登録させ、transition を始めさせる」ことです。読まなければ、スタイルの再計算は次の描画の前まで遅れます。leave の要素はすでに描かれている要素なので、前のスタイルは計算済みで、クラスを付ければ transition の始まりと終わりの値は決まります。実際、374 行目が消えている 22.1.6 の配布物でも、このページの transition のデモ（②・③）は動きました。この行が無いと困る場面があるかは確かめていません。

**Q. fallback の +50 ms は何のためですか？**

コメントに理由は書かれていないので、コードから言えることだけ答えます。タイマーは「長さ + 50 ms」なので、いちばん長いアニメーションが終わる時刻より 50 ms あとに鳴ります。本物が先に来れば 344 行目でタイマーが消され、本物が来なかったときだけ 392 行目の `animation-fallback` が片付けます。長さちょうどだと、本物と同じころに鳴ることになります。391 行目の長さは次のフレーム（380 行目）で測ったものなので、タイマーが鳴るのはクラスを付けてから「1 フレーム + 長さ + 50 ms」くらいです。

**Q. enter の途中で leave になったらどうなりますか？**

2 段で止めます。まだ待ち行列の中なら、第 9 回の 58〜60 行目で enter の関数を待ち行列から抜きます（クラスは付かない）。すでに enter のクラスが付いて動いていれば、324 行目の `cancelAnimationsIfRunning` が enter のクラスを外し（296〜298 行目）、enter の終わりのリスナーと記録を消してから（301 行目）、leave のクラスを付けます。

**Q. 親で (animationend) を聞いていますが、leave の終わりが来ません。**

345 行目で、いちばん長いアニメーションの `animationend` / `transitionend` は `stopPropagation` されます。要素自身に `(animationend)` を書けば届きます（[第 9 回](09-animations-leave-removal.md)で引用した spec の 98 行目は、そう書いて 129 行目で呼ばれたことを確かめています）。親で聞きたいなら capture で聞きます。

## 読み終えて

- `runLeaveAnimations` は Promise を作り、resolve を LView の Map の `resolvers` に置く（286・293 行目）。クラスが空ならすぐ resolve。
- `animateLeaveClassRunner` は enter を止め、リスナーを付け、クラスを付ける（324・363〜370 行目）。
- 次のフレームでアニメーションが無ければ即片付け、あれば長さ + 50 ms の保険のタイマーを置く（380〜394 行目）。
- 片付けはいちばん長いものの終わりか fallback で 1 回だけ。resolvers を全部呼び、リスナーとタイマーを外す（357 行目・utils.ts 392〜404 行目）。
- 374 行目の `offsetWidth` は、22.1.6 の配布物では rollup の設定で消えている。

---

← 前: [要素を消すのを遅らせる：runLeaveAnimationsWithCallback](09-animations-leave-removal.md)  
次: [入れ子の leave：子孫と埋め込みビューのアニメーションを集めて待つ](11-animations-leave-nested.md) →
