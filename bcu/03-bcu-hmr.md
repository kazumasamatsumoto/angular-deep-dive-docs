[目次](../README.md) › [@angular/build の compilation と utils の読み残し](README.md) › 第 3 回 / 全 10 回

# hmr-candidates と typescript-printer：差し替えてよいコンポーネントを見分ける

> tools/angular/compilation/hmr-candidates.ts の未読の行と typescript-printer.ts の全部：デコレーターと @Component のフィールドの比べ方、構文木の範囲を文字で比べる equalRangeText、styleUrls が対応外になる 'stylesUrl' の綴り、Angular の変換の結果をソースマップつきで印刷する内部の API。

angular/angular-cli · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-hmr)

---

ng serve でファイルを保存すると、`collectHmrCandidates` が「差し替えてよいコンポーネント」を探し、1 つでも対応外の変更があれば全部を捨ててページを読み直させます。この章では、その判定のうちまだ読んでいない行（デコレーターの比べ方、`@Component({…})` のフィールドの集め方、文字で比べる `equalRangeText`）と、Angular の変換を当てた結果をソースマップつきで文字列にする `typescript-printer.ts` の全部を読みます。デモは本物の AotCompilation に 17 通りの変更の組を当て、どの行で候補から外れたかを記録したものです。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/tools/angular/compilation/` の `hmr-candidates.ts` と `typescript-printer.ts` です。HMR が有効になる条件、`collectHmrCandidates` の本体、`analyzeFileUpdates` の前半、対応するフィールドの一覧と `analyzeMetaUpdates` の後半は [HMR の章](../cli/11-cli-hmr.md)の 3 節、更新モジュールの中身は [HMR の更新モジュールの章](../ngtsc/17-ngtsc-hmr.md)、dev-server が届ける所は [HMR と SSR の章](../vds/04-vds-hmr-ssr.md)で読みました。

1. [1. AotCompilation の残り](01-bcu-aot.md)
2. [2. ParallelCompilation](02-bcu-parallel.md)
3. **3. hmr-candidates**（この章）
4. [4. AngularHost と遅延ルート](04-bcu-host.md)
5. [5. 予算と出力の表](05-bcu-budget.md)
6. [6. index.html の仕上げ](06-bcu-index.md)
7. [7. 自動 CSP](07-bcu-auto-csp.md)
8. [8. オプションの小道具](08-bcu-options.md)
9. [9. パス・URL・ソースマップ](09-bcu-paths.md)
10. [10. spec と issue](10-bcu-tests-issues.md)

## 1. 何を受け取り、何を約束するか

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/hmr-candidates.ts` L9–24 （▶ の行: 9, 11, 16–19, 21–23）

```ts
 9 ▶ import type * as ng from '@angular/compiler-cli';
10 │ import assert from 'node:assert';
11 ▶ import ts from 'typescript';
12 │ 
13 │ /**
14 │  * Analyzes one or more modified files for changes to determine if any
15 │  * class declarations for Angular components are candidates for hot
16 ▶  * module replacement (HMR). If any source files are also modified but
17 ▶  * are not candidates then all candidates become invalid. This invalidation
18 ▶  * ensures that a full rebuild occurs and the running application stays
19 ▶  * synchronized with the code.
20 │  * @param modifiedFiles A set of modified files to analyze.
21 ▶  * @param param1 An Angular compiler instance
22 ▶  * @param staleSourceFiles A map of paths to previous source file instances.
23 ▶  * @returns A set of HMR candidate component class declarations.
24 │  */
```

9 行目の @angular/compiler-cli は `import type` で、型だけです。コンパイラは引数の `NgtscProgram`（21 行目）から受け取ります。11 行目の TypeScript は構文木を調べるのに使います。16〜19 行目が約束です。「候補にならないファイルが 1 つでも変わっていたら、候補は全部無効にし、全体のビルドにする。そうすれば動いているアプリがコードとずれない」。22 行目の `staleSourceFiles` は、`AotCompilation.initialize` が新しいプログラムを作る前に取っておいた、前回の SourceFile です（113〜116 行目、HMR の章の引用）。

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/hmr-candidates.ts` L75–88 （▶ の行: 77–79, 83, 85–88）

```ts
75 │ 
76 │ /**
77 ▶  * Analyzes the updates of a source file for potential HMR component class candidates.
78 ▶  * A source file can contain candidates if only the Angular component metadata of a class
79 ▶  * has been changed and the metadata changes are only of supported fields.
80 │  * @param stale The stale (previous) source file instance.
81 │  * @param updated The updated source file instance.
82 │  * @param compiler An Angular compiler instance.
83 ▶  * @returns An array of candidate class declarations; or `null` if unsupported changes are present.
84 │  */
85 ▶ function analyzeFileUpdates(
86 ▶   stale: ts.SourceFile,
87 ▶   updated: ts.SourceFile,
88 ▶   compiler: ng.NgtscProgram['compiler'],
```

`analyzeFileUpdates` は、1 つの .ts の前回（86 行目）と今回（87 行目）を比べ、候補のクラスの配列か、対応外なら `null`（83 行目）を返します。77〜79 行目のとおり、候補になれるのは「クラスのうち Angular のコンポーネントのメタデータだけが変わり、その変わり方が対応したフィールドだけ」のときです。

## 2. デコレーターの比べ方

クラスの名前・`extends`・修飾子を比べ、`getMeta` でコンポーネントだと分かり、デコレーターの数が同じで 1 つだけ（128〜135 行目、HMR の章の引用）を通ったあとの行です。

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/hmr-candidates.ts` L136–158 （▶ の行: 138–140, 143–146, 151–155, 157）

```ts
136 │ 
137 │         // Find index of component metadata decorator
138 ▶         const metaDecoratorIndex = updatedDecorators?.indexOf(meta.decorator);
139 ▶         assert(
140 ▶           metaDecoratorIndex !== undefined,
141 │           'Component metadata decorator should always be present on component class.',
142 │         );
143 ▶         const updatedDecoratorExpression = meta.decorator.expression;
144 ▶         assert(
145 ▶           ts.isCallExpression(updatedDecoratorExpression) &&
146 ▶             updatedDecoratorExpression.arguments.length === 1,
147 │           'Component metadata decorator should contain a call expression with a single argument.',
148 │         );
149 │ 
150 │         // Check the matching stale index for the component decorator
151 ▶         const staleDecoratorExpression = staleDecorators[metaDecoratorIndex]?.expression;
152 ▶         if (
153 ▶           !staleDecoratorExpression ||
154 ▶           !ts.isCallExpression(staleDecoratorExpression) ||
155 ▶           staleDecoratorExpression.arguments.length !== 1
156 │         ) {
157 ▶           return null;
158 │         }
```

1. **今回のデコレーターの位置**

   138 行目。コンパイラが覚えている `meta.decorator` が、今回のデコレーターの並びの何番目かを探します。139〜142 行目の assert は、コンポーネントのクラスに必ずあることを確かめるだけです。
2. **今回は呼び出しで引数が 1 つ**

   143〜148 行目。`@Component({…})` の形でなければ、コンパイラの解析が先に失敗しているので、ここは assert です。
3. **前回の同じ位置も同じ形か**

   151〜158 行目。前回のほうは誰も確かめていないので、assert ではなく `null`（対応外）で返します。

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/hmr-candidates.ts` L159–177 （▶ の行: 167–169, 171, 175）

```ts
159 │ 
160 │         // Check decorator name/expression
161 │         // NOTE: This would typically be `Component` but can also be a property expression or some other alias.
162 │         // To avoid complex checks, this ensures the textual representation does not change. This has a low chance
163 │         // of a false positive if the expression is changed to still reference the `Component` type but has different
164 │         // text. However, it is rare for `Component` to not be used directly and additionally unlikely that it would
165 │         // be changed between edits. A false positive would also only lead to a difference of a full page reload versus
166 │         // an HMR update.
167 ▶         if (
168 ▶           !equalRangeText(
169 ▶             updatedDecoratorExpression.expression,
170 │             updated,
171 ▶             staleDecoratorExpression.expression,
172 │             stale,
173 │           )
174 │         ) {
175 ▶           return null;
176 │         }
177 │ 
```

167〜176 行目で、呼び出される側（`Component` の部分、`updatedDecoratorExpression.expression`）の文字が同じかを見ます。161〜166 行目のコメントのとおり、`ng.Component` のような書き方や別名もありうるので、意味ではなく文字で比べます。間違えても「HMR で済む変更が読み直しになる」だけなので、軽い比べ方を選んでいます。このあと 179〜187 行目で、引数のオブジェクトを 3 節の `analyzeMetaUpdates` に回します（HMR の章の引用）。

> [!NOTE]
> **ポイント**
>
> デモの「デコレーターが 2 つのクラスの template」は、`@Tag()` と `@Component` を付けた Multi のテンプレートだけを変えたものです。133〜135 行目（HMR の章の引用）の「2 つ以上なら対応外」で `null` になり、テンプレートの変更でも読み直しになりました。132 行目の TODO が、ほかのデコレーターを比べずに一律に外していることを書いています。

## 3. @Component の中のフィールドを 2 つに分ける

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/hmr-candidates.ts` L230–250 （▶ の行: 231, 233, 238, 240, 246–248, 250）

```ts
230 │ 
231 ▶ /**
232 │  * Analyzes the metadata fields of a decorator call expression for unsupported HMR updates.
233 ▶  * Only updates to supported fields can be present for HMR to be viable.
234 │  * @param staleCall A call expression instance.
235 │  * @param staleSource The source file instance containing the stale call instance.
236 │  * @param updatedCall A call expression instance.
237 │  * @param updatedSource The source file instance containing the updated call instance.
238 ▶  * @returns A MetaUpdateAnalysis enum value.
239 │  */
240 ▶ function analyzeMetaUpdates(
241 │   staleCall: ts.CallExpression,
242 │   staleSource: ts.SourceFile,
243 │   updatedCall: ts.CallExpression,
244 │   updatedSource: ts.SourceFile,
245 │ ): MetaUpdateAnalysis {
246 ▶   const staleObject = staleCall.arguments[0];
247 ▶   const updatedObject = updatedCall.arguments[0];
248 ▶   let hasSupportedUpdate = false;
249 │ 
250 ▶   if (!ts.isObjectLiteralExpression(staleObject) || !ts.isObjectLiteralExpression(updatedObject)) {
```

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/hmr-candidates.ts` L251–271 （▶ の行: 251, 254–255, 257–258, 260, 263–266, 269）

```ts
251 ▶     return MetaUpdateAnalysis.Unsupported;
252 │   }
253 │ 
254 ▶   const supportedFields = new Map<string, ts.Node>();
255 ▶   const unsupportedFields: ts.Node[] = [];
256 │ 
257 ▶   for (const property of staleObject.properties) {
258 ▶     if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
259 │       // Unsupported object literal property
260 ▶       return MetaUpdateAnalysis.Unsupported;
261 │     }
262 │ 
263 ▶     const name = property.name.text;
264 ▶     if (SUPPORTED_FIELD_NAMES.has(name)) {
265 ▶       supportedFields.set(name, property.initializer);
266 ▶       continue;
267 │     }
268 │ 
269 ▶     unsupportedFields.push(property.initializer);
270 │   }
271 │ 
```

1. **引数はオブジェクトのリテラルだけ**

   250〜252 行目。`@Component(META)` のように変数を渡していれば、中身を比べられないので `Unsupported`。
2. **前回のフィールドを 2 つの入れ物に**

   254〜255 行目。対応したフィールド（`template` など、217〜223 行目、HMR の章の引用）は名前つきの Map に、それ以外（`selector`・`imports` など）は並び順のまま配列に、値の構文木（`initializer`）を入れます。
3. **ふつうの「名前: 値」でなければ対応外**

   258〜261 行目。`{ template }` のような省略形、`...base` の展開、`[key]: …` の計算されたキーは `Unsupported` です。

このあと 273〜298 行目（HMR の章の引用）で今回のフィールドを回し、対応したフィールドは Map の値と比べて違えば「対応した更新あり」、それ以外は配列の同じ番目と比べて違えば `Unsupported` にします。300〜302 行目で対応外のフィールドの数が違えば `Unsupported`、305 行目で Map に残った（消された）対応したフィールドも「対応した更新あり」です。

> [!WARNING]
> **ハマりどころ**
>
> 217〜223 行目（HMR の章の引用）の一覧の 5 つめは `'stylesUrl'` です。@Component のフィールドは `styleUrl`（1 つ）と `styleUrls`（配列）で、`stylesUrl` というフィールドはありません。そのため `styleUrls` は「対応外のフィールド」として 269 行目の配列に入り、値の配列を変えると 295〜296 行目で `Unsupported` になります。デモの「styleUrls（配列）に 1 つ足す」はこれで、`styleUrl` の値を別のファイルにする組（候補 Ext）と違い、候補は空でした。記録のスクリプトで 222 行目だけを `'styleUrls'` に替えた写しに同じ引数を渡すと、Arr が候補になりました。この一覧は最初の 378624d3f7（2024-11）からこの文字列で、22.2.7 と main も同じです。なお、`styleUrls` に書いた .css の中身を変えるのは、41〜45 行目（HMR の章の引用）の `getComponentsWithStyleFile` の道なので、デモの「styleUrl の .css」のとおり Arr も候補になります。

## 4. 文字で比べる：equalRangeText

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/hmr-candidates.ts` L308–329 （▶ の行: 312, 319–320, 322, 326–327）

```ts
308 │ }
309 │ 
310 │ /**
311 │  * Compares the text from a provided range in a source file to the text of a range in a second source file.
312 ▶  * The comparison avoids making any intermediate string copies.
313 │  * @param firstRange A text range within the first source file.
314 │  * @param firstSource A source file instance.
315 │  * @param secondRange A text range within the second source file.
316 │  * @param secondSource A source file instance.
317 │  * @returns true, if the text from both ranges is equal; false, otherwise.
318 │  */
319 ▶ function equalRangeText(
320 ▶   firstRange: ts.ReadonlyTextRange | undefined,
321 │   firstSource: ts.SourceFile,
322 ▶   secondRange: ts.ReadonlyTextRange | undefined,
323 │   secondSource: ts.SourceFile,
324 │ ): boolean {
325 │   // Check matching undefined values
326 ▶   if (!firstRange || !secondRange) {
327 ▶     return firstRange === secondRange;
328 │   }
329 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/hmr-candidates.ts` L330–347 （▶ の行: 331–334, 338–342, 346）

```ts
330 │   // Ensure lengths are equal
331 ▶   const firstLength = firstRange.end - firstRange.pos;
332 ▶   const secondLength = secondRange.end - secondRange.pos;
333 ▶   if (firstLength !== secondLength) {
334 ▶     return false;
335 │   }
336 │ 
337 │   // Check each character
338 ▶   for (let i = 0; i < firstLength; ++i) {
339 ▶     const firstChar = firstSource.text.charCodeAt(i + firstRange.pos);
340 ▶     const secondChar = secondSource.text.charCodeAt(i + secondRange.pos);
341 ▶     if (firstChar !== secondChar) {
342 ▶       return false;
343 │     }
344 │   }
345 │ 
346 ▶   return true;
347 │ }
```

この章のほかの比べ方は全部この関数です。326〜328 行目、片方でも無ければ「両方無い」ときだけ同じ（`extends` がどちらにも無い、など）。331〜335 行目で長さを比べ、338〜344 行目で 1 文字ずつ `charCodeAt` で比べます。312 行目のとおり、途中の文字列を作りません。

範囲は `pos` から `end` です。TypeScript の `pos` は、そのノードの前の空白とコメント（leading trivia）を含みます（`getStart()` ではない）。だから、クラスでない文（205 行目、HMR の章の引用）では、その文の前のコメントを変えても「違う」になります。デモの「ファイルの先頭のコメント」は、1 行目の `// hmr demo` を `// hmr demo v2` にしただけで、import の文が違うと判定され（207 行目）、読み直しになりました。

## 5. デモ：変更の組と、通った行

> **🧪 DEMO — @angular/build 22.2.7 の collectHmrCandidates の記録**
>
> 1 つの組ごとにワークスペースを作り直し、`AotCompilation` を `enableHmr: true` で 1 回 initialize したあと、ファイルを書き換えて、変えたファイルを `modifiedFiles` にしてもう 1 回 initialize しました（Node v24.22.1）。「通った行」は、44129f66a3 の hmr-candidates.ts の各 return と候補を足す行に印を足した写しに、dist の関数と同じ引数を渡して記録した物です。行番号は元のファイルのままで、HMR の章とこの章の引用の行です。
>
> modifiedFiles：src/app/hmr.ts／staleSourceFiles にあった物：src/app/hmr.ts
>
> 更新モジュールの ID（updateId を decodeURIComponent した物）と文字数：`src/app/hmr.ts@Hmr`（881 文字）
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-hmr)

以下の行番号は、この章と [HMR の章](../cli/11-cli-hmr.md)の引用の行です。候補になったのは、インラインの `template` と `styles`、外部の .html と .css、`styleUrl` の値、`styles` を消す、の 6 組でした。テンプレートのファイル（36 行目）とスタイルのファイル（43 行目）は .ts を比べないので、通った行は 1 つです。.ts を変えた組は 307 行目で `Supported` が決まり、197 行目で候補に入り、64 行目でファイルの候補に足されます。クラスのフィールドの値やメソッドの中のコメントは、307 行目では `None`（フィールドは変わっていない）で、192 行目のクラスの本体の比べで外れました。「template と、コンポーネントでないファイル」は、hmr.ts では候補に入ったのに、次の service.ts で 207 行目に当たり、68 行目で全部が捨てられました。1 節の 16〜19 行目の約束のとおりです。

## 6. typescript-printer：Angular の変換の結果を文字列とソースマップに

[1 回目](01-bcu-aot.md)の 8 節の 439 行目が呼ぶ `printSourceFileWithMap` です。TypeScript の公開の API の `printer.printFile` はソースマップを作れないので、内部の API を使います（09d0a11a8b、2026-07）。

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/typescript-printer.ts` L9–31 （▶ の行: 10–11, 22–23, 25–26, 29）

```ts
 9 │ /**
10 ▶  * @fileoverview Helper functions and typings for utilizing internal TypeScript printer
11 ▶  * and sourcemap generation APIs.
12 │  */
13 │ 
14 │ import assert from 'node:assert';
15 │ import { dirname } from 'node:path';
16 │ import ts from 'typescript';
17 │ 
18 │ /**
19 │  * Partial interface representing the internal TypeScript `EmitTextWriter` API.
20 │  * Used to collect printed text output from the printer.
21 │  */
22 ▶ export interface EmitTextWriter {
23 ▶   write(s: string): void;
24 │   rawWrite(s: string): void;
25 ▶   writeLine(force?: boolean): void;
26 ▶   getText(): string;
27 │   clear(): void;
28 │   isAtStartOfLine(): boolean;
29 ▶   getTextPos(): number;
30 │   writeComment(s: string): void;
31 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/typescript-printer.ts` L33–63 （▶ の行: 37, 39–41, 49–50, 57–58, 61）

```ts
33 │ /**
34 │  * Partial interface representing the internal TypeScript `SourceMapGenerator` API.
35 │  * Used to construct mappings and serialize a sourcemap.
36 │  */
37 ▶ export interface SourceMapGenerator {
38 │   getSources(): string[];
39 ▶   addSource(fileName: string): number;
40 ▶   setSourceContent(sourceIndex: number, content: string | null): void;
41 ▶   addMapping(
42 │     generatedLine: number,
43 │     generatedCharacter: number,
44 │     sourceIndex: number,
45 │     sourceLine: number,
46 │     sourceCharacter: number,
47 │     nameIndex?: number,
48 │   ): void;
49 ▶   toJSON(): object;
50 ▶   toString(): string;
51 │ }
52 │ 
53 │ /**
54 │  * Extended `ts.Printer` interface containing the internal `writeFile` method
55 │  * which supports sourcemap generation.
56 │  */
57 ▶ export interface ExtendedPrinter extends ts.Printer {
58 ▶   writeFile(
59 │     sourceFile: ts.SourceFile,
60 │     writer: EmitTextWriter,
61 ▶     sourceMapGenerator?: SourceMapGenerator,
62 │   ): void;
63 │ }
```

22〜31 行目の `EmitTextWriter` は、printer が文字を書き込む先（TypeScript の内部の型）の、使う所だけを書いた形です。37〜51 行目の `SourceMapGenerator` は、書きながら「出力の何行何列 ← 元の何行何列」を足していく物で、50 行目の `toString` が JSON の文字列を返します。57〜63 行目の `ExtendedPrinter` は、公開の `ts.Printer` に、内部の `writeFile(sourceFile, writer, sourceMapGenerator)` を足した形です。

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/typescript-printer.ts` L65–100 （▶ の行: 69–71, 76, 78–79, 83, 91–93, 96–97）

```ts
 65 │ /**
 66 │  * Typing structure for internal TypeScript module exports that are not exposed
 67 │  * in the public `@types/typescript` package.
 68 │  */
 69 ▶ export interface TypeScriptInternals {
 70 ▶   createTextWriter(newLine: string): EmitTextWriter;
 71 ▶   createSourceMapGenerator(
 72 │     host: {
 73 │       getCurrentDirectory(): string;
 74 │       getCanonicalFileName(fileName: string): string;
 75 │     },
 76 ▶     file: string,
 77 │     sourceRoot: string | undefined,
 78 ▶     sourcesDirectoryPath: string,
 79 ▶     generatorOptions: ts.CompilerOptions,
 80 │   ): SourceMapGenerator;
 81 │ }
 82 │ 
 83 ▶ const tsInternals = ts as unknown as TypeScriptInternals;
 84 │ 
 85 │ /**
 86 │  * Asserts that the required internal TypeScript APIs are present in the currently
 87 │  * loaded TypeScript module.
 88 │  *
 89 │  * @throws {AssertionError} If any required internal API is missing.
 90 │  */
 91 ▶ export function assertTypeScriptPrinterInternals(): void {
 92 ▶   assert(
 93 ▶     typeof tsInternals.createTextWriter === 'function',
 94 │     'TypeScript internal "createTextWriter" is missing.',
 95 │   );
 96 ▶   assert(
 97 ▶     typeof tsInternals.createSourceMapGenerator === 'function',
 98 │     'TypeScript internal "createSourceMapGenerator" is missing.',
 99 │   );
100 │ }
```

69〜81 行目は `typescript` のモジュールに実際にあるが型に出ていない 2 つの関数で、83 行目で型を付け替えて使います。91〜100 行目の `assertTypeScriptPrinterInternals` は、TypeScript の版が上がってこの 2 つが無くなったとき、変な出力ではなく分かるエラーで止めるための確かめです。

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/typescript-printer.ts` L102–132 （▶ の行: 105, 107, 110, 123–127, 129–131）

```ts
102 │ /**
103 │  * Result object returned from printing a source file.
104 │  */
105 ▶ export interface PrintResult {
106 │   /** The printed source code text. */
107 ▶   code: string;
108 │ 
109 │   /** The generated sourcemap JSON string, if sourcemap generation was requested. */
110 ▶   map?: string;
111 │ }
112 │ 
113 │ /**
114 │  * Prints a TypeScript source file AST to a string, optionally generating a sourcemap
115 │  * using internal TypeScript APIs.
116 │  *
117 │  * @param sourceFile The TypeScript AST node representing the file to print.
118 │  * @param printer The printer instance to print the file with.
119 │  * @param compilerHost The TypeScript compiler host, used for path canonicalization and context.
120 │  * @param compilerOptions The compiler options configured for the build target.
121 │  * @returns A result containing the printed code and optional sourcemap text.
122 │  */
123 ▶ export function printSourceFileWithMap(
124 ▶   sourceFile: ts.SourceFile,
125 ▶   printer: ts.Printer,
126 ▶   compilerHost: ts.CompilerHost,
127 ▶   compilerOptions: ts.CompilerOptions,
128 │ ): PrintResult {
129 ▶   const shouldGenerateMap = compilerOptions.sourceMap || compilerOptions.inlineSourceMap;
130 ▶   if (!shouldGenerateMap) {
131 ▶     return { code: printer.printFile(sourceFile) };
132 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/typescript-printer.ts` L133–161 （▶ の行: 134, 137–138, 142, 144, 149–152, 155, 157–158, 160）

```ts
133 │ 
134 ▶   assertTypeScriptPrinterInternals();
135 │ 
136 │   const extendedPrinter = printer as ExtendedPrinter;
137 ▶   assert(
138 ▶     typeof extendedPrinter.writeFile === 'function',
139 │     'TypeScript Printer is missing internal "writeFile" method.',
140 │   );
141 │ 
142 ▶   const writer = tsInternals.createTextWriter(compilerHost.getNewLine());
143 │ 
144 ▶   const sourceMapGenerator = tsInternals.createSourceMapGenerator(
145 │     {
146 │       getCurrentDirectory: () => compilerHost.getCurrentDirectory(),
147 │       getCanonicalFileName: (fileName) => compilerHost.getCanonicalFileName(fileName),
148 │     },
149 ▶     sourceFile.fileName,
150 ▶     compilerOptions.sourceRoot,
151 ▶     dirname(sourceFile.fileName),
152 ▶     compilerOptions,
153 │   );
154 │ 
155 ▶   extendedPrinter.writeFile(sourceFile, writer, sourceMapGenerator);
156 │ 
157 ▶   const code = writer.getText();
158 ▶   const map = sourceMapGenerator.toString();
159 │ 
160 ▶   return { code, map };
161 │ }
```

1. **ソースマップが要らなければ公開の API**

   129〜132 行目。`sourceMap` も `inlineSourceMap` も偽なら、`printFile` の文字列だけを返します（`map` は無し）。
2. **内部の API があるか確かめる**

   134〜140 行目。
3. **書き込み先とマップの入れ物を作る**

   142 行目、改行はホストの `getNewLine()`。144〜153 行目、マップの `file` は SourceFile の名前（149 行目）、`sources` はその場所からの相対（151 行目の `dirname`）で、152 行目の options（`inlineSources` など）も渡します。
4. **1 回書いて、両方を取り出す**

   155 行目で書き、157 行目で文字列、158 行目でマップの JSON を取り出します。

> **🧪 DEMO — printSourceFileWithMap を 4 通りの compilerOptions で（記録）**
>
> `/w/src/a.ts` の 2 行に、最後の文 `mark();` を足す変換を `ts.transform` で当て、変換の結果を本物の `printSourceFileWithMap` に渡しました（[1 回目](01-bcu-aot.md)の 418〜439 行目と同じ順）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-hmr)

マップの `mappings` は 2 行分（`;` で区切られた 2 つ）だけで、変換が足した 3 行目の `mark();` には対応がありません。元の文字の場所を持たない、作られたノードだからです。AOT の emit では compiler-options.ts の 117〜118 行目（[AotCompilation の章](../cli/03-cli-angular-compilation.md)の引用）で `inlineSources` と `inlineSourceMap` が一緒に真になるので、4 つめのとおり `sourcesContent` に元の TypeScript が入ります。

## 7. どう録ったか

スクリプトは `<work>/bcu-demo/a/` に置き、サイトの node\_modules の @angular/build 22.2.7 の `aot-compilation.js` を使いました。aot-compilation.js は `collectHmrCandidates` を呼ぶたびに hmr-candidates.js の exports から引くので、その exports の関数を包んで、引数（変わったファイル・`NgtscProgram`・前回の SourceFile）と結果を記録しました。../angular-cli の hmr-candidates.ts は読むだけで、行の数を変えずに印（`__t(行番号)`）を足した文字列を transpile して、包んだ所から同じ引数で呼んでいます。dist と印つきの写しの候補は、17 組すべてで同じでした。TypeScript は最初に読んだ作業フォルダを覚えるので、組ごとに同じ場所にワークスペースを作り直してから移っています。

📄 `記録のスクリプト（rec-hmr.mjs）`

```
// 本物の AotCompilation（22.2.7 の dist）を _enableHmr つきで動かし、変更の前後の組ごとに
// collectHmrCandidates の結果（dist）と、initialize が返す templateUpdates を記録する。
// あわせて ../angular-cli（44129f66a3）の hmr-candidates.ts を transpile し、各 return の行に印を足した写しにも
// 同じ引数を渡して、どの行で候補から外れたかを記録する（行番号は元のファイルのまま）。
// 最後に typescript-printer の printSourceFileWithMap を 3 通りの compilerOptions で呼ぶ。
// 使い方: CLI_REPO=<../angular-cli> node rec-hmr.mjs <出力 JSON>
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { r, require, ts, makeWorkspace, abs, rel, hide, writeFile, version, cleanup } from './harness.mjs';

const out = process.argv[2];
await r('utils/hash.js').initializeHash();
const { AotCompilation } = r('tools/angular/compilation/aot-compilation.js');
const hmrModule = r('tools/angular/compilation/hmr-candidates.js');
const { printSourceFileWithMap } = r('tools/angular/compilation/typescript-printer.js');

// ---- 44129f66a3 の hmr-candidates.ts に印を足した写し ----
const srcPath = path.join(process.env.CLI_REPO, 'packages/angular/build/src/tools/angular/compilation/hmr-candidates.ts');
const lines = readFileSync(srcPath, 'utf8').split('\n');
const mark = /^(\s*)(return null;|return MetaUpdateAnalysis\.\w+;|return hasSupportedUpdate \?|candidates\.clear\(\);|candidates\.push\(updatedNode\);|templateFileNodes\.forEach|styleFileNodes\.forEach|fileCandidates\.forEach)/;
const traced = lines.map((l, i) => (mark.test(l) ? l.replace(mark, `$1__t(${i + 1}); $2`) : l)).join('\n');
let hits = [];
function load(text) {
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', '__t', js)(require, m, m.exports, (n) => hits.push(n));
  return m.exports.collectHmrCandidates;
}
const tracedCollect = load(traced);
// 比べるために、222 行目の 'stylesUrl' を 'styleUrls' にした写しも作る（行の数は変わらない）
const fixedLines = traced.split('\n');
fixedLines[221] = fixedLines[221].replace("'stylesUrl'", "'styleUrls'");
const fixedCollect = load(fixedLines.join('\n'));

// dist の collectHmrCandidates を包む（aot-compilation.js は呼ぶたびに exports から引く）
let seen = null;
const realCollect = hmrModule.collectHmrCandidates;
hmrModule.collectHmrCandidates = function (modifiedFiles, program, stale) {
  const result = realCollect(modifiedFiles, program, stale);
  hits = [];
  const traceResult = tracedCollect(modifiedFiles, program, stale);
  seen = {
    modified: [...modifiedFiles].map(rel),
    stale: [...(stale?.keys() ?? [])].map(rel),
    candidates: [...result].map((n) => n.name?.text ?? '?'),
    tracedCandidates: [...traceResult].map((n) => n.name?.text ?? '?'),
    lines: [...hits],
  };
  hits = [];
  seen.fixedCandidates = [...fixedCollect(modifiedFiles, program, stale)].map((n) => n.name?.text ?? '?');
  seen.fixedLines = [...hits];
  return result;
};

const BASE = `// hmr demo
import { Component } from '@angular/core';

@Component({
  selector: 'app-hmr',
  template: \`<p>{{ n }}</p>\`,
  styles: \`p { color: red; }\`,
})
export class Hmr {
  n = 1;
  inc() {
    this.n++;
  }
}
`;
const EXT = `import { Component } from '@angular/core';

@Component({
  selector: 'app-ext',
  templateUrl: './ext.html',
  styleUrl: './ext.css',
})
export class Ext {}
`;
const MULTI = `import { Component } from '@angular/core';
import { Tag } from './tag';

@Tag()
@Component({
  selector: 'app-multi',
  template: \`<p>multi</p>\`,
})
export class Multi {}
`;
const ARR = `import { Component } from '@angular/core';

@Component({
  selector: 'app-arr',
  template: \`<p>arr</p>\`,
  styleUrls: ['./ext.css'],
})
export class Arr {}
`;
const files = {
  'src/app/hmr.ts': BASE,
  'src/app/ext.ts': EXT,
  'src/app/ext.html': '<p>ext</p>\n',
  'src/app/ext.css': 'p { color: red; }\n',
  'src/app/ext2.css': 'p { color: blue; }\n',
  'src/app/tag.ts': 'export function Tag(): ClassDecorator {\n  return () => {};\n}\n',
  'src/app/multi.ts': MULTI,
  'src/app/arr.ts': ARR,
  'src/app/service.ts': "export class Store {\n  value = 1;\n}\n",
  'src/main.ts': "import { bootstrapApplication } from '@angular/platform-browser';\nimport { Hmr } from './app/hmr';\nimport { Ext } from './app/ext';\nimport { Multi } from './app/multi';\nimport { Arr } from './app/arr';\nimport { Store } from './app/service';\n\nbootstrapApplication(Hmr);\nexport const all = [Ext, Multi, Arr, Store];\n",
};
const rep = (f, a, b) => ({ [f]: files[f].replace(a, b) });

const cases = [
  { id: 'tpl', label: 'インラインの template だけ', change: rep('src/app/hmr.ts', '<p>{{ n }}</p>', '<p>n = {{ n }}</p>') },
  { id: 'sty', label: 'インラインの styles だけ', change: rep('src/app/hmr.ts', 'color: red', 'color: green') },
  { id: 'html', label: 'templateUrl の .html', change: { 'src/app/ext.html': '<p>ext!</p>\n' } },
  { id: 'css', label: 'styleUrl の .css', change: { 'src/app/ext.css': 'p { color: teal; }\n' } },
  { id: 'styleUrl', label: 'styleUrl の値を別のファイルに', change: rep('src/app/ext.ts', "'./ext.css'", "'./ext2.css'") },
  { id: 'styleUrls', label: 'styleUrls（配列）に 1 つ足す', change: rep('src/app/arr.ts', "['./ext.css']", "['./ext.css', './ext2.css']") },
  { id: 'remove', label: 'styles を消す', change: rep('src/app/hmr.ts', '  styles: `p { color: red; }`,\n', '') },
  { id: 'header', label: 'ファイルの先頭のコメント', change: rep('src/app/hmr.ts', '// hmr demo', '// hmr demo v2') },
  { id: 'member', label: 'クラスのフィールドの初期値', change: rep('src/app/hmr.ts', 'n = 1;', 'n = 2;') },
  { id: 'comment', label: 'メソッドの中にコメントを 1 行', change: rep('src/app/hmr.ts', 'this.n++;', '// +1\n    this.n++;') },
  { id: 'import', label: 'import を 1 つ足す', change: rep('src/app/hmr.ts', "import { Component } from '@angular/core';", "import { Component } from '@angular/core';\nimport { signal } from '@angular/core';") },
  { id: 'selector', label: 'デコレーターの selector', change: rep('src/app/hmr.ts', "'app-hmr'", "'app-hmr2'") },
  { id: 'host', label: 'デコレーターに host を足す', change: rep('src/app/hmr.ts', "  selector: 'app-hmr',\n", "  selector: 'app-hmr',\n  host: { class: 'x' },\n") },
  { id: 'multi', label: 'デコレーターが 2 つのクラスの template', change: rep('src/app/multi.ts', '<p>multi</p>', '<p>multi!</p>') },
  { id: 'service', label: 'コンポーネントでないクラス', change: rep('src/app/service.ts', 'value = 1;', 'value = 2;') },
  { id: 'both', label: 'template と、コンポーネントでないファイルを同時に', change: { ...rep('src/app/hmr.ts', '<p>{{ n }}</p>', '<p>n = {{ n }}</p>'), ...rep('src/app/service.ts', 'value = 1;', 'value = 2;') } },
  { id: 'unknown', label: 'プログラムに無いファイル', change: { 'src/app/notes.txt': 'memo\n' } },
];

const results = [];
for (const c of cases) {
  // TypeScript の ts.sys は最初に読んだ作業フォルダを覚えるので、毎回同じ場所に作り直してから移る
  process.chdir(path.dirname(new URL(import.meta.url).pathname));
  process.chdir(makeWorkspace('hmr', files));
  const comp = new AotCompilation(true);
  const host = (modified) => ({ modifiedFiles: modified, transformStylesheet: async (d) => d, processWebWorker: (w) => w });
  await comp.initialize(abs('tsconfig.json'), host(undefined), { enableHmr: true });
  for (const [f, text] of Object.entries(c.change)) writeFile(f, text);
  seen = null;
  const res = await comp.initialize(abs('tsconfig.json'), host(new Set(Object.keys(c.change).map(abs))), { enableHmr: true });
  results.push({
    id: c.id,
    label: c.label,
    diff: Object.entries(c.change).map(([f, text]) => ({ file: f, before: files[f] ?? '（無い）', after: text })),
    ...seen,
    templateUpdates: [...(res.templateUpdates?.keys() ?? [])].map(decodeURIComponent),
    updateBytes: [...(res.templateUpdates?.values() ?? [])].map((v) => v.length),
  });
}

// typescript-printer
const src = ts.createSourceFile('/w/src/a.ts', "const greeting: string = 'hi';\nexport const x = greeting;\n", ts.ScriptTarget.ES2022, true);
const addLine = (ctx) => (sf) => ctx.factory.updateSourceFile(sf, [...sf.statements, ctx.factory.createExpressionStatement(ctx.factory.createCallExpression(ctx.factory.createIdentifier('mark'), undefined, []))]);
const printer = [];
for (const [label, options] of [['sourcemap なし', {}], ['inlineSourceMap: true', { inlineSourceMap: true }], ['sourceMap: true', { sourceMap: true }], ['inlineSourceMap + inlineSources（AOT の sourcemap の上書きと同じ）', { inlineSourceMap: true, inlineSources: true }]]) {
  const host = ts.createCompilerHost(options);
  host.getCurrentDirectory = () => '/w';
  const tr = ts.transform(src, [addLine], options);
  const p = ts.createPrinter(options, tr);
  const res = printSourceFileWithMap(tr.transformed[0], p, host, options);
  printer.push({ label, code: res.code, map: res.map ? JSON.parse(res.map) : null });
}

process.chdir(path.dirname(new URL(import.meta.url).pathname));
const rec = { version, node: process.version, files, results, printer };
writeFileSync(out, JSON.stringify(rec, null, 1));
cleanup();
for (const x of results) console.log(x.id.padEnd(9), 'cand', JSON.stringify(x.candidates), 'traced', JSON.stringify(x.tracedCandidates), 'lines', JSON.stringify(x.lines), 'fixed', JSON.stringify(x.fixedCandidates), JSON.stringify(x.fixedLines), 'updates', JSON.stringify(x.templateUpdates), x.modified, x.stale);
console.log(JSON.stringify(printer, null, 1));

```

## ここまでの呼び出し

- `AotCompilation.initialize`（2 回目、`_enableHmr`） — aot-compilation.ts 93〜121 — *前回の SourceFile を取っておく*
  - `collectHmrCandidates(modifiedFiles, angularProgram, staleSourceFiles)` — 159 → hmr-candidates.ts 25
    - `getComponentsWithTemplateFile` / `getComponentsWithStyleFile` — 34・41
    - `analyzeFileUpdates(stale, updated, compiler)` — 62 → 85
      - `getMeta`・デコレーターの位置と形 — 124 → 138〜158
      - `equalRangeText(…expression…)` — 167 → 319
      - `analyzeMetaUpdates` — 179 → 240
  - `emitHmrUpdateModule(node)` — aot-compilation.ts 181
- `emitAffectedFiles` → `printSourceFileWithMap` — aot-compilation.ts 439 → typescript-printer.ts 123
  - `createTextWriter`・`createSourceMapGenerator`・`writeFile` — 142・144・155

## テストと直し方

| spec | describe / it と行 | この章のどこ |
| --- | --- | --- |
| （無い） | 44129f66a3 と main に hmr-candidates.ts と typescript-printer.ts の単体の spec は無い | 1〜4・6 節 |
| builders/dev-server/tests/behavior/component-updates\_spec.ts | describe Behavior: "Component updates"（15 行目）：component の query が無いと 400（23 行目）、更新が無いときの空の JS（34 行目）、`ngHmrMode` の define（51・68 行目）。collectHmrCandidates が候補を返す道は通らない | 5 節の周り |

この章のための unit の spec は無いので、bazel では走らせていません（[1 回目](01-bcu-aot.md)の 41 件にも入っていない）。5 節のデモの 17 組が、この章で手元で確かめた範囲です。

直すとしたら、ファイルと関数は次のとおりです。

- `styleUrls`：`hmr-candidates.ts` の `SUPPORTED_FIELD_NAMES`（217〜223 行目）の `'stylesUrl'` を `'styleUrls'` にする形です。固めるなら、同じフォルダに `hmr-candidates_spec.ts` を作り（BUILD.bazel の `unit_test_lib` の glob `src/**/*_spec.ts` に入る）、`AotCompilation` を `enableHmr: true` で 2 回 initialize して、`styleUrls` の配列を変えたときに `templateUpdates` が返ることを見る it になります（このデモの形）。
- 先頭のコメント：`equalRangeText` に `getStart()` からの範囲を渡すかは、コメントの変化を「変更」と見なすかの設計の選び方です。今の形は、間違えても読み直しになる安全側です（161〜166 行目のコメントと同じ考え）。

## 聞かれそうな質問

**Q. テンプレートを直したのにページが読み直されました。何が起きていますか？**

同じ回に、候補にならないファイルも変わっている可能性が高いです。1 節の 16〜19 行目の約束で、1 つでも対応外があれば候補を全部捨てます。デモの「template と、コンポーネントでないファイルを同時に」がそれで、hmr.ts は 197 行目で候補に入ったのに、service.ts の 207 行目で 68 行目に行き、空になりました。デコレーターが 2 つのクラス（133〜135 行目）も、テンプレートだけの変更で読み直しになります。

**Q. styleUrl と styleUrls で、HMR の効き方は違いますか？**

.css の中身を変えるだけなら同じです（41〜45 行目の `getComponentsWithStyleFile`）。違うのは .ts の中の値を変えたときで、`styleUrl` は 217〜223 行目の一覧にあるので候補になり、`styleUrls` は一覧の綴りが `'stylesUrl'` なので対応外のフィールドとして比べられ、295〜296 行目で読み直しになります。

**Q. コメントを足しただけでも読み直しになるのはなぜですか？**

比べ方が構文の意味ではなく文字そのもの（338〜344 行目）で、範囲が leading trivia を含む `pos` から始まるからです。メソッドの中のコメントは 192 行目のクラスの本体の比べで、ファイルの先頭のコメントは 207 行目の import の文の比べで、違うと判定されました。

**Q. AOT の emit は、ソースマップをどうやって作っていますか？**

Angular の変換だけを当てた構文木を、`printSourceFileWithMap`（123 行目）が TypeScript の内部の `createTextWriter` と `createSourceMapGenerator` と `printer.writeFile` で 1 回書き、157〜158 行目で文字列とマップを取り出します。公開の `printFile` はマップを作れないからです。内部の API が無い TypeScript では 134〜140 行目の assert で止まります。

## 読み終えて

- collectHmrCandidates は「1 つでも対応外があれば全部捨てる」を約束し、その判定は構文木の意味ではなく範囲の文字の比べ（equalRangeText）で行う。
- デコレーターは、位置・呼び出しの形・呼ばれる側の文字を比べ、2 つ以上なら一律に対応外。前回の形は assert ではなく null で返す。
- @Component の引数はオブジェクトのリテラルでなければ対応外で、フィールドは対応した 5 つ（名前つき）とそれ以外（並び順）に分けて比べる。5 つめが 'stylesUrl' の綴りなので、styleUrls の値の変更は読み直しになる。
- 比べる範囲は leading trivia を含む pos からなので、文の前のコメントの変更も「違う」になる。
- typescript-printer は TypeScript の内部の writer とソースマップの生成器を使い、1 回の書き込みで文字列とマップを作る。作られたノードには対応が付かない。

---

← 前: [ParallelCompilation：コンパイルをワーカーに逃がす](02-bcu-parallel.md)  
次: [AngularHost・uri・lazy-routes-transformer：ホストの差し替えと遅延ルートの書き換え](04-bcu-host.md) →
