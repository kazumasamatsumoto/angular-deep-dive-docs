[目次](../README.md) › [コントリビュートの道](README.md) › 第 13 回 / 全 15 回

# コードの書き方：coding-standards と format・lint

> coding-standards.md の規則（Google の JavaScript スタイルガイドを土台にした名前の付け方・コメント・JSDoc・try-catch・テストの名前）と、それを機械で守らせる prettier（.prettierrc の 100 文字、ng-dev format changed / staged）、tslint.json（ライセンスの見出し・console.log・fdescribe・\_ メンバーの @internal）、tsec（危険な DOM への書き込みと例外の一覧）。レビューでよく指摘される点を規則の行と結び付け、エラーコード NG0xxx（RuntimeErrorCode の範囲・負の番号・ngDevMode のメッセージ）の付け方を確かめる。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-coding-standards)

---

angular/angular のコードの書き方の規則は 3 層になっています。**機械が直す**もの（prettier による整形）、**機械が落とす**もの（tslint と tsec）、そして**人が見る**もの（`coding-standards.md` の名前・コメント・JSDoc・テストの書き方）。この章では、それぞれの設定ファイルと、それを動かすコマンドの中身を行で読み、レビューでよく指摘される点を規則の行に結び付けます。最後にエラーコード `NG0xxx` の付け方を確かめます。

読む対象は `CONTRIBUTING.md` の Coding Rules、`contributing-docs/coding-standards.md`・`building-and-testing-angular.md`、`.prettierrc`・`.prettierignore`・`.editorconfig`・`.ng-dev/format.mjs`・`.husky/pre-commit`、`tslint.json` と `tools/tslint/`、`packages/tsec-exemption.json`・`tools/bazel/tsec.bzl`、`packages/core/src/errors.ts`、そして ng-dev の `format` の実装（`node_modules/@angular/ng-dev/bundles/`）です。

1. [1. 全体像](01-contrib-overview.md)
2. [2. リポジトリの地図](02-contrib-repo-map.md)
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
13. **13. コードの書き方**（この章）
14. [14. 手元で確かめる](14-contrib-debugging.md)
15. [15. 最初の PR](15-contrib-first-pr.md)

## 0. 全体の流れ

1. **書く**

   エディタは `.editorconfig` を読んで、空白 2 つのインデント・LF・行末の空白の削除をする（2 節）。
2. **コミットする**

   husky の `pre-commit` フックが `ng-dev format staged` で、ステージしたファイルを prettier で整形して add し直す（2 節）。
3. **push する前に**

   `npx -y pnpm@12.3.4 lint`。tslint と `ng-dev format changed --check` を走らせる（2・3 節）。
4. **PR の CI**

   lint ジョブで `pnpm tslint` と `ng-dev format changed --check <base>`、テストジョブの Bazel で `tsec_test`（4 節）。
5. **レビュー**

   機械が見ない名前・コメント・JSDoc・テストの名前を人が見る（5 節）。

## 1. 規則の出どころ

📄 `angular/CONTRIBUTING.md` L212–220 （▶ の行: 216–218, 220）

```md
212 │ ## <a name="rules"></a> Coding Rules
213 │ 
214 │ To ensure consistency throughout the source code, keep these rules in mind as you are working:
215 │ 
216 ▶ - All features or bug fixes **must be tested** by one or more specs (unit-tests).
217 ▶ - All public API methods **must be documented**.
218 ▶ - We follow [Google's TypeScript Style Guide][ts-style-guide], but wrap all code at **100 characters**.
219 │ 
220 ▶   An automated formatter is available, see [building-and-testing-angular.md](./contributing-docs/building-and-testing-angular.md#formatting-your-source-code).
```

📄 `angular/contributing-docs/coding-standards.md` L1–10 （▶ の行: 3, 8–10）

```md
 1 │ # Angular Framework Coding Standards
 2 │ 
 3 ▶ The coding practices in this doc apply only to development on Angular itself, not applications
 4 │ built _with_ Angular. (Though you can follow them too if you really want).
 5 │ 
 6 │ ## Code style
 7 │ 
 8 ▶ The [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html) is the
 9 ▶ basis for Angular's coding style, with additional guidance here pertaining to TypeScript. The team
10 ▶ uses `prettier` to automatically format code; automatic formatting is enforced by CI.
```

CONTRIBUTING.md の 216 行目、機能もバグ修正も**テストが必須**（[第 7 回](07-contrib-writing-a-test.md)）。217 行目、公開 API のメソッドは**説明が必須**（5 節の JSDoc）。218 行目、Google のスタイルガイドに従い、100 文字で折り返す。220 行目、整形は道具がやる。

coding-standards.md の 3 行目、ここに書くのは Angular **自身**の開発の規則で、Angular を使うアプリの規則ではありません。8〜9 行目、土台は Google の **JavaScript** スタイルガイドで、TypeScript のための追加をこの文書に書く（CONTRIBUTING.md の 218 行目は「TypeScript Style Guide」と書いていて、2 つの文書で呼び方が違います）。10 行目、整形は prettier が自動でやり、**CI が強制**します。

## 2. prettier：機械が直す

📄 `angular/.prettierrc` L1–25 （▶ の行: 2–5, 7–9, 18–19, 21）

```
 1 │ {
 2 ▶   "printWidth": 100,
 3 ▶   "tabWidth": 2,
 4 ▶   "useTabs": false,
 5 ▶   "singleQuote": true,
 6 │   "semi": true,
 7 ▶   "quoteProps": "preserve",
 8 ▶   "bracketSpacing": false,
 9 ▶   "trailingComma": "all",
10 │   "overrides": [
11 │     {
12 │       "files": ["./.prettierrc"],
13 │       "options": {
14 │         "parser": "json"
15 │       }
16 │     },
17 │     {
18 ▶       "files": ["*.html"],
19 ▶       "excludeFiles": ["**/test/**"],
20 │       "options": {
21 ▶         "parser": "angular"
22 │       }
23 │     }
24 │   ]
25 │ }
```

2 行目の `printWidth: 100` が「100 文字」の実体です。3〜4 行目、インデントは空白 2 つ。5 行目、文字列は単一引用符。8 行目の `bracketSpacing: false` により、`import {Component} from '@angular/core';` のように波括弧の内側に空白を入れません（Angular のコードが詰まって見えるのはこのため）。9 行目、複数行なら最後の要素にもカンマ。18〜21 行目、`.html` は Angular のテンプレートとして整形し、`test/` の下の HTML は除きます。

📄 `angular/.editorconfig` L1–15 （▶ の行: 7–11, 13–15）

```
 1 │ # https://editorconfig.org
 2 │ 
 3 │ root = true
 4 │ 
 5 │ [*]
 6 │ charset = utf-8
 7 ▶ indent_style = space
 8 ▶ indent_size = 2
 9 ▶ end_of_line = lf
10 ▶ insert_final_newline = true
11 ▶ trim_trailing_whitespace = true
12 │ 
13 ▶ [*.md]
14 ▶ insert_final_newline = false
15 ▶ trim_trailing_whitespace = false
```

`.editorconfig` は prettier ではなく**エディタ**が読む設定です。7〜11 行目が全ファイル共通で、prettier の設定と同じ向き（空白 2 つ、LF、最後に改行、行末の空白を消す）。13〜15 行目、Markdown だけは行末の空白を残します。Markdown では行末の空白 2 つが改行の意味を持つからです。

📄 `angular/.ng-dev/format.mjs` L1–9 （▶ の行: 7–8）

```js
1 │ /**
2 │  * Configuration for the `ng-dev format` command.
3 │  *
4 │  * @type { import("@angular/ng-dev").FormatConfig }
5 │  */
6 │ export const format = {
7 ▶   'prettier': true,
8 ▶   'buildifier': true,
9 │ };
```

`ng-dev format` が使う整形の道具は 2 つ。7 行目の prettier と、8 行目の buildifier（Bazel の BUILD ファイルの整形の道具）です。整形のコマンドは文書にあります。

📄 `angular/contributing-docs/building-and-testing-angular.md` L168–185 （▶ の行: 171, 175–178, 185）

````md
168 │ ## Formatting your source code
169 │ 
170 │ Angular uses [prettier](https://prettier.io) to format the source code.
171 ▶ If the source code is not properly formatted, the CI will fail and the PR cannot be merged.
172 │ 
173 │ You can automatically format your code by running:
174 │ 
175 ▶ - `pnpm ng-dev format changed [shaOrRef]`: format only files changed since the provided
176 ▶   sha/ref. `shaOrRef` defaults to `main`.
177 ▶ - `pnpm ng-dev format all`: format _all_ source code
178 ▶ - `pnpm ng-dev format files <files..>`: format only provided files
179 │ 
180 │ ## Linting/verifying your Source Code
181 │ 
182 │ You can check that your code is properly formatted and adheres to coding style by running:
183 │ 
184 │ ```shell
185 ▶ pnpm lint
````

171 行目、整形されていないと CI が落ち、マージできません。175〜176 行目の `format changed` が普段使うもので、引数を省くと `main` と比べます。185 行目の `pnpm lint` は package.json の scripts で `tslint` と `ng-dev format changed --check` を続けて走らせます。では、`format changed` の中身を読みます。

📄 `angular/node_modules/@angular/ng-dev/bundles/cli.mjs` L16316–16336 （▶ の行: 16320, 16326–16329）

```js
16316 │ // ng-dev/format/changed.js
16317 │ function builder7(argv) {
16318 │   return argv.option("check", {
16319 │     type: "boolean",
16320 ▶     default: process.env["CI"] ? true : false,
16321 │     description: "Run the formatter to check formatting rather than updating code format"
16322 │   }).positional("shaOrRef", { type: "string" });
16323 │ }
16324 │ async function handler7({ shaOrRef, check: check2 }) {
16325 │   const git = await GitClient.get();
16326 ▶   const sha = shaOrRef || git.mainBranchName;
16327 ▶   const executionCmd = check2 ? checkFiles : formatFiles;
16328 ▶   const allChangedFilesSince = git.allChangesFilesSince(sha);
16329 ▶   process.exitCode = await executionCmd(allChangedFilesSince);
16330 │ }
16331 │ var ChangedModule = {
16332 │   builder: builder7,
16333 │   handler: handler7,
16334 │   command: "changed [shaOrRef]",
16335 │   describe: "Run the formatter on files changed since the provided sha/ref"
16336 │ };
```

📄 `angular/node_modules/@angular/ng-dev/bundles/chunk-U7PAJR6D.mjs` L24103–24115 （▶ の行: 24106–24107, 24111）

```js
24103 │   allChangesFilesSince(shaOrRef = "HEAD") {
24104 │     assertValidGitRef(shaOrRef);
24105 │     return Array.from(/* @__PURE__ */ new Set([
24106 ▶       ...gitOutputAsArray(this.runGraceful(["diff", "--name-only", "--diff-filter=d", shaOrRef])),
24107 ▶       ...gitOutputAsArray(this.runGraceful(["ls-files", "--others", "--exclude-standard"]))
24108 │     ]));
24109 │   }
24110 │   allStagedFiles() {
24111 ▶     return gitOutputAsArray(this.runGraceful(["diff", "--name-only", "--diff-filter=ACM", "--staged"]));
24112 │   }
24113 │   allFiles() {
24114 │     return gitOutputAsArray(this.runGraceful(["ls-files"]));
24115 │   }
```

1. **16326 行目：比べる相手**

   引数が無ければ `git.mainBranchName`（`.ng-dev/github.mjs` の設定で `main`）。
2. **16327 行目：直すか、確かめるか**

   `--check` なら確かめるだけ。16320 行目、`--check` の既定は環境変数 `CI` があるときだけ true。手元では既定で**書き換え**ます。
3. **16328 行目 → 24106〜24107 行目：対象のファイル**

   `git diff --name-only --diff-filter=d main`（main と作業ツリーの差、削除は除く）と、`git ls-files --others --exclude-standard`（まだ add していない新しいファイル）。コミット前の変更も入ります。
4. **16329 行目：実行**

   次の 2 つの関数のどちらか。

📄 `angular/node_modules/@angular/ng-dev/bundles/cli.mjs` L16131–16154 （▶ の行: 16137–16140, 16146, 16148–16149, 16154）

```js
16131 │ // ng-dev/format/formatters/prettier.js
16132 │ import { join as join2 } from "path";
16133 │ var Prettier = class extends Formatter {
16134 │   constructor() {
16135 │     super(...arguments);
16136 │     this.name = "prettier";
16137 ▶     this.binaryFilePath = join2(this.git.baseDir, "node_modules/.bin/prettier");
16138 ▶     this.matchers = [
16139 ▶       "**/*.{js,cjs,mjs}",
16140 ▶       "**/*.{ts,cts,mts}",
16141 │       "**/*.{jsx,tsx}",
16142 │       "**/*.{css,scss}",
16143 │       "**/*.{json,json5}",
16144 │       "**/*.{yml,yaml}",
16145 │       "**/*.md",
16146 ▶       "**/*.html"
16147 │     ];
16148 ▶     this.configPath = this.config["prettier"] ? ChildProcess.spawnSync(this.binaryFilePath, [
16149 ▶       "--find-config-path",
16150 │       join2(process.cwd(), "dummy.js")
16151 │     ]).stdout.trim() : "";
16152 │     this.actions = {
16153 │       check: {
16154 ▶         commandFlags: this.configPath ? ["--config", this.configPath, "--check"] : ["--check"],
```

16137 行目、prettier は `node_modules/.bin/prettier`（リポジトリに入っている版）。16138〜16146 行目が対象の拡張子で、`.ts` だけでなく `.json`・`.yml`・`.md`・`.html` も整形されます。16148〜16149 行目で設定ファイル（`.prettierrc`）の場所を prettier 自身に探させ、16154 行目の `--check` 付きで呼ぶのが確かめるだけの動作です。

📄 `angular/node_modules/@angular/ng-dev/bundles/cli.mjs` L16265–16293 （▶ の行: 16272, 16278–16279, 16286–16287）

```js
16265 │ async function checkFiles(files) {
16266 │   const failures = await runFormatterInParallel(files, "check");
16267 │   if (failures === false) {
16268 │     Log.info("No files matched for formatting check.");
16269 │     return 0;
16270 │   }
16271 │   if (failures.length) {
16272 ▶     Log.warn("\nThe following files are out of format:");
16273 │     for (const { filePath } of failures) {
16274 │       Log.warn(`  \u2022 ${filePath}`);
16275 │     }
16276 │     Log.warn();
16277 │     let runFormatter = false;
16278 ▶     if (!process.env["CI"]) {
16279 ▶       runFormatter = await Prompt.confirm({ message: "Format the files now?", default: true });
16280 │     }
16281 │     if (runFormatter) {
16282 │       return await formatFiles(failures.map((f) => f.filePath)) || 0;
16283 │     } else {
16284 │       Log.info();
16285 │       Log.info(`To format the failing file run the following command:`);
16286 ▶       Log.info(`  pnpm ng-dev format files ${failures.map((f) => f.filePath).join(" ")}`);
16287 ▶       return 1;
16288 │     }
16289 │   } else {
16290 │     Log.info(green("\u2714  All files correctly formatted."));
16291 │     return 0;
16292 │   }
16293 │ }
```

確かめて整形されていないファイルがあると、16272 行目でその一覧を出し、16278〜16279 行目、CI でなければ「今すぐ整形するか」を聞いてきます。CI では聞かずに、16286 行目の「`pnpm ng-dev format files …` を走らせよ」という案内を出して、16287 行目で 1 を返して落ちます。

📄 `angular/node_modules/@angular/ng-dev/bundles/cli.mjs` L16367–16375 （▶ の行: 16370–16373）

```js
16367 │ async function handler9({ check: check2 }) {
16368 │   const git = await GitClient.get();
16369 │   const executionCmd = check2 ? checkFiles : formatFiles;
16370 ▶   const allStagedFiles = git.allStagedFiles();
16371 ▶   process.exitCode = await executionCmd(allStagedFiles);
16372 ▶   if (!check2 && process.exitCode === 0) {
16373 ▶     git.runGraceful(["add", ...allStagedFiles]);
16374 │   }
16375 │ }
```

コミットのたびに、[第 3 回](03-contrib-setup.md)で引いた `.husky/pre-commit` から `ng-dev format staged` が走ります。16370 行目でステージしたファイル（追加・コピー・変更）を集めて整形し、16372〜16373 行目、成功したらそのファイルを `git add` し直します。フックの最後はいつでも `exit 0` なので、失敗してもコミットは止まりません（[第 9 回](09-contrib-commit-messages.md)の commit-msg と同じ作り）。

> [!WARNING]
> **ハマりどころ**
>
> 16373 行目はファイル**まるごと**を add します。`git add -p` で変更の一部だけをステージしていても、コミットにはそのファイルの残りの変更も入ります。一部だけコミットしたいときは、`HUSKY=0 git commit …`（husky のフックを飛ばす環境変数）でフックを止め、あとで `format changed` を走らせます。

📄 `angular/.prettierignore` L23–34 （▶ の行: 30–31, 33–34）

```
23 │ # Ignore generated javascript file(s)
24 │ .github/actions/deploy-docs-site/main.js
25 │ 
26 │ # Ignore testing data files for language service
27 │ vscode-ng-language-service/syntaxes/test/data/*.ts
28 │ vscode-ng-language-service/syntaxes/test/data/*.html
29 │ 
30 ▶ # Ignore goldens MD files
31 ▶ goldens/**/*.api.md
32 │ 
33 ▶ # Ignore golden symbol json files
34 ▶ packages/**/*.golden_symbols.json
```

整形しないファイルの一覧の一部です。30〜31 行目、golden の `.api.md` は整形しません。golden は作り直した文字列と完全に一致する必要があるので（[第 8 回](08-contrib-public-api.md)）、prettier が 1 文字でも変えると壊れます。33〜34 行目のバンドルのシンボルの golden も同じ理由です。

## 3. tslint：機械が落とす

📄 `angular/tslint.json` L1–11 （▶ の行: 2, 6, 8–11）

```json
 1 │ {
 2 ▶   "rulesDirectory": ["tools/tslint", "node_modules/tslint-no-toplevel-property-access/rules"],
 3 │   "rules": {
 4 │     // The first rule needs to be `ts-node-loader` which sets up `ts-node` within TSLint so
 5 │     // that rules written in TypeScript can be loaded without needing to be transpiled.
 6 ▶     "ts-node-loader": true,
 7 │     // Custom rules written in TypeScript.
 8 ▶     "no-exported-inferred-call-type": true,
 9 ▶     "no-duplicate-enum-values": true,
10 ▶     "require-internal-with-underscore": true,
11 ▶     "no-implicit-override-abstract": true,
```

tslint（TypeScript 用の lint の道具。package.json では 6.1.3）の設定です。2 行目の `tools/tslint` に自作のルールがあり、8〜11 行目でそれを有効にします。6 行目の `ts-node-loader` は、TypeScript で書いたルールをそのまま読み込むための準備です。

📄 `angular/tslint.json` L37–64 （▶ の行: 37–38, 41, 43, 46–47, 50–51, 62, 64）

```json
37 ▶     "eofline": true,
38 ▶     "file-header": [
39 │       true,
40 │       {
41 ▶         "match": "Copyright Google LLC",
42 │         "allow-single-line-comments": false,
43 ▶         "default": "@license\nCopyright Google LLC All Rights Reserved.\n\nUse of this source code is governed by an MIT-style license that can be\nfound in the LICENSE file at https://angular.dev/license"
44 │       }
45 │     ],
46 ▶     "no-console": [true, "log"],
47 ▶     "no-construct": true,
48 │     "no-duplicate-imports": true,
49 │     "no-duplicate-variable": true,
50 ▶     "no-var-keyword": true,
51 ▶     "no-toplevel-property-access": [
52 │       true,
53 │       "packages/animations/src/",
54 │       "packages/animations/browser/",
55 │       "packages/common/src/",
56 │       "packages/core/src/",
57 │       "packages/elements/src/",
58 │       "packages/forms/src/",
59 │       "packages/platform-browser/src/",
60 │       "packages/router/src/"
61 │     ],
62 ▶     "semicolon": [true, "always", "ignore-bound-class-methods"],
63 │     "variable-name": [true, "ban-keywords"],
64 ▶     "no-debugger": true,
```

1. **38〜45 行目：ライセンスの見出し**

   すべてのファイルの先頭に「Copyright Google LLC」を含むコメントが要る。43 行目が雛形そのもの（`@license` から始まる 5 行）。新しいファイルを作ったら、隣のファイルの先頭をそのままコピーします。
2. **46 行目：console.log 禁止**

   `[true, "log"]` なので禁止は `console.log` だけ。`console.warn` や `console.error` は通ります（core の中でも `console.warn` は使われています）。デバッグで足した `console.log` の消し忘れを落とすためです。
3. **50 行目：var 禁止**

   coding-standards.md の「const を優先、変わるなら let」（5 節）を機械で守らせる部分。
4. **51〜61 行目：トップレベルでのプロパティの読み取り禁止**

   列挙したパッケージの `src/` で、モジュールの一番外側で `foo.bar` を評価しない。読み込んだだけで処理が走るとツリーシェイク（使われないコードを消すこと）ができなくなるからです。
5. **37・64 行目**

   ファイルの最後に改行、`debugger` の消し忘れ。

📄 `angular/tslint.json` L73–81 （▶ の行: 74–75, 78–79）

```json
73 │       {
74 ▶         "name": ["performance", "mark"],
75 ▶         "message": "`performance` methods aren't not fully supported in all environments like JSDOM and Cloudflare workers. Use 'performanceMark' from '@angular/core' instead."
76 │       },
77 │       {
78 ▶         "name": ["*", "hasOwnProperty"],
79 ▶         "message": "Use `Object.hasOwn` instead."
80 │       }
81 │     ]
```

この直前の行では、`fdescribe` と `fit`（そのテストだけを走らせる Jasmine の書き方）の消し忘れも禁止しています（その行は[第 5 回](05-contrib-run-tests.md)で引用）。74〜75 行目、`performance.mark` は JSDOM や Cloudflare Workers などで使えないので、`@angular/core` の `performanceMark` を使う。78〜79 行目、`hasOwnProperty` は `Object.hasOwn` に。

📄 `angular/tools/tslint/requireInternalWithUnderscoreRule.ts` L21–55 （▶ の行: 22, 27, 39–40, 42, 45, 48, 52）

```ts
21 │ class TypedefWalker extends RuleWalker {
22 ▶   protected visitPropertyDeclaration(node: ts.PropertyDeclaration): void {
23 │     this.assertInternalAnnotationPresent(node);
24 │     super.visitPropertyDeclaration(node);
25 │   }
26 │ 
27 ▶   public visitMethodDeclaration(node: ts.MethodDeclaration): void {
28 │     this.assertInternalAnnotationPresent(node);
29 │     super.visitMethodDeclaration(node);
30 │   }
31 │ 
32 │   private hasInternalAnnotation(range: ts.CommentRange): boolean {
33 │     const text = this.getSourceFile().text;
34 │     const comment = text.substring(range.pos, range.end);
35 │     return comment.indexOf('@internal') >= 0;
36 │   }
37 │ 
38 │   private assertInternalAnnotationPresent(node: ts.NamedDeclaration) {
39 ▶     if (node.name && node.name.getText().charAt(0) !== '_') return;
40 ▶     if (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Private) return;
41 │ 
42 ▶     const ranges = ts.getLeadingCommentRanges(this.getSourceFile().text, node.pos);
43 │     if (ranges) {
44 │       for (let i = 0; i < ranges.length; i++) {
45 ▶         if (this.hasInternalAnnotation(ranges[i])) return;
46 │       }
47 │     }
48 ▶     this.addFailure(
49 │       this.createFailure(
50 │         node.getStart(),
51 │         node.getWidth(),
52 ▶         `module-private member ${node.name?.getText()} must be annotated @internal`,
53 │       ),
54 │     );
55 │   }
```

自作のルールの 1 つです。22・27 行目、クラスのプロパティとメソッドの宣言を 1 つずつ見ます。39 行目、名前が `_` で始まらなければ何もしない。40 行目、`private` なら何もしない。42〜45 行目、直前のコメントに `@internal` があれば何もしない。それ以外、つまり「`_` で始まるのに public で、`@internal` も無い」メンバーを 52 行目のメッセージで落とします。`@internal` が付けば型定義から消え、公開 API の一覧（golden）にも出ません（[第 8 回](08-contrib-public-api.md)の 5 節）。`_` を付けた「つもり」の内部用メンバーが公開 API に漏れるのを、このルールが止めています。

## 4. tsec：DOM への危険な書き込みを落とす

📄 `angular/packages/tsec-exemption.json` L1–38 （▶ の行: 2–3, 11–12, 17–18, 23）

```json
 1 │ /**
 2 ▶  * The central exemption list of existing tsec violations. Modifications to
 3 ▶  * this list should be carefully reviewed by a security expert.
 4 │  */
 5 │ {
 6 │   "ban-trustedtypes-createpolicy": [
 7 │     "core/src/util/security/trusted_types_bypass.ts",
 8 │     "core/src/util/security/trusted_types.ts",
 9 │     "compiler/src/output/output_jit_trusted_types.ts"
10 │   ],
11 ▶   "ban-element-innerhtml-assignments": [
12 ▶     "core/src/sanitization/inert_body.ts"
13 │   ],
14 │   "ban-element-setattribute": [
15 │     "platform-browser/src/browser/meta.ts"
16 │   ],
17 ▶   "ban-domparser-parsefromstring": [
18 ▶     "core/src/sanitization/inert_body.ts"
19 │   ],
20 │   "ban-script-content-assignments": [
21 │     "platform-server/src/transfer_state.ts"
22 │   ],
23 ▶   "ban-function-calls": [
24 │     "core/src/interface/type.ts",
25 │     "core/src/reflection/reflection_capabilities.ts",
26 │     "core/src/util/security/trusted_types.ts",
27 │     "core/src/render3/instructions/listener.ts",
28 │     "compiler/src/core.ts",
29 │     "compiler/src/output/output_jit_trusted_types.ts",
30 │     "platform-server/src/server_renderer.ts"
31 │   ],
32 │   "ban-window-stringfunctiondef": [
33 │     "core/src/render3/util/misc_utils.ts"
34 │   ],
35 │   "ban-iframe-srcdoc-assignments": [
36 │     "core/src/sanitization/iframe_attrs_validation.ts"
37 │   ]
38 │ }
```

tsec は Google の、TypeScript のコンパイラに組み込んで「Trusted Types と両立するか」を調べる道具です（`node_modules/tsec/package.json` の説明は Extended TypeScript compiler checking Trusted Types compatibility）。Trusted Types はブラウザの仕組みで、`innerHTML` のような「文字列を HTML として解釈させる」書き込みに、検査済みの値しか渡せないようにして XSS（悪意のあるスクリプトを差し込まれること）を防ぎます。tsec は、そういう危険な書き込みをするコードをルールごとに落とします。

このファイルは「既にある違反の、例外の一覧」です。2〜3 行目、変えるときはセキュリティの専門家が注意して見る。11〜12 行目、`innerHTML` に書き込んでよいのは `core/src/sanitization/inert_body.ts` だけ（サニタイズの前に、HTML を実行されない場所で解析するため。[サニタイズの回](../template/07-sanitize.md)）。17〜18 行目の `DOMParser.parseFromString` も同じファイルだけ。23 行目の `ban-function-calls` は `Function(…)` のような文字列からコードを作る呼び出しです。PR で新しいファイルからこれらを使うと `tsec_test` が落ちます。ここにファイルを足して通す、は最後の手段で、まず別の書き方を探します。

📄 `angular/tools/bazel/tsec.bzl` L67–77 （▶ の行: 68, 72–75）

```python
67 │     # Extend the provided tsconfig file.
68 ▶     tsconfig["extends"] = base + "/" + base_tsconfig.short_path
69 │ 
70 │     # Create the compilerOption field for the tsconfig file.
71 │     compiler_options = {
72 ▶         "noEmit": True,
73 ▶         "plugins": [{
74 ▶             "name": "tsec",
75 ▶             "exemptionConfig": base + "/" + ctx.file._exemption.short_path,
76 │         }],
77 │     }
```

`tsec_test` は、元のパッケージの tsconfig を 68 行目で extends し、72 行目で出力を止め（調べるだけ）、73〜75 行目で tsec をコンパイラの plugin として、上の例外の一覧と一緒に読み込ませます。`packages/core/BUILD.bazel` の `tsec_test(name = "tsec_test", target = ":core", …)` のように、core・compiler・platform-browser・platform-server などのパッケージに置かれています。

## 5. 人が見る規則：レビューでよく指摘される点

ここからは機械の検査が無い規則です。レビューで言われる前に、自分で照らし合わせます。

### コメントは「なぜ」を書く

📄 `angular/contributing-docs/coding-standards.md` L14–44 （▶ の行: 19–20, 27, 36–37, 43–44）

````md
14 │ ### Write useful comments
15 │ 
16 │ Comments that explain what some block of code does are nice; they can tell you something in less
17 │ time than it would take to follow through the code itself.
18 │ 
19 ▶ Comments that explain why some block of code exists at all, or does something the way it does,
20 ▶ are _invaluable_. The "why" is difficult, or sometimes impossible, to track down without seeking out
21 │ the original author. When collaborators are in the same room, this hurts productivity.
22 │ When collaborators are in different timezones, this can be devastating to productivity.
23 │ 
24 │ For example, this is a not-very-useful comment:
25 │ 
26 │ ```typescript
27 ▶ // Set default tabindex.
28 │ if (!attributes['tabindex']) {
29 │   element.setAttribute('tabindex', '-1');
30 │ }
31 │ ```
32 │ 
33 │ While this is much more useful:
34 │ 
35 │ ```typescript
36 ▶ // Unless the user specifies otherwise, the calendar should not be a tab stop.
37 ▶ // This prevents ngAria from overzealously adding a tabindex to anything with an ng-model.
38 │ if (!attributes['tabindex']) {
39 │   element.setAttribute('tabindex', '-1');
40 │ }
41 │ ```
42 │ 
43 ▶ In TypeScript code, use JsDoc-style comments for descriptions (on classes, members, etc.) and
44 ▶ use `//` style comments for everything else (explanations, background info, etc.).
````

19〜20 行目、一番価値があるのは「なぜこのコードがあるのか」のコメント。27 行目の「tabindex の既定を設定する」はコードを読めば分かる。36〜37 行目のように、そうしないと何が起きるか（ngAria が余計な tabindex を付ける）を書く。43〜44 行目、クラスやメンバーの説明は JSDoc（`/** */`）、それ以外の説明は `//`。コミットメッセージの body に「なぜ」を書く（[第 9 回](09-contrib-commit-messages.md)）のと同じ考え方です。

### 型・getter・readonly

📄 `angular/contributing-docs/coding-standards.md` L78–113 （▶ の行: 82–83, 90, 92, 96, 111）

````md
 78 │ ### TypeScript
 79 │ 
 80 │ #### Typing
 81 │ 
 82 ▶ Avoid `any` where possible. If you find yourself using `any`, consider whether a generic or
 83 ▶ `unknown` may be appropriate in your case.
 84 │ 
 85 │ #### Getters and Setters
 86 │ 
 87 │ Getters and setters introduce openings for side effects, add more complexity for code readers,
 88 │ and generate additional code when targeting older browsers.
 89 │ 
 90 ▶ - Only use getters and setters for `@Input` properties or when otherwise required for API
 91 │   compatibility.
 92 ▶ - Avoid long or complex getters and setters. If the logic of an accessor would take more than
 93 │   three lines, introduce a new method to contain the logic.
 94 │ - A getter should immediately precede its corresponding setter.
 95 │ - Decorators such as `@Input` should be applied to the getter and not the setter.
 96 ▶ - Always use a `readonly` property instead of a getter (with no setter) when possible.
 97 │ 
 98 │   ```typescript
 99 │   /** YES */
100 │   readonly active: boolean;
101 │ 
102 │   /** NO */
103 │   get active(): boolean {
104 │     // Using a getter solely to make the property read-only.
105 │     return this._active;
106 │   }
107 │   ```
108 │ 
109 │ #### Iteration
110 │ 
111 ▶ Prefer `for` or `for of` to `Array.prototype.forEach`. The `forEach` API makes debugging harder
112 │ and may increase overhead from unnecessary function invocations (though modern browsers do usually
113 │ optimize this well).
````

82〜83 行目、`any` を避け、ジェネリクスか `unknown` を考える。90 行目、getter / setter は `@Input` か API の互換のためだけ。92 行目、中身が 3 行を超えるならメソッドに。96 行目、読み取り専用にしたいだけなら getter ではなく `readonly` のプロパティ。111 行目、`forEach` より `for` / `for of`。

### JSDoc：公開 API には必ず

📄 `angular/contributing-docs/coding-standards.md` L115–149 （▶ の行: 117–118, 120, 131, 137, 139, 144, 147）

````md
115 │ #### JsDoc comments
116 │ 
117 ▶ All public APIs must have user-facing comments. These are extracted for API documentation and shown
118 ▶ in IDEs.
119 │ 
120 ▶ Private and internal APIs should have JsDoc when they are not obvious. Ultimately it is the purview
121 │ of the code reviewer as to what is "obvious", but the rule of thumb is that _most_ classes,
122 │ properties, and methods should have a JsDoc description.
123 │ 
124 │ Properties should have a concise description of what the property means:
125 │ 
126 │ ```typescript
127 │   /** The label position relative to the checkbox. Defaults to 'after' */
128 │   @Input() labelPosition: 'before' | 'after' = 'after';
129 │ ```
130 │ 
131 ▶ Methods blocks should describe what the function does and provide a description for each parameter
132 │ and the return value:
133 │ 
134 │ ```typescript
135 │   /**
136 │    * Opens a modal dialog containing the given component.
137 ▶    * @param component Type of the component to load into the dialog.
138 │    * @param config Dialog configuration options.
139 ▶    * @returns Reference to the newly-opened dialog.
140 │    */
141 │   open<T>(component: ComponentType<T>, config?: MatDialogConfig): MatDialogRef<T> { ... }
142 │ ```
143 │ 
144 ▶ Boolean properties and return values should use "Whether..." as opposed to "True if...":
145 │ 
146 │ ```ts
147 ▶ /** Whether the button is disabled. */
148 │ disabled: boolean = false;
149 │ ```
````

117〜118 行目、公開 API には利用者向けの説明が必須で、API ドキュメントと IDE に出ます。公開 API の説明が抜けると、golden に `// (undocumented)` が付くので差分で見えます（[第 8 回](08-contrib-public-api.md)の 3 節）。131〜139 行目、メソッドは何をするかと、引数ごとの `@param`、戻り値の `@returns`。144・147 行目、真偽値は「True if…」ではなく「Whether…」で書き始める。

### try-catch と変数

📄 `angular/contributing-docs/coding-standards.md` L151–166 （▶ の行: 153, 156–157, 161, 166）

```md
151 │ #### Try-Catch
152 │ 
153 ▶ Only use `try-catch` blocks when dealing with legitimately unexpected errors. Don't use `try` to
154 │ avoid checking for expected error conditions such as null dereference or out-of-bound array access.
155 │ 
156 ▶ Each `try-catch` block **must** include a comment that explains the
157 ▶ specific error being caught and why it cannot be prevented.
158 │ 
159 │ ##### Variable declarations
160 │ 
161 ▶ Prefer `const` wherever possible, only using `let` when a value must change. Avoid `var` unless
162 │ absolutely necessary.
163 │ 
164 │ ##### `readonly`
165 │ 
166 ▶ Use `readonly` members wherever possible.
```

153 行目、`try-catch` は本当に予想できないエラーのときだけ。null の参照のような、事前に確かめられるものを `try` で隠さない。156〜157 行目、`try-catch` には何のエラーをなぜ防げないかのコメントが**必須**。161 行目は `const` 優先、166 行目は `readonly` 優先。

### 名前

📄 `angular/contributing-docs/coding-standards.md` L168–199 （▶ の行: 172–173, 175–176, 189, 194, 198）

````md
168 │ #### Naming
169 │ 
170 │ ##### General
171 │ 
172 ▶ - Prefer writing out words instead of using abbreviations.
173 ▶ - Prefer _exact_ names over short names (within reason). For example, `labelPosition` is better than
174 │   `align` because the former much more exactly communicates what the property means.
175 ▶ - Except for `@Input()` properties, use `is` and `has` prefixes for boolean properties / methods.
176 ▶ - Name identifiers based on their responsibility. Names should capture what the code _does_,
177 │   not how it is used:
178 │ 
179 │   ```typescript
180 │   /** NO: */
181 │   class DefaultRouteReuseStrategy {}
182 │ 
183 │   /** YES: */
184 │   class NonStoringRouteReuseStrategy {}
185 │   ```
186 │ 
187 │ ##### Observables
188 │ 
189 ▶ Don't suffix observables with `$`.
190 │ 
191 │ ##### Classes
192 │ 
193 │ - Use PascalCase (aka UpperCamelCase).
194 ▶ - Class names should not end in `Impl`.
195 │ 
196 │ ##### Interfaces
197 │ 
198 ▶ - Do not prefix interfaces with `I`.
199 │ - Do not suffix interfaces with `Interface`.
````

📄 `angular/contributing-docs/coding-standards.md` L200–222 （▶ の行: 205, 210, 215, 222）

````md
200 │ 
201 │ ##### Functions and methods
202 │ 
203 │ Use camelCase (aka lowerCamelCase).
204 │ 
205 ▶ The name of a function should capture the action performed _by_ that method rather than
206 │ describing when the method will be called. For example:
207 │ 
208 │ ```typescript
209 │ /** AVOID: does not describe what the function does. */
210 ▶ handleClick() {
211 │   // ...
212 │ }
213 │ 
214 │ /** PREFER: describes the action performed by the function. */
215 ▶ activateRipple() {
216 │   // ...
217 │ }
218 │ ```
219 │ 
220 │ ##### Constants and injection tokens
221 │ 
222 ▶ Use UPPER_SNAKE_CASE.
````

172〜173 行目、略語より単語、短い名前より正確な名前。175 行目、真偽値には `is`・`has`（`@Input` を除く）。176 行目、使われ方ではなく責務で名前を付ける。189 行目、Observable に `$` を付けない。194 行目、クラス名を `Impl` で終えない。198 行目、interface に `I` を付けない。205 行目、関数は「いつ呼ばれるか」（210 行目の `handleClick`）ではなく「何をするか」（215 行目の `activateRipple`）。222 行目、定数と InjectionToken は `UPPER_SNAKE_CASE`。

> [!NOTE]
> **ポイント**
>
> 既存のコードには規則に合わない名前もあります。たとえば[zoneless の回](../zoneless/01-zoneless-default.md)で読んだ `ChangeDetectionSchedulerImpl` は 194 行目に合いません。公開 API の名前を変えると破壊的変更になる（[第 8 回](08-contrib-public-api.md)）ので、規則に合わせるためだけに既存の名前を変えるのは慎重に考えます。

### テストの名前

📄 `angular/contributing-docs/coding-standards.md` L255–280 （▶ の行: 259–260, 266, 275）

````md
255 │ #### Testing
256 │ 
257 │ ##### Test names
258 │ 
259 ▶ Use descriptive names for jasmine tests. Ideally, test names should read as a sentence, often of
260 ▶ the form "it should...".
261 │ 
262 │ ```typescript
263 │ /** PREFER: describes the scenario under test. */
264 │ describe('Router', () => {
265 │   describe('with the default route reuse strategy', () => {
266 ▶     it('should not reuse routes upon location change', () => {
267 │       // ...
268 │     });
269 │   });
270 │ });
271 │ 
272 │ /** AVOID: does not fully describe the scenario under test. */
273 │ describe('Router', () => {
274 │   describe('default strategy', () => {
275 ▶     it('should work', () => {
276 │       // ...
277 │     });
278 │   });
279 │ });
280 │ ```
````

259〜260 行目、テストの名前は文として読める「it should…」の形に。266 行目は状況と期待が名前から分かる。275 行目の `'should work'` は、落ちたときに何が壊れたか分からない。テストを書く手順は[第 7 回](07-contrib-writing-a-test.md)です。

## 6. エラーコード NG0xxx の付け方

📄 `angular/packages/core/src/errors.ts` L11–41 （▶ の行: 13, 15–16, 22–23, 31, 33–34, 38）

```ts
11 │ /**
12 │  * The list of error codes used in runtime code of the `core` package.
13 ▶  * Reserved error code range: 100-999.
14 │  *
15 ▶  * Note: the minus sign denotes the fact that a particular code has a detailed guide on
16 ▶  * angular.io. This extra annotation is needed to avoid introducing a separate set to store
17 │  * error codes which have guides, which might leak into runtime code.
18 │  *
19 │  * Full list of available error guides can be found at https://angular.dev/errors.
20 │  *
21 │  * Error code ranges per package:
22 ▶  *  - core (this package): 100-999
23 ▶  *  - forms: 1000-1999
24 │  *  - common: 2000-2999
25 │  *  - animations: 3000-3999
26 │  *  - router: 4000-4999
27 │  *  - platform-browser: 5000-5500
28 │  *  - service-worker: 5600-5699
29 │  *  - platform-server: 5700-5800
30 │  */
31 ▶ export const enum RuntimeErrorCode {
32 │   // Change Detection Errors
33 ▶   EXPRESSION_CHANGED_AFTER_CHECKED = -100,
34 ▶   RECURSIVE_APPLICATION_REF_TICK = 101,
35 │   INFINITE_CHANGE_DETECTION = 103,
36 │ 
37 │   // Dependency Injection Errors
38 ▶   CYCLIC_DI_DEPENDENCY = -200,
39 │   PROVIDER_NOT_FOUND = -201,
40 │   INVALID_FACTORY_DEPENDENCY = 202,
41 │   MISSING_INJECTION_CONTEXT = -203,
```

1. **番号の範囲はパッケージごと**

   22〜29 行目、core は 100〜999、forms は 1000〜1999、common は 2000〜2999…。core の新しいエラーは 13 行目の範囲から、近い種類のまとまり（32 行目の Change Detection、37 行目の Dependency Injection…）の空いている番号を使います。
2. **負の数は「解説ページあり」の印**

   15〜17 行目、マイナスは angular.dev に詳しい解説ページがあることを示す。33 行目の `EXPRESSION_CHANGED_AFTER_CHECKED = -100` はページがあり、34 行目の `RECURSIVE_APPLICATION_REF_TICK = 101` は無い。ページの実体は `adev/src/content/reference/errors/NG0100.md` のようなファイルです。
3. **enum は const enum**

   31 行目の `export const enum` は、コンパイルのときに数字に置き換わり、実行時のコードに enum の名前が残りません。

📄 `angular/packages/core/src/errors.ts` L165–188 （▶ の行: 171–173, 176–178, 181, 186）

````ts
165 │ /**
166 │  * Class that represents a runtime error.
167 │  * Formats and outputs the error message in a consistent way.
168 │  *
169 │  * Example:
170 │  * ```ts
171 ▶  *  throw new RuntimeError(
172 ▶  *    RuntimeErrorCode.INJECTOR_ALREADY_DESTROYED,
173 ▶  *    ngDevMode && 'Injector has already been destroyed.');
174 │  * ```
175 │  *
176 ▶  * Note: the `message` argument contains a descriptive error message as a string in development
177 ▶  * mode (when the `ngDevMode` is defined). In production mode (after tree-shaking pass), the
178 ▶  * `message` argument becomes `false`, thus we account for it in the typings and the runtime
179 │  * logic.
180 │  */
181 ▶ export class RuntimeError<T extends number = RuntimeErrorCode> extends Error {
182 │   constructor(
183 │     public code: T,
184 │     message: null | false | string,
185 │   ) {
186 ▶     super(formatRuntimeError<T>(code, message));
187 │   }
188 │ }
````

📄 `angular/packages/core/src/errors.ts` L190–215 （▶ の行: 194, 205, 207, 209–210, 212）

```ts
190 │ export function formatRuntimeErrorCode<T extends number = RuntimeErrorCode>(code: T): string {
191 │   // Error code might be a negative number, which is a special marker that instructs the logic to
192 │   // generate a link to the error details page on angular.io.
193 │   // We also prepend `0` to non-compile-time errors.
194 ▶   return `NG0${Math.abs(code)}`;
195 │ }
196 │ 
197 │ /**
198 │  * Called to format a runtime error.
199 │  * See additional info on the `message` argument type in the `RuntimeError` class description.
200 │  */
201 │ export function formatRuntimeError<T extends number = RuntimeErrorCode>(
202 │   code: T,
203 │   message: null | false | string,
204 │ ): string {
205 ▶   const fullCode = formatRuntimeErrorCode(code);
206 │ 
207 ▶   let errorMessage = `${fullCode}${message ? ': ' + message : ''}`;
208 │ 
209 ▶   if (ngDevMode && code < 0) {
210 ▶     const addPeriodSeparator = !errorMessage.match(/[.,;!?\n]$/);
211 │     const separator = addPeriodSeparator ? '.' : '';
212 ▶     errorMessage = `${errorMessage}${separator} Find more at ${ERROR_DETAILS_PAGE_BASE_URL}/${fullCode}`;
213 │   }
214 │   return errorMessage;
215 │ }
```

投げ方は 171〜173 行目の形が決まりです：`throw new RuntimeError(RuntimeErrorCode.XXX, ngDevMode && 'メッセージ')`。176〜178 行目、開発モードでは `ngDevMode && '…'` が文字列、本番のビルドでは `ngDevMode` が `false` に置き換わってメッセージの文字列ごとツリーシェイクで消えます。本番のバンドルにメッセージを残さないためです。194 行目、表示は `NG0` に絶対値を付けたもの（`-100` → `NG0100`）。207 行目でメッセージをつなぎ、209〜212 行目、開発モードで負の番号なら末尾に解説ページの URL を足します。

📄 `angular/tools/tslint/noDuplicateEnumValuesRule.ts` L13–36 （▶ の行: 16, 21, 25, 31, 34, 36）

````ts
13 │ /**
14 │  * Rule that detects duplicate enum values.
15 │  *
16 ▶  * This is useful to prevent collisons on ErrorCodes.
17 │  *
18 │  * ```ts
19 │  * enum E {
20 │  *   A = 1,
21 ▶  *   B = 1, // Wrong!
22 │  * }
23 │  * ```
24 │  */
25 ▶ export class Rule extends TypedRule {
26 │   override applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): RuleFailure[] {
27 │     const checker = program.getTypeChecker();
28 │ 
29 │     return this.applyWithFunction(sourceFile, (ctx) => {
30 │       ts.forEachChild(sourceFile, function walk(node) {
31 ▶         if (ts.isEnumDeclaration(node)) {
32 │           const seenValues = new Map<string | number, ts.Node>();
33 │           for (const member of node.members) {
34 ▶             const value = checker.getConstantValue(member);
35 │             if (value !== undefined) {
36 ▶               if (seenValues.has(value)) {
````

番号の重複は機械が落とします。`tslint.json` の 9 行目で有効な `no-duplicate-enum-values` で、16 行目のとおりエラーコードの衝突を防ぐためのルールです。31 行目で enum の宣言ごとに、34 行目で各メンバーの値を型チェッカーに計算させ、36 行目で既に見た値なら落とします。さらに、エラーコードの enum は golden にもなっています（`core_errors`・`forms_errors`。[第 8 回](08-contrib-public-api.md)の 4 節）。番号を足したら、その golden も accept します。

## 7. デモ：機械的な点を数える簡易チェッカー

> **🧪 DEMO — 貼ったコードを数える（自作。prettier・tslint そのものではない）**
>
> 行の長さ（100 文字）・行末の空白・タブ・二重引用符などの「prettier が直す」点、`console.log`・`fdescribe`・`debugger`・`var`・ライセンスの見出し・`@internal` の無い `_` メンバーなどの「tslint が落とす」点、それに名前の付け方などの「レビューで言われる」点を、正規表現で数えます。本物は構文木を見るので、ここで数えた結果と一致しないことがあります。本物は `npx -y pnpm@12.3.4 lint` です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-coding-standards)

## 全体の流れ

- 👤 `git commit` — 手元
  - `.husky/pre-commit` → `ng-dev format staged` — cli.mjs L16367 — *ステージしたファイルを prettier で整形し、まるごと add*
- 👤 `npx -y pnpm@12.3.4 lint` — 手元（push の前）
  - `tslint -c tslint.json --project tsconfig-tslint.json` — tslint.json — *ライセンス・console.log・fdescribe・@internal など*
  - `ng-dev format changed --check` — cli.mjs L16324 — *main との差分のファイルだけ prettier --check*
- 👤 `PR の CI` — .github/workflows/pr.yml
  - `lint ジョブ` — pnpm tslint / format changed --check &lt;base&gt;
  - `test ジョブ` — bazel test — *tsec\_test（tsec-exemption.json）、golden、spec*

## 聞かれそうな質問

**Q. 整形（format）は手で直すのですか？**

手で直しません。`npx -y pnpm@12.3.4 ng-dev format changed` を走らせれば、main との差分のファイル（cli.mjs 24106〜24107 行目、まだ add していないファイルも含む）を prettier で書き換えます。手元では `--check` の既定が false なので（16320 行目）、引数無しで書き換えになります。確かめるだけなら `--check` を付け、整形されていないファイルがあれば 16278〜16279 行目で「今すぐ整形するか」を聞いてきます。そもそもコミットのたびに pre-commit フックが `format staged` を走らせています。

**Q. 規則に書いていない書き方を、レビューで指摘されたらどうしますか？**

まず周りの既存のコードに合わせます。coding-standards.md の 8〜9 行目のとおり、土台は Google の JavaScript スタイルガイドで、この文書はその上の追加なので、文書に無い規則がスタイルガイドの方にあることがあります。JSDoc の要不要のように文書が「レビューする人の判断」と明記している点もあります（120〜122 行目）。納得できない場合は、理由を書いて PR のコメントで聞き返してかまいません。レビューは相談の場です（[第 10 回](10-contrib-pr-flow.md)）。

**Q. 既存のエラーメッセージを変えるときは何に気を付けますか？**

番号（`RuntimeErrorCode`）は変えません。番号は利用者が検索し、解説ページ（負の番号、errors.ts 15〜17 行目）の URL にもなっている（212 行目）からです。変えるのは `ngDevMode && '…'` の文字列だけにし、そのメッセージを `toThrowError` などで確かめている spec を grep で探して直します。番号を足すときは、パッケージの範囲（22〜29 行目）の中で重複しない番号にし（重複は no-duplicate-enum-values が落とす）、`…_errors` の golden を accept します。解説ページを作るなら番号を負にし、`adev/src/content/reference/errors/` にページを足します。

**Q. console.warn を足すのはよいのですか？**

tslint では落ちません。tslint.json の 46 行目は `["log"]` だけを禁止しています。core の中でも `packages/core/src/console.ts` などで `console.warn` が使われています。ただし警告の文字列は本番のバンドルにも入るので、エラーのメッセージを `ngDevMode && '…'` にする（errors.ts 176〜178 行目）のと同じく、本番で要らない文字列を残さないかはレビューで見られる点です。

## 読み終えて

- 規則は 3 層。prettier が直す（.prettierrc の printWidth 100・単一引用符・bracketSpacing false）、tslint と tsec が落とす、coding-standards.md を人が見る。
- `ng-dev format changed` は main との差分（未 add のファイルを含む）が対象。手元では書き換え、CI では `--check`。pre-commit の `format staged` はファイルをまるごと add し直す。
- tslint の要所は、ライセンスの見出し・`console.log`・`fdescribe`/`fit`・`var`、そして `_` メンバーには `@internal`（公開 API への漏れを防ぐ）。
- tsec は innerHTML などの危険な DOM への書き込みを落とす。例外は tsec-exemption.json の数ファイルだけ。
- エラーは `new RuntimeError(RuntimeErrorCode.X, ngDevMode && '…')`。番号はパッケージの範囲内、負の数は解説ページあり、表示は `NG0` + 絶対値。

---

← 前: [issue の仕分け：ラベル・優先度・最初に手を付ける issue](12-contrib-triage.md)  
次: [手元で確かめる：dev-app・ローカルのビルドを自分のアプリで使う](14-contrib-debugging.md) →
