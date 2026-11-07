[目次](../README.md) › [CLI とビルド](README.md) › 第 8 回 / 全 16 回

# budgets と出力の表：Initial total が警告になるまで

> angular.json の budgets（initial / anyComponentStyle / bundle など）を calculateThresholds が警告とエラーの閾値に直し、calculateSizes が種類ごとに大きさを数え、checkBudgets が比べる行。BYTES\_IN\_KILOBYTE が 1000 である理由、stats-table がビルドの最後に出す表（Initial / Lazy、Raw size と Estimated transfer size）の作り方。

angular/angular-cli · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cli-budgets)

---

`angular.json` の `budgets` は「初期ファイルの合計が 500kB を超えたら警告、1MB を超えたらエラー」のような大きさの予算です。この章では、書いた文字列（`"500kB"` や `"5%"`）を `calculateThresholds` がバイト数の閾値に直す行、`calculateSizes` が予算の種類ごとに何を数えるか、`checkThresholds` がメッセージを作る行を読みます。最後に、ビルドの最後に出る表（Initial chunk files / Lazy chunk files、Raw size と Estimated transfer size）がどう作られるかを追います。

読む対象は angular-cli リポジトリの `packages/angular/build/src/` の `utils/bundle-calculator.ts`・`tools/esbuild/budget-stats.ts`・`tools/esbuild/utils.ts`・`utils/stats-table.ts`・`utils/format-bytes.ts` と、`builders/application/schema.json` です。

1. [1. 概観](01-cli-overview.md)
2. [2. ng build の段取り](02-build.md)
3. [3. AotCompilation](03-cli-angular-compilation.md)
4. [4. コンポーネントのスタイル](04-cli-component-styles.md)
5. [5. oxc の変換](05-cli-javascript-transformer.md)
6. [6. リンカー](06-cli-linker.md)
7. [7. 遅延チャンク](07-cli-code-splitting.md)
8. **8. budgets**（この章）
9. [9. i18n](09-cli-i18n.md)
10. [10. 再ビルドとキャッシュ](10-cli-cache-watch.md)
11. [11. HMR](11-cli-hmr.md)
12. [12. unit-test と Vitest](12-cli-unit-test.md)
13. [13. Tree と sink](13-schematics.md)
14. [14. Rule の組み立て](14-schematics-rules.md)
15. [15. ng generate component](15-schematics-component.md)
16. [16. ng add と ng update](16-cli-add-update.md)

## 0. 全体の流れ

budgets を調べるのは、esbuild のバンドルと[第 7 回](07-cli-code-splitting.md)の束ね直しが終わり、出力ファイルの一覧と `initialFiles` がそろったあとです。[第 2 回](02-build.md)の `executeBuild` は `options.budgets` があれば、`generateBudgetStats` で数える材料を作り、`checkBudgets(options.budgets, stats, true)` を回して、結果の 1 件ずつをエラーか警告としてビルドの結果に足します。この章はその呼び出しの中身です。

1. **材料を作る**

   `generateBudgetStats` が出力ファイルを「チャンク」と「アセット」の 2 つの表に並べる（1 節）。
2. **閾値に直す**

   予算 1 件ごとに `calculateThresholds` が `maximumWarning` などをバイト数の閾値の列にする（3 節）。
3. **数える**

   `calculateSizes` が予算の `type` に応じた計算機を選び、ラベル付きの大きさの列を返す（4 節）。
4. **比べる**

   `checkThresholds` が閾値を 1 つずつ比べ、超えたものだけメッセージにする（5 節）。
5. **表を出す**

   ビルドの最後に `logBuildStats` が同じ出力ファイルから表を作る。予算を超えたファイルは色が変わる（6〜7 節）。

## 1. 数える材料：generateBudgetStats

📄 `angular-cli/packages/angular/build/src/tools/esbuild/budget-stats.ts` L22–55 （▶ の行: 32, 34, 38, 42–43, 45, 47–48, 51–53）

```ts
22 │ export function generateBudgetStats(
23 │   metafile: Metafile,
24 │   outputFiles: BuildOutputFile[],
25 │   initialFiles: Map<string, InitialFileRecord>,
26 │ ): BudgetStats {
27 │   const stats: Required<BudgetStats> = {
28 │     chunks: [],
29 │     assets: [],
30 │   };
31 │ 
32 ▶   for (const { path: file, size, type } of outputFiles) {
33 │     // Exclude server bundles
34 ▶     if (type === BuildOutputFileType.ServerApplication || type === BuildOutputFileType.ServerRoot) {
35 │       continue;
36 │     }
37 │ 
38 ▶     if (!file.endsWith('.js') && !file.endsWith('.css')) {
39 │       continue;
40 │     }
41 │ 
42 ▶     const initialRecord = initialFiles.get(file);
43 ▶     const name = initialRecord?.name ?? getChunkNameFromMetafile(metafile, file);
44 │ 
45 ▶     stats.chunks.push({
46 │       files: [file],
47 ▶       initial: !!initialRecord,
48 ▶       names: name ? [name] : undefined,
49 │     });
50 │ 
51 ▶     stats.assets.push({
52 ▶       name: file,
53 ▶       size,
54 │     });
55 │   }
```

関数の上のコメントのとおり、budgets の計算機はもともと webpack の統計情報を読むために書かれたもので、この関数が esbuild の結果をその形に合わせます。32 行目で出力ファイルを 1 つずつ見て、34 行目でサーバー用を、38 行目で `.js` と `.css` 以外（画像など）を外します。45〜49 行目の「チャンク」は、ファイル名・`initialFiles` にあるか（47 行目）・名前（42〜43 行目。初期ファイルなら `main` などの名前、遅延なら metafile の `entryPoint` から作った名前）。51〜54 行目の「アセット」は、ファイル名と大きさです。`size` は出力ファイルのバイト数（圧縮前）です。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/budget-stats.ts` L57–78 （▶ の行: 59–60, 65–66, 70, 72–74）

```ts
57 │   // Add component styles from metafile
58 │   // TODO: Provide this information directly from the AOT compiler
59 ▶   for (const [file, entry] of Object.entries(metafile.outputs)) {
60 ▶     if (!file.endsWith('.css')) {
61 │       continue;
62 │     }
63 │     // 'ng-component' is set by the angular plugin's component stylesheet bundler
64 │     // eslint-disable-next-line @typescript-eslint/no-explicit-any
65 ▶     const componentStyle: boolean = (entry as any)['ng-component'];
66 ▶     if (!componentStyle) {
67 │       continue;
68 │     }
69 │ 
70 ▶     stats.assets.push({
71 │       // Component styles use the input file
72 ▶       name: Object.keys(entry.inputs)[0],
73 ▶       size: entry.bytes,
74 ▶       componentStyle,
75 │     });
76 │   }
77 │ 
78 │   return stats;
```

コンポーネントのスタイルは JS の中に文字列として入るので、出力ファイルの一覧には出てきません。そこで 59〜68 行目、metafile の出力のうち `ng-component` の印が付いた CSS を探します。この印は[第 4 回](04-cli-component-styles.md)の `ComponentStylesheetBundler` が、コンポーネントのスタイルをバンドルした結果に付けたものです。70〜75 行目でアセットに足すとき、名前は 72 行目のとおり**入力ファイル**（例: `src/app/pages/chapters/chapter.scss`）、大きさは 73 行目の esbuild が出力した CSS のバイト数です。

## 2. 予算の書き方：schema.json と BYTES\_IN\_KILOBYTE

📄 `angular-cli/packages/angular/build/src/builders/application/schema.json` L682–721 （▶ の行: 688, 690, 694, 698, 702, 706, 710, 714, 718）

```json
682 │     "budget": {
683 │       "type": "object",
684 │       "properties": {
685 │         "type": {
686 │           "type": "string",
687 │           "description": "The type of budget.",
688 ▶           "enum": ["all", "allScript", "any", "anyScript", "anyComponentStyle", "bundle", "initial"]
689 │         },
690 ▶         "name": {
691 │           "type": "string",
692 │           "description": "The name of the bundle."
693 │         },
694 ▶         "baseline": {
695 │           "type": "string",
696 │           "description": "The baseline size for comparison."
697 │         },
698 ▶         "maximumWarning": {
699 │           "type": "string",
700 │           "description": "The maximum threshold for warning relative to the baseline."
701 │         },
702 ▶         "maximumError": {
703 │           "type": "string",
704 │           "description": "The maximum threshold for error relative to the baseline."
705 │         },
706 ▶         "minimumWarning": {
707 │           "type": "string",
708 │           "description": "The minimum threshold for warning relative to the baseline."
709 │         },
710 ▶         "minimumError": {
711 │           "type": "string",
712 │           "description": "The minimum threshold for error relative to the baseline."
713 │         },
714 ▶         "warning": {
715 │           "type": "string",
716 │           "description": "The threshold for warning relative to the baseline (min & max)."
717 │         },
718 ▶         "error": {
719 │           "type": "string",
720 │           "description": "The threshold for error relative to the baseline (min & max)."
721 │         }
```
*angular.json の budgets\[\] の 1 件の型。値はすべて文字列。*

688 行目の 7 種類が `type` です。690 行目の `name` は `bundle` のときだけ使います。698〜721 行目の閾値はすべて `"type": "string"` なので、`"500KiB"` のような書き間違いも schema の検証は通ります（それがどうなるかは 3 節）。694 行目の `baseline` は「基準の大きさ」で、ほかの値をその差分として読むためのものです。

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L9–15 （▶ の行: 9, 15）

```ts
 9 ▶ import { Budget as BudgetEntry, Type as BudgetType } from '../builders/application/schema';
10 │ import { formatSize } from './format-bytes';
11 │ 
12 │ // Re-export to avoid direct schema importing throughout code
13 │ export { type BudgetEntry, BudgetType };
14 │ 
15 ▶ export const BYTES_IN_KILOBYTE = 1000;
```

9 行目、型は schema.json から生成された `schema.ts` から読みます。15 行目の `BYTES_IN_KILOBYTE` は **1000** です。`kB`（小文字の k）は SI 接頭辞で 1000 倍を表す書き方で、budgets はそのとおりに 1kB = 1000 バイトで計算します。ビルドの表の表示（7 節の `formatSize`）も 1000 で割るので、予算と表の数字は同じ単位でそろいます。

## 3. calculateThresholds：文字列を閾値の列にする

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L61–92 （▶ の行: 61–62, 64, 66, 72, 74, 78, 80–81）

```ts
61 ▶ export function* calculateThresholds(budget: BudgetEntry): IterableIterator<Threshold> {
62 ▶   if (budget.maximumWarning) {
63 │     yield {
64 ▶       limit: calculateBytes(budget.maximumWarning, budget.baseline, 1),
65 │       type: ThresholdType.Max,
66 ▶       severity: ThresholdSeverity.Warning,
67 │     };
68 │   }
69 │ 
70 │   if (budget.maximumError) {
71 │     yield {
72 ▶       limit: calculateBytes(budget.maximumError, budget.baseline, 1),
73 │       type: ThresholdType.Max,
74 ▶       severity: ThresholdSeverity.Error,
75 │     };
76 │   }
77 │ 
78 ▶   if (budget.minimumWarning) {
79 │     yield {
80 ▶       limit: calculateBytes(budget.minimumWarning, budget.baseline, -1),
81 ▶       type: ThresholdType.Min,
82 │       severity: ThresholdSeverity.Warning,
83 │     };
84 │   }
85 │ 
86 │   if (budget.minimumError) {
87 │     yield {
88 │       limit: calculateBytes(budget.minimumError, budget.baseline, -1),
89 │       type: ThresholdType.Min,
90 │       severity: ThresholdSeverity.Error,
91 │     };
92 │   }
```

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L94–121 （▶ の行: 94, 96–97, 102–103, 108, 110, 116）

```ts
 94 ▶   if (budget.warning) {
 95 │     yield {
 96 ▶       limit: calculateBytes(budget.warning, budget.baseline, -1),
 97 ▶       type: ThresholdType.Min,
 98 │       severity: ThresholdSeverity.Warning,
 99 │     };
100 │ 
101 │     yield {
102 ▶       limit: calculateBytes(budget.warning, budget.baseline, 1),
103 ▶       type: ThresholdType.Max,
104 │       severity: ThresholdSeverity.Warning,
105 │     };
106 │   }
107 │ 
108 ▶   if (budget.error) {
109 │     yield {
110 ▶       limit: calculateBytes(budget.error, budget.baseline, -1),
111 │       type: ThresholdType.Min,
112 │       severity: ThresholdSeverity.Error,
113 │     };
114 │ 
115 │     yield {
116 ▶       limit: calculateBytes(budget.error, budget.baseline, 1),
117 │       type: ThresholdType.Max,
118 │       severity: ThresholdSeverity.Error,
119 │     };
120 │   }
121 │ }
```

61 行目は `function*`（ジェネレータ）で、書かれている項目の数だけ閾値を 1 つずつ `yield` します。`maximumWarning` は 64 行目で `factor = 1`、`minimumWarning` は 80 行目で `factor = -1` として `calculateBytes` に渡します。94〜106 行目の `warning` は 1 つの値から**下限と上限の 2 つ**の閾値を作ります（96 行目が -1、102 行目が +1）。`error` も同じです（108〜120 行目）。`factor` が効くのは `baseline` があるときだけで、それは次の関数で分かります。

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L305–337 （▶ の行: 309, 311, 314, 318–319, 321–322, 324–325, 332–333, 336）

```ts
305 │ /**
306 │  * Calculate the bytes given a string value.
307 │  */
308 │ function calculateBytes(input: string, baseline?: string, factor: 1 | -1 = 1): number {
309 ▶   const matches = input.trim().match(/^(\d+(?:\.\d+)?)[ \t]*(%|[kmg]?b)?$/i);
310 │   if (!matches) {
311 ▶     return NaN;
312 │   }
313 │ 
314 ▶   const baselineBytes = (baseline && calculateBytes(baseline)) || 0;
315 │ 
316 │   let value = Number(matches[1]);
317 │   switch (matches[2] && matches[2].toLowerCase()) {
318 ▶     case '%':
319 ▶       value = (baselineBytes * value) / 100;
320 │       break;
321 ▶     case 'kb':
322 ▶       value *= BYTES_IN_KILOBYTE;
323 │       break;
324 ▶     case 'mb':
325 ▶       value *= BYTES_IN_KILOBYTE * BYTES_IN_KILOBYTE;
326 │       break;
327 │     case 'gb':
328 │       value *= BYTES_IN_KILOBYTE * BYTES_IN_KILOBYTE * BYTES_IN_KILOBYTE;
329 │       break;
330 │   }
331 │ 
332 ▶   if (baselineBytes === 0) {
333 ▶     return value;
334 │   }
335 │ 
336 ▶   return baselineBytes + value * factor;
337 │ }
```

1. **309 行目：形を読む**

   「数（小数可）＋ 空白（任意）＋ 単位（任意）」。単位は `%` か `b` / `kb` / `mb` / `gb` で、末尾の `i` フラグにより大文字小文字は問いません（`500KB` も `500 kb` も同じ）。単位なしはバイト。形が合わなければ 311 行目で `NaN`。
2. **314 行目：baseline を先にバイトに直す**

   baseline が無いか読めなければ 0。
3. **317〜330 行目：単位を掛ける**

   `kb` は × 1000、`mb` は × 1000 × 1000（321〜325 行目）。`%` は 319 行目で「baseline の何 %」。
4. **332〜336 行目：baseline があれば足し引き**

   baseline が 0 なら値そのもの（333 行目）。baseline があれば `baseline + 値 × factor`（336 行目）。だから `baseline: "400kB", maximumWarning: "20kB"` の上限は 420,000 バイト、`warning: "5%"` は下限 380,000・上限 420,000 です。

> [!WARNING]
> **ハマりどころ**
>
> `baseline` 無しで `"5%"` と書くと、319 行目で 0 × 5 / 100 = 0 になり、上限 0 バイトの予算になります（どんなファイルでも超える）。`"500KiB"` は 309 行目の形に合わず `NaN` になり、5 節の比較 `size <= NaN` が常に偽なので、必ず「超えた」と報告されます（メッセージの中の予算は `NaN undefined`）。インストール版の `@angular/build` 22.1.7 の `calculateThresholds` で、この 2 つを実際に確かめました。

## 4. calculateSizes：type ごとに何を数えるか

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L126–152 （▶ の行: 130–131, 137, 140, 143, 146, 149, 151）

```ts
126 │ function calculateSizes(budget: BudgetEntry, stats: BudgetStats): Size[] {
127 │   type CalculatorTypes = {
128 │     new (budget: BudgetEntry, chunks: BudgetChunk[], assets: BudgetAsset[]): Calculator;
129 │   };
130 ▶   const calculatorMap: Record<BudgetType, CalculatorTypes> = {
131 ▶     all: AllCalculator,
132 │     allScript: AllScriptCalculator,
133 │     any: AnyCalculator,
134 │     anyScript: AnyScriptCalculator,
135 │     anyComponentStyle: AnyComponentStyleCalculator,
136 │     bundle: BundleCalculator,
137 ▶     initial: InitialCalculator,
138 │   };
139 │ 
140 ▶   const ctor = calculatorMap[budget.type];
141 │   const { chunks, assets } = stats;
142 │   if (!chunks) {
143 ▶     throw new Error('Webpack stats output did not include chunk information.');
144 │   }
145 │   if (!assets) {
146 ▶     throw new Error('Webpack stats output did not include asset information.');
147 │   }
148 │ 
149 ▶   const calculator = new ctor(budget, chunks, assets);
150 │ 
151 ▶   return calculator.calculate();
152 │ }
```

130〜138 行目の表で `type` から計算機のクラスを選び、149〜151 行目でそれに数えさせます。143・146 行目のエラー文が「Webpack stats」のままなのは、1 節のとおり webpack 時代の形を受け継いでいるためです。

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L199–233 （▶ の行: 204–205, 210, 214, 225, 227–228）

```ts
199 │ /**
200 │  * A named bundle.
201 │  */
202 │ class BundleCalculator extends Calculator {
203 │   calculate() {
204 ▶     const budgetName = this.budget.name;
205 ▶     if (!budgetName) {
206 │       return [];
207 │     }
208 │ 
209 │     const size = this.chunks
210 ▶       .filter((chunk) => chunk?.names?.includes(budgetName))
211 │       .map((chunk) => this.calculateChunkSize(chunk))
212 │       .reduce((l, r) => l + r, 0);
213 │ 
214 ▶     return [{ size, label: this.budget.name }];
215 │   }
216 │ }
217 │ 
218 │ /**
219 │  * The sum of all initial chunks (marked as initial).
220 │  */
221 │ class InitialCalculator extends Calculator {
222 │   calculate() {
223 │     return [
224 │       {
225 ▶         label: `bundle initial`,
226 │         size: this.chunks
227 ▶           .filter((chunk) => chunk.initial)
228 ▶           .map((chunk) => this.calculateChunkSize(chunk))
229 │           .reduce((l, r) => l + r, 0),
230 │       },
231 │     ];
232 │   }
233 │ }
```

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L235–261 （▶ の行: 241, 245, 255, 259）

```ts
235 │ /**
236 │  * The sum of all the scripts portions.
237 │  */
238 │ class AllScriptCalculator extends Calculator {
239 │   calculate() {
240 │     const size = this.assets
241 ▶       .filter((asset) => asset.name.endsWith('.js'))
242 │       .map((asset) => this.getAssetSize(asset))
243 │       .reduce((total: number, size: number) => total + size, 0);
244 │ 
245 ▶     return [{ size, label: 'total scripts' }];
246 │   }
247 │ }
248 │ 
249 │ /**
250 │  * All scripts and assets added together.
251 │  */
252 │ class AllCalculator extends Calculator {
253 │   calculate() {
254 │     const size = this.assets
255 ▶       .filter((asset) => !asset.name.endsWith('.map') && !asset.componentStyle)
256 │       .map((asset) => this.getAssetSize(asset))
257 │       .reduce((total: number, size: number) => total + size, 0);
258 │ 
259 ▶     return [{ size, label: 'total' }];
260 │   }
261 │ }
```

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L263–289 （▶ の行: 269, 272, 283, 286）

```ts
263 │ /**
264 │  * Any script, individually.
265 │  */
266 │ class AnyScriptCalculator extends Calculator {
267 │   calculate() {
268 │     return this.assets
269 ▶       .filter((asset) => asset.name.endsWith('.js'))
270 │       .map((asset) => ({
271 │         size: this.getAssetSize(asset),
272 ▶         label: asset.name,
273 │       }));
274 │   }
275 │ }
276 │ 
277 │ /**
278 │  * Any script or asset (images, css, etc).
279 │  */
280 │ class AnyCalculator extends Calculator {
281 │   calculate() {
282 │     return this.assets
283 ▶       .filter((asset) => !asset.name.endsWith('.map') && !asset.componentStyle)
284 │       .map((asset) => ({
285 │         size: this.getAssetSize(asset),
286 ▶         label: asset.name,
287 │       }));
288 │   }
289 │ }
```

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L291–303 （▶ の行: 297, 300）

```ts
291 │ /**
292 │  * Any compoonent stylesheet
293 │  */
294 │ class AnyComponentStyleCalculator extends Calculator {
295 │   calculate() {
296 │     return this.assets
297 ▶       .filter((asset) => asset.componentStyle)
298 │       .map((asset) => ({
299 │         size: this.getAssetSize(asset),
300 ▶         label: asset.name,
301 │       }));
302 │   }
303 │ }
```

| type | 何を数えるか | ラベル（メッセージの主語） | 結果の数 | 行 |
| --- | --- | --- | --- | --- |
| `initial` | `initial` のチャンク（初期の JS と CSS）の合計 | `bundle initial` | 1 | 225〜229 |
| `bundle` | `names` に `name` を含むチャンクの合計。`name` が無ければ何もしない | `name` の値 | 0 か 1 | 204〜214 |
| `allScript` | すべての `.js` の合計（初期も遅延も） | `total scripts` | 1 | 241〜245 |
| `all` | `.map` とコンポーネントのスタイルを除くすべての合計 | `total` | 1 | 255〜259 |
| `anyScript` | `.js` を 1 つずつ | ファイル名 | ファイルの数 | 269〜272 |
| `any` | `.map` とコンポーネントのスタイルを除く 1 つずつ | ファイル名 | ファイルの数 | 283〜286 |
| `anyComponentStyle` | コンポーネントのスタイル（1 節の `ng-component`）を 1 つずつ | 入力ファイルのパス | スタイルの数 | 297〜300 |

`bundle` の名前は 1 節の `names` と比べます（210 行目）。初期ファイルなら `main`・`polyfills`・`styles`、遅延チャンクなら `entryPoint` から作った名前（このサイトなら `compiler` や `signal-forms`）で、ビルドの表の Names 列と同じものです。

## 5. checkBudgets と checkThresholds：比べてメッセージを作る

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L339–355 （▶ の行: 342, 345, 347, 350, 352）

```ts
339 │ export function* checkBudgets(
340 │   budgets: BudgetEntry[],
341 │   stats: BudgetStats,
342 ▶   checkComponentStyles?: boolean,
343 │ ): IterableIterator<BudgetCalculatorResult> {
344 │   // Ignore AnyComponentStyle budgets as these are handled in `AnyComponentStyleBudgetChecker` unless requested
345 ▶   const computableBudgets = checkComponentStyles
346 │     ? budgets
347 ▶     : budgets.filter((budget) => budget.type !== BudgetType.AnyComponentStyle);
348 │ 
349 │   for (const budget of computableBudgets) {
350 ▶     const sizes = calculateSizes(budget, stats);
351 │     for (const { size, label } of sizes) {
352 ▶       yield* checkThresholds(calculateThresholds(budget), size, label);
353 │     }
354 │   }
355 │ }
```

342 行目の `checkComponentStyles` が偽だと、345〜347 行目で `anyComponentStyle` の予算を外します（344 行目のコメントは webpack 版の別の仕組みの名残）。application builder は第 3 引数に `true` を渡すので、7 種類すべてがここで調べられます。352 行目、4 節の大きさ 1 つごとに、その予算の閾値すべてと比べます。

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L357–393 （▶ の行: 365–366, 369, 371, 373–375, 380, 388）

```ts
357 │ export function* checkThresholds(
358 │   thresholds: Iterable<Threshold>,
359 │   size: number,
360 │   label?: string,
361 │ ): IterableIterator<BudgetCalculatorResult> {
362 │   for (const threshold of thresholds) {
363 │     switch (threshold.type) {
364 │       case ThresholdType.Max: {
365 ▶         if (size <= threshold.limit) {
366 ▶           continue;
367 │         }
368 │ 
369 ▶         const sizeDifference = formatSize(size - threshold.limit);
370 │         yield {
371 ▶           severity: threshold.severity,
372 │           label,
373 ▶           message: `${label} exceeded maximum budget. Budget ${formatSize(
374 ▶             threshold.limit,
375 ▶           )} was not met by ${sizeDifference} with a total of ${formatSize(size)}.`,
376 │         };
377 │         break;
378 │       }
379 │       case ThresholdType.Min: {
380 ▶         if (size >= threshold.limit) {
381 │           continue;
382 │         }
383 │ 
384 │         const sizeDifference = formatSize(threshold.limit - size);
385 │         yield {
386 │           severity: threshold.severity,
387 │           label,
388 ▶           message: `${label} failed to meet minimum budget. Budget ${formatSize(
389 │             threshold.limit,
390 │           )} was not met by ${sizeDifference} with a total of ${formatSize(size)}.`,
391 │         };
392 │         break;
393 │       }
```

上限は 365 行目「`size <= limit` なら何もしない」、下限は 380 行目「`size >= limit` なら何もしない」。**ちょうど同じ大きさは予算内**です。超えたときは 371 行目で閾値の `severity`（warning か error）をそのまま付け、373〜375 行目の英文を作ります。ラベルが主語になるので、`initial` の予算なら「`bundle initial exceeded maximum budget. Budget 500.00 kB was not met by …`」になります。警告とエラーは 2 つ別々の閾値なので、1MB を超えたファイルには、警告とエラーの**両方**のメッセージが出ます。

> [!NOTE]
> **ポイント**
>
> `severity` が `error` の結果は、`executeBuild` がビルドのエラーとして足すので、そのビルドは失敗になります（[第 2 回](02-build.md)）。`warning` はビルドの警告として出るだけで、出力は書き出されます。

> **🧪 DEMO — calculateThresholds と checkThresholds を自作で再現する**
>
> 下のコードは `bundle-calculator.ts` の 308〜337 行目・61〜121 行目・357〜393 行目と `format-bytes.ts` を、この章の `.ts` に書き写した自作の再実装です（`@angular/build` は読み込んでいません）。初期値はこのサイトの `angular.json` の production の `initial` 予算と、今回の本番ビルドの Initial total（412.83 kB）です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cli-budgets)

## 6. 表の 1 行：logBuildStats と Estimated transfer size

📄 `angular-cli/packages/angular/build/src/tools/esbuild/utils.ts` L48–77 （▶ の行: 48, 50, 73, 75–76）

```ts
48 ▶   for (const { path: file, size, type } of outputFiles) {
49 │     // Only display JavaScript and CSS files
50 ▶     if (!/\.(?:css|m?js)$/.test(file)) {
51 │       continue;
52 │     }
53 │ 
54 │     // Show only changed files if a changed list is provided
55 │     if (normalizedChangedFiles.size && !normalizedChangedFiles.has(file)) {
56 │       ++unchangedCount;
57 │       continue;
58 │     }
59 │ 
60 │     const isPlatformServer =
61 │       type === BuildOutputFileType.ServerApplication || type === BuildOutputFileType.ServerRoot;
62 │     if (isPlatformServer && !ssrOutputEnabled) {
63 │       // Only log server build stats when SSR is enabled.
64 │       continue;
65 │     }
66 │ 
67 │     // Skip logging external component stylesheets used for HMR
68 │     if (metafiles.some((mf) => mf.outputs[file] && 'ng-component' in mf.outputs[file])) {
69 │       componentStyleChange = true;
70 │       continue;
71 │     }
72 │ 
73 ▶     const name = initial.get(file)?.name ?? getChunkNameFromMetafile(metafiles, file);
74 │     const stat: BundleStats = {
75 ▶       initial: initial.has(file),
76 ▶       stats: [file, name ?? '-', size, estimatedTransferSizes?.get(file) ?? '-'],
77 │     };
```

ビルドの最後の表は、budgets と同じ出力ファイルの一覧から作ります。50 行目で `.css` と `.js`（`.mjs`）だけにし、73 行目の名前は 1 節と同じ規則（初期ファイルの名前、無ければ metafile の `entryPoint` から）です。75 行目の `initial` で「Initial chunk files」と「Lazy chunk files」のどちらの段に入るかが決まります。76 行目、Raw size は出力ファイルのバイト数、Estimated transfer size は次の関数の結果です。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/utils.ts` L131–161 （▶ の行: 135, 142–143, 149, 156）

```ts
131 │   return new Promise((resolve, reject) => {
132 │     let completeCount = 0;
133 │     for (const outputFile of outputFiles) {
134 │       // Only calculate JavaScript and CSS files
135 ▶       if (!outputFile.path.endsWith('.js') && !outputFile.path.endsWith('.css')) {
136 │         ++completeCount;
137 │         continue;
138 │       }
139 │ 
140 │       // Skip compressing small files which may end being larger once compressed and will most likely not be
141 │       // compressed in actual transit.
142 ▶       if (outputFile.contents.byteLength < 1024) {
143 ▶         sizes.set(outputFile.path, outputFile.contents.byteLength);
144 │         ++completeCount;
145 │         continue;
146 │       }
147 │ 
148 │       // Directly use the async callback function to minimize the number of Promises that need to be created.
149 ▶       brotliCompress(outputFile.contents, (error, result) => {
150 │         if (error) {
151 │           reject(error);
152 │ 
153 │           return;
154 │         }
155 │ 
156 ▶         sizes.set(outputFile.path, result.byteLength);
157 │         if (++completeCount >= outputFiles.length) {
158 │           resolve(sizes);
159 │         }
160 │       });
161 │     }
```

Estimated transfer size は「配信時に圧縮されたらこのくらい」という見積もりで、149 行目の **brotli** 圧縮（Node の `zlib.brotliCompress`）を実際にかけた大きさです。gzip ではありません。142〜146 行目、1024 バイト未満のファイルは圧縮せず元の大きさを使います。このサイトのビルドの表で `chunk-Da4-SChG.js` が「633 bytes | 633 bytes」と同じ数字なのはこのためです。見積もりは budgets の判定には使われません（budgets が読むのは 1 節の `size`、つまり Raw size）。

## 7. 表の組み立て：stats-table

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L97–126 （▶ の行: 98, 100–103, 115, 119, 122–123）

```ts
 97 │   const getSizeColor = (name: string, file?: string, defaultColor = c) => {
 98 ▶     const severity = budgets.get(name) || (file && budgets.get(file));
 99 │     switch (severity) {
100 ▶       case 'warning':
101 ▶         return y;
102 ▶       case 'error':
103 ▶         return r;
104 │       default:
105 │         return defaultColor;
106 │     }
107 │   };
108 │ 
109 │   const changedEntryChunksStats: BundleStatsData[] = [];
110 │   const changedLazyChunksStats: BundleStatsData[] = [];
111 │ 
112 │   let initialTotalRawSize = 0;
113 │   let changedLazyChunksCount = 0;
114 │   let initialTotalEstimatedTransferSize;
115 ▶   const maxLazyChunksWithoutBudgetFailures = 15;
116 │ 
117 │   const budgets = new Map<string, string>();
118 │   if (budgetFailures) {
119 ▶     for (const { label, severity } of budgetFailures) {
120 │       // In some cases a file can have multiple budget failures.
121 │       // Favor error.
122 ▶       if (label && (!budgets.has(label) || budgets.get(label) === 'warning')) {
123 ▶         budgets.set(label, severity);
124 │       }
125 │     }
126 │   }
```

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L128–153 （▶ の行: 129–130, 144–148, 151–152）

```ts
128 │   // Sort descending by raw size
129 ▶   data.sort((a, b) => {
130 ▶     if (a.stats[2] > b.stats[2]) {
131 │       return -1;
132 │     }
133 │ 
134 │     if (a.stats[2] < b.stats[2]) {
135 │       return 1;
136 │     }
137 │ 
138 │     return 0;
139 │   });
140 │ 
141 │   for (const { initial, stats } of data) {
142 │     const [files, names, rawSize, estimatedTransferSize] = stats;
143 │     if (
144 ▶       !initial &&
145 ▶       !verbose &&
146 ▶       changedLazyChunksStats.length >= maxLazyChunksWithoutBudgetFailures &&
147 ▶       !budgets.has(names) &&
148 ▶       !budgets.has(files)
149 │     ) {
150 │       // Limit the number of lazy chunks displayed in the stats table when there is no budget failure and not in verbose mode.
151 ▶       changedLazyChunksCount++;
152 ▶       continue;
153 │     }
```

119〜125 行目、5 節の結果をラベルごとに覚えます（同じラベルに警告とエラーがあればエラーを優先、122 行目）。98〜106 行目、Raw size の色は、そのファイル名か名前に結果があれば警告で黄、エラーで赤になります。129〜139 行目で Raw size の大きい順に並べ、143〜152 行目で、遅延チャンクは 15 個（115 行目）を超えたら表に出さず数だけ数えます。ただし予算を超えたものは 15 個を超えても出します（147〜148 行目）。`--verbose` なら全部出します（145 行目）。

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L177–192 （▶ の行: 177–178, 180, 186, 189–190）

```ts
177 ▶     if (initial) {
178 ▶       changedEntryChunksStats.push(data);
179 │       if (typeof rawSize === 'number') {
180 ▶         initialTotalRawSize += rawSize;
181 │       }
182 │       if (showEstimatedTransferSize && typeof estimatedTransferSize === 'number') {
183 │         if (initialTotalEstimatedTransferSize === undefined) {
184 │           initialTotalEstimatedTransferSize = 0;
185 │         }
186 ▶         initialTotalEstimatedTransferSize += estimatedTransferSize;
187 │       }
188 │     } else {
189 ▶       changedLazyChunksStats.push(data);
190 ▶       changedLazyChunksCount++;
191 │     }
192 │   }
```

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L201–221 （▶ の行: 203, 206, 209–210, 213–214）

```ts
201 │   // Entry chunks
202 │   if (changedEntryChunksStats.length) {
203 ▶     bundleInfo.push(['Initial chunk files', ...baseTitles].map(bold), ...changedEntryChunksStats);
204 │ 
205 │     if (showTotalSize) {
206 ▶       const initialSizeTotalColor = getSizeColor('bundle initial', undefined, (x) => x);
207 │       const totalSizeElements = [
208 │         ' ',
209 ▶         'Initial total',
210 ▶         initialSizeTotalColor(formatSize(initialTotalRawSize)),
211 │       ];
212 │       if (showEstimatedTransferSize) {
213 ▶         totalSizeElements.push(
214 ▶           typeof initialTotalEstimatedTransferSize === 'number'
215 │             ? formatSize(initialTotalEstimatedTransferSize)
216 │             : '-',
217 │         );
218 │       }
219 │       bundleInfo.push([], totalSizeElements.map(bold));
220 │     }
221 │   }
```

177〜187 行目、初期ファイルの Raw size と Estimated transfer size を足していき、203〜219 行目でそれを「Initial total」の行にします。206 行目、合計の色は `'bundle initial'` の結果で決まります。これは 4 節の `InitialCalculator` のラベル（225 行目）と同じ文字列なので、`initial` の予算を超えると Initial total が黄か赤になります。遅延チャンクは合計を出さず、15 個を超えた分は「`...and N more lazy chunks files`」の 1 行になります。

📄 `angular-cli/packages/angular/build/src/utils/format-bytes.ts` L9–21 （▶ の行: 14–16, 18）

```ts
 9 │ export function formatSize(size: number): string {
10 │   if (size <= 0) {
11 │     return '0 bytes';
12 │   }
13 │ 
14 ▶   const abbreviations = ['bytes', 'kB', 'MB', 'GB'];
15 ▶   const index = Math.floor(Math.log(size) / Math.log(1000));
16 ▶   const roundedSize = size / Math.pow(1000, index);
17 │   // bytes don't have a fraction
18 ▶   const fractionDigits = index === 0 ? 0 : 2;
19 │ 
20 │   return `${roundedSize.toFixed(fractionDigits)} ${abbreviations[index]}`;
21 │ }
```

15〜16 行目、表示も 1000 で割ります。18 行目、バイトのときだけ小数を付けません。

### このサイトの本番ビルドの表

| Initial chunk files | Names | Raw size | Estimated transfer size |
| --- | --- | --- | --- |
| `main-I6ZUT6OG.js` | main | 410.32 kB | 109.28 kB |
| `styles-CDAXAHJQ.css` | styles | 1.88 kB | 641 bytes |
| `chunk-Da4-SChG.js` | - | 633 bytes | 633 bytes |
|   | **Initial total** | **412.83 kB** | **110.55 kB** |

この章を書いた時点で `npx ng build` したときの表です（遅延チャンクは上位 15 個のあと「`...and 239 more lazy chunks files.`」）。`initial` の予算 500kB に対して 412.83 kB なので、メッセージは出ません。`chunk-Da4-SChG.js` の Names が `-` なのは、入口を持たない共有チャンクだからです（[第 7 回](07-cli-code-splitting.md)）。

> **🧪 DEMO — いま配られている初期ファイルを取ってきて、initial の予算と比べる**
>
> `/index.csr.html`（ビルドが書いたままの HTML）から `<script type="module">`・`modulepreload`・stylesheet を集め、JS の静的 `import "./…"` も辿って取ってきます。大きさは `arrayBuffer().byteLength`（展開後のバイト数）で、Raw size と同じものです。予算は `maximumWarning: 500kB` / `maximumError: 1MB` を上の自作の関数で判定します。本番ビルドで動かしたときの見方です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cli-budgets)

## 呼び出しの流れ

- `executeBuild(...)` — builders/application/execute-build.ts — *第 2 回*
  - `generateBudgetStats(browserMetafile, outputFiles, initialFiles)` — budget-stats.ts L22
  - `checkBudgets(options.budgets, stats, true)` — bundle-calculator.ts L339
    - `calculateSizes(budget, stats) → new InitialCalculator(...).calculate()` — bundle-calculator.ts L126, L221
    - `calculateThresholds(budget) → calculateBytes('500kB') = 500000` — bundle-calculator.ts L61, L308
    - `checkThresholds(thresholds, size, 'bundle initial')` — bundle-calculator.ts L357
  - `calculateEstimatedTransferSizes(outputFiles)（brotli）` — tools/esbuild/utils.ts L123
  - `logBuildStats(... budgetFailures, estimatedTransferSizes)` — tools/esbuild/utils.ts L27
    - `generateEsbuildBuildStatsTable → generateBuildStatsData` — utils/stats-table.ts L25, L78

## 聞かれそうな質問

**Q. kB は 1000 バイト？1024 バイト？**

1000 です。15 行目の `BYTES_IN_KILOBYTE = 1000` を 321〜322 行目で掛けます。表示の `formatSize` も 15〜16 行目で 1000 で割るので、予算とログの数字は同じ単位です。`KB` や `kb` は 309 行目の `i` フラグで同じ意味になりますが、`KiB` は形が合わず `NaN` になり、常に超えた扱いになります（3 節）。

**Q. 警告とエラーは何が違うのですか？**

閾値の `severity` だけです（66・74 行目）。`checkThresholds` は 371 行目でそれをそのまま結果に付け、`executeBuild` が `error` をビルドのエラー、`warning` を警告として足します。エラーがあるとビルドは失敗し、警告だけなら成功します（[第 2 回](02-build.md)）。1MB を超えると、警告の閾値（500kB）も超えているので、メッセージは 2 件出ます。

**Q. anyComponentStyle の予算に引っかかりました。何が数えられていますか？**

コンポーネント 1 つのスタイルを esbuild がバンドルした結果の CSS のバイト数です（budget-stats.ts 72〜73 行目）。`@use` で読み込んだ Sass も展開後の大きさで数えます。メッセージの主語は 300 行目の入力ファイルのパスなので、どのファイルかはメッセージで分かります。スタイルがどう処理されるかは[第 4 回](04-cli-component-styles.md)です。共通のスタイルをコンポーネントごとに `@use` していると、そのぶんが各コンポーネントに入って数えられます。

**Q. baseline を書かずに "10%" と書いたら？**

314 行目で baseline が 0 になり、319 行目で 0 × 10 / 100 = 0 バイトの閾値になります。上限 0 なので、どのファイルも 365 行目の `size <= 0` を満たさず、必ず超えた扱いです。`%` は baseline と組で使います。

**Q. Estimated transfer size は gzip の大きさですか？**

brotli です（tools/esbuild/utils.ts 149 行目）。1024 バイト未満は圧縮せず元の大きさ（142〜146 行目）。あくまで見積もりで、実際の配信がどの圧縮を使うかはサーバー次第です。budgets はこの値ではなく Raw size で判定します。

**Q. 遅延チャンクの予算を超えても表に出ないのでは？**

出ます。遅延チャンクは 15 個まで（115 行目）しか表に出しませんが、147〜148 行目のとおり、予算の結果があるファイルは 15 個を超えていても行が出て、色も付きます。全部見たいときは `--verbose`（145 行目）。

## 読み終えて

- budgets の値は文字列。`calculateBytes` が「数 ＋ 単位」を読み、1kB = 1000 バイトで計算する。`%` は baseline の割合で、baseline があれば「baseline ± 値」になる。
- `calculateThresholds` は書いた項目の数だけ閾値を作る。`warning` / `error` は 1 つで上限と下限の 2 つ。
- `type` で数えるものが変わる。`initial` は初期の JS と CSS の合計、`anyComponentStyle` はコンポーネントのスタイル 1 つずつ（metafile の `ng-component` の印）。
- 超えたら閾値の severity のままメッセージになり、error ならビルドが失敗する。ちょうど同じ大きさは予算内。
- ビルドの表は同じ出力から作る。Estimated transfer size は brotli の見積もりで、予算の判定には使わない。

---

← 前: [遅延チャンク：loadComponent が別ファイルになり、chunk-optimizer がまとめ直す](07-cli-code-splitting.md)  
次: [i18n：1 回ビルドして、ロケールごとに翻訳を差し込む](09-cli-i18n.md) →
