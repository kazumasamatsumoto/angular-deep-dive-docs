[目次](../README.md) › [Angular DevTools の内側](README.md) › 第 4 回 / 全 20 回

# プロトコル：Events の型と PriorityAwareMessageBus

> protocol/src/lib/messages.ts の Events（getLatestComponentExplorerView・latestComponentExplorerView・startProfiling・profilerResults など）とそのデータの形、MessageBus の約束、パネルの側の PriorityAwareMessageBus が getNestedProperties の返事を待つあいだ getLatestComponentExplorerView を落とし、100ms に 1 回に間引く仕組み。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-protocol)

---

パネルとページの中のバックエンドは、別々のプロセスにいて、関数を呼び合えません。代わりに「topic（メッセージの名前）と引数の配列」を送り合います。その topic の一覧と引数の型を 1 か所に書いたのが `devtools/projects/protocol` の `Events` で、送り方の約束が抽象クラス `MessageBus` です。この章では、topic を向きごとに分けて並べ、主なデータの形を読み、パネルの側だけにある `PriorityAwareMessageBus` が**入れ子のプロパティの返事を待つあいだ、木の更新の依頼を落とす**仕組みを、記録で 1 行ずつ確かめます。

読む対象は `protocol/src/lib/messages.ts`・`message-bus.ts`・`priority-aware-message-bus.ts`（と spec）・`protocol/README.md`、バックエンドの購読の後半（`client-event-subscribers.ts`）です。

1. [1. 全体像](01-devtools-overview.md)
2. [2. Angular を見つける](02-devtools-detect.md)
3. [3. メッセージの道](03-devtools-messaging.md)
4. **4. プロトコル**（この章）
5. [5. コンポーネントの木](05-devtools-component-tree.md)
6. [6. 制御フローの塊](06-devtools-control-flow.md)
7. [7. 同じノードを見分ける](07-devtools-identity.md)
8. [8. パネルの木](08-devtools-forest-ui.md)
9. [9. プロパティの直列化](09-devtools-state-serializer.md)
10. [10. 入れ子を開く](10-devtools-property-resolver.md)
11. [11. 値を書き換える](11-devtools-property-mutation.md)
12. [12. 選ぶ・光らせる](12-devtools-inspector-highlight.md)
13. [13. プロファイラーの記録](13-devtools-profiler-capture.md)
14. [14. 記録を描く](14-devtools-profiler-formatters.md)
15. [15. 変更検知を見張る](15-devtools-cd-analyzer.md)
16. [16. 注入器の木](16-devtools-injector-tree.md)
17. [17. signal のグラフ](17-devtools-signal-graph.md)
18. [18. ルーター・TransferState](18-devtools-router-transfer.md)
19. [19. テストとビルド](19-devtools-test-build.md)
20. [20. issue と PR を読む](20-devtools-issues.md)

## 1. MessageBus：4 つのメソッドだけの約束

📄 `angular/devtools/projects/protocol/src/lib/message-bus.ts` L9–16 （▶ の行: 9, 12–15）

```ts
 9 ▶ export type Parameters<F> = F extends (...args: infer T) => any ? T : never;
10 │ 
11 │ export abstract class MessageBus<T> {
12 ▶   abstract on<E extends keyof T>(topic: E, cb: T[E]): () => void;
13 ▶   abstract once<E extends keyof T>(topic: E, cb: T[E]): void;
14 ▶   abstract emit<E extends keyof T>(topic: E, args?: Parameters<T[E]>): boolean;
15 ▶   abstract destroy(): void;
16 │ }
```

12〜15 行目の 4 つだけです。型引数 `T` に `Events` を入れると、`on('ngAvailability', cb)` の `cb` の引数の型も、`emit('getNestedProperties', [位置, パス])` の配列の型も、`Events` から決まります。9 行目の `Parameters` は、関数の型から引数の組の型を取り出す型です（TypeScript の組み込みと同じ形）。この約束を満たすクラスが、拡張では `SamePageMessageBus` と `ChromeMessageBus`、開発用の殻では `IFrameMessageBus` です（[第 3 回](03-devtools-messaging.md)・[第 1 回](01-devtools-overview.md)）。

> [!TIP]
> **新卒エンジニアへ**
>
> `Events` の値（関数）は一度も呼ばれません。`getNestedProperties: (position, path) => void` は「この topic は、この 2 つを引数に送る」という**型だけの表**です。実際に送られるのは `{topic: 'getNestedProperties', args: [position, path]}` という形のオブジェクトで、受け手は `cb(...args)` で広げて呼びます（[第 3 回](03-devtools-messaging.md)の `SamePageMessageBus` と `ChromeMessageBus` の `on`）。

## 2. Events：topic の一覧

📄 `angular/devtools/projects/protocol/src/lib/messages.ts` L393–428 （▶ の行: 393, 396–397, 402, 414–415, 423–424）

```ts
393 ▶ export interface Events {
394 │   handshake: () => void;
395 │   shutdown: () => void;
396 ▶   queryNgAvailability: () => void;
397 ▶   ngAvailability: (config: {
398 │     version: string | undefined;
399 │     devMode: boolean;
400 │     ivy: boolean;
401 │     hydration: boolean;
402 ▶     supportedApis: SupportedApis | null;
403 │   }) => void;
404 │ 
405 │   inspectorStart: () => void;
406 │   inspectorEnd: () => void;
407 │ 
408 │   getSignalGraph: (query: ElementPosition) => void;
409 │   latestSignalGraph: (graph: DebugSignalGraph | null) => void;
410 │ 
411 │   getSignalNestedProperties: (position: SignalNodePosition, path: string[]) => void;
412 │   signalNestedProperties: (position: SignalNodePosition, data: Properties, path: string[]) => void;
413 │ 
414 ▶   getNestedProperties: (position: DirectivePosition, path: string[]) => void;
415 ▶   nestedProperties: (position: DirectivePosition, data: Properties, path: string[]) => void;
416 │ 
417 │   setSelectedComponent: (position: ElementPosition) => void;
418 │   getRoutes: () => void;
419 │   updateRouterTree: (routes: Route[]) => void;
420 │   navigateRoute: (route: string) => void;
421 │ 
422 │   componentTreeDirty: () => void;
423 ▶   getLatestComponentExplorerView: (query?: ComponentExplorerViewQuery) => void;
424 ▶   latestComponentExplorerView: (view: ComponentExplorerView) => void;
425 │ 
426 │   updateState: (value: UpdatedStateData) => void;
427 │   logValue: (value: {directiveId: DirectivePosition; keyPath: string[] | null}) => void;
428 │ 
```

📄 `angular/devtools/projects/protocol/src/lib/messages.ts` L429–458 （▶ の行: 429, 431–432, 448–449）

```ts
429 ▶   startProfiling: () => void;
430 │   stopProfiling: () => void;
431 ▶   sendProfilerChunk: (results: ProfilerFrame) => void;
432 ▶   profilerResults: (results: ProfilerFrame) => void;
433 │ 
434 │   createHighlightOverlay: (position: ElementPosition) => void;
435 │   removeHighlightOverlay: () => void;
436 │ 
437 │   enableHydrationOverlays: () => void;
438 │   disableHydrationOverlays: () => void;
439 │ 
440 │   highlightComponent: (id: number) => void;
441 │   selectComponent: (id: number) => void;
442 │   removeComponentHighlight: () => void;
443 │ 
444 │   enablePerformanceTrack: () => void;
445 │   disablePerformanceTrack: () => void;
446 │ 
447 │   // todo: type properly
448 ▶   getInjectorProviders: (injector: SerializedInjector) => void;
449 ▶   latestInjectorProviders: (
450 │     injector: SerializedInjector,
451 │     providers: SerializedProviderRecord[],
452 │   ) => void;
453 │ 
454 │   logProvider: (injector: SerializedInjector, providers: SerializedProviderRecord) => void;
455 │ 
456 │   getTransferState: () => void;
457 │   transferStateData: (data: Record<string, TransferStateValue> | null) => void;
458 │ 
```

📄 `angular/devtools/projects/protocol/src/lib/messages.ts` L459–478 （▶ の行: 466–469, 472–473）

```ts
459 │   enableCdHighlighting: () => void;
460 │   disableCdHighlighting: () => void;
461 │ 
462 │   enableCdDataStream: () => void;
463 │   disableCdDataStream: () => void;
464 │   latestCdData: (cdData: CdElementData[]) => void;
465 │ 
466 ▶   contentScriptConnected: (frameId: number, name: string, url: string) => void;
467 ▶   contentScriptDisconnected: (frameId: number, name: string, url: string) => void;
468 ▶   enableFrameConnection: (frameId: number, tabId: number) => void;
469 ▶   frameConnected: (frameId: number) => void;
470 │   detectAngular: (detectionResult: AngularDetection) => void;
471 │   backendInstalled: (detectionResult: AngularDetection) => void;
472 ▶   backendReady: () => void;
473 ▶   devtoolsShutdown: () => void;
474 │ 
475 │   log: (logEvent: {message: string; level: 'log' | 'warn' | 'debug' | 'error'}) => void;
476 │ 
477 │   toggleWatchSignal: (signalId: string) => void;
478 │ }
```

名前の付け方には、おおよその決まりがあります。**パネルが頼むものは `get…`・`query…`、ページが返すものは `latest…`・名詞**（`ngAvailability`・`nestedProperties`）です。返事なのに `latest…` でない `updateRouterTree`・`profilerResults` や、ページから自分で知らせる `componentTreeDirty`・`sendProfilerChunk` のような例外もあります。ただし型には向きが書いてありません。誰が `on` して誰が `emit` するかを、バックエンドの購読（下の引用と第 1 回の 3 節）とパネルの部品を grep して、向きごとに並べました。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L119–148 （▶ の行: 121, 124, 128, 133, 137, 145, 147）

```ts
119 │   messageBus.on('logValue', logValue);
120 │ 
121 ▶   messageBus.on('enablePerformanceTrack', enablePerformanceTrack);
122 │   messageBus.on('disablePerformanceTrack', disablePerformanceTrack);
123 │ 
124 ▶   messageBus.on('getInjectorProviders', getInjectorProvidersCallback(messageBus));
125 │ 
126 │   messageBus.on('logProvider', logProvider);
127 │ 
128 ▶   messageBus.on('getTransferState', getTransferStateCallback(messageBus));
129 │ 
130 │   messageBus.on('enableCdHighlighting', enableCdHighlighting);
131 │   messageBus.on('disableCdHighlighting', disableCdHighlighting);
132 │ 
133 ▶   messageBus.on('enableCdDataStream', enableCdDataStream(messageBus));
134 │   messageBus.on('disableCdDataStream', disableCdDataStream);
135 │ 
136 │   const SAFE_LOG_LEVELS = new Set(['log', 'info', 'warn', 'debug', 'error']);
137 ▶   messageBus.on('log', ({message, level}) => {
138 │     if (SAFE_LOG_LEVELS.has(level)) {
139 │       log[level](message);
140 │     } else {
141 │       debugLog.warn(`Invalid log level attempted: ${level}`);
142 │     }
143 │   });
144 │ 
145 ▶   messageBus.on('getSignalGraph', getSignalGraphCallback(messageBus));
146 │ 
147 ▶   messageBus.on('toggleWatchSignal', toggleWatchSignal(messageBus));
148 │ 
```

| 向き | topic | 読む回 |
| --- | --- | --- |
| パネル → ページ（頼む） | `getLatestComponentExplorerView・setSelectedComponent・getNestedProperties` | [第 5・10 回](05-devtools-component-tree.md) |
| ページ → パネル（返事・知らせ） | `latestComponentExplorerView・nestedProperties・componentTreeDirty` | [第 5・8・10 回](08-devtools-forest-ui.md) |
| パネル → ページ | `updateState・logValue` | [第 11 回](11-devtools-property-mutation.md) |
| パネル → ページ | `inspectorStart・inspectorEnd・createHighlightOverlay・removeHighlightOverlay` | [第 12 回](12-devtools-inspector-highlight.md) |
| ページ → パネル | `highlightComponent・selectComponent・removeComponentHighlight` | [第 12 回](12-devtools-inspector-highlight.md) |
| パネル → ページ | `startProfiling・stopProfiling` | [第 13 回](13-devtools-profiler-capture.md) |
| ページ → パネル | `sendProfilerChunk・profilerResults` | [第 13 回](13-devtools-profiler-capture.md) |
| パネル → ページ | `enablePerformanceTrack・disablePerformanceTrack・enableCdHighlighting・disableCdHighlighting・enableCdDataStream・disableCdDataStream` | [第 15 回](15-devtools-cd-analyzer.md) |
| ページ → パネル | `latestCdData` | [第 15 回](15-devtools-cd-analyzer.md) |
| パネル → ページ / ページ → パネル | `getInjectorProviders・logProvider / latestInjectorProviders` | [第 16 回](16-devtools-injector-tree.md) |
| パネル → ページ / ページ → パネル | `getSignalGraph・getSignalNestedProperties・toggleWatchSignal / latestSignalGraph・signalNestedProperties` | [第 17 回](17-devtools-signal-graph.md) |
| パネル → ページ / ページ → パネル | `getRoutes・navigateRoute・getTransferState・enableHydrationOverlays・disableHydrationOverlays / updateRouterTree・transferStateData` | [第 18 回](18-devtools-router-transfer.md) |
| パネル → ページ / ページ → パネル | `queryNgAvailability / ngAvailability` | [第 2 回](02-devtools-detect.md) |
| パネル → ページ | `log` | — |

466〜473 行目の 8 つは、機能ではなく**接続のための topic**です。バックエンドの `subscribeToClientEvents` ではなく、拡張の殻の部品どうしがやり取りします。

| topic | 送る側 | 受ける側 |
| --- | --- | --- |
| `detectAngular` | detect-angular | content script |
| `backendInstalled` | content script | detect-angular |
| `handshake` | content script | backend.ts |
| `backendReady` | backend.ts | content script・TabManager |
| `contentScriptConnected・contentScriptDisconnected・frameConnected` | TabManager | パネル（FrameManager） |
| `enableFrameConnection` | パネル（FrameManager） | TabManager・ページの bus の status |
| `devtoolsShutdown` | TabManager | バックエンド |
| `shutdown` | content script | バックエンド |

> [!WARNING]
> **ハマりどころ**
>
> 型と実物が合っていない所が 1 つあります。467 行目の `contentScriptDisconnected` は引数を 3 つ（`frameId`・`name`・`url`）と書いていますが、送る側の `TabManager` は frame の id と Port の名前の 2 つしか送りません（[第 3 回](03-devtools-messaging.md)の 5 節）。受ける `FrameManager` は frame の id しか使わないので、いまは困りません。送る側が `port.postMessage({topic, args})` と生のオブジェクトを書く所（`TabManager`）は、`Events` の型で確かめられないからです。

## 3. 主なデータの形

引数の型のうち、何度も出てくるものです。中身の作り方は各章で読みます。

📄 `angular/devtools/projects/protocol/src/lib/messages.ts` L115–137 （▶ の行: 117, 120–123, 125, 128, 131, 134）

```ts
115 │ export type ChangeDetection = 'ng-on-push' | 'ng-eager' | 'acx-on-push' | 'acx-default';
116 │ 
117 ▶ export interface DevToolsNode<DirType = DirectiveType, CmpType = ComponentType> {
118 │   tagName?: string;
119 │   directives?: DirType[];
120 ▶   component: CmpType | null;
121 ▶   children: DevToolsNode<DirType, CmpType>[];
122 ▶   nativeElement?: Node;
123 ▶   resolutionPath?: SerializedInjector[];
124 │   hydration?: HydrationStatus;
125 ▶   controlFlowBlock: ControlFlowBlock | null;
126 │   static: boolean;
127 │   changeDetection?: ChangeDetection;
128 ▶   injector?: Injector;
129 │ }
130 │ 
131 ▶ export interface SerializedInjector {
132 │   id: string;
133 │   name: string;
134 ▶   type: 'imported-module' | 'environment' | 'element' | 'null' | 'hidden';
135 │   node?: DevToolsNode;
136 │   providers?: number;
137 │ }
```

- **`DevToolsNode`（117〜129 行目）**は木の 1 つのノードで、型引数でディレクティブとコンポーネントの形を差し替えられます。ページの中では実物（インスタンス）を持つ `ComponentTreeNode`（`shared/interfaces.ts`）として使い、送るときは名前と id だけの `DirectiveType`・`ComponentType` にします。
- 122 行目の `nativeElement?: Node` と 128 行目の `injector?: Injector` は**送れません**（DOM のノードや注入器は `postMessage` でも JSON でも写せない）。バックエンドは送る前に外します。第 1 回のデモの記録でノードに `nativeElement` が無く、`hasNativeElement: true` だけがあったのはそのためです（[第 5 回](05-devtools-component-tree.md)）。
- 125 行目の `controlFlowBlock` は `@for`・`@defer` のノード（[第 6 回](06-devtools-control-flow.md)）、131〜137 行目の `SerializedInjector` は注入器の道のりの 1 段です（[第 16 回](16-devtools-injector-tree.md)）。

📄 `angular/devtools/projects/protocol/src/lib/messages.ts` L160–188 （▶ の行: 160, 177–178, 181–184, 186–187）

```ts
160 ▶ export enum PropType {
161 │   Number,
162 │   String,
163 │   Null,
164 │   Undefined,
165 │   Symbol,
166 │   HTMLNode,
167 │   Boolean,
168 │   BigInt,
169 │   Function,
170 │   Object,
171 │   Date,
172 │   Array,
173 │   Set,
174 │   Map,
175 │   Unknown,
176 │ 
177 ▶   // Special Type when an error occurs during property access
178 ▶   Error,
179 │ }
180 │ 
181 ▶ export interface Descriptor {
182 ▶   expandable: boolean;
183 ▶   value?: any;
184 ▶   editable: boolean;
185 │   type: PropType;
186 ▶   preview: string;
187 ▶   containerType: ContainerType;
188 │ }
```

`Descriptor` は 1 つのプロパティの値の送り方です。値そのものを送るとは限りません。182 行目の `expandable` が true（オブジェクトや配列）のときは、186 行目の `preview`（短い文字列）だけを送り、中身はパネルが開いたときに `getNestedProperties` で頼みます（[第 9 回](09-devtools-state-serializer.md)・[第 10 回](10-devtools-property-resolver.md)）。187 行目の `containerType` は signal かどうか、177〜178 行目の `PropType.Error` は getter が投げたときの印です。

📄 `angular/devtools/projects/protocol/src/lib/messages.ts` L254–282 （▶ の行: 254, 258, 274–276, 279–281）

```ts
254 ▶ export interface ComponentExplorerViewProperties {
255 │   [directive: string]: NestedProp[];
256 │ }
257 │ 
258 ▶ export enum PropertyQueryTypes {
259 │   All,
260 │   Specified,
261 │ }
262 │ 
263 │ export interface AllPropertiesQuery {
264 │   type: PropertyQueryTypes.All;
265 │ }
266 │ 
267 │ export interface SelectedPropertiesQuery {
268 │   type: PropertyQueryTypes.Specified;
269 │   properties: ComponentExplorerViewProperties;
270 │ }
271 │ 
272 │ export type PropertyQuery = AllPropertiesQuery | SelectedPropertiesQuery;
273 │ 
274 ▶ export interface ComponentExplorerViewQuery {
275 ▶   selectedElement: ElementPosition;
276 ▶   propertyQuery: PropertyQuery;
277 │ }
278 │ 
279 ▶ export interface ComponentExplorerView {
280 ▶   forest: DevToolsNode[];
281 ▶   properties?: DirectivesProperties;
282 │ }
```

`getLatestComponentExplorerView` の引数 `ComponentExplorerViewQuery`（274〜277 行目）は、選んでいる要素の位置と「どのプロパティを開いているか」です。返事の `ComponentExplorerView`（279〜282 行目）は木（`forest`）と、query があったときだけ選んだ要素のプロパティです。第 1 回のデモは query なしで送ったので、返事は `forest` だけでした。

📄 `angular/devtools/projects/protocol/src/lib/messages.ts` L299–318 （▶ の行: 305, 311, 314–317）

```ts
299 │ export interface DirectiveProfile {
300 │   name: string;
301 │   isElement: boolean;
302 │   isComponent: boolean;
303 │   lifecycle: LifecycleProfile;
304 │   outputs: OutputProfile;
305 ▶   changeDetection?: number;
306 │ }
307 │ 
308 │ export interface ElementProfile {
309 │   directives: DirectiveProfile[];
310 │   children: ElementProfile[];
311 ▶   type: 'element' | 'defer' | 'for';
312 │ }
313 │ 
314 ▶ export interface ProfilerFrame {
315 ▶   source: string;
316 ▶   duration: number;
317 ▶   directives: ElementProfile[];
318 │ }
```

📄 `angular/devtools/projects/protocol/src/lib/messages.ts` L360–382 （▶ の行: 366, 373, 375）

```ts
360 │ export interface AngularDetection {
361 │   // This is necessary because the runtime
362 │   // message listener handles messages globally
363 │   // including from other extensions. We don't
364 │   // want to set icon and/or popup based on
365 │   // a message coming from an unrelated extension.
366 ▶   isAngularDevTools: true;
367 │   isIvy: boolean;
368 │   isAngular: boolean;
369 │   isDebugMode: boolean;
370 │   isSupportedAngularVersion: boolean;
371 │ }
372 │ 
373 ▶ export type Topic = keyof Events;
374 │ 
375 ▶ export interface SupportedApis {
376 │   profiler: boolean;
377 │   dependencyInjection: boolean;
378 │   routes: boolean;
379 │   signals: boolean;
380 │   transferState: boolean;
381 │   signalPropertiesInspection: boolean;
382 │ }
```

`ProfilerFrame`（314〜318 行目）は変更検知 1 回分の記録で、要素ごとのディレクティブのライフサイクルフックと出力の時間を入れ子に持ちます（[第 13 回](13-devtools-profiler-capture.md)）。`SupportedApis`（375 行目〜）は [第 2 回](02-devtools-detect.md)の 7 節で、373 行目の `Topic` は `keyof Events`、つまりすべての topic の名前の合併です。次の節の `PriorityAwareMessageBus` は、この `Topic` をキーにした表で動きます。

## 4. なぜ優先度が要るのか：README の例

📄 `angular/devtools/projects/protocol/README.md` L11–19 （▶ の行: 11, 15–17, 19）

```md
11 ▶ We use the `PriorityAwareMessageBus` to ensure that certain messages have higher priority than others. Because of the asynchronous nature of the property exchange there's a risk that a message response may overwrite the result from a more recent response.
12 │ 
13 │ An example is:
14 │ 
15 ▶ 1. We request the state of the component tree
16 ▶ 1. We update the state
17 ▶ 1. We request the state of the properties of a particular component
18 │ 
19 ▶ We don't have guarantees that the response of 1. will arrive before the response of 3. Often the response of 1. is larger and might be delivered after 3. In such a case, it may contain the application state prior to the update and override the state update we received from 3.
```

15〜17 行目の順に、(1) 木を頼む → (2) 状態を更新する → (3) あるコンポーネントのプロパティを頼む、と送ったとします。19 行目のとおり、(1) の返事は大きいので (3) の返事より後に届くことがあり、そのとき (1) の古い状態が (3) の新しい状態を上書きしてしまいます。そこで「(3) の返事を待っているあいだは (1) を送らない」ことにした、というのが `PriorityAwareMessageBus` です。

## 5. PriorityAwareMessageBus：3 つの表

📄 `angular/devtools/projects/protocol/src/lib/priority-aware-message-bus.ts` L12–48 （▶ の行: 24–25, 34–35, 42–43, 46–47）

```ts
12 │ type ThrottleTopicDuration = {
13 │   [method in Topic]?: number;
14 │ };
15 │ 
16 │ type ThrottledTopics = {
17 │   [method in Topic]?: boolean;
18 │ };
19 │ 
20 │ type TopicsInProgress = {
21 │   [method in Topic]?: boolean;
22 │ };
23 │ 
24 ▶ const THROTTLE_METHODS: ThrottleTopicDuration = {
25 ▶   getLatestComponentExplorerView: 100,
26 │ };
27 │ 
28 │ type TopicBlockSequence = {
29 │   [method in Topic]?: Topic[];
30 │ };
31 │ 
32 │ // We can't refresh the view until we've received
33 │ // a response with the latest nested properties.
34 ▶ const TOPIC_BLOCK_SEQUENCE: TopicBlockSequence = {
35 ▶   getLatestComponentExplorerView: ['getNestedProperties'],
36 │ };
37 │ 
38 │ type TopicSequence = {
39 │   [method in Topic]?: Topic;
40 │ };
41 │ 
42 ▶ const TOPIC_RESPONSE: TopicSequence = {
43 ▶   getNestedProperties: 'nestedProperties',
44 │ };
45 │ 
46 ▶ const TOPIC_REQUEST: TopicSequence = {
47 ▶   nestedProperties: 'getNestedProperties',
48 │ };
```

| 表 | 中身 | 意味 |
| --- | --- | --- |
| `THROTTLE_METHODS`（24〜26 行目） | `getLatestComponentExplorerView: 100` | 送ったら 100ms は同じ topic を送らない |
| `TOPIC_BLOCK_SEQUENCE`（34〜36 行目） | `getLatestComponentExplorerView: ['getNestedProperties']` | `getNestedProperties` の返事待ちのあいだは送らない |
| `TOPIC_RESPONSE`（42〜44 行目） | `getNestedProperties: 'nestedProperties'` | この依頼を送ったら「返事待ち」にする |
| `TOPIC_REQUEST`（46〜48 行目） | `nestedProperties: 'getNestedProperties'` | この返事が来たら、その依頼の「返事待ち」を解く |

📄 `angular/devtools/projects/protocol/src/lib/priority-aware-message-bus.ts` L77–114 （▶ の行: 78–79, 81–82, 84, 89–90, 94–96, 98, 106, 110–111）

```ts
 77 │   override emit<E extends Topic>(topic: E, args?: Parameters<Events[E]>): boolean {
 78 ▶     if (this._throttled[topic]) {
 79 ▶       return false;
 80 │     }
 81 ▶     if (TOPIC_RESPONSE[topic]) {
 82 ▶       this._inProgress[topic] = true;
 83 │     }
 84 ▶     const blockedBy = TOPIC_BLOCK_SEQUENCE[topic];
 85 │     if (blockedBy) {
 86 │       // The source code here is safe.
 87 │       // TypeScript type inference ignores the null check here.
 88 │       for (const blocker of blockedBy!) {
 89 ▶         if (this._inProgress[blocker]) {
 90 ▶           return false;
 91 │         }
 92 │       }
 93 │     }
 94 ▶     if (THROTTLE_METHODS[topic]) {
 95 ▶       this._throttled[topic] = true;
 96 ▶       this._setTimeout(() => (this._throttled[topic] = false), THROTTLE_METHODS[topic]);
 97 │     }
 98 ▶     return this._bus.emit(topic, args);
 99 │   }
100 │ 
101 │   override destroy(): void {
102 │     this._bus.destroy();
103 │   }
104 │ 
105 │   private _afterMessage(topic: Topic): void {
106 ▶     const request = TOPIC_REQUEST[topic];
107 │     if (!request) {
108 │       return;
109 │     }
110 ▶     if (this._inProgress[request]) {
111 ▶       this._inProgress[request] = false;
112 │     }
113 │   }
114 │ }
```

1. **78〜80 行目：間引きの最中なら false**

   送らずに `false` を返します。**あとで送り直す仕組みはありません。** 落とされた依頼は消えます。
2. **81〜83 行目：返事のある依頼なら「返事待ち」にする**

   `getNestedProperties` を送るときに `_inProgress.getNestedProperties = true` です。
3. **84〜93 行目：止める相手が返事待ちなら false**

   `getLatestComponentExplorerView` は、`getNestedProperties` が返事待ちなら 90 行目で落とされます。
4. **94〜97 行目：通したら間引きを始める**

   96 行目の `_setTimeout` で 100ms 後に `_throttled` を戻します。最初の 1 つを通し、続きを落とす形の間引きです（最後の 1 つを遅れて送る形ではありません）。
5. **105〜113 行目：返事のあとで「返事待ち」を解く**

   `nestedProperties` の購読者を呼んだあとで、110〜111 行目で `_inProgress.getNestedProperties` を false にします。

📄 `angular/devtools/projects/protocol/src/lib/priority-aware-message-bus.ts` L50–75 （▶ の行: 55, 58, 64–66, 71, 73）

```ts
50 │ export class PriorityAwareMessageBus extends MessageBus<Events> {
51 │   private _throttled: ThrottledTopics = {};
52 │   private _inProgress: TopicsInProgress = {};
53 │ 
54 │   constructor(
55 ▶     private _bus: MessageBus<Events>,
56 │     // Binding is necessary to ensure that `setTimeout` is called in the global context.
57 │     // an doesn't throw "Illegal invocation" error.
58 ▶     private _setTimeout: typeof setTimeout = setTimeout.bind(globalThis),
59 │   ) {
60 │     super();
61 │   }
62 │ 
63 │   override on<E extends Topic>(topic: E, cb: Events[E]): () => void {
64 ▶     return this._bus.on(topic, (...args: any) => {
65 ▶       (cb as any)(...args);
66 ▶       this._afterMessage(topic);
67 │     });
68 │   }
69 │ 
70 │   override once<E extends Topic>(topic: E, cb: Events[E]): void {
71 ▶     return this._bus.once(topic, (...args: any) => {
72 │       (cb as any)(...args);
73 ▶       this._afterMessage(topic);
74 │     });
75 │   }
```

105 行目の `_afterMessage` を呼ぶのは、64〜67 行目と 71〜74 行目の包みだけです。つまり **「返事待ち」が解けるのは、誰かがこの bus で `nestedProperties` を `on` か `once` しているときだけ**です（パネルでは、プロパティの表の部品が購読しています。[第 10 回](10-devtools-property-resolver.md)）。58 行目の `setTimeout.bind(globalThis)` は、56〜57 行目のコメントのとおり、`setTimeout` をオブジェクトのメソッドとして呼ぶとブラウザが `Illegal invocation` を投げるのを避けるためで、spec はここに偽の `setTimeout` を渡します。

> [!NOTE]
> **ポイント**
>
> `PriorityAwareMessageBus` を使うのは**パネルの側だけ**です（拡張の `app.config.ts` と開発用の殻の `devtools-app.routes.ts`。[第 3 回](03-devtools-messaging.md)・[第 1 回](01-devtools-overview.md)）。バックエンド・content script・background は、来たものを順に処理するだけです。また「返事待ち」は topic ごとに 1 つの真偽値なので、`getNestedProperties` を 2 つ続けて送ると、最初の返事で 2 つとも解けたことになります。

## 6. DEMO：返事待ちと間引きを時刻で見る

> **🧪 DEMO — PriorityAwareMessageBus の判断（記録の再生）**
>
> これは記録です。本物の devtools のソース（angular/angular の `devtools/`、8576f161ae4）を、本物の @angular/core 22.1.6（開発モード）のアプリにつないで Node で動かした結果です。本物の `PriorityAwareMessageBus` を、片道 40ms かかる手作りの下の bus（`MessageBus` を継いだ `Pipe`）の上に作り、管の向こうに本物のバックエンドをつなぎました。送るたびに `PriorityAwareMessageBus` の中の `_inProgress` と `_throttled` を写しています（private のフィールドを読んでいるだけで、値は変えていません）。時刻は記録したときの ms です。
>
> 「1 行進める」などのボタンを押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-protocol)

記録から読み取れることです。

1. **0ms：「木の更新（返事の前）」は false**

   直前の `getNestedProperties` で `_inProgress.getNestedProperties` が true になっているので、5 節の 90 行目で落とされます。下の bus には何も流れていません（「下の bus が送る」の行がありません）。
2. **0ms：「ほかのメッセージ」（`setSelectedComponent`）は通る**

   止めるのは `getLatestComponentExplorerView` だけで、ほかの topic は返事待ちの影響を受けません。
3. **約 80ms：返事が届くと、購読者のあとで返事待ちが解ける**

   片道 40ms の往復で `nestedProperties` が届き、パネルの購読者が呼ばれたあとの状態で `getNestedProperties: false` になっています。
4. **「返事のあと」は通り、「すぐにもう 1 回」は間引きで false**

   通した瞬間に `_throttled.getLatestComponentExplorerView` が true になり、同じ ms の 2 回目は 78〜80 行目で落とされます。100ms 以上あとの「120ms 後」は、また通ります。

📄 `scratchpad の記録スクリプト（a/protocol.ts。build.mjs で束ねて node で実行）`

```
// devtools-protocol の記録: 本物の PriorityAwareMessageBus を、手で作った下の bus（片道 40ms かかる管）の上に作り、
// 向こう側に本物の backend をつなぐ。getNestedProperties の返事を待つあいだに getLatestComponentExplorerView を送ると
// どうなるか、間引き（100ms）がどう効くかを、時刻と PriorityAwareMessageBus の中の状態つきで記録する。
// 使い方: node ../_shared/build.mjs protocol.ts protocol.mjs && node protocol.mjs
import { Component, signal } from '@angular/core';
import { bootApp, makeBus, loadBackend, tick, writeJson, clone } from '../_shared/harness';
import { MessageBus, PriorityAwareMessageBus } from '~/angular-research/angular/devtools/projects/protocol';

@Component({ selector: 'app-root', template: '<p>{{ profile.name }} {{ count() }}</p>' })
class Root {
  profile = { name: 'Ada', langs: ['ts', 'js'] };
  count = signal(0);
}

await bootApp(Root);
const { initializeMessageBus } = await loadBackend();
const backend = makeBus();
initializeMessageBus(backend.bus as any);

const start = performance.now();
const now = () => Math.round(performance.now() - start);
const DELAY = 40; // 片道の時間（ms）。本物では window.postMessage と 2 本の Port を通る時間にあたる
const rows: any[] = [];
let pab: PriorityAwareMessageBus;
const state = () => clone({ inProgress: (pab as any)._inProgress, throttled: (pab as any)._throttled });

// パネル側の下の bus（MessageBus の約束を満たす管）。emit は DELAY 後に backend へ、backend の emit は DELAY 後にこちらの購読者へ
const handlers = new Map<string, Function[]>();
class Pipe extends MessageBus<any> {
  on(topic: string, cb: Function) {
    handlers.set(topic, [...(handlers.get(topic) ?? []), cb]);
    return () => handlers.set(topic, (handlers.get(topic) ?? []).filter((h) => h !== cb));
  }
  once(topic: string, cb: Function) {
    const off = this.on(topic, (...a: unknown[]) => { off(); cb(...a); });
  }
  emit(topic: string, args?: unknown[]) {
    rows.push({ t: now(), kind: '下の bus が送る', topic });
    setTimeout(() => {
      rows.push({ t: now(), kind: 'backend に届く', topic });
      backend.send(topic, args ?? []);
      // backend が同期で emit したもの（返事）を、DELAY 後にパネル側へ届ける
      for (const m of backend.take()) {
        setTimeout(() => {
          rows.push({ t: now(), kind: 'パネルに返事が届く', topic: m.topic });
          for (const h of [...(handlers.get(m.topic) ?? [])]) h(...m.args);
          rows.push({ t: now(), kind: '（購読者のあと）', topic: m.topic, state: state() });
        }, DELAY);
      }
    }, DELAY);
    return true;
  }
  destroy() { handlers.clear(); }
}

pab = new PriorityAwareMessageBus(new Pipe());
// パネルの部品と同じく、返事の topic を購読しておく（property-tab などが nestedProperties を on する）
pab.on('nestedProperties' as any, ((pos: unknown, data: any, path: unknown) => {
  rows.push({ t: now(), kind: 'パネルの購読者', topic: 'nestedProperties', note: `props: ${Object.keys(data?.props ?? {}).join(', ')}` });
}) as any);
pab.on('latestComponentExplorerView' as any, ((view: any) => {
  rows.push({ t: now(), kind: 'パネルの購読者', topic: 'latestComponentExplorerView', note: `forest: ${view.forest.length} 本` });
}) as any);

function send(label: string, topic: string, args?: unknown[]) {
  const ok = pab.emit(topic as any, args as any);
  rows.push({ t: now(), kind: 'PriorityAwareMessageBus.emit', topic, label, result: ok, state: state() });
}

// 1. 入れ子のプロパティを頼む（重い木の更新を止める側）
send('入れ子を開く', 'getNestedProperties', [{ element: [0] }, ['profile']]);
// 2. すぐに木の更新を頼む → 止められるはず
send('木の更新（返事の前）', 'getLatestComponentExplorerView', [undefined]);
// 3. ほかの軽いメッセージは止められない
send('ほかのメッセージ', 'setSelectedComponent', [[0]]);
await tick(DELAY * 2 + 30);
// 4. 返事のあと、木の更新を頼む → 通る。間引きが始まる
send('木の更新（返事のあと）', 'getLatestComponentExplorerView', [undefined]);
// 5. すぐにもう 1 回 → 間引きで落とされるはず
send('木の更新（すぐにもう 1 回）', 'getLatestComponentExplorerView', [undefined]);
await tick(120);
// 6. 100ms たったあと → 通る
send('木の更新（120ms 後）', 'getLatestComponentExplorerView', [undefined]);
await tick(DELAY * 2 + 30);

rows.sort((a, b) => a.t - b.t);
await writeJson(new URL('./protocol.json', import.meta.url).pathname, { delay: DELAY, rows });
process.exit(0);

```

共通の部品（`harness.ts`・`build.mjs`）は [第 1 回](01-devtools-overview.md)に全文があります。

## ここまでの呼び出し

- 👤 `messageBus.emit('getNestedProperties', [position, path])` — パネルのプロパティの部品
  - `PriorityAwareMessageBus.emit()` — priority-aware-message-bus.ts — *81〜83 行目で返事待ちにする*
    - `ChromeMessageBus.emit()` → … → バックエンド — 第 3 回の道 — *getNestedPropertiesCallback*
- 👤 `messageBus.emit('getLatestComponentExplorerView')` — パネルの木の部品
  - `PriorityAwareMessageBus.emit()` → `false` — priority-aware-message-bus.ts — *84〜93 行目で落とす*
- `nestedProperties` が Port に届く — パネル
  - `on()` の包み → 購読者 → `_afterMessage('nestedProperties')` — priority-aware-message-bus.ts — *110〜111 行目で返事待ちを解く*

## テストと直し方

### spec と describe

📄 `angular/devtools/projects/protocol/src/lib/priority-aware-message-bus.spec.ts` L30–63 （▶ の行: 30, 38, 40, 45, 47–48, 51, 58–62）

```ts
30 ▶ describe('PriorityAwareMessageBus', () => {
31 │   it('should emit not throttled requests', () => {
32 │     const timeout: any = (_: any, __: number) => {};
33 │     const bus = new PriorityAwareMessageBus(new MockMessageBus(), timeout);
34 │     expect(bus.emit('handshake')).toBeTrue();
35 │     expect(bus.emit('inspectorStart')).toBeTrue();
36 │   });
37 │ 
38 ▶   it('should throttle `getLatestComponentExplorerView`', () => {
39 │     let callback: any;
40 ▶     const timeout: any = (cb: any, _: number) => {
41 │       callback = cb;
42 │     };
43 │     const bus = new PriorityAwareMessageBus(new MockMessageBus(), timeout);
44 │     expect(bus.emit('getLatestComponentExplorerView')).toBeTrue();
45 ▶     expect(bus.emit('getLatestComponentExplorerView')).toBeFalse();
46 │     expect(bus.emit('getLatestComponentExplorerView')).toBeFalse();
47 ▶     callback();
48 ▶     expect(bus.emit('getLatestComponentExplorerView')).toBeTrue();
49 │   });
50 │ 
51 ▶   it('should not emit `getLatestComponentExplorerView` if blocked by `getNestedProperties`', () => {
52 │     let callback: any;
53 │     const timeout: any = (cb: any, _: number) => {
54 │       callback = cb;
55 │     };
56 │     const mock = new MockMessageBus();
57 │     const bus = new PriorityAwareMessageBus(mock, timeout);
58 ▶     bus.on('nestedProperties', () => {});
59 ▶     expect(bus.emit('getNestedProperties')).toBeTrue();
60 ▶     expect(bus.emit('getLatestComponentExplorerView')).toBeFalse();
61 ▶     mock.cbs.nestedProperties();
62 ▶     expect(bus.emit('getLatestComponentExplorerView')).toBeTruthy();
63 │   });
```

protocol の spec はこの 3 件だけです（下の bus の偽物 `MockMessageBus` は、`on` の cb を topic ごとに 1 つ覚えて `cbs` に置くだけです）。38〜49 行目は間引きで、40 行目の偽の `setTimeout` が cb を覚えておき、47 行目で手で呼んで 100ms が過ぎたことにします。51〜63 行目は返事待ちで、58 行目でこの bus の `on('nestedProperties')` をしておき、61 行目で偽物に覚えさせた包みを呼ぶと、62 行目で通るようになります。「`nestedProperties` を誰も購読していないと返事待ちが解けない」ことや、`once` の包みを確かめる it はありません。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //devtools/projects/protocol:test --nocache_test_results --test_output=all
# 1 つのブラウザだけで速く回すとき
pnpm bazel test //devtools/projects/protocol:test_chromium --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/devtools-logs/a-tests.log・a-filter.log）`

```
//devtools/projects/protocol:test_chromium   1/1 test files | 3 passed, 0 failed   PASSED in 1.9s
//devtools/projects/protocol:test_firefox    1/1 test files | 3 passed, 0 failed   PASSED in 5.1s
（_chromium だけ・--test_filter=throttle 付き: 3 passed  PASSED in 0.8s  Elapsed 4.1s）
```

- `//devtools/projects/protocol:test` は `_chromium` と `_firefox` の 2 つのターゲットになり、どちらも 3 件です（第 1 回の表のほかの 6 つと同じ 1 回の bazel、Elapsed 47.4 秒）。
- `--test_filter=throttle` を付けても 3 件すべてが走ったので、絞り込みは効きません。`_chromium` だけなら 4.1 秒で回ります。

### 直すとしたら

- 「プロパティを開いた直後に木が更新されない・古い値に戻る」は `priority-aware-message-bus.ts` の 3 つの表と `emit` です。spec はこのファイルの形（`MockMessageBus` と偽の `setTimeout`）で足します。
- 新しい topic を足すときは `messages.ts` の `Events` に 1 行足し、バックエンドの `subscribeToClientEvents` に `on` を足し、パネルの部品から `emit` します。content script と background は topic を読まないので変えなくてよいことが、[第 3 回](03-devtools-messaging.md)の 3 節で分かります。古い版の Angular で動かない機能なら、[第 2 回](02-devtools-detect.md)の `SupportedApis` にも足します。
- 2 節の注意（`contentScriptDisconnected` の引数の数）のような型と実物のずれは、`Events` を通らずに `port.postMessage` を書いている所で起きます。`tab_manager.ts` を読むと見つかります。
- 2025-11 以降に `devtools/projects/protocol` を変えたコミット（`git log --since=2025-11-01 -- devtools/projects/protocol`、31 件）の多くは、機能ごとに topic や型を足したものです。小さな例が 82a767535e5（2026-07-20、「Watch signal」のボタン）で、`messages.ts` に `toggleWatchSignal` の 1 行と `DebugSignalGraphNode.watched` を足し、`subscribeToClientEvents` に `on('toggleWatchSignal', …)` を足し、パネルの `signal-details` から `emit` しています。バックエンドは `ng.toggleWatchSignal?.(id)` と `?.` で呼ぶので、core の側の関数（同じ日の d45bd2f53d8）が無い版でも投げません（[第 17 回](17-devtools-signal-graph.md)）。07605ba793b（2026-08-13、CD analyzer）も同じ形で、`CdElementData` の型と 5 つの topic を足しています（[第 15 回](15-devtools-cd-analyzer.md)）。
- 本家に PR を出すことは勧めません。issue を読むときは、まず「パネルが送ったか（emit が false で落ちていないか）」「バックエンドが答えたか」を分けると、この章の範囲か機能の章の範囲かが分かります（[第 20 回](20-devtools-issues.md)）。

## 聞かれそうな質問

**Q. Events に書いてある関数は、どこで呼ばれるのですか？**

どこでも呼ばれません。`Events` は topic ごとの引数の型の表で、`MessageBus<Events>` の `on`・`emit` の型を決めるだけです（`message-bus.ts` の 12〜15 行目）。実際に送られるのは topic の文字列と引数の配列です。

**Q. PriorityAwareMessageBus に止められたメッセージは、あとで送られますか？**

送られません。`emit` は 79 行目か 90 行目で `false` を返して終わりで、どこにも積みません。木の更新は、次の `componentTreeDirty` などで呼び出し側がもう一度頼むことで追いつきます。

**Q. なぜ止めるのは getLatestComponentExplorerView だけなのですか？**

README の 15〜19 行目の問題、つまり大きくて遅い木の返事が、新しいプロパティの返事を古い状態で上書きすることを防ぐためだからです。表（34〜36 行目）にあるのはこの 1 組だけで、ほかの topic はそのまま通ります。

**Q. バックエンドの側にも優先度の仕組みはありますか？**

ありません。`PriorityAwareMessageBus` を作るのはパネルの `app.config.ts`（拡張）と `devtools-app.routes.ts`（開発用の殻）だけで、バックエンドは `SamePageMessageBus` を直接受け取ります（[第 2 回](02-devtools-detect.md)の 5 節）。

**Q. DevToolsNode の nativeElement はパネルに届きますか？**

届きません。122 行目の `Node` は送れない値なので、バックエンドが送る前に外します（[第 5 回](05-devtools-component-tree.md)）。パネルから要素を指すときは、要素の位置（`ElementPosition`、数の配列）を送ります。

## 読み終えて

- `Events` は topic ごとの引数の型の表で、`MessageBus<Events>` の 4 つのメソッドの型を決めます。向きは型に書かれていません。
- パネルが頼むのは `get…`・`query…`、ページが返すのは `latest…` や名詞の topic です。接続のための topic は殻の部品どうしで使います。
- 送れない値（DOM のノード・注入器）は型にあっても送る前に外され、大きな値は `Descriptor` の `preview` と後からの `getNestedProperties` に分けて送ります。
- `PriorityAwareMessageBus` はパネルの側だけで、`getNestedProperties` の返事待ちのあいだ `getLatestComponentExplorerView` を落とし、100ms に 1 回に間引きます。落としたものは送り直しません。

---

← 前: [メッセージの道：ページから DevTools のパネルまで](03-devtools-messaging.md)  
次: [コンポーネントの木を集める：getDirectiveForest](05-devtools-component-tree.md) →
