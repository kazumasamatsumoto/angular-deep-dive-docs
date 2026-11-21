[目次](../README.md) › [tools/esbuild の読み残し：束ね方の設定・JS の後処理・watch・i18n の差し込み・スタイル・コンパイラプラグインの残りを行で埋める](README.md) › 第 1 回 / 全 7 回

# 束ね方の設定を作る関数：ブラウザ・polyfills・サーバー・SSR の入口の esbuild オプション

> tools/esbuild/application-code-bundle.ts の未読の行：createBrowserCodeBundleOptions・createBrowserPolyfillBundleOptions・createServerPolyfillBundleOptions・createServerMainCodeBundleOptions・createSsrEntryCodeBundleOptions と、共通の getEsBuildCommonOptions・getEsBuildCommonPolyfillsOptions。

angular/angular-cli · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/esb-code-bundle)

---

ng build が esbuild を何回走らせるかは、アプリの設定で変わります。ブラウザの本体、polyfills、SSR なら main.server・server・polyfills.server。この章では、その 1 つ 1 つの esbuild の設定（`BuildOptions`）を作る 5 つの関数と、共通の土台の 3 つの関数を、**どの値がどの行で決まるか**で読みます。最後のデモで、本物の関数が 13 通りの設定に対して返した esbuild の設定を、束ごとに横に並べて見比べます。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/tools/esbuild/application-code-bundle.ts` のうち、これまでの章で読んでいない行です。この関数たちを呼んで BundlerContext に包む所（setup-bundling.ts）とブラウザの束の前半は [application builder の章](../boot/04-boot-application-build.md)、プラグインの差し込みの行と小さなプラグインそれぞれは [小さなプラグインと検査](../abl/05-abl-plugins.md)、external-packages の分岐は [dev-server の設定](../vds/01-vds-config.md)、splitting と chunkNames は [コード分割](../cli/07-cli-code-splitting.md)、i18n の footer とロケールの polyfill は [i18n](../cli/09-cli-i18n.md) の章で読みました。

1. **1. 束ね方の設定を作る関数**（この章）
2. [2. JavaScriptTransformer](02-esb-js-transformer.md)
3. [3. watcher](03-esb-watcher.md)
4. [4. I18nInliner](04-esb-i18n-inliner.md)
5. [5. スタイルのプラグイン](05-esb-styles.md)
6. [6. compiler-plugin の残り](06-esb-compiler-rest.md)
7. [7. spec と issue](07-esb-tests-issues.md)

## 0. 5 つの関数と、戻り値の形

| 関数 | 入口（entryPoints） | 戻り値 | 作られる条件（setup-bundling.ts） |
| --- | --- | --- | --- |
| `createBrowserCodeBundleOptions` | `options.entryPoints`（main など） | いつも関数（`BundlerOptionsFactory`） | いつも |
| `createBrowserPolyfillBundleOptions` | `polyfills: 'angular:polyfills'` | undefined・関数・オブジェクトのどれか | いつも呼ぶ。undefined なら作らない |
| `createServerMainCodeBundleOptions` | `main.server: 'angular:main-server'` | いつも関数 | `server` があり、outputMode・prerender・appShell・ssr のどれかがあるとき |
| `createSsrEntryCodeBundleOptions` | `server: 'angular:ssr-entry'` | いつも関数 | 上に加えて outputMode と `ssr.entry` があるとき |
| `createServerPolyfillBundleOptions` | `polyfills.server: 'angular:polyfills-server'` | undefined か関数 | サーバーの束を作るとき |

関数（`BundlerOptionsFactory`）は「読み込みキャッシュを受け取って `BuildOptions` を返す関数」です。BundlerContext は options を関数で受け取ったときだけ、watch で前の結果を使い回せます（[BundlerContext の章](../abl/03-abl-context-post.md)の 2 節）。だから、どの関数がオブジェクトを返し、どれが関数を返すかは、再ビルドの速さに効きます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L40–47 （▶ の行: 40, 45–47）

```ts
40 ▶ export function createBrowserCodeBundleOptions(
41 │   options: NormalizedApplicationBuildOptions,
42 │   target: string[],
43 │   sourceFileCache: SourceFileCache,
44 │   stylesheetBundler: ComponentStylesheetBundler,
45 ▶   angularCompilationContext: AngularCompilationContext,
46 ▶   templateUpdates: Map<string, string> | undefined,
47 ▶ ): BundlerOptionsFactory {
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L94–101 （▶ の行: 95–96, 99–100）

```ts
 94 │ 
 95 ▶     if (options.plugins) {
 96 ▶       buildOptions.plugins.push(...options.plugins);
 97 │     }
 98 │ 
 99 ▶     return buildOptions;
100 ▶   };
101 │ }
```

ブラウザの束の中身（48〜93 行目）は [application builder の章](../boot/04-boot-application-build.md)で読みました。残りは 95〜96 行目だけで、`options.plugins`（angular.json では書けず、`@angular/build` の private API の `buildApplication` に渡したプラグイン）を、Angular のプラグインの**後ろ**に足します。45 行目の `angularCompilationContext` はブラウザの束だけが本物（Primary）を受け取り、ほかの束は `createSecondaryContext()` の写しを受け取ります（[6 回目](06-esb-compiler-rest.md)）。46 行目の `templateUpdates` は HMR の Map で、ブラウザの束にだけ渡ります。

## 1. createBrowserPolyfillBundleOptions：3 通りの戻り値

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L103–137 （▶ の行: 109–111, 114–115, 117–118, 122, 131, 134–135）

```ts
103 │ export function createBrowserPolyfillBundleOptions(
104 │   options: NormalizedApplicationBuildOptions,
105 │   target: string[],
106 │   sourceFileCache: SourceFileCache,
107 │   stylesheetBundler: ComponentStylesheetBundler,
108 │   angularCompilationContext: AngularCompilationContext,
109 ▶ ): BuildOptions | BundlerOptionsFactory | undefined {
110 ▶   const namespace = 'angular:polyfills';
111 ▶   const polyfillBundleOptions = getEsBuildCommonPolyfillsOptions(
112 │     options,
113 │     namespace,
114 ▶     true,
115 ▶     sourceFileCache.loadResultCache,
116 │   );
117 ▶   if (!polyfillBundleOptions) {
118 ▶     return;
119 │   }
120 │ 
121 │   const { outputNames, polyfills } = options;
122 ▶   const hasTypeScriptEntries = polyfills?.some((entry) => /\.[cm]?tsx?$/.test(entry));
123 │ 
124 │   const buildOptions: BuildOptions = {
125 │     ...polyfillBundleOptions,
126 │     platform: 'browser',
127 │     // Note: `es2015` is needed for RxJS v6. If not specified, `module` would
128 │     // match and the ES5 distribution would be bundled and ends up breaking at
129 │     // runtime with the RxJS testing library.
130 │     // More details: https://github.com/angular/angular-cli/issues/25405.
131 ▶     mainFields: ['es2020', 'es2015', 'browser', 'module', 'main'],
132 │     entryNames: outputNames.bundles,
133 │     target,
134 ▶     entryPoints: {
135 ▶       'polyfills': namespace,
136 │     },
137 │   };
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L138–162 （▶ の行: 140, 142–143, 145–148, 161）

```ts
138 │ 
139 │   // Only add the Angular TypeScript compiler if TypeScript files are provided in the polyfills
140 ▶   if (hasTypeScriptEntries) {
141 │     buildOptions.plugins ??= [];
142 ▶     const pluginOptions = createCompilerPluginOptions(
143 ▶       options,
144 │ 
145 ▶       sourceFileCache,
146 ▶     );
147 ▶     buildOptions.plugins.push(
148 ▶       createCompilerPlugin(
149 │         // JS/TS options
150 │         pluginOptions,
151 │         angularCompilationContext,
152 │         // Component stylesheet options are unused for polyfills but required by the plugin
153 │         stylesheetBundler,
154 │       ),
155 │     );
156 │   }
157 │ 
158 │   // Use an options factory to allow fully incremental bundling when no TypeScript files are present.
159 │   // The TypeScript compilation is not currently integrated into the bundler invalidation so
160 │   // cannot be used with fully incremental bundling yet.
161 ▶   return hasTypeScriptEntries ? buildOptions : () => buildOptions;
162 │ }
```

1. **共通の polyfills の設定を作る**

   111〜116 行目。3 つめの引数 `true` は「angular.json の polyfills を、まずワークスペースからの相対パスとして解決してみる」の印です（5 節の 724 行目）。4 つめは SourceFileCache の読み込みキャッシュ。
2. **何も無ければ undefined**

   117〜119 行目。polyfills が空で、i18n も無ければ getEsBuildCommonPolyfillsOptions の 713〜715 行目（5 節で触れます）が undefined を返し、polyfills の束そのものを作りません。デモの「開発・zoneless」では polyfills の行が「undefined」です。
3. **入口は名前空間 1 つ**

   134〜136 行目。`polyfills` という名前の入口に、ディスクに無いモジュール `angular:polyfills` を置き、その中身（polyfills ごとの import の並び）は 5 節の virtual-module が作ります。131 行目の mainFields はブラウザの束と同じで `browser` を含みます。
4. **TypeScript の polyfills があればコンパイラを足す**

   122 行目、`.ts`・`.mts`・`.cts`・`.tsx` で終わる項目が 1 つでもあれば、140〜156 行目で Angular のコンパイラのプラグインを足します。
5. **オブジェクトか関数か**

   161 行目。TypeScript の項目があるときはオブジェクトを、無いときは「同じオブジェクトを返す関数」を返します。158〜160 行目のコメントのとおり、TypeScript のコンパイルは BundlerContext の無効化（invalidate）につながっていないので、使い回せないからです（bb13e406c7、babe4674f8）。

デモの「polyfills に src/polyfills.ts」で、polyfills の束だけ戻り値が「BuildOptions（オブジェクト）」になり、plugins の最後に `angular-compiler` が付きます。setup-bundling.ts は、オブジェクトなら `typescriptContexts`、関数なら `otherContexts` に入れます。前者は TypeScript のファイルが変わるたびに束ね直す組です。

> [!WARNING]
> **ハマりどころ**
>
> 142〜146 行目の `createCompilerPluginOptions` には読み込みキャッシュを渡していません（144 行目は空行）。ほかの束は 267 行目のように 3 つめの引数に `loadResultCache` を渡します。22.2.7 と新しい本家では、72dc9677cf がここに `sourceFileCache.loadResultCache` を足しています。同じコミットで 5 節の 767 行目の正規表現の `.` も `\.` に直りました。

## 2. createServerPolyfillBundleOptions：サーバーの polyfills は 3 つを決め打ち

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L164–200 （▶ の行: 167, 170–171, 173–174, 178–179, 181, 184, 186, 190, 193, 197）

```ts
164 │ export function createServerPolyfillBundleOptions(
165 │   options: NormalizedApplicationBuildOptions,
166 │   target: string[],
167 ▶   loadResultCache: LoadResultCache | undefined,
168 │ ): BundlerOptionsFactory | undefined {
169 │   const serverPolyfills: string[] = [];
170 ▶   const polyfillsFromConfig = new Set(options.polyfills);
171 ▶   const isNodePlatform = options.ssrOptions?.platform !== Platform.Neutral;
172 │ 
173 ▶   if (!isZonelessApp(options.polyfills)) {
174 ▶     serverPolyfills.push(isNodePlatform ? 'zone.js/node' : 'zone.js');
175 │   }
176 │ 
177 │   if (
178 ▶     polyfillsFromConfig.has('@angular/localize') ||
179 ▶     polyfillsFromConfig.has('@angular/localize/init')
180 │   ) {
181 ▶     serverPolyfills.push('@angular/localize/init');
182 │   }
183 │ 
184 ▶   serverPolyfills.push('@angular/platform-server/init');
185 │ 
186 ▶   const namespace = 'angular:polyfills-server';
187 │   const polyfillBundleOptions = getEsBuildCommonPolyfillsOptions(
188 │     {
189 │       ...options,
190 ▶       polyfills: serverPolyfills,
191 │     },
192 │     namespace,
193 ▶     false,
194 │     loadResultCache,
195 │   );
196 │ 
197 ▶   if (!polyfillBundleOptions) {
198 │     return;
199 │   }
200 │ 
```

サーバーの polyfills は angular.json の polyfills をそのまま使いません。169 行目の空の配列に、次の 3 つだけを条件つきで詰めます。

1. **zone.js**

   173〜175 行目。zoneless（polyfills に zone.js が無い）なら入れません。入れるときは、171 行目の `ssr.platform` が `neutral` 以外なら `zone.js/node`、neutral なら `zone.js`（7d883a152e、のちに af2c7e9444 で `platform` という名前に）。
2. **@angular/localize/init**

   177〜182 行目。ブラウザの polyfills に `@angular/localize` か `@angular/localize/init` があるときだけ。
3. **@angular/platform-server/init**

   184 行目、いつも（1449c84c7d）。

190 行目で options の polyfills だけをこの配列に差し替えて、ブラウザと同じ共通の関数に渡します。193 行目の `false` は、相対パスとして解決してみることをしない印です（3 つともパッケージ名なので）。デモの「SSR・zoneless」では `import "@angular/platform-server/init";` の 1 行だけ、「SSR・platform: 'neutral'」では `import "zone.js";` が先頭に来ます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L201–219 （▶ の行: 201–203, 206, 214–216）

```ts
201 ▶   const jsBanner: string[] = [];
202 ▶   if (polyfillBundleOptions.external?.length) {
203 ▶     jsBanner.push(`globalThis['ngServerMode'] = true;`);
204 │   }
205 │ 
206 ▶   if (isNodePlatform) {
207 │     // Note: Needed as esbuild does not provide require shims / proxy from ESModules.
208 │     // See: https://github.com/evanw/esbuild/issues/1921.
209 │     // Use an alias to avoid colliding with any `createRequire` import that may
210 │     // already exist in the bundled user code. ESBuild processes banner content
211 │     // as raw text outside of its module graph, so it cannot deduplicate or
212 │     // rename banner imports the way it does for user imports. Without the alias,
213 │     // a duplicate `import { createRequire }` binding would cause a runtime error.
214 ▶     jsBanner.push(
215 ▶       `import { createRequire as __ngCreateRequire } from 'node:module';`,
216 ▶       `globalThis['require'] ??= __ngCreateRequire(import.meta.url);`,
217 │     );
218 │   }
219 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L220–243 （▶ の行: 222–223, 228–231, 235, 240, 242）

```ts
220 │   const buildOptions: BuildOptions = {
221 │     ...polyfillBundleOptions,
222 ▶     platform: isNodePlatform ? 'node' : 'neutral',
223 ▶     outExtension: { '.js': '.mjs' },
224 │     // Note: `es2015` is needed for RxJS v6. If not specified, `module` would
225 │     // match and the ES5 distribution would be bundled and ends up breaking at
226 │     // runtime with the RxJS testing library.
227 │     // More details: https://github.com/angular/angular-cli/issues/25405.
228 ▶     mainFields: ['es2020', 'es2015', 'module', 'main'],
229 ▶     entryNames: '[name]',
230 ▶     banner: {
231 ▶       js: jsBanner.join('\n'),
232 │     },
233 │     target,
234 │     entryPoints: {
235 ▶       'polyfills.server': namespace,
236 │     },
237 │   };
238 │ 
239 │   buildOptions.plugins ??= [];
240 ▶   buildOptions.plugins.push(createServerBundleMetadata());
241 │ 
242 ▶   return () => buildOptions;
243 │ }
```

banner（esbuild が出力の先頭にそのまま書く文字列）を 2 種類組み立てます。202〜204 行目、`externalDependencies` で外に出すパッケージがあれば `globalThis['ngServerMode'] = true;`。外のパッケージは esbuild の `define`（共通の関数の 659〜668 行目、[ブラウザの読み込みの章](../boot/06-boot-browser-load.md)の引用）で置き換えられないので、実行時のグローバルで教えます（43127ddfb6）。206〜218 行目、Node なら `require` を作る 2 行。esbuild が出力する ESM には `require` が無く、CommonJS のパッケージを束ねた中の `require(...)` が落ちるためです（207〜208 行目のコメント）。`createRequire` を `__ngCreateRequire` という別名で import するのは、banner は esbuild のモジュールの木の外の文字列で、利用者のコードの `import { createRequire }` と名前が重なっても esbuild が名前を変えられないからです（210〜213 行目、9b33e17813）。

222〜229 行目はサーバー向けの形です。拡張子は `.mjs`、mainFields から `browser` を抜き、名前は hash なしの `[name]`。242 行目、いつも関数で返します。240 行目の server-bundle-metadata は [小さなプラグインの章](../abl/05-abl-plugins.md)の 7 節の印付けで、22.2.7 ではこの隣に Domino（サーバーで DOM を真似るライブラリ）を 1 回だけ束ねるためのプラグイン（cda246579e）が並びます。デモの plugins の列で見えます。

> [!NOTE]
> **ポイント**
>
> サーバーの polyfills の束は、共通の関数の 666 行目の `define` の `ngServerMode: 'false'` のまま作られます。サーバー用の `'true'` に変えるのは 6 節の getEsBuildServerCommonOptions（531〜532 行目）で、こちらの束はそれを通りません。デモの polyfills.server の列でも `ngServerMode: false` です。中に入る zone.js と `@angular/platform-server/init`（22.2.7 の init.mjs）には `ngServerMode` を読む所が無いので、出力は変わりません。

## 3. createServerMainCodeBundleOptions：main.server の束

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L245–265 （▶ の行: 251, 253, 255–256, 261–263）

```ts
245 │ export function createServerMainCodeBundleOptions(
246 │   options: NormalizedApplicationBuildOptions,
247 │   target: string[],
248 │   sourceFileCache: SourceFileCache,
249 │   stylesheetBundler: ComponentStylesheetBundler,
250 │   angularCompilationContext: AngularCompilationContext,
251 ▶ ): BundlerOptionsFactory {
252 │   const {
253 ▶     serverEntryPoint: mainServerEntryPoint,
254 │     workspaceRoot,
255 ▶     outputMode,
256 ▶     externalPackages,
257 │     ssrOptions,
258 │     polyfills,
259 │   } = options;
260 │ 
261 ▶   assert(
262 ▶     mainServerEntryPoint,
263 ▶     'createServerCodeBundleOptions should not be called without a defined serverEntryPoint.',
264 │   );
265 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L266–293 （▶ の行: 266–269, 271–272, 276, 278, 281, 285, 287–288, 291）

```ts
266 ▶   return (loadResultCache) => {
267 ▶     const pluginOptions = createCompilerPluginOptions(options, sourceFileCache, loadResultCache);
268 ▶     const mainServerNamespace = 'angular:main-server';
269 ▶     const mainServerInjectManifestNamespace = 'angular:main-server-inject-manifest';
270 │     const zoneless = isZonelessApp(polyfills);
271 ▶     const entryPoints: Record<string, string> = {
272 ▶       'main.server': mainServerNamespace,
273 │     };
274 │ 
275 │     const ssrEntryPoint = ssrOptions?.entry;
276 ▶     const isOldBehaviour = !outputMode;
277 │ 
278 ▶     if (ssrEntryPoint && isOldBehaviour) {
279 │       // Old behavior: 'server.ts' was bundled together with the SSR (Server-Side Rendering) code.
280 │       // This approach combined server-side logic and rendering into a single bundle.
281 ▶       entryPoints['server'] = ssrEntryPoint;
282 │     }
283 │ 
284 │     const buildOptions: BuildOptions = {
285 ▶       ...getEsBuildServerCommonOptions(options),
286 │       target,
287 ▶       banner: {
288 ▶         js: `import './polyfills.server.mjs';`,
289 │       },
290 │       entryPoints,
291 ▶       supported: getFeatureSupport(zoneless),
292 │     };
293 │ 
```

1. **server が無ければ assert で落とす**

   261〜264 行目。呼ぶ側（setup-bundling.ts）が server のあるときだけ呼ぶ約束を、ここで確かめます。
2. **関数を返す**

   266 行目から。267 行目で読み込みキャッシュつきのコンパイラの options を作ります。この束を関数にして結果を使い回せるようにしたのは aaaa4bc5f4（2024-11）です。
3. **入口は名前空間**

   271〜273 行目、`main.server` という名前の入口に `angular:main-server` を置きます。中身は下の 343 行目からのプラグインが作ります。
4. **outputMode が無ければ server.ts も同じ束に**

   276〜282 行目。outputMode を書かない形（outputMode が入った 3b00fc908d より前の設定）では、`ssr.entry` の server.ts を 2 つめの入口としてこの束に入れます。デモの「SSR・outputMode なし（旧来）」で entryPoints が 2 つになり、server の束（4 節）が作られません。
5. **polyfills.server を先に読ませる**

   287〜289 行目、banner に `import './polyfills.server.mjs';`。2 節の束の出力を、main.server.mjs のいちばん上で読みます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L311–327 （▶ の行: 311–313, 315, 319, 322–325, 327）

```ts
311 ▶     // Mark manifest and polyfills file as external as these are generated by a different bundle step.
312 ▶     (buildOptions.external ??= []).push(...SERVER_GENERATED_EXTERNALS);
313 ▶     const isNodePlatform = options.ssrOptions?.platform !== Platform.Neutral;
314 │ 
315 ▶     if (!isNodePlatform) {
316 │       // `@angular/platform-server` lazily depends on `xhr2` for XHR usage with the HTTP client.
317 │       // Since `xhr2` has Node.js dependencies, it cannot be used when targeting non-Node.js platforms.
318 │       // Note: The framework already issues a warning when using XHR with SSR.
319 ▶       buildOptions.external.push('xhr2');
320 │     }
321 │ 
322 ▶     buildOptions.plugins.push(
323 ▶       createServerBundleMetadata(),
324 ▶       createVirtualModulePlugin({
325 ▶         namespace: mainServerInjectManifestNamespace,
326 │         cache: loadResultCache,
327 ▶         entryPointOnly: false,
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L328–351 （▶ の行: 331–333, 339, 343–344, 347–349）

```ts
328 │         loadContent: async () => {
329 │           const contents: string[] = [
330 │             // Configure `@angular/ssr` manifest.
331 ▶             `import manifest from './${SERVER_APP_MANIFEST_FILENAME}';`,
332 ▶             `import { ɵsetAngularAppManifest } from '@angular/ssr';`,
333 ▶             `ɵsetAngularAppManifest(manifest);`,
334 │           ];
335 │ 
336 │           return {
337 │             contents: contents.join('\n'),
338 │             loader: 'js',
339 ▶             resolveDir: workspaceRoot,
340 │           };
341 │         },
342 │       }),
343 ▶       createVirtualModulePlugin({
344 ▶         namespace: mainServerNamespace,
345 │         cache: loadResultCache,
346 │         loadContent: async () => {
347 ▶           const mainServerEntryPointJsImport = entryFileToWorkspaceRelative(
348 ▶             workspaceRoot,
349 ▶             mainServerEntryPoint,
350 │           );
351 │ 
```

312 行目、`SERVER_GENERATED_EXTERNALS`（`./polyfills.server.mjs`・`./angular-app-manifest.mjs`・`./angular-app-engine-manifest.mjs`）を external にします。どれもこの束の**後**で別に作るファイルなので、束ねずに import の文字列のまま残します。315〜320 行目、neutral なら `xhr2` も外に（Node の部品に依存するため）。

名前空間のモジュールは 2 つです。324〜342 行目の `angular:main-server-inject-manifest` は、マニフェストを読んで `ɵsetAngularAppManifest` に渡す 3 行。327 行目の `entryPointOnly: false` は、入口ではなく次のモジュールの中の import から拾うためです。343〜377 行目の `angular:main-server` が入口の中身で、352〜369 行目（[SSR の HMR の章](../vds/04-vds-hmr-ssr.md)で読んだ行）で、マニフェストの import、@angular/ssr の内部 API、HMR 用の `ɵresetCompiledComponents`、利用者の main.server.ts の再 export を並べます。347〜350 行目の `entryFileToWorkspaceRelative`（5 節）が、main.server.ts を `./src/main.server` の形にします。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L371–386 （▶ の行: 374, 380–381, 384）

```ts
371 │           return {
372 │             contents: contents.join('\n'),
373 │             loader: 'js',
374 ▶             resolveDir: workspaceRoot,
375 │           };
376 │         },
377 │       }),
378 │     );
379 │ 
380 ▶     if (options.plugins) {
381 ▶       buildOptions.plugins.push(...options.plugins);
382 │     }
383 │ 
384 ▶     return buildOptions;
385 │   };
386 │ }
```

374 行目、生成するコードの resolveDir はワークスペースの根なので、`./src/main.server` はそこから解決されます。380〜382 行目、private API のプラグインはここでも最後に足します。

## 4. createSsrEntryCodeBundleOptions：server.ts の束

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L388–426 （▶ の行: 396–397, 402, 404–405, 409–410, 413）

```ts
388 │ export function createSsrEntryCodeBundleOptions(
389 │   options: NormalizedApplicationBuildOptions,
390 │   target: string[],
391 │   sourceFileCache: SourceFileCache,
392 │   stylesheetBundler: ComponentStylesheetBundler,
393 │   angularCompilationContext: AngularCompilationContext,
394 │ ): BundlerOptionsFactory {
395 │   const { workspaceRoot, ssrOptions, externalPackages } = options;
396 ▶   const serverEntryPoint = ssrOptions?.entry;
397 ▶   assert(
398 │     serverEntryPoint,
399 │     'createSsrEntryCodeBundleOptions should not be called without a defined serverEntryPoint.',
400 │   );
401 │ 
402 ▶   return (loadResultCache) => {
403 │     const pluginOptions = createCompilerPluginOptions(options, sourceFileCache, loadResultCache);
404 ▶     const ssrEntryNamespace = 'angular:ssr-entry';
405 ▶     const ssrInjectManifestNamespace = 'angular:ssr-entry-inject-manifest';
406 │     const isNodePlatform = options.ssrOptions?.platform !== Platform.Neutral;
407 │ 
408 │     const jsBanner: string[] = [];
409 ▶     if (options.externalDependencies?.length) {
410 ▶       jsBanner.push(`globalThis['ngServerMode'] = true;`);
411 │     }
412 │ 
413 ▶     if (isNodePlatform) {
414 │       // Note: Needed as esbuild does not provide require shims / proxy from ESModules.
415 │       // See: https://github.com/evanw/esbuild/issues/1921.
416 │       // Use an alias to avoid colliding with any `createRequire` import that may
417 │       // already exist in the bundled user code. ESBuild processes banner content
418 │       // as raw text outside of its module graph, so it cannot deduplicate or
419 │       // rename banner imports the way it does for user imports. Without the alias,
420 │       // a duplicate `import { createRequire }` binding would cause a runtime error.
421 │       jsBanner.push(
422 │         `import { createRequire as __ngCreateRequire } from 'node:module';`,
423 │         `globalThis['require'] ??= __ngCreateRequire(import.meta.url);`,
424 │       );
425 │     }
426 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L427–466 （▶ の行: 428, 430–431, 434, 436, 440–442, 451–452, 455–456, 466）

```ts
427 │     const buildOptions: BuildOptions = {
428 ▶       ...getEsBuildServerCommonOptions(options),
429 │       target,
430 ▶       banner: {
431 ▶         js: jsBanner.join('\n'),
432 │       },
433 │       entryPoints: {
434 ▶         'server': ssrEntryNamespace,
435 │       },
436 ▶       supported: getFeatureSupport(true),
437 │     };
438 │ 
439 │     buildOptions.plugins ??= [];
440 ▶     buildOptions.plugins.push(
441 ▶       createAngularLocalizeInitWarningPlugin(),
442 ▶       createCompilerPlugin(
443 │         // JS/TS options
444 │         pluginOptions,
445 │         angularCompilationContext,
446 │         // Component stylesheet bundler
447 │         stylesheetBundler,
448 │       ),
449 │     );
450 │ 
451 ▶     if (!externalPackages) {
452 ▶       buildOptions.plugins.push(createRxjsEsmResolutionPlugin());
453 │     }
454 │ 
455 ▶     // Mark manifest file as external. As this will be generated later on.
456 ▶     (buildOptions.external ??= []).push('*/main.server.mjs', ...SERVER_GENERATED_EXTERNALS);
457 │ 
458 │     if (!isNodePlatform) {
459 │       // `@angular/platform-server` lazily depends on `xhr2` for XHR usage with the HTTP client.
460 │       // Since `xhr2` has Node.js dependencies, it cannot be used when targeting non-Node.js platforms.
461 │       // Note: The framework already issues a warning when using XHR with SSR.
462 │       buildOptions.external.push('xhr2');
463 │     }
464 │ 
465 │     buildOptions.plugins.push(
466 ▶       createServerBundleMetadata({ ssrEntryBundle: true }),
```

outputMode があるときの server.ts は、main.server と別の束です（3b00fc908d）。違いは次の 4 つです。

1. **banner に polyfills.server の import が無い**

   408〜425 行目。この束は 409〜411 行目の `ngServerMode` と、413〜425 行目の require だけです。zone.js や platform-server/init を読む `import './polyfills.server.mjs'` は、main.server.mjs の banner（288 行目）にだけあります。
2. **async/await をそのまま**

   436 行目、`getFeatureSupport(true)`。polyfills が zone.js を含んでも、この束は zoneless と同じく async/await を下げません。server.ts は Express などのサーバーのコードで、Zone.js の中で動くアプリのコードは main.server.mjs の側にあるからです。デモの「SSR（outputMode: 'server'）」で、main.server の supported は `async-await: false`、server は `true` です。
3. **wasm のプラグインが無い**

   440〜449 行目は localize の警告とコンパイラだけで、ブラウザと main.server にある `createWasmPlugin` がありません。
4. **main.server.mjs を外に**

   456 行目、`*/main.server.mjs` を external にします。455 行目のコメントのとおり「あとで作られるファイル」なので、この束には取り込まず import の文字列のまま残します（3b00fc908d）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L467–497 （▶ の行: 470, 474–476, 486–487, 490–492, 496）

```ts
467 │       createVirtualModulePlugin({
468 │         namespace: ssrInjectManifestNamespace,
469 │         cache: loadResultCache,
470 ▶         entryPointOnly: false,
471 │         loadContent: () => {
472 │           const contents: string[] = [
473 │             // Configure `@angular/ssr` app engine manifest.
474 ▶             `import manifest from './${SERVER_APP_ENGINE_MANIFEST_FILENAME}';`,
475 ▶             `import { ɵsetAngularAppEngineManifest } from '@angular/ssr';`,
476 ▶             `ɵsetAngularAppEngineManifest(manifest);`,
477 │           ];
478 │ 
479 │           return {
480 │             contents: contents.join('\n'),
481 │             loader: 'js',
482 │             resolveDir: workspaceRoot,
483 │           };
484 │         },
485 │       }),
486 ▶       createVirtualModulePlugin({
487 ▶         namespace: ssrEntryNamespace,
488 │         cache: loadResultCache,
489 │         loadContent: () => {
490 ▶           const serverEntryPointJsImport = entryFileToWorkspaceRelative(
491 ▶             workspaceRoot,
492 ▶             serverEntryPoint,
493 │           );
494 │           const contents: string[] = [
495 │             // Configure `@angular/ssr` app engine manifest.
496 ▶             `import '${ssrInjectManifestNamespace}';`,
497 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L498–526 （▶ の行: 499–500, 502–504, 507, 519–520）

```ts
498 │             // Re-export all symbols including default export
499 ▶             `import * as server from '${serverEntryPointJsImport}';`,
500 ▶             `export * from '${serverEntryPointJsImport}';`,
501 │             // The below is needed to avoid
502 ▶             // `Import "default" will always be undefined because there is no matching export` warning when no default is present.
503 ▶             `const defaultExportName = 'default';`,
504 ▶             `export default server[defaultExportName]`,
505 │ 
506 │             // Add @angular/ssr exports
507 ▶             `export { AngularAppEngine } from '@angular/ssr';`,
508 │           ];
509 │ 
510 │           return {
511 │             contents: contents.join('\n'),
512 │             loader: 'js',
513 │             resolveDir: workspaceRoot,
514 │           };
515 │         },
516 │       }),
517 │     );
518 │ 
519 ▶     if (options.plugins) {
520 ▶       buildOptions.plugins.push(...options.plugins);
521 │     }
522 │ 
523 │     return buildOptions;
524 │   };
525 │ }
526 │ 
```

名前空間のモジュールの作りは 3 節と同じです。違いは、474〜476 行目で app engine のマニフェスト（ロケールごとのアプリの一覧）を渡すことと、503〜504 行目の書き方です。server.ts に default export が無いと、`export { default } from …` は esbuild の警告「Import "default" will always be undefined」になります（502 行目のコメント）。`import * as server` の名前空間オブジェクトから、変数に入れた名前 `'default'` で読めば、esbuild は静的にその export を探さないので警告が出ません。507 行目で `AngularAppEngine` を足して export します。

## 5. getEsBuildCommonPolyfillsOptions：polyfills の import を並べる

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L669–698 （▶ の行: 669–671, 678, 683, 685, 689, 691, 695–696）

```ts
669 ▶     loader: loaderExtensions,
670 ▶     footer,
671 ▶     plugins,
672 │   };
673 │ }
674 │ 
675 │ function getEsBuildCommonPolyfillsOptions(
676 │   options: NormalizedApplicationBuildOptions,
677 │   namespace: string,
678 ▶   tryToResolvePolyfillsAsRelative: boolean,
679 │   loadResultCache: LoadResultCache | undefined,
680 │ ): BuildOptions | undefined {
681 │   const { jit, workspaceRoot, i18nOptions, externalPackages } = options;
682 │ 
683 ▶   let polyfills = options.polyfills ? [...options.polyfills] : [];
684 │ 
685 ▶   const buildOptions = getEsBuildCommonOptions({
686 │     ...options,
687 │     // If any polyfills are local files, disable external packages for the polyfills build.
688 │     // This ensures that local files are properly bundled.
689 ▶     externalPackages: polyfills.some(isLocalFile) ? false : externalPackages,
690 │   });
691 ▶   buildOptions.splitting = false;
692 │   buildOptions.plugins ??= [];
693 │ 
694 │   // Angular JIT mode requires the runtime compiler
695 ▶   if (jit) {
696 ▶     polyfills.unshift('@angular/compiler');
697 │   }
698 │ 
```

1. **ローカルのファイルが 1 つでもあれば、パッケージも束ねる**

   685〜690 行目。`externalPackages`（ng serve が立てる、パッケージを束ねない印）でも、polyfills にローカルのファイルがあれば、この束だけ `false` にします（4643a8a3b3）。パッケージだけ外に出すと、ローカルのファイルとパッケージの import の実行の順が入れ替わるからです。判定はこの節の最後の `isLocalFile`。
2. **splitting を切る**

   691 行目。polyfills は 1 つのファイルで出し、チャンクに割りません。
3. **JIT ならコンパイラを先頭に**

   695〜697 行目。デモの「aot: false」で、生成された入口の 1 行目が `import "@angular/compiler";` になります。

デモの「externalPackages: true ＋ polyfills に src/polyfills.ts」で、ブラウザの束の packages は `external` のまま、polyfills の束だけ `bundle` になります。699〜711 行目のロケールは [i18n の章](../cli/09-cli-i18n.md)、713〜715 行目の「何も無ければ undefined」は [ブラウザの読み込みの章](../boot/06-boot-browser-load.md)で読みました。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L716–741 （▶ の行: 717–721, 724, 727–728, 731–732, 734, 737）

```ts
716 │ 
717 ▶   buildOptions.plugins.push(
718 ▶     createVirtualModulePlugin({
719 ▶       namespace,
720 ▶       cache: loadResultCache,
721 ▶       loadContent: async (_, build) => {
722 │         let polyfillPaths = polyfills;
723 │ 
724 ▶         if (tryToResolvePolyfillsAsRelative) {
725 │           polyfillPaths = await Promise.all(
726 │             polyfills.map(async (path) => {
727 ▶               if (path.startsWith('zone.js') || !extname(path)) {
728 ▶                 return path;
729 │               }
730 │ 
731 ▶               const potentialPathRelative = './' + path;
732 ▶               const result = await build.resolve(potentialPathRelative, {
733 │                 kind: 'import-statement',
734 ▶                 resolveDir: workspaceRoot,
735 │               });
736 │ 
737 ▶               return result.path ? potentialPathRelative : path;
738 │             }),
739 │           );
740 │         }
741 │ 
```

721 行目の `loadContent` は、esbuild が `angular:polyfills` を読みに来たときに呼ばれ、2 つめの引数の `build` で esbuild 自身の解決を借ります。724 行目、ブラウザの polyfills（1 節の 114 行目の `true`）のときだけ、各項目を相対パスとして解決してみます。727 行目、`zone.js` で始まるものと拡張子の無いもの（パッケージ名とみなす）はそのまま。731〜737 行目、`./src/polyfills.ts` として解決できれば `./` つきで、できなければ元の文字列のまま（パッケージのサブパスなど）使います（886cb3167a）。デモの記録では、`src/polyfills.ts` が `import "./src/polyfills.ts";` になりました。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L753–783 （▶ の行: 755–757, 767, 778–779, 782）

```ts
753 │ 
754 │         return {
755 ▶           contents,
756 ▶           loader: 'js',
757 ▶           resolveDir: workspaceRoot,
758 │         };
759 │       },
760 │     }),
761 │   );
762 │ 
763 │   return buildOptions;
764 │ }
765 │ 
766 │ function entryFileToWorkspaceRelative(workspaceRoot: string, entryFile: string): string {
767 ▶   return './' + toPosixPath(relative(workspaceRoot, entryFile).replace(/.[mc]?ts$/, ''));
768 │ }
769 │ 
770 │ /**
771 │  * Determines if a polyfill path is a local file.
772 │  * A local file is defined as a path starting with a `.` or having a TypeScript/JavaScript extension.
773 │  * `zone.js` and its subpaths are specifically excluded and treated as packages.
774 │  * @param path The polyfill path to check.
775 │  * @returns true if the path is a local file; false otherwise.
776 │  */
777 │ function isLocalFile(path: string): boolean {
778 ▶   if (path.startsWith('zone.js')) {
779 ▶     return false;
780 │   }
781 │ 
782 ▶   return path[0] === '.' || /\.[mc]?[jt]sx?$/.test(path);
783 │ }
```

757 行目、生成したコードはワークスペースの根から解決されます。743 行目（[i18n の章](../cli/09-cli-i18n.md)の引用）で 1 つずつ `import '…';` にして `\n` でつなぎ、ロケールがあれば 748・751 行目で改行なしにつなげます。デモの「i18n.sourceLocale: 'fr'」の入口は `import "angular:locale/data:fr";(globalThis.$localize ??= {}).locale = "fr";` の 1 行でした。44129f66a3 の 743 行目は `'` で囲むので、パスに `'` が入ると壊れたコードになります。22.2.7 は `JSON.stringify` で囲み（b3baa20c6c、#34391）、デモの記録の `"` はそのためです。3 節・4 節の main.server と server.ts の再 export も同じコミットで直っています。

767 行目の `entryFileToWorkspaceRelative` は、ワークスペースからの相対パスにして、末尾の `.ts`・`.mts`・`.cts` を外します。正規表現の先頭の `.` は「任意の 1 文字」なので、拡張子でなくても「1 文字 + ts」で終わる名前を削ります（22.2.7 は `\.`、72dc9677cf）。778〜782 行目の `isLocalFile` は、`zone.js` 系を除き、`.` で始まるか `.js`・`.ts` などで終わるものをローカルとみなします。

## 6. 共通の土台：getEsBuildServerCommonOptions と getEsBuildCommonOptions の頭

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L534–564 （▶ の行: 536–537, 542–543, 547, 557, 561–562）

```ts
534 │   return {
535 │     ...commonOptions,
536 ▶     platform: isNodePlatform ? 'node' : 'neutral',
537 ▶     outExtension: { '.js': '.mjs' },
538 │     // Note: `es2015` is needed for RxJS v6. If not specified, `module` would
539 │     // match and the ES5 distribution would be bundled and ends up breaking at
540 │     // runtime with the RxJS testing library.
541 │     // More details: https://github.com/angular/angular-cli/issues/25405.
542 ▶     mainFields: ['es2020', 'es2015', 'module', 'main'],
543 ▶     entryNames: '[name]',
544 │   };
545 │ }
546 │ 
547 ▶ function getEsBuildCommonOptions(options: NormalizedApplicationBuildOptions): BuildOptions {
548 │   const {
549 │     workspaceRoot,
550 │     outExtension,
551 │     optimizationOptions,
552 │     sourcemapOptions,
553 │     tsconfig,
554 │     externalDependencies,
555 │     outputNames,
556 │     preserveSymlinks,
557 ▶     jit,
558 │     loaderExtensions,
559 │     jsonLogs,
560 │     i18nOptions,
561 ▶     customConditions,
562 ▶     frameworkVersion,
563 │   } = options;
564 │ 
```

527〜533 行目（[platform-server の章](../platform/03-ssr-platform-server.md)の引用）で共通の options の define の `ngServerMode` を `'true'` に変え、536〜543 行目で 2 節と同じサーバー向けの形（platform・.mjs・mainFields・\[name\]）を重ねます。main.server と server.ts の束はこれを使い、2 節の polyfills.server は使いません。547〜563 行目は getEsBuildCommonOptions が読む options の欄で、どの束でも同じ値になります。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L579–594 （▶ の行: 581, 583–584, 589, 592）

```ts
579 │ 
580 │   // Core conditions that are always included
581 ▶   const conditions = [
582 │     // Required to support rxjs 7.x which will use es5 code if this condition is not present
583 ▶     'es2015',
584 ▶     'es2020',
585 │   ];
586 │   // The pre-linked code is not used with JIT for two reasons:
587 │   // 1) The pre-linked code may not have the metadata included that is required for JIT
588 │   // 2) The CLI is otherwise setup to use runtime linking for JIT to match the application template compilation
589 ▶   if (!jit) {
590 │     // The pre-linked package condition is based on the framework version.
591 │     // Currently this is specific to each patch version of the framework.
592 ▶     conditions.push('angular:linked-' + frameworkVersion);
593 │   }
594 │ 
```

conditions（package.json の exports のどの枝を選ぶか）の土台です。583〜584 行目の `es2015`・`es2020` はいつも。589〜593 行目、AOT のときだけ `angular:linked-<フレームワークの版>` を足し、パッケージが「この版向けにリンク済み」の枝を用意していればそれを選べるようにします（da7063f20f）。JIT で足さない理由は 586〜588 行目のコメントで、リンク済みのコードには JIT に要るメタデータが無いかもしれないからです。デモの記録では版が `22.2.6`（ワークスペースの @angular/core）で、「aot: false」の列だけこの条件がありません。596〜601 行目の custom conditions と `module`・`production` / `development` は [小さなプラグインの章](../abl/05-abl-plugins.md)の引用の範囲です。

そのあと 630〜672 行目で、どの束にも共通の `BuildOptions` を組み立てます。669〜671 行目、angular.json の `loader`、i18n の footer、603〜606 行目のプラグインの並びを最後に置きます。

## 7. デモ：本物の関数が返した esbuild の設定

> **🧪 DEMO — @angular/build 22.2.7 の create\*BundleOptions の戻り値（記録）**
>
> 小さなワークスペース（カウンターのアプリと main.server.ts・server.ts・polyfills.ts）を本物の normalizeOptions で正規化し、setup-bundling.ts と同じ順と条件で 5 つの関数を呼び、関数が返ったら読み込みキャッシュを渡して呼んだ結果です。「生成された入口」は、名前空間のモジュールの onLoad を esbuild 0.28.2 の `build.resolve` を借りて呼んだ戻り値です。
>
> この束には、名前空間で中身を作る入口がありません（BundlerOptionsFactory（関数））。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/esb-code-bundle)

見比べると、5 つの束の違いは platform・outExtension・mainFields・banner・define の ngServerMode・supported・external と、plugins の並びに集まっています。conditions と format はどの設定でも 5 つの束で同じ値で、全部が 6 節の getEsBuildCommonOptions から来るからです。packages が束によって違うのは「externalPackages: true ＋ polyfills に src/polyfills.ts」だけです（5 節の 689 行目）。記録は 22.2.7 なので、plugins には 44129f66a3 に無い Domino の 2 つのプラグインが入り、入口の import は `"` で囲まれています（5 節）。

## 8. どう録ったか

スクリプトは `<work>/esb-demo/a/` に置き、ワークスペースの node\_modules はサイトのものを symlink で借りました（終わってから消しました）。@angular/build は Node v24.22.1 でサイトの node\_modules の dist の .js を絶対パスで require し、normalizeOptions には builder の context の代わりに `workspaceRoot`・`logger`・`getProjectMetadata` だけの物を渡しています。コンポーネントのスタイルの bundler には空のオブジェクトを渡しました。5 つの関数は options を作るだけで、プラグインの `setup` を呼ばないので、それで足ります。

📄 `記録のスクリプト（rec-bundle.mjs）`

```
// 本物の create*BundleOptions（サイトの node_modules の @angular/build 22.2.7）を、正規化した options に当てて記録する。
// 使い方: node rec-bundle.mjs <サイトのディレクトリ> <出力 JSON>
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [site, out] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const app = path.join(here, 'app');
const require = createRequire(path.join(site, 'package.json'));
const B = path.join(site, 'node_modules/@angular/build/src');
const { normalizeOptions } = require(path.join(B, 'builders/application/options.js'));
const acb = require(path.join(B, 'tools/esbuild/application-code-bundle.js'));
const { SourceFileCache } = require(path.join(B, 'tools/esbuild/angular/source-file-cache.js'));
const { SecondaryCompilationContext } = require(path.join(B, 'tools/esbuild/angular/compilation-state.js'));
const { getSupportedBrowsers } = require(path.join(B, 'utils/supported-browsers.js'));
const { transformSupportedBrowsersToTargets, getSupportedNodeTargets } = require(path.join(B, 'tools/esbuild/target.js'));
const esbuild = require('esbuild');

const project = JSON.parse(readFileSync(path.join(app, 'angular.json'), 'utf8')).projects.demo;
const base = { browser: 'src/main.ts', tsConfig: 'tsconfig.app.json', optimization: false, sourceMap: true, extractLicenses: false };
const ssr = { server: 'src/main.server.ts', ssr: { entry: 'src/server.ts' }, outputMode: 'server' };
const variants = [
  { id: 'dev', label: '開発・zoneless（polyfills なし）', options: { ...base } },
  { id: 'zone', label: "polyfills: ['zone.js']", options: { ...base, polyfills: ['zone.js'] } },
  { id: 'tspoly', label: "polyfills に src/polyfills.ts", options: { ...base, polyfills: ['zone.js', 'src/polyfills.ts'] } },
  { id: 'prod', label: '本番（optimization: true）', options: { ...base, optimization: true, sourceMap: false, extractLicenses: true, polyfills: ['zone.js'] } },
  { id: 'jit', label: 'aot: false（JIT）', options: { ...base, aot: false, polyfills: ['zone.js'] } },
  { id: 'locale', label: "i18n.sourceLocale: 'fr'（localize なし）", options: { ...base }, project: { i18n: { sourceLocale: 'fr' } } },
  { id: 'ssr', label: "SSR（outputMode: 'server'）", options: { ...base, polyfills: ['zone.js'], ...ssr } },
  { id: 'ssrZoneless', label: 'SSR・zoneless', options: { ...base, ...ssr } },
  { id: 'neutral', label: "SSR・platform: 'neutral'", options: { ...base, polyfills: ['zone.js'], ...ssr, ssr: { entry: 'src/server.ts', platform: 'neutral' } } },
  { id: 'legacy', label: 'SSR・outputMode なし（旧来）', options: { ...base, polyfills: ['zone.js'], server: 'src/main.server.ts', ssr: { entry: 'src/server.ts' } } },
  { id: 'external', label: "externalDependencies: ['@demo/ext']（SSR）", options: { ...base, polyfills: ['zone.js'], ...ssr, externalDependencies: ['@demo/ext'] } },
];

const hide = (s) => s.replaceAll(app, '<app>').replaceAll(site, '~/angular-research/angular-deep-dive');
const pick = (o) => {
  if (!o) return null;
  const keys = ['platform', 'format', 'entryPoints', 'entryNames', 'chunkNames', 'outExtension', 'mainFields', 'conditions', 'resolveExtensions',
    'packages', 'splitting', 'ignoreAnnotations', 'external', 'define', 'supported', 'banner', 'footer', 'target', 'minifyIdentifiers', 'minifySyntax', 'minifyWhitespace',
    'sourcemap', 'legalComments', 'pure', 'metafile', 'write', 'outdir', 'absWorkingDir', 'tsconfig'];
  const r = {};
  for (const k of keys) if (o[k] !== undefined) r[k] = JSON.parse(hide(JSON.stringify(o[k])));
  r.plugins = (o.plugins ?? []).map((p) => p.name);
  return r;
};

// virtual-module-plugin の onLoad を、本物の esbuild の build.resolve を借りて呼び、生成されるコードを記録する
async function virtualContents(o) {
  const captured = [];
  let real;
  for (const p of o.plugins ?? []) {
    const fake = {
      initialOptions: o,
      onResolve() {},
      onStart() {},
      onEnd() {},
      onDispose() {},
      onLoad(opts, cb) {
        if (opts.namespace && opts.namespace.startsWith('angular:')) captured.push({ plugin: p.name, namespace: opts.namespace, cb });
      },
      resolve: (...a) => real.resolve(...a),
    };
    if (/^angular-(polyfills|main-server|ssr-entry)/.test(p.name)) p.setup(fake);
  }
  const results = [];
  await esbuild.build({
    absWorkingDir: app, write: false, entryPoints: [], logLevel: 'silent',
    plugins: [{ name: 'grab', setup(b) { real = b; b.onStart(async () => {
      for (const c of captured) {
        const r = await c.cb({ path: c.namespace, namespace: c.namespace, suffix: '', pluginData: undefined, with: {} });
        results.push({ plugin: c.plugin, namespace: c.namespace, contents: hide(String(r?.contents ?? '')) });
      }
    }); } }],
  });
  return results;
}

const records = [];
for (const v of variants) {
  const logs = [];
  const logger = { warn: (m) => logs.push(m), info: () => {}, error: (m) => logs.push(m), debug: () => {}, log: () => {} };
  const context = { workspaceRoot: app, target: { project: 'demo', target: 'build' }, logger, getProjectMetadata: async () => ({ ...project, ...(v.project ?? {}) }) };
  const options = await normalizeOptions(context, 'demo', structuredClone(v.options));
  const browsers = getSupportedBrowsers(options.projectRoot, logger);
  const target = transformSupportedBrowsersToTargets(browsers);
  const nodeTargets = [...target, ...getSupportedNodeTargets()];
  const cache = new SourceFileCache();
  const ctx = new SecondaryCompilationContext();
  const styles = {};
  const bundles = [];
  const add = async (id, fn, value) => {
    const t0 = performance.now();
    let o = value, factory = typeof value === 'function';
    if (factory) o = value(cache.loadResultCache);
    const ms = performance.now() - t0;
    bundles.push({ id, fn, returned: value === undefined ? 'undefined' : factory ? 'BundlerOptionsFactory（関数）' : 'BuildOptions（オブジェクト）', options: pick(o), virtual: o ? await virtualContents(o) : [], ms: +ms.toFixed(2) });
  };
  await add('browser', 'createBrowserCodeBundleOptions', acb.createBrowserCodeBundleOptions(options, target, cache, styles, ctx, undefined));
  await add('polyfills', 'createBrowserPolyfillBundleOptions', acb.createBrowserPolyfillBundleOptions(options, target, cache, styles, ctx));
  const runsServer = options.serverEntryPoint && (options.outputMode || options.prerenderOptions || options.appShellOptions || options.ssrOptions);
  if (runsServer) {
    await add('server', 'createServerMainCodeBundleOptions', acb.createServerMainCodeBundleOptions(options, nodeTargets, cache, styles, ctx));
    if (options.outputMode && options.ssrOptions?.entry) {
      await add('ssr', 'createSsrEntryCodeBundleOptions', acb.createSsrEntryCodeBundleOptions(options, nodeTargets, cache, styles, ctx));
    }
    await add('serverPolyfills', 'createServerPolyfillBundleOptions', acb.createServerPolyfillBundleOptions(options, nodeTargets, cache.loadResultCache));
  }
  records.push({ id: v.id, label: v.label, input: v.options, project: v.project ?? null, frameworkVersion: options.frameworkVersion, logs: logs.map(hide), bundles });
}
writeFileSync(out, JSON.stringify({ version: require(path.join(site, 'node_modules/@angular/build/package.json')).version, esbuild: esbuild.version, node: process.version, records }, null, 1));
console.log('ok', records.length);

```

## ここまでの呼び出し

- `executeBuild(options, context, rebuildState?)` — builders/application/execute-build.ts
  - `setupBundlerContexts(options, target, codeBundleCache, …)` — setup-bundling.ts
    - `createBrowserCodeBundleOptions(…)` — application-code-bundle.ts 40 — *関数を返す*
    - `createBrowserPolyfillBundleOptions(…, ctx.createSecondaryContext())` — 103
      - `getEsBuildCommonPolyfillsOptions(options, 'angular:polyfills', true, cache)` — 675
        - `getEsBuildCommonOptions({ ...options, externalPackages })` — 547
        - `createVirtualModulePlugin({ namespace, loadContent })` — 717 — *import の並びは esbuild が読みに来たとき*
    - `createServerMainCodeBundleOptions(…, nodeTargets, …)` — 245 — *server があるとき*
      - `getEsBuildServerCommonOptions(options)` — 527
    - `createSsrEntryCodeBundleOptions(…)` — 388 — *outputMode と ssr.entry があるとき*
    - `createServerPolyfillBundleOptions(options, nodeTargets, cache)` — 164
  - `new BundlerContext(workspaceRoot, watch, optionsOrFactory, …)` — bundler-context.ts — *関数なら factory(loadCache) で BuildOptions*

## テストと直し方

application-code-bundle.ts には単体の spec がありません。固めているのは builders/application/tests の、builder を丸ごと動かす spec です。

| spec（builders/application/tests/） | describe / it と行 | この章のどこ |
| --- | --- | --- |
| options/polyfills\_spec.ts | describe Option: polyfills（19 行目）を baseUrl の 3 通りで繰り返す。TypeScript のファイル（36 行目）・JavaScript のファイル（49 行目）・無いファイル（64 行目）・`['zone.js', 'zone.js/testing']`（80 行目） | 1 節と 5 節。ローカルとパッケージが混ざるときの順（689 行目）と、`'` を含むパス（743 行目）の it はありません |
| options/server\_spec.ts | describe Option: "server"（23 行目、it 6 件） | 3 節の入口 |
| options/ssr\_spec.ts | describe Option: "ssr"（25 行目、it 5 件） | 4 節の入口と server の出力 |
| options/conditions\_spec.ts・behavior/build-conditions\_spec.ts | describe Option: "conditions"（17 行目）・Behavior: "conditional imports"（17 行目） | 6 節の conditions |

../angular-cli で `pnpm bazel test //packages/angular/build:application_integration_tests --nocache_test_results --test_output=all "--test_arg=--filter=(Option: polyfills|Option: .ssr.|Option: .server.|Option: .conditions.|Behavior: .conditional imports.)"` を走らせ、25 の shard の「Ran N」を足して 40 件、0 failures、PASSED でした。

練習用の作業木（44129f66a3）で 5 節を固めてみました。22.2.7 の polyfills\_spec.ts にある it「uses a provided file with a single quote in its path」（`src/dev's polyfills/polyfills.js` を polyfills に入れる）を 44129f66a3 の spec に足すと、esbuild のエラー「Expected ";" but found "s"」（入口の 1 行目が `import './src/dev's polyfills/polyfills.js';` で、`'` で文字列が切れる）で落ち、flaky の 3 回とも FAILED でした 743 行目を `import ${JSON.stringify(toPosixPath(file))};` に変えると この it と Option: polyfills の 12 件、合わせて 13 件が通りました（22.2.7 の b3baa20c6c と同じ直し方です）

直すとしたら、ファイルと関数は次のとおりです。

- polyfills の順：`getEsBuildCommonPolyfillsOptions`（675 行目）。固める it は polyfills\_spec.ts に、`externalPackages` を立てた dev-server 側か、ローカルのファイルとパッケージを交互に並べて出力の中の順を見る形で書けます。
- サーバーの polyfills の define：`createServerPolyfillBundleOptions`（164 行目）。`ngServerMode` を `'true'` にそろえるなら 220 行目の `buildOptions` に足す形で、固める spec は ssr\_spec.ts に polyfills.server.mjs の中身を見る it です。

## 聞かれそうな質問

**Q. ng build で esbuild は何回走りますか？**

ブラウザの本体で 1 回、polyfills があればもう 1 回（1 節の 117 行目で undefined なら無し）。SSR なら main.server・polyfills.server、outputMode と ssr.entry があれば server.ts でさらに 1 回ずつです。ほかにグローバルのスタイルと scripts の束が、初期と遅延の 2 通りずつ加わります（setup-bundling.ts）。

**Q. polyfills に .ts のファイルを入れると何が変わりますか？**

122 行目で見つかり、140〜156 行目で Angular のコンパイラのプラグインが付き、161 行目で関数ではなくオブジェクトが返ります。TypeScript のファイルが変わるたびに束ね直す組に入り、watch で結果を使い回せません。ng serve では、689 行目で polyfills のパッケージも束ねるようになります。

**Q. SSR の server.ts の束で async/await が下げられないのはなぜですか？**

436 行目が zone.js の有無を見ずに `getFeatureSupport(true)` を渡すからです。Zone.js の中で動くアプリのコードは main.server.mjs の束（291 行目、zone.js があれば false）にあり、server.ts は456 行目で external にしたその出力を、束ねずに参照するだけです。

**Q. main.server.mjs の先頭にある `import './polyfills.server.mjs'` はどこで書かれますか？**

287〜289 行目の banner です。polyfills.server.mjs は 2 節の別の束の出力で、312 行目で external にしてあるので、文字列のまま残ります。

**Q. `globalThis['ngServerMode'] = true` は、いつ出力に入りますか？**

polyfills.server（202〜204 行目）と server.ts（409〜411 行目）の束で、`externalDependencies` があるときだけです。束ねたコードは define で置き換わりますが、外のパッケージの中の `ngServerMode` は置き換わらないので、実行時のグローバルで教えます。デモの「externalDependencies: \['@demo/ext'\]（SSR）」で banner に入ります。ng serve の SSR は、Vite の事前バンドルに `ngServerMode: 'true'` の define を渡す別の道です（dev-server/vite/server.ts）。

## 読み終えて

- 束の設定は全部 getEsBuildCommonOptions から始まり、ブラウザ・サーバー・polyfills の違いは platform・mainFields・outExtension・banner・define・supported・external・プラグインの並びに集まる。
- 戻り値が関数かオブジェクトかで、watch で結果を使い回せるかが決まる。polyfills に TypeScript を入れるとオブジェクトになる。
- polyfills の中身はディスクに無い名前空間のモジュールで、esbuild が読みに来たときに import の並びを作る。ブラウザの polyfills だけ相対パスとして解決してみる。
- サーバーの polyfills は zone.js・localize/init・platform-server/init の 3 つを決め打ちで並べ、main.server が banner で先に読む。server.ts の束は main.server.mjs を外に置き、async/await を下げない。
- 22.2.7 と新しい本家では、polyfills のコンパイラへの読み込みキャッシュ、拡張子の正規表現、パスの引用符、Domino のプラグインが 44129f66a3 から変わっている。

---

← 前: [spec と issue を読む：application builder の読み残しを固めているテスト](../abl/06-abl-tests-issues.md)  
次: [JavaScriptTransformer：esbuild に渡す前の JS をワーカーで書き換える](02-esb-js-transformer.md) →
