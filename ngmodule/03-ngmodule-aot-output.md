[目次](../README.md) › [NgModule の内側](README.md) › 第 3 回 / 全 18 回

# AOT が @NgModule を何に変換するか：ɵɵdefineNgModule・ɵɵdefineInjector・ɵɵsetNgModuleScope

> ngtsc の NgModuleDecoratorHandler.analyze が各フィールドを読む順、compileNgModule（compiler）が出す 3 つの static フィールド、R3SelectorScopeMode（Inline / SideEffect / Omit）の違いと ngJitMode ガード、ランタイム側の ɵɵdefineNgModule と ɵɵsetNgModuleScope が受け取るもの。実際の出力例を行ごとに読む。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngmodule-aot-output)

---

`ng build` は `@NgModule({...})` を何に変換するのでしょうか。この章では ngtsc（`@angular/compiler-cli`）の `NgModuleDecoratorHandler` が各フィールドを読む順、compiler の `compileNgModule` が `ɵmod` / `ɵinj` / `ɵfac` と、`ngJitMode` ガード付きの `ɵɵsetNgModuleScope(...)` を組む規則、そしてその出力をランタイム側の `ɵɵdefineNgModule` / `ɵɵdefineInjector` / `ɵɵsetNgModuleScope` がどう受け取るかを追います。最後に compliance テストの実際の出力を 1 行ずつ読みます。

読む対象は `packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts`、`packages/compiler/src/render3/r3_module_compiler.ts`、`r3_injector_compiler.ts`、ランタイム側は `packages/core/src/render3/definition.ts` と `scope.ts` です。

1. 2 つの仕事
2. デコレータの実行
3. **AOT の出力**（この章）
4. コンパイルスコープ
5. exports の意味
6. JIT のスコープ計算
7. ɵinj → R3Injector
8. walkProviderTree
9. forRoot と ModuleWithProviders
10. providedIn の解決
11. bootstrapModule の全手順
12. BrowserModule の中身
13. standalone が import する NgModule
14. importProvidersFrom
15. 遅延モジュール
16. schemas
17. TestBed
18. standalone 既定の後

## 1. ngtsc の入口：detect と analyze

ngtsc は TypeScript のプログラム全体を「analyze → resolve → compile」の 3 段で処理します（[コンパイラ概観](../compiler/01-compiler.md)）。NgModule を担当するのが `NgModuleDecoratorHandler` です。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L302–319 （▶ の行: 309, 311–314）

```ts
302 │   detect(
303 │     node: ClassDeclaration,
304 │     decorators: Decorator[] | null,
305 │   ): DetectResult<Decorator> | undefined {
306 │     if (!decorators) {
307 │       return undefined;
308 │     }
309 ▶     const decorator = findAngularDecorator(decorators, 'NgModule', this.isCore);
310 │     if (decorator !== undefined) {
311 ▶       return {
312 ▶         trigger: decorator.node,
313 ▶         decorator: decorator,
314 ▶         metadata: decorator,
315 │       };
316 │     } else {
317 │       return undefined;
318 │     }
319 │   }
```

309 行目、クラスに付いたデコレータの中から `@angular/core` の `NgModule` を探します。見つかれば 311〜315 行目でそのデコレータを「このハンドラが担当する」と宣言します。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L336–356 （▶ の行: 338–341, 343, 350, 352–353, 355）

```ts
336 │     // @NgModule can be invoked without arguments. In case it is, pretend as if a blank object
337 │     // literal was specified. This simplifies the code below.
338 ▶     const meta =
339 ▶       decorator.args.length === 1
340 ▶         ? unwrapExpression(decorator.args[0])
341 ▶         : ts.factory.createObjectLiteralExpression([]);
342 │ 
343 ▶     if (!ts.isObjectLiteralExpression(meta)) {
344 │       throw new FatalDiagnosticError(
345 │         ErrorCode.DECORATOR_ARG_NOT_LITERAL,
346 │         meta,
347 │         '@NgModule argument must be an object literal',
348 │       );
349 │     }
350 ▶     const ngModule = reflectObjectLiteral(meta);
351 │ 
352 ▶     if (ngModule.has('jit')) {
353 ▶       this.jitDeclarationRegistry.jitDeclarations.add(node);
354 │       // The only allowed value is true, so there's no need to expand further.
355 ▶       return {};
356 │     }
```

338〜341 行目、`@NgModule()` と引数無しで書かれていたら空のオブジェクトリテラルとみなします。343 行目、引数がオブジェクトリテラルでなければ即エラー（`@NgModule(someVariable)` は AOT では書けない）。350 行目 `reflectObjectLiteral` でキー → 式の Map にします。352〜355 行目、`jit: true` があればそのクラスを JIT 宣言として登録し、**空の解析結果を返して終わり**。第 1 回で見た「AOT コンパイラはこのモジュールを無視する」の実装です。

### フィールドを読む順

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L372–393 （▶ の行: 372, 377, 379–380, 390–392）

```ts
372 ▶     const allowUnresolvedReferences = this.compilationMode === CompilationMode.LOCAL;
373 │     const diagnostics: ts.Diagnostic[] = [];
374 │ 
375 │     // Resolving declarations
376 │     let declarationRefs: Reference<ClassDeclaration>[] = [];
377 ▶     const rawDeclarations: ts.Expression | null = ngModule.get('declarations') ?? null;
378 │     if (rawDeclarations !== null) {
379 ▶       const declarationMeta = this.evaluator.evaluate(rawDeclarations, forwardRefResolver);
380 ▶       declarationRefs = this.resolveTypeList(
381 │         rawDeclarations,
382 │         declarationMeta,
383 │         name,
384 │         'declarations',
385 │         0,
386 │         allowUnresolvedReferences,
387 │       ).references;
388 │ 
389 │       // Look through the declarations to make sure they're all a part of the current compilation.
390 ▶       for (const ref of declarationRefs) {
391 ▶         if (ref.node.getSourceFile().isDeclarationFile) {
392 ▶           const errorNode = ref.getOriginForDiagnostics(rawDeclarations);
393 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L410–424 （▶ の行: 412, 414, 416–418）

```ts
410 │     // Resolving imports
411 │     let importRefs: Reference<ClassDeclaration>[] = [];
412 ▶     let rawImports: ts.Expression | null = ngModule.get('imports') ?? null;
413 │     if (rawImports !== null) {
414 ▶       const importsMeta = this.evaluator.evaluate(rawImports, moduleResolvers);
415 │ 
416 ▶       const result = this.resolveTypeList(
417 ▶         rawImports,
418 ▶         importsMeta,
419 │         name,
420 │         'imports',
421 │         0,
422 │         allowUnresolvedReferences,
423 │       );
424 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L446–460 （▶ の行: 448, 450–451, 459）

```ts
446 │     // Resolving exports
447 │     let exportRefs: Reference<ClassDeclaration>[] = [];
448 ▶     const rawExports: ts.Expression | null = ngModule.get('exports') ?? null;
449 │     if (rawExports !== null) {
450 ▶       const exportsMeta = this.evaluator.evaluate(rawExports, moduleResolvers);
451 ▶       exportRefs = this.resolveTypeList(
452 │         rawExports,
453 │         exportsMeta,
454 │         name,
455 │         'exports',
456 │         0,
457 │         allowUnresolvedReferences,
458 │       ).references;
459 ▶       this.referencesRegistry.add(node, ...exportRefs);
460 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L462–483 （▶ の行: 464–467, 477–480）

```ts
462 │     // Resolving bootstrap
463 │     let bootstrapRefs: Reference<ClassDeclaration>[] = [];
464 ▶     const rawBootstrap: ts.Expression | null = ngModule.get('bootstrap') ?? null;
465 ▶     if (!allowUnresolvedReferences && rawBootstrap !== null) {
466 ▶       const bootstrapMeta = this.evaluator.evaluate(rawBootstrap, forwardRefResolver);
467 ▶       bootstrapRefs = this.resolveTypeList(
468 │         rawBootstrap,
469 │         bootstrapMeta,
470 │         name,
471 │         'bootstrap',
472 │         0,
473 │         /* allowUnresolvedReferences */ false,
474 │       ).references;
475 │ 
476 │       // Verify that the `@NgModule.bootstrap` list doesn't have Standalone Components.
477 ▶       for (const ref of bootstrapRefs) {
478 ▶         const dirMeta = this.metaReader.getDirectiveMetadata(ref);
479 ▶         if (dirMeta?.isStandalone) {
480 ▶           diagnostics.push(makeStandaloneBootstrapDiagnostic(node, ref, rawBootstrap));
481 │         }
482 │       }
483 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L485–520 （▶ の行: 487–490, 507, 509–510, 512–513, 515, 517）

```ts
485 │     let schemas: SchemaMetadata[] | undefined;
486 │     try {
487 ▶       schemas =
488 ▶         this.compilationMode !== CompilationMode.LOCAL && ngModule.has('schemas')
489 ▶           ? extractSchemas(ngModule.get('schemas')!, this.evaluator, 'NgModule')
490 ▶           : [];
491 │     } catch (e) {
492 │       if (e instanceof FatalDiagnosticError) {
493 │         diagnostics.push(e.toDiagnostic());
494 │ 
495 │         // Use an empty schema array if schema extract fails.
496 │         // A build will still fail in this case. However, for the language service,
497 │         // this allows the module to exist in the compiler registry and prevents
498 │         // cascading diagnostics within an IDE due to "missing" components. The
499 │         // originating schema related errors will still be reported in the IDE.
500 │         schemas = [];
501 │       } else {
502 │         throw e;
503 │       }
504 │     }
505 │ 
506 │     let id: Expression | null = null;
507 ▶     if (ngModule.has('id')) {
508 │       const idExpr = ngModule.get('id')!;
509 ▶       if (!isModuleIdExpression(idExpr)) {
510 ▶         id = new WrappedNodeExpr(idExpr);
511 │       } else {
512 ▶         const diag = makeDiagnostic(
513 ▶           ErrorCode.WARN_NGMODULE_ID_UNNECESSARY,
514 │           idExpr,
515 ▶           `Using 'module.id' for NgModule.id is a common anti-pattern that is ignored by the Angular compiler.`,
516 │         );
517 ▶         diag.category = ts.DiagnosticCategory.Warning;
518 │         diagnostics.push(diag);
519 │       }
520 │     }
```

1. **377〜387 行目：declarations**

   379 行目、`PartialEvaluator` が式を静的に評価します（`forwardRefResolver` 付きなので `forwardRef(() => X)` は `X` に）。380 行目 `resolveTypeList` でクラス参照の配列へ。390〜392 行目、**declarations のクラスが `.d.ts` から来ていたらエラー**です。他のライブラリのコンポーネントを自分の declarations に書けない理由はここです。372 行目、`allowUnresolvedReferences` は local compilation モードのときだけ `true`（2 節）。
2. **412〜423 行目：imports**

   414 行目、評価には `moduleResolvers` を使います。これは `forwardRefResolver` に加えて `createModuleWithProvidersResolver`（`RouterModule.forRoot(...)` のような呼び出しを、その関数の戻り値型 `ModuleWithProviders<T>` から `T` に解決する。[第 9 回](09-ngmodule-module-with-providers.md)）を合わせたものです。
3. **448〜459 行目：exports**

   450 行目、imports と同じ `moduleResolvers`。459 行目、export した参照を `referencesRegistry` に登録します（「export された型は公開 API」として .d.ts の再 export を決めるために使う）。
4. **464〜483 行目：bootstrap**

   465 行目、local compilation モードでは読みません。477〜481 行目、**bootstrap に standalone コンポーネントがあるとエラー**（`NGMODULE_BOOTSTRAP_IS_STANDALONE`。メッセージは「`bootstrapApplication` を使え」）。
5. **487〜490 行目：schemas**

   `extractSchemas` で `NO_ERRORS_SCHEMA` / `CUSTOM_ELEMENTS_SCHEMA` を評価します。この値は `analysis.schemas` に入り、3 節の `register` でスコープ側に渡されます。**`ɵmod` の引数には入りません**（2 節の 601 行目）。
6. **507〜518 行目：id**

   509〜510 行目、式をそのまま `WrappedNodeExpr` で包んで出力に流します。512〜517 行目、`id: module.id` と書いていたら警告 `WARN_NGMODULE_ID_UNNECESSARY`（「よくあるアンチパターンで、コンパイラは無視する」）。

## 2. Global / Local の分岐と、ɵinj に渡すメタデータ

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L554–580 （▶ の行: 554, 556–560, 566, 568, 570–573, 577, 579）

```ts
554 ▶     const isForwardReference = (ref: R3Reference) =>
555 │       isExpressionForwardReference(ref.value, node.name!, valueContext);
556 ▶     const containsForwardDecls =
557 ▶       bootstrap.some(isForwardReference) ||
558 ▶       declarations.some(isForwardReference) ||
559 ▶       imports.some(isForwardReference) ||
560 ▶       exports.some(isForwardReference);
561 │ 
562 │     const type = wrapTypeReference(node);
563 │ 
564 │     let ngModuleMetadata: R3NgModuleMetadata;
565 │ 
566 ▶     if (allowUnresolvedReferences) {
567 │       ngModuleMetadata = {
568 ▶         kind: R3NgModuleMetadataKind.Local,
569 │         type,
570 ▶         bootstrapExpression: rawBootstrap ? new WrappedNodeExpr(rawBootstrap) : null,
571 ▶         declarationsExpression: rawDeclarations ? new WrappedNodeExpr(rawDeclarations) : null,
572 ▶         exportsExpression: rawExports ? new WrappedNodeExpr(rawExports) : null,
573 ▶         importsExpression: rawImports ? new WrappedNodeExpr(rawImports) : null,
574 │         id,
575 │         // Use `ɵɵsetNgModuleScope` to patch selector scopes onto the generated definition in a
576 │         // tree-shakeable way.
577 ▶         selectorScopeMode: R3SelectorScopeMode.SideEffect,
578 │         // TODO: to be implemented as a part of FW-1004.
579 ▶         schemas: [],
580 │       };
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L581–603 （▶ の行: 583, 585–586, 588–589, 593, 597–599, 601）

```ts
581 │     } else {
582 │       ngModuleMetadata = {
583 ▶         kind: R3NgModuleMetadataKind.Global,
584 │         type,
585 ▶         bootstrap,
586 ▶         declarations,
587 │         publicDeclarationTypes: this.onlyPublishPublicTypings ? exportedDeclarations : null,
588 ▶         exports,
589 ▶         imports,
590 │         // Imported types are generally private, so include them unless restricting the .d.ts emit
591 │         // to only public types.
592 │         includeImportTypes: !this.onlyPublishPublicTypings,
593 ▶         containsForwardDecls,
594 │         id,
595 │         // Use `ɵɵsetNgModuleScope` to patch selector scopes onto the generated definition in a
596 │         // tree-shakeable way.
597 ▶         selectorScopeMode: this.includeSelectorScope
598 ▶           ? R3SelectorScopeMode.SideEffect
599 ▶           : R3SelectorScopeMode.Omit,
600 │         // TODO: to be implemented as a part of FW-1004.
601 ▶         schemas: [],
602 │       };
603 │     }
```

554〜560 行目 `containsForwardDecls`。bootstrap / declarations / imports / exports のどれかに「このクラスより後で定義される参照」があれば `true`。4 節で配列を `() => [...]` の閉包に包むかどうかを決めます。

566 行目で分岐。**local compilation モード**（`compilationMode: 'experimental-local'`。ファイル単位でコンパイルし、他ファイルの型を解決しない）では 568 行目 `kind: Local`、570〜573 行目で評価せず**生の式**をそのまま持ち、577 行目 `SideEffect`。通常の**全体コンパイル**は 583 行目 `kind: Global`。585〜589 行目に解決済みの参照、593 行目 `containsForwardDecls`、597〜599 行目で `includeSelectorScope` なら `SideEffect`、そうでなければ `Omit`。**601 行目 `schemas: []`**。コメントの TODO（FW-1004）どおり、全体コンパイルでは schemas を `ɵmod` に出しません。検査は型チェッカー側で済んでいます（[第 16 回](16-ngmodule-schemas.md)）。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L605–619 （▶ の行: 605, 610–612, 614）

```ts
605 ▶     const rawProviders = ngModule.has('providers') ? ngModule.get('providers')! : null;
606 │     let wrappedProviders: WrappedNodeExpr<ts.Expression> | null = null;
607 │ 
608 │     // In most cases the providers will be an array literal. Check if it has any elements
609 │     // and don't include the providers if it doesn't which saves us a few bytes.
610 ▶     if (
611 ▶       rawProviders !== null &&
612 ▶       (!ts.isArrayLiteralExpression(rawProviders) || rawProviders.elements.length > 0)
613 │     ) {
614 ▶       wrappedProviders = new WrappedNodeExpr(
615 │         this.annotateForClosureCompiler
616 │           ? wrapFunctionExpressionsInParens(rawProviders)
617 │           : rawProviders,
618 │       );
619 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L663–696 （▶ の行: 663–667, 670, 673, 681, 685, 690, 694–695）

```ts
663 ▶     const injectorMetadata: R3InjectorMetadata = {
664 ▶       name,
665 ▶       type,
666 ▶       providers: wrappedProviders,
667 ▶       imports: [],
668 │     };
669 │ 
670 ▶     if (allowUnresolvedReferences) {
671 │       // Adding NgModule's raw imports/exports to the injector's imports field in local compilation
672 │       // mode.
673 ▶       for (const exp of [rawImports, rawExports]) {
674 │         if (exp === null) {
675 │           continue;
676 │         }
677 │ 
678 │         if (ts.isArrayLiteralExpression(exp)) {
679 │           // If array expression then add it entry-by-entry to the injector imports
680 │           if (exp.elements) {
681 ▶             injectorMetadata.imports.push(...exp.elements.map((n) => new WrappedNodeExpr(n)));
682 │           }
683 │         } else {
684 │           // if not array expression then add it as is to the injector's imports field.
685 ▶           injectorMetadata.imports.push(new WrappedNodeExpr(exp));
686 │         }
687 │       }
688 │     }
689 │ 
690 ▶     const factoryMetadata: R3FactoryMetadata = {
691 │       name,
692 │       type,
693 │       typeArgumentCount: 0,
694 ▶       deps: getValidConstructorDependencies(node, this.reflector, this.isCore),
695 ▶       target: FactoryTarget.NgModule,
696 │     };
```

605 行目 providers。610〜614 行目、配列リテラルで要素が 0 なら `null`（出力に `providers` キーを出さない）。中身は**評価せず**、式のまま `WrappedNodeExpr` で出力に流します。providers の中身を解釈するのは実行時の `walkProviderTree`（[第 8 回](08-ngmodule-walk-provider-tree.md)）です。663〜668 行目 `injectorMetadata`。**667 行目、`imports` は空で始まります**。全体コンパイルでは 3 節の resolve が埋めます。local compilation では 670〜688 行目で imports と exports の生の式をそのまま足します（第 2 回 JIT の `[imports, exports]` と同じ考え方）。690〜696 行目 `factoryMetadata`。694 行目でコンストラクタの依存を読み、695 行目 `FactoryTarget.NgModule`。

## 3. register と resolve：injectorImports の確定

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L755–777 （▶ の行: 755, 759, 762–765, 770, 774）

```ts
755 ▶   register(node: ClassDeclaration, analysis: NgModuleAnalysis): void {
756 │     // Register this module's information with the LocalModuleScopeRegistry. This ensures that
757 │     // during the compile() phase, the module's metadata is available for selector scope
758 │     // computation.
759 ▶     this.metaRegistry.registerNgModuleMetadata({
760 │       kind: MetaKind.NgModule,
761 │       ref: new Reference(node),
762 ▶       schemas: analysis.schemas,
763 ▶       declarations: analysis.declarations,
764 ▶       imports: analysis.importRefs,
765 ▶       exports: analysis.exports,
766 │       rawDeclarations: analysis.rawDeclarations,
767 │       rawImports: analysis.rawImports,
768 │       rawExports: analysis.rawExports,
769 │       decorator: analysis.decorator,
770 ▶       mayDeclareProviders: analysis.providers !== null,
771 │       isPoisoned: false,
772 │     });
773 │ 
774 ▶     this.injectableRegistry.registerInjectable(node, {
775 │       ctorDeps: analysis.fac.deps,
776 │     });
777 │   }
```

755 行目 `register`。analyze が全ファイル分終わった後、759 行目で `registerNgModuleMetadata` を呼び、762〜765 行目の schemas / declarations / imports / exports を `LocalModuleScopeRegistry` に登録します。**スコープの計算（[第 4 回](04-ngmodule-compilation-scope.md)）はここで登録されたデータから行われます**。770 行目 `mayDeclareProviders`（providers が書かれているか）は、standalone コンポーネントが import する NgModule の providers を集めるべきかの判定に使われます。774 行目、コンストラクタ依存を `injectableRegistry` へ。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L804–816 （▶ の行: 804–805, 809–810, 813）

```ts
804 ▶     const data: NgModuleResolution = {
805 ▶       injectorImports: [],
806 │     };
807 │ 
808 │     // Add all top-level imports from the `imports` field to the injector imports.
809 ▶     for (const topLevelImport of analysis.imports) {
810 ▶       if (topLevelImport.hasModuleWithProviders) {
811 │         // We have no choice but to emit expressions which contain MWPs, as we cannot filter on
812 │         // individual references.
813 ▶         data.injectorImports.push(new WrappedNodeExpr(topLevelImport.expression));
814 │         continue;
815 │       }
816 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L826–852 （▶ の行: 827–831, 835, 848–850）

```ts
826 │       for (const ref of topLevelImport.resolvedReferences) {
827 ▶         const dirMeta = this.metaReader.getDirectiveMetadata(ref);
828 ▶         if (dirMeta !== null) {
829 ▶           if (!dirMeta.isComponent) {
830 ▶             // Skip emit of directives in imports - directives can't carry providers.
831 ▶             continue;
832 │           }
833 │ 
834 │           // Check whether this component has providers.
835 ▶           const mayExportProviders = this.exportedProviderStatusResolver.mayExportProviders(
836 │             dirMeta.ref,
837 │             (importRef) => {
838 │               // We need to keep track of which transitive imports were used to decide
839 │               // `mayExportProviders`, since if those change in a future compilation this
840 │               // NgModule will need to be re-emitted.
841 │               if (symbol !== null && this.semanticDepGraphUpdater !== null) {
842 │                 const importSymbol = this.semanticDepGraphUpdater.getSymbol(importRef.node);
843 │                 symbol.addTransitiveImportFromStandaloneComponent(importSymbol);
844 │               }
845 │             },
846 │           );
847 │ 
848 ▶           if (!mayExportProviders) {
849 ▶             // Skip emit of components that don't carry providers.
850 ▶             continue;
851 │           }
852 │         }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L878–888 （▶ の行: 878, 882–884, 886）

```ts
878 ▶     if (scope !== null && !scope.compilation.isPoisoned) {
879 │       // Using the scope information, extend the injector's imports using the modules that are
880 │       // specified as module exports.
881 │       const context = getSourceFile(node);
882 ▶       for (const exportRef of analysis.exports) {
883 ▶         if (isNgModule(exportRef.node, scope.compilation)) {
884 ▶           const type = this.refEmitter.emit(exportRef, context);
885 │           assertSuccessfulReferenceEmit(type, node, 'NgModule');
886 ▶           data.injectorImports.push(type.expression);
887 │         }
888 │       }
```

1. **804〜806 行目：`injectorImports` は空配列から**
2. **809〜813 行目：imports の各要素を足す。`ModuleWithProviders` を含む要素は式のまま**

   `RouterModule.forRoot(routes)` のような呼び出しは、評価結果ではなく**呼び出し式そのもの**が `ɵinj.imports` に出ます（第 1 回の forward\_refs.js で `imports: [provideModule()]` となっていたのがこれ）。
3. **827〜832 行目：directive と pipe は注入器の imports から外す**

   standalone directive / pipe は providers を持てないので、`ɵinj.imports` に入れる意味がありません。standalone コンポーネントは、835 行目 `mayExportProviders` で「自分か、自分が import する NgModule が providers を持ちうるか」を調べ、848〜850 行目で持たなければ外します。**これが、standalone 時代に `imports: [SomeStandaloneCmp]` と書いても `ɵinj` が膨らまない理由**です。
4. **878〜888 行目：exports に書いた NgModule を注入器の imports に足す**

   883 行目 `isNgModule(exportRef.node, scope.compilation)` で NgModule のものだけ。第 1 回 4 節で `BModule.ɵinj = {imports: [AModule]}` になったのはこの 886 行目です。878 行目、スコープが poisoned（第 4 回）のときは行いません。

## 4. compileFull：3 つの式を組む

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/ng_module/src/handler.ts` L927–956 （▶ の行: 927, 939–942, 944–948, 955）

```ts
927 ▶   compileFull(
928 │     node: ClassDeclaration,
929 │     {
930 │       inj,
931 │       mod,
932 │       fac,
933 │       classMetadata,
934 │       declarations,
935 │       remoteScopesMayRequireCycleProtection,
936 │     }: Readonly<NgModuleAnalysis>,
937 │     {injectorImports}: Readonly<NgModuleResolution>,
938 │   ): CompileResult[] {
939 ▶     const factoryFn = compileNgFactoryDefField(fac);
940 ▶     const ngInjectorDef = compileInjector({
941 ▶       ...inj,
942 ▶       imports: injectorImports,
943 │     });
944 ▶     const ngModuleDef = compileNgModule(mod);
945 ▶     const statements = ngModuleDef.statements;
946 ▶     const metadata = classMetadata !== null ? compileClassMetadata(classMetadata) : null;
947 ▶     this.insertMetadataStatement(statements, metadata);
948 ▶     this.appendRemoteScopingStatements(
949 │       statements,
950 │       node,
951 │       declarations,
952 │       remoteScopesMayRequireCycleProtection,
953 │     );
954 │ 
955 ▶     return this.compileNgModule(factoryFn, ngInjectorDef, ngModuleDef);
956 │   }
```

927 行目 `compileFull`。939 行目 `ɵfac`、940〜943 行目 `ɵinj`（analyze の `inj` に、resolve が決めた `injectorImports` を合流）、944 行目 `ɵmod`。945 行目、`ɵmod` の式には「付随する文（`statements`）」が付いてきます。`ɵɵsetNgModuleScope` と `ɵɵregisterNgModuleType` の呼び出しはここです。946〜947 行目、`ɵsetClassMetadata` の文を差し込み、948 行目で remote scoping の文（`ɵɵsetComponentScope`。第 4 回）を足します。955 行目で 3 つを `CompileResult[]` に並べます。

📄 `angular/packages/compiler/src/render3/r3_injector_compiler.ts` L15–38 （▶ の行: 15, 18–19, 22, 25–26, 29–30, 33–35）

```ts
15 ▶ export interface R3InjectorMetadata {
16 │   name: string;
17 │   type: R3Reference;
18 ▶   providers: o.Expression | null;
19 ▶   imports: o.Expression[];
20 │ }
21 │ 
22 ▶ export function compileInjector(meta: R3InjectorMetadata): R3CompiledExpression {
23 │   const definitionMap = new DefinitionMap<{providers: o.Expression; imports: o.Expression}>();
24 │ 
25 ▶   if (meta.providers !== null) {
26 ▶     definitionMap.set('providers', meta.providers);
27 │   }
28 │ 
29 ▶   if (meta.imports.length > 0) {
30 ▶     definitionMap.set('imports', o.literalArr(meta.imports));
31 │   }
32 │ 
33 ▶   const expression = o
34 ▶     .importExpr(R3.defineInjector)
35 ▶     .callFn([definitionMap.toLiteralMap()], undefined, true);
36 │   const type = createInjectorType(meta);
37 │   return {expression, type, statements: []};
38 │ }
```

`ɵinj` 側は短いです。15〜20 行目、入力は `providers`（式か `null`）と `imports`（式の配列）。25〜26 行目、providers があれば set。29〜30 行目、imports が 1 つ以上あれば set。33〜35 行目、`ɵɵdefineInjector({...})` の呼び出し式を作り、第 3 引数 `true` が `/*@__PURE__*/` 注釈になります（使われなければバンドラが消せる）。

## 5. compiler の compileNgModule と R3SelectorScopeMode

📄 `angular/packages/compiler/src/render3/r3_module_compiler.ts` L16–45 （▶ の行: 20, 25–26, 28, 31–32, 34–35, 37, 44）

```ts
16 │ /**
17 │  * How the selector scope of an NgModule (its declarations, imports, and exports) should be emitted
18 │  * as a part of the NgModule definition.
19 │  */
20 ▶ export enum R3SelectorScopeMode {
21 │   /**
22 │    * Emit the declarations inline into the module definition.
23 │    *
24 │    * This option is useful in certain contexts where it's known that JIT support is required. The
25 ▶    * tradeoff here is that this emit style prevents directives and pipes from being tree-shaken if
26 ▶    * they are unused, but the NgModule is used.
27 │    */
28 ▶   Inline,
29 │ 
30 │   /**
31 ▶    * Emit the declarations using a side effectful function call, `ɵɵsetNgModuleScope`, that is
32 ▶    * guarded with the `ngJitMode` flag.
33 │    *
34 ▶    * This form of emit supports JIT and can be optimized away if the `ngJitMode` flag is set to
35 ▶    * false, which allows unused directives and pipes to be tree-shaken.
36 │    */
37 ▶   SideEffect,
38 │ 
39 │   /**
40 │    * Don't generate selector scopes at all.
41 │    *
42 │    * This is useful for contexts where JIT support is known to be unnecessary.
43 │    */
44 ▶   Omit,
45 │ }
```

20 行目 `R3SelectorScopeMode`。28 行目 `Inline`：declarations / imports / exports を `ɵɵdefineNgModule` の引数に直接入れる。25〜26 行目のコメント「JIT が必要と分かっている文脈向け。使われない directive / pipe が tree-shake できなくなる代償がある」。第 2 回で JIT がこれを使っていました。37 行目 `SideEffect`：31〜32 行目「`ngJitMode` フラグでガードした副作用関数 `ɵɵsetNgModuleScope` で出す」。34〜35 行目「JIT を支えつつ、`ngJitMode` が false なら最適化で消せて、使われない directive / pipe が tree-shake できる」。44 行目 `Omit`：出さない。

📄 `angular/packages/compiler/src/render3/r3_module_compiler.ts` L229–267 （▶ の行: 229, 231–232, 237–238, 241, 245–246, 249–250, 253–254, 256, 261–263）

```ts
229 ▶ export function compileNgModule(meta: R3NgModuleMetadata): R3CompiledExpression {
230 │   const statements: o.Statement[] = [];
231 ▶   const definitionMap = new DefinitionMap<R3NgModuleDefMap>();
232 ▶   definitionMap.set('type', meta.type.value);
233 │ 
234 │   // Assign bootstrap definition. In local compilation mode (i.e., for
235 │   // `R3NgModuleMetadataKind.LOCAL`) we assign the bootstrap field using the runtime
236 │   // `ɵɵsetNgModuleScope`.
237 ▶   if (meta.kind === R3NgModuleMetadataKind.Global && meta.bootstrap.length > 0) {
238 ▶     definitionMap.set('bootstrap', refsToArray(meta.bootstrap, meta.containsForwardDecls));
239 │   }
240 │ 
241 ▶   if (meta.selectorScopeMode === R3SelectorScopeMode.Inline) {
242 │     // If requested to emit scope information inline, pass the `declarations`, `imports` and
243 │     // `exports` to the `ɵɵdefineNgModule()` call directly.
244 │ 
245 ▶     if (meta.declarations.length > 0) {
246 ▶       definitionMap.set('declarations', refsToArray(meta.declarations, meta.containsForwardDecls));
247 │     }
248 │ 
249 ▶     if (meta.imports.length > 0) {
250 ▶       definitionMap.set('imports', refsToArray(meta.imports, meta.containsForwardDecls));
251 │     }
252 │ 
253 ▶     if (meta.exports.length > 0) {
254 ▶       definitionMap.set('exports', refsToArray(meta.exports, meta.containsForwardDecls));
255 │     }
256 ▶   } else if (meta.selectorScopeMode === R3SelectorScopeMode.SideEffect) {
257 │     // In this mode, scope information is not passed into `ɵɵdefineNgModule` as it
258 │     // would prevent tree-shaking of the declarations, imports and exports references. Instead, it's
259 │     // patched onto the NgModule definition with a `ɵɵsetNgModuleScope` call that's guarded by the
260 │     // `ngJitMode` flag.
261 ▶     const setNgModuleScopeCall = generateSetNgModuleScopeCall(meta);
262 ▶     if (setNgModuleScopeCall !== null) {
263 ▶       statements.push(setNgModuleScopeCall);
264 │     }
265 │   } else {
266 │     // Selector scope emit was not requested, so skip it.
267 │   }
```

📄 `angular/packages/compiler/src/render3/r3_module_compiler.ts` L269–289 （▶ の行: 269–270, 273–274, 278–279, 283–285, 288）

```ts
269 ▶   if (meta.schemas !== null && meta.schemas.length > 0) {
270 ▶     definitionMap.set('schemas', o.literalArr(meta.schemas.map((ref) => ref.value)));
271 │   }
272 │ 
273 ▶   if (meta.id !== null) {
274 ▶     definitionMap.set('id', meta.id);
275 │ 
276 │     // Generate a side-effectful call to register this NgModule by its id, as per the semantics of
277 │     // NgModule ids.
278 ▶     statements.push(
279 ▶       o.importExpr(R3.registerNgModuleType).callFn([meta.type.value, meta.id]).toStmt(),
280 │     );
281 │   }
282 │ 
283 ▶   const expression = o
284 ▶     .importExpr(R3.defineNgModule)
285 ▶     .callFn([definitionMap.toLiteralMap()], undefined, true);
286 │   const type = createNgModuleType(meta);
287 │ 
288 ▶   return {expression, type, statements};
289 │ }
```

📄 `angular/packages/compiler/src/render3/util.ts` L165–173 （▶ の行: 170–172）

```ts
165 │ export function wrapReference(value: any): R3Reference {
166 │   const wrapped = new o.WrappedNodeExpr(value);
167 │   return {value: wrapped, type: wrapped};
168 │ }
169 │ 
170 ▶ export function refsToArray(refs: R3Reference[], shouldForwardDeclare: boolean): o.Expression {
171 ▶   const values = o.literalArr(refs.map((ref) => ref.value));
172 ▶   return shouldForwardDeclare ? o.arrowFn([], values) : values;
173 │ }
```

1. **231〜232 行目：`definitionMap` に `type`**

   出力 `{ type: MyModule, ... }` の最初のキーです。
2. **237〜238 行目：Global で bootstrap が 1 つ以上なら `bootstrap`**

   170〜172 行目 `refsToArray`。`containsForwardDecls` が true なら `() => [MyBootstrap]` の閉包、false なら `[MyBootstrap]`。7 節の実物では `forwardRef` を使っていても閉包になっていません（`analyze` 554〜555 行目の判定は「同じファイルで後ろに定義されているか」で、`forwardRef` の有無ではないため）。
3. **241〜255 行目：Inline のときだけ declarations / imports / exports を引数に**
4. **256〜264 行目：SideEffect のときは `generateSetNgModuleScopeCall` を `statements` に push**

   262 行目、`null`（3 つとも空）なら何も足しません。
5. **269〜271 行目：schemas が 1 つ以上なら `schemas`**

   2 節の 601 行目で handler が `[]` を渡すので、全体コンパイルではこの分岐は常に偽です。JIT（第 2 回）は `schemas` を渡すので真になります。
6. **273〜280 行目：id があれば `id` を引数に、さらに `ɵɵregisterNgModuleType(type, id)` の文を push**
7. **283〜288 行目：`ɵɵdefineNgModule({...})` の呼び出し式（`/*@__PURE__*/` 付き）と、型（.d.ts 用）と、文の配列を返す**

## 6. ɵɵsetNgModuleScope の文と ngJitMode ガード

📄 `angular/packages/compiler/src/render3/r3_module_compiler.ts` L356–373 （▶ の行: 357–360, 362, 370–372）

```ts
356 │ /**
357 ▶  * Generates a function call to `ɵɵsetNgModuleScope` with all necessary information so that the
358 ▶  * transitive module scope can be computed during runtime in JIT mode. This call is marked pure
359 ▶  * such that the references to declarations, imports and exports may be elided causing these
360 ▶  * symbols to become tree-shakeable.
361 │  */
362 ▶ function generateSetNgModuleScopeCall(meta: R3NgModuleMetadata): o.Statement | null {
363 │   const scopeMap = new DefinitionMap<{
364 │     declarations: o.Expression;
365 │     imports: o.Expression;
366 │     exports: o.Expression;
367 │     bootstrap: o.Expression;
368 │   }>();
369 │ 
370 ▶   if (meta.kind === R3NgModuleMetadataKind.Global) {
371 ▶     if (meta.declarations.length > 0) {
372 ▶       scopeMap.set('declarations', refsToArray(meta.declarations, meta.containsForwardDecls));
373 │     }
```

📄 `angular/packages/compiler/src/render3/r3_module_compiler.ts` L380–402 （▶ の行: 380–382, 390–392, 400–401）

```ts
380 ▶   if (meta.kind === R3NgModuleMetadataKind.Global) {
381 ▶     if (meta.imports.length > 0) {
382 ▶       scopeMap.set('imports', refsToArray(meta.imports, meta.containsForwardDecls));
383 │     }
384 │   } else if (meta.kind === R3NgModuleMetadataKind.Local) {
385 │     if (meta.importsExpression) {
386 │       scopeMap.set('imports', meta.importsExpression);
387 │     }
388 │   }
389 │ 
390 ▶   if (meta.kind === R3NgModuleMetadataKind.Global) {
391 ▶     if (meta.exports.length > 0) {
392 ▶       scopeMap.set('exports', refsToArray(meta.exports, meta.containsForwardDecls));
393 │     }
394 │   } else if (meta.kind === R3NgModuleMetadataKind.Local) {
395 │     if (meta.exportsExpression) {
396 │       scopeMap.set('exports', meta.exportsExpression);
397 │     }
398 │   }
399 │ 
400 ▶   if (meta.kind === R3NgModuleMetadataKind.Local && meta.bootstrapExpression) {
401 ▶     scopeMap.set('bootstrap', meta.bootstrapExpression);
402 │   }
```

📄 `angular/packages/compiler/src/render3/r3_module_compiler.ts` L404–424 （▶ の行: 404–405, 409–411, 415, 418, 421, 423）

```ts
404 ▶   if (Object.keys(scopeMap.values).length === 0) {
405 ▶     return null;
406 │   }
407 │ 
408 │   // setNgModuleScope(...)
409 ▶   const fnCall = new o.InvokeFunctionExpr(
410 ▶     /* fn */ o.importExpr(R3.setNgModuleScope),
411 ▶     /* args */ [meta.type.value, scopeMap.toLiteralMap()],
412 │   );
413 │ 
414 │   // (ngJitMode guard) && setNgModuleScope(...)
415 ▶   const guardedCall = jitOnlyGuardedExpression(fnCall);
416 │ 
417 │   // function() { (ngJitMode guard) && setNgModuleScope(...); }
418 ▶   const iife = new o.FunctionExpr(/* params */ [], /* statements */ [guardedCall.toStmt()]);
419 │ 
420 │   // (function() { (ngJitMode guard) && setNgModuleScope(...); })()
421 ▶   const iifeCall = new o.InvokeFunctionExpr(/* fn */ iife, /* args */ []);
422 │ 
423 ▶   return iifeCall.toStmt();
424 │ }
```

📄 `angular/packages/compiler/src/render3/util.ts` L140–163 （▶ の行: 140–141, 149–153, 155–156, 162）

```ts
140 ▶ export function jitOnlyGuardedExpression(expr: o.Expression): o.Expression {
141 ▶   return guardedExpression('ngJitMode', expr);
142 │ }
143 │ 
144 │ export function devOnlyGuardedExpression(expr: o.Expression): o.Expression {
145 │   return guardedExpression('ngDevMode', expr);
146 │ }
147 │ 
148 │ function guardedExpression(guard: string, expr: o.Expression): o.Expression {
149 ▶   const guardExpr = new o.ExternalExpr({name: guard, moduleName: null});
150 ▶   const guardNotDefined = new o.BinaryOperatorExpr(
151 ▶     o.BinaryOperator.Identical,
152 ▶     new o.TypeofExpr(guardExpr),
153 ▶     o.literal('undefined'),
154 │   );
155 ▶   const guardUndefinedOrTrue = new o.BinaryOperatorExpr(
156 ▶     o.BinaryOperator.Or,
157 │     guardNotDefined,
158 │     guardExpr,
159 │     /* type */ undefined,
160 │     /* sourceSpan */ undefined,
161 │   );
162 ▶   return new o.BinaryOperatorExpr(o.BinaryOperator.And, guardUndefinedOrTrue, expr);
163 │ }
```

357〜360 行目のコメントが目的です。「JIT で実行時に transitive スコープを計算できるよう、必要な情報を全部 `ɵɵsetNgModuleScope` に渡す。この呼び出しは pure と印を付けられるので、declarations / imports / exports への参照は省略可能になり、tree-shake できる」。370〜372 行目、Global なら declarations を `refsToArray`（閉包の判定は 5 節と同じ）。380〜382 行目で imports、390〜392 行目で exports も同じ形。400〜401 行目、`bootstrap` は Local のときだけ（全体コンパイルでは 5 節のとおり `ɵmod` の引数に直接入る）。404〜405 行目、**3 つとも空なら `null`**。`@NgModule({})` には文が出ません（ngtsc\_spec.ts 1867 行目のテスト名「should not emit a ɵɵsetNgModuleScope call when no scope metadata is present」）。

409〜411 行目で `ɵɵsetNgModuleScope(MyModule, {...})`、415 行目で `jitOnlyGuardedExpression` に包み、418 行目で `function () { ... }`、421 行目で即時呼び出し `(...)()`、423 行目で文に。140〜141 行目、ガードの名前は `'ngJitMode'`。149〜162 行目で `(typeof ngJitMode === "undefined" || ngJitMode) && expr` を組みます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L659–668 （▶ の行: 665）

```ts
659 │     define: {
660 │       ...options.define,
661 │       // Only set to false when script optimizations are enabled. It should not be set to true because
662 │       // Angular turns `ngDevMode` into an object for development debugging purposes when not defined
663 │       // which a constant true value would break.
664 │       ...(optimizationOptions.scripts ? { 'ngDevMode': 'false' } : undefined),
665 ▶       'ngJitMode': jit ? 'true' : 'false',
666 │       'ngServerMode': 'false',
667 │       'ngHmrMode': options.templateUpdates ? 'true' : 'false',
668 │     },
```

`ngJitMode` は Angular のソースでは宣言されているだけのグローバル定数で、値を決めるのは CLI です。665 行目、application builder の esbuild オプション `define` で `'ngJitMode': jit ? 'true' : 'false'`。`ng build` の既定（`aot: true`）では `'false'` になり、esbuild は `typeof false === "undefined" || false` を定数畳み込みで `false` にし、`false && ɵɵsetNgModuleScope(...)` の右側を dead code として落とします（[ブラウザ読み込みの章](../boot/06-boot-browser-load.md)で `browser.ts` 側の同じガードを見ています）。その結果 `MyDecl` や `MyExport` への参照も消え、どのコンポーネントの `dependencies` にも現れない declarable はバンドルから消えます。

> [!NOTE]
> **ポイント**
>
> 「本番ビルドでは declarations の配列は残っていない」が結論です。では `<my-decl>` はどう解決されるのか。答えは「コンポーネント側」です。コンパイラはテンプレートで実際に使われている directive / pipe を、そのコンポーネントの `ɵcmp` の `dependencies` 配列に直接書き込みます。モジュール側の配列は JIT のためだけに残され、本番では捨てられます。[次回](04-ngmodule-compilation-scope.md)でその計算を読みます。

## 7. 実際の出力を 1 行ずつ

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/ng_modules/all_options.ts` L18–33 （▶ の行: 25–31, 33）

```ts
18 │ @Component({
19 │   selector: 'my-bootstrap',
20 │   template: '',
21 │   standalone: false
22 │ })
23 │ export class MyBootstrap {}
24 │ 
25 ▶ @NgModule({
26 ▶   declarations: [MyDecl, MyExport],
27 ▶   imports: [MyImport],
28 ▶   exports: [MyExport],
29 ▶   bootstrap: [forwardRef(() => MyBootstrap)],
30 ▶   schemas: [NO_ERRORS_SCHEMA],
31 ▶   id: 'my-module-id'
32 │ })
33 ▶ export class MyModule {}
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/ng_modules/all_options.js` L1–23 （▶ の行: 7–9, 11, 23）

```js
 1 │ import { NgModule, NO_ERRORS_SCHEMA, forwardRef, Component, Directive } from '@angular/core';
 2 │ import * as i0 from "@angular/core";
 3 │ 
 4 │ …
 5 │ 
 6 │ export class MyModule {
 7 ▶     static ɵfac = function MyModule_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || MyModule)(); };
 8 ▶     static ɵmod = /*@__PURE__*/ i0.ɵɵdefineNgModule({ type: MyModule, bootstrap: [MyBootstrap], id: 'my-module-id' });
 9 ▶     static ɵinj = /*@__PURE__*/ i0.ɵɵdefineInjector({ imports: [MyImport] });
10 │ }
11 ▶ (() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(MyModule, [{
12 │         type: NgModule,
13 │         args: [{
14 │                 declarations: [MyDecl, MyExport],
15 │                 imports: [MyImport],
16 │                 exports: [MyExport],
17 │                 bootstrap: [forwardRef(() => MyBootstrap)],
18 │                 schemas: [NO_ERRORS_SCHEMA],
19 │                 id: 'my-module-id'
20 │             }]
21 │     }], null, null); })();
22 │ …
23 ▶ i0.ɵɵregisterNgModuleType(MyModule, 'my-module-id');
```
*compliance テストの期待値。部分一致で検査されるファイルで、… は省略記号（ここでは ɵɵsetNgModuleScope の文が省かれている）。*

1. **7 行目：`ɵfac`**

   `function MyModule_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || MyModule)(); }`。コンストラクタ引数が無いので `new MyModule()` するだけ。`__ngFactoryType__` はサブクラスから呼ばれたときに派生クラスを new するための引数です。
2. **8 行目：`ɵmod`**

   `ɵɵdefineNgModule({ type: MyModule, bootstrap: [MyBootstrap], id: 'my-module-id' })`。26〜28 行目に書いた declarations / imports / exports は**無い**（SideEffect）。30 行目の `schemas: [NO_ERRORS_SCHEMA]` も**無い**（2 節 601 行目）。29 行目の `forwardRef(() => MyBootstrap)` は解決されて `[MyBootstrap]`。
3. **9 行目：`ɵinj`**

   `ɵɵdefineInjector({ imports: [MyImport] })`。providers を書いていないので `providers` キーは無し。`exports: [MyExport]` は directive なので 3 節 827〜831 行目の判定で imports に入りません。
4. **11〜21 行目：`ɵsetClassMetadata`（ngDevMode のみ）**
5. **23 行目：`ɵɵregisterNgModuleType(MyModule, 'my-module-id')`**

   5 節 278〜280 行目の文。クラス定義の外に、トップレベルの文として出ます。

📄 `angular/packages/compiler-cli/test/ngtsc/ngtsc_spec.ts` L1835–1867 （▶ の行: 1835–1837, 1846–1847, 1849–1850, 1855, 1861–1862, 1867）

```ts
1835 ▶         @NgModule({
1836 ▶           declarations: [TestCmp],
1837 ▶           bootstrap: [TestCmp],
1838 │         })
1839 │         export class TestModule {}
1840 │     `,
1841 │       );
1842 │ 
1843 │       env.driveMain();
1844 │ 
1845 │       const jsContents = env.getContents('test.js');
1846 ▶       expect(jsContents).toContain(
1847 ▶         'i0.ɵɵdefineNgModule({ type: TestModule, bootstrap: [TestCmp] });',
1848 │       );
1849 ▶       expect(jsContents).toContain(
1850 ▶         'function () { (typeof ngJitMode === "undefined" || ngJitMode) && i0.ɵɵsetNgModuleScope(TestModule, { declarations: [TestCmp] }); })();',
1851 │       );
1852 │       expect(jsContents).toContain(
1853 │         'TestModule.ɵfac = function TestModule_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || TestModule)(); }',
1854 │       );
1855 ▶       expect(jsContents).toContain('i0.ɵɵdefineInjector({});');
1856 │ 
1857 │       const dtsContents = env.getContents('test.d.ts');
1858 │       expect(dtsContents).toContain(
1859 │         'static ɵcmp: i0.ɵɵComponentDeclaration<TestCmp, "test-cmp", never, {}, {}, never, never, false, never>',
1860 │       );
1861 ▶       expect(dtsContents).toContain(
1862 ▶         'static ɵmod: i0.ɵɵNgModuleDeclaration<TestModule, [typeof TestCmp], never, never>',
1863 │       );
1864 │       expect(dtsContents).not.toContain('__decorate');
1865 │     });
1866 │ 
1867 ▶     it('should not emit a ɵɵsetNgModuleScope call when no scope metadata is present', () => {
```

fixture で省略されている `ɵɵsetNgModuleScope` の実際の形は、ngtsc のユニットテストにあります。1835〜1839 行目の入力（declarations と bootstrap が 1 つずつ）に対して、1847 行目 `i0.ɵɵdefineNgModule({ type: TestModule, bootstrap: [TestCmp] });`、**1850 行目 `function () { (typeof ngJitMode === "undefined" || ngJitMode) && i0.ɵɵsetNgModuleScope(TestModule, { declarations: [TestCmp] }); })();`**。6 節の 409〜423 行目で組んだ形そのままです。1855 行目 `ɵɵdefineInjector({})`。1862 行目、.d.ts には `ɵɵNgModuleDeclaration<TestModule, [typeof TestCmp], never, never>` と型だけが出ます（型引数は declarations / imports / exports。ライブラリ利用側のコンパイラはこの型を読む。[第 4 回](04-ngmodule-compilation-scope.md) 5 節）。

> [!NOTE]
> **さらに深く**
>
> local compilation モード（2 節 566〜580 行目）では出力が変わります。同じ `all_options.ts` に対する `all_options.local.js` を見ると：
>
> 📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/ng_modules/all_options.local.js` L6–10 （▶ の行: 8–9）
>
> ```js
>  6 │ export class MyModule {
>  7 │     static ɵfac = function MyModule_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || MyModule)(); };
>  8 ▶     static ɵmod = /*@__PURE__*/ i0.ɵɵdefineNgModule({ type: MyModule, id: 'my-module-id' });
>  9 ▶     static ɵinj = /*@__PURE__*/ i0.ɵɵdefineInjector({ imports: [MyImport, MyExport] });
> 10 │ }
> ```
>
> 8 行目、`ɵmod` から `bootstrap` が消え（465 行目で読まないため。`ɵɵsetNgModuleScope` の `bootstrap` キーで実行時に渡される。6 節 400〜401 行目の Local 分岐）、9 行目、`ɵinj.imports` が `[MyImport, MyExport]` と exports まで含みます（2 節 673〜687 行目。directive かどうかを解決できないので式をそのまま入れる）。

## 8. ランタイム側の受け口

📄 `angular/packages/core/src/render3/definition.ts` L418–432 （▶ の行: 420–428）

```ts
418 │ }): NgModuleDef<T> {
419 │   return noSideEffects(() => {
420 ▶     const res: NgModuleDef<T> = {
421 ▶       type: def.type,
422 ▶       bootstrap: def.bootstrap || EMPTY_ARRAY,
423 ▶       declarations: def.declarations || EMPTY_ARRAY,
424 ▶       imports: def.imports || EMPTY_ARRAY,
425 ▶       exports: def.exports || EMPTY_ARRAY,
426 ▶       transitiveCompileScopes: null,
427 ▶       schemas: def.schemas || null,
428 ▶       id: def.id || null,
429 │     };
430 │     return res;
431 │   });
432 │ }
```

📄 `angular/packages/core/src/di/interface/defs.ts` L186–199 （▶ の行: 197–198）

```ts
186 │  * Options:
187 │  *
188 │  * * `providers`: an optional array of providers to add to the injector. Each provider must
189 │  *   either have a factory or point to a type which has a `ɵprov` static property (the
190 │  *   type must be an `InjectableType`).
191 │  * * `imports`: an optional array of imports of other `InjectorType`s or `InjectorTypeWithModule`s
192 │  *   whose providers will also be added to the injector. Locally provided types will override
193 │  *   providers from imports.
194 │  *
195 │  * @codeGenApi
196 │  */
197 ▶ export function ɵɵdefineInjector(options: {providers?: any[]; imports?: any[]}): unknown {
198 ▶   return {providers: options.providers || [], imports: options.imports || []};
199 │ }
```

420〜429 行目 `ɵɵdefineNgModule` は受け取ったものを `NgModuleDef` の形に並べ直すだけです。無いキーは `EMPTY_ARRAY`（422〜425 行目）か `null`（427〜428 行目）。426 行目 `transitiveCompileScopes: null`（JIT のキャッシュ置き場。第 1 回）。197〜198 行目 `ɵɵdefineInjector` も `{providers: options.providers || [], imports: options.imports || []}` を返すだけ。**どちらも計算は一切しません**。計算は使われる瞬間（`R3Injector` 生成、スコープ解決）まで遅延されます。

📄 `angular/packages/core/src/render3/scope.ts` L45–69 （▶ の行: 49–51, 55, 57–60, 62, 64, 67）

```ts
45 │ /**
46 │  * Adds the module metadata that is necessary to compute the module's transitive scope to an
47 │  * existing module definition.
48 │  *
49 ▶  * Scope metadata of modules is not used in production builds, so calls to this function can be
50 ▶  * marked pure to tree-shake it from the bundle, allowing for all referenced declarations
51 ▶  * to become eligible for tree-shaking as well.
52 │  *
53 │  * @codeGenApi
54 │  */
55 ▶ export function ɵɵsetNgModuleScope(type: any, scope: NgModuleScopeInfoFromDecorator): unknown {
56 │   return noSideEffects(() => {
57 ▶     const ngModuleDef = getNgModuleDefOrThrow(type);
58 ▶     ngModuleDef.declarations = convertToTypeArray(scope.declarations || EMPTY_ARRAY);
59 ▶     ngModuleDef.imports = convertToTypeArray(scope.imports || EMPTY_ARRAY);
60 ▶     ngModuleDef.exports = convertToTypeArray(scope.exports || EMPTY_ARRAY);
61 │ 
62 ▶     if (scope.bootstrap) {
63 │       // This only happens in local compilation mode.
64 ▶       ngModuleDef.bootstrap = convertToTypeArray(scope.bootstrap);
65 │     }
66 │ 
67 ▶     depsTracker.registerNgModule(type, scope);
68 │   });
69 │ }
```

📄 `angular/packages/core/src/render3/scope.ts` L71–89 （▶ の行: 74–75, 80–81, 83, 87–88）

```ts
71 │ function convertToTypeArray(
72 │   values: Type<any>[] | (() => Type<any>[]) | RawScopeInfoFromDecorator[],
73 │ ): Type<any>[] | (() => Type<any>[]) {
74 ▶   if (typeof values === 'function') {
75 ▶     return values;
76 │   }
77 │ 
78 │   const flattenValues = flatten(values);
79 │ 
80 ▶   if (flattenValues.some(isForwardRef)) {
81 ▶     return () => flattenValues.map(resolveForwardRef).map(maybeUnwrapModuleWithProviders);
82 │   } else {
83 ▶     return flattenValues.map(maybeUnwrapModuleWithProviders);
84 │   }
85 │ }
86 │ 
87 ▶ function maybeUnwrapModuleWithProviders(value: any): Type<any> {
88 ▶   return isModuleWithProviders(value) ? value.ngModule : (value as Type<any>);
89 │ }
```

📄 `angular/packages/core/src/render3/deps_tracker/deps_tracker.ts` L113–125 （▶ の行: 118–119, 124）

```ts
113 │   /**
114 │    * @override
115 │    * This implementation does not make use of param scopeInfo since it assumes the scope info is
116 │    * already added to the type itself through methods like {@link ɵɵsetNgModuleScope}
117 │    */
118 ▶   registerNgModule(type: Type<any>, scopeInfo: NgModuleScopeInfoFromDecorator): void {
119 ▶     if (!isNgModule(type)) {
120 │       throw new Error(`Attempting to register a Type which is not NgModule as NgModule: ${type}`);
121 │     }
122 │ 
123 │     // Lazily process the NgModules later when needed.
124 ▶     this.ngModulesWithSomeUnresolvedDecls.add(type);
125 │   }
```

55 行目 `ɵɵsetNgModuleScope`。49〜51 行目のコメント「モジュールのスコープメタデータは本番ビルドでは使われないので、この呼び出しは pure と印を付けてバンドルから tree-shake でき、参照されている declaration も tree-shake の対象になる」。57 行目で `type.ɵmod` を取り（無ければ例外）、58〜60 行目で `declarations` / `imports` / `exports` を**上書き**します。`ɵɵdefineNgModule` が入れた `EMPTY_ARRAY` がここで実物に置き換わるのです。62〜65 行目、`bootstrap` は local compilation のときだけ。67 行目 `depsTracker.registerNgModule`。118〜124 行目、NgModule であることを確かめ、「宣言が未解決かもしれないモジュール」の集合に入れるだけ。実際のスコープ計算は[第 6 回](06-ngmodule-jit-scope.md)の `getNgModuleScope` が初めて呼ばれたときです。

74〜75 行目 `convertToTypeArray`。既に閉包（`() => [...]`）ならそのまま。80〜81 行目、要素に `forwardRef` があれば「解決して `ModuleWithProviders` を剥く」閉包に。83 行目、無ければ即座に剥いた配列。87〜88 行目 `maybeUnwrapModuleWithProviders` は `{ngModule, providers}` から `ngModule` を取り出します。**スコープ側では providers は捨てられる**（providers は `ɵinj` 経由で第 8 回へ）。

📄 `angular/packages/core/src/linker/ng_module_registration.ts` L26–50 （▶ の行: 26–29, 46–49）

```ts
26 ▶ function assertSameOrNotExisting(id: string, type: Type<any> | null, incoming: Type<any>): void {
27 ▶   if (type && type !== incoming && checkForDuplicateNgModules) {
28 ▶     throw new RuntimeError(
29 ▶       RuntimeErrorCode.DUPLICATE_NG_MODULE_ID,
30 │       ngDevMode &&
31 │         `Duplicate module registered for ${id} - ${stringify(type)} vs ${stringify(type.name)}`,
32 │     );
33 │   }
34 │ }
35 │ 
36 │ /**
37 │  * Adds the given NgModule type to Angular's NgModule registry.
38 │  *
39 │  * This is generated as a side-effect of NgModule compilation. Note that the `id` is passed in
40 │  * explicitly and not read from the NgModule definition. This is for two reasons: it avoids a
41 │  * megamorphic read, and in JIT there's a chicken-and-egg problem where the NgModule may not be
42 │  * fully resolved when it's registered.
43 │  *
44 │  * @codeGenApi
45 │  */
46 ▶ export function registerNgModuleType(ngModuleType: Type<any>, id: string): void {
47 ▶   const existing = modules.get(id) || null;
48 ▶   assertSameOrNotExisting(id, existing, ngModuleType);
49 ▶   modules.set(id, ngModuleType as NgModuleType);
50 │ }
```

46〜49 行目 `registerNgModuleType`。モジュール単位の `Map<string, NgModuleType>` に `id` で登録します。26〜29 行目、同じ id に別のクラスが来たら `DUPLICATE_NG_MODULE_ID`。登録簿を読むのは `getNgModuleById(id)` と、非推奨の `getModuleFactory(id)`（ng\_module\_factory\_loader.ts）の 2 つだけで、普通のアプリで `id` を書く必要はありません（第 1 回の JSDoc「無ければ登録されない」）。

| @NgModule のフィールド | ɵmod の引数 | ɵinj の引数 | 付随する文 | .d.ts の型引数 |
| --- | --- | --- | --- | --- |
| `declarations` | — | — | `ɵɵsetNgModuleScope`（ngJitMode ガード） | 第 2 引数 |
| `imports` | — | `imports`（directive / pipe / providers 無しの standalone cmp を除く） | `ɵɵsetNgModuleScope` | 第 3 引数 |
| `exports` | — | `imports`（NgModule のものだけ） | `ɵɵsetNgModuleScope` | 第 4 引数 |
| `providers` | — | `providers`（式のまま） | — | — |
| `bootstrap` | `bootstrap` | — | —（local compilation では setNgModuleScope） | — |
| `schemas` | —（JIT では入る） | — | — | — |
| `id` | `id` | — | `ɵɵregisterNgModuleType` | — |
| `jit` | analyze が空を返し、何も出力されない（352〜355 行目） |   |   |   |

> **🧪 DEMO — @NgModule のメタデータから AOT 出力の形を組む**
>
> 全体コンパイル（Global / SideEffect）の規則で、ɵfac / ɵmod / ɵinj と付随する文を組み立てます。5〜6 節の規則を写した静的なロジックで、コンパイラは動かしていません。exports のうち名前が `Module` で終わるものを NgModule とみなします（デモ上の約束。実物は 3 節 883 行目で型を見ます）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngmodule-aot-output)

## ここまでの呼び出し

- 👤 `ng build`（aot: true） — angular-cli application builder — *define: ngJitMode = 'false'（application-code-bundle.ts L665）*
  - `NgModuleDecoratorHandler.detect(node, decorators)` — compiler-cli/.../ng\_module/src/handler.ts L302
  - `analyze(node, decorator)` — handler.ts L321 — *declarations L377 → imports L412 → exports L448 → bootstrap L464 → schemas L487 → id L507 → Global/Local L566 → providers L605 → injector/factory メタ L663-696*
  - `register(node, analysis)` — handler.ts L755 — *scopeRegistry.registerNgModuleMetadata（第 4 回の入力）*
  - `resolve(node, analysis)` — handler.ts L779 — *injectorImports: imports（directive/pipe を除く）+ exports の NgModule（L804-888）*
  - `compileFull(node, analysis, resolution)` — handler.ts L927
    - `compileNgFactoryDefField(fac)` — handler.ts L939 — *ɵfac*
    - `compileInjector({...inj, imports: injectorImports})` — compiler/src/render3/r3\_injector\_compiler.ts L22 — *ɵinj = ɵɵdefineInjector({providers?, imports?})*
    - `compileNgModule(mod)` — compiler/src/render3/r3\_module\_compiler.ts L229 — *ɵmod = ɵɵdefineNgModule({type, bootstrap?, id?})*
      - `generateSetNgModuleScopeCall(meta)` — r3\_module\_compiler.ts L362 — *(function () { (typeof ngJitMode === "undefined" || ngJitMode) && ɵɵsetNgModuleScope(...) })()*
      - `ɵɵregisterNgModuleType(type, id)` の文 — r3\_module\_compiler.ts L278 — *id があるとき*
- 👤 （ブラウザで実行）`class MyModule { static ɵmod = ɵɵdefineNgModule({...}) }` — 出力された .js
  - `ɵɵdefineNgModule(def)` — core/src/render3/definition.ts L394 — *EMPTY\_ARRAY / null で埋めた NgModuleDef を返すだけ*
  - `ɵɵdefineInjector(options)` — core/src/di/interface/defs.ts L197
  - `ɵɵsetNgModuleScope(type, scope)` — core/src/render3/scope.ts L55 — *開発ビルドのみ。ɵmod.declarations / imports / exports を上書きし depsTracker.registerNgModule*

## 聞かれそうな質問

**Q. ngJitMode とは何ですか？どこで false になりますか？**

compiler が出力に埋め込むガード用のグローバル名です（r3\_module\_compiler.ts 415 行目 → util.ts 140〜141 行目 `guardedExpression('ngJitMode', expr)`）。値を決めるのは CLI で、application-code-bundle.ts 665 行目の esbuild `define` が `jit ? 'true' : 'false'`。`ng build` の既定は AOT なので `'false'` になり、`(typeof ngJitMode === "undefined" || ngJitMode) && ...` の右側は dead code として消えます。`ng test` など JIT のときは `'true'` で、`ɵɵsetNgModuleScope` が実行されます。

**Q. 本番バンドルに declarations の配列は残っていますか？**

残っていません。7 節の出力 8 行目のとおり `ɵmod` の引数に declarations は無く、唯一の置き場だった `ɵɵsetNgModuleScope(...)` の文（1850 行目の形）は `ngJitMode` が false で消えます。`<my-decl>` の解決は、コンポーネントの `ɵcmp` に出力された `dependencies` 配列で行われます（[第 4 回](04-ngmodule-compilation-scope.md)）。

**Q. exports に書いただけの NgModule の providers が、import 側で使えるのはなぜですか？**

handler.ts 878〜888 行目。resolve が exports の中の NgModule（883 行目 `isNgModule`）を `injectorImports` に push し、compileFull 940〜943 行目でそれが `ɵinj.imports` になるからです。第 1 回で見た `BModule.ɵinj = {imports: [AModule]}` がその結果です。

**Q. standalone コンポーネントを imports に入れると ɵinj.imports に出ますか？**

providers を持ちうるときだけです。827〜832 行目で directive と pipe は除外され、standalone コンポーネントは 835 行目の `mayExportProviders` が false なら 848〜850 行目で除外されます。自分も、import した NgModule も providers を持たないコンポーネントは `ɵinj` に現れません。

**Q. schemas はどこに行くのですか？出力に見えません**

全体コンパイルでは、handler.ts 601 行目で `schemas: []` を compiler に渡すので `ɵmod` には出ません（269 行目の `length > 0` が偽）。analyze で読んだ本物の schemas（487〜490 行目）は register 762 行目でスコープ登録簿に渡され、テンプレート型チェックの `RegistryDomSchemaChecker` が未知の要素を許すかの判定に使います（[第 16 回](16-ngmodule-schemas.md)）。JIT では第 2 回 158 行目のとおり `ɵmod.schemas` に入り、実行時に `validateElementIsKnown` が読みます。

**Q. id を付けると出力はどう変わりますか？**

2 か所増えます。`ɵmod` の引数に `id`（r3\_module\_compiler.ts 274 行目）と、トップレベルの文 `ɵɵregisterNgModuleType(MyModule, 'id')`（278〜280 行目、出力 23 行目）。ランタイムは ng\_module\_registration.ts 49 行目で `Map` に登録し、同じ id に別クラスが来ると 28〜32 行目の `DUPLICATE_NG_MODULE_ID` を投げます。

## 読み終えて

- `NgModuleDecoratorHandler.analyze` は declarations → imports → exports → bootstrap → schemas → id → providers の順に読み、全体コンパイルでは `kind: Global` / `selectorScopeMode: SideEffect` / `schemas: []`（handler.ts 582〜602 行目）
- resolve が `ɵinj.imports` を確定する。imports から directive / pipe / providers 無しの standalone cmp を除き（827〜850 行目）、exports の NgModule を足す（878〜888 行目）
- compiler の `compileNgModule` は `type` / `bootstrap` / `id` だけを `ɵɵdefineNgModule` に渡し、declarations / imports / exports は `(typeof ngJitMode === "undefined" || ngJitMode) && ɵɵsetNgModuleScope(...)` の別の文で出す（256〜264 行目、404〜423 行目）
- CLI が `ngJitMode` を `'false'` に define するので（application-code-bundle.ts 665 行目）、本番バンドルからその文と declarations への参照が消える
- ランタイムの `ɵɵdefineNgModule` / `ɵɵdefineInjector` は受け取った値を並べ直すだけ。計算は使われる瞬間まで遅延される。次回は「消えた declarations の代わりに、コンポーネント側に何が書き込まれているか」

---

← 前: [@NgModule デコレータが実行された瞬間：makeDecorator と compileNgModuleDefs](02-ngmodule-decorator.md)  
次: [コンパイルスコープ：テンプレートの &lt;app-x&gt; がどのコンポーネントか決まる仕組み](04-ngmodule-compilation-scope.md) →
