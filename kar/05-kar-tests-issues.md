[目次](../README.md) › [Karma の builder の内側：esbuild で束ねたテストを Karma に配るまで](README.md) › 第 5 回 / 全 5 回

# spec と issue を読む：Karma の builder を固めているテスト

> builders/karma/tests の options と behavior の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、Karma の builder の issue と PR の表。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/kar-tests-issues)

---

この章で分かること: `@angular/build:karma` の spec が bazel のどの target に入り、どんな土台（`tests/setup.ts` と harness の `karma.conf.js`）の上で動くか、18 の spec のファイル・41 の it がこのシリーズの第 1〜4 回のどの約束を固めているかを地図にします。手元で走らせた数と、作業木で行を変えて「どの spec が落ちるか」を確かめた結果、Karma の builder の issue と PR の表、origin/main の続き、このシリーズで見つけたものの表を並べます。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/BUILD.bazel`、`packages/angular/build/src/builders/karma/tests/` の土台と 18 の spec、`modules/testing/builder/projects/hello-world-app/karma.conf.js` です。BUILD.bazel の読み方の一般論は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、spec の中で builder を動かす `BuilderHarness` は[dev-server の spec の章](../vds/05-vds-tests-issues.md)にあります。

1. [1. 入口と Karma の設定](01-kar-entry.md)
2. [2. テストを束ねる](02-kar-build.md)
3. [3. Karma に配る](03-kar-serve.md)
4. [4. unit-test の karma runner](04-kar-runner.md)
5. **5. spec と issue**（この章）

## 1. target：karma\_integration\_tests

📄 `angular-cli/packages/angular/build/BUILD.bazel` L224–254 （▶ の行: 225, 227, 237–241, 253）

```python
224 │ ts_project(
225 ▶     name = "karma_integration_test_lib",
226 │     testonly = True,
227 ▶     srcs = glob(include = ["src/builders/karma/tests/**/*.ts"]),
228 │     deps = [
229 │         ":build",
230 │         "//packages/angular/build/private",
231 │         "//modules/testing/builder",
232 │         ":node_modules/@angular-devkit/architect",
233 │         ":node_modules/@angular-devkit/core",
234 │         "//:node_modules/@types/node",
235 │ 
236 │         # karma specific test deps
237 ▶         "//:node_modules/karma-chrome-launcher",
238 ▶         "//:node_modules/karma-coverage",
239 ▶         "//:node_modules/karma-jasmine",
240 ▶         "//:node_modules/karma-jasmine-html-reporter",
241 ▶         "//:node_modules/puppeteer",
242 │ 
243 │         # Base dependencies for the karma in hello-world-app.
244 │         "//:node_modules/@angular/common",
245 │         "//:node_modules/@angular/compiler",
246 │         "//:node_modules/@angular/compiler-cli",
247 │         "//:node_modules/@angular/core",
248 │         "//:node_modules/@angular/platform-browser",
249 │         "//:node_modules/@angular/router",
250 │         ":node_modules/rxjs",
251 │         "//:node_modules/tslib",
252 │         "//:node_modules/typescript",
253 ▶         "//:node_modules/zone.js",
254 │         "//:node_modules/buffer",
```

📄 `angular-cli/packages/angular/build/BUILD.bazel` L309–319 （▶ の行: 310, 316, 318–319）

```python
309 │ jasmine_test(
310 ▶     name = "karma_integration_tests",
311 │     size = "medium",
312 │     data = [":karma_integration_test_lib"],
313 │     env = {
314 │         # TODO: Replace Puppeteer downloaded browsers with Bazel-managed browsers,
315 │         # or standardize to avoid complex configuration like this!
316 ▶         "PUPPETEER_DOWNLOAD_PATH": "../../../node_modules/puppeteer/downloads",
317 │     },
318 ▶     flaky = True,
319 ▶     shard_count = 10,
```

227 行目、`builders/karma/tests/` の下の `.ts` が全部 1 つの `ts_project` になり、310 行目の `jasmine_test` が 319 行目の 10 の shard に分けて、Node の上の jasmine で走らせます。318 行目の `flaky = True` で、落ちた shard は bazel がもう一度走らせます。deps は 237〜240 行目の Karma の 4 つの package と、253 行目の `zone.js` です。ブラウザは、`tools/defaults.bzl` の `jasmine_test` が `CHROME_BIN` に入れる rules\_browsers の chrome-headless-shell で、241 行目の puppeteer と 316 行目の download の場所は、`CHROME_BIN` が無いときの予備です（次の節の 16 行目）。`builders/karma/` の中に `_spec.ts` は無いので、unit の target（`//packages/angular/build:test`）に入る Karma の builder の spec はありません。

## 2. 土台：tests/setup.ts と harness の karma.conf.js

📄 `angular-cli/packages/angular/build/src/builders/karma/tests/setup.ts` L28–44 （▶ の行: 29, 38, 40–43）

```ts
28 │ export const KARMA_BUILDER_INFO = Object.freeze({
29 ▶   name: '@angular/build:karma',
30 │   schemaPath: __dirname + '/../schema.json',
31 │ });
32 │ 
33 │ /**
34 │  * Contains all required karma builder fields.
35 │  * Also disables progress reporting to minimize logging output.
36 │  */
37 │ export const BASE_OPTIONS = Object.freeze<Schema>({
38 ▶   polyfills: ['./src/polyfills', 'zone.js/testing'],
39 │   tsConfig: 'src/tsconfig.spec.json',
40 ▶   karmaConfig: 'karma.conf.js',
41 ▶   browsers: 'ChromeHeadlessCI',
42 ▶   progress: false,
43 ▶   watch: false,
44 │ });
```

spec はどれも `describeKarmaBuilder(execute, KARMA_BUILDER_INFO, …)` で harness を受け取り、`harness.useTarget('test', { ...BASE_OPTIONS, … })` で options を決めます。38 行目の polyfills は `zone.js/testing` を含み、40 行目で harness の `karma.conf.js` を使い、41 行目のブラウザはその中の custom launcher、42〜43 行目で progress と watch を切ります。つまり、どの it も zone.js の道で、`karmaConfig` を書いた道です（既定の設定の `getBuiltInKarmaConfig` を通る it は無い、[第 1 回](01-kar-entry.md)）。

📄 `angular-cli/modules/testing/builder/projects/hello-world-app/karma.conf.js` L16–54 （▶ の行: 16, 21, 27, 33, 36, 43, 46, 54）

```js
16 ▶ process.env.CHROME_BIN = process.env.CHROME_BIN ? path.resolve(path.join(process.cwd(), '..', '..', '..'), process.env.CHROME_BIN) : require('puppeteer').executablePath();
17 │ 
18 │ module.exports = function(config) {
19 │   config.set({
20 │     basePath: '',
21 ▶     frameworks: ['jasmine', '@angular-devkit/build-angular'],
22 │     plugins: [
23 │       require('karma-jasmine'),
24 │       require('karma-chrome-launcher'),
25 │       require('karma-jasmine-html-reporter'),
26 │       require('karma-coverage'),
27 ▶       require('@angular-devkit/build-angular/plugins/karma'),
28 │     ],
29 │     jasmineHtmlReporter: {
30 │       suppressAll: true // removes the duplicated traces
31 │     },
32 │     coverageReporter: {
33 ▶       dir: path.join(__dirname, './coverage'),
34 │       subdir: '.',
35 │       reporters: [
36 ▶         {type: 'lcov'},
37 │       ],
38 │     },
39 │     reporters: ['progress', 'kjhtml'],
40 │     port: 9876,
41 │     colors: true,
42 │     logLevel: config.LOG_INFO,
43 ▶     autoWatch: true,
44 │     browsers: ['Chrome'],
45 │     customLaunchers: {
46 ▶       ChromeHeadlessCI: {
47 │         base: 'ChromeHeadless',
48 │         flags: [
49 │           '--disable-gpu',
50 │           '--no-sandbox'
51 │         ],
52 │       },
53 │     },
54 ▶     singleRun: false,
```

📄 `angular-cli/packages/angular/build/src/builders/karma/tests/setup.ts` L115–147 （▶ の行: 118, 133, 135, 137–140, 145）

```ts
115 │ let counter = 0;
116 │ 
117 │ /** Runs the test against both an application- and a browser-builder context. */
118 ▶ export function describeKarmaBuilder<T>(
119 │   builderHandler: BuilderHandlerFn<T & json.JsonObject>,
120 │   options: { name?: string; schemaPath: string },
121 │   specDefinitions: (
122 │     harness: JasmineBuilderHarness<T>,
123 │     setupTarget: typeof setupApplicationTarget,
124 │     isApplicationTarget: true,
125 │   ) => void,
126 │ ) {
127 │   const optionSchema = getCachedSchema(options);
128 │   const harness = new JasmineBuilderHarness<T>(builderHandler, host, {
129 │     builderName: options.name,
130 │     optionSchema,
131 │   });
132 │ 
133 ▶   describe((options.name || builderHandler.name) + ` (${counter++})`, () => {
134 │     beforeEach(async () => {
135 ▶       await host.initialize().toPromise();
136 │ 
137 ▶       await harness.modifyFile('karma.conf.js', (content) => {
138 ▶         return content
139 ▶           .replace(`, '@angular-devkit/build-angular'`, '')
140 ▶           .replace(`require('@angular-devkit/build-angular/plugins/karma'),`, '');
141 │       });
142 │     });
143 │     afterEach(() => host.restore().toPromise());
144 │ 
145 ▶     specDefinitions(harness, setupApplicationTarget, true);
146 │   });
147 │ }
```

harness の `karma.conf.js` は webpack 版の雛形のままで、21 行目の framework と 27 行目の plugin に `@angular-devkit/build-angular` があります。`describeKarmaBuilder` は 137〜141 行目で、各 it の前にこの 2 つを文字列の置き換えで消します。そのため、[第 3 回](03-kar-serve.md)の `configureKarma` の「webpack の plugin と framework を外して警告する」行は、どの it でも何もしません（4 節で確かめます）。33・36 行目の coverage は `lcov` で `coverage/` に出すので、coverage の spec は `coverage/lcov.info` を見ます。43 行目の `autoWatch: true` と 54 行目の `singleRun: false` は、builder が `singleRun` を watch の逆で上書きします（第 1 回）。133 行目の describe の名前は `@angular/build:karma (番号)` で、番号は読み込んだ順の通し番号です（落ちた it の名前に出る）。145 行目、3 つ目の引数はいつも `true` です。

📄 `angular-cli/packages/angular/build/src/builders/karma/tests/options/web-worker-tsconfig_spec.ts` L73–88 （▶ の行: 73–75, 84–85）

```ts
73 ▶     // Web workers work with the application builder _without_ setting webWorkerTsConfig.
74 ▶     if (isApplicationBuilder) {
75 ▶       it(`should parse web workers when "webWorkerTsConfig" is not set or set to undefined.`, async () => {
76 │         harness.useTarget('test', {
77 │           ...BASE_OPTIONS,
78 │           webWorkerTsConfig: undefined,
79 │         });
80 │ 
81 │         const { result } = await harness.executeOnce();
82 │         expect(result?.success).toBeTrue();
83 │       });
84 ▶     } else {
85 ▶       it(`should not parse web workers when "webWorkerTsConfig" is not set or set to undefined.`, async () => {
86 │         harness.useTarget('test', {
87 │           ...BASE_OPTIONS,
88 │           webWorkerTsConfig: undefined,
```

74 行目の `isApplicationBuilder` は 145 行目の `true` なので、84 行目の `else` の中の 85 行目の it（webpack の builder で worker が作れないことを見る）は定義されません。webpack 版と同じ spec を両方で走らせていたころの名残です。

## 3. 地図と走らせた結果

> **🧪 DEMO — spec の地図を章でふるい分ける**
>
> 行は 44129f66a3 で `grep -n` したもの、「it」は jasmine が数える spec の数です（`include_spec.ts` は 8 通りの入力をループで回すので 9）。最後の行は unit-test builder の統合の target（別の target）です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/kar-tests-issues)

📄 `走らせたコマンド`

```
cd ~/angular-research/angular-cli-fix   # 44129f66a3
pnpm bazel test //packages/angular/build:karma_integration_tests --nocache_test_results --test_output=all

# 行を変えるときは作業木で（終わったら git worktree remove --force で消した）
git -C ~/angular-research/angular-cli-fix worktree add --detach <scratchpad>/kar-wt-b 44129f66a3
cd <scratchpad>/kar-wt-b
~/angular-research/angular-cli-fix/node_modules/.bin/bazel test //packages/angular/build:karma_integration_tests \
  --nocache_test_results --test_output=errors --flaky_test_attempts=1
```

📄 `結果（出力から抜き出したもの）`

```
（10 の shard。9 つが「4 specs, 0 failures」、1 つが「5 specs, 0 failures」）
//packages/angular/build:karma_integration_tests                         PASSED in 26.9s
Executed 1 out of 1 test: 1 test passes.
```

10 の shard の合計は 41 specs で、地図の合計と同じです。1 本の shard は 20〜30 秒で、どれも 1 回目で通りました。第 3 回と第 4 回の記録と違い、spec は zone.js ありで、harness のワークスペースの `app.component.spec.ts` を書き換えて走らせます。

## 4. 行を変えると、どの spec が落ちるか

作業木で行を変え、`--flaky_test_attempts=1` で target の全部を走らせました。表の上の 7 つは 1 回にまとめて走らせ（落ちた 1 つを戻してもう 1 回）、下の 3 つは、refreshFiles と終わりの関数の守りを 1 回に、hasChunkOrWorkerFiles をもう 1 回に分けて走らせました（落ちた it の名前で切り分けた）。

| 場所 | 変えたこと | 結果 | 章 |
| --- | --- | --- | --- |
| `application_builder.ts 372・380` | webpack の plugin と framework を外さない（filter を常に true） | 41 specs が全部通った | 第 3 回 |
| `application_builder.ts 403` | junit の outputDir の付け替えを通らないようにした | 41 specs が全部通った | 第 3 回 |
| `application_builder.ts 307` | scripts の同じ名前の除去を通らないようにした | 41 specs が全部通った | 第 3 回 |
| `application_builder.ts 127〜129` | 1c2d49ec73 の process.once の 3 行を消した | 41 specs が全部通った | 第 2・3 回 |
| `coverage.ts 16` | 正規表現から .spec / .e2e の除外を消した | 41 specs が全部通った | 第 3 回 |
| `progress-reporter.ts 79` | Full のときの files.clear() を消した | 41 specs が全部通った | 第 3 回 |
| `assets-middleware.ts 65〜74` | memory の道を next() にした | scripts\_spec.ts の 18 行目の it が Expected false to be true. で落ちた | 第 3 回 |
| `progress-reporter.ts 89` | refreshFiles() を消した | rebuilds\_spec.ts の 19・52 行目の it が TimeoutError で落ちた | 第 3 回 |
| `application_builder.ts 93〜100` | Server の終わりの関数の desiredSize と try / catch を外した（5914877e28 の前の形） | code-coverage-exclude\_spec.ts の 27 行目の it が Uncaught exception: TypeError \[ERR\_INVALID\_STATE\] で落ちた。errors\_spec.ts の 32 行目の it は通った | 第 3 回 |
| `utils.ts 66〜68` | hasChunkOrWorkerFiles を常に false にした | 10 の shard すべてで、41 のうち 29 の it が落ちた | 第 3 回 |

📄 `angular-cli/packages/angular/build/src/builders/karma/tests/behavior/errors_spec.ts` L32–43 （▶ の行: 35, 38, 42）

```ts
32 │     it('handles stream cancellation gracefully in watch mode', async () => {
33 │       harness.useTarget('test', {
34 │         ...BASE_OPTIONS,
35 ▶         watch: true,
36 │       });
37 │ 
38 ▶       const { result } = await harness.executeOnce({
39 │         outputLogsOnFailure: false,
40 │       });
41 │ 
42 ▶       expect(result?.success).toBeTrue();
43 │     });
```

📄 `5914877e28 の守りを外して走らせた結果（抜粋）`

```
# application_builder.ts の 93〜100 行目を 5914877e28 の前の形にして走らせた
1) @angular/build:karma (10) Option: "codeCoverageExclude" should exclude file from coverage when set
  Message:
    Uncaught exception: TypeError [ERR_INVALID_STATE]: Invalid state: Controller is already closed
  Stack:
        at ReadableStreamDefaultController.enqueue (node:internal/webstreams/readablestream:1190:13)
        at …/packages/angular/build/src/builders/karma/application_builder.ts:93:20
        at removeAllListeners (…/node_modules/karma/lib/server.js:468:9)
        at Server.<anonymous> (…/node_modules/karma/lib/server.js:475:9)
//packages/angular/build:karma_integration_tests                         FAILED in 3 out of 10 in 59.0s
```

5914877e28 と一緒に足された it は、35 行目で watch にして、38 行目の `executeOnce`（1 つ目の結果を受けたらストリームを捨てる）で 42 行目の `success` を見ます。守りを外しても、この it 自体は通りました。閉じたストリームへの `enqueue` は、ストリームを捨てた後で Karma が終わるとき、つまり it が終わった後に起きるので、Node の uncaught の例外として、そのとき走っていた別の it（ここでは `codeCoverageExclude` の 27 行目）の失敗として出ました。守りを確かめているのは、特定の it というより「target の全部が uncaught の例外なしに終わること」です。

spec が無い行は、どれも「builder の値が Karma に渡ったか」を外から見る口が無いところです。harness の `logs` は architect の logger の出力だけで、Karma の設定や middleware に届いた request は見えません。第 3 回の記録のように Karma の `Server` を包めば見えますが、spec はそうしていません。

## 5. issue と PR

> **🧪 DEMO — issue と PR を章でふるい分ける**
>
> 2026-11-17 に gh で読んだもの（読むだけ）。日付は開いた日です。webpack 版だけの話と、schematics の Karma から Vitest への移行の多くは入れていません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/kar-tests-issues)

開いている issue で、このシリーズの行に一番近いのは #34250 です。spec のファイルごとに entry を作るので（[第 2 回](02-kar-build.md)）、spec の間で共有するコードは `chunk-*.js` に入り（[第 3 回](03-kar-serve.md)の記録の 2.30 MB のチャンク）、どの spec がその bundle に入るかで初期化の順が変わる、という報告です。11 月 7 日の PR #34668 はその修正案でしたが、merge されずに閉じています。

## 6. origin/main の続き

44129f66a3（2026-09-10）から手元の origin/main（8b26efa1ba、2026-11-13）までに、`builders/karma` と `runners/karma` を変えたコミットは 10 本です。ふるまいを直した 4 本は[第 4 回](04-kar-runner.md)の 5 節で読みました。`builders/karma/tests/` は変わっていません。

| 章 | コミット（日付） | 中身 |
| --- | --- | --- |
| 第 2 回 | 0edb6c646f（11-04） | `poll` と `progress` を application builder に渡す（spec なし） |
| 第 4 回 | 77fb7fa0f2（10-28）・cd3d30c6b6（10-28）・e6c29bde19（10-29） | karma-coverage を coverage のときだけ、使えない options の警告、launcher の確かめ。`runners/karma/index_spec.ts` が新しく入った（4 つの it） |
| 第 4 回 | 13a7346493（10-19） | `--filter` の警告の空白 |
| 第 1 回 | 462c7a756b（09-29）・405839b160（10-19）・b1e814c5ab（10-20） | schema の `include` と `exclude` の説明（docs） |
| 第 3 回 | 4951994f64（10-13） | 出力の書き出しを `emitFilesToDisk` にまとめる refactor。middleware の disk の道が `file.inputPath` から `file.source` になった |
| 第 4 回 | feb41cc934（09-23） | unit-test の `polyfills` option。Karma の runner は `unitTestOptions.polyfills ?? buildTargetOptions.polyfills` を `injectTestingPolyfills` に通す |

## このシリーズで見つけたもの

書きながら記録と作業木で見つけたものです。本家の行と、再現に使った記録を書きます。「既存の issue / PR」は 2026-11-17 に gh で検索した結果（読むだけ）です。

| ソースの行 | 見つけたこと | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| `builders/karma/application_builder.ts 105〜107、progress-reporter.ts 53〜92` | ng test --watch で、1 回目の SIGINT（Ctrl+C）では Karma が止まり一時のフォルダも消えるが、ng のプロセスが終わらない。2 回目の SIGINT で終わる | 第 3 回の記録の watch（process group へ SIGINT、10 秒待つ）と sigint-pty.py（疑似端末に Ctrl+C、15 秒待つ）。どちらも 1 回目では終わらず、2 回目ですぐ終わった | 見つからなかった（"SIGINT"・"ctrl c" などで検索） | 第 3 回 |
| `builders/karma/find-tests.ts 15〜17（removeLeadingSlash）` | POSIX で --include に絶対パスを渡すと先頭の「/」が落ちて何も見つからない（unit-test の側は 683d0e09e5 で直っている） | 第 1 回の記録の「--include 絶対パス」。結果は空、0 件で終了コード 1 | 見つからなかった | 第 1 回 |
| `builders/karma/karma-config.ts 35・36` | karmaConfig があるとき、karma.conf.js の client.clearContext: false が --watch=false で true になる | 第 1 回の記録の「conf で basePath などを上書き」 | 見つからなかった（#28271 はこの行を入れた元の件） | 第 1 回 |
| `builders/karma/application_builder.ts 214` | zone.js を使うかを、polyfills にちょうど "zone.js" があるかだけで決める | 第 2 回の本文（行の読み） | #30689 は application builder の zoneless の判定の件で、別の行 | 第 2 回 |
| `unit-test/runners/karma/executor.ts 143` | coverageWatermarks を書かなくても coverageReporter.watermarks に {} が入る | 第 4 回の記録の「unit-test + 使えない options」の karmaOptions の後 | 見つからなかった | 第 4 回 |
| `builders/karma/tests/setup.ts 137〜141` | harness が karma.conf.js から webpack の plugin と framework を先に消すので、configureKarma の 369〜387 行目（外す行と警告）を通る spec が無い | この章の 4 節（filter を常に true にしても 41 specs が通る） | — | 第 3 回 |
| `builders/karma/tests/setup.ts 145、web-worker-tsconfig_spec.ts 74・85` | describeKarmaBuilder は isApplicationTarget をいつも true で渡すので、85 行目の it は定義されない | この章の 2 節（行の読み）。走らせた数も 41 で合う | — | 第 5 回 |

ほかに、spec が無いと各章で書いた行は、[第 1 回](01-kar-entry.md)の `getBuiltInKarmaConfig`（harness がいつも `karmaConfig` を書く）、[第 2 回](02-kar-build.md)の zoneless の仮想の init と `@angular/localize` の有無、[第 3 回](03-kar-serve.md)の junit・scripts の重なり・`files.clear()`・coverage の spec の除外・一時のフォルダの後片付け、[第 4 回](04-kar-runner.md)の options の写し方と `transforms` です。

## 聞かれそうな質問

**Q. Karma の builder の spec を 1 本だけ走らせるには？**

`pnpm bazel test //packages/angular/build:karma_integration_tests --test_arg=--filter=<describe か it の名前>` です。10 の shard のどれかに入るので、ほかの shard は 0 件で PASSED になります。`Ran 1 of …` の行で数を確かめます（[第 4 回](04-kar-runner.md)の unit-test の target の例）。

**Q. spec のブラウザは何ですか？手元に Chrome が要りますか？**

rules\_browsers の chrome-headless-shell で、bazel が持ってきます（1 節）。harness の `karma.conf.js` の 16 行目が `CHROME_BIN` を runfiles の中の絶対パスに直し、46 行目の `ChromeHeadlessCI`（`--no-sandbox`）で起動します。今回の記録は Chrome Headless 155 でした。

**Q. zoneless のアプリのテストは spec で確かめられていますか？**

いいえ。2 節の 38 行目の `BASE_OPTIONS` の polyfills に `zone.js/testing` があり、polyfills を空にする it はありません。第 3 回の記録のアプリ（zoneless）と同じ道は、spec では通りません。

**Q. `@angular-devkit/build-angular` の framework を外す警告は確かめられていますか？**

いいえ。2 節の 137〜141 行目で harness が先に消すので、警告の行まで来ません。4 節で、外す行を何もしないように変えても 41 specs が通りました。

**Q. flaky な shard は放っておいてよいのですか？**

1 節の 318 行目の `flaky = True` で、bazel は落ちた shard をもう一度走らせ、2 回目が通れば PASSED にします。今回の走らせ方（`--flaky_test_attempts=1` を含む 5 回）では、行を変えていない shard が落ちたことはありません。

## 読み終えて

- Karma の builder の spec は `tests/` の 18 ファイル・41 specs で、10 の shard に分かれ、harness の上で本物の application builder・Karma・chrome-headless-shell を動かす。
- 土台は zone.js ありで `karmaConfig` を書いた形だけで、webpack の framework は harness が先に消す。`web-worker-tsconfig_spec.ts` の webpack 用の it は定義されない。
- middleware の memory の道・`refreshFiles`・チャンクを配るパターンは行を変えると落ち、webpack の framework・junit・scripts の重なり・`files.clear()`・coverage の spec の除外・一時のフォルダの後片付けは落ちない。
- 閉じたストリームの守りは、特定の it ではなく「uncaught の例外が出ないこと」で守られている。
- 開いている issue は、共有のチャンクの初期化（#34250）・karma.conf.js の上書き（#30956）・unit-test への移行（#32905）が中心。

---

← 前: [unit-test の karma runner：ng test から Karma の builder を呼ぶ](04-kar-runner.md)  
次: [transform の 1 回の走査：何を見て、どこに印を付けるか](../oxc/01-oxc-transform-pass.md) →
