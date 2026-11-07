[目次](../README.md) › [SSR とハイドレーション](README.md) › 第 6 回 / 全 15 回

# プリレンダー：ビルド時に全ルートを HTML にする

> @angular/build の prerenderPages がサーバー用バンドルをメモリ上で読み込み、routes-extractor-worker でルートを取り出し、WorkerPool（Piscina）の render-worker にルートを束で配り、本番と同じ AngularServerApp.handle で描画して index.html を書き出す行。outputMode static と server の違い、マニフェスト（angular-app-manifest.mjs）の中身、getPrerenderParams による :param の展開。このサイトの「Prerendered N static routes」が出るまで。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ssr-prerender)

---

プリレンダー（SSG：Static Site Generation）は、`ng build` の中で全ルートを 1 回ずつサーバー描画し、結果を `<ルート>/index.html` として書き出すことです。この章では `@angular/build` の `prerenderPages` を入口に、サーバー用バンドルをディスクに書かずにメモリから読み込む仕組み、ルートを取り出すワーカー、Piscina のワーカーで並列に描く処理、書き出しとログ「`Prerendered N static routes.`」までを追います。

読む対象は `packages/angular/build/src/utils/server-rendering/` の `prerender.ts`・`render-worker.ts`・`routes-extractor-worker.ts`・`load-esm-from-memory.ts`・`esm-in-memory-loader/`・`manifest.ts`・`fetch-patch.ts`、と `builders/application/` の `options.ts`・`execute-post-bundle.ts`・`index.ts` です（angular-cli リポジトリ）。

1. [1. 概観](01-ssr-overview.md)
2. [2. renderApplication](02-ssr-render-application.md)
3. [3. platformServer と domino](03-ssr-platform-server.md)
4. [4. AngularAppEngine](04-ssr-app-engine.md)
5. [5. サーバールート](05-ssr-server-routes.md)
6. **6. プリレンダー**（この章）
7. [7. provideClientHydration](07-hydration-provide.md)
8. [8. ngh の書き出し](08-hydration-annotate.md)
9. [9. ノードの道順](09-hydration.md)
10. [10. ノードの確保](10-hydration-claim.md)
11. [11. コンテナと片付け](11-hydration-containers.md)
12. [12. 不一致のエラー](12-hydration-errors.md)
13. [13. i18n](13-hydration-i18n.md)
14. [14. イベントの再生](14-event-replay.md)
15. [15. インクリメンタル](15-incremental-hydration.md)

## 0. 全体の流れ

1. **ビルド**

   esbuild がブラウザ用とサーバー用（`main.server.mjs` など）のバンドルを作る。ここまでは[application builder の章](../boot/04-boot-application-build.md)。サーバー用はまだディスクに書かない。
2. **マニフェストを作る**

   `angular-app-manifest.mjs`（bootstrap 関数・HTML のアセット・ルート）をメモリ上のファイルとして足す（1 節）。
3. **サーバー用バンドルをメモリに**

   ファイルの中身を `SharedArrayBuffer` に載せ、ワーカーが ESM ローダーのフック経由で読む（2 節）。
4. **ルートを取り出す**

   ワーカー 1 本で `main.server.mjs` を読み、[第 5 回](05-ssr-server-routes.md)の `extractRoutesAndCreateRouteTree` を呼ぶ（3 節）。
5. **描く対象を選ぶ**

   `*` を含むルートや Server のルートを落とす（4 節）。
6. **ワーカーで並列に描く**

   Piscina のワーカー数本に、ルートをまとめて渡す。各ワーカーは [第 4 回](04-ssr-app-engine.md)の `AngularServerApp.handle` に `Request` を投げて HTML を受け取る（5〜6 節）。
7. **書き出しとログ**

   `chapter/router/index.html` などのブラウザ用ファイルとして足し、件数を数えて「`Prerendered N static routes.`」を出す（7 節）。

## 1. outputMode と、プリレンダーが走る条件

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L257–275 （▶ の行: 257–259, 262, 268, 270）

```ts
257 ▶   if (options.outputMode) {
258 ▶     if (!options.server) {
259 ▶       options.ssr = false;
260 │     }
261 │ 
262 ▶     if (options.prerender !== undefined) {
263 │       context.logger.warn(
264 │         'The "prerender" option is not considered when "outputMode" is specified.',
265 │       );
266 │     }
267 │ 
268 ▶     options.prerender = !!options.server;
269 │ 
270 ▶     if (options.appShell !== undefined) {
271 │       context.logger.warn(
272 │         'The "appShell" option is not considered when "outputMode" is specified.',
273 │       );
274 │     }
275 │   }
```

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L294–303 （▶ の行: 295–296, 299–300）

```ts
294 │   let prerenderOptions;
295 ▶   if (options.prerender) {
296 ▶     const { discoverRoutes = true, routesFile = undefined } =
297 │       options.prerender === true ? {} : options.prerender;
298 │ 
299 ▶     prerenderOptions = {
300 ▶       discoverRoutes,
301 │       routesFile: routesFile && path.join(workspaceRoot, routesFile),
302 │     };
303 │   }
```

`outputMode`（`"static"` か `"server"`）を書くと、古い `prerender` と `appShell` の設定は 262〜274 行目で無視されます。268 行目、`server`（`src/main.server.ts`）があれば `prerender = true`。296 行目で `discoverRoutes` が既定の `true` になり、ルートは Router の設定から取り出すことになります。つまり `outputMode` を書いた時点で、static でも server でも**プリレンダーは必ず走ります**。違いは何を出力するかです。

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L324–340 （▶ の行: 336–339）

```ts
324 │   const outputPath = options.outputPath ?? path.join(workspaceRoot, 'dist', projectName);
325 │   const outputOptions: NormalizedOutputOptions = {
326 │     browser: 'browser',
327 │     server: 'server',
328 │     media: 'media',
329 │     ...(typeof outputPath === 'string' ? undefined : outputPath),
330 │     base: normalizeDirectoryPath(
331 │       path.resolve(workspaceRoot, typeof outputPath === 'string' ? outputPath : outputPath.base),
332 │     ),
333 │     clean: options.deleteOutputPath ?? true,
334 │     // For app-shell and SSG server files are not required by users.
335 │     // Omit these when SSR is not enabled.
336 ▶     ignoreServer:
337 ▶       ((ssrOptions === undefined || serverEntryPoint === undefined) &&
338 ▶         options.outputMode === undefined) ||
339 ▶       options.outputMode === OutputMode.Static,
340 │   };
```

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L372–386 （▶ の行: 382–384）

```ts
372 │     /**
373 │      * If SSR is activated, create a distinct entry file for the `index.html`.
374 │      * This is necessary because numerous server/cloud providers automatically serve the `index.html` as a static file
375 │      * if it exists (handling SSG).
376 │      *
377 │      * For instance, accessing `foo.com/` would lead to `foo.com/index.html` being served instead of hitting the server.
378 │      *
379 │      * This approach can also be applied to service workers, where the `index.csr.html` is served instead of the prerendered `index.html`.
380 │      */
381 │     const indexBaseName = path.basename(indexOutput);
382 ▶     indexOutput =
383 ▶       (ssrOptions || prerenderOptions) && indexBaseName === 'index.html'
384 ▶         ? INDEX_HTML_CSR
385 │         : indexBaseName;
386 │ 
```

336〜339 行目、`static` では `ignoreServer` が真で、`dist/…/server/` を**書き出しません**。このサイトの `dist` に `browser/` と `prerendered-routes.json` しか無いのはこのためです。383〜384 行目、SSR かプリレンダーがあると、元の `index.html` は `index.csr.html` という名前で出力されます。`index.html` の名前は、プリレンダーした `/` のために空けておきます（コメントのとおり、多くのホスティングが `index.html` を勝手に配るため）。

📄 `angular-cli/packages/angular/build/src/builders/application/execute-post-bundle.ts` L123–146 （▶ の行: 125–126, 130, 141）

```ts
123 │   // Create server manifest
124 │   const initialFilesPaths = new Set(initialFiles.keys());
125 ▶   if (serverEntryPoint && (outputMode || prerenderOptions || appShellOptions || ssrOptions)) {
126 ▶     const { manifestContent, serverAssetsChunks } = await generateAngularServerAppManifest(
127 │       additionalHtmlOutputFiles,
128 │       outputFiles,
129 │       optimizationOptions.styles.inlineCritical ?? false,
130 ▶       undefined,
131 │       locale,
132 │       baseHref,
133 │       initialFilesPaths,
134 │       browserMetafile,
135 │       publicPath,
136 │     );
137 │ 
138 │     additionalOutputFiles.push(
139 │       ...serverAssetsChunks,
140 │       createOutputFile(
141 ▶         SERVER_APP_MANIFEST_FILENAME,
142 │         manifestContent,
143 │         BuildOutputFileType.ServerApplication,
144 │       ),
145 │     );
146 │   }
```

バンドルが終わったあとの手順（`executePostBundleSteps`）です。125 行目、サーバーの入口があればマニフェストを作ります。130 行目の `routes` はこの時点では `undefined` です。141 行目のファイル名が `angular-app-manifest.mjs`。中身は次の関数が作ります。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/manifest.ts` L170–201 （▶ の行: 172–173, 179, 193–195, 199）

```ts
170 │   for (const file of [...additionalHtmlOutputFiles.values(), ...outputFiles]) {
171 │     const extension = extname(file.path);
172 ▶     if (extension === '.html') {
173 ▶       const jsChunkFilePath = `assets-chunks/${file.path.replace(/[./]/g, '_')}.mjs`;
174 │       const escapedContent = escapeUnsafeChars(file.text);
175 │ 
176 │       serverAssetsChunks.push(
177 │         createOutputFile(
178 │           jsChunkFilePath,
179 ▶           `export default \`${escapedContent}\`;`,
180 │           BuildOutputFileType.ServerApplication,
181 │         ),
182 │       );
183 │ 
184 │       // JavaScript engine script parsers normalize `\r\n` (2 bytes in UTF-8) to `\n` (1 byte in UTF-8) in template literals.
185 │       // Subtracting the count of `\r\n` occurrences avoids allocating any temporary strings or match arrays for large assets.
186 │       let size = Buffer.byteLength(file.text);
187 │       let pos = file.text.indexOf('\r\n');
188 │       while (pos !== -1) {
189 │         size--;
190 │         pos = file.text.indexOf('\r\n', pos + 2);
191 │       }
192 │ 
193 ▶       serverAssets[file.path] =
194 ▶         `{size: ${size}, hash: '${file.hash}', text: () => import('./${jsChunkFilePath}').then(m => m.default)}`;
195 ▶     } else if (inlineCriticalCss && extension === '.css') {
196 │       const sheet = compileSheet(file.text, {
197 │         href: joinUrlParts(publicPath ?? '', file.path),
198 │       });
199 ▶       criticalCssPlans.push(encodePlan(sheet));
200 │     }
201 │   }
```

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/manifest.ts` L213–228 （▶ の行: 215–216, 219–222）

```ts
213 │   const manifestContent = `
214 │ export default {
215 ▶   bootstrap: () => import('./main.server.mjs').then(m => m.default),
216 ▶   baseHref: '${baseHref}',
217 │ ${criticalCssPlans.length ? `  criticalCssPlans: ${JSON.stringify(criticalCssPlans)},\n` : ''}${
218 │     nonce ? `  nonce: ${JSON.stringify(nonce)},\n` : ''
219 ▶   }  locale: ${JSON.stringify(locale)},
220 ▶   routes: ${JSON.stringify(routes, undefined, 2)},
221 ▶   entryPointToBrowserMapping: ${JSON.stringify(entryPointToBrowserMapping, undefined, 2)},
222 ▶   assets: {
223 │     ${Object.entries(serverAssets)
224 │       .map(([key, value]) => `'${key}': ${value}`)
225 │       .join(',\n    ')}
226 │   },
227 │ };
228 │ `;
```

1. **172〜182 行目：HTML を JS のモジュールに包む**

   `index.server.html` などの HTML を、179 行目の `` export default `…` `` だけの `assets-chunks/*.mjs` にします。サーバーは HTML をファイルとして読むのではなく、import して文字列で得ます。
2. **193〜194 行目：アセットの表**

   各 HTML を `{size, hash, text: () => import(…)}` として登録します。[第 4 回](04-ssr-app-engine.md)の `handleServe` が ETag に使う `hash` と `Content-Length` の `size` はこれです。
3. **195〜200 行目：重要 CSS の下ごしらえ**

   CSS はビルド時に解析しておき、結果（plan）だけを持たせます。第 4 回の `inlineCriticalCss` がこれを使います。
4. **213〜228 行目：書き出す本文**

   215 行目の `bootstrap` は `main.server.mjs` の default export（`src/main.server.ts` の bootstrap 関数）を返します。220 行目の `routes` は、いまは `undefined` と書かれます。

📄 `angular-cli/packages/angular/build/src/builders/application/execute-post-bundle.ts` L148–180 （▶ の行: 150–152, 166, 171, 173, 175, 180）

```ts
148 │   // Pre-render (SSG) and App-shell
149 │   // If localization is enabled, prerendering is handled in the inlining process.
150 ▶   if (
151 ▶     !partialSSRBuild &&
152 ▶     (prerenderOptions || appShellOptions || (outputMode && serverEntryPoint)) &&
153 │     !allErrors.length
154 │   ) {
155 │     assert(
156 │       indexHtmlOptions,
157 │       'The "index" option is required when using the "ssg" or "appShell" options.',
158 │     );
159 │ 
160 │     const {
161 │       output,
162 │       warnings,
163 │       errors,
164 │       serializableRouteTreeNode,
165 │       prerenderedRoutes: generatedPrerenderedRoutes,
166 ▶     } = await prerenderPages(
167 │       workspaceRoot,
168 │       baseHref,
169 │       appShellOptions,
170 │       prerenderOptions,
171 ▶       [...outputFiles, ...additionalOutputFiles],
172 │       assetFiles,
173 ▶       outputMode,
174 │       sourcemapOptions.scripts,
175 ▶       maxWorkers,
176 │     );
177 │ 
178 │     allErrors.push(...errors);
179 │     allWarnings.push(...warnings);
180 ▶     Object.assign(prerenderedRoutes, generatedPrerenderedRoutes);
```

150〜153 行目、部分的な SSR ビルド（開発サーバー用）でなく、`outputMode` とサーバーの入口があれば `prerenderPages` を呼びます。171 行目でサーバー用の出力と、いま足したマニフェストをまとめて渡し、175 行目の `maxWorkers` がワーカー数の上限です。

📄 `angular-cli/packages/angular/build/src/utils/environment-options.ts` L111–132 （▶ の行: 111, 117, 132）

```ts
111 ▶ const maxWorkersVariable = process.env['NG_BUILD_MAX_WORKERS'];
112 │ 
113 │ let customMaxWorkers: number | undefined;
114 │ if (isPresent(maxWorkersVariable)) {
115 │   const parsed = +maxWorkersVariable;
116 │   if (Number.isInteger(parsed) && parsed >= 1) {
117 ▶     customMaxWorkers = parsed;
118 │   }
119 │ }
120 │ 
121 │ /**
122 │  * Whether the maximum number of workers was explicitly configured via the
123 │  * `NG_BUILD_MAX_WORKERS` environment variable.
124 │  */
125 │ export const hasCustomMaxWorkers = customMaxWorkers !== undefined;
126 │ 
127 │ /**
128 │  * The maximum number of workers to use for parallel processing.
129 │  * This can be controlled by the `NG_BUILD_MAX_WORKERS` environment variable.
130 │  * When not set, defaults to available parallelism minus one to ensure the main thread is not starved.
131 │  */
132 ▶ export const maxWorkers = customMaxWorkers ?? Math.max(availableParallelism() - 1, 1);
```

132 行目、既定は「CPU の並列数 − 1」（最低 1）。111 行目の環境変数 `NG_BUILD_MAX_WORKERS` で変えられます。

## 2. サーバー用バンドルを、ディスクに書かずに読む

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/prerender.ts` L74–105 （▶ の行: 80, 85–86, 88, 97, 100, 105）

```ts
 74 │   const rawOutputFiles: Record<string, string> = {};
 75 │   const serverBundlesSourceMaps = new Map<string, string>();
 76 │   const warnings: string[] = [];
 77 │   const errors: string[] = [];
 78 │ 
 79 │   for (const { text, path, type } of outputFiles) {
 80 ▶     if (type !== BuildOutputFileType.ServerApplication && type !== BuildOutputFileType.ServerRoot) {
 81 │       continue;
 82 │     }
 83 │ 
 84 │     // Contains the server runnable application code
 85 ▶     if (extname(path) === '.map') {
 86 ▶       serverBundlesSourceMaps.set(path.slice(0, -4), text);
 87 │     } else {
 88 ▶       rawOutputFiles[path] = text;
 89 │     }
 90 │   }
 91 │ 
 92 │   // Inline sourcemap into JS file. This is needed to make Node.js resolve sourcemaps
 93 │   // when using `--enable-source-maps` when using in memory files.
 94 │   for (const [filePath, map] of serverBundlesSourceMaps) {
 95 │     const jsContent = rawOutputFiles[filePath];
 96 │     if (jsContent) {
 97 ▶       rawOutputFiles[filePath] =
 98 │         jsContent +
 99 │         '\n//# sourceMappingURL=' +
100 ▶         `data:application/json;base64,${Buffer.from(map).toString('base64')}`;
101 │     }
102 │   }
103 │   serverBundlesSourceMaps.clear();
104 │ 
105 ▶   const outputFilesForWorker = createSharedServerFiles(rawOutputFiles);
```

`prerenderPages` の最初の仕事です。80 行目でサーバー用のファイルだけを拾い、88 行目で「パス → 中身の文字列」の表にします。85〜86 行目と 94〜102 行目、ソースマップは別ファイルにせず JS の末尾に data URL で埋め込みます（メモリ上のファイルでもエラーの行番号を元のソースで出せるように）。105 行目で、その表を全部ワーカーと共有できる形に変えます。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/esm-in-memory-loader/utils.ts` L12–36 （▶ の行: 12–13, 18, 21–22, 24）

```ts
12 ▶ export const IMPORT_EXEC_ARGV =
13 ▶   '--import=' + pathToFileURL(join(__dirname, 'register-hooks.js')).href;
14 │ 
15 │ /**
16 │  * Creates a shared zero-copy `Uint8Array` backed by a `SharedArrayBuffer` for the given file content.
17 │  */
18 ▶ export function createSharedFile(content: string | Uint8Array): Uint8Array {
19 │   if (typeof content === 'string') {
20 │     const byteLength = Buffer.byteLength(content, 'utf-8');
21 ▶     const sab = new SharedArrayBuffer(byteLength);
22 ▶     Buffer.from(sab).write(content, 'utf-8');
23 │ 
24 ▶     return new Uint8Array(sab);
25 │   }
26 │ 
27 │   if (content.buffer instanceof SharedArrayBuffer) {
28 │     return content;
29 │   }
30 │ 
31 │   const sab = new SharedArrayBuffer(content.byteLength);
32 │   const view = new Uint8Array(sab);
33 │   view.set(content);
34 │ 
35 │   return view;
36 │ }
```

21〜24 行目、中身を `SharedArrayBuffer`（複数のスレッドが同じメモリを見られるバッファ）に書きます。ワーカーに渡すときにコピーされないので、ワーカーが何本あってもバンドルは 1 部です。12〜13 行目の `IMPORT_EXEC_ARGV` は、ワーカーの起動引数に足す `--import=…/register-hooks.js` です。これが Node の ESM ローダーにフックを登録します。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/esm-in-memory-loader/loader-hooks.ts` L113–148 （▶ の行: 117–118, 121, 126–127, 133, 135, 141）

```ts
113 │ export async function load(url: string, context: { format?: string | null }, nextLoad: Function) {
114 │   const { format } = context;
115 │ 
116 │   // Load the file from memory if the URL is based in the virtual root
117 ▶   if (url.startsWith(memoryVirtualRootUrl)) {
118 ▶     const rawSource = outputFiles[url.slice(memoryVirtualRootUrl.length)];
119 │     assert(rawSource !== undefined, 'Resolved in-memory ESM file should always exist: ' + url);
120 │ 
121 ▶     const source = typeof rawSource === 'string' ? rawSource : UTF8_DECODER.decode(rawSource);
122 │ 
123 │     // In-memory files have already been transformer during bundling and can be returned directly
124 │     return {
125 │       format: format ?? 'module',
126 ▶       shortCircuit: true,
127 ▶       source,
128 │     };
129 │   }
130 │ 
131 │   // Only module files potentially require transformation. Angular libraries that would
132 │   // need linking are ESM only.
133 ▶   if (format === 'module' && isFileProtocol(url)) {
134 │     // Check url instead of filePath so the check is robust across Windows and POSIX path separators.
135 ▶     if (!url.includes('/@angular/')) {
136 │       return nextLoad(url, context);
137 │     }
138 │ 
139 │     const filePath = fileURLToPath(url);
140 │     const fileBytes = await readFile(filePath);
141 ▶     const source = Buffer.concat([NG_SERVER_MODE_INIT_BYTES, fileBytes]);
142 │ 
143 │     return {
144 │       format,
145 │       shortCircuit: true,
146 │       source,
147 │     };
148 │   }
```

1. **117〜128 行目：仮想のフォルダの URL ならメモリから返す**

   同じファイルの `resolve` フックが、`memory://` の指定や、メモリ上のファイルからの相対 import を、`.angular/prerender-root/<UUID>/` という**実在しない**フォルダの `file://` URL に解決します。`load` はその URL を見て、118 行目で共有メモリの表から中身を引き、126〜127 行目でソースとして返します。ディスクには触りません。
2. **133〜147 行目：`@angular/*` の先頭に 1 行足す**

   node\_modules の `@angular/` のファイルだけ、141 行目で先頭に `var ngServerMode=true;`（18 行目）を付けて読ませます。Angular のコードは `ngServerMode` でサーバーかどうかを分岐するので、ワーカーの中ではそれが最初から真になります。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/load-esm-from-memory.ts` L31–51 （▶ の行: 32, 34, 38, 44）

```ts
31 │ export function loadEsmModuleFromMemory(
32 ▶   path: './main.server.mjs',
33 │ ): Promise<MainServerBundleExports>;
34 ▶ export function loadEsmModuleFromMemory(path: './server.mjs'): Promise<ServerBundleExports>;
35 │ export function loadEsmModuleFromMemory(
36 │   path: './main.server.mjs' | './server.mjs',
37 │ ): Promise<MainServerBundleExports | ServerBundleExports> {
38 ▶   return loadEsmModule(new URL(path, 'memory://')).catch((e) => {
39 │     assertIsError(e);
40 │ 
41 │     // While the error is an 'instanceof Error', it is extended with non transferable properties
42 │     // and cannot be transferred from a worker when using `--import`. This results in the error object
43 │     // displaying as '[Object object]' when read outside of the worker. Therefore, we reconstruct the error message here.
44 ▶     const error: Error & { code?: string } = new Error(e.message);
45 │     error.stack = e.stack;
46 │     error.name = e.name;
47 │     error.code = e.code;
48 │ 
49 │     throw error;
50 │   }) as Promise<MainServerBundleExports>;
51 │ }
```

ワーカーが使う入口はこれだけです。38 行目、`new URL('./main.server.mjs', 'memory://')` を動的 import すると、上のフックがメモリの中身を返します。44〜49 行目は、ワーカーの外へ渡せない形のエラーを作り直す処理です。

## 3. ルートを取り出す：routes-extractor-worker

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/prerender.ts` L114–140 （▶ の行: 115, 117, 119, 128, 133）

```ts
114 │   // Get routes to prerender
115 ▶   const {
116 │     errors: extractionErrors,
117 ▶     serializedRouteTree: serializableRouteTreeNode,
118 │     appShellRoute,
119 ▶   } = await getAllRoutes(
120 │     workspaceRoot,
121 │     baseHref,
122 │     outputFilesForWorker,
123 │     assetsReversed,
124 │     appShellOptions,
125 │     prerenderOptions,
126 │     sourcemap,
127 │     outputMode,
128 ▶   ).catch((err) => {
129 │     assertIsError(err);
130 │ 
131 │     return {
132 │       errors: [
133 ▶         `An error occurred while extracting routes.\n\n${err.stack ?? err.message ?? err.code ?? err}`,
134 │       ],
135 │       serializedRouteTree: [],
136 │       appShellRoute: undefined,
137 │     };
138 │   });
139 │ 
140 │   errors.push(...extractionErrors);
```

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/prerender.ts` L372–397 （▶ の行: 376, 385–386, 395–396）

```ts
372 │   const { routesFile, discoverRoutes } = prerenderOptions ?? {};
373 │   const routes: WritableSerializableRouteTreeNode = [];
374 │   let appShellRoute: string | undefined;
375 │ 
376 ▶   if (appShellOptions) {
377 │     appShellRoute = joinUrlParts(baseHref, appShellOptions.route);
378 │ 
379 │     routes.push({
380 │       renderMode: RouteRenderMode.Prerender,
381 │       route: appShellRoute,
382 │     });
383 │   }
384 │ 
385 ▶   if (routesFile) {
386 ▶     const routesFromFile = (await readFile(routesFile, 'utf8')).split(/\r?\n/);
387 │     for (const route of routesFromFile) {
388 │       routes.push({
389 │         renderMode: RouteRenderMode.Prerender,
390 │         route: joinUrlParts(baseHref, route.trim()),
391 │       });
392 │     }
393 │   }
394 │ 
395 ▶   if (!discoverRoutes) {
396 ▶     return { errors: [], appShellRoute, serializedRouteTree: routes };
397 │   }
```

`getAllRoutes` は、まず手で指定されたルートを集めます。376〜383 行目は App Shell、385〜393 行目は `routesFile`（1 行 1 ルートのテキスト）。395〜397 行目、`discoverRoutes` が偽ならそこで終わり。`outputMode` では 1 節の 296 行目で真なので、先へ進みます。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/prerender.ts` L405–438 （▶ の行: 405–407, 410, 418, 424, 432–433）

```ts
405 ▶   const renderWorker = new WorkerPool({
406 ▶     filename: require.resolve('./routes-extractor-worker'),
407 ▶     maxThreads: 1,
408 │     workerData: {
409 │       workspaceRoot,
410 ▶       outputFiles: outputFilesForWorker,
411 │       assetFiles: assetFilesForWorker,
412 │       outputMode,
413 │       hasSsrEntry: !!outputFilesForWorker['server.mjs'],
414 │     } as RoutesExtractorWorkerData,
415 │     execArgv: workerExecArgv,
416 │     env: {
417 │       ...process.env,
418 ▶       'NG_ALLOWED_HOSTS': 'localhost',
419 │     },
420 │   });
421 │ 
422 │   try {
423 │     const { serializedRouteTree, appShellRoute, errors }: RoutersExtractorWorkerResult =
424 ▶       await renderWorker.run({});
425 │ 
426 │     if (!routes.length) {
427 │       return { errors, appShellRoute, serializedRouteTree };
428 │     }
429 │ 
430 │     // Merge the routing trees
431 │     const uniqueRoutes = new Map();
432 ▶     for (const item of [...routes, ...serializedRouteTree]) {
433 ▶       if (!uniqueRoutes.has(item.route)) {
434 │         uniqueRoutes.set(item.route, item);
435 │       }
436 │     }
437 │ 
438 │     return { errors, serializedRouteTree: Array.from(uniqueRoutes.values()) };
```

405〜420 行目、`routes-extractor-worker` をワーカー 1 本（407 行目）で起動します。410 行目で 2 節の共有メモリを渡します。418 行目の `NG_ALLOWED_HOSTS: 'localhost'` は、ワーカーの中で動く `@angular/ssr/node` のホスト検査（第 4 回）に `localhost` を許すためです。424 行目で 1 回だけ実行し、手で指定したルートがあれば 431〜436 行目で重複を除いて混ぜます。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/routes-extractor-worker.ts` L29–54 （▶ の行: 33, 35, 37, 39–40, 42, 44–46, 52）

```ts
29 │ /** Renders an application based on a provided options. */
30 │ async function extractRoutes(): Promise<RoutersExtractorWorkerResult> {
31 │   // Load the compiler because `@angular/ssr/node` depends on `@angular/` packages,
32 │   // which must be processed by the runtime linker, even if they are not used.
33 ▶   await import('@angular/compiler');
34 │ 
35 ▶   const serverURL = outputMode !== undefined && hasSsrEntry ? await launchServer() : DEFAULT_URL;
36 │ 
37 ▶   patchFetchToLoadInMemoryAssets(serverURL);
38 │ 
39 ▶   const { ɵextractRoutesAndCreateRouteTree: extractRoutesAndCreateRouteTree } =
40 ▶     await loadEsmModuleFromMemory('./main.server.mjs');
41 │ 
42 ▶   const { routeTree, appShellRoute, errors } = await extractRoutesAndCreateRouteTree({
43 │     url: serverURL,
44 ▶     invokeGetPrerenderParams: outputMode !== undefined,
45 ▶     includePrerenderFallbackRoutes: outputMode === OutputMode.Server,
46 ▶     signal: AbortSignal.timeout(30_000),
47 │   });
48 │ 
49 │   return {
50 │     errors,
51 │     appShellRoute,
52 ▶     serializedRouteTree: routeTree.toObject(),
53 │   };
54 │ }
```

1. **33 行目：コンパイラを先に読む**

   コメントのとおり、`@angular/ssr/node` が依存する `@angular/*` を実行時にリンクするためです。
2. **35〜37 行目：URL の土台と fetch の差し替え**

   `server.ts`（`outputMode: "server"` の Express などの入口）があれば、それを `localhost` の空いたポートで本当に起動し、その URL を土台にします。無ければ `http://ng-localhost/`。37 行目で `fetch` を差し替えます（質問の節）。
3. **39〜47 行目：第 5 回の関数を呼ぶ**

   メモリの `main.server.mjs` から `ɵextractRoutesAndCreateRouteTree` を取り出して呼びます。44 行目、`outputMode` があれば `getPrerenderParams` を実行し、45 行目、fallback 用のルートは `server` のときだけ作ります。46 行目、30 秒で打ち切ります。
4. **52 行目：木を配列にして返す**

   `RouteTree.toObject()` は全節点の値の配列です。関数を含まないので、ワーカーの外へそのまま渡せます。

## 4. 描く対象を選ぶ

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/prerender.ts` L142–177 （▶ の行: 144, 149, 154, 156–157, 159–161, 169）

```ts
142 │   const serializableRouteTreeNodeForPrerender: WritableSerializableRouteTreeNode = [];
143 │   for (const metadata of serializableRouteTreeNode) {
144 ▶     if (outputMode !== OutputMode.Static && metadata.redirectTo) {
145 │       // Skip redirects if output mode is not static.
146 │       continue;
147 │     }
148 │ 
149 ▶     if (metadata.route.includes('*')) {
150 │       // Skip catch all routes from prerender.
151 │       continue;
152 │     }
153 │ 
154 ▶     switch (metadata.renderMode) {
155 │       case undefined: /* Legacy building mode */
156 ▶       case RouteRenderMode.Prerender:
157 ▶         serializableRouteTreeNodeForPrerender.push(metadata);
158 │         break;
159 ▶       case RouteRenderMode.Server:
160 ▶         if (outputMode === OutputMode.Static) {
161 ▶           errors.push(
162 │             `Route '${metadata.route}' is configured with server render mode, but the build 'outputMode' is set to 'static'.`,
163 │           );
164 │         }
165 │         break;
166 │     }
167 │   }
168 │ 
169 ▶   if (!serializableRouteTreeNodeForPrerender.length || errors.length > 0) {
170 │     return {
171 │       errors,
172 │       warnings,
173 │       output: {},
174 │       prerenderedRoutes: {},
175 │       serializableRouteTreeNode,
176 │     };
177 │   }
```

1. **144〜147 行目：リダイレクトは static のときだけ残す**

   `server` ではサーバーが 3xx を返せるので、作り置きは要りません。
2. **149〜152 行目：`*` を含むルートは描かない**

   `/**` や、fallback 用に残した `/product/*` は特定の URL ではないので描けません。このサイトの Router にある `{ path: '**', redirectTo: '' }` は第 5 回の取り出しで `/**` になり、ここで落ちます。
3. **154〜158 行目：Prerender だけを描く対象にする**

   Client のルートは HTML を作りません。サーバーがあれば第 4 回の分岐で `index.csr.html` を返しますが、static で配るならホスティング側でその URL を `index.csr.html` に振り向ける設定が要ります。
4. **159〜165 行目：static なのに Server のルートがあればエラー**

   サーバーを出力しない設定で「毎回サーバーで描く」は満たせないからです。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/prerender.ts` L179–191 （▶ の行: 181, 186–188）

```ts
179 │   // Add the extracted routes to the manifest file.
180 │   // We could re-generate it from the start, but that would require a number of options to be passed down.
181 ▶   const manifest = outputFilesForWorker[SERVER_APP_MANIFEST_FILENAME];
182 │   if (manifest) {
183 │     const manifestText = new TextDecoder().decode(manifest);
184 │ 
185 │     outputFilesForWorker[SERVER_APP_MANIFEST_FILENAME] = createSharedFile(
186 ▶       manifestText.replace(
187 ▶         'routes: undefined,',
188 ▶         `routes: ${JSON.stringify(serializableRouteTreeNodeForPrerender, undefined, 2)},`,
189 │       ),
190 │     );
191 │   }
```

186〜188 行目、メモリ上のマニフェストの `routes: undefined,` という文字列を、選んだルートの JSON で**置き換え**ます。これで、描画ワーカーの中の `ServerRouter.from` は[第 5 回](05-ssr-server-routes.md)の 3 節で見た「マニフェストに routes がある」道（`RouteTree.fromObject`）を通り、ワーカーごとにアプリを起動してルートを取り出し直さずに済みます。

## 5. renderPages：まとめてワーカーに渡す

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/prerender.ts` L250–275 （▶ の行: 252, 255, 257–258, 263）

```ts
250 │   const routesToRender: { route: string; outPath: string; isAppShell: boolean }[] = [];
251 │ 
252 ▶   for (const { route, redirectTo } of serializableRouteTreeNode) {
253 │     // Remove the base href from the file output path.
254 │     const routeWithoutBaseHref = getRouteWithoutBaseHref(route, baseHrefPathnameWithLeadingSlash);
255 ▶     const outPath = getRouteOutPath(route, baseHrefPathnameWithLeadingSlash);
256 │ 
257 ▶     if (typeof redirectTo === 'string') {
258 ▶       output[outPath] = { content: generateRedirectStaticPage(redirectTo), appShellRoute: false };
259 │ 
260 │       continue;
261 │     }
262 │ 
263 ▶     routesToRender.push({
264 │       route,
265 │       outPath,
266 │       isAppShell: appShellRouteWithoutBaseHref === routeWithoutBaseHref,
267 │     });
268 │   }
269 │ 
270 │   if (routesToRender.length === 0) {
271 │     return {
272 │       errors,
273 │       output,
274 │     };
275 │   }
```

252 行目でルートを 1 件ずつ見て、255 行目で書き出し先のパスを決めます（7 節の `getRouteOutPath`）。257〜261 行目、`redirectTo` のある static のルートは描かずに、`<meta http-equiv="refresh">` の HTML（6 節の `generateRedirectStaticPage`）を書きます。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/prerender.ts` L277–302 （▶ の行: 278–280, 287–289, 292, 300）

```ts
277 │   // Batch routes to reduce IPC overhead while ensuring enough batches exist for load balancing across worker threads.
278 ▶   const batchSize = Math.max(1, Math.min(50, Math.ceil(routesToRender.length / (maxThreads * 4))));
279 ▶   const numBatches = Math.ceil(routesToRender.length / batchSize);
280 ▶   const effectiveMaxThreads = Math.min(numBatches, maxThreads);
281 │ 
282 │   const workerExecArgv = [IMPORT_EXEC_ARGV];
283 │   if (sourcemap) {
284 │     workerExecArgv.push('--enable-source-maps');
285 │   }
286 │ 
287 ▶   const renderWorker = new WorkerPool({
288 ▶     filename: require.resolve('./render-worker'),
289 ▶     maxThreads: effectiveMaxThreads,
290 │     workerData: {
291 │       workspaceRoot,
292 ▶       outputFiles: outputFilesForWorker,
293 │       assetFiles: assetFilesForWorker,
294 │       outputMode,
295 │       hasSsrEntry: !!outputFilesForWorker['server.mjs'],
296 │     } as RenderWorkerData,
297 │     execArgv: workerExecArgv,
298 │     env: {
299 │       ...process.env,
300 ▶       'NG_ALLOWED_HOSTS': 'localhost',
301 │     },
302 │   });
```

📄 `angular-cli/packages/angular/build/src/utils/worker-pool.ts` L14–24 （▶ の行: 14, 17–18）

```ts
14 ▶ export class WorkerPool extends Piscina {
15 │   constructor(options: WorkerPoolOptions) {
16 │     const piscinaOptions: WorkerPoolOptions = {
17 ▶       minThreads: 1,
18 ▶       idleTimeout: 4_000,
19 │       // Web containers do not support transferable objects with receiveOnMessagePort which
20 │       // is used when the Atomics based wait loop is enable.
21 │       atomics: process.versions.webcontainer ? 'disabled' : 'sync',
22 │       recordTiming: false,
23 │       ...options,
24 │     };
```

278 行目、1 回に渡すルートの数（バッチ）は「全ルート ÷（ワーカー数 × 4）」の切り上げで、1〜50 に収めます。ワーカーとのやり取りの回数を減らしつつ、各ワーカーに 4 回ほど仕事が回るようにする計算です。280 行目、バッチ数よりワーカーを多くは起動しません。287〜302 行目の `WorkerPool` は 14 行目のとおり `Piscina`（Node の worker\_threads のスレッドプール）を継承した薄いクラスで、288 行目の `render-worker` を各スレッドで動かします。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/prerender.ts` L310–347 （▶ の行: 312–313, 315, 319–320, 326, 328, 347）

```ts
310 │     const renderingPromises: Promise<void>[] = [];
311 │ 
312 ▶     for (let i = 0; i < routesToRender.length; i += batchSize) {
313 ▶       const batch = routesToRender.slice(i, i + batchSize);
314 │       const urls = batch.map((item) => item.route);
315 ▶       const renderBatchPromise: Promise<RenderResult> = renderWorker.run(urls);
316 │       const batchResultPromise = renderBatchPromise
317 │         .then((results) => {
318 │           for (const result of results) {
319 ▶             if ('error' in result) {
320 ▶               errors.push(
321 │                 `An error occurred while prerendering route '${result.url}'.\n\n${result.error}`,
322 │               );
323 │               continue;
324 │             }
325 │ 
326 ▶             const routeInfo = routeOutPathMap.get(result.url);
327 │             if (routeInfo) {
328 ▶               output[routeInfo.outPath] = {
329 │                 content: result.content,
330 │                 appShellRoute: routeInfo.isAppShell,
331 │               };
332 │             }
333 │           }
334 │         })
335 │         .catch((err) => {
336 │           assertIsError(err);
337 │           for (const url of urls) {
338 │             errors.push(
339 │               `An error occurred while prerendering route '${url}'.\n\n${err.stack ?? err.message ?? err.code ?? err}`,
340 │             );
341 │           }
342 │         });
343 │ 
344 │       renderingPromises.push(batchResultPromise);
345 │     }
346 │ 
347 ▶     await Promise.all(renderingPromises);
```

312〜315 行目、バッチごとに `renderWorker.run(urls)` を呼びます。Piscina は空いたスレッドに順に配ります。結果は 1 件ずつ、エラーなら 319〜323 行目でため、成功なら 328〜331 行目で「書き出し先 → HTML」の表に入れます。347 行目で全バッチを待ちます。1 件の失敗で全体は止まりません（エラーは最後にまとめて出て、ビルドは失敗になる）。

## 6. render-worker：AngularServerApp に Request を投げる

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/render-worker.ts` L99–113 （▶ の行: 102, 104–105, 108, 110, 113）

```ts
 99 │ async function initialize() {
100 │   // Load the compiler because `@angular/ssr/node` depends on `@angular/` packages,
101 │   // which must be processed by the runtime linker, even if they are not used.
102 ▶   await import('@angular/compiler');
103 │ 
104 ▶   if (outputMode !== undefined && hasSsrEntry) {
105 ▶     serverURL = await launchServer();
106 │   }
107 │ 
108 ▶   patchFetchToLoadInMemoryAssets(serverURL);
109 │ 
110 ▶   return renderPages;
111 │ }
112 │ 
113 ▶ export default initialize();
```

113 行目、モジュールの default export は `initialize()` の Promise です。Piscina はそれが解決した関数（110 行目の `renderPages`）を、仕事ごとに呼びます。初期化は 3 節のワーカーと同じで、104〜106 行目で `server.ts` があれば起動し、108 行目で `fetch` を差し替えます。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/render-worker.ts` L66–97 （▶ の行: 70–71, 73–74, 78, 80, 86）

```ts
66 │ /**
67 │  * Renders routes in batch or individual URL.
68 │  */
69 │ async function renderPages(urls: string[]): Promise<RenderResult> {
70 ▶   const { ɵgetOrCreateAngularServerApp: getOrCreateAngularServerApp } =
71 ▶     await loadEsmModuleFromMemory('./main.server.mjs');
72 │ 
73 ▶   const angularServerApp = getOrCreateAngularServerApp({
74 ▶     allowStaticRouteRender: true,
75 │   });
76 │ 
77 │   const results: RenderResult = [];
78 ▶   for (const currentUrl of urls) {
79 │     try {
80 ▶       const content = await renderPage(currentUrl, angularServerApp);
81 │ 
82 │       if (content === null) {
83 │         throw new Error('The content returned was empty.');
84 │       }
85 │ 
86 ▶       results.push({ url: currentUrl, content });
87 │     } catch (err) {
88 │       assertIsError(err);
89 │       results.push({
90 │         url: currentUrl,
91 │         error: err.stack ?? err.message ?? err.code ?? `${err}`,
92 │       });
93 │     }
94 │   }
95 │ 
96 │   return results;
97 │ }
```

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/render-worker.ts` L46–64 （▶ の行: 53–54, 57, 61, 63）

```ts
46 │ /**
47 │  * Renders a single route URL.
48 │  */
49 │ async function renderPage(
50 │   url: string,
51 │   angularServerApp: { handle: (request: Request) => Promise<Response | null> },
52 │ ): Promise<string | null> {
53 ▶   const response = await angularServerApp.handle(
54 ▶     new Request(new URL(url, serverURL), { signal: AbortSignal.timeout(30_000) }),
55 │   );
56 │ 
57 ▶   if (!response) {
58 │     return null;
59 │   }
60 │ 
61 ▶   const location = response.headers.get('Location');
62 │ 
63 ▶   return location ? generateRedirectStaticPage(location) : response.text();
64 │ }
```

1. **70〜75 行目：本番と同じ AngularServerApp を作る**

   メモリの `main.server.mjs` から `ɵgetOrCreateAngularServerApp` を取り出し、74 行目の `allowStaticRouteRender: true` で作ります。これが第 4 回で見た「作り置きが無い Prerender のルートでも描画してよい」の旗です。この時点では作り置きはまだ無いので、`handleServe` が `null` を返したあと、描画に進みます。
2. **53〜55 行目：URL を Request にして handle に渡す**

   プリレンダー専用の描画関数はありません。**本番のサーバーと同じ `handle`** に、土台の URL（`http://ng-localhost/chapter/router` など）の `Request` を投げます。54 行目で 30 秒の `AbortSignal.timeout` を付けるので、`whenStable` が来ないページは中断されます。
3. **61〜63 行目：結果を文字列に**

   応答に `Location` があれば（ガードなどで別の URL に着地した）リダイレクトの HTML を、無ければ本文の HTML を返します。`null` なら 82〜84 行目でエラーです。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/utils.ts` L34–48 （▶ の行: 41, 44）

```ts
34 │ export function generateRedirectStaticPage(url: string): string {
35 │   return `
36 │ <!DOCTYPE html>
37 │ <html>
38 │   <head>
39 │     <meta charset="utf-8">
40 │     <title>Redirecting</title>
41 ▶     <meta http-equiv="refresh" content="0; url=${url}">
42 │   </head>
43 │   <body>
44 ▶     <pre>Redirecting to <a href="${url}">${url}</a></pre>
45 │   </body>
46 │ </html>
47 │ `.trim();
48 │ }
```

静的ファイルでは 3xx を返せないので、41 行目の `meta refresh` で 0 秒後に移動させ、44 行目にリンクを置いておきます。

## 7. 書き出しと「Prerendered N static routes.」

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/prerender.ts` L193–217 （▶ の行: 194, 211–212, 214–215）

```ts
193 │   // Render routes
194 ▶   const { errors: renderingErrors, output } = await renderPages(
195 │     baseHref,
196 │     sourcemap,
197 │     serializableRouteTreeNodeForPrerender,
198 │     maxThreads,
199 │     workspaceRoot,
200 │     outputFilesForWorker,
201 │     assetsReversed,
202 │     outputMode,
203 │     appShellRoute ?? appShellOptions?.route,
204 │   );
205 │ 
206 │   errors.push(...renderingErrors);
207 │ 
208 │   const prerenderedRoutes: PrerenderedRoutesRecord = {};
209 │   const baseHrefPathnameWithLeadingSlash = new URL(baseHref, 'http://localhost').pathname;
210 │ 
211 ▶   for (const metadata of serializableRouteTreeNodeForPrerender) {
212 ▶     const outPath = getRouteOutPath(metadata.route, baseHrefPathnameWithLeadingSlash);
213 │ 
214 ▶     if (output[outPath]) {
215 ▶       prerenderedRoutes[metadata.route] = { headers: metadata.headers };
216 │     }
217 │   }
```

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/prerender.ts` L453–463 （▶ の行: 454–455, 462）

```ts
453 │ function getRouteWithoutBaseHref(route: string, baseHrefPathname: string): string {
454 ▶   return addTrailingSlash(route).startsWith(baseHrefPathname)
455 ▶     ? addLeadingSlash(route.slice(baseHrefPathname.length))
456 │     : route;
457 │ }
458 │ 
459 │ function getRouteOutPath(route: string, baseHrefPathname: string): string {
460 │   const routeWithoutBaseHref = getRouteWithoutBaseHref(route, baseHrefPathname);
461 │ 
462 ▶   return stripLeadingSlash(posix.join(routeWithoutBaseHref, 'index.html'));
463 │ }
```

211〜217 行目、描く対象にした各ルートのうち、5 節の表に HTML が**実際に入ったもの**だけを `prerenderedRoutes` に記録します（値は `headers`）。書き出し先は 459〜463 行目で、`baseHref` を外したルートに `index.html` をつなぎ、先頭の `/` を落とします。`/` は `index.html`、`/chapter/router` は `chapter/router/index.html`。

📄 `angular-cli/packages/angular/build/src/builders/application/execute-post-bundle.ts` L182–200 （▶ の行: 183, 188, 196–198）

```ts
182 │     const indexHasBeenPrerendered = output[indexHtmlOptions.output];
183 ▶     for (const [path, { content, appShellRoute }] of Object.entries(output)) {
184 │       // Update the index contents with the app shell under these conditions:
185 │       // - Replace 'index.html' with the app shell only if it hasn't been prerendered yet.
186 │       // - Always replace 'index.csr.html' with the app shell.
187 │       let filePath = path;
188 ▶       if (appShellRoute && !indexHasBeenPrerendered) {
189 │         if (outputMode !== OutputMode.Server && indexHtmlOptions.output === INDEX_HTML_CSR) {
190 │           filePath = 'index.html';
191 │         } else {
192 │           filePath = indexHtmlOptions.output;
193 │         }
194 │       }
195 │ 
196 ▶       additionalHtmlOutputFiles.set(
197 ▶         filePath,
198 ▶         createOutputFile(filePath, content, BuildOutputFileType.Browser),
199 │       );
200 │     }
```

呼び出し元に戻ると、183 行目で表の 1 件ずつを、196〜199 行目で **`BuildOutputFileType.Browser`** のファイルとして足します。だから作り置きは `dist/…/browser/` に、ほかの JS や CSS と並んで出力されます。188〜194 行目は App Shell のときに `index.html` を差し替える特例です。

📄 `angular-cli/packages/angular/build/src/builders/application/execute-post-bundle.ts` L202–234 （▶ の行: 207, 212–213, 216, 233）

```ts
202 │     const serializableRouteTreeNodeForManifest: WritableSerializableRouteTreeNode = [];
203 │     for (const metadata of serializableRouteTreeNode) {
204 │       serializableRouteTreeNodeForManifest.push(metadata);
205 │     }
206 │ 
207 ▶     if (outputMode === OutputMode.Server) {
208 │       // Regenerate the manifest to append route tree. This is only needed if SSR is enabled.
209 │       const manifest = additionalOutputFiles.find((f) => f.path === SERVER_APP_MANIFEST_FILENAME);
210 │       assert(manifest, `${SERVER_APP_MANIFEST_FILENAME} was not found in output files.`);
211 │ 
212 ▶       const { manifestContent, serverAssetsChunks } = await generateAngularServerAppManifest(
213 ▶         additionalHtmlOutputFiles,
214 │         outputFiles,
215 │         optimizationOptions.styles.inlineCritical ?? false,
216 ▶         serializableRouteTreeNodeForManifest,
217 │         locale,
218 │         baseHref,
219 │         initialFilesPaths,
220 │         browserMetafile,
221 │         publicPath,
222 │       );
223 │ 
224 │       for (const chunk of serverAssetsChunks) {
225 │         const idx = additionalOutputFiles.findIndex(({ path }) => path === chunk.path);
226 │         if (idx === -1) {
227 │           additionalOutputFiles.push(chunk);
228 │         } else {
229 │           additionalOutputFiles[idx] = chunk;
230 │         }
231 │       }
232 │ 
233 ▶       manifest.contents = new TextEncoder().encode(manifestContent);
234 │     }
```

`server` のときだけ、207〜234 行目でマニフェストを作り直し、216 行目でルートの木（Server・Client・fallback のルートも含む全部）を入れます。いま書き出した作り置きの HTML も `additionalHtmlOutputFiles` に入っているので、213 行目でサーバーのアセットにもなり、第 4 回の `handleServe` がそれを返せるようになります。

📄 `angular-cli/packages/angular/build/src/builders/application/index.ts` L107–113 （▶ の行: 107–110, 112）

```ts
107 ▶         if (serverEntryPoint && !partialSSRBuild) {
108 ▶           const prerenderedRoutesLength = Object.keys(result.prerenderedRoutes).length;
109 ▶           let prerenderMsg = `Prerendered ${prerenderedRoutesLength} static route`;
110 ▶           prerenderMsg += prerenderedRoutesLength !== 1 ? 's.' : '.';
111 │ 
112 ▶           result.addLog(ansiColors.magenta(prerenderMsg));
113 │         }
```

最後に builder（[application builder の章](../boot/04-boot-application-build.md)で読んだ `runEsBuildBuildAction` の中）が、108 行目で `prerenderedRoutes` のキーの数を数えて、109〜110 行目でログの文を作ります。1 件なら単数形です。同じ表は `prerendered-routes.json` にも書かれます。

> **🧪 DEMO — このサイトの N を数える**
>
> `data/chapters.json` を読み込んで数えます。Router のルートは「固定ページ 4 本（`''`・`chapters`・`repos`・`glossary`）＋ シリーズ数 ＋ 章数 ＋ `**`」で、`**` は 149 行目で落ちます。
>
> 278〜280 行目の計算：バッチの大きさ **23**、バッチの数 **28**、実際に起動するワーカー **7** 本。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ssr-prerender)

## 呼び出しの連なり

- `executePostBundleSteps(...)` — builders/application/execute-post-bundle.ts L47
  - `generateAngularServerAppManifest(..., routes: undefined)` — server-rendering/manifest.ts L146
  - `prerenderPages(workspaceRoot, baseHref, ..., outputMode, maxWorkers)` — server-rendering/prerender.ts L57
    - `createSharedServerFiles(rawOutputFiles)` — esm-in-memory-loader/utils.ts L41
    - `getAllRoutes → WorkerPool(routes-extractor-worker)` — prerender.ts L358
      - `extractRoutes → ɵextractRoutesAndCreateRouteTree` — routes-extractor-worker.ts L30 — *第 5 回*
    - `manifestText.replace('routes: undefined,', ...)` — prerender.ts L186
    - `renderPages → WorkerPool(render-worker).run(urls)` — prerender.ts L228
      - `renderPages(urls) → renderPage(url, angularServerApp)` — render-worker.ts L69, L49
        - `AngularServerApp.handle(new Request(url))` — @angular/ssr app.ts — *第 4 回 → renderAngular*
  - `additionalHtmlOutputFiles.set('chapter/router/index.html', ...)` — execute-post-bundle.ts L196
- `Prerendered N static routes.` — builders/application/index.ts L109

## 聞かれそうな質問

**Q. プリレンダー中にコンポーネントが fetch するとどうなりますか？**

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/fetch-patch.ts` L24–53 （▶ の行: 25, 31, 33, 41, 43, 46）

```ts
24 │ export function patchFetchToLoadInMemoryAssets(baseURL: URL): void {
25 ▶   const originalFetch = globalThis.fetch;
26 │   const patchedFetch: typeof fetch = async (input, init) => {
27 │     let url: URL;
28 │     if (input instanceof URL) {
29 │       url = input;
30 │     } else if (typeof input === 'string') {
31 ▶       url = new URL(input, baseURL);
32 │     } else if (typeof input === 'object' && 'url' in input) {
33 ▶       url = new URL(input.url, baseURL);
34 │     } else {
35 │       return originalFetch(input, init);
36 │     }
37 │ 
38 │     const { hostname } = url;
39 │     const pathname = decodeURIComponent(url.pathname);
40 │ 
41 ▶     if (hostname !== baseURL.hostname || !assetFiles[pathname]) {
42 │       // Only handle relative requests or files that are in assets.
43 ▶       return originalFetch(input, init);
44 │     }
45 │ 
46 ▶     const cachedAsset = assetsCache.get(pathname);
47 │     if (cachedAsset) {
48 │       const { content, headers } = cachedAsset;
49 │ 
50 │       return new Response(content, {
51 │         headers,
52 │       });
53 │     }
```

ワーカーの `globalThis.fetch` は差し替えられています。31〜33 行目で相対 URL を土台の URL（`http://ng-localhost/` か、起動した `server.ts` の `localhost`）で解決し、41 行目、そのホストで、かつ `public/` などのアセットにあるパスなら、ネットワークに出ずにディスクのファイルを返します（46 行目以降でキャッシュ）。それ以外は 43 行目で元の `fetch` に回るので、外部の API には本当に通信します。`server.ts` に書いた API ルートは、起動したローカルのサーバーが答えます。

**Q. SSG とプリレンダーは何が違いますか？**

同じものです。`RenderMode.Prerender` の JSDoc は「Static Site Generation (SSG) mode」で、作り置きの HTML の `<app-root>` には `ng-server-context="ssg"` が付きます（[第 4 回](04-ssr-app-engine.md)）。SSR との違いは「描く時刻」だけで、描く関数は同じ `AngularServerApp.handle` → `renderAngular` です（6 節の 53〜55 行目）。だから Prerender でもハイドレーションの注釈（`ngh`）や `ng-state` が入ります。

**Q. Vercel ではどのファイルが配られていますか？**

このサイトは `outputMode: "static"` なので、336〜339 行目でサーバー用の出力はありません。`vercel.json` の `outputDirectory` は `dist/angular-deep-dive/browser` で、`/chapter/router` へのリクエストには 196〜199 行目で書いた `chapter/router/index.html` が静的ファイルとして配られます（`cleanUrls` で `.html` を省いた URL にする）。Node も `AngularAppEngine` も動いていません。`index.csr.html` も置かれていますが、Client のルートが無いので使われていません。

**Q. `outputMode: "static"` で `RenderMode.Server` を書くと？**

160〜163 行目で「`Route '…' is configured with server render mode, but the build 'outputMode' is set to 'static'.`」というエラーになり、169 行目で何も書き出さずに戻ります。Client は書けます。154〜158 行目で描く対象から外れるだけなので、その URL で `index.csr.html` を返すようにホスティングを設定します。

**Q. ルートが多くてビルドが遅いです。**

ワーカー数は 132 行目のとおり「並列数 − 1」が上限で、`NG_BUILD_MAX_WORKERS` で変えられます。1 ルートごとに、6 節の `handle` がアプリを起動し、`whenStable` を待ち、直列化します（第 4 回の `renderAngular`）。遅いページは、たいてい起動時の HTTP や `setTimeout` で安定が遅れています。描く必要の無いルートは Client にすれば 154〜158 行目で対象から外れます。

## 読み終えて

- `outputMode` を書くとプリレンダーは必ず走る。static はサーバーを出力せず、作り置きは `browser/<ルート>/index.html` に並ぶ。
- サーバー用バンドルは `SharedArrayBuffer` に載せ、ESM ローダーのフックで仮想のフォルダから import する。`@angular/*` には `ngServerMode=true` が付く。
- ルートはワーカー 1 本で第 5 回の取り出しを実行して得る。`*` を含むものと Prerender 以外は描かない。
- 描画は Piscina のワーカーにバッチで配り、各ワーカーは本番と同じ `AngularServerApp.handle` に `Request` を投げる。
- HTML が入ったルートの数が `Prerendered N static routes.` の N。このサイトでは「固定 4 ＋ シリーズ数 ＋ 章数」。

---

← 前: [サーバールート：RenderMode と、Router の設定からルートを取り出す仕組み](05-ssr-server-routes.md)  
次: [provideClientHydration：features と withDomHydration が足すもの](07-hydration-provide.md) →
