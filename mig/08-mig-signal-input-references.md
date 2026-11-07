[目次](../README.md) › [マイグレーションの内側](README.md) › 第 8 回 / 全 20 回

# 参照の書き換え：this.x を this.x() に

> TS の中の this.x、テンプレートの中の x、ホストバインディングの中の x を見つけて x() に変える仕組み（reference\_resolution・reference\_migration）。if (this.x) { this.x.foo } のように型の絞り込みに頼るコードを、flow\_analysis で調べてローカルの const に取り出す書き換え。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-signal-input-references)

---

`@Input() size` を `readonly size = input()` に変えると、`size` は値ではなく関数（`InputSignal`）になります。だから `this.size` も、テンプレートの `size` も、ホストバインディングの `size` も、全部 `size()` にしないと壊れます。この章では、その参照を**どうやって見つけ**（reference\_resolution）、**どう書き換えるか**（reference\_migration と pass 7・8）を行で追い、`if (this.x) { this.x.foo }` のように型の絞り込みに頼るコードを、TypeScript の制御フローのグラフ（flow\_analysis）を見てローカルの `const` に取り出す書き換えまでを読みます。

読む対象は `packages/core/schematics/migrations/signal-migration/src/` の `passes/reference_resolution/`・`passes/reference_migration/`・`passes/7_migrate_template_references.ts`・`passes/8_migrate_host_bindings.ts`・`flow_analysis/` と、`test/golden-test/` の入力と `golden.txt` です。

1. [1. 全体像](01-mig-overview.md)
2. [2. 入口と配布物](02-mig-entry-bundles.md)
3. [3. プログラムを作る](03-mig-program.md)
4. [4. Tsurge](04-mig-tsurge.md)
5. [5. 置き換え](05-mig-replacements.md)
6. [6. テンプレート](06-mig-templates.md)
7. [7. signal input の段階](07-mig-signal-input-passes.md)
8. **8. 参照の書き換え**（この章）
9. [9. 移行できない入力](09-mig-signal-input-incompatible.md)
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
> 参照を集めるのは pass 2、書き換えるのは pass 5・7・8・9 です（段の順番は[第 7 回](07-mig-signal-input-passes.md)の表）。書き込みや絞り込みのせいで「そもそも移行しない」と決まった入力は、参照も書き換えません。その判定は[第 9 回](09-mig-signal-input-incompatible.md)です。テンプレートを解析する部品（`parseTemplate` など）は[第 6 回](06-mig-templates.md)、型チェック用のコード（TCB）そのものは[型チェックのシリーズ](../typecheck/01-typecheck-overview.md)で読みます。

## 1. 参照の 4 つの種類

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/reference_kinds.ts` L23–57 （▶ の行: 23–27, 36, 38, 42, 47, 49, 51, 53）

```ts
23 ▶ export enum ReferenceKind {
24 ▶   InTemplate,
25 ▶   InHostBinding,
26 ▶   TsReference,
27 ▶   TsClassTypeReference,
28 │ }
29 │ 
30 │ /** Interface describing a template reference to a known field. */
31 │ export interface TemplateReference<D extends ClassFieldDescriptor> {
32 │   kind: ReferenceKind.InTemplate;
33 │   /** From where the reference is made. */
34 │   from: {
35 │     /** Template file containing the reference. */
36 ▶     templateFile: ProjectFile;
37 │     /** TypeScript file that references, or contains the template. */
38 ▶     originatingTsFile: ProjectFile;
39 │     /** HTML AST node that contains the reference. */
40 │     node: TmplAstNode;
41 │     /** Expression AST node that represents the reference. */
42 ▶     read: PropertyRead;
43 │     /**
44 │      * Expression AST sequentially visited to reach the given read.
45 │      * This follows top-down down ordering. The last element is the actual read.
46 │      */
47 ▶     readAstPath: AST[];
48 │     /** Whether the reference is part of an object shorthand expression. */
49 ▶     isObjectShorthandExpression: boolean;
50 │     /** Whether this reference is part of a likely-narrowing expression. */
51 ▶     isLikelyPartOfNarrowing: boolean;
52 │     /** Whether the reference is a write. E.g. two way binding, or assignment. */
53 ▶     isWrite: boolean;
54 │   };
55 │   /** Target field addressed by the reference. */
56 │   target: D;
57 │ }
```

23〜28 行目、参照は 4 種類です。テンプレートの中（`InTemplate`）、ホストバインディングの中（`InHostBinding`）、TS の中（`TsReference`）、クラスへの型の参照（`TsClassTypeReference`）。テンプレートの参照は、36 行目の「どのファイルを書き換えるか」（外部の `.html` ならそのファイル、インラインなら `.ts`）と、42 行目の式の AST の `PropertyRead`（`size` の読み出しを表すノード）を持ちます。47 行目の `readAstPath` は式の根から読み出しまでのノードの並びで、signal クエリの移行が `labels.toArray()` の形を見分けるのに使います（[第 10 回](10-mig-signal-queries.md)）。49・51・53 行目の 3 つの真偽値は、書き換えの形（省略形）と、移行できるかの判定（絞り込み・書き込み）に使います。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/reference_kinds.ts` L84–121 （▶ の行: 92, 94, 96, 113, 116, 118, 120）

```ts
 84 │ /** Interface describing a TypeScript reference to a known field. */
 85 │ export interface TsReference<D extends ClassFieldDescriptor> {
 86 │   kind: ReferenceKind.TsReference;
 87 │   /** From where the reference is made. */
 88 │   from: {
 89 │     /** File that contains the TypeScript reference. */
 90 │     file: ProjectFile;
 91 │     /** TypeScript AST node representing the reference. */
 92 ▶     node: ts.Identifier;
 93 │     /** Whether the reference is a write. */
 94 ▶     isWrite: boolean;
 95 │     /** Whether the reference is part of an element binding */
 96 ▶     isPartOfElementBinding: boolean;
 97 │   };
 98 │   /** Target field addressed by the reference. */
 99 │   target: D;
100 │ }
101 │ 
102 │ /**
103 │  * Interface describing a TypeScript `ts.Type` reference to a
104 │  * class containing known fields.
105 │  */
106 │ export interface TsClassTypeReference {
107 │   kind: ReferenceKind.TsClassTypeReference;
108 │   /** From where the reference is made. */
109 │   from: {
110 │     /** File that contains the TypeScript reference. */
111 │     file: ProjectFile;
112 │     /** TypeScript AST node representing the reference. */
113 ▶     node: ts.TypeReferenceNode;
114 │   };
115 │   /** Whether the reference is using `Partial<T>`. */
116 ▶   isPartialReference: boolean;
117 │   /** Whether the reference is part of a file using Catalyst. */
118 ▶   isPartOfCatalystFile: boolean;
119 │   /** Target class that contains at least one known field (e.g. inputs) */
120 ▶   target: ts.ClassDeclaration;
121 │ }
```

TS の参照は、92 行目の識別子（`this.size` の `size` の部分）が本体です。96 行目は `const {size} = this` のような分割代入の中の参照かどうか。型の参照は、ほかの 3 つと違って**入力ではなくクラス**を指します（120 行目）。

## 2. 1 回の巡回で 3 か所を探す

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/index.ts` L69–103 （▶ の行: 69, 74–75, 91）

```ts
 69 ▶   const visitor = (node: ts.Node) => {
 70 │     let lastTime = currentTimeInMs();
 71 │ 
 72 │     // Note: If there is no template type checker and resource loader, we aren't processing
 73 │     // an Angular program, and can skip template detection.
 74 ▶     if (ts.isClassDeclaration(node) && templateTypeChecker !== null && resourceLoader !== null) {
 75 ▶       identifyTemplateReferences(
 76 │         programInfo,
 77 │         node,
 78 │         reflector,
 79 │         checker,
 80 │         evaluator,
 81 │         templateTypeChecker,
 82 │         resourceLoader,
 83 │         programInfo.userOptions,
 84 │         result,
 85 │         knownFields,
 86 │         fieldNamesToConsiderForReferenceLookup,
 87 │       );
 88 │       perfCounters.template += (currentTimeInMs() - lastTime) / 1000;
 89 │       lastTime = currentTimeInMs();
 90 │ 
 91 ▶       identifyHostBindingReferences(
 92 │         node,
 93 │         programInfo,
 94 │         checker,
 95 │         reflector,
 96 │         result,
 97 │         knownFields,
 98 │         fieldNamesToConsiderForReferenceLookup,
 99 │       );
100 │ 
101 │       perfCounters.hostBindings += (currentTimeInMs() - lastTime) / 1000;
102 │       lastTime = currentTimeInMs();
103 │     }
```

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/index.ts` L105–143 （▶ の行: 109–110, 112, 131, 133）

```ts
105 │     lastTime = currentTimeInMs();
106 │ 
107 │     // find references, but do not capture input declarations itself.
108 │     if (
109 ▶       ts.isIdentifier(node) &&
110 ▶       !(isInputContainerNode(node.parent) && node.parent.name === node)
111 │     ) {
112 ▶       identifyPotentialTypeScriptReference(
113 │         node,
114 │         programInfo,
115 │         checker,
116 │         knownFields,
117 │         result,
118 │         fieldNamesToConsiderForReferenceLookup,
119 │         {
120 │           debugElComponentInstanceTracker,
121 │         },
122 │       );
123 │     }
124 │ 
125 │     perfCounters.tsReferences += (currentTimeInMs() - lastTime) / 1000;
126 │     lastTime = currentTimeInMs();
127 │     // Detect `Partial<T>` references.
128 │     // Those are relevant to be tracked as they may be updated in Catalyst to
129 │     // unwrap signal inputs. Commonly people use `Partial` in Catalyst to type
130 │     // some "component initial values".
131 ▶     const partialDirectiveInCatalyst = partialDirectiveCatalystTracker.detect(node);
132 │     if (partialDirectiveInCatalyst !== null) {
133 ▶       result.references.push({
134 │         kind: ReferenceKind.TsClassTypeReference,
135 │         from: {
136 │           file: projectFile(partialDirectiveInCatalyst.referenceNode.getSourceFile(), programInfo),
137 │           node: partialDirectiveInCatalyst.referenceNode,
138 │         },
139 │         isPartialReference: true,
140 │         isPartOfCatalystFile: true,
141 │         target: partialDirectiveInCatalyst.targetClass,
142 │       });
143 │     }
```

pass 2 が `GroupedTsAstVisitor` に登録するのが、この 69 行目の `visitor` です（第 7 回の 2 節）。TS の構文木のノード 1 つごとに呼ばれ、74 行目でクラスの宣言に当たったら、そのクラスのテンプレート（75 行目）とホストバインディング（91 行目）を調べます。109・110 行目、識別子に当たったら、入力の宣言そのものの名前でなければ TS の参照の候補として調べます（112 行目）。131〜143 行目は `Partial<MyComp>` という型の参照を集めますが、これは Google 社内のテスト道具（Catalyst）のファイルでだけ書き換えに使います（6 節）。

## 3. TS の参照：this.size

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/identify_ts_references.ts` L40–71 （▶ の行: 42–44, 54, 60, 66–67, 70）

```ts
40 │   // Skip all identifiers that never can point to a migrated field.
41 │   // TODO: Capture these assumptions and performance optimizations in the design doc.
42 ▶   if (
43 ▶     fieldNamesToConsiderForReferenceLookup !== null &&
44 ▶     !fieldNamesToConsiderForReferenceLookup.has(node.text)
45 │   ) {
46 │     return;
47 │   }
48 │ 
49 │   let target: ts.Symbol | undefined = undefined;
50 │ 
51 │   try {
52 │     // Resolve binding elements to their declaration symbol.
53 │     // Commonly inputs are accessed via object expansion. e.g. `const {input} = this;`.
54 ▶     if (ts.isBindingElement(node.parent)) {
55 │       // Skip binding elements that are using spread.
56 │       if (node.parent.dotDotDotToken !== undefined) {
57 │         return;
58 │       }
59 │ 
60 ▶       const bindingInfo = resolveBindingElement(node.parent);
61 │       if (bindingInfo === null) {
62 │         // The declaration could not be resolved. Skip analyzing this.
63 │         return;
64 │       }
65 │ 
66 ▶       const bindingType = checker.getTypeAtLocation(bindingInfo.pattern);
67 ▶       const resolved = lookupPropertyAccess(checker, bindingType, [bindingInfo.propertyName]);
68 │       target = resolved?.symbol;
69 │     } else {
70 ▶       target = checker.getSymbolAtLocation(node);
71 │     }
```

1. **42〜47 行目：名前だけで先に落とす**

   `fieldNamesToConsiderForReferenceLookup` は、pass 1 で見つけた入力の名前の一覧です（第 7 回の 2 節）。プログラムの全部の識別子で型を調べると遅いので、名前が一覧に無い識別子は型を調べずに帰ります。
2. **54〜68 行目：分割代入なら、型からたどる**

   `const {size} = this` の `size` は、`getSymbolAtLocation` だとローカル変数の記号になってしまいます。そこで 66 行目で右辺（`this`）の型を取り、67 行目でその型の `size` プロパティを探します。
3. **70 行目：ふつうは TypeScript に記号を聞く**

   `this.size` の `size` なら、TypeScript の型チェッカーがクラスのフィールドの記号を返します。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/identify_ts_references.ts` L103–125 （▶ の行: 103, 108, 110–113, 116, 121–122）

```ts
103 ▶   let targetInput = knownFields.attemptRetrieveDescriptorFromSymbol(target);
104 │   if (targetInput === null) {
105 │     return;
106 │   }
107 │ 
108 ▶   const access = unwrapParent(traverseAccess(node));
109 │   const accessParent = access.parent;
110 ▶   const isWriteReference =
111 ▶     ts.isBinaryExpression(accessParent) &&
112 ▶     accessParent.left === access &&
113 ▶     writeBinaryOperators.includes(accessParent.operatorToken.kind);
114 │ 
115 │   // track accesses from source files to known fields.
116 ▶   result.references.push({
117 │     kind: ReferenceKind.TsReference,
118 │     from: {
119 │       node,
120 │       file: projectFile(node.getSourceFile(), programInfo),
121 ▶       isWrite: isWriteReference,
122 ▶       isPartOfElementBinding: ts.isBindingElement(node.parent),
123 │     },
124 │     target: targetInput,
125 │   });
```

103 行目、記号から `KnownInputs` の入力を探します（記号の宣言のノードから鍵を作って引く。第 7 回の 4 節）。入力でなければ帰ります。108〜113 行目、`this.size = 1` や `(this.size) += 1` のように、その参照が代入の左側なら書き込みです（括弧やプロパティアクセスをほどいてから見る）。116〜125 行目で参照を記録します。書き込みはここでは記録だけで、入力に理由を付けるのは解析の段の最後です（[第 9 回](09-mig-signal-input-incompatible.md)）。

## 4. テンプレートの参照：TCB に聞く

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/identify_template_references.ts` L47–86 （▶ の行: 48, 52, 62, 69, 72, 78, 80, 85）

```ts
47 │   const template =
48 ▶     templateTypeChecker.getTemplate(node, OptimizeFor.WholeProgram) ??
49 │     // If there is no template registered in the TCB or compiler, the template may
50 │     // be skipped due to an explicit `jit: true` setting. We try to detect this case
51 │     // and parse the template manually.
52 ▶     extractTemplateWithoutCompilerAnalysis(
53 │       node,
54 │       checker,
55 │       reflector,
56 │       resourceLoader,
57 │       evaluator,
58 │       options,
59 │     );
60 │ 
61 │   if (template !== null) {
62 ▶     const visitor = new TemplateReferenceVisitor(
63 │       checker,
64 │       templateTypeChecker,
65 │       node,
66 │       knownFields,
67 │       fieldNamesToConsiderForReferenceLookup,
68 │     );
69 ▶     template.forEach((node) => node.visit(visitor));
70 │ 
71 │     for (const res of visitor.result) {
72 ▶       const templateFilePath = res.context.sourceSpan.start.file.url;
73 │ 
74 │       // Templates without an URL are non-mappable artifacts of e.g.
75 │       // string concatenated templates. See the `indirect` template
76 │       // source mapping concept in the compiler. We skip such references
77 │       // as those cannot be migrated, but print an error for now.
78 ▶       if (templateFilePath === '') {
79 │         // TODO: Incorporate a TODO potentially.
80 ▶         console.error(
81 │           `Found reference to field ${res.targetField.key} that cannot be ` +
82 │             `migrated because the template cannot be parsed with source map information ` +
83 │             `(in file: ${node.getSourceFile().fileName}).`,
84 │         );
85 ▶         continue;
86 │       }
```

1. **48 行目：コンパイラが解析したテンプレートの AST をもらう**

   `templateTypeChecker.getTemplate` は、ngtsc がコンポーネントを解析したときに作ったテンプレートの AST（`TmplAstNode` の配列）を返します。マイグレーションが自分でテンプレートを解析し直すのではありません。52〜59 行目は、`jit: true` のコンポーネントのようにコンパイラが解析しなかった場合だけ、自分で取り出して解析する逃げ道です。
2. **62〜69 行目：テンプレートの木を歩く訪問者**

   `TemplateReferenceVisitor` が要素・ブロック・バインディングを歩き、式が出てくるたびに下の式の訪問者に渡します。
3. **72〜86 行目：位置を元のファイルに戻せない参照は書き換えない**

   72 行目のテンプレートの URL が空なのは、`template: '<h3>' + '...'` のように文字列をつなげて作ったテンプレートです。どのファイルのどの位置かが分からないので、78〜86 行目で `console.error` を出して飛ばします。80 行目の文はゴールデンテストの出力にそのまま出ます（テストの節）。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/template_reference_visitor.ts` L288–311 （▶ の行: 288–289, 295, 297–298, 304–305, 308–309）

```ts
288 ▶   override visit(ast: AST, context: AST[]) {
289 ▶     super.visit(ast, [...context, ast]);
290 │   }
291 │ 
292 │   // Keep track when we are inside an object shorthand expression. This is
293 │   // necessary as we need to expand the shorthand to invoke a potential new signal.
294 │   // E.g. `{bla}` may be transformed to `{bla: bla()}`.
295 ▶   override visitLiteralMap(ast: LiteralMap, context: any) {
296 │     for (const [idx, key] of ast.keys.entries()) {
297 ▶       this.isInsideObjectShorthandExpression =
298 ▶         key.kind === 'property' && !!key.isShorthandInitialized;
299 │       (ast.values[idx] as AST).visit(this, context);
300 │       this.isInsideObjectShorthandExpression = false;
301 │     }
302 │   }
303 │ 
304 ▶   override visitPropertyRead(ast: PropertyRead, context: AST[]) {
305 ▶     this._inspectPropertyAccess(ast, context);
306 │     super.visitPropertyRead(ast, context);
307 │   }
308 ▶   override visitSafePropertyRead(ast: SafePropertyRead, context: AST[]) {
309 ▶     this._inspectPropertyAccess(ast, context);
310 │     super.visitPropertyRead(ast, context);
311 │   }
```

式の訪問者は、288・289 行目で「いま見ている式のノード」を `context` の後ろに足しながら降ります。これが 1 節の `readAstPath` になります。295〜302 行目、`{size}` のようなオブジェクトの省略形の中にいる間だけ旗を立てます。`{size}` を `{size()}` にはできないので、`{size: size()}` に広げる必要があるからです（5 節）。304〜311 行目、`size` も `user?.size` の読み出しも、`_inspectPropertyAccess` で調べます。そこでは名前の一覧で絞り、書き込みかどうかを決め（第 9 回）、まず TCB で、だめならクラスの型で、入力かどうかを確かめます。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/template_reference_visitor.ts` L362–397 （▶ の行: 363, 367–368, 372, 377–380, 386, 392）

```ts
362 │     // There might be no template type checker. E.g. if we check host bindings.
363 ▶     if (this.templateTypeChecker === null) {
364 │       return false;
365 │     }
366 │ 
367 ▶     const symbol = this.templateTypeChecker.getSymbolOfNode(ast, this.componentClass);
368 ▶     if (symbol?.kind !== SymbolKind.Expression) {
369 │       return false;
370 │     }
371 │ 
372 ▶     const tsSymbol = this.templateTypeChecker.getTsSymbolOfSymbol(symbol);
373 │     if (tsSymbol === null) {
374 │       return false;
375 │     }
376 │ 
377 ▶     // Dangerous: Type checking symbol retrieval is a totally different `ts.Program`,
378 ▶     // than the one where we analyzed `knownInputs`.
379 ▶     // --> Find the input via its input id.
380 ▶     const targetInput = this.knownFields.attemptRetrieveDescriptorFromSymbol(tsSymbol);
381 │ 
382 │     if (targetInput === null) {
383 │       return false;
384 │     }
385 │ 
386 ▶     this.detectedInputReferences.push({
387 │       targetNode: targetInput.node,
388 │       targetField: targetInput,
389 │       read: ast,
390 │       readAstPath: astPath,
391 │       context: this.activeTmplAstNode!,
392 ▶       isLikelyNarrowed: this._isPartOfNarrowingTernary(ast),
393 │       isObjectShorthandExpression: this.isInsideObjectShorthandExpression,
394 │       isWrite,
395 │     });
396 │ 
397 │     return true;
```

1. **367 行目：テンプレートの式のノードから、TCB の中の記号を聞く**

   `getSymbolOfNode` は言語サービスのホバーと同じ部品で（[ls-quick-info](../ls/09-ls-quick-info.md)）、TCB の中で `size` がどの TS の式になったかを調べます。`@for (item of items)` の `item` のようにテンプレートの変数を指していれば、`Expression` 以外の種類になるか、クラスのフィールドの記号にならないので、ここで落ちます。
2. **377〜380 行目：記号ではなく鍵で照らし合わせる**

   コメントのとおり、TCB の記号は型チェック用に作り直した別の `ts.Program` のものです。pass 1 が登録した入力のノードとは別のオブジェクトなので、記号の宣言から鍵を作って `KnownInputs` を引きます（第 7 回の 4 節の鍵が、ここでも効きます）。
3. **386〜395 行目：見つかったら記録する**

   392 行目の `isLikelyNarrowed` は三項演算子の中かどうかの判定です（第 9 回）。

TCB が無いとき（363 行目。ホストバインディングを調べるとき）や、TCB で見つからないときは、`_checkAccessViaOwningComponentClassType` に回ります。式の `a.b.size` をレシーバまでたどって `['a', 'b', 'size']` の道筋にし、コンポーネントのクラスの型から順にプロパティを探す、TCB を使わないやり方です。

### ホストバインディングの参照：文字列を自分で解析する

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_resolution/identify_host_references.ts` L127–161 （▶ の行: 127, 130, 132–134, 145, 147, 160–161）

```ts
127 ▶     const name = rawName.substring(1, rawName.length - 1);
128 │ 
129 │     let parsed: AST | undefined = undefined;
130 ▶     if (isEventBinding) {
131 │       const result: ParsedEvent[] = [];
132 ▶       parser.parseEvent(
133 ▶         name.substring(1, name.length - 1),
134 ▶         expression.text,
135 │         false,
136 │         sourceSpan,
137 │         sourceSpan,
138 │         [],
139 │         result,
140 │         sourceSpan,
141 │       );
142 │       parsed = result[0].handler;
143 │     } else {
144 │       const result: ParsedProperty[] = [];
145 ▶       parser.parsePropertyBinding(
146 │         name,
147 ▶         expression.text,
148 │         true,
149 │         /* isTwoWayBinding */ false,
150 │         sourceSpan,
151 │         0,
152 │         sourceSpan,
153 │         [],
154 │         result,
155 │         sourceSpan,
156 │       );
157 │       parsed = result[0].expression;
158 │     }
159 │ 
160 ▶     if (parsed != null) {
161 ▶       expressionResult.push(...expressionVisitor.checkTemplateExpression(expression, parsed));
```

`host: {'[class.big]': 'size > 10'}` の値はただの文字列なので、TCB はそこを参照として返しません。そこで `@angular/compiler` のバインディングのパーサーで自分で解析します。127 行目で `[...]` や `(...)` の括弧を外し、イベント（130〜142 行目）なら `parseEvent`、プロパティ（145〜157 行目）なら `parsePropertyBinding` で式の AST を作ります。160・161 行目、テンプレートと同じ式の訪問者に渡しますが、TCB の部品は `null` にしてあるので、4 節の最後の「クラスの型からたどる」やり方だけで入力を探します。解析の位置は、この引用の直前で作る偽のスパン（開始も終わりも 0 の `ParseSourceSpan`）のおかげで**文字列の中の 0 から**数えた位置になります。ファイルの中の位置に直すのは pass 8 です（5 節）。

> [!NOTE]
> **さらに深く**
>
> 133 行目は、127 行目ですでに括弧を外した `name` を、さらに前後 1 文字ずつ削って `parseEvent` に渡しています（`'(click)'` なら `'lic'`）。ここで要るのは 134 行目の式（`expression.text`）の AST だけで、イベントの名前は参照を探すのに使わないので、結果の参照は変わりません。

## 5. テンプレートとホストバインディングを書き換える：pass 7・8

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/7_migrate_template_references.ts` L23–56 （▶ の行: 25, 29, 33, 35–36, 42–44, 46, 48, 50–52）

```ts
23 │   for (const reference of references) {
24 │     // This pass only deals with HTML template references.
25 ▶     if (!isTemplateReference(reference)) {
26 │       continue;
27 │     }
28 │     // Skip references to incompatible inputs.
29 ▶     if (!host.shouldMigrateReferencesToField(reference.target)) {
30 │       continue;
31 │     }
32 │ 
33 ▶     const readEndPos = reference.from.read.sourceSpan.end;
34 │     // Skip duplicate references. E.g. if a template is shared.
35 ▶     const fileReferenceId = `${reference.from.templateFile.id}:${readEndPos}`;
36 ▶     if (seenFileReferences.has(fileReferenceId)) {
37 │       continue;
38 │     }
39 │     seenFileReferences.add(fileReferenceId);
40 │ 
41 │     // Expand shorthands like `{bla}` to `{bla: bla()}`.
42 ▶     const appendText = reference.from.isObjectShorthandExpression
43 ▶       ? `: ${reference.from.read.name}()`
44 ▶       : `()`;
45 │ 
46 ▶     host.replacements.push(
47 │       new Replacement(
48 ▶         reference.from.templateFile,
49 │         new TextUpdate({
50 ▶           position: readEndPos,
51 ▶           end: readEndPos,
52 ▶           toInsert: appendText,
53 │         }),
54 │       ),
55 │     );
56 │   }
```

1. **29〜31 行目：移行しない入力の参照は飛ばす**

   `shouldMigrateReferencesToField` は phase\_migrate.ts で作った判定で、「`KnownInputs` にあり、理由が付いていない」入力だけ真です（第 7 回の 5 節）。
2. **33 行目：読み出しの終わりの位置**

   `size` の `e` の後ろの位置です。`user.size` なら `user` ではなく `size` の後ろ、つまり入力の名前の直後になります。
3. **35〜39 行目：同じファイルの同じ位置は 1 回だけ**

   2 つのコンポーネントが同じ `templateUrl` を使うと、同じ `.html` の同じ位置の参照が 2 回集まります。位置は元のファイルで数えているので、ファイルの id と位置の組で重複を除きます。
4. **42〜55 行目：`()` か `: size()` を、その位置に足すだけ**

   50・51 行目、`position` と `end` が同じなので、消す文字は無く、足すだけの置き換えです。省略形の中なら `{size}` が `{size: size()}` になります。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/8_migrate_host_bindings.ts` L36–58 （▶ の行: 36–38, 40, 50, 56–57）

```ts
36 ▶     const bindingField = reference.from.hostPropertyNode;
37 ▶     const expressionOffset = bindingField.getStart() + 1; // account for quotes.
38 ▶     const readEndPos = expressionOffset + reference.from.read.sourceSpan.end;
39 │     // Skip duplicate references. Can happen if the host object is shared.
40 ▶     if (seenReferences.get(bindingField)?.has(readEndPos)) {
41 │       continue;
42 │     }
43 │     if (seenReferences.has(bindingField)) {
44 │       seenReferences.get(bindingField)!.add(readEndPos);
45 │     } else {
46 │       seenReferences.set(bindingField, new Set([readEndPos]));
47 │     }
48 │ 
49 │     // Expand shorthands like `{bla}` to `{bla: bla()}`.
50 ▶     const appendText = reference.from.isObjectShorthandExpression
51 │       ? `: ${reference.from.read.name}()`
52 │       : `()`;
53 │ 
54 │     host.replacements.push(
55 │       new Replacement(
56 ▶         projectFile(bindingField.getSourceFile(), info),
57 ▶         new TextUpdate({position: readEndPos, end: readEndPos, toInsert: appendText}),
58 │       ),
```

pass 8 は位置の計算だけが違います。37 行目、ホストのプロパティの値の文字列リテラル（`'size > 10'`）の開始位置に、引用符の 1 文字を足したところが式の 0 文字目です。38 行目でそこに 4 節の「文字列の中の位置」を足して、`.ts` ファイルの中の位置にします。

> [!NOTE]
> **ポイント**
>
> pass 7・8 と同じ処理が `passes/reference_migration/migrate_template_references.ts` と `migrate_host_bindings.ts` にもあり、signal クエリの移行はそちらを使います（第 10 回）。74638cab841（2026-05-08、best effort のときの書き込みの書き換えを直したコミット）は passes/ の 2 つだけを書き換えました。そのコミットで消えた分岐はもともと passes/ の側にしか無かったので、2026-11-03 の時点で 2 組の処理は変数名を除いて同じです（`diff` で確かめました）。直すときは 2 か所あることに気をつけます。

> **🧪 DEMO — このページの @angular/compiler 22.1.6 で、テンプレートの入力の後ろに () を入れる**
>
> 「書き換える」を押すと、テンプレートを `parseTemplate`（[ls-overview](../ls/01-ls-overview.md)のデモと同じオプション。マイグレーションはコンパイラが解析済みの AST を使うので、オプションは同じではありません）で解析し、入力の名前の `PropertyRead` を集めて、`{position: 読み出しの終わり, end: 同じ, toInsert: '()'}` の置き換えを作り、`mig-template.ts` の `applyTextUpdates` で当てます。これは pass 7 と `template_reference_visitor.ts` の**簡略版（移植）**です。本物は TCB の記号で「クラスのこの入力か」を決めますが、ここでは「暗黙のレシーバか `this` の読み出しで、名前が一覧にあり、テンプレートの変数（`@for` の `item`・`#ref`・`@let`）と同じ名前ではない」で決めます。書き込みと絞り込みで「移行しない」と決める判定（第 9 回）は、考え方だけを再現しています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/mig-signal-input-references)

## 6. TS の参照を書き換える：pass 5

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_migration/migrate_ts_references.ts` L56–95 （▶ の行: 62, 68, 72, 79–80, 82, 85, 89, 95）

```ts
56 │   for (const reference of references) {
57 │     // This pass only deals with TS references.
58 │     if (!isTsReference(reference)) {
59 │       continue;
60 │     }
61 │     // Skip references to incompatible inputs.
62 ▶     if (!host.shouldMigrateReferencesToField(reference.target)) {
63 │       continue;
64 │     }
65 │     // Never attempt to migrate write references.
66 │     // Those usually invalidate the target input most of the time, but in
67 │     // best-effort mode they are not.
68 ▶     if (reference.from.isWrite) {
69 │       continue;
70 │     }
71 │     // Skip duplicate references. E.g. in batching.
72 ▶     if (seenIdentifiers.has(reference.from.node)) {
73 │       continue;
74 │     }
75 │     seenIdentifiers.add(reference.from.node);
76 │ 
77 │     const targetKey = reference.target.key;
78 │ 
79 ▶     if (reference.from.isPartOfElementBinding) {
80 ▶       tsReferencesInBindingElements.add(reference.from.node as IdentifierOfBindingElement);
81 │     } else {
82 ▶       if (!tsReferencesWithNarrowing.has(targetKey)) {
83 │         tsReferencesWithNarrowing.set(targetKey, {accesses: []});
84 │       }
85 ▶       tsReferencesWithNarrowing.get(targetKey)!.accesses.push(reference.from.node);
86 │     }
87 │   }
88 │ 
89 ▶   migrateBindingElementInputReference(
90 │     tsReferencesInBindingElements,
91 │     info,
92 │     host.replacements,
93 │     host.printer,
94 │   );
95 ▶   migrateStandardTsReference(tsReferencesWithNarrowing, checker, info, host.replacements);
```

68〜70 行目、書き込みの参照は書き換えません（ふつうは書き込みがあれば入力ごと移行しませんが、best effort では移行されるので、ここで明示的に飛ばします。第 9 回）。79〜86 行目で、分割代入の中の参照と、ふつうの参照に分けます。ふつうの参照は**入力の鍵ごとに**`accesses` にまとめます。同じ入力への参照どうしで、絞り込みの関係を調べるためです。95 行目の `migrateStandardTsReference` がその本体です。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_migration/helpers/standard_reference.ts` L47–86 （▶ の行: 47, 52, 58, 60, 69, 71–72, 79–81）

```ts
47 ▶     for (const {id, originalNode, recommendedNode} of controlFlowResult) {
48 │       const sf = originalNode.getSourceFile();
49 │ 
50 │       // Original node is preserved. No narrowing, and hence not shared.
51 │       // Unwrap the signal directly.
52 ▶       if (recommendedNode === 'preserve') {
53 │         // Append `()` to unwrap the signal.
54 │         replacements.push(
55 │           new Replacement(
56 │             projectFile(sf, info),
57 │             new TextUpdate({
58 ▶               position: originalNode.getEnd(),
59 │               end: originalNode.getEnd(),
60 ▶               toInsert: '()',
61 │             }),
62 │           ),
63 │         );
64 │         continue;
65 │       }
66 │ 
67 │       // This reference is shared with a previous reference. Replace the access
68 │       // with the temporary variable.
69 ▶       if (typeof recommendedNode === 'number') {
70 │         // Extract the shared field name.
71 ▶         const toInsert = idToSharedField.get(recommendedNode);
72 ▶         const replaceNode = traverseAccess(originalNode);
73 │ 
74 │         assert(toInsert, 'no shared variable yet available');
75 │         replacements.push(
76 │           new Replacement(
77 │             projectFile(sf, info),
78 │             new TextUpdate({
79 ▶               position: replaceNode.getStart(),
80 ▶               end: replaceNode.getEnd(),
81 ▶               toInsert,
82 │             }),
83 │           ),
84 │         );
85 │         continue;
86 │       }
```

flow\_analysis（7 節）は、参照 1 つずつに `recommendedNode` を付けて返します。値は 3 通りです。52〜65 行目の `'preserve'`（絞り込みの相手がいない）なら、識別子の終わりに `()` を足すだけ。69〜86 行目の数（相手の参照の番号）なら、72 行目で `this.size` の全体（`traverseAccess` は識別子からプロパティアクセスの外側へ上がる）を、相手が作った一時変数の名前で置き換えます。3 つ目（ブロックやクラス）は「ここに一時変数を作れ」という指示で、下の引用です。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_migration/helpers/standard_reference.ts` L95–117 （▶ の行: 97–99, 104–105, 109–111, 114）

```ts
 95 │       let parent = originalNode.parent;
 96 │       let referenceNodeInBlock: ts.Node = originalNode;
 97 ▶       while (parent !== recommendedNode) {
 98 ▶         referenceNodeInBlock = parent;
 99 ▶         parent = parent.parent;
100 │       }
101 │ 
102 │       const replaceNode = traverseAccess(originalNode);
103 │       const filePath = projectFile(sf, info);
104 ▶       const initializer = `${replaceNode.getText()}()`;
105 ▶       const fieldName = nameGenerator.generate(originalNode.text, referenceNodeInBlock);
106 │ 
107 │       let sharedValueAccessExpr: string;
108 │       let temporaryVariableStr: string;
109 ▶       if (ts.isClassLike(recommendedNode)) {
110 ▶         sharedValueAccessExpr = `this.${fieldName}`;
111 ▶         temporaryVariableStr = `private readonly ${fieldName} = ${initializer};`;
112 │       } else {
113 │         sharedValueAccessExpr = fieldName;
114 ▶         temporaryVariableStr = `const ${fieldName} = ${initializer};`;
115 │       }
116 │ 
117 │       idToSharedField.set(id, sharedValueAccessExpr);
```

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_migration/helpers/standard_reference.ts` L143–167 （▶ の行: 144, 150, 152, 162–164）

```ts
143 │       } else {
144 ▶         const leadingSpace = ts.getLineAndCharacterOfPosition(sf, referenceNodeInBlock.getStart());
145 │ 
146 │         replacements.push(
147 │           new Replacement(
148 │             filePath,
149 │             new TextUpdate({
150 ▶               position: referenceNodeInBlock.getStart(),
151 │               end: referenceNodeInBlock.getStart(),
152 ▶               toInsert: `${temporaryVariableStr}\n${' '.repeat(leadingSpace.character)}`,
153 │             }),
154 │           ),
155 │         );
156 │       }
157 │ 
158 │       replacements.push(
159 │         new Replacement(
160 │           projectFile(sf, info),
161 │           new TextUpdate({
162 ▶             position: replaceNode.getStart(),
163 ▶             end: replaceNode.getEnd(),
164 ▶             toInsert: sharedValueAccessExpr,
165 │           }),
166 │         ),
167 │       );
```

1. **95〜100 行目：差し込む文の位置を決める**

   参照から親へ上がり、指示されたブロックの直下の文（`referenceNodeInBlock`）を見つけます。一時変数はその文の直前に入ります。
2. **104・105 行目：初期化の式と名前**

   初期化は `this.size()`。名前は識別子の名前（`size`）で、すでに同じ名前があれば `UniqueNamesGenerator` が `Value` などを付けます。
3. **109〜115 行目：クラスの直下なら private readonly のフィールド、それ以外は const**

   クラスのフィールドの初期化式（`test2 = this.size ? ... : ...`）では `const` を書けないので、フィールドを 1 つ足して `this.sizeValue` で読みます。
4. **144〜155 行目と 158〜167 行目：文を差し込み、元の参照を変数で置き換える**

   152 行目、元の文の字下げ（行の頭からの文字数）をそのまま付けて差し込むので、字下げが崩れません。

## 7. flow\_analysis：どの参照どうしを 1 つにまとめるか

TypeScript は `if (this.size) { this.size.toFixed() }` の 2 つ目の `this.size` を「undefined ではない」と**絞り込み**ます。ところが `this.size()` は関数の呼び出しなので、2 回呼ぶと 2 つ目は絞り込まれず、型エラーになります。そこで 1 回だけ呼んで `const size = this.size()` にし、両方をその変数で読む必要があります。どの参照どうしが絞り込みでつながっているかを、TypeScript 自身の制御フローのグラフ（flow node）を読んで決めるのが `flow_analysis/` です。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/flow_analysis/flow_containers.ts` L15–27 （▶ の行: 15, 17–20, 25–26）

```ts
15 ▶ export function isControlFlowBoundary(node: ts.Node): boolean {
16 │   return (
17 ▶     (ts.isFunctionLike(node) && !getImmediatelyInvokedFunctionExpression(node)) ||
18 ▶     node.kind === ts.SyntaxKind.ModuleBlock ||
19 ▶     node.kind === ts.SyntaxKind.SourceFile ||
20 ▶     node.kind === ts.SyntaxKind.PropertyDeclaration
21 │   );
22 │ }
23 │ 
24 │ /** Determines the current flow container of a given node. */
25 ▶ export function getControlFlowContainer(node: ts.Node): ts.Node {
26 ▶   return ts.findAncestor(node.parent, (node) => isControlFlowBoundary(node))!;
27 │ }
```

絞り込みは関数の境目を越えないので、まず参照ごとに「制御フローの入れ物」（container）を決めます。17〜20 行目、関数（すぐ呼ぶ関数式を除く）、モジュール、ファイル、**クラスのフィールドの宣言**が境目です。26 行目、参照の親から上へ、最初に当たった境目がその参照の入れ物です。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/flow_analysis/index.ts` L95–133 （▶ の行: 96–97, 103, 107, 111, 113, 120, 128–129）

```ts
 95 │   // Prepare easy lookups for reference nodes to flow info.
 96 ▶   for (const [idx, entry] of entries.entries()) {
 97 ▶     const flowContainer = getControlFlowContainer(entry);
 98 │     referenceToMetadata.set(entry, {
 99 │       flowContainer,
100 │       resultIndex: idx,
101 │     });
102 │ 
103 ▶     result.push({
104 │       flowContainer,
105 │       id: idx,
106 │       originalNode: entry,
107 ▶       recommendedNode: 'preserve',
108 │     });
109 │   }
110 │ 
111 ▶   for (const entry of entries) {
112 │     const {flowContainer, resultIndex} = referenceToMetadata.get(entry)!;
113 ▶     const flowPathInterestingNodes = traverseFlowForInterestingNodes(getFlowNode(entry)!);
114 │ 
115 │     assert(
116 │       flowContainer !== null && flowPathInterestingNodes !== null,
117 │       'Expected a flow container to exist.',
118 │     );
119 │ 
120 ▶     const narrowPartners = getAllMatchingReferencesInFlowPath(
121 │       flowPathInterestingNodes,
122 │       entry,
123 │       referenceToMetadata,
124 │       flowContainer,
125 │       checker,
126 │     );
127 │ 
128 ▶     if (narrowPartners.length !== 0) {
129 ▶       connectSharedReferences(result, narrowPartners, resultIndex);
130 │     }
131 │   }
132 │ 
133 │   return result;
```

1. **96〜109 行目：全部 'preserve' から始める**

   参照の番号は `accesses` の中の順番（`idx`）です。
2. **113 行目：その参照から、制御フローを逆向きにたどる**

   `getFlowNode(entry)` は TypeScript が束縛（binder）の段で識別子に付けた `flowNode` を読みます。そこから「この位置に来るまでに通りうる条件・代入・呼び出し」を逆向きに集めます（下の引用）。
3. **120〜130 行目：集めたノードの中に、同じ入力の参照があるか**

   同じ入れ物の中で、同じレシーバの同じ名前の参照（`this.size` と `this.size`。`other.size` は別）があれば「相手」です。相手がいれば、それらをつなぎます。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/flow_analysis/flow_node_traversal.ts` L41–71 （▶ の行: 41, 49, 51, 60, 64–65, 67–68, 71）

```ts
41 ▶   for (const flow of queue) {
42 │     if (++flowDepth === 2000) {
43 │       // We have made 2000 recursive invocations. To avoid overflowing the call stack we report an
44 │       // error and disable further control flow analysis in the containing function or module body.
45 │       return interestingNodes;
46 │     }
47 │ 
48 │     const flags = flow.flags;
49 ▶     if (flags & FlowFlags.Assignment) {
50 │       const assignment = flow as FlowAssignment;
51 ▶       queue.add(assignment.antecedent);
52 │ 
53 │       if (ts.isVariableDeclaration(assignment.node)) {
54 │         interestingNodes.push(assignment.node.name);
55 │       } else if (ts.isBindingElement(assignment.node)) {
56 │         interestingNodes.push(assignment.node.name);
57 │       } else {
58 │         interestingNodes.push(assignment.node);
59 │       }
60 ▶     } else if (flags & FlowFlags.Call) {
61 │       queue.add((flow as FlowCall).antecedent);
62 │       // Arguments can be narrowed using `FlowCall`s.
63 │       // See: node_modules/typescript/stable/src/compiler/checker.ts;l=28786-28810
64 ▶       interestingNodes.push(...(flow as FlowCall).node.arguments);
65 ▶     } else if (flags & FlowFlags.Condition) {
66 │       queue.add((flow as FlowCondition).antecedent);
67 ▶       interestingNodes.push((flow as FlowCondition).node);
68 ▶     } else if (flags & FlowFlags.SwitchClause) {
69 │       queue.add((flow as FlowSwitchClause).antecedent);
70 │       // The switch expression can be narrowed, so it's an interesting node.
71 ▶       interestingNodes.push((flow as FlowSwitchClause).node.switchStatement.expression);
```

41 行目、`Set` を待ち行列として使い、たどった flow node を後ろに足しながら回ります（`Set` なので同じノードは 1 回だけ）。代入（49 行目）、関数の呼び出しの引数（60〜64 行目）、`if` などの条件（65〜67 行目）、`switch` の式（68〜71 行目）が「絞り込みに関わりうるノード」として集められます。flow node の型は TypeScript が公開していない内部のもので、`flow_node_internals.ts` に形を書き写して使っています。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/flow_analysis/index.ts` L175–213 （▶ の行: 177, 179, 184, 186, 190–191, 203–204, 213）

```ts
175 │   const seenBlocks = new Set<InsertionCommonAncestor>();
176 │   let highestBlock: InsertionCommonAncestor | null = null;
177 ▶   for (let i = min; i <= max; i++) {
178 │     // Different flow container captured sequentially in result. Ignore.
179 ▶     if (result[i].flowContainer !== refFlowContainer) {
180 │       continue;
181 │     }
182 │ 
183 │     // Iterate up the block, find the highest block within the flow container.
184 ▶     let current: ts.Node = result[i].originalNode.parent;
185 │     while (current !== undefined) {
186 ▶       if (isPotentialInsertionAncestor(current)) {
187 │         // If we saw this block already, it is a common ancestor from another
188 │         // partner. Check if it would be higher than the current highest block;
189 │         // and choose it accordingly.
190 ▶         if (seenBlocks.has(current)) {
191 ▶           if (highestBlock === null || current.getStart() < highestBlock.getStart()) {
192 │             highestBlock = current;
193 │           }
194 │           break;
195 │         }
196 │ 
197 │         seenBlocks.add(current);
198 │       }
199 │ 
200 │       current = current.parent;
201 │     }
202 │ 
203 ▶     if (i !== earliestPartnerId) {
204 ▶       result[i].recommendedNode = earliestPartnerId;
205 │     }
206 │   }
207 │ 
208 │   if (!highestBlock) {
209 │     console.error(earliestPartnerId, refId, refFlowContainer.getText(), seenBlocks);
210 │   }
211 │ 
212 │   assert(highestBlock, 'Expected a block anchor to be found');
213 ▶   result[earliestPartnerId].recommendedNode = highestBlock;
```

つなぐときは、いちばん前にある相手（earliest partner）を「一時変数を作る係」にし、それより後ろで同じ入れ物の参照を全部、その係の番号に向けます（203〜205 行目）。184〜201 行目で、それぞれの参照から上へブロック・アロー関数・クラス・ファイルをたどり、2 つ目に同じブロックに出会ったら「共通の祖先」として、いちばん外側のものを選びます。213 行目、係の参照の `recommendedNode` がそのブロックになり、6 節の 95〜117 行目がそこに一時変数を作ります。

### ゴールデンの例：flow\_cases.ts

📄 `angular/packages/core/schematics/migrations/signal-migration/test/golden-test/flow_cases.ts` L1–17 （▶ の行: 10–11, 15–16）

```ts
 1 │ // tslint:disable
 2 │ 
 3 │ import {Input} from '@angular/core';
 4 │ 
 5 │ class Test {
 6 │   @Input() maxCellsPerRow = 5;
 7 │   @Input() maxCellsPerRow2 = 5;
 8 │ 
 9 │   private test(arr: string[]) {
10 ▶     for (let i = 0; i < arr.length; i += this.maxCellsPerRow) {
11 ▶       console.log(this.maxCellsPerRow);
12 │     }
13 │   }
14 │ 
15 ▶   protected readonly test2 = this.maxCellsPerRow ? this.maxCellsPerRow === 3 : false;
16 ▶   protected readonly test3 = this.maxCellsPerRow2 === 3 ? true : false;
17 │ }
```

📄 `angular/packages/core/schematics/migrations/signal-migration/test/golden.txt` L369–389 （▶ の行: 380–382, 386–388）

```
369 │ @@@@@@ flow_cases.ts @@@@@@
370 │ 
371 │ // tslint:disable
372 │ 
373 │ import {input} from '@angular/core';
374 │ 
375 │ class Test {
376 │   readonly maxCellsPerRow = input(5);
377 │   readonly maxCellsPerRow2 = input(5);
378 │ 
379 │   private test(arr: string[]) {
380 ▶     const maxCellsPerRow = this.maxCellsPerRow();
381 ▶     for (let i = 0; i < arr.length; i += maxCellsPerRow) {
382 ▶       console.log(maxCellsPerRow);
383 │     }
384 │   }
385 │ 
386 ▶   private readonly maxCellsPerRowValue = this.maxCellsPerRow();
387 ▶   protected readonly test2 = this.maxCellsPerRowValue ? this.maxCellsPerRowValue === 3 : false;
388 ▶   protected readonly test3 = this.maxCellsPerRow2() === 3 ? true : false;
389 │ }
```

1. **入力の 10・11 行目 → 出力の 380〜382 行目：for の中の 2 つが 1 つの const に**

   11 行目の参照から逆向きにたどると、ループの先頭を通って 10 行目の増分の代入（`i += this.maxCellsPerRow`）に当たります。そこに同じ参照があるので相手です。共通の祖先はメソッドの本体のブロックなので、その直下の文（`for` 文）の前に `const maxCellsPerRow = this.maxCellsPerRow();` が入ります。
2. **入力の 15 行目 → 出力の 386・387 行目：フィールドの初期化式ならフィールドを足す**

   条件（`this.maxCellsPerRow ?`）と真の側の参照が相手です。入れ物はフィールドの宣言、共通の祖先はクラスなので、6 節の 109〜111 行目の分岐で `private readonly maxCellsPerRowValue` が足されます（`maxCellsPerRow` はクラスの入力の名前とぶつかるので `Value` が付く）。
3. **入力の 16 行目 → 出力の 388 行目：相手がいなければそのまま ()**

   `maxCellsPerRow2` は 1 回しか読まれないので `'preserve'` になり、`this.maxCellsPerRow2()` だけです。

## 8. 型の参照：pass 9

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/reference_migration/migrate_ts_type_references.ts` L46–80 （▶ の行: 46, 53–54, 59, 61, 69, 71, 78）

```ts
46 ▶     if (reference.isPartialReference && reference.isPartOfCatalystFile) {
47 │       assert(reference.from.node.typeArguments, 'Expected type arguments for partial reference.');
48 │       assert(reference.from.node.typeArguments.length === 1, 'Expected an argument for reference.');
49 │ 
50 │       const firstArg = reference.from.node.typeArguments[0];
51 │       const sf = firstArg.getSourceFile();
52 │       // Naive detection of the import. Sufficient for this test file migration.
53 ▶       const catalystImport = sf.text.includes(
54 ▶         'google3/javascript/angular2/testing/catalyst/fake_async',
55 │       )
56 │         ? 'google3/javascript/angular2/testing/catalyst/fake_async'
57 │         : 'google3/javascript/angular2/testing/catalyst/async';
58 │ 
59 ▶       const unwrapImportExpr = importManager.addImport({
60 │         exportModuleSpecifier: catalystImport,
61 ▶         exportSymbolName: 'UnwrapSignalInputs',
62 │         requestedFile: sf,
63 │       });
64 │ 
65 │       host.replacements.push(
66 │         new Replacement(
67 │           projectFile(sf, info),
68 │           new TextUpdate({
69 ▶             position: firstArg.getStart(),
70 │             end: firstArg.getStart(),
71 ▶             toInsert: `${host.printer.printNode(ts.EmitHint.Unspecified, unwrapImportExpr, sf)}<`,
72 │           }),
73 │         ),
74 │       );
75 │       host.replacements.push(
76 │         new Replacement(
77 │           projectFile(sf, info),
78 ▶           new TextUpdate({position: firstArg.getEnd(), end: firstArg.getEnd(), toInsert: '>'}),
79 │         ),
80 │       );
```

46 行目、書き換えるのは `Partial<MyComp>` の参照で、しかも Catalyst（Google 社内のテスト道具）のファイルのときだけです。53〜57 行目の import の先も `google3/...` です。59〜63 行目で `UnwrapSignalInputs` を import し、69〜80 行目で `Partial<UnwrapSignalInputs<MyComp>>` のように型の引数を包みます。`ng generate` で使う普通のプロジェクトでは、この段が書き換えるものは出てきません。

### ここまでの呼び出しを 1 本に

- `pass2_IdentifySourceFileReferences()` — passes/2\_find\_source\_file\_references.ts — *訪問関数を登録*
  - `createFindAllSourceFileReferencesVisitor().visitor` — passes/reference\_resolution/index.ts
    - `identifyTemplateReferences()` — identify\_template\_references.ts — *getTemplate → TemplateReferenceVisitor*
      - `TemplateExpressionReferenceVisitor._checkAccessViaTemplateTypeCheckBlock()` — template\_reference\_visitor.ts — *TCB の記号 → 鍵*
    - `identifyHostBindingReferences()` — identify\_host\_references.ts — *makeBindingParser で解析*
    - `identifyPotentialTypeScriptReference()` — identify\_ts\_references.ts — *getSymbolAtLocation → 鍵*
- `pass5__migrateTypeScriptReferences()` — passes/5\_migrate\_ts\_references.ts
  - `migrateStandardTsReference()` — reference\_migration/helpers/standard\_reference.ts
    - `analyzeControlFlow()` — flow\_analysis/index.ts — *TS の flow node を逆にたどる*
- `pass7__migrateTemplateReferences()` — passes/7\_migrate\_template\_references.ts — *位置に () を足す*
- `pass8__migrateHostBindings()` — passes/8\_migrate\_host\_bindings.ts — *文字列の開始 + 1 から数える*
- `pass9__migrateTypeScriptTypeReferences()` — passes/9\_migrate\_ts\_type\_references.ts — *Catalyst だけ*

## テストと直し方

参照の書き換えを確かめている中心は、**ゴールデンテスト**（入力のファイルを全部移行して、結果を 1 つのテキスト `golden.txt` と丸ごと比べるテスト）です。入力は `test/golden-test/` の 64 のファイル（`.ts` と `.html`）で、ターゲットは `//packages/core/schematics/migrations/signal-migration/test:test`。第 7 回の 6 節の最後の CLI に `--insert-todos` を付けて走らせ、`golden.txt` と 1 文字でも違えば失敗します。比べる仕組みと、ゴールデンの更新の仕方は[第 19 回](19-mig-testing.md)です。golden.txt の中で、ファイルは `@@@@@@ ファイル名 @@@@@@` の行で区切られています（flow\_cases.ts は 369 行目から）。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/schematics/migrations/signal-migration/test:test \
  --nocache_test_results --test_output=all
```

📄 `出力（2026-11-03 に実行。抜粋）`

```
==================== Test output for //packages/core/schematics/migrations/signal-migration/test:test:
Running test in directory: /var/folders/.../ng-integration-testmkwUAh/test-sandbox
.../golden-test/transform_no_explicit_types.ts: Error: FatalDiagnosticError: Code: 1010, Message: Input transform function first parameter must have a type
  Value could not be determined statically.
Found reference to field ../../../T/ng-integration-testmkwUAh/test-sandbox/golden-test/template_concat_string.ts@@WithConcatTemplate@@bla that cannot be migrated because the template cannot be parsed with source map information (in file: .../golden-test/template_concat_string.ts).
Successfully ran all commands in test directory: ...
INFO: Elapsed time: 1.208s, Critical Path: 1.00s
//packages/core/schematics/migrations/signal-migration/test:test         PASSED in 0.9s
```

1. **結果：PASSED、0.9 秒**

   jasmine ではないので `--test_arg=--filter=` は使えず、件数も出ません。成功の印は「Successfully ran all commands」と PASSED です。出力の途中に 2 つのエラー文が出ますが、どちらもわざと置いた入力で、ゴールデンもその結果を期待しています。1 つ目は型の無い `transform` の入力（transform\_no\_explicit\_types.ts。解析できないので移行しない）、2 つ目が 4 節の 80 行目の文です。
2. **2 つ目のエラー文の入力と、ゴールデンの結果**

   下の 2 つの引用です。

📄 `angular/packages/core/schematics/migrations/signal-migration/test/golden-test/template_concat_string.ts` L1–10 （▶ の行: 6, 9）

```ts
 1 │ // tslint:disable
 2 │ 
 3 │ import {Component, Input} from '@angular/core';
 4 │ 
 5 │ @Component({
 6 ▶   template: '<h3>' + '{{bla}}' + '</h3>',
 7 │ })
 8 │ export class WithConcatTemplate {
 9 ▶   @Input() bla = true;
10 │ }
```

📄 `angular/packages/core/schematics/migrations/signal-migration/test/golden.txt` L1203–1214 （▶ の行: 1207, 1210, 1213）

```
1203 │ @@@@@@ template_concat_string.ts @@@@@@
1204 │ 
1205 │ // tslint:disable
1206 │ 
1207 ▶ import {Component, input} from '@angular/core';
1208 │ 
1209 │ @Component({
1210 ▶   template: '<h3>' + '{{bla}}' + '</h3>',
1211 │ })
1212 │ export class WithConcatTemplate {
1213 ▶   readonly bla = input(true);
1214 │ }
```

> [!WARNING]
> **ハマりどころ**
>
> 入力の 6 行目は文字列をつなげたテンプレートで、4 節の 78〜86 行目のとおり `{{bla}}` の参照は記録されずに飛ばされます。ところが**入力の宣言は飛ばされません**。参照を記録しなかったので、どの理由も付かず、golden.txt の 1213 行目で `readonly bla = input(true)` に変わり（1207 行目で `Input` の import も消える）、1210 行目のテンプレートは `{{bla}}` のままです。移行後のテンプレートは signal を呼ばずに補間するので、表示されるのは値ではなく signal の関数を文字列にしたものです。79 行目の `TODO: Incorporate a TODO potentially.` のとおり、作者もここを残りの作業と書いています。ゴールデンがこの結果を固定しているので、直すならゴールデンも書き直すことになります。2026-11-03 の時点で、これを名指しした issue は `gh search issues` で見つかりませんでした。

1. **直すとしたらどこか**

   参照を見つける側なら `passes/reference_resolution/` の `identify_ts_references.ts`（TS）・`identify_template_references.ts` と `template_reference_visitor.ts`（テンプレート）・`identify_host_references.ts`（ホスト）。書き換える側なら `passes/7_migrate_template_references.ts`・`8_migrate_host_bindings.ts`（と、signal クエリが使う `reference_migration/` の同じもの）、TS の一時変数なら `reference_migration/helpers/standard_reference.ts` と `flow_analysis/index.ts`。
2. **どこに spec を足すか**

   `test/golden-test/` に入力のファイルを 1 つ足し、`golden.txt`（best effort の結果は `golden_best_effort.txt`）に期待する出力を足します。入力のファイルは両方のゴールデンに出るので、2 つとも更新が要ります。1 つの入力の結果だけを細かく確かめたいときは、第 7 回の migration\_spec.ts（`runTsurgeMigration`）の形で it を足します。
3. **関係する issue と PR**

   テンプレートの中の signal の絞り込みに対応する PR #55456（コードのコメントが指している PR）は、2025-02-27 にマージされずに閉じています。なのでテンプレートで絞り込みに使われる入力は、いまも移行されません（第 9 回）。best effort の書き込みの書き換えは 74638cab841 で直りました（第 9 回）。issue の読み方は[第 20 回](20-mig-issues.md)です。本家に PR を出すことはこのシリーズでは勧めません。

## 聞かれそうな質問

**Q. テンプレートの `size` がクラスの入力なのか、`@for` の変数なのかは、どうやって区別していますか？**

TCB に聞いています。template\_reference\_visitor.ts の 367 行目の `getSymbolOfNode` が、テンプレートの式のノードが TCB の中でどの TS の式になったかを返し、372 行目でその TS の記号を取り、380 行目で鍵を作って `KnownInputs` を引きます。テンプレートの変数なら入力の鍵にならないので、ここで落ちます。名前が同じでも区別できるのは、名前ではなく記号で比べているからです。

**Q. テンプレートの書き換えは、なぜ文字列の後ろに `()` を足すだけでよいのですか？**

`size` も `user.size` も `user?.size` も、読み出しの終わりの直後に `()` を足せば signal の呼び出しになるからです。7\_migrate\_template\_references.ts の 33 行目で読み出しの終わりの位置を取り、50・51 行目の `position` と `end` を同じにして足すだけの置き換えにします。例外は省略形の `{size}` で、42〜44 行目で `: size()` を足して `{size: size()}` にします。

**Q. `if (this.x) { this.x.foo }` は、どう書き換わりますか？**

`const x = this.x(); if (x) { x.foo }` になります。flow\_analysis/index.ts の 113 行目で 2 つ目の参照から制御フローを逆にたどり、`if` の条件の参照を相手として見つけ、128〜130 行目でつなぎます。いちばん前の参照が一時変数を作る係になり、standard\_reference.ts の 104・114 行目で `const x = this.x();` を作り、158〜167 行目で両方の参照をその名前に置き換えます。golden.txt の 380〜382 行目が for 文での実例です。

**Q. ホストバインディングの位置はどう数えていますか？**

2 段です。identify\_host\_references.ts で解析するときに開始も終わりも 0 の偽のスパンを渡すので、式の位置は「文字列の中の 0 から」になります。pass 8 の 37 行目で文字列リテラルの開始位置 + 1（引用符の分）を取り、38 行目でそれに足して、ファイルの中の位置にします。

**Q. 文字列をつなげて作ったテンプレートの入力はどうなりますか？**

宣言は `input()` に変わるのに、テンプレートの参照は書き換わりません。identify\_template\_references.ts の 78〜86 行目で参照を記録せずに飛ばすので、入力に理由も付かないからです。golden.txt の 1210・1213 行目がその結果を期待値として固定しています。移行したあとに手で `()` を足す必要があります。

## 読み終えて

- 参照は 4 種類（テンプレート・ホスト・TS・型）。pass 2 の 1 回の巡回で全部集める。
- テンプレートの参照は TCB の記号で、TS の参照は型チェッカーの記号で決め、どちらも記号から鍵を作って `KnownInputs` を引く。ホストバインディングは文字列を自分で解析してクラスの型からたどる。
- テンプレートとホストの書き換えは、読み出しの終わりに `()` を足すだけ（省略形は `: x()`）。同じ位置は 1 回。
- TS の参照は、TypeScript の flow node を逆にたどって絞り込みの相手を探し、相手がいれば 1 つの `const`（クラスの直下なら private readonly のフィールド）にまとめる。
- 文字列をつなげたテンプレートの参照は書き換わらないのに、入力は移行される。ゴールデンがその結果を固定している。

---

← 前: [signal input への移行：10 の段階](07-mig-signal-input-passes.md)  
次: [移行できない入力：理由の判定と TODO](09-mig-signal-input-incompatible.md) →
