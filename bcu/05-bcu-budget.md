[目次](../README.md) › [@angular/build の compilation と utils の読み残し](README.md) › 第 5 回 / 全 10 回

# 予算と出力の表：bundle-calculator と stats-table の残り

> utils/bundle-calculator.ts と stats-table.ts の未読の行：予算の計算が受け取る webpack の形の型、チャンクの大きさを足す Calculator の土台、届かない分岐の文言、ブラウザとサーバーを分ける表と private の表、列の数と幅のそろえ方と行の末尾に残る区切り。

angular/angular-cli · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-budget)

---

ng build の最後に出る表と、予算（angular.json の `budgets`）の警告は、`utils/bundle-calculator.ts` と `utils/stats-table.ts` が作ります。この章では、まだ読んでいない行を埋めます。予算の計算が受け取る型（webpack の統計情報の形）、チャンクの大きさを足す `Calculator` の土台、届かない分岐、表の 2 つの入口（ブラウザとサーバーを分ける物と、private の物）、列の数と幅のそろえ方です。デモは本物の `checkBudgets` と表の関数に 12 組の予算と 11 通りの表を当てた記録で、表は色も再現しています。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/utils/` の `bundle-calculator.ts` と `stats-table.ts` です。予算の書き方・`calculateThresholds`・`calculateBytes`・type ごとの計算機・`checkBudgets` と `checkThresholds`、表の並べ方と Initial total と 15 個の上限は [budgets と出力の表の章](../cli/08-cli-budgets.md)で読んだので、繰り返しません。

1. [1. AotCompilation の残り](01-bcu-aot.md)
2. [2. ParallelCompilation](02-bcu-parallel.md)
3. [3. hmr-candidates](03-bcu-hmr.md)
4. [4. AngularHost と遅延ルート](04-bcu-host.md)
5. **5. 予算と出力の表**（この章）
6. [6. index.html の仕上げ](06-bcu-index.md)
7. [7. 自動 CSP](07-bcu-auto-csp.md)
8. [8. オプションの小道具](08-bcu-options.md)
9. [9. パス・URL・ソースマップ](09-bcu-paths.md)
10. [10. spec と issue](10-bcu-tests-issues.md)

## 1. 予算の計算がやり取りする型

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L16–37 （▶ の行: 17–19, 22–25, 28–30, 33–35）

```ts
16 │ 
17 ▶ interface Size {
18 ▶   size: number;
19 ▶   label?: string;
20 │ }
21 │ 
22 ▶ export interface Threshold {
23 ▶   limit: number;
24 ▶   type: ThresholdType;
25 ▶   severity: ThresholdSeverity;
26 │ }
27 │ 
28 ▶ enum ThresholdType {
29 ▶   Max = 'maximum',
30 ▶   Min = 'minimum',
31 │ }
32 │ 
33 ▶ export enum ThresholdSeverity {
34 ▶   Warning = 'warning',
35 ▶   Error = 'error',
36 │ }
37 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L38–60 （▶ の行: 38–41, 44–47, 50–51, 53, 56–58）

```ts
38 ▶ export interface BudgetCalculatorResult {
39 ▶   severity: ThresholdSeverity;
40 ▶   message: string;
41 ▶   label?: string;
42 │ }
43 │ 
44 ▶ export interface BudgetChunk {
45 ▶   files?: string[];
46 ▶   names?: string[];
47 ▶   initial?: boolean;
48 │ }
49 │ 
50 ▶ export interface BudgetAsset {
51 ▶   name: string;
52 │   size: number;
53 ▶   componentStyle?: boolean;
54 │ }
55 │ 
56 ▶ export interface BudgetStats {
57 ▶   chunks?: BudgetChunk[];
58 ▶   assets?: BudgetAsset[];
59 │ }
60 │ 
```

17〜20 行目の `Size` は計算機の 1 件の答え（大きさと、メッセージの頭に付くラベル）、22〜26 行目の `Threshold` は `calculateThresholds` が作る 1 つの閾値です。28〜31 行目の `ThresholdType` は export しない文字列の enum、33〜36 行目の `ThresholdSeverity` は export され、`'warning'` と `'error'` が結果の `severity` と表の色（4 節）に使われます。38〜42 行目の `BudgetCalculatorResult` が `checkBudgets` の 1 件で、41 行目の `label` は 4 節で表のどの行を色付けするかの手がかりです。

44〜59 行目は、もともと webpack の統計情報を読むために書かれた形のままです。チャンク（44〜48 行目）はファイル名の配列・名前の配列・初期か、アセット（50〜54 行目）は名前・大きさ・コンポーネントのスタイルか。esbuild の結果をこの形に直すのは `generateBudgetStats`（[budgets の章](../cli/08-cli-budgets.md)の 1 節）で、57〜58 行目がどちらも省略できるので、3 節で「無いとき」の扱いが要ります。

## 2. Calculator の土台：チャンクの大きさを足す

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L153–178 （▶ の行: 154–155, 157–160, 163, 166, 168–169, 172–175, 177）

```ts
153 │ 
154 ▶ abstract class Calculator {
155 ▶   private assetMap?: ReadonlyMap<string, number>;
156 │ 
157 ▶   constructor(
158 ▶     protected budget: BudgetEntry,
159 ▶     protected chunks: BudgetChunk[],
160 ▶     protected assets: BudgetAsset[],
161 │   ) {}
162 │ 
163 ▶   abstract calculate(): Size[];
164 │ 
165 │   /** Calculates the size of the given chunk for the provided build type. */
166 ▶   protected calculateChunkSize(chunk: BudgetChunk): number {
167 │     // No differential builds, get the chunk size by summing its assets.
168 ▶     if (!chunk.files) {
169 ▶       return 0;
170 │     }
171 │ 
172 ▶     if (!this.assetMap) {
173 ▶       const map = new Map<string, number>();
174 ▶       for (const asset of this.assets) {
175 ▶         map.set(asset.name, asset.size);
176 │       }
177 ▶       this.assetMap = map;
178 │     }
```

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L179–198 （▶ の行: 181–186, 191, 194–195）

```ts
179 │     const assetMap = this.assetMap;
180 │ 
181 ▶     return chunk.files
182 ▶       .filter((file) => !file.endsWith('.map'))
183 ▶       .map((file) => {
184 ▶         const assetSize = assetMap.get(file);
185 ▶         if (assetSize === undefined) {
186 ▶           throw new Error(`Could not find asset for file: ${file}`);
187 │         }
188 │ 
189 │         return assetSize;
190 │       })
191 ▶       .reduce((l, r) => l + r, 0);
192 │   }
193 │ 
194 ▶   protected getAssetSize(asset: BudgetAsset): number {
195 ▶     return asset.size;
196 │   }
197 │ }
198 │ 
```

1. **ファイルの無いチャンクは 0**

   168〜170 行目。167 行目のコメントの「differential builds」は、昔の webpack の builder が ES5 と ES2015 の 2 組を出していた頃の名残です。
2. **アセットの表を 1 回だけ作る**

   172〜178 行目。最初に呼ばれたときに「名前 → 大きさ」の Map を作り、155 行目のフィールドに覚えます。チャンクごとに配列を探し直さないための形で、19c91e48d4（2026-08）が入れました。
3. **.map は数えない**

   182 行目。チャンクの files にソースマップが並んでいても、大きさには入りません。
4. **アセットに無いファイルは投げる**

   184〜187 行目。予算の計算は例外で止まります。
5. **足す**

   191 行目。`initial` と `bundle` の計算機（[budgets の章](../cli/08-cli-budgets.md)の 4 節）がこれを使い、ほかの計算機は 194〜196 行目の `getAssetSize` でアセットの大きさをそのまま使います。

デモの「チャンクのファイルが assets に無い」は、polyfills のチャンクの `polyfills-BBBB.js` をアセットから抜いた物で、`checkBudgets` は「Error: Could not find asset for file: polyfills-BBBB.js」を投げ、1 件も返しませんでした。main のチャンクの files には `main-AAAA.js.map`（900 kB）が入っていますが、どの組の initial の合計にも入っていません。

## 3. 届かない分岐の文言

📄 `angular-cli/packages/angular/build/src/utils/bundle-calculator.ts` L388–399 （▶ の行: 388–390, 394–395）

```ts
388 ▶           message: `${label} failed to meet minimum budget. Budget ${formatSize(
389 ▶             threshold.limit,
390 ▶           )} was not met by ${sizeDifference} with a total of ${formatSize(size)}.`,
391 │         };
392 │         break;
393 │       }
394 ▶       default: {
395 ▶         throw new Error(`Unexpected threshold type: ${ThresholdType[threshold.type]}`);
396 │       }
397 │     }
398 │   }
399 │ }
```

388〜390 行目が最小の予算の文言の終わり、394〜396 行目が `switch` の `default` です。`Threshold` を作るのは `calculateThresholds` だけで、型は `Max` か `Min` しか入らないので、ここには来ません。もし来ても、28〜31 行目の `ThresholdType` は文字列の enum で、数の enum と違って値から名前を引く逆の表を持たないので、`ThresholdType[threshold.type]` は `undefined` になり、文言は「Unexpected threshold type: undefined」になります。

> [!NOTE]
> **ポイント**
>
> 22.2.7 の dist の bundle-calculator.js が export するのは BYTES\_IN\_KILOBYTE・BudgetType・ThresholdSeverity・checkBudgets の 4 つで、44129f66a3 の BYTES\_IN\_KILOBYTE・BudgetType・ThresholdSeverity・calculateThresholds・checkBudgets・checkThresholds から `calculateThresholds` と `checkThresholds` が抜けています（22.2.x の 413c164a7c、main の 07bdf882ae）。外から呼ぶ人が `checkBudgets` に移ったためで、private の入口（`@angular/build/private`）からも消えました。デモの閾値の列は、44129f66a3 の bundle-calculator.ts を読むだけで transpile して、その `calculateThresholds` で出しています。

## 4. 表の入口は 2 つ

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L9–24 （▶ の行: 9, 11–12, 14–18, 20–22）

```ts
 9 ▶ import { stripVTControlCharacters } from 'node:util';
10 │ import { BudgetCalculatorResult } from './bundle-calculator';
11 ▶ import { colors as ansiColors } from './color';
12 ▶ import { formatSize } from './format-bytes';
13 │ 
14 ▶ export type BundleStatsData = [
15 ▶   files: string,
16 ▶   names: string,
17 ▶   rawSize: number | string,
18 ▶   estimatedTransferSize: number | string,
19 │ ];
20 ▶ export interface BundleStats {
21 ▶   initial: boolean;
22 ▶   stats: BundleStatsData;
23 │ }
24 │ 
```

14〜19 行目の `BundleStatsData` は表の 1 行の 4 つの列（ファイル・名前・Raw size・Estimated transfer size）で、大きさは数か文字列です。サーバーの束の Estimated transfer size には `'-'` の文字列が入ります（デモの `server.mjs`）。9 行目の `stripVTControlCharacters` は、色の制御文字を除いた長さで列の幅をそろえるため（6 節）、11 行目の色は listr2 の `color` です。

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L25–57 （▶ の行: 26–31, 33, 42–45, 47, 50–52, 56）

```ts
25 │ export function generateEsbuildBuildStatsTable(
26 ▶   [browserStats, serverStats]: [browserStats: BundleStats[], serverStats: BundleStats[]],
27 ▶   colors: boolean,
28 ▶   showTotalSize: boolean,
29 ▶   showEstimatedTransferSize: boolean,
30 ▶   budgetFailures?: BudgetCalculatorResult[],
31 ▶   verbose?: boolean,
32 │ ): string {
33 ▶   const bundleInfo = generateBuildStatsData(
34 │     browserStats,
35 │     colors,
36 │     showTotalSize,
37 │     showEstimatedTransferSize,
38 │     budgetFailures,
39 │     verbose,
40 │   );
41 │ 
42 ▶   if (serverStats.length) {
43 ▶     const m = (x: string) => (colors ? ansiColors.magenta(x) : x);
44 ▶     if (browserStats.length) {
45 ▶       bundleInfo.unshift([m('Browser bundles')]);
46 │       // Add seperators between browser and server logs
47 ▶       bundleInfo.push([], []);
48 │     }
49 │ 
50 ▶     bundleInfo.push(
51 ▶       [m('Server bundles')],
52 ▶       ...generateBuildStatsData(serverStats, colors, false, false, undefined, verbose),
53 │     );
54 │   }
55 │ 
56 ▶   return generateTableText(bundleInfo, colors);
57 │ }
```

1. **引数の出どころ**

   logBuildStats（tools/esbuild/utils.ts、[budgets の章](../cli/08-cli-budgets.md)の 6 節）が呼びます。28 行目の `showTotalSize` は「変わらなかったファイルが 0 個」のとき、29 行目の `showEstimatedTransferSize` は見積もりを計算したとき（execute-build.ts で、スクリプトの最適化かスタイルの minify があるとき）に真です。
2. **ブラウザの束を先に作る**

   33〜40 行目。予算の結果を渡すのはブラウザの束だけです。
3. **サーバーの束があれば見出しをつける**

   42〜54 行目。ブラウザの束もあれば 45 行目で先頭に「Browser bundles」、47 行目で空の 2 行、50 行目で「Server bundles」をマゼンタで足し、52 行目でサーバーの束を合計なし・見積もりなし・予算なしで並べます。
4. **1 つの文字列にする**

   56 行目、6 節の `generateTableText`。ブラウザとサーバーの行を 1 つの表として幅をそろえます。

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L58–96 （▶ の行: 59, 66, 72, 75, 86–87, 90–95）

```ts
58 │ 
59 ▶ export function generateBuildStatsTable(
60 │   data: BundleStats[],
61 │   colors: boolean,
62 │   showTotalSize: boolean,
63 │   showEstimatedTransferSize: boolean,
64 │   budgetFailures?: BudgetCalculatorResult[],
65 │ ): string {
66 ▶   const bundleInfo = generateBuildStatsData(
67 │     data,
68 │     colors,
69 │     showTotalSize,
70 │     showEstimatedTransferSize,
71 │     budgetFailures,
72 ▶     true,
73 │   );
74 │ 
75 ▶   return generateTableText(bundleInfo, colors);
76 │ }
77 │ 
78 │ function generateBuildStatsData(
79 │   data: BundleStats[],
80 │   colors: boolean,
81 │   showTotalSize: boolean,
82 │   showEstimatedTransferSize: boolean,
83 │   budgetFailures?: BudgetCalculatorResult[],
84 │   verbose?: boolean,
85 │ ): (string | number)[][] {
86 ▶   if (data.length === 0) {
87 ▶     return [];
88 │   }
89 │ 
90 ▶   const g = (x: string) => (colors ? ansiColors.green(x) : x);
91 ▶   const c = (x: string) => (colors ? ansiColors.cyan(x) : x);
92 ▶   const r = (x: string) => (colors ? ansiColors.redBright(x) : x);
93 ▶   const y = (x: string) => (colors ? ansiColors.yellowBright(x) : x);
94 ▶   const bold = (x: string) => (colors ? ansiColors.bold(x) : x);
95 ▶   const dim = (x: string) => (colors ? ansiColors.dim(x) : x);
96 │ 
```

59〜76 行目の `generateBuildStatsTable` は、private の入口（private.ts の 88 行目）から外に出ている版で、72 行目のとおりいつも `verbose` です（遅延チャンクを 15 個で切らない）。ブラウザとサーバーを分けません。78 行目からの `generateBuildStatsData` が 2 つの入口の共通の中身で、86〜88 行目、行が無ければ空の配列（サーバーだけのビルドでは、ブラウザの段が丸ごと消える）。90〜95 行目の色の関数は、`colors` が偽なら何もしない関数です。97〜107 行目（[budgets の章](../cli/08-cli-budgets.md)の引用）、Raw size の色は、`checkBudgets` の結果のラベルが行の名前（`names`）かファイルと同じなら、警告で黄、エラーで赤です。

## 5. 1 行の作り方と見出し

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L154–176 （▶ の行: 155, 157–163, 168–169, 172–173）

```ts
154 │ 
155 ▶     const getRawSizeColor = getSizeColor(names, files);
156 │     let data: BundleStatsData;
157 ▶     if (showEstimatedTransferSize) {
158 ▶       data = [
159 ▶         g(files),
160 ▶         dim(names),
161 ▶         getRawSizeColor(typeof rawSize === 'number' ? formatSize(rawSize) : rawSize),
162 ▶         c(
163 ▶           typeof estimatedTransferSize === 'number'
164 │             ? formatSize(estimatedTransferSize)
165 │             : estimatedTransferSize,
166 │         ),
167 │       ];
168 ▶     } else {
169 ▶       data = [
170 │         g(files),
171 │         dim(names),
172 ▶         getRawSizeColor(typeof rawSize === 'number' ? formatSize(rawSize) : rawSize),
173 ▶         '',
174 │       ];
175 │     }
176 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L193–200 （▶ の行: 194–195, 197–198）

```ts
193 │ 
194 ▶   const bundleInfo: (string | number)[][] = [];
195 ▶   const baseTitles = ['Names', 'Raw size'];
196 │ 
197 ▶   if (showEstimatedTransferSize) {
198 ▶     baseTitles.push('Estimated transfer size');
199 │   }
200 │ 
```

157〜167 行目、見積もりを出すなら 4 つの列を色つきで並べます。数なら 161・164 行目で `formatSize` にし、文字列（`'-'`）はそのままです。見積もりを出さないときは 168〜174 行目で、4 つめの列に空の文字列 `''` を入れます。ところが見出し（195〜199 行目）は、見積もりを出さないとき 198 行目を通らず、3 つの列だけです。

> [!WARNING]
> **ハマりどころ**
>
> そのため、見積もりの無い表では、ファイルの行だけが 4 つの列になり、6 節の `join(' | ')` で行の末尾に「` | `」が残ります。デモの「Estimated transfer size なし」の行は `main-AAAA.js | main | 480.00 kB | ` で終わり、見出しの行は `Raw size` で終わりました。このサイトの `ng build --configuration development`（最適化なし）の表でも、`chunk-2REAW3Q4.js | - | 994.25 kB | ` のように全部のファイルの行が「` | `」で終わっています。サーバーの束の行（52 行目でいつも見積もりなし）は、同じ表のブラウザの段が 4 つめの列の幅を 23 文字に広げているので、「` | `」の後ろに 23 個の空白が続きます。

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L222–244 （▶ の行: 224–225, 229–230, 232–233, 235–236）

```ts
222 │ 
223 │   // Seperator
224 ▶   if (changedEntryChunksStats.length && changedLazyChunksStats.length) {
225 ▶     bundleInfo.push([]);
226 │   }
227 │ 
228 │   // Lazy chunks
229 ▶   if (changedLazyChunksStats.length) {
230 ▶     bundleInfo.push(['Lazy chunk files', ...baseTitles].map(bold), ...changedLazyChunksStats);
231 │ 
232 ▶     if (changedLazyChunksCount > changedLazyChunksStats.length) {
233 ▶       bundleInfo.push([
234 │         dim(
235 ▶           `...and ${changedLazyChunksCount - changedLazyChunksStats.length} more lazy chunks files. ` +
236 ▶             'Use "--verbose" to show all the files.',
237 │         ),
238 │       ]);
239 │     }
240 │   }
241 │ 
242 │   return bundleInfo;
243 │ }
244 │ 
```

224〜226 行目、初期と遅延の両方の段があるときだけ、間に空の行を 1 つ入れます。229〜230 行目で遅延の段の見出し、232〜239 行目で、表に出さなかった遅延チャンクの数を 1 行で書きます（15 個の上限は [budgets の章](../cli/08-cli-budgets.md)の 7 節）。デモの「遅延チャンク 20 個」は 15 個を出して「...and 5 more」、chunk-18.js に予算の警告がある組は 16 個を出して「...and 4 more」でした。予算を超えたチャンクは 15 個を超えても出るからです。

## 6. 幅をそろえて 1 つの文字列にする

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L245–266 （▶ の行: 246–250, 254–255, 259–262）

```ts
245 │ function generateTableText(bundleInfo: (string | number)[][], colors: boolean): string {
246 ▶   const skipText = (value: string) => value.includes('...and ');
247 ▶   const longest: number[] = [];
248 ▶   for (const item of bundleInfo) {
249 ▶     for (let i = 0; i < item.length; i++) {
250 ▶       if (item[i] === undefined) {
251 │         continue;
252 │       }
253 │ 
254 ▶       const currentItem = item[i].toString();
255 ▶       if (skipText(currentItem)) {
256 │         continue;
257 │       }
258 │ 
259 ▶       const currentLongest = (longest[i] ??= 0);
260 ▶       const currentItemLength = stripVTControlCharacters(currentItem).length;
261 ▶       if (currentLongest < currentItemLength) {
262 ▶         longest[i] = currentItemLength;
263 │       }
264 │     }
265 │   }
266 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/stats-table.ts` L267–290 （▶ の行: 267, 270–271, 276, 280–281, 283, 286, 289）

```ts
267 ▶   const seperator = colors ? ansiColors.dim(' | ') : ' | ';
268 │   const outputTable: string[] = [];
269 │   for (const item of bundleInfo) {
270 ▶     for (let i = 0; i < longest.length; i++) {
271 ▶       if (item[i] === undefined) {
272 │         continue;
273 │       }
274 │ 
275 │       const currentItem = item[i].toString();
276 ▶       if (skipText(currentItem)) {
277 │         continue;
278 │       }
279 │ 
280 ▶       const currentItemLength = stripVTControlCharacters(currentItem).length;
281 ▶       const stringPad = ' '.repeat(longest[i] - currentItemLength);
282 │       // Values in columns at index 2 and 3 (Raw and Estimated sizes) are always right aligned.
283 ▶       item[i] = i >= 2 ? stringPad + currentItem : currentItem + stringPad;
284 │     }
285 │ 
286 ▶     outputTable.push(item.join(seperator));
287 │   }
288 │ 
289 ▶   return outputTable.join('\n');
290 │ }
```

1. **列ごとの最大の幅を測る**

   248〜265 行目。260 行目で色の制御文字を除いた長さを測るので、色つきでも幅はそろいます。「...and N more」の行（246 行目）は幅に数えません。数えると、1 つめの列がその長い 1 行に合わせて広がるからです。
2. **詰める向き**

   281〜283 行目。3 つめと 4 つめの列（Raw size と見積もり）は右に、ほかは左に寄せます。
3. **区切りでつなぐ**

   267 行目、区切りは ` | `（色つきなら dim）。270 行目のループは `longest.length`（一番多い列の数）まで回りますが、271 行目でその行に無い列は飛ばすので、短い行は短いまま、空の文字列の列は「区切り + 空白」として残ります。

## 7. デモ：予算の組と表

> **🧪 DEMO — @angular/build 22.2.7 の checkBudgets（記録）**
>
> 出力の組は、初期の main（大きさを組ごとに変える）・polyfills 35 kB・styles 5 kB、遅延の chunk-DDDD.js 12 kB、コンポーネントのスタイル `src/app/app.css` 3 kB、画像 2 kB、main の .map 900 kB です。`checkComponentStyles` は 1 組を除いて `true`（execute-build.ts と同じ）です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-budget)

「anyComponentStyle：checkComponentStyles なし」は、同じ予算でも結果が 0 件です（345〜347 行目、[budgets の章](../cli/08-cli-budgets.md)の引用）。344 行目のコメントのとおり、コンポーネントのスタイルの予算を別の係（webpack の builder の `AnyComponentStyleBudgetChecker`）に任せる呼び方のための引数で、@angular/build の中の呼び出し（execute-build.ts の 307 行目）はいつも `true` です。「all・allScript・any・anyScript」では、`any` と `anyScript` が main と polyfills について同じ文言を 2 回ずつ返しました。予算ごとに計算するので、重なる予算を書くと文言も重なります。

> **🧪 DEMO — @angular/build 22.2.7 の generateEsbuildBuildStatsTable（記録、色つき）**
>
> `FORCE_COLOR=1` で色を出させ、ANSI の制御文字を色の名前に直して残した物を、その色で描いています。予算の結果は `bundle initial` が警告・`main` がエラー・`chunk-18.js` が警告の 3 件です。
>
> `generateEsbuildBuildStatsTable([browser, []], true, true, true)`
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-budget)

「予算の結果つき」では、main の Raw size が赤（エラー）、Initial total の 520.00 kB が黄になりました。Initial total の色は `'bundle initial'` のラベル（206 行目、budgets の章の引用）で引くので、initial の予算の警告で付きます。ファイル名は緑、名前は dim、見積もりはシアン、区切りは dim です。「色なし」は 90〜95 行目の関数が何もしないので、文字は同じで制御文字だけがありません。

## 8. どう録ったか

スクリプトは `<work>/bcu-demo/a/` に置き、サイトの node\_modules の @angular/build 22.2.7 の `utils/bundle-calculator.js` と `utils/stats-table.js` を require しました（Node v24.22.1）。色は listr2 の `color` が環境変数を読んで決めるので、`FORCE_COLOR=1` で走らせ、SGR の制御文字（太字・dim・緑・シアン・赤・黄・マゼンタと、その解除）を読んで「文字と色の名前」の切れ端に直しました。閾値の列だけは、22.2.7 が `calculateThresholds` を export しないので、../angular-cli の 44129f66a3 の bundle-calculator.ts を transpile し、require を dist の `schema.js` と `format-bytes.js` につないで呼んでいます。

📄 `記録のスクリプト（rec-budget.mjs）`

```
// 本物の checkBudgets・calculateThresholds と、表の generateEsbuildBuildStatsTable・generateBuildStatsTable
// （22.2.7 の dist）に、予算と出力の大きさの組を当てて、警告とエラーの文言・表の文字列を記録する。
// 色は FORCE_COLOR=1 で出させ、ANSI のエスケープを「色の名前つきの切れ端」に直して残す。
// 使い方: FORCE_COLOR=1 node rec-budget.mjs <出力 JSON>
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { r, ts, version } from './harness.mjs';

const out = process.argv[2];
const dist = r('utils/bundle-calculator.js');
const { checkBudgets } = dist;
// 22.2.7 は calculateThresholds を export しない（413c164a7c）。閾値を見せるために、
// CLI_REPO（../angular-cli、44129f66a3）の bundle-calculator.ts を transpile して、その calculateThresholds を使う。
const oldSrc = readFileSync(path.join(process.env.CLI_REPO, 'packages/angular/build/src/utils/bundle-calculator.ts'), 'utf8');
const oldJs = ts.transpileModule(oldSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const oldMod = { exports: {} };
new Function('require', 'module', 'exports', oldJs)((id) => r(id.replace('../', '').replace('./', 'utils/') + '.js'), oldMod, oldMod.exports);
const { calculateThresholds } = oldMod.exports;
const exportsOf22 = Object.keys(dist).sort();
const { generateEsbuildBuildStatsTable, generateBuildStatsTable } = r('utils/stats-table.js');

const kB = 1000;
// 出力の組: main（初期）・polyfills（初期）・styles（初期）・遅延チャンク・コンポーネントのスタイル
function makeStats(mainSize) {
  return {
    chunks: [
      { files: ['main-AAAA.js', 'main-AAAA.js.map'], names: ['main'], initial: true },
      { files: ['polyfills-BBBB.js'], names: ['polyfills'], initial: true },
      { files: ['styles-CCCC.css'], names: ['styles'], initial: true },
      { files: ['chunk-DDDD.js'], names: ['home'], initial: false },
    ],
    assets: [
      { name: 'main-AAAA.js', size: mainSize },
      { name: 'main-AAAA.js.map', size: 900 * kB },
      { name: 'polyfills-BBBB.js', size: 35 * kB },
      { name: 'styles-CCCC.css', size: 5 * kB },
      { name: 'chunk-DDDD.js', size: 12 * kB },
      { name: 'src/app/app.css', size: 3 * kB, componentStyle: true },
      { name: 'media/logo.svg', size: 2 * kB },
    ],
  };
}

const run = (budgets, stats, checkComponentStyles = true) => {
  try {
    return { results: [...checkBudgets(budgets, stats, checkComponentStyles)] };
  } catch (e) {
    return { results: [], thrown: `${e.name}: ${e.message}` };
  }
};
const thresholds = (b) => [...calculateThresholds(b)].map((t) => ({ ...t, limit: Number.isNaN(t.limit) ? 'NaN' : t.limit }));

const cases = [
  ['initial-warn', 'initial：警告だけ超える', [{ type: 'initial', maximumWarning: '500kB', maximumError: '1mb' }], 480 * kB],
  ['initial-both', 'initial：警告もエラーも超える', [{ type: 'initial', maximumWarning: '500kB', maximumError: '1mb' }], 1100 * kB],
  ['min', 'initial：最小を満たさない', [{ type: 'initial', minimumWarning: '600kB', minimumError: '550kB' }], 480 * kB],
  ['pct', 'initial：baseline 500kB と warning 5%', [{ type: 'initial', baseline: '500kB', warning: '5%' }], 480 * kB],
  ['pct-nobase', 'initial：baseline 無しで warning 5%', [{ type: 'initial', warning: '5%' }], 480 * kB],
  ['kib', 'initial：500KiB（読めない単位）', [{ type: 'initial', maximumWarning: '500KiB' }], 480 * kB],
  ['bundle', 'bundle：名前つき（main）', [{ type: 'bundle', name: 'main', maximumError: '400kB' }], 480 * kB],
  ['bundle-noname', 'bundle：name が無い', [{ type: 'bundle', maximumError: '1kB' }], 480 * kB],
  ['style', 'anyComponentStyle：2kB', [{ type: 'anyComponentStyle', maximumWarning: '2kB' }], 480 * kB],
  ['style-skip', 'anyComponentStyle：checkComponentStyles なし', [{ type: 'anyComponentStyle', maximumWarning: '2kB' }], 480 * kB, false],
  ['all', 'all・allScript・any・anyScript', [
    { type: 'all', maximumWarning: '500kB' },
    { type: 'allScript', maximumWarning: '500kB' },
    { type: 'any', maximumWarning: '30kB' },
    { type: 'anyScript', maximumWarning: '30kB' },
  ], 480 * kB],
  ['missing', 'チャンクのファイルが assets に無い', [{ type: 'initial', maximumWarning: '500kB' }], 'missing'],
];
const budgets = cases.map(([id, label, b, mainSize, checkStyles = true]) => {
  const stats = makeStats(mainSize === 'missing' ? 480 * kB : mainSize);
  if (mainSize === 'missing') stats.assets = stats.assets.filter((a) => a.name !== 'polyfills-BBBB.js');
  const res = run(b, stats, checkStyles);
  return {
    id,
    label,
    budgets: b,
    checkComponentStyles: checkStyles,
    mainSize: mainSize === 'missing' ? 480 * kB : mainSize,
    initialTotal: (mainSize === 'missing' ? 480 * kB : mainSize) + 35 * kB + 5 * kB,
    thresholds: b.map(thresholds),
    ...res,
  };
});

// ---- 表 ----
// ANSI の SGR を「切れ端」に直す
const NAMES = { 1: 'bold', 2: 'dim', 32: 'green', 35: 'magenta', 36: 'cyan', 91: 'red', 93: 'yellow' };
function segments(text) {
  return text.split('\n').map((line) => {
    const segs = [];
    let state = new Set();
    let buf = '';
    const flush = () => {
      if (buf) segs.push({ t: buf, c: [...state].sort().join(' ') });
      buf = '';
    };
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\u001b' && line[i + 1] === '[') {
        const end = line.indexOf('m', i);
        const codes = line.slice(i + 2, end).split(';').map(Number);
        flush();
        for (const code of codes) {
          if (code === 0) state = new Set();
          else if (code === 22) { state.delete('bold'); state.delete('dim'); }
          else if (code === 39) for (const n of ['green', 'magenta', 'cyan', 'red', 'yellow']) state.delete(n);
          else if (NAMES[code]) state.add(NAMES[code]);
        }
        i = end;
      } else buf += line[i];
    }
    flush();
    return segs;
  });
}
const strip = (t) => t.replace(/\u001b\[[0-9;]*m/g, '');

const browser = () => [
  { initial: true, stats: ['main-AAAA.js', 'main', 480 * kB, 120 * kB] },
  { initial: true, stats: ['polyfills-BBBB.js', 'polyfills', 35 * kB, 11.5 * kB] },
  { initial: true, stats: ['styles-CCCC.css', 'styles', 5 * kB, 1.2 * kB] },
  { initial: false, stats: ['chunk-DDDD.js', 'home', 12 * kB, 3.4 * kB] },
];
const server = () => [
  { initial: true, stats: ['server.mjs', 'server', 1200 * kB, '-'] },
  { initial: false, stats: ['chunk-EEEE.mjs', 'home', 14 * kB, '-'] },
];
const many = () => [
  ...browser().slice(0, 3),
  ...Array.from({ length: 20 }, (_, i) => ({ initial: false, stats: [`chunk-${String(i).padStart(2, '0')}.js`, `lazy-${i}`, (30 - i) * kB, (10 - i / 3) * kB] })),
];
const failures = [
  { severity: 'warning', label: 'bundle initial', message: '…' },
  { severity: 'error', label: 'main', message: '…' },
  { severity: 'warning', label: 'chunk-18.js', message: '…' },
];
const tables = [];
const addTable = (id, label, call, fn) => {
  const text = fn();
  tables.push({ id, label, call, plain: strip(text), segments: segments(text) });
};
addTable('browser', 'ブラウザだけ', 'generateEsbuildBuildStatsTable([browser, []], true, true, true)', () => generateEsbuildBuildStatsTable([browser(), []], true, true, true));
addTable('failures', '予算の結果つき（initial が警告・main がエラー）', 'generateEsbuildBuildStatsTable([browser, []], true, true, true, failures)', () => generateEsbuildBuildStatsTable([browser(), []], true, true, true, failures));
addTable('notransfer', 'Estimated transfer size なし', 'generateEsbuildBuildStatsTable([browser, []], true, true, false)', () => generateEsbuildBuildStatsTable([browser(), []], true, true, false));
addTable('nototal', 'Initial total なし', 'generateEsbuildBuildStatsTable([browser, []], true, false, true)', () => generateEsbuildBuildStatsTable([browser(), []], true, false, true));
addTable('ssr', 'ブラウザとサーバー', 'generateEsbuildBuildStatsTable([browser, server], true, true, true)', () => generateEsbuildBuildStatsTable([browser(), server()], true, true, true));
addTable('serveronly', 'サーバーだけ', 'generateEsbuildBuildStatsTable([[], server], true, true, true)', () => generateEsbuildBuildStatsTable([[], server()], true, true, true));
addTable('many', '遅延チャンク 20 個', 'generateEsbuildBuildStatsTable([many, []], true, true, true)', () => generateEsbuildBuildStatsTable([many(), []], true, true, true));
addTable('many-fail', '遅延チャンク 20 個・chunk-18.js が予算の警告', 'generateEsbuildBuildStatsTable([many, []], true, true, true, failures)', () => generateEsbuildBuildStatsTable([many(), []], true, true, true, failures));
addTable('many-verbose', '遅延チャンク 20 個・verbose', 'generateEsbuildBuildStatsTable([many, []], true, true, true, undefined, true)', () => generateEsbuildBuildStatsTable([many(), []], true, true, true, undefined, true));
addTable('private', '@angular/build/private の generateBuildStatsTable', 'generateBuildStatsTable(many, true, true, true)', () => generateBuildStatsTable(many(), true, true, true));
addTable('nocolor', '色なし（colors = false）', 'generateEsbuildBuildStatsTable([browser, server], false, true, true)', () => generateEsbuildBuildStatsTable([browser(), server()], false, true, true));

const rec = { version, node: process.version, exportsOf22, exportsOfOld: Object.keys(oldMod.exports).sort(), budgets, tables };
writeFileSync(out, JSON.stringify(rec, null, 1));
for (const b of budgets) console.log(b.id, JSON.stringify(b.thresholds), b.thrown ?? '', b.results.map((x) => `${x.severity}: ${x.message}`));
for (const t of tables) console.log('==', t.label, '\n' + t.plain.split('\n').map((l) => JSON.stringify(l)).join('\n'));

```

## ここまでの呼び出し

- `checkBudgets(options.budgets, compatStats, true)` — execute-build.ts 307 → bundle-calculator.ts 339
  - `calculateSizes(budget, stats)` → `new ctor(budget, chunks, assets).calculate()` — 126〜151
    - `calculateChunkSize(chunk)`：assetMap を作り、.map を除いて足す — 166〜192 — *無いファイルは投げる*
  - `checkThresholds(calculateThresholds(budget), size, label)` — 352 → 357
- `logBuildStats(…, budgetFailures, …)` — tools/esbuild/utils.ts
  - `generateEsbuildBuildStatsTable([browser, server], colors, showTotal, showTransfer, failures, verbose)` — stats-table.ts 25
    - `generateBuildStatsData(browser, …)`・`generateBuildStatsData(server, …, false, false)` — 33・52 → 78
    - `generateTableText(bundleInfo, colors)` — 56 → 245

## テストと直し方

| spec | describe / it と行 | この章のどこ |
| --- | --- | --- |
| utils/bundle-calculator\_spec.ts | describe bundle-calculator（17 行目）→ checkBudgets()（18 行目、it 10 件）：最大（19 行目）、最小（50 行目）、bundle（81 行目）、initial（119 行目）、allScript（157 行目）、all（199 行目）、コンポーネントのスタイルを飛ばす（237 行目）、anyScript（270 行目）、any（308 行目）、超えない（346 行目） | 1〜3 節と 7 節の予算の組 |
| （無い） | stats-table.ts の単体の spec。「アセットに無いファイル」（184〜187 行目）と `.map` を除く（182 行目）を固める it | 2・4〜6 節 |

[1 回目](01-bcu-aot.md)のテストの節と同じ bazel の 1 回（41 specs、0 failures）の中で、describe bundle-calculator の 10 件が通りました。

直すとしたら、ファイルと関数は次のとおりです。

- 行の末尾の「 | 」：`stats-table.ts` の `generateBuildStatsData` の 168〜174 行目で、見積もりを出さないときは 3 つの列だけを入れる形です。そうすると 6 節の 271 行目の「無い列は飛ばす」で末尾が切れます。サーバーの段の 23 個の空白も、同じ形で消えます（52 行目は見積もりなし）。固めるなら、同じフォルダに `stats-table_spec.ts` を作り（BUILD.bazel の `unit_test_lib` の glob に入る）、`generateEsbuildBuildStatsTable([rows, []], false, true, false)` の各行が `' | '` で終わらないことを見る it になります。
- 届かない分岐：`bundle-calculator.ts` の 395 行目は、`threshold.type` をそのまま文言に入れる形にすれば、来たときに値が読めます。

## 聞かれそうな質問

**Q. dev の ng build で Estimated transfer size の列が出ないのはなぜですか？**

見積もりを計算するのが、スクリプトの最適化かスタイルの minify があるときだけだからです（execute-build.ts）。そのとき 29 行目の `showEstimatedTransferSize` が偽になり、198 行目で見出しの列が足されず、168〜174 行目で行の 4 つめが空になります。行の末尾の「 | 」はこの組み合わせから出ます。

**Q. SSR のビルドで、サーバーの束に Initial total が出ないのはなぜですか？**

52 行目で、サーバーの束を `showTotalSize` も見積もりも `false` で並べるからです。予算の結果も渡さないので、サーバーの束の行は予算の色も付きません。予算の計算そのものも、`generateBudgetStats` がサーバー用の出力を外しています（budgets の章の 1 節）。

**Q. 予算のチャンクに .map のファイルが入っていたら、大きさに数えられますか？**

数えられません。`calculateChunkSize` の 182 行目で `.map` で終わるファイルを除きます。デモの main のチャンクには 900 kB の .map がありますが、initial の合計は 520 kB のままでした。`all` と `any` の計算機も 255・283 行目（budgets の章の引用）で .map を除きます。

**Q. 「Could not find asset for file」で ng build が止まるのはどんなときですか？**

チャンクの files にあるファイルが、アセットの一覧に無いときです（184〜187 行目）。`generateBudgetStats` は同じ出力の一覧からチャンクとアセットを作るので、ふつうは起きません。デモでは、アセットから polyfills のファイルだけを抜いて起こしました。

## 読み終えて

- 予算の計算は webpack の統計情報の形（チャンクとアセット）を受け取り、結果は severity・message・label の 3 つで返す。label が表の色を決める。
- Calculator の calculateChunkSize は、アセットの Map を 1 回だけ作り、.map を除いて足し、無いファイルには例外を投げる。
- 22.2.7 は calculateThresholds と checkThresholds を export しない。switch の default は届かず、届いても文字列の enum なので型の名前は undefined になる。
- 表の入口は、ブラウザとサーバーを分ける generateEsbuildBuildStatsTable と、いつも verbose の generateBuildStatsTable（private）。サーバーの段は合計・見積もり・予算なし。
- 見積もりを出さない表では、ファイルの行だけが 4 つの列になり、行の末尾に「 | 」が残る。dev の ng build の表がそうなっている。

---

← 前: [AngularHost・uri・lazy-routes-transformer：ホストの差し替えと遅延ルートの書き換え](04-bcu-host.md)  
次: [index.html の仕上げ：augment-index-html・IndexHtmlGenerator・inline-fonts の残り](06-bcu-index.md) →
