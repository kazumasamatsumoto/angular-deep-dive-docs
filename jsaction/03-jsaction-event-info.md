[目次](../README.md) › [イベント配送（event-dispatch）と jsaction の内側](README.md) › 第 3 回 / 全 12 回

# EventInfo：イベントを運ぶ入れ物の形

> event\_info.ts の EventInfo（イベントの種類・イベント・対象の要素・コンテナ・時刻・行き先・再生かどうか・a11y の click か・解決済みか）を、別々に最小化される契約と dispatcher の間で受け渡すために、名前を付け替えさせない短い名前のオブジェクト（行き先だけが \[名前, 要素\] の配列）で持つ理由と、get・set の関数、createEventInfoFromParameters・createEventInfo・cloneEventInfo（浅い写し）、外へ見せる EventInfoWrapper。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/jsaction-event-info)

---

契約が受けたイベントは、`EventInfo` という入れ物に入って dispatcher まで運ばれます。この章では、その入れ物の 9 つの欄が何を持ち、どの関数がいつ書き込むのか、作る関数・写す関数・外へ見せる `EventInfoWrapper` がどう違うのかを読み、本物のライブラリで「普通に渡したとき」と「貯めてから渡したとき（再生）」の欄の値を並べて比べます。

読む対象は `packages/core/primitives/event-dispatch/src/event_info.ts`（330 行）です。

1. [1. 全体像](01-jsaction-overview.md)
2. [2. jsaction 属性](02-jsaction-attribute.md)
3. **3. EventInfo**（この章）
4. [4. イベントの種類](04-jsaction-event-types.md)
5. [5. 早期の契約](05-jsaction-early-contract.md)
6. [6. EventContract](06-jsaction-contract.md)
7. [7. 行き先を探す](07-jsaction-resolver.md)
8. [8. a11y の click](08-jsaction-a11y-click.md)
9. [9. mouseenter とタッチ](09-jsaction-mouse-touch.md)
10. [10. Dispatcher](10-jsaction-dispatcher.md)
11. [11. Angular の側](11-jsaction-angular.md)
12. [12. spec と issue](12-jsaction-tests-issues.md)

## 1. 入れ物の形：配列ではなく、短い名前のオブジェクト

📄 `angular/packages/core/primitives/event-dispatch/src/event_info.ts` L9–35 （▶ の行: 12–14, 17, 20–23, 26–27, 29, 32–34）

```ts
 9 │ /**
10 │  * Records information about the action that should handle a given `Event`.
11 │  */
12 ▶ export interface ActionInfo {
13 ▶   name: string;
14 ▶   element: Element;
15 │ }
16 │ 
17 ▶ type ActionInfoInternal = [name: string, element: Element];
18 │ 
19 │ /**
20 ▶  * Records information for later handling of events. This type is
21 ▶  * shared, and instances of it are passed, between the eventcontract
22 ▶  * and the dispatcher jsbinary. Therefore, the fields of this type are
23 ▶  * referenced by string literals rather than property literals
24 │  * throughout the code.
25 │  *
26 ▶  * 'targetElement' is the element the action occurred on, 'actionElement'
27 ▶  * is the element that has the jsaction handler.
28 │  *
29 ▶  * A null 'actionElement' identifies an EventInfo instance that didn't match a
30 │  * jsaction attribute.  This allows us to execute global event handlers with the
31 │  * appropriate event type (including a11y clicks and custom events).
32 ▶  * The declare portion of this interface creates a set of externs that make sure
33 ▶  * renaming doesn't happen for EventInfo. This is important since EventInfo
34 ▶  * is shared across multiple binaries.
35 │  */
```

1. **12〜15 行目と 17 行目：行き先の 2 つの形**

   外へ見せる形は `ActionInfo`（`{name, element}`）、中で持つ形は 17 行目の `ActionInfoInternal`、つまり `[名前, 要素]` の 2 つの要素の配列です。**配列なのはこの「行き先」の欄だけ**で、`EventInfo` そのものはオブジェクトです。
2. **20〜24 行目：2 つの「バイナリ」の間で受け渡す**

   `EventInfo` は eventcontract（HTML に入れる小さな JS）と dispatcher（後から来る JS）の間で渡されます。別々に最小化される JS の間で同じ欄を読むので、欄の名前はプロパティの文字列として扱う、と書いています。
3. **32〜34 行目：`declare` で、名前を変えさせない**

   `declare interface` にすると、Google の Closure Compiler が欄の名前を短く付け替えない（renaming しない）ための外部宣言になります。付け替えられると、片方の JS が書いた欄をもう片方が読めなくなるからです。
4. **26〜31 行目：`targetElement` と行き先の要素は別物**

   `targetElement` は操作が起きた要素、行き先の要素は `jsaction` を持つ要素です。行き先が無い `EventInfo` もあり得ます（29〜31 行目）。

📄 `angular/packages/core/primitives/event-dispatch/src/event_info.ts` L36–59 （▶ の行: 37–39, 41–42, 46, 51, 56, 58）

```ts
36 │ export declare interface EventInfo {
37 ▶   eventType: string;
38 ▶   event: Event;
39 ▶   targetElement: Element;
40 │   /** The element that is the container for this Event. */
41 ▶   eic: Element;
42 ▶   timeStamp: number;
43 │   /**
44 │    * The action parsed from the JSAction element.
45 │    */
46 ▶   eia?: ActionInfoInternal;
47 │   /**
48 │    * Whether this `Event` is a replay event, meaning no dispatcher was
49 │    * installed when this `Event` was originally dispatched.
50 │    */
51 ▶   eirp?: boolean;
52 │   /**
53 │    * Whether this `Event` represents a `keydown` event that should be processed
54 │    * as a `click`. Only used when a11y click events is on.
55 │    */
56 ▶   eiack?: boolean;
57 │   /** Whether action resolution has already run on this `EventInfo`. */
58 ▶   eir?: boolean;
59 │ }
```

| 行 | 欄 | 持つもの | 書き込む所（`src/` を `grep`） |
| --- | --- | --- | --- |
| 37 | `eventType` | JSAction の中での種類。`event.type` と違うことがある | 作るとき。後から `clickmod`（action\_resolver.ts）、`click`・`clickonly`（a11y\_click.ts）、早期の列の写しで種類ごとに（eventcontract.ts）書き換わる |
| 38 | `event` | ブラウザの `Event` そのもの | 作るとき。mouseenter を作り直したときだけ差し替わる（action\_resolver.ts、[第 9 回](09-jsaction-mouse-touch.md)） |
| 39 | `targetElement` | 操作が起きた要素（作るときの `event.target`） | 作るとき。mouseenter では行き先の要素に差し替わる |
| 41 | `eic` | リスナーを付けたコンテナ（**e**vent **i**nfo **c**ontainer）。親へたどるのはここまで | 作るときだけ（`setContainer` を呼ぶ所は無い） |
| 42 | `timeStamp` | 作ったときの `Date.now()` | 作るときだけ（`setTimestamp` を呼ぶ所は無い） |
| 46 | `eia` | 行き先 `[名前, 要素]`（**a**ction） | `populateActionOnElement` が見つけたとき。親へ進むときと、mouseenter に合わないときに消される |
| 51 | `eirp` | 再生か（**r**e**p**lay）。dispatcher が無い間に来たもの | `EventContract.handleEventInfo` が貯めるとき `true` |
| 56 | `eiack` | click として扱う keydown か（**a**11y **c**lick **k**ey） | a11y\_click.ts（[第 8 回](08-jsaction-a11y-click.md)） |
| 58 | `eir` | 行き先の解決を済ませたか（**r**esolved） | `ActionResolver.resolveAction` が終わったとき `true` |

名前の短さは、HTML に入れる JS の大きさに効きます。最小化した配布物 `event-dispatch-contract.min.js`（476 バイト）の中でも、`{eventType:t,event:n,targetElement:r,eic:o,timeStamp:e,eia:i,eirp:f,eiack:m}` のように欄の名前はそのまま残っています。残るのですから、短いほど小さくなります。

## 2. get と set：名前を読みやすくするだけの関数

📄 `angular/packages/core/primitives/event-dispatch/src/event_info.ts` L61–79 （▶ の行: 61–63, 67–68）

```ts
61 ▶ /** Added for readability when accessing stable property names. */
62 ▶ export function getEventType(eventInfo: EventInfo) {
63 ▶   return eventInfo.eventType;
64 │ }
65 │ 
66 │ /** Added for readability when accessing stable property names. */
67 ▶ export function setEventType(eventInfo: EventInfo, eventType: string) {
68 ▶   eventInfo.eventType = eventType;
69 │ }
70 │ 
71 │ /** Added for readability when accessing stable property names. */
72 │ export function getEvent(eventInfo: EventInfo) {
73 │   return eventInfo.event;
74 │ }
75 │ 
76 │ /** Added for readability when accessing stable property names. */
77 │ export function setEvent(eventInfo: EventInfo, event: Event) {
78 │   eventInfo.event = event;
79 │ }
```

61 行目のコメントのとおり、`getEventType` は `eventInfo.eventType` を返すだけ、`setEventType` は代入するだけです。`eic` や `eirp` のような短い名前を、ライブラリの中では `getContainer`・`getIsReplay` のような長い名前で読み書きするための関数です。関数の名前は最小化で短くなりますが、欄の名前は残ります。2026-11-06 のこのサイトの本番ビルドでは、main の中に `function tD(e){return e.eic}` のような形で、関数も欄の名前も残っていました（関数の名前はビルドごとに変わります）。

📄 `angular/packages/core/primitives/event-dispatch/src/event_info.ts` L111–134 （▶ の行: 117–118, 122–123, 127–128, 132–133）

```ts
111 │ /** Added for readability when accessing stable property names. */
112 │ export function getAction(eventInfo: EventInfo) {
113 │   return eventInfo.eia;
114 │ }
115 │ 
116 │ /** Added for readability when accessing stable property names. */
117 ▶ export function setAction(eventInfo: EventInfo, actionName: string, actionElement: Element) {
118 ▶   eventInfo.eia = [actionName, actionElement];
119 │ }
120 │ 
121 │ /** Added for readability when accessing stable property names. */
122 ▶ export function unsetAction(eventInfo: EventInfo) {
123 ▶   eventInfo.eia = undefined;
124 │ }
125 │ 
126 │ /** Added for readability when accessing stable property names. */
127 ▶ export function getActionName(actionInfo: ActionInfoInternal) {
128 ▶   return actionInfo[0];
129 │ }
130 │ 
131 │ /** Added for readability when accessing stable property names. */
132 ▶ export function getActionElement(actionInfo: ActionInfoInternal) {
133 ▶   return actionInfo[1];
134 │ }
```

118 行目、`setAction` は毎回**新しい** 2 要素の配列を作ります。123 行目の `unsetAction` は `undefined` を入れるだけです。127〜134 行目は配列の 0 番（名前）と 1 番（要素）を読む関数で、`EventInfo` ではなく行き先の配列を受け取ります。

📄 `angular/packages/core/primitives/event-dispatch/src/event_info.ts` L136–164 （▶ の行: 137–138, 142–143, 147–148, 157–158, 162–163）

```ts
136 │ /** Added for readability when accessing stable property names. */
137 ▶ export function getIsReplay(eventInfo: EventInfo) {
138 ▶   return eventInfo.eirp;
139 │ }
140 │ 
141 │ /** Added for readability when accessing stable property names. */
142 ▶ export function setIsReplay(eventInfo: EventInfo, replay: boolean) {
143 ▶   eventInfo.eirp = replay;
144 │ }
145 │ 
146 │ /** Added for readability when accessing stable property names. */
147 ▶ export function getA11yClickKey(eventInfo: EventInfo) {
148 ▶   return eventInfo.eiack;
149 │ }
150 │ 
151 │ /** Added for readability when accessing stable property names. */
152 │ export function setA11yClickKey(eventInfo: EventInfo, a11yClickKey: boolean) {
153 │   eventInfo.eiack = a11yClickKey;
154 │ }
155 │ 
156 │ /** Added for readability when accessing stable property names. */
157 ▶ export function getResolved(eventInfo: EventInfo) {
158 ▶   return eventInfo.eir;
159 │ }
160 │ 
161 │ /** Added for readability when accessing stable property names. */
162 ▶ export function setResolved(eventInfo: EventInfo, resolved: boolean) {
163 ▶   eventInfo.eir = resolved;
164 │ }
```

3 つの印（`eirp`・`eiack`・`eir`）も同じ形です。どれも `?` の付いた欄なので、書かれるまでは `undefined` です。`false` を書く所は無いので、「再生でない」は `false` ではなく `undefined` で表されます（デモで確かめられます）。

## 3. 作る関数と写す関数

📄 `angular/packages/core/primitives/event-dispatch/src/event_info.ts` L181–207 （▶ の行: 184–185, 187, 196–197, 201–205）

```ts
181 │ /**
182 │  * Utility function for creating an `EventInfo`.
183 │  *
184 ▶  * This can be used from code-size sensitive compilation units, as taking
185 ▶  * parameters vs. an `Object` literal reduces code size.
186 │  */
187 ▶ export function createEventInfoFromParameters(
188 │   eventType: string,
189 │   event: Event,
190 │   targetElement: Element,
191 │   container: Element,
192 │   timestamp: number,
193 │   action?: ActionInfoInternal,
194 │   isReplay?: boolean,
195 │   a11yClickKey?: boolean,
196 ▶ ): EventInfo {
197 ▶   return {
198 │     eventType,
199 │     event,
200 │     targetElement,
201 ▶     eic: container,
202 ▶     timeStamp: timestamp,
203 ▶     eia: action,
204 ▶     eirp: isReplay,
205 ▶     eiack: a11yClickKey,
206 │   };
207 │ }
```

184〜185 行目、引数を並べる形のほうが、オブジェクトを渡す形より最小化後のコードが小さい、と書いています。`EventContract.handleEvent` と、HTML の中の早期の契約（`earlyeventcontract.ts`）が、この関数で作ります（[第 6 回](06-jsaction-contract.md)・[第 5 回](05-jsaction-early-contract.md)）。どちらも先頭の 5 つしか渡さないので、203〜205 行目の 3 つは `undefined` の**値として**入り、`eir` は 197〜206 行目のどこにも無いので**欄ごと**ありません。デモの `Object.keys(eventInfo)` が、作った直後は 8 個、解決の後は 9 個になるのはこのためです。

📄 `angular/packages/core/primitives/event-dispatch/src/event_info.ts` L209–244 （▶ の行: 212–213, 215, 230, 240）

```ts
209 │ /**
210 │  * Utility function for creating an `EventInfo`.
211 │  *
212 ▶  * This should be used in compilation units that are less sensitive to code
213 ▶  * size.
214 │  */
215 ▶ export function createEventInfo({
216 │   eventType,
217 │   event,
218 │   targetElement,
219 │   container,
220 │   timestamp,
221 │   action,
222 │   isReplay,
223 │   a11yClickKey,
224 │ }: {
225 │   eventType: string;
226 │   event: Event;
227 │   targetElement: Element;
228 │   container: Element;
229 │   timestamp: number;
230 ▶   action?: ActionInfo;
231 │   isReplay?: boolean;
232 │   a11yClickKey?: boolean;
233 │ }): EventInfo {
234 │   return {
235 │     eventType,
236 │     event,
237 │     targetElement,
238 │     eic: container,
239 │     timeStamp: timestamp,
240 ▶     eia: action ? [action.name, action.element] : undefined,
241 │     eirp: isReplay,
242 │     eiack: a11yClickKey,
243 │   };
244 │ }
```

もう 1 つの作る関数は、名前つきの引数を受ける版です。212〜213 行目、大きさを気にしない所で使う、とあります。240 行目で、外の形の `ActionInfo` を中の配列に直します。手元の版で `createEventInfo` を呼んでいるのは spec（`dispatcher_test.ts` と `event_dispatcher_test.ts` の、テスト用の `EventInfo` を作る関数）だけで、`src/` と `core/src` には呼ぶ所がありません。

📄 `angular/packages/core/primitives/event-dispatch/src/event_info.ts` L166–179 （▶ の行: 167–168, 170, 173, 175, 177）

```ts
166 │ /** Clones an `EventInfo` */
167 ▶ export function cloneEventInfo(eventInfo: EventInfo): EventInfo {
168 ▶   return {
169 │     eventType: eventInfo.eventType,
170 ▶     event: eventInfo.event,
171 │     targetElement: eventInfo.targetElement,
172 │     eic: eventInfo.eic,
173 ▶     eia: eventInfo.eia,
174 │     timeStamp: eventInfo.timeStamp,
175 ▶     eirp: eventInfo.eirp,
176 │     eiack: eventInfo.eiack,
177 ▶     eir: eventInfo.eir,
178 │   };
179 │ }
```

1. **写すのは 1 段だけ（浅い写し）**

   170 行目の `event` も 173 行目の `eia`（行き先の配列）も、同じものを指します。写しを作っても `Event` は 1 つのままです。
2. **177 行目：`eir` も書くので、写しは欄が 9 個**

   値が `undefined` でも、欄としては必ずできます。並び順も 173 行目の `eia` が `timeStamp` より前になり、作ったときと少し違います。
3. **使うのは早期の列を引き取るとき**

   `EventContract.replayEarlyEventInfos` は、早期の列の 1 個を、そのブラウザの種類に結び付いた JSAction の種類の数だけ写し、写しごとに `eventType` を書き換えます（[第 6 回](06-jsaction-contract.md)）。原本の `EventInfo` には手を付けないので、原本の `eirp` は `undefined` のままです（デモの「早期の契約から」で確かめられます）。

## 4. EventInfoWrapper：外へ見せる包み

📄 `angular/packages/core/primitives/event-dispatch/src/event_info.ts` L246–265 （▶ の行: 249–250, 253, 255–256）

```ts
246 │ /**
247 │  * Utility class around an `EventInfo`.
248 │  *
249 ▶  * This should be used in compilation units that are less sensitive to code
250 ▶  * size.
251 │  */
252 │ export class EventInfoWrapper {
253 ▶   constructor(readonly eventInfo: EventInfo) {}
254 │ 
255 ▶   getEventType() {
256 ▶     return getEventType(this.eventInfo);
257 │   }
258 │ 
259 │   setEventType(eventType: string) {
260 │     setEventType(this.eventInfo, eventType);
261 │   }
262 │ 
263 │   getEvent() {
264 │     return getEvent(this.eventInfo);
265 │   }
```

📄 `angular/packages/core/primitives/event-dispatch/src/event_info.ts` L294–330 （▶ の行: 294–299, 303, 308, 311, 319, 327–328）

```ts
294 ▶   getAction() {
295 ▶     const action = getAction(this.eventInfo);
296 ▶     if (!action) return undefined;
297 ▶     return {
298 ▶       name: action[0],
299 ▶       element: action[1],
300 │     };
301 │   }
302 │ 
303 ▶   setAction(action: ActionInfo | undefined) {
304 │     if (!action) {
305 │       unsetAction(this.eventInfo);
306 │       return;
307 │     }
308 ▶     setAction(this.eventInfo, action.name, action.element);
309 │   }
310 │ 
311 ▶   getIsReplay() {
312 │     return getIsReplay(this.eventInfo);
313 │   }
314 │ 
315 │   setIsReplay(replay: boolean) {
316 │     setIsReplay(this.eventInfo, replay);
317 │   }
318 │ 
319 ▶   getResolved() {
320 │     return getResolved(this.eventInfo);
321 │   }
322 │ 
323 │   setResolved(resolved: boolean) {
324 │     setResolved(this.eventInfo, resolved);
325 │   }
326 │ 
327 ▶   clone() {
328 ▶     return new EventInfoWrapper(cloneEventInfo(this.eventInfo));
329 │   }
330 │ }
```

1. **253 行目：`eventInfo` を `readonly` で持つだけ**

   包みの中身は同じ `EventInfo` です。getter・setter は 2 節の関数を呼ぶだけで、写しは作りません。公開の入口から出ているのはこの包みで、`EventInfo` の型も get・set の関数も出ていません（[第 1 回](01-jsaction-overview.md)の index.ts）。
2. **294〜301 行目：`getAction()` は呼ぶたびに新しいオブジェクトを作る**

   中の配列 `[名前, 要素]` を、外の形 `{name, element}` に直して返します。`getAction() === getAction()` は `false` です。中身を比べるときは `.name` と `.element` を比べます。
3. **311〜325 行目：再生と解決の印は読めるが、a11y の印（`eiack`）の getter は無い**

   包みにあるのは `getIsReplay`・`getResolved` までで、`getA11yClickKey` にあたるものはありません。包みから読むなら `wrapper.eventInfo.eiack` と欄を直接読みます（デモはそうしています）。
4. **327〜329 行目：`clone()` は 3 節の浅い写しを包み直す**

   手元の版では、この包みの setter と `clone()` を呼んでいる所は `packages/core` にありません（`grep`）。読むのは getter だけです。

包みを作るのは `Dispatcher.dispatch` の最初の行です（[第 10 回](10-jsaction-dispatcher.md)）。Angular が使う `EventDispatcher` は、この包みを使う側に渡さず、`(event, 名前)` だけを渡します。だから Angular の側（`event_replay.ts`）は、再生かどうかを `getIsReplay()` ではなく `event.eventPhase === EventPhase.REPLAY` で見分けています（[event-replay](../platform/14-event-replay.md) の 7 節）。

## 5. 欄が埋まっていく順番

- 👤 `ユーザーのクリック` — ブラウザ
  - `createEventInfoFromParameters(type, event, event.target, container, Date.now())` — eventcontract.ts L113 → event\_info.ts L187 — *eventType・event・targetElement・eic・timeStamp。欄は 8 個*
  - `setIsReplay(eventInfo, true)` — eventcontract.ts L129 → event\_info.ts L142 — *dispatcher がまだ無いときだけ。eirp = true*
  - `new EventInfoWrapper(eventInfo)` — dispatcher.ts L79 → event\_info.ts L253
    - `setEventType(eventInfo, 'clickmod')` — action\_resolver.ts L98 → event\_info.ts L67 — *修飾キー付きのクリックだけ*
    - `setAction(eventInfo, name, element)` — action\_resolver.ts L235 → event\_info.ts L117 — *eia = \[名前, 要素\]*
    - `setResolved(eventInfo, true)` — action\_resolver.ts L109 → event\_info.ts L162 — *eir = true。欄は 9 個に*
    - 👤 `dispatchDelegate(event, name)` — event\_dispatcher.ts L96 — *行き先の関数。ここでは eia がある*
    - `unsetAction(eventInfo)` — action\_resolver.ts L115 → event\_info.ts L122 — *親へ進むとき。親に無ければ eia は undefined のまま終わる*

## 6. 本物で比べる

> **🧪 DEMO — EventInfoWrapper の getter を、普通のときと再生のときで並べる（ライブ）**
>
> 本物の `@angular/core/primitives/event-dispatch`（@angular/core 22.1.6）を、赤い枠（`#jsa-ei-stage`）の上で動かします。章のコードは契約の `ecrd` を 1 枚包み、dispatcher に来た `EventInfo` を `new EventInfoWrapper(…)` で持ち、getter の値を「dispatcher に来たとき（解決の前）」「行き先の関数の中」「dispatch が終わったあと」の 3 回読みます。読むだけで、書き換えません。「早期の契約から」は、**このページの HTML の先頭に入っている早期の契約のスクリプト**（`event-dispatch-contract.min.js`）が置いた `window.__jsaction_bootstrap`（中身は `bootstrapAppScopedEarlyEventContract`。[第 1 回](01-jsaction-overview.md)の `contract_binary.ts`）を、このデモ専用の appId `"jsa-demo-event-info"` と赤い枠で呼びます。入口から `bootstrapAppScopedEarlyEventContract` を import しないのは、Angular 本体が使っていない関数を import すると、ページの最初の JS（main）に入ってしまうからです。移すときは、早期の列を `getAppScopedQueuedEventInfos` で読んで `EventContract.replayEarlyEventInfos` に渡し、早期のリスナーを外し（`earlyeventcontract.ts` の `removeAllEventListeners` と同じ 2 つのループを章のコードに書いた**移植**。理由は同じ）、`clearAppScopedEarlyEventContract` で消し、このデモのキーも `window._ejsas` から消します。このサイトの `window._ejsas.ng` には触りません。
>
> 道を選ぶ
>
> いまの段：  まだ何も無い
>
> 見どころ：(1)「普通」で A の文字を押すと、来たときは `Object.keys` が 8 個・`getResolved()` が `undefined`・行き先が `undefined`、行き先の関数の中では 9 個・`true`・`"show"`、終わったあとは行き先がまた `undefined` です（5 節の最後の行）。`getIsReplay()` はずっと `undefined`、`eventPhase` は 3（泡立ちの段）。(2)「貯めてから登録」で押してから登録すると、来たときから `getIsReplay()` が `true`、`eventPhase` は 0（ブラウザの配送は終わっている）で、行き先の関数の中で 101（`EventPhase.REPLAY`）に変わります。`getTimestamp()` は押した時刻のままです。(3)「早期の契約から」は、早期の列の欄が 8 個で `eirp` が `undefined`、移したあと渡されるのは**写し**で、欄の並びが `eia`・`timeStamp` の順に変わり、`getIsReplay()` が `true` です。B（`jsaction` なし）は、どの道でも「行き先の関数の中」が呼ばれません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/jsaction-event-info)

> [!WARNING]
> **ハマりどころ**
>
> デモの外枠（`#jsa-ei-wrap`）で `stopPropagation` して、このページの `<body>` にある Angular 自身の契約までイベントを届かせないようにしています（[第 1 回](01-jsaction-overview.md)の注意）。

## テストと直し方

`event_info.ts` には自分の spec ファイルがありません。欄の値は、ほかの spec の中で `EventInfoWrapper` の getter を通して確かめられています。`test/` の 4 ファイルを `grep` した結果は次のとおりです。

| getter | 確かめている spec |
| --- | --- |
| `getEventType`・`getEvent`・`getTargetElement`・`getAction` | ほとんどの `it`。例：`dispatcher_test.ts` 340 行目 `it('dispatches event')`、`eventcontract_test.ts` 264 行目 `it('dispatches event')` |
| `getIsReplay` | `eventcontract_test.ts` 239 行目 `it('queues events until dispatcher is registered')` の 261 行目の 1 か所だけ |
| `targetElement` を別に持つ理由 | `eventcontract_test.ts` 467 行目 `it('early events are dispatched when target is cleared')`。配送の後にブラウザが `event.target` を消すのを `Object.defineProperty(clickEvent, 'target', {value: null})` で真似て、それでも `getTargetElement()` が元の要素を返すことを見る |
| `getTimestamp`・`getContainer`・`getResolved`・`eiack` | どの spec も値を確かめていない（`Date.now` は `beforeEach` で 0 に固定しているが、比べてはいない） |

📄 `手元で走らせるコマンド`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/primitives/event-dispatch/test:browser_test_chromium \
  //packages/core/primitives/event-dispatch/test:browser_test_firefox \
  --nocache_test_results --test_output=all
grep -n "getIsReplay\|getTimestamp\|getContainer\|getResolved\|eiack" \
  packages/core/primitives/event-dispatch/test/*.ts
```

📄 `走らせた結果`

```
（2026-11-06、このマシンで実行）
Chromium: 1/1 test files | 111 passed, 0 failed
Firefox: 1/1 test files | 111 passed, 0 failed
//packages/core/primitives/event-dispatch/test:browser_test_chromium   PASSED in 1.3s
//packages/core/primitives/event-dispatch/test:browser_test_firefox    PASSED in 2.4s
```

- **直す入口**：欄を足す・意味を変えるなら `event_info.ts` と、その欄を書く側（`eventcontract.ts`・`action_resolver.ts`）の両方です。欄の名前を変えると、HTML に入れる早期の契約（別に最小化される）との受け渡しが壊れるので、1 節の 32〜34 行目の理由で、名前はそのままにします。
- **spec を足すなら**：`test/BUILD.bazel` の `ts_project` は `glob(["**/*.ts"])` で全部を拾うので、`event_info_test.ts` のような新しいファイルを置けば、同じ `browser_test` のターゲットで走ります。今ある形に合わせるなら、`eventcontract_test.ts` の 239 行目の `it` の隣に、`getTimestamp()` が `Date.now()` の値（spec では 0）になることを足すのが小さな一歩です。
- ブラウザのターゲットでは名前の絞り込みが効かないので（[第 1 回](01-jsaction-overview.md)）、足したらターゲット全体を走らせて 111 が 112 になるのを見ます。
- この 1 年に `event_info.ts` を変えたコミットはありません（`git log` の最後は 9dbe6fc18be、2024 年のライセンスの文言の変更）。関係する issue は [第 12 回](12-jsaction-tests-issues.md)で読みます。

## 聞かれそうな質問

**Q. `EventInfo` は配列ですか？**

いいえ、オブジェクトです（event\_info.ts 36〜59 行目）。配列なのは行き先の欄 `eia` だけで、`[名前, 要素]` の 2 つです（17 行目）。欄の名前が `eic`・`eirp` のように短いのは、別々に最小化される JS の間で受け渡すので名前が付け替えられず（32〜34 行目）、そのまま HTML に入るからです。

**Q. `getTimestamp()` と `event.timeStamp` は同じですか？**

違います。`getTimestamp()` は契約が `EventInfo` を作ったときの `Date.now()`（1970 年からのミリ秒）で、`createEventInfoFromParameters` の 5 番目の引数として入ります（187〜196 行目）。`event.timeStamp` はブラウザが付ける、ページを開いてからのミリ秒です。どちらも再生のときに書き換わらないので、再生されたイベントでも「押したとき」の時刻が残ります。

**Q. 「再生」かどうかは誰が決めるのですか？**

`EventContract.handleEventInfo` が、dispatcher がまだ無いときに `setIsReplay(eventInfo, true)`（142〜144 行目）を呼んで決めます。それ以外で `eirp` を書く所はありません。だから「再生でない」イベントの `getIsReplay()` は `false` ではなく `undefined` です。Angular の `EventDispatcher` の利用者には包みが渡らないので、Angular は `event.eventPhase === EventPhase.REPLAY`（101）で見分けます。

**Q. dispatch が終わったあとに `getAction()` を読むと `undefined` なのはなぜですか？**

`EventDispatcher` が親の `jsaction` へ泡立たせるとき、毎回 `unsetAction`（122〜124 行目）で行き先を消してから親を探すからです。親に行き先が無ければ、消えたまま終わります。行き先を知りたいときは、行き先の関数が呼ばれている間に読みます。デモの表で「行き先の関数の中」だけに値があるのはこのためです。

**Q. `cloneEventInfo` で写せば、元の `Event` に触らずに済みますか？**

いいえ。写すのは 1 段だけで（167〜179 行目）、`event` も行き先の配列も同じものを指します。`EventDispatcher` が再生のときに `Event` の `eventPhase` などを差し替えると、写しから見ても原本から見ても同じ `Event` が変わっています。

## 読み終えて

- `EventInfo` は 9 つの欄のオブジェクト。行き先 `eia` だけが `[名前, 要素]` の配列。
- 欄の名前が短く付け替えられないのは、HTML に入れる契約と後から来る dispatcher が別々に最小化されるから。
- 作るのは `createEventInfoFromParameters`（8 欄）、写すのは `cloneEventInfo`（浅い写し、9 欄）。`eir` は解決のあとにできる。
- `eirp` は dispatcher が来る前に貯めたときだけ `true`。行き先は dispatch の後には消えている。
- `EventInfoWrapper` は同じ `EventInfo` を包むだけ。`getAction()` は毎回新しいオブジェクト、`eiack` の getter は無い。

---

← 前: [jsaction 属性を読む：書式・解析・要素ごとのキャッシュ](02-jsaction-attribute.md)  
次: [イベントの種類：泡立つもの・捕まえるもの・早期のもの](04-jsaction-event-types.md) →
