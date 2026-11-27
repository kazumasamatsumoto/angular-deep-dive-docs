[目次](../README.md) › [@angular/build の読み残し（sass・i18n・dev-server・unit-test）](README.md) › 第 5 回 / 全 9 回

# チャンクを束ね直す：chunk-optimizer と esbuild の小道具

> builders/application/chunk-optimizer.ts・tools/esbuild/utils.ts・profiling.ts：Rolldown の出力を esbuild の metafile に按分して戻す仕組みと、そのずれ（minify の前の長さ・残るソースマップの行）、失敗したときの 1 つのエラー、出力の表・JSON のログ・ディスクへの書き出しの小道具、NG\_BUILD\_DEBUG\_PERF の計測。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bld-chunk-optimizer)

---

この章で分かること：`optimizeChunks` が Rolldown の出力を esbuild の metafile（どの出力がどの入力からできたかの表）の形にどう戻すか、失敗したときに何を返すか、そして戻した表のどこが実物とずれるか。あわせて、ビルドの時間を測る `profiling.ts` と、esbuild の結果を表やログやディスクに出す `tools/esbuild/utils.ts` の小道具を読みます。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/src/builders/application/chunk-optimizer.ts`・`tools/esbuild/profiling.ts`・`tools/esbuild/utils.ts` の、まだ引いていない行です。いつ束ね直すか（遅延チャンクが 3 つ以上、`NG_BUILD_OPTIMIZE_CHUNKS`）、main を入口にした Rolldown の呼び出し、出力と `initialFiles` の差し替えは [cli-code-splitting の章](../cli/07-cli-code-splitting.md)で、出力の表の列と予算は [cli-budgets の章](../cli/08-cli-budgets.md)と [bcu-budget の章](../bcu/05-bcu-budget.md)で読んだので繰り返しません。

1. [1. sass の url を書き換える](01-bld-sass-rebase.md)
2. [2. sass を常駐のコンパイラで動かす](02-bld-sass-service.md)
3. [3. メッセージを取り出す](03-bld-extract-i18n.md)
4. [4. 翻訳を差し込む](04-bld-i18n-inline.md)
5. **5. チャンクを束ね直す**（この章）
6. [6. ng serve の入口の残り](06-bld-dev-server-rest.md)
7. [7. Vite の middleware の残り](07-bld-vite-middlewares.md)
8. [8. unit-test と ng-packagr](08-bld-unit-test-packagr.md)
9. [9. spec と issue](09-bld-tests-issues.md)

## 0. 全体の流れと、版の違い

1. **esbuild がチャンクを書く**

   このとき metafile には、出力ごとに「入力ファイルが何バイト入ったか」（`bytesInOutput`）が書かれる。
2. **Rolldown が束ね直す**

   入力は esbuild の出力ファイルそのもの。Rolldown から見た「モジュール」は esbuild のチャンク 1 つ（cli-code-splitting の 5 節）。
3. **metafile に戻す**

   Rolldown は「元の TypeScript のファイル」を知らないので、esbuild のチャンクの中の割合で按分して、入力ごとのバイト数を作り直す（2 節）。
4. **失敗したら 1 つのエラー**

   Rolldown（か Rollup）が投げたら、出力は捨てて「Chunk optimization failed」だけを返す（3 節）。
5. **計測と表とログ**

   `NG_BUILD_DEBUG_PERF` の時間（5 節）、出力の表の前後（6 節）、ディスクへの書き出しと JSON のログ（7 節）。

サイトの依存の @angular/build 22.2.7 と 44129f66a3 を比べると、この章の範囲では 3 つ違います。22.2.7 の `optimizeChunks` のプラグインには、ソースマップを作るときだけ `augmentChunkHash`（チャンクのハッシュに元のソースマップのハッシュを混ぜる。244a1c7d15）が足されています。`profiling.ts` は中身が同じまま `src/utils/profiling.ts` に移り（e7ebbcdc25）、`getEntryPointName` は export が外れました（413c164a7c）。デモの記録は 22.2.7 のもの、引用は 44129f66a3 です。

### 1. ファイルの頭：何を約束しているか

📄 `angular-cli/packages/angular/build/src/builders/application/chunk-optimizer.ts` L9–32 （▶ の行: 12–14, 16–17, 22, 30）

```ts
 9 │ /**
10 │  * @fileoverview This file provides a function to optimize JavaScript chunks using rolldown.
11 │  * It is designed to be used after an esbuild build to further optimize the output.
12 ▶  * The main function, `optimizeChunks`, takes the result of an esbuild build,
13 ▶  * identifies the main browser entry point, and then uses rolldown to rebundle
14 ▶  * and optimize the chunks. This process can result in smaller and more efficient
15 │  * code by combining and restructuring the original chunks. The file also includes
16 ▶  * helper functions to convert rolldown's output into an esbuild-compatible
17 ▶  * metafile, allowing for consistent analysis and reporting of the build output.
18 │  */
19 │ 
20 │ import type { Message, Metafile } from 'esbuild';
21 │ import assert from 'node:assert';
22 ▶ import type { Plugin } from 'rollup';
23 │ import { BundleMergedContextResult } from '../../tools/esbuild/bundler-context';
24 │ import {
25 │   type BuildOutputFile,
26 │   BuildOutputFileType,
27 │   type InitialFileRecord,
28 │   createOutputFile,
29 │ } from '../../tools/esbuild/bundler-files';
30 ▶ import { useRolldownChunks } from '../../utils/environment-options';
31 │ import { assertIsError } from '../../utils/error';
32 │ import { toPosixPath } from '../../utils/path';
```

12〜14 行目のとおり、入口は `optimizeChunks` 1 つで、「main のブラウザの入口を見つけ、Rolldown で束ね直す」と言います。16〜17 行目が、この章の中心の「Rolldown の出力を esbuild と同じ形の metafile に直す小道具」です。後ろの段（予算・出力の表・`statsJson`）は esbuild の形しか知らないからです。22 行目、Rollup は `import type` で型だけを読みます。30 行目の `useRolldownChunks` が偽のときだけ実物の Rollup を動的に読みます（cli-code-splitting の 5 節）。

📄 `angular-cli/packages/angular/build/src/builders/application/chunk-optimizer.ts` L34–64 （▶ の行: 36–38, 56–58, 61–63）

```ts
34 │ /**
35 │  * Represents a minimal subset of a Rollup/Rolldown output asset.
36 ▶  * This is manually defined to avoid hard dependencies on both bundlers' types
37 ▶  * and to ensure compatibility since Rolldown and Rollup types have slight differences
38 ▶  * but share these core properties.
39 │  */
40 │ interface OutputAsset {
41 │   type: 'asset';
42 │   fileName: string;
43 │   source: string | Uint8Array;
44 │ }
45 │ 
46 │ /**
47 │  * Represents a minimal subset of a Rollup/Rolldown output chunk.
48 │  * This is manually defined to avoid hard dependencies on both bundlers' types
49 │  * and to ensure compatibility since Rolldown and Rollup types have slight differences
50 │  * but share these core properties.
51 │  */
52 │ interface OutputChunk {
53 │   type: 'chunk';
54 │   fileName: string;
55 │   code: string;
56 ▶   modules: Record<string, { renderedLength: number }>;
57 ▶   imports: string[];
58 ▶   dynamicImports?: string[];
59 │   exports: string[];
60 │   isEntry: boolean;
61 ▶   facadeModuleId: string | null | undefined;
62 ▶   map?: { toString(): string } | null;
63 ▶   sourcemapFileName?: string | null;
64 │ }
```

36〜38 行目、Rolldown と Rollup の型を直接使わず、両方に共通する所だけを手で書いた型です。56 行目の `modules` は「このチャンクに入ったモジュールと、出力に描いた長さ（`renderedLength`）」、57〜58 行目は静的 import と動的 import の先、61 行目の `facadeModuleId` はチャンクの元になった入口のモジュールです。62〜63 行目のソースマップは、`sourcemap` を付けたときだけあります。

📄 `angular-cli/packages/angular/build/src/builders/application/chunk-optimizer.ts` L205–221 （▶ の行: 208–211, 214）

```ts
205 │ /**
206 │  * Optimizes the chunks of a build result using rolldown.
207 │  *
208 ▶  * This function takes the output of an esbuild build, identifies the main browser entry point,
209 ▶  * and uses rolldown to bundle and optimize the JavaScript chunks. The optimized chunks
210 ▶  * replace the original ones in the build result, and the metafile is updated to reflect
211 ▶  * the changes.
212 │  *
213 │  * @param original The original build result from esbuild.
214 ▶  * @param sourcemap A boolean or 'hidden' to control sourcemap generation.
215 │  * @returns A promise that resolves to the updated build result with optimized chunks.
216 │  */
217 │ // eslint-disable-next-line max-lines-per-function
218 │ export async function optimizeChunks(
219 │   original: BundleMergedContextResult,
220 │   sourcemap: boolean | 'hidden',
221 │ ): Promise<BundleMergedContextResult> {
```

209〜211 行目の約束は「束ね直したチャンクが元のチャンクに置き換わり、metafile もそれに合わせて直される」です。2・4 節で、この「合わせて直す」がどこまで本当かを確かめます。214 行目の `'hidden'` は、呼ぶ側（execute-build.ts）が `sourceMap.hidden` のときに渡す値で、そのまま Rolldown の `sourcemap` に渡ります。

## 2. Rolldown の出力を metafile に戻す：按分

📄 `angular-cli/packages/angular/build/src/builders/application/chunk-optimizer.ts` L66–102 （▶ の行: 76–77, 81–84, 90, 92–96）

```ts
 66 │ /**
 67 │  * Converts the output of a bundle build into an esbuild-compatible metafile.
 68 │  * @param bundleOutput The output of a bundle build.
 69 │  * @param originalMetafile The original esbuild metafile from the build.
 70 │  * @returns An esbuild-compatible metafile.
 71 │  */
 72 │ function bundleOutputToEsbuildMetafile(
 73 │   bundleOutput: (OutputChunk | OutputAsset)[],
 74 │   originalMetafile: Metafile,
 75 │ ): Metafile {
 76 ▶   const newMetafile: Metafile = {
 77 ▶     inputs: originalMetafile.inputs,
 78 │     outputs: {},
 79 │   };
 80 │ 
 81 ▶   const intermediateChunkSizes: Record<string, number> = {};
 82 ▶   for (const [path, output] of Object.entries(originalMetafile.outputs)) {
 83 ▶     intermediateChunkSizes[path] = Object.values(output.inputs).reduce(
 84 ▶       (s, i) => s + i.bytesInOutput,
 85 │       0,
 86 │     );
 87 │   }
 88 │ 
 89 │   for (const chunk of bundleOutput) {
 90 ▶     if (chunk.type === 'asset') {
 91 │       newMetafile.outputs[chunk.fileName] = {
 92 ▶         bytes:
 93 ▶           typeof chunk.source === 'string'
 94 ▶             ? Buffer.byteLength(chunk.source, 'utf8')
 95 ▶             : chunk.source.length,
 96 ▶         inputs: {},
 97 │         imports: [],
 98 │         exports: [],
 99 │       };
100 │       continue;
101 │     }
102 │ 
```

1. **77 行目：inputs は元の表をそのまま使う**

   コピーではなく同じオブジェクトです。そのため 133〜135 行目の「無ければ足す」は、元の表にある名前に対しては何も起きません。
2. **81〜87 行目：esbuild のチャンクごとの「中身の合計」**

   出力の `bytes` ではなく、入力ごとの `bytesInOutput` を足した値。esbuild が足した `import` の行や区切りは含まない。
3. **90〜100 行目：アセット**

   Rolldown の出力のうちチャンクでないもの（ソースマップの .map）は、大きさだけの行にする。

📄 `angular-cli/packages/angular/build/src/builders/application/chunk-optimizer.ts` L103–139 （▶ の行: 105–107, 111–112, 116–118, 123–124, 126, 128, 130）

```ts
103 │     const newOutputInputs: Record<string, { bytesInOutput: number }> = {};
104 │     if (chunk.modules) {
105 ▶       for (const [moduleId, renderedModule] of Object.entries(chunk.modules)) {
106 ▶         const originalOutputEntry = originalMetafile.outputs[moduleId];
107 ▶         if (!originalOutputEntry?.inputs) {
108 │           continue;
109 │         }
110 │ 
111 ▶         const totalOriginalBytesInModule = intermediateChunkSizes[moduleId];
112 ▶         if (totalOriginalBytesInModule === 0) {
113 │           continue;
114 │         }
115 │ 
116 ▶         // Read once per module: in Rolldown, `renderedLength` is an uncached getter that
117 ▶         // copies the entire module code across the NAPI bridge on each access.
118 ▶         const { renderedLength } = renderedModule;
119 │         
120 │         for (const [originalInputPath, originalInputInfo] of Object.entries(
121 │           originalOutputEntry.inputs,
122 │         )) {
123 ▶           const proportion = originalInputInfo.bytesInOutput / totalOriginalBytesInModule;
124 ▶           const newBytesInOutput = Math.floor(renderedLength * proportion);
125 │ 
126 ▶           const existing = newOutputInputs[originalInputPath];
127 │           if (existing) {
128 ▶             existing.bytesInOutput += newBytesInOutput;
129 │           } else {
130 ▶             newOutputInputs[originalInputPath] = { bytesInOutput: newBytesInOutput };
131 │           }
132 │ 
133 │           if (!newMetafile.inputs[originalInputPath]) {
134 │             newMetafile.inputs[originalInputPath] = originalMetafile.inputs[originalInputPath];
135 │           }
136 │         }
137 │       }
138 │     }
139 │ 
```

105 行目のモジュールの ID は esbuild の出力の名前（`chunk-U5XGQR5U.js` など）なので、106 行目で元の metafile の出力の行を引けます。111〜114 行目、中身の合計が 0 のチャンクは、0 で割らないように飛ばします。123〜124 行目が按分です。元のチャンクの中で、ある入力（例：`@angular/core` のファイル）が占めていた割合を、Rolldown が描いた長さに掛けます。126〜131 行目、同じ入力が複数のモジュールから来たら足します。

116〜118 行目のコメントは、Rolldown の `renderedLength` が「読むたびにモジュールのコードを丸ごと Rust の側からコピーする getter」だと言います。以前は 123 行目の内側のループで毎回読んでいたので、入力 3,588 個・17 MB の main で約 62 GB のコピーになり、この関数だけで約 150 秒かかっていました（#34044、f1afa603b4 で直る）。この直しのとき 119 行目に空白だけの行が残り、新しい本家で消えています。

> [!WARNING]
> **ハマりどころ**
>
> `renderedLength` は、Rolldown が `minify` をかける**前**の長さです。デモの「renderedLength」で、main に入った 2 つのモジュールの `renderedLength` は 145,668 と 116,301 で、足すと 261,969。cli-code-splitting の章の 306 行目の `minify: { mangle: false, compress: false }`（空白を詰めるだけ）をかけた main の実物は 208,302 バイトで、minify を切ると 262,166 バイトでした。そのため束ね直したあとの metafile（`statsJson` の `browser-stats.json`）では、main の入力の `bytesInOutput` の合計が 261,921 になり、main の `bytes`（208,302）を約 26% 上回ります。esbuild のままの metafile では、合計（93,334）は `bytes`（94,769）を超えません。新しい本家（1e4b0960d8）も 118・124 行目は同じです。

## 3. 失敗したとき：1 つのエラーと、閉じ忘れない finally

📄 `angular-cli/packages/angular/build/src/builders/application/chunk-optimizer.ts` L183–203 （▶ の行: 189, 192, 195–196, 198–199）

```ts
183 │ /**
184 │  * Creates an esbuild message object for a chunk optimization failure.
185 │  * @param message The error message detailing the cause of the failure.
186 │  * @returns A partial esbuild message object.
187 │  */
188 │ function createChunkOptimizationFailureMessage(message: string): Message {
189 ▶   // Most of these fields are not actually needed for printing the error
190 │   return {
191 │     id: '',
192 ▶     text: 'Chunk optimization failed',
193 │     detail: undefined,
194 │     pluginName: '',
195 ▶     location: null,
196 ▶     notes: [
197 │       {
198 ▶         text: message,
199 ▶         location: null,
200 │       },
201 │     ],
202 │   };
203 │ }
```

📄 `angular-cli/packages/angular/build/src/builders/application/chunk-optimizer.ts` L335–345 （▶ の行: 336, 338–340, 342–343）

```ts
335 │   } catch (e) {
336 ▶     assertIsError(e);
337 │ 
338 ▶     return {
339 ▶       errors: [createChunkOptimizationFailureMessage(e.message)],
340 ▶       warnings: original.warnings,
341 │     };
342 ▶   } finally {
343 ▶     await bundle?.close();
344 │   }
345 │ 
```

1. **336 行目：Error であることを確かめる**

   `assertIsError` は、Error でない値が投げられたら、それ自体を投げ直す。
2. **338〜341 行目：エラーだけの結果**

   `errors` と元の `warnings` だけ。出力ファイルも metafile も持たない形なので、呼ぶ側（execute-build.ts）は esbuild が成功していてもビルドを失敗にする。
3. **192・196〜201 行目：見出しと注**

   見出しは常に「Chunk optimization failed」で、本当の理由は注（notes）に入る。189 行目のコメントのとおり、位置（`location`）は持たない。
4. **342〜344 行目：bundle を閉じる**

   成功しても失敗しても `bundle.close()`。Rolldown は Rust の側にメモリを持つので、閉じないと残る。`bundle?.` なのは、`rolldown()` の前で失敗すると `bundle` がまだ無いから。

デモの「Rollup が無い」は、Rollup の入っていないこのサイトの node\_modules で `NG_BUILD_CHUNKS_ROLLDOWN=0` にした記録です。cli-code-splitting の章の 318 行目のエラーが 339 行目で注になり、ng build は「✔ Building...」のあとに失敗して終了コード 1 になりました。

📄 `angular-cli/packages/angular/build/src/builders/application/chunk-optimizer.ts` L163–181 （▶ の行: 173, 175–179）

```ts
163 │   }
164 │ 
165 │   return newMetafile;
166 │ }
167 │ 
168 │ /**
169 │  * Creates an InitialFileRecord object with a specified depth.
170 │  * @param depth The depth of the file in the dependency graph.
171 │  * @returns An InitialFileRecord object.
172 │  */
173 ▶ function createInitialFileRecord(depth: number): InitialFileRecord {
174 │   return {
175 ▶     type: 'script',
176 ▶     entrypoint: false,
177 ▶     external: false,
178 ▶     serverFile: false,
179 ▶     depth,
180 │   };
181 │ }
```

束ね直したあとの初期ファイル（cli-code-splitting の 6 節の 423 行目）の記録はこの関数で作ります。名前（`name`）を持たず、入口でもないので、出力の表では Names が `-` の初期ファイルになります。44129f66a3 の 8 月の直し（04b532772f、#33773）までは、作った記録を `initialFiles` に入れ忘れていて、main が静的に読むチャンクが Lazy の側に並び、Initial total が約 3 分の 1 に見えていました。新しい本家ではこの関数ごと消え、BundlerContext と同じ `findTransitiveInitialFiles` を使います（2160454a50）。さらに Rolldown の `codeSplitting.groups` で、main から静的に辿れるモジュールを main 1 つにまとめます（97efdcf913）。

## 4. 戻した metafile に残るもの：ソースマップの行

cli-code-splitting の章の 349〜360 行目は、「束ね直しに使わなかった出力」を元の metafile から戻します。使ったかどうかの `usedChunks` には、Rolldown の `load` が読んだ .js の名前しか入りません（cli-code-splitting の 286 行目）。そのため、ソースマップを作るビルドでは、使ったチャンクの .js.map の行が「使わなかった出力」として戻ります。一方、出力ファイルの一覧からは、364〜368 行目でそれらの .map が消されます。

| sourceMap: true の本番ビルドの browser-stats.json | 行の数 | ディスクにあるか |
| --- | --- | --- |
| Rolldown のチャンク（.js）とその .map | 6 + 6 | ある |
| esbuild のチャンクの .map（chunk-R4EQEKAK.js.map など） | 6 | 無い（.js は消え、.map の行だけ残る） |
| main-SD2A4D22.js.map | 1 | ある。ただし bytes は esbuild の 524,692 のままで、実物は 1,942,701 |

main の .js.map は名前が束ね直しの前後で同じ（main の名前は esbuild のものが残る）なので、Rolldown が作った行を元の行が上書きします。出力の表と予算は出力ファイルの一覧から作るので、この行が表に出ることはありません。食い違いが見えるのは `statsJson` を読む道具（esbuild の Bundle Size Analyzer など）です。新しい本家も 349〜352 行目は同じです。

## 5. 計測：NG\_BUILD\_DEBUG\_PERF と profiling.ts

📄 `angular-cli/packages/angular/build/src/tools/esbuild/profiling.ts` L9–41 （▶ の行: 9, 11, 14, 18, 22, 24, 30, 39）

```ts
 9 ▶ import { debugPerformance } from '../../utils/environment-options';
10 │ 
11 ▶ let cumulativeDurations: Map<string, number[]> | undefined;
12 │ 
13 │ export function resetCumulativeDurations(): void {
14 ▶   cumulativeDurations?.clear();
15 │ }
16 │ 
17 │ export function getAndClearCumulativeDurations(): Record<string, number[]> | undefined {
18 ▶   if (!cumulativeDurations || cumulativeDurations.size === 0) {
19 │     return undefined;
20 │   }
21 │ 
22 ▶   const data = Object.fromEntries(cumulativeDurations);
23 │ 
24 ▶   cumulativeDurations.clear();
25 │ 
26 │   return data;
27 │ }
28 │ 
29 │ export function mergeCumulativeDurations(data: Record<string, number[]>): void {
30 ▶   cumulativeDurations ??= new Map();
31 │ 
32 │   for (const [name, durations] of Object.entries(data)) {
33 │     let existing = cumulativeDurations.get(name);
34 │     if (!existing) {
35 │       existing = [];
36 │       cumulativeDurations.set(name, existing);
37 │     }
38 │ 
39 ▶     existing.push(...durations);
40 │   }
41 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/profiling.ts` L43–69 （▶ の行: 44, 48, 53, 61, 64, 66）

```ts
43 │ export function logCumulativeDurations(): void {
44 ▶   if (!debugPerformance || !cumulativeDurations) {
45 │     return;
46 │   }
47 │ 
48 ▶   for (const [name, durations] of cumulativeDurations) {
49 │     let total = 0;
50 │     let min;
51 │     let max;
52 │     for (const duration of durations) {
53 ▶       total += duration;
54 │       if (min === undefined || duration < min) {
55 │         min = duration;
56 │       }
57 │       if (max === undefined || duration > max) {
58 │         max = duration;
59 │       }
60 │     }
61 ▶     const average = total / durations.length;
62 │     // eslint-disable-next-line no-console
63 │     console.log(
64 ▶       `DURATION[${name}]: ${total.toFixed(9)}s [count: ${durations.length}; avg: ${average.toFixed(
65 │         9,
66 ▶       )}s; min: ${min?.toFixed(9)}s; max: ${max?.toFixed(9)}s]`,
67 │     );
68 │   }
69 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/profiling.ts` L100–112 （▶ の行: 102–103, 106, 108, 110）

```ts
100 │ 
101 │ export function profileSync<T>(name: string, action: () => T, cumulative?: boolean): T {
102 ▶   if (!debugPerformance) {
103 ▶     return action();
104 │   }
105 │ 
106 ▶   const startTime = process.hrtime.bigint();
107 │   try {
108 ▶     return action();
109 │   } finally {
110 ▶     recordDuration(name, startTime, cumulative);
111 │   }
112 │ }
```

9 行目の `debugPerformance` は `NG_BUILD_DEBUG_PERF` が真のときだけ真です（[bcu-options の章](../bcu/08-bcu-options.md)）。102〜104 行目、偽なら `profileSync` は何も測らずに関数を呼ぶだけです。測る側の本体 `profileAsync` と `recordDuration`（71〜99 行目）は [build の章](../cli/02-build.md)で読みました。累積（`cumulative`）でない計測はその場で 1 行出し、累積の計測は 11 行目のモジュールの変数に名前ごとの配列でためます。

1. **14 行目：ビルドの始めに空にする**

   compiler-plugin の onStart が呼ぶ（[cli-cache-watch の章](../cli/10-cli-cache-watch.md)の 181 行目）。
2. **17〜27 行目：ワーカーの側で取り出して空にする**

   並列の型検査のワーカー（parallel-worker.ts の `diagnose`、[cli-angular-compilation の章](../cli/03-cli-angular-compilation.md)）が、ためた配列を結果に付けて返す。ワーカーは別のスレッドなので、11 行目の変数もワーカーごとに別。
3. **29〜41 行目：メインのスレッドで混ぜる**

   ParallelCompilation の `diagnoseFiles` が、返ってきた配列を名前ごとに足す。39 行目、配列は置き換えずに後ろへ足す。
4. **43〜69 行目：onEnd で 1 行ずつ出す**

   名前ごとに合計・回数・平均・最小・最大を 9 桁の秒で出す（64〜66 行目）。

デモの「NG\_BUILD\_DEBUG\_PERF」は、小さなアプリ（遅延ルート 4 つ）の記録です。`NG_EMIT_JS*` の合計は約 14〜16 秒と出ますが、ビルド全体は 1 秒かかっていません。この名前は esbuild の onLoad ごとの時間を足したもので（compiler-plugin.ts の `profileAsync('NG_EMIT_JS*', …, true)`）、onLoad は同時にいくつも走るので、重なった時間が何重にも数えられるからです。`OPTIMIZE_CHUNKS` は本番の設定でだけ出て、development の設定（optimization: false）では出ません。

並列の型検査の時間（`NG_DIAGNOSTICS_*`）は、ワーカーの結果が 41 行目までに混ざったときだけ onEnd の 1 回目の出力に入ります。onEnd は 48 行目の出力（compiler-plugin.ts の 644 行目）のあとで診断の promise を待つからです（cli-angular-compilation の章の 644〜658 行目）。手元の記録では、並列のとき（既定）も `NG_BUILD_PARALLEL_TS=0` のときも、型検査が先に終わっていて、どちらにも出ました。

## 6. 出力の表の前と後：logBuildStats と名前

📄 `angular-cli/packages/angular/build/src/tools/esbuild/utils.ts` L9–47 （▶ の行: 27, 33–36, 38–41, 45–46）

```ts
 9 │ import { BuilderContext } from '@angular-devkit/architect';
10 │ import { BuildOptions, Metafile, OutputFile, formatMessages } from 'esbuild';
11 │ import { Listr } from 'listr2';
12 │ import { basename, join } from 'node:path';
13 │ import { pathToFileURL } from 'node:url';
14 │ import { brotliCompress } from 'node:zlib';
15 │ import { NormalizedApplicationBuildOptions } from '../../builders/application/options';
16 │ import { OutputMode } from '../../builders/application/schema';
17 │ import { BudgetCalculatorResult } from '../../utils/bundle-calculator';
18 │ 
19 │ import { BundleStats, generateEsbuildBuildStatsTable } from '../../utils/stats-table';
20 │ import {
21 │   BuildOutputAsset,
22 │   ExecutionResult,
23 │   PrerenderedRoutesRecord,
24 │ } from './bundler-execution-result';
25 │ import { type BuildOutputFile, BuildOutputFileType, type InitialFileRecord } from './bundler-files';
26 │ 
27 ▶ export function logBuildStats(
28 │   metafiles: Metafile[],
29 │   outputFiles: BuildOutputFile[],
30 │   initial: Map<string, InitialFileRecord>,
31 │   budgetFailures: BudgetCalculatorResult[] | undefined,
32 │   colors: boolean,
33 ▶   changedFiles?: Set<string>,
34 ▶   estimatedTransferSizes?: Map<string, number>,
35 ▶   ssrOutputEnabled?: boolean,
36 ▶   verbose?: boolean,
37 │ ): string {
38 ▶   // Remove the i18n subpath in case the build is using i18n.
39 ▶   // en-US/main.js -> main.js
40 ▶   const normalizedChangedFiles: Set<string> = new Set(
41 ▶     [...(changedFiles ?? [])].map((f) => basename(f)),
42 │   );
43 │   const browserStats: BundleStats[] = [];
44 │   const serverStats: BundleStats[] = [];
45 ▶   let unchangedCount = 0;
46 ▶   let componentStyleChange = false;
47 │ 
```

`logBuildStats` の真ん中（48〜96 行目、出力ごとに Initial か Lazy かを分けて表にする所）は cli-budgets の章と build の章で読みました。ここでは頭と後ろです。33 行目の `changedFiles` は watch の再ビルドで変わったファイルの集合で、38〜42 行目、i18n のときの `en-US/main.js` のような頭のフォルダを `basename` で落とします。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/utils.ts` L97–121 （▶ の行: 97–99, 101, 104–105, 111, 117–118）

```ts
 97 ▶   } else if (changedFiles !== undefined) {
 98 ▶     if (componentStyleChange) {
 99 ▶       return '\nComponent stylesheet(s) changed.\n';
100 │     } else {
101 ▶       return '\nNo output file changes.\n';
102 │     }
103 │   }
104 ▶   if (unchangedCount > 0) {
105 ▶     return `Unchanged output files: ${unchangedCount}`;
106 │   }
107 │ 
108 │   return '';
109 │ }
110 │ 
111 ▶ export function getChunkNameFromMetafile(
112 │   metafiles: Metafile[] | Metafile,
113 │   file: string,
114 │ ): string | undefined {
115 │   const metafileArray = Array.isArray(metafiles) ? metafiles : [metafiles];
116 │   for (const metafile of metafileArray) {
117 ▶     if (metafile.outputs[file]?.entryPoint) {
118 ▶       return getEntryPointName(metafile.outputs[file].entryPoint);
119 │     }
120 │   }
121 │ }
```

1. **表があれば表だけを返す**

   直前の 86〜96 行目（[build の章](../cli/02-build.md)で引いた所）で、変わったファイルだけの表（cli-budgets の章の 55〜58 行目）でも、表を作って `return` する。
2. **97〜103 行目：表が空で、watch の再ビルドなら**

   コンポーネントのスタイルだけが変わったなら「Component stylesheet(s) changed.」、それ以外は「No output file changes.」。
3. **104〜106 行目：「Unchanged output files: N」**

   `unchangedCount` が増えるのは `changedFiles` が空でないときだけ（cli-budgets の 55 行目）。そのとき表があれば 96 行目で、無ければ 97 行目の分かれ道で先に返るので、**この行に来る道がありません**。

104〜106 行目は、ログを関数の中で出していた頃（5a2539883b）は表のあとに続けて出ていました。JSON のログのために「文字列を返す」形に直したとき（f4f535653a、2024-01）、表の側（96 行目）が先に `return` するようになり、届かなくなりました。デモの「表の前と後」で、`changedFiles` を 1 つにすると表は 1 行になり、合計の行も「Unchanged output files」も出ません。新しい本家も同じです。

111〜121 行目の `getChunkNameFromMetafile` は、出力の行に `entryPoint` があれば 118 行目で表の Names 列の名前にします。束ね直したあとでも Names に `a` や `b` が出るのは、cli-code-splitting の章の 146〜153 行目で `entryPoint` を引き継いでいるからです。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/utils.ts` L299–315 （▶ の行: 300–301, 310–314）

```ts
299 │ /**
300 ▶  * Ascertain whether the application operates without `zone.js`, we currently rely on the polyfills setting to determine its status.
301 ▶  * If a file with an extension is provided or if `zone.js` is included in the polyfills, the application is deemed as not zoneless.
302 │  * @param polyfills An array of polyfills
303 │  * @returns true, when the application is considered as zoneless.
304 │  */
305 │ export function isZonelessApp(polyfills: string[] | undefined): boolean {
306 │   // TODO: Instead, we should rely on the presence of zone.js in the polyfills build metadata.
307 │   return !polyfills?.some((p) => p === 'zone.js' || /\.[mc]?[jt]s$/.test(p));
308 │ }
309 │ 
310 ▶ export function getEntryPointName(entryPoint: string): string {
311 ▶   return basename(entryPoint)
312 ▶     .replace(/(.*:)/, '') // global:bundle.css  -> bundle.css
313 ▶     .replace(/\.[cm]?[jt]s$/, '')
314 ▶     .replace(/[\\/.]/g, '-');
315 │ }
```

名前の作り方は 311〜314 行目の 3 つの置き換えです。`global:bundle.css` の `global:` を落とし、拡張子を落とし、残った `/``\``.` を `-` にします。`src/app/pages/a.ts` は `a` になります。300〜301 行目（`isZonelessApp` の説明）の本体は [boot-application-build の章](../boot/04-boot-application-build.md)で読みました。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/utils.ts` L123–130 （▶ の行: 123, 127–128）

```ts
123 ▶ export async function calculateEstimatedTransferSizes(
124 │   outputFiles: OutputFile[],
125 │ ): Promise<Map<string, number>> {
126 │   const sizes = new Map<string, number>();
127 ▶   if (outputFiles.length <= 0) {
128 ▶     return sizes;
129 │   }
130 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/utils.ts` L162–191 （▶ の行: 164–165, 170, 172, 177, 181, 184, 189–190）

```ts
162 │ 
163 │     // Covers the case where no files need to be compressed
164 ▶     if (completeCount >= outputFiles.length) {
165 ▶       resolve(sizes);
166 │     }
167 │   });
168 │ }
169 │ 
170 ▶ export async function withSpinner<T>(text: string, action: () => T | Promise<T>): Promise<T> {
171 │   let result;
172 ▶   const taskList = new Listr(
173 │     [
174 │       {
175 │         title: text,
176 │         async task() {
177 ▶           result = await action();
178 │         },
179 │       },
180 │     ],
181 ▶     { rendererOptions: { clearOutput: true } },
182 │   );
183 │ 
184 ▶   await taskList.run();
185 │ 
186 │   return result as T;
187 │ }
188 │ 
189 ▶ export async function withNoProgress<T>(text: string, action: () => T | Promise<T>): Promise<T> {
190 ▶   return action();
191 │ }
```

Estimated transfer size の列を作る `calculateEstimatedTransferSizes` の本体（brotli の圧縮、131〜161 行目）は cli-budgets の章です。127〜129 行目は出力が無いときの近道で、164〜166 行目は「圧縮する対象が 1 つも無かった」ときに promise を解く行です。170〜187 行目の `withSpinner` は listr2 のタスクを 1 つだけ作り、181 行目の `clearOutput` で終わったら表示を消します。`progress: false` のときは 189〜191 行目の何もしない版が選ばれます（build-action.ts の 92 行目、[abl-results の章](../abl/02-abl-results.md)）。

### 7. 書き出しと JSON のログ

📄 `angular-cli/packages/angular/build/src/tools/esbuild/utils.ts` L214–242 （▶ の行: 215, 220–222, 225–226, 229, 237–239）

```ts
214 │ 
215 ▶ const MAX_CONCURRENT_WRITES = 64;
216 │ export async function emitFilesToDisk<T = BuildOutputAsset | BuildOutputFile>(
217 │   files: readonly T[],
218 │   writeFileCallback: (file: T) => Promise<void>,
219 │ ): Promise<void> {
220 ▶   // Write files in groups of MAX_CONCURRENT_WRITES to avoid too many open files
221 ▶   for (let fileIndex = 0; fileIndex < files.length;) {
222 ▶     const groupMax = Math.min(fileIndex + MAX_CONCURRENT_WRITES, files.length);
223 │ 
224 │     const actions = [];
225 ▶     while (fileIndex < groupMax) {
226 ▶       actions.push(writeFileCallback(files[fileIndex++]));
227 │     }
228 │ 
229 ▶     await Promise.all(actions);
230 │   }
231 │ }
232 │ 
233 │ interface BuildManifest {
234 │   errors: string[];
235 │   warnings: string[];
236 │   outputPaths: {
237 ▶     root: URL;
238 ▶     server?: URL | undefined;
239 ▶     browser: URL;
240 │   };
241 │   prerenderedRoutes: PrerenderedRoutesRecord;
242 │ }
```

215 行目、同時に開くファイルは 64 個までです。221 行目の `for` は増分を書かず、226 行目の `fileIndex++` で進めます。64 個ずつの組を作り、229 行目で組の全部が終わるのを待ってから次の組に進みます。デモでは 150 個のファイルに 5 ミリ秒ずつ待つ書き込みを渡し、同時に走った数の最大は 64 でした。`emitFilesToDisk` は `@angular/build/private` からも出ています（[8 回目](08-bld-unit-test-packagr.md)）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/utils.ts` L244–272 （▶ の行: 255, 258–259, 261–262, 264–266, 271）

```ts
244 │ export async function createJsonBuildManifest(
245 │   result: ExecutionResult,
246 │   normalizedOptions: NormalizedApplicationBuildOptions,
247 │ ): Promise<string> {
248 │   const {
249 │     colors: color,
250 │     outputOptions: { base, server, browser },
251 │     ssrOptions,
252 │     outputMode,
253 │   } = normalizedOptions;
254 │ 
255 ▶   const { warnings, errors, prerenderedRoutes } = result;
256 │ 
257 │   const manifest: BuildManifest = {
258 ▶     errors: errors.length ? await formatMessages(errors, { kind: 'error', color }) : [],
259 ▶     warnings: warnings.length ? await formatMessages(warnings, { kind: 'warning', color }) : [],
260 │     outputPaths: {
261 ▶       root: pathToFileURL(base),
262 ▶       browser: pathToFileURL(join(base, browser)),
263 │       server:
264 ▶         outputMode !== OutputMode.Static && ssrOptions
265 ▶           ? pathToFileURL(join(base, server))
266 ▶           : undefined,
267 │     },
268 │     prerenderedRoutes,
269 │   };
270 │ 
271 ▶   return JSON.stringify(manifest, undefined, 2);
272 │ }
```

`NG_BUILD_LOGS_JSON=1` のとき、application builder は表の代わりにこの JSON をログに足します（builders/application/index.ts の 105 行目、[boot-application-build の章](../boot/04-boot-application-build.md)）。258〜259 行目、エラーと警告は esbuild の `formatMessages` で、端末に出すときと同じ文字列にします。264〜266 行目、`outputMode` が static でなく SSR があるときだけ server の場所を入れ、それ以外は `undefined` なので、271 行目の `JSON.stringify` で鍵ごと消えます（デモの JSON に server が無いのはこのため）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/utils.ts` L274–297 （▶ の行: 282–283, 286–287, 290–291, 294–295）

```ts
274 │ export async function logMessages(
275 │   logger: BuilderContext['logger'],
276 │   executionResult: ExecutionResult,
277 │   color?: boolean,
278 │   jsonLogs?: boolean,
279 │ ): Promise<void> {
280 │   const { warnings, errors, logs } = executionResult;
281 │ 
282 ▶   if (logs.length) {
283 ▶     logger.info(logs.join('\n'));
284 │   }
285 │ 
286 ▶   if (jsonLogs) {
287 ▶     return;
288 │   }
289 │ 
290 ▶   if (warnings.length) {
291 ▶     logger.warn((await formatMessages(warnings, { kind: 'warning', color })).join('\n'));
292 │   }
293 │ 
294 ▶   if (errors.length) {
295 ▶     logger.error((await formatMessages(errors, { kind: 'error', color })).join('\n'));
296 │   }
297 │ }
```

282〜284 行目、`logs`（表や JSON の文字列）は先に出します。286〜288 行目、JSON のログのときは警告とエラーを別に出しません。JSON の中に 258〜259 行目で入っているからです。

> **🧪 DEMO — 本物の optimizeChunks とビルドの記録（@angular/build 22.2.7・rolldown 1.2.16）**
>
> 遅延ルート 4 つ（a・b は同じ表のモジュールを使う）の小さなアプリを ng build した記録と、esbuild のままの出力から `optimizeChunks` を直接呼んだ記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bld-chunk-optimizer)

どう録ったか：

1. **アプリ**

   手元の作業フォルダ（`<app>`）に、下の main.ts と 4 つのページ、a・b だけが使う表のモジュールを置き、node\_modules はサイトのものを symlink で借りました。angular.json の本番の設定は `optimization: true`・`outputHashing: "all"`・`statsJson: true` です。
2. **ng build**

   既定・`NG_BUILD_OPTIMIZE_CHUNKS=0`・`NG_BUILD_CHUNKS_ROLLDOWN=0`・`NG_BUILD_DEBUG_PERF=1`（並列・`NG_BUILD_PARALLEL_TS=0`・development）・`NG_BUILD_LOGS_JSON=1` の出力をそのまま残しました。
3. **optimizeChunks を直接**

   `NG_BUILD_OPTIMIZE_CHUNKS=0` の出力と browser-stats.json から、BundleMergedContextResult を組み立て直して呼びました（record-chunks.mjs）。初期ファイルは BundlerContext と同じ「main と、そこから静的 import で辿れるもの」です。

📄 `<app>/src/main.ts`

```ts
import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, RouterLink, RouterOutlet, Routes } from '@angular/router';
import { shout } from './app/shared';

const routes: Routes = [
  { path: 'a', loadComponent: () => import('./app/pages/a').then((m) => m.PageA) },
  { path: 'b', loadComponent: () => import('./app/pages/b').then((m) => m.PageB) },
  { path: 'c', loadComponent: () => import('./app/pages/c').then((m) => m.PageC) },
  { path: 'd', loadComponent: () => import('./app/pages/d').then((m) => m.PageD) },
];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `<h1>{{ title }}</h1><a routerLink="/a">a</a> <a routerLink="/b">b</a> <a routerLink="/c">c</a> <a routerLink="/d">d</a><router-outlet />`,
})
class App {
  title = shout('bld demo');
}

bootstrapApplication(App, { providers: [provideRouter(routes)] });

```

📄 `record-chunks.mjs`

```js
// esbuild のまま（NG_BUILD_OPTIMIZE_CHUNKS=0）で ng build した出力と browser-stats.json から
// BundleMergedContextResult を組み立て直し、@angular/build 22.2.7 の本物の optimizeChunks に通す。
// 使い方: node record-chunks.mjs <app> <dist名> <sourcemap:0|1>
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const [app, distName, smArg] = process.argv.slice(2);
const require = createRequire(join(app, 'package.json'));
const build = join(app, 'node_modules/@angular/build/src');
const { optimizeChunks } = require(join(build, 'builders/application/chunk-optimizer.js'));
const { createOutputFile, BuildOutputFileType } = require(join(build, 'tools/esbuild/bundler-files.js'));
const sourcemap = smArg === '1';
// 22.2.7 の BuildOutputFile.hash は xxhash の初期化を先に待つ必要がある（ng build では起動時に済んでいる）
await require(join(build, 'utils/hash.js')).initializeHash();
const dir = join(app, 'dist', distName, 'browser');
const metafile = JSON.parse(readFileSync(join(app, 'dist', distName, 'browser-stats.json'), 'utf8'));
const outputFiles = readdirSync(dir)
  .filter((f) => f.endsWith('.js') || f.endsWith('.js.map'))
  .map((f) => createOutputFile(f, readFileSync(join(dir, f), 'utf8'), BuildOutputFileType.Browser));
// 初期ファイル: main と、main が静的 import で辿るもの（BundlerContext と同じ規則で作り直す）
const initialFiles = new Map();
const mainPath = Object.keys(metafile.outputs).find((p) => metafile.outputs[p].entryPoint === 'src/main.ts');
initialFiles.set(mainPath, { name: 'main', type: 'script', entrypoint: true, serverFile: false, depth: 0 });
const queue = [mainPath];
while (queue.length) {
  const p = queue.shift();
  for (const imp of metafile.outputs[p].imports) {
    if (imp.kind !== 'import-statement' || initialFiles.has(imp.path)) continue;
    initialFiles.set(imp.path, { type: 'script', entrypoint: false, external: false, serverFile: false, depth: initialFiles.get(p).depth + 1 });
    queue.push(imp.path);
  }
}
const snap = (r) => ({
  outputFiles: r.outputFiles.map((f) => ({ path: f.path, bytes: f.contents.byteLength })).sort((a, b) => a.path.localeCompare(b.path)),
  initialFiles: [...r.initialFiles].map(([p, rec]) => ({ path: p, depth: rec.depth, name: rec.name ?? null, entrypoint: rec.entrypoint })),
  metafile: Object.entries(r.metafiles.browser.outputs).map(([p, o]) => ({
    path: p,
    bytes: o.bytes,
    inputs: Object.keys(o.inputs).length,
    sumInputs: Object.values(o.inputs).reduce((s, i) => s + i.bytesInOutput, 0),
    entryPoint: o.entryPoint ?? null,
    imports: o.imports.map((i) => `${i.path} (${i.kind})`),
    inOutputFiles: r.outputFiles.some((f) => f.path === p),
  })).sort((a, b) => a.path.localeCompare(b.path)),
});
const original = { errors: undefined, warnings: [], metafiles: { browser: metafile, server: undefined }, outputFiles, initialFiles, externalImports: { browser: new Set(), server: new Set() } };
const before = snap(original);
const t0 = performance.now();
const result = await optimizeChunks(original, sourcemap);
const ms = Math.round(performance.now() - t0);
const out = result.errors
  ? { env: process.env.NG_BUILD_CHUNKS_ROLLDOWN ?? null, errors: result.errors.map((e) => ({ text: e.text, notes: e.notes.map((n) => n.text) })) }
  : { env: process.env.NG_BUILD_CHUNKS_ROLLDOWN ?? null, sourcemap, ms, before, after: snap(result) };
console.log(JSON.stringify(out, null, 1));

```

📄 `rendered.mjs`

```js
// Rolldown の renderedLength を、optimizeChunks と同じ入力・同じ generate の設定で読む
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const [app, distName] = process.argv.slice(2);
const require = createRequire(join(app, 'package.json'));
const { rolldown } = require('rolldown');
const dir = join(app, 'dist', distName, 'browser');
const chunks = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
const main = Object.keys(chunks).find((f) => f.startsWith('main-'));
const plugin = { name: 'angular-bundle', resolveId: (s) => { const f = s.startsWith('./') ? s.slice(2) : s; return chunks[f] ? f : { id: s, external: true }; }, load: (id) => ({ code: chunks[id] }) };
const rows = [];
for (const minify of [{ mangle: false, compress: false }, false]) {
  const b = await rolldown({ input: main, plugins: [plugin] });
  const { output } = await b.generate({ minify, chunkFileNames: (c) => `${c.name.replace(/-[a-zA-Z0-9_-]{8}$/, '')}-[hash].js` });
  await b.close();
  for (const c of output) {
    if (c.type !== 'chunk') continue;
    for (const [id, m] of Object.entries(c.modules)) rows.push({ minify: JSON.stringify(minify), chunk: c.fileName, module: id, inputBytes: Buffer.byteLength(chunks[id]), renderedLength: m.renderedLength, chunkBytes: Buffer.byteLength(c.code) });
  }
}
console.log(JSON.stringify(rows, null, 1));

```

📄 `record-utils.mjs`

```js
// @angular/build 22.2.7 の tools/esbuild/utils.js の小道具を直接呼んだ記録
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [app] = process.argv.slice(2);
const require = createRequire(join(app, 'package.json'));
const build = join(app, 'node_modules/@angular/build/src');
const u = require(join(build, 'tools/esbuild/utils.js'));
const { BuildOutputFileType } = require(join(build, 'tools/esbuild/bundler-files.js'));
const metafile = JSON.parse(readFileSync(join(app, 'dist/noopt/browser-stats.json'), 'utf8'));
const files = Object.entries(metafile.outputs).map(([path, o]) => ({ path, size: o.bytes, type: BuildOutputFileType.Browser }));
const mainPath = files.find((f) => f.path.startsWith('main-')).path;
const initial = new Map([[mainPath, { name: 'main', type: 'script', entrypoint: true, serverFile: false, depth: 0 }]]);
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const stats = [];
const call = (label, changed, extraMeta) => {
  const metas = extraMeta ? [metafile, extraMeta] : [metafile];
  const fs = extraMeta ? [...files, { path: 'app.component.css', size: 20, type: BuildOutputFileType.Browser }] : files;
  stats.push({ label, changed: changed ? [...changed] : null, text: strip(u.logBuildStats(metas, fs, initial, undefined, false, changed)) });
};
call('changedFiles なし（ng build）', undefined);
call('changedFiles に en-US/' + mainPath, new Set(['en-US/' + mainPath]));
call('changedFiles が出力に無い名前だけ', new Set(['nothing.js']));
call('changedFiles が空の Set', new Set());
call('変わったのがコンポーネントのスタイルだけ', new Set(['app.component.css']), { inputs: {}, outputs: { 'app.component.css': { bytes: 20, inputs: {}, imports: [], exports: [], 'ng-component': true } } });
const names = Object.keys(metafile.outputs).map((p) => ({ path: p, entryPoint: metafile.outputs[p].entryPoint ?? null, name: u.getChunkNameFromMetafile(metafile, p) ?? null }));
// emitFilesToDisk: 同時に走る書き込みの数の最大
let running = 0, max = 0; const groups = [];
const many = Array.from({ length: 150 }, (_, i) => ({ path: `f${i}` }));
await u.emitFilesToDisk(many, async () => { running++; max = Math.max(max, running); await new Promise((r) => setTimeout(r, 5)); running--; });
let cur = 0; const seen = [];
await u.emitFilesToDisk(many, async (f) => { seen.push(f.path); });
const emit = { files: many.length, maxConcurrent: max };
console.log(JSON.stringify({ stats, names, emit }, null, 1));

```

## テストと直し方

`chunk-optimizer.ts` にも `utils.ts` にも `profiling.ts` にも unit の spec はありません。束ね直しを通る spec は、builder を丸ごと動かす `builders/application/tests/behavior/chunk-optimization-server_spec.ts` の describe「Behavior: "Chunk optimization with a server entry point"」（114 行目）の it 1 件（127 行目）だけです。遅延ルート 4 つで閾値の 3 を超えさせ（13〜17 行目のコメント）、145 行目で `chunk-` で始まるファイルが残っていないことを「束ね直しが走った印」にしています。ほかに e2e の `tests/e2e/tests/build/chunk-optimizer*.ts`（5 ファイル）が環境変数の切り替えを見ていますが、bazel の target の外です。

| 走らせたもの | 結果 |
| --- | --- |
| `pnpm bazel test //packages/angular/build:application_integration_tests --nocache_test_results --test_output=errors '--test_arg=--filter=Chunk optimization with a server entry point'` | PASSED。25 の shard のうち 1 つで 1 spec, 0 failures、残りの 24 は 0 specs |
| 練習用の作業木（44129f66a3）に、遅延ルート 4 つ・`sourceMap: true`・`statsJson: true` でビルドし、browser-stats.json の出力の行が全部 dist にあることを見る it を足して走らせた | FAILED。`Expected $.length = 5 to equal 0.` で、残っていたのは esbuild のチャンク 5 つの .js.map（`chunk-EDZ3ST3P.js.map` など） |
| 同じ作業木で、349〜352 行目の `continue` の条件に「使ったチャンクの .map」も足して走らせた | PASSED。`--filter=Chunk optimization` で、既存の it と足した it の 2 件が 2 つの shard で 1 spec, 0 failures ずつ |

直すなら場所は 3 つです。4 節のソースマップの行は `optimizeChunks` の 349〜352 行目（364〜368 行目と同じ条件で .map を飛ばす）。2 節の按分は `bundleOutputToEsbuildMetafile` の 118〜124 行目で、チャンクのコードの実際のバイト数を `renderedLength` の合計で割った比を掛けます（`renderedLength` は 1 モジュール 1 回だけ読むこと）。6 節の届かない行は `logBuildStats` の 96 行目で、表のあとに「Unchanged output files」を足して返します。spec は、前の 2 つは上の作業木の it の形で `application/tests/behavior/` に、3 つ目は `tools/esbuild/utils.ts` の spec を新しく作るのが近道です（デモの record-utils.mjs と同じ呼び方で足ります）。

## 聞かれそうな質問

**Q. 束ね直したあと、stats.json の「どのファイルが何バイト」は信用できますか？**

出力ごとの `bytes` は、cli-code-splitting の章で引いた 157 行目でコードのバイト数を数えるので、ソースマップのコメントや debugId を足す前の大きさとしては正確です。入力ごとの `bytesInOutput` は 123〜124 行目の按分で、しかも `renderedLength` が minify の前の長さなので、合計が `bytes` を超えます（デモでは 261,921 と 208,302）。割合として読む分には使えます。

**Q. Rolldown が失敗したら、esbuild の出力で続けてくれますか？**

続けません。338〜341 行目でエラーだけの結果を返し、呼ぶ側はそれをビルドのエラーにして返します。esbuild のままにしたいときは `NG_BUILD_OPTIMIZE_CHUNKS=0` で束ね直しそのものを止めます。

**Q. `NG_BUILD_DEBUG_PERF` の `NG_EMIT_JS*` が、ビルドの時間より長いのはなぜ？**

名前の \* は累積の印で、esbuild の onLoad ごとの時間を 11 行目の表にためて、onEnd で合計を出すからです（48〜67 行目）。onLoad は並んで走るので、重なった時間を足した値になります。1 回あたりの最大（max）のほうが、どの読み込みが重いかの手がかりになります。

**Q. watch のとき「Unchanged output files: 3」のような行が出ないのはなぜ？**

104〜106 行目に来る道が無いからです。変わったファイルが出力にあれば、その手前の 96 行目（build の章）で表だけを、無ければ 97〜103 行目で「No output file changes.」を返します。代わりに、変わったファイルだけの表には合計の行が付きません（デモの「表の前と後」）。

**Q. ng build の書き出しが 64 個ずつなのはなぜ？**

215 行目の `MAX_CONCURRENT_WRITES` で、220 行目のコメントのとおり、同時に開くファイルが多すぎる（EMFILE）のを避けるためです。組の中は `Promise.all` で同時に、組と組の間は 229 行目で待ちます。

## 読み終えて

- `bundleOutputToEsbuildMetafile` は、Rolldown のモジュール（= esbuild のチャンク）の中の割合で、入力ごとのバイト数を按分して esbuild の形に戻す。`renderedLength` は 1 モジュール 1 回だけ読む（#34044）。
- 戻した表は実物とずれる。`bytesInOutput` は minify の前の長さで按分され、ソースマップを作るビルドでは消えたチャンクの .map の行が残る。
- 失敗は「Chunk optimization failed」と注 1 つ。esbuild の出力に戻らず、ビルドが失敗する。`bundle.close()` は finally で必ず呼ぶ。
- `NG_BUILD_DEBUG_PERF` は、その場の 1 行と、名前に \* の付く累積の 2 種類。累積はワーカーの分を混ぜてから onEnd で出す。
- `logBuildStats` の「Unchanged output files」は届かない行で、`emitFilesToDisk` は 64 個ずつ、JSON のログは `createJsonBuildManifest` が作る。

---

← 前: [翻訳を差し込む：i18n-locale-plugin と翻訳の読み込み](04-bld-i18n-inline.md)  
次: [ng serve の入口の残り：dev-server の options と Vite のサーバー](06-bld-dev-server-rest.md) →
