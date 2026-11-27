[目次](../README.md) › [@angular/build の読み残し（sass・i18n・dev-server・unit-test）](README.md) › 第 7 回 / 全 9 回

# Vite の middleware の残り：コンポーネントのスタイルとメモリ上のファイル

> tools/vite/plugins/setup-middlewares-plugin.ts・middlewares/assets-middleware.ts・angular-memory-plugin.ts：middleware を並べる plugin と SSR の 3 つのかたち、?ngcomp= のコンポーネントのスタイルに encapsulation を付ける所、Vitest のブラウザ用のアセットの middleware、SSR のテンプレートの更新を返すメモリの plugin。

angular/angular-cli · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bld-vite-middlewares)

---

この章で分かること：Angular が Vite に足す middleware を並べる plugin（`vite:angular-setup-middlewares`）の頭と、SSR の 3 つのかたち。アセットの middleware のうち、コンポーネントのスタイルに view encapsulation の属性を付けて返す所（`?ngcomp=`）と、Vitest のブラウザで使うもう 1 つのアセットの middleware。そして、メモリの上の出力を Vite に見せる plugin の頭です。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/src/tools/vite/plugins/setup-middlewares-plugin.ts`・`tools/vite/middlewares/assets-middleware.ts`・`tools/vite/plugins/angular-memory-plugin.ts` と、`builders/dev-server/vite/utils.ts` の 1 か所です。要求が通る順番、アセットを返すか `/@fs/` に書き換えるか、ディレクトリのリダイレクト、ETag の形と HEAD は [vds-assets-html の章](../vds/02-vds-assets-html.md)で、メモリの plugin の解決と読み込みの後半は [boot-dev-server の章](../boot/03-boot-dev-server.md)で読んだので繰り返しません。

1. [1. sass の url を書き換える](01-bld-sass-rebase.md)
2. [2. sass を常駐のコンパイラで動かす](02-bld-sass-service.md)
3. [3. メッセージを取り出す](03-bld-extract-i18n.md)
4. [4. 翻訳を差し込む](04-bld-i18n-inline.md)
5. [5. チャンクを束ね直す](05-bld-chunk-optimizer.md)
6. [6. ng serve の入口の残り](06-bld-dev-server-rest.md)
7. **7. Vite の middleware の残り**（この章）
8. [8. unit-test と ng-packagr](08-bld-unit-test-packagr.md)
9. [9. spec と issue](09-bld-tests-issues.md)

## 0. 並んだ middleware と、版の違い

middleware は「要求を受け取り、自分で返すか、`next()` で次に渡す関数」で、Vite の内部の connect がこれを並べた順に呼びます。6 回目の ng serve の記録で、listen のあとの並びは次の 16 個（SSR のときは 17 個）でした。

- `viteRejectInvalidRequestMiddleware` — Vite の
- `corsMiddleware` — Vite の
  - 👤 `angularHostValidationMiddleware` — Angular の
  - 👤 `angularHeadersMiddleware` — Angular の
  - 👤 `angularComponentMiddleware` — Angular の
  - 👤 `angularAssetsMiddleware` — Angular の
  - 👤 `chromeDevtoolsMiddleware` — Angular の
- `viteCachedTransformMiddleware` — Vite の
- `/__open-in-editor launchEditorMiddleware` — Vite の
- `viteHMRPingMiddleware` — Vite の
- `viteTransformMiddleware` — Vite の
- `viteServeRawFsMiddleware` — Vite の
- `viteServeStaticMiddleware` — Vite の
  - 👤 `angularHtmlFallbackMiddleware` — Angular の
  - 👤 `angularIndexHtmlMiddleware` — Angular の
- `viteErrorMiddleware` — Vite の

サイトの @angular/build 22.2.7 は、この章の範囲で 44129f66a3 と 3 か所違います。アセットの ETag を引用符で囲むようになり（0f63a03bae）、出力の HTML のうち配らないのを /index.html と /index.csr.html だけにし（ddff42cb03）、SSR の middleware にコンポーネントの更新を消す関数を渡すようになりました（37cf399d95）。どれも vds-assets-html の章と vds-hmr-ssr の章の範囲の行です。

## 1. setup-middlewares-plugin の頭：SSR の 3 つのかたち

📄 `angular-cli/packages/angular/build/src/tools/vite/plugins/setup-middlewares-plugin.ts` L9–25 （▶ の行: 14–23）

```ts
 9 │ import type { Connect, Plugin } from 'vite' with {
10 │   'resolution-mode': 'import',
11 │ };
12 │ import {
13 │   ComponentStyleRecord,
14 ▶   angularHtmlFallbackMiddleware,
15 ▶   createAngularAssetsMiddleware,
16 ▶   createAngularComponentMiddleware,
17 ▶   createAngularHeadersMiddleware,
18 ▶   createAngularIndexHtmlMiddleware,
19 ▶   createAngularSsrExternalMiddleware,
20 ▶   createAngularSsrInternalMiddleware,
21 ▶   createChromeDevtoolsMiddleware,
22 ▶   patchBaseMiddleware,
23 ▶   patchHostValidationMiddleware,
24 │ } from '../middlewares';
25 │ import { AngularMemoryOutputFiles, AngularOutputAssets } from '../utils';
```

📄 `angular-cli/packages/angular/build/src/tools/vite/plugins/setup-middlewares-plugin.ts` L27–50 （▶ の行: 31, 40, 49）

```ts
27 │ export enum ServerSsrMode {
28 │   /**
29 │    * No SSR
30 │    */
31 ▶   NoSsr,
32 │ 
33 │   /**
34 │    * Internal server-side rendering (SSR) is handled through the built-in middleware.
35 │    *
36 │    * In this mode, the SSR process is managed internally by the dev-server's middleware.
37 │    * The server automatically renders pages on the server without requiring external
38 │    * middleware or additional configuration from the developer.
39 │    */
40 ▶   InternalSsrMiddleware,
41 │ 
42 │   /**
43 │    * External server-side rendering (SSR) is handled by a custom middleware defined in server.ts.
44 │    *
45 │    * This mode allows developers to define custom SSR behavior by providing a middleware in the
46 │    * `server.ts` file. It gives more flexibility for handling SSR, such as integrating with other
47 │    * frameworks or customizing the rendering pipeline.
48 │    */
49 ▶   ExternalSsrMiddleware,
50 │ }
```

14〜23 行目の 10 個は、どれも `tools/vite/middlewares/` から来ます。8 個は middleware を作る関数で、22〜23 行目の 2 個は Vite が並べた middleware を差し替える関数です（並びの `angularHostValidationMiddleware` は、Vite の Host の検査を 23 行目の関数が差し替えた物）。27〜50 行目の `ServerSsrMode` は、6 回目の vite/index.ts の 384〜393 行目（vds-config の章）で決まります。`NoSsr`（31 行目）、Angular の middleware が描く `InternalSsrMiddleware`（40 行目、`ssr: true` だけのとき）、利用者の server.ts の middleware が描く `ExternalSsrMiddleware`（49 行目、`outputMode` と `ssr.entry` があるとき）の 3 つです。6 回目の「ssr」は 2 つ目で、並びの `angularHtmlFallbackMiddleware` の前に `angularSsrMiddleware` が 1 つ増えました。

📄 `angular-cli/packages/angular/build/src/tools/vite/plugins/setup-middlewares-plugin.ts` L52–73 （▶ の行: 53–54, 57–58, 60, 64, 67–68, 70–71）

```ts
52 │ interface AngularSetupMiddlewaresPluginOptions {
53 ▶   outputFiles: AngularMemoryOutputFiles;
54 ▶   assets: AngularOutputAssets;
55 │   extensionMiddleware?: Connect.NextHandleFunction[];
56 │   indexHtmlTransformer?: (content: string) => Promise<string>;
57 ▶   componentStyles: Map<string, ComponentStyleRecord>;
58 ▶   templateUpdates: Map<string, string>;
59 │   ssrMode: ServerSsrMode;
60 ▶   resetComponentUpdates: () => void;
61 │   projectRoot: string;
62 │ }
63 │ 
64 ▶ async function createEncapsulateStyle(): Promise<
65 │   (style: Uint8Array, componentId: string) => string
66 │ > {
67 ▶   const { encapsulateStyle } = await import('@angular/compiler');
68 ▶   const decoder = new TextDecoder('utf-8');
69 │ 
70 ▶   return (style, componentId) => {
71 ▶     return encapsulateStyle(decoder.decode(style), componentId);
72 │   };
73 │ }
```

53〜61 行目の options の Map は、6 回目の 3 節の 201〜210 行目で作った物そのものです。ビルドのたびに中身が書き換わるので、middleware は要求のたびに最新の出力を引けます。60 行目の `resetComponentUpdates` は、index.html を返すたびにテンプレートの更新を捨てるための関数です（ページを読み直せば最新のコードが来るので、古い更新は要らない）。64〜73 行目、`encapsulateStyle`（CSS のセレクターに `[_ngcontent-…]` を付ける、@angular/compiler の関数）は 67 行目で動的に import します。@angular/compiler は大きいので、dev-server を立てるときに 1 回だけ読みます。

📄 `angular-cli/packages/angular/build/src/tools/vite/plugins/setup-middlewares-plugin.ts` L75–92 （▶ の行: 79–82）

```ts
75 │ export function createAngularSetupMiddlewaresPlugin(
76 │   options: AngularSetupMiddlewaresPluginOptions,
77 │ ): Plugin {
78 │   return {
79 ▶     name: 'vite:angular-setup-middlewares',
80 ▶     enforce: 'pre',
81 ▶     async configureServer(server) {
82 ▶       const {
83 │         indexHtmlTransformer,
84 │         outputFiles,
85 │         extensionMiddleware,
86 │         assets,
87 │         componentStyles,
88 │         templateUpdates,
89 │         ssrMode,
90 │         resetComponentUpdates,
91 │       } = options;
92 │ 
```

79 行目の名前は Vite の設定の plugins の 1 つ目に出ます（6 回目のデモの設定）。80 行目の `enforce: 'pre'` で Vite の組み込みの plugin より先に動き、81 行目の `configureServer` の中で middleware を足します。その先の 93〜138 行目（先に足す 4 つと、関数を返して後ろに足す 3 つ）は boot-dev-server の章の 6 節です。

## 2. アセットの middleware の頭：コンポーネントのスタイルの記録

📄 `angular-cli/packages/angular/build/src/tools/vite/middlewares/assets-middleware.ts` L9–35 （▶ の行: 9, 17, 20–23, 26–27, 33–34）

```ts
 9 ▶ import { lookup as lookupMimeType } from 'mrmime';
10 │ import { readFileSync } from 'node:fs';
11 │ import type { ServerResponse } from 'node:http';
12 │ import { extname } from 'node:path';
13 │ import type { Connect, ViteDevServer } from 'vite' with {
14 │   'resolution-mode': 'import',
15 │ };
16 │ import { ResultFile } from '../../../builders/application/results';
17 ▶ import { calculateHash } from '../../../utils/hash';
18 │ import { AngularMemoryOutputFiles, AngularOutputAssets, pathnameWithoutBasePath } from '../utils';
19 │ 
20 ▶ export interface ComponentStyleRecord {
21 ▶   rawContent: Uint8Array;
22 ▶   used?: Set<string>;
23 ▶   reload?: boolean;
24 │ }
25 │ 
26 ▶ const CSS_PREPROCESSOR_REGEXP = /\.(?:s[ac]ss|less|css)$/;
27 ▶ const JS_TS_REGEXP = /\.[cm]?[tj]sx?$/;
28 │ 
29 │ export function createAngularAssetsMiddleware(
30 │   server: ViteDevServer,
31 │   assets: AngularOutputAssets,
32 │   outputFiles: AngularMemoryOutputFiles,
33 ▶   componentStyles: Map<string, ComponentStyleRecord>,
34 ▶   encapsulateStyle: (style: Uint8Array, componentId: string) => string,
35 │ ): Connect.NextHandleFunction {
```

20〜24 行目の `ComponentStyleRecord` が、コンポーネントのスタイル 1 つの記録です。`rawContent` はビルドが出した CSS、`used` は「どのコンポーネントがこの CSS を取りに来たか」の ID の集合、`reload` は Shadow DOM のコンポーネントが使ったかです。`used` は、CSS が変わったときに 1 つずつ `css-update` を送るのに使い（vds-hmr-ssr の章の hmr.ts の 117〜122 行目）、`reload` が真なら全体の再読み込みにします（同じく 109〜114 行目）。9 行目の `mrmime` は拡張子から MIME の型を引く小さな表、17 行目の `calculateHash` は xxHash の 64 ビットです。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/vite/utils.ts` L86–96 （▶ の行: 93–96）

```ts
86 │     hash: file.hash,
87 │     // Consider the files updated except on the initial build result
88 │     updated: !initial,
89 │     type: file.type,
90 │     servable,
91 │   });
92 │ 
93 ▶   // Record any external component styles
94 ▶   if (filePath.endsWith('.css') && /^\/[a-f0-9]{64}\.css$/.test(filePath)) {
95 ▶     const componentStyle = componentStyles.get(filePath);
96 ▶     if (componentStyle) {
```

この記録を作るのは、6 回目の結果の表を直す `updateResultRecord` の 94 行目で、「64 桁の 16 進数 + .css」の名前だけをコンポーネントのスタイルとみなします。ところが外部のスタイルの名前は 2026-08 から xxHash の 16 桁です。この食い違いと、`NG_HMR_CSTYLES=1` の ng serve で encapsulation の属性が付かないことは [abl-results の章](../abl/02-abl-results.md)で見つけました。この章では、記録が入っていたら 104〜154 行目が何をするかを、記録を手で入れて確かめます。

## 3. ?ngcomp= の要求：encapsulation を付けて返す

📄 `angular-cli/packages/angular/build/src/tools/vite/middlewares/assets-middleware.ts` L104–129 （▶ の行: 105–106, 108–110, 114–115, 119–120, 122, 125–126）

```ts
104 │         let data: Uint8Array | string = outputFile.contents;
105 ▶         const componentStyle = componentStyles.get(pathname);
106 ▶         if (componentStyle) {
107 │           // Inject component ID for view encapsulation if requested
108 ▶           const searchParams = new URL(req.url, 'http://localhost').searchParams;
109 ▶           const componentId = searchParams.get('ngcomp');
110 ▶           if (componentId !== null) {
111 │             // Track if the component uses ShadowDOM encapsulation (3 = ViewEncapsulation.ShadowDom)
112 │             // Shadow DOM components currently require a full reload.
113 │             // Vite's CSS hot replacement does not support shadow root searching.
114 ▶             if (searchParams.get('e') === '3') {
115 ▶               componentStyle.reload = true;
116 │             }
117 │ 
118 │             // Record the component style usage for HMR updates
119 ▶             if (componentStyle.used === undefined) {
120 ▶               componentStyle.used = new Set([componentId]);
121 │             } else {
122 ▶               componentStyle.used.add(componentId);
123 │             }
124 │ 
125 ▶             const etag = `W/"${outputFile.contents.byteLength}-${outputFile.hash}-${componentId}"`;
126 ▶             if (checkAndHandleEtag(req, res, etag)) {
127 │               return;
128 │             }
129 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/vite/middlewares/assets-middleware.ts` L130–154 （▶ の行: 131, 133–134, 137–138, 143, 146–149）

```ts
130 │             // Shim the stylesheet if a component ID is provided
131 ▶             if (componentId.length > 0) {
132 │               // Validate component ID
133 ▶               if (!/^[_.\-\p{Letter}\d]+-c\d+$/u.test(componentId)) {
134 ▶                 const message = 'Invalid component stylesheet ID request: ' + componentId;
135 │                 // eslint-disable-next-line no-console
136 │                 console.error(message);
137 ▶                 res.statusCode = 400;
138 ▶                 res.end(message);
139 │ 
140 │                 return;
141 │               }
142 │ 
143 ▶               data = encapsulateStyle(data, componentId);
144 │             }
145 │ 
146 ▶             res.setHeader('Content-Type', 'text/css');
147 ▶             res.setHeader('Cache-Control', 'no-cache');
148 ▶             res.setHeader('ETag', etag);
149 ▶             res.end(data);
150 │ 
151 │             return;
152 │           }
153 │         }
154 │ 
```

1. **105〜110 行目：記録があり、ngcomp が付いていれば**

   コンポーネントの ID（例 `app-root-c123`）を query から読む。ブラウザの Angular が `<link href="….css?ngcomp=ID&e=N">` を作って取りに来る。
2. **114〜116 行目：Shadow DOM（e=3）なら reload**

   Vite の CSS の差し替えは shadow root の中を探さないので、このスタイルの更新は全体の再読み込みにする。
3. **119〜123 行目：used に ID を足す**

   次に CSS が変わったら、この ID ごとに css-update を送る。
4. **125 行目：ETag に ID を混ぜる**

   同じ CSS でもコンポーネントごとに中身が違う（属性の名前が違う）から。
5. **131〜141 行目：ID を確かめる**

   133 行目の正規表現（文字・数字・`_`・`.`・`-` のあとに `-c` と数字）に合わなければ 400。
6. **143 行目：encapsulation を付ける**

   空の ID（`?ngcomp=`）なら付けずに返す。

> [!WARNING]
> **ハマりどころ**
>
> ID を確かめる 133 行目は、`used` に足す 119〜123 行目と `reload` を立てる 115 行目の**あと**にあります。デモの「?ngcomp= を直接」で、記録の入った表に `?ngcomp=bad%20id!` を投げると 400 が返りますが、`used` には `bad id!` が残り、`?ngcomp=bad%20id!&e=3` では 400 のうえに `reload` が真になりました。このあと CSS が変わると、hmr.ts は `bad id!` の分の css-update も送り、`reload` が真なので全体の再読み込みにします。新しい本家も 115〜133 行目の順は同じです。

本物の ng serve（22.2.7、`NG_HMR_CSTYLES=1`）では、2 節の 94 行目のせいで記録が空なので、`?ngcomp=app-root-c123` も `bad id!` も、154 行目より後ろ（ふつうの出力を返す 155〜168 行目、vds-assets-html の章）で属性の無い CSS が 200 で返りました。ETag も ID の入らない `W/"97-…"` です（デモの「本物の ng serve」）。

## 4. もう 1 つのアセットの middleware：Vitest のブラウザ用

📄 `angular-cli/packages/angular/build/src/tools/vite/middlewares/assets-middleware.ts` L221–240 （▶ の行: 221–224, 233, 235–236, 239）

```ts
221 ▶ export function createBuildAssetsMiddleware(
222 ▶   basePath: string,
223 ▶   buildResultFiles: ReadonlyMap<string, ResultFile>,
224 ▶   readHandler: (path: string) => Buffer = readFileSync,
225 │ ): Connect.NextHandleFunction {
226 │   return function buildAssetsMiddleware(req, res, next) {
227 │     if (req.url === undefined || res.writableEnded) {
228 │       return;
229 │     }
230 │ 
231 │     // Parse the incoming request.
232 │     // The base of the URL is unused but required to parse the URL.
233 ▶     const pathname = pathnameWithoutBasePath(req.url, basePath);
234 │     const extension = extname(pathname);
235 ▶     if (extension && !/\.[mc]?[jt]s(?:\.map)?$/.test(extension)) {
236 ▶       const outputFile = buildResultFiles.get(pathname.slice(1));
237 │       if (outputFile) {
238 │         const contents =
239 ▶           outputFile.origin === 'memory' ? outputFile.contents : readHandler(outputFile.inputPath);
240 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/vite/middlewares/assets-middleware.ts` L241–261 （▶ の行: 241–242, 246–248, 251–253, 259）

```ts
241 ▶         const etag = `W/${calculateHash(contents)}`;
242 ▶         if (checkAndHandleEtag(req, res, etag)) {
243 │           return;
244 │         }
245 │ 
246 ▶         const mimeType = lookupMimeType(extension);
247 ▶         if (mimeType) {
248 ▶           res.setHeader('Content-Type', mimeType);
249 │         }
250 │ 
251 ▶         res.setHeader('ETag', etag);
252 ▶         res.setHeader('Cache-Control', 'no-cache');
253 ▶         res.end(contents);
254 │ 
255 │         return;
256 │       }
257 │     }
258 │ 
259 ▶     next();
260 │   };
261 │ }
```

`createBuildAssetsMiddleware` は ng serve では使われず、unit-test builder の Vitest の plugin（runners/vitest/plugins.ts の 423 行目、[vit-plugins の章](../vit/03-vit-plugins.md)）が、ブラウザで走らせるときの Vite に足します。235 行目、拡張子があり、それが JS・TS とそのソースマップでないものだけを扱います。JS は Vitest の側が読むからです。236 行目、表の鍵は先頭の `/` を落とした名前で、239 行目でメモリの出力かディスクのアセットかを分けます。

1. **241 行目：ETag**

   44129f66a3 では `W/` のあとに引用符が無い（ng serve の側の 53 行目と同じ抜け）。22.2.7 では両方とも `W/"…"` に直った（0f63a03bae）。デモの記録は直ったあとの形。
2. **246〜249 行目：MIME の型**

   `mrmime` は `.ico` を知らないので、`favicon.ico` には Content-Type が付かない（デモ）。dev-server の側の HTML の fallback は `tools/vite/utils.ts` の `lookupMimeTypeFromRequest` で `.ico` だけ特別に扱うが、ここはそれを使っていない。
3. **235 行目：拡張子の無いファイル**

   `extension` が空なら扱わずに 259 行目で次へ渡す。ng serve の側（51 行目）が拡張子の無いアセットを自分で返すのとは逆。

## 5. メモリの plugin の頭

📄 `angular-cli/packages/angular/build/src/tools/vite/plugins/angular-memory-plugin.ts` L9–40 （▶ の行: 16, 20–24, 27–29, 34, 38, 40）

```ts
 9 │ import assert from 'node:assert';
10 │ import { readFile } from 'node:fs/promises';
11 │ import { dirname, join, relative } from 'node:path';
12 │ import { fileURLToPath } from 'node:url';
13 │ import type * as Vite from 'vite' with {
14 │   'resolution-mode': 'import',
15 │ };
16 ▶ import { removeSourceMappingURL } from '../../../utils/source-map';
17 │ import { AngularMemoryOutputFiles } from '../utils';
18 │ 
19 │ interface AngularMemoryPluginOptions {
20 ▶   virtualProjectRoot: string;
21 ▶   outputFiles: AngularMemoryOutputFiles;
22 ▶   templateUpdates?: ReadonlyMap<string, string>;
23 ▶   external?: string[];
24 ▶   disableViteTransport?: boolean;
25 │ }
26 │ 
27 ▶ const ANGULAR_PREFIX = '/@ng/';
28 ▶ const VITE_FS_PREFIX = '/@fs/';
29 ▶ const FILE_PROTOCOL = 'file:';
30 │ 
31 │ export async function createAngularMemoryPlugin(
32 │   options: AngularMemoryPluginOptions,
33 │ ): Promise<Vite.Plugin> {
34 ▶   const { virtualProjectRoot, outputFiles, external } = options;
35 │   const { normalizePath } = (await import('vite' as string)) as typeof Vite;
36 │ 
37 │   return {
38 ▶     name: 'vite:angular-memory',
39 │     // Ensures plugin hooks run before built-in Vite hooks
40 ▶     enforce: 'pre',
```

20〜24 行目、plugin が受け取るのは、仮のプロジェクトの場所（`.angular/vite-root/<project>`）、メモリの出力の表、テンプレートの更新の表、外部の依存、Vite の WebSocket を使うか、の 5 つです。40 行目の `enforce: 'pre'` で、Vite がディスクを探す前にメモリの出力を答えます。

📄 `angular-cli/packages/angular/build/src/tools/vite/plugins/angular-memory-plugin.ts` L41–58 （▶ の行: 42–43, 47, 50–51, 53–54, 56）

```ts
41 │     async resolveId(source, importer, { ssr }) {
42 ▶       if (source.startsWith(VITE_FS_PREFIX)) {
43 ▶         return;
44 │       }
45 │ 
46 │       // For SSR with component HMR, pass through as a virtual module
47 ▶       if (ssr && source.startsWith(FILE_PROTOCOL) && source.includes(ANGULAR_PREFIX)) {
48 │         // Vite will resolve these these files example:
49 │         // `file:///@ng/component?c=src%2Fapp%2Fapp.component.ts%40AppComponent&t=1737017253850`
50 ▶         const sourcePath = fileURLToPath(source);
51 ▶         const sourceWithoutRoot = normalizePath('/' + relative(virtualProjectRoot, sourcePath));
52 │ 
53 ▶         if (sourceWithoutRoot.startsWith(ANGULAR_PREFIX)) {
54 ▶           const [, query] = source.split('?', 2);
55 │ 
56 ▶           return `\0${sourceWithoutRoot}?${query}`;
57 │         }
58 │       }
```

📄 `angular-cli/packages/angular/build/src/tools/vite/plugins/angular-memory-plugin.ts` L81–90 （▶ の行: 83, 85–86, 88）

```ts
81 │     load(id, loadOptions) {
82 │       // For SSR component updates, return the component update module or empty if none
83 ▶       if (loadOptions?.ssr && id.startsWith(`\0${ANGULAR_PREFIX}`)) {
84 │         // Extract component identifier (first character is rollup virtual module null)
85 ▶         const requestUrl = new URL(id.slice(1), 'http://localhost');
86 ▶         const componentId = requestUrl.searchParams.get('c');
87 │ 
88 ▶         return (componentId && options.templateUpdates?.get(encodeURIComponent(componentId))) ?? '';
89 │       }
90 │ 
```

1. **42〜44 行目：/@fs/ は Vite に任せる**

   アセットの middleware が書き換えた URL（vds-assets-html の章）はディスクの実物なので、何も答えない。
2. **47〜57 行目：SSR のコンポーネントの更新**

   SSR で `file:///…/@ng/component?c=…` を import すると、仮の場所を外した `/@ng/component` の形にし、先頭に `\0`（Rollup の「仮のモジュール」の印）を付けて返す。
3. **83〜89 行目：その読み込み**

   query の `c`（`src/app/root.ts@App` のようなコンポーネントの ID）を 88 行目で `encodeURIComponent` し直して、テンプレートの更新の表を引く。無ければ空の文字列（何もしないモジュール）。

更新の表の鍵は、ブラウザに送る `angular:component-update` の `id` と同じ、エンコードした形です（6 回目の vite/index.ts の 315 行目、cli-hmr の章）。デモの「メモリの plugin」で、表にある ID は更新のコードが、無い ID は空の文字列が返りました。残りの解決（59〜79 行目）は vds-config の章と boot-dev-server の章、読み込み（91〜111 行目）は boot-dev-server の章です。

> **🧪 DEMO — middleware と plugin を直接呼んだ記録と、本物の ng serve（@angular/build 22.2.7）**
>
> dist の `updateResultRecord` に、名前の長さだけが違う 3 つの CSS を渡し、どちらの表に入ったかを見ました。16 桁は今の外部のスタイルの名前（`calculateHash('/src/app/root.css')`）です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bld-vite-middlewares)

どう録ったか：

1. **直接呼ぶ**

   record-mw.mjs が dist の `updateResultRecord`・`createAngularAssetsMiddleware`・`createBuildAssetsMiddleware`・`createAngularMemoryPlugin` を require し、`initializeHash` を待ってから、偽の要求（url・method・headers）と応答（setHeader・end）で呼びました。encapsulation は本物の @angular/compiler の `encapsulateStyle` です。
2. **本物の ng serve**

   6 回目と同じ record-serve.mjs と hook.mjs で、下の手順（steps-mw.json）を送りました。`{css}` は 1 つ目の要求の main.js から拾った外部のスタイルの名前です。

📄 `record-mw.mjs`

```js
// @angular/build 22.2.7 の middleware とメモリの plugin を、サーバーを立てずに直接呼んだ記録
// 使い方: node record-mw.mjs <app>
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
const [app] = process.argv.slice(2);
const require = createRequire(join(app, 'package.json'));
const B = join(app, 'node_modules/@angular/build/src');
const { updateResultRecord } = require(join(B, 'builders/dev-server/vite/utils.js'));
const { createAngularAssetsMiddleware, createBuildAssetsMiddleware } = require(join(B, 'tools/vite/middlewares/assets-middleware.js'));
const { createAngularMemoryPlugin } = require(join(B, 'tools/vite/plugins/angular-memory-plugin.js'));
await require(join(B, 'utils/hash.js')).initializeHash();
const { calculateHash } = require(join(B, 'utils/hash.js'));
const { encapsulateStyle } = await import(require.resolve('@angular/compiler'));
const { normalizePath } = await import(require.resolve('vite'));
const enc = new TextEncoder();
const css = enc.encode('h1 { color: #c3002f; }\n');

// 1. updateResultRecord：コンポーネントのスタイルとして覚えるか（名前の長さで比べる）
const xx = calculateHash('/src/app/root.css');           // 今の externalId（xxhash64、16 桁）
const sha = 'a'.repeat(64);                               // 以前の externalId の長さ（sha256、64 桁）
const record = [];
for (const name of [xx + '.css', sha + '.css', 'styles.css']) {
  const generated = new Map(), assets = new Map(), styles = new Map();
  updateResultRecord({ origin: 'memory', path: name, contents: css, hash: 'h', type: 0 }, normalizePath, 'index.html', generated, assets, styles, true);
  record.push({ name, length: name.length - 4, inOutputFiles: generated.has('/' + name), inComponentStyles: styles.has('/' + name) });
}

// 2. angularAssetsMiddleware に ?ngcomp= の要求を、componentStyles が空のときと入っているときで投げる
function fakeRes() {
  const h = {};
  return { statusCode: 200, writableEnded: false, setHeader(k, v) { h[k.toLowerCase()] = v; }, getHeader: (k) => h[k], end(b) { this.body = b === undefined ? '' : typeof b === 'string' ? b : new TextDecoder().decode(b); this.writableEnded = true; }, h };
}
const server = { config: { base: '/' } };
const outputFiles = new Map([['/' + xx + '.css', { contents: css, hash: 'H1', servable: true }]]);
const ngcomp = [];
for (const [label, styles] of [['componentStyles が空（今の 22.2.7）', new Map()], ['componentStyles に入っている（名前が 64 桁だったら）', new Map([['/' + xx + '.css', { rawContent: css }]])]]) {
  const mw = createAngularAssetsMiddleware(server, new Map(), outputFiles, styles, (s, id) => encapsulateStyle(new TextDecoder().decode(s), id));
  for (const q of ['?ngcomp=app-root-c123', '?ngcomp=bad%20id!', '?ngcomp=bad%20id!&e=3', '?ngcomp=x-c1&e=3']) {
    const res = fakeRes();
    let nexted = false;
    const errs = [];
    const origError = console.error;
    console.error = (m) => errs.push(String(m));
    mw({ url: '/' + xx + '.css' + q, method: 'GET', headers: {} }, res, () => (nexted = true));
    console.error = origError;
    const st = styles.get('/' + xx + '.css');
    ngcomp.push({ label, query: q, status: res.statusCode, etag: res.h.etag ?? null, body: res.body ?? null, next: nexted, consoleError: errs, used: st?.used ? [...st.used] : null, reload: st?.reload ?? null });
  }
}

// 3. createBuildAssetsMiddleware（unit-test の Vitest のブラウザで使う）
const files = new Map([
  ['favicon.ico', { origin: 'memory', contents: enc.encode('ICO') }],
  ['app.js', { origin: 'memory', contents: enc.encode('js') }],
  ['styles.css', { origin: 'memory', contents: enc.encode('body{}') }],
]);
const bmw = createBuildAssetsMiddleware('/', files);
const build = [];
for (const [url, headers] of [['/favicon.ico', {}], ['/styles.css', {}], ['/app.js', {}], ['/nothing.png', {}], ['/styles.css', { 'if-none-match': 'PREV' }]]) {
  const res = fakeRes();
  let nexted = false;
  const prev = build.find((b) => b.url === url)?.etag;
  bmw({ url, headers: headers['if-none-match'] ? { 'if-none-match': prev } : {} }, res, () => (nexted = true));
  build.push({ url, ifNoneMatch: headers['if-none-match'] ? prev : null, status: nexted ? null : res.statusCode, next: nexted, contentType: res.h['content-type'] ?? null, etag: res.h.etag ?? null });
}

// 4. createAngularMemoryPlugin の resolveId と load
const root = '/v/.angular/vite-root/demo';
const mem = new Map([
  ['/main.js', { contents: enc.encode('import "./chunk-A.js";\n//# sourceMappingURL=main.js.map\n'), hash: 'm', servable: true }],
  ['/main.js.map', { contents: enc.encode('{"version":3}'), hash: 'mm', servable: true }],
  ['/chunk-A.js', { contents: enc.encode('export const a = 1;\n//# sourceMappingURL=chunk-A.js.map\n'), hash: 'a', servable: true }],
]);
const updates = new Map([[encodeURIComponent('src/app/root.ts@App'), 'export default function App_UpdateMetadata() {}']]);
const plugin = await createAngularMemoryPlugin({ virtualProjectRoot: root, outputFiles: mem, templateUpdates: updates, external: ['lodash'] });
const resolve = [];
for (const [source, importer, ssr] of [
  ['/@fs/x/y.js', undefined, false],
  ['file:///v/.angular/vite-root/demo/@ng/component?c=src%2Fapp%2Froot.ts%40App&t=1', undefined, true],
  ['lodash', '/v/.angular/vite-root/demo/main.js', false],
  ['./chunk-A.js', root + '/main.js?v=1', false],
  ['/main.js?t=123', undefined, false],
  ['/nothing.js', undefined, false],
]) resolve.push({ source, importer: importer ?? null, ssr, result: (await plugin.resolveId(source, importer, { ssr })) ?? null });
const load = [];
for (const [id, ssr] of [
  ['\0/@ng/component?c=src%2Fapp%2Froot.ts%40App&t=1', true],
  ['\0/@ng/component?c=src%2Fapp%2Fother.ts%40Other&t=1', true],
  [root + '/main.js?t=1', false],
  [root + '/chunk-A.js', false],
  [root + '/nothing.js', false],
]) {
  const r = plugin.load(id, { ssr });
  load.push({ id: id.replace('\0', '\\0'), ssr, result: r === undefined ? null : typeof r === 'string' ? r : { code: r.code, map: r.map ?? null } });
}
console.log(JSON.stringify({ record, ngcomp, build, resolve, load }, null, 1));

```

📄 `steps-mw.json`

```json
[
{"label":"main.js からコンポーネントのスタイルの名前を拾う","path":"/main.js","capture":{"css":"([a-f0-9]{16,64}\\.css)"}},
{"label":"?ngcomp=app-root-c123","path":"/{css}?ngcomp=app-root-c123"},
{"label":"?ngcomp=app-root-c123（If-None-Match に同じ ETag）","path":"/{css}?ngcomp=app-root-c123","headers":{"If-None-Match":"__ETAG_PREV__"}},
{"label":"?ngcomp=（空）","path":"/{css}?ngcomp="},
{"label":"?ngcomp=bad id!","path":"/{css}?ngcomp=bad%20id!"},
{"label":"?ngcomp=x-c1&e=3（ShadowDom）","path":"/{css}?ngcomp=x-c1&e=3"},
{"label":"ngcomp なし","path":"/{css}"},
{"label":"HEAD /main.js","method":"HEAD","path":"/main.js"},
{"label":"HEAD /hello.txt（アセット）","method":"HEAD","path":"/hello.txt"},
{"label":"/raw.css（.css のアセット）","path":"/raw.css"},
{"label":"/raw.css（If-None-Match に同じ ETag）","path":"/raw.css","headers":{"If-None-Match":"__ETAG_PREV__"}},
{"label":"/hello.txt（それ以外のアセット）","path":"/hello.txt"},
{"label":"/docs/（ディレクトリの index.html）","path":"/docs/"}
]

```

## テストと直し方

44129f66a3 には、`createAngularAssetsMiddleware`・`createBuildAssetsMiddleware`・`createAngularSetupMiddlewaresPlugin`・`createAngularMemoryPlugin`・`updateResultRecord` の unit の spec がありません（`tools/vite/` の spec は id-prefix-plugin\_spec.ts だけ）。新しい本家には `tools/vite/middlewares/assets-middleware_spec.ts`（a84f9fa9d4）ができましたが、describe は `createBuildAssetsMiddleware` の 1 つ（15 行目）で、ETag の hash の使い回しを見る it 4 件です。dev-server を丸ごと立てる `builders/dev-server/tests/behavior/build-assets_spec.ts`（describe 23 行目、it 11 件）はアセットの返り方を固めていて、6 回目に bazel で走らせた 30 件に入っています（0 failures）。`?ngcomp=` を通る spec はどこにもありません。

| 練習用の作業木（44129f66a3）でしたこと | 結果 |
| --- | --- |
| `builders/dev-server/vite/utils_spec.ts` を足し、`calculateHash(パス) + '.css'`（AngularHost と同じ名前の作り方）の出力を `updateResultRecord` に渡して、コンポーネントのスタイルの表に入ることを見る it と、`styles.css` が入らないことを見る it を書いた。`pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=errors '--test_arg=--filter=updateResultRecord external component styles'` | FAILED。1 件目が `Expected false to be true.`（4 つの shard のうち 2 つで 1 spec ずつ） |
| 94 行目の `{64}` を `{16}` にして同じコマンド | PASSED。2 件とも 0 failures |

直すなら場所は 3 つです。2 節の名前の判定は vite/utils.ts の 94 行目で、桁を AngularHost の名前に合わせます（上の作業木の直し。名前の作り方を 1 つの関数にまとめれば、次に hash を変えたときもずれません）。3 節の順番は assets-middleware.ts の 133〜141 行目の ID の確かめを、115 行目と 119〜123 行目より前に出します。spec は `tools/vite/middlewares/` に `createAngularAssetsMiddleware` の describe を足し、デモの record-mw.mjs と同じ偽の要求で「400 のあとの `used` が増えない」を見ます。4 節の `.ico` は 246 行目で `lookupMimeTypeFromRequest` を使います。

## 聞かれそうな質問

**Q. NG\_HMR\_CSTYLES=1 にすると、コンポーネントのスタイルが他のコンポーネントにも効いてしまいます。**

今の版では、外部のスタイルの名前（16 桁）が vite/utils.ts の 94 行目の「64 桁」に合わず、105 行目の記録が見つからないので、143 行目の encapsulation が付かない CSS が返るからです（abl-results の章、この章のデモ）。既定（NG\_HMR\_CSTYLES なし）ではスタイルは JS に埋まるので起きません。

**Q. `?ngcomp=` の ID はどこから来ますか？**

ブラウザの Angular が、外部のスタイルを `<link>` で付けるときに、コンポーネントの ID（`…-c数字`）と encapsulation の種類（`e`）を query に付けます。サーバーの側は 109 行目と 114 行目でそれを読み、133 行目で形を確かめます。

**Q. middleware の並びを変えたいとき、どこを見ればいいですか？**

setup-middlewares-plugin.ts の `configureServer` です。81 行目の中で `use` した物は Vite の変換の前に、関数を返して足した物（boot-dev-server の章の 115〜138 行目）は Vite の静的なファイルの後ろに並びます。0 節の並びは、その 2 か所と Vite 自身の並びを合わせた結果です。

**Q. SSR でテンプレートだけ変えたとき、サーバーの側はどう更新を受け取りますか？**

サーバーの側のコードが `/@ng/component?c=…` を import すると、メモリの plugin が 47〜57 行目で仮のモジュールにし、83〜89 行目でテンプレートの更新の表から中身を返します。無ければ空のモジュールです。

## 読み終えて

- setup-middlewares-plugin は Angular の middleware を、Vite の変換の前（4 つ）と後ろ（2〜3 つ）に分けて足し、Vite の Host の検査を差し替える。SSR は NoSsr・Internal・External の 3 つ。
- コンポーネントのスタイルは `?ngcomp=ID&e=N` で取りに来て、記録があれば encapsulation の属性を付け、`used` と `reload` を覚える。ID の確かめは記録のあと。
- 記録を作る判定（64 桁）が今の名前（16 桁）に合わず、NG\_HMR\_CSTYLES=1 の encapsulation が働いていない。作業木で 16 桁にすると、足した spec が通った。
- Vitest のブラウザ用のアセットの middleware は、拡張子があり JS でないものだけを返し、`.ico` には Content-Type が付かない。
- メモリの plugin は、SSR のテンプレートの更新を `\0/@ng/component` の仮のモジュールとして返す。

---

← 前: [ng serve の入口の残り：dev-server の options と Vite のサーバー](06-bld-dev-server-rest.md)  
次: [unit-test と ng-packagr の builder の残り](08-bld-unit-test-packagr.md) →
