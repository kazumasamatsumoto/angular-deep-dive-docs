[目次](../README.md) › [イベント配送（event-dispatch）と jsaction の内側](README.md) › 第 5 回 / 全 12 回

# 早期の契約：JS が来る前のイベントを貯める

> contract\_binary.ts を esbuild（event-dispatch/BUILD.bazel の contract\_bundle\_min）で束ねた 476 バイトの event-dispatch-contract.min.js と、platform-server がそれを消すか window.\_\_jsaction\_bootstrap(document.body, appId, 泡立つ種類, 捕獲の種類) の 1 行を足す行（packages/platform-server/src/utils.ts）。earlyeventcontract.ts・bootstrap\_app\_scoped.ts・bootstrap\_global.ts が window.\_ejsas\[appId\]・window.\_ejsa に貯め場所を置く行、アプリが起動したあとに取り出して片付ける関数と、Angular が &lt;body&gt; のリスナーを外さないこと（#71518）・registerAppScopedDispatcher が流れを変えないこと。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/jsaction-early-contract)

---

SSR のページでは、アプリの JS が届く前にユーザーがボタンを押すことがあります。そのイベントを失わないために、HTML の中に小さなスクリプトを置き、`<body>` でイベントを受けて配列に貯めておきます。これが**早期の契約**（early event contract）です。この章では、そのスクリプトがどこで作られ（`contract_binary.ts` と esbuild）、誰が HTML に入れ（CLI と platform-server）、ブラウザで `window._ejsas[appId]` に何を置き、アプリが起動したあとに誰が取り出して片付けるかを、行で 1 つずつ追います。最後に、このページの上で自分専用の `appId` の早期の契約を置き、貯まって、渡されて、片付くまでを動かします。

読む対象は `packages/core/primitives/event-dispatch/` の `contract_binary.ts`・`BUILD.bazel`・`src/earlyeventcontract.ts`・`src/bootstrap_app_scoped.ts`・`src/bootstrap_global.ts`、`src/eventcontract.ts` の `replayEarlyEvents`、`packages/core/BUILD.bazel` と `packages/platform-server/src/utils.ts` です。

1. [1. 全体像](01-jsaction-overview.md)
2. [2. jsaction 属性](02-jsaction-attribute.md)
3. [3. EventInfo](03-jsaction-event-info.md)
4. [4. イベントの種類](04-jsaction-event-types.md)
5. **5. 早期の契約**（この章）
6. [6. EventContract](06-jsaction-contract.md)
7. [7. 行き先を探す](07-jsaction-resolver.md)
8. [8. a11y の click](08-jsaction-a11y-click.md)
9. [9. mouseenter とタッチ](09-jsaction-mouse-touch.md)
10. [10. Dispatcher](10-jsaction-dispatcher.md)
11. [11. Angular の側](11-jsaction-angular.md)
12. [12. spec と issue](12-jsaction-tests-issues.md)

> [!NOTE]
> **ポイント**
>
> [event-replay の章](../platform/14-event-replay.md)の 3〜4 節で、HTML に入る 2 つのスクリプトの表と、`bootstrapAppScopedEarlyEventContract`（bootstrap\_app\_scoped.ts 19〜37 行目）・`createEarlyJsactionData`・`addEvents`（earlyeventcontract.ts 67〜106 行目）・`EarlyJsactionData` の 6 つの欄（23〜44 行目）を読みました。この章では、その前後（スクリプトの作り、差し込み、取り出しと片付け、もう 1 つの入口の `_ejsa`）を読みます。

## 1. 契約のスクリプトを作る：contract\_binary.ts から 476 バイトの min.js へ

📄 `angular/packages/core/primitives/event-dispatch/contract_binary.ts` L9–11 （▶ の行: 9, 11）

```ts
 9 ▶ import {bootstrapAppScopedEarlyEventContract} from './src/bootstrap_app_scoped';
10 │ 
11 ▶ (window as any)['__jsaction_bootstrap'] = bootstrapAppScopedEarlyEventContract;
```

入口のファイルは 2 行だけです。11 行目で `bootstrapAppScopedEarlyEventContract` を `window.__jsaction_bootstrap` に置きます。HTML の 1 行（2 節）はこの名前で呼びます。下の min.js でも、最後の `window.__jsaction_bootstrap=c` でこの名前が残っています。

📄 `angular/packages/core/primitives/event-dispatch/BUILD.bazel` L33–47 （▶ の行: 34, 40, 42–45）

```python
33 │ esbuild(
34 ▶     name = "contract_bundle_min",
35 │     config = {
36 │         "resolveExtensions": [
37 │             ".mjs",
38 │             ".js",
39 │         ],
40 ▶         "legalComments": "none",
41 │     },
42 ▶     entry_point = ":contract_binary.js",
43 ▶     format = "iife",
44 ▶     minify = True,
45 ▶     sourcemap = "external",
46 │     deps = [":event-dispatch"],
47 │ )
```

📄 `angular/packages/core/BUILD.bazel` L168–173 （▶ の行: 169–172）

```python
168 │ genrule(
169 ▶     name = "event_dispatch_contract_binary",
170 ▶     srcs = ["//packages/core/primitives/event-dispatch:contract_bundle_min.js"],
171 ▶     outs = ["event-dispatch-contract.min.js"],
172 ▶     cmd = "cp $< $@",
173 │ )
```

1. **event-dispatch/BUILD.bazel 42〜44 行目：esbuild で 1 つの即時関数に束ね、最小化する**

   入口は `contract_binary.js`（ts\_project が作る JS）、形は `iife`（読み込んだらその場で動く 1 つの関数）、`minify = True`。40 行目でライセンスのコメントも落とします。
2. **core/BUILD.bazel 169〜172 行目：できた `contract_bundle_min.js` を `event-dispatch-contract.min.js` の名前で写す**

   これが `@angular/core` のパッケージに入り、package.json の `exports` の `"./event-dispatch-contract.min.js"` から読めるようになります。CLI はビルドのときにこのファイルを読み、`<body>` の直後に `<script id="ng-event-dispatch-contract">` で包んで入れます（[ssr-overview の章](../platform/01-ssr-overview.md)の `addEventDispatchContract`）。

このサイトが入れている @angular/core 22.1.6 の実物です（476 バイト。記録のスクリプトがファイルを読んだもの）。

📄 `node_modules/@angular/core/event-dispatch-contract.min.js`

```js
(()=>{function p(t,n,r,o,e,i,f,m){return{eventType:t,event:n,targetElement:r,eic:o,timeStamp:e,eia:i,eirp:f,eiack:m}}function u(t){let n=[],r=e=>{n.push(e)};return{c:t,q:n,et:[],etc:[],d:r,h:e=>{r(p(e.type,e,e.target,t,Date.now()))}}}function s(t,n,r){for(let o=0;o<n.length;o++){let e=n[o];(r?t.etc:t.et).push(e),t.c.addEventListener(e,t.h,r)}}function c(t,n,r,o,e=window){let i=u(t);e._ejsas||(e._ejsas={}),e._ejsas[n]=i,s(i,r),s(i,o,!0)}window.__jsaction_bootstrap=c;})();
```

| min.js の名前 | 元の関数 | 元の場所 |
| --- | --- | --- |
| `p(t,n,r,o,e,i,f,m)` | `createEventInfoFromParameters` | event\_info.ts（[第 3 回](03-jsaction-event-info.md)） |
| `u(t)` | `createEarlyJsactionData` | earlyeventcontract.ts 68〜92 行目（event-replay の章の 4 節） |
| `s(t,n,r)` | `addEvents` | earlyeventcontract.ts 95〜106 行目（同じ） |
| `c(t,n,r,o,e=window)` | `bootstrapAppScopedEarlyEventContract` | bootstrap\_app\_scoped.ts 23〜37 行目（同じ） |

入っているのはこの 4 つだけです。`EventContract` も、3 節の `EarlyEventContract` クラスも、5 節の取り出しと片付けの関数も入っていません。入口（contract\_binary.ts）から辿れない関数は、束ねるときに落ちるからです（tree shaking）。HTML に毎回入る行なので、小さいことが大事です（eventcontract.ts の冒頭のコメントも「インラインにするので小さく保つ」と書いています）。

## 2. HTML に入れる：platform-server が消すか、1 行を足すか

📄 `angular/packages/platform-server/src/utils.ts` L36–44 （▶ の行: 37–38, 40, 44）

````ts
36 │ /**
37 ▶  * Event dispatch (JSAction) script is inlined into the HTML by the build
38 ▶  * process to avoid extra blocking request on a page. The script looks like this:
39 │  * ```html
40 ▶  * <script type="text/javascript" id="ng-event-dispatch-contract">...</script>
41 │  * ```
42 │  * This const represents the "id" attribute value.
43 │  */
44 ▶ export const EVENT_DISPATCH_SCRIPT_ID = 'ng-event-dispatch-contract';
````

📄 `angular/packages/platform-server/src/utils.ts` L76–90 （▶ の行: 80–81, 88–89）

```ts
76 │ /**
77 │  * Finds and returns inlined event dispatch script if it exists.
78 │  * See the `EVENT_DISPATCH_SCRIPT_ID` const docs for additional info.
79 │  */
80 ▶ function findEventDispatchScript(doc: Document) {
81 ▶   return doc.getElementById(EVENT_DISPATCH_SCRIPT_ID);
82 │ }
83 │ 
84 │ /**
85 │  * Removes inlined event dispatch script if it exists.
86 │  * See the `EVENT_DISPATCH_SCRIPT_ID` const docs for additional info.
87 │  */
88 ▶ function removeEventDispatchScript(doc: Document) {
89 ▶   findEventDispatchScript(doc)?.remove();
90 │ }
```

📄 `angular/packages/platform-server/src/utils.ts` L171–177 （▶ の行: 172–177）

```ts
171 │     const replayScriptContents =
172 ▶       `window.__jsaction_bootstrap(` +
173 ▶       `document.body,` +
174 ▶       `"${appId}",` +
175 ▶       `${JSON.stringify(Array.from(regular))},` +
176 ▶       `${JSON.stringify(Array.from(capture))}` +
177 ▶       `);`;
```

1. **44 行目：目印は `id="ng-event-dispatch-contract"`**

   37〜38 行目のとおり、スクリプトの中身はビルドが入れます。サーバーは中身を作らず、この id で見つけるだけです（80〜82 行目）。
2. **88〜90 行目：要らなければ消す**

   ハイドレーションが無効のときと、記録する種類が 1 つも無いときに、`prepareForHydration` がこれを呼びます（[ssr-render-application の章](../platform/02-ssr-render-application.md)の 95〜125 行目）。
3. **172〜177 行目：要るなら、呼び出しの 1 行を組み立てる**

   `window.__jsaction_bootstrap(document.body,"appId",[泡立つ種類],[捕獲の種類]);`。第 1 引数はいつも `document.body`、第 2 引数は `APP_ID`、第 3・4 引数はサーバーがテンプレートのリスナーから集めた種類（[第 4 回](04-jsaction-event-types.md)の `isEarlyEventType` と `isCaptureEventType` で分けたもの）です。この 1 行は契約のスクリプトのすぐ後ろに入ります（同じ章の 157〜186 行目）。

## 3. 貯め場所：window.\_ejsas\[appId\] と window.\_ejsa

📄 `angular/packages/core/primitives/event-dispatch/src/earlyeventcontract.ts` L9–21 （▶ の行: 11–13, 16–19）

```ts
 9 │ import {createEventInfoFromParameters, EventInfo} from './event_info';
10 │ 
11 ▶ export declare interface EarlyJsactionDataContainer {
12 ▶   _ejsa?: EarlyJsactionData;
13 ▶   _ejsas?: {[appId: string]: EarlyJsactionData | undefined};
14 │ }
15 │ 
16 ▶ declare global {
17 ▶   interface Window {
18 ▶     _ejsa?: EarlyJsactionData;
19 ▶     _ejsas?: {[appId: string]: EarlyJsactionData | undefined};
20 │   }
21 │ }
```

貯め場所は 2 種類あります。12 行目の `_ejsa` は 1 ページに 1 つ、13 行目の `_ejsas` は `appId` ごとに 1 つです。11〜14 行目の `EarlyJsactionDataContainer` は「どちらかを持つ入れ物」の型で、ふつうは `window` ですが、テストでは普通のオブジェクトを渡せます（下の spec の 436 行目）。16〜21 行目で `Window` の型にも足しています。

📄 `angular/packages/core/primitives/event-dispatch/src/earlyeventcontract.ts` L69–75 （▶ の行: 69–71, 73–74）

```ts
69 ▶   const q: EventInfo[] = [];
70 ▶   const d = (eventInfo: EventInfo) => {
71 ▶     q.push(eventInfo);
72 │   };
73 ▶   const h = (event: Event) => {
74 ▶     d(
75 │       createEventInfoFromParameters(
```

📄 `angular/packages/core/primitives/event-dispatch/src/earlyeventcontract.ts` L34–40 （▶ の行: 36–37, 39–40）

```ts
34 │   h: (event: Event) => void;
35 │ 
36 ▶   /** Dispatcher handler. Initializes to populating `q`. */
37 ▶   d: (eventInfo: EventInfo) => void;
38 │ 
39 ▶   /** List used to push `EventInfo` objects if the dispatcher is not registered. */
40 ▶   q: EventInfo[];
```

`createEarlyJsactionData` の中身は event-replay の章の 4 節で読みました。ここで見ておきたいのは 73〜74 行目です。リスナーの `h` は、70 行目の**局所の変数**`d` を呼び、`d` は 69 行目の配列 `q` に積みます。36〜37 行目のコメントは「`d` は dispatcher で、最初は `q` に積む」と書いていて、あとで差し替えられる欄のように読めます。この食い違いが 5 節の 121 行目で効いてきます。

### もう 1 つの入口：EarlyEventContract と bootstrapGlobal

📄 `angular/packages/core/primitives/event-dispatch/src/earlyeventcontract.ts` L46–65 （▶ の行: 53–54, 56, 62–63）

```ts
46 │ /**
47 │  * EarlyEventContract intercepts events in the bubbling phase at the
48 │  * boundary of the document body. This mapping will be passed to the
49 │  * late-loaded EventContract.
50 │  */
51 │ export class EarlyEventContract {
52 │   constructor(
53 ▶     private readonly dataContainer: EarlyJsactionDataContainer = window,
54 ▶     container = window.document.documentElement,
55 │   ) {
56 ▶     dataContainer._ejsa = createEarlyJsactionData(container);
57 │   }
58 │ 
59 │   /**
60 │    * Installs a list of event types for container .
61 │    */
62 ▶   addEvents(types: string[], capture?: boolean) {
63 ▶     addEvents(this.dataContainer._ejsa!, types, capture);
64 │   }
65 │ }
```

📄 `angular/packages/core/primitives/event-dispatch/src/bootstrap_global.ts` L18–47 （▶ の行: 19, 23, 26, 31, 36, 41, 46）

```ts
18 │ /** Creates an `EarlyJsactionData`, adds events to it, and populates it on the window. */
19 ▶ export function bootstrapGlobalEarlyEventContract(
20 │   bubbleEventTypes: string[],
21 │   captureEventTypes: string[],
22 │ ) {
23 ▶   const earlyJsactionData = createEarlyJsactionData(window.document.documentElement);
24 │   addEvents(earlyJsactionData, bubbleEventTypes);
25 │   addEvents(earlyJsactionData, captureEventTypes, /* capture= */ true);
26 ▶   window._ejsa = earlyJsactionData;
27 │ }
28 │ 
29 │ /** Get the queued `EventInfo` objects that were dispatched before a dispatcher was registered. */
30 │ export function getGlobalQueuedEventInfos() {
31 ▶   return getQueuedEventInfos(window._ejsa);
32 │ }
33 │ 
34 │ /** Registers a dispatcher function on the `EarlyJsactionData` present on the window. */
35 │ export function registerGlobalDispatcher(dispatcher: (eventInfo: EventInfo) => void) {
36 ▶   registerDispatcher(window._ejsa, dispatcher);
37 │ }
38 │ 
39 │ /** Removes all event listener handlers. */
40 │ export function removeAllGlobalEventListeners() {
41 ▶   removeAllEventListeners(window._ejsa);
42 │ }
43 │ 
44 │ /** Removes the global early event contract. */
45 │ export function clearGlobalEarlyEventContract() {
46 ▶   window._ejsa = undefined;
47 │ }
```

|   | appId ごと（Angular が使う） | ページに 1 つ |
| --- | --- | --- |
| 置く関数 | `bootstrapAppScopedEarlyEventContract`（= `__jsaction_bootstrap`） | `bootstrapGlobalEarlyEventContract`（bootstrap\_global.ts 19 行目）・`new EarlyEventContract()`（earlyeventcontract.ts 51 行目） |
| 置き場所 | `window._ejsas[appId]` | `window._ejsa`（26 行目・56 行目） |
| リスナーを付ける要素 | 呼ぶ人が渡す（Angular は `document.body`） | `document.documentElement`（23 行目・54 行目） |
| 取り出し・片付け | 5 節の bootstrap\_app\_scoped.ts 39〜76 行目 | bootstrap\_global.ts 30〜47 行目と、`EventContract.replayEarlyEvents`（5 節） |
| 入口から import できるか | できる（index.ts が出している） | できない（index.ts に無い） |

`_ejsa` の側は Angular の中からは使われていません（`grep` すると、event-dispatch の src の外では eventcontract\_test.ts だけです）。1 ページに複数のアプリ（たとえば別々の `APP_ID` の 2 つ）があっても混ざらないように、Angular は `_ejsas[appId]` の側を使います。

## 4. JS が届く前：貯まるだけ

1 行が動くと、`<body>` に種類ごとに 1 つの `h` が付きます（event-replay の章の 4 節の 104 行目）。`h` がするのは `EventInfo` を作って `q` に積むことだけで、jsaction 属性も読まず、`preventDefault()` もしません。だから JS が届く前の `<a href>` のクリックは、そのままブラウザの遷移になります。捕獲の種類（`etc`）は捕獲の段で付くので、focus も積まれます（[第 4 回](04-jsaction-event-types.md)）。

## 5. アプリの起動後：取り出し、渡し、片付ける

📄 `angular/packages/core/primitives/event-dispatch/src/bootstrap_app_scoped.ts` L39–57 （▶ の行: 40, 44, 51, 56）

```ts
39 │ /** Get the queued `EventInfo` objects that were dispatched before a dispatcher was registered. */
40 ▶ export function getAppScopedQueuedEventInfos(
41 │   appId: string,
42 │   dataContainer: EarlyJsactionDataContainer = window,
43 │ ) {
44 ▶   return getQueuedEventInfos(dataContainer._ejsas?.[appId]);
45 │ }
46 │ 
47 │ /**
48 │  * Registers a dispatcher function on the `EarlyJsactionData` present on the nested object on the
49 │  * window.
50 │  */
51 ▶ export function registerAppScopedDispatcher(
52 │   appId: string,
53 │   dispatcher: (eventInfo: EventInfo) => void,
54 │   dataContainer: EarlyJsactionDataContainer = window,
55 │ ) {
56 ▶   registerDispatcher(dataContainer._ejsas?.[appId], dispatcher);
57 │ }
```

📄 `angular/packages/core/primitives/event-dispatch/src/earlyeventcontract.ts` L108–122 （▶ の行: 109–110, 114, 118, 121）

```ts
108 │ /** Get the queued `EventInfo` objects that were dispatched before a dispatcher was registered. */
109 ▶ export function getQueuedEventInfos(earlyJsactionData: EarlyJsactionData | undefined) {
110 ▶   return earlyJsactionData?.q ?? [];
111 │ }
112 │ 
113 │ /** Register a different dispatcher function on the `EarlyJsactionData`. */
114 ▶ export function registerDispatcher(
115 │   earlyJsactionData: EarlyJsactionData | undefined,
116 │   dispatcher: (eventInfo: EventInfo) => void,
117 │ ) {
118 ▶   if (!earlyJsactionData) {
119 │     return;
120 │   }
121 ▶   earlyJsactionData.d = dispatcher;
122 │ }
```

📄 `angular/packages/core/primitives/event-dispatch/src/bootstrap_app_scoped.ts` L59–76 （▶ の行: 60, 64, 68, 72, 75）

```ts
59 │ /** Removes all event listener handlers. */
60 ▶ export function removeAllAppScopedEventListeners(
61 │   appId: string,
62 │   dataContainer: EarlyJsactionDataContainer = window,
63 │ ) {
64 ▶   removeAllEventListeners(dataContainer._ejsas?.[appId]);
65 │ }
66 │ 
67 │ /** Clear the early event contract. */
68 ▶ export function clearAppScopedEarlyEventContract(
69 │   appId: string,
70 │   dataContainer: EarlyJsactionDataContainer = window,
71 │ ) {
72 ▶   if (!dataContainer._ejsas) {
73 │     return;
74 │   }
75 ▶   dataContainer._ejsas[appId] = undefined;
76 │ }
```

📄 `angular/packages/core/primitives/event-dispatch/src/earlyeventcontract.ts` L124–145 （▶ の行: 125, 129–130, 140）

```ts
124 │ /** Removes all event listener handlers. */
125 ▶ export function removeAllEventListeners(earlyJsactionData: EarlyJsactionData | undefined) {
126 │   if (!earlyJsactionData) {
127 │     return;
128 │   }
129 ▶   removeEventListeners(earlyJsactionData.c, earlyJsactionData.et, earlyJsactionData.h);
130 ▶   removeEventListeners(earlyJsactionData.c, earlyJsactionData.etc, earlyJsactionData.h, true);
131 │ }
132 │ 
133 │ function removeEventListeners(
134 │   container: HTMLElement,
135 │   eventTypes: string[],
136 │   earlyEventHandler: (e: Event) => void,
137 │   capture?: boolean,
138 │ ) {
139 │   for (let i = 0; i < eventTypes.length; i++) {
140 ▶     container.removeEventListener(eventTypes[i], earlyEventHandler, /* useCapture */ capture);
141 │   }
142 │ }
143 │ 
144 │ // This fixes the RollupError: Exported variable "global" is not defined.
145 │ export {};
```

1. **bootstrap\_app\_scoped.ts 44 行目 → earlyeventcontract.ts 110 行目：取り出すのは q そのもの**

   写しではなく同じ配列です。`_ejsas[appId]` が無ければ空の配列を返します。
2. **bootstrap\_app\_scoped.ts 75 行目：消すのは置き場所の欄だけ**

   `_ejsas[appId] = undefined` にします。鍵は残り、`<body>` の `h` も外しません。
3. **bootstrap\_app\_scoped.ts 64 行目 → earlyeventcontract.ts 129〜130 行目：リスナーを外すのは別の関数**

   `et` の種類は泡立ちの段、`etc` の種類は捕獲の段（140 行目の第 3 引数）で外します。付けたときと同じ段で外さないと、ブラウザは別のリスナーとみなして外しません。64 行目は `_ejsas?.[appId]` から引くので、75 行目で消したあとに呼ぶと、何も外せません。

Angular の `initEventReplay` は、安定したあとに「`getAppScopedQueuedEventInfos` → `eventContract.replayEarlyEventInfos` → `clearAppScopedEarlyEventContract`」の順で呼びます（[event-replay の章](../platform/14-event-replay.md)の 6 節の 217〜219 行目）。**`removeAllAppScopedEventListeners` は呼びません**（`grep` すると、packages の中で呼んでいる所はありません）。比べるために、`_ejsa` の側の取り出しを見ます。

📄 `angular/packages/core/primitives/event-dispatch/src/eventcontract.ts` L187–205 （▶ の行: 192, 195, 200, 203–204）

```ts
187 │   /**
188 │    * Gets the queued early events and replay them using the appropriate handler
189 │    * in the provided event contract. Once all the events are replayed, it cleans
190 │    * up the early contract.
191 │    */
192 ▶   replayEarlyEvents(earlyJsactionData: EarlyJsactionData | undefined = window._ejsa) {
193 │     // Check if the early contract is present and prevent calling this function
194 │     // more than once.
195 ▶     if (!earlyJsactionData) {
196 │       return;
197 │     }
198 │ 
199 │     // Replay the early contract events.
200 ▶     this.replayEarlyEventInfos(earlyJsactionData.q);
201 │ 
202 │     // Clean up the early contract.
203 ▶     removeAllEventListeners(earlyJsactionData);
204 ▶     delete window._ejsa;
205 │   }
```

`EventContract.replayEarlyEvents` は、200 行目で渡したあと、203 行目でリスナーを外し、204 行目で `_ejsa` を消します。`_ejsas` の側では、Angular がこの 203 行目にあたる処理を飛ばしているので、ハイドレーションのあとも `<body>` の `h` が残り、クリックのたびに、もう誰も読まない `q` にイベントと要素が積まれ続けます。これは開いている issue #71518（2026-10-21、Event replay: early event contract listeners on &lt;body&gt; are never removed after hydration）が報告している形で、下の DEMO で確かめられます。

もう 1 つ、114〜122 行目の `registerDispatcher`（`registerAppScopedDispatcher` の中身）は、121 行目で `earlyJsactionData.d` の欄を差し替えます。ところが 3 節の 74 行目の `h` が呼ぶのは 70 行目の局所の `d` で、この欄ではありません。**差し替えても、イベントは `q` に積まれ続け、渡した関数は呼ばれません**。Angular はこの関数を呼ばないので、Angular のアプリには影響しません。DEMO の段 2 で確かめられます。

## 6. このサイトの本番の HTML

このサイトは `provideClientHydration(withIncrementalHydration())` を使っていて、`withIncrementalHydration` はイベントの記録と再生も有効にします。本番ビルド（2026-11-06 に作ったもの）の HTML を記録のスクリプトで読んだ結果です。

| ページ | #ng-event-dispatch-contract | 中身が min.js と同じ | \_\_jsaction\_bootstrap の 1 行 |
| --- | --- | --- | --- |
| `index.html` | あり | はい | `window.__jsaction_bootstrap(document.body,"ng",["click"],[]);` |
| `chapter/jsaction-early-contract/index.html` | あり | はい | `window.__jsaction_bootstrap(document.body,"ng",["click","change"],[]);` |
| `chapter/jsaction-event-types/index.html` | あり | はい | `window.__jsaction_bootstrap(document.body,"ng",["click","change"],[]);` |
| `chapter/jsaction-contract/index.html` | あり | はい | `window.__jsaction_bootstrap(document.body,"ng",["click"],[]);` |
| `series/jsaction/index.html` | あり | はい | `window.__jsaction_bootstrap(document.body,"ng",["click","change","input"],[]);` |

この章のページの第 3 引数が `["click","change"]` なのは、テンプレートに `(click)` のボタンと、DEMO のチェックボックスの `(change)` があるからです（DEMO の部品は `@if` の中ではないので、プリレンダーの HTML にも描かれ、サーバーがそのリスナーを集めます）。チェックボックスの無い[第 6 回](06-jsaction-contract.md)のページは `["click"]` だけです。捕獲の種類（第 4 引数）はどのページも空でした。ハイドレーションが済むと、`window._ejsas.ng` は `undefined` になります（DEMO を始めたときの「このページの window.\_ejsas」の表で見えます）。インクリメンタルハイドレーションが有効なので、Angular が `<body>` に作った本物の `EventContract` はアプリが終わるまで残ります（[defer-hydrate-events の章](../defer/18-defer-hydrate-events.md)の 1 節）。そして 5 節のとおり、早期の契約の `h` も残っています。

## 7. DEMO：自分専用の appId で、貯まる・渡される・片付く（ライブ）

> **🧪 DEMO — window.\_ejsas\['jsa-demo-early-contract'\] の早期の契約**
>
> これはライブです。このページが読み込んだ本物の `@angular/core/primitives/event-dispatch` の関数を、ボタンを押したときだけ呼びます。このページ自身の `window._ejsas.ng` には触らず、デモ専用の `appId`（`jsa-demo-early-contract`）で、下の点線の箱に早期の契約を置きます（HTML の 1 行の代わりに、同じ関数を直接呼びます）。段 3 は Angular の `initEventReplay` と同じ順です。片付けでは、`clear` のあとでは `window._ejsas` から引けないので、控えておいた中身を `removeAllAppScopedEventListeners` の第 2 引数（`dataContainer`）で渡して外し、デモが足した鍵も消します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/jsaction-early-contract)

ヘッドレスの Chrome（本番ビルド）で、CDP の `Input` で本物のクリックとキーを送って確かめた結果です。

1. **段 1 のあと：押すたびに q が伸びる**

   `window._ejsas` に `ng: undefined`（このページ自身。もう取り出し済み）と、デモの鍵が並びます。ボタンを押すと、クリックでボタンにフォーカスが移るので、`focus` と `click` の 2 件が積まれます（捕獲の種類も積まれる）。
2. **段 2：`data.d` は替わるが、渡した関数は 0 回**

   「替わった: true」「呼ばれた回数: 0」のまま、q だけが伸びます。5 節の 121 行目と 3 節の 74 行目の食い違いです。
3. **段 3：q の分が EventContract の queuedEventInfos に移り、isReplay が true になる**

   `replayEarlyEventInfos` が 1 件ずつ複製して `handleEventInfo` に入れ、dispatcher がまだ無いので積まれます（[第 6 回](06-jsaction-contract.md)）。`window._ejsas` のデモの鍵は `undefined` になります。
4. **段 3 のあとに押すと：Angular の順では、もう読まれない q も伸びる**

   チェックを外した（Angular と同じ）ときは「clear のあとに q に増えた数」が押すたびに増えます。チェックを付けて `removeAllAppScopedEventListeners` を先に呼んだときは 0 のままです。新しいクリックは EventContract の queuedEventInfos にだけ積まれます。
5. **段 4：積んであった分が、積んだ順に dispatcher に届く**

   早期の契約の分（isReplay: true）が先に届き、queuedEventInfos は `null` になります。そのあとのクリックは、その場で届きます（isReplay: 無し）。
6. **段 5：何も残らない**

   `window._ejsas` にはこのページの `ng` だけが残り、箱をクリックしても q は伸びず（増えた数 0）、dispatcher にも届きません。

📄 `scratchpad/jsa-demo/b/collect-early.mjs（min.js と本番の HTML を読んで .data.ts に書く記録のスクリプト）`

```
// 使い方: node collect-early.mjs <サイトの本番ビルドの browser/ ディレクトリ>
// 1. node_modules/@angular/core/event-dispatch-contract.min.js の中身と大きさを読む
// 2. 本番ビルドの HTML（トップ・この章・シリーズの 1 ページ）から
//    <script id="ng-event-dispatch-contract"> の有無と、<script> の中の window.__jsaction_bootstrap(...) の 1 行を拾う
//    （本文の <code> の中の同じ文字列を拾わないように、<script> の中身だけを見る）
// 3. angular-deep-dive/src/app/pages/chapters/jsaction-early-contract.data.ts に書く
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SITE = '~/angular-research/angular-deep-dive';
const browserDir = process.argv[2];
const core = JSON.parse(readFileSync(join(SITE, 'node_modules/@angular/core/package.json'), 'utf8')).version;
const minPath = join(SITE, 'node_modules/@angular/core/event-dispatch-contract.min.js');
const minJs = readFileSync(minPath, 'utf8').trim();
const minBytes = readFileSync(minPath).length;

const pages = ['index.html', 'chapter/jsaction-early-contract/index.html', 'chapter/jsaction-event-types/index.html', 'chapter/jsaction-contract/index.html', 'series/jsaction/index.html'];
const html = [];
for (const p of pages) {
  const f = join(browserDir, p);
  if (!existsSync(f)) { html.push({ page: p, found: false, contract: false, bootstrap: null, sameAsMin: false }); continue; }
  const s = readFileSync(f, 'utf8');
  const m = s.match(/<script type="text\/javascript" id="ng-event-dispatch-contract">([\s\S]*?)<\/script>/);
  const b = s.match(/<script[^>]*>(window\.__jsaction_bootstrap\([^<]*\);?)<\/script>/);
  html.push({ page: p, found: true, contract: !!m, sameAsMin: !!m && m[1].trim() === minJs, bootstrap: b ? b[1] : null });
}

const RECORDED = { core, minBytes, minJs, html, at: new Date().toISOString().slice(0, 10) };
const SCRIPT = readFileSync(new URL(import.meta.url), 'utf8');
const out = `// 自動生成（scratchpad/jsa-demo/b/collect-early.mjs）。手で編集しない。\n` +
  `export const RECORDED = ${JSON.stringify(RECORDED, null, 2)} as const;\n\n` +
  `export const SCRIPT = ${JSON.stringify(SCRIPT)};\n`;
writeFileSync(join(SITE, 'src/app/pages/chapters/jsaction-early-contract.data.ts'), out);
console.log(JSON.stringify({ core, minBytes, html }, null, 2));

```

## ここまでの呼び出し

- `esbuild contract_bundle_min` → `genrule event_dispatch_contract_binary` — event-dispatch/BUILD.bazel 33・core/BUILD.bazel 168 — *Bazel のビルド*
- `addEventDispatchContract(html)` — @angular/build — *CLI のビルド。&lt;body&gt; の直後に入れる*
- `prepareForHydration` → `insertEventRecordScript` または `removeEventDispatchScript` — platform-server/src/utils.ts 95・157・88 — *サーバーの描画ごと*
- 👤 `window.__jsaction_bootstrap(document.body, "ng", [...], [...])` — HTML の 1 行
  - `bootstrapAppScopedEarlyEventContract` → `createEarlyJsactionData` → `addEvents` — bootstrap\_app\_scoped.ts 23・earlyeventcontract.ts 68・95
- 👤 `ユーザーのクリック（JS が届く前）` — &lt;body&gt; の h — *q に積むだけ（73〜74 行目）*
- `initEventReplay` — core/src/hydration/event\_replay.ts 204 — *アプリが安定したあと*
  - `getAppScopedQueuedEventInfos(appId)` → `getQueuedEventInfos` — bootstrap\_app\_scoped.ts 40・earlyeventcontract.ts 109
  - `eventContract.replayEarlyEventInfos(eventInfos)` — eventcontract.ts 211 — *第 6 回*
  - `clearAppScopedEarlyEventContract(appId)` — bootstrap\_app\_scoped.ts 68 — *欄を undefined にするだけ。h は残る（#71518）*

## テストと直し方

### spec と describe

| spec | describe / it | この章のどこ |
| --- | --- | --- |
| packages/core/primitives/event-dispatch/test/eventcontract\_test.ts | describe `EventContract` &gt; `early events`（395 行目）の it `early events are dispatched`（396）・`early capture events are dispatched`（433）・`early events are dispatched when target is cleared`（467）と、describe `non-bubbling mouse events`（507）の 2 つ | 3 節の `EarlyEventContract`（`_ejsa` の側）と、5 節の `replayEarlyEvents` |
| packages/platform-server/test/event\_replay\_spec.ts | describe `event dispatch script`（643 行目）の 5 つの it（ハイドレーションが無効・記録する種類が無い・mouseenter だけ・再生が無効・種類がある）と、it ``should cleanup `window._ejsas[appId]` once app is destroyed``（223 行目） | 2 節の消すか足すかと、5 節の `clearAppScopedEarlyEventContract` |

📄 `angular/packages/core/primitives/event-dispatch/test/eventcontract_test.ts` L396–431 （▶ の行: 404–405, 407, 409, 411, 421, 423–425）

```ts
396 │     it('early events are dispatched', () => {
397 │       const container = getRequiredElementById('click-container');
398 │       const targetElement = getRequiredElementById('click-target-element');
399 │ 
400 │       const removeEventListenerSpy = spyOn(
401 │         window.document.documentElement,
402 │         'removeEventListener',
403 │       ).and.callThrough();
404 ▶       const earlyEventContract = new EarlyEventContract();
405 ▶       earlyEventContract.addEvents(['click']);
406 │ 
407 ▶       const clickEvent = dispatchMouseEvent(targetElement);
408 │ 
409 ▶       const earlyJsactionData: EarlyJsactionData | undefined = window._ejsa;
410 │       expect(earlyJsactionData).toBeDefined();
411 ▶       expect(earlyJsactionData!.q.length).toBe(1);
412 │       expect(earlyJsactionData!.q[0].event).toBe(clickEvent);
413 │ 
414 │       const dispatcher = createDispatcherSpy();
415 │       const eventContract = createEventContract({
416 │         eventContractContainerManager: new EventContractContainer(container),
417 │         eventTypes: ['click'],
418 │         dispatcher,
419 │       });
420 │ 
421 ▶       eventContract.replayEarlyEvents();
422 │ 
423 ▶       expect(window._ejsa).toBeUndefined();
424 ▶       expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
425 ▶       expect(dispatcher).toHaveBeenCalledTimes(1);
426 │       const eventInfoWrapper = getLastDispatchedEventInfoWrapper(dispatcher);
427 │       expect(eventInfoWrapper.getEventType()).toBe('click');
428 │       expect(eventInfoWrapper.getEvent()).toBe(clickEvent);
429 │       expect(eventInfoWrapper.getTargetElement()).toBe(targetElement);
430 │       expect(eventInfoWrapper.getAction()).toBeUndefined();
431 │     });
```

📄 `angular/packages/core/primitives/event-dispatch/test/eventcontract_test.ts` L433–465 （▶ の行: 436, 439–440, 442, 447, 456, 458）

```ts
433 │     it('early capture events are dispatched', () => {
434 │       const container = getRequiredElementById('focus-container');
435 │       const targetElement = getRequiredElementById('focus-target-element');
436 ▶       const replaySink = {_ejsa: undefined};
437 │       const removeEventListenerSpy = spyOn(container, 'removeEventListener').and.callThrough();
438 │ 
439 ▶       const earlyEventContract = new EarlyEventContract(replaySink, container);
440 ▶       earlyEventContract.addEvents(['focus'], true);
441 │ 
442 ▶       targetElement.focus();
443 │ 
444 │       const earlyJsactionData: EarlyJsactionData | undefined = replaySink._ejsa;
445 │       expect(earlyJsactionData).toBeDefined();
446 │       expect(earlyJsactionData!.q.length).toBe(1);
447 ▶       expect(earlyJsactionData!.q[0].event.type).toBe('focus');
448 │ 
449 │       const dispatcher = createDispatcherSpy();
450 │       const eventContract = createEventContract({
451 │         eventContractContainerManager: new EventContractContainer(container),
452 │         eventTypes: ['focus'],
453 │         dispatcher,
454 │       });
455 │ 
456 ▶       eventContract.replayEarlyEvents(replaySink._ejsa);
457 │ 
458 ▶       expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
459 │       expect(dispatcher).toHaveBeenCalledTimes(1);
460 │       const eventInfoWrapper = getLastDispatchedEventInfoWrapper(dispatcher);
461 │       expect(eventInfoWrapper.getEventType()).toBe('focus');
462 │       expect(eventInfoWrapper.getEvent().type).toBe('focus');
463 │       expect(eventInfoWrapper.getTargetElement()).toBe(targetElement);
464 │       expect(eventInfoWrapper.getAction()).toBeUndefined();
465 │     });
```

1 つ目は `_ejsa` の側の通しの it です。404〜405 行目で `documentElement` に早期の契約を置き、407 行目のクリックが 411 行目で q に 1 件積まれ、421 行目の `replayEarlyEvents()` のあと、423 行目で `_ejsa` が消え、424 行目でリスナーが 1 回外されたことを確かめています（5 節の 203〜204 行目）。2 つ目は 436 行目で `window` の代わりに普通のオブジェクトを入れ物にし、440 行目で focus を捕獲の段で登録しています。458 行目で外されたことを確かめます。**`_ejsas` の側（Angular が使う側）で、「clear のあとにリスナーが残らないこと」を確かめる it はありません**。223 行目の it が見ているのは、`_ejsas[appId]` が `undefined` になることだけです。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/primitives/event-dispatch/test:browser_test_chromium \
  //packages/core/primitives/event-dispatch/test:browser_test_firefox \
  --nocache_test_results --test_output=all

pnpm bazel test //packages/platform-server/test:event_replay_test \
  '--test_arg=--filter=event dispatch script' --nocache_test_results --test_output=all
pnpm bazel test //packages/platform-server/test:event_replay_test \
  '--test_arg=--filter=_ejsas' --nocache_test_results --test_output=all
```

📄 `出力（2026-11-06 に実行。抜粋。ログは scratchpad/jsa-logs/b-base.log・b-server.log）`

```
Chromium: |██████████| 1/1 test files | 111 passed, 0 failed
Firefox:  |██████████| 1/1 test files | 111 passed, 0 failed
//packages/core/primitives/event-dispatch/test:browser_test_chromium     PASSED in 1.0s
//packages/core/primitives/event-dispatch/test:browser_test_firefox      PASSED in 2.0s

# filter=event dispatch script
Ran 5 of 23 specs
5 specs, 0 failures
//packages/platform-server/test:event_replay_test                        PASSED in 0.6s

# filter=_ejsas
Ran 1 of 23 specs
//packages/platform-server/test:event_replay_test                        PASSED in 0.6s
```

- event-dispatch の spec はブラウザで 4 つのファイルを束ねて走るので、名前で絞れません（[第 4 回](04-jsaction-event-types.md)のテストの節）。ターゲット全体の 111 件を走らせました。
- `event_replay_test` は `--test_arg=--filter=…` が効きます。`event dispatch script` で 5 件、`_ejsas` で 1 件（223 行目の it）でした。

### 直すとしたら

- **#71518（`<body>` の `h` が残る）**：issue の本文は、原因を「`initEventReplay` と `appRef.onDestroy` の中で `clearAppScopedEarlyEventContract` を呼ぶが `removeAllAppScopedEventListeners` を呼ばない」と書いています。この章の 5 節で読んだ行と同じです。付いている PR #71519（2026-10-21、fix(core): remove early event listeners after replay）は、2026-11-06 の時点で承認済み（APPROVED）で、まだ開いています。`gh pr diff` で読むと、Angular の側ではなく bootstrap\_app\_scoped.ts の `clearAppScopedEarlyEventContract` の 75 行目の前に `removeAllEventListeners(dataContainer._ejsas[appId])` を足し、bootstrap\_global.ts の `clearGlobalEarlyEventContract` にも同じ 1 行を足す形です。spec は eventcontract\_test.ts の `early events` の describe に「clear のあとにクリックしても q が 1 件のまま」の it を、event\_replay\_spec.ts に「安定したあと・安定する前に壊したあとに q が伸びない」の 2 つの it を足しています。DEMO のチェックを付けたときと同じ効き目です。
- **`registerAppScopedDispatcher` が効かない**：5 節の 121 行目と 3 節の 74 行目の食い違いです。`gh search issues` と `gh search prs` で `registerAppScopedDispatcher`・`registerGlobalDispatcher` を探すと（2026-11-06）、この関数の issue は無く、出てくるのは d072791f131（2026-01-17、refactor(core): remove unused restriction parameter）の PR #66625 だけです。`git show` で読むと、この commit は 2 つの関数から使っていない第 1 引数 `restriction` を消しただけで、中身の 1 行（bootstrap\_app\_scoped.ts 56 行目・bootstrap\_global.ts 36 行目）は変えていません。手元で確かめるなら、eventcontract\_test.ts の `early events` の describe に「`bootstrapAppScopedEarlyEventContract` → `registerAppScopedDispatcher` → クリック → 渡した関数が呼ばれたか」を見る it を書く形になります。確かめ方は DEMO の段 2 と同じで、DEMO では渡した関数が 0 回でした（この it を本家の手元で走らせたわけではありません）。直す場所は earlyeventcontract.ts の `createEarlyJsactionData` の 74 行目（局所の `d` ではなく欄の `d` を呼ぶ）か、使われていない `registerDispatcher` の側です。Angular はこの関数を使っていないので、どちらに寄せるかから考えることになります。
- earlyeventcontract.ts の最後の `export {};`（144〜145 行目）は bb628d8b508（2026-03-12）で足された行で、`declare global` のあるファイルを Rollup が .d.ts にするときのエラーよけです。動きには関係しません。
- 本家に PR を出すことは勧めません。issue を読むときは、DEMO と同じように「どの配列に、いつ積まれ、誰が読むか」を並べて確かめます（[第 12 回](12-jsaction-tests-issues.md)）。

## 聞かれそうな質問

**Q. HTML に入っている契約のスクリプトは、どこから来るのですか？**

contract\_binary.ts（11 行目で `__jsaction_bootstrap` を置く 2 行）を、event-dispatch/BUILD.bazel の 33〜47 行目の esbuild が即時関数に束ねて最小化し、core/BUILD.bazel の 168〜173 行目が `event-dispatch-contract.min.js` の名前で @angular/core に入れます。CLI がビルドのときにそれを読んで `<body>` の直後に入れ、platform-server が要らなければ消し（utils.ts 88〜90 行目）、要れば呼び出しの 1 行を足します（171〜177 行目）。

**Q. JS が届く前のクリックは、どこに貯まりますか？**

`window._ejsas[appId].q` です。`h` が `EventInfo` を作り、earlyeventcontract.ts の 74 行目で局所の `d` を呼び、71 行目で `q` に積みます。jsaction 属性はまだ読みません。

**Q. `_ejsa` と `_ejsas` の違いは？**

`_ejsa` はページに 1 つで `documentElement` に付け（bootstrap\_global.ts 23・26 行目）、`_ejsas` は appId ごとで、呼ぶ人が渡した要素に付けます。Angular は `_ejsas` の側だけを使い、入口の index.ts からも `_ejsas` の側の関数だけが出ています。

**Q. アプリが起動したあと、早期の契約は全部片付きますか？**

置き場所の欄は片付きますが、`<body>` のリスナーは残ります。Angular は `clearAppScopedEarlyEventContract`（bootstrap\_app\_scoped.ts 75 行目で欄を `undefined` にするだけ）を呼び、`removeAllAppScopedEventListeners` を呼ばないからです。開いている #71518 がこれを報告していて、PR #71519 が承認済みで開いています。

**Q. `registerAppScopedDispatcher` で、早期の契約から直接イベントを受けられますか？**

いまのソースでは受けられません。121 行目で欄の `d` を差し替えても、`h`（74 行目）が呼ぶのは 70 行目の局所の `d` なので、イベントは `q` に積まれ続けます。DEMO の段 2 で、渡した関数が 0 回のままになるのが見えます。

## 読み終えて

- 早期の契約のスクリプトは、contract\_binary.ts を esbuild で束ねた 476 バイトの即時関数で、中身は 4 つの関数だけです。
- CLI が `<body>` の直後に入れ、platform-server が消すか `__jsaction_bootstrap(document.body, appId, 泡立つ, 捕獲)` の 1 行を足します。
- JS が届く前のイベントは `window._ejsas[appId].q` に積まれるだけで、行き先はまだ決めません。
- Angular は安定したあと q を取り出して `EventContract` に渡し、置き場所を消しますが、`<body>` のリスナーは外しません（#71518）。
- `registerAppScopedDispatcher` は欄を差し替えるだけで、イベントの流れを変えません。

---

← 前: [イベントの種類：泡立つもの・捕まえるもの・早期のもの](04-jsaction-event-types.md)  
次: [EventContract と EventContractContainer：コンテナにリスナーを付ける](06-jsaction-contract.md) →
