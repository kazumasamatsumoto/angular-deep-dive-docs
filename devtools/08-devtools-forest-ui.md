[目次](../README.md) › [Angular DevTools の内側](README.md) › 第 8 回 / 全 20 回

# パネルの木：平らな木への展開・差分・絞り込み

> ng-devtools の directive-forest が、届いた DevToolsNode の木を平らな行の列にする ComponentDataSource、前の木との差分を取る diffing、検索の絞り込み（directive-forest-filter-fn-generator.ts）、パンくず（breadcrumbs）。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-forest-ui)

---

ここからはパネル（拡張の DevTools の画面、`ng-devtools`）の側です。バックエンドから届くのは入れ子の `DevToolsNode` の森ですが、画面に出すのは「上から順に並んだ行」です。この章では、届いた森を平らな行の列にする `ComponentDataSource`、前の行の列との差分を取って行のオブジェクトを使い回す `diff`、検索の文字列を解釈する `directiveForestFilterFnGenerator`、選んだ行から作るパンくず（breadcrumbs）を、行番号で追います。

読む対象は `devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/` の `directive-explorer.component.ts`・`diffing/index.ts` と、`directive-forest/` の `directive-forest.component.ts`・`index-forest/index.ts`・`component-data-source/index.ts`・`directive-forest-filter-fn-generator.ts`・`directive-forest-utils.ts`・`tree-node/`・`breadcrumbs/` です。

1. [1. 全体像](01-devtools-overview.md)
2. [2. Angular を見つける](02-devtools-detect.md)
3. [3. メッセージの道](03-devtools-messaging.md)
4. [4. プロトコル](04-devtools-protocol.md)
5. [5. コンポーネントの木](05-devtools-component-tree.md)
6. [6. 制御フローの塊](06-devtools-control-flow.md)
7. [7. 同じノードを見分ける](07-devtools-identity.md)
8. **8. パネルの木**（この章）
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

## 1. 木を頼み、受け取る：DirectiveExplorerComponent

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-explorer.component.ts` L200–231 （▶ の行: 206–207, 209–211, 219–220, 222, 224, 228）

```ts
200 │   handleNodeSelection(node: IndexedNode | null): void {
201 │     if (node) {
202 │       // We want to guarantee that we're not reusing any of the previous properties.
203 │       // That's possible if the user has selected an NgForOf and after that
204 │       // they select another NgForOf instance. In this case, we don't want to diff the props
205 │       // we want to render from scratch.
206 ▶       if (this._clickedElement && !sameDirectives(this._clickedElement, node)) {
207 ▶         this._propResolver.clearProperties();
208 │       }
209 ▶       this._clickedElement = node;
210 ▶       this._messageBus.emit('setSelectedComponent', [node.position]);
211 ▶       this.refresh();
212 │     } else {
213 │       this._clickedElement = null;
214 │       this.currentSelectedElement.set(null);
215 │     }
216 │   }
217 │ 
218 │   subscribeToBackendEvents(): void {
219 ▶     this._messageBus.on('latestComponentExplorerView', (view: ComponentExplorerView) => {
220 ▶       this.forest.set(view.forest);
221 │ 
222 ▶       this.currentSelectedElement.set(this._clickedElement);
223 │       if (view.properties && this._clickedElement) {
224 ▶         this._propResolver.setProperties(this._clickedElement, view.properties);
225 │       }
226 │     });
227 │ 
228 ▶     this._messageBus.on('componentTreeDirty', () => this.refresh());
229 │ 
230 │     this._messageBus.on('latestCdData', (cdData) => this.cdData.set(cdData));
231 │   }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-explorer.component.ts` L233–248 （▶ の行: 234–235, 237, 239, 245–246）

```ts
233 │   refresh(): void {
234 ▶     const success = this._messageBus.emit('getLatestComponentExplorerView', [
235 ▶       this._constructViewQuery(),
236 │     ]);
237 ▶     this._messageBus.emit('getRoutes');
238 │     // If the event was not throttled, we no longer need to retry.
239 ▶     if (success) {
240 │       this._refreshRetryTimeout && clearTimeout(this._refreshRetryTimeout);
241 │       this._refreshRetryTimeout = null;
242 │       return;
243 │     }
244 │     // If the event was throttled and we haven't scheduled a retry yet.
245 ▶     if (!this._refreshRetryTimeout) {
246 ▶       this._refreshRetryTimeout = setTimeout(() => this.refresh(), 500);
247 │     }
248 │   }
```

1. **234〜236 行目：頼む**

   `refresh` は `getLatestComponentExplorerView` を送ります（受け取るバックエンドは[第 5 回](05-devtools-component-tree.md)）。引数は「選んでいる行の位置と、開いているプロパティ」で、何も選んでいなければ `undefined` です。送れなかった（間引かれた）ときは 245〜246 行目で 500 ms 後にやり直します。
2. **228 行目：バックエンドが「木が古くなった」と言ったら頼み直す**

   バックエンドは変更検知のたびに（250 ms に 1 回まで）`componentTreeDirty` を送ります（[第 3 回](03-devtools-messaging.md)）。パネルは自分では木の変化を知らず、これを合図に頼み直すだけです。
3. **219〜226 行目：受け取ったら signal に入れる**

   220 行目で `forest` の signal に入れると、2 節の `DirectiveForestComponent` の `input` に流れます。プロパティが付いていれば 224 行目でプロパティの側へ（[第 10 回](10-devtools-property-resolver.md)）。
4. **200〜216 行目：行を選んだら、その位置を知らせて頼み直す**

   210 行目で選んだ位置をバックエンドへ送り（コンソールで `$ng0` として使えるようにする。[第 12 回](12-devtools-inspector-highlight.md)）、211 行目で頼み直して、プロパティ付きの木をもらいます。206 行目、前と違うディレクティブの並びの行を選んだら、前のプロパティを捨てます。

## 2. DirectiveForestComponent：forest が変わるたびに update

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest.component.ts` L141–176 （▶ の行: 141–143, 145, 147, 167–168, 170–171, 173–174）

```ts
141 ▶   readonly treeControl = new FlatTreeControl<FlatNode>(
142 ▶     (node) => node!.level,
143 ▶     (node) => node.expandable,
144 │   );
145 ▶   readonly dataSource = new ComponentDataSource(this.treeControl);
146 │   readonly itemHeight = NODE_ITEM_HEIGHT;
147 ▶   readonly filterGenerator = directiveForestFilterFnGenerator;
148 │ 
149 │   private parents!: FlatNode[];
150 │   private initialized = false;
151 │   private forestRoot: FlatNode | null = null;
152 │ 
153 │   constructor() {
154 │     this.subscribeToInspectorEvents();
155 │     afterRenderEffect({
156 │       read: () => {
157 │         // Listen for tab updates to reset the scroll position to the top
158 │         // This ensures the viewport is properly updated when switching tabs
159 │         this.tabUpdate.tabUpdate();
160 │ 
161 │         const viewport = this.viewport();
162 │         viewport.scrollToIndex(0);
163 │         viewport.checkViewportSize();
164 │       },
165 │     });
166 │ 
167 ▶     effect(() => {
168 ▶       const result = this.updateForest(this.forest());
169 │ 
170 ▶       const changed =
171 ▶         result.movedItems.length || result.newItems.length || result.removedItems.length;
172 │ 
173 ▶       if (changed) {
174 ▶         this.reselectNodeOnUpdate();
175 │       }
176 │     });
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest.component.ts` L384–412 （▶ の行: 389–390, 392, 394–395, 397, 402, 406–408）

```ts
384 │   private updateForest(forest: DevToolsNode[]): {
385 │     newItems: FlatNode[];
386 │     movedItems: FlatNode[];
387 │     removedItems: FlatNode[];
388 │   } {
389 ▶     const result = this.dataSource.update(forest, this.showCommentNodes());
390 ▶     this.forestRoot = this.dataSource.data[0];
391 │ 
392 ▶     if (!this.initialized && forest && forest.length) {
393 │       for (const n of this.treeControl.dataNodes) {
394 ▶         if (!n.collapsedByDefault) {
395 ▶           this.treeControl.expand(n);
396 │         } else {
397 ▶           this.treeControl.collapse(n);
398 │         }
399 │       }
400 │ 
401 │       this.initialized = true;
402 ▶       result.newItems.forEach((item) => (item.newItem = false));
403 │     }
404 │     // We want to expand them once they are rendered unless
405 │     // they are `collapsedByDefault`.
406 ▶     result.newItems.forEach((item) => {
407 ▶       if (!item.collapsedByDefault) {
408 ▶         this.treeControl.expand(item);
409 │       }
410 │     });
411 │     return result;
412 │   }
```

141〜144 行目の `FlatTreeControl`（CDK の、平らな行の列で開閉を覚える部品）に「深さ」と「開けるか」の聞き方を渡し、145 行目でそれを `ComponentDataSource` に渡します。167〜176 行目の `effect` が `forest()` を読むので、木が届くたびに 389 行目の `dataSource.update` が走ります。初めての木では 392〜399 行目で、`collapsedByDefault`（子が全部静的なノード。[第 6 回](06-devtools-control-flow.md)の `<html_content>`）でない行を全部開きます。2 回目からは 406〜410 行目で、新しく増えた行だけを開きます。

## 3. 位置を付け直す：パネルの indexForest

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/index-forest/index.ts` L12–46 （▶ の行: 17, 19, 28, 33, 39, 41）

```ts
12 │ export interface IndexedNode extends DevToolsNode {
13 │   position: ElementPosition;
14 │   children: IndexedNode[];
15 │   original: DevToolsNode;
16 │ 
17 ▶   nativeElement?: never;
18 │   // Instead we will have this boolean
19 ▶   hasNativeElement: boolean;
20 │   injector?: Injector;
21 │ }
22 │ 
23 │ const indexTree = (
24 │   node: DevToolsNode & {hasNativeElement?: boolean},
25 │   idx: number,
26 │   parentPosition: ElementPosition = [],
27 │ ): IndexedNode => {
28 ▶   const position = parentPosition.concat([idx]);
29 │   return {
30 │     position,
31 │     tagName: node.tagName,
32 │     component: node.component,
33 ▶     directives: node.directives?.map((d) => ({name: d.name, id: d.id})),
34 │     children: node.children.map((n, i) => indexTree(n, i, position)),
35 │     hydration: node.hydration,
36 │     controlFlowBlock: node.controlFlowBlock,
37 │     changeDetection: node.changeDetection,
38 │     static: node.static,
39 ▶     hasNativeElement: (node as any).hasNativeElement,
40 │     injector: node.injector,
41 ▶     original: node,
42 │   };
43 │ };
44 │ 
45 │ export const indexForest = (forest: (DevToolsNode & {hasNativeElement?: boolean})[]) =>
46 │   forest.map((n, i) => indexTree(n, i));
```

バックエンドの `indexForest`（[第 7 回](07-devtools-identity.md)の 5 節）と同じく、28 行目で親の位置に自分の番号を足します。届いた森には位置が入っていないので、パネルでもう一度計算します。17〜19 行目、DOM のノードは持たず `hasNativeElement` の真偽値だけ、41 行目の `original` は元の `DevToolsNode` です。

## 4. ComponentDataSource：平らにして、差分を取る

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/component-data-source/index.ts` L43–66 （▶ の行: 45–46, 49–52, 57, 59, 62, 65）

```ts
43 │ const expandable = (node: IndexedNode) => !!node.children && node.children.length > 0;
44 │ 
45 ▶ const trackBy: TrackByFunction<FlatNode> = (_: number, item: FlatNode) =>
46 ▶   `${item.id}#${item.expandable}`;
47 │ 
48 │ const getId = (node: IndexedNode) => {
49 ▶   if (node.controlFlowBlock) {
50 ▶     return node.controlFlowBlock.id;
51 ▶   } else if (node.hydration?.status === 'dehydrated') {
52 ▶     return node.position.join('-');
53 │   }
54 │ 
55 │   let prefix = '';
56 │   if (node.component) {
57 ▶     prefix = node.component.id.toString();
58 │   }
59 ▶   const dirIds =
60 │     node.directives
61 │       ?.map((d) => d.id)
62 ▶       .sort((a, b) => {
63 │         return a - b;
64 │       }) ?? [];
65 ▶   return prefix + '-' + dirIds.join('-');
66 │ };
```

行の id は 48〜66 行目の `getId` で決めます。塊なら 50 行目の `controlFlowBlock.id`（`forId-0-1`）、ハイドレーションを待っている要素なら 52 行目の位置、それ以外は 57 行目のコンポーネントの id と、62 行目で小さい順に並べたディレクティブの id をつないだもの（`1-2`・`-3-4` など）です。45〜46 行目の `trackBy` は、その id に「開けるか」を足した文字列です。この文字列が同じなら「同じ行」です。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/component-data-source/index.ts` L91–126 （▶ の行: 92, 95, 97, 99–100, 104, 109, 118, 120）

```ts
 91 │ export class ComponentDataSource extends DataSource<FlatNode> {
 92 ▶   private _differ = new DefaultIterableDiffer<FlatNode>(trackBy);
 93 │   private _expandedData = new BehaviorSubject<FlatNode[]>([]);
 94 │   private _flattenedData = new BehaviorSubject<FlatNode[]>([]);
 95 ▶   private _nodeToFlat = new WeakMap<IndexedNode, FlatNode>();
 96 │ 
 97 ▶   private _treeFlattener = new MatTreeFlattener(
 98 │     (node: IndexedNode, level: number) => {
 99 ▶       if (this._nodeToFlat.has(node)) {
100 ▶         return this._nodeToFlat.get(node);
101 │       }
102 │       const flatNode: FlatNode = {
103 │         expandable: expandable(node),
104 ▶         id: getId(node),
105 │         // We can compare the nodes in the navigation functions above
106 │         // based on this identifier directly, since it's a reference type
107 │         // and the reference is preserved after transformation.
108 │         position: node.position,
109 ▶         name: node.component ? node.component.name : (node.tagName ?? ''),
110 │         directives: node.directives?.map((d) => d.name) ?? [],
111 │         original: node,
112 │         level,
113 │         hydration: node.hydration,
114 │         controlFlowBlock: node.controlFlowBlock,
115 │         static: node.static,
116 │         changeDetection: node.changeDetection,
117 │         hasNativeElement: node.hasNativeElement,
118 ▶         collapsedByDefault: node.children.every((n) => n.static),
119 │       };
120 ▶       this._nodeToFlat.set(node, flatNode);
121 │       return flatNode;
122 │     },
123 │     (node) => (node ? node.level : -1),
124 │     (node) => (node ? node.expandable : false),
125 │     (node) => (node ? node.children : []),
126 │   );
```

- 92 行目の `DefaultIterableDiffer` は、`@for` や `*ngFor` と同じ、core の配列の差分を取る部品です。
- 97〜126 行目の `MatTreeFlattener`（Angular Material の、入れ子の木を「深さつきの平らな列」にする部品）に、ノードを行に変える関数を渡します。99〜101 行目、同じ `IndexedNode` の行はもう作ってあれば使い回します（95 行目の `WeakMap`）。
- 109 行目、行の名前はコンポーネントの名前、無ければ `tagName`。118 行目の `collapsedByDefault` は「子が全部静的」で、`[].every(...)` は `true` なので子の無い行も `true` になります（記録の表）。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/component-data-source/index.ts` L152–179 （▶ の行: 160, 162, 174–175, 178）

````ts
152 │   update(
153 │     forest: DevToolsNode[],
154 │     showCommentNodes: boolean,
155 │   ): {newItems: FlatNode[]; movedItems: FlatNode[]; removedItems: FlatNode[]} {
156 │     if (!forest) {
157 │       return {newItems: [], movedItems: [], removedItems: []};
158 │     }
159 │ 
160 ▶     let indexedForest = indexForest(forest);
161 │ 
162 ▶     // We filter comment nodes here because we need to preserve the positions within the component
163 │     // tree.
164 │     //
165 │     // For example:
166 │     // ```
167 │     // - #comment
168 │     //   - bar
169 │     // ```
170 │     //
171 │     // #comment's position will be [0] and bar's will be [0, 0]. If we trim #comment nodes earlier
172 │     // before indexing, bar's position will be [0] which will be inaccurate and will make the
173 │     // backend enable to find the corresponding node when we request its properties.
174 ▶     if (!showCommentNodes) {
175 ▶       indexedForest = filterCommentNodes(indexedForest);
176 │     }
177 │ 
178 ▶     const flattenedCollection = this._treeFlattener.flattenNodes(indexedForest) as FlatNode[];
179 │ 
````

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/component-data-source/index.ts` L180–205 （▶ の行: 180, 183–184, 187–190, 192, 195–197, 201–202）

```ts
180 ▶     this.data.forEach((i) => (i.newItem = false));
181 │ 
182 │     const expandedNodes: Record<string, boolean> = {};
183 ▶     this.data.forEach((item) => {
184 ▶       expandedNodes[item.id] = this._treeControl.isExpanded(item);
185 │     });
186 │ 
187 ▶     const {newItems, movedItems, removedItems} = diff<FlatNode>(
188 ▶       this._differ,
189 ▶       this.data,
190 ▶       flattenedCollection,
191 │     );
192 ▶     this._treeControl.dataNodes = this.data;
193 │     this._flattenedData.next(this.data);
194 │ 
195 ▶     movedItems.forEach((i) => {
196 ▶       this._nodeToFlat.set(i.original, i);
197 ▶       if (expandedNodes[i.id]) {
198 │         this._treeControl.expand(i);
199 │       }
200 │     });
201 ▶     newItems.forEach((i) => (i.newItem = true));
202 ▶     removedItems.forEach((i) => this._nodeToFlat.delete(i.original));
203 │ 
204 │     return {newItems, movedItems, removedItems};
205 │   }
```

1. **160〜176 行目：位置を付けてから、コメントのノードを外す**

   162〜173 行目のコメントのとおり、先に位置を付けてから `#comment` を外します。外してから付けると位置がずれ、バックエンドに「この位置のプロパティを」と頼んだときに別のノードを指してしまうからです。
2. **178 行目：平らにする**

   入れ子の森が、上から順の `FlatNode` の列になります。
3. **182〜185 行目：開いていた行を id で覚える**

   差分のあとで行のオブジェクトが入れ替わっても、開いていた状態を戻せるようにします（195〜200 行目）。
4. **187〜191 行目：今の行の列（`this.data`）を、新しい列に合わせて書き換える**

   `diff` は 1 つ目の配列を**その場で**書き換えます（5 節）。だから 192〜193 行目では同じ `this.data` をそのまま流します。
5. **201〜202 行目：新しい行に印、消えた行を忘れる**

   `newItem` は tree-node の `new-node` のクラスになり、増えた行が一瞬光ります。

## 5. diff：行のオブジェクトをできるだけ使い回す

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/diffing/index.ts` L25–59 （▶ の行: 30–31, 40, 55–56, 58）

```ts
25 │ export const diff = <T extends Record<string, any>>(
26 │   differ: DefaultIterableDiffer<T>,
27 │   a: T[],
28 │   b: T[],
29 │ ): {newItems: T[]; removedItems: T[]; movedItems: T[]; updatedItems: T[]} => {
30 ▶   differ.diff(a);
31 ▶   differ.diff(b);
32 │ 
33 │   const alreadySet: boolean[] = [];
34 │   const movedItems: T[] = [];
35 │   const alteredItems = new Set<number>();
36 │ 
37 │   // We first have to set the moved items to their correct positions.
38 │   // Keep in mind that the track by function may not guarantee
39 │   // that we haven't changed any of the items' props.
40 ▶   differ.forEachMovedItem((record) => {
41 │     if (record.currentIndex === null) {
42 │       return;
43 │     }
44 │     if (record.previousIndex === null) {
45 │       return;
46 │     }
47 │     // We want to preserve the reference so that a default
48 │     // track by function used by the CDK, for instance, can
49 │     // recognize that this item's identity hasn't changed.
50 │     // At the same time, since we don't have the guarantee
51 │     // that we haven't already set the previousIndex while
52 │     // iterating, we need to check that. If we have, we assign
53 │     // this array item to a new object. We don't want to risk
54 │     // changing the properties of an object we'll use in the future.
55 ▶     if (!alreadySet[record.previousIndex]) {
56 ▶       a[record.currentIndex] = a[record.previousIndex];
57 │     } else {
58 ▶       a[record.currentIndex] = {} as unknown as T;
59 │     }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/diffing/index.ts` L60–96 （▶ の行: 60, 65, 67–68, 71, 78, 80, 87, 91–92, 95）

```ts
60 ▶     Object.keys(b[record.currentIndex]).forEach((prop) => {
61 │       // TypeScript's type inference didn't follow the check from above.
62 │       if (record.currentIndex === null) {
63 │         return;
64 │       }
65 ▶       (a[record.currentIndex] as any)[prop] = b[record.currentIndex][prop];
66 │     });
67 ▶     if (!alreadySet[record.previousIndex]) {
68 ▶       a[record.previousIndex] = null!;
69 │     }
70 │     alreadySet[record.currentIndex] = true;
71 ▶     movedItems.push(a[record.currentIndex]);
72 │     alteredItems.add(record.currentIndex);
73 │   });
74 │ 
75 │   // Now we can set the new items and remove the deleted ones.
76 │   const newItems: T[] = [];
77 │   const removedItems: T[] = [];
78 ▶   differ.forEachAddedItem((record) => {
79 │     if (record.currentIndex !== null && record.previousIndex === null) {
80 ▶       a[record.currentIndex] = record.item;
81 │       alreadySet[record.currentIndex] = true;
82 │       newItems.push(record.item);
83 │       alteredItems.add(record.currentIndex);
84 │     }
85 │   });
86 │ 
87 ▶   differ.forEachRemovedItem((record) => {
88 │     if (record.previousIndex === null) {
89 │       return;
90 │     }
91 ▶     if (record.currentIndex === null && !alreadySet[record.previousIndex]) {
92 ▶       a[record.previousIndex] = null!;
93 │       alteredItems.add(record.previousIndex);
94 │     }
95 ▶     removedItems.push(record.item);
96 │   });
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/diffing/index.ts` L98–122 （▶ の行: 99, 108–110, 116–118）

```ts
 98 │   const updatedItems: T[] = [];
 99 ▶   differ.forEachIdentityChange((record) => {
100 │     const currIdx = record.currentIndex;
101 │ 
102 │     // For all remaining cases, where we detect an identity/ref change,
103 │     // but the index hasn't changed, that is, an update of the object's
104 │     // internals*, we update the internal properties with the new internals
105 │     // similarly to 'forEachMovedItem'.
106 │     // * Simply said, this handles object updates where the position/index
107 │     // remains the same.
108 ▶     if (currIdx !== null && currIdx === record.previousIndex && !alteredItems.has(currIdx)) {
109 ▶       for (const prop of Object.keys(b[currIdx])) {
110 ▶         (a[currIdx] as any)[prop] = b[currIdx][prop];
111 │       }
112 │       updatedItems.push(a[currIdx]);
113 │     }
114 │   });
115 │ 
116 ▶   for (let i = a.length - 1; i >= 0; i--) {
117 ▶     if (a[i] === null) {
118 ▶       a.splice(i, 1);
119 │     }
120 │   }
121 │ 
122 │   return {newItems, removedItems, movedItems, updatedItems};
```

1. **30〜31 行目：前の列、新しい列の順に differ に見せる**

   1 回目で differ に「今はこう」と覚えさせ、2 回目で「こう変わった」を計算させます。差分は trackBy の文字列（4 節）で比べます。
2. **40〜73 行目：動いた行**

   55〜56 行目、まだ上書きしていなければ**前の行のオブジェクトを新しい場所へ動かし**、60〜66 行目で新しい行の中身を写します。47〜54 行目のコメントのとおり、CDK の既定の trackBy（オブジェクトが同じか）で「同じ行」と分かるようにするためです。ただし動かし元をもう上書きしていたら、58 行目で新しい空のオブジェクトにします（記録の 2 回目の update の `6-`）。
3. **78〜96 行目：増えた行と消えた行**

   増えた行は 80 行目で新しい列の行をそのまま置き、消えた行は 92 行目で `null` にしておきます。
4. **99〜114 行目：場所は同じで中身が変わった行**

   trackBy の文字列は同じでもオブジェクトが別（毎回の update で行は作り直される）なので、ここで中身だけを前のオブジェクトに写します。**動かず、増えも消えもしない行は、オブジェクトがずっと同じ**です。
5. **116〜120 行目：null を詰める**

## 6. 検索：名前の文字列と、絞り込みの文字列の解釈

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest.component.ts` L321–347 （▶ の行: 322, 329–332, 334, 337, 344–345）

```ts
321 │   isEditingDirectiveState(event: Event): boolean {
322 ▶     return (event.target as Element).tagName === 'INPUT' || !this.selectedNode();
323 │   }
324 │ 
325 │   handleFilter(filterFn: FilterFn): void {
326 │     this.currentlyMatchedIndex.set(-1);
327 │     this.matchedNodes.set(new Map());
328 │ 
329 ▶     for (let i = 0; i < this.dataSource.data.length; i++) {
330 ▶       const node = this.dataSource.data[i];
331 ▶       const fullName = getFullNodeNameString(node);
332 ▶       const matches = filterFn(fullName);
333 │ 
334 ▶       if (matches.length) {
335 │         this.matchedNodes.update((matched) => {
336 │           const map = new Map(matched);
337 ▶           map.set(i, matches);
338 │           return map;
339 │         });
340 │       }
341 │     }
342 │ 
343 │     // Select the first match, if there are any.
344 ▶     if (this.matchesCount()) {
345 ▶       this.navigateMatchedNode('next');
346 │     }
347 │   }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest-utils.ts` L39–55 （▶ の行: 41, 51–52, 54）

```ts
39 │ /** Returns the `FlatNode`'s directive array string. */
40 │ export const getDirectivesArrayString = (node: FlatNode): string =>
41 ▶   node.directives ? node.directives.map((dir) => `[${dir}]`).join('') : '';
42 │ 
43 │ export const matchesDirectiveOrComponentId = (node: FlatNode, id: number | null): boolean =>
44 │   id !== null &&
45 │   (node.original.component?.id === id ||
46 │     !!node.original.directives?.some((directive) => directive.id === id));
47 │ 
48 │ /** Returns the full node name string as rendered by the tree-node component. */
49 │ export const getFullNodeNameString = (node: FlatNode): string => {
50 │   const cmp = node.original.component;
51 ▶   if (cmp && cmp.isElement) {
52 ▶     return `<${node.name}/>`;
53 │   }
54 ▶   return node.name + getDirectivesArrayString(node);
55 │ };
```

検索の入力が変わると、329 行目で**閉じている行も含めた全部の行**（`dataSource.data`）を回り、331 行目でそれぞれの「名前の文字列」を作って、332 行目で絞り込みの関数に渡します。名前の文字列は 54 行目の `名前[ディレクティブ][ディレクティブ]` で、カスタム要素（`isElement`）のコンポーネントだけは 51〜52 行目の `<名前/>` です。当たった行は 337 行目で番号ごとに覚え、344〜346 行目で最初の当たりへ移ります。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest-filter-fn-generator.ts` L82–115 （▶ の行: 86, 89–91, 100–102, 108, 112）

```ts
 82 │ export function tokenizeDirectiveForestFilter(text: string): Token[] {
 83 │   const tokens: Token[] = [];
 84 │   let buffer = '';
 85 │ 
 86 ▶   const attemptToPushToken = (i: number) => {
 87 │     if (buffer) {
 88 │       tokens.push({
 89 ▶         value: buffer,
 90 ▶         type: 'text',
 91 ▶         idx: i - buffer.length,
 92 │       });
 93 │       buffer = '';
 94 │     }
 95 │   };
 96 │ 
 97 │   for (let i = 0; i < text.length; i++) {
 98 │     const char = text[i];
 99 │ 
100 ▶     if (TERMINAL_CHAR.includes(char)) {
101 ▶       attemptToPushToken(i);
102 ▶       tokens.push({
103 │         type: CHAR_TO_TOKEN[char],
104 │         value: char,
105 │         idx: i,
106 │       });
107 │     } else {
108 ▶       buffer += char;
109 │     }
110 │   }
111 │ 
112 ▶   attemptToPushToken(text.length);
113 │ 
114 │   return tokens;
115 │ }
```

文字列を 1 文字ずつ見て、同じファイルの定数 `TERMINAL_CHAR` の `[ ] < > / 空白` のどれかなら、それまでためた文字（108 行目の `buffer`）を `text` の字句にし（86〜95 行目）、記号そのものも字句にします。`idx` は元の文字列の中の位置で、あとで印を付ける範囲になります。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest-filter-fn-generator.ts` L121–153 （▶ の行: 135–136, 139, 144–145, 147）

```ts
121 │ export function parseDirectiveForestFilter(tokens: Token[]): ParsedFilter {
122 │   const filter: ParsedFilter = {
123 │     directives: [],
124 │   };
125 │ 
126 │   if (!tokens.length) {
127 │     return filter;
128 │   }
129 │ 
130 │   let tokenIdx = 0;
131 │   let token: Token | undefined;
132 │   const nextToken = () => tokens[tokenIdx++];
133 │   const hasTokens = () => tokenIdx < tokens.length;
134 │ 
135 ▶   const parseComponent = () => {
136 ▶     return token ? toParserValue(token) : undefined;
137 │   };
138 │ 
139 ▶   const parseDirectives = () => {
140 │     const directives = [];
141 │ 
142 │     while (hasTokens()) {
143 │       token = nextToken();
144 ▶       if (token.type === 'text') {
145 ▶         directives.push(toParserValue(token));
146 │       }
147 ▶       if (token.type === 'closing_bracket') {
148 │         break;
149 │       }
150 │     }
151 │ 
152 │     return directives;
153 │   };
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest-filter-fn-generator.ts` L154–181 （▶ の行: 155, 158, 168–169, 171–172, 174–175）

```ts
154 │ 
155 ▶   const parseElement = () => {
156 │     while (hasTokens()) {
157 │       token = nextToken();
158 ▶       if (token.type === 'text') {
159 │         return toParserValue(token);
160 │       }
161 │     }
162 │     return;
163 │   };
164 │ 
165 │   while (hasTokens()) {
166 │     token = nextToken();
167 │     switch (token.type) {
168 ▶       case 'opening_bracket':
169 ▶         filter.directives = filter.directives.concat(parseDirectives());
170 │         break;
171 ▶       case 'text':
172 ▶         filter.component = parseComponent();
173 │         break;
174 ▶       case 'chevron_left':
175 ▶         filter.element = parseElement();
176 │         break;
177 │     }
178 │   }
179 │ 
180 │   return filter;
181 │ }
```

- ふつうの文字（171〜173 行目）は**コンポーネントの名前**。最後に出た 1 つが残ります。
- `[` のあと（168〜169 行目）は、`]` までの文字が全部**ディレクティブの名前**（139〜153 行目）。`[a b]` と `[a][b]` は同じ意味です。
- `<` のあと（174〜175 行目）は、次の文字が**要素の名前**（155〜163 行目）。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest-filter-fn-generator.ts` L188–215 （▶ の行: 189–190, 193–194, 196, 198, 206–207, 210, 212–213）

```ts
188 │ export const directiveForestFilterFnGenerator: FilterFnGenerator = (filter: string): FilterFn => {
189 ▶   const filterTokens = tokenizeDirectiveForestFilter(filter.toLowerCase());
190 ▶   const parsedFilter = parseDirectiveForestFilter(filterTokens);
191 │ 
192 │   return (target: string) => {
193 ▶     if (!filter) {
194 ▶       return [];
195 │     }
196 ▶     if (!parsedFilter.element && !parsedFilter.component && !parsedFilter.directives.length) {
197 │       // Fallback – standard string search.
198 ▶       const match = checkForMatch(
199 │         {value: filter.toLowerCase(), idx: 0},
200 │         {value: target.toLowerCase(), idx: 0},
201 │       );
202 │       return match ? [match] : [];
203 │     }
204 │ 
205 │     const matches = [];
206 ▶     const targetTokens = tokenizeDirectiveForestFilter(target.toLowerCase());
207 ▶     const parsedTarget = parseDirectiveForestFilter(targetTokens);
208 │ 
209 │     if (parsedFilter.element) {
210 ▶       const elementMatch = checkForMatch(parsedFilter.element, parsedTarget.element);
211 │       // The element cannot have component and/or directive(s).
212 ▶       if (elementMatch) {
213 ▶         return [elementMatch];
214 │       }
215 │     }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest-filter-fn-generator.ts` L216–244 （▶ の行: 217–220, 225, 227–229, 237–238）

```ts
216 │ 
217 ▶     if (parsedFilter.component) {
218 ▶       const componentMatch = checkForMatch(parsedFilter.component, parsedTarget.component);
219 ▶       if (!componentMatch) {
220 ▶         return [];
221 │       }
222 │       matches.push(componentMatch);
223 │     }
224 │ 
225 ▶     if (parsedFilter.directives.length) {
226 │       let matchesCount = 0;
227 ▶       for (const targetDir of parsedTarget.directives) {
228 ▶         for (const filterDir of parsedFilter.directives) {
229 ▶           const dirMatch = checkForMatch(filterDir, targetDir);
230 │           if (dirMatch) {
231 │             matches.push(dirMatch);
232 │             matchesCount++;
233 │           }
234 │         }
235 │       }
236 │       // Should have full directives match.
237 ▶       if (matchesCount < parsedFilter.directives.length) {
238 ▶         return [];
239 │       }
240 │     }
241 │ 
242 │     return matches;
243 │   };
244 │ };
```

1. **189〜190 行目：絞り込みの文字列は 1 回だけ解釈する**

   小文字にしてから解釈し、返す関数（192 行目から）が行ごとに呼ばれます。行の名前の側も 206〜207 行目で小文字にして同じ解釈に通します。だから大文字小文字は区別しません。
2. **196〜203 行目：何も解釈できなければ、ただの部分一致**
3. **209〜215 行目：要素の名前は、行の側にも要素の名前があるときだけ当たる**

   行の名前の文字列に `<` があるのは 51〜52 行目のカスタム要素だけです。**ふつうの Angular のコンポーネントや `input` の行は、`<app-row` では当たりません**（記録）。当たれば 213 行目で、ほかを見ずに返します。
4. **217〜223 行目：コンポーネントの名前は部分一致、外れたら 0 件**
5. **225〜239 行目：書いたディレクティブが全部当たったときだけ**

   237 行目、当たった数が書いた数より少なければ 0 件です。`app-button[UiFocus]` は、`app-button` に `UiFocus` が無いので 0 件です。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/tree-node/tree-node.component.ts` L140–158 （▶ の行: 144, 147, 150, 152）

```ts
140 │   private buildMatchedTextElement(textMatches: NodeTextMatch[]) {
141 │     const matchedText = this.renderer.createElement('span');
142 │     this.renderer.addClass(matchedText, 'matched-text');
143 │ 
144 ▶     const name = this.nodeNameString();
145 │     let lastMatchEndIdx = 0;
146 │ 
147 ▶     for (const {startIdx, endIdx} of textMatches) {
148 │       if (lastMatchEndIdx < startIdx) {
149 │         // Filler/non-marked text
150 ▶         this.appendText(matchedText, name.slice(lastMatchEndIdx, startIdx), false);
151 │       }
152 ▶       this.appendText(matchedText, name.slice(startIdx, endIdx), true);
153 │       lastMatchEndIdx = endIdx;
154 │     }
155 │ 
156 │     this.matchedText = matchedText;
157 │     this.renderer.appendChild(this.nodeName().nativeElement, this.matchedText);
158 │   }
```

当たった範囲（`startIdx`・`endIdx`）は tree-node に渡り、144 行目で同じ名前の文字列を作って、147〜154 行目で当たったところを `<mark>` に、ほかをテキストのノードにします。下の DEMO の印も、記録の範囲で同じように切ったものです。

## 7. 選ぶ・パンくず

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest.component.ts` L229–244 （▶ の行: 230–231, 234–236）

```ts
229 │   select(node: FlatNode): void {
230 ▶     if (node.static) {
231 ▶       return;
232 │     }
233 │ 
234 ▶     this.populateParents(node.position);
235 ▶     this.selectNode.emit(node.original);
236 ▶     this.selectedNode.set(node);
237 │   }
238 │ 
239 │   clearSelectedNode(): void {
240 │     this.selectNode.emit(null);
241 │     this.selectedNode.set(null);
242 │     this.parents = [];
243 │     this.setParents.emit(null);
244 │   }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest.component.ts` L414–428 （▶ の行: 416–419, 423–424, 427）

```ts
414 │   private populateParents(position: ElementPosition): void {
415 │     this.parents = [];
416 ▶     for (let i = 1; i <= position.length; i++) {
417 ▶       const current = position.slice(0, i);
418 ▶       const selectedNode = this.dataSource.data.find(
419 ▶         (item) => item.position.toString() === current.toString(),
420 │       );
421 │ 
422 │       // We might not be able to find the parent if the user has hidden the comment nodes.
423 ▶       if (selectedNode) {
424 ▶         this.parents.push(selectedNode);
425 │       }
426 │     }
427 ▶     this.setParents.emit(this.parents);
428 │   }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/breadcrumbs/breadcrumbs.component.html` L9–22 （▶ の行: 10, 15–16, 19）

```html
 9 │ <div class="breadcrumbs" #breadcrumbs (scroll)="updateScrollButtonVisibility()">
10 ▶   @for (node of parents(); track $index) {
11 │     <button
12 │       (mouseover)="mouseOverNode.emit(node)"
13 │       (mouseleave)="mouseLeaveNode.emit(node)"
14 │       color="primary"
15 ▶       (click)="handleSelect.emit(node)"
16 ▶       [class.selected]="$last"
17 │       class="breadcrumb"
18 │     >
19 ▶       {{ node.original.component?.name || node.original.tagName }}
20 │     </button>
21 │   }
22 │ </div>
```

230〜232 行目、静的な行（`<html_content>`）は選べません（f48d2769db3 で足された行）。選ぶと 234 行目でパンくずを作り、235 行目で 1 節の `handleNodeSelection` へ知らせます。パンくずは 416〜426 行目で、選んだ行の位置の頭から 1 つずつ（`[0]`・`[0, 2]`・`[0, 2, 1]`）同じ位置の行を探して並べたものです。422 行目のコメントのとおり、コメントのノードを隠していると見つからない段は飛ばします。画面では 19 行目のとおりコンポーネントの名前か `tagName` を出し、16 行目の `$last`（いま選んでいる段）に印を付けます。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/breadcrumbs/breadcrumbs.component.ts` L66–101 （▶ の行: 68–70, 74–75, 78–79, 82–83, 87, 89）

```ts
 66 │   constructor(destroyRef: DestroyRef) {
 67 │     const debouncer = new Debouncer();
 68 ▶     const observer = new ResizeObserver(
 69 ▶       debouncer.debounce(() => {
 70 ▶         this.updateScrollButtonVisibility();
 71 │       }, RESIZE_DEBOUNCE),
 72 │     );
 73 │ 
 74 ▶     afterNextRender(() => {
 75 ▶       observer.observe(this.breadcrumbsScrollContent().nativeElement);
 76 │     });
 77 │ 
 78 ▶     afterRenderEffect({
 79 ▶       read: () => {
 80 │         // We use the parents as a dependency to trigger a layout
 81 │         // update that would show the navigation buttons.
 82 ▶         this.parents();
 83 ▶         untracked(() => this.updateScrollButtonVisibility());
 84 │       },
 85 │     });
 86 │ 
 87 ▶     destroyRef.onDestroy(() => {
 88 │       debouncer.cancel();
 89 ▶       observer.disconnect();
 90 │     });
 91 │   }
 92 │ 
 93 │   scroll(pixels: number): void {
 94 │     this.breadcrumbsScrollContent().nativeElement.scrollLeft += pixels;
 95 │     this.updateScrollButtonVisibility();
 96 │   }
 97 │ 
 98 │   updateScrollButtonVisibility(): void {
 99 │     const {clientWidth, scrollWidth, scrollLeft} = this.breadcrumbsScrollContent().nativeElement;
100 │     this.breadcrumbsScrollLayout.set({clientWidth, scrollWidth, scrollLeft});
101 │   }
```

パンくずが横に長いと、左右に送る矢印のボタンが出ます。`git show f746463caa5`（2026-08-07、fix）で読むと、前は `effect` の中で `ResizeObserver` を作って要素の大きさの変化だけを見ていたので、**深い行を選んでパンくずが長くなっても、枠の大きさが変わらない限り矢印が出ませんでした**（コミットのメッセージ：分割の幅を変えたときだけ出た）。後は、74〜76 行目で描画のあとに見張りを始め、78〜85 行目の `afterRenderEffect` が 82 行目で `parents()` を読むので、パンくずが変わって描かれるたびに 83 行目で矢印の要否を計算し直します。大きさの変化の方は 68〜72 行目で 100 ms にまとめます。このコミットに spec の追加はありません（パンくずの spec は無い）。

> [!NOTE]
> **ポイント**
>
> 同じく spec の無い修正に 4b83d09a94c（2026-07-28、fix）があります。`git show` で読むと、6 節の引用の 322 行目が `!this.selectedNode`（signal の関数そのもの。いつも真なので `!` を付けるといつも偽）になっていたのを、`!this.selectedNode()` に直した 1 行です。前は「何も選んでいない」ときの守りが効かず、何も選ばずに ↓ キーを押すと、`navigateDown` が選んだ行の無いまま進んで TypeError になっていました（コミットのメッセージ）。変わったのは directive-forest.component.ts の 1 行だけです。

## 8. DEMO：本物の ComponentDataSource と検索の関数に、届いた森を通す

> **🧪 DEMO — update の結果と、検索の文字列ごとの当たり（記録の再生）**
>
> これは記録です。本物の devtools のソース（angular/angular の devtools/、8576f161ae4）を、本物の @angular/core 22.1.6（開発モード）のアプリにつないで Node で動かした結果です。アプリは platform-server（domino）に描画し、バックエンドから bus で受け取った forest を、パネルの本物の `ComponentDataSource`（`@angular/cdk` の `FlatTreeControl` と `@angular/material` の `MatTreeFlattener` ごと束ねたもの）の `update` に 2 回通しました。検索は、2 回目のあとの全部の行に `directiveForestFilterFnGenerator` の関数を当てたものです（6 節の 329〜341 行目と同じ回し方）。画面の部品（`DirectiveForestComponent`）そのものは動かしていません。
>
> update のボタンを押してください。
>
> 検索の文字列を選んでください（2 回目の update のあとの行に当てた結果）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-forest-ui)

記録から読み取れることです。

1. **1 回目：全部が新しい行、id は 4 節の作り方どおり**

   `app-root` は `0-`（コンポーネントの id 0、ディレクティブ無し）、`app-button[UiTooltip]` は `1-2`、ディレクティブだけの `input` は `-3-4`、塊は `forId-0-1`、`<html_content>` は `-` です。HTML だけの 2 つ目の `@for` は子が全部静的なので `collapsedByDefault: true` で、パネルでは最初から閉じています。
2. **2 回目：c を先頭へ、b を消し、d を足す**

   newItems は `d`（`13-`）、removedItems は `b`（`7-`）、movedItems は `c`（`8-`）と `a`（`6-`）です。id はバックエンドの `IdentityTracker` の数（[第 7 回](07-devtools-identity.md)）なので、動いても同じです。
3. **動いた行のうち a だけ、オブジェクトが替わった**

   `c` が先に `a` の場所（4 番）へ動いて上書きしたので、`a` を動かすときには動かし元がもう使われていて、5 節の 58 行目で新しいオブジェクトになりました。ほかの動かない行は、全部 1 回目と同じオブジェクトです。
4. **検索：大文字小文字を区別せず、要素の検索はカスタム要素だけ**

   `ROW` は `row` と同じく 3 行に当たります。`<app-row` と `<input` は 0 件です（6 節の 209〜215 行目）。`[UiFocus UiTooltip]` は両方を持つ `input` だけ、`@for` はコンポーネントの名前として 2 つの塊の行に当たります。

📄 `scratchpad の記録スクリプト（forest-ui.ts、共通の build.mjs で束ねて node で実行。共通の harness.ts は第 1 回に全文）`

```
// 第 8 回 devtools-forest-ui の記録。
// バックエンドから届いた forest（第 5〜7 回と同じ getLatestComponentExplorerView）を、
// パネルの側の本物の関数に通す。
//   - ComponentDataSource.update（平らな行の列にする。中で indexForest と diff を使う）
//   - directiveForestFilterFnGenerator（検索の文字列 → 当たった範囲）と、その中の tokenize / parse
//   - getFullNodeNameString（検索の対象になる文字列）
// 使い方: node ../_shared/build.mjs forest-ui.ts forest-ui.mjs && node forest-ui.mjs
// harness を先に読む（中で @angular/compiler を読み込む。cdk・material の部品は JIT のコンパイルが要る）
import { bootApp, makeBus, loadBackend, tick, writeJson } from '../_shared/harness';
import { Component, Directive, Input, VERSION, signal } from '@angular/core';
import { FlatTreeControl } from '@angular/cdk/tree';
import { ComponentDataSource } from '~/angular-research/angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/component-data-source';
import {
  directiveForestFilterFnGenerator,
  parseDirectiveForestFilter,
  tokenizeDirectiveForestFilter,
} from '~/angular-research/angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest-filter-fn-generator';
import { getFullNodeNameString } from '~/angular-research/angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest-utils';

const OUT = new URL('./forest-ui.json', import.meta.url).pathname;

@Directive({ selector: '[appTooltip]' })
class UiTooltip {}
@Directive({ selector: '[appFocus]' })
class UiFocus {}
@Component({ selector: 'app-button', template: '<button>ok</button>' })
class UiButton {}
@Component({ selector: 'app-row', template: '<span>{{ label }}</span>' })
class UiRow {
  @Input() label = '';
}

const TEMPLATE = `<app-button appTooltip />
<input appFocus appTooltip />
<ul>
  @for (item of items(); track item) {
    <app-row [label]="item" />
  }
</ul>
<ol>
  @for (n of [1, 2]; track $index) {
    <li>{{ n }}</li>
  }
</ol>`;

@Component({ selector: 'app-root', imports: [UiTooltip, UiFocus, UiButton, UiRow], template: TEMPLATE })
class UiRoot {
  items = signal(['a', 'b', 'c']);
}

const { appRef } = await bootApp(UiRoot);
const { initializeMessageBus } = await loadBackend();
const ng = (globalThis as any).ng;
const cmp = ng.getComponent(document.querySelector('app-root')) as UiRoot;
const { bus, send, take } = makeBus();
initializeMessageBus(bus as any);

async function requestForest() {
  await appRef.whenStable();
  send('getLatestComponentExplorerView', [undefined]);
  await tick(10);
  const forest = (take().find((m) => m.topic === 'latestComponentExplorerView')!.args[0] as any).forest;
  // resolutionPath はこの章では使わないので落とす（パネルに届く形はそのまま）
  const strip = (n: any): any => {
    const { resolutionPath, ...rest } = n;
    return { ...rest, children: n.children.map(strip) };
  };
  return forest.map(strip);
}

// directive-forest.component.ts の treeControl と同じ作り（141〜144 行目）
const treeControl = new FlatTreeControl<any>(
  (node) => node!.level,
  (node) => node.expandable,
);
const dataSource = new ComponentDataSource(treeControl);
const flat = (n: any) => ({
  id: n.id,
  name: n.name,
  directives: n.directives,
  level: n.level,
  position: n.position.join('.'),
  expandable: n.expandable,
  collapsedByDefault: n.collapsedByDefault,
  static: n.static,
  hasNativeElement: n.hasNativeElement,
  newItem: n.newItem ?? false,
  fullName: getFullNodeNameString(n),
});
const names = (xs: any[]) => xs.map((x) => `${x.name}（${x.id}）`);

const updates: any[] = [];
const forestA = await requestForest();
let r = dataSource.update(forestA, false);
updates.push({
  id: 'first',
  title: '最初の木',
  action: "items = ['a', 'b', 'c']",
  forest: forestA,
  rows: dataSource.data.map(flat),
  newItems: names(r.newItems),
  movedItems: names(r.movedItems),
  removedItems: names(r.removedItems),
});
const firstRefs = new Set(dataSource.data);

cmp.items.set(['c', 'a', 'd']);
const forestB = await requestForest();
r = dataSource.update(forestB, false);
updates.push({
  id: 'second',
  title: '変えたあとの木',
  action: "items.set(['c', 'a', 'd'])（b を消し、c を先頭へ、d を足す）",
  forest: forestB,
  rows: dataSource.data.map((n) => ({ ...flat(n), sameObject: firstRefs.has(n) })),
  newItems: names(r.newItems),
  movedItems: names(r.movedItems),
  removedItems: names(r.removedItems),
});

// 検索：directive-forest.component.ts の handleFilter（329〜341 行目）と同じく、行ごとに getFullNodeNameString を渡す
const QUERIES = ['row', 'app-row', '[UiTooltip]', 'app-button[UiTooltip]', '[UiFocus UiTooltip]', '<app-row', '<input', '@for', 'ROW', 'app-button[UiFocus]', 'zzz'];
const rows = dataSource.data;
const filters = QUERIES.map((q) => {
  const fn = directiveForestFilterFnGenerator(q);
  return {
    query: q,
    tokens: tokenizeDirectiveForestFilter(q.toLowerCase()),
    parsed: parseDirectiveForestFilter(tokenizeDirectiveForestFilter(q.toLowerCase())),
    hits: rows
      .map((n, i) => ({ index: i, fullName: getFullNodeNameString(n), matches: fn(getFullNodeNameString(n)) }))
      .filter((h) => h.matches.length),
  };
});

await writeJson(OUT, { core: VERSION.full, template: TEMPLATE, updates, filters });
process.exit(0);

```

## ここまでの呼び出し

- `DirectiveExplorerComponent.refresh()` → `emit('getLatestComponentExplorerView', [query])` — directive-explorer.component.ts 233
  - `on('latestComponentExplorerView')` → `forest.set(view.forest)` — directive-explorer.component.ts 219
    - `effect(() => updateForest(forest()))` — directive-forest.component.ts 167・384
      - `ComponentDataSource.update(forest, showCommentNodes)` — component-data-source/index.ts 152
        - `indexForest` → `filterCommentNodes` → `MatTreeFlattener.flattenNodes` — index-forest/index.ts 45・component-data-source 76・178
        - `diff(differ, this.data, flattened)` — diffing/index.ts 25
- 👤 `handleFilter(filterFn)` → `getFullNodeNameString(node)` → `filterFn(fullName)` — directive-forest.component.ts 325・utils 49・filter-fn-generator 192 — *検索の入力*
- 👤 `select(node)` → `populateParents(position)` → `selectNode.emit` — directive-forest.component.ts 229・414 — *行をクリック*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット（`…/directive-explorer/` の下） |
| --- | --- | --- |
| directive-forest/directive-forest-filter-fn-generator.spec.ts ・ directive-forest-utils.spec.ts | describe `directive-forest-filter-fn-generator`（38 行目）の `tokenizeDirectiveForestFilter`（39、it 6 件）・`parseDirectiveForestFilter`（96、it 14 件）・`directiveForestFilterFnGenerator`（299、it 17 件）と、describe `directive-forest-utils`（it 9 件）。合わせて 46 件 | `directive-forest:test` |
| directive-forest/component-data-source/component-data-source.spec.ts | describe `ComponentDataSource`（214 行目、it 3 件） | `directive-forest/component-data-source:test` |
| diffing/diffing.spec.ts | describe `diff`（17 行目、it 5 件） | `diffing:test` |
| directive-forest/index-forest/index-forest.spec.ts ・ tree-node/tree-node.component.spec.ts | describe `indexForest`（it 2 件）・`TreeNodeComponent`（70 行目、it 25 件。名前の印は 167〜215 行目の 5 件） | `directive-forest/index-forest:test`・`directive-forest/tree-node:test` |
| directive-explorer.spec.ts | describe `DirectiveExplorerComponent`（174 行目）の `refresh`（201、it 3 件）・`node selection event`（232）など | `directive-explorer:test` |

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/component-data-source/component-data-source.spec.ts` L223–233 （▶ の行: 224, 226, 228, 231–232）

```ts
223 │   it('should return new and old items', () => {
224 ▶     const result = dataSource.update([tree1], true);
225 │     expect(result.movedItems.length).toBe(0);
226 ▶     expect(result.newItems.length).toBe(2);
227 │ 
228 ▶     const updatedResult = dataSource.update([tree2], true);
229 │     expect(updatedResult.movedItems.length).toBe(0);
230 │     expect(updatedResult.removedItems.length).toBe(0);
231 ▶     expect(updatedResult.newItems.length).toBe(1);
232 ▶     expect(updatedResult.newItems[0].name).toBe('qux');
233 │   });
```

`update` を 2 回呼んで、2 回目の返り値の `newItems` が 1 件（`qux`）だけであることを確かめます。DEMO の 2 回目の update と同じ確かめ方です。`movedItems` の中身や「オブジェクトを使い回したか」を確かめる it はありません。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-forest/directive-forest-filter-fn-generator.spec.ts` L412–434 （▶ の行: 413–414, 420–421, 425–426, 432–433）

```ts
412 │     it('should be able to distinguish between a component and a directive with the same name', () => {
413 ▶       const filterFn = directiveForestFilterFnGenerator('[app-foo]');
414 ▶       const matches = filterFn('app-foo[app-foo]');
415 │ 
416 │       expect(matches.length).toEqual(1);
417 │ 
418 │       const [match] = matches;
419 │ 
420 ▶       expect(match.startIdx).toEqual(8);
421 ▶       expect(match.endIdx).toEqual(15);
422 │     });
423 │ 
424 │     it('should match an element', () => {
425 ▶       const filterFn = directiveForestFilterFnGenerator('<app-element />');
426 ▶       const matches = filterFn('<app-element />');
427 │ 
428 │       expect(matches.length).toEqual(1);
429 │ 
430 │       const [match] = matches;
431 │ 
432 ▶       expect(match.startIdx).toEqual(1);
433 ▶       expect(match.endIdx).toEqual(12);
434 │     });
```

413〜421 行目は、`[app-foo]` がコンポーネントの `app-foo` ではなくディレクティブの方（8〜15 文字目）に当たることを確かめます。425〜433 行目の要素の it は、行の側も `<app-element />` の形で渡しています。ふつうのコンポーネントの行（`app-row`）に `<app-row` で探す it は無く、DEMO の 0 件はこの spec の外の振る舞いです。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
Q=//devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer
pnpm bazel test $Q/directive-forest:test $Q/directive-forest/component-data-source:test \
  $Q/diffing:test $Q/directive-forest/index-forest:test $Q/directive-forest/tree-node:test \
  --nocache_test_results --test_output=all
pnpm bazel test $Q:test --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/devtools-logs/b-bazel.log・b-bazel-explorer.log）`

```
directive-forest/test_bundle.spec.js                        46 passed, 0 failed
directive-forest/component-data-source/test_bundle.spec.js   3 passed, 0 failed
diffing/test_bundle.spec.js                                  5 passed, 0 failed
directive-forest/index-forest/test_bundle.spec.js            2 passed, 0 failed
directive-forest/tree-node/test_bundle.spec.js              25 passed, 0 failed
（それぞれ Chromium・Firefox の両方で同じ件数）
…:test_chromium  PASSED in 1.7〜2.1s ／ …:test_firefox  PASSED in 5.6〜6.2s
（第 5〜7 回の 3 つのターゲットと一緒に 1 回で走らせて INFO: Elapsed time: 9.521s）

directive-explorer/test_bundle.spec.js   Chromium 17 passed, 0 failed ／ Firefox 17 passed, 0 failed
//…/directive-explorer:test_chromium  PASSED in 1.4s ／ :test_firefox  PASSED in 2.5s（INFO: Elapsed time: 4.195s）
```

- `directive-forest:test` の 46 件は、6 + 14 + 17 + 9 の it の数と同じです。
- `DirectiveForestComponent`（directive-forest.component.ts）と `BreadcrumbsComponent` の spec はありません。4b83d09a94c と f746463caa5 は、どちらも spec を足さずに直されています。

### 直すとしたら

- 「検索で当たらない／当たりすぎる」は `directive-forest-filter-fn-generator.ts` で、it は spec の `directiveForestFilterFnGenerator` の describe に「絞り込みの文字列」と「行の名前の文字列」の組で足します。行の名前の文字列は `getFullNodeNameString` の形（`名前[Dir]` か `<名前/>`）で書きます。
- 「描き直すと開いていた行が閉じる・選んだ行が外れる」は `component-data-source/index.ts` の `update`（182〜200 行目）と `diffing/index.ts` です。`component-data-source.spec.ts` の形で `update` を 2 回呼び、`movedItems` と `treeControl.isExpanded` を確かめる it が書けます。
- キーボードの操作やパンくずのように、部品の中で signal と描画のタイミングが絡むものは、spec が無いので、まず tree-node.component.spec.ts（TestBed で部品を描く形）を手本に再現を書きます（[第 19 回](19-devtools-test-build.md)）。
- 本家に PR を出すことは勧めません。パネルの木の issue を読むときは、DEMO と同じく「バックエンドから届いた forest」と「行の列」を分けて、どちらで食い違っているかを確かめます（[第 20 回](20-devtools-issues.md)）。

## 聞かれそうな質問

**Q. パネルは木が届くたびに、全部の行を作り直しているのですか？**

行のオブジェクトは毎回いったん作りますが、`diff` が前の列に写し込みます。動かない行は 99〜114 行目で中身だけを前のオブジェクトに写し、動いた行は 55〜56 行目で前のオブジェクトを動かします。だから CDK の仮想スクロールから見て、多くの行は同じオブジェクトのままです。

**Q. 検索で `<div` や `<app-root` と打っても当たらないのはなぜですか？**

要素の名前の検索は、行の名前の文字列が `<名前/>` の形のときだけ当たるからです（filter-fn-generator の 209〜215 行目）。その形になるのは `getFullNodeNameString` の 51〜52 行目で `isElement`（カスタム要素）のコンポーネントだけです。ふつうは `app-root` のように `<` を付けずに打ちます。

**Q. 検索は、閉じている行の中まで探しますか？**

探します。`handleFilter` は 329 行目で `dataSource.data`（閉じた行も含む全部の行）を回ります。当たった行へ移るときに、その行を開いて見えるようにします（`navigateMatchedNode`）。

**Q. 行の id の `1-2` や `-3-4` は何ですか？**

`getId` の 55〜65 行目が作る「コンポーネントの id」と「ディレクティブの id を小さい順に `-` でつないだもの」です。数はバックエンドの `IdentityTracker` が配ったものです。塊は `forId-0-1` のような文字列をそのまま使います（50 行目）。

**Q. パンくずはどうやって作っていますか？**

選んだ行の位置の頭から 1 段ずつ、同じ位置の行を `dataSource.data` から探して並べます（416〜426 行目）。バックエンドには何も聞きません。

## 読み終えて

- パネルは `componentTreeDirty` や行の選択を合図に木を頼み直し、届いた森を signal に入れるだけです。
- `ComponentDataSource` は位置を付け、コメントを外し、平らにしてから、`diff` で前の行の列に写し込みます。行の同一性は `getId` の文字列と「開けるか」で決まります。
- `diff` は行のオブジェクトをできるだけ使い回し、開いていた行は id で覚え直します。
- 検索の文字列は「名前」「\[ディレクティブ\]」「&lt;要素」に解釈され、行の名前の文字列に当てます。要素の検索はカスタム要素の行だけに当たります。
- パンくずは位置の頭から作ります。矢印の出方の不具合（f746463caa5）とキーボードの守り（4b83d09a94c）は、どちらも spec の無い部品の修正でした。

---

← 前: [同じノードを見分ける：IdentityTracker と id](07-devtools-identity.md)  
次: [プロパティを送れる形にする：state-serializer](09-devtools-state-serializer.md) →
