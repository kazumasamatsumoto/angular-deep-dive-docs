[目次](../README.md) › [CLI とビルド](README.md) › 第 5 回 / 全 16 回

# JavaScriptTransformer：oxc で純粋の印を付け、メタデータを消す

> esbuild の onLoad が .js / .mjs を JavaScriptTransformer に渡し、Piscina のワーカーで変換する行。v22.1 で Babel から oxc に替わった変換（pure-toplevel-functions、adjust-static-class-members、adjust-typescript-enums、elide-angular-metadata）がそれぞれ何をして、なぜ木の揺さぶり（tree shaking）が効くようになるか。リンカーだけに残る退避路 NG\_BUILD\_BABEL\_LINKER。

angular/angular-cli · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cli-javascript-transformer)

---

esbuild がバンドルに入れる JavaScript は、読み込まれた直後に `JavaScriptTransformer` を通ります。ここで、ライブラリの部分コンパイルをリンクし（[第 6 回](06-cli-linker.md)）、本番ビルドでは oxc（Rust で書かれた JavaScript パーサー）で木を読んで**esbuild が消してよいと判断できる形**に書き換えます。この章では、どのファイルがワーカーに送られ、4 つの書き換え（純粋の印・static の包み込み・enum の包み込み・メタデータの削除）がそれぞれ何を見て何を書くのかを、行番号で追います。

読む対象は angular-cli の `tools/esbuild/javascript-transformer.ts`・`javascript-transformer-worker.ts`・`angular/compiler-plugin.ts`、`tools/oxc/oxc-transform.ts`・`traversal.ts` と、各変換の `*_oxc_spec.ts`（入力と期待する出力の対）です。

1. [1. 概観](01-cli-overview.md)
2. [2. ng build の段取り](02-build.md)
3. [3. AotCompilation](03-cli-angular-compilation.md)
4. [4. コンポーネントのスタイル](04-cli-component-styles.md)
5. **5. oxc の変換**（この章）
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

> [!WARNING]
> **ハマりどころ**
>
> 読むソースは 22.2.0-next.6 です。このサイトをビルドしている `@angular/build` 22.1.7 でも、本番の 4 つの変換はすでに oxc です（22.1.0 で Babel から移行）。違うのはリンカーで、22.1 ではまだ Babel のリンカーが使われています（oxc のリンカーは 22.2.0-next.1 から）。

## 0. 全体の流れ

1. **esbuild の onLoad**

   `.js` / `.mjs`（主に node\_modules）と、コンパイラが出した `.ts` の結果が、`JavaScriptTransformer` に渡る（1 節）。
2. **ワーカーに送るかの判定**

   文字列を探すだけで「リンクが要るか」「変換の候補があるか」を決める。どちらも無ければワーカーに送らずに返す（2 節）。
3. **Piscina のワーカー**

   キャッシュを引いてから、ワーカーの `transformJavaScript` を呼ぶ（3 節）。
4. **oxc で 1 回だけ木を歩く**

   `oxc-parser` で木を作り、後ろから順に（子が先）節点を見て、`magic-string` で文字列を直接書き換える（4 節）。
5. **4 つの変換**

   純粋の印（5 節）、static の包み込み（6 節）、enum の包み込み（7 節）、メタデータの削除（8 節）。
6. **esbuild の木の揺さぶり**

   書き換え後のコードを esbuild がまとめ、使われない部分を落とし、minify する（9 節）。

## 1. 誰が JavaScriptTransformer を呼ぶか

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L464–467 （▶ の行: 466）

```ts
464 │   // Return all the normalized options
465 │   return {
466 ▶     advancedOptimizations: !!aot && optimizationOptions.scripts,
467 │     allowedCommonJsDependencies,
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular/compiler-plugin.ts` L105–118 （▶ の行: 108–109, 113–114, 116–117）

```ts
105 │       // During bundling, esbuild runs its own multi-threaded Go process across all available cores.
106 │       // Unless explicitly configured via NG_BUILD_MAX_WORKERS, cap transformation concurrency to at
107 │       // most 4 to prevent CPU contention during bundling.
108 ▶       const maxTransformWorkers = hasCustomMaxWorkers ? maxWorkers : Math.min(4, maxWorkers);
109 ▶       const javascriptTransformer = new JavaScriptTransformer(
110 │         {
111 │           sourcemap: !!pluginOptions.sourcemap,
112 │           thirdPartySourcemaps: pluginOptions.thirdPartySourcemaps,
113 ▶           advancedOptimizations: pluginOptions.advancedOptimizations,
114 ▶           jit: pluginOptions.jit || pluginOptions.includeTestMetadata,
115 │         },
116 ▶         maxTransformWorkers,
117 ▶         cacheStore?.createCache('jstransformer'),
118 │       );
```

466 行目、「高度な最適化」（`advancedOptimizations`）は AOT で、かつスクリプトの最適化が有効（本番構成）のときだけ真です。`ng serve` の既定（development）では 4 つの変換は走らず、リンクだけが走ります。108 行目、esbuild 自身が全コアを使うので、ワーカーは環境変数 `NG_BUILD_MAX_WORKERS` を指定しない限り最大 4 本に抑えます。117 行目でディスクのキャッシュ（[第 10 回](10-cli-cache-watch.md)）の `jstransformer` という区画を渡します。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular/compiler-plugin.ts` L558–587 （▶ の行: 559–560, 572–574）

```ts
558 │       build.onLoad(
559 ▶         { filter: /\.[cm]?js$/ },
560 ▶         createCachedLoad(pluginOptions.loadResultCache, async (args) => {
561 │           let request = rewriteForBazel(args.path);
562 │           if (pluginOptions.fileReplacements) {
563 │             const replacement = pluginOptions.fileReplacements[path.normalize(args.path)];
564 │             if (replacement) {
565 │               request = path.normalize(replacement);
566 │             }
567 │           }
568 │ 
569 │           return profileAsync(
570 │             'NG_EMIT_JS*',
571 │             async () => {
572 ▶               const contents = await javascriptTransformer.transformFile(request, {
573 ▶                 skipLinker: pluginOptions.jit,
574 ▶                 sideEffects: () => hasSideEffects(request),
575 │               });
576 │ 
577 │               return {
578 │                 contents,
579 │                 loader: 'js',
580 │                 resolveDir: path.dirname(request),
581 │                 watchFiles: request !== args.path ? [request] : undefined,
582 │               };
583 │             },
584 │             true,
585 │           );
586 │         }),
587 │       );
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular/compiler-plugin.ts` L667–681 （▶ の行: 671–672, 675, 680）

```ts
667 │       /**
668 │        * Checks if the file has side-effects when `advancedOptimizations` is enabled.
669 │        */
670 │       async function hasSideEffects(path: string): Promise<boolean | undefined> {
671 ▶         if (!pluginOptions.advancedOptimizations) {
672 ▶           return undefined;
673 │         }
674 │ 
675 ▶         const { sideEffects } = await build.resolve(path, {
676 │           kind: 'import-statement',
677 │           resolveDir: build.initialOptions.absWorkingDir ?? '',
678 │         });
679 │ 
680 ▶         return sideEffects;
681 │       }
```

559 行目、`.js` / `.cjs` / `.mjs` はすべてこの `onLoad` を通ります。572 行目でファイルを読んで変換し、573 行目、JIT モードのときだけリンクを飛ばします。コンパイラが出した `.ts` の結果も、別の `onLoad` から `transformData` で同じ変換に入ります（`skipLinker: true`。[application builder の章](../boot/04-boot-application-build.md)の `onLoad`）。

574 行目の `sideEffects` は「そのファイルに副作用があるか」を**あとで**聞くための関数です。675 行目、esbuild にそのパスを解決させ、結果の `sideEffects`（そのファイルが属するパッケージの `package.json` の `"sideEffects"` 欄から esbuild が判定した値）を返します。`@angular/core` や `@angular/router` の `package.json` は `"sideEffects": false` なので、ここが `false` になります。

## 2. ワーカーに送る前の判定

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L19–36 （▶ の行: 19–21, 23–25, 32）

```ts
19 ▶ const ADVANCED_OPTIMIZATION_TOKENS = [
20 ▶   'ɵ',
21 ▶   'InjectionToken',
22 │   'INJECTOR_KEY',
23 ▶   'ctorParameters',
24 ▶   'decorators',
25 ▶   'propDecorators',
26 │ ] as const;
27 │ 
28 │ const ADVANCED_OPTIMIZATION_TOKEN_BYTES = ADVANCED_OPTIMIZATION_TOKENS.map((token) =>
29 │   Buffer.from(token, 'utf-8'),
30 │ );
31 │ 
32 ▶ const DECORATOR_TOKENS = ['__decorate', '__esDecorate'] as const;
33 │ const DECORATOR_TOKEN_BYTES = DECORATOR_TOKENS.map((token) => Buffer.from(token, 'utf-8'));
34 │ 
35 │ const ADVANCED_OPTIMIZATION_REGEX = new RegExp(ADVANCED_OPTIMIZATION_TOKENS.join('|'));
36 │ const DECORATOR_REGEX = new RegExp(DECORATOR_TOKENS.join('|'));
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L47–64 （▶ の行: 53–54, 58–59, 63）

```ts
47 │ async function hasAdvancedOptimizationCandidates(
48 │   filename: string,
49 │   data: string | Uint8Array,
50 │   sideEffects?: () => Promise<boolean | undefined>,
51 │ ): Promise<boolean> {
52 │   // Side-effect-free @angular/ packages undergo top-level pure function annotations
53 ▶   if (/[\\/]node_modules[\\/]@angular[\\/]/.test(filename) && (await sideEffects?.()) === false) {
54 ▶     return true;
55 │   }
56 │ 
57 │   if (typeof data === 'string') {
58 ▶     const hasDecorators = DECORATOR_REGEX.test(data);
59 ▶     if (hasDecorators && (await sideEffects?.()) === false) {
60 │       return true;
61 │     }
62 │ 
63 ▶     return ADVANCED_OPTIMIZATION_REGEX.test(data);
64 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L258–294 （▶ の行: 277–280, 284, 290, 293）

```ts
258 │   async transformData(
259 │     filename: string,
260 │     data: string | Uint8Array,
261 │     options?: TransformOptions,
262 │   ): Promise<Uint8Array> {
263 │     let resolvedSideEffects: boolean | undefined;
264 │     let sideEffectsQueried = false;
265 │ 
266 │     const sideEffectsGetter = options?.sideEffects
267 │       ? async () => {
268 │           if (!sideEffectsQueried) {
269 │             sideEffectsQueried = true;
270 │             resolvedSideEffects = await options.sideEffects?.();
271 │           }
272 │ 
273 │           return resolvedSideEffects;
274 │         }
275 │       : undefined;
276 │ 
277 ▶     const shouldLink = !options?.skipLinker && requiresLinking(filename, data);
278 ▶     const shouldOptimize =
279 ▶       this.#commonOptions.advancedOptimizations &&
280 ▶       (await hasAdvancedOptimizationCandidates(filename, data, sideEffectsGetter));
281 │ 
282 │     // Perform a quick test to determine if the data needs any transformations.
283 │     // This allows directly returning the data without the worker communication overhead.
284 ▶     if (!shouldLink && !shouldOptimize && !options?.instrumentForCoverage) {
285 │       const keepSourcemap =
286 │         this.#commonOptions.sourcemap &&
287 │         (!!this.#commonOptions.thirdPartySourcemaps || !/[\\/]node_modules[\\/]/.test(filename));
288 │ 
289 │       if (typeof data === 'string') {
290 ▶         return Buffer.from(keepSourcemap ? data : removeSourceMappingURL(data), 'utf-8');
291 │       }
292 │ 
293 ▶       return keepSourcemap ? data : removeSourceMappingURL(data);
294 │     }
```

1. **277 行目：リンクが要るか**

   `requiresLinking` は中身に `ɵɵngDeclare` という文字列があるかだけを見ます（[第 6 回](06-cli-linker.md)）。
2. **278〜280 行目：変換の候補があるか**

   候補の判定は文字列の検索です。53 行目、副作用の無い `@angular/` のパッケージは無条件に候補（5 節の、すべての呼び出しに純粋の印を付ける対象）。それ以外は、63 行目で 19〜26 行目の語（`ɵ`・`InjectionToken`・`decorators` など）のどれかを含むかで決めます。`ɵ` を含まないふつうのライブラリ（lodash など）は、ここで候補から外れます。
3. **284〜294 行目：どちらも無ければ素通し**

   ワーカーとのやり取りを省き、元のバイト列を返します。ソースマップを使わない設定なら、末尾の `//# sourceMappingURL` だけを消します。

## 3. キャッシュと Piscina のワーカー

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L296–316 （▶ の行: 300, 302, 304–305, 309, 311）

```ts
296 │     let cacheKey: string | undefined;
297 │     if (this.cache) {
298 │       // Create a cache key from the file data and options that affect the output.
299 │       // NOTE: If additional options are added, this may need to be updated.
300 ▶       const hasher = createContentHash();
301 │       hasher.update(
302 ▶         `${!options?.skipLinker}--${resolvedSideEffects === false}--${!!options?.instrumentForCoverage}`,
303 │       );
304 ▶       hasher.update(data);
305 ▶       hasher.update(this.#fileCacheKeyBase);
306 │       cacheKey = hasher.digest();
307 │ 
308 │       try {
309 ▶         const cached = await this.cache.get(cacheKey);
310 │         if (cached !== undefined) {
311 ▶           return cached;
312 │         }
313 │       } catch {
314 │         // Failure to get the value should not fail the transform
315 │       }
316 │     }
```

鍵は「リンクするか・副作用が無いか・カバレッジ計測か」の 3 つの旗（302 行目）と、ファイルの中身（304 行目）と、全ファイル共通の設定（305 行目）のハッシュです。ファイル名は入りません。中身が同じなら、別のプロジェクトでも同じ結果を引けます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L161–183 （▶ の行: 167, 175, 181–182）

```ts
161 │   constructor(
162 │     options: JavaScriptTransformerOptions,
163 │     readonly maxThreads: number,
164 │     private readonly cache?: Cache<Uint8Array>,
165 │   ) {
166 │     // Maintain 2 active tasks per worker thread to keep transformation pipelines fully saturated
167 ▶     this.#maxConcurrent = Math.max(1, maxThreads * 2);
168 │     // Extract options to ensure only the named options are serialized and sent to the worker
169 │     const {
170 │       sourcemap,
171 │       thirdPartySourcemaps = false,
172 │       advancedOptimizations = false,
173 │       jit = false,
174 │     } = options;
175 ▶     this.#commonOptions = {
176 │       sourcemap,
177 │       thirdPartySourcemaps,
178 │       advancedOptimizations,
179 │       jit,
180 │     };
181 ▶     this.#fileCacheKeyBase = Buffer.from(JSON.stringify(this.#commonOptions), 'utf-8');
182 ▶     this.#workerPool = this.#ensureWorkerPool();
183 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L212–233 （▶ の行: 218–221, 225, 230）

```ts
212 │   #ensureWorkerPool(): WorkerPool {
213 │     if (this.#workerPool) {
214 │       return this.#workerPool;
215 │     }
216 │ 
217 │     const workerPoolOptions: WorkerPoolOptions = {
218 ▶       filename: require.resolve('./javascript-transformer-worker'),
219 ▶       maxThreads: this.maxThreads,
220 ▶       minThreads: this.maxThreads,
221 ▶       workerData: this.#commonOptions,
222 │     };
223 │ 
224 │     // Prevent passing SSR `--import` (loader-hooks) from parent to child worker.
225 ▶     const filteredExecArgv = process.execArgv.filter((v) => v !== IMPORT_EXEC_ARGV);
226 │     if (process.execArgv.length !== filteredExecArgv.length) {
227 │       workerPoolOptions.execArgv = filteredExecArgv;
228 │     }
229 │ 
230 ▶     this.#workerPool = new WorkerPool(workerPoolOptions);
231 │ 
232 │     return this.#workerPool;
233 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L318–340 （▶ の行: 322, 329, 333–334, 338）

```ts
318 │     // Only standalone (non-pooled) ArrayBuffers can be transferred across worker threads.
319 │     // Node.js shares an internal 8KB ArrayBuffer pool for small buffers, and transferring
320 │     // a pooled buffer will throw a DataCloneError because detaching it invalidates other slices.
321 │     // In addition, SharedArrayBuffers cannot be transferred, and Yarn PnP has deserialization issues.
322 ▶     const isTransferable =
323 │       typeof data !== 'string' &&
324 │       data.buffer instanceof ArrayBuffer &&
325 │       data.byteOffset === 0 &&
326 │       data.byteLength === data.buffer.byteLength &&
327 │       !process.versions.pnp;
328 │ 
329 ▶     const result = (await this.#ensureWorkerPool().run(
330 │       {
331 │         filename,
332 │         data,
333 ▶         skipLinker: !shouldLink,
334 ▶         sideEffects: resolvedSideEffects,
335 │         instrumentForCoverage: options?.instrumentForCoverage,
336 │       },
337 │       {
338 ▶         transferList: isTransferable ? [data.buffer] : undefined,
339 │       },
340 │     )) as Uint8Array;
```

ワーカーは Piscina（Node の `worker_threads` のスレッドプール）で、219〜220 行目のとおり最初から最大数を起動しておきます。221 行目、共通の設定は起動時に `workerData` として 1 回だけ渡し、1 ファイルごとの依頼（329〜336 行目）にはファイル名・中身・2 つの旗だけを載せます。167 行目、同時に走らせる依頼は「スレッド数 × 2」までで、それ以上は待たせます。322〜327 行目と 338 行目、中身の `ArrayBuffer` がプールされていない単独のものなら、コピーせずに**所有権ごと**ワーカーに移します（`transferList`）。225 行目、SSR 用のローダーのフック（`--import`）はワーカーに引き継ぎません（[プリレンダーの章](../platform/06-ssr-prerender.md)で付けたもの）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer-worker.ts` L9–43 （▶ の行: 10, 14, 22, 38–39, 41–42）

```ts
 9 │ import remapping, { type DecodedSourceMap, type EncodedSourceMap } from '@ampproject/remapping';
10 ▶ import type { PluginItem } from '@babel/core';
11 │ import { createRequire } from 'node:module';
12 │ import { workerData } from 'node:worker_threads';
13 │ import Piscina from 'piscina';
14 ▶ import { useBabelLinker } from '../../utils/environment-options.js';
15 │ import {
16 │   findTrailingSourceMapComment,
17 │   isTrailingSourceMapComment,
18 │   loadInputSourceMap,
19 │   loadInputSourceMapFromUrl,
20 │   removeSourceMappingURL,
21 │ } from '../../utils/source-map';
22 ▶ import { transform as transformWithOxc } from '../oxc/oxc-transform.js';
23 │ import type { JavaScriptTransformerOptions } from './javascript-transformer';
24 │ 
25 │ interface JavaScriptTransformRequest {
26 │   filename: string;
27 │   data: string | Uint8Array;
28 │   skipLinker?: boolean;
29 │   sideEffects?: boolean;
30 │   instrumentForCoverage?: boolean;
31 │ }
32 │ 
33 │ interface TransformOptions extends Omit<JavaScriptTransformRequest, 'filename' | 'data'> {
34 │   inputSourceMap?: EncodedSourceMap;
35 │   isAlreadyStripped?: boolean;
36 │ }
37 │ 
38 ▶ const {
39 ▶   sourcemap = false,
40 │   thirdPartySourcemaps = false,
41 ▶   advancedOptimizations = false,
42 ▶   jit = false,
43 │ } = (workerData || {}) as Partial<JavaScriptTransformerOptions>;
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer-worker.ts` L222–242 （▶ の行: 223–228, 230–231, 233, 236）

```ts
222 │   // Run Oxc linking and/or advanced optimizations in a single unified AST traversal pass
223 ▶   const oxcLink = shouldLink && !useBabelLinker;
224 ▶   if (oxcLink || advancedOptimizations) {
225 ▶     const sideEffectFree = options.sideEffects === false;
226 ▶     const safeAngularPackage =
227 ▶       sideEffectFree && /[\\/]node_modules[\\/]@angular[\\/]/.test(filename);
228 ▶     const topLevelSafeMode = !safeAngularPackage;
229 │ 
230 ▶     const result = transformWithOxc(filename, code, {
231 ▶       link: oxcLink,
232 │       jit,
233 ▶       advancedOptimizations,
234 │       sourcemap: useInputSourcemap,
235 │       sideEffects: options.sideEffects,
236 ▶       topLevelSafeMode,
237 │     });
238 │     code = result.code;
239 │     if (result.map) {
240 │       maps.push(result.map);
241 │     }
242 │   }
```

📄 `angular-cli/packages/angular/build/src/utils/environment-options.ts` L201–206 （▶ の行: 206）

```ts
201 │ /**
202 │  * When `NG_BUILD_BABEL_LINKER` is enabled (`1` or `true`), the Babel-based
203 │  * Angular Linker (`@angular/compiler-cli/linker/babel`) will be used instead of the
204 │  * default OXC in-place linker.
205 │  */
206 ▶ export const useBabelLinker = parseTristate(process.env['NG_BUILD_BABEL_LINKER']) === true;
```

ワーカーの先頭（9〜23 行目）で、Babel は 10 行目の**型だけ**の import です。実行時に Babel を読むのは、206 行目の `NG_BUILD_BABEL_LINKER=1` を付けたときのリンクだけです（[第 6 回](06-cli-linker.md)）。222 行目のコメントのとおり、リンクと 4 つの変換は `transformWithOxc` の**1 回の木の走査**でまとめて行います。225〜228 行目が大事な分岐で、「`node_modules/@angular/` にあり、かつ副作用が無い」ファイルだけ `topLevelSafeMode` が偽になります。それ以外（アプリのコードや他のライブラリ）は真で、5 節の印の付け方が控えめになります。

## 4. oxc で 1 回だけ木を歩く

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform.ts` L270–299 （▶ の行: 270–274, 283, 288, 298）

```ts
270 ▶   const advancedOptimizations = options.advancedOptimizations ?? true;
271 ▶   const sideEffectFree = options.sideEffects === false;
272 ▶   const topLevelSafeMode = options.topLevelSafeMode ?? false;
273 ▶   const wrapDecorators = sideEffectFree;
274 ▶   const pureAnnotate = options.pureAnnotate ?? true;
275 │ 
276 │   /**
277 │    * Scans backwards from the specified start index to check if a pure comment (e.g. `/*@__PURE__*\/`)
278 │    * already precedes the node.
279 │    *
280 │    * @param start The index where the node starts.
281 │    * @returns True if a pure comment is already present; otherwise, false.
282 │    */
283 ▶   function hasPureComment(start: number): boolean {
284 │     let i = start - 1;
285 │     while (i >= 0 && /\s/.test(code[i])) {
286 │       i--;
287 │     }
288 ▶     if (i < 1 || code[i] !== '/' || code[i - 1] !== '*') {
289 │       return false;
290 │     }
291 │     const commentEnd = i + 1;
292 │     const commentStart = code.lastIndexOf('/*', commentEnd);
293 │     if (commentStart === -1) {
294 │       return false;
295 │     }
296 │     const commentContent = code.substring(commentStart + 2, commentEnd - 2);
297 │ 
298 ▶     return commentContent.includes('@__PURE__') || commentContent.includes('#__PURE__');
299 │   }
```

`transform` は最初に `parseSync` で木を作り、`MagicString`（元の文字列の位置を保ったまま挿入・削除・移動ができ、ソースマップも作れる文字列）を用意します。木は読むだけで、書き換えはすべて文字列の位置に対して行います。273 行目、デコレーター（`__decorate`）まで包んでよいのは副作用の無いパッケージだけです。283〜299 行目の `hasPureComment` は、節点の直前にすでに `@__PURE__` か `#__PURE__` の注釈があるかを、空白を飛ばして後ろ向きに調べます。二重に付けないためです。

📄 `angular-cli/packages/angular/build/src/tools/oxc/traversal.ts` L317–353 （▶ の行: 322–323, 328–329, 334–337, 342–343, 345–346, 352）

```ts
317 │   while (stack.length > 0) {
318 │     const current = stack.pop();
319 │     if (current === undefined) {
320 │       break;
321 │     }
322 ▶     if (current === null) {
323 ▶       const node = stack.pop();
324 │       if (!node) {
325 │         continue;
326 │       }
327 │       const type = node.type;
328 ▶       if (isFunction(type)) {
329 ▶         functionDepth--;
330 │         functionStack.pop();
331 │       } else if (isClass(type)) {
332 │         classDepth--;
333 │       }
334 ▶       visit(node, {
335 ▶         functionDepth,
336 ▶         classDepth,
337 ▶         parentFunc: functionStack[functionStack.length - 1],
338 │       });
339 │       continue;
340 │     }
341 │ 
342 ▶     stack.push(current);
343 ▶     stack.push(null);
344 │     const type = current.type;
345 ▶     if (isFunction(type)) {
346 ▶       functionDepth++;
347 │       functionStack.push(current);
348 │     } else if (isClass(type)) {
349 │       classDepth++;
350 │     }
351 │ 
352 ▶     pushChildNodes(current, stack);
353 │   }
```

1. **342〜343 行目：自分を積み、目印の null を積む**

   再帰を使わず、配列を積み木（スタック）として使います。自分のあとに `null` を積み、352 行目でその上に子を積みます。
2. **345〜346 行目：関数に入ったら深さを足す**

   関数とクラスの中にいるかを、深さの数で覚えます。
3. **322〜338 行目：null が出たら、自分を訪問**

   子をすべて取り出したあとに `null` が出るので、その下の自分を取り出して訪問します。つまり**子が先、親が後**（後順）。328〜329 行目で深さを戻してから訪問するので、関数の節点そのものは外側の深さで訪問されます。

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform.ts` L629–637 （▶ の行: 631–632, 634–635）

```ts
629 │   traversePostOrder(program, (node, { functionDepth, classDepth, parentFunc }) => {
630 │     switch (node.type) {
631 ▶       case 'Program':
632 ▶       case 'BlockStatement':
633 │         if (advancedOptimizations) {
634 ▶           adjustTypeScriptEnumsInStatements(node.body);
635 ▶           adjustStaticMembersInStatements(node.body);
636 │         }
637 │         break;
```

訪問する関数は節点の種類で分けます。文の並び（`Program` とブロック）では enum と static の変換（634〜635 行目）を、呼び出し式と `new` 式では印とメタデータの変換をします。後順なので、外側の文の並びを見る時点で、内側の書き換えは終わっています。

## 5. 純粋の印（pure-toplevel-functions）

esbuild の木の揺さぶり（tree shaking：使われていないコードを出力から落とすこと）は、**落としても動きが変わらない**と言える文だけを落とします。トップレベルの `foo()` は、戻り値が使われていなくても、中で何をするか分からないので残ります。`/*#__PURE__*/ foo()` と注釈を付けると「戻り値が使われなければ、この呼び出しは消してよい」と伝えたことになります。

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform.ts` L682–706 （▶ の行: 683, 689–690, 696–697, 702–703）

```ts
682 │         // 2. Mark Top-Level Pure Functions check
683 ▶         if (!pureAnnotate || functionDepth > 0 || classDepth > 0 || topLevelSafeMode) {
684 │           return;
685 │         }
686 │ 
687 │         const callee = unwrapParentheses(node.callee);
688 │         if (
689 ▶           (callee.type === 'FunctionExpression' || callee.type === 'ArrowFunctionExpression') &&
690 ▶           node.arguments.length !== 0
691 │         ) {
692 │           return;
693 │         }
694 │ 
695 │         if (
696 ▶           callee.type === 'Identifier' &&
697 ▶           (isTslibHelperName(callee.name) || isBabelHelperName(callee.name))
698 │         ) {
699 │           return;
700 │         }
701 │ 
702 ▶         if (!hasPureComment(node.start)) {
703 ▶           source.appendLeft(node.start, '/*#__PURE__*/ ');
704 │         }
705 │         break;
706 │       }
```

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform.ts` L708–734 （▶ の行: 712–713, 719–721, 728, 730）

```ts
708 │       case 'NewExpression': {
709 │         if (
710 │           !advancedOptimizations ||
711 │           !pureAnnotate ||
712 ▶           functionDepth > 0 ||
713 ▶           classDepth > 0 ||
714 │           isAlreadyEdited(node.start, node.end)
715 │         ) {
716 │           return;
717 │         }
718 │ 
719 ▶         if (!topLevelSafeMode) {
720 ▶           if (!hasPureComment(node.start)) {
721 ▶             source.appendLeft(node.start, '/*#__PURE__*/ ');
722 │           }
723 │ 
724 │           return;
725 │         }
726 │ 
727 │         const newCallee = node.callee;
728 ▶         if (newCallee.type === 'Identifier' && sideEffectFreeConstructors.has(newCallee.name)) {
729 │           if (!hasPureComment(node.start)) {
730 ▶             source.appendLeft(node.start, '/*#__PURE__*/ ');
731 │           }
732 │         }
733 │         break;
734 │       }
```

1. **683 行目：トップレベルだけ、そして安全なパッケージだけ**

   関数の中・クラスの中は対象外（関数の中は呼ばれるまで実行されないので、印は要らない）。`topLevelSafeMode` が真なら、呼び出しには印を付けません。
2. **689〜690 行目：引数のある即時実行関数には付けない**

   `(function () {…})()` には付けますが、`(function (x) {…})(abc)` には付けません。
3. **696〜697 行目：TypeScript と Babel の補助関数には付けない**

   `__decorate` などは、クラスを書き換える副作用そのものが目的だからです。
4. **719〜731 行目：new 式**

   安全なパッケージなら全部の `new` に、そうでなければ `new InjectionToken(...)` にだけ印を付けます。`InjectionToken` のコンストラクタは値を覚えるだけで、外に影響しないからです。

📄 `angular-cli/packages/angular/build/src/tools/oxc/pure-toplevel-functions_oxc_spec.ts` L48–62 （▶ の行: 51–52, 59–60）

```ts
48 │   it(
49 │     'annotates top-level new expressions',
50 │     testCase({
51 ▶       input: 'var result = new SomeClass();',
52 ▶       expected: 'var result = /*#__PURE__*/ new SomeClass();',
53 │     }),
54 │   );
55 │ 
56 │   it(
57 │     'annotates top-level function calls',
58 │     testCase({
59 ▶       input: 'var result = someCall();',
60 ▶       expected: 'var result = /*#__PURE__*/ someCall();',
61 │     }),
62 │   );
```

📄 `angular-cli/packages/angular/build/src/tools/oxc/pure-toplevel-functions_oxc_spec.ts` L174–200 （▶ の行: 178–179, 187–188, 196–197）

```ts
174 │   describe('topLevelSafeMode: true', () => {
175 │     it(
176 │       'annotates top-level `new InjectionToken` expressions',
177 │       testCase({
178 ▶         input: `const result = new InjectionToken('abc');`,
179 ▶         expected: `const result = /*#__PURE__*/ new InjectionToken('abc');`,
180 │         options: { topLevelSafeMode: true },
181 │       }),
182 │     );
183 │ 
184 │     it(
185 │       'does not annotate other top-level `new` expressions',
186 │       testCase({
187 ▶         input: 'const result = new SomeClass();',
188 ▶         expected: 'const result = new SomeClass();',
189 │         options: { topLevelSafeMode: true },
190 │       }),
191 │     );
192 │ 
193 │     it(
194 │       'does not annotate top-level function calls',
195 │       testCase({
196 ▶         input: 'const result = someCall();',
197 ▶         expected: 'const result = someCall();',
198 │         options: { topLevelSafeMode: true },
199 │       }),
200 │     );
```

spec は入力（`input`）と期待する出力（`expected`）の対です。51〜52 行目と 59〜60 行目が安全なパッケージ（`@angular/*`）での動き、178〜197 行目が `topLevelSafeMode: true`（アプリのコードや他のライブラリ）での動きです。

## 6. static の包み込み（adjust-static-class-members）

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform.ts` L90–127 （▶ の行: 93–96, 100, 107–108, 117–118, 121, 124）

```ts
 90 │ /**
 91 │  * A set of Angular static properties that should be wrapped in pure IIFE statements.
 92 │  */
 93 ▶ const angularStaticsToWrap = new Set([
 94 ▶   'ɵcmp',
 95 ▶   'ɵdir',
 96 ▶   'ɵfac',
 97 │   'ɵinj',
 98 │   'ɵmod',
 99 │   'ɵpipe',
100 ▶   'ɵprov',
101 │   'INJECTOR_KEY',
102 │ ]);
103 │ 
104 │ /**
105 │  * A set of Angular metadata decorator functions that can be elided.
106 │  */
107 ▶ const angularMetadataFunctions = new Set([
108 ▶   'ɵsetClassMetadata',
109 │   'ɵsetClassMetadataAsync',
110 │   'ɵsetClassDebugInfo',
111 │ ]);
112 │ 
113 │ /**
114 │  * A map of static properties and their matcher predicate functions to check if they
115 │  * can be safely elided from class declarations.
116 │  */
117 ▶ const angularStaticsToElide: Record<string, (node: Node) => boolean> = {
118 ▶   'ctorParameters'(node) {
119 │     return node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
120 │   },
121 ▶   'decorators'(node) {
122 │     return node.type === 'ArrayExpression';
123 │   },
124 ▶   'propDecorators'(node) {
125 │     return node.type === 'ObjectExpression';
126 │   },
127 │ };
```

Angular のクラスは `static ɵcmp = ɵɵdefineComponent(...)` のような静的な初期化子を持ちます。クラスの宣言は、static の初期化子が関数呼び出しだと**宣言そのものに副作用がある**扱いになり、そのクラスが使われていなくても esbuild は消せません。そこで、クラスと static の代入を純粋な即時実行関数（IIFE）で包み、「この IIFE の戻り値が使われなければ全部消してよい」という形にします。93〜102 行目は、中身を見ずに包んでよい Angular の static の名前です。

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform.ts` L552–581 （▶ の行: 555–560, 565, 568–570, 579–581）

```ts
552 │         const propertyName = left.property.name;
553 │         const assignmentValue = nextExpression.right;
554 │ 
555 ▶         if (angularStaticsToElide[propertyName]?.(assignmentValue)) {
556 ▶           wrapStatementPaths.push({ statement: nextStatement, type: 'elide' });
557 ▶         } else if (canWrapProperty(propertyName, assignmentValue, code)) {
558 ▶           wrapStatementPaths.push({ statement: nextStatement, type: 'wrap' });
559 ▶         } else {
560 ▶           hasPotentialSideEffects = true;
561 │         }
562 │       }
563 │ 
564 │       // Check class body static properties
565 ▶       const shouldWrapClassStaticProperties = analyzeClassStaticProperties(classNode, code);
566 │ 
567 │       // Perform elisions immediately
568 ▶       for (const item of wrapStatementPaths) {
569 ▶         if (item.type === 'elide') {
570 ▶           source.remove(item.statement.start, item.statement.end);
571 │           markEdited(item.statement.start, item.statement.end);
572 │         }
573 │       }
574 │ 
575 │       const activeWrapPaths = wrapStatementPaths.filter(
576 │         (p) => p.type === 'wrap' || p.type === 'decorate',
577 │       );
578 │ 
579 ▶       if (
580 ▶         !hasPotentialSideEffects &&
581 ▶         (activeWrapPaths.length > 0 || shouldWrapClassStaticProperties)
```

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform.ts` L610–619 （▶ の行: 612–613, 619）

```ts
610 │         } else {
611 │           // Standard ClassDeclaration
612 ▶           source.appendRight(classNode.start, `let ${classIdName} = /*#__PURE__*/ (() => {\n`);
613 ▶           source.appendLeft(lastStatement.end, `\nreturn ${classIdName};\n})();`);
614 │         }
615 │ 
616 │         markEdited(statement.start, lastStatement.end);
617 │ 
618 │         // Fast-forward outer loop index to skip the statements we wrapped
619 ▶         i += wrapStatementPaths.length;
```

1. **クラスの直後の代入文を 1 つずつ見る**

   `Cls.ɵfac = …` のようにクラスの外に書かれた代入（古い形の出力）を順に見ます。555〜556 行目、`ctorParameters`・`decorators`・`propDecorators`（117〜127 行目。古いデコレーターの書き換え結果で、JIT 用の情報）は消す候補。557〜558 行目、包んでよいもの（Angular の static か、注釈付きか、値が純粋）は包む候補。559〜560 行目、それ以外があれば**包むのをやめます**。
2. **565 行目：クラスの本体の static も調べる**

   ES2022 の `static ɵcmp = …` のようにクラスの中に書かれた形（いまの Angular の出力）も、同じ規則で判定します。
3. **568〜573 行目：消す候補は先に消す**
4. **579〜581・612〜613 行目：包む**

   副作用が無く、包むものがあれば、`let Cls = /*#__PURE__*/ (() => { class Cls {…} …; return Cls; })();` にします。619 行目、包んだ文は外側の走査で飛ばします。

📄 `angular-cli/packages/angular/build/src/tools/oxc/adjust-static-class-members_oxc_spec.ts` L900–934 （▶ の行: 905–907, 913, 930–931）

```ts
900 │   it(
901 │     'wraps class with multiple Angular native static fields',
902 │     testCase({
903 │       input: `
904 │         class CommonModule {
905 ▶           static ɵfac = function CommonModule_Factory(t) { return new (t || CommonModule)(); };
906 ▶           static ɵmod = /*@__PURE__*/ ɵngcc0.ɵɵdefineNgModule({ type: CommonModule });
907 ▶           static ɵinj = ɵngcc0.ɵɵdefineInjector({ providers: [
908 │             { provide: NgLocalization, useClass: NgLocaleLocalization },
909 │         ] });
910 │         }
911 │       `,
912 │       expected: `
913 ▶         let CommonModule = /*#__PURE__*/ (() => {
914 │           class CommonModule {
915 │             static ɵfac = function CommonModule_Factory(t) {
916 │               return new (t || CommonModule)();
917 │             };
918 │             static ɵmod = /*@__PURE__*/ ɵngcc0.ɵɵdefineNgModule({
919 │               type: CommonModule,
920 │             });
921 │             static ɵinj = ɵngcc0.ɵɵdefineInjector({
922 │               providers: [
923 │                 {
924 │                   provide: NgLocalization,
925 │                   useClass: NgLocaleLocalization,
926 │                 },
927 │               ],
928 │             });
929 │           }
930 ▶           return CommonModule;
931 ▶         })();
932 │       `,
933 │     }),
934 │   );
```

## 7. enum の包み込み（adjust-typescript-enums）

📄 `angular-cli/packages/angular/build/src/tools/oxc/adjust-typescript-enums_oxc_spec.ts` L37–55 （▶ の行: 41–42, 45, 48, 51–52）

```ts
37 │   it(
38 │     'wraps unexported TypeScript enums',
39 │     testCase({
40 │       input: `
41 ▶         var ChangeDetectionStrategy;
42 ▶         (function (ChangeDetectionStrategy) {
43 │             ChangeDetectionStrategy[ChangeDetectionStrategy["OnPush"] = 0] = "OnPush";
44 │             ChangeDetectionStrategy[ChangeDetectionStrategy["Default"] = 1] = "Default";
45 ▶         })(ChangeDetectionStrategy || (ChangeDetectionStrategy = {}));
46 │       `,
47 │       expected: `
48 ▶         var ChangeDetectionStrategy = /*#__PURE__*/ (function (ChangeDetectionStrategy) {
49 │           ChangeDetectionStrategy[(ChangeDetectionStrategy["OnPush"] = 0)] = "OnPush";
50 │           ChangeDetectionStrategy[(ChangeDetectionStrategy["Default"] = 1)] = "Default";
51 ▶           return ChangeDetectionStrategy;
52 ▶         })(ChangeDetectionStrategy || {});
53 │       `,
54 │     }),
55 │   );
```

TypeScript の `enum` は、41〜45 行目の 2 つの文になります。2 つ目は「`ChangeDetectionStrategy` に値を書き込む関数の呼び出し」なので副作用があり、enum が使われなくても残ります。48〜52 行目のように、1 つの `var` の初期化子（印付きの IIFE）にまとめれば、使われない enum は丸ごと消せます。

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform.ts` L415–443 （▶ の行: 415, 420–421, 425, 436, 441–442）

```ts
415 ▶       if (!allPure || !hasElements) {
416 │         continue;
417 │       }
418 │ 
419 │       // 1. Remove leading/trailing characters/parentheses of the expression statement
420 ▶       source.remove(nextStatement.start, nextExpr.start);
421 ▶       source.remove(nextExpr.end, nextStatement.end);
422 │       markEdited(nextStatement.start, nextStatement.end);
423 │ 
424 │       // 2. Add return statement inside IIFE body
425 ▶       source.appendRight(callee.body.end - 1, `; return ${paramName};`);
426 │ 
427 │       // 3. Remove `Name = ` assignment in arguments if it's a simple identifier
428 │       if (rightCallArgument.left.type === 'Identifier') {
429 │         let replacement = code.substring(
430 │           rightCallArgument.right.start,
431 │           rightCallArgument.right.end,
432 │         );
433 │         if (unwrapParentheses(rightCallArgument.right).type === 'AssignmentExpression') {
434 │           replacement = `(${replacement})`;
435 │         }
436 ▶         source.overwrite(arg.right.start, arg.right.end, replacement);
437 │         markEdited(arg.right.start, arg.right.end);
438 │       }
439 │ 
440 │       // 4. Move IIFE to the var initializer
441 ▶       source.move(nextExpr.start, nextExpr.end, decl.id.end);
442 ▶       source.appendLeft(decl.id.end, ' = /*#__PURE__*/ ');
443 │     }
```

この引用の手前（同じ関数の前半）で「`var X;` の直後に、引数 1 つの関数の呼び出し `(function (X) {…})(X || (X = {}))` があり、本体が純粋な代入だけ」であることを確かめます。そのうえで、420〜421 行目で呼び出しの外側の括弧と `;` を消し、425 行目で本体の最後に `return X;` を足し、436 行目で引数の `X = {}` を `{}` にし、441〜442 行目で呼び出し全体を `var X` の後ろへ **移動**して `= /*#__PURE__*/` を挟みます。`MagicString` の `move` なので、元の文字列を作り直さずに済みます。

## 8. メタデータの削除（elide-angular-metadata）

📄 `angular/packages/compiler/src/render3/r3_class_metadata_compiler.ts` L45–60 （▶ の行: 47, 53, 56–58）

```ts
45 │ export function compileClassMetadata(metadata: R3ClassMetadata): o.InvokeFunctionExpr {
46 │   const fnCall = internalCompileClassMetadata(metadata);
47 ▶   return o.arrowFn([], [devOnlyGuardedExpression(fnCall).toStmt()]).callFn([]);
48 │ }
49 │ 
50 │ /** Compiles only the `setClassMetadata` call without any additional wrappers. */
51 │ function internalCompileClassMetadata(metadata: R3ClassMetadata): o.InvokeFunctionExpr {
52 │   return o
53 ▶     .importExpr(R3.setClassMetadata)
54 │     .callFn([
55 │       metadata.type,
56 ▶       metadata.decorators,
57 ▶       metadata.ctorParameters ?? o.literal(null),
58 ▶       metadata.propDecorators ?? o.literal(null),
59 │     ]);
60 │ }
```

コンパイラは各クラスの後ろに `ɵsetClassMetadata(Cls, decorators, ctorParameters, propDecorators)` を出力します。デコレーターの引数を実行時に残すのは、テストの `TestBed.overrideComponent` などで JIT のコンパイルをやり直すときに使うためで、本番では不要です。47 行目、この呼び出しは引数無しのアロー関数の中に入り、`ngDevMode` の判定で守られます。

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform.ts` L654–680 （▶ の行: 660–661, 666, 669, 671–673, 675）

```ts
654 │         if (!advancedOptimizations) {
655 │           return;
656 │         }
657 │ 
658 │         // 1. Elide Angular Metadata check
659 │         let calleeName: string | undefined;
660 ▶         if (node.callee.type === 'Identifier') {
661 ▶           calleeName = node.callee.name;
662 │         } else if (
663 │           node.callee.type === 'MemberExpression' &&
664 │           node.callee.property.type === 'Identifier'
665 │         ) {
666 ▶           calleeName = node.callee.property.name;
667 │         }
668 │ 
669 ▶         if (calleeName && angularMetadataFunctions.has(calleeName)) {
670 │           if (
671 ▶             parentFunc &&
672 ▶             (parentFunc.type === 'FunctionExpression' ||
673 ▶               parentFunc.type === 'ArrowFunctionExpression')
674 │           ) {
675 ▶             source.overwrite(node.start, node.end, 'void 0');
676 │             markEdited(node.start, node.end);
677 │ 
678 │             return;
679 │           }
680 │         }
```

📄 `angular-cli/packages/angular/build/src/tools/oxc/elide-angular-metadata_oxc_spec.ts` L42–63 （▶ の行: 48, 60）

```ts
42 │   it(
43 │     'elides pure annotated ɵsetClassMetadata',
44 │     testCase({
45 │       input: `
46 │         import { Component } from '@angular/core';
47 │         export class SomeClass {}
48 ▶         /*@__PURE__*/ (function () { i0.ɵsetClassMetadata(Clazz, [{
49 │             type: Component,
50 │             args: [{
51 │                     selector: 'app-lazy',
52 │                     template: 'very lazy',
53 │                     styles: []
54 │                 }]
55 │         }], null, null); })();
56 │       `,
57 │       expected: `
58 │         import { Component } from '@angular/core';
59 │         export class SomeClass {}
60 ▶         /*@__PURE__*/ (function () { void 0 })();
61 │       `,
62 │     }),
63 │   );
```

660〜667 行目、呼び出し先の名前を取り出し（`i0.ɵsetClassMetadata` なら `ɵsetClassMetadata`）、669 行目で 107〜111 行目の 3 つの名前と比べます。671〜674 行目、関数の中にあるときだけ、675 行目で呼び出しを `void 0` に置き換えます。48 行目の長い呼び出しが 60 行目の `void 0` になり、デコレーターの引数として参照していたもの（`Component` や `imports` のクラス）への参照も一緒に消えます。

> [!NOTE]
> **さらに深く**
>
> 本番では `ngDevMode` が `false` に置き換わるので（[ブラウザが読む章](../boot/06-boot-browser-load.md)の `define`）、いまのコンパイラが出す 47 行目の形は esbuild の定数の畳み込みだけでも消えます。oxc の削除は、それより前の段階で確実に消す二重の手当てで、spec の 48 行目のように判定で守られていない古い形の出力（ライブラリ）にも効きます。

## 9. esbuild がまとめて落とす

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L639–648 （▶ の行: 645–648）

```ts
639 │     legalComments: options.extractLicenses
640 │       ? 'none'
641 │       : optimizationOptions.scripts
642 │         ? 'eof'
643 │         : 'inline',
644 │     logLevel: options.verbose && !jsonLogs ? 'debug' : 'silent',
645 ▶     minifyIdentifiers: optimizationOptions.scripts && allowMangle,
646 ▶     minifySyntax: optimizationOptions.scripts,
647 ▶     minifyWhitespace: optimizationOptions.scripts,
648 ▶     pure: ['forwardRef'],
```

書き換えたコードを esbuild が束ね、645〜647 行目で minify します。648 行目、`forwardRef(...)` の呼び出しは、注釈が無くても純粋として扱わせます。印・IIFE・`void 0` は esbuild への**伝言**で、出力に残す目的のものではありません。このサイトの本番の出力には、コードとしての `@__PURE__` 注釈は 1 つも残っていません（下のデモ）。

> **🧪 DEMO — このサイトの本番の JS を数える**
>
> ボタンを押すと、このページを開くのに読んだ JS（`<script type=module>`・`modulepreload`・`performance` の記録にある同じオリジンの `.js`）を取得して、文字列を数えます。本番ビルド（`outputMode: "static"`）で配っているサイトで試してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cli-javascript-transformer)

## 呼び出しの連なり

- `build.onLoad({ filter: /\.[cm]?js$/ })` — tools/esbuild/angular/compiler-plugin.ts L558
  - `JavaScriptTransformer.transformFile() → transformData()` — tools/esbuild/javascript-transformer.ts L242, L258
    - `requiresLinking() / hasAdvancedOptimizationCandidates()` — javascript-transformer.ts L95, L47 — *どちらも偽なら素通し*
    - `WorkerPool.run({ filename, data, skipLinker, sideEffects })` — javascript-transformer.ts L329
      - `transformJavaScript() → transformJavaScriptImpl()` — javascript-transformer-worker.ts L102, L163
        - `transformWithOxc(filename, code, { link, advancedOptimizations, topLevelSafeMode })` — tools/oxc/oxc-transform.ts L263
          - `parseSync() → traversePostOrder()` — oxc-transform.ts L264 / traversal.ts L308
            - `adjustTypeScriptEnumsInStatements / adjustStaticMembersInStatements` — oxc-transform.ts L330, L452
            - `CallExpression: void 0 / /*#__PURE__*/` — oxc-transform.ts L639
- `esbuild: tree shaking + minify` — tools/esbuild/application-code-bundle.ts L645

## 聞かれそうな質問

**Q. なぜ Babel から oxc に替えたのですか？**

速さです。この 4 つの変換を oxc に移したコミット（10dc30f9c6「migrate advanced optimization Babel plugins to oxc-parser + magic-string」）の説明は「単一の、非常に速い `oxc-transform` の 1 パスに移す」「通常の最適化ビルドでは Babel を完全に飛ばす」です。以前は Babel のプラグインとして実装されていて、Babel の木（ノードを書き換え、最後にコードを再生成する）の上で動いていました。いまは 4 節のとおり、Rust のパーサーで 1 回木を作り、1 回の後順の走査で全部の判定をし、`MagicString` で元の文字列を部分的に書き換えるだけです。コードの再生成をしません。

**Q. esbuild だけでは足りないのですか？**

esbuild は注釈と `package.json` の `sideEffects` を尊重しますが、「この static の初期化子は Angular の定義だから消しても安全」「この IIFE は TypeScript の enum だ」という**Angular と TypeScript の出力の形の知識**は持っていません。6 節 93〜102 行目の名前の表や、7 節の enum の形の照合がその知識で、それを esbuild が分かる言葉（純粋の印）に翻訳するのがこの変換です。

**Q. package.json の sideEffects は、どこで効いていますか？**

2 か所です。esbuild 自身は、`"sideEffects": false` のパッケージのファイルを「何も使われていなければ import ごと消してよい」と扱います。加えて、この変換では 1 節 675 行目でその値を引き、3 節 225〜228 行目で `@angular/` かつ副作用なしのときだけ `topLevelSafeMode` を外して、トップレベルの全呼び出しに印を付けます。ほかのパッケージには、`"sideEffects": false` を書いていても全部の呼び出しへの印は付きません（デコレーターの包み込みだけは 4 節 273 行目のとおり付く）。全呼び出しへの印は、Angular が自分のパッケージのトップレベルが安全だと分かっているから使える強い仮定だからです。

**Q. 開発ビルドでもこの変換は走りますか？**

4 つの変換は走りません。1 節 466 行目の `advancedOptimizations` は本番の最適化のときだけ真で、2 節 278〜280 行目で候補の判定が最初から偽になります。開発ビルドでワーカーに行くのは、リンクが要るファイル（277 行目）とカバレッジ計測のときだけです。

**Q. 変換を Babel に戻す方法はありますか？**

4 つの変換については、この版には Babel の実装が残っていません（`tools/babel` のディレクトリは無い）。戻せるのはリンカーだけで、206 行目の `NG_BUILD_BABEL_LINKER=1` です（[第 6 回](06-cli-linker.md)）。

## 読み終えて

- `.js` / `.mjs` とコンパイラの出力は、esbuild の `onLoad` から `JavaScriptTransformer` に入り、文字列の検索で必要なものだけが Piscina のワーカーに送られる。
- ワーカーは oxc で 1 回だけ木を作り、後順の 1 回の走査で、リンクと 4 つの変換を `MagicString` の部分的な書き換えとして行う。
- 純粋の印は、副作用の無い `@angular/*` ではトップレベルの全呼び出しに、それ以外では `new InjectionToken` だけに付く。
- static とクラス、enum の 2 つの文は、印付きの IIFE に包まれて「使われなければ丸ごと消せる」形になる。`ɵsetClassMetadata` は `void 0` になる。
- どれも esbuild の木の揺さぶりへの伝言で、本番の出力に印は残らない。

---

← 前: [コンポーネントのスタイル：Sass と CSS を esbuild で別に束ねる](04-cli-component-styles.md)  
次: [リンカー：部分コンパイルのライブラリを、アプリのビルドで仕上げる](06-cli-linker.md) →
