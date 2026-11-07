[目次](../README.md) › [テンプレート型チェックの内側](README.md) › 第 7 回 / 全 20 回

# テンプレートの式を TypeScript の式に書き直す

> ops/expression.ts の tcbExpression と resolve（Scope を知る側）と、expression.ts の TcbExprTranslator（知らない側）の分担。演算子・関数呼び出し・$any()・代入・安全な参照（?.）・non-null（!）・テンプレートリテラル・typeof / void を TypeScript の式にする行と、括弧と位置のコメント /\*start,end\*/ の付け方。strictSafeNavigationTypes で ?. が変わる理由（View Engine の推論の再現を含む）、2026-08 の optional chaining の修正（e9ba39d671a）。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-expressions)

---

テンプレートの `{{ user?.name }}` は、TCB の中で `(((this).user))?.name` のような TypeScript の式になります。この章では、その書き直しを担う 2 つの訳し手（Scope を知っている `TcbExpressionTranslator` と、知らない `TcbExprTranslator`）の分担、括弧と位置のコメントの付け方、`?.`・`!`・`$any()`・代入・テンプレートリテラル・`typeof` の訳し方、そして `strictSafeNavigationTypes` で `?.` の訳が変わる理由と、2026-08 の optional chaining の修正（e9ba39d671a）を、行を指して読みます。

読む対象は `packages/compiler/src/typecheck/` の `expression.ts`（555 行）・`ops/expression.ts`（300 行）・`ops/codegen.ts` と、spec の `type_check_block_spec.ts` です。

1. [1. 全体像](01-typecheck-overview.md)
2. [2. 設定](02-typecheck-config.md)
3. [3. TCB の置き場所](03-typecheck-context.md)
4. [4. 派生プログラム](04-typecheck-program-driver.md)
5. [5. Environment](05-typecheck-environment.md)
6. [6. Scope と TcbOp](06-typecheck-scope.md)
7. **7. 式**（この章）
8. [8. 要素と DOM](08-typecheck-elements-dom.md)
9. [9. 型コンストラクタ](09-typecheck-type-constructor.md)
10. [10. 入力](10-typecheck-inputs.md)
11. [11. 出力とイベント](11-typecheck-outputs-events.md)
12. [12. 双方向](12-typecheck-two-way.md)
13. [13. 制御フロー](13-typecheck-control-flow.md)
14. [14. ng-template のガード](14-typecheck-template-guards.md)
15. [15. 参照と pipe](15-typecheck-refs-pipes.md)
16. [16. 診断の対応付け](16-typecheck-diagnostics-mapping.md)
17. [17. 帯域外の診断](17-typecheck-oob.md)
18. [18. 拡張診断](18-typecheck-extended.md)
19. [19. TemplateTypeChecker](19-typecheck-template-type-checker.md)
20. [20. issue と PR を読む](20-typecheck-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> 式の AST（[式のパーサ](../compiler/05-compiler-expression-parser.md)が作る）を訳す入口の `astToTcbExpr`、名前を Scope で解決する `resolve`、名前が見つからなければ `this` にする行、`a.b` と `a?.b` の訳は [compiler-typecheck](../compiler/17-compiler-typecheck.md) の 5 節で引用しました。この章はその残りを読みます。

## 1. 2 つの訳し手の分担

📄 `angular/packages/compiler/src/typecheck/ops/expression.ts` L29–47 （▶ の行: 33–35, 41–42, 46）

```ts
29 │ /**
30 │  * Process an `AST` expression and convert it into a `ts.Expression`, generating references to the
31 │  * correct identifiers in the current scope.
32 │  */
33 ▶ export function tcbExpression(ast: AST, tcb: Context, scope: Scope): TcbExpr {
34 ▶   const translator = new TcbExpressionTranslator(tcb, scope);
35 ▶   return translator.translate(ast);
36 │ }
37 │ 
38 │ /**
39 │  * Wraps an expression in an `unwrapSignal` call which extracts the signal's value.
40 │  */
41 ▶ export function unwrapWritableSignal(expression: TcbExpr, tcb: Context): TcbExpr {
42 ▶   const unwrapRef = tcb.env.referenceExternalSymbol(
43 │     R3Identifiers.unwrapWritableSignal.moduleName,
44 │     R3Identifiers.unwrapWritableSignal.name,
45 │   );
46 ▶   return new TcbExpr(`${unwrapRef.print()}(${expression.print()})`);
47 │ }
```
*ops/expression.ts。op が式を訳すときの入口*

op は式を訳すとき、必ず 33 行目の `tcbExpression(ast, tcb, scope)` を呼びます。34 行目で Scope を持った `TcbExpressionTranslator` を作り、その `translate` が expression.ts の `astToTcbExpr` を「この節点は特別か」を尋ねる関数（`resolve`）付きで呼びます（compiler-typecheck 5 節で引用）。41〜47 行目の `unwrapWritableSignal` は双方向バインディング用の小さな関数で、[第 12 回](12-typecheck-two-way.md)で使われます。

| 訳し手 | ファイル | 知っているもの | 受け持つ AST |
| --- | --- | --- | --- |
| `TcbExpressionTranslator.resolve` | ops/expression.ts | Context・Scope・BoundTarget・oob | 暗黙のレシーバの上の名前（テンプレートの変数・#ref・`@let`）、その名前への代入（4 節）、`ImplicitReceiver` → `this`、pipe（[第 15 回](15-typecheck-refs-pipes.md)）、`$any()` と変数の関数呼び出し（5 節） |
| `TcbExprTranslator` | expression.ts | TypeCheckingConfig だけ | それ以外のすべて（演算子・リテラル・プロパティ読み・呼び出し・`?.`・`!`・テンプレートリテラル・アロー関数） |

📄 `angular/packages/compiler/src/typecheck/expression.ts` L105–128 （▶ の行: 115, 117, 122–123, 126–127）

```ts
105 │   visitConditional(ast: Conditional): TcbExpr {
106 │     const condExpr = this.translate(ast.condition);
107 │     const trueExpr = this.translate(ast.trueExp);
108 │     // Wrap `falseExpr` in parens so that the trailing parse span info is not attributed to the
109 │     // whole conditional.
110 │     // In the following example, the last source span comment (5,6) could be seen as the
111 │     // trailing comment for _either_ the whole conditional expression _or_ just the `falseExpr` that
112 │     // is immediately before it:
113 │     // `conditional /*1,2*/ ? trueExpr /*3,4*/ : falseExpr /*5,6*/`
114 │     // This should be instead be `conditional /*1,2*/ ? trueExpr /*3,4*/ : (falseExpr /*5,6*/)`
115 ▶     const falseExpr = this.translate(ast.falseExp).wrapForTypeChecker();
116 │     const node = new TcbExpr(
117 ▶       `(${condExpr.print()} ? ${trueExpr.print()} : ${falseExpr.print()})`,
118 │     ).addParseSpanInfo(ast.sourceSpan);
119 │     return node;
120 │   }
121 │ 
122 ▶   visitImplicitReceiver(ast: ImplicitReceiver): never {
123 ▶     throw new Error('Method not implemented.');
124 │   }
125 │ 
126 ▶   visitThisReceiver(ast: ThisReceiver): never {
127 ▶     throw new Error('Method not implemented.');
128 │   }
```

分担がはっきり分かるのが 122〜128 行目です。`TcbExprTranslator` は `ImplicitReceiver`（`name` の前に隠れている「誰の」）と `ThisReceiver` を訳せず、`Method not implemented.` を投げます。この 2 つは必ず先に `resolve` が受け取って `this` にする（compiler-typecheck 5 節で引用）ので、ここには来ません。105〜120 行目の三項演算子は、115 行目で偽の側だけを括弧に包みます。108〜114 行目のコメントのとおり、末尾の位置のコメントが三項演算子全体ではなく偽の側に付いたと読まれないためです。

## 2. 括弧と位置のコメント

📄 `angular/packages/compiler/src/typecheck/ops/codegen.ts` L74–97 （▶ の行: 75–76, 84–86, 94–95）

```ts
74 │   /** Marks the expression to be ignored for diagnostics. */
75 ▶   markIgnoreDiagnostics(): this {
76 ▶     this.ignoreComment = `${CommentTriviaType.DIAGNOSTIC}:ignore`;
77 │     return this;
78 │   }
79 │ 
80 │   /**
81 │    * Wraps the expression in parenthesis such that inserted
82 │    * span comments become attached to the proper node.
83 │    */
84 ▶   wrapForTypeChecker(): this {
85 ▶     this.source = `(${this.print()})`;
86 ▶     this.spanComment = this.identifierComment = this.ignoreComment = null;
87 │     return this;
88 │   }
89 │ 
90 │   /**
91 │    * Tags the expression with an identifier.
92 │    * @param identifier Identifier to apply to the expression.
93 │    */
94 ▶   addExpressionIdentifier(identifier: ExpressionIdentifier, id?: number): this {
95 ▶     this.identifierComment = `${CommentTriviaType.EXPRESSION_TYPE_IDENTIFIER}:${identifier}${id !== undefined ? `:${id}` : ''}`;
96 │     return this;
97 │   }
```
*ops/codegen.ts。TcbExpr は文字列と 3 つのコメントを持つ*

TCB の式は `TcbExpr`（文字列）です。位置のコメント `/*3,8*/` を付ける `addParseSpanInfo` は compiler-typecheck の 9 節で引用しました。84〜88 行目の `wrapForTypeChecker` は、それまでの文字列をコメントごと `( … )` に包み、コメントを空にします。こうすると、次に付けるコメントは括弧の外側（包んだ式全体）に付きます。TCB に括弧が多いのはこのためです。75〜78 行目の `markIgnoreDiagnostics` は `/*D:ignore*/` を付け、その式から出た TypeScript のエラーを捨てさせます（[第 16 回](16-typecheck-diagnostics-mapping.md)）。

📄 `angular/packages/compiler/src/typecheck/expression.ts` L78–104 （▶ の行: 79–81, 87–89, 91, 93）

```ts
 78 │   visitUnary(ast: Unary): TcbExpr {
 79 ▶     const expr = this.translate(ast.expr);
 80 ▶     const node = new TcbExpr(`${ast.operator}${expr.print()}`);
 81 ▶     return node.wrapForTypeChecker().addParseSpanInfo(ast.sourceSpan);
 82 │   }
 83 │ 
 84 │   visitBinary(ast: Binary): TcbExpr {
 85 │     const lhs = this.translate(ast.left);
 86 │     const rhs = this.translate(ast.right);
 87 ▶     lhs.wrapForTypeChecker();
 88 ▶     rhs.wrapForTypeChecker();
 89 ▶     const expression = `${lhs.print()} ${ast.operation} ${rhs.print()}`;
 90 │     const node = new TcbExpr(
 91 ▶       ast.operation === '??' || ast.operation === '**' ? `(${expression})` : expression,
 92 │     );
 93 ▶     node.addParseSpanInfo(ast.sourceSpan);
 94 │     return node;
 95 │   }
 96 │ 
 97 │   visitChain(ast: Chain): TcbExpr {
 98 │     const elements = ast.expressions.map((expr) => this.translate(expr).print());
 99 │     const node = new TcbExpr(elements.join(', '));
100 │     node.wrapForTypeChecker();
101 │     node.addParseSpanInfo(ast.sourceSpan);
102 │     return node;
103 │   }
104 │ 
```

1. **79〜81 行目：単項の `-`・`+`**

   演算子と式を並べて全体を包みます。spec の `{{-1}}` → `(-1)` です。
2. **87〜89 行目：二項演算子は両側を包む**

   左右をそれぞれ `( … )` にしてから `左 演算子 右` を作ります。テンプレートの `a + b * c` の優先順位はパーサが AST の形で決めているので、TS に並べ直されないよう両側を包みます。
3. **91 行目：`??` と `**` だけ全体も包む**

   TypeScript では `a ?? b || c` のように `??` を `||` や `&&` と括弧なしで混ぜられず、`**` は左に単項演算子を置けません。全体を包んで、どこに置かれても正しい式にします。

## 3. non-null の `!`・否定の `!`・`typeof`・`void`

📄 `angular/packages/compiler/src/typecheck/expression.ts` L215–237 （▶ の行: 216–217, 225–226, 230–231, 235–236）

```ts
215 │   visitNonNullAssert(ast: NonNullAssert): TcbExpr {
216 ▶     const expr = this.translate(ast.expression).wrapForTypeChecker();
217 ▶     return new TcbExpr(`${expr.print()}!`).addParseSpanInfo(ast.sourceSpan);
218 │   }
219 │ 
220 │   visitPipe(ast: BindingPipe): never {
221 │     throw new Error('Method not implemented.');
222 │   }
223 │ 
224 │   visitPrefixNot(ast: PrefixNot): TcbExpr {
225 ▶     const expression = this.translate(ast.expression).wrapForTypeChecker();
226 ▶     return new TcbExpr(`!${expression.print()}`).addParseSpanInfo(ast.sourceSpan);
227 │   }
228 │ 
229 │   visitTypeofExpression(ast: TypeofExpression): TcbExpr {
230 ▶     const expression = this.translate(ast.expression).wrapForTypeChecker();
231 ▶     return new TcbExpr(`typeof ${expression.print()}`).addParseSpanInfo(ast.sourceSpan);
232 │   }
233 │ 
234 │   visitVoidExpression(ast: VoidExpression): TcbExpr {
235 ▶     const expression = this.translate(ast.expression).wrapForTypeChecker();
236 ▶     return new TcbExpr(`void ${expression.print()}`).addParseSpanInfo(ast.sourceSpan);
237 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L85–107 （▶ の行: 86, 96–97, 104）

```ts
 85 │   it('should handle nullish coalescing operator', () => {
 86 ▶     expect(tcb('{{ a ?? b }}')).toContain('((((this).a)) ?? (((this).b)))');
 87 │     expect(tcb('{{ a ?? b ?? c }}')).toContain(
 88 │       '((((((this).a)) ?? (((this).b)))) ?? (((this).c)))',
 89 │     );
 90 │     expect(tcb('{{ (a ?? b) + (c ?? e) }}')).toContain(
 91 │       '(((((((this).a)) ?? (((this).b))))) + ((((((this).c)) ?? (((this).e))))))',
 92 │     );
 93 │   });
 94 │ 
 95 │   it('should handle typeof expressions', () => {
 96 ▶     expect(tcb('{{typeof a}}')).toContain('typeof (((this).a))');
 97 ▶     expect(tcb('{{!(typeof a)}}')).toContain('!((typeof (((this).a))))');
 98 │     expect(tcb('{{!(typeof a === "object")}}')).toContain(
 99 │       '!(((typeof (((this).a))) === ("object")))',
100 │     );
101 │   });
102 │ 
103 │   it('should handle void expressions', () => {
104 ▶     expect(tcb('{{void a}}')).toContain('void (((this).a))');
105 │     expect(tcb('{{!(void a)}}')).toContain('!((void (((this).a))))');
106 │     expect(tcb('{{!(void a === "object")}}')).toContain('!(((void (((this).a))) === ("object")))');
107 │   });
```

4 つとも同じ形です。中の式を訳して包み（216・225・230・235 行目）、前か後ろに演算子を付けます。`a!`（non-null アサーション）は 217 行目で TypeScript の `!` そのまま、`!a` は 226 行目、`typeof a` は 231 行目、`void a` は 236 行目です。TypeScript と同じ演算子に訳すので、`@if (typeof a === 'string')` の絞り込みも TypeScript 自身が行います。閉じた #59215「typeof does not narrow in templates」は、issue のコメントによると TypeScript 5.8 に対応する #59830 で直りました。TCB の側ではなく TypeScript の側の改善で直った例です。spec の 86 行目は `??`（2 節の 91 行目の外側の括弧）、96〜97 行目は `typeof`、104 行目は `void` です。

## 4. 代入：コンポーネントのプロパティと `@let`

📄 `angular/packages/compiler/src/typecheck/ops/expression.ts` L140–165 （▶ の行: 141–144, 147–149, 154, 160–162）

```ts
140 │     } else if (
141 ▶       ast instanceof Binary &&
142 ▶       Binary.isAssignmentOperation(ast.operation) &&
143 ▶       ast.left instanceof PropertyRead &&
144 ▶       (ast.left.receiver instanceof ImplicitReceiver || ast.left.receiver instanceof ThisReceiver)
145 │     ) {
146 │       const read = ast.left;
147 ▶       const target = this.tcb.boundTarget.getExpressionTarget(read);
148 ▶       if (target === null) {
149 ▶         return null;
150 │       }
151 │ 
152 │       const targetExpression = this.getTargetNodeExpression(target, read);
153 │       const expr = this.translate(ast.right);
154 ▶       const result = new TcbExpr(`(${targetExpression.print()} = ${expr.print()})`);
155 │       result.addParseSpanInfo(read.sourceSpan);
156 │ 
157 │       // Ignore diagnostics from TS produced for writes to `@let` and re-report them using
158 │       // our own infrastructure. We can't rely on the TS reporting, because it includes
159 │       // the name of the auto-generated TCB variable name.
160 ▶       if (target instanceof LetDeclaration) {
161 ▶         result.markIgnoreDiagnostics();
162 ▶         this.tcb.oobRecorder.illegalWriteToLetDeclaration(this.tcb.id, read, target);
163 │       }
164 │ 
165 │       return result;
```

イベントのハンドラの中の `(click)="a = b"` のような代入です。141〜144 行目、左辺が暗黙のレシーバの上の名前なら、まず 147 行目で BoundTarget に「この名前はテンプレートの何か」を尋ねます。148〜149 行目、何も指さない（コンポーネントのプロパティ）なら `null` を返して普通の二項演算子の訳（2 節）に任せ、`(((this).a)) = (((this).b))` になります。テンプレートの変数を指していれば 154 行目で `(_t3 = 1)` の形にし、それが `@let` なら 160〜162 行目で TypeScript のエラーを捨てる印を付け、代わりに帯域外の診断 `illegalWriteToLetDeclaration` を記録します（157〜159 行目のコメント：TS のエラーは TCB の変数名 `_t3` を含んでしまうから）。テンプレートの変数（`let-x` や #ref）への代入を禁じる診断は別の検査です（[第 17 回](17-typecheck-oob.md)）。

## 5. 呼び出し：`$any()`、テンプレートの変数の関数、メソッド

📄 `angular/packages/compiler/src/typecheck/ops/expression.ts` L230–261 （▶ の行: 231–232, 239–242, 245, 252–255, 258）

```ts
230 │     } else if (
231 ▶       (ast instanceof Call || ast instanceof SafeCall) &&
232 ▶       (ast.receiver instanceof PropertyRead || ast.receiver instanceof SafePropertyRead)
233 │     ) {
234 │       // Resolve the special `$safeNavigationMigration(expr)` syntax to evaluate as the wrapped expression.
235 │       // `$safeNavigationMigration(expr)` -> `expr`
236 │       // In the TCB this magic function will not affect the emitted TS
237 │       // as Safe avigation expressions already returned `undefined` instead of null
238 │       // see bug https://github.com/angular/angular/issues/37622
239 ▶       if (
240 ▶         ast.receiver.receiver instanceof ImplicitReceiver &&
241 ▶         ast.receiver.name === '$safeNavigationMigration' &&
242 ▶         ast.args.length === 1
243 │       ) {
244 │         const expr = this.translate(ast.args[0]);
245 ▶         const result = new TcbExpr(`(${expr.print()})`);
246 │         result.addParseSpanInfo(ast.sourceSpan);
247 │         return result;
248 │       }
249 │ 
250 │       // Resolve the special `$any(expr)` syntax to insert a cast of the argument to type `any`.
251 │       // `$any(expr)` -> `expr as any`
252 ▶       if (
253 ▶         ast.receiver.receiver instanceof ImplicitReceiver &&
254 ▶         ast.receiver.name === '$any' &&
255 ▶         ast.args.length === 1
256 │       ) {
257 │         const expr = this.translate(ast.args[0]);
258 ▶         const result = new TcbExpr(`(${expr.print()} as any)`);
259 │         result.addParseSpanInfo(ast.sourceSpan);
260 │         return result;
261 │       }
```

1. **231〜232 行目：`名前(…)` の形の呼び出し**

   レシーバが `PropertyRead` か `SafePropertyRead` の呼び出しだけがここに来ます。
2. **239〜248 行目：`$safeNavigationMigration(式)`**

   マイグレーション用の印で、TCB では中の式をそのまま括弧に入れるだけです（234〜238 行目のコメント。#37622）。
3. **252〜261 行目：`$any(式)`**

   レシーバが暗黙のレシーバで（253 行目）、名前が `$any`（254 行目）、引数が 1 つ（255 行目）のときだけ、258 行目で `(式 as any)` にします。3 つの条件のどれかが欠けると特別扱いされません。デモで確かめると、`this.$any(x)` は `(this).$any(((this).x))`、`$any(x, 1)` は `(this).$any(((this).x), 1)` と、コンポーネントの `$any` メソッドの呼び出しになりました。

📄 `angular/packages/compiler/src/typecheck/ops/expression.ts` L262–288 （▶ の行: 267–269, 272–273, 275, 285）

```ts
262 │ 
263 │       // Attempt to resolve a bound target for the method, and generate the method call if a target
264 │       // could be resolved. If no target is available, then the method is referencing the top-level
265 │       // component context, in which case `null` is returned to let the `ImplicitReceiver` being
266 │       // resolved to the component context.
267 ▶       const target = this.tcb.boundTarget.getExpressionTarget(ast);
268 ▶       if (target === null) {
269 ▶         return null;
270 │       }
271 │ 
272 ▶       const method = this.getTargetNodeExpression(target, ast);
273 ▶       method.addParseSpanInfo(ast.receiver.nameSpan).wrapForTypeChecker();
274 │       const args = ast.args.map((arg) => this.translate(arg).print());
275 ▶       const node = new TcbExpr(`${method.print()}(${args.join(', ')})`);
276 │       node.addParseSpanInfo(ast.sourceSpan);
277 │       return node;
278 │     } else {
279 │       // This AST isn't special after all.
280 │       return null;
281 │     }
282 │   }
283 │ 
284 │   private getTargetNodeExpression(targetNode: TemplateEntity, expressionNode: AST): TcbExpr {
285 ▶     const expr = this.scope.resolve(targetNode);
286 │     expr.addParseSpanInfo(expressionNode.sourceSpan);
287 │     return expr;
288 │   }
```

267〜270 行目、呼び出す名前がテンプレートの変数（`let-fn` や `@let fn = …`）なら、285 行目の `scope.resolve` でその変数を得て（[第 6 回](06-typecheck-scope.md)）、275 行目で `_t2(1)` の形にします。指さなければ `null` で、次の `visitCall` が `(this).fn(1)` を作ります。

📄 `angular/packages/compiler/src/typecheck/expression.ts` L290–327 （▶ の行: 295–296, 300–302, 304, 314–315, 317）

```ts
290 │   visitCall(ast: Call): TcbExpr {
291 │     const args = ast.args.map((expr) => this.translate(expr));
292 │     const receiver = ast.receiver;
293 │     let expr: TcbExpr;
294 │ 
295 ▶     if (receiver instanceof PropertyRead) {
296 ▶       const resolved = this.maybeResolve(receiver);
297 │       if (resolved !== null) {
298 │         expr = resolved;
299 │       } else {
300 ▶         const propertyReceiver = this.translate(receiver.receiver);
301 ▶         if (!this.isStrictSafeNavigationChain(receiver.receiver)) {
302 ▶           propertyReceiver.wrapForTypeChecker();
303 │         }
304 ▶         expr = new TcbExpr(`${propertyReceiver.print()}.${receiver.name}`).addParseSpanInfo(
305 │           receiver.nameSpan,
306 │         );
307 │       }
308 │     } else {
309 │       expr = this.translate(receiver);
310 │     }
311 │ 
312 │     let node: TcbExpr;
313 │ 
314 ▶     if (ast.receiver instanceof SafePropertyRead || ast.receiver instanceof SafeKeyedRead) {
315 ▶       node = this.convertToSafeCall(ast, expr, args);
316 │     } else {
317 ▶       node = new TcbExpr(`${expr.print()}(${args.map((arg) => arg.print()).join(', ')})`);
318 │     }
319 │ 
320 │     return node.addParseSpanInfo(ast.sourceSpan);
321 │   }
322 │ 
323 │   visitSafeCall(ast: SafeCall): TcbExpr {
324 │     const args = ast.args.map((expr) => this.translate(expr));
325 │     const expr = this.translate(ast.receiver).wrapForTypeChecker();
326 │     return this.convertToSafeCall(ast, expr, args).addParseSpanInfo(ast.sourceSpan);
327 │   }
```

`a.method(x)` の `a.method` は 295〜307 行目で組み立てます。まず 296 行目で `resolve`（上の 267 行目）に尋ね、テンプレートの変数でなければ 300〜306 行目でレシーバを訳して `.method` を付けます。`visitPropertyRead` と違い、`.method` の後ろは包みません。だから `(this).fn(1)` は `((this).fn)(1)` ではなく、この形になります。314〜315 行目、レシーバが `a?.b` のような安全な参照なら 6 節の `convertToSafeCall` に回し、それ以外は 317 行目で `式(引数)` です。

## 6. `?.` の訳：strictSafeNavigationTypes

`a?.b`（`visitSafePropertyRead`）は compiler-typecheck 5 節で引用しました。`strictSafeNavigationTypes` が真なら TypeScript の `?.` のまま、偽なら `(a!.b as any)` です。`a?.[k]` と `a?.()` も同じ 3 通りに分かれます。

📄 `angular/packages/compiler/src/typecheck/expression.ts` L272–288 （▶ の行: 277–280, 282, 285）

```ts
272 │   visitSafeKeyedRead(ast: SafeKeyedRead): TcbExpr {
273 │     const receiver = this.translate(ast.receiver).wrapForTypeChecker();
274 │     const key = this.translate(ast.key);
275 │     let node: TcbExpr;
276 │ 
277 ▶     if (this.config.strictSafeNavigationTypes) {
278 ▶       node = new TcbExpr(`${receiver.print()}?.[${key.print()}]`);
279 ▶     } else if (VeSafeLhsInferenceBugDetector.veWillInferAnyFor(ast)) {
280 ▶       node = new TcbExpr(`(${receiver.print()} as any)[${key.print()}]`);
281 │     } else {
282 ▶       const elementAccess = new TcbExpr(`${receiver.print()}![${key.print()}]`).addParseSpanInfo(
283 │         ast.sourceSpan,
284 │       );
285 ▶       node = new TcbExpr(`(${elementAccess.print()} as any)`);
286 │     }
287 │     return node.addParseSpanInfo(ast.sourceSpan);
288 │   }
```

📄 `angular/packages/compiler/src/typecheck/expression.ts` L415–433 （▶ の行: 419–420, 423–424, 427）

```ts
415 │   private convertToSafeCall(ast: Call | SafeCall, exprNode: TcbExpr, argNodes: TcbExpr[]): TcbExpr {
416 │     const expr = exprNode.print();
417 │     const args = argNodes.map((node) => node.print()).join(', ');
418 │ 
419 ▶     if (this.config.strictSafeNavigationTypes) {
420 ▶       return new TcbExpr(`${expr}?.(${args})`);
421 │     }
422 │ 
423 ▶     if (VeSafeLhsInferenceBugDetector.veWillInferAnyFor(ast)) {
424 ▶       return new TcbExpr(`(${expr} as any)(${args})`);
425 │     }
426 │ 
427 ▶     return new TcbExpr(`(${expr}!(${args}) as any)`);
428 │   }
429 │ 
430 │   private escapeTemplateLiteral(value: string) {
431 │     return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '$\\{');
432 │   }
433 │ 
```

1. **真（strictTemplates の既定）：TypeScript の `?.`**

   278 行目 `a?.[k]`、420 行目 `a?.(…)`。型は TypeScript が決めるので、`a` が `null` になりうれば結果に `undefined` が足されます。
2. **偽で、View Engine の推論の癖に当たる：レシーバを any に**

   280 行目 `(a as any)[k]`、424 行目 `(a as any)(…)`。
3. **偽で、癖に当たらない：`!` を付けて結果を any に**

   282〜285 行目 `(a![k] as any)`、427 行目 `(a!(…) as any)`。レシーバの `null` を消して中は検査し、結果は any にします。

### View Engine の推論の癖を再現する

📄 `angular/packages/compiler/src/typecheck/expression.ts` L463–488 （▶ の行: 466, 468, 483–484, 486–487）

```ts
463 │ class VeSafeLhsInferenceBugDetector implements AstVisitor {
464 │   private static SINGLETON = new VeSafeLhsInferenceBugDetector();
465 │ 
466 ▶   static veWillInferAnyFor(ast: Call | SafeCall | SafePropertyRead | SafeKeyedRead) {
467 │     const visitor = VeSafeLhsInferenceBugDetector.SINGLETON;
468 ▶     return ast instanceof Call ? ast.visit(visitor) : ast.receiver.visit(visitor);
469 │   }
470 │ 
471 │   visitUnary(ast: Unary): boolean {
472 │     return ast.expr.visit(this);
473 │   }
474 │   visitBinary(ast: Binary): boolean {
475 │     return ast.left.visit(this) || ast.right.visit(this);
476 │   }
477 │   visitChain(): boolean {
478 │     return false;
479 │   }
480 │   visitConditional(ast: Conditional): boolean {
481 │     return ast.condition.visit(this) || ast.trueExp.visit(this) || ast.falseExp.visit(this);
482 │   }
483 ▶   visitCall(): boolean {
484 ▶     return true;
485 │   }
486 ▶   visitSafeCall(): boolean {
487 ▶     return false;
488 │   }
```

`VeSafeLhsInferenceBugDetector` は、Ivy より前の View Engine が `?.` の左側を any と推論していた場合を見分けます。468 行目、呼び出しなら呼び出しそのもの、それ以外はレシーバを訪ね、483〜485 行目、**関数呼び出しがあれば真**（続く行で、配列・オブジェクトのリテラルと pipe も真）です。`a?.b()` の `?.()` 自体は 486〜488 行目で偽なので数えません。strictSafeNavigationTypes を偽にしている古いプロジェクトで、View Engine のときに出なかったエラーを Ivy でも出さないための互換です。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L1522–1542 （▶ の行: 1523, 1526–1527, 1538–1539）

```ts
1522 │     describe('config.strictSafeNavigationTypes (View Engine bug emulation)', () => {
1523 ▶       const TEMPLATE = `{{a.method()?.b}} {{a()?.method()}} {{a.method()?.[0]}} {{a.method()?.otherMethod?.()}}`;
1524 │       it('should check the presence of a property/method on the receiver when enabled', () => {
1525 │         const block = tcb(TEMPLATE, DIRECTIVES);
1526 ▶         expect(block).toContain('(((((this).a)).method())?.b)');
1527 ▶         expect(block).toContain('(((this).a())?.method?.())');
1528 │         expect(block).toContain('(((((this).a)).method())?.[0])');
1529 │         expect(block).toContain('((((((this).a)).method())?.otherMethod)?.())');
1530 │       });
1531 │ 
1532 │       it('should not check the presence of a property/method on the receiver when disabled', () => {
1533 │         const DISABLED_CONFIG: TypeCheckingConfig = {
1534 │           ...BASE_CONFIG,
1535 │           strictSafeNavigationTypes: false,
1536 │         };
1537 │         const block = tcb(TEMPLATE, DIRECTIVES, DISABLED_CONFIG);
1538 ▶         expect(block).toContain('(((((this).a)).method()) as any).b');
1539 ▶         expect(block).toContain('(((((this).a()) as any).method as any)())');
1540 │         expect(block).toContain('(((((this).a)).method()) as any)[0]');
1541 │         expect(block).toContain('(((((((this).a)).method()) as any).otherMethod)!() as any)');
1542 │       });
```

1523 行目の `a.method()?.b` はレシーバに呼び出しがあるので、偽のときは 1538 行目の `(… .method()) as any).b`（2 通り目）になります。1539 行目の `a()?.method()` も同じく 2 通り目です。真のときは 1526〜1527 行目のとおり、どれも TypeScript の `?.` です。

## 7. 2026-08 の修正：?. の鎖を括弧で切らない

TypeScript の `a?.b.c` は、`a` が `null` なら `.c` も読まずに `undefined` になります（短絡）。ところが `(a?.b).c` と括弧を入れると、括弧の所で鎖が切れ、`.c` は `undefined` かもしれない値を読むことになります。e9ba39d671a（2026-08-17、fix(compiler-cli): Produce correct tcb expression for optional chaining、fixes #70143）より前の TCB は、2 節の包み方のせいでこの括弧を入れていました。

📄 `手元で TypeScript に読ませたファイル（x.ts）`

```
declare const value: { foo: { bar: boolean } } | null;
// 修正前の TCB の形（?. の鎖の途中に括弧がある）
const before = (((value))?.foo).bar;
// 修正後の TCB の形
const after = ((value))?.foo.bar;
```

📄 `結果（../angular の node_modules の typescript で、2026-11-02 に実行）`

```
x.ts:4 TS2532: Object is possibly 'undefined'.
（6 行目にはエラーなし。TypeScript 6.0.3）
```

📄 `angular/packages/compiler/src/typecheck/expression.ts` L434–460 （▶ の行: 435, 438–439, 441–443, 445, 448–450, 452–454）

```ts
434 │   private isStrictSafeNavigationChain(ast: AST): boolean {
435 ▶     if (!this.config.strictSafeNavigationTypes) {
436 │       return false;
437 │     }
438 ▶     let current: AST | undefined = ast;
439 ▶     while (current) {
440 │       if (
441 ▶         current instanceof SafePropertyRead ||
442 ▶         current instanceof SafeKeyedRead ||
443 ▶         current instanceof SafeCall
444 │       ) {
445 ▶         return true;
446 │       }
447 │       if (
448 ▶         current instanceof PropertyRead ||
449 ▶         current instanceof KeyedRead ||
450 ▶         current instanceof Call
451 │       ) {
452 ▶         current = current.receiver;
453 ▶       } else if (current instanceof NonNullAssert) {
454 ▶         current = current.expression;
455 │       } else {
456 │         break;
457 │       }
458 │     }
459 │     return false;
460 │   }
```

修正は 2 つです。1 つ目がこの `isStrictSafeNavigationChain` で、修正前は「レシーバそのものが `?.` か」だけを見ていました。今は 439〜458 行目で、レシーバから `.`・`[ ]`・`( )`・`!` を内側へたどり（452〜454 行目）、どこかに `?.`（441〜443 行目）があれば真です。`visitPropertyRead`（compiler-typecheck 5 節で引用）は、これが真のとき結果を包みません。だから `a?.b.c.d` は最後まで 1 本の鎖になります。2 つ目は 6 節の 420 行目で、修正前は `(式?.(引数))` と全体を包んでいました。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L1511–1520 （▶ の行: 1512–1513, 1515, 1517–1518）

```ts
1511 │ 
1512 ▶       it('should produce correct ts expression without extra parentheses for safe navigation chains', () => {
1513 ▶         expect(tcb(`{{ a?.b.c }}`, DIRECTIVES)).toContain('((((this).a))?.b.c)');
1514 │         expect(tcb(`{{ a?.b.c.d }}`, DIRECTIVES)).toContain('((((this).a))?.b.c.d)');
1515 ▶         expect(tcb(`{{ a?.b?.c }}`, DIRECTIVES)).toContain('(((((this).a))?.b)?.c)'); // Safe property read receiver wraps
1516 │         expect(tcb(`{{ a?.b['c'].d }}`, DIRECTIVES)).toContain('((((this).a))?.b["c"].d)');
1517 ▶         expect(tcb(`{{ a?.b().c }}`, DIRECTIVES)).toContain('((((this).a))?.b?.().c)'); // convertToSafeCall no longer wraps
1518 ▶         expect(tcb(`{{ a?.b?.().c }}`, DIRECTIVES)).toContain('(((((this).a))?.b)?.().c)'); // SafeCall receiver wraps
1519 │       });
1520 │     });
```

この it は修正で書き換えられたもので、修正前は `{{ one?.two.three }}` の期待値が `(((((this).one))?.two.three))` の 1 つだけでした。1515 行目と 1518 行目のコメントのとおり、レシーバ自身が `?.` の読み（`a?.b`）のときは、そのレシーバは包まれます（visitSafePropertyRead が自分で包む）。それでも TypeScript の短絡は変わりません。同じコミットで span\_comments\_spec.ts の期待値も、`(((((this).method /*3,9*/) /*3,9*/)?.(…)) /*3,17*/)` から外側の括弧が 1 組減った形に変わりました（`git show e9ba39d671a` で確かめた）。

このサイトに入っている 22.1.6 には、同じ修正が 079a8462635（22.1.x の枝。タグは v22.1.4 から）として入っています。sourcemap から戻した 22.1.6 の expression.ts は読んでいる版と同じでした（差がある 3 ファイルに expression.ts は入っていない）。だからデモでも修正後の形が出ます。

## 8. テンプレートリテラル

📄 `angular/packages/compiler/src/typecheck/expression.ts` L329–351 （▶ の行: 334–335, 337, 341–342, 344, 346, 350）

```ts
329 │   visitTemplateLiteral(ast: TemplateLiteral): TcbExpr {
330 │     const length = ast.elements.length;
331 │     const head = ast.elements[0];
332 │     let result: string;
333 │ 
334 ▶     if (length === 1) {
335 ▶       result = `\`${this.escapeTemplateLiteral(head.text)}\``;
336 │     } else {
337 ▶       let parts = [`\`${this.escapeTemplateLiteral(head.text)}`];
338 │       const tailIndex = length - 1;
339 │ 
340 │       for (let i = 1; i < tailIndex; i++) {
341 ▶         const expr = this.translate(ast.expressions[i - 1]);
342 ▶         parts.push(`\${${expr.print()}}${this.escapeTemplateLiteral(ast.elements[i].text)}`);
343 │       }
344 ▶       const resolvedExpression = this.translate(ast.expressions[tailIndex - 1]);
345 │       parts.push(
346 ▶         `\${${resolvedExpression.print()}}${this.escapeTemplateLiteral(ast.elements[tailIndex].text)}\``,
347 │       );
348 │       result = parts.join('');
349 │     }
350 ▶     return new TcbExpr(result);
351 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L219–226 （▶ の行: 220–221, 225）

```ts
219 │   it('should handle template literals', () => {
220 ▶     expect(tcb('{{ `hello world` }}')).toContain('"" + (`hello world`);');
221 ▶     expect(tcb('{{ `hello ${name}!!!` }}')).toContain('"" + (`hello ${((this).name)}!!!`);');
222 │     expect(tcb('{{ `${a} - ${b} - ${c}` }}')).toContain(
223 │       '"" + (`${((this).a)} - ${((this).b)} - ${((this).c)}`);',
224 │     );
225 ▶     expect(tcb('{{ `a${`hello ${name}`}b` }}')).toContain('(`a${`hello ${((this).name)}`}b`)');
226 │   });
```

テンプレートリテラル（`` `hi ${name}` ``）も TypeScript のテンプレートリテラルに訳します。式が無ければ 335 行目で文字列だけ、あれば 337〜348 行目で文字の部分と `${式}` を交互に並べます。文字の部分は `escapeTemplateLiteral` で `\`・`` ` ``・`${` を逃がします。350 行目、結果には位置のコメントを付けません（中の式には付いています）。221 行目の期待値が `` `hello ${((this).name)}!!!` `` の形です。

## 9. ページの上で：同じ式を 2 つの設定で訳す

> **🧪 {{ 式 }} の TCB（strictSafeNavigationTypes の true / false）**
>
> ボタンか Enter で、このサイトに入っている @angular/compiler 22.1.6 の generateTypeCheckBlock を 2 回呼びます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-expressions)

- `TcbExpressionOp.execute()` など — ops/\*.ts
  - `tcbExpression(ast, tcb, scope)` — ops/expression.ts:33
    - `TcbExpressionTranslator.translate()` — ops/expression.ts — *resolve を渡す*
      - `astToTcbExpr(ast, resolve, config)` — expression.ts
        - `resolve(ast)` — ops/expression.ts — *変数・#ref・@let・this・pipe・$any・代入*
        - `ast.visit(TcbExprTranslator)` — expression.ts — *演算子・?.・!・リテラル…*
          - `wrapForTypeChecker()` / `addParseSpanInfo()` — ops/codegen.ts — *括弧と /\*start,end\*/*

## テストと直し方

式の訳を確かめている spec は、ほとんどが `type_check_block_spec.ts` の `describe('type check blocks')`（:27）の最初の方の it です。

- `it('should handle non-null assertions')`（:57）、`it('should handle nullish coalescing operator')`（:85）、`it('should handle typeof expressions')`（:95）、`it('should handle void expressions')`（:103）、`it('should handle assignment expressions')`（:109）、`it('should handle template literals')`（:219）。
- `describe('config.strictSafeNavigationTypes')`（:1478）と `describe('config.strictSafeNavigationTypes (View Engine bug emulation)')`（:1522）。下のコマンドの filter で 6 件が走ります。
- 位置のコメント込みの形は `span_comments_spec.ts` の `it('should annotate safe calls')`・`it('should annotate safe method calls')`。
- 診断として確かめるのは `test/ngtsc/template_typecheck_spec.ts` の `it('should properly short-circuit safe navigation chains')`（e9ba39d671a で追加。TypeScript のエラーが 0 件であること）。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=strictSafeNavigationTypes'

pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=runtime error when generating TCB|short-circuit safe navigation chains'
```

📄 `出力（抜粋。2026-11-02 に実行。ログは scratchpad/tc-logs/b-safenav.log・b-misc.log）`

```
Ran 6 of 1747 specs
6 specs, 0 failures
//packages/compiler-cli/src/ngtsc/typecheck/test:test      PASSED in 0.8s

（ngtsc は 4 つの shard。3 つは Ran 0、1 つが Ran 8 of 6754 specs）
//packages/compiler-cli/test/ngtsc:ngtsc                   PASSED in 2.2s
```

1. **直すとしたら**

   式の形は expression.ts の `TcbExprTranslator` の `visit…`（たとえば 6 節の `convertToSafeCall`、7 節の `isStrictSafeNavigationChain`）、名前に関わる形は ops/expression.ts の `resolve` です。形は type\_check\_block\_spec.ts の `tcb()` で、TypeScript がエラーを出すかどうかは template\_typecheck\_spec.ts の `env.driveDiagnostics()` で確かめます。e9ba39d671a は、この 2 つを両方足しています。
2. **括弧を変えると期待値が大量に動く**

   2 節の包み方は spec の期待値の文字列に直接出ます。e9ba39d671a でも type\_check\_block\_spec.ts と span\_comments\_spec.ts の既存の期待値が書き換わりました。括弧を 1 組変える修正では、どの it が落ちるかを先に走らせて見ます。
3. **issue を読むときの手がかり**

   「`?.` の型がおかしい」報告は、まず strictSafeNavigationTypes が真か偽か（6 節の 3 通りのどれか）、真なら TCB の括弧が鎖を切っていないか（7 節）を分けます。閉じた #37619・#37622（?. が null ではなく undefined を返す話）、#47077（?. で型が絞られない）、#70143（7 節）がこの場所です。[第 20 回](20-typecheck-issues.md)。

## 聞かれそうな質問

**Q. `?.` の結果の型が any になるのはいつですか？**

strictSafeNavigationTypes が偽のときです。expression.ts 279〜285 行目と 423〜427 行目のとおり、レシーバを any にするか、結果を `as any` にします。strictTemplates を偽にすると strictSafeNavigationTypes の既定も偽になります（[第 2 回](02-typecheck-config.md)）。真なら TypeScript の `?.` そのままなので any にはなりません。

**Q. `$any()` は TCB で何に変わりますか？**

`(式 as any)` です（ops/expression.ts 258 行目）。ただし暗黙のレシーバの上の `$any` で、引数がちょうど 1 つのときだけです（253〜255 行目）。`this.$any(x)` や `$any(x, y)` はコンポーネントの `$any` メソッドの呼び出しとして訳され、そんなメソッドは無いので TypeScript のエラーになります。

**Q. テンプレートの式で使えない TypeScript の構文はありますか？**

あります。それを決めるのは TCB ではなく式のパーサです（[式のパーサ](../compiler/05-compiler-expression-parser.md)）。たとえばプロパティバインディングや補間の中の代入はパースの段階で `Bindings cannot contain assignments` になり、TCB にはその式が `undefined` として入ります（デモの式の欄に `a = 1` と入れると確かめられる）。TCB の訳し手は、パーサが作れた AST の節点だけを TypeScript の同じ構文に写します（1 節の表）。

**Q. TCB に括弧が多すぎるのはなぜですか？**

位置のコメントを正しい節点に付けるためと、テンプレートの AST の形（優先順位）を TypeScript に並べ直させないためです。ops/codegen.ts 84〜88 行目が包むたびにコメントを内側に閉じ込め、expression.ts 87〜88 行目が二項演算子の両側を包みます。ただし `?.` の鎖の途中だけは包むと意味が変わるので、7 節の修正で包まなくなりました。

## 読み終えて

- 式の訳は 2 人で分担する。Scope を知る `resolve`（ops/expression.ts）が名前・`$any`・代入・pipe を、知らない `TcbExprTranslator`（expression.ts）が残りを訳す。
- ほとんどの演算子は TypeScript の同じ演算子に写し、両側を括弧で包む。`??` と `**` は全体も包む。
- `?.` は strictSafeNavigationTypes が真なら TypeScript の `?.`、偽なら `as any` の 2 通り（View Engine の癖の再現を含む）。
- 2026-08 の e9ba39d671a で、`?.` の鎖の途中に括弧を入れなくなった。22.1.6 にも入っている。
- 形を確かめるのは type\_check\_block\_spec の `tcb()`、TypeScript のエラーを確かめるのは template\_typecheck\_spec の `driveDiagnostics()`。

---

← 前: [Scope と TcbOp：遅れて実行される操作の表](06-typecheck-scope.md)  
次: [要素・DOM のスキーマ・ホストバインディング](08-typecheck-elements-dom.md) →
