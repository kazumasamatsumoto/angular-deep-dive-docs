[目次](../README.md) › [SSR とハイドレーション](README.md) › 第 8 回 / 全 15 回

# annotateForHydration：サーバーで DOM の形を ngh に書き出す

> サーバーで annotateForHydration が appRef.components を回り、コンポーネントの LView ごとに serializeLView で SerializedView（テンプレートの番号、コンテナのビュー、要素コンテナの大きさ、切り離されたノード、ノードの道順）を作り、同じ内容を 1 つにまとめて ngh 属性に番号を書き、配列を TransferState（キー \_\_nghData\_\_）に入れる行。テキストノードの境目の印（ngtns / ngetn）、ShadowDom のコンポーネントを飛ばす理由、nghm の印。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/hydration-annotate)

---

ブラウザがサーバーの DOM を引き取るには、「この `@if` はどちらの分岐が描かれたか」「この `@for` はビューが何個あったか」のように、**DOM だけからは分からない形の情報**が要ります。この章では、サーバーで描画が終わった直後に `annotateForHydration` がそれを `SerializedView` というオブジェクトにまとめ、コンポーネントのホスト要素に `ngh="番号"` を書き、中身を TransferState（キー `__nghData__`）に入れるまでを 1 行ずつ追います。

読む対象は `packages/core/src/hydration/annotate.ts` と、同じフォルダの `interfaces.ts`・`utils.ts`、呼び出し元の `packages/platform-server/src/utils.ts` です。

1. [1. 概観](01-ssr-overview.md)
2. [2. renderApplication](02-ssr-render-application.md)
3. [3. platformServer と domino](03-ssr-platform-server.md)
4. [4. AngularAppEngine](04-ssr-app-engine.md)
5. [5. サーバールート](05-ssr-server-routes.md)
6. [6. プリレンダー](06-ssr-prerender.md)
7. [7. provideClientHydration](07-hydration-provide.md)
8. **8. ngh の書き出し**（この章）
9. [9. ノードの道順](09-hydration.md)
10. [10. ノードの確保](10-hydration-claim.md)
11. [11. コンテナと片付け](11-hydration-containers.md)
12. [12. 不一致のエラー](12-hydration-errors.md)
13. [13. i18n](13-hydration-i18n.md)
14. [14. イベントの再生](14-event-replay.md)
15. [15. インクリメンタル](15-incremental-hydration.md)

## 1. いつ呼ばれるか：アプリが安定した後、HTML にする直前

サーバーの描画は、アプリが安定するのを待ってから `prepareForHydration` を呼び、そのあと DOM を文字列にします（[第 2 回](02-ssr-render-application.md)）。`prepareForHydration` は、[第 7 回](07-hydration-provide.md)の `IS_HYDRATION_DOM_REUSE_ENABLED` が false なら何もせずに戻り、true なら次の 2 つをこの順に呼びます。

1 つめの `appendSsrContentIntegrityMarker` は、body の先頭に `<!--nghm-->` のコメントを 1 つ差し込むだけの関数です（中身は [第 2 回](02-ssr-render-application.md)で引用しています）。ブラウザはこの印が残っているかで「HTML が途中で書き換えられていないか」を確かめます（[第 7 回](07-hydration-provide.md)の `verifySsrContentsIntegrity`）。2 つめが `annotateForHydration(applicationRef, doc)` で、ここからがこの章の本題です。

## 2. annotateForHydration：ルートのビューを回して、最後に TransferState へ

📄 `angular/packages/core/src/hydration/annotate.ts` L243–273 （▶ の行: 247–249, 257–258, 262–263）

```ts
243 │ export function annotateForHydration(appRef: ApplicationRef, doc: Document) {
244 │   const injector = appRef.injector;
245 │   const isI18nHydrationEnabledVal = isI18nHydrationEnabled(injector);
246 │   const isIncrementalHydrationEnabledVal = isIncrementalHydrationEnabled(injector);
247 ▶   const serializedViewCollection = new SerializedViewCollection();
248 ▶   const corruptedTextNodes = new Map<HTMLElement, TextNodeMarker>();
249 ▶   const viewRefs = appRef._views;
250 │   const shouldReplayEvents = injector.get(IS_EVENT_REPLAY_ENABLED, EVENT_REPLAY_ENABLED_DEFAULT);
251 │   const eventTypesToReplay = {
252 │     regular: new Set<string>(),
253 │     capture: new Set<string>(),
254 │   };
255 │   const deferBlocks = new Map<string, SerializedDeferBlock>();
256 │   const appId = appRef.injector.get(APP_ID);
257 ▶   for (const viewRef of viewRefs) {
258 ▶     const lNode = getLNodeForHydration(viewRef);
259 │ 
260 │     // An `lView` might be `null` if a `ViewRef` represents
261 │     // an embedded view (not a component view).
262 ▶     if (lNode !== null) {
263 ▶       const context: HydrationContext = {
264 │         serializedViewCollection,
265 │         corruptedTextNodes,
266 │         isI18nHydrationEnabled: isI18nHydrationEnabledVal,
267 │         isIncrementalHydrationEnabled: isIncrementalHydrationEnabledVal,
268 │         i18nChildren: new Map(),
269 │         eventTypesToReplay,
270 │         shouldReplayEvents,
271 │         appId,
272 │         deferBlocks,
273 │       };
```

1. **247〜248 行目：ページ全体で 1 つずつの入れ物**

   247 行目の `SerializedViewCollection` が、書き出す `SerializedView` の配列です（4 節）。248 行目の `corruptedTextNodes` は、HTML にすると消えてしまうテキストノードの記録です（8 節）。
2. **249・257 行目：`appRef._views` を回す**

   ブートストラップしたルートコンポーネント（このサイトなら `App`）のビューが入っています。普通は 1 つです。
3. **258 行目：`getLNodeForHydration` で LView を取り出す**

   LView はコンポーネント 1 つ分の実行時データの配列です（[LView の章](../ivy/06-ivy-lview.md)）。埋め込みビューなら `null` が返り、262 行目で飛ばされます。
4. **263〜273 行目：`HydrationContext` を作る**

   入れ物 2 つと、i18n・インクリメンタル・イベント再生の設定を 1 つのオブジェクトにまとめ、再帰の間ずっと持ち回ります。

📄 `angular/packages/core/src/hydration/annotate.ts` L140–155 （▶ の行: 146–147）

```ts
140 │ /**
141 │  * Describes a context available during the serialization
142 │  * process. The context is used to share and collect information
143 │  * during the serialization.
144 │  */
145 │ export interface HydrationContext {
146 ▶   serializedViewCollection: SerializedViewCollection;
147 ▶   corruptedTextNodes: Map<HTMLElement, TextNodeMarker>;
148 │   isI18nHydrationEnabled: boolean;
149 │   isIncrementalHydrationEnabled: boolean;
150 │   i18nChildren: Map<TView, Set<number> | null>;
151 │   eventTypesToReplay: {regular: Set<string>; capture: Set<string>};
152 │   shouldReplayEvents: boolean;
153 │   appId: string; // the value of `APP_ID`
154 │   deferBlocks: Map<string /* defer block id, e.g. `d0` */, SerializedDeferBlock>;
155 │ }
```

📄 `angular/packages/core/src/hydration/annotate.ts` L274–301 （▶ の行: 274–275, 277, 279, 288, 290, 292）

```ts
274 ▶       if (isLContainer(lNode)) {
275 ▶         annotateLContainerForHydration(lNode, context);
276 │       } else {
277 ▶         annotateComponentLViewForHydration(lNode, context);
278 │       }
279 ▶       insertCorruptedTextNodeMarkers(corruptedTextNodes, doc);
280 │     }
281 │   }
282 │ 
283 │   // Note: we *always* include hydration info key and a corresponding value
284 │   // into the TransferState, even if the list of serialized views is empty.
285 │   // This is needed as a signal to the client that the server part of the
286 │   // hydration logic was setup and enabled correctly. Otherwise, if a client
287 │   // hydration doesn't find a key in the transfer state - an error is produced.
288 ▶   const serializedViews = serializedViewCollection.getAll();
289 │   const transferState = injector.get(TransferState);
290 ▶   transferState.set(NGH_DATA_KEY, serializedViews);
291 │ 
292 ▶   if (deferBlocks.size > 0) {
293 │     const blocks: {[key: string]: SerializedDeferBlock} = {};
294 │     for (const [id, info] of deferBlocks.entries()) {
295 │       blocks[id] = info;
296 │     }
297 │     transferState.set(NGH_DEFER_BLOCKS_KEY, blocks);
298 │   }
299 │ 
300 │   return eventTypesToReplay;
301 │ }
```

274〜278 行目、ルートが `ViewContainerRef` の土台を兼ねているとき（ルートコンポーネントで `ViewContainerRef` を inject したとき）は `annotateLContainerForHydration`、普通は 277 行目の `annotateComponentLViewForHydration` です。279 行目で、溜めたテキストノードの印を DOM に入れます（8 節）。

288〜290 行目で、集めた配列を `NGH_DATA_KEY` で TransferState に入れます。283〜287 行目のコメントのとおり、**配列が空でも必ず入れます**。ブラウザはこのキーがあるかどうかで「サーバー側でハイドレーションが有効だったか」を判断するからです（[第 7 回](07-hydration-provide.md)の `withDomHydration`）。292〜298 行目の `@defer` の情報は [第 15 回](15-incremental-hydration.md)で読みます。TransferState はこのあと `<script id="ng-state">` として HTML に書かれます（[転送キャッシュの章](../http/11-http-transfer-cache.md)）。

📄 `angular/packages/core/src/hydration/utils.ts` L46–57 （▶ の行: 50, 55–56）

```ts
46 │ /**
47 │  * The name of the key used in the TransferState collection,
48 │  * where hydration information is located.
49 │  */
50 ▶ const TRANSFER_STATE_TOKEN_ID = '__nghData__';
51 │ 
52 │ /**
53 │  * Lookup key used to reference DOM hydration data (ngh) in `TransferState`.
54 │  */
55 ▶ export const NGH_DATA_KEY: StateKey<SerializedView[]> =
56 ▶   makeStateKey<Array<SerializedView>>(TRANSFER_STATE_TOKEN_ID);
57 │ 
```

## 3. ホスト要素に ngh を書く、または ngSkipHydration を書く

📄 `angular/packages/core/src/hydration/annotate.ts` L176–191 （▶ の行: 184, 187–188）

```ts
176 │ /**
177 │  * Annotates root level component's LView for hydration,
178 │  * see `annotateHostElementForHydration` for additional information.
179 │  */
180 │ function annotateComponentLViewForHydration(
181 │   lView: LView,
182 │   context: HydrationContext,
183 │ ): number | null {
184 ▶   const hostElement = lView[HOST];
185 │   // Root elements might also be annotated with the `ngSkipHydration` attribute,
186 │   // check if it's present before starting the serialization process.
187 ▶   if (hostElement && !(hostElement as HTMLElement).hasAttribute(SKIP_HYDRATION_ATTR_NAME)) {
188 ▶     return annotateHostElementForHydration(hostElement as HTMLElement, lView, null, context);
189 │   }
190 │   return null;
191 │ }
```

184 行目の `lView[HOST]` がルートコンポーネントのホスト要素（`<app-root>`）です。187 行目、利用者が `ngSkipHydration` 属性を付けていたら何も書きません。付いていなければ 188 行目へ。

📄 `angular/packages/core/src/hydration/annotate.ts` L837–843 （▶ の行: 838–840）

```ts
837 │   } else {
838 ▶     const ngh = serializeLView(lView, parentDeferBlockId, context);
839 ▶     const index = context.serializedViewCollection.add(ngh);
840 ▶     renderer.setAttribute(element, NGH_ATTR_NAME, index.toString());
841 │     return index;
842 │   }
843 │ }
```

これは `annotateHostElementForHydration` の後半です。前半（[第 13 回](13-hydration-i18n.md)で引用）は、テンプレートに i18n があるのに `withI18nSupport()` が無いコンポーネントと、ShadowDom を使うコンポーネント（下の `componentUsesShadowDomEncapsulation`）を見分け、そのときは ngh の代わりに **ngSkipHydration 属性をサーバーが付けて**`null` を返します。ブラウザはこの属性を見て、そのコンポーネントの中を引き取らずに作り直します（[第 12 回](12-hydration-errors.md)）。

それ以外は 838 行目の `serializeLView` で中身を作り（5〜7 節）、839 行目でコレクションに入れて番号を得て、840 行目で `ngh` 属性に書きます。属性には**番号だけ**を書き、中身は TransferState 側です。

📄 `angular/packages/core/src/hydration/annotate.ts` L792–804 （▶ の行: 801–802）

```ts
792 │ /**
793 │  * Determines whether a component instance that is represented
794 │  * by a given LView uses `ViewEncapsulation.ShadowDom`.
795 │  */
796 │ function componentUsesShadowDomEncapsulation(lView: LView): boolean {
797 │   const instance = lView[CONTEXT];
798 │   if (!instance?.constructor) return false;
799 │   const def = getComponentDef(instance.constructor);
800 │   return (
801 ▶     def?.encapsulation === ViewEncapsulation.ShadowDom ||
802 ▶     def?.encapsulation === ViewEncapsulation.ExperimentalIsolatedShadowDom
803 │   );
804 │ }
```

801〜802 行目、`ShadowDom` と `ExperimentalIsolatedShadowDom` が対象です。理由は、サーバーの DOM 実装（domino。[第 3 回](03-ssr-platform-server.md)）は Shadow DOM を持たないので、サーバーとブラウザで DOM が同じ形になる保証がないからです。

## 4. SerializedViewCollection：同じ中身は 1 つにまとめる

📄 `angular/packages/core/src/hydration/annotate.ts` L93–117 （▶ の行: 104–108, 111）

```ts
 93 │ /**
 94 │  * A collection that tracks all serialized views (`ngh` DOM annotations)
 95 │  * to avoid duplication. An attempt to add a duplicate view results in the
 96 │  * collection returning the index of the previously collected serialized view.
 97 │  * This reduces the number of annotations needed for a given page.
 98 │  */
 99 │ class SerializedViewCollection {
100 │   private views: SerializedView[] = [];
101 │   private indexByContent = new Map<string, number>();
102 │ 
103 │   add(serializedView: SerializedView): number {
104 ▶     const viewAsString = JSON.stringify(serializedView);
105 ▶     if (!this.indexByContent.has(viewAsString)) {
106 ▶       const index = this.views.length;
107 ▶       this.views.push(serializedView);
108 ▶       this.indexByContent.set(viewAsString, index);
109 │       return index;
110 │     }
111 ▶     return this.indexByContent.get(viewAsString)!;
112 │   }
113 │ 
114 │   getAll(): SerializedView[] {
115 │     return this.views;
116 │   }
117 │ }
```

104 行目で `SerializedView` を `JSON.stringify` し、その文字列をキーに Map を引きます。初めての形なら 105〜109 行目で配列の末尾に足してその番号を返し、**見たことのある形なら 111 行目で前の番号を返します**。同じコンポーネントを 100 個並べても、中の形が同じなら `__nghData__` の中身は 1 件で、100 個のホストが同じ `ngh="3"` を指します。

📄 `angular/packages/core/src/hydration/utils.ts` L78–88 （▶ の行: 83, 88）

```ts
78 │ /**
79 │  * The name of the attribute that would be added to host component
80 │  * nodes and contain a reference to a particular slot in transferred
81 │  * state that contains the necessary hydration info for this component.
82 │  */
83 ▶ export const NGH_ATTR_NAME = 'ngh';
84 │ 
85 │ /**
86 │  * Marker used in a comment node to ensure hydration content integrity
87 │  */
88 ▶ export const SSR_CONTENT_INTEGRITY_MARKER = 'nghm';
```

83 行目が属性名、88 行目が 1 節の `nghm` です。79〜82 行目のコメントのとおり、`ngh` は「転送された状態の何番目か」を指す参照です。中身を属性に直接書かないのは、この重複のまとめが効かなくなるのと、要素ごとに長い JSON を書くと HTML が膨らむからです。

## 5. SerializedView のキーは 1 文字

📄 `angular/packages/core/src/hydration/interfaces.ts` L32–50 （▶ の行: 36–44）

```ts
32 │ /**
33 │  * Keys within serialized view data structure to represent various
34 │  * parts. See the `SerializedView` interface below for additional information.
35 │  */
36 ▶ export const ELEMENT_CONTAINERS = 'e';
37 ▶ export const TEMPLATES = 't';
38 ▶ export const CONTAINERS = 'c';
39 ▶ export const MULTIPLIER = 'x';
40 ▶ export const NUM_ROOT_NODES = 'r';
41 ▶ export const TEMPLATE_ID = 'i'; // as it's also an "id"
42 ▶ export const NODES = 'n';
43 ▶ export const DISCONNECTED_NODES = 'd';
44 ▶ export const I18N_DATA = 'l';
45 │ export const DEFER_BLOCK_ID = 'di';
46 │ export const DEFER_BLOCK_STATE = 's';
47 │ export const DEFER_PARENT_BLOCK_ID = 'p';
48 │ export const DEFER_HYDRATE_TRIGGERS = 't';
49 │ export const DEFER_PREFETCH_TRIGGERS = 'pt';
50 │ 
```

HTML に毎回載るので、キーは 1〜2 文字です。`__nghData__` に出てくるのは 36〜46 行目です （47〜49 行目は `@defer` 用の別の構造 `__nghDeferData__` で使います）。スロット番号はどれも `HEADER_OFFSET` を引いた番号（テンプレートの命令に書かれる番号）です。

| キー | 定数 | 値 | 例 |
| --- | --- | --- | --- |
| `e` | `ELEMENT_CONTAINERS` | スロット → `<ng-container>` の中のルートノード数 | `"e":{"3":2}` |
| `t` | `TEMPLATES` | スロット → テンプレートの TView の id（`getSsrId`） | `"t":{"2":"t0"}` |
| `c` | `CONTAINERS` | スロット → コンテナに入っていたビューの配列 | `"c":{"2":[{"i":"t0","r":1}]}` |
| `x` | `MULTIPLIER` | 同じ形のビューが連続した回数（コンテナの中のビューに付く） | `{"i":"t13","r":1,"x":12}` |
| `r` | `NUM_ROOT_NODES` | そのビューのルートノード数（コンテナの中のビューに付く） | `"r":2` |
| `i` | `TEMPLATE_ID` | そのビューを作った TView の id。コンポーネントなら `c` で始まるコンポーネント id | `"i":"t2"` |
| `n` | `NODES` | スロット → ノードの道順（[第 9 回](09-hydration.md)） | `"n":{"1":"0f2nf"}` |
| `d` | `DISCONNECTED_NODES` | DOM に繋がっていなかったスロットの配列 | `"d":[4]` |
| `l` | `I18N_DATA` | i18n ブロックの ICU の分岐（[第 13 回](13-hydration-i18n.md)） | — |
| `di` / `s` | `DEFER_BLOCK_ID` / `DEFER_BLOCK_STATE` | `@defer` の id と状態（[第 15 回](15-incremental-hydration.md)） | `"di":"d0","s":2` |

## 6. serializeLView：スロットを先頭から 1 つずつ

`serializeLView` は空のオブジェクト `ngh` を作り、LView の `HEADER_OFFSET` から `bindingStartIndex` まで、つまり**テンプレートのノードが入っている区間**（その後ろはバインディングの値）を 1 スロットずつ回ります。関数の頭（イベント再生用の情報集めとループの開始）は [第 14 回](14-event-replay.md)、ループの最初の i18n の処理は [第 13 回](13-hydration-i18n.md)で引用しています。各スロットでは、TNode（ノードの静的な情報。[TNode の章](../ivy/04-ivy-tnode.md)）を見て次のように分岐します。

### テンプレートの id と、切り離されたノード

📄 `angular/packages/core/src/hydration/annotate.ts` L584–616 （▶ の行: 590, 597, 602–604, 613–615）

```ts
584 │     // Skip processing of a given slot in the following cases:
585 │     // - Local refs (e.g. <div #localRef>) take up an extra slot in LViews
586 │     //   to store the same element. In this case, there is no information in
587 │     //   a corresponding slot in TNode data structure.
588 │     // - When a slot contains something other than a TNode. For example, there
589 │     //   might be some metadata information about a defer block or a control flow block.
590 ▶     if (!isTNodeShape(tNode)) {
591 │       continue;
592 │     }
593 │ 
594 │     // Skip any nodes that are in an i18n block but are considered detached (i.e. not
595 │     // present in the template). These nodes are disconnected from the DOM tree, and
596 │     // so we don't want to serialize any information about them.
597 ▶     if (isDetachedByI18n(tNode)) {
598 │       continue;
599 │     }
600 │ 
601 │     // Serialize information about template.
602 ▶     if (isLContainer(lView[i]) && tNode.tView) {
603 ▶       ngh[TEMPLATES] ??= {};
604 ▶       ngh[TEMPLATES][noOffsetIndex] = getSsrId(tNode.tView!);
605 │     }
606 │ 
607 │     // Check if a native node that represents a given TNode is disconnected from the DOM tree.
608 │     // Such nodes must be excluded from the hydration (since the hydration won't be able to
609 │     // find them), so the TNode ids are collected and used at runtime to skip the hydration.
610 │     // This situation may happen during the content projection, when some nodes don't make it
611 │     // into one of the content projection slots (for example, when there is no default
612 │     // <ng-content /> slot in projector component's template).
613 ▶     if (isDisconnectedNode(tNode, lView) && isContentProjectedNode(tNode)) {
614 ▶       appendDisconnectedNodeIndex(ngh, tNode);
615 ▶       continue;
616 │     }
```

1. **590 行目：TNode でないスロットは飛ばす**

   `#ref` のローカル参照や、`@defer`・制御フローのメタデータが入るスロットです（585〜589 行目のコメント）。
2. **602〜604 行目：テンプレートなら `t` に TView の id**

   スロットが LContainer（ビューを入れる箱。[LContainer の章](../ivy/11-ivy-lcontainer.md)）で、TNode がテンプレートを持つとき、つまり `@if`・`@for`・`<ng-template>` のとき、`getSsrId` で付けた id を書きます。
3. **613〜615 行目：DOM に繋がっていない投影ノードは `d`**

   子コンポーネントに渡したけれど、子の `<ng-content>` のどこにも入らなかったノードは、作られたのに DOM にありません。ブラウザで探しても見つからないので、番号を `d` に入れて「探さずに作れ」と伝えます。

📄 `angular/packages/core/src/hydration/annotate.ts` L119–138 （▶ の行: 123, 134–135）

```ts
119 │ /**
120 │  * Global counter that is used to generate a unique id for TViews
121 │  * during the serialization process.
122 │  */
123 ▶ let tViewSsrId = 0;
124 │ 
125 │ /**
126 │  * Generates a unique id for a given TView and returns this id.
127 │  * The id is also stored on this instance of a TView and reused in
128 │  * subsequent calls.
129 │  *
130 │  * This id is needed to uniquely identify and pick up dehydrated views
131 │  * at runtime.
132 │  */
133 │ function getSsrId(tView: TView): string {
134 ▶   if (!tView.ssrId) {
135 ▶     tView.ssrId = `t${tViewSsrId++}`;
136 │   }
137 │   return tView.ssrId;
138 │ }
```

123 行目のモジュール変数を数えて、134〜135 行目で TView に `t0`・`t1`… を一度だけ振ります。TView は同じテンプレートで共有されるので、同じ `@for` から出たビューは同じ id になります。ブラウザはこの id で「このビューはどのテンプレートから作られたか」を照合します（[第 11 回](11-hydration-containers.md)）。

このあとに続くのは、子コンポーネントに投影したノードの道順を書く分岐（`tNode.projection` を回すところ）です。[第 9 回](09-hydration.md)で読みます。

### コンテナ：入っていたビューを全部書く

📄 `angular/packages/core/src/hydration/annotate.ts` L657–685 （▶ の行: 657–658, 665, 669, 678–679）

```ts
657 ▶     conditionallyAnnotateNodePath(ngh, tNode, lView, i18nChildren);
658 ▶     if (isLContainer(lView[i])) {
659 │       // Serialize views within this LContainer.
660 │       const hostNode = lView[i][HOST]!; // host node of this container
661 │ 
662 │       // LView[i][HOST] can be of 2 different types:
663 │       // - either a DOM node
664 │       // - or an array that represents an LView of a component
665 ▶       if (Array.isArray(hostNode)) {
666 │         // This is a component, serialize info about it.
667 │         const targetNode = unwrapRNode(hostNode as LView) as RElement;
668 │         if (!(targetNode as HTMLElement).hasAttribute(SKIP_HYDRATION_ATTR_NAME)) {
669 ▶           annotateHostElementForHydration(
670 │             targetNode,
671 │             hostNode as LView,
672 │             parentDeferBlockId,
673 │             context,
674 │           );
675 │         }
676 │       }
677 │ 
678 ▶       ngh[CONTAINERS] ??= {};
679 ▶       ngh[CONTAINERS][noOffsetIndex] = serializeLContainer(
680 │         lView[i],
681 │         tNode,
682 │         lView,
683 │         parentDeferBlockId,
684 │         context,
685 │       );
```

657 行目の `conditionallyAnnotateNodePath` は道順が要るかの判定で、[第 9 回](09-hydration.md)の主題です。658 行目、スロットが LContainer なら、665〜675 行目で「コンテナの土台がコンポーネント」の場合はそのコンポーネントにも ngh を書き、678〜679 行目で `c` にビューの一覧を書きます。一覧を作るのが `serializeLContainer` です。

📄 `angular/packages/core/src/hydration/annotate.ts` L357–375 （▶ の行: 360–361, 365, 367–368, 371–373）

```ts
357 │     if (!serializedView) {
358 │       const childTView = childLView[TVIEW];
359 │ 
360 ▶       if (childTView.type === TViewType.Component) {
361 ▶         template = childTView.ssrId!;
362 │ 
363 │         // This is a component view, thus it has only 1 root node: the component
364 │         // host node itself (other nodes would be inside that host node).
365 ▶         numRootNodes = 1;
366 │       } else {
367 ▶         template = getSsrId(childTView);
368 ▶         numRootNodes = calcNumRootNodes(childTView, childLView, childTView.firstChild);
369 │       }
370 │ 
371 ▶       serializedView = {
372 ▶         [TEMPLATE_ID]: template,
373 ▶         [NUM_ROOT_NODES]: numRootNodes,
374 │       };
375 │ 
```

1. **360〜365 行目：コンポーネントのビューなら `r` は 1**

   `<router-outlet>` や `createComponent` でコンテナに入ったコンポーネントです。ルートノードはホスト要素 1 つだけ（中身はホストの内側）なので 365 行目で 1。id は 361 行目、コンポーネント定義から作られた id（`c` で始まる）です。
2. **367〜368 行目：埋め込みビューなら id を振り、ルートノードを数える**

   `@if` の分岐や `@for` の 1 回分です。数え方は下の `calcNumRootNodes`。
3. **371〜374 行目：`{i, r}` の組を作る**

   このすぐ後で `@defer` なら情報を足し（[第 15 回](15-incremental-hydration.md)）、最後にビューの中身を `serializeLView` で再帰的に作って同じオブジェクトに混ぜます。

📄 `angular/packages/core/src/hydration/annotate.ts` L157–165 （▶ の行: 163–164）

```ts
157 │ /**
158 │  * Computes the number of root nodes in a given view
159 │  * (or child nodes in a given container if a tNode is provided).
160 │  */
161 │ function calcNumRootNodes(tView: TView, lView: LView, tNode: TNode | null): number {
162 │   const rootNodes: unknown[] = [];
163 ▶   collectNativeNodes(tView, lView, tNode, rootNodes);
164 ▶   return rootNodes.length;
165 │ }
```

163 行目の `collectNativeNodes` は、ビューのルートにある DOM ノードを集める関数で、DOM から外すときにも使われるものです。164 行目でその個数だけを返します。ブラウザはこの数で「このビューの DOM はここまで」と区切ります。

### 連続する同じビューは x で数える

📄 `angular/packages/core/src/hydration/annotate.ts` L465–480 （▶ の行: 468–469, 471–472, 476）

```ts
465 │     // Check if the previous view has the same shape (for example, it was
466 │     // produced by the *ngFor), in which case bump the counter on the previous
467 │     // view instead of including the same information again.
468 ▶     const currentViewAsString = JSON.stringify(serializedView);
469 ▶     if (views.length > 0 && currentViewAsString === lastViewAsString) {
470 │       const previousView = views[views.length - 1];
471 ▶       previousView[MULTIPLIER] ??= 1;
472 ▶       previousView[MULTIPLIER]++;
473 │     } else {
474 │       // Record this view as most recently added.
475 │       lastViewAsString = currentViewAsString;
476 ▶       views.push(serializedView);
477 │     }
478 │   }
479 │   return views;
480 │ }
```

468 行目で今のビューを文字列にし、469 行目で**直前のビューと同じなら**、471〜472 行目で直前のビューの `x`（`MULTIPLIER`）を 1 増やすだけで、配列には足しません。違えば 476 行目で足します。`@for` で同じ形の行が 30 個並ぶと、30 個の `{i, r}` の代わりに `{"i":"t13","r":1,"x":30}` の 1 つになります。4 節のまとめは「ページ全体で同じ `SerializedView`」、こちらは「1 つのコンテナの中で連続する同じビュー」で、別々の仕組みです。

### 子コンポーネントと ng-container

📄 `angular/packages/core/src/hydration/annotate.ts` L686–706 （▶ の行: 686, 690–692, 701, 705–706）

```ts
686 ▶     } else if (Array.isArray(lView[i]) && !isLetDeclaration(tNode)) {
687 │       // This is a component, annotate the host node with an `ngh` attribute.
688 │       // Note: Let declarations that return an array are also storing an array in the LView,
689 │       // we need to exclude them.
690 ▶       const targetNode = unwrapRNode(lView[i][HOST]!);
691 ▶       if (!(targetNode as HTMLElement).hasAttribute(SKIP_HYDRATION_ATTR_NAME)) {
692 ▶         annotateHostElementForHydration(
693 │           targetNode as RElement,
694 │           lView[i],
695 │           parentDeferBlockId,
696 │           context,
697 │         );
698 │       }
699 │     } else {
700 │       // <ng-container> case
701 ▶       if (tNode.type & TNodeType.ElementContainer) {
702 │         // An <ng-container> is represented by the number of
703 │         // top-level nodes. This information is needed to skip over
704 │         // those nodes to reach a corresponding anchor node (comment node).
705 ▶         ngh[ELEMENT_CONTAINERS] ??= {};
706 ▶         ngh[ELEMENT_CONTAINERS][noOffsetIndex] = calcNumRootNodes(tView, lView, tNode.child);
```

686 行目、スロットに配列（＝子コンポーネントの LView）が入っていれば子コンポーネントです。690〜692 行目で、ngSkipHydration が無ければ 3 節の `annotateHostElementForHydration` を呼びます。**子の ngh は子のホスト要素に書かれ、親の SerializedView には入りません**。だから ngh は「コンポーネントごと」です。

701 行目、`<ng-container>` のときは 705〜706 行目で `e` に中のルートノード数を書きます。`<ng-container>` は DOM では中身の後ろのコメント 1 つになるので、ブラウザは中身を数えて飛ばさないとそのコメントに辿り着けません（703〜704 行目のコメント）。このすぐ後の `<ng-content>` と `@let` の分岐（次のノードに道順を書く）は [第 9 回](09-hydration.md)です。

### テキストノードと jsaction

📄 `angular/packages/core/src/hydration/annotate.ts` L723–728 （▶ の行: 723, 725）

```ts
723 ▶       } else if (tNode.type & TNodeType.Text) {
724 │         const rNode = unwrapRNode(lView[i]);
725 ▶         processTextNodeBeforeSerialization(context, rNode);
726 │       }
727 │     }
728 │ 
```

723〜725 行目、テキストノードなら `processTextNodeBeforeSerialization` で印が要るかを調べます（次の節）。その後ろ（[第 14 回](14-event-replay.md)で引用）は、リスナーを持つ要素に `jsaction` 属性を付ける行で、ハイドレーション前のクリックを貯めて後で再生するためのものです。

## 7. 何が「書かれない」か

ここまでで分かるとおり、**普通の要素とテキストには何も書かれません**。要素は「親の最初の子」か「前のノードの次の兄弟」として、テンプレートの順番どおりに見つかるからです（[第 10 回](10-hydration-claim.md)）。書かれるのは、その順番だけでは分からないものだけです。

- どのテンプレートのビューが何個あったか（`t` / `c` / `i` / `r` / `x`）
- `<ng-container>` の大きさ（`e`）
- 順番では辿れない場所にあるノードの道順（`n`）と、DOM に無いノード（`d`）

子の無いコンポーネントや、制御フローも投影も無いコンポーネントは `{}` になり、それも 4 節で 1 件にまとめられます。

## 8. HTML にすると消えるテキストノードに印を付ける

📄 `angular/packages/core/src/hydration/utils.ts` L90–108 （▶ の行: 98, 107）

```ts
 90 │ export const enum TextNodeMarker {
 91 │   /**
 92 │    * The contents of the text comment added to nodes that would otherwise be
 93 │    * empty when serialized by the server and passed to the client. The empty
 94 │    * node is lost when the browser parses it otherwise. This comment node will
 95 │    * be replaced during hydration in the client to restore the lost empty text
 96 │    * node.
 97 │    */
 98 ▶   EmptyNode = 'ngetn',
 99 │ 
100 │   /**
101 │    * The contents of the text comment added in the case of adjacent text nodes.
102 │    * When adjacent text nodes are serialized by the server and sent to the
103 │    * client, the browser loses reference to the amount of nodes and assumes
104 │    * just one text node. This separator is replaced during hydration to restore
105 │    * the proper separation and amount of text nodes that should be present.
106 │    */
107 ▶   Separator = 'ngtns',
108 │ }
```

📄 `angular/packages/core/src/hydration/utils.ts` L538–576 （▶ の行: 545, 552, 561, 571–574）

```ts
538 │ export function processTextNodeBeforeSerialization(context: HydrationContext, node: RNode) {
539 │   // Handle cases where text nodes can be lost after DOM serialization:
540 │   //  1. When there is an *empty text node* in DOM: in this case, this
541 │   //     node would not make it into the serialized string and as a result,
542 │   //     this node wouldn't be created in a browser. This would result in
543 │   //     a mismatch during the hydration, where the runtime logic would expect
544 │   //     a text node to be present in live DOM, but no text node would exist.
545 ▶   //     Example: `<span>{{ name }}</span>` when the `name` is an empty string.
546 │   //     This would result in `<span></span>` string after serialization and
547 │   //     in a browser only the `span` element would be created. To resolve that,
548 │   //     an extra comment node is appended in place of an empty text node and
549 │   //     that special comment node is replaced with an empty text node *before*
550 │   //     hydration.
551 │   //  2. When there are 2 consecutive text nodes present in the DOM.
552 ▶   //     Example: `<div>Hello <ng-container *ngIf="true">world</ng-container></div>`.
553 │   //     In this scenario, the live DOM would look like this:
554 │   //       <div>#text('Hello ') #text('world') #comment('container')</div>
555 │   //     Serialized string would look like this: `<div>Hello world<!--container--></div>`.
556 │   //     The live DOM in a browser after that would be:
557 │   //       <div>#text('Hello world') #comment('container')</div>
558 │   //     Notice how 2 text nodes are now "merged" into one. This would cause hydration
559 │   //     logic to fail, since it'd expect 2 text nodes being present, not one.
560 │   //     To fix this, we insert a special comment node in between those text nodes, so
561 ▶   //     serialized representation is: `<div>Hello <!--ngtns-->world<!--container--></div>`.
562 │   //     This forces browser to create 2 text nodes separated by a comment node.
563 │   //     Before running a hydration process, this special comment node is removed, so the
564 │   //     live DOM has exactly the same state as it was before serialization.
565 │ 
566 │   // Collect this node as required special annotation only when its
567 │   // contents is empty. Otherwise, such text node would be present on
568 │   // the client after server-side rendering and no special handling needed.
569 │   const el = node as HTMLElement;
570 │   const corruptedTextNodes = context.corruptedTextNodes;
571 ▶   if (el.textContent === '') {
572 ▶     corruptedTextNodes.set(el, TextNodeMarker.EmptyNode);
573 ▶   } else if (el.nextSibling?.nodeType === Node.TEXT_NODE) {
574 ▶     corruptedTextNodes.set(el, TextNodeMarker.Separator);
575 │   }
576 │ }
```

サーバーの DOM は木のままでは送れないので、文字列にしてブラウザが解析し直します。その往復で形が変わるテキストノードが 2 種類あります。

1. **571〜572 行目：空のテキストノード → `ngetn`**

   545 行目の例 `<span>{{ name }}</span>` で `name` が空文字だと、文字列は `<span></span>` になり、ブラウザにはテキストノードが作られません。ハイドレーションは「ここにテキストノードがある」と期待するので、ずれます。そこで 98 行目の `ngetn`（empty text node）を記録します。
2. **573〜574 行目：次もテキストノード → `ngtns`**

   552 行目の例のように 2 つのテキストノードが隣り合うと、文字列にした時点で 1 つにつながってしまいます。561 行目のように間に 107 行目の `ngtns`（text node separator）を挟んで、ブラウザでも 2 つに分かれるようにします。

📄 `angular/packages/core/src/hydration/annotate.ts` L855–871 （▶ の行: 868–869）

```ts
855 │ /**
856 │  * Physically inserts the comment nodes to ensure empty text nodes and adjacent
857 │  * text node separators are preserved after server serialization of the DOM.
858 │  * These get swapped back for empty text nodes or separators once hydration happens
859 │  * on the client.
860 │  *
861 │  * @param corruptedTextNodes The Map of text nodes to be replaced with comments
862 │  * @param doc The document
863 │  */
864 │ function insertCorruptedTextNodeMarkers(
865 │   corruptedTextNodes: Map<HTMLElement, string>,
866 │   doc: Document,
867 │ ) {
868 ▶   for (const [textNode, marker] of corruptedTextNodes) {
869 ▶     textNode.after(doc.createComment(marker));
870 │   }
871 │ }
```

記録しただけではまだ DOM は変わっていません。2 節の 279 行目から呼ばれる 868〜869 行目で、記録したテキストノードの**直後に**`<!--ngetn-->` か `<!--ngtns-->` のコメントを実際に入れます。ブラウザではハイドレーションの前にこれを元のテキストノードに戻します（[第 10 回](10-hydration-claim.md)）。

このページの HTML にも `<!--ngetn-->` がたくさんあります。ソースの引用の**空行**です。`app-code` は 1 行を `<span class="src">{{ line.text }}</span>` で描くので、空行では空のテキストノードになり、571〜572 行目に当たります。

> [!NOTE]
> **さらに深く**
>
> この `ngetn` は、**このサイトを作っている最中に実際に出会いました**。プリレンダーした HTML が `<code><!--ngetn--></code>` になっていて、調べるとコンポーネント側のバグ（初期化前のフィールドを参照していた）でした。**空文字が描画された**ことを、この印が教えてくれたわけです。

## 9. 呼び出しの連なり（サーバー）

- `prepareForHydration(platformState, appRef)` — platform-server/src/utils.ts L95 — *whenStable の後、文字列にする前*
  - `appendSsrContentIntegrityMarker(doc)` — platform-server/src/utils.ts — *body の先頭に &lt;!--nghm--&gt;*
  - `annotateForHydration(appRef, doc)` — core/src/hydration/annotate.ts L243
    - `annotateComponentLViewForHydration(lView, context)` — L180
      - `annotateHostElementForHydration(<app-root>, …)` — L819
        - `serializeLView(lView, …)` — L548 — *スロットを先頭から*
          - `serializeLContainer(…)` — L314 — *c にビューの一覧。中で serializeLView を再帰*
          - `annotateHostElementForHydration(子のホスト, …)` — L692 — *子の ngh を子のホストに*
          - `processTextNodeBeforeSerialization(context, rNode)` — utils.ts L538
        - `serializedViewCollection.add(ngh)` — L839 — *同じ中身なら同じ番号*
        - `renderer.setAttribute(element, 'ngh', index)` — L840
    - `insertCorruptedTextNodeMarkers(corruptedTextNodes, doc)` — L279
    - `transferState.set(NGH_DATA_KEY, serializedViews)` — L290

## 10. DEMO：このページの \_\_nghData\_\_ を読み解く

> **🧪 DEMO — このページの元の HTML から SerializedView を取り出す**
>
> いまの DOM からは ngh 属性がもう消えています（ブラウザが読んだ後に消すため。[第 10 回](10-hydration-claim.md)）。そこでボタンで `fetch(location.pathname)` して、このページの HTML を取り直し、`DOMParser` で解析します。`<script id="ng-state">` を `JSON.parse` して `__nghData__` を番号順に並べ、各番号を指している要素のタグ名を添えます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/hydration-annotate)

一覧を見ると、`app-code`（ソースの引用）の番号がいくつかに分かれ、中身は `x` の数だけが違うはずです。`app-code` は 1 行を `@for` の 1 ビューで描くので、`x` が引用の行数です。6 節の `x` のまとめで行が 1 つにまとまり、4 節のまとめで**行数の同じ引用どうしが同じ番号を共有**しています。`{}` の番号は、制御フローも投影の道順も持たないコンポーネント（`app-callout` など）がまとめて指しています。

「`<app-chapter-shell>` の ngh を引く」で出てくるのは、章の枠のテンプレートです。この章を書いた時点のビルドでは次の形でした。

- `"t"` の 2 番と 3 番は `@if (embedded) {…} @else {…}` の 2 つの分岐。`"c"` の 2 番が `[]`、3 番が `[{"i":"t9","r":2}]` なので、**else 側が描かれ、ルートノードが 2 つ**（パンくずの `<p>` と `<h1>`）だったと分かります。
- 13 番は目次の `<details>` を包む `@if`。その中の 5 番が章の一覧の `@for` で、ビューの配列が「リンクの分岐 ×(`x`)」「いまの章（`<span>` の分岐）1 つ」「リンクの分岐 ×(`x`)」の 3 件にまとまっています。`x` が「この章より前の章の数」と「後の章の数」です。
- このサイトの `<app-root>` の番号は `{"c":{"23":[{"i":"c…","r":1}]}}` のような形で、`<router-outlet>` のコンテナに、`c` で始まる id のコンポーネント（この章）のビューが 1 つ入っていたことを表します（6 節の 361・365 行目）。

## 聞かれそうな質問

**Q. なぜ中身を HTML 属性に書かず、TransferState に置くのですか？**

同じ中身を 1 つにまとめるためです。4 節の 104〜111 行目で、ページ全体の SerializedView を `JSON.stringify` した文字列で重複を除き、属性には 840 行目で番号だけを書きます。同じコンポーネントがたくさん並ぶページほど、属性に直接書くより小さくなります。また 288〜290 行目のとおり、TransferState にキーがあること自体が「サーバー側でハイドレーションが有効だった」という合図にもなっています。

**Q. ngh が付く要素と、付かない要素の違いは？**

付くのはコンポーネントのホスト要素だけです（3 節の 840 行目と、6 節の 690〜692 行目・665〜675 行目）。普通の要素・テキスト・`<ng-container>` には付きません。それらの情報は、属しているコンポーネントの SerializedView の中にスロット番号で入ります。ホストでも ngSkipHydration が付いているもの（187・691 行目）や、i18n か ShadowDom で ngSkipHydration に切り替えられたものには付きません。

**Q. サーバーとブラウザで @if の分岐が違うとどうなりますか？**

サーバーで描かれた分岐は `c` に `{"i":"t2","r":2}` のように、そのテンプレートの id 付きで書かれます（367〜373 行目）。ブラウザは自分が作りたいテンプレートの id と照合し、合わなければそのビューの DOM は引き取らずに新しく作り、残ったサーバーの DOM は安定後に片付けます。照合と片付けは [第 11 回](11-hydration-containers.md)で読みます。

**Q. ShadowDom のコンポーネントはハイドレーションできないのですか？**

できません。801〜802 行目に当たると、`annotateHostElementForHydration` の前半でサーバーが ngSkipHydration を付け、ブラウザはその中を作り直します。親や兄弟のコンポーネントは普通にハイドレーションされます。

**Q. \_\_nghData\_\_ が空の配列 \[\] になっているページがあります。壊れていますか？**

壊れていません。ngSkipHydration で全部が飛ばされた場合などでも、288〜290 行目は空の配列を必ず入れます（283〜287 行目のコメント）。ブラウザはキーがあるので IS\_HYDRATION\_DOM\_REUSE\_ENABLED を true にします（[第 7 回](07-hydration-provide.md)）。

## 読み終えて

- `annotateForHydration` はサーバーで安定後に 1 回だけ呼ばれ、ルートから再帰して全コンポーネントの `SerializedView` を作る。
- ngh はコンポーネントのホスト要素に付く番号。中身は TransferState の `__nghData__` 配列にあり、同じ中身は 1 件にまとめられる。
- 書かれるのはテンプレートの id とビューの数（`t`/`c`/`i`/`r`/`x`）、`<ng-container>` の大きさ（`e`）、道順（`n`）、DOM に無いノード（`d`）。普通の要素とテキストは書かれない。
- 空のテキストと隣り合うテキストは、HTML の往復で形が変わるので `ngetn` / `ngtns` のコメントを挟む。
- ShadowDom と、`withI18nSupport` 無しの i18n はサーバーが ngSkipHydration を付けて対象外にする。

---

← 前: [provideClientHydration：features と withDomHydration が足すもの](07-hydration-provide.md)  
次: [ノードの道順：f と n の 2 文字と、連続をまとめる圧縮](09-hydration.md) →
