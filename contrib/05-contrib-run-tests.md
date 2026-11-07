[目次](../README.md) › [コントリビュートの道](README.md) › 第 5 回 / 全 15 回

# テストを 1 本走らせる：bazel test と fit・--test\_filter

> bazel test でターゲットを走らせ、dist/testlogs の test.log と test.xml で結果を読む流れ。Node（domino）で走るテストとブラウザ（Web Test Runner）で走るテストの違い、1 つの it だけを走らせる --test\_arg=--filter=（--test\_filter は効かない）と fit / fdescribe、--test\_output=streamed、--config=debug、ibazel による保存のたびの再実行。実際に packages/forms のテストを走らせた出力。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-run-tests)

---

`packages/forms` のテストを実際に走らせ、出力のどこを読むか、ログがどこに残るか、1 つの `it` だけを走らせるにはどうするかを確かめます。Node で走るテストとブラウザで走るテストは何が違うのか、`fit` / `fdescribe` と `--test_arg=--filter=` のどちらを使うのか、`--test_filter` がこのリポジトリでは効かないこと（実際に走らせて確かめた）、`--config=debug` の中身、ibazel での繰り返しまでを扱います。

読む対象は ../angular の `contributing-docs/building-and-testing-angular.md`・`contributing-docs/building-with-bazel.md`・`contributing-docs/debugging-tips.md`・ `.bazelrc`・`tools/testing/*.init.mts`・`tslint.json` と、テストを走らせている Jasmine（`node_modules/jasmine`・`node_modules/jasmine-core`）です。

1. [1. 全体像](01-contrib-overview.md)
2. [2. リポジトリの地図](02-contrib-repo-map.md)
3. [3. 手元の準備](03-contrib-setup.md)
4. [4. Bazel の読み方](04-contrib-bazel.md)
5. 5. テストを走らせる
6. [6. spec の読み方](06-contrib-reading-specs.md)
7. [7. テストを書く](07-contrib-writing-a-test.md)
8. [8. 公開 API と golden](08-contrib-public-api.md)
9. [9. コミットメッセージ](09-contrib-commit-messages.md)
10. [10. PR が通るまで](10-contrib-pr-flow.md)
11. [11. ブランチとリリース](11-contrib-branches.md)
12. [12. issue の仕分け](12-contrib-triage.md)
13. [13. コードの書き方](13-contrib-coding-standards.md)
14. [14. 手元で確かめる](14-contrib-debugging.md)
15. [15. 最初の PR](15-contrib-first-pr.md)

## 0. 全体の流れ

1. **ターゲットを決める**

   直したファイルを含むテストのターゲット（[第 4 回](04-contrib-bazel.md)の `attr(srcs, …)`）。forms なら `//packages/forms/test:test`（1 節）。
2. **bazel test で走らせる**

   結果は 1 行の `PASSED` / `FAILED`。詳しくは `dist/testlogs/…/test.log`（2 節）。
3. **Node かブラウザかを選ぶ**

   `:test` は Node と domino、`:test_web` は本物の Chromium と Firefox（3 節）。
4. **絞る**

   `--test_arg=--filter=` で名前の正規表現に当たる spec だけ。`--test_filter` は効かない（4 節）。`fit` は手元だけ（5 節）。
5. **止めて調べる**

   `--config=debug` で Node の inspector に接続（6 節）。
6. **PR の前に広く**

   文書は `pnpm test //packages/...` を求める。CI は Linux で `//...` を走らせる（質問の節）。

## 1. 文書が求めるテストの走らせ方

📄 `angular/contributing-docs/building-and-testing-angular.md` L117–130 （▶ の行: 119, 124–125, 127–128, 130）

```md
117 │ ## Running Tests Locally
118 │ 
119 ▶ Bazel is used as the primary tool for building and testing Angular.
120 │ 
121 │ To see how to run and debug Angular tests locally please refer to the
122 │ Bazel [Testing Angular](./building-with-bazel.md#testing-angular) section.
123 │ 
124 ▶ Note that you should execute all test suites before submitting a PR to
125 ▶ GitHub (`pnpm test //packages/...`).
126 │ 
127 ▶ However, affected tests will be executed on our CI infrastructure. So if you forgot to run some
128 ▶ affected tests which would fail, GitHub will indicate the error state and present you the failures.
129 │ 
130 ▶ PRs can only be merged if the code is formatted properly and all tests are passing.
```

📄 `angular/contributing-docs/building-with-bazel.md` L47–64 （▶ の行: 49–51, 57–58, 60–61, 63–64）

```md
47 │ ## Testing Angular
48 │ 
49 ▶ - Test package in node: `pnpm test packages/core/test:test`
50 ▶ - Test package in karma: `pnpm test packages/core/test:test_web`
51 ▶ - Test all packages: `pnpm test packages/...`
52 │ 
53 │ The ellipsis in the examples above are not meant to be substituted by a package name, but
54 │ are used by Bazel as a wildcard to execute all tests in the specified path. To execute all the tests for a
55 │ single package, the commands are (exemplary):
56 │ 
57 ▶ - `pnpm test //packages/core/...` for all tests, or
58 ▶ - `pnpm test //packages/core/test:test` for a particular test suite.
59 │ 
60 ▶ Bazel very effectively caches build results, so it's common for your first time building a target
61 ▶ to be much slower than subsequent builds.
62 │ 
63 ▶ You can use [ibazel] to run in a "watch mode" that continuously
64 ▶ keeps the outputs up-to-date as you save sources.
```

49 行目が Node のテスト、50 行目がブラウザのテストです。`pnpm test` は package.json の `"test": "bazelisk test"`（[第 2 回](02-contrib-repo-map.md)で読んだ scripts）なので、`npx -y pnpm@12.3.4 bazel test …` と同じものが走ります。この章では `bazel test` の形で書きます。124〜125 行目、PR を出す前に `//packages/...` を全部走らせるよう求めていますが、127〜128 行目のとおり、影響のあるテストは CI でも走ります。60〜61 行目のとおり、最初の 1 回は遅く（このマシンで 2 分 31 秒、[第 3 回](03-contrib-setup.md)の 7 節）、2 回目からはキャッシュで速くなります。

> [!WARNING]
> **ハマりどころ**
>
> 50 行目の「karma」は古い記述です。今の `test_web` は Web Test Runner（`@rules_browsers` の `wtr_test`）で走ります。[第 4 回](04-contrib-bazel.md)の 5 節で、`test_web` が `test_web_chromium` と `test_web_firefox` をまとめた `test_suite` であることを query で確かめました。

## 2. 走らせて、出力を読む

```
$ npx -y pnpm@12.3.4 bazel test //packages/forms/test:test --test_output=errors
INFO: Analyzed target //packages/forms/test:test (0 packages loaded, 0 targets configured).
[29 / 30] Testing //packages/forms/test:test; 1s darwin-sandbox
INFO: Found 1 test target...
Target //packages/forms/test:test up-to-date:
  dist/bin/packages/forms/test/test_/test
INFO: Elapsed time: 3.308s, Critical Path: 2.65s
INFO: 4 processes: 6 action cache hit, 1 internal, 2 darwin-sandbox, 1 worker.
INFO: Build completed successfully, 4 total actions
//packages/forms/test:test                                               PASSED in 1.5s

Executed 1 out of 1 test: 1 test passes.
```
*2 回目以降の実行（このマシン）。テストのアクションだけが走り、残りはキャッシュから出た。*

1. **Analyzed target … (0 packages loaded)**

   BUILD.bazel を読み直す必要がなかった、という意味です。BUILD.bazel を変えると、ここで読み直しが起きます。
2. **Target … up-to-date: dist/bin/packages/forms/test/test\_/test**

   テストの実行ファイル（Jasmine を起動するスクリプト）の場所です。
3. **4 processes: 6 action cache hit**

   実際に走ったのは 4 つ。`test_lib` のコンパイルなどはキャッシュから出ました。
4. **//packages/forms/test:test PASSED in 1.5s**

   結果の本体はこの 1 行です。Jasmine の出力そのものは、成功したときは表示されません。

失敗すると、こうなります（[第 7 回](07-contrib-writing-a-test.md)で実装をわざと壊したときの出力）。

```
$ npx -y pnpm@12.3.4 bazel test //packages/forms/test:test --test_output=errors
…
Failures:
1) FormControl reset() should not emit a FormResetEvent when emitEvent is false
  Message:
    Expected true to be false.
  Stack:
        at <Jasmine>
        at UserContext.<anonymous> (./packages/forms/test/form_control_spec.ts:882:73)

2) reactive forms integration tests unified form state change formControl should not emit an event when resetting it with emit:false
  Message:
    Expected 1 to be 0.
  …(./packages/forms/test/reactive_integration_spec.ts:1625:31)

1154 specs, 2 failures
Finished in 0.54 seconds
Randomized with seed 46584 (jasmine --random=true --seed=46584)
================================================================================
//packages/forms/test:test                                               FAILED in 1.5s
  /private/var/tmp/_bazel_<you>/d22ee183…/execroot/_main/bazel-out/darwin_arm64-fastbuild/testlogs/packages/forms/test/test/test.log

Executed 1 out of 1 test: 1 fails locally.
```
*--test\_output=errors（.bazelrc の既定）なので、失敗したテストの出力だけが表示される。最後の行がログの実体の場所。*

`.bazelrc` に `test --test_output=errors` があるので（[第 4 回](04-contrib-bazel.md)の 6 節で引用）、失敗したときだけ Jasmine の出力が出ます。最後の `FAILED in 1.5s` の下の行がログのファイルで、同じものに `dist/testlogs/` からたどれます。

```
$ ls dist/testlogs/packages/forms/test/test/
test.cache_status  test.log  test.outputs  test.outputs_manifest  test.raw_splitlogs  test.xml
$ head -5 dist/testlogs/packages/forms/test/test/test.log
exec ${PAGER:-/usr/bin/less} "$0" || exit 1
Executing tests from //packages/forms/test:test
-----------------------------------------------------------------------------
Randomized with seed 53356
Started
$ head -c 200 dist/testlogs/packages/forms/test/test/test.xml
<?xml version="1.0" encoding="UTF-8" ?>
<testsuites disabled="0" errors="0" failures="0" tests="1153" time="0.043">
 <testsuite name="Form Builder" … tests="25" skipped="0" disabled="0" failures="0">
```
*テストのログの置き場所。test.xml は JUnit 形式の結果（tests="1153"）。*

パスの形は `dist/testlogs/<パッケージ>/<ターゲット名>/test.log` です。`test.xml` には spec ごとの成否が入るので、「何本走ったか」は `tests="1153"` で確かめられます。どちらも次の実行で上書きされます。

## 3. Node で走るテストと、ブラウザで走るテスト

同じ `test_lib`（[第 4 回](04-contrib-bazel.md)）を、2 つの環境で走らせます。違いは、spec より先に読ませる初期化ファイルです。

📄 `angular/tools/testing/node_zoneless_tests.init.mts` L8–30 （▶ の行: 10–11, 13, 17, 19, 22, 26–28）

```ts
 8 │ import 'reflect-metadata';
 9 │ 
10 ▶ (global as any).isNode = true;
11 ▶ (global as any).isBrowser = false;
12 │ 
13 ▶ import '@angular/compiler'; // For JIT mode. Must be in front of any other @angular/* imports.
14 │ // Init TestBed
15 │ import {TestBed} from '@angular/core/testing';
16 │ import {NgModule, provideZonelessChangeDetection} from '@angular/core';
17 ▶ import {ServerTestingModule, platformServerTesting} from '@angular/platform-server/testing';
18 │ import {ɵDominoAdapter as DominoAdapter} from '@angular/platform-server';
19 ▶ import domino from '../../packages/platform-server/third_party/domino/bundled-domino';
20 │ 
21 │ @NgModule({
22 ▶   providers: [provideZonelessChangeDetection()],
23 │ })
24 │ export class TestModule {}
25 │ 
26 ▶ TestBed.initTestEnvironment([ServerTestingModule, TestModule], platformServerTesting());
27 ▶ DominoAdapter.makeCurrent();
28 ▶ (global as any).document =
29 │   (DominoAdapter as any).defaultDoc ||
30 │   ((DominoAdapter as any).defaultDoc = domino.createDocument());
```

📄 `angular/tools/testing/browser_zoneless_tests.init.mts` L9–30 （▶ の行: 14, 19, 23–25, 28–29）

```ts
 9 │ import 'reflect-metadata';
10 │ 
11 │ import '@angular/compiler'; // For JIT mode. Must be in front of any other @angular/* imports.
12 │ 
13 │ import {TestBed} from '@angular/core/testing';
14 ▶ import {BrowserTestingModule, platformBrowserTesting} from '@angular/platform-browser/testing';
15 │ import {NoopAnimationsModule} from '@angular/platform-browser/animations';
16 │ import {NgModule, provideZonelessChangeDetection} from '@angular/core';
17 │ 
18 │ @NgModule({
19 ▶   providers: [provideZonelessChangeDetection()],
20 │ })
21 │ export class TestModule {}
22 │ 
23 ▶ TestBed.initTestEnvironment(
24 ▶   [BrowserTestingModule, NoopAnimationsModule, TestModule],
25 ▶   platformBrowserTesting(),
26 │ );
27 │ 
28 ▶ (window as any).isNode = false;
29 ▶ (window as any).isBrowser = true;
30 │ (window as any).global = window;
```

|   | `:test`（Node） | `:test_web_*`（ブラウザ） |
| --- | --- | --- |
| DOM | domino（JavaScript で書いた DOM の実装）。node\_zoneless\_tests.init.mts 19 行目・27 行目 | 本物の Chromium / Firefox |
| TestBed のプラットフォーム | `platformServerTesting()`（26 行目） | `platformBrowserTesting()`（browser\_zoneless\_tests.init.mts 25 行目） |
| 変更検知 | `provideZonelessChangeDetection()`（どちらも 22 行目 / 19 行目） |   |
| 見分ける目印 | `isNode = true`（10 行目） | `isBrowser = true`（29 行目） |
| 速さ | 1153 specs で 1〜2 秒（このマシン） | ブラウザの起動と取得のぶん遅い（この章では走らせていない） |

spec の中には、Node では意味のないテストを飛ばすものがあります。

📄 `angular/packages/forms/test/value_accessor_integration_spec.ts` L219–230 （▶ の行: 222）

```ts
219 │   describe('select controls', () => {
220 │     describe('in reactive forms', () => {
221 │       it(`should support primitive values`, async () => {
222 ▶         if (isNode) return;
223 │         const fixture = initTest(FormControlNameSelect);
224 │         await fixture.whenStable();
225 │ 
226 │         // model -> view
227 │         const select = fixture.debugElement.query(By.css('select'));
228 │         const sfOption = fixture.debugElement.query(By.css('option'));
229 │         expect(select.nativeElement.value).toEqual('SF');
230 │         expect(sfOption.nativeElement.selected).toBe(true);
```

222 行目、`<select>` の値の変化のように domino では再現しきれない操作は、`isNode` のとき何もせずに成功扱いで抜けます。つまり `:test` が通っても、この部分はブラウザのテストでしか確かめられていません。DOM に触る変更をしたら `:test_web_chromium` も走らせる、が実務の目安です。

## 4. 1 本だけ走らせる：--test\_filter は効かず、--test\_arg=--filter= が効く

Bazel には `--test_filter` という汎用のオプションがありますが、それを読むかどうかはテストを走らせる側の作り次第です。このリポジトリで試しました。

```
$ npx -y pnpm@12.3.4 bazel test //packages/forms/test:test '--test_filter=^FormControl reset' --test_output=all
…
1153 specs, 0 failures
Finished in 0.511 seconds
Randomized with seed 07938 (jasmine --random=true --seed=07938)
================================================================================
INFO: 4 processes: 3141 action cache hit, 1 internal, 2 darwin-sandbox, 1 worker.
//packages/forms/test:test                                               PASSED in 1.4s
```
*--test\_filter を付けても 1153 specs が全部走った（このマシン、--test\_output=all で全出力を表示）。*

走ったのは 1153 本の全部です。Jasmine の起動役（`@aspect_rules_jasmine` の `jasmine/private/runner.cjs`）は、Bazel が渡す環境変数のうち分割実行（sharding）用の `TEST_TOTAL_SHARDS` などは読みますが、`--test_filter` の値を渡す変数は読んでいません。そこで、Jasmine そのものに引数を渡します。

📄 `angular/node_modules/jasmine/lib/command.js` L103–131 （▶ の行: 103, 108–109, 123–124, 129–130）

```js
103 ▶   for (const arg of argv) {
104 │     if (arg === '--no-color') {
105 │       color = false;
106 │     } else if (arg === '--color') {
107 │       color = true;
108 ▶     } else if (arg.match("^--filter=")) {
109 ▶       filterRegex = arg.match("^--filter=(.*)")[1];
110 │     } else if (arg.match("^--filter-path=(.*)")) {
111 │       const json = arg.match("^--filter-path=(.*)")[1];
112 │       try {
113 │         filterPath = JSON.parse(json);
114 │       } catch {
115 │         usageErrors.push('Invalid filter path: ' + json);
116 │       }
117 │ 
118 │       if (!(filterPath instanceof Array)) {
119 │         usageErrors.push('Invalid filter path: ' + json);
120 │       }
121 │     } else if (arg.match("^--helper=")) {
122 │       helpers.push(arg.match("^--helper=(.*)")[1]);
123 ▶     } else if (arg.match("^--require=")) {
124 ▶       requires.push(arg.match("^--require=(.*)")[1]);
125 │     } else if (arg === '--fail-fast') {
126 │       failFast = true;
127 │     } else if (arg.match("^--random=")) {
128 │       random = arg.match("^--random=(.*)")[1] === 'true';
129 ▶     } else if (arg.match("^--seed=")) {
130 ▶       seed = arg.match("^--seed=(.*)")[1];
131 │     } else if (arg.match("^--config=")) {
```

103 行目、Jasmine の CLI は引数を 1 つずつ見ます。108〜109 行目の `--filter=` が、spec の「フルネーム」（外側の `describe` から `it` までの名前を空白でつないだもの）に当てる正規表現です。123〜124 行目の `--require=` は、[第 4 回](04-contrib-bazel.md)で見た `zoneless_jasmine_test` が init ファイルを読ませるのに使っている引数です。Bazel の `--test_arg=X` は、テストの実行ファイルの引数の最後に X を足すので、Jasmine に `--filter=…` が届きます。

```
$ npx -y pnpm@12.3.4 bazel test //packages/forms/test:test '--test_arg=--filter=^FormControl reset' --test_output=streamed
WARNING: Streamed test output requested. All tests will be run locally, without sharding, one at a time

INFO: Analyzed target //packages/forms/test:test (0 packages loaded, 9 targets configured).
Randomized with seed 53356
Started
.....................

Ran 21 of 1153 specs
21 specs, 0 failures
Finished in 0.02 seconds
Randomized with seed 53356 (jasmine --random=true --seed=53356)
INFO: Found 1 test target...
Target //packages/forms/test:test up-to-date:
  dist/bin/packages/forms/test/test_/test
INFO: Elapsed time: 1.339s, Critical Path: 0.95s
INFO: 2 processes: 31 action cache hit, 1 internal, 1 darwin-sandbox.
//packages/forms/test:test                                               PASSED in 0.9s
```
*--test\_arg=--filter= で、1153 本のうち 21 本だけが走った。--test\_output=streamed で、成功しても Jasmine の出力がその場で出る。*

1. **Ran 21 of 1153 specs**

   `^FormControl reset` に当たる 21 本だけが走りました。名前は 2 節の失敗の出力の `1) FormControl reset() should not emit …` の形で確かめられます。
2. **WARNING: Streamed test output requested …**

   `--test_output=streamed` は、テストを 1 本ずつ、分割せずに走らせ、出力をその場で流します。成功したテストの `console.log` を見たいときに使います。
3. **Randomized with seed 53356**

   Jasmine は spec の順番を毎回入れ替えます。順番によって落ちるテストを再現するときは、129〜130 行目の `--seed=` を `--test_arg=--seed=53356` で渡します。

## 5. fit・fdescribe・xit：コードで絞る

📄 `angular/contributing-docs/debugging-tips.md` L3–15 （▶ の行: 6, 9–12）

```md
 3 │ ## Debugging tests
 4 │ 
 5 │ The Angular project has comprehensive unit tests for the core packages and the tools.
 6 ▶ Packages are tested both in the browser (via Karma) and on the server (via node.js).
 7 │ Angular uses the Jasmine test framework.
 8 │ 
 9 ▶ You can focus your debugging on one test at a time by changing that test to be
10 ▶ defined using the `fit(...)` function, rather than `it(...)`. Moreover, it can be helpful
11 ▶ to place a `debugger` statement in this `fit` clause to cause the debugger to stop when
12 ▶ it hits this test.
13 │ 
14 │ For instructions on debugging both Karma and node.js tests, see
15 │ [Building with bazel](./building-with-bazel.md).
```

9〜12 行目、`it` を `fit` に変えると（f は focus）、その spec だけが走ります。`describe` を `fdescribe` にすれば、その中の全部。`xit` / `xdescribe` は逆に「走らせない」です。書き方はこうです（リポジトリには書いていません）。

📄 `packages/forms/test/form_control_spec.ts（書き方の例）`

```
describe('FormControl', () => {
  describe('reset()', () => {
    fit('should not emit a FormResetEvent when emitEvent is false', () => {   // ← この it だけ走る
      // …
    });
    xit('一時的に止める', () => {                                          // ← 走らない（pending）
      // …
    });
  });
});

fdescribe('Validators', () => {                                           // ← この describe の中が全部走る
  // …
});
```

fit を残したままにすると何が起きるか。Jasmine の側を読みます。

📄 `angular/node_modules/jasmine-core/lib/jasmine-core/jasmine.js` L9991–10005 （▶ の行: 9993–9997, 10004）

```js
 9991 │       let overallStatus, incompleteReason, incompleteCode;
 9992 │ 
 9993 ▶       if (hasFailures || this.#topSuite.hasOwnFailedExpectations()) {
 9994 ▶         overallStatus = 'failed';
 9995 ▶       } else if (this.#getFocusedRunables().length > 0) {
 9996 ▶         overallStatus = 'incomplete';
 9997 ▶         incompleteReason = 'fit() or fdescribe() was found';
 9998 │         incompleteCode = 'focused';
 9999 │       } else if (totalSpecsDefined === 0) {
10000 │         overallStatus = 'incomplete';
10001 │         incompleteReason = 'No specs found';
10002 │         incompleteCode = 'noSpecsFound';
10003 │       } else {
10004 ▶         overallStatus = 'passed';
10005 │       }
```

📄 `angular/node_modules/jasmine/lib/runner_base.js` L554–566 （▶ の行: 556–559）

```js
554 │ RunnerBase.exitCodeForStatus = function(status) {
555 │   switch (status) {
556 ▶     case 'passed':
557 ▶       return 0;
558 ▶     case 'incomplete':
559 ▶       return 2;
560 │     case 'failed':
561 │       return 3;
562 │     default:
563 │       console.error(`Unrecognized overall status: ${status}`);
564 │       return 1;
565 │   }
566 │ };
```

9995〜9997 行目、失敗が 1 つも無くても、focus された spec があれば全体の結果は `passed` ではなく `incomplete` になり、558〜559 行目で終了コード 2 になります。Bazel は 0 以外を失敗とみなすので、`fit` を残したテストは `FAILED` になります。さらに、リポジトリの lint も止めます。

📄 `angular/tslint.json` L62–72 （▶ の行: 64–65, 67–68）

```json
62 │     "semicolon": [true, "always", "ignore-bound-class-methods"],
63 │     "variable-name": [true, "ban-keywords"],
64 ▶     "no-debugger": true,
65 ▶     "ban": [
66 │       true,
67 ▶       {"name": "fdescribe", "message": "Don't keep jasmine focus methods."},
68 ▶       {"name": "fit", "message": "Don't keep jasmine focus methods."},
69 │       {
70 │         "name": ["*", "getMutableClone"],
71 │         "message": "Use a ts.factory.update* or ts.factory.create* method instead."
72 │       },
```

```
$ node_modules/.bin/tslint -c tslint.json focused_spec.ts      # リポジトリの外に置いた試しのファイル
focused_spec.ts:9:1
ERROR: 9:1   ban  Calls to 'fdescribe' are not allowed. Don't keep jasmine focus methods.
ERROR: 10:3  ban  Calls to 'fit' are not allowed. Don't keep jasmine focus methods.
exit=2
$ node_modules/.bin/jasmine focused_spec.js                    # 同じ形の .js を Jasmine で直接
Ran 1 of 3 specs
1 spec, 0 failures
Incomplete: fit() or fdescribe() was found
exit=2
```
*リポジトリの外（scratchpad）に置いた試しのファイルで、tslint と Jasmine を直接動かした結果。xit は lint にかからない。*

67〜68 行目の `ban` で `fdescribe` と `fit` の呼び出しはエラー、64 行目で `debugger` 文もエラーです。CI の PR のワークフローは `pnpm tslint` を走らせるので（[第 10 回](10-contrib-pr-flow.md)）、消し忘れは CI でも止まります。`xit` はどちらにもかからず、結果に pending として残るだけなので、コミットの前に自分で消します。

> [!TIP]
> **新卒エンジニアへ**
>
> 手元で絞るなら、ファイルを書き換えない `--test_arg=--filter=` のほうが安全です。`fit` が便利なのは、ブラウザのテストを手で開いて調べるとき（6 節の最後）や、名前に正規表現の記号が多くて filter を書きにくいときです。

## 6. 止めて調べる：--config=debug

📄 `angular/.bazelrc` L1–9 （▶ の行: 4–5, 7–9）

```
1 │ # Disable NG CLI TTY mode
2 │ build --action_env=NG_FORCE_TTY=false
3 │ 
4 ▶ # Enable debugging tests with --config=debug
5 ▶ test:debug --test_arg=--node_options=--inspect-brk --test_output=streamed --test_strategy=exclusive --test_timeout=9999 --nocache_test_results --strategy=TestRunner=standalone
6 │ 
7 ▶ # Do not attempt to de-flake locally.
8 ▶ # On CI we might set this to `3` to run with deflaking.
9 ▶ test --flaky_test_attempts=1
```

1. **--test\_arg=--node\_options=--inspect-brk**

   Node を inspector 付きで起動し、最初の行で止めて接続を待ちます。
2. **--test\_output=streamed**

   出力をその場で流します（4 節）。
3. **--test\_strategy=exclusive**

   他のテストと同時に走らせません。
4. **--test\_timeout=9999**

   ブレークポイントで止まっている間に時間切れにならないよう、制限を長くします。
5. **--nocache\_test\_results**

   キャッシュの結果を使わず、必ず走らせます（止めたいのに `(cached)` で終わるのを防ぐ）。
6. **--strategy=TestRunner=standalone**

   テストのアクションを sandbox に入れず、そのまま（standalone）走らせます。

9 行目の `--flaky_test_attempts=1` は、失敗したテストを手元では再試行しない設定です。7〜8 行目のコメントのとおり CI では 3 にすることがあり、手元で 1 回落ちたら、それはそのまま落ちたと受け取れます。

📄 `angular/contributing-docs/building-with-bazel.md` L66–93 （▶ の行: 71–73, 80–81, 83, 88–89）

```md
66 │ ### Testing with flags
67 │ 
68 │ If you're experiencing problems with seemingly unrelated tests failing, it may be because you're not
69 │ using the proper flags with your Bazel test runs in Angular.
70 │ 
71 ▶ - `--config=debug`: build and launch in debug mode (see [debugging](#debugging) instructions below)
72 ▶ - `--test_arg=--node_options=--inspect=9228`: change the inspector port.
73 ▶ - `--test_tag_filters=<tag>`: filter tests down to tags defined in the `tag` config of your rules in
74 │   any given `BUILD.bazel`.
75 │ 
76 │ ### Debugging a Node Test in Chrome DevTools
77 │ 
78 │ <a id="debugging"></a>
79 │ 
80 ▶ - Open Chrome at: [chrome://inspect](chrome://inspect)
81 ▶ - Click on `Open dedicated DevTools for Node` to launch a debugger.
82 │ - Run your test with the debug configuration,
83 ▶   e.g. `pnpm bazel test packages/core/test:test --config=debug`
84 │ 
85 │ The process should automatically connect to the debugger.
86 │ For more, see the [rules_nodejs Debugging documentation](https://github.com/bazel-contrib/rules_nodejs/blob/stable/docs/debugging.md).
87 │ 
88 ▶ - Click on "Resume script execution" to let the code run until the first `debugger` statement or a
89 ▶   previously set breakpoint.
90 │ - If you want to inspect generated template instructions while debugging, find the
91 │   template of your component in the call stack and click on `(source mapped from [CompName].js)` at
92 │   the bottom of the code. You can also disable sourcemaps in Chrome DevTools' options or go to
93 │   sources and look into ng:// namespace to see all the generated code.
```

1. **80〜81 行目：Chrome で chrome://inspect を開く**

   「Open dedicated DevTools for Node」を押して待ち受けます。
2. **83 行目：--config=debug で走らせる**

   `npx -y pnpm@12.3.4 bazel test //packages/forms/test:test --config=debug '--test_arg=--filter=^FormControl reset'`。filter と一緒に使えば、止める前に関係ない spec を走らせずに済みます。
3. **88〜89 行目：再開する**

   最初の行で止まっているので、再開すると `debugger` 文かブレークポイントで止まります。

ブラウザのテストを手で調べる方法も、同じ文書にあります。

📄 `angular/contributing-docs/building-with-bazel.md` L119–133 （▶ の行: 119–120, 128–133）

```md
119 ▶ The easiest way to debug a test for now is to add a `debugger` statement or add a break point
120 ▶ in the code and launch the bazel corresponding test (`pnpm bazel test <target> --config=debug`).
121 │ 
122 │ Bazel will wait on a connection. Go to the debug view (by clicking on the sidebar or
123 │ Apple+Shift+D on Mac) and click on the green play icon next to the configuration name
124 │ (ie `Attach to Process`).
125 │ 
126 │ ### Debugging a Karma Test
127 │ 
128 ▶ - Run test with `_debug` appended to the target name,
129 ▶   e.g. `pnpm bazel run packages/core/test:test_web_debug`.
130 ▶   Every `ng_web_test_suite` target has an additional `_debug` target.
131 ▶ - Open any browser at: [http://localhost:9876/debug.html](http://localhost:9876/debug.html)
132 ▶ - Open the browser's DevTools to debug the tests (after, for example, having focused on specific
133 ▶   tests via `fit` and/or `fdescribe` or having added `debugger` statements in them)
```

128〜129 行目の `_debug` の付いたターゲットは今もあります（[第 4 回](04-contrib-bazel.md)の query の `test_web_debug`、`manual` の印付き）。ただし中身は Karma ではなく Web Test Runner の manual モードで、`@rules_browsers` の `wtr/wtr.config.mjs` は manual モードのときポートを 9876 にします。131 行目の `debug.html` という URL は Karma のもので、今の構成で同じ URL かはこの章では確かめていません。起動したときの表示に従ってください。132〜133 行目のとおり、手で開くときは `fit` / `fdescribe` で絞っておくと探しやすくなります。

## 7. 保存のたびに走らせる：ibazel

1 節の 63〜64 行目の ibazel（Bazel のファイル監視版）は、`@bazel/ibazel` として `pnpm install` で入ります（[第 3 回](03-contrib-setup.md)の 3 節）。`bazel` と同じく、`npx -y pnpm@12.3.4 ibazel test //packages/forms/test:test '--test_arg=--filter=^FormControl reset'` の形で、入力のファイルが保存されるたびに同じテストを走らせ直します。止めるときは Ctrl+C です（この章では起動していません）。

## 8. コマンドを組み立てる

> **🧪 DEMO — bazel test のコマンドを組み立てる**
>
> この章で確かめた規則を小さな関数で再現したものです。何も実行しません。表示されたコマンドを、../angular の直下で打ってください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-run-tests)

## ここまでを 1 本に

- 👤 `bazel test //packages/forms/test:test '--test_arg=--filter=^FormControl reset'` — あなたのコマンド
  - `.bazelrc` — test --flaky\_test\_attempts=1、test --test\_output=errors などを足す
  - `dist/bin/packages/forms/test/test_/test` — テストの実行ファイル — *Node 24.21.0（MODULE.bazel）で起動*
    - `jasmine` — fixed\_args の spec のパターン + --require=node\_zoneless\_tests.init.mjs + --filter=…
      - `node_zoneless_tests.init.mts` — TestBed を platformServerTesting と domino で初期化
      - `*_spec.js` — 名前が ^FormControl reset に当たる 21 本だけ実行
    - `終了コード` — passed 0 / incomplete（fit あり）2 / failed 3
  - `PASSED / FAILED` — dist/testlogs/packages/forms/test/test/test.log と test.xml

## 聞かれそうな質問

**Q. 手元でテストが通ったのに、CI で落ちました。なぜですか？**

CI は手元とは別の範囲・別の環境で走ります。PR のワークフローの test のジョブは `ubuntu-latest` で `pnpm test:ci`、つまり `//...` から integration・adev などを除いた全部を走らせます（[第 10 回](10-contrib-pr-flow.md)）。よくある違いは 3 つです。(1) 手元で `:test`（Node）だけを走らせ、CI のブラウザのテスト（`:test_web_chromium` / `:test_web_firefox`）で落ちた。3 節の `if (isNode) return;` のように Node では飛ばされる spec があります。(2) 自分のパッケージ以外のテスト、例えば公開 API の golden（[第 8 回](08-contrib-public-api.md)）や、自分の変更に依存する別パッケージのテストが落ちた。[第 4 回](04-contrib-bazel.md)の rdeps で範囲を確かめられます。(3) lint（5 節の `fit` の消し忘れなど）や整形で落ちた。

**Q. テストの結果に (cached) と出て、走っていないようです。**

Bazel は、テストの入力（ソース、依存、テストに渡す引数や環境）が前回と同じなら、テストを走らせずに前回の結果を使い、`//packages/forms/test:test (cached) PASSED in 1.5s` のように表示します。結果は正しいので、ふつうはそのままで構いません。もう一度走らせたいときは `--nocache_test_results` を付けます（.bazelrc 5 行目の `--config=debug` も中で付けています）。引数が変われば入力が変わるので、4 節の実行のように `--test_arg` を変えるだけでも走り直します。

**Q. ブラウザのテストを手元で走らせるには？**

`npx -y pnpm@12.3.4 bazel test //packages/forms/test:test_web_chromium`（Firefox なら `_firefox`、両方なら `:test_web`）です。ブラウザは Bazel（`@rules_browsers`）が取ってくるので、手元に Chrome を入れておく必要はありません。中を見ながら調べたいときは、6 節の `bazel run //packages/forms/test:test_web_debug` で manual モードを起動し、ブラウザで開きます。

**Q. --test\_filter と --test\_arg=--filter=、どちらを使えばいいですか？**

このリポジトリの Jasmine のテストでは `--test_arg=--filter=` です。4 節で実際に試したとおり、`--test_filter` を付けても 1153 本が全部走り、`--test_arg=--filter=^FormControl reset` では 21 本だけが走りました。`--filter=` を読んでいるのは Jasmine の command.js 108〜109 行目です。

**Q. fit を消し忘れてコミットしたらどうなりますか？**

3 か所で止まります。Jasmine は jasmine.js 9995〜9997 行目で結果を `incomplete` にし、runner\_base.js 558〜559 行目で終了コード 2 を返すので、テストは `FAILED`。tslint.json 67〜68 行目の `ban` で lint がエラー。CI の lint のジョブもこれを走らせます。`xit` はどれにもかからないので、自分で消します。

## 読み終えて

- `bazel test <ターゲット>` の結果は 1 行の PASSED / FAILED。中身は `dist/testlogs/<パッケージ>/<名前>/test.log` と `test.xml`。
- `:test` は Node と domino、`:test_web` は Chromium と Firefox。Node では飛ばす spec があるので、DOM に触る変更はブラウザでも走らせる。
- 1 本だけ走らせるのは `--test_arg=--filter=正規表現`。`--test_filter` はこのリポジトリでは効かない（実測）。
- `fit` / `fdescribe` は終了コード 2 と lint で止まる。`xit` は止まらないので自分で消す。
- `--config=debug` は inspect-brk・streamed・exclusive・長い timeout・キャッシュ無効・sandbox の外、のまとめ。

---

← 前: [Bazel の読み方：BUILD.bazel・ターゲット・ラベル](04-contrib-bazel.md)  
次: [spec の読み方：Angular のテストはどう書かれているか](06-contrib-reading-specs.md) →
