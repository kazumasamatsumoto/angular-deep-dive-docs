[目次](../README.md) › [テンプレート型チェックの内側](README.md) › 第 18 回 / 全 20 回

# 拡張診断：16 の検査と、それを足す方法

> ExtendedTemplateCheckerImpl が TemplateCheck の一覧を TCB とテンプレートの AST の両方を見て走らせる仕組みと、16 の検査（invalid\_banana\_in\_box・nullish\_coalescing\_not\_nullable・interpolated\_signal\_not\_invoked など）のうち数個を 1 行ずつ。extendedDiagnostics の設定で警告・エラー・抑止を選ぶ行、新しい検査を足すときに触るファイルの一覧。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-extended)

---

`<div ([foo])="bar">` と書くと、ビルドは通るのに「NG8101 In the two-way binding syntax the parentheses should be inside the brackets」という**警告**が出ます。これは TCB の型エラーでも、[第 17 回](17-typecheck-oob.md)の帯域外の診断でもなく、TCB ができたあとにテンプレートをもう一度歩く「拡張診断（extended diagnostics）」です。この章では、16 の検査を束ねる `ExtendedTemplateCheckerImpl` が設定から警告・エラー・抑止を決める行、検査がテンプレートを歩く `TemplateVisitor`、AST だけで決まる検査と TCB の型を尋ねる検査の違いを読み、新しい検査を足すときに触るファイルを実際の PR で数えます。

読む対象は compiler-cli/src/ngtsc/typecheck/extended/ の index.ts・src/extended\_template\_checker.ts・api/api.ts・checks/\*/index.ts、core/src/compiler.ts（検査の組み立てと設定の検査）、typecheck/src/checker.ts の `makeTemplateDiagnostic`、それに test/ngtsc/extended\_template\_diagnostics\_spec.ts です。

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
14. [14. ng-template のガード](14-typecheck-template-guards.md)
15. [15. 参照と pipe](15-typecheck-refs-pipes.md)
16. [16. 診断の対応付け](16-typecheck-diagnostics-mapping.md)
17. [17. 帯域外の診断](17-typecheck-oob.md)
18. **18. 拡張診断**（この章）
19. [19. TemplateTypeChecker](19-typecheck-template-type-checker.md)
20. [20. issue と PR を読む](20-typecheck-issues.md)

## 1. 16 の検査は 1 つの配列

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/index.ts` L31–57 （▶ の行: 31, 35–36, 50, 53–56）

```ts
31 ▶ export const ALL_DIAGNOSTIC_FACTORIES: readonly TemplateCheckFactory<
32 │   ErrorCode,
33 │   ExtendedTemplateDiagnosticName
34 │ >[] = [
35 ▶   invalidBananaInBoxFactory,
36 ▶   nullishCoalescingNotNullableFactory,
37 │   optionalChainNotNullableFactory,
38 │   missingControlFlowDirectiveFactory,
39 │   textAttributeNotBindingFactory,
40 │   missingNgForOfLetFactory,
41 │   missingStructuralDirectiveFactory,
42 │   suffixNotSupportedFactory,
43 │   interpolatedSignalNotInvoked,
44 │   uninvokedFunctionInEventBindingFactory,
45 │   unusedLetDeclarationFactory,
46 │   skipHydrationNotStaticFactory,
47 │   unparenthesizedNullishCoalescingFactory,
48 │   uninvokedTrackFunctionFactory,
49 │   uninvokedFunctionInTextInterpolationFactory,
50 ▶   deferTriggerMisconfigurationFactory,
51 │ ];
52 │ 
53 ▶ export const SUPPORTED_DIAGNOSTIC_NAMES = new Set<string>([
54 ▶   ExtendedTemplateDiagnosticName.CONTROL_FLOW_PREVENTING_CONTENT_PROJECTION,
55 ▶   ExtendedTemplateDiagnosticName.UNUSED_STANDALONE_IMPORTS,
56 ▶   ...ALL_DIAGNOSTIC_FACTORIES.map((factory) => factory.name),
57 │ ]);
```

31〜51 行目の `ALL_DIAGNOSTIC_FACTORIES` が検査の全部です。35〜50 行目に 16 個。53〜57 行目の `SUPPORTED_DIAGNOSTIC_NAMES` は「設定に書いてよい名前」の集合で、16 個の名前に加えて 54 行目の `controlFlowPreventingContentProjection`（[第 17 回](17-typecheck-oob.md)の 4 節。作るのは OOB）と 55 行目の `unusedStandaloneImports`（[未使用の import の章](../standalone/04-standalone-used-only.md)。作るのは SourceFileValidator）が入っています。名前と設定の枠は拡張診断と同じで、**作っている場所が違う** 2 つです。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L1686–1700 （▶ の行: 1688–1689, 1691–1693）

```ts
1686 │     // Only construct the extended template checker if the configuration is valid and usable.
1687 │     const extendedTemplateChecker =
1688 ▶       this.constructionDiagnostics.length === 0
1689 ▶         ? new ExtendedTemplateCheckerImpl(
1690 │             templateTypeChecker,
1691 ▶             checker,
1692 ▶             ALL_DIAGNOSTIC_FACTORIES,
1693 ▶             this.options,
1694 │           )
1695 │         : null;
1696 │ 
1697 │     const templateSemanticsChecker =
1698 │       this.constructionDiagnostics.length === 0
1699 │         ? new TemplateSemanticsCheckerImpl(templateTypeChecker)
1700 │         : null;
```

NgCompiler.makeCompilation が、TemplateTypeChecker・`ts.TypeChecker`（1691 行目の `checker`）・1692 行目の配列・1693 行目のコンパイラオプションを渡して作ります。1688 行目、オプションの検査（6 節）で 1 つでも診断が出ていたら作りません（null）。走らせるのは runAdditionalChecks で、そこには `this.strictTemplates &&` の条件が付いています（core/src/compiler.ts:1289。[第 17 回](17-typecheck-oob.md)の 5 節で引用）。

## 2. コンストラクタ：設定から category を決め、検査を作る

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/src/extended_template_checker.ts` L26–64 （▶ の行: 35, 38, 40–43, 47–48, 52, 57, 62）

```ts
26 │   constructor(
27 │     templateTypeChecker: TemplateTypeChecker,
28 │     typeChecker: ts.TypeChecker,
29 │     templateCheckFactories: readonly TemplateCheckFactory<
30 │       ErrorCode,
31 │       ExtendedTemplateDiagnosticName
32 │     >[],
33 │     options: NgCompilerOptions,
34 │   ) {
35 ▶     this.partialCtx = {templateTypeChecker, typeChecker};
36 │     this.templateChecks = new Map<TemplateCheck<ErrorCode>, ts.DiagnosticCategory>();
37 │ 
38 ▶     for (const factory of templateCheckFactories) {
39 │       // Read the diagnostic category from compiler options.
40 ▶       const category = diagnosticLabelToCategory(
41 ▶         options?.extendedDiagnostics?.checks?.[factory.name] ??
42 ▶           options?.extendedDiagnostics?.defaultCategory ??
43 ▶           DiagnosticCategoryLabel.Warning,
44 │       );
45 │ 
46 │       // Skip the diagnostic if suppressed via compiler options.
47 ▶       if (category === null) {
48 ▶         continue;
49 │       }
50 │ 
51 │       // Try to create the check.
52 ▶       const check = factory.create(options);
53 │ 
54 │       // Skip the diagnostic if it was disabled due to unsupported options. For example, this can
55 │       // happen if the check requires `strictNullChecks: true` but that flag is disabled in compiler
56 │       // options.
57 ▶       if (check === null) {
58 │         continue;
59 │       }
60 │ 
61 │       // Use the check.
62 ▶       this.templateChecks.set(check, category);
63 │     }
64 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/src/extended_template_checker.ts` L113–124 （▶ の行: 115–120）

```ts
113 │ function diagnosticLabelToCategory(label: DiagnosticCategoryLabel): ts.DiagnosticCategory | null {
114 │   switch (label) {
115 ▶     case DiagnosticCategoryLabel.Warning:
116 ▶       return ts.DiagnosticCategory.Warning;
117 ▶     case DiagnosticCategoryLabel.Error:
118 ▶       return ts.DiagnosticCategory.Error;
119 ▶     case DiagnosticCategoryLabel.Suppress:
120 ▶       return null;
121 │     default:
122 │       return assertNever(label);
123 │   }
124 │ }
```

1. **40〜44 行目：3 段の既定値**

   `extendedDiagnostics.checks[検査の名前]` → 無ければ `extendedDiagnostics.defaultCategory` → 無ければ `Warning`。何も設定しない人には全部が警告で出ます。設定の型（`DiagnosticOptions`）は core/api/src/public\_options.ts:233〜248 で、[未使用の import の章](../standalone/04-standalone-used-only.md)で引きました。
2. **113〜124 行目と 47〜49 行目：suppress は「作らない」**

   `'suppress'` は 119〜120 行目で null になり、47 行目で検査ごと飛ばします。抑止された検査は、走ってから捨てられるのではなく、そもそも走りません。
3. **52 行目と 57〜59 行目：検査が自分で辞退できる**

   `factory.create(options)` が null を返すと使いません。nullish\_coalescing\_not\_nullable は `strictNullChecks` が切れていると辞退します（4 節）。
4. **62 行目：検査 → category の Map**

   作り終えた検査は、それぞれの category と一緒に Map に入ります。

## 3. 走らせ方：検査ごとに makeTemplateDiagnostic を包む

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/src/extended_template_checker.ts` L66–106 （▶ の行: 67, 71, 76, 81, 91, 94–95, 102）

```ts
 66 │   getDiagnosticsForComponent(component: ts.ClassDeclaration): TemplateDiagnostic[] {
 67 ▶     const template = this.partialCtx.templateTypeChecker.getTemplate(component);
 68 │     // Skip checks if component has no template. This can happen if the user writes a
 69 │     // `@Component()` but doesn't add the template, could happen in the language service
 70 │     // when users are in the middle of typing code.
 71 ▶     if (template === null) {
 72 │       return [];
 73 │     }
 74 │     const diagnostics: TemplateDiagnostic[] = [];
 75 │ 
 76 ▶     for (const [check, category] of this.templateChecks.entries()) {
 77 │       const ctx: TemplateContext<ErrorCode> = {
 78 │         ...this.partialCtx,
 79 │         // Wrap `templateTypeChecker.makeTemplateDiagnostic()` to implicitly provide all the known
 80 │         // options.
 81 ▶         makeTemplateDiagnostic: (
 82 │           span: ParseSourceSpan | AbsoluteSourceSpan,
 83 │           message: string,
 84 │           relatedInformation?: {
 85 │             text: string;
 86 │             start: number;
 87 │             end: number;
 88 │             sourceFile?: ts.SourceFile;
 89 │           }[],
 90 │         ): NgTemplateDiagnostic<ErrorCode> => {
 91 ▶           return this.partialCtx.templateTypeChecker.makeTemplateDiagnostic(
 92 │             component,
 93 │             span,
 94 ▶             category,
 95 ▶             check.code,
 96 │             message,
 97 │             relatedInformation,
 98 │           );
 99 │         },
100 │       };
101 │ 
102 ▶       diagnostics.push(...check.run(ctx, component, template));
103 │     }
104 │ 
105 │     return diagnostics;
106 │   }
```

67 行目、材料はテンプレートの R3 AST（`getTemplate`。[第 19 回](19-typecheck-template-type-checker.md)）。76 行目で検査を 1 つずつ回し、81〜99 行目で `ctx.makeTemplateDiagnostic` を**その検査の category（94 行目）と code（95 行目）を埋めた関数**に包みます。検査を書く人は「どこに・何と言うか」だけを渡せばよく、警告かエラーかを知りません。102 行目で検査の `run` を呼びます。

なお 67 行目は `getTemplate` だけで、`getHostElement`（ホストバインディング）は渡していません。#70718（9 節）はこの行の話です。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/checker.ts` L899–933 （▶ の行: 912, 915–917, 919, 922, 927, 931）

```ts
899 │   makeTemplateDiagnostic<T extends ErrorCode>(
900 │     clazz: ts.ClassDeclaration,
901 │     sourceSpan: ParseSourceSpan | AbsoluteSourceSpan,
902 │     category: ts.DiagnosticCategory,
903 │     errorCode: T,
904 │     message: string,
905 │     relatedInformation?: {
906 │       text: string;
907 │       start: number;
908 │       end: number;
909 │       sourceFile?: ts.SourceFile;
910 │     }[],
911 │   ): NgTemplateDiagnostic<T> {
912 ▶     const sfPath = absoluteFromSourceFile(clazz.getSourceFile());
913 │     const fileRecord = this.state.get(sfPath)!;
914 │     const id = fileRecord.sourceManager.getTypeCheckId(clazz);
915 ▶     const mapping = fileRecord.sourceManager.getTemplateSourceMapping(id);
916 ▶     const span =
917 ▶       sourceSpan instanceof ParseSourceSpan
918 │         ? sourceSpan
919 ▶         : fileRecord.sourceManager.toTemplateParseSourceSpan(id, sourceSpan)!;
920 │ 
921 │     return {
922 ▶       ...makeTemplateDiagnostic(
923 │         id,
924 │         mapping,
925 │         span,
926 │         category,
927 ▶         ngErrorCode(errorCode),
928 │         message,
929 │         relatedInformation,
930 │       ),
931 ▶       __ngCode: errorCode,
932 │     };
933 │   }
```

包まれた先が TemplateTypeCheckerImpl.makeTemplateDiagnostic です。912〜915 行目でコンポーネントのファイルの帳簿からテンプレートの置き場所（mapping）を引き、916〜919 行目で span を ParseSourceSpan にそろえ、922 行目で[第 17 回](17-typecheck-oob.md)の OOB と同じ `makeTemplateDiagnostic` を呼びます。927 行目の番号も同じ `ngErrorCode`。931 行目の `__ngCode` は、99 を付ける前の ErrorCode を残しておく欄です。

## 4. 検査の形：TemplateCheckWithVisitor と TemplateVisitor

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/api/api.ts` L76–115 （▶ の行: 80–82, 88, 97, 102–103, 110）

```ts
 76 │ export interface TemplateCheckFactory<
 77 │   Code extends ErrorCode,
 78 │   Name extends ExtendedTemplateDiagnosticName,
 79 │ > {
 80 ▶   code: Code;
 81 ▶   name: Name;
 82 ▶   create(options: NgCompilerOptions): TemplateCheck<Code> | null;
 83 │ }
 84 │ 
 85 │ /**
 86 │  * This abstract class provides a base implementation for the run method.
 87 │  */
 88 ▶ export abstract class TemplateCheckWithVisitor<
 89 │   Code extends ErrorCode,
 90 │ > implements TemplateCheck<Code> {
 91 │   abstract code: Code;
 92 │ 
 93 │   /**
 94 │    * Base implementation for run function, visits all nodes in template and calls
 95 │    * `visitNode()` for each one.
 96 │    */
 97 ▶   run(
 98 │     ctx: TemplateContext<Code>,
 99 │     component: ts.ClassDeclaration,
100 │     template: TmplAstNode[],
101 │   ): NgTemplateDiagnostic<Code>[] {
102 ▶     const visitor = new TemplateVisitor<Code>(ctx, component, this);
103 ▶     return visitor.getDiagnostics(template);
104 │   }
105 │ 
106 │   /**
107 │    * Visit a TmplAstNode or AST node of the template. Authors should override this
108 │    * method to implement the check and return diagnostics.
109 │    */
110 ▶   abstract visitNode(
111 │     ctx: TemplateContext<Code>,
112 │     component: ts.ClassDeclaration,
113 │     node: TmplAstNode | AST,
114 │   ): NgTemplateDiagnostic<Code>[];
115 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/api/api.ts` L120–162 （▶ の行: 120, 131–133, 137, 140, 144–145, 151）

```ts
120 ▶ class TemplateVisitor<Code extends ErrorCode> extends CombinedRecursiveAstVisitor {
121 │   diagnostics: NgTemplateDiagnostic<Code>[] = [];
122 │ 
123 │   constructor(
124 │     private readonly ctx: TemplateContext<Code>,
125 │     private readonly component: ts.ClassDeclaration,
126 │     private readonly check: TemplateCheckWithVisitor<Code>,
127 │   ) {
128 │     super();
129 │   }
130 │ 
131 ▶   override visit(node: AST | TmplAstNode) {
132 ▶     this.diagnostics.push(...this.check.visitNode(this.ctx, this.component, node));
133 ▶     super.visit(node);
134 │   }
135 │ 
136 │   override visitTemplate(template: TmplAstTemplate) {
137 ▶     const isInlineTemplate = template.tagName === 'ng-template';
138 │     this.visitAllTemplateNodes(template.attributes);
139 │ 
140 ▶     if (isInlineTemplate) {
141 │       // Only visit input/outputs if this isn't an inline template node generated for a structural
142 │       // directive (like `<div *ngIf></div>`). These nodes would be visited when the underlying
143 │       // element of an inline template node is processed.
144 ▶       this.visitAllTemplateNodes(template.inputs);
145 ▶       this.visitAllTemplateNodes(template.outputs);
146 │     }
147 │ 
148 │     this.visitAllTemplateNodes(template.directives);
149 │ 
150 │     // `templateAttrs` aren't transferred over to the inner element so we always have to visit them.
151 ▶     this.visitAllTemplateNodes(template.templateAttrs);
152 │ 
153 │     this.visitAllTemplateNodes(template.variables);
154 │     this.visitAllTemplateNodes(template.references);
155 │     this.visitAllTemplateNodes(template.children);
156 │   }
157 │ 
158 │   getDiagnostics(template: TmplAstNode[]): NgTemplateDiagnostic<Code>[] {
159 │     this.diagnostics = [];
160 │     this.visitAllTemplateNodes(template);
161 │     return this.diagnostics;
162 │   }
```

1. **80〜82 行目：factory は code・name・create の 3 つ**

   code は ErrorCode（数）、name は設定に書く名前（`'invalidBananaInBox'` などの文字列）、create が検査を作ります。16 の検査はどれもこの形の `factory` を export します。
2. **97〜104 行目：ほとんどの検査は「訪問者を作って歩くだけ」**

   `TemplateCheckWithVisitor` を継承すると、`run` は 102 行目で TemplateVisitor を作って歩きます。検査を書く人は 110 行目の `visitNode` だけを書きます。
3. **120 行目と 131〜134 行目：テンプレートの節点も式の節点も 1 本の visit に**

   `CombinedRecursiveAstVisitor`（compiler の combined\_visitor.ts）は、R3 AST（要素・属性・ブロック）と式の AST（PropertyRead・Binary など）の両方を再帰で歩く訪問者です。132 行目、どの節点に来ても `visitNode` を呼び、133 行目で子へ進みます。
4. **136〜156 行目：\*ngIf の節点を 2 度数えない**

   `<div *ngIf="x" (click)="y">` は、R3 AST では外側の `Template` と内側の `Element` の両方に同じ入力・出力が載ります。140〜146 行目、`<ng-template>` と書いたときだけ Template の入力・出力を歩き、\*ngIf から作られた Template では歩きません（内側の要素で歩くので）。151 行目の `templateAttrs`（`*ngIf="x"` の x）は内側に渡らないので、いつも歩きます。

### AST だけで決まる検査：invalid\_banana\_in\_box

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/checks/invalid_banana_in_box/index.ts` L26–59 （▶ の行: 34, 37, 39–41, 43, 56–58）

```ts
26 │ class InvalidBananaInBoxCheck extends TemplateCheckWithVisitor<ErrorCode.INVALID_BANANA_IN_BOX> {
27 │   override code = ErrorCode.INVALID_BANANA_IN_BOX as const;
28 │ 
29 │   override visitNode(
30 │     ctx: TemplateContext<ErrorCode.INVALID_BANANA_IN_BOX>,
31 │     component: ts.ClassDeclaration,
32 │     node: TmplAstNode | AST,
33 │   ): NgTemplateDiagnostic<ErrorCode.INVALID_BANANA_IN_BOX>[] {
34 ▶     if (!(node instanceof TmplAstBoundEvent)) return [];
35 │ 
36 │     const name = node.name;
37 ▶     if (!name.startsWith('[') || !name.endsWith(']')) return [];
38 │ 
39 ▶     const boundSyntax = node.sourceSpan.toString();
40 ▶     const expectedBoundSyntax = boundSyntax.replace(`(${name})`, `[(${name.slice(1, -1)})]`);
41 ▶     const diagnostic = ctx.makeTemplateDiagnostic(
42 │       node.sourceSpan,
43 ▶       formatExtendedError(
44 │         ErrorCode.INVALID_BANANA_IN_BOX,
45 │         `In the two-way binding syntax the parentheses should be inside the brackets, ex. '${expectedBoundSyntax}'`,
46 │       ),
47 │     );
48 │     return [diagnostic];
49 │   }
50 │ }
51 │ 
52 │ export const factory: TemplateCheckFactory<
53 │   ErrorCode.INVALID_BANANA_IN_BOX,
54 │   ExtendedTemplateDiagnosticName.INVALID_BANANA_IN_BOX
55 │ > = {
56 ▶   code: ErrorCode.INVALID_BANANA_IN_BOX,
57 ▶   name: ExtendedTemplateDiagnosticName.INVALID_BANANA_IN_BOX,
58 ▶   create: () => new InvalidBananaInBoxCheck(),
59 │ };
```

パーサは `([foo])="bar"` を「名前が `[foo]` のイベント」と読みます。34 行目で BoundEvent だけを見て、37 行目で名前が `[` で始まり `]` で終わるかを見る。40 行目で `[(foo)]` に書き換えた正しい形を作って文に入れます。`ctx` の `templateTypeChecker` も `typeChecker` も使っていません。

### 型を尋ねる検査：nullish\_coalescing\_not\_nullable

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/checks/nullish_coalescing_not_nullable/index.ts` L31–72 （▶ の行: 36, 38–39, 42–43, 52, 54, 58–59, 64）

```ts
31 │   override visitNode(
32 │     ctx: TemplateContext<ErrorCode.NULLISH_COALESCING_NOT_NULLABLE>,
33 │     component: ts.ClassDeclaration,
34 │     node: TmplAstNode | AST,
35 │   ): NgTemplateDiagnostic<ErrorCode.NULLISH_COALESCING_NOT_NULLABLE>[] {
36 ▶     if (!(node instanceof Binary) || node.operation !== '??') return [];
37 │ 
38 ▶     const symbolLeft = ctx.templateTypeChecker.getSymbolOfNode(node.left, component);
39 ▶     if (symbolLeft === null || symbolLeft.kind !== SymbolKind.Expression) {
40 │       return [];
41 │     }
42 ▶     const typeLeft = ctx.templateTypeChecker.getTypeOfSymbol(symbolLeft);
43 ▶     if (!typeLeft || typeLeft.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
44 │       // We should not make assumptions about the any and unknown types; using a nullish coalescing
45 │       // operator is acceptable for those.
46 │       return [];
47 │     }
48 │ 
49 │     // If the left operand's type is different from its non-nullable self, then it must
50 │     // contain a null or undefined so this nullish coalescing operator is useful. No diagnostic to
51 │     // report.
52 ▶     if (typeLeft.getNonNullableType() !== typeLeft) return [];
53 │ 
54 ▶     const symbol = ctx.templateTypeChecker.getSymbolOfNode(node, component)!;
55 │     if (symbol.kind !== SymbolKind.Expression) {
56 │       return [];
57 │     }
58 ▶     const templateMapping = ctx.templateTypeChecker.getSourceMappingAtTcbLocation(
59 ▶       symbol.tcbLocation,
60 │     );
61 │     if (templateMapping === null) {
62 │       return [];
63 │     }
64 ▶     const diagnostic = ctx.makeTemplateDiagnostic(
65 │       templateMapping.span,
66 │       formatExtendedError(
67 │         ErrorCode.NULLISH_COALESCING_NOT_NULLABLE,
68 │         `The left side of this nullish coalescing operation does not include 'null' or 'undefined' in its type, therefore the '??' operator can be safely removed.`,
69 │       ),
70 │     );
71 │     return [diagnostic];
72 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/checks/nullish_coalescing_not_nullable/index.ts` L75–91 （▶ の行: 83–86）

```ts
75 │ export const factory: TemplateCheckFactory<
76 │   ErrorCode.NULLISH_COALESCING_NOT_NULLABLE,
77 │   ExtendedTemplateDiagnosticName.NULLISH_COALESCING_NOT_NULLABLE
78 │ > = {
79 │   code: ErrorCode.NULLISH_COALESCING_NOT_NULLABLE,
80 │   name: ExtendedTemplateDiagnosticName.NULLISH_COALESCING_NOT_NULLABLE,
81 │   create: (options: NgCompilerOptions) => {
82 │     // Require `strictNullChecks` to be enabled.
83 ▶     const strictNullChecks =
84 ▶       options.strictNullChecks === undefined ? !!options.strict : !!options.strictNullChecks;
85 ▶     if (!strictNullChecks) {
86 ▶       return null;
87 │     }
88 │ 
89 │     return new NullishCoalescingNotNullableCheck();
90 │   },
91 │ };
```

1. **36 行目：`??` の Binary だけ**

   ここまでは AST の形だけです。
2. **38 行目と 42 行目：左辺の型を TCB に尋ねる**

   `getSymbolOfNode` で左辺の「TCB の中の場所」をもらい、`getTypeOfSymbol` でその場所の `ts.Type` を取ります。どちらも TemplateTypeChecker の API で、TCB の中の位置コメントを頼りに TypeScript の型を引く仕組みは[第 19 回](19-typecheck-template-type-checker.md)で読みます。
3. **43 行目と 52 行目：any・unknown は見逃し、null を含まなければ警告**

   `getNonNullableType()` が自分と同じなら null も undefined も含まない、つまり `??` の右辺は決して使われません。
4. **54〜60 行目：場所も TCB から戻す**

   `??` 式全体の記号を取り、その TCB の位置を `getSourceMappingAtTcbLocation` でテンプレートの span に戻して 64 行目で診断にします。
5. **83〜87 行目：strictNullChecks が無いと辞退**

   strictNullChecks を切ると、TypeScript の型からは null が消えるので、全部の `??` が「不要」と判定されてしまいます。それを避けるために create が null を返します（2 節の 57 行目で飛ばされる）。

検査が使う `ts.TypeChecker`（`ctx.typeChecker`）は、16 の検査のどれも直接は呼んでいません（checks/ を grep して 0 件）。型はすべて `ctx.templateTypeChecker.getTypeOfSymbol` 経由です。これは 2026-04-03 の 13c8df67d9b（Andrew Scott「decouple TemplateSymbolBuilder from ts.TypeChecker」）から、記号が型を持たず「TCB の位置」だけを持つようになったためです（[第 19 回](19-typecheck-template-type-checker.md)）。

### signal を呼び忘れる：interpolated\_signal\_not\_invoked

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/checks/interpolated_signal_not_invoked/index.ts` L50–74 （▶ の行: 59–63, 66, 68, 71）

```ts
50 │ class InterpolatedSignalCheck extends TemplateCheckWithVisitor<ErrorCode.INTERPOLATED_SIGNAL_NOT_INVOKED> {
51 │   override code = ErrorCode.INTERPOLATED_SIGNAL_NOT_INVOKED as const;
52 │ 
53 │   override visitNode(
54 │     ctx: TemplateContext<ErrorCode.INTERPOLATED_SIGNAL_NOT_INVOKED>,
55 │     component: ts.ClassDeclaration,
56 │     node: TmplAstNode | AST,
57 │   ): NgTemplateDiagnostic<ErrorCode.INTERPOLATED_SIGNAL_NOT_INVOKED>[] {
58 │     // interpolations like `{{ mySignal }}`
59 ▶     if (node instanceof Interpolation) {
60 ▶       return node.expressions
61 ▶         .map((item) => (item instanceof PrefixNot ? item.expression : item))
62 ▶         .filter((item): item is PropertyRead => item instanceof PropertyRead)
63 ▶         .flatMap((item) => buildDiagnosticForSignal(ctx, item, component));
64 │     }
65 │     // check bound inputs like `[prop]="mySignal"` on an element or inline template
66 ▶     else if (node instanceof TmplAstElement && node.inputs.length > 0) {
67 │       // Allow signals to be passed directly to foreign components, without invocation.
68 ▶       if (ctx.templateTypeChecker.getForeignComponent(component, node) !== null) {
69 │         return [];
70 │       }
71 ▶       const directivesOfElement = ctx.templateTypeChecker.getDirectivesOfNode(component, node);
72 │       return node.inputs.flatMap((input) =>
73 │         checkBoundAttribute(ctx, component, directivesOfElement, input),
74 │       );
```

59〜63 行目、`{{ count }}` の補間の中の PropertyRead（`!count` なら中身）を集め、型が signal なら NG8109 にします（型を見るのは同じファイルの `buildDiagnosticForSignal` の中の `isSignalReference`）。66〜74 行目は `[prop]="count"` の入力。68 行目、foreign component（Angular 以外のコンポーネント）には signal をそのまま渡してよいので見ません。

## 5. 16 の検査

「使うもの」は index.ts の中で `ctx.templateTypeChecker` の何を呼んでいるかを grep して分けました。**AST** は R3 AST だけ、**位置・照合**は TCB の位置や BoundTarget（どのディレクティブが付いたか）を尋ねるが型は見ない、**型**は `getTypeOfSymbol`（または `isSignalReference` 経由）で `ts.Type` を見るもの。

| 名前（設定に書く） | NG | 見つけるもの | 使うもの |
| --- | --- | --- | --- |
| invalidBananaInBox | 8101 | `([x])`（正しくは `[(x)]`） | AST |
| nullishCoalescingNotNullable | 8102 | 左辺が null にならない `??` | 型（strictNullChecks が要る） |
| missingControlFlowDirective | 8103 | `*ngIf` などを使うのに NgIf / CommonModule を import していない | 位置・照合 |
| textAttributeNotBinding | 8104 | `attr.x="v"` のように、束縛のつもりが素の属性になっている | AST |
| missingNgForOfLet | 8105 | `*ngFor="item of items"`（let が無い） | AST |
| suffixNotSupported | 8106 | `[attr.width.px]` のように単位の接尾辞が効かない束縛 | AST |
| optionalChainNotNullable | 8107 | 左辺が null にならない `?.` | 型（strictNullChecks が要る） |
| skipHydrationNotStatic | 8108 | `ngSkipHydration` を束縛で書いている | AST |
| interpolatedSignalNotInvoked | 8109 | 補間・入力・@if / @switch で signal を呼び忘れ | 型 |
| uninvokedFunctionInEventBinding | 8111 | `(click)="save"`（呼んでいない） | 型 |
| unusedLetDeclaration | 8112 | 使われない `@let` | 位置・照合（getExpressionTarget） |
| unparenthesizedNullishCoalescing | 8114 | `a ?? b \|\| c` のように括弧の無い混在 | 位置・照合 |
| uninvokedTrackFunction | 8115 | `track trackFn`（呼んでいない） | 型 |
| missingStructuralDirective | 8116 | `*foo` の foo を import していない | 位置・照合 |
| uninvokedFunctionInTextInterpolation | 8117 | `{{ getName }}`（呼んでいない） | 型 |
| deferTriggerMisconfiguration | 8021 | @defer の trigger の組み合わせが無意味（main が 2 つ、prefetch が遅い など） | AST |

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/error_code.ts` L488–512 （▶ の行: 496, 506, 512）

````ts
488 │   /**
489 │    * A two way binding in a template has an incorrect syntax,
490 │    * parentheses outside brackets. For example:
491 │    *
492 │    * ```html
493 │    * <div ([foo])="bar" />
494 │    * ```
495 │    */
496 ▶   INVALID_BANANA_IN_BOX = 8101,
497 │ 
498 │   /**
499 │    * The left side of a nullish coalescing operation is not nullable.
500 │    *
501 │    * ```html
502 │    * {{ foo ?? bar }}
503 │    * ```
504 │    * When the type of foo doesn't include `null` or `undefined`.
505 │    */
506 ▶   NULLISH_COALESCING_NOT_NULLABLE = 8102,
507 │ 
508 │   /**
509 │    * A known control flow directive (e.g. `*ngIf`) is used in a template,
510 │    * but the `CommonModule` is not imported.
511 │    */
512 ▶   MISSING_CONTROL_FLOW_DIRECTIVE = 8103,
````

番号は error\_code.ts で 8101 から順に振られています（496・506・512 行目）。表の最後の deferTriggerMisconfiguration だけは 8021 で、OOB の番号の帯（80xx）の中にあります。8113 は拡張診断の枠の `unusedStandaloneImports`（1 節の 55 行目）、8110・8118 は TCB の外の診断（ngtsc/validation/src/rules/ の initializer API の検査）が使っています。

## 6. 設定の検査：strictTemplates が要る、名前は決まった集合だけ

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L1816–1828 （▶ の行: 1816–1817, 1820, 1825）

```ts
1816 ▶   for (const [checkName, category] of Object.entries(options.extendedDiagnostics?.checks ?? {})) {
1817 ▶     if (!SUPPORTED_DIAGNOSTIC_NAMES.has(checkName)) {
1818 │       yield makeConfigDiagnostic({
1819 │         category: ts.DiagnosticCategory.Error,
1820 ▶         code: ErrorCode.CONFIG_EXTENDED_DIAGNOSTICS_UNKNOWN_CHECK,
1821 │         messageText: `
1822 │ Angular compiler option "extendedDiagnostics.checks" has an unknown check: "${checkName}".
1823 │ 
1824 │ Allowed check names are:
1825 ▶ ${Array.from(SUPPORTED_DIAGNOSTIC_NAMES).join('\n')}
1826 │         `.trim(),
1827 │       });
1828 │     }
```

同じ関数 verifyCompatibleTypeCheckOptions の先頭（core/src/compiler.ts:1785〜1799。[第 2 回](02-typecheck-config.md)で引用）は、`extendedDiagnostics` を書いたのに `strictTemplates: false` なら、その時点で設定のエラーにします。上の 1817 行目、`checks` のキーが 1 節の `SUPPORTED_DIAGNOSTIC_NAMES` に無ければエラーで、1825 行目でその一覧を文に並べます。これらの診断が 1 つでもあると、1 節の 1688 行目で ExtendedTemplateCheckerImpl そのものが作られません。

## 7. デモ：本物のパーサと訪問者で、検査が何を見ているか

> **🧪 CombinedRecursiveAstVisitor が訪れる節点**
>
> このサイトの @angular/compiler 22.1.6 の `parseTemplate` で R3 AST を作り、TemplateVisitor と同じ基底クラス `CombinedRecursiveAstVisitor` を継承した訪問者で歩きます（ボタンを押したときだけ）。印を付ける条件は、invalid\_banana\_in\_box の 34・37 行目と nullish\_coalescing\_not\_nullable の 36 行目を書き写したもので、**本物の検査は動かしていません**（compiler-cli は入っていない）。4 節の visitTemplate の上書きはしていないので、\*ngIf を書くと同じ節点が 2 度出ます。`??` があれば、型を見る検査が読みに行く TCB の行を共通部品の generateTypeCheckBlock で出します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-extended)

- 「(\[value\]) と \[(value)\]」を押すと、1 つ目の input の BoundEvent は名前が `[value]`、2 つ目は `valueChange` になります。双方向の正しい形はパーサが入力と `…Change` の出力の 2 つに分けるので、37 行目の条件に当たりません。
- 「?? を使う」では、`title ?? '無題'` が Binary として 1 回訪れられ、TCB には `((this).title /*…*/) ?? ("無題" …)` の形で残ります。左辺の位置コメントが getSymbolOfNode の探す目印です。

## 8. 新しい検査を足すときに触るファイル

snapshot（2026-09-06）より後の 2026-10-20 に、外部の貢献者 SkyZeroZx の PR #63705「add check for numeric CSS properties requiring units」（NG8119）がマージされました。`gh pr view 63705 --json files` で見た 12 ファイルが、そのまま「1 つ足すときの一式」です。

| ファイル | 役目 |
| --- | --- |
| compiler-cli/src/ngtsc/typecheck/extended/checks/numeric\_css\_property\_requires\_unit/index.ts と BUILD.bazel | 検査本体（factory を export） |
| extended/index.ts と extended/BUILD.bazel | 1 節の配列に足す・依存に足す |
| diagnostics/src/error\_code.ts と extended\_template\_diagnostic\_name.ts | 番号（8119）と設定の名前 |
| goldens/public-api/compiler-cli/error\_code.api.md と extended\_template\_diagnostic\_name.api.md | 公開 API の golden（enum が `@publicApi` なので） |
| extended/test/checks/numeric\_css\_property\_requires\_unit/ の spec と BUILD.bazel | この検査だけのテストターゲット |
| adev/src/content/reference/extended-diagnostics/NG8119.md と overview.md | angular.dev の説明ページと一覧 |

1 つ前に足された 563dbd998c8（NG8021、2025-10-02、同じく SkyZeroZx）も同じ 12 ファイルの形でした（`git show --stat`）。#63705 は 2025-09-10 に作られ、翌日メンテナーが「G3（Google 社内のコード）を片付けないと入れられない」と書き、マージまで約 13 か月かかっています。

> [!WARNING]
> **ハマりどころ**
>
> 拡張診断を 1 つ足すのは「警告が 1 つ増えるだけ」に見えますが、Google 社内では警告として扱われていません。テンプレート参照がメンバーを隠すのを見つける検査の PR #68766 で、メンテナーは「社内ではそれは警告ではない」（JeanMeche、2026-05-18）と答え、PR は閉じられました。同じ issue #45227 に付いた #67226 も「破壊的すぎる」とコメントされたまま開いています。新しい検査は、社内のコードを先に直せるかどうかで止まります。

### 開いている issue

- **#68122**（2026-04-10）`@deprecated` の記号をテンプレートで使ったら拡張診断を出したい。言語サービスは取り消し線で見せているが、ビルドには出ない、という要望です。PR は付いていません。
- **#48117**（2022-11-18）利用者が自分の検査を足せるようにしたい。1 節の配列は固定で、外から足す口がありません。メンテナー（dgp1130）は「関心はあるが、使い勝手とセキュリティの検討が要る」と返しています。
- **#45227**（2022-03-02、open for contributions）`#name` がコンポーネントの `name` を隠すときの警告。上の callout の 2 つの PR が付いた issue です。

## 9. テストと直し方

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/invalid_banana_in_box/invalid_banana_in_box_spec.ts` L29–53 （▶ の行: 35, 42, 45–46, 48, 50–52）

```ts
29 │     it('should produce invalid banana in a box warning', () => {
30 │       const fileName = absoluteFrom('/main.ts');
31 │       const {program, templateTypeChecker} = setup([
32 │         {
33 │           fileName,
34 │           templates: {
35 ▶             'TestCmp': '<div ([notARealThing])="var1"> </div>',
36 │           },
37 │           source: 'export class TestCmp { var1: string = "text"; }',
38 │         },
39 │       ]);
40 │       const sf = getSourceFileOrError(program, fileName);
41 │       const component = getClass(sf, 'TestCmp');
42 ▶       const extendedTemplateChecker = new ExtendedTemplateCheckerImpl(
43 │         templateTypeChecker,
44 │         program.getTypeChecker(),
45 ▶         [invalidBananaInBoxFactory],
46 ▶         {} /* options */,
47 │       );
48 ▶       const diags = extendedTemplateChecker.getDiagnosticsForComponent(component);
49 │       expect(diags.length).toBe(1);
50 ▶       expect(diags[0].category).toBe(ts.DiagnosticCategory.Warning);
51 ▶       expect(diags[0].code).toBe(ngErrorCode(ErrorCode.INVALID_BANANA_IN_BOX));
52 ▶       expect(getSourceCodeForDiagnostic(diags[0])).toBe('([notARealThing])="var1"');
53 │     });
```

検査ごとのテストは extended/test/checks/&lt;名前&gt;/ にあり、どれもこの形です。35 行目のテンプレートで `setup()`（typecheck/testing/index.ts。ファイルを書かずに TemplateTypeChecker を作る）を呼び、42〜47 行目で ExtendedTemplateCheckerImpl に**1 つの factory だけ**と空のオプションを渡し、50 行目で既定の Warning、51 行目で番号、52 行目で場所を確かめます。invalid\_banana\_in\_box\_spec.ts の `describe('TemplateChecks')`（:21）の it は 6 本です。

📄 `angular/packages/compiler-cli/test/ngtsc/extended_template_diagnostics_spec.ts` L102–139 （▶ の行: 110, 118, 122, 127, 133, 138）

```ts
102 │     describe('handles diagnostic configuration', () => {
103 │       // Component definition which emits one warning.
104 │       const warningComponent = `
105 │         import {Component} from '@angular/core';
106 │ 
107 │         @Component({
108 │           selector: 'test-component',
109 │           // Invalid banana in box (should be \`[(foo)]="bar"\`).
110 ▶           template: '<div ([foo])="bar"></div>',
111 │         })
112 │         class TestComponent {
113 │           bar = 'test';
114 │         }
115 │       `;
116 │ 
117 │       it('by enabling extended template diagnostics when `strictTemplates` is enabled', () => {
118 ▶         env.tsconfig({strictTemplates: true});
119 │ 
120 │         env.write('test.ts', warningComponent);
121 │ 
122 ▶         const diagnostics = env.driveDiagnostics(0 /* expectedExitCode */);
123 │         expect(diagnostics.length).toBe(1);
124 │         expect(diagnostics[0]).toEqual(
125 │           jasmine.objectContaining({
126 │             code: ngErrorCode(ErrorCode.INVALID_BANANA_IN_BOX),
127 ▶             category: ts.DiagnosticCategory.Warning,
128 │           }),
129 │         );
130 │       });
131 │ 
132 │       it('by disabling extended template diagnostics when `strictTemplates` is disabled', () => {
133 ▶         env.tsconfig({strictTemplates: false});
134 │ 
135 │         env.write('test.ts', warningComponent);
136 │ 
137 │         const diagnostics = env.driveDiagnostics(0 /* expectedExitCode */);
138 ▶         expect(diagnostics).toEqual([]);
139 │       });
```

設定の流れ（2 節・6 節と、runAdditionalChecks の strictTemplates の条件）を ngtsc 全体で確かめるのは test/ngtsc/extended\_template\_diagnostics\_spec.ts の `describe('handles diagnostic configuration')`（:102）です。118 行目の strictTemplates: true なら 127 行目で Warning、133 行目の false なら 138 行目で 0 件。続く it で defaultCategory・warning・error・suppress・知らない category を 1 本ずつ見ます（ファイル全体で it は 11 本）。

📄 `ターミナル`

```
cd ~/angular-research/angular

# 検査ごとの単体テスト（TemplateTypeChecker を作って ExtendedTemplateCheckerImpl に 1 つの factory だけ渡す）
pnpm bazel test \
  //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/invalid_banana_in_box:test \
  //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/nullish_coalescing_not_nullable:test \
  --nocache_test_results --test_output=all

# ngtsc 全体を通した設定のテスト（大きなターゲットなので必ず絞る）
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc --nocache_test_results --test_output=all \
  '--test_arg=--filter=ngtsc extended template checks'
```

📄 `出力（抜粋。2026-11-02 に実行。ログは scratchpad/tc-logs/e-extended-checks.log と e-ngtsc-extended.log）`

```
# 1 本目（2 ターゲット）
24 specs, 0 failures
72 specs, 0 failures
//packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/invalid_banana_in_box:test PASSED in 0.9s
//packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/nullish_coalescing_not_nullable:test PASSED in 1.0s
Executed 2 out of 2 tests: 2 tests pass.

# 2 本目（4 つの shard とも）
Ran 11 of 6721 specs
11 specs, 0 failures
//packages/compiler-cli/test/ngtsc:ngtsc                                 PASSED in 2.9s
```

1. **件数**

   invalid\_banana\_in\_box は it 6 本 × 4 つの仮想ファイルシステム（`runInEachFileSystem`）= 24、nullish\_coalescing\_not\_nullable は 18 本 × 4 = 72。ngtsc は 11 本 × 4 = 44 本が 4 つの shard に 11 本ずつ分かれました。16 の検査のターゲットはすべて `//packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/<名前>:test` です。
2. **直すとしたら**

   誤検知・見逃しは checks/&lt;名前&gt;/index.ts の `visitNode`、足す spec は同じ名前の test/checks/ の spec。設定の扱いなら src/extended\_template\_checker.ts と core/src/compiler.ts の verifyCompatibleTypeCheckOptions、spec は extended\_template\_diagnostics\_spec.ts です。
3. **閉じたが直っていない #70718**

   「NG8111 がホストの `host: {'(click)': 'save'}` を見ない」という issue は、報告者が「直し方は分かったが、testing/index.ts がホストバインディングを扱えないのでテストの書き方が分からない」と書いたあと、2026-09-19 に報告者自身が閉じました。PR はありません。3 節の 67 行目が今も `getTemplate` だけなのを main でも確かめました（`gh api …/contents/…/extended_template_checker.ts?ref=main`）。ホストバインディングの型チェックを ngtsc 全体で確かめる spec は test/ngtsc/host\_bindings\_type\_check\_spec.ts にあり、手元で試すならそちらの `NgtscTestEnvironment` の形が入口になります。詳しくは[第 20 回](20-typecheck-issues.md)。

- `NgCompiler.makeCompilation` — core/src/compiler.ts — *new ExtendedTemplateCheckerImpl(..., ALL\_DIAGNOSTIC\_FACTORIES, options)*
  - `ExtendedTemplateCheckerImpl constructor` — extended/src/extended\_template\_checker.ts — *category を決め、factory.create*
- `NgCompiler.runAdditionalChecks` — core/src/compiler.ts — *strictTemplates のときだけ*
  - `ComponentDecoratorHandler.extendedTemplateCheck` — annotations/component/src/handler.ts
    - `ExtendedTemplateCheckerImpl.getDiagnosticsForComponent` — extended/src/extended\_template\_checker.ts — *getTemplate → 検査ごとに ctx を作る*
      - `TemplateCheckWithVisitor.run → TemplateVisitor.visit` — extended/api/api.ts
        - `InvalidBananaInBoxCheck.visitNode` — extended/checks/invalid\_banana\_in\_box/index.ts — *AST だけ*
        - `NullishCoalescingNotNullableCheck.visitNode → getSymbolOfNode / getTypeOfSymbol` — …/nullish\_coalescing\_not\_nullable/index.ts — *TCB の型*
          - `ctx.makeTemplateDiagnostic → TemplateTypeCheckerImpl.makeTemplateDiagnostic` — typecheck/src/checker.ts — *category と code を埋めて*

## 聞かれそうな質問

**Q. 拡張診断と、普通のテンプレートの型エラーは何が違いますか？**

普通の型エラーは TCB を TypeScript が読んで出すもの、拡張診断は TCB ができたあとに R3 AST を歩いて Angular が出すものです（3 節の 67 行目で getTemplate、102 行目で各検査の run）。型エラーは常にエラーですが、拡張診断は 2 節の 40〜44 行目で既定が Warning、設定で error・suppress にできます。

**Q. strictTemplates を切ると拡張診断はどうなりますか？**

走りません（compiler.ts:1289 の `this.strictTemplates &&`）。`extendedDiagnostics` を書いたまま `strictTemplates: false` にすると、core/src/compiler.ts:1785 で設定のエラーになります（6 節）。spec の 132〜139 行目が「切ると 0 件」を確かめています。

**Q. suppress にすると、検査は走ってから捨てられるのですか？**

走りません。2 節の 119〜120 行目で null になり、47〜49 行目でその検査を作らずに飛ばします。

**Q. どの検査が TypeScript の型を使いますか？**

5 節の表の「型」の 6 つです。どれも `ctx.templateTypeChecker.getTypeOfSymbol`（または isSignalReference）経由で、`ctx.typeChecker` を直接呼ぶ検査はありません。nullish\_coalescing\_not\_nullable の 38・42 行目が典型で、TCB の中の左辺の位置から型を引きます。

**Q. 新しい検査を足すには何をしますか？**

8 節の 12 ファイルです。factory を書いて 1 節の配列に足し、error\_code.ts と extended\_template\_diagnostic\_name.ts に番号と名前を足し、golden を更新し、検査ごとのテストターゲットと adev のページを作ります。技術より先に、社内のコードで新しい警告が出ないか（出るなら先に直せるか）で止まることが多いのは 8 節の callout のとおりです。

## 読み終えて

- 拡張診断は 16 の factory の配列（index.ts）。設定に書ける名前はそれに OOB の 1 つと SourceFileValidator の 1 つを足した集合。
- category は checks → defaultCategory → Warning の順で決まり、suppress の検査は作られない。検査は category を知らない。
- 検査はたいてい visitNode だけを書き、CombinedRecursiveAstVisitor がテンプレートと式の節点を 1 本の visit で渡す。
- AST だけで決まる検査と、getSymbolOfNode / getTypeOfSymbol で TCB の型を尋ねる検査がある。型を尋ねる検査は strictNullChecks などを自分で見て辞退する。
- 1 つ足すと 12 ファイル。止まりやすいのはコードより、社内で新しい診断が出ることのほう。

---

← 前: [帯域外の診断：TypeScript では見つけられないエラー](17-typecheck-oob.md)  
次: [TemplateTypeChecker：言語サービスが型を尋ねる窓口](19-typecheck-template-type-checker.md) →
