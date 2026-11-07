[目次](../README.md) › [Angular DevTools の内側](README.md) › 第 10 回 / 全 20 回

# 入れ子を開く：getNestedProperties とプロパティの木

> パネルの property-resolver（DirectivePropertyResolver・PropertyDataSource）が、開いた行の道筋を getNestedProperties でバックエンドへ送り、バックエンドがその道筋の値だけを 1 段直列化して返す流れと、変更検知のあとに開いた行を覚えたまま頼み直す propertyQuery: Specified（deeplySerializeSelectedProperties）。object-tree-explorer の表示。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-property-resolver)

---

[第 9 回](09-devtools-state-serializer.md)で見たとおり、最初に届くプロパティは 1 段目だけで、オブジェクトや配列は `{...}` の preview しか持っていません。この章では、パネルで `▸` を押して行を開いたときに、パネルが「開いた行までの道筋」をバックエンドへ送り、バックエンドがその道筋の先の値だけを直列化して返す往復を、両側の行で追います。あわせて、変更検知のあとに「開いている行を覚えたまま」頼み直す `propertyQuery: Specified` の形も読みます。

読む対象は、パネル側の `ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver/`（`property-data-source.ts`・`arrayify-props.ts`・`flatten.ts`・`property-expanded-directive-properties.ts`）と `shared/object-tree-explorer/`、バックエンド側の `client-event-subscribers.ts` の `getNestedPropertiesCallback` と `state-serializer.ts` の `deeplySerializeSelectedProperties` です。

1. [1. 全体像](01-devtools-overview.md)
2. [2. Angular を見つける](02-devtools-detect.md)
3. [3. メッセージの道](03-devtools-messaging.md)
4. [4. プロトコル](04-devtools-protocol.md)
5. [5. コンポーネントの木](05-devtools-component-tree.md)
6. [6. 制御フローの塊](06-devtools-control-flow.md)
7. [7. 同じノードを見分ける](07-devtools-identity.md)
8. [8. パネルの木](08-devtools-forest-ui.md)
9. [9. プロパティの直列化](09-devtools-state-serializer.md)
10. **10. 入れ子を開く**（この章）
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

## 1. パネルの部品の並び

プロパティの欄は 3 層です。`ElementPropertyResolver`（選んだ要素 1 つ）が、その要素のディレクティブとコンポーネントごとに `DirectivePropertyResolver` を 1 つ作り、それが Inputs・Props・Outputs・Properties の 4 つの欄ごとに `PropertyDataSource` を 1 つずつ持ちます（directive-property-resolver.ts のコンストラクタ。どの欄に入れるかは、メタデータの `inputs`・`outputs` の名前で分ける `_classifyProperties`）。画面に出すのは `ng-object-tree-explorer` で、中身は Angular Material の `mat-tree` です。

木の 1 行は `FlatNode`（`expandable`・`level`・`prop`）で、`prop` は `Property`（`name`・`descriptor`・`parent`）です。**`parent` で親の行をさかのぼれる**ことが、この章の道筋の作り方の土台になります。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver/arrayify-props.ts` L12–27 （▶ の行: 13–14, 17–18, 22–23, 26）

```ts
12 │ export const arrayifyProps = (
13 ▶   props: {[prop: string]: Descriptor} | Descriptor[],
14 ▶   parent: Property | null = null,
15 │ ): Property[] =>
16 │   Object.entries(props)
17 ▶     .map(([name, val]) => ({name, descriptor: val, parent}))
18 ▶     .sort((a, b) => {
19 │       const parsedA = parseInt(a.name, 10);
20 │       const parsedB = parseInt(b.name, 10);
21 │ 
22 ▶       if (isNaN(parsedA) || isNaN(parsedB)) {
23 ▶         return a.name > b.name ? 1 : -1;
24 │       }
25 │ 
26 ▶       return parsedA - parsedB;
27 │     });
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver/flatten.ts` L16–38 （▶ の行: 17, 20–22, 34, 37）

```ts
16 │ export const getTreeFlattener = () =>
17 ▶   new MatTreeFlattener(
18 │     (node: Property, level: number): FlatNode => {
19 │       return {
20 ▶         expandable: expandable(node.descriptor),
21 ▶         prop: node,
22 ▶         level,
23 │       };
24 │     },
25 │     (node) => node.level,
26 │     (node) => node.expandable,
27 │     (node) => getChildren(node),
28 │   );
29 │ 
30 │ export const expandable = (prop: Descriptor) => {
31 │   if (!prop) {
32 │     return false;
33 │   }
34 ▶   if (!prop.expandable) {
35 │     return false;
36 │   }
37 ▶   return !(prop.type !== PropType.Object && prop.type !== PropType.Array);
38 │ };
```

`arrayifyProps` は、`{名前: Descriptor}` を `Property` の配列にし、17 行目で `parent` を付けます。18〜26 行目の並べ替えは、名前が 2 つとも数なら数の順、そうでなければ文字列の順です（だから `0, 1, length` は `length` が後ろに来る）。`getTreeFlattener` の 37 行目、開ける行は Object と Array だけで、Descriptor の `expandable` が `true` のときだけです（34 行目）。

📄 `angular/devtools/projects/ng-devtools/src/lib/shared/object-tree-explorer/object-tree-explorer.component.html` L35–57 （▶ の行: 37, 41, 43, 49）

```html
35 │   <mat-tree-node
36 │     [matTreeNodePaddingIndent]="childrenIndent()"
37 ▶     *matTreeNodeDef="let node; when: hasChild"
38 │     matTreeNodePadding
39 │     [isExpandable]="node.isExpandable"
40 │   >
41 ▶     <button matTreeNodeToggle class="prop-row expandable-node">
42 │       <mat-icon class="expand-icon">
43 ▶         {{ tree.isExpanded(node) ? 'expand_more' : 'chevron_right' }}
44 │       </mat-icon>
45 │       @if (!omitRootNodesNames() || node.level > 0) {
46 │         <span class="name">{{ node.prop.name }}</span
47 │         >:
48 │       }
49 ▶       <span class="value">{{ node.prop.descriptor.preview }}</span>
50 │       @if (contentTemplateRef(); as contentTemplateRef) {
51 │         <ng-container
52 │           [ngTemplateOutlet]="contentTemplateRef"
53 │           [ngTemplateOutletContext]="{$implicit: node}"
54 │         />
55 │       }
56 │     </button>
57 │   </mat-tree-node>
```

開ける行のテンプレートは 37 行目の `when: hasChild` で選ばれ、41 行目のボタンに `matTreeNodeToggle` が付いています。押すと CDK の木の制御（`FlatTreeControl`）の「開いた行の集合」（`expansionModel`）に、その行が入ります。表示する文字は 49 行目の `descriptor.preview` です。

## 2. 開いた行の道筋を送る：\_toggleNode

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver/property-data-source.ts` L62–91 （▶ の行: 63, 67–69, 72, 83, 86）

```ts
62 │   override connect(collectionViewer: CollectionViewer): Observable<FlatNode[]> {
63 ▶     const changed = this._treeControl.expansionModel.changed;
64 │     if (!changed) {
65 │       throw new Error('Unable to subscribe to the expansion model change');
66 │     }
67 ▶     const s = changed.subscribe((change: SelectionChange<FlatNode>) => {
68 ▶       if (change.added) {
69 ▶         change.added.forEach((node) => this._toggleNode(node, true));
70 │       }
71 │       if (change.removed) {
72 ▶         change.removed.reverse().forEach((node) => this._toggleNode(node, false));
73 │       }
74 │     });
75 │     this._subscriptions.push(s);
76 │ 
77 │     const changes = [
78 │       collectionViewer.viewChange,
79 │       this._treeControl.expansionModel.changed,
80 │       this._data,
81 │     ];
82 │ 
83 ▶     return merge<unknown[]>(...changes).pipe(
84 │       map(() => {
85 │         this._expandedData.next(
86 ▶           this._treeFlattener.expandFlattenedNodes(this.data, this._treeControl),
87 │         );
88 │         return this._expandedData.value;
89 │       }),
90 │     );
91 │   }
```

`connect` は、木（`mat-tree`）がこの DataSource を使い始めたときに 1 度呼ばれます。67 行目で `expansionModel.changed` を購読し、69 行目、行が開かれたら `_toggleNode(node, true)`。83〜90 行目は表示の側で、データか開閉が変わるたびに、86 行目の `expandFlattenedNodes` が「開いている親の下の行だけ」を選んで木へ渡します。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver/property-data-source.ts` L98–132 （▶ の行: 103, 107, 109–110, 114, 116, 118, 120, 123, 125–128）

```ts
 98 │   private _toggleNode(node: FlatNode, expand: boolean): void {
 99 │     const index = this.data.indexOf(node);
100 │     // If we cannot find the current node, or the current node is not expandable
101 │     // or...if it's expandable but it does have a value, or we're collapsing
102 │     // we're not interested in fetching its children.
103 ▶     if (index < 0 || !node.expandable || node.prop.descriptor.value || !expand) {
104 │       return;
105 │     }
106 │ 
107 ▶     let parentPath: string[] = [];
108 │     let current = node.prop;
109 ▶     while (current) {
110 ▶       parentPath.push(current.name);
111 │       if (!current.parent) {
112 │         break;
113 │       }
114 ▶       current = current.parent;
115 │     }
116 ▶     parentPath = parentPath.reverse();
117 │ 
118 ▶     this._messageBus.emit('getNestedProperties', [this._entityPosition, parentPath]);
119 │ 
120 ▶     this._messageBus.once(
121 │       'nestedProperties',
122 │       (position: DirectivePosition, data: Properties, _path: string[]) => {
123 ▶         node.prop.descriptor.value = data.props;
124 │         this._treeControl.expand(node);
125 ▶         const props = arrayifyProps(data.props, node.prop);
126 ▶         const flatNodes = this._treeFlattener.flattenNodes(props);
127 ▶         flatNodes.forEach((f) => (f.level += node.level + 1));
128 ▶         this.data.splice(index + 1, 0, ...flatNodes);
129 │         this._data.next(this.data);
130 │       },
131 │     );
132 │   }
```

1. **103 行目：もう値を持っている行は頼まない**

   Descriptor に `value` がある（前に開いた、または 5 節の Specified で中身が届いている）なら、何も送らずに開くだけです。閉じるとき（`!expand`）も送りません。
2. **107〜116 行目：`parent` をさかのぼって道筋を作る**

   `config.theme.colors` の行なら `['config', 'theme', 'colors']`。配列の要素は名前が `'0'` のような文字列です。
3. **118 行目：`getNestedProperties` を送る**

   中身は `[DirectivePosition, 道筋]`。`DirectivePosition` は「要素の位置（`element`）と、その要素の何番目のディレクティブか（`directive`、コンポーネントなら `undefined`）」です。
4. **120〜131 行目：答え `nestedProperties` を `once` で 1 回だけ待つ**

   123 行目で届いた Descriptor の集まりを開いた行の `value` に入れ、125〜127 行目でその下の行を作って 1 段深く（`level`）し、128 行目で開いた行のすぐ下に差し込みます。122 行目の答えの引数（位置と道筋）は**使っていません**。どの頼みへの答えかは「次に届いた 1 つ」で決まります（デモの最後の場面）。

> [!NOTE]
> **ポイント**
>
> パネルの bus は、拡張では `PriorityAwareMessageBus`（protocol、[第 4 回](04-devtools-protocol.md)）で包まれています。`getNestedProperties` を送ってから `nestedProperties` が届くまでの間は、`getLatestComponentExplorerView` を送らずに捨てます（「中身の答えが来る前に画面を頼み直さない」）。デモの記録も、この本物の bus で包んで取りました。

## 3. 道筋をたどって返す：getNestedPropertiesCallback

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L253–281 （▶ の行: 255–256, 260–261, 264, 268–272, 275, 277–278）

```ts
253 │ const getNestedPropertiesCallback =
254 │   (messageBus: MessageBus<Events>) => (position: DirectivePosition, propPath: string[]) => {
255 ▶     const emitEmpty = () => messageBus.emit('nestedProperties', [position, {props: {}}, propPath]);
256 ▶     const node = queryDirectiveForest(
257 │       position.element,
258 │       getDirectiveForestManager().getIndexedDirectiveForest(),
259 │     );
260 ▶     if (!node) {
261 ▶       return emitEmpty();
262 │     }
263 │     const current =
264 ▶       position.directive === undefined ? node.component : node.directives?.[position.directive];
265 │     if (!current) {
266 │       return emitEmpty();
267 │     }
268 ▶     let data = current.instance;
269 ▶     for (const prop of propPath) {
270 ▶       data = unwrapSignal(data[prop]);
271 ▶       if (!data) {
272 ▶         log.error('Cannot access the properties', propPath, 'of', node);
273 │       }
274 │     }
275 ▶     messageBus.emit('nestedProperties', [
276 │       position,
277 ▶       {props: serializeDirectiveState(data)},
278 ▶       propPath,
279 │     ]);
280 │     return;
281 │   };
```

1. **256〜267 行目：位置から木のノードを探し、インスタンスを決める**

   木は送ったときに索引を付けたもの（`getIndexedDirectiveForest`、[第 5 回](05-devtools-component-tree.md)）を使います。見つからなければ 255 行目の空の答え（`props: {}`）を返します。
2. **268〜274 行目：道筋を 1 つずつたどる**

   270 行目、途中が signal なら中身を読んで進みます。だから `state`（signal）の下の `user` も同じ形で開けます。
3. **277 行目：たどり着いた値を `serializeDirectiveState` に通す**

   第 9 回の入口そのものです。上限 0 なので、返るのは**その 1 段だけ**。孫の中身は、また行を開いたときに頼みます。
4. **275〜279 行目：位置・Descriptor・道筋を返す**

   パネルの 122 行目は、このうち 2 つ目しか使いません。

> [!WARNING]
> **ハマりどころ**
>
> 271〜273 行目は、途中の値が無い（`null` など）ときにコンソールへ出すだけで、**`return` しません**。道筋の最後が `null` なら、277 行目で `serializeDirectiveState(null)` になり空の答えが返ります。途中が `null` だと、次の周の 270 行目で `null[prop]` になって TypeError が投げられ、**答えが送られません**。どちらも、パネルの表示が古いうちに値が変わったときに起きます（デモの最後の場面）。

もう 1 つ、配列の行を開くと `length` の行が出ます。277 行目の `serializeDirectiveState` は `getKeys`（第 9 回の 2 節）でキーを集め、`Object.getOwnPropertyNames([…])` には `length` が入るからです。5 節の Specified の道では配列を添字で回すので、頼み直すと `length` の行は消えます（デモの「items を開く」と「頼み直す」を見比べる）。

## 4. 1 往復を 1 本に

- 👤 `▸ をクリック` — object-tree-explorer.component.html 41 — *matTreeNodeToggle*
  - `expansionModel.changed` → `_toggleNode(node, true)` — property-data-source.ts 67・98
    - `messageBus.emit('getNestedProperties', [position, path])` — property-data-source.ts 118 — *PriorityAwareMessageBus が「答え待ち」にする*
      - `getNestedPropertiesCallback(position, propPath)` — client-event-subscribers.ts 253 — *ページの中*
        - `queryDirectiveForest` → `instance` → 道筋をたどる — client-event-subscribers.ts 256・268
        - `serializeDirectiveState(data)` — state-serializer.ts（第 9 回） — *1 段だけ*
      - `messageBus.emit('nestedProperties', [position, {props}, propPath])` — client-event-subscribers.ts 275
    - `once('nestedProperties')` → `value` に入れ、子の行を差し込む — property-data-source.ts 120〜129

## 5. 開いた行を覚えて頼み直す：propertyQuery: Specified

ページで変更検知が走ると、バックエンドは `componentTreeDirty` を送り（250 ms に 1 回まで）、パネルは `getLatestComponentExplorerView` を送り直します。このとき、同じ要素を選んだままなら、開いている行を失わないように「どこを開いているか」を添えます。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/directive-explorer.component.ts` L318–336 （▶ の行: 323–326, 328–329, 332–334）

```ts
318 │   private _getPropertyQuery(): PropertyQuery {
319 │     // Here we handle the case when a given element has already been selected.
320 │     // We check if we're dealing with the same instance (i.e., if we have the same
321 │     // set of directives and component on it), if we do, we want to get the same
322 │     // set of properties which are already expanded.
323 ▶     if (
324 ▶       !this._clickedElement ||
325 ▶       !this.currentSelectedElement() ||
326 ▶       !sameDirectives(this._clickedElement, this.currentSelectedElement()!)
327 │     ) {
328 ▶       return {
329 ▶         type: PropertyQueryTypes.All,
330 │       };
331 │     }
332 ▶     return {
333 ▶       type: PropertyQueryTypes.Specified,
334 ▶       properties: this._propResolver.getExpandedProperties() || {},
335 │     };
336 │   }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver/property-expanded-directive-properties.ts` L12–47 （▶ の行: 14–15, 18–19, 38, 40–41, 43, 46）

```ts
12 │ export const getExpandedDirectiveProperties = (data: FlatNode[]): NestedProp[] => {
13 │   const getChildren = (prop: Descriptor) => {
14 ▶     if ((prop.type === PropType.Object || prop.type === PropType.Array) && prop.value) {
15 ▶       return Object.entries(prop.value).map(
16 │         ([k, v]: [string, any]): {name: number | string; children: NestedProp[]} => {
17 │           return {
18 ▶             name: prop.type === PropType.Array ? parseInt(k, 10) : k,
19 ▶             children: getChildren(v),
20 │           };
21 │         },
22 │       );
23 │     }
24 │     return [];
25 │   };
26 │ 
27 │   const getExpandedProperties = (props: {[name: string]: Descriptor}) => {
28 │     return Object.keys(props).map((name) => {
29 │       return {
30 │         name,
31 │         children: getChildren(props[name]),
32 │       };
33 │     });
34 │   };
35 │ 
36 │   const parents: {[name: string]: Descriptor} = {};
37 │ 
38 ▶   for (const node of data) {
39 │     let prop = node.prop;
40 ▶     while (prop.parent) {
41 ▶       prop = prop.parent;
42 │     }
43 ▶     parents[prop.name] = prop.descriptor;
44 │   }
45 │ 
46 ▶   return getExpandedProperties(parents);
47 │ };
```

パネルは「開いている」かどうかを直接は送りません。14 行目のとおり、**Descriptor が `value` を持っている**行を開いた行とみなし、その中身のキーを `children` にした `NestedProp` の木（`{name, children}`）を作ります。38〜44 行目で、いま表にある行をそれぞれいちばん上の親までさかのぼり、1 段目のプロパティごとに木を作ります。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/state-serializer.ts` L136–154 （▶ の行: 142–143, 146–148, 150）

```ts
136 │ export function deeplySerializeSelectedProperties(
137 │   instance: object,
138 │   props: NestedProp[],
139 │ ): Record<string, Descriptor> {
140 │   const result: Record<string, Descriptor> = {};
141 │   const isReadonly = isSignal(instance);
142 ▶   getKeys(instance).forEach((prop) => {
143 ▶     if (ignoreList.has(prop)) {
144 │       return;
145 │     }
146 ▶     const childrenProps = props.find((v) => v.name === prop)?.children;
147 ▶     if (!childrenProps) {
148 ▶       result[prop] = levelSerializer(instance, prop, isReadonly);
149 │     } else {
150 ▶       result[prop] = nestedSerializer(instance, prop, childrenProps, isReadonly);
151 │     }
152 │   });
153 │   return result;
154 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/state-serializer.ts` L29–58 （▶ の行: 35, 37–38, 45, 53–54, 57）

```ts
29 │ function nestedSerializer(
30 │   instance: any,
31 │   propName: string | number,
32 │   nodes: NestedProp[],
33 │   isReadonly: boolean,
34 │   currentLevel = 0,
35 ▶   level = MAX_LEVEL,
36 │ ): Descriptor {
37 ▶   instance = unwrapSignal(instance);
38 ▶   const serializableInstance = instance[propName];
39 │   const propData: PropertyData = {
40 │     prop: serializableInstance,
41 │     type: getPropType(serializableInstance),
42 │     containerType: getContainerType(serializableInstance),
43 │   };
44 │ 
45 ▶   if (currentLevel < level) {
46 │     const continuation = (
47 │       instance: any,
48 │       propName: string | number,
49 │       isReadonly: boolean,
50 │       nestedLevel?: number,
51 │       _?: number,
52 │     ) => {
53 ▶       const nodeChildren = nodes.find((v) => v.name === propName)?.children ?? [];
54 ▶       return nestedSerializer(instance, propName, nodeChildren, isReadonly, nestedLevel, level);
55 │     };
56 │ 
57 ▶     return levelSerializer(instance, propName, isReadonly, currentLevel, level, continuation);
58 │   }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/state-serializer.ts` L60–74 （▶ の行: 61, 63, 68, 72）

```ts
60 │   switch (propData.type) {
61 ▶     case PropType.Array:
62 │     case PropType.Object:
63 ▶       return createNestedSerializedDescriptor(
64 │         instance,
65 │         propName,
66 │         propData,
67 │         {level, currentLevel},
68 ▶         nodes,
69 │         nestedSerializer,
70 │       );
71 │     default:
72 ▶       return createShallowSerializedDescriptor(instance, propName, propData, isReadonly);
73 │   }
74 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/serialized-descriptor-factory.ts` L267–295 （▶ の行: 283, 288–289, 291）

```ts
267 │ export function createNestedSerializedDescriptor(
268 │   instance: {},
269 │   propName: string | number,
270 │   propData: CompositeType,
271 │   levelOptions: LevelOptions,
272 │   nodes: NestedProp[],
273 │   nestedSerializer: NestedSerializerFn,
274 │ ): Descriptor {
275 │   const {type, prop, containerType} = propData;
276 │ 
277 │   const descriptor = getDescriptor(instance, propName as string);
278 │   const getterOrSetter: boolean = isGetterOrSetter(descriptor);
279 │ 
280 │   const nestedSerializedDescriptor: Descriptor = {
281 │     type,
282 │     editable: false,
283 ▶     expandable: !getterOrSetter && getKeys(prop).length > 0,
284 │     preview: getPreview(propData, getterOrSetter),
285 │     containerType,
286 │   };
287 │ 
288 ▶   if (nodes?.length) {
289 ▶     const value = getNestedDescriptorValue(propData, levelOptions, nodes, nestedSerializer);
290 │     if (value !== undefined) {
291 ▶       nestedSerializedDescriptor.value = value;
292 │     }
293 │   }
294 │   return nestedSerializedDescriptor;
295 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/serialized-descriptor-factory.ts` L297–329 （▶ の行: 309–310, 313, 315–316, 321）

```ts
297 │ function getNestedDescriptorValue(
298 │   propData: CompositeType,
299 │   levelOptions: LevelOptions,
300 │   nodes: NestedProp[],
301 │   nestedSerializer: NestedSerializerFn,
302 │ ) {
303 │   const {type, prop} = propData;
304 │   const {currentLevel} = levelOptions;
305 │   const value = unwrapSignal(prop);
306 │ 
307 │   switch (type) {
308 │     case PropType.Array:
309 ▶       return nodes.map((nestedProp) =>
310 ▶         nestedSerializer(value, nestedProp.name, nestedProp.children, false, currentLevel + 1),
311 │       );
312 │     case PropType.Object:
313 ▶       return nodes.reduce(
314 │         (accumulator, nestedProp) => {
315 ▶           if (Object.hasOwn(prop, nestedProp.name) && !ignoreList.has(nestedProp.name)) {
316 ▶             accumulator[nestedProp.name] = nestedSerializer(
317 │               value,
318 │               nestedProp.name,
319 │               nestedProp.children,
320 │               false,
321 ▶               currentLevel + 1,
322 │             );
323 │           }
324 │           return accumulator;
325 │         },
326 │         {} as Record<string, Descriptor>,
327 │       );
328 │   }
329 │ }
```

1. **147〜148 行目：開いていない 1 段目のプロパティは、上限 1 で**

   `levelSerializer(instance, prop, isReadonly)` は既定の引数で「深さ 0・上限 1」です。第 9 回の 5 節の条件が真になり、開いていないオブジェクトにも**1 段分の中身**が付きます。
2. **150 行目：開いている 1 段目は `nestedSerializer` へ**

   45 行目、深さ 0 &lt; 上限 1 なので、57 行目でまず `levelSerializer` に、`continuation`（46〜55 行目）を渡して 1 段目の中身を全部作らせます。その中の各キーは `continuation` を通って 53 行目で自分の `children` を探し、深さ 1 の `nestedSerializer` になります。
3. **深さ 1 から先：`children` のあるものだけたどる**

   45 行目が偽になり、配列とオブジェクトは 63 行目の `createNestedSerializedDescriptor` へ。288 行目、`children` があるときだけ `value` を作り、309〜311 行目（配列）と 313〜327 行目（オブジェクト）で、`NestedProp` の名前ごとに 1 段深い `nestedSerializer` を呼びます。315 行目の `Object.hasOwn` で、もう無くなったキーは飛ばします。

つまり Specified の答えは、「1 段目はすべて中身つき（1 段分）＋ 開いていた道筋はどこまでも」です。パネルは届いた Descriptor を `updateProperties` → `PropertyDataSource.update` で今の行と突き合わせ（`diff`、[第 8 回](08-devtools-forest-ui.md)の差分と同じ部品）、開いていた行はそのまま開いて見えます。

> **🧪 DEMO — 行を 1 つずつ開く（記録の再生）**
>
> これは記録です。本物の devtools のソース（angular/angular の devtools/、8576f161ae4）を、本物の @angular/core 22.1.6（開発モード）のアプリにつないで Node で動かした結果です。パネルの側も本物の `DirectivePropertyResolver`・`PropertyDataSource`（ng-devtools）と `PriorityAwareMessageBus`（protocol）で、木の行を `FlatTreeControl.expand` で開き、行き来したメッセージと、パネルが木に渡した行の並び（`connect` が出したもの）を段ごとに残しました。パネルとページの間は、拡張では postMessage を通って非同期に届くので、記録では `setTimeout` で 1 回ずつ遅らせて届けています（届け方の代わりで、devtools のロジックではありません）。共通の部品は[第 1 回](01-devtools-overview.md)に全文があります。
>
> 2〜8 段：開くたびに 1 往復し、届いた 1 段分だけが木に差し込まれます。5 段目の配列の答えには `length` が入ります（3 節）。9 段：Specified で頼み直すと、開いていた行は開いたまま、`items.length` は消えます。10〜13 段：`items` を `null` にしてから（変更検知は走らせない）、パネルに残っている `items.1` を開きます。道筋の途中が `null` なので、バックエンドは 270 行目で TypeError を投げ、答えを送りません。パネルには答えを待つ `once` が 1 つ残り、`PriorityAwareMessageBus` は画面の頼み直しを捨てます（12 段）。続けて別の行 `state.user.roles` を開くと、届いた 1 つの答えを**残っていた `once` も受け取り**、`roles` の中身（`"admin"` と `length`）が `items.1` の下に差し込まれます（13 段）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-property-resolver)

> [!NOTE]
> **さらに深く**
>
> 13 段の形は、ブラウザの本物の拡張でも同じ行の組み合わせで起きます。拡張のページ側の bus（shell-browser の same-page-message-bus.ts）は、受けたメッセージのハンドラーを `try` で包まないので、ハンドラーの例外はページのコンソールに出るだけで、パネルには何も届きません（第 3 回の持ち場のファイルなので引用はしません）。ただし、この場面に入るには「パネルが表示している値の途中が、パネルの更新の前に `null` になり、その下の閉じた行を開く」必要があります。記録では変更検知を走らせずに値を変えて作りました。

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| property-resolver/property-data-source.spec.ts | describe `PropertyDataSource`（21 行目）の it `should detect changes in the collection`（22）の 1 件だけ | `//devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver:test` |
| property-resolver/element-property-resolver.spec.ts | describe `ElementPropertyResolver`（81）の `should register directives`（87）・`should provide nested props`（105） |   |
| property-resolver/directive-property-resolver.spec.ts | describe `DirectivePropertyResolver`（116）の 3 件（欄への振り分けと並び） |   |
| property-resolver/arrayify-props.spec.ts | describe `arrayify`（13）の 2 件 |   |
| shared/object-tree-explorer/object-tree-explorer.spec.ts | describe `ObjectTreeExplorerComponent`（85）の 5 件（preview と editor の出し分け、開ける行の描画） | `//devtools/projects/ng-devtools/src/lib/shared/object-tree-explorer:test` |

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver/property-data-source.spec.ts` L21–50 （▶ の行: 22–23, 37, 40）

```ts
21 │ describe('PropertyDataSource', () => {
22 ▶   it('should detect changes in the collection', () => {
23 ▶     const source = new PropertyDataSource(
24 │       {
25 │         foo: {
26 │           editable: true,
27 │           expandable: false,
28 │           preview: '42',
29 │           type: PropType.Number,
30 │           value: 42,
31 │           containerType: null,
32 │         },
33 │       },
34 │       getTreeFlattener(),
35 │       flatTreeControl,
36 │       {element: [1, 2, 3]},
37 ▶       null as any,
38 │     );
39 │ 
40 ▶     source.update({
41 │       foo: {
42 │         editable: true,
43 │         expandable: false,
44 │         preview: '43',
45 │         type: PropType.Number,
46 │         value: 43,
47 │         containerType: null,
48 │       },
49 │     });
50 │ 
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver/element-property-resolver.spec.ts` L105–131 （▶ の行: 105, 107, 116–117）

```ts
105 ▶   it('should provide nested props', () => {
106 │     const resolver = new ElementPropertyResolver(messageBusMock);
107 ▶     resolver.setProperties(mockIndexedNode, {
108 │       FooCmp: fooNestedProperties,
109 │       BarDir: barNestedProps,
110 │       BazDir: {
111 │         props: {},
112 │       },
113 │     });
114 │     const fooController = resolver.getDirectiveController('FooCmp');
115 │     expect(fooController).toBeTruthy();
116 ▶     const fooProps = fooController!.getExpandedProperties();
117 ▶     expect(fooProps).toEqual([
118 │       {
119 │         name: 'foo',
120 │         children: [
121 │           {
122 │             name: 'bar',
123 │             children: [],
124 │           },
125 │           {
126 │             name: 'baz',
127 │             children: [],
128 │           },
129 │         ],
130 │       },
131 │     ]);
```

`PropertyDataSource` の spec は 22 行目の 1 件で、37 行目の bus は `null` です。つまり **2 節の `_toggleNode`（`getNestedProperties` を送り、答えを差し込む）を通る spec はありません**。`getExpandedProperties` は 105〜131 行目で、`value` を持つ `foo` の下の 2 つが `children` になることを確かめています。バックエンドの `getNestedPropertiesCallback` を直接呼ぶ spec もありません（client-event-subscribers.spec.ts にあるのは、`inspectorStart` などが登録されるかの 2 件だけ。grep で確かめました）。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver:test //devtools/projects/ng-devtools/src/lib/shared/object-tree-explorer:test --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/devtools-logs/c-all.log。ほかのターゲットと一緒に走らせ、全体で 44.4 秒）`

```
property-resolver:test_chromium   Chromium: 1/1 test files | 8 passed, 0 failed   (0.8s)
property-resolver:test_firefox    Firefox:  1/1 test files | 8 passed, 0 failed   (3.2s)
object-tree-explorer:test_chromium Chromium: 1/1 test files | 5 passed, 0 failed  (1.2s)
object-tree-explorer:test_firefox  Firefox:  1/1 test files | 5 passed, 0 failed  (4.7s)
property-resolver:test_chromium PASSED in 2.9s / test_firefox PASSED in 5.6s
object-tree-explorer:test_chromium PASSED in 4.8s / test_firefox PASSED in 8.3s
```

property-resolver の 8 件は、4 つの spec の 1 + 2 + 3 + 2 件の合計です。BUILD.bazel の `zoneless_web_test_suite` の上には `todo(aleksanderbodurri): fix this test suite` というコメントが残っています。

### 直すとしたら

- 「開いた行の中身が違う行に出る」は、パネルの `_toggleNode` の 120〜131 行目が入口です。答えの 3 つ目の引数（道筋）は届いているので、待っている道筋と比べれば取り違えは防げます。spec は property-data-source.spec.ts に、`once` を覚えて呼べる手作りの bus を渡す形で足すことになります（いまの 37 行目は `null`）。
- 「途中が null で答えが返らない」は、バックエンドの 269〜274 行目です。途中で値が無くなったら 261 行目と同じ `emitEmpty()` を返す形が、同じ関数の中の書き方に合います。
- 配列を開くと `length` が出るのは、277 行目が配列にも `serializeDirectiveState`（`getKeys`）を使うためです。spec は state-serializer.spec.ts に、配列を `serializeDirectiveState` に通す形で足せます。
- 752fb476eb5（2026-06-02、refactor「props の道筋のたどり方を固くする」）は、`__proto__`・`constructor`・`prototype` を道筋に入れたら止める行を、書き換えの側（property-mutation.ts の `getNestedProps`）にだけ足しました（spec も property-mutation.spec.ts に 1 件）。読む側の 269〜274 行目には同じ守りはありません。読む側は `serializeDirectiveState` で読むだけなので、道筋に `__proto__` が入っても書き換えは起きません。中身は[第 11 回](11-devtools-property-mutation.md)で読みます。
- 本家に PR を出すことは勧めません。issue を読むときは、まずデモと同じ形（本物のパネルの部品 + バックエンド）で手元で再現できるかを確かめます（[第 20 回](20-devtools-issues.md)）。

## 聞かれそうな質問

**Q. 大きなオブジェクトを持つコンポーネントを選ぶと、全部ページから送られてきますか？**

最初は送られません。`All` の頼みでは 1 段目の preview だけです（第 9 回）。行を開いたときに `getNestedProperties` で、その行の 1 段分だけ（3 節の 277 行目）が届きます。ただし、変更検知のあとの Specified の頼み直しでは、1 段目のオブジェクトすべてに 1 段分の中身が付きます（147〜148 行目）。

**Q. パネルはどうやって「どの行を開いたか」をバックエンドに伝えますか？**

行を開いた瞬間は、`Property.parent` をさかのぼって作った名前の配列（107〜116 行目）を送ります。頼み直しのときは、`value` を持つ行を開いた行とみなした `NestedProp` の木（property-expanded-directive-properties.ts の 14 行目）を送ります。

**Q. signal の中のオブジェクトも開けますか？**

開けます。バックエンドは道筋をたどる 270 行目で `unwrapSignal` を通すので、`state` が signal でも `state.user` の値までたどれます。デモの 7〜8 段がそれです。

**Q. 開いていた行が、画面が更新されても閉じないのはなぜですか？**

同じ要素を選んだままなら、`_getPropertyQuery` が 332〜335 行目で Specified の頼みを作り、開いていた道筋の中身を一緒に頼むからです。届いた Descriptor は `value` を持っているので、パネルの差分の突き合わせのあとも開いた行として扱われます。要素を選び直すと 328〜330 行目の All に戻ります。

## 読み終えて

- 行を開くと、パネルは `parent` をさかのぼった道筋を `getNestedProperties` で送り、バックエンドは道筋の先を 1 段だけ直列化して返す。
- 答えは `once` で「次に届いた 1 つ」を受け取り、道筋は照らし合わせない。
- 頼み直しは Specified：`value` を持つ行を開いた行とみなした `NestedProp` の木を送り、バックエンドはその道筋だけをどこまでもたどる。
- 道筋の途中が `null` だとバックエンドは例外で答えを返さず、パネルに残った `once` が次の答えを取り違える（記録で確かめた）。

---

← 前: [プロパティを送れる形にする：state-serializer](09-devtools-state-serializer.md)  
次: [値を書き換える：updateState と property-mutation](11-devtools-property-mutation.md) →
