[目次](../README.md) › [core の説明文の読み残し（2）](README.md) › 第 3 回 / 全 10 回

# ViewContainerRef・TemplateRef・ViewRef・ElementRef の説明文

> linker/view\_container\_ref.ts・template\_ref.ts・view\_ref.ts・element\_ref.ts の未読の行：createEmbeddedView と createComponent の options、insert・move・detach・indexOf の添字の約束、ElementRef の注意書き。本物の ViewContainerRef で例を動かす。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cra-view-container)

---

この章で分かること：`ViewContainerRef` の `createEmbeddedView`・`createComponent` の options、`insert`・`move`・`detach`・`indexOf`・`remove` の添字、`TemplateRef`・`ViewRef`・`EmbeddedViewRef`・`ElementRef` の説明文が約束していることと、それが本物でそのとおりに動くか。結果として、説明文の書き出しの例の文が別の関数（`createComponent` 関数）の説明の写しであること、`detach` が入れたときと別の `ViewRef` を返すこと、範囲外への `move` がビューを外したまま例外になること、負の添字が本番では入れ物を壊すことが、説明文に書かれていないか、説明と合いませんでした。

読む対象は `packages/core/src/linker/` の `view_container_ref.ts`・`template_ref.ts`・`view_ref.ts`・`element_ref.ts` の説明文と、まだ読んでいない実装の行です（../angular、8576f161ae4）。入れ物の中身（`LContainer`）は[あとからビューを差し込む場所の章](../template/04-view-container.md)、`createComponent` の注入器の既定と添字の確かめは[ViewContainerRef.createComponent の章](../dyn/05-dyn-vcr-host.md)、`ViewRef` が配列への窓であることは[ViewRef は配列への窓の章](../ivy/16-ivy-refs.md)、`projectableNodes` は[動的な投影の章](../proj/05-proj-dynamic.md)にあるので、ここでは繰り返さずに行だけ指します。

1. [1. ApplicationRef](01-cra-app-ref.md)
2. [2. platform と bootstrap](02-cra-platform.md)
3. **3. ViewContainerRef**（この章）
4. [4. QueryList・DestroyRef](04-cra-linker-misc.md)
5. [5. input・model・output](05-cra-signal-io.md)
6. [6. signal のクエリ](06-cra-signal-queries.md)
7. [7. NgZone・ErrorHandler](07-cra-zone-errors.md)
8. [8. DebugElement](08-cra-debug.md)
9. [9. サニタイズ](09-cra-sanitize.md)
10. [10. spec と issue](10-cra-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> `ViewContainerRef`（VCR）は「ビューを並べて差し込める場所」です。要素か `<ng-container>` の位置に 1 つあり、そこへ `<ng-template>` から作るビュー（埋め込みビュー）や、コンポーネントのビュー（ホストビュー）を、0 から数える添字の位置に入れたり、動かしたり、外したりします。DEMO は、文書に付けない要素の上に小さなコンポーネントを 1 つ作り、その中の 2 つの VCR（`<ng-container #vc>` と `<div #anchor>`）で試します。

## 1. 書き出しの説明文と例：例の前の文は別の関数の写し

📄 `angular/packages/core/src/linker/view_container_ref.ts` L86–104 （▶ の行: 87, 89–91, 93–94, 98–100）

```ts
 86 │ /**
 87 ▶  * Represents a container where one or more views can be attached to a component.
 88 │  *
 89 ▶  * Can contain *host views* (created by instantiating a
 90 ▶  * component with the `createComponent()` method), and *embedded views*
 91 ▶  * (created by instantiating a `TemplateRef` with the `createEmbeddedView()` method).
 92 │  *
 93 ▶  * A view container instance can contain other view containers,
 94 ▶  * creating a view hierarchy.
 95 │  *
 96 │  * @usageNotes
 97 │  *
 98 ▶  * The example below demonstrates how the `createComponent` function can be used
 99 ▶  * to create an instance of a ComponentRef dynamically and attach it to an ApplicationRef,
100 ▶  * so that it gets included into change detection cycles.
101 │  *
102 │  * Note: the example uses standalone components, but the function can also be used for
103 │  * non-standalone components (declared in an NgModule) as well.
104 │  *
```

📄 `angular/packages/core/src/linker/view_container_ref.ts` L105–133 （▶ の行: 111, 119, 121–123）

````ts
105 │  * ```angular-ts
106 │  * @Component({
107 │  *   selector: 'dynamic',
108 │  *   template: `<span>This is a content of a dynamic component.</span>`,
109 │  * })
110 │  * class DynamicComponent {
111 ▶  *   vcr = inject(ViewContainerRef);
112 │  * }
113 │  *
114 │  * @Component({
115 │  *   selector: 'app',
116 │  *   template: `<main>Hi! This is the main content.</main>`,
117 │  * })
118 │  * class AppComponent {
119 ▶  *   vcr = inject(ViewContainerRef);
120 │  *
121 ▶  *   ngAfterViewInit() {
122 ▶  *     const compRef = this.vcr.createComponent(DynamicComponent);
123 ▶  *     compRef.changeDetectorRef.detectChanges();
124 │  *   }
125 │  * }
126 │  * ```
127 │  *
128 │  * @see {@link ComponentRef}
129 │  * @see {@link EmbeddedViewRef}
130 │  * @see [Using ViewContainerRef](guide/components/programmatic-rendering#using-viewcontainerref)
131 │  *
132 │  * @publicApi
133 │  */
````

98〜100 行目は「下の例は、`createComponent` 関数で `ComponentRef` を作り、`ApplicationRef` に付けて変更検知に入れる方法」と書きます。ところが例は、`ApplicationRef` に何も付けず、122 行目で `this.vcr.createComponent(...)`（VCR のメソッド）を呼び、123 行目で自分で `detectChanges` しています。98〜103 行目の 2 文は、`createComponent` 関数の説明文（render3/component.ts L27〜32）と同じ文です。この例を足した 6e94e6d7ea2（2023-09-01、`docs: add viewContainerRef example (#51573)`）のときから同じで、新しい本家（origin/main の d201dd76ef2、2026-11-20）でも同じです。例そのものは strict の tsc（`strictTemplates`）に通りました（import を足しただけ）。

## 2. element・injector・get・length

📄 `angular/packages/core/src/linker/view_container_ref.ts` L134–161 （▶ の行: 136–138, 140–141, 151, 153, 155, 159）

```ts
134 │ export abstract class ViewContainerRef {
135 │   /**
136 ▶    * Anchor element that specifies the location of this container in the containing view.
137 ▶    * Each view container can have only one anchor element, and each anchor element
138 ▶    * can have only a single view container.
139 │    *
140 ▶    * Root elements of views attached to this container become siblings of the anchor element in
141 ▶    * the rendered view.
142 │    *
143 │    * Access the `ViewContainerRef` of an element by placing a `Directive` injected
144 │    * with `ViewContainerRef` on the element, or use a `ViewChild` query.
145 │    *
146 │    * <!-- TODO: rename to anchorElement -->
147 │    */
148 │   abstract get element(): ElementRef;
149 │ 
150 │   /**
151 ▶    * The dependency injector for this view container.
152 │    */
153 ▶   abstract get injector(): Injector;
154 │ 
155 ▶   /** @deprecated No replacement */
156 │   abstract get parentInjector(): Injector;
157 │ 
158 │   /**
159 ▶    * Destroys all views in this container.
160 │    */
161 │   abstract clear(): void;
```

📄 `angular/packages/core/src/linker/view_container_ref.ts` L162–181 （▶ の行: 165–166, 171–172）

```ts
162 │ 
163 │   /**
164 │    * Retrieves a view from this container.
165 ▶    * @param index The 0-based index of the view to retrieve.
166 ▶    * @returns The `ViewRef` instance, or null if the index is out of range.
167 │    */
168 │   abstract get(index: number): ViewRef | null;
169 │ 
170 │   /**
171 ▶    * Reports how many views are currently attached to this container.
172 ▶    * @returns The number of views.
173 │    */
174 │   abstract get length(): number;
175 │ 
176 │   /**
177 │    * Instantiates an embedded view and inserts it
178 │    * into this container.
179 │    * @param templateRef The HTML template that defines the view.
180 │    * @param context The data-binding context of the embedded view, as declared
181 │    * in the `<ng-template>` usage.
```

136〜141 行目「目印の要素。ビューの根の要素は目印の兄弟になる」は、`<div #anchor>` の VCR の `element` が `DIV` で、作ったコンポーネントの要素は div のすぐ後ろ（兄弟）に入りました（DEMO の 2 つ目の表）。要素の上の VCR は、要素の後ろにコメントの目印を足し、その前にビューを入れます（下の 723〜736 行目）。`<ng-container #vc>` の VCR の `element` はコメント（`nodeType` が 8）でした。

📄 `angular/packages/core/src/linker/view_container_ref.ts` L715–738 （▶ の行: 723, 725, 727–729, 733）

```ts
715 │ 
716 │ /**
717 │  * Creates and inserts a comment node that acts as an anchor for a view container.
718 │  *
719 │  * If the host is a regular element, we have to insert a comment node manually which will
720 │  * be used as an anchor when inserting elements. In this specific case we use low-level DOM
721 │  * manipulation to insert it.
722 │  */
723 ▶ function insertAnchorNode(hostLView: LView, hostTNode: TNode): RComment {
724 │   const renderer = hostLView[RENDERER];
725 ▶   const commentNode = renderer.createComment(ngDevMode ? 'container' : '');
726 │ 
727 ▶   const hostNative = getNativeByTNode(hostTNode, hostLView)!;
728 ▶   const parentOfHostNative = renderer.parentNode(hostNative);
729 ▶   nativeInsertBefore(
730 │     renderer,
731 │     parentOfHostNative!,
732 │     commentNode,
733 ▶     renderer.nextSibling(hostNative),
734 │     false,
735 │   );
736 │   return commentNode;
737 │ }
738 │ 
```

📄 `angular/packages/core/src/linker/view_container_ref.ts` L764–788 （▶ の行: 775, 782–783, 785, 787）

```ts
764 │ /**
765 │  * Regular creation mode: an anchor is created and
766 │  * assigned to the `lContainer[NATIVE]` slot.
767 │  */
768 │ function createAnchorNode(
769 │   lContainer: LContainer,
770 │   hostLView: LView,
771 │   hostTNode: TNode,
772 │   slotValue: any,
773 │ ) {
774 │   // We already have a native element (anchor) set, return.
775 ▶   if (lContainer[NATIVE]) return;
776 │ 
777 │   let commentNode: RComment;
778 │   // If the host is an element container, the native host element is guaranteed to be a
779 │   // comment and we can reuse that comment as anchor element for the new LContainer.
780 │   // The comment node in question is already part of the DOM structure so we don't need to append
781 │   // it again.
782 ▶   if (hostTNode.type & TNodeType.ElementContainer) {
783 ▶     commentNode = unwrapRNode(slotValue) as RComment;
784 │   } else {
785 ▶     commentNode = insertAnchorNode(hostLView, hostTNode);
786 │   }
787 ▶   lContainer[NATIVE] = commentNode;
788 │ }
```

137〜138 行目「目印 1 つに入れ物は 1 つ」は、中身についてだけ合います。同じ要素に `read: ViewContainerRef` の `@ViewChild` を 2 つ置くと、2 つは別のオブジェクトでしたが、一方に入れたビューは他方の `length` にも数えられました。`createContainerRef` は要素の場所にもう `LContainer` があればそれを使い、`R3ViewContainerRef` だけを毎回 new するからです（L699〜713、[provider 無しで取れる理由の章](../di/13-di-special-tokens.md)）。775 行目のとおり、目印のコメントも 1 つしか作りません。

151 行目の `injector` は「この入れ物の注入器」で、div の上の VCR からは div のディレクティブが置いた値（`'anchor'`）が取れました。ところが 3 節のとおり、この VCR の `createComponent` で作ったコンポーネントからは、その値は見えません。155 行目の `parentInjector` は deprecated で置き換えが無いと書きますが、`createComponent` の既定はこの `parentInjector` です。166 行目「範囲外なら `null`」は `get(99)` も `get(-1)` も `null` でした。

## 3. createEmbeddedView と createComponent の options

📄 `angular/packages/core/src/linker/view_container_ref.ts` L200–224 （▶ の行: 207–208, 215, 219, 223–224）

```ts
200 │ 
201 │   /**
202 │    * Instantiates an embedded view and inserts it
203 │    * into this container.
204 │    * @param templateRef The HTML template that defines the view.
205 │    * @param context The data-binding context of the embedded view, as declared
206 │    * in the `<ng-template>` usage.
207 ▶    * @param index The 0-based index at which to insert the new view into this container.
208 ▶    * If not specified, appends the new view as the last entry.
209 │    *
210 │    * @returns The `ViewRef` instance for the newly created view.
211 │    */
212 │   abstract createEmbeddedView<C>(
213 │     templateRef: TemplateRef<C>,
214 │     context?: C,
215 ▶     index?: number,
216 │   ): EmbeddedViewRef<C>;
217 │ 
218 │   /**
219 ▶    * Instantiates a component and inserts its host view into this view container.
220 │    *
221 │    * @param componentType Component Type to use.
222 │    * @param options An object that contains extra parameters:
223 ▶    *  * index: the index at which to insert the new component's host view into this container.
224 ▶    *           If not specified, appends the new view as the last entry.
```

📄 `angular/packages/core/src/linker/view_container_ref.ts` L367–391 （▶ の行: 367, 370–372, 376, 379, 384–385）

```ts
367 ▶   override createEmbeddedView<C>(
368 │     templateRef: TemplateRef<C>,
369 │     context?: C,
370 ▶     options?: {
371 ▶       index?: number;
372 ▶       injector?: Injector;
373 │       onError?: (error: Error, context: ErrorDetails) => void;
374 │     },
375 │   ): EmbeddedViewRef<C>;
376 ▶   override createEmbeddedView<C>(
377 │     templateRef: TemplateRef<C>,
378 │     context?: C,
379 ▶     index?: number,
380 │   ): EmbeddedViewRef<C>;
381 │   override createEmbeddedView<C>(
382 │     templateRef: TemplateRef<C>,
383 │     context?: C,
384 ▶     indexOrOptions?:
385 ▶       | number
386 │       | {
387 │           index?: number;
388 │           injector?: Injector;
389 │           onError?: (error: Error, context: ErrorDetails) => void;
390 │         },
391 │   ): EmbeddedViewRef<C> {
```

`index` は options の形（L183〜184）と、3 つ目の引数に数を渡す古い形（207〜208 行目、215 行目）の両方があり、どちらも書いたとおりの位置に入りました（DEMO の 1 つ目の表）。中では 384〜385 行目の引数を、数ならそのまま、オブジェクトなら中身を取り出して同じ処理に入れます（L396〜402）。

`injector`（L185）は「埋め込みビューの中で使う注入器」とだけ書きます。DEMO では、`<ng-template>` を置いた `<section>` のディレクティブも同じトークンを置いていましたが、ビューの中のコンポーネントには `options.injector` の値が見えました。埋め込みビューの中から探すと、ビューの境い目で先に `options.injector` を見て、それから `<ng-template>` を置いた側の要素へ上がるからです（render3/di.ts L1010〜1037、[NodeInjector の探し方の章](../di/11-di-node-injector-lookup.md)）。宣言した側の要素の値より、渡した注入器の値が優先される、ということは説明文にありません。

📄 `angular/packages/core/src/linker/view_container_ref.ts` L233–255 （▶ の行: 233–236, 245–251）

```ts
233 ▶    *  * projectableNodes: list of DOM nodes that should be projected through
234 ▶    *                      [`<ng-content>`](api/core/ng-content) of the new component instance.
235 ▶    *  * directives: Directives that should be applied to the component.
236 ▶    *  * bindings: Bindings that should be applied to the component.
237 │    *  * onError: A callback that will be invoked when an error occurs during the component's change detection or lifecycle hooks.
238 │    *             Note that this will not catch errors thrown during the component's construction.
239 │    *
240 │    * @returns The new `ComponentRef` which contains the component instance and the host view.
241 │    */
242 │   abstract createComponent<C>(
243 │     componentType: Type<C>,
244 │     options?: {
245 ▶       index?: number;
246 ▶       injector?: Injector;
247 ▶       ngModuleRef?: NgModuleRef<unknown>;
248 ▶       environmentInjector?: EnvironmentInjector | NgModuleRef<unknown>;
249 ▶       projectableNodes?: Node[][];
250 ▶       directives?: (Type<unknown> | DirectiveWithBindings<unknown>)[];
251 ▶       bindings?: Binding[];
252 │       onError?: (error: Error, context: ErrorDetails) => void;
253 │     },
254 │   ): ComponentRef<C>;
255 │ 
```

options を渡さずに div の上の VCR で作ったコンポーネントは、div の値ではなく、外の `<section>` の値を見ました。`injector` を渡さないと、コンポーネントの親は VCR の `parentInjector`（目印の要素の親の注入器）になるからです（L490、[ViewContainerRef.createComponent の章](../dyn/05-dyn-vcr-host.md)の 2 節）。L225 の `injector` は「新しいコンポーネントの親にする注入器」で、渡すとその値だけが見え、`<section>` の値は見えませんでした。`{injector: anchor.injector}` を渡すと div の値（`'anchor'`）が見えました。`environmentInjector`（L229）に子の環境の注入器を渡すと、その注入器にだけ置いたトークンが見えました。`index: 0` で先頭に入りました。

233〜234 行目の `projectableNodes` は、テンプレートが `(<ng-content select="b" />|<ng-content />)` のコンポーネントに `[[テキスト 'T'], [<b>]]` を渡すと `(T|B)` でした。`<b>` は `select="b"` の方ではなく、2 つ目の `<ng-content>` に入りました。`select` で選ぶのではなく、配列の並びの順に入れます（[動的な投影の章](../proj/05-proj-dynamic.md)）。235〜236 行目の `directives` と `bindings` も、付けたディレクティブの host の属性と `inputBinding('label', ...)` の値が出ました。L229〜232 は `environmentInjector` が `ngModuleRef` に置き換わると書きます。両方を渡すと、開発モードは「Cannot pass both environmentInjector and ngModuleRef options to createComponent().」の例外（L476〜480）、本番は確かめずに `environmentInjector` を使って作りました。

## 4. insert・move・indexOf・remove・detach の説明文

📄 `angular/packages/core/src/linker/view_container_ref.ts` L256–281 （▶ の行: 259–260, 264, 267, 269, 272, 277–278）

```ts
256 │   /**
257 │    * Inserts a view into this container.
258 │    * @param viewRef The view to insert.
259 ▶    * @param index The 0-based index at which to insert the view.
260 ▶    * If not specified, appends the new view as the last entry.
261 │    * @returns The inserted `ViewRef` instance.
262 │    *
263 │    */
264 ▶   abstract insert(viewRef: ViewRef, index?: number): ViewRef;
265 │ 
266 │   /**
267 ▶    * Moves a view to a new location in this container.
268 │    * @param viewRef The view to move.
269 ▶    * @param index The 0-based index of the new location.
270 │    * @returns The moved `ViewRef` instance.
271 │    */
272 ▶   abstract move(viewRef: ViewRef, currentIndex: number): ViewRef;
273 │ 
274 │   /**
275 │    * Returns the index of a view within the current container.
276 │    * @param viewRef The view to query.
277 ▶    * @returns The 0-based index of the view's position in this container,
278 ▶    * or `-1` if this container doesn't contain the view.
279 │    */
280 │   abstract indexOf(viewRef: ViewRef): number;
281 │ 
```

📄 `angular/packages/core/src/linker/view_container_ref.ts` L282–296 （▶ の行: 284–285, 290–293）

```ts
282 │   /**
283 │    * Destroys a view attached to this container
284 ▶    * @param index The 0-based index of the view to destroy.
285 ▶    * If not specified, the last view in the container is removed.
286 │    */
287 │   abstract remove(index?: number): void;
288 │ 
289 │   /**
290 ▶    * Detaches a view from this container without destroying it.
291 ▶    * Use along with `insert()` to move a view within the current container.
292 ▶    * @param index The 0-based index of the view to detach.
293 ▶    * If not specified, the last view in the container is detached.
294 │    */
295 │   abstract detach(index?: number): ViewRef | null;
296 │ 
```

📄 `angular/packages/core/src/linker/view_container_ref.ts` L542–569 （▶ の行: 566–567）

```ts
542 │   }
543 │ 
544 │   /** Returns the namespace used by nodes inserted at this container's render location. */
545 │   private _getHostElementNamespace(): string | null {
546 │     if (this._hostTNode.type & TNodeType.Element) {
547 │       const parentTNode = this._hostTNode.parent ?? this._hostLView[T_HOST];
548 │ 
549 │       // SVG foreignObject elements are namespace integration points: the foreignObject itself is
550 │       // SVG, but its children are HTML.
551 │       if (
552 │         parentTNode !== null &&
553 │         parentTNode.type & TNodeType.Element &&
554 │         typeof parentTNode.value === 'string' &&
555 │         parentTNode.value.toLowerCase() === 'foreignobject'
556 │       ) {
557 │         return null;
558 │       }
559 │ 
560 │       return parentTNode?.namespace ?? null;
561 │     }
562 │ 
563 │     return this._hostTNode.namespace;
564 │   }
565 │ 
566 ▶   override insert(viewRef: ViewRef, index?: number): ViewRef {
567 ▶     return this.insertImpl(viewRef, index, true);
568 │   }
569 │ 
```

📄 `angular/packages/core/src/linker/view_container_ref.ts` L622–637 （▶ の行: 624–625, 631, 634, 636）

```ts
622 │   }
623 │ 
624 ▶   override move(viewRef: ViewRef, newIndex: number): ViewRef {
625 ▶     if (ngDevMode && viewRef.destroyed) {
626 │       throw new RuntimeError(
627 │         RuntimeErrorCode.VIEW_DESTROYED_MOVE_ERROR,
628 │         ngDevMode && 'Cannot move a destroyed View in a ViewContainer!',
629 │       );
630 │     }
631 ▶     return this.insert(viewRef, newIndex);
632 │   }
633 │ 
634 ▶   override indexOf(viewRef: ViewRef): number {
635 │     const viewRefsArr = getViewRefs(this._lContainer);
636 ▶     return viewRefsArr !== null ? viewRefsArr.indexOf(viewRef) : -1;
637 │   }
```

📄 `angular/packages/core/src/linker/view_container_ref.ts` L638–663 （▶ の行: 640–641, 643, 650–651, 656–657, 660–661）

```ts
638 │ 
639 │   override remove(index?: number): void {
640 ▶     const adjustedIdx = this._adjustIndex(index, -1);
641 ▶     const detachedView = detachView(this._lContainer, adjustedIdx);
642 │ 
643 ▶     if (detachedView) {
644 │       // Before destroying the view, remove it from the container's array of `ViewRef`s.
645 │       // This ensures the view container length is updated before calling
646 │       // `destroyLView`, which could recursively call view container methods that
647 │       // rely on an accurate container length.
648 │       // (e.g. a method on this view container being called by a child directive's OnDestroy
649 │       // lifecycle hook)
650 ▶       removeFromArray(getOrCreateViewRefs(this._lContainer), adjustedIdx);
651 ▶       destroyLView(detachedView[TVIEW], detachedView);
652 │     }
653 │   }
654 │ 
655 │   override detach(index?: number): ViewRef | null {
656 ▶     const adjustedIdx = this._adjustIndex(index, -1);
657 ▶     const view = detachView(this._lContainer, adjustedIdx);
658 │ 
659 │     const wasDetached =
660 ▶       view && removeFromArray(getOrCreateViewRefs(this._lContainer), adjustedIdx) != null;
661 ▶     return wasDetached ? new R3ViewRef(view!) : null;
662 │   }
663 │ 
```

269 行目の `@param index` は、272 行目の引数の名前 `currentIndex` と合っていません。API リファレンスは名前の合う `@param` しか引数に付けないので、`move` の位置の引数は説明が空になります。新しい本家では 6e024600e0b（2026-10-08、`docs: fix @param names that don't match their parameters`）で `@param currentIndex` に直りました。

631 行目のとおり `move` は `insert` を呼ぶだけで、`insert` は入れる前に、そのビューがもう入っていれば外します（L580〜610、[差し込む場所の章](../template/04-view-container.md)の 3 節「挿す前に、黙って外している」）。そのため、3 つ入った入れ物で `move(v0, 3)` と呼ぶと、先に `v0` が外れて `length` が 2 になり、そのあと添字の確かめ（L668〜672、開発モードだけ）で「index \[Expected=&gt; 3 &lt; 3 &lt;=Actual\]」の例外でした。本番は確かめが無く「Cannot set properties of undefined (setting '4')」の TypeError です。どちらも `v0` は外されたまま戻らず、画面から消えました（DEMO の 3 つ目の表の 2 行目）。`move` の正しい範囲は 0 から `length - 1` ですが、説明文は範囲を書かず、例外のときにビューが外れたままになることも書いていません。

290〜291 行目「壊さずに外す。`insert()` と組み合わせて動かす」は動きましたが、661 行目のとおり `detach` は `new R3ViewRef(view)` で新しい `ViewRef` を返します。入れたときの `ViewRef` とは別のオブジェクトで（`d === v1` が `false`）、`d` を入れ直すと `indexOf(d)` は 1、`indexOf(v1)` は -1 でした。277〜278 行目の「入っていなければ -1」は、同じビューでも、持っている `ViewRef` のオブジェクトが違えば -1 になります（636 行目は `ViewRef` の配列の `indexOf`）。285 行目・293 行目「index を渡さなければ最後」は `remove()` で合っていました。`remove` した（壊した）ビューを `insert` すると、開発モードは NG0922「Cannot insert a destroyed View in a ViewContainer!」、本番は確かめず（L573 は `ngDevMode &&`）に入ってしまい、`length` が 1 増えました。

> [!WARNING]
> **ハマりどころ**
>
> 負の添字は、説明文が「0 から数えた位置」と言うだけで、何が起きるかを書いていません。2 つ入った入れ物で試すと、開発モードはどれも「ViewRef index must be positive, got -1」の例外で止まりました（`get(-1)` だけは `null`）。本番では、`detach(-1)` は `null`、`remove(-1)` と `remove(5)` は何もせず、`createEmbeddedView(tpl, ctx, {index: -1})`・`insert(v, -1)`・`move(v, -1)` は TypeError のうえ、そのあとの描き直しでも TypeError が出る、壊れた入れ物になりました（DEMO の 3 つ目の表の最後の 7 行）。

## 5. TemplateRef

📄 `angular/packages/core/src/linker/template_ref.ts` L21–53 （▶ の行: 22–24, 26–27, 31, 42, 44–45, 47–49）

```ts
21 │ /**
22 ▶  * Represents an embedded template that can be used to instantiate embedded views.
23 ▶  * To instantiate embedded views based on a template, use the `ViewContainerRef`
24 ▶  * method `createEmbeddedView()`.
25 │  *
26 ▶  * Access a `TemplateRef` instance by placing a directive on an `<ng-template>`
27 ▶  * element (or directive prefixed with `*`). The `TemplateRef` for the embedded view
28 │  * is injected into the constructor of the directive,
29 │  * using the `TemplateRef` token.
30 │  *
31 ▶  * You can also use a `Query` to find a `TemplateRef` associated with
32 │  * a component or a directive.
33 │  *
34 │  * @see {@link ViewContainerRef}
35 │  *
36 │  * @see [Getting a reference to a template fragment](guide/templates/ng-template#getting-a-reference-to-a-template-fragment)
37 │  *
38 │  * @publicApi
39 │  */
40 │ export class TemplateRef<C> {
41 │   /**
42 ▶    * The anchor element in the parent view for this embedded view.
43 │    *
44 ▶    * The data-binding and [injection contexts](guide/di/dependency-injection-context) of embedded
45 ▶    * views created from this `TemplateRef` inherit from the contexts of this location.
46 │    *
47 ▶    * Typically new embedded views are attached to the view container of this location, but in
48 ▶    * advanced use-cases, the view can be attached to a different container while keeping the
49 ▶    * data-binding and injection context from the original location.
50 │    *
51 │    */
52 │   readonly elementRef: ElementRef;
53 │ 
```

📄 `angular/packages/core/src/linker/template_ref.ts` L59–98 （▶ の行: 80, 83, 86–87）

```ts
59 │ 
60 │   /** @internal */
61 │   constructor(
62 │     private _declarationLView: LView,
63 │     private _declarationTContainer: TContainerNode,
64 │     elementRef: ElementRef,
65 │   ) {
66 │     this.elementRef = elementRef;
67 │   }
68 │ 
69 │   /**
70 │    * Returns an `ssrId` associated with a TView, which was used to
71 │    * create this instance of the `TemplateRef`.
72 │    *
73 │    * @internal
74 │    */
75 │   get ssrId(): string | null {
76 │     return this._declarationTContainer.tView?.ssrId || null;
77 │   }
78 │ 
79 │   /**
80 ▶    * Instantiates an unattached embedded view based on this template.
81 │    * @param context The data-binding context of the embedded view, as declared
82 │    * in the `<ng-template>` usage.
83 ▶    * @param injector Injector to be used within the embedded view.
84 │    * @returns The new embedded view object.
85 │    */
86 ▶   createEmbeddedView(context: C, injector?: Injector): EmbeddedViewRef<C> {
87 ▶     return this.createEmbeddedViewImpl(context, injector);
88 │   }
89 │ 
90 │   /**
91 │    * Implementation of the `createEmbeddedView` function.
92 │    *
93 │    * This implementation is internal and allows framework code
94 │    * to invoke it with extra parameters (e.g. for hydration) without
95 │    * affecting public API.
96 │    *
97 │    * @internal
98 │    */
```

80 行目「どこにも付いていない埋め込みビューを作る」のとおり、`tpl.createEmbeddedView({n: 7})` の `rootNodes` は文書の外で、VCR の `length` も増えませんでした。`insert` すると表示されます。42 行目の `elementRef` は `<ng-template>` の位置のコメントでした（`nodeType` 8）。44〜45 行目「データの束ねと注入の文脈は、この位置から受け継ぐ」は、DEMO で `<ng-template>` を `<section>` の中に置き、`<ng-container #vc>` に入れたビューの中のコンポーネントが `'section'` を見たこと（3 節）で確かめられます。47〜49 行目の「別の入れ物に入れても、元の位置の文脈を保つ」も、`anchor.insert(...)` で div の VCR に移したビューが `'section'` のままでした。

## 6. ViewRef と EmbeddedViewRef

📄 `angular/packages/core/src/linker/view_ref.ts` L11–37 （▶ の行: 20, 26, 31–34, 36）

```ts
11 │ /**
12 │  * Represents an Angular view.
13 │  *
14 │  * @see {@link /api/core/ChangeDetectorRef#usage-notes Change detection usage}
15 │  *
16 │  * @publicApi
17 │  */
18 │ export abstract class ViewRef extends ChangeDetectorRef {
19 │   /**
20 ▶    * Destroys this view and all of the data structures associated with it.
21 │    */
22 │   abstract destroy(): void;
23 │ 
24 │   /**
25 │    * Reports whether this view has been destroyed.
26 ▶    * @returns True after the `destroy()` method has been called, false otherwise.
27 │    */
28 │   abstract get destroyed(): boolean;
29 │ 
30 │   /**
31 ▶    * A lifecycle hook that provides additional developer-defined cleanup
32 ▶    * functionality for views.
33 ▶    * @param callback A handler function that cleans up developer-defined data
34 ▶    * associated with a view. Called when the `destroy()` method is invoked.
35 │    */
36 ▶   abstract onDestroy(callback: Function): void;
37 │ }
```

📄 `angular/packages/core/src/linker/view_ref.ts` L39–77 （▶ の行: 41–43, 45–47, 59, 68）

````ts
39 │ /**
40 │  * Represents an Angular view in a view container.
41 ▶  * An embedded view can be referenced from a component
42 ▶  * other than the hosting component whose template defines it, or it can be defined
43 ▶  * independently by a `TemplateRef`.
44 │  *
45 ▶  * Properties of elements in a view can change, but the structure (number and order) of elements in
46 ▶  * a view cannot. Change the structure of elements by inserting, moving, or
47 ▶  * removing nested views in a view container.
48 │  *
49 │  * @see {@link ViewContainerRef}
50 │  *
51 │  * @usageNotes
52 │  *
53 │  * The following template breaks down into two separate `TemplateRef` instances,
54 │  * an outer one and an inner one.
55 │  *
56 │  * ```html
57 │  * Count: {{items.length}}
58 │  * <ul>
59 ▶  *   <li *ngFor="let  item of items">{{item}}</li>
60 │  * </ul>
61 │  * ```
62 │  *
63 │  * This is the outer `TemplateRef`:
64 │  *
65 │  * ```html
66 │  * Count: {{items.length}}
67 │  * <ul>
68 ▶  *   <ng-template ngFor let-item [ngForOf]="items"></ng-template>
69 │  * </ul>
70 │  * ```
71 │  *
72 │  * This is the inner `TemplateRef`:
73 │  *
74 │  * ```html
75 │  *   <li>{{item}}</li>
76 │  * ```
77 │  *
````

📄 `angular/packages/core/src/linker/view_ref.ts` L78–102 （▶ の行: 84–86, 94, 96, 101）

````ts
 78 │  * The outer and inner `TemplateRef` instances are assembled into views as follows:
 79 │  *
 80 │  * ```html
 81 │  * <!-- ViewRef: outer-0 -->
 82 │  * Count: 2
 83 │  * <ul>
 84 ▶  *   <ng-template view-container-ref></ng-template>
 85 ▶  *   <!-- ViewRef: inner-1 --><li>first</li><!-- /ViewRef: inner-1 -->
 86 ▶  *   <!-- ViewRef: inner-2 --><li>second</li><!-- /ViewRef: inner-2 -->
 87 │  * </ul>
 88 │  * <!-- /ViewRef: outer-0 -->
 89 │  * ```
 90 │  * @publicApi
 91 │  */
 92 │ export abstract class EmbeddedViewRef<C> extends ViewRef {
 93 │   /**
 94 ▶    * The context for this view, inherited from the anchor element.
 95 │    */
 96 ▶   abstract context: C;
 97 │ 
 98 │   /**
 99 │    * The root nodes for this embedded view.
100 │    */
101 ▶   abstract get rootNodes(): any[];
102 │ }
````

31〜34 行目の `onDestroy` は「`destroy()` が呼ばれたときに呼ぶ」と書き、VCR の `remove` で壊したときにも呼ばれました（`remove` は 651 行目で `destroyLView` を呼ぶ）。戻り値は `void` で、登録を外す手段はありません。59 行目と 68 行目の例は `*ngFor` を使った古い書き方です。`NgFor` を `imports` に入れたコンポーネントのテンプレートに置くと、strict の tsc（`strictTemplates`）に通りました（59 行目の `let item` の 2 つの空白もそのまま）。今の書き方なら `@for` です。84〜86 行目の `view-container-ref` は説明のための仮の名前で、実際の DOM には出ません（実際はコメントの目印）。

94 行目は `context` を「目印の要素から受け継ぐ文脈」と書きますが、実際は `createEmbeddedView` に渡したオブジェクトそのもので、中身を変えて描き直すと表示が変わりました（`context.n = 70`）。96 行目は書き込める `context: C` ですが、丸ごと入れ替えるのは 9b9e11fcaf5（2023-09-28、``refactor(core): deprecate allowing full context object to be replaced in `EmbeddedViewRef` (#51887)``、v17）から deprecated です。その `@deprecated` は実装の側（render3/view\_ref.ts L84〜87）にあり、公開の `EmbeddedViewRef` の説明文には出ません。開発モードは入れ替えのたびに console.warn「Angular: Replacing the \`context\` object of an \`EmbeddedViewRef\` is deprecated.」を出し、本番は黙って入れ替えました。

## 7. ElementRef の注意書き

📄 `angular/packages/core/src/linker/element_ref.ts` L36–65 （▶ の行: 38, 40–41, 43–45, 51–53, 59, 61–62）

```ts
36 │ 
37 │ /**
38 ▶  * A wrapper around a native element inside of a View.
39 │  *
40 ▶  * An `ElementRef` is backed by a render-specific element. In the browser, this is usually a DOM
41 ▶  * element.
42 │  *
43 ▶  * @security Permitting direct access to the DOM can make your application more vulnerable to
44 ▶  * XSS attacks. Carefully review any use of `ElementRef` in your code. For more detail, see the
45 ▶  * [Security Guide](https://g.co/ng/security).
46 │  *
47 │  * @see [Using DOM APIs](guide/components/dom-apis)
48 │  *
49 │  * @publicApi
50 │  */
51 ▶ // Note: We don't expose things like `Injector`, `ViewContainer`, ... here,
52 ▶ // i.e. users have to ask for what they need. With that, we can build better analysis tools
53 ▶ // and could do better codegen in the future.
54 │ export class ElementRef<T = any> {
55 │   /**
56 │    * <div class="docs-alert docs-alert-important">
57 │    *   <header>Use with caution</header>
58 │    *   <p>
59 ▶    *    Use this API as the last resort when direct access to DOM is needed. Use templating and
60 │    *    data-binding provided by Angular instead. If used, it is recommended in combination with
61 ▶    *    {@link /best-practices/security#direct-use-of-the-dom-apis-and-explicit-sanitization-calls DomSanitizer}
62 ▶    *    for maxiumum security;
63 │    *   </p>
64 │    * </div>
65 │    */
```

43〜45 行目と 56〜64 行目は、DOM に直接触ると XSS（他人のスクリプトを差し込まれる攻撃）に弱くなるので、最後の手段にし、使うなら `DomSanitizer` と組み合わせる、と書きます（サニタイズの約束は[第 9 回](09-cra-sanitize.md)）。62 行目の「maxiumum」は「maximum」の綴りの誤りで、新しい本家でも同じです。51〜53 行目のコメントのとおり、`ElementRef` は `nativeElement` だけを持つ入れ物で、注入器も VCR も持ちません。DEMO では、div の `ElementRef` と VCR の `element` の `nativeElement` は同じ要素でしたが、`ElementRef` のオブジェクトは取るたびに new されます（L33〜35、[ViewRef は配列への窓の章](../ivy/16-ivy-refs.md)）。

> **🧪 DEMO — 本物の ViewContainerRef で説明文の約束を試す**
>
> 押すと、このページ（本番ビルド）で本物の `@angular/core`（22.2.6）の `createComponent` で、文書に付けない要素の上に小さなコンポーネントを作り、その中の 2 つの VCR を操作して、表示された文字（`[n:見えた値]` の並び）を「このページ」の列に書きます。ApplicationRef には付けず、表を作り終えたらコンポーネントを destroy します。3 つ目の表の最後の 7 行は、行ごとに別のコンポーネントを作って試し、壊れてもそのまま捨てます。  
>  「開発モード」の列は、同じ関数（cra-view-container.demo-vc.ts）を Node（domino の上の JIT）で動かした記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cra-view-container)

## ここまでの呼び出し（3 つ入った入れ物で move(v0, 3)）

- 👤 `vc.move(v0, 3)`
  - `insert(v0, 3)` — view\_container\_ref.ts L631
    - `insertImpl：v0 はもう入っている → this.detach(0)` — L580〜590 — *length が 3 → 2*
    - `_adjustIndex(3)：assertLessThan(3, 2 + 1)` — L668〜672 — *開発モードは例外、本番は素通り*
      - `addLViewToLContainer(lContainer, lView, 3)` — L616 — *本番はここで TypeError*
  - `v0 は外れたまま、どの入れ物にも入っていない`

## テストと直し方

| ファイル（packages/core/test/acceptance/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `view_container_ref_spec.ts` | `insert`（455）› `should move views if they are already attached`（474）・`should insert a view already inserted into another container`（510）、`move`（578）› `should insert detached views in move()`（579） | 4 節。範囲外への `move` の it は無い |
| `view_container_ref_spec.ts` | `get and indexOf`（825）› `should handle out of bounds cases`（852） | 2 節の `get(-1)`・`get(42)` が `null`。負の添字の `insert`・`remove` の it は無い |
| `view_container_ref_spec.ts` | `detach`（980）› `should detach the right embedded view when an index is specified`（985）、`remove`（1069）› `should throw when trying to insert a removed or destroyed view`（1133） | 4 節。1133 は開発モードの NG0922。`detach` の戻り値が別のオブジェクトであることの it は無い |
| `view_container_ref_spec.ts` | `getters for the anchor node`（889）› `should work on elements`（922）、`createComponent`（1446） | 2・3 節 |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
（結果は表の下）
```

結果は手元の bazel（`//packages/core/test/acceptance:acceptance`、shard は 1 つ、2026-11-22）で、`--filter` の名前（spec の名前の一部に当たる）ごとに、`ViewContainerRef insert` で 12（`insertion points and declaration points` も含む）、`ViewContainerRef move` で 2、`ViewContainerRef get and indexOf` で 3、`ViewContainerRef detach` で 3、`ViewContainerRef remove` で 3、`ViewContainerRef createEmbeddedView` で 5、`ViewContainerRef createComponent` で 15、`TemplateRef` で 38（pending 1）、`ViewRef` で 14、どれも 0 failures でした。

直すとしたら、view\_container\_ref.ts の `insertImpl`（L570〜621）で、もう入っているビューを外す前に新しい位置を確かめる（外したあとの `length` で `index` を見る）か、`move`（L624〜632）で `newIndex` を `length - 1` までに確かめます。spec は view\_container\_ref\_spec.ts の `move`（578）に「範囲外の `move` は例外を投げ、ビューは元の位置に残る」を足します。説明文は、98〜100 行目を例に合わせて「VCR の `createComponent` で作り、入れ物に入れる」に、290〜291 行目の `detach` に「新しい `ViewRef` を返す」、266〜272 行目の `move` に範囲を足します。view\_ref.ts の 94 行目は「`createEmbeddedView` に渡した文脈」に、element\_ref.ts の 62 行目は綴りを直します。

## 聞かれそうな質問

**Q. div の上の VCR で作ったコンポーネントは、div のディレクティブが provide した値を inject できますか？**

できません。`injector` を渡さないと、親は VCR の `parentInjector`（div の親の注入器）です（L490）。`vcr.injector.get(X)` では取れるので紛らわしいところです。取りたければ `{injector: vcr.injector}` を渡します。

**Q. `detach()` した `ViewRef` を、あとで `indexOf` で探せますか？**

`detach` の戻り値で探せば見つかります。入れたときに持っていた `ViewRef` で探すと、入れ直したあとは -1 です。661 行目が新しい `ViewRef` を作って返し、636 行目はオブジェクトの一致で探すからです。

**Q. `move(view, vcr.length)` で最後に動かせますか？**

動かせません。`move` は先にそのビューを外すので、正しい最後の位置は `length - 1` です。`length` を渡すと例外になり、ビューは外れたまま戻りません。

**Q. `createEmbeddedView` の `injector` と、`<ng-template>` を置いた場所の provider は、どちらが勝ちますか？**

`injector` の方です。ビューの境い目で先に `options.injector` を見てから、宣言した側の要素へ上がります（render3/di.ts L1010〜1037）。

**Q. 本番で負の添字を渡すとどうなりますか？**

確かめ（L668〜672）が開発モードだけなので、`remove(-1)` は何もせず、`insert(v, -1)` は TypeError のうえ入れ物が壊れます。添字は呼ぶ側で確かめます。

## 読み終えて

- 書き出しの例の前の文は `createComponent` 関数の説明の写しで、例（VCR のメソッド、ApplicationRef に付けない）と合わない。
- VCR の `createComponent` の既定の親は `parentInjector`（deprecated と書かれた方）で、目印の要素の provider は見えない。
- `detach` は新しい `ViewRef` を返し、範囲外の `move` はビューを外したまま例外になる。
- 添字の確かめは開発モードだけで、本番の負の添字は黙って何もしないか、入れ物を壊す。
- `EmbeddedViewRef.context` の入れ替えは v17 から deprecated だが、公開の説明文には出ない。`ElementRef` の注意書きに綴りの誤りが 1 つ。

---

← 前: [platform と bootstrap の説明文](02-cra-platform.md)  
次: [QueryList・DestroyRef・ComponentRef・Compiler の説明文](04-cra-linker-misc.md) →
