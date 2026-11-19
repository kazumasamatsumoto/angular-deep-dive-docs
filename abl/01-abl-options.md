[目次](../README.md) › [application builder の読み残し：options の正規化・結果の形・BundlerContext・キャッシュ・小さなプラグインを行で埋める](README.md) › 第 1 回 / 全 6 回

# normalizeOptions：angular.json の options がビルドの設定になるまで

> builders/application/options.ts の未読の行：ApplicationBuilderExtensions と schema に無い内部の options、normalizeOptions が fileReplacements・loader・outputMode・server・ssr・appShell・index・security を既定値と絶対パスにそろえる段、返す値、入口・外部依存・Tailwind・@angular/core の版を決める補助関数。getLocaleBaseHref は i18n の章が読んだので、記録で値だけを見る。

angular/angular-cli · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/abl-options)

---

angular.json の `build.options` に書いた値は、そのままビルドに使われるわけではありません。application builder は最初に `normalizeOptions` を呼び、パスを絶対パスにし、いくつもの書き方を 1 つの形にそろえ、組み合わせの誤りをここで投げます。この章では、その関数を上から順に読み、まだ読んでいない段（fileReplacements と loader、outputMode の検査、server・ssr・appShell、index、security、返す値、小さな補助関数）を 1 つずつ行で確かめます。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/builders/application/options.ts` と、それを呼ぶ `index.ts` の頭です。ng build が normalizeOptions の後に executeBuild に入る大きな流れは[application builder の章](../boot/04-boot-application-build.md)、i18n の段と getLocaleBaseHref は[i18n の章](../cli/09-cli-i18n.md)、outputPath・prerender・ssr の一部は[プリレンダーの章](../platform/06-ssr-prerender.md)が読んでいるので、ここでは繰り返しません。

1. **1. normalizeOptions**（この章）
2. [2. ビルドの結果の形](02-abl-results.md)
3. [3. BundlerContext と後処理の残り](03-abl-context-post.md)
4. [4. ディスクに残るキャッシュ](04-abl-cache.md)
5. [5. 小さなプラグインと検査](05-abl-plugins.md)
6. [6. spec と issue](06-abl-tests-issues.md)

> [!NOTE]
> **ポイント**
>
> 8 節のデモは、このサイトの依存の @angular/build 22.2.7 の配布物の `normalizeOptions` を Node v24.22.1 で呼んだ記録です。本文が読む 44129f66a3 との違いで記録に出るのは 1 つだけで、410 行目の誤りの文言が 22.2.7 では `"app-shell"` ではなく `"appShell"` になっています（13a7346493、2026-10-19 の綴りの直し）。

## 1. 型：外から足せる 2 つと、schema に無い内部の options

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L51–61 （▶ の行: 51–53, 55, 57–59）

```ts
51 ▶ export type NormalizedOutputOptions = Required<OutputPathClass> & {
52 ▶   clean: boolean;
53 ▶   ignoreServer: boolean;
54 │ };
55 ▶ export type NormalizedApplicationBuildOptions = Awaited<ReturnType<typeof normalizeOptions>>;
56 │ 
57 ▶ export interface ApplicationBuilderExtensions {
58 ▶   codePlugins?: Plugin[];
59 ▶   indexHtmlTransformer?: IndexHtmlTransform;
60 │ }
61 │ 
```

55 行目の `NormalizedApplicationBuildOptions` は、normalizeOptions の**戻り値の型そのもの**です（`Awaited<ReturnType<…>>`）。手で書いた interface はありません。そのため、返す値のオブジェクト（7 節）に 1 行足すだけで、executeBuild から後のすべての関数が新しいキーを型つきで読めます。51〜54 行目の `NormalizedOutputOptions` は、schema の `OutputPathClass` を全部必須にし、`clean` と `ignoreServer` を足した形です。

57〜60 行目の `ApplicationBuilderExtensions` は、options とは別の引数（normalizeOptions の 4 つめ）で渡す拡張です。`codePlugins` は esbuild のプラグインを足し、`indexHtmlTransformer` は index.html を最後に書き換える関数です。angular.json からは書けません。../angular-cli の中で codePlugins を渡しているのは、`index.ts` 58〜64 行目（10 節）の Bazel 用のプラグインと、@angular-devkit/build-angular の dev-server（builder.ts 114 行目）と browser-esbuild（index.ts 57 行目）です。@angular/build の dev-server は、自分の `buildPlugins` を 3 つめの引数として builder の関数に渡します（vite/index.ts 221 行目）。

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L62–96 （▶ の行: 63, 72, 75, 81, 87, 95）

```ts
62 │ /** Internal options hidden from builder schema but available when invoked programmatically. */
63 ▶ interface InternalOptions {
64 │   /**
65 │    * Entry points to use for the compilation. Incompatible with `browser`, which must not be provided. May be relative or absolute paths.
66 │    * If given a relative path, it is resolved relative to the current workspace and will generate an output at the same relative location
67 │    * in the output directory. If given an absolute path, the output will be generated in the root of the output directory with the same base
68 │    * name.
69 │    *
70 │    * If provided a Map, the key is the name of the output bundle and the value is the entry point file.
71 │    */
72 ▶   entryPoints?: Set<string> | Map<string, string>;
73 │ 
74 │   /** File extension to use for the generated output files. */
75 ▶   outExtension?: 'js' | 'mjs';
76 │ 
77 │   /**
78 │    * Indicates whether all node packages should be marked as external.
79 │    * Currently used by the dev-server to support prebundling.
80 │    */
81 ▶   externalPackages?: boolean | { exclude: string[] };
82 │ 
83 │   /**
84 │    * Forces the output from the localize post-processing to not create nested directories per locale output.
85 │    * This is only used by the development server which currently only supports a single locale per build.
86 │    */
87 ▶   forceI18nFlatOutput?: boolean;
88 │ 
89 │   /**
90 │    * When set to `true`, enables fast SSR in development mode by disabling the full manifest generation and prerendering.
91 │    *
92 │    * This option is intended to optimize performance during development by skipping prerendering and route extraction when not required.
93 │    * @default false
94 │    */
95 ▶   partialSSRBuild?: boolean;
96 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L97–128 （▶ の行: 103, 110, 116, 123, 128）

```ts
 97 │   /**
 98 │    * Enables the use of AOT compiler emitted external runtime styles.
 99 │    * External runtime styles use `link` elements instead of embedded style content in the output JavaScript.
100 │    * This option is only intended to be used with a development server that can process and serve component
101 │    * styles.
102 │    */
103 ▶   externalRuntimeStyles?: boolean;
104 │ 
105 │   /**
106 │    * Enables the AOT compiler to generate template component update functions.
107 │    * This option is only intended to be used with a development server that can process and serve component
108 │    * template updates.
109 │    */
110 ▶   templateUpdates?: boolean;
111 │ 
112 │   /**
113 │    * Enables emitting incremental build results when in watch mode. A full build result will only be emitted
114 │    * for the initial build. This option also requires watch to be enabled to have an effect.
115 │    */
116 ▶   incrementalResults?: boolean;
117 │ 
118 │   /**
119 │    * Enables instrumentation to collect code coverage data for specific files.
120 │    *
121 │    * Used exclusively for tests and shouldn't be used for other kinds of builds.
122 │    */
123 ▶   instrumentForCoverage?: (filename: string) => boolean;
124 │ 
125 │   /**
126 │    * Suppress build summary and stats table.
127 │    */
128 ▶   quiet?: boolean;
```

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L129–153 （▶ の行: 142, 146–148, 151）

```ts
129 │ 
130 │   /**
131 │    * Disables esbuild code splitting for the browser code bundle.
132 │    *
133 │    * Splitting emits shared chunks whose exports are read across chunk boundaries as live ESM
134 │    * bindings. A module hoisted into a shared chunk is wrapped in a lazy initializer, so its exported
135 │    * value is only assigned once that initializer runs. Runners that load the generated output
136 │    * through a module runner rather than the browser's own ESM implementation do not reliably
137 │    * preserve those bindings, and an importing chunk can observe the export as `undefined`.
138 │    *
139 │    * Test bundles are never downloaded by a browser, so there is nothing for splitting to optimize
140 │    * there. Used exclusively for tests and shouldn't be used for other kinds of builds.
141 │    */
142 ▶   disableCodeSplitting?: boolean;
143 │ }
144 │ 
145 │ /** Full set of options for `application` builder. */
146 ▶ export type ApplicationBuilderInternalOptions = Omit<
147 ▶   ApplicationBuilderOptions & InternalOptions,
148 ▶   'browser'
149 │ > & {
150 │   // `browser` can be `undefined` if `entryPoints` is used.
151 ▶   browser?: string;
152 │ };
153 │ 
```

63 行目の `InternalOptions` は schema.json に載っていない options で、146〜152 行目で schema の型と合わせて `ApplicationBuilderInternalOptions` になります。148 行目で `browser` を外して 151 行目で任意に付け直すのは、72 行目の `entryPoints` を渡すときに `browser` を書かないためです。誰が渡しているかを ../angular-cli で grep すると、次の表のとおりです（`outExtension` だけは、読む側の application-code-bundle.ts 650 行目しか見つからず、../angular-cli の中で渡す所はありません）。

| 内部の option | 渡す所 |
| --- | --- |
| `entryPoints`（72 行目） | karma/application\_builder.ts 183 行目、unit-test の vitest/build-options.ts 260 行目 |
| `externalPackages`（81 行目） | dev-server/vite/index.ts 130 行目（`prebundle` の値）、vitest/build-options.ts 267 行目 |
| `forceI18nFlatOutput`（87 行目） | dev-server/vite/index.ts 148 行目 |
| `partialSSRBuild`（95 行目） | dev-server/vite/index.ts 134 行目 |
| `externalRuntimeStyles`（103 行目）・`templateUpdates`（110 行目） | dev-server/vite/index.ts 177・181 行目（HMR が使えるとき。前者は環境変数 NG\_HMR\_CSTYLES=1 のときだけ） |
| `incrementalResults`（116 行目） | dev-server/vite/index.ts 182 行目、index.ts 166 行目（公開の `buildApplication` は常に true）、vitest/build-options.ts 245 行目 |
| `instrumentForCoverage`（123 行目） | karma/application\_builder.ts 192 行目 |
| `quiet`（128 行目）・`disableCodeSplitting`（142 行目） | unit-test/builder.ts 328 行目、vitest/build-options.ts 264 行目 |

つまり dev-server・karma・unit-test は、どれも自分の options を application builder の options に組み替えて `buildApplicationInternal` を呼びます。dev-server の側の組み替えは[dev-server の章](../boot/03-boot-dev-server.md)です。142 行目の `disableCodeSplitting` は 0ffe2d27f2（2026-08-02）で足された新しい行で、コメント（131〜141 行目）にその理由（モジュールランナーが ESM の live binding を保たない）が書いてあります。

## 2. 頭の段：パス・キャッシュ・fileReplacements・loader

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L176–184 （▶ の行: 177–179, 182–183）

```ts
176 │   // Setup base paths based on workspace root and project information
177 ▶   const workspaceRoot = canonicalizePath(context.workspaceRoot);
178 ▶   const projectMetadata = await context.getProjectMetadata(projectName);
179 ▶   const { projectRoot, projectSourceRoot } = getProjectRootPaths(workspaceRoot, projectMetadata);
180 │ 
181 │   // Gather persistent caching option and provide a project specific cache location
182 ▶   const cacheOptions = normalizeCacheOptions(projectMetadata, workspaceRoot);
183 ▶   cacheOptions.path = path.join(cacheOptions.path, projectName);
184 │ 
```

1. **177 行目：workspaceRoot を正規化する**

   `canonicalizePath` は Windows のドライブ文字の大小などをそろえます。以後のパスはすべてこの値を土台に `path.join` します。
2. **178・179 行目：project の root と sourceRoot**

   architect の `getProjectMetadata` が返すのは、angular.json の `projects.<名前>` の JSON です。`getProjectRootPaths`（utils/project-metadata.ts）は、sourceRoot が無ければ `<root>/src` にします。
3. **182・183 行目：キャッシュの場所に project 名を足す**

   normalizeCacheOptions が返す path（`.angular/cache/<版>`、[再ビルドの章](../cli/10-cli-cache-watch.md)の 6 節）に project 名を足します。記録では `<app>/.angular/cache/22.2.7/demo` でした。新しい本家（5ffed3f3b6、2026-10-02）では、ここに builder の名前も足して、同じ project の application と unit-test のキャッシュを分けています。

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L207–244 （▶ の行: 211, 214, 216, 220, 225, 228, 237, 242）

```ts
207 │ 
208 │   let fileReplacements: Record<string, string> | undefined;
209 │   if (options.fileReplacements) {
210 │     for (const replacement of options.fileReplacements) {
211 ▶       const fileReplaceWith = path.join(workspaceRoot, replacement.with);
212 │ 
213 │       try {
214 ▶         await access(fileReplaceWith, constants.F_OK);
215 │       } catch {
216 ▶         throw new Error(`The ${fileReplaceWith} path in file replacements does not exist.`);
217 │       }
218 │ 
219 │       fileReplacements ??= {};
220 ▶       fileReplacements[path.join(workspaceRoot, replacement.replace)] = fileReplaceWith;
221 │     }
222 │   }
223 │ 
224 │   let loaderExtensions:
225 ▶     Record<string, 'text' | 'binary' | 'file' | 'dataurl' | 'base64'> | undefined;
226 │   if (options.loader) {
227 │     for (const [extension, value] of Object.entries(options.loader)) {
228 ▶       if (extension[0] !== '.' || /\.[cm]?[jt]sx?$/.test(extension)) {
229 │         continue;
230 │       }
231 │       if (
232 │         value !== 'text' &&
233 │         value !== 'binary' &&
234 │         value !== 'file' &&
235 │         value !== 'dataurl' &&
236 │         value !== 'base64' &&
237 ▶         value !== 'empty'
238 │       ) {
239 │         continue;
240 │       }
241 │       loaderExtensions ??= {};
242 ▶       loaderExtensions[extension] = value;
243 │     }
244 │   }
```

fileReplacements（209〜222 行目）は、211 行目で `with` を絶対パスにし、214 行目でそのファイルがあるかを確かめ、無ければ 216 行目で投げます。`replace` の側は確かめません。220 行目で「置き換えられる側の絶対パス → 置き換える側の絶対パス」の表にし、これを esbuild のプラグインと Angular のコンパイラのホストが引きます。記録では `{"<app>/src/environments/environment.ts": "<app>/src/environments/environment.prod.ts"}` の 1 組になりました（8 節の「polyfills 文字列・loader・external・autoCsp」）。

loader（224〜244 行目）は、228 行目で「点で始まらない拡張子」と「.js・.ts などの拡張子」を黙って捨て、231〜239 行目で知っている値だけを残します。記録では `'.svg': 'text'` と `'.bin': 'empty'` が残り、`'.ts'`・`'txt'`（点なし）・`'.png': 'css'` は警告も無く消えました（schema.json の `patternProperties` が `.png` の `css` を先に弾くので、実際の ng build で届くのは前の 2 つです）。なお 225 行目の型には `'empty'` が無いのに、237 行目は `'empty'` を通します。8f305ef0ba（2025-05-27）が型に dataurl と base64 を足したとき、元から型に無かった empty はそのままになりました。schema の型が `any` なので、TypeScript は気づきません。

## 3. outputMode の検査と、appShell の 1 行

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L246–256 （▶ の行: 247–249, 252–253）

```ts
246 │   // Validate prerender and ssr options when using the outputMode
247 ▶   if (options.outputMode === OutputMode.Server) {
248 ▶     if (!options.server) {
249 ▶       throw new Error('The "server" option is required when "outputMode" is set to "server".');
250 │     }
251 │ 
252 ▶     if (typeof options.ssr === 'boolean' || !options.ssr?.entry) {
253 ▶       throw new Error('The "ssr.entry" option is required when "outputMode" is set to "server".');
254 │     }
255 │   }
256 │ 
```

outputMode が `"server"` のときだけ、248 行目で server（main.server.ts）を、252 行目で `ssr.entry`（server.ts）を求めます。252 行目は `typeof options.ssr === 'boolean'` も誤りにするので、`ssr: true` と書くと投げます（記録の「誤り: outputMode: server で ssr.entry なし」）。この後の行（outputMode を書くと ssr を false にし、prerender を server の有無で決め直す行）は[プリレンダーの章](../platform/06-ssr-prerender.md)の 1 節が読みました。その最後の部分だけを見ます。

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L269–276 （▶ の行: 270–272）

```ts
269 │ 
270 ▶     if (options.appShell !== undefined) {
271 ▶       context.logger.warn(
272 ▶         'The "appShell" option is not considered when "outputMode" is specified.',
273 │       );
274 │     }
275 │   }
276 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L304–323 （▶ の行: 306–307, 309, 312–313, 318–320）

```ts
304 │ 
305 │   let ssrOptions;
306 ▶   if (options.ssr === true) {
307 ▶     ssrOptions = {};
308 │   } else if (typeof options.ssr === 'object') {
309 ▶     const { entry, platform = Platform.Node } = options.ssr;
310 │ 
311 │     ssrOptions = {
312 ▶       entry: entry && path.join(workspaceRoot, entry),
313 ▶       platform,
314 │     };
315 │   }
316 │ 
317 │   let appShellOptions;
318 ▶   if (options.appShell) {
319 ▶     appShellOptions = {
320 ▶       route: 'shell',
321 │     };
322 │   }
323 │ 
```

270〜272 行目は「outputMode を書くと appShell は考えない」と警告します。ところが、prerender はその直前の行で書き直されるのに、`options.appShell` は書き直されません。318〜321 行目は outputMode を見ずに `appShellOptions = { route: 'shell' }` を作ります。プリレンダーの章は「古い prerender と appShell の設定は無視されます」と書きましたが、appShell については、警告の文と次の行の動きが合っていません。

> [!WARNING]
> **ハマりどころ**
>
> 確かめるため、[ビルド側のワーカーの章](../ssrl/05-ssrl-build-workers.md)の SSR の小さなアプリ（ルートは `/`・`/about` など、withAppShell なし）を、`outputMode: "static"` に `appShell: true` を足して 22.2.7 の ng build にかけました。ログの 1 行目は `The "appShell" option is not considered when "outputMode" is specified.` で、その後 `NG04002: Cannot match any routes. URL Segment: 'shell'` と `An error occurred while prerendering route '/shell'.` が出て、ビルドは失敗しました（終了コード 1）。appShell を書かない同じ設定は成功し、7 つのルートを書き出しました。さらに server を書かないと（8 節の「outputMode: static、server なし」）、outputMode の段で ssr は false になるのに、appShellOptions が残るので 5 節の 409 行目の「server が要る」で投げます。新しい本家の options.ts でも、警告（285 行目）と appShellOptions を作る行（334 行目）は同じ形です。

306・307 行目、`ssr: true` は空のオブジェクトになります。entry が無い ssr で、outputMode を書かない古い形（server.ts を使わない SSR）です。オブジェクトなら 309 行目で `platform` の既定を `node` にし、312 行目で entry を絶対パスにします。entry のファイルがあるかは、ここでは確かめません。

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L284–293 （▶ の行: 286–288, 291）

```ts
284 │ 
285 │   let serverEntryPoint: string | undefined;
286 ▶   if (typeof options.server === 'string') {
287 ▶     if (options.server === '') {
288 ▶       throw new Error('The "server" option cannot be an empty string.');
289 │     }
290 │ 
291 ▶     serverEntryPoint = path.join(workspaceRoot, options.server);
292 │   }
293 │ 
```

server（main.server.ts）は文字列のときだけ 291 行目で絶対パスになります。空文字は 287 行目で投げます。`server: false` は schema が許す書き方で、そのときは serverEntryPoint が undefined のままです。outputPath を 1 つの形にする行は[プリレンダーの章](../platform/06-ssr-prerender.md)が読みました。記録では、文字列でもオブジェクトでも `base` は絶対パスになり、オブジェクトの `browser: ''` は SSR が無ければそのまま残りました（10 節の検査で止まるのは SSR のときだけ）。

## 4. index：入力と出力の名前

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L353–371 （▶ の行: 354–355, 358, 362–366, 368–369）

```ts
353 │ 
354 ▶   const globalStyles = normalizeGlobalEntries(options.styles, 'styles');
355 ▶   const globalScripts = normalizeGlobalEntries(options.scripts, 'scripts');
356 │   let indexHtmlOptions;
357 │   // index can never have a value of `true` but in the schema it's of type `boolean`.
358 ▶   if (typeof options.index !== 'boolean') {
359 │     let indexInput: string;
360 │     let indexOutput: string;
361 │     // The output file will be created within the configured output path
362 ▶     if (typeof options.index === 'string') {
363 ▶       indexInput = indexOutput = path.join(workspaceRoot, options.index);
364 ▶     } else if (typeof options.index === 'undefined') {
365 ▶       indexInput = path.join(projectSourceRoot, 'index.html');
366 ▶       indexOutput = 'index.html';
367 │     } else {
368 ▶       indexInput = path.join(workspaceRoot, options.index.input);
369 ▶       indexOutput = options.index.output || 'index.html';
370 │     }
371 │ 
```

1. **354・355 行目：styles と scripts を束ごとにする**

   normalizeGlobalEntries の中身は[グローバルスタイルの章](../bmap/02-bmap-styles-bundle.md)です。ここでは index.html に差し込む順（7 節の insertionOrder）のために先に作っています。
2. **358 行目：`index: false` なら何もしない**

   schema では `boolean` ですが、許すのは false だけです（357 行目のコメント）。indexHtmlOptions は undefined のままになります。
3. **362〜369 行目：3 つの書き方を input と output にする**

   文字列なら input も output も同じ絶対パス、書かなければ sourceRoot の index.html と `'index.html'`、オブジェクトなら `output`（無ければ `'index.html'`）です。

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L380–388 （▶ の行: 381–385, 387）

```ts
380 │      */
381 ▶     const indexBaseName = path.basename(indexOutput);
382 ▶     indexOutput =
383 ▶       (ssrOptions || prerenderOptions) && indexBaseName === 'index.html'
384 ▶         ? INDEX_HTML_CSR
385 ▶         : indexBaseName;
386 │ 
387 ▶     const preloadInitialDefault = !options.serviceWorker;
388 │ 
```

381〜385 行目は、どの書き方でも output を **basename（最後の名前だけ）**にします。SSR かプリレンダーがあれば index.csr.html に替える理由は[プリレンダーの章](../platform/06-ssr-prerender.md)にあります。文字列の書き方では、363 行目の output は絶対パスなので basename が要ります。ところがオブジェクトの書き方でも、フォルダが落ちます。

📄 `angular-cli/packages/angular/build/src/builders/application/schema.json` L499–527 （▶ の行: 504, 519）

```json
499 │     "index": {
500 │       "description": "Configures the generation of the application's HTML index.",
501 │       "oneOf": [
502 │         {
503 │           "type": "string",
504 ▶           "description": "The path of a file to use for the application's HTML index. The filename of the specified path will be used for the generated file and will be created in the root of the application's configured output path."
505 │         },
506 │         {
507 │           "type": "object",
508 │           "description": "",
509 │           "properties": {
510 │             "input": {
511 │               "type": "string",
512 │               "minLength": 1,
513 │               "description": "The path of a file to use for the application's generated HTML index."
514 │             },
515 │             "output": {
516 │               "type": "string",
517 │               "minLength": 1,
518 │               "default": "index.html",
519 ▶               "description": "The output path of the application's generated HTML index file. The full provided path will be used and will be considered relative to the application's configured output path."
520 │             },
521 │             "preloadInitial": {
522 │               "type": "boolean",
523 │               "description": "Generates 'preload', 'modulepreload', and 'preconnect' link elements for initial application files and resources. Defaults to false when a service worker is enabled; otherwise true."
524 │             }
525 │           },
526 │           "required": ["input"]
527 │         },
```

schema.json の 504 行目（文字列）は「ファイル名を使い、出力の根に作る」と書き、519 行目（オブジェクトの output）は「与えたパスを全部使い、出力のパスからの相対とみなす」と書いています。記録では `index: { input: 'src/index.html', output: 'pages/app.html' }` の output が `app.html` になり（8 節の「index.output にフォルダを書く」）、同じ設定で ng build すると `dist/browser/app.html` ができて、`pages/` はできませんでした。この basename は 97897b710a（2024-12-03、「SSR のとき index.output を正しく扱う」）が、文字列の枝だけにあった basename を両方の枝の後ろへ移したときからです。それより前は、オブジェクトの output はそのまま使われていました。

387 行目、service worker があると preloadInitial の既定は false になります（オブジェクトの `preloadInitial` を書けばそちらが優先）。index.html の中身を作る所は[index.html の章](../boot/05-boot-index-html.md)です。

## 5. 組み合わせの検査と security

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L406–431 （▶ の行: 408–409, 411, 415, 422, 425, 427）

```ts
406 │   }
407 │ 
408 ▶   if (appShellOptions || ssrOptions || prerenderOptions) {
409 ▶     if (!serverEntryPoint) {
410 │       throw new Error(
411 ▶         'The "server" option is required when enabling "ssr", "prerender" or "app-shell".',
412 │       );
413 │     }
414 │ 
415 ▶     if (!indexHtmlOptions) {
416 │       throw new Error(
417 │         'The "index" option cannot be set to false when enabling "ssr", "prerender" or "app-shell".',
418 │       );
419 │     }
420 │   }
421 │ 
422 ▶   const { autoCsp, allowedHosts = [] } = options.security ?? {};
423 │   const security = {
424 │     allowedHosts,
425 ▶     autoCsp: autoCsp
426 │       ? {
427 ▶           unsafeEval: autoCsp === true ? false : !!autoCsp.unsafeEval,
428 │         }
429 │       : undefined,
430 │   };
431 │ 
```

408 行目は、appShell・ssr・prerender のどれかがあるのに server が無い組み合わせ（409 行目）と、index: false（415 行目）を投げます。3 節の appShell の 1 行はここに効きます。422〜430 行目の security は、`allowedHosts` の既定を空の配列にし、`autoCsp` を `{ unsafeEval }` の形にそろえます。`autoCsp: true` は `unsafeEval: false` です（記録の「polyfills 文字列・loader・external・autoCsp」）。allowedHosts の行は 6cf621c905（2026-02-23、ホストのヘッダーによる SSRF を防ぐ修正）で足されました。

## 6. 残す値：分解の既定値

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L432–463 （▶ の行: 435, 440, 451, 458）

```ts
432 │   // Initial options to keep
433 │   const {
434 │     allowedCommonJsDependencies,
435 ▶     aot = true,
436 │     baseHref,
437 │     crossOrigin,
438 │     externalDependencies,
439 │     extractLicenses,
440 ▶     inlineStyleLanguage = 'css',
441 │     outExtension,
442 │     serviceWorker,
443 │     poll,
444 │     polyfills,
445 │     statsJson,
446 │     outputMode,
447 │     stylePreprocessorOptions,
448 │     subresourceIntegrity,
449 │     verbose,
450 │     watch,
451 ▶     progress = true,
452 │     externalPackages,
453 │     namedChunks,
454 │     budgets,
455 │     deployUrl,
456 │     clearScreen,
457 │     define,
458 ▶     partialSSRBuild = false,
459 │     externalRuntimeStyles,
460 │     instrumentForCoverage,
461 │     disableCodeSplitting,
462 │   } = options;
463 │ 
```

432〜462 行目は、正規化しない options を分解して取り出します。既定値を持つのは 4 つだけで、`aot = true`（435 行目）・`inlineStyleLanguage = 'css'`（440 行目）・`progress = true`（451 行目）・`partialSSRBuild = false`（458 行目）です。schema.json にも既定値はありますが、schema の既定値を当てるのは architect（builder として呼ばれたとき、または呼ぶ側が `context.validateOptions` を通したとき）です。`buildApplicationInternal` を options のまま呼ぶと当たらないので、この分解の既定値が効きます。8 節の記録も、architect を通さずに呼んでいます。

## 7. 返す値

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L468–500 （▶ の行: 471–473, 476, 481–483）

```ts
468 │     baseHref,
469 │     cacheOptions,
470 │     crossOrigin,
471 ▶     externalDependencies: normalizeExternals(externalDependencies),
472 ▶     externalPackages:
473 ▶       typeof externalPackages === 'object'
474 │         ? {
475 │             ...externalPackages,
476 ▶             exclude: normalizeExternals(externalPackages.exclude),
477 │           }
478 │         : externalPackages,
479 │     extractLicenses,
480 │     inlineStyleLanguage,
481 ▶     jit: !aot,
482 ▶     stats: !!statsJson,
483 ▶     polyfills: polyfills === undefined || Array.isArray(polyfills) ? polyfills : [polyfills],
484 │     poll,
485 │     progress,
486 │     preserveSymlinks,
487 │     stylePreprocessorOptions,
488 │     subresourceIntegrity,
489 │     serverEntryPoint,
490 │     prerenderOptions,
491 │     appShellOptions,
492 │     outputMode,
493 │     ssrOptions,
494 │     verbose,
495 │     watch,
496 │     workspaceRoot,
497 │     entryPoints,
498 │     disableCodeSplitting,
499 │     optimizationOptions,
500 │     outputOptions,
```

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L501–539 （▶ の行: 510, 513, 521–523, 530–531, 534–537）

```ts
501 │     outExtension,
502 │     sourcemapOptions,
503 │     tsconfig,
504 │     projectRoot,
505 │     assets,
506 │     outputNames,
507 │     fileReplacements,
508 │     globalStyles,
509 │     globalScripts,
510 ▶     serviceWorker: serviceWorker
511 │       ? path.join(
512 │           workspaceRoot,
513 ▶           typeof serviceWorker === 'string' ? serviceWorker : 'src/ngsw-config.json',
514 │         )
515 │       : undefined,
516 │     indexHtmlOptions,
517 │     tailwindConfiguration,
518 │     postcssConfiguration,
519 │     i18nOptions,
520 │     namedChunks,
521 ▶     budgets: budgets?.length ? budgets : undefined,
522 ▶     publicPath: deployUrl,
523 ▶     plugins: extensions?.codePlugins?.length ? extensions?.codePlugins : undefined,
524 │     loaderExtensions,
525 │     jsonLogs: useJSONBuildLogs,
526 │     quiet: options.quiet,
527 │     colors: supportColor(),
528 │     clearScreen,
529 │     define,
530 ▶     partialSSRBuild: usePartialSsrBuild || partialSSRBuild,
531 ▶     externalRuntimeStyles: aot && externalRuntimeStyles,
532 │     instrumentForCoverage,
533 │     security,
534 ▶     templateUpdates: !!options.templateUpdates,
535 ▶     incrementalResults: !!options.incrementalResults,
536 ▶     customConditions: options.conditions,
537 ▶     frameworkVersion: await findFrameworkVersion(projectRoot),
538 │   };
539 │ }
```

1. **471〜478 行目：外部の依存の名前をそろえる**

   externalDependencies と externalPackages の exclude を、9 節の normalizeExternals に通します。
2. **481〜483 行目：向きを変える値**

   `jit` は `!aot`、`stats` は statsJson の真偽、polyfills は文字列なら 1 つの配列にします（記録の `"zone.js"` → `["zone.js"]`）。
3. **510〜515 行目：service worker の設定ファイル**

   `serviceWorker: true` は `src/ngsw-config.json` に決め打ちです（513 行目）。project の sourceRoot ではなく workspaceRoot から数えます。
4. **521〜523 行目：空なら undefined**

   budgets とプラグインは空の配列なら undefined にし、後の段が `if (options.budgets)` だけで判定できるようにします。522 行目で deployUrl は `publicPath` という名前に変わります。
5. **530・531 行目：環境変数と aot**

   partialSSRBuild は環境変数 NG\_BUILD\_PARTIAL\_SSR でも真になり、externalRuntimeStyles は aot のときだけ効きます。
6. **534〜537 行目：真偽にそろえる値と、名前の変わる値**

   templateUpdates と incrementalResults は `!!` で真偽にし、`conditions` は `customConditions` になります。537 行目で @angular/core の版を読みます（9 節）。

記録では、返したオブジェクトのキーはどの設定でも 62 個でした（値が undefined のキーも数える）。

## 8. デモ：本物の normalizeOptions に 14 通りの options を当てる

> **🧪 DEMO — normalizeOptions の返り値の主なキー**
>
> カウンターのアプリを写した小さなワークスペース（`<app>`）に、@angular/build 22.2.7 の `normalizeOptions` を、options だけ変えて 14 回呼んだ記録です。「最小と比べる」を入れると、最小の設定と値が違う行を赤で示します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/abl-options)

見どころは 3 つです。「outputMode: server ＋ ssr.entry」では、prerender を書いていないのに prerenderOptions が `{"discoverRoutes":true}` になり、呼んだ後の `options.prerender` が true に書き換わっています（server があるので、outputMode の段が prerender を true にする）。「outputMode: static ＋ server」は prerender を書いたので警告が出て、ignoreServer が true になります。「localize: true」では、i18n の `baseHref` を持つ fr だけが `/app/fr-base/` になり、ほかは `/app/<ロケール>/` でした（getLocaleBaseHref、[i18n の章](../cli/09-cli-i18n.md)の 7 節）。

## 9. 小さな補助関数

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L541–569 （▶ の行: 546, 548, 553, 557, 561）

```ts
541 │ async function getTailwindConfig(
542 │   searchDirectories: SearchDirectory[],
543 │   workspaceRoot: string,
544 │   context: BuilderContext,
545 │ ): Promise<{ file: string; package: string } | undefined> {
546 ▶   const tailwindConfigurationPath = findTailwindConfiguration(searchDirectories);
547 │ 
548 ▶   if (!tailwindConfigurationPath) {
549 │     return undefined;
550 │   }
551 │ 
552 │   // Create a node resolver from the configuration file
553 ▶   const resolver = createRequire(tailwindConfigurationPath);
554 │   try {
555 │     return {
556 │       file: tailwindConfigurationPath,
557 ▶       package: resolver.resolve('tailwindcss'),
558 │     };
559 │   } catch {
560 │     const relativeTailwindConfigPath = path.relative(workspaceRoot, tailwindConfigurationPath);
561 ▶     context.logger.warn(
562 │       `Tailwind CSS configuration file found (${relativeTailwindConfigPath})` +
563 │         ` but the 'tailwindcss' package is not installed.` +
564 │         ` To enable Tailwind CSS, please install the 'tailwindcss' package.`,
565 │     );
566 │   }
567 │ 
568 │   return undefined;
569 │ }
```

Tailwind は、設定ファイル（tailwind.config.\* など）が project の root か workspace の root にあるときだけ探します（546 行目）。553 行目で**設定ファイルの場所から** require を作り、557 行目で tailwindcss を解決します。見つからなければ 561 行目で警告して undefined を返し、ビルドは止めません。呼ぶ側（[コンポーネントのスタイルの章](../cli/04-cli-component-styles.md)が読んだ行）は、postcss の設定ファイルがあれば Tailwind を探しません。新しい本家（4034fc5cd0）ではこの関数は postcss-configuration.ts に移り、同期の関数になりました。

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L583–614 （▶ の行: 589, 594, 598, 600–601, 603–604, 608–609）

```ts
583 │ function normalizeEntryPoints(
584 │   workspaceRoot: string,
585 │   projectSourceRoot: string,
586 │   browser: string | undefined,
587 │   entryPoints: Set<string> | Map<string, string> | undefined,
588 │ ): Record<string, string> {
589 ▶   if (browser === '') {
590 │     throw new Error('`browser` option cannot be an empty string.');
591 │   }
592 │ 
593 │   // `browser` and `entryPoints` are mutually exclusive.
594 ▶   if (browser && entryPoints) {
595 │     throw new Error('Only one of `browser` or `entryPoints` may be provided.');
596 │   }
597 │ 
598 ▶   if (browser) {
599 │     // Use `browser` alone.
600 ▶     return { 'main': path.join(workspaceRoot, browser) };
601 ▶   } else if (!entryPoints) {
602 │     // Default browser entry if no explicit entry points
603 ▶     return { 'main': path.join(projectSourceRoot, 'main.ts') };
604 ▶   } else if (entryPoints instanceof Map) {
605 │     return Object.fromEntries(
606 │       Array.from(entryPoints.entries(), ([name, entryPoint]) => {
607 │         // Get the full file path to a relative entry point input. Leave bare specifiers alone so they are resolved as modules.
608 ▶         const isRelativePath = entryPoint.startsWith('.');
609 ▶         const entryPointPath = isRelativePath ? path.join(workspaceRoot, entryPoint) : entryPoint;
610 │ 
611 │         return [name, entryPointPath];
612 │       }),
613 │     );
614 │   } else {
```

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L615–646 （▶ の行: 624–626, 629–630, 634–635）

```ts
615 │     // Use `entryPoints` alone.
616 │     const entryPointPaths: Record<string, string> = {};
617 │     for (const entryPoint of entryPoints) {
618 │       const parsedEntryPoint = path.parse(entryPoint);
619 │ 
620 │       // Use the input file path without an extension as the "name" of the entry point dictating its output location.
621 │       // Relative entry points are generated at the same relative path in the output directory.
622 │       // Absolute entry points are always generated with the same file name in the root of the output directory. This includes absolute
623 │       // paths pointing at files actually within the workspace root.
624 ▶       const entryPointName = path.isAbsolute(entryPoint)
625 ▶         ? parsedEntryPoint.name
626 ▶         : path.join(parsedEntryPoint.dir, parsedEntryPoint.name);
627 │ 
628 │       // Get the full file path to a relative entry point input. Leave bare specifiers alone so they are resolved as modules.
629 ▶       const isRelativePath = entryPoint.startsWith('.');
630 ▶       const entryPointPath = isRelativePath ? path.join(workspaceRoot, entryPoint) : entryPoint;
631 │ 
632 │       // Check for conflicts with previous entry points.
633 │       const existingEntryPointPath = entryPointPaths[entryPointName];
634 ▶       if (existingEntryPointPath) {
635 ▶         throw new Error(
636 │           `\`${existingEntryPointPath}\` and \`${entryPointPath}\` both output to the same location \`${entryPointName}\`.` +
637 │             ' Rename or move one of the files to fix the conflict.',
638 │         );
639 │       }
640 │ 
641 │       entryPointPaths[entryPointName] = entryPointPath;
642 │     }
643 │ 
644 │     return entryPointPaths;
645 │   }
646 │ }
```

入口は 3 通りです。`browser` なら 600 行目で `main` という名前の 1 つ、どちらも無ければ 603 行目で sourceRoot の main.ts、内部の `entryPoints` なら Map（名前を指定）か Set（名前はパスから作る）です。Set のとき、相対パスは拡張子を除いたパスがそのまま名前になり（626 行目）、出力でも同じフォルダに出ます。絶対パスはファイル名だけが名前になる（625 行目）ので、別のフォルダの同じ名前のファイルは 634〜639 行目でぶつかります。608・629 行目、`.` で始まらない入口はパッケージ名とみなし、そのまま esbuild に渡します。karma と unit-test の builder がテストのファイルを入口にするのが、この Set の形です。

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L719–744 （▶ の行: 737, 740）

```ts
719 │ /**
720 │  * Normalizes an array of external dependency paths by ensuring that
721 │  * wildcard patterns (`/*`) are removed from package names.
722 │  *
723 │  * This avoids the need to handle this normalization repeatedly in our plugins,
724 │  * as esbuild already treats `--external:@foo/bar` as implicitly including
725 │  * `--external:@foo/bar/*`. By standardizing the input, we ensure consistency
726 │  * and reduce redundant checks across our plugins.
727 │  *
728 │  * @param value - An optional array of dependency paths to normalize.
729 │  * @returns A new array with wildcard patterns removed from package names, or `undefined` if input is `undefined`.
730 │  */
731 │ function normalizeExternals(value: string[] | undefined): string[] | undefined {
732 │   if (!value) {
733 │     return undefined;
734 │   }
735 │ 
736 │   return [
737 ▶     ...new Set(
738 │       value.map((d) =>
739 │         // remove "/*" wildcard in the end if provided string is not path-like
740 ▶         d.endsWith('/*') && !/^\.{0,2}\//.test(d) ? d.slice(0, -2) : d,
741 │       ),
742 │     ),
743 │   ];
744 │ }
```

740 行目は、`/*` で終わり、`/`・`./`・`../` で始まらない値から `/*` を取ります。esbuild は `--external:@foo/bar` を `@foo/bar/*` も含むとみなすので、そろえておけば後のプラグインが 1 通りだけ比べればよい、とコメント（719〜730 行目）にあります。737 行目の Set で重なりも消えます。記録では `['@foo/bar/*', './local/*', '@foo/bar']` が `["@foo/bar","./local/*"]` になりました。相対パスを残すのは fc0e05fea8（2025-04-07）からです。

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L746–761 （▶ の行: 747, 750, 753, 757–758）

```ts
746 │ async function findFrameworkVersion(projectRoot: string): Promise<string> {
747 ▶   const projectResolve = createProjectResolver(projectRoot);
748 │ 
749 │   try {
750 ▶     const manifestPath = projectResolve('@angular/core/package.json');
751 │     const manifestData = await readFile(manifestPath, 'utf-8');
752 │     const manifestObject = JSON.parse(manifestData) as { version: string };
753 ▶     const version = manifestObject.version;
754 │ 
755 │     return version;
756 │   } catch {
757 ▶     throw new Error(
758 ▶       'Error: It appears that "@angular/core" is missing as a dependency. Please ensure it is included in your project.',
759 │     );
760 │   }
761 │ }
```

`frameworkVersion` は project の root から @angular/core の package.json を解決して、その version を読みます（750 行目）。見つからなければ 757 行目で「@angular/core が依存に無い」と投げます。記録では `22.2.6` でした。この値を読むのは application-code-bundle.ts 592 行目だけで、AOT のとき esbuild の conditions に `angular:linked-<版>` を足し、版ごとにリンク済みのパッケージを選べるようにします。

## 10. buildApplicationInternal の側の検査

📄 `angular-cli/packages/angular/build/src/builders/application/index.ts` L57–88 （▶ の行: 58, 62–63, 66, 68, 70, 79）

```ts
57 │ 
58 ▶   if (bazelEsbuildPluginPath) {
59 │     extensions ??= {};
60 │     extensions.codePlugins ??= [];
61 │ 
62 ▶     const { default: bazelEsbuildPlugin } = await import(bazelEsbuildPluginPath);
63 ▶     extensions.codePlugins.push(bazelEsbuildPlugin);
64 │   }
65 │ 
66 ▶   const normalizedOptions = await normalizeOptions(context, projectName, options, extensions);
67 │ 
68 ▶   if (!normalizedOptions.outputOptions.ignoreServer) {
69 │     const { browser, server } = normalizedOptions.outputOptions;
70 ▶     if (browser === '') {
71 │       context.logger.error(
72 │         `'outputPath.browser' cannot be configured to an empty string when SSR is enabled.`,
73 │       );
74 │       yield { kind: ResultKind.Failure, errors: [] };
75 │ 
76 │       return;
77 │     }
78 │ 
79 ▶     if (browser === server) {
80 │       context.logger.error(
81 │         `'outputPath.browser' and 'outputPath.server' cannot be configured to the same value.`,
82 │       );
83 │       yield { kind: ResultKind.Failure, errors: [] };
84 │ 
85 │       return;
86 │     }
87 │   }
88 │ 
```

normalizeOptions を呼ぶ前に、58〜64 行目で環境変数（`bazelEsbuildPluginPath`）があれば Bazel 用の esbuild プラグインを codePlugins に足します。1 節の ApplicationBuilderExtensions を中で使う唯一の所です。66 行目で normalizeOptions を呼んだ後、68 行目、server の出力を書くとき（ignoreServer が偽）だけ、browser が空（70 行目）と browser と server が同じ（79 行目）を誤りにします。この 2 つは throw ではなく `ResultKind.Failure` を 1 つ yield して終わります。Result の形は[次の章](02-abl-results.md)で読みます。

## 11. ここまでの呼び出し

- `buildApplicationInternal(options, context, extensions)` — builders/application/index.ts 34 — *Bazel のプラグインを足す（58〜64）*
  - `normalizeOptions(context, projectName, options, extensions)` — options.ts 166
    - `canonicalizePath` / `getProjectRootPaths` / `normalizeCacheOptions` — 177〜183
    - `createI18nOptions` — 188 — *i18n の章*
    - `normalizeEntryPoints` — 195 → 583
    - `access(fileReplaceWith)` と loader の選別 — 209〜244
    - outputMode の検査と書き換え — 246〜275 — *appShell は書き換えない*
    - `loadPostcssConfiguration` / `getTailwindConfig` — 279〜283 → 541
    - server・prerender・ssr・appShell・outputPath・outputNames — 285〜352
    - `normalizeGlobalEntries` と index — 354〜406 — *output は basename*
    - 組み合わせの検査と security — 408〜430
    - `normalizeExternals` / `findFrameworkVersion` — 471 → 731、537 → 746
  - browser と server の出力先の検査 — index.ts 68〜87
  - `runEsBuildBuildAction(…)` — index.ts 97 — *次の章*

## 12. 記録の取り方

ワークスペースは `<scratchpad>/abl-demo/a/app` に、カウンターのアプリ（~/angular-research/angular-deep-dive-video/demo/counter）を写して作り、node\_modules はこのサイトのものを symlink で借りました。スクリプトは配布物の `src/builders/application/options.js` を絶対パスで require して `normalizeOptions` を呼びます。BuilderContext の代わりに、`workspaceRoot`・`logger`・`getProjectMetadata`（angular.json の project をそのまま返す）だけを持つオブジェクトを渡しています。architect を通さないので、schema の検査と既定値は当たりません。3 節の appShell の確かめと 4 節の index の確かめは、同じ依存で `ng build` を走らせました。

📄 `記録のスクリプト（rec-options.mjs）`

```
// 本物の normalizeOptions（このサイトの node_modules の @angular/build 22.2.7）を、小さなワークスペースに当てて記録する。
// 使い方: node rec-options.mjs <サイトのディレクトリ> <出力 JSON>
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [site, out] = process.argv.slice(2);
const app = path.join(path.dirname(new URL(import.meta.url).pathname), 'app');
const require = createRequire(path.join(site, 'package.json'));
const optionsModule = require(path.join(site, 'node_modules/@angular/build/src/builders/application/options.js'));
const buildPkg = require(path.join(site, 'node_modules/@angular/build/package.json'));

const angularJson = JSON.parse(readFileSync(path.join(app, 'angular.json'), 'utf8'));
const baseProject = angularJson.projects.demo;

const base = { browser: 'src/main.ts', tsConfig: 'tsconfig.app.json' };
const variants = [
  { id: 'base', label: '最小（browser と tsConfig だけ）', options: { ...base } },
  { id: 'outStr', label: 'outputPath: 文字列', options: { ...base, outputPath: 'out/site' } },
  {
    id: 'outObj',
    label: 'outputPath: オブジェクト',
    options: { ...base, outputPath: { base: 'out/site', browser: '' } },
  },
  {
    id: 'ssrServer',
    label: 'outputMode: server ＋ ssr.entry',
    options: { ...base, server: 'src/main.server.ts', ssr: { entry: 'src/server.ts' }, outputMode: 'server' },
  },
  {
    id: 'static',
    label: 'outputMode: static ＋ server',
    options: { ...base, server: 'src/main.server.ts', outputMode: 'static', prerender: true },
  },
  {
    id: 'legacySsr',
    label: 'outputMode なし ＋ ssr: true',
    options: { ...base, server: 'src/main.server.ts', ssr: true, prerender: false },
  },
  {
    id: 'outputModeNoServer',
    label: 'outputMode: static、server なし',
    options: { ...base, outputMode: 'static', ssr: true, appShell: true },
  },
  {
    id: 'localize',
    label: 'localize: true（i18n に fr）',
    options: { ...base, localize: true, baseHref: '/app/' },
    project: {
      i18n: { sourceLocale: 'en-US', locales: { fr: { translation: 'src/locale/messages.fr.xlf', baseHref: '/fr-base/' }, de: 'src/locale/messages.de.xlf' } },
    },
  },
  {
    id: 'misc',
    label: 'polyfills 文字列・loader・external・autoCsp',
    options: {
      ...base,
      polyfills: 'zone.js',
      loader: { '.svg': 'text', '.ts': 'text', 'txt': 'text', '.bin': 'empty', '.png': 'css' },
      externalDependencies: ['@foo/bar/*', './local/*', '@foo/bar'],
      security: { autoCsp: true },
      fileReplacements: [{ replace: 'src/environments/environment.ts', with: 'src/environments/environment.prod.ts' }],
    },
  },
  {
    id: 'sw',
    label: 'serviceWorker: true ＋ index オブジェクト',
    options: { ...base, serviceWorker: true, index: { input: 'src/index.html', output: 'main.html' }, outputHashing: 'all' },
  },
  {
    id: 'indexDir',
    label: 'index.output にフォルダを書く',
    options: { ...base, index: { input: 'src/index.html', output: 'pages/app.html' } },
  },
  {
    id: 'errServer',
    label: '誤り: outputMode: server で ssr.entry なし',
    options: { ...base, server: 'src/main.server.ts', outputMode: 'server', ssr: true },
  },
  {
    id: 'errNoServer',
    label: '誤り: ssr: true で server なし',
    options: { ...base, ssr: true },
  },
  {
    id: 'errReplace',
    label: '誤り: fileReplacements の with が無い',
    options: { ...base, fileReplacements: [{ replace: 'src/environments/environment.ts', with: 'src/environments/nothing.ts' }] },
  },
];

const hide = (v) =>
  JSON.parse(
    JSON.stringify(v ?? null, (_k, x) => (x instanceof Set ? [...x] : x))
      .replaceAll(app, '<app>')
      .replaceAll(site, '~/angular-research/angular-deep-dive'),
  );

const records = [];
for (const v of variants) {
  const logs = [];
  const logger = {
    warn: (m) => logs.push(['warn', m]),
    info: (m) => logs.push(['info', m]),
    error: (m) => logs.push(['error', m]),
    debug: () => {},
    log: () => {},
  };
  const project = { ...baseProject, ...(v.project ?? {}) };
  const context = {
    workspaceRoot: app,
    target: { project: 'demo', target: 'build' },
    logger,
    getProjectMetadata: async () => project,
  };
  const optionsIn = structuredClone(v.options);
  const t0 = performance.now();
  let rec;
  try {
    const n = await optionsModule.normalizeOptions(context, 'demo', optionsIn);
    rec = {
      ok: true,
      keys: Object.keys(n).length,
      picked: hide({
        workspaceRoot: n.workspaceRoot,
        projectRoot: n.projectRoot,
        entryPoints: n.entryPoints,
        tsconfig: n.tsconfig,
        outputOptions: n.outputOptions,
        outputNames: n.outputNames,
        indexHtmlOptions: n.indexHtmlOptions && {
          input: n.indexHtmlOptions.input,
          output: n.indexHtmlOptions.output,
          insertionOrder: n.indexHtmlOptions.insertionOrder,
          preloadInitial: n.indexHtmlOptions.preloadInitial,
        },
        serverEntryPoint: n.serverEntryPoint,
        ssrOptions: n.ssrOptions,
        prerenderOptions: n.prerenderOptions,
        appShellOptions: n.appShellOptions,
        outputMode: n.outputMode,
        i18n: {
          shouldInline: n.i18nOptions.shouldInline,
          inlineLocales: n.i18nOptions.inlineLocales,
          sourceLocale: n.i18nOptions.sourceLocale,
          flatOutput: n.i18nOptions.flatOutput,
          locales: Object.fromEntries(
            Object.entries(n.i18nOptions.locales).map(([k, l]) => [k, { files: l.files, baseHref: l.baseHref, subPath: l.subPath }]),
          ),
        },
        localeBaseHref: n.i18nOptions.shouldInline
          ? Object.fromEntries(
              [...n.i18nOptions.inlineLocales].map((l) => [l, optionsModule.getLocaleBaseHref(n.baseHref, n.i18nOptions, l) ?? null]),
            )
          : undefined,
        polyfills: n.polyfills,
        loaderExtensions: n.loaderExtensions,
        externalDependencies: n.externalDependencies,
        fileReplacements: n.fileReplacements,
        security: n.security,
        serviceWorker: n.serviceWorker,
        cacheOptions: { enabled: n.cacheOptions.enabled, path: n.cacheOptions.path },
        jit: n.jit,
        advancedOptimizations: n.advancedOptimizations,
        optimizationScripts: n.optimizationOptions.scripts,
        sourcemapScripts: n.sourcemapOptions.scripts,
        frameworkVersion: n.frameworkVersion,
      }),
      mutated: hide({ ssr: optionsIn.ssr, prerender: optionsIn.prerender }),
    };
  } catch (e) {
    rec = { ok: false, error: String(e.message).replaceAll(app, '<app>') };
  }
  records.push({
    id: v.id,
    label: v.label,
    input: v.options,
    project: v.project ?? null,
    ms: Math.round((performance.now() - t0) * 10) / 10,
    logs: logs.map(([l, m]) => [l, String(m).replaceAll(app, '<app>')]),
    ...rec,
  });
}

writeFileSync(
  out,
  JSON.stringify({ buildVersion: buildPkg.version, node: process.version, records }, null, 1),
);
console.log('records', records.length, records.map((r) => `${r.id}:${r.ok ? 'ok' : 'err'}`).join(' '));

```

## テストと直し方

| spec | describe / it と行 | この章のどこ |
| --- | --- | --- |
| builders/application/options\_spec.ts | describe getLocaleBaseHref（11 行目、it 7 件） | normalizeOptions 自体の unit の spec はありません |
| tests/options/index\_spec.ts | describe Option: "index"（13 行目）の long form syntax（119 行目）、it 10 件と xit 1 件 | 4 節。output は `'output.html'`（144 行目）だけで、フォルダを含む output の it はありません |
| tests/behavior/index-csr\_spec.ts | Behavior: "index.csr.html"（it 2 件） | 4 節の 383〜384 行目 |
| tests/options/output-path\_spec.ts | Option: "outputPath"（13 行目、it 10 件） | 3 節の outputPath と 10 節の 70・79 行目 |
| tests/options/app-shell\_spec.ts | Option: "appShell"（105 行目、it 3 件） | 3 節。outputMode と appShell を一緒に書く it はありません |
| tests/options/output-mode.ts | Option: "outputMode"（26 行目、it 2 件） | 名前が `_spec.ts` で終わらないので走りません（下） |

../angular-cli で `pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all "--test_arg=--filter=^(BundlerContext|getLocaleBaseHref|debug-id) "` を走らせると、4 つの shard で 8 件ずつ、合わせて 32 件（BundlerContext 9・getLocaleBaseHref 7・debug-id 16）が通りました。application builder の振る舞いの spec は別のターゲット `//packages/angular/build:application_integration_tests`（`shard_count = 25`、`flaky = True`）で、describe の頭は `@angular/build:application (Suite: N)` です。`"--test_arg=--filter=^@angular/build:application \(Suite: [0-9]+\) (Option: \"index\"|Option: \"appShell\"|Option: \"outputPath\"|…)"` の形で、上の表の 4 つに rebuild の 2 つを足した 6 つの describe に絞ると、25 の shard で合わせて 32 件（it 31 件と xit 1 件）が通りました。

練習用の作業木（44129f66a3）で、4 節の index を直してみました。index\_spec.ts の long form syntax に「`output: 'sub/output.html'` なら `dist/browser/sub/output.html` ができる」it を 1 つ足すと、その it だけが `Expected file content but file does not exist: 'dist/browser/sub/output.html'` で落ちました（flaky なので 3 回走り直し、3 回とも同じ）。options.ts の 382〜385 行目を「SSR で index.html なら index.csr.html、そうでなく `typeof options.index === 'object'` なら output をそのまま、ほかは basename」に変えると、Option: "index" と index-csr の 14 件がすべて通りました。

3 節の appShell を直すなら、options.ts の 318 行目の条件に `!options.outputMode` を足すのが一番小さい形です（警告の文のとおり、outputMode のときは appShellOptions を作らない）。固める it は app-shell\_spec.ts に「outputMode: static と appShell: true で、/shell を描かずに成功する」を足す形です。なお、表の output-mode.ts は jasmine\_test の対象（tools/defaults.bzl 86〜88 行目の `'**/*+(.|_)spec.js'`）に当たらないので、3b00fc908d（2024-09-19）で入ってから 1 度も走っていません。作業木で `output-mode_spec.ts` に名前を変えて走らせると、2 件とも `ReferenceError: $localize is not defined`（ルート / のプリレンダー）で落ちました。

## 聞かれそうな質問

**Q. angular.json に書いた相対パスは、どこからの相対ですか？**

ほとんどが workspaceRoot からです（211・291・312・368 行目の `path.join(workspaceRoot, …)`）。例外は、index を書かないときの index.html と、browser を書かないときの main.ts で、こちらは sourceRoot からです（365・603 行目）。serviceWorker: true の `src/ngsw-config.json` も workspaceRoot からなので、project が projects/ の下にあるときは文字列で書く必要があります（513 行目）。

**Q. outputMode を書くと appShell は本当に無視されますか？**

警告（270〜272 行目）はそう言いますが、318〜321 行目は outputMode を見ずに appShellOptions を作ります。22.2.7 の ng build で outputMode: static に appShell: true を足すと、/shell を描こうとして失敗しました（3 節）。outputMode のときは appShell を書かず、app shell は withAppShell で決めます。

**Q. index の output に pages/app.html と書いたのに、ルートに app.html ができます。**

382〜385 行目が、オブジェクトの書き方でも basename にするからです。schema.json の 519 行目の説明（与えたパスを全部使う）とは合っていません。97897b710a（2024-12-03）からこの形です（4 節）。

**Q. loader に '.ts': 'text' と書いても効かないのはなぜですか？**

228 行目が、`/\.[cm]?[jt]sx?$/` に当たる拡張子を黙って捨てるからです。警告も出ません。TypeScript と JavaScript は常に Angular のコンパイラと esbuild の既定で読みます。

**Q. プログラムから buildApplication を呼ぶと、schema の既定値は当たりますか？**

`buildApplicationInternal` を options のまま呼ぶと当たりません。当たるのは architect が builder として呼ぶときと、呼ぶ側が `context.validateOptions` を通したとき（dev-server はこちら）です。そのため normalizeOptions は 435・440・451・458 行目の分解と、`??` の既定（outputPath の段の deleteOutputPath など）を自分で持っています。

## 読み終えて

- NormalizedApplicationBuildOptions は normalizeOptions の戻り値の型で、返すオブジェクトに 1 行足せば後の段すべてに型つきで届く。
- schema に無い内部の options（entryPoints・externalPackages・templateUpdates・incrementalResults など）は、dev-server・karma・unit-test が application builder を呼ぶための入口である。
- 相対パスは基本が workspaceRoot から。fileReplacements の with だけはここで存在を確かめる。loader は知らない値や JS・TS の拡張子を黙って捨てる。
- outputMode を書くと prerender は書き直されるが、appShell は書き直されず、警告と動きが食い違う。
- index の output は、オブジェクトで書いてもフォルダが落ちる。直すなら options.ts の 382〜385 行目と index\_spec.ts の long form syntax。

---

← 前: [spec と issue を読む：Router の読み残しを固めているテスト](../rtl/06-rtl-tests-issues.md)  
次: [ビルドの結果の形：ExecutionResult から Full・Incremental・ComponentUpdate の Result へ](02-abl-results.md) →
