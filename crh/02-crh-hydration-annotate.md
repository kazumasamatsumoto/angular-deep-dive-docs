[目次](../README.md) › [core の説明文の読み残し（3）](README.md) › 第 2 回 / 全 8 回

# ngh の書き出しの説明文：annotate と utils

> hydration/annotate.ts・utils.ts の未読の行：どのビューに何を書くか、コンテナーとテンプレートの印、skip と省略のコメント。本物の SSR の出力の ngh を 1 項目ずつ読む。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crh-hydration-annotate)

---

この章で分かること：サーバーが `ngh` を書く annotate.ts と utils.ts の、まだ読んでいない説明文（ルートのコンポーネントが `ViewContainerRef` を持つときの 2 つの番号、コンテナの中のルートのビュー、切り離されたノード、`ngSkipHydration` を付ける場合、`<ng-container>` の大きさ、テキストの印）を、本物の platform-server で描いた HTML の `ngh` と 1 項目ずつ並べます。コメントの約束はどれも記録と合いました。合わなかったのは 2 つで、i18n のあるコンポーネントを飛ばす理由のコメント（L830〜831「まだ対応していない」）が `withI18nSupport()` のある今では古いことと、テキストの印のコメントを探す側（utils.ts 250 行目）は空白を無視するのに、戻す側（L283）は空白を許さず、`<!-- ngetn -->` と書かれた HTML では NG0500 になることです。

読む対象は `packages/core/src/hydration/annotate.ts` と `utils.ts` です（../angular、8576f161ae4）。`annotateForHydration` と `serializeLView` の本体、`SerializedViewCollection`、テキストの印の入れ方は[ngh を書く章](../platform/08-hydration-annotate.md)が読んでいるので、ここでは繰り返さずに行だけ指します。キーの意味は[第 1 回の 4 節](01-crh-hydration-api.md)、記録の作り方も第 1 回と同じです（2 つのプロセス、JIT、platform-server 22.2.6）。

1. [1. ハイドレーションの公開 API と型](01-crh-hydration-api.md)
2. **2. ngh の書き出し**（この章）
3. [3. ノードの探し方と不一致](03-crh-hydration-errors.md)
4. [4. @defer](04-crh-defer.md)
5. [5. resource()](05-crh-resource.md)
6. [6. Renderer2](06-crh-renderer.md)
7. [7. 開発用の小道具](07-crh-dev-utils.md)
8. [8. spec と issue](08-crh-tests-issues.md)

## 1. ホスト要素に書くもの：ngh か ngSkipHydration か

📄 `angular/packages/core/src/hydration/annotate.ts` L805–818 （▶ の行: 807–811, 816–817）

```ts
805 │ 
806 │ /**
807 ▶  * Annotates component host element for hydration:
808 ▶  * - by either adding the `ngh` attribute and collecting hydration-related info
809 ▶  *   for the serialization and transferring to the client
810 ▶  * - or by adding the `ngSkipHydration` attribute in case Angular detects that
811 ▶  *   component contents is not compatible with hydration.
812 │  *
813 │  * @param element The Host element to be annotated
814 │  * @param lView The associated LView
815 │  * @param context The hydration context
816 ▶  * @returns An index of serialized view from the transfer state object
817 ▶  *          or `null` when a given component can not be serialized.
818 │  */
```

807〜811 行目は「ホスト要素に `ngh` を書いてハイドレーションの情報を集めるか、中身がハイドレーションに合わないと Angular が見たら `ngSkipHydration` を書く」の 2 通り、816〜817 行目は「`TransferState` の番号か、書けないときは `null` を返す」です。合わないと見る条件は L826〜829 の 2 つ、i18n があって i18n のハイドレーションが無効なこと（第 1 回の 2 節の変数）と、ShadowDom を使うことです。記録では、`<p i18n>` を持つ子（`withI18nSupport()` なし）も ShadowDom の子も `ngskiphydration=""` になり、`ngh` は付きませんでした（DEMO の「子に i18n」「子が ShadowDom」）。

同じ関数の中の L830〜831 のコメントは、i18n の理由を「そういうブロックのハイドレーションはまだ対応していないから」と書きます。`withI18nSupport()`（[i18n のハイドレーションの章](../platform/13-hydration-i18n.md)）が入った今は、827 行目の条件どおり「i18n のハイドレーションを有効にしていないから」です。このコメントは 5bf2b7da6f4（2023-04-05、refactor(core): skip hydration for components that use i18n (instead of throwing an error) (#49722)）のときのままで、新しい本家（origin/main の d201dd76ef2）でも同じです。

## 2. ルートが ViewContainerRef を持つとき：2 つの番号を | でつなぐ

📄 `angular/packages/core/src/hydration/annotate.ts` L192–216 （▶ の行: 194–197, 200, 203, 205–210）

```ts
192 │ 
193 │ /**
194 ▶  * Annotates root level LContainer for hydration. This happens when a root component
195 ▶  * injects ViewContainerRef, thus making the component an anchor for a view container.
196 ▶  * This function serializes the component itself as well as all views from the view
197 ▶  * container.
198 │  */
199 │ function annotateLContainerForHydration(lContainer: LContainer, context: HydrationContext) {
200 ▶   const componentLView = unwrapLView(lContainer[HOST]) as LView<unknown>;
201 │ 
202 │   // Serialize the root component itself.
203 ▶   const componentLViewNghIndex = annotateComponentLViewForHydration(componentLView, context);
204 │ 
205 ▶   if (componentLViewNghIndex === null) {
206 ▶     // Component was not serialized (for example, if hydration was skipped by adding
207 ▶     // the `ngSkipHydration` attribute or this component uses i18n blocks in the template,
208 ▶     // but `withI18nSupport()` was not added), avoid annotating host element with the `ngh`
209 ▶     // attribute.
210 ▶     return;
211 │   }
212 │ 
213 │   const hostElement = unwrapRNode(componentLView[HOST]!) as HTMLElement;
214 │ 
215 │   // Serialize all views within this view container.
216 │   const rootLView = lContainer[PARENT];
```

194〜197 行目のとおり、ルートのコンポーネントで `ViewContainerRef` を inject すると、ルートのホスト要素がコンテナの土台になり、ルートの LView のスロットには LView でなく LContainer が入ります（[ViewContainerRef の説明文の章](../cra/03-cra-view-container.md)）。annotate.ts の L274〜275 がこの関数に分けます。203 行目でまずコンポーネントそのものを書き、205〜210 行目、それが `null`（`ngSkipHydration`、または i18n で 1 節の条件）なら、コンテナの分も書かずに戻ります。記録「ルートが ViewContainerRef ＋ i18n」では、ルートが `ngskiphydration` になり、コンテナに足した子にも `ngh` が無く、`__nghData__` は空の配列でした。

📄 `angular/packages/core/src/hydration/annotate.ts` L217–242 （▶ の行: 217, 221, 224, 227–232）

```ts
217 ▶   const rootLViewNghIndex = annotateHostElementForHydration(hostElement, rootLView, null, context);
218 │ 
219 │   const renderer = componentLView[RENDERER];
220 │ 
221 ▶   // For cases when a root component also acts as an anchor node for a ViewContainerRef
222 │   // (for example, when ViewContainerRef is injected in a root component), there is a need
223 │   // to serialize information about the component itself, as well as an LContainer that
224 ▶   // represents this ViewContainerRef. Effectively, we need to serialize 2 pieces of info:
225 │   // (1) hydration info for the root component itself and (2) hydration info for the
226 │   // ViewContainerRef instance (an LContainer). Each piece of information is included into
227 ▶   // the hydration data (in the TransferState object) separately, thus we end up with 2 ids.
228 ▶   // Since we only have 1 root element, we encode both bits of info into a single string:
229 ▶   // ids are separated by the `|` char (e.g. `10|25`, where `10` is the ngh for a component view
230 ▶   // and 25 is the `ngh` for a root view which holds LContainer).
231 ▶   const finalIndex = `${componentLViewNghIndex}|${rootLViewNghIndex}`;
232 ▶   renderer.setAttribute(hostElement, NGH_ATTR_NAME, finalIndex);
233 │ }
234 │ 
235 │ /**
236 │  * Annotates all components bootstrapped in a given ApplicationRef
237 │  * with info needed for hydration.
238 │  *
239 │  * @param appRef An instance of an ApplicationRef.
240 │  * @param doc A reference to the current Document instance.
241 │  * @return event types that need to be replayed
242 │  */
```

217 行目でルートの LView（コンテナを持つ方）も書き、228〜231 行目「ホスト要素は 1 つしかないので、2 つの番号を | でつなぐ（`10|25` なら 10 がコンポーネント、25 がコンテナを持つルート）」のとおり 232 行目で書きます。記録「ルートが ViewContainerRef」では `<crh-app ngh="0|1">` で、`__nghData__[1]` が `{"c":{"0":[{"i":"c502613084","r":1}]}}`、つまりコンテナ（ルートの LView の 0 番）に子のビューが 1 つでした。足した子は `<crh-app>` の内側でなく後ろの兄弟に並び、その後ろに `<!--container-->` が付きます。ブラウザーで | を分けるのは utils.ts の `retrieveHydrationInfoImpl`（L139〜141、[ノードを確保する章の 1 節](../platform/10-hydration-claim.md)）で、片方を読んだら残りを属性に書き戻します（L186〜189）。この形は 55965cbf8c1（2023-07-28、fix(core): handle hydration of view containers for root components (#51247)）で入りました。

## 3. コンテナの中のルートのビュー：根の数に 2 を足す

📄 `angular/packages/core/src/hydration/annotate.ts` L302–330 （▶ の行: 304–305, 307–312, 322, 324）

```ts
302 │ 
303 │ /**
304 ▶  * Serializes the lContainer data into a list of SerializedView objects,
305 ▶  * that represent views within this lContainer.
306 │  *
307 ▶  * @param lContainer the lContainer we are serializing
308 ▶  * @param tNode the TNode that contains info about this LContainer
309 ▶  * @param lView that hosts this LContainer
310 ▶  * @param parentDeferBlockId the defer block id of the parent if it exists
311 ▶  * @param context the hydration context
312 ▶  * @returns an array of the `SerializedView` objects
313 │  */
314 │ function serializeLContainer(
315 │   lContainer: LContainer,
316 │   tNode: TNode,
317 │   lView: LView,
318 │   parentDeferBlockId: string | null,
319 │   context: HydrationContext,
320 │ ): SerializedContainerView[] {
321 │   const views: SerializedContainerView[] = [];
322 ▶   let lastViewAsString = '';
323 │ 
324 ▶   for (let i = CONTAINER_HEADER_OFFSET; i < lContainer.length; i++) {
325 │     let childLView = lContainer[i] as LView;
326 │ 
327 │     let template: string;
328 │     let numRootNodes: number;
329 │     let serializedView: SerializedContainerView | undefined;
330 │ 
```

304〜305 行目「LContainer を、中のビューを表す `SerializedView` の一覧にする」の本体は 324 行目のループで、ビューごとの `i`・`r` と、同じ形が続いたときの `x` は[ngh を書く章の 6 節](../platform/08-hydration-annotate.md)で読んでいます。307〜312 行目の引数の説明のうち `parentDeferBlockId`（310 行目）は、入れ子の `@defer` の親の id で、[第 4 回](04-crh-defer.md)の `p` になります。

📄 `angular/packages/core/src/hydration/annotate.ts` L331–356 （▶ の行: 331–334, 336–341, 343–344, 346, 350–352）

```ts
331 ▶     if (isRootView(childLView)) {
332 ▶       // If this is a root view, get an LView for the underlying component,
333 ▶       // because it contains information about the view to serialize.
334 ▶       childLView = childLView[HEADER_OFFSET];
335 │ 
336 ▶       // If we have an LContainer at this position, this indicates that the
337 ▶       // host element was used as a ViewContainerRef anchor (e.g. a `ViewContainerRef`
338 ▶       // was injected within the component class). This case requires special handling.
339 ▶       if (isLContainer(childLView)) {
340 ▶         // Calculate the number of root nodes in all attached views and add 2 to account for the
341 ▶         // component's host node and the container's anchor node. i.e. in this scenario we'll have a
342 │         // layout that would look like this:
343 ▶         // `<app-root /><#VIEW1><#VIEW2>...<!--container-->`
344 ▶         numRootNodes = calcNumRootNodesInLContainer(childLView) + 2;
345 │ 
346 ▶         annotateLContainerForHydration(childLView, context);
347 │ 
348 │         const componentLView = unwrapLView(childLView[HOST]) as LView<unknown>;
349 │ 
350 ▶         serializedView = {
351 ▶           [TEMPLATE_ID]: componentLView[TVIEW].ssrId!,
352 ▶           [NUM_ROOT_NODES]: numRootNodes,
353 │         };
354 │       }
355 │     }
356 │ 
```

📄 `angular/packages/core/src/hydration/annotate.ts` L166–175 （▶ の行: 168, 172–173）

```ts
166 │ 
167 │ /**
168 ▶  * Computes the number of root nodes in all views in a given LContainer.
169 │  */
170 │ function calcNumRootNodesInLContainer(lContainer: LContainer): number {
171 │   const rootNodes: unknown[] = [];
172 ▶   collectNativeNodesInLContainer(lContainer, rootNodes);
173 ▶   return rootNodes.length;
174 │ }
175 │ 
```

コンテナの中のビューが「ルートのビュー」（`createComponent` で作ったコンポーネント）なら、334 行目で中のコンポーネントの LView を取り出します。そのコンポーネントがさらに `ViewContainerRef` を持つと、そこにも LContainer があります（336〜339 行目）。340〜343 行目「付いているビューの根の数に、コンポーネントのホストとコンテナの印の 2 を足す。並びは `<app-root /><#VIEW1><#VIEW2>...<!--container-->`」のとおり、344 行目は 168〜173 行目の `calcNumRootNodesInLContainer` に 2 を足します。346 行目で中のコンポーネントにも 2 節の関数を呼びます。

記録「コンテナの中のコンポーネントも ViewContainerRef」では、ルートが `CrhInner` を作り、`CrhInner` が `Side` を 2 つ作りました。HTML は `<crh-app ngh="0|2">…</crh-app><crh-inner ngh="0|1"><b>内</b></crh-inner><crh-side ngh="0">…<crh-side ngh="0">…<!--container--><!--container-->` で、ルートの LView の一覧は `[{"i":"c2865790123","r":4}]` でした。4 は 2 つの `Side` と、`<crh-inner>` と、内側の `<!--container-->` で、343 行目の並びのとおりです。`CrhInner` も | の 2 つの番号を持ちます。このコメントの「2 を足す」は、根のノードを DOM の並びの順に集めるように直した b3748e9fe4a（2026-06-02、fix(core): correct container anchor collection order to match DOM layout）で書き直されました（前は「1 を足し、さらに `<app-root />` の分」）。

## 4. どのビューから書くか：getLNodeForHydration と、読む側の入り口

📄 `angular/packages/core/src/hydration/utils.ts` L225–252 （▶ の行: 226–229, 235–238, 242–243, 249–250）

```ts
225 │ /**
226 ▶  * Retrieves the necessary object from a given ViewRef to serialize:
227 ▶  *  - an LView for component views
228 ▶  *  - an LContainer for cases when component acts as a ViewContainerRef anchor
229 ▶  *  - `null` in case of an embedded view
230 │  */
231 │ export function getLNodeForHydration(viewRef: ViewRef): LView | LContainer | null {
232 │   // Reading an internal field from `ViewRef` instance.
233 │   let lView = (viewRef as any)._lView as LView;
234 │   const tView = lView[TVIEW];
235 ▶   // A registered ViewRef might represent an instance of an
236 ▶   // embedded view, in which case we do not need to annotate it.
237 ▶   if (tView.type === TViewType.Embedded) {
238 ▶     return null;
239 │   }
240 │   // Check if it's a root view and if so, retrieve component's
241 │   // LView from the first slot after the header.
242 ▶   if (isRootView(lView)) {
243 ▶     lView = lView[HEADER_OFFSET];
244 │   }
245 │ 
246 │   return lView;
247 │ }
248 │ 
249 ▶ function getTextNodeContent(node: Node): string | undefined {
250 ▶   return node.textContent?.replace(/\s/gm, '');
251 │ }
252 │ 
```

226〜229 行目の 3 通りのとおり、`appRef._views`（annotate.ts L249）の 1 つ 1 つから、コンポーネントなら LView、ルートがコンテナの土台なら LContainer、埋め込みのビューなら `null` を返します。235〜238 行目「`ApplicationRef` に登録したビューが埋め込みのビューなら、書く必要はない」で、`appRef.attachView(templateRef.createEmbeddedView(…))` で付けたビューには `ngh` が付きません（spec の `should skip embedded views from an ApplicationRef during annotation`）。242〜243 行目で、ルートの LView から `HEADER_OFFSET` の位置のコンポーネントの LView（か LContainer）を取り出します。

249〜250 行目の `getTextNodeContent` は、コメントの中身から空白を全部消して返します。ブラウザーでテキストの印を元に戻す `processTextNodeMarkersBeforeHydration`（L262〜288）は、L266〜268 でこれを使って `ngetn` と `ngtns` の印を拾いますが、L283 で空のテキストに戻すかを決めるときは、空白を消さない `node.textContent === 'ngetn'` で比べます。サーバーの `<!--ngetn-->` を `<!-- ngetn -->` に書き換えた HTML でハイドレートすると、印は拾われ、L286 で消されるだけで空のテキストに戻らず、開発モードで NG0500「During hydration Angular expected a text node but the node was not found.」になりました（DEMO の下の記録）。Angular 自身は空白を入れないので、HTML を後から整形する道具を通したときだけの話です。どちらも 1116c492fa2（2023-03-13、refactor(core): Handle cases of lost empty text nodes during hydration (#49419)）で入り、新しい本家でも同じです。

📄 `angular/packages/core/src/hydration/utils.ts` L109–120 （▶ の行: 111–113, 117, 119）

```ts
109 │ 
110 │ /**
111 ▶  * Reference to a function that reads `ngh` attribute value from a given RNode
112 ▶  * and retrieves hydration information from the TransferState using that value
113 ▶  * as an index. Returns `null` by default, when hydration is not enabled.
114 │  *
115 │  * @param rNode Component's host element.
116 │  * @param injector Injector that this component has access to.
117 ▶  * @param isRootView Specifies whether we trying to read hydration info for the root view.
118 │  */
119 ▶ let _retrieveHydrationInfoImpl: typeof retrieveHydrationInfoImpl = () => null;
120 │ 
```

📄 `angular/packages/core/src/hydration/utils.ts` L205–224 （▶ の行: 207, 210, 214–215, 222）

```ts
205 │ 
206 │ /**
207 ▶  * Sets the implementation for the `retrieveHydrationInfo` function.
208 │  */
209 │ export function enableRetrieveHydrationInfoImpl() {
210 ▶   _retrieveHydrationInfoImpl = retrieveHydrationInfoImpl;
211 │ }
212 │ 
213 │ /**
214 ▶  * Retrieves hydration info by reading the value from the `ngh` attribute
215 ▶  * and accessing a corresponding slot in TransferState storage.
216 │  */
217 │ export function retrieveHydrationInfo(
218 │   rNode: RElement,
219 │   injector: Injector,
220 │   isRootView = false,
221 │ ): DehydratedView | null {
222 ▶   return _retrieveHydrationInfoImpl(rNode, injector, isRootView);
223 │ }
224 │ 
```

書いた `ngh` を読むのはブラウザーです。111〜113 行目「`ngh` を読み、その値を番号にして `TransferState` から取る関数への参照。ハイドレーションが無効なら既定で `null`」のとおり、119 行目の初期値は `() => null` で、210 行目で本物に差し替えるのは api.ts の `enableHydrationRuntimeSupport`（L101、第 1 回の 2 節）だけです。222 行目の入口は、ルートのコンポーネントを作る render3/component\_ref.ts の L367 と、コンポーネントのビューを描く render3/instructions/render.ts の L41 から、ハイドレーションの有無にかかわらず毎回呼ばれます。`provideClientHydration` を書かないアプリでは、119 行目の何も読まない関数が `null` を返すだけです。117 行目の `isRootView` が 2 節の | の右側を読む旗です。

## 5. 切り離されたノード：d に入るのは投影のノードだけ

📄 `angular/packages/core/src/hydration/annotate.ts` L522–547 （▶ の行: 524–526, 533–535, 540–542, 544–545）

```ts
522 │ 
523 │ /**
524 ▶  * Helper function to append information about a disconnected node.
525 ▶  * This info is needed at runtime to avoid DOM lookups for this element
526 ▶  * and instead, the element would be created from scratch.
527 │  */
528 │ function appendDisconnectedNodeIndex(ngh: SerializedView, tNodeOrNoOffsetIndex: TNode | number) {
529 │   const noOffsetIndex =
530 │     typeof tNodeOrNoOffsetIndex === 'number'
531 │       ? tNodeOrNoOffsetIndex
532 │       : tNodeOrNoOffsetIndex.index - HEADER_OFFSET;
533 ▶   ngh[DISCONNECTED_NODES] ??= [];
534 ▶   if (!ngh[DISCONNECTED_NODES].includes(noOffsetIndex)) {
535 ▶     ngh[DISCONNECTED_NODES].push(noOffsetIndex);
536 │   }
537 │ }
538 │ 
539 │ /**
540 ▶  * Serializes the lView data into a SerializedView object that will later be added
541 ▶  * to the TransferState storage and referenced using the `ngh` attribute on a host
542 ▶  * element.
543 │  *
544 ▶  * @param lView the lView we are serializing
545 ▶  * @param context the hydration context
546 │  * @returns the `SerializedView` object containing the data to be added to the host node
547 │  */
```

524〜526 行目「切り離されたノードの情報を足す。ブラウザーはその要素を DOM で探さず、一から作る」の本体は 533〜535 行目で、配列が無ければ作り、同じ番号は 2 度入れません。i18n のブロック（L571〜573）と投影（L613〜615・L637）の 3 か所から呼ばれ、i18n と投影の両方で同じノードが外れたときに重なるのを避けます。540〜542 行目の `serializeLView` の説明は「LView を、`TransferState` に入れてホスト要素の `ngh` で指す `SerializedView` にする」で、544〜545 行目の引数の説明には 2 番目の `parentDeferBlockId`（L550）がありません。

📄 `angular/packages/core/src/hydration/annotate.ts` L872–889 （▶ の行: 874–875, 880–883, 885）

```ts
872 │ 
873 │ /**
874 ▶  * Detects whether a given TNode represents a node that
875 ▶  * is being content projected.
876 │  */
877 │ function isContentProjectedNode(tNode: TNode): boolean {
878 │   let currentTNode = tNode;
879 │   while (currentTNode != null) {
880 ▶     // If we come across a component host node in parent nodes -
881 ▶     // this TNode is in the content projection section.
882 ▶     if (isComponentHost(currentTNode)) {
883 ▶       return true;
884 │     }
885 ▶     currentTNode = currentTNode.parent as TNode;
886 │   }
887 │   return false;
888 │ }
889 │ 
```

`d` に入れる条件は L613 の `isDisconnectedNode(tNode, lView) && isContentProjectedNode(tNode)` で、後ろが 874〜875 行目「投影されているノードか」です。880〜883 行目、親をたどってコンポーネントのホストに当たれば、そのノードはホストの中身として書かれた、つまり投影のためのノードです。記録「いろいろなテンプレート」では、`<ng-content>` の無い `<crh-noslot>` に渡した `<em>` とその中のテキストが、親の `SerializedView` の `"d":[4,5]` になりました。投影でない切り離しは `d` に入りません。記録「サーバーで自分の要素を外す」では、`ngAfterViewInit` でテンプレートの `<i>` を DOM から外すと、`__nghData__` は `[{}]` のままで、ブラウザーは `<i>` を探して `<p>` を見つけ、NG0500 になりました。サーバーで DOM を直接いじると壊れる理由がこれです（[不一致のエラーの章の 5 節](../platform/12-hydration-errors.md)）。この条件は f1d3be3dee6（2023-03-22、refactor(core): only annotate disconnected nodes in content projection (#49549)）で入りました。

## 6. &lt;ng-container&gt; の大きさを読む関数

📄 `angular/packages/core/src/hydration/utils.ts` L443–469 （▶ の行: 444–448, 452, 457–458, 467）

```ts
443 │ /**
444 ▶  * Returns the size of an <ng-container>, using either the information
445 ▶  * serialized in `ELEMENT_CONTAINERS` (element container size) or by
446 ▶  * computing the sum of root nodes in all dehydrated views in a given
447 ▶  * container (in case this `<ng-container>` was also used as a view
448 ▶  * container host node, e.g. <ng-container *ngIf>).
449 │  */
450 │ export function getNgContainerSize(hydrationInfo: DehydratedView, index: number): number | null {
451 │   const data = hydrationInfo.data;
452 ▶   let size = data[ELEMENT_CONTAINERS]?.[index] ?? null;
453 │   // If there is no serialized information available in the `ELEMENT_CONTAINERS` slot,
454 │   // check if we have info about view containers at this location (e.g.
455 │   // `<ng-container *ngIf>`) and use container size as a number of root nodes in this
456 │   // element container.
457 ▶   if (size === null && data[CONTAINERS]?.[index]) {
458 ▶     size = calcSerializedContainerSize(hydrationInfo, index);
459 │   }
460 │   return size;
461 │ }
462 │ 
463 │ export function isSerializedElementContainer(
464 │   hydrationInfo: DehydratedView,
465 │   index: number,
466 │ ): boolean {
467 ▶   return hydrationInfo.data[ELEMENT_CONTAINERS]?.[index] !== undefined;
468 │ }
469 │ 
```

444〜448 行目「`<ng-container>` の大きさは、`ELEMENT_CONTAINERS`（`e`）に書いた数か、その `<ng-container>` がコンテナの土台も兼ねていれば（`<ng-container *ngIf>` など）中のビューの根の数の合計」のとおり、452 行目が `e` を読み、無ければ 457〜458 行目で `c` の一覧から数えます（`calcSerializedContainerSize` は L481〜488、`r × x` の合計）。記録の `<ng-container><b>1</b><b>2</b></ng-container>` は `"e":{"19":2}` でした。448 行目の `*ngIf` は `@if` の前の書き方の例です。`@if` は `<ng-container>` を土台にしないので、今この枝に来るのは `NgIf` などの構造ディレクティブを `<ng-container>` に付けたときです（spec の `should work with *ngIf on ng-container nodes`）。古いだけで、説明は今も合います。

## 7. テキストの印と、TransferState のキー

📄 `angular/packages/core/src/hydration/utils.ts` L532–539 （▶ の行: 534–536, 538）

```ts
532 │ 
533 │ /**
534 ▶  * Helper function to prepare text nodes for serialization by ensuring
535 ▶  * that separate logical text blocks in the DOM remain separate after
536 ▶  * serialization.
537 │  */
538 ▶ export function processTextNodeBeforeSerialization(context: HydrationContext, node: RNode) {
539 │   // Handle cases where text nodes can be lost after DOM serialization:
```

534〜536 行目「別々のテキストのまとまりが、文字列にしたあとも別々のままになるように準備する」で、中身（空のテキストに `ngetn`、テキストが続けば `ngtns`）は[ngh を書く章の 8 節](../platform/08-hydration-annotate.md)で読んでいます。記録でも `<span><!--ngetn--></span>` と `<div>Hello <!--ngtns-->world<!--container--></div>` になりました。

📄 `angular/packages/core/src/hydration/utils.ts` L70–77 （▶ の行: 71–72, 74–75）

```ts
70 │ 
71 ▶ /**
72 ▶  * Checks whether a given key is used by the framework for transferring hydration data.
73 │  */
74 ▶ export function isInternalHydrationTransferStateKey(key: string): boolean {
75 ▶   return key === TRANSFER_STATE_TOKEN_ID || key === TRANSFER_STATE_DEFER_BLOCKS_INFO;
76 │ }
77 │ 
```

71〜72 行目「そのキーが、ハイドレーションのデータを運ぶためにフレームワークが使うものか」は、`__nghData__` と `__nghDeferData__` の 2 つです（75 行目）。使うのは開発用の `ng.ɵgetTransferState`（render3/util/transfer\_state\_utils.ts L24〜39）だけで、この 2 つを外して返します。記録「開発用の ng.ɵgetTransferState」では、ハイドレートしたあとに呼ぶと `[]`（キーなし）で、`TransferState.toJson()` には `__nghData__` がありました。Angular DevTools の転送状態の表示に、ハイドレーションの内部のデータが出ないための関数です。db3c9283052（2025-07-21、refactor(core): add a `getTransferState` for the devtools (#62722)）で入りました。

> **🧪 DEMO — テンプレートごとに、何がどのキーに書かれたか（記録の再生）**
>
> 手元の記録のスクリプトが、Node の上の本物の `renderApplication`（platform-server 22.2.6、開発モード、JIT）で描いた HTML と、それを別のプロセスでハイドレートした結果です（crh-hydration-annotate.data.ts）。ボタンでテンプレートを選ぶと、書いたテンプレート、サーバーの HTML、`__nghData__` の 1 つ 1 つと、それを指すホスト要素、この章の説明、ブラウザーの結果を出します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crh-hydration-annotate)

4 節の `<!-- ngetn -->` の記録は、「いろいろなテンプレート」のサーバーの HTML の `<!--ngetn-->` を 1 か所だけ書き換えてハイドレートしたもので、例外の文は「NG0500: During hydration Angular expected a text node but the node was not found. … Angular expected this DOM: &lt;span&gt; #text &lt;-- AT THIS LOCATION …」でした。

## ここまでの呼び出し（サーバー、ルートが ViewContainerRef を持つとき）

- `annotateForHydration(appRef, doc)` — annotate.ts L243〜301
  - `getLNodeForHydration(viewRef)` — utils.ts L231〜247 — *埋め込みなら null、ルートなら中身*
  - `annotateLContainerForHydration(lContainer, context)` — annotate.ts L199〜233 — *LContainer のとき*
    - `annotateComponentLViewForHydration` — L180〜191 — *コンポーネントの番号*
      - `annotateHostElementForHydration` — L819〜843 — *ngh か ngSkipHydration（1 節）*
    - `annotateHostElementForHydration(hostElement, rootLView, …)` — L217 — *コンテナの番号*
      - `serializeLContainer` — L314〜480 — *中のルートのビューは r ＋ 2（3 節）*
    - `renderer.setAttribute(hostElement, 'ngh', '0|1')` — L232

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `platform-server/test/full_app_hydration_spec.ts` | `ViewContainerRef`（1130）› `should hydrate dynamically created components using root component as an anchor`（1208）ほか、名前に「root component as an anchor」を含む 3 つ | 2 節の \| と、3 節の r ＋ 2 |
| `platform-server/test/full_app_hydration_spec.ts` | `should allow injecting ViewContainerRef in the root component`（1582） | 2 節 |
| `platform-server/test/full_app_hydration_spec.ts` | `annotations`（129）› `should skip embedded views from an ApplicationRef during annotation`（175） | 4 節の 235〜238 行目 |
| `platform-server/test/full_app_hydration_spec.ts` | `i18n`（1689）› ``should append skip hydration flag if component uses i18n blocks and no `withI18nSupport()` call present``（1695）・`ShadowDom encapsulation`（3262）の 2 つ | 1 節の 2 つの条件 |
| `platform-server/test/full_app_hydration_spec.ts` | `content projection`（4753）の 30 個 | 5 節の `d` |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all \\
    "--test_arg=--filter=<下の表の it の名前の一部>"
```

結果は手元の bazel（2026-11-22）で、「root component as an anchor」が 3 specs、「should allow injecting ViewContainerRef in the root component」が 1 spec、「should skip embedded views from an ApplicationRef」が 1 spec、「uses i18n blocks and no」が 1 spec、「ShadowDom encapsulation」が 2 specs、「content projection」が 30 specs で、どれも 0 failures でした（全体は 399 specs）。2 節のルートが `ngSkipHydration` のときにコンテナの子にも `ngh` が付かないこと（205〜210 行目）と、投影でない切り離しが `d` に入らないこと（L613）を見る it は、名前と `ngh` の文字列を grep した限りありません。テキストの印の空白も同じです。

直すとしたら、annotate.ts の L830〜831 のコメントを「i18n のハイドレーション（`withI18nSupport()`）が有効でないから」にし、544〜545 行目に `@param parentDeferBlockId` を足します。印の空白は、utils.ts の `processTextNodeMarkersBeforeHydration` の L283 を `getTextNodeContent(node) === TextNodeMarker.EmptyNode` にすれば、拾う側（L266〜268）と揃います。spec は full\_app\_hydration\_spec.ts の `should support restoration of multiple text nodes in a row`（4222）の隣に、空白入りの印でハイドレートする it を足します。

## 聞かれそうな質問

**Q. `ngh="0|1"` の | は何ですか？**

ルートのコンポーネントが `ViewContainerRef` を持つときの、コンポーネントのビュー（左）とコンテナを持つルートの LView（右）の 2 つの番号です（228〜232 行目）。ホスト要素が 1 つしかないので 1 つの属性に入れます。

**Q. コンテナの中のコンポーネントの `r` が、中のビューの数より 2 多いのはなぜですか？**

そのコンポーネントも `ViewContainerRef` を持つと、ホスト要素と、後ろの `<!--container-->` の 2 つが並びに入るからです（340〜344 行目）。記録では 2 つの子で `r` が 4 でした。

**Q. サーバーで要素を DOM から外すと、なぜブラウザーで NG0500 になるのですか？**

切り離されたノードを `d` に書くのは投影のノードだけ（L613 の `isContentProjectedNode`、874〜887 行目）で、テンプレートの要素は書かれないからです。ブラウザーはテンプレートの順にその要素を探し、そこにある別の要素を見つけます。

**Q. i18n のあるコンポーネントに `ngSkipHydration` が付くのはいつですか？**

`withI18nSupport()` を書いていないときです（827 行目）。書けば i18n のブロックごとハイドレートされ、属性は付きません。

**Q. DevTools の転送状態に `__nghData__` が出ないのはなぜですか？**

`ng.ɵgetTransferState` が `isInternalHydrationTransferStateKey`（74〜75 行目）で外すからです。`TransferState` そのものには入っています。

## 読み終えて

- ホスト要素に書くのは `ngh`（番号）か `ngSkipHydration`。後者は i18n（`withI18nSupport` なし）と ShadowDom のとき。
- ルートが `ViewContainerRef` の土台なら番号は 2 つで、| でつなぐ。コンテナの中のコンポーネントでも同じで、そのときの `r` は中のビュー ＋ 2。
- `d` に入るのは投影で行き場のなかったノードだけ。サーバーで DOM をいじった跡は残らない。
- テキストの印は、拾う側と戻す側で空白の扱いが違い、空白入りの印は NG0500 になる。

---

← 前: [ハイドレーションの公開 API と型の説明文](01-crh-hydration-api.md)  
次: [ノードの探し方と不一致のエラーの説明文](03-crh-hydration-errors.md) →
