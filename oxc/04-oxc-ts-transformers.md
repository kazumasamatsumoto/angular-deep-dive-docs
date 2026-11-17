[目次](../README.md) › [oxc の変換と TypeScript の transformer の内側：ビルドが JavaScript を書き換える行](README.md) › 第 4 回 / 全 5 回

# TypeScript の transformer：JIT の resource・bootstrap の置き換え・Web Worker

> tools/angular/transformers の createJitResourceTransformer・replaceBootstrap・createWorkerTransformer が、TypeScript の emit の途中で templateUrl と styles・styleUrl(s) を import に、platformBrowserDynamic を platformBrowser に（elideImports で使われない import を消す）、new Worker(new URL(...)) を束ねた出力の場所に書き換える行。どのコンパイル（AOT / JIT）で、どの順に差し込まれるか。origin/main の 174eb34540。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/oxc-ts-transformers)

---

この章で分かること: oxc の変換の手前、TypeScript がアプリの `.ts` を JavaScript にする emit の途中で、CLI が差し込む 3 つの transformer が何を書き換えるかです。JIT のビルドで `templateUrl`・`styleUrl(s)`・`styles` を `import` に替える `createJitResourceTransformer`、AOT のビルドで `platformBrowserDynamic` を `platformBrowser` に替えて使われなくなった `import` を消す `replaceBootstrap`、`new Worker(new URL('./x.worker', import.meta.url))` の URL を束ねた Worker の出力の名前に替える `createWorkerTransformer` を、行の順に追い、本物の 22.2.7 を TypeScript の emit に渡した記録で入力と出力を並べます。

読む対象は angular-cli（44129f66a3）の `tools/angular/transformers/jit-resource-transformer.ts`・`jit-bootstrap-transformer.ts`・`web-worker-transformer.ts`、それを差し込む `tools/angular/compilation/aot-compilation.ts`・`jit-compilation.ts`、書き換えた先を受ける `tools/angular/uri.ts`・`tools/esbuild/angular/jit-plugin-callbacks.ts`・`compiler-plugin.ts` の `processWebWorker` です。AOT と JIT のどちらの compilation を作るかと、emit の全体は[AotCompilation の章](../cli/03-cli-angular-compilation.md)に、同じ emit に入る 4 つ目の transformer（`lazyRoutesTransformer`）は[遅延チャンクの章](../cli/07-cli-code-splitting.md)にあります。

1. [1. transform の 1 回の走査](01-oxc-transform-pass.md)
2. [2. 後順の走査](02-oxc-traversal.md)
3. [3. linker の読み書き](03-oxc-linker-host.md)
4. **4. TypeScript の transformer**（この章）
5. [5. spec と issue](05-oxc-tests-issues.md)

## 0. どこに差し込まれるか

TypeScript の transformer は、`(context) => (sourceFile) => sourceFile` の形の関数です。`program.emit` に `{ before: [...] }` で渡すと、TypeScript が型を消して JavaScript にする**前**の木（TypeScript の木）を、配列の順に 1 つずつ書き換えます。第 1〜3 回の oxc の変換は、この emit が出した JavaScript を esbuild の `onLoad` の後でもう一度読むもので、順番はこの章が先です。

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/jit-compilation.ts` L72–96 （▶ の行: 74, 83, 86–88）

```ts
72 │     // Create the TypeScript Program
73 │     const typeScriptProgram = profileSync('TS_CREATE_PROGRAM', () =>
74 ▶       ts.createEmitAndSemanticDiagnosticsBuilderProgram(
75 │         rootNames,
76 │         compilerOptions,
77 │         host,
78 │         this.#state?.typeScriptProgram ?? ts.readBuilderProgram(compilerOptions, host),
79 │         configurationDiagnostics,
80 │       ),
81 │     );
82 │ 
83 ▶     this.#state = new JitCompilationState(
84 │       host,
85 │       typeScriptProgram,
86 ▶       constructorParametersDownlevelTransform(typeScriptProgram.getProgram()),
87 ▶       createJitResourceTransformer(() => typeScriptProgram.getProgram().getTypeChecker()),
88 ▶       createWorkerTransformer(hostOptions.processWebWorker.bind(hostOptions)),
89 │     );
90 │ 
91 │     const referencedFiles = typeScriptProgram
92 │       .getSourceFiles()
93 │       .map((sourceFile) => sourceFile.fileName);
94 │ 
95 │     return { compilerOptions, referencedFiles, warnings };
96 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/jit-compilation.ts` L140–165 （▶ の行: 145–149, 153–155, 159）

```ts
140 │ 
141 │       assert(sourceFiles?.length === 1, 'Invalid TypeScript program emit for ' + filename);
142 │ 
143 │       emittedFiles.push({ filename: sourceFiles[0].fileName, contents });
144 │     };
145 ▶     const transformers = {
146 ▶       before: [
147 ▶         replaceResourcesTransform,
148 ▶         constructorParametersDownlevelTransform,
149 ▶         webWorkerTransform,
150 │       ],
151 │     };
152 │ 
153 ▶     if (!this.browserOnlyBuild) {
154 ▶       transformers.before.push(lazyRoutesTransformer(compilerOptions, compilerHost));
155 ▶     }
156 │ 
157 │     // TypeScript will loop until there are no more affected files in the program
158 │     while (
159 ▶       typeScriptProgram.emitNextAffectedFile(writeFileCallback, undefined, undefined, transformers)
160 │     ) {
161 │       /* empty */
162 │     }
163 │ 
164 │     return emittedFiles;
165 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/aot-compilation.ts` L222–236 （▶ の行: 230, 236）

```ts
222 │               affectedFiles.add(sourceFile);
223 │             }
224 │           }
225 │         }
226 │ 
227 │         return [sourceFile.fileName, ...resourceDependencies];
228 │       });
229 │ 
230 ▶     this.#state = new AngularCompilationState(
231 │       angularProgram,
232 │       host,
233 │       typeScriptProgram,
234 │       affectedFiles,
235 │       affectedFiles.size === 1 ? OptimizeFor.SingleFile : OptimizeFor.WholeProgram,
236 ▶       createWorkerTransformer(hostOptions.processWebWorker.bind(hostOptions)),
```

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/aot-compilation.ts` L349–361 （▶ の行: 355–359）

```ts
349 │         return;
350 │       }
351 │ 
352 │       angularCompiler.incrementalCompilation.recordSuccessfulEmit(sourceFile);
353 │       emittedFiles.set(sourceFile, { filename: sourceFile.fileName, contents });
354 │     };
355 ▶     const transformers = angularCompiler.prepareEmit().transformers;
356 ▶     transformers.before ??= [];
357 ▶     transformers.before.push(
358 ▶       replaceBootstrap(() => typeScriptProgram.getProgram().getTypeChecker()),
359 ▶       webWorkerTransform,
360 │     );
361 │ 
```

| emit の before（配列の順） | JIT（`aot: false`） | AOT（既定） |
| --- | --- | --- |
| 1 | `createJitResourceTransformer`（87・147 行目） | Angular のコンパイラの transformer（355 行目の `prepareEmit().transformers`。`ɵcmp` などを足し、デコレーターを消す） |
| 2 | `constructorParametersDownlevelTransform`（86・148 行目、Angular 本体の JIT 用） | `replaceBootstrap`（358 行目） |
| 3 | `createWorkerTransformer`（88・149 行目） | `createWorkerTransformer`（236 行目で作り、359 行目） |
| 4 | `lazyRoutesTransformer`（153〜155 行目、サーバーのビルドもあるとき） | `lazyRoutesTransformer`（サーバーのビルドもあるとき） |

JIT では、デコレーターは JavaScript に残り、ブラウザで `@angular/compiler` がコンパイルします。テンプレートとスタイルのファイルは、ブラウザが読めるように**ビルドの中に取り込んでおく**必要があり、それが 1 つ目の transformer です。AOT では、コンパイラがテンプレートを読んで命令の列にするので resource の transformer は要らず、代わりに JIT のコンパイラを連れてくる `platformBrowserDynamic` を外す `replaceBootstrap` が入ります。Worker の transformer はどちらにも入ります。JIT は 159 行目の `emitNextAffectedFile` で変わったファイルを 1 つずつ emit し、AOT も 1 ファイルずつ emit します（[AotCompilation の章](../cli/03-cli-angular-compilation.md)の 395〜431 行目）。そのため transformer の `context` も 1 ファイルの emit ごとに作り直されます。

## 1. createJitResourceTransformer：resource を import に

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-resource-transformer.ts` L20–52 （▶ の行: 24, 29–30, 32, 36, 39–40, 42, 51）

```ts
20 │ export function createJitResourceTransformer(
21 │   getTypeChecker: () => ts.TypeChecker,
22 │ ): ts.TransformerFactory<ts.SourceFile> {
23 │   return (context: ts.TransformationContext) => {
24 ▶     const typeChecker = getTypeChecker();
25 │     const nodeFactory = context.factory;
26 │     const resourceImportDeclarations: ts.ImportDeclaration[] = [];
27 │ 
28 │     const visitNode: ts.Visitor = (node: ts.Node) => {
29 ▶       if (ts.isClassDeclaration(node)) {
30 ▶         const decorators = ts.getDecorators(node);
31 │ 
32 ▶         if (!decorators || decorators.length === 0) {
33 │           return node;
34 │         }
35 │ 
36 ▶         return nodeFactory.updateClassDeclaration(
37 │           node,
38 │           [
39 ▶             ...decorators.map((current) =>
40 ▶               visitDecorator(nodeFactory, current, typeChecker, resourceImportDeclarations),
41 │             ),
42 ▶             ...(ts.getModifiers(node) ?? []),
43 │           ],
44 │           node.name,
45 │           node.typeParameters,
46 │           node.heritageClauses,
47 │           node.members,
48 │         );
49 │       }
50 │ 
51 ▶       return ts.visitEachChild(node, visitNode, context);
52 │     };
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-resource-transformer.ts` L54–78 （▶ の行: 55, 57, 62）

```ts
54 │     return (sourceFile) => {
55 ▶       const updatedSourceFile = ts.visitEachChild(sourceFile, visitNode, context);
56 │ 
57 ▶       if (resourceImportDeclarations.length > 0) {
58 │         return nodeFactory.updateSourceFile(
59 │           updatedSourceFile,
60 │           ts.setTextRange(
61 │             nodeFactory.createNodeArray(
62 ▶               [...resourceImportDeclarations, ...updatedSourceFile.statements],
63 │               updatedSourceFile.statements.hasTrailingComma,
64 │             ),
65 │             updatedSourceFile.statements,
66 │           ),
67 │           updatedSourceFile.isDeclarationFile,
68 │           updatedSourceFile.referencedFiles,
69 │           updatedSourceFile.typeReferenceDirectives,
70 │           updatedSourceFile.hasNoDefaultLib,
71 │           updatedSourceFile.libReferenceDirectives,
72 │         );
73 │       } else {
74 │         return updatedSourceFile;
75 │       }
76 │     };
77 │   };
78 │ }
```

29 行目、クラスの宣言だけを見ます。デコレーターがあれば 39〜41 行目でデコレーターを 1 つずつ `visitDecorator` に通し、42 行目でほかの修飾子（`export` など）を後ろにつないでクラスを作り直します。クラスでなければ 51 行目で子をたどります。作った `import` の宣言は 26 行目の配列にためておき、ファイルを 1 周した後、57〜62 行目でファイルの文の**先頭**に並べます。

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-resource-transformer.ts` L80–104 （▶ の行: 86–87, 91, 97–98）

```ts
 80 │ function visitDecorator(
 81 │   nodeFactory: ts.NodeFactory,
 82 │   node: ts.Decorator,
 83 │   typeChecker: ts.TypeChecker,
 84 │   resourceImportDeclarations: ts.ImportDeclaration[],
 85 │ ): ts.Decorator {
 86 ▶   const origin = getDecoratorOrigin(node, typeChecker);
 87 ▶   if (!origin || origin.module !== '@angular/core' || origin.name !== 'Component') {
 88 │     return node;
 89 │   }
 90 │ 
 91 ▶   if (!ts.isCallExpression(node.expression)) {
 92 │     return node;
 93 │   }
 94 │ 
 95 │   const decoratorFactory = node.expression;
 96 │   const args = decoratorFactory.arguments;
 97 ▶   if (args.length !== 1 || !ts.isObjectLiteralExpression(args[0])) {
 98 ▶     // Unsupported component metadata
 99 │     return node;
100 │   }
101 │ 
102 │   const objectExpression = args[0];
103 │   const styleReplacements: ts.Expression[] = [];
104 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-resource-transformer.ts` L265–284 （▶ の行: 269, 276–280）

```ts
265 │ function getDecoratorOrigin(
266 │   decorator: ts.Decorator,
267 │   typeChecker: ts.TypeChecker,
268 │ ): { name: string; module: string } | null {
269 ▶   if (!ts.isCallExpression(decorator.expression)) {
270 │     return null;
271 │   }
272 │ 
273 │   let identifier: ts.Node;
274 │   let name = '';
275 │ 
276 ▶   if (ts.isPropertyAccessExpression(decorator.expression.expression)) {
277 ▶     identifier = decorator.expression.expression.expression;
278 ▶     name = decorator.expression.expression.name.text;
279 ▶   } else if (ts.isIdentifier(decorator.expression.expression)) {
280 ▶     identifier = decorator.expression.expression;
281 │   } else {
282 │     return null;
283 │   }
284 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-resource-transformer.ts` L285–308 （▶ の行: 286, 291–294, 296–298, 301）

```ts
285 │   // NOTE: resolver.getReferencedImportDeclaration would work as well but is internal
286 ▶   const symbol = typeChecker.getSymbolAtLocation(identifier);
287 │   if (symbol && symbol.declarations && symbol.declarations.length > 0) {
288 │     const declaration = symbol.declarations[0];
289 │     let module: string;
290 │ 
291 ▶     if (ts.isImportSpecifier(declaration)) {
292 ▶       name = (declaration.propertyName || declaration.name).text;
293 ▶       module = (declaration.parent.parent.parent.moduleSpecifier as ts.StringLiteral).text;
294 ▶     } else if (ts.isNamespaceImport(declaration)) {
295 │       // Use the name from the decorator namespace property access
296 ▶       module = (declaration.parent.parent.moduleSpecifier as ts.StringLiteral).text;
297 ▶     } else if (ts.isImportClause(declaration)) {
298 ▶       name = (declaration.name as ts.Identifier).text;
299 │       module = (declaration.parent.moduleSpecifier as ts.StringLiteral).text;
300 │     } else {
301 ▶       return null;
302 │     }
303 │ 
304 │     return { name, module };
305 │   }
306 │ 
307 │   return null;
308 │ }
```

1. **86〜87 行目：`@angular/core` の `Component` か**

   名前の文字列ではなく、型の checker（TypeScript の名前解決）で、デコレーターの名前が **どの import の宣言から来たか**を `getDecoratorOrigin` で調べます。
2. **276〜280 行目：`core.Component(…)` と `Component(…)`**

   名前空間を通した呼び出しなら、識別子は `core`、名前は `Component`。直接の呼び出しなら識別子は `Component` です。
3. **286〜301 行目：宣言からモジュールの名前を読む**

   291〜293 行目、`import { Component as Cmp }` なら `propertyName`（元の名前 `Component`）とモジュール名、294〜296 行目の `import * as core` ならモジュール名だけ、297〜299 行目は default の import です。どれでもなければ（ローカルのクラスなど）301 行目で対象外です。
4. **91・97 行目：引数がオブジェクトのリテラル 1 つ**

   `@Component(meta)` のように変数を渡したものは書き換えません（98 行目のコメント）。

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-resource-transformer.ts` L105–131 （▶ の行: 106, 113–115, 119）

```ts
105 │   // visit all properties
106 ▶   let properties = ts.visitNodes(objectExpression.properties, (node) =>
107 │     ts.isObjectLiteralElementLike(node)
108 │       ? visitComponentMetadata(nodeFactory, node, styleReplacements, resourceImportDeclarations)
109 │       : node,
110 │   ) as ts.NodeArray<ts.ObjectLiteralElementLike>;
111 │ 
112 │   // replace properties with updated properties
113 ▶   if (styleReplacements.length > 0) {
114 ▶     const styleProperty = nodeFactory.createPropertyAssignment(
115 ▶       nodeFactory.createIdentifier('styles'),
116 │       nodeFactory.createArrayLiteralExpression(styleReplacements),
117 │     );
118 │ 
119 ▶     properties = nodeFactory.createNodeArray([...properties, styleProperty]);
120 │   }
121 │ 
122 │   return nodeFactory.updateDecorator(
123 │     node,
124 │     nodeFactory.updateCallExpression(
125 │       decoratorFactory,
126 │       decoratorFactory.expression,
127 │       decoratorFactory.typeArguments,
128 │       [nodeFactory.updateObjectLiteralExpression(objectExpression, properties)],
129 │     ),
130 │   );
131 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-resource-transformer.ts` L133–160 （▶ の行: 139, 146, 150, 154, 157）

```ts
133 │ function visitComponentMetadata(
134 │   nodeFactory: ts.NodeFactory,
135 │   node: ts.ObjectLiteralElementLike,
136 │   styleReplacements: ts.Expression[],
137 │   resourceImportDeclarations: ts.ImportDeclaration[],
138 │ ): ts.ObjectLiteralElementLike | undefined {
139 ▶   if (!ts.isPropertyAssignment(node) || ts.isComputedPropertyName(node.name)) {
140 │     return node;
141 │   }
142 │ 
143 │   switch (node.name.text) {
144 │     case 'templateUrl':
145 │       // Only analyze string literals
146 ▶       if (!ts.isStringLiteralLike(node.initializer)) {
147 │         return node;
148 │       }
149 │ 
150 ▶       return node.initializer.text.length === 0
151 │         ? node
152 │         : nodeFactory.updatePropertyAssignment(
153 │             node,
154 ▶             nodeFactory.createIdentifier('template'),
155 │             createResourceImport(
156 │               nodeFactory,
157 ▶               generateJitFileUri(node.initializer.text, 'template'),
158 │               resourceImportDeclarations,
159 │             ),
160 │           );
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-resource-transformer.ts` L161–197 （▶ の行: 162–163, 171, 174, 180, 190, 193, 196）

```ts
161 │     case 'styles':
162 ▶       if (ts.isStringLiteralLike(node.initializer)) {
163 ▶         styleReplacements.unshift(
164 │           createResourceImport(
165 │             nodeFactory,
166 │             generateJitInlineUri(node.initializer.text, 'style'),
167 │             resourceImportDeclarations,
168 │           ),
169 │         );
170 │ 
171 ▶         return undefined;
172 │       }
173 │ 
174 ▶       if (ts.isArrayLiteralExpression(node.initializer)) {
175 │         const inlineStyles = ts.visitNodes(node.initializer.elements, (node) => {
176 │           if (!ts.isStringLiteralLike(node)) {
177 │             return node;
178 │           }
179 │ 
180 ▶           return node.text.length === 0
181 │             ? undefined // An empty inline style is equivalent to not having a style element
182 │             : createResourceImport(
183 │                 nodeFactory,
184 │                 generateJitInlineUri(node.text, 'style'),
185 │                 resourceImportDeclarations,
186 │               );
187 │         }) as ts.NodeArray<ts.Expression>;
188 │ 
189 │         // Inline styles should be placed first
190 ▶         styleReplacements.unshift(...inlineStyles);
191 │ 
192 │         // The inline styles will be added afterwards in combination with any external styles
193 ▶         return undefined;
194 │       }
195 │ 
196 ▶       return node;
197 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-resource-transformer.ts` L198–242 （▶ の行: 199–200, 208, 214, 223, 233, 236）

```ts
198 │     case 'styleUrl':
199 ▶       if (ts.isStringLiteralLike(node.initializer)) {
200 ▶         styleReplacements.push(
201 │           createResourceImport(
202 │             nodeFactory,
203 │             generateJitFileUri(node.initializer.text, 'style'),
204 │             resourceImportDeclarations,
205 │           ),
206 │         );
207 │ 
208 ▶         return undefined;
209 │       }
210 │ 
211 │       return node;
212 │ 
213 │     case 'styleUrls': {
214 ▶       if (!ts.isArrayLiteralExpression(node.initializer)) {
215 │         return node;
216 │       }
217 │ 
218 │       const externalStyles = ts.visitNodes(node.initializer.elements, (node) => {
219 │         if (!ts.isStringLiteralLike(node)) {
220 │           return node;
221 │         }
222 │ 
223 ▶         return node.text
224 │           ? createResourceImport(
225 │               nodeFactory,
226 │               generateJitFileUri(node.text, 'style'),
227 │               resourceImportDeclarations,
228 │             )
229 │           : undefined;
230 │       }) as ts.NodeArray<ts.Expression>;
231 │ 
232 │       // External styles are applied after any inline styles
233 ▶       styleReplacements.push(...externalStyles);
234 │ 
235 │       // The external styles will be added afterwards in combination with any inline styles
236 ▶       return undefined;
237 │     }
238 │     default:
239 │       // All other elements are passed through
240 │       return node;
241 │   }
242 │ }
```

1. **150〜160 行目：templateUrl は名前ごと替える**

   `templateUrl: './a.html'` を、154 行目で `template: __NG_CLI_RESOURCE__0` にします。値は import した識別子です。146 行目、文字列のリテラルでなければそのまま、150 行目、空の文字列もそのままです。
2. **163・190 行目：インラインのスタイルは前へ**

   `styles` の文字列（または配列の文字列の要素）は、中身を base64 にした URI の import にして、`styleReplacements` の**先頭**に `unshift` します。180 行目、空の要素は落とします。
3. **200・233 行目：外部のスタイルは後ろへ**

   `styleUrl` と `styleUrls` の要素は、ファイルの URI の import にして末尾に `push` します。元の `styles`・`styleUrl(s)` の property は `undefined` を返して消します（171・193・208・236 行目）。
4. **113〜120 行目：`styles` を 1 つ足す**

   集めた式が 1 つでもあれば、`styles: [インライン…, 外部…]` の property を**最後に足します**。記録の「templateUrl・styleUrls・styles」では `styles: [__NG_CLI_RESOURCE__2, __NG_CLI_RESOURCE__1]`（インラインが 2、外部が 1）です。

196 行目、`styles` の値が文字列でも配列でもない（変数など）と、property は残ります。同じコンポーネントに `styleUrl` があると、113〜120 行目で 2 つ目の `styles` が足されます。記録の「styles が変数・styleUrl あり」の出力は `styles: shared, styles: [__NG_CLI_RESOURCE__0]` で、オブジェクトのリテラルで同じキーが 2 回あると後ろの値になる（ECMAScript の仕様）ので、`shared` のスタイルはデコレーターに渡りません。AOT ではコンパイラが `styles` と `styleUrl` を両方読むので、この形は JIT のビルドだけのものです。同じ形の分岐は `@ngtools/webpack` の `replace_resources.ts` にもあります。

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-resource-transformer.ts` L244–263 （▶ の行: 249, 252, 255, 257）

```ts
244 │ function createResourceImport(
245 │   nodeFactory: ts.NodeFactory,
246 │   url: string,
247 │   resourceImportDeclarations: ts.ImportDeclaration[],
248 │ ): ts.Identifier {
249 ▶   const urlLiteral = nodeFactory.createStringLiteral(url);
250 │ 
251 │   const importName = nodeFactory.createIdentifier(
252 ▶     `__NG_CLI_RESOURCE__${resourceImportDeclarations.length}`,
253 │   );
254 │   resourceImportDeclarations.push(
255 ▶     nodeFactory.createImportDeclaration(
256 │       undefined,
257 ▶       nodeFactory.createImportClause(undefined, importName, undefined),
258 │       urlLiteral,
259 │     ),
260 │   );
261 │ 
262 │   return importName;
263 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/angular/uri.ts` L37–57 （▶ の行: 44, 56）

```ts
37 │ /**
38 │  * Generates an Angular JIT mode namespace URI for a given file.
39 │  * @param file The path of the file to be included.
40 │  * @param type The type of the file (`style` or `template`).
41 │  * @returns A string containing the full JIT namespace URI.
42 │  */
43 │ export function generateJitFileUri(file: string, type: 'style' | 'template') {
44 ▶   return `${JIT_BASE_NAMESPACE}:${type}:file;${file}`;
45 │ }
46 │ 
47 │ /**
48 │  * Generates an Angular JIT mode namespace URI for a given inline style or template.
49 │  * The provided content is base64 encoded and included in the URI.
50 │  * @param data The content to encode within the URI.
51 │  * @param type The type of the content (`style` or `template`).
52 │  * @returns A string containing the full JIT namespace URI.
53 │  */
54 │ export function generateJitInlineUri(data: string | Uint8Array, type: 'style' | 'template') {
55 │   // Node.js types do not allow a string even though this is valid.
56 ▶   return `${JIT_BASE_NAMESPACE}:${type}:inline;${Buffer.from(data as Uint8Array).toString('base64')}`;
57 │ }
```

252 行目、識別子は `__NG_CLI_RESOURCE__` に通し番号、257 行目で default の import にします。import の先は 44 行目の `angular:jit:template:file;./a.html` か、56 行目の `angular:jit:style:inline;<base64>` の形の文字列で、ファイルではありません。esbuild がこれを解決します。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular/jit-plugin-callbacks.ts` L71–98 （▶ の行: 74, 82, 86, 94）

```ts
71 │   // Add a resolve callback to capture and parse any JIT URIs that were added by the
72 │   // JIT resource TypeScript transformer.
73 │   // Resources originating from a file are resolved as relative from the containing file (importer).
74 ▶   build.onResolve({ filter: JIT_NAMESPACE_REGEXP }, (args) => {
75 │     const parsed = parseJitUri(args.path);
76 │     if (!parsed) {
77 │       return undefined;
78 │     }
79 │ 
80 │     const { namespace, origin, specifier } = parsed;
81 │ 
82 ▶     if (origin === 'file') {
83 │       return {
84 │         // Use a relative path to prevent fully resolved paths in the metafile (JSON stats file).
85 │         // This is only necessary for custom namespaces. esbuild will handle the file namespace.
86 ▶         path: relative(root, join(dirname(args.importer), specifier)),
87 │         namespace,
88 │       };
89 │     } else {
90 │       // Inline data may need the importer to resolve imports/references within the content
91 │       const importer = relative(root, args.importer);
92 │ 
93 │       return {
94 ▶         path: `inline:${importer};${specifier}`,
95 │         namespace,
96 │       };
97 │     }
98 │   });
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular/jit-plugin-callbacks.ts` L140–154 （▶ の行: 144, 146, 150）

```ts
140 │   // Add a load callback to handle Component templates
141 │   // NOTE: While this callback supports both inline and external templates, the transformer
142 │   // currently only supports generating URIs for external templates.
143 │   build.onLoad(
144 ▶     { filter: /./, namespace: JIT_TEMPLATE_NAMESPACE },
145 │     createCachedLoad(loadCache, async (args) => {
146 ▶       const { contents, path } = await loadEntry(args.path, root);
147 │ 
148 │       return {
149 │         contents,
150 ▶         loader: 'text',
151 │         watchFiles: [path],
152 │       };
153 │     }),
154 │   );
```

74 行目、esbuild の `onResolve` が `angular:jit:` で始まる import を受け、86 行目でファイルなら import したファイル（`args.importer`）のフォルダから解決します。94 行目、インラインなら `inline:<import したファイル>;<base64>` の path にします。テンプレートは 146 行目でファイルを読み、150 行目の `loader: 'text'` で「中身の文字列を default export するモジュール」になります。スタイルはスタイルの bundler に回り、できた CSS の文字列が同じく `text` で返ります（コンポーネントのスタイルの処理は[コンポーネントのスタイルの章](../cli/04-cli-component-styles.md)）。つまり JIT のビルドの `main.js` では、`template: __NG_CLI_RESOURCE__0` の値が HTML の文字列そのものです。

## 2. replaceBootstrap と elideImports

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-bootstrap-transformer.ts` L17–54 （▶ の行: 27, 29, 31–32, 39, 42, 44, 46）

```ts
17 │ export function replaceBootstrap(
18 │   getTypeChecker: () => ts.TypeChecker,
19 │ ): ts.TransformerFactory<ts.SourceFile> {
20 │   return (context: ts.TransformationContext) => {
21 │     let bootstrapImport: ts.ImportDeclaration | undefined;
22 │     let bootstrapNamespace: ts.Identifier | undefined;
23 │     const replacedNodes: ts.Node[] = [];
24 │     const nodeFactory = context.factory;
25 │ 
26 │     const visitNode: ts.Visitor = (node: ts.Node) => {
27 ▶       if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
28 │         const target = node.expression;
29 ▶         if (target.text === PLATFORM_BROWSER_DYNAMIC_NAME) {
30 │           if (!bootstrapNamespace) {
31 ▶             bootstrapNamespace = nodeFactory.createUniqueName('__NgCli_bootstrap_');
32 ▶             bootstrapImport = nodeFactory.createImportDeclaration(
33 │               undefined,
34 │               nodeFactory.createImportClause(
35 │                 undefined,
36 │                 undefined,
37 │                 nodeFactory.createNamespaceImport(bootstrapNamespace),
38 │               ),
39 ▶               nodeFactory.createStringLiteral('@angular/platform-browser'),
40 │             );
41 │           }
42 ▶           replacedNodes.push(target);
43 │ 
44 ▶           return nodeFactory.updateCallExpression(
45 │             node,
46 ▶             nodeFactory.createPropertyAccessExpression(bootstrapNamespace, 'platformBrowser'),
47 │             node.typeArguments,
48 │             node.arguments,
49 │           );
50 │         }
51 │       }
52 │ 
53 │       return ts.visitEachChild(node, visitNode, context);
54 │     };
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-bootstrap-transformer.ts` L56–92 （▶ の行: 57, 61, 63, 65, 71–72, 74, 80, 83）

```ts
56 │     return (sourceFile: ts.SourceFile) => {
57 ▶       if (!sourceFile.text.includes(PLATFORM_BROWSER_DYNAMIC_NAME)) {
58 │         return sourceFile;
59 │       }
60 │ 
61 ▶       let updatedSourceFile = ts.visitEachChild(sourceFile, visitNode, context);
62 │ 
63 ▶       if (bootstrapImport) {
64 │         // Remove any unused platform browser dynamic imports
65 ▶         const removals = elideImports(
66 │           updatedSourceFile,
67 │           replacedNodes,
68 │           getTypeChecker,
69 │           context.getCompilerOptions(),
70 │         );
71 ▶         if (removals.size > 0) {
72 ▶           updatedSourceFile = ts.visitEachChild(
73 │             updatedSourceFile,
74 ▶             (node) => (removals.has(node) ? undefined : node),
75 │             context,
76 │           );
77 │         }
78 │ 
79 │         // Add new platform browser import
80 ▶         return nodeFactory.updateSourceFile(
81 │           updatedSourceFile,
82 │           ts.setTextRange(
83 ▶             nodeFactory.createNodeArray([bootstrapImport, ...updatedSourceFile.statements]),
84 │             sourceFile.statements,
85 │           ),
86 │         );
87 │       } else {
88 │         return updatedSourceFile;
89 │       }
90 │     };
91 │   };
92 │ }
```

1. **57 行目：文字列で先にふるう**

   ファイルの文字に `platformBrowserDynamic` が無ければ木をたどりません。
2. **27〜49 行目：呼び出しを置き換える**

   呼ばれる側が**識別子**の `platformBrowserDynamic(…)` だけを、44〜49 行目で `__NgCli_bootstrap_1.platformBrowser(…)` にします。31 行目の `createUniqueName` は、ファイルの中で使われていない名前（記録では末尾が `_1`）を TypeScript が決める識別子です。42 行目、置き換えた識別子の節点を覚えておきます。名前で選ぶので、型の checker は使いません。
3. **65〜77 行目：使われなくなった import を消す**

   覚えた節点を `elideImports` に渡し、消す節点の集合をもらって、72〜76 行目で消します。
4. **80〜86 行目：新しい import を先頭に**

   `import * as __NgCli_bootstrap_1 from "@angular/platform-browser"` を文の先頭に足します。

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-bootstrap-transformer.ts` L94–131 （▶ の行: 94, 108, 118, 120, 127）

```ts
 94 ▶ // Remove imports for which all identifiers have been removed.
 95 │ // Needs type checker, and works even if it's not the first transformer.
 96 │ // Works by removing imports for symbols whose identifiers have all been removed.
 97 │ // Doesn't use the `symbol.declarations` because that previous transforms might have removed nodes
 98 │ // but the type checker doesn't know.
 99 │ // See https://github.com/Microsoft/TypeScript/issues/17552 for more information.
100 │ export function elideImports(
101 │   sourceFile: ts.SourceFile,
102 │   removedNodes: ts.Node[],
103 │   getTypeChecker: () => ts.TypeChecker,
104 │   compilerOptions: ts.CompilerOptions,
105 │ ): Set<ts.Node> {
106 │   const importNodeRemovals = new Set<ts.Node>();
107 │ 
108 ▶   if (removedNodes.length === 0) {
109 │     return importNodeRemovals;
110 │   }
111 │ 
112 │   const typeChecker = getTypeChecker();
113 │ 
114 │   // Collect all imports and used identifiers
115 │   const usedSymbols = new Set<ts.Symbol>();
116 │   const imports: ts.ImportDeclaration[] = [];
117 │ 
118 ▶   ts.forEachChild(sourceFile, function visit(node) {
119 │     // Skip removed nodes.
120 ▶     if (removedNodes.includes(node)) {
121 │       return;
122 │     }
123 │ 
124 │     // Consider types for 'implements' as unused.
125 │     // A HeritageClause token can also be an 'AbstractKeyword'
126 │     // which in that case we should not elide the import.
127 ▶     if (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword) {
128 │       return;
129 │     }
130 │ 
131 │     // Record import and skip
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-bootstrap-transformer.ts` L132–170 （▶ の行: 132–133, 141, 147–148, 154, 157, 160, 165）

```ts
132 ▶     if (ts.isImportDeclaration(node)) {
133 ▶       if (!node.importClause?.isTypeOnly) {
134 │         imports.push(node);
135 │       }
136 │ 
137 │       return;
138 │     }
139 │ 
140 │     // Type reference imports do not need to be emitted when emitDecoratorMetadata is disabled.
141 ▶     if (ts.isTypeReferenceNode(node) && !compilerOptions.emitDecoratorMetadata) {
142 │       return;
143 │     }
144 │ 
145 │     let symbol: ts.Symbol | undefined;
146 │     switch (node.kind) {
147 ▶       case ts.SyntaxKind.Identifier:
148 ▶         if (node.parent && ts.isShorthandPropertyAssignment(node.parent)) {
149 │           const shorthandSymbol = typeChecker.getShorthandAssignmentValueSymbol(node.parent);
150 │           if (shorthandSymbol) {
151 │             symbol = shorthandSymbol;
152 │           }
153 │         } else {
154 ▶           symbol = typeChecker.getSymbolAtLocation(node);
155 │         }
156 │         break;
157 ▶       case ts.SyntaxKind.ExportSpecifier:
158 │         symbol = typeChecker.getExportSpecifierLocalTargetSymbol(node as ts.ExportSpecifier);
159 │         break;
160 ▶       case ts.SyntaxKind.ShorthandPropertyAssignment:
161 │         symbol = typeChecker.getShorthandAssignmentValueSymbol(node);
162 │         break;
163 │     }
164 │ 
165 ▶     if (symbol) {
166 │       usedSymbols.add(symbol);
167 │     }
168 │ 
169 │     ts.forEachChild(node, visit);
170 │   });
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-bootstrap-transformer.ts` L176–205 （▶ の行: 176, 182, 184, 195, 197）

```ts
176 ▶   const isUnused = (node: ts.Identifier) => {
177 │     // Do not remove JSX factory imports
178 │     if (node.text === compilerOptions.jsxFactory) {
179 │       return false;
180 │     }
181 │ 
182 ▶     const symbol = typeChecker.getSymbolAtLocation(node);
183 │ 
184 ▶     return symbol && !usedSymbols.has(symbol);
185 │   };
186 │ 
187 │   for (const node of imports) {
188 │     if (!node.importClause) {
189 │       // "import 'abc';"
190 │       continue;
191 │     }
192 │ 
193 │     const namedBindings = node.importClause.namedBindings;
194 │ 
195 ▶     if (namedBindings && ts.isNamespaceImport(namedBindings)) {
196 │       // "import * as XYZ from 'abc';"
197 ▶       if (isUnused(namedBindings.name)) {
198 │         importNodeRemovals.add(node);
199 │       }
200 │     } else {
201 │       const specifierNodeRemovals = [];
202 │       let clausesCount = 0;
203 │ 
204 │       // "import { XYZ, ... } from 'abc';"
205 │       if (namedBindings && ts.isNamedImports(namedBindings)) {
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/jit-bootstrap-transformer.ts` L206–241 （▶ の行: 210, 213–214, 222, 225, 230–231, 233）

```ts
206 │         let removedClausesCount = 0;
207 │         clausesCount += namedBindings.elements.length;
208 │ 
209 │         for (const specifier of namedBindings.elements) {
210 ▶           if (specifier.isTypeOnly || isUnused(specifier.name)) {
211 │             removedClausesCount++;
212 │             // in case we don't have any more namedImports we should remove the parent ie the {}
213 ▶             const nodeToRemove =
214 ▶               clausesCount === removedClausesCount ? specifier.parent : specifier;
215 │ 
216 │             specifierNodeRemovals.push(nodeToRemove);
217 │           }
218 │         }
219 │       }
220 │ 
221 │       // "import XYZ from 'abc';"
222 ▶       if (node.importClause.name) {
223 │         clausesCount++;
224 │ 
225 ▶         if (node.importClause.isTypeOnly || isUnused(node.importClause.name)) {
226 │           specifierNodeRemovals.push(node.importClause.name);
227 │         }
228 │       }
229 │ 
230 ▶       if (specifierNodeRemovals.length === clausesCount) {
231 ▶         importNodeRemovals.add(node);
232 │       } else {
233 ▶         for (const specifierNodeRemoval of specifierNodeRemovals) {
234 │           importNodeRemovals.add(specifierNodeRemoval);
235 │         }
236 │       }
237 │     }
238 │   }
239 │ 
240 │   return importNodeRemovals;
241 │ }
```

なぜ自分で消すかは 94〜99 行目のコメントのとおりです。TypeScript 自身も使われない import を消しますが、その判断は型の checker が**元の**木で数えた参照によるので、transformer が消した `platformBrowserDynamic()` の参照もまだ「使われている」ことになります。

1. **118〜170 行目：使われている名前を集める**

   ファイルの木をたどり、置き換えた節点（120 行目）、`implements` の後ろ（127 行目）、import の宣言そのもの（132〜137 行目）、`emitDecoratorMetadata` が無いときの型の参照（141 行目）を飛ばして、識別子が指す symbol（名前の実体）を 165 行目で集めます。
2. **176〜185 行目：使われていない**

   import の名前の symbol が集めた中に無ければ「使われていない」です。
3. **195〜236 行目：宣言ごと、または名前だけ**

   名前空間の import は 197 行目で宣言ごと。名前つきの import は名前を 1 つずつ見て、全部が使われていなければ 231 行目で宣言ごと、一部なら 233 行目で**名前の節点だけ**を消す集合に入れます。214 行目、全部の名前が消えるときは `{}` の節点を入れます。

ここで 72〜76 行目に戻ると、消す関数は `ts.visitEachChild(updatedSourceFile, …)` で**ファイルの直下の文**しか見ません。名前の節点は import の宣言の中にあるので、233 行目で集合に入っても消されません。記録の「ほかの名前と同じ import」では、HEAD（44129f66a3）の `replaceBootstrap` の出力に `import { platformBrowserDynamic, VERSION } from '@angular/platform-browser-dynamic';` が残りました。`@angular/platform-browser-dynamic` は `@angular/compiler` を import するパッケージです（`compiler_factory.ts`・`platform_providers.ts`）。

📄 `../angular-cli で git show 174eb34540`

```
$ git show 174eb34540 -- …/transformers/jit-bootstrap-transformer.ts   # origin/main、2026-10-29（抜粋）
         if (removals.size > 0) {
           updatedSourceFile = ts.visitEachChild(
             updatedSourceFile,
-            (node) => (removals.has(node) ? undefined : node),
+            function visitForRemoval(node): ts.Node | undefined {
+              if (removals.has(node)) {
+                return undefined;
+              }
+
+              return ts.isImportDeclaration(node) ||
+                ts.isImportClause(node) ||
+                ts.isNamedImports(node)
+                ? ts.visitEachChild(node, visitForRemoval, context)
+                : node;
+            },
             context,
           );
 ...
-    // Type reference imports do not need to be emitted when emitDecoratorMetadata is disabled.
-    if (ts.isTypeReferenceNode(node) && !compilerOptions.emitDecoratorMetadata) {
+    if (
+      ts.isTypeNode(node) &&
+      !ts.isExpressionWithTypeArguments(node) &&
+      !compilerOptions.emitDecoratorMetadata
+    ) {
 ...
-  const isUnused = (node: ts.Identifier) => {
+  const getRemovalKind = (node: ts.Identifier): 'keep' | 'value' | 'type' => {
 ...
-      } else {
+      } else if (requiresRewrite) {
# ほかに、interface・type の宣言・typeof X・declare の文・export … from を使われた数に入れない枝と、
# 別名が型だけを指すかを調べる isValueAlias を足し、jit-bootstrap-transformer_spec.ts（2 つの it）を新しく作った。
# 22.2.x には a4ce7bf461 として入り、このサイトの 22.2.7 の .js にもある。
```

origin/main の 174eb34540（10-29）は、消す関数を import の宣言・import の節・名前の並びの中まで降りるように直し（`visitForRemoval`）、使われた数に入れない型だけの構文を増やしました。22.2.7 の記録では、同じ入力から `import { VERSION } from '@angular/platform-browser-dynamic';` だけが残っています。同じ日の b6bfa2c747 は `@ngtools/webpack` の `elide_imports.ts` の直し（#34580）で、同じ枝を `replaceBootstrap` 側にも足しています。

## 3. createWorkerTransformer：Worker の URL を出力の名前に

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/web-worker-transformer.ts` L19–41 （▶ の行: 20, 27, 29–31, 34, 38）

```ts
19 │ export function createWorkerTransformer(
20 ▶   fileProcessor: (file: string, importer: string) => string,
21 │ ): ts.TransformerFactory<ts.SourceFile> {
22 │   return (context: ts.TransformationContext) => {
23 │     const nodeFactory = context.factory;
24 │ 
25 │     const visitNode: ts.Visitor = (node: ts.Node) => {
26 │       // Check if the node is a valid new expression for a Worker or SharedWorker
27 ▶       // TODO: Add global scope check
28 │       if (
29 ▶         !ts.isNewExpression(node) ||
30 ▶         !ts.isIdentifier(node.expression) ||
31 ▶         (node.expression.text !== 'Worker' && node.expression.text !== 'SharedWorker')
32 │       ) {
33 │         // Visit child nodes of non-Worker expressions
34 ▶         return ts.visitEachChild(node, visitNode, context);
35 │       }
36 │ 
37 │       // Worker should have atleast one argument but not more than two
38 ▶       if (!node.arguments || node.arguments.length < 1 || node.arguments.length > 2) {
39 │         return node;
40 │       }
41 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/web-worker-transformer.ts` L42–72 （▶ の行: 45–48, 54, 60–63, 68–69, 72）

```ts
42 │       // First argument must be a new URL expression
43 │       const workerUrlNode = node.arguments[0];
44 │       // TODO: Add global scope check
45 ▶       if (
46 ▶         !ts.isNewExpression(workerUrlNode) ||
47 ▶         !ts.isIdentifier(workerUrlNode.expression) ||
48 ▶         workerUrlNode.expression.text !== 'URL'
49 │       ) {
50 │         return node;
51 │       }
52 │ 
53 │       // URL must have 2 arguments
54 ▶       if (!workerUrlNode.arguments || workerUrlNode.arguments.length !== 2) {
55 │         return node;
56 │       }
57 │ 
58 │       // URL arguments must be a string and then `import.meta.url`
59 │       if (
60 ▶         !ts.isStringLiteralLike(workerUrlNode.arguments[0]) ||
61 ▶         !ts.isPropertyAccessExpression(workerUrlNode.arguments[1]) ||
62 ▶         !ts.isMetaProperty(workerUrlNode.arguments[1].expression) ||
63 ▶         workerUrlNode.arguments[1].name.text !== 'url'
64 │       ) {
65 │         return node;
66 │       }
67 │ 
68 ▶       const filePath = workerUrlNode.arguments[0].text;
69 ▶       const importer = node.getSourceFile().fileName;
70 │ 
71 │       // Process the file
72 ▶       const replacementPath = fileProcessor(filePath, importer);
```

1. **29〜35 行目：`new Worker` と `new SharedWorker`**

   呼ばれる側が識別子 `Worker`・`SharedWorker` の `new` だけです。27 行目の TODO のとおり、その名前がグローバルの Worker かどうか（ローカルの同じ名前のクラスでないか）は確かめていません。38 行目、引数は 1〜2 個。
2. **45〜66 行目：`new URL('…', import.meta.url)` の形だけ**

   1 つ目の引数が `new URL` で、その引数がちょうど 2 つ、1 つ目が文字列のリテラル、2 つ目が `import.meta.url` のときだけ進みます。`new Worker('./plain.js')` や `new URL(path, import.meta.url)` は 50・65 行目でそのまま返します（記録の「書き換えない形」）。
3. **68〜72 行目：束ねて名前をもらう**

   20 行目で受け取った `fileProcessor` に、Worker のパスと、それを書いたファイルの名前を渡します。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular/compiler-plugin.ts` L268–291 （▶ の行: 269–270, 273, 289）

```ts
268 │           processWebWorker(workerFile, containingFile) {
269 ▶             const fullWorkerPath = path.join(path.dirname(containingFile), workerFile);
270 ▶             // The synchronous API must be used due to the TypeScript compilation currently being
271 │             // fully synchronous and this process callback being called from within a TypeScript
272 │             // transformer.
273 ▶             const workerResult = bundleWebWorker(build, pluginOptions, fullWorkerPath);
274 │ 
275 │             (result.warnings ??= []).push(...workerResult.warnings);
276 │             if (workerResult.errors.length > 0) {
277 │               (result.errors ??= []).push(...workerResult.errors);
278 │               // Track worker file errors to allow rebuilds on changes
279 │               referencedFileTracker.add(
280 │                 containingFile,
281 │                 workerResult.errors
282 │                   .map((error) => error.location?.file)
283 │                   .filter((file): file is string => !!file)
284 │                   .map((file) => path.join(build.initialOptions.absWorkingDir ?? '', file)),
285 │               );
286 │               additionalResults.set(fullWorkerPath, { errors: result.errors });
287 │ 
288 │               // Return the original path if the build failed
289 ▶               return workerFile;
290 │             }
291 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular/compiler-plugin.ts` L292–316 （▶ の行: 306–307, 310, 315）

```ts
292 │             assert('outputFiles' in workerResult, 'Invalid web worker bundle result.');
293 │             additionalResults.set(fullWorkerPath, {
294 │               outputFiles: workerResult.outputFiles,
295 │               metafile: workerResult.metafile,
296 │             });
297 │ 
298 │             referencedFileTracker.add(
299 │               containingFile,
300 │               Object.keys(workerResult.metafile.inputs).map((input) =>
301 │                 path.join(build.initialOptions.absWorkingDir ?? '', input),
302 │               ),
303 │             );
304 │ 
305 │             // Return bundled worker file entry name to be used in the built output
306 ▶             const workerCodeFile = workerResult.outputFiles.find((file) =>
307 ▶               /^worker-[A-Z0-9]{8}.[cm]?js$/.test(path.basename(file.path)),
308 │             );
309 │             assert(workerCodeFile, 'Web Worker bundled code file should always be present.');
310 ▶             const workerCodePath = path.relative(
311 │               build.initialOptions.outdir ?? '',
312 │               workerCodeFile.path,
313 │             );
314 │ 
315 ▶             return workerCodePath.replaceAll('\\', '/');
316 │           },
```

`fileProcessor` の実体は compiler-plugin の `processWebWorker` です。269 行目でパスを解決し、273 行目の `bundleWebWorker` で Worker を**その場で**esbuild で束ねます。270〜272 行目のコメントのとおり、TypeScript の emit は同期なので、ここも同期の API を使います。306〜307 行目、出力の中の `worker-XXXXXXXX.js` を探し、310〜315 行目で出力のフォルダからの相対パスを返します。束ねに失敗したら 289 行目で**元のパス**を返し、エラーはビルドの結果に入ります。並列の compilation（ワーカーのスレッドで TypeScript を動かす形）では、この呼び出しがメインのスレッドへの同期の依頼になります（[AotCompilation の章](../cli/03-cli-angular-compilation.md)の `parallel-compilation.ts` 77 行目）。

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/web-worker-transformer.ts` L74–102 （▶ の行: 75–76, 92–93, 102）

```ts
 74 │       // Update if the path changed
 75 ▶       if (replacementPath !== filePath) {
 76 ▶         return nodeFactory.updateNewExpression(
 77 │           node,
 78 │           node.expression,
 79 │           node.typeArguments,
 80 │           // Update Worker arguments
 81 │           ts.setTextRange(
 82 │             nodeFactory.createNodeArray(
 83 │               [
 84 │                 nodeFactory.updateNewExpression(
 85 │                   workerUrlNode,
 86 │                   workerUrlNode.expression,
 87 │                   workerUrlNode.typeArguments,
 88 │                   // Update URL arguments
 89 │                   ts.setTextRange(
 90 │                     nodeFactory.createNodeArray(
 91 │                       [
 92 ▶                         nodeFactory.createStringLiteral(replacementPath),
 93 ▶                         workerUrlNode.arguments[1],
 94 │                       ],
 95 │                       workerUrlNode.arguments.hasTrailingComma,
 96 │                     ),
 97 │                     workerUrlNode.arguments,
 98 │                   ),
 99 │                 ),
100 │                 // Use the second Worker argument (options) if present.
101 │                 // Otherwise create a default options object for module Workers.
102 ▶                 node.arguments[1] ??
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/web-worker-transformer.ts` L103–129 （▶ の行: 103–106, 116, 122）

```ts
103 ▶                   nodeFactory.createObjectLiteralExpression([
104 ▶                     nodeFactory.createPropertyAssignment(
105 ▶                       'type',
106 ▶                       nodeFactory.createStringLiteral('module'),
107 │                     ),
108 │                   ]),
109 │               ],
110 │               node.arguments.hasTrailingComma,
111 │             ),
112 │             node.arguments,
113 │           ),
114 │         );
115 │       } else {
116 ▶         return node;
117 │       }
118 │     };
119 │ 
120 │     return (sourceFile) => {
121 │       // Skip transformer if there are no Workers
122 ▶       if (!sourceFile.text.includes('Worker')) {
123 │         return sourceFile;
124 │       }
125 │ 
126 │       return ts.visitEachChild(sourceFile, visitNode, context);
127 │     };
128 │   };
129 │ }
```

75 行目、返ったパスが元と違うときだけ、92 行目の新しい文字列と 93 行目の `import.meta.url` で `new URL` を作り直します。102 行目、Worker の 2 つ目の引数（options）があればそのまま、無ければ 103〜108 行目で `{ type: "module" }` を足します。束ねた Worker は ES module なので、`type: 'module'` が無いと classic の Worker として読まれて `import` が使えません。116 行目、パスが同じ（束ねに失敗した）なら書き換えません。122 行目、ファイルの文字に `Worker` が無ければ木をたどりません。

> **🧪 DEMO — 3 つの transformer の入力と出力（記録の再生）**
>
> `<scratchpad>/oxc-demo/b/ts/record.mjs` が、@angular/build 22.2.7（このサイトの node\_modules）の transformer の `.js` を、同じ node\_modules の typescript 6.0.3 のメモリの上の Program の `emit` に `before` として渡し、Node v24.22.1 で記録しました。`@angular/core` などは型だけの `.d.ts` の偽物です。`fileProcessor` は `worker-ABCD1234.js` を返す偽物で、パスに `broken` があるときだけ元のパスを返します。TypeScript が先頭に出す `__decorate` の helper（どの出力でも同じ 6 行）は落としてあります。
>
> `createJitResourceTransformer`：JIT の emit の before の 1 番目（jit-compilation.ts 147 行目）として createJitResourceTransformer だけを渡した
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/oxc-ts-transformers)

## 呼び出しの連なり

- `compiler-plugin onStart → compilation.emitAffectedFiles()` — tools/esbuild/angular/compiler-plugin.ts — *AotCompilation の章*
  - `JitCompilation: before = [replaceResources, ctorParametersDownlevel, webWorker, (lazyRoutes)]` — jit-compilation.ts L145
  - `AotCompilation: before = [...prepareEmit().transformers.before, replaceBootstrap, webWorker, (lazyRoutes)]` — aot-compilation.ts L355
    - `typeScriptProgram.emitNextAffectedFile(writeFile, …, transformers)` — jit L159 ／ aot は AotCompilation の章 — *1 ファイルずつ*
      - `visitDecorator → getDecoratorOrigin → createResourceImport` — jit-resource-transformer.ts L80・L265・L244 — *JIT*
      - `replaceBootstrap → elideImports` — jit-bootstrap-transformer.ts L17・L100 — *AOT*
      - `createWorkerTransformer → processWebWorker → bundleWebWorker` — web-worker-transformer.ts L72 → compiler-plugin.ts L273
  - `esbuild onResolve(angular:jit:…) → onLoad(text)` — jit-plugin-callbacks.ts L74・L143 — *JIT*
  - `esbuild onLoad(.js) → JavaScriptTransformer → oxc の transform` — 第 1 回

## テストと直し方

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/angular-compilation_spec.ts` L169–195 （▶ の行: 170, 172, 175, 177）

```ts
169 │   describe('createAngularCompilation', () => {
170 ▶     it('creates JitCompilation when mode is "jit"', async () => {
171 │       const compilation = await createAngularCompilation('jit', true, false);
172 ▶       expect(compilation.constructor.name).toBe('JitCompilation');
173 │     });
174 │ 
175 ▶     it('creates AotCompilation when mode is "aot"', async () => {
176 │       const compilation = await createAngularCompilation('aot', true, false);
177 ▶       expect(compilation.constructor.name).toBe('AotCompilation');
178 │     });
179 │ 
180 │     it('creates JitCompilation when mode is boolean true (legacy)', async () => {
181 │       const compilation = await createAngularCompilation(true, true, false);
182 │       expect(compilation.constructor.name).toBe('JitCompilation');
183 │     });
184 │ 
185 │     it('creates AotCompilation when mode is boolean false (legacy)', async () => {
186 │       const compilation = await createAngularCompilation(false, true, false);
187 │       expect(compilation.constructor.name).toBe('AotCompilation');
188 │     });
189 │ 
190 │     it('throws when mode is "transform"', async () => {
191 │       await expectAsync(createAngularCompilation('transform', true, false)).toBeRejectedWithError(
192 │         'Transform compilation mode is not supported.',
193 │       );
194 │     });
195 │   });
```

44129f66a3 の unit の target（`//packages/angular/build:test`）には、この 3 つの transformer の spec がありません。`src/` の中でこの 3 つのファイルを import するのは `aot-compilation.ts`・`jit-compilation.ts`・`private.ts`（`createJitResourceTransformer` を外に出す）だけです。unit の target で一番近いのは、`angular-compilation_spec.ts` の `describe('createAngularCompilation')`（169 行目）で、`'jit'` なら `JitCompilation`、`'aot'` なら `AotCompilation` ができることを 5 つの it で見ます。書き換えた出力は、application builder の統合の target が見ます。`behavior/web-workers-application_spec.ts` の 1 つの it は、出力の JS が `new Worker(new URL("worker-[A-Z0-9]{8}.js", import.meta.url)` の正規表現に合うかを見て、`behavior/component-stylesheets_spec.ts` の「missing stylesheet with JIT」の it は、`aot: false` で無いスタイルのファイルが「Could not resolve」のエラーになることを見ます。

📄 `走らせたコマンド`

```
cd ~/angular-research/angular-cli-fix   # 44129f66a3
# unit の target：3 つの transformer の spec は無い。どの compilation を作るかの spec だけ
pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=AngularCompilation createAngularCompilation'
# application builder の統合の target：Worker の書き換えと、JIT の styleUrl を通る it
pnpm bazel test //packages/angular/build:application_integration_tests --nocache_test_results --test_output=all \
  '--test_arg=--filter=Behavior: "(Bundles web worker files within application code|Rebuilds when Web Worker files change|Component Stylesheets)"'
```

📄 `結果（出力から抜き出したもの）`

```
//packages/angular/build:test：Ran 1 of 611 specs ×3、Ran 2 of 612 specs（合計 5 specs, 0 failures）PASSED in 0.7s
//packages/angular/build:application_integration_tests：25 の shard のうち 7 つが Ran 1 of 374 specs（合計 7 specs, 0 failures）、18 は 0 specs
                                                         PASSED in 6.3s
```

origin/main では、174eb34540 が `transformers/jit-bootstrap-transformer_spec.ts` を足しました（`describe('replaceBootstrap')`、2 つの it）。2 つ目の it「removes only platformBrowserDynamic specifier when another runtime export from the same module is used」は、記録の「ほかの名前と同じ import」と同じ `VERSION` を使う入力です。

直すとしたら、`styles` の値が変数のときの重複は、`jit-resource-transformer.ts` の `visitComponentMetadata` の 196 行目（文字列でも配列でもない `styles` を残す枝）と、`visitDecorator` の 113〜120 行目（`styles` を足す所）です。たとえば残した式を `...shared` として `styleReplacements` に入れる形にすれば、property は 1 つになります。spec は、まだ resource の transformer の spec のファイルが無いので、origin/main の `jit-bootstrap-transformer_spec.ts` と同じ形（メモリの上の Program で emit して `toContain`）で `jit-resource-transformer_spec.ts` を作り、記録の 3 つの入力を it にする形になります。

## 聞かれそうな質問

**Q. AOT のビルドでも templateUrl を import に替えるのですか？**

いいえ。`createJitResourceTransformer` は JIT の compilation（87・147 行目）にしか入りません。AOT では Angular のコンパイラが host を通してテンプレートとスタイルを読み（[AotCompilation の章](../cli/03-cli-angular-compilation.md)の `angular-host`）、出力の `ɵcmp` は命令の列とスタイルの文字列になります。

**Q. platformBrowserDynamic を自分で platformBrowser に書き換える必要はありますか？**

AOT のビルドでは、2 節の `replaceBootstrap` が識別子の呼び出し `platformBrowserDynamic(…)` を置き換えます（27 行目、名前空間を通した `x.platformBrowserDynamic()` は対象外）。同じ import から別の名前も読んでいると、44129f66a3 では import の宣言が残り、174eb34540（22.2.7 にも入っている）で名前だけが消えるようになりました。

**Q. Worker の URL に変数を使うとどうなりますか？**

3 節の 60 行目で文字列のリテラルでないと止まり、そのまま出力に残ります。Worker のファイルは束ねられず、出力にも入りません（記録の「書き換えない形」の `b`）。`new URL('./x.worker', base)` のように 2 つ目が `import.meta.url` でないものも同じです。

**Q. Worker に `type: 'module'` を書かなくてよいのはなぜですか？**

書き換えるときに、2 つ目の引数が無ければ 103〜108 行目で `{ type: "module" }` を足すからです。書いてあれば 102 行目でそのまま使うので、`{ type: 'module', name: 'a' }` の `name` も残ります（記録の「new Worker(new URL(…))」）。

**Q. JIT の `main.js` の中で、テンプレートはどんな形ですか？**

1 節の 154 行目で `template: __NG_CLI_RESOURCE__0` になり、その import を esbuild が `jit-plugin-callbacks.ts` の 146・150 行目で「HTML の文字列を default export するモジュール」として読み込むので、束ねた後は HTML の文字列そのものです。ブラウザの `@angular/compiler` がそれをコンパイルします。

## 読み終えて

- 3 つの transformer は TypeScript の emit の `before` に入り、oxc の変換より前に TypeScript の木を書き換える。resource は JIT だけ、bootstrap は AOT だけ、Worker は両方。
- `createJitResourceTransformer` は型の checker で `@angular/core` の `Component` だけを選び、`templateUrl` を `template` の import に、`styles` と `styleUrl(s)` を 1 つの `styles` の配列（インラインが先）にする。
- `styles` の値が変数で `styleUrl` もあると、`styles` のキーが 2 つになり、変数のスタイルは渡らない（記録）。
- `replaceBootstrap` は名前で `platformBrowserDynamic(…)` を置き換え、`elideImports` が型の checker で使われない import を数える。名前だけを消す道は 174eb34540 で直った。
- `createWorkerTransformer` は `new Worker(new URL('…', import.meta.url))` の形だけを、その場で束ねた Worker の出力の名前に替え、options が無ければ `type: "module"` を足す。

---

← 前: [linker の読み書き：OxcAstHost と StringAstFactory](03-oxc-linker-host.md)  
次: [spec と issue を読む：oxc の変換と transformer を固めているテスト](05-oxc-tests-issues.md) →
