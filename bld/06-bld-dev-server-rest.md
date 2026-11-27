[目次](../README.md) › [@angular/build の読み残し（sass・i18n・dev-server・unit-test）](README.md) › 第 6 回 / 全 9 回

# ng serve の入口の残り：dev-server の options と Vite のサーバー

> builders/dev-server/options.ts・vite/index.ts・vite/server.ts：inspect・PORT・allowedHosts の正規化、serveWithVite がビルドの options を書き換える所、ssl と basic-ssl、SSR のデバッガーの待ち、ブラウザからのログとキーボードの r の受け口。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bld-dev-server-rest)

---

この章で分かること：`ng serve` の options が `normalizeOptions` でどの形になり（inspect・PORT・allowedHosts など）、`serveWithVite` がビルドの options をどう書き換え、Vite のサーバーを立てたあとにどんな受け口（ブラウザからのログ、キーボードの `r`、デバッガー）を開くか。そして、その受け口のいくつかが、変わった入力でどう壊れるか。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/src/builders/dev-server/` の `options.ts`・`vite/index.ts`・`vite/server.ts`・`vite/hmr.ts`・`vite/utils.ts` の、まだ引いていない行です。入口から Vite のサーバーを立てるまでの大きな流れは [boot-dev-server の章](../boot/03-boot-dev-server.md)、port・prebundle・Vite の設定の組み立ては [vds-config の章](../vds/01-vds-config.md)、HMR の送り方は [cli-hmr の章](../cli/11-cli-hmr.md)と [vds-hmr-ssr の章](../vds/04-vds-hmr-ssr.md)で読んだので繰り返しません。

1. [1. sass の url を書き換える](01-bld-sass-rebase.md)
2. [2. sass を常駐のコンパイラで動かす](02-bld-sass-service.md)
3. [3. メッセージを取り出す](03-bld-extract-i18n.md)
4. [4. 翻訳を差し込む](04-bld-i18n-inline.md)
5. [5. チャンクを束ね直す](05-bld-chunk-optimizer.md)
6. **6. ng serve の入口の残り**（この章）
7. [7. Vite の middleware の残り](07-bld-vite-middlewares.md)
8. [8. unit-test と ng-packagr](08-bld-unit-test-packagr.md)
9. [9. spec と issue](09-bld-tests-issues.md)

## 0. 全体の流れと、版の違い

- `ng serve --inspect … --ssl …` — 利用者のコマンド — *architect が schema の既定値を入れる*
  - `normalizeOptions(context, projectName, options)` — options.ts L33 — *1・2 節*
  - `serveWithVite(serverOptions, builderName, builderAction, context)` — vite/index.ts L54 — *ビルドの options を書き換える（3 節）*
    - `for await (const result of builderAction(browserOptions, …))` — vite/index.ts L221 — *結果ごとに表を直す（4 節）*
    - `setupServer(…)` → `createServer` → `listen` — vite/server.ts L134 — *1 回目の結果のあと（5・6 節）*
    - `server.hot.on('angular:log')`・`bindCLIShortcuts` — vite/index.ts L440・L500 — *受け口（7 節）*

サイトの @angular/build 22.2.7 は、この章の範囲で 44129f66a3 と 3 か所違います。`sslCert` と `sslKey` をワークスペースの場所から解決するようになり（47075bee89、#34399）、ビルドの結果から消えたファイルの Vite のキャッシュを捨てるようになり（3e464c3f55）、schema の `hmr` の説明にテンプレートが足されました（22f836a70b）。デモの記録は 22.2.7 のもの、引用は 44129f66a3 です。

## 1. options.ts の頭：型と「すべてのパスを絶対に」の約束

📄 `angular-cli/packages/angular/build/src/builders/dev-server/options.ts` L9–43 （▶ の行: 16–18, 20, 24–26, 40, 42）

```ts
 9 │ import { BuilderContext, targetFromTargetString } from '@angular-devkit/architect';
10 │ import path from 'node:path';
11 │ import { normalizeOptimization } from '../../utils';
12 │ import { normalizeCacheOptions } from '../../utils/normalize-cache';
13 │ import { ApplicationBuilderOptions } from '../application';
14 │ import { Schema as DevServerOptions } from './schema';
15 │ 
16 ▶ export type NormalizedDevServerOptions = Omit<
17 ▶   Awaited<ReturnType<typeof normalizeOptions>>,
18 ▶   'strictPort'
19 │ > & {
20 ▶   strictPort?: boolean;
21 │ };
22 │ 
23 │ /**
24 ▶  * Normalize the user provided options by creating full paths for all path based options
25 ▶  * and converting multi-form options into a single form that can be directly used
26 ▶  * by the build process.
27 │  *
28 │  * @param context The context for current builder execution.
29 │  * @param projectName The name of the project for the current execution.
30 │  * @param options An object containing the options to use for the build.
31 │  * @returns An object containing normalized options required to perform the build.
32 │  */
33 │ export async function normalizeOptions(
34 │   context: BuilderContext,
35 │   projectName: string,
36 │   options: DevServerOptions,
37 │ ) {
38 │   const { workspaceRoot, logger } = context;
39 │   const projectMetadata = await context.getProjectMetadata(projectName);
40 ▶   const projectRoot = path.join(workspaceRoot, (projectMetadata.root as string | undefined) ?? '');
41 │ 
42 ▶   const cacheOptions = normalizeCacheOptions(projectMetadata, workspaceRoot);
43 │ 
```

16〜21 行目、`NormalizedDevServerOptions` は「`normalizeOptions` の戻り値の型」から `strictPort` を外し、省略できる形で足し直したものです。webpack の dev-server（@angular-devkit/build-angular）がこの型を作るとき `strictPort` を持たないので、Vite の側は `?? true` で受けます（vds-config の章の server.ts の 59 行目）。24〜26 行目の約束は「パスの options はすべて絶対パスにする」です。40 行目のプロジェクトの場所はそうしていますが、44129f66a3 では `sslCert` と `sslKey` はそのまま返り（3 節の 119〜120 行目）、5 節の server.ts の 88〜89 行目の `readFile` は Node の作業フォルダからの相対で読みます。22.2.7 では `path.resolve(workspaceRoot, …)` を通すように直りました。デモの「ssl・sslCert 相対」の行は、その直ったあとの結果です。

### 2. inspect と、残す options

📄 `angular-cli/packages/angular/build/src/builders/dev-server/options.ts` L70–93 （▶ の行: 71, 73, 78–80, 86, 89）

```ts
70 │ 
71 ▶   let inspect: false | { host?: string; port?: number } = false;
72 │   const inspectRaw = options.inspect;
73 ▶   if (inspectRaw === true || inspectRaw === '' || inspectRaw === 'true') {
74 │     inspect = {
75 │       host: undefined,
76 │       port: undefined,
77 │     };
78 ▶   } else if (typeof inspectRaw === 'string' && inspectRaw !== 'false') {
79 ▶     const port = +inspectRaw;
80 ▶     if (isFinite(port)) {
81 │       inspect = {
82 │         host: undefined,
83 │         port,
84 │       };
85 │     } else {
86 ▶       const [host, port] = inspectRaw.split(':');
87 │       inspect = {
88 │         host,
89 ▶         port: isNaN(+port) ? undefined : +port,
90 │       };
91 │     }
92 │   }
93 │ 
```

1. **73 行目：true・空・"true"**

   `--inspect` だけを付けたとき。host も port も `undefined` で、Node の既定（127.0.0.1:9229）になる。
2. **78〜84 行目：数だけ**

   `+inspectRaw` が有限の数なら port だけ。
3. **85〜91 行目：host:port**

   86 行目で `:` で割り、1 つ目を host、2 つ目を port にする。89 行目、数でなければ port は `undefined`。

schema の説明は「`[[host:]port]` の形」で、Node の `--inspect` と同じ書き方を言います。ところが 86 行目は最初の `:` で割るので、IPv6 の `[::1]:9229` は `["[", "", "1]", "9229"]` に割れ、host が `"["`、port が `+""` の 0 になります（デモの normalizeOptions の表）。新しい本家も 86 行目は同じです。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/options.ts` L104–123 （▶ の行: 106, 113–114, 118–120, 122）

```ts
104 │ 
105 │   // Initial options to keep
106 ▶   const {
107 │     host,
108 │     poll,
109 │     open,
110 │     verbose,
111 │     define,
112 │     watch,
113 ▶     liveReload,
114 ▶     hmr,
115 │     headers,
116 │     proxyConfig,
117 │     servePath,
118 ▶     ssl,
119 ▶     sslCert,
120 ▶     sslKey,
121 │     prebundle,
122 ▶     allowedHosts,
123 │   } = options;
```

ここで取り出した値のうち、`liveReload`・`hmr`・`prebundle`・`allowedHosts` は返すときに形を変えます（cli-hmr の章の 136〜137 行目、vds-config の章の 148〜150 行目）。`process.env.PORT` の扱い（94〜103 行目）は vds-config の章の 2 節です。デモで `PORT=" "`（空白 1 つ）にすると、`Number(" ")` が 0 なので「PORT を見つけた」と出したうえで port 0（空いている port を OS に選ばせる）になり、`PORT=3.5` はそのまま 3.5 が返りました。

## 3. serveWithVite がビルドの options を書き換える

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/index.ts` L9–40 （▶ の行: 13–15, 17–18, 20, 22, 24–25, 32–33）

```ts
 9 │ import type { BuilderContext } from '@angular-devkit/architect';
10 │ import type { Plugin } from 'esbuild';
11 │ import assert from 'node:assert';
12 │ import { join } from 'node:path';
13 ▶ import type * as Vite from 'vite' with {
14 ▶   'resolution-mode': 'import',
15 ▶ };
16 │ import type { ComponentStyleRecord } from '../../../tools/vite/middlewares';
17 ▶ import { ServerSsrMode } from '../../../tools/vite/plugins';
18 ▶ import { updateExternalMetadata } from '../../../tools/vite/utils';
19 │ import { normalizeSourceMaps } from '../../../utils';
20 ▶ import { useComponentStyleHmr, useComponentTemplateHmr } from '../../../utils/environment-options';
21 │ import { Result, ResultKind } from '../../application/results';
22 ▶ import { OutputHashing } from '../../application/schema';
23 │ import {
24 ▶   type ApplicationBuilderInternalOptions,
25 ▶   JavaScriptTransformer,
26 │   getSupportedBrowsers,
27 │   isZonelessApp,
28 │   transformSupportedBrowsersToTargets,
29 │ } from '../internal';
30 │ import type { NormalizedDevServerOptions } from '../options';
31 │ import type { DevServerBuilderOutput } from '../output';
32 ▶ import { handleUpdate, invalidateUpdatedFiles } from './hmr';
33 ▶ import { setupServer } from './server';
34 │ import {
35 │   DevServerExternalResultMetadata,
36 │   OutputAssetRecord,
37 │   OutputFileRecord,
38 │   updateResultRecord,
39 │ } from './utils';
40 │ 
```

13〜15 行目、vite は 5 節の server.ts と同じく型だけを import します。17 行目の `ServerSsrMode` は SSR の 3 つのかたち（7 回目）、18 行目は外部の依存を集める関数（vds-config の章の 4 節）、20 行目は HMR の 2 つの環境変数（cli-hmr の章）です。24〜25 行目、ビルドの側の型と `JavaScriptTransformer` は、dev-server が使う物を 1 つに集めた `builders/dev-server/internal.ts` から読みます。32〜33 行目が 4〜5 節の HMR と Vite のサーバーの関数です。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/index.ts` L41–65 （▶ の行: 41, 44, 51, 54, 60, 63–64）

```ts
41 ▶ export type BuilderAction = (
42 │   options: ApplicationBuilderInternalOptions,
43 │   context: BuilderContext,
44 ▶   plugins?: Plugin[],
45 │ ) => AsyncIterable<Result>;
46 │ 
47 │ /**
48 │  * Build options that are also present on the dev server but are only passed
49 │  * to the build.
50 │  */
51 ▶ const CONVENIENCE_BUILD_OPTIONS = ['watch', 'poll', 'verbose', 'define'] as const;
52 │ 
53 │ // eslint-disable-next-line max-lines-per-function
54 ▶ export async function* serveWithVite(
55 │   serverOptions: NormalizedDevServerOptions,
56 │   builderName: string,
57 │   builderAction: BuilderAction,
58 │   context: BuilderContext,
59 │   transformers?: {
60 ▶     indexHtml?: (content: string) => Promise<string>;
61 │   },
62 │   extensions?: {
63 ▶     middleware?: Vite.Connect.NextHandleFunction[];
64 ▶     buildPlugins?: Plugin[];
65 │   },
```

41〜45 行目、`BuilderAction` は「ビルドの options を受け取って結果の列を返す関数」です。application builder の `buildApplicationInternal` がこの形で渡されます（boot-dev-server の章）。51 行目の 4 つ（`watch`・`poll`・`verbose`・`define`）は、dev-server の options にもあるが、ビルドに渡すだけの値です。59〜65 行目の `transformers` と `extensions` は、@angular-devkit/build-angular の dev-server が、index.html の変換や独自の middleware・esbuild のプラグインを差し込むための口です。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/index.ts` L94–118 （▶ の行: 95, 98–99, 104–107, 111, 113–114, 116）

```ts
 94 │ 
 95 ▶   if (browserOptions.prerender || (browserOptions.outputMode && browserOptions.server)) {
 96 │     // Disable prerendering if enabled and force SSR.
 97 │     // This is so instead of prerendering all the routes for every change, the page is "prerendered" when it is requested.
 98 ▶     browserOptions.prerender = undefined;
 99 ▶     browserOptions.ssr ||= true;
100 │   }
101 │ 
102 │   // Vite allowedHost syntax doesn't allow `*.` but `.` acts as `*.`
103 │   // Angular SSR supports `*.`.
104 ▶   const allowedHosts = Array.isArray(serverOptions.allowedHosts)
105 ▶     ? serverOptions.allowedHosts.map((host) => (host[0] === '.' ? '*' + host : host))
106 ▶     : serverOptions.allowedHosts === true
107 ▶       ? ['*']
108 │       : [];
109 │ 
110 │   // Always allow the dev server host
111 ▶   allowedHosts.push(serverOptions.host);
112 │ 
113 ▶   browserOptions.security = {
114 ▶     allowedHosts,
115 │     // Disable auto CSP.
116 ▶     autoCsp: false,
117 │   };
118 │ 
```

1. **95〜100 行目：プリレンダーをやめて SSR に**

   変更のたびに全ルートを描き直す代わりに、要求されたページだけをその場で描く。
2. **102〜108 行目：allowedHosts を SSR の形に**

   Vite は `.example.com` を「サブドメインも」と読むが、Angular の SSR の Host の検査は `*.example.com` と書く。そこで先頭が `.` なら `*` を足す。`true` は `['*']`（bfdc7b0abb）。
3. **111 行目：dev-server の host は常に許す**

   そのうえで 113〜117 行目、ビルドの `security` に入れ、自動の CSP は切る。

Vite 自身の Host の検査には、正規化の前の値（`.example.com` のまま）が渡ります（vds-config の章の server.ts の 62 行目）。デモの「c6a」では、`foo.example.com` は 200、`evil.test` は 403（応答したのは `angularHostValidationMiddleware`）でした。Host の検査の中身は [vds-host-headers の章](../vds/03-vds-host-headers.md)です。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/index.ts` L135–159 （▶ の行: 138–140, 142, 145–146, 148, 151, 155, 157）

```ts
135 │ 
136 │   // The development server currently only supports a single locale when localizing.
137 │   // This matches the behavior of the Webpack-based development server but could be expanded in the future.
138 ▶   if (
139 ▶     browserOptions.localize === true ||
140 ▶     (Array.isArray(browserOptions.localize) && browserOptions.localize.length > 1)
141 │   ) {
142 ▶     context.logger.warn(
143 │       'Localization (`localize` option) has been disabled. The development server only supports localizing a single locale per build.',
144 │     );
145 ▶     browserOptions.localize = false;
146 ▶   } else if (browserOptions.localize) {
147 │     // When localization is enabled with a single locale, force a flat path to maintain behavior with the existing Webpack-based dev server.
148 ▶     browserOptions.forceI18nFlatOutput = true;
149 │   }
150 │ 
151 ▶   const { vendor: thirdPartySourcemaps, scripts: scriptsSourcemaps } = normalizeSourceMaps(
152 │     browserOptions.sourceMap ?? false,
153 │   );
154 │ 
155 ▶   if (scriptsSourcemaps && browserOptions.server) {
156 │     // https://nodejs.org/api/process.html#processsetsourcemapsenabledval
157 ▶     process.setSourceMapsEnabled(true);
158 │   }
159 │ 
```

138〜145 行目、`localize` が `true`（全部のロケール）か 2 つ以上なら警告を出して切ります。146〜148 行目、1 つだけなら、出力をロケールのフォルダに分けない `forceI18nFlatOutput` にします（翻訳の差し込みは [4 回目](04-bld-i18n-inline.md)）。155〜158 行目、SSR があってスクリプトのソースマップがあるなら、Node 自身のスタックトレースにソースマップを使わせます。デモの「prod」は `buildTarget` を本番の設定にした ng serve で、prebundle（vds-config の章の options.ts の 63 行目）、statsJson（vds-config の章の 119〜127 行目）、HMR（outputHashing、cli-hmr の章の 160〜171 行目）の 3 つの警告が順に出ました。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/index.ts` L182–218 （▶ の行: 182, 185, 189–190, 194, 196, 201–203, 209–210, 214–217）

```ts
182 ▶   browserOptions.incrementalResults = true;
183 │ 
184 │   // Setup the prebundling transformer that will be shared across Vite prebundling requests
185 ▶   const prebundleTransformer = new JavaScriptTransformer(
186 │     // Always enable JIT linking to support applications built with and without AOT.
187 │     // In a development environment the additional scope information does not
188 │     // have a negative effect unlike production where final output size is relevant.
189 ▶     { sourcemap: true, jit: true, thirdPartySourcemaps },
190 ▶     1,
191 │   );
192 │ 
193 │   // The index HTML path will be updated from the build results if provided by the builder
194 ▶   let htmlIndexPath = 'index.html';
195 │ 
196 ▶   const { createServer, normalizePath } = (await import('vite' as string)) as typeof Vite;
197 │ 
198 │   let server: Vite.ViteDevServer | undefined;
199 │   let serverUrl: URL | undefined;
200 │   let hadError = false;
201 ▶   const generatedFiles = new Map<string, OutputFileRecord>();
202 ▶   const assetFiles = new Map<string, OutputAssetRecord>();
203 ▶   const externalMetadata: DevServerExternalResultMetadata = {
204 │     implicitBrowser: [],
205 │     implicitServer: [],
206 │     explicitBrowser: [],
207 │     explicitServer: [],
208 │   };
209 ▶   const componentStyles = new Map<string, ComponentStyleRecord>();
210 ▶   const templateUpdates = new Map<string, string>();
211 │ 
212 │   // Add cleanup logic via a builder teardown.
213 │   let deferred: () => void;
214 ▶   context.addTeardown(async () => {
215 ▶     await server?.close();
216 ▶     await prebundleTransformer.close();
217 ▶     deferred?.();
218 │   });
```

182 行目の `incrementalResults` で、2 回目からのビルドは「変わったファイルだけ」の結果を返します（[abl-results の章](../abl/02-abl-results.md)）。185〜191 行目、prebundle の依存の変換にはワーカー 1 つの `JavaScriptTransformer` を作り、JIT のリンクを常に有効にします（186〜188 行目のコメント）。22.2.7 では 190 行目の `1` が `maxConcurrency: 1` という options に変わりました（d14bf8fe57）。201〜210 行目の Map と配列は、このあと Vite の plugin と middleware に**同じ物**として渡し、ビルドのたびに中身だけを書き換えます（vds-config の章で引いた 330 行目のコメント）。213〜218 行目、builder が止まるときに Vite と transformer を閉じ、526 行目で待っている promise を解きます。

## 4. 結果ごとの処理：エラーの表示を消す、消えたファイル

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/index.ts` L238–249 （▶ の行: 239–240, 242–244, 248）

```ts
238 │     // Clear existing error overlay on successful result
239 ▶     if (hadError && server) {
240 ▶       hadError = false;
241 │       // Send an empty update to clear the error overlay
242 ▶       server.ws.send({
243 ▶         'type': 'update',
244 ▶         updates: [],
245 │       });
246 │     }
247 │ 
248 ▶     let needClientUpdate = true;
249 │     switch (result.kind) {
```

ビルドが失敗すると、直前の 222〜237 行目（boot-dev-server の章）でブラウザにエラーの表示（Vite の error overlay）を送ります。239〜246 行目、次に成功したら、中身の無い `update` を送って表示を消します（99192a791b）。HMR が切れていても消えるように、更新の有無と関係なく送ります。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/index.ts` L288–305 （▶ の行: 288–291, 294–295）

```ts
288 ▶         for (const removed of result.removed) {
289 ▶           const filePath = '/' + normalizePath(removed.path);
290 ▶           generatedFiles.delete(filePath);
291 ▶           assetFiles.delete(filePath);
292 │         }
293 │ 
294 ▶         for (const file of result.files) {
295 ▶           updateResultRecord(
296 │             file,
297 │             normalizePath,
298 │             htmlIndexPath,
299 │             generatedFiles,
300 │             assetFiles,
301 │             componentStyles,
302 │           );
303 │         }
304 │ 
305 │         break;
```

差分の結果では、288〜292 行目で消えたファイルを 2 つの表から消し、294〜303 行目で変わったファイルだけを書き直します。44129f66a3 では、Vite が変換の結果としてキャッシュしたモジュールは残るので、名前にハッシュの付いたチャンクが作り直しで名前を変えると、古い名前の要求に古い中身が返りえました。22.2.7 ではここで `moduleGraph.invalidateModule` も呼びます（3e464c3f55）。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/hmr.ts` L9–25 （▶ の行: 9, 20–22, 24）

```ts
 9 ▶ import type { ɵdestroyAngularServerApp as destroyAngularServerApp } from '@angular/ssr';
10 │ import type { BuilderContext } from '@angular-devkit/architect';
11 │ import { join } from 'node:path';
12 │ import type { ViteDevServer } from 'vite' with {
13 │   'resolution-mode': 'import',
14 │ };
15 │ import type { ComponentStyleRecord } from '../../../tools/vite/middlewares';
16 │ import { BuildOutputFileType } from '../internal';
17 │ import type { NormalizedDevServerOptions } from '../options';
18 │ import type { OutputAssetRecord, OutputFileRecord } from './utils';
19 │ 
20 ▶ /**
21 ▶  * Invalidates any updated asset or generated files and resets their `updated` state.
22 ▶  * This function also clears the server application cache when necessary.
23 │  *
24 ▶  * @returns A list of files that were updated and invalidated.
25 │  */
```

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/hmr.ts` L80–91 （▶ の行: 81–83, 86）

```ts
80 │ 
81 ▶ /**
82 ▶  * Handles updates for the client by sending HMR or full page reload commands
83 ▶  * based on the updated files. It also ensures proper tracking of component styles and determines if
84 │  * a full reload is needed.
85 │  */
86 ▶ export function handleUpdate(
87 │   server: ViteDevServer,
88 │   serverOptions: NormalizedDevServerOptions,
89 │   logger: BuilderContext['logger'],
90 │   componentStyles: Map<string, ComponentStyleRecord>,
91 │   updatedFiles: string[],
```

この 2 つの関数の本体は vds-hmr-ssr の章で読みました。9 行目、SSR のアプリを捨てる `ɵdestroyAngularServerApp` は型だけを import し、SSR のときだけ実物を読みます。20〜24 行目は「変わったファイルを Vite に知らせ、要るなら SSR のキャッシュも消す」、81〜83 行目は「HMR か全体の再読み込みかを決める」です。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/utils.ts` L9–30 （▶ の行: 13–14, 17–19, 22–24, 27–29）

```ts
 9 │ import type { ComponentStyleRecord } from '../../../tools/vite/middlewares';
10 │ import type { ResultFile } from '../../application/results';
11 │ import { BuildOutputFileType, type ExternalResultMetadata } from '../internal';
12 │ 
13 ▶ export interface OutputFileRecord {
14 ▶   contents: Uint8Array;
15 │   size: number;
16 │   hash: string;
17 ▶   updated: boolean;
18 ▶   servable: boolean;
19 ▶   type: BuildOutputFileType;
20 │ }
21 │ 
22 ▶ export interface OutputAssetRecord {
23 ▶   source: string;
24 ▶   updated: boolean;
25 │ }
26 │ 
27 ▶ export interface DevServerExternalResultMetadata extends Omit<ExternalResultMetadata, 'explicit'> {
28 ▶   explicitBrowser: string[];
29 ▶   explicitServer: string[];
30 │ }
```

3 節の 201〜202 行目の表の 1 行の形です。メモリの上の出力（`OutputFileRecord`）は中身・ハッシュ・`updated`・ブラウザに返してよいか（`servable`）を持ち、ディスクのアセット（`OutputAssetRecord`）は元のファイルの場所だけを持ちます。27〜30 行目、外部の依存は、ビルドの `explicit` をブラウザ用とサーバー用に分けた形で持ちます（vds-config の章の 4 節）。

## 5. Vite のサーバー：ssl と、setupServer の頭

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/server.ts` L9–29 （▶ の行: 11–12, 17–21, 25）

```ts
 9 │ import { readFile } from 'node:fs/promises';
10 │ import { join } from 'node:path';
11 ▶ import type * as Vite from 'vite' with {
12 ▶   'resolution-mode': 'import',
13 │ };
14 │ import type { ComponentStyleRecord } from '../../../tools/vite/middlewares';
15 │ import {
16 │   ServerSsrMode,
17 ▶   createAngularMemoryPlugin,
18 ▶   createAngularServerSideSSLPlugin,
19 ▶   createAngularSetupMiddlewaresPlugin,
20 ▶   createAngularSsrTransformPlugin,
21 ▶   createRemoveIdPrefixPlugin,
22 │ } from '../../../tools/vite/plugins';
23 │ import { RolldownLoaderOption, getDepOptimizationConfig } from '../../../tools/vite/utils';
24 │ import { loadProxyConfiguration } from '../../../utils';
25 ▶ import { initializeHash } from '../../../utils/hash';
26 │ import { type ApplicationBuilderInternalOptions, JavaScriptTransformer } from '../internal';
27 │ import type { NormalizedDevServerOptions } from '../options';
28 │ import { DevServerExternalResultMetadata, OutputAssetRecord, OutputFileRecord } from './utils';
29 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/server.ts` L133–153 （▶ の行: 134, 136–137, 143–144, 147–148, 151–152）

```ts
133 │ 
134 ▶ export async function setupServer(
135 │   serverOptions: NormalizedDevServerOptions,
136 ▶   outputFiles: Map<string, OutputFileRecord>,
137 ▶   assets: Map<string, OutputAssetRecord>,
138 │   preserveSymlinks: boolean | undefined,
139 │   externalMetadata: DevServerExternalResultMetadata,
140 │   ssrMode: ServerSsrMode,
141 │   prebundleTransformer: JavaScriptTransformer,
142 │   target: string[],
143 ▶   componentStyles: Map<string, ComponentStyleRecord>,
144 ▶   templateUpdates: Map<string, string>,
145 │   prebundleLoaderExtensions: RolldownLoaderOption | undefined,
146 │   define: ApplicationBuilderInternalOptions['define'],
147 ▶   extensionMiddleware?: Vite.Connect.NextHandleFunction[],
148 ▶   indexHtmlTransformer?: (content: string) => Promise<string>,
149 │   thirdPartySourcemaps = false,
150 │ ): Promise<Vite.InlineConfig> {
151 ▶   await initializeHash();
152 ▶   const { normalizePath } = (await import('vite' as string)) as typeof Vite;
153 │ 
```

11〜13 行目、vite は型だけを import し、実物は 152 行目で動的に読みます。@angular/build は CommonJS で出力されるので、ESM しかない vite を `require` の形で読む（`resolution-mode: 'import'`）ための書き方です。151 行目の `initializeHash` は、アセットの middleware が ETag を作る xxHash の準備です（7 回目）。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/server.ts` L85–100 （▶ の行: 86–89, 92–94）

```ts
 85 │ 
 86 ▶   if (serverOptions.ssl && serverOptions.sslCert && serverOptions.sslKey) {
 87 ▶     const [cert, key] = await Promise.all([
 88 ▶       readFile(serverOptions.sslCert),
 89 ▶       readFile(serverOptions.sslKey),
 90 │     ]);
 91 │ 
 92 ▶     server.https = {
 93 ▶       cert,
 94 ▶       key,
 95 │     };
 96 │   }
 97 │ 
 98 │   return server;
 99 │ }
100 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/server.ts` L264–278 （▶ の行: 265, 267–269, 272–273）

```ts
264 │ 
265 ▶   if (serverOptions.ssl) {
266 │     configuration.plugins ??= [];
267 ▶     if (!serverOptions.sslCert || !serverOptions.sslKey) {
268 ▶       const { default: basicSslPlugin } = await import('@vitejs/plugin-basic-ssl');
269 ▶       configuration.plugins.push(basicSslPlugin());
270 │     }
271 │ 
272 ▶     if (ssrMode !== ServerSsrMode.NoSsr) {
273 ▶       configuration.plugins?.push(createAngularServerSideSSLPlugin());
274 │     }
275 │   }
276 │ 
277 │   return configuration;
278 │ }
```

1. **86 行目：証明書と鍵の両方があるときだけ**

   2 つを読んで Vite の `https` に渡す。
2. **267〜270 行目：どちらかが欠けていたら**

   `@vitejs/plugin-basic-ssl` で、その場で作った自己署名の証明書を使う。片方だけ指定したときも黙ってこちらになる。
3. **272〜274 行目：SSR なら**

   サーバーの側の fetch が自己署名の証明書を受け入れるようにする plugin を足す。

デモの「ssl」では、Vite の設定の plugins の最後に `vite:basic-ssl` が入り、`https://127.0.0.1:8853/` で 200 が返りました。Node の WebSocket は自己署名の証明書を拒むので、HMR の接続は失敗しています。

### 6. 1 回目の結果のあと：デバッガーと SIGINT

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/index.ts` L342–368 （▶ の行: 342, 349–350, 352–353, 358–359, 362–366）

```ts
342 ▶       const updatedFiles = await invalidateUpdatedFiles(
343 │         normalizePath,
344 │         generatedFiles,
345 │         assetFiles,
346 │         server,
347 │       );
348 │ 
349 ▶       if (needClientUpdate) {
350 ▶         handleUpdate(server, serverOptions, context.logger, componentStyles, updatedFiles);
351 │       }
352 ▶     } else {
353 ▶       const projectName = context.target?.project;
354 │       if (!projectName) {
355 │         throw new Error('The builder requires a target.');
356 │       }
357 │ 
358 ▶       context.logger.info(
359 ▶         'NOTE: Raw file sizes do not reflect development server per-request transformations.',
360 │       );
361 │ 
362 ▶       if (browserOptions.ssr && serverOptions.inspect) {
363 ▶         const { host, port } = serverOptions.inspect as { host?: string; port?: number };
364 ▶         const { default: inspector } = await import('node:inspector');
365 ▶         inspector.open(port, host, true);
366 ▶         context.addTeardown(() => inspector.close());
367 │       }
368 │ 
```

2 回目からの結果は 342〜351 行目で Vite に知らせて終わりです（4 節）。1 回目は 352 行目からで、358〜360 行目の「表の大きさは開発サーバーが要求ごとに変換する前の値」という注意を出します。362〜367 行目、SSR があり `inspect` があれば、Node の inspector を開きます。365 行目の第 3 引数 `true` は Node の `inspector.open(port, host, wait)` の `wait` で、「デバッガーがつながるまで待つ」です。

> [!WARNING]
> **ハマりどころ**
>
> inspect を足したコミット（687a6c7eca）の説明は「`node --inspect=[[host:]port]` と同じ」ですが、`node --inspect` は待ちません（待つのは `--inspect-brk` や `--inspect-wait`）。デモの「ssr」では、ビルドの表と「Debugger listening on ws://127.0.0.1:9239/…」が出たあと、20 秒たっても Vite のサーバーは立たず、記録のスクリプトがデバッガーとして `Runtime.runIfWaitingForDebugger` を送った直後に listen しました。schema の説明（「デバッグの inspector を有効にする」）にも、待つことは書かれていません。新しい本家も 365 行目は同じです。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/index.ts` L394–401 （▶ の行: 395–398）

```ts
394 │ 
395 ▶       if (browserOptions.progress !== false && ssrMode !== ServerSsrMode.NoSsr) {
396 ▶         // This is a workaround for https://github.com/angular/angular-cli/issues/28336, which is caused by the interaction between `zone.js` and `listr2`.
397 ▶         process.once('SIGINT', () => {
398 ▶           process.kill(process.pid);
399 │         });
400 │       }
401 │ 
```

SSR があって進み具合の表示（listr2）を出すとき、Ctrl + C で止まらない不具合（#28336）の回り道です。zone.js と listr2 の組み合わせで SIGINT が届かなくなるので、1 回目の SIGINT で自分自身に SIGTERM を送ります（549c20a939）。

## 7. 受け口：ブラウザからのログと、キーボードの r

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/index.ts` L438–456 （▶ の行: 440–442, 444, 446, 449, 452）

```ts
438 │ 
439 │       // Setup builder context logging for browser clients
440 ▶       server.hot.on('angular:log', (data: { text: string; kind?: string }) => {
441 ▶         if (typeof data?.text !== 'string') {
442 ▶           context.logger.warn('Development server client sent invalid internal log event.');
443 │         }
444 ▶         switch (data.kind) {
445 │           case 'error':
446 ▶             context.logger.error(`[CLIENT ERROR]: ${data.text}`);
447 │             break;
448 │           case 'warning':
449 ▶             context.logger.warn(`[CLIENT WARNING]: ${data.text}`);
450 │             break;
451 │           default:
452 ▶             context.logger.info(`[CLIENT INFO]: ${data.text}`);
453 │             break;
454 │         }
455 │       });
456 │ 
```

ブラウザの側の Angular のコードが、HMR の WebSocket で `angular:log` というイベントを送ると、ここで ng serve の端末に出ます（e3aa483028）。441〜443 行目は「`text` が文字列でなければ警告」ですが、`return` がありません。そのまま 444 行目の `data.kind` に進むので、`data` が `null` だと TypeError になります。

> [!WARNING]
> **ハマりどころ**
>
> デモの「c6a」で、WebSocket（protocol `vite-hmr`）に `{"type":"custom","event":"angular:log","data":null}` を送ると、「Development server client sent invalid internal log event.」のあとに `TypeError: Cannot read properties of null (reading 'kind')` が出て、ng serve のプロセスごと終了コード 1 で終わりました（その次の要求は ECONNREFUSED）。`{"kind":"error"}`（text 無し）のときは、警告のあとに「\[CLIENT ERROR\]: undefined」と出ます。同じ形の抜けは 462〜466 行目の `angular:invalidate` にもあります（cli-hmr の章）。新しい本家も同じです。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/index.ts` L499–527 （▶ の行: 500–501, 504, 507–509, 519, 521–522, 526）

```ts
499 │ 
500 ▶       server.bindCLIShortcuts({
501 ▶         print: true,
502 │         customShortcuts: [
503 │           {
504 ▶             key: 'r',
505 │             description: 'force reload browser',
506 │             action(server) {
507 ▶               componentStyles.forEach((record) => record.used?.clear());
508 ▶               server.ws.send({
509 ▶                 type: 'full-reload',
510 │                 path: '*',
511 │               });
512 │             },
513 │           },
514 │         ],
515 │       });
516 │     }
517 │ 
518 │     // TODO: adjust output typings to reflect both development servers
519 ▶     yield {
520 │       success: true,
521 ▶       port: serverUrl?.port,
522 ▶       baseUrl: serverUrl?.href,
523 │     } as unknown as DevServerBuilderOutput;
524 │   }
525 │ 
526 ▶   await new Promise<void>((resolve) => (deferred = resolve));
527 │ }
```

500〜515 行目、Vite の端末のショートカットに `r`（ブラウザを強制的に再読み込み）を足します。507 行目で、コンポーネントのスタイルを「どのコンポーネントが使ったか」の記録（7 回目の `used`）を消してから、全体の再読み込みを送ります。519〜523 行目、結果のたびに URL を返し、526 行目でビルドの列が終わっても builder を止めずに待ちます（213〜218 行目の後片付けまで）。

> **🧪 DEMO — normalizeOptions の表と、本物の ng serve の記録（@angular/build 22.2.7・vite 8.3.5）**
>
> 偽の BuilderContext（プロジェクトの root は空、build の options は `browser` だけ）と schema の既定値で、dist の `normalizeOptions` を呼びました。行を押すと、入力とログを出します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bld-dev-server-rest)

どう録ったか：

1. **normalizeOptions**

   record-normalize.mjs が、dist の options.js を直接 require し、偽の BuilderContext で 22 通りを呼びました。`PORT` は呼ぶたびに入れ替えています。
2. **ng serve**

   5 回目と同じ小さなアプリ（ルートのコンポーネントに `styleUrl`、public/ にアセット、SSR の入口）を、angular.json の serve の configurations（下）で 127.0.0.1 の 8851〜8855 に立てました。node --import hook.mjs で @angular/build の `require('vite')` だけを包みのモジュール（vite-wrap.mjs）に向け、`createServer` に渡った設定と listen の後の値を書き出しています。終わるたびに止め、port が空いたことを確かめました。

📄 `<app>/angular.json（記録の終わりの形。8 回目のライブラリの project も入っている）`

```
{
 "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
 "version": 1,
 "cli": {
  "packageManager": "npm",
  "analytics": false
 },
 "newProjectRoot": "projects",
 "projects": {
  "demo": {
   "projectType": "application",
   "root": "",
   "sourceRoot": "src",
   "architect": {
    "build": {
     "builder": "@angular/build:application",
     "options": {
      "browser": "src/main.ts",
      "tsConfig": "tsconfig.app.json",
      "assets": [
       {
        "glob": "**/*",
        "input": "public"
       }
      ]
     },
     "configurations": {
      "production": {
       "optimization": true,
       "outputHashing": "all",
       "extractLicenses": false,
       "statsJson": true
      },
      "prodmap": {
       "optimization": true,
       "outputHashing": "all",
       "extractLicenses": false,
       "statsJson": true,
       "sourceMap": true
      },
      "development": {
       "optimization": false,
       "extractLicenses": false,
       "sourceMap": true
      },
      "ssr": {
       "optimization": false,
       "extractLicenses": false,
       "sourceMap": true,
       "server": "src/main.server.ts",
       "ssr": true
      }
     },
     "defaultConfiguration": "production"
    },
    "test": {
     "builder": "@angular/build:unit-test",
     "options": {
      "tsConfig": "tsconfig.spec.json"
     }
    },
    "serve": {
     "builder": "@angular/build:dev-server",
     "options": {
      "buildTarget": "demo:build:development",
      "host": "127.0.0.1",
      "port": 8850
     },
     "configurations": {
      "c6a": {
       "allowedHosts": [
        ".example.com"
       ],
       "headers": {
        "X-Demo": "bld"
       },
       "define": {
        "DEMO_FLAG": "'on'"
       }
      },
      "nows": {
       "liveReload": false,
       "hmr": false
      },
      "ssl": {
       "ssl": true
      },
      "ssr": {
       "buildTarget": "demo:build:ssr",
       "inspect": "127.0.0.1:9239"
      },
      "base": {
       "servePath": "/app"
      },
      "prod": {
       "buildTarget": "demo:build:production"
      }
     }
    }
   }
  }
 }
}
```

📄 `record-normalize.mjs`

```js
// @angular/build 22.2.7 の dev-server の normalizeOptions を、偽の BuilderContext でいろいろな options に通した記録
// 使い方: node record-normalize.mjs <app>
import { createRequire } from 'node:module';
import { join } from 'node:path';
const [app] = process.argv.slice(2);
const require = createRequire(join(app, 'package.json'));
const { normalizeOptions } = require(join(app, 'node_modules/@angular/build/src/builders/dev-server/options.js'));
// schema.json の既定値（architect が validateOptions で入れる値）
const DEFAULTS = { port: 4200, host: 'localhost', ssl: false, allowedHosts: [], open: false, liveReload: true, watch: true, inspect: false, prebundle: true };
function context({ cache = true, optimization = false } = {}, logs) {
  const log = (level) => (m) => logs.push(`${level}: ${m}`);
  return {
    workspaceRoot: app,
    logger: { info: log('info'), warn: log('warn'), error: log('error'), debug: () => {} },
    builder: { builderName: '@angular/build:dev-server' },
    getProjectMetadata: async () => ({ root: '', ...(cache ? {} : { cli: { cache: { enabled: false } } }) }),
    getBuilderNameForTarget: async () => '@angular/build:application',
    getTargetOptions: async () => ({ browser: 'src/main.ts', optimization }),
    validateOptions: async (o) => o,
  };
}
const CASES = [
  ['既定値だけ', {}],
  ['host 127.0.0.1・port 8850', { host: '127.0.0.1', port: 8850 }],
  ['port 0', { port: 0 }],
  ['PORT=8851', {}, { PORT: '8851' }],
  ['PORT=abc', {}, { PORT: 'abc' }],
  ['PORT=" "（空白 1 つ）', {}, { PORT: ' ' }],
  ['PORT=3.5', {}, { PORT: '3.5' }],
  ['inspect: true', { inspect: true }],
  ['inspect: "9229"', { inspect: '9229' }],
  ['inspect: "localhost:9229"', { inspect: 'localhost:9229' }],
  ['inspect: "0.0.0.0"', { inspect: '0.0.0.0' }],
  ['inspect: "[::1]:9229"', { inspect: '[::1]:9229' }],
  ['liveReload: false', { liveReload: false }],
  ['liveReload: false・hmr: true', { liveReload: false, hmr: true }],
  ['hmr: false', { hmr: false }],
  ['allowedHosts: true', { allowedHosts: true }],
  ['allowedHosts: false', { allowedHosts: false }],
  ['allowedHosts: [".example.com"]', { allowedHosts: ['.example.com'] }],
  ['ssl・sslCert 相対', { ssl: true, sslCert: 'certs/dev.crt', sslKey: 'certs/dev.key' }],
  ['prebundle・キャッシュ無効', { prebundle: true }, {}, { cache: false }],
  ['prebundle・optimization: true の build', { prebundle: { exclude: ['lodash'] } }, {}, { optimization: true }],
  ['buildTarget "demo:build:production"', { buildTarget: 'demo:build:production' }],
];
const KEYS = ['buildTarget', 'host', 'port', 'strictPort', 'liveReload', 'hmr', 'inspect', 'allowedHosts', 'ssl', 'sslCert', 'sslKey', 'prebundle'];
const rows = [];
for (const [label, opts, env = {}, ctx = {}] of CASES) {
  const saved = process.env.PORT;
  delete process.env.PORT;
  Object.assign(process.env, env);
  const logs = [];
  const n = await normalizeOptions(context(ctx, logs), 'demo', { ...DEFAULTS, ...opts });
  if (saved === undefined) delete process.env.PORT; else process.env.PORT = saved;
  const out = {};
  for (const k of KEYS) out[k] = n[k] === undefined ? '(undefined)' : n[k];
  rows.push({ label, input: { ...opts, ...(Object.keys(env).length ? { env } : {}) }, out, logs });
}
console.log(JSON.stringify(rows, null, 1));

```

📄 `hook.mjs`

```js
// node --import ./hook.mjs で読み込む。@angular/build が require('vite') / import('vite') したときだけ vite-wrap.mjs に向ける。
// module.registerHooks の同期の resolve は require にも import にも効く。
import { registerHooks } from 'node:module';
const WRAP = new URL('./vite-wrap.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'vite' && context.parentURL && context.parentURL.includes('/@angular/build/')) {
      return { url: WRAP, format: 'module', shortCircuit: true };
    }
    return next(specifier, context);
  },
});

```

📄 `vite-wrap.mjs`

```js
// 本物の vite をそのまま出し、createServer だけを包む（ファイル名の vite の場所は記録のときに書き込んだもの）。
// 1. createServer に渡った InlineConfig を、関数やプラグインを名前に直して $BLD_OUT/config.json に書く
// 2. listen の後の server.config.server と middleware の並びを $BLD_OUT/listen.json に書く
// 3. 各 middleware を包み、要求ごとに通った名前と、応答を書いた名前を $BLD_OUT/requests.jsonl に足す
import { appendFileSync, writeFileSync } from 'node:fs';
import * as real from '~/angular-research/angular-deep-dive/node_modules/vite/dist/node/index.js';
export * from '~/angular-research/angular-deep-dive/node_modules/vite/dist/node/index.js';
const OUT = process.env.BLD_OUT;
function plain(v, depth = 0, seen = []) {
  if (v === null || typeof v !== 'object') return typeof v === 'function' ? '[Function ' + (v.name || 'anonymous') + ']' : v;
  if (seen.includes(v)) return '[Circular]';
  seen = [...seen, v];
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return '[Buffer ' + v.byteLength + ' B]';
  if (v instanceof RegExp) return String(v);
  if (v instanceof Map) return '[Map size ' + v.size + ']';
  if (v instanceof Set) return '[Set ' + JSON.stringify([...v]) + ']';
  if (depth > 6) return '[…]';
  if (Array.isArray(v)) return v.map((x) => plain(x, depth + 1, seen));
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = plain(x, depth + 1, seen);
  return o;
}
export async function createServer(config) {
  const shown = { ...config, plugins: (config.plugins ?? []).flat().filter(Boolean).map((p) => p.name) };
  writeFileSync(OUT + '/config.json', JSON.stringify(plain(shown), null, 1));
  const server = await real.createServer(config);
  const listen = server.listen.bind(server);
  server.listen = async (...a) => {
    const r = await listen(...a);
    const stack = server.middlewares.stack;
    const names = stack.map((l) => (l.route ? l.route + ' ' : '') + (l.handle.name || 'anonymous'));
    for (const layer of stack) {
      const name = (layer.route ? layer.route + ' ' : '') + (layer.handle.name || 'anonymous');
      const orig = layer.handle;
      const wrapped = function (req, res, next) {
        (req.__bldTrail ??= []).push(name);
        if (!req.__bldHooked) {
          req.__bldHooked = true;
          const origUrl = req.originalUrl ?? req.url;
          const writeHead = res.writeHead.bind(res);
          res.writeHead = (...args) => { res.__bldBy ??= req.__bldTrail.at(-1); return writeHead(...args); };
          res.on('finish', () => appendFileSync(OUT + '/requests.jsonl', JSON.stringify({ method: req.method, url: origUrl, rewritten: req.url, status: res.statusCode, type: res.getHeader('content-type') ?? null, etag: res.getHeader('etag') ?? null, by: res.__bldBy ?? req.__bldTrail.at(-1), trail: req.__bldTrail }) + '\n'));
        }
        return orig(req, res, next);
      };
      if (orig.length !== 4) layer.handle = Object.defineProperty(wrapped, 'name', { value: orig.name });
    }
    writeFileSync(OUT + '/listen.json', JSON.stringify(plain({ base: server.config.base, server: server.config.server, optimizeDeps: server.config.optimizeDeps, ssr: server.config.ssr, stack: names, resolvedUrls: server.resolvedUrls }), null, 1));
    return r;
  };
  return server;
}

```

📄 `record-serve.mjs`

```js
// 本物の ng serve（@angular/build 22.2.7）を 127.0.0.1 で立て、Vite に渡った設定・middleware の並び・要求の結果を録る。
// 使い方: node record-serve.mjs <app> <case名> <port> [ng serve の引数...]
// 環境変数 BLD_STEPS に、要求の手順（JSON）を入れる。
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect } from 'node:net';
const [app, name, port, ...args] = process.argv.slice(2);
const here = new URL('.', import.meta.url).pathname;
const out = here + 'out/' + name;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const steps = JSON.parse(process.env.BLD_STEPS ?? '[]');
const env = { ...process.env, BLD_OUT: out, BLD_APP: app, NG_CLI_ANALYTICS: 'false', NO_COLOR: '1', FORCE_COLOR: '0', HOME: here + '../home', XDG_CONFIG_HOME: here + '../home/.config' };
const child = spawn(process.execPath, ['--import', here + 'hook.mjs', 'node_modules/@angular/cli/bin/ng.js', 'serve', '--port', port, ...args], { cwd: app, env });
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
let exited = null;
child.on('exit', (code, sig) => (exited = { code, sig }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
while (!existsSync(out + '/listen.json') && Date.now() - t0 < (Number(process.env.BLD_WAIT) || 60000) && !exited) await wait(200);
let listened = existsSync(out + '/listen.json');
let inspector = null;
if (!listened && process.env.BLD_INSPECT) {
  // inspector.open(port, host, true) が止まっているかを見て、デバッガーとして「走らせて」と頼む
  const ip = process.env.BLD_INSPECT;
  const list = await fetch(`http://127.0.0.1:${ip}/json/list`).then((r) => r.json()).catch((e) => String(e));
  inspector = { waitedMs: Date.now() - t0, listenedBefore: false, targets: Array.isArray(list) ? list.map((t) => ({ type: t.type, title: t.title.replace(/.*\//, '…/') })) : list };
  if (Array.isArray(list) && list[0]) {
    await new Promise((resolve) => {
      const d = new WebSocket(list[0].webSocketDebuggerUrl);
      d.onopen = () => { d.send(JSON.stringify({ id: 1, method: 'Runtime.runIfWaitingForDebugger' })); setTimeout(() => { d.close(); resolve(); }, 500); };
      d.onerror = () => resolve();
    });
    const t1 = Date.now();
    while (!existsSync(out + '/listen.json') && Date.now() - t1 < 30000 && !exited) await wait(200);
    listened = existsSync(out + '/listen.json');
    inspector.listenedAfterRun = listened;
    inspector.msAfterRun = Date.now() - t1;
  }
}
await wait(1500);
const tls = args.includes('--ssl') || (process.env.BLD_TLS === '1');
function req({ method = 'GET', path = '/', headers = {} }) {
  return new Promise((resolve) => {
    const r = (tls ? httpsRequest : httpRequest)({ host: '127.0.0.1', port, method, path, headers, rejectUnauthorized: false, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ method, path, reqHeaders: headers, status: res.statusCode, headers: res.headers, body });
      });
    });
    r.on('timeout', () => { r.destroy(); resolve({ method, path, reqHeaders: headers, error: 'timeout' }); });
    r.on('error', (e) => resolve({ method, path, reqHeaders: headers, error: e.code ?? e.message }));
    if (tls) {
      r.on('socket', (s) => s.on('secureConnect', () => { const c = s.getPeerCertificate(); r.__cert = c && c.subject; }));
    }
    r.end();
  });
}
async function ws(messages) {
  // Vite の HMR の WebSocket（protocol vite-hmr）に custom のイベントを送る
  return new Promise((resolve) => {
    const sock = new WebSocket(`${tls ? 'wss' : 'ws'}://127.0.0.1:${port}/`, 'vite-hmr');
    const got = [];
    sock.onmessage = (e) => got.push(String(e.data).slice(0, 120));
    sock.onerror = () => resolve({ error: 'websocket error', got });
    sock.onopen = async () => {
      for (const m of messages) { sock.send(JSON.stringify(m)); await wait(300); }
      await wait(800);
      sock.close();
      resolve({ opened: true, got });
    };
    setTimeout(() => resolve({ error: 'timeout', got }), 8000);
  });
}
const results = [];
let vars = {};
process.on('uncaughtException', (e) => { child.kill('SIGKILL'); console.error(e); process.exit(1); });
for (const s of steps) {
  if (s.ws) { results.push({ ws: s.ws, label: s.label, result: await ws(s.ws), aliveAfter: exited === null }); await wait(500); continue; }
  let path = s.path.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const prevEtag = results.at(-1)?.headers?.etag;
  const headers = Object.fromEntries(Object.entries(s.headers ?? {}).map(([k, v]) => [k, v === '__ETAG_PREV__' ? prevEtag : v]).filter(([, v]) => v !== undefined));
  const r = await req({ ...s, headers, path });
  if (s.capture) for (const [k, re] of Object.entries(s.capture)) { const m = new RegExp(re).exec(r.body ?? ''); if (m) vars[k] = m[1] ?? m[0]; }
  const keep = ['content-type', 'etag', 'location', 'cache-control', 'x-demo', 'content-length'];
  if (s.dump) writeFileSync(out + '/dump.txt', r.body ?? '');
  results.push({ label: s.label, method: r.method, path, reqHeaders: r.reqHeaders, status: r.status ?? null, error: r.error ?? null, headers: Object.fromEntries(keep.filter((k) => r.headers?.[k] !== undefined).map((k) => [k, r.headers[k]])), head: (r.body ?? '').replace(/\s+/g, ' ').slice(0, 140) });
}
const requests = existsSync(out + '/requests.jsonl') ? readFileSync(out + '/requests.jsonl', 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const aliveAtEnd = exited === null;
child.kill('SIGTERM');
await wait(1500);
if (exited === null) child.kill('SIGKILL');
await wait(500);
const portFree = await new Promise((resolve) => { const c = connect(Number(port), '127.0.0.1'); c.on('connect', () => { c.destroy(); resolve(false); }); c.on('error', () => resolve(true)); });
const record = {
  name, args, listened, inspector, aliveAtEnd, exitedBeforeEnd: aliveAtEnd ? null : exited, portFreeAfterStop: portFree,
  config: existsSync(out + '/config.json') ? JSON.parse(readFileSync(out + '/config.json', 'utf8')) : null,
  listen: listened ? JSON.parse(readFileSync(out + '/listen.json', 'utf8')) : null,
  results, requests, log: log.split('\n').filter((l) => l.trim() && !/^\s*$/.test(l)).slice(0, 60),
};
writeFileSync(out + '/record.json', JSON.stringify(record, null, 1));
console.log(name, 'listened', listened, 'alive', aliveAtEnd, 'portFree', portFree, 'results', results.length);

```

## テストと直し方

`normalizeOptions` にも `serveWithVite` にも unit の spec はありません。dev-server の振る舞いは `builders/dev-server/tests/` の、本物の dev-server を立てる spec で固めています（target は `//packages/angular/build:dev-server_integration_tests`、shard 10、flaky）。この章の行に近いのは `options/allowed-hosts_spec.ts`（describe 18 行目「option: "allowedHosts"」、it 4 件）・`options/port_spec.ts`（30 行目、4 件）・`options/define_spec.ts`（15 行目、3 件）・`options/headers_spec.ts`（15 行目、4 件）・`options/prebundle_spec.ts`（17 行目、4 件）と、7 回目の `behavior/build-assets_spec.ts`（23 行目、11 件）です。

| 走らせたもの | 結果 |
| --- | --- |
| `pnpm bazel test //packages/angular/build:dev-server_integration_tests --nocache_test_results --test_output=errors '--test_arg=--filter=option: "(allowedHosts\|port\|define\|headers\|prebundle)"\|Behavior: "browser builder assets"'` | PASSED。10 の shard の「Ran N」の和が 30、0 failures。prebundle の 4 件は pending |

prebundle の 4 件が pending なのは、17 行目が `xdescribe` だからです（14 行目のコメント「キャッシュを有効にすると、テストの中の Vite が止まらない件を調べるまで一時的に止める」）。prebundle の振る舞いは、いま bazel では 1 件も走っていません。inspect の形・`PORT` の空白・`angular:log` の形を見る it もありません。

直すなら、2 節の IPv6 は options.ts の 86 行目で、最後の `:` で割り、`[…]` の括弧を外します。7 節の落ちる所は vite/index.ts の 441〜443 行目と 462〜466 行目に `return` を足します。6 節の待ちは 365 行目の `true` を外すか、schema の説明に「デバッガーがつながるまで待つ」と書くかのどちらかです。spec は、1 つ目は `builders/dev-server/options_spec.ts` を新しく作り、デモの record-normalize.mjs と同じ偽の BuilderContext で `normalizeOptions` を呼ぶ形が最小です。2 つ目は `tests/behavior/` に、dev-server を立てて WebSocket で `data: null` を送り、次の要求が返ることを見る it を足します。

## 聞かれそうな質問

**Q. `ng serve --inspect` を付けたら、サーバーが立ち上がらなくなりました。**

SSR があるとき、365 行目の `inspector.open(port, host, true)` がデバッガーがつながるまで待つからです。Chrome の chrome://inspect や VS Code でつなぐと続きます。SSR が無ければ 362 行目の条件で inspector は開きません。

**Q. `allowedHosts: [".example.com"]` は、Vite と Angular の SSR のどちらに効きますか？**

両方です。Vite にはそのまま（server.ts の 62 行目）、SSR の Host の検査には 105 行目で `*.example.com` に直してビルドの `security.allowedHosts` に入れます。111 行目で dev-server の host も足します。

**Q. ng serve で statsJson や複数のロケールが効かないのはなぜ？**

どちらも serveWithVite が書き換えます。statsJson は vds-config の章で引いた 119〜127 行目で警告して `false`、localize は 138〜145 行目で 2 つ以上なら警告して `false`、1 つなら 148 行目でフォルダを分けない出力にします。

**Q. ブラウザのコンソールのエラーが ng serve の端末に出るのはどういう仕組み？**

ブラウザ側のコードが HMR の WebSocket で `angular:log` を送り、440〜455 行目が `kind` に応じて `[CLIENT ERROR]` などを付けて builder のログに出します。形の崩れた `data`（`null`）を受けると、441 行目のあとに `return` が無いので ng serve が落ちます。

**Q. 証明書を指定したのに、ブラウザが自己署名の警告を出します。**

`sslCert` と `sslKey` の両方が無いと 86 行目の条件が偽になり、267〜270 行目で basic-ssl の自己署名の証明書が使われます。44129f66a3 では相対パスが Node の作業フォルダから読まれる点にも注意が要ります（22.2.7 で直った）。

## 読み終えて

- `normalizeOptions` は inspect を `{ host, port }` に、PORT を数にする。IPv6 の inspect と空白だけの PORT は、思った形にならない。
- `serveWithVite` はビルドの options を書き換える：プリレンダー → SSR、allowedHosts を SSR の形に、statsJson と複数ロケールを切る、差分の結果を有効に。
- ssl は証明書と鍵の両方があるときだけ自分のもの、それ以外は basic-ssl の自己署名。
- SSR の inspect はデバッガーを待つ。`angular:log` の `data: null` で ng serve が落ちる。
- dev-server の spec は本物のサーバーを立てる形で、prebundle の 4 件は `xdescribe` で止まっている。

---

← 前: [チャンクを束ね直す：chunk-optimizer と esbuild の小道具](05-bld-chunk-optimizer.md)  
次: [Vite の middleware の残り：コンポーネントのスタイルとメモリ上のファイル](07-bld-vite-middlewares.md) →
