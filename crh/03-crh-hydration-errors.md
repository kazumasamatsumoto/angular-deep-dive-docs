[目次](../README.md) › [core の説明文の読み残し（3）](README.md) › 第 3 回 / 全 8 回

# ノードの探し方と不一致のエラーの説明文

> hydration/node\_lookup\_utils.ts・error\_handling.ts・i18n.ts の未読の行：DOM のノードをどう探すか、NG0500 ほか不一致のエラー文の組み立て（属性の空白が消える）、i18n のブロックのハイドレーション。わざと不一致を作って本物の文を見る。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crh-hydration-errors)

---

この章で分かること：ハイドレーションが DOM のノードを探す関数と、不一致のエラー文（NG0500 ほか）を組み立てる関数、i18n のブロックのハイドレーションの、まだ読んでいないコメントの約束を、わざと不一致を作って Node の上でハイドレートした本物の文と並べます。見つけたのは 3 つです。エラー文の属性とテキストを縮める `stripNewlines` は「改行を消す」と書いて空白を全部消すので、`class="btn btn-primary"` が `class="btnbtn-primary"` と出ます。「本番でも安い説明」と書く `describeDomNode` は、呼ぶ 2 か所がどちらも `ngDevMode` の中で、本番では呼ばれません。`ngh` の番号が壊れたときは、本番だけ番号の付いた例外でなく `TypeError` になります。

読む対象は `packages/core/src/hydration/` の `error_handling.ts`・`node_lookup_utils.ts`・`i18n.ts` と、`utils.ts`・`interfaces.ts`・`skip_hydration.ts` の一部です（../angular、8576f161ae4）。エラーの番号の一覧と `validateMatchingNode` の本体、拡張機能を疑う注記は[不一致のエラーの章](../platform/12-hydration-errors.md)、ノードを探す `locateNextRNode` は[ノードを確保する章](../platform/10-hydration-claim.md)、道順は[道順の章](../platform/09-hydration.md)、i18n の流れは[i18n のハイドレーションの章](../platform/13-hydration-i18n.md)が読んでいます。記録の作り方は[第 1 回](01-crh-hydration-api.md)と同じで、ブラウザーの側では HTML を読み込んだあと、ハイドレートの前に DOM や HTML をわざと変えました。

1. [1. ハイドレーションの公開 API と型](01-crh-hydration-api.md)
2. [2. ngh の書き出し](02-crh-hydration-annotate.md)
3. **3. ノードの探し方と不一致**（この章）
4. [4. @defer](04-crh-defer.md)
5. [5. resource()](05-crh-resource.md)
6. [6. Renderer2](06-crh-renderer.md)
7. [7. 開発用の小道具](07-crh-dev-utils.md)
8. [8. spec と issue](08-crh-tests-issues.md)

> **🧪 DEMO — わざと不一致を作り、本物のエラー文を見る（記録の再生）**
>
> 手元の記録のスクリプトが、Node の上で platform-server 22.2.6 の `renderApplication` で描き、別のプロセスでその HTML を domino の文書に読み込んで、`bootstrapApplication` でハイドレートした結果です（開発モードと、`ngDevMode = false` の本番。JIT。crh-hydration-errors.data.ts）。開発モードの記録では、例外のあと文書の中の `__ngDebugHydrationInfo__`（4 節）も集めました。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crh-hydration-errors)

## 1. エラー文の部品：場所の印と、ノードの短い名前

📄 `angular/packages/core/src/hydration/error_handling.ts` L21–31 （▶ の行: 21, 23, 26–27）

```ts
21 ▶ const AT_THIS_LOCATION = '<-- AT THIS LOCATION';
22 │ 
23 ▶ const THIRD_PARTY_SCRIPTS_URL = `/guide/hydration#third-party-scripts-with-dom-manipulation`;
24 │ 
25 │ /**
26 ▶  * Retrieves a user friendly string for a given TNodeType for use in
27 ▶  * friendly error messages
28 │  *
29 │  * @param tNodeType
30 │  * @returns
31 │  */
```

21 行目の `<-- AT THIS LOCATION` が、エラー文の「期待した DOM」と「実際の DOM」で問題のノードの横に付く印、23 行目が足に出るガイドのアンカーです。26〜27 行目の関数は、TNode の種類を「view container」「ng-container」「@let」などの言葉にします（L32〜54）。

📄 `angular/packages/core/src/hydration/error_handling.ts` L392–418 （▶ の行: 394, 407–413）

```ts
392 │ 
393 │ /**
394 ▶  * Shortens the description of a given RNode by its type for readability
395 │  *
396 │  * @param nodeType the type of node
397 │  * @param tagName the node tag name
398 │  * @param textContent the text content in the node
399 │  * @returns string
400 │  */
401 │ function shortRNodeDescription(
402 │   nodeType: number,
403 │   tagName: string | null,
404 │   textContent: string | null,
405 │ ): string {
406 │   switch (nodeType) {
407 ▶     case Node.ELEMENT_NODE:
408 ▶       return `<${tagName!.toLowerCase()}>`;
409 ▶     case Node.TEXT_NODE:
410 ▶       const content = textContent ? ` (with the "${shorten(textContent)}" content)` : '';
411 ▶       return `a text node${content}`;
412 ▶     case Node.COMMENT_NODE:
413 ▶       return 'a comment node';
414 │     default:
415 │       return `#node(nodeType=${nodeType})`;
416 │   }
417 │ }
418 │ 
```

394 行目「ノードの種類で、読みやすく短くした説明」は、文の 1 行目「During hydration Angular expected `A` but found `B`.」の A と B です（L73・L91〜95）。DEMO の「タグが違う」では「expected &lt;span&gt; but found &lt;div&gt;」、「要素の代わりにテキスト」では 410 行目の形で「found a text node (with the "Hellowideworld" content)」でした。サーバーのテンプレートは `Hello wide world`（コンパイラが空白を 1 つにまとめ、HTML は `Hello wide world`）なのに、文では空白が消えています。理由は 3 節です。

## 2. 属性の並べ方：TNode の属性と、DOM の属性

📄 `angular/packages/core/src/hydration/error_handling.ts` L236–259 （▶ の行: 239, 247–252, 254–255）

```ts
236 │ // Stringification methods
237 │ 
238 │ /**
239 ▶  * Stringifies a given TNode's attributes
240 │  *
241 │  * @param tNode a provided TNode
242 │  * @returns string
243 │  */
244 │ function stringifyTNodeAttrs(tNode: TNode): string {
245 │   const results = [];
246 │   if (tNode.attrs) {
247 ▶     for (let i = 0; i < tNode.attrs.length;) {
248 ▶       const attrName = tNode.attrs[i++];
249 ▶       // Once we reach the first flag, we know that the list of
250 ▶       // attributes is over.
251 ▶       if (typeof attrName == 'number') {
252 ▶         break;
253 │       }
254 ▶       const attrValue = tNode.attrs[i++];
255 ▶       results.push(`${attrName}="${shorten(attrValue as string)}"`);
256 │     }
257 │   }
258 │   return results.join(' ');
259 │ }
```

📄 `angular/packages/core/src/hydration/error_handling.ts` L260–284 （▶ の行: 262–263, 265, 268, 275–278）

```ts
260 │ 
261 │ /**
262 ▶  * The list of internal attributes that should be filtered out while
263 ▶  * producing an error message.
264 │  */
265 ▶ const internalAttrs = new Set(['ngh', 'ng-version', 'ng-server-context']);
266 │ 
267 │ /**
268 ▶  * Stringifies an HTML Element's attributes
269 │  *
270 │  * @param rNode an HTML Element
271 │  * @returns string
272 │  */
273 │ function stringifyRNodeAttrs(rNode: HTMLElement): string {
274 │   const results = [];
275 ▶   for (let i = 0; i < rNode.attributes.length; i++) {
276 ▶     const attr = rNode.attributes[i];
277 ▶     if (internalAttrs.has(attr.name)) continue;
278 ▶     results.push(`${attr.name}="${shorten(attr.value)}"`);
279 │   }
280 │   return results.join(' ');
281 │ }
282 │ 
283 │ // Methods for Describing the DOM
284 │ 
```

「期待した DOM」の要素はテンプレートの静的な属性（`tNode.attrs`）を、249〜252 行目のとおり最初の旗（数値）まで並べます。「実際の DOM」の要素は DOM の属性を全部並べ、262〜263 行目「エラー文から外す内部の属性」の 265 行目の 3 つ（`ngh`・`ng-version`・`ng-server-context`）だけを 277 行目で飛ばします。どちらも値は 255・278 行目で `shorten` を通します。DEMO の「タグが違う」の実際の DOM は `<crh-app>` の `ng-version` などが消え、`<div class="a">…</div>` でした。`ngskiphydration` や `jsaction` は 265 行目に無いので出ます。DOM の説明のあとには必ず、3 節の引用の 461〜463 行目の注記「attributes are only displayed to better represent the DOM but have no effect on hydration mismatches.」が付きます（L107）。

## 3. shorten と stripNewlines：「改行を消す」が空白を全部消す

📄 `angular/packages/core/src/hydration/error_handling.ts` L456–477 （▶ の行: 458, 461–463, 470, 472, 475–476）

```ts
456 │ 
457 │ /**
458 ▶  * An attribute related note for hydration errors
459 │  */
460 │ function getHydrationAttributeNote(): string {
461 ▶   return (
462 ▶     'Note: attributes are only displayed to better represent the DOM' +
463 ▶     ' but have no effect on hydration mismatches.\n\n'
464 │   );
465 │ }
466 │ 
467 │ // Node string utility functions
468 │ 
469 │ /**
470 ▶  * Strips all newlines out of a given string
471 │  *
472 ▶  * @param input a string to be cleared of new line characters
473 │  * @returns
474 │  */
475 ▶ function stripNewlines(input: string): string {
476 ▶   return input.replace(/\s+/gm, '');
477 │ }
```

📄 `angular/packages/core/src/hydration/error_handling.ts` L478–504 （▶ の行: 480, 486, 490–491, 494–498, 500）

```ts
478 │ 
479 │ /**
480 ▶  * Reduces a string down to a maximum length of characters with ellipsis for readability
481 │  *
482 │  * @param input a string input
483 │  * @param maxLength a maximum length in characters
484 │  * @returns string
485 │  */
486 ▶ function shorten(input: string | null, maxLength = 50): string {
487 │   if (!input) {
488 │     return '';
489 │   }
490 ▶   input = stripNewlines(input);
491 ▶   return input.length > maxLength ? `${input.substring(0, maxLength - 1)}…` : input;
492 │ }
493 │ 
494 ▶ /**
495 ▶  * Cheap, production-safe description of a DOM node for error messages: its `nodeName`, plus a
496 ▶  * truncated snippet of its `textContent` if it has any. Unlike `shorten()` above, this is meant
497 ▶  * to be called from code paths that also run in production, so it skips the newline-stripping
498 ▶  * and ellipsis formatting that `shorten()` does.
499 │  */
500 ▶ export function describeDomNode(node: Node): string {
501 │   const textContent = node.textContent?.slice(0, 50);
502 │   return textContent ? `${node.nodeName} ("${textContent}")` : node.nodeName;
503 │ }
504 │ 
```

470 行目と 472 行目は `stripNewlines` を「文字列から改行を全部取り除く」と書きます。476 行目の正規表現 `/\s+/gm` の `\s` は改行だけでなく空白とタブも含み、置き換え先は空文字です。だから 490 行目を通った値は、空白がすべて消えます。480 行目の `shorten` は「省略記号つきで最大の長さまで縮める」で、491 行目のとおり 50 字を超えたら 49 字と「…」にします。

DEMO の「属性に空白と長い値」では、サーバーの `<div class="btn btn-primary" title="a very long title attribute value that is longer than fifty characters">` が、実際の DOM として「`<div title="averylongtitleattributevaluethatislongerthanfifty…" class="btnbtn-primary">…</div>`」と出ました。`btn` と `btn-primary` の 2 つのクラスが、1 つの別のクラス名に見えます。テキストも同じで、1 節の「Hellowideworld」はこのためです。一方、期待した DOM のテキスト（L295 の `describeTNode`）は `shorten` を通さないので、同じテキストでも「期待」には空白があり「実際」には無い、という並びになります（spec の `should handle text node mismatch` が見るのは期待の側の `#text(This is an original content)` です）。この関数は 0851bd5283a（2023-03-20、refactor(core): Improve hydration error handling (#49502)）で入り、新しい本家（origin/main の d201dd76ef2）でも同じです。

494〜499 行目は `describeDomNode` を「安く、本番でも安全なノードの説明。本番でも動く道から呼ぶためのもので、`shorten()` のような改行の除去と省略記号の整形をしない」と書きます。呼ぶのは core の render3/instructions/element.ts の L385 と、platform-browser の dom\_renderer.ts の L364 の 2 か所で、どちらも `RuntimeError` の第 2 引数 `` ngDevMode && `…${describeDomNode(…)}…` `` の中です。本番では `ngDevMode` が `false` なので呼ばれず、DEMO の「要素の代わりにテキスト」の本番の記録は「NG0500」の 5 文字だけでした。開発モードでは element.ts の前の `validateMatchingNode` が先に投げるので、この文もほぼ出ません。関数は 83f7695b2e4（2026-08-19、fix(core): throw coded RuntimeErrors instead of crashing when hydration/rendering can't find an expected DOM node）で入りました。

## 4. 開発モードの印：\_\_ngDebugHydrationInfo\_\_

📄 `angular/packages/core/src/hydration/utils.ts` L290–310 （▶ の行: 292–293, 295–298, 306–308）

```ts
290 │ 
291 │ /**
292 ▶  * Internal type that represents a claimed node.
293 ▶  * Only used in dev mode.
294 │  */
295 ▶ export enum HydrationStatus {
296 ▶   Hydrated = 'hydrated',
297 ▶   Skipped = 'skipped',
298 ▶   Mismatched = 'mismatched',
299 │ }
300 │ 
301 │ export type HydrationInfo =
302 │   | {
303 │       status: HydrationStatus.Hydrated | HydrationStatus.Skipped;
304 │     }
305 │   | {
306 ▶       status: HydrationStatus.Mismatched;
307 ▶       actualNodeDetails: string | null;
308 ▶       expectedNodeDetails: string | null;
309 │     };
310 │ 
```

📄 `angular/packages/core/src/hydration/utils.ts` L363–389 （▶ の行: 368, 370, 375–379, 383–385）

```ts
363 │ export function markRNodeAsHavingHydrationMismatch(
364 │   node: RNode,
365 │   expectedNodeDetails: string | null = null,
366 │   actualNodeDetails: string | null = null,
367 │ ) {
368 ▶   if (!ngDevMode) {
369 │     throw new Error(
370 ▶       'Calling `markRNodeAsMismatchedByHydration` in prod mode ' +
371 │         'is not supported and likely a mistake.',
372 │     );
373 │   }
374 │ 
375 ▶   // The RNode can be a standard HTMLElement (not an Angular component or directive)
376 ▶   // The devtools component tree only displays Angular components & directives
377 ▶   // Therefore we attach the debug info to the closest component/directive
378 ▶   while (node && !getComponent(node as Element)) {
379 ▶     node = node?.parentNode as RNode;
380 │   }
381 │ 
382 │   if (node) {
383 ▶     patchHydrationInfo(node, {
384 ▶       status: HydrationStatus.Mismatched,
385 ▶       expectedNodeDetails,
386 │       actualNodeDetails,
387 │     });
388 │   }
389 │ }
```

292〜293 行目「確保したノードを表す内部の型。開発モードだけで使う」の 3 つの状態を、ノードの `__ngDebugHydrationInfo__`（L311）に書きます（読む関数は Angular DevTools が使う `ɵreadHydrationInfo`、[ノードを確保する章の 6 節](../platform/10-hydration-claim.md)）。375〜377 行目「DevTools の木はコンポーネントとディレクティブしか出さないので、不一致の情報は一番近いコンポーネントに付ける」のとおり、378〜379 行目で親へたどります。DEMO の「ハイドレーションの前に要素を消す」では、`<crh-app>` に `"status":"mismatched"` と期待・実際の DOM の文が、その前に見つけた `<p>` とテキストに `"status":"hydrated"` が付いていました。370 行目の例外の文は、関数の名前（363 行目の `markRNodeAsHavingHydrationMismatch`）でなく `markRNodeAsMismatchedByHydration` と書いています。この名前の関数はありません。

📄 `angular/packages/core/src/hydration/utils.ts` L343–353 （▶ の行: 345, 351–352）

```ts
343 │ 
344 │ export function markRNodeAsSkippedByHydration(node: RNode) {
345 ▶   if (!ngDevMode) {
346 │     throw new Error(
347 │       'Calling `markRNodeAsSkippedByHydration` in prod mode ' +
348 │         'is not supported and likely a mistake.',
349 │     );
350 │   }
351 ▶   patchHydrationInfo(node, {status: HydrationStatus.Skipped});
352 ▶   ngDevMode.componentsSkippedHydration++;
353 │ }
```

352 行目の数が、[第 1 回の 3 節](01-crh-hydration-api.md)の統計の「N component(s) were skipped」です。DEMO の「ngSkipHydration の中の i18n」では「1 component(s) were skipped」でした。

## 5. ノードを探す関数の説明文

📄 `angular/packages/core/src/hydration/node_lookup_utils.ts` L109–118 （▶ の行: 111, 117）

```ts
109 │ 
110 │ /**
111 ▶  * Locate a node in DOM tree that corresponds to a given TNode.
112 │  *
113 │  * @param hydrationInfo The hydration annotation data
114 │  * @param tView the current tView
115 │  * @param lView the current lView
116 │  * @param tNode the current tNode
117 ▶  * @returns an RNode that represents a given tNode
118 │  */
```

111 行目「TNode に当たる DOM のノードを見つける」の中身（道順か、親の最初の子か、前のノードの次か）は[ノードを確保する章の 4 節](../platform/10-hydration-claim.md)です。見つけたノードが合っているかは、呼ぶ側の命令が開発モードで `validateMatchingNode` に渡して確かめます（L59〜121）。本番では確かめないので、DEMO の「タグが違う」の本番の記録は例外も出ず、テンプレートの `<span>` の代わりにサーバーの `<div class="a">` を使ったまま終わりました（[不一致のエラーの章の 6 節](../platform/12-hydration-errors.md)）。

開発モードの「タグが違う」の文の最後には、「Note: It looks like this mismatch may have been caused by a third-party script or browser extension that modified the DOM outside of Angular's control. …」の注記が付きました。DOM には誰も手を触れておらず、テンプレートが違うだけです。注記を付けるかは error\_handling.ts の L111 で、見つけたノードが無いか、`isLikelyExternalSourceNode`（L443〜455）が `true` のときです。後者は「Angular が付けたデータ（`__ngContext__`）が無い要素は外から来た」と見ます。けれどもサーバーが描いてまだ確保していない要素にも、そのデータはありません（データを付けるのは確保したとき、[ノードを確保する章](../platform/10-hydration-claim.md)）。だから要素どうしの不一致はいつも注記が付き、記録では「タグが違う」「属性に空白と長い値」「ハイドレーションの前に要素を消す」「拡張機能のように要素を足す」「サーバーで自分の要素を外す」（第 2 回）のどれにも付き、ノードが見つからない「テキストの印に空白」にも付きました。付かないのは見つけたノードがテキストのとき（L445）だけです。注記の判定は d771a65ac09（refactor: Improve hydration mismatch errors for third-party scripts、#68165）で入り、新しい本家でも同じです。

📄 `angular/packages/core/src/hydration/node_lookup_utils.ts` L202–219 （▶ の行: 204–206, 214, 217）

```ts
202 │ 
203 │ /**
204 ▶  * Helper function to produce a string representation of the navigation steps
205 ▶  * (in terms of `nextSibling` and `firstChild` navigations). Used in error
206 ▶  * messages in dev mode.
207 │  */
208 │ function stringifyNavigationInstructions(instructions: (number | NodeNavigationStep)[]): string {
209 │   const container = [];
210 │   for (let i = 0; i < instructions.length; i += 2) {
211 │     const step = instructions[i];
212 │     const repeat = instructions[i + 1] as number;
213 │     for (let r = 0; r < repeat; r++) {
214 ▶       container.push(step === NODE_NAVIGATION_STEP_FIRST_CHILD ? 'firstChild' : 'nextSibling');
215 │     }
216 │   }
217 ▶   return container.join('.');
218 │ }
219 │ 
```

📄 `angular/packages/core/src/hydration/node_lookup_utils.ts` L253–269 （▶ の行: 253–254, 256–263）

```ts
253 ▶   if (ngDevMode && !node) {
254 ▶     throw nodeNotFoundAtPathError(from, stringifyNavigationInstructions(instructions));
255 │   }
256 ▶   // Same as above: `node` can legitimately end up null here (the path's last step ran off
257 ▶   // the end of the real DOM) without the loop ever dereferencing it further, so the raw
258 ▶   // TypeError guard above never gets a chance to fire for this case. Catch it here instead,
259 ▶   // since this function's return type promises a non-null `RNode`.
260 ▶   if (!node) {
261 ▶     throw new RuntimeError(
262 ▶       RuntimeErrorCode.HYDRATION_MISSING_NODE_ON_PATH,
263 ▶       ngDevMode &&
264 │         'During hydration Angular was unable to locate a node using a recorded navigation path. This usually means the client-rendered DOM no longer matches the server-rendered HTML.',
265 │     );
266 │   }
267 │   return node as RNode;
268 │ }
269 │ 
```

道順（`"n"` の `hfn2` など）で探して途中でノードが無くなると、開発モードは 253〜254 行目の `nodeNotFoundAtPathError` で、204〜206 行目「`nextSibling` と `firstChild` の言葉に戻した文字列。開発モードのエラー文で使う」を文に入れます。DEMO の「道順の先を消す」は「NG0502: During hydration Angular was unable to locate a node using the "firstChild.nextSibling.nextSibling" path, starting from the &lt;crh-box&gt;…&lt;/crh-box&gt; node.」で、`hfn2` の `f` が 1 回、`n` が 2 回です。本番は 256〜259 行目「最後の 1 歩で DOM の端を越えるとループの中の守りに当たらないので、ここで捕まえる」のとおり、260〜263 行目の NG0509（`HYDRATION_MISSING_NODE_ON_PATH`）でした。同じ場面で番号が開発モードは 502、本番は 509 と違います。

同じ「本番でも番号の付いた例外にする」守りが無い場所が 1 つあります。DEMO の「ngh を壊す」で `ngh` を `__nghData__` に無い番号にすると、開発モードは utils.ts の L163 の `assertDefined` で「ASSERTION ERROR: Unable to retrieve hydration info from the TransferState.」、本番は L157 の `nghData[99]` が `undefined` のまま進み「Cannot read properties of undefined (reading 'd')」の `TypeError` でした。L160〜162 のコメントは「データが無ければエラー」と書いています。新しい本家でも L157〜164 は同じです。

## 6. 切り離されたノードの集合

📄 `angular/packages/core/src/hydration/interfaces.ts` L221–253 （▶ の行: 223–224, 227–228, 230–231, 233, 236, 238–239, 241, 244, 247–250）

```ts
221 │ 
222 │   /**
223 ▶    * An instance of a Set that represents nodes disconnected from
224 ▶    * the DOM tree at the serialization time, but otherwise present
225 │    * in the internal data structures.
226 │    *
227 ▶    * The Set is based on the `SerializedView[DISCONNECTED_NODES]` data
228 ▶    * and is needed to have constant-time lookups.
229 │    *
230 ▶    * If the value is `null`, it means that there were no disconnected
231 ▶    * nodes detected in this view at serialization time.
232 │    */
233 ▶   disconnectedNodes?: Set<number> | null;
234 │ 
235 │   /**
236 ▶    * A mapping from a view to the first child to begin claiming nodes.
237 │    *
238 ▶    * This mapping is generated by an i18n block, and is the source of
239 ▶    * truth for the nodes inside of it.
240 │    */
241 ▶   i18nNodes?: Map<number, RNode | null>;
242 │ 
243 │   /**
244 ▶    * A mapping from the index of an ICU node to dehydrated data for it.
245 │    *
246 │    * This information is used during the hydration process on the client.
247 ▶    * ICU cases that were active during server-side rendering will be added
248 ▶    * to the map. The hydration logic will "claim" matching cases, removing
249 ▶    * them from the map. The remaining entries are "unclaimed", and will be
250 ▶    * removed from the DOM during hydration cleanup.
251 │    */
252 │   dehydratedIcuData?: Map<number, DehydratedIcuData>;
253 │ }
```

📄 `angular/packages/core/src/hydration/utils.ts` L489–502 （▶ の行: 491–492, 496–498, 500）

```ts
489 │ 
490 │ /**
491 ▶  * Attempt to initialize the `disconnectedNodes` field of the given
492 ▶  * `DehydratedView`. Returns the initialized value.
493 │  */
494 │ export function initDisconnectedNodes(hydrationInfo: DehydratedView): Set<number> | null {
495 │   // Check if we are processing disconnected info for the first time.
496 ▶   if (typeof hydrationInfo.disconnectedNodes === 'undefined') {
497 ▶     const nodeIds = hydrationInfo.data[DISCONNECTED_NODES];
498 ▶     hydrationInfo.disconnectedNodes = nodeIds ? new Set(nodeIds) : null;
499 │   }
500 ▶   return hydrationInfo.disconnectedNodes;
501 │ }
502 │ 
```

227〜228 行目「`SerializedView` の `d` から作る、定数時間で引くための Set」、230〜231 行目「`null` なら切り離されたノードは無かった」のとおり、496〜498 行目で初めの 1 回だけ作り、`d` が無ければ `null` を入れます。`undefined`（まだ作っていない）と `null`（無い）を分けて、2 度目からは配列を見ません。すぐ下の `isDisconnectedNode`（L508〜515）は、L510〜513 に同じ初期化をもう一度書いてから L514 でこの関数を呼んでいます。動きは同じで、初期化が 2 度書かれているだけです。

📄 `angular/packages/core/src/hydration/node_lookup_utils.ts` L62–87 （▶ の行: 64, 66–68, 71, 75, 85–87）

```ts
62 │ 
63 │ /**
64 ▶  * Check whether the given node exists, but is disconnected from the DOM.
65 │  *
66 ▶  * Note: we leverage the fact that we have this information available in the DOM emulation
67 ▶  * layer (in Domino) for now. Longer-term solution should not rely on the DOM emulation and
68 ▶  * only use internal data structures and state to compute this information.
69 │  */
70 │ export function isDisconnectedRNode(rNode: RNode | null) {
71 ▶   return !!rNode && !(rNode as Node).isConnected;
72 │ }
73 │ 
74 │ /**
75 ▶  * Locate a node in an i18n tree that corresponds to a given instruction index.
76 │  *
77 │  * @param hydrationInfo The hydration annotation data
78 │  * @param noOffsetIndex the instruction index
79 │  * @returns an RNode that corresponds to the instruction index
80 │  */
81 │ export function locateI18nRNodeByIndex<T extends RNode>(
82 │   hydrationInfo: DehydratedView,
83 │   noOffsetIndex: number,
84 │ ): T | null | undefined {
85 ▶   const i18nNodes = hydrationInfo.i18nNodes;
86 ▶   if (i18nNodes) {
87 ▶     return i18nNodes.get(noOffsetIndex) as T | null | undefined;
```

サーバーの側で「切り離されているか」を決めるのは 71 行目の `isConnected` です。66〜68 行目「DOM のまね（domino）にこの情報があるので使っている。長い目では DOM のまねに頼らず、内部のデータだけで決めるべき」は、サーバーの DOM が domino であることに頼っていると書いています。呼ぶのは node\_lookup\_utils.ts の L59 と i18n.ts の L258 で、どちらもサーバーで `ngh` を書くときです。238〜241 行目の `i18nNodes` と 75 行目の `locateI18nRNodeByIndex` は 7 節の i18n で使います。85〜87 行目のとおり、i18n のブロックで集めた Map があれば、その中のノードを返します（Map が無ければ L89 の `undefined` で、通常の探し方に戻る）。

## 7. i18n のブロックのハイドレーション

📄 `angular/packages/core/src/hydration/i18n.ts` L75–94 （▶ の行: 77–78, 80–81, 87–90）

```ts
75 │ 
76 │ /**
77 ▶  * Collects, if not already cached, all of the indices in the
78 ▶  * given TView which are children of an i18n block.
79 │  *
80 ▶  * Since i18n blocks don't introduce a parent TNode, this is necessary
81 ▶  * in order to determine which indices in a LView are translated.
82 │  */
83 │ export function getOrComputeI18nChildren(
84 │   tView: TView,
85 │   context: HydrationContext,
86 │ ): Set<number> | null {
87 ▶   let i18nChildren = context.i18nChildren.get(tView);
88 ▶   if (i18nChildren === undefined) {
89 ▶     i18nChildren = collectI18nChildren(tView);
90 ▶     context.i18nChildren.set(tView, i18nChildren);
91 │   }
92 │   return i18nChildren;
93 │ }
94 │ 
```

80〜81 行目「i18n のブロックは親の TNode を作らないので、LView のどの番号が翻訳の中かを、これで決める」。サーバーで `serializeLView` の初め（annotate.ts L555）が TView ごとに 1 回だけ集め、87〜90 行目でキャッシュします。

📄 `angular/packages/core/src/hydration/i18n.ts` L168–177 （▶ の行: 170–171, 176）

```ts
168 │ 
169 │ /**
170 ▶  * Attempts to serialize i18n data for an i18n block, located at
171 ▶  * the given view and instruction index.
172 │  *
173 │  * @param lView lView with the i18n block
174 │  * @param index index of the i18n block in the lView
175 │  * @param context the hydration context
176 ▶  * @returns the i18n data, or null if there is no relevant data
177 │  */
```

170〜171 行目の `trySerializeI18nBlock` が返すのが `"l"`（`I18N_DATA`）の値で、176 行目のとおり無関係な番号では `null` です。DEMO の「i18n と ICU」では `"l":{"1":[0]}`（1 番の i18n のブロックで、ICU の 0 番目のケース `=1` が選ばれた）、「i18n の中の @if」では ICU が無いので `"l":{"1":[]}` でした。後者は i18n のブロックの後ろの `<i>外</i>` に道順 `"n":{"7":"0fn3"}` も付きました。

📄 `angular/packages/core/src/hydration/i18n.ts` L318–356 （▶ の行: 319, 324–326, 331, 338, 340–344, 346, 354–355）

```ts
318 │ /**
319 ▶  * Describes shared data available during the hydration process.
320 │  */
321 │ interface I18nHydrationContext {
322 │   hydrationInfo: DehydratedView;
323 │   lView: LView;
324 ▶   i18nNodes: Map<number, RNode | null>;
325 ▶   disconnectedNodes: Set<number>;
326 ▶   caseQueue: number[];
327 │   dehydratedIcuData: Map<number, DehydratedIcuData>;
328 │ }
329 │ 
330 │ /**
331 ▶  * Describes current hydration state.
332 │  */
333 │ interface I18nHydrationState {
334 │   // The current node
335 │   currentNode: Node | null;
336 │ 
337 │   /**
338 ▶    * Whether the tree should be connected.
339 │    *
340 ▶    * During hydration, it can happen that we expect to have a
341 ▶    * current RNode, but we don't. In such cases, we still need
342 ▶    * to propagate the expectation to the corresponding LViews,
343 ▶    * so that the proper downstream error handling can provide
344 ▶    * the correct context for the error.
345 │    */
346 ▶   isConnected: boolean;
347 │ }
348 │ 
349 │ function setCurrentNode(state: I18nHydrationState, node: Node | null) {
350 │   state.currentNode = node;
351 │ }
352 │ 
353 │ /**
354 ▶  * Marks the current RNode as the hydration root for the given
355 ▶  * AST node.
356 │  */
```

📄 `angular/packages/core/src/hydration/i18n.ts` L380–411 （▶ の行: 382, 384–386, 391, 394, 400, 403）

```ts
380 │ 
381 │ /**
382 ▶  * Skip over some sibling nodes during hydration.
383 │  *
384 ▶  * Note: we use this instead of `siblingAfter` as it's expected that
385 ▶  * sometimes we might encounter null nodes. In those cases, we want to
386 ▶  * defer to downstream error handling to provide proper context.
387 │  */
388 │ function skipSiblingNodes(state: I18nHydrationState, skip: number) {
389 │   let currentNode = state.currentNode;
390 │   for (let i = 0; i < skip; i++) {
391 ▶     if (!currentNode) {
392 │       break;
393 │     }
394 ▶     currentNode = currentNode?.nextSibling ?? null;
395 │   }
396 │   return currentNode;
397 │ }
398 │ 
399 │ /**
400 ▶  * Fork the given state into a new state for hydrating children.
401 │  */
402 │ function forkHydrationState(state: I18nHydrationState, nextNode: Node | null) {
403 ▶   return {currentNode: nextNode, isConnected: state.isConnected};
404 │ }
405 │ 
406 │ function prepareI18nBlockForHydrationImpl(
407 │   lView: LView,
408 │   index: number,
409 │   parentTNode: TNode | null,
410 │   subTemplateIndex: number,
411 │ ) {
```

ブラウザーでは、i18n のブロックの翻訳後の木（AST）をたどって、ノードごとに DOM のノードを決め、6 節の `i18nNodes` に入れます（[i18n のハイドレーションの章の 5 節](../platform/13-hydration-i18n.md)）。そのときの状態が 333〜347 行目で、338〜344 行目「ノードを期待しているのに無いことがある。それでも期待をビューに伝えて、後のエラー処理が正しい文脈を出せるようにする」が `isConnected` の意味です。382〜386 行目の `skipSiblingNodes` は「`siblingAfter` の代わりに使う。`null` のノードに出会っても投げず、後のエラー処理に任せる」で、391 行目で止まるだけです。`siblingAfter`（node\_lookup\_utils.ts L184〜201）は開発モードで NG0501 を投げます。

📄 `angular/packages/core/src/hydration/i18n.ts` L564–586 （▶ の行: 566, 574–575, 577–579）

```ts
564 │           }
565 │ 
566 ▶           case I18nPlaceholderType.SUBTEMPLATE: {
567 │             ngDevMode &&
568 │               assertNotEqual(
569 │                 containerSize,
570 │                 null,
571 │                 'Expected a container size while hydrating i18n subtemplate',
572 │               );
573 │ 
574 ▶             // Hydration expects to find the head of the template.
575 ▶             appendI18nNodeToCollection(context, state, nodeOrNodes);
576 │ 
577 ▶             // Skip over all of the template children, as well as the anchor
578 ▶             // node, since the template itself will handle them instead.
579 ▶             const nextNode = skipSiblingNodes(state, containerSize! + 1);
580 │             setCurrentNode(state, nextNode);
581 │             break;
582 │           }
583 │         }
584 │         break;
585 │       }
586 │ 
```

翻訳の中の `@if` は 566 行目のサブテンプレートの印です。577〜578 行目「テンプレートの子と後ろの印は、テンプレート自身が扱うので飛ばす」のとおり、579 行目でコンテナの大きさ ＋ 1 だけ進めます。DEMO の「i18n の中の @if」は例外なくハイドレートでき、統計は「1 component(s) and 10 node(s)」でした。

📄 `angular/packages/core/src/hydration/interfaces.ts` L254–282 （▶ の行: 267–269, 271, 275, 281）

```ts
254 │ 
255 │ /**
256 │  * An object that contains hydration-related information serialized
257 │  * on the server, as well as the necessary references to segments of
258 │  * the DOM, to facilitate the hydration process for a given view
259 │  * inside a view container (either an embedded view or a view created
260 │  * for a component).
261 │  */
262 │ export interface DehydratedContainerView extends DehydratedView {
263 │   data: Readonly<SerializedContainerView>;
264 │ }
265 │ 
266 │ /**
267 ▶  * An object that contains information about a dehydrated ICU case,
268 ▶  * to facilitate cleaning up ICU cases that were active during
269 ▶  * server-side rendering, but not during hydration.
270 │  */
271 ▶ export interface DehydratedIcuData {
272 │   /**
273 │    * The case index that this data represents.
274 │    */
275 ▶   case: number;
276 │ 
277 │   /**
278 │    * A reference back to the AST for the ICU node. This allows the
279 │    * AST to be used to clean up dehydrated nodes.
280 │    */
281 ▶   node: I18nICUNode;
282 │ }
```

267〜269 行目「サーバーで選ばれていて、ハイドレーションでは選ばれなかった ICU のケースを片付けるための情報」です。6 節の引用の 244〜250 行目のとおり、ブラウザーが同じケースを選べば Map から外し、残ったものを片付けで消します。DEMO の「i18n と ICU」では、サーバーが n = 1 で「ひとつ」、ブラウザーが n = 5 で、ハイドレーションのあとの HTML は「…&lt;b&gt;太字&lt;/b&gt; たくさん&lt;!--ICU 29:1--&gt;」になり、例外はありませんでした。

📄 `angular/packages/core/src/hydration/skip_hydration.ts` L73–86 （▶ の行: 75–77, 81–83）

```ts
73 │ 
74 │ /**
75 ▶  * Check if an i18n block is in a skip hydration section by looking at a parent TNode
76 ▶  * to determine if this TNode is in a skip hydration section or the TNode has
77 ▶  * the `ngSkipHydration` attribute.
78 │  */
79 │ export function isI18nInSkipHydrationBlock(parentTNode: TNode): boolean {
80 │   return (
81 ▶     hasInSkipHydrationBlockFlag(parentTNode) ||
82 ▶     hasSkipHydrationAttrOnTNode(parentTNode) ||
83 ▶     isInSkipHydrationBlock(parentTNode)
84 │   );
85 │ }
86 │ 
```

75〜77 行目「親の TNode を見て、i18n のブロックが飛ばす範囲の中か、その TNode に `ngSkipHydration` があるかを決める」。81〜83 行目の 3 つのうち、83 行目の `isInSkipHydrationBlock` が中で 81・82 行目と同じ判定をしてから親へたどる（[第 1 回の 7 節](01-crh-hydration-api.md)）ので、81・82 行目は早めに答えを出すためだけの重複です。DEMO の「ngSkipHydration の中の i18n」は、サーバーが `<crh-t ngskiphydration="">` を書き、中の i18n は作り直されて、統計は「1 component(s) were skipped」でした。

## ここまでの呼び出し（開発モードで要素が合わなかったとき）

- `ɵɵelementStart` → `locateOrCreateElementNodeImpl` — render3/instructions/element.ts
  - `locateNextRNode` — node\_lookup\_utils.ts L119〜 — *見つけたノード（5 節）*
  - `validateMatchingNode(native, Node.ELEMENT_NODE, name, lView, tNode)` — error\_handling.ts L59〜121 — *開発モードだけ*
    - `shortRNodeDescription` — L401〜417 — *1 行目（1 節）*
    - `describeExpectedDom` / `describeDomFromNode` — L335〜391 — *属性は stringify\*Attrs → shorten → stripNewlines（2・3 節）*
    - `markRNodeAsHavingHydrationMismatch` — utils.ts L363〜389 — *近いコンポーネントに印（4 節）*
    - `throw new RuntimeError(HYDRATION_NODE_MISMATCH, message)` — L119 — *NG0500*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `platform-server/test/full_app_hydration_spec.ts` | `error handling`（6142）› `should handle text node mismatch`（6143）・`should handle element node mismatch`（6215） | 1・2 節の文の形。値に空白を含む属性やテキストは使っていない |
| `platform-server/test/full_app_hydration_spec.ts` | `error handling` › `should throw a coded RuntimeError, not a raw TypeError, when …` の 4 つ（6255・6328・6395・6463） | 5 節の本番の守り。壊れた `ngh` の番号の場合は無い |
| `platform-server/test/full_app_hydration_spec.ts` | `error handling` › `should handle a case when a node is not found (removed)`（6865）ほか 2 つ | 5 節の道順のエラー |
| `platform-server/test/full_app_hydration_spec.ts` | `error handling` › `should if there are any third-party scripts that manipulate the DOM`（6537） | 2 節の足のガイドのアンカー（23 行目） |
| `platform-server/test/full_app_hydration_spec.ts` | `i18n`（1689）の中の it | 7 節 |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all \\
    "--test_arg=--filter=error handling"
$ pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all \\
    "--test_arg=--filter=i18n"
```

結果は手元の bazel（2026-11-22）で、「error handling」が 21 specs、「i18n」が 34 specs、「third-party」が 1 spec で、どれも 0 failures でした（全体は 399 specs）。

直すとしたら、error\_handling.ts の `stripNewlines`（475〜477 行目）を、名前と説明のとおり改行だけにする（`/\n+/g` を 1 つの空白に）か、空白の並びを 1 つにまとめる（`/\s+/g` を `' '` に）です。`should handle element node mismatch` の隣に、`class="a b"` の要素で不一致を作り、文に `class="a b"` が出ることを見る it を足します。`describeDomNode` は、説明の「本番でも」を外すか、呼ぶ側の `ngDevMode &&` を外して本番の文にも入れます（後者は本番のエラー文が長くなります）。壊れた `ngh` は、utils.ts の `retrieveHydrationInfoImpl` の L157 のあとに、`navigateToNode`（260〜266 行目）と同じ形で `data === undefined` のときの `RuntimeError` を足し、6255 行目からの 4 つの隣に本番の it を足します。utils.ts の 370 行目は関数の名前に合わせます。

## 聞かれそうな質問

**Q. NG0500 の文で、クラス名がつながって見えるのはなぜですか？**

属性の値を `shorten` が `stripNewlines` に通し、476 行目の `/\s+/gm` が空白も全部消すからです。`class="btn btn-primary"` は `class="btnbtn-primary"` と出ます（DEMO の「属性に空白と長い値」）。DOM の値は変わっていません。

**Q. 本番ビルドで不一致があると、何が起きますか？**

場合によります。要素のタグが違うだけなら例外にならずサーバーの要素を使い続け、要素の代わりにテキストなら「NG0500」、道順が切れたら「NG0509」、`ngh` の番号が壊れたら `TypeError` でした（DEMO の本番の記録）。文の中身は本番では付きません。

**Q. DevTools でハイドレーションの不一致がコンポーネントに出るのはなぜですか？**

不一致の情報を、一番近いコンポーネントのホストの `__ngDebugHydrationInfo__` に付けるからです（375〜379 行目）。

**Q. 同じ道順のエラーなのに、番号が 502 と 509 で違うのはなぜですか？**

開発モードは 253〜254 行目の `nodeNotFoundAtPathError`（NG0502、文つき）、本番は 260〜263 行目の `HYDRATION_MISSING_NODE_ON_PATH`（NG0509）を投げるからです。

**Q. ICU のケースがサーバーとブラウザーで違うと、エラーになりますか？**

なりません。サーバーのケースを `dehydratedIcuData` に覚えておき、選ばれなかったものを片付けで消します（267〜269 行目）。記録では「ひとつ」が「たくさん」に入れ替わりました。

## 読み終えて

- エラー文の「実際の DOM」は内部の 3 つの属性を外し、値を 50 字に縮める。そのとき空白まで消えるので、クラス名やテキストは見た目どおりではない。
- 不一致の情報は開発モードだけ、近いコンポーネントの `__ngDebugHydrationInfo__` に付く。
- 本番のエラーは番号だけで、場面によって NG0500・NG0509・`TypeError`・何も出ない、に分かれる。
- i18n のブロックは翻訳後の木で DOM をたどり、ノードが無くてもその場では投げず、後のエラー処理に任せる。ICU のケースの違いは片付けで吸収する。

---

← 前: [ngh の書き出しの説明文：annotate と utils](02-crh-hydration-annotate.md)  
次: [@defer の実装のコメントと説明文](04-crh-defer.md) →
