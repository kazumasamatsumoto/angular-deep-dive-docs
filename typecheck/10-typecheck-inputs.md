[目次](../README.md) › [テンプレート型チェックの内側](README.md) › 第 10 回 / 全 20 回

# 入力の型チェック：代入・coercion・transform・input()

> TcbDirectiveInputsOp が入力のバインディングを「ディレクティブのプロパティへの代入」として書く行。ngAcceptInputType と input の transform の型、input() の InputSignal が ɵINPUT\_SIGNAL\_BRAND\_WRITE\_TYPE で書き込みの型を表す仕組み、required の入力の欠落、readonly・private の入力（honorAccessModifiersForInputBindings）。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-inputs)

---

`<app-chip [size]="n">` の型エラー「Type 'string' is not assignable to type 'number'」は、TCB の中の `_t1.size = this.n;` という代入の文から出ます。この章では、TcbDirectiveInputsOp が 1 つの入力を「何に代入するか」を決める分岐を全部読みます。普通のプロパティ、`ngAcceptInputType_` と transform の型、readonly・private・protected の入力（`honorAccessModifiersForInputBindings`）、クラスに無い入力、`input()`、そして required の入力が欠けたときの扱いです。

読む対象は compiler の `typecheck/ops/inputs.ts`（`TcbDirectiveInputsOp`）・`ops/bindings.ts`（`getBoundAttributes`）・`ops/scope.ts`（`appendDirectiveInputs`）、入力の性質を集める compiler-cli の `ngtsc/metadata/src/util.ts`、テストは `type_check_block_spec.ts` と `test/ngtsc/template_typecheck_spec.ts` です。

1. [1. 全体像](01-typecheck-overview.md)
2. [2. 設定](02-typecheck-config.md)
3. [3. TCB の置き場所](03-typecheck-context.md)
4. [4. 派生プログラム](04-typecheck-program-driver.md)
5. [5. Environment](05-typecheck-environment.md)
6. [6. Scope と TcbOp](06-typecheck-scope.md)
7. [7. 式](07-typecheck-expressions.md)
8. [8. 要素と DOM](08-typecheck-elements-dom.md)
9. [9. 型コンストラクタ](09-typecheck-type-constructor.md)
10. **10. 入力**（この章）
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

> [!NOTE]
> **ポイント**
>
> 入力のバインディングが代入の文になることと、`widenBinding`（`strictInputTypes` が偽なら `as any`、`strictNullInputTypes` が偽なら `!`）は[テンプレートコンパイラ第 17 回](../compiler/17-compiler-typecheck.md)で、`input()` の書き込みの型 `ɵINPUT_SIGNAL_BRAND_WRITE_TYPE` は[signals シリーズの input() の章](../signals/12-signals-input-compile.md)で読みました（その代入の行は、そちらで引用しています）。この章はその前後、「代入先をどう選ぶか」と「どのバインディングが入力に数えられるか」を読みます。ディレクティブの変数 `_t1` そのものの作り方は[第 9 回](09-typecheck-type-constructor.md)です。

## 1. 入力の op はディレクティブごとに 1 つ

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L794–823 （▶ の行: 804–806, 808, 820–821）

```ts
794 │   private appendDirectiveInputs(
795 │     dir: TcbDirectiveMetadata,
796 │     node: Element | Template | Component | Directive,
797 │     dirMap: Map<TcbDirectiveMetadata, number>,
798 │     allDirectiveMatches: TcbDirectiveMetadata[],
799 │     directiveIndex?: number,
800 │   ): void {
801 │     const nodeIsFormControl = isFormControl(allDirectiveMatches);
802 │     const customFormControlType = nodeIsFormControl ? getCustomFieldDirectiveType(dir) : null;
803 │ 
804 ▶     const directiveOp = this.getDirectiveOp(dir, node, customFormControlType, directiveIndex);
805 ▶     const dirIndex = this.opQueue.push(directiveOp) - 1;
806 ▶     dirMap.set(dir, dirIndex);
807 │ 
808 ▶     if (isNativeField(dir, node, allDirectiveMatches)) {
809 │       const inputType =
810 │         (node.name === 'input' && node.attributes.find((attr) => attr.name === 'type')?.value) ||
811 │         null;
812 │ 
813 │       this.opQueue.push(
814 │         inputType === 'radio'
815 │           ? new TcbNativeRadioButtonFieldOp(this.tcb, this, node)
816 │           : new TcbNativeFieldOp(this.tcb, this, node, inputType),
817 │       );
818 │     }
819 │ 
820 ▶     this.opQueue.push(
821 ▶       new TcbDirectiveInputsOp(this.tcb, this, node, dir, nodeIsFormControl, customFormControlType),
822 │     );
823 │   }
```

要素に付いたディレクティブごとに、804〜806 行目でインスタンスの変数を作る op（第 9 回）を積み、820〜822 行目で `TcbDirectiveInputsOp` を積みます。808〜818 行目は signal forms の `[formField]` を素の `<input>` に付けたときの追加の op です（[第 12 回](12-typecheck-two-way.md)）。どのディレクティブにも当たらなかったバインディングは要素のプロパティとして `TcbUnclaimedInputsOp` と DOM スキーマで調べられます（[第 8 回](08-typecheck-elements-dom.md)）。

## 2. どのバインディングが入力に数えられるか：getBoundAttributes

📄 `angular/packages/compiler/src/typecheck/ops/bindings.ts` L84–119 （▶ の行: 92–95, 101, 103, 108, 110, 112–114）

```ts
 84 │ export function getBoundAttributes(
 85 │   directive: TcbDirectiveMetadata,
 86 │   node: Template | Element | Component | Directive,
 87 │ ): TcbBoundAttribute[] {
 88 │   const boundInputs: TcbBoundAttribute[] = [];
 89 │ 
 90 │   const processAttribute = (attr: BoundAttribute | TextAttribute) => {
 91 │     // Skip non-property bindings.
 92 ▶     if (
 93 ▶       attr instanceof BoundAttribute &&
 94 ▶       attr.type !== BindingType.Property &&
 95 ▶       attr.type !== BindingType.TwoWay
 96 │     ) {
 97 │       return;
 98 │     }
 99 │ 
100 │     // Skip the attribute if the directive does not have an input for it.
101 ▶     const inputs = directive.inputs.getByBindingPropertyName(attr.name);
102 │ 
103 ▶     if (inputs !== null) {
104 │       boundInputs.push({
105 │         value: attr.value,
106 │         sourceSpan: attr.sourceSpan,
107 │         keySpan: attr.keySpan ?? null,
108 ▶         inputs: inputs.map((input: TcbInputMapping) => {
109 │           return {
110 ▶             fieldName: input.classPropertyName,
111 │             required: input.required,
112 ▶             transformType: input.transformType,
113 ▶             isSignal: input.isSignal,
114 ▶             isTwoWayBinding: attr instanceof BoundAttribute && attr.type === BindingType.TwoWay,
115 │           };
116 │         }),
117 │       });
118 │     }
119 │   };
```

📄 `angular/packages/compiler/src/typecheck/ops/bindings.ts` L120–134 （▶ の行: 121–124, 127, 129–130）

```ts
120 │ 
121 ▶   if (node instanceof Template) {
122 ▶     if (node.tagName === 'ng-template') {
123 ▶       node.inputs.forEach(processAttribute);
124 ▶       node.attributes.forEach(processAttribute);
125 │     }
126 │ 
127 ▶     node.templateAttrs.forEach(processAttribute);
128 │   } else {
129 ▶     node.inputs.forEach(processAttribute);
130 ▶     node.attributes.forEach(processAttribute);
131 │   }
132 │ 
133 │   return boundInputs;
134 │ }
```

1. **92〜98 行目 プロパティのバインディングだけ**

   `[attr.x]`・`[class.x]`・`[style.x]`・アニメーションは `BindingType` が違うので入力になりません。`[x]`（Property）と `[(x)]`（TwoWay）だけです。
2. **101 行目 テンプレートでの名前で引く**

   `getByBindingPropertyName` は、テンプレートに書く名前（alias）から、クラスのプロパティ名の配列を返します。配列なのは、1 つのディレクティブの 2 つのフィールドに同じ名前の入力を付けられるからです（type\_check\_block\_spec.ts の `'should handle a single property bound to multiple fields'`）。108〜116 行目で、その 1 つずつに required・transform の型・signal か・双方向か（114 行目）を付けます。
3. **129〜130 行目 文字列の属性も入力になる**

   `node.attributes` は `size="3"` のような TextAttribute です。ディレクティブに `size` という入力があれば、`"3"` という文字列の代入として検査されます（4 節の 199〜201 行目で切れる）。
4. **121〜127 行目 ng-template と構造ディレクティブ**

   `<ng-template [ngIf]="x">` と書いたときは 123〜124 行目の inputs と attributes、`*ngIf="x"` と書いたときは 127 行目の templateAttrs です。`*` の構文で書いた要素の上の `[x]` は、`<ng-template>` ではない Template ノードなので 122 行目で外れ、構造ディレクティブには渡りません。

## 3. TcbDirectiveInputsOp：式を先に作る

📄 `angular/packages/compiler/src/typecheck/ops/inputs.ts` L66–97 （▶ の行: 70–71, 73, 77, 89, 91–94, 96）

```ts
66 │   override execute(): null {
67 │     let dirId: TcbExpr | null = null;
68 │ 
69 │     // TODO(joost): report duplicate properties
70 ▶     const seenRequiredInputs = new Set<ClassPropertyName>();
71 ▶     const boundAttrs = getBoundAttributes(this.dir, this.node);
72 │ 
73 ▶     if (this.customFormControlType !== null) {
74 │       checkUnsupportedFieldBindings(this.node, customFormControlBannedInputFields, this.tcb);
75 │     }
76 │ 
77 ▶     if (this.customFormControlType !== null || this.isFormControl) {
78 │       const additionalBindings = expandBoundAttributesForField(
79 │         this.dir,
80 │         this.node,
81 │         this.customFormControlType,
82 │       );
83 │ 
84 │       if (additionalBindings !== null) {
85 │         boundAttrs.push(...additionalBindings);
86 │       }
87 │     }
88 │ 
89 ▶     for (const attr of boundAttrs) {
90 │       // For bound inputs, the property is assigned the binding expression.
91 ▶       let assignment = widenBinding(
92 ▶         translateInput(attr.value, this.tcb, this.scope),
93 ▶         this.tcb,
94 ▶         attr.value,
95 │       );
96 ▶       assignment.wrapForTypeChecker();
97 │ 
```

70 行目、書かれた required の入力を覚える集合。71 行目で 2 節の一覧を作ります。73〜87 行目は `[formField]` のときに足される見えないバインディングです（第 12 回）。89 行目からがバインディング 1 つずつの処理で、91〜95 行目で**右辺の式を先に作ります**。`translateInput` は文字列の属性なら `"3"`、式なら TCB の式を返し、`widenBinding` が設定に応じて `as any` や `!` を付けます。96 行目の `wrapForTypeChecker` は括弧で包む印です。

## 4. 代入先を選ぶ 5 つの分岐

📄 `angular/packages/compiler/src/typecheck/ops/inputs.ts` L98–136 （▶ の行: 98, 101–102, 105–106, 111, 114–115, 121–122, 126, 129–132, 136）

```ts
 98 ▶       for (const {fieldName, required, transformType, isSignal, isTwoWayBinding} of attr.inputs) {
 99 │         let target: TcbExpr;
100 │ 
101 ▶         if (required) {
102 ▶           seenRequiredInputs.add(fieldName);
103 │         }
104 │ 
105 ▶         // Note: There is no special logic for transforms/coercion with signal inputs.
106 ▶         // For signal inputs, a `transformType` will never be set as we do not capture
107 │         // the transform in the compiler metadata. Signal inputs incorporate their
108 │         // transform write type into their member type, and we extract it below when
109 │         // setting the `WriteT` of such `InputSignalWithTransform<_, WriteT>`.
110 │ 
111 ▶         if (this.dir.coercedInputFields.has(fieldName)) {
112 │           let type: TcbExpr;
113 │ 
114 ▶           if (transformType !== undefined) {
115 ▶             type = new TcbExpr(transformType);
116 │           } else {
117 │             // The input has a coercion declaration which should be used instead of assigning the
118 │             // expression into the input field directly. To achieve this, a variable is declared
119 │             // with a type of `typeof Directive.ngAcceptInputType_fieldName` which is then used as
120 │             // target of the assignment.
121 ▶             const dirTypeRef = this.tcb.env.referenceTcbValue(this.dir.ref);
122 ▶             const propName = `ngAcceptInputType_${fieldName}`;
123 │             const access = isUnsafeObjectKey(fieldName)
124 │               ? `[${TcbExpr.quoteAndEscape(propName)}]`
125 │               : `.${propName}`;
126 ▶             type = new TcbExpr(`typeof ${dirTypeRef.print()}${access}`);
127 │           }
128 │ 
129 ▶           const id = new TcbExpr(this.tcb.allocateId());
130 ▶           this.scope.addStatement(declareVariable(id, type));
131 ▶           target = id;
132 ▶         } else if (this.dir.undeclaredInputFields.has(fieldName)) {
133 │           // If no coercion declaration is present nor is the field declared (i.e. the input is
134 │           // declared in a `@Directive` or `@Component` decorator's `inputs` property) there is no
135 │           // assignment target available, so this field is skipped.
136 ▶           continue;
```

📄 `angular/packages/compiler/src/typecheck/ops/inputs.ts` L137–168 （▶ の行: 137–139, 146, 149–151, 153, 158, 164–166）

```ts
137 ▶         } else if (
138 ▶           !this.tcb.env.config.honorAccessModifiersForInputBindings &&
139 ▶           this.dir.restrictedInputFields.has(fieldName)
140 │         ) {
141 │           // If strict checking of access modifiers is disabled and the field is restricted
142 │           // (i.e. private/protected/readonly), generate an assignment into a temporary variable
143 │           // that has the type of the field. This achieves type-checking but circumvents the access
144 │           // modifiers.
145 │           if (dirId === null) {
146 ▶             dirId = this.scope.resolve(this.node, this.dir);
147 │           }
148 │ 
149 ▶           const id = new TcbExpr(this.tcb.allocateId());
150 ▶           const type = new TcbExpr(
151 ▶             `(typeof ${dirId.print()})[${TcbExpr.quoteAndEscape(fieldName)}]`,
152 │           );
153 ▶           const temp = declareVariable(id, type);
154 │           this.scope.addStatement(temp);
155 │           target = id;
156 │         } else {
157 │           if (dirId === null) {
158 ▶             dirId = this.scope.resolve(this.node, this.dir);
159 │           }
160 │ 
161 │           // To get errors assign directly to the fields on the instance, using property access
162 │           // when possible. String literal fields may not be valid JS identifiers so we use
163 │           // literal element access instead for those cases.
164 ▶           target = this.dir.stringLiteralInputFields.has(fieldName)
165 ▶             ? new TcbExpr(`${dirId.print()}[${TcbExpr.quoteAndEscape(fieldName)}]`)
166 ▶             : new TcbExpr(`${dirId.print()}.${fieldName}`);
167 │         }
168 │ 
```

| 分岐（行） | どんな入力か | TCB の形（`[size]="n"`） |
| --- | --- | --- |
| 111〜131：coerced | `static ngAcceptInputType_size` がある、または transform がある | `var _t1 = null! as typeof Chip.ngAcceptInputType_size; _t1 = this.n;`<br>transform なら `var _t1 = null! as unknown;`（114〜115 行目） |
| 132〜136：undeclared | `inputs: ['size']` と書いたが、クラスに `size` が無い | `this.n;`（代入先が無いので式だけ） |
| 137〜155：restricted | readonly・private・protected で、`honorAccessModifiersForInputBindings` が偽 | `var _t2 = null! as (typeof _t1)["size"]; _t2 = this.n;` |
| 164〜165：文字列リテラルの名前 | `'some-input.xs'!: string` のように識別子でない名前 | `_t1["some-input.xs"] = this.n;` |
| 166：それ以外 | 普通の public なフィールド | `_t1.size = this.n;` |

1. **111〜131 行目 coerced：受け付ける型の変数に代入する**

   `@Input() disabled: boolean` に `disabled=""`（空文字列）を渡せるようにするには、プロパティの型より広い型で受ける必要があります。それを宣言するのが `static ngAcceptInputType_disabled: boolean | ''` で、126 行目でその型の変数を作り、130 行目で文として置き、131 行目で代入先にします。transform の入力は 114〜115 行目で transform の型（第 1 引数の型。`numberAttribute` なら `unknown`）を使います。
2. **105〜109 行目 signal の入力は coerced にならない**

   `input(0, {transform})` の受け付ける型は `InputSignalWithTransform<number, unknown>` の型引数に入っているので、`ɵINPUT_SIGNAL_BRAND_WRITE_TYPE` の側で取り出します（下の 6 節の metadata の 214 行目でも除いている）。
3. **132〜136 行目 undeclared：continue で代入しない**

   代入先は作りませんが、91 行目で作った式は 6 節の 203 行目で文として残るので、`n` が存在しないなどの式の中のエラーは出ます。
4. **137〜155 行目 restricted：一時変数で修飾子を迂回する**

   `_t1.size = ...` と書くと、TypeScript が「readonly に代入できない」「private にアクセスできない」とエラーにします。そこで 151 行目の `(typeof _t1)["size"]`（プロパティの型）を持つ一時変数を作り、そこに代入します。型は検査され、修飾子は検査されない形です。146 行目と 158 行目の `scope.resolve(this.node, this.dir)` が、第 9 回の op を実行してディレクティブの変数を取り出す行です。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L792–810 （▶ の行: 802, 806, 808）

```ts
792 │   it('should use coercion types if declared', () => {
793 │     const TEMPLATE = `<div dir [inputA]="foo"></div>`;
794 │     const DIRECTIVES: TestDeclaration[] = [
795 │       {
796 │         type: 'directive',
797 │         name: 'Dir',
798 │         selector: '[dir]',
799 │         inputs: {
800 │           fieldA: 'inputA',
801 │         },
802 ▶         coercedInputFields: ['fieldA'],
803 │       },
804 │     ];
805 │     const block = tcb(TEMPLATE, DIRECTIVES);
806 ▶     expect(block).not.toContain('var _t1 = null! as Dir;');
807 │     expect(block).toContain(
808 ▶       'var _t1 = null! as typeof i0.Dir.ngAcceptInputType_fieldA; ' + '_t1 = (((this).foo));',
809 │     );
810 │   });
```
*type\_check\_block\_spec.ts*

802 行目で fieldA を coerced にすると、806 行目のとおり `null! as Dir` の変数すら作られず、808 行目の受け付ける型の変数への代入だけになります。coerced の分岐は `scope.resolve` を呼ばないので、ディレクティブの型の op（optional）が実行されないからです。

## 5. 最後の代入と、required の入力の欠落

📄 `angular/packages/compiler/src/typecheck/ops/inputs.ts` L194–229 （▶ の行: 196, 199–200, 203, 206, 214–216, 220–221）

```ts
194 │       }
195 │ 
196 ▶       assignment.addParseSpanInfo(attr.sourceSpan);
197 │ 
198 │       // Ignore diagnostics for text attributes if configured to do so.
199 ▶       if (!this.tcb.env.config.checkTypeOfAttributes && typeof attr.value === 'string') {
200 ▶         assignment.markIgnoreDiagnostics();
201 │       }
202 │ 
203 ▶       this.scope.addStatement(assignment);
204 │     }
205 │ 
206 ▶     this.checkRequiredInputs(seenRequiredInputs);
207 │ 
208 │     return null;
209 │   }
210 │ 
211 │   private checkRequiredInputs(seenRequiredInputs: Set<ClassPropertyName>): void {
212 │     const missing: BindingPropertyName[] = [];
213 │ 
214 ▶     for (const input of this.dir.inputs) {
215 ▶       if (input.required && !seenRequiredInputs.has(input.classPropertyName)) {
216 ▶         missing.push(input.bindingPropertyName);
217 │       }
218 │     }
219 │ 
220 ▶     if (missing.length > 0) {
221 ▶       this.tcb.oobRecorder.missingRequiredInputs(
222 │         this.tcb.id,
223 │         this.node,
224 │         this.dir.name,
225 │         this.dir.isComponent,
226 │         missing,
227 │       );
228 │     }
229 │   }
```

1. **4 節と 5 節のあいだ（signals シリーズで引用した範囲）**

   signal の入力なら代入先に `[ɵINPUT_SIGNAL_BRAND_WRITE_TYPE]` を足し、双方向なら右辺を `ɵunwrapWritableSignal(...)` で包み（[第 12 回](12-typecheck-two-way.md)）、`代入先 = 右辺` を作ります。1 つの名前が複数のフィールドに当たるときは、この代入が `_t1.a = _t1.b = 式` のように重なります。
2. **196〜203 行目 位置を付けて文にする**

   196 行目でテンプレートの位置（`[size]="n"` 全体）を付けます（[第 16 回](16-typecheck-diagnostics-mapping.md)）。199〜201 行目、`checkTypeOfAttributes`（`strictAttributeTypes`）が偽なら、文字列の属性の代入からのエラーは捨てます。
3. **206・211〜229 行目 required の入力が書かれていなければ帯域外の診断**

   欠けた入力は TCB の文では表せない（書かれていないものに代入はできない）ので、220〜227 行目で `oobRecorder.missingRequiredInputs` を呼び、「Required input 'size' from component Chip must be specified.」を直接作ります。帯域外の診断の作り方は[第 17 回](17-typecheck-oob.md)です。

## 6. coerced・restricted などの集合はどこで作られるか

TcbDirectiveInputsOp が見た `coercedInputFields`・`restrictedInputFields`・`undeclaredInputFields`・`stringLiteralInputFields` は、ngtsc がディレクティブのクラスを読んだときに作ります。

📄 `angular/packages/compiler-cli/src/ngtsc/metadata/src/util.ts` L210–240 （▶ の行: 211, 214–215, 225, 227–228, 231–232, 234–235, 237–238）

```ts
210 │   const coercedInputFields = new Set<ClassPropertyName>(
211 ▶     staticMembers.map(extractCoercedInput).filter((inputName): inputName is ClassPropertyName => {
212 │       // If the input refers to a signal input, we will not respect coercion members.
213 │       // A transform function should be used instead.
214 ▶       if (inputName === null || inputs.getByClassPropertyName(inputName)?.isSignal) {
215 ▶         return false;
216 │       }
217 │       return true;
218 │     }),
219 │   );
220 │ 
221 │   const restrictedInputFields = new Set<ClassPropertyName>();
222 │   const stringLiteralInputFields = new Set<ClassPropertyName>();
223 │   const undeclaredInputFields = new Set<ClassPropertyName>();
224 │ 
225 ▶   for (const {classPropertyName, transform} of inputs) {
226 │     const field = members.find((member) => member.name === classPropertyName);
227 ▶     if (field === undefined || field.node === null) {
228 ▶       undeclaredInputFields.add(classPropertyName);
229 │       continue;
230 │     }
231 ▶     if (isRestricted(field.node)) {
232 ▶       restrictedInputFields.add(classPropertyName);
233 │     }
234 ▶     if (field.nameNode !== null && ts.isStringLiteral(field.nameNode)) {
235 ▶       stringLiteralInputFields.add(classPropertyName);
236 │     }
237 ▶     if (transform !== null) {
238 ▶       coercedInputFields.add(classPropertyName);
239 │     }
240 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/metadata/src/util.ts` L256–269 （▶ の行: 263–265）

```ts
256 │ function isRestricted(node: ts.Node): boolean {
257 │   const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
258 │ 
259 │   return (
260 │     modifiers !== undefined &&
261 │     modifiers.some(({kind}) => {
262 │       return (
263 ▶         kind === ts.SyntaxKind.PrivateKeyword ||
264 ▶         kind === ts.SyntaxKind.ProtectedKeyword ||
265 ▶         kind === ts.SyntaxKind.ReadonlyKeyword
266 │       );
267 │     })
268 │   );
269 │ }
```

- 211 行目：static メンバーのうち `ngAcceptInputType_` で始まるものから coerced を集め、214 行目で signal の入力を除く。237〜238 行目、transform のある入力も coerced に入れる。
- 227〜228 行目：クラスにそのフィールドが無ければ undeclared。
- 231〜232 行目：`isRestricted`（263〜265 行目の private・protected・readonly のどれか）なら restricted。
- 234〜235 行目：名前が文字列リテラルなら stringLiteral。

> [!WARNING]
> **ハマりどころ**
>
> `readonly size = input<number>()` のように `input()` を readonly で書くと、231〜232 行目で restricted に入ります。すると既定の設定では 4 節の 151 行目の一時変数の形になり、その上に signal の印が付いて `var _t2 = null! as (typeof _t1)["size"]; _t2[ɵINPUT_SIGNAL_BRAND_WRITE_TYPE] = this.n;` になります（8 節のデモの「readonly な input()」）。compiler-cli の template\_symbol\_builder.ts のコメントにも、`honorAccessModifiersForInputBindings = false` のときの形として `_dirInput[ɵINPUT_SIGNAL_BRAND_WRITE_TYPE]` が挙がっています。

## 7. honorAccessModifiersForInputBindings と strictInputAccessModifiers

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L695–733 （▶ の行: 705, 709–711, 725, 730）

```ts
695 │   it('should assign restricted properties to temp variables by default', () => {
696 │     const TEMPLATE = `<div dir [inputA]="foo"></div>`;
697 │     const DIRECTIVES: TestDeclaration[] = [
698 │       {
699 │         type: 'directive',
700 │         name: 'Dir',
701 │         selector: '[dir]',
702 │         inputs: {
703 │           fieldA: 'inputA',
704 │         },
705 ▶         restrictedInputFields: ['fieldA'],
706 │       },
707 │     ];
708 │     expect(tcb(TEMPLATE, DIRECTIVES)).toContain(
709 ▶       'var _t1 = null! as i0.Dir; ' +
710 ▶         'var _t2 = null! as (typeof _t1)["fieldA"]; ' +
711 ▶         '_t2 = (((this).foo)); ',
712 │     );
713 │   });
714 │ 
715 │   it('should assign properties via element access for field names that are not JS identifiers', () => {
716 │     const TEMPLATE = `<div dir [inputA]="foo"></div>`;
717 │     const DIRECTIVES: TestDeclaration[] = [
718 │       {
719 │         type: 'directive',
720 │         name: 'Dir',
721 │         selector: '[dir]',
722 │         inputs: {
723 │           'some-input.xs': 'inputA',
724 │         },
725 ▶         stringLiteralInputFields: ['some-input.xs'],
726 │       },
727 │     ];
728 │     const block = tcb(TEMPLATE, DIRECTIVES);
729 │     expect(block).toContain(
730 ▶       'var _t1 = null! as i0.Dir; ' + '_t1["some-input.xs"] = (((this).foo)); ',
731 │     );
732 │   });
733 │ 
```
*type\_check\_block\_spec.ts（既定の設定）*

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L1586–1605 （▶ の行: 1595, 1600, 1603）

```ts
1586 │       it('should assign restricted properties via property access', () => {
1587 │         const DIRECTIVES: TestDeclaration[] = [
1588 │           {
1589 │             type: 'directive',
1590 │             name: 'Dir',
1591 │             selector: '[dir]',
1592 │             inputs: {
1593 │               fieldA: 'inputA',
1594 │             },
1595 ▶             restrictedInputFields: ['fieldA'],
1596 │           },
1597 │         ];
1598 │         const enableChecks: TypeCheckingConfig = {
1599 │           ...BASE_CONFIG,
1600 ▶           honorAccessModifiersForInputBindings: true,
1601 │         };
1602 │         const block = tcb(TEMPLATE, DIRECTIVES, enableChecks);
1603 ▶         expect(block).toContain('var _t1 = null! as i0.Dir; ' + '_t1.fieldA = (((this).foo)); ');
1604 │       });
1605 │     });
```
*type\_check\_block\_spec.ts（honorAccessModifiersForInputBindings: true）*

709〜711 行目が既定の一時変数の形、1603 行目が設定を真にしたときの直接の代入です。tsconfig の `angularCompilerOptions` の名前は `strictInputAccessModifiers` で、compiler.ts の `getTypeCheckingConfig` は `strictTemplates` を真にしてもこれを偽のままにし、オプションを書いたときだけ上書きします（[第 2 回](02-typecheck-config.md)）。

📄 `angular/packages/compiler-cli/test/ngtsc/template_typecheck_spec.ts` L3723–3751 （▶ の行: 3728, 3732, 3743, 3746–3748）

```ts
3723 │       describe('with strictInputAccessModifiers', () => {
3724 │         beforeEach(() => {
3725 │           env.tsconfig({
3726 │             strictTemplates: true,
3727 │             strictInputTypes: true,
3728 ▶             strictInputAccessModifiers: true,
3729 │           });
3730 │         });
3731 │ 
3732 ▶         it('should produce diagnostics for inputs which assign to readonly, private, and protected fields', () => {
3733 │           env.write('test.ts', correctTypeInputsToRestrictedFields);
3734 │           expectIllegalAssignmentErrors(env.driveDiagnostics());
3735 │         });
3736 │ 
3737 │         it('should produce diagnostics for inputs which assign to readonly, private, and protected fields inherited from a base class', () => {
3738 │           env.write('test.ts', correctInputsToRestrictedFieldsFromBaseClass);
3739 │           expectIllegalAssignmentErrors(env.driveDiagnostics());
3740 │         });
3741 │ 
3742 │         function expectIllegalAssignmentErrors(diags: ReadonlyArray<ts.Diagnostic>) {
3743 ▶           expect(diags.length).toBe(3);
3744 │           const actualMessages = diags.map((d) => d.messageText).sort();
3745 │           const expectedMessages = [
3746 ▶             `Property 'protectedField' is protected and only accessible within class 'TestDir' and its subclasses.`,
3747 ▶             `Property 'privateField' is private and only accessible within class 'TestDir'.`,
3748 ▶             `Cannot assign to 'readonlyField' because it is a read-only property.`,
3749 │           ].sort();
3750 │           expect(actualMessages).toEqual(expectedMessages);
3751 │         }
```
*test/ngtsc/template\_typecheck\_spec.ts（ファイルを書いて ngtsc に型検査させる形）*

3728 行目でオプションを真にすると、TCB は `_t1.privateField = ...` になり、TypeScript 自身の 3 つのエラー（3746〜3748 行目）がテンプレートの位置で出ます。Angular 独自の診断を作っているわけではなく、TypeScript のエラーをそのまま使っているのがこの形の特徴です。

## 8. デモ：同じ \[size\]="n" の代入先を切り替える

> **🧪 DEMO — このページの @angular/compiler（22.1.6）の generateTypeCheckBlock**
>
> ボタンでディレクティブ `Chip` の入力 `size` の性質と設定を切り替えて、TCB を作ります。強調した行が代入の文です。デモ部品は、ngtsc が 6 節で作る集合（coerced・restricted など）をボタンごとに直接渡しています。inputs.ts と bindings.ts は 22.1.6 と読んでいるソースで同じです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-inputs)

2026-11-02 に Node で同じ関数を呼んで確かめた出力です（位置と印のコメントは省いた）。

| ボタン | 代入の文 |
| --- | --- |
| 普通の @Input | `_t1.size = (((this).n));` |
| ngAcceptInputType\_ | `var _t1 = null! as typeof Chip.ngAcceptInputType_size; _t1 = (((this).n));` |
| readonly（既定） | `var _t2 = null! as (typeof _t1)["size"]; _t2 = (((this).n));` |
| readonly + strictInputAccessModifiers | `_t1.size = (((this).n));` |
| クラスに無い入力 | `(((this).n));` |
| readonly な input() | `_t2[i0.ɵINPUT_SIGNAL_BRAND_WRITE_TYPE] = (((this).n));` |
| required を書かない | （文なし）oob に `missingRequiredInputs` |
| strictNullInputTypes: false | `_t1.size = ((((this).n))!);` |
| strictInputTypes: false | `_t1.size = (((((this).n)) as any));` |

「普通の @Input」と「readonly + strictInputAccessModifiers」は、TCB の文字列としては同じです。違いはクラスの宣言にあり、後者は TypeScript が readonly への代入をエラーにします。

## 9. 呼び出しの連なり

- 👤 `<app-chip [size]="n">` — 利用者のテンプレート
  - `Scope.appendDirectivesAndInputsOfElementLikeNode` — ops/scope.ts L572 — *第 8 回*
    - `appendDirectiveInputs` — ops/scope.ts L794 — *型の op と入力の op を積む*
  - `TcbDirectiveInputsOp.execute` — ops/inputs.ts L66
    - `getBoundAttributes` — ops/bindings.ts L84 — *\[x\] と \[(x)\] と文字列の属性*
    - `translateInput → widenBinding` — ops/inputs.ts L91-95 — *右辺*
    - `代入先の選択` — ops/inputs.ts L111-166 — *coerced / undeclared / restricted / 文字列 / 普通*
      - `scope.resolve(node, dir)` — ops/inputs.ts L158 — *第 9 回の op を実行して \_t1 を得る*
    - `checkRequiredInputs → oobRecorder.missingRequiredInputs` — ops/inputs.ts L211-229 — *第 17 回*

## テストと直し方

- type\_check\_block\_spec.ts の it（describe の外、トップレベル）：`'should handle undeclared properties'`（:677）、`'should assign restricted properties to temp variables by default'`（:695）、`'should assign properties via element access for field names that are not JS identifiers'`（:715）、`'should handle a single property bound to multiple fields'`（:734）、`'should use coercion types if declared'`（:792）、`'should use transform type if an input has one'`（:833）。
- 同じファイルの `describe('config')` の中の `describe('config.strictNullInputBindings')`（:1242）と `describe('config.checkAccessModifiersForInputBindings')`（:1560）。
- required の欠落は typecheck/test/diagnostics\_spec.ts の `describe('required inputs')`（:1074）。TCB の文字列ではなく、診断のメッセージ（`Required input 'input' from directive Dir must be specified.`）で確かめています。
- test/ngtsc/template\_typecheck\_spec.ts の `describe('restricted inputs')`（:3661）と `describe('input coercion')`（:2878）。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=coercion|restricted|undeclared|transform|checkAccessModifiersForInputBindings|strictNullInputBindings|not JS identifiers|multiple fields|required'

pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=restricted inputs|input coercion'
```

📄 `出力（抜粋。2026-11-02 に実行。ログは scratchpad/tc-logs/c-inputs.log・c-ngtsc-inputs.log）`

```
==================== Test output for //packages/compiler-cli/src/ngtsc/typecheck/test:test:
Ran 109 of 1747 specs
109 specs, 0 failures
//packages/compiler-cli/src/ngtsc/typecheck/test:test                    PASSED in 1.3s

==================== Test output for //packages/compiler-cli/test/ngtsc:ngtsc (shard 1〜4 of 4):
Ran 24 of 6678 specs / Ran 24 of 6678 specs / Ran 28 of 6682 specs / Ran 24 of 6678 specs
（どの shard も 0 failures）
INFO: Elapsed time: 3.215s, Critical Path: 2.93s
//packages/compiler-cli/test/ngtsc:ngtsc                                 PASSED in 2.8s
```

test/ngtsc は 4 つの shard（テストを 4 つのプロセスに分けて並べて走らせる仕組み）に分かれていて、フィルタに合った spec は 4 つの合計の 100 件です。

1. **開いている issue：#38400 strictInputAccessModifiers を既定にする**

   2020-08-10 に開かれた feature。PR #38249（2020-07、このオプションを足したコミット 71138f60043）のあとに「将来のメジャーで既定にする」ことを追うための issue です。既定にするとは、compiler.ts の strictTemplates の側の `honorAccessModifiersForInputBindings: false` を変えることで、TCB では 4 節の 137〜140 行目の分岐に入らなくなります。readonly で書いた `input()` は 6 節のとおり restricted に入るので、既定を変えたときに何が起きるかは、6 節の注意と合わせて読む必要があります。
2. **開いている issue：#71066 private メンバーへのアクセスを制御するオプション**

   2026-09-30 に開かれ、コメントは 19。22.2 の 48a0fd6e8a8（#70188、2026-08-13）で、テンプレートからコンポーネントの `private` メンバーを読めるようになったことへの要望です。このコミットは TCB の形を変えず、診断の側（diagnostics.ts の `shouldReportDiagnostic`）で、TS2341（private にアクセスした）のうち `this.` か `(this).` の直後のものだけを捨てます（[第 16 回](16-typecheck-diagnostics-mapping.md)）。入力の代入は `_t1.privateField` なので捨てられません。7 節の 3747 行目の期待値（private への代入のエラー）が今も通ることを、上のコマンドで確かめました。
3. **直すとしたら**

   代入先の選び方は inputs.ts の `TcbDirectiveInputsOp.execute`（111〜167 行目）、集合の作り方は metadata/src/util.ts（225〜240 行目）です。TCB の形を確かめるなら type\_check\_block\_spec.ts に `tcb(TEMPLATE, DIRECTIVES, config)` の it を、エラーが出るかを確かめるなら test/ngtsc/template\_typecheck\_spec.ts の `describe('restricted inputs')` に it を足すのが入口です。issue の一覧と読み方は[第 20 回](20-typecheck-issues.md)です。

## 聞かれそうな質問

**Q. readonly の @Input にテンプレートから値を渡してもエラーにならないのはなぜですか？**

既定では 4 節の 137〜155 行目で、`(typeof _t1)["size"]` 型の一時変数に代入する形になるからです。型は検査されますが readonly は検査されません。`strictInputAccessModifiers: true` にすると直接 `_t1.size = ...` と書かれ、TypeScript が「Cannot assign to 'readonlyField' because it is a read-only property.」を出します（7 節の 3748 行目）。

**Q. `disabled` のような属性を値なしで書けるのはなぜですか？**

`<app-x disabled>` は 2 節の 130 行目で文字列 `""` の入力になります。`@Input() disabled: boolean` のままなら `_t1.disabled = ""` でエラーです。`static ngAcceptInputType_disabled: BooleanInput` か `transform: booleanAttribute` を付けると 4 節の 111 行目の coerced に入り、受け付ける型（`booleanAttribute` なら第 1 引数の `unknown`）の変数に代入するのでエラーになりません。

**Q. required の入力を書き忘れたエラーは、TypeScript のエラーですか？**

違います。5 節の 220〜227 行目で `missingRequiredInputs` を呼び、Angular が直接作る帯域外の診断です。だから TCB を見ても、書き忘れた入力についての文はありません（8 節のデモで「required を書かない」を押すと TCB は空です）。

**Q. `inputs: ['size']` と書いてクラスに `size` が無いとき、型検査はどうなりますか？**

4 節の 132〜136 行目で代入先が無いので、`[size]="n"` の右辺 `this.n` が文として残るだけです。`n` が無い、のような式のエラーは出ますが、型の合わない値を渡してもエラーにはなりません。

**Q. `strictInputTypes: false` にすると入力の型検査は全部止まりますか？**

代入の文は残り、右辺だけが `as any` になります（8 節のデモの最後の行）。だから右辺の式の中のエラー（存在しないプロパティなど）は出て、代入の型の不一致だけが出なくなります。required の欠落は帯域外なのでこの設定と関係なく出ます。

## 読み終えて

- 入力は、ディレクティブごとの TcbDirectiveInputsOp が「代入の文」として書く。どのバインディングが入力かは getBoundAttributes が決め、`[x]`・`[(x)]`・文字列の属性が入る（bindings.ts L92-130）。
- 代入先は 5 つ：coerced なら受け付ける型の変数、undeclared なら代入なし、restricted なら `(typeof _t1)["x"]` の一時変数、文字列の名前なら `_t1["x"]`、それ以外は `_t1.x`（inputs.ts L111-166）。
- 集合は ngtsc の metadata が作り、readonly な `input()` も restricted に入る（util.ts L225-238）。
- readonly・private・protected を検査するかは `strictInputAccessModifiers`。strictTemplates では偽のまま（#38400）。
- required の入力の欠落は TCB の文ではなく、帯域外の診断（inputs.ts L211-229）。

---

← 前: [型コンストラクタ：ジェネリックなディレクティブの型を推論させる](09-typecheck-type-constructor.md)  
次: [出力とイベント：$event の型](11-typecheck-outputs-events.md) →
