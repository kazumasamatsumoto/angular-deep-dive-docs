[目次](../README.md) › [テンプレートと DOM](README.md) › 第 2 回 / 全 8 回

# ng-content のセレクタは CSS ではない

> コンテンツ投影の振り分けを読む。\* が最後に評価される理由と、対応しているセレクタがタグ名・属性・クラスだけである理由が分かる。

angular/angular · 読了 約 10 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/projection)

---

`<ng-content>` は「子要素をここに出す」仕組みです。ただ `select` を書いたときの照合規則は、CSS セレクタに似ていて別物です。読む対象は `instructions/projection.ts` と `node_selector_matcher.ts` です。

## 1. 振り分けは 1 回だけ行われる

📄 `angular/packages/core/src/render3/instructions/projection.ts` L96–130 （▶ の行: 99, 111–112, 118, 120）

```ts
 96 │ export function ɵɵprojectionDef(projectionSlots?: (string | (string | number)[][])[]): void {
 97 │   const componentNode = getLView()[DECLARATION_COMPONENT_VIEW][T_HOST] as TElementNode;
 98 │ 
 99 ▶   if (!componentNode.projection) {
100 │     // If no explicit projection slots are defined, fall back to a single
101 │     // projection slot with the wildcard selector.
102 │     const numProjectionSlots = projectionSlots ? projectionSlots.length : 1;
103 │     const projectionHeads: (TNode | null)[] = (componentNode.projection = newArray(
104 │       numProjectionSlots,
105 │       null! as TNode,
106 │     ));
107 │     const tails: (TNode | null)[] = projectionHeads.slice();
108 │ 
109 │     let componentChild: TNode | null = componentNode.child;
110 │ 
111 ▶     while (componentChild !== null) {
112 ▶       // Do not project let declarations so they don't occupy a slot.
113 │       if (componentChild.type !== TNodeType.LetDeclaration) {
114 │         const slotIndex = projectionSlots
115 │           ? matchingProjectionSlotIndex(componentChild, projectionSlots as ProjectionSlots)
116 │           : 0;
117 │ 
118 ▶         if (slotIndex !== null) {
119 │           if (tails[slotIndex]) {
120 ▶             tails[slotIndex]!.projectionNext = componentChild;
121 │           } else {
122 │             projectionHeads[slotIndex] = componentChild;
123 │           }
124 │           tails[slotIndex] = componentChild;
125 │         }
126 │       }
127 │ 
128 │       componentChild = componentChild.next;
129 │     }
130 │   }
```

99 行目の `if` に注目してください。**すでに振り分け済みなら、何もしません**。この処理はコンポーネントにつき 1 回だけです。

111 行目の `while` で子要素を順にたどり、118 行目からで**スロットごとの連結リスト**を作ります。120 行目の `projectionNext` が次の要素を指す、単方向リストです。

112 行目のコメントも実務的です。`@let` の宣言は**スロットを占有しないように除外されます**。

## 2. どのスロットに入るかの判定

📄 `angular/packages/core/src/render3/instructions/projection.ts` L44–69 （▶ の行: 54–55, 62–63, 68）

```ts
44 │ export function matchingProjectionSlotIndex(
45 │   tNode: TNode,
46 │   projectionSlots: ProjectionSlots,
47 │ ): number | null {
48 │   let wildcardNgContentIndex = null;
49 │   const ngProjectAsAttrVal = getProjectAsAttrValue(tNode);
50 │   for (let i = 0; i < projectionSlots.length; i++) {
51 │     const slotValue = projectionSlots[i];
52 │     // The last wildcard projection slot should match all nodes which aren't matching
53 │     // any selector. This is necessary to be backwards compatible with view engine.
54 ▶     if (slotValue === '*') {
55 ▶       wildcardNgContentIndex = i;
56 │       continue;
57 │     }
58 │     // If we ran into an `ngProjectAs` attribute, we should match its parsed selector
59 │     // to the list of selectors, otherwise we fall back to matching against the node.
60 │     if (
61 │       ngProjectAsAttrVal === null
62 ▶         ? isNodeMatchingSelectorList(tNode, slotValue, /* isProjectionMode */ true)
63 ▶         : isSelectorInSelectorList(ngProjectAsAttrVal, slotValue)
64 │     ) {
65 │       return i; // first matching selector "captures" a given node
66 │     }
67 │   }
68 ▶   return wildcardNgContentIndex;
69 │ }
```

54 行目、`'*'` は**その場では一致させず、覚えておくだけ**です。そして 68 行目で、どれにも当てはまらなかったときに初めて返されます。

52 行目のコメントに理由があります。**「最後のワイルドカードは、どのセレクタにも一致しないノードすべてを受け取る」**。だから `<ng-content>`（セレクタなし）は **書く位置に関係なく「余り物」を受け取ります**。

> [!NOTE]
> **さらに深く**
>
> 62 行目と 63 行目が `ngProjectAs` の実装です。通常はノード自身をセレクタと照合しますが、`ngProjectAs` が付いていれば**その値のほうを照合します**。「`<div>` だけど `[card-title]` として扱ってほしい」といった指定ができるのは、この分岐のおかげです。

> **🧪 DEMO — どのスロットに入るか**
>
> スロット定義は \[\[card-title\], img, \*\] の順。上から照合されます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/projection)

## 3. セレクタは CSS ではない

📄 `angular/packages/core/src/render3/node_selector_matcher.ts` L104–118 （▶ の行: 105, 113）

```ts
104 │ /**
105 ▶  * A utility function to match an Ivy node static data against a simple CSS selector
106 │  *
107 │  * @param tNode static data of the node to match
108 │  * @param selector The selector to try matching against the node.
109 │  * @param isProjectionMode if `true` we are matching for content projection, otherwise we are doing
110 │  * directive matching.
111 │  * @returns true if node matches the selector.
112 │  */
113 ▶ export function isNodeMatchingSelector(
114 │   tNode: TNode,
115 │   selector: CssSelector,
116 │   isProjectionMode: boolean,
117 │ ): boolean {
118 │   ngDevMode && assertDefined(selector[0], 'Selector should have a tag name');
```

105 行目、**「単純な CSS セレクタ」に対して照合する**と書かれています。この「単純な」が重要で、**対応しているのはタグ名・属性・クラスだけ**です。

| 書き方 | 使えるか |
| --- | --- |
| `select="img"` | 使える（タグ名） |
| `select="[card-title]"` | 使える（属性） |
| `select=".header"` | 使える（クラス） |
| `select="div > p"` | **使えない**（子孫の指定） |
| `select="p:first-child"` | **使えない**（擬似クラス） |

> [!WARNING]
> **ハマりどころ**
>
> 「CSS セレクタが効かない」と悩むことがありますが、そもそも**CSS セレクタの全部を実装していない**のが理由です。同じ照合関数はディレクティブのセレクタ判定にも使われているので、`@Component` の `selector` にも同じ制限があります。

## 4. 投影されても「所属」は変わらない

投影された要素がどこに描かれるかは変わりますが、**どのコンポーネントに属するかは変わりません**。

この点は CDK の章で読んだ Portal と同じ考え方です。「論理的な所属」と「物理的な描画位置」を分ける。だから投影した要素の中で使う値は、**投影した側のコンポーネントのもの**になります。

変更検知の章で見た `refreshView` の順序も、これで説明がつきます。content フックが子コンポーネントより先に走るのは、**投影される中身は親のものだから**です。

## 読み終えて

- 振り分けはコンポーネントにつき 1 回だけ。結果は連結リストとして保存される
- `'*'` は最後に評価されるので、書く位置に関係なく「余り物」を受け取る
- セレクタはタグ名・属性・クラスのみ。CSS の全機能は使えない
- `ngProjectAs` は「別のものとして照合させる」ための上書き

---

← 前: [track は何に使われているのか](01-for-track.md)  
次: [@defer の中身は状態機械](03-defer.md) →
