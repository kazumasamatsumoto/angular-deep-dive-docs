[目次](../README.md) › [tools/esbuild の読み残し：束ね方の設定・JS の後処理・watch・i18n の差し込み・スタイル・コンパイラプラグインの残りを行で埋める](README.md) › 第 5 回 / 全 7 回

# スタイルのプラグイン：StylesheetPluginFactory と Sass・Less・PostCSS の結果

> tools/esbuild/stylesheets の未読の行：言語という値と create、PostCSS を 1 回だけ用意する getter と onStart（失敗のときの扱い）、PostCSS の結果の混ぜ方・警告・依存、Sass のコンパイラ（sass-embedded と JavaScript 版）・パッケージの深い import・警告、Less の読み込み、エラーのときに Sass のスタックから拾う watchFiles、url() のエラーの注とキャッシュの鍵の頭。

angular/angular-cli · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/esb-styles)

---

この章で分かること：`StylesheetPluginFactory` が 1 つの「言語」（Sass・Less・CSS）から esbuild のプラグインを作るとき、PostCSS をいつ用意し、失敗したら何を返すか。Sass がどのコンパイラで動き、パッケージの深い import・警告・エラーをどう esbuild の形に直すか。Less がファイルをどう探すか。そして、エラーのときに「次にどのファイルが変われば作り直すか」（`watchFiles`）がどう決まるか。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/src/tools/esbuild/stylesheets/` の `stylesheet-plugin-factory.ts`・`sass-language.ts`・`less-language.ts`・`css-language.ts`・`css-resource-plugin.ts`・`bundle-options.ts`・`css-inline-fonts-plugin.ts`・`stylesheet-cache-key.ts` の残りと、`tools/sass/sass-service.ts` の頭です。コンポーネントのスタイルが esbuild に渡るまで、`createStylesheetBundleOptions` の設定、onLoad の 2 つの受け口、PostCSS と Tailwind の設定ファイルの探し方、`url()` の解決は [cli-component-styles の章](../cli/04-cli-component-styles.md)で、ファイル名のハッシュとフォントの埋め込みは [bmap-styles-bundle の章](../bmap/02-bmap-styles-bundle.md)で読んだので繰り返しません。

1. [1. 束ね方の設定を作る関数](01-esb-code-bundle.md)
2. [2. JavaScriptTransformer](02-esb-js-transformer.md)
3. [3. watcher](03-esb-watcher.md)
4. [4. I18nInliner](04-esb-i18n-inliner.md)
5. **5. スタイルのプラグイン**（この章）
6. [6. compiler-plugin の残り](06-esb-compiler-rest.md)
7. [7. spec と issue](07-esb-tests-issues.md)

## 0. 全体の流れ

1. **設定の型を受け取る**

   `bundle-options.ts` の `BundleStylesheetOptions` から、プラグイン用の `StylesheetPluginOptions` を作る（1 節）。
2. **言語ごとにプラグインを作る**

   `create(言語)` を Sass・Less・CSS の 3 回呼ぶ。言語は「名前・2 つの filter・`process`」の 4 つだけの値（2 節）。
3. **PostCSS を 1 回だけ用意する**

   3 つのプラグインが同じ promise を待ち、失敗したら onStart でエラーを返す（3 節）。
4. **言語の process → PostCSS**

   Sass・Less は CSS にコンパイルし、要るときだけ PostCSS に通して結果を混ぜる（4〜6 節）。
5. **エラーと watchFiles**

   エラーのときも「どのファイルを見張れば直ったと分かるか」を返す（5・7 節）。

## 1. 設定の型と import

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/bundle-options.ts` L9–37 （▶ の行: 23–24, 26, 29–30, 33–34, 36）

```ts
 9 │ import type { BuildOptions, Plugin } from 'esbuild';
10 │ import path from 'node:path';
11 │ import { NormalizedCachedOptions } from '../../../utils/normalize-cache';
12 │ import { PostcssConfiguration } from '../../../utils/postcss-configuration';
13 │ import { LoadResultCache } from '../load-result-cache';
14 │ import { createCssInlineFontsPlugin } from './css-inline-fonts-plugin';
15 │ import { CssStylesheetLanguage } from './css-language';
16 │ import { createCssResourcePlugin } from './css-resource-plugin';
17 │ import { LessStylesheetLanguage } from './less-language';
18 │ import { SassStylesheetLanguage } from './sass-language';
19 │ import { StylesheetPluginFactory, StylesheetPluginsass } from './stylesheet-plugin-factory';
20 │ 
21 │ export interface BundleStylesheetOptions {
22 │   workspaceRoot: string;
23 ▶   optimization: boolean;
24 ▶   inlineFonts: boolean;
25 │   preserveSymlinks?: boolean;
26 ▶   sourcemap: boolean | 'external' | 'inline' | 'linked';
27 │   sourcesContent?: boolean;
28 │   outputNames: { bundles: string; media: string };
29 ▶   includePaths?: string[];
30 ▶   sass?: StylesheetPluginsass;
31 │   externalDependencies?: string[];
32 │   target: string[];
33 ▶   tailwindConfiguration?: { file: string; package: string };
34 ▶   postcssConfiguration?: { config: PostcssConfiguration; configPath: string };
35 │   publicPath?: string;
36 ▶   cacheOptions: NormalizedCachedOptions;
37 │ }
```

`BundleStylesheetOptions` は、グローバルのスタイルとコンポーネントのスタイルの両方の束で使う設定です。23 行目の minify、24 行目のフォントの埋め込み、26 行目のソースマップ、29 行目の `includePaths`（angular.json の `stylePreprocessorOptions.includePaths`）、30 行目の Sass の非推奨の扱い、33〜34 行目の Tailwind と PostCSS の設定です。このうちプラグインに渡るのは、`createStylesheetBundleOptions`（cli-component-styles の 4 節）が選んだ 6 つです。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L9–37 （▶ の行: 14–15, 23–25, 31, 37）

```ts
 9 │ import type { OnLoadResult, Plugin, PluginBuild } from 'esbuild';
10 │ import assert from 'node:assert';
11 │ import { readFile } from 'node:fs/promises';
12 │ import { createRequire } from 'node:module';
13 │ import { dirname, extname } from 'node:path';
14 ▶ import type { Options } from 'sass-embedded';
15 ▶ import { glob } from 'tinyglobby';
16 │ import { assertIsError } from '../../../utils/error';
17 │ import type { PostcssConfiguration } from '../../../utils/postcss-configuration';
18 │ import { LoadResultCache, createCachedLoad } from '../load-result-cache';
19 │ 
20 │ /**
21 │  * Configuration options for handling Sass-specific deprecations in a stylesheet plugin.
22 │  */
23 ▶ export type StylesheetPluginsass = Pick<
24 ▶   Options<'async'>,
25 ▶   'futureDeprecations' | 'fatalDeprecations' | 'silenceDeprecations'
26 │ >;
27 │ 
28 │ /**
29 │  * Convenience type for a postcss processor.
30 │  */
31 ▶ type PostcssProcessor = import('postcss').Processor;
32 │ 
33 │ /**
34 │  * The lazy-loaded instance of the postcss stylesheet postprocessor.
35 │  * It is only imported and initialized if postcss is needed.
36 │  */
37 ▶ let postcss: (typeof import('postcss'))['default'] | undefined;
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L42–79 （▶ の行: 47, 53, 59, 66, 69–71, 73, 78）

```ts
42 │ export interface StylesheetPluginOptions {
43 │   /**
44 │    * Controls the use and creation of sourcemaps when processing the stylesheets.
45 │    * If true, sourcemap processing is enabled; if false, disabled.
46 │    */
47 ▶   sourcemap: boolean;
48 │ 
49 │   /**
50 │    * An optional array of paths that will be searched for stylesheets if the default
51 │    * resolution process for the stylesheet language does not succeed.
52 │    */
53 ▶   includePaths?: string[];
54 │ 
55 │   /**
56 │    * Optional component data for any inline styles from Component decorator `styles` fields.
57 │    * The key is an internal angular resource URI and the value is the stylesheet content.
58 │    */
59 ▶   inlineComponentData?: Record<string, string>;
60 │ 
61 │   /**
62 │    * Optional information used to load and configure Tailwind CSS. If present, the postcss
63 │    * will be added to the stylesheet processing with the Tailwind plugin setup as provided
64 │    * by the configuration file.
65 │    */
66 ▶   tailwindConfiguration?: { file: string; package: string };
67 │ 
68 │   /**
69 ▶    * Optional configuration object for custom postcss usage. If present, postcss will be
70 ▶    * initialized and used for every stylesheet. This overrides the tailwind integration
71 ▶    * and any tailwind usage must be manually configured in the custom postcss usage.
72 │    */
73 ▶   postcssConfiguration?: { config: PostcssConfiguration; configPath: string };
74 │ 
75 │   /**
76 │    * Optional Options for configuring Sass behavior.
77 │    */
78 ▶   sass?: StylesheetPluginsass;
79 │ }
```

23〜26 行目、Sass の設定は `sass-embedded` の型から非推奨の 3 つだけを選んだものです。14 行目の import は型だけなので、Sass を使わないビルドで `sass-embedded` は読まれません。37 行目、PostCSS も型だけ先に宣言し、実物は要るときに import します（3 節）。15 行目の `tinyglobby` は、PostCSS のプラグインが「このフォルダの下全部」を依存として返したときに使います（6 節）。69〜71 行目、PostCSS の設定ファイルがあれば Tailwind の自動の組み込みより優先します。Tailwind を使うなら、その設定ファイルに自分で書く約束です。

## 2. 言語という値と、create の頭

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L96–113 （▶ の行: 97–100, 105, 112）

```ts
 96 │ export interface StylesheetLanguage {
 97 ▶   name: string;
 98 ▶   componentFilter: RegExp;
 99 ▶   fileFilter: RegExp;
100 ▶   process?(
101 │     data: string,
102 │     file: string,
103 │     format: string,
104 │     options: StylesheetPluginOptions,
105 ▶     build: PluginBuild,
106 │   ): OnLoadResult | Promise<OnLoadResult>;
107 │ }
108 │ 
109 │ /**
110 │  * Cached postcss instances that can be re-used between various StylesheetPluginFactory instances.
111 │  */
112 ▶ const postcssProcessors = new Map<string, WeakRef<PostcssProcessor>>();
113 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L114–125 （▶ の行: 116–117, 120–121, 124）

```ts
114 │ export class StylesheetPluginFactory {
115 │   constructor(
116 ▶     private readonly options: StylesheetPluginOptions,
117 ▶     private readonly cache?: LoadResultCache,
118 │   ) {}
119 │ 
120 ▶   create(language: Readonly<StylesheetLanguage>): Plugin {
121 ▶     const { cache, options, setupPostcss } = this;
122 │ 
123 │     // Return a noop plugin if no load actions are required
124 ▶     if (!language.process && !options.postcssConfiguration && !options.tailwindConfiguration) {
125 │       return {
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/css-language.ts` L8–15 （▶ の行: 12–14）

```ts
 8 │ 
 9 │ import { StylesheetLanguage } from './stylesheet-plugin-factory';
10 │ 
11 │ export const CssStylesheetLanguage = Object.freeze<StylesheetLanguage>({
12 ▶   name: 'css',
13 ▶   componentFilter: /^css;/,
14 ▶   fileFilter: /\.css$/,
15 │ });
```

97〜106 行目、言語は名前・インラインのスタイルの名前に当てる正規表現・ファイル名に当てる正規表現・任意の `process` の 4 つです。105 行目、`process` は esbuild の `PluginBuild` を受け取るので、Sass や Less の中から esbuild の解決（`build.resolve`）を呼べます。CSS の言語（12〜14 行目）は `process` を持ちません。112 行目の表は PostCSS の実物を `WeakRef` で覚え、別の `StylesheetPluginFactory`（ビルドのたびに作られる）でも同じ設定なら使い回します。121 行目、`create` の最初の行で `setupPostcss` を分割代入で取り出しています。`setupPostcss` は getter（3 節の 204 行目）なので、**この行を通った時点で** PostCSS の用意が始まります。124 行目の「何もしないプラグイン」を返す場合でも同じです。

## 3. PostCSS を 1 回だけ用意する：onStart と getter

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L133–157 （▶ の行: 135–136, 138–139, 143, 148）

```ts
133 │       async setup(build) {
134 │         // Setup postcss if needed
135 ▶         let postcssProcessor: PostcssProcessor | undefined;
136 ▶         build.onStart(async () => {
137 │           try {
138 ▶             postcssProcessor = await setupPostcss;
139 ▶           } catch {
140 │             return {
141 │               errors: [
142 │                 {
143 ▶                   text: 'Unable to load the "postcss" stylesheet processor.',
144 │                   location: null,
145 │                   notes: [
146 │                     {
147 │                       text:
148 ▶                         'Ensure that the "postcss" Node.js package is installed within the project. ' +
149 │                         "If not present, installation via the project's package manager should resolve the error.",
150 │                     },
151 │                   ],
152 │                 },
153 │               ],
154 │             };
155 │           }
156 │         });
157 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L203–216 （▶ の行: 203, 205, 208, 215）

```ts
203 ▶   private setupPostcssPromise: Promise<PostcssProcessor | undefined> | undefined;
204 │   private get setupPostcss(): Promise<PostcssProcessor | undefined> {
205 ▶     return (this.setupPostcssPromise ??= this.initPostcss());
206 │   }
207 │ 
208 ▶   private initPostcssCallCount = 0;
209 │ 
210 │   /**
211 │    * This method should not be called directly.
212 │    * Use {@link setupPostcss} instead.
213 │    */
214 │   private async initPostcss(): Promise<PostcssProcessor | undefined> {
215 ▶     assert.equal(++this.initPostcssCallCount, 1, '`initPostcss` was called more than once.');
216 │ 
```

1. **205 行目：promise を 1 つだけ作る**

   `??=` で、最初に読まれたときだけ `initPostcss` を呼ぶ。3 つの言語の `create` は同じ promise を受け取る。
2. **215 行目：2 回呼ばれたら止める**

   3 つのプラグインがそれぞれ PostCSS を作ってプラグインが 3 重にかかった不具合（#27804）を直したときの見張り（f102f815e4）。
3. **136〜138 行目：束ねる前に待つ**

   esbuild の `onStart`（束ねの始めに毎回呼ばれる）で promise を待ち、onLoad が使う変数に入れる。
4. **139〜155 行目：失敗したら 1 つのエラー**

   どんな失敗でも「"postcss" を読めない」というエラーを返す。プラグインごとに onStart があるので、3 つのプラグインから 3 つ出る。

> [!WARNING]
> **ハマりどころ**
>
> PostCSS の設定ファイルに、入っていないプラグインの名前を書いて ng build を走らせると、ビルドは esbuild のエラーにならず、`Error: Cannot find module 'postcss-no-such-plugin'` のスタックを出して Node ごと終わります（デモの「PostCSS の設定に無いプラグイン」）。121 行目で始まった promise が、138 行目の `await` が付く前に失敗するので、Node が「誰も受けていない reject」として扱うからです。手元で `setupPostcss` の promise に先に空の `catch` を付けると、落ちずに 143 行目のエラーが 3 つ出ました。ただしその文は "postcss" が無いと言い、本当の理由（プラグインの名前）は 139 行目の `catch` で捨てられています。新しい本家（815c98e07a）も 121・138・139 行目は同じです。

PostCSS の実物を作る `initPostcss` の本体（218〜256 行目）は cli-component-styles の 6 節です。

## 4. PostCSS に通したあとの混ぜ方

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L259–267 （▶ の行: 259, 266）

```ts
259 ▶ async function processStylesheet(
260 │   language: Readonly<StylesheetLanguage>,
261 │   data: string,
262 │   filename: string,
263 │   format: string,
264 │   options: StylesheetPluginOptions,
265 │   build: PluginBuild,
266 ▶   postcssProcessor: PostcssProcessor | undefined,
267 │ ) {
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L297–324 （▶ の行: 298–299, 301–302, 304–305, 310–312）

```ts
297 │     // Merge results
298 ▶     if (postcssResult.errors?.length) {
299 ▶       delete result.contents;
300 │     }
301 ▶     if (result.warnings && postcssResult.warnings) {
302 ▶       postcssResult.warnings.unshift(...result.warnings);
303 │     }
304 ▶     if (result.watchFiles && postcssResult.watchFiles) {
305 ▶       postcssResult.watchFiles.unshift(...result.watchFiles);
306 │     }
307 │     if (result.watchDirs && postcssResult.watchDirs) {
308 │       postcssResult.watchDirs.unshift(...result.watchDirs);
309 │     }
310 ▶     result = {
311 ▶       ...result,
312 ▶       ...postcssResult,
313 │     };
314 │   }
315 │ 
316 │   return result;
317 │ }
318 │ 
319 │ /**
320 │  * Searches the provided contents for keywords that indicate Tailwind is used
321 │  * within a stylesheet.
322 │  * @param contents A string or Uint8Array containing UTF-8 text.
323 │  * @returns True, if the contents contains tailwind keywords; False, otherwise.
324 │  */
```

`processStylesheet`（言語の process → PostCSS を通すか決める所、268〜296 行目）は cli-component-styles の 6 節です。PostCSS を通したら、ここで 2 つの結果を混ぜます。298〜300 行目、PostCSS がエラーなら Sass の CSS を捨てます。301〜309 行目、Sass の警告と見張るファイルを PostCSS の結果の**前**に足します。310〜313 行目のスプレッドは後ろが勝つので、`contents`・`loader` は PostCSS の値になります。301 行目、両方に警告の配列があるときだけ混ぜます。PostCSS が警告を返さなかった（`warnings` が無い）ときは 312 行目で Sass の側が残るので、どちらの警告も消えません。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L337–366 （▶ の行: 353–358, 363–364）

```ts
337 │ /**
338 │  * Compiles the provided CSS stylesheet data using a provided postcss processor and provides an
339 │  * esbuild load result that can be used directly by an esbuild Plugin.
340 │  * @param data The stylesheet content to process.
341 │  * @param filename The name of the file that contains the data.
342 │  * @param postcssProcessor A postcss processor instance to use.
343 │  * @param options The plugin options to control the processing.
344 │  * @returns An esbuild OnLoaderResult object with the processed content, warnings, and/or errors.
345 │  */
346 │ async function compileString(
347 │   data: string,
348 │   filename: string,
349 │   postcssProcessor: import('postcss').Processor,
350 │   options: StylesheetPluginOptions,
351 │ ): Promise<OnLoadResult> {
352 │   try {
353 ▶     const postcssResult = await postcssProcessor.process(data, {
354 ▶       from: filename,
355 ▶       to: filename,
356 ▶       map: options.sourcemap && {
357 ▶         inline: true,
358 ▶         sourcesContent: true,
359 │       },
360 │     });
361 │ 
362 │     const loadResult: OnLoadResult = {
363 ▶       contents: postcssResult.css,
364 ▶       loader: 'css',
365 │     };
366 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L367–393 （▶ の行: 367, 369, 371, 376, 378–379, 385–388）

```ts
367 ▶     const rawWarnings = postcssResult.warnings();
368 │     if (rawWarnings.length > 0) {
369 ▶       const lineMappings = new Map<string, string[] | null>();
370 │       loadResult.warnings = rawWarnings.map((warning) => {
371 ▶         const file = warning.node.source?.input.file;
372 │         if (file === undefined) {
373 │           return { text: warning.text };
374 │         }
375 │ 
376 ▶         let lines = lineMappings.get(file);
377 │         if (lines === undefined) {
378 ▶           lines = warning.node.source?.input.css.split(/\r?\n/);
379 ▶           lineMappings.set(file, lines ?? null);
380 │         }
381 │ 
382 │         return {
383 │           text: warning.text,
384 │           location: {
385 ▶             file,
386 ▶             line: warning.line,
387 ▶             column: warning.column - 1,
388 ▶             lineText: lines?.[warning.line - 1],
389 │           },
390 │         };
391 │       });
392 │     }
393 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L394–412 （▶ の行: 395, 397, 399–401, 404–406, 408）

```ts
394 │     for (const resultMessage of postcssResult.messages) {
395 ▶       if (resultMessage.type === 'dependency' && typeof resultMessage['file'] === 'string') {
396 │         loadResult.watchFiles ??= [];
397 ▶         loadResult.watchFiles.push(resultMessage['file']);
398 │       } else if (
399 ▶         resultMessage.type === 'dir-dependency' &&
400 ▶         typeof resultMessage['dir'] === 'string' &&
401 ▶         typeof resultMessage['glob'] === 'string'
402 │       ) {
403 │         loadResult.watchFiles ??= [];
404 ▶         const dependencies = await glob(resultMessage['glob'], {
405 ▶           absolute: true,
406 ▶           cwd: resultMessage['dir'],
407 │         });
408 ▶         loadResult.watchFiles.push(...dependencies);
409 │       }
410 │     }
411 │ 
412 │     return loadResult;
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-plugin-factory.ts` L413–444 （▶ の行: 414–416, 421, 425, 430, 433, 438）

```ts
413 │   } catch (error) {
414 ▶     postcss ??= (await import('postcss')).default;
415 ▶     if (error instanceof postcss.CssSyntaxError) {
416 ▶       const lines = error.source?.split(/\r?\n/);
417 │ 
418 │       return {
419 │         errors: [
420 │           {
421 ▶             text: error.reason,
422 │             location: {
423 │               file: error.file,
424 │               line: error.line,
425 ▶               column: error.column && error.column - 1,
426 │               lineText: error.line === undefined ? undefined : lines?.[error.line - 1],
427 │             },
428 │           },
429 │         ],
430 ▶         watchFiles: error.file && error.file !== filename ? [filename, error.file] : [filename],
431 │       };
432 │     } else {
433 ▶       assertIsError(error);
434 │ 
435 │       return {
436 │         errors: [
437 │           {
438 ▶             text: error.message,
439 │           },
440 │         ],
441 │       };
442 │     }
443 │   }
444 │ }
```

1. **353〜360 行目：PostCSS を回す**

   入力と出力の名前を同じファイル名にし、ソースマップが要るときは CSS の中に埋める形にする。esbuild がそのコメントを読んでつなぐ。
2. **367〜392 行目：警告を esbuild の形に**

   ファイルごとに 1 回だけ中身を行に割って覚え（376〜380 行目）、警告の行の文字列を添える。387 行目、PostCSS の列は 1 から、esbuild は 0 からなので 1 を引く。
3. **394〜410 行目：依存を見張るファイルに**

   PostCSS のプラグインが返す `dependency`（1 ファイル）と `dir-dependency`（フォルダと glob）を `watchFiles` に入れる。後者は 404 行目で glob を展開する。Tailwind が読む HTML や TS がこれで見張られる。
4. **413〜442 行目：例外を esbuild のエラーに**

   CSS の構文エラーなら位置と行を添え、430 行目で問題のファイルも見張る（bcadbbef20）。それ以外は文だけ。

## 5. Sass：コンパイラ、パッケージの深い import、警告

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/sass-language.ts` L9–46 （▶ の行: 13, 17–20, 23, 26–27, 30, 36, 39）

```ts
 9 │ import type { OnLoadResult, PartialMessage, PartialNote, ResolveResult } from 'esbuild';
10 │ import { dirname, join } from 'node:path';
11 │ import { fileURLToPath, pathToFileURL } from 'node:url';
12 │ import type { CanonicalizeContext, CompileResult, Exception, Syntax } from 'sass-embedded';
13 ▶ import type { SassCompiler } from '../../sass/sass-service';
14 │ import { MemoryCache } from '../cache';
15 │ import { StylesheetLanguage, StylesheetPluginOptions } from './stylesheet-plugin-factory';
16 │ 
17 ▶ let sassService: SassCompiler | undefined;
18 ▶ let sassServicePromise: Promise<SassCompiler> | undefined;
19 ▶ let resolutionCache: MemoryCache<URL | null> | undefined;
20 ▶ let packageRootCache: MemoryCache<string | null> | undefined;
21 │ 
22 │ function isSassException(error: unknown): error is Exception {
23 ▶   return !!error && typeof error === 'object' && 'sassMessage' in error;
24 │ }
25 │ 
26 ▶ export function resetSassWorkerPoolCaches(): void {
27 ▶   resolutionCache?.clear();
28 │   packageRootCache?.clear();
29 │   if (sassService) {
30 ▶     sassService.clearCache();
31 │   } else if (sassServicePromise) {
32 │     void sassServicePromise.then((service) => service.clearCache());
33 │   }
34 │ }
35 │ 
36 ▶ export function shutdownSassWorkerPool(): void {
37 │   resetSassWorkerPoolCaches();
38 │   if (sassService) {
39 ▶     void sassService.close();
40 │     sassService = undefined;
41 │   } else if (sassServicePromise) {
42 │     void sassServicePromise.then(shutdownSassWorkerPool);
43 │   }
44 │   sassServicePromise = undefined;
45 │ }
46 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/sass/sass-service.ts` L40–62 （▶ の行: 45, 50, 53–54, 56, 59, 61）

```ts
40 │ /**
41 │  * A Sass renderer implementation that uses the persistent Dart Sass embedded compiler
42 │  * daemon (`sass-embedded`) communicating over standard input/output with protocol buffers,
43 │  * or falls back to the pure-JS Dart Sass async compiler (`sass.initAsyncCompiler()`).
44 │  */
45 ▶ export class SassCompiler {
46 │   #asyncCompiler: AsyncCompiler | undefined;
47 │   #asyncCompilerPromise: Promise<AsyncCompiler> | undefined;
48 │   readonly #directoryCache = new Map<string, DirectoryEntry>();
49 │ 
50 ▶   constructor(private readonly rebase = false) {}
51 │ 
52 │   async #createAsyncCompiler(): Promise<AsyncCompiler> {
53 ▶     if (useSassEmbedded) {
54 ▶       const { initAsyncCompiler } = await import('sass-embedded');
55 │ 
56 ▶       return initAsyncCompiler();
57 │     }
58 │ 
59 ▶     const { initAsyncCompiler } = await import('sass');
60 │ 
61 ▶     return initAsyncCompiler() as unknown as Promise<AsyncCompiler>;
62 │   }
```

17〜20 行目、Sass のコンパイラと 2 つの解決の表は、モジュールの変数としてビルドをまたいで残ります。26 行目の `resetSassWorkerPoolCaches` は ng serve の再ビルドのたびに（[cli-cache-watch の章](../cli/10-cli-cache-watch.md)の build-action.ts の 216 行目）、36 行目の `shutdownSassWorkerPool` は watch でないビルドの終わりと watch を止めたときに呼ばれます（[boot-application-build の章](../boot/04-boot-application-build.md)の 105 行目、[abl-results の章](../abl/02-abl-results.md)の 262 行目）。名前に WorkerPool とありますが、Sass のワーカーのプールは fc5a2ecb14 で消え、いまの実体は `sass-service.ts` の `SassCompiler` です。53〜56 行目、既定では `sass-embedded`（Dart で書かれた Sass を別のプロセスで常駐させて、標準入出力で話す）を使い、`NG_BUILD_SASS_EMBEDDED=0` や WebContainer では 59〜61 行目の、同じプロセスで動く JavaScript 版の `sass` を使います（ecbcd87b88）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/sass-language.ts` L72–106 （▶ の行: 73–74, 76, 80–81, 94–97, 101, 103）

```ts
 72 │ function parsePackageName(url: string): { packageName: string; readonly pathSegments: string[] } {
 73 ▶   const parts = (url.startsWith('pkg:') ? url.slice(4) : url).split('/');
 74 ▶   const hasScope = parts.length >= 2 && parts[0][0] === '@';
 75 │   const [nameOrScope, nameOrFirstPath, ...pathPart] = parts;
 76 ▶   const packageName = hasScope ? `${nameOrScope}/${nameOrFirstPath}` : nameOrScope;
 77 │ 
 78 │   return {
 79 │     packageName,
 80 ▶     get pathSegments() {
 81 ▶       return !hasScope && nameOrFirstPath ? [nameOrFirstPath, ...pathPart] : pathPart;
 82 │     },
 83 │   };
 84 │ }
 85 │ 
 86 │ async function compileString(
 87 │   data: string,
 88 │   filePath: string,
 89 │   syntax: Syntax,
 90 │   options: StylesheetPluginOptions,
 91 │   resolveUrl: (url: string, options: CanonicalizeContext) => Promise<ResolveResult>,
 92 │ ): Promise<OnLoadResult> {
 93 │   // Lazily load Sass when a Sass file is found
 94 ▶   if (sassService === undefined) {
 95 ▶     if (sassServicePromise === undefined) {
 96 ▶       sassServicePromise = import('../../sass/sass-service').then(
 97 ▶         (sassService) => new sassService.SassCompiler(true),
 98 │       );
 99 │     }
100 │     try {
101 ▶       sassService = await sassServicePromise;
102 │     } finally {
103 ▶       sassServicePromise = undefined;
104 │     }
105 │   }
106 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/sass-language.ts` L144–172 （▶ の行: 145, 147, 149–150, 154, 156, 164–165, 169）

```ts
144 │               // Check for package deep imports
145 ▶               const { packageName, pathSegments } = parsePackageName(url);
146 │ 
147 ▶               // Caching package root locations is particularly beneficial for `@material/*` packages
148 │               // which extensively use deep imports.
149 ▶               const packageRootKey = `${options.containingUrl?.href ?? ''}:${packageName}`;
150 ▶               const packageRoot = await currentPackageRootCache.getOrCreate(
151 │                 packageRootKey,
152 │                 async () => {
153 │                   // Use the required presence of a package root `package.json` file to resolve the location
154 ▶                   const packageResult = await resolveUrl(packageName + '/package.json', options);
155 │ 
156 ▶                   return packageResult.path ? dirname(packageResult.path) : null;
157 │                 },
158 │               );
159 │ 
160 │               // Package not found could be because of an error or the specifier is intended to be found
161 │               // via a later stage of the resolution process (`loadPaths`, etc.).
162 │               // Errors are reported after the full completion of the resolution process. Exceptions for
163 │               // not found packages should not be raised here.
164 ▶               if (packageRoot) {
165 ▶                 return pathToFileURL(join(packageRoot, ...pathSegments));
166 │               }
167 │ 
168 │               // Not found
169 ▶               return null;
170 │             });
171 │           },
172 │         },
```

`@use 'demo-theme/mixins'` のような「パッケージ名 + 中のパス」は、esbuild の解決（cli-component-styles の 5 節の 60 行目）では見つからないことがあります。esbuild の解決は拡張子も Sass の部分ファイルの先頭の `_` も補わず、パッケージの package.json の `sass` の欄は入口の 1 ファイルしか指さないからです。そのとき 145 行目でパッケージ名と残りのパスに分け（73〜83 行目。`@scope/name` なら 2 つ目までが名前）、154 行目で `パッケージ名/package.json` を解決して、そのフォルダに残りのパスをつなぎます（164〜166 行目）。149 行目、パッケージのフォルダは「呼んだファイルの URL + パッケージ名」で覚えます。`@material/*` のように深い import が多いパッケージで、同じ探索を繰り返さないためです（147〜148 行目のコメント）。なお、1 段目の表（cli-component-styles の章で引いた 134〜136 行目）はパッケージの URL を呼んだ場所に関係なく覚えるので、node\_modules の中の別の版を引く場合を取り違えます。22.2.x では「囲んでいるパッケージ」ごとに覚える形に直っています（ed52db253f / 040bc21ec3）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/sass-language.ts` L173–196 （▶ の行: 175, 177–178, 180–181, 185–188, 190–191）

```ts
173 │       ],
174 │       logger: {
175 ▶         warn: (text, { deprecation, stack, span }) => {
176 │           const notes: PartialNote[] = [];
177 ▶           if (deprecation) {
178 ▶             notes.push({ text });
179 │           }
180 ▶           if (stack && !span) {
181 ▶             notes.push({ text: stack });
182 │           }
183 │ 
184 │           warnings.push({
185 ▶             text: deprecation ? 'Deprecation' : text,
186 ▶             location: span && {
187 ▶               file: span.url && fileURLToPath(span.url),
188 ▶               lineText: span.context,
189 │               // Sass line numbers are 0-based while esbuild's are 1-based
190 ▶               line: span.start.line + 1,
191 ▶               column: span.start.column,
192 │             },
193 │             notes,
194 │           });
195 │         },
196 │       },
```

Sass の警告は、ここで esbuild の警告の形に直します。177〜179 行目、非推奨の警告なら見出しを `Deprecation` にし、Sass の長い説明を注に回します（デモの legacy.scss の `@import`）。180〜182 行目、位置（`span`）が無くスタックだけの警告は、スタックを注にします。190 行目、Sass の行は 0 から、esbuild は 1 からなので 1 を足します。

## 6. Less：読み込みの順と、見張るファイル

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/less-language.ts` L9–37 （▶ の行: 17, 26–27, 32–33, 35）

```ts
 9 │ import type { Location, OnLoadResult, PluginBuild } from 'esbuild';
10 │ import { readFile } from 'node:fs/promises';
11 │ import { StylesheetLanguage, StylesheetPluginOptions } from './stylesheet-plugin-factory';
12 │ 
13 │ /**
14 │  * The lazy-loaded instance of the less stylesheet preprocessor.
15 │  * It is only imported and initialized if a less stylesheet is used.
16 │  */
17 ▶ let lessPreprocessor: typeof import('less') | undefined;
18 │ 
19 │ interface LessException extends Error {
20 │   filename: string;
21 │   line: number;
22 │   column: number;
23 │   extract?: string[];
24 │ }
25 │ 
26 ▶ function isLessException(error: unknown): error is LessException {
27 ▶   return !!error && typeof error === 'object' && 'column' in error;
28 │ }
29 │ 
30 │ export const LessStylesheetLanguage = Object.freeze<StylesheetLanguage>({
31 │   name: 'less',
32 ▶   componentFilter: /^less;/,
33 ▶   fileFilter: /\.less$/,
34 │   process(data, file, _, options, build) {
35 ▶     return compileString(data, file, options, build.resolve.bind(build));
36 │   },
37 │ });
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/less-language.ts` L39–65 （▶ の行: 46–47, 51, 56）

```ts
39 │ async function compileString(
40 │   data: string,
41 │   filename: string,
42 │   options: StylesheetPluginOptions,
43 │   resolver: PluginBuild['resolve'],
44 │ ): Promise<OnLoadResult> {
45 │   try {
46 ▶     lessPreprocessor ??= (await import('less')).default;
47 ▶   } catch {
48 │     return {
49 │       errors: [
50 │         {
51 ▶           text: 'Unable to load the "less" stylesheet preprocessor.',
52 │           location: null,
53 │           notes: [
54 │             {
55 │               text:
56 ▶                 'Ensure that the "less" Node.js package is installed within the project. ' +
57 │                 "If not present, installation via the project's package manager should resolve the error.",
58 │             },
59 │           ],
60 │         },
61 │       ],
62 │     };
63 │   }
64 │   const less = lessPreprocessor;
65 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/less-language.ts` L66–105 （▶ の行: 69–70, 73–74, 84–85, 88–90, 92, 95, 99）

```ts
 66 │   const resolverPlugin: Less.Plugin = {
 67 │     install({ FileManager }, pluginManager): void {
 68 │       const resolverFileManager = new (class extends FileManager {
 69 ▶         override supportsSync(): boolean {
 70 ▶           return false;
 71 │         }
 72 │ 
 73 ▶         override supports(): boolean {
 74 ▶           return true;
 75 │         }
 76 │ 
 77 │         override async loadFile(
 78 │           filename: string,
 79 │           currentDirectory: string,
 80 │           options: Less.LoadFileOptions,
 81 │           environment: Less.Environment,
 82 │         ): Promise<Less.FileLoadResult> {
 83 │           // Attempt direct loading as a relative path to avoid resolution overhead
 84 ▶           try {
 85 ▶             return await super.loadFile(filename, currentDirectory, options, environment);
 86 │           } catch (error) {
 87 │             // Attempt a full resolution if not found
 88 ▶             const fullResult = await resolver(filename, {
 89 ▶               kind: 'import-rule',
 90 ▶               resolveDir: currentDirectory,
 91 │             });
 92 ▶             if (fullResult.path) {
 93 │               return {
 94 │                 filename: fullResult.path,
 95 ▶                 contents: await readFile(fullResult.path, 'utf-8'),
 96 │               };
 97 │             }
 98 │             // Otherwise error by throwing the failing direct result
 99 ▶             throw error;
100 │           }
101 │         }
102 │       })();
103 │ 
104 │       pluginManager.addFileManager(resolverFileManager);
105 │     },
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/less-language.ts` L106–145 （▶ の行: 109, 111–114, 117, 125, 128–129, 139, 143）

```ts
106 │   };
107 │ 
108 │   try {
109 ▶     const { imports, css } = await less.render(data, {
110 │       filename,
111 ▶       paths: options.includePaths,
112 ▶       plugins: [resolverPlugin],
113 ▶       rewriteUrls: 'all',
114 ▶       sourceMap: options.sourcemap
115 │         ? {
116 │             sourceMapFileInline: true,
117 ▶             outputSourceFiles: true,
118 │           }
119 │         : undefined,
120 │     } as Less.Options);
121 │ 
122 │     return {
123 │       contents: css,
124 │       loader: 'css',
125 ▶       watchFiles: [filename, ...imports],
126 │     };
127 │   } catch (error) {
128 ▶     if (isLessException(error)) {
129 ▶       const location = convertExceptionLocation(error);
130 │ 
131 │       return {
132 │         errors: [
133 │           {
134 │             text: error.message,
135 │             location,
136 │           },
137 │         ],
138 │         loader: 'css',
139 ▶         watchFiles: location.file ? [filename, location.file] : [filename],
140 │       };
141 │     }
142 │ 
143 ▶     throw error;
144 │   }
145 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/less-language.ts` L147–155 （▶ の行: 149–150, 153）

```ts
147 │ function convertExceptionLocation(exception: LessException): Partial<Location> {
148 │   return {
149 ▶     file: exception.filename,
150 ▶     line: exception.line,
151 │     column: exception.column,
152 │     // Middle element represents the line containing the exception
153 ▶     lineText: exception.extract && exception.extract[Math.trunc(exception.extract.length / 2)],
154 │   };
155 │ }
```

1. **46〜63 行目：less は任意の依存**

   `@angular/build` は less を持たないので、入っていなければ「"less" を読めない」エラーを返す。このサイトの node\_modules にも less は無く、デモの theme.less はこのエラーになる。
2. **66〜105 行目：ファイルの探し方を足す**

   Less の `FileManager` を継いだ 1 つを足す。84〜86 行目、まず普通に（相対のパスとして）読み、失敗したら 88〜91 行目で esbuild の解決に回す。npm のパッケージの `@import` はここで見つかる。99 行目、それでも無ければ最初の失敗を投げる。
3. **109〜120 行目：render**

   111 行目で `includePaths`、113 行目 `rewriteUrls: 'all'` で、読み込んだファイルの中の `url()` をそのファイルからの相対に書き直す。
4. **122〜126 行目：見張るファイル**

   入口と、Less が読んだ全ファイル（`imports`）。
5. **128〜141 行目：エラー**

   26〜28 行目、`column` を持つ例外を Less のエラーとみなし、位置を esbuild の形にする。153 行目、Less はエラーの前後の行を配列で返すので、真ん中の要素がエラーの行。

## 7. エラーのときの watchFiles：Sass のスタックから見張るファイルを拾う

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/sass-language.ts` L205–228 （▶ の行: 206–207, 209–211, 216–218, 222）

```ts
205 │   } catch (error) {
206 ▶     if (isSassException(error)) {
207 ▶       const fileWithError = error.span.url ? fileURLToPath(error.span.url) : undefined;
208 │ 
209 ▶       const watchFiles = [filePath, ...extractFilesFromStack(error.sassStack)];
210 ▶       if (fileWithError) {
211 ▶         watchFiles.push(fileWithError);
212 │       }
213 │ 
214 │       return {
215 │         loader: 'css',
216 ▶         errors: [
217 ▶           {
218 ▶             text: error.message,
219 │           },
220 │         ],
221 │         warnings,
222 ▶         watchFiles,
223 │       };
224 │     }
225 │ 
226 │     throw error;
227 │   }
228 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/sass-language.ts` L230–260 （▶ の行: 231, 233, 238, 242–243, 248, 251–252, 256–257）

```ts
230 │ function sourceMapToUrlComment(sourceMap: Exclude<CompileResult['sourceMap'], undefined>): string {
231 ▶   const urlSourceMap = Buffer.from(JSON.stringify(sourceMap), 'utf-8').toString('base64');
232 │ 
233 ▶   return `/*# sourceMappingURL=data:application/json;charset=utf-8;base64,${urlSourceMap} */`;
234 │ }
235 │ 
236 │ function* extractFilesFromStack(stack: string): Iterable<string> {
237 │   const lines = stack.split('\n');
238 ▶   const cwd = process.cwd();
239 │ 
240 │   // Stack line has format of "<file> <location> <identifier>"
241 │   for (const line of lines) {
242 ▶     const segments = line.split(' ');
243 ▶     if (segments.length < 3) {
244 │       break;
245 │     }
246 │ 
247 │     // Extract path from stack line.
248 ▶     // Paths may contain spaces. All segments before location are part of the file path.
249 │     let path = '';
250 │     let index = 0;
251 ▶     while (!segments[index].match(/\d+:\d+/)) {
252 ▶       path += segments[index++];
253 │     }
254 │ 
255 │     if (path) {
256 ▶       // Stack paths from sass are relative to the current working directory (not input file or workspace root)
257 ▶       yield join(cwd, path);
258 │     }
259 │   }
260 │ }
```

Sass のコンパイルが失敗すると、CSS が無いので `loadedUrls`（成功したときの見張るファイル。cli-component-styles の 5 節の 202 行目）もありません。そこで 209 行目、入口のファイルと、Sass のスタック（`sassStack`：エラーに至った `@use` の連なり）に出てくるファイルと、211 行目でエラーの位置のファイルを見張ります（a5fc020e6a）。216〜220 行目、44129f66a3 ではエラーに位置を付けていません（22.2.x では付きます：b946277064）。

1. **242 行目：1 行を空白で割る**

   スタックの 1 行は「ファイル 行:列 種類」。
2. **251〜253 行目：行:列の手前までをパスとしてつなぐ**

   パスに空白があっても割れた片を集める意図（248 行目のコメント）。ただし 252 行目は空白を挟まずにつなぐので、`my styles/a.scss` は `mystyles/a.scss` になる。どの片も `行:列` に合わなければ `segments[index]` が無くなって `TypeError` になる。22.2.x では正規表現 1 つに置き換わった（b946277064）。
3. **257 行目：作業フォルダにつなぐ**

   256 行目のコメントは「Sass のスタックのパスは作業フォルダからの相対」。

> [!WARNING]
> **ハマりどころ**
>
> 257 行目の前提は、JavaScript 版の `sass` では成り立ちますが、既定の `sass-embedded` では成り立ちません。sass-embedded のスタックは絶対パスで、`join(cwd, 絶対パス)` は「作業フォルダ + 絶対パス」という無いパスになります。a → b → c と `@use` して c でエラーになると、a（入口）と c（エラーの位置）は 209・211 行目で見張られますが、真ん中の b は無いパスとしてしか入りません。手元の `ng build --watch`（22.2.7。正規表現になった版でも 257 行目のつなぎ方は同じ）で、b を直しても作り直しが起きず、a を触ると起きました。`NG_BUILD_SASS_EMBEDDED=0` では b を直した時点で作り直しました（デモの「Sass のスタック」）。

## 8. url() のエラーの注、フォント、キャッシュの鍵の頭

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/css-resource-plugin.ts` L9–33 （▶ の行: 14, 20, 30）

```ts
 9 │ import type { Plugin, PluginBuild } from 'esbuild';
10 │ import { readFile } from 'node:fs/promises';
11 │ import { extname, join, relative } from 'node:path';
12 │ import { LoadResultCache, createCachedLoad } from '../load-result-cache';
13 │ 
14 ▶ const CSS_RESOURCE_NAMESPACE = 'angular:css-resource';
15 │ 
16 │ /**
17 │  * Symbol marker used to indicate CSS resource resolution is being attempted.
18 │  * This is used to prevent an infinite loop within the plugin's resolve hook.
19 │  */
20 ▶ const CSS_RESOURCE_RESOLUTION = Symbol('CSS_RESOURCE_RESOLUTION');
21 │ 
22 │ /**
23 │  * Creates an esbuild {@link Plugin} that loads all CSS url token references using the
24 │  * built-in esbuild `file` loader. A plugin is used to allow for all file extensions
25 │  * and types to be supported without needing to manually specify all extensions
26 │  * within the build configuration.
27 │  *
28 │  * @returns An esbuild {@link Plugin} instance.
29 │  */
30 ▶ export function createCssResourcePlugin(cache?: LoadResultCache): Plugin {
31 │   return {
32 │     name: 'angular-css-resource',
33 │     setup(build: PluginBuild): void {
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/css-resource-plugin.ts` L69–98 （▶ の行: 70, 72, 76, 79, 84, 90–91, 94）

```ts
69 │ 
70 ▶         if (result.errors.length) {
71 │           const error = result.errors[0];
72 ▶           if (resourceUrl[0] === '~') {
73 │             error.notes = [
74 │               {
75 │                 location: null,
76 ▶                 text: 'You can remove the tilde and use a relative path to reference it, which should remove this error.',
77 │               },
78 │             ];
79 ▶           } else if (resourceUrl[0] === '^') {
80 │             error.notes = [
81 │               {
82 │                 location: null,
83 │                 text:
84 ▶                   'You can remove the caret and add the path to the `externalDependencies` build option,' +
85 │                   ' which should remove this error.',
86 │               },
87 │             ];
88 │           }
89 │ 
90 ▶           const extension = importer && extname(importer);
91 ▶           if (extension !== '.css') {
92 │             error.notes.push({
93 │               location: null,
94 ▶               text: 'Preprocessor stylesheets may not show the exact file location of the error.',
95 │             });
96 │           }
97 │         }
98 │ 
```

`url()` の解決の本体（34〜68 行目）は cli-component-styles の 7 節です。解決に失敗したとき、ここで注を足します。72〜78 行目、webpack の頃の `~` で始まっていれば「~ を外して相対のパスに」、79〜87 行目、`^` で始まっていれば「^ を外して `externalDependencies` に」。90〜96 行目、`url()` を書いたファイルが .css でなければ「前処理したスタイルでは位置が正確でないことがある」を足します。Sass は CSS にしてから esbuild に渡すので、esbuild の知る位置はコンパイル後の CSS の行です。デモの missing-url.scss の 2 行目は、元のファイルでは 1 行目です。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/css-inline-fonts-plugin.ts` L9–33 （▶ の行: 10, 20, 23, 30）

```ts
 9 │ import type { Plugin, PluginBuild } from 'esbuild';
10 ▶ import { InlineFontsProcessor } from '../../../utils/index-file/inline-fonts';
11 │ import { NormalizedCachedOptions } from '../../../utils/normalize-cache';
12 │ import { LoadResultCache, createCachedLoad } from '../load-result-cache';
13 │ 
14 │ /**
15 │  * Options for the createCssInlineFontsPlugin
16 │  * @see createCssInlineFontsPlugin
17 │  */
18 │ export interface CssInlineFontsPluginOptions {
19 │   /** Disk cache normalized options */
20 ▶   cacheOptions?: NormalizedCachedOptions;
21 │ 
22 │   /** Load results cache. */
23 ▶   cache?: LoadResultCache;
24 │ }
25 │ 
26 │ /**
27 │  * Creates an esbuild {@link Plugin} that inlines fonts imported via import-rule.
28 │  * within the build configuration.
29 │  */
30 ▶ export function createCssInlineFontsPlugin({
31 │   cache,
32 │   cacheOptions,
33 │ }: CssInlineFontsPluginOptions): Plugin {
```

フォントの埋め込みのプラグインは、10 行目の `InlineFontsProcessor`（index.html のフォントの埋め込みと同じ処理）を使い、20 行目のディスクのキャッシュの設定を渡します。本体は bmap-styles-bundle の 5 節です。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-cache-key.ts` L9–37 （▶ の行: 15–16, 33, 35–36）

```ts
 9 │ import { calculateHash } from '../../../utils/hash';
10 │ import type { BundleStylesheetOptions } from './bundle-options';
11 │ 
12 │ /**
13 │  * Generates a global hash based on all build options that affect stylesheet compilation.
14 │  *
15 ▶  * IMPORTANT: This hash acts as the root cache key prefix for all persistent stylesheet cache
16 ▶  * entries. Any change in the values hashed below will invalidate all cached stylesheet outputs
17 │  * across the entire application.
18 │  *
19 │  * Included build options and their rationale:
20 │  * - `optimization`: Affects CSS minification, dead code elimination, and whitespace stripping.
21 │  * - `sourcemap`: Toggles inline/external source map generation and comment insertion.
22 │  * - `sourcesContent`: Toggles embedding original source content inside generated source maps.
23 │  * - `includePaths`: Changes Sass/Less `@import` and `@use` path resolution search directories.
24 │  * - `sassOptions`: Changes Sass compiler deprecations and behavior flags.
25 │  * - `target`: Affects CSS property lowering and browser vendor prefixing in esbuild.
26 │  * - `publicPath`: Affects relative asset URL rewriting (`url('...')`) inside CSS output.
27 │  * - `outputNames`: Affects asset output filename hashing schemes.
28 │  * - `inlineFonts`: Controls whether external web font `@import` / `<link>` directives are inlined.
29 │  * - `preserveSymlinks`: Controls symlink realpath resolution in monorepos/pnpm workspace packages.
30 │  * - `externalDependencies`: Controls which CSS modules/urls are excluded from bundling.
31 │  * - `postcssConfig`: Path to custom PostCSS configuration file.
32 │  * - `tailwindConfig`: Path to Tailwind CSS configuration file.
33 ▶  * - `packageVersion`: Invalidates cache across `@angular/build` compiler toolchain updates.
34 │  *
35 ▶  * @note Maintainers: If any new build option is added to `BundleStylesheetOptions` or `@angular/build`
36 ▶  * that alters generated stylesheet code or asset outputs, it MUST be added to this hash object.
37 │  */
```

15〜16 行目のコメントは「この値がスタイルのディスクのキャッシュの鍵の頭になる」と言い、35〜36 行目は「スタイルに効く設定を足したら必ずここにも足す」と頼んでいます。ただし cli-component-styles の章に書いたとおり、44129f66a3 でも新しい本家でもサイトの 22.2.7 でも、`calculateGlobalStylesheetConfigHash` を呼んでいる所は spec の外に無く、今は何の鍵にもなっていません。新しい本家ではこの関数に `dataurl` が足されました（69acf5b822）。

> **🧪 DEMO — 本物の esbuild 0.28.2 にスタイルのプラグインを差して束ねた記録（@angular/build 22.2.7）**
>
> `createStylesheetBundleOptions` が返す設定（Sass・Less・CSS の 3 つの `create` と css-resource）で、小さなファイルを 1 つずつ束ねました。各プラグインの onLoad を包んで、返した `loader` と `watchFiles` を記録しています。Tailwind の代わりに、`@tailwind` を 1 つの規則に置き換えて警告を 1 つ出す小さな PostCSS のプラグイン（fake-tailwind）を使いました。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/esb-styles)

どう録ったか：

1. **ファイル**

   `<work>/esb-demo/b/styles-app` に入力のファイルと、node\_modules の代わりの 2 つの小さなパッケージ（demo-theme・fake-tailwind）を置きました。esbuild・sass-embedded・sass・postcss はサイトの node\_modules のものを絶対パスで読みます。less と tailwindcss はサイトに無いので入れていません。
2. **束ねる**

   下の `rec-styles.mjs` を、作業フォルダを styles-app にして 2 回（既定と `NG_BUILD_SASS_EMBEDDED=0`）走らせました。
3. **watch**

   `watch-chain.mjs` が子プロセスで `ng build --watch` を起こし、ファイルを書き換え、最後に自分の子だけを止めます。

📄 `<work>/esb-demo/b/rec-styles.mjs`

```js
// 本物の @angular/build 22.2.7 の createStylesheetBundleOptions（StylesheetPluginFactory.create に Sass・Less・CSS の言語）と
// サイトの esbuild で、小さなスタイルを 1 つずつ束ねて、出力・警告・エラー・onLoad が返した watchFiles を記録する。
import { createRequire } from 'node:module';
import { writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
const SITE = '~/angular-research/angular-deep-dive';
const require = createRequire(SITE + '/package.json');
const esbuild = require('esbuild');
const S = SITE + '/node_modules/@angular/build/src/tools/esbuild/stylesheets/';
const { createStylesheetBundleOptions } = require(S + 'bundle-options.js');
const { shutdownSassWorkerPool } = require(S + 'sass-language.js');
const APP = realpathSync(process.argv[2]);
const strip = (s) => (typeof s === 'string' ? s.split(APP).join('<app>').split(SITE).join('~/angular-research/angular-deep-dive') : s);
const msg = (m) => ({ text: strip(m.text), file: strip(m.location?.file ?? null), line: m.location?.line ?? null, lineText: strip(m.location?.lineText ?? null), notes: (m.notes ?? []).map((n) => strip(n.text)), plugin: m.pluginName || null });

function instrument(plugins, loads) {
  return plugins.map((p) => ({
    name: p.name,
    setup(build) {
      const proxy = Object.create(build);
      proxy.onLoad = (opts, cb) =>
        build.onLoad(opts, async (args) => {
          const r = await cb(args);
          if (r) {
            loads.push({ plugin: p.name, namespace: args.namespace, path: strip(args.path), loader: r.loader ?? null, watchFiles: (r.watchFiles ?? []).map(strip), warnings: (r.warnings ?? []).length, errors: (r.errors ?? []).length });
          }
          return r;
        });
      return p.setup(proxy);
    },
  }));
}

const base = { workspaceRoot: APP, optimization: false, inlineFonts: false, sourcemap: false, outputNames: { bundles: '[name]', media: 'media/[name]' }, target: ['chrome120'], cacheOptions: { enabled: false } };
const cases = [
  { id: 'scss', label: 'app.scss（@use でパッケージ・url()）', entry: 'src/app.scss' },
  { id: 'legacy', label: 'legacy.scss（@import の非推奨の警告）', entry: 'src/legacy.scss' },
  { id: 'broken', label: 'broken.scss（未定義の変数）', entry: 'src/broken.scss' },
  { id: 'missingUrl', label: 'missing-url.scss（url() の先が無い）', entry: 'src/missing-url.scss' },
  { id: 'less', label: 'theme.less（less が入っていない）', entry: 'src/theme.less' },
  { id: 'plainNoTw', label: 'plain.css（Tailwind の設定なし）', entry: 'src/plain.css' },
  { id: 'twWith', label: 'tw.css（Tailwind の設定あり・@tailwind あり）', entry: 'src/tw.css', tw: true },
  { id: 'twWithout', label: 'plain.css（Tailwind の設定あり・@tailwind なし）', entry: 'src/plain.css', tw: true },
  { id: 'twMissing', label: 'tw.css（Tailwind のパッケージが見つからない）', entry: 'src/tw.css', tw: 'missing' },
  { id: 'pcMissing', label: 'plain.css（PostCSS の設定に無いプラグイン）', entry: 'src/plain.css', pc: true },
];
const { SassCompiler } = require(SITE + '/node_modules/@angular/build/src/tools/sass/sass-service.js');
const out = { esbuild: esbuild.version, sass: new SassCompiler().info.replace('\t', ' '), cwd: process.cwd() === APP ? '<app>' : '<app> の外', env: process.env.NG_BUILD_SASS_EMBEDDED ?? null, cases: [] };
let unhandled = [];
process.on('unhandledRejection', (reason) => { unhandled.push(strip(String(reason && reason.message || reason).split('\n')[0])); });
for (const c of cases) {
  const opts = { ...base };
  if (c.tw) opts.tailwindConfiguration = { file: join(APP, 'tailwind.config.js'), package: c.tw === 'missing' ? join(APP, 'node_modules/no-such-tailwind') : join(APP, 'node_modules/fake-tailwind/index.js') };
  if (c.pc) opts.postcssConfiguration = { config: { plugins: [['postcss-no-such-plugin', {}]] }, configPath: join(APP, '.postcssrc.json') };
  unhandled = [];
  const b = createStylesheetBundleOptions(opts, undefined, undefined);
  const loads = [];
  const pluginNames = b.plugins.map((p) => p.name + (p.setup.toString().replace(/\s/g, '') === 'setup(){}' ? '（何もしない）' : ''));
  b.plugins = instrument(b.plugins, loads);
  const t0 = performance.now();
  let res;
  try {
    res = await esbuild.build({ ...b, entryPoints: [c.entry] });
  } catch (e) {
    res = { errors: e.errors ?? [{ text: String(e) }], warnings: e.warnings ?? [], outputFiles: [], metafile: null };
  }
  const ms = Math.round(performance.now() - t0);
  out.cases.push({
    id: c.id, label: c.label, entry: c.entry, ms, pluginNames,
    unhandledRejections: unhandled.slice(),
    errors: res.errors.map(msg), warnings: res.warnings.map(msg), loads,
    inputs: res.metafile ? Object.keys(res.metafile.inputs).map(strip) : [],
    outputs: (res.outputFiles ?? []).map((f) => ({ path: strip(f.path), bytes: f.contents.byteLength, text: f.path.endsWith('.css') ? strip(f.text) : null })),
  });
}
shutdownSassWorkerPool();
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
for (const c of out.cases) console.log(c.id, c.ms + 'ms', 'E', c.errors.length, 'W', c.warnings.length, JSON.stringify(c.loads), c.pluginNames.join(','), c.unhandledRejections);

```

📄 `<work>/esb-demo/b/rec-chain.mjs`

```js
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
const SITE = '~/angular-research/angular-deep-dive';
const require = createRequire(SITE + '/package.json');
const esbuild = require('esbuild');
const S = SITE + '/node_modules/@angular/build/src/tools/esbuild/stylesheets/';
const { createStylesheetBundleOptions } = require(S + 'bundle-options.js');
const { shutdownSassWorkerPool } = require(S + 'sass-language.js');
const APP = realpathSync(process.argv[2]);
const b = createStylesheetBundleOptions({ workspaceRoot: APP, optimization: false, inlineFonts: false, sourcemap: false, outputNames: { bundles: '[name]', media: 'media/[name]' }, target: ['chrome120'], cacheOptions: { enabled: false } });
const loads = [];
b.plugins = b.plugins.map((p) => ({ name: p.name, setup(build) { const proxy = Object.create(build); proxy.onLoad = (o, cb) => build.onLoad(o, async (a) => { const r = await cb(a); if (r) loads.push(r.watchFiles); return r; }); return p.setup(proxy); } }));
const res = await esbuild.build({ ...b, entryPoints: ['src/chain-a.scss'] }).catch((e) => e);
console.log(JSON.stringify(loads).split(APP).join('<app>'));
console.log(res.errors[0].text.split(APP).join('<app>'));
shutdownSassWorkerPool();

```

📄 `<work>/esb-demo/b/watch-chain.mjs`

```js
// ng build --watch を子プロセスで起こし、真ん中の _chain-b.scss を直して再ビルドが起きるかを見る。最後に自分の子だけを止める。
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const app = process.argv[2];
const log = [];
const child = spawn('npx', ['ng', 'build', '--watch'], { cwd: app, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
const t0 = Date.now();
const add = (d) => { for (const l of d.toString().split('\n')) if (l.trim()) log.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + l.replace(/\x1b\[[0-9;]*m/g, '')); };
child.stdout.on('data', add); child.stderr.on('data', add);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(25000);
log.push('--- edit src/_chain-b.scss（@use を消す）');
writeFileSync(app + '/src/_chain-b.scss', '.b { color: blue; }\n');
await wait(12000);
log.push('--- edit src/chain-a.scss');
writeFileSync(app + '/src/chain-a.scss', "@use 'chain-b';\n.a { color: green; }\n");
await wait(15000);
child.kill('SIGINT');
await wait(2000);
console.log(log.filter((l) => /Changes detected|generation|ERROR|Undefined|edit|Building/.test(l)).join('\n'));

```

## 呼び出しの連なり

- `createStylesheetBundleOptions(options, cache, inlineComponentData)` — bundle-options.ts L39
  - `new StylesheetPluginFactory({sourcemap, includePaths, …}, cache)` — L49、factory L115
  - `create(Sass / Less / Css)` — factory L120 — *121 行目で setupPostcss → initPostcss が始まる*
    - `onStart: await setupPostcss` — L136〜156
    - `onLoad → processStylesheet → language.process` — L185、L259
      - `Sass: compileString → SassCompiler.compileStringAsync` — sass-language.ts L86、sass-service.ts L102
        - `findFileUrl → resolveUrl → build.resolve / parsePackageName` — L133、L145、L154
        - `logger.warn → 警告 / catch → extractFilesFromStack` — L175、L209、L236
      - `Less: less.render(plugins: [resolverPlugin])` — less-language.ts L109
      - `PostCSS: compileString → 警告・依存・例外` — factory L346
    - `url() → css-resource の onResolve → 失敗なら注` — css-resource-plugin.ts L34、L70〜97

## テストと直し方

| spec | describe / it と行 | この章のどこ |
| --- | --- | --- |
| tools/esbuild/stylesheets/stylesheet-cache-key\_spec.ts | describe Stylesheet Global Config Hash（13 行目）&gt; calculateGlobalStylesheetConfigHash（28 行目、it 5 件） | 8 節。呼ぶ所の無い関数だけを固めている |
| builders/application/tests/options/inline-style-language\_spec.ts | describe Option: "inlineStyleLanguage"（14 行目）。scss（26 行目）・sass（43 行目）・less（60 行目）・watch（77 行目）を AOT / JIT で 8 件 | 2・5・6 節。less の it は spec の仮のプロジェクトに less があるときの道 |
| builders/application/tests/options/style-preprocessor-options-sass\_spec.ts | describe Option: "stylePreprocessorOptions.sass"（13 行目、it 3 件）。`fatalDeprecations` で落ちる（14・56 行目） | 1 節の 30 行目、5 節の警告 |
| builders/application/tests/behavior/stylesheet-url-resolution\_spec.ts | describe Behavior: "Stylesheet url() Resolution"（14 行目、it 16 件）。`~` の注（15・45・76 行目）、`^` の注（112・137 行目） | 8 節の 72〜88 行目 |
| builders/application/tests/behavior/component-stylesheets\_spec.ts | describe Behavior: "Component Stylesheets"（13 行目、it 5 件） | 2 節の受け口まで |

unit の 5 件は前の章と同じ `//packages/angular/build:test` の 1 回で走らせました（計 55 件、PASSED）。builder を丸ごと動かす 4 つの describe と i18nMissingTranslation は ../angular-cli で `pnpm bazel test //packages/angular/build:application_integration_tests --nocache_test_results --test_output=all '--test_arg=--filter=(Option: .i18nMissingTranslation.|Option: .inlineStyleLanguage.|Option: .stylePreprocessorOptions.sass.|Behavior: .Stylesheet url\(\) Resolution.|Behavior: .Component Stylesheets.)'` で走らせ、25 の shard の「Ran N」の和が 38 件（6 + 8 + 3 + 16 + 5）、0 failures、PASSED（10.1 秒）でした。

44129f66a3 には `stylesheet-plugin-factory.ts`・`sass-language.ts`・`less-language.ts` を直接呼ぶ unit の spec がありません（新しい本家では ed52db253f で sass-language\_spec.ts が足されました）。固めていない所と、直すならどこか：

- PostCSS のプラグインが無いとき（3 節）。`create` の 121 行目で `setupPostcss` を取り出さず、onStart の中（138 行目）で `this` から読めば、promise は待つ人ができてから作られます。あわせて 139 行目で例外を受け、その文を注に入れると理由が残ります。spec は、StylesheetPluginFactory に無いプラグイン名の `postcssConfiguration` を渡して esbuild で束ね、エラーにプラグイン名が出ることと、`unhandledRejection` が起きないことを確かめる形で書けます。

  練習用の作業木（44129f66a3）で試しました。`tools/esbuild/stylesheets/stylesheet-plugin-factory_spec.ts` を新しく作り、describe StylesheetPluginFactory に上の it を 1 つ置くと、「Unhandled promise rejection: Error: Cannot find module 'postcss-no-such-plugin'」と、注にプラグイン名が無いことの 2 つで FAILED でした。121 行目を `const factory = this; const { cache, options } = this;` にし、138 行目を `await factory.setupPostcss`、139 行目の `catch` で受けた例外の文を注に 1 つ足すと、この it と stylesheet-cache-key の 5 件が通り、unit の全部（4 shard × 154 件）も 0 failures でした。
- sass-embedded のスタック（7 節）。257 行目の `join(cwd, path)` を `resolve(cwd, path)` にすれば、絶対パスはそのまま、相対のパスは作業フォルダからになります。spec は 3 つのファイルの連なりで c をエラーにし、返った `watchFiles` に b の正しいパスがあることを確かめます。builder の側なら behavior/rebuild-global\_styles\_spec.ts に、b を直すと作り直す it が足せます。
- 4 節の 287 行目（Tailwind の言葉が無ければ PostCSS に通さない）。デモの plain.css は Tailwind の設定があっても PostCSS を通りませんでした。この分かれ道を確かめる it は builders/application/tests にありません。

## 聞かれそうな質問

**Q. PostCSS の設定に書いたプラグインが入っていないと、どうなりますか？**

22.2.7 の ng build は Node ごと落ち、`Cannot find module` のスタックだけが出ます。121 行目で始まった promise の失敗を、まだ誰も待っていないからです（3 節）。待つ人がいれば、139〜155 行目の「"postcss" を読めない」が言語ごとに 3 つ出ます。

**Q. Tailwind を入れているのに、Tailwind の言葉の無い .css は PostCSS を通りますか？**

通りません。287 行目で、PostCSS の設定ファイルが無く、中身に 86〜94 行目の言葉（`@tailwind`・`@apply` など）も無ければ、言語の結果をそのまま返します（cli-component-styles の 6 節）。デモの「Tailwind の設定あり・@tailwind なし」は fake-tailwind の警告が出ませんでした。PostCSS の設定ファイルがあれば、全部のスタイルが通ります。

**Q. Sass の `@use 'パッケージ/中のファイル'` は、どう見つかりますか？**

まず esbuild の解決（`conditions` と `mainFields` に style・sass）で探し、無ければ 145〜166 行目でパッケージの package.json の場所を探して、そのフォルダに残りのパスをつなぎます。デモの app.scss の `demo-theme/mixins` がこの道で `node_modules/demo-theme/_mixins.scss` になりました（`_` と拡張子の補いは Sass 自身がします）。

**Q. Sass の非推奨の警告が「Deprecation」とだけ出るのはなぜですか？**

177〜179・185 行目で、見出しを `Deprecation` にし、Sass の文を注に回しているからです。黙らせたいときは angular.json の `stylePreprocessorOptions.sass.silenceDeprecations`（1 節の 30 行目 → stylesheet-plugin-factory.ts の 78 行目 → 5 節の Sass の `silenceDeprecations`）です。依存パッケージの中の警告は、もともと `quietDeps` で黙っています。

**Q. ng serve で Sass のエラーを直したのに、作り直されないことがあります。**

7 節の連なりの真ん中のファイルを直した場合です。既定の sass-embedded では、真ん中のファイルが無いパスとして `watchFiles` に入るので、そのファイルの変更は拾われません。入口のファイルを保存し直すか、`NG_BUILD_SASS_EMBEDDED=0` にすると作り直されます（デモの記録）。

## 読み終えて

- 言語は「名前・2 つの filter・任意の process」の値で、`create` はそれを esbuild のプラグイン（onStart と 2 つの onLoad）にする。CSS は process を持たない。
- PostCSS の用意は 1 つの promise を 3 つのプラグインで分け合い、onStart で待つ。ただし promise は `create` の時点で始まるので、失敗が待つ人より先に来ると Node ごと落ちる。
- Sass は既定で sass-embedded（別のプロセス）、無効にすると JavaScript 版。パッケージの深い import は package.json の場所から自分でつなぐ。
- Less は普通の読み込み → esbuild の解決の順で探し、読んだ全ファイルを見張る。
- エラーのときの見張るファイルは Sass のスタックから拾うが、sass-embedded の絶対パスを作業フォルダにつないでしまい、真ん中のファイルが漏れる。

---

← 前: [I18nInliner：ビルドの後で $localize に翻訳を差し込む](04-esb-i18n-inliner.md)  
次: [compiler-plugin の残り：コンパイルの状態・JIT のコールバック・コンポーネントのスタイル](06-esb-compiler-rest.md) →
