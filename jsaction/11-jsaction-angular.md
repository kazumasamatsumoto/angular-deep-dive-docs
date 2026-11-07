[目次](../README.md) › [イベント配送（event-dispatch）と jsaction の内側](README.md) › 第 11 回 / 全 12 回

# Angular の側：イベントの記録と再生・hydrate の道とのつながり

> core の event\_delegation\_utils.ts と hydration/event\_replay.ts のうち event-replay の章で読んでいない行（起動のときの守り・使わないアプリでは空の預ける口・アプリが壊れたときの片付け）、サーバーが jsaction を付ける条件（hydration/annotate.ts）、render3/view/listeners.ts と invokeListeners で本物のリスナーと再生の二重の呼び出しを防ぐ行、最近の修正（d5fd51e9569 二重の呼び出し・3583c01bf9a イベントでない値の守りと関数の同一性・30e9c62bdfb メモリリーク）と、開いている #71518・#66506 の形を Node の記録で確かめる。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/jsaction-angular)

---

ここまでの 10 回で読んだ event-dispatch を、Angular はイベントの記録と再生（`withEventReplay`）で使います。その流れの大筋は [event-replay の章](../platform/14-event-replay.md)で読みました。この章は、そこで読んでいない Angular の側の行、つまり「起動のときの守り」「再生のための関数を預ける口を、使わないときは空にしておく作り」「本物のリスナーと再生の二重の呼び出しを防ぐ行」「アプリが壊れたときに手放すもの」を、最近の 3 つの修正（d5fd51e9569・3583c01bf9a・30e9c62bdfb）の `git show` と一緒に読み、Node で本当にハイドレートした記録で確かめます。

読む対象は `packages/core/src/hydration/event_replay.ts`・`hydration/tokens.ts`・`core/src/event_delegation_utils.ts`・`render3/view/listeners.ts`、サーバーの `hydration/annotate.ts` の 1 か所、spec は `packages/platform-server/test/event_replay_spec.ts` です。

1. [1. 全体像](01-jsaction-overview.md)
2. [2. jsaction 属性](02-jsaction-attribute.md)
3. [3. EventInfo](03-jsaction-event-info.md)
4. [4. イベントの種類](04-jsaction-event-types.md)
5. [5. 早期の契約](05-jsaction-early-contract.md)
6. [6. EventContract](06-jsaction-contract.md)
7. [7. 行き先を探す](07-jsaction-resolver.md)
8. [8. a11y の click](08-jsaction-a11y-click.md)
9. [9. mouseenter とタッチ](09-jsaction-mouse-touch.md)
10. [10. Dispatcher](10-jsaction-dispatcher.md)
11. **11. Angular の側**（この章）
12. [12. spec と issue](12-jsaction-tests-issues.md)

> [!NOTE]
> **ポイント**
>
> [event-replay の章](../platform/14-event-replay.md)で読んだ行：サーバーで種類を集める `collectDomEventsInfo`（event\_replay.ts 230〜272 行目）、`setJSActionAttributes`（event\_delegation\_utils.ts 25〜50 行目）、`withEventReplay` の `IS_EVENT_REPLAY_ENABLED` と預け方の登録（event\_replay.ts 76〜131 行目）、安定したときの再生と片付け（160〜197 行目）、`initEventReplay`（204〜224 行目）、`invokeRegisteredReplayListeners`（275〜287 行目）、`invokeListeners`（event\_delegation\_utils.ts 104〜134 行目）。`@defer` の塊の中のイベント（event\_replay.ts 289〜316 行目）は [defer-hydrate-events の章](../defer/18-defer-hydrate-events.md)です。この章では、それらの行は 7 行以下の抜き出しで指すか、章へのリンクで済ませます。

## 0. このサイトもイベントの再生を使っている

このサイトの `src/app/app.config.ts` は `provideClientHydration(withIncrementalHydration())` です。`withEventReplay()` とは書いていませんが、core の `withIncrementalHydration()` は providers の先頭に `withEventReplay()` を入れます（[incremental-hydration の章](../platform/15-incremental-hydration.md)）。本番ビルドの HTML にも、契約のスクリプトと 1 行が入っています。

📄 `本番ビルドの HTML（抜粋）`

```
<!-- 本番ビルドの /chapter/event-replay/index.html（2026-11-02 の build-prod と、2026-11-06 に作り直したもの）-->
<script type="text/javascript" id="ng-event-dispatch-contract">(()=>{function p(t,n,r,o,e,i,f,m){return{eventType:t,event:n … （以下略）</script>
<script>window.__jsaction_bootstrap(document.body,"ng",["click"],[]);</script>
```

このページで読む値は `"ng"`（`APP_ID` の既定）と、泡立つ種類の `["click"]` です。インクリメンタルハイドレーションが有効なので、ハイドレーションのあとも `<body>` の `EventContract` はアプリが壊れるまで残ります（event-replay の章の 8 節）。[第 10 回](10-jsaction-dispatcher.md)の 6 節で、その契約がこのページの click をいまも配っていることを確かめました。

## 1. サーバー：jsaction を付けるのは「再生が有効で、DOM のリスナーがある要素」

📄 `angular/packages/core/src/hydration/annotate.ts` L729–735 （▶ の行: 731, 733–734）

```ts
729 │     // Attach `jsaction` attribute to elements that have registered listeners,
730 │     // thus potentially having a need to do an event replay.
731 ▶     if (nativeElementsToEventTypes && tNode.type & TNodeType.Element) {
732 │       const nativeElement = unwrapRNode(lView[i]) as Element;
733 ▶       if (nativeElementsToEventTypes.has(nativeElement)) {
734 ▶         setJSActionAttributes(
735 │           nativeElement,
```

ビューを直列化するループの終わりです（[hydration-annotate の章](../platform/08-hydration-annotate.md)）。731 行目の `nativeElementsToEventTypes` は、再生が有効なときだけ作られる「要素 → イベントの種類」の Map で（event-replay の章の 2 節の 556〜557 行目）、無効なら `null` なので、この if に入りません。条件を並べると次のとおりです。

1. **サーバーで `IS_EVENT_REPLAY_ENABLED` が真**

   `withEventReplay()` の factory は、サーバーでは `window._ejsas` を見ずに真を返します（event-replay の章の 5 節の 81〜88 行目）。
2. **その要素に、テンプレートの DOM のリスナーがある**

   `@Output` の購読は除き、種類が早期の一覧にあるものだけです（event-replay の章の 2 節。種類の一覧は[第 4 回](04-jsaction-event-types.md)）。
3. **TNode が要素（731 行目の `TNodeType.Element`）**

   `<ng-container>` のコメントには付けません。

記録のアプリ（6 節）をサーバーで描くと、次の 3 つの要素に jsaction が付き、HTML の 1 行は泡立つ種類に click、捕獲の種類に load を入れました。`@if` が偽の `button#late` は描かれないので付きません。

📄 `記録のアプリのテンプレート`

```
<div id="outer" (click)="onOuter($event)">
  <button id="inner" type="button" (click)="onInner($event)">押す</button>
</div>
<img id="pic" alt="" (load)="onLoad($event)">
@if (show()) {
  <button id="late" type="button" (click)="onLate($event)">あとから</button>
}
```

📄 `記録：サーバーの HTML の [jsaction] と window.__jsaction_bootstrap(…)`

```
div#outer jsaction="click:;"
button#inner jsaction="click:;"
img#pic jsaction="load:;"

window.__jsaction_bootstrap(document.body,"ng",["click"],["load"]);
```

## 2. ブラウザ：起動のときの 3 つの守り

📄 `angular/packages/core/src/hydration/event_replay.ts` L52–67 （▶ の行: 55, 60, 65–66）

```ts
52 │ /** Apps in which we've enabled event replay.
53 │  *  This is to prevent initializing event replay more than once per app.
54 │  */
55 ▶ const appsWithEventReplay = new WeakSet<ApplicationRef>();
56 │ 
57 │ /**
58 │  * The key that represents all replayable elements that are not in defer blocks.
59 │  */
60 ▶ const EAGER_CONTENT_LISTENERS_KEY = '';
61 │ 
62 │ /**
63 │  * Determines whether Event Replay feature should be activated on the client.
64 │  */
65 ▶ function shouldEnableEventReplay(injector: Injector) {
66 ▶   return injector.get(IS_EVENT_REPLAY_ENABLED, EVENT_REPLAY_ENABLED_DEFAULT);
67 │ }
```

📄 `angular/packages/core/src/hydration/event_replay.ts` L132–159 （▶ の行: 133, 142, 146, 148–150, 152, 156）

```ts
132 │       {
133 ▶         provide: APP_BOOTSTRAP_LISTENER,
134 │         useFactory: () => {
135 │           const appRef = inject(ApplicationRef);
136 │           const {injector} = appRef;
137 │ 
138 │           return () => {
139 │             // We have to check for the appRef here due to the possibility of multiple apps
140 │             // being present on the same page. We only want to enable event replay for the
141 │             // apps that actually want it.
142 ▶             if (!shouldEnableEventReplay(injector) || appsWithEventReplay.has(appRef)) {
143 │               return;
144 │             }
145 │ 
146 ▶             appsWithEventReplay.add(appRef);
147 │ 
148 ▶             const appId = injector.get(APP_ID);
149 ▶             appRef.onDestroy(() => {
150 ▶               appsWithEventReplay.delete(appRef);
151 │               // Ensure that we're always safe calling this in the browser.
152 ▶               if (typeof ngServerMode !== 'undefined' && !ngServerMode) {
153 │                 // `_ejsa` should be deleted when the app is destroyed, ensuring that
154 │                 // no elements are still captured in the global list and are not prevented
155 │                 // from being garbage collected.
156 ▶                 clearAppScopedEarlyEventContract(appId);
157 │               }
158 │             });
159 │ 
```

1. **142 行目：再生が無効なら何もしない**

   65〜67 行目の `shouldEnableEventReplay` は `IS_EVENT_REPLAY_ENABLED` を読みます。ブラウザでは `window._ejsas[appId]` があるときだけ真です（event-replay の章の 5 節の 87 行目）。
2. **142・146 行目：同じ ApplicationRef で 2 回始めない**

   55 行目の `appsWithEventReplay` はモジュールに 1 つの `WeakSet` です。1 つのページに複数のアプリがあるとき、139〜141 行目のコメントのとおり、再生を使うアプリだけで、1 回だけ始めます。`WeakSet` なので、壊れた `ApplicationRef` を引き止めません。
3. **149〜158 行目：アプリが壊れたら早期の箱を消す**

   150 行目で `WeakSet` から外し、ブラウザなら 156 行目の `clearAppScopedEarlyEventContract(appId)` で `window._ejsas[appId]` を `undefined` にします（[第 5 回](05-jsaction-early-contract.md)）。153〜155 行目のコメントのとおり、箱の `q` に入った `EventInfo` が要素を持ち続けないためです。安定する前に壊したときも、ここが効きます（記録の destroy の場面）。

> [!WARNING]
> **ハマりどころ**
>
> 152 行目の条件は `typeof ngServerMode !== 'undefined' && !ngServerMode` です。`ngServerMode` が**定義されていて偽**のときだけ消します。Angular CLI はブラウザ用の束を作るときに `ngServerMode` を `false` に置き換えるので（angular-cli の `application-code-bundle.ts` の `define`）、ふつうのアプリでは消えます。テストでは自分で置く必要があり、spec の 253 行目がそれをしています（下の「テストと直し方」）。記録のスクリプトも、ブラウザの側では `ngServerMode = false` にしています。

## 3. 預ける口：使わないアプリでは空の関数

📄 `angular/packages/core/src/event_delegation_utils.ts` L136–149 （▶ の行: 137, 140, 148）

```ts
136 │ /** Shorthand for an event listener callback function to reduce duplication. */
137 ▶ export type EventCallback = (event?: any) => any;
138 │ 
139 │ /** Utility type used to make it harder to swap a wrapped and unwrapped callback. */
140 ▶ export type WrappedEventCallback = EventCallback & {__wrapped: boolean};
141 │ 
142 │ /**
143 │  * Represents a signature of a function that disables event replay feature
144 │  * for server-side rendered applications. This function is overridden with
145 │  * an actual implementation when the event replay feature is enabled via
146 │  * `withEventReplay()` call.
147 │  */
148 ▶ type StashEventListener = (el: RNode, eventName: string, listenerFn: EventCallback) => void;
149 │ 
```

📄 `angular/packages/core/src/event_delegation_utils.ts` L164–188 （▶ の行: 167, 169, 174, 179–180）

```ts
164 │ /**
165 │  * Indicates whether the stashing code was added, prevents adding it multiple times.
166 │  */
167 ▶ let isStashEventListenerImplEnabled = false;
168 │ 
169 ▶ let _stashEventListenerImpl = (
170 │   lView: LView,
171 │   target: RElement | EventTarget,
172 │   eventName: string,
173 │   wrappedListener: WrappedEventCallback,
174 ▶ ) => {};
175 │ 
176 │ /**
177 │  * Optionally stashes an event listener for later replay during hydration.
178 │  *
179 ▶  * This function delegates to an internal `_stashEventListenerImpl`, which may
180 ▶  * be a no-op unless the event replay feature is enabled. When active, this
181 │  * allows capturing event listener metadata before hydration completes, so that
182 │  * user interactions during SSR can be replayed.
183 │  *
184 │  * @param lView The logical view (LView) where the listener is being registered.
185 │  * @param target The DOM element or event target the listener is attached to.
186 │  * @param eventName The name of the event being listened for (e.g., 'click').
187 │  * @param wrappedListener The event handler that was registered.
188 │  */
```

1. **169〜174 行目：既定は何もしない関数**

   テンプレートのリスナーを登録するたびに、listeners.ts の `listenToDomEvent` がこの口を呼びます（event-replay の章の 5 節の 172 行目）。`withEventReplay()` を使わないアプリでは、ここが空の関数のままなので、預ける処理は 1 行も走りません。
2. **167 行目：差し替えは 1 回だけ**

   `withEventReplay()` の `ENVIRONMENT_INITIALIZER` が `enableStashEventListenerImpl()` を呼び、そこで初めて本物の預け方に差し替えます（event-replay の章の 5 節）。差し替えたあとは、モジュールの変数なので、ページが続く間ずっと本物のままです。
3. **140 行目：預けるのは包んだ関数**

   `WrappedEventCallback` は `wrapListener` が作った包み（変更検知の印付けまで含む）の型です。148 行目の `StashEventListener` は、アプリごとの預け方（`setStashFn` で `APP_ID` ごとに登録）の型です。

記録の before-stable の場面の 2 段目（ハイドレーションの直後、安定の前）では、3 つの要素の `__jsaction_fns` に、どれも `wrapListenerIn_markDirtyAndPreventDefault`（`wrapListener` が返す関数の名前）が 1 つずつ入っていて、その関数の `__ngNativeEl__` は要素そのものでした。次の節の印です。

## 4. 本物のリスナーと再生の二重の呼び出しを防ぐ（d5fd51e9569・3583c01bf9a）

ハイドレーションが済んだあと、アプリが安定する前（たとえば HTTP の応答を待っている間）に押すと、同じクリックが 2 つの道を通ります。要素に付いた本物のリスナーと、`<body>` の早期の箱です。箱のクリックは、安定したときに再生されます。d5fd51e9569（2026-04-25、#67328）の前は、ここでリスナーが 2 回呼ばれていました。

📄 `angular/packages/core/src/render3/view/listeners.ts` L174–180 （▶ の行: 178–179）

```ts
174 │     // For element-local listeners (not global targets like document/window), store the
175 │     // native element on the wrapped listener so that when it fires it can mark the
176 │     // (event, element) pair as handled, preventing jsaction from replaying an event that
177 │     // was already dispatched by the real DOM listener post-hydration (see #67328).
178 ▶     if (!eventTargetResolver) {
179 ▶       (wrappedListener as any).__ngNativeEl__ = native as unknown as Element;
180 │     }
```

📄 `angular/packages/core/src/render3/view/listeners.ts` L54–60 （▶ の行: 57–59）

```ts
54 │     // When a native element is stored on this function (set by listenToDomEvent for
55 │     // non-global-target listeners), mark the (event, element) pair as handled so that
56 │     // jsaction does not replay an event already dispatched by the real DOM listener.
57 ▶     const nativeEl = (wrapListenerIn_markDirtyAndPreventDefault as any).__ngNativeEl__;
58 ▶     if (nativeEl !== undefined) {
59 ▶       markEventHandledForElement(event, nativeEl);
60 │     }
```

📄 `angular/packages/core/src/event_delegation_utils.ts` L109–115 （▶ の行: 109, 111, 114–115）

```ts
109 ▶ const handledEventElements = new WeakMap<Event, WeakSet<Element>>();
110 │ 
111 ▶ export function markEventHandledForElement(event: Event, element: Element): void {
112 │   // Guard: WeakMap requires object keys. Synthetic events from triggerEventHandler in tests
113 │   // may be null or primitives, which are not real DOM events and don't need tracking.
114 ▶   if (event == null || typeof event !== 'object') return;
115 ▶   let elements = handledEventElements.get(event);
```

📄 `angular/packages/core/src/event_delegation_utils.ts` L123–129 （▶ の行: 124–125, 128）

```ts
123 │ export function invokeListeners(event: Event, currentTarget: Element | null) {
124 ▶   const handlerFns = currentTarget?.__jsaction_fns?.get(event.type);
125 ▶   if (!handlerFns || !currentTarget?.isConnected) {
126 │     return;
127 │   }
128 ▶   if (currentTarget && handledEventElements.get(event)?.has(currentTarget)) {
129 │     return;
```

1. **listeners.ts 178〜179 行目：包んだ関数に要素を貼る**

   `document:click` のような別の的（`eventTargetResolver`）でないときだけ、包んだ関数の `__ngNativeEl__` に要素を入れます。この包んだ関数は、すぐ上で預け（event-replay の章の 5 節の 172 行目）、すぐ下で `renderer.listen` に渡す（同じく 181 行目）関数と同じものです。
2. **listeners.ts 57〜59 行目：本物のリスナーとして呼ばれたら、印を付ける**

   包んだ関数の中で、`__ngNativeEl__` があれば `markEventHandledForElement(event, 要素)` を呼びます。
3. **event\_delegation\_utils.ts 109 行目：Event ごとに「もう配った要素」の集まり**

   `WeakMap<Event, WeakSet<Element>>` です。どちらも弱い参照なので、イベントも要素も引き止めません。104〜108 行目のコメント（event-replay の章で引用）のとおり、Event だけでなく要素ごとに覚えるのは、インクリメンタルハイドレーションでは同じイベントを*別の要素*（塊の中の要素）で渡し直すことがあるからです（defer-hydrate-events の章の 3 節）。
4. **128 行目：再生のとき、その要素でもう配っていれば呼ばない**

   124 行目で預けた関数を引き、125 行目で要素が DOM にあることを確かめたあと、128 行目で印を見ます。
5. **114 行目：イベントでない値は覚えない（3583c01bf9a）**

   `WeakMap` の鍵にはオブジェクトしか使えません。テストの `DebugElement.triggerEventHandler('click', null)` のように、包んだ関数が `null` や数で呼ばれると、このすぐ下の `handledEventElements.set(event, …)` が例外を投げるので、先に戻ります。

`git show` で 2 つの修正を読むと、d5fd51e9569 は最初、listeners.ts で `renderer.listen` に **別の関数**（`domListener` という、印を付けてから包んだ関数を呼ぶ関数）を渡していました。3583c01bf9a（同じ日）のコミットのメッセージは、その形だと `DebugElement.triggerEventHandler` がハンドラーを 2 回呼んだと書いています。`triggerEventHandler` は、Angular が持っている包んだ関数と、Zone.js が覚えているリスナーの関数が同じかで重複を除くので、関数が 2 つになると除けなかったのです。そこで、関数を分けずに、包んだ関数そのものに `__ngNativeEl__` を貼り（178〜179 行目）、包んだ関数の中で印を付ける（57〜59 行目）形に直しています。

## 5. アプリが壊れたあとに残るもの（30e9c62bdfb と、開いている 2 件）

📄 `angular/packages/core/src/hydration/tokens.ts` L42–65 （▶ の行: 46, 50, 55–57, 60, 63）

```ts
42 │ /**
43 │  * Internal token that indicates whether event replay support for SSR
44 │  * is enabled.
45 │  */
46 ▶ export const IS_EVENT_REPLAY_ENABLED = new InjectionToken<boolean>(
47 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'IS_EVENT_REPLAY_ENABLED' : '',
48 │ );
49 │ 
50 ▶ export const EVENT_REPLAY_ENABLED_DEFAULT = false;
51 │ 
52 │ /**
53 │  * A type of the queue that stores events occurring during the hydration process.
54 │  */
55 ▶ export type EventReplayQueue = {
56 ▶   event: Event;
57 ▶   currentTarget: Element;
58 │ }[];
59 │ 
60 ▶ export const EVENT_REPLAY_QUEUE = new InjectionToken<EventReplayQueue>(
61 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'EVENT_REPLAY_QUEUE' : '',
62 │   {
63 ▶     factory: () => [],
64 │   },
65 │ );
```

`@defer` の塊のイベントを積む列は、30e9c62bdfb（2026-01-07、#59261）で、モジュールの変数 `blockEventQueue` から、60〜65 行目のアプリごとの注入トークン `EVENT_REPLAY_QUEUE` に移りました。`git show` で読むと、それまでは `let blockEventQueue: {event: Event; currentTarget: Element}[] = []` がモジュールに 1 つあり、アプリを壊しても、積んだイベントと要素が残っていました。いまは 63 行目の factory がインジェクタごとに配列を作るので、アプリのインジェクタと一緒に手放されます（列の使い方は defer-hydrate-events の章の 3〜4 節）。46〜50 行目は 2 節の `IS_EVENT_REPLAY_ENABLED` の定義で、どこからも provide されなければ `false`（50 行目）です。

いまも開いている 2 件は、どちらも「再生が済んだあとも動き続けるもの」の話です。記録で確かめた形を並べます。

📄 `angular/packages/core/src/hydration/event_replay.ts` L217–223 （▶ の行: 217–219, 223）

```ts
217 ▶   const eventInfos = getAppScopedQueuedEventInfos(appId);
218 ▶   eventContract.replayEarlyEventInfos(eventInfos);
219 ▶   clearAppScopedEarlyEventContract(appId);
220 │   const dispatcher = new EventDispatcher((event) => {
221 │     invokeRegisteredReplayListeners(injector, event, event.currentTarget as Element);
222 │   });
223 ▶   registerDispatcher(eventContract, dispatcher);
```

- **#71518（2026-10-21）：早期の箱の &lt;body&gt; のリスナーが外されない。** 217〜219 行目で、箱の中身を取り出し、渡し、`window._ejsas[appId]` を消します。けれど、箱が `<body>` に付けたリスナーを外す `removeAllAppScopedEventListeners`（[第 5 回](05-jsaction-early-contract.md)）はどこでも呼んでいません。リスナーは箱の `q` に積み続けます。記録の after-stable の場面では、安定のあとに 2 回押すと、手元で控えておいた箱の `q` が 0 件から 2 件に増えました。issue に付いた PR #71519 は開いたままです（2026-11-06）。
- **#66506（2026-01-13）：安定のあとに作った要素が預け先の表に残る。** 3 節のとおり、預ける口はページが続く間ずっと本物のままで、アプリの預け方も壊れるまで登録されたままです（event-replay の章の 5 節の 112〜126 行目）。だから安定のあとに作った要素も、`__jsaction_fns` に関数を預けられ、`JSACTION_BLOCK_ELEMENT_MAP` の `''` の組に入ります。`''` の組を消すのは安定したときの 1 回だけです（同じく 6 節の 177〜178 行目）。記録の late の場面では、安定のあとに `@if` で作った `button#late` が `''` の組に入り、`@if` を偽にして DOM から外したあとも組に残りました。issue に付いた PR は、#66594 が開いたまま、#66613 と #66627 は閉じられています（2026-11-06）。

## 6. DEMO：JS の前・安定の前・安定の後（記録の再生）

> **🧪 DEMO — 早期の箱・預けた関数・契約・JSACTION\_BLOCK\_ELEMENT\_MAP（記録の再生）**
>
> これは記録です。本物の @angular/core 22.1.6（開発モード・JIT）を Node で、domino の DOM の上で動かしました。1 節のテンプレートを platform-server でサーバーとして描き、その HTML を domino の DOM に入れて、`provideClientHydration(withEventReplay())` でハイドレートしました（v22 の既定でインクリメンタルハイドレーションも有効です）。domino は `<script>` を実行しないので、契約のスクリプトと 1 行は記録のスクリプトが `eval` で実行しています。イベントは `CustomEvent` を `dispatchEvent` したものです（domino の `MouseEvent` は初期化の辞書を読まず、`type` が空になるため）。「早期の箱の q」は、Angular が `window._ejsas.ng` を消す前に記録のスクリプトが控えた箱を読んだものです。`EventContract` と `EventDispatcher` の入口には、呼ばれたことを書くだけの記録を挟んでいます。
>
> 場面を選んで、段のボタンを押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/jsaction-angular)

記録から読み取れることです。

1. **JS の前に inner を押す：箱の 1 件が、inner → outer の順に eventPhase = 101 で渡る**

   2 段目で、`addEvent` を click と load の 2 回、`replayEarlyEventInfos` に 1 件、`ecrd` の順に呼び、再生の印の付いた 1 件を `EventDispatcher` が inner と outer に配りました（泡立ちの真似は[第 10 回](10-jsaction-dispatcher.md)）。この場面では、`bootstrapApplication` が返った時点で、再生も jsaction の片付けも済んでいました。`window._ejsas.ng` は `undefined` ですが、控えた箱の `q` には 1 件が残っています（箱は空にされません）。
2. **stopPropagation：outer には渡らない**

   inner の `(click)` で `$event.stopPropagation()` を呼ぶと、再生でも outer の `(click)` は呼ばれません。第 10 回の 4 節の印です。
3. **before-stable：本物のリスナーが 1 回ずつ呼ばれ、安定のときの再生では呼ばれない**

   3 段目で、inner（`eventPhase = 2`）と outer（3）の本物のリスナーが呼ばれ、同じクリックが箱の `q` にも入りました。4 段目で安定すると、`EventDispatcher.dispatch` は再生の 1 件を受けましたが、リスナーは呼ばれていません。4 節の 128 行目で止まったからです。
4. **after-stable：契約は click を受け続けるが、渡す先がない。箱の q は増える**

   安定のあとの 2 回の click は、本物のリスナーが受けます。残った契約の `EventDispatcher.dispatch` も呼ばれますが、jsaction は 6 節の片付けで消えているので行き先がなく、何もしません。控えた箱の `q` は 2 件に増えました（5 節の #71518）。
5. **load：JS の前の load は 1 回だけ渡った**

   捕獲の種類の load も、箱から再生されて `(load)` が 1 回呼ばれました。#59260（2024-12-20）は本物のブラウザで `(load)` が 2 回呼ばれると報告しています。domino は画像を読み込まないので、この記録ではその場面を作れていません。
6. **destroy：安定の前に壊すと、箱が消える**

   2 節の 149〜158 行目で `window._ejsas.ng` が `undefined` になりました。再生は一度も走っていません（`initEventReplay` の記録がない）。
7. **late：安定のあとに作った要素が表に残る**

   5 節の #66506 の形です。消したあとも `''` の組に「DOM から外れている」`button#late` が残りました。
8. **null：イベントでない値でも例外にならない**

   `triggerEventHandler('click', null)` で、inner の `(click)` は `$event = null` で呼ばれ、例外は出ませんでした。4 節の 114 行目です。

📄 `scratchpad/jsa-demo/d/angular.ts（defer シリーズの共通の build.mjs で束ねて node で実行。共通の harness.ts は defer-overview の章に全文）`

```
// 第 11 回 jsaction-angular の記録。
// withEventReplay のアプリ（@defer なし）をサーバーで描き、その HTML を domino の DOM に入れて、
// ブラウザのプラットフォームでハイドレートする。JS の前・ハイドレーションの後で安定の前・安定の後に
// イベントを起こし、Angular の側（event_replay.ts・event_delegation_utils.ts・listeners.ts）の各段で何が起きたかを記録する。
// 使い方: node ../../defer-demo/_shared/build.mjs angular.ts angular.mjs && node angular.mjs angular.json
import '@angular/compiler';
import {
  Component, PendingTasks, PLATFORM_ID, VERSION, inject, provideZonelessChangeDetection, getDebugNode, signal,
  ɵJSACTION_EVENT_CONTRACT as JSACTION_EVENT_CONTRACT, ɵJSACTION_BLOCK_ELEMENT_MAP as JSACTION_BLOCK_ELEMENT_MAP,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { bootstrapApplication, provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { EventContract, EventDispatcher, EventInfoWrapper } from '@angular/core/primitives/event-dispatch';
import { readFileSync } from 'node:fs';
import { installDom, renderServer, tick, writeJson } from '../../defer-demo/_shared/harness';

const OUT = process.argv[2] ?? new URL('./angular.json', import.meta.url).pathname;
const SITE = '~/angular-research/angular-deep-dive';
const g = globalThis as any;

let log: { seq: number; kind: string; detail: string }[] = [];
let seq = 0;
const note = (kind: string, detail: string) => log.push({ seq: ++seq, kind, detail });
const tag = (el: any) => (!el ? String(el) : el.nodeName ? `${el.nodeName.toLowerCase()}${el.id ? '#' + el.id : ''}` : String(el));

// 本物の EventContract・EventDispatcher の入口に記録を挟む（Angular の core は同じ primitives-event-dispatch.mjs を使う）。
const P = EventContract.prototype as any;
for (const m of ['addEvent', 'replayEarlyEventInfos', 'ecrd', 'cleanUp']) {
  const orig = P[m];
  P[m] = function (...a: any[]) {
    note(`EventContract.${m}`, m === 'addEvent' ? `'${a[0]}'` : m === 'replayEarlyEventInfos' ? `${a[0].length} 件` : '');
    return orig.apply(this, a);
  };
}
const D = EventDispatcher.prototype as any;
const origDispatch = D.dispatch;
D.dispatch = function (eventInfo: any) {
  const w = new EventInfoWrapper(eventInfo);
  note('EventDispatcher.dispatch', `${w.getEventType()} target = ${tag(w.getTargetElement())}、再生 = ${!!w.getIsReplay()}`);
  return origDispatch.call(this, eventInfo);
};

const flags = { stop: false, pending: false };
let removeTask: (() => void) | null = null;

const TEMPLATE = `<div id="outer" (click)="onOuter($event)">
  <button id="inner" type="button" (click)="onInner($event)">押す</button>
</div>
<img id="pic" alt="" (load)="onLoad($event)">
@if (show()) {
  <button id="late" type="button" (click)="onLate($event)">あとから</button>
}`;

@Component({ selector: 'app-root', template: TEMPLATE })
class App {
  readonly show = signal(false);
  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID)) && flags.pending) {
      removeTask = inject(PendingTasks).add();
      note('test', 'PendingTasks.add()（安定を止めておく）');
    }
  }
  private say(name: string, e: any) {
    if (e == null || typeof e !== 'object') {
      note('listener', `${name} が呼ばれた: $event = ${String(e)}`);
      return;
    }
    note('listener', `${name} が呼ばれた: eventPhase = ${e.eventPhase}, target = ${tag(e.target)}, currentTarget = ${tag(e.currentTarget)}`);
  }
  onOuter(e: Event) { this.say('(click) outer', e); }
  onInner(e: Event) {
    this.say('(click) inner', e);
    if (flags.stop) { e.stopPropagation(); note('listener', 'inner で stopPropagation() を呼んだ'); }
  }
  onLoad(e: Event) { this.say('(load) img', e); }
  onLate(e: Event) { this.say('(click) late', e); }
}

const DOC = '<html><head></head><body><script type="text/javascript" id="ng-event-dispatch-contract"></script><app-root></app-root></body></html>';
const jsactionElements = (doc: Document) =>
  Array.from(doc.querySelectorAll('[jsaction]')).map((el) => `${tag(el)} jsaction="${el.getAttribute('jsaction')}"`);
const stashed = (doc: Document) =>
  ['outer', 'inner', 'pic'].map((id) => {
    const el: any = doc.getElementById(id);
    const m: Map<string, Function[]> | undefined = el?.__jsaction_fns;
    if (!m) return `${tag(el)}: __jsaction_fns なし`;
    return `${tag(el)}: ` + [...m.entries()].map(([k, fns]) => `${k} → [${fns.map((f: any) => `${f.name}（__ngNativeEl__ = ${tag(f.__ngNativeEl__)}）`).join(', ')}]`).join('; ');
  });
// domino の MouseEvent は init の辞書を読まないので、defer-hydrate-events の記録と同じく CustomEvent を使う（環境の代わり）。
const click = (doc: Document, id: string) => doc.getElementById(id)!.dispatchEvent(new g.CustomEvent('click', { bubbles: true, cancelable: true }));

interface Opts { early?: string[]; afterHydrate?: string[]; afterStable?: string[]; stop?: boolean; pending?: boolean; destroyBeforeStable?: boolean; nullEvent?: boolean; late?: boolean }

async function scenario(id: string, title: string, o: Opts) {
  log = []; seq = 0;
  flags.stop = !!o.stop; flags.pending = !!o.pending; removeTask = null;
  (App as any).ɵcmp.tView = null;
  g.ngServerMode = true;
  note('phase', 'サーバーで描画する（renderServer）');
  const html = await renderServer(App, { providers: [provideClientHydration(withEventReplay())], html: DOC });
  // ブラウザの側は CLI がブラウザ用の束に入れる define（ngServerMode: false）と同じにする。
  g.ngServerMode = false;
  (App as any).ɵcmp.tView = null;
  const bootstrapLine = /window\.__jsaction_bootstrap\([^<]*\);/.exec(html)?.[0] ?? null;

  // ブラウザの側。domino は <script> を実行しないので、契約のスクリプトと 1 行を eval で代わりにする（環境の代わり）。
  const doc = installDom(html);
  const serverJsaction = jsactionElements(doc);
  (0, eval)(readFileSync(`${SITE}/node_modules/@angular/core/event-dispatch-contract.min.js`, 'utf8'));
  if (bootstrapLine) (0, eval)(bootstrapLine);
  // あとで q を数えるため、Angular が _ejsas.ng を消す前に早期の箱を持っておく（記録のためだけ）。
  const early = g._ejsas?.ng;
  const q = () => (early?.q ?? []).map((e: any) => `${e.eventType} on ${tag(e.targetElement)}`);
  const steps: any[] = [];
  const snap = (sid: string, stitle: string, action: string, extra: Record<string, unknown> = {}) => {
    steps.push({
      id: sid, title: stitle, action,
      jsaction: jsactionElements(doc),
      stash: stashed(doc),
      ejsas: g._ejsas?.ng === undefined ? 'undefined' : `あり（q ${g._ejsas.ng.q.length} 件）`,
      earlyQ: q(),
      ...extra,
      log: log.splice(0),
    });
  };
  for (const what of o.early ?? []) {
    if (what === 'load') doc.getElementById('pic')!.dispatchEvent(new g.CustomEvent('load', { bubbles: false }));
    else click(doc, what);
    note('test', `JS の前に ${what === 'load' ? 'img#pic で load（bubbles: false）' : `${what} で click`}`);
  }
  snap('early', 'JS の前', (o.early ?? []).length ? `JS の前に ${(o.early ?? []).join('・')}` : '何もしない');

  note('phase', 'ブラウザで起動する（bootstrapApplication）');
  const appRef = await bootstrapApplication(App, { providers: [provideZonelessChangeDetection(), provideClientHydration(withEventReplay())] });
  const contract = appRef.injector.get(JSACTION_EVENT_CONTRACT);
  const blockMap: Map<string, Set<Element>> = appRef.injector.get(JSACTION_BLOCK_ELEMENT_MAP);
  const extra = () => ({
    contractEvents: contract.instance ? Object.keys((contract.instance as any).eventHandlers) : null,
    blockMap: [...blockMap.entries()].map(([k, set]) => `'${k}' → ${[...set].map((el) => tag(el) + (el.isConnected ? '' : '（DOM から外れている）')).join(', ')}`),
  });
  snap('hydrated', 'bootstrapApplication が返った直後', 'await bootstrapApplication(...)', extra());

  for (const what of o.afterHydrate ?? []) { click(doc, what); note('test', `ハイドレーションの後（安定の前）に ${what} で click`); }
  if ((o.afterHydrate ?? []).length) snap('afterHydrate', '安定の前に押した直後（同期）', `${(o.afterHydrate ?? []).join('・')} で click`, extra());

  if (o.destroyBeforeStable) {
    note('test', '安定の前に appRef.destroy()');
    appRef.destroy();
    await tick(0);
    snap('destroyed', '安定の前に壊した', 'appRef.destroy() → setTimeout(0)', extra());
    return { id, title, bootstrapLine, serverJsaction, steps };
  }
  if (removeTask) { note('test', 'PendingTasks を戻す（removeTask()）'); (removeTask as () => void)(); }
  await appRef.whenStable();
  await tick(0);
  snap('stable', '安定まで待った', 'await appRef.whenStable() → setTimeout(0)', extra());

  for (const what of o.afterStable ?? []) { click(doc, what); note('test', `安定の後に ${what} で click`); }
  if ((o.afterStable ?? []).length) snap('afterStable', '安定の後に押した', `${(o.afterStable ?? []).join('・')} で click`, extra());

  if (o.late) {
    const root = appRef.components[0].instance as App;
    root.show.set(true); appRef.tick();
    note('test', '安定の後に show.set(true) → appRef.tick()（@if の中に (click) のある button#late を作る）');
    const late: any = doc.getElementById('late');
    note('test', `button#late の __jsaction_fns: ${late?.__jsaction_fns ? [...late.__jsaction_fns.keys()].join(', ') : 'なし'}`);
    snap('lateOn', '安定の後に要素を作った', 'show.set(true) → appRef.tick()', extra());
    root.show.set(false); appRef.tick();
    note('test', 'show.set(false) → appRef.tick()（button#late を消す）');
    snap('lateOff', '作った要素を消した', 'show.set(false) → appRef.tick()', extra());
  }
  if (o.nullEvent) {
    const dbg = getDebugNode(doc.getElementById('inner'))!;
    try {
      (dbg as any).triggerEventHandler('click', null);
      note('test', "DebugElement.triggerEventHandler('click', null) は例外なく戻った");
    } catch (e) {
      note('test', `triggerEventHandler が例外: ${(e as Error).message}`);
    }
    snap('nullEvent', 'イベントでない値で呼ぶ', "getDebugNode(inner).triggerEventHandler('click', null)", extra());
  }
  appRef.destroy();
  await tick(0);
  snap('destroy', 'アプリを壊した', 'appRef.destroy() → setTimeout(0)', extra());
  return { id, title, bootstrapLine, serverJsaction, steps };
}

const scenarios = [];
scenarios.push(await scenario('early', 'JS の前に inner を押す', { early: ['inner'] }));
scenarios.push(await scenario('stop', 'JS の前に押す・inner が stopPropagation', { early: ['inner'], stop: true }));
scenarios.push(await scenario('before-stable', 'ハイドレーションの後・安定の前に押す（d5fd51e9569）', { afterHydrate: ['inner'], pending: true }));
scenarios.push(await scenario('after-stable', '安定の後に押す（#71518）', { afterStable: ['inner', 'outer'] }));
scenarios.push(await scenario('load', 'JS の前に img の load（#59260）', { early: ['load'] }));
scenarios.push(await scenario('destroy', '安定の前に壊す（30e9c62bdfb）', { early: ['inner'], pending: true, destroyBeforeStable: true }));
scenarios.push(await scenario('late', '安定の後に作って消した要素（#66506）', { late: true }));
scenarios.push(await scenario('null', 'イベントでない値（3583c01bf9a）', { nullEvent: true }));
await writeJson(OUT, { core: VERSION.full, template: TEMPLATE, scenarios });
process.exit(0);

```

## ここまでの呼び出し

- `serializeLView` → `setJSActionAttributes` — hydration/annotate.ts 734 — *サーバー。1 節*
- `listenToDomEvent` — render3/view/listeners.ts 172・179・181 — *ハイドレーション中。預ける・\_\_ngNativeEl\_\_ を貼る・本物を付ける*
  - `_stashEventListenerImpl` — event\_delegation\_utils.ts 169 — *使わないアプリでは空の関数*
- 👤 `ユーザーの click（安定の前）` — 要素のリスナーと &lt;body&gt; の箱
  - `wrapListenerIn_markDirtyAndPreventDefault` → `markEventHandledForElement` — listeners.ts 57〜59・event\_delegation\_utils.ts 111
- `APP_BOOTSTRAP_LISTENER` → `appRef.whenStable()` — event\_replay.ts 133・163 — *2 節の守り*
  - `initEventReplay` — event\_replay.ts 204〜223 — *removeAllAppScopedEventListeners は呼ばない（#71518）*
    - `EventDispatcher.dispatchToDelegate` → `invokeRegisteredReplayListeners` → `invokeListeners` — event\_dispatcher.ts 82・event\_replay.ts 275・event\_delegation\_utils.ts 123
      - `handledEventElements.get(event)?.has(currentTarget)` — event\_delegation\_utils.ts 128 — *本物が配っていれば呼ばない*
- `appRef.onDestroy` → `clearAppScopedEarlyEventContract` — event\_replay.ts 149・156

## テストと直し方

### spec と describe

| spec（packages/platform-server/test/event\_replay\_spec.ts） | describe / it | この章のどこ |
| --- | --- | --- |
| 94 行目 | it `should not replay an event that was already handled by a real DOM listener after component hydration`（d5fd51e9569 が足した） | 4 節 |
| 223 行目 | it ``should cleanup `window._ejsas[appId]` once app is destroyed`` | 2 節 |
| 752 行目 | describe `event replay queue` の 4 件（30e9c62bdfb が足した） | 5 節 |
| 537 行目 | describe `bubbling behavior` の 3 件 | 6 節の記録の stop の場面・第 10 回 |

📄 `angular/packages/platform-server/test/event_replay_spec.ts` L113–138 （▶ の行: 120–121, 125, 128, 131–132, 137）

```ts
113 │     const ssrContents = getAppContents(html);
114 │     const doc = getDocument();
115 │ 
116 │     prepareEnvironment(doc, ssrContents);
117 │     resetTViewsFor(AppComponent);
118 │ 
119 │     // Hydrate the component (registers real DOM listeners) but keep app unstable
120 ▶     const appRef = await hydrate(doc, AppComponent, {hydrationFeatures});
121 ▶     appRef.tick();
122 │ 
123 │     // Click AFTER hydration: real DOM listener fires once, jsaction also queues it
124 │     const btn = doc.getElementById('btn')!;
125 ▶     btn.click();
126 │ 
127 │     // Real DOM listener should have fired once
128 ▶     expect(onClickSpy).toHaveBeenCalledTimes(1);
129 │ 
130 │     // Let the app become stable — triggers whenStable() which kicks off jsaction replay
131 ▶     removeTask!();
132 ▶     await appRef.whenStable();
133 │     appRef.tick();
134 │ 
135 │     // Without the fix, jsaction replay fires the handler a second time (count = 2).
136 │     // With the fix, the post-hydration event must not be replayed again (count = 1).
137 ▶     expect(onClickSpy).toHaveBeenCalledTimes(1);
138 │   });
```

記録の before-stable の場面と同じ順です。コンポーネントの constructor で `PendingTasks` を 1 つ足して安定を止め、120 行目でハイドレートし、125 行目で押し、128 行目で本物のリスナーの 1 回を確かめます。131〜132 行目で安定させたあと、137 行目で 1 回のままであることを確かめます。135〜136 行目のコメントのとおり、修正の前はここが 2 回でした。

📄 `angular/packages/platform-server/test/event_replay_spec.ts` L240–259 （▶ の行: 241, 243, 253–255, 259）

```ts
240 │     const btn = doc.getElementById('btn')!;
241 ▶     btn.click();
242 │ 
243 ▶     const appRef = await hydrate(doc, AppComponent, {hydrationFeatures});
244 │     appRef.tick();
245 │     const appId = appRef.injector.get(APP_ID);
246 │ 
247 │     // Important: This is done intentionally because `ApplicationRef` registers
248 │     // `onDestroy` callbacks, and we want to ensure that they execute successfully
249 │     // without resulting in any errors. This is necessary because the bodies of
250 │     // these `onDestroy` callbacks use the `ngServerMode` variable.
251 │     // Prior to setting this flag, the unit test was throwing a "destroyed injector"
252 │     // error — but we weren't capturing it because we hadn't explicitly set the flag to false.
253 ▶     globalThis['ngServerMode'] = false;
254 ▶     appRef.destroy();
255 ▶     globalThis['ngServerMode'] = undefined;
256 │ 
257 │     // This ensure that `_ejsas` for the current application is cleaned up
258 │     // once the application is destroyed.
259 ▶     expect(window._ejsas![appId]).toBeUndefined();
```

2 節の注意の 253 行目です。247〜252 行目のコメントは、`ngServerMode` を偽にする前は `onDestroy` の中で「壊れたインジェクタ」のエラーが出ていたのに、捕まえていなかったと書いています。

📄 `angular/packages/platform-server/test/event_replay_spec.ts` L876–893 （▶ の行: 882, 886, 889, 893）

```ts
876 │         appRef = await hydrate(doc, SimpleComponent, {
877 │           hydrationFeatures,
878 │           envProviders: providers,
879 │         });
880 │ 
881 │         // Access queue to make sure it exists
882 ▶         const queue = appRef.injector.get(EVENT_REPLAY_QUEUE);
883 │         expect(queue).toBeInstanceOf(Array);
884 │ 
885 │         // Simulate event in queue
886 ▶         queue.push({event: new Event('click'), currentTarget: doc.createElement('div')});
887 │         expect(queue.length).toBe(1);
888 │ 
889 ▶         appRef.destroy();
890 │       }
891 │ 
892 │       // Verify global cleanup
893 ▶       expect(window._ejsas![appId]).toBeUndefined();
```

30e9c62bdfb が足した it の 1 つです。886 行目で列に 1 件積んでから 889 行目で壊し、893 行目で `window._ejsas[appId]` が `undefined` であることを確かめます。ただし、この it は壊す前に `ngServerMode` を偽にしていないので、2 節の 156 行目は走りません。そして記録の early の場面では、`bootstrapApplication` が返った時点で、安定のときの `initEventReplay`（5 節の 219 行目）が `window._ejsas.ng` をもう `undefined` にしていました。893 行目の確かめは、壊す前からもう満たされている形です。列（`EVENT_REPLAY_QUEUE`）が手放されたかは確かめていません。手元で確かめるなら、889 行目の前に同じ `expect` を置いて通るかを見ます。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/platform-server/test:event_replay_test \
  '--test_arg=--filter=already handled by a real DOM listener|cleanup `window._ejsas|event replay queue' \
  --nocache_test_results --test_output=all
```

📄 `出力（2026-11-06 に実行。抜粋。ログは scratchpad/jsa-logs/d-angular-filter.log）`

```
Ran 6 of 23 specs
6 specs, 0 failures
INFO: Elapsed time: 1.520s
//packages/platform-server/test:event_replay_test   PASSED in 0.7s
```

- このターゲットは Node の Jasmine なので、`--test_arg=--filter=…`（正規表現）が効きます。94 行目の 1 件・223 行目の 1 件・752 行目の describe の 4 件で 6 件でした。0 件一致でも PASSED になるので、「Ran N of 23 specs」を見ます。
- ターゲットの全体（23 件）は 1.1 秒でした（d-all.log）。

### 直すとしたら

- #71518（早期の箱のリスナー）：入口は event\_replay.ts の `initEventReplay`（217〜219 行目のあたり）と、2 節の `onDestroy`（149〜158 行目）です。spec は、event\_replay\_spec.ts に「安定のあとに押しても早期の箱が増えない」it を足す形で、記録の after-stable の場面と同じ確かめになります。開いている PR #71519 があります。
- #66506（安定のあとの要素）：入口は event\_replay.ts の `ENVIRONMENT_INITIALIZER` の預け方（event-replay の章の 5 節の 112〜126 行目）と、3 節の預ける口です。記録の late の場面が、spec にするときの順です。
- #59260（`(load)` が 2 回）：本物のブラウザでの確かめが要ります。失敗する spec を足す PR #68131 は 2026-04-13 に閉じられ、直す PR #68178 は 2026-09-23 に作者が「The approach is wrong」と書いて閉じています。
- 本家に PR を出すことは勧めません。記録と同じ順で手元の spec を書き、issue の本文の説明が今の行と合っているかを確かめるところまでにします（[第 12 回](12-jsaction-tests-issues.md)の表）。

## 聞かれそうな質問

**Q. withEventReplay() を書いていないのに、このサイトで jsaction が付くのはなぜですか？**

core の `withIncrementalHydration()` が providers に `withEventReplay()` を入れるからです（incremental-hydration の章）。サーバーでは `IS_EVENT_REPLAY_ENABLED` が真になり、annotate.ts の 731〜734 行目で、DOM のリスナーのある要素に jsaction が付きます。

**Q. ハイドレーションの後・安定の前に押すと、リスナーは 2 回呼ばれませんか？**

呼ばれません。本物のリスナーとして呼ばれた包んだ関数が listeners.ts の 57〜59 行目で (イベント, 要素) に印を付け、安定のときの再生では event\_delegation\_utils.ts の 128 行目でその印を見て戻ります（d5fd51e9569）。記録の before-stable の場面でも 1 回ずつでした。

**Q. なぜ印を Event だけでなく要素ごとに付けるのですか？**

インクリメンタルハイドレーションでは、塊を起こしたイベントを、ハイドレーションのあとに塊の中の*別の要素*で渡し直すことがあるからです（109 行目の `WeakMap<Event, WeakSet<Element>>`、d5fd51e9569 のメッセージ）。Event だけで覚えると、その渡し直しまで止めてしまいます。

**Q. 3583c01bf9a は何を直したのですか？**

2 つです。イベントでない値（`null` など）で包んだ関数が呼ばれたときに `WeakMap` の鍵にしない守り（event\_delegation\_utils.ts 114 行目）と、`renderer.listen` に渡す関数を包んだ関数そのものに戻したこと（listeners.ts 178〜179 行目と 57〜59 行目）です。後者は `DebugElement.triggerEventHandler` の重複よけが関数の同一性に頼っているためです。

**Q. アプリを壊すと、イベントの再生が持っていたものは手放されますか？**

早期の箱は event\_replay.ts 156 行目で `window._ejsas[appId]` から外され、塊のイベントの列は tokens.ts 60〜65 行目のアプリごとのトークンなのでインジェクタと一緒に手放されます（30e9c62bdfb）。一方で、早期の箱が `<body>` に付けたリスナーは外されず（#71518）、安定のあとに作った要素は預け先の表に残ります（#66506）。どちらも開いています。

## 読み終えて

- サーバーは、再生が有効で、DOM のリスナーがある要素にだけ jsaction を付けます。このサイトも `withIncrementalHydration()` 経由でイベントの再生を使っています。
- ブラウザでは、アプリごとに 1 回だけ始め、壊れたら早期の箱を消します。預ける口は使わないアプリでは空の関数です。
- 安定の前に本物のリスナーが配ったイベントは、(イベント, 要素) の印で再生しません。印は包んだ関数そのものの中で付けます。
- 塊のイベントの列はアプリごとのトークンになりました。早期の箱のリスナーと、安定のあとに作った要素の預け先は、まだ残ります（#71518・#66506）。

---

← 前: [Dispatcher と EventDispatcher：渡し直しと stopPropagation の真似](10-jsaction-dispatcher.md)  
次: [spec と issue を読む：event-dispatch の今](12-jsaction-tests-issues.md) →
