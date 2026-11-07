[目次](../README.md) › [Angular DevTools の内側](README.md) › 第 7 回 / 全 20 回

# 同じノードを見分ける：IdentityTracker と id

> identity-tracker.ts が、描画し直しのたびに集め直した木のノードに同じ id を付け、新しいノードと消えたノードを見分ける行。消えたディレクティブの記録を片付ける修正（33b001d478e）と preservation のモード、WeakRef で注入器を持つ idToInjector（84d757446bf）。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-identity)

---

[第 5 回](05-devtools-component-tree.md)のとおり、バックエンドは頼まれるたびに木を集め直します。集め直した木の「この `app-row`」が前の木の「あの `app-row`」と同じものかを見分けないと、パネルは選んだ行を保てず、プロファイラーは「消えた」「増えた」を言えません。その見分けをするのが `IdentityTracker` です。この章では、id を配る行、位置（position）を付ける行、新しいノードと消えたノードを見分ける行、消えたものの記録を片付ける修正（33b001d478e）、そして注入器の id を `WeakRef` で持つ `idToInjector`（84d757446bf）を読みます。

読む対象は `devtools/projects/ng-devtools-backend/src/lib/directive-forest/` の `identity-tracker/identity-tracker.ts`・`manager.ts`・`component-tree/component-tree.ts`（58〜78 行目）です。

1. [1. 全体像](01-devtools-overview.md)
2. [2. Angular を見つける](02-devtools-detect.md)
3. [3. メッセージの道](03-devtools-messaging.md)
4. [4. プロトコル](04-devtools-protocol.md)
5. [5. コンポーネントの木](05-devtools-component-tree.md)
6. [6. 制御フローの塊](06-devtools-control-flow.md)
7. **7. 同じノードを見分ける**（この章）
8. [8. パネルの木](08-devtools-forest-ui.md)
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

## 1. 呼ばれる場所：DirectiveForestManager

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/manager.ts` L44–64 （▶ の行: 56–59, 61–62）

```ts
44 │   getIndexedDirectiveForest(): IndexedNode[] {
45 │     return this._indexedForest;
46 │   }
47 │ 
48 │   getDirectiveForest(): ComponentTreeNode[] {
49 │     return this._forest;
50 │   }
51 │ 
52 │   initialize(): void {
53 │     this.indexForest();
54 │   }
55 │ 
56 ▶   indexForest(): void {
57 ▶     const output = this._tracker.index();
58 ▶     this._indexedForest = output.indexedForest;
59 ▶     this._forest = output.directiveForest;
60 │ 
61 ▶     for (const cb of this._indexForestCbs) {
62 ▶       cb(output);
63 │     }
64 │   }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/manager.ts` L84–101 （▶ の行: 89, 92, 95–96, 98）

```ts
 84 │ /**
 85 │  * Get the directive forest manager.
 86 │  * Initializes the manager if it wasn't requested before.
 87 │  */
 88 │ export function getDirectiveForestManager(): DirectiveForestManager {
 89 ▶   if (directiveForestManager) {
 90 │     return directiveForestManager;
 91 │   } else {
 92 ▶     directiveForestManager = new DirectiveForestManager();
 93 │   }
 94 │ 
 95 ▶   directiveForestManager.onIndexForest(({newNodes, removedNodes}) => {
 96 ▶     getProfiler().onIndexForest(newNodes, removedNodes);
 97 │   });
 98 ▶   directiveForestManager.initialize();
 99 │ 
100 │   return directiveForestManager;
101 │ }
```

第 5 回の入口（`getLatestComponentExplorerView`）が呼ぶ `indexForest` は、57 行目で `IdentityTracker` の `index()` を呼び、58〜59 行目で結果の 2 本の木（位置付きの木と、元の木）を持ち、61〜63 行目で登録された関数に結果を渡します。登録しているのは 95〜97 行目のプロファイラーで、`newNodes`・`removedNodes` を「作られた」「壊された」の出来事として使います（[第 13 回](13-devtools-profiler-capture.md)）。マネージャーは 89〜93 行目のとおりプロセスに 1 つで、作った直後の 98 行目で 1 回目の `index()` が走ります。

## 2. IdentityTracker が持っているもの

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/identity-tracker/identity-tracker.ts` L42–74 （▶ の行: 48, 56–59, 62, 64, 67, 70–71）

```ts
42 │ /**
43 │  * Operating mode of the IdentityTracker.
44 │  *
45 │  * - `normal` (default) – normal operation; the data is kept only during the lifetime of directives
46 │  * - `preservation` – preserve the IDs of destroyed directives for look up; changing the mode cleans the data
47 │  */
48 ▶ export type IdentityTrackerOpMode = 'normal' | 'preservation';
49 │ 
50 │ /**
51 │  * Indexes the directive forest by adding IDs and node positions.
52 │  */
53 │ export class IdentityTracker {
54 │   private static instance: IdentityTracker;
55 │ 
56 ▶   private directiveIdCounter = 0;
57 ▶   private currentDirectivePosition = new Map<DirectiveInstance, ElementPosition>();
58 ▶   private currentDirectiveId = new Map<DirectiveInstance, number>();
59 ▶   private mode: IdentityTrackerOpMode = 'normal';
60 │ 
61 │   // References of removed/destroyed directives. Used during `preservation` mode.
62 ▶   private pendingRemovals = new Set<DirectiveInstance>();
63 │ 
64 ▶   isComponent = new Map<ComponentInstance, boolean>();
65 │ 
66 │   // private constructor for Singleton Pattern
67 ▶   private constructor() {}
68 │ 
69 │   static getInstance(): IdentityTracker {
70 ▶     if (!IdentityTracker.instance) {
71 ▶       IdentityTracker.instance = new IdentityTracker();
72 │     }
73 │     return IdentityTracker.instance;
74 │   }
```

- 56 行目の `directiveIdCounter`：次に配る id の数。**減らしたり使い回したりしません。**
- 58 行目の `currentDirectiveId`：**インスタンス（オブジェクト）を鍵にした** Map で、値が id。57 行目の `currentDirectivePosition` も同じ鍵で、値が木の中の位置です。
- 48 行目のモード：ふつうは `normal`、プロファイラーの記録中は `preservation`（45〜46 行目のコメント：壊れたディレクティブの id も引けるように残す）。62 行目の `pendingRemovals` がその「残しているもの」です。
- 67〜74 行目：コンストラクタを `private` にした 1 つだけのインスタンス（singleton）。第 5 回の記録で、場面をまたいで id が増え続けたのはこのためです。

## 3. index()：集め直した木に id を配る

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/identity-tracker/identity-tracker.ts` L88–119 （▶ の行: 94, 96–97, 102–103, 106–112, 114, 118）

```ts
 88 │   /**
 89 │    * Change/select the operating mode of the `IdentityTracker`.
 90 │    *
 91 │    * Refer to `IdentityTrackerOpMode` for detailed information
 92 │    * about the different modes.
 93 │    */
 94 ▶   selectMode(mode: IdentityTrackerOpMode) {
 95 │     this.mode = mode;
 96 ▶     if (mode !== 'preservation') {
 97 ▶       this.flushPendingRemovals();
 98 │     }
 99 │   }
100 │ 
101 │   index(): IndexingOutput {
102 ▶     const directiveForest = buildDirectiveForest();
103 ▶     const indexedForest = indexForest(directiveForest);
104 │     const newNodes: NodeArray = [];
105 │     const removedNodes: NodeArray = [];
106 ▶     const allNodes = new Set<DirectiveInstance>();
107 ▶     indexedForest.forEach((root) => this.indexInternal(root, null, newNodes, allNodes));
108 ▶     this.currentDirectiveId.forEach((_: number, dir: DirectiveInstance) => {
109 ▶       if (!allNodes.has(dir)) {
110 ▶         removedNodes.push({directive: dir, isComponent: !!this.isComponent.get(dir)});
111 ▶         if (this.mode === 'preservation') {
112 ▶           this.pendingRemovals.add(dir);
113 │         } else {
114 ▶           this.cleanupDirective(dir);
115 │         }
116 │       }
117 │     });
118 ▶     return {newNodes, removedNodes, indexedForest, directiveForest};
119 │   }
```

1. **102〜103 行目：木を集め、位置を付ける**

   102 行目が第 5 回の `buildDirectiveForest` です。103 行目の `indexForest`（5 節）が各ノードに位置を付けます。
2. **106〜107 行目：今回見えたものを数えながら id を配る**

   `allNodes` は「今回の木にいたインスタンス」の集まりで、`indexInternal`（4 節）が足していきます。
3. **108〜117 行目：前からいて、今回いないものが「消えたノード」**

   `currentDirectiveId` にあるのに `allNodes` に無いものを `removedNodes` に入れます。111〜112 行目、`preservation` なら `pendingRemovals` に入れて残し、そうでなければ 114 行目ですぐ片付けます（6 節）。
4. **94〜99 行目：モードを戻すと、残していたものを片付ける**

   `normal` に戻した瞬間に 97 行目で `flushPendingRemovals` が走ります。

## 4. indexInternal と indexNode：「同じ」はインスタンスが同じこと

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/identity-tracker/identity-tracker.ts` L121–153 （▶ の行: 128–130, 133, 135, 137–138, 140, 148–151）

```ts
121 │   private indexInternal(
122 │     node: IndexedNode,
123 │     parent: TreeNode | null,
124 │     newNodes: {directive: DirectiveInstance; isComponent: boolean}[],
125 │     allNodes: Set<DirectiveInstance>,
126 │   ): void {
127 │     if (node.component) {
128 ▶       allNodes.add(node.component.instance);
129 ▶       this.isComponent.set(node.component.instance, true);
130 ▶       this.indexNode(node.component.instance, node.position, newNodes);
131 │     }
132 │     (node.directives || []).forEach((dir) => {
133 ▶       allNodes.add(dir.instance);
134 │       this.isComponent.set(dir.instance, false);
135 ▶       this.indexNode(dir.instance, node.position, newNodes);
136 │     });
137 ▶     if (node.controlFlowBlock) {
138 ▶       this.indexNode(node.controlFlowBlock, node.position, newNodes);
139 │     }
140 ▶     node.children.forEach((child) => this.indexInternal(child, parent, newNodes, allNodes));
141 │   }
142 │ 
143 │   private indexNode(
144 │     directive: DirectiveInstance,
145 │     position: ElementPosition,
146 │     newNodes: NodeArray,
147 │   ): void {
148 ▶     this.currentDirectivePosition.set(directive, position);
149 ▶     if (!this.currentDirectiveId.has(directive)) {
150 ▶       newNodes.push({directive, isComponent: !!this.isComponent.get(directive)});
151 ▶       this.currentDirectiveId.set(directive, this.directiveIdCounter++);
152 │     }
153 │   }
```

1. **127〜136 行目：コンポーネントとディレクティブ**

   どちらも 128・133 行目で `allNodes` に足し、129・134 行目でコンポーネントかどうかを覚えて、`indexNode` に渡します。
2. **148〜152 行目：位置は毎回上書き、id は初めて見たときだけ**

   148 行目で位置はいつも新しくします。149 行目、Map にまだ無いインスタンスだけを 150 行目で `newNodes` に入れ、151 行目で次の数を配ります。**同じインスタンスなら、木のどこへ動いても id は同じ**です。逆に、Angular がコンポーネントを作り直せば（別のインスタンスなら）id は新しくなります。
3. **137〜139 行目：制御フローの塊も id をもらう**

   `@for`・`@defer` のノードでは、塊のオブジェクト（[第 6 回](06-devtools-control-flow.md)の `mapToDevtoolsControlFlowModel` が毎回新しく作るもの）を鍵にします。ここでは `allNodes` に足していないので、3 節の 108〜117 行目で**同じ `index()` の中で「消えたノード」にも入ります**（記録の各段）。

> [!NOTE]
> **ポイント**
>
> パネルが見ている塊の行の id は、この数ではなく、第 6 回の `forId-0-1` のような文字列です（第 5 回の `prepareForestForSerialization` は塊のノードに数の id を入れません）。だから塊の数の id が毎回変わっても、パネルの行は保たれます。数の id を使うのは、位置を引き直すプロファイラーの側です（[第 13 回](13-devtools-profiler-capture.md)）。

## 5. 位置（position）：親の位置に自分の番号を足す

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/identity-tracker/identity-tracker.ts` L177–204 （▶ の行: 178, 187, 192–193, 203–204）

```ts
177 │ export interface IndexedNode extends DevToolsNode<DirectiveInstanceType, ComponentInstanceType> {
178 ▶   position: ElementPosition;
179 │   children: IndexedNode[];
180 │ }
181 │ 
182 │ const indexTree = <T extends DevToolsNode<DirectiveInstanceType, ComponentInstanceType>>(
183 │   node: T,
184 │   idx: number,
185 │   parentPosition: number[] = [],
186 │ ): IndexedNode => {
187 ▶   const position = parentPosition.concat([idx]);
188 │   return {
189 │     position,
190 │     tagName: node.tagName,
191 │     component: node.component,
192 ▶     directives: node.directives?.map((d) => ({position, ...d})),
193 ▶     children: node.children.map((n, i) => indexTree(n, i, position)),
194 │     nativeElement: node.nativeElement,
195 │     hydration: node.hydration,
196 │     controlFlowBlock: node.controlFlowBlock,
197 │     injector: node.injector,
198 │     static: node.static,
199 │   } satisfies IndexedNode;
200 │ };
201 │ 
202 │ export const indexForest = <T extends DevToolsNode<DirectiveInstanceType, ComponentInstanceType>>(
203 ▶   forest: T[],
204 ▶ ): IndexedNode[] => forest.map((n, i) => indexTree(n, i));
```

187 行目、位置は「親の位置に、兄弟の中の自分の番号を足した配列」です。`[0, 1, 2]` は「1 本目の木の、2 番目の子の、3 番目の子」です。193 行目で子にも同じことをします。位置は**今の木の形だけで決まる**ので、並べ替えると変わります。変わらないのは 4 節の id です。パネルが「選んだノードのプロパティをください」と頼むときは位置で頼み（[第 8 回](08-devtools-forest-ui.md)）、ノードを見分けるときは id を使います。

## 6. 消えたものの記録を片付ける：33b001d478e

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/identity-tracker/identity-tracker.ts` L155–175 （▶ の行: 156–158, 162–163, 165, 169, 172–173）

```ts
155 │   private cleanupDirective(dir: DirectiveInstance): void {
156 ▶     this.currentDirectiveId.delete(dir);
157 ▶     this.currentDirectivePosition.delete(dir);
158 ▶     this.isComponent.delete(dir);
159 │   }
160 │ 
161 │   private flushPendingRemovals(): void {
162 ▶     for (const dir of this.pendingRemovals) {
163 ▶       this.cleanupDirective(dir);
164 │     }
165 ▶     this.pendingRemovals.clear();
166 │   }
167 │ 
168 │   destroy(): void {
169 ▶     this.currentDirectivePosition = new Map<DirectiveInstance, ElementPosition>();
170 │     this.currentDirectiveId = new Map<DirectiveInstance, number>();
171 │     this.isComponent = new Map<ComponentInstance, boolean>();
172 ▶     this.pendingRemovals.clear();
173 ▶     this.mode = 'normal';
174 │   }
175 │ }
```

`git show 33b001d478e`（2026-03-23、fix）で読むと、修正の前の `index()` は消えたノードを `removedNodes` に入れるだけで、Map から消す行は**コメントアウトされていました**（「プロファイラーの記録中に、消えたコンポーネントを聞かれるかもしれないので消せない」）。そのため、壊れたコンポーネントのインスタンスを Map が持ち続け、DevTools を開いている間ずっと増え続けていました（コミットのメッセージ：メモリリーク）。

- 修正では `setProfilingActive(active)` と `_pendingRemovals` を足し、記録中でなければ `index()` の中ですぐ消し（いまの 114 行目の道）、記録中なら残して、記録を止めたときにまとめて消す（いまの 161〜166 行目）形にしました。同時に `destroy()` が `isComponent` と残していたものも空にするようになりました（いまの 171〜173 行目）。
- spec の `identity-tracker.spec.ts`（161 行）はこのコミットで新しく作られました。
- その後、ff115925e77（2026-06-16、refactor）が「プロファイラーのための振る舞い」を一般のモードに直し、`setProfilingActive(true/false)` が `selectMode('preservation'/'normal')` になりました（3 節の 94〜99 行目）。いまは `profiling/capture.ts` の `start` が `selectMode('preservation')`、`stop` が `selectMode('normal')` を呼びます（[第 13 回](13-devtools-profiler-capture.md)）。

## 7. 注入器の id：idToInjector と WeakRef（84d757446bf）

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/component-tree/component-tree.ts` L58–78 （▶ の行: 58, 60–62, 70–71, 73–75, 77）

```ts
58 ▶ export const injectorToId = new WeakMap<Injector | HTMLElement, string>();
59 │ export const nodeInjectorToResolutionPath = new WeakMap<HTMLElement, SerializedInjector[]>();
60 ▶ export const idToInjector = new Map<string, WeakRef<Injector>>();
61 ▶ const injectorFinalizer = new FinalizationRegistry<string>((id) => {
62 ▶   idToInjector.delete(id);
63 │ });
64 │ let injectorId = 0;
65 │ 
66 │ export function getInjectorId() {
67 │   return `${injectorId++}`;
68 │ }
69 │ 
70 ▶ function getOrCreateInjectorId(key: Injector | HTMLElement, injector: Injector): string {
71 ▶   if (!injectorToId.has(key)) {
72 │     const newId = getInjectorId();
73 ▶     injectorToId.set(key, newId);
74 ▶     idToInjector.set(newId, new WeakRef(injector));
75 ▶     injectorFinalizer.register(injector, newId);
76 │   }
77 ▶   return injectorToId.get(key)!;
78 │ }
```

第 5 回の `resolutionPath` に出る注入器にも、送れる id（文字列）を付けます。58 行目の `injectorToId` は「注入器か要素 → id」、60 行目の `idToInjector` は逆向きの「id → 注入器」で、パネルが「この id の注入器の provider を見せて」と頼んできたときに使います（[第 16 回](16-devtools-injector-tree.md)）。

- `git show 84d757446bf`（2026-03-29、refactor）で読むと、前は `idToInjector` が `Map<string, Injector>` で、`injectorsSeen` という Set に「今回の木で見た id」を入れ、`getLatestComponentExplorerView` のたびに見なかった id を消すループがありました。コミットのメッセージは「片付けがパネルの変更検知に結び付いていて、たどった注入器を覚えておく必要があった」です。
- 後は 60 行目の `WeakRef` と 61〜63 行目の `FinalizationRegistry`（オブジェクトが GC で回収されたら呼ばれる関数を登録する仕組み）にし、70〜78 行目の `getOrCreateInjectorId` にまとめました。使う側は `idToInjector.get(id)?.deref()` で取り出し、もう無ければ何もしません。

📄 `angular/packages/core/src/render3/util/discovery_utils.ts` L141–148 （▶ の行: 141, 147）

```ts
141 ▶ export function getInjector(elementOrDir: Element | {}): Injector {
142 │   const context = getLContext(elementOrDir)!;
143 │   const lView = context ? context.lView : null;
144 │   if (lView === null) return Injector.NULL;
145 │ 
146 │   const tNode = lView[TVIEW].data[context.nodeIndex] as TElementNode;
147 ▶   return new NodeInjector(tNode, lView);
148 │ }
```

気を付ける点があります。要素の注入器（`NodeInjector`）は、core の `getInjector` が呼ばれるたびに 147 行目で**新しく作るオブジェクト**です。要素の注入器の鍵は 73 行目の `key`（要素）なので、2 回目以降は 71 行目で素通りし、74 行目の `WeakRef` は最初に作った `NodeInjector` を指したままです。そのオブジェクトをほかに持っている人がいなければ、GC で回収されえます。記録の最後で、これを Node（`--expose-gc`）で確かめました（8 節の下の表）。

## 8. DEMO：@for を動かして id を追う

> **🧪 DEMO — 操作のたびの id・newNodes・removedNodes（記録の再生）**
>
> これは記録です。本物の devtools のソース（angular/angular の devtools/、8576f161ae4）を、本物の @angular/core 22.1.6（開発モード）のアプリにつないで Node で動かした結果です。アプリは platform-server（domino）に描画し、`items` を変えるたびに bus で `getLatestComponentExplorerView` を頼み直しました。表の id は返ってきた forest の `component.id`（塊は `controlFlowBlock.id`）、newNodes・removedNodes は `onIndexForest` に登録した関数が受け取ったものです。片付けたあとの id は tracker から引けないので、記録の側で覚えておいた数を出しています（塊は覚えていないので「—」）。
>
> 段のボタンを押してください。
>
> idToInjector の記録（最後の段のあと、1 本目の木の `resolutionPath` と、最初の `app-row` の要素の注入器）：
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-identity)

記録から読み取れることです。

1. **足す・消す・並べ替える：残ったものの id は変わらない**

   2 段目で足した `d` だけが新しい id をもらい、3 段目で消した `b` だけが removedNodes に入ります。4 段目の並べ替えでは位置が全部変わりますが、id は全部そのままです。`@for` が同じインスタンスを動かしたので、4 節の 149 行目で「もう知っている」になるからです。
2. **同じ id の新しいオブジェクト：track の書き方で分かれる**

   5 段目、上の `track item.id` の行は id が同じまま、下の `track item`（オブジェクトそのもので見分ける）の行は 3 つとも新しい id です。Angular が下の 3 つを作り直したからで、記録のスクリプトを走らせたとき、Node のコンソールに Angular の警告 NG0956（「track の式のせいで集まり全体を作り直した」）が出ました（[for-track の章](../template/01-for-track.md)）。DevTools の id は、Angular がインスタンスを使い回したかどうかをそのまま映します。
3. **どの段でも、@for の塊が new と removed の両方に入る**

   4 節の 137〜139 行目のとおりです。normal のモードではその場で片付くので、id は「—」です。数の id は 1・5・… と使われていき、`app-row` の id が 2・3・4 と 6・7・8 のように飛ぶのはこのためです。
4. **preservation：消えた a が 2 回続けて removed に出て、Map が大きくなる**

   7 段目で消した `a` と `a*` は、8 段目でも removedNodes に出ます（Map に残っているので、3 節の 109 行目でまた「今回いない」になる）。塊も毎回 2 つずつ残るので、Map の大きさは 9 → 11 と増えます。9 段目で normal に戻すと、残っていたものが片付いて 5 になります。
5. **WeakRef：要素の注入器だけが GC で消えた**

   `gc()` のあと、`element` の 2 つ（`IdRoot`・`IdRow`）の `WeakRef` は空になり、`FinalizationRegistry` が Map からも消しました。`environment` と `null` の注入器は残りました。`getInjectorProviders` を送ると、消えた id には返事が来ませんでした。

> [!WARNING]
> **ハマりどころ**
>
> 最後の項目は Node（V8）の上で `gc()` を明示して呼んだ結果です。Chrome も同じ V8 ですが、本物の拡張で、いつ GC が走り、そのあとパネルの何が空になるかは確かめていません。言えるのは、7 節の 2 つの行（core の 147 行目と component-tree.ts の 71・74 行目）から「要素の注入器の `WeakRef` の先は、ほかから参照されない一時的なオブジェクトになりうる」ということと、記録でそれが回収されたことまでです。8576f161ae4 より新しい main（7c8c8d177b1 で `injector-tree/injector-tree.ts` に移った `getOrCreateInjectorId`）でも、この 2 行の形は同じです。

📄 `scratchpad の記録スクリプト（identity.ts、共通の build.mjs で束ねて node --expose-gc で実行。共通の harness.ts は第 1 回に全文）`

```
// 第 7 回 devtools-identity の記録。
// @for の項目を足す・消す・並べ替える操作を 1 つずつ行い、そのたびに getLatestComponentExplorerView を頼み直して、
// IdentityTracker が付けた id（forest の component.id）と、index() が返した newNodes・removedNodes を記録する。
// 最後に preservation のモード（プロファイラーの記録中に使う）と、idToInjector の WeakRef が GC で消える様子も記録する。
// 使い方: node ../_shared/build.mjs identity.ts identity.mjs && node --expose-gc identity.mjs
import { Component, Input, VERSION, signal } from '@angular/core';
import { bootApp, makeBus, loadBackend, tick, writeJson } from '../_shared/harness';

const OUT = new URL('./identity.json', import.meta.url).pathname;

@Component({ selector: 'app-row', template: '<span>{{ label }}</span>' })
class IdRow {
  @Input() label = '';
}

type Item = { id: string };
const TEMPLATE = `<section>
  @for (item of items(); track item.id) {
    <app-row [label]="item.id" />
  }
</section>
<aside>
  @for (item of items(); track item) {
    <app-row [label]="item.id + '*'" />
  }
</aside>`;

@Component({ selector: 'app-root', imports: [IdRow], template: TEMPLATE })
class IdRoot {
  items = signal<Item[]>(['a', 'b', 'c'].map((id) => ({ id })));
}

const { appRef } = await bootApp(IdRoot);
const { initializeMessageBus } = await loadBackend();
const { getDirectiveForestManager } = await import('~/angular-research/angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/manager');
const { IdentityTracker } = await import('~/angular-research/angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/identity-tracker/identity-tracker');
const { idToInjector } = await import('~/angular-research/angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/component-tree/component-tree');
const ng = (globalThis as any).ng;
const cmp = ng.getComponent(document.querySelector('app-root')) as IdRoot;
const tracker = IdentityTracker.getInstance();

// 記録の側で「インスタンス → それに付いていた id」を覚えておく（cleanup のあとは tracker から引けないため）
const seen = new Map<object, number>();
const describe = (d: any) => {
  if (d.controlFlowBlock || d.id?.startsWith?.('forId-')) return `@for（${d.id}）`;
  const label = d.label !== undefined ? `app-row「${d.label}」` : d.constructor.name;
  return label;
};
let lastIndex: any = null;
getDirectiveForestManager().onIndexForest((out: any) => {
  lastIndex = {
    newNodes: out.newNodes.map((n: any) => ({ name: describe(n.directive), isComponent: n.isComponent, id: tracker.getDirectiveId(n.directive) ?? null })),
    removedNodes: out.removedNodes.map((n: any) => ({ name: describe(n.directive), isComponent: n.isComponent, id: tracker.getDirectiveId(n.directive) ?? seen.get(n.directive) ?? null, stillInTracker: tracker.hasDirective(n.directive) })),
  };
});

const { bus, send, take } = makeBus();
initializeMessageBus(bus as any);

// forest（送れる形）を、表の行（位置・名前・id）に平らにする
const rows = (forest: any[], parent: number[] = []): any[] =>
  forest.flatMap((n: any, i: number) => {
    const position = parent.concat(i);
    const row = {
      position: position.join('.'),
      tagName: n.tagName,
      id: n.component ? n.component.id : n.controlFlowBlock ? n.controlFlowBlock.id : null,
    };
    return [row, ...rows(n.children, position)];
  });
// 同じ順に並ぶ IndexedNode から app-row の label を取る（forest には instance が入らないため）
const labels = (forest: any[]): string[] =>
  forest.flatMap((n: any) => [n.component?.instance?.label ?? '', ...labels(n.children)]);

const steps: any[] = [];
async function record(id: string, title: string, action: string) {
  await appRef.whenStable();
  send('getLatestComponentExplorerView', [undefined]);
  await tick(10);
  const msg = take().find((m) => m.topic === 'latestComponentExplorerView');
  const r = rows((msg?.args[0] as any).forest);
  const l = labels(getDirectiveForestManager().getIndexedDirectiveForest());
  r.forEach((row, i) => (row.label = l[i]));
  for (const n of [...(function* walk(f: any[]): any { for (const x of f) { if (x.component) yield x.component.instance; if (x.controlFlowBlock) yield x.controlFlowBlock; yield* walk(x.children); } })(getDirectiveForestManager().getIndexedDirectiveForest())]) {
    const v = tracker.getDirectiveId(n);
    if (v !== undefined) seen.set(n, v);
  }
  steps.push({ id, title, action, items: cmp.items().map((x) => x.id), rows: r, ...lastIndex, trackerSize: (tracker as any).currentDirectiveId.size });
}

await record('initial', '最初', "items = [a, b, c]");
cmp.items.update((xs) => [...xs, { id: 'd' }]);
await record('push', '末尾に足す', "items.update(xs => [...xs, {id: 'd'}])");
cmp.items.update((xs) => xs.filter((x) => x.id !== 'b'));
await record('remove', '途中を消す', "items.update(xs => xs.filter(x => x.id !== 'b'))");
cmp.items.update((xs) => [...xs].reverse());
await record('reverse', '並べ替える', 'items.update(xs => [...xs].reverse())');
cmp.items.update((xs) => xs.map((x) => ({ id: x.id })));
await record('new-objects', '同じ id の新しいオブジェクトに替える', 'items.update(xs => xs.map(x => ({id: x.id})))');
await record('again', '何も変えずに頼み直す', '（操作なし）');

// プロファイラーの記録中（capture.ts の start）と同じく preservation にする
tracker.selectMode('preservation');
cmp.items.update((xs) => xs.filter((x) => x.id !== 'a'));
await record('preserve-remove', 'preservation で消す', "selectMode('preservation') → items から a を消す");
await record('preserve-again', 'preservation のまま頼み直す', '（操作なし）');
tracker.selectMode('normal');
await record('normal-again', 'normal に戻して頼み直す', "selectMode('normal')");

// idToInjector（WeakRef）の様子。木の resolutionPath に出た注入器の id が、GC のあとも引けるか
send('getLatestComponentExplorerView', [undefined]);
await tick(10);
const forest = (take().find((m) => m.topic === 'latestComponentExplorerView')!.args[0] as any).forest;
const path = forest[0].resolutionPath.concat(forest[0].children[0].children[0].resolutionPath.slice(0, 1));
const alive = () => path.map((i: any) => ({ id: i.id, type: i.type, name: i.name, alive: !!idToInjector.get(i.id)?.deref(), inMap: idToInjector.has(i.id) }));
const before = alive();
for (let k = 0; k < 5; k++) {
  (globalThis as any).gc();
  await tick(50);
}
const after = alive();
const replies: any[] = [];
for (const inj of path) {
  send('getInjectorProviders', [inj]);
  await tick(5);
  replies.push({ id: inj.id, replied: take().some((m) => m.topic === 'latestInjectorProviders') });
}

await writeJson(OUT, { core: VERSION.full, template: TEMPLATE, steps, weakRef: { before, after, replies } });
process.exit(0);

```

## ここまでの呼び出し

- `getLatestComponentExplorerViewCallback(query)` — client-event-subscribers.ts 177 — *第 5 回*
  - `DirectiveForestManager.indexForest()` — manager.ts 56
    - `IdentityTracker.index()` — identity-tracker.ts 101
      - `buildDirectiveForest()` → `indexForest(forest)` → `indexTree(node, i, parentPosition)` — identity-tracker.ts 102・202・182
      - `indexInternal(root, …)` → `indexNode(instance, position, newNodes)` — identity-tracker.ts 121・143
      - `cleanupDirective(dir)` か `pendingRemovals.add(dir)` — identity-tracker.ts 114・112
    - `cb(output)` → `getProfiler().onIndexForest(newNodes, removedNodes)` — manager.ts 62・96 — *第 13 回*
  - `prepareForestForSerialization(…)` → `getDirectiveId(instance)` — client-event-subscribers.ts 454・466 — *id を forest に入れる*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| directive-forest/identity-tracker/identity-tracker.spec.ts | describe `IdentityTracker`（11 行目）の中の `selectMode`（35 行目、it 5 件）・`index() cleanup behavior`（89 行目、it 6 件）。合わせて 11 件 | `//devtools/projects/ng-devtools-backend/src/lib/directive-forest/identity-tracker:test` |

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/identity-tracker/identity-tracker.spec.ts` L101–112 （▶ の行: 103, 105–106, 108–109, 111）

```ts
101 │     it('keeps a stale directive in maps during `preservation` mode, staging it for deferred cleanup', () => {
102 │       const dir = {};
103 ▶       seedDirective({dir, id: 0});
104 │ 
105 ▶       tracker.selectMode('preservation');
106 ▶       tracker.index();
107 │ 
108 ▶       expect(tracker.hasDirective(dir)).toBeTrue();
109 ▶       expect(tracker.getDirectiveId(dir)).toBe(0);
110 │       expect(tracker.getDirectivePosition(dir)).toEqual([0]);
111 ▶       expect((tracker as any).pendingRemovals.has(dir)).toBeTrue();
112 │     });
```

この spec は木を作りません。103 行目の `seedDirective`（spec の中の補助の関数）が tracker の private な Map に直接 1 つ書き込み、105〜106 行目で `preservation` にしてから `index()` を呼びます。`window.ng` の偽物には `getComponent` しか無く、ルートの要素も無いので、`buildDirectiveForest` は空の木を返します。だから書き込んだものは「今回いない」になり、108〜111 行目で「Map に残って `pendingRemovals` に入った」ことを確かめます。3 節の 111〜112 行目の道です。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/identity-tracker/identity-tracker.spec.ts` L139–149 （▶ の行: 139, 143–144, 146, 148）

```ts
139 ▶     it('does not add an already-pending directive to removedNodes twice on the next index call', () => {
140 │       const dir = {};
141 │       seedDirective({dir, id: 0});
142 │ 
143 ▶       tracker.selectMode('preservation');
144 ▶       tracker.index();
145 │ 
146 ▶       const {removedNodes} = tracker.index();
147 │ 
148 ▶       expect(removedNodes.some((n) => n.directive === dir)).toBeTrue();
149 │     });
```

139 行目の名前は「すでに残しているディレクティブを、次の `index()` で removedNodes に**二度は足さない**」ですが、148 行目が確かめているのは「2 回目の `index()` の removedNodes に**入っている**」ことです。記録の 7・8 段目（`a` が 2 回続けて removed に出る）は 148 行目の方と同じ振る舞いです。名前と中身のどちらが意図なのかは、この spec とコミット（33b001d478e）のメッセージからは分かりません。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //devtools/projects/ng-devtools-backend/src/lib/directive-forest/identity-tracker:test \
  --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/devtools-logs/b-bazel.log）`

```
identity-tracker/test_bundle.spec.js  Chromium 1/1 test files | 11 passed, 0 failed
identity-tracker/test_bundle.spec.js  Firefox  1/1 test files | 11 passed, 0 failed
//…/directive-forest/identity-tracker:test_chromium   PASSED in 1.7s
//…/directive-forest/identity-tracker:test_firefox    PASSED in 5.5s
```

- 11 件は describe の中の it の数（5 + 6）と同じです。絞り込み（`--test_arg=--grep=selectMode`）は効かず、11 件のままでした（b-bazel-filter.log）。
- 塊（`controlFlowBlock`）を tracker に通す it はありません。`idToInjector` の `WeakRef` を確かめる it もありません（`grep -rn idToInjector devtools/projects --include='*.spec.ts'` で 0 件）。

### 直すとしたら

- id の配り方・消えたノードの判定は `identity-tracker.ts` の `index()` と `indexInternal` です。塊が毎回 new と removed の両方に入るのは、137〜139 行目で `allNodes` に足していないことと、塊のオブジェクトが毎回新しいことの 2 つが重なった結果です。確かめる it は、`identity-tracker.spec.ts` の `index() cleanup behavior` に、`window.ng` の偽物（第 5 回の render-tree.spec.ts の形）で塊を返す木を作って足す形になります。
- 注入器の id は `component-tree.ts` の `getOrCreateInjectorId`（main では `injector-tree/injector-tree.ts`）です。
- 本家に PR を出すことは勧めません。7 節の注入器の件は、手元で「Chrome で要素の注入器の provider を開く → DevTools の Memory パネルで GC を起こす → もう一度開く」を試し、既存の issue を探してから考えます（`gh search issues` で「devtools injector WeakRef」「devtools injector providers」を探した範囲では、この件の issue は見つかりませんでした）。閉じた #67143（DevTools 1.11.0 でタブのメモリが増え続ける。2026-02-19 に閉じた）のような「メモリが増える」issue を読むときは、まず 6 節の修正（2026-03-23）の前の版か後の版かを確かめます（[第 20 回](20-devtools-issues.md)）。

## 聞かれそうな質問

**Q. DevTools はどうやって「さっきと同じコンポーネント」だと分かるのですか？**

インスタンスのオブジェクトそのものを鍵にした Map（58 行目）で id を引くからです。149 行目で Map に無いときだけ新しい id を配るので、同じインスタンスならいつも同じ id です。名前や位置では見分けません。

**Q. `@for` の項目を並べ替えると、DevTools の id は変わりますか？**

track で同じ項目と分かってインスタンスが動いただけなら変わりません（記録の 4 段目）。変わるのは位置で、187 行目のとおり今の木の形から計算し直すからです。

**Q. `track item` で、中身が同じ新しいオブジェクトの配列を渡すとどうなりますか？**

Angular が項目のビューを作り直すので、コンポーネントのインスタンスも新しくなり、DevTools の id も全部新しくなります（記録の 5 段目の下の `@for`）。古いものは removedNodes に入ります。

**Q. プロファイラーの記録中に壊れたコンポーネントの id は、どうして引けるのですか？**

記録中は `preservation` のモードで、111〜112 行目が Map から消さずに `pendingRemovals` に残すからです。記録を止めて `normal` に戻すと、97 行目の `flushPendingRemovals` がまとめて消します。

**Q. `idToInjector` はなぜ `WeakRef` なのですか？**

84d757446bf で、見なかった注入器を毎回のループで消す仕組みをやめ、GC に任せるためです。注入器が回収されたら 61〜63 行目の `FinalizationRegistry` が Map の項目も消します。ただし要素の注入器は呼ばれるたびに作られる一時的なオブジェクトなので（core の 147 行目）、7 節のとおり早く回収されることがあります。

## 読み終えて

- `IdentityTracker` はインスタンスを鍵にした Map で id を配ります。同じインスタンスなら同じ id、作り直されれば新しい id です。
- 位置は毎回、木の形から付け直します。並べ替えで変わるのは位置で、id ではありません。
- 前の木にいて今回いないものが removedNodes です。記録中（preservation）は残し、止めたときにまとめて片付けます（33b001d478e で入った片付け）。
- 制御フローの塊は毎回新しいオブジェクトなので、数の id は毎回変わります。パネルは塊を文字列の id で見分けます。
- `idToInjector` は `WeakRef` で注入器を持ちます（84d757446bf）。要素の注入器は一時的なオブジェクトなので、GC で消えることを記録で確かめました。

---

← 前: [@for・@defer を木に出す：制御フローの塊と静的なノード](06-devtools-control-flow.md)  
次: [パネルの木：平らな木への展開・差分・絞り込み](08-devtools-forest-ui.md) →
