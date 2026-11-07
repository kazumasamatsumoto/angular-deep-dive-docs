[目次](../README.md) › [zone.js の内側](README.md) › 第 13 回 / 全 13 回

# 1 クリックの全行程（zone.js あり）

> パッチ済みリスナー → ZoneTask.invokeTask → onInvokeTask → onEnter → あなたのハンドラ → markViewDirty → onLeave → checkStable → onMicrotaskEmpty → tick。呼び出し順をすべて並べる。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/zone-click-trace)

---

シリーズの最終回です。`<button (click)="count = count + 1">` を押してから `{{ count }}` の DOM が書き換わるまでに呼ばれる関数を、**zone.js 層 / NgZone 層 / Angular 層**に分けて 1 本の列に並べます。前の章で読んだ関数ばかりなので、新しい概念は出てきません。代わりに「どこまでが同期で、どこからがマイクロタスクのあとか」の境目を、行番号を根拠に確定させます。

読む対象は `zone.js/lib/common/events.ts`、`zone.js/lib/zone-impl.ts`、`core/src/zone/ng_zone.ts`、`core/src/render3/view/listeners.ts`、`core/src/change_detection/scheduling/`、`core/src/application/application_ref.ts` です。

1. 概観
2. Zone とは
3. モンキーパッチ
4. Task のライフサイクル
5. ZoneDelegate
6. マイクロタスクキュー
7. addEventListener
8. hasTask
9. NgZone の fork
10. onEnter・onLeave・checkStable
11. NgZoneChangeDetectionScheduler
12. coalescing と runOutsideAngular
13. **1 クリックの全行程**（この章）

## 0. 前提：リスナーは 'angular' zone の中で登録されている

クリックの話をする前に、「そのリスナーはどの zone のタスクか」を確定させます。答えは登録時の `Zone.current` で決まるので、登録の経路を上から追います。

📄 `angular/packages/core/src/platform/bootstrap.ts` L81–92 （▶ の行: 87–88）

```ts
81 │ export function bootstrap<M>(
82 │   config: ModuleBootstrapConfig<M> | ApplicationBootstrapConfig,
83 │ ): Promise<ApplicationRef> | Promise<NgModuleRef<M>> {
84 │   const envInjector = isApplicationBootstrapConfig(config)
85 │     ? config.r3Injector
86 │     : config.moduleRef.injector;
87 ▶   const ngZone = envInjector.get(NgZone);
88 ▶   return ngZone.run(() => {
89 │     if (isApplicationBootstrapConfig(config)) {
90 │       config.r3Injector.resolveInjectorInitializers();
91 │     } else {
92 │       config.moduleRef.resolveInjectorInitializers();
```

88 行目、起動処理は丸ごと `ngZone.run` の中です。ルートコンポーネントの生成も最初の描画もこの中で起きるので、テンプレートの `(click)` が登録される瞬間の `Zone.current` は `'angular'` zone です。

📄 `angular/packages/core/src/render3/instructions/listener.ts` L33–51 （▶ の行: 38–41）

```ts
33 │ export function ɵɵlistener(
34 │   eventName: string,
35 │   listenerFn: EventCallback,
36 │   eventTargetResolver?: GlobalTargetResolver,
37 │ ): typeof ɵɵlistener {
38 ▶   const lView = getLView<{} | null>();
39 ▶   const tView = getTView();
40 ▶   const tNode = getCurrentTNode()!;
41 ▶   listenerInternal(
42 │     tView,
43 │     lView,
44 │     lView[RENDERER],
45 │     tNode,
46 │     eventName,
47 │     listenerFn,
48 │     eventTargetResolver,
49 │   );
50 │   return ɵɵlistener;
51 │ }
```

📄 `angular/packages/core/src/render3/instructions/listener.ts` L136–157 （▶ の行: 140–142）

```ts
136 │   // Adding a native event listener is applicable when:
137 │   // - The corresponding TNode represents a DOM element.
138 │   // - The event target has a resolver (usually resulting in a global object,
139 │   //   such as `window` or `document`).
140 ▶   if (tNode.type & TNodeType.AnyRNode || eventTargetResolver) {
141 ▶     wrappedListener ??= wrapListener(tNode, lView, listenerFn);
142 ▶     const hasCoalescedDomEvent = listenToDomEvent(
143 │       tNode,
144 │       tView,
145 │       lView,
146 │       eventTargetResolver,
147 │       renderer,
148 │       eventName,
149 │       listenerFn,
150 │       wrappedListener,
151 │     );
152 │ 
153 │     // Context: https://github.com/angular/angular/pull/30144
154 │     if (hasCoalescedDomEvent) {
155 │       processOutputs = false;
156 │     }
157 │   }
```

📄 `angular/packages/core/src/render3/view/listeners.ts` L168–181 （▶ の行: 169–170, 181）

```ts
168 │   } else {
169 ▶     const native = getNativeByTNode(tNode, lView) as RElement;
170 ▶     const target = eventTargetResolver ? eventTargetResolver(native) : native;
171 │ 
172 │     stashEventListenerImpl(lView, target, eventName, wrappedListener);
173 │ 
174 │     // For element-local listeners (not global targets like document/window), store the
175 │     // native element on the wrapped listener so that when it fires it can mark the
176 │     // (event, element) pair as handled, preventing jsaction from replaying an event that
177 │     // was already dispatched by the real DOM listener post-hydration (see #67328).
178 │     if (!eventTargetResolver) {
179 │       (wrappedListener as any).__ngNativeEl__ = native as unknown as Element;
180 │     }
181 ▶     const cleanupFn = renderer.listen(target as RElement, eventName, wrappedListener);
```

コンパイルされたテンプレート関数が創造パスで `ɵɵlistener('click', fn)` を呼び（[創造命令の章](../ivy/09-ivy-create-instructions.md)）、41 行目 → `listenerInternal`。141 行目で `wrapListener`（あなたの関数を包む。3 節で中身を見ます）、142 行目で `listenToDomEvent`。169〜170 行目でネイティブ要素を取り、181 行目 `renderer.listen(target, 'click', wrappedListener)`。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L497–509 （▶ の行: 497, 503）

```ts
497 ▶     let wrappedCallback = this.decoratePreventDefault(callback);
498 │ 
499 │     if (this.tracingService?.wrapEventListener) {
500 │       wrappedCallback = this.tracingService.wrapEventListener(target, event, wrappedCallback);
501 │     }
502 │ 
503 ▶     return this.eventManager.addEventListener(
504 │       target,
505 │       event,
506 │       wrappedCallback,
507 │       options,
508 │     ) as VoidFunction;
509 │   }
```

📄 `angular/packages/platform-browser/src/dom/events/event_manager.ts` L77–85 （▶ の行: 83–84）

```ts
77 │   addEventListener(
78 │     element: HTMLElement,
79 │     eventName: string,
80 │     handler: Function,
81 │     options?: ListenerOptions,
82 │   ): Function {
83 ▶     const plugin = this._findPluginFor(eventName);
84 ▶     return plugin.addEventListener(element, eventName, handler, options);
85 │   }
```

📄 `angular/packages/platform-browser/src/dom/events/dom_events.ts` L25–33 （▶ の行: 31）

```ts
25 │   override addEventListener(
26 │     element: HTMLElement,
27 │     eventName: string,
28 │     handler: Function,
29 │     options?: ListenerOptions,
30 │   ): Function {
31 ▶     element.addEventListener(eventName, handler as EventListener, options);
32 │     return () => this.removeEventListener(element, eventName, handler as EventListener, options);
33 │   }
```

`DefaultDomRenderer2.listen` は 497 行目で `decoratePreventDefault`（戻り値 `false` なら `preventDefault` する包み）をかぶせ、503 行目で `EventManager.addEventListener`。83〜84 行目でプラグインを選び、`DomEventsPlugin` の 31 行目、**`element.addEventListener(eventName, handler, options)`**。ここで呼んでいる `addEventListener` は、zone.js が `EventTarget.prototype` に差し替えたパッチ版です（[addEventListener の章](07-zone-events.md)）。

📄 `angular/packages/zone.js/lib/common/events.ts` L580–591 （▶ の行: 583）

```ts
580 │         const capture = !options ? false : typeof options === 'boolean' ? true : options.capture;
581 │         const once = options && typeof options === 'object' ? options.once : false;
582 │ 
583 ▶         const zone = Zone.current;
584 │         let symbolEventNames = zoneSymbolEventNames[eventName];
585 │         if (!symbolEventNames) {
586 │           prepareEventNames(eventName, eventNameToString);
587 │           symbolEventNames = zoneSymbolEventNames[eventName];
588 │         }
589 │         const symbolEventName = symbolEventNames[capture ? TRUE_STR : FALSE_STR];
590 │         let existingTasks = target[symbolEventName];
591 │         let isExisting = false;
```

📄 `angular/packages/zone.js/lib/common/events.ts` L651–661 （▶ の行: 655, 659）

```ts
651 │         // The `scheduleEventTask` function will ultimately call `customScheduleGlobal`,
652 │         // which in turn calls the native `addEventListener`. This is why `taskData.options`
653 │         // is updated before scheduling the task, as `customScheduleGlobal` uses
654 │         // `taskData.options` to pass it to the native `addEventListener`.
655 ▶         const task: InternalEventTask = zone.scheduleEventTask(
656 │           source,
657 │           <Function>delegate,
658 │           data,
659 ▶           customScheduleFn,
660 │           customCancelFn,
661 │         );
```

📄 `angular/packages/zone.js/lib/common/events.ts` L395–407 （▶ の行: 401–404）

```ts
395 │     const customScheduleGlobal = function (task: Task) {
396 │       // if there is already a task for the eventName + capture,
397 │       // just return, because we use the shared globalZoneAwareCallback here.
398 │       if (taskData.isExisting) {
399 │         return;
400 │       }
401 ▶       return nativeAddEventListener.call(
402 ▶         taskData.target,
403 ▶         taskData.eventName,
404 ▶         taskData.capture ? globalZoneAwareCaptureCallback : globalZoneAwareCallback,
405 │         taskData.options,
406 │       );
407 │     };
```

583 行目、`const zone = Zone.current`。これが `'angular'` です。655 行目 `zone.scheduleEventTask(...)` で `eventTask` が作られ、`task.zone` は `'angular'`、`task.callback` は `decoratePreventDefault` の包みです。659 行目の `customScheduleFn`（= 395 行目の `customScheduleGlobal`）が 401〜404 行目で**本物の**`addEventListener` を呼びますが、渡すのはあなたの関数ではなく `globalZoneAwareCallback` です。ブラウザが知っているリスナーはこれ 1 つだけで、あなたの関数は `target[zoneSymbolEventName]` の配列に `task` として積まれています。

> [!NOTE]
> **ポイント**
>
> ここまでが起動時の話です。`'angular'` zone 所属の `eventTask` が 1 つ、ブラウザには `globalZoneAwareCallback` が 1 つ。この 2 つを頭に置いて、クリックを追います。

## 1. zone.js 層：ブラウザのディスパッチから onInvokeTask まで

📄 `angular/packages/zone.js/lib/common/events.ts` L254–271 （▶ の行: 263–264, 269–270）

```ts
254 │   function globalCallback(context: unknown, event: Event, isCapture: boolean) {
255 │     // https://github.com/angular/zone.js/issues/911, in IE, sometimes
256 │     // event will be undefined, so we need to use window.event
257 │     event = event || _global.event;
258 │     if (!event) {
259 │       return;
260 │     }
261 │     // event.target is needed for Samsung TV and SourceBuffer
262 │     // || global is needed https://github.com/angular/zone.js/issues/190
263 ▶     const target: any = context || event.target || _global;
264 ▶     const tasks = target[zoneSymbolEventNames[event.type][isCapture ? TRUE_STR : FALSE_STR]];
265 │     if (tasks) {
266 │       const errors = [];
267 │       // invoke all tasks which attached to current target with given event.type and capture = false
268 │       // for performance concern, if task.length === 1, just invoke
269 ▶       if (tasks.length === 1) {
270 ▶         const err = invokeTask(tasks[0], target, event);
271 │         err && errors.push(err);
```

📄 `angular/packages/zone.js/lib/common/events.ts` L221–242 （▶ の行: 224, 239）

```ts
221 │   const invokeTask = function (task: any, target: any, event: Event): Error | undefined {
222 │     // for better performance, check isRemoved which is set
223 │     // by removeEventListener
224 ▶     if (task.isRemoved) {
225 │       return;
226 │     }
227 │     const delegate = task.callback;
228 │     if (typeof delegate === 'object' && delegate.handleEvent) {
229 │       // create the bind version of handleEvent when invoke
230 │       task.callback = (event: Event) => delegate.handleEvent(event);
231 │       task.originalDelegate = delegate;
232 │     }
233 │     // invoke static task.invoke
234 │     // need to try/catch error here, otherwise, the error in one event listener
235 │     // will break the executions of the other event listeners. Also error will
236 │     // not remove the event listener when `once` options is true.
237 │     let error;
238 │     try {
239 ▶       task.invoke(task, target, [event]);
240 │     } catch (err: any) {
241 │       error = err;
242 │     }
```

ブラウザが `globalZoneAwareCallback(event)` を呼ぶと `globalCallback` へ。263〜264 行目で `target`（button）から `click` 用のタスク配列を取り出し、1 つなら 270 行目で `invokeTask(tasks[0], target, event)`。224 行目で `removeEventListener` 済みでないことを確認し、239 行目 `task.invoke(task, target, [event])`。`task.invoke` は `ZoneTask` constructor で `ZoneTask.invokeTask` に結び付けられています（[Task の章](04-zone-task.md)）。

📄 `angular/packages/zone.js/lib/zone-impl.ts` L1426–1443 （▶ の行: 1430, 1432–1433, 1436–1437）

```ts
1426 │     static invokeTask(task: any, target: any, args: any): any {
1427 │       if (!task) {
1428 │         task = this;
1429 │       }
1430 ▶       _numberOfNestedTaskFrames++;
1431 │       try {
1432 ▶         task.runCount++;
1433 ▶         return task.zone.runTask(task, target, args);
1434 │       } finally {
1435 │         try {
1436 ▶           if (_numberOfNestedTaskFrames === 1 && !global[enableNativeMicrotaskDraining]) {
1437 ▶             drainMicroTaskQueueSynchronously();
1438 │           }
1439 │         } finally {
1440 │           _numberOfNestedTaskFrames--;
1441 │         }
1442 │       }
1443 │     }
```

📄 `angular/packages/zone.js/lib/zone-impl.ts` L941–957 （▶ の行: 944–945, 952）

```ts
941 │       const reEntryGuard = task.state != running;
942 │       reEntryGuard && zoneTask._transitionTo(running, scheduled);
943 │       const previousTask = _currentTask;
944 ▶       _currentTask = zoneTask;
945 ▶       _currentZoneFrame = {parent: _currentZoneFrame, zone: this};
946 │ 
947 │       try {
948 │         if (type == macroTask && task.data && !isPeriodic && !isRefreshable) {
949 │           task.cancelFn = undefined;
950 │         }
951 │         try {
952 ▶           return this._zoneDelegate.invokeTask(this, zoneTask, applyThis, applyArgs);
953 │         } catch (error) {
954 │           if (this._zoneDelegate.handleError(this, error)) {
955 │             throw error;
956 │           }
957 │         }
```

📄 `angular/packages/zone.js/lib/zone-impl.ts` L1319–1330 （▶ の行: 1320–1321, 1329）

```ts
1319 │     invokeTask(targetZone: ZoneImpl, task: Task, applyThis: any, applyArgs?: any[]): any {
1320 ▶       return this._invokeTaskZS
1321 ▶         ? this._invokeTaskZS.onInvokeTask!(
1322 │             this._invokeTaskDlgt!,
1323 │             this._invokeTaskCurrZone!,
1324 │             targetZone,
1325 │             task,
1326 │             applyThis,
1327 │             applyArgs,
1328 │           )
1329 ▶         : task.callback.apply(applyThis, applyArgs);
1330 │     }
```

1430 行目で入れ子タスク数を 1 にし、1433 行目 `task.zone.runTask(task, target, args)`。`task.zone` は `'angular'` です。944〜945 行目で `_currentTask` と `_currentZoneFrame` を更新（ここから `Zone.current` は `'angular'`）、952 行目 `_zoneDelegate.invokeTask`。`'angular'` の delegate は `onInvokeTask` を持つので 1320〜1321 行目の分岐に入り、`NgZone` の `onInvokeTask` が呼ばれます。1436〜1437 行目は**あとで**戻ってくる場所です。`runTask` が終わったあと、ここでマイクロタスクキューが流されます（5 節）。

## 2. NgZone 層：onEnter

📄 `angular/packages/core/src/zone/ng_zone.ts` L438–463 （▶ の行: 447, 452–453, 461）

```ts
438 │     onInvokeTask: (
439 │       delegate: ZoneDelegate,
440 │       current: Zone,
441 │       target: Zone,
442 │       task: Task,
443 │       applyThis: any,
444 │       applyArgs: any,
445 │     ): any => {
446 │       // Prevent triggering change detection when the flag is detected.
447 ▶       if (shouldBeIgnoredByZone(applyArgs)) {
448 │         return delegate.invokeTask(target, task, applyThis, applyArgs);
449 │       }
450 │ 
451 │       try {
452 ▶         onEnter(zone);
453 ▶         return delegate.invokeTask(target, task, applyThis, applyArgs);
454 │       } finally {
455 │         if (
456 │           (zone.shouldCoalesceEventChangeDetection && task.type === 'eventTask') ||
457 │           zone.shouldCoalesceRunChangeDetection
458 │         ) {
459 │           delayChangeDetectionForEventsDelegate();
460 │         }
461 ▶         onLeave(zone);
462 │       }
463 │     },
```

📄 `angular/packages/core/src/zone/ng_zone.ts` L538–549 （▶ の行: 539–542, 547–548）

```ts
538 │ function onEnter(zone: NgZonePrivate) {
539 ▶   zone._nesting++;
540 ▶   if (zone.isStable) {
541 ▶     zone.isStable = false;
542 ▶     zone.onUnstable.emit(null);
543 │   }
544 │ }
545 │ 
546 │ function onLeave(zone: NgZonePrivate) {
547 ▶   zone._nesting--;
548 ▶   checkStable(zone);
549 │ }
```

447 行目の印は付いていないので通過、452 行目 `onEnter`。539 行目で `_nesting` 0 → 1、540〜542 行目、`isStable` が `true` だったので `false` にして `onUnstable.emit`。購読者は 2 つあります。`ZoneStablePendingTask` が `pendingTasks.add()`（[10 章](10-zone-ngzone-stability.md) 273 行目）、`ChangeDetectionSchedulerImpl` が `cleanup()`（[11 章](11-zone-ngzone-scheduler.md) 116 行目。予約は無いので何も消えません）。そして 453 行目 `delegate.invokeTask(...)`。親（`<root>` 側）の delegate は `onInvokeTask` を持たないので 1329 行目 `task.callback.apply(applyThis, applyArgs)`、つまり `decoratePreventDefault` の包みが `event` を受け取ります。

## 3. Angular 層：wrapListener → markViewDirty → あなたのハンドラ

📄 `angular/packages/core/src/render3/view/listeners.ts` L53–68 （▶ の行: 64–65, 67–68）

```ts
53 │   return function wrapListenerIn_markDirtyAndPreventDefault(event: any) {
54 │     // When a native element is stored on this function (set by listenToDomEvent for
55 │     // non-global-target listeners), mark the (event, element) pair as handled so that
56 │     // jsaction does not replay an event already dispatched by the real DOM listener.
57 │     const nativeEl = (wrapListenerIn_markDirtyAndPreventDefault as any).__ngNativeEl__;
58 │     if (nativeEl !== undefined) {
59 │       markEventHandledForElement(event, nativeEl);
60 │     }
61 │ 
62 │     // In order to be backwards compatible with View Engine, events on component host nodes
63 │     // must also mark the component view itself dirty (i.e. the view that it owns).
64 ▶     const startView = isComponentHost(tNode) ? getComponentLViewByIndex(tNode.index, lView) : lView;
65 ▶     markViewDirty(startView, NotificationSource.Listener);
66 │ 
67 ▶     const context = lView[CONTEXT];
68 ▶     let result = executeListenerWithErrorHandling(lView, context, listenerFn, event);
```

📄 `angular/packages/core/src/render3/instructions/mark_view_dirty.ts` L26–52 （▶ の行: 27, 39–40, 42, 45–46）

```ts
26 │ export function markViewDirty(lView: LView, source: NotificationSource): LView | null {
27 ▶   const dirtyBitsToUse = isRefreshingViews()
28 │     ? // When we are actively refreshing views, we only use the `Dirty` bit to mark a view
29 │       // for check. This bit is ignored in ChangeDetectionMode.Targeted, which is used to
30 │       // synchronously rerun change detection on a specific set of views (those which have
31 │       // the `RefreshView` flag and those with dirty signal consumers). `LViewFlags.Dirty`
32 │       // does not support re-entrant change detection on its own.
33 │       LViewFlags.Dirty
34 │     : // When we are not actively refreshing a view tree, it is absolutely
35 │       // valid to update state and mark views dirty. We use the `RefreshView` flag in this
36 │       // case to allow synchronously rerunning change detection. This applies today to
37 │       // afterRender hooks as well as animation listeners which execute after detecting
38 │       // changes in a view when the render factory flushes.
39 ▶       LViewFlags.RefreshView | LViewFlags.Dirty;
40 ▶   lView[ENVIRONMENT].changeDetectionScheduler?.notify(source);
41 │   while (lView) {
42 ▶     lView[FLAGS] |= dirtyBitsToUse;
43 │     const parent = getLViewParent(lView);
44 │     // Stop traversing up as soon as you find a root view that wasn't attached to any container
45 ▶     if (isRootView(lView) && !parent) {
46 ▶       return lView;
47 │     }
48 │     // continue otherwise
49 │     lView = parent!;
50 │   }
51 │   return null;
52 │ }
```

📄 `angular/packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts` L138–149 （▶ の行: 139, 148）

```ts
138 │   notify(source: NotificationSource): void {
139 ▶     if (!this.zonelessEnabled && source === NotificationSource.Listener) {
140 │       // When the notification comes from a listener, we skip the notification unless the
141 │       // application has enabled zoneless. Ideally, listeners wouldn't notify the scheduler at all
142 │       // automatically. We do not know that a developer made a change in the listener callback that
143 │       // requires an `ApplicationRef.tick` (synchronize templates / run render hooks). We do this
144 │       // only for an easier migration from OnPush components to zoneless. Because listeners are
145 │       // usually executed inside the Angular zone and listeners automatically call `markViewDirty`,
146 │       // developers never needed to manually use `ChangeDetectorRef.markForCheck` or some other API
147 │       // to make listener callbacks work correctly with `OnPush` components.
148 ▶       return;
149 │     }
```

`decoratePreventDefault` の包み（dom\_renderer.ts 531 行目）はブラウザでは `eventHandler(event)` をそのまま呼ぶだけなので、次は `wrapListenerIn_markDirtyAndPreventDefault`（53 行目）です。

1. **64〜65 行目：`markViewDirty(startView, NotificationSource.Listener)`**

   **ハンドラを呼ぶ前に**ビューを dirty にします。27〜39 行目、変更検知中でなければ `RefreshView | Dirty`、40 行目で `changeDetectionScheduler.notify(Listener)`、42 行目からルートまで親を辿ってフラグを立てます（45〜46 行目で停止）。40 行目の `notify` は zoneless\_scheduling\_impl.ts 139 行目で「zone.js あり かつ `Listener`」と判定され、148 行目で即 return。`dirtyFlags` には何も立ちません。
2. **67〜68 行目：`executeListenerWithErrorHandling` → あなたの `count = count + 1`**

   `setActiveConsumer(null)` で signal の依存追跡を切った上であなたの関数を呼びます（listeners.ts 82〜99 行目）。例外は `handleUncaughtError` に流れ、戻り値が `false` なら `preventDefault` の対象になります。ここで `count` が変わりました。ただし、まだ DOM は古いままです。

## 4. NgZone 層に戻る：onLeave → checkStable → onMicrotaskEmpty

あなたの関数が戻ると、`wrapListener` → `decoratePreventDefault` → 1329 行目 → 453 行目へと戻り、`onInvokeTask` の `finally` へ。coalescing は既定で `false` なので 461 行目 `onLeave`。547 行目で `_nesting` 1 → 0、548 行目 `checkStable`。

📄 `angular/packages/core/src/zone/ng_zone.ts` L370–385 （▶ の行: 370, 372–373, 376, 378, 380）

```ts
370 ▶   if (zone._nesting == 0 && !zone.hasPendingMicrotasks && !zone.isStable) {
371 │     try {
372 ▶       zone._nesting++;
373 ▶       zone.onMicrotaskEmpty.emit(null);
374 │     } finally {
375 │       zone._nesting--;
376 ▶       if (!zone.hasPendingMicrotasks) {
377 │         try {
378 ▶           zone.runOutsideAngular(() => zone.onStable.emit(null));
379 │         } finally {
380 ▶           zone.isStable = true;
381 │         }
382 │       }
383 │     }
384 │   }
385 │ }
```

📄 `angular/packages/core/src/change_detection/scheduling/ng_zone_scheduling.ts` L50–68 （▶ の行: 55, 58, 60–61）

```ts
50 │     this._onMicrotaskEmptySubscription = this.zone.onMicrotaskEmpty.subscribe({
51 │       next: () => {
52 │         // `onMicroTaskEmpty` can happen _during_ the zoneless scheduler change detection because
53 │         // zone.run(() => {}) will result in `checkStable` at the end of the `zone.run` closure
54 │         // and emit `onMicrotaskEmpty` synchronously if run coalsecing is false.
55 ▶         if (this.changeDetectionScheduler.runningTick) {
56 │           return;
57 │         }
58 ▶         this.zone.run(() => {
59 │           try {
60 ▶             this.applicationRef.dirtyFlags |= ApplicationRefDirtyFlags.ViewTreeGlobal;
61 ▶             this.applicationRef._tick();
62 │           } catch (e) {
63 │             this.applicationErrorHandler(e);
64 │           }
65 │         });
66 │       },
67 │     });
68 │   }
```

370 行目、`_nesting == 0`、ハンドラが Promise を作っていないので `hasPendingMicrotasks` は `false`、`isStable` は 541 行目で `false` にしたまま。3 条件がそろいます。372〜373 行目で `_nesting` を 1 にして `onMicrotaskEmpty.emit`。購読者 `NgZoneChangeDetectionScheduler`（55 行目 `runningTick` は `false`）が 58 行目 `zone.run` の中で 60 行目 `dirtyFlags |= ViewTreeGlobal`、61 行目 `_tick()`。

## 5. Angular 層：\_tick → synchronize → DOM 更新

📄 `angular/packages/core/src/application/application_ref.ts` L554–582 （▶ の行: 556, 566–567, 570, 574, 578）

```ts
554 │   private tickImpl = (): void => {
555 │     (typeof ngDevMode === 'undefined' || ngDevMode) && warnIfDestroyed(this._destroyed);
556 ▶     if (this._runningTick) {
557 │       profiler(ProfilerEvent.ChangeDetectionEnd);
558 │       throw new RuntimeError(
559 │         RuntimeErrorCode.RECURSIVE_APPLICATION_REF_TICK,
560 │         ngDevMode && 'ApplicationRef.tick is called recursively',
561 │       );
562 │     }
563 │ 
564 │     const prevConsumer = setActiveConsumer(null);
565 │     try {
566 ▶       this._runningTick = true;
567 ▶       this.synchronize();
568 │       if (typeof ngDevMode === 'undefined' || ngDevMode) {
569 │         for (let view of this.allViews) {
570 ▶           view.checkNoChanges();
571 │         }
572 │       }
573 │     } finally {
574 ▶       this._runningTick = false;
575 │       this.tracingSnapshot?.dispose();
576 │       this.tracingSnapshot = null;
577 │       setActiveConsumer(prevConsumer);
578 ▶       this.afterTick.next();
579 │ 
580 │       profiler(ProfilerEvent.ChangeDetectionEnd);
581 │     }
582 │   };
```

📄 `angular/packages/core/src/application/application_ref.ts` L626–655 （▶ の行: 630, 639, 641, 650, 653）

```ts
626 │     if (this.dirtyFlags & ApplicationRefDirtyFlags.ViewTreeAny) {
627 │       // Change detection on views starts in targeted mode (only check components if they're
628 │       // marked as dirty) unless global checking is specifically requested via APIs like
629 │       // `ApplicationRef.tick()` and the `NgZone` integration.
630 ▶       const useGlobalCheck = Boolean(this.dirtyFlags & ApplicationRefDirtyFlags.ViewTreeGlobal);
631 │ 
632 │       // Clear the view-related dirty flags.
633 │       this.dirtyFlags &= ~ApplicationRefDirtyFlags.ViewTreeAny;
634 │ 
635 │       // Set the AfterRender bit, as we're checking views and will need to run afterRender hooks.
636 │       this.dirtyFlags |= ApplicationRefDirtyFlags.AfterRender;
637 │ 
638 │       // Check all potentially dirty views.
639 ▶       for (let {_lView} of this.allViews) {
640 │         // When re-checking, only check views which actually need it.
641 ▶         if (!useGlobalCheck && !requiresRefreshOrTraversal(_lView)) {
642 │           continue;
643 │         }
644 │ 
645 │         const mode =
646 │           useGlobalCheck && !this.zonelessEnabled
647 │             ? // Global mode includes `CheckAlways` views.
648 │               // When using zoneless, all root views must be explicitly marked for refresh, even if they are
649 │               // `CheckAlways`.
650 ▶               ChangeDetectionMode.Global
651 │             : // Only refresh views with the `RefreshView` flag or views is a changed signal
652 │               ChangeDetectionMode.Targeted;
653 ▶         detectChangesInternal(_lView, mode);
654 │         ranDetectChanges = true;
655 │       }
```

556 行目の再入チェックを通り、566〜567 行目 `_runningTick = true` → `synchronize()`。`synchronizeOnce` の 630 行目で `useGlobalCheck = true`、639 行目でルートビューを回し、641 行目は `useGlobalCheck` が真なので飛ばさず、650 行目 `ChangeDetectionMode.Global` で 653 行目 `detectChangesInternal`。この中で `refreshView` がテンプレートの更新パスを走らせ、`ɵɵtextInterpolate` が `count` の新しい値を比べて `renderer.setValue` でテキストノードを書き換えます（[refreshView の章](../cd/03-cd-refresh-view.md)、[更新命令の章](../ivy/10-ivy-update-instructions.md)）。**DOM が変わるのはここ**です。570 行目、開発モードなら `checkNoChanges` で 2 周目。574 行目で `_runningTick = false`、578 行目 `afterTick.next()` （`ChangeDetectionSchedulerImpl` は 11 章 92〜103 行目のとおり `cleanup` して戻ります）。

61 行目から戻ると 58 行目の `zone.run` を抜け、`onInvoke` の `onLeave` → `checkStable` は `_nesting == 1` で何もせず、373 行目に戻ります。`finally` の 375 行目で `_nesting` 0、376 行目、変更検知がマイクロタスクを積んでいなければ 378 行目 `onStable.emit`（`runOutsideAngular` の中）→ `ZoneStablePendingTask` が `queueMicrotask` を 1 つ積む → 380 行目 `isStable = true`。

## 6. 同期と非同期の境目

📄 `angular/packages/zone.js/lib/zone-impl.ts` L1547–1566 （▶ の行: 1555, 1561）

```ts
1547 │   function drainMicroTaskQueueSynchronously() {
1548 │     if (_isDrainingMicrotaskQueue) {
1549 │       return;
1550 │     }
1551 │ 
1552 │     _isDrainingMicrotaskQueue = true;
1553 │ 
1554 │     try {
1555 ▶       while (_microTaskQueue.length) {
1556 │         const queue = _microTaskQueue;
1557 │         _microTaskQueue = [];
1558 │ 
1559 │         for (const task of queue) {
1560 │           try {
1561 ▶             task.zone.runTask(task, null, null);
1562 │           } catch (error) {
1563 │             _api.onUnhandledError(error as Error);
1564 │           }
1565 │         }
1566 │       }
```

📄 `angular/packages/core/src/zone/ng_zone.ts` L498–516 （▶ の行: 508–511）

```ts
498 │     onHasTask: (
499 │       delegate: ZoneDelegate,
500 │       current: Zone,
501 │       target: Zone,
502 │       hasTaskState: HasTaskState,
503 │     ) => {
504 │       delegate.hasTask(target, hasTaskState);
505 │       if (current === target) {
506 │         // We are only interested in hasTask events which originate from our zone
507 │         // (A child hasTask event is not interesting to us)
508 ▶         if (hasTaskState.change == 'microTask') {
509 ▶           zone._hasPendingMicrotasks = hasTaskState.microTask;
510 ▶           updateMicroTaskStatus(zone);
511 ▶           checkStable(zone);
512 │         } else if (hasTaskState.change == 'macroTask') {
513 │           zone.hasPendingMacrotasks = hasTaskState.macroTask;
514 │         }
515 │       }
516 │     },
```

`checkStable` → `onLeave` → `onInvokeTask` → 952 行目 → `runTask` の `finally`（`eventTask` なので数は減らない）→ 1433 行目に戻り、1436〜1437 行目で `drainMicroTaskQueueSynchronously`。1555〜1561 行目で、`ZoneStablePendingTask` が積んだ `queueMicrotask`（`<root>` 所属。`runOutsideAngular` の中で購読したため）が実行され、`pendingTasks.remove` → `ApplicationRef.isStable` が `true` になります。ここまで**すべて `globalZoneAwareCallback` の呼び出しの中、1 回の JavaScript 実行の中**です。ブラウザに制御が戻るのはこのあとで、次のレンダリング機会に画面が描かれます。

境目が動くのは、ハンドラが `await` や `Promise.then` を使ったときです。その場合 4 節の 370 行目で `hasPendingMicrotasks` が `true` なので `checkStable` は何もせず、1437 行目の drain で `then` の続きが `runTask` され、その `finally` でマイクロタスク数が 1 → 0 になったときの `onHasTask`（508〜511 行目）→ `checkStable` で 4〜5 節が動きます。それでも `globalZoneAwareCallback` の中であることは変わりません。`setTimeout` を使った場合だけ、本当に別のタスク（次の `ZoneTask.invokeTask`）になります。

> **🧪 DEMO — 全行程を層ごとに色分けし、同期の境目を引く**
>
> ハンドラの書き方を選ぶと、変更検知が「同じイベントディスパッチの中」で起きるか、「別のタスク」で起きるかが変わります。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/zone-click-trace)

## 全行程（count = count + 1 の場合）

- `globalZoneAwareCallback(event)` — zone.js/lib/common/events.ts L301 — *ブラウザが呼ぶ唯一のリスナー*
  - `globalCallback(this, event, false)` — events.ts L254 — *L264 で target の click タスク配列を取得*
    - `invokeTask(tasks[0], target, event)` — events.ts L270 → L221
      - `task.invoke(task, target, [event])` — events.ts L239
        - `ZoneTask.invokeTask(task, target, args)` — zone-impl.ts L1426 — *\_numberOfNestedTaskFrames 0→1*
          - `task.zone.runTask(task, target, args)` — zone-impl.ts L1433 → L920 — *task.zone は 'angular'。L945 で Zone.current も 'angular'*
            - `_zoneDelegate.invokeTask(this, task, ...)` — zone-impl.ts L952 → L1319
              - `onInvokeTask(delegate, current, target, task, applyThis, applyArgs)` — ng\_zone.ts L438 — *NgZone 層へ*
                - `onEnter(zone)` — ng\_zone.ts L452 → L538 — *\_nesting 0→1、isStable false、onUnstable.emit*
                  - `ZoneStablePendingTask`: `pendingTasks.add()` — ng\_zone\_scheduling.ts L273
                  - `ChangeDetectionSchedulerImpl`: `cleanup()` — zoneless\_scheduling\_impl.ts L116 — *予約なし。何も起きない*
                - `delegate.invokeTask(target, task, ...)` — ng\_zone.ts L453 → zone-impl.ts L1329 — *親に onInvokeTask は無い → task.callback.apply*
                  - `decoratePreventDefault` の包み — platform-browser dom\_renderer.ts L516 — *Angular 層へ*
                    - `wrapListenerIn_markDirtyAndPreventDefault(event)` — render3/view/listeners.ts L53
                      - `markViewDirty(startView, Listener)` — listeners.ts L65 → mark\_view\_dirty.ts L26 — *RefreshView | Dirty をルートまで*
                        - `changeDetectionScheduler.notify(Listener)` — mark\_view\_dirty.ts L40 → zoneless\_scheduling\_impl.ts L138 — *L139 → L148 return。dirtyFlags は触らない*
                      - `executeListenerWithErrorHandling(lView, ctx, listenerFn, event)` — listeners.ts L68 → L82
                        - 👤 `count = count + 1` — あなたのコンポーネント — *値は変わったが DOM はまだ*
                - `onLeave(zone)` — ng\_zone.ts L461 → L546 — *\_nesting 1→0*
                  - `checkStable(zone)` — ng\_zone.ts L548 → L354 — *L370: 3 条件そろう*
                    - `_nesting++; onMicrotaskEmpty.emit(null)` — ng\_zone.ts L372-373
                      - `NgZoneChangeDetectionScheduler` の next — ng\_zone\_scheduling.ts L51 — *L55 runningTick false*
                        - `zone.run(() => ...)` — ng\_zone\_scheduling.ts L58 — *onInvoke → onEnter: \_nesting 1→2*
                          - `dirtyFlags |= ViewTreeGlobal` — ng\_zone\_scheduling.ts L60
                          - `applicationRef._tick()` — ng\_zone\_scheduling.ts L61 → application\_ref.ts L541
                            - `tickImpl()` — application\_ref.ts L554 — *\_runningTick = true*
                              - `synchronize()` → `synchronizeOnce()` — application\_ref.ts L588 → L617 — *useGlobalCheck = true*
                                - `detectChangesInternal(_lView, ChangeDetectionMode.Global)` — application\_ref.ts L653 — *refreshView → ɵɵtextInterpolate → renderer.setValue。DOM が変わる*
                            - `afterTick.next()` — application\_ref.ts L578 — *ChangeDetectionSchedulerImpl: cleanup → zone.js ありなので return*
                        - `zone.run` を抜ける: `onLeave` → `checkStable` — ng\_zone.ts L494 → L370 — *\_nesting 2→1 → 何もしない*
                    - `_nesting--`（1→0）、`!hasPendingMicrotasks` — ng\_zone.ts L375-376
                    - `runOutsideAngular(() => onStable.emit(null))` — ng\_zone.ts L378 — *ZoneStablePendingTask が queueMicrotask を積む（&lt;root&gt; 所属）*
                    - `isStable = true` — ng\_zone.ts L380
          - `runTask` の `finally` — zone-impl.ts L958-977 — *eventTask → scheduled に戻すだけ。\_currentZoneFrame を戻す*
        - `drainMicroTaskQueueSynchronously()` — zone-impl.ts L1437 → L1547 — *queueMicrotask の中身: pendingTasks.remove → ApplicationRef.isStable が true*
- `globalZoneAwareCallback` から return — events.ts L301 — *ここでブラウザに制御が戻る。次の描画機会で画面が更新される*

## 聞かれそうな質問

**Q. ボタンのハンドラは、ブラウザから直接呼ばれているのですか？**

いいえ。ブラウザが知っているのは zone.js の `globalZoneAwareCallback`（events.ts 301 行目）だけです。`DomEventsPlugin` の `element.addEventListener`（dom\_events.ts 31 行目）はパッチ版で、583 行目で `Zone.current`（`'angular'`）を取り、655 行目で `eventTask` を作り、401〜404 行目で本物の `addEventListener` に `globalZoneAwareCallback` を渡しています。クリック時は `globalCallback` → `invokeTask` → `ZoneTask.invokeTask` → `runTask` → `onInvokeTask` と 5 段降りてから、ようやくあなたの関数です。

**Q. 変更検知はハンドラの「あと」ですか、「中」ですか？**

あとです。ただし同じ関数呼び出しの中です。あなたの関数が戻ってから `onInvokeTask` の `finally`（ng\_zone.ts 461 行目）→ `onLeave` → `checkStable`（370 行目）→ `onMicrotaskEmpty`（373 行目）→ `_tick`（ng\_zone\_scheduling.ts 61 行目）。すべて `globalZoneAwareCallback` が return する前に同期で終わります。`markViewDirty`（listeners.ts 65 行目）だけはハンドラの**前**です。

**Q. ハンドラの中で await したら、変更検知はどこで走りますか？**

`onLeave` 時点では `hasPendingMicrotasks` が `true` で `checkStable` は止まります（370 行目）。`ZoneTask.invokeTask` の `finally`（zone-impl.ts 1436〜1437 行目）で `drainMicroTaskQueueSynchronously` が走り、`then` の続きが 1561 行目で `runTask` され、その `finally` でマイクロタスク数が 0 になると `onHasTask`（ng\_zone.ts 508〜511 行目）→ `checkStable` → 4〜5 節と同じ経路です。まだ `globalZoneAwareCallback` の中です。本当に別タスクになるのは `setTimeout` を使ったときだけです。

**Q. Listener の notify が無視されるなら、なぜ markViewDirty は呼ばれるのですか？**

`markViewDirty`（mark\_view\_dirty.ts 26〜52 行目）の仕事は 2 つで、40 行目の `notify` と 42 行目からの `LView` フラグ立てです。無視されるのは前者だけ（zoneless\_scheduling\_impl.ts 139〜148 行目）。後者は `OnPush` コンポーネントがこのクリックで再評価されるために必要で、zone の `ViewTreeGlobal` は `CheckAlways` のビューしか無条件に見ないからです。

**Q. onStable のあとに積まれる queueMicrotask は、いつ実行されますか？**

同じ `globalZoneAwareCallback` の中です。`ZoneTask.invokeTask` の 1436〜1437 行目、入れ子タスク数が 1（最外）のとき `drainMicroTaskQueueSynchronously` が呼ばれ、1555〜1561 行目で `runTask` されます。その中で `pendingTasks.remove` が走り、`ApplicationRef.isStable` が `true` になります。ブラウザに制御が戻るのはそのあとです。

## 読み終えて

- 登録時：`bootstrap` の `ngZone.run` の中で `element.addEventListener`（パッチ版）が呼ばれ、`'angular'` 所属の `eventTask` と、ブラウザ向けの `globalZoneAwareCallback` ができる
- zone.js 層：`globalCallback` → `invokeTask` → `ZoneTask.invokeTask` → `runTask` → `_ZoneDelegate.invokeTask` → `onInvokeTask`
- NgZone 層：`onEnter`（`onUnstable`）→ 本体 → `onLeave` → `checkStable` → `onMicrotaskEmpty` → `onStable`
- Angular 層：`wrapListener` が `markViewDirty` してからあなたの関数を呼び、`onMicrotaskEmpty` の購読者が `ViewTreeGlobal` を立てて `_tick`。`synchronizeOnce` の `Global` モードで DOM が変わる
- 境目：すべて `globalZoneAwareCallback` の中で同期に終わる。`await` があっても同じ呼び出しの drain の中。`setTimeout` だけが別タスク

---

← 前: [eventCoalescing / runCoalescing と runOutsideAngular](12-zone-coalescing.md)  
次: [zoneless は既定になった：internalCreateApplication が差し込む 3 つのプロバイダ](../zoneless/01-zoneless-default.md) →
