[目次](../README.md) › [テンプレートコンパイラの内側](README.md) › 第 13 回 / 全 18 回

# ctx・nextContext・restoreView：テンプレート変数とコンテキストの解決

> resolve\_names.ts が式の中の名前をコンポーネントのプロパティ（ctx.x）、テンプレート変数、#ref のどれかに決める行、generate\_variables.ts が子テンプレートで親の変数を読むための SemanticVariable を作る行、resolve\_contexts.ts と nextContext、リスナーの中で save\_restore\_view.ts が ɵɵrestoreView / ɵɵresetView を入れる理由、variable\_optimization.ts が使われない変数を消す行。

angular/angular · 読了 約 15 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-variables)

---

`<ng-template let-obj><button (click)="obj.value = 1">` をコンパイルすると、リスナーの中に `const obj_r2 = ɵɵrestoreView(_r1).$implicit;` と `return ɵɵresetView(obj_r2.value = 1);` が出てきます。この章では、テンプレートに書いた名前 `obj` がこの 2 行になるまでを、**どのフェーズが何を足し、何を消したか**で 1 つずつ追います。変数を「とりあえず全部作る」フェーズ、名前を変数に結び付けるフェーズ、`ctx` と `ɵɵnextContext()` を決めるフェーズ、使われない変数を消すフェーズ、名前を付けるフェーズの順です。

読む対象は `packages/compiler/src/template/pipeline/src/phases/` の `generate_variables.ts`・`save_restore_view.ts`・`resolve_names.ts`・ `resolve_contexts.ts`・`variable_optimization.ts`・`next_context_merging.ts`・`naming.ts`・`reify.ts`、実行時側の `core/src/render3/state.ts`、そして fixture の `test_cases/r3_view_compiler_listener/` と `r3_view_compiler_template/` です。

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
13. **13. 変数とコンテキスト**（この章）
14. [14. 定数配列と pure function](14-compiler-consts-pure.md)
15. [15. 制御フローのフェーズ](15-compiler-control-flow-phases.md)
16. [16. reify と出力](16-compiler-reify-emit.md)
17. [17. 型検査（TCB）](17-compiler-typecheck.md)
18. [18. スタイルのカプセル化](18-compiler-shadow-css.md)

## 1. 先にゴールを見る

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_listener/embedded_view_listener_context.ts` L3–13 （▶ の行: 6–7）

```ts
 3 │ @Component({
 4 │     selector: 'my-component',
 5 │     template: `
 6 ▶     <ng-template let-obj>
 7 ▶       <button (click)="obj.value = 1">Change</button>
 8 │     </ng-template>
 9 │   `,
10 │     standalone: false
11 │ })
12 │ export class MyComponent {
13 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_listener/embedded_view_listener_context_template.js` L1–12 （▶ の行: 1, 3, 5–7）

```js
 1 ▶ function MyComponent_ng_template_0_Template(rf, $ctx$) {
 2 │ 	if (rf & 1) {
 3 ▶ 	  const $_r3$ = $i0$.ɵɵgetCurrentView();
 4 │ 	  $i0$.ɵɵelementStart(0, "button", 0);
 5 ▶ 	  $i0$.ɵɵlistener("click", function MyComponent_ng_template_0_Template_button_click_0_listener() {
 6 ▶ 		const $obj_r1$ = $i0$.ɵɵrestoreView($_r3$).$implicit;
 7 ▶ 		return $i0$.ɵɵresetView($obj_r1$.value = 1);
 8 │ 	  });
 9 │ 	  $i0$.ɵɵtext(1, "Change");
10 │ 	  $i0$.ɵɵelementEnd();
11 │ 	}
12 │   }
```

1 行目、`<ng-template>` の中身は別の関数（子ビューのテンプレート関数）になり、その引数 `ctx` は**子ビューのコンテキスト**（`let-obj` の値を `$implicit` に持つオブジェクト）です。3 行目で作成時に今のビューを変数に保存し、6 行目、クリックされたらそれを `ɵɵrestoreView` で戻して、戻り値（子ビューのコンテキスト）の `$implicit` を `obj` として読みます。7 行目、ハンドラの戻り値は `ɵɵresetView(…)` で包まれます。

> [!TIP]
> **新卒エンジニアへ**
>
> fixture の `$i0$` や `$_r3$` のように `$` で挟んだ名前は「何かの識別子」を表すプレースホルダです。テストは下の 245〜257 行目のとおり、初めて出たプレースホルダを任意の識別子に当て（251 行目）、同じプレースホルダの 2 回目以降は同じ識別子であることを求めます（255 行目）。実際の名前は 8 節の naming.ts が決め、22.1.6 の `ngc` でこのテンプレートをコンパイルすると `_r1` と `obj_r2` になります。

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/expect_emit.ts` L239–257 （▶ の行: 245–247, 251, 253, 255）

```ts
239 │   for (const piece of pieces) {
240 │     if (!first)
241 │       results.push(`\\s${typeof piece === 'string' && IDENT_LIKE.test(piece) ? '+' : '*'}`);
242 │     first = false;
243 │ 
244 │     if (typeof piece === 'string') {
245 ▶       if (MATCHING_IDENT.test(piece)) {
246 ▶         if (knownGroups.has(piece)) {
247 ▶           results.push(escapeRegExp(knownGroups.get(piece)!));
248 │         } else {
249 │           const matchGroup = newGroups.get(piece);
250 │           if (!matchGroup) {
251 ▶             results.push('(' + IDENTIFIER.source + ')');
252 │             groupCounter++;
253 ▶             newGroups.set(piece, groupCounter);
254 │           } else {
255 ▶             results.push(`\\${matchGroup}`);
256 │           }
257 │         }
```

## 2. 関わるフェーズの順番

| 番目 | フェーズ | やること |
| --- | --- | --- |
| 29 | `generateVariables` | 見える可能性のある変数を**全部**宣言する（4 節） |
| 31 | `saveAndRestoreView` | ビューの保存と、リスナーでの復元を足す（5 節） |
| 37 | `resolveNames` | 名前の読み（`LexicalReadExpr`）を変数か `ctx.x` に決める（6 節） |
| 41 | `resolveContexts` | 「あのビューのコンテキスト」（`ContextExpr`）を `ctx` か変数に決める（6 節） |
| 47 | `optimizeVariables` | 使われない変数を消し、1 回だけ使う変数を埋め込む（7 節） |
| 65 | `nameFunctionsAndVariables` | 変数に `_r1`・`obj_r2`・`ctx_r4` のような名前を付ける（8 節） |
| 67 | `mergeNextContextExpressions` | 続けて呼ぶ `ɵɵnextContext()` を `ɵɵnextContext(2)` にまとめる（9 節） |

番目は emit.ts の phases 配列（全 74 個。並び全体は[全体図の章](01-compiler.md)）での位置です。

## 3. 材料：ingest が残すもの

ingest（[第 10 回](10-compiler-ingest.md)）は `<ng-template let-obj>` の子ビューの `contextVariables`（`ViewCompilationUnit` のフィールド）に、`tmpl.variables` を 1 つずつ「テンプレート変数名 → コンテキストのプロパティ名」として登録します。`let-obj` は値が空なので `'$implicit'`、`let-i="index"` なら `'index'` です。ingest がするのは**表を作るところまで**で、変数の宣言はまだ 1 つもありません。

リスナーの本体は、ingest の `makeListenerHandlerOps` で式ごとに op になり、**最後の式だけ**`return` 文になります（第 10 回）。式の中の `obj` は、[第 11 回](11-compiler-ir.md)で見たとおり「`obj` という名前を読む」だけの `LexicalReadExpr('obj')` です。つまりこの時点のハンドラは `return LexicalRead(obj).value = 1` の 1 op だけです。

## 4. generateVariables：見える変数を全部宣言する

📄 `angular/packages/compiler/src/template/pipeline/ir/src/enums.ts` L513–541 （▶ の行: 515, 519, 524, 529, 534）

```ts
513 │  * Distinguishes between different kinds of `SemanticVariable`s.
514 │  */
515 ▶ export enum SemanticVariableKind {
516 │   /**
517 │    * Represents the context of a particular view.
518 │    */
519 ▶   Context,
520 │ 
521 │   /**
522 │    * Represents an identifier declared in the lexical scope of a view.
523 │    */
524 ▶   Identifier,
525 │ 
526 │   /**
527 │    * Represents a saved state that can be used to restore a view in a listener handler function.
528 │    */
529 ▶   SavedView,
530 │ 
531 │   /**
532 │    * An alias generated by a special embedded view type (e.g. a `@for` block).
533 │    */
534 ▶   Alias,
535 │ 
536 │   /**
537 │    * A variable that holds the runtime state (`LBoundary`) of an error boundary.
538 │    * It is typically populated by calling `ɵɵgetBoundary()` during the update phase.
539 │    */
540 │   BoundaryState,
541 │ }
```

IR の変数（`VariableOp` が宣言するもの）は、意味で 5 種類に分かれます。この章に出てくるのは 4 つです。

| SemanticVariableKind | 何を入れる | 初期化子の例 | 付く名前（8 節） |
| --- | --- | --- | --- |
| `Context`（519 行目） | あるビューのコンテキスト | `ɵɵnextContext()`、`ɵɵrestoreView(_r1)` | `ctx_r4` |
| `Identifier`（524 行目） | テンプレートで使える名前（let-x、#ref、@let） | `ctx.$implicit`、`ɵɵreference(1)` | `obj_r2` |
| `SavedView`（529 行目） | リスナーで戻すために保存したビュー | `ɵɵgetCurrentView()` | `_r1` |
| `Alias`（534 行目） | 使う場所に毎回埋め込む別名（`@for` の `$first` など） | `$index === 0` | 名前は使われない（埋め込まれる） |

📄 `angular/packages/compiler/src/template/pipeline/src/phases/generate_variables.ts` L40–79 （▶ の行: 42, 49, 51, 70–71, 73, 78–79）

```ts
40 │ function recursivelyProcessView(view: ViewCompilationUnit, parentScope: Scope | null): void {
41 │   // Extract a `Scope` from this view.
42 ▶   const scope = getScopeForView(view, parentScope);
43 │ 
44 │   for (const op of view.create) {
45 │     switch (op.kind) {
46 │       case ir.OpKind.ConditionalCreate:
47 │       case ir.OpKind.ConditionalBranchCreate:
48 │       case ir.OpKind.BoundaryErrorCreate:
49 ▶       case ir.OpKind.Template:
50 │         // Descend into child embedded views.
51 ▶         recursivelyProcessView(view.job.views.get(op.xref)!, scope);
52 │         break;
53 │       case ir.OpKind.Projection:
54 │         if (op.fallbackView !== null) {
55 │           recursivelyProcessView(view.job.views.get(op.fallbackView)!, scope);
56 │         }
57 │         break;
58 │       case ir.OpKind.RepeaterCreate:
59 │         // Descend into child embedded views.
60 │         recursivelyProcessView(view.job.views.get(op.xref)!, scope);
61 │         if (op.emptyView) {
62 │           recursivelyProcessView(view.job.views.get(op.emptyView)!, scope);
63 │         }
64 │         if (op.trackByOps !== null) {
65 │           op.trackByOps.prepend(generateVariablesInScopeForView(view, scope, false));
66 │         }
67 │         break;
68 │       case ir.OpKind.Animation:
69 │       case ir.OpKind.AnimationListener:
70 ▶       case ir.OpKind.Listener:
71 ▶       case ir.OpKind.TwoWayListener:
72 │         // Prepend variables to listener handler functions.
73 ▶         op.handlerOps.prepend(generateVariablesInScopeForView(view, scope, true));
74 │         break;
75 │     }
76 │   }
77 │ 
78 ▶   view.create.prepend(generateVariablesInScopeForView(view, scope, false));
79 ▶   view.update.prepend(generateVariablesInScopeForView(view, scope, false));
```

1. **42 行目：ビューごとに「スコープ」を作る**

   スコープは「このビューで見える名前の一覧」と「親ビューのスコープへのリンク」です（下の 168 行目）。
2. **49・51 行目：子ビューへ再帰する**

   `<ng-template>` の op を見たら、今のスコープを親として子ビューを処理します。こうして子のスコープは親のスコープにつながります。
3. **70〜73 行目：リスナーのハンドラの先頭に変数を足す**

   ハンドラは別の関数になるので、そこでも変数を宣言し直します。73 行目の第 3 引数 `true` は「コールバック（リスナー）の中」の印です。
4. **78・79 行目：ビューの create と update の先頭にも同じものを足す**

   作成ブロックと更新ブロックは同じ関数の中の別の `if` ですが、どちらで使われるか分からないので両方に足します。このファイル冒頭のコメントにあるとおり、変数は「無条件に」作り、要らないものは後のフェーズで消します。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/generate_variables.ts` L168–191 （▶ の行: 168, 171–172, 174, 181, 184–186, 188–189）

```ts
168 ▶ function getScopeForView(view: ViewCompilationUnit, parent: Scope | null): Scope {
169 │   const scope: Scope = {
170 │     view: view.xref,
171 ▶     viewContextVariable: {
172 ▶       kind: ir.SemanticVariableKind.Context,
173 │       name: null,
174 ▶       view: view.xref,
175 │     },
176 │     contextVariables: new Map<string, ir.SemanticVariable>(),
177 │     aliases: view.aliases,
178 │     references: [],
179 │     letDeclarations: [],
180 │     boundaryVariables: new Map<ir.XrefId, {variable: ir.SemanticVariable; handle: ir.SlotHandle}>(),
181 ▶     parent,
182 │   };
183 │ 
184 ▶   for (const identifier of view.contextVariables.keys()) {
185 ▶     scope.contextVariables.set(identifier, {
186 ▶       kind: ir.SemanticVariableKind.Identifier,
187 │       name: null,
188 ▶       identifier,
189 ▶       local: false,
190 │     });
191 │   }
```

171〜175 行目、スコープは自分のビューのコンテキストを表す `Context` 変数を 1 つ持ちます。184〜191 行目、3 節の `contextVariables`（`obj → '$implicit'`）の名前ごとに `Identifier` 変数を用意します。ここではまだ「変数の中身」は決めていません。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/generate_variables.ts` L271–290 （▶ の行: 278, 282, 285–286）

```ts
271 │ function generateVariablesInScopeForView<OpT extends ir.Op<OpT>>(
272 │   view: ViewCompilationUnit,
273 │   scope: Scope,
274 │   isCallback: boolean,
275 │ ): ir.VariableOp<OpT>[] {
276 │   const newOps: ir.VariableOp<OpT>[] = [];
277 │ 
278 ▶   if (scope.view !== view.xref) {
279 │     // Before generating variables for a parent view, we need to switch to the context of the parent
280 │     // view with a `nextContext` expression. This context switching operation itself declares a
281 │     // variable, because the context of the view may be referenced directly.
282 ▶     newOps.push(
283 │       ir.createVariableOp(
284 │         view.job.allocateXrefId(),
285 ▶         scope.viewContextVariable,
286 ▶         new ir.NextContextExpr(),
287 │         ir.VariableFlags.None,
288 │       ),
289 │     );
290 │   }
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/generate_variables.ts` L292–314 （▶ の行: 294–295, 300–301, 303, 309）

```ts
292 │   // Add variables for all context variables available in this scope's view.
293 │   const scopeView = view.job.views.get(scope.view)!;
294 ▶   for (const [name, value] of scopeView.contextVariables) {
295 ▶     const context = new ir.ContextExpr(scope.view);
296 │     // We either read the context, or, if the variable is CTX_REF, use the context directly.
297 │     let variable: o.Expression;
298 │     if (value === ir.CTX_REF) {
299 │       variable = context;
300 ▶     } else if (typeof value === 'number') {
301 ▶       variable = new o.ReadKeyExpr(context, o.literal(value));
302 │     } else {
303 ▶       variable = new o.ReadPropExpr(context, value);
304 │     }
305 │     // Add the variable declaration.
306 │     newOps.push(
307 │       ir.createVariableOp(
308 │         view.job.allocateXrefId(),
309 ▶         scope.contextVariables.get(name)!,
310 │         variable,
311 │         ir.VariableFlags.None,
312 │       ),
313 │     );
314 │   }
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/generate_variables.ts` L339–368 （▶ の行: 340, 345, 364, 366）

```ts
339 │   // Add variables for all local references declared for elements in this scope.
340 ▶   for (const ref of scope.references) {
341 │     newOps.push(
342 │       ir.createVariableOp(
343 │         view.job.allocateXrefId(),
344 │         ref.variable,
345 ▶         new ir.ReferenceExpr(ref.targetId, ref.targetSlot, ref.offset),
346 │         ir.VariableFlags.None,
347 │       ),
348 │     );
349 │   }
350 │ 
351 │   if (scope.view !== view.xref || isCallback) {
352 │     for (const decl of scope.letDeclarations) {
353 │       newOps.push(
354 │         ir.createVariableOp<OpT>(
355 │           view.job.allocateXrefId(),
356 │           decl.variable,
357 │           new ir.ContextLetReferenceExpr(decl.targetId, decl.targetSlot),
358 │           ir.VariableFlags.None,
359 │         ),
360 │       );
361 │     }
362 │   }
363 │ 
364 ▶   if (scope.parent !== null) {
365 │     // Recursively add variables from the parent scope.
366 ▶     newOps.push(...generateVariablesInScopeForView<OpT>(view, scope.parent, false));
367 │   }
368 │   return newOps;
```

1. **278〜290 行目：親のスコープなら、まず ɵɵnextContext() の変数**

   今処理しているビューと違うビューのスコープ（＝親）に入るときは、286 行目の `NextContextExpr` を初期化子にした `Context` 変数を先に宣言します。実行時の `ɵɵnextContext()` は「1 つ外のビューのコンテキストを返し、内部のカーソルもそこへ動かす」命令なので、親の親へ行くにはこれを 2 回呼びます。
2. **294〜313 行目：そのビューのテンプレート変数**

   295 行目の `ContextExpr(scope.view)` は「スコープのビューのコンテキスト」という IR の式で、まだ `ctx` とも変数とも決まっていません。303 行目、`'$implicit'` のような名前ならそのプロパティ読み `ContextExpr.$implicit`。300・301 行目、`@for` などで番号が入っていれば添字読みです。
3. **340〜349 行目：#ref ごとに ɵɵreference の変数**

   345 行目の `ReferenceExpr` が、slot 番号の決まった後で `ɵɵreference(n)` になります（[第 12 回](12-compiler-slots-vars.md)）。
4. **364〜366 行目：親のスコープを再帰的に足す**

   親・親の親…と根のビューまで、同じことを繰り返します。

この時点での子ビューのリスナーのハンドラは、こうなっています（IR を擬似コードで書いたもの）。

| 順 | op | 作ったフェーズ |
| --- | --- | --- |
| 1 | `var obj = ContextExpr(子).$implicit`（Identifier） | generateVariables 294〜313 行目 |
| 2 | `var c0 = nextContext()`（Context。根のビュー） | generateVariables 278〜290 行目（親スコープ） |
| 3 | `return LexicalRead(obj).value = 1` | ingest |

## 5. saveAndRestoreView：リスナーのための保存と復元

📄 `angular/packages/compiler/src/template/pipeline/src/phases/save_restore_view.ts` L13–54 （▶ の行: 16, 28–29, 32, 34, 36, 41, 48–49）

```ts
13 │ /**
14 │  * When inside of a listener, we may need access to one or more enclosing views. Therefore, each
15 │  * view should save the current view, and each listener must have the ability to restore the
16 ▶  * appropriate view. We eagerly generate all save view variables; they will be optimized away later.
17 │  */
18 │ export function saveAndRestoreView(job: ComponentCompilationJob): void {
19 │   for (const unit of job.units) {
20 │     for (const expr of unit.functions) {
21 │       if (needsRestoreView(job, unit, expr.ops)) {
22 │         // We don't need to capture the view in a variable for arrow
23 │         // functions, it will be passed in to its factory.
24 │         addSaveRestoreViewOperation(unit, expr.ops, o.variable(expr.currentViewName));
25 │       }
26 │     }
27 │ 
28 ▶     unit.create.prepend([
29 ▶       ir.createVariableOp<ir.CreateOp>(
30 │         unit.job.allocateXrefId(),
31 │         {
32 ▶           kind: ir.SemanticVariableKind.SavedView,
33 │           name: null,
34 ▶           view: unit.xref,
35 │         },
36 ▶         new ir.GetCurrentViewExpr(),
37 │         ir.VariableFlags.None,
38 │       ),
39 │     ]);
40 │ 
41 ▶     for (const op of unit.create) {
42 │       if (
43 │         op.kind === ir.OpKind.Listener ||
44 │         op.kind === ir.OpKind.TwoWayListener ||
45 │         op.kind === ir.OpKind.Animation ||
46 │         op.kind === ir.OpKind.AnimationListener
47 │       ) {
48 ▶         if (needsRestoreView(job, unit, op.handlerOps)) {
49 ▶           addSaveRestoreViewOperation(unit, op.handlerOps, unit.xref);
50 │         }
51 │       }
52 │     }
53 │   }
54 │ }
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/save_restore_view.ts` L56–75 （▶ の行: 62, 64, 67–68）

```ts
56 │ function needsRestoreView(
57 │   job: ComponentCompilationJob,
58 │   unit: ViewCompilationUnit,
59 │   opList: ir.OpList<ir.CreateOp | ir.UpdateOp>,
60 │ ): boolean {
61 │   // Embedded views always need the save/restore view operation.
62 ▶   let result = unit !== job.root;
63 │ 
64 ▶   if (!result) {
65 │     for (const innerOp of opList) {
66 │       ir.visitExpressionsInOp(innerOp, (expr) => {
67 ▶         if (expr instanceof ir.ReferenceExpr || expr instanceof ir.ContextLetReferenceExpr) {
68 ▶           result = true;
69 │         }
70 │       });
71 │     }
72 │   }
73 │ 
74 │   return result;
75 │ }
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/save_restore_view.ts` L77–106 （▶ の行: 82, 86, 88, 90, 98, 100–101, 103）

```ts
 77 │ function addSaveRestoreViewOperation(
 78 │   unit: ViewCompilationUnit,
 79 │   opList: ir.OpList<ir.UpdateOp>,
 80 │   restoreViewTarget: ir.XrefId | o.Expression,
 81 │ ) {
 82 ▶   opList.prepend([
 83 │     ir.createVariableOp<ir.UpdateOp>(
 84 │       unit.job.allocateXrefId(),
 85 │       {
 86 ▶         kind: ir.SemanticVariableKind.Context,
 87 │         name: null,
 88 ▶         view: unit.xref,
 89 │       },
 90 ▶       new ir.RestoreViewExpr(restoreViewTarget),
 91 │       ir.VariableFlags.None,
 92 │     ),
 93 │   ]);
 94 │ 
 95 │   // The "restore view" operation requires a call to `resetView` to reset the
 96 │   // context prior to returning from the operation. Find any `return` statements in
 97 │   // the body and wrap them in a call to reset the view.
 98 ▶   for (const handlerOp of opList) {
 99 │     if (
100 ▶       handlerOp.kind === ir.OpKind.Statement &&
101 ▶       handlerOp.statement instanceof o.ReturnStatement
102 │     ) {
103 ▶       handlerOp.statement.value = new ir.ResetViewExpr(handlerOp.statement.value);
104 │     }
105 │   }
106 │ }
```

1. **28〜39 行目：すべてのビューの create の先頭に「今のビューを保存」**

   `SavedView` 変数（32 行目）を `GetCurrentViewExpr`（36 行目。`ɵɵgetCurrentView()`）で初期化します。16 行目のコメントのとおり、全ビューに無条件に作り、要らなければ後で消えます。
2. **48・49 行目 → 62 行目：子ビューのリスナーは必ず復元する**

   62 行目、根のビュー以外（`<ng-template>` の中など）は常に必要です。根のビューでも、64〜71 行目、ハンドラが `#ref` を読むなら必要です。
3. **82〜93 行目：ハンドラの先頭に「復元してコンテキストを変数に」**

   86 行目、変数の種類は `Context`（このビューのコンテキスト）、初期化子は 90 行目の `RestoreViewExpr`。`prepend` なので、4 節で足した変数よりさらに前に入ります。
4. **98〜104 行目：return を ɵɵresetView で包む**

   ハンドラの `return` 文を探し、103 行目でその値を `ResetViewExpr` で包みます。

📄 `angular/packages/core/src/render3/state.ts` L351–377 （▶ の行: 363–365, 374–376）

```ts
351 │ /**
352 │  * Restores `contextViewData` to the given OpaqueViewState instance.
353 │  *
354 │  * Used in conjunction with the getCurrentView() instruction to save a snapshot
355 │  * of the current view and restore it when listeners are invoked. This allows
356 │  * walking the declaration view tree in listeners to get vars from parent views.
357 │  *
358 │  * @param viewToRestore The OpaqueViewState instance to restore.
359 │  * @returns Context of the restored OpaqueViewState instance.
360 │  *
361 │  * @codeGenApi
362 │  */
363 ▶ export function ɵɵrestoreView<T = any>(viewToRestore: OpaqueViewState): T {
364 ▶   instructionState.lFrame.contextLView = viewToRestore as any as LView;
365 ▶   return (viewToRestore as any as LView)[CONTEXT] as unknown as T;
366 │ }
367 │ 
368 │ /**
369 │  * Clears the view set in `ɵɵrestoreView` from memory. Returns the passed in
370 │  * value so that it can be used as a return value of an instruction.
371 │  *
372 │  * @codeGenApi
373 │  */
374 ▶ export function ɵɵresetView<T>(value?: T): T | undefined {
375 ▶   instructionState.lFrame.contextLView = null;
376 ▶   return value;
377 │ }
```

なぜ要るのかは実行時側を見ると分かります。364 行目、`ɵɵrestoreView` は `lFrame.contextLView`（「今どのビューのコンテキストを見ているか」のカーソル。[LFrame の章](../ivy/15-ivy-lframe.md)）を、保存しておいた LView に戻し、365 行目でそのビューのコンテキストを返します。クリックはテンプレート関数の実行が終わった後に来るので、そのときのカーソルは別のビューを指しているか空です。ハンドラの中で `ɵɵnextContext()` で親へたどるには、まずカーソルを「このリスナーを宣言したビュー」に戻す必要があるわけです。375 行目の `ɵɵresetView` はカーソルを `null` に戻し、376 行目で受け取った値をそのまま返します。`return` の値を包むのは、戻り値を変えずに後片付けをするためです。

📄 `angular/packages/core/src/render3/instructions/storage.ts` L12–25 （▶ の行: 15–16, 23–24）

```ts
12 │ /**
13 │  * Retrieves a local reference from the current contextViewData.
14 │  *
15 ▶  * If the reference to retrieve is in a parent view, this instruction is used in conjunction
16 ▶  * with a nextContext() call, which walks up the tree and updates the contextViewData instance.
17 │  *
18 │  * @param index The index of the local ref in contextViewData.
19 │  *
20 │  * @codeGenApi
21 │  */
22 │ export function ɵɵreference<T>(index: number) {
23 ▶   const contextLView = getContextLView();
24 ▶   return load<T>(contextLView, HEADER_OFFSET + index);
25 │ }
```

`#ref` を読む `ɵɵreference` も、23・24 行目のとおりカーソル（`getContextLView()`）の指す LView から読みます。15・16 行目のコメントにあるとおり、親ビューの `#ref` なら `nextContext()` でカーソルを動かしてから呼ぶ前提です。根のビューのリスナーでも `#ref` を読むなら restoreView が要る（save\_restore\_view.ts 64〜71 行目）のはこのためです。

## 6. resolveNames と resolveContexts：名前とコンテキストを決める

📄 `angular/packages/compiler/src/template/pipeline/src/phases/resolve_names.ts` L40–79 （▶ の行: 40, 43, 50, 52–53, 57, 61, 70, 73–75）

```ts
40 ▶   const scope = new Map<string, ir.XrefId>();
41 │ 
42 │   // Symbols defined within the current scope. They take precedence over ones defined outside.
43 ▶   const localDefinitions = new Map<string, ir.XrefId>();
44 │ 
45 │   // First, step through the operations list and:
46 │   // 1) build up the `scope` mapping
47 │   // 2) recurse into any listener functions
48 │   for (const op of ops) {
49 │     switch (op.kind) {
50 ▶       case ir.OpKind.Variable:
51 │         switch (op.variable.kind) {
52 ▶           case ir.SemanticVariableKind.Identifier:
53 ▶             if (op.variable.local) {
54 │               if (localDefinitions.has(op.variable.identifier)) {
55 │                 continue;
56 │               }
57 ▶               localDefinitions.set(op.variable.identifier, op.xref);
58 │             } else if (scope.has(op.variable.identifier)) {
59 │               continue;
60 │             }
61 ▶             scope.set(op.variable.identifier, op.xref);
62 │             break;
63 │           case ir.SemanticVariableKind.Alias:
64 │             // This variable represents some kind of identifier which can be used in the template.
65 │             if (scope.has(op.variable.identifier)) {
66 │               continue;
67 │             }
68 │             scope.set(op.variable.identifier, op.xref);
69 │             break;
70 ▶           case ir.SemanticVariableKind.SavedView:
71 │             // This variable represents a snapshot of the current view context, and can be used to
72 │             // restore that context within listener functions.
73 ▶             savedView = {
74 ▶               view: op.variable.view,
75 ▶               variable: op.xref,
76 │             };
77 │             break;
78 │         }
79 │         break;
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/resolve_names.ts` L80–94 （▶ の行: 82, 86）

```ts
80 │       case ir.OpKind.Animation:
81 │       case ir.OpKind.AnimationListener:
82 ▶       case ir.OpKind.Listener:
83 │       case ir.OpKind.TwoWayListener:
84 │         // Listener functions have separate variable declarations, so process them as a separate
85 │         // lexical scope.
86 ▶         processLexicalScope(unit, op.handlerOps, savedView);
87 │         break;
88 │       case ir.OpKind.RepeaterCreate:
89 │         if (op.trackByOps !== null) {
90 │           processLexicalScope(unit, op.trackByOps, savedView);
91 │         }
92 │         break;
93 │     }
94 │   }
```

`resolveNames` は op のリストを 2 回なめます。1 回目（48〜94 行目）で、`Variable` op から「名前 → 変数の XrefId」の表 `scope` を作ります。52〜61 行目、`Identifier` 変数は識別子名で登録し、同じ名前が既にあれば先に出たもの（＝近いビューのもの）を優先します。70〜77 行目、`SavedView` 変数を見つけたら覚えておきます。86 行目、リスナーのハンドラは別のスコープとして再帰し、そのとき覚えた `savedView` を渡します。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/resolve_names.ts` L109–139 （▶ の行: 109, 112, 116–118, 120, 123, 125, 132）

```ts
109 ▶     ir.transformExpressionsInOp(
110 │       op,
111 │       (expr) => {
112 ▶         if (expr instanceof ir.LexicalReadExpr) {
113 │           // `expr` is a read of a name within the lexical scope of this view.
114 │           // Either that name is defined within the current view, or it represents a property from the
115 │           // main component context.
116 ▶           if (localDefinitions.has(expr.name)) {
117 ▶             return new ir.ReadVariableExpr(localDefinitions.get(expr.name)!);
118 ▶           } else if (scope.has(expr.name)) {
119 │             // This was a defined variable in the current scope.
120 ▶             return new ir.ReadVariableExpr(scope.get(expr.name)!);
121 │           } else {
122 │             // Reading from the component context.
123 ▶             return new o.ReadPropExpr(new ir.ContextExpr(unit.job.root.xref), expr.name);
124 │           }
125 ▶         } else if (expr instanceof ir.RestoreViewExpr && typeof expr.view === 'number') {
126 │           // `ir.RestoreViewExpr` happens in listener functions and restores a saved view from the
127 │           // parent creation list. We expect to find that we captured the `savedView` previously, and
128 │           // that it matches the expected view to be restored.
129 │           if (savedView === null || savedView.view !== expr.view) {
130 │             throw new Error(`AssertionError: no saved view ${expr.view} from view ${unit.xref}`);
131 │           }
132 ▶           expr.view = new ir.ReadVariableExpr(savedView.variable);
133 │           return expr;
134 │         } else {
135 │           return expr;
136 │         }
137 │       },
138 │       ir.VisitorContextFlag.None,
139 │     );
```

1. **112〜120 行目：表にある名前なら、その変数の読みに**

   ハンドラの中の `LexicalRead(obj)` は、4 節でハンドラの先頭に足した `obj` 変数の `ReadVariableExpr` になります。
2. **123 行目：どこにも無い名前は、コンポーネントのプロパティ**

   `ContextExpr(根のビュー).name` にします。`ctx.name` の `ctx` は「根のビューのコンテキスト」、つまりコンポーネントのインスタンスです。テンプレートで `let-` も `#` も付けていない名前がコンポーネントのフィールドとして読まれるのは、この 1 行のためです。
3. **125〜133 行目：RestoreViewExpr を保存した変数に結ぶ**

   5 節で足した `RestoreViewExpr(子ビューの XrefId)` の引数を、132 行目で `SavedView` 変数の読みに置き換えます。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/resolve_contexts.ts` L29–66 （▶ の行: 35, 38, 44–45, 53, 63, 65）

```ts
29 │ function processLexicalScope(
30 │   view: CompilationUnit,
31 │   ops: ir.OpList<ir.CreateOp | ir.UpdateOp>,
32 │ ): void {
33 │   // Track the expressions used to access all available contexts within the current view, by the
34 │   // view `ir.XrefId`.
35 ▶   const scope = new Map<ir.XrefId, o.Expression>();
36 │ 
37 │   // The current view's context is accessible via the `ctx` parameter.
38 ▶   scope.set(view.xref, o.variable(CONTEXT_NAME));
39 │ 
40 │   for (const op of ops) {
41 │     switch (op.kind) {
42 │       case ir.OpKind.Variable:
43 │         switch (op.variable.kind) {
44 ▶           case ir.SemanticVariableKind.Context:
45 ▶             scope.set(op.variable.view, new ir.ReadVariableExpr(op.xref));
46 │             break;
47 │         }
48 │         break;
49 │       case ir.OpKind.Animation:
50 │       case ir.OpKind.AnimationListener:
51 │       case ir.OpKind.Listener:
52 │       case ir.OpKind.TwoWayListener:
53 ▶         processLexicalScope(view, op.handlerOps);
54 │         break;
55 │       case ir.OpKind.RepeaterCreate:
56 │         if (op.trackByOps !== null) {
57 │           processLexicalScope(view, op.trackByOps);
58 │         }
59 │         break;
60 │     }
61 │   }
62 │ 
63 ▶   if (view === view.job.root) {
64 │     // Prefer `ctx` of the root view to any variables which happen to contain the root context.
65 ▶     scope.set(view.xref, o.variable(CONTEXT_NAME));
66 │   }
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/resolve_contexts.ts` L68–86 （▶ の行: 72, 78）

```ts
68 │   for (const op of ops) {
69 │     ir.transformExpressionsInOp(
70 │       op,
71 │       (expr) => {
72 ▶         if (expr instanceof ir.ContextExpr) {
73 │           if (!scope.has(expr.view)) {
74 │             throw new Error(
75 │               `No context found for reference to view ${expr.view} from view ${view.xref}`,
76 │             );
77 │           }
78 ▶           return scope.get(expr.view)!;
79 │         } else {
80 │           return expr;
81 │         }
82 │       },
83 │       ir.VisitorContextFlag.None,
84 │     );
85 │   }
86 │ }
```

`resolveContexts` は「ビューの XrefId → そのコンテキストを表す式」の表を作ります。38 行目、まず**今のビューは `ctx`**（テンプレート関数の第 2 引数）。44・45 行目、`Context` 変数があれば、そのビューは「その変数の読み」で上書きします。63〜66 行目、根のビューの関数では根のコンテキストを必ず `ctx` にします。72〜78 行目で `ContextExpr` を表の式に置き換えます。

リスナーのハンドラ（53 行目で別スコープ）では、5 節の `var c = restoreView(_r)` が子ビューの `Context` 変数なので、45 行目で子ビューの項が `ctx` から `c` に上書きされます。だから `obj` 変数の初期化子 `ContextExpr(子).$implicit` は `c.$implicit` になります。ハンドラの中では、テンプレート関数の引数 `ctx` ではなく、`ɵɵrestoreView` の戻り値からコンテキストを読む、ということです。

## 7. optimizeVariables：使わない変数を消し、1 回だけの変数を埋め込む

ここまででハンドラはこうなっています。

| 順 | op | 使われる回数 |
| --- | --- | --- |
| 1 | `var c = restoreView(_r)`（Context） | 1（2 の中） |
| 2 | `var obj = c.$implicit`（Identifier） | 1（4 の中） |
| 3 | `var c0 = nextContext()`（Context。根） | 0 |
| 4 | `return resetView(obj.value = 1)` | — |

📄 `angular/packages/compiler/src/template/pipeline/src/phases/variable_optimization.ts` L348–365 （▶ の行: 353–356, 359, 361）

```ts
348 │ /**
349 │  * Given an `ir.Expression`, returns the `Fence` flags for that expression type.
350 │  */
351 │ function fencesForIrExpression(expr: ir.Expression): Fence {
352 │   switch (expr.kind) {
353 ▶     case ir.ExpressionKind.NextContext:
354 ▶       return Fence.ViewContextRead | Fence.ViewContextWrite;
355 ▶     case ir.ExpressionKind.RestoreView:
356 ▶       return Fence.ViewContextRead | Fence.ViewContextWrite | Fence.SideEffectful;
357 │     case ir.ExpressionKind.StoreLet:
358 │       return Fence.SideEffectful;
359 ▶     case ir.ExpressionKind.Reference:
360 │     case ir.ExpressionKind.ContextLetReference:
361 ▶       return Fence.ViewContextRead;
362 │     default:
363 │       return Fence.None;
364 │   }
365 │ }
```

消してよいかを決めるのは「フェンス」（それより前後に動かしてはいけない印）です。354 行目、`nextContext` はカーソルを読んで書き換える。356 行目、`restoreView` はさらに副作用あり（SideEffectful）で、結果を使わなくても消せません。361 行目、`reference` はカーソルを読む。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/variable_optimization.ts` L208–232 （▶ の行: 210, 214, 217, 220–222, 230, 232）

```ts
208 │   // Track whether we've seen an operation which reads from the view context yet. This is used to
209 │   // determine whether a write to the view context in a variable initializer can be observed.
210 ▶   let contextIsUsed = false;
211 │ 
212 │   // Note that iteration through the list happens in reverse, which guarantees that we'll process
213 │   // all reads of a variable prior to processing its declaration.
214 ▶   for (const op of ops.reversed()) {
215 │     const opInfo = opMap.get(op)!;
216 │ 
217 ▶     if (op.kind === ir.OpKind.Variable && varUsages.get(op.xref)! === 0) {
218 │       // This variable is unused and can be removed. We might need to keep the initializer around,
219 │       // though, if something depends on it running.
220 ▶       if (
221 ▶         (contextIsUsed && opInfo.fences & Fence.ViewContextWrite) ||
222 ▶         opInfo.fences & Fence.SideEffectful
223 │       ) {
224 │         // This variable initializer has a side effect which must be retained. Either:
225 │         //  * it writes to the view context, and we know there is a future operation which depends
226 │         //    on that write, or
227 │         //  * it's an operation which is inherently side-effectful.
228 │         // We can't remove the initializer, but we can remove the variable declaration itself and
229 │         // replace it with a side-effectful statement.
230 ▶         const stmtOp = ir.createStatementOp(op.initializer.toStmt()) as ir.UpdateOp;
231 │         opMap.set(stmtOp, opInfo);
232 ▶         ir.OpList.replace(op as ir.UpdateOp, stmtOp);
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/variable_optimization.ts` L233–253 （▶ の行: 233, 239–240, 250–251）

```ts
233 ▶       } else {
234 │         // It's safe to delete this entire variable declaration as nothing depends on it, even
235 │         // side-effectfully. Note that doing this might make other variables unused. Since we're
236 │         // iterating in reverse order, we should always be processing usages before declarations
237 │         // and therefore by the time we get to a declaration, all removable usages will have been
238 │         // removed.
239 ▶         uncountVariableUsages(op, varUsages);
240 ▶         ir.OpList.remove(op as ir.UpdateOp);
241 │       }
242 │ 
243 │       opMap.delete(op);
244 │       varDecls.delete(op.xref);
245 │       varUsages.delete(op.xref);
246 │       continue;
247 │     }
248 │ 
249 │     // Does this operation depend on the view context?
250 ▶     if (opInfo.fences & Fence.ViewContextRead) {
251 ▶       contextIsUsed = true;
252 │     }
253 │   }
```

1. **214 行目：後ろから見る**

   212・213 行目のコメントのとおり、変数の使用は宣言より後ろにあるので、後ろから見れば宣言に来た時点で使用の数が確定しています。
2. **217 行目：使われていない変数か**

   ハンドラの 3（`c0 = nextContext()`）が該当します。
3. **220〜222 行目：消すと困る副作用があるか**

   「後ろでカーソルを読む op がある（`contextIsUsed`）のにカーソルを書き換える」か「副作用あり」なら、230〜232 行目で変数をやめて**式の文だけ残します**。3 の後ろは 4 の return だけで、カーソルを読む op がないので `contextIsUsed` は false。3 は 240 行目で**丸ごと消えます**。
4. **250・251 行目：カーソルを読む op を見たら印を立てる**

   後ろから見ているので、これより前（＝上）にある nextContext は「後ろで読まれる」ことになり、消せなくなります。9 節の例がこれです。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/variable_optimization.ts` L255–277 （▶ の行: 265, 270, 275）

```ts
255 │   // Next, inline any remaining variables with exactly one usage.
256 │   const toInline: ir.XrefId[] = [];
257 │   for (const [id, count] of varUsages) {
258 │     const decl = varDecls.get(id)!;
259 │     // We can inline variables that:
260 │     //  - are used exactly once, and
261 │     //  - are not used remotely
262 │     // OR
263 │     //  - are marked for always inlining
264 │     const isAlwaysInline = !!(decl.flags & ir.VariableFlags.AlwaysInline);
265 ▶     if (count !== 1 || isAlwaysInline) {
266 │       // We can't inline this variable as it's used more than once.
267 │       continue;
268 │     }
269 │ 
270 ▶     if (varRemoteUsages.has(id)) {
271 │       // This variable is used once, but across an operation boundary, so it can't be inlined.
272 │       continue;
273 │     }
274 │ 
275 ▶     toInline.push(id);
276 │   }
277 │ 
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/variable_optimization.ts` L542–564 （▶ の行: 548–550, 555, 557–558, 560）

```ts
542 │ function allowConservativeInlining(
543 │   decl: ir.VariableOp<ir.CreateOp | ir.UpdateOp>,
544 │   target: ir.Op<ir.CreateOp | ir.UpdateOp>,
545 │ ): boolean {
546 │   // TODO(alxhub): understand exactly how TemplateDefinitionBuilder approaches inlining, and record
547 │   // that behavior here.
548 ▶   switch (decl.variable.kind) {
549 ▶     case ir.SemanticVariableKind.Identifier:
550 ▶       if (decl.initializer instanceof o.ReadVarExpr && decl.initializer.name === CONTEXT_NAME) {
551 │         // Although TemplateDefinitionBuilder is cautious about inlining, we still want to do so
552 │         // when the variable is the context, to imitate its behavior with aliases in control flow
553 │         // blocks. This quirky behavior will become dead code once compatibility mode is no longer
554 │         // supported.
555 ▶         return true;
556 │       }
557 ▶       return false;
558 ▶     case ir.SemanticVariableKind.Context:
559 │       // Context can only be inlined into other variables.
560 ▶       return target.kind === ir.OpKind.Variable;
561 │     default:
562 │       return true;
563 │   }
564 │ }
```

次は埋め込み（inline）です。265 行目、ちょうど 1 回使われ、270 行目、ハンドラの外など別の op の境界をまたいで使われていない変数が候補です。ただし埋め込む先には制限があります。558〜560 行目、`Context` 変数は**他の変数の初期化子にだけ**埋め込めます。549〜557 行目、`Identifier` 変数は、初期化子が `ctx` そのものの場合を除いて埋め込みません（古いコンパイラと同じ出力にするための控えめな規則）。

ハンドラでは、1 の `c`（Context）は 2 の**変数**の初期化子でだけ使われているので埋め込まれ、`var obj = restoreView(_r).$implicit` になります。2 の `obj`（Identifier）は埋め込まれず変数のまま残ります。こうして 1 節の 6・7 行目の形になりました。作成ブロック・更新ブロックの先頭に 4 節で足した変数は、どれも使われないので同じ規則で消えます。1 節 3 行目の `_r = getCurrentView()` だけは、ハンドラの中で 1 回使われているので消えず、その使用が op の境界をまたぐ（270 行目）ので埋め込まれもしません。

## 8. 名前を付ける：\_r1・obj\_r2・ctx\_r4

📄 `angular/packages/compiler/src/template/pipeline/src/phases/naming.ts` L167–205 （▶ の行: 169, 171, 177, 183, 185–186, 188, 193, 200）

```ts
167 │   // Having named all variables declared in the view, now we can push those names into the
168 │   // `ir.ReadVariableExpr` expressions which represent reads of those variables.
169 ▶   for (const op of unit.ops()) {
170 │     ir.visitExpressionsInOp(op, (expr) => {
171 ▶       if (!(expr instanceof ir.ReadVariableExpr) || expr.name !== null) {
172 │         return;
173 │       }
174 │       if (!varNames.has(expr.xref)) {
175 │         throw new Error(`Variable ${expr.xref} not yet named`);
176 │       }
177 ▶       expr.name = varNames.get(expr.xref)!;
178 │     });
179 │   }
180 │ }
181 │ 
182 │ function getVariableName(variable: ir.SemanticVariable, state: {index: number}): string {
183 ▶   if (variable.name === null) {
184 │     switch (variable.kind) {
185 ▶       case ir.SemanticVariableKind.Context:
186 ▶         variable.name = `ctx_r${state.index++}`;
187 │         break;
188 ▶       case ir.SemanticVariableKind.Identifier:
189 │         // TODO: Prefix increment and `_r` are for compatibility with the old naming scheme.
190 │         // This has the potential to cause collisions when `ctx` is the identifier, so we need a
191 │         // special check for that as well.
192 │         const compatPrefix = variable.identifier === CONTEXT_NAME ? 'i' : '';
193 ▶         variable.name = `${variable.identifier}_${compatPrefix}r${++state.index}`;
194 │         break;
195 │       case ir.SemanticVariableKind.BoundaryState:
196 │         variable.name = `bnd_r${++state.index}`;
197 │         break;
198 │       default:
199 │         // TODO: Prefix increment for compatibility only.
200 ▶         variable.name = `_r${++state.index}`;
201 │         break;
202 │     }
203 │   }
204 │   return variable.name;
205 │ }
```

名前は 65 番目のフェーズで付きます。183 行目、まだ名前の無い変数にだけ付けます（同じ変数オブジェクトを複数のビューが共有するので、2 回目は同じ名前を使う）。186 行目の `Context` は `ctx_r` + 番号（後置インクリメント）、193 行目の `Identifier` は `識別子_r` + 番号（前置インクリメント）、200 行目のそれ以外（`SavedView` など）は `_r` + 番号。番号はコンポーネント全体で 1 本のカウンタです。最後に 169〜179 行目で、各 `ReadVariableExpr` の `name` に変数の名前を書き込みます（[第 11 回](11-compiler-ir.md)で `null` だったフィールド）。

最後に reify が IR の式を命令の呼び出しにします。`RestoreViewExpr` → `ɵɵrestoreView(_r1)`、`ResetViewExpr` → `ɵɵresetView(…)`、`GetCurrentViewExpr` → `ɵɵgetCurrentView()`、変数の読みは付けた名前の `o.variable` です。`RestoreViewExpr` の引数がまだ XrefId のまま（6 節の 132 行目で変数に結ばれていない）なら reify は例外を投げます（reify.ts の `reifyIrExpression`。[第 16 回](16-compiler-reify-emit.md)）。

## 9. ネストした例：nextContext(2) ができるまで

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_template/nested_template_context.ts` L3–22 （▶ の行: 6–10）

```ts
 3 │ @Component({
 4 │     selector: 'my-component',
 5 │     template: `
 6 ▶     <ul *ngFor="let outer of items">
 7 ▶       <li *ngFor="let middle of outer.items">
 8 ▶         <div *ngFor="let inner of items"
 9 ▶              (click)="onClick(outer, middle, inner)"
10 ▶              [title]="format(outer, middle, inner, component)"
11 │              >
12 │           {{format(outer, middle, inner, component)}}
13 │         </div>
14 │       </li>
15 │     </ul>`,
16 │     standalone: false
17 │ })
18 │ export class MyComponent {
19 │   component = this;
20 │   format(outer: any, middle: any, inner: any) {}
21 │   onClick(outer: any, middle: any, inner: any) {}
22 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_template/nested_template_context.js` L27–51 （▶ の行: 27, 33–34, 36, 47）

```js
27 ▶   function MyComponent_ul_0_li_1_Template(rf, ctx) {
28 │ 	if (rf & 1) {
29 │ 	  $i0$.ɵɵelementStart(0, "li");
30 │ 	  $i0$.ɵɵtemplate(1, MyComponent_ul_0_li_1_div_1_Template, 2, 2, "div", 1);
31 │ 	  $i0$.ɵɵelementEnd();
32 │ 	}
33 ▶ 	if (rf & 2) {
34 ▶ 	  const $myComp2$ = $i0$.ɵɵnextContext(2);
35 │ 	  $r3$.ɵɵadvance();
36 ▶ 	  $i0$.ɵɵproperty("ngForOf", $myComp2$.items);
37 │ 	}
38 │   }
39 │ 
40 │   function MyComponent_ul_0_Template(rf, ctx) {
41 │ 	if (rf & 1) {
42 │ 	  $i0$.ɵɵelementStart(0, "ul");
43 │ 	  $i0$.ɵɵtemplate(1, MyComponent_ul_0_li_1_Template, 2, 1, "li", 0);
44 │ 	  $i0$.ɵɵelementEnd();
45 │ 	}
46 │ 	if (rf & 2) {
47 ▶ 	  const $outer2$ = ctx.$implicit;
48 │ 	  $r3$.ɵɵadvance();
49 │ 	  $i0$.ɵɵproperty("ngForOf", $outer2$.items);
50 │ 	}
51 │   }
```

`*ngFor` が 3 段（`ul` → `li` → `div`）。真ん中の `li` のビューの更新ブロックでは、使うのは 36 行目の `items`（コンポーネントのプロパティ）だけです。4 節の規則で、このビューの更新ブロックの先頭にはまず次の 4 つが宣言されます。

1. **宣言直後**

   `middle = ctx.$implicit`、`cUl = nextContext()`、`outer = cUl.$implicit`、`cRoot = nextContext()`、そして `property('ngForOf', cRoot.items)`。
2. **後ろから：cRoot は使われている**

   使われているので残り、初期化子の `nextContext` はカーソルを読むので 250・251 行目で `contextIsUsed = true`。
3. **outer は未使用・フェンスなし → 消える**

   240 行目。これで `cUl` の使用回数も 0 になります（239 行目の数え直し）。
4. **cUl は未使用だが、カーソルを書き換え、後ろで読まれる → 文として残る**

   221 行目の条件が真になり、230〜232 行目で `nextContext();` という式の文に置き換わります。親の親へ行くには、この 1 歩目を飛ばせないからです。
5. **middle は未使用 → 消える**

   結果は `nextContext(); var cRoot = nextContext();`。`cRoot` は Context 変数で、埋め込み先が変数でない（property の op）ので埋め込まれません（560 行目）。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/next_context_merging.ts` L47–66 （▶ の行: 50–53, 58, 63–64）

```ts
47 │ function mergeNextContextsInOps(ops: ir.OpList<ir.CreateOp | ir.UpdateOp>): void {
48 │   for (const op of ops) {
49 │     // Look for a candidate operation to maybe merge.
50 ▶     if (
51 ▶       op.kind !== ir.OpKind.Statement ||
52 ▶       !(op.statement instanceof o.ExpressionStatement) ||
53 ▶       !(op.statement.expr instanceof ir.NextContextExpr)
54 │     ) {
55 │       continue;
56 │     }
57 │ 
58 ▶     const mergeSteps = op.statement.expr.steps;
59 │ 
60 │     // Try to merge this `ir.NextContextExpr`.
61 │     let tryToMerge = true;
62 │     for (
63 ▶       let candidate = op.next!;
64 ▶       candidate.kind !== ir.OpKind.ListEnd && tryToMerge;
65 │       candidate = candidate.next!
66 │     ) {
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/next_context_merging.ts` L67–99 （▶ の行: 77, 83, 85–86, 89–91, 93）

```ts
67 │       ir.visitExpressionsInOp(candidate, (expr, flags) => {
68 │         if (!ir.isIrExpression(expr)) {
69 │           return expr;
70 │         }
71 │ 
72 │         if (!tryToMerge) {
73 │           // Either we've already merged, or failed to merge.
74 │           return;
75 │         }
76 │ 
77 ▶         if (flags & ir.VisitorContextFlag.InChildOperation) {
78 │           // We cannot merge into child operations.
79 │           return;
80 │         }
81 │ 
82 │         switch (expr.kind) {
83 ▶           case ir.ExpressionKind.NextContext:
84 │             // Merge the previous `ir.NextContextExpr` into this one.
85 ▶             expr.steps += mergeSteps;
86 ▶             ir.OpList.remove(op as ir.CreateOp | ir.UpdateOp);
87 │             tryToMerge = false;
88 │             break;
89 ▶           case ir.ExpressionKind.GetCurrentView:
90 ▶           case ir.ExpressionKind.Reference:
91 ▶           case ir.ExpressionKind.ContextLetReference:
92 │             // Can't merge past a dependency on the context.
93 ▶             tryToMerge = false;
94 │             break;
95 │         }
96 │         return;
97 │       });
98 │     }
99 │   }
```

67 番目の `mergeNextContextExpressions` が仕上げます。50〜53 行目、「`nextContext()` だけの式の文」を見つけ、63〜66 行目でその後ろの op を順に見ます。83〜86 行目、次の `NextContextExpr` に出会ったら、その `steps` に自分の歩数を足し（85 行目）、自分を消します（86 行目）。間にカーソルに依存する式（89〜91 行目の `getCurrentView`・`reference` など）があれば、途中の位置が要るのでまとめません。77 行目、ハンドラの中など子の op の中には入りません。こうして fixture 34 行目の `ɵɵnextContext(2)` ができます（`steps` が 1 なら引数なしの `ɵɵnextContext()`。命令の組み立ては[第 12 回](12-compiler-slots-vars.md)で引用した instruction.ts の `nextContext`）。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_template/nested_template_context.js` L1–25 （▶ の行: 3, 6–10, 17–20）

```js
 1 │ function MyComponent_ul_0_li_1_div_1_Template(rf, ctx) {
 2 │ 	if (rf & 1) {
 3 ▶ 	  const $s$ = $i0$.ɵɵgetCurrentView();
 4 │ 	  $i0$.ɵɵelementStart(0, "div", 2);
 5 │ 	  $i0$.ɵɵlistener("click", function MyComponent_ul_0_li_1_div_1_Template_div_click_0_listener(){
 6 ▶ 		const $inner$ = $i0$.ɵɵrestoreView($s$).$implicit;
 7 ▶ 		const $middle$ = $i0$.ɵɵnextContext().$implicit;
 8 ▶ 		const $outer$ = $i0$.ɵɵnextContext().$implicit;
 9 ▶ 		const $myComp$ = $i0$.ɵɵnextContext();
10 ▶ 		return $i0$.ɵɵresetView($myComp$.onClick($outer$, $middle$, $inner$));
11 │ 	  });
12 │ 	  $i0$.ɵɵtext(1);
13 │ 	  $i0$.ɵɵelementEnd();
14 │ 	}
15 │ 
16 │ 	if (rf & 2) {
17 ▶ 	  const $inner1$ = ctx.$implicit;
18 ▶ 	  const $middle1$ = $i0$.ɵɵnextContext().$implicit;
19 ▶ 	  const $outer1$ = $i0$.ɵɵnextContext().$implicit;
20 ▶ 	  const $myComp1$ = $i0$.ɵɵnextContext();
21 │ 	  $i0$.ɵɵproperty("title", $myComp1$.format($outer1$, $middle1$, $inner1$, $myComp1$.component));
22 │ 	  $r3$.ɵɵadvance();
23 │ 	  $i0$.ɵɵtextInterpolate1(" ", $myComp1$.format($outer1$, $middle1$, $inner1$, $myComp1$.component), " ");
24 │ 	}
25 │   }
```

一番内側の `div` のビューです。リスナー（5〜11 行目）は 6 行目で自分のビューを戻し、7〜9 行目で `ɵɵnextContext()` を 1 段ずつ呼んで `middle`・`outer`・コンポーネントを取ります。ここでは 3 段とも値が使われるので、どの nextContext も消えず、文だけの nextContext も生まれないのでまとめられません。更新ブロック（17〜20 行目）は、自分のビューのコンテキストが引数の `ctx` なので 17 行目は `ctx.$implicit`、残りは同じく nextContext を 1 段ずつです。7 行目の `middle` は、`Context` 変数 `nextContext()` を Identifier 変数の初期化子に埋め込んだ形（560 行目）です。

## ここまでの流れ

- 👤 `<ng-template let-obj><button (click)="obj.value = 1">` — あなたのテンプレート
  - `ingest`：`contextVariables.set('obj', '$implicit')`、`return LexicalRead(obj).value = 1` — ingest.ts — *第 10 回*
  - `generateVariables`（29）：`var obj = Context(子).$implicit`、`var c0 = nextContext()` — generate\_variables.ts L73 / L286 / L303
  - `saveAndRestoreView`（31）：`var _r = getCurrentView()`、`var c = restoreView(子)`、`return resetView(…)` — save\_restore\_view.ts L36 / L90 / L103
  - `resolveNames`（37）：`LexicalRead(obj)` → 変数 obj の読み、`RestoreView(子)` → `RestoreView(_r)` — resolve\_names.ts L120 / L132
  - `resolveContexts`（41）：`Context(子)` → `c` — resolve\_contexts.ts L45 / L78
  - `optimizeVariables`（47）：`c0` を消す、`c` を obj に埋め込む — variable\_optimization.ts L240 / L560
  - `nameFunctionsAndVariables`（65）：`_r1`、`obj_r2` — naming.ts L193 / L200
  - `reify`（73） — reify.ts reifyIrExpression — *第 16 回*
- 👤 `const obj_r2 = ɵɵrestoreView(_r1).$implicit; return ɵɵresetView(obj_r2.value = 1);` — 出力

## 聞かれそうな質問

**Q. 出力の ctx は何を指していますか？**

そのテンプレート関数が描くビューのコンテキストです（resolve\_contexts.ts 38 行目）。コンポーネントのテンプレート関数ならコンポーネントのインスタンス、`<ng-template let-obj>` の関数なら `{ $implicit: … }` のような子ビューのコンテキストです。だから子ビューの中でコンポーネントのプロパティを読むときは、`ctx.x` ではなく `ɵɵnextContext()` で根まで上がった変数（`ctx_r4.x` など）を使います。名前が似ている `ctx_r4` は naming.ts 186 行目が付けた「Context 変数」の名前で、引数の `ctx` とは別物です。

**Q. ɵɵnextContext(2) の 2 は何ですか？**

何段外のビューへ上がるかです。generate\_variables.ts 282〜289 行目は親のスコープ 1 つにつき `nextContext()` 1 回分の変数を作り、途中の段の変数が使われないと variable\_optimization.ts 230〜232 行目で式の文だけになり、next\_context\_merging.ts 85・86 行目で次の nextContext に歩数を足して消えます。`li` のビューから根のコンポーネントへは 2 段なので `ɵɵnextContext(2)` です。間にカーソルに依存する式があればまとめません（89〜93 行目）。

**Q. リスナーではなぜ restoreView が要るのですか？**

ハンドラはテンプレート関数の実行が終わった後、イベントのときに呼ばれるので、実行時の「今見ているビュー」のカーソル（`lFrame.contextLView`）がこのビューを指していないからです。`ɵɵrestoreView` は作成時に `ɵɵgetCurrentView()` で保存しておいた LView をカーソルに戻し（state.ts 364 行目）、そのコンテキストを返します（365 行目）。これがあるので、ハンドラの中の `ɵɵnextContext()` が正しいビューから親へたどれます。`ɵɵresetView` はカーソルを `null` に戻すだけで（375 行目）、戻り値はそのまま返します（376 行目）。カーソルの仕組みそのものは [LFrame の章](../ivy/15-ivy-lframe.md)で読めます。

**Q. コンポーネント直下のボタンの (click) に restoreView が出ないのはなぜですか？**

save\_restore\_view.ts 62 行目で、根のビューは「必ず要る」から外れているからです。根のビューのハンドラが読むのはコンポーネントのプロパティだけで、それはハンドラを包む関数の `ctx`（コンポーネント）から読めるので、カーソルを戻す必要がありません。ただし `#ref` や `@let` を読む場合は、`ɵɵreference` がカーソルの指す LView から値を取る（storage.ts 23・24 行目）ので、save\_restore\_view.ts 64〜71 行目で根のビューでも restoreView が入ります。

**Q. テンプレートの名前が、コンポーネントのフィールドなのか let 変数なのかはどこで決まりますか？**

resolve\_names.ts 116〜124 行目です。同じビュー内の定義（116 行目）、外側まで含めたスコープの変数（118 行目）の順に探し、どちらにも無ければ 123 行目でコンポーネントのプロパティ読みにします。スコープは generate\_variables.ts が近いビューから順に変数を並べ、resolve\_names.ts 58・59 行目で先に登録した名前を優先するので、内側の `let-x` が外側の同名の変数やフィールドを隠します。

## 読み終えて

- ingest は「テンプレート変数名 → コンテキストのプロパティ名」の表と `LexicalReadExpr` を残すだけ。変数は generateVariables が親ビューの分まで**全部**宣言する
- 子ビューのリスナーには saveAndRestoreView が `getCurrentView` / `restoreView` / `resetView` を無条件に足す。実行時のカーソル `contextLView` を戻すため
- resolveNames が名前を変数かコンポーネントのプロパティに、resolveContexts がビューのコンテキストを `ctx` か変数に決める
- optimizeVariables がフェンスを見ながら不要な変数を消し、残った途中の `nextContext()` を mergeNextContextExpressions が `nextContext(n)` にまとめる
- `_r1`・`obj_r2`・`ctx_r4` は naming.ts の 1 本のカウンタで付く名前。fixture の `$…$` はその名前に一致するプレースホルダ

---

← 前: [decls・vars・advance()：slot の割り当てとバインディングの数え方](12-compiler-slots-vars.md)  
次: [定数配列と pure function：consts・AttributeMarker・ɵɵpureFunction](14-compiler-consts-pure.md) →
