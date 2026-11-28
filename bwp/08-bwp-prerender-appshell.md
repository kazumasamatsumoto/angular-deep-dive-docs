[目次](../README.md) › [webpack の builder の内側：@angular-devkit/build-angular と schematics の CLI](README.md) › 第 8 回 / 全 12 回

# prerender と app-shell の builder

> builders/prerender/\*・builders/app-shell/\*：routes・routesFile・discoverRoutes からルートを集める仕組み、ワーカーで server の束を import して renderApplication / renderModule を呼び HTML を書く流れ、index.original.html、app-shell の差し込みと重要 CSS の扱い。

angular/angular-cli · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bwp-prerender-appshell)

---

この章で分かること: webpack の `prerender` と `app-shell` の builder が、browser と server の 2 つの target を 1 回ずつビルドし、server の `main.js` をワーカーで `import` して `renderApplication`（NgModule のアプリなら `renderModule`）を呼び、HTML を書くまでです。prerender のルートの集め方（`routes`・`routesFile`・`discoverRoutes`）、`/` を描くときの `index.original.html`、app-shell の差し込みと重要 CSS（critical CSS）の扱いを、本物を走らせた記録と並べます。

読む対象は angular-cli（44129f66a3）の `packages/angular_devkit/build_angular/src/builders/prerender/`（`index.ts`・`render-worker.ts`・`routes-extractor-worker.ts`・`schema.json`）と `builders/app-shell/`（`index.ts`・`render-worker.ts`・`schema.json`）です。server の束に `renderApplication` などの export が入る仕組みは[前の回](07-bwp-server-ssr.md)、`renderApplication` の中身は[renderApplication の章](../platform/02-ssr-render-application.md)、重要 CSS を差し込む `InlineCriticalCssProcessor` は[第 1 回](01-bwp-browser.md)が読んでいます。application builder の `prerender`・`appShell` の option の側は[プリレンダーの章](../platform/06-ssr-prerender.md)と[ビルド側のワーカーの章](../ssrl/05-ssrl-build-workers.md)、この 2 つの target を application builder の option に移す移行は[builder の移行の章](../sca/05-sca-build-migrations.md)です。

1. [1. browser builder の流れ](01-bwp-browser.md)
2. [2. webpack の共通の設定](02-bwp-webpack-common.md)
3. [3. スタイルの設定](03-bwp-webpack-styles.md)
4. [4. Angular の webpack プラグイン](04-bwp-webpack-plugins.md)
5. [5. babel の最適化のプラグイン](05-bwp-babel.md)
6. [6. webpack の dev-server](06-bwp-dev-server.md)
7. [7. server builder と ssr-dev-server](07-bwp-server-ssr.md)
8. **8. prerender と app-shell**（この章）
9. [9. webpack の i18n](09-bwp-i18n.md)
10. [10. karma の builder の webpack の側](10-bwp-karma.md)
11. [11. schematics の CLI](11-bwp-schematics-cli.md)
12. [12. spec と issue](12-bwp-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> **prerender**（SSG）は、ビルドのときにルートごとの HTML を作っておき、静的なファイルとして配る方法です。**app shell** は 1 つのルート（ここでは `/shell`）だけを描いて `index.html` に入れ、JS が読み込まれる前にも枠が見えるようにする方法です。どちらも webpack の側では、browser と server の 2 つの target を指す別の target として angular.json に書きます。

### 1. 全体の流れ

- 👤 `ng run demo:prerender` — 利用者
  - `execute()` — prerender/index.ts 277 — *browser の options を読む*
    - `_scheduleBuilds()` — prerender/index.ts 97 — *browser と server を watch なしで 1 回ずつ*
    - `_renderUniversal()` — prerender/index.ts 152 — *ロケールごと*
      - `getRoutes()` — prerender/index.ts 41 — *routes ＋ routesFile ＋ routes-extractor-worker*
      - `worker.run({ route, … })` × ルートの数 — render-worker.ts 61 — *renderApplication → 重要 CSS → 書く*
- 👤 `ng run demo:app-shell` — 利用者
  - `_appShellBuilder()` — app-shell/index.ts 158 — *browser の inlineCritical を切ってビルド*
    - `_renderUniversal()` — app-shell/index.ts 29 — *route を 1 つ描き、重要 CSS を足して index.html に書く*

## 2. 2 つのビルドを 1 回ずつ回す

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/index.ts` L272–300 （▶ の行: 281, 287–288, 290, 293, 297）

```ts
272 │ /**
273 │  * Builds the browser and server, then renders each route in options.routes
274 │  * and writes them to prerender/<route>/index.html for each output path in
275 │  * the browser result.
276 │  */
277 │ export async function execute(
278 │   options: PrerenderBuilderOptions,
279 │   context: BuilderContext,
280 │ ): Promise<PrerenderBuilderOutput> {
281 ▶   context.logger.warn(
282 │     'The "@angular-devkit/build-angular:prerender" builder is deprecated as part of Angular\'s Webpack support deprecation. ' +
283 │       'Use "@angular/build:application" instead. For more information, see https://angular.dev/tools/cli/build-system-migration.',
284 │   );
285 │ 
286 │   const browserTarget = targetFromTargetString(options.browserTarget);
287 ▶   const browserOptions = (await context.getTargetOptions(
288 ▶     browserTarget,
289 │   )) as unknown as BrowserBuilderOptions;
290 ▶   const result = await _scheduleBuilds(options, context);
291 │   const { success, error, browserResult, serverResult } = result;
292 │ 
293 ▶   if (!success || !browserResult || !serverResult) {
294 │     return { success, error } as BuilderOutput;
295 │   }
296 │ 
297 ▶   return _renderUniversal(options, context, browserResult, serverResult, browserOptions);
298 │ }
299 │ 
300 │ export default createBuilder(execute);
```

281〜284 行目の非推奨の警告のあと、287〜289 行目で browser の target の options を `getTargetOptions` で読みます。schema で検証しない生の値なので、angular.json に書いていない option は `undefined` です（app-shell は 7 節の 40 行目で検証してから読む）。290 行目で 2 つのビルドを回し、293 行目、どちらかが失敗なら結果だけ返します。297 行目で描画に進みます。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/index.ts` L94–122 （▶ の行: 109–112, 115, 119）

```ts
 94 │ /**
 95 │  * Schedules the server and browser builds and returns their results if both builds are successful.
 96 │  */
 97 │ async function _scheduleBuilds(
 98 │   options: PrerenderBuilderOptions,
 99 │   context: BuilderContext,
100 │ ): Promise<
101 │   BuilderOutput & {
102 │     serverResult?: ServerBuilderOutput;
103 │     browserResult?: BrowserBuilderOutput;
104 │   }
105 │ > {
106 │   const browserTarget = targetFromTargetString(options.browserTarget);
107 │   const serverTarget = targetFromTargetString(options.serverTarget);
108 │ 
109 ▶   const browserTargetRun = await context.scheduleTarget(browserTarget, {
110 ▶     watch: false,
111 ▶     serviceWorker: false,
112 ▶     // todo: handle service worker augmentation
113 │   });
114 │ 
115 ▶   if (browserTargetRun.info.builderName === '@angular-devkit/build-angular:application') {
116 │     return {
117 │       success: false,
118 │       error:
119 ▶         '"@angular-devkit/build-angular:application" has built-in prerendering capabilities. ' +
120 │         'The "prerender" option should be used instead.',
121 │     };
122 │   }
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/index.ts` L124–146 （▶ の行: 124–125, 129, 135–136, 144）

```ts
124 ▶   const serverTargetRun = await context.scheduleTarget(serverTarget, {
125 ▶     watch: false,
126 │   });
127 │ 
128 │   try {
129 ▶     const [browserResult, serverResult] = await Promise.all([
130 │       browserTargetRun.result as unknown as BrowserBuilderOutput,
131 │       serverTargetRun.result as unknown as ServerBuilderOutput,
132 │     ]);
133 │ 
134 │     const success =
135 ▶       browserResult.success && serverResult.success && browserResult.baseOutputPath !== undefined;
136 ▶     const error = browserResult.error || (serverResult.error as string);
137 │ 
138 │     return { success, error, browserResult, serverResult };
139 │   } catch (e) {
140 │     assertIsError(e);
141 │ 
142 │     return { success: false, error: e.message };
143 │   } finally {
144 ▶     await Promise.all([browserTargetRun.stop(), serverTargetRun.stop()]);
145 │   }
146 │ }
```

109〜113 行目、browser の target は `watch: false` と `serviceWorker: false` で上書きして回します（service worker は描いた後に作る。112 行目の todo と 5 節の 246 行目）。browser の側の `optimization` は上書きしないので、本番の設定なら browser のビルドが `index.html` に重要 CSS を差し込みます（4 節で効いてくる）。115 行目は、browser の target の builder が `@angular-devkit/build-angular:application` なら「application builder には prerender の機能がある」と失敗にします（49ed9a26cb、2023-12）。名前は 1 つだけで、`@angular/build:application`（2024-02 にできたパッケージ）は入っていません。

124 行目で server の target を回し、129〜132 行目で両方を待ちます。135 行目の成功の条件には `browserResult.baseOutputPath !== undefined` が入っています。application builder の結果には `baseOutputPath` が無いので、`@angular/build:application` を指すと両方のビルドが成功しても `success: false` になり、136 行目の `error` も両方 `undefined` です。記録の「browserTarget が @angular/build:application」は、ビルドが終わったあと何の文も出さずに終了コード 1 でした。

## 3. ルートを集める：routes・routesFile・discoverRoutes

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/schema.json` L16–38 （▶ の行: 18, 28, 32–33, 37）

```json
16 │     "routesFile": {
17 │       "type": "string",
18 ▶       "description": "The path to a file that contains a list of all routes to prerender, separated by newlines. This option is useful if you want to prerender routes with parameterized URLs."
19 │     },
20 │     "routes": {
21 │       "type": "array",
22 │       "description": "The routes to render.",
23 │       "items": {
24 │         "minItems": 1,
25 │         "type": "string",
26 │         "uniqueItems": true
27 │       },
28 ▶       "default": []
29 │     },
30 │     "discoverRoutes": {
31 │       "type": "boolean",
32 ▶       "description": "Whether the builder should process the Angular Router configuration to find all unparameterized routes and prerender them.",
33 ▶       "default": true
34 │     }
35 │   },
36 │   "required": ["browserTarget", "serverTarget"],
37 ▶   "anyOf": [{ "required": ["routes"] }, { "required": ["routesFile"] }],
38 │   "additionalProperties": false
```

37 行目の `anyOf` は「`routes` か `routesFile` のどちらかを書く」です。28 行目に `routes` の既定値 `[]` がありますが、記録では `discoverRoutes` だけを書いた target は「must have required property 'routes'」の schema の検査で落ちました。既定値が入る前に `anyOf` の `required` が調べられるからです。32 行目の説明は「Router の設定から、引数の無いルートを全部見つけて描くか」で、既定は 33 行目の `true` ですが、それだけでは動かず、`routes: []` を明示する必要があります（spec も 169 行目の it で `routes: ['']` を渡している）。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/index.ts` L35–58 （▶ の行: 35–37, 48–49, 52–53, 55–56）

```ts
35 ▶ class RoutesSet extends Set<string> {
36 ▶   override add(value: string): this {
37 ▶     return super.add(value.charAt(0) === '/' ? value.slice(1) : value);
38 │   }
39 │ }
40 │ 
41 │ async function getRoutes(
42 │   indexFile: string,
43 │   outputPath: string,
44 │   serverBundlePath: string,
45 │   options: PrerenderBuilderOptions,
46 │   workspaceRoot: string,
47 │ ): Promise<string[]> {
48 ▶   const { routes: extraRoutes = [], routesFile, discoverRoutes } = options;
49 ▶   const routes = new RoutesSet(extraRoutes);
50 │ 
51 │   if (routesFile) {
52 ▶     const routesFromFile = (await readFile(path.join(workspaceRoot, routesFile), 'utf8')).split(
53 ▶       /\r?\n/,
54 │     );
55 ▶     for (const route of routesFromFile) {
56 ▶       routes.add(route);
57 │     }
58 │   }
```

35〜39 行目の `RoutesSet` は、入れるときに先頭の `/` を 1 つ落とす `Set` です。`/about` と `about` は同じものになります。51〜58 行目、`routesFile` は workspace の root からのパスで、52〜54 行目で改行で分けた行を**全部**入れます。空の行を飛ばさないので、ファイルの最後の改行のあとの空の文字列も 1 つのルートになり、5 節の 220 行目で `/` になります。記録の「routesFile だけ（最後に改行あり）」は 2 行のファイルなのに 3 つのルート（`/items/1`・`/items/2`・`/`）を描き、`index.html` が描いた HTML に変わって `index.original.html` ができました。改行なしのファイルでは 2 つでした。application builder の `routesFile` も同じ読み方です（[ビルド側のワーカーの章](../ssrl/05-ssrl-build-workers.md)の記録）。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/index.ts` L60–92 （▶ の行: 62, 65–69, 78, 80, 82, 87–88）

```ts
60 │   let zonePackage: string | undefined;
61 │   try {
62 ▶     zonePackage = require.resolve('zone.js/node', { paths: [workspaceRoot] });
63 │   } catch {}
64 │ 
65 ▶   if (discoverRoutes) {
66 ▶     const renderWorker = new Piscina({
67 ▶       filename: require.resolve('./routes-extractor-worker'),
68 ▶       maxThreads: 1,
69 ▶       workerData: {
70 │         indexFile,
71 │         outputPath,
72 │         serverBundlePath,
73 │         zonePackage,
74 │       } as RoutesExtractorWorkerData,
75 │       recordTiming: false,
76 │     });
77 │ 
78 ▶     const extractedRoutes: string[] = await renderWorker
79 │       .run({})
80 ▶       .finally(() => void renderWorker.destroy());
81 │ 
82 ▶     for (const route of extractedRoutes) {
83 │       routes.add(route);
84 │     }
85 │   }
86 │ 
87 ▶   if (routes.size === 0) {
88 ▶     throw new Error('Could not find any routes to prerender.');
89 │   }
90 │ 
91 │   return [...routes];
92 │ }
```

62 行目、workspace から `zone.js/node` を探します（このアプリは zoneless なので無い）。65〜76 行目、`discoverRoutes` なら、スレッドが 1 本の piscina（Node の worker\_threads を束ねる道具）で `routes-extractor-worker` を作り、78〜80 行目で 1 回だけ走らせて壊します。82〜84 行目で、取り出したルートを足します。87〜89 行目、1 つも無ければ「Could not find any routes to prerender.」で例外にします。記録の「routes: \[\] と discoverRoutes: false」がこの文で終わりました（schema の検査は通る形）。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/routes-extractor-worker.ts` L35–68 （▶ の行: 39, 41–43, 45, 48, 55, 58, 62–63）

```ts
35 │ const { zonePackage, serverBundlePath, outputPath, indexFile } =
36 │   workerData as RoutesExtractorWorkerData;
37 │ 
38 │ async function extract(): Promise<string[]> {
39 ▶   const {
40 │     AppServerModule,
41 ▶     ɵgetRoutesFromAngularRouterConfig: getRoutesFromAngularRouterConfig,
42 ▶     default: bootstrapAppFn,
43 ▶   } = (await import(serverBundlePath)) as ServerBundleExports;
44 │ 
45 ▶   const browserIndexInputPath = path.join(outputPath, indexFile);
46 │   const document = await fs.promises.readFile(browserIndexInputPath, 'utf8');
47 │ 
48 ▶   const bootstrapAppFnOrModule = bootstrapAppFn || AppServerModule;
49 │   assert(
50 │     bootstrapAppFnOrModule,
51 │     `The file "${serverBundlePath}" does not have a default export for an AppServerModule or a bootstrapping function.`,
52 │   );
53 │ 
54 │   const routes: string[] = [];
55 ▶   const { routes: extractRoutes } = await getRoutesFromAngularRouterConfig(
56 │     bootstrapAppFnOrModule,
57 │     document,
58 ▶     new URL('http://localhost'),
59 │   );
60 │ 
61 │   for (const { route, redirectTo } of extractRoutes) {
62 ▶     if (redirectTo === undefined && !/[:*]/.test(route)) {
63 ▶       routes.push(route);
64 │     }
65 │   }
66 │ 
67 │   return routes;
68 │ }
```

ワーカーは 39〜43 行目で server の `main.js` を `import` し、前の回の loader が足した `ɵgetRoutesFromAngularRouterConfig` と `default`（bootstrap の関数）を取り出します。55〜59 行目で、browser の出力の `index.html` を document にして、仮の URL `http://localhost` で Router の設定を辿ります（中身は[サーバールートの章](../platform/05-ssr-server-routes.md)）。62 行目、`redirectTo` のあるルートと、`:` か `*` を含むルートは除きます。記録では Router の 5 つのルートのうち、`old`（redirect）と `items/:id` が除かれ、`["/", "/about", "/shell"]` が返りました。

## 4. ルートごとに描く：render-worker

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/index.ts` L148–187 （▶ の行: 171–173, 181–184）

```ts
148 │ /**
149 │  * Renders each route and writes them to
150 │  * <route>/index.html for each output path in the browser result.
151 │  */
152 │ async function _renderUniversal(
153 │   options: PrerenderBuilderOptions,
154 │   context: BuilderContext,
155 │   browserResult: BrowserBuilderOutput,
156 │   serverResult: ServerBuilderOutput,
157 │   browserOptions: BrowserBuilderOptions,
158 │ ): Promise<PrerenderBuilderOutput> {
159 │   const projectName = context.target && context.target.project;
160 │   if (!projectName) {
161 │     throw new Error('The builder requires a target.');
162 │   }
163 │ 
164 │   const projectMetadata = await context.getProjectMetadata(projectName);
165 │   const projectRoot = path.join(
166 │     context.workspaceRoot,
167 │     (projectMetadata.root as string | undefined) ?? '',
168 │   );
169 │ 
170 │   // Users can specify a different base html file e.g. "src/home.html"
171 ▶   const indexFile = getIndexOutputFile(browserOptions.index);
172 ▶   const { styles: normalizedStylesOptimization } = normalizeOptimization(
173 ▶     browserOptions.optimization,
174 │   );
175 │ 
176 │   let zonePackage: string | undefined;
177 │   try {
178 │     zonePackage = require.resolve('zone.js/node', { paths: [context.workspaceRoot] });
179 │   } catch {}
180 │ 
181 ▶   const { baseOutputPath = '' } = serverResult;
182 ▶   const worker = new Piscina({
183 ▶     filename: path.join(__dirname, 'render-worker.js'),
184 ▶     maxThreads: maxWorkers,
185 │     workerData: { zonePackage },
186 │     recordTiming: false,
187 │   });
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/index.ts` L189–226 （▶ の行: 193–195, 197, 201, 212–213, 217, 220, 224）

```ts
189 │   let routes: string[] | undefined;
190 │ 
191 │   try {
192 │     // We need to render the routes for each locale from the browser output.
193 ▶     for (const { path: outputPath } of browserResult.outputs) {
194 ▶       const localeDirectory = path.relative(browserResult.baseOutputPath, outputPath);
195 ▶       const serverBundlePath = path.join(baseOutputPath, localeDirectory, 'main.js');
196 │ 
197 ▶       if (!fs.existsSync(serverBundlePath)) {
198 │         throw new Error(`Could not find the main bundle: ${serverBundlePath}`);
199 │       }
200 │ 
201 ▶       routes ??= await getRoutes(
202 │         indexFile,
203 │         outputPath,
204 │         serverBundlePath,
205 │         options,
206 │         context.workspaceRoot,
207 │       );
208 │ 
209 │       const spinner = ora(`Prerendering ${routes.length} route(s) to ${outputPath}...`).start();
210 │ 
211 │       try {
212 ▶         const results = (await Promise.all(
213 ▶           routes.map((route) => {
214 │             const options: RenderOptions = {
215 │               indexFile,
216 │               deployUrl: browserOptions.deployUrl || '',
217 ▶               inlineCriticalCss: !!normalizedStylesOptimization.inlineCritical,
218 │               minifyCss: !!normalizedStylesOptimization.minify,
219 │               outputPath,
220 ▶               route: route[0] === '/' ? route : '/' + route,
221 │               serverBundlePath,
222 │             };
223 │ 
224 ▶             return worker.run(options);
225 │           }),
226 │         )) as RenderResult[];
```

1. **index.html の名前と CSS の設定（171〜174 行目）**

   browser の `index` の option から出力のファイル名を、`optimization` から `styles` の `minify`・`inlineCritical` を決めます（書かなければ `true`）。
2. **ワーカーを作る（182〜187 行目）**

   スレッドの数は `maxWorkers`（`NG_BUILD_MAX_WORKERS`。[第 1 回](01-bwp-browser.md)の environment-options）です。
3. **ロケールごとに（193〜199 行目）**

   browser の出力のフォルダの、`baseOutputPath` からの相対（`ja` など）を、server の `baseOutputPath` に付けて `main.js` を探します。無ければ例外です。
4. **ルートは 1 回だけ集める（201 行目）**

   `??=` なので、2 つ目からのロケールでは 1 つ目のロケールの server の束で集めたルートを使います。
5. **全部のルートを一度に投げる（212〜226 行目）**

   `Promise.all` で、ルートごとに `worker.run` します。220 行目で先頭の `/` を付け直します（30d8332edc、2026-04）。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/render-worker.ts` L58–97 （▶ の行: 71–73, 81, 83, 85–86, 89, 94）

```ts
58 │ /**
59 │  * Renders each route in routes and writes them to <outputPath>/<route>/index.html.
60 │  */
61 │ async function render({
62 │   indexFile,
63 │   deployUrl,
64 │   minifyCss,
65 │   outputPath,
66 │   serverBundlePath,
67 │   route,
68 │   inlineCriticalCss,
69 │ }: RenderOptions): Promise<RenderResult> {
70 │   const result = {} as RenderResult;
71 ▶   const browserIndexOutputPath = path.join(outputPath, indexFile);
72 ▶   const outputFolderPath = path.join(outputPath, route);
73 ▶   const outputIndexPath = path.join(outputFolderPath, 'index.html');
74 │ 
75 │   const {
76 │     ɵSERVER_CONTEXT,
77 │     AppServerModule,
78 │     renderModule,
79 │     renderApplication,
80 │     default: bootstrapAppFn,
81 ▶   } = (await import(serverBundlePath)) as ServerBundleExports;
82 │ 
83 ▶   assert(ɵSERVER_CONTEXT, `ɵSERVER_CONTEXT was not exported from: ${serverBundlePath}.`);
84 │ 
85 ▶   const indexBaseName = fs.existsSync(path.join(outputPath, 'index.original.html'))
86 ▶     ? 'index.original.html'
87 │     : indexFile;
88 │   const browserIndexInputPath = path.join(outputPath, indexBaseName);
89 ▶   const document = await fs.promises.readFile(browserIndexInputPath, 'utf8');
90 │ 
91 │   const platformProviders: StaticProvider[] = [
92 │     {
93 │       provide: ɵSERVER_CONTEXT,
94 ▶       useValue: 'ssg',
95 │     },
96 │   ];
97 │ 
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/render-worker.ts` L98–123 （▶ の行: 101, 104–107, 112, 118）

```ts
 98 │   let html: string;
 99 │ 
100 │   // Render platform server module
101 ▶   if (isBootstrapFn(bootstrapAppFn)) {
102 │     assert(renderApplication, `renderApplication was not exported from: ${serverBundlePath}.`);
103 │ 
104 ▶     html = await renderApplication(bootstrapAppFn, {
105 ▶       document,
106 ▶       url: route,
107 ▶       platformProviders,
108 │     });
109 │   } else {
110 │     assert(renderModule, `renderModule was not exported from: ${serverBundlePath}.`);
111 │ 
112 ▶     const moduleClass = bootstrapAppFn || AppServerModule;
113 │     assert(
114 │       moduleClass,
115 │       `Neither an AppServerModule nor a bootstrapping function was exported from: ${serverBundlePath}.`,
116 │     );
117 │ 
118 ▶     html = await renderModule(moduleClass, {
119 │       document,
120 │       url: route,
121 │       extraProviders: platformProviders,
122 │     });
123 │   }
```

ワーカーは 81 行目で server の束を `import` し、83 行目で `ɵSERVER_CONTEXT` があるかを確かめます（無ければ前の回の loader を通っていない束）。85〜89 行目、`index.original.html` があればそれを、無ければ `index.html` を document にします。94 行目で `ɵSERVER_CONTEXT` に `'ssg'` を入れ、描いた HTML の `<app-root>` の `ng-server-context="ssg"` になります。101 行目、`default` が関数で `ɵmod`（NgModule にコンパイラが付ける static のプロパティ）を持たなければ bootstrap の関数として 104〜108 行目の `renderApplication`、そうでなければ 118〜122 行目の `renderModule` です（150〜155 行目の `isBootstrapFn`）。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/render-worker.ts` L125–148 （▶ の行: 125–126, 132, 135, 139–141, 144–145）

```ts
125 ▶   if (inlineCriticalCss) {
126 ▶     const inlineCriticalCssProcessor = new InlineCriticalCssProcessor({
127 │       deployUrl,
128 │       outputPath,
129 │       minify: minifyCss,
130 │     });
131 │ 
132 ▶     const { content, warnings, errors } = await inlineCriticalCssProcessor.process(html);
133 │     result.errors = errors;
134 │     result.warnings = warnings;
135 ▶     html = content;
136 │   }
137 │ 
138 │   // This case happens when we are prerendering "/".
139 ▶   if (browserIndexOutputPath === outputIndexPath) {
140 ▶     const browserIndexOutputPathOriginal = path.join(outputPath, 'index.original.html');
141 ▶     fs.renameSync(browserIndexOutputPath, browserIndexOutputPathOriginal);
142 │   }
143 │ 
144 ▶   fs.mkdirSync(outputFolderPath, { recursive: true });
145 ▶   fs.writeFileSync(outputIndexPath, html);
146 │ 
147 │   return result;
148 │ }
```

125〜136 行目、`inlineCriticalCss` なら、描いた HTML を `InlineCriticalCssProcessor`（beasties）に通します。139〜142 行目、`/` を描くときは書き先が browser の `index.html` と同じなので、先に `index.original.html` へ名前を変えます。ほかのルートのワーカーは 85 行目でこちらを読みます。144〜145 行目で `<ルート>/index.html` に書きます。

> [!WARNING]
> **ハマりどころ**
>
> 2 節の 109〜113 行目は browser の `optimization` を上書きしないので、本番の設定では browser のビルドがもう `index.html` に重要 CSS の `<style>` を入れています。render-worker はその HTML を document にして描き、125 行目でもう一度 beasties に通します。記録の prerender の出力では、`index.original.html`（browser のビルドのまま）の `<style>app-root{…}</style>` は 1 つ、描いたルートの HTML は全部 2 つで、中身は同じでした（「出力の HTML」の列）。app-shell は 7 節の 176 行目で browser の `inlineCritical` を切ってから自分で 1 回だけ差し込むので、1 つです。二重になるのは、グローバルのスタイルに、描く前の `index.html` にもある要素（`body`・`app-root` など）に当たる規則があるときです。spec の「should inline critical css for route」（works\_spec.ts の 207 行目）の規則は `p` だけで、`p` は描く前の `index.html` に無いので browser のビルドでは差し込まれず、二重になりません。作業木で `body { margin: 0 }` を足した it を書くと「Expected 2 to be 1.」で落ち、2 節の 109〜113 行目で app-shell と同じく `inlineCritical` を切って渡すと、prerender の 9 の spec が全部通りました（テストと直し方）。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/render-worker.ts` L150–177 （▶ の行: 164, 166, 170, 177）

```ts
150 │ function isBootstrapFn(
151 │   value: unknown,
152 │ ): value is (context: BootstrapContext) => Promise<ApplicationRef> {
153 │   // We can differentiate between a module and a bootstrap function by reading compiler-generated `ɵmod` static property:
154 │   return typeof value === 'function' && !('ɵmod' in value);
155 │ }
156 │ 
157 │ /**
158 │  * Initializes the worker when it is first created by loading the Zone.js package
159 │  * into the worker instance.
160 │  *
161 │  * @returns A promise resolving to the render function of the worker.
162 │  */
163 │ async function initialize() {
164 ▶   if (zonePackage) {
165 │     // Setup Zone.js
166 ▶     await import(zonePackage);
167 │   }
168 │ 
169 │   // Return the render function for use
170 ▶   return render;
171 │ }
172 │ 
173 │ /**
174 │  * The default export will be the promise returned by the initialize function.
175 │  * This is awaited by piscina prior to using the Worker.
176 │  */
177 ▶ export default initialize();
```

piscina は、ワーカーのファイルの `default` が Promise なら、それが解けるのを待ってから仕事を渡します。177 行目の `initialize()` で、164〜167 行目、`zone.js/node` があれば先に読み込み、170 行目で `render` を返します。

## 5. 描いた後：エラーの数え方と service worker

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/index.ts` L227–245 （▶ の行: 228, 230–231, 233, 235–236, 239, 242）

```ts
227 │         let numErrors = 0;
228 ▶         for (const { errors, warnings } of results) {
229 │           spinner.stop();
230 ▶           errors?.forEach((e) => context.logger.error(e));
231 ▶           warnings?.forEach((e) => context.logger.warn(e));
232 │           spinner.start();
233 ▶           numErrors += errors?.length ?? 0;
234 │         }
235 ▶         if (numErrors > 0) {
236 ▶           throw Error(`Rendering failed with ${numErrors} worker errors.`);
237 │         }
238 │       } catch (error) {
239 ▶         spinner.fail(`Prerendering routes to ${outputPath} failed.`);
240 │         assertIsError(error);
241 │ 
242 ▶         return { success: false, error: error.message };
243 │       }
244 │       spinner.succeed(`Prerendering routes to ${outputPath} complete.`);
245 │ 
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/index.ts` L246–270 （▶ の行: 246, 249–250, 253, 266, 269）

```ts
246 ▶       if (browserOptions.serviceWorker) {
247 │         spinner.start('Generating service worker...');
248 │         try {
249 ▶           await augmentAppWithServiceWorker(
250 ▶             projectRoot,
251 │             context.workspaceRoot,
252 │             outputPath,
253 ▶             browserOptions.baseHref || '/',
254 │             browserOptions.ngswConfigPath,
255 │           );
256 │         } catch (error) {
257 │           spinner.fail('Service worker generation failed.');
258 │           assertIsError(error);
259 │ 
260 │           return { success: false, error: error.message };
261 │         }
262 │         spinner.succeed('Service worker generation complete.');
263 │       }
264 │     }
265 │   } finally {
266 ▶     void worker.destroy();
267 │   }
268 │ 
269 ▶   return browserResult;
270 │ }
```

228〜234 行目、ワーカーが返した `errors`・`warnings`（重要 CSS の処理のもの）を出し、エラーの数を足します。1 つでもあれば 235〜237 行目で例外にし、239〜242 行目で失敗の結果にします。描画そのものの例外（`renderApplication` の reject）は `Promise.all` が reject するので、同じ 238 行目の catch に入ります。246〜263 行目、browser の options に `serviceWorker` があれば、描いた HTML も含めて `ngsw.json` を作ります（2 節で browser のビルドには作らせていない）。266 行目でワーカーを壊し、269 行目で browser の結果をそのまま返します。

> **🧪 DEMO — prerender の 9 通りと app-shell の前後（記録）**
>
> 記録のスクリプト（`rec-prerender.mjs`）が、ルートが `''`・`about`・`items/:id`・`shell`・`old`（`about` への redirect）のアプリを、@angular-devkit/build-angular 22.2.7・@angular/ssr 22.2.7・beasties 0.5.4、Node v24.22.1 で走らせた記録です。angular.json に options だけ違う prerender の target を並べ、1 つ走らせるたびに `dist` を消しました。`routes.txt` は `/items/1` と `/items/2` の 2 行で、最後に改行があります。「ワーカーに渡った route」は `hook.cjs` が piscina の `run` を包んで書いたものです。
>
> `ng run demo:prerender` — 終了コード 0（9905 ms）
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bwp-prerender-appshell)

記録から読めることです。

- **ルートの数**: angular.json の prerender（`routes: ["/about"]`・`routesFile`・`discoverRoutes`）は 5 つ。`/about` は `routes` と取り出しの両方にありますが、`RoutesSet` で 1 つになりました。「Prerendering 5 route(s)」の行は、ora の表示が 1 行ずつ出たものが並んでいます（端末でない出力なので）。
- **index.original.html**: `/` を描いた run にだけでき、重要 CSS の `<style>` は 1 つ（browser のビルドの分）。描いたルートは 2 つ。inlineCritical を切った対照の run は、どちらの段も差し込まず 0 でした。
- **schema**: `routes` も `routesFile` も書かない 2 つの target は、ビルドを始める前に schema の検査で落ちました（300 ms ほど）。

## 6. app-shell：inlineCritical を切ってビルドする

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/app-shell/index.ts` L158–196 （▶ の行: 162, 172, 175–176, 178–181, 184, 193）

```ts
158 │ async function _appShellBuilder(
159 │   options: BuildWebpackAppShellSchema,
160 │   context: BuilderContext,
161 │ ): Promise<BuilderOutput> {
162 ▶   context.logger.warn(
163 │     'The "@angular-devkit/build-angular:app-shell" builder is deprecated as part of Angular\'s Webpack support deprecation. ' +
164 │       'Use "@angular/build:application" instead. For more information, see https://angular.dev/tools/cli/build-system-migration.',
165 │   );
166 │ 
167 │   const browserTarget = targetFromTargetString(options.browserTarget);
168 │   const serverTarget = targetFromTargetString(options.serverTarget);
169 │ 
170 │   // Never run the browser target in watch mode.
171 │   // If service worker is needed, it will be added in _renderUniversal();
172 ▶   const browserOptions = (await context.getTargetOptions(browserTarget)) as JsonObject &
173 │     BrowserBuilderSchema;
174 │ 
175 ▶   const optimization = normalizeOptimization(browserOptions.optimization);
176 ▶   optimization.styles.inlineCritical = false;
177 │ 
178 ▶   const browserTargetRun = await context.scheduleTarget(browserTarget, {
179 ▶     watch: false,
180 ▶     serviceWorker: false,
181 ▶     optimization: optimization as unknown as JsonObject,
182 │   });
183 │ 
184 ▶   if (browserTargetRun.info.builderName === '@angular-devkit/build-angular:application') {
185 │     return {
186 │       success: false,
187 │       error:
188 │         '"@angular-devkit/build-angular:application" has built-in app-shell generation capabilities. ' +
189 │         'The "appShell" option should be used instead.',
190 │     };
191 │   }
192 │ 
193 ▶   const serverTargetRun = await context.scheduleTarget(serverTarget, {
194 │     watch: false,
195 │   });
196 │ 
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/app-shell/index.ts` L197–227 （▶ の行: 200, 205–207, 211, 213–214, 218, 223）

```ts
197 │   let spinner: Spinner | undefined;
198 │ 
199 │   try {
200 ▶     const [browserResult, serverResult] = (await Promise.all([
201 │       browserTargetRun.result,
202 │       serverTargetRun.result,
203 │     ])) as [BrowserBuilderOutput, ServerBuilderOutput];
204 │ 
205 ▶     if (browserResult.success === false || browserResult.baseOutputPath === undefined) {
206 ▶       return browserResult;
207 ▶     } else if (serverResult.success === false) {
208 │       return serverResult;
209 │     }
210 │ 
211 ▶     spinner = new Spinner();
212 │     spinner.start('Generating application shell...');
213 ▶     const result = await _renderUniversal(options, context, browserResult, serverResult, spinner);
214 ▶     spinner.succeed('Application shell generation complete.');
215 │ 
216 │     return result;
217 │   } catch (err) {
218 ▶     spinner?.fail('Application shell generation failed.');
219 │     assertIsError(err);
220 │ 
221 │     return { success: false, error: err.message };
222 │   } finally {
223 ▶     await Promise.all([browserTargetRun.stop(), serverTargetRun.stop()]);
224 │   }
225 │ }
226 │ 
227 │ export default createBuilder(_appShellBuilder);
```

172〜176 行目、browser の options の `optimization` を正規化して、`styles.inlineCritical` だけを `false` にします。178〜182 行目で、それを `watch: false`・`serviceWorker: false` と一緒に上書きで渡します。重要 CSS は 7 節で app-shell が描いた後に 1 回だけ差し込むためです。184〜191 行目の application builder の確かめは prerender と同じ形で、名前は `@angular-devkit/build-angular:application` だけです。

205 行目、browser の結果が失敗か `baseOutputPath` が無ければ、browser の結果を**そのまま**返します。`@angular/build:application` の結果は成功で `baseOutputPath` が無いので、app shell を描かずに成功で終わります。記録の「browserTarget が @angular/build:application」は終了コード 0、render-worker は 1 回も走らず、`index.html` に shell の HTML はありませんでした。prerender（2 節）は同じ条件で終了コード 1 なので、2 つの builder で結果が逆です。211〜214 行目で「Generating application shell...」を出して 7 節に進み、217〜221 行目で例外を失敗の結果にします。

## 7. app-shell：描いて index.html に書く

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/app-shell/index.ts` L36–69 （▶ の行: 38–40, 50, 61, 65）

```ts
36 │   // Get browser target options.
37 │   const browserTarget = targetFromTargetString(options.browserTarget);
38 ▶   const rawBrowserOptions = await context.getTargetOptions(browserTarget);
39 ▶   const browserBuilderName = await context.getBuilderNameForTarget(browserTarget);
40 ▶   const browserOptions = await context.validateOptions<JsonObject & BrowserBuilderSchema>(
41 │     rawBrowserOptions,
42 │     browserBuilderName,
43 │   );
44 │ 
45 │   // Locate zone.js to load in the render worker
46 │   const root = context.workspaceRoot;
47 │   let zonePackage: string | undefined;
48 │ 
49 │   try {
50 ▶     zonePackage = require.resolve('zone.js', { paths: [root] });
51 │   } catch {}
52 │ 
53 │   const projectName = context.target && context.target.project;
54 │   if (!projectName) {
55 │     throw new Error('The builder requires a target.');
56 │   }
57 │ 
58 │   const projectMetadata = await context.getProjectMetadata(projectName);
59 │   const projectRoot = path.join(root, (projectMetadata.root as string | undefined) ?? '');
60 │ 
61 ▶   const { styles } = normalizeOptimization(browserOptions.optimization);
62 │ 
63 │   const renderWorker = new Piscina({
64 │     filename: require.resolve('./render-worker'),
65 ▶     maxThreads: 1,
66 │     workerData: { zonePackage },
67 │     recordTiming: false,
68 │   });
69 │ 
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/app-shell/index.ts` L70–93 （▶ の行: 71–75, 86, 90–92）

```ts
70 │   try {
71 ▶     for (const { path: outputPath, baseHref } of browserResult.outputs) {
72 ▶       const localeDirectory = path.relative(browserResult.baseOutputPath, outputPath);
73 ▶       const browserIndexOutputPath = path.join(outputPath, 'index.html');
74 ▶       const indexHtml = await fs.promises.readFile(browserIndexOutputPath, 'utf8');
75 ▶       const serverBundlePath = await _getServerModuleBundlePath(
76 │         options,
77 │         context,
78 │         serverResult,
79 │         localeDirectory,
80 │       );
81 │ 
82 │       const route = options.route;
83 │       let html: string = await renderWorker.run({
84 │         serverBundlePath,
85 │         document: indexHtml,
86 ▶         url: route?.[0] === '/' ? route : '/' + route,
87 │       });
88 │ 
89 │       // Overwrite the client index file.
90 ▶       const outputIndexPath = options.outputIndexPath
91 ▶         ? path.join(root, options.outputIndexPath)
92 ▶         : browserIndexOutputPath;
93 │ 
```

38〜43 行目、browser の options を schema で検証して既定値を埋めます。50 行目で探すのは `zone.js`（prerender の 62 行目は `zone.js/node`）です。61 行目の `styles` は、6 節で上書きする前の angular.json の値なので、本番なら `inlineCritical: true` です。65 行目、スレッドは 1 本です。

71 行目からロケールごとに、73〜74 行目で browser の出力の `index.html` を読みます。ファイル名は `'index.html'` と書いてあり、prerender の 171 行目のように `index` の option の `output` を見ません。86 行目で route に `/` を付けて描きます（cf5b49ed78、2026-04）。90〜92 行目、`outputIndexPath` があれば workspace の root からのそのパスに、無ければ読んだ `index.html` に上書きします。ロケールが複数でも `outputIndexPath` は 1 つなので、最後のロケールのものが残ります。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/app-shell/schema.json` L17–33 （▶ の行: 19, 26–28, 31–32）

```json
17 │     "appModuleBundle": {
18 │       "type": "string",
19 ▶       "description": "Script that exports the Server AppModule to render. This should be the main JavaScript outputted by the server target. By default we will resolve the outputPath of the serverTarget and find a bundle named 'main' in it (whether or not there's a hash tag)."
20 │     },
21 │     "route": {
22 │       "type": "string",
23 │       "description": "The route to render.",
24 │       "default": "/"
25 │     },
26 ▶     "inputIndexPath": {
27 ▶       "type": "string",
28 ▶       "description": "The input path for the index.html file. By default uses the output index.html of the browser target."
29 │     },
30 │     "outputIndexPath": {
31 ▶       "type": "string",
32 ▶       "description": "The output path of the index.html file. By default will overwrite the input file."
33 │     }
```

schema の 26〜29 行目の `inputIndexPath`（「入力の index.html のパス。既定は browser の target の出力の index.html」）は、44129f66a3 の `packages/` の中で schema.json の 26 行目にしか出てこない名前で、builder は読みません（`grep -rn inputIndexPath packages/`）。記録の「inputIndexPath・outputIndexPath」では、`<title>OtherIndex</title>` の写しを渡しても、`dist/shell-out.html` の title は browser の出力と同じ `BwpDemo` でした。そのとき `dist/browser/index.html` は 6 節で重要 CSS を切ったビルドのままで、`<style>` が 0 でした（app-shell の結果は別のファイルに書いたので）。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/app-shell/index.ts` L94–129 （▶ の行: 94–95, 101, 104, 112, 114, 119, 125）

```ts
 94 ▶       if (styles.inlineCritical) {
 95 ▶         const inlineCriticalCssProcessor = new InlineCriticalCssProcessor({
 96 │           minify: styles.minify,
 97 │           outputPath,
 98 │           deployUrl: browserOptions.deployUrl,
 99 │         });
100 │ 
101 ▶         const { content, warnings, errors } = await inlineCriticalCssProcessor.process(html);
102 │         html = content;
103 │ 
104 ▶         if (warnings.length || errors.length) {
105 │           spinner.stop();
106 │           warnings.forEach((m) => context.logger.warn(m));
107 │           errors.forEach((m) => context.logger.error(m));
108 │           spinner.start();
109 │         }
110 │       }
111 │ 
112 ▶       await fs.promises.writeFile(outputIndexPath, html);
113 │ 
114 ▶       if (browserOptions.serviceWorker) {
115 │         await augmentAppWithServiceWorker(
116 │           projectRoot,
117 │           root,
118 │           outputPath,
119 ▶           baseHref ?? '/',
120 │           browserOptions.ngswConfigPath,
121 │         );
122 │       }
123 │     }
124 │   } finally {
125 ▶     await renderWorker.destroy();
126 │   }
127 │ 
128 │   return browserResult;
129 │ }
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/app-shell/index.ts` L131–156 （▶ の行: 137–138, 142, 144, 148–149, 151）

```ts
131 │ async function _getServerModuleBundlePath(
132 │   options: BuildWebpackAppShellSchema,
133 │   context: BuilderContext,
134 │   serverResult: ServerBuilderOutput,
135 │   browserLocaleDirectory: string,
136 │ ) {
137 ▶   if (options.appModuleBundle) {
138 ▶     return path.join(context.workspaceRoot, options.appModuleBundle);
139 │   }
140 │ 
141 │   const { baseOutputPath = '' } = serverResult;
142 ▶   const outputPath = path.join(baseOutputPath, browserLocaleDirectory);
143 │ 
144 ▶   if (!fs.existsSync(outputPath)) {
145 │     throw new Error(`Could not find server output directory: ${outputPath}.`);
146 │   }
147 │ 
148 ▶   const re = /^main\.(?:[a-zA-Z0-9]{16}\.)?js$/;
149 ▶   const maybeMain = fs.readdirSync(outputPath).find((x) => re.test(x));
150 │ 
151 ▶   if (!maybeMain) {
152 │     throw new Error('Could not find the main bundle.');
153 │   }
154 │ 
155 │   return path.join(outputPath, maybeMain);
156 │ }
```

94〜110 行目、重要 CSS を 1 回だけ差し込み、警告とエラーは進み具合の表示を止めて出します（prerender と違い、エラーがあっても失敗にしない）。112 行目で書き、114〜122 行目、service worker は 119 行目で browser の結果の `baseHref` を使います（prerender は browser の options の `baseHref`）。server の束の場所は、137〜139 行目の `appModuleBundle` があればそれ、無ければ 142 行目のロケールのフォルダで、148 行目の `main.js` か `main.<16 文字>.js` を探します。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/app-shell/render-worker.ts` L65–92 （▶ の行: 72, 74, 79, 85, 88–91）

```ts
65 │ async function render({ serverBundlePath, document, url }: RenderRequest): Promise<string> {
66 │   const {
67 │     ɵSERVER_CONTEXT,
68 │     AppServerModule,
69 │     renderModule,
70 │     renderApplication,
71 │     default: bootstrapAppFn,
72 ▶   } = (await import(serverBundlePath)) as ServerBundleExports;
73 │ 
74 ▶   assert(ɵSERVER_CONTEXT, `ɵSERVER_CONTEXT was not exported from: ${serverBundlePath}.`);
75 │ 
76 │   const platformProviders: StaticProvider[] = [
77 │     {
78 │       provide: ɵSERVER_CONTEXT,
79 ▶       useValue: 'app-shell',
80 │     },
81 │   ];
82 │ 
83 │   let renderAppPromise: Promise<string>;
84 │   // Render platform server module
85 ▶   if (isBootstrapFn(bootstrapAppFn)) {
86 │     assert(renderApplication, `renderApplication was not exported from: ${serverBundlePath}.`);
87 │ 
88 ▶     renderAppPromise = renderApplication(bootstrapAppFn, {
89 ▶       document,
90 ▶       url,
91 ▶       platformProviders,
92 │     });
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/app-shell/render-worker.ts` L93–123 （▶ の行: 108–109, 111, 116, 118, 122）

```ts
 93 │   } else {
 94 │     assert(renderModule, `renderModule was not exported from: ${serverBundlePath}.`);
 95 │     const moduleClass = bootstrapAppFn || AppServerModule;
 96 │     assert(
 97 │       moduleClass,
 98 │       `Neither an AppServerModule nor a bootstrapping function was exported from: ${serverBundlePath}.`,
 99 │     );
100 │ 
101 │     renderAppPromise = renderModule(moduleClass, {
102 │       document,
103 │       url,
104 │       extraProviders: platformProviders,
105 │     });
106 │   }
107 │ 
108 ▶   // The below should really handled by the framework!!!.
109 ▶   // See: https://github.com/angular/angular/issues/51549
110 │   let timer: NodeJS.Timeout;
111 ▶   const renderingTimeout = new Promise<never>(
112 │     (_, reject) =>
113 │       (timer = setTimeout(
114 │         () =>
115 │           reject(
116 ▶             new Error(`Page ${new URL(url, 'resolve://').pathname} did not render in 30 seconds.`),
117 │           ),
118 ▶         30_000,
119 │       )),
120 │   );
121 │ 
122 ▶   return Promise.race([renderAppPromise, renderingTimeout]).finally(() => clearTimeout(timer));
123 │ }
```

app-shell の render-worker は、prerender のものとほぼ同じ手順で、79 行目の `ɵSERVER_CONTEXT` が `'app-shell'` です（記録の後の HTML の `ng-server-context="app-shell"`）。違いは 108〜122 行目で、30 秒で reject する Promise と `Promise.race` にし、描画が終わらないページを「did not render in 30 seconds.」で止めます（a64d8edfd6、2023-10。108〜109 行目のコメントは「本当はフレームワークがすべき」と angular/angular#51549 を挙げる）。prerender の render-worker には、この上限がありません。

### 8. この形を入れたコミットと origin/main

📄 `git show（prerender と app-shell）`

```
$ git show 8f9a0d70cd --stat   # 2023-09-18
feat(@angular-devkit/build-angular): support standalone apps route discovery during prerendering

$ git show 49ed9a26cb -- …/prerender/index.ts   # 2023-12-22
+  if (browserTargetRun.info.builderName === '@angular-devkit/build-angular:application') {
+    return {
+      success: false,
+      error:
+        '"@angular-devkit/build-angular:application" has built-in prerendering capabilities. ' +
+        'The "prerender" option should be used instead.',
+    };
+  }
（app-shell にも同じ形。@angular/build パッケージは 2024-02 の 810d213e18 から）

$ git show e9b057b39d --stat   # 2024-08-14
refactor(@angular/build): remove route extractor and use version from `@angular/ssr`
（routes-extractor-worker が ɵgetRoutesFromAngularRouterConfig を server の束から取るようになった）

$ git show 30d8332edc -- …/prerender/index.ts   # 2026-04-16
-              route,
+              route: route[0] === '/' ? route : '/' + route,

$ git show cf5b49ed78 -- …/app-shell/index.ts   # 2026-04-17
+      const route = options.route;
       let html: string = await renderWorker.run({
         serverBundlePath,
         document: indexHtml,
-        url: options.route,
+        url: route?.[0] === '/' ? route : '/' + route,
```

49ed9a26cb の名前の確かめは `@angular/build` ができる 2 か月前のもので、その後 Karma の builder（[第 10 回](10-bwp-karma.md)の `isEsbuildBased`）は `@angular/build:application` も見るようになりましたが、この 2 つは見ていません。origin/main（2026-11-27）では、`prerender/` と `app-shell/` の実装と schema は 44129f66a3 と同じです（`git diff 44129f66a3 origin/main` で差があるのは `app-shell_spec.ts` の 1 行だけ）。

## テストと直し方

| spec の it（works\_spec.ts / app-shell\_spec.ts の行） | 固めているもの |
| --- | --- |
| `fails with error when no routes are provided`（79） | 3 節の 87〜89 行目（`routes: []` を渡して schema を通している） |
| `should generate output for route when provided`（90） | 4 節の流れ |
| `should generate routes and backup 'index.html' when route is ''`（105） | 4 節の 139〜142 行目 |
| `should generate output for routes when provided with a file`（127） | 3 節の 51〜58 行目（ファイルは `join('\n')` で、最後の改行なし） |
| `should halt execution if a route file is given but does not exist.`（157） | 3 節の 52 行目の `readFile` の失敗 |
| `should guess routes to prerender when discoverRoutes is set to true.`（169） | 3 節の routes-extractor-worker |
| `should generate service-worker`（194）・`should inline critical css for route`（207） | 5 節の 246 行目、4 節の 125 行目 |
| app-shell の `works (basic)`（128）・`works with route`（140）・`critical CSS is inlined`（154）・`applies CSP nonce to critical CSS`（176） | 6〜7 節 |

📄 `走らせたコマンドと結果`

```
cd ~/angular-research/angular-cli   # 44129f66a3
pnpm bazel test //packages/angular_devkit/build_angular:build_angular_prerender_test \
  //packages/angular_devkit/build_angular:build_angular_app-shell_test --nocache_test_results --test_output=all
# prerender: 2 つの shard で 4 + 4 = 8 specs, 0 failures（works_spec.ts の it は 8）
# app-shell: 2 + 2 = 4 specs, 0 failures（app-shell_spec.ts の it は 4）
//packages/angular_devkit/build_angular:build_angular_prerender_test     PASSED in 53.9s
//packages/angular_devkit/build_angular:build_angular_app-shell_test     PASSED in 29.0s
```

直すとしたら、次の場所になります。

📄 `作業木で試した差分（git diff、44129f66a3）`

```
diff --git a/packages/angular_devkit/build_angular/src/builders/prerender/index.ts b/packages/angular_devkit/build_angular/src/builders/prerender/index.ts
index 4d01c5a3cd..b3271c648b 100644
--- a/packages/angular_devkit/build_angular/src/builders/prerender/index.ts
+++ b/packages/angular_devkit/build_angular/src/builders/prerender/index.ts
@@ -13,6 +13,7 @@ import {
   createBuilder,
   targetFromTargetString,
 } from '@angular-devkit/architect';
+import { JsonObject } from '@angular-devkit/core';
 import * as fs from 'node:fs';
 import { readFile } from 'node:fs/promises';
 import * as path from 'node:path';
@@ -106,9 +107,17 @@ async function _scheduleBuilds(
   const browserTarget = targetFromTargetString(options.browserTarget);
   const serverTarget = targetFromTargetString(options.serverTarget);
 
+  // Critical CSS is inlined by the render worker after rendering; disable it in the browser build
+  // so that it is not inlined twice (same approach as the app-shell builder).
+  const rawBrowserOptions = (await context.getTargetOptions(browserTarget)) as JsonObject &
+    BrowserBuilderOptions;
+  const optimization = normalizeOptimization(rawBrowserOptions.optimization);
+  optimization.styles.inlineCritical = false;
+
   const browserTargetRun = await context.scheduleTarget(browserTarget, {
     watch: false,
     serviceWorker: false,
+    optimization: optimization as unknown as JsonObject,
     // todo: handle service worker augmentation
   });
 
diff --git a/packages/angular_devkit/build_angular/src/builders/prerender/works_spec.ts b/packages/angular_devkit/build_angular/src/builders/prerender/works_spec.ts
index f9dc304a5a..078942bcf4 100644
--- a/packages/angular_devkit/build_angular/src/builders/prerender/works_spec.ts
+++ b/packages/angular_devkit/build_angular/src/builders/prerender/works_spec.ts
@@ -226,4 +226,22 @@ describe('Prerender Builder', () => {
     expect(content).not.toContain(`data-beasties-media="print"`);
     expect(content).not.toContain(`media="print"></noscript>`);
   });
+
+  it('should inline critical css only once when index.html already matches it', async () => {
+    await host.write(join(host.root(), 'src/styles.css'), new TextEncoder().encode('body { margin: 0 } p { color: #000 }').buffer).toPromise();
+    const run = await architect.scheduleTarget(
+      { ...target, configuration: 'production' },
+      { routes: ['foo'] },
+    );
+    const output = await run.result;
+    await run.stop();
+
+    expect(output.success).toBe(true);
+
+    const content = new TextDecoder().decode(
+      host.scopedSync().read(normalize('dist/foo/index.html')),
+    );
+
+    expect(content.match(/margin:0/g)?.length).toBe(1);
+  });
 });

# 直す前（spec だけ足す）: Expected 2 to be 1. / 1 spec, 1 failure
# 直した後: build_angular_prerender_test PASSED（4 + 5 = 9 specs, 0 failures）
```

- **重要 CSS の二重**: prerender の `_scheduleBuilds`（2 節の 109〜113 行目）で、app-shell の 175〜181 行目と同じく browser の `inlineCritical` を切って渡す。作業木（44129f66a3）で、`src/styles.css` を `body { margin: 0 } p { color: #000 }` にして `margin:0` が 1 回だけかを見る it を works\_spec.ts に足すと、直す前は「Expected 2 to be 1.」、直した後は 4 + 5 = 9 specs, 0 failures でした（下の差分）。
- **@angular/build:application**: 2 節の 115 行目と 6 節の 184 行目の名前の確かめに `@angular/build:application` を足す（Karma の `isEsbuildBased` と同じ並び）。spec は browserTarget を application builder にした it で、`success: false` と文を期待する形です。
- **routesFile の空の行**: 3 節の 55 行目で `route.trim()` が空なら飛ばす。works\_spec.ts の 127 行目の it のファイルを `'/foo\n'` にした it を足す形です。
- **inputIndexPath**: 7 節の 73〜74 行目で読む。または schema から消す。

## 聞かれそうな質問

**Q. prerender はどのルートを描きますか？**

`routes` と `routesFile` の行と、`discoverRoutes` なら Router の設定から取り出したルートの和です（3 節）。取り出しでは redirect と `:`・`*` を含むルートを除きます（routes-extractor-worker の 62 行目）。`routesFile` の最後の改行は `/` になります。

**Q. `index.original.html` は何ですか？**

`/` を描くと browser の `index.html` を上書きするので、その前に元の HTML を残した名前です（4 節の 139〜142 行目）。ほかのルートのワーカーは、あればこちらを document にします（85〜89 行目）。

**Q. prerender と app-shell の HTML は、ssr-dev-server の HTML とどこで見分けられますか？**

`<app-root>` の `ng-server-context` です。ワーカーが `ɵSERVER_CONTEXT` に入れる値で、prerender は `ssg`（94 行目）、app-shell は `app-shell`（79 行目）、`CommonEngine` は `ssr`（前の回の記録）でした。

**Q. `discoverRoutes: true` だけを書いたら schema の検査で落ちました。なぜですか？**

schema の 37 行目の `anyOf` が `routes` か `routesFile` を求め、`routes` の既定値 `[]` はその検査に効かないからです。`routes: []` を書けば通ります（記録の「routes: \[\] と discoverRoutes」）。

**Q. application builder に移ったのに、古い prerender の target が残っていたらどうなりますか？**

`@angular/build:application` を指すと、prerender は両方のビルドの後に文なしで終了コード 1（2 節の 135 行目）、app-shell は何も描かずに成功します（6 節の 205 行目）。`@angular-devkit/build-angular:application` を指したときだけ、移る先を案内する文が出ます。

## 読み終えて

- prerender と app-shell は、browser と server の target を 1 回ずつビルドし、server の `main.js` をワーカーで `import` して `renderApplication` を呼ぶ。
- prerender のルートは `RoutesSet` に集め、`Promise.all` で全部を一度にワーカーへ投げる。`/` のときは `index.original.html` を残す。
- app-shell は browser の `inlineCritical` を切ってから自分で 1 回差し込む。prerender は切らないので、本番の設定では重要 CSS の `<style>` が 2 つになる。
- application builder の確かめは `@angular-devkit/build-angular:application` の名前だけで、`@angular/build:application` では prerender が文なしで失敗、app-shell が何もせず成功する。`inputIndexPath` は読まれない。

---

← 前: [server builder と ssr-dev-server](07-bwp-server-ssr.md)  
次: [webpack の i18n：抽出と翻訳の差し込み](09-bwp-i18n.md) →
