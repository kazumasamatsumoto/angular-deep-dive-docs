[目次](../README.md) › [コントリビュートの道](README.md) › 第 2 回 / 全 15 回

# リポジトリの地図：packages・goldens・tools・adev はどこに何があるか

> angular/angular の最上位のディレクトリ（packages / modules / integration / adev / goldens / tools / scripts / devtools / vscode-ng-language-service / dev-app / third\_party / contributing-docs / .ng-dev / .github、AI エージェント向けの AGENTS.md と skills）の役割と、packages.bzl で決まる npm に出るパッケージの一覧、packages の中のパッケージごとの src と test の対応。このサイトで読んできた章の対象ファイルが地図のどこにあるか、変更したいときに最初に開くべき場所とテストのターゲット。CLI と Material/CDK が別リポジトリであること。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-repo-map)

---

この章で分かること: `angular/angular` を clone すると最上位に 20 個ほどのディレクトリが並びます。そのそれぞれが何のためにあり、このサイトで読んできたファイルがどこにあるか、「〜を直したい」と思ったときに最初に開く場所とテストの場所はどこかを、`ls` の結果と設定ファイルの行で確かめます。

読む対象は `../angular` の `packages.bzl`、`package.json` の scripts、`adev/README.md`、`integration/README.md`、`AGENTS.md`、`packages/zone.js/package.json`、`.github/ISSUE_TEMPLATE/config.yml` です。

1. [1. 全体像](01-contrib-overview.md)
2. 2. リポジトリの地図
3. [3. 手元の準備](03-contrib-setup.md)
4. [4. Bazel の読み方](04-contrib-bazel.md)
5. [5. テストを走らせる](05-contrib-run-tests.md)
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

> [!TIP]
> **新卒エンジニアへ**
>
> このリポジトリは**モノレポ**（複数のパッケージを 1 つのリポジトリで管理する形）です。`@angular/core` も `@angular/router` も `zone.js` も、angular.dev のサイトも、同じ git の履歴の中にあります。まず「どこからどこまでが npm に出るパッケージか」を決めているファイルから見ます。

## 1. npm に出るパッケージの一覧: packages.bzl

📄 `angular/packages.bzl` L23–50 （▶ の行: 24, 30, 38, 41–42, 46–47, 50）

```python
23 │ # All framework packages published to NPM.
24 ▶ PUBLISHED_PACKAGES = [
25 │     "@angular/animations",
26 │     "@angular/benchpress",
27 │     "@angular/common",
28 │     "@angular/compiler",
29 │     "@angular/compiler-cli",
30 ▶     "@angular/core",
31 │     "@angular/elements",
32 │     "@angular/forms",
33 │     "@angular/language-service",
34 │     "@angular/localize",
35 │     "@angular/platform-browser",
36 │     "@angular/platform-browser-dynamic",
37 │     "@angular/platform-server",
38 ▶     "@angular/router",
39 │     "@angular/service-worker",
40 │     "@angular/upgrade",
41 ▶     "angular-in-memory-web-api",
42 ▶     "zone.js",
43 │ ]
44 │ 
45 │ # All packages in the repository which are not published to NPM
46 ▶ UNPUBLISHED_PACKAGES = [
47 ▶     "@angular/docs",
48 │ ]
49 │ 
50 ▶ ALL_PACKAGES = PUBLISHED_PACKAGES + UNPUBLISHED_PACKAGES
```

24〜43 行目の `PUBLISHED_PACKAGES` が「npm に公開されるパッケージ」の全部です。30 行目の `@angular/core` も 38 行目の `@angular/router` も、それぞれ `packages/core`・`packages/router` にあります。41 行目の `angular-in-memory-web-api` は `packages/misc/angular-in-memory-web-api`、42 行目の `zone.js` は `packages/zone.js` です。46〜48 行目の `UNPUBLISHED_PACKAGES` にある `@angular/docs` だけは npm に出ません。50 行目で両方を足した `ALL_PACKAGES` を作っています。

この一覧に `@angular/cli` や `@angular/cdk` が無いことに注意してください。それらは別のリポジトリです（「聞かれそうな質問」の 3 問目）。

## 2. 最上位のディレクトリの表

`ls -a ../angular` の結果から、作業で開くことがあるものを並べます（`node_modules` と、ビルド出力の `dist/` は除きます。`dist/` は `.gitignore` に `/dist/` があり、git の管理外です）。

| ディレクトリ | 役割 | 中身の例 | 関係する回・シリーズ |
| --- | --- | --- | --- |
| `packages/` | npm に出るパッケージのソースとテスト | `core/src/render3/`、`router/src/`、`forms/test/` | 3 節。[Ivy](../ivy/02-ivy-overview.md)・[Router](../router/01-router.md) ほかほぼ全シリーズ |
| `adev/` | angular.dev のサイト。本文の Markdown は `src/content` | `src/content/guide/`、`src/content/reference/errors/` | 4 節 |
| `goldens/` | 公開 API の golden（期待する API の一覧） | `public-api/core/`、`public-api/manage.js` | [第 8 回](08-contrib-public-api.md) |
| `tools/` | Bazel の規則の包みと、ビルド・テストの補助 | `defaults.bzl`、`symbol-extractor/`、`testing/` | [第 4 回](04-contrib-bazel.md) |
| `integration/` | 配布物を入れた小さなアプリで、利用者と同じ形で試す | `cli-hello-world/`、`platform-server-hydration/` | 5 節 |
| `modules/` | npm に出さないベンチマークと playground | `benchmarks/`、`playground/`、`ssr-benchmarks/` | — |
| `dev-app/` | Angular を開発しながら試すためのアプリ | `src/`、`angular.json` | [第 14 回](14-contrib-debugging.md) |
| `devtools/` | ブラウザの拡張機能 Angular DevTools | `projects/ng-devtools/`、`projects/shell-browser/` | 6 節の scripts |
| `vscode-ng-language-service/` | VS Code の拡張機能（Angular Language Service） | `client/`、`server/`、`syntaxes/` | — |
| `scripts/` | 配布物のビルド、CI、ベンチマークのスクリプト | `build/build-packages-dist.mts` | [第 14 回](14-contrib-debugging.md) |
| `third_party/` | 外から持ち込んだソース。README は「原則として持ち込まない」と書く | `fonts.google.com/` | — |
| `contributing-docs/` | コントリビューターとチーム向けの手引き | `commit-message-guidelines.md`、`triage-and-labelling.md` | このシリーズ全体 |
| `skills/`・`.agent/`・`.gemini/`・`AGENTS.md` | AI エージェント向けの手引きと設定 | `skills/dev-skills/angular-developer/` | 7 節 |
| `.ng-dev/` | チームの CLI ツール ng-dev の設定 | `commit-message.mjs`、`pull-request.mjs`、`release.mjs` | [第 9 回](09-contrib-commit-messages.md)・[第 10 回](10-contrib-pr-flow.md) |
| `.github/` | GitHub Actions のワークフロー、issue / PR のテンプレート | `workflows/ci.yml`、`ISSUE_TEMPLATE/`、`angular-robot.yml` | [第 10 回](10-contrib-pr-flow.md)・[第 12 回](12-contrib-triage.md) |
| ルートのファイル | Node・pnpm・Bazel の入口 | `package.json`、`.nvmrc`、`MODULE.bazel`、`.bazelrc`、`packages.bzl` | [第 3 回](03-contrib-setup.md)・[第 4 回](04-contrib-bazel.md) |

## 3. packages の中: src とテストの対応

パッケージの中は、ほぼ同じ形をしています。**実装は `packages/<pkg>/src`、テストは `packages/<pkg>/test`**。`find packages -maxdepth 2 -name test -type d` で探すと、animations・benchpress・common・compiler・compiler-cli・core・elements・forms・language-service・localize・platform-browser・platform-browser-dynamic・platform-server・router・service-worker・zone.js の 16 個に `test/` があります。テストの BUILD.bazel のターゲット名は多くが `test`（Node で走る）と `test_web`（ブラウザで走る）で、`//packages/router/test:test` のようなラベルになります（ラベルの読み方は [第 4 回](04-contrib-bazel.md)）。

| パッケージ | このサイトで読んだ実装の場所 | テストの場所 | 章 |
| --- | --- | --- | --- |
| `core` | `packages/core/src/render3/`（instructions/ など）、`src/application/create_application.ts`、`src/change_detection/scheduling/`、`src/di/`、`src/hydration/` | `packages/core/test/`（`acceptance/`、`render3/`、`signals/` など） | [Ivy](../ivy/02-ivy-overview.md)・[zoneless](../zoneless/01-zoneless-default.md)・[変更検知](../cd/01-change-detection.md)・[DI](../di/01-di-overview.md)・[ハイドレーション](../platform/09-hydration.md) |
| `core/primitives` | `packages/core/primitives/signals/src/`（`signal.ts`、`computed.ts`、`graph.ts`） | `packages/core/test/signals/` など | [Signals](../signals/01-signals.md) |
| `compiler` | `packages/compiler/src/ml_parser/`、`expression_parser/`、`render3/`、`template/pipeline/` | `packages/compiler/test/`（`ml_parser/` など） | [コンパイラ](../compiler/01-compiler.md) |
| `compiler-cli` | `packages/compiler-cli/src/ngtsc/`（`typecheck/` など） | `packages/compiler-cli/test/`（`compliance/`、`ngtsc/`） | [型検査](../compiler/17-compiler-typecheck.md)・[standalone](../standalone/01-standalone.md) |
| `common` | `packages/common/src/`、HTTP は `packages/common/http/src/` | `packages/common/test/`、`packages/common/http/test/` | [HTTP](../http/01-http-overview.md) |
| `router` | `packages/router/src/`（`apply_redirects.ts`、`recognize.ts` など） | `packages/router/test/`（`integration/` も） | [Router](../router/01-router.md) |
| `forms` | `packages/forms/src/`、Signal Forms は `packages/forms/signals/` | `packages/forms/test/` | [Signal Forms](../signals/17-signal-forms.md) |
| `platform-server` | `packages/platform-server/src/` | `packages/platform-server/test/` | [SSR](../platform/01-ssr-overview.md) |
| `zone.js` | `packages/zone.js/lib/`（`zone-impl.ts`、`browser/`、`common/`）。`src` ではなく `lib` | `packages/zone.js/test/` | [zone.js](../zone/01-ngzone.md) |

> [!NOTE]
> **ポイント**
>
> テストのファイル名は `*_spec.ts`（例: `packages/forms/test/form_control_spec.ts`）と `*.spec.ts`（例: `packages/router/test/apply_redirects.spec.ts`）の 2 通りが混ざっています。どちらも BUILD.bazel の `glob` で拾われます。書き方は [第 6 回](06-contrib-reading-specs.md)で読みます。

## 4. adev: angular.dev の文書はここを直す

📄 `angular/adev/README.md` L1–25 （▶ の行: 3, 5, 20, 24）

````md
 1 │ # [Angular.dev](https://www.angular.dev)
 2 │ 
 3 ▶ This site is built with Angular.
 4 │ 
 5 ▶ The content is written primarily in Markdown format located in `src/content`. For simple edits, you can directly edit the file on GitHub and generate a Pull Request.
 6 │ 
 7 │ ## Local Development
 8 │ 
 9 │ For local development, [pnpm](https://pnpm.io/) is the preferred package manager. You can set up a local environment with the following commands
10 │ :
11 │ 
12 │ ```bash
13 │ # Clone Angular repo
14 │ git clone https://github.com/angular/angular.git
15 │ 
16 │ # Navigate to project directory
17 │ cd angular
18 │ 
19 │ # Install dependencies
20 ▶ pnpm install
21 │ 
22 │ # Build and run local dev server
23 │ # NOTE: Initial build will take some time
24 ▶ pnpm adev
25 │ ```
````

3 行目、angular.dev 自体が Angular で作られたサイトです。5 行目が直す場所の答えで、**本文は主に `src/content` の Markdown**（つまり `adev/src/content/`）。簡単な直しなら GitHub の画面で直接ファイルを編集して PR を作ってよい、とも書いています。手元で見るときは 20 行目で依存を入れ、24 行目の `pnpm adev` で開発サーバを立てます（このマシンでは `npx -y pnpm@12.3.4 adev`）。

`adev/src/content/` の下は `guide/`（ガイド）、`reference/`（`errors/` に NG0100 などエラーコードの説明が 61 ファイル）、`tutorials/`、`best-practices/` などに分かれます。

## 5. integration: 配布物を入れて利用者と同じ形で試す

📄 `angular/integration/README.md` L1–12 （▶ の行: 3–5, 7–8）

```md
 1 │ # Integration tests for Angular
 2 │ 
 3 ▶ This directory contains end-to-end tests for Angular. Each directory is a self-contained application
 4 ▶ that exactly mimics how a user might expect Angular to work, so they allow high-fidelity
 5 ▶ reproductions of real-world issues.
 6 │ 
 7 ▶ For this to work, we first build the Angular distribution via `pnpm build`, then
 8 ▶ install the distribution into each app.
 9 │ 
10 │ To test Angular CLI applications, we use the `cli-hello-world-*` integration tests.
11 │ When a significant change is released in the CLI, the applications should be updated with
12 │ `ng update`:
```

3〜5 行目、各ディレクトリは「利用者が期待するとおりに動くか」を確かめる独立したアプリで、現実の問題を忠実に再現できる、とあります。7〜8 行目がしくみで、先に `pnpm build` で配布物を作り、それを各アプリに入れて試します。`packages/*/test` の単体テストが「関数の単位」なら、integration は「npm から入れたときの単位」です。

## 6. package.json の scripts: ディレクトリごとの入口

📄 `angular/package.json` L21–49 （▶ の行: 22–24, 29–30, 35, 45, 47, 49）

```json
21 │     "ng-dev": "ng-dev",
22 ▶     "build": "node scripts/build/build-packages-dist.mts",
23 ▶     "test": "bazelisk test",
24 ▶     "test:ci": "bazelisk test -- //... -//integration/... -//adev/... -//vscode-ng-language-service/... -//devtools/... -//modules/ssr-benchmarks/...",
25 │     "integration-tests:ci": "bazelisk test -- //integration/...",
26 │     "test-tsec": "bazelisk test //... --build_tag_filters=tsec --test_tag_filters=tsec",
27 │     "lint": "pnpm --silent tslint && pnpm --silent ng-dev format changed --check",
28 │     "tslint": "tslint -c tslint.json --project tsconfig-tslint.json",
29 ▶     "public-api:check": "node goldens/public-api/manage.js test",
30 ▶     "public-api:update": "node goldens/public-api/manage.js accept",
31 │     "symbol-extractor:check": "node tools/symbol-extractor/run_all_symbols_extractor_tests.js test",
32 │     "symbol-extractor:update": "node tools/symbol-extractor/run_all_symbols_extractor_tests.js accept",
33 │     "ts-circular-deps:check": "pnpm run -s ng-dev ts-circular-deps check --config ./packages/circular-deps-test.conf.cjs",
34 │     "check-tooling-setup": "tsc --project scripts/tsconfig.json",
35 ▶     "devtools:devserver": "ibazel run //devtools/src:devserver",
36 │     "devtools:test:e2e": "cypress run --project ./devtools/cypress",
37 │     "devtools:e2e:open": "cypress open --project ./devtools/cypress",
38 │     "devtools:build:chrome": "bazelisk build --//devtools/projects/shell-browser/src:flag_browser=chrome //devtools/projects/shell-browser/src:prodapp",
39 │     "devtools:build:firefox": "bazelisk build --config snapshot-build-firefox --//devtools/projects/shell-browser/src:flag_browser=firefox //devtools/projects/shell-browser/src:prodapp",
40 │     "devtools:build:chrome:debug": "pnpm run -s devtools:build:chrome --//devtools:debug",
41 │     "devtools:build:chrome:release": "pnpm run -s devtools:build:chrome",
42 │     "devtools:build:firefox:debug": "pnpm run -s devtools:build:firefox --//devtools:debug",
43 │     "devtools:build:firefox:release": "pnpm run -s devtools:build:firefox --jobs 4",
44 │     "devtools:test": "bazelisk test --//devtools/projects/shell-browser/src:flag_browser=chrome -- //devtools/...",
45 ▶     "devtools:test:unit": "bazelisk test -- //devtools/...",
46 │     "devtools:release": "node devtools/tools/release.mts",
47 ▶     "adev": "[[ -n $CI ]] && echo 'Cannot run this pnpm script on CI' && exit 1 || ibazel run //adev:build.serve",
48 │     "adev:build": "[[ -n $CI ]] && echo 'Cannot run this pnpm script on CI' && exit 1 || bazel build //adev:build",
49 ▶     "dev": "pnpm --filter=dev-app dev",
```

1. **22〜23 行目: `build` と `test`**

   `build` は `scripts/build/build-packages-dist.mts`、`test` は `bazelisk test`。詳細は [第 5 回](05-contrib-run-tests.md)と [第 14 回](14-contrib-debugging.md)。
2. **24 行目: CI のテストは `//...` から最上位のいくつかを除く**

   `-//integration/...`、`-//adev/...`、`-//vscode-ng-language-service/...`、`-//devtools/...`、`-//modules/ssr-benchmarks/...`。最上位のディレクトリが、そのまま Bazel のパッケージの木の枝になっていることが分かります。除いたものは 25 行目などの別の script で走ります。
3. **29〜30 行目: goldens の検査と更新**

   `goldens/public-api/manage.js` を呼びます（[第 8 回](08-contrib-public-api.md)）。
4. **35・45 行目: devtools**

   開発サーバは `//devtools/src:devserver`、単体テストは `//devtools/...` をまとめて走らせます。
5. **47 行目: adev、49 行目: dev-app**

   `pnpm adev` は `ibazel run //adev:build.serve`、`pnpm dev` は `dev-app` の dev script です。

## 7. AGENTS.md と skills: AI エージェント向けの手引き

📄 `angular/AGENTS.md` L1–16 （▶ の行: 5, 9–10, 14–16）

```md
 1 │ ---
 2 │ trigger: always_on
 3 │ ---
 4 │ 
 5 ▶ This is the source code for the Angular framework. This guide outlines standard practices for AI agents working in this repository.
 6 │ 
 7 │ ## Environment
 8 │ 
 9 ▶ - Use `pnpm` for package management.
10 ▶ - Use `pnpm bazel test //target` to run tests.
11 │ 
12 │ ## Key Documentation
13 │ 
14 ▶ - [Building and Testing](contributing-docs/building-and-testing-angular.md): definitive guide for running targets.
15 ▶ - [Coding Standards](contributing-docs/coding-standards.md): style guide for TypeScript and other files.
16 ▶ - [Commit Guidelines](contributing-docs/commit-message-guidelines.md): format for commit messages and PR titles.
```

5 行目のとおり、`AGENTS.md` はこのリポジトリで作業する AI エージェント向けの決まりです。9〜10 行目で pnpm を使い、`pnpm bazel test //target` でテストを走らせる、と書いています。14〜16 行目は、人間のコントリビューター向けの文書（`building-and-testing-angular.md`、`coding-standards.md`、`commit-message-guidelines.md`）を指しています。人間にとっても、この 3 つが最初に読む文書だという要約になっています。続く Testing の段は [第 6 回](06-contrib-reading-specs.md)で読みます。`.agent/rules/agents.md` はこのファイルへのシンボリックリンクです（`ls -la .agent/rules/` で確かめられます）。

📄 `angular/skills/dev-skills/README.md` L16–30 （▶ の行: 17, 22, 26, 30）

````md
16 │ ```bash
17 ▶ npx skills add https://github.com/angular/skills
18 │ ```
19 │ 
20 │ ## Contributions
21 │ 
22 ▶ We welcome contributions to the Angular agent skills. If you would like to contribute to the skills, please make the updates directly in `angular/angular` repository, and to that repository will be output here as a part of our infrastructure setup.
23 │ 
24 │ ### Feedback & Issues
25 │ 
26 ▶ If you encounter a bug, have feedback, or want to suggest an improvement to the skills, please file an issue in the [angular/angular](https://github.com/angular/angular/issues/new?template=3-docs-bug.yaml) issue tracker. Providing detailed context will help us address your feedback effectively.
27 │ 
28 │ ### Features & Changes (Pull Requests)
29 │ 
30 ▶ We also accept pull requests for new features, updates, or bug fixes for the skills:
````

`skills/` は別物で、**Angular *アプリ*を書く AI エージェント向け**の手引きです。22 行目、skills への変更は `angular/angular` で直接行い、それが別のリポジトリ（17 行目の `npx skills add` が指す `angular/skills`）へ出力される、とあります。26 行目、不具合や要望は angular/angular の docs のバグのテンプレート（`3-docs-bug.yaml`）で出します。30 行目、PR も受け付けています。

## 8. 地図を歩く

> **🧪 DEMO — ディレクトリの木と「〜を直したい」**
>
> 左の木は ../angular（main の 8576f161ae4）で `ls` した結果をこの章の .ts に写した静的なデータです（実際のリポジトリは読みに行きません）。下の「直したい」を選ぶと、最初に開くファイル・テストの場所・走らせるコマンドを出します。パスとターゲット名は各 BUILD.bazel の `name =` で確かめたものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-repo-map)

## 全体の流れ（「直したい」から「走らせる」まで）

- 👤 `何を直したいか決める` — 例: ルーターのリダイレクト
  - `packages.bzl の PUBLISHED_PACKAGES で、どのパッケージか確かめる` — packages.bzl L24-43 — *無ければ別リポジトリ（angular-cli / components）*
  - `packages/router/src/apply_redirects.ts` — 実装
  - `packages/router/test/apply_redirects.spec.ts` — テスト
    - `packages/router/test/BUILD.bazel の name = "test"` — ターゲット
    - 👤 `npx -y pnpm@12.3.4 bazel test //packages/router/test:test` — AGENTS.md L10 — *第 5 回*

## 聞かれそうな質問

**Q. angular.dev の誤字はどこを直せばいい？**

`adev/src/content/` の Markdown です。`adev/README.md` 5 行目に「本文は主に `src/content` の Markdown で、簡単な直しなら GitHub の画面で直接編集して PR を作ってよい」とあります。ガイドは `adev/src/content/guide/`、エラーコードの説明は `adev/src/content/reference/errors/` です。コミットの type は `docs` になります（[第 9 回](09-contrib-commit-messages.md)）。ただし新しいトピックの追加や大きな書き直しは `CONTRIBUTING.md` で「大きな機能」扱いなので、先に issue で相談します（[第 1 回](01-contrib-overview.md)の 2 節）。

**Q. zone.js は Angular と別のライブラリなのに、なぜ packages の中にある？**

このリポジトリで開発され、npm に出されるパッケージの 1 つだからです。`packages.bzl` 42 行目で `PUBLISHED_PACKAGES` に入っています。ただし扱いは他のパッケージと少し違います。

📄 `angular/packages/zone.js/package.json` L1–12 （▶ の行: 2–3, 10）

```json
 1 │ {
 2 ▶   "name": "zone.js",
 3 ▶   "version": "0.16.3",
 4 │   "description": "Zones for JavaScript",
 5 │   "main": "./bundles/zone.umd.js",
 6 │   "module": "./fesm2015/zone.js",
 7 │   "es2015": "./fesm2015/zone.js",
 8 │   "fesm2015": "./fesm2015/zone.js",
 9 │   "typings": "./zone.d.ts",
10 ▶   "devDependencies": {
11 │     "@csstools/css-calc": "3.3.0",
12 │     "@csstools/css-color-parser": "4.2.1",
```

3 行目、版は `0.16.3` で、Angular 本体（v22.2.0-next.7）とは別の番号を持っています。10 行目から、ルートの `package.json` とは別に自分の devDependencies を持ちます。CI もそれを別に入れて、別のテストを走らせています。

📄 `angular/.github/workflows/ci.yml` L184–193 （▶ の行: 185, 188, 190）

```yaml
184 │         # Install
185 ▶       - run: pnpm -C packages/zone.js install --frozen-lockfile
186 │         # Run zone.js tools tests
187 │       - run: pnpm -C packages/zone.js promisefinallytest
188 ▶       - run: pnpm -C packages/zone.js jest:test
189 │       - run: pnpm -C packages/zone.js jest:nodetest
190 ▶       - run: pnpm -C packages/zone.js vitest:test
191 │       - run: pnpm -C packages/zone.js vitest-globals:test
192 │       - run: pnpm -C packages/zone.js electrontest
193 │       - run: pnpm -C packages/zone.js/test/typings test
```

185 行目で `packages/zone.js` の中だけ `pnpm install` し、188 行目の jest、190 行目の vitest など、テストランナーごとのパッチを確かめています。zone.js が jest や vitest にパッチを当てる機能を持つためです（[zone.js のパッチ](../zone/03-zone-patching.md)）。同じリポジトリにあるので、Angular 側の変更と zone.js 側の変更を 1 つの PR で一緒に試せます。

**Q. ng build の不具合や Angular Material の不具合は、このリポジトリに出す？**

出しません。issue のテンプレートを選ぶ画面の設定に、別リポジトリへの案内が書いてあります。

📄 `angular/.github/ISSUE_TEMPLATE/config.yml` L1–14 （▶ の行: 1, 6–7, 9–10, 12–13）

```yaml
 1 ▶ blank_issues_enabled: false
 2 │ contact_links:
 3 │   - name: Security issue disclosure
 4 │     url: https://angular.dev/best-practices/security#report-issues
 5 │     about: Report a security issue in Angular Framework, CDK, Material, or CLI
 6 ▶   - name: Angular CLI
 7 ▶     url: https://github.com/angular/angular-cli/issues/new/choose
 8 │     about: Issues and feature requests for Angular CLI
 9 ▶   - name: Angular Material and Components Development Kit (CDK)
10 ▶     url: https://github.com/angular/components/issues/new/choose
11 │     about: Issues and feature requests for Angular Material
12 ▶   - name: Support Request
13 ▶     url: https://github.com/angular/angular/blob/main/CONTRIBUTING.md#question
14 │     about: Questions and requests for support
```

6〜7 行目、Angular CLI は `angular/angular-cli`。9〜10 行目、Angular Material と CDK は `angular/components`。1 行目で空の issue（テンプレートを使わない issue）は作れず、12〜13 行目でサポートの質問は `CONTRIBUTING.md` の Question の段へ誘導されます。このサイトでは [CLI シリーズ](../cli/01-cli-overview.md)が `angular-cli`、[CDK シリーズ](../cdk/01-cdk-overview.md)が `components` のソースを読みました。`packages.bzl` の 24〜43 行目に `@angular/cli` や `@angular/cdk` が無いのも同じ理由です。

**Q. dev-app と integration と modules/playground は何が違う？**

integration は `integration/README.md` 7〜8 行目のとおり、`pnpm build` で作った配布物を入れて「npm から入れた利用者」と同じ形で検査するテストです。dev-app は開発中に手で触って試すアプリで、package.json 49 行目の `pnpm dev` で立ち上げます（[第 14 回](14-contrib-debugging.md)）。`modules/` は `packages.bzl` の一覧に無い、npm に出さないベンチマークと playground です。

**Q. packages/core/test と packages/core/src のどちらを先に開く？**

直したい挙動の名前で `test/` を先に検索すると、その挙動を確かめている spec と、spec が呼ぶ `src/` の関数が両方見つかります。テストのターゲットは `packages/core/test/BUILD.bazel` にあり、`test/acceptance/` のようにサブディレクトリごとに別のターゲットになっている場合もあります。ファイルを含むターゲットを `bazel query` で探す方法は [第 4 回](04-contrib-bazel.md)で扱います。

## 読み終えて

- npm に出るパッケージは `packages.bzl` の `PUBLISHED_PACKAGES`（L24-43）が全部。CLI と Material/CDK はここに無く、別リポジトリ。
- パッケージの中は「実装は `src/`、テストは `test/`、ターゲットは `:test` と `:test_web`」。zone.js だけ `lib/`。
- angular.dev の本文は `adev/src/content/` の Markdown。
- 単体テストは `packages/*/test`、配布物での検査は `integration/`、手で触るのは `dev-app/`。
- 迷ったら `AGENTS.md` の 14〜16 行目が指す 3 つの文書から読む。

---

← 前: [貢献の全体像：issue から CHANGELOG まで](01-contrib-overview.md)  
次: [手元の準備：Node・pnpm・Bazel をそろえる](03-contrib-setup.md) →
