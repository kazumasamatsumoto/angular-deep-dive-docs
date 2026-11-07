[目次](../README.md) › [SSR の守りと細部](README.md) › 第 10 回 / 全 10 回

# spec と issue を読む：platform-server と @angular/ssr の今

> platform-server の spec（url\_spec・platform\_location\_spec・render\_spec など）と @angular/ssr の spec の分け方と手元での走らせ方（angular は ../angular、angular-cli は練習用の複製で bazel test）。angular のラベル area: server と angular-cli のラベル area: @angular/ssr の issue の表、どの issue がこのシリーズのどの章の行に関係するか、2026 年の守りの修正の傾向。

angular/angular-cli · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ssrx-tests-issues)

---

シリーズの最後に、SSR の 2 つのパッケージ（../angular の `packages/platform-server` と、../angular-cli の `packages/angular/ssr`）の spec がどう分かれていて、手元でどう走らせ、どれだけの数が走るのかを確かめます。次に、第 7〜9 回で「修正を戻すと、どの spec が落ちるか」を試した結果を 1 つの表にし、ラベル `area: server`（angular）と `area: @angular/ssr`（angular-cli）の issue 129 件をこのシリーズと既存の章に振り分けます。最後に、2026 年の修正のコミットを数えて、「小さく、spec つきの、守りの修正」がどれだけあるかを読みます。

読む対象は 2 つのパッケージの spec と `BUILD.bazel` です。Bazel のターゲットの読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせるやり方の一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。SSR の大きな流れは[SSR の概観](../platform/01-ssr-overview.md)から読めます。

1. [1. resolveUrl](01-ssrx-resolve-url.md)
2. [2. location と allowedHosts](02-ssrx-location-allowed-hosts.md)
3. [3. サーバーの HttpClient](03-ssrx-server-http.md)
4. [4. ホストとヘッダーの検査](04-ssrx-host-validation.md)
5. [5. プロキシのヘッダー](05-ssrx-proxy-headers.md)
6. [6. リダイレクトと URL の照合](06-ssrx-redirects.md)
7. [7. ロケールの選び方](07-ssrx-i18n-locale.md)
8. [8. Node のリクエストとレスポンス](08-ssrx-node-streams.md)
9. [9. アセットと重要 CSS](09-ssrx-assets-css.md)
10. **10. spec と issue**（この章）

## 1. spec の地図

ファイルごとの行数、字下げの浅い（2 文字まで）`describe` とその行、`it(` で始まる行の数、実際に走った数です。数は下のスクリプトが grep で数えました。

### platform-server（../angular、22.2.0-next.7、8576f161ae4）

「走った数」は、一番外の `describe` の名前ごとに `--test_arg=--filter=^名前 ` で走らせ、「Ran N of 399 specs」を読んだものです（scratchpad/ssrx-logs/c-ng-count.log。`event_replay_spec.ts` と `init/test` は別のターゲットの数）。合計 424 件です。

| ファイル | 行数 | describe（行） | it の行 | 走った数 |
| --- | --- | --- | --- | --- |
| `test/event_replay_spec.ts` | 896 | `event replay`（70）<br>`host bindings`（310）<br>`bubbling behavior`（537）<br>`event dispatch script`（643）<br>`event replay queue`（752）<br> | 23 | 23 |
| `test/full_app_hydration_spec.ts` | 8367 | `platform-server full application hydration integration`（95）<br>`hydration`（116）<br> | 192 | 194 |
| `test/incremental_hydration_spec.ts` | 3220 | `platform-server partial hydration integration`（93）<br>`core functionality`（110）<br>`client side navigation`（2250）<br>`control flow`（2289）<br>`cleanup`（2564）<br>`Router`（2944）<br>`misconfiguration`（3158）<br> | 41 | 41 |
| `test/integration_spec.ts` | 1723 | `platform-server integration`（649）<br> | 50 | 121 |
| `test/platform_location_spec.ts` | 221 | `PlatformLocation`（17）<br> | 12 | 12 |
| `test/render_spec.ts` | 49 | `renderApplication`（12）<br> | 3 | 3 |
| `test/transfer_state_spec.ts` | 164 | `transfer_state`（25）<br>`getTransferState`（110）<br> | 4 | 4 |
| `test/url_spec.ts` | 162 | `resolveUrl`（11）<br>`with origin`（12）<br>`without origin`（129）<br> | 14 | 14 |
| `test/utils_spec.ts` | 176 | `isHostAllowed`（27）<br>`allowedHosts validation in renderApplication`（45）<br>`allowedHosts validation in renderModule`（120）<br> | 10 | 10 |
| `init/test/shims_spec.ts` | 43 | `applyShims()`（11）<br> | 2 | 2 |

### @angular/ssr（../angular-cli、44129f66a3）

こちらは `it(` の行の合計が、走った数（`test` の 249 件と `node/test` の 42 件）とちょうど同じなので、ファイルごとの数も `it` の行の数です。合計 291 件です。

| ファイル | 行数 | describe（行） | it の行 = 走った数 |
| --- | --- | --- | --- |
| `test/app-engine_spec.ts` | 489 | `AngularAppEngine`（107）<br>`Localized app`（110）<br>`Localized app with single locale`（228）<br>`Non-localized app`（289）<br>`Invalid host headers`（344）<br>`Disable host check`（433）<br> | 29 |
| `test/app_spec.ts` | 567 | `AngularServerApp`（22）<br>`handle`（181）<br> | 36 |
| `test/assets_spec.ts` | 48 | `ServerAsset`（11）<br> | 3 |
| `test/hooks_spec.ts` | 65 | `Hooks`（11）<br>`on`（19）<br>`run`（32）<br>`has`（54）<br> | 7 |
| `test/i18n_spec.ts` | 170 | `getPotentialLocaleIdFromUrl`（11）<br>`getPreferredLocale`（69）<br> | 20 |
| `test/routes/ng-routes_spec.ts` | 844 | `extractRoutesAndCreateRouteTree`（25）<br>`route configuration validation`（59）<br>`when `（184）<br> | 28 |
| `test/routes/route-tree_spec.ts` | 289 | `RouteTree`（12）<br>`toObject and fromObject`（19）<br>`match`（123）<br> | 18 |
| `test/routes/router_spec.ts` | 141 | `ServerRouter`（20）<br>`from`（47）<br>`match`（76）<br> | 6 |
| `test/utils/promise_spec.ts` | 36 | `promiseWithAbort`（12）<br> | 2 |
| `test/utils/redirect_spec.ts` | 67 | `Redirect Utils`（11）<br>`createRedirectResponse`（12）<br> | 7 |
| `test/utils/url_spec.ts` | 223 | `URL Utils`（20）<br>`stripTrailingSlash`（21）<br>`stripLeadingSlash`（39）<br>`addLeadingSlash`（57）<br>`addTrailingSlash`（72）<br>`joinUrlParts`（87）<br>`stripIndexHtmlFromURL`（117）<br>`buildPathWithParams`（167）<br>`stripMatrixParams`（198）<br> | 38 |
| `test/utils/validation_spec.ts` | 532 | `Validation Utils`（18）<br>`getFirstHeaderValue`（19）<br>`parseForwardedHeader`（42）<br>`normalizeTrustProxyHeaders`（135）<br>`validateUrl`（177）<br>`validateRequest`（213）<br>`sanitizeRequestHeaders`（398）<br> | 55 |
| `node/test/request_http1_spec.ts` | 230 | `createWebRequestFromNodeRequest (HTTP/1.1)`（13）<br>`GET handling`（48）<br>`POST handling`（143）<br>`abort handling`（193）<br> | 9 |
| `node/test/request_http2_spec.ts` | 229 | `createWebRequestFromNodeRequest (HTTP/2)`（20）<br>`GET handling`（59）<br>`POST handling`（150）<br>`abort handling`（192）<br> | 9 |
| `node/test/request_spec.ts` | 214 | `createRequestUrl`（29）<br> | 14 |
| `node/test/response_http1_spec.ts` | 154 | `writeResponseToNodeResponse (HTTP/1.1)`（13）<br> | 5 |
| `node/test/response_http2_spec.ts` | 163 | `writeResponseToNodeResponse (HTTP/2)`（19）<br> | 5 |

- **このシリーズの第 1〜3 回の行（`url.ts`・`location.ts`・`http.ts`）の spec は小さい**です。`url_spec.ts` 14 件、`platform_location_spec.ts` 12 件、`utils_spec.ts`（allowedHosts）10 件。platform-server の 399 件のほとんどは、ハイドレーションと `integration_spec.ts` です。
- `integration_spec.ts` は it の行 50 に対して 121 件走ります。describe `render` の中が `[true, false].forEach` の 2 重のくり返し（`zoneless` と `isStandalone`）になっていて、その中の it が 4 回ずつ作られるからです。一番外は `(function () {` の囲みで、Node でだけ動かすための古い形です（ファイルの TODO に「消す」とある）。
- @angular/ssr で一番多いのは `validation_spec.ts` の 55 件（第 4・5 回）と `url_spec.ts` の 38 件（第 6 回）です。第 7〜9 回の `i18n_spec.ts`・`hooks_spec.ts`・`assets_spec.ts` は 20・7・3 件、Node の 5 ファイルは合わせて 42 件です。

## 2. BUILD.bazel の分け方

### @angular/ssr：test と node/test の 2 つ

📄 `angular-cli/packages/angular/ssr/test/BUILD.bazel` L1–36 （▶ の行: 1, 4, 7–8, 10, 14, 18–19, 23–24, 26, 30, 33, 35）

```python
 1 ▶ load("@devinfra//bazel/spec-bundling:index.bzl", "spec_bundle")
 2 │ load("//tools:defaults.bzl", "jasmine_test", "ts_project")
 3 │ 
 4 ▶ ts_project(
 5 │     name = "unit_test_lib",
 6 │     testonly = True,
 7 ▶     srcs = glob(
 8 ▶         include = ["**/*.ts"],
 9 │     ),
10 ▶     tsconfig = "//:test-tsconfig-esm",
11 │     deps = [
12 │         "//:node_modules/@angular/common",
13 │         "//:node_modules/@angular/compiler",
14 ▶         "//:node_modules/@angular/core",
15 │         "//:node_modules/@angular/platform-browser",
16 │         "//:node_modules/@angular/router",
17 │         "//:node_modules/@types/node",
18 ▶         "//packages/angular/ssr",
19 ▶         "//packages/angular/ssr:node_modules/beasties",
20 │     ],
21 │ )
22 │ 
23 ▶ spec_bundle(
24 ▶     name = "esm_tests_bundled",
25 │     deps = [
26 ▶         ":unit_test_lib",
27 │     ],
28 │ )
29 │ 
30 ▶ jasmine_test(
31 │     name = "test",
32 │     data = [
33 ▶         ":esm_tests_bundled",
34 │     ],
35 ▶     flaky = True,
36 │ )
```

1. **4〜21 行目：`test/` の下の `**/*.ts` を 1 つの `ts_project` に**

   8 行目の `**` なので、`routes/` と `utils/` の下の spec も入ります。19 行目の beasties は、23e3d44a7f で testing-utils.ts が `beasties/compiler` を使うようになって足されました（下の 48〜80 行目）。
2. **23〜28 行目：`spec_bundle` で 1 つの ESM に束ねる**

   node/test の BUILD.bazel の TODO（「この repo がいつも ESM で動くようになったら片付ける」）のとおり、ESM の spec を Node の jasmine で読むための束ねです。
3. **30〜36 行目：`jasmine_test`。35 行目の `flaky = True`**

   26f3641504（2025-06-11、「jasmine のテストを flaky にする」）で付きました。落ちると bazel が 3 回まで走らせ直します。第 7 回の練習で修正を戻したとき、ログに 3 回分の結果（`attempt_2.log` まで）が残ったのはこのためです。

📄 `angular-cli/packages/angular/ssr/node/test/BUILD.bazel` L4–28 （▶ の行: 7, 9–11, 15, 23）

```python
 4 │ ts_project(
 5 │     name = "unit_test_lib",
 6 │     testonly = True,
 7 ▶     srcs = glob(["**/*_spec.ts"]),
 8 │     deps = [
 9 ▶         "//:node_modules/@types/node",
10 ▶         "//packages/angular/ssr",
11 ▶         "//packages/angular/ssr/node",
12 │     ],
13 │ )
14 │ 
15 ▶ # TODO: Clean this up when this repo runs ESM consistently.
16 │ spec_bundle(
17 │     name = "esm_tests_bundled",
18 │     deps = [
19 │         ":unit_test_lib",
20 │     ],
21 │ )
22 │ 
23 ▶ jasmine_test(
24 │     name = "test",
25 │     data = [
26 │         ":esm_tests_bundled",
27 │     ],
28 │ )
```

node/test は 7 行目で `*_spec.ts` だけを集め、9〜11 行目の依存は `@types/node` と ssr と ssr/node の 3 つだけです。`@angular/core` を読まないので、Angular のアプリを起動せずに、2 つの変換の関数だけを本物の Node の `http` と `http2` のサーバーで確かめます（[第 8 回](08-ssrx-node-streams.md)）。

📄 `angular-cli/tools/defaults.bzl` L62–92 （▶ の行: 62, 65, 75–76, 80, 84, 86–89）

```python
62 ▶ def jasmine_test(data = [], args = [], **kwargs):
63 │     # Create relative path to root, from current package dir. Necessary as
64 │     # we change the `chdir` below to the package directory.
65 ▶     relative_to_root = "/".join([".."] * len(native.package_name().split("/")))
66 │ 
67 │     # Chromium browser toolchain
68 │     env = kwargs.pop("env", {})
69 │     env.update({
70 │         "CHROME_BIN": "$(CHROME-HEADLESS-SHELL)",
71 │         "CHROME_PATH": "$(CHROME-HEADLESS-SHELL)",
72 │         "CHROMEDRIVER_BIN": "$(CHROMEDRIVER)",
73 │     })
74 │     toolchains = kwargs.pop("toolchains", [])
75 ▶     toolchains = toolchains + ["@rules_browsers//browsers/chromium:toolchain_alias"]
76 ▶     data = data + ["@rules_browsers//browsers/chromium"]
77 │ 
78 │     _jasmine_test(
79 │         node_modules = "//:node_modules",
80 ▶         chdir = native.package_name(),
81 │         env = env,
82 │         toolchains = toolchains,
83 │         args = [
84 ▶             "--require=%s/node_modules/source-map-support/register.js" % relative_to_root,
85 │             # Escape so that the `js_binary` launcher triggers Bash expansion.
86 ▶             "'**/*+(.|_)spec.js'",
87 ▶             "'**/*+(.|_)spec.mjs'",
88 ▶             "'**/*+(.|_)spec.cjs'",
89 ▶         ] + args,
90 │         data = data + ["//:node_modules/source-map-support"],
91 │         **kwargs
92 │     )
```

angular-cli の `jasmine_test` は、80 行目でパッケージのディレクトリに移り、86〜88 行目の glob で spec の `.js`・`.mjs`・`.cjs` を集めます。89 行目で `--test_arg` の引数がこのあとに足されるので、`--filter` が jasmine に届きます。75・76 行目で Chromium をデータに入れていますが、@angular/ssr の spec はブラウザでは走りません。

### platform-server：zone.js ありと無しの 2 つ

../angular の `packages/platform-server/test/BUILD.bazel` は、`event_replay_spec.ts` を除いたすべてを `test_lib` にまとめて `angular_jasmine_test`（zone.js を読む初期化）の `test` で走らせ、`event_replay_spec.ts` だけを `zoneless_jasmine_test` の `event_replay_test` で走らせます。ファイルの中のコメントは「zone と zoneless で共有するケースがあるので、このターゲットは zone.js で走らせる」です。その行の引用と読み方は[event-dispatch の spec の章](../jsaction/12-jsaction-tests-issues.md)にあります。`init/test` は domino を読み込んだときの shim（`applyShims()`）の 2 件だけの別のターゲットです。

### 偽物のマニフェスト：setAngularAppTestingManifest

📄 `angular-cli/packages/angular/ssr/test/testing-utils.ts` L48–80 （▶ の行: 48, 52, 56–57, 59, 63–64, 66, 70–72, 75–76）

```ts
48 ▶ export function setAngularAppTestingManifest(
49 │   routes: Routes,
50 │   serverRoutes: ServerRoute[],
51 │   baseHref = '/',
52 ▶   additionalServerAssets: Record<string, ServerAsset> = {},
53 │   locale?: string,
54 │   rootComponent: Type<unknown> = AppComponent,
55 │   extraProviders: Array<Provider | EnvironmentProviders> = [],
56 ▶   inlineCriticalCss?: Record<string, string>,
57 ▶   nonce?: string,
58 │ ): void {
59 ▶   destroyAngularServerApp();
60 │ 
61 │   let criticalCssPlans: CompactPlan[] | undefined;
62 │   if (inlineCriticalCss) {
63 ▶     criticalCssPlans = Object.entries(inlineCriticalCss).map(([href, css]) => {
64 ▶       const sheet = compileSheet(css, { href });
65 │ 
66 ▶       return encodePlan(sheet);
67 │     });
68 │   }
69 │ 
70 ▶   setAngularAppManifest({
71 ▶     criticalCssPlans,
72 ▶     nonce,
73 │     baseHref,
74 │     locale,
75 ▶     assets: {
76 ▶       'index.server.html': {
77 │         size: 25,
78 │         hash: 'f799132d0a09e0fef93c68a12e443527700eb59e6f67fcb7854c3a60ff082fde',
79 │         text: async () => `<html>
80 │           <head>
```

@angular/ssr の spec は、ビルドをせずに、この関数でマニフェストをメモリに置きます。59 行目で前のアプリを捨て、63〜67 行目でビルドと同じ `compileSheet` → `encodePlan` を通して重要 CSS の計画を作り（[第 9 回](09-ssrx-assets-css.md)）、70 行目からの `setAngularAppManifest` で `index.server.html` などのアセットを並べます。52 行目の `additionalServerAssets` で、プリレンダーした HTML を足せます。

## 3. 手元での走らせ方と結果

📄 `走らせたコマンド（platform-server）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/platform-server/test:test //packages/platform-server/test:event_replay_test \
  //packages/platform-server/init/test:test --nocache_test_results --test_output=all

# 一番外の describe の名前で絞る（jasmine の --filter は正規表現。0 件でも PASSED になるので数を見る）
pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=^resolveUrl "
```

📄 `scratchpad/ssrx-logs/c-ng-tests.log（要点）`

```
//packages/platform-server/init/test:test          PASSED in 0.5s    2 specs, 0 failures
//packages/platform-server/test:event_replay_test  PASSED in 0.9s   23 specs, 0 failures
//packages/platform-server/test:test               PASSED in 8.0s  399 specs, 0 failures
Executed 3 out of 3 tests: 3 tests pass.   （INFO: Elapsed time: 8.244s）
```
*2026-11-06、../angular（22.2.0-next.7、8576f161ae4）*

📄 `走らせたコマンド（@angular/ssr）`

```
cd ~/angular-research/angular-cli-fix   # 練習用の複製（ssr-practice 枝、44129f66a3）
pnpm bazel test //packages/angular/ssr/test:test //packages/angular/ssr/node/test:test \
  --nocache_test_results --test_output=all

pnpm bazel test //packages/angular/ssr/test:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=^getPreferredLocale "
```

📄 `scratchpad/ssrx-logs/c-cli-tests.log（要点）`

```
//packages/angular/ssr/node/test:test   PASSED in 0.2s   42 specs, 0 failures（Finished in 0.069 seconds）
//packages/angular/ssr/test:test        PASSED in 0.7s  249 specs, 0 failures（Finished in 0.303 seconds）
Executed 2 out of 2 tests: 2 tests pass.   （INFO: Elapsed time: 2.123s）
--filter=^getPreferredLocale  →  Ran 12 of 249 specs / 12 specs, 0 failures
```
*2026-11-06、練習用の複製（44129f66a3）*

- platform-server は 3 つのターゲットで 2 + 23 + 399 = 424 件、@angular/ssr は 249 + 42 = 291 件で、すべて通りました。@angular/ssr は jasmine の中の時間で 0.3 秒と 0.07 秒です。
- @angular/ssr のログには、`Received "x-forwarded-host" header but "trustProxyHeaders" was not set up to allow it.` という警告がくり返し出ます（c-cli-tests.log）。転送のヘッダーを許さない spec が、わざと送っているもので、失敗ではありません（[第 5 回](05-ssrx-proxy-headers.md)）。
- 名前での絞り込みは両方で効きます。`^getPreferredLocale ` で「Ran 12 of 249 specs」でした。0 件に絞っても PASSED になるので、件数を必ず見ます。

## 4. 修正を戻すと、どの spec が落ちるか

第 7〜9 回で、練習用の複製の行をコミットの前の形に戻して走らせた結果です。試したあとは毎回 `git checkout` で元に戻し、`git status --short` が空であることを確かめています（c-cli-reverted.log・c-cli-reverted2.log）。

| コミット | 戻したもの | 落ちた spec | 章 |
| --- | --- | --- | --- |
| `ca6f08c6e5` | Accept-Language のリダイレクトを Response の手書きに戻す | app-engine\_spec の 2 件（181・191 行目の it） | [第 7 回 ロケールの選び方](07-ssrx-i18n-locale.md) |
| `（JSDoc の例）` | getPreferredLocale の JSDoc の 2 つの例を it にして足す | 足した 1 件（Expected 'fr-FR' to be 'en-US' ほか） | [第 7 回 ロケールの選び方](07-ssrx-i18n-locale.md) |
| `b74eef889f` | response.ts を直す前の写しにする | response\_http1/2\_spec の 2 件（5 秒の時間切れ） | [第 8 回 Node のリクエストとレスポンス](08-ssrx-node-streams.md) |
| `f8576e3c8b` | request.ts から AbortController の行を消す | request\_http1/2\_spec の abort handling の 4 件 | [第 8 回 Node のリクエストとレスポンス](08-ssrx-node-streams.md) |
| `33169801c6` | sanitizeRequestHeaders を request.clone() に戻す | validation\_spec の 1 件 | [第 8 回 Node のリクエストとレスポンス](08-ssrx-node-streams.md) |
| `6a3446770a` | app.ts の ReadableStream から cancel を消す | 0 件（464 行目の it は通る） | [第 8 回 Node のリクエストとレスポンス](08-ssrx-node-streams.md) |
| `4fa81d403c` | buildServerAssetPathFromRequest から decodeURIComponent を消す | app\_spec の 5 件と app-engine\_spec の 1 件 | [第 9 回 アセットと重要 CSS](09-ssrx-assets-css.md) |
| `bb72145f9a` | CommonEngine の封じ込めを startsWith に戻す | 0 件（CommonEngine の spec が無い） | [第 9 回 アセットと重要 CSS](09-ssrx-assets-css.md) |

- 8 つのうち 6 つは、戻すとコミットが足した spec が落ちました。修正と spec が 1 対 1 で結びついています。
- 落ちなかった 2 つは理由が違います。bb72145f9a は spec を足していないコミットで、`CommonEngine` には spec がそもそもありません。6a3446770a は spec を足していますが、その it は `cancel` が無くても描画のあとの片付けで通ってしまいます。
- 「戻すと落ちるか」を確かめると、spec が何を守っているかが分かります。この表は、第 7〜9 回の「テストと直し方」の節から集めたものです。

## 5. DEMO：issue を章で絞り込む

angular の `area: server` で開いている 19 件と 2025-09-01 以降に閉じた 48 件、angular-cli の `area: @angular/ssr` で開いている 10 件と閉じた 52 件（どれも 2026-11-06 に `gh` で取得）を、題と、必要なものは本文とコメントを読んで、関係する章に振り分けました。要約はこの章の書き手が付けたもので、題をそのまま写していません。ラベルの欄からは `area:` のラベルを外しています。

| 章 | 開いている | 閉じた |
| --- | --- | --- |
| [第 1 回 resolveUrl](01-ssrx-resolve-url.md) | 0 | 1 |
| [第 2 回 location と allowedHosts](02-ssrx-location-allowed-hosts.md) | 0 | 4 |
| [第 3 回 サーバーの HttpClient](03-ssrx-server-http.md) | 2 | 2 |
| [第 4 回 ホストとヘッダーの検査](04-ssrx-host-validation.md) | 0 | 5 |
| [第 5 回 プロキシのヘッダー](05-ssrx-proxy-headers.md) | 0 | 3 |
| [第 6 回 リダイレクトと URL の照合](06-ssrx-redirects.md) | 0 | 18 |
| [第 7 回 ロケールの選び方](07-ssrx-i18n-locale.md) | 1 | 2 |
| [第 8 回 Node のリクエストとレスポンス](08-ssrx-node-streams.md) | 1 | 3 |
| [第 9 回 アセットと重要 CSS](09-ssrx-assets-css.md) | 0 | 5 |
| [renderApplication](../platform/02-ssr-render-application.md) | 5 | 9 |
| [platformServer と domino](../platform/03-ssr-platform-server.md) | 4 | 8 |
| [AngularAppEngine](../platform/04-ssr-app-engine.md) | 2 | 4 |
| [サーバールート](../platform/05-ssr-server-routes.md) | 2 | 4 |
| [プリレンダー](../platform/06-ssr-prerender.md) | 3 | 8 |
| [転送キャッシュ](../http/11-http-transfer-cache.md) | 3 | 3 |
| [サニタイズ](../domr/17-domr-sanitization.md) | 0 | 4 |
| [ハイドレーション（ノードの道順）](../platform/09-hydration.md) | 1 | 3 |
| [provideClientHydration](../platform/07-hydration-provide.md) | 1 | 0 |
| [ハイドレーションの不一致](../platform/12-hydration-errors.md) | 0 | 1 |
| [i18n のハイドレーション](../platform/13-hydration-i18n.md) | 1 | 0 |
| [インクリメンタルハイドレーション](../platform/15-incremental-hydration.md) | 0 | 2 |
| [Title・Meta](../domr/19-domr-title-meta.md) | 1 | 0 |
| [CLI の i18n](../cli/09-cli-i18n.md) | 1 | 0 |
| （どの章でもない） | 1 | 11 |

> **🧪 DEMO — SSR の issue（129 件）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ssrx-tests-issues)

表から読めることです。

- **このシリーズの 9 章に振り分けた issue は、開いているものが 4 件、閉じたものが 43 件**です。開いているのは、上限に近づいたことを知らせてほしい（第 3 回）、クッキーを付けたい（第 3 回）、103 Early Hints（第 8 回）、ドメインでロケールを選びたい（第 7 回）のように、要望が中心です。守りの穴の報告は、どれも閉じています。
- 閉じたものは [第 6 回](06-ssrx-redirects.md)（リダイレクトと URL の照合）が一番多く、2026-10 にも `redirectTo` のパラメータ・クエリ・相対の基点の報告が 4 件続けて閉じています。
- 2026 年に閉じた 78 件の内訳は、completed が 55 件、not\_planned が 19 件、duplicate が 4 件、です。NOT\_PLANNED には、#34157・#33342（重要 CSS。「beasties の側の問題」）や #32910（allowedHosts をリクエストごとに決めたい）のように、Angular の外か、設計として受けないと答えたものが入っています。
- angular の側の閉じた issue は、domino の DOM（止まる・メモリを使い切る）と、サニタイズと直列化（`</noscript>` の外へ出られる）が多く、このシリーズの範囲の外（[platformServer の章](../platform/03-ssr-platform-server.md)・[サニタイズの章](../domr/17-domr-sanitization.md)・[renderApplication の章](../platform/02-ssr-render-application.md)）です。

📄 `scratchpad/ssrx-demo/ssrx-tests-issues/make-data.mjs`

```js
// 第 10 回の表のデータを作る。使い方: RESEARCH=~/angular-research LOGS=<ssrx-logs> node make-data.mjs > tests-issues.json
// spec の欄は grep で数え、issue の欄（番号・状態・日付・ラベル）は 2026-11-06 に gh で取った JSON から読む。
// ch（関係する章）と ja（要約）は、この章の書き手が本文を読んで付けたもの。題をそのまま写さない。
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const R = process.env.RESEARCH, LOGS = process.env.LOGS;
const git = (repo, ...a) => execFileSync('git', ['-C', join(R, repo), ...a], { encoding: 'utf8' });

/* ---- spec の地図 ---- */
function walk(dir) {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
}
function specs(repo, base, dirs, ran) {
  const out = [];
  for (const d of dirs) for (const f of walk(join(R, repo, base, d)).filter((x) => x.endsWith('_spec.ts')).sort()) {
    const src = readFileSync(f, 'utf8').split('\n');
    const tops = src.flatMap((l, i) => (/^\s{0,2}describe\(/.test(l) ? [{ name: l.match(/describe\(\s*['`"](.*?)['`"]/)?.[1] ?? '?', line: i + 1 }] : []));
    out.push({ repo, file: relative(join(R, repo, base), f), lines: src.length - 1, tops, its: src.filter((l) => /^\s*(it|xit|fit)\(/.test(l)).length, ran: ran?.[relative(join(R, repo, base), f)] ?? null });
  }
  return out;
}
// platform-server：一番外の describe ごとに --filter で走らせた数（c-ng-count.log）をファイルに足し戻す
const ngCount = Object.fromEntries(readFileSync(join(LOGS, 'c-ng-count.log'), 'utf8').trim().split('\n').map((l) => [l.split('\t')[0], +l.match(/Ran (\d+)/)[1]]));
const ngRan = {
  'test/url_spec.ts': ngCount['resolveUrl'], 'test/platform_location_spec.ts': ngCount['PlatformLocation'],
  'test/render_spec.ts': ngCount['renderApplication'], 'test/transfer_state_spec.ts': ngCount['transfer_state'],
  'test/utils_spec.ts': ngCount['isHostAllowed'] + ngCount['allowedHosts validation in renderApplication'] + ngCount['allowedHosts validation in renderModule'],
  'test/integration_spec.ts': ngCount['platform-server integration'], 'test/full_app_hydration_spec.ts': ngCount['platform-server full application hydration integration'],
  'test/incremental_hydration_spec.ts': ngCount['platform-server partial hydration integration'],
  'test/event_replay_spec.ts': 23, 'init/test/shims_spec.ts': 2,
};
const SPECS = [
  ...specs('angular', 'packages/platform-server', ['test', 'init/test'], ngRan),
  ...specs('angular-cli', 'packages/angular/ssr', ['test', 'node/test'], null),
];
// @angular/ssr：it の行の合計が、走った数（249 と 42、c-cli-tests.log）と同じなので、ファイルごとの数も it の行の数とする
const cliTotal = { test: 249, 'node/test': 42 };
for (const d of Object.keys(cliTotal)) {
  const xs = SPECS.filter((s) => s.repo === 'angular-cli' && s.file.startsWith(d + '/') && (d === 'node/test' || !s.file.startsWith('node/')));
  if (xs.reduce((a, s) => a + s.its, 0) !== cliTotal[d]) throw new Error('it の数が合わない ' + d);
  for (const s of xs) s.ran = s.its;
}

/* ---- 2026 年の修正 ---- */
const KIND = {
  // 守り＝SSRF・ホスト・プロキシのヘッダー・開いたリダイレクト・パスの封じ込め。資源＝切断・メモリ・大きさの上限。
  guard: ['6cf621c905', 'f086eccc36', '13902292e7', '4d564f66f6', 'bcd99f944e', '5adc925414', 'bb72145f9a',
    'ede7c58a2aa', '60552a73e82', '1307ff355c9', '140c4d04cb3', '0b19c92d44f', 'cf9d7fa0f80', '3e924cc8dbb', 'b3bb36ad873'],
  resource: ['b74eef889f', '6a3446770a', 'f8576e3c8b', '33169801c6', '37f1a74913', '2acca1165d7', '1a006a8f979'],
};
const kindOf = (h) => (KIND.guard.includes(h) ? 'guard' : KIND.resource.includes(h) ? 'resource' : 'behavior');
function commits(repo, file, scopeRe, pkg) {
  return readFileSync(join(LOGS, file), 'utf8').trim().split('\n').map((l) => l.match(/^(\S+) (\S+) (.*)$/))
    .filter((m) => m && m[2].startsWith('2026') && scopeRe.test(m[3]))
    .map(([, h, d, s]) => {
      let srcAdd = 0, srcDel = 0, specAdd = 0;
      for (const row of git(repo, 'show', '--numstat', '--format=', h).trim().split('\n').filter(Boolean)) {
        const [a, del, p] = row.split('\t');
        if (!pkg.some((x) => p.startsWith(x))) continue;
        if (/_spec\.ts$|\/test\/|testing-utils/.test(p)) specAdd += +a || 0;
        else if (p.endsWith('.ts')) { srcAdd += +a || 0; srcDel += +del || 0; }
      }
      return { repo, h, d, s, srcAdd, srcDel, specAdd, kind: kindOf(h) };
    });
}
const COMMITS = [
  ...commits('angular-cli', 'cli-commits.txt', /^(fix|perf)\(@angular\/ssr\)/, ['packages/angular/ssr/']),
  ...commits('angular', 'ng-commits.txt', /^fix\(platform-server\)|^fix\(http\): (Introduce a max buffer|cancel oversized)/, ['packages/platform-server/', 'packages/common/http/']),
];

/* ---- issue ---- */
// [番号, 章, 要約]
const NOTE = {
  // angular（area: server）開いている
  71603: ['ssr-platform-server', 'domino が反映しないプロパティ（popover・inert など）の束縛が、SSR の HTML から落ちる'],
  70926: ['ssr-platform-server', 'domino が書式の要素を組み直すときに、ヒープを使い切ることがある'],
  70462: ['ssr-render-application', '直列化の代わりの道で、RAWTEXT の閉じタグが複数の Text にまたがって組み立てられる'],
  69900: ['ssr-render-application', 'SVG の中の <style> の文字の直列化'],
  69388: ['ssrx-server-http', 'SSR の fetch の応答が大きさの上限に近づいたことを知らせてほしい'],
  67016: ['http-transfer-cache', 'TransferState 全体の JSON に、書き出しと読み込みのフックがほしい'],
  63591: ['cli-i18n', 'ロケールのデータを実行時に遅延で読めない'],
  62053: ['hydration-provide', 'ハイドレーションを有効にしたテストで NG0505 の警告が出る'],
  59144: ['ssr-render-application', 'renderApplication などに、アプリの providers を渡したい'],
  58780: ['hydration', 'select がハイドレーションのときにちらつく'],
  58377: ['domr-title-meta', 'SEO のメタデータを宣言的に書く部品がほしい'],
  57185: ['http-transfer-cache', 'サーバーで失敗した応答を転送キャッシュに入れられない'],
  57080: ['http-transfer-cache', 'サーバーとブラウザで URL が違うリクエストもキャッシュしたい'],
  51624: ['hydration-i18n', 'i18n の印を付けた文字列が SSR でおかしく出る'],
  48205: ['ssr-platform-server', 'domino がブラウザのバンドルに入ったら知らせてほしい'],
  51549: ['ssr-render-application', 'renderModule・renderApplication に時間切れを付けたい'],
  48746: ['ssr-platform-server', 'Shadow DOM とカスタム要素をサーバーで扱いたい'],
  33642: ['ssr-render-application', 'アプリで投げたエラーで renderModuleFactory が reject しない'],
  15730: ['ssrx-server-http', 'サーバーの HTTP リクエストにクッキーを付けたい'],
  // angular 閉じた
  71792: ['ssr-platform-server', 'domino の querySelector が一致なしで null でなく undefined を返す（#51068 と同じ）'],
  71195: ['domr-sanitization', '深く入れ子の HTML のサニタイズで SSR のワーカーが止まる'],
  71076: ['ssrx-redirects', 'パスの正規化で、同じオリジンの遷移が別のオリジンへのリダイレクトになる'],
  70873: ['domr-sanitization', 'mXSS 対策の安定化の繰り返しで、domino の ID の索引がメモリを使い切る'],
  70850: ['ssr-platform-server', '壊れた属性セレクタで domino が止まる'],
  70826: ['domr-sanitization', '数字の属性名のサニタイズでメモリを使い切る'],
  70726: ['ssr-platform-server', '空の ~= セレクタで domino が止まる'],
  70657: ['ssr-platform-server', '値の無い属性がたくさんあるとメモリを使い切る'],
  70652: ['ssr-render-application', '直列化の代わりの道で、生の中身の祖先の判定がタグ名とずれる'],
  70620: ['domr-sanitization', 'innerHTML の壊れた HTML のサニタイズで止まる'],
  70540: ['ssrx-server-http', 'ServerXhr の URL の解析の食い違いで、同じオリジンの確認のあとに外へ出られた'],
  70447: ['ssrx-resolve-url', '権限部の無い http: の URL が、前の SSRF の修正をすり抜けた'],
  70439: ['ssr-render-application', 'コメントのノードの直列化で思わぬマークアップができる'],
  70198: ['incremental-hydration', '脱水したままの @defer の塊が、データが変わっても更新されない'],
  70146: ['ssr-render-application', '#70050 の続き：処理命令から </noscript> の外へ出られた'],
  70055: ['ssr-render-application', '#70050 の続き：SVG・MathML から </noscript> の外へ出られた'],
  70050: ['ssr-render-application', '22.0.7 から、コメントと入れ子の生の中身で </noscript> をエスケープしなくなった'],
  69785: ['ssr-platform-server', 'input の値の null が文字列の "null" で出る'],
  69667: ['ssrx-location-allowed-hosts', '更新したら SSR で NG05703（location の origin の検査）が出る'],
  69260: ['ssr-platform-server', 'platformServer の onDestroy が描画のたびに ngServerMode を undefined に戻す'],
  69180: ['hydration', 'サーバーの HTML にもう有る要素で、ハイドレーションのときに animate.enter が走る'],
  68986: ['', 'iOS の WebView で Angular 18 の SSR のアプリが落ちる'],
  68436: ['ssrx-location-allowed-hosts', 'リクエストの絶対形式の URL で、location の SSRF の修正をすり抜けた'],
  68322: ['ssrx-location-allowed-hosts', 'withHashLocation と SSR の組で Invalid URL になる'],
  67928: ['hydration', 'ng-content のあるハイドレーションでエラー'],
  67822: ['ssrx-host-validation', 'AngularNodeAppEngine で「どのホストでも」を許したい（重複）'],
  67788: ['ssr-app-engine', '既定のキャッシュの仕方で、配布のあとに ChunkLoadError が出る'],
  67000: ['ssrx-proxy-headers', 'SSR の例が Host と転送のヘッダーから URL を作っている（重複）'],
  66827: ['http-transfer-cache', 'httpResource.arrayBuffer が SSR で [Object object] のエラー'],
  66776: ['hydration-errors', 'NG0501 の診断を止める公開の API がほしい'],
  65811: ['ssr-render-application', 'TransferState の直列化のエラーが伝わらない'],
  65583: ['', '新しい SSR のプロジェクトに withFetch を足してほしい'],
  65310: ['http-transfer-cache', 'ハイドレーション用の JSON の相対 URL が検索エンジンに拾われる'],
  65263: ['incremental-hydration', 'withIncrementalHydration を既定にしてほしい'],
  64884: ['ssr-render-application', 'SERVER_CONTEXT のトークンを公開してほしい'],
  64223: ['', 'App Shell とハイドレーションが合わないことを文書に書いてほしい'],
  64175: ['ssr-platform-server', 'CustomEvent で SSR が壊れる'],
  63524: ['ssr-render-application', 'ng serve で「状態を 2 回直列化する」という誤った警告'],
  59241: ['', 'サーバーだけのサービスを書きやすくしてほしい'],
  58128: ['http-transfer-cache', 'TransferState のデータを signal で受けたい'],
  55635: ['ssrx-server-http', 'SSG で withXsrfConfiguration と相対パスが合わない'],
  55512: ['', 'ngTemplateOutlet とハイドレーション無しで、画像の遅延読み込みが SSR で効かない'],
  54267: ['ssr-render-application', 'SSG が Firebase のリクエストの終わりを待たない'],
  53168: ['', 'サーバーだけのサービスの作り方を文書に'],
  53191: ['hydration', 'esbuild で遅延読み込みした部品のハイドレーションが失敗する'],
  51068: ['ssr-platform-server', '束ねた domino の querySelector が null でなく undefined を返す'],
  50787: ['', 'URL の丸括弧で NG04002（ルートが一致しない）'],
  23329: ['', 'Angular Elements がページのすべての要素に ng-version を付ける'],
  // angular-cli（area: @angular/ssr）開いている
  33819: ['ssrx-node-streams', '@angular/ssr/node から 103 Early Hints を送る提案（計測つき）'],
  33555: ['ssr-server-routes', 'ルートの設定の食い違いで、クライアントだけのデータが公開のキャッシュのヘッダーで返る'],
  32490: ['ssr-prerender', 'クライアントの ** ルートがあると、具体的なサーバールートのプリレンダーが効かない'],
  31340: ['ssr-server-routes', 'ルートの取り出しを止める設定がほしい'],
  30305: ['ssr-app-engine', 'リクエストをまたぐキャッシュ'],
  29787: ['ssr-prerender', 'プリレンダーが違う package.json を読む'],
  29449: ['ssr-app-engine', 'APP_BASE_HREF をリクエストごとに変えたい'],
  29425: ['ssr-prerender', 'パラメータつきのページごとの App Shell'],
  29188: ['', 'outputMode: server の ng build で proxy の設定を使いたい'],
  29111: ['ssrx-i18n-locale', 'ドメインごとにロケールを選びたい'],
  // angular-cli 閉じた
  34569: ['ssr-prerender', 'プリレンダーのパラメータの値を検査する（ビルド時の SSRF・開いたリダイレクト）'],
  34567: ['ssrx-node-streams', 'リクエストを中断すると handle() は reject するが、描画は続く'],
  34511: ['ssrx-redirects', '文字列の redirectTo で、クエリとフラグメントの末尾のスラッシュが落ちる'],
  34474: ['ssr-prerender', 'プリレンダーのパラメータがエスケープされず、マニフェストとリダイレクトのページに入る'],
  34410: ['ssrx-redirects', 'パラメータを使う redirectTo が、値でなく :id のまま飛ぶ'],
  34369: ['ssr-app-engine', 'tsconfig がワークスペースの直下に無いと、遅延ルートの modulepreload が付かない'],
  34365: ['ssrx-redirects', '長さに上限の無い Location ヘッダーで、プロキシの上流が外される'],
  34320: ['ssr-prerender', '入れ子の空のパスのルートで、プリレンダーした HTML の modulepreload が抜ける'],
  34300: ['ssrx-redirects', '相対の redirectTo を、段が多いルートで違う基点から解決する'],
  34298: ['ssrx-redirects', '相対の redirectTo でクエリが落ちる'],
  34157: ['ssrx-assets-css', '深く入れ子の HTML で、重要 CSS のインライン化がメモリを使い切る'],
  34148: ['ssr-server-routes', 'ルートの取り出しが途中で止まる'],
  34090: ['ssrx-redirects', 'サーバーのルートの照合と Router の答えが食い違い、別のルートのヘッダー・状態・描画方法が使われる'],
  33966: ['ssrx-assets-css', 'ASCII でないアドレスのプリレンダーした HTML が返らない'],
  33719: ['ssrx-node-streams', '詰まっているときに客が切断すると、writeResponseToNodeResponse が決着しない'],
  33706: ['ssrx-node-streams', '転送のヘッダーを消すときに、ストリームの本文を貯めてしまう'],
  33599: ['ssrx-assets-css', 'CommonEngine のような低い層の SSR の API がほしい'],
  33522: ['ssr-prerender', 'プリレンダーと SSR で部品の描画のエラーが飲み込まれる（重複）'],
  33515: ['', 'ng serve で WebSocket が動かない'],
  33504: ['ssrx-redirects', 'パラメータが複数あると resolveRedirectTo が URL を壊す'],
  33473: ['ssrx-redirects', 'UrlTree を返すガードのリダイレクトで RESPONSE_INIT のヘッダーが無視される'],
  33342: ['ssrx-assets-css', 'インライン化で、スタイルシートの media の値が onload の JavaScript に入る'],
  33203: ['ssrx-assets-css', '重要 CSS の処理（beasties）の logger を設定したい'],
  33184: ['ssrx-location-allowed-hosts', '19.2.22 から renderAngular が allowedHosts を渡さず SSR が使えない'],
  33169: ['ssrx-proxy-headers', 'trustProxyHeaders: true が思ったように効かない'],
  33154: ['ssr-prerender', '/g つきの正規表現の状態で getPrerenderParams が飛ばされる'],
  33053: ['ssrx-redirects', '正規化した URL へ 302 で飛ばしてしまう'],
  33044: ['ssrx-redirects', 'ルートのパラメータにスラッシュがあると 404'],
  32991: ['ssr-prerender', '独自の UrlSerializer で URL を書き換えると、プリレンダーが meta refresh のページを出す'],
  32910: ['ssrx-host-validation', '独自ドメインの多いアプリのために、allowedHosts をリクエストごとに決めたい'],
  32835: ['ssrx-host-validation', 'allowedHosts が下線を含むホストを許さない'],
  32751: ['ssr-app-engine', 'Angular 21 の SSR でプリレンダーした HTML でなく CSR の HTML が返る'],
  32729: ['ssrx-host-validation', '厳しいホストの検査で、独自ドメインの多いアプリが壊れる'],
  32501: ['ssrx-proxy-headers', '検査しない X-Forwarded-Prefix による開いたリダイレクト'],
  32474: ['ssr-server-routes', 'ルートの取り出しのあいだの APP_INITIALIZER を見分けたい'],
  31902: ['ssrx-redirects', '独自の base href でリダイレクトが繰り返される'],
  31881: ['ssrx-redirects', 'URL の正規化で 302 になる'],
  31675: ['ssrx-i18n-locale', 'ロケール 1 つでサブパスを使うと、手を入れないと動かない'],
  31666: ['ssr-server-routes', 'ServerRoutes で SSR を強いるときの問題'],
  31648: ['ssrx-redirects', 'redirectTo が文字列と関数で振る舞いが違う'],
  31482: ['ssrx-redirects', 'サーバーでクエリだけ変える遷移でリダイレクトを返さない'],
  31464: ['ssrx-host-validation', 'SSR のサーバー側リクエストフォージェリ'],
  31457: ['ssrx-redirects', 'マトリクスパラメータを受け付けない'],
  31387: ['', 'PM2 のクラスタで動かしたい'],
  31277: ['ssr-app-engine', '描画した HTML がリクエストのあともメモリに残る'],
  31221: ['ssr-prerender', '一部のルートだけをプリレンダーしたい'],
  31064: ['ssrx-redirects', '空のパスの子が 2 段あると、静的なリダイレクトが壊れる'],
  29238: ['ssr-server-routes', 'APP_INITIALIZER の Router.resetConfig で足したルートに SSR で届かない'],
  29173: ['ssr-prerender', 'SSG で foo/index.html でなく foo.html を出したい'],
  29019: ['ssrx-i18n-locale', 'SSR でロケールを手で指定したい'],
  27539: ['', 'Server Actions がほしい'],
  32139: ['ssrx-redirects', 'SEO のために状態コードつきのリダイレクトを返したい'],
};
const ISSUES = [];
for (const [file, repo, state] of [['ng-open.json', 'angular', 'open'], ['ng-closed.json', 'angular', 'closed'], ['cli-open.json', 'angular-cli', 'open'], ['cli-closed.json', 'angular-cli', 'closed']]) {
  for (const i of JSON.parse(readFileSync(join(LOGS, file), 'utf8')).items) {
    const note = NOTE[i.number];
    if (!note) throw new Error('要約が無い #' + i.number);
    ISSUES.push({ repo, n: i.number, state, reason: i.state_reason ?? '', opened: i.created_at?.slice(0, 10) ?? '', closed: i.closed_at?.slice(0, 10) ?? '', labels: (i.labels ?? []).filter((l) => !/^area: /.test(l)), ch: note[0], ja: note[1] });
  }
}
console.log(JSON.stringify({ SPECS, COMMITS, ISSUES }));

```
*表のデータを作ったスクリプトの全文（記録）*

📄 `scratchpad/ssrx-demo/ssrx-tests-issues/count-ng.sh`

```sh
#!/bin/zsh
# platform-server の //packages/platform-server/test:test を、一番外の describe の名前ごとに絞って走らせ、「Ran N of M specs」を集める。
cd "$RESEARCH/angular"
for name in 'resolveUrl' 'PlatformLocation' 'renderApplication' 'transfer_state' 'isHostAllowed' 'allowedHosts validation in renderApplication' 'allowedHosts validation in renderModule' 'platform-server integration' 'platform-server full application hydration integration' 'platform-server partial hydration integration'; do
  n=$(pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all "--test_arg=--filter=^$name " 2>&1 | grep -E 'Ran [0-9]+ of [0-9]+ specs|^[0-9]+ specs' | head -2 | tr '\n' ' ')
  echo "$name\t$n"
done

```
*platform-server の数を describe ごとに数えたスクリプト（記録）*

## 6. 2026 年の修正の傾向

共通のブリーフの cli-commits.txt（angular-cli の `packages/angular/ssr`）と ng-commits.txt（angular の `packages/platform-server` ほか）から、2026 年の `fix(@angular/ssr)`・`perf(@angular/ssr)`・`fix(platform-server)` と、SSR の応答の大きさに上限を付けた `fix(http)` の 2 本を選び、`git show --numstat` でパッケージの中の src と spec の行数を数えました。種類はこの章の書き手が付けたもので、「守り」は SSRF・ホスト・転送のヘッダー・開いたリダイレクト・パスの封じ込め、「資源」は切断・メモリ・大きさの上限です。

| リポジトリ | コミット | 日付 | 種類 | 題 | src（足した / 消した行） | spec（足した行） |
| --- | --- | --- | --- | --- | --- | --- |
| angular-cli | `23e3d44a7f` | 2026-09-03 | 振る舞い | perf(@angular/ssr): pre-compile critical CSS plans at build time | +66 / −327 | +88 |
| angular-cli | `4fa81d403c` | 2026-08-31 | 振る舞い | fix(@angular/ssr): decode pathname when constructing server asset path | +7 / −0 | +157 |
| angular-cli | `bb72145f9a` | 2026-08-28 | 守り | fix(@angular/ssr): ensure public directory containment in CommonEngine | +8 / −6 | +0 |
| angular-cli | `f8576e3c8b` | 2026-08-20 | 資源 | fix(@angular/ssr): abort web request signal when node request is aborted | +9 / −0 | +76 |
| angular-cli | `6a3446770a` | 2026-08-07 | 資源 | fix(@angular/ssr): destroy platform when response stream is cancelled | +24 / −7 | +11 |
| angular-cli | `b74eef889f` | 2026-07-31 | 資源 | fix(@angular/ssr): settle writeResponseToNodeResponse when client disconnects | +90 / −14 | +88 |
| angular-cli | `33169801c6` | 2026-07-31 | 資源 | perf(@angular/ssr): avoid buffering request body when sanitizing headers | +2 / −3 | +35 |
| angular-cli | `0bd22dae09` | 2026-07-06 | 振る舞い | fix(@angular/ssr): replace all route parameters when resolving relative redirects | +1 / −1 | +29 |
| angular-cli | `d9fb854c9a` | 2026-06-26 | 振る舞い | fix(@angular/ssr): preserve response headers during redirect | +6 / −4 | +5 |
| angular-cli | `37f1a74913` | 2026-06-16 | 資源 | fix(@angular/ssr): avoid caching non-SSG page lookups | +6 / −4 | +0 |
| angular-cli | `5875b6024f` | 2026-06-11 | 振る舞い | fix(@angular/ssr): prioritize options over environment variables in AngularNodeAppEngine | +2 / −2 | +0 |
| angular-cli | `ddcef9d484` | 2026-06-11 | 振る舞い | fix(@angular/ssr): correct grammar in console warning for redirected location headers | +1 / −1 | +1 |
| angular-cli | `21ca098829` | 2026-05-28 | 振る舞い | fix(@angular/ssr): support server-side rendering configuration options | +87 / −1 | +0 |
| angular-cli | `b75423d7a0` | 2026-05-13 | 振る舞い | fix(@angular/ssr): support all X-Forwarded-\* headers when trustProxyHeaders is true | +15 / −11 | +52 |
| angular-cli | `0fdcde5426` | 2026-05-11 | 振る舞い | fix(@angular/ssr): remove stateful flag from URL\_PARAMETER\_REGEXP | +8 / −3 | +0 |
| angular-cli | `126b19b9c7` | 2026-04-27 | 振る舞い | fix(@angular/ssr): add support for configuring trusted proxy headers via environment variable | +30 / −19 | +0 |
| angular-cli | `53b9623b7b` | 2026-04-27 | 振る舞い | fix(@angular/ssr): decode route segments when building and matching route tree | +1 / −2 | +10 |
| angular-cli | `c34c569b07` | 2026-04-27 | 振る舞い | fix(@angular/ssr): use router to normalize URLs for comparison | +17 / −10 | +17 |
| angular-cli | `5adc925414` | 2026-04-24 | 守り | fix(@angular/ssr): enforce explicit opt-in for proxy headers | +196 / −159 | +90 |
| angular-cli | `e7e434ca3d` | 2026-03-26 | 振る舞い | fix(@angular/ssr): allow underscores in host validation | +1 / −1 | +0 |
| angular-cli | `bcd99f944e` | 2026-03-25 | 守り | fix(@angular/ssr): patch Headers.forEach in cloneRequestAndPatchHeaders | +13 / −0 | +19 |
| angular-cli | `3b99ee140d` | 2026-03-25 | 振る舞い | fix(@angular/ssr): support '\*' in allowedHosts and warn about security risks | +17 / −2 | +16 |
| angular-cli | `ca6f08c6e5` | 2026-03-24 | 振る舞い | fix(@angular/ssr): apply forwarded prefix and vary header in accept-language redirects | +10 / −8 | +15 |
| angular-cli | `ff1160e301` | 2026-03-17 | 振る舞い | fix(@angular/ssr): ensure unique values in redirect response Vary header | +10 / −5 | +8 |
| angular-cli | `998b8298e3` | 2026-03-16 | 振る舞い | fix(@angular/ssr): support custom headers in redirect responses | +27 / −6 | +60 |
| angular-cli | `4d564f66f6` | 2026-03-16 | 守り | fix(@angular/ssr): disallow x-forwarded-prefix starting with a backslash | +2 / −2 | +4 |
| angular-cli | `0f41585a7c` | 2026-03-03 | 振る舞い | fix(@angular/ssr): introduce DI token to signal route discovery process | +24 / −0 | +23 |
| angular-cli | `13902292e7` | 2026-02-27 | 守り | fix(@angular/ssr): improve header validation logic | +36 / −11 | +88 |
| angular-cli | `f086eccc36` | 2026-02-23 | 守り | fix(@angular/ssr): prevent open redirect via X-Forwarded-Prefix header | +27 / −9 | +79 |
| angular-cli | `6cf621c905` | 2026-02-23 | 守り | fix(@angular/ssr): validate host headers to prevent header-based SSRF | +487 / −30 | +397 |
| angular-cli | `fd1a2091d2` | 2026-01-10 | 振る舞い | fix(@angular/ssr): handle platform destruction during rendering | +11 / −1 | +17 |
| angular | `bc3a6cda5d7` | 2026-09-09 | 振る舞い | fix(platform-server): avoid sourcemap corruption during domino path substitution | +0 / −0 | +0 |
| angular | `b3bb36ad873` | 2026-08-28 | 守り | fix(platform-server): resolve HTTP(S) URLs without authority as relative during SSR | +20 / −8 | +59 |
| angular | `3e924cc8dbb` | 2026-08-25 | 守り | fix(platform-server): avoid stripping unicode whitespace during url resolution | +0 / −2 | +28 |
| angular | `1a006a8f979` | 2026-08-14 | 資源 | fix(http): cancel oversized fetch response bodies | +1 / −0 | +21 |
| angular | `cf9d7fa0f80` | 2026-06-05 | 守り | fix(platform-server): harden platform location origin validation during SSR (#69184) | +37 / −14 | +73 |
| angular | `0b19c92d44f` | 2026-05-29 | 守り | fix(platform-server): throw on suspicious URLs and restrict protocol-relative URLs | +49 / −28 | +80 |
| angular | `2acca1165d7` | 2026-05-26 | 資源 | fix(http): Introduce a max buffer size for fetch requests on SSR | +62 / −3 | +99 |
| angular | `140c4d04cb3` | 2026-05-27 | 守り | fix(platform-server): prevent SSRF bypasses via backslash URLs in HttpClient | +26 / −3 | +107 |
| angular | `1307ff355c9` | 2026-05-27 | 守り | fix(platform-server): secure location and document initialization against SSRF and path hijack | +57 / −24 | +183 |
| angular | `76235803784` | 2026-04-10 | 振る舞い | fix(platform-server): forward BEFORE\_APP\_SERIALIZED errors to ErrorHandler | +6 / −3 | +50 |
| angular | `60552a73e82` | 2026-05-05 | 守り | fix(platform-server): add \`allowedHosts\` option to \`renderModule\` and \`renderApplication\` | +69 / −8 | +97 |
| angular | `2a6b6fafb03` | 2026-04-22 | 振る舞い | fix(platform-server): ensure origin has a trailing slash when parsing url | +9 / −5 | +17 |
| angular | `ede7c58a2aa` | 2026-04-14 | 守り | fix(platform-server): prevent SSRF bypasses via protocol-relative and backslash URLs | +30 / −37 | +42 |

- **小さい**：`fix` の 42 本（angular-cli 29・angular 13）の src の変更（足した + 消した）の中央値は 19 行です。100 行を超えるのは 6cf621c905（ホストの検査を入れた最初の修正）・5adc925414（転送のヘッダーを明示して許す）・b74eef889f（切断で必ず終わる）の 3 本だけで、どれも新しい仕組みを入れたものです。
- **spec つき**：42 本のうち 34 本が spec を足しています。spec の無い 8 本は、設定の読み方（5875b6024f・126b19b9c7・21ca098829）、正規表現の 1 か所（0fdcde5426・e7e434ca3d）、`CommonEngine` のキャッシュ（37f1a74913）、ビルドの仕組み（bc3a6cda5d7）と、守りの bb72145f9a（`CommonEngine`）です。
- **守りの修正**：15 本で、src の中央値 47 行に対して spec の中央値は 79 行です。**守りの修正は、直した行より多い spec を足す**ことが多く、壊れていた入力の形を 1 つずつ it にしています（第 1〜6 回の「テストと直し方」）。spec を足したのは 15 本のうち 14 本です。
- **資源の修正**：6 本。2026-07〜08 に、切断（b74eef889f・f8576e3c8b）、プラットフォームの片付け（6a3446770a）、キャッシュを増やさない（37f1a74913）が続き、同じ時期の perf の 33169801c6 は本文を貯めないようにしました。守りの修正のあとに、その副作用（本文の tee）を直したものも入っています。
- **続けて直す**：同じ穴を、別の入力の形で何度も直しています。platform-server の URL の解決は ede7c58a2aa → 0b19c92d44f → 3e924cc8dbb → b3bb36ad873、転送の接頭辞は f086eccc36 → 4d564f66f6 → 5adc925414 です。issue の側も「前の修正をすり抜けた」という題（#70447・#68436 など）が並びます。

## このシリーズで見つけたもの

第 1〜9 回を書く途中で、本家の不具合らしきものと、テストや文書の小さな食い違いが見つかりました。どれも **issue も PR も出していません**。どれも Node で本物のコード（配布物か、../angular・../angular-cli のソースを束ねたもの）を動かして再現し、ソースの行（angular 8576f161ae4、angular-cli 44129f66a3）と照らして確かめました。どれも守りの迂回ではありません。gh で探した範囲では、同じ報告は見つかりませんでした。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| renderApplication に `url` を渡さないと、サーバーの `location.origin` が `undefined://` になり、`replaceState('/next?x=1')` のあとの `PlatformLocation.href` が `undefined:///next?x=1` になる（pathname は正しい） | parseDocument の既定の url と、同梱の domino の origin の getter | renderApplication の記録（url 無しの場面） | [第 2 回](02-ssrx-location-allowed-hosts.md) |
| `provideServerRendering({ maxResponseBodySize: 0 })` を渡しても、上限は既定の 1 MB のまま | platform-server の provide\_server.ts 39 行目（値が真のときだけ provide する） | 注入器のトークンの値の記録 | [第 3 回](03-ssrx-server-http.md) |
| パスに不正なパーセントの並び（`/%E0%A4%A` など）があると、ルートの照合で URIError が投げられ、404 ではなく例外で終わる | @angular/ssr の routes/route-tree.ts 210 行目（`map(decodeURIComponent)`、ServerRouter.match に catch が無い） | ServerRouter.match の記録 | [第 6 回](06-ssrx-redirects.md) |
| `user@example.com` や空白を含む Host は、Node の経路では検査の前の `new URL` / `new Request` で TypeError になり、400 ではなく例外で終わる | node/src/request.ts の URL の組み立て（validateRequest より前） | 本物の IncomingMessage を通した記録 | [第 4 回](04-ssrx-host-validation.md)・[第 8 回](08-ssrx-node-streams.md) |
| allowedHosts の側は小文字にされないので、`Example.COM` と書くとどの Host とも一致しない（いつも弾く側に倒れる） | utils/validation.ts の isHostAllowed | validateRequest の記録 | [第 4 回](04-ssrx-host-validation.md) |
| リダイレクトの Vary は大文字と小文字を区別して重複を除くので、`x-forwarded-prefix` を渡すと同じ名前が 2 つ並ぶ。本番では状態コードを調べないので、200 でも Location 付きの応答が作られる | utils/redirect.ts の createRedirectResponse | createRedirectResponse の記録 | [第 6 回](06-ssrx-redirects.md) |
| getPreferredLocale の JSDoc の例が実物と違う。`en;q=0.9,fr-FR;q=0.8` の答えは実物では fr-FR（完全一致が q 値より先）、一致が無いときは undefined ではなく先頭のロケール。例をそのまま it にすると落ちる | i18n.ts 114〜118 行目 | getPreferredLocale の記録と、複製で足した it | [第 7 回](07-ssrx-i18n-locale.md) |
| basePath が `/base` のとき、`/base/` はロケールへリダイレクトされず null になる（末尾のスラッシュを落とした basePath と pathname を文字列のまま比べる）。spec のマニフェストはどれも basePath が `/` | app-engine.ts のロケールの入口を選ぶ行 | AngularAppEngine の記録 | [第 7 回](07-ssrx-i18n-locale.md) |
| 変換の前に req の本文を読み切っていると、そのあと客が切断しても Web の Request の signal が中断されない（'close' が先に来て 'aborted' の聞き手が外れる） | node/src/request.ts の createWebRequestFromNodeRequest | 127.0.0.1 に立てた http サーバーの記録 | [第 8 回](08-ssrx-node-streams.md) |
| CommonEngine は環境変数 NG\_ALLOWED\_HOSTS を options より先に使う。AngularNodeAppEngine は 5875b6024f で options が先になったが、こちらは変わっていない | node/src/common-engine/common-engine.ts 85 行目 | CommonEngine の記録 | [第 9 回](09-ssrx-assets-css.md) |
| （テスト）platform-server の utils\_spec.ts 83〜93 行目の it は、投げなければ expect が 1 つも走らない。@angular/ssr の app\_spec.ts 464 行目の it は、6a3446770a の cancel を消しても通る。bb72145f9a は spec を足しておらず、CommonEngine の spec は無い | 各 spec の行 | spec の行を読む。app\_spec は複製で行を戻して走らせた | [第 2 回](02-ssrx-location-allowed-hosts.md)・[第 8 回](08-ssrx-node-streams.md)・[第 9 回](09-ssrx-assets-css.md) |
| （文書）コミットの本文と差分が違う。140c4d04cb3 は「エンコードする」と書くが差分は `/` に置き換える。2acca1165d7 は「既定 10 MB」と書くがコードは 1 MB。hooks.ts 47 行目の「mutated」は 73 行目の写しと合わない | 各コミットと hooks.ts | git show と、ソースの行 | [第 3 回](03-ssrx-server-http.md)・[第 9 回](09-ssrx-assets-css.md) |

読み方の目安: 上の 4 つは、利用者の目に見える振る舞い（壊れた URL、効かない設定、500 になる応答）なので、影響がいちばん大きいものです。守りのコードは、どれも最後は「弾く側」に倒れていました。issue を探すときは、題の言葉より、表の「どこ」のファイル名や関数名で gh を検索すると見つけやすくなります。

## テストが走るまでの呼び出し

- 👤 `pnpm bazel test //packages/angular/ssr/test:test` — あなたのコマンド（angular-cli-fix）
  - `jasmine_test(name = "test", data = [":esm_tests_bundled"], flaky = True)` — packages/angular/ssr/test/BUILD.bazel 30〜36
    - `_jasmine_test(chdir = package_name(), args = ["'**/*+(.|_)spec.js'", …] + args)` — tools/defaults.bzl 78〜92 — *--test\_arg はここで足される*
      - `spec_bundle(name = "esm_tests_bundled")` — BUILD.bazel 23〜28 — *ESM の spec を 1 つに束ねる*
        - `ts_project(name = "unit_test_lib", srcs = glob(["**/*.ts"]))` — BUILD.bazel 4〜21 — *12 ファイル、249 件*
          - `setAngularAppTestingManifest(routes, serverRoutes, …)` — test/testing-utils.ts 48 — *ビルドせずにマニフェストを置く*

## 聞かれそうな質問

**Q. SSR の守りの修正を確かめるには、どのターゲットを走らせればいいですか？**

platform-server の側（URL の解決・location・HttpClient）は ../angular の `//packages/platform-server/test:test` で、`--filter=^resolveUrl ` のように名前で絞れます。@angular/ssr の側（ホスト・転送のヘッダー・リダイレクト）は angular-cli の `//packages/angular/ssr/test:test`、Node の変換は `//packages/angular/ssr/node/test:test` です。どれも数秒で終わります（3 節）。

**Q. @angular/ssr の spec は、どうやってビルドせずにアプリを描画しているのですか？**

testing-utils.ts の `setAngularAppTestingManifest`（48 行目）が、ビルドの出力の代わりのマニフェストをメモリに置きます。HTML のアセットは文字列を返す関数で、重要 CSS の計画は 63〜67 行目でビルドと同じ関数で作ります。部品は spec の中で JIT（`@angular/compiler`）でコンパイルします。

**Q. ログに 3 回分の結果が出るのはなぜですか？**

`//packages/angular/ssr/test:test` の 35 行目に `flaky = True` があるからです。落ちると bazel が走らせ直し、3 回とも落ちて初めて FAILED になります。修正を戻して確かめるときは、3 回とも同じ it が落ちていることを見ます。

**Q. 2026 年の SSR の修正は、どういう形が多いですか？**

6 節の表のとおり、`fix` は src の中央値 19 行で、42 本のうち 34 本が spec を足しています。守りの修正は 15 本で、直した行より多い spec を足し、壊れていた入力を 1 つずつ it にします。同じ穴を別の入力の形で何本かに分けて直すのも特徴です。

**Q. 開いている issue のうち、このシリーズの行に関係するものは？**

5 節の DEMO で「このシリーズの 9 章」を選ぶと 4 件です。どれも要望で、守りの穴の報告は残っていません。閉じたものは第 6 回のリダイレクトが一番多く、新しい本家ではそのあとも `redirectTo` の修正が続いています。

## 読み終えて

- platform-server の spec は 424 件で、ほとんどがハイドレーション。このシリーズの URL・location・allowedHosts の spec は 36 件。
- @angular/ssr は test（249 件、`flaky = True`）と node/test（42 件、Angular を読まない）の 2 つ。どちらも `--filter` で名前を絞れる。
- 修正を戻すと、多くはそのコミットが足した spec が落ちる。落ちない 2 つ（CommonEngine と、ストリームの `cancel`）は、spec の穴の場所。
- 2026 年の SSR の修正は、小さく、ほとんどが spec つき。守りの修正は直した行より多い spec を足し、同じ穴を入力の形ごとに続けて直している。

---

← 前: [サーバーのアセットと重要 CSS：ServerAssets・hooks・CommonEngine](09-ssrx-assets-css.md)  
次: [Navigation API の型と PlatformNavigation：Angular が型を自分で持つ理由](../navx/01-navx-api-types.md) →
