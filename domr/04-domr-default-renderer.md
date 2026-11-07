[目次](../README.md) › [DOM レンダラーとイベントの内側](README.md) › 第 4 回 / 全 20 回

# DefaultDomRenderer2：要素とテキストを作って差し込む

> createElement の名前空間（'svg'・'math' の短い名前と NAMESPACE\_URIS、URI をそのまま渡す道）がコンパイラの emitNamespaceChanges と core の ɵɵnamespaceSVG から来る道、createText・createComment、appendChild と insertBefore が &lt;template&gt; の content に入れる行、参照のノードが無いときの NG05106（1cb3d606bf5）、親を使わない removeChild、parentNode・nextSibling、destroyNode が null のとき core が省く走査。ページの上で svg・math・&lt;template&gt; を描くデモと、本物の defaultRenderer で NG05106 を起こすデモ。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/domr-default-renderer)

---

`DefaultDomRenderer2` は、カプセル化を何もしない素の renderer です。Emulated・None・ShadowDom の renderer もこのクラスを継いでいるので、要素とテキストを作って差し込む仕事は、どのコンポーネントでも最後はここに来ます。この章では `createElement` の名前空間（svg と math）が core とコンパイラのどこから来るか、`createText`・`createComment`、`appendChild`・`insertBefore` が `<template>` の `content` に入れる行、参照のノードが無いときのエラー（2026-08 の 1cb3d606bf5）、`removeChild`・`parentNode`・`nextSibling` を、core の `dom_node_manipulation.ts` から呼ばれる順に読みます。

読む対象は `packages/platform-browser/src/dom/dom_renderer.ts` の 40〜47 行目と 303〜400 行目、core の `render3/state.ts`・`dom_node_manipulation.ts`、コンパイラの `template/pipeline/` です（../angular、22.2.0-next.7、8576f161ae4）。

1. [1. 全体像](01-domr-overview.md)
2. [2. Renderer2 の約束](02-domr-renderer-api.md)
3. [3. DomRendererFactory2](03-domr-renderer-factory.md)
4. **4. 要素とテキスト**（この章）
5. [5. 属性とプロパティ](05-domr-attributes-properties.md)
6. [6. カプセル化](06-domr-encapsulation.md)
7. [7. SharedStylesHost](07-domr-shared-styles.md)
8. [8. CSS 変数の名前空間](08-domr-css-var-namespacing.md)
9. [9. クラスとスタイル](09-domr-styling-overview.md)
10. [10. 優先順位のリスト](10-domr-style-binding-list.md)
11. [11. 値を決めて書く](11-domr-styling-apply.md)
12. [12. \[class\] と \[style\]](12-domr-styling-maps.md)
13. [13. EventManager](13-domr-event-manager.md)
14. [14. listen](14-domr-listen.md)
15. [15. キーのイベント](15-domr-key-events.md)
16. [16. 自分のプラグイン](16-domr-custom-plugin.md)
17. [17. サニタイズ](17-domr-sanitization.md)
18. [18. 信頼の印](18-domr-trusted-types.md)
19. [19. Title と Meta](19-domr-title-meta.md)
20. [20. issue と PR を読む](20-domr-issues.md)

## 1. クラスの頭：destroy は空、destroyNode は null

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L303–339 （▶ の行: 303–304, 310, 312–314, 320, 322）

```ts
303 ▶ class DefaultDomRenderer2 implements Renderer2 {
304 ▶   data: {[key: string]: any} = Object.create(null);
305 │ 
306 │   /**
307 │    * By default this renderer throws when encountering synthetic properties
308 │    * This can be disabled for example by the AsyncAnimationRendererFactory
309 │    */
310 ▶   throwOnSyntheticProps = true;
311 │ 
312 ▶   constructor(
313 ▶     private readonly eventManager: EventManager,
314 ▶     private readonly doc: Document,
315 │     protected readonly ngZone: NgZone,
316 │     private readonly tracingService: TracingService<TracingSnapshot> | null,
317 │     private readonly cssVarNamespace: string = '',
318 │   ) {}
319 │ 
320 ▶   destroy(): void {}
321 │ 
322 ▶   destroyNode = null;
323 │ 
324 │   createElement(name: string, namespace?: string): any {
325 │     if (namespace) {
326 │       // TODO: `|| namespace` was added in
327 │       // https://github.com/angular/angular/commit/2b9cc8503d48173492c29f5a271b61126104fbdb to
328 │       // support how Ivy passed around the namespace URI rather than short name at the time. It did
329 │       // not, however extend the support to other parts of the system (setAttribute, setAttribute,
330 │       // and the ServerRenderer). We should decide what exactly the semantics for dealing with
331 │       // namespaces should be and make it consistent.
332 │       // Related issues:
333 │       // https://github.com/angular/angular/issues/44028
334 │       // https://github.com/angular/angular/issues/44883
335 │       return this.doc.createElementNS(NAMESPACE_URIS[namespace] || namespace, name);
336 │     }
337 │ 
338 │     return this.doc.createElement(name);
339 │   }
```

この引用は 2 節の `createElement` まで続けて載せています。まず頭の部分です。

1. **312〜318 行目：受け取るのは 5 つ**

   `EventManager`（`listen` 用）・`Document`・`NgZone`・`TracingService`・CSS 変数の名前空間。工場の `defaultRenderer` を作る行と同じ並びです（[第 3 回](03-domr-renderer-factory.md)）。要素を作るのは 314 行目の `doc` で、グローバルの `document` ではありません。
2. **320 行目：`destroy()` は空**

   素の renderer には片付けるものがありません。`<style>` を持つ Emulated・None の renderer はこれを上書きします（[第 6 回](06-domr-encapsulation.md)）。
3. **322 行目：`destroyNode = null`**

   [第 2 回](02-domr-renderer-api.md)の約束の「`null` なら呼ばない」を、ブラウザ用の renderer は選んでいます。その効き目が core の次の行です。

📄 `angular/packages/core/src/render3/node_manipulation.ts` L320–324 （▶ の行: 322–323）

```ts
320 │   const renderer = lView[RENDERER];
321 │ 
322 ▶   if (renderer.destroyNode) {
323 ▶     applyView(tView, lView, renderer, WalkTNodeTreeAction.Destroy, null, null);
324 │   }
```

ビューの破棄 `destroyLView` の中です。322 行目、`renderer.destroyNode` が無ければ、323 行目の「ビューの全ノードを歩いて `destroyNode` を呼ぶ」走査をまるごと飛ばします。310 行目の `throwOnSyntheticProps` は `@` で始まるプロパティの扱いで、[第 5 回](05-domr-attributes-properties.md)で読みます。

## 2. createElement：名前空間は短い名前で来る

引用は 1 節と同じものの後半、324〜339 行目です。

1. **325・335 行目：`namespace` があれば `createElementNS`**

   `NAMESPACE_URIS[namespace]` で短い名前を URI に直します。表に無ければ `|| namespace` で、渡された文字列をそのまま URI として使います。
2. **338 行目：無ければ `createElement(name)`**

   HTML の要素です。
3. **326〜334 行目：TODO のコメント**

   `|| namespace` は、2019 年の 2b9cc8503d4 で Ivy が URI そのものを渡していたころのために足したもので、`setAttribute` やサーバーの renderer には同じ扱いが広げられていない、名前空間の扱いを決めて揃えるべきだ、と書かれています。関係する issue として #44028 と #44883 が挙がっています。#44883（v13.2.0 で `Renderer2.createElement` が名前空間を無視するようになった、という報告。2022-01-31 に閉じた）は、この `|| namespace` が効く場面そのものです。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L40–47 （▶ の行: 41–42, 46）

```ts
40 │ export const NAMESPACE_URIS: {[ns: string]: string} = {
41 ▶   'svg': 'http://www.w3.org/2000/svg',
42 ▶   'xhtml': 'http://www.w3.org/1999/xhtml',
43 │   'xlink': 'http://www.w3.org/1999/xlink',
44 │   'xml': 'http://www.w3.org/XML/1998/namespace',
45 │   'xmlns': 'http://www.w3.org/2000/xmlns/',
46 ▶   'math': 'http://www.w3.org/1998/Math/MathML',
47 │ };
```

表は 6 つ。要素に使うのは 41 行目の `svg` と 46 行目の `math` で、残りは主に属性（`xlink:href` など）の名前空間です（[第 5 回](05-domr-attributes-properties.md)）。42 行目の `xhtml` は HTML の名前空間です。では core はどこで `'svg'` を渡しているのでしょうか。

### core の側：LFrame の currentNamespace

📄 `angular/packages/core/src/render3/instructions/element.ts` L319–325 （▶ の行: 324）

```ts
319 │   tNode: TNode,
320 │   name: string,
321 │   index: number,
322 │ ) => {
323 │   lastNodeWasCreated(true);
324 ▶   return createElementNode(lView[RENDERER], name, getNamespace());
325 │ };
```

要素の命令が要素を作る所です。324 行目、名前空間は `getNamespace()` の戻り値です（ハイドレーションのときの分かれは [作成の命令](../ivy/09-ivy-create-instructions.md)）。

📄 `angular/packages/core/src/render3/state.ts` L792–825 （▶ の行: 792–793, 801–802, 811, 820, 823–824）

```ts
792 ▶ export function ɵɵnamespaceSVG() {
793 ▶   instructionState.lFrame.currentNamespace = SVG_NAMESPACE;
794 │ }
795 │ 
796 │ /**
797 │  * Sets the namespace used to create elements to `'http://www.w3.org/1998/MathML/'` in global state.
798 │  *
799 │  * @codeGenApi
800 │  */
801 ▶ export function ɵɵnamespaceMathML() {
802 ▶   instructionState.lFrame.currentNamespace = MATH_ML_NAMESPACE;
803 │ }
804 │ 
805 │ /**
806 │  * Sets the namespace used to create elements to `null`, which forces element creation to use
807 │  * `createElement` rather than `createElementNS`.
808 │  *
809 │  * @codeGenApi
810 │  */
811 ▶ export function ɵɵnamespaceHTML() {
812 │   namespaceHTMLInternal();
813 │ }
814 │ 
815 │ /**
816 │  * Sets the namespace used to create elements to `null`, which forces element creation to use
817 │  * `createElement` rather than `createElementNS`.
818 │  */
819 │ export function namespaceHTMLInternal() {
820 ▶   instructionState.lFrame.currentNamespace = null;
821 │ }
822 │ 
823 ▶ export function getNamespace(): string | null {
824 ▶   return instructionState.lFrame.currentNamespace;
825 │ }
```

793 行目、`ɵɵnamespaceSVG()` は今の LFrame（命令の実行中の状態。[LFrame の章](../ivy/15-ivy-lframe.md)）の `currentNamespace` に `SVG_NAMESPACE` を入れるだけです。この値は `'svg'` という短い名前（core の `sanitization/dom_security_schema.ts` の定数）で、URI ではありません。802 行目の MathML も `'math'`、820 行目の HTML は `null`。823〜825 行目の `getNamespace()` がそれを読みます。「次の要素から名前空間を変える」という**状態**なので、元に戻す `ɵɵnamespaceHTML()` が出るまで続きます。

### コンパイラの側：名前空間が変わる所にだけ命令を置く

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L338–342 （▶ の行: 338, 340, 342）

```ts
338 ▶   const [namespaceKey, elementName] = splitNsName(element.name);
339 │   const startOp = ir.createElementStartOp(
340 ▶     elementName,
341 │     id,
342 ▶     namespaceForKey(namespaceKey),
```

📄 `angular/packages/compiler/src/template/pipeline/src/conversion.ts` L46–55 （▶ の行: 47–49, 51–52, 54）

```ts
46 │ export function namespaceForKey(namespacePrefixKey: string | null): ir.Namespace {
47 ▶   const NAMESPACES = new Map([
48 ▶     ['svg', ir.Namespace.SVG],
49 ▶     ['math', ir.Namespace.Math],
50 │   ]);
51 ▶   if (namespacePrefixKey === null) {
52 ▶     return ir.Namespace.HTML;
53 │   }
54 ▶   return NAMESPACES.get(namespacePrefixKey) ?? ir.Namespace.HTML;
55 │ }
```

テンプレートの解析器は、`<svg>` の中の `<rect>` を `:svg:rect` という名前にします（親から名前空間を受け継ぐ規則と、`foreignObject` の子は受け継がない規則は[HTML の解析器](../compiler/04-compiler-html-parser.md)の章）。338 行目でそれを `'svg'` と `'rect'` に分け、342 行目の `namespaceForKey` が 48〜49 行目の表で `SVG`・`Math` に直します。それ以外は 51〜54 行目で `HTML`。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/namespace.ts` L15–29 （▶ の行: 17, 19–20, 23–25）

```ts
15 │ export function emitNamespaceChanges(job: CompilationJob): void {
16 │   for (const unit of job.units) {
17 ▶     let activeNamespace = ir.Namespace.HTML;
18 │ 
19 ▶     for (const op of unit.create) {
20 ▶       if (op.kind !== ir.OpKind.ElementStart) {
21 │         continue;
22 │       }
23 ▶       if (op.namespace !== activeNamespace) {
24 ▶         ir.OpList.insertBefore<ir.CreateOp>(ir.createNamespaceOp(op.namespace), op);
25 ▶         activeNamespace = op.namespace;
26 │       }
27 │     }
28 │   }
29 │ }
```

17 行目、ビューの最初は HTML。19〜20 行目で作成の命令を順に見て、23 行目で「次の要素の名前空間が今と違う」ときだけ、24 行目でその前に名前空間の命令を差し込みます。だから `<svg><rect/></svg><p>` なら、`ɵɵnamespaceSVG()` が `svg` の前に 1 回、`ɵɵnamespaceHTML()` が `p` の前に 1 回だけ出ます（命令の置き換えは `reify` の段で行われます。[reify の章](../compiler/16-compiler-reify-emit.md)）。

### 動的に作るホスト要素

📄 `angular/packages/core/src/render3/component_ref.ts` L186–192 （▶ の行: 186–192）

```ts
186 ▶   const namespace =
187 ▶     tagName === 'svg'
188 ▶       ? SVG_NAMESPACE
189 ▶       : tagName === 'math'
190 ▶         ? MATH_ML_NAMESPACE
191 ▶         : hostElementNamespace;
192 ▶   return createElementNode(renderer, tagName, namespace);
```

`createComponent` がホスト要素を作るとき（[第 3 回](03-domr-renderer-factory.md)の `createRenderer(null, …)` の renderer で）は、命令の状態ではなくセレクタのタグ名で決めます。187〜190 行目、タグ名が `svg` なら SVG、`math` なら MathML、それ以外は呼び出し側が渡した `hostElementNamespace` です。

## 3. createComment・createText・appendChild

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L341–352 （▶ の行: 342, 346, 350–351）

```ts
341 │   createComment(value: string): any {
342 ▶     return this.doc.createComment(value);
343 │   }
344 │ 
345 │   createText(value: string): any {
346 ▶     return this.doc.createTextNode(value);
347 │   }
348 │ 
349 │   appendChild(parent: any, newChild: any): void {
350 ▶     const targetParent = isTemplateNode(parent) ? parent.content : parent;
351 ▶     targetParent.appendChild(newChild);
352 │   }
```

342・346 行目は `document` の同じ名前の関数を呼ぶだけです。コメントの中身は、core の側で `escapeCommentText` を通してから渡されます（[テンプレートと DOM](../template/05-dom.md)）。350 行目、親が `<template>` の要素なら、子は `parent.content`（`<template>` が持つ、画面に出ない文書の断片）に入れます。判定する `isTemplateNode` は「`tagName` が `TEMPLATE` で、`content` を持つ」かを見る小さな関数です（同じファイルの後ろの方）。

> [!NOTE]
> **さらに深く**
>
> issue #43078（開いている、`core: DOM rendering`）は「Angular は `<template>` の中のカスタム要素を、複製される前に動かしてしまう」という報告です。2 節の 338 行目のとおり、中の要素もまず 314 行目の `doc`（ページの document）で作られ、350〜351 行目で `content` に移されるのはそのあとです。ページの document でカスタム要素を作ると、ブラウザはその時点で定義どおりの要素にします。デモ 1 で `<b>` の親が `#fragment` になり、`content` の `ownerDocument` がページとは別の document だと分かります。

## 4. insertBefore と removeChild

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L354–376 （▶ の行: 355–356, 360–363, 369, 373, 375）

```ts
354 │   insertBefore(parent: any, newChild: any, refChild: any): void {
355 ▶     if (parent) {
356 ▶       const targetParent = isTemplateNode(parent) ? parent.content : parent;
357 │       // If something outside Angular removed or moved `refChild` (a browser extension, for
358 │       // example), the native call below throws a `NotFoundError` with no useful info. Catch it
359 │       // here so we can say what actually happened.
360 ▶       if (refChild != null && refChild.parentNode !== targetParent) {
361 ▶         throw new RuntimeError(
362 ▶           RuntimeErrorCode.INSERT_BEFORE_NODE_NOT_FOUND,
363 ▶           ngDevMode &&
364 │             `Angular could not insert a node before ${describeDomNode(refChild)} because it is no longer a child of ${describeDomNode(targetParent)}. ` +
365 │               `This can happen when code outside of Angular's control (for example, a browser extension or a script that directly manipulates the DOM) ` +
366 │               `has moved or removed a node that Angular is still managing.`,
367 │         );
368 │       }
369 ▶       targetParent.insertBefore(newChild, refChild);
370 │     }
371 │   }
372 │ 
373 ▶   removeChild(_parent: any, oldChild: any): void {
374 │     // child was removed
375 ▶     oldChild.remove();
376 │   }
```

1. **355 行目：親が無ければ何もしない**

   `appendChild`（351 行目）には無い確かめです。
2. **356 行目：`<template>` なら `content` へ**

   `appendChild` と同じです。
3. **360〜368 行目：参照のノードがもう親の子でなければ、`NG05106`**

   `refChild` があるのに、その `parentNode` が差し込み先と違うなら、369 行目のブラウザの `insertBefore` を呼ぶ前に `RuntimeError` を投げます。357〜359 行目のコメントのとおり、ブラウザ拡張など Angular の外のコードが `refChild` を外したり動かしたりすると、ブラウザの `insertBefore` は何も手がかりの無い `NotFoundError` を投げるからです。363 行目、詳しい文は開発モードだけで、本番では `NG05106` の番号だけになります。
4. **373〜376 行目：`removeChild` は親を使わない**

   引数の `_parent` を読まず、375 行目の `oldChild.remove()` で自分を外します。

📄 `angular/packages/platform-browser/src/errors.ts` L17–24 （▶ の行: 24）

```ts
17 │   // misc errors (5100-5200 range)
18 │   BROWSER_MODULE_ALREADY_LOADED = 5100,
19 │   NO_PLUGIN_FOR_EVENT = -5101,
20 │   UNSUPPORTED_EVENT_TARGET = -5102,
21 │   TESTABILITY_NOT_FOUND = 5103,
22 │   ROOT_NODE_NOT_FOUND = -5104,
23 │   UNEXPECTED_SYNTHETIC_PROPERTY = 5105,
24 ▶   INSERT_BEFORE_NODE_NOT_FOUND = -5106,
```

24 行目、番号はマイナスの `-5106` です。core の `formatRuntimeErrorCode` は絶対値で `NG05106` を作り、マイナスの番号は「説明のページがある」という印として、開発モードで `Find more at …/errors/NG05106` を足します（デモ 2 の出力の最後）。この修正は 2026-08-13 の 1cb3d606bf5（PR #70186、2026-08-14 にマージ）で、`dom_renderer.ts`・`errors.ts`・`adev` の `NG05106.md`・`goldens/public-api/platform-browser/errors.api.md`・spec 2 つなど 15 ファイルに 153 行を足しています。

### core から呼ばれる形

📄 `angular/packages/core/src/render3/dom_node_manipulation.ts` L43–55 （▶ の行: 47, 52, 54）

```ts
43 │ /**
44 │  * Inserts a native node before another native node for a given parent.
45 │  * This is a utility function that can be used when native nodes were determined.
46 │  */
47 ▶ export function nativeInsertBefore(
48 │   renderer: Renderer,
49 │   parent: RNode,
50 │   child: RNode,
51 │   beforeNode: RNode | null,
52 ▶   isMove: boolean,
53 │ ): void {
54 ▶   renderer.insertBefore(parent, child, beforeNode, isMove);
55 │ }
```

📄 `angular/packages/core/src/render3/dom_node_manipulation.ts` L87–93 （▶ の行: 87, 90–91, 93）

```ts
87 ▶ export function nativeRemoveNode(
88 │   renderer: Renderer,
89 │   rNode: RNode,
90 ▶   isHostElement?: boolean,
91 ▶   requireSynchronousElementRemoval?: boolean,
92 │ ): void {
93 ▶   renderer.removeChild(null, rNode, isHostElement, requireSynchronousElementRemoval);
```

54 行目、core は `insertBefore` に 52 行目の `isMove` まで渡します。ビューを差し込むときの core の呼び出しは `true` を渡すので、[第 1 回](01-domr-overview.md)のデモの `insertBefore(…, <!--container-->, true)` の 4 つ目が `true` でした。`DefaultDomRenderer2.insertBefore` は 3 つしか受け取らないので、ブラウザ用の renderer では使われません（アニメーションの renderer が使います）。93 行目、core は `removeChild` の親に `null` を渡します。だから 373〜376 行目の `removeChild` は親を使わない作りになっています。

## 5. parentNode と nextSibling

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L394–400 （▶ の行: 394–395, 398–399）

```ts
394 ▶   parentNode(node: any): any {
395 ▶     return node.parentNode;
396 │   }
397 │ 
398 ▶   nextSibling(node: any): any {
399 ▶     return node.nextSibling;
400 │   }
```

どちらも DOM のプロパティを返すだけです。core はビューを差し込む位置を決めるときに使います。第 1 回のデモで `@if` の中身を差し込む直前に `parentNode(<!--container-->)` が呼ばれたのはそのためです（[ViewContainer の章](https://angular-deep-dive-cyan.vercel.app/chapter/ivy-view-container)）。ShadowDom の renderer はこの 2 つのうち `parentNode` を上書きして、shadow root とホスト要素を読み替えます（[第 6 回](06-domr-encapsulation.md)）。なお、この 2 つの間にある `selectRootElement`（ルートのホスト要素を探し、`preserveContent` が偽なら中身を消す）は[ApplicationRef の章](../boot/10-boot-application-ref.md)で引用しています。

## 6. デモ：名前空間と &lt;template&gt;

章の中で定義した本物のコンポーネント（`<svg>` の中に `<rect>` と `<foreignObject><span>`、`<math>`、`<template><b>`、`<p>`）を、共通部品 `domr-probe.ts` の記録係で包んだ**このサイトの本物の `DomRendererFactory2`** で描きます。上の表は `createElement` に届いた引数と、できた要素の `namespaceURI`・いまの親。下の表は差し込みの呼び出しです。

> **🧪 DEMO — svg・math・&lt;template&gt; を含む本物のコンポーネントを描く**
>
> 表の「いまの親」は描き終えたあとの `parentNode` です。`#fragment` は `<template>` の `content`。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/domr-default-renderer)

headless Chrome の開発ビルドで押した結果です（番号は記録の通し番号）。

- `svg`・`rect`・`foreignObject` は第 2 引数が `"svg"` で、namespaceURI は `…/2000/svg`。`foreignObject` の中の `span` は `null` に戻り、`…/1999/xhtml` です。
- `math`・`mi`・`mo`・`mn` は `"math"` で `…/1998/Math/MathML`。`template` と `p` は `null`。
- `appendChild(<template>, <b>)` のあと、`<b>` の親は `#fragment`（`content`）。`template.childNodes.length` は 0、`content.childNodes.length` は 1 でした。

> **🧪 DEMO — 本物の defaultRenderer に insertBefore と removeChild を呼ぶ**
>
> ページに入れていない &lt;div&gt; の中で試すので、画面は変わりません。結果の文だけが出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/domr-default-renderer)

このデモは記録係を通さず、`RendererFactory2`（このサイトの本物の `DomRendererFactory2`）から `createRenderer(null, null)` で `defaultRenderer` を取り、ページに入れていない小さな木で試します。開発ビルドでは 3 と 4 が `RuntimeError: NG05106: Angular could not insert a node before SPAN because it is no longer a child of DIV. …` になり、1・2・5 は例外なし、最後の `parent.innerHTML` は `<u></u>` でした（`<i>` は 5 で外れ、`<em>`・`<q>` は入らない）。このページ自体は本番ビルドで配られています。本番では 363 行目の `ngDevMode` が偽で文が渡らず、core の `formatRuntimeError` は文が無いと番号だけを返すので、ここで押した結果は `RuntimeError: NG05106` の 1 語になります。

## ここまでの呼び出し

- 👤 `<svg><rect /></svg>`（テンプレート）
  - `emitNamespaceChanges` — compiler/src/template/pipeline/src/phases/namespace.ts L15 — *svg の前に Namespace の op を 1 つ*
  - `ɵɵnamespaceSVG()` — core/src/render3/state.ts L792 — *currentNamespace = 'svg'*
  - `ɵɵelementStart(0, 'svg')` → `createElementNode(lView[RENDERER], 'svg', getNamespace())` — core/src/render3/instructions/element.ts L324
    - `DefaultDomRenderer2.createElement('svg', 'svg')` — platform-browser/src/dom/dom\_renderer.ts L324
      - `doc.createElementNS(NAMESPACE_URIS['svg'], 'svg')` — dom\_renderer.ts L335
  - `nativeAppendOrInsertBefore` → `renderer.appendChild(parent, el)` — core/src/render3/dom\_node\_manipulation.ts L62 — *&lt;template&gt; なら content へ（L350）*
  - `nativeInsertBefore(renderer, parent, el, before, true)` — dom\_node\_manipulation.ts L47 — *before が外れていれば NG05106（L360）*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| `packages/platform-browser/test/dom/dom_renderer_spec.ts` | describe `DefaultDomRendererV2` の `removeChild`（95）、it `should be able to append children to a <template> element`（164）・`…insert children before others in a <template> element`（173）・`` …insert a child when `refChild` is `null` ``（184）、describe `when the reference node was detached outside of Angular`（193、it 2 つ）、describe `should support namespaces`（341、it 2 つ） | `//packages/platform-browser/test:test_web` |
| `packages/core/test/acceptance/dom_node_manipulation_spec.ts` | describe `DOM node manipulation outside of Angular`（12）の it 1 つ | `//packages/core/test/acceptance:acceptance` |
| `packages/core/test/linker/integration_spec.ts` | describe `svg`（2170）の it `should support svg elements`・`should support foreignObjects with document fragments`。`getDOM().supportsDOMEvents` のときだけ登録されるので、Node では 0 件 | `//packages/core/test:test_web` |

📄 `angular/packages/platform-browser/test/dom/dom_renderer_spec.ts` L164–191 （▶ の行: 168, 170, 179, 181, 188, 190）

```ts
164 │   it('should be able to append children to a <template> element', () => {
165 │     const template = document.createElement('template');
166 │     const child = document.createElement('div');
167 │ 
168 ▶     renderer.appendChild(template, child);
169 │ 
170 ▶     expect(child.parentNode).toBe(template.content);
171 │   });
172 │ 
173 │   it('should be able to insert children before others in a <template> element', () => {
174 │     const template = document.createElement('template');
175 │     const child = document.createElement('div');
176 │     const otherChild = document.createElement('div');
177 │     template.content.appendChild(child);
178 │ 
179 ▶     renderer.insertBefore(template, otherChild, child);
180 │ 
181 ▶     expect(otherChild.parentNode).toBe(template.content);
182 │   });
183 │ 
184 │   it('should be able to insert a child when `refChild` is `null`', () => {
185 │     const parent = document.createElement('div');
186 │     const child = document.createElement('div');
187 │ 
188 ▶     renderer.insertBefore(parent, child, null);
189 │ 
190 ▶     expect(child.parentNode).toBe(parent);
191 │   });
```

📄 `angular/packages/platform-browser/test/dom/dom_renderer_spec.ts` L193–218 （▶ の行: 201, 203–204, 214, 216）

```ts
193 │   describe('when the reference node was detached outside of Angular', () => {
194 │     it('should throw a descriptive error instead of a native NotFoundError', () => {
195 │       const parent = document.createElement('div');
196 │       const refChild = document.createElement('span');
197 │       const newChild = document.createElement('div');
198 │       parent.appendChild(refChild);
199 │ 
200 │       // pretend something outside Angular removed it
201 ▶       refChild.remove();
202 │ 
203 ▶       expect(() => renderer.insertBefore(parent, newChild, refChild)).toThrowError(/NG05106/);
204 ▶       expect(newChild.parentNode).toBeNull();
205 │     });
206 │ 
207 │     it('should throw a descriptive error when the reference node was moved to another parent', () => {
208 │       const parent = document.createElement('div');
209 │       const otherParent = document.createElement('div');
210 │       const refChild = document.createElement('span');
211 │       const newChild = document.createElement('div');
212 │       parent.appendChild(refChild);
213 │ 
214 ▶       otherParent.appendChild(refChild);
215 │ 
216 ▶       expect(() => renderer.insertBefore(parent, newChild, refChild)).toThrowError(/NG05106/);
217 │     });
218 │   });
```

201 行目で「Angular の外で外された」を作り、203 行目で `NG05106` を、204 行目で `newChild` がどこにも入っていないことを確かめます。214 行目は「別の親へ移された」の場合です。同じ形を core の側から確かめるのが次の it です。

📄 `angular/packages/core/test/acceptance/dom_node_manipulation_spec.ts` L12–43 （▶ の行: 32, 36, 40–41）

```ts
12 │ describe('DOM node manipulation outside of Angular', () => {
13 │   it('should throw a descriptive error when a tracked node was detached externally', () => {
14 │     @Component({
15 │       template: `
16 │         <ng-template #tpl><span>view</span></ng-template>
17 │         <div #container></div>
18 │       `,
19 │     })
20 │     class App {
21 │       @ViewChild('container', {read: ViewContainerRef, static: true})
22 │       container: ViewContainerRef = null!;
23 │ 
24 │       @ViewChild('tpl', {read: TemplateRef, static: true}) tpl: TemplateRef<any> = null!;
25 │     }
26 │ 
27 │     const fixture = TestBed.createComponent(App);
28 │     fixture.detectChanges();
29 │     const app = fixture.componentInstance;
30 │ 
31 │     // This view's first node will be used as the `refChild` for the next insert.
32 ▶     app.container.createEmbeddedView(app.tpl);
33 │ 
34 │     const span = fixture.nativeElement.querySelector('span') as HTMLElement;
35 │     // Pretend a browser extension (Grammarly, a password manager, etc.) removed it.
36 ▶     span.remove();
37 │ 
38 │     // Inserting a new view in front of it now has to insertBefore(span), and span
39 │     // isn't attached anymore.
40 ▶     expect(() => app.container.createEmbeddedView(app.tpl, {}, 0)).toThrowError(
41 ▶       /NG05106.*no longer a child/,
42 │     );
43 │   });
```

36 行目でビューの最初のノードを外から `remove()` し、40 行目、その前に新しいビューを差し込もうとすると `NG05106`。core の `nativeInsertBefore` から 360 行目に届くことを、本物のコンポーネントで確かめています。

📄 `angular/packages/platform-browser/test/dom/dom_renderer_spec.ts` L95–103 （▶ の行: 96, 101）

```ts
 95 │   describe('removeChild', () => {
 96 ▶     it('should not error when removing a child without passing a parent', () => {
 97 │       const parent = document.createElement('div');
 98 │       const child = document.createElement('div');
 99 │ 
100 │       parent.appendChild(child);
101 ▶       renderer.removeChild(null, child);
102 │     });
103 │   });
```

📄 `angular/packages/platform-browser/test/dom/dom_renderer_spec.ts` L341–353 （▶ の行: 344, 350）

```ts
341 │   describe('should support namespaces', () => {
342 │     it('should create SVG elements', () => {
343 │       expect(
344 ▶         document.createElementNS(NAMESPACE_URIS['svg'], 'math') instanceof SVGElement,
345 │       ).toBeTrue();
346 │     });
347 │ 
348 │     it('should create MathML elements', () => {
349 │       expect(
350 ▶         document.createElementNS(NAMESPACE_URIS['math'], 'math') instanceof MathMLElement,
351 │       ).toBeTrue();
352 │     });
353 │   });
```

341〜353 行目の 2 つの it は、`NAMESPACE_URIS` の値で `document.createElementNS` を呼んだ結果を見ています（344 行目は `svg` の URI で `math` という名前の要素を作っています）。**`renderer.createElement` は呼んでいない**ので、335 行目の `|| namespace`（URI をそのまま渡す道）を直接確かめる it は、この spec にはありません。SVG・MathML の要素が正しく作られることは、core の `integration_spec.ts` の describe `svg` などテンプレートを通す it で確かめられています。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
git status --short          # 走らせる前と後で同じか（ソースは変えない）
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
  '--test_arg=--filter=DOM node manipulation outside of Angular'
pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=should support svg elements|should support foreignObjects with document fragments'
# dom_renderer_spec と core の describe svg の中身はブラウザで走る
pnpm bazel test //packages/platform-browser/test:test_web --nocache_test_results --test_output=all
pnpm bazel test //packages/core/test:test_web_chromium --nocache_test_results --test_output=all
```

📄 `出力（2026-11-04 に実行。抜粋。ログは scratchpad/domr-logs/a-acc-dom.log・a-web.log・a-core-svg.log・a-core-web.log）`

```
Ran 1 of 2693 specs
1 spec, 0 failures
//packages/core/test/acceptance:acceptance                               PASSED in 1.3s

Ran 0 of 1401 specs        （4 つのシャードとも）
0 specs, 0 failures
//packages/core/test:test                                                PASSED in 1.3s

Chromium: 1/1 test files | 253 passed, 0 failed, 5 skipped
Firefox:  1/1 test files | 253 passed, 0 failed, 5 skipped
//packages/platform-browser/test:test_web_chromium                       PASSED in 2.1s
//packages/platform-browser/test:test_web_firefox                        PASSED in 6.5s

Chromium: 1/1 test files | 1591 passed, 0 failed, 4 skipped
//packages/core/test:test_web_chromium                                   PASSED in 3.8s
```

- Node の `//packages/core/test:test` に describe `svg` の 2 つの it の名前でフィルタを付けると、4 つのシャードとも `Ran 0 of 1401 specs`（PASSED）。0 件でも PASSED になるので、件数を必ず見ます。
- 中身はブラウザで走ります。`//packages/platform-browser/test:test_web` は Chromium・Firefox とも 253 passed・5 skipped、`//packages/core/test:test_web_chromium` は 1591 passed・4 skipped（3.8 秒）。どちらもフィルタは付けていません。

### 直すとしたら

- 要素とテキストの作り方・差し込み方は `dom_renderer.ts` の `DefaultDomRenderer2` の `createElement`〜`nextSibling`。it は `dom_renderer_spec.ts` の 164〜191 行目の形（本物の renderer に直接呼び、DOM を見る）で足し、`:test_web` で確かめます。
- 名前空間を足す・扱いを変えるなら、2 節の TODO のとおり `createElement` だけでなく `setAttribute`（[第 5 回](05-domr-attributes-properties.md)）とサーバーの renderer も一緒に見ます。`renderer.createElement('svg', 'http://www.w3.org/2000/svg')` のように URI を渡す it が無いのは、手元で足して走らせてみる入口になります。
- core の側（いつ `insertBefore` を呼ぶか）がおかしいときは `dom_node_manipulation.ts` と `node_manipulation.ts`。it は `core/test/acceptance/dom_node_manipulation_spec.ts` の形です。
- 関係する issue：#43078（`<template>` の中の要素、開いている）、#44883（名前空間、閉じた）と同じ TODO に挙がっている #44028（閉じた）。2026-08 の 1cb3d606bf5 と、同じ月の 83f7695b2e4（ハイドレーションで期待したノードが無いときに番号付きのエラーにする）は、「外のコードが DOM を変えたときに分かるエラーにする」という同じ向きの修正です（[第 20 回](20-domr-issues.md)）。本家に PR を出すことは勧めません。

## 聞かれそうな質問

**Q. Renderer2 で svg の要素を作るには？**

`renderer.createElement('rect', 'svg')` と短い名前を渡します。335 行目で `NAMESPACE_URIS['svg']`（41 行目）に直して `createElementNS` を呼びます。URI（`'http://www.w3.org/2000/svg'`）を渡しても、335 行目の `|| namespace` でそのまま使われます。名前空間を渡さないと 338 行目の `createElement` で HTML の要素になり、svg の中に入れても描かれません。

**Q. テンプレートの &lt;svg&gt; の中の要素に、毎回名前空間の命令が付くのですか？**

付きません。コンパイラの `emitNamespaceChanges`（namespace.ts 23〜25 行目）は名前空間が変わる所にだけ命令を置き、core は state.ts 793 行目の `currentNamespace` をそのまま次の要素にも使います。

**Q. テンプレートに &lt;template&gt; を書くと、中身は画面に出ますか？**

出ません。350 行目で中の要素は `template.content` に入るので、ブラウザが自分で `<template>` を読んだときと同じく描かれません。デモでも `template.childNodes.length` は 0 でした。ただし要素はまずページの document で作られる（338 行目）ので、カスタム要素は動き出します（#43078）。

**Q. NG05106 が出たら、何を疑いますか？**

Angular が覚えている「この前に差し込む」ノードが、もう親の子ではない、という意味です（360 行目）。ブラウザ拡張や、`ElementRef.nativeElement` を直接いじるコードが、Angular の描いたノードを外したり動かしたりしていないかを見ます。開発ビルドならメッセージに参照のノードと親が出ます（364 行目）。

**Q. removeChild に親を渡さなくてよいのはなぜ？**

375 行目で `oldChild.remove()` を呼ぶだけで、親を読まないからです。core の `nativeRemoveNode` も 93 行目で `null` を渡しています。dom\_renderer\_spec.ts 101 行目の it もこれを確かめています。

**Q. destroyNode が null だと何が違いますか？**

node\_manipulation.ts 322〜323 行目のとおり、ビューを壊すときの「全ノードを歩いて `destroyNode` を呼ぶ」走査がまるごと省かれます。ブラウザ用の renderer は 322 行目（dom\_renderer.ts）で `null` にしています。

## 読み終えて

- `createElement` の名前空間は `'svg'`・`'math'` の短い名前で来て、`NAMESPACE_URIS` で URI に直る。URI そのものも通る（335 行目）
- 名前空間はコンパイラが変わり目にだけ置く `ɵɵnamespaceSVG()` などで、core の LFrame の `currentNamespace` に入る
- `<template>` への `appendChild`・`insertBefore` は `content` に入る。要素はページの document で作られてから移される
- `insertBefore` は参照のノードが外れていると `NG05106`。`removeChild` は親を使わず、`destroyNode` は `null`

---

← 前: [DomRendererFactory2：コンポーネントごとの renderer](03-domr-renderer-factory.md)  
次: [属性とプロパティ：ɵɵattribute・ɵɵproperty から setAttribute・setProperty へ](05-domr-attributes-properties.md) →
