[目次](../README.md) › [テストの内側](README.md) › 第 8 回 / 全 20 回

# DebugElement と By：テストから DOM とコンポーネントを覗く

> fixture.debugElement が getDebugNode で DOM の節に DebugElement を 1 つだけ作って貼る仕組み、query / queryAll が TNode の木・子コンポーネントのビュー・DOM の子孫の順に歩くことと By.css・By.directive（providers のトークンにも一致）・By.all の述語、injector・componentInstance・properties・attributes が LView から読まれ、styles・classes は DOM だけを読む行、triggerEventHandler が DOM イベントを出さずに cleanup に記録されたリスナーを呼ぶこと。nativeElement との使い分け。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/testing-debug-element)

---

`fixture.debugElement.query(By.css('button')).triggerEventHandler('click')` は、テストでよく見る 1 行です。この章では、`DebugElement` が**DOM の節を 1 つ持っているだけの薄い包み**で、`properties`・`injector`・`componentInstance` などは呼ぶたびに DOM の節から `LView` をたどって読んでいること、`query` が DOM ではなく `TNode` の木を歩くこと、`triggerEventHandler` が**DOM のイベントを出さずに**、Angular が登録したリスナーの関数を直接呼ぶことを、行番号を指して確かめます。

読む対象は `packages/core/src/debug/debug_node.ts`、`packages/core/src/render3/util/discovery_utils.ts`（`getListeners`・`getInjectionTokens`）、`packages/platform-browser/src/dom/debug/by.ts` です。

1. [1. 全体像](01-testing-overview.md)
2. [2. initTestEnvironment](02-testing-init-environment.md)
3. [3. 後片付け](03-testing-reset-teardown.md)
4. [4. TestBed.inject](04-testing-inject.md)
5. [5. createComponent](05-testing-create-component.md)
6. [6. 入力の渡し方](06-testing-component-bindings.md)
7. [7. createDirective](07-testing-directive-fixture.md)
8. **8. DebugElement と By**（この章）
9. [9. detectChanges](09-testing-detect-changes.md)
10. [10. 自動の変更検知](10-testing-auto-detect.md)
11. [11. whenStable](11-testing-when-stable.md)
12. [12. エラーの伝わり方](12-testing-errors.md)
13. [13. fakeAsync](13-testing-fake-async.md)
14. [14. 偽の時計](14-testing-fake-async-scheduler.md)
15. [15. waitForAsync と ProxyZone](15-testing-wait-for-async.md)
16. [16. zone なしの時間](16-testing-zoneless-time.md)
17. [17. effect と signal](17-testing-effects.md)
18. [18. @defer](18-testing-defer.md)
19. [19. RouterTestingHarness](19-testing-router-harness.md)
20. [20. issue と変更を読む](20-testing-issues.md)

## 1. getDebugNode：DOM の節に 1 つだけ作って貼る

`fixture.debugElement` は、fixture のコンストラクタが根の要素に `getDebugNode` を呼んで作ります（[第 10 回](10-testing-auto-detect.md)）。その関数です。

📄 `angular/packages/core/src/debug/debug_node.ts` L716–735 （▶ の行: 719, 724–730, 732, 734）

```ts
716 │ // Need to keep the nodes in a global Map so that multiple angular apps are supported.
717 │ const _nativeNodeToDebugNode = new Map<any, DebugNode>();
718 │ 
719 ▶ const NG_DEBUG_PROPERTY = '__ng_debug__';
720 │ 
721 │ /**
722 │  * @publicApi
723 │  */
724 ▶ export function getDebugNode(nativeNode: any): DebugNode | null {
725 ▶   if (nativeNode instanceof Node) {
726 ▶     if (!Object.hasOwn(nativeNode, NG_DEBUG_PROPERTY)) {
727 ▶       (nativeNode as any)[NG_DEBUG_PROPERTY] =
728 ▶         nativeNode.nodeType == Node.ELEMENT_NODE
729 ▶           ? new DebugElement(nativeNode as Element)
730 ▶           : new DebugNode(nativeNode);
731 │     }
732 ▶     return (nativeNode as any)[NG_DEBUG_PROPERTY];
733 │   }
734 ▶   return null;
735 │ }
```

1. **725 行目：DOM の `Node` でなければ `null`**

   Angular が作った要素かどうかは見ていません。`document.body` でも、自分で `createElement` した要素でも通ります。
2. **726〜731 行目：まだ無ければ作って、節のプロパティに貼る**

   719 行目の `'__ng_debug__'` という名前で、節そのものにプロパティを足します。要素なら `DebugElement`、テキストやコメントなら `DebugNode` です。
3. **732 行目：あればそれを返す**

   だから同じ節には**いつも同じオブジェクト**が返ります。このサイトの ng test でも、`query(By.css('button'))` と `query(By.css('#b'))` の結果は同じオブジェクトでした（`===` が `true`）。

`getDebugNode` は `@angular/core` から公開されている関数で（722 行目の `@publicApi`）、`ngDevMode` の分岐もありません。ブラウザの開発者ツールで使う `ng.getComponent` のような「開発モードだけの道具」とは別物です。この章のデモはページの上でこれをそのまま呼びます。

## 2. DebugNode：持っているのは nativeNode だけ

📄 `angular/packages/core/src/debug/debug_node.ts` L57–90 （▶ の行: 61, 63–64, 70, 72, 78–79, 85, 88）

```ts
57 │ export class DebugNode {
58 │   /**
59 │    * The underlying DOM node.
60 │    */
61 ▶   readonly nativeNode: any;
62 │ 
63 ▶   constructor(nativeNode: Node) {
64 ▶     this.nativeNode = nativeNode;
65 │   }
66 │ 
67 │   /**
68 │    * The `DebugElement` parent. Will be `null` if this is the root element.
69 │    */
70 ▶   get parent(): DebugElement | null {
71 │     const parent = this.nativeNode.parentNode as Element;
72 ▶     return parent ? new DebugElement(parent) : null;
73 │   }
74 │ 
75 │   /**
76 │    * The host dependency injector. For example, the root element's component instance injector.
77 │    */
78 ▶   get injector(): Injector {
79 ▶     return getInjector(this.nativeNode);
80 │   }
81 │ 
82 │   /**
83 │    * The element's own component instance, if it has one.
84 │    */
85 ▶   get componentInstance(): any {
86 │     const nativeElement = this.nativeNode;
87 │     return (
88 ▶       nativeElement && (getComponent(nativeElement as Element) || getOwningComponent(nativeElement))
89 │     );
90 │   }
```

61〜65 行目、フィールドは `nativeNode` だけです。ほかはすべて getter で、**呼ぶたびに**計算します。

- 70〜73 行目の `parent` は、親の DOM 要素から `new DebugElement(...)` します。`getDebugNode` を通らないので、呼ぶたびに別のオブジェクトです。
- 78〜80 行目の `injector` は `getInjector(nativeNode)`。節に貼られた `LView`（[要素を作る命令の章](../ivy/09-ivy-create-instructions.md)の `attachPatchData`）から `TNode` を探し、`NodeInjector` を作って返します。Angular の外の要素なら `Injector.NULL` で、ng test で `getDebugNode(document.body).injector` は `NullInjector` でした。
- 85〜90 行目の `componentInstance` は、88 行目で「その要素がホストのコンポーネント」→ 無ければ「その要素を持つテンプレートのコンポーネント」の順です。ng test で、ホストのテンプレートにある `<button>` の `componentInstance` はホストのコンポーネント、子のテンプレートにある `<span>` のそれは子のコンポーネントでした。

📄 `angular/packages/core/src/debug/debug_node.ts` L104–127 （▶ の行: 108–109, 124–125）

```ts
104 │   /**
105 │    * The callbacks attached to the component's @Output properties and/or the element's event
106 │    * properties.
107 │    */
108 ▶   get listeners(): DebugEventListener[] {
109 ▶     return getListeners(this.nativeNode as Element).filter((listener) => listener.type === 'dom');
110 │   }
111 │ 
112 │   /**
113 │    * Dictionary of objects associated with template local variables (e.g. #foo), keyed by the local
114 │    * variable name.
115 │    */
116 │   get references(): {[key: string]: any} {
117 │     return getLocalRefs(this.nativeNode);
118 │   }
119 │ 
120 │   /**
121 │    * This component's injector lookup tokens. Includes the component itself plus the tokens that the
122 │    * component lists in its providers metadata.
123 │    */
124 ▶   get providerTokens(): any[] {
125 ▶     return getInjectionTokens(this.nativeNode as Element);
126 │   }
127 │ }
```

109 行目の `listeners` は、`getListeners` の結果から `type === 'dom'` のものだけを残します（5 節）。125 行目の `providerTokens` は 4 節の `By.directive` が使います。

## 3. properties・attributes・classes・styles はどこから読むか

📄 `angular/packages/core/src/debug/debug_node.ts` L165–195 （▶ の行: 168, 173–175, 178, 186, 190, 193）

```ts
165 │   /**
166 │    *  Gets a map of property names to property values for an element.
167 │    *
168 ▶    *  This map includes:
169 │    *  - Regular property bindings (e.g. `[id]="id"`)
170 │    *  - Host property bindings (e.g. `host: { '[id]': "id" }`)
171 │    *  - Interpolated property bindings (e.g. `id="{{ value }}")
172 │    *
173 ▶    *  It does not include:
174 ▶    *  - input property bindings (e.g. `[myCustomInput]="value"`)
175 ▶    *  - attribute bindings (e.g. `[attr.role]="menu"`)
176 │    */
177 │   get properties(): {[key: string]: any} {
178 ▶     const context = getLContext(this.nativeNode)!;
179 │     const lView = context ? context.lView : null;
180 │ 
181 │     if (lView === null) {
182 │       return {};
183 │     }
184 │ 
185 │     const tData = lView[TVIEW].data;
186 ▶     const tNode = tData[context.nodeIndex] as TNode;
187 │ 
188 │     const properties: {[key: string]: string} = {};
189 │     // Collect properties from the DOM.
190 ▶     copyDomProperties(this.nativeElement, properties);
191 │     // Collect properties from the bindings. This is needed for animation renderer which has
192 │     // synthetic properties which don't get reflected into the DOM.
193 ▶     collectPropertyBindings(properties, tNode, lView, tData);
194 │     return properties;
195 │   }
```

178 行目で節から `LView` と位置を探し、186 行目で `TNode` を取ります。190 行目の `copyDomProperties` は DOM 要素のプロトタイプをたどって、文字列・真偽値・数値のプロパティを全部集めます（`__` と `on` で始まるものは除く）。193 行目の `collectPropertyBindings` は、テンプレートのプロパティバインディング（`[title]="t"` や補間）の値を `LView` から読んで上書きします。173〜175 行目のとおり、ディレクティブの入力（`[myInput]`）と `[attr.x]` は入りません。ng test では `[title]="t"` の `properties['title']` が `'tip'`、静的な `id="b"` も DOM のプロパティとして `properties['id']` に `'b'` で入っていました。

📄 `angular/packages/core/src/debug/debug_node.ts` L216–252 （▶ の行: 216, 226, 236–237, 243, 246–247）

```ts
216 ▶     const tNodeAttrs = (lView[TVIEW].data[context.nodeIndex] as TNode).attrs;
217 │     const lowercaseTNodeAttrs: string[] = [];
218 │ 
219 │     // For debug nodes we take the element's attribute directly from the DOM since it allows us
220 │     // to account for ones that weren't set via bindings (e.g. ViewEngine keeps track of the ones
221 │     // that are set through `Renderer2`). The problem is that the browser will lowercase all names,
222 │     // however since we have the attributes already on the TNode, we can preserve the case by going
223 │     // through them once, adding them to the `attributes` map and putting their lower-cased name
224 │     // into an array. Afterwards when we're going through the native DOM attributes, we can check
225 │     // whether we haven't run into an attribute already through the TNode.
226 ▶     if (tNodeAttrs) {
227 │       let i = 0;
228 │       while (i < tNodeAttrs.length) {
229 │         const attrName = tNodeAttrs[i];
230 │ 
231 │         // Stop as soon as we hit a marker. We only care about the regular attributes. Everything
232 │         // else will be handled below when we read the final attributes off the DOM.
233 │         if (typeof attrName !== 'string') break;
234 │ 
235 │         const attrValue = tNodeAttrs[i + 1];
236 ▶         attributes[attrName] = attrValue as string;
237 ▶         lowercaseTNodeAttrs.push(attrName.toLowerCase());
238 │ 
239 │         i += 2;
240 │       }
241 │     }
242 │ 
243 ▶     for (const attr of element.attributes) {
244 │       // Make sure that we don't assign the same attribute both in its
245 │       // case-sensitive form and the lower-cased one from the browser.
246 ▶       if (!lowercaseTNodeAttrs.includes(attr.name)) {
247 ▶         attributes[attr.name] = attr.value;
248 │       }
249 │     }
250 │ 
251 │     return attributes;
252 │   }
```

216 行目、まず `TNode.attrs`（テンプレートに書いた静的な属性）を、**書いたときの大文字小文字のまま**入れます（219〜225 行目のコメント）。243〜249 行目で、DOM の `element.attributes` のうちまだ入っていないものを足します。だから `[title]` のようにバインディングで付いた属性も入ります。ng test では `{"id":"b","class":"a b","style":"color: red;","title":"tip"}` でした。

📄 `angular/packages/core/src/debug/debug_node.ts` L254–285 （▶ の行: 260, 278, 280, 282）

```ts
254 │   /**
255 │    * The inline styles of the DOM element.
256 │    */
257 │   // TODO: replace null by undefined in the return type
258 │   get styles(): {[key: string]: string | null} {
259 │     const element = this.nativeElement as HTMLElement | null;
260 ▶     return (element?.style ?? {}) as {[key: string]: string | null};
261 │   }
262 │ 
263 │   /**
264 │    * A map containing the class names on the element as keys.
265 │    *
266 │    * This map is derived from the `className` property of the DOM element.
267 │    *
268 │    * Note: The values of this object will always be `true`. The class key will not appear in the KV
269 │    * object if it does not exist on the element.
270 │    *
271 │    * @see [Element.className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className)
272 │    */
273 │   get classes(): {[key: string]: boolean} {
274 │     const result: {[key: string]: boolean} = {};
275 │     const element = this.nativeElement as HTMLElement | SVGElement;
276 │ 
277 │     // SVG elements return an `SVGAnimatedString` instead of a plain string for the `className`.
278 ▶     const className = element.className as string | SVGAnimatedString;
279 │     const classes =
280 ▶       typeof className !== 'string' ? className.baseVal.split(' ') : className.split(' ');
281 │ 
282 ▶     classes.forEach((value: string) => (result[value] = true));
283 │ 
284 │     return result;
285 │   }
```

260 行目、`styles` は DOM の `element.style` そのものです。278〜282 行目、`classes` は `className` を空白で割って `true` を入れた object です。つまり**この 2 つは `LView` を見ず、DOM だけを読んでいます**。

## 4. query：DOM ではなく TNode の木を歩く

📄 `angular/packages/core/src/debug/debug_node.ts` L317–341 （▶ の行: 321–322, 330, 339）

```ts
317 │   /**
318 │    * @returns the first `DebugElement` that matches the predicate at any depth in the subtree.
319 │    */
320 │   query(predicate: Predicate<DebugElement>): DebugElement {
321 ▶     const results = this.queryAll(predicate);
322 ▶     return results[0] || null;
323 │   }
324 │ 
325 │   /**
326 │    * @returns All `DebugElement` matches for the predicate at any depth in the subtree.
327 │    */
328 │   queryAll(predicate: Predicate<DebugElement>): DebugElement[] {
329 │     const matches: DebugElement[] = [];
330 ▶     _queryAll(this, predicate, matches, true);
331 │     return matches;
332 │   }
333 │ 
334 │   /**
335 │    * @returns All `DebugNode` matches for the predicate at any depth in the subtree.
336 │    */
337 │   queryAllNodes(predicate: Predicate<DebugNode>): DebugNode[] {
338 │     const matches: DebugNode[] = [];
339 ▶     _queryAll(this, predicate, matches, false);
340 │     return matches;
341 │   }
```

322 行目、`query` は `queryAll` の先頭です（無ければ `null`）。`queryAll`（330 行目）と `queryAllNodes`（339 行目）の違いは最後の引数だけで、前者は要素だけ、後者はテキストやコメントの節も集めます。

📄 `angular/packages/core/src/debug/debug_node.ts` L444–467 （▶ の行: 450, 452–454, 460, 465）

```ts
444 │ function _queryAll(
445 │   parentElement: DebugElement,
446 │   predicate: Predicate<DebugElement> | Predicate<DebugNode>,
447 │   matches: DebugElement[] | DebugNode[],
448 │   elementsOnly: boolean,
449 │ ) {
450 ▶   const context = getLContext(parentElement.nativeNode)!;
451 │   const lView = context ? context.lView : null;
452 ▶   if (lView !== null) {
453 ▶     const parentTNode = lView[TVIEW].data[context.nodeIndex] as TNode;
454 ▶     _queryNodeChildren(
455 │       parentTNode,
456 │       lView,
457 │       predicate,
458 │       matches,
459 │       elementsOnly,
460 ▶       parentElement.nativeNode,
461 │     );
462 │   } else {
463 │     // If the context is null, then `parentElement` was either created with Renderer2 or native DOM
464 │     // APIs.
465 ▶     _queryNativeNodeDescendants(parentElement.nativeNode, predicate, matches, elementsOnly);
466 │   }
467 │ }
```

450 行目で起点の節の `LView` を探し、453 行目でその `TNode` から歩き始めます。460 行目で起点自身を渡しているのは、**起点そのものは結果に入れない**ためです。Angular の外で作られた節なら（452 行目が偽）、465 行目で DOM の子をたどるだけです。

📄 `angular/packages/core/src/debug/debug_node.ts` L486–512 （▶ の行: 488, 490, 493–494, 497, 499, 509, 511）

```ts
486 │ ) {
487 │   ngDevMode && assertTNodeForLView(tNode, lView);
488 ▶   const nativeNode = getNativeByTNodeOrNull(tNode, lView);
489 │   // For each type of TNode, specific logic is executed.
490 ▶   if (tNode.type & (TNodeType.AnyRNode | TNodeType.ElementContainer)) {
491 │     // Case 1: the TNode is an element
492 │     // The native node has to be checked.
493 ▶     _addQueryMatch(nativeNode, predicate, matches, elementsOnly, rootNativeNode);
494 ▶     if (isComponentHost(tNode)) {
495 │       // If the element is the host of a component, then all nodes in its view have to be processed.
496 │       // Note: the component's content (tNode.child) will be processed from the insertion points.
497 ▶       const componentView = getComponentLViewByIndex(tNode.index, lView);
498 │       if (componentView && componentView[TVIEW].firstChild) {
499 ▶         _queryNodeChildren(
500 │           componentView[TVIEW].firstChild!,
501 │           componentView,
502 │           predicate,
503 │           matches,
504 │           elementsOnly,
505 │           rootNativeNode,
506 │         );
507 │       }
508 │     } else {
509 ▶       if (tNode.child) {
510 │         // Otherwise, its children have to be processed.
511 ▶         _queryNodeChildren(tNode.child, lView, predicate, matches, elementsOnly, rootNativeNode);
512 │       }
```

1. **493 行目：いまの節を述語（predicate）にかける**

   一致すれば結果に積みます（`_addQueryMatch`。`getDebugNode` で `DebugElement` にしてから述語を呼ぶ）。
2. **494〜507 行目：コンポーネントのホストなら、そのコンポーネントのビューに入る**

   497 行目で子コンポーネントの `LView` を取り、499 行目でその最初の `TNode` から歩き続けます。だから **`By.css` は子コンポーネントのテンプレートの中まで探します**。ng test で、子のテンプレートにある `.inner` は `queryAll(By.css('.inner'))` で 1 つ見つかりました（`querySelectorAll` でも 1 つ）。
3. **509〜512 行目：普通の要素なら、テンプレート上の子へ**

   `tNode.child` から再帰します。

📄 `angular/packages/core/src/debug/debug_node.ts` L513–534 （▶ の行: 521, 525–527）

```ts
513 │ 
514 │       // We also have to query the DOM directly in order to catch elements inserted through
515 │       // Renderer2. Note that this is __not__ optimal, because we're walking similar trees multiple
516 │       // times. ViewEngine could do it more efficiently, because all the insertions go through
517 │       // Renderer2, however that's not the case in Ivy. This approach is being used because:
518 │       // 1. Matching the ViewEngine behavior would mean potentially introducing a dependency
519 │       //    from `Renderer2` to Ivy which could bring Ivy code into ViewEngine.
520 │       // 2. It allows us to capture nodes that were inserted directly via the DOM.
521 ▶       nativeNode && _queryNativeNodeDescendants(nativeNode, predicate, matches, elementsOnly);
522 │     }
523 │     // In all cases, if a dynamic container exists for this node, each view inside it has to be
524 │     // processed.
525 ▶     const nodeOrContainer = lView[tNode.index];
526 ▶     if (isLContainer(nodeOrContainer)) {
527 ▶       _queryNodeChildrenInContainer(
528 │         nodeOrContainer,
529 │         predicate,
530 │         matches,
531 │         elementsOnly,
532 │         rootNativeNode,
533 │       );
534 │     }
```

521 行目、`TNode` をたどったあとで、**DOM の子孫もたどります**。514〜520 行目のコメントのとおり、`Renderer2` や DOM の API で直接足された要素も拾うためです。ng test で、テンプレートの `<p>` に `appendChild` で足した `<i class="extra">` も `By.css('.extra')` で見つかりました。525〜533 行目、`@if` や `@for` のコンテナがあれば、その中のビューも歩きます。

### By の 3 つの述語

📄 `angular/packages/platform-browser/src/dom/debug/by.ts` L17–57 （▶ の行: 26–27, 38, 41, 54–55）

```ts
17 │ export class By {
18 │   /**
19 │    * Match all nodes.
20 │    *
21 │    * @usageNotes
22 │    * ### Example
23 │    *
24 │    * {@example platform-browser/dom/debug/ts/by/by.ts region='by_all'}
25 │    */
26 ▶   static all(): Predicate<DebugNode> {
27 ▶     return () => true;
28 │   }
29 │ 
30 │   /**
31 │    * Match elements by the given CSS selector.
32 │    *
33 │    * @usageNotes
34 │    * ### Example
35 │    *
36 │    * {@example platform-browser/dom/debug/ts/by/by.ts region='by_css'}
37 │    */
38 ▶   static css(selector: string): Predicate<DebugElement> {
39 │     return (debugElement) => {
40 │       return debugElement.nativeElement != null
41 ▶         ? elementMatches(debugElement.nativeElement, selector)
42 │         : false;
43 │     };
44 │   }
45 │ 
46 │   /**
47 │    * Match nodes that have the given directive present.
48 │    *
49 │    * @usageNotes
50 │    * ### Example
51 │    *
52 │    * {@example platform-browser/dom/debug/ts/by/by.ts region='by_directive'}
53 │    */
54 ▶   static directive(type: Type<any>): Predicate<DebugNode> {
55 ▶     return (debugNode) => debugNode.providerTokens!.indexOf(type) !== -1;
56 │   }
57 │ }
```

📄 `angular/packages/platform-browser/src/dom/debug/by.ts` L59–69 （▶ の行: 62）

```ts
59 │ function elementMatches(n: any, selector: string): boolean {
60 │   if (getDOM().isElementNode(n)) {
61 │     return (
62 ▶       (n.matches && n.matches(selector)) ||
63 │       (n.msMatchesSelector && n.msMatchesSelector(selector)) ||
64 │       (n.webkitMatchesSelector && n.webkitMatchesSelector(selector))
65 │     );
66 │   }
67 │ 
68 │   return false;
69 │ }
```

`By` は `@angular/platform-browser` にあり、どれも「`DebugElement` を受けて真偽を返す関数」を返すだけです。27 行目の `By.all()` は常に `true`。41 行目の `By.css` は 62 行目で DOM の `element.matches(selector)` を呼びます。55 行目の `By.directive(type)` は `providerTokens` に `type` があるかを見ます。その `providerTokens` の中身がこれです。

📄 `angular/packages/core/src/render3/util/discovery_utils.ts` L155–176 （▶ の行: 162–164, 171, 173）

```ts
155 │ export function getInjectionTokens(element: Element): any[] {
156 │   const context = getLContext(element)!;
157 │   const lView = context ? context.lView : null;
158 │   if (lView === null) return [];
159 │   const tView = lView[TVIEW];
160 │   const tNode = tView.data[context.nodeIndex] as TNode;
161 │   const providerTokens: any[] = [];
162 ▶   const startIndex = tNode.providerIndexes & TNodeProviderIndexes.ProvidersStartIndexMask;
163 ▶   const endIndex = tNode.directiveEnd;
164 ▶   for (let i = startIndex; i < endIndex; i++) {
165 │     let value = tView.data[i];
166 │     if (isDirectiveDefHack(value)) {
167 │       // The fact that we sometimes store Type and sometimes DirectiveDef in this location is a
168 │       // design flaw.  We should always store same type so that we can be monomorphic. The issue
169 │       // is that for Components/Directives we store the def instead the type. The correct behavior
170 │       // is that we should always be storing injectable type in this location.
171 ▶       value = value.type;
172 │     }
173 ▶     providerTokens.push(value);
174 │   }
175 │   return providerTokens;
176 │ }
```

162〜163 行目、範囲は「その要素の providers の始まり」から「ディレクティブの終わり」までです。`tView.data` のその範囲には、コンポーネントの `providers` のトークンと、要素に載ったディレクティブ・コンポーネントの定義が並んでいます（171 行目で定義はクラスに直す）。つまり `By.directive` は**providers に書いたトークンにも一致します**。ng test で、`providers: [LocalService]` を持つ子コンポーネントの `providerTokens` は `[LocalService, Child]` で、`queryAll(By.directive(LocalService))` はその子の要素を返しました。

## 5. triggerEventHandler：DOM のイベントは出ない

📄 `angular/packages/core/src/debug/debug_node.ts` L343–366 （▶ の行: 347–348, 355, 359–363）

```ts
343 │   /**
344 │    * Triggers the event by its name if there is a corresponding listener in the element's
345 │    * `listeners` collection.
346 │    *
347 ▶    * If the event lacks a listener or there's some other problem, consider
348 ▶    * calling `nativeElement.dispatchEvent(eventObject)`.
349 │    *
350 │    * @param eventName The name of the event to trigger
351 │    * @param eventObj The _event object_ expected by the handler
352 │    *
353 │    * @see [Testing components scenarios](guide/testing/components-scenarios#triggereventhandler)
354 │    */
355 ▶   triggerEventHandler(eventName: string, eventObj?: any): void {
356 │     const node = this.nativeNode as any;
357 │     const invokedListeners: Function[] = [];
358 │ 
359 ▶     this.listeners.forEach((listener) => {
360 ▶       if (listener.name === eventName) {
361 ▶         const callback = listener.callback;
362 ▶         callback.call(node, eventObj);
363 ▶         invokedListeners.push(callback);
364 │       }
365 │     });
366 │ 
```

359 行目、2 節の `listeners`（`type === 'dom'` のもの）を 1 つずつ見て、360 行目で名前が同じなら、362 行目で**その関数を直接呼びます**。`dispatchEvent` はしていません。だから引数の `eventObj` がそのまま `$event` になり、省略すれば `undefined` です。347〜348 行目のコメントも「リスナーが無いなどの問題があれば `nativeElement.dispatchEvent(eventObject)` を」と書いています。

📄 `angular/packages/core/src/render3/util/discovery_utils.ts` L437–470 （▶ の行: 443–445, 447, 452, 454, 459–460, 462）

```ts
437 │ export function getListeners(element: Element): Listener[] {
438 │   ngDevMode && assertDomElement(element);
439 │   const lContext = getLContext(element);
440 │   const lView = lContext === null ? null : lContext.lView;
441 │   if (lView === null) return [];
442 │ 
443 ▶   const tView = lView[TVIEW];
444 ▶   const lCleanup = lView[CLEANUP];
445 ▶   const tCleanup = tView.cleanup;
446 │   const listeners: Listener[] = [];
447 ▶   if (tCleanup && lCleanup) {
448 │     for (let i = 0; i < tCleanup.length;) {
449 │       const firstParam = tCleanup[i++];
450 │       const secondParam = tCleanup[i++];
451 │       if (typeof firstParam === 'string') {
452 ▶         const name: string = firstParam;
453 │         const listenerElement = unwrapRNode(lView[secondParam]) as any as Element;
454 ▶         const callback: (value: any) => any = lCleanup[tCleanup[i++]];
455 │         const useCaptureOrIndx = tCleanup[i++];
456 │         // if useCaptureOrIndx is boolean then report it as is.
457 │         // if useCaptureOrIndx is positive number then it in unsubscribe method
458 │         // if useCaptureOrIndx is negative number then it is a Subscription
459 ▶         const type =
460 ▶           typeof useCaptureOrIndx === 'boolean' || useCaptureOrIndx >= 0 ? 'dom' : 'output';
461 │         const useCapture = typeof useCaptureOrIndx === 'boolean' ? useCaptureOrIndx : false;
462 ▶         if (element == listenerElement) {
463 │           listeners.push({element, name, callback, useCapture, type});
464 │         }
465 │       }
466 │     }
467 │   }
468 │   listeners.sort(sortListeners);
469 │   return listeners;
470 │ }
```

`listeners` の元はここです。443〜445 行目、`TView` と `LView` の **cleanup の配列**を読みます。テンプレートの `(click)` は、DOM にリスナーを付けたときに「外すときに使う関数」と一緒に cleanup に記録されます（[destroy の章](../ivy/17-ivy-destroy.md)の `storeListenerCleanup`）。454 行目の `callback` はその記録された関数、つまり `wrapListener` で包んだリスナーです（[(click) からの経路](../zoneless/08-zoneless-listener-path.md)）。459〜460 行目、4 つ目の値が真偽値か 0 以上なら DOM のリスナー、負なら output の購読です。`addEventListener` で直接付けたリスナーは、この配列に**載りません**。

📄 `angular/packages/core/src/debug/debug_node.ts` L367–390 （▶ の行: 367–369, 373, 380–381）

```ts
367 ▶     // We need to check whether `eventListeners` exists, because it's something
368 ▶     // that Zone.js only adds to `EventTarget` in browser environments.
369 ▶     if (typeof node.eventListeners === 'function') {
370 │       // Note that in Ivy we wrap event listeners with a call to `event.preventDefault` in some
371 │       // cases. We use '__ngUnwrap__' as a special token that gives us access to the actual event
372 │       // listener.
373 ▶       node.eventListeners(eventName).forEach((listener: Function) => {
374 │         // In order to ensure that we can detect the special __ngUnwrap__ token described above, we
375 │         // use `toString` on the listener and see if it contains the token. We use this approach to
376 │         // ensure that it still worked with compiled code since it cannot remove or rename string
377 │         // literals. We also considered using a special function name (i.e. if(listener.name ===
378 │         // special)) but that was more cumbersome and we were also concerned the compiled code could
379 │         // strip the name, turning the condition in to ("" === "") and always returning true.
380 ▶         if (listener.toString().indexOf('__ngUnwrap__') !== -1) {
381 ▶           const unwrappedListener = listener('__ngUnwrap__');
382 │           return (
383 │             invokedListeners.indexOf(unwrappedListener) === -1 &&
384 │             unwrappedListener.call(node, eventObj)
385 │           );
386 │         }
387 │       });
388 │     }
389 │   }
390 │ }
```

369 行目、`node.eventListeners` は zone.js がブラウザで `EventTarget` に足す関数です。それがあるときだけ、373〜386 行目で zone.js が覚えているリスナーのうち `'__ngUnwrap__'` を含むもの（Angular が包んだもの）を呼びます。zone.js の無いこのサイトの ng test（jsdom）では、この分岐には入りません。

> [!NOTE]
> **ポイント**
>
> 362 行目で呼ばれる関数は `wrapListener` の包みなので、本物のクリックと同じく `markViewDirty(..., NotificationSource.Listener)` が走り、スケジューラに通知が行きます。ng test では `triggerEventHandler('click')` の直後に `isStable()` が `false` になり、`await whenStable()` のあとで表示が `0` から `1` に変わりました。

### 確かめた結果

このサイトの ng test（Vitest + jsdom、`@angular/core` 22.1.6、zone.js なし）で確かめた spec の要点です。

📄 `src/verify-b/debug.spec.ts（要点。確かめたあと削除）`

```
@Component({
  selector: 'v-child',
  template: '<span class="inner" vMark>in child</span>',
  imports: [Mark],
  providers: [LocalService],
})
class Child { readonly ping = output<string>(); }

@Component({
  selector: 'v-host',
  imports: [Child, Mark],
  template: `
    <button id="b" class="a b" [title]="t" style="color: red" (click)="onClick($event)">{{ n() }}</button>
    <v-child (ping)="pings.push($event)" />
    <p vMark>outer</p>
  `,
})
class Host implements AfterViewInit {
  // ngAfterViewInit で button に addEventListener('click', ...) を直接付ける
}

const f = TestBed.createComponent(Host);
await f.whenStable();
const btn = f.debugElement.query(By.css('button'));
btn.triggerEventHandler('click');        // (click) と addEventListener のどちらが呼ばれるか
btn.nativeElement.click();               // 本物のイベントなら
f.debugElement.query(By.directive(Child)).triggerEventHandler('ping', 'fromTrigger');
f.debugElement.queryAll(By.directive(LocalService));   // providers のトークンでも一致するか
```

| やったこと | テンプレートの (click) | addEventListener したもの | $event |
| --- | --- | --- | --- |
| `triggerEventHandler('click')` | 呼ばれた | 呼ばれない | `undefined` |
| `triggerEventHandler('click', {fake: true})` | 呼ばれた | 呼ばれない | 渡した `Object` |
| `nativeElement.click()` | 呼ばれた | 呼ばれた | `PointerEvent` |
| 子のホストで `triggerEventHandler('ping', 'fromTrigger')` | ホストのテンプレートの `(ping)` が `'fromTrigger'` で呼ばれた（子の output は emit されていない） | `'fromTrigger'` |   |

4 行目は意外かもしれません。`<v-child (ping)="...">` のように要素の上で書いたリスナーは、output の名前であっても、**まず同じ名前の DOM のリスナーとして登録され**、そのあとで output も購読されます（[(click) からの経路](../zoneless/08-zoneless-listener-path.md)で読む `listenerInternal`）。`triggerEventHandler` が呼ぶのはこの DOM 側の記録なので、子の `output.emit()` を通らずにホストのハンドラだけが走ります。子が本当に emit するかを確かめたいなら、子のインスタンスの output を使うか（ng test で `ping.emit('fromEmit')` も同じハンドラに届いた）、子のボタンを本当にクリックします。

> **🧪 DEMO — ページの上で getDebugNode と By を使う**
>
> 下の箱は `TdeBox` というコンポーネントで、ボタンにテンプレートの `(click)` と、`addEventListener` で直接付けたリスナーの 2 つがあります。`getDebugNode`（`@angular/core`）と `By.css`（`@angular/platform-browser`）は公開 API なので、テストの外でもそのまま動きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/testing-debug-element)

## ここまでの呼び出し

- 👤 `fixture.debugElement.query(By.css('button')).triggerEventHandler('click')` — あなたの spec
  - `getDebugNode(rootEl)` — debug\_node.ts L724 — *fixture のコンストラクタで。節に \_\_ng\_debug\_\_ として貼る*
  - `queryAll(By.css('button'))` → `_queryAll` — debug\_node.ts L328 / L444
    - `_queryNodeChildren(tNode, lView, ...)` — debug\_node.ts L479 — *TNode の木 → 子コンポーネントのビュー → DOM の子孫*
      - `predicate(debugEl)` = `element.matches('button')` — by.ts L62
  - `triggerEventHandler('click', eventObj)` — debug\_node.ts L355
    - `this.listeners` → `getListeners(el)` — discovery\_utils.ts L437 — *cleanup の配列から type === 'dom' のもの*
    - `callback.call(node, eventObj)` — debug\_node.ts L362 — *wrapListener の包み → markViewDirty → あなたのハンドラ*

## テストと直し方

📄 `angular/packages/core/test/debug/debug_node_spec.ts` L885–905 （▶ の行: 889, 900–901, 903–904）

```ts
885 │   it('should list event listeners', () => {
886 │     fixture = TestBed.createComponent(EventsComp);
887 │     fixture.detectChanges();
888 │ 
889 ▶     expect(fixture.debugElement.children[0].listeners.length).toEqual(1);
890 │     expect(fixture.debugElement.children[1].listeners.length).toEqual(1);
891 │   });
892 │ 
893 │   it('should trigger event handlers', () => {
894 │     fixture = TestBed.createComponent(EventsComp);
895 │     fixture.detectChanges();
896 │ 
897 │     expect(fixture.componentInstance.clicked).toBe(false);
898 │     expect(fixture.componentInstance.customed).toBe(false);
899 │ 
900 ▶     fixture.debugElement.children[0].triggerEventHandler('click', <Event>{});
901 ▶     expect(fixture.componentInstance.clicked).toBe(true);
902 │ 
903 ▶     fixture.debugElement.children[1].triggerEventHandler('myevent', <Event>{});
904 ▶     expect(fixture.componentInstance.customed).toBe(true);
905 │   });
```

📄 `angular/packages/core/test/debug/debug_node_spec.ts` L1406–1433 （▶ の行: 1406, 1423, 1431–1432）

```ts
1406 ▶   it('does not call event listeners added outside angular context', () => {
1407 │     let listenerCalled = false;
1408 │     const eventToTrigger = createMouseEvent('mouseenter');
1409 │     function listener() {
1410 │       listenerCalled = true;
1411 │     }
1412 │     @Component({
1413 │       template: '',
1414 │       standalone: false,
1415 │     })
1416 │     class MyComp {
1417 │       constructor(
1418 │         private readonly zone: NgZone,
1419 │         private readonly element: ElementRef,
1420 │       ) {}
1421 │       ngOnInit() {
1422 │         this.zone.runOutsideAngular(() => {
1423 ▶           this.element.nativeElement.addEventListener('mouseenter', listener);
1424 │         });
1425 │       }
1426 │     }
1427 │     const fixture = TestBed.configureTestingModule({declarations: [MyComp]}).createComponent(
1428 │       MyComp,
1429 │     );
1430 │     fixture.detectChanges();
1431 ▶     fixture.debugElement.triggerEventHandler('mouseenter', eventToTrigger);
1432 ▶     expect(listenerCalled).toBe(false);
1433 │   });
```

どちらも `packages/core/test/debug/debug_node_spec.ts` の一番外側の `describe('debug element')`（:315）の中です。900〜904 行目は `(click)` と独自イベントの `(myevent)` のハンドラが呼ばれること、1423 行目と 1431〜1432 行目は「`addEventListener` で付けたリスナーは呼ばれない」ことを確かめています。同じ describe に `should query child elements by css`（:471）・`by directive`（:481）、`describe('properties')`（:907）、`DebugElement.queryAll should pick up both elements inserted via the view and through Renderer2`（:828、4 節の 521 行目）などがあります。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test:test --test_arg=--filter="debug element" --test_output=all
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
Ran 16 of 1350 specs
16 specs, 0 failures
Ran 17 of 1351 specs
17 specs, 0 failures
Ran 17 of 1351 specs
17 specs, 0 failures
Ran 17 of 1351 specs
17 specs, 0 failures
INFO: Elapsed time: 2.660s, Critical Path: 1.98s
//packages/core/test:test                                                PASSED in 1.9s
```

1. **名前の作り方と Ran の合計**

   `debug_node_spec.ts` は `packages/core/test/debug/` にありますが、このディレクトリには `BUILD.bazel` が無いので `//packages/core/test:test` に入っています （`acceptance/` は別ターゲットで 0 本になる、という話は [第 6 回](06-testing-component-bindings.md)）。`"debug element"` で 16 + 17 + 17 + 17 = **67 本**。`describe('debug element')` の中の `it` の数と同じです。
2. **直すとしたら**

   `DebugElement` の getter と `query` / `triggerEventHandler` は `debug_node.ts`、リスナーとトークンの集め方は `discovery_utils.ts` の `getListeners` / `getInjectionTokens`、述語は `by.ts` です。spec は `describe('debug element')` に足します。`By` の spec は platform-browser 側にあります。
3. **issue を読むときの手がかり**

   「`triggerEventHandler` でハンドラが呼ばれない」は、まずそのリスナーがテンプレートや `host` ではなく `addEventListener` などで付けられていないかを確かめます（5 節。cleanup の配列に載らない）。「`By.directive` がサービスにも一致した」は 4 節の 162〜163 行目の範囲で説明がつきます（[第 20 回](20-testing-issues.md)）。

## 聞かれそうな質問

**Q. nativeElement.querySelector と debugElement.query の違いは？**

`querySelector` は DOM の木を CSS セレクタで探して DOM 要素を返します。`debugElement.query` は `TNode` の木（debug\_node.ts 490〜534 行目）を、子コンポーネントのビュー（494〜507 行目）やコンテナの中（525〜533 行目）まで歩き、最後に DOM の子孫も見て（521 行目）、`DebugElement` を返します。述語は CSS だけでなく `By.directive`（コンポーネント・ディレクティブ・providers のトークン）も使えます。CSS で探すだけなら結果の要素は同じで、ng test でも `.inner` はどちらでも 1 つでした。`DebugElement` が欲しい（`injector` や `componentInstance` を読みたい）ときに `query` を使います。

**Q. triggerEventHandler は本物のイベントですか？**

違います。debug\_node.ts 359〜365 行目で、Angular が cleanup に記録したリスナーの関数を直接呼ぶだけです。`dispatchEvent` はしないので、バブリング（親への伝わり）も既定の動作も起きず、`addEventListener` で付けたリスナーも呼ばれません（ng test と spec の 1431〜1432 行目）。`$event` は渡した `eventObj` そのもので、省略すれば `undefined` です。本物に近づけたいときは `nativeElement.click()` や `dispatchEvent(new Event(...))` を使います。

**Q. 本番ビルドでも動きますか？**

`getDebugNode`（724〜735 行目）にも `DebugElement` の getter にも `ngDevMode` の分岐は無く、読んでいるのは本番でも作られる `LView`・`TNode`・cleanup の配列です。この章のデモは、このサイトの本番ビルドのページの上で `getDebugNode` と `By.css` を呼んでいます。ただし `DebugElement` のコンストラクタにある `ngDevMode && assertDomNode(...)` のような開発モードだけの確認は、本番では走りません。

**Q. By.directive に、コンポーネントの providers のサービスを渡すと一致しますか？**

一致します。`By.directive` は `providerTokens`（by.ts 55 行目）を見ていて、その範囲は discovery\_utils.ts 162〜163 行目の「providers の始まりからディレクティブの終わりまで」だからです。ng test で `queryAll(By.directive(LocalService))` は、`providers: [LocalService]` を持つ `<v-child>` を返しました。

**Q. fixture.debugElement.children と queryAll(By.all()) は何が違いますか？**

`children` は DOM の直接の子要素（`nativeElement.children`）を `getDebugNode` したものです。`queryAll(By.all())` は 4 節の歩き方で、子コンポーネントの中も含む全部の要素です（起点は除く）。ng test のホストでは、`children` は `button`・`v-child`・`p` の 3 つ、`queryAll(By.all())` は子の `span` と足した `i` を含む 5 つ、`queryAllNodes(By.all())` はテキストなどの節も含めて 8 つでした。

## 読み終えて

- `getDebugNode` は DOM の節に `__ng_debug__` として 1 つだけ作って貼る。同じ節には同じ `DebugElement`
- `DebugElement` は `nativeNode` しか持たず、`injector`・`componentInstance`・`properties` は呼ぶたびに `LView` から読む。`styles`・`classes` は DOM だけ
- `query` は `TNode` の木 → 子コンポーネントのビュー → コンテナ → DOM の子孫の順に歩く。起点は結果に入らない
- `By.directive` は `providerTokens` を見るので、providers のトークンにも一致する
- `triggerEventHandler` は cleanup に記録されたリスナーを直接呼ぶ。DOM のイベントは出ず、`addEventListener` のリスナーは呼ばれない

---

← 前: [createDirective と DirectiveFixture：ディレクティブだけをテストする](07-testing-directive-fixture.md)  
次: [fixture.detectChanges：zoneless では appRef.tick、zone では detectChanges](09-testing-detect-changes.md) →
