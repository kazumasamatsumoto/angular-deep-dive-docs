[目次](../README.md) › [core の説明文の読み残し（2）](README.md) › 第 8 回 / 全 10 回

# DebugElement と DebugNode の説明文

> debug/debug\_node.ts の未読の行：nativeElement・componentInstance・injector・listeners・triggerEventHandler・query と queryAll の約束、By の述語。本物の TestBed なしで getDebugNode を使って確かめる。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cra-debug)

---

この章で分かること：`debug/debug_node.ts` の `DebugNode`・`DebugElement` の説明文が約束する `nativeElement`・`name`・`componentInstance`・`context`・`references`・`listeners`・`properties`・`triggerEventHandler`・`query` 系を、TestBed を使わず `getDebugNode` を当てて、このページ（本番）と開発モードの記録で並べます。食い違いは 4 つです。`context` の説明が `*ngFor` と `NgForOf` のままであること、`name` が動的に作ったコンポーネントの根では `'#host'` になること、`listeners` の中身が `DebugEventListener` の実例ではないこと、`properties` のバインディングの値が本番では DOM の値（型が変わる）になることです。

読む対象は `packages/core/src/debug/debug_node.ts` のまだ引いていない行（../angular、8576f161ae4）です。`getDebugNode` の作り・`properties` と `attributes` の集め方・`query` が TNode の木を歩く順・`triggerEventHandler` の中身は[DebugElement と By の章](../testing/08-testing-debug-element.md)が引いているので、ここでは繰り返さず、説明文の約束と、開発モードと本番の差を見ます。

1. [1. ApplicationRef](01-cra-app-ref.md)
2. [2. platform と bootstrap](02-cra-platform.md)
3. [3. ViewContainerRef](03-cra-view-container.md)
4. [4. QueryList・DestroyRef](04-cra-linker-misc.md)
5. [5. input・model・output](05-cra-signal-io.md)
6. [6. signal のクエリ](06-cra-signal-queries.md)
7. [7. NgZone・ErrorHandler](07-cra-zone-errors.md)
8. **8. DebugElement**（この章）
9. [9. サニタイズ](09-cra-sanitize.md)
10. [10. spec と issue](10-cra-tests-issues.md)

DEMO の 3 つのボタンは、どれも次のテンプレートのコンポーネントを `createComponent` で作り（文書に付けない div の上）、`getDebugNode(host)` から読みます。

📄 `DEMO のコンポーネント（crad-host）のテンプレート`

```
<crad-child #childRef label="子" (picked)="log.push('picked ' + $event)" (pickedOld)="log.push('pickedOld ' + $event)" />
<button #btn type="button" class="crad-btn" title="t" (click)="clicks = clicks + 1; lastEvent = $event">b</button>
<input #inp class="crad-inp" [value]="5" />
<input class="crad-inp2" cradNum />
@for (item of items; track item) {
  <span class="crad-item">{{ item }}</span>
}
<p>テキストの節</p>
<!-- crad-child のテンプレート: <em class="crad-inner">{{ label() }}</em>、host: {'(click)': …} -->
<!-- cradNum: host: {'[value]': '7'} -->
```

## 1. DebugElement の頭：nativeElement と name

📄 `angular/packages/core/src/debug/debug_node.ts` L129–163 （▶ の行: 130, 132, 136, 138, 143, 145–146, 150, 152, 156, 159, 161）

```ts
129 │ /**
130 ▶  * @publicApi
131 │  *
132 ▶  * @see [Component testing scenarios](guide/testing/components-scenarios)
133 │  * @see [Basics of testing components](guide/testing/components-basics)
134 │  * @see [Testing utility APIs](guide/testing/utility-apis)
135 │  */
136 ▶ export class DebugElement extends DebugNode {
137 │   constructor(nativeNode: Element) {
138 ▶     ngDevMode && assertDomNode(nativeNode);
139 │     super(nativeNode);
140 │   }
141 │ 
142 │   /**
143 ▶    * The underlying DOM element at the root of the component.
144 │    */
145 ▶   get nativeElement(): any {
146 ▶     return this.nativeNode.nodeType == Node.ELEMENT_NODE ? (this.nativeNode as Element) : null;
147 │   }
148 │ 
149 │   /**
150 ▶    * The element tag name, if it is an element.
151 │    */
152 ▶   get name(): string {
153 │     const context = getLContext(this.nativeNode)!;
154 │     const lView = context ? context.lView : null;
155 │ 
156 ▶     if (lView !== null) {
157 │       const tData = lView[TVIEW].data;
158 │       const tNode = tData[context.nodeIndex] as TNode;
159 ▶       return tNode.value!;
160 │     } else {
161 ▶       return this.nativeNode.nodeName;
162 │     }
163 │   }
```

143 行目「コンポーネントの根の DOM 要素」は言い過ぎで、146 行目は要素の節ならいつでもその要素を返します。DEMO の `btn.nativeElement` はただの `<button>` です。138 行目の `assertDomNode` は開発モードだけです。

150 行目「要素ならタグ名」は、Angular が作った要素では 159 行目の `tNode.value` を返します。テンプレートに書いた要素はタグ名（`child.name` は `'crad-child'`）ですが、`createComponent` で作ったコンポーネントの根は、開発モードでも本番でも `'#host'` でした。根の TNode はテンプレートに書かれていないので、タグ名の代わりに印の名前が入っているからです（根の TNode の作り方は[createComponent の入口の章](../dyn/01-dyn-entry-points.md)）。同じことが bootstrap した根やルーターが作ったコンポーネントでも起き、issue #71459（`HOST_TAG_NAME and DebugElement.name return '#host' …`）として開いています。Angular の外の `div` は 161 行目の `nodeName` で `'DIV'`（大文字）です。

## 2. context：説明は \*ngFor のまま

📄 `angular/packages/core/src/debug/debug_node.ts` L92–103 （▶ の行: 93–94, 96–98, 101）

```ts
 92 │   /**
 93 ▶    * An object that provides parent context for this element. Often an ancestor component instance
 94 ▶    * that governs this element.
 95 │    *
 96 ▶    * When an element is repeated within *ngFor, the context is an `NgForOf` whose `$implicit`
 97 ▶    * property is the value of the row instance value. For example, the `hero` in `*ngFor="let hero
 98 ▶    * of heroes"`.
 99 │    */
100 │   get context(): any {
101 ▶     return getComponent(this.nativeNode as Element) || getContext(this.nativeNode as Element);
102 │   }
103 │ 
```

101 行目は、その要素がコンポーネントのホストならそのコンポーネント、そうでなければ `getContext`（render3/util/discovery\_utils.ts L84〜88）で、要素を持つ LView の `CONTEXT` を返します。93〜94 行目のとおり、ふつうの `<button>` の `context` は持ち主の `CraDbgHost` でした。

96〜98 行目は「`*ngFor` の中なら `NgForOf`（の文脈）で、`$implicit` が行の値」と書きます。`@for` の中の `<span>` の `context` は、`$implicit='x'・$index=0` を持つ、`lContainer`・`$implicit`・`$index` の 3 つの鍵の object で、`NgForOf` の文脈ではありません（`@for` の埋め込みビューの文脈、[@for と track の章](../template/01-for-track.md)）。`$implicit` の約束は今も成り立ち、例が古いだけです。spec の `should return structural directive context if there is a structural directive on the node`（debug\_node\_spec.ts L1147）も `*ngIf` の `NgIfContext` を見ています。

## 3. DebugEventListener と listeners

📄 `angular/packages/core/src/debug/debug_node.ts` L37–56 （▶ の行: 38, 40, 42–43, 45, 50–51）

```ts
37 │ /**
38 ▶  * @publicApi
39 │  */
40 ▶ export class DebugEventListener {
41 │   constructor(
42 ▶     public name: string,
43 ▶     public callback: Function,
44 │   ) {}
45 ▶ }
46 │ 
47 │ /**
48 │  * @publicApi
49 │  */
50 ▶ export function asNativeElements(debugEls: DebugElement[]): any {
51 ▶   return debugEls.map((el) => el.nativeElement);
52 │ }
53 │ 
54 │ /**
55 │  * @publicApi
56 │  */
```

40〜45 行目の `DebugEventListener` は `name` と `callback` を持つ公開のクラスで、`listeners` の型（L108 の `DebugEventListener[]`）に使われます。ところが `listeners` は `getListeners(...)` の結果を `filter` するだけ（L109）で、返るのは `{name, element, callback, useCapture, type}` の素の object です。DEMO で `btn.listeners[0]` の prototype は `Object.prototype` そのもの（`DebugEventListener.prototype` ではない）で、鍵は `element・name・callback・useCapture・type` でした（デモは初めの chunk を増やさないよう `DebugEventListener` を import せず、prototype で比べている）。型が構造で比べられるので TypeScript は何も言いませんが、`instanceof` で見分けるコードは動きません。

L105〜106「`@Output` のコールバックと、要素のイベント」のとおり、`<crad-child>` の `listeners` には、host の `(click)`・`output()` の `picked`・`@Output` の `pickedOld` の 3 つが入りました。`child.triggerEventHandler('picked', 'p1')` は親の `(picked)` を呼び、本物の `emit` と同じ記録が残ります。50〜51 行目の `asNativeElements` は `nativeElement` を並べ直すだけです。

## 4. properties：本番ではバインディングの値を持たない

📄 `angular/packages/core/src/debug/debug_node.ts` L684–714 （▶ の行: 685–687, 695, 697, 700, 702–703, 708, 710–711）

```ts
684 │ /**
685 ▶  * Iterates through the property bindings for a given node and generates
686 ▶  * a map of property names to values. This map only contains property bindings
687 ▶  * defined in templates, not in host bindings.
688 │  */
689 │ function collectPropertyBindings(
690 │   properties: {[key: string]: string},
691 │   tNode: TNode,
692 │   lView: LView,
693 │   tData: TData,
694 │ ): void {
695 ▶   let bindingIndexes = tNode.propertyBindings;
696 │ 
697 ▶   if (bindingIndexes !== null) {
698 │     for (let i = 0; i < bindingIndexes.length; i++) {
699 │       const bindingIndex = bindingIndexes[i];
700 ▶       const propMetadata = tData[bindingIndex] as string;
701 │       const metadataParts = propMetadata.split(INTERPOLATION_DELIMITER);
702 ▶       const propertyName = metadataParts[0];
703 ▶       if (metadataParts.length > 1) {
704 │         let value = metadataParts[1];
705 │         for (let j = 1; j < metadataParts.length - 1; j++) {
706 │           value += renderStringify(lView[bindingIndex + j - 1]) + metadataParts[j + 1];
707 │         }
708 ▶         properties[propertyName] = value;
709 │       } else {
710 ▶         properties[propertyName] = lView[bindingIndex];
711 ▶       }
712 │     }
713 │   }
714 │ }
```

`properties` の説明（L165〜175、[DebugElement と By の章](../testing/08-testing-debug-element.md)が引いている）は、L169「`[id]="id"` の形のバインディング」と L170「host のバインディング」を含むと約束します。DOM のプロパティを写したあと、695〜711 行目でテンプレートのバインディングの値を LView から上書きします。DEMO の `<input [value]="5">` と、host で `[value]` に 7 を入れるディレクティブで比べました。

| 読んだもの | 開発モード（記録） | 本番（このページと記録） |
| --- | --- | --- |
| `inp.properties['value']`（`[value]="5"`） | `number 5` | `string 5` |
| `inp2.properties['value']`（host の `[value]`） | `number 7` | `string 7` |

695 行目の `tNode.propertyBindings` と 700 行目の `tData[bindingIndex]` の名前は、`storePropertyBindingMetadata` が入れるもので、その呼び出しは `ngDevMode && storePropertyBindingMetadata(…)`（render3/instructions/dom\_property.ts L44 ほか）と開発モードだけです。本番では 697 行目の `bindingIndexes` が `null` で上書きが起きず、DOM の `input.value`（いつも文字列）が残ります。spec の `should preserve the type of the property values`（L927）は開発モードで走るので、この差を見ません。テストは開発モードで走らせるのがふつうなので困ることは少ないですが、本番のビルドで `getDebugNode` を使う道具を作ると値の型が変わります。

685〜687 行目のコメント「host のバインディングは入らない」は、開発モードの記録で host の `[value]` が `number 7` と入ったことと合いません（host のバインディングの名前も同じ `tNode.propertyBindings` に入るため）。こちらは公開の説明文ではなく、L170 の約束の方が実物と合っています。

## 5. references・children・attributes の頭

📄 `angular/packages/core/src/debug/debug_node.ts` L287–316 （▶ の行: 288, 290, 292, 297, 303, 305, 307, 312, 315）

```ts
287 │   /**
288 ▶    * The `childNodes` of the DOM element as a `DebugNode` array.
289 │    *
290 ▶    * @see [Node.childNodes](https://developer.mozilla.org/en-US/docs/Web/API/Node/childNodes)
291 │    */
292 ▶   get childNodes(): DebugNode[] {
293 │     const childNodes = this.nativeNode.childNodes;
294 │     const children: DebugNode[] = [];
295 │     for (let i = 0; i < childNodes.length; i++) {
296 │       const element = childNodes[i];
297 ▶       children.push(getDebugNode(element)!);
298 │     }
299 │     return children;
300 │   }
301 │ 
302 │   /**
303 ▶    * The immediate `DebugElement` children. Walk the tree by descending through `children`.
304 │    */
305 ▶   get children(): DebugElement[] {
306 │     const nativeElement = this.nativeElement;
307 ▶     if (!nativeElement) return [];
308 │     const childNodes = nativeElement.children;
309 │     const children: DebugElement[] = [];
310 │     for (let i = 0; i < childNodes.length; i++) {
311 │       const element = childNodes[i];
312 ▶       children.push(getDebugNode(element) as DebugElement);
313 │     }
314 │     return children;
315 ▶   }
316 │ 
```

📄 `angular/packages/core/src/debug/debug_node.ts` L197–215 （▶ の行: 198, 200, 205–206, 212–213）

```ts
197 │   /**
198 ▶    *  A map of attribute names to attribute values for an element.
199 │    */
200 ▶   // TODO: replace null by undefined in the return type
201 │   get attributes(): {[key: string]: string | null} {
202 │     const attributes: {[key: string]: string | null} = {};
203 │     const element = this.nativeElement as Element | undefined;
204 │ 
205 ▶     if (!element) {
206 ▶       return attributes;
207 │     }
208 │ 
209 │     const context = getLContext(element)!;
210 │     const lView = context ? context.lView : null;
211 │ 
212 ▶     if (lView === null) {
213 ▶       return {};
214 │     }
215 │ 
```

L113〜114 の `references`「`#foo` の名前で引ける」は、その要素に書いた参照だけです。`btn.references` は `{btn: <button>}`、`child.references` は `{childRef: CraDbgChild の実例}`（コンポーネントの上の参照はその実例）で、根の要素は空でした。288〜315 行目の `childNodes` と `children` は DOM の子をそのまま `getDebugNode` に通すので、テンプレートの境目を気にせず DOM の形のままです（DEMO では 7 と 8）。200 行目の TODO のとおり、`attributes` は値の型にまだ `null` を残しています。

## 6. query と By、投影と @for の中

📄 `angular/packages/core/src/debug/debug_node.ts` L535–574 （▶ の行: 535, 538–539, 541–542, 545, 547, 551, 553, 556, 558–560, 562, 566, 569）

```ts
535 ▶   } else if (tNode.type & TNodeType.Container) {
536 │     // Case 2: the TNode is a container
537 │     // The native node has to be checked.
538 ▶     const lContainer = lView[tNode.index];
539 ▶     _addQueryMatch(lContainer[NATIVE], predicate, matches, elementsOnly, rootNativeNode);
540 │     // Each view inside the container has to be processed.
541 ▶     _queryNodeChildrenInContainer(lContainer, predicate, matches, elementsOnly, rootNativeNode);
542 ▶   } else if (tNode.type & TNodeType.Projection) {
543 │     // Case 3: the TNode is a projection insertion point (i.e. a <ng-content>).
544 │     // The nodes projected at this location all need to be processed.
545 ▶     const componentView = lView![DECLARATION_COMPONENT_VIEW];
546 │     const componentHost = componentView[T_HOST] as TElementNode;
547 ▶     const head: TNode | null = (componentHost.projection as (TNode | null)[])[
548 │       tNode.projection as number
549 │     ];
550 │ 
551 ▶     if (Array.isArray(head)) {
552 │       for (let nativeNode of head) {
553 ▶         _addQueryMatch(nativeNode, predicate, matches, elementsOnly, rootNativeNode);
554 │       }
555 │     } else if (head) {
556 ▶       const nextLView = componentView[PARENT]! as LView;
557 │       const nextTNode = nextLView[TVIEW].data[head.index] as TNode;
558 ▶       _queryNodeChildren(nextTNode, nextLView, predicate, matches, elementsOnly, rootNativeNode);
559 ▶     }
560 ▶   } else if (tNode.child) {
561 │     // Case 4: the TNode is a view.
562 ▶     _queryNodeChildren(tNode.child, lView, predicate, matches, elementsOnly, rootNativeNode);
563 │   }
564 │ 
565 │   // We don't want to go to the next sibling of the root node.
566 ▶   if (rootNativeNode !== nativeNode) {
567 │     // To determine the next node to be processed, we need to use the next or the projectionNext
568 │     // link, depending on whether the current node has been projected.
569 ▶     const nextTNode = tNode.flags & TNodeFlags.isProjected ? tNode.projectionNext : tNode.next;
570 │     if (nextTNode) {
571 │       _queryNodeChildren(nextTNode, lView, predicate, matches, elementsOnly, rootNativeNode);
572 │     }
573 │   }
574 │ }
```

L318・L326・L335 の 3 つの約束（最初の 1 つ・すべての要素・すべての節）を、By の 3 つの述語で確かめました（By は @angular/platform-browser、[DebugElement と By の章](../testing/08-testing-debug-element.md)）。

- `queryAll(By.all())` は要素 9、`queryAllNodes(By.all())` は 15（要素 9・テキストやコメント 6）でした。`@for` のコンテナは 535〜541 行目でコメントの節を足してから中のビューを歩くので、コメントも数に入ります。
- `@for` の中の 2 つの `span` と、`appendChild` で足した `<i class="crad-item">` の 3 つが `By.css('.crad-item')` で見つかり、子コンポーネントのテンプレートの中の `.crad-inner` も 1 つ見つかりました。
- 一致が無いときの `query` は `null` です。型は `DebugElement`（L320）と書かれていますが、L322 の `results[0] || null` のとおりです（strict の型の上では `null` を返さない書き方）。
- 542〜559 行目の投影（`<ng-content>`）は、投影された節を、投影した側の LView に戻って歩きます。

## 7. 開発モードだけのものと、main で消えた索引

📄 `angular/packages/core/src/debug/debug_node.ts` L736–756 （▶ の行: 736–738, 741–742, 745–747, 749–750, 753, 755）

```ts
736 ▶ 
737 ▶ export function getAllDebugNodes(): DebugNode[] {
738 ▶   return Array.from(_nativeNodeToDebugNode.values());
739 │ }
740 │ 
741 ▶ export function indexDebugNode(node: DebugNode) {
742 ▶   _nativeNodeToDebugNode.set(node.nativeNode, node);
743 │ }
744 │ 
745 ▶ export function removeDebugNodeFromIndex(node: DebugNode) {
746 ▶   _nativeNodeToDebugNode.delete(node.nativeNode);
747 ▶ }
748 │ 
749 ▶ /**
750 ▶  * A boolean-valued function over a value, possibly including context information
751 │  * regarding that value's position in an array.
752 │  *
753 ▶  * @publicApi
754 │  */
755 ▶ export type Predicate<T> = (value: T) => boolean;
756 │ 
```

`getDebugNode` 自身には `ngDevMode` の分岐が無く（L719〜734）、このページ（本番）でも開発モードの記録でも、同じ節には同じ `DebugElement`（`===`）が返りました。本番で変わるのは、4 節の `properties` と、138 行目の `assertDomNode` と、ブラウザーの開発者ツールの `ng.getComponent` ほか（`typeof globalThis.ng?.getComponent` は開発モードの記録で `'function'`、このページで `'undefined'`）です。開発者ツールの道具は[DI のデバッグの章](../di/16-di-debug.md)が読んでいます。

736〜747 行目の `_nativeNodeToDebugNode` の Map と `getAllDebugNodes`・`indexDebugNode`・`removeDebugNodeFromIndex` は、どこからも `indexDebugNode` が呼ばれず（`grep -rn indexDebugNode packages/core/src` はこのファイルだけ）、いつも空です。main では b493d767a4b（2026-11-01、`refactor(core): remove unused internal code`）がこの 15 行を消し、22.2.6 にも入っています。749〜755 行目の `Predicate<T>` の説明「配列の中の位置の情報も含むかもしれない」も、実際の型は値 1 つを受ける関数です。

> **🧪 DEMO — getDebugNode を本物のコンポーネントに当てる（このページ・本番と、開発モード・本番の記録）**
>
> 押すと、上のテンプレートのコンポーネントを本物の `@angular/core`（22.2.6）で `createComponent` し（文書に付けない div の上。ApplicationRef には付けない）、`detectChanges` のあと `getDebugNode` と `By` で読み、destroy します。「記録」の 2 列は同じ関数を Node（domino の上の JIT）で開発モードと本番で走らせた手元の記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cra-debug)

## triggerEventHandler の約束を並べる

L344〜345「`listeners` に同じ名前があれば呼ぶ」と L347〜348「無ければ `dispatchEvent` を」を、DEMO の「triggerEventHandler」で確かめました。

1. **triggerEventHandler('click', obj)**

   リスナーが渡した obj を `$event` として呼ばれ、`clicks` が 1 になりました。DOM のイベントは出ていません。
2. **eventObj を渡さない**

   `$event` は `undefined` です。テンプレートが `$event.target` を読むなら、渡さないと落ちます。
3. **リスナーの無い 'dblclick'**

   何も起きず、例外もありません。L347〜348 の注意のとおり、呼ばれないことは自分で確かめる必要があります。
4. **dispatchEvent(new Event('click'))**

   本物の DOM のイベントで、`$event` は `Event` でした。

## ここまでの呼び出し

- 👤 `getDebugNode(host).query(By.css('.crad-inp')).properties`
  - `copyDomProperties(element, properties)` — debug\_node.ts L392〜413 — *DOM のプロパティ（文字列）*
  - `collectPropertyBindings(properties, tNode, lView, tData)` — debug\_node.ts L689〜714
    - `tNode.propertyBindings` — L695 — *開発モードだけ storePropertyBindingMetadata が入れる。本番は null*
- 👤 `child.triggerEventHandler('picked', 'p1')`
  - `this.listeners` → `getListeners(el).filter(type === 'dom')` — L108〜110 — *素の object。DebugEventListener の実例ではない*

## テストと直し方

| ファイル（packages/core/test/debug/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `debug_node_spec.ts` | `debug element › properties › should preserve the type of the property values`（927） | 4 節。開発モードだけ |
| 同 | `context on DebugNode › should return structural directive context if there is a structural directive on the node`（1147） | 2 節（\*ngIf の形） |
| 同 | `should list event listeners`（885）・`should trigger event handlers`（893） | 3 節・triggerEventHandler |
| 同 | `should match node name with declared casing`（1384）・`should not error when accessing node name`（1363） | 1 節の name（'#host' の it は無い） |
| 同 | `componentInstance on DebugNode`（1077） | componentInstance |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all "--test_arg=--filter=<下の名前>"
```

📄 `--filter ごとの結果（2026-11-22、手元の記録）`

```
# //packages/core/test:test は shard_count = 4。4 つの shard の数を足した
--filter=^debug element                         67 specs（17+17+17+16）、0 failures
--filter=^debug element properties               7 specs、0 failures
--filter=^debug element context on DebugNode     3 specs、0 failures
```

直すとしたら説明文の 3 か所です。debug\_node.ts の 96〜98 行目は `@for` の文脈（`$implicit`・`$index`）を例にし、143 行目は「この節が要素ならその要素」に、`properties` の L165〜175 には「バインディングの値は開発モードだけ。本番では DOM のプロパティ」と足します。`listeners` を説明どおりにするなら、L109 の結果を `new DebugEventListener(l.name, l.callback)` で包むことになり、spec は「`listeners[0] instanceof DebugEventListener`」の it を足します。`name` の `'#host'` は issue #71459 で扱われています。

## 聞かれそうな質問

**Q. 本番のビルドでも `getDebugNode` は使えますか？**

使えます。関数自身に開発モードの分岐は無く、このページで同じ `DebugElement` が返りました。ただし `properties` のバインディングの値は本番では入らず、DOM の値（`input.value` なら文字列）になります（4 節）。

**Q. `DebugElement.name` がタグ名でなく `'#host'` になるのはいつですか？**

テンプレートに書かれていない根の要素、つまり `createComponent`・bootstrap・ルーターで作ったコンポーネントのホストです（159 行目が根の TNode の値を返す）。テンプレートの中の要素はタグ名です。

**Q. `@for` の中の要素の `context` は何ですか？**

`$implicit`（行の値）と `$index` を持つ `@for` の文脈です。説明文（96〜98 行目）の `NgForOf` ではありませんが、`$implicit` の約束はそのままです。

**Q. `triggerEventHandler` で `output()` の出力も呼べますか？**

呼べます。`listeners` に `output()` と `@Output` の名前も入っていて、親のテンプレートのリスナーが呼ばれました。DOM のイベントは出ないので、DOM のリスナーを確かめたいときは `dispatchEvent` です。

## 読み終えて

- `getDebugNode` は本番でも動くが、`properties` のバインディングの値は開発モードだけ。
- `name` は TNode の値で、動的に作った根では `'#host'`。
- `context` の説明は `*ngFor` のまま。`@for` でも `$implicit` は行の値。
- `listeners` の中身は `DebugEventListener` の実例ではない素の object。
- 使われない索引（`getAllDebugNodes` ほか）は main で消えた。

---

← 前: [NgZone・ErrorHandler・EventEmitter・PendingTasks の説明文](07-cra-zone-errors.md)  
次: [サニタイズの公開 API の説明文：DomSanitizer の約束と SecurityContext](09-cra-sanitize.md) →
