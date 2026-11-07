[目次](../README.md) › [テンプレート型チェックの内側](README.md) › 第 3 回 / 全 20 回

# TypeCheckContext：TCB をどこに置くか

> TypeCheckContextImpl.addTemplate がコンポーネントごとに TCB を作り、型チェック用の shim ファイル（.ngtypecheck.ts）に置くか、元のファイルの中に inline で置くかを決める行。inline が要る場合（ジェネリックで型引数を外に出せない、export されていないクラス）、型コンストラクタの置き場所、pendingShimForComponent。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-context)

---

TCB は「どこに書くか」で 2 通りに分かれます。ふつうは元のファイルの隣の `.ngtypecheck.ts`（shim）に書き、それができないときだけ元のファイルの中、クラスの直後に差し込みます（inline）。この章では、その判断をする `TypeCheckContextImpl.addDirective` の行、inline が要る 3 つの場合、ジェネリックなディレクティブの型コンストラクタを inline にする行、そして集めた操作を `finalize` が「ファイル名 → 新しい中身」の表にするまでを 1 ステップずつ読みます。言語サービスで使う 3 つ目の方式（元のファイルを shim に写す）も見ます。

読む対象は `compiler-cli/src/ngtsc/typecheck/src/context.ts`（776 行）を中心に、`type_check_file.ts`、`transform/src/compilation.ts` の `typeCheck`、`checker.ts` の一部、spec の `type_checker_spec.ts` と `template_typecheck_spec.ts` です。`addDirective` の前半と書き先の 3 分岐、shim の中身は[compiler-typecheck](../compiler/17-compiler-typecheck.md) の 2 節に引用したので、その前後を引きます。

1. [1. 全体像](01-typecheck-overview.md)
2. [2. 設定](02-typecheck-config.md)
3. **3. TCB の置き場所**（この章）
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
18. [18. 拡張診断](18-typecheck-extended.md)
19. [19. TemplateTypeChecker](19-typecheck-template-type-checker.md)
20. [20. issue と PR を読む](20-typecheck-issues.md)

## 1. 誰が addDirective を呼ぶか

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L548–570 （▶ の行: 552–553, 557, 560, 562, 566）

```ts
548 │   /**
549 │    * Generate type-checking code into the `TypeCheckContext` for any components within the given
550 │    * `ts.SourceFile`.
551 │    */
552 ▶   typeCheck(sf: ts.SourceFile, ctx: TypeCheckContext): void {
553 ▶     if (!this.fileToClasses.has(sf) || this.compilationMode === CompilationMode.LOCAL) {
554 │       return;
555 │     }
556 │ 
557 ▶     for (const clazz of this.fileToClasses.get(sf)!) {
558 │       const record = this.classes.get(clazz)!;
559 │       for (const trait of record.traits) {
560 ▶         if (trait.state !== TraitState.Resolved) {
561 │           continue;
562 ▶         } else if (trait.handler.typeCheck === undefined) {
563 │           continue;
564 │         }
565 │         if (trait.resolution !== null) {
566 ▶           trait.handler.typeCheck(ctx, clazz, trait.analysis, trait.resolution);
567 │         }
568 │       }
569 │     }
570 │   }
```

`TemplateTypeCheckerImpl`（[第 1 回](01-typecheck-overview.md)の 4 節）は、ファイルを 1 つずつこの `TraitCompiler.typeCheck(sf, ctx)` に渡します。557 行目でそのファイルのクラスを回し、560 行目で解析と解決が済んだもの（`Resolved`）だけ、562 行目で `typeCheck` を持つハンドラだけを選び、566 行目で `ComponentDecoratorHandler.typeCheck` などを呼びます。ハンドラはテンプレートのノード・照合器・パイプを `TemplateContext` にまとめて `ctx.addDirective` を呼びます（[compiler-typecheck](../compiler/17-compiler-typecheck.md) の 2 節）。553 行目、ローカルコンパイル（`compilationMode: 'experimental-local'`）ではテンプレートの型チェックをしません。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L201–229 （▶ の行: 202, 209–210, 213, 215, 223, 229）

```ts
201 │ export class TypeCheckContextImpl implements TypeCheckContext {
202 ▶   private fileMap = new Map<AbsoluteFsPath, PendingFileTypeCheckingData>();
203 │ 
204 │   constructor(
205 │     private config: TypeCheckingConfig,
206 │     private compilerHost: Pick<ts.CompilerHost, 'getCanonicalFileName' | 'getSourceFile'>,
207 │     private refEmitter: ReferenceEmitter,
208 │     private reflector: ReflectionHost,
209 ▶     private host: TypeCheckingHost,
210 ▶     private inlining: InliningMode,
211 │     private perf: PerfRecorder,
212 │   ) {
213 ▶     if (inlining === InliningMode.Error && config.useInlineTypeConstructors) {
214 │       // We cannot use inlining for type checking since this environment does not support it.
215 ▶       throw new Error(`AssertionError: invalid inlining configuration.`);
216 │     }
217 │   }
218 │ 
219 │   /**
220 │    * A `Map` of `ts.SourceFile`s that the context has seen to the operations (additions of methods
221 │    * or type-check blocks) that need to be eventually performed on that file.
222 │    */
223 ▶   private opMap = new Map<ts.SourceFile, Op[]>();
224 │ 
225 │   /**
226 │    * Tracks when an a particular class has a pending type constructor patching operation already
227 │    * queued.
228 │    */
229 ▶   private typeCtorPending = new Set<ts.ClassDeclaration>();
```

`TypeCheckContextImpl` は「1 回分の型チェックの準備」を表すオブジェクトで、TCB を作るたびに新しく作られます（[第 4 回](04-typecheck-program-driver.md)の `newContext`）。持ち物は 3 つです。

- **202 行目 `fileMap`**：元のファイルごとの、作りかけの shim（`PendingShimData`）。
- **223 行目 `opMap`**：元のファイルごとの、*元のファイルに*差し込む操作（`Op`）の列。inline の TCB と inline の型コンストラクタがここに入ります。
- **229 行目 `typeCtorPending`**：同じディレクティブに型コンストラクタを 2 度差し込まないための印。

210 行目の `inlining`（`InliningMode`）は `ProgramDriver` から来る値で、元のファイルを書き換えてよいかを表します。値は 3 つです。

| InliningMode | 使う場所 | inline が要るとき |
| --- | --- | --- |
| `InlineOps` | ngc・CLI（`TsCreateProgramDriver`） | 元のファイルのクラスの直後に TCB を差し込む |
| `CopySourceToTcb` | 言語サービス（PR #68454、v22.1.0-next.0 から） | 元のファイルの中身を shim に写し、写しのほうに差し込む |
| `Error` | このスナップショットでは spec の中だけ（v22.1 より前の言語サービスがこれだった） | TCB を作らず、`INLINE_TCB_REQUIRED` の診断を出す |

213〜216 行目は「inline を使えない環境なのに、inline の型コンストラクタを使う設定」という組み合わせを止める表明です。実際には `useInlineTypeConstructors` 自体が `ProgramDriver` から決まるので（[第 2 回](02-typecheck-config.md)の 2 節）、ふつうはこの組み合わせになりません。

## 2. addDirective：照合のあとの 4 つの仕事

`addDirective` の前半は、`shouldCheckClass` で要否を確かめ、shim の作りかけを用意し（`pendingShimForClass`）、`binder.bind` でテンプレートを照合するところまでです（[compiler-typecheck](../compiler/17-compiler-typecheck.md) の 2 節）。その続きを読みます。

### 仕事 1：ジェネリックなディレクティブの型コンストラクタを inline にする

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L270–299 （▶ の行: 271, 274, 279–280, 287–288, 291）

```ts
270 │ 
271 ▶     if (this.inlining === InliningMode.InlineOps) {
272 │       // Get all of the directives used in the template and record inline type constructors when
273 │       // required.
274 ▶       for (const dir of boundTarget.getUsedDirectives()) {
275 │         const dirRef = dir.ref as Reference<ClassDeclaration<ts.ClassDeclaration>>;
276 │         const dirNode = dirRef.node;
277 │ 
278 │         if (
279 ▶           !dir.isGeneric ||
280 ▶           !requiresInlineTypeCtor(dirNode, this.reflector, (r) => shimData.file.canReferenceType(r))
281 │         ) {
282 │           // inlining not required
283 │           continue;
284 │         }
285 │ 
286 │         // Add an inline type constructor operation for the directive.
287 ▶         this.addInlineTypeCtor(fileData, dirNode.getSourceFile(), dirRef, {
288 ▶           fnName: 'ngTypeCtor',
289 │           // The constructor should have a body if the directive comes from a .ts file, but not if
290 │           // it comes from a .d.ts file. .d.ts declarations don't have bodies.
291 ▶           body: !dirNode.getSourceFile().isDeclarationFile,
292 │           fields: {
293 │             inputs: dir.inputs,
294 │             // TODO(alxhub): support queries
295 │           },
296 │           coercedInputFields: dir.coercedInputFields,
297 │         });
298 │       }
299 │     }
```

型コンストラクタは、`NgForOf<T>` の `T` を入力の値から TypeScript に推論させるための「にせのコンストラクタ」です（[第 9 回](09-typecheck-type-constructor.md)）。ふつうは shim の中に宣言しますが、ディレクティブの型引数の制約（`<T extends 何か>` の「何か」）が shim から参照できない型だと、shim に書き写せません。

1. **271 行目：`InlineOps` のときだけ**

   元のファイルを書き換えられる環境でなければ、この処理は丸ごと飛ばします。そのときディレクティブの型引数は `any` として扱われます（第 9 回）。
2. **274・279〜280 行目：テンプレートで使ったジェネリックなディレクティブのうち、制約を shim に書けないもの**

   `requiresInlineTypeCtor`（type\_constructor.ts）に `shimData.file.canReferenceType` を渡し、「この shim から参照できるか」で判定します。書ける（または型引数が無い）ものは 283 行目で次へ進みます。
3. **287〜291 行目：`static ngTypeCtor` を差し込む操作を積む**

   288 行目の名前 `ngTypeCtor` で、291 行目、ディレクティブが `.ts` なら本体付き、`.d.ts` なら宣言だけ（`.d.ts` には本体を書けない）にします。積む先は `addInlineTypeCtor` です（4 節）。

### 仕事 2：inline が要るかを判定する

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L301–327 （▶ の行: 301, 311–312, 322）

```ts
301 ▶     shimData.data.set(id, {
302 │       template: templateContext?.nodes || null,
303 │       boundTarget,
304 │       templateParsingDiagnostics,
305 │       hostElement: hostBindingContext?.node ?? null,
306 │     });
307 │ 
308 │     const usedPipes: Reference<ClassDeclaration<ts.ClassDeclaration>>[] = [];
309 │ 
310 │     if (templateContext !== null) {
311 ▶       for (const name of boundTarget.getUsedPipes()) {
312 ▶         if (templateContext.pipes.has(name)) {
313 │           usedPipes.push(
314 │             templateContext.pipes.get(name)!.ref as Reference<
315 │               ClassDeclaration<ts.ClassDeclaration>
316 │             >,
317 │           );
318 │         }
319 │       }
320 │     }
321 │ 
322 ▶     const inliningRequirement = requiresInlineTypeCheckBlock(
323 │       ref,
324 │       shimData.file,
325 │       usedPipes,
326 │       this.reflector,
327 │     );
```

301〜306 行目で、照合結果をテンプレートの情報として shim の作りかけに記録します（診断を戻すときと言語サービスが使う）。311〜312 行目、パイプは**テンプレートで実際に使ったもの**だけを集めます。322 行目で `tcb_util.ts` の `requiresInlineTypeCheckBlock` に渡し、`TcbInliningRequirement` の 3 つの値のどれかを受け取ります。

| 判定の順 | 条件（requiresInlineTypeCheckBlock） | 結果 |
| --- | --- | --- |
| 1 | コンポーネント自身を shim から参照できない（export されていない） | `MustInline` |
| 2 | コンポーネントの型引数の制約を shim に書けない | `ShouldInlineForGenericBounds` |
| 3 | テンプレートで使ったパイプのどれかを shim から参照できない | `MustInline` |
| — | どれでもない | `None` |

「Should」は「できれば inline、無理なら代わりの方法がある」、「Must」は「inline でなければ型チェックできない」という区別です。この関数の本体は `tcb_util.ts` にあり、型引数の制約を書けるかの判定は `TypeParameterEmitter`（[第 9 回](09-typecheck-type-constructor.md)）に任せています。

> [!NOTE]
> **さらに深く**
>
> 311〜312 行目の「使ったパイプだけ」は、閉じた issue #46747（2022-07）の修正です。v14.0.2 から言語サービスで「This component requires inline template type-checking, which is not supported by the current environment.」が出るようになり、原因は NgModule のスコープにある*全部の*パイプを見ていたことでした（コメントで JoostK さんが特定）。修正は 93d17ee888f「fix(compiler-cli): only consider used pipes for inline type-check requirement (#46807)」です。

### 仕事 3：inline が要るのに使えない環境なら打ち切る

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L328–353 （▶ の行: 331–333, 342, 344, 352）

```ts
328 │ 
329 │     // If inlining is not supported, but is required for either the TCB or one of its directive
330 │     // dependencies, then exit here with an error.
331 ▶     if (
332 ▶       this.inlining === InliningMode.Error &&
333 ▶       inliningRequirement === TcbInliningRequirement.MustInline
334 │     ) {
335 │       // This template cannot be supported because the underlying strategy does not support inlining
336 │       // and inlining would be required.
337 │ 
338 │       // Record diagnostics to indicate the issues with this template.
339 │       shimData.shimDiagnostics ??= [];
340 │       shimData.shimDiagnostics.push({
341 │         ...makeDiagnostic(
342 ▶           ErrorCode.INLINE_TCB_REQUIRED,
343 │           ref.node.name,
344 ▶           `This component requires inline template type-checking, which is not supported by the current environment.`,
345 │         ),
346 │         sourceFile: ref.node.getSourceFile(),
347 │         typeCheckId: id,
348 │       });
349 │ 
350 │       // Checking this template would be unsupported, so don't try.
351 │       this.perf.eventCount(PerfEvent.SkipGenerateTcbNoInline);
352 ▶       return;
353 │     }
```

331〜333 行目、`InliningMode.Error` で `MustInline` なら、342 行目の `INLINE_TCB_REQUIRED`（344 行目の文言）を shim の診断に足し、352 行目で TCB を作らずに帰ります。#46747 で利用者が見た文言がこれです。いまの言語サービスは `CopySourceToTcb` なので、この行には来ません。

### 仕事 4：書き先を選ぶ

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L355–387 （▶ の行: 356, 373, 382–384, 386）

```ts
355 │     if (templateContext !== null) {
356 ▶       fileData.sourceManager.captureTemplateSource(
357 │         id,
358 │         templateContext.sourceMapping,
359 │         templateContext.file,
360 │       );
361 │     }
362 │ 
363 │     if (hostBindingContext !== null) {
364 │       fileData.sourceManager.captureHostBindingsMapping(
365 │         id,
366 │         hostBindingContext.sourceMapping,
367 │         // We only support host bindings in the same file as the directive
368 │         // so we can get the source file from here.
369 │         new ParseSourceFile(sourceFile.text, sourceFile.fileName),
370 │       );
371 │     }
372 │ 
373 ▶     const meta = {
374 │       id,
375 │       boundTarget,
376 │       pipes: templateContext?.pipes || null,
377 │       schemas,
378 │       isStandalone,
379 │       preserveWhitespaces: templateContext?.preserveWhitespaces ?? false,
380 │     };
381 │     this.perf.eventCount(PerfEvent.GenerateTcb);
382 ▶     if (
383 ▶       inliningRequirement !== TcbInliningRequirement.None &&
384 ▶       (this.inlining === InliningMode.InlineOps || this.inlining === InliningMode.CopySourceToTcb)
385 │     ) {
386 ▶       // Queue operations for both inline and copy strategy!
387 │       // The decision on where to apply them will be made in finalize().
```

356 行目、テンプレートの元の位置を `sourceManager` に覚えさせます（診断を戻すため。[第 16 回](16-typecheck-diagnostics-mapping.md)）。373〜380 行目が TCB を作るのに渡すメタデータです。382〜384 行目が分かれ道で、inline が要り（`None` 以外）、しかも `InlineOps` か `CopySourceToTcb` なら、386 行目のコメントのとおり「どちらの方式でも同じ操作を積み、どこに当てるかは `finalize` で決める」です。この続き（[compiler-typecheck](../compiler/17-compiler-typecheck.md) の 2 節に引用）は次のとおりです。

| 条件 | どうするか | TCB の関数名 |
| --- | --- | --- |
| inline が要る ＆ `InlineOps` / `CopySourceToTcb` | `addInlineTypeCheckBlock`（4 節）。`CopySourceToTcb` なら shim に `copiedSourceOriginPath` も設定 | `_tcb_<pos>` |
| `ShouldInlineForGenericBounds` ＆ `Error` | shim に書く。型引数は `any` にする（`TcbGenericContextBehavior.FallbackToAny`） | `_tcb1`… |
| それ以外（`None`） | shim に書く（`TcbGenericContextBehavior.UseEmitter`） | `_tcb1`… |

## 3. shim に書く：TypeCheckFile

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/type_check_file.ts` L28–49 （▶ の行: 28, 34, 38, 40, 42–43, 47）

```ts
28 ▶ export const TCB_FUNCTION_PREFIX = '_tcb';
29 │ 
30 │ /**
31 │  * An `Environment` representing the single type-checking file into which most (if not all) Type
32 │  * Check Blocks (TCBs) will be generated.
33 │  *
34 ▶  * The `TypeCheckFile` hosts multiple TCBs and allows the sharing of declarations (e.g. type
35 │  * constructors) between them. Rather than return such declarations via `getPreludeStatements()`, it
36 │  * hoists them to the top of the generated `ts.SourceFile`.
37 │  */
38 ▶ export class TypeCheckFile extends Environment {
39 │   readonly isTypeCheckFile = true;
40 ▶   private nextTcbId = 1;
41 │   private tcbStatements: string[] = [];
42 ▶   private sourceContent: string = '';
43 ▶   get hasCopiedSource() {
44 │     return this.copiedSourceOriginPath !== undefined;
45 │   }
46 │ 
47 ▶   setSourceContent(text: string) {
48 │     this.sourceContent = text;
49 │   }
```

38 行目、`TypeCheckFile` は `Environment`（[第 5 回](05-typecheck-environment.md)）を継いだ「1 つの shim ファイル」です。34〜36 行目のとおり、1 つのファイルに複数の TCB を入れ、型コンストラクタなどの宣言を共有して先頭にまとめます。40 行目の連番で関数名が `_tcb1`、`_tcb2` になります（28 行目の接頭辞）。42〜48 行目の `sourceContent` と `hasCopiedSource` が 2026-04 に足された `CopySourceToTcb` 用の口で、shim の先頭に元のファイルの写しを置くためのものです（5 節）。

## 4. 元のファイルに差し込む操作

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L596–620 （▶ の行: 602, 607–608, 618）

```ts
596 │   private addInlineTypeCheckBlock(
597 │     fileData: PendingFileTypeCheckingData,
598 │     shimData: PendingShimData,
599 │     ref: Reference<ClassDeclaration<ts.ClassDeclaration>>,
600 │     tcbMeta: TypeCheckBlockMetadata,
601 │   ): void {
602 ▶     const sf = ref.node.getSourceFile();
603 │     if (!this.opMap.has(sf)) {
604 │       this.opMap.set(sf, []);
605 │     }
606 │     const ops = this.opMap.get(sf)!;
607 ▶     ops.push(
608 ▶       new InlineTcbOp(
609 │         ref,
610 │         tcbMeta,
611 │         this.config,
612 │         this.reflector,
613 │         shimData.domSchemaChecker,
614 │         shimData.oobRecorder,
615 │       ),
616 │     );
617 │ 
618 ▶     fileData.hasInlines = true;
619 │   }
620 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L423–446 （▶ の行: 432, 435, 444–445）

```ts
423 │   /**
424 │    * Record a type constructor for the given `node` with the given `ctorMetadata`.
425 │    */
426 │   addInlineTypeCtor(
427 │     fileData: PendingFileTypeCheckingData,
428 │     sf: ts.SourceFile,
429 │     ref: Reference<ClassDeclaration<ts.ClassDeclaration>>,
430 │     ctorMeta: TypeCtorMetadata,
431 │   ): void {
432 ▶     if (this.typeCtorPending.has(ref.node)) {
433 │       return;
434 │     }
435 ▶     this.typeCtorPending.add(ref.node);
436 │ 
437 │     // Lazily construct the operation map.
438 │     if (!this.opMap.has(sf)) {
439 │       this.opMap.set(sf, []);
440 │     }
441 │     const ops = this.opMap.get(sf)!;
442 │ 
443 │     // Push a `TypeCtorOp` into the operation queue for the source file.
444 ▶     ops.push(new TypeCtorOp(ref, this.reflector, ctorMeta));
445 ▶     fileData.hasInlines = true;
446 │   }
```

どちらも、602 行目・444 行目のとおり**元のファイル**（ディレクティブのファイル）を鍵にして `opMap` に操作を積むだけで、まだ何も書きません。432〜435 行目、型コンストラクタは同じディレクティブに 1 つだけです。618 行目・445 行目で、そのファイルに `hasInlines`（inline を使った）の印を付けます。この印は[第 4 回](04-typecheck-program-driver.md)で「前回の結果を使い回せない」理由になります。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L715–751 （▶ の行: 718–719, 723, 725–726, 728, 735, 740, 751）

```ts
715 │   /**
716 │    * Type check blocks are inserted immediately after the end of the directive class.
717 │    */
718 ▶   get splitPoint(): number {
719 ▶     return this.ref.node.end + 1;
720 │   }
721 │ 
722 │   execute(im: ImportManager, tcbSf: ts.SourceFile, refEmitter: ReferenceEmitter): string {
723 ▶     const env = new Environment(this.config, im, refEmitter, tcbSf);
724 │     const originalSf = this.ref.node.getSourceFile();
725 ▶     if (tcbSf !== originalSf) {
726 ▶       env.copiedSourceOriginPath = absoluteFromSourceFile(originalSf);
727 │     }
728 ▶     const fnName = `${TCB_FUNCTION_PREFIX}_${this.ref.node.pos}`;
729 │ 
730 │     const {tcbMeta, component} = adaptTypeCheckBlockMetadata(
731 │       this.ref,
732 │       this.meta,
733 │       env,
734 │       this.reflector,
735 ▶       TcbGenericContextBehavior.CopyClassNodes,
736 │     );
737 │ 
738 │     // Inline TCBs should copy any generic type parameter nodes directly, as the TCB code is
739 │     // inlined into the class in a context where that will always be legal.
740 ▶     const fn = generateTypeCheckBlock(
741 │       env,
742 │       component,
743 │       fnName,
744 │       tcbMeta,
745 │       this.domSchemaChecker,
746 │       this.oobRecorder,
747 │     );
748 │ 
749 │     // A leading newline is required so that the generated TCB isn't accidentally
750 │     // appended as part of a trailing single-line comment (e.g. `// comment`).
751 ▶     return `\n${fn}`;
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L755–776 （▶ の行: 768–769, 773–774）

```ts
755 │ /**
756 │  * A type constructor operation which produces type constructor code for a particular directive.
757 │  */
758 │ class TypeCtorOp implements Op {
759 │   constructor(
760 │     readonly ref: Reference<ClassDeclaration<ts.ClassDeclaration>>,
761 │     readonly reflector: ReflectionHost,
762 │     readonly meta: TypeCtorMetadata,
763 │   ) {}
764 │ 
765 │   /**
766 │    * Type constructor operations are inserted immediately before the end of the directive class.
767 │    */
768 ▶   get splitPoint(): number {
769 ▶     return this.ref.node.end - 1;
770 │   }
771 │ 
772 │   execute(im: ImportManager, sf: ts.SourceFile, refEmitter: ReferenceEmitter): string {
773 ▶     const emitEnv = new ReferenceEmitEnvironment(im, refEmitter, sf);
774 ▶     return generateInlineTypeCtor(emitEnv, this.ref.node, this.meta);
775 │   }
776 │ }
```

1. **719 行目：TCB はクラスの閉じ括弧の直後**

   `this.ref.node.end + 1` の位置です。TCB は関数なのでクラスの外に置きます。751 行目、前に改行を 1 つ足すのは、直前の行が `// コメント` だった場合にその続きにならないようにするためです（749〜750 行目のコメント）。
2. **769 行目：型コンストラクタはクラスの閉じ括弧の直前**

   `end - 1` の位置、つまりクラスの中です。`static ngTypeCtor` はクラスの静的メソッドなので、クラスの型引数の制約をそのまま書けます。
3. **728 行目：inline の関数名は `_tcb_` + クラスの `pos`**

   shim の連番（`_tcb1`）と違い、元のファイルの中の文字位置で名前を付けます。
4. **735・740 行目：型引数はそのまま写す**

   `TcbGenericContextBehavior.CopyClassNodes` で、コンポーネントの型引数の宣言を写したまま `generateTypeCheckBlock` を呼びます。同じファイルの中なので、制約の型も参照できます。725〜726 行目は写しに差し込む場合（`CopySourceToTcb`）の印です。

## 5. finalize：ファイル名 → 新しい中身

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L538–570 （▶ の行: 541–542, 544, 546, 552, 554, 564, 566）

```ts
538 │   finalize(): Map<AbsoluteFsPath, FileUpdate> {
539 │     // First, build the map of updates to source files.
540 │     const updates = new Map<AbsoluteFsPath, FileUpdate>();
541 ▶     for (const originalSf of this.opMap.keys()) {
542 ▶       const newText = this.generateTransformedOriginalFile(originalSf);
543 │       if (newText !== null) {
544 ▶         updates.set(absoluteFromSourceFile(originalSf), {
545 │           newText,
546 ▶           originalFile: originalSf,
547 │         });
548 │       }
549 │     }
550 │ 
551 │     // Then go through each input file that has pending code generation operations.
552 ▶     for (const [sfPath, pendingFileData] of this.fileMap) {
553 │       // For each input file, consider generation operations for each of its shims.
554 ▶       for (const pendingShimData of pendingFileData.shimData.values()) {
555 │         const genesisDiagnostics = [
556 │           ...pendingShimData.domSchemaChecker.diagnostics,
557 │           ...pendingShimData.oobRecorder.diagnostics,
558 │         ];
559 │ 
560 │         if (pendingShimData.shimDiagnostics !== null) {
561 │           genesisDiagnostics.unshift(...pendingShimData.shimDiagnostics);
562 │         }
563 │ 
564 ▶         this.host.recordShimData(sfPath, {
565 │           genesisDiagnostics,
566 ▶           hasInlines: pendingFileData.hasInlines,
567 │           path: pendingShimData.file.fileName,
568 │           data: pendingShimData.data,
569 │         });
570 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/context.ts` L500–536 （▶ の行: 504, 509, 518, 521, 531, 534–535）

```ts
500 │     // TODO: Consider generating a sourcemap here via `result.generateMap()`.
501 │     // This could be used in `CopySourceToTcb` mode to map positions in the shim file
502 │     // back to the original source file, helping with language features like "Go to Definition"
503 │     // and diagnostic translation.
504 ▶     const result = new MagicString(targetSf.text, {filename: targetSf.fileName});
505 │     for (const update of updates) {
506 │       if (update.deletePos !== undefined) {
507 │         result.remove(update.pos, update.deletePos);
508 │       }
509 ▶       result.appendLeft(update.pos, update.text);
510 │     }
511 │     return result.toString();
512 │   }
513 │ 
514 │   /**
515 │    * Generates the transformed text for an original source file.
516 │    */
517 │   private generateTransformedOriginalFile(sf: ts.SourceFile): string | null {
518 ▶     if (this.inlining !== InliningMode.InlineOps || !this.opMap.has(sf)) {
519 │       return null;
520 │     }
521 ▶     return this.executeOperations(sf, sf);
522 │   }
523 │ 
524 │   /**
525 │    * Generates the content for a shim file that copies the source of the original file.
526 │    */
527 │   private generateCopiedShimContent(
528 │     originalSf: ts.SourceFile,
529 │     shimFileName: string,
530 │   ): string | null {
531 ▶     if (this.inlining !== InliningMode.CopySourceToTcb || !this.opMap.has(originalSf)) {
532 │       return null;
533 │     }
534 ▶     const fakeSf = ts.createSourceFile(shimFileName, originalSf.text, ts.ScriptTarget.Latest, true);
535 ▶     return this.executeOperations(fakeSf, originalSf);
536 │   }
```

1. **541〜548 行目：元のファイルの更新（InlineOps のとき）**

   `opMap` に積んだファイルごとに 542 行目の `generateTransformedOriginalFile` を呼びます。518 行目のとおり `InlineOps` でなければ `null` で、何も足しません。中身は 504〜510 行目、`MagicString`（文字列の指定位置に挿入できる小さなライブラリ）で、元の文字列の `splitPoint` に各操作の文字列を差し込んだものです。546 行目、更新には元の `ts.SourceFile` を添えます。
2. **552〜569 行目：shim ごとの記録**

   元のファイルごとの作りかけの shim を回し、555〜558 行目で TCB を作りながら集めた診断（DOM のスキーマ・帯域外）をまとめ、564 行目の `host.recordShimData` で `TemplateTypeCheckerImpl` 側に記録します。566 行目の `hasInlines` もここで渡ります。
3. **この続き：shim の中身（CopySourceToTcb なら写しを先頭に）**

   `CopySourceToTcb` なら 531〜535 行目の `generateCopiedShimContent` が、元のファイルと同じ中身のにせの `ts.SourceFile`（534 行目）に操作を当てた文字列を作り、それを shim の `setSourceContent` に入れます。そのあと `render()` で shim の文字列を作り、「shim のパス → 中身（`originalFile: null`）」を足します（[compiler-typecheck](../compiler/17-compiler-typecheck.md) の 2 節）。

戻り値の `Map<AbsoluteFsPath, FileUpdate>` を `ProgramDriver.updateFiles` に渡すと、派生プログラムができます（[第 4 回](04-typecheck-program-driver.md)）。`TypeCheckContextImpl` の仕事は「どのファイルを、どんな文字列にするか」を決めるところまでで、ファイルにもプログラムにも触りません。

## 6. デモ：条件を変えて、置き場所を決める

> **🧪 DEMO — addDirective と finalize の分かれ道（シミュレーション）**
>
> これは本物の compiler-cli を動かすものではなく、2〜5 節の行の分かれ道を条件から計算して表に出すシミュレーションです。`app.component.ts` にコンポーネントが 1 つあり、テンプレートでパイプを 1 つ、ジェネリックなディレクティブ（`my-dir.ts`）を 1 つ使っている、という想定です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-context)

## 7. 本物で確かめる：このサイトを ngc に通す

シミュレーションだけでは心もとないので、このサイト自身（compiler-cli 22.1.6）を手元で ngc の API に通し、型チェックの前後のプログラムを比べました（2026-11-02、出力先は作業用のディレクトリ）。

📄 `手元で走らせたスクリプト（要点）`

```
// scratchpad の tsconfig（このサイトの tsconfig.app.json を extends し、出力先だけ変えたもの）で
const p = new ngc.NgtscProgram(cfg.rootNames, cfg.options, host);
const before = p.getTsProgram();
await p.compiler.analyzeAsync();
p.getNgSemanticDiagnostics();               // ここでテンプレートの型チェックが走る
const after = p.compiler.getCurrentProgram(); // 派生プログラム
const changed = before.getSourceFiles().filter(f => after.getSourceFile(f.fileName) !== f);
```

📄 `出力（抜粋）`

```
rootNames 758 nonDts 1517 shims 758
changed shims 389 changed non-shim [
  'src/app/pages/chapters/compiler-ingest.ts',
  'src/app/pages/chapters/forms-value-accessor.ts',
  'src/app/pages/chapters/testing-create-component.ts',
  'src/app/pages/chapters/testing-component-bindings.ts',
  'src/app/pages/chapters/testing-debug-element.ts'
]
compiler-ingest.ts 3275 -> 3439 [ 'function _tcb_326@762' ]
forms-value-accessor.ts 7224 -> 8072 [ 'function _tcb_846@3342' ]
testing-create-component.ts 5256 -> 5365 [ 'function _tcb_526@776' ]
testing-component-bindings.ts 6089 -> 6801 [ 'function _tcb_597@1174' ]
testing-debug-element.ts 6215 -> 6619 [ 'function _tcb_477@1390' ]
```

入力の 758 個の `.ts` に 758 個の shim が付き、型チェックのあとで中身が変わった shim は 389 個でした（コンポーネントの無いファイルの shim は 1 行のまま）。そして**元のファイルが 5 つ書き換わっていました**。どれも export していないデモ用のコンポーネントを持つファイルです。1 つ目を取り出すとこうなっています。

📄 `派生プログラムの中の compiler-ingest.ts（クラスの部分）`

```
@Component({
  selector: 'app-ingest-sample',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div>{{ message }} @if (value()) { hello }</div>`,
})
class IngestSample {
  protected readonly message = 'hello';
  protected readonly value = signal(1);
}

/*tcb1*/
function _tcb_326(this: IngestSample) {
if (true) {
"" + (((this).message /*603,610*/) /*603,610*/);
if ((this).value /*619,624*/() /*619,626*/) {
};

}
}
```

📄 `同じファイルの shim（compiler-ingest.ngtypecheck.ts の先頭）`

```
import * as i0 from '…/app/pages/chapters/compiler-ingest';
import * as i1 from '…/app/shared/chapter-shell';
import * as i2 from '@angular/core';
import * as i3 from '@angular/router';
import * as i4 from '…/app/shared/code-block';
import * as i5 from '…/app/shared/figure';

/*tcb2*/
function _tcb1(this: i0.CompilerIngestChapter) {
if (true) {
var _t1 /*T:DIR:0*/ /*0,42*/ = null! as i1.ChapterShell /*T:VAE*/;
_t1.slug[i2.ɵINPUT_SIGNAL_BRAND_WRITE_TYPE] /*19,23*/ = ("compiler-ingest") /*19,41*/;
…
```

export していない `IngestSample` は 2 節の判定 1 で `MustInline` になり、クラスの閉じ括弧の直後（4 節の 719 行目）に `_tcb_326`（728 行目。326 はクラスの `pos`）が差し込まれています。同じファイルの export しているコンポーネント `CompilerIngestChapter` は、shim の `_tcb1` です。**1 つのファイルの中で 2 つの方式が混ざることがあります**。先頭のコメントの `/*tcb1*/`・`/*tcb2*/` はテンプレートの id（ファイルの中で何番目のコンポーネントか）で、関数名の番号とは別物です（[第 16 回](16-typecheck-diagnostics-mapping.md)）。

## テストと直し方

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_checker_spec.ts` L169–190 （▶ の行: 176, 183, 187–188）

```ts
169 │       it('should produce errors for components that require TCB inlining', () => {
170 │         const fileName = absoluteFrom('/main.ts');
171 │         const {program, templateTypeChecker} = setup(
172 │           [
173 │             {
174 │               fileName,
175 │               source: `
176 ▶                 abstract class Cmp {
177 │                   value: string = 'hello';
178 │                 }
179 │               `,
180 │               templates: {'Cmp': '<div></div>'},
181 │             },
182 │           ],
183 ▶           {inlining: false},
184 │         );
185 │         const sf = getSourceFileOrError(program, fileName);
186 │         const diags = templateTypeChecker.getDiagnosticsForFile(sf, OptimizeFor.WholeProgram);
187 ▶         expect(diags.length).toBe(1);
188 ▶         expect(diags[0].code).toBe(ngErrorCode(ErrorCode.INLINE_TCB_REQUIRED));
189 │       });
190 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_checker_spec.ts` L191–211 （▶ の行: 197, 201, 205, 210）

```ts
191 │       it('should generate TCB in shim file when inlining is unsupported but required', () => {
192 │         const fileName = absoluteFrom('/main.ts');
193 │         const {program, templateTypeChecker} = setup(
194 │           [
195 │             {
196 │               fileName,
197 ▶               source: `abstract class Cmp {} // not exported, so requires inline`,
198 │               templates: {'Cmp': '<div></div>'},
199 │             },
200 │           ],
201 ▶           {inliningMode: InliningMode.CopySourceToTcb},
202 │         );
203 │         const sf = getSourceFileOrError(program, fileName);
204 │         const diags = templateTypeChecker.getDiagnosticsForFile(sf, OptimizeFor.WholeProgram);
205 ▶         expect(diags.length).toBe(0);
206 │ 
207 │         const cmp = getClass(sf, 'Cmp');
208 │         const block = templateTypeChecker.getTypeCheckBlock(cmp);
209 │         expect(block).not.toBeNull();
210 ▶         expect(block!.getText()).toContain(`Cmp`);
211 │       });
```

type\_checker\_spec.ts の `describe('when inlining is unsupported')` の 2 本です。176 行目、export していないクラスを 183 行目の `{inlining: false}`（`InliningMode.Error`。`setup()` が `TsCreateProgramDriver` の `inliningMode` を書き換える）で通すと、187〜188 行目で `INLINE_TCB_REQUIRED` が 1 件出ます（2 節の仕事 3）。同じクラスを 201 行目の `CopySourceToTcb` で通すと、205 行目で診断は 0 件、210 行目で TCB が取れます（5 節の写しの方式）。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/checker.ts` L639–651 （▶ の行: 643, 646, 649）

```ts
639 │   private filterShimDiagnostics(
640 │     shimSf: ts.SourceFile,
641 │     semanticDiagnostics: readonly ts.Diagnostic[],
642 │   ): readonly ts.Diagnostic[] {
643 ▶     if (this.programDriver.inliningMode !== InliningMode.CopySourceToTcb) {
644 │       return semanticDiagnostics;
645 │     }
646 ▶     const ranges = this.getGeneratedCodeRanges(shimSf);
647 │     return semanticDiagnostics.filter((diag) => {
648 │       if (diag.start === undefined) return true;
649 ▶       return ranges.some((range) => diag.start! >= range.pos && diag.start! < range.end);
650 │     });
651 │   }
```

写しの方式には落とし穴が 1 つあります。shim の中に元のファイルの写しがあるので、元のファイルの普通の型エラーも shim の診断として出てしまいます。そこで 643 行目、`CopySourceToTcb` のときだけ、646〜649 行目で `_tcb` で始まる関数の範囲にある診断だけを残します。これを確かめているのが同じ describe の `it('should filter out diagnostics from copied source in CopySourceToTcb mode')`（type\_checker\_spec.ts:213）と `it('should not filter out template errors in CopySourceToTcb mode')`（:235）です。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test \
  --nocache_test_results --test_output=all "--test_arg=--filter=inlin"
```

📄 `出力（2026-11-02 に実行）`

```
Ran 76 of 1747 specs
76 specs, 0 failures
Finished in 0.524 seconds
INFO: Elapsed time: 1.588s, Critical Path: 1.36s
//packages/compiler-cli/src/ngtsc/typecheck/test:test                    PASSED in 1.3s
```

1. **何が走ったか**

   `--filter=inlin` は describe と it をつないだ名前に「inlin」を含むものを選びます。type\_checker\_spec.ts の 6 本（`should clear old inlines when necessary` と上の describe の 5 本）、type\_checker\_\_get\_symbol\_of\_template\_node\_spec.ts の inline の TCB の 3 本などが選ばれ、4 つのファイルシステムの分を合わせて 76 specs が 0.5 秒で通りました。
2. **export していないディレクティブは？**

   📄 `angular/packages/compiler-cli/test/ngtsc/template_typecheck_spec.ts` L87–116 （▶ の行: 98, 104, 110, 113）

   ```ts
    87 │     it('should not fail with a runtime error when generating TCB', () => {
    88 │       env.tsconfig({strictTemplates: true});
    89 │       env.write(
    90 │         'test.ts',
    91 │         `
    92 │         import {Component, input} from '@angular/core';
    93 │ 
    94 │         @Component({
    95 │           selector: 'sub-cmp',
    96 │           template: '',
    97 │         })
    98 ▶         class Sub { // intentionally not exported
    99 │           someInput = input.required<string>();
   100 │         }
   101 │ 
   102 │         @Component({
   103 │           template: \`<sub-cmp [someInput]="''" />\`,
   104 ▶           imports: [Sub],
   105 │         })
   106 │         export class MyComponent {}
   107 │       `,
   108 │       );
   109 │ 
   110 ▶       const diagnostics = env.driveDiagnostics();
   111 │       expect(diagnostics).toEqual([
   112 │         jasmine.objectContaining({
   113 ▶           messageText: jasmine.objectContaining({messageText: 'Unable to import symbol Sub.'}),
   114 │         }),
   115 │       ]);
   116 │     });
   ```

   2 節の判定はコンポーネントとパイプだけを見ます。98 行目のように*使うディレクティブ*が export されていないと、コンポーネントは shim に書かれ、shim から `Sub` を import できずに 113 行目の「Unable to import symbol Sub.」になります。template\_typecheck\_spec.ts の `it('should not fail with a runtime error when generating TCB')` がそれを確かめています（クラッシュせず、この診断で止まる）。
3. **直すとしたら**

   置き場所の判定は context.ts の `addDirective`、inline の条件は tcb\_util.ts の `requiresInlineTypeCheckBlock`、差し込む位置は `InlineTcbOp` / `TypeCtorOp` の `splitPoint` です。確かめる spec は、方式ごとの違いなら type\_checker\_spec.ts（`setup(…, {inliningMode})`）、利用者に見える診断なら template\_typecheck\_spec.ts、TCB の文字列なら type\_check\_block\_spec.ts の `it('should copy source content to shim file in CopySourceToTcb mode')`（:2583）です。
4. **issue を読むときの手がかり**

   「This component requires inline template type-checking」という文言の issue は、v22.1 より前の言語サービス（`Error` の方式）の話です。閉じた #46747 はその例で、いまの言語サービスでは写しの方式で型チェックされます。一覧は[第 20 回](20-typecheck-issues.md)です。

## 聞かれそうな質問

**Q. inline の TCB は、ユーザーのファイルを書き換えるのですか？**

ディスクの上のファイルは書き換えません。5 節の 541〜548 行目が作るのは「新しい中身の文字列」で、それを使うのは型チェック用の派生プログラムだけです。出力（emit）は型チェックの前のプログラムから行います。

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L341–361 （▶ の行: 343–344, 358）

```ts
341 │       const emitResults: CbEmitRes[] = [];
342 │ 
343 ▶       for (const targetSourceFile of this.tsProgram.getSourceFiles()) {
344 ▶         if (targetSourceFile.isDeclarationFile || ignoreFiles.has(targetSourceFile)) {
345 │           continue;
346 │         }
347 │ 
348 │         if (!forceEmit && this.compiler.incrementalCompilation.safeToSkipEmit(targetSourceFile)) {
349 │           this.compiler.perfRecorder.eventCount(PerfEvent.EmitSkipSourceFile);
350 │           continue;
351 │         }
352 │ 
353 │         this.compiler.perfRecorder.eventCount(PerfEvent.EmitSourceFile);
354 │ 
355 │         emitResults.push(
356 │           emitCallback({
357 │             targetSourceFile,
358 ▶             program: this.tsProgram,
359 │             host: this.host,
360 │             options: this.options,
361 │             emitOnlyDtsFiles: false,
```

`NgtscProgram.emit` は 343 行目で `this.tsProgram`（利用者のプログラム）のファイルを回し、344 行目で shim（`ignoreForEmit`）を飛ばし、358 行目でも `this.tsProgram` を渡します。7 節と同じ設定で手元の ngc（コマンド）に出力させた結果でも、`compiler-ingest.js` に `_tcb` は無く、`.ngtypecheck` の JS も 0 個でした。

**Q. .ngtypecheck.ts はディスクにできますか？**

できません。shim は最初のプログラムを作るときにメモリの上で作られ（1 行のダミー。[compiler-typecheck](../compiler/17-compiler-typecheck.md) の 2 節の shim.ts）、5 節の中身の差し替えもメモリの上の `ts.SourceFile` です（[第 4 回](04-typecheck-program-driver.md)）。emit でも上の 344 行目のとおり飛ばされます。中身を見たいときは、7 節のように `getCurrentProgram()` の `getSourceFile(…ngtypecheck.ts)` を読みます。

**Q. 1 つのファイルにいくつの TCB が入りますか？**

shim は元のファイル 1 つにつき 1 つで、そのファイルのコンポーネントの数だけ `_tcb1`、`_tcb2`…が入ります（3 節の 40 行目）。7 節の計測では、このサイトの shim のうち 2 個以上の TCB を持つものが 38 個（2 個が 26、3 個が 8、4 個が 3、5 個が 1）でした。inline のものは元のファイルの中に入るので、1 つのファイルに「shim の TCB」と「inline の TCB」が混ざることもあります（7 節の compiler-ingest.ts）。

**Q. なぜ毎回 inline にしないのですか？そのほうが簡単では？**

元のファイルの中身が変わると、TypeScript はそのファイルを作り直し、型の情報も捨てて調べ直します。shim だけを変えれば、利用者のファイルは前のプログラムの `ts.SourceFile` をそのまま使えます（[第 4 回](04-typecheck-program-driver.md)）。さらに inline を使ったファイルは `hasInlines` の印のせいで、次の差分ビルドで前回の結果を使い回せません。README も inline について「型チェックの性能に大きな影響がある」と書いています。

**Q. 言語サービスで inline が要るコンポーネントはどうなりますか？**

v22.1 からは `CopySourceToTcb` の方式で、元のファイルの写しを shim に置き、写しの中に TCB を差し込みます（5 節）。元のファイルは変わりません。写しの中の普通の型エラーは 643〜649 行目で捨て、TCB の中の診断だけを出します。それより前の版では `INLINE_TCB_REQUIRED` になり、そのコンポーネントのテンプレートは型チェックされませんでした。

## 読み終えて

- `TypeCheckContextImpl` は「どのファイルをどんな文字列にするか」を決めるだけで、プログラムには触らない。結果は `finalize` の `Map<パス, FileUpdate>`。
- inline が要るのは、コンポーネントが export されていない・型引数の制約を外に書けない・使うパイプが export されていない、の 3 つ。使うディレクティブは判定に入らない。
- inline の TCB はクラスの直後（`end + 1`）、inline の型コンストラクタはクラスの中（`end - 1`）。関数名は `_tcb_<pos>`。
- 方式は `InliningMode` で 3 つ。ngc は元のファイルに差し込み、言語サービスは写しに差し込み、どちらも元のファイルのディスクと出力には影響しない。

---

← 前: [strictTemplates が TypeCheckingConfig になるまで](02-typecheck-config.md)  
次: [派生した ts.Program と、作り直しの節約](04-typecheck-program-driver.md) →
