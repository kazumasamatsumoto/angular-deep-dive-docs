[目次](../README.md) › [テンプレート型チェックの内側](README.md) › 第 14 回 / 全 20 回

# ng-template と構造ディレクティブ：ngTemplateContextGuard と ngTemplateGuard\_

> &lt;ng-template&gt; の let- 変数の型を、ディレクティブの静的メソッド ngTemplateContextGuard で決める行と、\*ngIf の型の絞り込みを ngTemplateGuard\_ で表す仕組み（invocation と binding）。applyTemplateContextGuards が偽のとき、ng-template に型引数を付けたいという長く開いている issue。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-template-guards)

---

`*ngIf="user"` の中で `user.name` が「null かもしれない」と言われないのは、`@if` と違ってコンパイラが `NgIf` のことを知っているからではありません。`NgIf` のクラスに **静的メンバ**`ngTemplateGuard_ngIf` と `ngTemplateContextGuard` があり、型チェックはそれを見て TCB の `if` の条件を組み立てます。この章では、その静的メンバを compiler-cli が集める行、`TcbTemplateBodyOp` がそれを `if` の条件にする行、`let-` 変数を文脈の変数から読む行を追い、`applyTemplateContextGuards` が偽のときに何が消えるか、長く開いている issue #28731（ng-template に型を付けたい）と #46749（引数の無い構造ディレクティブ）を TCB の形から読みます。

読む対象は `packages/compiler/src/typecheck/ops/template.ts`（全部）・`ops/variables.ts` の `TcbTemplateVariableOp`・`ops/scope.ts` の `Template` を足す行、`packages/compiler-cli/src/ngtsc/metadata/src/util.ts` の `extractDirectiveTypeCheckMeta`、`packages/common/src/directives/ng_if.ts`・`ng_for_of.ts` です。

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
13. [13. 制御フロー](13-typecheck-control-flow.md)
14. **14. ng-template のガード**（この章）
15. [15. 参照と pipe](15-typecheck-refs-pipes.md)
16. [16. 診断の対応付け](16-typecheck-diagnostics-mapping.md)
17. [17. 帯域外の診断](17-typecheck-oob.md)
18. [18. 拡張診断](18-typecheck-extended.md)
19. [19. TemplateTypeChecker](19-typecheck-template-type-checker.md)
20. [20. issue と PR を読む](20-typecheck-issues.md)

## 1. 先に結果：\*ngIf の TCB

`<div *ngIf="user as u; else none">{{ u.name }} {{ user.name }}</div>` を、この章のデモ（7 節）で `NgIf` と同じ静的メンバを持つディレクティブとして型チェックすると、次の TCB になります（位置のコメントを消し、`#none` の参照の 2 行 `_t2`・`_t3` を省いたもの）。`*ngIf` は `<ng-template [ngIf]="user"><div>…</div></ng-template>` の略記なので、R3 AST では `Template` ノードです。

- `var _t1 = _ctor_NgIf({ "ngIf": (this).user, "ngIfElse": _t2 })` — ディレクティブの値（[第 9 回](09-typecheck-type-constructor.md)の型コンストラクタ）
- `_t1.ngIf = (this).user;` — 入力への代入（[第 10 回](10-typecheck-inputs.md)）
- `var _t4 = null! as any;` — テンプレートの文脈の変数（2 節）
- `if (NgIf.ngTemplateContextGuard(_t1, _t4) && (this).user) {` — 2 つのガード（4・5 節）
  - `var _t5 = (_t4.ngIf);` — `as u` の `u`（3 節）
  - `"" + _t5.name + (this).user.name;` — 本体
- `}`

`if` の条件の左が文脈の変数 `_t4` を `NgIfContext<…>` に絞り、右が `this.user` そのものを truthy に絞ります。2 つが別々の仕組みです。順に作られ方を見ます。

## 2. Template ノードを積む行と、文脈の変数

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L501–513 （▶ の行: 503–504, 506–511, 513）

```ts
501 │     } else if (node instanceof Template) {
502 │       // Template children are rendered in a child scope.
503 ▶       this.appendDirectivesAndInputsOfElementLikeNode(node);
504 ▶       this.appendOutputsOfElementLikeNode(node, node.inputs, node.outputs);
505 │       this.appendSelectorlessDirectives(node);
506 ▶       const ctxIndex = this.opQueue.push(new TcbTemplateContextOp(this.tcb, this)) - 1;
507 ▶       this.templateCtxOpMap.set(node, ctxIndex);
508 ▶       if (this.tcb.env.config.checkTemplateBodies) {
509 ▶         this.opQueue.push(new TcbTemplateBodyOp(this.tcb, this, node));
510 ▶       } else if (this.tcb.env.config.alwaysCheckSchemaInTemplateBodies) {
511 ▶         this.appendDeepSchemaChecks(node.children);
512 │       }
513 ▶       this.checkAndAppendReferencesOfNode(node);
```
*Scope.appendNode の中の Template の分岐*

📄 `angular/packages/compiler/src/typecheck/ops/template.ts` L16–39 （▶ の行: 30, 33–36）

```ts
16 │ /**
17 │  * A `TcbOp` which generates a variable for a `Template`'s context.
18 │  *
19 │  * Executing this operation returns a reference to the template's context variable.
20 │  */
21 │ export class TcbTemplateContextOp extends TcbOp {
22 │   constructor(
23 │     private tcb: Context,
24 │     private scope: Scope,
25 │   ) {
26 │     super();
27 │   }
28 │ 
29 │   // The declaration of the context variable is only needed when the context is actually referenced.
30 ▶   override readonly optional = true;
31 │ 
32 │   override execute(): TcbExpr {
33 ▶     // Allocate a template ctx variable and declare it with an 'any' type. The type of this variable
34 ▶     // may be narrowed as a result of template guard conditions.
35 ▶     const ctx = new TcbExpr(this.tcb.allocateId());
36 ▶     this.scope.addStatement(declareVariable(ctx, new TcbExpr('any')));
37 │     return ctx;
38 │   }
39 │ }
```

1. **503〜505 行目：`<ng-template>` に付いたディレクティブ・入力・出力**

   `NgIf` の op（`var _t1 = …`）と `_t1.ngIf = …` はここで積まれます（中身は第 9・10 回）。
2. **506〜507 行目：文脈の変数の op を積み、`templateCtxOpMap` に覚える**

   `TcbTemplateContextOp` は 30 行目で optional です。35〜36 行目、誰かが文脈を参照したときだけ `var _tN = null! as any` を書きます。型は `any` で始まり、33〜34 行目のコメントのとおり、ガードで絞られることを前提にしています。**ガードが無ければ、文脈は `any` のまま**です（6 節）。
3. **508〜512 行目：`checkTemplateBodies` が真のときだけ本体の op**

   偽なら `TcbTemplateBodyOp` を積まず、510〜511 行目、`alwaysCheckSchemaInTemplateBodies` が真なら中の要素の DOM スキーマ（知らない要素・属性）だけを調べます（[第 8 回](08-typecheck-elements-dom.md)）。`strictTemplates: false` にすると `*ngIf` の中が検査されないのはこの行です。
4. **513 行目：`#ref`**

   `<ng-template #none>` の参照の op。`TemplateRef<any>` になる理由は[第 15 回](15-typecheck-refs-pipes.md)です。

## 3. let- 変数：文脈の変数のプロパティを読む

`let-item`・`index as i`・`as u` は、`Scope.forNodes` が `Template` の子の Scope を作るとき、`variables` の 1 つずつを `TcbTemplateVariableOp` として登録します（同じ名前が 2 回あれば `duplicateTemplateVar` の帯域外の診断。その行は[第 6 回](06-typecheck-scope.md)で引用されています）。

📄 `angular/packages/compiler/src/typecheck/ops/variables.ts` L43–83 （▶ の行: 59–60, 65, 69–70, 74–75, 78）

```ts
43 │ /**
44 │  * A `TcbOp` which creates an expression for particular let- `Variable` on a
45 │  * `Template`'s context.
46 │  *
47 │  * Executing this operation returns a reference to the variable variable (lol).
48 │  */
49 │ export class TcbTemplateVariableOp extends TcbOp {
50 │   constructor(
51 │     private tcb: Context,
52 │     private scope: Scope,
53 │     private template: Template,
54 │     private variable: Variable,
55 │   ) {
56 │     super();
57 │   }
58 │ 
59 ▶   override get optional() {
60 ▶     return false;
61 │   }
62 │ 
63 │   override execute(): TcbExpr {
64 │     // Look for a context variable for the template.
65 ▶     const ctx = this.scope.resolve(this.template);
66 │ 
67 │     // Allocate an identifier for the Variable, and initialize it to a read of the variable
68 │     // on the template context.
69 ▶     const id = new TcbExpr(this.tcb.allocateId());
70 ▶     const initializer = new TcbExpr(`${ctx.print()}.${this.variable.value || '$implicit'}`);
71 │     id.addParseSpanInfo(this.variable.keySpan);
72 │ 
73 │     // Declare the variable, and return its identifier.
74 ▶     if (this.variable.valueSpan !== undefined) {
75 ▶       initializer.addParseSpanInfo(this.variable.valueSpan).wrapForTypeChecker();
76 │     } else {
77 │     }
78 ▶     const variable = new TcbExpr(`var ${id.print()} = ${initializer.print()}`);
79 │     variable.addParseSpanInfo(this.variable.sourceSpan);
80 │     this.scope.addStatement(variable);
81 │     return id;
82 │   }
83 │ }
```

1. **65 行目：文脈の変数を引く**

   `this.scope.resolve(this.template)` は、親の Scope の `templateCtxOpMap`（2 節 507 行目）から `TcbTemplateContextOp` を実行させ、`_t4` を返します。ここで初めて `var _t4 = null! as any` が書かれます。
2. **70 行目：`_t4.ngIf` か `_t4.$implicit`**

   `as u` は `let-u="ngIf"` の略記なので `value` が `ngIf`、`let-row` のように値を書かなければ `$implicit` です。74〜75 行目、値を書いた（`valueSpan` がある）ときだけ括弧で包み、位置のコメントを付けます。
3. **59〜61 行目：optional ではない**

   `let-` 変数は読まれなくても宣言されます。そのため `let-` 変数が 1 つでもあれば、文脈の変数 `_t4` も必ず出ます。宣言の場所は `Template` の子の Scope、つまり 4 節の `if (ガード) {` の中なので、TypeScript は絞られた後の `_t4` からプロパティの型を読みます。

## 4. TcbTemplateBodyOp：ガードを集めて if にする

📄 `angular/packages/compiler/src/typecheck/ops/template.ts` L61–98 （▶ の行: 73, 76, 79, 82, 86, 91, 94–96）

```ts
61 │   override execute(): null {
62 │     // An `if` will be constructed, within which the template's children will be type checked. The
63 │     // `if` is used for two reasons: it creates a new syntactic scope, isolating variables declared
64 │     // in the template's TCB from the outer context, and it allows any directives on the templates
65 │     // to perform type narrowing of either expressions or the template's context.
66 │     //
67 │     // The guard is the `if` block's condition. It's usually set to `true` but directives that exist
68 │     // on the template can trigger extra guard expressions that serve to narrow types within the
69 │     // `if`. `guard` is calculated by starting with `true` and adding other conditions as needed.
70 │     // Collect these into `guards` by processing the directives.
71 │ 
72 │     // By default the guard is simply `true`.
73 ▶     let guard: TcbExpr | null = null;
74 │     const directiveGuards: TcbExpr[] = [];
75 │ 
76 ▶     this.addDirectiveGuards(
77 │       directiveGuards,
78 │       this.template,
79 ▶       this.tcb.boundTarget.getDirectivesOfNode(this.template),
80 │     );
81 │ 
82 ▶     for (const directive of this.template.directives) {
83 │       this.addDirectiveGuards(
84 │         directiveGuards,
85 │         directive,
86 ▶         this.tcb.boundTarget.getDirectivesOfNode(directive),
87 │       );
88 │     }
89 │ 
90 │     // If there are any guards from directives, use them instead.
91 ▶     if (directiveGuards.length > 0) {
92 │       // Pop the first value and use it as the initializer to reduce(). This way, a single guard
93 │       // will be used on its own, but two or more will be combined into binary AND expressions.
94 ▶       guard = directiveGuards.reduce(
95 ▶         (expr, dirGuard) => new TcbExpr(`${expr.print()} && ${dirGuard.print()}`),
96 ▶         directiveGuards.pop()!,
97 │       );
98 │     }
```

📄 `angular/packages/compiler/src/typecheck/ops/template.ts` L100–130 （▶ の行: 102, 106, 110–111, 118, 121–122, 125, 127）

```ts
100 │     // Create a new Scope for the template. This constructs the list of operations for the template
101 │     // children, as well as tracks bindings within the template.
102 ▶     const tmplScope = this.scope.createChildScope(
103 │       this.scope,
104 │       this.template,
105 │       this.template.children,
106 ▶       guard,
107 │     );
108 │ 
109 │     // Render the template's `Scope` into its statements.
110 ▶     const statements = tmplScope.render();
111 ▶     if (statements.length === 0) {
112 │       // As an optimization, don't generate the scope's block if it has no statements. This is
113 │       // beneficial for templates that contain for example `<span *ngIf="first"></span>`, in which
114 │       // case there's no need to render the `NgIf` guard expression. This seems like a minor
115 │       // improvement, however it reduces the number of flow-node antecedents that TypeScript needs
116 │       // to keep into account for such cases, resulting in an overall reduction of
117 │       // type-checking time.
118 ▶       return null;
119 │     }
120 │ 
121 ▶     let tmplBlock = `{\n${getStatementsBlock(statements)}}`;
122 ▶     if (guard !== null) {
123 │       // The scope has a guard that needs to be applied, so wrap the template block into an `if`
124 │       // statement containing the guard expression.
125 ▶       tmplBlock = `if (${guard.print()}) ${tmplBlock}`;
126 │     }
127 ▶     this.scope.addStatement(new TcbExpr(tmplBlock));
128 │ 
129 │     return null;
130 │   }
```

1. **76〜80 行目：`<ng-template>` に照合されたディレクティブのガード**

   79 行目、BoundTarget（[ディレクティブの照合](../compiler/09-compiler-binder.md)の結果）から、この Template に付いたディレクティブを全部取り、`addDirectiveGuards`（5 節）に渡します。
2. **82〜88 行目：selectorless の書き方で付けたディレクティブ**

   `this.template.directives` は、セレクタを使わずに要素へ直接付けたディレクティブ（R3 AST の `Directive` ノード）です。同じように集めます。
3. **91〜97 行目：複数のガードは `&&` でつなぐ**

   96 行目で最後のガードを `pop` して初期値にし、残りを 95 行目で `&&` に積みます。1 節の `NgIf.ngTemplateContextGuard(…) && (this).user` がこれです。
4. **102〜107 行目：ガードを子の Scope にも渡す**

   106 行目、子の Scope の `guard` になります。`(click)` のハンドラの中は、[第 13 回](13-typecheck-control-flow.md)の `@switch` と同じく、このガードを `if` にもう一度書いて絞り直します。
5. **111〜118 行目：本体に文が無ければ、ガードごと書かない**

   `<span *ngIf="first"></span>` のように本体が静的なら何も足しません。コメントによれば、TypeScript がたどる制御フローの分岐が減り、型検査の時間が減るためです。デモで `<div *ngIf="user">static</div>` を試すと、`if` は消えますが `var _t2 = null! as any` は残ります。ガードの式を作る 5 節の 187 行目で文脈の変数を引いた後に、本体が空だと分かるからです。
6. **121〜127 行目：`{ … }` か `if (ガード) { … }`**

   ガードが無くても `{ }` のブロックにはします。63〜65 行目のコメントのとおり、テンプレートの中の変数を外の Scope から切り離すためです。

## 5. addDirectiveGuards：invocation と binding、そして文脈のガード

📄 `angular/packages/compiler/src/typecheck/ops/template.ts` L132–166 （▶ の行: 144–145, 150, 152–153, 155–156, 161, 165）

```ts
132 │   private addDirectiveGuards(
133 │     guards: TcbExpr[],
134 │     hostNode: Template | Directive,
135 │     directives: TcbDirectiveMetadata[] | null,
136 │   ) {
137 │     if (directives === null || directives.length === 0) {
138 │       return;
139 │     }
140 │ 
141 │     const isTemplate = hostNode instanceof Template;
142 │ 
143 │     for (const dir of directives) {
144 ▶       const dirInstId = this.scope.resolve(hostNode, dir);
145 ▶       const dirId = this.tcb.env.referenceTcbValue(dir.ref);
146 │ 
147 │       // There are two kinds of guards. Template guards (ngTemplateGuards) allow type narrowing of
148 │       // the expression passed to an @Input of the directive. Scan the directive to see if it has
149 │       // any template guards, and generate them if needed.
150 ▶       dir.ngTemplateGuards.forEach((guard: TemplateGuardMeta) => {
151 │         // For each template guard function on the directive, look for a binding to that input.
152 ▶         const boundInput =
153 ▶           hostNode.inputs.find((i) => i.name === guard.inputName) ||
154 │           (isTemplate
155 ▶             ? hostNode.templateAttrs.find((input): input is BoundAttribute => {
156 ▶                 return input instanceof BoundAttribute && input.name === guard.inputName;
157 │               })
158 │             : undefined);
159 │         if (boundInput !== undefined) {
160 │           // If there is such a binding, generate an expression for it.
161 ▶           const expr = tcbExpression(boundInput.value, this.tcb, this.scope);
162 │ 
163 │           // The expression has already been checked in the type constructor invocation, so
164 │           // it should be ignored when used within a template guard.
165 ▶           expr.markIgnoreDiagnostics();
166 │ 
```

📄 `angular/packages/compiler/src/typecheck/ops/template.ts` L167–198 （▶ の行: 167, 169, 173–174, 177, 185–187, 189, 192–193）

```ts
167 ▶           if (guard.type === 'binding') {
168 │             // Use the binding expression itself as guard.
169 ▶             guards.push(expr);
170 │           } else {
171 │             // Call the guard function on the directive with the directive instance and that
172 │             // expression.
173 ▶             const guardInvoke = new TcbExpr(
174 ▶               `${dirId.print()}.ngTemplateGuard_${guard.inputName}(${dirInstId.print()}, ${expr.print()})`,
175 │             );
176 │ 
177 ▶             guardInvoke.addParseSpanInfo(boundInput.value.sourceSpan);
178 │             guards.push(guardInvoke);
179 │           }
180 │         }
181 │       });
182 │ 
183 │       // The second kind of guard is a template context guard. This guard narrows the template
184 │       // rendering context variable `ctx`.
185 ▶       if (dir.hasNgTemplateContextGuard) {
186 ▶         if (this.tcb.env.config.applyTemplateContextGuards) {
187 ▶           const ctx = this.scope.resolve(hostNode);
188 │           const guardInvoke = new TcbExpr(
189 ▶             `${dirId.print()}.ngTemplateContextGuard(${dirInstId.print()}, ${ctx.print()})`,
190 │           );
191 │ 
192 ▶           guardInvoke.markIgnoreDiagnostics();
193 ▶           guardInvoke.addParseSpanInfo(hostNode.sourceSpan);
194 │           guards.push(guardInvoke);
195 │         }
196 │       }
197 │     }
198 │   }
```

1. **144〜145 行目：ディレクティブのインスタンスとクラス**

   `dirInstId` は 1 節の `_t1`（インスタンスの変数）、`dirId` はクラスそのもの（静的メンバを呼ぶため）です。
2. **150〜158 行目：`ngTemplateGuard_ngIf` なら、入力 `ngIf` に結んだ式を探す**

   153 行目は `<ng-template [ngIf]="…">` の `inputs`、155〜157 行目は `*ngIf="…"` の略記から作られた `templateAttrs` です。どちらにも無ければ（入力に何も結んでいなければ）ガードは作りません。
3. **161・165 行目：式を訳し、`/*D:ignore*/` を付ける**

   同じ式は入力への代入で既に検査したので（163〜164 行目のコメント）、ガードの中ではエラーを出しません。
4. **167〜169 行目：`'binding'` は式そのものをガードに**

   `NgIf` はこれです。`*ngIf="user"` なら `if ((this).user)`、`*ngIf="person !== null"` なら `if ((this).person !== null)`。TypeScript がその式で絞り込みます。
5. **173〜175 行目：`'invocation'` は静的メソッドの呼び出しに**

   `Dir.ngTemplateGuard_xxx(_t1, 式)`。ディレクティブ側でそのメソッドを `static ngTemplateGuard_xxx(dir: Dir, value: X | null): value is X` のような **型の述語**（戻り値が `value is X` の関数。true を返した後では value を X として扱える）で宣言すれば、その述語どおりに絞られます。
6. **185〜195 行目：文脈のガード `ngTemplateContextGuard`**

   186 行目、`applyTemplateContextGuards` が真のときだけ。187 行目で文脈の変数（2 節）を引き、189 行目で `Dir.ngTemplateContextGuard(_t1, _t4)` にします。ディレクティブが `static ngTemplateContextGuard(dir, ctx: any): ctx is NgIfContext<…>` と宣言していれば、`if` の中で `_t4` の型が `any` から `NgIfContext<…>` に変わります。192 行目、この呼び出しには `/*D:ignore*/` を付けます（ユーザーが書いた式ではないので）。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L1027–1065 （▶ の行: 1037, 1044, 1057, 1062, 1064）

```ts
1027 │     it('should emit invocation guards', () => {
1028 │       const DIRECTIVES: TestDeclaration[] = [
1029 │         {
1030 │           type: 'directive',
1031 │           name: 'NgIf',
1032 │           selector: '[ngIf]',
1033 │           inputs: {'ngIf': 'ngIf'},
1034 │           ngTemplateGuards: [
1035 │             {
1036 │               inputName: 'ngIf',
1037 ▶               type: 'invocation',
1038 │             },
1039 │           ],
1040 │         },
1041 │       ];
1042 │       const TEMPLATE = `<div *ngIf="person">{{person.name}}</div>`;
1043 │       const block = tcb(TEMPLATE, DIRECTIVES);
1044 ▶       expect(block).toContain('if (i0.NgIf.ngTemplateGuard_ngIf(_t1, ((this).person)))');
1045 │     });
1046 │ 
1047 │     it('should emit binding guards', () => {
1048 │       const DIRECTIVES: TestDeclaration[] = [
1049 │         {
1050 │           type: 'directive',
1051 │           name: 'NgIf',
1052 │           selector: '[ngIf]',
1053 │           inputs: {'ngIf': 'ngIf'},
1054 │           ngTemplateGuards: [
1055 │             {
1056 │               inputName: 'ngIf',
1057 ▶               type: 'binding',
1058 │             },
1059 │           ],
1060 │         },
1061 │       ];
1062 ▶       const TEMPLATE = `<div *ngIf="person !== null">{{person.name}}</div>`;
1063 │       const block = tcb(TEMPLATE, DIRECTIVES);
1064 ▶       expect(block).toContain('if ((((this).person)) !== (null))');
1065 │     });
```

1044 行目が invocation、1064 行目が binding の期待値です（テスト用の環境では外の記号に `i0.` が付きます）。

## 6. 静的メンバはどこで集めるか：compiler-cli の metadata

📄 `angular/packages/compiler-cli/src/ngtsc/metadata/src/util.ts` L185–208 （▶ の行: 189–190, 203–204, 206–207）

```ts
185 │   const publicMethods = new Set<string>();
186 │   const staticMembers: ClassMember[] = [];
187 │ 
188 │   for (const member of members) {
189 ▶     if (member.isStatic) {
190 ▶       staticMembers.push(member);
191 │     }
192 │ 
193 │     if (
194 │       member.kind === ClassMemberKind.Method &&
195 │       !member.isStatic &&
196 │       (member.accessLevel === ClassMemberAccessLevel.PublicReadonly ||
197 │         member.accessLevel === ClassMemberAccessLevel.PublicWritable)
198 │     ) {
199 │       publicMethods.add(member.name);
200 │     }
201 │   }
202 │ 
203 ▶   const ngTemplateGuards = staticMembers
204 ▶     .map(extractTemplateGuard)
205 │     .filter((guard): guard is TemplateGuardMeta => guard !== null);
206 ▶   const hasNgTemplateContextGuard = staticMembers.some(
207 ▶     (member) => member.kind === ClassMemberKind.Method && member.name === 'ngTemplateContextGuard',
208 │   );
```
*extractDirectiveTypeCheckMeta（ディレクティブとコンポーネントの handler、.d.ts を読む DtsMetadataReader から呼ばれる）*

📄 `angular/packages/compiler-cli/src/ngtsc/metadata/src/util.ts` L271–296 （▶ の行: 272, 275–276, 280–281, 287–288, 291–292）

```ts
271 │ function extractTemplateGuard(member: ClassMember): TemplateGuardMeta | null {
272 ▶   if (!member.name.startsWith('ngTemplateGuard_')) {
273 │     return null;
274 │   }
275 ▶   const inputName = afterUnderscore(member.name);
276 ▶   if (member.kind === ClassMemberKind.Property) {
277 │     let type: string | null = null;
278 │     if (
279 │       member.type !== null &&
280 ▶       ts.isLiteralTypeNode(member.type) &&
281 ▶       ts.isStringLiteral(member.type.literal)
282 │     ) {
283 │       type = member.type.literal.text;
284 │     }
285 │ 
286 │     // Only property members with string literal type 'binding' are considered as template guard.
287 ▶     if (type !== 'binding') {
288 ▶       return null;
289 │     }
290 │     return {inputName, type};
291 ▶   } else if (member.kind === ClassMemberKind.Method) {
292 ▶     return {inputName, type: 'invocation'};
293 │   } else {
294 │     return null;
295 │   }
296 │ }
```

1. **189〜191 行目：クラスの static なメンバだけを集める**

   メンバの一覧はリフレクション（TypeScript の構文木からクラスの形を読む層）の `ClassMember` です。.ts のソースでも .d.ts でも同じ形で取れます。
2. **272・275 行目：名前が `ngTemplateGuard_` で始まるものだけ。`_` の後ろが入力の名前**

   入力の「クラスのプロパティ名」ではなく、5 節 153 行目で `i.name`（テンプレートでの名前）と比べるので、エイリアスを付けた入力ではテンプレートでの名前を書きます。
3. **276〜290 行目：プロパティなら、型が文字列リテラル `'binding'` のときだけ**

   287〜289 行目、`static ngTemplateGuard_x: boolean` のような型は無視されます。`static ngTemplateGuard_ngIf: 'binding'` と **型の位置に**書く必要があります。
4. **291〜292 行目：メソッドなら、どんな形でも invocation**

   型の述語になっているかは調べません。述語でなければ TypeScript が絞らないだけで、エラーにはなりません。
5. **206〜208 行目：`ngTemplateContextGuard` という名前の static メソッドがあるか**

   真偽だけを覚えます。呼び出しの形は 5 節 189 行目で固定です。

### NgIf と NgForOf の実物

📄 `angular/packages/common/src/directives/ng_if.ts` L240–276 （▶ の行: 241, 251, 259–262, 274–275）

```ts
240 │   /** @internal */
241 ▶   public static ngIfUseIfTypeGuard: void;
242 │ 
243 │   /**
244 │    * Assert the correct type of the expression bound to the `ngIf` input within the template.
245 │    *
246 │    * The presence of this static field is a signal to the Ivy template type check compiler that
247 │    * when the `NgIf` structural directive renders its template, the type of the expression bound
248 │    * to `ngIf` should be narrowed in some way. For `NgIf`, the binding expression itself is used to
249 │    * narrow its type, which allows the strictNullChecks feature of TypeScript to work with `NgIf`.
250 │    */
251 ▶   static ngTemplateGuard_ngIf: 'binding';
252 │ 
253 │   /**
254 │    * Asserts the correct type of the context for the template that `NgIf` will render.
255 │    *
256 │    * The presence of this method is a signal to the Ivy template type-check compiler that the
257 │    * `NgIf` structural directive renders its template with a specific context type.
258 │    */
259 ▶   static ngTemplateContextGuard<T>(
260 ▶     dir: NgIf<T>,
261 ▶     ctx: any,
262 ▶   ): ctx is NgIfContext<Exclude<T, false | 0 | '' | null | undefined>> {
263 │     return true;
264 │   }
265 │ }
266 │ 
267 │ /**
268 │  * @publicApi
269 │  *
270 │  * @deprecated 20.0
271 │  * The ngIf directive is deprecated in favor of the @if block instead.
272 │  */
273 │ export class NgIfContext<T = unknown> {
274 ▶   public $implicit: T = null!;
275 ▶   public ngIf: T = null!;
276 │ }
```

📄 `angular/packages/common/src/directives/ng_for_of.ts` L327–338 （▶ の行: 333–336）

```ts
327 │   /**
328 │    * Asserts the correct type of the context for the template that `NgForOf` will render.
329 │    *
330 │    * The presence of this method is a signal to the Ivy template type-check compiler that the
331 │    * `NgForOf` structural directive renders its template with a specific context type.
332 │    */
333 ▶   static ngTemplateContextGuard<T, U extends NgIterable<T>>(
334 ▶     dir: NgForOf<T, U>,
335 ▶     ctx: any,
336 ▶   ): ctx is NgForOfContext<T, U> {
337 │     return true;
338 │   }
```

251 行目が binding のガード、259〜264 行目が文脈のガードです。262 行目、文脈は `NgIfContext<Exclude<T, false | 0 | '' | null | undefined>>`、つまり **falsy な型を除いた T** です。`as u` の `u`（`ngIf`、275 行目）が `null` を含まないのはこの `Exclude` のためです。241 行目の `ngIfUseIfTypeGuard` は `ngTemplateGuard_` で始まらないので 6 節 272 行目で捨てられます（packages の .ts を grep して、この名前が出るのはこの宣言だけでした）。333〜336 行目、`NgForOf` は文脈のガードだけを持ち、入力の式を絞る `ngTemplateGuard_` はありません。

## 7. デモ：ガードを持つディレクティブで TCB を作る

> **🧪 DEMO — このページの @angular/compiler（22.1.6）の generateTypeCheckBlock に、ガードを持つディレクティブを渡す**
>
> ディレクティブは本物の `@angular/common` ではなく、6 節の `extractDirectiveTypeCheckMeta` が返すのと同じ `ngTemplateGuards` / `hasNgTemplateContextGuard` を持たせたデモ用のメタデータです。ボタンを押したときだけ動きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-template-guards)

見るところ（2026-11-02 に Node で同じ 22.1.6 を呼んで確かめた出力です）：

- **\*ngIf**：1 節の形。`applyTemplateContextGuards` を切ると、条件が `if (((this).user) /*D:ignore*/)` だけになります。`checkTemplateBodies` を切ると、`_t1.ngIf = …` までで `if` の塊そのものが消えます（2 節 508 行目）。
- **invocation**：`if (IfLoaded.ngTemplateGuard_ifLoaded(_t1, ((this).state) /*D:ignore*/))`。文脈のガードは無いので、条件はこれ 1 つです。
- **\*ngFor**：`if (NgForOf.ngTemplateContextGuard(_t1, _t2))` の中に `var _t3 = _t2.$implicit;` と `var _t4 = (_t2.index);`。値を書いた `index as i` だけが括弧に包まれます（3 節 74〜75 行目）。
- **型付きの ng-template**：`[typedContext]` を付けた方だけ `if (TypedContext.ngTemplateContextGuard(_t1, _t2))` に包まれ、付けない方は `{ var _t5 = _t4.$implicit; … }` で、`_t4` は `any` のままです。

TypeScript そのものはブラウザで動かしていません。手元で、TCB の前に `NgIf` と同じ静的メンバを持つクラス（262 行目と同じ `Exclude` の文脈のガード）と `class DemoCmp { user: {name: string} | null }` を置き、../angular の TypeScript 6.0.3（`strict: true`）で型検査した結果です。

| ガード | `{{ user.name }}` | `{{ u.nmae }}`（打ち間違い） |
| --- | --- | --- |
| 両方（既定） | エラーなし | `TS2339: Property 'nmae' does not exist on type '{ name: string; }'.` |
| 文脈のガードだけ（binding を外す） | `TS2531: Object is possibly 'null'.` | （`u` は絞られる） |
| binding だけ（`applyTemplateContextGuards: false`） | エラーなし | **エラーなし**（`u` が `any`） |

## 8. 開いている issue を TCB の形から読む

### #28731「Define generic of ng-template」（2019-02-14、コメント 44）

`<ng-template #tpl let-item let-index="index">` を後で `*ngTemplateOutlet` に渡すとき、`item` の型をテンプレートの中で付けたい、という要望です（ラベルは `feature: under consideration`。`gh pr list --search 28731` では PR は見つかりませんでした）。TCB で見ると理由ははっきりしています。ディレクティブの付かない `<ng-template>` には 4 節のガードが 1 つも無いので、文脈の変数は 2 節 36 行目の `any` のまま、`let-item` は 3 節 70 行目の `_t4.$implicit` で、型も `any` になります。

issue のコメントで共有されている回避策は、まさに 5 節 185〜195 行目を使うものです。`ng-template[typedContext]` に付く小さなディレクティブに `static ngTemplateContextGuard<T>(dir: TypedContext<T>, ctx: unknown): ctx is { $implicit: T }` を書き、`[typedContext]="型の見本の値"` で `T` を推論させます。デモの「型付きの ng-template」がその TCB で、手元の TypeScript では `{{ row.nmae }}` に `TS2339: Property 'nmae' does not exist on type '{ name: string; }'.` が出ました（付けない方はエラーなし）。もう 1 つ、`#tpl` の参照の型が `TemplateRef<any>` 固定なのも同じ問題の別の面で、ソースのコメントに「まだ TODO」と書かれています（[第 15 回](15-typecheck-refs-pipes.md)）。

### #46749「Type checking for structural directive without parameter」（2022-07-08、コメント 5）

`<h1 *appUnless>` は型エラーになり、`<ng-template [appUnless]>` はならない、という報告です。デモの「引数の無い構造ディレクティブ」を作ると、今の TCB では `*appUnless` が `_t1.appUnless = ("")`（属性として空文字）、`[appUnless]` が `_t1.appUnless = (undefined)`（空の式）になります。入力を `appUnless: boolean` にして手元の TypeScript にかけると、前者は `TS2322: Type 'string' is not assignable to type 'boolean'.`、後者は `TS2322: Type 'undefined' is not assignable to type 'boolean'.` でした。issue のコメントでは、alxhub さんが「`<div *test>` では実行時に setter が呼ばれず、`<div test>` と `<ng-template test>` では呼ばれる」と確かめ、JoostK さんが実行時に `null` を入れる PR #36002 が入らずに閉じたことを書いています（#36002 は CLOSED）。つまり論点は TCB の形と実行時の値の食い違いで、2022 年の報告の版と今の TCB の形が同じかはここでは確かめていません。この章で確かめたのは今の TCB の形だけです。

## ここまでの呼び出し

- 👤 `NgIf` のクラスの `static ngTemplateGuard_ngIf: 'binding'` と `static ngTemplateContextGuard()`
  - `extractDirectiveTypeCheckMeta()` → `extractTemplateGuard()` — ngtsc/metadata/src/util.ts L179 / L271 — *ngTemplateGuards・hasNgTemplateContextGuard*
  - `generateTypeCheckBlock()` → `Scope.appendNode(Template)` — compiler/src/typecheck/ops/scope.ts L501
    - `TcbTemplateContextOp`（optional） — ops/template.ts L21 — *var \_t4 = null! as any*
    - `TcbTemplateBodyOp.execute()` — ops/template.ts L61
      - `addDirectiveGuards()` — ops/template.ts L132 — *binding: 式 / invocation: Dir.ngTemplateGuard\_x() / Dir.ngTemplateContextGuard()*
      - `createChildScope(template, children, guard)` → `TcbTemplateVariableOp` — ops/variables.ts L49 — *var \_t5 = (\_t4.ngIf)*
      - `if (ガード && …) { … }` — ops/template.ts L125
- 👤 TypeScript が型の述語で `_t4` と式を絞る

## テストと直し方

- type\_check\_block\_spec.ts の `describe('template guards')`（:1026）— it 3 本。`it('should emit invocation guards')`（:1027）、`it('should emit binding guards')`（:1047）、`it('should not emit guards when the child scope is empty')`（:1067、4 節 111〜118 行目）。
- 同じファイルの `describe('config.applyTemplateContextGuards')`（:1199）— it 2 本。下の引用。`describe('config.checkTemplateBodies')`（:1217）— it 4 本。
- 実際の `@angular/common` を使う形は test/ngtsc/template\_typecheck\_spec.ts の `it('should infer the context of NgIf')`（:1798、`user.nonExistingProp` の TS2339 を期待）、`it('should infer the context of NgFor')`（:1741）、`it('should check usage of NgIf with explicit non-null guard')`（:1421）など。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L1199–1215 （▶ の行: 1200–1201, 1205, 1210, 1213）

```ts
1199 │     describe('config.applyTemplateContextGuards', () => {
1200 ▶       const TEMPLATE = `<div *dir>{{ value }}</div>`;
1201 ▶       const GUARD_APPLIED = 'if (i0.Dir.ngTemplateContextGuard(';
1202 │ 
1203 │       it('should apply template context guards when enabled', () => {
1204 │         const block = tcb(TEMPLATE, DIRECTIVES);
1205 ▶         expect(block).toContain(GUARD_APPLIED);
1206 │       });
1207 │       it('should not apply template context guards when disabled', () => {
1208 │         const DISABLED_CONFIG: TypeCheckingConfig = {
1209 │           ...BASE_CONFIG,
1210 ▶           applyTemplateContextGuards: false,
1211 │         };
1212 │         const block = tcb(TEMPLATE, DIRECTIVES, DISABLED_CONFIG);
1213 ▶         expect(block).not.toContain(GUARD_APPLIED);
1214 │       });
1215 │     });
```

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=template guards|applyTemplateContextGuards|checkTemplateBodies'

pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=should infer the context of Ng|unknown local ref target|unknown pipe|should check usage of NgIf|ngtsc @boundary type checking'
```

📄 `出力（抜粋。2026-11-02 に実行）`

```
Ran 9 of 1747 specs
9 specs, 0 failures
//packages/compiler-cli/src/ngtsc/typecheck/test:test                    PASSED in 0.8s

Ran 12 of 6698 specs   (shard 1)
Ran 16 of 6702 specs   (shard 2)
Ran 20 of 6706 specs   (shard 3)
Ran 20 of 6706 specs   (shard 4)
//packages/compiler-cli/test/ngtsc:ngtsc                                 PASSED in 2.8s
```

1 本目は 3 + 2 + 4 = 9 本で合います。2 本目の test/ngtsc は 4 つの shard に分かれ、合わせて 68 本です。template\_typecheck\_spec.ts は `runInEachFileSystem` で 4 種類の仮想ファイルシステムごとに同じ it を走らせるので、名前の数は 17（NgIf / NgFor の文脈 2・未知の参照 2・未知の pipe 2・NgIf の使い方 3・boundary\_spec の 8）× 4 です。

1. **直すとしたら**

   ガードの組み立ては template.ts の `addDirectiveGuards` と `TcbTemplateBodyOp.execute`、静的メンバの読み取りは metadata/src/util.ts の `extractTemplateGuard` です。TCB の形の変化は type\_check\_block\_spec.ts の `describe('template guards')` に、実際の `@angular/common` と組み合わせた型エラーの変化は test/ngtsc/template\_typecheck\_spec.ts に it を足します。ガードの名前の規則（`ngTemplateGuard_` の後ろはテンプレートでの入力名、プロパティは `'binding'` の型だけ）は公開の約束なので、変えると利用者のディレクティブに影響します。
2. **issue を読むときの手がかり**

   「構造ディレクティブの中で型が any」「let- 変数の型が付かない」は、まず `hasNgTemplateContextGuard` があるか、`applyTemplateContextGuards`（`strictTemplates` か `strictInputTypes` で決まる。[第 2 回](02-typecheck-config.md)）が真かを見ます。「絞られない」は `ngTemplateGuard_` の名前と型（`'binding'` か型の述語か）を見ます。#28731 と #46749 の状況は[第 20 回](20-typecheck-issues.md)でまとめます。

## 聞かれそうな質問

**Q. \*ngIf の中で null が外れるのはなぜですか？@if と同じ仕組みですか？**

結果は同じく TypeScript の `if` の絞り込みですが、`if` の条件の出どころが違います。`@if` はブロックの構文そのものが `if` になり、`*ngIf` は `NgIf` の `static ngTemplateGuard_ngIf: 'binding'`（ng\_if.ts 251 行目）を metadata/src/util.ts 287〜290 行目が読み、template.ts 167〜169 行目が入力の式をそのまま `if` の条件に入れます。コンパイラは `NgIf` を特別扱いしていません。同じ静的メンバを書けば自作のディレクティブでも同じことが起きます。

**Q. ngTemplateGuard の invocation と binding はどう違いますか？**

binding（プロパティの型が `'binding'`）は入力に結んだ式そのものを条件にし（template.ts 169 行目）、invocation（静的メソッド）は `Dir.ngTemplateGuard_x(インスタンス, 式)` を条件にします（173〜175 行目）。前者は truthy かどうかの絞り込み、後者はメソッドの型の述語のとおりの絞り込みです。

**Q. applyTemplateContextGuards が偽だと何が起きますか？**

template.ts 186 行目の分岐に入らず、`ngTemplateContextGuard` の呼び出しが条件から消えます。文脈の変数は 36 行目の `any` のままなので、`let-` 変数（variables.ts 70 行目の `_t4.$implicit` など）がすべて `any` になり、打ち間違いも検出されません。`ngTemplateGuard_`（入力の式の絞り込み）は別の分岐なので残ります。

**Q. ng-template の let- 変数に型を付ける方法はありますか？**

組み込みの構文はありません（#28731 が開いたまま）。ディレクティブの付かない `<ng-template>` にはガードが 1 つも無く、文脈が `any` だからです。型を付けたいなら、`ngTemplateContextGuard` を持つディレクティブを `<ng-template>` に付けます（issue で共有されている回避策。template.ts 185〜195 行目の仕組みを使う）。

**Q. ガードを書いても型が絞られません。どこを見ればいいですか？**

metadata/src/util.ts の 272 行目（名前が `ngTemplateGuard_` で始まるか）、275 行目の後ろがテンプレートでの入力名か（template.ts 153 行目は `i.name` と比べる）、プロパティなら型が文字列リテラル `'binding'` か（287〜289 行目）、メソッドなら戻り値が型の述語か、を順に確かめます。デモに同じ `ngTemplateGuards` を渡して TCB の `if` の条件を見るのが早い確かめ方です。

## 読み終えて

- `<ng-template>`（と `*` の略記）の本体は `if (ガード) { … }` になり、ガードはそこに付いたディレクティブの静的メンバから作られる。
- `ngTemplateGuard_x` は入力 x の式を絞る（binding なら式そのもの、invocation なら型の述語のメソッド）。`ngTemplateContextGuard` は文脈の変数を絞る。
- 文脈の変数は `null! as any` で始まり、`let-` 変数はそのプロパティ。ガードが無いか `applyTemplateContextGuards` が偽なら `any` のまま。
- 静的メンバを集めるのは compiler-cli の `extractDirectiveTypeCheckMeta`。名前と型の規則（`'binding'` は型の位置）が守られていないと黙って無視される。
- #28731 は「ガードの無い `<ng-template>` の文脈が any」の問題で、回避策は自分で文脈のガードを持つディレクティブを書くこと。

---

← 前: [@if・@for・@switch・@let の型の絞り込み](13-typecheck-control-flow.md)  
次: [テンプレート参照（#ref）と pipe の型](15-typecheck-refs-pipes.md) →
