[目次](../README.md) › [CLI とビルド](README.md) › 第 2 回 / 全 16 回

# ng build の段取り：executeBuild と後処理が並べる段

> buildApplicationInternal から executeBuild に入り、コードとスタイルの束を作り、遅延チャンクの整理、budgets、ライセンスの抽出、i18n の差し込み、プリレンダー、service worker、出力ファイルの書き出しと表、と進む段取り。1 つのプログラムで出力と型チェックを別の仕事として回す理由と、各段がどの回に対応するか。

angular/angular-cli · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/build)

---

`ng build` を打ってから `dist/` にファイルが並ぶまで、application builder は決まった順に段を踏みます。この章では `executeBuild` を上から読み、バンドルの後に何がどの順で起きるか（遅延チャンクの整理、budgets、ライセンスの抽出、i18n、後処理、統計の表）と、最後に builder がファイルをディスクのどこへ書くかを、このサイト自身の本番ビルドの数字と並べて確かめます。

読む対象は angular-cli リポジトリの `packages/angular/build/src/` の `builders/application/execute-build.ts`・`execute-post-bundle.ts`・`build-action.ts`・`index.ts`、`tools/esbuild/license-extractor.ts`・`utils.ts`・`profiling.ts` です。

1. [1. 概観](01-cli-overview.md)
2. **2. ng build の段取り**（この章）
3. [3. AotCompilation](03-cli-angular-compilation.md)
4. [4. コンポーネントのスタイル](04-cli-component-styles.md)
5. [5. oxc の変換](05-cli-javascript-transformer.md)
6. [6. リンカー](06-cli-linker.md)
7. [7. 遅延チャンク](07-cli-code-splitting.md)
8. [8. budgets](08-cli-budgets.md)
9. [9. i18n](09-cli-i18n.md)
10. [10. 再ビルドとキャッシュ](10-cli-cache-watch.md)
11. [11. HMR](11-cli-hmr.md)
12. [12. unit-test と Vitest](12-cli-unit-test.md)
13. [13. Tree と sink](13-schematics.md)
14. [14. Rule の組み立て](14-schematics-rules.md)
15. [15. ng generate component](15-schematics-component.md)
16. [16. ng add と ng update](16-cli-add-update.md)

## 0. このサイトの本番ビルドのログ

この章を書くときに、このサイトを `NG_BUILD_DEBUG_PERF=1 npx ng build`（`@angular/build` 22.1.7）でビルドしました。ログの要点です。

| Initial chunk files | `main-*.js` 410.32 kB、`styles-*.css` 1.88 kB、`chunk-*.js` 633 bytes。Initial total 412.83 kB（Estimated transfer size 110.55 kB） |
| --- | --- |
| Lazy chunk files | 15 行が表に出て「`...and 239 more lazy chunks files.`」。遅延チャンクは 254 個 |
| プリレンダー | `Prerendered 245 static routes.` |
| 全体 | `Application bundle generation complete. [19.444 seconds]` |
| 出力 | `3rdpartylicenses.txt`（23,042 bytes）、`prerendered-routes.json`（8,951 bytes）、`browser/`（JS 256 個、CSS 1 個、HTML 多数） |

この表の各行が、`executeBuild` のどの行から出てきたのかを順に追います。

## 1. executeBuild の入口と、バンドルまで

📄 `angular-cli/packages/angular/build/src/builders/application/execute-build.ts` L47–75 （▶ の行: 47, 50, 69, 73–74）

```ts
47 ▶ export async function executeBuild(
48 │   options: NormalizedApplicationBuildOptions,
49 │   context: BuilderContext,
50 ▶   rebuildState?: RebuildState,
51 │ ): Promise<ExecutionResult> {
52 │   const {
53 │     projectRoot,
54 │     workspaceRoot,
55 │     i18nOptions,
56 │     optimizationOptions,
57 │     assets,
58 │     cacheOptions,
59 │     serverEntryPoint,
60 │     baseHref,
61 │     ssrOptions,
62 │     verbose,
63 │     colors,
64 │     jsonLogs,
65 │     security,
66 │   } = options;
67 │ 
68 │   // TODO: Consider integrating into watch mode. Would require full rebuild on target changes.
69 ▶   const browsers = getSupportedBrowsers(projectRoot, context.logger);
70 │ 
71 │   // Load active translations if inlining
72 │   // TODO: Integrate into watch mode and only load changed translations
73 ▶   if (i18nOptions.shouldInline) {
74 ▶     await loadActiveTranslations(context, i18nOptions);
75 │   }
```

47 行目、`executeBuild` は 1 回のビルドの本体です。50 行目の `rebuildState` は watch のときの前回の状態で、初回は `undefined`（再ビルドは[第 10 回](10-cli-cache-watch.md)）。69 行目で `browserslist` の設定から対象ブラウザを決め、73〜74 行目、翻訳を差し込むビルドなら最初に翻訳ファイルを読みます（[第 9 回](09-cli-i18n.md)）。

このあと初回ビルドでは `createAngularCompilation` でコンパイラを選び、`setupBundlerContexts` でブラウザ用・サーバー用・グローバルスタイル用などの esbuild の文脈を作って、`BundlerContext.bundleAll` で全部を一度にバンドルします。ここは[boot-application-build の 2 節](../boot/04-boot-application-build.md)で引用した範囲です。バンドルの中で起きる AOT コンパイル・スタイル・oxc の変換・リンカーは第 3〜6 回が扱います。この章はバンドルが返ってきた所から読みます。

## 2. バンドルが終わったら、コンパイラを先に片付ける

📄 `angular-cli/packages/angular/build/src/builders/application/execute-build.ts` L172–207 （▶ の行: 179–181, 185, 189, 191, 204, 206）

```ts
172 │     // In non-watch mode, the bundler rebuild contexts and Angular compilation
173 │     // are no longer needed once bundling completes. Dispose them early to free
174 │     // worker processes, TypeScript ASTs, and caches before post-bundling steps
175 │     // execute or before returning bundling errors.
176 │     // This is fire-and-forget so worker teardown runs concurrently in the background
177 │     // without blocking the critical path of post-bundle optimization steps.
178 │     // Any in-flight disposal is awaited in the builder action's finally block.
179 ▶     if (!options.watch) {
180 ▶       void angularCompilationContext?.dispose();
181 ▶       void executionResult.dispose();
182 │     }
183 │ 
184 │     // Return if the bundling has errors
185 ▶     if (bundlingResult.errors) {
186 │       // If Zone.js is used, augment top-level await errors with a more helpful message.
187 │       // esbuild's default error mentions "target environment" with browser versions, but
188 │       // the actual reason is that async/await is downleveled for Zone.js compatibility.
189 ▶       if (!isZonelessApp(options.polyfills)) {
190 │         for (const error of bundlingResult.errors) {
191 ▶           if (error.text?.startsWith(TOP_LEVEL_AWAIT_ERROR_TEXT)) {
192 │             error.notes ??= [];
193 │             error.notes.push({
194 │               text:
195 │                 'Top-level await is not supported in applications that use Zone.js. ' +
196 │                 'Consider removing Zone.js or moving this code into an async function. \n' +
197 │                 'For more information about zoneless Angular applications, visit: https://angular.dev/guide/zoneless',
198 │               location: null,
199 │             });
200 │           }
201 │         }
202 │       }
203 │ 
204 ▶       executionResult.addErrors(bundlingResult.errors);
205 │ 
206 ▶       return executionResult;
207 │     }
```

1. **179〜181 行目：watch でなければ、ここで dispose**

   `ng build`（watch なし）では、もうコンパイラも esbuild の文脈も要りません。180 行目でコンパイラ（既定ではワーカースレッドで動く `ParallelCompilation`、[第 3 回](03-cli-angular-compilation.md)）を、181 行目で esbuild の文脈を捨てます。`void` を付けて待たないので、ワーカーの終了は後ろの段と同時に進みます（コメントのとおり、待つのは builder の `finally`）。
2. **185〜206 行目：バンドルにエラーがあれば、後ろの段は全部飛ばす**

   型エラーもテンプレートのエラーも、esbuild のエラーとしてここに集まっています。206 行目で返るので、budgets もライセンスもプリレンダーも走りません。189〜191 行目は、zone.js を使うアプリで top-level await を書いたときだけ、esbuild のエラーに説明を足す処理です（zone.js のために async/await を下げて変換するので使えない）。

この次に、`optimization.scripts` が有効で、初期ファイル以外の `.js`（遅延チャンク）の数が `optimizeChunksThreshold`（既定 3、`NG_BUILD_OPTIMIZE_CHUNKS` で変更）以上なら、`chunk-optimizer` を動的 import して esbuild の出力のチャンクをまとめ直す段があります。このサイトは遅延チャンクが 254 個あるので走り、ログに `DURATION[OPTIMIZE_CHUNKS]: 0.288s` と出ました。判定の行と中身は[第 7 回](07-cli-code-splitting.md)で読みます。

## 3. budgets・転送サイズ・CommonJS・アセット

📄 `angular-cli/packages/angular/build/src/builders/application/execute-build.ts` L294–332 （▶ の行: 294, 296, 301, 305–307, 309–310, 319–320, 324–325, 330–331）

```ts
294 ▶     const {
295 │       metafiles: { browser: browserMetafile, server: serverMetafile },
296 ▶       initialFiles,
297 │       outputFiles,
298 │     } = bundlingResult;
299 │     const metafiles = [browserMetafile, serverMetafile];
300 │ 
301 ▶     executionResult.outputFiles.push(...outputFiles);
302 │ 
303 │     // Analyze files for bundle budget failures if present
304 │     let budgetFailures: BudgetCalculatorResult[] | undefined;
305 ▶     if (options.budgets) {
306 ▶       const compatStats = generateBudgetStats(browserMetafile, outputFiles, initialFiles);
307 ▶       budgetFailures = [...checkBudgets(options.budgets, compatStats, true)];
308 │       for (const { message, severity } of budgetFailures) {
309 ▶         if (severity === 'error') {
310 ▶           executionResult.addError(message);
311 │         } else {
312 │           executionResult.addWarning(message);
313 │         }
314 │       }
315 │     }
316 │ 
317 │     // Calculate estimated transfer size if scripts are optimized
318 │     let estimatedTransferSizes;
319 ▶     if (optimizationOptions.scripts || optimizationOptions.styles.minify) {
320 ▶       estimatedTransferSizes = await calculateEstimatedTransferSizes(executionResult.outputFiles);
321 │     }
322 │ 
323 │     // Check metafile for CommonJS module usage if optimizing scripts
324 ▶     if (optimizationOptions.scripts) {
325 ▶       const messages = checkCommonJSModules(browserMetafile, options.allowedCommonJsDependencies);
326 │       executionResult.addWarnings(messages);
327 │     }
328 │ 
329 │     // Copy assets
330 ▶     if (assets) {
331 ▶       executionResult.addAssets(await resolveAssets(assets, workspaceRoot));
332 │     }
```

1. **294〜301 行目：esbuild の結果を取り出す**

   `metafiles` は esbuild が出す「どの入力がどの出力に何バイト入ったか」の表、`initialFiles` は初期ファイルの一覧です。301 行目で出力ファイルを結果に積みます。まだメモリの中で、ディスクには書いていません。
2. **305〜315 行目：budgets（第 8 回）**

   `angular.json` に `budgets` があるときだけ、306 行目でメタファイルから大きさの統計を作り、307 行目で閾値と比べます。309〜310 行目、`error` ならビルドのエラー、それ以外は警告です。エラーでも後ろの段は止まりません（ここでは返らない）。このサイトは initial 412.83 kB が 500 kB の警告を下回ったので何も出ませんでした。計算の中身は[第 8 回](08-cli-budgets.md)。
3. **319〜321 行目：Estimated transfer size**

   最適化が有効なときだけ、JS と CSS を brotli で圧縮した大きさを見積もります。ログの右端の列（110.55 kB）がこれです。開発ビルドでこの列が出ないのは 319 行目の条件のためです。
4. **324〜327 行目：CommonJS の警告**

   メタファイルから CommonJS のモジュールを探し、`allowedCommonJsDependencies` に無ければ警告します（最適化しにくいため）。
5. **330〜332 行目：アセット**

   `angular.json` の `assets`（このサイトは `public/`）を解決して、コピーするファイルの一覧に足します。中身はまだ読みません（コピー元のパスだけ）。

## 4. 3rdpartylicenses.txt を作る

📄 `angular-cli/packages/angular/build/src/builders/application/execute-build.ts` L334–357 （▶ の行: 335–339, 344, 351, 353, 355）

```ts
334 │     // Extract and write licenses for used packages
335 ▶     if (options.extractLicenses) {
336 ▶       executionResult.addOutputFile(
337 ▶         '3rdpartylicenses.txt',
338 ▶         await extractLicenses(metafiles, workspaceRoot),
339 ▶         BuildOutputFileType.Root,
340 │       );
341 │     }
342 │ 
343 │     // Watch input index HTML file if configured
344 ▶     if (options.indexHtmlOptions) {
345 │       executionResult.extraWatchFiles.push(options.indexHtmlOptions.input);
346 │       executionResult.htmlIndexPath = options.indexHtmlOptions.output;
347 │       executionResult.htmlBaseHref = options.baseHref;
348 │     }
349 │ 
350 │     // Create server app engine manifest
351 ▶     if (serverEntryPoint) {
352 │       executionResult.addOutputFile(
353 ▶         SERVER_APP_ENGINE_MANIFEST_FILENAME,
354 │         generateAngularServerAppEngineManifest(i18nOptions, security.allowedHosts, baseHref),
355 ▶         BuildOutputFileType.ServerRoot,
356 │       );
357 │     }
```

335 行目、`extractLicenses` は schema の既定が `true` で、このサイトの `development` 構成だけが `false` にしています。338 行目で `metafiles`（ブラウザ用とサーバー用の 2 つ）を渡し、339 行目の `BuildOutputFileType.Root` が「出力先の一番上に置く」という種類です（どこに書かれるかは 8 節）。344〜348 行目は watch 用に index.html の場所を覚えるだけ、351〜357 行目はサーバーの入口があるときの `angular-app-engine-manifest.mjs`（[ssr-app-engine](../platform/04-ssr-app-engine.md)）です。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/license-extractor.ts` L63–91 （▶ の行: 73–75, 77, 82, 88）

```ts
63 │ export async function extractLicenses(
64 │   metafiles: Metafile[],
65 │   rootDirectory: string,
66 │ ): Promise<string> {
67 │   let extractedLicenseContent = `${EXTRACTION_FILE_HEADER}\n${EXTRACTION_FILE_SEPARATOR}`;
68 │ 
69 │   const seenPaths = new Set<string>();
70 │   const seenPackageDirectories = new Set<string>();
71 │   const seenPackages = new Set<string>();
72 │ 
73 ▶   for (const metafile of metafiles) {
74 ▶     for (const entry of Object.values(metafile.outputs)) {
75 ▶       for (const [inputPath, { bytesInOutput }] of Object.entries(entry.inputs)) {
76 │         // Skip if not included in output
77 ▶         if (bytesInOutput <= 0) {
78 │           continue;
79 │         }
80 │ 
81 │         // Skip already processed paths
82 ▶         if (seenPaths.has(inputPath)) {
83 │           continue;
84 │         }
85 │         seenPaths.add(inputPath);
86 │ 
87 │         // Skip non-package paths
88 ▶         if (!inputPath.includes(NODE_MODULE_SEGMENT)) {
89 │           continue;
90 │         }
91 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/license-extractor.ts` L183–192 （▶ の行: 184–187）

```ts
183 │         // Generate the package's license entry in the output content
184 ▶         extractedLicenseContent += `Package: ${packageJson.name}\n`;
185 ▶         extractedLicenseContent += `License: ${JSON.stringify(packageJson.license, null, 2)}\n`;
186 ▶         extractedLicenseContent += `\n${licenseText}\n`;
187 ▶         extractedLicenseContent += EXTRACTION_FILE_SEPARATOR;
188 │       }
189 │     }
190 │   }
191 │ 
192 │   return extractedLicenseContent;
```

73〜75 行目、メタファイルの出力ごとに「その出力に入った入力ファイル」を回します。77 行目、**出力に 1 バイトも入っていない**入力（tree-shaking で消えたもの）は飛ばし、88 行目で `node_modules` の中のファイルだけを残します。そこから `package.json` と `LICENSE` ファイルを探し、184〜187 行目の形で 1 パッケージずつ書き足します。

このサイトの `3rdpartylicenses.txt` には 11 パッケージが並びました：`@angular/core`・`rxjs`・`tslib`・`@angular/common`・`@angular/platform-browser`・`@angular/router`・`@angular/forms`・`@angular/compiler`・`@angular/ssr`・`@angular/platform-server`・`xhr2`。後ろの 3 つは 338 行目でサーバー用のメタファイルも渡しているためで、`outputMode: "static"` でサーバー用のファイルを書き出さないビルドでも、サーバー用バンドルに入ったパッケージのライセンスが載ります。

## 5. i18n か、後処理か

📄 `angular-cli/packages/angular/build/src/builders/application/execute-build.ts` L359–391 （▶ の行: 360–361, 364, 366, 373, 380–381, 385, 387, 389）

```ts
359 │     // Perform i18n translation inlining if enabled
360 ▶     if (i18nOptions.shouldInline) {
361 ▶       const result = await inlineI18n(browserMetafile, options, executionResult, initialFiles);
362 │       executionResult.addErrors(result.errors);
363 │       executionResult.addWarnings(result.warnings);
364 ▶       executionResult.addPrerenderedRoutes(result.prerenderedRoutes);
365 │     } else {
366 ▶       const result = await executePostBundleSteps(
367 │         browserMetafile,
368 │         options,
369 │         executionResult.outputFiles,
370 │         executionResult.assetFiles,
371 │         initialFiles,
372 │         // Set lang attribute to the defined source locale if present
373 ▶         i18nOptions.hasDefinedSourceLocale ? i18nOptions.sourceLocale : undefined,
374 │       );
375 │ 
376 │       // Deduplicate and add errors and warnings
377 │       executionResult.addErrors([...new Set(result.errors)]);
378 │       executionResult.addWarnings([...new Set(result.warnings)]);
379 │ 
380 ▶       executionResult.addPrerenderedRoutes(result.prerenderedRoutes);
381 ▶       executionResult.outputFiles.push(...result.additionalOutputFiles);
382 │       executionResult.assetFiles.push(...result.additionalAssets);
383 │     }
384 │ 
385 ▶     if (serverEntryPoint) {
386 │       executionResult.addOutputFile(
387 ▶         'prerendered-routes.json',
388 │         JSON.stringify({ routes: executionResult.prerenderedRoutes }, null, 2),
389 ▶         BuildOutputFileType.Root,
390 │       );
391 │     }
```

360 行目で道が 2 つに分かれます。翻訳を差し込むビルドなら 361 行目の `inlineI18n` が、ロケールごとに翻訳を差し込んでから、それぞれのロケールについて後処理を呼びます（[第 9 回](09-cli-i18n.md)）。このサイトのように i18n が無ければ、366 行目で `executePostBundleSteps` を 1 回だけ呼びます。380〜381 行目で、後処理が作ったルートの一覧と HTML ファイルを結果に足し、385〜391 行目で、サーバーの入口があれば `prerendered-routes.json` を、これも `Root` の種類で足します（389 行目）。

📄 `angular-cli/packages/angular/build/src/builders/application/execute-post-bundle.ts` L83–96 （▶ の行: 87–88, 95）

```ts
83 │   // Embed ECMA-426 Debug IDs into JS/source-map pairs before any consumer reads the bytes (in
84 │   // particular `generateIndexHtml` below, which computes SRI hashes from the on-disk content).
85 │   // Doing this here also covers the i18n path, where this function is invoked once per locale
86 │   // with locale-specific output files. Files without a source map sibling are skipped.
87 ▶   if (sourcemapOptions.scripts) {
88 ▶     injectDebugIds(outputFiles);
89 │   }
90 │ 
91 │   // Index HTML content without CSS inlining to be used for server rendering (AppShell, SSG and SSR).
92 │   // NOTE: Critical CSS inlining is deliberately omitted here, as it will be handled during server rendering.
93 │   // Additionally, when using prerendering or AppShell, the index HTML file may be regenerated.
94 │   // To prevent generating duplicate files with the same filename, a `Map` is used to store and manage the files.
95 ▶   const additionalHtmlOutputFiles = new Map<string, BuildOutputFile>();
96 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/application/execute-post-bundle.ts` L237–268 （▶ の行: 237, 241, 243, 249, 254, 262）

```ts
237 ▶   additionalOutputFiles.push(...additionalHtmlOutputFiles.values());
238 │ 
239 │   // Augment the application with service worker support
240 │   // If localization is enabled, service worker is handled in the inlining process.
241 ▶   if (serviceWorker) {
242 │     try {
243 ▶       const serviceWorkerResult = await augmentAppWithServiceWorkerEsbuild(
244 │         workspaceRoot,
245 │         serviceWorker,
246 │         baseHref,
247 │         options.indexHtmlOptions?.output,
248 │         // Ensure additional files recently added are used
249 ▶         [...outputFiles, ...additionalOutputFiles],
250 │         assetFiles,
251 │       );
252 │ 
253 │       additionalOutputFiles.push(
254 ▶         createOutputFile('ngsw.json', serviceWorkerResult.manifest, BuildOutputFileType.Browser),
255 │       );
256 │       additionalAssets.push(...serviceWorkerResult.assetFiles);
257 │     } catch (error) {
258 │       allErrors.push(error instanceof Error ? error.message : `${error}`);
259 │     }
260 │   }
261 │ 
262 ▶   return {
263 │     errors: allErrors,
264 │     warnings: allWarnings,
265 │     additionalAssets,
266 │     prerenderedRoutes,
267 │     additionalOutputFiles,
268 │   };
```

1. **87〜88 行目：ソースマップに Debug ID を埋める**

   JS とソースマップの組に同じ ID を書き込みます。次の index.html の生成が SRI のハッシュを計算する前にやる、とコメントにあります（このサイトの本番はソースマップ無しなので走りません）。
2. **95 行目から：index.html とプリレンダー**

   `index.html`（このサイトでは `index.csr.html`）の生成は [boot-index-html](../boot/05-boot-index-html.md)、マニフェストの生成・プリレンダー・`chapter/build/index.html` などの書き足しは [ssr-prerender](../platform/06-ssr-prerender.md) で読みました。ログの `Prerendered 245 static routes.` はここで得た件数です。
3. **237〜260 行目：service worker**

   237 行目で HTML をまとめて足したあと、`serviceWorker` の設定があれば、出来上がったファイル全部（249 行目）から `ngsw.json` を作ります（254 行目、種類は `Browser`）。このサイトは設定が無いので走りません。

## 6. 統計ファイルと、ログの表

📄 `angular-cli/packages/angular/build/src/builders/application/execute-build.ts` L393–428 （▶ の行: 394, 396, 401, 410, 414, 418, 421）

```ts
393 │     // Write metafiles if stats option is enabled
394 ▶     if (options.stats) {
395 │       executionResult.addOutputFile(
396 ▶         'browser-stats.json',
397 │         JSON.stringify(browserMetafile, null, 2),
398 │         BuildOutputFileType.Root,
399 │       );
400 │ 
401 ▶       if (serverEntryPoint) {
402 │         executionResult.addOutputFile(
403 │           'server-stats.json',
404 │           JSON.stringify(serverMetafile, null, 2),
405 │           BuildOutputFileType.Root,
406 │         );
407 │       }
408 │     }
409 │ 
410 ▶     if (!jsonLogs && !options.quiet) {
411 │       const changedFiles =
412 │         rebuildState && executionResult.findChangedFiles(rebuildState.previousOutputInfo);
413 │       executionResult.addLog(
414 ▶         logBuildStats(
415 │           metafiles,
416 │           outputFiles,
417 │           initialFiles,
418 ▶           budgetFailures,
419 │           colors,
420 │           changedFiles,
421 ▶           estimatedTransferSizes,
422 │           !!ssrOptions,
423 │           verbose,
424 │         ),
425 │       );
426 │     }
427 │ 
428 │     return executionResult;
```

394〜408 行目、`--stats-json` を付けると esbuild のメタファイルそのものを `browser-stats.json`（と `server-stats.json`）として書き出します。410 行目、JSON のログでも `--quiet` でもなければ、414 行目の `logBuildStats` が表の文字列を作ります。418 行目に budgets の結果、421 行目に 3 節の転送サイズを渡しています。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/utils.ts` L78–96 （▶ の行: 79–80, 82, 87–88, 90, 92）

```ts
78 │ 
79 ▶     if (isPlatformServer) {
80 ▶       serverStats.push(stat);
81 │     } else {
82 ▶       browserStats.push(stat);
83 │     }
84 │   }
85 │ 
86 │   if (browserStats.length > 0 || serverStats.length > 0) {
87 ▶     const tableText = generateEsbuildBuildStatsTable(
88 ▶       [browserStats, serverStats],
89 │       colors,
90 ▶       unchangedCount === 0,
91 │       !!estimatedTransferSizes,
92 ▶       budgetFailures,
93 │       verbose,
94 │     );
95 │ 
96 │     return tableText + '\n';
```

`logBuildStats` の後半です。前半（[第 8 回](08-cli-budgets.md)で引用）で、出力ファイルを 1 つずつ見て、SSR の出力が無効ならサーバー用のファイルを飛ばし（このサイトの表にサーバーの行が無いのはこのため）、入口の名前（表の「Names」列。このサイトでは `compiler` や `router-pipeline` などの章の名前）と初期ファイルかどうかを決めています。79〜83 行目でそれをサーバー用とブラウザ用に分け、87〜94 行目で 2 つの表をまとめて `generateEsbuildBuildStatsTable`（`stats-table.ts`）に渡します。90 行目は「変わっていないファイルが無い」（初回ビルド）、92 行目は 3 節の budgets の結果です。15 行で切って「`...and N more`」にする所は `stats-table.ts` の中です（第 8 回）。ここで返った `executionResult` に、builder が `Prerendered N static routes.` と `Application bundle generation complete.` の 2 行を足します（[ssr-prerender の 7 節](../platform/06-ssr-prerender.md)）。

## 7. 結果を「ファイルの一覧」にする

📄 `angular-cli/packages/angular/build/src/builders/application/build-action.ts` L281–307 （▶ の行: 281, 283, 295–296）

```ts
281 ▶   if (errors.length > 0) {
282 │     yield {
283 ▶       kind: ResultKind.Failure,
284 │       errors: errors as ResultMessage[],
285 │       warnings: warnings as ResultMessage[],
286 │       detail: {
287 │         outputOptions,
288 │       },
289 │     };
290 │ 
291 │     return;
292 │   }
293 │ 
294 │   // Use a full result if there is no rebuild state (no prior build result)
295 ▶   if (!rebuildState || !changes) {
296 ▶     yield createFullResult(
297 │       outputFiles,
298 │       assetFiles,
299 │       warnings,
300 │       outputOptions,
301 │       externalMetadata,
302 │       htmlIndexPath,
303 │       htmlBaseHref,
304 │     );
305 │ 
306 │     return;
307 │   }
```

📄 `angular-cli/packages/angular/build/src/builders/application/build-action.ts` L445–479 （▶ の行: 455, 458, 462, 464, 468）

```ts
445 │ function createFullResult(
446 │   outputFiles: readonly BuildOutputFile[],
447 │   assetFiles: readonly BuildOutputAsset[],
448 │   warnings: readonly unknown[],
449 │   outputOptions: NormalizedApplicationBuildOptions['outputOptions'],
450 │   externalMetadata: unknown,
451 │   htmlIndexPath: unknown,
452 │   htmlBaseHref: unknown,
453 │ ): FullResult {
454 │   return {
455 ▶     kind: ResultKind.Full,
456 │     warnings: warnings as ResultMessage[],
457 │     files: [
458 ▶       ...assetFiles.map(({ source, destination }) => ({
459 │         path: destination,
460 │         type: BuildOutputFileType.Browser,
461 │         inputPath: source,
462 ▶         origin: 'disk' as const,
463 │       })),
464 ▶       ...outputFiles.map((file) => ({
465 │         path: file.path,
466 │         type: file.type,
467 │         contents: file.contents,
468 ▶         origin: 'memory' as const,
469 │         hash: file.hash,
470 │       })),
471 │     ],
472 │     detail: {
473 │       externalMetadata,
474 │       htmlIndexPath,
475 │       htmlBaseHref,
476 │       outputOptions,
477 │     },
478 │   };
479 │ }
```

`runEsBuildBuildAction`（`build-action.ts`）は `executeBuild` の結果を、builder に渡す形に直します。281〜283 行目、エラーがあれば `Failure` だけを返し、ファイルは渡しません。初回ビルドは 295 行目のとおり前回の状態が無いので、`createFullResult` で全部のファイルを渡します。458〜462 行目、アセットは `origin: 'disk'`（コピー元のパスだけ）、464〜468 行目、それ以外の出力は `origin: 'memory'`（中身のバイト列）です。再ビルドで変わったものだけを渡す `Incremental` は[第 10 回](10-cli-cache-watch.md)。

## 8. builder がディスクに書く

📄 `angular-cli/packages/angular/build/src/builders/application/index.ts` L160–197 （▶ の行: 166–167, 175–176, 183–184, 196）

```ts
160 │ export async function* buildApplication(
161 │   options: ApplicationBuilderOptions,
162 │   context: BuilderContext,
163 │   extensions?: ApplicationBuilderExtensions,
164 │ ): AsyncIterable<BuilderOutput> {
165 │   let initial = true;
166 ▶   const internalOptions = { ...options, incrementalResults: true };
167 ▶   for await (const result of buildApplicationInternal(internalOptions, context, extensions)) {
168 │     const outputOptions = result.detail?.['outputOptions'] as NormalizedOutputOptions | undefined;
169 │ 
170 │     if (initial) {
171 │       initial = false;
172 │ 
173 │       // Clean the output location if requested.
174 │       // Output options may not be present if the build failed.
175 ▶       if (outputOptions?.clean) {
176 ▶         await deleteOutputDir(context.workspaceRoot, outputOptions.base, [
177 │           outputOptions.browser,
178 │           outputOptions.server,
179 │         ]);
180 │       }
181 │     }
182 │ 
183 ▶     if (result.kind === ResultKind.Failure) {
184 ▶       yield { success: false };
185 │       continue;
186 │     }
187 │ 
188 │     assert(outputOptions, 'Application output options are required for builder usage.');
189 │     assert(
190 │       result.kind === ResultKind.Full || result.kind === ResultKind.Incremental,
191 │       'Application build did not provide a file result output.',
192 │     );
193 │ 
194 │     // TODO: Restructure output logging to better handle stdout JSON piping
195 │     if (!useJSONBuildLogs) {
196 ▶       context.logger.info(`Output location: ${outputOptions.base}\n`);
197 │     }
```

`angular.json` の `@angular/build:application` の実体がこの `buildApplication` です。167 行目で結果を 1 つずつ受け取り、最初の 1 回だけ 175〜176 行目で出力先を消します （`deleteOutputPath` の既定は `true`）。183〜184 行目、`Failure` ならディスクには何も書かず `success: false`。196 行目がログの `Output location: …` です。このあと `emitFilesToDisk` で、`memory` のファイルは `writeFile`、`disk` のファイルは `cp` します（[boot-dev-server](../boot/03-boot-dev-server.md) で引用した部分）。書く場所はファイルの種類で決まります。

📄 `angular-cli/packages/angular/build/src/builders/application/index.ts` L258–291 （▶ の行: 265–267, 269–271, 273–274, 282, 284）

```ts
258 │ function generateFullPath(
259 │   filePath: string,
260 │   type: BuildOutputFileType,
261 │   outputOptions: NormalizedOutputOptions,
262 │ ) {
263 │   let typeDirectory: string;
264 │   switch (type) {
265 ▶     case BuildOutputFileType.Browser:
266 ▶     case BuildOutputFileType.Media:
267 ▶       typeDirectory = outputOptions.browser;
268 │       break;
269 ▶     case BuildOutputFileType.ServerApplication:
270 ▶     case BuildOutputFileType.ServerRoot:
271 ▶       typeDirectory = outputOptions.server;
272 │       break;
273 ▶     case BuildOutputFileType.Root:
274 ▶       typeDirectory = '';
275 │       break;
276 │     default:
277 │       throw new Error(
278 │         `Unhandled write for file "${filePath}" with type "${BuildOutputFileType[type]}".`,
279 │       );
280 │   }
281 │   // NOTE: 'base' is a fully resolved path at this point
282 ▶   const fullFilePath = path.join(outputOptions.base, typeDirectory, filePath);
283 │ 
284 ▶   if (!isSubDirectory(outputOptions.base, fullFilePath)) {
285 │     throw new Error(
286 │       `The output file path "${fullFilePath}" is outside of the configured output path "${outputOptions.base}".`,
287 │     );
288 │   }
289 │ 
290 │   return fullFilePath;
291 │ }
```

1. **265〜267 行目：`Browser` と `Media`**

   `<base>/browser/` の下。JS・CSS・HTML・アセットはここです。
2. **269〜271 行目：`ServerApplication` と `ServerRoot`**

   `<base>/server/` の下。ただし `outputMode: "static"` では書く前に捨てられます（[ssr-prerender の 1 節](../platform/06-ssr-prerender.md)の `ignoreServer`）。
3. **273〜274 行目：`Root`**

   種類のディレクトリが空文字なので、`<base>` の直下。4 節の `3rdpartylicenses.txt` と 5 節の `prerendered-routes.json` はここに来ます。
4. **282〜288 行目：出力先の外には書かない**

   `path.join` の結果が出力先の中でなければエラーにします（ファイル名に `../` が入った場合など）。

> [!NOTE]
> **ポイント**
>
> このサイトは Vercel の `outputDirectory` を `dist/angular-deep-dive/browser` にしています。`Root` の 2 ファイルは `browser/` の外にあるので、**デプロイしたサイトでは配られません**（`/3rdpartylicenses.txt` を開いても 404 です）。ライセンスの表示を配りたいなら、出力の一番上から自分でコピーする必要があります。

> **🧪 DEMO — このファイルはどこに書かれ、配られるか**
>
> `generateFullPath`（265〜290 行目）と、`ignoreServer` のときにサーバー用を捨てる処理を、数行の自作関数で再現しています。`base` は `dist/angular-deep-dive`、`browser` は `browser`、`server` は `server`（このサイトの値）。ファイル名と種類は、このサイトの本番ビルドで実際に出たものです。
>
> 取得したのは表の `chapter/build/index.html`（5 節の後処理がプリレンダーで作った `Browser` の種類のファイル）です。`Root` の 2 ファイルは `browser/` の外なので、ここからは取得できません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/build)

## 9. 「コンパイルが 2 回」について

ビルドのログに `NG_EMIT_TS` と `NG_DIAGNOSTICS_TOTAL` が別々に出ることから「2 回コンパイルしている」と言われます。正確には、`NgtscProgram` は 1 つで、解析（`analyzeAsync`）も 1 回です。その上で **JS を出す作業（emit）**と**型チェック（diagnose）**を分けて呼び、型チェックはワーカースレッドで esbuild のバンドルと同時に進め、バンドルの終わり（`onEnd`）で結果を待ちます。そのため、型チェックが終わる前に esbuild は JS を読み始められます。このサイトのログでは `NG_EMIT_TS` 3.43 秒、`NG_DIAGNOSTICS_TOTAL` 4.96 秒でした。分け方とワーカーとのやりとりは[第 3 回](03-cli-angular-compilation.md)で 1 行ずつ読みます。

## 段の一覧

| 段 | 関数 | ファイル | 扱う回 |
| --- | --- | --- | --- |
| 対象ブラウザ・翻訳の読み込み | `getSupportedBrowsers` / `loadActiveTranslations` | `execute-build.ts` L69・L74 | 2・9 |
| コンパイラの選択と esbuild の文脈 | `createAngularCompilation` / `setupBundlerContexts` | `execute-build.ts` / `setup-bundling.ts` | 3・boot-application-build |
| バンドル（AOT・スタイル・変換・リンカー） | `BundlerContext.bundleAll` | `bundler-context.ts` / `compiler-plugin.ts` | 3〜6 |
| コンパイラの片付け | `angularCompilationContext.dispose` | `execute-build.ts` L180 | 2 |
| チャンクの整理 | `optimizeChunks` | `chunk-optimizer.ts` | 7 |
| budgets | `generateBudgetStats` / `checkBudgets` | `budget-stats.ts` / `bundle-calculator.ts` | 8 |
| 転送サイズ・CommonJS・アセット | `calculateEstimatedTransferSizes` / `checkCommonJSModules` / `resolveAssets` | `execute-build.ts` L319〜332 | 2・8 |
| ライセンス | `extractLicenses` | `license-extractor.ts` | 2 |
| i18n の差し込み | `inlineI18n` | `i18n.ts` / `i18n-inliner.ts` | 9 |
| index.html・プリレンダー・service worker | `executePostBundleSteps` | `execute-post-bundle.ts` | boot-index-html・ssr-prerender・2 |
| ログの表 | `logBuildStats` | `tools/esbuild/utils.ts` / `stats-table.ts` | 2・8 |
| 書き出し | `createFullResult` / `emitFilesToDisk` / `generateFullPath` | `build-action.ts` / `index.ts` | 2・10 |

## 呼び出しの連なり

- 👤 `ng build` — angular.json: @angular/build:application
  - `buildApplication(options, context)` — builders/application/index.ts L160
    - `buildApplicationInternal → runEsBuildBuildAction(action)` — index.ts / build-action.ts — *boot-application-build*
      - `executeBuild(normalizedOptions, context)` — execute-build.ts L47
        - `BundlerContext.bundleAll([...])` — execute-build.ts — *第 3〜6 回*
        - `angularCompilationContext.dispose()` — L180
        - `optimizeChunks(bundlingResult, ...)` — chunk-optimizer.ts — *第 7 回*
        - `checkBudgets(options.budgets, compatStats, true)` — L307 — *第 8 回*
        - `extractLicenses(metafiles, workspaceRoot)` — L338
        - `executePostBundleSteps(...)` — L366 — *index.html・プリレンダー*
        - `logBuildStats(metafiles, outputFiles, ...)` — L414
      - `emitOutputResults → createFullResult(...)` — build-action.ts L296, L445
    - `emitFilesToDisk(result.files, ...) → generateFullPath(...)` — index.ts L258

## 聞かれそうな質問

**Q. `dist/` の中には何が入っていますか？**

8 節の 265〜274 行目のとおり、種類ごとに 3 か所です。このサイトの本番ビルドでは、`dist/angular-deep-dive/` の直下（`Root`）に `3rdpartylicenses.txt` と `prerendered-routes.json`、`browser/`（`Browser` / `Media`）に `main-*.js`・`styles-*.css`・`chunk-*.js` 255 個・`favicon.ico`・`index.html`・`index.csr.html`・`chapter/<slug>/index.html` などのプリレンダー結果。`server/` はありません（`static` なのでサーバー用は書く前に捨てる）。`--stats-json` を付けると 6 節の 394〜408 行目で `browser-stats.json` が直下に増えます。

**Q. `--configuration production` で何が変わりますか？**

📄 `angular-cli/packages/angular/build/src/builders/application/schema.json` L450–478 （▶ の行: 453, 472, 477）

```json
450 │     "outputHashing": {
451 │       "type": "string",
452 │       "description": "Define the output filename cache-busting hashing mode.\n\n- `none`: No hashing.\n- `all`: Hash for all output bundles. \n- `media`: Hash for all output media (e.g., images, fonts, etc. that are referenced in CSS files).\n- `bundles`: Hash for output of lazy and main bundles.",
453 ▶       "default": "none",
454 │       "enum": ["none", "all", "media", "bundles"]
455 │     },
456 │     "poll": {
457 │       "type": "number",
458 │       "description": "Enable and define the file watching poll time period in milliseconds."
459 │     },
460 │     "deleteOutputPath": {
461 │       "type": "boolean",
462 │       "description": "Delete the output path before building.",
463 │       "default": true
464 │     },
465 │     "preserveSymlinks": {
466 │       "type": "boolean",
467 │       "description": "Do not use the real path when resolving modules. If unset then will default to `true` if NodeJS option --preserve-symlinks is set."
468 │     },
469 │     "extractLicenses": {
470 │       "type": "boolean",
471 │       "description": "Extract all licenses in a separate file.",
472 ▶       "default": true
473 │     },
474 │     "namedChunks": {
475 │       "type": "boolean",
476 │       "description": "Use file name for lazy loaded chunks.",
477 ▶       "default": false
478 │     },
```

schema の既定は「本番寄り」です。`optimization` の既定は `true`、472 行目の `extractLicenses` も `true`。一方で 453 行目の `outputHashing` の既定は `none`、477 行目の `namedChunks` は `false` です。このサイトの `angular.json` は、`production` 構成で `budgets` と `outputHashing: "all"`（ファイル名にハッシュ）を足し、`development` 構成で `optimization: false`・`extractLicenses: false`・`sourceMap: true` にしています。`defaultConfiguration` が `production` なので、`ng build` だけで production です。`executeBuild` の中では、3 節の 305 行目（`budgets` があるとき）、319 行目と 324 行目（最適化のとき）、4 節の 335 行目（`extractLicenses`）が構成で走るかどうかが変わる段です。

**Q. ビルドが遅いとき、どこを見ればいいですか？**

📄 `angular-cli/packages/angular/build/src/tools/esbuild/profiling.ts` L71–99 （▶ の行: 73, 76, 80, 89–90, 97）

```ts
71 │ function recordDuration(name: string, startTime: bigint, cumulative?: boolean): void {
72 │   const duration = Number(process.hrtime.bigint() - startTime) / 10 ** 9;
73 ▶   if (cumulative) {
74 │     cumulativeDurations ??= new Map<string, number[]>();
75 │     const durations = cumulativeDurations.get(name) ?? [];
76 ▶     durations.push(duration);
77 │     cumulativeDurations.set(name, durations);
78 │   } else {
79 │     // eslint-disable-next-line no-console
80 ▶     console.log(`DURATION[${name}]: ${duration.toFixed(9)}s`);
81 │   }
82 │ }
83 │ 
84 │ export async function profileAsync<T>(
85 │   name: string,
86 │   action: () => Promise<T>,
87 │   cumulative?: boolean,
88 │ ): Promise<T> {
89 ▶   if (!debugPerformance) {
90 ▶     return action();
91 │   }
92 │ 
93 │   const startTime = process.hrtime.bigint();
94 │   try {
95 │     return await action();
96 │   } finally {
97 ▶     recordDuration(name, startTime, cumulative);
98 │   }
99 │ }
```

環境変数 `NG_BUILD_DEBUG_PERF=1` で `debugPerformance` が真になると、89〜90 行目の素通りをやめて時間を測ります。`cumulative` でない計測は 80 行目でその場で `DURATION[名前]: 秒` を出し、`cumulative` の計測は 73〜76 行目で溜めておき、esbuild の `onEnd` で合計・回数・平均・最小・最大をまとめて出します。

このサイトでは `NG_CREATE_PROGRAM` 0.50 秒、`NG_ANALYZE_PROGRAM` 1.36 秒、`NG_EMIT_TS` 3.43 秒、`NG_DIAGNOSTICS_TOTAL` 4.96 秒（うちテンプレートの型チェック `NG_DIAGNOSTICS_TEMPLATE` が 491 ファイルで 4.54 秒）、`OPTIMIZE_CHUNKS` 0.29 秒でした。`NG_EMIT_JS*`（`node_modules` の JS の変換）は 525 ファイルで合計 34.4 秒と全体の 19.4 秒より長いですが、これは並行して走る読み込みの時間を足した値だからです。同じ行が 2 回並ぶのは、ブラウザ用とサーバー用の esbuild の文脈がどちらも `onEnd` で溜めた表を出すためです。

**Q. 本番ビルドのファイル名の `-I6ZUT6OG` は何ですか？**

`outputHashing: "all"` による中身のハッシュです（453 行目の選択肢の `all`）。中身が変わらなければ名前も変わらないので、ブラウザのキャッシュを長くできます。`chunk-*.js` にハッシュが付くのは既定でも同じで、`namedChunks`（477 行目）を `true` にすると遅延チャンクの名前に入口のファイル名が入ります。

## 読み終えて

- `executeBuild` はバンドルのあと、エラーなら即座に返し、そうでなければ「チャンクの整理 → budgets → 転送サイズ → アセット → ライセンス → i18n か後処理 → 統計」の順に進む。
- watch でないビルドでは、バンドルが終わった時点でコンパイラのワーカーを待たずに捨て始める（L179〜181）。
- `3rdpartylicenses.txt` は esbuild のメタファイルから「出力に 1 バイト以上入った `node_modules` のパッケージ」を拾って作る。サーバー用バンドルの分も入る。
- 出力はファイルの種類で場所が決まる。`Root`（ライセンス・`prerendered-routes.json`）は `browser/` の外なので、`browser/` を配るホスティングでは配られない。
- 「2 回コンパイル」は、1 つのプログラムに対する emit と型チェックの 2 つの作業。型チェックはバンドルと同時に進む（第 3 回）。

---

← 前: [CLI とビルドの概観：ng コマンド・architect・builder・schematics](01-cli-overview.md)  
次: [AotCompilation と並列ワーカー：1 つのプログラムで出力と型チェックを分ける](03-cli-angular-compilation.md) →
