[目次](../README.md) › [ng test と Vitest の内側：テストを束ねて走らせるまで](README.md) › 第 5 回 / 全 5 回

# spec と issue を読む：unit-test builder を固めているテスト

> builders/unit-test の 30 の統合の spec と 2 つの unit の spec が、このシリーズの各章の約束をどこで固めているか、bazel での走らせ方と結果、行を変えても落ちない spec の穴、unit-test builder の issue と PR の表、このシリーズで見つけたもの。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/vit-tests-issues)

---

この章で分かること: unit-test builder の spec が bazel のどの target に入り、どんな土台（harness と `tests/setup.ts`）の上で動くか、32 の spec のファイルがこのシリーズの第 1〜4 回のどの約束を固めているかを地図にします。手元で走らせた数と、作業木で行を変えて「どの spec が落ちるか」を確かめた結果、unit-test builder の issue と PR の表、origin/main の続き、このシリーズで見つけたものの表を並べます。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/BUILD.bazel`、`packages/angular/build/src/builders/unit-test/tests/` の土台と 30 の spec、`test-discovery_spec.ts`・`runners/vitest/browser-provider_spec.ts` です。BUILD.bazel の読み方の一般論は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、spec の中で builder を動かす `BuilderHarness` は[dev-server の spec の章](../vds/05-vds-tests-issues.md)にあります。

1. [1. テストを探す](01-vit-discovery.md)
2. [2. テスト用のビルド](02-vit-build.md)
3. [3. Vitest の plugin](03-vit-plugins.md)
4. [4. executor とブラウザ](04-vit-executor.md)
5. **5. spec と issue**（この章）

## 1. 2 つの target

📄 `angular-cli/packages/angular/build/BUILD.bazel` L258–288 （▶ の行: 259, 261, 265, 271–273, 285）

```python
258 │ ts_project(
259 ▶     name = "unit-test_integration_test_lib",
260 │     testonly = True,
261 ▶     srcs = glob(include = ["src/builders/unit-test/tests/**/*.ts"]),
262 │     deps = [
263 │         ":build",
264 │         "//packages/angular/build/private",
265 ▶         "//modules/testing/builder",
266 │         ":node_modules/@angular-devkit/architect",
267 │         ":node_modules/@angular-devkit/core",
268 │         "//:node_modules/@types/node",
269 │ 
270 │         # unit test specific test deps
271 ▶         ":node_modules/@vitest/coverage-v8",
272 ▶         ":node_modules/vitest",
273 ▶         ":node_modules/jsdom",
274 │ 
275 │         # Base dependencies for the hello-world-app.
276 │         "//:node_modules/@angular/common",
277 │         "//:node_modules/@angular/compiler",
278 │         "//:node_modules/@angular/compiler-cli",
279 │         "//:node_modules/@angular/core",
280 │         "//:node_modules/@angular/platform-browser",
281 │         "//:node_modules/@angular/router",
282 │         ":node_modules/rxjs",
283 │         "//:node_modules/tslib",
284 │         "//:node_modules/typescript",
285 ▶         "//:node_modules/zone.js",
286 │     ],
287 │ )
288 │ 
```

📄 `angular-cli/packages/angular/build/BUILD.bazel` L322–328 （▶ の行: 323, 326–327）

```python
322 │ jasmine_test(
323 ▶     name = "unit-test_integration_tests",
324 │     size = "medium",
325 │     data = [":unit-test_integration_test_lib"],
326 ▶     flaky = True,
327 ▶     shard_count = 5,
328 │ )
```

261 行目、`tests/` の下の `.ts` が全部 1 つの `ts_project` になり、326〜327 行目の `jasmine_test` が 5 つの shard に分けて Node の上の jasmine で走らせます。326 行目の `flaky = True` で、落ちた shard は bazel がもう一度走らせます（3 節）。deps は 271〜273 行目の `@vitest/coverage-v8`・`vitest`・`jsdom` と、285 行目の `zone.js` です。`@vitest/coverage-istanbul`・`happy-dom`・`@vitest/browser-*` は入っていないので、[第 3 回](03-vit-plugins.md)の Istanbul の道と、[第 4 回](04-vit-executor.md)の本物のブラウザの道は、この target では走りません（e2e の `tests/e2e/tests/vitest/` が見ています）。

`tests/` の外にある `test-discovery_spec.ts` と `browser-provider_spec.ts` は、`//packages/angular/build:test`（`src/**/*_spec.ts` から `tests/` を除いたもの、4 shard）に入ります。こちらは builder を動かさず、関数を直に呼ぶ unit の spec です。

## 2. 土台：tests/setup.ts

📄 `angular-cli/packages/angular/build/src/builders/unit-test/tests/setup.ts` L36–65 （▶ の行: 41, 44, 48, 61–64）

```ts
36 │ export const APPLICATION_BASE_OPTIONS = Object.freeze<ApplicationSchema>({
37 │   index: 'src/index.html',
38 │   browser: 'src/main.ts',
39 │   outputPath: 'dist',
40 │   tsConfig: 'src/tsconfig.app.json',
41 ▶   progress: false,
42 │ 
43 │   // Disable optimizations
44 ▶   optimization: false,
45 │ 
46 │   // Enable polling (if a test enables watch mode).
47 │   // This is a workaround for bazel isolation file watch not triggering in tests.
48 ▶   poll: 100,
49 │ });
50 │ 
51 │ export const UNIT_TEST_BUILDER_INFO = Object.freeze({
52 │   name: '@angular/build:unit-test',
53 │   schemaPath: __dirname + '/../schema.json',
54 │ });
55 │ 
56 │ /**
57 │  * Contains all required dev-server builder fields.
58 │  * The port is also set to zero to ensure a free port is used for each test which
59 │  * supports parallel test execution.
60 │  */
61 ▶ export const BASE_OPTIONS = Object.freeze<Schema>({
62 ▶   buildTarget: 'test:build',
63 ▶   tsConfig: 'src/tsconfig.spec.json',
64 ▶   runner: Runner.Vitest,
65 │ });
```

📄 `angular-cli/packages/angular/build/src/builders/unit-test/tests/setup.ts` L85–106 （▶ の行: 93–95, 98–99）

```ts
 85 │ export function setupApplicationTarget<T>(
 86 │   harness: BuilderHarness<T>,
 87 │   extraOptions?: Partial<ApplicationSchema>,
 88 │ ): void {
 89 │   applicationSchema ??= JSON.parse(
 90 │     readFileSync(APPLICATION_BUILDER_INFO.schemaPath, 'utf8'),
 91 │   ) as json.schema.JsonSchema;
 92 │ 
 93 ▶   harness.withBuilderTarget(
 94 ▶     'build',
 95 ▶     buildApplication,
 96 │     {
 97 │       ...APPLICATION_BASE_OPTIONS,
 98 ▶       polyfills: ['zone.js', '@angular/localize/init'],
 99 ▶       ...extraOptions,
100 │     },
101 │     {
102 │       builderName: APPLICATION_BUILDER_INFO.name,
103 │       optionSchema: applicationSchema,
104 │     },
105 │   );
106 │ }
```

spec はどれも `describeBuilder(execute, UNIT_TEST_BUILDER_INFO, …)` で harness を受け取り、`vitest-barrel-side-effects_spec.ts` 以外は 85 行目の `setupApplicationTarget` を呼んで `build` の target を作ります。61〜65 行目の `BASE_OPTIONS` は `buildTarget: 'test:build'` と `runner: Runner.Vitest` で、41 行目で progress を消し、48 行目で watch のときにファイルを 100 ms ごとに見に行かせます（bazel の sandbox ではファイルの監視の知らせが届かないため）。

> [!WARNING]
> **ハマりどころ**
>
> 98 行目、harness の `build` の target の polyfills は既定で `['zone.js', '@angular/localize/init']` です。`polyfills` を上書きしない spec は、どれも zone.js ありで走ります。このシリーズの記録のアプリ（zoneless）と同じ道を通るのは、`vitest-zone-init_spec.ts` の 44 行目の it のように `polyfills: []` を渡したものだけです。逆に、polyfills の zone.js を直に確かめる 12 行目の it は `xit` で止められています（[第 2 回](02-vit-build.md)のテストの節）。

## 3. 地図と走らせた結果

> **🧪 DEMO — spec の地図を章でふるい分ける**
>
> 行は 44129f66a3 で `grep -n` したもの、「it」は jasmine が数える spec の数です（`include_spec.ts` は 5 通りの入力をループで回すので 6、`coverage-ignore-comments_spec.ts` は istanbul と v8 で 2 回ずつ）。「unit」は `//packages/angular/build:test` に入る 2 つです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/vit-tests-issues)

📄 `走らせたコマンド`

```
cd ~/angular-research/angular-cli-fix   # 44129f66a3（../angular-cli と同じ版）
pnpm bazel test //packages/angular/build:unit-test_integration_tests --nocache_test_results --test_output=all
pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=setupBrowserConfiguration|getTestEntrypoints|generateNameFromPath'
```

📄 `結果（出力から抜き出したもの）`

```
（shard 1）21 specs, 0 failures, 3 pending specs
（shard 2）21 specs, 0 failures, 2 pending specs
（shard 3）21 specs, 0 failures, 1 pending spec
（shard 4）21 specs, 1 failure, 1 pending spec    ← 1 回目
（shard 4）21 specs, 0 failures, 1 pending spec   ← flaky = True の 2 回目
（shard 5）20 specs, 0 failures, 2 pending specs
//packages/angular/build:unit-test_integration_tests                     PASSED（1 分 31 秒）
（//packages/angular/build:test の 4 つの shard）Ran 7 of 594 specs ×4 / 0 failures
//packages/angular/build:test                                            PASSED in 0.8s
```

統合の target は 5 つの shard の合計で 104 specs（地図の合計と同じ）、うち 9 が pending（`xdescribe` の 3 つのファイルの 8 と、`xit` の 1）でした。1 回目の shard 4 では `runner-config-vitest_spec.ts` の 167 行目の it（`should enable coverage when set in runnerConfig file without builder option`）が `Expected false to be true.` で落ち、2 回目は通りました。作業木で target の全部を走らせた 2 回（4 節）では、この it は落ちていません。unit の target は `--filter` に 3 つの describe の名前の正規表現を渡し、4 つの shard に 7 本ずつ、28 本（`browser-provider_spec.ts` の 14 と `test-discovery_spec.ts` の 14）が通りました。

## 4. 行を変えると、どの spec が落ちるか

作業木（`git -C ~/angular-research/angular-cli-fix worktree add <scratchpad>/vit-wt-b 44129f66a3`）で行を変え、統合の target を `--flaky_test_attempts=1` で走らせました。1 回の実行で 2〜3 か所をまとめて変え、落ちた it の名前で切り分けています。

| 場所 | 変えたこと | 結果 | 章 |
| --- | --- | --- | --- |
| `executor.ts 223` | 10 秒の timeout を 1 ms に | 落ちる it なし（警告も 0 回） | 第 4 回 |
| `plugins.ts 248・269` | extends: false を 2 行とも消す | 落ちる it なし | 第 3 回 |
| `plugins.ts 104` | browsersToCheck.length &gt; 0 \|\| を外す（9a3c34bd16 の前） | 落ちる it なし | 第 3 回 |
| `plugins.ts 176〜178` | CLI の reporters があっても設定の reporters を消さない | runner-config-vitest\_spec の 102 行目の it が落ちる | 第 3 回 |
| `plugins.ts 209` | delete testConfig.watch を消す | 落ちる it なし | 第 3 回 |
| `executor.ts 196` | threshold の判定を if (false && …) に | runner-config-coverage\_spec の 24・85 行目の it が落ちる | 第 4 回 |

落ちなかった行には、spec が無い理由がそれぞれあります。1 つは、警告の it が文言を見ていないことです。

📄 `angular-cli/packages/angular/build/src/builders/unit-test/tests/behavior/runner-config-vitest_spec.ts` L443–475 （▶ の行: 443, 446–447, 456, 462–463, 465–466）

```ts
443 ▶     it('should warn and ignore "test.watch" option from runnerConfig file', async () => {
444 │       harness.useTarget('test', {
445 │         ...BASE_OPTIONS,
446 ▶         watch: false,
447 ▶         runnerConfig: 'vitest.config.mts',
448 │       });
449 │ 
450 │       harness.writeFile(
451 │         'vitest.config.mts',
452 │         `
453 │         import { defineConfig } from 'vitest/config';
454 │         export default defineConfig({
455 │           test: {
456 ▶             watch: true,
457 │           },
458 │         });
459 │         `,
460 │       );
461 │ 
462 ▶       const { result, logs } = await harness.executeOnce();
463 ▶       expect(result?.success).toBeTrue();
464 │ 
465 ▶       // TODO: Re-enable once Vite logs are remapped through build system
466 ▶       // expect(logs).toContain(
467 │       //   jasmine.objectContaining({
468 │       //     level: 'warn',
469 │       //     message: jasmine.stringMatching(
470 │       //       'The "test.watch" option in the Vitest configuration file is overridden by the builder\\'s watch option.',
471 │       //     ),
472 │       //   }),
473 │       // );
474 │     });
475 │ 
```

446〜447 行目で `watch: false` と `runnerConfig` を渡し、456 行目で設定に `watch: true` を書きますが、確かめるのは 463 行目の `success` だけです。465 行目のコメントのとおり、`this.warn` は Vite のログに出て harness の `logs` に届かないので、466 行目からの `expect(logs)` は止められています。同じ形が 4 つの警告の it にあります。

📄 `angular-cli/packages/angular/build/src/builders/unit-test/tests/options/watch_spec.ts` L33–57 （▶ の行: 36, 39, 41, 43–44, 48, 54）

```ts
33 │     it('should re-run tests when a file changes when watch is true', async () => {
34 │       harness.useTarget('test', {
35 │         ...BASE_OPTIONS,
36 ▶         watch: true,
37 │       });
38 │ 
39 ▶       await harness.executeWithCases([
40 │         async ({ result }) => {
41 ▶           expect(result?.success).toBeTrue();
42 │ 
43 ▶           await harness.writeFiles({
44 ▶             'src/app/app.component.spec.ts': `
45 │               import { describe, expect, test } from 'vitest'
46 │               describe('AppComponent', () => {
47 │                 test('should create the app', () => {
48 ▶                   expect(true).toBe(false);
49 │                 });
50 │               });`,
51 │           });
52 │         },
53 │         ({ result }) => {
54 ▶           expect(result?.success).toBeFalse();
55 │         },
56 │       ]);
57 │     });
```

watch の spec は、1 回目が通った後に 44 行目で **spec のファイル**を落ちる中身に書き換え、54 行目で 2 回目が失敗することを見ます。[第 4 回](04-vit-executor.md)の記録で見た「spec でないファイル（1 つの spec だけが読むもの・2 つが読むもの）を変えたときにどの spec が走るか」を見る it はありません。

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/vitest/browser-provider_spec.ts` L17–33 （▶ の行: 19, 23, 26–27, 31）

```ts
17 │   beforeEach(async () => {
18 │     // Create a temporary workspace root
19 ▶     workspaceRoot = await mkdtemp(join(tmpdir(), 'angular-cli-test-'));
20 │     await writeFile(join(workspaceRoot, 'package.json'), '{}');
21 │ 
22 │     // Create a mock @vitest/browser-playwright package
23 ▶     const playwrightPkgPath = join(workspaceRoot, 'node_modules/@vitest/browser-playwright');
24 │     await mkdir(playwrightPkgPath, { recursive: true });
25 │     await writeFile(
26 ▶       join(playwrightPkgPath, 'package.json'),
27 ▶       JSON.stringify({ name: '@vitest/browser-playwright', main: 'index.js' }),
28 │     );
29 │     await writeFile(
30 │       join(playwrightPkgPath, 'index.js'),
31 ▶       'module.exports = { playwright: (options) => ({ name: "playwright", options }) };',
32 │     );
33 │   });
```

ブラウザのモードの unit の spec は、19 行目で一時のフォルダを作り、23〜31 行目で `node_modules/@vitest/browser-playwright` の偽物（呼ぶと `{ name, options }` を返すだけ）を書いてから `setupBrowserConfiguration` を呼びます。本物の Playwright を入れずに、`CHROME_BIN` が instance ごとに付くことまでを確かめられるのはこのためです。

spec の無い行に it を足した例が 2 つあります。[第 3 回](03-vit-plugins.md)の `extends: false` には、plugin が 2 回適用されると値が変わる it を足し、2 行を消すと `expected 2 to be 1` で落ちることを確かめました。[第 4 回](04-vit-executor.md)の Karma の `karma-coverage` は、origin/main の 77fb7fa0f2 が足した `runners/karma/index_spec.ts` を 44129f66a3 に置くと 1 つ落ち、33 行目を直すと 2 つとも通りました。どちらも作業木の中だけで、使い終えた作業木は `git worktree remove --force` で消しました。

## 5. issue と PR

> **🧪 DEMO — issue と PR を章でふるい分ける**
>
> 2026-11-17 に gh で読んだもの（読むだけ）。日付は開いた日です。schematics の `refactor-jasmine-vitest` など、unit-test builder の外のものは入れていません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/vit-tests-issues)

開いている issue の多くは「Vitest の機能を ng test から使いたい」という要望です（`--update` の #32218、`--changed` の #32343、IDE から使う API の #32182）。11 月 16 日に merge された PR #34717 は、`runnerArgs` option で Vitest の CLI の引数の一部（`--update`・`--bail`・`--disableConsoleIntercept`・`--shard` など）を通します。PR の説明によれば、Vitest の引数の解析器は知らない引数も受け付けるので、builder の側で許す一覧と照らし、builder の option と重なる `--reporter` や `--coverage` は builder の option を使うように言って失敗させます。#32218 と #32726 はまだ開いたままです。

## 6. origin/main の続き

44129f66a3（2026-09-10）から手元の origin/main（8b26efa1ba、2026-11-13）までに、`builders/unit-test` を変えたコミットは 27 本です。spec は 13 のファイルで足されたり変わったりしています（`plugins_spec.ts`・`karma/index_spec.ts`・`library-target_spec.ts`・`polyfills_spec.ts` は新しいファイル）。

| 章 | コミット（日付） | 中身 |
| --- | --- | --- |
| 第 1 回 | 5e05373507（09-22）・7714a85375（10-13）・01afbf418c（10-13）・462c7a756b（09-29、docs） | include したテストだけをコンパイルする（#34089）、絞ったときの NgModule の救済、見つけた順を並べ替える（#34335） |
| 第 2 回 | feb41cc934（09-23）・d09f98ee70（09-24）・ce57763985（09-29）・c5b8bf0369（09-30）・5ffed3f3b6（10-02）・4951994f64（10-13） | unit-test の `polyfills` option、zone.js を polyfills に足す形へ（#33324）、`angular:compiler-init`、library の builder、キャッシュの場所、出力の書き出しをまとめる |
| 第 3 回 | cea7febe52（09-22）・f0a74e8f0e（10-12）・70c2143c33（10-20）・eb38ef3904（10-22）・be517539f4（11-13） | coverage の時の setupFiles（#34142）、fsModuleCache を切って戻す（#34443）、Istanbul を勧める文言、root の別名 |
| 第 4 回 | 39d230e186（10-12）・f9325ab02d（10-21）・77fb7fa0f2（10-28）・cd3d30c6b6（10-28）・e6c29bde19（10-29） | Vite の監視を切り続ける、provider の文言、Karma の 3 つ |
| spec と文言 | 5e0fd4f134・0306faf9e4（10-12）・13a7346493（10-19）・5be930a04b（10-18）・2ebb5e15ca（10-30）・af2b354333・412b9c4f9b（10-29） | fsModuleCache の spec、watch の spec で書き込みを待つ、誤字、schema の説明、e2e |

gh で見ると、手元の origin/main の後の 11 月 16 日にも、PR #34718（別名の root で watch の 2 回目のパスを付け替える）と PR #34717（`runnerArgs`）が merge されています。手元の git には無いので、ここでは PR の説明だけを書きました。

## このシリーズで見つけたもの

書きながら記録と作業木で見つけたものです。本家の行と、再現に使った記録を書きます。「既存の issue / PR」は 2026-11-17 に gh で検索した結果（読むだけ）です。

| ソースの行 | 見つけたこと | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| `test-discovery.ts findTests 57〜58 行目` | exclude は glob の include にしか効かず、spec のパスを直に書くと外れない | --include src/app/greet.spec.ts --exclude '\*\*/greet.spec.ts' で 2 つのテストが走り、終了コード 0（第 1 回の記録） | 見つからない | 第 1 回 6 節 |
| `test-discovery.ts 117・194 行目と 22 行目のコメント` | entry の名前は 128 文字に縮めた後に接頭辞が付くので、128 文字を超える | 202 文字の名前が spec- 付きで 133 文字（第 1 回の記録） | 見つからない | 第 1 回 7 節 |
| `test-discovery.ts 187 行目のコメント` | 「SHA256 の 8 文字」だが、198 行目の calculateHash は xxhash（cda8830710 から） | 22.1.7 の名前は sha256 と一致、44129f66a3 では変わる | 見つからない | 第 1 回 7 節 |
| `plugins.ts 234 行目` | config.plugins を消しても、root の Vite には利用者の plugin が残る | runnerConfig の記録で demo-user-plugin が root の 21 番目にも入った | 見つからない | 第 3 回 4 節 |
| `plugins.ts の projectDefaults と projectOverrides の extends: false` | vitest 5 で plugin が 2 回適用されるのを止める 2 行に spec が無い | 作業木で消すと 104 specs が通る。足した it は expected 2 to be 1 で落ちる | 8504cfffcf（spec なし） | 第 3 回 5 節 |
| `runner-config-vitest_spec.ts 400・432・465・497 行目` | 4 つの警告の it は文言の expect がコメントのまま | plugins.ts の 209 行目を消しても通る | 0aab1158d6 からの TODO | 第 3 回 4 節 |
| `plugins.ts 565 行目と Vite の mergeConfig` | Set で重複を消しても、root の設定と混ぜた後に exclude が重複する | --coverage + runnerConfig の記録で src/app/label.ts が 2 回 | 見つからない | 第 3 回 7 節 |
| `executor.ts 191 行目` | テストが落ちても理由の文言が All tests passed. のまま | NG\_TEST\_LOG=1 で落ちる spec を走らせると success: false. Reason: All tests passed. | 見つからない | 第 4 回 6 節 |
| `executor.ts 196〜201 行目と runners/vitest/index.ts 29〜33 行目` | runnerConfig で依存の確認を飛ばすと、provider の package が無い exitCode 1 を threshold の不足と読む | --coverage --runner-config で Reason: Test run failed due to unmet coverage thresholds.（テストは 0 本） | 見つからない | 第 4 回 6 節 |
| `executor.ts 210〜241 行目と vitest の startVitest の finally` | --watch=false の 1 回目の close には timeout がかからない | 記録で close が 2 回、2 回目は 1 ms 以内。timeout を 1 ms にしても警告が出ない | #32832 の本文が触れている（95510511d9 で閉じた） | 第 4 回 4 節 |
| `executor.ts 138 行目と vitest の SIGINT の扱い` | watch を Ctrl+C で止めると、テストが落ちていても終了コード 0。asyncDispose も呼ばれない | SIGINT から 41 ms で終了コード 0、Disposing の行なし | 見つからない | 第 4 回 4 節 |
| `browser-provider.ts 148 行目` | runnerConfig のときの文言が "playwright" or "webdriverio" で、要る package と違う | --browsers=chromium --runner-config の記録 | origin/main の f9325ab02d（PR #34442）で直った | 第 4 回 8 節 |
| `runners/karma/index.ts 33 行目` | coverage はいつもオブジェクトなので、karma-coverage をいつも要求する | origin/main の index\_spec.ts を 44129f66a3 に置くと 1 つ落ちる | origin/main の 77fb7fa0f2（PR #34500）で直った | 第 4 回 9 節 |
| `runner-config-vitest_spec.ts 167 行目の it` | 1 回目に落ち、flaky = True の 2 回目で通った | unit-test\_integration\_tests の shard 4（Expected false to be true.） | 見つからない | この章 3 節 |

ほかに、spec が無いと各章で書いた行は、[第 1 回](01-vit-discovery.md)の `DependencyChecker`・大文字と小文字の扱い・`preserveSymlinks` を継ぐ行、[第 2 回](02-vit-build.md)の `adjustOutputHashing`・renderer・`findVitestBaseConfig`（`build-options.ts` と `configuration.ts` に `_spec.ts` が無い）、[第 3 回](03-vit-plugins.md)の `determineCoverageProvider`（export されていない）、[第 4 回](04-vit-executor.md)の後片付けの timeout です。

## 聞かれそうな質問

**Q. unit-test builder の spec を 1 本だけ走らせるには？**

`pnpm bazel test //packages/angular/build:unit-test_integration_tests --test_arg=--filter=<describe か it の名前>` です。5 つの shard のどれかに入るので、ほかの shard は 0 件で PASSED になります。`Ran 1 of 105 specs` のような行で数を確かめます（4 節の足した it）。

**Q. spec の中の Vitest は、サイトや手元のプロジェクトと同じ版ですか？**

違います。bazel の deps（1 節の 272 行目）は angular-cli の `package.json` の `vitest` 5.0.0 で、このシリーズの記録は、記録したときのサイトの vitest 4.1.11 です。`extends: false` の it が vitest 5 でしか落ちないのはこのためです（[第 3 回](03-vit-plugins.md)）。

**Q. zoneless のアプリのテストは spec で確かめられていますか？**

一部だけです。harness の build の target は 98 行目で zone.js を polyfills に入れるので、ほとんどの spec は zone.js ありで走ります。`polyfills: []` を渡す `vitest-zone-init_spec.ts` の 44 行目の it などが zoneless の道です。

**Q. ブラウザのモードや Istanbul は、どこで確かめていますか？**

bazel の統合の target には provider も `@vitest/coverage-istanbul` も無いので（1 節の 271〜273 行目）、`tests/e2e/tests/vitest/` の e2e と、偽物の provider で関数を呼ぶ `browser-provider_spec.ts`（4 節）です。

**Q. flaky な spec は放っておいてよいのですか？**

target に `flaky = True` があるので（326 行目）、bazel は落ちた shard をもう一度走らせて、2 回目が通れば PASSED にします。今回の 1 回目の失敗（167 行目の it）は、`--flaky_test_attempts=1` で全部を走らせた 2 回では出ていません。

## 読み終えて

- 統合の spec は `tests/` の 30 ファイル・104 specs（pending 9）で、5 つの shard に分かれ、harness の上で本物の application builder と Vitest 5 を動かす。
- harness の build の target は zone.js ありが既定で、bazel の deps には Istanbul とブラウザの provider が無い。
- 4 つの警告・`extends: false`・Istanbul を選ぶ条件・後片付けの timeout・spec でないファイルの変更での走り直しは、行を変えても spec が落ちない。
- 開いている issue は「Vitest の機能を ng test から使いたい」が多く、11 月の `runnerArgs` がその一部に答えている。

---

← 前: [executor とブラウザ：Vitest を起動し、watch し、後片付けする](04-vit-executor.md)  
次: [入口と Karma の設定：options の正規化・テストを探す・Karma の設定を作る](../kar/01-kar-entry.md) →
