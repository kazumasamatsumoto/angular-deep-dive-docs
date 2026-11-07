[目次](../README.md) › [テンプレートコンパイラの内側](README.md) › 第 12 回 / 全 18 回

# decls・vars・advance()：slot の割り当てとバインディングの数え方

> slot\_allocation.ts が create 命令に 0 から順に slot 番号を振り、その合計が decls になる行、var\_counting.ts が各 update 命令の消費する変数の数を数えて vars を決める行（interpolation の引数の数、pure function など）、generate\_advance.ts が update 命令の間に advance(n) を挟む行。実際の出力と数を突き合わせて確かめる。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-slots-vars)

---

コンパイル後のコンポーネントには `decls: 3, vars: 1` のような 2 つの数が付き、テンプレート関数の更新ブロックには `ɵɵadvance(2)` が挟まります。この章では、この 3 つを決めるフェーズ ―― `allocateSlots`（slot 番号と decls）、`countVariables`（vars と各式の offset）、`generateAdvance`（advance の差し込み）―― を 1 行ずつ読み、compliance fixture の出力と**手で数えた値**を突き合わせます。最後に、このサイト自身のビルドが付けた数をデモで読みます。

読む対象は `packages/compiler/src/template/pipeline/src/phases/` の `slot_allocation.ts`・`var_counting.ts`・`generate_advance.ts`・`local_refs.ts`・`pipe_creation.ts`、フェーズの順番を決める `pipeline/src/emit.ts`、ɵcmp に数を書く `render3/view/compiler.ts`、fixture（コンパイラの期待出力を固定したテストデータ。`.js` は部分一致で、`…` や `// ...` は省略の印）の `compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/` です。

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
12. **12. decls・vars・advance**（この章）
13. [13. 変数とコンテキスト](13-compiler-variables.md)
14. [14. 定数配列と pure function](14-compiler-consts-pure.md)
15. [15. 制御フローのフェーズ](15-compiler-control-flow-phases.md)
16. [16. reify と出力](16-compiler-reify-emit.md)
17. [17. 型検査（TCB）](17-compiler-typecheck.md)
18. [18. スタイルのカプセル化](18-compiler-shadow-css.md)

## 1. 先にゴールを見る：3 つの数が出てくる場所

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/lifecycle_hooks/local_reference.ts` L1–12 （▶ の行: 4）

```ts
 1 │ import {Component, NgModule} from '@angular/core';
 2 │ 
 3 │ @Component({
 4 ▶     selector: 'my-component', template: '<input #user>Hello {{user.value}}!',
 5 │     standalone: false
 6 │ })
 7 │ export class MyComponent {
 8 │ }
 9 │ 
10 │ @NgModule({declarations: [MyComponent]})
11 │ export class MyModule {
12 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/lifecycle_hooks/local_reference.js` L1–23 （▶ の行: 7–8, 12–13, 16–18）

```js
 1 │ export class MyComponent {
 2 │   // ...
 3 │   static ɵcmp = /*@__PURE__*/ $r3$.ɵɵdefineComponent({
 4 │     type: MyComponent,
 5 │     selectors: [["my-component"]],
 6 │     standalone: false,
 7 ▶     decls: 3,
 8 ▶     vars: 1,
 9 │     consts: [["user", ""]],
10 │     template:  function MyComponent_Template(rf, ctx) {
11 │       if (rf & 1) {
12 ▶         $r3$.ɵɵelement(0, "input", null, 0);
13 ▶         $r3$.ɵɵtext(2);
14 │       }
15 │       if (rf & 2) {
16 ▶         const $user$ = $r3$.ɵɵreference(1);
17 ▶         $r3$.ɵɵadvance(2);
18 ▶         $r3$.ɵɵtextInterpolate1("Hello ", $user$.value, "!");
19 │       }
20 │     },
21 │     encapsulation: 2
22 │   });
23 │ }
```

テンプレートは `<input #user>Hello {{user.value}}!` の 1 行です。出力には数が 5 つ出てきます。

- 7 行目 `decls: 3` … 要素とテキストは 2 つしか無いのに 3
- 8 行目 `vars: 1` … 補間の式が 1 つ
- 12・13 行目 `ɵɵelement(0, …)` と `ɵɵtext(2)` … slot 番号が 0 の次が 2 に飛ぶ
- 16 行目 `ɵɵreference(1)` … 飛ばされた 1 は `#user` の置き場所
- 17 行目 `ɵɵadvance(2)` … 更新ブロックで、18 行目の補間の前にカーソルを 2 へ動かす

slot（スロット）は、実行時にビューのデータを入れる配列 `LView` の 1 マスです。decls は「ノード・#ref・pipe などの宣言に使うマスの数」、vars は「バインディングの前回値などに使うマスの数」で、実行時はこの 2 つから LView の長さを決めます （`HEADER_OFFSET + decls` が binding の開始位置、そこに vars を足したものが初期の長さ。[blueprint の章](../ivy/07-ivy-blueprint.md)）。

コンパイラ側で ɵcmp に数を書くのは `compileComponentFromMetadata`（render3/view/compiler.ts）の最後で、全フェーズ後に `definitionMap.set('decls', o.literal(tpl.root.decls))` と `'vars'` の 2 行で**ルートビューの**値を数値リテラルにします （引用は[第 2 回](02-compiler-entry.md)）。値は以下のフェーズが `tpl.root` に書き込んでおいたものです。`<ng-template>` などの子ビューの decls / vars は ɵcmp ではなく、`ɵɵtemplate(slot, 関数, decls, vars, …)` の引数として出ます（3・4 節・[第 16 回](16-compiler-reify-emit.md)）。

## 2. 3 つのフェーズの位置

📄 `angular/packages/compiler/src/template/pipeline/src/emit.ts` L160–175 （▶ の行: 166, 173, 175）

```ts
160 │   {kind: Kind.Both, fn: optimizeStoreLet},
161 │   {kind: Kind.Tmpl, fn: convertI18nText},
162 │   {kind: Kind.Tmpl, fn: convertI18nBindings},
163 │   {kind: Kind.Tmpl, fn: removeUnusedI18nAttributesOps},
164 │   {kind: Kind.Tmpl, fn: assignI18nSlotDependencies},
165 │   {kind: Kind.Tmpl, fn: applyI18nExpressions},
166 ▶   {kind: Kind.Tmpl, fn: allocateSlots},
167 │   {kind: Kind.Tmpl, fn: resolveI18nElementPlaceholders},
168 │   {kind: Kind.Tmpl, fn: resolveI18nExpressionPlaceholders},
169 │   {kind: Kind.Tmpl, fn: extractI18nMessages},
170 │   {kind: Kind.Tmpl, fn: collectI18nConsts},
171 │   {kind: Kind.Tmpl, fn: resolveI18nAttrSanitizers},
172 │   {kind: Kind.Tmpl, fn: collectConstExpressions},
173 ▶   {kind: Kind.Both, fn: collectElementConsts},
174 │   {kind: Kind.Tmpl, fn: removeI18nContexts},
175 ▶   {kind: Kind.Both, fn: countVariables},
```

phases 配列（全 74 個。並びの全体は[全体図の章](01-compiler.md)）の中で、166 行目の `allocateSlots` が 54 番目、175 行目の `countVariables` が 63 番目、その直後の 64 番目が `generateAdvance` です。どれもかなり後ろにあります。slot を使う op がもう増えも減りもしない（pipe の op を足す `createPipes` は 21 番目、`#ref` を数える `liftLocalRefs` は 43 番目）段階まで待ってから数えるためです。173 行目の `collectElementConsts` は[第 14 回](14-compiler-consts-pure.md)で読みます。

## 3. decls：allocateSlots が 0 から順に番号を振る

まず、1 つの op が何マス使うかを決める前段です。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/local_refs.ts` L14–41 （▶ の行: 22, 25, 29, 31, 33, 35）

```ts
14 │ /**
15 │  * Lifts local reference declarations on element-like structures within each view into an entry in
16 │  * the `consts` array for the whole component.
17 │  */
18 │ export function liftLocalRefs(job: ComponentCompilationJob): void {
19 │   for (const unit of job.units) {
20 │     for (const op of unit.create) {
21 │       switch (op.kind) {
22 ▶         case ir.OpKind.ElementStart:
23 │         case ir.OpKind.ConditionalCreate:
24 │         case ir.OpKind.ConditionalBranchCreate:
25 ▶         case ir.OpKind.Template:
26 │           if (!Array.isArray(op.localRefs)) {
27 │             throw new Error(`AssertionError: expected localRefs to be an array still`);
28 │           }
29 ▶           op.numSlotsUsed += op.localRefs.length;
30 │ 
31 ▶           if (op.localRefs.length > 0) {
32 │             const localRefs = serializeLocalRefs(op.localRefs);
33 ▶             op.localRefs = job.addConst(localRefs);
34 │           } else {
35 ▶             op.localRefs = null;
36 │           }
37 │           break;
38 │       }
39 │     }
40 │   }
41 │ }
```

`liftLocalRefs` の 29 行目、`#ref` を持つ要素は `numSlotsUsed`（既定 1。[第 11 回](11-compiler-ir.md)の trait）に `#ref` の数を足します。`<input #user>` なら 1 + 1 = 2 マス。31〜33 行目で `#ref` の名前の配列を consts へ移し、op にはその番号を残します（fixture 9 行目の `consts: [["user", ""]]` がこれ）。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/pipe_creation.ts` L50–78 （▶ の行: 58–59, 63, 69–70, 73–74）

```ts
50 │ function addPipeToCreationBlock(
51 │   unit: CompilationUnit,
52 │   afterTargetXref: ir.XrefId,
53 │   binding: ir.PipeBindingExpr,
54 │ ): void {
55 │   // Find the appropriate point to insert the Pipe creation operation.
56 │   // We're looking for `afterTargetXref` (and also want to insert after any other pipe operations
57 │   // which might be beyond it).
58 ▶   for (let op = unit.create.head.next!; op.kind !== ir.OpKind.ListEnd; op = op.next!) {
59 ▶     if (!ir.hasConsumesSlotTrait<ir.CreateOp>(op)) {
60 │       continue;
61 │     }
62 │ 
63 ▶     if (op.xref !== afterTargetXref) {
64 │       continue;
65 │     }
66 │ 
67 │     // We've found a tentative insertion point; however, we also want to skip past any _other_ pipe
68 │     // operations present.
69 ▶     while (op.next!.kind === ir.OpKind.Pipe) {
70 ▶       op = op.next!;
71 │     }
72 │ 
73 ▶     const pipe = ir.createPipeOp(binding.target, binding.targetSlot, binding.name) as ir.CreateOp;
74 ▶     ir.OpList.insertBefore(pipe, op.next!);
75 │ 
76 │     // This completes adding the pipe to the creation block.
77 │     return;
78 │   }
```

pipe も slot を使います（pipe のインスタンスを LView に置くため）。`createPipes` は、更新側で `| myPipe` を見つけるたびに作成側へ `PipeOp` を足します。58〜65 行目で「その pipe を使う束縛の対象ノード」の op を探し、69・70 行目でその後ろに並んでいる pipe を飛ばし、74 行目でその次に差し込みます。だから pipe の slot は、使うノードの**直後**に並びます。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/slot_allocation.ts` L12–52 （▶ の行: 25, 28, 30, 32, 34, 39, 42, 46, 51）

```ts
12 │ /**
13 │  * Assign data slots for all operations which implement `ConsumesSlotOpTrait`, and propagate the
14 │  * assigned data slots of those operations to any expressions which reference them via
15 │  * `UsesSlotIndexTrait`.
16 │  *
17 │  * This phase is also responsible for counting the number of slots used for each view (its `decls`)
18 │  * and propagating that number into the `Template` operations which declare embedded views.
19 │  */
20 │ export function allocateSlots(job: ComponentCompilationJob): void {
21 │   // Map of all declarations in all views within the component which require an assigned slot index.
22 │   // This map needs to be global (across all views within the component) since it's possible to
23 │   // reference a slot from one view from an expression within another (e.g. local references work
24 │   // this way).
25 ▶   const slotMap = new Map<ir.XrefId, number>();
26 │ 
27 │   // Process all views in the component and assign slot indexes.
28 ▶   for (const unit of job.units) {
29 │     // Slot indices start at 0 for each view (and are not unique between views).
30 ▶     let slotCount = 0;
31 │ 
32 ▶     for (const op of unit.create) {
33 │       // Only consider declarations which consume data slots.
34 ▶       if (!ir.hasConsumesSlotTrait(op)) {
35 │         continue;
36 │       }
37 │ 
38 │       // Assign slots to this declaration starting at the current `slotCount`.
39 ▶       op.handle.slot = slotCount;
40 │ 
41 │       // And track its assigned slot in the `slotMap`.
42 ▶       slotMap.set(op.xref, op.handle.slot);
43 │ 
44 │       // Each declaration may use more than 1 slot, so increment `slotCount` to reserve the number
45 │       // of slots required.
46 ▶       slotCount += op.numSlotsUsed;
47 │     }
48 │ 
49 │     // Record the total number of slots used on the view itself. This will later be propagated into
50 │     // `ir.TemplateOp`s which declare those views (except for the root view).
51 ▶     unit.decls = slotCount;
52 │   }
```

1. **28・30 行目：ビューごとに 0 から数える**

   29 行目のコメントのとおり、slot 番号はビューの中でだけ一意です。子ビューは自分の LView を持つので、また 0 から始まります。
2. **32・34 行目：作成側の op を前から順に、slot を使う op だけ**

   `hasConsumesSlotTrait` で拾うのは、要素の開始・テキスト・テンプレート・pipe・`@let` などです。`ElementEnd` やリスナーは印を持たないので数えません。
3. **39 行目：今のカウンタを handle に書く**

   `op.handle.slot = slotCount`。この `handle` は、その slot を参照する式（`ReferenceExpr` など）と共有されたオブジェクトなので、書いた瞬間にそちらからも見えます（[第 11 回](11-compiler-ir.md) 5 節）。42 行目の `slotMap` は XrefId → slot 番号の表で、後半の処理に使います。
4. **46 行目：使うマスの数だけ進める**

   `slotCount += op.numSlotsUsed`。`#user` 付きの input なら 2 進みます。
5. **51 行目：最後のカウンタがそのビューの decls**

   ルートビューの値が、1 節のとおり ɵcmp の `decls` になります。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/slot_allocation.ts` L54–77 （▶ の行: 61–62, 65, 69–70）

```ts
54 │   // After slot assignment, `slotMap` now contains slot assignments for every declaration in the
55 │   // whole template, across all views. Next, look for expressions which implement
56 │   // `UsesSlotIndexExprTrait` and propagate the assigned slot indexes into them.
57 │   // Additionally, this second scan allows us to find `ir.TemplateOp`s which declare views and
58 │   // propagate the number of slots used for each view into the operation which declares it.
59 │   for (const unit of job.units) {
60 │     for (const op of unit.ops()) {
61 ▶       if (
62 ▶         op.kind === ir.OpKind.Template ||
63 │         op.kind === ir.OpKind.ConditionalCreate ||
64 │         op.kind === ir.OpKind.ConditionalBranchCreate ||
65 ▶         op.kind === ir.OpKind.RepeaterCreate
66 │       ) {
67 │         // Record the number of slots used by the view this `ir.TemplateOp` declares in the
68 │         // operation itself, so it can be emitted later.
69 ▶         const childView = job.views.get(op.xref)!;
70 ▶         op.decls = childView.decls;
71 │ 
72 │         // TODO: currently we handle the decls for the RepeaterCreate empty template in the reify
73 │         // phase. We should handle that here instead.
74 │       }
75 │     }
76 │   }
77 │ }
```

2 周目です。61〜65 行目、子ビューを宣言する op（`<ng-template>`・`@if` の分岐・`@for`）を見つけたら、69・70 行目でその子ビューの decls を op に写します。これが `ɵɵtemplate(…, decls, vars, …)` の decls になります。

### 手で数える：local\_reference

| 作成側の op（順番どおり） | ConsumesSlot？ | numSlotsUsed | handle.slot | slotCount（後） |
| --- | --- | --- | --- | --- |
| `ElementStart input`（#user 付き） | はい | 1 + 1 = 2（local\_refs.ts 29 行目） | 0 | 2 |
| `ElementEnd` | いいえ | — | — | 2 |
| `Text`（Hello … !） | はい | 1 | 2 | 3 |

decls = 3、テキストの slot = 2。fixture の 7・13 行目と一致します。`#user` は input の slot 0 の次、1 番に入るので、16 行目は `ɵɵreference(1)` です （`ReferenceExpr` の reify は `slot + 1 + offset`。[第 11 回](11-compiler-ir.md) 9 節）。12 行目が `ɵɵelement` なのは、空の `ElementStart` / `ElementEnd` の組を後のフェーズが 1 つにまとめたからで、slot の数には影響しません。

## 4. vars：countVariables が「変数 slot」を数える

📄 `angular/packages/compiler/src/template/pipeline/src/phases/var_counting.ts` L13–28 （▶ の行: 17, 19–20, 23–25）

```ts
13 │ /**
14 │  * Counts the number of variable slots used within each view, and stores that on the view itself, as
15 │  * well as propagates it to the `ir.TemplateOp` for embedded views.
16 │  */
17 ▶ export function countVariables(job: CompilationJob): void {
18 │   // First, count the vars used in each view, and update the view-level counter.
19 ▶   for (const unit of job.units) {
20 ▶     let varCount = 0;
21 │ 
22 │     // Count variables on top-level ops first. Don't explore nested expressions just yet.
23 ▶     for (const op of unit.ops()) {
24 ▶       if (ir.hasConsumesVarsTrait(op)) {
25 ▶         varCount += varsUsedByOp(op);
26 │       }
27 │     }
28 │ 
```

数え方は 2 段です。まず 23〜27 行目で、**op** 自体が `ConsumesVarsTrait` を持つもの（property・属性・補間テキストなど）を数えます。1 つの op が何マス使うかは `varsUsedByOp` が決めます。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/var_counting.ts` L115–146 （▶ の行: 122, 125–127, 130, 132, 136–137, 143, 146）

```ts
115 │ /**
116 │  * Different operations that implement `ir.UsesVarsTrait` use different numbers of variables, so
117 │  * count the variables used by any particular `op`.
118 │  */
119 │ function varsUsedByOp(op: (ir.CreateOp | ir.UpdateOp) & ir.ConsumesVarsTrait): number {
120 │   let slots: number;
121 │   switch (op.kind) {
122 ▶     case ir.OpKind.Attribute:
123 │       // All of these bindings use 1 variable slot, plus 1 slot for every interpolated expression,
124 │       // if any.
125 ▶       slots = 1;
126 ▶       if (op.expression instanceof ir.Interpolation && !isSingletonInterpolation(op.expression)) {
127 ▶         slots += op.expression.expressions.length;
128 │       }
129 │       return slots;
130 ▶     case ir.OpKind.Property:
131 │     case ir.OpKind.DomProperty:
132 ▶       slots = 1;
133 │ 
134 │       // We need to assign a slot even for singleton interpolations, because the
135 │       // runtime needs to store both the raw value and the stringified one.
136 ▶       if (op.expression instanceof ir.Interpolation) {
137 ▶         slots += op.expression.expressions.length;
138 │       }
139 │       return slots;
140 │     case ir.OpKind.Control:
141 │       // 1 for the [field] binding itself.
142 │       // 1 for the control bindings object containing bound field states properties.
143 ▶       return 2;
144 │     case ir.OpKind.TwoWayProperty:
145 │       // Two-way properties can only have expressions so they only need one variable slot.
146 ▶       return 1;
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/var_counting.ts` L147–176 （▶ の行: 147, 153–155, 158, 160, 162, 166, 168–169, 172）

```ts
147 ▶     case ir.OpKind.StyleProp:
148 │     case ir.OpKind.ClassProp:
149 │     case ir.OpKind.StyleMap:
150 │     case ir.OpKind.ClassMap:
151 │       // Style & class bindings use 2 variable slots, plus 1 slot for every interpolated expression,
152 │       // if any.
153 ▶       slots = 2;
154 ▶       if (op.expression instanceof ir.Interpolation) {
155 ▶         slots += op.expression.expressions.length;
156 │       }
157 │       return slots;
158 ▶     case ir.OpKind.InterpolateText:
159 │       // `ir.InterpolateTextOp`s use a variable slot for each dynamic expression.
160 ▶       return op.interpolation.expressions.length;
161 │     case ir.OpKind.I18nExpression:
162 ▶     case ir.OpKind.Conditional:
163 │     case ir.OpKind.Boundary:
164 │     case ir.OpKind.DeferWhen:
165 │     case ir.OpKind.StoreLet:
166 ▶       return 1;
167 │     case ir.OpKind.RepeaterCreate:
168 ▶       // Repeaters may require an extra variable binding slot, if they have an empty view, for the
169 ▶       // empty block tracking.
170 │       // TODO: It's a bit odd to have a create mode instruction consume variable slots. Maybe we can
171 │       // find a way to use the Repeater update op instead.
172 ▶       return op.emptyView ? 1 : 0;
173 │     default:
174 │       throw new Error(`Unhandled op: ${ir.OpKind[op.kind]}`);
175 │   }
176 │ }
```

| op | 使う変数 slot | 行 | 理由（実行時に何を覚えるか） |
| --- | --- | --- | --- |
| `Property` / `DomProperty` | 1（補間なら + 式の数） | 130〜139 | 前回の値。補間は 134・135 行目のコメントのとおり、1 式でも生の値と文字列の両方を持つ |
| `Attribute` | 1（補間なら + 式の数。ただし前後に文字の無い 1 式だけの補間は除く） | 122〜129 | 前回の値 |
| `StyleProp` / `ClassProp` / `StyleMap` / `ClassMap` | 2（補間なら + 式の数） | 147〜157 | スタイルの束縛は 2 マス使う（153 行目） |
| `InterpolateText` | 式の数 | 158〜160 | 式ごとの前回値 |
| `Conditional` ほか | 1 | 162〜166 | 前回の値 |
| `RepeaterCreate` | `@empty` があれば 1 | 167〜172 | 168・169 行目のコメントのとおり、@empty ブロックの追跡用 |

これらは実行時の更新命令が LView に前回値などを置くマスの数で、コンパイラと実行時で一致していなければなりません。たとえば `ɵɵproperty` は 1 マスを使い、`bindingUpdated`（前回値と比べて変わったかを見る関数）でそのマスと比べます（[更新命令の章](../ivy/10-ivy-update-instructions.md)）。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/var_counting.ts` L29–68 （▶ の行: 29–31, 37–41, 45–46, 49–50, 56, 61–62, 65–66）

```ts
29 ▶     // Count variables on expressions inside ops. We do this later because some of these expressions
30 ▶     // might be conditional (e.g. `pipeBinding` inside of a ternary), and we don't want to interfere
31 ▶     // with indices for top-level binding slots (e.g. `property`).
32 │     const firstPassCountExpressionVars = (expr: o.Expression) => {
33 │       if (!ir.isIrExpression(expr)) {
34 │         return;
35 │       }
36 │ 
37 ▶       // TemplateDefinitionBuilder assigns variable offsets for everything but pure functions
38 ▶       // first, and then assigns offsets to pure functions lazily. We emulate that behavior by
39 ▶       // assigning offsets in two passes instead of one, only in compatibility mode.
40 ▶       if (expr instanceof ir.PureFunctionExpr) {
41 ▶         return;
42 │       }
43 │ 
44 │       // Some expressions require knowledge of the number of variable slots consumed.
45 ▶       if (ir.hasUsesVarOffsetTrait(expr)) {
46 ▶         expr.varOffset = varCount;
47 │       }
48 │ 
49 ▶       if (ir.hasConsumesVarsTrait(expr)) {
50 ▶         varCount += varsUsedByIrExpression(expr);
51 │       }
52 │     };
53 │ 
54 │     // Compatibility mode pass for pure function offsets (as explained above).
55 │     const secondPassCountExpressionVars = (expr: o.Expression) => {
56 ▶       if (!ir.isIrExpression(expr) || !(expr instanceof ir.PureFunctionExpr)) {
57 │         return;
58 │       }
59 │ 
60 │       // Some expressions require knowledge of the number of variable slots consumed.
61 ▶       if (ir.hasUsesVarOffsetTrait(expr)) {
62 ▶         expr.varOffset = varCount;
63 │       }
64 │ 
65 ▶       if (ir.hasConsumesVarsTrait(expr)) {
66 ▶         varCount += varsUsedByIrExpression(expr);
67 │       }
68 │     };
```

次に、op の**中の式**で変数 slot を使うもの（pipe と pure function）を数えます。29〜31 行目のコメントのとおり、式は条件付きで評価されることがある（`a ? (b | pipe) : c`）ので、op の分を先に全部数えてから後ろに並べます。45・46 行目、式には自分の開始位置 `varOffset` を書き込み、49・50 行目で使う数だけ進めます。さらに 37〜42 行目、**pure function だけは 1 周目で飛ばし**、55〜68 行目の 2 周目で最後にまとめて並べます。コメントにあるとおり、古いコンパイラ（TemplateDefinitionBuilder）と同じ番号を出すための互換の並べ方です。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/var_counting.ts` L178–204 （▶ の行: 180–185, 196–197, 200）

```ts
178 │ function varsUsedByIrExpression(expr: ir.Expression & ir.ConsumesVarsTrait): number {
179 │   switch (expr.kind) {
180 ▶     case ir.ExpressionKind.PureFunctionExpr:
181 ▶       return 1 + expr.args.length;
182 ▶     case ir.ExpressionKind.PipeBinding:
183 ▶       return 1 + expr.args.length;
184 ▶     case ir.ExpressionKind.PipeBindingVariadic:
185 ▶       return 1 + expr.numArgs;
186 │     case ir.ExpressionKind.StoreLet:
187 │     case ir.ExpressionKind.ArrowFunction:
188 │       return 1;
189 │     default:
190 │       throw new Error(
191 │         `AssertionError: unhandled ConsumesVarsTrait expression ${expr.constructor.name}`,
192 │       );
193 │   }
194 │ }
195 │ 
196 ▶ function isSingletonInterpolation(expr: ir.Interpolation): boolean {
197 ▶   if (expr.expressions.length !== 1 || expr.strings.length !== 2) {
198 │     return false;
199 │   }
200 ▶   if (expr.strings[0] !== '' || expr.strings[1] !== '') {
201 │     return false;
202 │   }
203 │   return true;
204 │ }
```

式の分は 181・183 行目、pure function と pipe が「1 + 引数の数」。引数ごとの前回値に加えて、結果（pure function なら作った配列、pipe ならインスタンスの戻り値）を 1 マスに覚えます。185 行目、可変長の pipe は `numArgs`（元の引数の数）を使います。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/var_counting.ts` L70–112 （▶ の行: 74–75, 77–78, 88, 96–97, 105–106）

```ts
 70 │     // Note: we iterate over `create` and `update` separately, instead of going using `unit.ops()`,
 71 │     // because `unit.ops()` will visit nested ops too (e.g. the `ListenerOp.handlerOps`). We
 72 │     // don't want that, because the `visitExpressionsInOp` call below will visit the same nested
 73 │     // ops again, leading to vars in some expressions to be counted twice.
 74 ▶     for (const createOp of unit.create) {
 75 ▶       ir.visitExpressionsInOp(createOp, firstPassCountExpressionVars);
 76 │     }
 77 ▶     for (const updateOp of unit.update) {
 78 ▶       ir.visitExpressionsInOp(updateOp, firstPassCountExpressionVars);
 79 │     }
 80 │ 
 81 │     for (const createOp of unit.create) {
 82 │       ir.visitExpressionsInOp(createOp, secondPassCountExpressionVars);
 83 │     }
 84 │     for (const updateOp of unit.update) {
 85 │       ir.visitExpressionsInOp(updateOp, secondPassCountExpressionVars);
 86 │     }
 87 │ 
 88 ▶     unit.vars = varCount;
 89 │   }
 90 │ 
 91 │   if (job instanceof ComponentCompilationJob) {
 92 │     // Add var counts for each view to the `ir.TemplateOp` which declares that view (if the view is
 93 │     // an embedded view).
 94 │     for (const unit of job.units) {
 95 │       for (const op of unit.create) {
 96 ▶         if (
 97 ▶           op.kind !== ir.OpKind.Template &&
 98 │           op.kind !== ir.OpKind.RepeaterCreate &&
 99 │           op.kind !== ir.OpKind.ConditionalCreate &&
100 │           op.kind !== ir.OpKind.ConditionalBranchCreate
101 │         ) {
102 │           continue;
103 │         }
104 │ 
105 ▶         const childView = job.views.get(op.xref)!;
106 ▶         op.vars = childView.vars;
107 │ 
108 │         // TODO: currently we handle the vars for the RepeaterCreate empty template in the reify
109 │         // phase. We should handle that here instead.
110 │       }
111 │     }
112 │   }
```

74〜86 行目、式は `visitExpressionsInOp` で歩きます。この関数は木を**子から先に**訪ねる（[第 11 回](11-compiler-ir.md) 7 節）ので、`(a | p1) | p2` なら内側の `p1` が先に番号を取ります。88 行目の合計がそのビューの vars で、96〜106 行目で子ビューの vars を宣言側の op に写します。

### 手で数える：pipe と pure function の入った例

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/pipes/pipes.ts` L25–33 （▶ の行: 27）

```ts
25 │ @Component({
26 │     selector: 'my-app',
27 ▶     template: '{{name | myPipe:size | myPurePipe:size }}<p>{{ name | myPipe:1:2:3:4:5 }} {{ name ? 1 : 2 | myPipe }}</p>',
28 │     standalone: false
29 │ })
30 │ export class MyApp {
31 │   name = 'World';
32 │   size = 0;
33 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/pipes/pipes_my_app_def.js` L1–31 （▶ の行: 1, 9–10, 13–19, 23–25）

```js
 1 ▶ const $c0$ = $a0$ => [$a0$, 1, 2, 3, 4, 5];
 2 │ // ...
 3 │ export class MyApp {
 4 │   // ...
 5 │   static ɵcmp = /*@__PURE__*/ $r3$.ɵɵdefineComponent({
 6 │     type: MyApp,
 7 │     selectors: [["my-app"]],
 8 │     standalone: false,
 9 ▶     decls: 7,
10 ▶     vars: 20,
11 │     template:  function MyApp_Template(rf, ctx) {
12 │       if (rf & 1) {
13 ▶         $r3$.ɵɵtext(0);
14 ▶       $r3$.ɵɵpipe(1, "myPipe");
15 ▶         $r3$.ɵɵpipe(2, "myPurePipe");
16 ▶         $r3$.ɵɵelementStart(3, "p");
17 ▶         $r3$.ɵɵtext(4);
18 ▶         $r3$.ɵɵpipe(5, "myPipe");
19 ▶         $r3$.ɵɵpipe(6, "myPipe");
20 │         $r3$.ɵɵelementEnd();
21 │       }
22 │       if (rf & 2) {
23 ▶         $r3$.ɵɵtextInterpolate($r3$.ɵɵpipeBind2(2, 6, $r3$.ɵɵpipeBind2(1, 3, ctx.name, ctx.size), ctx.size));
24 ▶         $r3$.ɵɵadvance(4);
25 ▶         $r3$.ɵɵtextInterpolate2("", $r3$.ɵɵpipeBindV(5, 9, $r3$.ɵɵpureFunction1(18, $c0$, ctx.name)), " ", ctx.name ? 1 : $r3$.ɵɵpipeBind1(6, 16, 2));
26 │       }
27 │     },
28 │     dependencies: [MyPipe, MyPurePipe],
29 │     encapsulation: 2
30 │   });
31 │ }
```

27 行目のテンプレートは、テキスト 1（pipe 2 段）、`<p>` の中のテキスト 2（引数 6 個の pipe と、三項演算子の片側の pipe）です。引数 6 個の pipe は、`createVariadicPipes` が可変長版に変えます。`createVariadicPipes`（全文は[第 11 回](11-compiler-ir.md) 8 節）は、引数が 4 個を超えたら `PipeBindingVariadicExpr` にし、引数を 1 つの配列リテラルにまとめ、元の数 6 を `numArgs` に残します。この配列リテラル `[name, 1, 2, 3, 4, 5]` は、後のフェーズで `name` だけを引数に取る pure function（fixture 1 行目の `$c0$`）になります（[第 14 回](14-compiler-consts-pure.md)）。

1. **decls：7**

   テキスト 0、その直後に pipe 2 つ（1・2。内側の `myPipe` が先）、`<p>` 3、その中のテキスト 4、その直後に pipe 2 つ（5・6）。pipe\_creation.ts 74 行目の「対象ノードの直後」のとおりで、fixture 13〜19 行目と一致します。
2. **op の分：3**

   補間テキスト 1 は式 1 つで 1、補間テキスト 2 は式 2 つで 2（var\_counting.ts 160 行目）。varCount = 3。
3. **式の分 1 周目：3 → 18**

   テキスト 1 の内側 `myPipe:size`：offset 3、1 + 2 = 3 マス → 6。外側 `myPurePipe:size`：offset 6、3 マス → 9。テキスト 2 の可変長 `myPipe`：子の pure function は飛ばし（40〜42 行目）、offset 9、1 + 6 = 7 マス → 16。三項の `2 | myPipe`：offset 16、1 + 1 = 2 マス → 18。
4. **式の分 2 周目：18 → 20**

   pure function `[name, 1, 2, 3, 4, 5]`：offset 18、1 + 1 = 2 マス → 20。

結果は fixture 10 行目の `vars: 20`、23 行目の `ɵɵpipeBind2(2, 6, ɵɵpipeBind2(1, 3, …))`、25 行目の `ɵɵpipeBindV(5, 9, ɵɵpureFunction1(18, …))` と `ɵɵpipeBind1(6, 16, 2)` にそのまま現れます。各命令の 1 つ目の数が pipe の slot（decls 側）、2 つ目が varOffset（vars 側）です。

## 5. advance：generateAdvance がカーソルの移動を差し込む

更新ブロックの命令（`ɵɵproperty` など）は対象の slot 番号を引数に持ちません。実行時の「選択中の slot」（カーソル）を見て動きます （[template 関数の章](../ivy/03-ivy-template-function.md)）。そのカーソルを動かすのが `ɵɵadvance(n)` です。

📄 `angular/packages/compiler/src/template/pipeline/ir/src/ops/update.ts` L86–103 （▶ の行: 96, 99–100）

```ts
 86 │ /**
 87 │  * Create an `InterpolationTextOp`.
 88 │  */
 89 │ export function createInterpolateTextOp(
 90 │   xref: XrefId,
 91 │   interpolation: Interpolation,
 92 │   sourceSpan: ParseSourceSpan,
 93 │ ): InterpolateTextOp {
 94 │   return {
 95 │     kind: OpKind.InterpolateText,
 96 ▶     target: xref,
 97 │     interpolation,
 98 │     sourceSpan,
 99 ▶     ...TRAIT_DEPENDS_ON_SLOT_CONTEXT,
100 ▶     ...TRAIT_CONSUMES_VARS,
101 │     ...NEW_OP,
102 │   };
103 │ }
```

補間テキストの op は 96 行目でテキストノードの XrefId を `target` に持ち、99 行目の `TRAIT_DEPENDS_ON_SLOT_CONTEXT` で「実行前にカーソルを target に合わせる必要がある」と印を付けています。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/generate_advance.ts` L12–30 （▶ の行: 19, 21, 23, 29）

```ts
12 │ /**
13 │  * Generate `ir.AdvanceOp`s in between `ir.UpdateOp`s that ensure the runtime's implicit slot
14 │  * context will be advanced correctly.
15 │  */
16 │ export function generateAdvance(job: CompilationJob): void {
17 │   for (const unit of job.units) {
18 │     // First build a map of all of the declarations in the view that have assigned slots.
19 ▶     const slotMap = new Map<ir.XrefId, number>();
20 │     for (const op of unit.create) {
21 ▶       if (!ir.hasConsumesSlotTrait(op)) {
22 │         continue;
23 ▶       } else if (op.handle.slot === null) {
24 │         throw new Error(
25 │           `AssertionError: expected slots to have been allocated before generating advance() calls`,
26 │         );
27 │       }
28 │ 
29 ▶       slotMap.set(op.xref, op.handle.slot);
30 │     }
```

19〜30 行目、まずビューの作成側から XrefId → slot 番号の表を作り直します。23 行目、ここで slot が `null` の op があれば、フェーズの順番が壊れているので例外です。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/generate_advance.ts` L32–76 （▶ の行: 37–38, 41–42, 44–46, 51–52, 61, 64, 66–68, 71–72）

```ts
32 │     // Next, step through the update operations and generate `ir.AdvanceOp`s as required to ensure
33 │     // the runtime's implicit slot counter will be set to the correct slot before executing each
34 │     // update operation which depends on it.
35 │     //
36 │     // To do that, we track what the runtime's slot counter will be through the update operations.
37 ▶     let slotContext = 0;
38 ▶     for (const op of unit.update) {
39 │       let consumer: ir.DependsOnSlotContextOpTrait | null = null;
40 │ 
41 ▶       if (ir.hasDependsOnSlotContextTrait(op)) {
42 ▶         consumer = op;
43 │       } else {
44 ▶         ir.visitExpressionsInOp(op, (expr) => {
45 ▶           if (consumer === null && ir.hasDependsOnSlotContextTrait(expr)) {
46 ▶             consumer = expr;
47 │           }
48 │         });
49 │       }
50 │ 
51 ▶       if (consumer === null) {
52 ▶         continue;
53 │       }
54 │ 
55 │       if (!slotMap.has(consumer.target)) {
56 │         // We expect ops that _do_ depend on the slot counter to point at declarations that exist in
57 │         // the `slotMap`.
58 │         throw new Error(`AssertionError: reference to unknown slot for target ${consumer.target}`);
59 │       }
60 │ 
61 ▶       const slot = slotMap.get(consumer.target)!;
62 │ 
63 │       // Does the slot counter need to be adjusted?
64 ▶       if (slotContext !== slot) {
65 │         // If so, generate an `ir.AdvanceOp` to advance the counter.
66 ▶         const delta = slot - slotContext;
67 ▶         if (delta < 0) {
68 ▶           throw new Error(`AssertionError: slot counter should never need to move backwards`);
69 │         }
70 │ 
71 ▶         ir.OpList.insertBefore<ir.UpdateOp>(ir.createAdvanceOp(delta, consumer.sourceSpan), op);
72 ▶         slotContext = slot;
73 │       }
74 │     }
75 │   }
76 │ }
```

1. **37 行目：カーソルは 0 から始まる**

   実行時、更新ブロックに入る前のカーソルは slot 0 にあります。コンパイラはそれを `slotContext` という変数で**まねて**追いかけます。
2. **41〜49 行目：この op はカーソルに依存するか**

   op 自体が印を持てばそれ、持たなければ 44〜48 行目で op の中の式から印を持つものを探します。どちらも無ければ 51・52 行目で次へ（advance 不要）。
3. **61・64 行目：必要な slot と今のカーソルを比べる**

   同じなら何もしません。同じ要素への束縛が続くとき、2 つ目以降に advance が付かないのはこのためです。
4. **66〜68 行目：差を取る。戻ることはない**

   差が負になったら例外です。更新側の op が、対象の slot の小さい順に並んでいることを前提にしています。
5. **71・72 行目：op の手前に AdvanceOp を差し込み、カーソルを進める**

   `OpList.insertBefore`（[第 11 回](11-compiler-ir.md) 3 節）で op の直前に入れます。

📄 `angular/packages/compiler/src/template/pipeline/src/instruction.ts` L266–276 （▶ の行: 266–267, 270–271）

```ts
266 ▶ export function advance(delta: number, sourceSpan: ParseSourceSpan): ir.UpdateOp {
267 ▶   return call(Identifiers.advance, delta > 1 ? [o.literal(delta)] : [], sourceSpan);
268 │ }
269 │ 
270 ▶ export function reference(slot: number): o.Expression {
271 ▶   return o.importExpr(Identifiers.reference).callFn([o.literal(slot)]);
272 │ }
273 │ 
274 │ export function nextContext(steps: number): o.Expression {
275 │   return o.importExpr(Identifiers.nextContext).callFn(steps === 1 ? [] : [o.literal(steps)]);
276 │ }
```

reify で使う命令の組み立て関数です。267 行目、差が 1 なら引数なしの `ɵɵadvance()`、2 以上なら `ɵɵadvance(n)` になります。270・271 行目の `reference` も同じファイルで、3 節の `ɵɵreference(1)` はここで作られます。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/lifecycle_hooks/lifecycle_hooks.ts` L42–53 （▶ の行: 45–46）

```ts
42 │ @Component({
43 │     selector: 'simple-layout',
44 │     template: `
45 ▶     <lifecycle-comp [name]="name1"></lifecycle-comp>
46 ▶     <lifecycle-comp [name]="name2"></lifecycle-comp>
47 │   `,
48 │     standalone: false
49 │ })
50 │ export class SimpleLayout {
51 │   name1 = '1';
52 │   name2 = '2';
53 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/lifecycle_hooks/lifecycle_hooks_simple_layout_def.js` L1–23 （▶ の行: 7–8, 12, 15–17）

```js
 1 │ export class SimpleLayout {
 2 │   // ...
 3 │   static ɵcmp = /*@__PURE__*/ $r3$.ɵɵdefineComponent({
 4 │     type: SimpleLayout,
 5 │     selectors: [["simple-layout"]],
 6 │     standalone: false,
 7 ▶     decls: 2,
 8 ▶     vars: 2,
 9 │     consts: [[__AttributeMarker.Bindings__, "name"]],
10 │     template:  function SimpleLayout_Template(rf, ctx) {
11 │       if (rf & 1) {
12 ▶         $r3$.ɵɵelement(0, "lifecycle-comp", 0)(1, "lifecycle-comp", 0);
13 │       }
14 │       if (rf & 2) {
15 ▶         $r3$.ɵɵproperty("name", ctx.name1);
16 ▶         $r3$.ɵɵadvance();
17 ▶         $r3$.ɵɵproperty("name", ctx.name2);
18 │       }
19 │     },
20 │     dependencies: [LifecycleComp],
21 │     encapsulation: 2
22 │   });
23 │ }
```

要素 2 つにそれぞれ `[name]`。1 つ目の束縛は slot 0 で、カーソルも 0 なので 15 行目の前に advance はありません。2 つ目は slot 1、差が 1 なので 16 行目は引数なしの `ɵɵadvance()`。decls は要素 2 つで 2、vars は property 2 つで 2（7・8 行目）。1 節の local\_reference では、補間の対象がテキスト slot 2、カーソル 0 なので `ɵɵadvance(2)` でした。

> **🧪 DEMO — このサイトのビルドが付けた decls / vars を読む**
>
> この章のファイル（compiler-slots-vars.ts）に、画面には出さない小さなコンポーネントを 3 つ置いてあります。ボタンを押すと、それぞれの `ɵcmp.decls` / `ɵcmp.vars`（コンパイラが付けた static フィールド。公開 API ではないので学習用に覗くだけ）を読みます。「手で数えた値」は上の規則で数えたものです。数はビルドの最適化（minify）の影響を受けないので、本番ビルドでも同じ値が出ます。
>
> SvMixedSample の内訳：decls は `p`・テキスト・`span`・テキストで 4。vars は `[title]` 1、2 式の補間 2、1 式の補間 1（ここまで op の分で 4）、配列リテラル `[a(), b()]` の pure function が 1 + 2 = 3 で、合計 7。pure function の offset は 4 です。SvStyleSample は 1 要素に `[class.error]` 2 と `[style.background-color]` 2 で vars 4（var\_counting.ts 153 行目）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-slots-vars)

## ここまでの流れ

- 👤 `<input #user>Hello {{user.value}}!` — あなたのテンプレート
  - `createPipes`（21 番目） — pipe\_creation.ts L74 — *pipe の op を対象ノードの直後へ*
  - `liftLocalRefs`（43 番目） — local\_refs.ts L29 — *numSlotsUsed += #ref の数*
  - `allocateSlots`（54 番目） — slot\_allocation.ts L39 / L51 — *handle.slot と unit.decls*
  - `countVariables`（63 番目） — var\_counting.ts L25 / L46 / L88 — *op の分 → 式の分 → pure function、unit.vars*
  - `generateAdvance`（64 番目） — generate\_advance.ts L71 — *差があるときだけ AdvanceOp*
  - `reify` — instruction.ts L267 — *ɵɵadvance() / ɵɵadvance(n)*
  - `definitionMap.set('decls' / 'vars', …)` — render3/view/compiler.ts — *第 2 回*
- 👤 `ɵɵdefineComponent({ decls: 3, vars: 1, … })` — 実行時：LView の長さになる

## 聞かれそうな質問

**Q. decls はなぜ要素の数と一致しないのですか？**

decls は「要素の数」ではなく「作成側で slot を使う op が使うマスの合計」だからです（slot\_allocation.ts 46・51 行目）。テキストノード（静的な文字列も）・`<ng-template>`・pipe が 1 マスずつ使い、`#ref` は 1 つにつき 1 マス足されます（local\_refs.ts 29 行目）。逆に閉じタグ（`ElementEnd`）やリスナーは使いません。local\_reference では要素 1・テキスト 1 で decls 3 でした。

**Q. advance を挟まないのはどんなときですか？**

必要な slot が今のカーソルと同じとき（generate\_advance.ts 64 行目）です。具体的には、(1) 最初の束縛の対象が slot 0 のとき（カーソルは 0 から始まる。37 行目）、(2) 同じ要素への束縛が続くとき、(3) カーソルに依存しない op（変数の宣言だけの op など。51 行目）のときです。また差がちょうど 1 なら、advance は入りますが引数なしの `ɵɵadvance()` になります（instruction.ts 267 行目）。

**Q. vars が多いと何が困りますか？**

そのビューの LView が、インスタンス 1 つにつき vars マス長くなります。実行時は decls と vars から LView の初期の長さを決め（[blueprint の章](../ivy/07-ivy-blueprint.md)）、ビューを作るたびにその長さの配列を用意するので、`@for` の 1 行のような何度も作られる子ビューでは、行数ぶん掛け算で効きます。たとえば `[style.x]` は 1 つで 2 マス（var\_counting.ts 153 行目）、引数 3 個の pure function は 4 マス（181 行目）です。ただし、各マスは「前回の値と比べて変わっていなければ DOM に触らない」ためのもので、変更検知を速くするための投資でもあります。

**Q. ɵɵpipeBind2(2, 6, …) の 2 と 6 は何ですか？**

2 は pipe のインスタンスを置いた slot 番号（decls 側。allocateSlots が handle に書いた値）、6 は前回の引数と結果を置く変数 slot の開始位置（vars 側。var\_counting.ts 46 行目の `varOffset`）です。pipes\_my\_app\_def.js では、内側の pipe が先に番号を取る（子から先に訪ねる）ので、内側が `(1, 3)`、外側が `(2, 6)` になっています。

## 読み終えて

- decls は作成側で ConsumesSlot の印を持つ op の `numSlotsUsed` の合計（slot\_allocation.ts 46・51 行目）。`#ref` と pipe も数に入る
- vars は op の分（property 1、style 2、補間テキストは式の数）→ 式の分（pipe・pure function は 1 + 引数）→ 最後に pure function、の順に数えた合計（var\_counting.ts）
- 式の `varOffset` もこのとき決まり、`ɵɵpipeBind` / `ɵɵpureFunction` の 2 つ目の引数になる
- advance は、コンパイラがカーソルの位置をまねて追い、ずれたときだけ差を入れる（generate\_advance.ts 37・64・71 行目）
- ɵcmp に入るのはルートビューの decls / vars だけ。子ビューの分は `ɵɵtemplate` の引数になる

---

← 前: [テンプレートパイプラインの IR：OpList・Xref・SlotHandle・式の木](11-compiler-ir.md)  
次: [ctx・nextContext・restoreView：テンプレート変数とコンテキストの解決](13-compiler-variables.md) →
