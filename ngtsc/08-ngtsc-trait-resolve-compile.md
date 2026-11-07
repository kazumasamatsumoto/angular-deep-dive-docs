[目次](../README.md) › [ngtsc の内側](README.md) › 第 8 回 / 全 20 回

# TraitCompiler（2）：解決して、静的なフィールドを作る

> TraitCompiler.resolve が Analyzed の trait を Resolved に移し、handler の resolve の診断と data を集める行、compile が CompilationMode（FULL・PARTIAL・LOCAL）で compileFull・compilePartial・compileLocal を選んで CompileResult（ɵcmp・ɵfac などの名前・初期値・型・文）を返すまで、decoratorsFor が消すデコレーター、ConstantPool。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-trait-resolve-compile)

---

[第 7 回](07-ngtsc-trait-analyze.md)で、全部のクラスの trait が Analyzed になりました。analyze は「そのクラスのファイルだけ」を見る段でした。この章はその続きで、**全部の解析が済んでから**走る `TraitCompiler.resolve`（ほかのクラスの情報を使って仕上げる）と、出力のときに 1 クラスずつ呼ばれる `compile`（静的なフィールド `ɵcmp`・`ɵfac` などの中身を作る）を読みます。compile が `compilationMode`（full・partial・experimental-local）で handler のどのメソッドを選ぶか、返す `CompileResult` の中身、`decoratorsFor` が消すデコレーター、ファイルで共有する `ConstantPool` まで、1 行ずつ追います。

読む対象は `packages/compiler-cli/src/ngtsc/transform/src/` の `api.ts` の後半と `compilation.ts` の後半、`packages/compiler/src/constant_pool.ts` の一部、spec の `transform/test/compilation_spec.ts` です。compile の結果をクラスに書き足す `ivyTransformFactory` は[第 12 回](12-ngtsc-ivy-transform.md)、HMR の `compileHmrUpdateCallback` は[第 17 回](17-ngtsc-hmr.md)です。

1. [1. 全体像](01-ngtsc-overview.md)
2. [2. NgtscProgram](02-ngtsc-program.md)
3. [3. NgCompiler とチケット](03-ngtsc-compiler-ticket.md)
4. [4. リフレクション](04-ngtsc-reflection.md)
5. [5. 静的な評価](05-ngtsc-partial-evaluator.md)
6. [6. 参照と import](06-ngtsc-references-imports.md)
7. [7. 解析](07-ngtsc-trait-analyze.md)
8. **8. 解決と出力**（この章）
9. [9. @Directive の handler](09-ngtsc-directive-handler.md)
10. [10. メタデータの登録](10-ngtsc-metadata-registry.md)
11. [11. .d.ts を読む](11-ngtsc-dts-metadata.md)
12. [12. JS の書き換え](12-ngtsc-ivy-transform.md)
13. [13. .d.ts の書き換え](13-ngtsc-dts-transform.md)
14. [14. 差分ビルド](14-ngtsc-incremental.md)
15. [15. 意味のグラフ](15-ngtsc-semantic-graph.md)
16. [16. import の循環](16-ngtsc-cycles.md)
17. [17. HMR](17-ngtsc-hmr.md)
18. [18. 診断と性能](18-ngtsc-diagnostics-perf.md)
19. [19. テストを書く](19-ngtsc-test-env.md)
20. [20. issue と PR を読む](20-ngtsc-issues.md)

## 1. 約束の後半：resolve と compile

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/api.ts` L146–178 （▶ の行: 151, 161–163, 165, 171, 173）

```ts
146 │   /**
147 │    * Registers information about the decorator for the indexing phase in a
148 │    * `IndexingContext`, which stores information about components discovered in the
149 │    * program.
150 │    */
151 ▶   index?(
152 │     context: IndexingContext,
153 │     node: ClassDeclaration,
154 │     analysis: Readonly<A>,
155 │     resolution: Readonly<R>,
156 │   ): void;
157 │ 
158 │   /**
159 │    * Perform resolution on the given decorator along with the result of analysis.
160 │    *
161 ▶    * The resolution phase happens after the entire `ts.Program` has been analyzed, and gives the
162 ▶    * `DecoratorHandler` a chance to leverage information from the whole compilation unit to enhance
163 ▶    * the `analysis` before the emit phase.
164 │    */
165 ▶   resolve?(node: ClassDeclaration, analysis: Readonly<A>, symbol: S): ResolveResult<R>;
166 │ 
167 │   /**
168 │    * Extract i18n messages into the `Xi18nContext`, which is useful for generating various formats
169 │    * of message file outputs.
170 │    */
171 ▶   xi18n?(bundle: Xi18nContext, node: ClassDeclaration, analysis: Readonly<A>): void;
172 │ 
173 ▶   typeCheck?(
174 │     ctx: TypeCheckContext,
175 │     node: ClassDeclaration,
176 │     analysis: Readonly<A>,
177 │     resolution: Readonly<R>,
178 │   ): void;
```

165 行目の `resolve` は任意です。161〜163 行目のとおり、プログラム全体の解析が済んでから呼ばれるので、**ほかのファイルのクラスの情報を使えます**。コンポーネントなら、使えるディレクティブ・パイプ（スコープ）を決めてテンプレートと照らし合わせるのがここです（[compiler-entry の章](../compiler/02-compiler-entry.md)の 2 節、[ngmodule-compilation-scope の章](../ngmodule/04-ngmodule-compilation-scope.md)）。151 行目の `index`・171 行目の `xi18n`・173 行目の `typeCheck` は、resolve のあとに別の道から呼ばれます（4 節）。

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/api.ts` L190–216 （▶ の行: 194–195, 197, 201–202, 209–210, 212, 215–216）

```ts
190 │   /**
191 │    * Generate a description of the field which should be added to the class, including any
192 │    * initialization code to be generated.
193 │    *
194 ▶    * If the compilation mode is configured as other than full but an implementation of the
195 ▶    * corresponding method is not provided, then this method is called as a fallback.
196 │    */
197 ▶   compileFull(
198 │     node: ClassDeclaration,
199 │     analysis: Readonly<A>,
200 │     resolution: Readonly<R>,
201 ▶     constantPool: ConstantPool,
202 ▶   ): CompileResult | CompileResult[];
203 │ 
204 │   /**
205 │    * Generates code for the decorator using a stable, but intermediate format suitable to be
206 │    * published to NPM. This code is meant to be processed by the linker to achieve the final AOT
207 │    * compiled code.
208 │    *
209 ▶    * If present, this method is used if the compilation mode is configured as partial, otherwise
210 ▶    * `compileFull` is.
211 │    */
212 ▶   compilePartial?(
213 │     node: ClassDeclaration,
214 │     analysis: Readonly<A>,
215 ▶     resolution: Readonly<R>,
216 ▶   ): CompileResult | CompileResult[];
```

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/api.ts` L227–237 （▶ の行: 231, 234–236）

```ts
227 │   /**
228 │    * Generates code based on each individual source file without using its
229 │    * dependencies (suitable for local dev edit/refresh workflow)
230 │    */
231 ▶   compileLocal(
232 │     node: ClassDeclaration,
233 │     analysis: Readonly<A>,
234 ▶     resolution: Readonly<Partial<R>>,
235 ▶     constantPool: ConstantPool,
236 ▶   ): CompileResult | CompileResult[];
237 │ }
```

- `compileFull`（197 行目）は必須です。194〜195 行目：full でない設定でも、ほかのメソッドが無ければこれが使われます。
- `compilePartial`（212 行目）は任意で、**ConstantPool を受け取りません**（213〜215 行目）。部分コンパイルの出力（`ɵɵngDeclareComponent` など）は、定数を外に出さず、ライブラリを使う側の linker（[cli-linker の章](../cli/06-cli-linker.md)）が仕上げるからです。
- `compileLocal`（231 行目）は必須で、resolution が `Partial<R>`（234 行目）です。ローカルコンパイルでは、ほかのファイルを見ないので、resolve の答えが欠けていてもよい、という型です。

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/api.ts` L272–288 （▶ の行: 276–281, 284–287）

```ts
272 │ /**
273 │  * A description of the static field to add to a class, including an initialization expression
274 │  * and a type for the .d.ts file.
275 │  */
276 ▶ export interface CompileResult {
277 ▶   name: string;
278 ▶   initializer: Expression | null;
279 ▶   statements: Statement[];
280 ▶   type: Type;
281 ▶   deferrableImports: Set<ts.ImportDeclaration> | null;
282 │ }
283 │ 
284 ▶ export interface ResolveResult<R> {
285 ▶   reexports?: Reexport[];
286 ▶   diagnostics?: ts.Diagnostic[];
287 ▶   data?: Readonly<R>;
288 │ }
```

| CompileResult のフィールド | 意味 | DEMO の記録（full の `Widget`） |
| --- | --- | --- |
| `name`（277 行目） | 足す static フィールドの名前 | `ɵfac` と `ɵcmp` の 2 つ |
| `initializer`（278 行目） | そのフィールドの初期値の式。`null` なら .d.ts の型だけ | どちらもあり（`ɵɵdefineComponent({…})` など） |
| `statements`（279 行目） | クラスの後ろに置く文 | `ɵcmp` に 2 つ（出力の `ɵsetClassMetadata` と `ɵsetClassDebugInfo` の IIFE） |
| `type`（280 行目） | .d.ts に書く型（[第 13 回](13-ngtsc-dts-transform.md)） | `i0.ɵɵComponentDeclaration<Widget, "app-widget", …>` |
| `deferrableImports`（281 行目） | `@defer` だけで使う import の宣言（消してよいもの。[standalone-defer-deps の章](../standalone/11-standalone-defer-deps.md)） | `ɵcmp` は 0 個の Set、`ɵfac` は `null` |

resolve の答え（284〜288 行目）は、診断・`data`（compile に渡す resolution）・`reexports`（ファイルに足す re-export。[第 6 回](06-ngtsc-references-imports.md)の別名）の 3 つです。

## 2. TraitCompiler.resolve：Analyzed を Resolved へ

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L492–515 （▶ の行: 493–494, 496, 498–502, 505–506, 509, 512, 514）

```ts
492 │   resolve(): void {
493 ▶     const classes = this.classes.keys();
494 ▶     for (const clazz of classes) {
495 │       const record = this.classes.get(clazz)!;
496 ▶       for (let trait of record.traits) {
497 │         const handler = trait.handler;
498 ▶         switch (trait.state) {
499 ▶           case TraitState.Skipped:
500 ▶             continue;
501 ▶           case TraitState.Pending:
502 ▶             throw new Error(
503 │               `Resolving a trait that hasn't been analyzed: ${clazz.name.text} / ${trait.handler.name}`,
504 │             );
505 ▶           case TraitState.Resolved:
506 ▶             throw new Error(`Resolving an already resolved trait`);
507 │         }
508 │ 
509 ▶         if (trait.analysis === null) {
510 │           // No analysis results, cannot further process this trait.
511 │           continue;
512 ▶         }
513 │ 
514 ▶         if (handler.resolve === undefined) {
515 │           // No resolution of this trait needed - it's considered successful by default.
```

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L524–546 （▶ の行: 524–526, 532, 534–535, 539–541）

```ts
524 ▶           if (err instanceof FatalDiagnosticError) {
525 ▶             trait = trait.toResolved(null, [err.toDiagnostic()]);
526 ▶             continue;
527 │           } else {
528 │             throw err;
529 │           }
530 │         }
531 │ 
532 ▶         trait = trait.toResolved(result.data ?? null, result.diagnostics ?? null);
533 │ 
534 ▶         if (result.reexports !== undefined) {
535 ▶           const fileName = clazz.getSourceFile().fileName;
536 │           if (!this.reexportMap.has(fileName)) {
537 │             this.reexportMap.set(fileName, new Map<string, [string, string]>());
538 │           }
539 ▶           const fileReexports = this.reexportMap.get(fileName)!;
540 ▶           for (const reexport of result.reexports) {
541 ▶             fileReexports.set(reexport.asAlias, [reexport.fromModule, reexport.symbolName]);
542 │           }
543 │         }
544 │       }
545 │     }
546 │   }
```

1. **493〜496 行目：全部のクラスの、全部の trait**

   ファイルごとではなく、`classes`（第 7 回 4 節の Map）を回します。
2. **498〜507 行目：Skipped は飛ばし、Pending と Resolved は投げる**

   Pending が残っているのは analyze を忘れた、Resolved なのは 2 回 resolve した、というコンパイラの不具合です。
3. **509〜512 行目：analysis が null なら何もしない**

   analyze が失敗した trait（第 7 回 4 節）は、**Analyzed のまま**残ります。第 7 回の DEMO で `BadSelector` と `Undecorated` が resolve の直後も Analyzed だったのはこのためです。
4. **514〜515 行目：handler に resolve が無ければ、そのまま Resolved**

   このとき resolution は `null` です。
5. **524〜526 行目：FatalDiagnosticError は「resolution が null・診断あり」の Resolved**

   analyze と違い、失敗しても**Resolved に進みます**。compile は、この診断を見て飛ばします（3 節 677〜680 行目）。
6. **532 行目：data と診断を持って Resolved**

   診断があっても Resolved です。エラーの重さで判断するのは compile の側です。
7. **534〜543 行目：reexports をファイルごとに集める**

   540〜541 行目で「別名 → \[どこから, 何を\]」の表にし、出力のときに `export {… as …}` の文になります（`exportStatements`、下の 810 行目）。

> [!NOTE]
> **ポイント**
>
> 第 7 回の DEMO の記録で、resolve は Cmp → DirAndInjectable の Directive → 同じクラスの Injectable → NotExportedInModule → SomeModule の順に呼ばれていました。`classes` の Map に入った順（detect で ClassRecord を作った順）です。Injectable の handler は resolve を持っていますが、DirAndInjectable の Injectable の trait の resolution は `null` でした（resolve の答えに data が無いので 532 行目の `result.data ?? null`）。

## 3. compile：compilationMode で handler のメソッドを選ぶ

`compile` は、出力のときに `ivyTransformFactory` の 1 回目の訪問（`IvyCompilationVisitor`）がクラスごとに呼びます（[第 12 回](12-ngtsc-ivy-transform.md)）。2 つ目の引数の ConstantPool は、**ファイルごとに 1 つ**作られたものです（[compiler-reify-emit の章](../compiler/16-compiler-reify-emit.md)で引用した transform.ts の行）。

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L660–680 （▶ の行: 660–662, 665, 670, 672, 674, 677–680）

```ts
660 ▶   compile(clazz: DeclarationNode, constantPool: ConstantPool): CompileResult[] | null {
661 ▶     const original = ts.getOriginalNode(clazz) as typeof clazz;
662 ▶     if (
663 │       !this.reflector.isClass(clazz) ||
664 │       !this.reflector.isClass(original) ||
665 ▶       !this.classes.has(original)
666 │     ) {
667 │       return null;
668 │     }
669 │ 
670 ▶     const record = this.classes.get(original)!;
671 │ 
672 ▶     let res: CompileResult[] = [];
673 │ 
674 ▶     for (const trait of record.traits) {
675 │       let compileRes: CompileResult | CompileResult[];
676 │ 
677 ▶       if (
678 ▶         trait.state !== TraitState.Resolved ||
679 ▶         containsErrors(trait.analysisDiagnostics) ||
680 ▶         containsErrors(trait.resolveDiagnostics)
```

1. **661 行目：getOriginalNode で元のクラスへ**

   ほかの TypeScript の変換がクラスを作り直していても、元の宣言で ClassRecord を引くためです。
2. **674〜680 行目：Resolved で、エラーの診断が無い trait だけ**

   analyze か resolve の診断に `Error` が 1 つでもあれば飛ばします（下の `containsErrors`、815〜820 行目）。警告だけなら出力します。

ここから先の分岐は [compiler-entry の章](../compiler/02-compiler-entry.md)の 2 節で引用しました。分かれ目の 2 か所だけを短く引きます。

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L686–692 （▶ の行: 686, 690）

```ts
686 ▶       if (this.compilationMode === CompilationMode.LOCAL) {
687 │         // `trait.analysis` is non-null asserted here because TypeScript does not recognize that
688 │         // `Readonly<unknown>` is nullable (as `unknown` itself is nullable) due to the way that
689 │         // `Readonly` works.
690 ▶         compileRes = trait.handler.compileLocal(
691 │           clazz,
692 │           trait.analysis!,
```

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L700–706 （▶ の行: 701–702, 704, 706）

```ts
700 │         if (
701 ▶           this.compilationMode === CompilationMode.PARTIAL &&
702 ▶           trait.handler.compilePartial !== undefined
703 │         ) {
704 ▶           compileRes = trait.handler.compilePartial(clazz, trait.analysis, trait.resolution!);
705 │         } else {
706 ▶           compileRes = trait.handler.compileFull(
```

| compilationMode（tsconfig） | CompilationMode | 呼ばれるメソッド | DEMO の出力の特徴 |
| --- | --- | --- | --- |
| `'full'`（既定） | FULL | `compileFull`（706 行目） | `ɵɵdefineComponent`・テンプレート関数・`const _c0` |
| `'partial'` | PARTIAL | `compilePartial` があればそれ（701〜704 行目）、無ければ `compileFull` | `ɵɵngDeclareComponent({ version: "22.1.6", template: '…' })`。テンプレートは文字列のまま |
| `'experimental-local'` | LOCAL | `compileLocal`（690 行目） | `dependencies: i0.ɵɵgetComponentDepsFactory(Widget, [HiDir])`。.d.ts に ɵ のフィールドが無い |

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L707–735 （▶ の行: 715–716, 718–719, 722–723, 729–731, 734）

```ts
707 │             clazz,
708 │             trait.analysis,
709 │             trait.resolution!,
710 │             constantPool,
711 │           );
712 │         }
713 │       }
714 │ 
715 ▶       const compileMatchRes = compileRes;
716 ▶       if (Array.isArray(compileMatchRes)) {
717 │         for (const result of compileMatchRes) {
718 ▶           if (!res.some((r) => r.name === result.name)) {
719 ▶             res.push(result);
720 │           }
721 │         }
722 ▶       } else if (!res.some((result) => result.name === compileMatchRes.name)) {
723 ▶         res.push(compileMatchRes);
724 │       }
725 │     }
726 │ 
727 │     // Look up the .d.ts transformer for the input file and record that at least one field was
728 │     // generated, which will allow the .d.ts to be transformed later.
729 ▶     this.dtsTransforms
730 ▶       .getIvyDeclarationTransform(original.getSourceFile())
731 ▶       .addFields(original, res);
732 │ 
733 │     // Return the instruction to the transformer so the fields will be added.
734 ▶     return res.length > 0 ? res : null;
735 │   }
```

1. **715〜724 行目：同じ名前の CompileResult は先に来た方だけ**

   trait が 2 つ以上あるクラスで、2 つの handler が同じ名前のフィールドを返しても、1 つだけにする保険です。`@Directive` と `@Injectable` の組では、そもそも Injectable の handler が `ɵfac` を作りません（annotations/src/injectable.ts の analyze が、ほかの Angular のデコレーターがあると `needsFactory` を false にする）。
2. **729〜731 行目：.d.ts の変換に「このクラスにこのフィールドを足した」と知らせる**

   .d.ts の側の書き換えは[第 13 回](13-ngtsc-dts-transform.md)です。
3. **734 行目：何も無ければ null**

> **🧪 DEMO — 同じ入力を full・partial・experimental-local で emit する（記録）**
>
> これは記録です。下の src/widget.ts を、@angular/compiler-cli 22.1.6 の本物の NgtscProgram で `compilationMode` だけを変えて 3 回 emit しました。NgCompiler の private の `makeCompilation` を包んで TraitCompiler を手に入れ、`compile`・`decoratorsFor` と、handler の `compileFull`・`compilePartial`・`compileLocal` を「記録してから本物を呼ぶ」関数で包みました。ConstantPool は、compile に渡されたものに番号を付け、compile の前後で `statements` の数を比べています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-trait-resolve-compile)

📄 `記録に使った入力 src/widget.ts`

```ts
import {Component, Directive, input} from '@angular/core';

@Directive({selector: '[appHi]'})
export class HiDir {
  appHi = input('');
}

@Component({
  selector: 'app-widget',
  imports: [HiDir],
  template: '<p appHi="x" [title]="[1, 2]">{{ label }}</p>',
})
export class Widget {
  label = 'w';
}

@Component({selector: 'app-second', template: '<p [title]="[1, 2]"></p>'})
export class Second {}

```

- どのモードでも、記録の 1 つ目のクラス `HiDir` から順に、handler のメソッド → `TraitCompiler.compile` が来て、3 つとも終わってから `decoratorsFor` が 3 回来ます。compile は 1 回目の訪問、decoratorsFor は 2 回目の訪問（クラスを書き換えるとき）から呼ばれるからです（[第 12 回](12-ngtsc-ivy-transform.md)）。
- full と local では、`Widget` の compile で ConstantPool に文が 1 つ増え（`const _c0 = () => [1, 2];`）、`Second` の compile では 0 です。`Second` の出力は `i0.ɵɵpureFunction0(1, _c0)` で、**同じファイルの別のコンポーネントの定数を使い回しています**（5 節）。partial では 0 と 0 で、出力に `_c0` はありません。
- local の `Second` は `ɵɵelement`、full の `Second` は `ɵɵdomElement` です。full ではスコープが分かるので「この要素にディレクティブは付かない」と決められますが、local ではほかのファイルを見ないので決められません。

## 4. resolve のあとの別の道：typeCheck・index・updateResources

`typeCheck` は、Resolved の trait の handler に TCB（型チェックのコード）を書かせる入口で、[typecheck-context の章](../typecheck/03-typecheck-context.md)で引用しました。ローカルコンパイルでは何もしません。拡張診断の `runAdditionalChecks` は[typecheck-extended の章](../typecheck/18-typecheck-extended.md)です。

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L603–620 （▶ の行: 604, 607, 610, 615–616）

```ts
603 │   index(ctx: IndexingContext): void {
604 ▶     for (const clazz of this.classes.keys()) {
605 │       const record = this.classes.get(clazz)!;
606 │       for (const trait of record.traits) {
607 ▶         if (trait.state !== TraitState.Resolved) {
608 │           // Skip traits that haven't been resolved successfully.
609 │           continue;
610 ▶         } else if (trait.handler.index === undefined) {
611 │           // Skip traits that don't affect indexing.
612 │           continue;
613 │         }
614 │ 
615 ▶         if (trait.resolution !== null) {
616 ▶           trait.handler.index(ctx, clazz, trait.analysis, trait.resolution);
617 │         }
618 │       }
619 │     }
620 │   }
```

`index` は、Resolved の trait の handler に「このコンポーネントのテンプレートの中の名前」などを索引に書かせます。使うのは NgCompiler の `getIndexedComponents` で、エディタなどの道具のためです（`indexer/`）。

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L641–658 （▶ の行: 643–646, 652, 656）

```ts
641 │   updateResources(clazz: DeclarationNode): void {
642 │     // Local compilation does not support incremental
643 ▶     if (
644 ▶       this.compilationMode === CompilationMode.LOCAL ||
645 ▶       !this.reflector.isClass(clazz) ||
646 ▶       !this.classes.has(clazz)
647 │     ) {
648 │       return;
649 │     }
650 │     const record = this.classes.get(clazz)!;
651 │     for (const trait of record.traits) {
652 ▶       if (trait.state !== TraitState.Resolved || trait.handler.updateResources === undefined) {
653 │         continue;
654 │       }
655 │ 
656 ▶       trait.handler.updateResources(clazz, trait.analysis, trait.resolution);
657 │     }
658 │   }
```

`updateResources` は「TypeScript は変わらず、テンプレートの .html やスタイルだけが変わった」ときに、analyze と resolve をやり直さずに handler に結果を差し替えさせる入口です（呼ぶのは NgCompiler。[第 14 回](14-ngtsc-incremental.md)）。644 行目のとおり、ローカルコンパイルでは呼びません。spec の it `should not call updateResources`（下）がこれを確かめています。

## 5. ConstantPool：ファイルで共有する定数の置き場

1 節の `compileFull`・`compileLocal` の最後の引数が ConstantPool です。テンプレートの中の `[1, 2]` のようなリテラルは、毎回の変更検知で新しい配列を作らないように、関数 `() => [1, 2]` にして外に出します（[compiler-consts-pure の章](../compiler/14-compiler-consts-pure.md)）。その関数を置くのが ConstantPool です。

📄 `angular/packages/compiler/src/constant_pool.ts` L156–162 （▶ の行: 156–160, 162）

```ts
156 ▶     const key = def.keyOf(expr);
157 ▶     if (!this.sharedConstants.has(key)) {
158 ▶       const id = this.freshName();
159 ▶       this.sharedConstants.set(key, o.variable(id));
160 ▶       this.statements.push(def.toSharedConstantDeclaration(id, expr));
161 │     }
162 ▶     return this.sharedConstants.get(key)!;
```

`getSharedConstant` は、式から作った key（156 行目）がまだ無ければ、158 行目で新しい名前（`_c0`・`_c1`…）を取り、160 行目で宣言の文を pool に足します。あれば足さずに、同じ変数を返します（162 行目）。pool はファイルごとに 1 つで、そのファイルの全部のクラスの compile に同じものが渡るので、**別のコンポーネントでも同じ式なら同じ `_c0`** になります。DEMO の `Second` で増えた文が 0 だったのはこのためです。

📄 `angular/packages/compiler/src/constant_pool.ts` L94–116 （▶ の行: 95–97, 101, 103–104, 106–108, 112, 114）

```ts
 94 │   getConstLiteral(literal: o.Expression, forceShared?: boolean): o.Expression {
 95 ▶     if (
 96 ▶       (literal instanceof o.LiteralExpr && !isLongStringLiteral(literal)) ||
 97 ▶       literal instanceof FixupExpression
 98 │     ) {
 99 │       // Do no put simple literals into the constant pool or try to produce a constant for a
100 │       // reference to a constant.
101 ▶       return literal;
102 │     }
103 ▶     const key = GenericKeyFn.INSTANCE.keyOf(literal);
104 ▶     let fixup = this.literals.get(key);
105 │     let newValue = false;
106 ▶     if (!fixup) {
107 ▶       fixup = new FixupExpression(literal);
108 ▶       this.literals.set(key, fixup);
109 │       newValue = true;
110 │     }
111 │ 
112 ▶     if ((!newValue && !fixup.shared) || (newValue && forceShared)) {
113 │       // Replace the expression with a variable
114 ▶       const name = this.freshName();
115 │       let value: o.Expression;
116 │       let usage: o.Expression;
```

もう 1 つの入口 `getConstLiteral` は、属性の配列やクエリの条件などの「値そのもの」を共有します。短いリテラルは 95〜102 行目でそのまま返します。1 回目は 107〜108 行目で `FixupExpression`（あとで中身を差し替えられる式）を作って返すだけで、**2 回目に同じ key が来たとき**（112 行目の `!newValue && !fixup.shared`）に初めて変数にします。1 回しか使わない定数は、変数にせずその場に書くわけです。

## 6. decoratorsFor と diagnostics

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L765–786 （▶ の行: 766–767, 774, 776–777, 780–781, 785）

```ts
765 │   decoratorsFor(node: ts.Declaration): ts.Decorator[] {
766 ▶     const original = ts.getOriginalNode(node) as typeof node;
767 ▶     if (!this.reflector.isClass(original) || !this.classes.has(original)) {
768 │       return [];
769 │     }
770 │ 
771 │     const record = this.classes.get(original)!;
772 │     const decorators: ts.Decorator[] = [];
773 │ 
774 ▶     for (const trait of record.traits) {
775 │       // In global compilation mode skip the non-resolved traits.
776 ▶       if (this.compilationMode !== CompilationMode.LOCAL && trait.state !== TraitState.Resolved) {
777 ▶         continue;
778 │       }
779 │ 
780 ▶       if (trait.detected.trigger !== null && ts.isDecorator(trait.detected.trigger)) {
781 ▶         decorators.push(trait.detected.trigger);
782 │       }
783 │     }
784 │ 
785 ▶     return decorators;
786 │   }
```

`decoratorsFor` は、2 回目の訪問がクラスを書き換えるときに「消してよいデコレーター」を聞く関数です。780〜781 行目：trait の trigger がデコレーターなら、それを返します。776 行目：通常のモードでは **Resolved の trait のデコレーターだけ**です。エラーで Analyzed のまま残った trait のデコレーターは消されず、出力に残ります。ローカルコンパイルでは状態を問わず消します。DEMO では 3 つのモードとも、`HiDir` の `@Directive`、`Widget`・`Second` の `@Component` が返りました。デコレーターの中身は消えず、`ɵsetClassMetadata`（full・local）か `ɵɵngDeclareClassMetadata`（partial）の引数に写っています。

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L788–820 （▶ の行: 792–793, 796–798, 800, 802–803, 810, 815–818）

```ts
788 │   get diagnostics(): ReadonlyArray<ts.Diagnostic> {
789 │     const diagnostics: ts.Diagnostic[] = [];
790 │     for (const clazz of this.classes.keys()) {
791 │       const record = this.classes.get(clazz)!;
792 ▶       if (record.metaDiagnostics !== null) {
793 ▶         diagnostics.push(...record.metaDiagnostics);
794 │       }
795 │       for (const trait of record.traits) {
796 ▶         if (
797 ▶           (trait.state === TraitState.Analyzed || trait.state === TraitState.Resolved) &&
798 ▶           trait.analysisDiagnostics !== null
799 │         ) {
800 ▶           diagnostics.push(...trait.analysisDiagnostics);
801 │         }
802 ▶         if (trait.state === TraitState.Resolved) {
803 ▶           diagnostics.push(...(trait.resolveDiagnostics ?? []));
804 │         }
805 │       }
806 │     }
807 │     return diagnostics;
808 │   }
809 │ 
810 ▶   get exportStatements(): Map<string, Map<string, [string, string]>> {
811 │     return this.reexportMap;
812 │   }
813 │ }
814 │ 
815 ▶ function containsErrors(diagnostics: ts.Diagnostic[] | null): boolean {
816 ▶   return (
817 ▶     diagnostics !== null &&
818 ▶     diagnostics.some((diag) => diag.category === ts.DiagnosticCategory.Error)
819 │   );
820 │ }
```

診断は trait の中に溜まっていて、ここでまとめて取り出します（NgCompiler の診断の集め方は[第 18 回](18-ngtsc-diagnostics-perf.md)）。クラス全体の metaDiagnostics（792〜794 行目）、Analyzed か Resolved の analysis の診断（796〜801 行目）、Resolved の resolve の診断（802〜804 行目）の順です。

📄 `記録のスクリプト（scratchpad の記録スクリプト compile.mjs。angular-deep-dive を cwd にして node で走らせる）`

```
// 第 8 回（ngtsc-trait-resolve-compile）の記録。
// 使い方: cd angular-deep-dive && node <このファイル> > compile.json
// 同じ入力を、本物の NgtscProgram（@angular/compiler-cli 22.1.6）で compilationMode を
// full・partial・experimental-local の 3 通りにして emit し、
//  1. TraitCompiler.compile が返した CompileResult（name・initializer の有無・statements の数・deferrableImports）
//  2. どの handler のどのメソッド（compileFull・compilePartial・compileLocal）が呼ばれたか
//  3. decoratorsFor が返した（消される）デコレーター
//  4. ConstantPool（1 ファイル 1 つ）に入った文
//  5. 出力の .js と .d.ts
// を記録する。TraitCompiler と handler のメソッドは「記録してから本物を呼ぶ」関数で包むだけで、中身は変えない。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const req = createRequire(path.join(process.cwd(), 'package.json'));
const load = (id) => import(pathToFileURL(req.resolve(id)).href);
const ts = (await load('typescript')).default;
const { NgtscProgram, createCompilerHost, setFileSystem, NodeJSFileSystem } = await load('@angular/compiler-cli');
setFileSystem(new NodeJSFileSystem());

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'b-tmp', 'compile');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'));

const SOURCE = `import {Component, Directive, input} from '@angular/core';

@Directive({selector: '[appHi]'})
export class HiDir {
  appHi = input('');
}

@Component({
  selector: 'app-widget',
  imports: [HiDir],
  template: '<p appHi="x" [title]="[1, 2]">{{ label }}</p>',
})
export class Widget {
  label = 'w';
}

@Component({selector: 'app-second', template: '<p [title]="[1, 2]"></p>'})
export class Second {}
`;
fs.writeFileSync(path.join(root, 'src/widget.ts'), SOURCE);

const MODES = ['full', 'partial', 'experimental-local'];

function run(mode) {
  const options = {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    declaration: true,
    outDir: path.join(root, 'out-' + mode),
    compilationMode: mode,
  };
  const host = createCompilerHost({ options });
  const written = {};
  host.writeFile = (fileName, text) => {
    written[path.relative(options.outDir, fileName)] = text;
  };
  const program = new NgtscProgram([path.join(root, 'src/widget.ts')], options, host);
  const compiler = program.compiler;
  const log = [];
  const pools = new Map(); // ConstantPool → 番号
  const makeCompilation = compiler.makeCompilation.bind(compiler);
  compiler.makeCompilation = () => {
    const compilation = makeCompilation();
    const tc = compilation.traitCompiler;
    for (const handler of tc.handlers) {
      for (const m of ['compileFull', 'compilePartial', 'compileLocal']) {
        if (typeof handler[m] !== 'function') continue;
        const orig = handler[m].bind(handler);
        handler[m] = (node, ...rest) => {
          log.push({ step: `${handler.name}.${m}`, cls: node.name.text });
          return orig(node, ...rest);
        };
      }
    }
    const compile = tc.compile.bind(tc);
    tc.compile = (clazz, constantPool) => {
      if (!pools.has(constantPool)) pools.set(constantPool, pools.size + 1);
      const before = constantPool.statements.length;
      const res = compile(clazz, constantPool);
      log.push({
        step: 'TraitCompiler.compile',
        cls: clazz.name?.text ?? '?',
        pool: pools.get(constantPool),
        poolStatementsAdded: constantPool.statements.length - before,
        results: res === null ? null : res.map((r) => ({
          name: r.name,
          initializer: r.initializer !== null,
          statements: r.statements.length,
          deferrableImports: r.deferrableImports === null ? null : r.deferrableImports.size,
        })),
      });
      return res;
    };
    const decoratorsFor = tc.decoratorsFor.bind(tc);
    tc.decoratorsFor = (node) => {
      const res = decoratorsFor(node);
      if (res.length > 0) log.push({ step: 'TraitCompiler.decoratorsFor', cls: node.name?.text ?? '?', decorators: res.map((d) => d.getText().split('(')[0]) });
      return res;
    };
    return compilation;
  };
  const result = program.emit();
  const flatten = (m) => (typeof m === 'string' ? [m] : [m.messageText, ...(m.next ?? []).flatMap(flatten)]);
  return {
    mode,
    diagnostics: [...result.diagnostics, ...program.getNgSemanticDiagnostics()].map((d) => flatten(d.messageText).join(' / ')),
    log,
    js: written['widget.js'] ?? null,
    dts: written['widget.d.ts'] ?? null,
  };
}

const out = {
  compilerCli: JSON.parse(fs.readFileSync('node_modules/@angular/compiler-cli/package.json', 'utf8')).version,
  source: SOURCE,
  runs: MODES.map(run),
};
fs.rmSync(root, { recursive: true, force: true });
process.stdout.write(JSON.stringify(out, null, 2) + '\n');

```

## ここまでの呼び出し

- 👤 `ngc / CLI のビルド` — あなたのコマンド
- `NgCompiler` の解析の最後 → `TraitCompiler.resolve()` — compilation.ts L492-546 — *全部のクラスの Analyzed を Resolved へ。analysis が null は飛ばす*
  - `handler.resolve(clazz, analysis, symbol)` — compiler-entry の章 — *スコープ・テンプレートの照合。data と診断と reexports*
- `typeCheck` / `index` / `updateResources` — typecheck-context の章 / L603-620 / L641-658 — *別の道*
- `ivyTransformFactory`（emit のとき） — 第 12 回
  - `IvyCompilationVisitor` → `TraitCompiler.compile(clazz, constantPool)` — L660-735 — *ConstantPool はファイルごとに 1 つ*
    - `compileLocal` / `compilePartial` / `compileFull` — L686-706 — *compilationMode で選ぶ*
    - `CompileResult[]`（name・initializer・statements・type・deferrableImports） — api.ts L276-282 — *同じ名前は先の 1 つ*
  - `IvyTransformationVisitor` → `TraitCompiler.decoratorsFor(clazz)` — L765-786 — *Resolved の trait のデコレーターを消す*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| transform/test/compilation\_spec.ts | describe `compilation mode`（114 行目）の it `should run partial compilation when implemented if compilation mode is partial`（254）・`should run local compilation when compilation mode is local`（279）・`should run full compilation if compilation mode is full`（304）。describe `local compilation`（336）の it ``should invoke `resolve` phase``（388）・``should invoke `register` phase``（402）・`should not call updateResources`（416） | `//packages/compiler-cli/src/ngtsc/transform/test:test` |
| test/ngtsc/local\_compilation\_spec.ts | describe `local compilation`（24 行目）。出力の形（`ɵɵgetComponentDepsFactory` など）は [standalone-local-compilation の章](../standalone/06-standalone-local-compilation.md)で読みました | `//packages/compiler-cli/test/ngtsc:ngtsc` |

📄 `angular/packages/compiler-cli/src/ngtsc/transform/test/compilation_spec.ts` L254–277 （▶ の行: 261–262, 269, 271, 274, 276）

```ts
254 │       it('should run partial compilation when implemented if compilation mode is partial', () => {
255 │         const contents = `
256 │           export class Full {}
257 │           export class Partial {}
258 │         `;
259 │         const {compiler, sourceFile, program, filename} = setup(
260 │           contents,
261 ▶           [new PartialDecoratorHandler(), new FullDecoratorHandler()],
262 ▶           CompilationMode.PARTIAL,
263 │         );
264 │ 
265 │         compiler.analyzeSync(sourceFile);
266 │         compiler.resolve();
267 │ 
268 │         const partialDecl = getDeclaration(program, filename, 'Partial', isNamedClassDeclaration);
269 ▶         const partialResult = compiler.compile(partialDecl, new ConstantPool())!;
270 │         expect(partialResult.length).toBe(1);
271 ▶         expect(partialResult[0].name).toBe('compilePartial');
272 │ 
273 │         const fullDecl = getDeclaration(program, filename, 'Full', isNamedClassDeclaration);
274 ▶         const fullResult = compiler.compile(fullDecl, new ConstantPool())!;
275 │         expect(fullResult.length).toBe(1);
276 ▶         expect(fullResult[0].name).toBe('compileFull');
277 │       });
```

`PartialDecoratorHandler` は `compilePartial` を持ち、`FullDecoratorHandler` は持ちません（どちらも `name` がメソッドの名前の CompileResult を返す偽の handler）。PARTIAL で compile すると、271 行目で compilePartial、276 行目で compileFull が選ばれます。3 節 701〜706 行目のとおりです。各 compile に `new ConstantPool()`（269 行目）を渡しているのは、spec では pool の共有を確かめていないからです。

📄 `angular/packages/compiler-cli/src/ngtsc/transform/test/compilation_spec.ts` L416–434 （▶ の行: 425, 429–431, 433）

```ts
416 │       it('should not call updateResources', () => {
417 │         const contents = `
418 │           export class Test {}
419 │         `;
420 │         const handler = new TestDecoratorHandler();
421 │         spyOn(handler, 'updateResources');
422 │         const {compiler, sourceFile, program, filename} = setup(
423 │           contents,
424 │           [handler],
425 ▶           CompilationMode.LOCAL,
426 │         );
427 │         const decl = getDeclaration(program, filename, 'Test', isNamedClassDeclaration);
428 │ 
429 ▶         compiler.analyzeSync(sourceFile);
430 ▶         compiler.resolve();
431 ▶         compiler.updateResources(decl);
432 │ 
433 ▶         expect(handler.updateResources).not.toHaveBeenCalled();
434 │       });
```

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/transform/test:test \
  --nocache_test_results --test_output=all '--test_arg=--filter=compilation mode'
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc \
  --nocache_test_results --test_output=all '--test_arg=--filter=local compilation'
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/ngtsc-logs/b-transform-mode.log・b-ngtsc-local.log）`

```
Ran 12 of 36 specs
12 specs, 0 failures
//packages/compiler-cli/src/ngtsc/transform/test:test                    PASSED in 0.5s
INFO: Elapsed time: 0.641s

（shard 1・3）Ran 73 of 6523 specs / 73 specs, 0 failures
（shard 2・4）Ran 79 of 6529 specs / 79 specs, 0 failures
//packages/compiler-cli/test/ngtsc:ngtsc                                 PASSED in 3.1s
INFO: Elapsed time: 3.372s
```

- `compilation mode` の 12 件は、it 3 つ × `runInEachFileSystem` の 4 つの仮のファイルシステムです。
- 結合テストの `local compilation` は、shard 1 と 3 が「Ran 73 of 6523」、shard 2 と 4 が「Ran 79 of 6529」でした。filter は spec の名前の部分一致なので、local\_compilation\_spec.ts の外の名前に「local compilation」を含む it も数に入ります。shard ごとに数が違う理由は、この出力からは分かりません。

### 直すとしたら

- どのメソッドを選ぶかは compilation.ts の `compile`、Resolved に進む条件は `resolve`、消すデコレーターは `decoratorsFor` です。it は compilation\_spec.ts の describe `compilation mode` の形（偽の handler を並べ、`analyzeSync` → `resolve` → `compile` で CompileResult の `name` を見る）で足せます。出力の形そのものは handler と @angular/compiler の側で、compliance テスト（`packages/compiler-cli/test/compliance/`）が確かめています。
- 2025-11 以降、compilation.ts の resolve・compile の行を直したコミットはありません（`git log --since=2025-11-01 -- packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` は 7f0265e43ab の analyzeTrait の変更（[第 7 回](07-ngtsc-trait-analyze.md)）など）。この 2 つの関数の issue を読むときは、「analyze で失敗して Analyzed のまま（出力もデコレーターの削除も無い）」なのか、「resolve で失敗して Resolved だが containsErrors で compile されない」なのかを、2 節と 3 節で分けます。本家に PR を出すことは勧めません（[第 20 回](20-ngtsc-issues.md)）。

## 聞かれそうな質問

**Q. analyze と resolve は何が違うのですか？なぜ 2 段に分かれているのですか？**

analyze はそのクラスのファイルの中だけで決まることを集め、resolve は全部の analyze が済んでから、ほかのクラスの情報（スコープなど）を使って仕上げます（api.ts 161〜163 行目）。分けておくと、差分ビルドで変わっていないファイルの analyze を使い回し、resolve だけをやり直せます。

**Q. resolve でエラーになったクラスは、出力されますか？**

されません。resolve の FatalDiagnosticError は 524〜526 行目で「診断あり」の Resolved になり、compile は 677〜680 行目で、エラーの診断がある trait を飛ばします。ただし Resolved なので、そのデコレーターは decoratorsFor で消されます（776 行目）。

**Q. partial のときに ConstantPool が使われないのはなぜですか？**

`compilePartial` は ConstantPool を受け取りません（api.ts 212〜216 行目）。partial の出力はテンプレートを文字列のまま `ɵɵngDeclareComponent` に入れ、定数を外に出すのは、アプリのビルドで linker が full の形に直すときだからです。DEMO の partial の記録では、pool に足された文は 0 でした。

**Q. 同じ `[1, 2]` を 2 つのコンポーネントで書くと、定数は 2 つになりますか？**

同じファイルなら 1 つです。ConstantPool はファイルごとに 1 つで、`getSharedConstant` は同じ key なら同じ変数を返します（156〜162 行目）。DEMO の `Widget` と `Second` は、どちらも `_c0` を使っています。別のファイルなら、それぞれに `_c0` ができます。

**Q. 1 つのクラスに @Directive と @Injectable があると、ɵfac は 2 つできますか？**

1 つです。Injectable の handler は、ほかの Angular のデコレーターがあると `ɵfac` を作らず（injectable.ts の `needsFactory`）、`ɵprov` だけを返します。それでも同じ名前が重なれば、715〜724 行目で先に来た方（handler の並びで先の、PRIMARY の Directive）だけが残ります。

## 読み終えて

- resolve は全部の analyze のあとに、全部のクラスの Analyzed の trait を Resolved にする。analysis が null の trait は Analyzed のまま残る。
- resolve の失敗は「診断ありの Resolved」。compile は analysis と resolve のどちらかにエラーの診断があれば飛ばす。
- compile は compilationMode で compileLocal・compilePartial（無ければ compileFull）・compileFull を選び、同じ名前の CompileResult は 1 つにする。
- ConstantPool はファイルごとに 1 つで、同じ式の定数はコンポーネントをまたいで共有される。partial は pool を使わない。
- decoratorsFor は Resolved の trait の trigger のデコレーターを返し、2 回目の訪問がそれをクラスから消す。

---

← 前: [TraitCompiler（1）：デコレーターを見つけて解析する](07-ngtsc-trait-analyze.md)  
次: [DirectiveDecoratorHandler：@Directive を解析する](09-ngtsc-directive-handler.md) →
