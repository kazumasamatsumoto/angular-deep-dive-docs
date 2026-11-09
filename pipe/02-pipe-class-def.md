[目次](../README.md) › [パイプを書くと何を宣言したことになるか](README.md) › 第 2 回 / 全 6 回

# @Pipe が作るもの：ɵpipe と ɵfac、AOT と JIT と部分コンパイル

> @Pipe を付けたクラスに、コンパイラが static な ɵpipe（ɵɵdefinePipe）と ɵfac を足す行（r3\_pipe\_compiler.ts）。PipeDef の name・pure・standalone・factory・onDestroy の既定と読み手。JIT の compilePipe、ライブラリの部分コンパイル（ɵɵngDeclarePipe）とリンカーが同じ compilePipeFromMetadata に戻ることを記録と DEMO で確かめる。ɵfac の ɵɵdirectiveInject(…, 16) の 16（ForPipe）と、inject() にはそれが付かないこと（#50952）。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/pipe-class-def)

---

第 1 回の 4 つの約束のうち「依存」の相手、つまり `dependencies: [DatePipe]` に並ぶ **DatePipe というクラスの側**を読みます。この章では、`@Pipe({ name: 'date' })` と書いたことが、**クラスに 2 つの static な定義（`ɵpipe` と `ɵfac`）を持たせる宣言**だ、という部分を読みます。クラスはそれだけでは何にも登録されません。どこかのテンプレートが名前で探しに来たときに、この 2 つが読まれます。

読む対象は、定義を作る `packages/compiler/src/render3/r3_pipe_compiler.ts`（87 行、全部）、ngtsc の `packages/compiler-cli/src/ngtsc/annotations/src/pipe.ts` の残り、実行時の `packages/core/src/render3/definition.ts` の `ɵɵdefinePipe`、JIT の `packages/core/src/render3/jit/pipe.ts`、部分コンパイルの `packages/compiler/src/render3/partial/pipe.ts` とリンカーの `partial_pipe_linker_1.ts` です。PipeDecoratorHandler の `analyze`・`register` は [ngtsc-metadata-registry](../ngtsc/10-ngtsc-metadata-registry.md) が読んでいるので、ここではその結果（`R3PipeMetadata`）から先を読みます。

1. [1. 1 行の | が生むもの](01-pipe-what-declared.md)
2. **2. @Pipe が作るもの**（この章）
3. [3. 名前の解決](03-pipe-name-resolution.md)
4. [4. 書ける場所と書けない場所](04-pipe-where-allowed.md)
5. [5. インスタンスの数と寿命](05-pipe-instances-lifecycle.md)
6. [6. spec と issue](06-pipe-tests-issues.md)

## 1. 先に出力を見る：3 つの pipe をコンパイルする

書き方の違う pipe を 3 つ書き、このサイトの node\_modules の ngtsc でコンパイルしました（@angular/compiler-cli 22.1.6 / TypeScript 6.0.3。記録のスクリプトは[第 1 回](01-pipe-what-declared.md)の最後と同じ）。`PcdTrimPipe` は何も足さない形、`PcdLivePipe` は `pure: false` と `ngOnDestroy` とフィールドの `inject()`、`PcdOldPipe` は `standalone: false` とコンストラクタの引数です。

📄 `demo.ts（コンパイルしたもの）` L1–26 （▶ の行: 3, 10, 12, 16, 19, 21）

```
 1 │ import {ChangeDetectorRef, OnDestroy, Pipe, PipeTransform, inject} from '@angular/core';
 2 │ 
 3 ▶ @Pipe({name: 'pcdTrim'})
 4 │ export class PcdTrimPipe implements PipeTransform {
 5 │   transform(value: string): string {
 6 │     return value.trim();
 7 │   }
 8 │ }
 9 │ 
10 ▶ @Pipe({name: 'pcdLive', pure: false})
11 │ export class PcdLivePipe implements PipeTransform, OnDestroy {
12 ▶   private readonly cdr = inject(ChangeDetectorRef);
13 │   transform(value: number): number {
14 │     return value;
15 │   }
16 ▶   ngOnDestroy(): void {}
17 │ }
18 │ 
19 ▶ @Pipe({name: 'pcdOld', standalone: false})
20 │ export class PcdOldPipe implements PipeTransform {
21 ▶   constructor(private readonly cdr: ChangeDetectorRef) {}
22 │   transform(value: number): number {
23 │     return value;
24 │   }
25 │ }
26 │ 
```

📄 `out/demo.js（記録から static の行だけを抜き出し、改行と字下げを詰めた）` L1–12 （▶ の行: 2–3, 6–7, 10–11）

```
 1 │ export class PcdTrimPipe {
 2 ▶   static ɵfac = function PcdTrimPipe_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || PcdTrimPipe)(); };
 3 ▶   static ɵpipe = /*@__PURE__*/ i0.ɵɵdefinePipe({ name: "pcdTrim", type: PcdTrimPipe, pure: true });
 4 │ }
 5 │ export class PcdLivePipe {
 6 ▶   static ɵfac = function PcdLivePipe_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || PcdLivePipe)(); };
 7 ▶   static ɵpipe = /*@__PURE__*/ i0.ɵɵdefinePipe({ name: "pcdLive", type: PcdLivePipe, pure: false });
 8 │ }
 9 │ export class PcdOldPipe {
10 ▶   static ɵfac = function PcdOldPipe_Factory(__ngFactoryType__) { /* @ts-ignore */ return new (__ngFactoryType__ || PcdOldPipe)(i0.ɵɵdirectiveInject(i0.ChangeDetectorRef, 16)); };
11 ▶   static ɵpipe = /*@__PURE__*/ i0.ɵɵdefinePipe({ name: "pcdOld", type: PcdOldPipe, pure: true, standalone: false });
12 │ }
```

- どのクラスにも、`static ɵfac`（インスタンスを作る関数。factory）と `static ɵpipe`（`ɵɵdefinePipe({…})` が返す定義）の 2 つが足されています。**足されるのはこの 2 つだけ**で、どこかの一覧に自分を登録する行はありません。
- 3 行目：何も書かないと `name`・`type`・`pure: true` の 3 つ。`standalone` は書かれません。11 行目のように `standalone: false` のときだけ書かれます。
- 7 行目の `pure: false` は書いたとおり。`ngOnDestroy` は定義の文字のどこにも出てきません（実行時に `ɵɵdefinePipe` がクラスから読む。4 節）。
- 6 行目と 10 行目の `ɵfac` の違い：フィールドの `inject()` は ɵfac に出ず `new (…)()` のまま、コンストラクタの引数は `ɵɵdirectiveInject(i0.ChangeDetectorRef, 16)` になります（7 節）。

`.d.ts` の側には、同じ 2 つが**型**として書かれます。ほかのライブラリやアプリが、このクラスを pipe として読むときの手がかりです。

📄 `out/demo.d.ts（記録から抜き出し）` L1–12 （▶ の行: 3, 7, 11）

```
 1 │ export declare class PcdTrimPipe {
 2 │   static ɵfac: i0.ɵɵFactoryDeclaration<PcdTrimPipe, never>;
 3 ▶   static ɵpipe: i0.ɵɵPipeDeclaration<PcdTrimPipe, "pcdTrim", true>;
 4 │ }
 5 │ export declare class PcdLivePipe {
 6 │   static ɵfac: i0.ɵɵFactoryDeclaration<PcdLivePipe, never>;
 7 ▶   static ɵpipe: i0.ɵɵPipeDeclaration<PcdLivePipe, "pcdLive", true>;
 8 │ }
 9 │ export declare class PcdOldPipe {
10 │   static ɵfac: i0.ɵɵFactoryDeclaration<PcdOldPipe, never>;
11 ▶   static ɵpipe: i0.ɵɵPipeDeclaration<PcdOldPipe, "pcdOld", false>;
12 │ }
```

## 2. compilePipeFromMetadata：定義の式を作る

ngtsc の `analyze` は、デコレータの引数を読んで `R3PipeMetadata` という入れ物を作ります（[ngtsc-metadata-registry](../ngtsc/10-ngtsc-metadata-registry.md)）。その形です。

📄 `angular/packages/compiler/src/render3/r3_pipe_compiler.ts` L14–49 （▶ の行: 18, 23, 33, 38, 43, 48）

```ts
14 │ export interface R3PipeMetadata {
15 │   /**
16 │    * Name of the pipe type.
17 │    */
18 ▶   name: string;
19 │ 
20 │   /**
21 │    * An expression representing a reference to the pipe itself.
22 │    */
23 ▶   type: R3Reference;
24 │ 
25 │   /**
26 │    * Number of generic type parameters of the type itself.
27 │    */
28 │   typeArgumentCount: number;
29 │ 
30 │   /**
31 │    * Name of the pipe.
32 │    */
33 ▶   pipeName: string | null;
34 │ 
35 │   /**
36 │    * Dependencies of the pipe's constructor.
37 │    */
38 ▶   deps: R3DependencyMetadata[] | null;
39 │ 
40 │   /**
41 │    * Whether the pipe is marked as pure.
42 │    */
43 ▶   pure: boolean;
44 │ 
45 │   /**
46 │    * Whether the pipe is standalone.
47 │    */
48 ▶   isStandalone: boolean;
49 │ }
```

18 行目の `name` は**クラスの名前**（`PcdTrimPipe`）、33 行目の `pipeName` は**テンプレートで使う名前**（`pcdTrim`）で、別のものです。`pipeName` が `string | null` なのは、名前を持たない pipe を受け付けるためです（後述の 7fa3203ee76）。38 行目の `deps` はコンストラクタの引数で、ɵfac を作る側が使います。

📄 `angular/packages/compiler/src/render3/r3_pipe_compiler.ts` L51–77 （▶ の行: 57, 62, 65, 67–68, 71–74）

```ts
51 │ export function compilePipeFromMetadata(metadata: R3PipeMetadata): R3CompiledExpression {
52 │   const definitionMapValues: {key: string; quoted: boolean; value: o.Expression}[] = [];
53 │ 
54 │   // e.g. `name: 'myPipe'`
55 │   definitionMapValues.push({
56 │     key: 'name',
57 ▶     value: o.literal(metadata.pipeName ?? metadata.name),
58 │     quoted: false,
59 │   });
60 │ 
61 │   // e.g. `type: MyPipe`
62 ▶   definitionMapValues.push({key: 'type', value: metadata.type.value, quoted: false});
63 │ 
64 │   // e.g. `pure: true`
65 ▶   definitionMapValues.push({key: 'pure', value: o.literal(metadata.pure), quoted: false});
66 │ 
67 ▶   if (metadata.isStandalone === false) {
68 ▶     definitionMapValues.push({key: 'standalone', value: o.literal(false), quoted: false});
69 │   }
70 │ 
71 ▶   const expression = o
72 ▶     .importExpr(R3.definePipe)
73 ▶     .callFn([o.literalMap(definitionMapValues)], undefined, true);
74 ▶   const type = createPipeType(metadata);
75 │ 
76 │   return {expression, type, statements: []};
77 │ }
```

1. **57 行目：name**

   `pipeName ?? name`。テンプレートの名前が無ければクラスの名前を使います。
2. **62・65 行目：type と pure**

   `type` はクラスそのものへの参照、`pure` は true でも false でも必ず書きます（1 節の 3 行目の `pure: true`）。
3. **67〜69 行目：standalone は false のときだけ**

   実行時の既定が true なので、true のときは書きません（4 節。2024 年の a10f7cfbc26 がこの形にした）。
4. **71〜73 行目：`ɵɵdefinePipe({…})` の呼び出し**

   `callFn` の 3 つ目の `true` は「この呼び出しには副作用が無い」という印で、出力の `/*@__PURE__*/` になります。使われない pipe を、バンドラーが消せるようにするためです。
5. **74 行目：型**

   下の `createPipeType` が、.d.ts に書く型を作ります。

📄 `angular/packages/compiler/src/render3/r3_pipe_compiler.ts` L79–87 （▶ の行: 81–84）

```ts
79 │ export function createPipeType(metadata: R3PipeMetadata): o.Type {
80 │   return new o.ExpressionType(
81 ▶     o.importExpr(R3.PipeDeclaration, [
82 ▶       typeWithParameters(metadata.type.type, metadata.typeArgumentCount),
83 ▶       new o.ExpressionType(new o.LiteralExpr(metadata.pipeName)),
84 ▶       new o.ExpressionType(new o.LiteralExpr(metadata.isStandalone)),
85 │     ]),
86 │   );
87 │ }
```

81〜84 行目：`ɵɵPipeDeclaration<クラス, "名前", standalone か>`。1 節の .d.ts の 3 行目 `ɵɵPipeDeclaration<PcdTrimPipe, "pcdTrim", true>` がこれです。ライブラリの .d.ts からは、ngtsc がこの型引数を読み戻して PipeMeta（名前・standalone か）を作ります（[ngtsc-metadata-registry](../ngtsc/10-ngtsc-metadata-registry.md)）。

## 3. ngtsc：3 つのコンパイルの形

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/pipe.ts` L84–103 （▶ の行: 99, 101–102）

```ts
 84 │ export class PipeDecoratorHandler implements DecoratorHandler<
 85 │   Decorator,
 86 │   PipeHandlerData,
 87 │   PipeSymbol,
 88 │   unknown
 89 │ > {
 90 │   constructor(
 91 │     private reflector: ReflectionHost,
 92 │     private evaluator: PartialEvaluator,
 93 │     private metaRegistry: MetadataRegistry,
 94 │     private scopeRegistry: LocalModuleScopeRegistry,
 95 │     private injectableRegistry: InjectableClassRegistry,
 96 │     private isCore: boolean,
 97 │     private perf: PerfRecorder,
 98 │     private includeClassMetadata: boolean,
 99 ▶     private readonly compilationMode: CompilationMode,
100 │     private readonly generateExtraImportsInLocalMode: boolean,
101 ▶     private readonly strictStandalone: boolean,
102 ▶     private readonly implicitStandaloneValue: boolean,
103 │   ) {}
```

102 行目の `implicitStandaloneValue` が「standalone を書かなかったときの値」です。NgCompiler が `@angular/core` の版を見て、19.0.0 以上なら true を渡します （[ngmodule-to-standalone](../ngmodule/18-ngmodule-to-standalone.md) が読んでいる 482〜484 行目）。101 行目の `strictStandalone` は、`standalone: false` をエラーにするオプションです。99 行目の `compilationMode` で、次の 3 つのどれを呼ぶかが決まります。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/pipe.ts` L288–308 （▶ の行: 290–291, 300–301, 306）

```ts
288 │ 
289 │   compilePartial(node: ClassDeclaration, analysis: Readonly<PipeHandlerData>): CompileResult[] {
290 ▶     const fac = compileDeclareFactory(toFactoryMetadata(analysis.meta, FactoryTarget.Pipe));
291 ▶     const def = compileDeclarePipeFromMetadata(analysis.meta);
292 │     const classMetadata =
293 │       analysis.classMetadata !== null
294 │         ? compileDeclareClassMetadata(analysis.classMetadata).toStmt()
295 │         : null;
296 │     return compileResults(fac, def, classMetadata, 'ɵpipe', null, null /* deferrableImports */);
297 │   }
298 │ 
299 │   compileLocal(node: ClassDeclaration, analysis: Readonly<PipeHandlerData>): CompileResult[] {
300 ▶     const fac = compileNgFactoryDefField(toFactoryMetadata(analysis.meta, FactoryTarget.Pipe));
301 ▶     const def = compilePipeFromMetadata(analysis.meta);
302 │     const classMetadata =
303 │       analysis.classMetadata !== null
304 │         ? compileClassMetadata(analysis.classMetadata).toStmt()
305 │         : null;
306 ▶     return compileResults(fac, def, classMetadata, 'ɵpipe', null, null /* deferrableImports */);
307 │   }
308 │ }
```

- **compileFull**（このすぐ上の 279〜287 行目。[ngtsc-metadata-registry](../ngtsc/10-ngtsc-metadata-registry.md) で引用）：アプリのビルド。`compilePipeFromMetadata` で `ɵɵdefinePipe`。
- **compilePartial**（290・291 行目）：ライブラリを npm に出すときの形。`compileDeclareFactory` と `compileDeclarePipeFromMetadata` で、`ɵɵngDeclareFactory` と `ɵɵngDeclarePipe` を書きます（6 節）。
- **compileLocal**（300・301 行目）：ファイルを 1 つずつ見るローカルコンパイル（[standalone-local-compilation](../standalone/06-standalone-local-compilation.md)）。pipe の定義はほかのファイルを見なくても作れるので、full と同じ関数です。
- 306 行目：3 つとも `compileResults(fac, def, …, 'ɵpipe', …)` で、「クラスに `ɵfac` と `ɵpipe` の 2 つの static を足す」という結果にまとめます。

> [!NOTE]
> **さらに深く**
>
> 2026-08-19 の 74b294cd51b（fix(compiler-cli): retain metadata for strict standalone errors）は、`analyze` の strictStandalone の行を変えました。それまでは `throw new FatalDiagnosticError(…)` で analyze ごと止めていたため、pipe のメタデータが登録されず、その pipe を使うテンプレートにも別のエラーが重なっていました。変更後は診断を `diagnostics` に入れて返し、`analysis`（メタデータ）は残します。

📄 `git -C ../angular show 74b294cd51b -- packages/compiler-cli/src/ngtsc/annotations/src/pipe.ts（抜粋）`

```
         if (!isStandalone && this.strictStandalone) {
-          throw new FatalDiagnosticError(
-            ErrorCode.NON_STANDALONE_NOT_ALLOWED,
-            expr,
-            `Only standalone pipes are allowed when 'strictStandalone' is enabled.`,
-          );
+          diagnostics = [
+            makeDiagnostic(
+              ErrorCode.NON_STANDALONE_NOT_ALLOWED,
+              expr,
+              `Only standalone pipes are allowed when 'strictStandalone' is enabled.`,
+            ),
+          ];
         }
       }
     }

     return {
+      diagnostics,
       analysis: {
```

同じコミットが `packages/compiler-cli/test/ngtsc/standalone_spec.ts` に it `should retain metadata for non-standalone declarations` を足しました。`standalone: false` のコンポーネントと pipe を NgModule で宣言して standalone のコンポーネントから使い、診断が `NON_STANDALONE_NOT_ALLOWED` の 2 つ**だけ**であることを確かめています。

## 4. 実行時：ɵɵdefinePipe が PipeDef を作る

出力の `ɵɵdefinePipe({…})` は、クラスが読み込まれたときに 1 回だけ実行されます。

📄 `angular/packages/core/src/render3/definition.ts` L593–613 （▶ の行: 593, 601, 606, 608, 611–613）

```ts
593 ▶ export function ɵɵdefinePipe<T>(pipeDef: {
594 │   /** Name of the pipe. Used for matching pipes in template to pipe defs. */
595 │   name: string;
596 │ 
597 │   /** Pipe class reference. Needed to extract pipe lifecycle hooks. */
598 │   type: Type<T>;
599 │ 
600 │   /** Whether the pipe is pure. */
601 ▶   pure?: boolean;
602 │ 
603 │   /**
604 │    * Whether the pipe is standalone.
605 │    */
606 ▶   standalone?: boolean;
607 │ }): PipeDef<T> {
608 ▶   return {
609 │     type: pipeDef.type,
610 │     name: pipeDef.name,
611 ▶     factory: null,
612 ▶     pure: pipeDef.pure !== false,
613 ▶     standalone: pipeDef.standalone ?? true,
```

1. **601・606 行目：受け取る pure と standalone は省略できる**

   2 節の出力が書かないことがあるのは、ここで既定を決めるからです。
2. **611 行目：factory は null**

   インスタンスを作る関数は、まだ入れません。テンプレートの `ɵɵpipe` が初めてこの pipe を使うとき、クラスの `ɵfac` を読んで入れます（[cmn-pipe-mechanism](../cmn/06-cmn-pipe-mechanism.md) 3 節の pipe.ts 58 行目）。DEMO 1 で確かめられます。
3. **612 行目：`pure !== false`**

   書かなければ pure です。
4. **613 行目：`standalone ?? true`**

   書かなければ standalone です。2 節の 67〜69 行目と対になっています。

この次の行で、`onDestroy` に **クラスの `prototype.ngOnDestroy`**（無ければ null）を入れます（その行を含む 607〜616 行目は [ngmodule-to-standalone](../ngmodule/18-ngmodule-to-standalone.md) が引用）。1 節の出力に ngOnDestroy が出てこないのは、実行時にクラスから直接読むからです。できあがる型は次のとおりです。

📄 `angular/packages/core/src/render3/interfaces/definition.ts` L432–464 （▶ の行: 434, 441, 447, 455, 460, 463）

```ts
432 │ export interface PipeDef<T> {
433 │   /** Token representing the pipe. */
434 ▶   type: Type<T> | AbstractType<T>;
435 │ 
436 │   /**
437 │    * Pipe name.
438 │    *
439 │    * Used to resolve pipe in templates.
440 │    */
441 ▶   readonly name: string;
442 │ 
443 │   /**
444 │    * Factory function used to create a new pipe instance. Will be null initially.
445 │    * Populated when the factory is first requested by pipe instantiation logic.
446 │    */
447 ▶   factory: FactoryFn<T> | null;
448 │ 
449 │   /**
450 │    * Whether or not the pipe is pure.
451 │    *
452 │    * Pure pipes result only depends on the pipe input and not on internal
453 │    * state of the pipe.
454 │    */
455 ▶   readonly pure: boolean;
456 │ 
457 │   /**
458 │    * Whether this pipe is standalone.
459 │    */
460 ▶   readonly standalone: boolean;
461 │ 
462 │   /* The following are lifecycle hooks for this pipe */
463 ▶   onDestroy: (() => void) | null;
464 │ }
```

| PipeDef | 誰が読むか | 詳しくは |
| --- | --- | --- |
| `name`（441 行目） | `ɵɵpipe` の `getPipeDef` が、テンプレートの名前と比べる | [第 3 回](03-pipe-name-resolution.md) |
| `factory`（447 行目） | `ɵɵpipe` が最初に入れ、呼んでインスタンスを作る | [第 5 回](05-pipe-instances-lifecycle.md) |
| `pure`（455 行目） | `ɵɵpipeBindN` の `isPure`。前の答えを使うか | [cmn-pipe-mechanism](../cmn/06-cmn-pipe-mechanism.md) |
| `standalone`（460 行目） | imports に直接書けるか（ngtsc と JIT の検査） | [standalone-imports-check](../standalone/03-standalone-imports-check.md) |
| `onDestroy`（463 行目） | `ɵɵpipe` が TView の destroyHooks に登録する | [第 5 回](05-pipe-instances-lifecycle.md) |

2024-10-16 の a10f7cfbc26（refactor(core): Don't generate \`standalone: true\` for definitions）が、2 節と 4 節の「standalone を書くのは false のときだけ、既定は true」を同時に入れました。

📄 `git -C ../angular show a10f7cfbc26（2 つのファイルの抜粋）`

```
--- a/packages/compiler/src/render3/r3_pipe_compiler.ts
-  // TODO: standalone as default value (invert the condition)
-  if (metadata.isStandalone) {
-    definitionMapValues.push({key: 'standalone', value: o.literal(true), quoted: false});
+  if (metadata.isStandalone === false) {
+    definitionMapValues.push({key: 'standalone', value: o.literal(false), quoted: false});
   }
--- a/packages/core/src/render3/definition.ts
     pure: pipeDef.pure !== false,
-    standalone: pipeDef.standalone === true,
+    standalone: pipeDef.standalone ?? NG_STANDALONE_DEFAULT_VALUE,
     onDestroy: pipeDef.type.prototype.ngOnDestroy || null,
```

3 週間後の b35ecee85e5（refactor(core): clean up standalone flag）が `NG_STANDALONE_DEFAULT_VALUE` を `true` に置き換え、今の 613 行目になりました。

## 5. JIT：デコレータが getter を仕込む

AOT を使わない場合（テストの一部や、`@angular/compiler` を読み込んだアプリ）は、`@Pipe` のデコレータ自身が定義を作ります。

📄 `angular/packages/core/src/metadata/directives.ts` L746–765 （▶ の行: 759, 761, 764）

```ts
746 │   pure?: boolean;
747 │ 
748 │   /**
749 │    * Angular pipes marked as `standalone` do not need to be declared in an NgModule. Such
750 │    * pipes don't depend on any "intermediate context" of an NgModule (ex. configured providers).
751 │    */
752 │   standalone?: boolean;
753 │ }
754 │ 
755 │ /**
756 │  * @Annotation
757 │  * @publicApi
758 │  */
759 ▶ export const Pipe: PipeDecorator = makeDecorator(
760 │   'Pipe',
761 ▶   (p: Pipe) => ({pure: true, ...p}),
762 │   undefined,
763 │   undefined,
764 ▶   (type: Type<any>, meta: Pipe) => compilePipe(type, meta),
765 │ );
```

761 行目：デコレータの引数に `pure: true` を先に入れます。764 行目：クラスが定義されたときに `compilePipe(type, meta)` を呼びます。

📄 `angular/packages/core/src/render3/jit/pipe.ts` L21–47 （▶ の行: 25, 27, 34, 38–39, 45）

```ts
21 │ export function compilePipe(type: Type<any>, meta: Pipe): void {
22 │   let ngPipeDef: any = null;
23 │   let ngFactoryDef: any = null;
24 │ 
25 ▶   Object.defineProperty(type, NG_FACTORY_DEF, {
26 │     get: () => {
27 ▶       if (ngFactoryDef === null) {
28 │         const metadata = getPipeMetadata(type, meta);
29 │         const compiler = getCompilerFacade({
30 │           usage: JitCompilerUsage.Decorator,
31 │           kind: 'pipe',
32 │           type: metadata.type,
33 │         });
34 ▶         ngFactoryDef = compiler.compileFactory(angularCoreEnv, `ng:///${metadata.name}/ɵfac.js`, {
35 │           name: metadata.name,
36 │           type: metadata.type,
37 │           typeArgumentCount: 0,
38 ▶           deps: reflectDependencies(type),
39 ▶           target: compiler.FactoryTarget.Pipe,
40 │         });
41 │       }
42 │       return ngFactoryDef;
43 │     },
44 │     // Make the property configurable in dev mode to allow overriding in tests
45 ▶     configurable: !!ngDevMode,
46 │   });
47 │ 
```

📄 `angular/packages/core/src/render3/jit/pipe.ts` L48–78 （▶ の行: 48, 50, 57, 75–76）

```ts
48 ▶   Object.defineProperty(type, NG_PIPE_DEF, {
49 │     get: () => {
50 ▶       if (ngPipeDef === null) {
51 │         const metadata = getPipeMetadata(type, meta);
52 │         const compiler = getCompilerFacade({
53 │           usage: JitCompilerUsage.Decorator,
54 │           kind: 'pipe',
55 │           type: metadata.type,
56 │         });
57 ▶         ngPipeDef = compiler.compilePipe(
58 │           angularCoreEnv,
59 │           `ng:///${metadata.name}/ɵpipe.js`,
60 │           metadata,
61 │         );
62 │       }
63 │       return ngPipeDef;
64 │     },
65 │     // Make the property configurable in dev mode to allow overriding in tests
66 │     configurable: !!ngDevMode,
67 │   });
68 │ }
69 │ 
70 │ function getPipeMetadata(type: Type<any>, meta: Pipe): R3PipeMetadataFacade {
71 │   return {
72 │     type: type,
73 │     name: type.name,
74 │     pipeName: meta.name,
75 ▶     pure: meta.pure !== undefined ? meta.pure : true,
76 ▶     isStandalone: meta.standalone === undefined ? true : !!meta.standalone,
77 │   };
78 │ }
```

1. **25・48 行目：static のプロパティではなく getter**

   `ɵfac` と `ɵpipe` を `Object.defineProperty` の getter にします。クラスを定義した時点ではコンパイルしません。
2. **27・50 行目：初めて読まれたときに 1 回だけ**

   テンプレートの `ɵɵpipe` が `ɵpipe` を読んだとき、初めてコンパイラを呼び、結果を変数に覚えます。
3. **34・38 行目：ɵfac は reflectDependencies**

   コンストラクタの引数の型を、クラスに残っている情報（`ctorParameters` や TypeScript の `design:paramtypes`）から `ReflectionCapabilities` で読みます。AOT の 2 節の `deps` に当たるものを、実行時に集める形です。
4. **57 行目：ɵpipe は compiler.compilePipe**

   下の facade に、75・76 行目で既定（pure は true、standalone は true）を入れたメタデータを渡します。
5. **45 行目：開発モードでは差し替えられる**

   `configurable: !!ngDevMode`。TestBed が定義を上書きできるようにするためです。

📄 `angular/packages/compiler/src/jit_compiler_facade.ts` L121–147 （▶ の行: 126, 130, 135–136, 144–145）

```ts
121 │   compilePipe(
122 │     angularCoreEnv: CoreEnvironment,
123 │     sourceMapUrl: string,
124 │     facade: R3PipeMetadataFacade,
125 │   ): any {
126 ▶     const metadata: R3PipeMetadata = {
127 │       name: facade.name,
128 │       type: wrapReference(facade.type),
129 │       typeArgumentCount: 0,
130 ▶       deps: null,
131 │       pipeName: facade.pipeName,
132 │       pure: facade.pure,
133 │       isStandalone: facade.isStandalone,
134 │     };
135 ▶     const res = compilePipeFromMetadata(metadata);
136 ▶     return this.jitExpression(res.expression, angularCoreEnv, sourceMapUrl, []);
137 │   }
138 │ 
139 │   compilePipeDeclaration(
140 │     angularCoreEnv: CoreEnvironment,
141 │     sourceMapUrl: string,
142 │     declaration: R3DeclarePipeFacade,
143 │   ): any {
144 ▶     const meta = convertDeclarePipeFacadeToMetadata(declaration);
145 ▶     const res = compilePipeFromMetadata(meta);
146 │     return this.jitExpression(res.expression, angularCoreEnv, sourceMapUrl, []);
147 │   }
```

126〜134 行目：facade の値を AOT と同じ `R3PipeMetadata` に詰め直し、135 行目で **2 節と同じ `compilePipeFromMetadata`** を呼びます。136 行目の `jitExpression` は、その式を JS の文字列にして `new Function` で評価し、`ɵɵdefinePipe` を本当に呼んだ結果を返します。130 行目の `deps: null` は、ɵfac を別の getter（34 行目）で作るからです。

## 6. 部分コンパイルとリンカー：同じ定義に戻る

npm に出すライブラリは、Angular の版が変わっても使えるよう、定義を**「材料の一覧」**の形（部分宣言）で出します。アプリのビルドでリンカーがそれを読み、2 節の形に組み立て直します（[cli-linker](../cli/06-cli-linker.md)）。

📄 `angular/packages/compiler/src/render3/partial/pipe.ts` L16–35 （▶ の行: 23, 31–32）

```ts
16 │ /**
17 │  * Every time we make a breaking change to the declaration interface or partial-linker behavior, we
18 │  * must update this constant to prevent old partial-linkers from incorrectly processing the
19 │  * declaration.
20 │  *
21 │  * Do not include any prerelease in these versions as they are ignored.
22 │  */
23 ▶ const MINIMUM_PARTIAL_LINKER_VERSION = '14.0.0';
24 │ 
25 │ /**
26 │  * Compile a Pipe declaration defined by the `R3PipeMetadata`.
27 │  */
28 │ export function compileDeclarePipeFromMetadata(meta: R3PipeMetadata): R3CompiledExpression {
29 │   const definitionMap = createPipeDefinitionMap(meta);
30 │ 
31 ▶   const expression = o.importExpr(R3.declarePipe).callFn([definitionMap.toLiteralMap()]);
32 ▶   const type = createPipeType(meta);
33 │ 
34 │   return {expression, type, statements: []};
35 │ }
```

📄 `angular/packages/compiler/src/render3/partial/pipe.ts` L37–63 （▶ の行: 43–45, 50–51, 55, 57, 59）

```ts
37 │ /**
38 │  * Gathers the declaration fields for a Pipe into a `DefinitionMap`.
39 │  */
40 │ function createPipeDefinitionMap(meta: R3PipeMetadata): DefinitionMap<R3DeclarePipeMetadata> {
41 │   const definitionMap = new DefinitionMap<R3DeclarePipeMetadata>();
42 │ 
43 ▶   definitionMap.set('minVersion', o.literal(MINIMUM_PARTIAL_LINKER_VERSION));
44 ▶   definitionMap.set('version', o.literal('0.0.0-PLACEHOLDER'));
45 ▶   definitionMap.set('ngImport', o.importExpr(R3.core));
46 │ 
47 │   // e.g. `type: MyPipe`
48 │   definitionMap.set('type', meta.type.value);
49 │ 
50 ▶   if (meta.isStandalone !== undefined) {
51 ▶     definitionMap.set('isStandalone', o.literal(meta.isStandalone));
52 │   }
53 │ 
54 │   // e.g. `name: "myPipe"`
55 ▶   definitionMap.set('name', o.literal(meta.pipeName ?? meta.name));
56 │ 
57 ▶   if (meta.pure === false) {
58 │     // e.g. `pure: false`
59 ▶     definitionMap.set('pure', o.literal(meta.pure));
60 │   }
61 │ 
62 │   return definitionMap;
63 │ }
```

- 31 行目：呼ぶのは `ɵɵngDeclarePipe`。32 行目の型は 2 節と同じ `createPipeType` なので、.d.ts は full と同じです。
- 43 行目の `minVersion`（23 行目の 14.0.0）は「この宣言を読めるリンカーの最も古い版」、44 行目の `version` は書いたコンパイラの版です。ソースでは `'0.0.0-PLACEHOLDER'` で、配布物の `@angular/compiler` 22.1.6 ではこの行が `literal('22.1.6')` に置き換わっています（このサイトの node\_modules で確かめた）。
- 50〜51 行目：`isStandalone` は、値があれば true でも書きます（ngtsc は常に値を渡す）。57〜60 行目：`pure` は false のときだけです。

📄 `out/demo.js（compilationMode: 'partial' の記録。static の行だけ）` L1–12 （▶ の行: 3, 7, 11）

```
 1 │ export class PcdTrimPipe {
 2 │   static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "22.1.6", ngImport: i0, type: PcdTrimPipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe });
 3 ▶   static ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "22.1.6", ngImport: i0, type: PcdTrimPipe, isStandalone: true, name: "pcdTrim" });
 4 │ }
 5 │ export class PcdLivePipe {
 6 │   static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "22.1.6", ngImport: i0, type: PcdLivePipe, deps: [], target: i0.ɵɵFactoryTarget.Pipe });
 7 ▶   static ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "22.1.6", ngImport: i0, type: PcdLivePipe, isStandalone: true, name: "pcdLive", pure: false });
 8 │ }
 9 │ export class PcdOldPipe {
10 │   static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "22.1.6", ngImport: i0, type: PcdOldPipe, deps: [{ token: i0.ChangeDetectorRef }], target: i0.ɵɵFactoryTarget.Pipe });
11 ▶   static ɵpipe = i0.ɵɵngDeclarePipe({ minVersion: "14.0.0", version: "22.1.6", ngImport: i0, type: PcdOldPipe, isStandalone: false, name: "pcdOld" });
12 │ }
```

リンカーの側です。

📄 `angular/packages/compiler-cli/linker/src/file_linker/partial_linkers/partial_pipe_linker_1.ts` L23–37 （▶ の行: 29, 34–35）

```ts
23 │ /**
24 │  * A `PartialLinker` that is designed to process `ɵɵngDeclarePipe()` call expressions.
25 │  */
26 │ export class PartialPipeLinkerVersion1<TExpression> implements PartialLinker<TExpression> {
27 │   constructor() {}
28 │ 
29 ▶   linkPartialDeclaration(
30 │     constantPool: ConstantPool,
31 │     metaObj: AstObject<R3PartialDeclaration, TExpression>,
32 │     version: string,
33 │   ): LinkedDefinition {
34 ▶     const meta = toR3PipeMeta(metaObj, version);
35 ▶     return compilePipeFromMetadata(meta);
36 │   }
37 │ }
```

📄 `angular/packages/compiler-cli/linker/src/file_linker/partial_linkers/partial_pipe_linker_1.ts` L39–69 （▶ の行: 47, 55–58, 64–65）

```ts
39 │ /**
40 │  * Derives the `R3PipeMetadata` structure from the AST object.
41 │  */
42 │ export function toR3PipeMeta<TExpression>(
43 │   metaObj: AstObject<R3DeclarePipeMetadata, TExpression>,
44 │   version: string,
45 │ ): R3PipeMetadata {
46 │   const typeExpr = metaObj.getValue('type');
47 ▶   const typeName = typeExpr.getSymbolName();
48 │   if (typeName === null) {
49 │     throw new FatalLinkerError(
50 │       typeExpr.expression,
51 │       'Unsupported type, its name could not be determined',
52 │     );
53 │   }
54 │ 
55 ▶   const pure = metaObj.has('pure') ? metaObj.getBoolean('pure') : true;
56 ▶   const isStandalone = metaObj.has('isStandalone')
57 ▶     ? metaObj.getBoolean('isStandalone')
58 ▶     : getDefaultStandaloneValue(version);
59 │ 
60 │   return {
61 │     name: typeName,
62 │     type: wrapReference(typeExpr.getOpaque()),
63 │     typeArgumentCount: 0,
64 ▶     deps: null,
65 ▶     pipeName: metaObj.getString('name'),
66 │     pure,
67 │     isStandalone,
68 │   };
69 │ }
```

📄 `angular/packages/compiler-cli/linker/src/file_linker/partial_linkers/util.ts` L117–124 （▶ の行: 118, 122–123）

```ts
117 │ 
118 ▶ const STANDALONE_IS_DEFAULT_RANGE = new semver.Range(`>= 19.0.0 || ${PLACEHOLDER_VERSION}`, {
119 │   includePrerelease: true,
120 │ });
121 │ 
122 ▶ export function getDefaultStandaloneValue(version: string): boolean {
123 ▶   return STANDALONE_IS_DEFAULT_RANGE.test(version);
124 │ }
```

1. **34 行目：材料から R3PipeMetadata を作り直す**

   47 行目でクラスの名前、65 行目でテンプレートの名前を読みます。
2. **55 行目：pure が書かれていなければ true**
3. **56〜58 行目：isStandalone が書かれていなければ、版で決める**

   118 行目の範囲（19.0.0 以上か `0.0.0-PLACEHOLDER`）なら true。v18 以前のライブラリの宣言は、standalone を書かなければ false でした。
4. **64 行目：deps は null**

   ɵfac は別の `ɵɵngDeclareFactory` とその linker が組み立てるので、ここでは要りません。
5. **35 行目：2 節と同じ compilePipeFromMetadata**

   だから**リンクした結果は、full でコンパイルした結果と同じ**になります。

📄 `部分コンパイルの出力を Babel のリンカープラグインに通した記録（static の行だけ）` L1–12 （▶ の行: 2–3, 6–7, 10–11）

```
 1 │ export class PcdTrimPipe {
 2 ▶   static ɵfac = function PcdTrimPipe_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || PcdTrimPipe)(); };
 3 ▶   static ɵpipe = /*@__PURE__*/ i0.ɵɵdefinePipe({ name: "pcdTrim", type: PcdTrimPipe, pure: true });
 4 │ }
 5 │ export class PcdLivePipe {
 6 ▶   static ɵfac = function PcdLivePipe_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || PcdLivePipe)(); };
 7 ▶   static ɵpipe = /*@__PURE__*/ i0.ɵɵdefinePipe({ name: "pcdLive", type: PcdLivePipe, pure: false });
 8 │ }
 9 │ export class PcdOldPipe {
10 ▶   static ɵfac = function PcdOldPipe_Factory(__ngFactoryType__) { /* @ts-ignore */ return new (__ngFactoryType__ || PcdOldPipe)(i0.ɵɵdirectiveInject(i0.ChangeDetectorRef, 16)); };
11 ▶   static ɵpipe = /*@__PURE__*/ i0.ɵɵdefinePipe({ name: "pcdOld", type: PcdOldPipe, pure: true, standalone: false });
12 │ }
```

1 節の full の出力と 1 文字ずつ比べると：**同じ**（改行と字下げを詰めたあと。この判定はページを開いたときに、記録の 2 つの文字列で計算しています）。

リンカーを通さずに部分宣言のまま実行された場合（JIT で動くテストなど）は、`ɵɵngDeclarePipe` そのものが実行時に呼ばれます。

📄 `angular/packages/core/src/render3/jit/partial.ts` L200–212 （▶ の行: 205, 211）

```ts
200 │ /**
201 │  * Compiles a partial pipe declaration object into a full pipe definition object.
202 │  *
203 │  * @codeGenApi
204 │  */
205 ▶ export function ɵɵngDeclarePipe(decl: R3DeclarePipeFacade): unknown {
206 │   const compiler = getCompilerFacade({
207 │     usage: JitCompilerUsage.PartialDeclaration,
208 │     kind: 'pipe',
209 │     type: decl.type,
210 │   });
211 ▶   return compiler.compilePipeDeclaration(angularCoreEnv, `ng:///${decl.type.name}/ɵpipe.js`, decl);
212 │ }
```

📄 `angular/packages/compiler/src/jit_compiler_facade.ts` L1069–1080 （▶ の行: 1076–1078）

```ts
1069 │ function convertDeclarePipeFacadeToMetadata(declaration: R3DeclarePipeFacade): R3PipeMetadata {
1070 │   return {
1071 │     name: declaration.type.name,
1072 │     type: wrapReference(declaration.type),
1073 │     typeArgumentCount: 0,
1074 │     pipeName: declaration.name,
1075 │     deps: null,
1076 ▶     pure: declaration.pure ?? true,
1077 ▶     isStandalone:
1078 ▶       declaration.isStandalone ?? getJitStandaloneDefaultForVersion(declaration.version),
1079 │   };
1080 │ }
```

📄 `angular/packages/compiler/src/util.ts` L137–151 （▶ の行: 140, 144, 150）

```ts
137 │ const V1_TO_18 = /^([1-9]|1[0-8])\./;
138 │ 
139 │ export function getJitStandaloneDefaultForVersion(version: string): boolean {
140 ▶   if (version.startsWith('0.')) {
141 │     // 0.0.0 is always "latest", default is true.
142 │     return true;
143 │   }
144 ▶   if (V1_TO_18.test(version)) {
145 │     // Angular v2 - v18 default is false.
146 │     return false;
147 │   }
148 │ 
149 │   // All other Angular versions (v19+) default to true.
150 ▶   return true;
151 │ }
```

211 行目で facade の `compilePipeDeclaration`（5 節の 139〜147 行目）を呼び、1076〜1078 行目で既定を入れ、また `compilePipeFromMetadata` に戻ります。standalone の既定は、リンカーの semver の範囲と同じ答えを、140〜150 行目の文字列の比べで出します（`0.` で始まれば true、1〜18 なら false、それ以外は true）。

| 道 | 定義を作る関数 | standalone を書かないとき | pure を書かないとき |
| --- | --- | --- | --- |
| AOT（full・local） | compilePipeFromMetadata（r3\_pipe\_compiler.ts 51） | ngtsc の implicitStandaloneValue（core が 19 以上なら true） | true（ngtsc の analyze） |
| 部分 → リンカー | 同じ（linker 35） | 宣言の version が 19 以上なら true（util.ts 118） | true（linker 55） |
| 部分 → 実行時の ɵɵngDeclarePipe | 同じ（facade 145） | version が 1〜18 なら false、それ以外 true（util.ts 144・150） | true（facade 1076） |
| JIT の @Pipe | 同じ（facade 135） | true（jit/pipe.ts 76） | true（jit/pipe.ts 75・directives.ts 761） |
| 実行時の最後 | ɵɵdefinePipe（definition.ts 593） | true（613） | true（612） |

## 7. ɵfac：pipe のコンストラクタの DI

1 節の 10 行目の `ɵɵdirectiveInject(i0.ChangeDetectorRef, 16)` の形は [di-factory](../di/04-di-factory.md) が読んでいる `r3_factory.ts` で決まります。ファクトリの対象（`FactoryTarget`）が Pipe だと、注入の関数は `ɵɵdirectiveInject` になり（同じファイル 335 行目）、**どの引数にも**`InjectFlags.ForPipe`（`0b10000` = 16。251 行目）が足されます。core でこの印を読むのは、ChangeDetectorRef を作る `injectChangeDetectorRef`（`change_detection/change_detector_ref.ts` 126 行目）だけです。pipe を書いた要素がコンポーネントの host のとき、印があれば「pipe を書いた側のビュー」の ChangeDetectorRef、無ければ host のコンポーネント自身のビューのものを返します。詳しくは[第 5 回](05-pipe-instances-lifecycle.md)で確かめます。

6 行目の `PcdLivePipe` の `inject(ChangeDetectorRef)` は ɵfac に出ません。`new PcdLivePipe()` を実行している最中にフィールドの初期化として呼ばれ、そのとき `ɵɵpipe` が注入の関数を `ɵɵdirectiveInject` に切り替えているので、同じ関数に届きます（[di-inject-function](../di/02-di-inject-function.md) が読んでいる pipe.ts 67〜73 行目）。ただし `inject()` は ForPipe の印を付けません。このため、コンポーネントの host の要素のバインディング（`<child [v]="x | pcdLive">`）で使うと、コンストラクタで受け取った場合と違う ChangeDetectorRef が返ります。この章の記録のスクリプトとは別に、JIT の部品を platform-server で 1 回描いて確かめると、コンストラクタの引数は親（Root）のビュー、`inject()` は子（Child）のビューのものでした（`<p>` の補間で使ったときはどちらも Root）。この違いは issue #50952（inject() vs constructor injection inconsistency for Pipes。2023 年から open、ラベル core: di・P3）として報告されていて、#59868 はその重複として閉じられています。

## 8. ここまでを 1 本に

- 👤 `@Pipe({name: 'pcdTrim'}) class PcdTrimPipe` — あなたのクラス
- `PipeDecoratorHandler.analyze` → `R3PipeMetadata` — ngtsc annotations/src/pipe.ts — *ngtsc-metadata-registry の章*
- `compileFull` → `compilePipeFromMetadata` — r3\_pipe\_compiler.ts L51-77 — *ɵɵdefinePipe({name, type, pure})*
  - `createPipeType` — L79-87 — *.d.ts の ɵɵPipeDeclaration*
- `compilePartial` → `compileDeclarePipeFromMetadata` — partial/pipe.ts L28-63 — *ɵɵngDeclarePipe({minVersion, version, …})*
  - `PartialPipeLinkerVersion1.linkPartialDeclaration` → `compilePipeFromMetadata` — linker L29-36 — *full と同じ式*
  - `ɵɵngDeclarePipe` → `compilePipeDeclaration` → `compilePipeFromMetadata` — jit/partial.ts L205・facade L139 — *リンカーを通らないとき*
- `@Pipe`（JIT）→ `compilePipe` → getter → `facade.compilePipe` — jit/pipe.ts・facade L121
- 👤 `実行時：クラスの読み込み` — core
  - `ɵɵdefinePipe` → `PipeDef` — definition.ts L593-616 — *factory: null・pure・standalone・onDestroy*
  - `ɵɵpipe`（テンプレートが初めて使う）→ `pipeDef.factory = getFactoryDef(type)` — pipe.ts L58 — *ɵfac を読む*

## 9. DEMO：このページの上の ɵpipe と ɵfac を読む

> **🧪 DEMO 1 — AOT でコンパイルされたクラスの static を読む**
>
> この章の .ts に、1 節と同じ 3 つの pipe（`pcdTrim`・`pcdLive`・`pcdOld`）を書きました。このサイトのビルド（AOT）が ɵpipe と ɵfac を足しています。「読む」を押すと、それらと `@angular/common` の本物の pipe の `ɵpipe` の値と `ɵfac` の中身を表にします。`ɵfac` は本番ビルドでは名前が縮められています。
>
> 「ɵpipe と ɵfac を読む」を押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/pipe-class-def)

確かめられることです（このサイトの本番ビルドで確かめました）。

1. **name と standalone**

   `pcdOld` だけ standalone が false。ほかは書いていないので 613 行目の既定の true です。
2. **pure**

   `pcdLive` と、common の `AsyncPipe`・`JsonPipe` が false です。
3. **onDestroy**

   ngOnDestroy を持つ `pcdLive` と `AsyncPipe` だけ「prototype.ngOnDestroy と同じ関数」、ほかは null です。
4. **factory**

   最初はこの章の 3 つとも null です（611 行目）。「3 つの pipe をこのページで使う」を押してから、もう一度「読む」を押すと function になります。テンプレートの `ɵɵpipe` が初めて使ったときに入れるからです。common の pipe は、このサイトのほかの場所ですでに使われていれば、最初から function です。
5. **ɵfac**

   この章の 3 つでは `pcdOld` だけが、引数 1 つを印 16 で注入しています。common の `DatePipe` は 3 つ（16・24・24。24 は 16 + Optional の 8）、`AsyncPipe` は 1 つ（16）で、ChangeDetectorRef 以外のトークンにも 16 が付いていることが分かります。

> **🧪 DEMO 2 — JIT の 2 つの入口を、このページで本当に呼ぶ**
>
> 「呼ぶ」を押すと `@angular/compiler` をその場で読み込み、5 節の `CompilerFacadeImpl.compilePipe`（JIT の @Pipe が呼ぶもの）と、6 節の `compilePipeDeclaration`（`ɵɵngDeclarePipe` が呼ぶもの）を呼びます。どちらも JS の文字列を作って `new Function` で評価し、このページの `@angular/core` の本物の `ɵɵdefinePipe` が PipeDef を返します。評価する直前の JS の文字列も見せます。部分宣言は `isStandalone` を書かず、`version` だけを 4 通りに変えます。最後に、ngtsc が部分コンパイルで書く呼び出し（`compileDeclarePipeFromMetadata` の結果）も文字列にします（こちらは評価しません）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/pipe-class-def)

- どの入口も、評価する JS は `i0.ɵɵdefinePipe({name: …, type: …, pure: true})` の 1 行です。違うのは `standalone: false` が付くかどうかだけです。
- `version: '18.2.0'` の部分宣言だけ `standalone: false` が足され、PipeDef も false です（util.ts 144〜146 行目）。19.0.0・22.1.6・`0.0.0-PLACEHOLDER` は true です。
- 部分コンパイルの式は `version: '22.1.6'` です。ソースの 44 行目は `'0.0.0-PLACEHOLDER'` ですが、配布物では版の番号に置き換わっています。

## テストと直し方

### spec と期待する出力

| 場所 | 名前 | この章のどこ |
| --- | --- | --- |
| compliance の `components_and_directives/pipes/TEST_CASES.json` | should render pipes（5 行目）・should generate the proper instruction when injecting ChangeDetectorRef into a pipe（72 行目）・should handle a pipe that does not have a name（116 行目） | 2・7 節 |
| `packages/core/test/render3/jit/declare_pipe_spec.ts` | describe `Pipe declaration jit compilation`（12 行目）の 4 つの it | 6 節 |
| `packages/compiler-cli/test/ngtsc/standalone_spec.ts` | should retain metadata for non-standalone declarations（1146 行目） | 3 節 |

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/pipes/pipes_my_pipe_def.js` L1–10 （▶ の行: 3, 6–7）

```js
 1 │ export class MyPipe {
 2 │   // ...
 3 ▶   static ɵpipe = /*@__PURE__*/ $r3$.ɵɵdefinePipe({
 4 │     name: "myPipe",
 5 │     type: MyPipe,
 6 ▶     pure: false,
 7 ▶     standalone: false
 8 │   });
 9 │   // ...
10 │ }
```

入力の `MyPipe` は `pure: false, standalone: false`。期待する出力の 6・7 行目で、2 節の 65 行目（pure は必ず）と 67〜69 行目（standalone は false のときだけ）の両方を固めています。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/pipes/pipe_di_change_detector_ref_my_pipe_fac.js` L1–8 （▶ の行: 5）

```js
1 │ export class MyPipe {
2 │   …
3 │   static ɵfac = function MyPipe_Factory(__ngFactoryType__) {
4 │     /* @ts-ignore */
5 ▶     return new (__ngFactoryType__ || MyPipe)($i0$.ɵɵdirectiveInject($i0$.ChangeDetectorRef, 16));
6 │   };
7 │   …
8 │ }
```

5 行目の `16` が 7 節の `ForPipe` です。同じ場面の `@Optional()` を付けた方は 24（16 + Optional の 8）です。

📄 `angular/packages/core/test/render3/jit/declare_pipe_spec.ts` L12–37 （▶ の行: 17, 22–23, 30, 36）

```ts
12 │ describe('Pipe declaration jit compilation', () => {
13 │   it('should compile a named Pipe declaration', () => {
14 │     const def = ɵɵngDeclarePipe({
15 │       type: TestClass,
16 │       name: 'foo',
17 ▶       version: '18.0.0',
18 │     }) as PipeDef<TestClass>;
19 │ 
20 │     expect(def.type).toBe(TestClass);
21 │     expect(def.name).toEqual('foo');
22 ▶     expect(def.pure).toEqual(true);
23 ▶     expect(def.standalone).toEqual(false);
24 │   });
25 │ 
26 │   it('should compile an impure Pipe declaration', () => {
27 │     const def = ɵɵngDeclarePipe({
28 │       type: TestClass,
29 │       name: 'foo',
30 ▶       pure: false,
31 │       version: '18.0.0',
32 │     }) as PipeDef<TestClass>;
33 │ 
34 │     expect(def.type).toBe(TestClass);
35 │     expect(def.name).toEqual('foo');
36 ▶     expect(def.pure).toEqual(false);
37 │   });
```

📄 `angular/packages/core/test/render3/jit/declare_pipe_spec.ts` L39–61 （▶ の行: 43, 48, 55, 60）

```ts
39 │   it('should compile 0.0.0 pipe as standalone', () => {
40 │     const def = ɵɵngDeclarePipe({
41 │       type: TestClass,
42 │       name: 'foo',
43 ▶       version: '0.0.0-PLACEHOLDER',
44 │     }) as PipeDef<TestClass>;
45 │ 
46 │     expect(def.type).toBe(TestClass);
47 │     expect(def.name).toEqual('foo');
48 ▶     expect(def.standalone).toEqual(true);
49 │   });
50 │ 
51 │   it('should compile v19+ pipe as standalone', () => {
52 │     const def = ɵɵngDeclarePipe({
53 │       type: TestClass,
54 │       name: 'foo',
55 ▶       version: '19.0.0',
56 │     }) as PipeDef<TestClass>;
57 │ 
58 │     expect(def.type).toBe(TestClass);
59 │     expect(def.name).toEqual('foo');
60 ▶     expect(def.standalone).toEqual(true);
61 │   });
```

17・23 行目：`version: '18.0.0'` で isStandalone を書かないと false。43・48 行目と 55・60 行目：`0.0.0-PLACEHOLDER` と `19.0.0` は true。DEMO 2 の表と同じ答えです。30・36 行目：`pure: false` はそのまま、書かなければ 22 行目のとおり true です。

### 手元で走らせた結果

📄 `ターミナル（~/angular-research/angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/test/compliance/full:full \
  --test_arg=--filter=components_and_directives/pipes --nocache_test_results --test_output=all
pnpm bazel test //packages/compiler-cli/test/compliance/linked:linked \
  --test_arg=--filter=components_and_directives/pipes --nocache_test_results --test_output=all
pnpm bazel test //packages/core/test/render3:render3 \
  "--test_arg=--filter=Pipe declaration jit compilation" --nocache_test_results --test_output=all
```

📄 `出力（2026-11-09 に実行。要約）`

```
//packages/compiler-cli/test/compliance/full:full      Ran 2 of 615 specs ×2 shard   PASSED
//packages/compiler-cli/test/compliance/linked:linked  Ran 2 of 587 specs ×2 shard   PASSED
//packages/core/test/render3:render3                   Ran 4 of 574 specs            PASSED in 0.9s
```

compliance は full と linked（部分コンパイル → リンカー）の両方で、pipes の 4 つの場面が通ります。`declare_pipe_spec.ts` は 4 つの it が通りました（574 のうち 4）。

### 直すとしたら

- 定義の形を変えるなら、**4 か所が同じ答えを出す**必要があります。`r3_pipe_compiler.ts` の `compilePipeFromMetadata`、`partial/pipe.ts` の `createPipeDefinitionMap`、リンカーの `toR3PipeMeta`、facade の `convertDeclarePipeFacadeToMetadata`。
- 部分宣言に項目を足すなら、古いリンカーが読めないので `MINIMUM_PARTIAL_LINKER_VERSION`（23 行目）を上げるかどうかを決めます（16〜22 行目のコメントの約束）。
- 出力の変化は `components_and_directives/pipes/` の期待する .js と `GOLDEN_PARTIAL.js` に、実行時の既定は `declare_pipe_spec.ts` に、ngtsc の診断は `standalone_spec.ts` に足します。

## 聞かれそうな質問

**Q. @Pipe を付けると、そのクラスはどこかに登録されますか？**

されません。クラスに static の `ɵpipe`（`ɵɵdefinePipe` の結果）と `ɵfac` が足されるだけです（ngtsc の 306 行目の `compileResults(…, 'ɵpipe', …)`）。テンプレートの `ɵɵpipe` が名前で探したときに、コンポーネントの dependencies の中から読まれます（第 3 回）。

**Q. pure も standalone も書かないと、それぞれ何になりますか？**

どちらも true です。実行時は definition.ts 612 行目（`pure !== false`）と 613 行目（`standalone ?? true`）。ngtsc は pure を必ず書き（65 行目）、standalone は false のときだけ書きます（67〜69 行目）。

**Q. ngOnDestroy は定義のどこに入りますか？**

コンパイラの出力には出てきません。`ɵɵdefinePipe` が実行時に `type.prototype.ngOnDestroy` を読んで PipeDef の `onDestroy`（interfaces/definition.ts 463 行目）に入れます。DEMO 1 で `pcdLive` と `AsyncPipe` の onDestroy がその関数と同じことを確かめられます。

**Q. ライブラリの pipe（部分コンパイル）とアプリの pipe で、定義は違いますか？**

リンクした後は同じです。リンカーの 35 行目も、facade の 145 行目も、2 節と同じ `compilePipeFromMetadata` を呼びます（6 節の記録で 1 文字ずつ同じ）。違いが出るのは、宣言に isStandalone が無いときの既定だけで、宣言の version が 19 未満なら false です。

**Q. pipe のコンストラクタに ChangeDetectorRef を書くと、ɵfac はどうなりますか？**

`ɵɵdirectiveInject(ChangeDetectorRef, 16)` になります（1 節の 10 行目、compliance の期待値の 5 行目）。16 は `InjectFlags.ForPipe` で、pipe の ɵfac ではどの引数にも付きます。フィールドで `inject()` を使うと ɵfac は引数なしの `new X()` のままで、印 16 も付きません（7 節。#50952）。

**Q. JIT では、いつ定義が作られますか？**

クラスの定義のときではなく、`ɵpipe` が初めて読まれたときです。jit/pipe.ts 48〜50 行目の getter が、読まれたときに 1 回だけ `compilePipe` を呼んで覚えます。

## 読み終えて

- @Pipe はクラスに `ɵpipe` と `ɵfac` の 2 つの static を足すだけで、どこにも登録しない。
- 定義を作るのは `compilePipeFromMetadata` 1 つ。AOT・リンカー・JIT・ɵɵngDeclarePipe のどの道もここに戻る。
- 実行時の `ɵɵdefinePipe` が既定（pure と standalone は true）を決め、`onDestroy` をクラスから読み、`factory` は最初に使われるまで null。
- 部分宣言の standalone の既定は、宣言を書いた版で決まる（19 以上なら true）。
- コンストラクタの DI は ɵfac の `ɵɵdirectiveInject(…, 16)`。16 は ForPipe で、`inject()` には付かない。

---

← 前: [1 行の | が生むもの：テンプレートに書いた pipe の全体像](01-pipe-what-declared.md)  
次: [名前の解決：imports に入れた pipe が、テンプレートの名前と結ばれるまで](03-pipe-name-resolution.md) →
