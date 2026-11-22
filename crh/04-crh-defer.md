[目次](../README.md) › [core の説明文の読み残し（3）](README.md) › 第 4 回 / 全 8 回

# @defer の実装のコメントと説明文

> defer/instructions.ts・triggering.ts・rendering.ts の未読の行：各トリガー（idle・viewport・interaction・hover・timer・immediate）と prefetch の約束、minimum と after、ハイドレーションの trigger。本物で状態の移り変わりを記録する。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crh-defer)

---

この章で分かること：`@defer` のトリガーの命令（`ɵɵdeferOnHover` ほか）の説明文と、prefetch・hydrate のトリガーを初期化する関数のコメントの約束を、ページの上の本物の `@defer` を時刻つきで記録した表と、Node の上でインクリメンタルハイドレーションを動かした記録で確かめます。食い違いは 3 つありました。開発モードのトリガーの名前（DevTools が出す）は、`on viewport(ref)` だけ `(<target>)` が付きません。`processAndInitTriggers` の「すべてのブロックのトリガーを正しく初期化する」（triggering.ts 651〜653 行目）は、根のノードが要素のブロックだけで、テキストだけのブロックの `hydrate on timer` は入れ子では動きませんでした。`warnIncrementalHydrationNotConfigured` の「例外を投げる」（utils.ts 419 行目）は警告でした。

読む対象は `packages/core/src/defer/` の `instructions.ts`・`triggering.ts`・`dom_triggers.ts`・`rendering.ts`・`registry.ts` と、ハイドレーションの側の `utils.ts`・`interfaces.ts`・`node_lookup_utils.ts`・`incremental_runtime.ts` の一部です（../angular、8576f161ae4）。`@defer` の流れは既存の章が読んでいます。全体は[@defer の概観](../defer/01-defer-overview.md)、トリガーから描画までは[トリガーの流れ](../defer/07-defer-trigger-flow.md)、DOM のトリガーは[DOM のトリガー](../defer/11-defer-dom-triggers.md)、prefetch は[prefetch](../defer/13-defer-prefetch.md)、minimum と after は[minimum と after](../defer/05-defer-minimum-after.md)、hydrate のトリガーは[hydrate のトリガー](../defer/16-defer-hydrate-triggers.md)と[インクリメンタルハイドレーション](../platform/15-incremental-hydration.md)の章です。ここでは繰り返さずに行だけ指します。

1. [1. ハイドレーションの公開 API と型](01-crh-hydration-api.md)
2. [2. ngh の書き出し](02-crh-hydration-annotate.md)
3. [3. ノードの探し方と不一致](03-crh-hydration-errors.md)
4. **4. @defer**（この章）
5. [5. resource()](05-crh-resource.md)
6. [6. Renderer2](06-crh-renderer.md)
7. [7. 開発用の小道具](07-crh-dev-utils.md)
8. [8. spec と issue](08-crh-tests-issues.md)

## 1. トリガーの命令の説明文：walkUpTimes

📄 `angular/packages/core/src/defer/instructions.ts` L558–566 （▶ の行: 562–565）

```ts
558 │   }
559 │ }
560 │ 
561 │ /**
562 ▶  * Creates runtime data structures for the `on hover` deferred trigger.
563 ▶  * @param triggerIndex Index at which to find the trigger element.
564 ▶  * @param walkUpTimes Number of times to walk up/down the tree hierarchy to find the trigger.
565 ▶  * @codeGenApi
566 │  */
```

`on hover`・`on interaction`・`on viewport` の命令は、どれも 562〜565 行目と同じ説明を持ちます（下の 655〜663 行目、752〜760 行目）。`@codeGenApi` は「コンパイラが出すコードからだけ呼ぶ」の印です。563 行目の `triggerIndex` は引き金の要素のスロットの番号、564 行目の `walkUpTimes` は「引き金を見つけるのに木を上（下）に何回たどるか」です。

📄 `angular/packages/core/src/defer/dom_triggers.ts` L57–65 （▶ の行: 59–64）

```ts
57 │ 
58 │ /**
59 ▶  * Helper function to get the LView in which a deferred block's trigger is rendered.
60 ▶  * @param deferredHostLView LView in which the deferred block is defined.
61 ▶  * @param deferredTNode TNode defining the deferred block.
62 ▶  * @param walkUpTimes Number of times to go up in the view hierarchy to find the trigger's view.
63 ▶  *   A negative value means that the trigger is inside the block's placeholder, while an undefined
64 ▶  *   value means that the trigger is in the same LView as the deferred block.
65 │  */
```

受け取る側の 62〜64 行目のほうが詳しく、「負の値なら引き金は `@placeholder` の中、`undefined` ならブロックと同じ LView」です。コンパイラ（compiler の template/pipeline/src/phases/reify.ts の L420〜451）は、`@placeholder` の中の暗黙の引き金に `-1`、同じビューの `#ref` には引数を省き（`undefined`）、親のビューの `#ref` にはたどる回数、viewport の options があって同じビューのときだけ `null` を出します。受け取る関数の L72 は `walkUpTimes == null` で `undefined` と `null` の両方を「同じビュー」にするので、64 行目の「`undefined` なら」は `null` も含みます。

📄 `angular/packages/core/src/defer/instructions.ts` L655–663 （▶ の行: 659–661）

```ts
655 │   // event_replay.ts.
656 │ }
657 │ 
658 │ /**
659 ▶  * Creates runtime data structures for the `on interaction` deferred trigger.
660 ▶  * @param triggerIndex Index at which to find the trigger element.
661 ▶  * @param walkUpTimes Number of times to walk up/down the tree hierarchy to find the trigger.
662 │  * @codeGenApi
663 │  */
```

📄 `angular/packages/core/src/defer/instructions.ts` L752–760 （▶ の行: 756–758）

```ts
752 │   // event_replay.ts.
753 │ }
754 │ 
755 │ /**
756 ▶  * Creates runtime data structures for the `on viewport` deferred trigger.
757 ▶  * @param triggerIndex Index at which to find the trigger element.
758 ▶  * @param walkUpTimes Number of times to walk up/down the tree hierarchy to find the trigger.
759 │  * @codeGenApi
760 │  */
```

## 2. 開発モードのトリガーの名前：viewport だけ &lt;target&gt; が抜ける

📄 `angular/packages/core/src/defer/instructions.ts` L693–729 （▶ の行: 695, 704–708, 712, 714–715, 717–718, 724）

```ts
693 │ 
694 │ /**
695 ▶  * Creates runtime data structures for the `prefetch on interaction` deferred trigger.
696 │  * @param triggerIndex Index at which to find the trigger element.
697 │  * @param walkUpTimes Number of times to walk up/down the tree hierarchy to find the trigger.
698 │  * @codeGenApi
699 │  */
700 │ export function ɵɵdeferPrefetchOnInteraction(triggerIndex: number, walkUpTimes?: number) {
701 │   const lView = getLView();
702 │   const tNode = getCurrentTNode()!;
703 │ 
704 ▶   if (ngDevMode) {
705 ▶     trackTriggerForDebugging(
706 ▶       lView[TVIEW],
707 ▶       tNode,
708 ▶       `prefetch on interaction${walkUpTimes === -1 ? '' : '(<target>)'}`,
709 │     );
710 │   }
711 │ 
712 ▶   if (!shouldAttachTrigger(TriggerType.Prefetch, lView, tNode)) return;
713 │ 
714 ▶   const tView = lView[TVIEW];
715 ▶   const tDetails = getTDeferBlockDetails(tView, tNode);
716 │ 
717 ▶   if (tDetails.loadingState === DeferDependenciesLoadingState.NOT_STARTED) {
718 ▶     registerDomTrigger(
719 │       lView,
720 │       tNode,
721 │       triggerIndex,
722 │       walkUpTimes,
723 │       onInteraction,
724 ▶       () => triggerPrefetching(tDetails, lView, tNode),
725 │       TriggerType.Prefetch,
726 │     );
727 │   }
728 │ }
729 │ 
```

📄 `angular/packages/core/src/defer/instructions.ts` L801–831 （▶ の行: 817–823, 825, 828）

```ts
801 │ }
802 │ 
803 │ /**
804 │  * Creates runtime data structures for the `prefetch on viewport` deferred trigger.
805 │  * @param triggerIndex Index at which to find the trigger element.
806 │  * @param walkUpTimes Number of times to walk up/down the tree hierarchy to find the trigger.
807 │  * @codeGenApi
808 │  */
809 │ export function ɵɵdeferPrefetchOnViewport(
810 │   triggerIndex: number,
811 │   walkUpTimes?: number | null,
812 │   options?: IntersectionObserverInit,
813 │ ) {
814 │   const lView = getLView();
815 │   const tNode = getCurrentTNode()!;
816 │ 
817 ▶   if (ngDevMode) {
818 ▶     const args: string[] = [];
819 ▶     if (walkUpTimes !== undefined && walkUpTimes !== -1) {
820 ▶       args.push('<target>');
821 ▶     }
822 ▶     if (options) {
823 ▶       args.push(JSON.stringify(options));
824 │     }
825 ▶     trackTriggerForDebugging(
826 │       lView[TVIEW],
827 │       tNode,
828 ▶       `prefetch on viewport${args.length === 0 ? '' : `(${args.join(', ')})`}`,
829 │     );
830 │   }
831 │ 
```

各命令は開発モードで `trackTriggerForDebugging`（defer/utils.ts L191〜196）にトリガーの名前を足します。Angular DevTools の `@defer` の表示に出る文字列で、`ng.ɵgetControlFlowBlocks(要素)` の `triggers` で読めます。interaction と hover は 708 行目の `walkUpTimes === -1 ? '' : '(<target>)'`、つまり「`@placeholder` の中の暗黙の引き金でなければ `<target>`」です。viewport は 819 行目の `walkUpTimes !== undefined && walkUpTimes !== -1` で、1 節のとおり同じビューの `#ref` は `undefined` なので、`<target>` が付きません。

Node の上で 1 つのテンプレートに並べて開発モードで描き、`ng.ɵgetControlFlowBlocks` で読んだ記録は次のとおりです（7 節のあとの DEMO の「トリガーの名前」でも出せます）。

| テンプレート（`#b` は同じビューのボタン） | triggers（記録） |
| --- | --- |
| `@defer (on viewport)` | `on viewport` |
| `@defer (on viewport(b))` | `on viewport`（引き金があるのに無い形と同じ） |
| `@defer (on viewport({trigger: b, rootMargin: '10px'}))` | `on viewport(<target>, {"rootMargin":"10px"})` |
| `@defer (on viewport({rootMargin: '10px'}))` | `on viewport({"rootMargin":"10px"})` |
| `@defer (on hover)` / `(on hover(b))` | `on hover` / `on hover(<target>)` |
| `@defer (on interaction(b); prefetch on viewport(b); prefetch on hover(b))` | `on interaction(<target>)`・`prefetch on hover(<target>)`・`prefetch on viewport` |
| `@if` の中の `@defer (on viewport(b); on interaction(b); on hover(b))` | 3 つとも `(<target>)` 付き（親のビュー、`walkUpTimes` が 1） |

同じビューの `on viewport(b)` だけが、引き金の無い `on viewport` と区別できません。options があると `null` が来るので（1 節）、3 行目は `<target>` が付きます。viewport の名前の作り方は ad2376435b4（2025-09-29、feat(core): support IntersectionObserver options in viewport triggers (#64130)）で今の形になり、その前は hover と同じ `walkUpTimes === -1 ? '' : '(<target>)'` でした。options を足すときに条件が変わり、`undefined` の場合が外れています。新しい本家（origin/main の d201dd76ef2）でも L775・L823 は同じです。

## 3. prefetch の説明文

📄 `angular/packages/core/src/defer/instructions.ts` L514–521 （▶ の行: 518–519）

```ts
514 │   scheduleDelayedTrigger(onTimer(delay));
515 │ }
516 │ 
517 │ /**
518 ▶  * Creates runtime data structures for the `prefetch on timer` deferred trigger.
519 ▶  * @param delay Amount of time to wait before prefetching the content.
520 │  * @codeGenApi
521 │  */
```

📄 `angular/packages/core/src/defer/triggering.ts` L98–105 （▶ の行: 102, 104）

```ts
 98 │   storeTriggerCleanupFn(TriggerType.Regular, lDetails, cleanupFn);
 99 │ }
100 │ 
101 │ /**
102 ▶  * Schedules prefetching for `on idle` and `on timer` triggers.
103 │  *
104 ▶  * @param scheduleFn A function that does the scheduling.
105 │  */
```

518〜519 行目「`prefetch on timer` の実行時のデータを作る。`delay` は先読みまで待つ時間」、102 行目「`on idle` と `on timer` の prefetch を予約する」のとおり、時間で決まる prefetch は `scheduleDelayedPrefetching` を通ります（L109 のとおりサーバーでは何もしない）。

📄 `angular/packages/core/src/defer/instructions.ts` L594–602 （▶ の行: 598–600）

```ts
594 │   }
595 │ }
596 │ 
597 │ /**
598 ▶  * Creates runtime data structures for the `prefetch on hover` deferred trigger.
599 ▶  * @param triggerIndex Index at which to find the trigger element.
600 ▶  * @param walkUpTimes Number of times to walk up/down the tree hierarchy to find the trigger.
601 │  * @codeGenApi
602 │  */
```

📄 `angular/packages/core/src/defer/triggering.ts` L160–168 （▶ の行: 160, 164）

```ts
160 ▶   triggerResourceLoading(tDetails, lView, tNode);
161 │ }
162 │ 
163 │ /**
164 ▶  * Trigger loading of defer block dependencies if the process hasn't started yet.
165 │  *
166 │  * @param tDetails Static information about this defer block.
167 │  * @param lView LView of a host view.
168 │  */
```

DOM の prefetch（hover・interaction・viewport）は、2 節の 712〜717 行目のとおり、依存の読み込みがまだ始まっていない（`NOT_STARTED`）ときだけ引き金に登録し、引き金で 164 行目「まだ始まっていなければ依存を読み込む」を呼びます。DEMO の G（`on interaction; prefetch on hover`）では、マウスを載せると `loadingState` が `NOT_STARTED` → `COMPLETE` に進み、そのあとクリックすると `@loading` を通らずに本体が出ます（[prefetch の章](../defer/13-defer-prefetch.md)）。

## 4. DEMO：ページの上の本物の @defer の移り変わり

> **🧪 DEMO — 6 個の @defer の状態を時刻つきで記録する（ライブ）と、10 個の記録**
>
> 「描く」を押すと、この章のテンプレートの `@if` が true になり、下の 6 個の本物の `@defer` が作られます。本体の `crh-defer-box` は `@defer` の中でだけ使っているので別の chunk です（crh-defer.demo-box.ts）。`@placeholder` と `@loading` と本体の部品は、作られたときの時刻（描き始めからのミリ秒）を記録します。H・I・J の `when` は、描き始めから 200 ms 後に章の signal を true にします。同時に 25 ms ごとに 5 秒間、`ɵgetDeferBlocks` で各ブロックの `DEFER_BLOCK_STATE`（LDeferBlockDetails の 1 番）と `tDetails.loadingState` を**読むだけ**で、変わったときに表に足します（[minimum と after の章](../defer/05-defer-minimum-after.md)と同じ読み方）。外への通信はありません。C は placeholder をクリック、D と G は placeholder にマウスを載せてください（G はそのあとクリック）。  
> `on idle`・`on viewport`（引き金を書かない形）・`on timer`・`on immediate` は、このサイトのほかの章の本物のテンプレートで使っておらず、置くと初めに読む JS（Initial total）が 486.46 kB から 486.73 kB に増えました（6 個だけなら 486.46 kB のまま）。この 4 つを含む 10 個を置いた形を本番ビルドにして headless Chrome で操作した記録は、「10 個の記録」で出します。
>
> 10 個の記録（2026-11-22、本番ビルド、headless Chrome）では、描いて 2 ms で 10 個の `@placeholder` が作られ、`on immediate`（F）と `on idle`（A）の本体が 7〜8 ms、`on timer(800ms)`（E）が 803 ms、枠をスクロールした `on viewport`（B）が 909 ms で出ました。`on timer(200ms)` の 3 つは 226 ms で読み込みを終え、H は `@placeholder (minimum 1s)` のため本体が 1003 ms、I は 203 ms に `@loading` が出て minimum 700ms の 903 ms に本体、J は読み込みが after 300ms より早く終わったので `@loading` を作らず 204 ms に本体でした。G は 400 ms の mouseover で `loadingState` だけが COMPLETE（状態は Placeholder のまま）になり、1711 ms のクリックで `@loading` を通らずに本体が出ました。`loadingState` はブロックごとで、同じ chunk でもブロックごとに NOT\_STARTED から進みます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crh-defer)

## 5. hydrate のトリガーの説明文

📄 `angular/packages/core/src/defer/instructions.ts` L532–539 （▶ の行: 536–538）

```ts
532 │   scheduleDelayedPrefetching(onTimer(delay));
533 │ }
534 │ 
535 │ /**
536 ▶  * Creates runtime data structures for the `on timer` hydrate trigger.
537 ▶  * @param delay Amount of time to wait before loading the content.
538 ▶  * @codeGenApi
539 │  */
```

536〜537 行目の `ɵɵdeferHydrateOnTimer` の説明は「`on timer` の hydrate のトリガー。`delay` は内容を読み込むまで待つ時間」で、`on timer`（L500〜503）と同じ文です。hydrate の場合、内容はサーバーが描いて HTML にあり、待つのはハイドレーション（依存を読み込み、DOM を引き取る）までの時間です。サーバーでは L553〜555 ですぐ本体を描き、ブラウザーでは L557 で予約します。

📄 `angular/packages/core/src/defer/instructions.ts` L730–741 （▶ の行: 731, 734, 738–740）

```ts
730 │ /**
731 ▶  * Creates runtime data structures for the `on interaction` hydrate trigger.
732 │  * @codeGenApi
733 │  */
734 ▶ export function ɵɵdeferHydrateOnInteraction() {
735 │   const lView = getLView();
736 │   const tNode = getCurrentTNode()!;
737 │ 
738 ▶   if (ngDevMode) {
739 ▶     trackTriggerForDebugging(lView[TVIEW], tNode, 'hydrate on interaction');
740 ▶   }
741 │ 
```

731 行目の命令の本体（738〜740 行目と、その先の L742〜753）は、hydrate のトリガーを `tDetails.hydrateTriggers` に入れ、サーバーなら本体を描くだけです。L751〜752「実際の interaction のハイドレーションは event\_replay.ts の JSAction が受け持つ」のとおり、ブラウザーでは何も登録しません（要素の `jsaction` と `ngb`、[hydrate on interaction のイベントの章](../defer/18-defer-hydrate-events.md)）。

📄 `angular/packages/core/src/defer/triggering.ts` L363–373 （▶ の行: 365–367, 369–372）

```ts
363 │ 
364 │ /**
365 ▶  * The core mechanism for incremental hydration. This triggers or
366 ▶  * queues hydration for all the blocks in the tree that need to be hydrated
367 ▶  * and keeps track of all those blocks that were hydrated along the way.
368 │  *
369 ▶  * Note: the `replayQueuedEventsFn` is only provided when hydration is invoked
370 ▶  * as a result of an event replay (via JsAction). When hydration is invoked from
371 ▶  * an instruction set (e.g. `deferOnImmediate`) - there is no need to replay any
372 ▶  * events.
373 │  */
```

365〜367 行目「インクリメンタルハイドレーションの中心。木の中のハイドレートすべきブロックを全部ハイドレート（か予約）する」、369〜372 行目「`replayQueuedEventsFn` はイベントの再生（JsAction）から呼ばれたときだけ渡す。命令（`deferOnImmediate` など）から呼ぶときは要らない」。呼ぶのは event\_replay.ts の L297（イベントの再生）と、instructions.ts の L333（`hydrate when`）・L496（`hydrate on immediate`）、triggering.ts の L146（timer の予約）と L705・L717・L729・L740（次の節）です。L382〜385 で、同じブロックを 2 度ハイドレートしないように止めます。

## 6. ハイドレーションのあとに付けるトリガー：根が要素のブロックだけ

📄 `angular/packages/core/src/hydration/interfaces.ts` L283–306 （▶ の行: 285, 287, 289–293, 298, 300–304）

```ts
283 │ 
284 │ /**
285 ▶  * Summarizes the presence of specific types of triggers anywhere in the DOM
286 │  */
287 ▶ export interface BlockSummary {
288 │   data: SerializedDeferBlock;
289 ▶   hydrate: {
290 ▶     idle: boolean;
291 ▶     immediate: boolean;
292 ▶     viewport: true | IntersectionObserverInit | null;
293 ▶     timer: number | null;
294 │   };
295 │ }
296 │ 
297 │ /**
298 ▶  * The details of a specific element's trigger and how it is associated to a block
299 │  */
300 ▶ export interface ElementTrigger {
301 ▶   el: HTMLElement;
302 ▶   blockName: string;
303 ▶   delay?: number;
304 ▶   intersectionObserverOptions?: IntersectionObserverInit;
305 │ }
306 │ 
```

📄 `angular/packages/core/src/defer/triggering.ts` L650–663 （▶ の行: 651–653, 655, 660–663）

```ts
650 │ 
651 ▶ /**
652 ▶  * Loops through all defer block summaries and ensures all the blocks triggers are
653 ▶  * properly initialized
654 │  */
655 ▶ export function processAndInitTriggers(
656 │   injector: Injector,
657 │   blockData: Map<string, BlockSummary>,
658 │   nodes: Map<string, Comment>,
659 │ ) {
660 ▶   const idleElements: ElementTrigger[] = [];
661 ▶   const timerElements: ElementTrigger[] = [];
662 ▶   const viewportElements: ElementTrigger[] = [];
663 ▶   const immediateElements: ElementTrigger[] = [];
```

ハイドレートされていないブロックの中の `@defer` は、命令がまだ動いていないので、トリガーの命令（5 節）では仕掛けられません（L884〜885 のコメント）。そこでアプリの起動のときに、`__nghDeferData__` から 285 行目「どの種類のトリガーがあるかの要約」（`BlockSummary`）を作り、`processAndInitTriggers` が DOM の要素に 298 行目の `ElementTrigger` を作って、idle・immediate・viewport・timer を仕掛けます（L696〜699）。651〜653 行目の約束は「すべてのブロックの要約を回し、すべてのブロックのトリガーが正しく初期化されるようにする」です。

ところが本体の L669〜673 は、ブロックの印のコメント（`<!--ngh=d1-->`）の前の根のノードを `NUM_ROOT_NODES` 個たどり、要素でなければ `continue` で飛ばします。`ElementTrigger` は要素ごとに 1 つ作るので（L674）、根がテキストだけのブロックには 1 つも作られず、timer も idle も immediate も仕掛けられません。7 節のあとの DEMO の「入れ子の hydrate on timer」の記録では、`@defer (hydrate on interaction)` の中に `@defer (hydrate on timer(50ms))` を置き、中の根を `<span>` にした組と、テキストだけ（`テキストだけ {{ 1 }}`）にした組を並べました。`__nghDeferData__` はどちらも `"t":[{"trigger":5,"delay":50}],"p":"d0"`（と `"p":"d2"`）で同じなのに、ブラウザーで 400 ms 待つと、前の組は親ごとハイドレートされ（親の中の部品と子の部品が作られ、`ngb` と `jsaction` が消えた）、後ろの組は親の `<crh-p jsaction="click:;keydown:;" ngb="d2">` が残ったままでした。いちばん外の `@defer` なら、ブロックの命令がブラウザーでも動いて L557 で timer を予約するので、根がテキストでも動きます。影響が出るのは、ハイドレートされていない親の中の、根がテキストだけのブロックです。この関数は f3d93162752（2024-11-12、refactor(core): moves incremental hydration codebase to better locations (#58616)）で今の場所に移りました。新しい本家でも L690 は同じで、spec の `nested timer`（incremental\_hydration\_spec.ts の 1850 行目）の中のブロックは根が `<article>` です。

📄 `angular/packages/core/src/hydration/utils.ts` L678–701 （▶ の行: 693–694, 697–699）

```ts
678 │ 
679 │ /**
680 │  * Sets the implementation for the `retrieveDeferBlockData` function.
681 │  */
682 │ export function enableRetrieveDeferBlockDataImpl() {
683 │   _retrieveDeferBlockDataImpl = retrieveDeferBlockDataImpl;
684 │ }
685 │ 
686 │ /**
687 │  * Retrieves defer block data from TransferState storage
688 │  */
689 │ export function retrieveDeferBlockData(injector: Injector): {[key: string]: SerializedDeferBlock} {
690 │   return _retrieveDeferBlockDataImpl(injector);
691 │ }
692 │ 
693 ▶ function isTimerTrigger(triggerInfo: DeferBlockTrigger | SerializedTriggerDetails): boolean {
694 ▶   return typeof triggerInfo === 'object' && triggerInfo.trigger === DeferBlockTrigger.Timer;
695 │ }
696 │ 
697 ▶ function getHydrateTimerTrigger(blockData: SerializedDeferBlock): number | null {
698 ▶   const trigger = blockData[DEFER_HYDRATE_TRIGGERS]?.find((t) => isTimerTrigger(t));
699 ▶   return (trigger as SerializedTriggerDetails)?.delay ?? null;
700 │ }
701 │ 
```

要約の値は、`__nghDeferData__` の `t`（[第 1 回の 4 節](01-crh-hydration-api.md)）から作ります。timer は 697〜699 行目で object の `delay` を、idle と immediate は L718〜720 で数の有無を見ます。

📄 `angular/packages/core/src/hydration/node_lookup_utils.ts` L432–468 （▶ の行: 434, 440, 445, 448–449, 451–453, 457, 464）

```ts
432 │ 
433 │ /**
434 ▶  * Retrieves all comments nodes that contain ngh comments referring to a defer block
435 │  */
436 │ export function gatherDeferBlocksCommentNodes(
437 │   doc: Document,
438 │   node: HTMLElement,
439 │ ): Map<string, Comment> {
440 ▶   const commentNodesIterator = doc.createNodeIterator(node, NodeFilter.SHOW_COMMENT, {acceptNode});
441 │   let currentNode: Comment;
442 │ 
443 │   const nodesByBlockId = new Map<string, Comment>();
444 │   while ((currentNode = commentNodesIterator.nextNode() as Comment)) {
445 ▶     const nghPattern = 'ngh=';
446 │     const content = currentNode?.textContent;
447 │     const nghIdx = content?.indexOf(nghPattern) ?? -1;
448 ▶     if (nghIdx > -1) {
449 ▶       const nghValue = content!.substring(nghIdx + nghPattern.length).trim();
450 │       // Make sure the value has an expected format.
451 ▶       ngDevMode &&
452 ▶         assertEqual(
453 ▶           nghValue.startsWith('d'),
454 │           true,
455 │           'Invalid defer block id found in a comment node.',
456 │         );
457 ▶       nodesByBlockId.set(nghValue, currentNode);
458 │     }
459 │   }
460 │   return nodesByBlockId;
461 │ }
462 │ 
463 │ function acceptNode(node: HTMLElement) {
464 ▶   return node.textContent?.trimStart().startsWith('ngh=')
465 │     ? NodeFilter.FILTER_ACCEPT
466 │     : NodeFilter.FILTER_REJECT;
467 │ }
468 │ 
```

ブロックの印のコメントを集めるのが 434 行目「`@defer` を指す ngh のコメントを全部取る」です。サーバーの annotate.ts L851〜853 がブロックのコンテナの印のコメントの中身を `ngh=d0` に書き換えたもので、464 行目で `ngh=` で始まるコメントだけを受け、449 行目で id を取り出します。451〜456 行目の id の形の確かめは開発モードだけです。

📄 `angular/packages/core/src/hydration/utils.ts` L654–677 （▶ の行: 656, 660–661, 669, 671–672）

```ts
654 │ 
655 │ /**
656 ▶  * Retrieves defer block hydration information from the TransferState.
657 │  *
658 │  * @param injector Injector that this component has access to.
659 │  */
660 ▶ let _retrieveDeferBlockDataImpl: typeof retrieveDeferBlockDataImpl = () => {
661 ▶   return {};
662 │ };
663 │ 
664 │ export function retrieveDeferBlockDataImpl(injector: Injector): {
665 │   [key: string]: SerializedDeferBlock;
666 │ } {
667 │   const transferState = injector.get(TransferState, null, {optional: true});
668 │   if (transferState !== null) {
669 ▶     const nghDeferData = transferState.get(NGH_DEFER_BLOCKS_KEY, {});
670 │ 
671 ▶     ngDevMode &&
672 ▶       assertDefined(nghDeferData, 'Unable to retrieve defer block info from the TransferState.');
673 │     return nghDeferData;
674 │   }
675 │ 
676 │   return {};
677 │ }
```

📄 `angular/packages/core/src/hydration/incremental_runtime.ts` L23–51 （▶ の行: 24, 26, 29–30, 32, 35–36, 38, 47）

```ts
23 │ /**
24 ▶  * Default no-op factory for `DEHYDRATED_BLOCK_REGISTRY`.
25 │  */
26 ▶ let _dehydratedBlockRegistryFactory: () => DehydratedBlockRegistry | null = () => null;
27 │ 
28 │ /**
29 ▶  * Default no-op bootstrap impl for incremental hydration. Replaced by the
30 ▶  * real implementation when `ɵɵenableIncrementalHydrationRuntime` is called.
31 │  */
32 ▶ let _runIncrementalHydrationBootstrap: (injector: Injector, doc: Document) => void = () => {};
33 │ 
34 │ /**
35 ▶  * Whether the incremental-hydration runtime has been activated.
36 ▶  * Used to make `ɵɵenableIncrementalHydrationRuntime` idempotent.
37 │  */
38 ▶ let isIncrementalHydrationRuntimeActive = false;
39 │ 
40 │ interface IncrementalHydrationBootstrapState {
41 │   requested: boolean;
42 │   activated: boolean;
43 │   injector: Injector;
44 │   document: Document;
45 │ }
46 │ 
47 ▶ export const INCREMENTAL_HYDRATION_BOOTSTRAP =
48 │   new InjectionToken<IncrementalHydrationBootstrapState>(
49 │     typeof ngDevMode === 'undefined' || ngDevMode ? 'INCREMENTAL_HYDRATION_BOOTSTRAP' : '',
50 │   );
51 │ 
```

`__nghDeferData__` を読む関数（660〜662 行目）も、起動のときの処理（29〜32 行目）も、既定は何もしない関数です。24〜26 行目の `DEHYDRATED_BLOCK_REGISTRY` の factory も `null` を返します。29〜30 行目のとおり、本物に差し替えるのはコンパイラが hydrate のトリガーのあるテンプレートに出す `ɵɵenableIncrementalHydrationRuntime` で、35〜38 行目の旗で 1 度だけです（[インクリメンタルハイドレーションの章の 2 節](../platform/15-incremental-hydration.md)）。hydrate のトリガーを 1 つも書かないアプリには、このコードが入りません。

📄 `angular/packages/core/src/defer/registry.ts` L111–118 （▶ の行: 111, 114–115）

```ts
111 ▶   /** @nocollapse */
112 │   static ɵprov = /** @pureOrBreakMyCode */ /* @__PURE__ */ ɵɵdefineInjectable({
113 │     token: DehydratedBlockRegistry,
114 ▶     providedIn: null,
115 ▶     factory: () => new DehydratedBlockRegistry(),
116 │   });
117 │ }
118 │ 
```

`DehydratedBlockRegistry` は `providedIn: null`（114 行目）で、どの注入器にも自動では入りません。api.ts の L351〜352 が `DEHYDRATED_BLOCK_REGISTRY` を 24〜26 行目の factory で入れるだけです。

## 7. 警告の説明文と、注入器の説明文

📄 `angular/packages/core/src/hydration/utils.ts` L413–441 （▶ の行: 414–415, 419–424, 435–437）

```ts
413 │ 
414 ▶ let incrementalHydrationEnabledWarned = false;
415 ▶ export function resetIncrementalHydrationEnabledWarnedForTests() {
416 │   incrementalHydrationEnabledWarned = false;
417 │ }
418 │ 
419 ▶ /** Throws an error if the incremental hydration is not enabled */
420 ▶ export function warnIncrementalHydrationNotConfigured(): void {
421 ▶   if (!incrementalHydrationEnabledWarned) {
422 ▶     incrementalHydrationEnabledWarned = true;
423 ▶     console.warn(
424 ▶       formatRuntimeError(
425 │         RuntimeErrorCode.MISCONFIGURED_INCREMENTAL_HYDRATION,
426 │         'Angular has detected that some `@defer` blocks use `hydrate` triggers, ' +
427 │           'but incremental hydration was not enabled. Incremental hydration is enabled by default ' +
428 │           'with `provideClientHydration()`. Make sure `provideClientHydration()` is included in ' +
429 │           'your application config and that you have not opted out using `withNoIncrementalHydration()`.',
430 │       ),
431 │     );
432 │   }
433 │ }
434 │ 
435 ▶ /** Throws an error if the ssrUniqueId on the LDeferBlockDetails is not present  */
436 ▶ export function assertSsrIdDefined(ssrUniqueId: unknown) {
437 ▶   assertDefined(
438 │     ssrUniqueId,
439 │     'Internal error: expecting an SSR id for a defer block that should be hydrated, but the id is not present',
440 │   );
441 │ }
```

419 行目は「インクリメンタルハイドレーションが有効でなければ例外を投げる」と書きますが、423 行目は `console.warn` です。7 節のあとの DEMO の「トリガーの名前」の記録（`provideClientHydration` なしで描いた）でも、サーバーの console に NG0508「Angular has detected that some `@defer` blocks use `hydrate` triggers, but incremental hydration was not enabled. …」が警告として出て、描画は続きました。414 行目のモジュールの変数のため、プロセスで 1 回だけです（415 行目はテストで戻すため）。呼ぶのは instructions.ts の L151〜153 で、開発モードの、ブロックの TView の最初の作成（`firstCreatePass`）のときだけです。この関数と説明は 89db5f734d2（2024-10-29、refactor(core): tree-shake defer block registry (#58424)）からで、新しい本家（L420）でも同じです。435 行目の `assertSsrIdDefined` の「例外を投げる」は `assertDefined` のとおり投げます（呼ぶ側が `ngDevMode &&`）。

📄 `angular/packages/core/src/hydration/utils.ts` L592–599 （▶ の行: 594–598）

```ts
592 │ 
593 │ /**
594 ▶  * Builds a queue of blocks that need to be hydrated, looking up the
595 ▶  * tree to the topmost defer block that exists in the tree that hasn't
596 ▶  * been hydrated, but exists in the registry. This queue is in top down
597 ▶  * hierarchical order as a list of defer block ids.
598 ▶  * Note: This is utilizing serialized information to navigate up the tree
599 │  */
```

594〜598 行目「ハイドレートすべきブロックの列を作る。木を上へ、まだハイドレートしていないがレジストリにある一番上のブロックまでたどる。列は上から下の順。`__nghDeferData__` の `p` で上へたどる」の中身は[ハイドレーションの列の章](../defer/17-defer-hydration-queue.md)です。6 節の記録で、子の timer で親ごとハイドレートされたのがこれです。

📄 `angular/packages/core/src/defer/rendering.ts` L97–104 （▶ の行: 101–103）

```ts
 97 │ 
 98 │ /** Injector Helpers */
 99 │ 
100 │ /**
101 ▶  * Creates a new injector, which contains providers collected from dependencies (NgModules) of
102 ▶  * defer-loaded components. This function detects different types of parent injectors and creates
103 ▶  * a new injector based on that.
104 │  */
```

101〜103 行目「`@defer` で読み込んだコンポーネントの依存（NgModule）が持つ provider を入れた注入器を作る。親の注入器の種類に合わせて作る」の中身は[@defer の中の DI の章](../defer/14-defer-nested-di.md)です。

📄 `angular/packages/core/src/defer/dom_triggers.ts` L111–122 （▶ の行: 113, 117, 119–121）

```ts
111 │ 
112 │ /**
113 ▶  * Registers a DOM-node based trigger.
114 │  * @param initialLView LView in which the defer block is rendered.
115 │  * @param tNode TNode representing the defer block.
116 │  * @param triggerIndex Index at which to find the trigger element.
117 ▶  * @param walkUpTimes Number of times to go up/down in the view hierarchy to find the trigger.
118 │  * @param registerFn Function that will register the DOM events.
119 ▶  * @param callback Callback to be invoked when the trigger receives the event that should render
120 ▶  *     the deferred block.
121 ▶  * @param type Trigger type to distinguish between regular and prefetch triggers.
122 │  */
```

117 行目の `walkUpTimes` の説明は 1 節の命令と同じ「上（下）に何回」で、121 行目の `type` は通常と prefetch を分けます（後片付けの関数を別々に覚えるため、[DOM のトリガーの章](../defer/11-defer-dom-triggers.md)）。

> **🧪 DEMO — hydrate のトリガーとトリガーの名前（記録の再生）**
>
> 手元の記録のスクリプトが、Node の上で platform-server 22.2.6 の `renderApplication` で描き（開発モード、JIT）、別のプロセスでその HTML を domino の文書に読み込んでハイドレートし、待ってから記録したものです（crh-defer.data.ts）。部品は作られたときに `console.log` で時刻を書きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crh-defer)

「5 つの hydrate のトリガー」では、`hydrate on immediate` と `hydrate on idle` の部品が統計の行より先に、`hydrate on timer(50ms)` が約 50 ms 後に作られ、`hydrate never` と `hydrate on interaction` はそのまま残りました（interaction の要素には `jsaction` と `ngb="d4"`）。`prefetch on idle` は `__nghDeferData__` に何も残しません（[第 1 回の 4 節](01-crh-hydration-api.md)）。

## ここまでの呼び出し（ブラウザー、ハイドレートしていない親の中の hydrate on timer）

- `APP_BOOTSTRAP_LISTENER` → `runIncrementalHydrationBootstrap` — api.ts L368〜379、incremental\_runtime.ts
  - `processBlockData(injector)` — utils.ts L741〜748 — *\_\_nghDeferData\_\_ → BlockSummary（6 節）*
  - `gatherDeferBlocksCommentNodes(doc, body)` — node\_lookup\_utils.ts L436〜461 — *&lt;!--ngh=d1--&gt; を集める*
  - `processAndInitTriggers(injector, blockData, nodes)` — triggering.ts L655〜700 — *根の要素ごとに ElementTrigger。テキストだけなら 0 個*
    - `setTimerTriggers` → `onTimer(delay)` — L726〜734
      - `triggerHydrationFromBlockName(injector, 'd1')` — L374〜427 — *5 節*
        - `getParentBlockHydrationQueue` — utils.ts L600〜631 — *\['d0', 'd1'\]（7 節）*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `core/test/acceptance/defer_spec.ts` | `@defer`（253）› `prefetch`（1735）・`interaction triggers`（3138）・`hover triggers`（3504）・`` `on timer` triggers ``（3823）・`viewport triggers`（4085）・`minimum and after conditions`（894） | 3・4 節のトリガーと prefetch、minimum と after |
| `platform-server/test/incremental_hydration_spec.ts` | `triggers`（817）› `timer`（1779）› `top level timer`（1789）・`nested timer`（1850） | 6 節。入れ子の中の根はどちらも要素 |
| `platform-server/test/incremental_hydration_spec.ts` | `misconfiguration`（3158）の 2 つ | 7 節の NG0508 の警告 |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \\
    "--test_arg=--filter=@defer"
$ pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all \\
    "--test_arg=--filter=core functionality triggers"
```

手元の bazel（2026-11-22）で、acceptance の「@defer」が 104 specs（全体 2693）、platform-server の「core functionality triggers」が 17 specs、「nested timer」と「should only count and log blocks」が 1 spec ずつで、どれも 0 failures でした。トリガーの名前（ng.ɵgetControlFlowBlocks の triggers）を見る it と、根がテキストだけの入れ子の hydrate のブロックの it は、defer\_spec.ts と incremental\_hydration\_spec.ts を grep した限りありません。

直すとしたら、トリガーの名前は instructions.ts の `ɵɵdeferOnViewport`・`ɵɵdeferPrefetchOnViewport` の L771・L819 を `walkUpTimes !== -1`（`undefined` と `null` も「引き金あり」）にし、引き金の無い `on viewport` は -1 で来るので区別できます。spec は defer\_spec.ts の `viewport triggers` に、`ng.ɵgetControlFlowBlocks` の `triggers` を見る it を足します。テキストだけのブロックは、triggering.ts の `processAndInitTriggers` で、idle・immediate・timer のように要素の要らないトリガーを根のノードのループの外で 1 回だけ作り、viewport だけを要素ごとにします。spec は incremental\_hydration\_spec.ts の `nested timer` の隣に、中のブロックの根をテキストにした it を足します。utils.ts の 419 行目は「警告を出す」に、536〜537 行目は「ハイドレートするまで待つ時間」にします。

## 聞かれそうな質問

**Q. DevTools の `@defer` のトリガーに `on viewport` と出ています。引き金の要素を指定していないということですか？**

そうとは限りません。同じビューの `#ref` を `on viewport(ref)` で指定しても、名前は `on viewport` です（819 行目の条件、2 節の記録）。hover と interaction は `(<target>)` が付きます（708 行目）。

**Q. prefetch は何回読み込みますか？**

ブロックごとに 1 回です。DOM の prefetch は `NOT_STARTED` のときだけ引き金を登録し（712〜717 行目）、読み込みの関数も始まっていなければだけ動きます（164 行目）。

**Q. `hydrate on interaction` の命令はブラウザーで何を登録しますか？**

何も登録しません。トリガーを `hydrateTriggers` に入れるだけで、クリックは JSAction（`jsaction` と `ngb`）で受けます（L751〜752）。

**Q. 入れ子の `@defer (hydrate on timer(…))` が、いつまでもハイドレートされないのはなぜですか？**

そのブロックの根がテキストだけだと、`processAndInitTriggers` がトリガーを仕掛けないからです（L669〜673、6 節の記録）。根を要素で包むと動きます。

**Q. NG0508 は例外ですか？**

いいえ、開発モードで 1 回だけの `console.warn` です（423 行目）。419 行目の説明は「投げる」と書いています。

## 読み終えて

- `walkUpTimes` は -1（placeholder の中）・省略か `null`（同じビュー）・正の数（親のビュー）。説明文は「上（下）に何回」だけで、詳しいのは dom\_triggers.ts の 62〜64 行目。
- 開発モードのトリガーの名前は、viewport だけ同じビューの引き金で `<target>` が抜ける（#64130 から）。
- prefetch はブロックごとに 1 回。prefetch のあとのトリガーでは `@loading` を通らない。
- ハイドレートしていない親の中のブロックの idle・immediate・viewport・timer は、根の要素に仕掛ける。根がテキストだけだと仕掛けられない。
- インクリメンタルのコードは `ɵɵenableIncrementalHydrationRuntime` が呼ばれるまで何もしない関数のまま。

---

← 前: [ノードの探し方と不一致のエラーの説明文](03-crh-hydration-errors.md)  
次: [resource() の説明文：状態・params・reload・stream](05-crh-resource.md) →
