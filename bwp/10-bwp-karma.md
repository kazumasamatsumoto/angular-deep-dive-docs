[目次](../README.md) › [webpack の builder の内側：@angular-devkit/build-angular と schematics の CLI](README.md) › 第 10 回 / 全 12 回

# karma の builder の webpack の側

> builders/karma/index.ts・browser\_builder.ts・find-tests-plugin.ts・tools/webpack/plugins/karma/karma.ts：builderMode の振り分け、組み込みの Karma の設定、webpack の compiler を Karma の framework に渡してメモリから配る古い形、ビルドの成否の伝え方。

angular/angular-cli · 読了 約 11 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bwp-karma)

---

この章で分かること: `@angular-devkit/build-angular:karma` が `builderMode: "browser"`（既定）のときに通る webpack の道です。Karma の設定の土台を組み、テストの束の webpack の設定を作り、webpack の compiler を Karma の framework の plugin に渡し、その plugin が webpack-dev-middleware でメモリから束を配り、ビルドの成否を Karma の実行に伝えるまでを追います。

読む対象は angular-cli（44129f66a3）の `packages/angular_devkit/build_angular/src/builders/karma/` の `index.ts`・`browser_builder.ts`・`find-tests-plugin.ts`・`schema.json` の残りと、`src/tools/webpack/plugins/karma/karma.ts`・`karma-context.html` です。入口の振り分け（`checkForEsbuild`）、`browser_builder.ts` の entry の足し方と結果の返し方、`FindTestsPlugin` の entry の書き換えは[unit-test の karma runner の章](../kar/04-kar-runner.md)の 6 節が引いています。application builder の側の Karma の builder は[kar-entry](../kar/01-kar-entry.md)〜[kar-serve](../kar/03-kar-serve.md)、テストを探す `findTests` の中身は[kar-entry](../kar/01-kar-entry.md)です。

1. [1. browser builder の流れ](01-bwp-browser.md)
2. [2. webpack の共通の設定](02-bwp-webpack-common.md)
3. [3. スタイルの設定](03-bwp-webpack-styles.md)
4. [4. Angular の webpack プラグイン](04-bwp-webpack-plugins.md)
5. [5. babel の最適化のプラグイン](05-bwp-babel.md)
6. [6. webpack の dev-server](06-bwp-dev-server.md)
7. [7. server builder と ssr-dev-server](07-bwp-server-ssr.md)
8. [8. prerender と app-shell](08-bwp-prerender-appshell.md)
9. [9. webpack の i18n](09-bwp-i18n.md)
10. **10. karma の builder の webpack の側**（この章）
11. [11. schematics の CLI](11-bwp-schematics-cli.md)
12. [12. spec と issue](12-bwp-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> **Karma** はテストのサーバーで、ブラウザを起動して JS を読み込ませ、jasmine の結果を受け取ります。Karma の **framework** は、Karma の起動のときに呼ばれて設定を書き換えられる plugin の 1 つの種類で、webpack の側の Karma の builder はここに自分を差し込みます。**webpack-dev-middleware** は、webpack の出力をディスクに書かずメモリに置き、HTTP の要求に答える middleware です。

### 1. 全体の流れと振り分け

- 👤 `ng test` — 利用者
  - `execute()` — karma/index.ts 33 — *非推奨の警告*
    - `checkForEsbuild()` — index.ts 179 — *application なら @angular/build の Karma の builder へ（kar-runner の 6 節）*
    - `getBaseKarmaOptions()` — index.ts 80 — *browser のとき*
    - `execute(options, context, karmaOptions)` — browser\_builder.ts 26
      - `initializeBrowser()` — browser\_builder.ts 151 — *webpack の設定*
      - `webpack(config)` → `karma.config.parseConfig` → `new karma.Server` — browser\_builder.ts 98〜133
        - `init(config, emitter)` — plugins/karma/karma.ts 23 — *framework。webpack-dev-middleware を立てる*

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/schema.json` L269–285 （▶ の行: 269, 271–273, 279, 282–283）

```json
269 ▶     },
270 │     "builderMode": {
271 ▶       "type": "string",
272 ▶       "description": "Determines how to build the code under test. If set to 'detect', attempts to follow the development builder.",
273 ▶       "enum": ["detect", "browser", "application"],
274 │       "default": "browser"
275 │     },
276 │     "webWorkerTsConfig": {
277 │       "type": "string",
278 │       "description": "TypeScript configuration for Web Worker modules."
279 ▶     },
280 │     "aot": {
281 │       "type": "boolean",
282 ▶       "description": "Run tests using Ahead of Time compilation.",
283 ▶       "default": false
284 │     }
285 │   },
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/index.ts` L211–226 （▶ の行: 218–220, 222）

```ts
211 │ function isEsbuildBased(
212 │   builderName: string,
213 │ ): builderName is
214 │   | '@angular/build:application'
215 │   | '@angular-devkit/build-angular:application'
216 │   | '@angular-devkit/build-angular:browser-esbuild' {
217 │   if (
218 ▶     builderName === '@angular/build:application' ||
219 ▶     builderName === '@angular-devkit/build-angular:application' ||
220 ▶     builderName === '@angular-devkit/build-angular:browser-esbuild'
221 │   ) {
222 ▶     return true;
223 │   }
224 │ 
225 │   return false;
226 │ }
```

`builderMode` の既定は 273 行目の `browser` です（このパッケージの Karma の builder の振り分けの中身は[kar-runner の章](../kar/04-kar-runner.md)の 6 節）。`detect` のときに esbuild と見なす名前は 218〜220 行目の 3 つで、`@angular/build:application` も入っています（prerender・app-shell・extract-i18n の名前の確かめには入っていない。[第 8 回](08-bwp-prerender-appshell.md)・[第 9 回](09-bwp-i18n.md)）。282〜283 行目、`aot` の既定は `false` で、webpack の側のテストは JIT（実行時にテンプレートをコンパイル）です。

| builderMode | build の target の development の builder | 通る道 | 記録 |
| --- | --- | --- | --- |
| `browser`（既定） | 何でも | webpack（この章） | test |
| `application` | 何でも | `@angular/build` の `executeKarmaBuilder` | test-app |
| `detect` | 218〜220 行目の 3 つのどれか | `@angular/build` | — |
| `detect` | それ以外（`…:browser` など） | webpack | test-detect |
| `detect` | build の target が無い | 例外「Please set builderMode explicitly.」 | — |

## 2. execute の入口と Karma の設定の土台

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/index.ts` L25–46 （▶ の行: 25–27, 33, 37–39, 42）

```ts
25 ▶ export type KarmaConfigOptions = ConfigOptions & {
26 ▶   buildWebpack?: unknown;
27 ▶   configFile?: string;
28 │ };
29 │ 
30 │ /**
31 │  * @experimental Direct usage of this function is considered experimental.
32 │  */
33 ▶ export async function* execute(
34 │   options: KarmaBuilderOptions,
35 │   context: BuilderContext,
36 │   transforms: {
37 ▶     webpackConfiguration?: ExecutionTransformer<Configuration>;
38 ▶     // The karma options transform cannot be async without a refactor of the builder implementation
39 ▶     karmaOptions?: (options: KarmaConfigOptions) => KarmaConfigOptions;
40 │   } = {},
41 │ ): AsyncIterable<BuilderOutput> {
42 ▶   context.logger.warn(
43 │     'The "@angular-devkit/build-angular:karma" builder is deprecated as part of Angular\'s Webpack support deprecation. ' +
44 │       'Use "@angular/build:karma" instead. For more information, see https://angular.dev/tools/cli/build-system-migration.',
45 │   );
46 │ 
```

25〜28 行目、Karma の設定の型に、webpack の側が使う `buildWebpack` と `configFile` を足します。37〜39 行目の `transforms` は webpack の設定の差し替えと Karma の options の差し替えで、38 行目のコメントのとおり後者は同期の関数です（application builder の側は非同期でもよい。[kar-runner の章](../kar/04-kar-runner.md)の表）。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/index.ts` L80–126 （▶ の行: 85–86, 95–97, 99, 104–105, 108–111, 116–118）

```ts
 80 │ function getBaseKarmaOptions(
 81 │   options: KarmaBuilderOptions,
 82 │   context: BuilderContext,
 83 │ ): KarmaConfigOptions {
 84 │   let singleRun: boolean | undefined;
 85 ▶   if (options.watch !== undefined) {
 86 ▶     singleRun = !options.watch;
 87 │   }
 88 │ 
 89 │   // Determine project name from builder context target
 90 │   const projectName = context.target?.project;
 91 │   if (!projectName) {
 92 │     throw new Error(`The 'karma' builder requires a target to be specified.`);
 93 │   }
 94 │ 
 95 ▶   const karmaOptions: KarmaConfigOptions = options.karmaConfig
 96 ▶     ? {}
 97 ▶     : getBuiltInKarmaConfig(context.workspaceRoot, projectName);
 98 │ 
 99 ▶   karmaOptions.singleRun = singleRun;
100 │ 
101 │   // Workaround https://github.com/angular/angular-cli/issues/28271, by clearing context by default
102 │   // for single run executions. Not clearing context for multi-run (watched) builds allows the
103 │   // Jasmine Spec Runner to be visible in the browser after test execution.
104 ▶   karmaOptions.client ??= {};
105 ▶   karmaOptions.client.clearContext ??= singleRun ?? false; // `singleRun` defaults to `false` per Karma docs.
106 │ 
107 │   // Convert browsers from a string to an array
108 ▶   if (typeof options.browsers === 'string' && options.browsers) {
109 ▶     karmaOptions.browsers = options.browsers.split(',');
110 ▶   } else if (options.browsers === false) {
111 ▶     karmaOptions.browsers = [];
112 │   }
113 │ 
114 │   if (options.reporters) {
115 │     // Split along commas to make it more natural, and remove empty strings.
116 ▶     const reporters = options.reporters
117 ▶       .reduce<string[]>((acc, curr) => acc.concat(curr.split(',')), [])
118 ▶       .filter((x) => !!x);
119 │ 
120 │     if (reporters.length > 0) {
121 │       karmaOptions.reporters = reporters;
122 │     }
123 │   }
124 │ 
125 │   return karmaOptions;
126 │ }
```

1. **singleRun（84〜87・99 行目）**

   `watch` を書いたときだけ `singleRun = !watch`。書かなければ `undefined` のままで、Karma の既定（`false`）か `karma.conf.js` の値になります。
2. **土台を選ぶ（95〜97 行目）**

   `karmaConfig` があれば空のオブジェクト（中身はそのファイルが決める）、無ければ組み込みの設定（次の引用）。
3. **clearContext（104〜105 行目）**

   1 回だけのときは、テストの後に iframe を空にします（#28271 の回避。101〜103 行目のコメント）。watch ではブラウザに jasmine の結果の画面を残します。
4. **browsers と reporters（108〜123 行目）**

   `browsers` の文字列は `,` で分け、`false` なら空の配列（ブラウザを起動しない）。`reporters` は配列の各要素をさらに `,` で分け、空を除きます。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/index.ts` L128–174 （▶ の行: 132–134, 137, 139, 142–143, 149, 154, 158–159, 167, 169, 172）

```ts
128 │ function getBuiltInKarmaConfig(
129 │   workspaceRoot: string,
130 │   projectName: string,
131 │ ): ConfigOptions & Record<string, unknown> {
132 ▶   let coverageFolderName = projectName.charAt(0) === '@' ? projectName.slice(1) : projectName;
133 ▶   if (/[A-Z]/.test(coverageFolderName)) {
134 ▶     coverageFolderName = strings.dasherize(coverageFolderName);
135 │   }
136 │ 
137 ▶   const workspaceRootRequire = createRequire(workspaceRoot + '/');
138 │ 
139 ▶   // Any changes to the config here need to be synced to: packages/schematics/angular/config/files/karma.conf.js.template
140 │   return {
141 │     basePath: '',
142 ▶     frameworks: ['jasmine', '@angular-devkit/build-angular'],
143 ▶     plugins: [
144 │       'karma-jasmine',
145 │       'karma-chrome-launcher',
146 │       'karma-jasmine-html-reporter',
147 │       'karma-coverage',
148 │       '@angular-devkit/build-angular/plugins/karma',
149 ▶     ].map((p) => workspaceRootRequire(p)),
150 │     jasmineHtmlReporter: {
151 │       suppressAll: true, // removes the duplicated traces
152 │     },
153 │     coverageReporter: {
154 ▶       dir: path.join(workspaceRoot, 'coverage', coverageFolderName),
155 │       subdir: '.',
156 │       reporters: [{ type: 'html' }, { type: 'text-summary' }],
157 │     },
158 ▶     reporters: ['progress', 'kjhtml'],
159 ▶     browsers: ['Chrome'],
160 │     customLaunchers: {
161 │       // Chrome configured to run in a bazel sandbox.
162 │       // Disable the use of the gpu and `/dev/shm` because it causes Chrome to
163 │       // crash on some environments.
164 │       // See:
165 │       //   https://github.com/puppeteer/puppeteer/blob/v1.0.0/docs/troubleshooting.md#tips
166 │       //   https://stackoverflow.com/questions/50642308/webdriverexception-unknown-error-devtoolsactiveport-file-doesnt-exist-while-t
167 ▶       ChromeHeadlessNoSandbox: {
168 │         base: 'ChromeHeadless',
169 ▶         flags: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-dev-shm-usage'],
170 │       },
171 │     },
172 ▶     restartOnFileChange: true,
173 │   };
174 │ }
```

組み込みの設定は、139 行目のコメントのとおり、`ng new` が作る `karma.conf.js` の雛形と同じ中身です。142 行目の framework に `@angular-devkit/build-angular`（4 節の plugin）が入り、143〜149 行目、5 つの plugin を workspace の root から `require` します。1 つでも入っていなければここで例外です。手元で `karma-coverage` だけを外して `ng run demo:test` すると、ビルドの前に「An unhandled exception occurred: Cannot find module 'karma-coverage'」で終わりました（記録の 6 つの run は、5 つを入れてから録った）。132〜135 行目、coverage のフォルダの名前は project の名前から `@` を落とし、大文字があれば dasherize します。167〜170 行目の `ChromeHeadlessNoSandbox` は、bazel の sandbox のような環境で Chrome を起動するための設定です（161〜166 行目のコメント）。

## 3. browser\_builder：webpack の設定と compiler を作る

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/browser_builder.ts` L151–187 （▶ の行: 157, 159, 167–173, 175, 180, 183, 186）

```ts
151 │ async function initializeBrowser(
152 │   options: KarmaBuilderOptions,
153 │   context: BuilderContext,
154 │   webpackConfigurationTransformer?: ExecutionTransformer<Configuration>,
155 │ ): Promise<[typeof import('karma'), Configuration]> {
156 │   // Purge old build disk cache.
157 ▶   await purgeStaleBuildCache(context);
158 │ 
159 ▶   const karma = await import('karma');
160 │ 
161 │   const { config } = await generateBrowserWebpackConfigFromContext(
162 │     // only two properties are missing:
163 │     // * `outputPath` which is fixed for tests
164 │     // * `budgets` which might be incorrect due to extra dev libs
165 │     {
166 │       ...(options as unknown as BrowserBuilderOptions),
167 ▶       outputPath: '',
168 ▶       budgets: undefined,
169 ▶       optimization: false,
170 ▶       buildOptimizer: false,
171 ▶       aot: options.aot,
172 ▶       vendorChunk: true,
173 ▶       namedChunks: true,
174 │       extractLicenses: false,
175 ▶       outputHashing: OutputHashing.None,
176 │       // The webpack tier owns the watch behavior so we want to force it in the config.
177 │       // When not in watch mode, webpack-dev-middleware will call `compiler.watch` anyway.
178 │       // https://github.com/webpack/webpack-dev-middleware/blob/698c9ae5e9bb9a013985add6189ff21c1a1ec185/src/index.js#L65
179 │       // https://github.com/webpack/webpack/blob/cde1b73e12eb8a77eb9ba42e7920c9ec5d29c2c9/lib/Compiler.js#L379-L388
180 ▶       watch: true,
181 │     },
182 │     context,
183 ▶     (wco) => [getCommonConfig(wco), getStylesConfig(wco)],
184 │   );
185 │ 
186 ▶   return [karma, (await webpackConfigurationTransformer?.(config)) ?? config];
187 │ }
```

157 行目で古いキャッシュを消し、159 行目で Karma を読みます。161〜184 行目、browser builder と同じ設定を組む関数（[第 1 回](01-bwp-browser.md)）に、karma の options を browser の options のように渡し、テストに合わせて上書きします。167 行目の `outputPath: ''`（出力は kar-runner の章の 81 行目で `/` にし、メモリに置く）、168 行目の budgets なし、169〜170 行目の最適化なし、171 行目の `aot`（既定 `false`）、172〜173 行目の vendor の束と名前の付いた束、175 行目のハッシュなし、180 行目の `watch: true`（176〜179 行目のコメント：webpack-dev-middleware はどのみち `compiler.watch` を呼ぶ）です。183 行目、設定の部分は共通とスタイルの 2 つだけで、index.html も service worker もありません。186 行目で利用者の webpack の設定の差し替えを通します。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/browser_builder.ts` L189–213 （▶ の行: 192, 197–198, 202, 205–207, 212）

```ts
189 │ function getBuiltInMainFile(): string {
190 │   const content = Buffer.from(
191 │     `
192 ▶   import { provideZoneChangeDetection, ɵcompileNgModuleDefs as compileNgModuleDefs } from '@angular/core';
193 │   import { getTestBed } from '@angular/core/testing';
194 │   import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
195 │ 
196 │   const providers = [];
197 ▶   if (typeof window.Zone !== 'undefined') {
198 ▶     providers.push(provideZoneChangeDetection());
199 │   }
200 │ 
201 │   export class TestModule {}
202 ▶   compileNgModuleDefs(TestModule, {providers});
203 │ 
204 │   // Initialize the Angular testing environment.
205 ▶   getTestBed().initTestEnvironment([BrowserTestingModule, TestModule], platformBrowserTesting(), {
206 ▶     errorOnUnknownElements: true,
207 ▶     errorOnUnknownProperties: true
208 │   });
209 │ `,
210 │   ).toString('base64');
211 │ 
212 ▶   return `ng-virtual-main.js!=!data:text/javascript;base64,${content}`;
213 │ }
```

`main`（`test.ts`）を書かないときに entry に足す組み込みの main です。197〜199 行目、zone.js が読み込まれていれば `provideZoneChangeDetection` を足し、202 行目でその provider を持つ NgModule をその場でコンパイルし、205〜208 行目で TestBed の環境を作ります。`errorOnUnknownElements`・`…Properties` が `true` なので、テンプレートの知らない要素や属性は例外です。212 行目、中身を base64 の `data:` URL にして、`ng-virtual-main.js!=!`（webpack の「この名前のファイルとして扱う」の書き方）を前に付けます。記録の entry の 2 つ目の 969 文字がこれです。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/browser_builder.ts` L26–58 （▶ の行: 39–41, 47, 56–57）

```ts
26 │ export function execute(
27 │   options: KarmaBuilderOptions,
28 │   context: BuilderContext,
29 │   karmaOptions: KarmaConfigOptions,
30 │   transforms: {
31 │     webpackConfiguration?: ExecutionTransformer<Configuration>;
32 │     // The karma options transform cannot be async without a refactor of the builder implementation
33 │     karmaOptions?: (options: KarmaConfigOptions) => KarmaConfigOptions;
34 │   } = {},
35 │ ): AsyncIterable<BuilderOutput> {
36 │   let karmaServer: Server;
37 │   let isCancelled = false;
38 │ 
39 ▶   return new ReadableStream({
40 ▶     async start(controller) {
41 ▶       const [karma, webpackConfig] = await initializeBrowser(
42 │         options,
43 │         context,
44 │         transforms.webpackConfiguration,
45 │       );
46 │ 
47 ▶       if (isCancelled) {
48 │         return;
49 │       }
50 │ 
51 │       const projectName = context.target?.project;
52 │       if (!projectName) {
53 │         throw new Error(`The 'karma' builder requires a target to be specified.`);
54 │       }
55 │ 
56 ▶       const projectMetadata = await context.getProjectMetadata(projectName);
57 ▶       const sourceRoot = (projectMetadata.sourceRoot ?? projectMetadata.root ?? '') as string;
58 │ 
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/browser_builder.ts` L93–115 （▶ の行: 96, 98, 100–103, 106–108, 112）

```ts
 93 │ 
 94 │       // Remove the watch option to avoid the [DEP_WEBPACK_WATCH_WITHOUT_CALLBACK] warning.
 95 │       // The compiler is initialized in watch mode by webpack-dev-middleware.
 96 ▶       delete webpackConfig.watch;
 97 │ 
 98 ▶       const compiler = webpack(webpackConfig);
 99 │ 
100 ▶       karmaOptions.buildWebpack = {
101 ▶         options,
102 ▶         compiler,
103 ▶         logger: context.logger,
104 │       };
105 │ 
106 ▶       const parsedKarmaConfig = await karma.config.parseConfig(
107 ▶         options.karmaConfig && path.resolve(context.workspaceRoot, options.karmaConfig),
108 ▶         transforms.karmaOptions ? transforms.karmaOptions(karmaOptions) : karmaOptions,
109 │         { promiseConfig: true, throwErrors: true },
110 │       );
111 │ 
112 ▶       if (isCancelled) {
113 │         return;
114 │       }
115 │ 
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/browser_builder.ts` L143–150 （▶ の行: 144–146）

```ts
143 │     },
144 ▶     async cancel() {
145 ▶       isCancelled = true;
146 ▶       await karmaServer?.stop();
147 │     },
148 │   });
149 │ }
150 │ 
```

39 行目、結果は `ReadableStream`（Node の Web Streams）で流し、41 行目で設定を作ります。56〜57 行目の `sourceRoot` は `FindTestsPlugin` に渡すためで、その間の entry と output の書き換えは[kar-runner の章](../kar/04-kar-runner.md)が引いている 59〜92 行目です。96 行目で `watch` を消し（webpack の DEP\_WEBPACK\_WATCH\_WITHOUT\_CALLBACK の警告を避ける）、98 行目で compiler を作ります。100〜104 行目、Karma の設定の `buildWebpack` に options・compiler・logger を入れて、4 節の plugin に渡します（2025-12 の 3ffe3ea751 から、compiler は plugin ではなくここで作る）。106〜110 行目、`karmaConfig` があれば workspace の root からのパスで、Karma の `parseConfig` に土台と一緒に渡します。`transforms.karmaOptions` はその直前に 1 回だけ呼びます。144〜147 行目、builder が止められたら Karma のサーバーを止めます。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/find-tests-plugin.ts` L9–43 （▶ の行: 9–10, 17, 33–34, 39–40）

```ts
 9 ▶ import { findTests } from '@angular/build/private';
10 ▶ import { pluginName } from 'mini-css-extract-plugin';
11 │ import assert from 'node:assert';
12 │ import type { Compilation, Compiler } from 'webpack';
13 │ 
14 │ /**
15 │  * The name of the plugin provided to Webpack when tapping Webpack compiler hooks.
16 │  */
17 ▶ const PLUGIN_NAME = 'angular-find-tests-plugin';
18 │ 
19 │ export interface FindTestsPluginOptions {
20 │   include?: string[];
21 │   exclude?: string[];
22 │   workspaceRoot: string;
23 │   projectSourceRoot: string;
24 │ }
25 │ 
26 │ export class FindTestsPlugin {
27 │   private compilation: Compilation | undefined;
28 │ 
29 │   constructor(private options: FindTestsPluginOptions) {}
30 │ 
31 │   apply(compiler: Compiler): void {
32 │     const {
33 ▶       include = ['**/*.spec.ts'],
34 ▶       exclude = [],
35 │       projectSourceRoot,
36 │       workspaceRoot,
37 │     } = this.options;
38 │     const webpackOptions = compiler.options;
39 ▶     const entry =
40 ▶       typeof webpackOptions.entry === 'function' ? webpackOptions.entry() : webpackOptions.entry;
41 │ 
42 │     let originalImport: string[] | undefined;
43 │ 
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/find-tests-plugin.ts` L65–71 （▶ の行: 66–68）

```ts
65 │ 
66 ▶     compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
67 ▶       this.compilation = compilation;
68 ▶       compilation.contextDependencies.add(projectSourceRoot);
69 │     });
70 │   }
71 │ }
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/schema.json` L137–152 （▶ の行: 142–143, 151）

```json
137 │     },
138 │     "include": {
139 │       "type": "array",
140 │       "items": {
141 │         "type": "string"
142 ▶       },
143 ▶       "default": ["**/*.spec.ts"],
144 │       "description": "Globs of files to include, relative to project root. \nThere are 2 special cases:\n - when a path to directory is provided, all spec files ending \".spec.@(ts|tsx)\" will be included\n - when a path to a file is provided, and a matching spec file exists it will be included instead."
145 │     },
146 │     "exclude": {
147 │       "type": "array",
148 │       "items": {
149 │         "type": "string"
150 │       },
151 ▶       "default": [],
152 │       "description": "Globs of files to exclude, relative to the project root."
```

`FindTestsPlugin` は、9 行目の `@angular/build/private` の `findTests` で spec を探し、entry の `main` に足します（[kar-runner の章](../kar/04-kar-runner.md)の 44〜64 行目）。33〜34 行目、`include` の既定は `**/*.spec.ts`、`exclude` は空です。66〜69 行目、compilation を覚え、project の source root をフォルダの依存に足すので、watch のとき新しい spec のファイルができると再ビルドが起きます。schema の 143 行目と 151 行目の説明は「project の root からの相対」ですが、`findTests` は source root からの相対と workspace の root からの相対の両方を受けます（[kar-entry](../kar/01-kar-entry.md)）。記録でも `broken/**` と `src/broken/**` のどちらの `exclude` でも、`src/broken/` の spec は入りませんでした。22.2.7 では説明が「project の source root からの相対」に直っています（6c8dcc4f54）。

> [!WARNING]
> **ハマりどころ**
>
> 10 行目は、`mini-css-extract-plugin` の `pluginName`（文字列の `"mini-css-extract-plugin"`）を読み込んでいます。spec が 1 つも見つからないときの「Specified patterns: … did not match any spec files.」は、この名前の webpack の compilation の logger の `error` で出します（kar-runner の章の 57〜60 行目）。ところが 4 節の 63〜68 行目で webpack-dev-middleware の `stats` を `false` にし、5 節の 88〜99 行目は `stats.hasErrors()` のときに errors だけを出すので、logger の文はどこにも出ません。記録の「include が何にも当たらない」は、その文なしで「Executed 0 of 0」「TOTAL: 0 SUCCESS」と出て終了コード 1 でした。spec の `include_spec.ts` の 18 行目の it は `success` が `false` であることだけを見ています。

## 4. Karma の plugin：init で設定を書き換える

📄 `angular-cli/packages/angular_devkit/build_angular/src/tools/webpack/plugins/karma/karma.ts` L21–52 （▶ の行: 24, 26, 30–31, 34–35, 40–41, 43, 45, 50）

```ts
21 │ let webpackMiddleware: webpackDevMiddleware.API<IncomingMessage, ServerResponse>;
22 │ 
23 │ const init: any = (config: any, emitter: any) => {
24 ▶   if (!config.buildWebpack) {
25 │     throw new Error(
26 ▶       `The '@angular-devkit/build-angular/plugins/karma' karma plugin is meant to` +
27 │         ` be used from within Angular CLI and will not work correctly outside of it.`,
28 │     );
29 │   }
30 ▶   const options = config.buildWebpack.options as BuildOptions;
31 ▶   const logger: logging.Logger = config.buildWebpack.logger;
32 │ 
33 │   // Add a reporter that fixes sourcemap urls.
34 ▶   if (normalizeSourceMaps(options.sourceMap).scripts) {
35 ▶     config.reporters.unshift('@angular-devkit/build-angular--sourcemap-reporter');
36 │ 
37 │     // Code taken from https://github.com/tschaub/karma-source-map-support.
38 │     // We can't use it directly because we need to add it conditionally in this file, and karma
39 │     // frameworks cannot be added dynamically.
40 ▶     const smsPath = path.dirname(require.resolve('source-map-support'));
41 ▶     const ksmsPath = path.dirname(require.resolve('karma-source-map-support'));
42 │ 
43 ▶     config.files.unshift(
44 │       {
45 ▶         pattern: path.join(smsPath, 'browser-source-map-support.js'),
46 │         included: true,
47 │         served: true,
48 │         watched: false,
49 │       },
50 ▶       { pattern: path.join(ksmsPath, 'client.js'), included: true, served: true, watched: false },
51 │     );
52 │   }
```

23 行目の `init` は、Karma が framework の `@angular-devkit/build-angular` を起動するときに、Karma の DI（ファイルの末尾で `init.$inject` に並べた名前）で `config` と `emitter`（Karma のサーバー）を受け取って呼ばれます。24〜29 行目、`buildWebpack` が無い（CLI を通さず `karma start` した）ときは例外です。34 行目、scripts のソースマップが有効なら（karma の builder の既定は `true`）、35 行目で 6 節のソースマップの reporter を先頭に足し、43〜51 行目で `source-map-support` のブラウザ版と `karma-source-map-support` の client を、Karma の `files` の先頭に足します（37〜39 行目：karma-source-map-support を framework として足すと条件で切れないので、中身をここに書いた）。

📄 `angular-cli/packages/angular_devkit/build_angular/src/tools/webpack/plugins/karma/karma.ts` L54–82 （▶ の行: 56–57, 59, 65, 68, 72–73, 77, 79, 81）

```ts
54 │   // When using code-coverage, auto-add karma-coverage.
55 │   if (
56 ▶     options.codeCoverage &&
57 ▶     !config.reporters.some((r: string) => r === 'coverage' || r === 'coverage-istanbul')
58 │   ) {
59 ▶     config.reporters.push('coverage');
60 │   }
61 │ 
62 │   const compiler = config.buildWebpack.compiler as Compiler;
63 │   const webpackMiddlewareConfig = {
64 │     // Hide webpack output because its noisy.
65 ▶     stats: false,
66 │   };
67 │ 
68 ▶   config.webpackMiddleware = { ...webpackMiddlewareConfig, ...config.webpackMiddleware };
69 │ 
70 │   // Our custom context and debug files list the webpack bundles directly instead of using
71 │   // the karma files array.
72 ▶   config.customContextFile = `${__dirname}/karma-context.html`;
73 ▶   config.customDebugFile = `${__dirname}/karma-debug.html`;
74 │ 
75 │   // Add the webpack server fallback.
76 │   config.middleware = config.middleware || [];
77 ▶   config.middleware.push('@angular-devkit/build-angular--fallback');
78 │ 
79 ▶   webpackMiddleware = webpackDevMiddleware(compiler, webpackMiddlewareConfig);
80 │   emitter.on('exit', (done: any) => {
81 ▶     webpackMiddleware.close(() => compiler.close(() => done()));
82 │   });
```

55〜60 行目、`codeCoverage` なら reporter に `coverage` を足します（`coverage-istanbul` などが無ければ）。65 行目で webpack-dev-middleware の stats の出力を止め、68 行目で `karma.conf.js` の `webpackMiddleware` を上に重ねます。72〜73 行目、Karma の iframe の HTML を、Karma の `files` ではなく webpack の束を直に読む 2 つのファイル（次の引用）に替え、77 行目で 6 節の fallback の middleware を足します。79 行目で compiler に webpack-dev-middleware を付けると、webpack の watch が始まります。80〜82 行目、Karma の終わりに middleware と compiler を閉じます。

📄 `angular-cli/packages/angular_devkit/build_angular/src/tools/webpack/plugins/karma/karma-context.html` L19–44 （▶ の行: 24, 33–34, 36–41）

```html
19 │   <body>
20 │     <!-- The scripts need to be in the body DOM element, as some test running frameworks need the body
21 │        to have already been created so they can insert their magic into it. For example, if loaded
22 │        before body, Angular Scenario test framework fails to find the body and crashes and burns in
23 │        an epic manner. -->
24 ▶     <script src="context.js"></script>
25 │     <script type="text/javascript">
26 │       // Configure our Karma and set up bindings
27 │       %CLIENT_CONFIG%
28 │         window.__karma__.setupContext(window);
29 │ 
30 │       // All served files with the latest timestamps
31 │       %MAPPINGS%
32 │     </script>
33 ▶     <script src="runtime.js" crossorigin="anonymous"></script>
34 ▶     <script src="polyfills.js" crossorigin="anonymous"></script>
35 │     <!-- Dynamically replaced with <script> tags -->
36 ▶     %SCRIPTS%
37 ▶     <script src="scripts.js" crossorigin="anonymous" defer></script>
38 ▶     <script src="vendor.js" crossorigin="anonymous" type="module"></script>
39 ▶     <script src="main.js" crossorigin="anonymous" type="module"></script>
40 ▶     <script type="module">
41 ▶       window.__karma__.loaded();
42 │     </script>
43 │   </body>
44 │ </html>
```

iframe の中では、24 行目の Karma の `context.js` のあと、33〜39 行目で `runtime.js`・`polyfills.js`・Karma の `files`（`%SCRIPTS%`）・`scripts.js`・`vendor.js`・`main.js` を読みます。`vendor.js` と `main.js` は `type="module"` で、40〜42 行目の module の script の `__karma__.loaded()` は、module の script が順に実行されるので最後に走ります。

## 5. ビルドの成否を Karma に伝える

📄 `angular-cli/packages/angular_devkit/build_angular/src/tools/webpack/plugins/karma/karma.ts` L84–123 （▶ の行: 86–89, 92, 99, 101, 103, 107–108, 110–111, 118）

```ts
 84 │   let lastCompilationHash: string | undefined;
 85 │ 
 86 ▶   return new Promise<void>((resolve) => {
 87 ▶     compiler.hooks.done.tap('karma', (stats) => {
 88 ▶       if (stats.hasErrors()) {
 89 ▶         lastCompilationHash = undefined;
 90 │ 
 91 │         // Only generate needed JSON stats and when needed.
 92 ▶         const statsJson = stats.toJson({
 93 │           all: false,
 94 │           children: true,
 95 │           errors: true,
 96 │           warnings: true,
 97 │         });
 98 │ 
 99 ▶         logger.error(statsErrorsToString(statsJson, { colors: true }));
100 │ 
101 ▶         if (config.singleRun) {
102 │           // Notify potential listeners of the compile error.
103 ▶           emitter.emit('load_error');
104 │         }
105 │ 
106 │         // Finish Karma run early in case of compilation error.
107 ▶         emitter.emit('run_complete', [], { exitCode: 1 });
108 ▶       } else if (stats.hash != lastCompilationHash) {
109 │         // Refresh karma only when there are no webpack errors, and if the compilation changed.
110 ▶         lastCompilationHash = stats.hash;
111 ▶         emitter.refreshFiles();
112 │       }
113 │ 
114 │       // This is needed to block Karma from launching browsers before Webpack writes the assets in memory.
115 │       // See the below:
116 │       // https://github.com/karma-runner/karma-chrome-launcher/issues/154#issuecomment-986661937
117 │       // https://github.com/angular/angular-cli/issues/22495
118 ▶       resolve();
119 │     });
120 │   });
121 │ };
122 │ 
123 │ init.$inject = ['config', 'emitter'];
```

1. **最初のビルドを待つ（86・118 行目）**

   `init` は Promise を返し、最初の `done` で解きます。Karma は framework の Promise を待つので、webpack がメモリに束を置く前にブラウザを起動しません（114〜117 行目のコメントの issue）。
2. **失敗なら（88〜107 行目）**

   errors と warnings だけの stats の JSON を作り、99 行目で logger に出します。1 回だけなら 103 行目で `load_error` を出し（Karma は読み込みの失敗として終わる）、107 行目で `run_complete` を `exitCode: 1` で出します（browser\_builder の `run_complete` の listener が失敗の結果を流す）。
3. **成功で中身が変わったなら（108〜112 行目）**

   webpack の hash が前と違うときだけ、111 行目の `refreshFiles()` で Karma に読み直させます（watch で次の実行が始まる）。

記録の「include: broken/ だけ」は、tsconfig に入っていない spec を entry に入れたので `@ngtools/webpack` が「is missing from the TypeScript compilation」で失敗し、99 行目の出力、103 行目の `load_error`、107 行目の `run_complete`（`exitCode: 1`）の順で、Karma は「Found 1 load error」で終わりました。

## 6. reporter と fallback の middleware

📄 `angular-cli/packages/angular_devkit/build_angular/src/tools/webpack/plugins/karma/karma.ts` L125–162 （▶ の行: 133–135, 137–138, 147, 151, 156, 159）

```ts
125 │ // Copied from "karma-jasmine-diff-reporter" source code:
126 │ // In case, when multiple reporters are used in conjunction
127 │ // with initSourcemapReporter, they both will show repetitive log
128 │ // messages when displaying everything that supposed to write to terminal.
129 │ // So just suppress any logs from initSourcemapReporter by doing nothing on
130 │ // browser log, because it is an utility reporter,
131 │ // unless it's alone in the "reporters" option and base reporter is used.
132 │ function muteDuplicateReporterLogging(context: any, config: any) {
133 ▶   context.writeCommonMsg = () => {};
134 ▶   const reporterName = '@angular/cli';
135 ▶   const hasTrailingReporters = config.reporters.slice(-1).pop() !== reporterName;
136 │ 
137 ▶   if (hasTrailingReporters) {
138 ▶     context.writeCommonMsg = () => {};
139 │   }
140 │ }
141 │ 
142 │ // Strip the server address and webpack scheme (webpack://) from error log.
143 │ const sourceMapReporter: any = function (this: any, baseReporterDecorator: any, config: any) {
144 │   baseReporterDecorator(this);
145 │   muteDuplicateReporterLogging(this, config);
146 │ 
147 ▶   const urlRegexp = /http:\/\/localhost:\d+\/(webpack:\/)?/gi;
148 │ 
149 │   this.onSpecComplete = function (_browser: any, result: any) {
150 │     if (!result.success) {
151 ▶       result.log = result.log.map((l: string) => l.replace(urlRegexp, ''));
152 │     }
153 │   };
154 │ 
155 │   // avoid duplicate complete message
156 ▶   this.onRunComplete = () => {};
157 │ 
158 │   // avoid duplicate failure message
159 ▶   this.specFailure = () => {};
160 │ };
161 │ 
162 │ sourceMapReporter.$inject = ['baseReporterDecorator', 'config'];
```

ソースマップの reporter は、失敗した spec のログから 147 行目の `http://localhost:<port>/` と `webpack:/` を消し、156・159 行目で自分の完了と失敗の文を出しません（ほかの reporter と重ならないように）。132〜140 行目の `muteDuplicateReporterLogging` は、133 行目で `writeCommonMsg` を無条件に何もしない関数にし、137〜139 行目でもう一度同じことを条件つきでします。コメント（125〜131 行目）の「単独で使われていればログを残す」は、133 行目があるので働きません。

📄 `angular-cli/packages/angular_devkit/build_angular/src/tools/webpack/plugins/karma/karma.ts` L164–202 （▶ の行: 167–168, 171–172, 182, 187–190, 192, 199–201）

```ts
164 │ /**
165 │  * List of files that are always served by the webpack server.
166 │  */
167 ▶ const alwaysServe: ReadonlySet<string> = new Set([
168 ▶   '/runtime.js',
169 │   '/polyfills.js',
170 │   '/scripts.js',
171 ▶   '/styles.css',
172 ▶   '/vendor.js',
173 │ ]);
174 │ 
175 │ // When a request is not found in the karma server, try looking for it from the webpack server root.
176 │ function fallbackMiddleware() {
177 │   return function (
178 │     request: IncomingMessage,
179 │     response: ServerResponse,
180 │     next: (err?: unknown) => void,
181 │   ) {
182 ▶     if (!webpackMiddleware) {
183 │       next();
184 │       return;
185 │     }
186 │ 
187 ▶     webpackMiddleware(request, response, () => {
188 ▶       if (request.url && alwaysServe.has(request.url)) {
189 ▶         response.statusCode = 200;
190 ▶         response.end();
191 │       } else {
192 ▶         next();
193 │       }
194 │     });
195 │   };
196 │ }
197 │ 
198 │ module.exports = {
199 ▶   'framework:@angular-devkit/build-angular': ['factory', init],
200 ▶   'reporter:@angular-devkit/build-angular--sourcemap-reporter': ['type', sourceMapReporter],
201 ▶   'middleware:@angular-devkit/build-angular--fallback': ['factory', fallbackMiddleware],
202 │ };
```

Karma が知らない要求は、187 行目で webpack-dev-middleware に渡し、そこにも無くて 167〜173 行目の 5 つのどれかなら、188〜190 行目で空の 200 を返します。context の HTML（4 節）は `scripts.js`・`styles.css`・`vendor.js` を必ず読むので、その束が無い構成でも 404 にしないためです。199〜201 行目で、framework・reporter・middleware の 3 つを Karma の plugin の名前で出します。

> **🧪 DEMO — ng test の 6 つの target（記録）**
>
> 記録のスクリプト（`rec-karma.mjs`）が、@angular-devkit/build-angular 22.2.7・karma 6.4.4・karma-jasmine 5.1.0・webpack 5.112.0、Node v24.22.1 で、spec が 2 つ（`home.spec.ts` の 2 つの it と、わざと落ちる `about.spec.ts` の 1 つ）のアプリに `ng run` した記録です。どの target も `watch: false`・`browsers: "ChromeHeadlessNoSandbox"` で、ブラウザは `CHROME_BIN` の chrome-headless-shell です。`hook.cjs` が `parseConfig` に渡った options、plugin の `init` の後の config、webpack の compiler の entry（`FindTestsPlugin` を通した後）、Karma の emitter の event を書きました。
>
> `ng run demo:test` — 終了コード 1（4475 ms）
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bwp-karma)

記録から読めることです。

- **browser と detect**: build の target が browser builder なので detect も webpack に入り、どちらも `parseConfig` の frameworks に `@angular-devkit/build-angular`、`buildWebpack` に options・compiler・logger が入りました。Karma の `files` は parse の後に 0 で、plugin の `init` で 5 つ（ソースマップの 2 つと jasmine の 3 つ）になり、reporters の先頭にソースマップの reporter が入りました。
- **webpack の compiler**: `output.path` は `/`、1 回だけなので `watchFileSystem` は何もしない物に替わり、entry の `main` は `@angular/localize/init`・組み込みの main・2 つの spec、`polyfills` は `@angular/compiler`（`aot: false` の JIT のため）でした。
- **application**: `parseConfig` の `basePath` が `dist/test-out/<uuid>`、frameworks は `jasmine` だけで、webpack の compiler も plugin の `init` もありません（[kar-serve](../kar/03-kar-serve.md) の一時のフォルダの道）。
- **実行**: どの道も 3 つのうち 1 つが落ちて終了コード 1、Karma の `run_complete` は `{ success: 2, failed: 1, exitCode: 1 }` でした。

### 7. この形を入れたコミット

📄 `git show / git log（Karma の plugin）`

```
$ git show 3ffe3ea751 --stat   # 2025-12-23
refactor(@angular-devkit/build-angular): move webpack compiler creation to karma builder
（webpack の compiler を Karma の plugin ではなく browser_builder.ts で作り、plugin には compiler を渡す形にした）

$ git log --format='%h %ad %s' --date=short 3ffe3ea751~1..8d99355dbf -- …/plugins/karma/karma.ts
c64527ca38 2025-12-23 refactor(...): remove redundant event reporter from karma plugin
e0a165ac43 2025-12-23 refactor(...): optimize karma plugin hooks
fb8d68985b 2025-12-23 refactor(...): remove redundant request blocker from karma plugin
8d99355dbf 2026-01-06 refactor(...): remove redundant isFirstRun check in Karma plugin
（同じ週にまとめて削った。10 行目の TODO「copied as is from Angular CLI」は残っている）
```

origin/main（2026-11-27）では、`builders/karma/` の実装と `plugins/karma/` は 44129f66a3 と同じで、違うのは `schema.json` の 4 つの説明の言い回し（6c8dcc4f54・fdf8607b4c）だけです。

## テストと直し方

| spec（builders/karma/tests/） | it（行） | 固めているもの |
| --- | --- | --- |
| `options/builder-mode_spec.ts` | `"application" always uses esbuild`（21）・`"browser" always uses webpack`（38）・`"detect" follows …`（53） | 1 節の振り分け |
| `options/include_spec.ts` | `should fail when includes doesn't match any files`（18）ほか | 3 節の FindTestsPlugin（文は見ない） |
| `options/exclude_spec.ts` | 4 つ（29・38・47・57） | 3 節の exclude の 2 つの基準 |
| `options/main_spec.ts`・`options/aot_spec.ts` | `uses custom setup file`（41）・`enables aot`（15）・`is turned off by default`（38） | 3 節の組み込みの main、171 行目 |
| `behavior/errors_spec.ts`・`behavior/rebuilds_spec.ts` | `should fail when there is a TypeScript error`（18）・`recovers from compilation failures in watch mode`（18） | 5 節の 88〜112 行目 |
| `options/code-coverage*_spec.ts`・`behavior/code-coverage_spec.ts` | 7 つ | 4 節の 55〜60 行目 |
| `options/custom-loader_spec.ts` | `applies the webpack configuration transform`（42） | 3 節の 186 行目 |

📄 `走らせたコマンドと結果`

```
cd ~/angular-research/angular-cli   # 44129f66a3
pnpm bazel test //packages/angular_devkit/build_angular:build_angular_karma_test --nocache_test_results --test_output=errors
# 6 つの shard で 14 + 14 + 14 + 14 + 13 + 13 = 82 specs, 0 failures, 1 pending
# （tests/setup.ts の describeKarmaBuilder が、build の target を application builder と browser builder にした 2 回ずつ走らせる。
#   pending は custom-loader_spec.ts の 19 行目「not implemented yet for application builder」）
//packages/angular_devkit/build_angular:build_angular_karma_test         PASSED in 54.3s
```

`tests/setup.ts` の `BASE_OPTIONS` は `builderMode: detect` で、同じファイルの `describeKarmaBuilder` が、build の target を application builder にした回と browser builder にした回の 2 回ずつ走らせます。そのため 1 つの it が esbuild の道と webpack の道の両方を通ります。直すとしたら、次の場所になります。

- **spec が見つからないときの文**: `find-tests-plugin.ts` の 57〜60 行目を、compilation の logger ではなく `compilation.errors` に足す（5 節の 99 行目で出る）か、karma の builder の logger に出す。spec は `include_spec.ts` の 18 行目の it に、logs に「did not match any spec files」があることを足す形です。10 行目の `pluginName` の読み込みも要らなくなります。
- **muteDuplicateReporterLogging**: 133 行目を消す（コメントのとおりに働かせる）か、関数ごと 1 行にする。

## 聞かれそうな質問

**Q. webpack の側の Karma の builder は、テストの束をどこに置きますか？**

ディスクには置きません。`output.path = '/'`（kar-runner の章の 81 行目）の束を、4 節の 79 行目の webpack-dev-middleware がメモリに持ち、6 節の fallback の middleware が Karma の要求に答えます。

**Q. `karma.conf.js` を書かないとき、どの plugin が要りますか？**

2 節の 143〜149 行目の 5 つ（karma-jasmine・karma-chrome-launcher・karma-jasmine-html-reporter・karma-coverage と builder の plugin）です。workspace の root から `require` するので、1 つでも無いと builder がそこで例外になります。

**Q. コンパイルエラーのとき、テストは走りますか？**

走りません。5 節の 88〜107 行目で、1 回だけなら `load_error` と `exitCode: 1` の `run_complete` を出します。watch なら `lastCompilationHash` を消して待ち、直ったビルドで 111 行目の `refreshFiles()` が走ります。

**Q. builderMode を書かないと、どちらの道になりますか？**

schema の既定（273 行目）が `browser` なので、webpack の道です。`ng update` の移行で `@angular/build:karma` に替えるか、`builderMode: application` にすると esbuild の道に移ります。

**Q. spec が 1 つも見つからないと、どう分かりますか？**

webpack の道では文が出ず、「Executed 0 of 0」と終了コード 1 だけです（3 節の注意と記録）。

## 読み終えて

- webpack の側の Karma の builder は、組み込みの Karma の設定に webpack の compiler を `buildWebpack` として入れ、framework の plugin がそれを webpack-dev-middleware で配る。
- テストの束は browser builder の設定を組む関数で、最適化なし・JIT（既定）・`watch: true`・出力はメモリで作り、entry に組み込みの main と spec を足す。
- plugin は最初のビルドまで Karma を待たせ、失敗なら `load_error` と `exitCode: 1` を出し、成功で中身が変わったときだけ読み直させる。
- spec が見つからない文は compilation の logger に出すので、stats を切った webpack-dev-middleware の下では表に出ない。

---

← 前: [webpack の i18n：抽出と翻訳の差し込み](09-bwp-i18n.md)  
次: [schematics の CLI：bin/schematics.ts](11-bwp-schematics-cli.md) →
