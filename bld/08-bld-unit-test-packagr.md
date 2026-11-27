[目次](../README.md) › [@angular/build の読み残し（sass・i18n・dev-server・unit-test）](README.md) › 第 8 回 / 全 9 回

# unit-test と ng-packagr の builder の残り

> builders/unit-test/builder.ts・runners/vitest/executor.ts・plugins.ts・builders/ng-packagr/builder.ts・private.ts：知らない build の target と実行器の失敗、NG\_TEST\_LOG、ng-packagr を呼ぶ builder とその結果の返し方（無いとき・watch のとき）、@angular/build/private が出しているもの。

angular/angular-cli · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bld-unit-test-packagr)

---

この章で分かること：unit-test builder が application でも ng-packagr でもない build の target を受けたときと、実行器（executor）を作るのに失敗したときに何をするか。Vitest の実行器が `NG_TEST_LOG` で何を出すか。ライブラリを作る ng-packagr の builder が ng-packagr を呼ぶまでと、その結果を architect にどう返すか（返さない場合があるか）。そして `@angular/build/private` が何を出しているか。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/src/builders/unit-test/builder.ts`・`runners/vitest/executor.ts`・`runners/vitest/plugins.ts` の残り、`builders/ng-packagr/builder.ts`・`index.ts`、`src/private.ts` です。unit-test builder の流れは [cli-unit-test の章](../cli/12-cli-unit-test.md)、テストのビルドと ng-packagr の options の読み替えは [vit-build の章](../vit/02-vit-build.md)、実行器は [vit-executor の章](../vit/04-vit-executor.md)、plugin は [vit-plugins の章](../vit/03-vit-plugins.md)で読んだので繰り返しません。

1. [1. sass の url を書き換える](01-bld-sass-rebase.md)
2. [2. sass を常駐のコンパイラで動かす](02-bld-sass-service.md)
3. [3. メッセージを取り出す](03-bld-extract-i18n.md)
4. [4. 翻訳を差し込む](04-bld-i18n-inline.md)
5. [5. チャンクを束ね直す](05-bld-chunk-optimizer.md)
6. [6. ng serve の入口の残り](06-bld-dev-server-rest.md)
7. [7. Vite の middleware の残り](07-bld-vite-middlewares.md)
8. **8. unit-test と ng-packagr**（この章）
9. [9. spec と issue](09-bld-tests-issues.md)

## 0. 全体の流れと、版の違い

- `ng test` — unit-test builder — *builder.ts の execute*
  - `getBuilderNameForTarget(buildTarget)` — builder.ts L246 — *application / ng-packagr / それ以外（1 節）*
  - `runner.createExecutor(…)` → `VitestExecutor` — executor.ts L39 — *NG\_TEST\_LOG（2 節）*
- `ng build lib` — ng-packagr builder — *builder.ts の execute（3・4 節）*
  - `ngPackagr().forProject(…).build(…)` — ng-packagr — *ng-packagr の側*
- `require('@angular/build/private')` — private.ts — *@angular-devkit/build-angular などが使う（5 節）*

サイトの @angular/build 22.2.7 は、この章の範囲で 44129f66a3 とほぼ同じです。違うのは、実行器の setup のファイルに `init-compiler.js` が足されたこと（デモの「Prepared setup files」）、Vitest の設定の plugin が `enforce: 'post'` と `configResolved` で `server.watch` を `null` に戻すようになったこと、`private.ts` の import 元が 2 つ移ったことです。新しい本家では ng-packagr の builder が非推奨になり、代わりに `@angular/build:library` ができています（4 節）。

## 1. unit-test builder：知らない build の target と、実行器の失敗

📄 `angular-cli/packages/angular/build/src/builders/unit-test/builder.ts` L9–33 （▶ の行: 17, 19–20, 26–28, 30）

```ts
 9 │ import {
10 │   type BuilderContext,
11 │   type BuilderOutput,
12 │   targetStringFromTarget,
13 │ } from '@angular-devkit/architect';
14 │ import assert from 'node:assert';
15 │ import { readFile, rm } from 'node:fs/promises';
16 │ import path from 'node:path';
17 ▶ import { createVirtualModulePlugin } from '../../tools/esbuild/virtual-module-plugin';
18 │ import { assertIsError } from '../../utils/error';
19 ▶ import { writeTestFiles } from '../../utils/test-files';
20 ▶ import { buildApplicationInternal } from '../application';
21 │ import type {
22 │   ApplicationBuilderExtensions,
23 │   ApplicationBuilderInternalOptions,
24 │ } from '../application/options';
25 │ import { ResultKind } from '../application/results';
26 ▶ import { normalizeOptions } from './options';
27 ▶ import type { TestRunner } from './runners/api';
28 ▶ import { MissingDependenciesError } from './runners/dependency-checker';
29 │ import type { Schema as UnitTestBuilderOptions } from './schema';
30 ▶ import { findTests } from './test-discovery';
31 │ 
32 │ export type { UnitTestBuilderOptions };
33 │ 
```

17 行目の仮想のモジュールの plugin は、テストの入口や TestBed を初期化するファイルをディスクに書かずに esbuild に渡すため（vit-build の章）、19 行目の `writeTestFiles` は、ビルドの出力を一時のフォルダに書く関数で、`dumpVirtualFiles` のときにも使います（デモの「ダンプ」）。27〜28 行目、実行器（runner）は Vitest か Karma で、28 行目の `MissingDependenciesError` は vitest や jsdom が入っていないときのエラーです。

📄 `angular-cli/packages/angular/build/src/builders/unit-test/builder.ts` L263–288 （▶ の行: 263–266, 270–271, 275, 277–278, 284, 286）

```ts
263 ▶     } else {
264 ▶       context.logger.warn(
265 ▶         `The 'buildTarget' is configured to use '${builderName}', which is not supported. ` +
266 ▶           `The 'unit-test' builder is designed to work with '@angular/build:application' or '@angular/build:ng-packagr'. ` +
267 │           'Unexpected behavior or build failures may occur.',
268 │       );
269 │ 
270 ▶       buildTargetOptions = (await context.validateOptions(
271 ▶         await context.getTargetOptions(normalizedOptions.buildTarget),
272 │         builderName,
273 │       )) as unknown as ApplicationBuilderInternalOptions;
274 │     }
275 ▶   } catch (e) {
276 │     assertIsError(e);
277 ▶     context.logger.error(
278 ▶       `Could not load build target options for "${targetStringFromTarget(
279 │         normalizedOptions.buildTarget,
280 │       )}".\n` +
281 │         `Please check your 'angular.json' configuration.\n` +
282 │         `Error: ${e.message}`,
283 │     );
284 ▶     yield { success: false };
285 │ 
286 ▶     return;
287 │   }
288 │ 
```

1. **245〜262 行目（cli-unit-test の章）**

   application ならその options を、ng-packagr なら ng-package.json を読んで application の形に読み替える（353〜391 行目、vit-build の章）。
2. **263〜274 行目：それ以外の builder**

   「サポートしていない」と警告したうえで、その builder の schema で options を検査し、application の options とみなして続ける。
3. **275〜287 行目：読めなかったら**

   angular.json を確かめるよう促すエラーを出し、`{ success: false }` を 1 つ yield して終わる。

📄 `angular-cli/packages/angular/build/src/builders/unit-test/builder.ts` L344–351 （▶ の行: 344–345, 347, 349）

```ts
344 ▶   } catch (e) {
345 ▶     assertIsError(e);
346 │     context.logger.error(
347 ▶       `An exception occurred while creating the test executor:\n${e.stack ?? e.message}`,
348 │     );
349 ▶     yield { success: false };
350 │   }
351 │ }
```

実行器を作るか、ビルドとテストを回すところで投げられたら、スタックを付けて出し、`{ success: false }` を yield します。`await using`（cli-unit-test の章の 310 行目）で作った実行器は、このブロックを抜けるときに必ず `[Symbol.asyncDispose]` で閉じられます。

> [!WARNING]
> **ハマりどころ**
>
> ng-packagr の target からテストを作るとき、vit-build の章の 380〜390 行目は ng-package.json の `lib.styleIncludePaths` を ng-package.json の場所から解決します（382〜384 行目）が、`assets` はそのまま application builder に渡します（388 行目）。application builder は文字列のアセットをワークスペースの場所から解決し、ng-packagr は ng-package.json の場所から解決します。デモの「ng test lib」で、ng-package.json の `"assets": ["./assets"]` は、ng-packagr のビルドでは `dist/lib/assets/readme.txt` になったのに、テストの出力（`--dump-virtual-files`）には入りませんでした。ワークスペースからの `"projects/lib/assets"` に変えると、テストには入り、ng-packagr の出力からは消えました。新しい本家も 388 行目は同じです。

## 2. Vitest の実行器の頭：NG\_TEST\_LOG

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/vitest/executor.ts` L9–33 （▶ の行: 12–13, 16, 18–19, 30–32）

```ts
 9 │ import type { BuilderContext, BuilderOutput } from '@angular-devkit/architect';
10 │ import assert from 'node:assert';
11 │ import path from 'node:path';
12 ▶ import { setTimeout } from 'node:timers/promises';
13 ▶ import type * as Vite from 'vite' with {
14 │   'resolution-mode': 'import',
15 │ };
16 ▶ import type { Vitest } from 'vitest/node';
17 │ import {
18 ▶   DevServerExternalResultMetadata,
19 ▶   updateExternalMetadata,
20 │ } from '../../../../tools/vite/utils';
21 │ import { assertIsError } from '../../../../utils/error';
22 │ import {
23 │   type FullResult,
24 │   type IncrementalResult,
25 │   type ResultFile,
26 │   ResultKind,
27 │ } from '../../../application/results';
28 │ import { NormalizedUnitTestBuilderOptions } from '../../options';
29 │ import type { TestExecutor } from '../api';
30 ▶ import { setupBrowserConfiguration } from './browser-provider';
31 ▶ import { findVitestBaseConfig } from './configuration';
32 ▶ import { createVitestConfigPlugin, createVitestPlugins } from './plugins';
33 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/vitest/executor.ts` L34–53 （▶ の行: 34–36, 40, 45–46, 52）

```ts
34 ▶ enum DebugLogLevel {
35 ▶   Info = 1,
36 ▶   Verbose = 2,
37 │ }
38 │ 
39 │ export class VitestExecutor implements TestExecutor {
40 ▶   private vitest: Vitest | undefined;
41 │   private normalizePath: ((id: string) => string) | undefined;
42 │   private readonly projectName: string;
43 │   private readonly options: NormalizedUnitTestBuilderOptions;
44 │   private readonly logger: BuilderContext['logger'];
45 ▶   private readonly buildResultFiles = new Map<string, ResultFile>();
46 ▶   private readonly externalMetadata: DevServerExternalResultMetadata = {
47 │     implicitBrowser: [],
48 │     implicitServer: [],
49 │     explicitBrowser: [],
50 │     explicitServer: [],
51 │   };
52 ▶   private readonly debugLevel: number;
53 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/vitest/executor.ts` L89–100 （▶ の行: 91, 95, 97–98）

```ts
 89 │ 
 90 │   private debugLog(level: DebugLogLevel, message: string, data?: object) {
 91 ▶     if (this.debugLevel < level) {
 92 │       return;
 93 │     }
 94 │ 
 95 ▶     const formattedMessage = `[VitestExecutor:${DebugLogLevel[level]}] ${message}`;
 96 │     // Custom formatting for data object to ensure it's readable
 97 ▶     const logData = data ? JSON.stringify(data, null, 2) : '';
 98 ▶     this.logger.info(`${formattedMessage}${logData ? `\n${logData}` : ''}`);
 99 │   }
100 │ 
```

13〜16 行目、vite と vitest は型だけを import し、実物は 279 行目で動的に読みます（vit-executor の章）。18〜19 行目の外部の依存の表は、6 回目の dev-server と同じ形（`DevServerExternalResultMetadata`）を使います。34〜37 行目、`NG_TEST_LOG` が 1 なら Info、2 なら Verbose です（読むのは vit-executor の章の 67〜68 行目）。91 行目でそれより細かいログは捨て、97 行目でデータを `JSON.stringify` して builder のログに出します。`JSON.stringify` は関数を落とすので、デモの「Vitest server config」の plugin は名前と `enforce` と `configResolved.order` しか見えません。

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/vitest/executor.ts` L257–276 （▶ の行: 260–262, 265, 267, 271, 273）

```ts
257 │ 
258 │   private async initializeVitest(): Promise<Vitest> {
259 │     this.debugLog(DebugLogLevel.Info, 'Initializing Vitest.');
260 ▶     const {
261 ▶       coverage,
262 ▶       reporters,
263 │       outputFile,
264 │       workspaceRoot,
265 ▶       browsers,
266 │       debug,
267 ▶       watch,
268 │       browserViewport,
269 │       ui,
270 │       projectRoot,
271 ▶       runnerConfig,
272 │       projectSourceRoot,
273 ▶       cacheOptions,
274 │     } = this.options;
275 │     const projectName = this.projectName;
276 │ 
```

Vitest を起動するのに使う options はこの 14 個です。ここから `startVitest` に渡す設定（Vitest config）と Vite のサーバーの設定（Vitest server config）を組み立て、418〜420 行目で Verbose のログに出します（cli-unit-test の章）。デモの `NG_TEST_LOG=2 ng test demo --watch=false` の記録では、前者は `config: false`・`root`・`project`・`watch` の 4 つ、後者は `cacheDir` と plugin 1 つでした。

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/vitest/plugins.ts` L9–27 （▶ の行: 11, 21–23, 26）

```ts
 9 │ import assert from 'node:assert';
10 │ import { readFile } from 'node:fs/promises';
11 ▶ import { platform } from 'node:os';
12 │ import path from 'node:path';
13 │ import type {
14 │   BrowserConfigOptions,
15 │   InlineConfig,
16 │   ResolvedConfig,
17 │   UserWorkspaceConfig,
18 │   Vite,
19 │   VitestPluginContext,
20 │ } from 'vitest/node';
21 ▶ import { createBuildAssetsMiddleware } from '../../../../tools/vite/middlewares/assets-middleware';
22 ▶ import { toPosixPath } from '../../../../utils/path';
23 ▶ import { createProjectResolver } from '../../../../utils/resolve-project';
24 │ import type { ResultFile } from '../../../application/results';
25 │ import type { NormalizedUnitTestBuilderOptions } from '../../options';
26 ▶ import { normalizeBrowserName } from './browser-provider';
27 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/vitest/plugins.ts` L28–57 （▶ の行: 34, 38–39, 44, 46, 50–53, 55）

```ts
28 │ interface ExistingRawSourceMap {
29 │   sources?: string[];
30 │   sourcesContent?: string[];
31 │   mappings?: string;
32 │ }
33 │ 
34 ▶ interface PluginOptions {
35 │   workspaceRoot: string;
36 │   projectSourceRoot: string;
37 │   projectName: string;
38 ▶   buildResultFiles: ReadonlyMap<string, ResultFile>;
39 ▶   testFileToEntryPoint: ReadonlyMap<string, string>;
40 │ }
41 │ 
42 │ type VitestCoverageOption = Exclude<InlineConfig['coverage'], undefined>;
43 │ 
44 ▶ interface VitestConfigPluginOptions {
45 │   browser: BrowserConfigOptions | undefined;
46 ▶   coverage: NormalizedUnitTestBuilderOptions['coverage'];
47 │   projectName: string;
48 │   projectSourceRoot: string;
49 │   reporters?: string[] | [string, object][];
50 ▶   setupFiles: string[];
51 ▶   projectPlugins: Vite.PluginOption[];
52 ▶   include: string[];
53 ▶   optimizeDepsInclude: string[];
54 │   watch: boolean;
55 ▶   isolate: boolean | undefined;
56 │   preserveSymlinks?: boolean;
57 │ }
```

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/vitest/plugins.ts` L147–161 （▶ の行: 149–150, 153–154, 157–158）

```ts
147 │ }
148 │ 
149 ▶ export async function createVitestConfigPlugin(
150 ▶   options: VitestConfigPluginOptions,
151 │ ): Promise<Vite.Plugin> {
152 │   const {
153 ▶     include,
154 ▶     browser,
155 │     projectName,
156 │     reporters,
157 ▶     setupFiles,
158 ▶     projectPlugins,
159 │     projectSourceRoot,
160 │   } = options;
161 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/vitest/plugins.ts` L479–494 （▶ の行: 480, 482, 486–487, 490）

```ts
479 │ 
480 ▶ interface CustomBrowserConfigOptions {
481 │   enabled?: boolean;
482 ▶   instances?: { browser: string }[];
483 │   name?: string;
484 │ }
485 │ 
486 ▶ /**
487 ▶  * Validates that all enabled browsers support V8 coverage when coverage is enabled.
488 │  * Throws an error if an unsupported browser is detected.
489 │  */
490 ▶ function validateBrowserCoverage(
491 │   browser: BrowserConfigOptions | undefined,
492 │   testConfigBrowser: BrowserConfigOptions | undefined,
493 │   provider?: string,
494 │ ): void {
```

21 行目が 7 回目の 4 節の `createBuildAssetsMiddleware` で、ブラウザで走らせるときの Vite に足します。34〜40 行目はメモリの出力を Vitest に読ませる plugin の options（ビルドの出力の表と、テストのファイル → 入口の名前の表）、44〜57 行目は Vitest の設定を書き換える plugin の options です。480〜484 行目の型は、利用者の vitest.config の `browser` を、Vitest の型に頼らず「enabled・instances・name」だけで読むためのもので、486〜494 行目の関数が「V8 のカバレッジは Chromium 系のブラウザでしか取れない」を確かめます（本体は vit-plugins の章）。

## 3. ng-packagr の builder：ng-packagr を読むまで

📄 `angular-cli/packages/angular/build/src/builders/ng-packagr/index.ts` L9–17 （▶ の行: 10, 13, 15）

```ts
 9 │ import { Builder, createBuilder } from '@angular-devkit/architect';
10 ▶ import { execute } from './builder';
11 │ import type { Schema as NgPackagrBuilderOptions } from './schema';
12 │ 
13 ▶ export { type NgPackagrBuilderOptions, execute };
14 │ 
15 ▶ const builder: Builder<NgPackagrBuilderOptions> = createBuilder<NgPackagrBuilderOptions>(execute);
16 │ 
17 │ export default builder;
```

📄 `angular-cli/packages/angular/build/src/builders/ng-packagr/builder.ts` L9–48 （▶ の行: 10, 22, 26, 29, 31, 36, 39–43, 47）

```ts
 9 │ import type { BuilderContext, BuilderOutput } from '@angular-devkit/architect';
10 ▶ import type { NgPackagrOptions } from 'ng-packagr';
11 │ import { join, resolve } from 'node:path';
12 │ import { assertIsError } from '../../utils/error';
13 │ import { normalizeCacheOptions } from '../../utils/normalize-cache';
14 │ import { purgeStaleBuildCache } from '../../utils/purge-cache';
15 │ import type { Schema as NgPackagrBuilderOptions } from './schema';
16 │ 
17 │ /**
18 │  * A Builder that executes the `ng-packagr` tool to build an Angular library.
19 │  *
20 │  * @param options The builder options as defined by the JSON schema.
21 │  * @param context A BuilderContext instance.
22 ▶  * @returns A BuilderOutput object.
23 │  *
24 │  * @experimental Direct usage of this function is considered experimental.
25 │  */
26 ▶ export async function* execute(
27 │   options: NgPackagrBuilderOptions,
28 │   context: BuilderContext,
29 ▶ ): AsyncIterableIterator<BuilderOutput> {
30 │   // Purge old build disk cache.
31 ▶   await purgeStaleBuildCache(context);
32 │ 
33 │   const workspaceRoot = context.workspaceRoot;
34 │   let packager;
35 │   try {
36 ▶     packager = (await import('ng-packagr')).ngPackagr();
37 │   } catch (error) {
38 │     assertIsError(error);
39 ▶     if (error.code === 'MODULE_NOT_FOUND') {
40 ▶       return {
41 ▶         success: false,
42 ▶         error:
43 ▶           'The "ng-packagr" package was not found. To correct this error, ensure this package is installed in the project.',
44 │       };
45 │     }
46 │ 
47 ▶     throw error;
48 │   }
```

10 行目、ng-packagr は型だけを import し、36 行目で実物を読みます。ng-packagr は @angular/build の省略できる peerDependencies で、ライブラリを作らないプロジェクトは入れなくてよいからです。22 行目の約束は「BuilderOutput を返す」で、26 行目は async generator（yield で結果を 1 つずつ返す関数）です。39〜45 行目、ng-packagr が見つからなければ「ng-packagr が見つからない。入れてください」という結果を **return** します。

> [!WARNING]
> **ハマりどころ**
>
> async generator の `return` の値は、`for await` や architect の購読からは見えません（`{ done: true, value }` の value は捨てられる）。デモの「ng-packagr が無い」で、このサイトの node\_modules（ng-packagr が無い）のまま `ng build lib` を走らせると、何も出さずに終了コード 1 で終わりました。`execute` を直接呼ぶと、`next()` の 1 回目が `done: true` と 40〜44 行目の値を返し、`for await` で受けた結果は 0 個でした。新しい本家も 40 行目は `return` です。

## 4. ng-packagr を呼んで、結果を返す

📄 `angular-cli/packages/angular/build/src/builders/ng-packagr/builder.ts` L50–75 （▶ の行: 50, 55–58, 60, 62–63, 66, 71–74）

```ts
50 ▶   const projectName = context.target?.project;
51 │   if (!projectName) {
52 │     throw new Error('The builder requires a target.');
53 │   }
54 │ 
55 ▶   const metadata = await context.getProjectMetadata(projectName);
56 ▶   const ngPackagrConfig = options.project
57 ▶     ? join(workspaceRoot, options.project)
58 ▶     : join(workspaceRoot, (metadata.root as string | undefined) ?? '', 'ng-package.json');
59 │ 
60 ▶   packager.forProject(ngPackagrConfig);
61 │ 
62 ▶   if (options.tsConfig) {
63 ▶     packager.withTsConfig(resolve(workspaceRoot, options.tsConfig));
64 │   }
65 │ 
66 ▶   const { enabled: cacheEnabled, path: cacheDirectory } = normalizeCacheOptions(
67 │     metadata,
68 │     context.workspaceRoot,
69 │   );
70 │ 
71 ▶   const ngPackagrOptions: NgPackagrOptions = {
72 ▶     cacheEnabled,
73 ▶     poll: options.poll,
74 ▶     cacheDirectory: join(cacheDirectory, 'ng-packagr'),
75 │   };
```

56〜58 行目、ng-package.json は `project` があればワークスペースから、無ければプロジェクトの root から探します。63 行目の tsconfig も同じくワークスペースから解決します。66〜75 行目、CLI のキャッシュの設定（`cli.cache`）を ng-packagr のキャッシュに渡し、置き場はキャッシュのフォルダの下の `ng-packagr` です（新しい本家では builder ごとのフォルダに変わった）。

📄 `angular-cli/packages/angular/build/src/builders/ng-packagr/builder.ts` L77–90 （▶ の行: 78–79, 81, 84, 86, 88）

```ts
77 │   try {
78 ▶     if (options.watch) {
79 ▶       await packager.watch(ngPackagrOptions).toPromise();
80 │     } else {
81 ▶       await packager.build(ngPackagrOptions);
82 │     }
83 │ 
84 ▶     yield { success: true };
85 │   } catch (error) {
86 ▶     assertIsError(error);
87 │ 
88 ▶     yield { success: false, error: error.message };
89 │   }
90 │ }
```

1. **81 行目：1 回だけ作る**

   ng-packagr の `build` の promise を待ち、84 行目で `{ success: true }`。
2. **79 行目：watch**

   `watch` は作り直すたびに値を出す Observable で、終わらない。`toPromise()` は終わったときに解ける promise なので、ここで止まり続け、84 行目に来ない。
3. **85〜89 行目：失敗**

   Error の文を `error` に入れて `{ success: false }`。

デモの「watch」は、作業用の場所に入れた ng-packagr 22.2.6 を `NODE_PATH` で見せて、`execute` を `watch: true` で直接呼んだ記録です。「Compilation complete. Watching for file changes...」が出たあと 25 秒待っても、`next()` は 1 度も解けませんでした。webpack の時代の `@angular-devkit/build-angular:ng-packagr` は `switchMap` と `map(() => ({ success: true }))` で作り直しのたびに結果を出しており、移すとき（2c9d7368fc）にこの形が変わりました。CLI の端末では ng-packagr のログが出るので気づきにくく、architect の結果を待つ側（ほかの builder や道具）だけが待ち続けます。

## 5. @angular/build/private

📄 `angular-cli/packages/angular/build/src/private.ts` L9–45 （▶ の行: 11–13, 26, 29, 31, 37, 39, 42, 44）

```ts
 9 │ /**
10 │  * @fileoverview
11 ▶  * Private exports intended only for use with the @angular-devkit/build-angular package.
12 ▶  * All exports are not supported for external use, do not provide SemVer guarantees, and
13 ▶  * their existence may change in any future version.
14 │  */
15 │ 
16 │ import { createAngularCompilation } from './tools/angular/compilation';
17 │ import { SecondaryCompilationContext } from './tools/esbuild/angular/compilation-state';
18 │ import {
19 │   CompilerPluginOptions,
20 │   createCompilerPlugin as internalCreateCompilerPlugin,
21 │ } from './tools/esbuild/angular/compiler-plugin';
22 │ import { ComponentStylesheetBundler } from './tools/esbuild/angular/component-stylesheets';
23 │ import { BundleStylesheetOptions } from './tools/esbuild/stylesheets/bundle-options';
24 │ 
25 │ // Builders
26 ▶ export { buildApplicationInternal } from './builders/application';
27 │ export type { ApplicationBuilderInternalOptions } from './builders/application/options';
28 │ export { type Result, type ResultFile, ResultKind } from './builders/application/results';
29 ▶ export { serveWithVite } from './builders/dev-server/vite';
30 │ export {
31 ▶   normalizeOptions as normalizeDevServerOptions,
32 │   type NormalizedDevServerOptions,
33 │ } from './builders/dev-server/options';
34 │ 
35 │ // Tools
36 │ export type { ExternalResultMetadata } from './tools/esbuild/bundler-execution-result';
37 ▶ export { emitFilesToDisk } from './tools/esbuild/utils';
38 │ export { transformSupportedBrowsersToTargets } from './tools/esbuild/target';
39 ▶ export { SassCompiler } from './tools/sass/sass-service';
40 │ 
41 │ export { SourceFileCache } from './tools/esbuild/angular/source-file-cache';
42 ▶ export { Cache } from './tools/esbuild/cache';
43 │ export { createJitResourceTransformer } from './tools/angular/transformers/jit-resource-transformer';
44 ▶ export { JavaScriptTransformer } from './tools/esbuild/javascript-transformer';
45 │ 
```

📄 `angular-cli/packages/angular/build/src/private.ts` L46–71 （▶ の行: 46, 48–49, 51, 55–58）

```ts
46 ▶ export function createCompilerPlugin(
47 │   pluginOptions: CompilerPluginOptions & {
48 ▶     browserOnlyBuild?: boolean;
49 ▶     noopTypeScriptCompilation?: boolean;
50 │   },
51 ▶   styleOptions: BundleStylesheetOptions & { inlineStyleLanguage: string },
52 │ ): import('esbuild').Plugin {
53 │   return internalCreateCompilerPlugin(
54 │     pluginOptions,
55 ▶     pluginOptions.noopTypeScriptCompilation
56 ▶       ? new SecondaryCompilationContext()
57 ▶       : () => createAngularCompilation(!!pluginOptions.jit, !!pluginOptions.browserOnlyBuild),
58 ▶     new ComponentStylesheetBundler(
59 │       styleOptions,
60 │       styleOptions.inlineStyleLanguage,
61 │       pluginOptions.incremental,
62 │     ),
63 │   );
64 │ }
65 │ 
66 │ export type { CompilerPluginOptions, BundleStylesheetOptions };
67 │ export type { AngularCompilation } from './tools/angular/compilation';
68 │ export { DiagnosticModes } from './tools/angular/compilation';
69 │ export { createAngularCompilation };
70 │ export { ComponentStylesheetBundler } from './tools/esbuild/angular/component-stylesheets';
71 │ 
```

📄 `angular-cli/packages/angular/build/src/private.ts` L72–96 （▶ の行: 73–74, 86, 88, 91, 93）

```ts
72 │ // Utilities
73 ▶ export * from './utils/bundle-calculator';
74 ▶ export { checkPort } from './utils/check-port';
75 │ export { deleteOutputDir } from './utils/delete-output-dir';
76 │ export { type I18nOptions, createI18nOptions, loadTranslations } from './utils/i18n-options';
77 │ export {
78 │   IndexHtmlGenerator,
79 │   type IndexHtmlGeneratorOptions,
80 │   type IndexHtmlGeneratorProcessOptions,
81 │   type IndexHtmlTransform,
82 │ } from './utils/index-file/index-html-generator';
83 │ export type { FileInfo } from './utils/index-file/augment-index-html';
84 │ export { loadProxyConfiguration } from './utils/load-proxy-config';
85 │ export { type TranslationLoader, createTranslationLoader } from './utils/load-translations';
86 ▶ export { purgeStaleBuildCache } from './utils/purge-cache';
87 │ export { augmentAppWithServiceWorker } from './utils/service-worker';
88 ▶ export { type BundleStats, generateBuildStatsTable } from './utils/stats-table';
89 │ export { getSupportedBrowsers } from './utils/supported-browsers';
90 │ export { assertCompatibleAngularVersion } from './utils/version';
91 ▶ export { findTests, getTestEntrypoints } from './builders/karma/find-tests';
92 │ export {
93 ▶   findTailwindConfiguration,
94 │   generateSearchDirectories,
95 │   loadPostcssConfiguration,
96 │ } from './utils/postcss-configuration';
```

11〜13 行目の約束は「@angular-devkit/build-angular のためだけの export で、外での利用は支えず、SemVer の保証も無い」です。package.json の `exports` は `.`・`./private`・`./package.json` の 3 つだけなので、これ以外の深いパス（`@angular/build/src/…`）は `require` できません（デモ）。46〜64 行目の `createCompilerPlugin` は、esbuild の Angular のプラグインを外から作るための薄い包みです。55〜56 行目、`noopTypeScriptCompilation` なら TypeScript をコンパイルせず、ほかのコンパイルの結果を使う `SecondaryCompilationContext` を渡します。73 行目の `export *` は bundle-calculator の全部（`checkBudgets`・`BudgetType`・`BYTES_IN_KILOBYTE` など）を出します。

デモの「private の export」で、22.2.7 が実行時に出している名前は 36 個でした（型だけの export は数えない）。そのうち `createCompilerPlugin`・`JavaScriptTransformer`・`SourceFileCache`・`emitFilesToDisk` など 11 個は、44129f66a3 の `packages/angular_devkit/build_angular/src` の spec でないファイルに名前が出てきません。11〜13 行目の「build-angular のため」とは別の使い手がいる export です。

> **🧪 DEMO — ng test と ng-packagr の builder の記録（@angular/build 22.2.7・vitest 4.1.12・ng-packagr 22.2.6）**
>
> 5 回目の小さなアプリに `src/app/shared.spec.ts` を 1 つ置き、`NG_TEST_LOG=2 ng test demo --watch=false` を走らせた出力です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bld-unit-test-packagr)

どう録ったか：

1. **ライブラリ**

   5 回目のアプリに `projects/lib`（入力 1 つのコンポーネント、`@use 'theme'` のスタイル、assets/readme.txt）を足し、build に `@angular/build:ng-packagr`、test に `@angular/build:unit-test`（`buildTarget: "lib:build"`）を書きました。
2. **ng-packagr**

   サイトの node\_modules には ng-packagr が無いので、作業用の場所に ng-packagr 22.2.6 と同じ版の compiler-cli などを npm install し、`NODE_PATH` で @angular/build から見えるようにしました（サイトのリポジトリには入れていません）。
3. **直接呼ぶ**

   record-pkg.mjs が dist の `execute` を偽の BuilderContext で呼び、record-private.mjs が `@angular/build/private` を読みました。

📄 `record-pkg.mjs`

```js
// @angular/build 22.2.7 の ng-packagr builder の execute を、偽の BuilderContext で直接呼んだ記録
// 使い方: node record-pkg.mjs <app> missing|once|watch   （ng-packagr は NODE_PATH で見せる）
import { createRequire } from 'node:module';
import { join } from 'node:path';
const [app, mode] = process.argv.slice(2);
const require = createRequire(join(app, 'package.json'));
const { execute } = require(join(app, 'node_modules/@angular/build/src/builders/ng-packagr/builder.js'));
const logs = [];
const ctx = {
  workspaceRoot: app,
  target: { project: 'lib', target: 'build' },
  logger: { info: (m) => logs.push('info: ' + m), warn: (m) => logs.push('warn: ' + m), error: (m) => logs.push('error: ' + m), debug() {} },
  getProjectMetadata: async () => ({ root: 'projects/lib', cli: { cache: { enabled: false } } }),
};
const options = { project: 'projects/lib/ng-package.json', tsConfig: 'projects/lib/tsconfig.lib.json', watch: mode === 'watch', poll: undefined };
const t0 = Date.now();
const it = execute(options, ctx);
const steps = [];
if (mode === 'missing') {
  // for await は done: true の value を捨てる。next() を直接呼んで中身を見る
  const r = await it.next();
  steps.push({ ms: Date.now() - t0, done: r.done, value: r.value ?? null });
  const forAwait = [];
  for await (const out of execute(options, ctx)) forAwait.push(out);
  console.log(JSON.stringify({ mode, steps, forAwaitYields: forAwait, logs }, null, 1));
  process.exit(0);
}
const timeout = new Promise((r) => setTimeout(() => r('timeout'), mode === 'watch' ? 25000 : 120000));
while (true) {
  const r = await Promise.race([it.next(), timeout]);
  if (r === 'timeout') { steps.push({ ms: Date.now() - t0, timeout: true }); break; }
  steps.push({ ms: Date.now() - t0, done: r.done, value: r.value ?? null });
  if (r.done) break;
}
console.log('@@RESULT@@' + JSON.stringify({ mode, steps, logs }));
process.exit(0);

```

📄 `record-private.mjs`

```js
// @angular/build/private（22.2.7）が実行時に出している名前と種類。型だけの export はここに出ない。
import { createRequire } from 'node:module';
import { join } from 'node:path';
const [app] = process.argv.slice(2);
const require = createRequire(join(app, 'package.json'));
const t0 = performance.now();
const priv = require('@angular/build/private');
const ms = Math.round(performance.now() - t0);
const rows = Object.keys(priv).sort().map((k) => {
  const v = priv[k];
  const kind = typeof v === 'function' ? (/^class\b/.test(Function.prototype.toString.call(v)) ? 'class' : 'function') : typeof v === 'object' && v !== null ? 'object（enum など）' : typeof v;
  return { name: k, kind };
});
let deepImport;
try { require('@angular/build/src/tools/esbuild/utils.js'); deepImport = 'ok'; } catch (e) { deepImport = e.code + ': ' + e.message.split('\n')[0]; }
console.log(JSON.stringify({ requireMs: ms, count: rows.length, rows, deepImport, exportsField: require('@angular/build/package.json').exports }, null, 1));

```

## テストと直し方

ng-packagr の builder（`builders/ng-packagr/`）には spec が 1 つもありません（webpack の側の `@angular-devkit/build-angular` には works\_spec.ts があり、86 行目で watch を試しています）。unit-test builder の spec は `builders/unit-test/tests/` の 30 ファイルで、ng-packagr の target を通るのは 2 件で、`tests/behavior/vitest-barrel-side-effects_spec.ts` の describe「Behavior: "Vitest barrel sideEffects"」（13 行目）の it（15 行目、#33910 の回帰）と、`vitest-zone-init_spec.ts` の「ライブラリのテストで zone.js を読む」it（71 行目）です。どちらも build の target を `@angular/build:ng-packagr` の偽物（barrel の 18〜25 行目、zone-init の 79 行目）にし、ng-package.json に `assets` は書いていません。

| 走らせたもの | 結果 |
| --- | --- |
| `pnpm bazel test //packages/angular/build:unit-test_integration_tests --nocache_test_results --test_output=errors '--test_arg=--filter=Behavior: "Vitest barrel sideEffects"\|Option: "buildTarget"\|when testing a library'` | PASSED。5 つの shard の「Ran N」の和が 6。ng-packagr の target の 2 件が通り、buildTarget の 4 件は pending |

buildTarget の 4 件が pending なのは、`tests/options/build-target_spec.ts` の 18 行目が `xdescribe` だからです。1 節の 263〜287 行目（知らない builder と、読めないとき）を通る it はありません。`xdescribe` はこのほか `debug_spec.ts`（20 行目）と `runner_spec.ts` にあります。

直すなら、3 節は ng-packagr/builder.ts の 40 行目の `return` を `yield` にし、そのあとで `return` します。4 節は 79 行目を、`watch` の Observable の値ごとに `{ success: true }` を yield する形にします（RxJS の `eachValueFrom` か、`for await` で受けられる形に直す）。1 節のアセットは unit-test/builder.ts の 388 行目で、文字列のアセットを ng-package.json の場所から解決してから渡します（382〜384 行目のスタイルと同じ扱い）。spec は、ng-packagr の builder には `builders/ng-packagr/tests/` を作り、application builder と同じ harness で「ng-packagr が無いと error の文が出る」「watch で 1 回目の結果が来る」を見るのが近道です。アセットは vitest-barrel-side-effects\_spec.ts と同じ偽の ng-packagr の target に `assets` を書き、`dumpVirtualFiles` の出力を見ます。

## 聞かれそうな質問

**Q. ng build でライブラリを作ろうとしたら、何も出さずに失敗しました。**

ng-packagr が入っていないと、ng-packagr の builder の 39〜45 行目が案内の文を `return` し、それが architect に届かないからです。`npm install -D ng-packagr` で直ります。新しい本家なら、非推奨になった ng-packagr の builder の代わりに `@angular/build:library` を使う道もあります。

**Q. unit-test builder の build の target に、自分の builder を書けますか？**

書けますが、263〜274 行目で「サポートしていない」と警告され、その options を application の options として使います。application の options と形が違えば、ビルドで失敗します。

**Q. `NG_TEST_LOG` は何を出しますか？**

1 で実行器の段取り（起動・結果を受けた・Vitest を呼ぶ・閉じる）、2 でそれに加えて正規化した options・テストの入口の表・Vitest に渡した設定です。91 行目で段を比べ、97 行目でデータを JSON にして出します。関数は JSON に入らないので、plugin の中身は見えません。

**Q. `@angular/build/private` を自分の道具から使ってもいいですか？**

動きはしますが、11〜13 行目のとおり外での利用は支えず SemVer の保証もありません。実際に 22.2.x から新しい本家の間で、`emitFilesToDisk` や `Cache` の import 元が移り、ng-packagr の builder は非推奨になっています。

## 読み終えて

- unit-test builder は、application でも ng-packagr でもない build の target を警告つきで受け、読めなければ `{ success: false }` を 1 つ出して終わる。
- ng-packagr の target のテストでは、スタイルのパスは ng-package.json から、アセットはワークスペースから解決され、ng-packagr のビルドと食い違う。
- Vitest の実行器は `NG_TEST_LOG=1/2` で段取りと設定を JSON で出す。
- ng-packagr の builder は、ng-packagr が無いときの案内を `return` して失い、watch では結果を 1 度も yield しない。spec が 1 つも無い。
- `@angular/build/private` は実行時に 36 個の名前を出し、保証の無い入口として build-angular などが使う。

---

← 前: [Vite の middleware の残り：コンポーネントのスタイルとメモリ上のファイル](07-bld-vite-middlewares.md)  
次: [spec と issue を読む：@angular/build の読み残しを固めているもの](09-bld-tests-issues.md) →
