[目次](../README.md) › [@angular/ssr の読み残し：provideServerRendering・リクエストハンドラ・CommonEngine・ビルド側のワーカーを行で埋める](README.md) › 第 3 回 / 全 6 回

# CommonEngine の残りと性能の記録：enablePerformanceProfiler が測るもの

> node/src/common-engine/common-engine.ts の未読の行（2 つのオプションの型・テンプレートのキャッシュ・bootstrap の見分け方・重要 CSS の読み込み先）、peformance-profiler.ts の runMethodAndMeasurePerf と printPerformanceLogs、重なった 2 つのリクエストで片方の render が reject する理由、src/app.ts と hooks.ts の未読の行を CommonEngine の同じ役の行と並べる。

angular/angular-cli · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ssrl-common-engine)

---

この章で分かること: v22 で非推奨になった `CommonEngine`（`@angular/ssr/node`）の、まだ読んでいない行（2 つのオプションの型・テンプレートのキャッシュ・`bootstrap` の見分け方）と、`enablePerformanceProfiler: true` で何が、どの関数で、どう測られて出るのか。その測り方が、2 つのリクエストが重なると片方の描画を失敗させることを、本物の `CommonEngine` の記録と、作業木で足した spec で確かめます。最後に、今の入口 `AngularServerApp`（`src/app.ts`・`hooks.ts`）の残りの行を、`CommonEngine` の同じ役の行と並べます。

読む対象は angular-cli（44129f66a3）の `packages/angular/ssr/node/src/common-engine/common-engine.ts`・`peformance-profiler.ts`（ファイル名の綴りは本家のまま）と、`src/app.ts`・`src/hooks.ts` の未読の行です。`CommonEngine.render` の本体・作り置きの読み出し（`retrieveSSGPage`）・重要 CSS は[アセットと重要 CSS の章](../ssrx/09-ssrx-assets-css.md)、`renderApplication` を呼ぶ行は[AngularAppEngine の章](../platform/04-ssr-app-engine.md)、`Hooks.run` は同じくアセットと重要 CSS の章で引用しています。

1. [1. provideServerRendering の中身](01-ssrl-provide.md)
2. [2. server.ts の入口](02-ssrl-handlers.md)
3. **3. CommonEngine の残りと性能の記録**（この章）
4. [4. i18n と URL の小道具](04-ssrl-i18n-url.md)
5. [5. ビルド側のワーカー](05-ssrl-build-workers.md)
6. [6. spec と issue](06-ssrl-tests-issues.md)

## 1. CommonEngine の頭と 2 つのオプション

📄 `angular-cli/packages/angular/ssr/node/src/common-engine/common-engine.ts` L9–25 （▶ の行: 11, 17–18, 20–22, 25）

```ts
 9 │ import { ApplicationRef, StaticProvider, Type } from '@angular/core';
10 │ import { BootstrapContext } from '@angular/platform-browser';
11 ▶ import { renderApplication, renderModule, ɵSERVER_CONTEXT } from '@angular/platform-server';
12 │ import * as fs from 'node:fs';
13 │ import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
14 │ import { URL } from 'node:url';
15 │ import { validateUrl } from '../../../src/utils/validation';
16 │ import { getAllowedHostsFromEnv } from '../environment-options';
17 ▶ import { attachNodeGlobalErrorHandlers } from '../errors';
18 ▶ import { CommonEngineInlineCriticalCssProcessor } from './inline-css-processor';
19 │ import {
20 ▶   noopRunMethodAndMeasurePerf,
21 ▶   printPerformanceLogs,
22 ▶   runMethodAndMeasurePerf,
23 │ } from './peformance-profiler';
24 │ 
25 ▶ const SSG_MARKER_REGEXP = /ng-server-context=["']\w*\|?ssg\|?\w*["']/;
```

11 行目、`CommonEngine` は platform-server の `renderApplication` と `renderModule` を直接呼ぶ入口です（`AngularServerApp` のような manifest もルートの木も使わない）。17 行目は第 2 回の `attachNodeGlobalErrorHandlers`、18 行目はリクエストごとに Beasties を走らせる重要 CSS の処理、20〜22 行目がこの章の性能の記録です。25 行目の正規表現は、作り置きのファイルの中に `ng-server-context="ssg"`（`ssr|ssg` のような組み合わせも含む）があるかを見ます。プリレンダーした HTML だけを、描画せずに返すための印です。

📄 `angular-cli/packages/angular/ssr/node/src/common-engine/common-engine.ts` L27–43 （▶ の行: 28–29, 31, 33, 36, 39, 42）

```ts
27 │ /**
28 ▶  * @deprecated Use `AngularNodeAppEngine` or `AngularAppEngine` instead.
29 ▶  * Deprecated since v22.
30 │  */
31 ▶ export interface CommonEngineOptions {
32 │   /** A method that when invoked returns a promise that returns an `ApplicationRef` instance once resolved or an NgModule. */
33 ▶   bootstrap?: Type<{}> | ((context: BootstrapContext) => Promise<ApplicationRef>);
34 │ 
35 │   /** A set of platform level providers for all requests. */
36 ▶   providers?: StaticProvider[];
37 │ 
38 │   /** Enable request performance profiling data collection and printing the results in the server console. */
39 ▶   enablePerformanceProfiler?: boolean;
40 │ 
41 │   /** A set of hostnames that are allowed to access the server. */
42 ▶   allowedHosts?: readonly string[];
43 │ }
```

📄 `angular-cli/packages/angular/ssr/node/src/common-engine/common-engine.ts` L45–70 （▶ の行: 46–47, 49, 51, 54–57, 61, 63, 67, 69）

```ts
45 │ /**
46 ▶  * @deprecated Use `AngularNodeAppEngine` or `AngularAppEngine` instead.
47 ▶  * Deprecated since v22.
48 │  */
49 ▶ export interface CommonEngineRenderOptions {
50 │   /** A method that when invoked returns a promise that returns an `ApplicationRef` instance once resolved or an NgModule. */
51 ▶   bootstrap?: Type<{}> | ((context: BootstrapContext) => Promise<ApplicationRef>);
52 │ 
53 │   /** A set of platform level providers for the current request. */
54 ▶   providers?: StaticProvider[];
55 ▶   url?: string;
56 ▶   document?: string;
57 ▶   documentFilePath?: string;
58 │ 
59 │   /**
60 │    * Reduce render blocking requests by inlining critical CSS.
61 ▶    * Defaults to true.
62 │    */
63 ▶   inlineCriticalCss?: boolean;
64 │ 
65 │   /**
66 │    * Base path location of index file.
67 ▶    * Defaults to the 'documentFilePath' dirname when not provided.
68 │    */
69 ▶   publicPath?: string;
70 │ }
```

1. **エンジン全体の 4 項目と、リクエストごとの 7 項目**

   コンストラクタに渡す `CommonEngineOptions`（31 行目）は、`bootstrap`・platform の `providers`・`enablePerformanceProfiler`・`allowedHosts` の 4 つです。`render` に毎回渡す `CommonEngineRenderOptions`（49 行目）は `bootstrap`・`providers`・`url`・`document`・`documentFilePath`・`inlineCriticalCss`・`publicPath` です。
2. **bootstrap は 2 か所に書けて、エンジンの方が勝つ**

   33 行目と 51 行目は同じ型（NgModule のクラスか、`BootstrapContext` を受けて `ApplicationRef` を返す関数）です。`renderApplication` を呼ぶ行（L188）は `this.options?.bootstrap ?? opts.bootstrap` なので、エンジンに書けば `render` の方は使われません。`providers` は L193〜197 で両方を並べ、`ɵSERVER_CONTEXT = 'ssr'` を先頭に置きます。
3. **既定は doc にだけある**

   61 行目の「`inlineCriticalCss` の既定は true」は、型ではなく `render` の L123 の `!== false` が決めます。67 行目の「`publicPath` の既定は `documentFilePath` の dirname」は、重要 CSS では 4 節の 141〜142 行目のとおりですが、作り置きの読み出し（L149）は `publicPath` が無ければ何もしません。

28〜29 行目と 46〜47 行目の `@deprecated` は、50b16a65b1（2026-05-05、「CommonEngine の API を非推奨にする」）が足しました。`ng add @angular/ssr` の `server-builder` 用のテンプレート（古いビルダーの `server.ts`）は今も `new CommonEngine({…})` を書きます。

## 2. render の 3 段と、測るかどうかの 1 行

📄 `angular-cli/packages/angular/ssr/node/src/common-engine/common-engine.ts` L110–116 （▶ の行: 112, 114–116）

```ts
110 │     }
111 │ 
112 ▶     const enablePerformanceProfiler = this.options?.enablePerformanceProfiler;
113 │ 
114 ▶     const runMethod = enablePerformanceProfiler
115 ▶       ? runMethodAndMeasurePerf
116 ▶       : noopRunMethodAndMeasurePerf;
```

📄 `angular-cli/packages/angular/ssr/node/src/common-engine/common-engine.ts` L132–146 （▶ の行: 133–134, 137, 141–142, 144）

```ts
132 │ 
133 ▶     if (enablePerformanceProfiler) {
134 ▶       printPerformanceLogs();
135 │     }
136 │ 
137 ▶     return html;
138 │   }
139 │ 
140 │   private inlineCriticalCss(html: string, opts: CommonEngineRenderOptions): Promise<string> {
141 ▶     const outputPath =
142 ▶       opts.publicPath ?? (opts.documentFilePath ? dirname(opts.documentFilePath) : '');
143 │ 
144 ▶     return this.inlineCriticalCssProcessor.process(html, outputPath);
145 │   }
146 │ 
```

112〜116 行目、`enablePerformanceProfiler` が真なら `runMethodAndMeasurePerf`、偽なら `noopRunMethodAndMeasurePerf` を `runMethod` にします。そのあとの 3 段（L118 の `'Retrieve SSG Page'`・L121 の `'Render Page'`・L124 の `'Inline Critical CSS'`）は、どれも `runMethod(ラベル, 関数)` で呼ばれます（[アセットと重要 CSS の章](../ssrx/09-ssrx-assets-css.md)の引用）。133〜135 行目、3 段が終わってから、測ったときだけ `printPerformanceLogs()` で表を出します。141〜142 行目は重要 CSS の読み込み先で、`publicPath`、無ければ `documentFilePath` の dirname、どちらも無ければ空文字です。

## 3. peformance-profiler.ts：mark と measure

📄 `angular-cli/packages/angular/ssr/node/src/common-engine/peformance-profiler.ts` L40–65 （▶ の行: 44–46, 49, 51–56, 60, 64）

```ts
40 │ export async function runMethodAndMeasurePerf<T>(
41 │   label: string,
42 │   asyncMethod: () => Promise<T>,
43 │ ): Promise<T> {
44 ▶   const labelName = `${PERFORMANCE_MARK_PREFIX}:${label}`;
45 ▶   const startLabel = `start:${labelName}`;
46 ▶   const endLabel = `end:${labelName}`;
47 │ 
48 │   try {
49 ▶     performance.mark(startLabel);
50 │ 
51 ▶     return await asyncMethod();
52 ▶   } finally {
53 ▶     performance.mark(endLabel);
54 ▶     performance.measure(labelName, startLabel, endLabel);
55 ▶     performance.clearMarks(startLabel);
56 ▶     performance.clearMarks(endLabel);
57 │   }
58 │ }
59 │ 
60 ▶ export function noopRunMethodAndMeasurePerf<T>(
61 │   label: string,
62 │   asyncMethod: () => Promise<T>,
63 │ ): Promise<T> {
64 ▶   return asyncMethod();
65 │ }
```

1. **44〜46 行目：名前を作る**

   `'Render Page'` なら、measure の名前は `🅰️:Render Page`、mark の名前は `start:🅰️:Render Page` と `end:🅰️:Render Page` です。**ラベルだけから作るので、同じラベルの呼び出しはいつも同じ名前になります。**
2. **49・51 行目：始まりの mark を打って待つ**

   `performance` は Node のグローバルの User Timing（`performance.mark` で時刻に名前を付け、`performance.measure` で 2 つの名前の間の長さを記録する仕組み）で、プロセスに 1 つです。
3. **52〜56 行目：finally で measure して消す**

   成功しても失敗しても、終わりの mark を打ち、`measure(名前, 始まり, 終わり)` を記録して、2 つの mark を `clearMarks(名前)` で消します。`measure` は同じ名前の mark が複数あると最後のものを使い、`clearMarks` は同じ名前の mark を全部消します。
4. **60〜65 行目：測らないとき**

   64 行目で関数をそのまま呼ぶだけです。mark も measure も残りません。

📄 `angular-cli/packages/angular/ssr/node/src/common-engine/peformance-profiler.ts` L9–38 （▶ の行: 9, 15–16, 21–22, 26–27, 31, 33–34）

```ts
 9 ▶ const PERFORMANCE_MARK_PREFIX = '🅰️';
10 │ 
11 │ export function printPerformanceLogs(): void {
12 │   let maxWordLength = 0;
13 │   const benchmarks: [step: string, value: string][] = [];
14 │ 
15 ▶   for (const { name, duration } of performance.getEntriesByType('measure')) {
16 ▶     if (!name.startsWith(PERFORMANCE_MARK_PREFIX)) {
17 │       continue;
18 │     }
19 │ 
20 │     // `🅰️:Retrieve SSG Page` -> `Retrieve SSG Page:`
21 ▶     const step = name.slice(PERFORMANCE_MARK_PREFIX.length + 1) + ':';
22 ▶     if (step.length > maxWordLength) {
23 │       maxWordLength = step.length;
24 │     }
25 │ 
26 ▶     benchmarks.push([step, `${duration.toFixed(1)}ms`]);
27 ▶     performance.clearMeasures(name);
28 │   }
29 │ 
30 │   /* eslint-disable no-console */
31 ▶   console.log('********** Performance results **********');
32 │   for (const [step, value] of benchmarks) {
33 ▶     const spaces = maxWordLength - step.length + 5;
34 ▶     console.log(step + ' '.repeat(spaces) + value);
35 │   }
36 │   console.log('*****************************************');
37 │   /* eslint-enable no-console */
38 │ }
```

15 行目で **プロセスにある measure を全部**取り、16 行目で 9 行目の印で始まるものだけを残します。21 行目で `🅰️:` を外して `:` を付け、26 行目で小数 1 桁の ms にし、27 行目でその measure を消します。33〜34 行目は一番長い名前に 5 つの空白を足して揃えます。この関数は「このリクエストの」measure を区別しません。15 行目の時点で残っているものは、ほかのリクエストのものでも出して消します。このファイルは dcf3fddff2（2023-09-28）で足されてから、ライセンスの URL のほかは変わっていません。オプション名の綴り違い（`enablePeformanceProfiler`）は de1ec9da3b（2023-11-03）で直っています。

## 4. DEMO：表と、重なった 2 つのリクエスト

> **🧪 DEMO — enablePerformanceProfiler の出力（記録の再生）**
>
> `<work>/ssrl-demo/a/perf/record.mjs` が、Node v24.22.1 で @angular/ssr 22.2.7 の `new CommonEngine({ enablePerformanceProfiler: true, allowedHosts: ['localhost'] })` を作り、JIT の小さなアプリ（`PendingTasks` で 20 ms 待つ `<h1 class="title">` だけ）を描画した記録です。`console.log` を差し替えて受け取りました。一時ディレクトリに `browser/index.html`・`styles.css`・作り置きの `about/index.html` を置いています。
>
> L118 の Retrieve SSG Page は、/ の pagePath が documentFilePath と同じなので L170 で undefined → L121 の Render Page → L123 で inlineCriticalCss が false でないので L124 の Inline Critical CSS。
>
> 次は、同じエンジンで A（150 ms 待つ `/a`）の `render` を呼び、30 ms 後に B（40 ms 待つ `/b`）を呼んだ記録です。どちらも `inlineCriticalCss: false`・`document` を文字列で渡しています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ssrl-common-engine)

## 5. 重なると何が起きるか（44〜56 行目を 2 本並べる）

1. **0 ms：A が始まる**

   49 行目で `start:🅰️:Render Page`（A のもの）を打ちます。
2. **32 ms：B が始まる**

   B も同じラベルなので、49 行目で **同じ名前**の `start:🅰️:Render Page` を打ちます。mark は 2 つになります。
3. **78 ms：B が終わる**

   54 行目の `measure` は最後の始まり（B のもの）を使うので、B の長さは正しく測れます。そのあと 55 行目の `clearMarks` が、A の始まりも含めて同じ名前の mark を全部消します。B の `render` は L133〜134 で表を出します。表には A の `Retrieve SSG Page` の measure も混ざって 2 行出ます（3 節の 15 行目）。
4. **157 ms：A が終わる**

   53 行目で終わりの mark を打ち、54 行目の `measure` が始まりの mark を探しますが、もうありません。Node は `SyntaxError: The "start:🅰️:Render Page" performance mark has not been set` を投げ、これは `finally` の中なので、51 行目で受け取っていた HTML を捨てて **A の `render` が reject** します。55〜56 行目には来ないので、`end:🅰️:Render Page` の mark が 1 つ残ります。

つまり `enablePerformanceProfiler` を付けたサーバーに 2 つのリクエストが重なると、同じ段にいる長い方の描画が 500 などの失敗になります。描画そのもの（`renderApplication`）は成功しています。angular/angular-cli の #27374（2024 年、「prerender performance mark has not been set」）は、同じ文の例外を「クロールの道具でアクセスすると 500 になる」と報告していて、手元で再現できないとして `needs: more info` で閉じられています。重なりが条件なので、1 つずつ開くと起きません。

> [!NOTE]
> **ポイント**
>
> 測る仕組みを使わない `noopRunMethodAndMeasurePerf`（64 行目）では起きないので、`enablePerformanceProfiler` を付けていないサーバーには関係ありません。`AngularServerApp`（今の `AngularNodeAppEngine` の中身）には、このオプション自体がありません（`grep -rn "performance\." packages/angular/ssr/src` は 0 件）。

## 6. テンプレートのキャッシュと bootstrap の見分け方

📄 `angular-cli/packages/angular/ssr/node/src/common-engine/common-engine.ts` L218–247 （▶ の行: 220–221, 223–225, 232, 234, 242, 245–246）

```ts
218 │ 
219 │   /** Retrieve the document from the cache or the filesystem */
220 ▶   private async getDocument(filePath: string): Promise<string> {
221 ▶     let doc = this.templateCache.get(filePath);
222 │ 
223 ▶     if (!doc) {
224 ▶       doc = await fs.promises.readFile(filePath, 'utf-8');
225 ▶       this.templateCache.set(filePath, doc);
226 │     }
227 │ 
228 │     return doc;
229 │   }
230 │ }
231 │ 
232 ▶ async function exists(path: fs.PathLike): Promise<boolean> {
233 │   try {
234 ▶     await fs.promises.access(path, fs.constants.F_OK);
235 │ 
236 │     return true;
237 │   } catch {
238 │     return false;
239 │   }
240 │ }
241 │ 
242 ▶ function isBootstrapFn(
243 │   value: unknown,
244 │ ): value is (context: BootstrapContext) => Promise<ApplicationRef> {
245 ▶   // We can differentiate between a module and a bootstrap function by reading compiler-generated `ɵmod` static property:
246 ▶   return typeof value === 'function' && !('ɵmod' in value);
247 │ }
```

- 220〜229 行目、`documentFilePath` で渡した index.html は、パスごとに 1 回だけ読んで `templateCache`（L79 の `Map`）に入れます。消す行は無いので、エンジンを作り直すまで、ディスクの index.html を書き換えても前の中身で描画します。
- 232〜240 行目の `exists` は `fs.promises.access` が投げるかどうかだけを見ます。作り置きの読み出し（L170）で使います。
- 242〜247 行目、`bootstrap` が NgModule か関数かは、245 行目のコメントのとおり、コンパイラが NgModule に付ける静的な `ɵmod` の有無で見分けます。関数なら `renderApplication`、NgModule なら `renderModule` です（L211〜216）。第 1 回の `withAppShell` が `ɵcmp` で見分けるのと同じやり方です。

## 7. AngularServerApp の側の、同じ役の行

📄 `angular-cli/packages/angular/ssr/src/app.ts` L9–27 （▶ の行: 15, 17–20, 24–25）

```ts
 9 │ import {
10 │   LOCALE_ID,
11 │   REQUEST,
12 │   REQUEST_CONTEXT,
13 │   RESPONSE_INIT,
14 │   StaticProvider,
15 ▶   ɵresetCompiledComponents,
16 │ } from '@angular/core';
17 ▶ import { createProcessor } from 'beasties/runtime';
18 ▶ import { ServerAssets } from './assets';
19 ▶ import { Hooks } from './hooks';
20 ▶ import { getAngularAppManifest } from './manifest';
21 │ import { RenderMode } from './routes/route-config';
22 │ import { RouteTreeNodeMetadata } from './routes/route-tree';
23 │ import { ServerRouter } from './routes/router';
24 ▶ import { AngularBootstrap, renderAngular } from './utils/ng';
25 ▶ import { promiseWithAbort } from './utils/promise';
26 │ import { createRedirectResponse } from './utils/redirect';
27 │ import { buildPathWithParams, joinUrlParts, stripLeadingSlash } from './utils/url';
```

📄 `angular-cli/packages/angular/ssr/src/app.ts` L81–100 （▶ の行: 86, 92, 99）

```ts
 81 │ /**
 82 │  * Represents a locale-specific Angular server application managed by the server application engine.
 83 │  *
 84 │  * The `AngularServerApp` class handles server-side rendering and asset management for a specific locale.
 85 │  */
 86 ▶ export class AngularServerApp {
 87 │   /**
 88 │    * Whether prerendered routes should be rendered on demand or served directly.
 89 │    *
 90 │    * @see {@link AngularServerAppOptions.allowStaticRouteRender} for more details.
 91 │    */
 92 ▶   private readonly allowStaticRouteRender: boolean;
 93 │ 
 94 │   /**
 95 │    * Hooks for extending or modifying server behavior.
 96 │    *
 97 │    * @see {@link AngularServerAppOptions.hooks} for more details.
 98 │    */
 99 ▶   readonly hooks: Hooks;
100 │ 
```

📄 `angular-cli/packages/angular/ssr/src/app.ts` L136–151 （▶ の行: 139, 147, 149–150）

```ts
136 │   /**
137 │    * Encoder used to convert a string to a Uint8Array.
138 │    */
139 ▶   private readonly textEncoder = new TextEncoder();
140 │ 
141 │   /**
142 │    * Handles an incoming HTTP request by serving prerendered content, performing server-side rendering,
143 │    * or delivering a static file for client-side rendered routes based on the `RenderMode` setting.
144 │    *
145 │    * @param request - The HTTP request to handle.
146 │    * @param requestContext - Optional context for rendering, such as metadata associated with the request.
147 ▶    * @returns A promise that resolves to the resulting HTTP response object, or `null` if no matching Angular route is found.
148 │    *
149 ▶    * @remarks A request to `https://www.example.com/page/index.html` will serve or render the Angular route
150 ▶    * corresponding to `https://www.example.com/page`.
151 │    */
```

📄 `angular-cli/packages/angular/ssr/src/hooks.ts` L9–21 （▶ の行: 16, 21）

```ts
 9 │ /**
10 │  * Defines a handler function type for transforming HTML content.
11 │  * This function receives an object with the HTML to be processed.
12 │  *
13 │  * @param ctx - An object containing the URL and HTML content to be transformed.
14 │  * @returns The transformed HTML as a string or a promise that resolves to the transformed HTML.
15 │  */
16 ▶ type HtmlTransformHandler = (ctx: { url: URL; html: string }) => string | Promise<string>;
17 │ 
18 │ /**
19 │  * Defines the names of available hooks for registering and triggering custom logic within the application.
20 │  */
21 ▶ type HookName = keyof HooksMapping;
```

📄 `angular-cli/packages/angular/ssr/src/hooks.ts` L84–104 （▶ の行: 87, 95–96, 100–101）

````ts
 84 │ 
 85 │   /**
 86 │    * Registers a new hook function under the specified hook name.
 87 ▶    * This function should be a function that takes an argument of type `T` and returns a `string` or `Promise<string>`.
 88 │    *
 89 │    * @template Hook - The type of the hook name. It should be one of the keys of `HooksMapping`.
 90 │    * @param name - The name of the hook under which the function will be registered.
 91 │    * @param handler - A function to be executed when the hook is triggered. The handler will be called with an argument
 92 │    *                  that may be modified by the hook functions.
 93 │    *
 94 │    * @remarks
 95 ▶    * - If there are existing handlers registered under the given hook name, the new handler will be added to the list.
 96 ▶    * - If no handlers are registered under the given hook name, a new list will be created with the handler as its first element.
 97 │    *
 98 │    * @example
 99 │    * ```typescript
100 ▶    * hooks.on('html:transform:pre', async (ctx) => {
101 ▶    *   return ctx.html.replace(/foo/g, 'bar');
102 │    * });
103 │    * ```
104 │    */
````

| 役 | CommonEngine（common-engine.ts） | AngularServerApp（app.ts・hooks.ts） |
| --- | --- | --- |
| 描画 | 11 行目の `renderApplication` / `renderModule` を直接 | 24 行目の `renderAngular`（utils/ng.ts）と 25 行目の `promiseWithAbort` |
| index.html | 220〜229 行目の `templateCache`（ファイルを読む） | 18 行目の `ServerAssets`（20 行目の manifest に入った文字列） |
| 作り置きか | 25 行目の正規表現でファイルの中身を見る | manifest のルートの木の `renderMode`（[manifest と renderAngular の章](../srt/04-srt-manifest-render.md)）。92 行目の `allowStaticRouteRender` で描画もできる |
| 重要 CSS | 18 行目の Beasties をリクエストごとに | 17 行目の `beasties/runtime` の `createProcessor` で、ビルドが作った計画を使う |
| HTML を書き換える口 | 無い | 99 行目の `hooks`。16 行目の `{ url, html }` を受けて文字列を返す関数を、L105 の `on` で積む（95〜96 行目） |
| 性能の記録 | 3 節の `runMethodAndMeasurePerf` | 無い |
| ストリーム | 無い（文字列を返す） | 139 行目の `TextEncoder` で、描画した HTML を `ReadableStream` に流す（L345） |

15 行目の `ɵresetCompiledComponents` は、開発モードの `destroyAngularServerApp` が呼び、@angular/core のコンポーネント ID の表（`GENERATED_COMP_IDS`）を空にするための import です（L478〜484、#25924。[dev-server の HMR と SSR の章](../vds/04-vds-hmr-ssr.md)の引用）。147〜150 行目の doc は、Node 版の `handle`（第 2 回 5 節）と同じ「`/page/index.html` は `/page`」の注意で、文も同じです。21 行目の `HookName` は L26〜28 の `HooksMapping` のキーで、今は `'html:transform:pre'` の 1 つだけです（[アセットと重要 CSS の章](../ssrx/09-ssrx-assets-css.md)）。

## 8. 呼び出しの連なり

- 👤 `new CommonEngine({ enablePerformanceProfiler: true })` — server.ts（古いビルダー） — *L87 で attachNodeGlobalErrorHandlers*
- 👤 `commonEngine.render({ bootstrap, documentFilePath, url, publicPath })` — server.ts — *リクエストごと*
  - `runMethodAndMeasurePerf('Retrieve SSG Page', …)` — peformance-profiler.ts L40 — *49 行目で start の mark*
    - `retrieveSSGPage(opts)` — common-engine.ts L147 — *25 行目の印があれば返す*
  - `runMethodAndMeasurePerf('Render Page', …)` — peformance-profiler.ts L40 — *54 行目の measure*
    - `renderApplication(bootstrap, { platformProviders, url, document })` — common-engine.ts L212 — *246 行目で関数と分かったとき*
  - `runMethodAndMeasurePerf('Inline Critical CSS', …)` — peformance-profiler.ts L40 — *144 行目の process*
  - `printPerformanceLogs()` — peformance-profiler.ts L11 — *15 行目でプロセスの measure を全部読む*

## テストと直し方

### 今の spec

`CommonEngine` と `peformance-profiler.ts` の spec はありません（`node/test/` は request と response の 5 ファイル）。[SSR の守りのシリーズの最終回](../ssrx/10-ssrx-tests-issues.md)でも、bb72145f9a を戻して落ちる spec が無いことを確かめています。`CommonEngine` を起動しているのは、古いビルダー（`@angular-devkit/build-angular` の `ssr-dev-server`）の `specs/works_spec.ts` L42 などの、ビルドしたアプリを通しで動かすテストです。7 節の `Hooks` は `test/hooks_spec.ts` の 7 本（L20〜61）が `on`・`has`・`run` を確かめています。

### 重なりの spec と直し方（作業木で書いて走らせた）

📄 `<work>/ssrl-wt-a/packages/angular/ssr/node/test/peformance-profiler_spec.ts`

```ts
// node/test/peformance-profiler_spec.ts（作業木で新しく書いたもの）
import { runMethodAndMeasurePerf } from '../src/common-engine/peformance-profiler';

describe('runMethodAndMeasurePerf', () => {
  afterEach(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });

  it('should resolve with the value of the method and record a measure', async () => {
    await expectAsync(runMethodAndMeasurePerf('Render Page', async () => 'html')).toBeResolvedTo(
      'html',
    );
    expect(performance.getEntriesByType('measure').map(({ name }) => name)).toEqual([
      '🅰️:Render Page',
    ]);
  });

  it('should not reject when two calls with the same label overlap', async () => {
    let resolveFirst!: (value: string) => void;
    const first = runMethodAndMeasurePerf(
      'Render Page',
      () => new Promise<string>((resolve) => (resolveFirst = resolve)),
    );
    const second = runMethodAndMeasurePerf('Render Page', async () => 'second');

    await expectAsync(second).toBeResolvedTo('second');
    resolveFirst('first');
    await expectAsync(first).toBeResolvedTo('first');
  });
});
```

📄 `直し方の 1 案（peformance-profiler.ts、作業木だけで当てた）`

```
--- a/packages/angular/ssr/node/src/common-engine/peformance-profiler.ts
+++ b/packages/angular/ssr/node/src/common-engine/peformance-profiler.ts
@@ -8,6 +8,9 @@

 const PERFORMANCE_MARK_PREFIX = '🅰️';

+/** Used to give each pair of marks a unique name, so that concurrent calls do not share them. */
+let markId = 0;
+
 export function printPerformanceLogs(): void {
@@ -42,8 +45,9 @@ export async function runMethodAndMeasurePerf<T>(
   const labelName = `${PERFORMANCE_MARK_PREFIX}:${label}`;
-  const startLabel = `start:${labelName}`;
-  const endLabel = `end:${labelName}`;
+  const id = markId++;
+  const startLabel = `start:${labelName}:${id}`;
+  const endLabel = `end:${labelName}:${id}`;
```

- 2 本目の it は 5 節の手順をそのまま書いたもので、今のコードでは `first` が 5 節と同じ例外で reject して落ちます。
- 直す場所は 44〜46 行目で、mark の名前を呼び出しごとに変えれば、55〜56 行目の `clearMarks` がほかの呼び出しの mark を消さなくなります。measure の名前（44 行目）は変えないので、`printPerformanceLogs` の 16・21 行目はそのまま動きます。
- この案でも、3 節の 15 行目が「プロセスの measure を全部」読むことは変わらず、重なったリクエストの行は片方の表にまとめて出ます。表をリクエストごとに分けるなら、`render` の中で測った値を配列に持ち、`printPerformanceLogs` にそれを渡す形になります。

### 手元で走らせた結果

📄 `走らせたコマンド（2026-11-19）`

```
# ../angular-cli-fix（44129f66a3）で、変えずに
pnpm bazel test //packages/angular/ssr/node/test:test --nocache_test_results --test_output=all
# 作業木 <work>/ssrl-wt-a に peformance-profiler_spec.ts（と第 2 回の handler_spec.ts）を足して
pnpm bazel test //packages/angular/ssr/node/test:test --nocache_test_results --test_output=all
# 上の diff を当ててもう一度
pnpm bazel test //packages/angular/ssr/node/test:test --nocache_test_results --test_output=all
```

📄 `結果（//packages/angular/ssr/node/test:test）`

```
42 specs, 0 failures   PASSED   # 変えずに
45 specs, 1 failure    FAILED   # spec を足して
  1) runMethodAndMeasurePerf should not reject when two calls with the same label overlap
     Expected a promise to be resolved to 'first' but it was rejected with
     SyntaxError: The "start:🅰️:Render Page" performance mark has not been set.
45 specs, 0 failures   PASSED   # diff を当てて
```

## 聞かれそうな質問

**Q. enablePerformanceProfiler は何を測りますか？**

`render` の 3 段（作り置きの読み出し・描画・重要 CSS）の長さです。各段を 40〜58 行目で mark と measure に挟み、133〜135 行目で表にして `console.log` に出します。作り置きを返したときは 1 段目だけ、`inlineCriticalCss: false` なら 2 段です（DEMO）。

**Q. 本番で付けたままにしてよいですか？**

リクエストが重なると、同じ段にいる片方の `render` が `SyntaxError: The "start:🅰️:…" performance mark has not been set` で reject します（5 節）。表もリクエストごとには分かれません（3 節の 15 行目）。

**Q. AngularNodeAppEngine で同じ表を出せますか？**

出せません。この記録は `CommonEngine` だけのもので、`src/` の `AngularServerApp` に `performance` を使う行はありません。

**Q. index.html を書き換えたのに、CommonEngine の出力が変わりません。**

`documentFilePath` で渡したファイルは、220〜226 行目でパスごとに 1 回だけ読んでキャッシュし、消す行がありません。エンジンを作り直す（サーバーを再起動する）か、`document` に文字列で渡します。

**Q. bootstrap に NgModule と関数のどちらを渡したかは、どう分かりますか？**

246 行目で、関数で、かつ `ɵmod` を持たなければ bootstrap の関数です。NgModule のクラスはコンパイラが `ɵmod` を付けるので `renderModule` に回ります。

## 読み終えて

- `CommonEngine` は v22 で非推奨。`renderApplication` / `renderModule` を直接呼び、index.html をパスごとにキャッシュし、`ɵmod` で bootstrap を見分ける。
- `enablePerformanceProfiler` は 3 段を `performance.mark` / `measure` で測り、プロセスの measure を全部読んで表にする。
- mark の名前がラベルだけで決まるので、重なった同じ段の 2 つ目の終わりで `measure` が投げ、`finally` の中なのでその `render` が reject する。#27374 の例外と同じ文。
- `AngularServerApp` は manifest・`ServerAssets`・ビルド時の CSS の計画・`Hooks` で同じ役をし、性能の記録は持たない。

---

← 前: [server.ts の入口：createRequestHandler・createNodeRequestHandler と、ビルドが見分ける印](02-ssrl-handlers.md)  
次: [i18n と URL の小道具：JSDoc の約束と本物の答え、ng.ts とマニフェストの残り](04-ssrl-i18n-url.md) →
