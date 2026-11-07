[目次](../README.md) › [アニメーションの内側](README.md) › 第 16 回 / 全 20 回

# TransitionAnimationEngine：トリガーの値が変わってからプレイヤーが動くまで

> trigger() が値の変化を待ち行列に積み、removeNode が leave アニメーションの終わりまで要素を DOM に残し、flush がまとめて遷移を解いて query の要素を集め、WebAnimationsDriver が作った WebAnimationsPlayer が play のときに element.animate() を呼ぶまで。done のコールバックが呼ばれる順番と、プレイヤーを止めるとき（destroy でも done は呼ばれる）。

angular/angular · 読了 約 15 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/animations-legacy-engine)

---

[第 14 回](14-animations-legacy-setup.md)で、`[@open]` の値が変わると `TransitionAnimationEngine.trigger` が呼ばれ、変更検知の終わりに `flush` されることを見ました。この章はその中身です。`trigger` が値の変化を待ち行列に積み、`removeNode` が消える要素を DOM に残したまま印を付け、`flush` がまとめて遷移を解いてプレイヤーを作り、`WebAnimationsDriver` が `element.animate()` を呼び、終わったら要素を消して done のコールバックを呼ぶまでを、1 本の流れで追います。

読む対象は `packages/animations/browser/src/render/transition_animation_engine.ts`（1943 行）、`render/shared.ts`、`render/web_animations/web_animations_driver.ts`・`web_animations_player.ts`、`packages/animations/src/players/animation_player.ts` です。`flush` の中の `_flushAnimations` は 430 行あるので、全部は読まず、要素を集める → 遷移を解く → プレイヤーを作る → 消す、の 4 か所だけを読みます。

1. [1. 全体像](01-animations-overview.md)
2. [2. テンプレートから命令へ](02-animations-compile.md)
3. [3. 命令がすること](03-animations-instructions.md)
4. [4. 待ち行列](04-animations-queue.md)
5. [5. enter のクラス](05-animations-enter-classes.md)
6. [6. いちばん長いアニメーション](06-animations-longest.md)
7. [7. 関数で動かす](07-animations-functions.md)
8. [8. 動かないとき](08-animations-disabled.md)
9. [9. 消すのを遅らせる](09-animations-leave-removal.md)
10. [10. leave のクラス](10-animations-leave-classes.md)
11. [11. 入れ子の leave](11-animations-leave-nested.md)
12. [12. 並べ替えと出し直し](12-animations-leave-reorder.md)
13. [13. スタイルの後片付け](13-animations-styles-teardown.md)
14. [14. 旧パッケージの入口](14-animations-legacy-setup.md)
15. [15. 旧 DSL とキーフレーム](15-animations-legacy-dsl.md)
16. **16. TransitionAnimationEngine**（この章）
17. [17. 2 つが同居するとき](17-animations-legacy-compat.md)
18. [18. 移行](18-animations-migration.md)
19. [19. テスト](19-animations-testing.md)
20. [20. issue と変更を読む](20-animations-issues.md)

## 1. エンジンが持っているもの

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L592–613 （▶ の行: 593, 595, 597, 601, 604, 609–610, 613）

```ts
592 │ export class TransitionAnimationEngine {
593 ▶   public players: TransitionAnimationPlayer[] = [];
594 │   public newHostElements = new Map<any, AnimationTransitionNamespace>();
595 ▶   public playersByElement = new Map<any, TransitionAnimationPlayer[]>();
596 │   public playersByQueriedElement = new Map<any, TransitionAnimationPlayer[]>();
597 ▶   public statesByElement = new Map<any, Map<string, StateValue>>();
598 │   public disabledNodes = new Set<any>();
599 │ 
600 │   public totalAnimations = 0;
601 ▶   public totalQueuedPlayers = 0;
602 │ 
603 │   private _namespaceLookup: {[id: string]: AnimationTransitionNamespace} = {};
604 ▶   private _namespaceList: AnimationTransitionNamespace[] = [];
605 │   private _flushFns: (() => any)[] = [];
606 │   private _whenQuietFns: (() => any)[] = [];
607 │ 
608 │   public namespacesByHostElement = new Map<any, AnimationTransitionNamespace>();
609 ▶   public collectedEnterElements: any[] = [];
610 ▶   public collectedLeaveElements: any[] = [];
611 │ 
612 │   // this method is designed to be overridden by the code that uses this engine
613 ▶   public onRemovalComplete = (element: any, context: any) => {};
```

597 行目の `statesByElement` が「要素ごと・トリガーごとの今の値」、595 行目の `playersByElement` が要素ごとのプレイヤー、604 行目の `_namespaceList` がコンポーネントのインスタンスごとの名前空間（第 14 回の `register`）です。609〜610 行目の 2 つの配列に、この flush で入った要素と消える要素が溜まり、601 行目の `totalQueuedPlayers` が積まれた遷移の数です。613 行目の `onRemovalComplete` は、第 14 回の `AnimationRendererFactory` が「DOM レンダラーの `removeChild` を呼ぶ」に置き換えています。

## 2. trigger：値の変化を待ち行列に積む

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L749–758 （▶ の行: 750–751, 753）

```ts
749 │   trigger(namespaceId: string, element: any, name: string, value: any): boolean {
750 ▶     if (isElementNode(element)) {
751 ▶       const ns = this._fetchNamespace(namespaceId);
752 │       if (ns) {
753 ▶         ns.trigger(element, name, value);
754 │         return true;
755 │       }
756 │     }
757 │     return false;
758 │   }
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L228–260 （▶ の行: 235, 237, 239–240, 247–248, 254, 256–257, 260）

```ts
228 │   trigger(
229 │     element: any,
230 │     triggerName: string,
231 │     value: any,
232 │     defaultToFallback: boolean = true,
233 │   ): TransitionAnimationPlayer | undefined {
234 │     const trigger = this._getTrigger(triggerName);
235 ▶     const player = new TransitionAnimationPlayer(this.id, triggerName, element);
236 │ 
237 ▶     let triggersWithStates = this._engine.statesByElement.get(element);
238 │     if (!triggersWithStates) {
239 ▶       addClass(element, NG_TRIGGER_CLASSNAME);
240 ▶       addClass(element, NG_TRIGGER_CLASSNAME + '-' + triggerName);
241 │       this._engine.statesByElement.set(
242 │         element,
243 │         (triggersWithStates = new Map<string, StateValue>()),
244 │       );
245 │     }
246 │ 
247 ▶     let fromState = triggersWithStates.get(triggerName);
248 ▶     const toState = new StateValue(value, this.id);
249 │     const isObj = value && Object.hasOwn(value, 'value');
250 │     if (!isObj && fromState) {
251 │       toState.absorbOptions(fromState.options);
252 │     }
253 │ 
254 ▶     triggersWithStates.set(triggerName, toState);
255 │ 
256 ▶     if (!fromState) {
257 ▶       fromState = DEFAULT_STATE_VALUE;
258 │     }
259 │ 
260 ▶     const isRemoval = toState.value === VOID_VALUE;
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L292–325 （▶ の行: 297–298, 302, 309, 311–312, 316）

```ts
292 │     playersOnElement.forEach((player) => {
293 │       // only remove the player if it is queued on the EXACT same trigger/namespace
294 │       // we only also deal with queued players here because if the animation has
295 │       // started then we want to keep the player alive until the flush happens
296 │       // (which is where the previousPlayers are passed into the new player)
297 ▶       if (player.namespaceId == this.id && player.triggerName == triggerName && player.queued) {
298 ▶         player.destroy();
299 │       }
300 │     });
301 │ 
302 ▶     let transition = trigger.matchTransition(
303 │       fromState.value,
304 │       toState.value,
305 │       element,
306 │       toState.params,
307 │     );
308 │     let isFallbackTransition = false;
309 ▶     if (!transition) {
310 │       if (!defaultToFallback) return;
311 ▶       transition = trigger.fallbackTransition;
312 ▶       isFallbackTransition = true;
313 │     }
314 │ 
315 │     this._engine.totalQueuedPlayers++;
316 ▶     this._queue.push({
317 │       element,
318 │       triggerName,
319 │       transition,
320 │       fromState,
321 │       toState,
322 │       player,
323 │       isFallbackTransition,
324 │     });
325 │ 
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L326–352 （▶ の行: 327–329, 333, 336, 348, 351）

```ts
326 │     if (!isFallbackTransition) {
327 ▶       addClass(element, QUEUED_CLASSNAME);
328 ▶       player.onStart(() => {
329 ▶         removeClass(element, QUEUED_CLASSNAME);
330 │       });
331 │     }
332 │ 
333 ▶     player.onDone(() => {
334 │       let index = this.players.indexOf(player);
335 │       if (index >= 0) {
336 ▶         this.players.splice(index, 1);
337 │       }
338 │ 
339 │       const players = this._engine.playersByElement.get(element);
340 │       if (players) {
341 │         let index = players.indexOf(player);
342 │         if (index >= 0) {
343 │           players.splice(index, 1);
344 │         }
345 │       }
346 │     });
347 │ 
348 ▶     this.players.push(player);
349 │     playersOnElement.push(player);
350 │ 
351 ▶     return player;
352 │   }
```

1. **751〜753 行目：名前空間を探して渡す**

   要素でなければ（コメントなど）何もしません。
2. **235 行目：プレイヤーの「入れ物」を先に作る**

   `TransitionAnimationPlayer`（7 節）は、本物のプレイヤーが flush で入るまでコールバックを溜めておく箱です。`trigger` はこれを返すので、呼んだ側はすぐ `onDone` などを登録できます。
3. **237〜260 行目：前の値と新しい値**

   初めての要素なら 239〜240 行目で `ng-trigger` と `ng-trigger-open` のクラスを付けます。247 行目で前の値を取り、254 行目で新しい値を覚えます。前の値が無ければ 256〜257 行目で `'void'` です。260 行目、新しい値が `'void'` なら「消える」です。
4. **297〜298 行目：同じトリガーで、まだ積まれたままのプレイヤーは捨てる**

   1 回の変更検知の中で値が 2 回変わっても、flush で動くのは最後の 1 つです。
5. **302 行目：遷移を探す。無ければ fallback**

   [第 15 回](15-animations-legacy-dsl.md)の `matchTransition` です。一致が無ければ 311〜312 行目で「何も動かさない遷移」を使います（状態のスタイルだけを置くため）。
6. **316 行目：待ち行列に積む**

   本物の遷移なら 327 行目で `ng-animate-queued` クラスを付け、329 行目、動き出したら外します。**ここではまだ何も動きません**。

## 3. insertNode / removeNode：DOM の出し入れを覚える

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L760–795 （▶ の行: 765–769, 771, 787, 792–793）

```ts
760 │   insertNode(namespaceId: string, element: any, parent: any, insertBefore: boolean): void {
761 │     if (!isElementNode(element)) return;
762 │ 
763 │     // special case for when an element is removed and reinserted (move operation)
764 │     // when this occurs we do not want to use the element for deletion later
765 ▶     const details = element[REMOVAL_FLAG] as ElementAnimationState;
766 ▶     if (details && details.setForRemoval) {
767 ▶       details.setForRemoval = false;
768 ▶       details.setForMove = true;
769 ▶       const index = this.collectedLeaveElements.indexOf(element);
770 │       if (index >= 0) {
771 ▶         this.collectedLeaveElements.splice(index, 1);
772 │       }
773 │     }
774 │ 
775 │     // in the event that the namespaceId is blank then the caller
776 │     // code does not contain any animation code in it, but it is
777 │     // just being called so that the node is marked as being inserted
778 │     if (namespaceId) {
779 │       const ns = this._fetchNamespace(namespaceId);
780 │       // This if-statement is a workaround for router issue #21947.
781 │       // The router sometimes hits a race condition where while a route
782 │       // is being instantiated a new navigation arrives, triggering leave
783 │       // animation of DOM that has not been fully initialized, until this
784 │       // is resolved, we need to handle the scenario when DOM is not in a
785 │       // consistent state during the animation.
786 │       if (ns) {
787 ▶         ns.insertNode(element, parent);
788 │       }
789 │     }
790 │ 
791 │     // only *directives and host elements are inserted before
792 ▶     if (insertBefore) {
793 ▶       this.collectEnterElement(element);
794 │     }
795 │   }
```

第 14 回の `BaseAnimationRenderer.appendChild` などが、DOM に入れた**あと**でこれを呼びます。792〜793 行目、入った要素を `collectedEnterElements` に溜めます（flush で `:enter` の印にする）。765〜771 行目、「消す」と印を付けた要素がまた入れられたら（`*ngFor` の並べ替えなど）、消す印を「動いた」に変えて、消える要素の配列から外します。

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L813–846 （▶ の行: 815, 817, 819, 822, 824, 838–839, 841–842）

```ts
813 │   removeNode(namespaceId: string, element: any, context: any): void {
814 │     if (isElementNode(element)) {
815 ▶       const ns = namespaceId ? this._fetchNamespace(namespaceId) : null;
816 │       if (ns) {
817 ▶         ns.removeNode(element, context);
818 │       } else {
819 ▶         this.markElementAsRemoved(namespaceId, element, false, context);
820 │       }
821 │ 
822 ▶       const hostNS = this.namespacesByHostElement.get(element);
823 │       if (hostNS && hostNS.id !== namespaceId) {
824 ▶         hostNS.removeNode(element, context);
825 │       }
826 │     } else {
827 │       this._onRemovalComplete(element, context);
828 │     }
829 │   }
830 │ 
831 │   markElementAsRemoved(
832 │     namespaceId: string,
833 │     element: any,
834 │     hasAnimation?: boolean,
835 │     context?: any,
836 │     previousTriggersValues?: Map<string, string>,
837 │   ) {
838 ▶     this.collectedLeaveElements.push(element);
839 ▶     element[REMOVAL_FLAG] = {
840 │       namespaceId,
841 ▶       setForRemoval: context,
842 ▶       hasAnimation,
843 │       removedBeforeQueried: false,
844 │       previousTriggersValues,
845 │     };
846 │   }
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L405–436 （▶ の行: 411, 415, 419–420, 427–430, 432）

```ts
405 │   triggerLeaveAnimation(
406 │     element: any,
407 │     context: any,
408 │     destroyAfterComplete?: boolean,
409 │     defaultToFallback?: boolean,
410 │   ): boolean {
411 ▶     const triggerStates = this._engine.statesByElement.get(element);
412 │     const previousTriggersValues = new Map<string, string>();
413 │     if (triggerStates) {
414 │       const players: TransitionAnimationPlayer[] = [];
415 ▶       triggerStates.forEach((state, triggerName) => {
416 │         previousTriggersValues.set(triggerName, state.value);
417 │         // this check is here in the event that an element is removed
418 │         // twice (both on the host level and the component level)
419 ▶         if (this._triggers.has(triggerName)) {
420 ▶           const player = this.trigger(element, triggerName, VOID_VALUE, defaultToFallback);
421 │           if (player) {
422 │             players.push(player);
423 │           }
424 │         }
425 │       });
426 │ 
427 ▶       if (players.length) {
428 ▶         this._engine.markElementAsRemoved(this.id, element, true, context, previousTriggersValues);
429 ▶         if (destroyAfterComplete) {
430 ▶           optimizeGroupPlayer(players).onDone(() => this._engine.processLeaveNode(element));
431 │         }
432 ▶         return true;
433 │       }
434 │     }
435 │     return false;
436 │   }
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L471–504 （▶ の行: 473–474, 478, 483, 492–493, 496–497, 499）

```ts
471 │   removeNode(element: any, context: any): void {
472 │     const engine = this._engine;
473 ▶     if (element.childElementCount) {
474 ▶       this._signalRemovalForInnerTriggers(element, context);
475 │     }
476 │ 
477 │     // this means that a * => VOID animation was detected and kicked off
478 ▶     if (this.triggerLeaveAnimation(element, context, true)) return;
479 │ 
480 │     // find the player that is animating and make sure that the
481 │     // removal is delayed until that player has completed
482 │     let containsPotentialParentTransition = false;
483 ▶     if (engine.totalAnimations) {
484 │       const currentPlayers = engine.players.length
485 │         ? engine.playersByQueriedElement.get(element)
486 │         : [];
487 │ 
488 │       // when this `if statement` does not continue forward it means that
489 │       // a previous animation query has selected the current element and
490 │       // is animating it. In this situation want to continue forwards and
491 │       // allow the element to be queued up for animation later.
492 ▶       if (currentPlayers && currentPlayers.length) {
493 ▶         containsPotentialParentTransition = true;
494 │       } else {
495 │         let parent = element;
496 ▶         while ((parent = parent.parentNode)) {
497 ▶           const triggers = engine.statesByElement.get(parent);
498 │           if (triggers) {
499 ▶             containsPotentialParentTransition = true;
500 │             break;
501 │           }
502 │         }
503 │       }
504 │     }
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L505–531 （▶ の行: 510, 514–515, 517–518, 521–523）

```ts
505 │ 
506 │     // at this stage we know that the element will either get removed
507 │     // during flush or will be picked up by a parent query. Either way
508 │     // we need to fire the listeners for this element when it DOES get
509 │     // removed (once the query parent animation is done or after flush)
510 ▶     this.prepareLeaveAnimationListeners(element);
511 │ 
512 │     // whether or not a parent has an animation we need to delay the deferral of the leave
513 │     // operation until we have more information (which we do after flush() has been called)
514 ▶     if (containsPotentialParentTransition) {
515 ▶       engine.markElementAsRemoved(this.id, element, false, context);
516 │     } else {
517 ▶       const removalFlag = element[REMOVAL_FLAG];
518 ▶       if (!removalFlag || removalFlag === NULL_REMOVAL_STATE) {
519 │         // we do this after the flush has occurred such
520 │         // that the callbacks can be fired
521 ▶         engine.afterFlush(() => this.clearElementCache(element));
522 ▶         engine.destroyInnerAnimations(element);
523 ▶         engine._onRemovalComplete(element, context);
524 │       }
525 │     }
526 │   }
527 │ 
528 │   insertNode(element: any, parent: any): void {
529 │     addClass(element, this._hostClassName);
530 │   }
531 │ 
```

1. **817 行目：名前空間の `removeNode` へ**

   名前空間が無ければ 819 行目で「消す」印だけを付けます。822〜824 行目、要素自身がコンポーネントのホストで、別の名前空間を持つなら、そちらにも伝えます。
2. **473〜474 行目：子の要素のトリガーにも伝える**

   中の `ng-trigger` クラスの要素ごとに、下の `triggerLeaveAnimation` を呼びます（子のトリガーも `'void'` になる）。
3. **478 行目 → 411〜432 行目：自分のトリガーを全部 `'void'` にする**

   420 行目で、この要素の各トリガーに `trigger(element, name, 'void')` を呼びます（2 節と同じ道で積まれる）。1 つでも積めたら 428 行目で `markElementAsRemoved`、430 行目で「そのプレイヤーが全部終わったら `processLeaveNode`」を登録して帰ります。
4. **838〜845 行目：「消す」印を付ける**

   要素は **DOM に残ったまま**です。838 行目で `collectedLeaveElements` に足し、839 行目で要素自身に `__ng_removed` のプロパティ（消す印。`REMOVAL_FLAG`）を付けます。841 行目の `setForRemoval` に入る `context` は、あとで DOM から外すときに使う DOM レンダラーです。
5. **483〜503 行目：自分にアニメーションが無いとき**

   親の要素がトリガーを持つ（496〜499 行目）か、ほかのアニメーションに `query` されている（492〜493 行目）なら、514〜515 行目で印だけ付けて flush の判断を待ちます。どちらでもなければ 517〜523 行目で、**その場で**`_onRemovalComplete`（= DOM から外す）を呼びます。510 行目、どちらの場合も `(@x.done)` のリスナーには「消えた」を知らせる準備をします。

## 4. flush：要素を集め、遷移を解き、プレイヤーを作り、消す

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L949–986 （▶ の行: 956, 959, 963, 965, 969, 971–972, 976, 978, 982, 985）

```ts
949 │   flush(microtaskId: number = -1) {
950 │     let players: AnimationPlayer[] = [];
951 │     if (this.newHostElements.size) {
952 │       this.newHostElements.forEach((ns, element) => this._balanceNamespaceList(ns, element));
953 │       this.newHostElements.clear();
954 │     }
955 │ 
956 ▶     if (this.totalAnimations && this.collectedEnterElements.length) {
957 │       for (let i = 0; i < this.collectedEnterElements.length; i++) {
958 │         const elm = this.collectedEnterElements[i];
959 ▶         addClass(elm, STAR_CLASSNAME);
960 │       }
961 │     }
962 │ 
963 ▶     if (
964 │       this._namespaceList.length &&
965 ▶       (this.totalQueuedPlayers || this.collectedLeaveElements.length)
966 │     ) {
967 │       const cleanupFns: Function[] = [];
968 │       try {
969 ▶         players = this._flushAnimations(cleanupFns, microtaskId);
970 │       } finally {
971 ▶         for (let i = 0; i < cleanupFns.length; i++) {
972 ▶           cleanupFns[i]();
973 │         }
974 │       }
975 │     } else {
976 ▶       for (let i = 0; i < this.collectedLeaveElements.length; i++) {
977 │         const element = this.collectedLeaveElements[i];
978 ▶         this.processLeaveNode(element);
979 │       }
980 │     }
981 │ 
982 ▶     this.totalQueuedPlayers = 0;
983 │     this.collectedEnterElements.length = 0;
984 │     this.collectedLeaveElements.length = 0;
985 ▶     this._flushFns.forEach((fn) => fn());
986 │     this._flushFns = [];
```

959 行目、アニメーションが 1 つでも登録されていれば、入った要素に `ng-star-inserted` を付けます。963〜969 行目、名前空間があって、積まれた遷移か消える要素があれば `_flushAnimations` へ。無ければ 976〜978 行目で消える要素をそのまま片付けます。971〜972 行目、`_flushAnimations` の途中で例外が出ても、一時的に付けたクラスは必ず外します。985 行目の `_flushFns` は、ほかの場所が `afterFlush(cb)` で「flush が終わったら」と頼んだ処理です（第 13 回で見た `BaseAnimationRenderer.destroy` が待つ `afterFlushAnimationsDone` は別の配列で、この flush で作ったプレイヤーが全部終わってから呼ばれる）。

### (1) 入った要素と消える要素に一時的なクラスを付ける

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L1031–1070 （▶ の行: 1032, 1040, 1042, 1051, 1054, 1056, 1059, 1065, 1067, 1069）

```ts
1031 │     const allTriggerElements = Array.from(this.statesByElement.keys());
1032 ▶     const enterNodeMap = buildRootMap(allTriggerElements, this.collectedEnterElements);
1033 │ 
1034 │     // this must occur before the instructions are built below such that
1035 │     // the :enter queries match the elements (since the timeline queries
1036 │     // are fired during instruction building).
1037 │     const enterNodeMapIds = new Map<any, string>();
1038 │     let i = 0;
1039 │     enterNodeMap.forEach((nodes, root) => {
1040 ▶       const className = ENTER_CLASSNAME + i++;
1041 │       enterNodeMapIds.set(root, className);
1042 ▶       nodes.forEach((node) => addClass(node, className));
1043 │     });
1044 │ 
1045 │     const allLeaveNodes: any[] = [];
1046 │     const mergedLeaveNodes = new Set<any>();
1047 │     const leaveNodesWithoutAnimations = new Set<any>();
1048 │     for (let i = 0; i < this.collectedLeaveElements.length; i++) {
1049 │       const element = this.collectedLeaveElements[i];
1050 │       const details = element[REMOVAL_FLAG] as ElementAnimationState;
1051 ▶       if (details && details.setForRemoval) {
1052 │         allLeaveNodes.push(element);
1053 │         mergedLeaveNodes.add(element);
1054 ▶         if (details.hasAnimation) {
1055 │           this.driver
1056 ▶             .query(element, STAR_SELECTOR, true)
1057 │             .forEach((elm) => mergedLeaveNodes.add(elm));
1058 │         } else {
1059 ▶           leaveNodesWithoutAnimations.add(element);
1060 │         }
1061 │       }
1062 │     }
1063 │ 
1064 │     const leaveNodeMapIds = new Map<any, string>();
1065 ▶     const leaveNodeMap = buildRootMap(allTriggerElements, Array.from(mergedLeaveNodes));
1066 │     leaveNodeMap.forEach((nodes, root) => {
1067 ▶       const className = LEAVE_CLASSNAME + i++;
1068 │       leaveNodeMapIds.set(root, className);
1069 ▶       nodes.forEach((node) => addClass(node, className));
1070 │     });
```

1032 行目で、入った要素を「どのトリガーの要素の下にあるか」でまとめ、1040〜1042 行目でまとまりごとに `ng-enter` + 番号のクラスを付けます。消える要素も 1065〜1069 行目で `ng-leave` + 番号です。第 15 回の `invokeQuery` が `query(':enter')` を「このクラス名のセレクタ」に置き換えるので、**このクラスを付けた後で**遷移を組み立てる必要があります（1034〜1036 行目のコメント）。1054〜1057 行目、自分の leave アニメーションを持つ要素は、中の `ng-star-inserted` の要素も一緒に「消える」扱いにします。

### (2) 待ち行列を取り出して、遷移を keyframes の命令にする

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L532–566 （▶ の行: 539, 542–543, 549–550, 555, 562, 566）

```ts
532 │   drainQueuedTransitions(microtaskId: number): QueueInstruction[] {
533 │     const instructions: QueueInstruction[] = [];
534 │     this._queue.forEach((entry) => {
535 │       const player = entry.player;
536 │       if (player.destroyed) return;
537 │ 
538 │       const element = entry.element;
539 ▶       const listeners = this._elementListeners.get(element);
540 │       if (listeners) {
541 │         listeners.forEach((listener: TriggerListener) => {
542 ▶           if (listener.name == entry.triggerName) {
543 ▶             const baseEvent = makeAnimationEvent(
544 │               element,
545 │               entry.triggerName,
546 │               entry.fromState.value,
547 │               entry.toState.value,
548 │             );
549 ▶             (baseEvent as any)['_data'] = microtaskId;
550 ▶             listenOnPlayer(entry.player, listener.phase, baseEvent, listener.callback);
551 │           }
552 │         });
553 │       }
554 │ 
555 ▶       if (player.markedForDestroy) {
556 │         this._engine.afterFlush(() => {
557 │           // now we can destroy the element properly since the event listeners have
558 │           // been bound to the player
559 │           player.destroy();
560 │         });
561 │       } else {
562 ▶         instructions.push(entry);
563 │       }
564 │     });
565 │ 
566 ▶     this._queue = [];
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L1123–1157 （▶ の行: 1123, 1126, 1133–1134, 1142, 1145, 1152–1155）

```ts
1123 ▶         const nodeIsOrphaned = !bodyNode || !this.driver.containsElement(bodyNode, element);
1124 │         const leaveClassName = leaveNodeMapIds.get(element)!;
1125 │         const enterClassName = enterNodeMapIds.get(element)!;
1126 ▶         const instruction = this._buildInstruction(
1127 │           entry,
1128 │           subTimelines,
1129 │           enterClassName,
1130 │           leaveClassName,
1131 │           nodeIsOrphaned,
1132 │         )!;
1133 ▶         if (instruction.errors && instruction.errors.length) {
1134 ▶           erroneousTransitions.push(instruction);
1135 │           return;
1136 │         }
1137 │ 
1138 │         // even though the element may not be in the DOM, it may still
1139 │         // be added at a later point (due to the mechanics of content
1140 │         // projection and/or dynamic component insertion) therefore it's
1141 │         // important to still style the element.
1142 ▶         if (nodeIsOrphaned) {
1143 │           player.onStart(() => eraseStyles(element, instruction.fromStyles));
1144 │           player.onDestroy(() => setStyles(element, instruction.toStyles));
1145 ▶           skippedPlayers.push(player);
1146 │           return;
1147 │         }
1148 │ 
1149 │         // if an unmatched transition is queued and ready to go
1150 │         // then it SHOULD NOT render an animation and cancel the
1151 │         // previously running animations.
1152 ▶         if (entry.isFallbackTransition) {
1153 ▶           player.onStart(() => eraseStyles(element, instruction.fromStyles));
1154 ▶           player.onDestroy(() => setStyles(element, instruction.toStyles));
1155 ▶           skippedPlayers.push(player);
1156 │           return;
1157 │         }
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L1203–1211 （▶ の行: 1206, 1209–1210）

```ts
1203 │     if (erroneousTransitions.length) {
1204 │       const errors: Error[] = [];
1205 │       erroneousTransitions.forEach((instruction) => {
1206 ▶         errors.push(transitionFailed(instruction.triggerName, instruction.errors!));
1207 │       });
1208 │ 
1209 ▶       allPlayers.forEach((player) => player.destroy());
1210 ▶       this.reportError(errors);
1211 │     }
```

1. **549〜550 行目：`(@open.done)` などのリスナーを、積まれたプレイヤーにつなぐ**

   イベントのもとを作り、549 行目で `_data` に flush の番号を入れます（第 14 回の `scheduleListenerCallback` がこの番号を見る）。550 行目の `listenOnPlayer` は、phase が `'done'` なら `player.onDone(...)` を呼ぶだけです（下の `shared.ts`）。
2. **1126 行目：`_buildInstruction`**

   中で第 15 回の `AnimationTransitionFactory.build` が、前後の state のスタイル、時間を積んだ keyframes、`query` で見つけた要素を 1 つの命令にします。1133〜1136 行目、エラーを持つ命令は分けておき、1206〜1210 行目でまとめて投げます（`query` の 0 件の NG03014 は、1206 行目の `transitionFailed`（NG03505）に包まれて、1210 行目の `reportError` から投げられる）。
3. **1142〜1157 行目：動かさない遷移**

   要素が `body` の外にある（1123 行目）か、一致が無くて fallback を使った（1152 行目）なら、プレイヤーは作らず、1153〜1154 行目で「始まったら前のスタイルを消し、終わったら次の状態のスタイルを置く」だけにします。`state()` のスタイルが、アニメーションしない値の変化でも付くのはここです。

📄 `angular/packages/animations/browser/src/render/shared.ts` L87–104 （▶ の行: 93–95）

```ts
 87 │ export function listenOnPlayer(
 88 │   player: AnimationPlayer,
 89 │   eventName: string,
 90 │   event: AnimationEvent | undefined,
 91 │   callback: (event: any) => any,
 92 │ ) {
 93 ▶   switch (eventName) {
 94 ▶     case 'start':
 95 ▶       player.onStart(() => callback(event && copyAnimationEvent(event, 'start', player)));
 96 │       break;
 97 │     case 'done':
 98 │       player.onDone(() => callback(event && copyAnimationEvent(event, 'done', player)));
 99 │       break;
100 │     case 'destroy':
101 │       player.onDestroy(() => callback(event && copyAnimationEvent(event, 'destroy', player)));
102 │       break;
103 │   }
104 │ }
```

### (3) プレイヤーを作る

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L1328–1347 （▶ の行: 1328, 1337, 1339–1340, 1344, 1346）

```ts
1328 ▶         const innerPlayer = this._buildAnimation(
1329 │           player.namespaceId,
1330 │           instruction,
1331 │           allPreviousPlayersMap,
1332 │           skippedPlayersMap,
1333 │           preStylesMap,
1334 │           postStylesMap,
1335 │         );
1336 │ 
1337 ▶         player.setRealPlayer(innerPlayer);
1338 │ 
1339 ▶         if (parentWithAnimation === NO_PARENT_ANIMATION_ELEMENT_DETECTED) {
1340 ▶           rootPlayers.push(player);
1341 │         } else {
1342 │           const parentPlayers = this.playersByElement.get(parentWithAnimation);
1343 │           if (parentPlayers && parentPlayers.length) {
1344 ▶             player.parentPlayer = optimizeGroupPlayer(parentPlayers);
1345 │           }
1346 ▶           skippedPlayers.push(player);
1347 │         }
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L1609–1628 （▶ の行: 1614–1617, 1627）

```ts
1609 │   private _buildPlayer(
1610 │     instruction: AnimationTimelineInstruction,
1611 │     keyframes: Array<ɵStyleDataMap>,
1612 │     previousPlayers: AnimationPlayer[],
1613 │   ): AnimationPlayer {
1614 ▶     if (keyframes.length > 0) {
1615 ▶       return this.driver.animate(
1616 ▶         instruction.element,
1617 ▶         keyframes,
1618 │         instruction.duration,
1619 │         instruction.delay,
1620 │         instruction.easing,
1621 │         previousPlayers,
1622 │       );
1623 │     }
1624 │ 
1625 │     // special case for when an empty transition|definition is provided
1626 │     // ... there is no point in rendering an empty animation
1627 ▶     return new NoopAnimationPlayer(instruction.duration, instruction.delay);
1628 │   }
```

1328 行目の `_buildAnimation` は、命令の timeline（要素ごと）1 つずつに 1615 行目の `driver.animate()` でプレイヤーを作ります（keyframes が空なら 1627 行目で `NoopAnimationPlayer`）。複数あれば 1 つのグループのプレイヤーにまとめます。1337 行目、それを 2 節の入れ物に `setRealPlayer` で入れます（7 節）。1339〜1340 行目、親の要素がアニメーションしていなければ「根のプレイヤー」、していれば 1344 行目で親のプレイヤーにつなぎ、親と一緒に終わらせます。

### (4) 消える要素を、消してよいときに消す

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L1386–1422 （▶ の行: 1389, 1394, 1401–1402, 1407, 1417–1418, 1420）

```ts
1386 │     for (let i = 0; i < allLeaveNodes.length; i++) {
1387 │       const element = allLeaveNodes[i];
1388 │       const details = element[REMOVAL_FLAG] as ElementAnimationState;
1389 ▶       removeClass(element, LEAVE_CLASSNAME);
1390 │ 
1391 │       // this means the element has a removal animation that is being
1392 │       // taken care of and therefore the inner elements will hang around
1393 │       // until that animation is over (or the parent queried animation)
1394 ▶       if (details && details.hasAnimation) continue;
1395 │ 
1396 │       let players: TransitionAnimationPlayer[] = [];
1397 │ 
1398 │       // if this element is queried or if it contains queried children
1399 │       // then we want for the element not to be removed from the page
1400 │       // until the queried animations have finished
1401 ▶       if (queriedElements.size) {
1402 ▶         let queriedPlayerResults = queriedElements.get(element);
1403 │         if (queriedPlayerResults && queriedPlayerResults.length) {
1404 │           players.push(...queriedPlayerResults);
1405 │         }
1406 │ 
1407 ▶         let queriedInnerElements = this.driver.query(element, NG_ANIMATING_SELECTOR, true);
1408 │         for (let j = 0; j < queriedInnerElements.length; j++) {
1409 │           let queriedPlayers = queriedElements.get(queriedInnerElements[j]);
1410 │           if (queriedPlayers && queriedPlayers.length) {
1411 │             players.push(...queriedPlayers);
1412 │           }
1413 │         }
1414 │       }
1415 │ 
1416 │       const activePlayers = players.filter((p) => !p.destroyed);
1417 ▶       if (activePlayers.length) {
1418 ▶         removeNodesAfterAnimationDone(this, element, activePlayers);
1419 │       } else {
1420 ▶         this.processLeaveNode(element);
1421 │       }
1422 │     }
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L1890–1896 （▶ の行: 1895）

```ts
1890 │ function removeNodesAfterAnimationDone(
1891 │   engine: TransitionAnimationEngine,
1892 │   element: any,
1893 │   players: AnimationPlayer[],
1894 │ ) {
1895 ▶   optimizeGroupPlayer(players).onDone(() => engine.processLeaveNode(element));
1896 │ }
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L925–947 （▶ の行: 926–927, 929, 937）

```ts
925 │   processLeaveNode(element: any) {
926 ▶     const details = element[REMOVAL_FLAG] as ElementAnimationState;
927 ▶     if (details && details.setForRemoval) {
928 │       // this will prevent it from removing it twice
929 ▶       element[REMOVAL_FLAG] = NULL_REMOVAL_STATE;
930 │       if (details.namespaceId) {
931 │         this.destroyInnerAnimations(element);
932 │         const ns = this._fetchNamespace(details.namespaceId);
933 │         if (ns) {
934 │           ns.clearElementCache(element);
935 │         }
936 │       }
937 ▶       this._onRemovalComplete(element, details.setForRemoval);
938 │     }
939 │ 
940 │     if (element.classList?.contains(DISABLED_CLASSNAME)) {
941 │       this.markElementAsDisabled(element, false);
942 │     }
943 │ 
944 │     this.driver.query(element, DISABLED_SELECTOR, true).forEach((node) => {
945 │       this.markElementAsDisabled(node, false);
946 │     });
947 │   }
```

1. **1394 行目：自分の leave アニメーションがある要素は飛ばす**

   それは 3 節の 430 行目で「プレイヤーが終わったら `processLeaveNode`」を登録済みです。
2. **1401〜1414 行目：親のアニメーションに `query` されているか**

   されていれば、1417〜1418 行目でそのプレイヤーが終わるのを待ってから消します（1895 行目）。
3. **1420 行目：どれでもなければ、すぐ消す**

   `processLeaveNode` は 927 行目で消す印を確かめ、929 行目で印を空にして 2 回消さないようにし、937 行目の `_onRemovalComplete` で**ここで初めて DOM から外します**（第 14 回で見たとおり、`AnimationRendererFactory` がこれを DOM レンダラーの `removeChild` に置き換えている）。

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L1424–1438 （▶ の行: 1427, 1429–1430, 1435）

```ts
1424 │     // this is required so the cleanup method doesn't remove them
1425 │     allLeaveNodes.length = 0;
1426 │ 
1427 ▶     rootPlayers.forEach((player) => {
1428 │       this.players.push(player);
1429 ▶       player.onDone(() => {
1430 ▶         player.destroy();
1431 │ 
1432 │         const index = this.players.indexOf(player);
1433 │         this.players.splice(index, 1);
1434 │       });
1435 ▶       player.play();
1436 │     });
1437 │ 
1438 │     return rootPlayers;
```

最後に 1427〜1435 行目、根のプレイヤーを順に `play()` します。1429〜1430 行目、終わったら `destroy()` して一覧から外します。**アニメーションが動き出すのはこの行**で、2 節で積んだ時点ではありません。

## 5. WebAnimationsDriver.animate：options を作ってプレイヤーを返す

📄 `angular/packages/animations/browser/src/render/web_animations/web_animations_driver.ts` L63–93 （▶ の行: 71–72, 75–76, 83, 85, 89–90, 92）

```ts
63 │   animate(
64 │     element: any,
65 │     keyframes: Array<Map<string, string | number>>,
66 │     duration: number,
67 │     delay: number,
68 │     easing: string,
69 │     previousPlayers: AnimationPlayer[] = [],
70 │   ): AnimationPlayer {
71 ▶     const fill = delay == 0 ? 'both' : 'forwards';
72 ▶     const playerOptions: {[key: string]: string | number} = {duration, delay, fill};
73 │     // we check for this to avoid having a null|undefined value be present
74 │     // for the easing (which results in an error for certain browsers #9752)
75 ▶     if (easing) {
76 ▶       playerOptions['easing'] = easing;
77 │     }
78 │ 
79 │     const previousStyles: ɵStyleDataMap = new Map();
80 │     const previousWebAnimationPlayers = <WebAnimationsPlayer[]>(
81 │       previousPlayers.filter((player) => player instanceof WebAnimationsPlayer)
82 │     );
83 ▶     if (allowPreviousPlayerStylesMerge(duration, delay)) {
84 │       previousWebAnimationPlayers.forEach((player) => {
85 ▶         player.currentSnapshot.forEach((val, prop) => previousStyles.set(prop, val));
86 │       });
87 │     }
88 │ 
89 ▶     let _keyframes = normalizeKeyframes(keyframes).map((styles) => new Map(styles));
90 ▶     _keyframes = balancePreviousStylesIntoKeyframes(element, _keyframes, previousStyles);
91 │     const specialStyles = packageNonAnimatableStyles(element, _keyframes);
92 ▶     return new WebAnimationsPlayer(element, _keyframes, playerOptions, specialStyles);
93 │   }
```

71 行目、delay が 0 なら `fill: 'both'`、あれば `'forwards'` です。83〜86 行目、前に動いていたプレイヤーの途中のスタイルを取り、90 行目で最初の keyframe に混ぜます（途中から続けて動くため）。92 行目で `WebAnimationsPlayer` を作って返しますが、**この時点では `element.animate()` はまだ呼ばれていません**。

## 6. WebAnimationsPlayer：element.animate を呼ぶ行と onDone

📄 `angular/packages/animations/browser/src/render/web_animations/web_animations_player.ts` L48–86 （▶ の行: 49–51, 64, 69–71, 77–79, 83）

```ts
48 │   private _onFinish() {
49 ▶     if (!this._finished) {
50 ▶       this._finished = true;
51 ▶       this._onDoneFns.forEach((fn) => fn());
52 │       this._onDoneFns = [];
53 │     }
54 │   }
55 │ 
56 │   init(): void {
57 │     if (!this._buildPlayer()) {
58 │       return;
59 │     }
60 │     this._preparePlayerBeforeStart();
61 │   }
62 │ 
63 │   private _buildPlayer(): Animation | null {
64 ▶     if (this._initialized) return this.domPlayer;
65 │     this._initialized = true;
66 │ 
67 │     const keyframes = this.keyframes;
68 │ 
69 ▶     const animation = this._triggerWebAnimation(this.element, keyframes, this.options);
70 ▶     if (!animation) {
71 ▶       this._onFinish();
72 │       return null;
73 │     }
74 │ 
75 │     this.domPlayer = animation;
76 │     this._finalKeyframe = keyframes.length ? keyframes[keyframes.length - 1] : new Map();
77 ▶     const onFinish = () => this._onFinish();
78 ▶     animation.addEventListener('finish', onFinish);
79 ▶     this.onDestroy(() => {
80 │       // We must remove the `finish` event listener once an animation has completed all its
81 │       // iterations. This action is necessary to prevent a memory leak since the listener captures
82 │       // `this`, creating a closure that prevents `this` from being garbage collected.
83 ▶       animation.removeEventListener('finish', onFinish);
84 │     });
85 │     return animation;
86 │   }
```

📄 `angular/packages/animations/browser/src/render/web_animations/web_animations_player.ts` L106–120 （▶ の行: 111, 113–114, 116–118）

```ts
106 │   _triggerWebAnimation(
107 │     element: HTMLElement,
108 │     keyframes: Array<ɵStyleDataMap>,
109 │     options: any,
110 │   ): Animation | null {
111 ▶     const keyframesObject = this._convertKeyframesToObject(keyframes);
112 │ 
113 ▶     // Account for `Element.animate` throwing an exception (Firefox) or returning null (Chromium) in certain
114 ▶     // conditions. See https://github.com/angular/angular/issues/64486
115 │     try {
116 ▶       return element.animate(keyframesObject, options);
117 ▶     } catch {
118 ▶       return null;
119 │     }
120 │   }
```

📄 `angular/packages/animations/browser/src/render/web_animations/web_animations_player.ts` L136–165 （▶ の行: 137, 141–142, 144, 149, 158, 163–164）

```ts
136 │   play(): void {
137 ▶     const player = this._buildPlayer();
138 │     if (!player) {
139 │       return;
140 │     }
141 ▶     if (!this.hasStarted()) {
142 ▶       this._onStartFns.forEach((fn) => fn());
143 │       this._onStartFns = [];
144 ▶       this._started = true;
145 │       if (this._specialStyles) {
146 │         this._specialStyles.start();
147 │       }
148 │     }
149 ▶     player.play();
150 │   }
151 │ 
152 │   pause(): void {
153 │     this.init();
154 │     this.domPlayer?.pause();
155 │   }
156 │ 
157 │   finish(): void {
158 ▶     this.init();
159 │     if (!this.domPlayer) return;
160 │     if (this._specialStyles) {
161 │       this._specialStyles.finish();
162 │     }
163 ▶     this._onFinish();
164 ▶     this.domPlayer.finish();
165 │   }
```

📄 `angular/packages/animations/browser/src/render/web_animations/web_animations_player.ts` L189–200 （▶ の行: 192–193, 197）

```ts
189 │   destroy(): void {
190 │     if (!this._destroyed) {
191 │       this._destroyed = true;
192 ▶       this._resetDomPlayerState();
193 ▶       this._onFinish();
194 │       if (this._specialStyles) {
195 │         this._specialStyles.destroy();
196 │       }
197 ▶       this._onDestroyFns.forEach((fn) => fn());
198 │       this._onDestroyFns = [];
199 │     }
200 │   }
```

1. **116 行目：ここで初めて `element.animate(keyframes, options)`**

   111 行目で Map の keyframes を普通のオブジェクトにしてから呼びます。113〜114 行目のコメントのとおり、Firefox が例外を投げたり Chromium が `null` を返したりする場合（#64486）は 117〜118 行目で `null` にし、70〜71 行目で**すぐ終わったことにします**。
2. **77〜78 行目：`'finish'` イベントで `_onFinish`**

   終わりは `Animation` の `'finish'` イベントで知ります（`finished` の Promise は使っていない）。49〜51 行目、`_onFinish` は 1 回だけ onDone のコールバックを順に呼びます。79〜84 行目、壊すときにリスナーを外します。
3. **137〜149 行目：play**

   まだなら 64 行目からの `_buildPlayer` で `element.animate()` し、最初の 1 回だけ 142 行目で onStart を呼び、149 行目で `Animation.play()` します。
4. **163〜164 行目・192〜193 行目：止めるとき**

   `finish()` は先に 163 行目で onDone を呼んでから 164 行目で `Animation.finish()`。`destroy()` は 192 行目で `Animation.cancel()` し、**193 行目で onDone も呼びます**。止められたプレイヤーでも done のコールバックは呼ばれます。

📄 `angular/packages/animations/src/players/animation_player.ts` L161–172 （▶ の行: 162–164, 171）

```ts
161 │   play(): void {
162 ▶     if (!this.hasStarted()) {
163 ▶       this._onStart();
164 ▶       this.triggerMicrotask();
165 │     }
166 │     this._started = true;
167 │   }
168 │ 
169 │   /** @internal */
170 │   triggerMicrotask() {
171 ▶     queueMicrotask(() => this._onFinish());
172 │   }
```

比べると、`NoopAnimationsModule` のドライバーが返す `NoopAnimationPlayer` は、`play()` で 163 行目の onStart を呼び、171 行目の microtask で onDone を呼ぶだけです。画面は動きませんが、コールバックの順番は同じです。

## 7. TransitionAnimationPlayer と done のコールバックが呼ばれる順番

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L1631–1663 （▶ の行: 1632, 1642, 1652, 1654–1656, 1662）

```ts
1631 │ export class TransitionAnimationPlayer implements AnimationPlayer {
1632 ▶   private _player: AnimationPlayer = new NoopAnimationPlayer();
1633 │   private _containsRealPlayer = false;
1634 │ 
1635 │   private _queuedCallbacks = new Map<string, ((event: any) => any)[]>();
1636 │   public readonly destroyed = false;
1637 │   public parentPlayer: AnimationPlayer | null = null;
1638 │ 
1639 │   public markedForDestroy: boolean = false;
1640 │   public disabled = false;
1641 │ 
1642 ▶   readonly queued: boolean = true;
1643 │   public readonly totalTime: number = 0;
1644 │ 
1645 │   constructor(
1646 │     public namespaceId: string,
1647 │     public triggerName: string,
1648 │     public element: any,
1649 │   ) {}
1650 │ 
1651 │   setRealPlayer(player: AnimationPlayer) {
1652 ▶     if (this._containsRealPlayer) return;
1653 │ 
1654 ▶     this._player = player;
1655 ▶     this._queuedCallbacks.forEach((callbacks, phase) => {
1656 ▶       callbacks.forEach((callback) => listenOnPlayer(player, phase, undefined, callback));
1657 │     });
1658 │ 
1659 │     this._queuedCallbacks.clear();
1660 │     this._containsRealPlayer = true;
1661 │     this.overrideTotalTime(player.totalTime);
1662 ▶     (this as Writable<this>).queued = false;
1663 │   }
```

📄 `angular/packages/animations/browser/src/render/transition_animation_engine.ts` L1682–1705 （▶ の行: 1686–1688, 1690）

```ts
1682 │   private _queueEvent(name: string, callback: (event: any) => any): void {
1683 │     getOrSetDefaultValue(this._queuedCallbacks, name, []).push(callback);
1684 │   }
1685 │ 
1686 ▶   onDone(fn: () => void): void {
1687 ▶     if (this.queued) {
1688 ▶       this._queueEvent('done', fn);
1689 │     }
1690 ▶     this._player.onDone(fn);
1691 │   }
1692 │ 
1693 │   onStart(fn: () => void): void {
1694 │     if (this.queued) {
1695 │       this._queueEvent('start', fn);
1696 │     }
1697 │     this._player.onStart(fn);
1698 │   }
1699 │ 
1700 │   onDestroy(fn: () => void): void {
1701 │     if (this.queued) {
1702 │       this._queueEvent('destroy', fn);
1703 │     }
1704 │     this._player.onDestroy(fn);
1705 │   }
```

2 節で作られた入れ物は、1632 行目で中身が `NoopAnimationPlayer`、1642 行目で `queued = true` です。その間に登録された onDone は 1688 行目で `_queuedCallbacks` にも溜まり、4 節の 1337 行目の `setRealPlayer` で 1655〜1657 行目のとおり**登録した順に**本物のプレイヤーへ移されます。消える要素の場合、本物のプレイヤーの onDone に並ぶ順番は次のとおりです。

1. **333 行目（2 節、`trigger` の中）**

   名前空間と `playersByElement` からこのプレイヤーを外す。
2. **430 行目（3 節、`removeNode` の中）**

   `processLeaveNode` → 937 行目で **DOM から外す**。
3. **550 行目（4 節、`drainQueuedTransitions`）**

   `(@x.done)` の利用者のコールバック。第 14 回の `scheduleListenerCallback` は、flush の番号が古いので（終わるのは後の回）その場で呼ぶ。
4. **1429〜1430 行目（4 節、根のプレイヤー）**

   プレイヤーを `destroy()` して `players` から外す。`setRealPlayer` の後に登録されるので最後。

つまり `(@x.done)` が呼ばれたとき、消える要素はもう DOM にありません。

## 8. 本物の element.animate() で順番を見る

> **🧪 DEMO — 本物の element.animate() で、onDone と finished の順を見る**
>
> 旧エンジンは使いません（このサイトに `@angular/animations` は入っていません）。この章のコンポーネントの `DemoWebAnimationsPlayer` は、6 節の `WebAnimationsPlayer` の `init` / `play` / `finish` / `destroy` と、`'finish'` イベントで onDone を呼ぶ仕組みを写したもので、中でブラウザの本物の `element.animate()` を呼びます。keyframes は第 15 回の timeline が作るのと同じ offset つきの形、options は `web_animations_driver.ts` 71〜72 行目と同じ作り方です。比べるために、`WebAnimationsPlayer` が使っていない `animation.finished`（Promise）の解決もログに出します。OS の設定で動きを減らしていても、このデモは動きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-legacy-engine)

headless の Chrome でボタンを押した記録（2026-11-01）では、普通に終わったとき、`animation.finished` の Promise が +610ms に解決し、その後 +611ms に `'finish'` イベントが来て、onDone が登録順に呼ばれました。「途中で destroy()」では、+201ms に `cancel()` → onDone が 2 つとも呼ばれ、`finished` の Promise は reject（cancel のため）、利用者のコールバックはその後の microtask でした。「途中で finish()」でも、6 節の 163 行目のとおり onDone が先に呼ばれ、そこから 1430 行目と同じ `destroy()` が `cancel()` するので、`finished` の Promise は reject になりました。`WebAnimationsPlayer` が `finished` ではなく `'finish'` イベントと自分の `_onFinish` で終わりを決めているので、止めたときにも done のコールバックが必ず 1 回呼ばれるわけです。

## 全体の流れ

- 👤 `isOpen = true / @if が false になる` — あなたのコンポーネント
  - `AnimationRenderer.setProperty / BaseAnimationRenderer.removeChild` — 第 14 回・第 17 回
    - `TransitionAnimationEngine.trigger()` — transition\_animation\_engine.ts 749 — *→ namespace.trigger 228：\_queue に積む*
    - `TransitionAnimationEngine.removeNode()` — transition\_animation\_engine.ts 813 — *→ triggerLeaveAnimation 405：'void' を積み、REMOVAL\_FLAG を付ける。DOM には残す*
  - `AnimationRendererFactory.end() → engine.flush()` — 第 14 回
    - `TransitionAnimationEngine.flush()` — transition\_animation\_engine.ts 949
      - `_flushAnimations()` — transition\_animation\_engine.ts — *ng-enter / ng-leave のクラス → drainQueuedTransitions → \_buildInstruction（第 15 回）*
        - `_buildAnimation() → _buildPlayer()` — 1328・1609
          - `WebAnimationsDriver.animate()` — web\_animations\_driver.ts 63 — *new WebAnimationsPlayer*
        - `TransitionAnimationPlayer.setRealPlayer()` — 1651 — *溜めたコールバックを移す*
        - `player.play()` — 1435
          - `WebAnimationsPlayer._triggerWebAnimation()` — web\_animations\_player.ts 106 — *element.animate()*
- `'finish' イベント → _onFinish()` — web\_animations\_player.ts 48
  - `processLeaveNode() → _onRemovalComplete()` — 925 — *ここで DOM から外す*
  - 👤 `(@x.done)` — scheduleListenerCallback（第 14 回）

## テストと直し方

エンジンの spec は `packages/animations/browser/test/render/transition_animation_engine_spec.ts` です。先頭の `if (isNode) return;` で Node では何も走らず、`describe('TransitionAnimationEngine')` の下に `'trigger registration'`・`'property setting'`・`'removal operations'`・`'event listeners'`・`'transition operations'`・`'style normalizer'`・`'view operations'` の 7 つの describe と 31 本の it があります。ドライバーで動かす代わりに `MockAnimationDriver`（`@angular/animations/browser/testing`）を使い、プレイヤーを手で `finish()` します。

📄 `angular/packages/animations/browser/test/render/transition_animation_engine_spec.ts` L149–181 （▶ の行: 149, 153, 158, 168–171, 173, 177）

```ts
149 ▶       it("should cleanup all inner state that's tied to an element once removed", () => {
150 │         const engine = makeEngine();
151 │ 
152 │         const trig = trigger('myTrigger', [
153 ▶           transition(':leave', [style({height: '0px'}), animate(1000, style({height: '100px'}))]),
154 │         ]);
155 │ 
156 │         registerTrigger(element, engine, trig);
157 │         setProperty(element, engine, 'myTrigger', 'value');
158 ▶         engine.flush();
159 │         expect(engine.statesByElement.has(element)).toBe(
160 │           true,
161 │           'Expected element data to be defined.',
162 │         );
163 │         expect(engine.playersByElement.has(element)).toBe(
164 │           true,
165 │           'Expected element data to be defined.',
166 │         );
167 │ 
168 ▶         engine.destroy(DEFAULT_NAMESPACE_ID, null);
169 ▶         engine.removeNode(DEFAULT_NAMESPACE_ID, element, true);
170 ▶         engine.flush();
171 ▶         engine.players[0].finish();
172 │ 
173 ▶         expect(engine.statesByElement.has(element)).toBe(
174 │           false,
175 │           'Expected element data to be undefined.',
176 │         );
177 ▶         expect(engine.playersByElement.has(element)).toBe(
178 │           false,
179 │           'Expected element data to be undefined.',
180 │         );
181 │       });
```

📄 `angular/packages/animations/browser/test/render/transition_animation_engine_spec.ts` L265–284 （▶ の行: 265, 274, 276, 278–279, 281–282）

```ts
265 ▶       it('should listen to the onDone operation for the animation', () => {
266 │         const engine = makeEngine();
267 │ 
268 │         const trig = trigger('myTrigger', [
269 │           transition('* => *', [style({height: '0px'}), animate(1000, style({height: '100px'}))]),
270 │         ]);
271 │ 
272 │         let count = 0;
273 │         registerTrigger(element, engine, trig);
274 ▶         listen(element, engine, 'myTrigger', 'done', () => count++);
275 │         setProperty(element, engine, 'myTrigger', 'value');
276 ▶         expect(count).toEqual(0);
277 │ 
278 ▶         engine.flush();
279 ▶         expect(count).toEqual(0);
280 │ 
281 ▶         engine.players[0].finish();
282 ▶         expect(count).toEqual(1);
283 │       });
284 │ 
```

149 行目の it は、`:leave` を持つ要素を `removeNode` し（169 行目）、flush して（170 行目）プレイヤーを終わらせる（171 行目）と、`statesByElement` と `playersByElement` から要素が消えること（173・177 行目）を確かめます。265 行目の it は、`setProperty` の時点（276 行目）でも `flush` の直後（279 行目）でも done は 0 回で、`finish()` して初めて 1 回になること（282 行目）を確かめます。7 節の「積んだ時点では動かない」「done は終わったとき」がこの 2 本です。

📄 `ターミナル（../angular で実行）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/animations/browser/test:test_web_chromium \
  --test_output=all --nocache_test_results

# render/ の it を数える
grep -cE "^\s*(it|fit)\(" packages/animations/browser/test/render/*.ts packages/animations/browser/test/render/web_animations/*.ts
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
Chromium: |██████████████████████████████| 1/1 test files | 124 passed, 0 failed
INFO: Elapsed time: 1.509s, Critical Path: 0.88s
//packages/animations/browser/test:test_web_chromium                     PASSED in 0.8s

packages/animations/browser/test/render/timeline_animation_engine_spec.ts:4
packages/animations/browser/test/render/transition_animation_engine_spec.ts:31
packages/animations/browser/test/render/web_animations/web_animations_driver_spec.ts:3
packages/animations/browser/test/render/web_animations/web_animations_player_spec.ts:7
```

1. **数が合うか**

   `render/` の it は 4 + 31 + 3 + 7 = 45 本で、`web_animations_driver_spec.ts` の Node 用の空の it 1 本を引くとブラウザで走るのは 44 本です。第 15 回の dsl の 80 本と合わせて 124 passed と合います。
2. **テンプレートを通した確認**

   `core/test/legacy_animation/legacy_animation_integration_spec.ts`（it 100 本）と `legacy_animation_query_integration_spec.ts`（55 本）が、コンポーネントを作って同じ流れを確かめています（`//packages/core/test:test_web_chromium`、1591 passed）。1 本だけ見たいときは作業コピーで `it` を `fit` に変えます（このシリーズでは ../angular を変えないので、試していません）。
3. **直すとしたら**

   値の変化と待ち行列は `AnimationTransitionNamespace.trigger`、消す判断は `removeNode` と `_flushAnimations` の後半、プレイヤーは `web_animations/web_animations_player.ts`（spec は同じ名前の `_spec.ts`。`'should gracefully handle animation being null in Chromium-based browsers'` と `'... exceptions in Firefox'` の it が #64486 の場合）です。最近の例では、コミット c73a001fbf7（fix(animations): detect object trigger values with Object.hasOwn、2026-08-11）が 2 節の 249 行目を `Object.hasOwn` に変え、spec に `'should read the value from a trigger object whose own key shadows hasOwnProperty'` を足しています。旧パッケージに入る変更は、このような小さな安全の修正がほとんどです（[第 20 回](20-animations-issues.md)）。

## 聞かれそうな質問

**Q. removeNode で要素はすぐ消えますか？**

消えません（消すアニメーションか、消すのを待つ理由があれば）。3 節の 838〜845 行目で「消す」印を付けて配列に入れるだけで、DOM には残ります。自分の `:leave` があればそのプレイヤーが終わったとき（430 行目）、親のアニメーションに `query` されていればそのプレイヤーが終わったとき（1418 行目）、どちらでもなければ flush の中ですぐ（1420 行目）、`processLeaveNode` の 937 行目で外します。アニメーションも親のトリガーも無い要素だけは、517〜523 行目で `removeNode` の中で同期に外されます。

**Q. flush が遅れると何が起きますか？**

flush までは何も動かず、消える要素も DOM に残ります。2 節の 316 行目で積むだけ、4 節の 1435 行目で初めて play するからです。flush は第 14 回の `end()`（一番外側の変更検知の終わり）で呼ばれるので、変更検知が走らない限り遅れます。アプリが壊されるときは `InjectableAnimationEngine.ngOnDestroy` が最後に 1 回 flush します（第 14 回）。テストでは `fixture.detectChanges()` のあとにアニメーションが始まるのはこのためです。

**Q. 旧エンジンは CSS の transition を使いますか？**

使いません。5 節の `WebAnimationsDriver` が作る `WebAnimationsPlayer` が、6 節の 116 行目で Web Animations API の `element.animate()` を呼びます。CSS は、終わった後のスタイルを置くとき（`setStyles`）と、一時的なクラス（`ng-animating`・`ng-enter` など）に使うだけです。新しい `animate.enter` / `animate.leave` が CSS のクラスとブラウザの `animation` / `transition` を使うのとは逆です（[第 5 回](05-animations-enter-classes.md)）。

**Q. done のコールバックはいつ、どの順で呼ばれますか？**

本物のプレイヤーの onDone に、7 節の順（333 → 430 → 550 → 1429〜1430 行目）で並びます。消える要素なら、DOM から外す（430 行目の先）のが利用者の `(@x.done)`（550 行目）より先です。`destroy()` で止めたときも 6 節の 193 行目で onDone が呼ばれるので、done は「終わったか止められたか」のどちらでも 1 回来ます。

**Q. プレイヤーを止めるのはどんなときですか？**

同じ要素・同じトリガーで、まだ積まれたままのプレイヤーは次の値が来たとき（2 節の 297〜298 行目）。動いている前のプレイヤーは、flush で次の遷移のプレイヤーを作る前に `_beforeAnimationBuild` が `beforeDestroy()`（途中のスタイルを写す）と `destroy()` で止め、その途中のスタイルを 5 節の 83〜86 行目で次の最初の keyframe に混ぜます。終わったプレイヤーは 1430 行目で `destroy()` されます。

## 読み終えて

- `trigger()` は前の値と新しい値から遷移を探して `_queue` に積み、中身の無い `TransitionAnimationPlayer` を返すだけ。動くのは flush の 1435 行目。
- `removeNode` は要素を DOM に残したまま `__ng_removed` の印を付ける。外すのは `processLeaveNode` の `_onRemovalComplete`（937 行目）で、leave のプレイヤーか親の query のプレイヤーが終わったとき。
- flush は、入った・消える要素に一時的なクラスを付け、遷移を命令にし（第 15 回）、`driver.animate()` でプレイヤーを作り、消える要素を片付け、根のプレイヤーを play する。
- `WebAnimationsPlayer` は 116 行目で `element.animate()` を呼び、`'finish'` イベントで onDone を呼ぶ。`destroy()` でも onDone は呼ばれる。
- spec は `animations/browser/test/render/` の 44 本（ブラウザ版）と `core/test/legacy_animation/`。どちらも Node では走らない。

---

← 前: [旧 DSL がキーフレームになるまで：trigger から timeline へ](15-animations-legacy-dsl.md)  
次: [2 つが同居するとき：旧エンジンのレンダラーと animate.leave](17-animations-legacy-compat.md) →
