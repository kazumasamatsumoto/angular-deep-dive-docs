[目次](../README.md) › [テンプレートコンパイラの内側](README.md) › 第 15 回 / 全 18 回

# @if・@for・@defer の命令ができるまで：conditional・repeater・defer のフェーズ

> ingest がブロックを ConditionalOp / RepeaterCreateOp / DeferOp にした後、conditionals.ts が分岐を 1 つの条件式（どのテンプレートを出すかの番号）にまとめる行、track\_fn\_optimization.ts が track $index / $item / メソッド呼び出しを ɵɵrepeaterTrackByIndex などに置き換える行と、それ以外（track item.id）を reify が共有の矢印関数にする行、defer\_configs.ts が時間の consts を作り、resolve\_defer\_deps\_fns.ts が依存関数の名前を付け、compiler-cli の compileDeferResolverFunction が import() の関数を作る流れ。出力例で確かめる。

angular/angular · 読了 約 15 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-control-flow-phases)

---

`@if`・`@switch`・`@for`・`@defer` は、ingest（[第 10 回](10-compiler-ingest.md)）の段階で IR（中間表現。コンパイラが命令を組み立てるための作業用の操作の列）の `ConditionalCreateOp`・`RepeaterCreateOp`・`DeferOp` になります。この章では、そのあとのフェーズが**分岐を 1 本の条件式（「何番のテンプレートを出すか」の番号）にまとめる行**、**track 式を `ɵɵrepeaterTrackByIndex` や `_forTrack0` という関数に置き換える行**、**@defer の設定値と依存の読み込み関数を作る行**を順に読み、compliance fixture（コンパイラのテスト用の入力と期待出力の組）の出力で確かめます。

読む対象は `compiler/src/template/pipeline/src/` の `ingest.ts`（`ingestIfBlock` / `ingestSwitchBlock` / `ingestForBlock` / `ingestDeferBlock`）、`phases/conditionals.ts`・`track_variables.ts`・`track_fn_optimization.ts`・`defer_configs.ts`・`defer_resolve_targets.ts`・`resolve_defer_deps_fns.ts`・`reify.ts`、`instruction.ts`、`compiler/src/constant_pool.ts`、そして `compiler-cli/test/compliance/test_cases/` の `r3_view_compiler_control_flow/` と `r3_view_compiler_deferred/` です。

1. [1. 全体図](01-compiler.md)
2. [2. コンパイラの入口](02-compiler-entry.md)
3. [3. HTML の字句解析](03-compiler-html-lexer.md)
4. [4. HTML の構文解析](04-compiler-html-parser.md)
5. [5. 式のパーサ](05-compiler-expression-parser.md)
6. [6. バインディングのパーサ](06-compiler-binding-parser.md)
7. [7. R3 AST](07-compiler-r3-ast.md)
8. [8. ブロック構文の解析](08-compiler-control-flow-blocks.md)
9. [9. ディレクティブの照合](09-compiler-binder.md)
10. [10. IR への写像](10-compiler-ingest.md)
11. [11. IR の構造](11-compiler-ir.md)
12. [12. decls・vars・advance](12-compiler-slots-vars.md)
13. [13. 変数とコンテキスト](13-compiler-variables.md)
14. [14. 定数配列と pure function](14-compiler-consts-pure.md)
15. **15. 制御フローのフェーズ**（この章）
16. [16. reify と出力](16-compiler-reify-emit.md)
17. [17. 型検査（TCB）](17-compiler-typecheck.md)
18. [18. スタイルのカプセル化](18-compiler-shadow-css.md)

## 1. ingest の直後：分岐ごとに子ビューと「条件のリスト」

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L624–656 （▶ の行: 627, 629, 632–633, 644, 650, 656）

```ts
624 │ function ingestIfBlock(unit: ViewCompilationUnit, ifBlock: t.IfBlock): void {
625 │   let firstXref: ir.XrefId | null = null;
626 │   let conditions: Array<ir.ConditionalCaseExpr> = [];
627 ▶   for (let i = 0; i < ifBlock.branches.length; i++) {
628 │     const ifCase = ifBlock.branches[i];
629 ▶     const cView = unit.job.allocateView(unit.xref);
630 │     const tagName = ingestControlFlowInsertionPoint(unit, cView.xref, ifCase);
631 │ 
632 ▶     if (ifCase.expressionAlias !== null) {
633 ▶       cView.contextVariables.set(ifCase.expressionAlias.name, ir.CTX_REF);
634 │     }
635 │ 
636 │     let ifCaseI18nMeta: i18n.BlockPlaceholder | undefined = undefined;
637 │     if (ifCase.i18n !== undefined) {
638 │       if (!(ifCase.i18n instanceof i18n.BlockPlaceholder)) {
639 │         throw Error(`Unhandled i18n metadata type for if block: ${ifCase.i18n?.constructor.name}`);
640 │       }
641 │       ifCaseI18nMeta = ifCase.i18n;
642 │     }
643 │ 
644 ▶     const createOp = i === 0 ? ir.createConditionalCreateOp : ir.createConditionalBranchCreateOp;
645 │ 
646 │     const conditionalCreateOp = createOp(
647 │       cView.xref,
648 │       ir.TemplateKind.Block,
649 │       tagName,
650 ▶       'Conditional',
651 │       ir.Namespace.HTML,
652 │       ifCaseI18nMeta,
653 │       ifCase.startSourceSpan,
654 │       ifCase.sourceSpan,
655 │     );
656 ▶     unit.create.push(conditionalCreateOp);
```

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L658–673 （▶ の行: 662–667, 669–670, 672）

```ts
658 │     if (firstXref === null) {
659 │       firstXref = cView.xref;
660 │     }
661 │ 
662 ▶     const caseExpr = ifCase.expression ? convertAst(ifCase.expression, unit.job, null) : null;
663 ▶     const conditionalCaseExpr = new ir.ConditionalCaseExpr(
664 ▶       caseExpr,
665 ▶       conditionalCreateOp.xref,
666 ▶       conditionalCreateOp.handle,
667 ▶       ifCase.expressionAlias,
668 │     );
669 ▶     conditions.push(conditionalCaseExpr);
670 ▶     ingestNodes(cView, ifCase.children);
671 │   }
672 ▶   unit.update.push(ir.createConditionalOp(firstXref!, null, conditions, ifBlock.sourceSpan));
673 │ }
```

1. **627〜629 行目：分岐 1 つにつき子ビューを 1 つ**

   `@if` / `@else if` / `@else` のそれぞれに `allocateView` で子ビュー（後で `MyApp_Conditional_2_Template` のような別関数になる単位）を割り当てます。
2. **644・650・656 行目：分岐を作る命令を create 側に積む**

   最初の分岐だけ `ConditionalCreateOp`、2 番目以降は `ConditionalBranchCreateOp`（644 行目）。650 行目の `'Conditional'` は関数名の部品（[第 16 回](16-compiler-reify-emit.md)の naming.ts で使う）です。
3. **662〜669 行目：分岐の条件を `ConditionalCaseExpr` にして並べる**

   中身は「条件式」「その分岐の xref（IR 内の通し番号）」「その分岐のスロット（`SlotHandle`。番号は後で決まる）」「`as` の別名」の 4 つ。`@else` は条件が無いので 662 行目で `null` になります。
4. **672 行目：update 側に `ConditionalOp` を 1 つだけ**

   2 番目の引数（`test`）は `null`。`@if` には「比べる元の値」が無いからです。

632〜634 行目の `as` は、子ビューの中で別名を `CTX_REF`（そのビューのコンテキストそのもの）として読む設定です。子ビューに渡す値が何かは 3 節で分かります。

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L816–836 （▶ の行: 816–817, 820, 825, 832）

```ts
816 ▶     for (const switchCase of switchCaseGroup.cases) {
817 ▶       const caseExpr = switchCase.expression
818 │         ? convertAst(switchCase.expression, unit.job, switchBlock.startSourceSpan)
819 │         : null;
820 ▶       const conditionalCaseExpr = new ir.ConditionalCaseExpr(
821 │         caseExpr,
822 │         conditionalCreateOp.xref,
823 │         conditionalCreateOp.handle,
824 │       );
825 ▶       conditions.push(conditionalCaseExpr);
826 │     }
827 │     ingestNodes(cView, switchCaseGroup.children);
828 │   }
829 │   unit.update.push(
830 │     ir.createConditionalOp(
831 │       firstXref!,
832 ▶       convertAst(switchBlock.expression, unit.job, null),
833 │       conditions,
834 │       switchBlock.sourceSpan,
835 │     ),
836 │   );
```

`@switch` も同じ形です。違いは 2 つで、816 行目、`@case` が複数並んだグループ（同じ中身を共有する case）でも条件を 1 つずつ積むこと、832 行目で `ConditionalOp` の `test` に `@switch (式)` の式を入れることです。

## 2. どのフェーズがいつ動くか

📄 `angular/packages/compiler/src/template/pipeline/src/emit.ts` L131–153 （▶ の行: 131, 134, 141, 147, 149–150, 152）

```ts
131 ▶   {kind: Kind.Tmpl, fn: generateConditionalExpressions},
132 │   {kind: Kind.Tmpl, fn: generateBoundaryConditions},
133 │   {kind: Kind.Tmpl, fn: createPipes},
134 ▶   {kind: Kind.Tmpl, fn: configureDeferInstructions},
135 │   {kind: Kind.Tmpl, fn: insertIncrementalHydrationRuntime},
136 │   {kind: Kind.Tmpl, fn: createVariadicPipes},
137 │   {kind: Kind.Both, fn: generateArrowFunctions},
138 │   {kind: Kind.Both, fn: generatePureLiteralStructures},
139 │   {kind: Kind.Tmpl, fn: generateProjectionDefs},
140 │   {kind: Kind.Tmpl, fn: generateLocalLetReferences},
141 ▶   {kind: Kind.Tmpl, fn: generateVariables},
142 │   {kind: Kind.Tmpl, fn: resolveBoundaries},
143 │   {kind: Kind.Tmpl, fn: saveAndRestoreView},
144 │   {kind: Kind.Both, fn: deleteAnyCasts},
145 │   {kind: Kind.Both, fn: removeSafeNavigationMigration},
146 │   {kind: Kind.Both, fn: resolveDollarEvent},
147 ▶   {kind: Kind.Tmpl, fn: generateTrackVariables},
148 │   {kind: Kind.Tmpl, fn: removeIllegalLetReferences},
149 ▶   {kind: Kind.Both, fn: resolveNames},
150 ▶   {kind: Kind.Tmpl, fn: resolveDeferTargetNames},
151 │   {kind: Kind.Tmpl, fn: transformTwoWayBindingSet},
152 ▶   {kind: Kind.Tmpl, fn: optimizeTrackFns},
153 │   {kind: Kind.Both, fn: resolveContexts},
```
*emit.ts の phases 配列（74 要素）の 19〜41 番目*

この章で読むフェーズの位置です。131 行目 `generateConditionalExpressions`（3 節）、134 行目 `configureDeferInstructions`（5 節）、147 行目 `generateTrackVariables` と 152 行目 `optimizeTrackFns`（4 節）、150 行目 `resolveDeferTargetNames`（5 節）。順番には意味があります。`generateTrackVariables`（147 行目）は名前解決 `resolveNames`（149 行目）より前に置かれています。`resolveNames` は名前読み（`LexicalReadExpr`）をビューの変数の読みに解決してしまうので、その前に track 式の中の `item` を「track 関数の引数 `$item`」に置き換えておかなければなりません（4 節）。依存の読み込み関数に名前を付ける `resolveDeferDepsFns` は、配列のずっと後ろ、関数名を決める `nameFunctionsAndVariables` の直後にあります（5 節）。

## 3. @if / @switch：分岐を 1 本の三項演算子にする

📄 `angular/packages/compiler/src/template/pipeline/src/phases/conditionals.ts` L16–36 （▶ の行: 19, 26, 28–29, 32, 36）

```ts
16 │ export function generateConditionalExpressions(job: ComponentCompilationJob): void {
17 │   for (const unit of job.units) {
18 │     for (const op of unit.ops()) {
19 ▶       if (op.kind !== ir.OpKind.Conditional) {
20 │         continue;
21 │       }
22 │ 
23 │       let test: o.Expression;
24 │ 
25 │       // Any case with a `null` condition is `default`. If one exists, default to it instead.
26 ▶       const defaultCase = op.conditions.findIndex((cond) => cond.expr === null);
27 │       if (defaultCase >= 0) {
28 ▶         const slot = op.conditions.splice(defaultCase, 1)[0].targetSlot;
29 ▶         test = new ir.SlotLiteralExpr(slot);
30 │       } else {
31 │         // By default, a switch evaluates to `-1`, causing no template to be displayed.
32 ▶         test = o.literal(-1);
33 │       }
34 │ 
35 │       // Switch expressions assign their main test to a temporary, to avoid re-executing it.
36 ▶       let tmp = op.test != null ? new ir.AssignTemporaryExpr(op.test, job.allocateXrefId()) : null;
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/conditionals.ts` L41–75 （▶ の行: 41, 46–48, 53–57, 61, 63–66, 71, 75）

```ts
41 ▶       for (let i = op.conditions.length - 1; i >= 0; i--) {
42 │         let conditionalCase = op.conditions[i];
43 │         if (conditionalCase.expr === null) {
44 │           continue;
45 │         }
46 ▶         if (tmp !== null) {
47 ▶           const useTmp = i === 0 ? tmp : new ir.ReadTemporaryExpr(tmp.xref);
48 ▶           conditionalCase.expr = new o.BinaryOperatorExpr(
49 │             o.BinaryOperator.Identical,
50 │             useTmp,
51 │             conditionalCase.expr,
52 │           );
53 ▶         } else if (conditionalCase.alias !== null) {
54 ▶           // Since we can only pass one variable into the conditional instruction,
55 ▶           // reuse the same variable to store the result of the expressions.
56 ▶           caseExpressionTemporaryXref ??= job.allocateXrefId();
57 ▶           conditionalCase.expr = new ir.AssignTemporaryExpr(
58 │             conditionalCase.expr,
59 │             caseExpressionTemporaryXref,
60 │           );
61 ▶           op.contextValue = new ir.ReadTemporaryExpr(caseExpressionTemporaryXref);
62 │         }
63 ▶         test = new o.ConditionalExpr(
64 ▶           conditionalCase.expr,
65 ▶           new ir.SlotLiteralExpr(conditionalCase.targetSlot),
66 ▶           test,
67 │         );
68 │       }
69 │ 
70 │       // Save the resulting aggregate Joost-expression.
71 ▶       op.processed = test;
72 │ 
73 │       // Clear the original conditions array, since we no longer need it, and don't want it to
74 │       // affect subsequent phases (e.g. pipe creation).
75 ▶       op.conditions = [];
```

1. **26〜33 行目：「どれにも当たらないとき」の値を決める**

   条件が `null` の分岐（`@else` / `@default`）があれば、その分岐を取り除いて（28 行目の `splice`）そのスロット番号を初期値にします（29 行目）。無ければ `-1`（32 行目）。`-1` は「何も表示しない」です。
2. **36 行目：`@switch` だけ、比べる値を一時変数に入れる**

   `op.test` は 1 節 832 行目で入れた `@switch (式)`。式を case の数だけ評価しないよう `AssignTemporaryExpr` で包みます。
3. **41 行目：最後の分岐から先頭へ逆向きに**

   63〜67 行目で `条件 ? この分岐のスロット : ここまでの式` を作り、それを次の（1 つ前の）分岐の「偽のとき」にします。逆向きに積むので、できあがりは先頭の分岐から順に試す入れ子の三項演算子です。
4. **46〜52 行目：`@switch` は `一時変数 === case の値` に**

   先頭の case（`i === 0`、47 行目）でだけ代入し、残りは読むだけにします。ループは逆向きなので、先頭の case は最後に処理され、出力では一番左＝最初に評価される位置に来ます。
5. **53〜61 行目：`as` 付きの分岐は条件の値を一時変数に取っておく**

   当たった分岐の子ビューには、条件の値そのものを渡したい（1 節の `CTX_REF`）。`ɵɵconditional` に渡せる値は 1 つなので（54〜55 行目のコメント）、全分岐で同じ一時変数を使い（56 行目）、61 行目でそれを `contextValue` にします。
6. **71・75 行目：結果を `op.processed` に置き、元の条件のリストは捨てる**

📄 `angular/packages/compiler/src/template/pipeline/src/phases/reify.ts` L764–769 （▶ の行: 768）

```ts
764 │       case ir.OpKind.Conditional:
765 │         if (op.processed === null) {
766 │           throw new Error(`Conditional test was not set.`);
767 │         }
768 ▶         ir.OpList.replace(op, ng.conditional(op.processed, op.contextValue, op.sourceSpan));
769 │         break;
```

最後に reify（[第 16 回](16-compiler-reify-emit.md)）が、768 行目で `ɵɵconditional(processed, contextValue)` の呼び出しに置き換えます。式の中の `SlotLiteralExpr` は、そのときまでに `allocateSlots`（[第 12 回](12-compiler-slots-vars.md)）が決めたスロット番号の数値リテラルになります。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_control_flow/basic_if_else_if.ts` L4–17 （▶ の行: 7, 9, 11, 13）

```ts
 4 │     template: `
 5 │     <div>
 6 │       {{message}}
 7 ▶       @if (value() === 1) {
 8 │         one
 9 ▶       } @else if (otherValue() === 2) {
10 │         two
11 ▶       } @else if (message) {
12 │         three
13 ▶       } @else {
14 │         four
15 │       }
16 │     </div>
17 │   `,
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_control_flow/basic_if_else_if_template.js` L25–38 （▶ の行: 29, 36）

```js
25 │ function MyApp_Template(rf, ctx) {
26 │   if (rf & 1) {
27 │     $r3$.ɵɵelementStart(0, "div");
28 │     $r3$.ɵɵtext(1);
29 ▶     $r3$.ɵɵconditionalCreate(2, MyApp_Conditional_2_Template, 1, 0)(3, MyApp_Conditional_3_Template, 1, 0)(4, MyApp_Conditional_4_Template, 1, 0)(5, MyApp_Conditional_5_Template, 1, 0);
30 │     $r3$.ɵɵelementEnd();
31 │   }
32 │   if (rf & 2) {
33 │     $r3$.ɵɵadvance();
34 │     $r3$.ɵɵtextInterpolate1(" ", ctx.message, " ");
35 │     $r3$.ɵɵadvance();
36 ▶     $r3$.ɵɵconditional(ctx.value() === 1 ? 2 : ctx.otherValue() === 2 ? 3 : ctx.message ? 4 : 5);
37 │   }
38 │ }
```
*期待出力は部分一致で比較され、… は省略を表す*

29 行目、4 つの分岐がスロット 2〜5 に置かれます（0 が `div`、1 がテキスト）。36 行目が 3 節の結果です。`@else` のスロット 5 が一番内側の「偽のとき」（3 節 29 行目の初期値）、残りが先頭から順に並んでいます。**@if の分岐が番号になるのは、その番号が「表示するテンプレートのスロット番号」だから**です。実行時の `ɵɵconditional` は、前回と番号が違えば古いビューを外し、`HEADER_OFFSET + 番号` のコンテナに新しいビューを作ります（[Ivy シリーズの LContainer の章](../ivy/11-ivy-lcontainer.md)）。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_control_flow/basic_switch_template.js` L25–38 （▶ の行: 33, 37）

```js
25 │ function MyApp_Template(rf, ctx) {
26 │   if (rf & 1) {
27 │     $r3$.ɵɵelementStart(0, "div");
28 │     $r3$.ɵɵtext(1);
29 │     $r3$.ɵɵconditionalCreate(2, MyApp_Case_2_Template, 1, 0)(3, MyApp_Case_3_Template, 1, 0)(4, MyApp_Case_4_Template, 1, 0)(5, MyApp_Case_5_Template, 1, 0);
30 │     $r3$.ɵɵelementEnd();
31 │   }
32 │   if (rf & 2) {
33 ▶   let $MyApp_contFlowTmp$;
34 │     $r3$.ɵɵadvance();
35 │     $r3$.ɵɵtextInterpolate1(" ", ctx.message, " ");
36 │     $r3$.ɵɵadvance();
37 ▶     $r3$.ɵɵconditional(($MyApp_contFlowTmp$ = ctx.value()) === 0 ? 2 : $MyApp_contFlowTmp$ === 1 ? 3 : $MyApp_contFlowTmp$ === 2 ? 4 : 5);
38 │   }
```
*$名前$ は「任意の識別子に一致」というテスト用の書き方（compliance の expect\_emit.ts）*

`@switch (value())` の出力です。37 行目、`value()` は 1 回だけ呼ばれて一時変数に入り、残りの case はそれを読みます（3 節 46〜52 行目）。33 行目の `let` は一時変数の宣言で、名前は `generateTemporaryVariables`（phases の 46 番目）が付けます。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_control_flow/else_if_with_alias_template.js` L10–33 （▶ の行: 16, 28, 32）

```js
10 │ function MyApp_Conditional_3_Template(rf, ctx) {
11 │   if (rf & 1) {
12 │     $r3$.ɵɵtext(0);
13 │   }
14 │   if (rf & 2) {
15 │     const $ctx_r0$ = $r3$.ɵɵnextContext();
16 ▶     $r3$.ɵɵtextInterpolate2(" ", $ctx_r0$.value(), " as ", ctx, " ");
17 │   }
18 │ }
19 │ …
20 │ function MyApp_Template(rf, ctx) {
21 │   if (rf & 1) {
22 │     $r3$.ɵɵdomElementStart(0, "div");
23 │     $r3$.ɵɵtext(1);
24 │     $r3$.ɵɵconditionalCreate(2, MyApp_Conditional_2_Template, 1, 1)(3, MyApp_Conditional_3_Template, 1, 2);
25 │     $r3$.ɵɵdomElementEnd();
26 │   }
27 │   if (rf & 2) {
28 ▶     let $tmp_1_0$;
29 │     $r3$.ɵɵadvance();
30 │     $r3$.ɵɵtextInterpolate1(" ", ctx.message, " ");
31 │     $r3$.ɵɵadvance();
32 ▶     $r3$.ɵɵconditional(ctx.one ? 2 : ($tmp_1_0$ = ctx.value()) ? 3 : -1, $tmp_1_0$);
33 │   }
```
*else\_if\_with\_alias：@if (one) {...} @else if (value(); as alias) { {{value()}} as {{alias}} }*

32 行目、2 番目の引数に一時変数が渡っています（3 節 61 行目）。子ビュー側の 16 行目では `alias` がただの `ctx` になっています。1 節 633 行目で別名を `CTX_REF` にしたので、「子ビューのコンテキスト＝`ɵɵconditional` の 2 番目の引数」をそのまま読むわけです。

## 4. @for：track 式を関数にする

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L1135–1167 （▶ の行: 1135, 1138–1139, 1142, 1146, 1150, 1157, 1160, 1162）

```ts
1135 ▶   repeaterView.contextVariables.set(forBlock.item.name, forBlock.item.value);
1136 │ 
1137 │   for (const variable of forBlock.contextVariables) {
1138 ▶     if (variable.value === '$index') {
1139 ▶       indexVarNames.add(variable.name);
1140 │     }
1141 │     if (variable.name === '$index') {
1142 ▶       repeaterView.contextVariables.set('$index', variable.value).set(indexName, variable.value);
1143 │     } else if (variable.name === '$count') {
1144 │       repeaterView.contextVariables.set('$count', variable.value).set(countName, variable.value);
1145 │     } else {
1146 ▶       repeaterView.aliases.add({
1147 │         kind: ir.SemanticVariableKind.Alias,
1148 │         name: null,
1149 │         identifier: variable.name,
1150 ▶         expression: getComputedForLoopVariableExpression(variable, indexName, countName),
1151 │       });
1152 │     }
1153 │   }
1154 │ 
1155 │   let track: o.Expression;
1156 │ 
1157 ▶   if (forBlock.trackBy === null) {
1158 │     // `@for` without a `track` is invalid and it produces a parser error.
1159 │     // Put a placeholder here so we don't need to account for it throughout the pipeline.
1160 ▶     track = o.variable('$index');
1161 │   } else {
1162 ▶     track = convertAst(
1163 │       forBlock.trackBy,
1164 │       unit.job,
1165 │       convertSourceSpan(forBlock.trackBy.span, forBlock.sourceSpan),
1166 │     );
1167 │   }
```

1. **1135 行目：`item` を子ビューのコンテキスト変数に**

   `forBlock.item.value` は `$implicit`。子ビューの中の `item` は `ctx.$implicit` として読まれます（4 節の fixture の 7 行目）。
2. **1137〜1153 行目：`$index` などの暗黙変数**

   `let i = $index` のような別名は 1139 行目で `indexVarNames` に覚えておきます（track 式で使う）。`$first` や `$even` は 1146〜1151 行目でエイリアスになり、`getComputedForLoopVariableExpression` が `$index === 0` のような式に展開します。
3. **1157〜1166 行目：track 式はまず「普通の式」として変換**

   この時点の `track item.id` は、テンプレートの他の式と同じく「`item` という名前を読む」IR（`LexicalReadExpr`）です。1157〜1160 行目、track が無いのは構文エラー（[第 8 回](08-compiler-control-flow-blocks.md)）なので、パイプラインを止めないための仮の値 `$index` を置きます。

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L1196–1222 （▶ の行: 1197, 1201–1202, 1209, 1211, 1216, 1222）

```ts
1196 │   const tagName = ingestControlFlowInsertionPoint(unit, repeaterView.xref, forBlock);
1197 ▶   const repeaterCreate = ir.createRepeaterCreateOp(
1198 │     repeaterView.xref,
1199 │     emptyView?.xref ?? null,
1200 │     tagName,
1201 ▶     track,
1202 ▶     varNames,
1203 │     emptyTagName,
1204 │     i18nPlaceholder,
1205 │     emptyI18nPlaceholder,
1206 │     forBlock.startSourceSpan,
1207 │     forBlock.sourceSpan,
1208 │   );
1209 ▶   unit.create.push(repeaterCreate);
1210 │ 
1211 ▶   const expression = convertAst(
1212 │     forBlock.expression,
1213 │     unit.job,
1214 │     convertSourceSpan(forBlock.expression.span, forBlock.sourceSpan),
1215 │   );
1216 ▶   const repeater = ir.createRepeaterOp(
1217 │     repeaterCreate.xref,
1218 │     repeaterCreate.handle,
1219 │     expression,
1220 │     forBlock.sourceSpan,
1221 │   );
1222 ▶   unit.update.push(repeater);
```

create 側に `RepeaterCreateOp`（1197〜1209 行目。1201 行目の track 式と、1202 行目の変数名の表 `varNames` を持つ）、update 側に `RepeaterOp`（1216〜1222 行目。`of` の右の式）。@if と違い、条件のリストは無く、track 式の扱いが仕事の中心です。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/track_variables.ts` L19–44 （▶ の行: 22, 26, 29–33）

```ts
19 │ export function generateTrackVariables(job: CompilationJob): void {
20 │   for (const unit of job.units) {
21 │     for (const op of unit.create) {
22 ▶       if (op.kind !== ir.OpKind.RepeaterCreate) {
23 │         continue;
24 │       }
25 │ 
26 ▶       op.track = ir.transformExpressionsInExpression(
27 │         op.track,
28 │         (expr) => {
29 ▶           if (expr instanceof ir.LexicalReadExpr) {
30 ▶             if (op.varNames.$index.has(expr.name)) {
31 ▶               return o.variable('$index');
32 ▶             } else if (expr.name === op.varNames.$implicit) {
33 ▶               return o.variable('$item');
34 │             }
35 │ 
36 │             // TODO: handle prohibited context variables (emit as globals?)
37 │           }
38 │           return expr;
39 │         },
40 │         ir.VisitorContextFlag.None,
41 │       );
42 │     }
43 │   }
44 │ }
```

`generateTrackVariables` です。track 式の中の名前読みを走査し、`$index`（とその別名）なら 31 行目で変数 `$index` に、ループの item の名前なら 33 行目で変数 `$item` に置き換えます。track 式は最終的に `($index, $item) => …` という独立した関数になるので、子ビューのコンテキストではなく**その関数の引数**を読む形にしておくのです。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/track_fn_optimization.ts` L22–55 （▶ の行: 28, 30–31, 33–37, 40, 42, 46–49）

```ts
22 │ export function optimizeTrackFns(job: CompilationJob): void {
23 │   for (const unit of job.units) {
24 │     for (const op of unit.create) {
25 │       if (op.kind !== ir.OpKind.RepeaterCreate) {
26 │         continue;
27 │       }
28 ▶       if (op.track instanceof o.ReadVarExpr && op.track.name === '$index') {
29 │         // Top-level access of `$index` uses the built in `repeaterTrackByIndex`.
30 ▶         op.trackByFn = o.importExpr(Identifiers.repeaterTrackByIndex);
31 ▶       } else if (op.track instanceof o.ReadVarExpr && op.track.name === '$item') {
32 │         // Top-level access of the item uses the built in `repeaterTrackByIdentity`.
33 ▶         op.trackByFn = o.importExpr(Identifiers.repeaterTrackByIdentity);
34 ▶       } else if (isTrackByFunctionCall(job.root.xref, op.track)) {
35 ▶         // Mark the function as using the component instance to play it safe
36 ▶         // since the method might be using `this` internally (see #53628).
37 ▶         op.usesComponentInstance = true;
38 │ 
39 │         // Top-level method calls in the form of `fn($index, item)` can be passed in directly.
40 ▶         if (op.track.receiver.receiver.view === unit.xref) {
41 │           // TODO: this may be wrong
42 ▶           op.trackByFn = op.track.receiver;
43 │         } else {
44 │           // This is a plain method call, but not in the component's root view.
45 │           // We need to get the component instance, and then call the method on it.
46 ▶           op.trackByFn = o
47 ▶             .importExpr(Identifiers.componentInstance)
48 ▶             .callFn([])
49 ▶             .prop(op.track.receiver.name);
50 │           // Because the context is not avaiable (without a special function), we don't want to
51 │           // try to resolve it later. Let's get rid of it by overwriting the original track
52 │           // expression (which won't be used anyway).
53 │           op.track = op.trackByFn;
54 │         }
55 │       } else {
```

1. **28〜30 行目：`track $index` → `ɵɵrepeaterTrackByIndex`**

   式全体が変数 `$index` 1 つなら、関数を作らず実行時が用意した関数を参照します（`o.importExpr`）。
2. **31〜33 行目：`track item` → `ɵɵrepeaterTrackByIdentity`**

   2 節 147 行目の `generateTrackVariables` が先に `item` を `$item` にしているので、ここで判定できます。
3. **34〜54 行目：`track trackFn($index, item)` → メソッドそのもの**

   `isTrackByFunctionCall` は「コンポーネントのメソッドを `($index)` か `($index, $item)` の引数で呼んでいる」形かを見ます。ルートビューなら 42 行目でメソッドの参照（`ctx.trackFn`）をそのまま渡し、入れ子のビューなら 46〜49 行目で `ɵɵcomponentInstance().trackFn` にします。37 行目、35〜36 行目のコメントのとおりメソッドの中で `this` が使われる場合に備えて `usesComponentInstance` を立てます。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/track_fn_optimization.ts` L56–86 （▶ の行: 59, 64–66, 75–78, 81, 85）

```ts
56 │         // The track function could not be optimized.
57 │         // Replace context reads with a special IR expression, since context reads in a track
58 │         // function are emitted specially.
59 ▶         op.track = ir.transformExpressionsInExpression(
60 │           op.track,
61 │           (expr) => {
62 │             if (expr instanceof ir.PipeBindingExpr || expr instanceof ir.PipeBindingVariadicExpr) {
63 │               throw new Error(`Illegal State: Pipes are not allowed in this context`);
64 ▶             } else if (expr instanceof ir.ContextExpr) {
65 ▶               op.usesComponentInstance = true;
66 ▶               return new ir.TrackContextExpr(expr.view);
67 │             }
68 │             return expr;
69 │           },
70 │           ir.VisitorContextFlag.None,
71 │         );
72 │ 
73 │         // Also create an OpList for the tracking expression since it may need
74 │         // additional ops when generating the final code (e.g. temporary variables).
75 ▶         const trackOpList = new ir.OpList<ir.UpdateOp>();
76 ▶         trackOpList.push(
77 ▶           ir.createStatementOp(
78 ▶             new o.ReturnStatement(op.track, op.track.sourceSpan, [
79 │               // The return statement might have `this` expressions
80 │               // that are implicitly typed as `any`.
81 ▶               tsIgnoreComment(),
82 │             ]),
83 │           ),
84 │         );
85 ▶         op.trackByOps = trackOpList;
86 │       }
```

それ以外（`track item.id` など）は最適化できません。59〜71 行目でコンポーネントのプロパティ読み（`ContextExpr`）を `TrackContextExpr` に置き換え、65 行目で `usesComponentInstance` を立てます。`TrackContextExpr` は reify で `this` になります。75〜85 行目、`return track式` の 1 文を持つ op の列を `trackByOps` に入れます（81 行目の `@ts-ignore` は `this` が暗黙の any になるため）。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/reify.ts` L975–1011 （▶ の行: 975–977, 989, 1002–1007, 1010）

```ts
 975 ▶   const params: o.FnParam[] = [
 976 ▶     new o.FnParam('$index', o.NUMBER_TYPE),
 977 ▶     new o.FnParam('$item', o.DYNAMIC_TYPE),
 978 │   ];
 979 │   let fn: o.FunctionExpr | o.ArrowFunctionExpr;
 980 │ 
 981 │   if (op.trackByOps === null) {
 982 │     // If there are no additional ops related to the tracking function, we just need
 983 │     // to turn it into a function that returns the result of the expression.
 984 │     fn = op.usesComponentInstance
 985 │       ? o.fn(params, [new o.ReturnStatement(op.track)])
 986 │       : o.arrowFn(params, op.track);
 987 │   } else {
 988 │     // Otherwise first we need to reify the track-related ops.
 989 ▶     reifyUpdateOperations(unit, op.trackByOps);
 990 │ 
 991 │     const statements: o.Statement[] = [];
 992 │     for (const trackOp of op.trackByOps) {
 993 │       if (trackOp.kind !== ir.OpKind.Statement) {
 994 │         throw new Error(
 995 │           `AssertionError: expected reified statements, but found op ${ir.OpKind[trackOp.kind]}`,
 996 │         );
 997 │       }
 998 │       statements.push(trackOp.statement);
 999 │     }
1000 │ 
1001 │     // Afterwards we can create the function from those ops.
1002 ▶     fn =
1003 ▶       op.usesComponentInstance ||
1004 ▶       statements.length !== 1 ||
1005 ▶       !(statements[0] instanceof o.ReturnStatement)
1006 ▶         ? o.fn(params, statements)
1007 ▶         : o.arrowFn(params, statements[0].value);
1008 │   }
1009 │ 
1010 ▶   op.trackByFn = unit.job.pool.getSharedFunctionReference(fn, '_forTrack');
1011 │   return op.trackByFn;
```

reify の `reifyTrackBy` です（track\_fn\_optimization.ts 28〜49 行目で `trackByFn` が入った場合は、この関数の先頭で即座にそれを返します）。975〜978 行目で引数 `($index, $item)` を用意し、989 行目で `trackByOps` を文にし、1002〜1007 行目で関数の形を選びます。**`this` を使う（`usesComponentInstance`）か文が 1 つの return でなければ `function`、そうでなければアロー関数**です。アロー関数は `this` を束縛し直せないからです。1010 行目で定数プールに `_forTrack` という名前で登録します。

📄 `angular/packages/compiler/src/constant_pool.ts` L167–201 （▶ の行: 174, 177–178, 194–198）

```ts
167 │   getSharedFunctionReference(
168 │     fn: o.Expression,
169 │     prefix: string,
170 │     useUniqueName: boolean = true,
171 │   ): o.Expression {
172 │     const isArrow = fn instanceof o.ArrowFunctionExpr;
173 │ 
174 ▶     for (const current of this.statements) {
175 │       // Arrow functions are saved as variables so we check if the
176 │       // value of the variable is the same as the arrow function.
177 ▶       if (isArrow && current instanceof o.DeclareVarStmt && current.value?.isEquivalent(fn)) {
178 ▶         return o.variable(current.name);
179 │       }
180 │ 
181 │       // Function declarations are saved as function statements
182 │       // so we compare them directly to the passed-in function.
183 │       if (
184 │         !isArrow &&
185 │         current instanceof o.DeclareFunctionStmt &&
186 │         fn instanceof o.FunctionExpr &&
187 │         fn.isEquivalent(current)
188 │       ) {
189 │         return o.variable(current.name);
190 │       }
191 │     }
192 │ 
193 │     // Otherwise declare the function.
194 ▶     const name = useUniqueName ? this.uniqueName(prefix) : prefix;
195 ▶     this.statements.push(
196 ▶       fn instanceof o.FunctionExpr
197 ▶         ? fn.toDeclStmt(name, o.StmtModifier.Final)
198 ▶         : new o.DeclareVarStmt(name, fn, o.INFERRED_TYPE, o.StmtModifier.Final, fn.sourceSpan),
199 │     );
200 │     return o.variable(name);
201 │   }
```

`ConstantPool.getSharedFunctionReference` は、174〜191 行目で同じファイルの中に**同じ形の関数が既にあればそれを使い回し**（177 行目の `isEquivalent`）、無ければ 194 行目で `_forTrack0`、`_forTrack1`… と番号を付けてファイルの先頭に宣言します（195〜199 行目）。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_control_flow/for_track_by_field.ts` L4–11 （▶ の行: 7）

```ts
 4 │     template: `
 5 │     <div>
 6 │       {{message}}
 7 ▶       @for (item of items; track item.name[0].toUpperCase()) {
 8 │         {{item.name}}
 9 │       }
10 │     </div>
11 │   `,
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_control_flow/for_track_by_field_template.js` L1–25 （▶ の行: 1, 7, 16, 23）

```js
 1 ▶ const $_forTrack0$ = ($index, $item) => $item.name[0].toUpperCase();
 2 │ function MyApp_For_3_Template(rf, ctx) {
 3 │   if (rf & 1) {
 4 │     $r3$.ɵɵtext(0);
 5 │   }
 6 │   if (rf & 2) {
 7 ▶     const $item_r1$ = ctx.$implicit;
 8 │     $r3$.ɵɵtextInterpolate1(" ", $item_r1$.name, " ");
 9 │   }
10 │ }
11 │ …
12 │ function MyApp_Template(rf, ctx) {
13 │   if (rf & 1) {
14 │     $r3$.ɵɵelementStart(0, "div");
15 │     $r3$.ɵɵtext(1);
16 ▶     $r3$.ɵɵrepeaterCreate(2, MyApp_For_3_Template, 1, 1, null, null, $_forTrack0$);
17 │     $r3$.ɵɵelementEnd();
18 │   }
19 │   if (rf & 2) {
20 │     $r3$.ɵɵadvance();
21 │     $r3$.ɵɵtextInterpolate1(" ", ctx.message, " ");
22 │     $r3$.ɵɵadvance();
23 ▶     $r3$.ɵɵrepeater(ctx.items);
24 │   }
25 │ }
```

1 行目が `track item.name[0].toUpperCase()` から作られた関数です。`item` が `$item` になり（`generateTrackVariables`）、`this` を使わないのでアロー関数です。16 行目、`ɵɵrepeaterCreate` の 7 番目の引数がこの関数。子ビュー側の 7 行目では、同じ `item` が `ctx.$implicit` として読まれていて、track 関数とは別の経路だと分かります。**`track item.id` なら `($index, $item) => $item.id`** になります。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_control_flow/for_track_by_index_template.js` L11–17 （▶ の行: 15）

```js
11 │ function MyApp_Template(rf, ctx) {
12 │   if (rf & 1) {
13 │     $r3$.ɵɵelementStart(0, "div");
14 │     $r3$.ɵɵtext(1);
15 ▶     $r3$.ɵɵrepeaterCreate(2, MyApp_For_3_Template, 1, 1, null, null, $r3$.ɵɵrepeaterTrackByIndex);
16 │     $r3$.ɵɵelementEnd();
17 │   }
```
*for\_track\_by\_index：track $index*

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_control_flow/for_impure_track_reuse.ts` L4–23 （▶ の行: 5, 9）

```ts
 4 │     template: `
 5 ▶     @for (item of items; track trackFn(item, message)) {
 6 │       {{item.name}}
 7 │     }
 8 │ 
 9 ▶     @for (otherItem of otherItems; track trackFn(otherItem, message)) {
10 │       {{otherItem.name}}
11 │     }
12 │   `,
13 │     standalone: false
14 │ })
15 │ export class MyApp {
16 │   message = 'hello';
17 │   items = [{name: 'one'}, {name: 'two'}, {name: 'three'}];
18 │   otherItems = [{name: 'four'}, {name: 'five'}, {name: 'six'}];
19 │ 
20 │   trackFn(item: any, message: string) {
21 │     return message + item.name;
22 │   }
23 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_control_flow/for_impure_track_reuse_template.js` L1–16 （▶ の行: 1, 3, 8–9）

```js
 1 ▶ function $_forTrack0$($index, $item) {
 2 │   /* @ts-ignore */
 3 ▶   return this.trackFn($item, this.message);
 4 │ }
 5 │ …
 6 │ function MyApp_Template(rf, ctx) {
 7 │   if (rf & 1) {
 8 ▶     $r3$.ɵɵrepeaterCreate(0, MyApp_For_1_Template, 1, 1, null, null, $_forTrack0$, true);
 9 ▶     $r3$.ɵɵrepeaterCreate(2, MyApp_For_3_Template, 1, 1, null, null, $_forTrack0$, true);
10 │   }
11 │   if (rf & 2) {
12 │     $r3$.ɵɵrepeater(ctx.items);
13 │     $r3$.ɵɵadvance(2);
14 │     $r3$.ɵɵrepeater(ctx.otherItems);
15 │   }
16 │ }
```

`track trackFn(item, message)` は引数の形が `($index, $item)` でないので最適化されず、コンポーネントを読むので `function` になります（1〜4 行目）。3 行目の `this.message` が `TrackContextExpr` の行き先です。8 行目の末尾の `true` が `usesComponentInstance`。2 つの @for が同じ形なので、9 行目は同じ `_forTrack0` を使い回しています（177 行目）。

📄 `angular/packages/core/src/render3/instructions/control_flow.ts` L338–348 （▶ の行: 342, 345, 347–348）

```ts
338 │   const lView = getLView();
339 │   const tView = getTView();
340 │   const hasEmptyBlock = emptyTemplateFn !== undefined;
341 │   const hostLView = getLView();
342 ▶   const boundTrackBy = trackByUsesComponentInstance
343 │     ? // We only want to bind when necessary, because it produces a
344 │       // new function. For pure functions it's not necessary.
345 ▶       trackByFn.bind(hostLView[DECLARATION_COMPONENT_VIEW][CONTEXT])
346 │     : trackByFn;
347 ▶   const metadata = new RepeaterMetadata(hasEmptyBlock, boundTrackBy);
348 ▶   hostLView[HEADER_OFFSET + index] = metadata;
```
*実行時の ɵɵrepeaterCreate*

実行時は 342〜346 行目、その `true` を見て track 関数をコンポーネントのインスタンスに `bind` します。345 行目のコメントのとおり、`bind` は新しい関数を作るので必要なときだけです。この関数で差分を取る仕組みは [track の章](../template/01-for-track.md)で読みました。

## 5. @defer：子ビュー、設定の定数、依存の読み込み関数

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L868–887 （▶ の行: 871–872, 877, 881, 883）

```ts
868 │ function ingestDeferBlock(unit: ViewCompilationUnit, deferBlock: t.DeferredBlock): void {
869 │   let ownResolverFn: o.Expression | null = null;
870 │ 
871 ▶   if (unit.job.deferMeta.mode === DeferBlockDepsEmitMode.PerBlock) {
872 ▶     if (!unit.job.deferMeta.blocks.has(deferBlock)) {
873 │       throw new Error(
874 │         `AssertionError: unable to find a dependency function for this deferred block`,
875 │       );
876 │     }
877 ▶     ownResolverFn = unit.job.deferMeta.blocks.get(deferBlock) ?? null;
878 │   }
879 │ 
880 │   // Generate the defer main view and all secondary views.
881 ▶   const main = ingestDeferView(
882 │     unit,
883 ▶     '',
884 │     deferBlock.i18n,
885 │     deferBlock.children,
886 │     deferBlock.sourceSpan,
887 │   )!;
```

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L852–865 （▶ の行: 852, 856, 858, 864）

```ts
852 ▶   const secondaryView = unit.job.allocateView(unit.xref);
853 │   ingestNodes(secondaryView, children);
854 │   const templateOp = ir.createTemplateOp(
855 │     secondaryView.xref,
856 ▶     ir.TemplateKind.Block,
857 │     null,
858 ▶     `Defer${suffix}`,
859 │     ir.Namespace.HTML,
860 │     i18nMeta,
861 │     sourceSpan!,
862 │     sourceSpan!,
863 │   );
864 ▶   unit.create.push(templateOp);
865 │   return templateOp;
```

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L910–928 （▶ の行: 911–912, 915–916, 920, 922, 924–926）

```ts
910 │   // Create the main defer op, and ops for all secondary views.
911 ▶   const deferXref = unit.job.allocateXrefId();
912 ▶   const deferOp = ir.createDeferOp(
913 │     deferXref,
914 │     main.xref,
915 ▶     main.handle,
916 ▶     ownResolverFn,
917 │     unit.job.allDeferrableDepsFn,
918 │     deferBlock.sourceSpan,
919 │   );
920 ▶   deferOp.placeholderView = placeholder?.xref ?? null;
921 │   deferOp.placeholderSlot = placeholder?.handle ?? null;
922 ▶   deferOp.loadingSlot = loading?.handle ?? null;
923 │   deferOp.errorSlot = error?.handle ?? null;
924 ▶   deferOp.placeholderMinimumTime = deferBlock.placeholder?.minimumTime ?? null;
925 ▶   deferOp.loadingMinimumTime = deferBlock.loading?.minimumTime ?? null;
926 ▶   deferOp.loadingAfterTime = deferBlock.loading?.afterTime ?? null;
927 │   deferOp.flags = calcDeferBlockFlags(deferBlock);
928 │   unit.create.push(deferOp);
```

1. **871〜878 行目：依存の読み込み関数（ブロックごと）を受け取る**

   `deferMeta.blocks` は、compiler-cli の `ComponentDecoratorHandler.compileDeferBlocks` が R3 AST の `DeferredBlock` ごとに `compileDeferResolverFunction` で作った「`import()` を並べたアロー関数」の表です（依存が無ければ `null`）。どの依存が遅延読み込みの対象になるかを決める側は [standalone シリーズの @defer の章](../standalone/11-standalone-defer-deps.md)で読みました。
2. **852〜864 行目：本体・`@loading`・`@placeholder`・`@error` をそれぞれ子ビューに**

   856 行目 `TemplateKind.Block`、858 行目の関数名の部品は `Defer` / `DeferLoading` / `DeferPlaceholder` / `DeferError`。
3. **911〜927 行目：`DeferOp` に各子ビューのスロットと時間を持たせる**

   915 行目が本体のスロット、916 行目が読み込み関数、920〜923 行目が他の子ビューのスロット、924〜926 行目が `@placeholder (minimum …)` と `@loading (minimum …; after …)` のミリ秒です。

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L964–982 （▶ の行: 965–967, 969, 973, 980–981）

```ts
964 │   // If no (non-prefetching or hydrating) defer triggers were provided, default to `idle`.
965 ▶   const hasConcreteTrigger =
966 ▶     deferOnOps.some((op) => op.modifier === ir.DeferOpModifierKind.NONE) ||
967 ▶     deferWhenOps.some((op) => op.modifier === ir.DeferOpModifierKind.NONE);
968 │ 
969 ▶   if (!hasConcreteTrigger) {
970 │     deferOnOps.push(
971 │       ir.createDeferOnOp(
972 │         deferXref,
973 ▶         {kind: ir.DeferTriggerKind.Idle, timeout: null},
974 │         ir.DeferOpModifierKind.NONE,
975 │         null!,
976 │       ),
977 │     );
978 │   }
979 │ 
980 ▶   unit.create.push(deferOnOps);
981 ▶   unit.update.push(deferWhenOps);
982 │ }
```

トリガー（`on idle` / `when cond` など）は `DeferOnOp`（create 側）と `DeferWhenOp`（update 側）になります。965〜978 行目、`prefetch` / `hydrate` 以外のトリガーが 1 つも無ければ **`on idle` を補います**。`@defer { … }` だけ書くと idle で読み込まれるのはこの行です。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/defer_configs.ts` L17–36 （▶ の行: 24–26, 29–31）

```ts
17 │ export function configureDeferInstructions(job: ComponentCompilationJob): void {
18 │   for (const unit of job.units) {
19 │     for (const op of unit.create) {
20 │       if (op.kind !== ir.OpKind.Defer) {
21 │         continue;
22 │       }
23 │ 
24 ▶       if (op.placeholderMinimumTime !== null) {
25 ▶         op.placeholderConfig = new ir.ConstCollectedExpr(
26 ▶           literalOrArrayLiteral([op.placeholderMinimumTime]),
27 │         );
28 │       }
29 ▶       if (op.loadingMinimumTime !== null || op.loadingAfterTime !== null) {
30 ▶         op.loadingConfig = new ir.ConstCollectedExpr(
31 ▶           literalOrArrayLiteral([op.loadingMinimumTime, op.loadingAfterTime]),
32 │         );
33 │       }
34 │     }
35 │   }
36 │ }
```

`configureDeferInstructions`（2 節 134 行目）です。時間の指定があれば `[最小時間]` / `[最小時間, 遅延時間]` の配列を作り、`ConstCollectedExpr`（「consts 配列に移して添字で参照する」印）で包みます。consts 配列への移動そのものは [第 14 回](14-compiler-consts-pure.md)のフェーズの仕事です。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/defer_resolve_targets.ts` L63–89 （▶ の行: 63–66, 76, 82, 84–85）

```ts
63 ▶       case ir.DeferTriggerKind.Hover:
64 ▶       case ir.DeferTriggerKind.Interaction:
65 ▶       case ir.DeferTriggerKind.Viewport:
66 ▶         if (op.trigger.targetName === null) {
67 │           // A `null` target name indicates we should default to the first element in the
68 │           // placeholder block.
69 │           if (placeholderView === null) {
70 │             throw new Error('defer on trigger with no target name must have a placeholder block');
71 │           }
72 │           const placeholder = job.views.get(placeholderView);
73 │           if (placeholder == undefined) {
74 │             throw new Error('AssertionError: could not find placeholder view for defer on trigger');
75 │           }
76 ▶           for (const placeholderOp of placeholder.create) {
77 │             if (
78 │               ir.hasConsumesSlotTrait(placeholderOp) &&
79 │               (ir.isElementOrContainerOp(placeholderOp) ||
80 │                 placeholderOp.kind === ir.OpKind.Projection)
81 │             ) {
82 ▶               op.trigger.targetXref = placeholderOp.xref;
83 │               op.trigger.targetView = placeholderView;
84 ▶               op.trigger.targetSlotViewSteps = -1;
85 ▶               op.trigger.targetSlot = placeholderOp.handle;
86 │               return;
87 │             }
88 │           }
89 │           return;
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/defer_resolve_targets.ts` L91–110 （▶ の行: 91–93, 95, 97, 102, 107–108）

```ts
 91 ▶         let view: ViewCompilationUnit | null =
 92 ▶           placeholderView !== null ? job.views.get(placeholderView)! : deferOwnerView;
 93 ▶         let step = placeholderView !== null ? -1 : 0;
 94 │ 
 95 ▶         while (view !== null) {
 96 │           const scope = getScopeForView(view);
 97 ▶           if (scope.targets.has(op.trigger.targetName)) {
 98 │             const {xref, slot} = scope.targets.get(op.trigger.targetName)!;
 99 │ 
100 │             op.trigger.targetXref = xref;
101 │             op.trigger.targetView = view.xref;
102 ▶             op.trigger.targetSlotViewSteps = step;
103 │             op.trigger.targetSlot = slot;
104 │             return;
105 │           }
106 │ 
107 ▶           view = view.parent !== null ? job.views.get(view.parent)! : null;
108 ▶           step++;
109 │         }
110 │         break;
```

`on interaction(button)` のように要素を指すトリガーは、`resolveDeferTargetNames`（2 節 150 行目）が「どのビューの何番のスロットか」に直します。66 行目、名前が無い `on interaction` は `@placeholder` の最初の要素（76〜86 行目）。84 行目の `-1` は「プレースホルダのビューの中」という印です。名前があれば 91〜109 行目、プレースホルダのビュー（無ければ @defer を置いたビュー）から親へ向かって参照名を探し、上がった段数を 102 行目の `targetSlotViewSteps` に記録します。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/resolve_defer_deps_fns.ts` L15–39 （▶ の行: 19, 23–24, 29–33）

```ts
15 │ export function resolveDeferDepsFns(job: ComponentCompilationJob): void {
16 │   for (const unit of job.units) {
17 │     for (const op of unit.create) {
18 │       if (op.kind === ir.OpKind.Defer) {
19 ▶         if (op.resolverFn !== null) {
20 │           continue;
21 │         }
22 │ 
23 ▶         if (op.ownResolverFn !== null) {
24 ▶           if (op.handle.slot === null) {
25 │             throw new Error(
26 │               'AssertionError: slot must be assigned before extracting defer deps functions',
27 │             );
28 │           }
29 ▶           const fullPathName = unit.fnName?.replace('_Template', '');
30 ▶           op.resolverFn = job.pool.getSharedFunctionReference(
31 ▶             op.ownResolverFn,
32 ▶             `${fullPathName}_Defer_${op.handle.slot}_DepsFn`,
33 ▶             /* Don't use unique names for TDB compatibility */ false,
34 │           );
35 │         }
36 │       }
37 │     }
38 │   }
39 │ }
```

`resolveDeferDepsFns` は、871〜878 行目で受け取った読み込み関数を定数プールに置きます。名前は 29 行目、ビューの関数名から `_Template` を除いたものに `_Defer_スロット_DepsFn` を付けた形（32 行目）。33 行目で番号を付けない（4 節の `_forTrack0` と違う）代わりに、名前にビューの関数名（29 行目の `unit.fnName`）とスロット番号（24 行目で未割り当てなら例外）を使います。だから関数名を決める `nameFunctionsAndVariables` とスロット割り当ての後でなければ動けません。これが 2 節で見た配置の理由です。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/reify.ts` L385–404 （▶ の行: 386–387, 390–394, 397, 399）

```ts
385 │       case ir.OpKind.Defer:
386 ▶         const timerScheduling =
387 ▶           !!op.loadingMinimumTime || !!op.loadingAfterTime || !!op.placeholderMinimumTime;
388 │         ir.OpList.replace(
389 │           op,
390 ▶           ng.defer(
391 ▶             op.handle.slot!,
392 ▶             op.mainSlot.slot!,
393 ▶             op.resolverFn,
394 ▶             op.loadingSlot?.slot ?? null,
395 │             op.placeholderSlot?.slot! ?? null,
396 │             op.errorSlot?.slot ?? null,
397 ▶             op.loadingConfig,
398 │             op.placeholderConfig,
399 ▶             timerScheduling,
400 │             op.sourceSpan,
401 │             op.flags,
402 │           ),
403 │         );
404 │         break;
```

📄 `angular/packages/compiler/src/template/pipeline/src/instruction.ts` L315–337 （▶ の行: 316–318, 324, 329, 334）

```ts
315 │   const args: Array<o.Expression> = [
316 ▶     o.literal(selfSlot),
317 ▶     o.literal(primarySlot),
318 ▶     dependencyResolverFn ?? o.literal(null),
319 │     o.literal(loadingSlot),
320 │     o.literal(placeholderSlot),
321 │     o.literal(errorSlot),
322 │     loadingConfig ?? o.literal(null),
323 │     placeholderConfig ?? o.literal(null),
324 ▶     enableTimerScheduling ? o.importExpr(Identifiers.deferEnableTimerScheduling) : o.literal(null),
325 │     o.literal(flags),
326 │   ];
327 │ 
328 │   let expr: o.Expression;
329 ▶   while (
330 │     (expr = args[args.length - 1]) !== null &&
331 │     expr instanceof o.LiteralExpr &&
332 │     expr.value === null
333 │   ) {
334 ▶     args.pop();
335 │   }
336 │ 
337 │   return call(Identifiers.defer, args, sourceSpan);
```

reify は `ng.defer(...)` に 11 個の値を渡し（390〜402 行目）、`instruction.ts` の `defer` が引数の配列を組みます。時間の指定が 1 つでもあれば（386〜387 行目）9 番目に `ɵɵdeferEnableTimerScheduling` を入れ（324 行目）、329〜335 行目で**末尾の `null` を取り除いて**出力を短くします。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/reify.ts` L245–260 （▶ の行: 248–249, 251）

```ts
245 │         const childView = unit.job.views.get(op.xref)!;
246 │         ir.OpList.replace(
247 │           op,
248 ▶           // Block templates can't have directives so we can always generate them as DOM-only.
249 ▶           op.templateKind === ir.TemplateKind.Block ||
250 │             unit.job.mode === TemplateCompilationMode.DomOnly
251 ▶             ? ng.domTemplate(
252 │                 op.handle.slot!,
253 │                 o.variable(childView.fnName!),
254 │                 childView.decls!,
255 │                 childView.vars!,
256 │                 op.tag,
257 │                 op.attributes,
258 │                 op.localRefs,
259 │                 op.startSourceSpan,
260 │               )
```

子ビューの方は、856 行目の `TemplateKind.Block` なので、248〜251 行目で必ず `ɵɵdomTemplate`（ディレクティブの照合をしないテンプレート命令）になります。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_deferred/deferred_with_loading_params.ts` L4–10 （▶ の行: 7）

```ts
 4 │     template: `
 5 │     @defer {
 6 │       <button></button>
 7 ▶     } @loading(minimum 2s; after 500ms) {
 8 │       <img src="loading.gif">
 9 │     }
10 │   `,
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_deferred/deferred_with_loading_params_template.js` L1–22 （▶ の行: 1, 7, 16, 19–21）

```js
 1 ▶ function MyApp_Defer_0_Template(rf, ctx) {
 2 │   if (rf & 1) {
 3 │     $r3$.ɵɵelement(0, "button");
 4 │   }
 5 │ }
 6 │ 
 7 ▶ function MyApp_DeferLoading_1_Template(rf, ctx) {
 8 │   if (rf & 1) {
 9 │     $r3$.ɵɵelement(0, "img", 1);
10 │   }
11 │ }
12 │ …export class MyApp {
13 │   …
14 │   static ɵcmp = /*@__PURE__*/ $r3$.ɵɵdefineComponent({
15 │   …
16 ▶   consts: [[2000, 500], ["src", "loading.gif"]],
17 │   template: function MyApp_Template(rf, ctx) {
18 │     if (rf & 1) {
19 ▶       $r3$.ɵɵdomTemplate(0, MyApp_Defer_0_Template, 1, 0)(1, MyApp_DeferLoading_1_Template, 1, 0);
20 ▶       $r3$.ɵɵdefer(2, 0, null, 1, null, null, 0, null, $r3$.ɵɵdeferEnableTimerScheduling);
21 ▶       $r3$.ɵɵdeferOnIdle();
22 │     }
```

| 20 行目の引数 | 値 | 出どころ |
| --- | --- | --- |
| 1 自分のスロット | `2` | 392 行目 `op.handle` |
| 2 本体のスロット | `0` | 19 行目の `MyApp_Defer_0_Template` |
| 3 読み込み関数 | `null` | 依存が無い |
| 4 @loading のスロット | `1` | 19 行目の `MyApp_DeferLoading_1_Template` |
| 5・6 placeholder / error | `null` | 無い |
| 7 loadingConfig | `0` | 16 行目の consts の 0 番 `[2000, 500]`（deferConfigs 29〜33 行目） |
| 8 placeholderConfig | `null` | 途中なので消せない |
| 9 | `ɵɵdeferEnableTimerScheduling` | 324 行目 |

21 行目の `ɵɵdeferOnIdle()` は、トリガーを書いていないので補われたものです（965〜978 行目）。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_deferred/deferred_interaction_placeholder_trigger.ts` L4–15 （▶ の行: 6, 11）

```ts
 4 │     template: `
 5 │     {{message}}
 6 ▶     @defer (on interaction(button); prefetch on interaction(button)) {
 7 │       Main
 8 │     } @placeholder {
 9 │       <div>
10 │         <div>
11 ▶           <button #button>Click me</button>
12 │         </div>
13 │       </div>
14 │     }
15 │   `,
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_deferred/deferred_interaction_placeholder_trigger_template.js` L1–16 （▶ の行: 3, 12–15）

```js
 1 │ function MyApp_DeferPlaceholder_2_Template(rf, ctx) {
 2 │   if (rf & 1) {
 3 ▶     $r3$.ɵɵelementStart(0, "div")(1, "div")(2, "button", null, 0);
 4 │     $r3$.ɵɵtext(4, "Click me");
 5 │     $r3$.ɵɵelementEnd()()();
 6 │   }
 7 │ }
 8 │ …
 9 │ function MyApp_Template(rf, ctx) {
10 │   if (rf & 1) {
11 │     $r3$.ɵɵtext(0);
12 ▶     $r3$.ɵɵdomTemplate(1, MyApp_Defer_1_Template, 1, 0)(2, MyApp_DeferPlaceholder_2_Template, 5, 0);
13 ▶     $r3$.ɵɵdefer(3, 1, null, null, 2);
14 ▶     $r3$.ɵɵdeferOnInteraction(2, -1);
15 ▶     $r3$.ɵɵdeferPrefetchOnInteraction(2, -1);
16 │   }
```

3 行目、`#button` はプレースホルダの子ビューの中のスロット 2 にあります。14・15 行目の `(2, -1)` は「スロット 2 の要素を、段数 `-1`（＝プレースホルダのビューの中）で探す」という意味で、`resolveDeferTargetNames` の 91〜93 行目の出発点（プレースホルダのビュー、段数 `-1`）から 97〜103 行目で見つけた結果です。13 行目の 5 番目の引数 `2` はプレースホルダの子ビュー自身のスロット（親ビューの中の番号）で、14 行目の `2` とは別のものがたまたま同じ数になっています。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_deferred/deferred_with_external_deps_template.js` L5–8 （▶ の行: 5, 7）

```js
5 ▶ const $MyApp_Defer_4_DepsFn$ = () => [
6 │   /* @ts-ignore */
7 ▶   import("./deferred_with_external_deps_lazy").then(m => m.LazyDep)
8 │ ];
```
*deferred\_with\_external\_deps：@defer の中だけで使う LazyDep*

依存がある場合の読み込み関数です。名前 `MyApp_Defer_4_DepsFn` は 32 行目の形そのもの（スロット 4）。中身の `import("./…")` が、バンドラ（esbuild）にとって**別 chunk に分ける境目**になります。

## 6. DEMO：この章が持つ小さなコンポーネントの出力を覗く

> **🧪 DEMO — @if / @switch / @for / @defer を持つコンポーネントの template 関数**
>
> 下の部品 `CfpDemo` のテンプレートは `@if (n() === 0) {…} @else if (n() === 1) {…} @else {…}`、`@switch (n())`、`@for (item of items(); track item.id)`、`@defer (on idle) {…} @placeholder (minimum 500ms) {…}` です。ボタンで、このサイトのビルドが生成した `CfpDemo.ɵcmp.template` と `consts` を学習用に覗きます。本番ビルドでは関数名や変数名が短縮されている（minify 済み）ことに注意してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-control-flow-phases)

表示された関数の中に、`ɵɵconditionalCreate` の連鎖、`ɵɵconditional(… ? 数 : … ? 数 : 数)`、`ɵɵrepeaterCreate(…, 関数)`、`ɵɵdefer(…)` と `ɵɵdeferOnIdle()` を探してください。consts には `[500]`（placeholder の minimum）が入っています。`CfpDemo` は `imports` を持たない standalone コンポーネントなので DomOnly モードでコンパイルされ、要素命令は `ɵɵdomElementStart` などの DOM 専用版になっています（[standalone シリーズの章](../standalone/04-standalone-used-only.md)）。

## ここまでの呼び出し

- 👤 `@if / @switch / @for / @defer` — あなたのテンプレート
  - `ingestIfBlock / ingestSwitchBlock` — ingest.ts L624 / L776 — *ConditionalCreateOp ×分岐数 + ConditionalOp(conditions)*
  - `ingestForBlock` — ingest.ts L1122 — *RepeaterCreateOp(track) + RepeaterOp*
  - `ingestDeferBlock` — ingest.ts L868 — *TemplateOp ×4 + DeferOp + DeferOnOp/DeferWhenOp*
- `transform(job, Tmpl)` — emit.ts L193
  - `generateConditionalExpressions` — phases/conditionals.ts L16 — *a ? 2 : b ? 3 : 5*
  - `configureDeferInstructions` — phases/defer\_configs.ts L17 — *\[2000, 500\] を consts へ*
  - `generateTrackVariables` — phases/track\_variables.ts L19 — *item → $item*
  - `resolveDeferTargetNames` — phases/defer\_resolve\_targets.ts L18 — *#button → (slot, steps)*
  - `optimizeTrackFns` — phases/track\_fn\_optimization.ts L22 — *$index / $item / メソッド / それ以外*
  - `resolveDeferDepsFns` — phases/resolve\_defer\_deps\_fns.ts L15 — *MyApp\_Defer\_4\_DepsFn*
  - `reify` — phases/reify.ts L53
    - `ng.conditional / ng.repeaterCreate / ng.defer` — instruction.ts
    - `reifyTrackBy` → `pool.getSharedFunctionReference(fn, '_forTrack')` — reify.ts L969 / constant\_pool.ts L167
- 👤 `ɵɵconditional(n)` / `ɵɵrepeaterCreate(..., _forTrack0)` / `ɵɵdefer(...)` — 実行時（core/src/render3/instructions）

## 聞かれそうな質問

**Q. @if の分岐は、なぜ出力で 2 や 3 のような番号になるのですか？**

その番号が「表示する子テンプレートのスロット番号」だからです。ingest.ts 663〜668 行目で各分岐の条件にスロット（`SlotHandle`）を組にしておき、conditionals.ts 63〜67 行目が `条件 ? スロット : 次の分岐` の三項演算子に畳みます。実行時の `ɵɵconditional` はその番号のコンテナにビューを作り、前回と違えば古いビューを外します。どれも当たらなければ 32 行目の `-1`（何も出さない）です。

**Q. track item.id は、どんな関数になりますか？**

`const _forTrack0 = ($index, $item) => $item.id;` です。track\_variables.ts 33 行目で `item` が `$item` になり、track\_fn\_optimization.ts の最適化（28〜54 行目）には当たらないので 75〜85 行目で `return` 文の列になり、reify.ts 1002〜1007 行目で `this` を使わないのでアロー関数、1010 行目で `_forTrack` の名前で定数プールに置かれます。`track $index` は関数を作らず `ɵɵrepeaterTrackByIndex`（30 行目）、`track item` は `ɵɵrepeaterTrackByIdentity`（33 行目）です。

**Q. track にコンポーネントのプロパティを書くと何が変わりますか？**

track 関数がアロー関数ではなく `function` になり、`this.prop` を読みます（track\_fn\_optimization.ts 64〜66 行目、reify.ts 1003 行目）。`ɵɵrepeaterCreate` の 8 番目に `true` が付き、実行時が control\_flow.ts 342〜346 行目でコンポーネントに `bind` します。同じ形の track は 1 ファイルの中で 1 つの関数を共有します（constant\_pool.ts 177 行目）。

**Q. @defer の依存は、どうやって別 chunk になるのですか？**

コンパイラは `import("./lazy")` を並べたアロー関数を作り、resolve\_defer\_deps\_fns.ts 30〜34 行目で `MyApp_Defer_4_DepsFn` として置き、`ɵɵdefer` の 3 番目の引数に渡します（reify.ts 393 行目）。動的 `import()` はバンドラが別 chunk を作る境目です。どの依存を遅延にできるか（eager な import が他に無いか）を決めて元の import 文を消すのは compiler-cli 側で、[standalone シリーズの @defer の章](../standalone/11-standalone-defer-deps.md)で読みました。

**Q. @defer にトリガーを書かないとどうなりますか？**

ingest.ts 965〜978 行目で `on idle` が補われ、出力に `ɵɵdeferOnIdle()` が入ります。`prefetch` や `hydrate` のトリガーだけを書いた場合も、966〜967 行目の判定は `NONE`（ふつうのトリガー）しか数えないので、同じく idle が足されます。

## 読み終えて

- ingest は分岐・ループ・遅延ブロックを「子ビュー + 作成 op + 更新 op」に分けるだけで、命令の形を決めるのは後のフェーズ。
- `generateConditionalExpressions` は条件のリストを逆向きに畳んで、スロット番号を返す 1 本の三項演算子にする。@switch は一時変数、`as` は 2 番目の引数で値を渡す。
- track 式は `$index` / `$item` を引数にした独立の関数になる。単純な形は実行時の関数に、`this` を使う形は `function` + `bind` になる。
- @defer は時間を consts に、要素トリガーを (スロット, 段数) に、依存を `_Defer_N_DepsFn` の動的 import に変える。
- フェーズの順番は「何がいつ決まるか」（変数名、スロット番号、関数名）の依存関係で決まっている。

---

← 前: [定数配列と pure function：consts・AttributeMarker・ɵɵpureFunction](14-compiler-consts-pure.md)  
次: [reify と出力：IR を ɵɵ 命令の呼び出しにして JS を書き出す](16-compiler-reify-emit.md) →
