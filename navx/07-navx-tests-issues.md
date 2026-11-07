[目次](../README.md) › [Navigation API と FakeNavigation](README.md) › 第 7 回 / 全 7 回

# spec と issue を読む：Navigation API の連携の今

> primitives/dom-navigation/testing の spec、router と common の spec の分け方と手元での走らせ方。Navigation API に関係する issue（開いている #71596 ほか）と閉じた issue の表、どの issue がこのシリーズのどの章の行に関係するか。実験的な機能が、取り消しとやり直しを重ねて固まっていく様子。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/navx-tests-issues)

---

シリーズの最後に、Navigation API と FakeNavigation に関わる spec がどこにあり、どう分かれ、手元でどう走らせるのかを確かめます。そのうえで、関係する issue をこのシリーズの章に振り分け、2025-06 以降にこの部分を変えたコミット 55 本を数えて、実験的な機能が取り消しとやり直しを重ねて固まっていく様子を読みます。

読む対象は `packages/core/primitives/dom-navigation/testing/test/`、`packages/router/test/` の 2 つの spec と integration の spec、`packages/common/test/navigation/`、それぞれの `BUILD.bazel` です。Bazel のターゲットの読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせるやり方は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. 型と PlatformNavigation](01-navx-api-types.md)
2. [2. FakeNavigation の navigate](02-navx-fake-navigate.md)
3. [3. 戻る・進む](03-navx-fake-traverse.md)
4. [4. precommitHandler](04-navx-precommit.md)
5. [5. Router の連携の残り](05-navx-router-integration.md)
6. [6. テストの土台](06-navx-testing.md)
7. **7. spec と issue**（この章）

## 1. spec の地図

ファイルごとの describe（括弧は行）と、`it(` で始まる行の数（grep で数えたもの）、実際に走った数です。走った数は 2026-11-07 に `--test_arg=--filter=…` で名前を絞って「Ran N of … specs」を読んだものです（scratchpad/nav-logs/b-\*.log）。

| ファイル（packages/ の下） | 行数 | describe と it の数 | it の行 | Node | ブラウザ | 章 |
| --- | --- | --- | --- | --- | --- | --- |
| `core/primitives/dom-navigation/testing/test/fake_platform_navigation.spec.ts` | 2189 | navigation（31）› navigate（148）35・traversal（914）21・integration（1413）2・history API（1514）27・redirect（2128）5・直下 1 | 91 | 91 | Chromium 91・Firefox 91 | 第 2〜4 回 |
| `common/test/navigation/navigation_spec.ts` | 25 | Navigation（13） | 2 | 2 | （common 全体で 678 件の中） | 第 6 回 |
| `router/test/with_platform_navigation.spec.ts` | 452 | withPlatformNavigation feature（47）14・configuration error（388）1・real platform navigation（398）2 | 17 | 15 | Chromium は 17、Firefox は 15 | 第 4〜6 回 |
| `router/test/computed_state_restoration.spec.ts` | 560 | for (browserAPI of \['navigation', 'history'\]) › canceledNavigationResolution: 'computed' with …（34） | 16 | 18 × 2 | （router 全体の中） | 第 4・6 回 |
| `router/test/integration/*.spec.ts` | — | for (browserAPI of \['navigation', 'history'\]) › ${browserAPI}-based routing（integration.spec.ts 79） | — | 269 × 2 | （router 全体の中） | 第 6 回 |

- **FakeNavigation そのものの spec は 1 ファイル**で、91 件が一番外の `navigation` の下に入っています。数が多いのは `navigate`（35）と `history API`（27、`pushState`・`replaceState` を通る場合）です。Node・Chromium・Firefox で同じ 91 件でした。
- **with\_platform\_navigation.spec.ts は 17 の it の行が、Node では 15、Chromium では 17、Firefox では 15 になります**。`real platform navigation` の 2 つは `window.navigation` があり Firefox でないときだけ作られるからです（[第 5 回](05-navx-router-integration.md)のテストの節）。router の Chromium の合計が Firefox より 2 多いのはこのためです。
- **computed\_state\_restoration.spec.ts は 16 の it の行から、1 つの API で 18 件**。`urlUpdateStrategy` の 2 つで回す `for` の中に it が 2 つあるからです。それを `'navigation'` と `'history'` で 2 回作ります（[第 6 回](06-navx-testing.md)の 5 節）。
- integration の spec は、同じ 269 件を 2 つの API で走らせます（3 節）。Navigation API の側の不具合の多くは、まずここで同じ期待を満たすかで確かめられます。

## 2. BUILD.bazel：同じ test\_lib を Node とブラウザで

📄 `angular/packages/core/primitives/dom-navigation/testing/test/BUILD.bazel` L1–27 （▶ の行: 1, 4, 6–7, 11, 16–17, 20, 23–24, 26）

```python
 1 ▶ load("//tools:defaults.bzl", "ts_project", "zoneless_jasmine_test", "zoneless_web_test_suite")
 2 │ 
 3 │ ts_project(
 4 ▶     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob(
 7 ▶         ["**/*.ts"],
 8 │     ),
 9 │     visibility = ["//:__pkg__"],
10 │     deps = [
11 ▶         "//packages/core/primitives/dom-navigation/testing",
12 │         "//packages/private/testing",
13 │     ],
14 │ )
15 │ 
16 ▶ zoneless_jasmine_test(
17 ▶     name = "test",
18 │     data = [
19 │         ":test_lib",
20 ▶     ],
21 │ )
22 │ 
23 ▶ zoneless_web_test_suite(
24 ▶     name = "test_web",
25 │     deps = [
26 ▶         ":test_lib",
27 │     ],
```

1. **3〜14 行目：`test_lib` は、ディレクトリの `**/*.ts`（6〜8 行目）をまとめる**

   依存は 11 行目の `//packages/core/primitives/dom-navigation/testing` と、`timeout` などの共通の道具の `//packages/private/testing` だけです。FakeNavigation は Angular の DI を使わないので、`@angular/core` にも依存しません。
2. **16〜21 行目：`zoneless_jasmine_test` の `test` が Node で走らせる**

   20 行目で `":test_lib"` を `data` として受け取ります。`--test_arg=--filter=…` が効くのはこちらです。
3. **23〜27 行目：`zoneless_web_test_suite` の `test_web` がブラウザで走らせる**

   実際のターゲットは `test_web_chromium` と `test_web_firefox` の 2 つになります。絞り込みは効きません（5 節）。

📄 `angular/packages/router/test/BUILD.bazel` L1–45 （▶ の行: 3, 7, 16, 21, 28, 33, 40）

```python
 1 │ load("//tools:defaults.bzl", "ts_config", "ts_project", "zoneless_jasmine_test", "zoneless_web_test_suite")
 2 │ 
 3 ▶ ts_config(
 4 │     name = "tsconfig_test",
 5 │     src = "tsconfig-test.json",
 6 │     deps = [
 7 ▶         "//:node_modules/@types/dom-navigation",
 8 │         "//packages:tsconfig_test",
 9 │     ],
10 │ )
11 │ 
12 │ ts_project(
13 │     name = "test_lib",
14 │     testonly = True,
15 │     srcs = glob(["**/*.ts"]),
16 ▶     tsconfig = ":tsconfig_test",
17 │     visibility = ["//:__pkg__"],
18 │     deps = [
19 │         "//:node_modules/rxjs",
20 │         "//packages/common",
21 ▶         "//packages/common/testing",
22 │         "//packages/core",
23 │         "//packages/core/rxjs-interop",
24 │         "//packages/core/testing",
25 │         "//packages/platform-browser",
26 │         "//packages/platform-browser/testing",
27 │         "//packages/private/testing",
28 ▶         "//packages/router",
29 │         "//packages/router/testing",
30 │     ],
31 │ )
32 │ 
33 ▶ zoneless_jasmine_test(
34 │     name = "test",
35 │     data = [
36 │         ":test_lib",
37 │     ],
38 │ )
39 │ 
40 ▶ zoneless_web_test_suite(
41 │     name = "test_web",
42 │     deps = [
43 │         ":test_lib",
44 │     ],
45 │ )
```

router の spec の BUILD.bazel は形が同じで、違うのは 3〜10 行目の `ts_config` です。7 行目で `@types/dom-navigation`（Navigation API の型の DefinitelyTyped の版）を足し、16 行目でそれを使います。with\_platform\_navigation.spec.ts が先頭で `/// <reference types="dom-navigation" />` と書き、`NavigateEvent` などの型をそのまま使えるのはこのためです。21 行目の `//packages/common/testing` から `ɵFakeNavigationPlatformLocation` を、28 行目の `//packages/router` から `withExperimentalPlatformNavigation` を読みます。

## 3. 同じ suite を 2 つの API で走らせる

📄 `angular/packages/router/test/integration/integration.spec.ts` L78–96 （▶ の行: 78–79, 88, 90–92）

```ts
78 ▶ for (const browserAPI of ['navigation', 'history'] as const) {
79 ▶   describe(`${browserAPI}-based routing`, () => {
80 │     useAutoTick();
81 │     const noopConsole: Console = {log() {}, warn() {}};
82 │ 
83 │     beforeEach(() => {
84 │       TestBed.configureTestingModule({
85 │         imports: [...ROUTER_DIRECTIVES, TestModule],
86 │         providers: [
87 │           {provide: Console, useValue: noopConsole},
88 ▶           provideRouter(
89 │             [{path: 'simple', component: SimpleCmp}],
90 ▶             browserAPI === 'navigation'
91 ▶               ? withExperimentalPlatformNavigation()
92 ▶               : (makeEnvironmentProviders([]) as any),
93 │           ),
94 │         ],
95 │       });
96 │     });
```

📄 `angular/packages/router/test/integration/integration.spec.ts` L967–979 （▶ の行: 967, 969–970, 973, 977）

```ts
967 ▶     navigationErrorsIntegrationSuite(browserAPI);
968 │     eagerUrlUpdateStrategyIntegrationSuite();
969 ▶     duplicateInFlightNavigationsIntegrationSuite(browserAPI);
970 ▶     navigationIntegrationTestSuite(browserAPI);
971 │     routeDataIntegrationSuite();
972 │     routerLinkIntegrationSpec();
973 ▶     redirectsIntegrationSuite(browserAPI);
974 │     guardsIntegrationSuite();
975 │     routerEventsIntegrationSuite();
976 │     routerLinkActiveIntegrationSuite();
977 ▶     lazyLoadingIntegrationSuite(browserAPI);
978 │     routeReuseIntegrationSuite();
979 │   });
```

78 行目の `for` で、79 行目の describe の名前が `navigation-based routing` と `history-based routing` になります。90〜92 行目で、`'navigation'` のときだけ `withExperimentalPlatformNavigation()` を足します。967〜978 行目は別のファイルに分けた suite を呼ぶ行で、`browserAPI` を受け取るもの（967・969・970・973・977 行目）は、中で 2 つの API の違いを書き分けます。どちらの側も TestBed の既定の `FakeNavigation` の上で動きます（[第 6 回](06-navx-testing.md)）。

## 4. FakeNavigation の spec の書き方：次の navigate で intercept する options の列

📄 `angular/packages/core/primitives/dom-navigation/testing/test/fake_platform_navigation.spec.ts` L59–71 （▶ の行: 59, 61, 65–68, 70）

```ts
59 ▶     navigation.addEventListener('navigate', (event: Event) => {
60 │       const navigateEvent = event as FakeNavigateEvent;
61 ▶       nextNavigateEventResolve(navigateEvent);
62 │       nextNavigateEventPromise = new Promise<FakeNavigateEvent>((resolve) => {
63 │         nextNavigateEventResolve = resolve;
64 │       });
65 ▶       locals.navigateEvents.push(navigateEvent);
66 ▶       const interceptOptions = pendingInterceptOptions.shift();
67 ▶       if (interceptOptions) {
68 ▶         navigateEvent.intercept(interceptOptions);
69 │       }
70 ▶       extraNavigateCallback?.(navigateEvent);
71 │     });
```

dom-navigation の spec は、`beforeEach` で 1 つの navigate のリスナーを付け、66 行目で `pendingInterceptOptions` の先頭を取り出して、あれば 68 行目で intercept します。it の側は「次の navigate でこの options を使う」と列に積んでから `navigate()` を呼ぶだけで済みます（[第 4 回](04-navx-precommit.md)の redirect の it がこの形です）。61 行目の `nextNavigateEvent()` は「次に配られる navigate イベント」の Promise で、70 行目の `extraNavigateCallback` は 1 つの it だけで追加の処理をしたいときの口です。spec のファイルの先頭の、`FakeNavigation` を作る行と popstate のリスナーは[第 1 回](01-navx-api-types.md)にあります。

## 5. 手元での走らせ方と結果

📄 `走らせたコマンド`

```
cd ~/angular-research/angular
# FakeNavigation そのもの（Node と、Chromium・Firefox）
pnpm bazel test //packages/core/primitives/dom-navigation/testing/test:test \
  //packages/core/primitives/dom-navigation/testing/test:test_web --nocache_test_results --test_output=all

# Router の Navigation API の統合（Node だけ、名前で絞る）
pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all \
  --test_arg=--filter=withPlatformNavigation
pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=navigation-based routing"

# 本物の window.navigation を使う it も含めて（ブラウザ。絞り込みは効かない）
pnpm bazel test //packages/router/test:test_web --nocache_test_results --test_output=all
```

📄 `scratchpad/nav-logs/b-*.log（要点）`

```
//packages/core/primitives/dom-navigation/testing/test:test              PASSED   91 specs, 0 failures
//packages/core/primitives/dom-navigation/testing/test:test_web_chromium PASSED   91 passed, 0 failed
//packages/core/primitives/dom-navigation/testing/test:test_web_firefox  PASSED   91 passed, 0 failed
//packages/router/test:test  --filter=withPlatformNavigation             PASSED   Ran 14 of 1170 specs
//packages/router/test:test  --filter=configuration error                PASSED   Ran 1 of 1170 specs
//packages/router/test:test  --filter=navigation-based routing           PASSED   Ran 269 of 1170 specs
//packages/router/test:test  --filter=history-based routing              PASSED   Ran 269 of 1170 specs
//packages/router/test:test  --filter=canceledNavigationResolution: 'computed' with navigation   Ran 18 of 1170 specs
//packages/router/test:test_web_chromium                                 PASSED   1180 passed, 0 failed
//packages/router/test:test_web_firefox                                  PASSED   1178 passed, 0 failed
//packages/common/test:test  --filter=Navigation                         PASSED   Ran 2 of 667 specs
//packages/common/test:test_web_chromium                                 FAILED   676 passed, 2 failed（DatePipe と formatDate のタイムゾーン）
```
*2026-11-07、../angular（22.2.0-next.7、8576f161ae4）*

- Navigation API に関係するものは全部 PASSED でした。2 回目以降はビルドが残っていて、Node の 1 つのターゲットは 1〜10 秒です。
- **名前で絞れるのは Node の側だけ**です。`--test_arg=--filter=withPlatformNavigation` を `:test_web_chromium` に渡すと「1180 passed」で、絞られませんでした（b-web-filter.log）。本物の `window.navigation` を使う it（`real platform navigation`）を 1 つだけ走らせたいときは、spec の中で一時的に `fit` にします。
- common のブラウザの suite は、Chromium と Firefox のどちらも「676 passed, 2 failed」で FAILED でした。落ちたのは `DatePipe` の `should give precedence to the passed in timezone over the default one` と `formatDate` の `should format invalid in IE ISO date` で、どちらも期待の日付が 1 日ずれています（手元の時刻が日本時間であることによるもので、Navigation API とは関係しません）。Navigation の 2 件は Node の側で確かめました。

## 6. issue をこのシリーズの章に振り分ける

gh で 2026-11-07 に取った「Navigation API」を含む issue 48 件（開いている #71596 など）から選び、その中のコミットの `Fixes #…` から辿った issue を足しました。ほとんどは Navigation API と関係しない（ページの中の「ナビゲーション」の意味）ので外し、**関係するもの 9 件**と、**本文やメンテナーの答えで Navigation API に触れているだけのもの 4 件**に分けています。要約はこの章の書き手が本文とコメントを読んで付けたもので、題をそのまま写していません。

| 章 | 開いている | 閉じた |
| --- | --- | --- |
| [第 5 回 Router の連携の残り](05-navx-router-integration.md) | 1 | 5 |
| [第 7 回（この章）シリーズ全体](07-navx-tests-issues.md) | 0 | 3 |

件

| # | 状態 | 開いた / 閉じた | 要約 | 章 | PR・コミット |
| --- | --- | --- | --- | --- | --- |
| 71596 | 開 | 2026-10-24 | URL を確定したあとで遷移を取り消すと、巻き戻しの navigate を Router が intercept せず、ページが読み込み直される | [第 5 回 Router の連携の残り](05-navx-router-integration.md) | PR #71597（開、approve 2 回）・#71853（22.2.x 向け、開） |
| 71594 | COMPLETED | 2026-10-24<br>2026-10-26 | intercept に focusReset を渡せず、入力しながら query を書き換えるとフォーカスが body に飛ぶ（angular.dev の API 一覧） | [第 5 回 Router の連携の残り](05-navx-router-integration.md) | PR #71595・8260542ce03 |
| 71567 | COMPLETED | 2026-10-23<br>2026-10-23 | angular.dev の目次のリンクで Firefox のタブが落ちる。adev が Router の Navigation API の統合を使い始めた直後で、Firefox 159 より前の不具合 | [第 7 回（この章）シリーズ全体](07-navx-tests-issues.md) | PR #71572（adev で Firefox 159 より前は統合を使わない） |
| 71551 | COMPLETED | 2026-10-22<br>2026-10-23 | &lt;a download&gt; も intercept してしまい、ファイルが落ちてこない | [第 5 回 Router の連携の残り](05-navx-router-integration.md) | PR #71552・e09bbed21a7（22.2.x は 6ccbb0f6aa7） |
| 71287 | COMPLETED | 2026-10-10<br>2026-10-23 | RouterLink から scroll を指定したい。Router はそれを intercept の scroll に渡す | [第 5 回 Router の連携の残り](05-navx-router-integration.md) | 34ea5922bab（feat(router): add scroll input to RouterLink） |
| 71126 | COMPLETED | 2026-10-01<br>2026-10-02 | 状態を確定したあとのエラーで、エラーハンドラのリダイレクトが止まらなくなる（2 つの StateManager の両方） | [第 5 回 Router の連携の残り](05-navx-router-integration.md) | f591d36fa7a |
| 69700 | COMPLETED | 2026-07-09<br>2026-09-28 | RouterLink がプロトコル相対の href を作る。本文に、Navigation API の統合では pushState の SecurityError が出ないという変種がある | — | 41d6a8bb843 → 0ebea404382（Revert）→ a1bffc29dda |
| 66746 | COMPLETED | 2026-01-25<br>2026-01-26 | withExperimentalPlatformNavigation を付けると ng serve の自動の読み込み直しが効かない（reload を intercept していた） | [第 5 回 Router の連携の残り](05-navx-router-integration.md) | PR #66756・#66762・dbd50be7f71 |
| 53321 | COMPLETED | 2023-12-02<br>2026-09-04 | Router を Navigation API に対応させてほしい（ブラウザの読み込み中の表示を出したい） | [第 7 回（この章）シリーズ全体](07-navx-tests-issues.md) | 7003e8d2417（実験的な機能として公開）ほか |
| 46136 | NOT\_PLANNED | 2022-05-25<br>2022-05-25 | 同じ要望の 2022 年版（Chromium 102 が安定版になった時点） | [第 7 回（この章）シリーズ全体](07-navx-tests-issues.md) | — |
| 51131 | 開 | 2023-07-21 | 遷移の同期の処理を分けて INP を良くしたい。「Navigation API で直るか」という問いに、メンテナーは「たぶん直らない」 | — | — |
| 56166 | NOT\_PLANNED | 2024-05-29<br>2024-06-04 | fragment の戻る・進むでスクロールがずれる。メンテナーの答えに「長期的には Navigation API のスクロールの復元を使いたい」 | — | — |
| 52924 | COMPLETED | 2023-11-15<br>2023-11-15 | 戻るボタンで、URL が変わったあとに canDeactivate が走る。メンテナーの答えに「利用者をページに閉じ込めないことは Navigation API の設計でも目標外」 | — | — |

表から読めることです。

- **開いている関係する issue は #71596 の 1 件だけ**です（[第 5 回](05-navx-router-integration.md)の 5 節）。この版の不具合のうち、戻る遷移のリダイレクトは、issue の番号を書いていない atscott の PR #71433（3320da96da2）で直りました。
- **2026-10 に 5 件がまとまって閉じています**（#71594・#71567・#71551・#71287 と、10-02 の #71126）。きっかけは angular.dev 自身が Router の Navigation API の統合を使い始めたことで（PR #71504、2026-10-21）、その直後に Firefox のタブが落ちる（#71567）・API 一覧の入力欄のフォーカスが外れる（#71594）が見つかりました。
- 2026-10 の 4 件（#71551・#71287・#71594・#71596）は同じ人が issue を書き、自分で PR を出しています。3 件は merge され、#71596 の PR #71597 は approve を受けて開いたままです（2026-11-07）。
- 要望としては 2022 年（#46136、NOT\_PLANNED）と 2023 年（#53321）に出ていて、#53321 は 2026-09-04 に COMPLETED で閉じられました。

📄 `scratchpad/navb/issues/make-data.mjs`

```js
// 第 7 回 navx-tests-issues の表のデータを作る（2026-11-07）。
// - COMMITS: ../angular-main（74961c66242）で、2025-06-01 以降に Navigation API の 6 つのパスを変えたコミット。
//   git log と git show --numstat を読むだけ（リポジトリは変えない）。
// - ISSUES: nav-logs/issues-navapi.json（gh で取得）から選んだもの + コミットの本文の fixes から辿ったもの。
//   ja・ch・link はこの章の書き手が本文とコメントを読んで付けた。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const MAIN = '../angular-main';
const PATHS = [
  'packages/core/primitives/dom-navigation',
  'packages/router/src/statemanager/navigation_state_manager.ts',
  'packages/common/src/navigation',
  'packages/common/src/location/navigation_adapter_for_location.ts',
  'packages/common/testing/src/navigation',
  'packages/router/test/with_platform_navigation.spec.ts',
];
const git = (...a) => execFileSync('git', ['-C', MAIN, ...a], { encoding: 'utf8' });
const log = git('log', '--since=2025-06-01', '--format=%h|%cd|%an|%s', '--date=short', '--', ...PATHS)
  .trim().split('\n').map((l) => { const [h, d, a, ...s] = l.split('|'); return { h, d, a, s: s.join('|') }; });
const isSpec = (p) => /(\.spec\.ts|_spec\.ts)$/.test(p);
const COMMITS = log.map((c) => {
  let srcAdd = 0, srcDel = 0, specAdd = 0;
  for (const line of git('show', '--numstat', '--format=', c.h).trim().split('\n')) {
    const [a, d, p] = line.split('\t');
    if (!p || a === '-') continue;
    if (isSpec(p)) specAdd += +a; else { srcAdd += +a; srcDel += +d; }
  }
  const type = /^Revert/.test(c.s) ? 'revert' : (c.s.match(/^(\w+)/)?.[1] ?? 'other');
  return { ...c, a: c.a === 'Andrew Scott' ? 'Andrew Scott' : 'ほか', type, srcAdd, srcDel, specAdd };
});

const ISSUES = [
  { n: 71596, state: 'open', opened: '2026-10-24', closed: '', reason: '', ch: 'navx-router-integration', rel: 'direct',
    ja: 'URL を確定したあとで遷移を取り消すと、巻き戻しの navigate を Router が intercept せず、ページが読み込み直される', link: 'PR #71597（開、approve 2 回）・#71853（22.2.x 向け、開）' },
  { n: 71594, state: 'closed', opened: '2026-10-24', closed: '2026-10-26', reason: 'COMPLETED', ch: 'navx-router-integration', rel: 'direct',
    ja: 'intercept に focusReset を渡せず、入力しながら query を書き換えるとフォーカスが body に飛ぶ（angular.dev の API 一覧）', link: 'PR #71595・8260542ce03' },
  { n: 71567, state: 'closed', opened: '2026-10-23', closed: '2026-10-23', reason: 'COMPLETED', ch: 'navx-tests-issues', rel: 'direct',
    ja: 'angular.dev の目次のリンクで Firefox のタブが落ちる。adev が Router の Navigation API の統合を使い始めた直後で、Firefox 159 より前の不具合', link: 'PR #71572（adev で Firefox 159 より前は統合を使わない）' },
  { n: 71551, state: 'closed', opened: '2026-10-22', closed: '2026-10-23', reason: 'COMPLETED', ch: 'navx-router-integration', rel: 'direct',
    ja: '<a download> も intercept してしまい、ファイルが落ちてこない', link: 'PR #71552・e09bbed21a7（22.2.x は 6ccbb0f6aa7）' },
  { n: 71287, state: 'closed', opened: '2026-10-10', closed: '2026-10-23', reason: 'COMPLETED', ch: 'navx-router-integration', rel: 'direct',
    ja: 'RouterLink から scroll を指定したい。Router はそれを intercept の scroll に渡す', link: '34ea5922bab（feat(router): add scroll input to RouterLink）' },
  { n: 71126, state: 'closed', opened: '2026-10-01', closed: '2026-10-02', reason: 'COMPLETED', ch: 'navx-router-integration', rel: 'both',
    ja: '状態を確定したあとのエラーで、エラーハンドラのリダイレクトが止まらなくなる（2 つの StateManager の両方）', link: 'f591d36fa7a' },
  { n: 69700, state: 'closed', opened: '2026-07-09', closed: '2026-09-28', reason: 'COMPLETED', ch: '', rel: 'mention',
    ja: 'RouterLink がプロトコル相対の href を作る。本文に、Navigation API の統合では pushState の SecurityError が出ないという変種がある', link: '41d6a8bb843 → 0ebea404382（Revert）→ a1bffc29dda' },
  { n: 66746, state: 'closed', opened: '2026-01-25', closed: '2026-01-26', reason: 'COMPLETED', ch: 'navx-router-integration', rel: 'direct',
    ja: 'withExperimentalPlatformNavigation を付けると ng serve の自動の読み込み直しが効かない（reload を intercept していた）', link: 'PR #66756・#66762・dbd50be7f71' },
  { n: 53321, state: 'closed', opened: '2023-12-02', closed: '2026-09-04', reason: 'COMPLETED', ch: 'navx-tests-issues', rel: 'direct',
    ja: 'Router を Navigation API に対応させてほしい（ブラウザの読み込み中の表示を出したい）', link: '7003e8d2417（実験的な機能として公開）ほか' },
  { n: 46136, state: 'closed', opened: '2022-05-25', closed: '2022-05-25', reason: 'NOT_PLANNED', ch: 'navx-tests-issues', rel: 'direct',
    ja: '同じ要望の 2022 年版（Chromium 102 が安定版になった時点）', link: '—' },
  { n: 51131, state: 'open', opened: '2023-07-21', closed: '', reason: '', ch: '', rel: 'mention',
    ja: '遷移の同期の処理を分けて INP を良くしたい。「Navigation API で直るか」という問いに、メンテナーは「たぶん直らない」', link: '—' },
  { n: 56166, state: 'closed', opened: '2024-05-29', closed: '2024-06-04', reason: 'NOT_PLANNED', ch: '', rel: 'mention',
    ja: 'fragment の戻る・進むでスクロールがずれる。メンテナーの答えに「長期的には Navigation API のスクロールの復元を使いたい」', link: '—' },
  { n: 52924, state: 'closed', opened: '2023-11-15', closed: '2023-11-15', reason: 'COMPLETED', ch: '', rel: 'mention',
    ja: '戻るボタンで、URL が変わったあとに canDeactivate が走る。メンテナーの答えに「利用者をページに閉じ込めないことは Navigation API の設計でも目標外」', link: '—' },
];

// 入力の JSON に、選んだ番号が本当にあるか（コミットから辿った 71126・71287・71594・71551 は JSON の外）
const src = JSON.parse(readFileSync(new URL('../../nav-logs/issues-navapi.json', import.meta.url), 'utf8')).items;
const inJson = new Set(src.map((i) => i.number));
for (const i of ISSUES) i.inJson = inJson.has(i.n);

const out = `// 自動生成 — 手で編集しないこと（scratchpad/navb/issues/make-data.mjs が作った）。
// COMMITS は ../angular-main（74961c66242）の git log と git show --numstat。ISSUES の番号・日付・状態は 2026-11-07 に gh で取ったもの。ja・ch・link はこの章の書き手が付けたもの。
export const COMMITS = ${JSON.stringify(COMMITS)} as const;
export const ISSUES = ${JSON.stringify(ISSUES)} as const;
export const SCRIPT = ${JSON.stringify(readFileSync(new URL(import.meta.url), 'utf8'))};
`;
writeFileSync('src/app/pages/chapters/navx-tests-issues.data.ts', out);
const by = (k) => COMMITS.reduce((m, c) => ((m[c[k]] = (m[c[k]] ?? 0) + 1), m), {});
console.log(COMMITS.length, by('type'), by('a'));

```
*表のデータを作ったスクリプトの全文（記録）*

## 7. 修正の傾向：取り消しとやり直し

../angular-main（74961c66242）で、2025-06-01 以降に次の 6 つのパスを変えたコミットです：dom-navigation の全体、`navigation_state_manager.ts`、common の `src/navigation`、`navigation_adapter_for_location.ts`、common/testing の `src/navigation`、`with_platform_navigation.spec.ts`。行数は `git show --numstat` で、名前が `.spec.ts` か `_spec.ts` のファイルを spec、それ以外を src として数えました。

| 種類 | feat | fix | refactor | revert | test | build | ci |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 本数 | 4 | 11 | 27 | 2 | 3 | 7 | 1 |

| コミット | 日付 | 題 | src（足した / 消した） | spec（足した） |
| --- | --- | --- | --- | --- |
| `8260542ce03` | 2026-10-26 | feat(router): add focusReset to NavigationBehaviorOptions | +18 / −0 | +82 |
| `e09bbed21a7` | 2026-10-23 | fix(router): don't intercept downloads with the Navigation API | +3 / −1 | +25 |
| `3320da96da2` | 2026-10-20 | fix(router): properly handle redirects during traversal navigations with Navigation API | +18 / −11 | +37 |
| `ed24615af8f` | 2026-10-06 | fix(router): remove the navigate event abort listener once it fires | +1 / −1 | +0 |
| `f591d36fa7a` | 2026-10-02 | fix(router): reset internal state on error handler redirect after state commit | +18 / −3 | +28 |
| `c8d6971b0b5` | 2026-09-28 | refactor(core): use native \`Promise.withResolvers()\` in remaining test files | +7 / −12 | +117 |
| `a8233232f5a` | 2026-09-11 | fix(core): update FakeNavigation to match WHATWG HTML spec | +333 / −155 | +246 |
| `af26a8c5217` | 2026-09-02 | fix(router): avoid view transitions when the user agent provides one | +92 / −25 | +42 |
| `732e5050180` | 2026-08-18 | fix(core): replace all hasOwnProperty usages with Object.hasOwn | +189 / −188 | +20 |
| `d79b3b65e95` | 2026-07-24 | refactor(core): align navigation types with built in ones | +35 / −24 | +8 |
| `d9639201b35` | 2026-07-06 | test(router): Update tests to use \`currentNavigation()\` | +0 / −0 | +21 |
| `fe721868a6e` | 2026-06-09 | fix(router): use native URL object for navigation boundary and comparison | +35 / −8 | +157 |
| `4f9ee3c056a` | 2026-05-26 | refactor: add g3-only and 3p-only markers to replace specific g3 patches | +149 / −22 | +0 |
| `a7dab601faf` | 2026-05-07 | refactor(core): use the \`@Service\` decorator where possible. | +132 / −121 | +2 |
| `7f3f3d7da1e` | 2026-04-22 | ci: remove remainings of saucelabs tests | +30 / −3615 | +141 |
| `6eff4395467` | 2026-04-20 | fix(router): restore internal URL on popstate when \`browserUrl\` is used | +45 / −10 | +28 |
| `c15e3a005d9` | 2026-04-01 | test(core): refactors test to use \`timeout\` utility | +0 / −0 | +40 |
| `778b7486942` | 2026-03-03 | refactor(router): Permit deferring commit of traversal navigations | +7 / −4 | +6 |
| `a1501bc90a7` | 2026-02-19 | build: update rules\_browsers digest to ceb5275 | +41 / −31 | +9 |
| `81cabc14777` | 2026-02-17 | feat(core): add support for TypeScript 6 | +454 / −233 | +40 |
| `0f47fda51bd` | 2026-02-10 | test(router): move timeout and autoTick helpers to shared testing utilities | +1 / −17 | +30 |
| `dbd50be7f71` | 2026-01-26 | fix(router): Do not intercept reload events with Navigation integration | +5 / −3 | +25 |
| `e8c44a00f9a` | 2026-01-12 | refactor(router): Retain original navigateEvent across redirects | +11 / −2 | +23 |
| `da364d26357` | 2026-01-09 | refactor(router): Add support for precommitHandler in Navigation integration | +174 / −39 | +24 |
| `49295778bc1` | 2026-01-08 | refactor(core): Use the provided Document value rather than global in FakeNavigation | +6 / −5 | +0 |
| `86dc1283e8c` | 2026-01-08 | fix(core): handle cancelled traversals in fake navigation | +9 / −5 | +31 |
| `7003e8d2417` | 2026-01-07 | feat(router): Publish Router's integration with platform Navigation API as experimental | +46 / −13 | +11 |
| `97fd1de0ac9` | 2026-01-07 | Revert "refactor(router): Add support for precommitHandler in Navigation integration" | +37 / −176 | +13 |
| `397dbc4c374` | 2026-01-07 | Revert "refactor(router): Retain original navigateEvent across redirects" | +2 / −11 | +1 |
| `53d3ae0febc` | 2026-01-06 | refactor(router): Retain original navigateEvent across redirects | +11 / −2 | +24 |
| `522fa716b84` | 2026-01-06 | refactor(router): Add support for precommitHandler in Navigation integration | +176 / −37 | +24 |
| `dd58c4b667b` | 2026-01-06 | refactor(common): Add token to indicate whether precommit handler is supported | +23 / −1 | +0 |
| `84855796496` | 2025-12-12 | refactor(common): remove redundant providedIn: 'root' from injection tokens | +4 / −3 | +1 |
| `5988bdedaeb` | 2025-12-10 | refactor(core): Add transition.to property to FakeNavigation | +7 / −1 | +0 |
| `d3552051988` | 2025-12-10 | refactor(core): match spec updates for FakeNavigation | +2 / −4 | +0 |
| `37598cf6fe8` | 2025-12-04 | refactor(router): Adjust push/replace behavior to account for navigation API timing issues | +7 / −0 | +0 |
| `fd65dc5d531` | 2025-12-02 | refactor(router): add comment about scroll/focus | +4 / −0 | +0 |
| `cc03254b12c` | 2025-12-02 | refactor(router): Avoid aborting traversal navigations | +27 / −5 | +19 |
| `9914926b0d7` | 2025-12-02 | refactor(router): Clean up cancellation event handling | +13 / −11 | +0 |
| `2db8f2ee750` | 2025-11-10 | refactor(router): Add handling of abort event on signal of NavigateEvent | +30 / −4 | +37 |
| `16519080041` | 2025-11-07 | refactor(router): Add handler to NavigationInterceptOptions | +95 / −28 | +70 |
| `8bccd8671cc` | 2025-11-07 | refactor(core): Extract NavigateEvent cancel steps based on recent spec update | +26 / −35 | +0 |
| `7a5ac69144b` | 2025-11-07 | refactor(core): Update commit steps of PlatformNavigation fake to match spec updates | +4 / −4 | +0 |
| `85d9abb019e` | 2025-11-06 | refactor(router): Intercept navigate events (unless it's a rollback) | +98 / −46 | +42 |
| `189807ef04f` | 2025-11-06 | refactor(router): Build out integration with browser Navigation API (#64905) | +285 / −18 | +513 |
| `dd09da8ba23` | 2025-10-27 | refactor(router): Add provider for integrating with Navigation API and Location shim | +196 / −1 | +99 |
| `c795960ada1` | 2025-08-28 | feat(common): Add experimental support for the Navigation API (#63406) | +64 / −10 | +25 |
| `8e4b7e47f4b` | 2025-08-27 | refactor(core): Reorder resolve/reject in relation to navigate\[error/success\] (#63377) | +3 / −5 | +0 |
| `2fcafb65c57` | 2025-08-25 | build: rename defaults2.bzl to defaults.bzl (#63383) | +363 / −363 | +0 |
| `cbc258eec8f` | 2025-07-31 | build: remove ts\_project\_interop infrastructure (#62908) | +2846 / −3029 | +0 |
| `17ada9838b3` | 2025-07-28 | build: move tsec to new toolchain (#62825) | +156 / −239 | +0 |
| `4fae4dbba8c` | 2025-07-02 | build: migrate adev to use packaged version of @angular/\* packages (#62413) | +421 / −289 | +1 |
| `b84859073bf` | 2025-06-26 | build: migrate to use web test runner rules (#62292) | +549 / −612 | +188 |
| `fa5ae9228d2` | 2025-06-19 | refactor(core): update FakeNavigation to the latest spec (#62017) | +156 / −60 | +339 |
| `3a0cfd544df` | 2025-06-18 | build: migrate to using new jasmine\_test (#62086) | +870 / −1185 | +17 |

- **refactor が一番多い**（27 本）。機能は `@experimental` で、公開の振る舞いを約束していないあいだは、作りながらの変更が `refactor(router)` として入っています（2025-11 の 189807ef04f から 2026-03 の 778b7486942 まで）。
- **55 本のうち 32 本が Andrew Scott**（Router の担当のメンテナー）。2026-09 以降の fix と feat の 7 本には、ほかの人のものが増えています（e09bbed21a7・8260542ce03・ed24615af8f）。
- **戻したものは 2 本で、どちらも 2 日後に入り直しています**（97fd1de0ac9・397dbc4c374。[第 4 回](04-navx-precommit.md)の 6 節）。戻した理由は「g3（Google の社内）のターゲットを壊す」で、入り直した版は、Navigation API を使わないアプリの流れを前と同じに保つ形に変わっていました。
- **fix は 11 本で、src の変更の中央値は 29 行、10 本が spec を足しています**。spec を足していないのは、リスナーに `{ once: true }` を足しただけの ed24615af8f です。src が一番大きい 2 本は、FakeNavigation の作り直しの a8233232f5a と、リポジトリ全体の `hasOwnProperty` を `Object.hasOwn` に置き換えた 732e5050180 です。
- **FakeNavigation を仕様の更新に合わせた変更が 6 本あります**（fa5ae9228d2・7a5ac69144b・8bccd8671cc・d3552051988・5988bdedaeb・a8233232f5a）。fake\_navigation.ts の差分が大きいのは fa5ae9228d2（+152 / −58）と a8233232f5a（+318 / −154）で、a8233232f5a は spec も 246 行足しました。さらに大きな作り直しの PR #70705（「FakeNavigation を WHATWG の仕様に合わせる」、2026-09-11 から開いている）と、`withExperimentalPlatformNavigation()` を別の提供関数に分けて実験の印を外す PR #70534（atscott、2026-09-02 から開いている）があります。

## このシリーズで見つけたもの

第 1〜6 回を書く途中で、本家の不具合らしきものと、テストや文書の小さな食い違いが見つかりました。どれも **issue も PR も出していません**。上の 3 つは、手元の作業木（8576f161ae4）で spec を足すと落ち、直すと通ることを確かめました。ソースの行は ../angular と新しい本家（74961c66242）の両方で確かめています。

| 何が起きるか | どこ | 今の状況 | 章 |
| --- | --- | --- | --- |
| FakeNavigation の hashchange の `oldURL` と `newURL` が入れ替わっている | fake\_navigation.ts 547 行目が `createHashChangeEvent(oldUrl, …)` と呼ぶが、1189 行目の関数の引数は `(newURL, oldURL)` の順（新しい本家では 558 行目） | gh で探した範囲では報告も PR も無い。開いている PR #70705 の差分にもこの行は無い | [第 3 回](03-navx-fake-traverse.md) |
| precommitHandler の途中で次の navigate に取って代わられた遷移が、あとから commit し、entries が `[/, /b, /a]` の順になる | fake\_navigation.ts 953 行目の commit() は `result.signal.aborted` を見るが、InternalNavigationResult の側を中断する行が無い | 開いている PR #70705 が、イベントの signal も見る変更を含む | [第 2 回](02-navx-fake-navigate.md)・[第 4 回](04-navx-precommit.md) |
| intercept せずに `preventDefault()` だけを呼ぶと、`navigate()` が TypeError を投げる。非同期の traverse では setTimeout の中の捕まえられない例外になる | fake\_navigation.ts 216 行目（null の navigateEvent を使う） | 開いている PR #70705 の範囲 | [第 2 回](02-navx-fake-navigate.md) |
| 戻る先のガードがリダイレクトすると、`router.url` は `/redirected` なのに `currentEntry` は元の URL のまま（precommit が使えて、URL の更新が deferred のとき） | navigation\_state\_manager.ts 479〜481 行目 | 新しい本家の 3320da96da2（#71433）と、22.2 系の b8383a1987a で直っている | [第 5 回](05-navx-router-integration.md) |
| （文書）FakeNavigationPlatformLocation の例外の文が、無い名前を挙げる。`provideFakeNavigation` は無く（実際は `provideFakePlatformNavigation`）、主語の `FakePlatformNavigation` も無い（クラスは `FakeNavigationPlatformLocation`） | common/testing/src/mock\_platform\_location.ts 292〜295 行目（新しい本家も同じ） | 報告は見つからない | [第 6 回](06-navx-testing.md) |
| （文書）redirect の例外の文が `'push' or 'replace` で終わり、閉じる引用符が無い | fake\_navigation.ts 919 行目 | — | [第 4 回](04-navx-precommit.md) |
| （テスト）it の名前は「replaces history entry by default」だが、中身は `{history: 'push'}` を渡し、780 行目でエントリが 1 つ増えることを確かめている | dom-navigation/testing/test/fake\_platform\_navigation.spec.ts 766 行目 | — | [第 4 回](04-navx-precommit.md) |
| （テスト）「FakeNavigation の更新が必要」というコメントが残っているが、すぐ下の it は普通の it で、手元でも通る | router/test/with\_platform\_navigation.spec.ts 139 行目 | — | [第 6 回](06-navx-testing.md) |
| （参考）handler が同期で throw すると、`navigate()` が例外を投げ、finished が決着しない。エントリの dispose のイベント名が `'disposed'` | fake\_navigation.ts | 新しい本家の a8233232f5a で直っている | [第 2 回](02-navx-fake-navigate.md)・[第 3 回](03-navx-fake-traverse.md) |

読み方の目安: 上の 3 つは FakeNavigation の中の食い違いです。テストの土台なので、利用者のアプリの動きではなく、**テストの結果**が本物のブラウザとずれます。PR #70705 のように、仕様に合わせる大きな変更が進んでいる場所なので、issue を探すときは PR の差分も一緒に読みます。

## テストが走るまでの呼び出し

- 👤 `pnpm bazel test //packages/router/test:test --test_arg=--filter=withPlatformNavigation` — あなたのコマンド
  - `zoneless_jasmine_test(name = "test", data = [":test_lib"])` — router/test/BUILD.bazel 33〜38
    - `ts_project(name = "test_lib", srcs = glob(["**/*.ts"]), tsconfig = ":tsconfig_test")` — router/test/BUILD.bazel 12〜31 — *@types/dom-navigation を足した tsconfig*
      - `describe('withPlatformNavigation feature', …)` — with\_platform\_navigation.spec.ts 47 — *14 件*
        - `TestBed` の既定 → `ɵprovideFakePlatformNavigation()` — platform-browser/testing（第 6 回） — *FakeNavigation の上で Router が動く*

## 聞かれそうな質問

**Q. FakeNavigation を直したら、どの spec を走らせればいいですか？**

まず `//packages/core/primitives/dom-navigation/testing/test:test`（91 件、数秒）です。FakeNavigation は TestBed の既定なので、Router の `//packages/router/test:test` の `navigation-based routing`（269 件）と `withPlatformNavigation`（14 件）も、振る舞いの変化で落ちることがあります。

**Q. 本物の `window.navigation` でしか試せない振る舞いは、どこで試されていますか？**

with\_platform\_navigation.spec.ts の `real platform navigation` の describe です。Node では作られず、Chromium のブラウザの suite でだけ走ります（Firefox も外されます）。1 節の表の Chromium と Firefox の数の差の 2 件がそれです。

**Q. router の spec が `NavigateEvent` の型を使えるのはなぜですか？**

router/test/BUILD.bazel の `ts_config` が `@types/dom-navigation` を足しているからです（7 行目）。Angular の本体は、型を `navigation_types.ts` に自分で持っています（[第 1 回](01-navx-api-types.md)）。

**Q. Navigation API の統合は、今どのくらい固まっていますか？**

まだ `@experimental` です。開いている関係の issue は #71596 の 1 件ですが、2026-10 に angular.dev が統合を使い始めてすぐに 4 件が見つかって直されました（6 節）。統合を別の提供関数に分ける PR #70534 と、FakeNavigation の作り直しの PR #70705 も開いています。

**Q. 取り消し（Revert）されたコミットは、どう見分けますか？**

題が `Revert "…"` で、本文に `This reverts commit …` と元のコミットが書かれます。このシリーズでは 97fd1de0ac9 が 522fa716b84 を、397dbc4c374 が 53d3ae0febc を戻し、2 日後に da364d26357 と e8c44a00f9a として入り直しました。`git show` で 2 つの版を並べると、何を変えて入り直したかが分かります（第 4 回の 6 節）。

## 読み終えて

- FakeNavigation の spec は dom-navigation の 1 ファイル 91 件。Router 側は with\_platform\_navigation.spec.ts と、2 つの API で同じ it を作る computed\_state\_restoration と integration の spec。
- 名前で絞れるのは Node の側だけ。本物の `window.navigation` の it は Chromium でだけ走る。
- 関係する issue で開いているのは #71596 だけ。2026-10 に angular.dev が統合を使い始めて、続けて見つかって直された。
- 55 本のコミットの大半は refactor。2 本の取り消しはどちらも 2 日後に、形を変えて入り直した。

---

← 前: [テストの土台：FakeNavigationPlatformLocation と provideFakePlatformNavigation](06-navx-testing.md)
