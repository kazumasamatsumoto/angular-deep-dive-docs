[目次](../README.md) › [Karma の builder の内側：esbuild で束ねたテストを Karma に配るまで](README.md) › 第 4 回 / 全 5 回

# unit-test の karma runner：ng test から Karma の builder を呼ぶ

> builders/unit-test/runners/karma の executor.ts が、unit-test builder の options と build の target の options を Karma の builder の options に写し、filter と coverage の threshold を transforms.karmaOptions で Karma の設定に書き、zone.js のときテスト用の polyfills を足して（385165cbc6）起動する行。webpack を使う @angular-devkit/build-angular:karma（browser\_builder.ts）との違いと、2026-10〜11 の修正（launcher と karma-coverage の要求の絞り込み、使えない options の警告、poll と progress）。

angular/angular-cli · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/kar-runner)

---

この章で分かること: `@angular/build:unit-test` の `runner: "karma"` が、unit-test の options と build の target の options から `@angular/build:karma` の options をどう作り、`transforms.karmaOptions` で何を書き足し、どこでこれまでの章の `execute` に入るかです。同じアプリで 2 つの builder を走らせた記録で、Karma の builder に渡った options の差と、出た警告を並べます。webpack を使う `@angular-devkit/build-angular:karma` との違いと、2025-12〜2026-11 の修正（385165cbc6 と origin/main の 4 つ）も読みます。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/src/builders/unit-test/runners/karma/executor.ts` と `unit-test/options.ts` の末尾、`packages/angular_devkit/build_angular/src/builders/karma/` の `index.ts`・`browser_builder.ts`・`find-tests-plugin.ts` です。unit-test builder がどう runner を選び、executor を作って `execute` を回すかは[unit-test と Vitest の章](../cli/12-cli-unit-test.md)（Karma の runner の `index.ts` と `executor.ts` の options の前半はそこに引用があります）、Karma の executor が最初に出す 5 つの警告は[executor とブラウザの章](../vit/04-vit-executor.md)の 9 節にあるので、ここでは繰り返しません。

1. [1. 入口と Karma の設定](01-kar-entry.md)
2. [2. テストを束ねる](02-kar-build.md)
3. [3. Karma に配る](03-kar-serve.md)
4. **4. unit-test の karma runner**（この章）
5. [5. spec と issue](05-kar-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> **runner** は、unit-test builder がテストを走らせる道具の差し替え口で、`vitest` と `karma` があります。Karma の runner は自分では何も組み立てず、unit-test の options を `@angular/build:karma` の options に**写して**、その builder の `execute` を呼びます。**build の target** は、unit-test の `buildTarget`（既定は `<project>:build`）が指す angular.json の target で、Karma の runner は assets や styles などをそこから読みます。

## 1. 全体の流れ

- 👤 `ng test`（`runner: "karma"`） — 利用者
  - `KarmaTestRunner.validateDependencies()` — runners/karma/index.ts — *karma・karma-jasmine・launcher・karma-coverage*
  - `KarmaTestRunner.createExecutor()` — runners/karma/index.ts — *new KarmaExecutor*
  - `KarmaExecutor.execute()` — executor.ts 23 — *警告 → build の target を読む → options を写す*
    - `execute(karmaOptions, context, transformOptions)` — builders/karma/index.ts — *第 1〜3 回の builder そのもの*
      - `transforms.karmaOptions(options)` — executor.ts 114 — *parseConfig の直前（第 3 回の 349 行目）*

`isStandalone: true`（[unit-test の章](../cli/12-cli-unit-test.md)）なので、unit-test builder は自分ではビルドせず、Karma の builder の中の application builder がビルドします。ビルドの options も、Karma の builder の `setupBuildOptions`（[第 2 回](02-kar-build.md)）が作ります。

## 2. build の target と karma.conf.js を探す

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/karma/executor.ts` L56–75 （▶ の行: 56–58, 62–63, 65–66, 68–69, 72）

```ts
56 ▶     const buildTargetOptions = (await context.validateOptions(
57 ▶       await context.getTargetOptions(unitTestOptions.buildTarget),
58 ▶       await context.getBuilderNameForTarget(unitTestOptions.buildTarget),
59 │     )) as unknown as ApplicationBuilderInternalOptions;
60 │ 
61 │     let karmaConfig: string | undefined;
62 ▶     if (typeof unitTestOptions.runnerConfig === 'string') {
63 ▶       karmaConfig = unitTestOptions.runnerConfig;
64 │       context.logger.info(`Using Karma configuration file: ${karmaConfig}`);
65 ▶     } else if (unitTestOptions.runnerConfig) {
66 ▶       const potentialPath = path.join(unitTestOptions.projectRoot, 'karma.conf.js');
67 │       try {
68 ▶         await fs.access(potentialPath);
69 ▶         karmaConfig = potentialPath;
70 │         context.logger.info(`Using Karma configuration file: ${karmaConfig}`);
71 │       } catch {
72 ▶         context.logger.info('No Karma configuration file found. Using default configuration.');
73 │       }
74 │     }
75 │ 
```

56〜59 行目で、`buildTarget` の options（angular.json の値に configuration を重ねたもの）を、その target の builder（ふつうは `@angular/build:application`）の schema で検証し、既定値を埋めて受け取ります。そのため、build の target に書いていない `aot` も、application builder の schema の既定（`true`）で入ってきます（記録の 7 節）。62〜63 行目、`runnerConfig` が文字列なら、それを `karmaConfig` にします。65〜72 行目、`true` なら project の root の `karma.conf.js` を探し、あれば使い、無ければ既定の設定（[第 1 回](01-kar-entry.md)）にします。

📄 `angular-cli/packages/angular/build/src/builders/unit-test/options.ts` L161–172 （▶ の行: 161–165, 170–171）

```ts
161 ▶     runnerConfig:
162 ▶       typeof runnerConfig === 'string'
163 ▶         ? runnerConfig.length === 0
164 ▶           ? true
165 ▶           : path.resolve(workspaceRoot, runnerConfig)
166 │         : runnerConfig,
167 │   };
168 │ }
169 │ 
170 ▶ export function injectTestingPolyfills(polyfills: string[] = []): string[] {
171 ▶   return polyfills.includes('zone.js') ? [...polyfills, 'zone.js/testing'] : polyfills;
172 │ }
```

`runnerConfig` は正規化（`normalizeOptions`）の最後で、161〜166 行目のように、空の文字列なら `true`、ほかの文字列なら workspace の root からの絶対パスになります。170〜172 行目の `injectTestingPolyfills` は、polyfills に `zone.js` があるときだけ `zone.js/testing` を足します。Karma の executor は、build の target の polyfills をこの関数に通してから Karma の builder に渡します（その行の引用は[unit-test の章](../cli/12-cli-unit-test.md)）。

📄 `git show 385165cbc6（抜粋）`

```
$ git show 385165cbc6 -- …/runners/karma/executor.ts   # 2025-12-05（PR #32046、#32032）
-import { NormalizedUnitTestBuilderOptions } from '../../options';
+import { type NormalizedUnitTestBuilderOptions, injectTestingPolyfills } from '../../options';
 ...
     const karmaOptions: KarmaBuilderOptions = {
       karmaConfig,
       tsConfig: unitTestOptions.tsConfig ?? buildTargetOptions.tsConfig,
-      polyfills: buildTargetOptions.polyfills,
+      polyfills: injectTestingPolyfills(buildTargetOptions.polyfills),
```

#32032 によれば、`zone.js/testing` を自動で足す仕組みは一度入ったあと、2025 年 8 月の runner の作り直しで消えていて、zone.js のアプリは unit-test の Karma の runner で `fakeAsync` が使えませんでした。385165cbc6 が戻しました。`@angular/build:karma` を直に使うときは、今も利用者が polyfills に `zone.js/testing` を書く必要があります（Karma の builder の `normalizePolyfills` は、書かれた `zone.js/testing` を後ろに移すだけで足さない。[第 2 回](02-kar-build.md)）。記録の 7 節の「karma + zone.js」と「unit-test + zone.js」がこの差です。

## 3. options を写す

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/karma/executor.ts` L86–111 （▶ の行: 88–89, 91, 93–97, 99, 101–102, 107, 110）

```ts
 86 │       loader: buildTargetOptions.loader,
 87 │       define: buildTargetOptions.define,
 88 ▶       include: unitTestOptions.include,
 89 ▶       exclude: unitTestOptions.exclude,
 90 │       sourceMap: buildTargetOptions.sourceMap,
 91 ▶       progress: unitTestOptions.buildProgress ?? buildTargetOptions.progress,
 92 │       watch: unitTestOptions.watch,
 93 ▶       poll: buildTargetOptions.poll,
 94 ▶       preserveSymlinks: unitTestOptions.preserveSymlinks ?? buildTargetOptions.preserveSymlinks,
 95 ▶       browsers: unitTestOptions.browsers?.join(','),
 96 ▶       codeCoverage: unitTestOptions.coverage.enabled,
 97 ▶       codeCoverageExclude: unitTestOptions.coverage.exclude,
 98 │       fileReplacements: buildTargetOptions.fileReplacements,
 99 ▶       reporters: unitTestOptions.reporters?.map((reporter) => {
100 │         // Karma only supports string reporters.
101 ▶         if (Object.keys(reporter[1]).length > 0) {
102 ▶           context.logger.warn(
103 │             `The "karma" test runner does not support options for the "${reporter[0]}" reporter. The options will be ignored.`,
104 │           );
105 │         }
106 │ 
107 ▶         return reporter[0];
108 │       }),
109 │       webWorkerTsConfig: buildTargetOptions.webWorkerTsConfig,
110 ▶       aot: buildTargetOptions.aot,
111 │     };
```

前半（`karmaConfig`・`tsConfig`・`polyfills`・`assets`・`scripts`・`styles` など）は build の target から取ります。86 行目から後ろの写し方は 3 通りです。

| どこから | 行 | option |
| --- | --- | --- |
| unit-test の options | 88・89・92・95〜97・99 | `include`・`exclude`・`watch`・`browsers`（配列を `','` で 1 つの文字列に）・`codeCoverage`（`coverage.enabled`）・`codeCoverageExclude`・`reporters` |
| unit-test を先に、無ければ build の target | 91・94 | `progress`（`buildProgress`）・`preserveSymlinks` |
| build の target | 86・87・90・93・98・109・110 | `loader`・`define`・`sourceMap`・`poll`・`fileReplacements`・`webWorkerTsConfig`・`aot` |

99〜108 行目、unit-test の `reporters` は `[名前, options]` の組に正規化されているので（[テストを探す章](../vit/01-vit-discovery.md)）、101 行目で options が空でなければ警告し、107 行目で名前だけにします。Karma の reporter には options を渡す口が無いからです。unit-test の options のうち、`filter`・`coverage.thresholds`・`coverage.watermarks` は Karma の builder の options に無いので、次の `transforms` で Karma の設定に直に書きます。

## 4. transforms.karmaOptions：Karma の設定に直に書く

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/karma/executor.ts` L113–130 （▶ の行: 114–115, 117–118, 123, 126–128）

```ts
113 │     const transformOptions = {
114 ▶       karmaOptions: (options) => {
115 ▶         if (unitTestOptions.filter) {
116 │           let filter = unitTestOptions.filter;
117 ▶           if (filter[0] === '/' && filter.at(-1) === '/') {
118 ▶             this.context.logger.warn(
119 │               'The `--filter` option is always a regular expression.' +
120 │                 'Leading and trailing `/` are not required and will be ignored.',
121 │             );
122 │           } else {
123 ▶             filter = `/${filter}/`;
124 │           }
125 │ 
126 ▶           options.client ??= {};
127 ▶           options.client.args ??= [];
128 ▶           options.client.args.push('--grep', filter);
129 │         }
130 │ 
```

114 行目の関数は、Karma の builder の `configureKarma` が `parseConfig` に渡す直前に呼びます（[第 3 回](03-kar-serve.md)の 349 行目）。115〜128 行目、`--filter` を karma-jasmine の `--grep` にして `client.args` に足します。karma-jasmine は `client.args` の `--grep` を受け、名前が合わない spec を skip します。123 行目で前後に `/` を付けて正規表現の形にし、117〜121 行目、最初から `/…/` なら警告します（文言の空白の抜けは origin/main の 13a7346493 で直った）。

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/karma/executor.ts` L131–155 （▶ の行: 132–133, 135, 137–140, 143–144, 152, 154）

```ts
131 │         // Add coverage options
132 ▶         if (unitTestOptions.coverage.enabled) {
133 ▶           const { thresholds, watermarks } = unitTestOptions.coverage;
134 │           // eslint-disable-next-line @typescript-eslint/no-explicit-any
135 ▶           const coverageReporter = ((options as any).coverageReporter ??= {});
136 │ 
137 ▶           if (thresholds) {
138 ▶             coverageReporter.check = thresholds.perFile
139 ▶               ? { each: thresholds }
140 ▶               : { global: thresholds };
141 │           }
142 │ 
143 ▶           if (watermarks) {
144 ▶             coverageReporter.watermarks = watermarks;
145 │           }
146 │         }
147 │ 
148 │         return options;
149 │       },
150 │     } satisfies KarmaBuilderTransformsOptions;
151 │ 
152 ▶     const { execute } = await import('../../../karma');
153 │ 
154 ▶     yield* execute(karmaOptions, context, transformOptions);
155 │   }
```

coverage が有効なら、135 行目で karma-coverage の `coverageReporter` を取り出し（無ければ作り）、137〜141 行目で threshold を `check` に入れます。`perFile` なら `each`（ファイルごと）、そうでなければ `global`（全体）です。143〜145 行目で watermarks（report の色分けの境目）も入れます。152 行目で Karma の builder の `execute` を読み込み、154 行目で結果をそのまま流します。ここから先はこれまでの章の道です。

> [!NOTE]
> **ポイント**
>
> karma-coverage の threshold は、`coverageReporter.check` を書けば `karma.conf.js` でも使えます。`transforms` の値は `parseConfig` の 2 つ目の引数（builder の値）なので、`karma.conf.js` に同じ key があれば、Karma の `config.set` の重ね方で決まります（第 1 回の #30956 の話）。記録の「unit-test + 使えない options」では、`coverageThresholds: { statements: 90 }` が `check.global` になり、テストは全部通ったのに coverage の不足で終了コードが 1 になりました。

## 5. origin/main の続き（2026-10〜11）

📄 `git show（origin/main、抜粋）`

```
$ git show 77fb7fa0f2 -- …/runners/karma/index.ts   # origin/main 2026-10-28（PR #34500）
-    if (options.coverage) {
+    if (options.coverage.enabled) {
       checker.check('karma-coverage');
     }
（runners/karma/index_spec.ts を新しく足した）

$ git show e6c29bde19 -- …/runners/karma/index.ts   # origin/main 2026-10-29（PR #34576）
-    // Check for browser launchers
-    if (options.browsers?.length) {
-      for (const browser of options.browsers) {
-        const launcherName = `karma-${browser.toLowerCase().split('headless')[0]}-launcher`;
-        checker.check(launcherName);
-      }
+    // A custom configuration loads its own launcher plugins and may define custom launchers.
+    // The built-in configuration only loads the Chrome launcher, which also provides Chromium.
+    if (!options.runnerConfig) {
+      checker.check('karma-chrome-launcher');
     }

$ git show cd3d30c6b6 -- …/runners/karma/executor.ts   # origin/main 2026-10-28（PR #34546）
+    if (unitTestOptions.providersFile) { context.logger.warn('… "providersFile" option …') }
+    if (unitTestOptions.outputFile) { context.logger.warn('… "outputFile" option …') }
+    if (unitTestOptions.coverage?.reporters) { context.logger.warn('… "coverageReporters" option …') }

$ git show 0edb6c646f -- …/karma/application_builder.ts   # origin/main 2026-11-04（PR #34654）
     watch: options.watch,
+    poll: options.poll,
+    progress: options.progress,
```

- **77fb7fa0f2**: 正規化の後の `coverage` はいつもオブジェクトなので、coverage を有効にしなくても `karma-coverage` を求めていました（[executor の章](../vit/04-vit-executor.md)で 44129f66a3 に spec を置いて確かめたもの）。
- **e6c29bde19**: ブラウザの名前から作る launcher の名前は、`ChromiumHeadless` から実在しない `karma-chromium-launcher` を、`customLaunchers` の名前からも存在しない package を求めました。今は `runnerConfig` が無いとき（既定の設定が読み込む）だけ `karma-chrome-launcher` を求めます。記録の `ChromeHeadlessNoSandbox` は、44129f66a3 の作り方でも `'headless'` の前の `chrome` から `karma-chrome-launcher` になるので、どちらの版でも通ります。
- **cd3d30c6b6**: `providersFile`・`outputFile`・`coverageReporters` を黙って捨てていたのを警告にしました。記録の `--coverage-reporters=lcov` の警告はこれです。
- **0edb6c646f**: Karma の builder の schema にある `poll` と `progress` を application builder に渡していませんでした（`--no-progress` でも進み具合が出た）。3 節の 91・93 行目で runner が写していた値も、ここで初めて効きます。

ほかに origin/main には feb41cc934（09-23）があり、unit-test builder に `polyfills` option が入りました。Karma の runner は `unitTestOptions.polyfills ?? buildTargetOptions.polyfills` を `injectTestingPolyfills` に通すようになります（22.2.x には入っていない）。

上の 4 つはどれも 22.2.x にも cherry-pick されていて（e96b935c7b・76b585fb5a・e3134b4cbc・325f6a0f48）、記録に使った 22.2.7 に入っています。

## 6. webpack の @angular-devkit/build-angular:karma との違い

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/index.ts` L47–77 （▶ の行: 50–51, 61–62, 65, 67, 73–74, 76）

```ts
47 │   // Check Angular version.
48 │   assertCompatibleAngularVersion(context.workspaceRoot);
49 │ 
50 ▶   if (await checkForEsbuild(options, context)) {
51 ▶     if (transforms.webpackConfiguration) {
52 │       context.logger.warn(
53 │         `This build is using the application builder but transforms.webpackConfiguration was provided. The transform will be ignored.`,
54 │       );
55 │     }
56 │ 
57 │     if (options.fileReplacements) {
58 │       options.fileReplacements = normalizeFileReplacements(options.fileReplacements, './');
59 │     }
60 │ 
61 ▶     if (typeof options.polyfills === 'string') {
62 ▶       options.polyfills = [options.polyfills];
63 │     }
64 │ 
65 ▶     const { executeKarmaBuilder } = await import('@angular/build');
66 │ 
67 ▶     yield* executeKarmaBuilder(
68 │       options as unknown as import('@angular/build').KarmaBuilderOptions,
69 │       context,
70 │       transforms,
71 │     );
72 │   } else {
73 ▶     const karmaOptions = getBaseKarmaOptions(options, context);
74 ▶     const { execute } = await import('./browser_builder');
75 │ 
76 ▶     yield* execute(options, context, karmaOptions, transforms);
77 │   }
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/index.ts` L179–209 （▶ の行: 183–184, 188, 196, 198, 204）

```ts
179 │ async function checkForEsbuild(
180 │   options: KarmaBuilderOptions,
181 │   context: BuilderContext,
182 │ ): Promise<boolean> {
183 ▶   if (options.builderMode !== BuilderMode.Detect) {
184 ▶     return options.builderMode === BuilderMode.Application;
185 │   }
186 │ 
187 │   // Look up the current project's build target using a development configuration.
188 ▶   const buildTargetSpecifier = `::development`;
189 │   const buildTarget = targetFromTargetString(
190 │     buildTargetSpecifier,
191 │     context.target?.project,
192 │     'build',
193 │   );
194 │ 
195 │   try {
196 ▶     const developmentBuilderName = await context.getBuilderNameForTarget(buildTarget);
197 │ 
198 ▶     return isEsbuildBased(developmentBuilderName);
199 │   } catch (e) {
200 │     if (!(e instanceof Error) || e.message !== 'Project target does not exist.') {
201 │       throw e;
202 │     }
203 │     // If we can't find a development builder, we can't use 'detect'.
204 ▶     throw new Error(
205 │       'Failed to detect the builder used by the application. Please set builderMode explicitly.',
206 │       { cause: e },
207 │     );
208 │   }
209 │ }
```

webpack 版の builder は、今は 2 つの道の分かれ目です（入口で「webpack の builder は非推奨」と警告します）。50 行目の `checkForEsbuild` で、183〜184 行目の `builderMode` が `application` か、`detect` のとき 188 行目の `build` の target の `development` の configuration の builder が esbuild のもの（198 行目）なら、65〜67 行目で `@angular/build` の Karma の builder（この章までの `execute`）に渡します。61〜62 行目、polyfills の文字列は配列にします。そうでなければ 73〜76 行目で webpack の `browser_builder.ts` に進みます。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/browser_builder.ts` L59–92 （▶ の行: 59, 65, 71–72, 81, 83, 88）

```ts
59 ▶       if (!options.main) {
60 │         webpackConfig.entry ??= {};
61 │         if (typeof webpackConfig.entry === 'object' && !Array.isArray(webpackConfig.entry)) {
62 │           if (Array.isArray(webpackConfig.entry['main'])) {
63 │             webpackConfig.entry['main'].push(getBuiltInMainFile());
64 │           } else {
65 ▶             webpackConfig.entry['main'] = [getBuiltInMainFile()];
66 │           }
67 │         }
68 │       }
69 │ 
70 │       webpackConfig.plugins ??= [];
71 ▶       webpackConfig.plugins.push(
72 ▶         new FindTestsPlugin({
73 │           include: options.include,
74 │           exclude: options.exclude,
75 │           workspaceRoot: context.workspaceRoot,
76 │           projectSourceRoot: path.join(context.workspaceRoot, sourceRoot),
77 │         }),
78 │       );
79 │ 
80 │       webpackConfig.output ??= {};
81 ▶       webpackConfig.output.path = '/';
82 │ 
83 ▶       if (karmaOptions.singleRun) {
84 │         webpackConfig.plugins.unshift({
85 │           apply: (compiler: webpack.Compiler) => {
86 │             compiler.hooks.afterEnvironment.tap('karma', () => {
87 │               // eslint-disable-next-line @typescript-eslint/no-explicit-any
88 ▶               compiler.watchFileSystem = { watch: () => {} } as any;
89 │             });
90 │           },
91 │         });
92 │       }
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/find-tests-plugin.ts` L44–64 （▶ の行: 45–46, 48, 55）

```ts
44 │     // Add tests files are part of the entry-point.
45 ▶     webpackOptions.entry = async () => {
46 ▶       const specFiles = await findTests(include, exclude, workspaceRoot, projectSourceRoot);
47 │       const entrypoints = await entry;
48 ▶       const entrypoint = entrypoints['main'];
49 │       if (!entrypoint.import) {
50 │         throw new Error(`Cannot find 'main' entrypoint.`);
51 │       }
52 │ 
53 │       if (specFiles.length) {
54 │         originalImport ??= entrypoint.import;
55 ▶         entrypoint.import = [...originalImport, ...specFiles];
56 │       } else {
57 │         assert(this.compilation, 'Compilation cannot be undefined.');
58 │         this.compilation
59 │           .getLogger(pluginName)
60 │           .error(`Specified patterns: "${include.join(', ')}" did not match any spec files.`);
61 │       }
62 │ 
63 │       return entrypoints;
64 │     };
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/browser_builder.ts` L116–142 （▶ の行: 116–118, 133–134, 138–139）

```ts
116 ▶       const enqueue = (value: BuilderOutput) => {
117 ▶         try {
118 ▶           controller.enqueue(value);
119 │         } catch {
120 │           // Controller is already closed
121 │         }
122 │       };
123 │ 
124 │       const close = () => {
125 │         try {
126 │           controller.close();
127 │         } catch {
128 │           // Controller is already closed
129 │         }
130 │       };
131 │ 
132 │       // Close the stream once the Karma server returns.
133 ▶       karmaServer = new karma.Server(parsedKarmaConfig, (exitCode) => {
134 ▶         enqueue({ success: exitCode === 0 });
135 │         close();
136 │       });
137 │ 
138 ▶       karmaServer.on('run_complete', (_, results) => {
139 ▶         enqueue({ success: results.exitCode === 0 });
140 │       });
141 │ 
142 │       await karmaServer.start();
```

|   | webpack（browser\_builder.ts） | @angular/build:karma |
| --- | --- | --- |
| テストの束ね方 | `main` の entry 1 つに、組み込みの main と全部の spec を足す（find-tests-plugin.ts の 55 行目） | spec ごとに entry（`spec-*.js`）と `test_main.js`（[第 2 回](02-kar-build.md)） |
| 出力と配り方 | `output.path = '/'`（81 行目）、webpack の Karma の plugin（`buildWebpack`）がメモリから配る | 一時のフォルダに書き、Karma の `files` と builder の middleware で配る（[第 3 回](03-kar-serve.md)） |
| 1 回だけのとき | 83〜88 行目で webpack のファイル監視を何もしない関数にする | `first(…, { cancel: true })` で 1 つ目だけ取る |
| 結果の返し方 | 133〜134 行目の終わりの関数と、138〜139 行目の `run_complete` の両方から流す。116〜130 行目で、閉じた controller への `enqueue` と `close` を try / catch で包む | 終わりの関数と、watch のときだけの reporter の `onRunComplete`。`desiredSize` の確かめは 5914877e28 で入った |
| transforms | `webpackConfiguration` と同期の `karmaOptions` | 非同期でもよい `karmaOptions` だけ |

## 7. 記録：同じアプリで 2 つの builder を走らせる

> **🧪 DEMO — Karma の builder に渡った options と警告（記録）**
>
> `<work>/kar-demo/b/record.mjs` が、@angular/build 22.2.7・karma 6.4.4・zone.js 0.16.2 で、[前の章](03-kar-serve.md)と同じアプリの 2 つの target を Node v24.22.1 で起動した記録です。`test` は `@angular/build:karma`、`test-ut` は `@angular/build:unit-test` の `runner: "karma"` で、どちらも `tsConfig`・`browsers`・`exclude` だけを書き、assets と styles は `test` には直に、`test-ut` には build の target に書きました。`hook.cjs` が Karma の builder の `execute` に渡った options、`transforms.karmaOptions` の前後、application builder の options を書いています。executor の警告は `execute` より前に出るので、端末の出力から拾いました。
>
> `ng run demo:test --watch=false` — @angular/build:karma（test の target）。終了コード 1
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/kar-runner)

記録から読めることを並べます。

- **options の差は 5 つ**: `aot`（karma は schema の既定の `false`、unit-test は build の target の schema の既定の `true`。2 節の 56〜59 行目）、`include`（unit-test は `**/*.test.ts` も）、`preserveSymlinks`（unit-test は 94 行目で `false` を明示）、`codeCoverage` と `codeCoverageExclude`（unit-test は coverage を有効にしないと入れない）。`aot: false` の方は JIT のコンパイラが polyfills に入るので、polyfills.js が 993.8 kB と 944 B で大きく違いました。
- **transforms**: karma の target では `null`、unit-test では `karmaOptions` があり、`--filter=greet` が `client.args: ['--grep', '/greet/']` に、`coverageThresholds` が `check.global` になりました（6 本が skip、2 本が通った）。`watermarks` は書いていないのに `{}` が入っています（143 行目の `if` は空のオブジェクトでも真）。
- **警告**: `browserViewport`・`debug`・`setupFiles`・`headless`・`coverageReporters`（cd3d30c6b6）・reporter の options（101 行目）の 6 つが、ビルドの前に出ました。
- **zone.js**: karma の target は polyfills が `zone.js` だけで、`fakeAsync` が「zone-testing.js is needed」で落ち、`run_complete` と終わりの関数が 2 回ずつ来ました（[第 3 回](03-kar-serve.md)の 5914877e28 の守り）。unit-test は `zone.js/testing` が足され、`jasmine-cleanup-1` の entry として jasmine の後に読み込まれて通りました。

## テストと直し方

44129f66a3 の `runners/karma/` には spec がありません（`index_spec.ts` は origin/main の 77fb7fa0f2 で足された）。unit-test builder の統合の spec（`unit-test/tests/`）は、`options/isolate_spec.ts` の 24 行目の it（Karma で `isolate: true` は例外）のほかは Vitest の runner だけを走らせます。そのため、3 節の写し方と 4 節の `transforms` を確かめる spec はありません。Karma の builder の側の spec（`builders/karma/tests/`）は、`transforms` を渡さずに `execute` を呼びます。

📄 `走らせたコマンドと結果`

```
cd ~/angular-research/angular-cli-fix   # 44129f66a3
pnpm bazel test //packages/angular/build:unit-test_integration_tests --nocache_test_results --test_output=all \
  '--test_arg=--filter=isolate is true and runner is karma'
# 5 つの shard のうち 1 つで Ran 1 of 104 specs / 1 spec, 0 failures、ほかの 4 つは Ran 0 of 103 specs
//packages/angular/build:unit-test_integration_tests                     PASSED in 0.8s
```

直すとしたら、次の場所になります。

- **写し方の spec**: `executor.ts` の `execute` が `execute`（Karma の builder）に渡す引数を、`import('../../../karma')` を差し替えて見る unit の spec が要ります。origin/main の `runners/karma/index_spec.ts` の隣に `executor_spec.ts` を置く形です。
- **watermarks の空のオブジェクト**: 4 節の 143 行目。unit-test の正規化の既定が `{}` なら、`Object.keys(watermarks).length` で確かめることになります。
- **@angular/build:karma と zone.js/testing**: Karma の builder の `normalizePolyfills`（[第 2 回](02-kar-build.md)）。unit-test の runner と同じく自動で足すなら、そこで `injectTestingPolyfills` を使うことになります。

## 聞かれそうな質問

**Q. `@angular/build:karma` から `unit-test` の `runner: "karma"` に移すと、何が変わりますか？**

assets・styles・polyfills などを build の target から読むようになり（3 節）、`aot` が build の target の値（既定 `true`）になり、zone.js があれば `zone.js/testing` が足されます（2 節の 170〜172 行目）。`main`（`test.ts`）を置く口は無く、`setupFiles` は警告して捨てられます（#32905 が訊いているのはこの点です）。

**Q. `ng test --filter` は Karma でどう効きますか？**

4 節の 126〜128 行目で karma-jasmine の `--grep` になり、名前が合わない spec は skip されます。ビルドは全部の spec でします（記録で 8 本のうち 6 本が skip）。

**Q. unit-test の `reporters` に options を書いたら、Karma では使われますか？**

使われません。3 節の 101〜103 行目で警告し、107 行目で名前だけを渡します。

**Q. coverage の threshold は、unit-test と `karma.conf.js` のどちらに書けばよいですか？**

unit-test の `coverageThresholds` は 4 節の 137〜141 行目で `coverageReporter.check` に入ります。`karma.conf.js` の `coverageReporter` と同じ key を書いたときの勝ち負けは、`parseConfig` の重ね方で決まります（第 1 回）。

**Q. webpack の `@angular-devkit/build-angular:karma` を使っていても esbuild になることがありますか？**

あります。`builderMode` が `application` か、`detect` で build の target の development の builder が esbuild のものなら、6 節の 65〜67 行目で `@angular/build` の Karma の builder に渡します。

## 読み終えて

- Karma の runner は、unit-test の options と build の target の options を `@angular/build:karma` の options に写し、その `execute` をそのまま流す。
- Karma の builder の options に無い `filter`・threshold・watermarks は、`transforms.karmaOptions` で Karma の設定に直に書く。
- build の target は schema で検証してから読むので、`aot` などの既定値が `@angular/build:karma` を直に使うときと違う。
- zone.js のアプリでは、runner だけが `zone.js/testing` を足す（385165cbc6）。2026-10〜11 に、依存の確かめ・警告・`poll` と `progress` の 4 つが直った。
- webpack 版の builder は、esbuild のアプリなら `@angular/build` の Karma の builder に渡すだけの分かれ目になっている。

---

← 前: [Karma に配る：一時のフォルダ・middleware・reporter・coverage](03-kar-serve.md)  
次: [spec と issue を読む：Karma の builder を固めているテスト](05-kar-tests-issues.md) →
