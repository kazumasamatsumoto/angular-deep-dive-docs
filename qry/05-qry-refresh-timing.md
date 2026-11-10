[目次](../README.md) › [クエリ（viewChild・contentChildren）の内側](README.md) › 第 5 回 / 全 7 回

# 更新の時機：static、ngAfterViewInit、ɵɵqueryRefresh と signal クエリ

> 結果がいつ見えるようになるか。ɵɵqueryRefresh は dirty で、かつ「作成の段か」と「static か」が一致するときだけ集めて代入する。static は部品のビューの作成の段の最後に 1 回だけで、@if の中は取れない。refreshView の中ではコンテンツのクエリが埋め込みビューの後、ビューのクエリが子のコンポーネントの後。signal のクエリは ɵɵqueryAdvance で番号だけ進め、CreationMode が下りたあと読まれたときに集める。コンストラクタ・ngOnInit・ngAfterViewInit・effect の中で読んだ値をページの上の本物で記録し、required で結果が無いときの NG0951 も見る。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/qry-refresh-timing)

---

この章では、クエリの結果が**いつ**見えるようになるかを、命令と変更検知の行で確かめます。decorator のクエリは `ɵɵqueryRefresh` が「dirty で、かつ static かどうかと作成の段かどうかが合うとき」だけ集め直して代入し、signal のクエリは変更検知に乗らず、読まれたときに集めます。両方を 1 つの部品に並べ、コンストラクタ・`ngOnInit`・`ngAfterContentInit`・`ngAfterViewInit`・`effect` の中で読んだ値を、このページの上の本物で記録します。

読む対象は `packages/core/src/render3/instructions/queries.ts`（`ɵɵqueryRefresh`・`ɵɵloadQuery`）・`instructions/queries_signals.ts`（`ɵɵqueryAdvance`）・`queries/query_execution.ts`・`instructions/render.ts`・`instructions/change_detection.ts` です。`refreshView` の全体は[refreshView の章](../cd/03-cd-refresh-view.md)、ライフサイクルフックの並べ方は[フックの章](../ivy/13-ivy-hooks.md)、signal のクエリの computed（`createQuerySignalFn`・`refreshSignalQuery`）の中身は[input と viewChild の章](../signals/11-authoring.md)の 6〜7 節で読みました。ここでは、それらが「いつ」呼ばれるかをつなぎます。

1. [1. 1 行の viewChild が生むもの](01-qry-what-declared.md)
2. [2. コンパイラの側](02-qry-compile.md)
3. [3. TQuery の照合](03-qry-tquery-match.md)
4. [4. LQuery と結果の集め方](04-qry-lquery-results.md)
5. **5. 更新の時機**（この章）
6. [6. コンテンツのクエリ](06-qry-content-projection.md)
7. [7. spec と issue](07-qry-tests-issues.md)

## 1. コンパイルの出力：更新の段に並ぶ ɵɵqueryRefresh

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/queries/static_view_query.js` L8–17 （▶ の行: 9–10, 12, 14–15）

```js
 8 │     viewQuery: function ViewQueryComponent_Query(rf, ctx) {
 9 ▶       if (rf & 1) {
10 ▶         $r3$.ɵɵviewQuery(SomeDirective, __QueryFlags.isStatic__|__QueryFlags.descendants__|__QueryFlags.emitDistinctChangesOnly__)($refs$, 5);
11 │       }
12 ▶       if (rf & 2) {
13 │         let $tmp$;
14 ▶         $r3$.ɵɵqueryRefresh($tmp$ = $r3$.ɵɵloadQuery()) && (ctx.someDir = $tmp$.first);
15 ▶         $r3$.ɵɵqueryRefresh($tmp$ = $r3$.ɵɵloadQuery()) && (ctx.foo = $tmp$.first);
16 │       }
17 │     },
```

コンパイラの compliance テストの期待値（`@ViewChild(SomeDirective, {static: true})` と `@ViewChild('foo')`）です。9〜10 行目の作成の段（`rf & 1`）でクエリを作り（[第 1 回](01-qry-what-declared.md)）、12 行目の更新の段（`rf & 2`）では、クエリごとに 1 行、14〜15 行目の `ɵɵqueryRefresh($tmp$ = ɵɵloadQuery()) && (ctx.foo = $tmp$.first)` が並びます。`ɵɵqueryRefresh` が `true` を返したときだけ、`&&` の右側の代入が動きます。signal のクエリだけの行は `ɵɵqueryAdvance()` になります（形は[第 1 回](01-qry-what-declared.md)の mixed\_query\_variants、まとめ方は[第 2 回](02-qry-compile.md)）。

どの行が何番目のクエリかは、引数ではなく、フレームに置いた番号で決まります。

📄 `angular/packages/core/src/render3/state.ts` L125–129 （▶ の行: 126–127, 129）

```ts
125 │   /**
126 ▶    * Current index of a View or Content Query which needs to be processed next.
127 ▶    * We iterate over the list of Queries and increment current query index at every step.
128 │    */
129 ▶   currentQueryIndex: number;
```

📄 `angular/packages/core/src/render3/state.ts` L529–535 （▶ の行: 530, 534）

```ts
529 │ export function getCurrentQueryIndex(): number {
530 ▶   return instructionState.lFrame.currentQueryIndex;
531 │ }
532 │ 
533 │ export function setCurrentQueryIndex(value: number): void {
534 ▶   instructionState.lFrame.currentQueryIndex = value;
535 │ }
```

📄 `angular/packages/core/src/render3/queries/query_execution.ts` L41–54 （▶ の行: 47–48, 50, 52）

```ts
41 │ export function executeViewQueryFn<T>(
42 │   flags: RenderFlags,
43 │   viewQueryFn: ViewQueriesFunction<T>,
44 │   component: T,
45 │ ): void {
46 │   ngDevMode && assertDefined(viewQueryFn, 'View queries function to execute must be defined.');
47 ▶   setCurrentQueryIndex(0);
48 ▶   const prevConsumer = setActiveConsumer(null);
49 │   try {
50 ▶     viewQueryFn(flags, component);
51 │   } finally {
52 ▶     setActiveConsumer(prevConsumer);
53 │   }
54 │ }
```

LFrame（命令が「今どのビューか」を持つ入れ物、[LFrame の章](../ivy/15-ivy-lframe.md)）の `currentQueryIndex` は、126〜127 行目のコメントどおり「次に処理するクエリの番号」です。ビューのクエリ関数を呼ぶ `executeViewQueryFn` は、47 行目でそれを 0 に戻してから 50 行目で呼びます。48 行目で `setActiveConsumer(null)` にして、クエリ関数の中で signal を読んでも、外側の consumer（たとえばテンプレートの consumer）の依存にならないようにしています。コンテンツのクエリの側は、`refreshContentQueries` がディレクティブごとに「そのディレクティブの最初のクエリの番号」をセットしてから呼びます（[refreshView の章](../cd/03-cd-refresh-view.md)で引用、並びは[第 6 回](06-qry-content-projection.md)）。

## 2. ɵɵqueryRefresh：dirty で、static と作成の段が合うときだけ

📄 `angular/packages/core/src/render3/instructions/queries.ts` L72–105 （▶ の行: 75, 77, 79, 81–83, 85–86, 88–90, 92, 95, 104）

```ts
 72 │ export function ɵɵqueryRefresh(queryList: QueryList<any>): boolean {
 73 │   const lView = getLView();
 74 │   const tView = getTView();
 75 ▶   const queryIndex = getCurrentQueryIndex();
 76 │ 
 77 ▶   setCurrentQueryIndex(queryIndex + 1);
 78 │ 
 79 ▶   const tQuery = getTQuery(tView, queryIndex);
 80 │   if (
 81 ▶     queryList.dirty &&
 82 ▶     isCreationMode(lView) ===
 83 ▶       ((tQuery.metadata.flags & QueryFlags.isStatic) === QueryFlags.isStatic)
 84 │   ) {
 85 ▶     if (tQuery.matches === null) {
 86 ▶       queryList.reset([]);
 87 │     } else {
 88 ▶       const result = getQueryResults(lView, queryIndex);
 89 ▶       queryList.reset(result, unwrapElementRef);
 90 ▶       queryList.notifyOnChanges();
 91 │     }
 92 ▶     return true;
 93 │   }
 94 │ 
 95 ▶   return false;
 96 │ }
 97 │ 
 98 │ /**
 99 │  * Loads a QueryList corresponding to the current view or content query.
100 │  *
101 │  * @codeGenApi
102 │  */
103 │ export function ɵɵloadQuery<T>(): QueryList<T> {
104 ▶   return loadQueryInternal<T>(getLView(), getCurrentQueryIndex());
105 │ }
```

1. **75・77 行目：今の番号を取って、次へ進める**

   集め直すかどうかに関係なく、1 つ進めます。だから更新の段の行の並びと、作成の段で LQuery を作った並び（LView の `QUERIES` の並び）が、いつも 1 対 1 でそろいます。
2. **81 行目：`queryList.dirty` でなければ何もしない**

   dirty になるのは[第 4 回](04-qry-lquery-results.md)の 3 節の 4 か所（ビューを作り終えた・入れた・外した・入ったまま壊した）だけです。合うビューが動かなければ、変更検知が何回走っても集め直しません。
3. **82〜83 行目：作成の段かどうかと、static かどうかが一致するときだけ**

   `isCreationMode(lView)` は LView の `CreationMode` の印です。static のクエリは「作成の段のときだけ」、static でないクエリは「作成の段ではないときだけ」集めます。static のクエリは作成の段で一度集めたら、そのあと `dirty` になっても 82〜83 行目が偽なので、**二度と集め直されません**。
4. **85〜86 行目：照合が 1 つも無ければ空にする**

   TQuery の `matches` が `null`（テンプレートのどこにも合うノードが無い）なら、集めずに空で `reset` します。この場合 `notifyOnChanges` は呼びません。
5. **88〜90 行目：集めて、reset して、changes を流す**

   `getQueryResults` と `reset`・`notifyOnChanges` の中身は[第 4 回](04-qry-lquery-results.md)の 4〜6 節です。
6. **92・95 行目：集めたら `true`**

   1 節の 14〜15 行目の `&&` の右側（`ctx.foo = $tmp$.first`）は、ここで `true` を返した回だけ動きます。`@ViewChildren` なら代入するのは同じ `QueryList` の箱です。
7. **103〜104 行目：`ɵɵloadQuery`**

   今の番号の LQuery の `queryList` を返すだけです（下の `loadQueryInternal` の 469 行目）。1 節の行では `ɵɵqueryRefresh` の引数を作るために、番号を進める前に呼ばれます。

📄 `angular/packages/core/src/render3/queries/query.ts` L465–470 （▶ の行: 469）

```ts
465 │ export function loadQueryInternal<T>(lView: LView, queryIndex: number): QueryList<T> {
466 │   ngDevMode &&
467 │     assertDefined(lView[QUERIES], 'LQueries should be defined when trying to load a query');
468 │   ngDevMode && assertIndexInRange(lView[QUERIES]!.queries, queryIndex);
469 ▶   return lView[QUERIES]!.queries[queryIndex].queryList;
470 │ }
```

📄 `angular/packages/core/src/render3/instructions/queries_signals.ts` L58–72 （▶ の行: 61–64, 70–71）

```ts
58 │ /**
59 │  * Advances the current query index by a specified offset.
60 │  *
61 ▶  * Adjusting the current query index is necessary in cases where a given directive has a mix of
62 ▶  * zone-based and signal-based queries. The signal-based queries don't require tracking of the
63 ▶  * current index (those are refreshed on demand and not during change detection) so this instruction
64 ▶  * is only necessary for backward-compatibility.
65 │  *
66 │  * @param index offset to apply to the current query index (defaults to 1)
67 │  *
68 │  * @codeGenApi
69 │  */
70 ▶ export function ɵɵqueryAdvance(indexOffset: number = 1): void {
71 ▶   setCurrentQueryIndex(getCurrentQueryIndex() + indexOffset);
72 │ }
```

signal のクエリは更新の段で何もしないので、番号を進めるだけの `ɵɵqueryAdvance` が置かれます。61〜64 行目のコメントのとおり、これは decorator と signal のクエリが 1 つの部品に混ざったときに、decorator の側の番号をずらさないための命令です。

## 3. 作成の段：static のクエリはここで決まる

部品のビューが最初に作られる `renderView` の中で、クエリに関係する行を上から並べます。

📄 `angular/packages/core/src/render3/instructions/render.ts` L97–101 （▶ の行: 98–100）

```ts
 97 │   try {
 98 ▶     const viewQuery = tView.viewQuery;
 99 ▶     if (viewQuery !== null) {
100 ▶       executeViewQueryFn<T>(RenderFlags.Create, viewQuery, context);
101 │     }
```

📄 `angular/packages/core/src/render3/instructions/render.ts` L122–128 （▶ の行: 123–127）

```ts
122 │ 
123 ▶     // We resolve content queries specifically marked as `static` in creation mode. Dynamic
124 ▶     // content queries are resolved during change detection (i.e. update mode), after embedded
125 ▶     // views are refreshed (see block above).
126 ▶     if (tView.staticContentQueries) {
127 ▶       refreshContentQueries(tView, lView);
128 │     }
```

📄 `angular/packages/core/src/render3/instructions/render.ts` L129–135 （▶ の行: 130–134）

```ts
129 │ 
130 ▶     // We must materialize query results before child components are processed
131 ▶     // in case a child component has projected a container. The LContainer needs
132 ▶     // to exist so the embedded views are properly attached by the container.
133 ▶     if (tView.staticViewQueries) {
134 ▶       executeViewQueryFn<T>(RenderFlags.Update, tView.viewQuery!, context);
135 │     }
```

📄 `angular/packages/core/src/render3/instructions/render.ts` L151–154 （▶ の行: 152）

```ts
151 │   } finally {
152 ▶     lView[FLAGS] &= ~LViewFlags.CreationMode;
153 │     leaveView();
154 │   }
```

1. **98〜100 行目：ビューのクエリ関数を作成の段で呼ぶ**

   テンプレートより**先**です。TQuery（最初の 1 回だけ）と LQuery が作られ、signal のクエリはここで LView と番号に結び付けられます（`bindQueryToSignal`）。このあとテンプレートの作成の段で、要素ごとに照合が進みます（[第 3 回](03-qry-tquery-match.md)）。
2. **テンプレートのあと：`finishViewCreation`**

   テンプレートを作り終えたところで、合うノードのあるクエリを dirty にします（render.ts の行は[第 4 回](04-qry-lquery-results.md)の 3 節）。
3. **126〜127 行目：static のコンテンツのクエリがあれば、ここで集める**

   `staticContentQueries` は、`static: true` のコンテンツのクエリを作ったときに立つ印です（[第 6 回](06-qry-content-projection.md)の `createContentQuery`）。
4. **133〜134 行目：static のビューのクエリがあれば、更新の段の形で呼ぶ**

   `RenderFlags.Update` で呼びますが、LView はまだ `CreationMode` なので、2 節の 82〜83 行目で **static のクエリだけ**が集められます。130〜132 行目のコメントのとおり、子のコンポーネントを作る前に済ませます。
5. **152 行目：`CreationMode` を下ろす**

   `finally` の中です。ここから先、この LView は「作成の段ではない」ので、static のクエリは 2 節の条件で二度と集められず、static でないクエリが集められるようになります。

> [!WARNING]
> **ハマりどころ**
>
> static で見えるのは、**作成の段で作られたノードだけ**です。`@if` や `@for` の中身のビューは、その部品の更新の段（`ɵɵconditional`・`ɵɵrepeater`）で作られるので、`static: true` のクエリにはいつまでも入りません。5 節の DEMO の「#inIf の static: true」の列が、最後まで `undefined` です。

## 4. 更新の段：refreshView の中の 2 か所

📄 `angular/packages/core/src/render3/instructions/change_detection.ts` L273–279 （▶ の行: 273–274, 276–278）

```ts
273 ▶     runEffectsInView(lView);
274 ▶     detectChangesInEmbeddedViews(lView, ChangeDetectionMode.Global);
275 │ 
276 ▶     // Content query results must be refreshed before content hooks are called.
277 ▶     if (tView.contentQueries !== null) {
278 ▶       refreshContentQueries(tView, lView);
279 │     }
```

📄 `angular/packages/core/src/render3/instructions/change_detection.ts` L310–316 （▶ の行: 310–313, 315）

```ts
310 ▶     // View queries must execute after refreshing child components because a template in this view
311 ▶     // could be inserted in a child component. If the view query executes before child component
312 ▶     // refresh, the template might not yet be inserted.
313 ▶     const viewQuery = tView.viewQuery;
314 │     if (viewQuery !== null) {
315 ▶       executeViewQueryFn<T>(RenderFlags.Update, viewQuery, context);
316 │     }
```

部品 P の `refreshView` の中で、クエリに関係するのはこの 2 か所です（全体は[refreshView の章](../cd/03-cd-refresh-view.md)）。273〜274 行目で P のビューの view effect を流し、P の中の埋め込みビュー（`@if` など）を更新したあと、276〜278 行目で P のビューに置かれたディレクティブのコンテンツのクエリを集め直します。そのすぐあとが `ngAfterContentInit` / `Checked` です。310〜312 行目のコメントのとおり、ビューのクエリは**子のコンポーネントを更新したあと**に集めます。この部品のテンプレートが子のコンポーネントの中に入れられることがあり（[第 4 回](04-qry-lquery-results.md)の MOVED\_VIEWS）、子を更新する前だと、まだ入っていないかもしれないからです。そのすぐあとが `ngAfterViewInit` / `Checked` です。

部品 C を親 P のテンプレートに置いたとき、C のクエリから見た順番をまとめます。

- `P の renderView` → テンプレートの作成の段 — render.ts
  - `new C()` — C のコンストラクタ — *C のビューはまだ無い。decorator は undefined、signal は \_lView が無いので空*
  - `renderChildComponents` → `C の renderView` — render.ts L98〜L135
    - `viewQuery(Create)` → テンプレート（Create）→ `finishViewCreation` → static だけ集める
    - `CreationMode` を下ろす — render.ts L152
- `P の refreshView` — change\_detection.ts
  - `P のテンプレート（Update）` — C の入力が入る
  - `C.ngOnInit` — P の preOrderHooks — *static あり。signal は集められる（C の @if はまだ無い）*
  - `runEffectsInView(P)` — L273 — *C のコンストラクタで作った effect の 1 回目（記録で確かめた位置）*
  - `C.ngAfterContentInit` — P の contentHooks
  - `C の refreshView` — detectChangesInChildComponents
    - `C のテンプレート（Update）` → `@if` のビューを作って入れる → dirty
    - `C の viewQuery(Update)` → `ɵɵqueryRefresh` — L315 — *static でないクエリに代入*
  - `C.ngAfterViewInit` — P の viewHooks — *ここで全部そろう*

## 5. signal のクエリ：読んだときに集める

📄 `angular/packages/core/src/render3/queries/query_reactive.ts` L22–32 （▶ の行: 23–26, 31）

```ts
22 │ interface QuerySignalNode<T> extends ComputedNode<T | ReadonlyArray<T>> {
23 ▶   _lView?: LView;
24 ▶   _queryIndex?: number;
25 ▶   _queryList?: QueryList<T>;
26 ▶   _dirtyCounter: WritableSignal<number>;
27 │   /**
28 │    * Stores the last seen, flattened results for a query. This is to avoid marking the signal result
29 │    * computed as dirty when there was view manipulation that didn't impact final results.
30 │    */
31 ▶   _flatValue?: T | ReadonlyArray<T>;
32 │ }
```

📄 `angular/packages/core/src/render3/queries/query_reactive.ts` L122–128 （▶ の行: 122–123, 126–127）

```ts
122 ▶   // 2) we are in the process of constructing a view (the first
123 ▶   // creation pass didn't finish) and a query might have partial results, but we don't want to
124 │   // return those - instead we do delay results collection until all nodes had a chance of matching
125 │   // and we can present consistent, "atomic" (on a view level) results.
126 ▶   if (lView === undefined || queryIndex === undefined || lView[FLAGS] & LViewFlags.CreationMode) {
127 ▶     return (firstOnly ? undefined : EMPTY_ARRAY) as V;
128 │   }
```

signal のクエリは computed のノードに、23〜25 行目の `_lView`・`_queryIndex`・`_queryList` と、26 行目の `_dirtyCounter` をぶら下げたものです（作り方は[input と viewChild の章](../signals/11-authoring.md)の 6 節）。23〜24 行目は 3 節の 98〜100 行目（`bindQueryToSignal`）で初めて入るので、**コンストラクタで読むと** 126 行目の `lView === undefined` で空（`viewChild` は `undefined`、`viewChildren` は空の配列）です。122〜125 行目のコメントのとおり、ビューを作っている途中（`CreationMode`）も空です。途中までの結果は見せません。

3 節の 152 行目で `CreationMode` が下りると、次に読まれたときに `getQueryResults` で集めます。`ɵɵqueryRefresh` の 82〜83 行目のような「static かどうか」の区別はありません。だから signal のクエリは、`ngOnInit` の時点で、作成の段で作られたノード（テンプレートの直下）の結果をもう返します。`@if` の中のように更新の段で作られるノードは、そのビューが入って dirty になり（`_dirtyCounter` が増え）、次に読まれたときに入ります。

> [!NOTE]
> **さらに深く**
>
> 「作成の段が終わったらすぐ読める」ことの裏返しとして、signal のクエリで見つけた子のコンポーネントの**入力は、まだ入っていないことがあります**。子の入力は、クエリを持つ部品の更新の段（4 節の trace の「テンプレート（Update）」）で入るからです。issue #59067（2024-12、開いている）「Signal Queries are populated before the input have been set on the components」がこれで、#61214（2025-05、`@for` の中の `contentChildren`）は、メンテナーが同じ問題として DUPLICATE で閉じています。

## 6. DEMO：同じ要素を 6 通りに読む

> **🧪 DEMO — static: true ／ static: false ／ viewChild() を、コンストラクタ・フック・effect の中で読む**
>
> 部品 `qrt-probe` のテンプレートは `<span #top>` と、`@if (on())` の中の `<span #inIf>` です。それぞれを `@ViewChild(…, {static: true})`・`@ViewChild(…)`・`viewChild(…)` の 3 通りで読みます。コンストラクタ・`ngOnInit`・`ngAfterContentInit`・`ngAfterViewInit` と、コンストラクタで作った `effect`（2 つの `viewChild()` を読む）の中で、6 つの値を記録します。「@if を切り替えて detectChanges」は、`on` を切り替えた直後と、`qrt-probe` の `detectChanges()` のあとに 1 行ずつ足します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/qry-refresh-timing)

本番ビルドをヘッドレスの Chrome で開いて「描く」を押したときの記録です（値があるものは要素名と中身）。

| 読んだ時点 | #top | #inIf（@if の中） |   |   |   |   |
| --- | --- | --- | --- | --- | --- | --- |
| static: true | static: false | viewChild() | static: true | static: false | viewChild() |   |
| constructor | — | — | — | — | — | — |
| ngOnInit | **あり** | — | **あり** | — | — | — |
| effect（1 回目） | あり | — | あり | — | — | — |
| ngAfterContentInit | あり | — | あり | — | — | — |
| ngAfterViewInit | あり | **あり** | あり | — | **あり** | **あり** |
| effect（2 回目） | あり | あり | あり | — | あり | あり |

1. **constructor：全部 undefined**

   decorator のフィールドはまだ代入されておらず、signal は 126 行目の `lView === undefined` です。
2. **ngOnInit：static: true と viewChild() の #top だけ**

   static は 3 節の 133〜134 行目で作成の段に入っています。`static: false` は、`qrt-probe` 自身の更新の段（4 節の 315 行目）がまだなので空です。
3. **effect の 1 回目は ngOnInit と ngAfterContentInit の間**

   4 節の 273 行目の位置です。このとき `@if` のビューはまだ無いので、`#inIf` の `viewChild()` は undefined です。
4. **ngAfterViewInit：#inIf の static: true 以外は全部**

   `@if` のビューが入って dirty になり、315 行目の `ɵɵqueryRefresh` が static でないクエリに代入しました。`static: true` は 2 節の 82〜83 行目で二度と集められません。
5. **effect の 2 回目**

   `#inIf` の `viewChild()` が変わったので、effect がもう一度走りました（ngAfterViewInit のあと）。
6. **@if を切り替えて detectChanges**

   切り替えた直後は、どれも前のままです（ビューはまだ外れていません）。`detectChanges()` のあと、`static: false` と `viewChild()` の `#inIf` が undefined になり、effect が 3 回目を走ります。戻すと、また入ります。
7. **viewChild.required('nowhere') を読む**

   本番ビルドでは「例外: NG0951」だけ、開発ビルド（`ng serve`）では「NG0951: Child query result is required but no value is available. Find more at …/errors/NG0951」と出ます。本番では `ngDevMode` が偽で、文の部分が落ちるからです。required のときに結果が `undefined` ならエラーを投げる行は[input と viewChild の章](../signals/11-authoring.md)の 6 節で読みました（`RuntimeErrorCode.REQUIRED_QUERY_NO_VALUE` は -951）。

## テストと直し方

### spec

| spec | describe / it（行） | この章の節 |
| --- | --- | --- |
| core/test/acceptance/query\_spec.ts | describe `view queries`（79）の it `should set static view child queries in creation mode (and just in creation mode)`（157） | 2・3 節 |
| it `should support multiple static view queries (multiple template passes)`（197） | 3 節 |   |
| describe `content queries`（450）の it `should set static content child queries in creation mode (and just in creation mode)`（550） | 3 節の 126〜127 行目 |   |
| core/test/acceptance/authoring/signal\_queries\_spec.ts | describe `view`（33）の it `should return undefined if optional query is read in the constructor`（54）・`should return an empty array when reading children query in the constructor`（128） | 5 節 |
| it `should query for a required element in a template`（72） | 5 節（作成の段のあとで読める） |   |
| describe `content queries`（304）の it `should not return partial results during the first-time view rendering`（403） | 5 節の 122〜127 行目 |   |
| describe `mix of signal and decorator queries`（617）の 2 つの it（618・654）と、it `should resolve static decorator queries when mixed with signal queries`（701） | 2 節の `ɵɵqueryAdvance` |   |
| core/test/acceptance/component\_spec.ts | describe `required initiliazers`（928）の it `should throw if required query is read in the constructor`（979） | DEMO の required |

📄 `angular/packages/core/test/acceptance/query_spec.ts` L157–175 （▶ の行: 158, 162, 164, 167, 170, 172–173）

```ts
157 │     it('should set static view child queries in creation mode (and just in creation mode)', () => {
158 ▶       const fixture = TestBed.createComponent(StaticViewQueryComp);
159 │       const component = fixture.componentInstance;
160 │ 
161 │       // static ViewChild query should be set in creation mode, before CD runs
162 ▶       expect(component.textDir).toBeInstanceOf(TextDirective);
163 │       expect(component.textDir.text).toEqual('');
164 ▶       expect(component.setEvents).toEqual(['textDir set']);
165 │ 
166 │       // dynamic ViewChild query should not have been resolved yet
167 ▶       expect(component.foo).not.toBeDefined();
168 │ 
169 │       const span = fixture.nativeElement.querySelector('span');
170 ▶       fixture.detectChanges();
171 │       expect(component.textDir.text).toEqual('some text');
172 ▶       expect(component.foo.nativeElement).toBe(span);
173 ▶       expect(component.setEvents).toEqual(['textDir set', 'foo set']);
174 │     });
175 │ 
```

158 行目の `createComponent` だけで（変更検知を走らせる前に）、162 行目で static のクエリが入り、167 行目で static でないクエリはまだ入っていないことを確かめます。170 行目の `detectChanges()` のあと、172 行目で入ります。164・173 行目の `setEvents` は setter に記録を残す仕掛けで、static のクエリへの代入が作成の段の **1 回だけ**であることまで確かめています（3 節の 133〜134 行目と、2 節の 82〜83 行目）。

📄 `angular/packages/core/test/acceptance/authoring/signal_queries_spec.ts` L128–145 （▶ の行: 135, 138, 142–143）

```ts
128 │     it('should return an empty array when reading children query in the constructor', () => {
129 │       let result: readonly ElementRef[] | undefined;
130 │ 
131 │       @Component({
132 │         template: `<div #el></div>`,
133 │       })
134 │       class AppComponent {
135 ▶         divEls = viewChildren<ElementRef<HTMLDivElement>>('el');
136 │ 
137 │         constructor() {
138 ▶           result = this.divEls();
139 │         }
140 │       }
141 │ 
142 ▶       TestBed.createComponent(AppComponent);
143 ▶       expect(result).toEqual([]);
144 │     });
145 │ 
```

138 行目のコンストラクタで `viewChildren` を読むと、143 行目で `[]`。5 節の 126〜127 行目の `EMPTY_ARRAY` です。

### 手元で走らせた結果

📄 `走らせたコマンド`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all '--test_arg=--filter=^query logic'
pnpm bazel test //packages/core/test/acceptance/authoring:test --nocache_test_results --test_output=all '--test_arg=--filter=^queries as signals'
```

- `^query logic`：「104 specs, 0 failures」（2026-11-10、qry-logs/b-acc-query.log）。
- `^queries as signals`（`//packages/core/test/acceptance/authoring:test`）：「Ran 23 of 62 specs」「23 specs, 0 failures」（b-signal-q.log）。signal\_queries\_spec.ts の it の行も 23 です。このターゲットは BUILD.bazel の `zoneless_jasmine_test` で、spec を一度 `authoring_test_compiler` で変換してから走らせる `test_jit` も別にあります。

### 直すとしたら

- decorator のクエリの時機は instructions/queries.ts の `ɵɵqueryRefresh`（82〜83 行目の条件）と、render.ts の 126〜134 行目・change\_detection.ts の 276〜278 行目と 313〜315 行目の位置で決まります。it は query\_spec.ts の describe `view queries` / `content queries` に、157 行目の形（`createComponent` の直後と `detectChanges` のあとで比べる）で足します。
- signal のクエリの時機は query\_reactive.ts の `refreshSignalQuery`（126 行目の条件）と、render.ts の `finishViewCreation` の位置です。it は signal\_queries\_spec.ts に足します。#59067 の「入力より先に見える」は、この 2 つの位置の組み合わせから来ています。

## 聞かれそうな質問

**Q. @ViewChild の static: true と false は、何が違うのですか？**

集める段が違います。`ɵɵqueryRefresh` は 82〜83 行目で「作成の段かどうか」と「static かどうか」が一致するときだけ集めます。static は部品のビューの作成の段の最後（render.ts 133〜134 行目）に 1 回だけ、static でないものは変更検知のたび（dirty なときだけ）に集めます。

**Q. static: true にしたのに、@if の中の要素が取れません。**

`@if` の中のビューは部品の更新の段で作られるので、作成の段で集める static のクエリには入りません。そのあとは 82〜83 行目の条件で二度と集め直されないので、ずっと `undefined` です（DEMO の「#inIf の static: true」）。

**Q. ngOnInit で viewChild() を読むと何が返りますか？**

テンプレートの直下の要素なら、もう返ります。部品のビューの作成の段が終わって `CreationMode` が下りている（render.ts 152 行目）ので、refreshSignalQuery は 126 行目を通り抜けて集めます。`@if` や `@for` の中は、まだ作られていないので `undefined` です。

**Q. 変更検知のたびに、クエリは全部集め直されますか？**

されません。`ɵɵqueryRefresh` は 81 行目で `dirty` でなければ何もせず、代入（1 節の 14〜15 行目の `&&` の右）も動きません。signal のクエリも、`_dirtyCounter` が変わらなければ computed は前の値を返します。

**Q. ɵɵqueryAdvance は何のためにあるのですか？**

どの `ɵɵqueryRefresh` が何番目のクエリかは、LFrame の `currentQueryIndex`（state.ts 129 行目）を 77 行目で 1 つずつ進めて決めています。signal のクエリは更新の段で何もしないので、その分の番号を進めるためだけに `ɵɵqueryAdvance`（queries\_signals.ts 70〜71 行目）を置きます。

**Q. ビューのクエリは、コンテンツのクエリより後に集められるのですか？**

同じ部品のビューの中では、コンテンツのクエリ（change\_detection.ts 276〜278 行目）が先、ビューのクエリ（313〜315 行目）が子のコンポーネントを更新したあとです。310〜312 行目のコメントのとおり、このビューのテンプレートが子のコンポーネントに入れられる場合に備えた順です。

## 読み終えて

- decorator のクエリは、更新の段の `ɵɵqueryRefresh` が dirty なときだけ集め、`true` の回だけ代入される。
- static は作成の段の最後に 1 回だけ。作成の段で作られないノード（@if・@for の中）は入らない。
- ビューのクエリは子のコンポーネントの更新のあと、コンテンツのクエリは埋め込みビューの更新のあと。それぞれ直後に AfterView / AfterContent のフック。
- signal のクエリは CreationMode が下りたあと、読まれたときに集める。ngOnInit でも直下の要素は見えるが、子の入力はまだのことがある（#59067）。

---

← 前: [LQuery と結果の集め方：埋め込みビューと QueryList](04-qry-lquery-results.md)  
次: [コンテンツのクエリ：投影されたノード、ディレクティブのクエリ、継承](06-qry-content-projection.md) →
