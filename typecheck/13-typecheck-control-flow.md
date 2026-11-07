[目次](../README.md) › [テンプレート型チェックの内側](README.md) › 第 13 回 / 全 20 回

# @if・@for・@switch・@let の型の絞り込み

> @if の as の別名を if の前の var にする行、@for の $index などの暗黙の変数（null! as number）と track の式、@switch の case と、リスナーの中に再掲するガード（=== と、default なら他の全部の !==）、@default never を never への代入にする行、@let を TCB の const にする行。checkControlFlowBodies を見るブロックと見ないブロック（@defer の中身は常に検査）、@defer の trigger、22.2 の keyed defer と @boundary。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-control-flow)

---

`@if (user) { … }` の中で `user` の `null` が外れるのは、TCB の中で `@if` が本物の `if` 文になり、TypeScript 自身が絞り込むからでした（[テンプレートコンパイラ第 17 回](../compiler/17-compiler-typecheck.md)）。この章ではその続きとして、`as` の別名の変数、`@for` の `$index` などの暗黙の変数と `track` の式、`@switch` の `case` とリスナーの中の絞り込みと `@default never`、`@let` を `const` にする行、`@defer` の中身と trigger、新しい `@boundary` を、TcbOp の 1 行ずつで読みます。「どのブロックが `checkControlFlowBodies` を見ていて、どれが見ていないか」も実物で確かめます。

読む対象は `packages/compiler/src/typecheck/ops/` の `switch_block.ts`・`let.ts`・`intersection_observer.ts`・`boundary.ts`・`variables.ts`（ブロックの変数の 2 つ）と、`scope.ts` のうちブロックと `@defer` を足す部分、テストは `type_check_block_spec.ts` と `diagnostics_spec.ts` です。

1. [1. 全体像](01-typecheck-overview.md)
2. [2. 設定](02-typecheck-config.md)
3. [3. TCB の置き場所](03-typecheck-context.md)
4. [4. 派生プログラム](04-typecheck-program-driver.md)
5. [5. Environment](05-typecheck-environment.md)
6. [6. Scope と TcbOp](06-typecheck-scope.md)
7. [7. 式](07-typecheck-expressions.md)
8. [8. 要素と DOM](08-typecheck-elements-dom.md)
9. [9. 型コンストラクタ](09-typecheck-type-constructor.md)
10. [10. 入力](10-typecheck-inputs.md)
11. [11. 出力とイベント](11-typecheck-outputs-events.md)
12. [12. 双方向](12-typecheck-two-way.md)
13. **13. 制御フロー**（この章）
14. [14. ng-template のガード](14-typecheck-template-guards.md)
15. [15. 参照と pipe](15-typecheck-refs-pipes.md)
16. [16. 診断の対応付け](16-typecheck-diagnostics-mapping.md)
17. [17. 帯域外の診断](17-typecheck-oob.md)
18. [18. 拡張診断](18-typecheck-extended.md)
19. [19. TemplateTypeChecker](19-typecheck-template-type-checker.md)
20. [20. issue と PR を読む](20-typecheck-issues.md)

## 1. ブロックごとの op と、本体を検査するかどうか

`Scope.appendNode` がテンプレートのノードの種類ごとに TcbOp（TCB の文を 1 つ作る小さな係。[第 6 回](06-typecheck-scope.md)）を積む行は、既に[第 17 回](../compiler/17-compiler-typecheck.md)で引用されています（scope.ts の `appendNode`）。そこで積まれる op と、その op が `checkControlFlowBodies`（`strictTemplates` が偽なら偽になる設定。[第 2 回](02-typecheck-config.md)）を見るかを先に表にします。行番号は、この章の引用と第 17 回の引用のものです。

| ブロック | op（ファイル） | TCB の形 | `checkControlFlowBodies` が偽なら |
| --- | --- | --- | --- |
| `@if` | `TcbIfBlockOp`（if\_block.ts） | `if (…) {} else if (…) {}` | 条件は残り、本体が空（if\_block.ts の `getBranchScope`。第 17 回で引用済み） |
| `@for` | `TcbForOfOp`（for\_block.ts） | `for (const _t1 of …!) {}` | 本体と `@empty` が消え、`track` は残る（3 節） |
| `@switch` | `TcbSwitchOp`（switch\_block.ts） | `switch (…) { case …: }` | `case` は残り、本体が空（4 節の 37・41 行目） |
| `@let` | `TcbLetDeclarationOp`（let.ts） | `const _t1 = (…)` | 関係しない（ブロックではない） |
| `@defer` | op は無い。`appendDeferredBlock`（scope.ts） | 中身をそのまま同じ Scope に並べる | **見ない。中身は常に検査される**（6 節） |
| `@boundary` | `TcbBoundaryOp`（boundary.ts、22.1.6 には無い） | `try {} catch (err) {}` | 本体が空（7 節の 33・39 行目） |

## 2. @if の as：別名は if の外で宣言される

`@if` の本体の書き方（`if` 文・`as` の条件 `(式) && _t1`・リスナーのための「前の条件の否定」）は第 17 回で読みました。ここでは、別名の変数そのものを宣言する所を足します。

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L217–230 （▶ の行: 217, 219–220, 223, 226）

```ts
217 ▶     } else if (scopedNode instanceof IfBlockBranch) {
218 │       const {expression, expressionAlias} = scopedNode;
219 ▶       if (expression !== null && expressionAlias !== null) {
220 ▶         Scope.registerVariable(
221 │           scope,
222 │           expressionAlias,
223 ▶           new TcbBlockVariableOp(
224 │             tcb,
225 │             scope,
226 ▶             tcbExpression(expression, tcb, scope),
227 │             expressionAlias,
228 │           ),
229 │         );
230 │       }
```
*Scope.forNodes の中。分岐（IfBlockBranch）ごとの Scope を作るとき*

📄 `angular/packages/compiler/src/typecheck/ops/variables.ts` L85–113 （▶ の行: 100–101, 105, 107–108, 110）

```ts
 85 │ /**
 86 │  * A `TcbOp` which renders a variable defined inside of block syntax (e.g. `@if (expr; as var) {}`).
 87 │  *
 88 │  * Executing this operation returns the identifier which can be used to refer to the variable.
 89 │  */
 90 │ export class TcbBlockVariableOp extends TcbOp {
 91 │   constructor(
 92 │     private tcb: Context,
 93 │     private scope: Scope,
 94 │     private initializer: TcbExpr,
 95 │     private variable: Variable,
 96 │   ) {
 97 │     super();
 98 │   }
 99 │ 
100 ▶   override get optional() {
101 ▶     return false;
102 │   }
103 │ 
104 │   override execute(): TcbExpr {
105 ▶     const id = new TcbExpr(this.tcb.allocateId());
106 │     id.addParseSpanInfo(this.variable.keySpan);
107 ▶     this.initializer.wrapForTypeChecker();
108 ▶     const variable = new TcbExpr(`var ${id.print()} = ${this.initializer.print()}`);
109 │     variable.addParseSpanInfo(this.variable.sourceSpan);
110 ▶     this.scope.addStatement(variable);
111 │     return id;
112 │   }
113 │ }
```

1. **217〜219 行目：`as` が付いた分岐だけ**

   `expressionAlias` は `@if (式; as 名前)` の名前（R3 AST の `Variable`）です。付いていなければ何もしません。
2. **220〜229 行目：別名を `TcbBlockVariableOp` として登録**

   226 行目、初期値は条件の式そのもの（`tcbExpression` で TCB の式にしたもの）です。`registerVariable` は op を積み、その番号を `varMap` に覚えるだけなので、テンプレートが `addr` を読んだときに引けるようになります。
3. **100〜102 行目と 108 行目：必ず `var _tN = (式)` を書く**

   `optional` が偽なので、別名を誰も読まなくても宣言は出ます。107 行目で式を括弧で包み（位置のコメントが式全体に付くように）、108 行目で `var` の文にします。110 行目で文を足す先の `this.scope` は、if\_block.ts の `generateBranch` が条件のためだけに作る「分岐の外側の Scope」です。`generateBranch` はその Scope の文を `if` 文より前に移すので（第 17 回で引用済みの範囲）、`var` は `if` の前に出ます（下のテストの期待値）。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L2033–2058 （▶ の行: 2041–2042, 2054–2056）

```ts
2033 │     it('should generate an else if block with an `as` expression', () => {
2034 │       const TEMPLATE = `@if (expr === 1) {
2035 │         {{expr}}
2036 │       } @else if (expr === 2; as alias) {
2037 │         {{alias}}
2038 │       }`;
2039 │ 
2040 │       expect(tcb(TEMPLATE)).toContain(
2041 ▶         'var _t1 = ((((this).expr)) === (2)); if ((((this).expr)) === (1)) { "" + (((this).expr)); } ' +
2042 ▶           'else if (((((this).expr)) === (2)) && _t1) { "" + (_t1); }',
2043 │       );
2044 │     });
2045 │ 
2046 │     it('should generate block where `@if` and `@else if` have the same alias name', () => {
2047 │       const TEMPLATE = `@if (expr === 1; as alias) {
2048 │         {{alias}}
2049 │       } @else if (expr === 2; as alias) {
2050 │         {{alias}}
2051 │       }`;
2052 │ 
2053 │       expect(tcb(TEMPLATE)).toContain(
2054 ▶         'var _t1 = ((((this).expr)) === (1)); var _t2 = ((((this).expr)) === (2)); ' +
2055 ▶           'if (((((this).expr)) === (1)) && _t1) { "" + (_t1); } ' +
2056 ▶           'else if (((((this).expr)) === (2)) && _t2) { "" + (_t2); }',
2057 │       );
2058 │     });
```

2041〜2042 行目、`var _t1 = …` は `if` の前にあり、`else if` の条件は `(expr === 2) && _t1` です。`_t1` の宣言の型は `boolean` ですが、`&& _t1` の右側を通った本体の中では TypeScript が `true` に絞ります。2054〜2056 行目、`@if` と `@else if` が同じ名前 `alias` を使っても、変数は `_t1` と `_t2` に分かれます。TCB の変数名はテンプレートの名前ではなく、`allocateId()` の連番（105 行目）だからです。

> [!NOTE]
> **ポイント**
>
> リスナーの中の再掲のガード（`!(前の条件) && この条件`）は if\_block.ts の `generateBranchGuard` で、第 17 回で引用済みです。この章のデモの「@if の as と @else if」で、`(click)` のアロー関数の中に `!(user.address && _t1) && (fallback && _t2)` が出るのを見られます。

## 3. @for の $index・$first：型を決め打ちした変数

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L159–168 （▶ の行: 161, 165–166）

```ts
159 │   private static getForLoopContextVariableTypes() {
160 │     return new Map<string, string>([
161 ▶       ['$first', 'boolean'],
162 │       ['$last', 'boolean'],
163 │       ['$even', 'boolean'],
164 │       ['$odd', 'boolean'],
165 ▶       ['$index', 'number'],
166 ▶       ['$count', 'number'],
167 │     ]);
168 │   }
```

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L247–267 （▶ の行: 250–252, 257–258, 261, 265）

```ts
247 │     } else if (scopedNode instanceof ForLoopBlock) {
248 │       // Register the variable for the loop so it can be resolved by
249 │       // children. It'll be declared once the loop is created.
250 ▶       const loopInitializer = new TcbExpr(tcb.allocateId());
251 ▶       loopInitializer.addParseSpanInfo(scopedNode.item.sourceSpan);
252 ▶       scope.varMap.set(scopedNode.item, loopInitializer);
253 │ 
254 │       const forLoopContextVariableTypes = Scope.getForLoopContextVariableTypes();
255 │ 
256 │       for (const variable of scopedNode.contextVariables) {
257 ▶         if (!forLoopContextVariableTypes.has(variable.value)) {
258 ▶           throw new Error(`Unrecognized for loop context variable ${variable.name}`);
259 │         }
260 │ 
261 ▶         const type = new TcbExpr(forLoopContextVariableTypes.get(variable.value)!);
262 │         Scope.registerVariable(
263 │           scope,
264 │           variable,
265 ▶           new TcbBlockImplicitVariableOp(tcb, scope, type, variable),
266 │         );
267 │       }
```

📄 `angular/packages/compiler/src/typecheck/ops/variables.ts` L15–41 （▶ の行: 31, 34, 36, 38）

```ts
15 │ /**
16 │  * A `TcbOp` which renders a variable that is implicitly available within a block (e.g. `$count`
17 │  * in a `@for` block).
18 │  *
19 │  * Executing this operation returns the identifier which can be used to refer to the variable.
20 │  */
21 │ export class TcbBlockImplicitVariableOp extends TcbOp {
22 │   constructor(
23 │     private tcb: Context,
24 │     private scope: Scope,
25 │     private type: TcbExpr,
26 │     private variable: Variable,
27 │   ) {
28 │     super();
29 │   }
30 │ 
31 ▶   override readonly optional = true;
32 │ 
33 │   override execute(): TcbExpr {
34 ▶     const id = new TcbExpr(this.tcb.allocateId());
35 │     id.addParseSpanInfo(this.variable.keySpan);
36 ▶     const variable = declareVariable(id, this.type);
37 │     variable.addParseSpanInfo(this.variable.sourceSpan);
38 ▶     this.scope.addStatement(variable);
39 │     return id;
40 │   }
41 │ }
```

1. **250〜252 行目：ループの変数 `item` は op にしない**

   `item` には ID だけを取り、`varMap` に **式そのもの**を入れます（op の番号ではなく）。宣言は `TcbForOfOp` が `for (const _t1 of …)` の `_t1` として書くので（for\_block.ts、第 17 回で引用済み）、ここで `var` を書くと二重になるからです。
2. **256〜266 行目：`$index` などは 1 つずつ `TcbBlockImplicitVariableOp` に**

   `contextVariables` には、テンプレートが書いた別名（`let i = $index` の `i`）も含め、パーサが作った変数が並びます。261 行目、型は 161〜166 行目の表から文字列で引きます。`$index` と `$count` は `number`、残りの 4 つは `boolean`。257〜258 行目、表に無い名前は例外です（パーサが先に弾いているので、ふつうは来ません）。
3. **31・36 行目：読まれたときだけ `var _t2 = null! as number`**

   `optional = true` なので、テンプレートが `$index` を読まなければ宣言は出ません。36 行目の `declareVariable` は「値は無いが型だけ持つ変数」を作る係で、`null! as number` の後ろに `/*T:VAE*/`（変数を式として宣言した印。[第 16 回](16-typecheck-diagnostics-mapping.md)）を付けます。`$index` の値そのものは TCB では計算しません。型が分かれば十分だからです。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L2356–2372 （▶ の行: 2359, 2365–2366, 2370–2371）

```ts
2356 │     it('should generate a for block with implicit variables', () => {
2357 │       const TEMPLATE = `
2358 │         @for (item of items; track item) {
2359 ▶           {{$index}} {{$first}} {{$last}} {{$even}} {{$odd}} {{$count}}
2360 │         }
2361 │       `;
2362 │ 
2363 │       const result = tcb(TEMPLATE);
2364 │       expect(result).toContain('for (const _t1 of ((this).items)!) {');
2365 ▶       expect(result).toContain('var _t2 = null! as number;');
2366 ▶       expect(result).toContain('var _t3 = null! as boolean;');
2367 │       expect(result).toContain('var _t4 = null! as boolean;');
2368 │       expect(result).toContain('var _t5 = null! as boolean;');
2369 │       expect(result).toContain('var _t6 = null! as boolean;');
2370 ▶       expect(result).toContain('var _t7 = null! as number;');
2371 ▶       expect(result).toContain('"" + (_t2) + (_t3) + (_t4) + (_t5) + (_t6) + (_t7)');
2372 │     });
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L2422–2441 （▶ の行: 2423, 2425, 2437–2440）

```ts
2422 │     it('should generate the tracking expression of a for loop', () => {
2423 ▶       const result = tcb(`@for (item of items; track trackingFn($index, item, prop)) {}`);
2424 │       expect(result).toContain('for (const _t1 of ((this).items)!) { var _t2 = null! as number;');
2425 ▶       expect(result).toContain('(this).trackingFn(_t2, _t1, ((this).prop));');
2426 │     });
2427 │ 
2428 │     it('should not generate the body of a for block when checkControlFlowBodies is disabled', () => {
2429 │       const TEMPLATE = `
2430 │             @for (item of items; track item) {
2431 │               {{main(item)}}
2432 │             } @empty {
2433 │               {{empty()}}
2434 │             }
2435 │           `;
2436 │ 
2437 ▶       const result = tcb(TEMPLATE, undefined, {checkControlFlowBodies: false});
2438 ▶       expect(result).toContain('for (const _t1 of ((this).items)!) {');
2439 ▶       expect(result).not.toContain('.main');
2440 ▶       expect(result).not.toContain('.empty');
2441 │     });
```

2365〜2370 行目、6 つの暗黙の変数が `_t2`〜`_t7` の 2 種類の型で宣言され、2371 行目の補間はそれを読みます。2423〜2425 行目、`track trackingFn($index, item, prop)` は `(this).trackingFn(_t2, _t1, ((this).prop))` になります。`track` の式の中で `$index` と `item` 以外のテンプレートの変数を読むと Angular 独自の診断になる仕組み（`TcbForLoopTrackTranslator`）は第 17 回で引用済みで、診断の中身は[第 17 回（帯域外の診断）](17-typecheck-oob.md)で読みます。2437〜2440 行目、`checkControlFlowBodies: false` でもループの頭は残り、本体と `@empty` が消えます。デモで試すと、`track` の式（`((_t1).id);`）も残ります。

## 4. @switch：TypeScript の switch 文と、リスナーのためのガード

📄 `angular/packages/compiler/src/typecheck/ops/switch_block.ts` L34–60 （▶ の行: 35, 37–38, 41–42, 45, 49, 55–56）

```ts
34 │   override execute(): null {
35 ▶     const switchExpression = tcbExpression(this.block.expression, this.tcb, this.scope);
36 │     const clauses = this.block.groups.flatMap<TcbExpr>((current) => {
37 ▶       const checkBody = this.tcb.env.config.checkControlFlowBodies;
38 ▶       const clauseScope = this.scope.createChildScope(
39 │         this.scope,
40 │         null,
41 ▶         checkBody ? current.children : [],
42 ▶         checkBody ? this.generateGuard(current, switchExpression) : null,
43 │       );
44 │ 
45 ▶       const statements = [...clauseScope.render(), new TcbExpr('break')];
46 │ 
47 │       return current.cases.map((switchCase, index) => {
48 │         const statementsStr = getStatementsBlock(
49 ▶           index === current.cases.length - 1 ? statements : [],
50 │           true /* singleLine */,
51 │         );
52 │ 
53 │         const source =
54 │           switchCase.expression === null
55 ▶             ? `default: ${statementsStr}`
56 ▶             : `case ${tcbExpression(switchCase.expression, this.tcb, this.scope).print()}: ${statementsStr}`;
57 │ 
58 │         return new TcbExpr(source);
59 │       });
60 │     });
```

1. **35 行目：`@switch (式)` の式を 1 回だけ訳す**

   この `switchExpression` は `switch (…)` の頭と、42 行目のガードの両方に使われます。
2. **38〜43 行目：`case` のまとまり（group）ごとに子の Scope**

   `@case (1) @case (2) { … }` のように本体の無い `@case` が続くと、1 つの group になります。41 行目、`checkControlFlowBodies` が偽なら子ノードは空。42 行目の 4 番目の引数がガードで、子の Scope の `guard` に入ります。
3. **45・49 行目：本体は group の最後の `case` にだけ書く**

   45 行目で本体の文の後ろに `break` を足し、49 行目で「group の最後の `case` だけが本体を持ち、それ以外は空」にします。TypeScript の `switch` の fall-through（`break` の無い `case` が次へ落ちる）で、`case 1: case 2: 本体; break;` と同じ形になります。
4. **55〜56 行目：`default:` か `case 式:`**

   TypeScript の `switch` の中では、`case "circle":` の下で `shape.kind === "circle"` に当たる絞り込みが効きます。`@if` と同じく、Angular は TypeScript が絞れる形を書いているだけです。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L2081–2101 （▶ の行: 2097–2100）

```ts
2081 │     it('should generate a switch block', () => {
2082 │       const TEMPLATE = `
2083 │         @switch (expr) {
2084 │           @case (1) {
2085 │             {{one()}}
2086 │           }
2087 │           @case (2) {
2088 │             {{two()}}
2089 │           }
2090 │           @default {
2091 │             {{default()}}
2092 │           }
2093 │         }
2094 │       `;
2095 │ 
2096 │       expect(tcb(TEMPLATE)).toContain(
2097 ▶         'switch (((this).expr)) { ' +
2098 ▶           'case 1: "" + ((this).one()); break; ' +
2099 ▶           'case 2: "" + ((this).two()); break; ' +
2100 ▶           'default: "" + ((this).default()); break; }',
2101 │       );
```

### リスナーの中は 42 行目のガードで絞り直す

📄 `angular/packages/compiler/src/typecheck/ops/switch_block.ts` L85–109 （▶ の行: 88, 90, 96–98, 103）

```ts
 85 │   private generateGuard(group: SwitchBlockCaseGroup, switchValue: TcbExpr): TcbExpr | null {
 86 │     // For non-default cases, the guard needs to compare against the case value, e.g.
 87 │     // `switchExpression === caseExpression`.
 88 ▶     const hasDefault = group.cases.some((c) => c.expression === null);
 89 │ 
 90 ▶     if (!hasDefault) {
 91 │       let guard: TcbExpr | null = null;
 92 │ 
 93 │       for (const switchCase of group.cases) {
 94 │         if (switchCase.expression !== null) {
 95 │           // The expression needs to be ignored for diagnostics since it has been checked already.
 96 ▶           const expression = tcbExpression(switchCase.expression, this.tcb, this.scope);
 97 ▶           expression.markIgnoreDiagnostics();
 98 ▶           const comparison = new TcbExpr(`${switchValue.print()} === ${expression.print()}`);
 99 │ 
100 │           if (guard === null) {
101 │             guard = comparison;
102 │           } else {
103 ▶             guard = new TcbExpr(`(${guard.print()}) || (${comparison.print()})`);
104 │           }
105 │         }
106 │       }
107 │ 
108 │       return guard;
109 │     }
```

📄 `angular/packages/compiler/src/typecheck/ops/switch_block.ts` L111–146 （▶ の行: 118, 121–122, 127, 135, 140）

```ts
111 │     // To fully narrow the type in the default case, we need to generate an expression that negates
112 │     // the values of all of the other expressions. For example:
113 │     // @switch (expr) {
114 │     //   @case (1) {}
115 │     //   @case (2) {}
116 │     //   @default {}
117 │     // }
118 ▶     // Will produce the guard `expr !== 1 && expr !== 2`.
119 │     let guard: TcbExpr | null = null;
120 │ 
121 ▶     for (const currentGroup of this.block.groups) {
122 ▶       if (currentGroup === group) {
123 │         continue;
124 │       }
125 │ 
126 │       for (const switchCase of currentGroup.cases) {
127 ▶         if (switchCase.expression === null) {
128 │           // Skip the default case.
129 │           continue;
130 │         }
131 │ 
132 │         // The expression needs to be ignored for diagnostics since it has been checked already.
133 │         const expression = tcbExpression(switchCase.expression, this.tcb, this.scope);
134 │         expression.markIgnoreDiagnostics();
135 ▶         const comparison = new TcbExpr(`${switchValue.print()} !== ${expression.print()}`);
136 │ 
137 │         if (guard === null) {
138 │           guard = comparison;
139 │         } else {
140 ▶           guard = new TcbExpr(`(${guard.print()}) && (${comparison.print()})`);
141 │         }
142 │       }
143 │     }
144 │ 
145 │     return guard;
146 │   }
```

`(click)` は `addEventListener` のアロー関数になるので、外側の `case` の絞り込みは関数の中まで届きません。そこで子の Scope に渡したガードを、ハンドラの中で `if` にもう一度書きます（ハンドラ側の行は[第 11 回](11-typecheck-outputs-events.md)）。ガードの作り方は 2 通りです。

- **`default` を含まない group**（88〜109 行目）：98 行目で `式 === case の値`、同じ group に `case` が複数あれば 103 行目で `||` でつなぎます。
- **`default` を含む group**（111〜146 行目）：118 行目のコメントのとおり、**ほかの全部の group の値の否定**を `!==`（135 行目）と `&&`（140 行目）でつなぎます。122 行目で自分の group を、127〜130 行目で `default` そのものを飛ばします。

96〜97 行目と 133〜134 行目、ガードの中に再掲した `case` の値には `markIgnoreDiagnostics()` で `/*D:ignore*/` を付けます。値の式は 56 行目の `case` で既に検査したので、同じエラーを 2 回出さないためです。デモの「@switch で絞る」で、`if (((this).shape).kind === "square" /*D:ignore*/)` がハンドラの中に出ます。

### @default never：網羅しているかを TypeScript に確かめさせる

📄 `angular/packages/compiler/src/typecheck/ops/switch_block.ts` L62–83 （▶ の行: 62, 64–65, 69, 72, 78）

```ts
62 ▶     if (this.block.exhaustiveCheck) {
63 │       let translateExpression = this.block.expression;
64 ▶       if (this.block.exhaustiveCheck.expression) {
65 ▶         translateExpression = this.block.exhaustiveCheck.expression;
66 │       }
67 │ 
68 │       const switchValue = tcbExpression(translateExpression, this.tcb, this.scope);
69 ▶       const exhaustiveId = this.tcb.allocateId();
70 │ 
71 │       clauses.push(
72 ▶         new TcbExpr(`default: const tcbExhaustive${exhaustiveId}: never = ${switchValue.print()};`),
73 │       );
74 │     }
75 │ 
76 │     this.scope.addStatement(
77 │       new TcbExpr(
78 ▶         `switch (${switchExpression.print()}) { ${clauses.map((c) => c.print()).join('\n')} }`,
79 │       ),
80 │     );
81 │ 
82 │     return null;
83 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/diagnostics_spec.ts` L1429–1448 （▶ の行: 1435, 1440, 1446）

```ts
1429 │   describe('switch exhaustiveness', () => {
1430 │     it('should report an error when a case is missing in a switch block', () => {
1431 │       const messages = diagnose(
1432 │         `
1433 │           @switch (value) {
1434 │             @case ('a') {}
1435 ▶             @default never;
1436 │           }
1437 │         `,
1438 │         `
1439 │           export class TestComponent {
1440 ▶             value: 'a' | 'b';
1441 │           }
1442 │         `,
1443 │       );
1444 │ 
1445 │       expect(messages).toEqual([
1446 ▶         `TestComponent.html(2, 20): Type '"b"' is not assignable to type 'never'.`,
1447 │       ]);
1448 │     });
```

1. **62 行目：`@default never;` と書いたときだけ**

   パーサ（r3\_control\_flow.ts）は `@default never` を本体の無いブロックとして読み、`SwitchExhaustiveCheck` を作ります（最後に置く・本体を持てない、という制約のエラーもそこで出ます）。
2. **64〜66 行目：`@default never(state)` なら、その式を調べる**

   括弧の式が無ければ `@switch` の式そのもの。`@switch (state.mode)` で `state` 全体が絞り切れたかを見たいときに使います。
3. **72 行目：`default: const tcbExhaustive_tN: never = 式;`**

   全部の `case` を通り抜けた後の `default` では、TypeScript が残りの型を計算します。全部を網羅していれば残りは `never` で代入できます。1440 行目の `'a' | 'b'` に `@case ('a')` だけなら、残りの `'b'` が `never` に入らず、1446 行目の **TypeScript のエラー**（TS2322）になります。位置の `(2, 20)` はテンプレートの 2 行 20 列、`@switch (value)` の `value` です。変数名 `tcbExhaustive_t1` には位置のコメントが無く、TypeScript がエラーを付けたノードから親へたどって、式の後ろの `/*開始,終了*/` を見つけるからです（[第 16 回](16-typecheck-diagnostics-mapping.md)）。

> [!NOTE]
> **さらに深く**
>
> `tcbExhaustive_t1` は読まれない変数なので、`noUnusedLocals` のプロジェクトでは TypeScript が「宣言されたが読まれていない」（TS6133）を出します。これを捨てているのは compiler-cli の diagnostics.ts の `shouldReportDiagnostic` で、spec にも `it('should not report unused locals for exhaustiveness check variable')`（type\_check\_block\_spec.ts :2277）があります。捨てる行は[第 16 回](16-typecheck-diagnostics-mapping.md)で引用します。

## 5. @let：const の宣言にする

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L529–543 （▶ の行: 533–536, 538）

```ts
529 │     } else if (node instanceof Icu) {
530 │       this.appendIcuExpressions(node);
531 │     } else if (node instanceof Content) {
532 │       this.appendChildren(node);
533 ▶     } else if (node instanceof LetDeclaration) {
534 ▶       const opIndex = this.opQueue.push(new TcbLetDeclarationOp(this.tcb, this, node)) - 1;
535 ▶       if (this.isLocal(node)) {
536 ▶         this.tcb.oobRecorder.conflictingDeclaration(this.tcb.id, node);
537 │       } else {
538 ▶         this.letDeclOpMap.set(node.name, {opIndex, node});
539 │       }
540 │     } else if (node instanceof HostElement) {
541 │       this.appendHostElement(node);
542 │     }
543 │   }
```

📄 `angular/packages/compiler/src/typecheck/ops/let.ts` L16–44 （▶ の行: 32, 35–36, 39–40, 42）

```ts
16 │ /**
17 │  * A `TcbOp` which generates a constant for a `LetDeclaration`.
18 │  */
19 │ export class TcbLetDeclarationOp extends TcbOp {
20 │   constructor(
21 │     private tcb: Context,
22 │     private scope: Scope,
23 │     private node: LetDeclaration,
24 │   ) {
25 │     super();
26 │   }
27 │ 
28 │   /**
29 │    * `@let` declarations are mandatory, because their expressions
30 │    * should be checked even if they aren't referenced anywhere.
31 │    */
32 ▶   override readonly optional = false;
33 │ 
34 │   override execute(): TcbExpr {
35 ▶     const id = new TcbExpr(this.tcb.allocateId()).addParseSpanInfo(this.node.nameSpan);
36 ▶     const value = tcbExpression(this.node.value, this.tcb, this.scope).wrapForTypeChecker();
37 │     // Value needs to be wrapped, because spans for the expressions inside of it can
38 │     // be picked up incorrectly as belonging to the full variable declaration.
39 ▶     const varStatement = new TcbExpr(`const ${id.print()} = ${value.print()}`);
40 ▶     varStatement.addParseSpanInfo(this.node.sourceSpan);
41 │     this.scope.addStatement(varStatement);
42 ▶     return id;
43 │   }
44 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L2444–2470 （▶ の行: 2453–2455, 2468）

```ts
2444 │   describe('let declarations', () => {
2445 │     it('should generate let declarations as constants', () => {
2446 │       const result = tcb(`
2447 │         @let one = 1;
2448 │         @let two = 2;
2449 │         @let sum = one + two;
2450 │         {{sum}}
2451 │       `);
2452 │ 
2453 ▶       expect(result).toContain('const _t1 = (1);');
2454 ▶       expect(result).toContain('const _t2 = (2);');
2455 ▶       expect(result).toContain('const _t3 = ((_t1) + (_t2));');
2456 │       expect(result).toContain('"" + (_t3);');
2457 │     });
2458 │ 
2459 │     it('should rewrite references to let declarations inside event listeners', () => {
2460 │       const result = tcb(`
2461 │         @let value = 1;
2462 │         <button (click)="doStuff(value)"></button>
2463 │       `);
2464 │ 
2465 │       expect(result).toContain('const _t1 = (1);');
2466 │       expect(result).toContain('var _t2 = document.createElement("button");');
2467 │       expect(result).toContain(
2468 ▶         '_t2.addEventListener("click", ($event): any => { (this).doStuff(_t1); });',
2469 │       );
2470 │     });
```

1. **534・538 行目：op を積み、名前で引けるように覚える**

   `letDeclOpMap` の鍵は **名前の文字列**です（`varMap` は `Variable` のオブジェクトが鍵）。535〜536 行目、同じ Scope に同じ名前の変数や参照が既にあれば、`conflictingDeclaration` を帯域外の診断（TypeScript を通さず Angular が直接出す診断。[第 17 回](17-typecheck-oob.md)）として記録します。
2. **32 行目：読まれなくても必ず書く**

   29〜31 行目のコメントのとおり、`@let` の右辺は、誰も読まなくても型を検査するためです。
3. **39 行目：`const _tN = (右辺)`**

   2453〜2455 行目、`@let sum = one + two` は `const _t3 = ((_t1) + (_t2))` です。2468 行目、リスナーの中の `value` も同じ `_t1` を読みます。`@let` の値はテンプレートの中では書き換えられないので、`const` の宣言と同じ意味になります。
4. **35・40 行目：名前の位置と、宣言全体の位置**

   35 行目で `_tN` に名前（`nameSpan`）の位置を、40 行目で文全体に `@let …;` 全体の位置を付けます。36 行目で右辺を括弧で包むのは、37〜38 行目のコメントのとおり、右辺の中の位置コメントが宣言全体のものと取り違えられないようにするためです。

> [!NOTE]
> **ポイント**
>
> 「宣言より前で `@let` を読んだ」「`@let` に代入した」は、TypeScript の `const` のエラー（TS2448 など）には任せず、帯域外の診断で出します。これを入れたコミット 695126453e5（2024-05-03、#56199）の説明に「TS に任せられないのは、TS の診断が変数名を含むから」とあります。TS のメッセージに `_t1` と出てしまうからです。中身は[第 17 回](17-typecheck-oob.md)です。

## 6. @defer：中身は同じ Scope に並べるだけ

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L973–995 （▶ の行: 974–975, 978–979, 982, 985, 989, 993）

```ts
973 │   private appendDeferredBlock(block: DeferredBlock): void {
974 ▶     this.appendDeferredTriggers(block, block.triggers);
975 ▶     this.appendDeferredTriggers(block, block.prefetchTriggers);
976 │ 
977 │     // Only the `when` hydration trigger needs to be checked.
978 ▶     if (block.hydrateTriggers.when) {
979 ▶       this.opQueue.push(new TcbConditionOp(this.tcb, this, block.hydrateTriggers.when.value));
980 │     }
981 │ 
982 ▶     this.appendChildren(block);
983 │ 
984 │     if (block.placeholder !== null) {
985 ▶       this.appendChildren(block.placeholder);
986 │     }
987 │ 
988 │     if (block.loading !== null) {
989 ▶       this.appendChildren(block.loading);
990 │     }
991 │ 
992 │     if (block.error !== null) {
993 ▶       this.appendChildren(block.error);
994 │     }
995 │   }
```

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L997–1017 （▶ の行: 998–999, 1002–1003, 1007, 1015）

```ts
 997 │   private appendDeferredTriggers(block: DeferredBlock, triggers: DeferredBlockTriggers): void {
 998 ▶     if (triggers.when !== undefined) {
 999 ▶       this.opQueue.push(new TcbConditionOp(this.tcb, this, triggers.when.value));
1000 │     }
1001 │ 
1002 ▶     if (triggers.viewport !== undefined && triggers.viewport.options !== null) {
1003 ▶       this.opQueue.push(new TcbIntersectionObserverOp(this.tcb, this, triggers.viewport.options));
1004 │     }
1005 │ 
1006 │     if (triggers.hover !== undefined) {
1007 ▶       this.validateReferenceBasedDeferredTrigger(block, triggers.hover);
1008 │     }
1009 │ 
1010 │     if (triggers.interaction !== undefined) {
1011 │       this.validateReferenceBasedDeferredTrigger(block, triggers.interaction);
1012 │     }
1013 │ 
1014 │     if (triggers.viewport !== undefined) {
1015 ▶       this.validateReferenceBasedDeferredTrigger(block, triggers.viewport);
1016 │     }
1017 │   }
```

📄 `angular/packages/compiler/src/typecheck/ops/intersection_observer.ts` L16–35 （▶ の行: 28, 31–32）

```ts
16 │ /**
17 │  * A `TcbOp` which can be used to type check the options of an `IntersectionObserver`.
18 │  */
19 │ export class TcbIntersectionObserverOp extends TcbOp {
20 │   constructor(
21 │     private tcb: Context,
22 │     private scope: Scope,
23 │     private options: AST,
24 │   ) {
25 │     super();
26 │   }
27 │ 
28 ▶   override readonly optional = false;
29 │ 
30 │   override execute(): null {
31 ▶     const options = tcbExpression(this.options, this.tcb, this.scope);
32 ▶     this.scope.addStatement(new TcbExpr(`new IntersectionObserver(null!, ${options.print()})`));
33 │     return null;
34 │   }
35 │ }
```

1. **974〜975 行目：`on` / `when` と `prefetch` の trigger**

   998〜1000 行目、`when 式` は `TcbConditionOp` で `if (式) {}` になります（式だけを検査する空の if。[第 7 回](07-typecheck-expressions.md)の ops/expression.ts）。978〜980 行目、`hydrate` の trigger は `when` だけを検査します。
2. **1002〜1003 行目と 31〜32 行目：`on viewport({…})` の options**

   options のオブジェクトを `new IntersectionObserver(null!, options)` の第 2 引数に置きます。lib.dom.d.ts の `IntersectionObserverInit` の型で `rootMargin` などが検査されるという仕掛けで、Angular は options の型を自分では持っていません。
3. **1006〜1016 行目：`hover`・`interaction`・`viewport` の参照先**

   `on viewport(ref)` の `ref` が見つからない、参照なしなのに `@placeholder` の根が要素 1 つではない、などは `validateReferenceBasedDeferredTrigger` が帯域外の診断にします（[第 17 回](17-typecheck-oob.md)）。
4. **982〜994 行目：中身・`@placeholder`・`@loading`・`@error` を `appendChildren`**

   子の Scope を作らず、**今の Scope にそのまま並べます**。`if` にも包みません。そして `checkControlFlowBodies` を一度も読みません。`strictTemplates: false` でも `@defer` の中身は検査されます（デモのチェックボックスで確かめられます）。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L1910–1937 （▶ の行: 1925, 1936）

```ts
1910 │   describe('deferred blocks', () => {
1911 │     it('should generate bindings inside deferred blocks', () => {
1912 │       const TEMPLATE = `
1913 │         @defer {
1914 │           {{main()}}
1915 │         } @placeholder {
1916 │           {{placeholder()}}
1917 │         } @loading {
1918 │           {{loading()}}
1919 │         } @error {
1920 │           {{error()}}
1921 │         }
1922 │       `;
1923 │ 
1924 │       expect(tcb(TEMPLATE)).toContain(
1925 ▶         '"" + ((this).main()); "" + ((this).placeholder()); "" + ((this).loading()); "" + ((this).error());',
1926 │       );
1927 │     });
1928 │ 
1929 │     it('should generate `when` trigger', () => {
1930 │       const TEMPLATE = `
1931 │         @defer (when shouldShow() && isVisible) {
1932 │           {{main()}}
1933 │         }
1934 │       `;
1935 │ 
1936 ▶       expect(tcb(TEMPLATE)).toContain('if (((this).shouldShow()) && (((this).isVisible))) {}');
1937 │     });
```

1925 行目、4 つのブロックの中身が区切りなく 1 列に並んでいます。1936 行目、`when` は本体が空の `if` です。

### keyed defer：deferredImports をブロックの名前で分ける（22.2.0-next.7 の新しい行）

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L602–636 （▶ の行: 604–605, 609, 613, 617–620, 626）

```ts
602 │     this.reportConflictingBindings(node);
603 │ 
604 ▶     if (node instanceof Element || node instanceof Template) {
605 ▶       const enclosingBlocks = this.tcb.boundTarget.getDeferBlocksOfNode(node);
606 │       const isDeferred = enclosingBlocks.length > 0;
607 │ 
608 │       for (const dirMeta of directives) {
609 ▶         if (!dirMeta.isExplicitlyDeferred) {
610 │           continue;
611 │         }
612 │ 
613 ▶         if (!isDeferred) {
614 │           // This node has directives/components that were defer-loaded (included into
615 │           // `@Component.deferredImports`), but the node itself was used outside of a
616 │           // `@defer` block, which is the error.
617 ▶           this.tcb.oobRecorder.deferredComponentUsedEagerly(this.tcb.id, node, dirMeta, null, null);
618 ▶         } else if (dirMeta.deferredBlocks != null) {
619 ▶           const isAllowedInBlock = enclosingBlocks.some(
620 ▶             (b) => b.definedName !== null && dirMeta.deferredBlocks!.has(b.definedName),
621 │           );
622 │           if (!isAllowedInBlock) {
623 │             const currentBlockName =
624 │               enclosingBlocks[enclosingBlocks.length - 1].definedName ?? 'unnamed';
625 │             const declaredBlocks = Array.from(dirMeta.deferredBlocks);
626 ▶             this.tcb.oobRecorder.deferredComponentUsedEagerly(
627 │               this.tcb.id,
628 │               node,
629 │               dirMeta,
630 │               currentBlockName,
631 │               declaredBlocks,
632 │             );
633 │           }
634 │         }
635 │       }
636 │     }
```
*appendDirectivesAndInputsOfElementLikeNode の途中（要素に付いたディレクティブを並べた後）*

コミット 7d9f55da113（2026-08-14、「scope type-checking of keyed defer blocks」）で入った行です。`@Component({ deferredImports: { blockA: [CmpA] } })` のように deferredImports をブロックの名前ごとに書き、テンプレートで `@defer (name blockA)` と名前を付けます（spec では `// @ts-ignore` を付けて書いているので、公開の型にはまだありません）。605 行目で要素を囲む `@defer` を内側まで全部集め、613〜617 行目、`@defer` の外で使っていれば以前からの `deferredComponentUsedEagerly`、618〜633 行目、囲むブロックのどれも宣言した名前に入っていなければ、ブロックの名前つきで同じ診断を記録します。pipe にも同じ判定が ops/expression.ts にあります（[第 15 回](15-typecheck-refs-pipes.md)）。

> [!WARNING]
> **ハマりどころ**
>
> このサイトの `@angular/compiler` 22.1.6 にはこの判定はありません（22.1.6 の scope.ts は `node instanceof Element` だけを見て、`isDeferred(node)` の真偽だけで判定します）。22.1.6 のパーサは `name blockA` を「Unrecognized trigger」として弾くので、デモでは試せません。

## 7. @boundary：try / catch にする（22.1.6 には無い）

📄 `angular/packages/compiler/src/typecheck/ops/boundary.ts` L32–56 （▶ の行: 33, 36, 39, 42, 45, 50, 53）

```ts
32 │   override execute(): null {
33 ▶     const checkBody = this.tcb.env.config.checkControlFlowBodies;
34 │ 
35 │     // 1. Render try body
36 ▶     const tryBodyScope = this.scope.createChildScope(
37 │       this.scope,
38 │       null,
39 ▶       checkBody ? this.block.children : [],
40 │       null,
41 │     );
42 ▶     const tryBlockStr = `{\n${getStatementsBlock(tryBodyScope.render())}}`;
43 │ 
44 │     // 2. Render catch clause if there are error blocks
45 ▶     if (this.block.errorBlocks.length > 0) {
46 │       // Create an inner block where we execute the chain of error branches
47 │       const innerCatchStatements = this.generateCatchBranch(0);
48 │       const catchBlockStr = `{\n${getStatementsBlock(innerCatchStatements)}}`;
49 │ 
50 ▶       const tryStatement = new TcbExpr(`try ${tryBlockStr} catch (err) ${catchBlockStr}`);
51 │       this.scope.addStatement(tryStatement);
52 │     } else {
53 ▶       this.scope.addStatement(new TcbExpr(tryBlockStr));
54 │     }
55 │     return null;
56 │   }
```

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L231–246 （▶ の行: 231, 234–237, 244）

```ts
231 ▶     } else if (scopedNode instanceof BoundaryErrorBlock) {
232 │       for (const variable of scopedNode.contextVariables) {
233 │         let typeExpr: TcbExpr;
234 ▶         if (variable.value === '$error') {
235 ▶           typeExpr = new TcbExpr(`(err as Error)`);
236 ▶         } else if (variable.value === '$reset') {
237 ▶           typeExpr = new TcbExpr(`(() => {})`);
238 │         } else {
239 │           throw new Error(`Unrecognized context variable ${variable.value}`);
240 │         }
241 │         Scope.registerVariable(
242 │           scope,
243 │           variable,
244 ▶           new TcbBlockVariableOp(tcb, scope, typeExpr, variable),
245 │         );
246 │       }
```

f7597cb7d93（2026-04-20、#70463）で入った `@boundary` の型チェックです。36〜42 行目で本体を子の Scope にして `{ … }` に、`@error` があれば 50 行目で `try {本体} catch (err) {…}` にします。`@error (let err; when err instanceof CustomError)` の `when` は、同じファイルの `generateCatchBranch` で `if` の連なりになります。234〜235 行目、`@error` の中の `$error` は `(err as Error)`、236〜237 行目、`$reset` は `(() => {})` を初期値にした変数です。だから test/ngtsc/boundary\_spec.ts の `it('should error when accessing non-existent properties on error alias')`（:48）では、「Property 'nonExistentProperty' does not exist on type 'Error'」という TypeScript のエラーが期待値です。このサイトの 22.1.6 のパーサは `@boundary` を知らないので、デモでは扱いません。

## 8. デモ：本物の generateTypeCheckBlock で TCB を作る

> **🧪 DEMO — このページの @angular/compiler（22.1.6）の generateTypeCheckBlock**
>
> プリセットを選ぶか、テンプレートを書き換えて「TCB を作る」を押してください。ボタンを押したときだけ `@angular/compiler` を読み込んで動きます。Environment は記録だけの差し替えで、参照はクラス名のまま、pipe は `_pipe_名前` と書きます（[第 5 回](05-typecheck-environment.md)の本物は import と宣言を足します）。設定の既定は `strictTemplates` 相当です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-control-flow)

見るところ（2026-11-02 に Node で同じ 22.1.6 を呼んで確かめた出力です）：

- **@switch で絞る**：`case "square":` の下に `var _t1 = document.createElement("button")` と、ハンドラの中の `if (… === "square" /*D:ignore*/)`。切ると 3 つの `case` が `break;` だけになります。
- **@default never**：`default: const tcbExhaustive_t1: never = ((this).kind);`。`checkControlFlowBodies` を切っても消えません（4 節 62〜74 行目はその設定を見ていません）。
- **@for**：読んだ `i`・`$first`・`$count` の 3 つだけが `var _t2 = null! as number` などで宣言され、`$last` などは出ません。`@empty` の中身はループの外に並びます。
- **@defer**：`if (((this).ready)) {};` と `new IntersectionObserver(null!, ({ "rootMargin": "100px" }));` の後に、中身と `@placeholder` が並びます。チェックボックスを切っても同じです。

TypeScript そのものはブラウザで動かしていません。手元で、生成した TCB の前に `class DemoCmp { shape!: {kind: "circle"; radius: number} | {kind: "square"; size: number}; kind!: "a"|"b"|"c"; … }` を置き、../angular の TypeScript 6.0.3（`strict: true`）で型検査した結果です。

- `@case ('square') { {{ shape.radius }} }` → `TS2339: Property 'radius' does not exist on type '{ kind: "square"; size: number; }'.`（`@case ('circle')` の中の `shape.radius` と、ハンドラの中の `pick(shape.size)` はエラーなし）
- 同じテンプレートで `checkControlFlowBodies: false` → エラーなし（本体が TCB に無いので）
- `kind!: "a"|"b"|"c"` に `@case` が `'a'` と `'b'` だけで `@default never;` → `TS2322: Type '"c"' is not assignable to type 'never'.`（エラーの付いたノードは `tcbExhaustive_t1`）

## ここまでの呼び出し

- 👤 `@switch / @for / @let / @defer` を書いたテンプレート
  - `generateTypeCheckBlock()` — compiler/src/typecheck/type\_check\_block.ts L29
    - `Scope.forNodes()` → `appendNode()` — ops/scope.ts L187 / L489
      - `TcbIfBlockOp` → 分岐ごとに `Scope.forNodes(IfBlockBranch)` → `TcbBlockVariableOp` — if\_block.ts / scope.ts L217 / variables.ts L90 — *as の別名を if の前に var で*
      - `TcbForOfOp` → `Scope.forNodes(ForLoopBlock)` → `TcbBlockImplicitVariableOp` — for\_block.ts / scope.ts L247 / variables.ts L21 — *$index は null! as number*
      - `TcbSwitchOp.execute()` → `generateGuard()` — switch\_block.ts L34 / L85 — *case と never の default*
      - `TcbLetDeclarationOp.execute()` — let.ts L34 — *const \_tN = (右辺)*
      - `appendDeferredBlock()` → `appendDeferredTriggers()` → `TcbConditionOp / TcbIntersectionObserverOp` — scope.ts L973 / L997 / intersection\_observer.ts L30
    - `Scope.render()` — ops/scope.ts L336 — *optional の op は読まれたときだけ*
- 👤 TypeScript の制御フロー解析が `if` / `switch` / `for…of` / `const` を絞り込む

## テストと直し方

ブロックの TCB の形は type\_check\_block\_spec.ts の 4 つの describe が確かめています。どれも `tcb(template, declarations, config)`（testing/index.ts。位置コメントを消して空白を詰めた TCB の文字列を返す）の結果に `toContain` する形です。

- `describe('deferred blocks')`（:1910）— it 5 本。上で引いた :1911・:1929 と、``it('should generate options for `viewport` trigger')``（:1959）。
- `describe('conditional blocks')`（:1974）— it 19 本。`@if` 6 本と `@switch` 13 本（`it('should generate a guard expression for a listener inside a switch case')` :2162、`it('should generate a switch block with exhaustiveness checking')` :2235 など）。
- `describe('for loop blocks')`（:2340）— it 7 本。
- `describe('let declarations')`（:2444）— it 2 本。
- エラーの出方は diagnostics\_spec.ts の `describe('switch exhaustiveness')`（:1429、it 5 本）、`@boundary` は test/ngtsc/boundary\_spec.ts（`describe('ngtsc @boundary type checking')` :16）、keyed defer は test/ngtsc/defer\_spec.ts の `describe('block-specific deferredImports type checking')`（:2258）。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=type check blocks (deferred blocks|conditional blocks|for loop blocks|let declarations)'
```

📄 `出力（抜粋。2026-11-02 に実行）`

```
Ran 33 of 1747 specs
33 specs, 0 failures
Finished in 0.151 seconds
//packages/compiler-cli/src/ngtsc/typecheck/test:test                    PASSED in 0.9s
```

5 + 19 + 7 + 2 = 33 本で、件数が合います（spec のファイル全体は 1747 本）。`--filter` は jasmine の名前に対する正規表現なので、`type check blocks` を前に付けて、ほかの spec の同じ名前の describe を拾わないようにしています。

1. **直すとしたら**

   ブロックの TCB の形は `packages/compiler/src/typecheck/ops/` の op 1 つに閉じています（`@switch` なら switch\_block.ts の `TcbSwitchOp.execute` と `generateGuard`）。変数の型や宣言の場所なら scope.ts の `Scope.forNodes`（217〜267 行目）です。直したら、まず type\_check\_block\_spec.ts の該当の describe に「TCB の形」の it を、エラーの出方が変わるなら diagnostics\_spec.ts（`diagnose()` で「ファイル(行, 列): メッセージ」の文字列を比べる形）に it を足します。22.2 の main で入った `@boundary` と keyed defer は、テストが test/ngtsc の側にしかありません（boundary\_spec.ts・defer\_spec.ts）。
2. **issue を読むときの手がかり**

   「`@switch` の中で型が絞られない」「`@if` の中のイベントで null と言われる」のような報告は、まず TCB の形（`case` の位置か、ハンドラの中のガードか）のどちらの問題かを分けます。デモに同じテンプレートを入れて TCB を見ると、ガードがあるか、`/*D:ignore*/` が付いているかがすぐ分かります。開いている issue の一覧と読み方は[第 20 回](20-typecheck-issues.md)です。

## 聞かれそうな質問

**Q. @switch の case の中で型が絞り込まれるのはなぜですか？**

TCB の中で `@switch` が TypeScript の `switch` 文になるからです（switch\_block.ts 76〜80 行目、`case` は 55〜56 行目）。`case "circle":` の下では TypeScript 自身が判別共用体を絞ります。`(click)` のハンドラの中はアロー関数なので絞り込みが切れ、代わりに 42 行目のガード（98 行目の `===`、`default` なら 135 行目の `!==` の積み重ね）がハンドラの中の `if` になります。

**Q. @for の $index はどんな型ですか？値は TCB で計算されますか？**

`number` です（scope.ts 165 行目）。`$first`・`$last`・`$even`・`$odd` は `boolean`、`$count` は `number`。値は計算しません。variables.ts 36 行目で `var _t2 = null! as number` と型だけの変数にします。しかも 31 行目で optional なので、テンプレートが読んだものだけが宣言されます。

**Q. strictTemplates を false にすると @defer の中も検査されなくなりますか？**

いいえ。`@defer` には op が無く、scope.ts 982〜994 行目で中身・`@placeholder`・`@loading`・`@error` を今の Scope に `appendChildren` するだけで、`checkControlFlowBodies` を読みません。`@if`・`@for`・`@switch`（switch\_block.ts 37・41 行目）・`@boundary`（boundary.ts 33・39 行目）は読むので、こちらは本体が消えます。

**Q. @default never のエラーは Angular が出しているのですか？**

TypeScript です。switch\_block.ts 72 行目の `const tcbExhaustive_tN: never = 式;` に、絞り残った型が代入できないという TS2322 が出ます（diagnostics\_spec.ts 1446 行目）。Angular がしているのは、その位置をテンプレートの `@switch (式)` の式に戻すことと、読まれない変数の警告を捨てることだけです。

**Q. @let はなぜ var ではなく const なのですか？**

let.ts 39 行目で `const` を書いています。`@let` の値はテンプレートの中で書き換えられないので、それをそのまま TypeScript の宣言にしたものです。ただし「宣言前の読み取り」「代入」は `const` のエラーに任せず、帯域外の診断で出します（コミット 695126453e5 の説明：TS の診断は `_t1` という変数名を含んでしまう）。

## 読み終えて

- ブロックの型の絞り込みは、TCB に `if`・`switch`・`for…of`・`const` を書いて TypeScript に任せている。Angular の仕事は「絞れる形」と「ハンドラの中に再掲するガード」。
- `as` の別名は `if` の前に `var`、`$index` などは `null! as number` の型だけの変数で、読まれたものだけ出る。
- `@switch` のハンドラのガードは、`case` なら `===` の `||`、`default` ならほかの全部の値の `!==` の `&&`。`@default never` は `never` への代入。
- `@defer` は中身を同じ Scope に並べるだけで、`checkControlFlowBodies` を見ない。trigger は `if (when) {}` と `new IntersectionObserver(null!, options)`。
- 読んでいる 22.2.0-next.7 には、keyed defer と `@boundary` の TCB がある。このサイトの 22.1.6 には無い。

---

← 前: [双方向バインディングと model()・\[formField\]](12-typecheck-two-way.md)  
次: [ng-template と構造ディレクティブ：ngTemplateContextGuard と ngTemplateGuard\_](14-typecheck-template-guards.md) →
