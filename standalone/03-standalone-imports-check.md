[目次](../README.md) › [standalone コンポーネントの内側](README.md) › 第 3 回 / 全 14 回

# imports の検証（AOT）：validateAndFlattenComponentImports・validateStandaloneImports・StandaloneComponentScopeReader

> ngtsc の ComponentDecoratorHandler.analyze が imports を評価して平坦化する手順、standalone でないコンポーネントに imports を書いたとき（NG2010）、standalone でないものを import したとき（NG2011）、コンポーネントでも directive でも pipe でも NgModule でもないものを import したときのエラー。StandaloneComponentScopeReader が「自分自身」をスコープに最初に入れる行と isPoisoned。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/standalone-imports-check)

---

`ng build` で `imports` に間違ったものを書くと、NG2010 / NG2011 / NG2012 のようなエラーが出ます。この章では AOT コンパイラ ngtsc の `ComponentDecoratorHandler` が `imports` を **いつ読み、どう平坦化し、何を検査しているか**を、`analyze`（ファイル単位）と `resolve`（プログラム全体）の 2 段階に分けて追います。最後に、検査の結果を `dependencies` の材料にする `StandaloneComponentScopeReader` が「自分自身」をスコープに最初に入れる行と、エラーがあったとき `isPoisoned` が型チェックと出力をどう止めるかを確認します。[前回](02-standalone-decorator.md)の JIT と同じ仕事を、コンパイラ側がどうやっているか、という回です。

読む対象は `packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` と `util.ts`、`packages/compiler-cli/src/ngtsc/scope/src/standalone.ts` と `util.ts`、`packages/compiler-cli/src/ngtsc/diagnostics/src/error_code.ts`、それにコンパイラのテスト `standalone_spec.ts` です。

1. [1. 概観](01-standalone.md)
2. [2. @Component 実行の瞬間（JIT）](02-standalone-decorator.md)
3. **3. imports の検証（AOT）**（この章）
4. [4. 使った依存だけが残る](04-standalone-used-only.md)
5. [5. forwardRef と自己参照](05-standalone-forward-ref.md)
6. [6. ローカルコンパイル](06-standalone-local-compilation.md)
7. [7. 実行時の依存解決](07-standalone-directive-registry.md)
8. [8. providers の 2 つの行き先](08-standalone-providers-two-injectors.md)
9. [9. 入口の検査](09-standalone-entry-checks.md)
10. [10. hostDirectives](10-standalone-host-directives.md)
11. [11. @defer と imports](11-standalone-defer-deps.md)
12. [12. TestBed の差し替え](12-standalone-testbed-override.md)
13. [13. selectorless（実験的）](13-standalone-selectorless.md)
14. [14. foreignImports（内部向け）](14-standalone-foreign-imports.md)

## 1. 2 段階：analyze と resolve

ngtsc は各デコレータを `DecoratorHandler` で処理します。`@Component` 用が `ComponentDecoratorHandler` で、主なメソッドは `analyze`（そのクラスとファイルだけを見る）、`resolve`（全ファイルの `analyze` が終わった後、他のクラスのメタデータも見る）、`compileFull`（出力）の順に呼ばれます。`imports` の検査はこのうち `analyze` と `resolve` の 2 か所にあります。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L483–492 （▶ の行: 483, 492）

```ts
483 ▶   analyze(
484 │     node: ClassDeclaration,
485 │     decorator: Readonly<Decorator>,
486 │   ): AnalysisOutput<ComponentAnalysisData> {
487 │     this.perf.eventCount(PerfEvent.AnalyzeComponent);
488 │     const containingFile = node.getSourceFile().fileName;
489 │     this.literalCache.delete(decorator);
490 │ 
491 │     let diagnostics: ts.Diagnostic[] | undefined;
492 ▶     let isPoisoned = false;
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L495–511 （▶ の行: 495, 507–508）

```ts
495 ▶     const directiveResult = extractDirectiveMetadata(
496 │       node,
497 │       decorator,
498 │       this.reflector,
499 │       this.importTracker,
500 │       this.evaluator,
501 │       this.refEmitter,
502 │       this.referencesRegistry,
503 │       this.isCore,
504 │       this.annotateForClosureCompiler,
505 │       this.compilationMode,
506 │       this.elementSchemaRegistry.getDefaultComponentElementName(),
507 ▶       this.strictStandalone,
508 ▶       this.implicitStandaloneValue,
509 │       this.emitDeclarationOnly,
510 │       this.legacyOptionalChaining,
511 │     );
```

492 行目、`isPoisoned = false` から始まります。この章で何度も `true` にされる変数です。495 行目、まず `@Directive` と共通のメタデータを取り出します。507〜508 行目で `strictStandalone` と `implicitStandaloneValue` を渡していて、ここで `metadata.isStandalone` が決まります（shared.ts 380〜396 行目、[既出](../ngmodule/18-ngmodule-to-standalone.md)）。以降の検査はこの値を見ます。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/metadata.ts` L93–100 （▶ の行: 93, 96–97）

```ts
 93 ▶   isPoisoned: boolean;
 94 │   legacyAnimationTriggerNames: LegacyAnimationTriggerNames | null;
 95 │ 
 96 ▶   rawImports: ts.Expression | null;
 97 ▶   resolvedImports: Reference<ClassDeclaration>[] | null;
 98 │   foreignImports: ForeignComponentMeta[] | null;
 99 │   rawDeferredImports: ts.Expression | null;
100 │   resolvedDeferredImports: Reference<ClassDeclaration>[] | null;
```

`analyze` の成果物 `ComponentAnalysisData` のうち、この章で使うのは 93 行目 `isPoisoned`、96 行目 `rawImports`（`imports:` の右側の式そのもの）、97 行目 `resolvedImports`（式を評価して得たクラス参照の配列）です。`analyze` がこの 3 つを埋め、`resolve` が読みます。

## 2. analyze (1)：standalone でないのに imports がある → NG2010

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L611–644 （▶ の行: 616–618, 620, 624, 628, 631, 633, 636–637, 644）

```ts
611 │     let resolvedImports: Reference<ClassDeclaration>[] | null = null;
612 │     let foreignImports: ForeignComponentMeta[] | null = null;
613 │     let resolvedDeferredImports: Reference<ClassDeclaration>[] | null = null;
614 │     let resolvedDeferredImportsByBlock: Map<string, Reference<ClassDeclaration>[]> | null = null;
615 │ 
616 ▶     let rawImports: ts.Expression | null = component.get('imports') ?? null;
617 ▶     let rawDeferredImports: ts.Expression | null = component.get('deferredImports') ?? null;
618 ▶     let rawForeignImports: ts.Expression | null = component.get('foreignImports') ?? null;
619 │ 
620 ▶     if ((rawImports || rawDeferredImports || rawForeignImports) && !metadata.isStandalone) {
621 │       if (diagnostics === undefined) {
622 │         diagnostics = [];
623 │       }
624 ▶       const importsField = rawImports
625 │         ? 'imports'
626 │         : rawDeferredImports
627 │           ? 'deferredImports'
628 ▶           : 'foreignImports';
629 │       diagnostics.push(
630 │         makeDiagnostic(
631 ▶           ErrorCode.COMPONENT_NOT_STANDALONE,
632 │           component.get(importsField)!,
633 ▶           `'${importsField}' is only valid on a component that is standalone.`,
634 │           [
635 │             makeRelatedInformation(
636 ▶               node.name,
637 ▶               `Did you forget to add 'standalone: true' to this @Component?`,
638 │             ),
639 │           ],
640 │         ),
641 │       );
642 │       // Poison the component so that we don't spam further template type-checking errors that
643 │       // result from misconfigured imports.
644 ▶       isPoisoned = true;
```

1. **616〜618 行目：3 つのフィールドの式を取る**

   `imports` / `deferredImports` / `foreignImports`。まだ評価はしていません。`ts.Expression`（構文木）のままです。
2. **620 行目：どれか 1 つでもあり、かつ `!metadata.isStandalone`**

   624〜628 行目でどのフィールドだったかを決め、631 行目 `COMPONENT_NOT_STANDALONE`（NG2010）。633 行目のメッセージ「'imports' is only valid on a component that is standalone.」、636〜637 行目の関連情報「Did you forget to add 'standalone: true' to this @Component?」。
3. **644 行目：`isPoisoned = true`**

   642〜643 行目のコメント「imports の設定ミスから派生する型チェックエラーを連発しないため」。何が止まるかは 7 節で。

📄 `angular/packages/compiler-cli/test/ngtsc/standalone_spec.ts` L229–244 （▶ の行: 235–236, 243–244）

```ts
229 │               @Directive({selector: '[dir]'})
230 │               export class TestDir {}
231 │ 
232 │               @Component({
233 │                 selector: 'test-cmp',
234 │                 template: '<div dir></div>',
235 ▶                 imports: [TestDir],
236 ▶                 standalone: false,
237 │               })
238 │               export class TestCmp {}
239 │             `,
240 │         );
241 │         const diags = env.driveDiagnostics();
242 │         expect(diags.length).toBe(1);
243 ▶         expect(diags[0].code).toBe(ngErrorCode(ErrorCode.COMPONENT_NOT_STANDALONE));
244 ▶         expect(getSourceCodeForDiagnostic(diags[0])).toEqual('[TestDir]');
```
*コンパイラのテスト。standalone: false に imports を書いた例。*

236 行目 `standalone: false` と 235 行目 `imports: [TestDir]` の組み合わせで、243 行目 NG2010、244 行目のとおりエラー位置は `[TestDir]` の式全体です （632 行目で `component.get(importsField)` をノードに渡しているから）。

## 3. analyze (2)：imports を評価して平坦化する

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L645–673 （▶ の行: 645, 649, 656–659, 664–668, 671–672）

```ts
645 ▶     } else if (rawImports || rawDeferredImports || rawForeignImports) {
646 │       const importDiagnostics: ts.Diagnostic[] = [];
647 │ 
648 │       // There's no need to extract foreign imports if we're only emitting declarations.
649 ▶       if (rawForeignImports && !this.emitDeclarationOnly) {
650 │         const {foreignImports: imports, diagnostics} =
651 │           extractForeignImportsFromAst(rawForeignImports);
652 │         importDiagnostics.push(...diagnostics);
653 │         foreignImports = imports;
654 │       }
655 │ 
656 ▶       if (this.compilationMode !== CompilationMode.LOCAL && (rawImports || rawDeferredImports)) {
657 ▶         const importResolvers = combineResolvers([
658 ▶           createModuleWithProvidersResolver(this.reflector, this.isCore),
659 ▶           createForwardRefResolver(this.isCore),
660 │         ]);
661 │ 
662 │         if (rawImports) {
663 │           const expr = rawImports;
664 ▶           const imported = this.evaluator.evaluate(expr, importResolvers);
665 ▶           const {imports: flattened, diagnostics} = validateAndFlattenComponentImports(
666 ▶             imported,
667 ▶             expr,
668 ▶             false /* isDeferred */,
669 │           );
670 │           importDiagnostics.push(...diagnostics);
671 ▶           resolvedImports = flattened;
672 ▶           rawImports = expr;
673 │         }
```

1. **645 行目：standalone で、3 つのどれかがある**

   649 行目、`foreignImports` は別関数で（[第 14 回](14-standalone-foreign-imports.md)）。
2. **656 行目：`compilationMode !== LOCAL` のときだけ評価する**

   ローカルコンパイル（`compilationMode: 'experimental-local'`）では他ファイルのクラスを見られないので、ここを飛ばして `resolvedImports` は `null` のままです。その場合の出力（`ɵɵgetComponentDepsFactory`）は [第 6 回](06-standalone-local-compilation.md)。
3. **657〜660 行目：2 つの特別扱いを登録する**

   `createModuleWithProvidersResolver` は `X.forRoot()` のような呼び出しを `ModuleWithProviders` の印に、`createForwardRefResolver` は `forwardRef(() => X)` を `X` に置き換える、評価器のプラグインです。
4. **664 行目：`evaluator.evaluate(expr, importResolvers)`**

   部分評価器が、`imports: [A, B]` はもちろん、`imports: SHARED`（別ファイルの定数）や `imports: [...COMMON, C]` も静的に辿って、「クラス参照（`Reference`）の配列（入れ子あり）」にします。
5. **665〜669 行目：`validateAndFlattenComponentImports(imported, expr, false)`**

   平坦化と、クラス以外が混ざっていないかの検査。中身は次です。671 行目で結果を `resolvedImports` に、672 行目で元の式を `rawImports` に保存します。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/util.ts` L90–101 （▶ の行: 90–93, 95–96, 99–101）

```ts
 90 ▶ export function validateAndFlattenComponentImports(
 91 ▶   imports: ResolvedValue,
 92 ▶   expr: ts.Expression,
 93 ▶   isDeferred: boolean,
 94 │ ): FlattenedImports {
 95 ▶   const flattened: Reference<ClassDeclaration>[] = [];
 96 ▶   const diagnostics: ts.Diagnostic[] = [];
 97 │   let importsByBlock: Map<string, Reference<ClassDeclaration>[]> | null = null;
 98 │ 
 99 ▶   const errorMessage = isDeferred
100 ▶     ? `'deferredImports' must be an object mapping block names to dependency arrays.`
101 ▶     : `'imports' must be an array of components, directives, pipes, or NgModules.`;
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/util.ts` L142–160 （▶ の行: 142–143, 151, 154–157, 159）

```ts
142 ▶   if (!Array.isArray(imports)) {
143 ▶     const error = createValueHasWrongTypeError(expr, imports, errorMessage).toDiagnostic();
144 │     return {
145 │       imports: [],
146 │       importsByBlock: null,
147 │       diagnostics: [error],
148 │     };
149 │   }
150 │ 
151 ▶   for (let i = 0; i < imports.length; i++) {
152 │     const ref = imports[i];
153 │     let refExpr = expr;
154 ▶     if (
155 ▶       ts.isArrayLiteralExpression(expr) &&
156 ▶       expr.elements.length === imports.length &&
157 ▶       !expr.elements.some(ts.isSpreadAssignment)
158 │     ) {
159 ▶       refExpr = expr.elements[i];
160 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/util.ts` L162–178 （▶ の行: 162–165, 167–171）

```ts
162 ▶     if (Array.isArray(ref)) {
163 ▶       const {imports: childImports, diagnostics: childDiagnostics} =
164 ▶         validateAndFlattenComponentImports(ref, refExpr, isDeferred);
165 ▶       flattened.push(...childImports);
166 │       diagnostics.push(...childDiagnostics);
167 ▶     } else if (ref instanceof Reference) {
168 ▶       if (isNamedClassDeclaration(ref.node)) {
169 ▶         flattened.push(ref as Reference<ClassDeclaration>);
170 ▶       } else {
171 ▶         diagnostics.push(
172 │           createValueHasWrongTypeError(
173 │             ref.getOriginForDiagnostics(expr),
174 │             ref,
175 │             errorMessage,
176 │           ).toDiagnostic(),
177 │         );
178 │       }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/util.ts` L196–210 （▶ の行: 196–197, 204–205, 210）

```ts
196 ▶     } else {
197 ▶       const {node: diagnosticNode, value: diagnosticValue} = getDiagnosticOrigin(
198 │         ref,
199 │         expr,
200 │         refExpr,
201 │         imports,
202 │       );
203 │ 
204 ▶       diagnostics.push(
205 ▶         createValueHasWrongTypeError(diagnosticNode, diagnosticValue, errorMessage).toDiagnostic(),
206 │       );
207 │     }
208 │   }
209 │ 
210 ▶   return {imports: flattened, importsByBlock, diagnostics};
```
*179〜195 行目（ModuleWithProviders → NG2012）は ngmodule-standalone-imports で既出。*

1. **90〜96 行目：入力は評価済みの値と元の式、出力は平らな `Reference` 配列と診断**

   99〜101 行目、エラーメッセージは「'imports' must be an array of components, directives, pipes, or NgModules.」。`isDeferred` のときは別文言（[第 11 回](11-standalone-defer-deps.md)）。
2. **142〜148 行目：配列でなければ即エラー**

   `imports: SomeComponent`（配列で包み忘れ）がここです。
3. **151〜160 行目：要素ごとに「エラーを指す式」を決める**

   154〜157 行目、元の式が配列リテラルで、要素数が評価結果と同じで、スプレッドが無いときだけ、159 行目でその要素の式を使います。だから `imports: [A, Bad]` なら `Bad` の位置にエラーが出ますが、`imports: IMPORTS`（別の変数）なら `IMPORTS` 全体にエラーが出ます。
4. **162〜166 行目：要素が配列なら再帰**

   入れ子配列はここで平らになります。`imports: [CommonStuff, [A, B]]` が許されるのはこの 5 行のためです。
5. **167〜169 行目：クラス宣言への `Reference` なら採用**

   170〜177 行目、`Reference` だがクラスでない（例：関数）なら「wrong type」エラー。
6. **196〜206 行目：それ以外（文字列、数値、未解決の値）は「wrong type」エラー**

   **ここではまだ「standalone か」「NgModule か」は見ていません**。`Reference` は「どのクラスか」しか知らず、そのクラスが directive なのか NgModule なのかを知るには他のファイルの解析結果が要ります。それが `resolve` の仕事です（5 節）。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L675–697 （▶ の行: 675, 690–691, 695）

```ts
675 ▶         if (rawDeferredImports) {
676 │           const expr = rawDeferredImports;
677 │           const imported = this.evaluator.evaluate(expr, importResolvers);
678 │           const {
679 │             imports: flattened,
680 │             importsByBlock,
681 │             diagnostics,
682 │           } = validateAndFlattenComponentImports(imported, expr, true /* isDeferred */);
683 │           importDiagnostics.push(...diagnostics);
684 │           resolvedDeferredImports = flattened;
685 │           resolvedDeferredImportsByBlock = importsByBlock ?? null;
686 │           rawDeferredImports = expr;
687 │         }
688 │       }
689 │ 
690 ▶       if (importDiagnostics.length > 0) {
691 ▶         isPoisoned = true;
692 │         if (diagnostics === undefined) {
693 │           diagnostics = [];
694 │         }
695 ▶         diagnostics.push(...importDiagnostics);
696 │       }
697 │     }
```

675〜687 行目は `deferredImports` の同じ処理です（[第 11 回](11-standalone-defer-deps.md)）。690〜696 行目、平坦化で診断が 1 件でも出たら `isPoisoned = true` にして診断を積みます。`analyze` の `imports` 検査はここまでです。

## 4. どの ScopeReader が答えるか

`resolve` の前に、`analyze` の結果を「このコンポーネントのスコープ」に変える `StandaloneComponentScopeReader` を読みます。ngtsc はスコープを読む人（`ComponentScopeReader`）を 3 つ重ねています。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L1415–1425 （▶ の行: 1415–1418, 1421–1424）

```ts
1415 ▶     const standaloneScopeReader = new StandaloneComponentScopeReader(
1416 ▶       metaReader,
1417 ▶       ngModuleScopeRegistry,
1418 ▶       depScopeReader,
1419 │     );
1420 │     const selectorlessScopeReader = new SelectorlessComponentScopeReader(metaReader, reflector);
1421 ▶     const scopeReader: ComponentScopeReader = new CompoundComponentScopeReader([
1422 ▶       ngModuleScopeRegistry,
1423 ▶       selectorlessScopeReader,
1424 ▶       standaloneScopeReader,
1425 │     ]);
```
*NgCompiler のコンストラクタ付近。*

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/component_scope.ts` L19–30 （▶ の行: 23–26）

```ts
19 │ export class CompoundComponentScopeReader implements ComponentScopeReader {
20 │   constructor(private readers: ComponentScopeReader[]) {}
21 │ 
22 │   getScopeForComponent(clazz: ClassDeclaration): ComponentScope | null {
23 ▶     for (const reader of this.readers) {
24 ▶       const meta = reader.getScopeForComponent(clazz);
25 ▶       if (meta !== null) {
26 ▶         return meta;
27 │       }
28 │     }
29 │     return null;
30 │   }
```

1415〜1419 行目、`StandaloneComponentScopeReader` は `metaReader`（全クラスのメタデータ）、`LocalModuleScopeRegistry`（同じプログラム内の NgModule のスコープ、[第 4 回](../ngmodule/04-ngmodule-compilation-scope.md)）、`MetadataDtsModuleScopeResolver`（`.d.ts` の NgModule、[第 5 回](../ngmodule/05-ngmodule-exports.md)）を受け取ります。1421〜1425 行目、順番は **NgModule のレジストリ → selectorless → standalone**。`CompoundComponentScopeReader` は 23〜27 行目で順に聞いて、最初に `null` でない答えを返します。NgModule に宣言されたコンポーネントは 1 番目が答え、standalone コンポーネントは 1 番目が `null`（宣言元の NgModule が無い）なので 3 番目まで来ます。

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/api.ts` L70–77 （▶ の行: 72–73, 76）

```ts
70 │ export interface StandaloneScope {
71 │   kind: ComponentScopeKind.Standalone;
72 ▶   dependencies: Array<DirectiveMeta | PipeMeta | NgModuleMeta>;
73 ▶   deferredDependencies: Array<DirectiveMeta | PipeMeta>;
74 │   component: ClassDeclaration;
75 │   schemas: SchemaMetadata[];
76 ▶   isPoisoned: boolean;
77 │ }
```

答えの型 `StandaloneScope`。72 行目 `dependencies` は directive / pipe / NgModule のメタデータの配列、73 行目は `@defer` 用、76 行目 `isPoisoned`。NgModule の `LocalModuleScope` にあった compilation / exported の区別はありません。standalone コンポーネントは何も export しないからです。

### StandaloneComponentScopeReader：自分自身を最初に入れる

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/standalone.ts` L21–50 （▶ の行: 22, 30, 33, 35–39, 41, 45–47, 49–50）

```ts
21 │ export class StandaloneComponentScopeReader implements ComponentScopeReader {
22 ▶   private cache = new Map<ClassDeclaration, StandaloneScope | null>();
23 │ 
24 │   constructor(
25 │     private metaReader: MetadataReader,
26 │     private localModuleReader: LocalModuleScopeRegistry,
27 │     private dtsModuleReader: DtsModuleScopeResolver,
28 │   ) {}
29 │ 
30 ▶   getScopeForComponent(clazz: ClassDeclaration): StandaloneScope | null {
31 │     if (!this.cache.has(clazz)) {
32 │       const clazzRef = new Reference(clazz);
33 ▶       const clazzMeta = this.metaReader.getDirectiveMetadata(clazzRef);
34 │ 
35 ▶       if (
36 ▶         clazzMeta === null ||
37 ▶         !clazzMeta.isComponent ||
38 ▶         !clazzMeta.isStandalone ||
39 ▶         clazzMeta.selectorlessEnabled
40 │       ) {
41 ▶         this.cache.set(clazz, null);
42 │         return null;
43 │       }
44 │ 
45 ▶       // A standalone component always has itself in scope, so add `clazzMeta` during
46 ▶       // initialization.
47 ▶       const dependencies = new Set<DirectiveMeta | PipeMeta | NgModuleMeta>([clazzMeta]);
48 │       const deferredDependencies = new Set<DirectiveMeta | PipeMeta>();
49 ▶       const seen = new Set<ClassDeclaration>([clazz]);
50 ▶       let isPoisoned = clazzMeta.isPoisoned;
```

1. **22 行目・30 行目：クラスごとにキャッシュ**

   JIT の `standaloneComponentsScopeCache`（[前回](02-standalone-decorator.md)）と同じ役割です。
2. **33〜43 行目：standalone なコンポーネントでなければ `null`**

   35〜39 行目、メタデータが無い・コンポーネントでない（directive）・standalone でない・selectorless のどれかなら 41 行目で `null` を記憶します。selectorless は 2 番目の reader が答えます（[第 13 回](13-standalone-selectorless.md)）。
3. **45〜47 行目：`dependencies` の初期値は「自分自身」**

   コメント「A standalone component always has itself in scope」。`new Set([clazzMeta])` で、`imports` を読む前に自分を入れます。だから `imports` に自分を書かなくても、テンプレートで自分のセレクタを使う再帰コンポーネントが書けます（[第 5 回](05-standalone-forward-ref.md)）。49 行目、`seen` にも自分を入れて、`imports` に自分が書かれていても二重にしません。
4. **50 行目：`isPoisoned` の初期値はコンポーネント自身の `isPoisoned`**

   2〜3 節で `analyze` が `true` にしていれば、スコープも最初から poisoned です。

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/standalone.ts` L52–72 （▶ の行: 52–54, 57, 59–62, 66–69）

```ts
52 ▶       if (clazzMeta.imports !== null) {
53 ▶         for (const ref of clazzMeta.imports) {
54 ▶           if (seen.has(ref.node)) {
55 │             continue;
56 │           }
57 ▶           seen.add(ref.node);
58 │ 
59 ▶           const dirMeta = this.metaReader.getDirectiveMetadata(ref);
60 ▶           if (dirMeta !== null) {
61 ▶             dependencies.add({...dirMeta, ref});
62 ▶             isPoisoned = isPoisoned || dirMeta.isPoisoned || !dirMeta.isStandalone;
63 │             continue;
64 │           }
65 │ 
66 ▶           const pipeMeta = this.metaReader.getPipeMetadata(ref);
67 ▶           if (pipeMeta !== null) {
68 ▶             dependencies.add({...pipeMeta, ref});
69 ▶             isPoisoned = isPoisoned || !pipeMeta.isStandalone;
70 │             continue;
71 │           }
72 │ 
```
*73〜98 行目（NgModule の exports を展開する部分）は ngmodule-standalone-imports で既出。*

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/standalone.ts` L96–104 （▶ の行: 100–102）

```ts
 96 │ 
 97 │             continue;
 98 │           }
 99 │ 
100 ▶           // Import was not a component/directive/pipe/NgModule, which is an error and poisons the
101 ▶           // scope.
102 ▶           isPoisoned = true;
103 │         }
104 │       }
```

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/standalone.ts` L142–152 （▶ の行: 142–143, 145, 147–148, 152）

```ts
142 ▶       this.cache.set(clazz, {
143 ▶         kind: ComponentScopeKind.Standalone,
144 │         component: clazz,
145 ▶         dependencies: Array.from(dependencies),
146 │         deferredDependencies: Array.from(deferredDependencies),
147 ▶         isPoisoned,
148 ▶         schemas: clazzMeta.schemas ?? [],
149 │       });
150 │     }
151 │ 
152 ▶     return this.cache.get(clazz)!;
```

1. **52〜53 行目：`clazzMeta.imports`（3 節の `resolvedImports`）を 1 つずつ**

   54〜57 行目、`seen` で重複を飛ばします。
2. **59〜63 行目：directive / component なら `dependencies` に足す。standalone でなければ poisoned**

   62 行目、`isPoisoned || dirMeta.isPoisoned || !dirMeta.isStandalone`。**standalone でないものも `dependencies` には入れたうえで**、スコープ全体を poisoned にします。エラーメッセージはここでは作りません。作るのは 5 節の `validateStandaloneImports` です。
3. **66〜70 行目：pipe も同様**

   69 行目、standalone でなければ poisoned。
4. **100〜102 行目：directive でも pipe でも NgModule でもなければ poisoned**

   73〜98 行目の NgModule 分岐（既出）を抜けてここに来るのは、デコレータの無いクラスを import したときです。
5. **142〜149 行目：結果をキャッシュして返す**

   145 行目で `Set` を配列に、147 行目 `isPoisoned`、148 行目 `schemas`（無ければ `[]`）。この `dependencies` が [第 4 回](04-standalone-used-only.md)でテンプレートと照合され、使われたものだけが ɵcmp に残ります。

## 5. resolve：validateStandaloneImports が NG2011 / NG2012 を出す

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1515–1527 （▶ の行: 1516–1517, 1523–1524, 1527）

```ts
1515 │     // Run diagnostics only in global mode.
1516 ▶     if (this.compilationMode !== CompilationMode.LOCAL) {
1517 ▶       const nonLocalDiagnostics = this.getNonLocalDiagnostics(node, analysis);
1518 │       if (nonLocalDiagnostics !== null) {
1519 │         diagnostics.push(...nonLocalDiagnostics);
1520 │       }
1521 │     }
1522 │ 
1523 ▶     if (diagnostics.length > 0) {
1524 ▶       return {diagnostics};
1525 │     }
1526 │ 
1527 ▶     return {data};
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L2229–2252 （▶ の行: 2235–2236, 2242–2248, 2250–2251）

```ts
2229 │   /** Produces diagnostics that require more than local information. */
2230 │   private getNonLocalDiagnostics(
2231 │     node: ClassDeclaration,
2232 │     analysis: Readonly<ComponentAnalysisData>,
2233 │   ): ts.Diagnostic[] | null {
2234 │     // We shouldn't be able to hit this, but add an assertion just in case the call site changes.
2235 ▶     if (this.compilationMode === CompilationMode.LOCAL) {
2236 ▶       throw new Error('Method cannot be called in local compilation mode.');
2237 │     }
2238 │ 
2239 │     let diagnostics: ts.Diagnostic[] | null = null;
2240 │ 
2241 │     // Validate `@Component.imports` and `@Component.deferredImports` fields.
2242 ▶     if (analysis.resolvedImports !== null && analysis.rawImports !== null) {
2243 ▶       const importDiagnostics = validateStandaloneImports(
2244 ▶         analysis.resolvedImports,
2245 ▶         analysis.rawImports,
2246 ▶         this.metaReader,
2247 ▶         this.scopeReader,
2248 ▶         false /* isDeferredImport */,
2249 │       );
2250 ▶       diagnostics ??= [];
2251 ▶       diagnostics.push(...importDiagnostics);
2252 │     }
```

`resolve` の終わり近く、1516〜1517 行目でローカルコンパイルでなければ `getNonLocalDiagnostics` を呼び、1523〜1524 行目、診断が 1 件でもあれば `data` を返さず診断だけを返します。2235〜2237 行目、ローカルモードで呼ばれたら例外（呼ばれない設計）。2242 行目、`analyze` が埋めた `resolvedImports` と `rawImports` が両方あるときだけ、2243〜2249 行目で `validateStandaloneImports` に `metaReader` と `scopeReader` を渡します。**この 2 つがあるから「import 先が standalone か」を判定できる**のです。`analyze` にはありませんでした。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L2875–2899 （▶ の行: 2876–2880, 2883–2886, 2888–2889, 2893, 2897）

```ts
2875 │ function validateStandaloneImports(
2876 ▶   importRefs: Reference<ClassDeclaration>[],
2877 ▶   importExpr: ts.Expression,
2878 ▶   metaReader: MetadataReader,
2879 ▶   scopeReader: ComponentScopeReader,
2880 ▶   isDeferredImport: boolean,
2881 │ ): ts.Diagnostic[] {
2882 │   const diagnostics: ts.Diagnostic[] = [];
2883 ▶   for (const ref of importRefs) {
2884 ▶     const dirMeta = metaReader.getDirectiveMetadata(ref);
2885 ▶     if (dirMeta !== null) {
2886 ▶       if (!dirMeta.isStandalone) {
2887 │         // Directly importing a directive that's not standalone is an error.
2888 ▶         diagnostics.push(
2889 ▶           makeNotStandaloneDiagnostic(
2890 │             scopeReader,
2891 │             ref,
2892 │             importExpr,
2893 ▶             dirMeta.isComponent ? 'component' : 'directive',
2894 │           ),
2895 │         );
2896 │       }
2897 ▶       continue;
2898 │     }
2899 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L2900–2923 （▶ の行: 2900–2903, 2908–2912, 2916–2919）

```ts
2900 ▶     const pipeMeta = metaReader.getPipeMetadata(ref);
2901 ▶     if (pipeMeta !== null) {
2902 ▶       if (!pipeMeta.isStandalone) {
2903 ▶         diagnostics.push(makeNotStandaloneDiagnostic(scopeReader, ref, importExpr, 'pipe'));
2904 │       }
2905 │       continue;
2906 │     }
2907 │ 
2908 ▶     const ngModuleMeta = metaReader.getNgModuleMetadata(ref);
2909 ▶     if (!isDeferredImport && ngModuleMeta !== null) {
2910 ▶       // Importing NgModules is always legal in `@Component.imports`,
2911 ▶       // but not supported in `@Component.deferredImports`.
2912 ▶       continue;
2913 │     }
2914 │ 
2915 │     // Make an error?
2916 ▶     const error = isDeferredImport
2917 ▶       ? makeUnknownComponentDeferredImportDiagnostic(ref, importExpr)
2918 ▶       : makeUnknownComponentImportDiagnostic(ref, importExpr);
2919 ▶     diagnostics.push(error);
2920 │   }
2921 │ 
2922 │   return diagnostics;
2923 │ }
```

1. **2883〜2885 行目：各 `Reference` について、まず directive のメタデータを聞く**

   2886 行目、あって standalone でなければ 2888〜2895 行目 `makeNotStandaloneDiagnostic`。2893 行目でコンポーネントか directive かを文言に入れます。2897 行目 `continue`。
2. **2900〜2905 行目：次に pipe**

   同じく standalone でなければ NG2011。
3. **2908〜2912 行目：NgModule は `imports` なら常に合法**

   コメント「Importing NgModules is always legal in `@Component.imports`, but not supported in `@Component.deferredImports`」。`isDeferredImport` が `true` なら `continue` せず、下のエラーへ。
4. **2916〜2919 行目：どれでもなければ「unknown import」**

   `imports` なら NG2012、`deferredImports` なら NG2022。

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/util.ts` L29–36 （▶ の行: 29–30, 33, 35）

```ts
29 ▶ export function makeNotStandaloneDiagnostic(
30 ▶   scopeReader: ComponentScopeReader,
31 │   ref: Reference<ClassDeclaration>,
32 │   rawExpr: ts.Expression | null,
33 ▶   kind: 'component' | 'directive' | 'pipe',
34 │ ): ts.Diagnostic {
35 ▶   const scope = scopeReader.getScopeForComponent(ref.node);
36 │ 
```
*37〜62 行目（メッセージの組み立てと NgModule の提案）は ngmodule-to-standalone で既出。*

35 行目、`scopeReader.getScopeForComponent(ref.node)`。`ref` は**import された側**（standalone でない directive）です。4 節の `CompoundComponentScopeReader` が 1 番目の `LocalModuleScopeRegistry` に聞き、その directive を宣言している NgModule が見つかれば 「It can be imported using its 'TestModule' NgModule instead.」という提案が付きます（37〜62 行目、既出）。

📄 `angular/packages/compiler-cli/test/ngtsc/standalone_spec.ts` L387–410 （▶ の行: 389, 393–395, 402, 409–410）

```ts
387 │           @Directive({
388 │             selector: '[dir]',
389 ▶             standalone: false,
390 │           })
391 │           export class TestDir {}
392 │ 
393 ▶           @NgModule({
394 ▶             declarations: [TestDir],
395 ▶             exports: [TestDir],
396 │           })
397 │           export class TestModule {}
398 │ 
399 │           @Component({
400 │             selector: 'test-cmp',
401 │             template: '<div dir></div>',
402 ▶             imports: [TestDir],
403 │           })
404 │           export class TestCmp {}
405 │         `,
406 │         );
407 │         const diags = env.driveDiagnostics();
408 │         expect(diags.length).toBe(1);
409 ▶         expect(diags[0].code).toBe(ngErrorCode(ErrorCode.COMPONENT_IMPORT_NOT_STANDALONE));
410 ▶         expect(getSourceCodeForDiagnostic(diags[0])).toEqual('TestDir');
```

389 行目 `standalone: false` の `TestDir` を、402 行目で直接 import しています。409 行目 NG2011、410 行目のとおりエラー位置は `TestDir` という 1 要素です（3 節の 159 行目で要素ごとの式を保存していたから）。393〜397 行目の `TestModule` が宣言して export しているので、提案文に `TestModule` が出ます。

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/util.ts` L65–85 （▶ の行: 65, 70, 72, 76, 81, 83）

```ts
65 ▶ export function makeUnknownComponentImportDiagnostic(
66 │   ref: Reference<ClassDeclaration>,
67 │   rawExpr: ts.Expression,
68 │ ) {
69 │   return makeDiagnostic(
70 ▶     ErrorCode.COMPONENT_UNKNOWN_IMPORT,
71 │     getDiagnosticNode(ref, rawExpr),
72 ▶     `Component imports must be standalone components, directives, pipes, or must be NgModules.`,
73 │   );
74 │ }
75 │ 
76 ▶ export function makeUnknownComponentDeferredImportDiagnostic(
77 │   ref: Reference<ClassDeclaration>,
78 │   rawExpr: ts.Expression,
79 │ ) {
80 │   return makeDiagnostic(
81 ▶     ErrorCode.COMPONENT_UNKNOWN_DEFERRED_IMPORT,
82 │     getDiagnosticNode(ref, rawExpr),
83 ▶     `Component deferred imports must be standalone components, directives or pipes.`,
84 │   );
85 │ }
```

70〜72 行目、NG2012「Component imports must be standalone components, directives, pipes, or must be NgModules.」。81〜83 行目、NG2022 は `deferredImports` 用で、NgModule が文言から消えています。

## 6. エラーコードと条件

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/error_code.ts` L98–112 （▶ の行: 101, 107, 112）

```ts
 98 │   /**
 99 │    * Raised when a component has `imports` but is not marked as `standalone: true`.
100 │    */
101 ▶   COMPONENT_NOT_STANDALONE = 2010,
102 │ 
103 │   /**
104 │    * Raised when a type in the `imports` of a component is a directive or pipe, but is not
105 │    * standalone.
106 │    */
107 ▶   COMPONENT_IMPORT_NOT_STANDALONE = 2011,
108 │ 
109 │   /**
110 │    * Raised when a type in the `imports` of a component is not a directive, pipe, or NgModule.
111 │    */
112 ▶   COMPONENT_UNKNOWN_IMPORT = 2012,
```

| コード | 条件 | 出す場所 | 段階 |
| --- | --- | --- | --- |
| NG2010 `COMPONENT_NOT_STANDALONE`（101 行目） | `standalone: false` なのに `imports` / `deferredImports` / `foreignImports`（または `schemas`）がある | handler.ts 620〜644 行目 | analyze |
| wrong type（`VALUE_HAS_WRONG_TYPE`） | `imports` が配列でない、要素がクラスでない | util.ts 142〜148・170〜177・196〜206 行目 | analyze |
| NG2012 `COMPONENT_UNKNOWN_IMPORT`（112 行目） | 要素が `ModuleWithProviders`（`forRoot()` の戻り値） | util.ts 179〜195 行目（既出） | analyze |
| NG2011 `COMPONENT_IMPORT_NOT_STANDALONE`（107 行目） | 要素が directive / component / pipe で standalone でない | handler.ts 2886〜2903 行目 → scope/util.ts 29 行目 | resolve |
| NG2012 `COMPONENT_UNKNOWN_IMPORT` | 要素がクラスだが directive でも pipe でも NgModule でもない | handler.ts 2916〜2919 行目 → scope/util.ts 65 行目 | resolve |
| NG2022 `COMPONENT_UNKNOWN_DEFERRED_IMPORT` | `deferredImports` の要素が NgModule、または不明 | handler.ts 2908〜2919 行目 → scope/util.ts 76 行目 | resolve |

## 7. isPoisoned になると何が止まるか

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1155–1162 （▶ の行: 1160–1161）

```ts
1155 │   index(
1156 │     context: IndexingContext,
1157 │     node: ClassDeclaration,
1158 │     analysis: Readonly<ComponentAnalysisData>,
1159 │   ) {
1160 ▶     if (analysis.isPoisoned && !this.usePoisonedData) {
1161 ▶       return null;
1162 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1232–1245 （▶ の行: 1237–1238, 1242–1244）

```ts
1232 │   typeCheck(
1233 │     ctx: TypeCheckContext,
1234 │     node: ClassDeclaration,
1235 │     meta: Readonly<ComponentAnalysisData>,
1236 │   ): void {
1237 ▶     if (!ts.isClassDeclaration(node) || (meta.isPoisoned && !this.usePoisonedData)) {
1238 ▶       return;
1239 │     }
1240 │     const ref = new Reference(node);
1241 │     const scope = this.typeCheckScopeRegistry.getTypeCheckScope(ref);
1242 ▶     if (scope.isPoisoned && !this.usePoisonedData) {
1243 ▶       // Don't type-check components that had errors in their scopes, unless requested.
1244 ▶       return;
1245 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L674–684 （▶ の行: 677–680, 683）

```ts
674 │     for (const trait of record.traits) {
675 │       let compileRes: CompileResult | CompileResult[];
676 │ 
677 ▶       if (
678 ▶         trait.state !== TraitState.Resolved ||
679 ▶         containsErrors(trait.analysisDiagnostics) ||
680 ▶         containsErrors(trait.resolveDiagnostics)
681 │       ) {
682 │         // Cannot compile a trait that is not resolved, or had any errors in its declaration.
683 ▶         continue;
684 │       }
```
*TraitCompiler.compile。全ハンドラ共通。*

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L115–124 （▶ の行: 121）

```ts
115 │         this.tsProgram,
116 │         options,
117 │         this.incrementalStrategy,
118 │         programDriver,
119 │         perfRecorder,
120 │         /* enableTemplateTypeChecker */ false,
121 ▶         /* usePoisonedData */ false,
122 │       );
123 │     } else {
124 │       ticket = incrementalFromCompilerTicket(
```

1. **1160〜1161 行目：`index`（言語サービス用の索引）を作らない**
2. **1237〜1238 行目：`typeCheck`（テンプレート型チェック）をしない**

   1242〜1244 行目、コンポーネント自身は無事でも、スコープが poisoned（import 先に問題がある）ならやはりしません。「imports の間違い 1 つでテンプレートの全行にエラーが出る」のを防ぐためです（642〜643 行目のコメント）。
3. **`resolve` は空を返す**

   handler.ts 1441〜1443 行目（[既出](../ngmodule/04-ngmodule-compilation-scope.md)）、`analysis.isPoisoned && !this.usePoisonedData` なら `return {}`。`dependencies` の計算に進みません。
4. **677〜683 行目：出力はしない**

   `TraitCompiler.compile` は、`resolve` が成功していないか、`analyze` / `resolve` の診断にエラーがあるトレイトを `continue` で飛ばします。2〜3 節・5 節の診断はすべてここで引っかかるので、`ɵcmp` は生成されません。
5. **121 行目：`usePoisonedData` は通常 `false`**

   `ngc` / `ng build` が使う `NgtscProgram` は `false` を渡します。`true` にするのは、エラーがあっても補完を出し続けたい言語サービスです。

## ここまでの呼び出し

- 👤 `@Component({ imports: [TestDir] }) class TestCmp` — あなたのソース
  - `ComponentDecoratorHandler.analyze(node, decorator)` — component/src/handler.ts L483 — *ファイル単位*
    - `extractDirectiveMetadata(…, implicitStandaloneValue, …)` — L495-511 — *metadata.isStandalone が決まる（shared.ts L380-396 既出）*
    - `!metadata.isStandalone` → NG2010、isPoisoned — L620-644
    - `evaluator.evaluate(rawImports, [mwpResolver, forwardRefResolver])` — L657-664
    - `validateAndFlattenComponentImports(imported, expr, false)` — L665 → component/src/util.ts L90 — *入れ子を平らに。クラス以外は wrong type、ModuleWithProviders は NG2012*
    - `{ isPoisoned, rawImports, resolvedImports, … }` を返す — L1075-1078
  - `scopeReader.getScopeForComponent(TestCmp)` — scope/src/component\_scope.ts L22 — *LocalModuleScopeRegistry → selectorless → StandaloneComponentScopeReader の順*
    - `StandaloneComponentScopeReader.getScopeForComponent` — scope/src/standalone.ts L30 — *dependencies = Set(\[自分\]) から始め、imports を足す。standalone でなければ isPoisoned*
  - `ComponentDecoratorHandler.resolve(node, analysis, symbol)` — handler.ts L1303 — *全ファイルの analyze 後*
    - `analysis.isPoisoned && !usePoisonedData` → `return {}` — L1441-1443（既出）
    - `getNonLocalDiagnostics(node, analysis)` — L1517 → L2230
      - `validateStandaloneImports(resolvedImports, rawImports, metaReader, scopeReader, false)` — L2243 → L2875 — *NG2011 / NG2012 / NG2022*
        - `makeNotStandaloneDiagnostic(scopeReader, ref, importExpr, kind)` — scope/src/util.ts L29 — *宣言元 NgModule を探して提案文を付ける*
  - `TraitCompiler.compile(clazz)` — transform/src/compilation.ts L660 — *診断があるトレイトは L677-683 で continue → ɵcmp は出力されない*

## 聞かれそうな質問

**Q. imports に書いた NgModule が、standalone でないコンポーネントを export していたらエラーですか？**

エラーではありません。`validateStandaloneImports` は NgModule を 2908〜2912 行目で無条件に `continue` し、中身は見ません。`StandaloneComponentScopeReader` は NgModule の exported スコープを展開して `dependencies` に足します（standalone.ts 73〜98 行目、[既出](../ngmodule/13-ngmodule-standalone-imports.md)）。standalone でない directive は、その NgModule の compilation スコープに入っていればテンプレートで使えます（[第 4 回](../ngmodule/04-ngmodule-compilation-scope.md)）。エラーになるのは**直接** import したとき（2886 行目）だけで、そのときの提案文が「NgModule 経由で import せよ」です。

**Q. なぜ検査が analyze と resolve の 2 回に分かれているのですか？**

`analyze` はファイル単位で、他のクラスがまだ解析されていません。だから `analyze` で分かるのは 「standalone でないのに imports がある」（620 行目、自分のメタデータだけで分かる）と「配列でない・クラスでない」（util.ts 142〜206 行目、評価結果の形だけで分かる）です。「import 先が standalone か」「NgModule か」は `metaReader.getDirectiveMetadata(ref)`（2884 行目）で他クラスのメタデータを読む必要があり、全ファイルの `analyze` が終わった `resolve`（1517 行目）でしかできません。

**Q. isPoisoned になると何が止まりますか？エラーは出るのに ɵcmp は出ないのですか？**

止まるのは 4 つ。`index`（1160 行目）、`typeCheck`（1237 行目、スコープ側は 1242 行目）、`resolve` の本体（1441 行目、既出）、そして出力です。出力は `TraitCompiler.compile`（compilation.ts 677〜683 行目）が「`Resolved` でない、または診断にエラーがある」トレイトを飛ばすことで止まります。`usePoisonedData`（program.ts 121 行目で `false`）を `true` にできるのは言語サービスだけで、通常のビルドでは常に止まります。

**Q. NG2011 の「It can be imported using its 'X' NgModule instead」は、どうやって X を見つけているのですか？**

`makeNotStandaloneDiagnostic` の 35 行目、`scopeReader.getScopeForComponent(ref.node)` に**import された側の directive**を渡します。`CompoundComponentScopeReader` の 1 番目 `LocalModuleScopeRegistry`（compiler.ts 1422 行目）は `declarationToModule` でその directive を宣言した NgModule を知っているので、その NgModule のスコープが返り、exports に含まれていれば「X で import せよ」、含まれていなければ「X で export してから import せよ」になります（scope/util.ts 37〜62 行目、既出）。`.d.ts` から来た directive は `LocalModuleScopeRegistry` に無いので提案は付きません。

**Q. imports: \[RouterModule.forRoot(routes)\] はどこで止まりますか？**

`analyze` です。657〜658 行目の `createModuleWithProvidersResolver` が `forRoot()` の戻り値を `ModuleWithProviders` の印に変え、`validateAndFlattenComponentImports` の 179〜195 行目（[既出](../ngmodule/13-ngmodule-standalone-imports.md)）が NG2012 を出します。`flattened` には入らないので、`resolve` の `validateStandaloneImports` には届きません。

**Q. imports を別ファイルの定数にまとめても検査されますか？エラー位置はどうなりますか？**

検査されます。664 行目の部分評価器が定数を辿って配列にします。ただしエラー位置は変わります。154〜159 行目の条件（元の式が配列リテラルで、要素数が一致し、スプレッドが無い）を満たさないので、`refExpr` は `imports` の右側の式全体（定数名）になり、どの要素が悪いかは位置からは分かりません。

## 読み終えて

- `imports` の検査は 2 段階。`analyze`（handler.ts 611〜697 行目）は自分のメタデータと式の形だけで NG2010 / wrong type / NG2012（ModuleWithProviders）を出し、`resolve`（1517 行目 → 2875 行目）は他クラスのメタデータで NG2011 / NG2012 / NG2022 を出す
- `validateAndFlattenComponentImports`（util.ts 90〜210 行目）は入れ子配列を平らにし、クラス参照だけを残す。要素ごとのエラー位置は配列リテラルのときだけ（154〜159 行目）
- `StandaloneComponentScopeReader`（standalone.ts 30 行目）は `dependencies` を **自分自身**から始め（45〜47 行目）、standalone でないものも入れたうえで `isPoisoned` にする（62・69 行目）。`CompoundComponentScopeReader` の 3 番目として呼ばれる（compiler.ts 1421〜1425 行目）
- `isPoisoned` は `index`・`typeCheck`・`resolve` を止め、`TraitCompiler.compile`（compilation.ts 677〜683 行目）が出力を止める。`usePoisonedData` は通常 `false`（program.ts 121 行目）
- ローカルコンパイルでは 656 行目で評価を飛ばし、`getNonLocalDiagnostics` も呼ばれない（1516 行目）。その代わりが [第 6 回](06-standalone-local-compilation.md)

---

← 前: [@Component が実行された瞬間（JIT）：compileComponent が ɵcmp を遅延定義し、imports を後から貼る](02-standalone-decorator.md)  
次: [使った依存だけが dependencies に残る：eagerlyUsed と NG8113 unusedStandaloneImports](04-standalone-used-only.md) →
