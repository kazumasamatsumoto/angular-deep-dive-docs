[目次](../README.md) › [テンプレートコンパイラの内側](README.md) › 第 2 回 / 全 18 回

# コンパイラの入口：ngtsc の ComponentDecoratorHandler から compileComponentFromMetadata まで

> ngtsc がデコレータを analyze → resolve → compileFull の順で処理し、resources.ts が template / templateUrl を読んで parseTemplate を呼ぶ行、parseTemplate の主なオプション（preserveWhitespaces、enableBlockSyntax、enableLetSyntax など。interpolation は形を検査されるだけで使われない）、compileComponentFromMetadata が ingestComponent → transform → emitTemplateFn の 3 手で template 関数を作り、ɵɵdefineComponent の引数を組み立てる流れ。シリーズ全体の入口と出口をつなぐ。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-entry)

---

`@Component({ template: ... })` と書いたテンプレートは、いつ、誰に読まれ、どんなオプションで解析され、最後にどうやって `static ɵcmp = ɵɵdefineComponent({...})` になるのか。この章では ngtsc（Angular の TypeScript コンパイラ）がデコレータを **analyze → resolve → compileFull** の 3 段で処理する流れの上に、テンプレートの読み込み（`resources.ts`）、`parseTemplate` のオプション、`compileComponentFromMetadata` の 3 手（ingest → transform → emit）を載せて、シリーズの入口と出口をつなぎます。

読む対象は compiler-cli の `ngtsc/core/src/compiler.ts`・`ngtsc/transform/src/compilation.ts`・`transform.ts`・ `annotations/component/src/handler.ts`・`resources.ts`・`typecheck/src/context.ts` と、compiler の `render3/view/template.ts`・`render3/view/compiler.ts`・`jit_compiler_facade.ts` です。

1. [1. 全体図](01-compiler.md)
2. **2. コンパイラの入口**（この章）
3. [3. HTML の字句解析](03-compiler-html-lexer.md)
4. [4. HTML の構文解析](04-compiler-html-parser.md)
5. [5. 式のパーサ](05-compiler-expression-parser.md)
6. [6. バインディングのパーサ](06-compiler-binding-parser.md)
7. [7. R3 AST](07-compiler-r3-ast.md)
8. [8. ブロック構文の解析](08-compiler-control-flow-blocks.md)
9. [9. ディレクティブの照合](09-compiler-binder.md)
10. [10. IR への写像](10-compiler-ingest.md)
11. [11. IR の構造](11-compiler-ir.md)
12. [12. decls・vars・advance](12-compiler-slots-vars.md)
13. [13. 変数とコンテキスト](13-compiler-variables.md)
14. [14. 定数配列と pure function](14-compiler-consts-pure.md)
15. [15. 制御フローのフェーズ](15-compiler-control-flow-phases.md)
16. [16. reify と出力](16-compiler-reify-emit.md)
17. [17. 型検査（TCB）](17-compiler-typecheck.md)
18. [18. スタイルのカプセル化](18-compiler-shadow-css.md)

## 1. ngtsc は @Component を 1 つのクラスに任せる

CLI（`@angular/build`）は `NgtscProgram` を作り、その中の `NgCompiler` に解析と出力を頼みます （CLI 側の流れは [boot シリーズのビルドの章](../boot/04-boot-application-build.md)）。`NgCompiler` はデコレータの種類ごとに「ハンドラ」を 1 つずつ用意します。`@Component` の担当は `ComponentDecoratorHandler` です。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L1502–1520 （▶ の行: 1505–1506, 1520）

```ts
1502 │     const jitDeclarationRegistry = new JitDeclarationRegistry();
1503 │ 
1504 │     // Set up the IvyCompilation, which manages state for the Ivy transformer.
1505 ▶     const handlers: DecoratorHandler<unknown, unknown, SemanticSymbol | null, unknown>[] = [
1506 ▶       new ComponentDecoratorHandler(
1507 │         reflector,
1508 │         evaluator,
1509 │         metaRegistry,
1510 │         metaReader,
1511 │         scopeReader,
1512 │         this.adapter,
1513 │         ngModuleScopeRegistry,
1514 │         typeCheckScopeRegistry,
1515 │         resourceRegistry,
1516 │         isCore,
1517 │         strictCtorDeps,
1518 │         this.resourceManager,
1519 │         this.adapter.rootDirs,
1520 ▶         this.options.preserveWhitespaces || false,
```

1505 行目の `handlers` 配列の先頭が `ComponentDecoratorHandler` です。コンストラクタ引数が多いのは、テンプレートの解析に効くオプションをここで全部受け取るからです。1520 行目が `preserveWhitespaces` の既定値で、tsconfig の `angularCompilerOptions.preserveWhitespaces` が無ければ `false`（空白を消す）です。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L464–471 （▶ の行: 464, 469–471）

```ts
464 ▶     this.angularCoreVersion = options['_angularCoreVersion'] ?? null;
465 │     this.delegatingPerfRecorder = new DelegatingPerfRecorder(this.perfRecorder);
466 │     this.usePoisonedData = usePoisonedData || !!options._compilePoisonedComponents;
467 │     this.enableTemplateTypeChecker =
468 │       enableTemplateTypeChecker || !!options._enableTemplateTypeChecker;
469 ▶     this.enableBlockSyntax =
470 ▶       this.angularCoreVersion === null ||
471 ▶       coreVersionSupportsFeature(this.angularCoreVersion, '>= 17.0.0');
```

`@if` などのブロック構文を解析するかどうかも、ここで決まります。469〜471 行目、`_angularCoreVersion`（ビルドツールが渡す `@angular/core` のバージョン）が無いか、17.0.0 以上なら `true`。`@let` も同じ形で 18.1.0 以上が条件です。古い core と組み合わせたときに、`@` を含む既存のテンプレートを壊さないための分岐です。

## 2. TraitCompiler：analyze → resolve → compile

ハンドラを呼び出す側は `TraitCompiler` です。「Trait」は「このクラスにはこのハンドラが担当するデコレータが付いている」という記録で、状態が Pending → Analyzed → Resolved と進みます。

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L422–445 （▶ の行: 423, 426, 430, 441, 443）

```ts
422 │     for (const trait of traits) {
423 ▶       const analyze = () => this.analyzeTrait(clazz, trait);
424 │ 
425 │       let preanalysis: Promise<void> | null = null;
426 ▶       if (preanalyzeQueue !== null && trait.handler.preanalyze !== undefined) {
427 │         // Attempt to run preanalysis. This could fail with a `FatalDiagnosticError`; catch it if it
428 │         // does.
429 │         try {
430 ▶           preanalysis = trait.handler.preanalyze(clazz, trait.detected.metadata) || null;
431 │         } catch (err) {
432 │           if (err instanceof FatalDiagnosticError) {
433 │             trait.toAnalyzed(null, [err.toDiagnostic()], null);
434 │             return;
435 │           } else {
436 │             throw err;
437 │           }
438 │         }
439 │       }
440 │       if (preanalysis !== null) {
441 ▶         preanalyzeQueue!.push(preanalysis.then(analyze));
442 │       } else {
443 ▶         analyze();
444 │       }
445 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L462–473 （▶ の行: 465, 467–468）

```ts
462 │     // Attempt analysis. This could fail with a `FatalDiagnosticError`; catch it if it does.
463 │     let result: AnalysisOutput<unknown>;
464 │     try {
465 ▶       result = trait.handler.analyze(clazz, trait.detected.metadata);
466 │     } catch (err) {
467 ▶       if (err instanceof FatalDiagnosticError) {
468 ▶         trait.toAnalyzed(null, [err.toDiagnostic()], null);
469 │         return;
470 │       } else {
471 │         throw err;
472 │       }
473 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L509–530 （▶ の行: 509, 522）

```ts
509 ▶         if (trait.analysis === null) {
510 │           // No analysis results, cannot further process this trait.
511 │           continue;
512 │         }
513 │ 
514 │         if (handler.resolve === undefined) {
515 │           // No resolution of this trait needed - it's considered successful by default.
516 │           trait = trait.toResolved(null, null);
517 │           continue;
518 │         }
519 │ 
520 │         let result: ResolveResult<unknown>;
521 │         try {
522 ▶           result = handler.resolve(clazz, trait.analysis as Readonly<unknown>, trait.symbol);
523 │         } catch (err) {
524 │           if (err instanceof FatalDiagnosticError) {
525 │             trait = trait.toResolved(null, [err.toDiagnostic()]);
526 │             continue;
527 │           } else {
528 │             throw err;
529 │           }
530 │         }
```

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L686–713 （▶ の行: 686, 690, 701, 704, 706）

```ts
686 ▶       if (this.compilationMode === CompilationMode.LOCAL) {
687 │         // `trait.analysis` is non-null asserted here because TypeScript does not recognize that
688 │         // `Readonly<unknown>` is nullable (as `unknown` itself is nullable) due to the way that
689 │         // `Readonly` works.
690 ▶         compileRes = trait.handler.compileLocal(
691 │           clazz,
692 │           trait.analysis!,
693 │           trait.resolution!,
694 │           constantPool,
695 │         );
696 │       } else {
697 │         // `trait.resolution` is non-null asserted below because TypeScript does not recognize that
698 │         // `Readonly<unknown>` is nullable (as `unknown` itself is nullable) due to the way that
699 │         // `Readonly` works.
700 │         if (
701 ▶           this.compilationMode === CompilationMode.PARTIAL &&
702 │           trait.handler.compilePartial !== undefined
703 │         ) {
704 ▶           compileRes = trait.handler.compilePartial(clazz, trait.analysis, trait.resolution!);
705 │         } else {
706 ▶           compileRes = trait.handler.compileFull(
707 │             clazz,
708 │             trait.analysis,
709 │             trait.resolution!,
710 │             constantPool,
711 │           );
712 │         }
713 │       }
```

1. **preanalyze（任意・非同期）：430 行目**

   ハンドラに `preanalyze` があれば先に呼び、返った Promise が済んでから 441 行目で analyze します。無ければ 443 行目ですぐ analyze。`ComponentDecoratorHandler` はここで templateUrl や styleUrls のファイルを先読みします（3 節）。
2. **analyze：465 行目**

   クラス 1 つ・デコレータ 1 つを、そのファイルの中だけで解析します。テンプレートの `parseTemplate` はここで走ります。467〜468 行目、ハンドラが投げた `FatalDiagnosticError` は診断に変えて記録し、ビルド全体は止めません。
3. **resolve：522 行目**

   全ファイルの analyze が終わってから呼ばれます。509 行目、analyze に失敗したクラスは飛ばします。コンポーネントでは、ここでスコープ（使えるディレクティブ・パイプ）を確定し、テンプレートを `R3TargetBinder` で照合して 実際に使っている依存を決めます（[第 9 回](09-compiler-binder.md)、[NgModule シリーズのスコープの章](../ngmodule/04-ngmodule-compilation-scope.md)）。
4. **compile：686〜713 行目**

   出力するときに 1 クラスずつ呼ばれます。通常のアプリは 706 行目の `compileFull`、ライブラリの部分コンパイル（`compilationMode: 'partial'`）は 704 行目の `compilePartial`、ローカルコンパイルは 690 行目の `compileLocal` です。

## 3. analyze の中でテンプレートを読む

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L717–757 （▶ の行: 723, 728, 731, 741, 751–752）

```ts
717 │     // Parse the template.
718 │     // If a preanalyze phase was executed, the template may already exist in parsed form, so check
719 │     // the preanalyzeTemplateCache.
720 │     // Extract a closure of the template parsing code so that it can be reparsed with different
721 │     // options if needed, like in the indexing pipeline.
722 │     let template: ParsedTemplateWithSource;
723 ▶     if (this.preanalyzeTemplateCache.has(node)) {
724 │       // The template was parsed in preanalyze. Use it and delete it to save memory.
725 │       const preanalyzed = this.preanalyzeTemplateCache.get(node)!;
726 │       this.preanalyzeTemplateCache.delete(node);
727 │ 
728 ▶       template = preanalyzed;
729 │     } else {
730 │       try {
731 ▶         const templateDecl = parseTemplateDeclaration(
732 │           node,
733 │           decorator,
734 │           component,
735 │           containingFile,
736 │           this.evaluator,
737 │           this.depTracker,
738 │           this.resourceLoader,
739 │           this.defaultPreserveWhitespaces,
740 │         );
741 ▶         template = extractTemplate(
742 │           node,
743 │           templateDecl,
744 │           this.evaluator,
745 │           this.depTracker,
746 │           this.resourceLoader,
747 │           {
748 │             enableI18nLegacyMessageIdFormat: this.enableI18nLegacyMessageIdFormat,
749 │             i18nNormalizeLineEndingsInICUs: this.i18nNormalizeLineEndingsInICUs,
750 │             usePoisonedData: this.usePoisonedData,
751 ▶             enableBlockSyntax: this.enableBlockSyntax,
752 ▶             enableLetSyntax: this.enableLetSyntax,
753 │             enableSelectorless: this.enableSelectorless,
754 │             preserveSignificantWhitespace: this.i18nPreserveSignificantWhitespace,
755 │           },
756 │           this.compilationMode,
757 │         );
```

723〜728 行目、preanalyze で解析済みならその結果を使います。そうでなければ 731 行目で `parseTemplateDeclaration`（どこにテンプレートがあるか）、741 行目で `extractTemplate`（読んで解析する）の 2 段です。751〜752 行目のブロック構文・`@let` の有効/無効は 1 節で決めた値です。

### parseTemplateDeclaration：どこにあるか、どのオプションか

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/resources.ts` L356–391 （▶ の行: 366–367, 373, 376, 380–382）

```ts
356 │ export function parseTemplateDeclaration(
357 │   node: ClassDeclaration,
358 │   decorator: Decorator,
359 │   component: Map<string, ts.Expression>,
360 │   containingFile: string,
361 │   evaluator: PartialEvaluator,
362 │   depTracker: DependencyTracker | null,
363 │   resourceLoader: ResourceLoader,
364 │   defaultPreserveWhitespaces: boolean,
365 │ ): TemplateDeclaration {
366 ▶   let preserveWhitespaces: boolean = defaultPreserveWhitespaces;
367 ▶   if (component.has('preserveWhitespaces')) {
368 │     const expr = component.get('preserveWhitespaces')!;
369 │     const value = evaluator.evaluate(expr);
370 │     if (typeof value !== 'boolean') {
371 │       throw createValueHasWrongTypeError(expr, value, 'preserveWhitespaces must be a boolean');
372 │     }
373 ▶     preserveWhitespaces = value;
374 │   }
375 │ 
376 ▶   if (component.has('interpolation')) {
377 │     const expr = component.get('interpolation')!;
378 │     const value = evaluator.evaluate(expr);
379 │     if (
380 ▶       !Array.isArray(value) ||
381 ▶       value.length !== 2 ||
382 ▶       !value.every((element) => typeof element === 'string')
383 │     ) {
384 │       throw createValueHasWrongTypeError(
385 │         expr,
386 │         value,
387 │         'interpolation must be an array with 2 elements of string type',
388 │       );
389 │     }
390 │   }
391 │ 
```

366 行目、`preserveWhitespaces` はまず 1 節の既定値（tsconfig の値か `false`）。367〜373 行目、`@Component({ preserveWhitespaces: true })` と書けばコンポーネント単位で上書きされます。

> [!WARNING]
> **ハマりどころ**
>
> 376〜390 行目の `interpolation`（`{{ }}` 以外の補間記号を使う昔のオプション）は、「長さ 2 の文字列配列か」を**検査するだけで、どこにも渡していません**。戻り値（404〜410 行目・425〜431 行目）にも入らず、`parseTemplate` のオプション（4 節）にも `interpolation` はありません。字句解析器は補間記号を `{{` / `}}` の定数で持っています（[第 3 回](03-compiler-html-lexer.md)）。v22 のソースでは、補間記号は変えられません。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/resources.ts` L392–438 （▶ の行: 392, 403, 405, 418, 424, 426, 429, 433–434）

```ts
392 ▶   if (component.has('templateUrl')) {
393 │     const templateUrlExpr = component.get('templateUrl')!;
394 │     const templateUrl = evaluator.evaluate(templateUrlExpr);
395 │     if (typeof templateUrl !== 'string') {
396 │       throw createValueHasWrongTypeError(
397 │         templateUrlExpr,
398 │         templateUrl,
399 │         'templateUrl must be a string',
400 │       );
401 │     }
402 │     try {
403 ▶       const resourceUrl = resourceLoader.resolve(templateUrl, containingFile);
404 │       return {
405 ▶         isInline: false,
406 │         preserveWhitespaces,
407 │         templateUrl,
408 │         templateUrlExpression: templateUrlExpr,
409 │         resolvedTemplateUrl: resourceUrl,
410 │       };
411 │     } catch (e) {
412 │       if (depTracker !== null) {
413 │         // The analysis of this file cannot be re-used if the template URL could
414 │         // not be resolved. Future builds should re-analyze and re-attempt resolution.
415 │         depTracker.recordDependencyAnalysisFailure(node.getSourceFile());
416 │       }
417 │ 
418 ▶       throw makeResourceNotFoundError(
419 │         templateUrl,
420 │         templateUrlExpr,
421 │         ResourceTypeForDiagnostics.Template,
422 │       );
423 │     }
424 ▶   } else if (component.has('template')) {
425 │     return {
426 ▶       isInline: true,
427 │       preserveWhitespaces,
428 │       expression: component.get('template')!,
429 ▶       templateUrl: containingFile,
430 │       resolvedTemplateUrl: containingFile,
431 │     };
432 │   } else {
433 ▶     throw new FatalDiagnosticError(
434 ▶       ErrorCode.COMPONENT_MISSING_TEMPLATE,
435 │       decorator.node,
436 │       '@Component is missing a template. Add either a `template` or `templateUrl`',
437 │     );
438 │   }
```

`templateUrl` があれば 403 行目で**パスを解決するだけ**（まだ読まない）、405 行目で `isInline: false`。ファイルが見つからなければ 418 行目の `makeResourceNotFoundError`（NG2008）です。`template` なら 426 行目で `isInline: true`、429 行目でソースマップ上の場所はコンポーネントの .ts ファイルそのものになります。どちらも無ければ 433〜434 行目の `COMPONENT_MISSING_TEMPLATE`（NG2001）です。

### extractTemplate：文字列を手に入れる

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/resources.ts` L148–170 （▶ の行: 157–158, 162–165）

```ts
148 │   if (template.isInline) {
149 │     let sourceStr: string;
150 │     let sourceParseRange: LexerRange | null = null;
151 │     let templateContent: string;
152 │     let sourceMapping: SourceMapping;
153 │     let escapedString = false;
154 │     let sourceMapUrl: string | null;
155 │     // We only support SourceMaps for inline templates that are simple string literals.
156 │     if (
157 ▶       ts.isStringLiteral(template.expression) ||
158 ▶       ts.isNoSubstitutionTemplateLiteral(template.expression)
159 │     ) {
160 │       // the start and end of the `templateExpr` node includes the quotation marks, which we must
161 │       // strip
162 ▶       sourceParseRange = getTemplateRange(template.expression);
163 ▶       sourceStr = template.expression.getSourceFile().text;
164 ▶       templateContent = template.expression.text;
165 ▶       escapedString = true;
166 │       sourceMapping = {
167 │         type: 'direct',
168 │         node: template.expression,
169 │       };
170 │       sourceMapUrl = template.resolvedTemplateUrl;
```

インラインテンプレートが文字列リテラルかテンプレートリテラル（157〜158 行目）なら、面白いことをします。163 行目、解析対象は**テンプレート部分の文字列ではなく .ts ファイル全体のテキスト**で、162 行目の `range` でその中の範囲だけを読ませます。165 行目の `escapedString = true` は「JS の文字列リテラルとして書かれているので `\n` などのエスケープを解いて読め」という指示です。こうすると、エラーの位置が .ts ファイルの行・列のまま出せます。エスケープを解きながら読むカーソルは [第 3 回](03-compiler-html-lexer.md)で読みます。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/resources.ts` L224–252 （▶ の行: 225, 227, 236, 238–239）

```ts
224 │   } else {
225 ▶     const templateContent = resourceLoader.load(template.resolvedTemplateUrl);
226 │     if (depTracker !== null) {
227 ▶       depTracker.addResourceDependency(
228 │         node.getSourceFile(),
229 │         absoluteFrom(template.resolvedTemplateUrl),
230 │       );
231 │     }
232 │ 
233 │     return {
234 │       ...parseExtractedTemplate(
235 │         template,
236 ▶         /* sourceStr */ templateContent,
237 │         /* sourceParseRange */ null,
238 ▶         /* escapedString */ false,
239 ▶         /* sourceMapUrl */ template.resolvedTemplateUrl,
240 │         options,
241 │       ),
242 │       content: templateContent,
243 │       sourceMapping: {
244 │         type: 'external',
245 │         componentClass: node,
246 │         node: template.templateUrlExpression,
247 │         template: templateContent,
248 │         templateUrl: template.resolvedTemplateUrl,
249 │       },
250 │       declaration: template,
251 │     };
252 │   }
```

外部ファイルは 225 行目の `resourceLoader.load` で**ここで初めて内容を読みます**（preanalyze で先読みしていれば、そのキャッシュから返ります）。227 行目で「この .ts は この .html に依存する」と記録するので、.html だけを書き換えたときもコンポーネントが再コンパイルされます。238 行目、外部ファイルはエスケープを解く必要がないので `false`。

### parseExtractedTemplate：2 回解析する

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/resources.ts` L299–324 （▶ の行: 310, 313–316, 320, 322–323）

```ts
299 │ function parseExtractedTemplate(
300 │   template: TemplateDeclaration,
301 │   sourceStr: string,
302 │   sourceParseRange: LexerRange | null,
303 │   escapedString: boolean,
304 │   sourceMapUrl: string | null,
305 │   options: ExtractTemplateOptions,
306 │ ): ParsedComponentTemplate {
307 │   // We always normalize line endings if the template has been escaped (i.e. is inline).
308 │   const i18nNormalizeLineEndingsInICUs = escapedString || options.i18nNormalizeLineEndingsInICUs;
309 │   const commonParseOptions: ParseTemplateOptions = {
310 ▶     range: sourceParseRange ?? undefined,
311 │     enableI18nLegacyMessageIdFormat: options.enableI18nLegacyMessageIdFormat,
312 │     i18nNormalizeLineEndingsInICUs,
313 ▶     alwaysAttemptHtmlToR3AstConversion: options.usePoisonedData,
314 ▶     escapedString,
315 ▶     enableBlockSyntax: options.enableBlockSyntax,
316 ▶     enableLetSyntax: options.enableLetSyntax,
317 │     enableSelectorless: options.enableSelectorless,
318 │   };
319 │ 
320 ▶   const parsedTemplate = parseTemplate(sourceStr, sourceMapUrl ?? '', {
321 │     ...commonParseOptions,
322 ▶     preserveWhitespaces: template.preserveWhitespaces,
323 ▶     preserveSignificantWhitespace: options.preserveSignificantWhitespace,
324 │   });
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/resources.ts` L326–353 （▶ の行: 330, 341, 343–346, 351）

```ts
326 │   // Unfortunately, the primary parse of the template above may not contain accurate source map
327 │   // information. If used directly, it would result in incorrect code locations in template
328 │   // errors, etc. There are three main problems:
329 │   //
330 ▶   // 1. `preserveWhitespaces: false` or `preserveSignificantWhitespace: false` annihilates the
331 │   //    correctness of template source mapping, as the whitespace transformation changes the
332 │   //    contents of HTML text nodes before they're parsed into Angular expressions.
333 │   // 2. `preserveLineEndings: false` causes growing misalignments in templates that use '\r\n'
334 │   //    line endings, by normalizing them to '\n'.
335 │   // 3. By default, the template parser strips leading trivia characters (like spaces, tabs, and
336 │   //    newlines). This also destroys source mapping information.
337 │   //
338 │   // In order to guarantee the correctness of diagnostics, templates are parsed a second time
339 │   // with the above options set to preserve source mappings.
340 │ 
341 ▶   const {nodes: diagNodes} = parseTemplate(sourceStr, sourceMapUrl ?? '', {
342 │     ...commonParseOptions,
343 ▶     preserveWhitespaces: true,
344 ▶     preserveLineEndings: true,
345 ▶     preserveSignificantWhitespace: true,
346 ▶     leadingTriviaChars: [],
347 │   });
348 │ 
349 │   return {
350 │     ...parsedTemplate,
351 ▶     diagNodes,
352 │     file: new ParseSourceFile(sourceStr, sourceMapUrl ?? ''),
353 │   };
```

320〜324 行目が本番用の 1 回目で、ここで `parseTemplate` が呼ばれます。341〜347 行目でもう 1 回、今度は空白も改行も先頭の空白も全部残す設定で解析し、結果を `diagNodes` にします。326〜339 行目のコメントのとおり、1 回目は空白の除去などでテキストの位置がずれるので、**エラーの位置を正しく出すための木を別に作っている**のです。型検査（[第 17 回](17-compiler-typecheck.md)）はこの `diagNodes` を使います。

## 4. parseTemplate のオプションと戻り値

📄 `angular/packages/compiler/src/render3/view/template.ts` L123–131 （▶ の行: 124, 127, 130）

```ts
123 │   /** Whether the @ block syntax is enabled. */
124 ▶   enableBlockSyntax?: boolean;
125 │ 
126 │   /** Whether the `@let` syntax is enabled. */
127 ▶   enableLetSyntax?: boolean;
128 │ 
129 │   /** Whether the selectorless syntax is enabled. */
130 ▶   enableSelectorless?: boolean;
131 │ }
```

| オプション | ngtsc が渡す値（resources.ts） | 効き目 |
| --- | --- | --- |
| `preserveWhitespaces` | 322 行目。コンポーネント &gt; tsconfig &gt; `false` | `false` なら空白だけのテキストを消し、連続する空白を 1 つにする（[第 4 回](04-compiler-html-parser.md)） |
| `preserveSignificantWhitespace` | 323 行目。i18n 用の設定 | i18n メッセージの空白の扱い |
| `enableBlockSyntax` / `enableLetSyntax` | 315〜316 行目。1 節の core バージョン判定 | 字句解析器が `@if` / `@let` をトークンにするか（[第 3 回](03-compiler-html-lexer.md)） |
| `enableSelectorless` | 317 行目 | selectorless 構文（[standalone シリーズ](../standalone/13-standalone-selectorless.md)） |
| `range` / `escapedString` | 310・314 行目。インラインの文字列リテラルのとき | .ts ファイルの中を直接読む（3 節） |
| `alwaysAttemptHtmlToR3AstConversion` | 313 行目。`usePoisonedData`（言語サービス） | 構文エラーがあっても R3 AST まで作る |
| `preserveLineEndings` / `leadingTriviaChars` | 2 回目だけ 344・346 行目 | 改行の正規化をしない / 先頭の空白をソースマップから外さない |

`parseTemplate` はこのオプションを `HtmlParser.parse` にほぼそのまま渡し、`enableBlockSyntax` / `enableLetSyntax` を 字句解析器の `tokenizeBlocks` / `tokenizeLet`（どちらも未指定なら `true`）に読み替えます （その 8 行は [standalone シリーズの selectorless の章](../standalone/13-standalone-selectorless.md)で引用済みです）。その後の流れは 2 か所だけ見ておきます。

📄 `angular/packages/compiler/src/render3/view/template.ts` L158–176 （▶ の行: 159–161, 165–166, 174）

```ts
158 │   if (
159 ▶     !options.alwaysAttemptHtmlToR3AstConversion &&
160 ▶     parseResult.errors &&
161 ▶     parseResult.errors.length > 0
162 │   ) {
163 │     const parsedTemplate: ParsedTemplate = {
164 │       preserveWhitespaces,
165 ▶       errors: parseResult.errors,
166 ▶       nodes: [],
167 │       styleUrls: [],
168 │       styles: [],
169 │       ngContentSelectors: [],
170 │     };
171 │     if (options.collectCommentNodes) {
172 │       parsedTemplate.commentNodes = [];
173 │     }
174 ▶     return parsedTemplate;
175 │   }
176 │ 
```

字句解析・構文解析でエラーが 1 つでもあれば、159〜161 行目の条件で**R3 AST を作らずに返します**。165〜166 行目、`errors` にエラー、`nodes` は空配列です。例外は投げません。

📄 `angular/packages/compiler/src/render3/view/template.ts` L256–276 （▶ の行: 256, 261, 265–266）

```ts
256 ▶   const {nodes, errors, styleUrls, styles, ngContentSelectors, commentNodes} = htmlAstToRender3Ast(
257 │     rootNodes,
258 │     bindingParser,
259 │     {collectCommentNodes: !!options.collectCommentNodes},
260 │   );
261 ▶   errors.push(...parseResult.errors, ...i18nMetaResult.errors);
262 │ 
263 │   const parsedTemplate: ParsedTemplate = {
264 │     preserveWhitespaces,
265 ▶     errors: errors.length > 0 ? errors : null,
266 ▶     nodes,
267 │     styleUrls,
268 │     styles,
269 │     ngContentSelectors,
270 │   };
271 │ 
272 │   if (options.collectCommentNodes) {
273 │     parsedTemplate.commentNodes = commentNodes;
274 │   }
275 │   return parsedTemplate;
276 │ }
```

HTML AST が無事にできれば、256 行目で R3 AST に変換します（[第 7 回](07-compiler-r3-ast.md)）。261 行目で全段のエラーを 1 つの配列にまとめ、265 行目、エラーが無ければ `null`。266 行目の `nodes` が R3 AST で、これが後で `ingestComponent` に渡ります。

## 5. テンプレートのエラーの行き先

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1586–1595 （▶ の行: 1592–1593）

```ts
1586 │   compileFull(
1587 │     node: ClassDeclaration,
1588 │     analysis: Readonly<ComponentAnalysisData>,
1589 │     resolution: Readonly<ComponentResolutionData>,
1590 │     pool: ConstantPool,
1591 │   ): CompileResult[] {
1592 ▶     if (analysis.template.errors !== null && analysis.template.errors.length > 0) {
1593 ▶       return [];
1594 │     }
1595 │ 
```

1592〜1593 行目、解析エラーのあるテンプレートは `compileFull` が**何も出力しません**。ではエラーはどこで報告されるのか。型検査の準備です。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1246–1258 （▶ の行: 1252, 1256）

```ts
1246 │ 
1247 │     const binder = new R3TargetBinder<TypeCheckableDirectiveMeta>(
1248 │       scope.matcher,
1249 │       scope.foreignMatcher,
1250 │     );
1251 │     const templateContext: TemplateContext = {
1252 ▶       nodes: meta.template.diagNodes,
1253 │       pipes: scope.pipes,
1254 │       sourceMapping: meta.template.sourceMapping,
1255 │       file: meta.template.file,
1256 ▶       parseErrors: meta.template.errors,
1257 │       preserveWhitespaces: meta.meta.template.preserveWhitespaces ?? false,
1258 │     };
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L655–680 （▶ の行: 660, 671, 676–677）

```ts
655 │ export function getTemplateDiagnostics(
656 │   parseErrors: ParseError[],
657 │   templateId: TypeCheckId,
658 │   sourceMapping: SourceMapping,
659 │ ): TemplateDiagnostic[] {
660 ▶   return parseErrors.map((error) => {
661 │     const span = error.span;
662 │ 
663 │     if (span.start.offset === span.end.offset) {
664 │       // Template errors can contain zero-length spans, if the error occurs at a single point.
665 │       // However, TypeScript does not handle displaying a zero-length diagnostic very well, so
666 │       // increase the ending offset by 1 for such errors, to ensure the position is shown in the
667 │       // diagnostic.
668 │       span.end.offset++;
669 │     }
670 │ 
671 ▶     return makeTemplateDiagnostic(
672 │       templateId,
673 │       sourceMapping,
674 │       span,
675 │       ts.DiagnosticCategory.Error,
676 ▶       ngErrorCode(ErrorCode.TEMPLATE_PARSE_ERROR),
677 ▶       error.msg,
678 │     );
679 │   });
680 │ }
```

handler.ts 1256 行目で `parseErrors` として型検査の文脈に渡され（1252 行目、木は 3 節の `diagNodes`）、context.ts 660〜679 行目で 1 件ずつ TypeScript の診断に変わります。コードは 676 行目の `TEMPLATE_PARSE_ERROR`（**NG5002**）、メッセージは 677 行目でパーサが作った文言そのままです。ビルドのログに出る「NG5002: Unexpected closing tag "p"...」はこの経路です。

## 6. compileFull → compileComponentFromMetadata

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1612–1622 （▶ の行: 1613）

```ts
1612 │ 
1613 ▶     const def = compileComponentFromMetadata(meta, pool, this.getNewBindingParser());
1614 │     const inputTransformFields = compileInputTransformFields(analysis.inputs);
1615 │     const classMetadata =
1616 │       analysis.classMetadata !== null
1617 │         ? compileComponentClassMetadata(analysis.classMetadata, perComponentDeferredDeps).toStmt()
1618 │         : null;
1619 │     const debugInfo =
1620 │       analysis.classDebugInfo !== null
1621 │         ? compileClassDebugInfo(analysis.classDebugInfo).toStmt()
1622 │         : null;
```

直前で analyze と resolve の結果を 1 つの `R3ComponentMetadata`（`meta`）にまとめ、1613 行目で `@angular/compiler` の `compileComponentFromMetadata` を呼びます。ここから先は compiler パッケージです。

📄 `angular/packages/compiler/src/render3/view/compiler.ts` L178–188 （▶ の行: 178, 183–184）

```ts
178 ▶ export function compileComponentFromMetadata(
179 │   meta: R3ComponentMetadata<R3TemplateDependency>,
180 │   constantPool: ConstantPool,
181 │   bindingParser: BindingParser,
182 │ ): R3CompiledExpression {
183 ▶   const definitionMap = baseDirectiveFields(meta, constantPool, bindingParser);
184 ▶   addFeatures(definitionMap, meta);
185 │ 
186 │   // e.g. `template: function MyComponent_Template(_ctx, _cm) {...}`
187 │   const templateTypeName = meta.name;
188 │ 
```

183 行目の `baseDirectiveFields` が `type`・`selectors`・inputs・outputs・host バインディングなど、ディレクティブと共通のフィールドを `definitionMap`（`ɵɵdefineComponent` に渡すオブジェクトの中身）に入れます。184 行目は `features`。

📄 `angular/packages/compiler/src/render3/view/compiler.ts` L206–226 （▶ の行: 207, 209, 223, 226）

```ts
206 │   // First the template is ingested into IR:
207 ▶   const tpl = ingestComponent(
208 │     meta.name,
209 ▶     meta.template.nodes,
210 │     constantPool,
211 │     compilationMode,
212 │     meta.relativeContextFilePath,
213 │     meta.i18nUseExternalIds,
214 │     meta.defer,
215 │     allDeferrableDepsFn,
216 │     meta.relativeTemplatePath,
217 │     meta.enableTemplateSourceLocations || ENABLE_TEMPLATE_SOURCE_LOCATIONS,
218 │     meta.legacyOptionalChaining,
219 │     meta.foreignImports,
220 │   );
221 │ 
222 │   // Then the IR is transformed to prepare it for code generation.
223 ▶   transform(tpl, CompilationJobKind.Tmpl);
224 │ 
225 │   // Finally we emit the template function:
226 ▶   const templateFn = emitTemplateFn(tpl, constantPool);
```

1. **207 行目：ingestComponent**

   209 行目の `meta.template.nodes`（4 節 266 行目の R3 AST）を IR に写します（[第 10 回](10-compiler-ingest.md)）。
2. **223 行目：transform**

   `Tmpl` のジョブとして 74 個のフェーズの配列を通します（[第 1 回](01-compiler.md) 5 節）。
3. **226 行目：emitTemplateFn**

   ルートのビューを `template` 関数の出力 AST にし、`@if` などの子ビューの関数は `constantPool.statements` に積みます （第 1 回の `Demo_Conditional_4_Template` がクラスの外に並んでいたのはこのため）。

📄 `angular/packages/compiler/src/render3/view/compiler.ts` L228–244 （▶ の行: 232–234, 241, 244）

```ts
228 │   if (tpl.contentSelectors !== null) {
229 │     definitionMap.set('ngContentSelectors', tpl.contentSelectors);
230 │   }
231 │ 
232 ▶   definitionMap.set('decls', o.literal(tpl.root.decls as number));
233 ▶   definitionMap.set('vars', o.literal(tpl.root.vars as number));
234 ▶   if (tpl.consts.length > 0) {
235 │     if (tpl.constsInitializers.length > 0) {
236 │       definitionMap.set(
237 │         'consts',
238 │         o.arrowFn([], [...tpl.constsInitializers, new o.ReturnStatement(o.literalArr(tpl.consts))]),
239 │       );
240 │     } else {
241 ▶       definitionMap.set('consts', o.literalArr(tpl.consts));
242 │     }
243 │   }
244 ▶   definitionMap.set('template', templateFn);
```

transform の結果から数字を取り出します。232〜233 行目の `decls` / `vars` はルートビューの値、234〜242 行目の `consts` は属性配列などの定数（i18n などで初期化の文が要るときは 238 行目で関数になる）、244 行目で `template`。

📄 `angular/packages/compiler/src/render3/view/compiler.ts` L290–298 （▶ の行: 290, 292, 296–297）

```ts
290 ▶   if (!hasStyles && meta.encapsulation === core.ViewEncapsulation.Emulated) {
291 │     // If there is no style, don't generate css selectors on elements
292 ▶     meta.encapsulation = core.ViewEncapsulation.None;
293 │   }
294 │ 
295 │   // Only set view encapsulation if it's not the default value
296 ▶   if (meta.encapsulation !== core.ViewEncapsulation.Emulated) {
297 ▶     definitionMap.set('encapsulation', o.literal(meta.encapsulation));
298 │   }
```

📄 `angular/packages/compiler/src/render3/view/compiler.ts` L323–328 （▶ の行: 324–325）

```ts
323 │   const expression = o
324 ▶     .importExpr(R3.defineComponent)
325 ▶     .callFn([definitionMap.toLiteralMap()], undefined, true);
326 │   const type = createComponentType(meta);
327 │ 
328 │   return {expression, type, statements: []};
```

290〜293 行目、スタイルが 1 つも無い `Emulated` は `None` に落とします。296〜297 行目、既定（Emulated）以外なら `encapsulation` を書きます。これが出力の `encapsulation: 2`（`ViewEncapsulation.None`）です。最後に 324〜325 行目、`definitionMap` をオブジェクトリテラルにして `ɵɵdefineComponent(...)` の呼び出し式を作ります。

📄 `small.js（ngc の出力。第 1 回と同じ入力）`

```
export class Small {
  t = 'hello';
  n = 1;
  static ɵfac = function Small_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || Small)(); };
  static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({
    type: Small,
    selectors: [["app-small"]],
    decls: 2,
    vars: 2,
    consts: [[3, "title"]],
    template: function Small_Template(rf, ctx) { ... },
    encapsulation: 2
  });
}
```

| 出力のフィールド | 入れた行 |
| --- | --- |
| `type` / `selectors` | compiler.ts 183 行目 `baseDirectiveFields` |
| `decls: 2` / `vars: 2` | 232〜233 行目 |
| `consts: [[3, "title"]]` | 241 行目 |
| `template: function Small_Template` | 226 行目で作り、244 行目で入れる |
| `encapsulation: 2` | 292・297 行目 |
| `/*@__PURE__*/ i0.ɵɵdefineComponent(...)` | 324〜325 行目（`callFn` の第 3 引数 `true` が pure の印） |

## 7. 出口：TypeScript のクラスに static フィールドを足す

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/transform.ts` L170–199 （▶ の行: 170, 177, 179, 196–198）

```ts
170 ▶     for (const field of compileResults) {
171 │       // Type-only member.
172 │       if (field.initializer === null) {
173 │         continue;
174 │       }
175 │ 
176 │       // Translate the initializer for the field into TS nodes.
177 ▶       const exprNode = translateExpression(
178 │         sourceFile,
179 ▶         field.initializer,
180 │         this.importManager,
181 │         translateOptions,
182 │       );
183 │ 
184 │       // Create a static property declaration for the new field.
185 │       let typeNode: ts.TypeNode | undefined = undefined;
186 │       if (this.enableTypeReification && this.refEmitter !== null) {
187 │         typeNode = translateType(
188 │           field.type,
189 │           sourceFile,
190 │           this.reflector,
191 │           this.refEmitter,
192 │           this.importManager,
193 │         );
194 │       }
195 │ 
196 ▶       const property = ts.factory.createPropertyDeclaration(
197 ▶         [ts.factory.createToken(ts.SyntaxKind.StaticKeyword)],
198 ▶         isUnsafeObjectKey(field.name) ? ts.factory.createStringLiteral(field.name) : field.name,
199 │         undefined,
```

ngtsc の出力変換（`IvyTransformationVisitor`）です。170 行目、`compileFull` が返した `ɵfac`・`ɵcmp` などのフィールドを 1 つずつ回し、177〜182 行目の `translateExpression` が compiler の出力 AST（179 行目の `field.initializer`）を TypeScript の AST に翻訳します。196〜198 行目で `static` 付きのプロパティ宣言を作り、元のクラスのメンバーに足します。あとは TypeScript がいつもどおり .js を書き出すだけです。**Angular は JS の文字列を自分で書かず、TypeScript の emit に乗っています**。

## 8. JIT の入口

📄 `angular/packages/compiler/src/jit_compiler_facade.ts` L791–811 （▶ の行: 799–800, 802, 804–805）

```ts
791 │ function parseJitTemplate(
792 │   template: string,
793 │   typeName: string,
794 │   sourceMapUrl: string,
795 │   preserveWhitespaces: boolean,
796 │   deferBlockDependencies: (() => Promise<unknown> | null)[] | undefined,
797 │ ) {
798 │   // Parse the template and check for errors.
799 ▶   const parsed = parseTemplate(template, sourceMapUrl, {preserveWhitespaces});
800 ▶   if (parsed.errors !== null) {
801 │     const errors = parsed.errors.map((err) => err.toString()).join(', ');
802 ▶     throw new Error(`Errors during JIT compilation of template for ${typeName}: ${errors}`);
803 │   }
804 ▶   const binder = new R3TargetBinder(null);
805 ▶   const boundTarget = binder.bind({template: parsed.nodes});
806 │ 
807 │   return {
808 │     template: parsed,
809 │     defer: createR3ComponentDeferMetadata(boundTarget, deferBlockDependencies),
810 │   };
811 │ }
```

JIT（ブラウザやテストで `@Component` を実行時にコンパイルする）では、ngtsc の 3 節〜5 節が `parseJitTemplate` の 20 行に縮みます。799 行目、渡すオプションは `preserveWhitespaces` だけで、ブロック構文などは `parseTemplate` の既定（有効）です。800〜802 行目、エラーがあれば診断ではなく **例外**を投げます。804〜805 行目で binder を通し、defer の依存を決めます。この後は第 1 回の Q&A で見た `compileComponentFromMeta` → 同じ `compileComponentFromMetadata` です。

## ここまでの呼び出し

- 👤 `ng build` — @angular/build — *NgtscProgram → NgCompiler*
  - `NgCompiler.analyzeAsync()` — compiler-cli/src/ngtsc/core/src/compiler.ts L786
    - `TraitCompiler.analyzeClass(clazz)` — ngtsc/transform/src/compilation.ts L414
      - `ComponentDecoratorHandler.preanalyze()` → `preloadAndParseTemplate()` — handler.ts L363 / resources.ts L441 — *templateUrl の先読み（可能なとき）*
      - `ComponentDecoratorHandler.analyze()` — handler.ts L483
        - `parseTemplateDeclaration()` → `extractTemplate()` — resources.ts L356 / L139
          - `parseExtractedTemplate()` → `parseTemplate()` × 2 — resources.ts L320, L341 — *本番用と diagNodes 用*
  - `TraitCompiler.resolve()` → `ComponentDecoratorHandler.resolve()` — compilation.ts L522 / handler.ts L1303 — *スコープと依存の確定*
  - `IvyCompilationVisitor.visitClassDeclaration()` → `TraitCompiler.compile()` — transform.ts L104 / compilation.ts L660
    - `ComponentDecoratorHandler.compileFull()` — handler.ts L1586
      - `compileComponentFromMetadata(meta, pool, bindingParser)` — compiler/src/render3/view/compiler.ts L178
        - `ingestComponent` → `transform` → `emitTemplateFn` — compiler.ts L207 / L223 / L226
        - `o.importExpr(R3.defineComponent).callFn([...])` — compiler.ts L323-325
  - `translateExpression(field.initializer)` → `static ɵcmp = ...` — transform.ts L177 / L196

## 聞かれそうな質問

**Q. templateUrl のファイルはいつ読まれますか？**

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L363–378 （▶ の行: 364–365, 368, 370, 376–377）

```ts
363 │   preanalyze(node: ClassDeclaration, decorator: Readonly<Decorator>): Promise<void> | undefined {
364 ▶     // In preanalyze, resource URLs associated with the component are asynchronously preloaded via
365 ▶     // the resourceLoader. This is the only time async operations are allowed for a component.
366 │     // These resources are:
367 │     //
368 ▶     // - the templateUrl, if there is one
369 │     // - any styleUrls if present
370 ▶     // - any stylesheets referenced from <link> tags in the template itself
371 │     //
372 │     // As a result of the last one, the template must be parsed as part of preanalysis to extract
373 │     // <link> tags, which may involve waiting for the templateUrl to be resolved first.
374 │ 
375 │     // If preloading isn't possible, then skip this step.
376 ▶     if (!this.resourceLoader.canPreload) {
377 ▶       return undefined;
378 │     }
```

2 通りです。リソースローダーが非同期の先読みに対応していれば（376 行目の `canPreload`）、analyze の前の preanalyze で読みます。364〜365 行目のとおり、コンポーネントで非同期処理が許されるのはここだけです。370 行目、テンプレート内の `<link>` のスタイルを見つけるために、このとき解析まで済ませてキャッシュします（analyze の 723〜728 行目でそれを使う）。先読みできなければ、analyze の中の `extractTemplate`（resources.ts 225 行目）で同期的に読みます。`parseTemplateDeclaration`（403 行目）はパスを解決するだけで読みません。

**Q. parseTemplate のエラーはどう報告されますか？**

`parseTemplate` は例外を投げず、`errors` 配列に入れて返します（template.ts 159〜166 行目、261 行目）。ngtsc では `compileFull` がそのコンポーネントを出力せず（handler.ts 1592〜1593 行目）、型検査の文脈に `parseErrors` として渡り（1256 行目）、`getTemplateDiagnostics` が NG5002 の診断にします（context.ts 676 行目）。ローカルコンパイルだけは型検査を飛ばすので、analyze の中で直接診断にします。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L759–771 （▶ の行: 760, 764–765, 771）

```ts
759 │         if (
760 ▶           this.compilationMode === CompilationMode.LOCAL &&
761 │           template.errors &&
762 │           template.errors.length > 0
763 │         ) {
764 ▶           // Template errors are handled at the type check phase. But we skip this phase in local
765 ▶           // compilation mode. As a result we need to handle the errors now and add them to the diagnostics.
766 │           if (diagnostics === undefined) {
767 │             diagnostics = [];
768 │           }
769 │ 
770 │           diagnostics.push(
771 ▶             ...getTemplateDiagnostics(
```

760 行目が `CompilationMode.LOCAL` の条件、764〜765 行目のコメントが「通常は型検査の段で扱う」ことをそのまま書いています。JIT では `parseJitTemplate` が `Error` を投げます（jit\_compiler\_facade.ts 802 行目）。

**Q. JIT ではどこから入りますか？**

実行時に `@Component` デコレータが評価されると、core が `@angular/compiler` の `CompilerFacadeImpl.compileComponent` を呼び、その中の `parseJitTemplate`（8 節、799 行目）で `parseTemplate`、続いて同じ `compileComponentFromMetadata` です （デコレータ側の経路は [standalone シリーズの @Component の章](../standalone/02-standalone-decorator.md)）。違いは、オプションが `preserveWhitespaces` だけなこと、エラーが例外になること、出力 AST を TypeScript ではなく JavaScript として即時評価することです。

**Q. @Component の interpolation オプションで `[[ ]]` を補間記号にできますか？**

v22.2 のソースではできません。resources.ts 376〜390 行目は値の形を検査するだけで、`parseTemplate` には何も渡していません。`ParseTemplateOptions` にも該当する項目が無く、字句解析器は `{{` / `}}` を定数で探します。

**Q. preserveWhitespaces は結局どこで決まりますか？**

優先順は「`@Component` の `preserveWhitespaces`」&gt;「tsconfig の `angularCompilerOptions.preserveWhitespaces`」&gt;「`false`」です。compiler.ts 1520 行目で既定が決まり、resources.ts 366〜373 行目でコンポーネントの値があれば上書きし、322 行目で `parseTemplate` に渡ります。何が消えるかは [第 4 回](04-compiler-html-parser.md)で読みます。

## 読み終えて

- ngtsc は `@Component` を `ComponentDecoratorHandler` に任せ、`TraitCompiler` が preanalyze → analyze → resolve → compile の順に呼ぶ
- テンプレートの読み込みと `parseTemplate` は analyze（templateUrl の先読みは preanalyze）。インラインの文字列リテラルは .ts ファイルを直接 range 付きで読む
- `parseTemplate` は 2 回呼ばれる。2 回目は空白を全部残した `diagNodes` で、エラー位置と型検査に使う
- 解析エラーは例外にならず、compileFull が出力を止め、型検査の段で NG5002 として報告される
- `compileComponentFromMetadata` は ingest → transform → emit の 3 手で template 関数を作り、decls / vars / consts と合わせて `ɵɵdefineComponent` の引数を組み、ngtsc がそれを TypeScript の static フィールドに翻訳する

---

← 前: [テンプレートが JS になるまで：パーサ・R3 AST・IR・74 個のフェーズの全体図](01-compiler.md)  
次: [HTML の字句解析：テンプレートの文字列がトークンの列になるまで](03-compiler-html-lexer.md) →
