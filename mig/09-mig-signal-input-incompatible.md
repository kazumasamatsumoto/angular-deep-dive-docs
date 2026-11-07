[目次](../README.md) › [マイグレーションの内側](README.md) › 第 9 回 / 全 20 回

# 移行できない入力：理由の判定と TODO

> 入力に値を書き込むコード、継承で上書きされる入力、getter と setter、spyOn などで使われる入力を「移行できない」と判定する仕組み（problematic\_patterns/）と、その理由（InputIncompatibilityReason・FieldIncompatibilityReason）。--best-effort-mode で無視できる理由と無視できない理由、--insert-todos で残す TODO の文。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-signal-input-incompatible)

---

signal の入力は読み取り専用で、関数で、注入のコンテキスト（`inject()` が使える場所）の中で作る必要があります。だから「入力に値を書き込むコード」「継承で上書きされる入力」「get / set の入力」「`spyOn` で差し替えられる入力」などは、そのまま `input()` にすると壊れます。この章では、マイグレーションがそれを**どこで・どの理由の値で**「移行できない」と判定するか（`passes/problematic_patterns/` ほか）、理由の全部の一覧、`--best-effort-mode` で無視できる理由とできない理由、`--insert-todos` で残す TODO の文がどう作られるかを、行で 1 つずつ追います。

読む対象は `packages/core/schematics/migrations/signal-migration/src/` の `passes/problematic_patterns/`（`incompatibility.ts`・`check_inheritance.ts`・`common_incompatible_patterns.ts`・`incompatibility_todos.ts`・`incompatibility_human.ts`）、`convert-input/prepare_and_check.ts`、`pattern_advisors/spy_on_pattern.ts`、`phase_analysis.ts` と、ゴールデンテストの `template_writes.ts` です。

1. [1. 全体像](01-mig-overview.md)
2. [2. 入口と配布物](02-mig-entry-bundles.md)
3. [3. プログラムを作る](03-mig-program.md)
4. [4. Tsurge](04-mig-tsurge.md)
5. [5. 置き換え](05-mig-replacements.md)
6. [6. テンプレート](06-mig-templates.md)
7. [7. signal input の段階](07-mig-signal-input-passes.md)
8. [8. 参照の書き換え](08-mig-signal-input-references.md)
9. **9. 移行できない入力**（この章）
10. [10. signal クエリ](10-mig-signal-queries.md)
11. [11. output()](11-mig-output.md)
12. [12. 制御フロー](12-mig-control-flow.md)
13. [13. inject()](13-mig-inject.md)
14. [14. テンプレートの書き換え](14-mig-template-rewrites.md)
15. [15. 使っていない import](15-mig-cleanup-imports.md)
16. [16. ルーティング](16-mig-routing.md)
17. [17. v22（1）既定](17-mig-v22-defaults.md)
18. [18. v22（2）?.](18-mig-v22-safe-navigation.md)
19. [19. テスト](19-mig-testing.md)
20. [20. issue と PR を読む](20-mig-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> 理由の列挙 `FieldIncompatibilityReason` の定義（16 個の値と「無視できない」5 つ）と、best effort のときに理由を消す `filterIncompatibilitiesForBestEffortMode`（best\_effort\_mode.ts）は、[ls-refactorings](../ls/19-ls-refactorings.md)の 5 節で引用して読みました。この章はそこを前提にして、**誰がその値を付けるか**を読みます。

## 1. 理由の入れ物は 2 つ、重さは数の大きさ

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/problematic_patterns/incompatibility.ts` L49–82 （▶ の行: 50–52, 56–58, 62, 66, 71, 75, 78–79, 81）

```ts
49 │ /** Reasons why a whole class and its fields cannot be migrated. */
50 ▶ export enum ClassIncompatibilityReason {
51 ▶   ClassManuallyInstantiated,
52 ▶   OwningClassReferencedInClassProperty,
53 │ }
54 │ 
55 │ /** Description of a field incompatibility and some helpful debug context. */
56 ▶ export interface FieldIncompatibility {
57 ▶   reason: FieldIncompatibilityReason;
58 ▶   context: ts.Node | null;
59 │ }
60 │ 
61 │ /** Whether the given value refers to an field incompatibility. */
62 ▶ export function isFieldIncompatibility(value: unknown): value is FieldIncompatibility {
63 │   return (
64 │     (value as Partial<FieldIncompatibility>).reason !== undefined &&
65 │     (value as Partial<FieldIncompatibility>).context !== undefined &&
66 ▶     Object.hasOwn(FieldIncompatibilityReason, (value as Partial<FieldIncompatibility>).reason!)
67 │   );
68 │ }
69 │ 
70 │ /** Picks the more significant field compatibility. */
71 ▶ export function pickFieldIncompatibility(
72 │   a: FieldIncompatibility,
73 │   b: FieldIncompatibility | null,
74 │ ): FieldIncompatibility {
75 ▶   if (b === null) {
76 │     return a;
77 │   }
78 ▶   if (a.reason < b.reason) {
79 ▶     return b;
80 │   }
81 ▶   return a;
82 │ }
```

1. **50〜53 行目：クラスごと全部だめ、の理由は 2 つ**

   `ClassManuallyInstantiated`（クラスを `new` している）と `OwningClassReferencedInClassProperty`（別のクラスのフィールドの中でこのクラスを参照している）。値は 0 と 1 です。
2. **56〜59 行目：入力 1 つの理由は、値と「どこで」の組**

   `context` は理由のもとになった TS のノード（書き込みの式など）で、分からなければ `null`。単位をまたぐときは落とします（第 7 回の 6 節）。
3. **62〜68 行目：入力の理由かどうかの見分け方**

   66 行目、`reason` が `FieldIncompatibilityReason` の値として存在するか（数の列挙には `'13'` のような逆向きのキーもあるので `Object.hasOwn` で当たる）で決めます。クラスの理由はただの数なので `.reason` が無く、偽になります。
4. **71〜82 行目：重いほうを選ぶ**

   78・79 行目、数が大きいほうが勝ちます。列挙の値の順番そのものが「重さ」なので、**列挙に値を足すときは、置く位置で重さが決まる**ことになります。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/input_detection/known_inputs.ts` L119–149 （▶ の行: 125, 131, 134–135, 138–140, 144, 148）

```ts
119 │   /** Whether the given input is incompatible for migration. */
120 │   isFieldIncompatible(descriptor: InputDescriptor): boolean {
121 │     return !!this.get(descriptor)?.isIncompatible();
122 │   }
123 │ 
124 │   /** Marks the given input as incompatible for migration. */
125 ▶   markFieldIncompatible(input: InputDescriptor, incompatibility: FieldIncompatibility) {
126 │     if (!this.knownInputIds.has(input.key)) {
127 │       throw new Error(`Input cannot be marked as incompatible because it's not registered.`);
128 │     }
129 │ 
130 │     const inputInfo = this.knownInputIds.get(input.key)!;
131 ▶     const existingIncompatibility = inputInfo.container.getInputMemberIncompatibility(input);
132 │ 
133 │     // Ensure an existing more significant incompatibility is not overridden.
134 ▶     if (existingIncompatibility !== null && isFieldIncompatibility(existingIncompatibility)) {
135 ▶       incompatibility = pickFieldIncompatibility(existingIncompatibility, incompatibility);
136 │     }
137 │ 
138 ▶     this.knownInputIds
139 ▶       .get(input.key)!
140 ▶       .container.memberIncompatibility.set(input.key, incompatibility);
141 │   }
142 │ 
143 │   /** Marks the given class as incompatible for migration. */
144 ▶   markClassIncompatible(clazz: ts.ClassDeclaration, incompatibility: ClassIncompatibilityReason) {
145 │     if (!this._classToDirectiveInfo.has(clazz)) {
146 │       throw new Error(`Class cannot be marked as incompatible because it's not known.`);
147 │     }
148 ▶     this._classToDirectiveInfo.get(clazz)!.incompatible = incompatibility;
149 │   }
```

入力に理由を付ける窓口は 125 行目の `markFieldIncompatible` だけです。131〜136 行目、すでに理由があれば重いほうを残すので、どの順番で理由が付いても、最後に残るのは一番重い理由です。クラスの理由（144〜149 行目）は比べずに上書きします。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/input_detection/directive_info.ts` L44–69 （▶ の行: 50–52, 60–61, 65, 68）

```ts
44 │   /**
45 │    * Checks whether there are any migrated inputs for the
46 │    * given class.
47 │    *
48 │    * Returns `false` if all inputs are incompatible.
49 │    */
50 ▶   hasMigratedFields(): boolean {
51 ▶     return Array.from(this.inputFields.values()).some(
52 ▶       ({descriptor}) => !this.isInputMemberIncompatible(descriptor),
53 │     );
54 │   }
55 │ 
56 │   /**
57 │    * Whether the given input member is incompatible. If the class is incompatible,
58 │    * then the member is as well.
59 │    */
60 ▶   isInputMemberIncompatible(input: InputDescriptor): boolean {
61 ▶     return this.getInputMemberIncompatibility(input) !== null;
62 │   }
63 │ 
64 │   /** Get incompatibility of the given member, if it's incompatible for migration. */
65 ▶   getInputMemberIncompatibility(
66 │     input: InputDescriptor,
67 │   ): ClassIncompatibilityReason | FieldIncompatibility | null {
68 ▶     return this.memberIncompatibility.get(input.key) ?? this.incompatible ?? null;
69 │   }
```

68 行目、入力の理由があればそれを、無ければクラスの理由を返します。どちらかがあれば、その入力は移行しません（60・61 行目）。50〜54 行目の `hasMigratedFields` は、pass 9（型の参照）を書き換えるかの判定に使います（第 7 回の 5 節）。

### 理由の全部の一覧

下の表の「付ける場所」は、`FieldIncompatibilityReason.` と `ClassIncompatibilityReason.` を `packages/core/schematics/migrations/` の spec 以外で grep して確かめたものです（2026-11-03）。best effort の列は、ls-refactorings で読んだ「無視できない 5 つ」に入っているか（入っていれば ×）です。クラスの理由は、best effort では全部消されます。

| 値 | 名前 | 付ける場所（signal input） | best effort で無視 | この章 |
| --- | --- | --- | --- | --- |
| 1 | `OverriddenByDerivedClass` | `KnownInputs.captureUnknownDerivedField`（子が入力でないフィールドで上書き、または子の `inputs` 配列で再宣言） | ○ | 5 節 |
| 2 | `RedeclaredViaDerivedClassInputsArray` | **どこからも付けない**（文の定義だけある。`inputs` 配列の場合は 1 が付く） | ○ | 5 節 |
| 3 | `TypeConflictWithBaseClass` | `KnownInputs.captureUnknownParentField`（親が入力でないフィールド・interface のメンバー） | ○ | 5 節 |
| 4 | `ParentIsIncompatible` | `convertToGlobalMeta`（親の入力に理由がある） | ○ | [第 7 回](07-mig-signal-input-passes.md) |
| 5 | `DerivedIsIncompatible` | **signal input では付けない**（signal クエリの `KnownQueries` だけ） | ○ | 5 節 |
| 6 | `SpyOnThatOverwritesField` | `SpyOnFieldPattern.detect` | ○ | 4 節 |
| 7 | `PotentiallyNarrowedInTemplateButNoSupportYet` | `executeAnalysisPhase`（テンプレートで絞り込みに使われている） | ○ | 3 節 |
| 8 | `SignalIncompatibleWithHostBinding` | `pass3__checkIncompatiblePatterns`（入力に `@HostBinding` も付いている） | ○ | 4 節 |
| 9 | `SignalInput__RequiredButNoGoodExplicitTypeExtractable` | `prepareAndCheckForConversion` | × | 2 節 |
| 10 | `SignalInput__QuestionMarkButNoGoodExplicitTypeExtractable` | `prepareAndCheckForConversion` | × | 2 節 |
| 11 | `SignalQueries__QueryListProblematicFieldAccessed` | signal クエリだけ | ○ | [第 10 回](10-mig-signal-queries.md) |
| 12 | `SignalQueries__IncompatibleMultiUnionType` | signal クエリだけ | ○ | 第 10 回 |
| 13 | `WriteAssignment` | `executeAnalysisPhase`（TS・テンプレート・ホストの書き込み） | ○ | 3 節 |
| 14 | `Accessor` | `prepareAndCheckForConversion`（get / set の入力） | × | 2 節 |
| 15 | `OutsideOfMigrationScope` | `convertToGlobalMeta`（どの単位でもソースで見なかった） | × | 第 7 回 |
| 16 | `SkippedViaConfigFilter` | `filterInputsViaConfig`（config の `shouldMigrateInput` が偽） | × | [ls-refactorings](../ls/19-ls-refactorings.md) |
| クラス 0 | `ClassManuallyInstantiated` | `checkIncompatiblePatterns`（`new X()`） | ○ | 4 節 |
| クラス 1 | `OwningClassReferencedInClassProperty` | `checkIncompatiblePatterns`（継承のあるクラスのフィールドで、同じ名前のメンバーが親か子にあるとき） | ○ | 4 節 |

## 2. 宣言を見ただけで分かる理由：pass 1 の準備

pass 1 は、ソースの入力ごとに `prepareAndCheckForConversion` を呼び、理由が返れば付けます（第 7 回の 3 節）。ここは型と初期値だけで決まる理由です。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/convert-input/prepare_and_check.ts` L42–60 （▶ の行: 49–52, 56–57）

```ts
42 │ export function prepareAndCheckForConversion(
43 │   node: InputNode,
44 │   metadata: ExtractedInput,
45 │   checker: ts.TypeChecker,
46 │   options: NgCompilerOptions,
47 │ ): FieldIncompatibility | ConvertInputPreparation {
48 │   // Accessor inputs cannot be migrated right now.
49 ▶   if (ts.isAccessor(node)) {
50 ▶     return {
51 ▶       context: node,
52 ▶       reason: FieldIncompatibilityReason.Accessor,
53 │     };
54 │   }
55 │ 
56 ▶   assert(
57 ▶     metadata.inputDecorator !== null,
58 │     'Expected an input decorator for inputs that are being migrated.',
59 │   );
60 │ 
```

49〜54 行目、get / set の入力は無条件で `Accessor` です。setter の中で別のフィールドに値を変換して入れるような書き方は、`input()` では `computed` や `transform` に書き直す必要があり、どれにするかを機械的に決められないからです（文は 6 節の引用の 23〜29 行目）。無視できない理由なので、best effort でも移行しません。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/convert-input/prepare_and_check.ts` L96–127 （▶ の行: 99, 102–103, 108–109, 112, 117, 122）

```ts
 96 │   // If the input is using `@Input() bla?: string;` with the "optional question mark",
 97 │   // then we try to explicitly add `undefined` as type, if it's not part of the type already.
 98 │   // This is ensuring correctness, as `bla?` automatically includes `undefined` currently.
 99 ▶   if (node.questionToken !== undefined) {
100 │     // If there is no type, but we have an initial value, try inferring
101 │     // it from the initializer.
102 ▶     if (typeToAdd === undefined && initialValue !== undefined) {
103 ▶       const inferredType = inferImportableTypeForInput(checker, node, initialValue);
104 │       if (inferredType !== null) {
105 │         typeToAdd = inferredType;
106 │       }
107 │     }
108 ▶     if (typeToAdd === undefined) {
109 ▶       return {
110 │         context: node,
111 │         reason:
112 ▶           FieldIncompatibilityReason.SignalInput__QuestionMarkButNoGoodExplicitTypeExtractable,
113 │       };
114 │     }
115 │ 
116 │     if (
117 ▶       !checker.isTypeAssignableTo(
118 │         checker.getUndefinedType(),
119 │         checker.getTypeFromTypeNode(typeToAdd),
120 │       )
121 │     ) {
122 ▶       typeToAdd = ts.factory.createUnionTypeNode([
123 │         typeToAdd,
124 │         ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
125 │       ]);
126 │     }
127 │   }
```

`@Input() size?: number` の `?` は、型に `undefined` を含めます。`input<number | undefined>()` と型を書かないと同じ意味にならないので、型が要ります。102〜107 行目、型が書かれていなければ初期値から推論を試み、それでも型が無ければ 108〜114 行目で理由を返します。型があれば、117〜126 行目で `undefined` を含まない型に `| undefined` を足します。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/convert-input/prepare_and_check.ts` L152–177 （▶ の行: 154–156, 159–160, 163, 169, 174）

```ts
152 │   // Attempt to extract type from input initial value. No explicit type, but input is required.
153 │   // Hence we need an explicit type, or fall back to `typeof`.
154 ▶   if (typeToAdd === undefined && initialValue !== undefined && metadata.required) {
155 ▶     const inferredType = inferImportableTypeForInput(checker, node, initialValue);
156 ▶     if (inferredType !== null) {
157 │       typeToAdd = inferredType;
158 │     } else {
159 ▶       // Note that we could use `typeToTypeNode` here but it's likely breaking because
160 ▶       // the generated type might depend on imports that we cannot add here (nor want).
161 │       return {
162 │         context: node,
163 ▶         reason: FieldIncompatibilityReason.SignalInput__RequiredButNoGoodExplicitTypeExtractable,
164 │       };
165 │     }
166 │   }
167 │ 
168 │   return {
169 ▶     requiredButIncludedUndefinedPreviously: metadata.required && node.questionToken !== undefined,
170 │     resolvedMetadata: metadata,
171 │     resolvedType: typeToAdd,
172 │     preferShorthandIfPossible,
173 │     originalInputDecorator: metadata.inputDecorator,
174 ▶     initialValue: isUndefinedInitialValue ? undefined : initialValue,
175 │     leadingTodoText,
176 │   };
177 │ }
```

必須の入力（`{required: true}`）は `input.required<T>()` になり、初期値を書けないので型の引数が要ります。154 行目、型が書かれていなくて初期値がある必須の入力は、初期値から型を推論します。159〜164 行目のコメントのとおり、推論した型を書き出すと、その型のための import を足せない場合があるので、そのときは理由を返して移行しません。

## 3. 参照から分かる理由：書き込みと、テンプレートの絞り込み

📄 `angular/packages/core/schematics/migrations/signal-migration/src/phase_analysis.ts` L106–136 （▶ の行: 107–111, 114–116, 119, 126–129）

```ts
106 │   // Determine incompatible inputs based on resolved references.
107 ▶   for (const reference of result.references) {
108 ▶     if (isTsReference(reference) && reference.from.isWrite) {
109 ▶       knownInputs.markFieldIncompatible(reference.target, {
110 ▶         reason: FieldIncompatibilityReason.WriteAssignment,
111 ▶         context: reference.from.node,
112 │       });
113 │     }
114 ▶     if (isTemplateReference(reference) || isHostBindingReference(reference)) {
115 ▶       if (reference.from.isWrite) {
116 ▶         knownInputs.markFieldIncompatible(reference.target, {
117 │           reason: FieldIncompatibilityReason.WriteAssignment,
118 │           // No TS node context available for template or host bindings.
119 ▶           context: null,
120 │         });
121 │       }
122 │     }
123 │ 
124 │     // TODO: Remove this when we support signal narrowing in templates.
125 │     // https://github.com/angular/angular/pull/55456.
126 ▶     if (isTemplateReference(reference)) {
127 ▶       if (reference.from.isLikelyPartOfNarrowing) {
128 ▶         knownInputs.markFieldIncompatible(reference.target, {
129 ▶           reason: FieldIncompatibilityReason.PotentiallyNarrowedInTemplateButNoSupportYet,
130 │           context: null,
131 │         });
132 │       }
133 │     }
134 │   }
135 │ 
136 │   return {inheritanceGraph};
```

解析の段の最後（第 7 回の 2 節の続き）で、pass 2 が集めた参照を 1 つずつ見ます。108〜113 行目、TS の参照が書き込み（[第 8 回](08-mig-signal-input-references.md)の 3 節）なら `WriteAssignment`。`context` に書き込みの式のノードを入れるので、言語サービスはそこを指して理由を出せます。114〜122 行目、テンプレートとホストの書き込みも同じ理由ですが、119 行目のとおり TS のノードが無いので `context` は `null` です。126〜133 行目、テンプレートで絞り込みに使われていそうな参照には `PotentiallyNarrowedInTemplateButNoSupportYet` を付けます。124・125 行目のコメントが指す PR #55456（テンプレートで signal の読み出しを絞り込めるようにする PR）は、2025-02-27 にマージされずに閉じています。

### テンプレートの「書き込み」はどう決まるか

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/template_reference_visitor.ts` L313–351 （▶ の行: 314–318, 324, 326, 344–346）

```ts
313 │   override visitBinary(ast: Binary, context: AST[]) {
314 ▶     if (ast.operation === '=') {
315 ▶       this.isInsideAssignment = true;
316 ▶       this.visit(ast.left, [...context, ast]);
317 ▶       this.isInsideAssignment = false;
318 ▶       this.visit(ast.right, [...context, ast]);
319 │     } else {
320 │       super.visitBinary(ast, context);
321 │     }
322 │   }
323 │ 
324 ▶   override visitConditional(ast: Conditional, context: AST[]) {
325 │     this.visit(ast.condition, context);
326 ▶     this.insideConditionalExpressionsWithReads.push(ast.condition);
327 │     this.visit(ast.trueExp, context);
328 │     this.visit(ast.falseExp, context);
329 │     this.insideConditionalExpressionsWithReads.pop();
330 │   }
331 │ 
332 │   /**
333 │    * Inspects the property access and attempts to resolve whether they access
334 │    * a known field. If so, the result is captured.
335 │    */
336 │   private _inspectPropertyAccess(ast: PropertyRead, astPath: AST[]) {
337 │     if (
338 │       this.fieldNamesToConsiderForReferenceLookup !== null &&
339 │       !this.fieldNamesToConsiderForReferenceLookup.has(ast.name)
340 │     ) {
341 │       return;
342 │     }
343 │ 
344 ▶     const isWrite = !!(
345 ▶       this.isInsideAssignment ||
346 ▶       (this.activeTmplAstNode && isTwoWayBindingNode(this.activeTmplAstNode))
347 │     );
348 │ 
349 │     this._checkAccessViaTemplateTypeCheckBlock(ast, isWrite, astPath) ||
350 │       this._checkAccessViaOwningComponentClassType(ast, isWrite, astPath);
351 │   }
```

1. **314〜318 行目：`=` の左側は、まるごと「書き込みの中」**

   `(change)="page = $event"` の `page` も、`(change)="user.name = $event"` の `user` と `name` も、左側にある読み出しは全部 `isInsideAssignment` の間に見られます。右側（318 行目）はふつうに見ます。
2. **344〜347 行目：書き込みかどうか**

   `=` の左側にいるか、いま見ているテンプレートのノードが 2 方向バインディング（`[(ngModel)]="query"`）なら書き込みです。2 方向バインディングは、コンパイラの中で「プロパティ」と「イベントで代入」の 2 つになるので、どちらのノードでも真になります。
3. **324〜330 行目：三項演算子の条件を覚えておく**

   `count ? count + 1 : 0` を見るとき、真の側と偽の側を見ている間だけ、条件の式を `insideConditionalExpressionsWithReads` に積みます。下の 450〜459 行目の判定が使います。

この形は 74638cab841（2026-05-08、「best effort のときの入力の書き込みの移行を改善」）で入りました。それまでは 314 行目の分岐が `ast.left` が `PropertyRead` のときだけ左側の 1 つを書き込みとして調べ、右側を見ていませんでした。コミットの説明は、`(ngModelChange)="inputD.prop = $event + inputF"` で何も移行されなかったこと、`inputC = $event` が `inputC = $event()` と**違う場所**に `()` が付いたことを挙げています。いまの結果はテストの節のゴールデンで見ます。

### テンプレートの「絞り込み」はどう決まるか

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/template_reference_visitor.ts` L117–136 （▶ の行: 121, 124, 127, 129, 132–133）

```ts
117 │   private descendAndCheckForNarrowedSimilarReferences(
118 │     potentiallyNarrowedInputs: TmplInputExpressionReference<TmplAstNode, D>[],
119 │     descend: () => void,
120 │   ) {
121 ▶     const inputs = potentiallyNarrowedInputs.map((i) => ({
122 │       ref: i,
123 │       key: i.targetField.key,
124 ▶       pastCount: this.seenKnownFieldsCount.get(i.targetField.key) ?? 0,
125 │     }));
126 │ 
127 ▶     descend();
128 │ 
129 ▶     for (const input of inputs) {
130 │       // Input was referenced inside a narrowable spot, and is used in child nodes.
131 │       // This is a sign for the input to be narrowed. Mark it as such.
132 ▶       if ((this.seenKnownFieldsCount.get(input.key) ?? 0) > input.pastCount) {
133 ▶         input.ref.isLikelyNarrowed = true;
134 │       }
135 │     }
136 │   }
```

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/template_reference_visitor.ts` L138–175 （▶ の行: 143, 145–146, 151–152, 156, 159–160, 166–170）

```ts
138 │   override visitTemplate(template: TmplAstTemplate): void {
139 │     // Note: We assume all bound expressions for templates may be subject
140 │     // to TCB narrowing. This is relevant for now until we support narrowing
141 │     // of signal calls in templates.
142 │     // TODO: Remove with: https://github.com/angular/angular/pull/55456.
143 ▶     this.templateAttributeReferencedFields = [];
144 │ 
145 ▶     tmplAstVisitAll(this, template.attributes);
146 ▶     tmplAstVisitAll(this, template.templateAttrs);
147 │ 
148 │     // If we are dealing with a microsyntax template, do not check
149 │     // inputs and outputs as those are already passed to the children.
150 │     // Template attributes may contain relevant expressions though.
151 ▶     if (template.tagName === 'ng-template') {
152 ▶       tmplAstVisitAll(this, template.inputs);
153 │       tmplAstVisitAll(this, template.outputs);
154 │     }
155 │ 
156 ▶     const referencedInputs = this.templateAttributeReferencedFields;
157 │     this.templateAttributeReferencedFields = null;
158 │ 
159 ▶     this.descendAndCheckForNarrowedSimilarReferences(referencedInputs, () => {
160 ▶       tmplAstVisitAll(this, template.children);
161 │       tmplAstVisitAll(this, template.references);
162 │       tmplAstVisitAll(this, template.variables);
163 │     });
164 │   }
165 │ 
166 ▶   override visitIfBlockBranch(block: TmplAstIfBlockBranch): void {
167 ▶     if (block.expression) {
168 ▶       const referencedFields = this.checkExpressionForReferencedFields(block, block.expression);
169 ▶       this.descendAndCheckForNarrowedSimilarReferences(referencedFields, () => {
170 ▶         super.visitIfBlockBranch(block);
171 │       });
172 │     } else {
173 │       super.visitIfBlockBranch(block);
174 │     }
175 │   }
```

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/template_reference_visitor.ts` L450–459 （▶ の行: 454–456）

```ts
450 │ 
451 │   private _isPartOfNarrowingTernary(read: PropertyRead) {
452 │     // Note: We do not safe check that the reads are fully matching 1:1. This is acceptable
453 │     // as worst case we just skip an input from being migrated. This is very unlikely too.
454 ▶     return this.insideConditionalExpressionsWithReads.some(
455 ▶       (r): r is PropertyRead | SafePropertyRead =>
456 ▶         (r instanceof PropertyRead || r instanceof SafePropertyRead) && r.name === read.name,
457 │     );
458 │   }
459 │ }
```

1. **121〜125 行目：降りる前に、入力ごとの「これまでに読まれた回数」を控える**

   条件の式（`@if (user)` の `user`）で読まれた入力ごとに、その時点の回数を取っておきます。
2. **127〜135 行目：中身を見たあと、回数が増えていれば「絞り込みに使われた」**

   条件で読んだ入力が、中身（`{{user.name}}`）でも読まれていれば回数が増えます。そのときだけ条件の側の参照に `isLikelyNarrowed` を立て、3 節の 126〜133 行目で理由になります。
3. **143〜163 行目：`*ngIf` と `<ng-template [ngIf]>`**

   `TmplAstTemplate`（`*` の構造ディレクティブと `ng-template`）では、143 行目から 157 行目までに見たバインディング全部を「条件」とみなします。140〜142 行目のコメントのとおり、どのディレクティブが絞り込むかは見ず、テンプレートに付いたバインディングは全部、絞り込みかもしれないとして扱います。
4. **166〜175 行目：`@if` の各分岐**

   168 行目で条件の式を調べ、169 行目で中身を見ます。`@switch` と `@case` も同じ形です。
5. **454〜457 行目：三項演算子**

   積んでおいた条件の式が、同じ名前の読み出しそのもの（`count ? ...`）なら、真の側・偽の側の `count` は絞り込みに使われているとみなします。452・453 行目のコメントのとおり、名前だけの比べ方なので、別の物を指していても移行しない側に倒れます。

📄 `angular/packages/core/schematics/migrations/signal-migration/test/golden.txt` L1239–1276 （▶ の行: 1241–1242, 1245, 1249, 1253, 1257, 1263, 1275–1276）

```
1239 │ @Component({
1240 │   template: `
1241 ▶     @if (first) {
1242 ▶       {{ first }}
1243 │     }
1244 │ 
1245 ▶     <ng-template [ngIf]="second">
1246 │       {{ second }}
1247 │     </ng-template>
1248 │ 
1249 ▶     <div *ngIf="third">
1250 │       {{ third }}
1251 │     </div>
1252 │ 
1253 ▶     <div *ngIf="fourth()">
1254 │       {{ notTheInput }}
1255 │     </div>
1256 │ 
1257 ▶     @if (fifth()) {
1258 │       {{ notTheInput }}
1259 │     }
1260 │   `,
1261 │ })
1262 │ export class MyComp {
1263 ▶   // TODO: Skipped for migration because:
1264 │   //  This input is used in a control flow expression (e.g. `@if` or `*ngIf`)
1265 │   //  and migrating would break narrowing currently.
1266 │   @Input() first = true;
1267 │   // TODO: Skipped for migration because:
1268 │   //  This input is used in a control flow expression (e.g. `@if` or `*ngIf`)
1269 │   //  and migrating would break narrowing currently.
1270 │   @Input() second = false;
1271 │   // TODO: Skipped for migration because:
1272 │   //  This input is used in a control flow expression (e.g. `@if` or `*ngIf`)
1273 │   //  and migrating would break narrowing currently.
1274 │   @Input() third = true;
1275 ▶   readonly fourth = input(true);
1276 ▶   readonly fifth = input(true);
```

ゴールデン（golden.txt）の template\_ng\_if.ts の結果です。`first`（1241・1242 行目の `@if`）・`second`（1245 行目の `[ngIf]`）・`third`（1249 行目の `*ngIf`）は、条件と中身の両方で読まれているので TODO が付いて残り、`fourth`（1253 行目）と `fifth`（1257 行目）は中身で読まれていないので、1275・1276 行目で移行されています。

## 4. 書き方のパターンから分かる理由：pass 3

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/3_check_incompatible_patterns.ts` L28–53 （▶ の行: 35–36, 39–42, 46, 49）

```ts
28 │ export function pass3__checkIncompatiblePatterns(
29 │   host: MigrationHost,
30 │   inheritanceGraph: InheritanceGraph,
31 │   checker: ts.TypeChecker,
32 │   groupedTsAstVisitor: GroupedTsAstVisitor,
33 │   knownInputs: KnownInputs,
34 │ ) {
35 ▶   checkIncompatiblePatterns(inheritanceGraph, checker, groupedTsAstVisitor, knownInputs, () =>
36 ▶     knownInputs.getAllInputContainingClasses(),
37 │   );
38 │ 
39 ▶   for (const input of knownInputs.knownInputIds.values()) {
40 ▶     const hostBindingDecorators = getAngularDecorators(
41 ▶       input.metadata.fieldDecorators,
42 ▶       ['HostBinding'],
43 │       host.isMigratingCore,
44 │     );
45 │ 
46 ▶     if (hostBindingDecorators.length > 0) {
47 │       knownInputs.markFieldIncompatible(input.descriptor, {
48 │         context: hostBindingDecorators[0].node,
49 ▶         reason: FieldIncompatibilityReason.SignalIncompatibleWithHostBinding,
50 │       });
51 │     }
52 │   }
53 │ }
```

35〜37 行目で下の `checkIncompatiblePatterns` を登録し、39〜52 行目で、入力のフィールドに `@HostBinding` も付いていれば `SignalIncompatibleWithHostBinding` を付けます。`@HostBinding` はフィールドの値をそのまま使うので、関数になった signal を呼んでくれないからです（6 節の文の 47〜55 行目）。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/problematic_patterns/common_incompatible_patterns.ts` L59–79 （▶ の行: 59, 63–64, 66–67, 69–70, 72, 78）

```ts
59 ▶   const spyOnPattern = new SpyOnFieldPattern(checker, fields);
60 │ 
61 │   const visitor = (node: ts.Node) => {
62 │     // Check for manual class instantiations.
63 ▶     if (ts.isNewExpression(node) && ts.isIdentifier(unwrapExpression(node.expression))) {
64 ▶       let newTarget = checker.getSymbolAtLocation(unwrapExpression(node.expression));
65 │       // Plain identifier references can point to alias symbols (e.g. imports).
66 ▶       if (newTarget !== undefined && newTarget.flags & ts.SymbolFlags.Alias) {
67 ▶         newTarget = checker.getAliasedSymbol(newTarget);
68 │       }
69 ▶       if (newTarget && inputClassSymbolsToClass.has(newTarget)) {
70 ▶         fields.markClassIncompatible(
71 │           inputClassSymbolsToClass.get(newTarget)!,
72 ▶           ClassIncompatibilityReason.ClassManuallyInstantiated,
73 │         );
74 │       }
75 │     }
76 │ 
77 │     // Detect `spyOn` problematic usages and record them.
78 ▶     spyOnPattern.detect(node);
79 │ 
```

63 行目、`new X()` を見つけたら、64〜68 行目で記号をたどり（import の別名ならもとの記号へ）、入力を持つクラスなら 70〜73 行目でクラスごと `ClassManuallyInstantiated` にします。`input()` は注入のコンテキストの外では作れないので、テストなどで `new` しているクラスは壊れるからです。78 行目で `spyOn` の判定も同じ巡回の中で呼びます。この続きでは、継承のあるクラスのフィールドの中でこのクラスを参照していて、同じ名前のメンバーが親か子にあると `OwningClassReferencedInClassProperty` にします（第 7 回の 2 節の `insidePropertyDeclaration` を読む部分）。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/pattern_advisors/spy_on_pattern.ts` L25–50 （▶ の行: 27, 29–31, 33–34, 40, 45–46）

```ts
25 │   detect(node: ts.Node) {
26 │     if (
27 ▶       ts.isCallExpression(node) &&
28 │       ts.isIdentifier(node.expression) &&
29 ▶       node.expression.text === 'spyOn' &&
30 ▶       node.arguments.length === 2 &&
31 ▶       ts.isStringLiteralLike(node.arguments[1])
32 │     ) {
33 ▶       const spyTargetType = this.checker.getTypeAtLocation(node.arguments[0]);
34 ▶       const spyProperty = spyTargetType.getProperty(node.arguments[1].text);
35 │ 
36 │       if (spyProperty === undefined) {
37 │         return;
38 │       }
39 │ 
40 ▶       const fieldTarget = this.fields.attemptRetrieveDescriptorFromSymbol(spyProperty);
41 │       if (fieldTarget === null) {
42 │         return;
43 │       }
44 │ 
45 ▶       this.fields.markFieldIncompatible(fieldTarget, {
46 ▶         reason: FieldIncompatibilityReason.SpyOnThatOverwritesField,
47 │         context: node,
48 │       });
49 │     }
50 │   }
```

27〜31 行目、`spyOn(obj, 'name')` の形（引数が 2 つで 2 つ目が文字列）だけを見ます。33・34 行目で 1 つ目の引数の型から、その名前のプロパティを探し、入力なら `SpyOnThatOverwritesField` です。`spyOn` はそのプロパティを書き換えるので、読み取り専用の signal の入力とは合いません。

## 5. 継承から分かる理由：pass 4

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/4_check_inheritance.ts` L35–48 （▶ の行: 40–42, 45）

```ts
35 │ export function pass4__checkInheritanceOfInputs(
36 │   inheritanceGraph: InheritanceGraph,
37 │   metaRegistry: MetadataReader | null,
38 │   knownInputs: KnownInputs,
39 │ ) {
40 ▶   checkInheritanceOfKnownFields(inheritanceGraph, metaRegistry, knownInputs, {
41 ▶     isClassWithKnownFields: (clazz) => knownInputs.isInputContainingClass(clazz),
42 ▶     getFieldsForClass: (clazz) => {
43 │       const directiveInfo = knownInputs.getDirectiveInfoForClass(clazz);
44 │       assert(directiveInfo !== undefined, 'Expected directive info to exist for input.');
45 ▶       return Array.from(directiveInfo.inputFields.values()).map((i) => i.descriptor);
46 │     },
47 │   });
48 │ }
```

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/problematic_patterns/check_inheritance.ts` L66–86 （▶ の行: 66, 72–73, 79–80）

```ts
66 ▶     const classFields = opts.getFieldsForClass(inputClass);
67 │     const inputFieldNamesFromMetadataArray = new Set<string>();
68 │ 
69 │     // Iterate through derived class chains and determine all inputs that are overridden
70 │     // via class metadata fields. e.g `@Component#inputs`. This is later used to mark a
71 │     // potential similar class input as incompatible— because those cannot be migrated.
72 ▶     if (metaRegistry !== null) {
73 ▶       for (const derivedClasses of inheritanceGraph.traceDerivedClasses(inputClass)) {
74 │         const derivedMeta =
75 │           ts.isClassDeclaration(derivedClasses) && derivedClasses.name !== undefined
76 │             ? metaRegistry.getDirectiveMetadata(new Reference(derivedClasses as ClassDeclaration))
77 │             : null;
78 │ 
79 ▶         if (derivedMeta !== null && derivedMeta.inputFieldNamesFromMetadataArray !== null) {
80 ▶           derivedMeta.inputFieldNamesFromMetadataArray.forEach((b) =>
81 │             inputFieldNamesFromMetadataArray.add(b),
82 │           );
83 │         }
84 │       }
85 │     }
86 │ 
```

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/problematic_patterns/check_inheritance.ts` L96–132 （▶ の行: 98, 101, 103, 106–108, 111, 116, 122, 125, 127–128, 131）

```ts
 96 │       // If we discover a derived, input re-declared via class metadata, then it
 97 │       // will cause conflicts as we cannot migrate it/ nor mark it as signal-based.
 98 ▶       if (
 99 │         fieldDescr.node.name !== undefined &&
100 │         (ts.isIdentifier(fieldDescr.node.name) || ts.isStringLiteralLike(fieldDescr.node.name)) &&
101 ▶         inputFieldNamesFromMetadataArray.has(fieldDescr.node.name.text)
102 │       ) {
103 ▶         fields.captureUnknownDerivedField(fieldDescr);
104 │       }
105 │ 
106 ▶       for (const derived of derivedMembers) {
107 ▶         const derivedInput = fields.attemptRetrieveDescriptorFromSymbol(derived);
108 ▶         if (derivedInput !== null) {
109 │           // Note: We always track dependencies from the child to the parent,
110 │           // so skip here for now.
111 ▶           continue;
112 │         }
113 │ 
114 │         // If we discover a derived, non-input member, then it will cause
115 │         // conflicts, and we mark the current input as incompatible.
116 ▶         fields.captureUnknownDerivedField(fieldDescr);
117 │         continue inputCheck;
118 │       }
119 │ 
120 │       // If there is no parent, we are done. Otherwise, check the parent
121 │       // to either inherit or check the incompatibility with the inheritance.
122 ▶       if (inherited === undefined) {
123 │         continue;
124 │       }
125 ▶       const inheritedMemberInput = fields.attemptRetrieveDescriptorFromSymbol(inherited);
126 │       // Parent is not an input, and hence will conflict..
127 ▶       if (inheritedMemberInput === null) {
128 ▶         fields.captureUnknownParentField(fieldDescr);
129 │         continue;
130 │       }
131 ▶       fields.captureKnownFieldInheritanceRelationship(fieldDescr, inheritedMemberInput);
132 │     }
```

1. **72〜85 行目と 98〜104 行目：子のクラスが `inputs` 配列で同じ名前を再宣言している**

   `@Directive({inputs: ['bla']})` の子があると、その子の `bla` は signal にできないので、親の入力も移行できません。103 行目で `captureUnknownDerivedField` を呼び、`OverriddenByDerivedClass` が付きます。列挙には `RedeclaredViaDerivedClassInputsArray`（値 2）という専用の値と文がありますが、grep した範囲では、どこもこの値を付けていません。
2. **106〜118 行目：子が同じ名前のメンバーを持っている**

   107〜112 行目、子のメンバーも入力なら、ここでは何もしません（111 行目のコメント「子から親への向きだけを記録する」）。116 行目、子のメンバーが入力でなければ、親の入力に `OverriddenByDerivedClass` を付けます。
3. **122〜131 行目：親に同じ名前のメンバーがある**

   127・128 行目、親のメンバーが入力でなければ（ふつうのフィールドや interface のメンバー）、`TypeConflictWithBaseClass`。131 行目、親も入力なら、その関係（`extendsFrom`）を記録します。記録した関係は `globalMeta` が親の理由を子へ伝えるのに使います（第 7 回の 6 節）。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/input_detection/known_inputs.ts` L159–181 （▶ の行: 166, 169, 172, 176, 179）

```ts
159 │   captureKnownFieldInheritanceRelationship(
160 │     derived: InputDescriptor,
161 │     parent: InputDescriptor,
162 │   ): void {
163 │     if (!this.has(derived)) {
164 │       throw new Error(`Expected input to exist in registry: ${derived.key}`);
165 │     }
166 ▶     this.get(derived)!.extendsFrom = parent;
167 │   }
168 │ 
169 ▶   captureUnknownDerivedField(field: InputDescriptor): void {
170 │     this.markFieldIncompatible(field, {
171 │       context: null,
172 ▶       reason: FieldIncompatibilityReason.OverriddenByDerivedClass,
173 │     });
174 │   }
175 │ 
176 ▶   captureUnknownParentField(field: InputDescriptor): void {
177 │     this.markFieldIncompatible(field, {
178 │       context: null,
179 ▶       reason: FieldIncompatibilityReason.TypeConflictWithBaseClass,
180 │     });
181 │   }
```

> [!WARNING]
> **ハマりどころ**
>
> **子の入力に理由があっても、親の入力には伝わりません。**166 行目は `extendsFrom` を記録するだけで、`globalMeta` の伝え方も「親 → 子」の向きだけです（第 7 回の 6 節）。signal クエリの側は、同じ形の関数で「子に理由があれば親に `DerivedIsIncompatible`」を付けています（第 10 回）。手元で、子だけが書き込みをしている下の入力にこのフォルダーの CLI（第 7 回の 6 節の最後）を走らせると、親だけが `input()` になり、子は `@Input() override bla` のまま残りました。この結果を、`input` と `InputSignal` だけを宣言した仮の `@angular/core` の型で `tsc --noEmit --strict` にかけると、TS2416（親と子のプロパティの型が合わない）になります。ゴールデンには逆向き（親に書き込み → 子が残る）の例（derived\_class\_second\_separate.ts）はありますが、この向きの例はありません。2026-11-03 の時点で、これを名指しした issue は `gh search issues` で見つかりませんでした。

📄 `手元で確かめた入力（a.ts）`

```
import {Directive, Input} from '@angular/core';

@Directive()
export class Base {
  @Input() bla = true;
}

@Directive()
export class Derived extends Base {
  @Input() override bla = false;

  click() {
    this.bla = true;
  }
}
```

📄 `ターミナル（../angular のファイルは変えない。書き換わるのは一時フォルダーの a.ts だけ）`

```
cd ~/angular-research/angular
pnpm bazel run //packages/core/schematics/migrations/signal-migration/src:bin -- \
  <一時フォルダー>/tsconfig.json --insert-todos
```

📄 `移行後の a.ts（--insert-todos。2026-11-03）`

```
import {Directive, Input, input} from '@angular/core';

@Directive()
export class Base {
  readonly bla = input(true);
}

@Directive()
export class Derived extends Base {
  // TODO: Skipped for migration because:
  //  Your application code writes to the input. This prevents migration.
  @Input() override bla = false;

  click() {
    this.bla = true;
  }
}
```

📄 `仮の型で tsc --noEmit --strict にかけた結果`

```
a.ts(12,21): error TS2416: Property 'bla' in type 'Derived' is not assignable to the same property in base type 'Base'.
  Type 'boolean' is not assignable to type 'InputSignal<boolean>'.
```

## 6. --insert-todos：理由を TODO の文にする

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/6_migrate_input_declarations.ts` L31–54 （▶ の行: 39–40, 43, 45–47, 52–53）

```ts
31 │   let filesWithMigratedInputs = new Set<ts.SourceFile>();
32 │   let filesWithIncompatibleInputs = new WeakSet<ts.SourceFile>();
33 │ 
34 │   for (const [input, metadata] of result.sourceInputs) {
35 │     const sf = input.node.getSourceFile();
36 │     const inputInfo = knownInputs.get(input)!;
37 │ 
38 │     // Do not migrate incompatible inputs.
39 ▶     if (inputInfo.isIncompatible()) {
40 ▶       const incompatibilityReason = inputInfo.container.getInputMemberIncompatibility(input);
41 │ 
42 │       // Add a TODO for the incompatible input, if desired.
43 ▶       if (incompatibilityReason !== null && host.config.insertTodosForSkippedFields) {
44 │         result.replacements.push(
45 ▶           ...insertTodoForIncompatibility(input.node, info, incompatibilityReason, {
46 ▶             single: 'input',
47 ▶             plural: 'inputs',
48 │           }),
49 │         );
50 │       }
51 │ 
52 ▶       filesWithIncompatibleInputs.add(sf);
53 ▶       continue;
54 │     }
```

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/problematic_patterns/incompatibility_todos.ts` L28–53 （▶ の行: 36–39, 41, 44–47, 50–51）

```ts
28 │ export function insertTodoForIncompatibility(
29 │   node: ts.ClassElement,
30 │   programInfo: ProgramInfo,
31 │   incompatibility: FieldIncompatibility | ClassIncompatibilityReason,
32 │   fieldName: {single: string; plural: string},
33 │ ): Replacement[] {
34 │   // If a field is skipped via config filter or outside migration scope, do not
35 │   // insert TODOs, as this could results in lots of unnecessary comments.
36 ▶   if (
37 ▶     isFieldIncompatibility(incompatibility) &&
38 ▶     (incompatibility.reason === FieldIncompatibilityReason.SkippedViaConfigFilter ||
39 ▶       incompatibility.reason === FieldIncompatibilityReason.OutsideOfMigrationScope)
40 │   ) {
41 ▶     return [];
42 │   }
43 │ 
44 ▶   const message = isFieldIncompatibility(incompatibility)
45 ▶     ? getMessageForFieldIncompatibility(incompatibility.reason, fieldName).short
46 ▶     : getMessageForClassIncompatibility(incompatibility, fieldName).short;
47 ▶   const lines = cutStringToLineLimit(message, 70);
48 │ 
49 │   return [
50 ▶     insertPrecedingLine(node, programInfo, `// TODO: Skipped for migration because:`),
51 ▶     ...lines.map((line) => insertPrecedingLine(node, programInfo, `//  ${line}`)),
52 │   ];
53 │ }
```

1. **pass 6 の 39〜53 行目：理由のある入力は書き換えずに、TODO だけ**

   43 行目の `insertTodosForSkippedFields` は `--insert-todos` から来ます。46・47 行目、文の中の「input」「inputs」の言葉は引数で渡すので、signal クエリの移行は同じ関数に「query」「queries」を渡して使い回します。
2. **36〜42 行目：範囲の外と config で外した入力には書かない**

   コメントのとおり、`node_modules` の入力や、言語サービスで 1 つだけ選んだときの残りの入力に TODO を書くと、コメントが大量に増えるからです。
3. **44〜51 行目：短い文を 70 文字で折り返し、宣言の前の行に差し込む**

   44〜46 行目、`incompatibility_human.ts` の `short` の文を選び、47 行目で 70 文字ごとに切り、50・51 行目で `// TODO: Skipped for migration because:` の行と `// ` で始まる行を、宣言の直前に差し込みます。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/problematic_patterns/incompatibility_human.ts` L22–55 （▶ の行: 23, 25, 30, 32, 35, 37, 40, 42, 47, 50）

```ts
22 │   switch (reason) {
23 ▶     case FieldIncompatibilityReason.Accessor:
24 │       return {
25 ▶         short: `Accessor ${fieldName.plural} cannot be migrated as they are too complex.`,
26 │         extra:
27 │           'The migration potentially requires usage of `effect` or `computed`, but ' +
28 │           'the intent is unclear. The migration cannot safely migrate.',
29 │       };
30 ▶     case FieldIncompatibilityReason.OverriddenByDerivedClass:
31 │       return {
32 ▶         short: `The ${fieldName.single} cannot be migrated because the field is overridden by a subclass.`,
33 │         extra: 'The field in the subclass is not a signal, so migrating would break your build.',
34 │       };
35 ▶     case FieldIncompatibilityReason.ParentIsIncompatible:
36 │       return {
37 ▶         short: `This ${fieldName.single} is inherited from a superclass, but the parent cannot be migrated.`,
38 │         extra: 'Migrating this field would cause your build to fail.',
39 │       };
40 ▶     case FieldIncompatibilityReason.DerivedIsIncompatible:
41 │       return {
42 ▶         short: `This ${fieldName.single} cannot be migrated because the field is overridden by a subclass.`,
43 │         extra:
44 │           'The field in the subclass is incompatible for migration, so migrating this field would ' +
45 │           'break your build.',
46 │       };
47 ▶     case FieldIncompatibilityReason.SignalIncompatibleWithHostBinding:
48 │       return {
49 │         short:
50 ▶           `This ${fieldName.single} is used in combination with \`@HostBinding\` and ` +
51 │           `migrating would break.`,
52 │         extra:
53 │           `\`@HostBinding\` does not invoke the signal automatically and your code would ` +
54 │           `break after migration. Use \`host\` of \`@Directive\`/\`@Component\`for host bindings.`,
55 │       };
```

文は理由ごとに `short`（TODO と言語サービスの電球に出る）と `extra`（言語サービスで詳しく出す）の 2 つです。32 行目の `The ${fieldName.single} cannot be migrated ...` の `fieldName.single` に「input」が入ります。言語サービスがこの文をどう出すかは[ls-refactorings](../ls/19-ls-refactorings.md)の 5 節です。

## 7. best effort：無視できる理由は消して、書き換えてしまう

`--best-effort-mode` を付けると、`analyze` の中と `migrate` の中の 2 回（第 7 回の 6 節）、`filterIncompatibilitiesForBestEffortMode` が理由を消します。クラスの理由は全部、入力の理由は「無視できない 5 つ」以外が消えます（ls-refactorings の 5 節）。消えた入力は、理由の無い入力と同じに書き換えられます。つまり、書き込みがあっても宣言は `input()` になり、**壊れたコードは利用者が直す**前提です。無視できない 5 つ（get / set、型を決められない必須と `?`、範囲の外、config で外した）は、「書き換えたあとの形そのものを決められない」か「書き換えてはいけない」ものです。

## テストと直し方

この章の判定を確かめているのは、主にゴールデンテストの 2 つのターゲットです。`:test` は `--insert-todos` で TODO の文まで、`:test_best_effort` は `--best-effort-mode --insert-todos` で、理由を消したあとの書き換えまでを、同じ 64 の入力ファイルで比べます（仕組みは[第 19 回](19-mig-testing.md)、入力のファイルの置き場所は[第 8 回](08-mig-signal-input-references.md)のテストの節）。74638cab841 が足した入力が template\_writes.ts です。

📄 `angular/packages/core/schematics/migrations/signal-migration/test/golden-test/template_writes.ts` L1–23 （▶ の行: 7–10, 13）

```ts
 1 │ // tslint:disable
 2 │ 
 3 │ import {Component, Input} from '@angular/core';
 4 │ 
 5 │ @Component({
 6 │   template: `
 7 ▶     <input [(ngModel)]="inputA" />
 8 ▶     <input [(ngModel)]="inputB.prop.prop" />
 9 ▶     <input (ngModelChange)="inputC = $event" />
10 ▶     <input (ngModelChange)="inputD.prop = $event + inputF" />
11 │   `,
12 │   host: {
13 ▶     '(click)': 'inputE = true',
14 │   },
15 │ })
16 │ class TwoWayBinding {
17 │   @Input() inputA = '';
18 │   @Input() inputB = {prop: {prop: ''}};
19 │   @Input() inputC = '';
20 │   @Input() inputD = {prop: ''};
21 │   @Input() inputE = false;
22 │   @Input() inputF = '';
23 │ }
```

📄 `angular/packages/core/schematics/migrations/signal-migration/test/golden.txt` L1317–1345 （▶ の行: 1322, 1329–1330, 1340, 1344）

```
1317 │ @Component({
1318 │   template: `
1319 │     <input [(ngModel)]="inputA" />
1320 │     <input [(ngModel)]="inputB.prop.prop" />
1321 │     <input (ngModelChange)="inputC = $event" />
1322 ▶     <input (ngModelChange)="inputD.prop = $event + inputF()" />
1323 │   `,
1324 │   host: {
1325 │     '(click)': 'inputE = true',
1326 │   },
1327 │ })
1328 │ class TwoWayBinding {
1329 ▶   // TODO: Skipped for migration because:
1330 ▶   //  Your application code writes to the input. This prevents migration.
1331 │   @Input() inputA = '';
1332 │   // TODO: Skipped for migration because:
1333 │   //  Your application code writes to the input. This prevents migration.
1334 │   @Input() inputB = {prop: {prop: ''}};
1335 │   // TODO: Skipped for migration because:
1336 │   //  Your application code writes to the input. This prevents migration.
1337 │   @Input() inputC = '';
1338 │   // TODO: Skipped for migration because:
1339 │   //  Your application code writes to the input. This prevents migration.
1340 ▶   @Input() inputD = {prop: ''};
1341 │   // TODO: Skipped for migration because:
1342 │   //  Your application code writes to the input. This prevents migration.
1343 │   @Input() inputE = false;
1344 ▶   readonly inputF = input('');
1345 │ }
```

📄 `angular/packages/core/schematics/migrations/signal-migration/test/golden_best_effort.txt` L1265–1289 （▶ の行: 1273–1276, 1279, 1283, 1288）

```
1265 │ @@@@@@ template_writes.ts @@@@@@
1266 │ 
1267 │ // tslint:disable
1268 │ 
1269 │ import {Component, input} from '@angular/core';
1270 │ 
1271 │ @Component({
1272 │   template: `
1273 ▶     <input [(ngModel)]="inputA()" />
1274 ▶     <input [(ngModel)]="inputB().prop.prop" />
1275 ▶     <input (ngModelChange)="inputC() = $event" />
1276 ▶     <input (ngModelChange)="inputD().prop = $event + inputF()" />
1277 │   `,
1278 │   host: {
1279 ▶     '(click)': 'inputE() = true',
1280 │   },
1281 │ })
1282 │ class TwoWayBinding {
1283 ▶   readonly inputA = input('');
1284 │   readonly inputB = input({ prop: { prop: '' } });
1285 │   readonly inputC = input('');
1286 │   readonly inputD = input({ prop: '' });
1287 │   readonly inputE = input(false);
1288 ▶   readonly inputF = input('');
1289 │ }
```

1. **golden.txt（安全なほう）：書き込みのある 5 つは TODO を付けて残る**

   `inputD` は `inputD.prop` に書き込んでいるだけですが、3 節の 314〜318 行目のとおり左側の読み出しは全部書き込みの中なので、1340 行目のとおり `inputD` にも「writes to the input」の TODO が付きます。右側の `inputF` は読むだけなので、1344 行目で移行され、1322 行目のテンプレートで `inputF()` になっています（74638cab841 の前は右側を見ていませんでした）。
2. **golden\_best\_effort.txt：全部 input() にして、読み出しの直後に () を足す**

   1273〜1276 行目、`()` は入力の名前の直後に付きます（第 8 回の 5 節。pass 7 は読み出しの終わりの位置に足す）。1275 行目の `inputC() = $event` と 1279 行目の `inputE() = true` は、そのままでは動かないコードで、利用者が直す前提の出力です。TS の側の書き込みは、第 8 回の 6 節で読んだとおり pass 5 が書き込みの参照を飛ばすので、`()` も付けずに残ります。

📄 `angular/packages/core/schematics/test/signal_input_migration_spec.ts` L140–161 （▶ の行: 147, 150, 158, 160）

```ts
140 │       '/index.ts',
141 │       `
142 │       import {Input, Directive} from '@angular/core';
143 │ 
144 │       @Directive({})
145 │       export class SomeDirective {
146 │         @Input({required: true}) name = '';
147 ▶         @Input({required: true}) lastName = '';
148 │ 
149 │         someFn() {
150 ▶           this.lastName = 'other name';
151 │         }
152 │       }`,
153 │     );
154 │ 
155 │     const messages: string[] = [];
156 │     runner.logger.subscribe((m) => messages.push(m.message));
157 │ 
158 ▶     await runMigration({bestEffortMode: true});
159 │ 
160 ▶     expect(messages).toContain(`  -> Migrated 2/2 inputs.`);
161 │   });
```

test/signal\_input\_migration\_spec.ts の `'should report correct statistics with best effort mode'` です。150 行目で `lastName` に書き込んでいても、158 行目の best effort では 160 行目のとおり 2 つとも移行されたと数えます。第 7 回の「テストと直し方」の同じ入力（best effort なし）では 1/2 でした。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/schematics/migrations/signal-migration/test:test_best_effort \
  --nocache_test_results --test_output=all
pnpm bazel test //packages/core/schematics/test:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=statistics with best effort mode"
```

📄 `出力（2026-11-03 に実行。抜粋）`

```
==================== Test output for //packages/core/schematics/migrations/signal-migration/test:test_best_effort:
.../golden-test/transform_no_explicit_types.ts: Error: FatalDiagnosticError: Code: 1010, Message: Input transform function first parameter must have a type
Found reference to field ...template_concat_string.ts@@WithConcatTemplate@@bla that cannot be migrated because the template cannot be parsed with source map information (...)
Successfully ran all commands in test directory: ...
INFO: Elapsed time: 1.218s, Critical Path: 1.06s
//packages/core/schematics/migrations/signal-migration/test:test_best_effort PASSED in 1.0s

==================== Test output for //packages/core/schematics/test:test (shard 10 of 16):
Ran 1 of 517 specs
1 spec, 0 failures
==================== Test output for //packages/core/schematics/test:test (shard 12 of 16):
Ran 1 of 517 specs
1 spec, 0 failures
（ほかの 14 の shard は Ran 0 of 516）
INFO: Elapsed time: 2.496s, Critical Path: 1.90s
//packages/core/schematics/test:test                                     PASSED in 1.6s
```

1. **結果**

   `:test_best_effort` は PASSED、1.0 秒（ゴールデンなので件数は出ません）。schematics の spec を「statistics with best effort mode」で絞ると、16 の shard のうち 10 と 12 が「Ran 1」で、合わせて 2 本でした。signal input と signal クエリの両方の spec が同じ it の名前を持っているからです。2.5 秒。
2. **直すとしたらどこか**

   理由を付ける場所は 1 節の表のとおりです。重さを変えるなら `incompatibility.ts` の列挙の順番、無視できるかは同じファイルの `nonIgnorableFieldIncompatibilities`、文は `incompatibility_human.ts`、TODO の形は `incompatibility_todos.ts`。5 節の「子の理由が親に伝わらない」を直すなら、`KnownInputs.captureKnownFieldInheritanceRelationship`（known\_inputs.ts）か `batch/merge_unit_data.ts` の `convertToGlobalMeta` に、子から親への向きを足すことになります。確かめる spec は `test/golden-test/` に「子だけが書き込む」入力を足し、golden.txt と golden\_best\_effort.txt の両方を更新します。単位をまたぐ形（親と子が別の tsconfig）まで確かめるなら、`:test_batch`（`manual` のタグ。第 7 回）も手で走らせます。
3. **関係する issue と PR**

   74638cab841（best effort の書き込み）、PR #55456（テンプレートの絞り込み。閉じている）。#66053（閉じている。NOT\_PLANNED）は、継承しているライブラリのコンポーネントで TCB を作るときに `FatalDiagnosticError`（Code 3004、記号を import できない）が出て、signal input・output・signal クエリの移行が止まるという報告で、「移行できない」と判定する前に解析そのものが落ちる例です。読み方は[第 20 回](20-mig-issues.md)。本家に PR を出すことはこのシリーズでは勧めません。

## 聞かれそうな質問

**Q. 1 つの入力に理由がいくつも当てはまるとき、どれが残りますか？**

数の大きい理由です。known\_inputs.ts の 131〜136 行目で、すでにある理由と新しい理由を `pickFieldIncompatibility` で比べ、incompatibility.ts の 78・79 行目のとおり大きいほうを残します。単位をまたいでも同じ関数で比べます（第 7 回）。TODO や言語サービスに出るのは、その残った 1 つの文だけです。

**Q. テンプレートで `@if (user) { {{user.name}} }` と書いている入力は、なぜ移行されないのですか？**

テンプレートの型チェックは `user` を絞り込みますが、`user()` の呼び出しは絞り込めないので、移行すると型エラーになるからです。template\_reference\_visitor.ts の 168・169 行目で条件と中身を見て、127〜135 行目で中身でも読まれていれば `isLikelyNarrowed` を立て、phase\_analysis.ts の 126〜133 行目で `PotentiallyNarrowedInTemplateButNoSupportYet` を付けます。無視できる理由なので、best effort なら移行されます。

**Q. `(change)="user.name = $event"` のように、入力のオブジェクトの中身に書き込むだけでも移行されませんか？**

安全なほうでは移行されません。template\_reference\_visitor.ts の 314〜318 行目で `=` の左側を丸ごと `isInsideAssignment` の中で見るので、`user` の読み出しも書き込みとして記録されます。golden.txt の 1340 行目の `inputD` がその例です。best effort なら golden\_best\_effort.txt の 1276 行目のとおり `inputD().prop = ...` になります。

**Q. best effort にすると、何でも移行されるのですか？**

いいえ。get / set の入力、型を決められない必須の入力と `?` の入力、範囲の外の入力、config で外した入力の 5 つは残ります（ls-refactorings の 5 節の「無視できない」一覧）。前の 3 つは「書き換えた形を決められない」もの、後の 2 つは「書き換えてはいけない」ものです。それ以外は宣言も参照も書き換えられ、golden\_best\_effort.txt の 1275 行目のように、そのままでは動かないコードが残ることがあります。

**Q. 子クラスの入力が移行できないと、親クラスの入力はどうなりますか？**

signal input の移行では、親は移行されます。check\_inheritance.ts の 107〜112 行目で子の入力は飛ばし、known\_inputs.ts の 166 行目は `extendsFrom` を記録するだけだからです。その結果、子が `@Input()` のまま親が `input()` になり、手元では TS2416 になりました（5 節）。signal クエリの移行では、子に理由があれば親に `DerivedIsIncompatible` が付きます（第 10 回）。

## 読み終えて

- 理由は入力ごと（16 種類）とクラスごと（2 種類）。入力の理由は数の大きいほうが勝ち、窓口は `markFieldIncompatible` の 1 つ。
- 宣言だけで分かる理由（get / set・型を決められない）は pass 1、参照から分かる理由（書き込み・テンプレートの絞り込み）は解析の段の最後、パターン（`new`・`spyOn`・`@HostBinding`）は pass 3、継承は pass 4 と `globalMeta`。
- テンプレートの「書き込み」は `=` の左側全部と 2 方向バインディング、「絞り込み」は条件で読んだ入力を中身でも読むこと。
- TODO の文は `incompatibility_human.ts` の `short` を 70 文字で折り返したもの。範囲の外と config で外した入力には書かない。
- `RedeclaredViaDerivedClassInputsArray` と `DerivedIsIncompatible` は signal input では付かない。子の理由が親に伝わらないので、子だけが書き込む継承は安全なほうでも壊れる。

---

← 前: [参照の書き換え：this.x を this.x() に](08-mig-signal-input-references.md)  
次: [signal クエリへの移行：@ViewChild を viewChild() に](10-mig-signal-queries.md) →
