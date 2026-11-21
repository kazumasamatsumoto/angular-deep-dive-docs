[目次](../README.md) › [外のコンポーネント：foreignImports と foreign view](README.md) › 第 5 回 / 全 6 回

# コンパイラと ngtsc：テンプレートから命令まで

> foreignImports を AST の形だけで読む行（a19c02706fd）、要素名で外のコンポーネントに照合する 3 か所の表（d596d8bd0ac）と、ディレクティブと両方に当たると TS500 になること、@content のパーサと置き場所・名前の検査（1f6e843648f・79e5d5d75f0・337442453b7）、resolve\_foreign\_content の phase と reify、制御フローの中（5bd00add071・2e442f78762）、props は式だけ型チェックされること（aeb55c8bc10）。compiler-cli 22.1.6 と 22.2.6 で 26 のテンプレートをコンパイルした診断と出力、部分コンパイルで foreignImports が消える記録。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fgn-compiler)

---

テンプレートの `<FancyButton>` が外のコンポーネントだと分かってから、`ɵɵforeignComponent`・`ɵɵforeignContent`・`ɵɵforeignContentFn` の 3 つの命令になるまでを、**照合 → `@content` の解析と検査 → ingest → `resolve_foreign_content` の phase → reify** の順に読みます。途中で、ngtsc が出すエラーコードを実物の診断で表にし、制御フローの中・部分コンパイル（ライブラリ）のときに何が出るかを、compiler-cli を Node で動かした記録で確かめます。

読む対象は、compiler-cli の `annotations/component/src/util.ts`・`foreign_component.ts`・`metadata/src/util.ts`、compiler の `render3/r3_content_blocks.ts`・`typecheck/ops/scope.ts`・`template/pipeline/` の `ingest.ts`・`ir/`・`phases/resolve_foreign_content.ts`・`phases/reify.ts`・`instruction.ts`、compliance の `standalone/foreign_component.*` です。`foreignImports` を読む行の前半、テンプレートの検査の前半（8025 と 8026）、`consts` に入れる行、出力の最初の 2 例は [standalone シリーズの foreignImports の章](../standalone/14-standalone-foreign-imports.md)の 3〜5 節で引用したので、ここではリンクします。パイプライン全体の形は[reify と emit の章](../compiler/16-compiler-reify-emit.md)、`R3TargetBinder` は[binder の章](../compiler/09-compiler-binder.md)です。

1. [1. 契約と歩み](01-fgn-contract-history.md)
2. [2. foreign view](02-fgn-foreign-view.md)
3. [3. ɵɵforeignComponent の中](03-fgn-instruction.md)
4. [4. @content と後始末](04-fgn-content.md)
5. **5. コンパイラと ngtsc**（この章）
6. [6. spec と PR](06-fgn-tests-issues.md)

## 1. 歩み：コンパイラ側のコミット

| 日付 | コミット | 変わったこと |
| --- | --- | --- |
| 05-11 | d596d8bd0ac | 要素名で外のコンポーネントに照合する `R3TargetBinder` の第 2 引数と、検査の始まり（template\_semantics\_checker の中） |
| 05-18 | 88b0e420cf8 | `@Component.foreignImports` を読む。このときは `PartialEvaluator` で評価し、名前の付いた関数の宣言を探した |
| 05-19 | 7c60a98b3cc | `import {X as Y}` の別名で照合する |
| 05-26 | aeb55c8bc10 | 外のコンポーネントの props に signal を呼ばずに渡しても NG8109 を出さない |
| 05-27 | 6981cd782a1 | `ɵɵforeignComponent` を出す（ingest・ir・reify） |
| 05-28 | f89d0e4c8fc・f19bbe59dd9 | 名前の無い子を `children` に。`@content (名前)` ブロックと `resolve_foreign_content` の phase |
| 06-01 | b399f78c347 | `@content (名前; let a, b)` と `ɵɵforeignContentFn` |
| 06-02 | 25c744c4d0a | 外のコンポーネントの式をテンプレート関数に直接書かず、`consts` に入れて添字で渡す（7 節） |
| 06-04 | daa47b4aad8・1f6e843648f・79e5d5d75f0・337442453b7 | 検査を解析の段（`foreign_component.ts`）へ移し、8026〜8029 を足す（4 節） |
| 07-06 | a19c02706fd | 評価をやめ、AST の形だけで読む（isolated declarations とローカルコンパイルのため。2 節） |
| 07-07 | 5bd00add071・2e442f78762 | 制御フローの中の外のコンポーネント（6 節） |
| 07-20 | eb3e480360d | DOM だけの命令と全部の命令の切り替えを、外のコンポーネントの例から独立した compliance に分ける（テストだけ） |
| 08-25 | a46292af260 | 関連メッセージのファイルを、外のテンプレートのときはテンプレートの方にする（22.1.x には afe8499a14c として 22.1.4 から） |

22.1.6 と 22.2.6 の compiler-cli で同じ 26 のテンプレートをコンパイルした記録は、診断も出力も すべて同じでした。上のコミットは、22.1.x にも入っているか、後から入れられています。

## 2. foreignImports を読む：評価せず、AST の形だけ

📄 `a19c02706fd の抜粋（handler.ts）`

```
--- packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts（git show a19c02706fd の抜粋）
@@ -203,11 +201,10 @@ import {analyzeTemplateForSelectorless} from './selectorless';
 import {ComponentSymbol} from './symbol';
 import {
   collectLegacyAnimationNames,
+  extractForeignImportsFromAst,
   legacyAnimationTriggerResolver,
   validateAndFlattenComponentImports,
-  validateAndFlattenForeignImports,
 } from './util';
-import {foreignComponentResolver} from './resolver';
 
 const EMPTY_ARRAY: any[] = [];
 
@@ -646,19 +643,12 @@ export class ComponentDecoratorHandler implements DecoratorHandler<
     } else if (rawImports || rawDeferredImports || rawForeignImports) {
       const importDiagnostics: ts.Diagnostic[] = [];
 
-      if (rawForeignImports) {
-        const foreignImportResolvers = combineResolvers([
-          createForwardRefResolver(this.isCore),
-          foreignComponentResolver,
-        ]);
-        const expr = rawForeignImports;
-        const imported = this.evaluator.evaluate(expr, foreignImportResolvers);
-        const {foreignImports: flattened, diagnostics} = validateAndFlattenForeignImports(
-          imported,
-          expr,
-        );
+      // There's no need to extract foreign imports if we're only emitting declarations.
+      if (rawForeignImports && !this.emitDeclarationOnly) {
+        const {foreignImports: imports, diagnostics} =
+          extractForeignImportsFromAst(rawForeignImports);
         importDiagnostics.push(...diagnostics);
-        foreignImports = flattened;
+        foreignImports = imports;
       }
 
       if (this.compilationMode !== CompilationMode.LOCAL && (rawImports || rawDeferredImports)) {
```

88b0e420cf8 の最初の形は、`imports` と同じく `PartialEvaluator` で配列を評価し、引数が「名前の付いた関数の宣言」に解決できるかを確かめていました。a19c02706fd がそれを `extractForeignImportsFromAst` に替えました。コミット本文は「他のファイルの型の情報と意味の解決が無い isolated declarations とローカルコンパイルでは、評価器を使う道が動かない」と書いています。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/util.ts` L232–266 （▶ の行: 232–234, 239, 242, 245–246, 251, 257, 262）

```ts
232 ▶   for (const element of unwrappedExpr.elements) {
233 ▶     const unwrappedEl = unwrapExpression(element);
234 ▶     if (!ts.isCallExpression(unwrappedEl)) {
235 │       diagnostics.push(
236 │         makeDiagnostic(
237 │           ErrorCode.VALUE_HAS_WRONG_TYPE,
238 │           element,
239 ▶           `Each foreign import must be a call expression, e.g. 'myImport(MyComponent)'.`,
240 │         ),
241 │       );
242 ▶       continue;
243 │     }
244 │ 
245 ▶     const callee = unwrapExpression(unwrappedEl.expression);
246 ▶     if (!ts.isIdentifier(callee)) {
247 │       diagnostics.push(
248 │         makeDiagnostic(
249 │           ErrorCode.VALUE_HAS_WRONG_TYPE,
250 │           unwrappedEl.expression,
251 ▶           `The foreign import function must be a simple identifier, e.g. 'myImport(MyComponent)'.`,
252 │         ),
253 │       );
254 │       continue;
255 │     }
256 │ 
257 ▶     if (unwrappedEl.arguments.length !== 1) {
258 │       diagnostics.push(
259 │         makeDiagnostic(
260 │           ErrorCode.VALUE_HAS_WRONG_TYPE,
261 │           element,
262 ▶           `Foreign import calls must receive exactly one argument, e.g. 'myImport(MyComponent)'.`,
263 │         ),
264 │       );
265 │       continue;
266 │     }
```

1. **233〜243 行目：要素は呼び出し式**

   `unwrapExpression` は括弧などをはがすだけです。呼び出しでなければ NG1010 で、その要素だけ飛ばして次へ（242 行目の `continue`）。
2. **245〜255 行目：呼ぶ関数は単純な識別子**

   `lib.myImport(X)` は 251 行目のメッセージで NG1010 です。
3. **257〜266 行目：引数はちょうど 1 つ**

   このあとの「引数も識別子」と、名前を記録する行は standalone シリーズの章の 3 節で引用しました。記録の `prop-access`（`miniImport(ns.Counter)`）がそこで落ちます。

記録の `alias` は `import {Counter as Ctr}` と書いて `<Ctr />` を置き、`consts: [miniImport(Ctr)]` で通りました。評価をしないので、名前は書いた識別子そのもの（`Ctr`）です。7c60a98b3cc が評価器の道で足した別名の扱いは、a19c02706fd でこの形に置き換わりました。

## 3. 照合：3 か所で同じ「名前 → \[meta\]」の表を作る

📄 `angular/packages/compiler-cli/src/ngtsc/metadata/src/util.ts` L365–377 （▶ の行: 366, 369, 373–374, 376）

```ts
365 │ /** Extracts foreign component names from foreignImports and creates a SelectorlessMatcher. */
366 ▶ export function createForeignComponentMatcher(
367 │   foreignImports: ForeignComponentMeta[] | null,
368 │ ): SelectorlessMatcher<ForeignComponentMeta> | null {
369 ▶   if (foreignImports === null || foreignImports.length === 0) {
370 │     return null;
371 │   }
372 │   const registry = new Map<string, ForeignComponentMeta[]>();
373 ▶   for (const meta of foreignImports) {
374 ▶     registry.set(meta.name, [meta]);
375 │   }
376 ▶   return new SelectorlessMatcher(registry);
377 │ }
```

ngtsc の側の表です。369 行目、`foreignImports` が無ければ `null`（照合しない）。373〜375 行目で名前ごとに 1 つの meta を入れ、376 行目で `SelectorlessMatcher` にします。`SelectorlessMatcher` の `match(name)` は `Map` を引くだけです（[selectorless の章](../standalone/13-standalone-selectorless.md)）。この関数は、解析（handler.ts の検査の行。standalone シリーズの章の 4 節）、テンプレートの binder、型チェックの範囲の 3 か所から呼ばれます。

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/typecheck.ts` L162–170 （▶ の行: 163–164, 168）

```ts
162 │ 
163 ▶     const foreignMatcher =
164 ▶       hostMeta !== null ? createForeignComponentMatcher(hostMeta.foreignImports) : null;
165 │ 
166 │     const typeCheckScope: TypeCheckScope = {
167 │       matcher,
168 ▶       foreignMatcher,
169 │       directives,
170 │       pipes,
```

型チェックの範囲（`TypeCheckScopeRegistry`）の 163〜164 行目です。ここで作った `foreignMatcher` は、型チェックの `R3TargetBinder` の第 2 引数に渡ります。コンパイラの側（`ComponentCompilationJob`）も同じ形の表を自分で作ります（standalone シリーズの章の 5 節で引用した compilation.ts）。

### binder：ディレクティブと両方に当たったら投げる

📄 `angular/packages/compiler/test/render3/view/binding_spec.ts` L1673–1699 （▶ の行: 1676–1677, 1679, 1683, 1685, 1688, 1694, 1696–1697）

```ts
1673 │     it('should match foreign components by tag name', () => {
1674 │       const template = parseTemplate('<FancyButton></FancyButton>', '', {});
1675 │       const registry = new Map<string, ForeignComponentMeta[]>();
1676 ▶       registry.set('FancyButton', [{name: 'FancyButton'}]);
1677 ▶       const foreignMatcher = new SelectorlessMatcher(registry);
1678 │ 
1679 ▶       const binder = new R3TargetBinder(new SelectorMatcher<DirectiveMeta[]>(), foreignMatcher);
1680 │       const res = binder.bind({template: template.nodes});
1681 │ 
1682 │       const el = template.nodes[0] as a.Element;
1683 ▶       const foreignComp = res.getForeignComponent(el);
1684 │       expect(foreignComp).not.toBeNull();
1685 ▶       expect(foreignComp?.name).toBe('FancyButton');
1686 │     });
1687 │ 
1688 ▶     it('should throw an error when tag matches both directive and foreign component', () => {
1689 │       const template = parseTemplate('<comp></comp>', '', {});
1690 │       const registry = new Map<string, ForeignComponentMeta[]>();
1691 │       registry.set('comp', [{name: 'comp'}]);
1692 │       const foreignMatcher = new SelectorlessMatcher(registry);
1693 │ 
1694 ▶       const binder = new R3TargetBinder(makeSelectorMatcher(), foreignMatcher);
1695 │ 
1696 ▶       expect(() => binder.bind({template: template.nodes})).toThrowError(
1697 ▶         "Conflict: Element 'comp' matches both an Angular directive and a foreign component.",
1698 │       );
1699 │     });
```

`R3TargetBinder` は、要素ごとに CSS セレクタでディレクティブを集めたあと、外のコンポーネントの表を要素名で引きます。両方に当たると、1696〜1698 行目の `toThrowError` のとおり、診断ではなく `Error` を投げます（`visitElementOrTemplate`。binder の章で引用した範囲の中の行）。記録の `directive-too`（`@Directive({selector: 'Counter'})` を `imports` に入れて `<Counter />` を置く）では、ngc の診断は **TS500**（コンパイラの中で投げられた例外）1 つで、メッセージがこの文字列でした。22.1.6 と 22.2.6 で同じです。

### 型チェック：式は見るが、props の型とは照らさない

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L572–600 （▶ の行: 580, 584–585, 588, 592–593, 595）

```ts
572 │   private appendDirectivesAndInputsOfElementLikeNode(node: Element | Template): void {
573 │     // Collect all the inputs on the element.
574 │     const claimedInputs = new Set<string>();
575 │ 
576 │     // Don't resolve directives when selectorless is enabled and treat all the inputs on the element
577 │     // as unclaimed. In selectorless the inputs are defined either in component or directive nodes.
578 │     const directives = this.tcb.boundTarget.getDirectivesOfNode(node);
579 │ 
580 ▶     if (directives === null || directives.length === 0) {
581 │       // If there are no directives, then all inputs are unclaimed inputs, so queue an operation
582 │       // to add them if needed.
583 │       if (node instanceof Element) {
584 ▶         this.opQueue.push(
585 ▶           new TcbUnclaimedInputsOp(this.tcb, this, node.inputs, node, claimedInputs),
586 │         );
587 │ 
588 ▶         // Skip DOM schema checks for elements matched as foreign components.
589 │         // An element can never match both an Angular directive and a foreign component
590 │         // without throwing a fatal error, so we are guaranteed that directives is empty
591 │         // and we only need to intercept in this directiveless block.
592 ▶         const isForeign = this.tcb.boundTarget.getForeignComponent(node) !== null;
593 ▶         if (!isForeign) {
594 │           this.opQueue.push(
595 ▶             new TcbDomSchemaCheckerOp(this.tcb, node, /* checkElement */ true, claimedInputs),
596 │           );
597 │         }
598 │       }
599 │       return;
600 │     }
```

外のコンポーネントにはディレクティブが当たらないので、580 行目の枝に入ります。584〜586 行目、束縛はすべて「どのディレクティブも受け取らない入力」として `TcbUnclaimedInputsOp` に積まれ、592〜597 行目、外のコンポーネントなら DOM のスキーマの確かめ（NG8001・NG8002）を積みません。記録では、`[value]="nothing"` は TS2339（`nothing` が無い）になり、props の型に `value: number` を書いた `typedImport` に `[value]="title"`（string）を渡す `type-props` は**何も出ませんでした**。式は型チェックされ、外のコンポーネントの props の型とは照らされません。

📄 `aeb55c8bc10 の抜粋（拡張診断 NG8109）`

```
--- packages/compiler-cli/src/ngtsc/typecheck/extended/checks/interpolated_signal_not_invoked/index.ts（git show aeb55c8bc10 の抜粋）
@@ -61,6 +61,10 @@ class InterpolatedSignalCheck extends TemplateCheckWithVisitor<ErrorCode.INTERPO
     }
     // check bound inputs like `[prop]="mySignal"` on an element or inline template
     else if (node instanceof TmplAstElement && node.inputs.length > 0) {
+      // Allow signals to be passed directly to foreign components, without invocation.
+      if (ctx.templateTypeChecker.getForeignComponent(component, node) !== null) {
+        return [];
+      }
       const directivesOfElement = ctx.templateTypeChecker.getDirectivesOfNode(component, node);
       return node.inputs.flatMap((input) =>
         checkBoundAttribute(ctx, component, directivesOfElement, input),
```

signal を呼ばずに束縛すると出る拡張診断 NG8109 は、外のコンポーネントの要素なら何も出しません。記録の `props`（`[value]="count"`）は 0 件、同じ式を `<div [title]="count">` に書いた `signal-dom` は NG8109 の警告です。外へ signal をそのまま渡して、外が購読するための形です。

## 4. @content を解析して検査する

### パーサ：r3\_content\_blocks.ts

📄 `angular/packages/compiler/src/render3/r3_content_blocks.ts` L20–51 （▶ の行: 21, 25, 33–34, 41, 48）

```ts
20 │   const errors: ParseError[] = [];
21 ▶   if (ast.parameters.length < 1 || ast.parameters.length > 2) {
22 │     errors.push(
23 │       new ParseError(
24 │         ast.startSourceSpan,
25 ▶         '@content block must have one or two parameters, e.g. ' +
26 │           '"@content(header)" or "@content(items; let item, index)"',
27 │       ),
28 │     );
29 │     return {node: null, errors};
30 │   }
31 │ 
32 │   const nameParam = ast.parameters[0];
33 ▶   const name = nameParam.expression.trim();
34 ▶   if (name.includes(',')) {
35 │     errors.push(
36 │       new ParseError(ast.startSourceSpan, '@content block must have exactly one name parameter'),
37 │     );
38 │     return {node: null, errors};
39 │   }
40 │ 
41 ▶   if (!IDENTIFIER_PATTERN.test(name)) {
42 │     errors.push(
43 │       new ParseError(nameParam.sourceSpan, '@content name must be a valid JavaScript identifier'),
44 │     );
45 │     return {node: null, errors};
46 │   }
47 │ 
48 ▶   const variables = parseContentBlockVariables(ast, errors);
49 │   if (variables === null) {
50 │     return {node: null, errors};
51 │   }
```

📄 `angular/packages/compiler/src/render3/r3_content_blocks.ts` L102–141 （▶ の行: 102, 108, 117, 125, 133–134, 136–138）

```ts
102 ▶     if (varName.includes('=')) {
103 │       const eqIndex = varName.indexOf('=');
104 │       const namePart = varName.substring(0, eqIndex).trim();
105 │       const fullVarSpan = new ParseSourceSpan(varStart, varStart.moveBy(varName.length));
106 │ 
107 │       errors.push(
108 ▶         new ParseError(fullVarSpan, `@content block variables cannot be assigned a value`),
109 │       );
110 │ 
111 │       varName = namePart;
112 │       varSpan = new ParseSourceSpan(varStart, varStart.moveBy(varName.length));
113 │     } else {
114 │       varSpan = new ParseSourceSpan(varStart, varStart.moveBy(varName.length));
115 │     }
116 │ 
117 ▶     if (!IDENTIFIER_PATTERN.test(varName)) {
118 │       errors.push(
119 │         new ParseError(varSpan, `Variable name "${varName}" must be a valid JavaScript identifier`),
120 │       );
121 │       searchIndex = index + varName.length;
122 │       continue;
123 │     }
124 │ 
125 ▶     if (variables.some((v) => v.name === varName)) {
126 │       errors.push(
127 │         new ParseError(varSpan, `Duplicate variable name "${varName}" in @content block`),
128 │       );
129 │       searchIndex = index + varName.length;
130 │       continue;
131 │     }
132 │ 
133 ▶     // @content block variables cannot be assigned an explicit value in the template
134 ▶     // (e.g. "let item = value"). Instead, they are assigned an argument of the calling render function
135 │     // based on their positional index. For example if we have a @content block like
136 ▶     // "@content(items; let item, index)" the render function for that block will be called like
137 ▶     // "render(items, ctx[0], ctx[1])".
138 ▶     variables.push(new t.Variable(varName, '', varSpan, varSpan));
139 │     searchIndex = index + varName.length;
140 │   }
141 │   return variables;
```

`@content` は `r3_template_transform.ts` の block の switch で `case 'content'` に入り（[制御フローの block の章](../compiler/08-compiler-control-flow-blocks.md)で引用した範囲）、ここへ来ます。21 行目、引数は 1 つか 2 つ。41 行目、名前は JavaScript の識別子。2 つ目の引数は `let` で始まる変数の並びで、102〜111 行目、`let item = 1` のような値の代入はエラーです。133〜137 行目のコメントのとおり、変数は書いた順の位置で「呼ぶ関数の引数」に結び付き、138 行目の `t.Variable` の値は空文字です。記録の `parse-no-let` と `parse-assign` はここで落ち、診断の code は NG5002（テンプレートの解析エラー）です。パーサは `@content` がどこにあっても受け付けます。置き場所は次の ngtsc の検査が見ます。

### ngtsc の検査：foreign\_component.ts の残りの行

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/foreign_component.ts` L60–97 （▶ の行: 61, 66, 75–76, 79, 82–83, 88–89, 92–95）

```ts
60 │ class ForeignComponentFeatureAnalyzer extends TmplAstRecursiveVisitor {
61 ▶   private currentParent: TmplAstNode | null = null;
62 │   readonly diagnostics: ts.Diagnostic[] = [];
63 │   // Tracks the named @content blocks defined for each foreign component element.
64 │   // This is used to detect duplicate @content declarations under the same parent
65 │   // during the recursive AST traversal.
66 ▶   private readonly seenContentBlocks = new Map<TmplAstElement, Map<string, TmplAstContentBlock>>();
67 │ 
68 │   constructor(
69 │     private readonly foreignMatcher: SelectorlessMatcher<ForeignComponentMeta> | null,
70 │     private readonly sourceMapping: SourceMapping,
71 │   ) {
72 │     super();
73 │   }
74 │ 
75 ▶   private elementIsForeignComponent(tagName: string): boolean {
76 ▶     return this.foreignMatcher !== null && this.foreignMatcher.match(tagName).length > 0;
77 │   }
78 │ 
79 ▶   private parentNodeIsForeignComponent(): boolean {
80 │     return (
81 │       this.currentParent !== null &&
82 ▶       this.currentParent instanceof TmplAstElement &&
83 ▶       this.elementIsForeignComponent(this.currentParent.name)
84 │     );
85 │   }
86 │ 
87 │   override visitElement(element: TmplAstElement): void {
88 ▶     if (this.elementIsForeignComponent(element.name)) {
89 ▶       this.validateForeignComponent(element);
90 │     }
91 │ 
92 ▶     const prevParent = this.currentParent;
93 ▶     this.currentParent = element;
94 ▶     super.visitElement(element);
95 ▶     this.currentParent = prevParent;
96 │   }
97 │ 
```

検査は `TmplAstRecursiveVisitor` で、61 行目の `currentParent`（いま見ている親のノード）を出入りのたびに付け替えます（92〜95 行目）。このファイルの後半の `visitIfBlockBranch` などは、`@if` の枝・`@for`・`@switch`・`@defer`・`ng-template` でも同じ付け替えをするので、`<Card>@if (x) { @content (a) {…} }</Card>` の `@content` の親は `@if` の枝になり、8026 です（template\_typecheck\_spec.ts の it、6 節の表）。82〜83 行目、親が「要素で、しかも名前が表にある」ときだけ直下とみなします。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/foreign_component.ts` L281–316 （▶ の行: 282, 287, 290, 293–294, 301, 305–306, 314）

```ts
281 │   private validateContentBlock(block: TmplAstContentBlock): void {
282 ▶     const parent = this.currentParent as TmplAstElement;
283 │ 
284 │     // Retrieve or initialize the map of @content blocks seen so far for this parent.
285 │     // Since the visitor is recursive, we must track declarations per-parent to
286 │     // only report duplicates within the scope of the same foreign component.
287 ▶     let seen = this.seenContentBlocks.get(parent);
288 │     if (seen === undefined) {
289 │       seen = new Map<string, TmplAstContentBlock>();
290 ▶       this.seenContentBlocks.set(parent, seen);
291 │     }
292 │ 
293 ▶     if (seen.has(block.name)) {
294 ▶       const firstDecl = seen.get(block.name)!;
295 │       this.diagnostics.push(
296 │         makeTemplateDiagnostic(
297 │           '' as TypeCheckId,
298 │           this.sourceMapping,
299 │           block.sourceSpan,
300 │           ts.DiagnosticCategory.Error,
301 ▶           ngErrorCode(ErrorCode.CONFLICTING_CONTENT_DECLARATION),
302 │           `A @content block with the name '${block.name}' has already been defined for this ` +
303 │             'component.',
304 │           [
305 ▶             {
306 ▶               text: `The @content block '${block.name}' was first defined here.`,
307 │               start: firstDecl.sourceSpan.start.offset,
308 │               end: firstDecl.sourceSpan.end.offset,
309 │             },
310 │           ],
311 │         ),
312 │       );
313 │     } else {
314 ▶       seen.set(block.name, block);
315 │     }
316 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/foreign_component.ts` L317–345 （▶ の行: 320–321, 323–324, 326, 333, 338）

```ts
317 │     // A @content block projects content into a property of the foreign component.
318 │     // If the parent element also binds to this property (either via a property binding
319 │     // or a static attribute), it creates a conflict as both try to write to the same prop.
320 ▶     const conflictInput = parent.inputs.find(
321 ▶       (input) => input.type === BindingType.Property && input.name === block.name,
322 │     );
323 ▶     const conflictAttr = parent.attributes.find((attr) => attr.name === block.name);
324 ▶     const conflict = conflictInput ?? conflictAttr;
325 │ 
326 ▶     if (conflict !== undefined) {
327 │       this.diagnostics.push(
328 │         makeTemplateDiagnostic(
329 │           '' as TypeCheckId,
330 │           this.sourceMapping,
331 │           block.sourceSpan,
332 │           ts.DiagnosticCategory.Error,
333 ▶           ngErrorCode(ErrorCode.CONFLICTING_CONTENT_AND_PROPERTY),
334 │           `A @content block with the name '${block.name}' conflicts with a property on the ` +
335 │             'parent component.',
336 │           [
337 │             {
338 ▶               text: `The property '${block.name}' is defined here.`,
339 │               start: conflict.sourceSpan.start.offset,
340 │               end: conflict.sourceSpan.end.offset,
341 │             },
342 │           ],
343 │         ),
344 │       );
345 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/foreign_component.ts` L347–362 （▶ の行: 349, 356–357）

```ts
347 │     // Explicitly defining a `@content (children)` block without parameters is unnecessary because
348 │     // child nodes are implicitly passed to the `children` property.
349 ▶     if (block.name === CHILDREN && block.variables.length === 0) {
350 │       this.diagnostics.push(
351 │         makeTemplateDiagnostic(
352 │           '' as TypeCheckId,
353 │           this.sourceMapping,
354 │           block.sourceSpan,
355 │           ts.DiagnosticCategory.Error,
356 ▶           ngErrorCode(ErrorCode.FOREIGN_COMPONENT_CONTENT_UNNECESSARY_FOR_CHILDREN),
357 ▶           `Defining a @content (${CHILDREN}) block with no parameters is unnecessary. ` +
358 │             'Pass children as direct nested content of the foreign component instead.',
359 │         ),
360 │       );
361 │     }
362 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/foreign_component.ts` L136–173 （▶ の行: 139–140, 142–143, 151–152, 162–163, 166）

```ts
136 │     // A foreign component maps implicit child nodes to a 'children' property.
137 │     // If the user also explicitly binds to '[children]' or sets a static 'children' attribute,
138 │     // this is a conflict.
139 ▶     const childrenInput = element.inputs.find(
140 ▶       (input) => input.type === BindingType.Property && input.name === CHILDREN,
141 │     );
142 ▶     const childrenAttr = element.attributes.find((attr) => attr.name === CHILDREN);
143 ▶     const conflictingSource = childrenInput ?? childrenAttr;
144 │     if (conflictingSource === undefined) {
145 │       return;
146 │     }
147 │ 
148 │     // Explicit `@content` blocks (TmplAstContentBlock) are mapped to properties by their name, so
149 │     // they do not conflict with the default 'children' property. We only care about child nodes
150 │     // that are not content blocks, as those are implicitly passed to the 'children' property.
151 ▶     const firstChild = element.children.find((child) => !(child instanceof TmplAstContentBlock));
152 ▶     if (firstChild === undefined) {
153 │       return;
154 │     }
155 │ 
156 │     this.diagnostics.push(
157 │       makeTemplateDiagnostic(
158 │         '' as TypeCheckId,
159 │         this.sourceMapping,
160 │         conflictingSource.sourceSpan,
161 │         ts.DiagnosticCategory.Error,
162 ▶         ngErrorCode(ErrorCode.CONFLICTING_CONTENT_AND_PROPERTY),
163 ▶         `A foreign component cannot have both a '${CHILDREN}' property and child nodes.`,
164 │         [
165 │           {
166 ▶             text: 'Child nodes are defined here.',
167 │             start: firstChild.sourceSpan.start.offset,
168 │             end: firstChild.sourceSpan.end.offset,
169 │           },
170 │         ],
171 │       ),
172 │     );
173 │   }
```

1. **287〜291 行目・293〜312 行目：同じ親の中で同じ名前は 8028**

   親の要素ごとに `Map` を持つので、別の外のコンポーネントなら同じ名前を使えます。305〜309 行目の関連メッセージが最初の宣言を指します。
2. **320〜344 行目：親の束縛か静的属性と同じ名前は 8029**

   どちらも同じ props の名前に書き込むからです。
3. **349〜361 行目：引数の無い `@content (children)` は 8027**

   名前の無い子は暗黙に `children` になるので不要、というメッセージです。引数があれば通ります（[第 4 回](04-fgn-content.md)の context の spec の `@content (children; let _)`）。
4. **139〜172 行目：`[children]` や `children="…"` と、名前の無い子が両方あると 8029**

   151 行目、`@content` ブロックは数えません。同じ 8029 が 2 つの違う場面で使われています（記録の `prop-conflict` と `children-conflict`）。

### エラーコードの表（記録の実物）

| code | ErrorCode | どこで | 記録のケース |
| --- | --- | --- | --- |
| NG8025 | `FOREIGN_COMPONENT_UNSUPPORTED_BINDING` | foreign\_component.ts の `validateForeignComponent`（standalone シリーズの章の 4 節） | `event`・`ref`・`class-binding`・`two-way`（イベントと Property 以外の 2 つが出る） |
| NG8026 | `INVALID_CONTENT_PLACEMENT` | `visitContentBlock`（同 4 節） | `outside` |
| NG8027 | `FOREIGN_COMPONENT_CONTENT_UNNECESSARY_FOR_CHILDREN` | 349〜361 行目 | `children-block` |
| NG8028 | `CONFLICTING_CONTENT_DECLARATION` | 293〜312 行目 | `duplicate`・`duplicate-external` |
| NG8029 | `CONFLICTING_CONTENT_AND_PROPERTY` | 326〜344 行目、156〜172 行目 | `prop-conflict`・`children-conflict` |
| NG1010 | `VALUE_HAS_WRONG_TYPE` | util.ts（2 節と standalone シリーズの章の 3 節） | `not-array`・`prop-access` |
| NG2010 | `COMPONENT_NOT_STANDALONE` | handler.ts（standalone シリーズの章の 3 節） | `not-standalone` |
| NG5002 | テンプレートの解析エラー | r3\_content\_blocks.ts | `parse-no-let`・`parse-assign` |
| TS500 | （コンパイラの中の例外） | binder の `Conflict: …` | `directive-too` |

8025〜8029 の定義（error\_code.ts）は standalone シリーズの章の 4 節で引用しました。記録の `duplicate-external` は同じ重複を `templateUrl` の HTML に書いたもので、関連メッセージ「first defined here」のファイルが `src/test.html` になり、もう 1 つ「Error occurs in the template of component TestCmp.」が `src/test.ts` を指しました。インラインのテンプレートの `duplicate` では `src/test.ts` です。a46292af260 が直したのがこの「HTML の位置を .ts に付けていた」点です。

## 5. ingest → resolve\_foreign\_content → reify

### ingest：@content ごとにビューを割り当て、Content op を積む

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L408–424 （▶ の行: 408–409, 414–415, 418, 420–421）

```ts
408 ▶   for (const block of contentBlocks) {
409 ▶     const blockView = unit.job.allocateView(unit.xref);
410 │ 
411 │     // @content block variables map directly to the arguments array passed to the calling render
412 │     // function. We set the context variable's value to its index in the block's variables list
413 │     // so that code generation resolves it to its corresponding index in the arguments array.
414 ▶     for (let i = 0; i < block.variables.length; i++) {
415 ▶       blockView.contextVariables.set(block.variables[i].name, i);
416 │     }
417 │ 
418 ▶     ingestNodes(blockView, block.children);
419 │ 
420 ▶     unit.create.push(
421 ▶       ir.createContentOp(id, blockView.xref, block.name, block.startSourceSpan, block.sourceSpan),
422 │     );
423 │   }
424 │ 
```

`ingestForeignComponent` の真ん中です（前後の、props の `Map` と名前の無い子の行は standalone シリーズの章の 5 節）。409 行目、ブロックごとに子のビューを割り当て、414〜416 行目で `let` の変数に「引数の何番目か」を入れます。418 行目で中身を取り込み、420〜422 行目の `Content` op は「このビューを、この外のコンポーネント（`id`）の、この名前の props に」という印だけを持ちます。

📄 `angular/packages/compiler/src/template/pipeline/ir/src/ops/create.ts` L251–271 （▶ の行: 251, 262, 267）

```ts
251 ▶ export interface ForeignComponentOp extends Op<CreateOp>, ConsumesSlotOpTrait {
252 │   kind: OpKind.ForeignComponent;
253 │ 
254 │   /**
255 │    * The `XrefId` allocated for this foreign component.
256 │    */
257 │   xref: XrefId;
258 │ 
259 │   /**
260 │    * Index of the foreign component class/function in the constant pool.
261 │    */
262 ▶   constIndex: ConstIndex;
263 │ 
264 │   /**
265 │    * Static attributes and property bindings.
266 │    */
267 ▶   props: Map<string, o.Expression>;
268 │ 
269 │   sourceSpan: ParseSourceSpan | null;
270 │ }
271 │ 
```

📄 `angular/packages/compiler/src/template/pipeline/ir/src/ops/create.ts` L294–318 （▶ の行: 296, 302, 307, 312）

```ts
294 │  * Logical operation representing a project `@content` block for a foreign component.
295 │  */
296 ▶ export interface ContentOp extends Op<CreateOp> {
297 │   kind: OpKind.Content;
298 │ 
299 │   /**
300 │    * The `XrefId` of the foreign component this content is projected into.
301 │    */
302 ▶   target: XrefId;
303 │ 
304 │   /**
305 │    * The name of the property on the foreign component to assign this content to.
306 │    */
307 ▶   propertyName: string;
308 │ 
309 │   /**
310 │    * The `XrefId` of the view containing the content.
311 │    */
312 ▶   view: XrefId;
313 │ 
314 │   startSourceSpan: ParseSourceSpan;
315 │   sourceSpan: ParseSourceSpan;
316 │ }
317 │ 
318 │ /**
```

251 行目、`ForeignComponentOp` はスロットを 1 つ使います（`ConsumesSlotOpTrait`）。296 行目の `ContentOp` にはその印がありません。スロットを使う本物の op に替えるのが次の phase です。

### resolve\_foreign\_content：Content op をテンプレートと変数に替える

📄 `angular/packages/compiler/src/template/pipeline/src/phases/resolve_foreign_content.ts` L16–48 （▶ の行: 16, 19, 21–22, 27, 31, 36–37, 39–40, 48）

```ts
16 ▶ export function resolveForeignContent(job: CompilationJob): void {
17 │   for (const unit of job.units) {
18 │     // Collect all foreign components in this unit
19 ▶     const foreignComponents = new Map<ir.XrefId, ir.ForeignComponentOp>();
20 │     for (const op of unit.create) {
21 ▶       if (op.kind === ir.OpKind.ForeignComponent) {
22 ▶         foreignComponents.set(op.xref, op);
23 │       }
24 │     }
25 │ 
26 │     for (const op of unit.create) {
27 ▶       if (op.kind !== ir.OpKind.Content) {
28 │         continue;
29 │       }
30 │ 
31 ▶       const target = foreignComponents.get(op.target);
32 │       if (target === undefined) {
33 │         throw new Error(`AssertionError: ContentOp target not found`);
34 │       }
35 │ 
36 ▶       const templateName = op.propertyName.charAt(0).toUpperCase() + op.propertyName.slice(1);
37 ▶       const templateOp = ir.createTemplateOp(
38 │         op.view,
39 ▶         ir.TemplateKind.NgTemplate,
40 ▶         null, // tagName
41 │         templateName,
42 │         ir.Namespace.HTML,
43 │         undefined,
44 │         op.startSourceSpan,
45 │         op.sourceSpan,
46 │       );
47 │ 
48 ▶       ir.OpList.replace<ir.CreateOp>(op, templateOp);
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/resolve_foreign_content.ts` L49–73 （▶ の行: 50, 53, 56, 60, 63, 69, 71）

```ts
49 │ 
50 ▶       const foreignContent = new ir.ForeignContentExpr(
51 │         templateOp.xref,
52 │         templateOp.handle,
53 ▶         target.constIndex,
54 │       );
55 │ 
56 ▶       const varXref = job.allocateXrefId();
57 │       const variable: ir.SemanticVariable = {
58 │         kind: ir.SemanticVariableKind.Identifier,
59 │         name: null,
60 ▶         identifier: op.propertyName,
61 │         local: true,
62 │       };
63 ▶       const varOp = ir.createVariableOp<ir.CreateOp>(
64 │         varXref,
65 │         variable,
66 │         foreignContent,
67 │         ir.VariableFlags.None,
68 │       );
69 ▶       ir.OpList.insertBefore<ir.CreateOp>(varOp, target);
70 │ 
71 ▶       target.props.set(op.propertyName, new ir.ReadVariableExpr(varXref));
72 │     }
73 │   }
```

1. **19〜24 行目：同じビューの外のコンポーネントを xref で引けるようにする**
2. **36〜48 行目：`Content` op を `TemplateOp`（`ng-template` と同じ種類）に置き換える**

   36 行目、名前の先頭を大文字にして関数名に使います。記録の出力の `TestCmp_Header_0_Template`・`TestCmp_Row_1_Template` がこれです。40 行目の tagName は `null`。
3. **50〜54 行目：`ForeignContentExpr` を作る**

   テンプレートの xref とスロット、外のコンポーネントの consts の添字（53 行目）を持ちます。
4. **56〜69 行目：その式を変数にして、外のコンポーネントの op の直前に入れる**

   60 行目、変数の名前は props の名前です（出力の `header_r3`）。
5. **71 行目：props の `Map` に「その変数を読む」式を足す**

   だから props の中で `@content` は、束縛と同じ並びの 1 つの項目になります。

この phase は emit.ts の phase の並びの**先頭**にあります（[コンパイラの章](../compiler/01-compiler.md)で引用した phase の配列の最初の項目）。スロットの割り当てより前に `TemplateOp` にしておかないと、中身のテンプレートにスロットが付かないからです。

📄 `angular/packages/compiler/src/template/pipeline/ir/src/expression.ts` L155–192 （▶ の行: 159, 163–165, 172, 180–181）

```ts
155 │ /**
156 │  * Runtime operation to render foreign content (children of a foreign component)
157 │  * and extract its root DOM nodes.
158 │  */
159 ▶ export class ForeignContentExpr extends ExpressionBase {
160 │   override readonly kind = ExpressionKind.ForeignContent;
161 │ 
162 │   constructor(
163 ▶     readonly childrenViewXref: XrefId,
164 ▶     readonly childrenViewHandle: SlotHandle,
165 ▶     readonly foreignComponentConstIndex: ConstIndex,
166 │   ) {
167 │     super();
168 │   }
169 │ 
170 │   override visitExpression(): void {}
171 │ 
172 ▶   override isEquivalent(e: o.Expression): boolean {
173 │     return (
174 │       e instanceof ForeignContentExpr &&
175 │       e.childrenViewXref === this.childrenViewXref &&
176 │       e.foreignComponentConstIndex === this.foreignComponentConstIndex
177 │     );
178 │   }
179 │ 
180 ▶   override isConstant(): boolean {
181 ▶     return false;
182 │   }
183 │ 
184 │   override transformInternalExpressions(): void {}
185 │ 
186 │   override clone(): ForeignContentExpr {
187 │     return new ForeignContentExpr(
188 │       this.childrenViewXref,
189 │       this.childrenViewHandle,
190 │       this.foreignComponentConstIndex,
191 │     );
192 │   }
```

180〜182 行目、`isConstant` は false です。172〜178 行目、同じテンプレートで同じ外のコンポーネントなら同じ式とみなします。

### reify：命令の呼び出しに替える

📄 `angular/packages/compiler/src/template/pipeline/src/phases/reify.ts` L146–162 （▶ の行: 146, 148, 153, 156–157, 160）

```ts
146 ▶       case ir.OpKind.ForeignComponent:
147 │         const propsMap =
148 ▶           op.props.size > 0
149 │             ? o.literalMap(
150 │                 Array.from(op.props.entries()).map(([key, value]) => ({
151 │                   key,
152 │                   value,
153 ▶                   quoted: isUnsafeObjectKey(key),
154 │                 })),
155 │               )
156 ▶             : null;
157 ▶         const propsExpr = propsMap !== null ? o.arrowFn([], propsMap) : null;
158 │         ir.OpList.replace(
159 │           op,
160 ▶           ng.foreignComponent(op.handle.slot!, o.literal(op.constIndex), propsExpr, op.sourceSpan),
161 │         );
162 │         break;
```

📄 `angular/packages/compiler/src/template/pipeline/src/instruction.ts` L52–73 （▶ の行: 58–60, 62, 68, 71–72）

```ts
52 │ export function foreignComponent(
53 │   slot: number,
54 │   foreignComponentRef: o.Expression,
55 │   props: o.Expression | null,
56 │   sourceSpan: ParseSourceSpan | null,
57 │ ): ir.CreateOp {
58 ▶   const args = [o.literal(slot), foreignComponentRef];
59 ▶   if (props !== null) {
60 ▶     args.push(props);
61 │   }
62 ▶   return call(Identifiers.foreignComponent, args, sourceSpan);
63 │ }
64 │ 
65 │ export function foreignContent(
66 │   slot: number,
67 │   foreignComponentIndex: number,
68 ▶   parameterized: boolean,
69 │ ): o.Expression {
70 │   return o
71 ▶     .importExpr(parameterized ? Identifiers.foreignContentFn : Identifiers.foreignContent)
72 ▶     .callFn([o.literal(slot), o.literal(foreignComponentIndex)]);
73 │ }
```

reify.ts の 147〜156 行目、props の `Map` を挿入の順のままオブジェクトのリテラルにし、153 行目、`unsafe-attr` のように識別子にならない名前は引用符で囲みます。157 行目、`() => ({…})` の矢印関数で包み、props が無ければ instruction.ts の 59 行目の `if` で第 3 引数を付けません（記録の `alias` は `ɵɵforeignComponent(0, 0)`）。`ForeignContentExpr` は reify.ts の `reifyIrExpression` で、子のビューの `contextVariables` が 1 つ以上なら 71 行目の `parameterized` が true になり `ɵɵforeignContentFn` です（reify と emit の章で引用した範囲の中）。

📄 `記録の named：入力のテンプレート`

```
<Card>
  @content (header) { <h1>見出し</h1> }
  @content (row; let item, i) { <li>{{ i }}: {{ item }}</li> }
  本文
</Card>
```

📄 `記録の named：出力のテンプレート関数と ɵcmp（22.1.6）`

```
function TestCmp_Header_0_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "h1");
    i0.ɵɵtext(1, "\u898B\u51FA\u3057");
    i0.ɵɵdomElementEnd();
} }
function TestCmp_Row_1_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "li");
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const item_r1 = ctx[0];
    const i_r2 = ctx[1];
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate2("", i_r2, ": ", item_r1);
} }
function TestCmp_Children_2_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵtext(0, " \u672C\u6587\n");
} }
static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: TestCmp, selectors: [["test-cmp"]], decls: 4, vars: 0, consts: [miniImport(Card)], template: function TestCmp_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomTemplate(0, TestCmp_Header_0_Template, 2, 0)(1, TestCmp_Row_1_Template, 2, 2)(2, TestCmp_Children_2_Template, 1, 0);
            const header_r3 = i0.ɵɵforeignContent(0, 0);
            const row_r4 = i0.ɵɵforeignContentFn(1, 0);
            const children_r5 = i0.ɵɵforeignContent(2, 0);
            i0.ɵɵforeignComponent(3, 0, () => ({ header: header_r3, row: row_r4, children: children_r5 }));
        } }, encapsulation: 2 });
}
```

`@content (row; let item, i)` の中身は `const item_r1 = ctx[0]; const i_r2 = ctx[1];` と読まれます（ingest の 414〜416 行目の位置）。3 つの `ɵɵdomTemplate` はスロット 0〜2 に連なり、外のコンポーネントはスロット 3 です。名前の無い子の `本文` はテキストだけで、前後の改行と空白がそのまま `ɵɵtext` に残りました（`" 本文\n"`）。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/standalone/foreign_component.local.js` L1–37 （▶ の行: 3, 5, 32–33）

```js
 1 │ function TestCmpChildren_Icon_0_Template(rf, ctx) {
 2 │   if (rf & 1) {
 3 ▶     i0.ɵɵelementStart(0, "span");
 4 │     i0.ɵɵtext(1, "Icon!");
 5 ▶     i0.ɵɵelementEnd();
 6 │   }
 7 │ }
 8 │ 
 9 │ function TestCmpChildren_Description_1_Template(rf, ctx) {
10 │   if (rf & 1) {
11 │     i0.ɵɵelementStart(0, "span");
12 │     i0.ɵɵtext(1, "Description text");
13 │     i0.ɵɵelementEnd();
14 │   }
15 │ }
16 │ 
17 │ function TestCmpChildren_Children_2_Template(rf, ctx) {
18 │   if (rf & 1) {
19 │     i0.ɵɵelementStart(0, "span");
20 │     i0.ɵɵtext(1, "Other children");
21 │     i0.ɵɵelementEnd();
22 │   }
23 │ }
24 │ 
25 │ function TestCmpRenderProps_Items_0_Template(rf, ctx) {
26 │   if (rf & 1) {
27 │     i0.ɵɵelementStart(0, "span");
28 │     i0.ɵɵtext(1);
29 │     i0.ɵɵelementEnd();
30 │   }
31 │   if (rf & 2) {
32 ▶     const item_r1 = ctx[0];
33 ▶     const index_r2 = ctx[1];
34 │     i0.ɵɵadvance();
35 │     i0.ɵɵtextInterpolate2("#", index_r2, ": ", item_r1);
36 │   }
37 │ }
```

compliance のローカルコンパイルの期待値では、中身のテンプレートが `ɵɵelementStart`（3 行目）です。全部コンパイル（full）では `ɵɵdomElementStart` です。ローカルコンパイルは依存のディレクティブを見られないので、DOM だけの命令を選べません。eb3e480360d のコミット本文は「この切り替えは、これまで外のコンポーネントの例でついでに確かめていただけだった」と書いています。

## 6. 制御フローの中：作成の段で親の文脈を読む（5bd00add071）

📄 `5bd00add071 の抜粋（generate_variables.ts）`

```
--- packages/compiler/src/template/pipeline/src/phases/generate_variables.ts（git show 5bd00add071 の抜粋）
@@ -73,6 +73,7 @@ function recursivelyProcessView(view: ViewCompilationUnit, parentScope: Scope |
     }
   }
 
+  view.create.prepend(generateVariablesInScopeForView(view, scope, false));
   view.update.prepend(generateVariablesInScopeForView(view, scope, false));
 
   for (const expr of view.functions) {
```

ふつうの要素の束縛は更新の段（`rf & 2`）で読むので、親のビューの変数を作る op も更新の段にだけ置かれていました。外のコンポーネントの props の関数は**作成の段**で `ɵɵforeignComponent` に渡されるので、`@if` の中では親の `ctx` を読む変数が作成の段に無く、使えませんでした。5bd00add071 は、同じ変数を作成の段の先頭にも入れ、`nextContext` をまとめる phase と変数を減らす phase も作成の段を見るようにしました。

📄 `記録の if-root：@if の中の外のコンポーネント（22.1.6）`

```
function TestCmp_Conditional_0_Template(rf, ctx) { if (rf & 1) {
    const ctx_r0 = i0.ɵɵnextContext();
    i0.ɵɵforeignComponent(0, 0, () => ({ value: ctx_r0.count }));
} }
static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: TestCmp, selectors: [["test-cmp"]], decls: 1, vars: 1, consts: [miniImport(Counter)], template: function TestCmp_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵconditionalCreate(0, TestCmp_Conditional_0_Template, 1, 0);
        } if (rf & 2) {
            i0.ɵɵconditional(ctx.show ? 0 : -1);
        } }, encapsulation: 2 });
}
```

`rf & 1` の中に `const ctx_r0 = i0.ɵɵnextContext();` があり、props の関数がそれを読みます。そして `ɵɵconditionalCreate(0, …, 1, 0)` には tagName がありません。比べる `if-root-div`（`@if` の中に `<div>` 1 つ）は `ɵɵconditionalCreate(0, …, 1, 1, "div", 0)` です。

📄 `2e442f78762 の抜粋（ingest.ts の ingestControlFlowInsertionPoint）`

```
--- packages/compiler/src/template/pipeline/src/ingest.ts（git show 2e442f78762 の抜粋）
@@ -1961,7 +1961,10 @@ function ingestControlFlowInsertionPoint(
     }
 
     // Root nodes can only elements or templates with a tag name (e.g. `<div *foo></div>`).
-    if (child instanceof t.Element || (child instanceof t.Template && child.tagName !== null)) {
+    if (
+      (child instanceof t.Element && unit.job.getForeignComponent(child) === null) ||
+      (child instanceof t.Template && child.tagName !== null)
+    ) {
       root = child;
     } else {
       return null;
```

制御フローのブロックに根の要素が 1 つだけなら、その tagName と属性を `ɵɵconditionalCreate` などに写して、`ng-content` の select に使います（[投影のコンパイルの章](../proj/02-proj-compile.md)で引用した関数）。2e442f78762 は、根が外のコンポーネントなら写さないようにしました。`FancyButton` という名前は DOM の要素ではないからです。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/standalone/foreign_component.ts` L48–87 （▶ の行: 52–53, 67, 71–73）

```ts
48 │ @Component({
49 │   selector: 'main-render-props',
50 │   template: `
51 │     <FancyButton [label]="title">
52 ▶       @content (items; let item, index) {
53 ▶         <span>#{{index}}: {{item}}</span>
54 │       }
55 │     </FancyButton>
56 │   `,
57 │   // @ts-ignore: @angular/core does not expose the `foreignImports` property.
58 │   foreignImports: [
59 │     // @ts-ignore: @angular/core does not expose the `ForeignComponent` type this expects.
60 │     frameworkImport(FancyButton),
61 │   ],
62 │ })
63 │ export class TestCmpRenderProps {
64 │   title = 'Submit';
65 │ }
66 │ 
67 ▶ // Nest @if to demonstrate that multiple `nextContext()` calls are correctly merged into one.
68 │ @Component({
69 │   selector: 'main-conditional',
70 │   template: `
71 ▶     @if (outerCondition) {
72 ▶       @if (innerCondition) {
73 ▶         <FancyButton [label]="title" />
74 │       }
75 │     }
76 │   `,
77 │   // @ts-ignore: @angular/core does not expose the `foreignImports` property.
78 │   foreignImports: [
79 │     // @ts-ignore: @angular/core does not expose the `ForeignComponent` type this expects.
80 │     frameworkImport(FancyButton),
81 │   ],
82 │ })
83 │ export class TestCmpConditional {
84 │   title = 'Submit';
85 │   innerCondition = true;
86 │   outerCondition = true;
87 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/standalone/foreign_component.js` L100–139 （▶ の行: 110–112, 131, 134）

```js
100 │ export class TestCmpRenderProps {
101 │   // ...
102 │   static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({
103 │     type: TestCmpRenderProps,
104 │     selectors: [["main-render-props"]],
105 │     decls: 2,
106 │     vars: 0,
107 │     consts: [frameworkImport(FancyButton)],
108 │     template: function TestCmpRenderProps_Template(rf, ctx) {
109 │       if (rf & 1) {
110 ▶         i0.ɵɵdomTemplate(0, TestCmpRenderProps_Items_0_Template, 2, 2);
111 ▶         const items_r3 = i0.ɵɵforeignContentFn(0, 0);
112 ▶         i0.ɵɵforeignComponent(1, 0, () => ({ label: ctx.title, items: items_r3 }));
113 │       }
114 │     },
115 │     encapsulation: 2
116 │   });
117 │ }
118 │ 
119 │ …
120 │ 
121 │ export class TestCmpConditional {
122 │   // ...
123 │   static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({
124 │     type: TestCmpConditional,
125 │     selectors: [["main-conditional"]],
126 │     decls: 1,
127 │     vars: 1,
128 │     consts: [frameworkImport(FancyButton)],
129 │     template: function TestCmpConditional_Template(rf, ctx) {
130 │       if (rf & 1) {
131 ▶         i0.ɵɵconditionalCreate(0, TestCmpConditional_Conditional_0_Template, 1, 1);
132 │       }
133 │       if (rf & 2) {
134 ▶         i0.ɵɵconditional(ctx.outerCondition ? 0 : -1);
135 │       }
136 │     },
137 │     encapsulation: 2
138 │   });
139 │ }
```

compliance の期待値です。111 行目が `ɵɵforeignContentFn`、131 行目の `ɵɵconditionalCreate` に tagName がありません。67 行目のコメント「入れ子の `@if` で、複数の `nextContext()` が 1 つにまとまることを示す」が 5bd00add071 の `next_context_merging` の変更に対応します。

## 7. consts に入れる（25c744c4d0a）と、部分コンパイル

📄 `25c744c4d0a の抜粋（ingest.ts）`

```
--- packages/compiler/src/template/pipeline/src/ingest.ts（git show 25c744c4d0a の抜粋）
@@ -400,8 +400,9 @@ function ingestForeignComponent(
   // Foreign components are created in the creation block. Updates are triggered reactively
   // through directly passed signal properties, alleviating the need for any explicit update
   // operations.
+  const constIndex = unit.job.addConst(foreignComp.component);
   unit.create.push(
-    ir.createForeignComponentOp(id, foreignComp.component, props, element.startSourceSpan),
+    ir.createForeignComponentOp(id, o.literal(constIndex), props, element.startSourceSpan),
   );
 }
```

最初は `frameworkImport(MyComponent)` の式をテンプレート関数の中に直接書いていました。コミット本文のとおり、テンプレート関数はモジュールの一番上に出るので、テストの中など関数の中で定義した外のコンポーネントを参照できませんでした。`consts` は `ɵɵdefineComponent` の引数としてクラスの static の初期化の中に出るので、そこで評価されます。結果として `miniImport(X)` は**コンポーネントの定義が評価されるときに 1 回だけ**呼ばれ、インスタンスごとには呼ばれません。

### 部分コンパイル（ライブラリ）では foreignImports が消える

`compilationMode: 'partial'` で出した宣言と、それを `@angular/compiler-cli/linker/babel` でリンクした結果です（22.1.6。22.2.6 でもリンク結果は同じ）。

📄 `部分コンパイルの出力（ɵɵngDeclareComponent）`

```
static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "22.1.6", type: TestCmp, isStandalone: true, selector: "test-cmp", ngImport: i0, template: '<Card [title]="title">本文</Card>', isInline: true });

```

📄 `リンクしたあと`

```
static ɵcmp = /* @__PURE__ */i0.ɵɵdefineComponent({
    type: TestCmp,
    selectors: [["test-cmp"]],
    decls: 2,
    vars: 1,
    consts: [[3, "title"]],
    template: function TestCmp_Template(rf, ctx) {
      if (rf & 1) {
        i0.ɵɵdomElementStart(0, "Card", 0);
        i0.ɵɵtext(1, "本文");
        i0.ɵɵdomElementEnd();
      }
      if (rf & 2) {
        i0.ɵɵdomProperty("title", ctx.title);
      }
    },
    encapsulation: 2
  });
```

`ɵɵngDeclareComponent` に `foreignImports` の項目がなく、リンカーの `partial_component_linker_1.ts` は `foreignImports: null` を渡します （[ローカライズのコンパイラの設定の章](../loc/08-loc-compiler-options.md)で引用した範囲の中の行）。リンクの結果、`<Card>` は `ɵɵdomElementStart(0, "Card", 0)` と `ɵɵdomProperty("title", …)` の、ふつうの DOM の要素になりました。診断は 0 件です。compliance の TEST\_CASES.json の外のコンポーネントの例は `"compilationModeFilter": ["full compile", "local compile"]` で、リンクのテスト（`compliance/linked`）は走りません（7 節の手元の結果で 0 specs）。

## 8. angular-main の続き：preprocessor にも同じ照合と検査

angular-main（74961c66242）には、2026-10-07 の 4e4ad75144e で compiler-cli に入った preprocessor（ngp）があります。../angular（8576f161ae4）には `packages/compiler-cli/preprocessor` がありません。preprocessor は ngtsc とは別に binder と型チェックを組み立てるので、外のコンポーネントの照合と検査も別に書かれています。

📄 `684a89027bc の抜粋（angular-main、preprocessor/src/tcb_adapter.ts）`

```
--- packages/compiler-cli/preprocessor/src/tcb_adapter.ts（git show 684a89027bc の抜粋）
@@ -292,7 +296,10 @@ export function adaptTcbInput(
       )
     : [];
 
-  const binder = new R3TargetBinder<TcbDirectiveMetadata>(matcher);
+  const binder = new R3TargetBinder<TcbDirectiveMetadata>(
+    matcher,
+    createForeignComponentMatcher(target.foreignImports),
+  );
   const host = config.typeCheckHostBindings === false ? null : adaptHostElement(target, content);
   const boundTarget = binder.bind({
     template: target.templateNodes,
```

684a89027bc は、preprocessor の `R3TargetBinder` に外のコンポーネントの表を渡し忘れていたのを直しました。同じコミットの golden（`foreign_component_template_diagnostics`）では、直す前の診断に「`'FancyButton' is not a known element`」があり、直したあと消えています。3 節の `createForeignComponentMatcher` と同じ関数を preprocessor 側にも足し、コメントで ngtsc の行を指しています。

📄 `c7fd4a2ed99 の抜粋（angular-main、preprocessor/src/foreign_component.ts）`

```
--- packages/compiler-cli/preprocessor/src/foreign_component.ts（git show c7fd4a2ed99 の抜粋）
@@ -285,11 +301,22 @@ class ForeignComponentFeatureAnalyzer extends TmplAstRecursiveVisitor {
     }
 
     if (seen.has(block.name)) {
+      const firstDecl = seen.get(block.name)!;
       this.report(
         CONFLICTING_CONTENT_DECLARATION,
         block.sourceSpan,
         `A @content block with the name '${block.name}' has already been defined for this ` +
           'component.',
+        [
+          {
+            filePath: this.filePath,
+            span: {
+              start: firstDecl.sourceSpan.start.offset,
+              end: firstDecl.sourceSpan.end.offset,
+            },
+            messageText: `The @content block '${block.name}' was first defined here.`,
+          },
+        ],
       );
     } else {
       seen.set(block.name, block);
```

c7fd4a2ed99 は、preprocessor の検査に 4 節の関連メッセージ（first defined here など）を足して ngtsc に揃え、ngtsc の spec を preprocessor でも走らせる仕組みの「失敗してよい一覧」（`ngp_known_failures.ts`）から、外のコンポーネントの it を 8 つ消しました。

もう 1 つ、PR 71935 が selectorless の試作を消しました（1 つ目のコミットは、angular-main の手元の `origin/main` で 2026-11-10 の ae9c706d141。74961c66242 にはまだ入っていません）。`origin/main` の `t2_binder.ts` では `DirectiveMatcher` が `SelectorMatcher` だけになり、`SelectorlessMatcher` は外のコンポーネントの表（`R3TargetBinder` の第 2 引数）と `ComponentCompilationJob` のためだけに残っています（directive\_matching.ts に定義があり、compilation.ts の照合の行は 8576f161ae4 と同じ）。

## 9. デモ：コンパイルの記録を再生する

> **🧪 DEMO — どう書くと、何の命令と、どの診断になるか**
>
> 手元の作業フォルダの記録スクリプトが、`foreignImports` を持つ小さなコンポーネントを @angular/compiler-cli 22.1.6（このサイトの node\_modules）で `performCompilation`（`strictTemplates`）にかけ、診断の code と出力のテンプレート関数を集めました。22.2.6 でも同じでした。ブラウザでは何もコンパイルしません。外のコンポーネントの代わりは中身の無い関数で、`miniImport` は受け取った値をそのまま返します（ngtsc は評価しないので、形だけあれば足ります）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fgn-compiler)

### 記録に出た診断の一覧

| code | メッセージの 1 行目 | ケース |
| --- | --- | --- |
| NG1010 | 'foreignImports' must be an array of foreign imports, e.g. 'foreignImports: \[myImport(MyComponent)\]'. | not-array |
| NG1010 | The component reference passed to the foreign import must be a simple identifier, e.g. 'myImport(MyComponent)'. | prop-access |
| NG2010 | 'foreignImports' is only valid on a component that is standalone. | not-standalone |
| NG5002 | @content block variables must start with "let", e.g. "let item, index" | parse-no-let |
| NG5002 | @content block variables cannot be assigned a value | parse-assign |
| NG8025 | Foreign components do not support event bindings. | event、two-way |
| NG8025 | Foreign components do not support references. | ref |
| NG8025 | Foreign components only support static attributes and property bindings. | class-binding、two-way |
| NG8026 | @content blocks are only valid as direct children of foreign components. | outside |
| NG8027 | Defining a @content (children) block with no parameters is unnecessary. Pass children as direct nested content of the foreign component instead. | children-block |
| NG8028 | A @content block with the name 'header' has already been defined for this component. | duplicate、duplicate-external |
| NG8029 | A @content block with the name 'header' conflicts with a property on the parent component. | prop-conflict |
| NG8029 | A foreign component cannot have both a 'children' property and child nodes. | children-conflict |
| NG8109 | NG8109: count is a function and should be invoked: count()}. Find more at https://v22.angular.dev/extended-diagnostics/NG8109 | signal-dom |
| TS2339 | Property 'nothing' does not exist on type 'TestCmp'. | type-unknown |
| TS500 | Error: Conflict: Element 'Counter' matches both an Angular directive and a foreign component. | directive-too |

## ここまでの呼び出し

- 👤 `<Card>@content (row; let item, i) {…} 本文</Card>` — テンプレート
  - `createContentBlock(block, visitor)` — r3\_content\_blocks.ts L16 — *名前と let の変数。NG5002*
  - `extractForeignImportsFromAst(expr)` — component/src/util.ts L213 — *NG1010*
  - `createForeignComponentMatcher(foreignImports)` — metadata/src/util.ts L366 — *名前 → \[meta\]*
    - `analyzeForeignComponentFeatures(template, matcher)` — component/src/foreign\_component.ts L51 — *8025〜8029*
    - `new R3TargetBinder(matcher, foreignMatcher).bind()` — t2\_binder.ts — *両方に当たれば Error（TS500）*
    - `TcbUnclaimedInputsOp` — typecheck/ops/scope.ts L584 — *式だけ型チェック、DOM スキーマは見ない*
  - `ingestForeignComponent()` — pipeline/src/ingest.ts L383 — *L408〜423 ブロックごとにビューと Content op*
  - `resolveForeignContent(job)` — phases/resolve\_foreign\_content.ts L16 — *TemplateOp と変数、props に ReadVariableExpr*
  - `generateVariables` ほか — phases/ — *作成の段にも親の文脈の変数（5bd00add071）*
  - `reify()` — phases/reify.ts L146 — *ng.foreignComponent / ng.foreignContent（instruction.ts L52・L65）*
  - 出力: `ɵɵdomTemplate` → `ɵɵforeignContent(Fn)(slot, constIndex)` → `ɵɵforeignComponent(slot, constIndex, () => props)` — 記録の named

## テストと直し方

### spec と it

| ファイル | describe / it | 行 | この章のどこ |
| --- | --- | --- | --- |
| compiler/test/render3/view/binding\_spec.ts | `should match foreign components by tag name`・`should throw an error when tag matches both directive and foreign component` | 1673・1688 | 3 節 |
| compiler/test/render3/r3\_template\_transform\_spec.ts | `@content blocks` の 7 つ | 3064〜3125 | 4 節（パーサ） |
| compiler-cli/test/ngtsc/template\_typecheck\_spec.ts | `foreign component template semantics` の 20 | 2236〜2768 | 4 節（8025〜8029、外のテンプレート） |
| compiler-cli/src/ngtsc/annotations/component/test/component\_spec.ts | `should populate foreignImports with ForeignComponents`・`should support import aliases in foreignImports`・`invalid foreignImports expressions` | 1047・1102・1159 | 2 節 |
| compiler-cli/src/ngtsc/typecheck/extended/test/checks/interpolated\_signal\_not\_invoked/…\_spec.ts | `should not produce a warning when a signal is not invoked in a property binding on a foreign component` | 356 | 3 節 |
| compiler-cli/test/compliance/test\_cases/…/standalone/foreign\_component.ts と .js・.local.js | TEST\_CASES.json の `should properly compile foreign component imports in a standalone component` | TEST\_CASES.json 76 | 5〜7 節 |

### 手元で走らせた結果

📄 `走らせたコマンド`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler/test/render3:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=foreign components|@content blocks"
pnpm bazel test //packages/compiler-cli/src/ngtsc/annotations/component/test:test --nocache_test_results \
  --test_output=all "--test_arg=--filter=foreignImports"
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc --nocache_test_results --test_output=all \
  "--test_arg=--filter=foreign component template semantics"
pnpm bazel test //packages/compiler-cli/test/compliance/full:full --nocache_test_results --test_output=all \
  "--test_arg=--filter=foreign component"
pnpm bazel test //packages/compiler-cli/test/compliance/local:local --nocache_test_results --test_output=all \
  "--test_arg=--filter=foreign component"
pnpm bazel test //packages/compiler-cli/test/compliance/linked:linked --nocache_test_results --test_output=all \
  "--test_arg=--filter=foreign component"
```

📄 `結果（2026-11-15、2 回目以降でビルド済み。PASSED の行を同じ行にまとめた）`

```
//packages/compiler/test/render3:test
Ran 8 of 499 specs
8 specs, 0 failures                                                       PASSED in 0.7s
//packages/compiler-cli/src/ngtsc/annotations/component/test:test
Ran 28 of 132 specs
28 specs, 0 failures                                                      PASSED in 0.9s
//packages/compiler-cli/test/ngtsc:ngtsc（shard 4 つ。4 つとも次の 2 行）
Ran 20 of 6694 specs
20 specs, 0 failures                                                      PASSED in 2.9s
//packages/compiler-cli/test/compliance/full:full（shard 2 つ）
Ran 0 of 616 specs / Ran 1 of 617 specs
1 spec, 0 failures                                                        PASSED in 1.2s
//packages/compiler-cli/test/compliance/local:local（shard 2 つ）
Ran 0 of 12 specs / Ran 1 of 13 specs
1 spec, 0 failures                                                        PASSED in 1.4s
//packages/compiler-cli/test/compliance/linked:linked（shard 2 つ）
Ran 0 of 589 specs / Ran 0 of 589 specs
0 specs, 0 failures                                                       PASSED in 1.0s
```

compiler-cli の spec は `runInEachFileSystem` で、同じ it を 4 つの作り物のファイルシステム（Native・OS/X・Unix・Windows）で走らせます。ngtsc は 4 つの shard の合計 80 で、`foreign component template semantics` の it 20 個（`grep -c` で 20）× 4 です。component の 28 は、名前に foreignImports を含む it 7 個 × 4 です。compliance は 1 つの TEST\_CASES の項目が 1 つの spec で、linked は 7 節の `compilationModeFilter` のとおり 0 です。compiler の 8 は、binding\_spec.ts の 1673 行目の it（名前に「foreign components」を含む）と `@content blocks` の 7 つです。1688 行目の it は名前が単数形の「foreign component」なので、この絞り込みに入りません。

### 直すとしたら

- 3 節の TS500 は、binder が投げる `Error` がそのまま ngc の内部エラーになっています。診断にするなら、ngtsc の解析の段（foreign\_component.ts の `visitElement`、88 行目）で、要素名が外のコンポーネントの表とディレクティブのセレクタの両方に当たるかを見る形があります。spec は template\_typecheck\_spec.ts の `foreign component template semantics` に足します。
- 7 節の部分コンパイルは、`ɵɵngDeclareComponent` に `foreignImports` を書き出す・リンカーが読む・または部分コンパイルで `foreignImports` を拒む、のどれかが必要です。どれにするかは「3p-only」の印の意味（[第 1 回](01-fgn-contract-history.md)）と合わせて読む必要があります。

## 聞かれそうな質問

**Q. 外のコンポーネントの props は型チェックされますか？**

束縛の式はされますが、外のコンポーネントの props の型とは照らされません。typecheck/ops/scope.ts の 584〜586 行目で、束縛はどのディレクティブも受け取らない入力として `TcbUnclaimedInputsOp` に積まれます。記録では `[value]="nothing"` が TS2339、props に `value: number` と型を書いた橋に string を渡す `type-props` は 0 件でした。

**Q. @content を @if の中に書けますか？**

書けません。検査の `currentParent` が `@if` の枝になるので（foreign\_component.ts の 92〜95 行目と同じ付け替えを `@if` でもする）、直下でないとして NG8026 です。外のコンポーネントそのものを `@if` の中に置くのは通り、作成の段に親の文脈の変数が出ます（6 節の記録）。

**Q. ɵɵforeignContent と ɵɵforeignContentFn は、どこで分かれますか？**

`@content` に `let` の変数があるかです。ingest.ts の 414〜416 行目で変数を子のビューの `contextVariables` に入れ、reify でそれが 1 つ以上なら instruction.ts の 71 行目の `parameterized` が true になります。名前の無い子はいつも変数が無いので `ɵɵforeignContent` です。

**Q. @content の名前は、どこで props の名前になりますか？**

resolve\_foreign\_content.ts の 71 行目、`target.props.set(op.propertyName, …)` です。props の `Map` に束縛と同じく 1 つの項目として入るので、同じ名前の束縛があると上書きになります。それを先に止めるのが NG8029（foreign\_component.ts の 320〜344 行目）です。

**Q. ライブラリ（部分コンパイル）で使えますか？**

記録では使えませんでした。`ɵɵngDeclareComponent` に `foreignImports` が無く、リンクの結果は `<Card>` というふつうの DOM の要素で、診断も出ません（7 節）。compliance の外のコンポーネントの例も、リンクのモードは対象から外しています。

## 読み終えて

- `foreignImports` は評価せず AST の形だけで読み（a19c02706fd）、照合は「書いた識別子 = 要素名」の表を、ngtsc の 3 か所（解析・binder・型チェック）とコンパイラの 1 か所で同じ形に作る
- 型チェックは束縛の式だけを見て、外の props の型とは照らさない。DOM のスキーマも見ない。NG8109 も出さない
- `@content` はパーサが受け、置き場所と名前は ngtsc の検査（8026〜8029）が見る。ディレクティブと両方に当たると TS500
- `resolve_foreign_content` が先頭の phase で `Content` op を `TemplateOp` と変数に替え、props に足す。`let` の変数があれば `ɵɵforeignContentFn`
- 制御フローの中では作成の段に親の文脈の変数が出る（5bd00add071）。部分コンパイルでは `foreignImports` が消え、ふつうの要素になる

---

← 前: [@content と後始末：Angular のビューを外へ渡す](04-fgn-content.md)  
次: [spec と PR を読む：foreign component を固めているテスト](06-fgn-tests-issues.md) →
