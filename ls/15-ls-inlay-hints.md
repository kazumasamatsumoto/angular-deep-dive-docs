[目次](../README.md) › [言語サービスの内側](README.md) › 第 15 回 / 全 20 回

# インレイヒント：テンプレートに型を薄く書き足す

> inlay\_hints.ts（2000 行を超える）が、@for の変数・@let・@if の as・参照・イベントの $event・入力と DOM のプロパティ・pipe の戻り値・関数の引数名・@switch・@defer の when に型のヒントを付ける位置と、どのヒントを出すかの設定（InlayHintsConfig）。型は TCB の上で TypeScript に尋ねる。サーバーの handlers/inlay\_hints.ts が VS Code の設定を写す所と、何もせずに返す resolve。ページの上でヒントの位置を置くデモ。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ls-inlay-hints)

---

VS Code でテンプレートを開くと、`@for (item: User of users)` や `(click: MouseEvent)` のように、書いていない型が薄い文字で差し込まれて見えます。これがインレイヒントです。この章では、言語サービスの `provideInlayHints` がどのテンプレートを歩き、`getInlayHintsForTemplate` の訪問者（visitor）が**どの節点の、どの文字位置に、どの設定で**ヒントを置くか、型の文字列をどこで作るかを読みます。最後に LSP サーバーの `handlers/inlay_hints.ts` が VS Code の設定を読んでヒントを LSP の形に直す所と、何もしていない resolve を確かめます。

読む対象は `packages/language-service/src/inlay_hints.ts`（2,110 行。ほぼ全部が 209 行目から始まる 1 つの関数 `getInlayHintsForTemplate` の中）と、`language_service.ts` の `provideInlayHints`、`vscode-ng-language-service/server/src/handlers/inlay_hints.ts`（343 行）です。2026-02-23 の 5a6d88626b6（kbrilla さん「add angular template inlay hints support」）で入った新しい機能です。

1. [1. 全体像](01-ls-overview.md)
2. [2. VS Code クライアント](02-ls-client.md)
3. [3. LSP サーバー](03-ls-server-session.md)
4. [4. tsserver プラグイン](04-ls-ts-plugin.md)
5. [5. CompilerFactory](05-ls-compiler-factory.md)
6. [6. 外部テンプレート](06-ls-external-templates.md)
7. [7. カーソルの位置](07-ls-template-target.md)
8. [8. 診断](08-ls-diagnostics.md)
9. [9. ホバー](09-ls-quick-info.md)
10. [10. 定義へのジャンプ](10-ls-definitions.md)
11. [11. 参照と名前変更](11-ls-references-rename.md)
12. [12. 式の補完](12-ls-completions.md)
13. [13. 要素と属性の補完](13-ls-attribute-completions.md)
14. [14. シグネチャヘルプ](14-ls-signature-help.md)
15. **15. インレイヒント**（この章）
16. [16. 色分け](16-ls-semantic-tokens.md)
17. [17. 文書のシンボル](17-ls-document-symbols.md)
18. [18. コード修正](18-ls-code-fixes.md)
19. [19. リファクタリング](19-ls-refactorings.md)
20. [20. issue と PR を読む](20-ls-issues.md)

## 1. 入口：provideInlayHints はファイルの中の全部のクラスを歩く

📄 `angular/packages/language-service/src/language_service.ts` L246–275 （▶ の行: 251, 253, 256, 267–268, 271–272, 275）

```ts
246 │   provideInlayHints(
247 │     fileName: string,
248 │     span: ts.TextSpan,
249 │     config?: InlayHintsConfig,
250 │   ): AngularInlayHint[] {
251 ▶     // Use LsQuickInfo phase since inlay hints are similar in cost
252 │     return (
253 ▶       this.withCompilerAndPerfTracing(PerfPhase.LsQuickInfo, (compiler) => {
254 │         const hints: AngularInlayHint[] = [];
255 │ 
256 ▶         if (isTypeScriptFile(fileName)) {
257 │           // For TypeScript files, find all components and process their templates
258 │           const program = compiler.getCurrentProgram();
259 │           const sourceFile = program.getSourceFile(fileName);
260 │           if (!sourceFile) {
261 │             return hints;
262 │           }
263 │ 
264 │           const ttc = compiler.getTemplateTypeChecker();
265 │ 
266 │           // Walk the source file to find component/directive classes
267 ▶           const visit = (node: ts.Node): void => {
268 ▶             if (ts.isClassDeclaration(node) && node.name) {
269 │               // Try to get the template for this class (component) or host element (directive)
270 │               try {
271 ▶                 const template = ttc.getTemplate(node);
272 ▶                 const hostElement = ttc.getHostElement(node);
273 │ 
274 │                 // Process if we have either a template or host element
275 ▶                 if (template || hostElement) {
```

📄 `angular/packages/language-service/src/language_service.ts` L277–316 （▶ の行: 281, 290, 294, 300, 302）

```ts
277 │                   const typeCheckInfo: TypeCheckInfo = {
278 │                     declaration: node,
279 │                     nodes: template ?? [],
280 │                   };
281 ▶                   const templateHints = getInlayHintsForTemplate(
282 │                     compiler,
283 │                     typeCheckInfo,
284 │                     span,
285 │                     fileName,
286 │                     config,
287 │                   );
288 │                   hints.push(...templateHints);
289 │                 }
290 ▶               } catch {
291 │                 // Not a component/directive or error getting template, skip
292 │               }
293 │             }
294 ▶             ts.forEachChild(node, visit);
295 │           };
296 │ 
297 │           visit(sourceFile);
298 │         } else {
299 │           // For external template files (HTML), find the associated component
300 ▶           const typeCheckInfo = getTypeCheckInfoAtPosition(fileName, span.start, compiler);
301 │           if (typeCheckInfo) {
302 ▶             const templateHints = getInlayHintsForTemplate(
303 │               compiler,
304 │               typeCheckInfo,
305 │               span,
306 │               fileName,
307 │               config,
308 │             );
309 │             hints.push(...templateHints);
310 │           }
311 │         }
312 │ 
313 │         return hints;
314 │       }) ?? []
315 │     );
316 │   }
```

1. **251〜253 行目：計測の区切りはホバーと同じ**

   専用の区切りは無く、コメントのとおり「重さが似ている」としてホバーの `PerfPhase.LsQuickInfo` を使います。性能の記録ではホバーと混ざります。
2. **256〜297 行目：.ts ならファイルの全部のクラス**

   294 行目の `ts.forEachChild` で木を全部たどり、名前のあるクラスごとに 271 行目でテンプレート、272 行目でホスト要素（`host` の束縛）を取ります。どちらかがあれば 281 行目で本体を呼びます。290 行目、例外は黙って飛ばします（Angular のクラスでないと `getTemplate` が投げることがある）。
3. **298〜311 行目：.html ならそのテンプレートのコンポーネント 1 つ**

   300 行目、要求された範囲の始まりの位置から、そのテンプレートを持つコンポーネントを探します（[第 6 回](06-ls-external-templates.md)）。

LSP サーバーが呼ぶのは `provideInlayHints` ではなく `getAngularInlayHints` という名前で、tsserver プラグイン（ts\_plugin.ts:357〜363）が同じ引数で `provideInlayHints` に渡しています。TypeScript 自身のインレイヒント（`getInlayHints`）とは別の名前にして、.ts の普通のコードのヒントは VS Code の TypeScript 拡張に任せる作りです（handlers/inlay\_hints.ts:157〜158 のコメント）。

## 2. 本体の準備：どのファイルのヒントか、TCB、型の文字列

📄 `angular/packages/language-service/src/inlay_hints.ts` L209–243 （▶ の行: 216, 221, 223, 225–227, 233, 238, 241–242）

```ts
209 │ export function getInlayHintsForTemplate(
210 │   compiler: NgCompiler,
211 │   typeCheckInfo: TypeCheckInfo,
212 │   span: ts.TextSpan,
213 │   targetFileName: string,
214 │   config: InlayHintsConfig = {},
215 │ ): AngularInlayHint[] {
216 ▶   const mergedConfig = {...DEFAULT_CONFIG, ...config};
217 │   const hints: AngularInlayHint[] = [];
218 │   const ttc = compiler.getTemplateTypeChecker();
219 │ 
220 │   // Get the template AST (may be null for directives without templates)
221 ▶   const template = ttc.getTemplate(typeCheckInfo.declaration);
222 │   const templateFileUrl =
223 ▶     template && template.length > 0 ? template[0].sourceSpan.start.file.url : null;
224 │ 
225 ▶   const shouldProcessTemplate = templateFileUrl !== null && templateFileUrl === targetFileName;
226 ▶   const shouldProcessHostBindings =
227 ▶     typeCheckInfo.declaration.getSourceFile().fileName === targetFileName;
228 │ 
229 │   if (!shouldProcessTemplate && !shouldProcessHostBindings) {
230 │     return hints;
231 │   }
232 │ 
233 ▶   const typeChecker = compiler.getCurrentProgram().getTypeChecker();
234 │ 
235 │   // Get the Type Check Block for accessing resolved types
236 │   // The TCB has TypeScript's resolved types for all expressions, including
237 │   // overloaded function calls and generic type inference
238 ▶   const tcb = ttc.getTypeCheckBlock(typeCheckInfo.declaration);
239 │ 
240 │   // Helper to check if a position is within our requested span
241 ▶   const isInSpan = (pos: number): boolean => {
242 ▶     return pos >= span.start && pos < span.start + span.length;
243 │   };
```

1. **216 行目：設定は既定値に上書きする**

   呼ぶ側が渡さなかった項目は 3 節の `DEFAULT_CONFIG` になります。
2. **222〜231 行目：要求されたファイルの分だけ**

   テンプレートの最初の節点のファイル（223 行目）が要求されたファイルと同じときだけテンプレートを歩き（225 行目）、クラスのファイルと同じときだけホストの束縛を歩きます（226〜227 行目）。外部テンプレート（.html）のヒントが .ts のファイルに混ざって出ていた不具合を、2026-06-08 の 2e4ed8027dc（Andrew Scott さん）がこの形で直しました。
3. **233・238 行目：TypeScript の型検査器と、このコンポーネントの TCB**

   `getTypeCheckBlock` は TCB の関数の `ts.Node` を返します。pipe の戻り値や関数のシグネチャは、TCB の中の呼び出しの節点で TypeScript に「解決した結果」を尋ねるので（5 節）、TCB の木そのものが要ります。
4. **241〜243 行目：範囲の中だけ**

   エディタは画面に見えている範囲だけを要求します。節点の位置がその範囲に入るときだけヒントを作ります。

📄 `angular/packages/language-service/src/inlay_hints.ts` L245–255 （▶ の行: 247, 250, 253）

```ts
245 │   // Helper to format type string (remove unnecessary verbosity)
246 │   const formatType = (type: ts.Type): string => {
247 ▶     let typeStr = typeChecker.typeToString(
248 │       type,
249 │       undefined,
250 ▶       ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.OmitParameterModifiers,
251 │     );
252 │     // Simplify common patterns
253 ▶     typeStr = typeStr.replace(/import\([^)]+\)\./g, ''); // Remove import paths
254 │     return typeStr;
255 │   };
```

📄 `angular/packages/language-service/src/inlay_hints.ts` L298–337 （▶ の行: 299–300, 308, 310, 318, 333）

```ts
298 │     // Try to get the type's declaration for interactive hints
299 ▶     if (mergedConfig.interactiveInlayHints) {
300 ▶       const declInfo = getTypeDeclarationInfo(type);
301 │       if (declInfo) {
302 │         return {
303 │           position,
304 │           text: '',
305 │           kind: 'Type',
306 │           paddingLeft,
307 │           paddingRight,
308 ▶           displayParts: [
309 │             {
310 ▶               text: ': ',
311 │               span: {
312 │                 start: declInfo.start,
313 │                 length: declInfo.length,
314 │               },
315 │               file: declInfo.file,
316 │             },
317 │             {
318 ▶               text: typeStr,
319 │               span: {
320 │                 start: declInfo.start,
321 │                 length: declInfo.length,
322 │               },
323 │               file: declInfo.file,
324 │             },
325 │           ],
326 │         };
327 │       }
328 │     }
329 │ 
330 │     // Non-interactive hint
331 │     return {
332 │       position,
333 ▶       text: `: ${typeStr}`,
334 │       kind: 'Type',
335 │       paddingLeft,
336 │       paddingRight,
337 │     };
```

型を文字列にするのは 247 行目の `typeChecker.typeToString` です。250 行目の `NoTruncation` で長い型も省略せず、253 行目で `import("…").User` の `import(…).` を消します。ヒントの形は 333 行目の `` `: ${typeStr}` `` という 1 本の文字列です。299 行目、設定 `interactiveInlayHints` が真で、型に宣言があれば、`": "` と型名の 2 つの部品（`displayParts`）にして、それぞれに宣言の場所を付けます。押すと定義へ飛べるヒントになります。

## 3. 設定：DEFAULT\_CONFIG と、どの項目で何が消えるか

📄 `angular/packages/language-service/src/inlay_hints.ts` L70–106 （▶ の行: 72, 76, 83–84, 87, 90–91, 95, 98）

```ts
 70 │ const DEFAULT_CONFIG: Required<InlayHintsConfig> = {
 71 │   // Variable type hints (like TS includeInlayVariableTypeHints)
 72 ▶   forLoopVariableTypes: true,
 73 │   ifAliasTypes: true,
 74 │   letDeclarationTypes: true,
 75 │   referenceVariableTypes: true,
 76 ▶   variableTypeHintsWhenTypeMatchesName: true,
 77 │ 
 78 │   // Arrow function type hints (like TS function type hints)
 79 │   arrowFunctionParameterTypes: true,
 80 │   arrowFunctionReturnTypes: true,
 81 │ 
 82 │   // Parameter name hints (like TS includeInlayParameterNameHints)
 83 ▶   parameterNameHints: 'all',
 84 ▶   parameterNameHintsWhenArgumentMatchesName: false,
 85 │ 
 86 │   // Event type hints (Angular-specific)
 87 ▶   eventParameterTypes: true,
 88 │ 
 89 │   // Pipe and binding hints (Angular-specific)
 90 ▶   pipeOutputTypes: true,
 91 ▶   propertyBindingTypes: true,
 92 │   twoWayBindingSignalTypes: true,
 93 │ 
 94 │   // Visual differentiation
 95 ▶   requiredInputIndicator: 'none',
 96 │ 
 97 │   // Interactive hints (like TS interactiveInlayHints)
 98 ▶   interactiveInlayHints: false,
 99 │ 
100 │   // Host listener argument types (Angular-specific)
101 │   hostListenerArgumentTypes: true,
102 │ 
103 │   // Control flow block hints (Angular-specific)
104 │   switchExpressionTypes: true,
105 │   deferTriggerTypes: true,
106 │ };
```

ほとんどが真で、引数の名前は 83 行目の `'all'`（全部の引数）、引数が同じ名前の変数のときは 84 行目の `false` で出さない、必須の入力の印は 95 行目の `'none'`、押せるヒントは 98 行目の `false` が既定です。いくつかの項目は真偽値のほかに細かい指定を受け付けます。

📄 `angular/packages/language-service/src/inlay_hints.ts` L164–204 （▶ の行: 169, 172, 175, 177, 191, 198）

```ts
164 │ function normalizeIfAliasConfig(config: InlayHintsConfig['ifAliasTypes']): {
165 │   enabled: boolean;
166 │   simpleExpressions: boolean;
167 │   complexExpressions: boolean;
168 │ } {
169 ▶   if (config === false) {
170 │     return {enabled: false, simpleExpressions: false, complexExpressions: false};
171 │   }
172 ▶   if (config === true || config === undefined) {
173 │     return {enabled: true, simpleExpressions: true, complexExpressions: true};
174 │   }
175 ▶   if (config === 'complex') {
176 │     // Only show hints for complex expressions
177 ▶     return {enabled: true, simpleExpressions: false, complexExpressions: true};
178 │   }
179 │   return {
180 │     enabled: true,
181 │     simpleExpressions: config.simpleExpressions ?? true,
182 │     complexExpressions: config.complexExpressions ?? true,
183 │   };
184 │ }
185 │ 
186 │ /**
187 │  * Check if an @if expression is a "simple" expression.
188 │  * Simple: @if (variable; as alias) - just a property read from implicit receiver
189 │  * Complex: @if (var == 2; as alias), @if (var.prop; as alias), @if (fn(); as alias)
190 │  */
191 ▶ function isSimpleIfExpression(expression: AST | null): boolean {
192 │   if (!expression) return true;
193 │ 
194 │   // Unwrap ASTWithSource
195 │   const expr = expression instanceof ASTWithSource ? expression.ast : expression;
196 │ 
197 │   // Simple case: PropertyRead with ImplicitReceiver (e.g., @if (data; as result))
198 ▶   if (expr instanceof PropertyRead && expr.receiver instanceof ImplicitReceiver) {
199 │     return true;
200 │   }
201 │ 
202 │   // Everything else is complex
203 │   return false;
204 │ }
```

`ifAliasTypes` は 175〜177 行目の `'complex'` で「単純な式には出さない」にできます。単純とは 198 行目のとおり、`@if (data; as d)` のように名前を 1 つ読むだけの式です。`eventParameterTypes`（DOM・コンポーネント・アニメーションのイベント別）と `propertyBindingTypes`（DOM のプロパティ・入力別）も同じ形の `normalize…` 関数で 3 つの真偽値に直します。

## 4. どの節点に、どのヒントを置くか

訪問者は `TmplAstRecursiveVisitor` を継承した `InlayHintVisitor`（inlay\_hints.ts:437 から）です。テンプレートの節点の種類ごとの `visit…` メソッドが、表のとおりにヒントを置きます。式の中は、pipe を見る `PipeExpressionVisitor` と、関数呼び出しとアロー関数を見る `FunctionArgumentVisitor` の 2 つの `RecursiveAstVisitor` に渡します。

| メソッド | ヒントの例 | 置く位置 | 設定 | 型の出どころ |
| --- | --- | --- | --- | --- |
| `visitForLoopBlock` | `@for (item: User of users; let i: number = $index)` | 変数名の直後 | `forLoopVariableTypes` | 変数の記号の `getTypeOfSymbol` |
| `visitIfBlockBranch` | `@if (user; as u: User)` | `as` の名前の直後 | `ifAliasTypes` | 同上 |
| `visitVariable` | `<ng-template let-row: Row>`、`*ngFor="let x: T of xs"` | 変数名の直後 | `forLoopVariableTypes` | 同上 |
| `visitLetDeclaration` | `@let total: number = …` | 名前の直後 | `letDeclarationTypes` | `LetDeclarationSymbol` |
| `visitReference` | `#box: HTMLInputElement` | 名前の直後 | `referenceVariableTypes` | `ReferenceSymbol` |
| `visitBoundEvent` | `(click: MouseEvent)` | イベント名の直後 | `eventParameterTypes` | 出力の型 / ハンドラの `$event` の型 |
| `visitBoundAttribute` | `[size: number]`、`[(open: WritableSignal<boolean>)]` | 束縛名の直後 | `propertyBindingTypes`・`twoWayBindingSignalTypes`・`requiredInputIndicator` | 入力の型 / DOM の要素の型のプロパティ |
| `visitTextAttribute` | `size: number="3"`（入力に文字列で渡すとき） | 属性名の直後 | `propertyBindingTypes` | 入力の型 |
| `visitSwitchBlock` | `@switch (status: Status)` | 式の直後 | `switchExpressionTypes` | 式の記号 |
| `visitDeferredBlock` | `@defer (when ready: boolean)`（prefetch・hydrate の when も） | 式の直後 | `deferTriggerTypes` | 式の記号 |
| `PipeExpressionVisitor.visitPipe` | `value \| date : format: 'short': string \| null` | 引数の前と、最後の引数の直後 | `pipeOutputTypes`（引数名は `parameterNameHints` も） | TCB の `transform` 呼び出し |
| `FunctionArgumentVisitor` | `format(value: x, digits: 2)`、`(n: string) => : string …` | 引数の前、アロー関数の引数の直後と本体の前 | `parameterNameHints`・`arrowFunction…` | TCB の呼び出しで解決したシグネチャ |
| ホストの束縛（1825 行目から） | `host: {'[title]': …}`・`@HostListener` の引数 | .ts の中の束縛名 | `propertyBindingTypes`・`eventParameterTypes`・`hostListenerArgumentTypes` | 同上 |

### 変数のヒント：@for の例

📄 `angular/packages/language-service/src/inlay_hints.ts` L438–470 （▶ の行: 439, 442–444, 447, 449, 453, 465–470）

```ts
438 │     override visitForLoopBlock(block: TmplAstForLoopBlock): void {
439 ▶       if (mergedConfig.forLoopVariableTypes) {
440 │         // Get type hint for the main loop variable
441 │         const itemVar = block.item;
442 ▶         processedVariables.add(itemVar);
443 ▶         if (itemVar.keySpan && isInSpan(itemVar.keySpan.start.offset)) {
444 ▶           const symbol = ttc.getSymbolOfNode(itemVar, typeCheckInfo.declaration);
445 │           if (symbol && symbol.kind === SymbolKind.Variable) {
446 │             const varSymbol = symbol as VariableSymbol;
447 ▶             const typeStr = formatType(ttc.getTypeOfSymbol(varSymbol)!);
448 │             // Skip hint if type matches variable name (like TypeScript does)
449 ▶             if (shouldShowVariableTypeHint(typeStr, itemVar.name)) {
450 │               // Position after the variable name
451 │               hints.push(
452 │                 createTypeHint(
453 ▶                   itemVar.keySpan.end.offset,
454 │                   ttc.getTypeOfSymbol(varSymbol)!,
455 │                   typeStr,
456 │                   false,
457 │                   true,
458 │                 ),
459 │               );
460 │             }
461 │           }
462 │         }
463 │ 
464 │         // Get type hints for context variables ($index, $count, etc.)
465 ▶         // Only process context variables that have non-empty keySpans.
466 ▶         // The parser creates implicit context variables with empty spans for all
467 ▶         // allowed names ($index, $first, $last, $even, $odd, $count), but only
468 ▶         // explicitly aliased ones (e.g., `let idx = $index`) have meaningful spans.
469 ▶         for (const contextVar of block.contextVariables) {
470 ▶           processedVariables.add(contextVar);
```

1. **443〜444 行目**

   変数の名前（`keySpan`）が範囲に入れば、`getSymbolOfNode` で変数の記号（TCB の中の位置）を取ります。
2. **447 行目**

   `getTypeOfSymbol` で `ts.Type` を取り、2 節の `formatType` で文字列にします。記号から型を引く道は [TemplateTypeChecker の章](../typecheck/19-typecheck-template-type-checker.md)の 4 節です。
3. **449 行目**

   型の名前と変数の名前が（大文字小文字を無視して）同じなら、設定 `variableTypeHintsWhenTypeMatchesName` が偽のとき出しません。`user: User` のような重複を消す TypeScript と同じ規則です。
4. **453 行目**

   位置は変数名の終わり（`keySpan.end`）です。
5. **465〜470 行目**

   パーサは `$index`・`$count` などの文脈の変数を、書かなくても全部作ります。そのうち `let i = $index` と名前を付けたものだけが空でない `keySpan` を持つので、それだけにヒントを付けます。
6. **442・470 行目**

   処理した変数を `processedVariables` に入れます。`TmplAstRecursiveVisitor` は `@for` の変数を `visitVariable` にも渡すので、二重に出さないためです（inlay\_hints.ts:431〜434 のコメント）。

📄 `angular/packages/language-service/src/inlay_hints.ts` L504–524 （▶ の行: 506, 509, 515–518, 520–521）

```ts
504 │     override visitIfBlockBranch(branch: TmplAstIfBlockBranch): void {
505 │       if (branch.expressionAlias) {
506 ▶         processedVariables.add(branch.expressionAlias);
507 │       }
508 │ 
509 ▶       const ifAliasConfig = normalizeIfAliasConfig(mergedConfig.ifAliasTypes);
510 │       if (ifAliasConfig.enabled && branch.expressionAlias) {
511 │         // Get type for @if alias: @if (condition; as result)
512 │         const aliasVar = branch.expressionAlias;
513 │ 
514 │         // Check if this expression should show a hint based on config
515 ▶         const isSimple = isSimpleIfExpression(branch.expression);
516 ▶         const shouldShow = isSimple
517 ▶           ? ifAliasConfig.simpleExpressions
518 ▶           : ifAliasConfig.complexExpressions;
519 │ 
520 ▶         if (shouldShow && aliasVar.keySpan && isInSpan(aliasVar.keySpan.start.offset)) {
521 ▶           const symbol = ttc.getSymbolOfNode(aliasVar, typeCheckInfo.declaration);
522 │           if (symbol && symbol.kind === SymbolKind.Variable) {
523 │             const varSymbol = symbol as VariableSymbol;
524 │             const typeStr = formatType(ttc.getTypeOfSymbol(varSymbol)!);
```

`@if` の `as` も同じ形で、515〜518 行目で 3 節の「単純・複雑」の設定を引きます。

### イベント：$event の型をどこから取るか

📄 `angular/packages/language-service/src/inlay_hints.ts` L544–569 （▶ の行: 546, 550, 554–556, 559, 562, 569）

```ts
544 │     override visitBoundEvent(event: TmplAstBoundEvent): void {
545 │       // Show event type hint after event name: (click: MouseEvent)
546 ▶       const eventConfig = normalizeEventConfig(mergedConfig.eventParameterTypes);
547 │       if (eventConfig.enabled && event.keySpan) {
548 │         // Two-way bindings already have a property-side hint on visitBoundAttribute.
549 │         // Skip event-side type hint to avoid duplicate labels like `[(value: T: T)]`.
550 ▶         if (event.type === ParsedEventType.TwoWay) {
551 │           // Continue into handler for parameter-name hints below.
552 │         } else if (isInSpan(event.keySpan.start.offset)) {
553 │           // Determine the event source to apply fine-grained config
554 ▶           const symbol = ttc.getSymbolOfNode(event, typeCheckInfo.declaration);
555 ▶           const isComponentEvent = symbol?.kind === SymbolKind.Output;
556 ▶           const isAnimationEvent =
557 │             event.type === ParsedEventType.LegacyAnimation ||
558 │             event.type === ParsedEventType.Animation;
559 ▶           const isNativeEvent = !isComponentEvent && !isAnimationEvent;
560 │ 
561 │           // Check if this event type should show hints based on config
562 ▶           const shouldShow =
563 │             (isNativeEvent && eventConfig.nativeEvents) ||
564 │             (isComponentEvent && eventConfig.componentEvents) ||
565 │             (isAnimationEvent && eventConfig.animationEvents);
566 │ 
567 │           if (shouldShow) {
568 │             // Get the $event type from the template type checker
569 ▶             const eventTypeResult = getEventType(event, typeCheckInfo, ttc, typeChecker);
```

📄 `angular/packages/language-service/src/inlay_hints.ts` L1704–1743 （▶ の行: 1705, 1708, 1713–1714, 1716, 1723, 1727, 1731, 1734, 1739）

```ts
1704 │     const symbol = ttc.getSymbolOfNode(event, typeCheckInfo.declaration);
1705 ▶     if (symbol && symbol.kind === SymbolKind.Output) {
1706 │       // Component/directive output event (@Output, output(), or model() change event)
1707 │       const outputSymbol = symbol as OutputBindingSymbol;
1708 ▶       const isDirectiveOrComponentOutput = outputSymbol.bindings.some(
1709 │         (binding) => binding.target.kind === SymbolKind.Directive,
1710 │       );
1711 │ 
1712 │       if (isDirectiveOrComponentOutput && outputSymbol.bindings.length > 0) {
1713 ▶         const bindingType = ttc.getTypeOfSymbol(outputSymbol.bindings[0])!;
1714 ▶         const resolvedType = unwrapAngularType(bindingType);
1715 │         return {
1716 ▶           typeStr: typeChecker.typeToString(resolvedType),
1717 │           tsType: resolvedType,
1718 │         };
1719 │       }
1720 │     }
1721 │ 
1722 │     // Animation events (check before DOM events)
1723 ▶     if (event.type === ParsedEventType.LegacyAnimation) {
1724 │       // Try to get AnimationEvent type from lib.dom
1725 │       const animationEventType = getGlobalDomType('AnimationEvent', typeChecker);
1726 │       return {
1727 ▶         typeStr: 'AnimationEvent',
1728 │         tsType: animationEventType,
1729 │       };
1730 │     }
1731 ▶     if (event.type === ParsedEventType.Animation) {
1732 │       // AnimationCallbackEvent is an Angular-specific type, no DOM equivalent
1733 │       return {
1734 ▶         typeStr: 'AnimationCallbackEvent',
1735 │         tsType: null,
1736 │       };
1737 │     }
1738 │ 
1739 ▶     const eventTypeFromHandler = getEventTypeFromHandler(event, typeCheckInfo, ttc, typeChecker);
1740 │     if (eventTypeFromHandler) {
1741 │       return eventTypeFromHandler;
1742 │     }
1743 │ 
```

📄 `angular/packages/language-service/src/inlay_hints.ts` L1796–1817 （▶ の行: 1800–1801, 1805–1806, 1815）

```ts
1796 │     let eventResult: EventTypeResult | null = null;
1797 │ 
1798 │     class EventTypeVisitor extends RecursiveAstVisitor {
1799 │       override visitPropertyRead(ast: PropertyRead, context: any): any {
1800 ▶         if (ast.name === '$event' && !(ast.receiver instanceof PropertyRead)) {
1801 ▶           const symbol = ttc.getSymbolOfNode(ast, typeCheckInfo.declaration);
1802 │           if (symbol && symbol.kind === SymbolKind.Expression) {
1803 │             const exprSymbol = symbol as ExpressionSymbol;
1804 │             eventResult = {
1805 ▶               typeStr: typeChecker.typeToString(ttc.getTypeOfSymbol(exprSymbol)!),
1806 ▶               tsType: ttc.getTypeOfSymbol(exprSymbol)!,
1807 │             };
1808 │           }
1809 │         }
1810 │         return super.visitPropertyRead(ast, context);
1811 │       }
1812 │     }
1813 │ 
1814 │     const visitor = new EventTypeVisitor();
1815 ▶     event.handler.visit(visitor);
1816 │     return eventResult;
1817 │   }
```

1. **550 行目**

   `[(value)]` の出力側には出しません。入力側（`visitBoundAttribute`）で出すので、`[(value: T: T)]` と二重になるのを避けます。
2. **554〜565 行目**

   記号が `Output` ならコンポーネントのイベント、`@trigger` 系ならアニメーション、それ以外は DOM のイベントとして、3 節の細かい設定で出すかを決めます。
3. **1705〜1719 行目**

   出力なら出力の型から `EventEmitter<T>`・`OutputEmitterRef<T>` などの包みをはがして（`unwrapAngularType`）`T` を出します。
4. **1723〜1737 行目**

   アニメーションは型を引かず、`AnimationEvent` か `AnimationCallbackEvent` という**決め打ちの名前**です。
5. **1739 行目 → 1796〜1817 行目**

   DOM のイベントは、ハンドラの中の `$event` を探し、その式の記号の型を使います。**ハンドラが `$event` を使っていなければ、DOM のイベントのヒントは出ません**（`(click)="save()"` には付かない）。

📄 `angular/packages/language-service/src/inlay_hints.ts` L594–610 （▶ の行: 596–597, 608）

```ts
594 │ 
595 │       // Show function argument parameter name hints for method calls in the handler
596 ▶       if (mergedConfig.parameterNameHints !== 'none') {
597 ▶         const visitor = new FunctionArgumentVisitor(
598 │           typeCheckInfo,
599 │           ttc,
600 │           typeChecker,
601 │           tcb,
602 │           hints,
603 │           isInSpan,
604 │           formatType,
605 │           mergedConfig,
606 │           createTypeHint,
607 │         );
608 ▶         event.handler.visit(visitor);
609 │       }
610 │     }
```

イベントのハンドラの中の関数呼び出しは、596 行目で引数名のヒントの訪問者に渡します。ハンドラの中の pipe は見ません（ハンドラに pipe は書けないため）。

### 入力と DOM のプロパティ

📄 `angular/packages/language-service/src/inlay_hints.ts` L751–790 （▶ の行: 751, 754, 760–761, 769, 773, 777, 783–785, 788）

```ts
751 ▶       const propertyConfig = normalizePropertyConfig(mergedConfig.propertyBindingTypes);
752 │       if (propertyConfig.enabled && attribute.keySpan) {
753 │         if (isInSpan(attribute.keySpan.start.offset)) {
754 ▶           if (attribute.type !== BindingType.Property && attribute.type !== BindingType.TwoWay) {
755 │             // Skip attr/style/class binding families for property type hints.
756 │             super.visitBoundAttribute(attribute);
757 │             return;
758 │           }
759 │ 
760 ▶           const symbol = ttc.getSymbolOfNode(attribute, typeCheckInfo.declaration);
761 ▶           if (symbol && symbol.kind === SymbolKind.Input) {
762 │             // Component/directive input - check if we should show it
763 │             if (propertyConfig.componentInputs) {
764 │               const inputSymbol = symbol as InputBindingSymbol;
765 │               // Get the first binding's type (usually there's only one)
766 │               if (inputSymbol.bindings.length > 0) {
767 │                 const binding = inputSymbol.bindings[0];
768 │                 // Unwrap InputSignal<T>, InputSignalWithTransform<T, _>, or ModelSignal<T>
769 ▶                 const unwrappedType = unwrapAngularType(ttc.getTypeOfSymbol(binding)!);
770 │                 const typeStr = formatType(unwrappedType);
771 │ 
772 │                 // Check if this is a required input (for visual indicator)
773 ▶                 const isRequired = isRequiredInput(
774 │                   ttc.getTsSymbolOfSymbol(binding) ?? undefined,
775 │                   typeChecker,
776 │                 );
777 ▶                 const requiredSuffix = getRequiredIndicator(
778 │                   isRequired,
779 │                   mergedConfig.requiredInputIndicator,
780 │                 );
781 │ 
782 │                 // For two-way bindings [(model)], optionally show that it expects WritableSignal<T>
783 ▶                 if (
784 ▶                   attribute.type === BindingType.TwoWay &&
785 ▶                   mergedConfig.twoWayBindingSignalTypes
786 │                 ) {
787 │                   // For two-way bindings, show WritableSignal<T>
788 ▶                   hints.push(
789 │                     createTypeHintWithSuffix(
790 │                       attribute.keySpan.end.offset,
```

754 行目、`[attr.x]`・`[class.x]`・`[style.x]` には出しません（型チェックがまだ型を見ていない束縛だから、と inlay\_hints.ts:2062〜2069 のコメントにあります）。入力なら 769 行目で `InputSignal<T>`・`ModelSignal<T>` の包みをはがし、773・777 行目で必須の入力に `*` か `!` を付けます（既定は付けない）。783〜785 行目、`[(x)]` には `WritableSignal<T>` と出します。DOM のプロパティのときは、要素の型（`HTMLInputElement` など）からプロパティの型を引きます。

## 5. pipe と関数：TCB の呼び出しで TypeScript に解決させる

📄 `angular/packages/language-service/src/inlay_hints.ts` L1005–1022 （▶ の行: 1010–1012, 1018）

```ts
1005 │     private getResolvedPipeReturnType(ast: BindingPipe): ts.Type | null {
1006 │       if (!this.tcb) return null;
1007 │ 
1008 │       // Find the call expression in the TCB using the pipe's source span
1009 │       // The TCB has: _pipe.transform(value, arg1, arg2, ...)
1010 ▶       const callExpr = findFirstMatchingNode(this.tcb, {
1011 ▶         withSpan: ast.sourceSpan,
1012 ▶         filter: ts.isCallExpression,
1013 │       });
1014 │ 
1015 │       if (callExpr) {
1016 │         // getTypeAtLocation on a call expression returns the resolved return type
1017 │         // This automatically handles overload resolution and generics!
1018 ▶         return this.typeChecker.getTypeAtLocation(callExpr);
1019 │       }
1020 │ 
1021 │       return null;
1022 │     }
```

📄 `angular/packages/language-service/src/inlay_hints.ts` L1110–1134 （▶ の行: 1112, 1116–1117, 1124, 1126, 1128, 1131–1132）

```ts
1110 │               // Get the return type using TypeScript's resolved type from the TCB call expression
1111 │               // This automatically handles overload resolution and generics!
1112 ▶               let returnType: ts.Type | null = this.getResolvedPipeReturnType(ast);
1113 │ 
1114 │               // Fallback: if we couldn't get the resolved type from TCB,
1115 │               // use the first matching signature's return type
1116 ▶               if (!returnType) {
1117 ▶                 returnType = signatureForParams.getReturnType();
1118 │               }
1119 │ 
1120 │               const returnTypeStr = this.formatType(returnType);
1121 │ 
1122 │               // Position hint after the last pipe argument, or after pipe name if no args
1123 │               let hintPosition: number;
1124 ▶               if (ast.args.length > 0) {
1125 │                 const lastArg = ast.args[ast.args.length - 1];
1126 ▶                 hintPosition = lastArg.sourceSpan.end;
1127 │               } else {
1128 ▶                 hintPosition = ast.nameSpan.end;
1129 │               }
1130 │ 
1131 ▶               this.hints.push(
1132 ▶                 this.createTypeHintFn(hintPosition, returnType, returnTypeStr, false, true),
1133 │               );
1134 │             }
```

pipe は TCB の中で `_pipe1.transform(value, 'short')` のような呼び出しになっています（[テンプレート型チェックの第 15 回](../typecheck/15-typecheck-refs-pipes.md)）。1010〜1013 行目で、テンプレートの pipe の範囲と同じ位置コメントを持つ `ts.CallExpression` を TCB から探し、1018 行目の `getTypeAtLocation` で「その呼び出しの結果の型」を取ります。`DatePipe` のように `transform` が何通りも宣言されていても、TypeScript が実際の引数で選んだ 1 つの戻り値になります。見つからなければ 1116〜1118 行目で最初のシグネチャの戻り値に落とします。位置は 1124〜1129 行目のとおり、最後の引数の直後（引数が無ければ pipe の名前の直後）です。

📄 `angular/packages/language-service/src/inlay_hints.ts` L1218–1247 （▶ の行: 1223, 1227, 1230–1231, 1244, 1247）

```ts
1218 │     private processCallArguments(
1219 │       receiver: AST,
1220 │       args: AST[],
1221 │       sourceSpan: {start: number; end: number},
1222 │     ): void {
1223 ▶       if (args.length === 0) return;
1224 │ 
1225 │       // Try to get the resolved signature from the TCB first
1226 │       // This handles overloads and generics correctly
1227 ▶       let signature = this.getResolvedSignature(sourceSpan);
1228 │ 
1229 │       // Fallback to the first signature from the receiver type
1230 ▶       if (!signature) {
1231 ▶         const receiverSymbol = this.ttc.getSymbolOfNode(receiver, this.typeCheckInfo.declaration);
1232 │         if (!receiverSymbol || receiverSymbol.kind !== SymbolKind.Expression) return;
1233 │ 
1234 │         const exprSymbol = receiverSymbol as ExpressionSymbol;
1235 │         const receiverType = ttc.getTypeOfSymbol(exprSymbol)!;
1236 │ 
1237 │         // Get call signatures from the receiver type
1238 │         const signatures = this.typeChecker.getSignaturesOfType(
1239 │           receiverType,
1240 │           ts.SignatureKind.Call,
1241 │         );
1242 │         if (signatures.length === 0) return;
1243 │ 
1244 ▶         signature = signatures[0];
1245 │       }
1246 │ 
1247 ▶       const parameters = signature.getParameters();
```

関数の引数名も同じで、1227 行目で TCB の呼び出しの節点から `getResolvedSignature`（TypeScript が選んだ 1 つのシグネチャ）を取り、無ければ 1230〜1245 行目で受け手の型の最初のシグネチャに落とします。そのあと、引数が引数名と同じ名前の変数なら出さない、`'literals'` ならリテラルの引数だけ、可変長引数の最初に `...` を付ける、といった TypeScript と同じ規則で絞ります。

> [!NOTE]
> **ポイント**
>
> 設定どうしが絡む所があります。pipe の訪問者は `pipeOutputTypes` が真のときだけ作られるので、pipe の引数名のヒントも `pipeOutputTypes` を切ると消えます。アロー関数のヒントは `FunctionArgumentVisitor` の中にあるので、`parameterNameHints` を `'none'` にすると `arrowFunctionParameterTypes` が真でも出ません。`visitLetDeclaration` は値の式をどちらの訪問者にも渡さないので、`@let x = a | async` の pipe にはヒントが付きません。下のデモで切り替えて確かめられます。

## 6. テンプレートとホストの束縛を歩く

📄 `angular/packages/language-service/src/inlay_hints.ts` L1819–1843 （▶ の行: 1820–1822, 1831–1832, 1838, 1841–1842）

```ts
1819 │   // Visit the template (if it exists - directives without templates will skip this)
1820 ▶   if (template && shouldProcessTemplate) {
1821 ▶     const visitor = new InlayHintVisitor();
1822 ▶     tmplAstVisitAll(visitor, template);
1823 │   }
1824 │ 
1825 │   // Also process host element bindings (from component/directive host property and @HostBinding/@HostListener)
1826 │   // NOTE: Host bindings have keySpan positions in the TypeScript file (not template), so we use
1827 │   // a separate isInSpan check that accounts for the host binding positions being in TS source.
1828 │   // When the span parameter covers only part of the file (e.g., visible area), host binding
1829 │   // positions might be outside that range, but they should still be shown since they belong
1830 │   // to this component. We create a helper function that checks if we're requesting the whole file.
1831 ▶   const hostElement = ttc.getHostElement(typeCheckInfo.declaration);
1832 ▶   if (hostElement && shouldProcessHostBindings) {
1833 │     // For host bindings, check if the position is within the requested span.
1834 │     // Host binding keySpan positions are absolute TypeScript file positions.
1835 │     const isHostBindingInSpan = (pos: number): boolean => {
1836 │       // If pos < 0, it's a dummy span, skip it
1837 │       if (pos < 0) return false;
1838 ▶       // Always show host binding hints (they're conceptually part of the component)
1839 │       // The keySpan positions are in TypeScript source, but the span might only cover
1840 │       // part of the file. Since host bindings are always associated with the component,
1841 ▶       // we should show them regardless of whether they're in the visible range.
1842 ▶       return pos >= span.start && pos < span.start + span.length;
1843 │     };
```

ここまでの訪問者の定義のあと、1820〜1823 行目でテンプレートを、1831 行目からホストの束縛を歩きます。1838〜1841 行目のコメントは「見えている範囲の外でもホストの束縛のヒントは出す」と書いていますが、1842 行目のコードは範囲の中だけを真にしています。コメントとコードが食い違っているので、読むときはコードを信じます。

## 7. LSP サーバー：設定を読み、LSP の InlayHint に直す

📄 `angular/vscode-ng-language-service/server/src/handlers/inlay_hints.ts` L173–203 （▶ の行: 173, 181, 184–185, 196–197, 199, 201）

```ts
173 ▶   const [startOffset, endOffset] = lspRangeToTsPositions(scriptInfo, params.range);
174 │   const span = {start: startOffset, length: endOffset - startOffset};
175 │ 
176 │   // Request workspace configuration from the client for Angular inlay hints.
177 │   let angularConfig: InlayHintsConfig = {};
178 │ 
179 │   try {
180 │     // Request configuration from the client using shared config infrastructure
181 ▶     const configResult = await getWorkspaceConfigurationCached<Record<string, unknown>>(
182 │       session.connection,
183 │       [
184 ▶         {section: 'angular.inlayHints', scopeUri: params.textDocument.uri},
185 ▶         {section: 'editor.inlayHints', scopeUri: params.textDocument.uri},
186 │       ],
187 │     );
188 │ 
189 │     if (configResult && configResult.length >= 2) {
190 │       // Flatten each config section using the shared utility
191 │       const flatConfig: Record<string, unknown> = {
192 │         ...flattenConfiguration(configResult[0] ?? {}, 'angular.inlayHints'),
193 │         ...flattenConfiguration(configResult[1] ?? {}, 'editor.inlayHints'),
194 │       };
195 │ 
196 ▶       if (!isEditorInlayHintsEnabled(flatConfig)) {
197 ▶         return null;
198 │       }
199 ▶       angularConfig = mapAngularInlayHintsConfig(flatConfig);
200 │     }
201 ▶   } catch {
202 │     // If configuration request fails, use defaults
203 │   }
```

1. **173〜174 行目**

   エディタが要求した範囲（見えている範囲）を、ファイルの中の文字位置の `span` に直します。
2. **181〜187 行目**

   要求のたびに、クライアントへ `angular.inlayHints` と `editor.inlayHints` の 2 つの設定を尋ねます（キャッシュ付き。設定が変わるとキャッシュを捨ててエディタにヒントの取り直しを頼むのは session.ts:247〜253）。
3. **196〜198 行目**

   VS Code の `editor.inlayHints.enabled` が `off` なら何も返しません。
4. **199 行目**

   VS Code の設定の名前を `InlayHintsConfig` の項目に写します（下の引用）。

📄 `angular/vscode-ng-language-service/server/src/handlers/inlay_hints.ts` L41–66 （▶ の行: 42, 44, 62, 65）

```ts
41 │   const forLoopVariableTypes = getConfigValue<boolean>(
42 ▶     'angular.inlayHints.variableTypes.forLoopVariableTypes',
43 │   );
44 ▶   if (forLoopVariableTypes !== undefined) config.forLoopVariableTypes = forLoopVariableTypes;
45 │ 
46 │   const ifAliasTypes = getConfigValue<boolean | 'complex'>(
47 │     'angular.inlayHints.variableTypes.ifAliasTypes',
48 │   );
49 │   if (ifAliasTypes !== undefined) config.ifAliasTypes = ifAliasTypes;
50 │ 
51 │   const letDeclarationTypes = getConfigValue<boolean>(
52 │     'angular.inlayHints.variableTypes.letDeclarationTypes',
53 │   );
54 │   if (letDeclarationTypes !== undefined) config.letDeclarationTypes = letDeclarationTypes;
55 │ 
56 │   const referenceVariableTypes = getConfigValue<boolean>(
57 │     'angular.inlayHints.variableTypes.referenceVariableTypes',
58 │   );
59 │   if (referenceVariableTypes !== undefined) config.referenceVariableTypes = referenceVariableTypes;
60 │ 
61 │   const suppressWhenTypeMatchesName = getConfigValue<boolean>(
62 ▶     'angular.inlayHints.variableTypes.suppressWhenTypeMatchesName',
63 │   );
64 │   if (suppressWhenTypeMatchesName !== undefined) {
65 ▶     config.variableTypeHintsWhenTypeMatchesName = !suppressWhenTypeMatchesName;
66 │   }
```

設定の名前は `angular.inlayHints.` の下に `variableTypes.forLoopVariableTypes`・`variableTypes.ifAliasTypes`・`variableTypes.letDeclarationTypes`・`variableTypes.referenceVariableTypes`・`variableTypes.suppressWhenTypeMatchesName`・`functionTypes.arrowFunctionParameterTypes`・`functionTypes.arrowFunctionReturnTypes`・`parameterHints.nameHints`・`parameterHints.suppressWhenArgumentMatchesName`・`eventHints.parameterTypes`・`eventHints.hostListenerArgumentTypes`・`bindingHints.propertyBindingTypes`・`bindingHints.pipeOutputTypes`・`bindingHints.twoWayBindingSignalTypes`・`bindingHints.requiredInputIndicator`・`controlFlowHints.switchExpressionTypes`・`controlFlowHints.deferTriggerTypes`・`interaction.interactiveInlayHints` の 18 個で、拡張の package.json に宣言があります（中身は[第 2 回](02-ls-client.md)）。62〜65 行目のように、`suppressWhen…` の 2 つは設定の向きが逆なので `!` で反転して渡します。イベントとプロパティの細かい指定（3 節）は設定からは渡せず、真偽値だけです。

📄 `angular/vscode-ng-language-service/server/src/handlers/inlay_hints.ts` L205–240 （▶ の行: 211, 213, 219, 222–223, 227, 236–237, 239）

```ts
205 │   // Get Angular-specific inlay hints for templates
206 │   //    - @for item variable types: @for (user: User of users)
207 │   //    - @if alias types: @if (data; as result: ApiResult)
208 │   //    - $event parameter types: (click)="onClick($event: MouseEvent)"
209 │   //    - Pipe output types: {{ value | async }}
210 │   //    - @let declaration types
211 ▶   if (isNgLanguageService(languageService)) {
212 │     try {
213 ▶       const angularHints = languageService.getAngularInlayHints(
214 │         scriptInfo.fileName,
215 │         span,
216 │         angularConfig,
217 │       );
218 │       for (const angularHint of angularHints) {
219 ▶         const position = scriptInfo.positionToLineOffset(angularHint.position);
220 │         hints.push(convertAngularInlayHint(session, angularHint, position));
221 │       }
222 ▶     } catch (e) {
223 ▶       // Silently ignore - Angular hints are optional
224 │     }
225 │   }
226 │ 
227 ▶   return hints.length > 0 ? hints : null;
228 │ }
229 │ 
230 │ /**
231 │  * Handle the inlayHint/resolve request.
232 │  *
233 │  * This is called when the user requests lazy resolution for an inlay hint.
234 │  * For now, we just return the hint as-is since we don't have expensive data to defer.
235 │  */
236 ▶ export function onInlayHintResolve(session: Session, hint: lsp.InlayHint): lsp.InlayHint {
237 ▶   // Currently, all our hints are fully computed upfront.
238 │   // In the future, we could defer tooltip computation here.
239 ▶   return hint;
240 │ }
```

📄 `angular/vscode-ng-language-service/server/src/handlers/inlay_hints.ts` L256–290 （▶ の行: 257, 261, 267, 275, 282–283, 286）

```ts
256 │   // Map Angular hint kind to LSP InlayHintKind
257 ▶   const kind = angularHint.kind === 'Type' ? lsp.InlayHintKind.Type : lsp.InlayHintKind.Parameter;
258 │ 
259 │   // Build the label - can be string or InlayHintLabelPart[] for interactive hints
260 │   let label: string | lsp.InlayHintLabelPart[];
261 ▶   if (angularHint.displayParts && angularHint.displayParts.length > 0) {
262 │     // Interactive hints with navigation support
263 │     label = angularHint.displayParts.map((part) => {
264 │       const labelPart: lsp.InlayHintLabelPart = {
265 │         value: part.text,
266 │       };
267 ▶       const location = getDisplayPartLocation(session, part);
268 │       if (location) {
269 │         labelPart.location = location;
270 │       }
271 │       return labelPart;
272 │     });
273 │   } else {
274 │     // Non-interactive hints
275 ▶     label = angularHint.text;
276 │   }
277 │ 
278 │   const hint: lsp.InlayHint = {
279 │     position: lspPosition,
280 │     label,
281 │     kind,
282 ▶     paddingLeft: angularHint.paddingLeft,
283 ▶     paddingRight: angularHint.paddingRight,
284 │   };
285 │ 
286 ▶   if (angularHint.tooltip) {
287 │     hint.tooltip = angularHint.tooltip;
288 │   }
289 │ 
290 │   return hint;
```

1. **211・213 行目**

   tsserver の中の言語サービスが Angular のものなら `getAngularInlayHints` を呼びます。222〜224 行目、例外は黙って捨てます。
2. **219 行目と 257〜290 行目**

   文字位置を行と列にし、`kind` を `Type` か `Parameter` に、押せるヒントなら部品ごとに定義の場所（`location`）を付けます。
3. **236〜239 行目：resolve は何もしない**

   LSP にはヒントの詳細を後から取る `inlayHint/resolve` があり、サーバーも `resolveProvider: true` を宣言していますが（handlers/initialization.ts:58〜60）、受け取ったヒントをそのまま返すだけです。全部のヒントは最初の要求で作り終えています。

## 8. デモ：本物の parseTemplate の節点に、ヒントの位置を置く

> **🧪 DEMO — InlayHintVisitor の「位置と設定」の移植 + 本物の parseTemplate（@angular/compiler 22.1.6）**
>
> テンプレートを本物の `parseTemplate` で R3 AST と式の AST にし、本物と同じ節点・同じ位置（`keySpan.end` など）にヒントを置きます（移植です）。型は TypeScript と TCB が無いと決まらないので `?`、引数の名前は関数の宣言が無いので「引数名」と書きます。ディレクティブを登録していないので入力のヒント（`visitTextAttribute`）は出ません。設定を切り替えると、すぐに作り直します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ls-inlay-hints)

1. **そのまま押す**

   `(input: ?)` には付き、`(click)` には付きません（ハンドラが `$event` を使っていない。4 節）。`let i = $index` の `i` には付き、書いていない `$count` などには付きません。
2. **`pipeOutputTypes` を外す**

   `currency` の戻り値だけでなく、`'JPY'` の前の引数名も消えます。
3. **`parameterNameHints` を外す**

   `format(…)` の引数名と一緒に、`(n) => …` のアロー関数のヒントも消えます。

## 9. テストと直し方

spec は `packages/language-service/test/inlay_hints_spec.ts`（3,786 行）で、`describe` は外側の `describe('inlay hints')`（:13）を含めて 43 個、`it` は 126 本です（grep で数えました）。種類ごとの describe（`'@for loop variables'` :22、`'@if alias'` :83、`'event parameters'` :182、`'pipes'` :210、`'host event bindings'` :519 …）と、設定ごとの `describe('config options')`（:1754）の下に 11 個の describe、`'edge cases'`（:3276）の下に 7 個があります。

📄 `angular/packages/language-service/test/inlay_hints_spec.ts` L2016–2039 （▶ の行: 2017, 2024, 2032, 2035, 2037–2038）

```ts
2016 │     describe('disabling specific hint categories', () => {
2017 ▶       it('should respect forLoopVariableTypes: false', () => {
2018 │         const files = {
2019 │           'app.ts': `
2020 │             import {Component} from '@angular/core';
2021 │ 
2022 │             @Component({
2023 │               selector: 'app-cmp',
2024 ▶               template: \`@for (item of items; track $index) { {{ item }} }\`,
2025 │               standalone: false,
2026 │             })
2027 │             export class AppCmp {
2028 │               items = ['a', 'b', 'c'];
2029 │             }
2030 │           `,
2031 │         };
2032 ▶         project = createModuleAndProjectWithDeclarations(env, 'test', files);
2033 │         const appFile = project.openFile('app.ts');
2034 │ 
2035 ▶         const hints = appFile.getInlayHints({forLoopVariableTypes: false});
2036 │         // Should have no hints for @for variable
2037 ▶         const stringHint = hints.find((h) => h.text === ': string');
2038 ▶         expect(stringHint).toBeUndefined();
2039 │       });
```

`describe('disabling specific hint categories')`（2016 行目、it 3 本）の 1 本目です。2024 行目のインラインのテンプレートを `createModuleAndProjectWithDeclarations`（testing/src/util.ts）で NgModule ごと用意し、2035 行目で `forLoopVariableTypes: false` を渡して、2037〜2038 行目で `': string'` のヒントが無いことを確かめます。`getInlayHints` は testing/src/buffer.ts:154〜170 の手伝いで、範囲を省くとファイル全体を範囲にして `provideInlayHints` を呼びます。LSP サーバーの `handlers/inlay_hints.ts` を通す spec はありません。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/language-service/test:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=disabling specific hint categories"
```

📄 `出力（抜粋。2026-11-03 に実行。ログは scratchpad/ls-logs/d-inlay.log）`

```
==================== Test output for //packages/language-service/test:test (shard 2 of 4):
Ran 0 of 686 specs
0 specs, 0 failures
==================== Test output for //packages/language-service/test:test (shard 4 of 4):
Ran 1 of 687 specs
1 spec, 0 failures
==================== Test output for //packages/language-service/test:test (shard 3 of 4):
Ran 1 of 687 specs
1 spec, 0 failures
==================== Test output for //packages/language-service/test:test (shard 1 of 4):
Ran 1 of 687 specs
1 spec, 0 failures
INFO: Elapsed time: 1.681s, Critical Path: 1.47s
//packages/language-service/test:test                                    PASSED in 1.4s
```

1. **件数**

   0 + 1 + 1 + 1 = 3 本で、describe の中の it 3 本と一致しました。shard 2 は 0 本でも PASSED です。
2. **直すとしたら**

   「ヒントが出ない・位置がずれる」は、まず表の該当の `visit…` メソッド（位置は `keySpan.end` などの選び方）、「型の文字列が違う」は 2 節の `formatType` と、5 節の TCB の呼び出しを探す `findFirstMatchingNode` です。spec は種類ごとの describe に it を足します。6 節のコメントとコードの食い違いを直すなら、まず「範囲の外のホストの束縛のヒントは出るべきか」を `'host event bindings'`（:519）の it で確かめてから、どちらに合わせるかを決めます。
3. **issue**

   ラベル `area: language-service` の open 12 件・closed 120 件（2026-11-03 取得）に、インレイヒントの issue はありませんでした。機能が新しいので、使い始めた人の報告がこれから来る場所です（[第 20 回](20-ls-issues.md)）。

- 👤 `テンプレートを画面に表示` — VS Code — *textDocument/inlayHint（見えている範囲）*
  - `onInlayHint` — server/src/handlers/inlay\_hints.ts — *設定を尋ね、写す*
    - `getAngularInlayHints → LanguageService.provideInlayHints` — ts\_plugin.ts / language\_service.ts — *.ts なら全部のクラス*
      - `getInlayHintsForTemplate` — language-service/src/inlay\_hints.ts — *getTypeCheckBlock*
        - `InlayHintVisitor.visit… → getSymbolOfNode → getTypeOfSymbol → formatType` — inlay\_hints.ts / typecheck
        - `PipeExpressionVisitor / FunctionArgumentVisitor → findFirstMatchingNode(tcb) → getTypeAtLocation / getResolvedSignature` — inlay\_hints.ts / typescript
  - `convertAngularInlayHint` — handlers/inlay\_hints.ts — *LSP の InlayHint*

## 聞かれそうな質問

**Q. ヒントの型は誰が計算していますか？**

TypeScript です。変数などは `getSymbolOfNode` で TCB の位置を取って `getTypeOfSymbol`（447 行目）、pipe と関数は TCB の `ts.CallExpression` を探して `getTypeAtLocation`（1018 行目）や `getResolvedSignature`（1227 行目）で取ります。文字列にするのは 247 行目の `typeToString` です。

**Q. `(click)="save()"` に `MouseEvent` のヒントが出ないのはなぜですか？**

DOM のイベントの型は、ハンドラの中の `$event` の式の型から取るからです（1739 行目 → 1800〜1806 行目）。`$event` を使っていなければ型の取りようがなく、ヒントは出ません。コンポーネントの出力なら出力の型から取るので（1705〜1719 行目）出ます。

**Q. VS Code でヒントを全部消したいときは？**

`editor.inlayHints.enabled` を `off` にすると、サーバーが 196〜198 行目で何も返しません。Angular のヒントだけを種類ごとに消すなら `angular.inlayHints.…` の 18 個の設定で、サーバーが handlers/inlay\_hints.ts:29〜146 の `mapAngularInlayHintsConfig` で `InlayHintsConfig` に写します（引用は 41〜66 行目）。

**Q. ヒントを押して定義に飛べるようにするには？**

設定 `angular.inlayHints.interaction.interactiveInlayHints` を真にします。既定は 98 行目の `false` です。真なら 299〜327 行目で、型の宣言の場所を付けた部品（`displayParts`）を作り、サーバーが 261〜272 行目で LSP の `location` に直します。

**Q. inlayHint/resolve は何をしていますか？**

何もしていません。handlers/inlay\_hints.ts の 236〜240 行目で、受け取ったヒントをそのまま返します。全部の情報を最初の要求で作るからです。

## 読み終えて

- provideInlayHints は .ts ならファイルの全部のクラスのテンプレートとホストの束縛、.html ならそのテンプレートを歩く。外部テンプレートのヒントは .ts に混ぜない（225 行目）。
- ヒントの位置は R3 AST の keySpan.end などで決まり、型は TCB の上で TypeScript に尋ねて typeToString で文字列にする。
- pipe と関数は TCB の呼び出しの節点で「解決した」型とシグネチャを使うので、オーバーロードやジェネリクスも TypeScript と同じ答えになる。
- 設定は既定値に上書きする形。pipe の引数名は pipeOutputTypes、アロー関数は parameterNameHints にも縛られる。
- サーバーは毎回 VS Code の設定を尋ねて写すだけ。resolve は何もしない。

---

← 前: [シグネチャヘルプとリンクした編集](14-ls-signature-help.md)  
次: [色分け：TextMate の文法と意味のトークン](16-ls-semantic-tokens.md) →
