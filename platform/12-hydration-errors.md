[目次](../README.md) › [SSR とハイドレーション](README.md) › 第 12 回 / 全 15 回

# ハイドレーションの不一致：NG0500 番台のエラーと ngSkipHydration

> validateMatchingNode が期待するノードと実際のノードを比べ、describeExpectedDom / describeDomFromNode で差分のメッセージを組み立てる行。NG0500（不一致）・NG0501（兄弟が無い）・NG0502（ノードが無い）・NG0503（投影できない DOM）・NG0504（ngSkipHydration の置き場所）・NG0505（注釈が無いという警告）・NG0507（nghm が無い）が出る場面、ngSkipHydration と PRESERVE\_HOST\_CONTENT、直接 DOM を触るコードがなぜ壊すか。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/hydration-errors)

---

ハイドレーションの最中に「テンプレートが期待するノード」と「サーバーが描いた DOM」が食い違うと、コンソールに `NG0500: During hydration Angular expected <p> but found <div>.` のような長いメッセージが出ます。この章では、その比較をしている行、メッセージを組み立てる行、NG0500 番台の各エラーが**どこで（サーバーかブラウザか、開発モードか本番か）**出るのかを確認し、`ngSkipHydration` と `PRESERVE_HOST_CONTENT` がどこに効くのかを読みます。

読む対象は `packages/core/src/hydration/error_handling.ts`、`hydration/skip_hydration.ts`、`hydration/tokens.ts`、`core/src/errors.ts` です。

1. [1. 概観](01-ssr-overview.md)
2. [2. renderApplication](02-ssr-render-application.md)
3. [3. platformServer と domino](03-ssr-platform-server.md)
4. [4. AngularAppEngine](04-ssr-app-engine.md)
5. [5. サーバールート](05-ssr-server-routes.md)
6. [6. プリレンダー](06-ssr-prerender.md)
7. [7. provideClientHydration](07-hydration-provide.md)
8. [8. ngh の書き出し](08-hydration-annotate.md)
9. [9. ノードの道順](09-hydration.md)
10. [10. ノードの確保](10-hydration-claim.md)
11. [11. コンテナと片付け](11-hydration-containers.md)
12. **12. 不一致のエラー**（この章）
13. [13. i18n](13-hydration-i18n.md)
14. [14. イベントの再生](14-event-replay.md)
15. [15. インクリメンタル](15-incremental-hydration.md)

## 1. エラー番号の一覧

📄 `angular/packages/core/src/errors.ts` L82–93 （▶ の行: 83, 86, 88, 91–92）

```ts
82 │   // Hydration Errors
83 ▶   HYDRATION_NODE_MISMATCH = -500,
84 │   HYDRATION_MISSING_SIBLINGS = -501,
85 │   HYDRATION_MISSING_NODE = -502,
86 ▶   UNSUPPORTED_PROJECTION_DOM_NODES = -503,
87 │   INVALID_SKIP_HYDRATION_HOST = -504,
88 ▶   MISSING_HYDRATION_ANNOTATIONS = -505,
89 │   HYDRATION_STABLE_TIMEDOUT = -506,
90 │   MISSING_SSR_CONTENT_INTEGRITY_MARKER = -507,
91 ▶   MISCONFIGURED_INCREMENTAL_HYDRATION = 508,
92 ▶   HYDRATION_MISSING_NODE_ON_PATH = 509,
93 │   PARENT_NODE_NOT_FOUND = 510,
```

📄 `angular/packages/core/src/errors.ts` L190–195 （▶ の行: 194）

```ts
190 │ export function formatRuntimeErrorCode<T extends number = RuntimeErrorCode>(code: T): string {
191 │   // Error code might be a negative number, which is a special marker that instructs the logic to
192 │   // generate a link to the error details page on angular.io.
193 │   // We also prepend `0` to non-compile-time errors.
194 ▶   return `NG0${Math.abs(code)}`;
195 │ }
```

83〜90 行目は負の数、91〜92 行目は正の数です。194 行目で表示はどちらも `NG0` + 絶対値（`-500` → `NG0500`）になります。違いは 191〜192 行目のコメントのとおりで、負の番号は開発モードのメッセージの末尾に `Find more at https://…/errors/NG0500` という 詳細ページへのリンクが付きます（`formatRuntimeError`。[di-r3-injector-get](../di/08-di-r3-injector-get.md) で読んだ関数）。508 と 509 にはリンクが付きません。

| 番号・名前 | 出る場所 | 出る場面 | 直し方 |
| --- | --- | --- | --- |
| `NG0500`<br>HYDRATION\_NODE\_MISMATCH | ブラウザ。開発モードは `validateMatchingNode`（2 節）、本番は「要素のはずが要素でない」ときだけ（6 節） | 期待したノードと、種類かタグ名が違う | サーバーとブラウザで同じ構造を描く。不正な入れ子の HTML（`<p>` の中の `<div>` など）を直す。DOM を直接触らない |
| `NG0501`<br>HYDRATION\_MISSING\_SIBLINGS | ブラウザ。`validateSiblingNodeExists`（開発）と `siblingAfter` の確認（本番） | `<ng-container>` やコンテナの区間を飛ばす途中で、兄弟が足りない | 同上。コメントノードを消す最適化（CDN など）が入っていないか |
| `NG0502`<br>HYDRATION\_MISSING\_NODE | サーバー（`nodeNotFoundError`）とブラウザ（`validateNodeExists`・`nodeNotFoundAtPathError`、本番の要素の確認） | サーバー：道順を計算する相手が DOM に無い。ブラウザ：その位置にノードが無い | 描画後に DOM から外した要素が無いか。`ngSkipHydration` |
| `NG0503`<br>UNSUPPORTED\_PROJECTION\_DOM\_NODES | サーバー（シリアライズ中） | `createComponent(…, {projectableNodes})` に DOM ノードを直接渡した | テンプレートで投影する形に直すか、そのコンポーネントのホストに `ngSkipHydration` |
| `NG0504`<br>INVALID\_SKIP\_HYDRATION\_HOST | ブラウザ。開発モードだけ | `ngSkipHydration` をコンポーネントのホストでない要素に付けた | コンポーネントのホスト要素へ移す（7 節） |
| `NG0505`<br>MISSING\_HYDRATION\_ANNOTATIONS | ブラウザ。開発モードの `console.warn` | ブラウザで `provideClientHydration` したのに、HTML に `__nghData__` が無い | サーバー側の設定にも `provideClientHydration()`（[第 7 回](07-hydration-provide.md)） |
| `NG0506`<br>HYDRATION\_STABLE\_TIMEDOUT | ブラウザ。開発モードの `console.warn` | 10 秒たっても `ApplicationRef` が安定しない（片付けが始まらない） | 終わらないタイマーやポーリングを安定後に始める（[zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md)） |
| `NG0507`<br>MISSING\_SSR\_CONTENT\_INTEGRITY\_MARKER | ブラウザ（本番でも投げる。メッセージは開発モードだけ） | `<!--nghm-->` が無い ＝ HTML が配信の途中で書き換えられた | コメントや空白を削る最適化を切る（[第 7 回](07-hydration-provide.md)） |
| `NG0508`<br>MISCONFIGURED\_INCREMENTAL\_HYDRATION | ブラウザの `console.warn` | `hydrate` トリガーがあるのにインクリメンタルハイドレーションが無効 | `withNoIncrementalHydration()` を外す（[第 15 回](15-incremental-hydration.md)） |
| `NG0509`<br>HYDRATION\_MISSING\_NODE\_ON\_PATH | ブラウザ。本番だけ（開発モードでは同じ場面が NG0502） | 記録された道順の途中でノードが尽きた | NG0502 と同じ（[第 9 回](09-hydration.md)の道順） |

## 2. 比べる行：validateMatchingNode

[第 10 回](10-hydration-claim.md)の `locateOrCreateElementNodeImpl` などは、見つけたノードを `ngDevMode && validateMatchingNode(native, Node.ELEMENT_NODE, name, lView, tNode)` に渡していました。

📄 `angular/packages/core/src/hydration/error_handling.ts` L56–81 （▶ の行: 68–71, 73–74, 76, 79）

```ts
56 │ /**
57 │  * Validates that provided nodes match during the hydration process.
58 │  */
59 │ export function validateMatchingNode(
60 │   node: RNode | null,
61 │   nodeType: number,
62 │   tagName: string | null,
63 │   lView: LView,
64 │   tNode: TNode,
65 │   isViewContainerAnchor = false,
66 │ ): void {
67 │   if (
68 ▶     !node ||
69 ▶     (node as Node).nodeType !== nodeType ||
70 ▶     ((node as Node).nodeType === Node.ELEMENT_NODE &&
71 ▶       (node as HTMLElement).tagName.toLowerCase() !== tagName?.toLowerCase())
72 │   ) {
73 ▶     const expectedNode = shortRNodeDescription(nodeType, tagName, null);
74 ▶     let header = `During hydration Angular expected ${expectedNode} but `;
75 │ 
76 ▶     const hostComponentDef = getDeclarationComponentDef(lView);
77 │     const componentClassName = hostComponentDef?.type?.name;
78 │ 
79 ▶     const expectedDom = describeExpectedDom(lView, tNode, isViewContainerAnchor);
80 │     const expected = `Angular expected this DOM:\n\n${expectedDom}\n\n`;
81 │ 
```

比べるのは 68〜71 行目の 3 つだけです。ノードが無い、`nodeType`（要素・テキスト・コメント）が違う、要素ならタグ名が違う。**属性・クラス・文字の中身は比べません**。73〜74 行目で見出しの前半「expected &lt;p&gt; but」を作り、76 行目で `LView` の持ち主のコンポーネント（エラーの足元に名前を出すため）を取り、79 行目で「期待した DOM」の図を作ります（3 節）。

📄 `angular/packages/core/src/hydration/error_handling.ts` L82–121 （▶ の行: 84, 86, 89, 97–98, 103, 107, 111, 116, 119）

```ts
 82 │     let actual = '';
 83 │     const componentHostElement = unwrapRNode(lView[HOST]!);
 84 ▶     if (!node) {
 85 │       // No node found during hydration.
 86 ▶       header += `the node was not found.\n\n`;
 87 │ 
 88 │       // Since the node is missing, we use the closest node to attach the error to
 89 ▶       markRNodeAsHavingHydrationMismatch(componentHostElement, expectedDom);
 90 │     } else {
 91 │       const actualNode = shortRNodeDescription(
 92 │         (node as Node).nodeType,
 93 │         (node as HTMLElement).tagName ?? null,
 94 │         (node as HTMLElement).textContent ?? null,
 95 │       );
 96 │ 
 97 ▶       header += `found ${actualNode}.\n\n`;
 98 ▶       const actualDom = describeDomFromNode(node);
 99 │       actual = `Actual DOM is:\n\n${actualDom}\n\n`;
100 │ 
101 │       // DevTools only report hydration issues on the component level, so we attach extra debug
102 │       // info to a component host element to make it available to DevTools.
103 ▶       markRNodeAsHavingHydrationMismatch(componentHostElement, expectedDom, actualDom);
104 │     }
105 │ 
106 │     const footer = getHydrationErrorFooter(componentClassName);
107 ▶     let message = header + expected + actual + getHydrationAttributeNote() + footer;
108 │ 
109 │     // Check both when a mismatching node is found AND when the expected node is missing,
110 │     // since third-party scripts can both inject extra nodes and remove existing ones.
111 ▶     if (!node || (node && isLikelyExternalSourceNode(node))) {
112 │       message +=
113 │         `Note: It looks like this mismatch may have been caused by a third-party script or ` +
114 │         `browser extension that modified the DOM outside of Angular's control. ` +
115 │         `Angular hydration does not support nodes injected or removed outside of the Angular-managed DOM. ` +
116 ▶         `Note: If you know which element in the DOM this will be inserted, consider adding ngSkipHydration to prevent this error. \n\n`;
117 │     }
118 │ 
119 ▶     throw new RuntimeError(RuntimeErrorCode.HYDRATION_NODE_MISMATCH, message);
120 │   }
121 │ }
```

1. **84〜89 行目：ノードが無かった**

   見出しの後半は「the node was not found.」。実際の DOM の図は作れないので無し。
2. **97〜98 行目：別のノードがあった**

   見出しの後半は「found &lt;div&gt;.」、98 行目で「実際の DOM」の図を作ります。
3. **89・103 行目：DevTools のための印**

   `markRNodeAsHavingHydrationMismatch` は、期待と実際の文字列をコンポーネントのホスト要素の `__ngDebugHydrationInfo__` に置きます （[第 10 回](10-hydration-claim.md)の 6 節と同じプロパティ）。
4. **107 行目：見出し + 期待 + 実際 + 属性の注記 + 直し方**

   属性の注記（`getHydrationAttributeNote`）は「属性は図を分かりやすくするために出しているだけで、不一致の判定には関係ない」という 1 文です。
5. **111 行目：外から来たノードらしければ、注記を足す**

   ノードが無いか、Angular の知らない要素なら（5 節）、サードパーティのスクリプトや拡張機能を疑う文を足します。
6. **119 行目：NG0500 を投げる**

   ハイドレーションはここで止まります。アプリの起動そのものが失敗します。

## 3. 「期待した DOM」と「実際の DOM」の図

メッセージの中心は 2 つの図です。期待側は `TNode`（テンプレートの情報）から、実際側は DOM ノードから作ります。

📄 `angular/packages/core/src/hydration/error_handling.ts` L335–366 （▶ の行: 347, 349, 357, 359, 361, 363）

```ts
335 │ /**
336 │  * Builds the string containing the expected DOM present given the LView and TNode
337 │  * values for a readable error message
338 │  *
339 │  * @param lView the lView containing the DOM
340 │  * @param tNode the tNode
341 │  * @param isViewContainerAnchor boolean
342 │  * @returns string
343 │  */
344 │ function describeExpectedDom(lView: LView, tNode: TNode, isViewContainerAnchor: boolean): string {
345 │   const spacer = '  ';
346 │   let content = '';
347 ▶   if (tNode.prev) {
348 │     content += spacer + '…\n';
349 ▶     content += spacer + describeTNode(tNode.prev) + '\n';
350 │   } else if (tNode.type && tNode.type & TNodeType.AnyContainer) {
351 │     content += spacer + '…\n';
352 │   }
353 │   if (isViewContainerAnchor) {
354 │     content += spacer + describeTNode(tNode) + '\n';
355 │     content += spacer + `<!-- container -->  ${AT_THIS_LOCATION}\n`;
356 │   } else {
357 ▶     content += spacer + describeTNode(tNode) + `  ${AT_THIS_LOCATION}\n`;
358 │   }
359 ▶   content += spacer + '…\n';
360 │ 
361 ▶   const parentRNode = tNode.type ? getParentRElement(lView[TVIEW], tNode, lView) : null;
362 │   if (parentRNode) {
363 ▶     content = describeRNode(parentRNode as unknown as Node, '\n' + content);
364 │   }
365 │   return content;
366 │ }
```

347〜349 行目、前の兄弟 `TNode` があれば `…` とその説明を 1 行。357 行目で期待したノードに `<-- AT THIS LOCATION` を付け、359 行目で後ろを `…` で省略します。361〜363 行目、親の DOM 要素の説明で全体を包みます。

📄 `angular/packages/core/src/hydration/error_handling.ts` L368–391 （▶ の行: 379, 381, 383–384, 388）

```ts
368 │ /**
369 │  * Builds the string containing the DOM present around a given RNode for a
370 │  * readable error message
371 │  *
372 │  * @param node the RNode
373 │  * @returns string
374 │  */
375 │ function describeDomFromNode(node: RNode): string {
376 │   const spacer = '  ';
377 │   let content = '';
378 │   const currentNode = node as HTMLElement;
379 ▶   if (currentNode.previousSibling) {
380 │     content += spacer + '…\n';
381 ▶     content += spacer + describeRNode(currentNode.previousSibling) + '\n';
382 │   }
383 ▶   content += spacer + describeRNode(currentNode) + `  ${AT_THIS_LOCATION}\n`;
384 ▶   if (node.nextSibling) {
385 │     content += spacer + '…\n';
386 │   }
387 │   if (node.parentNode) {
388 ▶     content = describeRNode(currentNode.parentNode as Node, '\n' + content);
389 │   }
390 │   return content;
391 │ }
```

実際側も同じ形です。379〜381 行目で `previousSibling`、383 行目で見つかったノードに印、384 行目で後ろがあれば `…`、388 行目で `parentNode` で包みます。2 つの図は同じ「親 › 前の兄弟 › ここ」の形なので、並べると差が見えます。1 行ずつの説明は次の 2 つの関数です。

📄 `angular/packages/core/src/hydration/error_handling.ts` L285–309 （▶ の行: 296, 300, 302, 304）

```ts
285 │ /**
286 │  * Converts a tNode to a helpful readable string value for use in error messages
287 │  *
288 │  * @param tNode a given TNode
289 │  * @param innerContent the content of the node
290 │  * @returns string
291 │  */
292 │ function describeTNode(tNode: TNode, innerContent: string = '…'): string {
293 │   switch (tNode.type) {
294 │     case TNodeType.Text:
295 │       const content = tNode.value ? `(${tNode.value})` : '';
296 ▶       return `#text${content}`;
297 │     case TNodeType.Element:
298 │       const attrs = stringifyTNodeAttrs(tNode);
299 │       const tag = tNode.value.toLowerCase();
300 ▶       return `<${tag}${attrs ? ' ' + attrs : ''}>${innerContent}</${tag}>`;
301 │     case TNodeType.ElementContainer:
302 ▶       return '<!-- ng-container -->';
303 │     case TNodeType.Container:
304 ▶       return '<!-- container -->';
305 │     default:
306 │       const typeAsString = getFriendlyStringFromTNodeType(tNode.type);
307 │       return `#node(${typeAsString})`;
308 │   }
309 │ }
```

📄 `angular/packages/core/src/hydration/error_handling.ts` L311–333 （▶ の行: 323–324, 327, 329）

```ts
311 │ /**
312 │  * Converts an RNode to a helpful readable string value for use in error messages
313 │  *
314 │  * @param rNode a given RNode
315 │  * @param innerContent the content of the node
316 │  * @returns string
317 │  */
318 │ function describeRNode(rNode: RNode, innerContent: string = '…'): string {
319 │   const node = rNode as HTMLElement;
320 │   switch (node.nodeType) {
321 │     case Node.ELEMENT_NODE:
322 │       const tag = node.tagName!.toLowerCase();
323 ▶       const attrs = stringifyRNodeAttrs(node);
324 ▶       return `<${tag}${attrs ? ' ' + attrs : ''}>${innerContent}</${tag}>`;
325 │     case Node.TEXT_NODE:
326 │       const content = node.textContent ? shorten(node.textContent) : '';
327 ▶       return `#text${content ? `(${content})` : ''}`;
328 │     case Node.COMMENT_NODE:
329 ▶       return `<!-- ${shorten(node.textContent ?? '')} -->`;
330 │     default:
331 │       return `#node(${node.nodeType})`;
332 │   }
333 │ }
```

300 行目と 324 行目、要素はどちらも `<tag 属性>…</tag>` の形です。302・304 行目、`<ng-container>` とコンテナは期待側ではコメントとして描かれ、329 行目で実際側のコメントも `<!-- 中身 -->` になります。323 行目の `stringifyRNodeAttrs` は `ngh`・`ng-version`・`ng-server-context` を省きます（Angular が付けた属性なので）。

📄 `angular/packages/core/src/hydration/error_handling.ts` L419–435 （▶ の行: 426, 429, 431–432）

```ts
419 │ /**
420 │  * Builds the footer hydration error message
421 │  *
422 │  * @param componentClassName the name of the component class
423 │  * @returns string
424 │  */
425 │ function getHydrationErrorFooter(componentClassName?: string): string {
426 ▶   const componentInfo = componentClassName ? `the "${componentClassName}"` : 'corresponding';
427 │   return (
428 │     `To fix this problem:\n` +
429 ▶     `  * check ${componentInfo} component for hydration-related issues\n` +
430 │     `  * check to see if your template has valid HTML structure\n` +
431 ▶     `  * check if there are any third-party scripts that manipulate the DOM. More info: ${DOC_PAGE_BASE_URL}${THIRD_PARTY_SCRIPTS_URL}\n` +
432 ▶     `  * or skip hydration by adding the \`ngSkipHydration\` attribute ` +
433 │     `to its host node in a template\n\n`
434 │   );
435 │ }
```

426 行目、コンポーネント名が分かれば `the "ArticleCard" component`、分からなければ `corresponding component`。431 行目のリンク先は `DOC_PAGE_BASE_URL`（バージョンから `https://v22.angular.dev` などになる）です。本番ビルドではコンポーネントのクラス名が短縮されるので、名前の部分は意味のない文字になります。

> **🧪 DEMO — validateMatchingNode と同じ手順でメッセージを組み立てる**
>
> 本番のページで本当に不一致を起こすわけにはいかないので、`document.createElement` で **ページに入れない**サンプルの DOM を作り、2 節と 3 節の関数を TypeScript で書き直したもの（この章のコード）で文字列だけを組み立てます。例外は投げず、コンソールにも出しません。期待側の `TNode` は `type`・`value`・`attrs` だけを持つ自作の形です。コンポーネント名は架空の `ArticleCard` にしています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/hydration-errors)

## 4. ノードが無い・兄弟が足りない・道順が切れた

📄 `angular/packages/core/src/hydration/error_handling.ts` L123–166 （▶ の行: 127–128, 136, 148, 154, 162）

```ts
123 │ /**
124 │  * Validates that a given node has sibling nodes
125 │  */
126 │ export function validateSiblingNodeExists(node: RNode | null): void {
127 ▶   validateNodeExists(node);
128 ▶   if (!node!.nextSibling) {
129 │     const header = 'During hydration Angular expected more sibling nodes to be present.\n\n';
130 │     const actual = `Actual DOM is:\n\n${describeDomFromNode(node!)}\n\n`;
131 │     const footer = getHydrationErrorFooter();
132 │ 
133 │     const message = header + actual + footer;
134 │ 
135 │     markRNodeAsHavingHydrationMismatch(node!, '', actual);
136 ▶     throw new RuntimeError(RuntimeErrorCode.HYDRATION_MISSING_SIBLINGS, message);
137 │   }
138 │ }
139 │ 
140 │ /**
141 │  * Validates that a node exists or throws
142 │  */
143 │ export function validateNodeExists(
144 │   node: RNode | null,
145 │   lView: LView | null = null,
146 │   tNode: TNode | null = null,
147 │ ): void {
148 ▶   if (!node) {
149 │     const header =
150 │       'During hydration, Angular expected an element to be present at this location.\n\n';
151 │     let expected = '';
152 │     let footer = '';
153 │     if (lView !== null && tNode !== null) {
154 ▶       expected = describeExpectedDom(lView, tNode, false);
155 │       footer = getHydrationErrorFooter();
156 │ 
157 │       // Since the node is missing, we use the closest node to attach the error to
158 │       markRNodeAsHavingHydrationMismatch(unwrapRNode(lView[HOST]!), expected, '');
159 │     }
160 │ 
161 │     throw new RuntimeError(
162 ▶       RuntimeErrorCode.HYDRATION_MISSING_NODE,
163 │       `${header}${expected}\n\n${footer}`,
164 │     );
165 │   }
166 │ }
```

126 行目の `validateSiblingNodeExists` は、`siblingAfter` や在庫のビューを消すループ（[第 11 回](11-hydration-containers.md)）が 1 歩進むたびに呼ばれます。127 行目でまず今のノードがあることを確かめ（無ければ 162 行目の NG0502）、128 行目で次の兄弟が無ければ 136 行目で NG0501 です。154 行目、`validateNodeExists` は `lView` と `tNode` を渡されたときだけ期待側の図を付けます。

📄 `angular/packages/core/src/hydration/error_handling.ts` L168–196 （▶ の行: 175, 179, 189–191, 195）

```ts
168 │ /**
169 │  * Builds the hydration error message when a node is not found
170 │  *
171 │  * @param lView the LView where the node exists
172 │  * @param tNode the TNode
173 │  */
174 │ export function nodeNotFoundError(lView: LView, tNode: TNode): Error {
175 ▶   const header = 'During serialization, Angular was unable to find an element in the DOM:\n\n';
176 │   const expected = `${describeExpectedDom(lView, tNode, false)}\n\n`;
177 │   const footer = getHydrationErrorFooter();
178 │ 
179 ▶   throw new RuntimeError(RuntimeErrorCode.HYDRATION_MISSING_NODE, header + expected + footer);
180 │ }
181 │ 
182 │ /**
183 │  * Builds a hydration error message when a node is not found at a path location
184 │  *
185 │  * @param host the Host Node
186 │  * @param path the path to the node
187 │  */
188 │ export function nodeNotFoundAtPathError(host: Node, path: string): Error {
189 ▶   const header =
190 ▶     `During hydration Angular was unable to locate a node ` +
191 ▶     `using the "${path}" path, starting from the ${describeRNode(host)} node.\n\n`;
192 │   const footer = getHydrationErrorFooter();
193 │ 
194 │   markRNodeAsHavingHydrationMismatch(host);
195 ▶   throw new RuntimeError(RuntimeErrorCode.HYDRATION_MISSING_NODE, header + footer);
196 │ }
```

同じ NG0502 でも 2 つは場所が違います。175 行目の `nodeNotFoundError` は見出しが **During serialization**、つまり**サーバー**で、道順を記録しようとした相手のノードが DOM のどこにも無かったときです（[第 9 回](09-hydration.md)の `calcPathForNode`）。189〜191 行目の `nodeNotFoundAtPathError` は**ブラウザ**で、記録された道順（`"0f2nf"` など）を辿ったら途中でノードが尽きたときです。これは開発モードだけの呼び出しで、本番では同じ場面が NG0509 になります（1 節の表）。

### サーバーで出る NG0503 と、ブラウザで出る NG0504

📄 `angular/packages/core/src/hydration/error_handling.ts` L198–216 （▶ の行: 208, 210, 212, 215）

```ts
198 │ /**
199 │  * Builds the hydration error message in the case that dom nodes are created outside of
200 │  * the Angular context and are being used as projected nodes
201 │  *
202 │  * @param lView the LView
203 │  * @param tNode the TNode
204 │  * @returns an error
205 │  */
206 │ export function unsupportedProjectionOfDomNodes(rNode: RNode): Error {
207 │   const header =
208 ▶     'During serialization, Angular detected DOM nodes ' +
209 │     'that were created outside of Angular context and provided as projectable nodes ' +
210 ▶     '(likely via `ViewContainerRef.createComponent` or `createComponent` APIs). ' +
211 │     'Hydration is not supported for such cases, consider refactoring the code to avoid ' +
212 ▶     'this pattern or using `ngSkipHydration` on the host element of the component.\n\n';
213 │   const actual = `${describeDomFromNode(rNode)}\n\n`;
214 │   const message = header + actual + getHydrationAttributeNote();
215 ▶   return new RuntimeError(RuntimeErrorCode.UNSUPPORTED_PROJECTION_DOM_NODES, message);
216 │ }
```

208〜212 行目のとおり、`ViewContainerRef.createComponent` の `projectableNodes` に DOM ノードを直接渡すと、そのノードはどこから来たか分からない（作りかけ・切り離し済みかもしれない）ので、サーバーは道順を書けません。シリアライズ（`serializeLView`。[第 8 回](08-hydration-annotate.md)）がこれを投げます。

📄 `angular/packages/core/src/hydration/error_handling.ts` L218–234 （▶ の行: 227–229, 231, 233）

```ts
218 │ /**
219 │  * Builds the hydration error message in the case that ngSkipHydration was used on a
220 │  * node that is not a component host element or host binding
221 │  *
222 │  * @param rNode the HTML Element
223 │  * @returns an error
224 │  */
225 │ export function invalidSkipHydrationHost(rNode: RNode): Error {
226 │   const header =
227 ▶     'The `ngSkipHydration` flag is applied on a node ' +
228 ▶     "that doesn't act as a component host. Hydration can be " +
229 ▶     'skipped only on per-component basis.\n\n';
230 │   const actual = `${describeDomFromNode(rNode)}\n\n`;
231 ▶   const footer = 'Please move the `ngSkipHydration` attribute to the component host element.\n\n';
232 │   const message = header + actual + footer;
233 ▶   return new RuntimeError(RuntimeErrorCode.INVALID_SKIP_HYDRATION_HOST, message);
234 │ }
```

こちらはブラウザで、[第 10 回](10-hydration-claim.md)の 7 節で見た「ホストでない要素に `ngSkipHydration`」のときに投げられます。231 行目が直し方そのものです。

## 5. 拡張機能を疑う：isLikelyExternalSourceNode

📄 `angular/packages/core/src/hydration/error_handling.ts` L437–455 （▶ の行: 445, 449–450, 454）

```ts
437 │ /**
438 │  * Checks if a given RNode is likely to have been added by a third-party script
439 │  * or browser extension, by checking whether Angular has any knowledge of it
440 │  * via patched data. Nodes created and managed by Angular will always have
441 │  * patched data attached to them.
442 │  */
443 │ function isLikelyExternalSourceNode(rNode: RNode): boolean {
444 │   const node = rNode as Node;
445 ▶   if (node.nodeType !== Node.ELEMENT_NODE) {
446 │     return false;
447 │   }
448 │   // If Angular has patched this node, it was created within Angular's context.
449 ▶   if (readPatchedData(node as HTMLElement)) {
450 ▶     return false;
451 │   }
452 │   // No patched data means Angular has no record of this node —
453 │   // it was likely injected by a third-party script or browser extension.
454 ▶   return true;
455 │ }
```

Angular が作ったノードにも、ハイドレーションで見つけたノードにも、`attachPatchData` が `__ngContext__` を付けます （[第 10 回](10-hydration-claim.md)）。449 行目でそれが読めなければ、454 行目で「外から来た要素」と判断します。445 行目のとおり要素だけが対象で、テキストやコメントは判定しません。この関数と 2 節の 111 行目の注記は v22.0.0（`refactor: Improve hydration mismatch errors for third-party scripts`）で入りました。

> [!WARNING]
> **ハマりどころ**
>
> **直接 DOM を触るコードがなぜ壊すか。** ハイドレーションは [第 10 回](10-hydration-claim.md)の `locateNextRNode` のとおり、「前のノードの次」で位置を決めます。ハイドレーションが終わる前（コンストラクタや `ngOnInit` の中など）に `element.appendChild` や `innerHTML` でノードを足す・消すと、サーバーの HTML（と `__nghData__` の記録）とブラウザのテンプレートの対応が 1 つずれ、その後のすべてのノードがずれます。サーバーでだけ DOM を変えた場合も同じです。ブラウザ拡張が描画前に要素を差し込んだ場合もこれと同じずれ方をし、5 節の注記が付きます。

## 6. 本番ビルドでは何が残るか

2〜4 節の関数は、呼び出し側に全部 `ngDevMode &&` が付いているので、本番バンドルから消えます。代わりに残るのは、素の `TypeError` で落ちないための最小限の確認です。[第 10 回](10-hydration-claim.md)の `locateOrCreateElementNodeImpl` の続きです。

📄 `angular/packages/core/src/render3/instructions/element.ts` L364–387 （▶ の行: 368–369, 371, 373, 381–382, 384–385）

```ts
364 │   if (hydrationInfo) {
365 │     // `validateMatchingNode` above would normally catch a missing node too, but it's dev-mode
366 │     // only. Guard against it here so production throws a coded RuntimeError instead of a raw
367 │     // TypeError when dereferencing `native` below.
368 ▶     if (native == null) {
369 ▶       throw new RuntimeError(
370 │         RuntimeErrorCode.HYDRATION_MISSING_NODE,
371 ▶         ngDevMode
372 │           ? `During hydration Angular expected a "<${name}>" element at this location (tNode #${tNode.index}), but no matching DOM node was found. This usually means the client-rendered DOM no longer matches the server-rendered HTML.`
373 ▶           : `<${name}>`,
374 │       );
375 │     }
376 │ 
377 │     // `hasSkipHydrationAttrOnRElement` below calls `.hasAttribute`, which needs `native` to be
378 │     // an Element. `validateMatchingNode` above would normally catch a wrong node type, but it's
379 │     // dev-mode only. Guard against it here too, cheaply, so production throws a coded
380 │     // RuntimeError instead of a raw TypeError.
381 ▶     if ((native as unknown as Node).nodeType !== Node.ELEMENT_NODE) {
382 ▶       throw new RuntimeError(
383 │         RuntimeErrorCode.HYDRATION_NODE_MISMATCH,
384 ▶         ngDevMode &&
385 ▶           `During hydration Angular expected an element at this location, but found a ${describeDomNode(native as unknown as Node)} node instead.`,
386 │       );
387 │     }
```

368〜375 行目、ノードが無ければ NG0502。メッセージは 371〜373 行目で、本番では `<p>` のようにタグ名だけです。381〜387 行目、要素のはずが要素でなければ NG0500。384 行目の `ngDevMode &&` により本番ではメッセージが `false` で、表示は `NG0500` だけになります（`RuntimeError` は `message` が偽なら番号だけを出す）。**タグ名違い（`<p>` のはずが `<div>`）は本番では検出されず**、そのまま `<div>` を確保して進みます。不一致は開発モードの `ng serve` で見つける前提です。

## 7. ngSkipHydration と PRESERVE\_HOST\_CONTENT

📄 `angular/packages/core/src/hydration/skip_hydration.ts` L18–45 （▶ の行: 19, 25, 32–33, 44）

```ts
18 │ /** Lowercase name of the `ngSkipHydration` attribute used for case-insensitive comparisons. */
19 ▶ const SKIP_HYDRATION_ATTR_NAME_LOWER_CASE = 'ngskiphydration';
20 │ 
21 │ /**
22 │  * Helper function to check if a given TNode has the 'ngSkipHydration' attribute.
23 │  */
24 │ export function hasSkipHydrationAttrOnTNode(tNode: TNode): boolean {
25 ▶   const attrs = tNode.mergedAttrs;
26 │   if (attrs === null) return false;
27 │   // only ever look at the attribute name and skip the values
28 │   for (let i = 0; i < attrs.length; i += 2) {
29 │     const value = attrs[i];
30 │     // This is a marker, which means that the static attributes section is over,
31 │     // so we can exit early.
32 ▶     if (typeof value === 'number') return false;
33 ▶     if (typeof value === 'string' && value.toLowerCase() === SKIP_HYDRATION_ATTR_NAME_LOWER_CASE) {
34 │       return true;
35 │     }
36 │   }
37 │   return false;
38 │ }
39 │ 
40 │ /**
41 │  * Helper function to check if a given RElement has the 'ngSkipHydration' attribute.
42 │  */
43 │ export function hasSkipHydrationAttrOnRElement(rNode: RElement): boolean {
44 ▶   return rNode.hasAttribute(SKIP_HYDRATION_ATTR_NAME);
45 │ }
```

25 行目、`TNode` 側は `mergedAttrs` を見ます。これはテンプレートに書いた静的な属性と、ディレクティブの `host` に書いた静的な属性を合わせたものなので、コンポーネント自身が `host: {ngSkipHydration: 'true'}` と書いても効きます。32 行目、値の入らない区画（数値の印）に来たら終わり。33 行目、比べるのは名前だけで、大文字小文字は区別しません（19 行目の小文字の定数）。44 行目の DOM 側は `hasAttribute` です。属性を見つけたあとの動き（区間に入る・中身を消す・ホスト以外は NG0504）は[第 10 回](10-hydration-claim.md)の 7 節です。

📄 `angular/packages/core/src/hydration/tokens.ts` L19–32 （▶ の行: 21, 27, 30）

```ts
19 │ // By default (in client rendering mode), we remove all the contents
20 │ // of the host element and render an application after that.
21 ▶ export const PRESERVE_HOST_CONTENT_DEFAULT = false;
22 │ 
23 │ /**
24 │  * Internal token that indicates whether host element content should be
25 │  * retained during the bootstrap.
26 │  */
27 ▶ export const PRESERVE_HOST_CONTENT = new InjectionToken<boolean>(
28 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'PRESERVE_HOST_CONTENT' : '',
29 │   {
30 ▶     factory: () => PRESERVE_HOST_CONTENT_DEFAULT,
31 │   },
32 │ );
```

21 行目、既定は `false`。ハイドレーションしないアプリは、起動時にルート要素（`<app-root>`）の中身を空にしてから描きます （`locateHostElement` がこのトークンを読んで `renderer.selectRootElement(…, preserveContent)` に渡す。[boot-application-ref](../boot/10-boot-application-ref.md)）。`withDomHydration` はブラウザでこのトークンを `IS_HYDRATION_DOM_REUSE_ENABLED` と同じ値にします（[第 7 回](07-hydration-provide.md)）。つまり、`__nghData__` があるときだけルートの中身を残し、無いときは捨てて描き直します。ルート要素に `ngSkipHydration` を付けた場合は、`applyRootElementTransformImpl` がその中身を消して描き直させます（第 7 回の範囲）。

## ここまでの呼び出し

- `locateOrCreateElementNodeImpl` — render3/instructions/element.ts L331 — *第 10 回*
  - `locateNextRNode → native` — hydration/node\_lookup\_utils.ts L119
  - `ngDevMode && validateMatchingNode(native, …)` — hydration/error\_handling.ts L59
    - `describeExpectedDom(lView, tNode)` — hydration/error\_handling.ts L344 — *TNode から*
    - `describeDomFromNode(node)` — hydration/error\_handling.ts L375 — *DOM から*
    - `getHydrationErrorFooter(name)` — hydration/error\_handling.ts L425
    - `isLikelyExternalSourceNode(node)` — hydration/error\_handling.ts L443 — *\_\_ngContext\_\_ が無い要素*
    - `throw new RuntimeError(-500, message)` — hydration/error\_handling.ts L119 — *NG0500 … Find more at …*
  - `本番：native == null → NG0502 / 要素でない → NG0500` — render3/instructions/element.ts L368

## 聞かれそうな質問

**Q. ngSkipHydration はどこに付けられますか？**

コンポーネントのホスト要素だけです。テンプレートで `<app-card ngSkipHydration />` と書くか、コンポーネントの `host` に書きます（25 行目が両方を読む）。ふつうの要素に付けると開発モードで NG0504 です（227〜229 行目）。付けたコンポーネントの中身は、サーバーの DOM を消してブラウザで作り直されます。ルートの要素に付けた場合は、アプリ全体がハイドレーションされなくなります。

**Q. ブラウザ拡張が DOM を変えたら？**

拡張が描画の前に、Angular の管理する範囲の中へ要素を差し込むと、その位置から後ろのノードがずれて NG0500 になります。差し込まれた要素には `__ngContext__` が無いので、449〜454 行目の判定で「サードパーティのスクリプトか拡張機能かもしれない」という注記が付きます。位置が決まっているなら、そこを囲むコンポーネントに `ngSkipHydration` を付けるのが 116 行目の案です。

**Q. 本番ビルドではメッセージはどうなりますか？**

`validateMatchingNode` などは呼ばれず、要素の有無と種類だけが 368〜387 行目で確かめられます。メッセージは `NG0500` のような番号だけか、NG0502 ならタグ名だけです（373 行目）。`Find more at` のリンクも開発モードだけです。タグ名違いや属性違いは本番では見つからないので、開発モードで確かめます。

**Q. 属性やクラスが違うだけでもエラーになりますか？**

なりません。比べるのは 68〜71 行目のノードの有無・種類・タグ名だけで、メッセージにも「属性は判定に関係ない」と書かれます（107 行目の `getHydrationAttributeNote`）。属性の値は、ブラウザの最初の更新パスでバインディングが書き直します（[第 10 回](10-hydration-claim.md)）。

**Q. NG0505 が出るのはどんなとき？**

ブラウザ側だけ `provideClientHydration()` して、サーバーの設定に入っていないときです。サーバーが `ngh` と `__nghData__` を書かないので、ブラウザは `IS_HYDRATION_DOM_REUSE_ENABLED` を偽にし、`PRESERVE_HOST_CONTENT` も偽（21 行目の既定と同じ動き）になってルートの中身を捨てて描き直します。ハイドレーションはしませんが、アプリは動きます（[第 7 回](07-hydration-provide.md)）。

## 読み終えて

- `validateMatchingNode` が比べるのはノードの有無・`nodeType`・タグ名の 3 つだけ。属性と文字は比べない。
- メッセージは「見出し + 期待した DOM（TNode から）+ 実際の DOM（DOM から）+ 属性の注記 + 直し方 + 外部スクリプトの注記」の順に組み立てる。
- NG0502 と NG0503 にはサーバー（シリアライズ中）で出るものがある。NG0505・0506・0508 は警告。
- 本番では一致の確認は消え、ノードが無い・要素でないときだけ番号付きのエラーになる。不一致は開発モードで見つける。
- `ngSkipHydration` はコンポーネントのホスト専用。`PRESERVE_HOST_CONTENT` はハイドレーションするときだけルートの中身を残す。

---

← 前: [@if・@for のビューと片付け：脱水されたビューを探して使い回す](11-hydration-containers.md)  
次: [i18n のハイドレーション：翻訳で順番が変わるノードを辿る](13-hydration-i18n.md) →
