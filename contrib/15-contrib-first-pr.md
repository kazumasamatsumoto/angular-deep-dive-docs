[目次](../README.md) › [コントリビュートの道](README.md) › 第 15 回 / 全 15 回

# 最初の PR の通し練習：手引きの図の食い違いを直す

> commit-message-guidelines.md の図に書かれた scope の一覧が .ng-dev/commit-message.mjs の設定と合っていない（図には bazel・packaging・changelog があり、dev-infra・language-server・vscode-extension が無い。#64492 で箇条書きだけが直された）ことを題材に、最新の main で直っていないかの確認、既存の issue と PR の検索、fork とブランチ、図の幅を揃えた変更、docs: のコミットメッセージと手元での検査、PR の説明文の下書き、レビューで言われうることまでを通しで行う。出すかどうかは読者が決める。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-first-pr)

---

シリーズの最後に、本物の小さな誤りを 1 つ、見つけるところから PR の説明文の下書きまで通しで扱います。題材は `contributing-docs/commit-message-guidelines.md` の図です。図に書かれた scope の一覧が、実際に検査に使われる `.ng-dev/commit-message.mjs` の設定と合っていません。この章の手順をなぞれば、あとは「出す」かどうかを決めるだけ、というところまで進みます。**出すかどうかは、あなたが決めます。**

読む対象は `contributing-docs/commit-message-guidelines.md`、`.ng-dev/commit-message.mjs`、`CONTRIBUTING.md`、`.pullapprove.yml`、`.github/PULL_REQUEST_TEMPLATE.md`、それに `../angular` の git の履歴です。

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
13. [13. コードの書き方](13-contrib-coding-standards.md)
14. [14. 手元で確かめる](14-contrib-debugging.md)
15. **15. 最初の PR**（この章）

## 0. 全体の流れ

1. **食い違いを確かめる**

   図と箇条書きを並べ、設定と比べる（1 節）。なぜ食い違ったかも履歴で見る（2 節）。
2. **最新の main で直っていないか**

   git fetch と git log（3 節の手順 1）。
3. **既存の issue と PR**

   誰かがもう出していないか（手順 2）。
4. **fork とブランチ**

   手順 3。
5. **変更と差分**

   図の幅を揃えて書き直す（手順 4）。
6. **docs: のコミット**

   手順 5。手元で CI と同じ検査を走らせる。
7. **PR の説明文の下書き**

   テンプレートを埋める（手順 6）。
8. **出すと決めたら**

   push と PR 作成のコマンド（手順 7）、レビューで言われうること（手順 8）。

## 1. 食い違いを並べる

📄 `angular/contributing-docs/commit-message-guidelines.md` L23–37 （▶ の行: 30–34）

````md
23 │ ## <a name="commit-header"></a>Commit Message Header
24 │ 
25 │ ```
26 │ <type>(<scope>): <short summary>
27 │   │       │             │
28 │   │       │             └─⫸ Summary in present tense. Not capitalized. No period at the end.
29 │   │       │
30 ▶   │       └─⫸ Commit Scope: animations|bazel|benchpress|common|compiler|compiler-cli|core|
31 ▶   │                          elements|forms|http|language-service|localize|platform-browser|
32 ▶   │                          platform-browser-dynamic|platform-server|router|service-worker|
33 ▶   │                          upgrade|zone.js|packaging|changelog|docs-infra|migrations|
34 ▶   │                          devtools
35 │   │
36 │   └─⫸ Commit Type: build|ci|docs|feat|fix|perf|refactor|test
37 │ ```
````
*ヘッダーの図。30〜34 行目に scope の一覧がある*

30 行目の 2 つ目に `bazel`、33 行目に `packaging` と `changelog` があります。一方、`dev-infra`・`language-server`・`vscode-extension` は 30〜34 行目のどこにもありません。同じファイルの少し下に、もう 1 つの一覧（箇条書き）があります。

📄 `angular/contributing-docs/commit-message-guidelines.md` L62–68 （▶ の行: 62–63, 68）

```md
62 ▶ - `animations`
63 ▶ - `benchpress`
64 │ - `common`
65 │ - `compiler`
66 │ - `compiler-cli`
67 │ - `core`
68 ▶ - `dev-infra`
```
*箇条書きの一覧の先頭の 7 行（一覧の全体は第 9 回で引用）*

箇条書きはアルファベット順で、62 行目 `animations` の次は 63 行目 `benchpress`。図にある `bazel` はここにありません。代わりに 68 行目に `dev-infra` があり、同じ一覧の続きには `language-server` と `vscode-extension` もあります（[第 9 回](09-contrib-commit-messages.md)で引いた一覧の全体で確かめられます）。この箇条書きは `.ng-dev/commit-message.mjs` の `scopes`（[第 9 回](09-contrib-commit-messages.md)で全体を引用）と、並びも数（24 個）も一致します。その設定の `scopes` のすぐ上には「これを変えたら docs も変えること」というコメントがあり、リンク先は箇条書きの `#scope` です。図は誰にも指されていませんでした。

> **🧪 DEMO — 図の scope と設定の scope を並べる**
>
> データは自作の静的な配列です。図は guidelines の 30〜34 行目、設定は commit-message.mjs の `scopes` を、並びも含めて写しました（箇条書きも設定と同じ並び）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-first-pr)

数は同じ 24 個なので、ぱっと見では気付きにくい食い違いです。「図にだけある」ほうは実害があります。`docs(bazel): …` のようなコミットは、[第 10 回](10-contrib-pr-flow.md)で読んだ `pr.yml` の lint ジョブのコミットメッセージの検査で落ちます。このマシンで ng-dev に渡すと、実際に次のように弾かれました。

📄 `~/angular-research/angular で実行（ファイルのパスは短縮。ng-dev の版が package.json と違うという警告の 3 行は省略）`

```
$ node node_modules/@angular/ng-dev/bundles/cli.mjs commit-message pre-commit-validate --file msg.txt
✔  Valid commit message

$ printf 'docs(bazel): sync scopes in the diagram\n' > msg-bad.txt
$ node node_modules/@angular/ng-dev/bundles/cli.mjs commit-message pre-commit-validate --file msg-bad.txt
! Invalid commit message.
Error:
'bazel' is not an allowed scope.
 => SCOPES: animations, benchpress, common, compiler, compiler-cli, core, dev-infra, devtools, docs-infra, elements, forms, http, language-service, language-server, localize, migrations, platform-browser, platform-browser-dynamic, platform-server, router, service-worker, upgrade, vscode-extension, zone.js
```

> [!NOTE]
> **ポイント**
>
> ng-dev はこのとき `../angular` の直下に `.ng-dev.log` を書きます。`.gitignore` の `*.log` に当たるので git status には出ませんが、気になるなら消してかまいません。

## 2. なぜ食い違ったか

直す前に「いつ・誰が・なぜ」を知っておくと、PR の説明文が具体的になり、レビュアーも判断しやすくなります。

📄 `git show（読み取りだけ）`

```
$ git show 3cfa6e872d8 --stat --format='%h %an %ad%n%n%B' --date=short
3cfa6e872d8 Alan Agius 2025-10-17

build: remove unused commit message scopes (#64492)

Removes a number of commit message scopes that are no longer in use.

- `bazel`: Now part of `dev-infra`
- `changelog`: The changelog is autogenerated and doesn't have dedicated commits.
- `packaging`: Is handled by `dev-infra` as well.

PR Close #64492

 .ng-dev/commit-message.mts                     |  3 ---
 .ng-dev/release.mts                            |  9 ++++++++-
 contributing-docs/commit-message-guidelines.md | 11 +++--------
 3 files changed, 11 insertions(+), 12 deletions(-)
```

2025-10-17 の #64492 で、設定から `bazel`・`changelog`・`packaging` を消し、`commit-message-guidelines.md` の 11 行分を変えています。変えたのは箇条書きの方（`bazel`・`changelog`・`packaging` を消し、`language-server`・`vscode-extension` を足した）と、例外の説明の 2 項目でした。図は変わっていません。手順 1 の `git log -S'packaging|changelog'` が、図のこの文字列を足したのは 2024 年にこのファイルを切り出した 7ecaffc008e だけだと示しています。実際、#64492 のあと main に `dev-infra`・`language-server`・`vscode-extension` の scope のコミットは入っていて、`bazel`・`packaging`・`changelog` のコミットは 1 つもありません（`git log -E --grep='^[a-z]+\((scope)\):'` で数えると、2025-10-17 以降それぞれ 6・8・28 件と 0 件）。

## 3. 手順

1. **手順 1：最新の main で直っていないか**

   あなたの clone は 2026-09-09 の main です。PR は最新の main に対して出すので、先に main が進んでいないかを見ます。GitHub の画面なら [ファイルの履歴](https://github.com/angular/angular/commits/main/contributing-docs/commit-message-guidelines.md) でも同じことが見られます。

📄 `手順 1（fetch は remote-tracking の refs だけを更新する）`

```
cd ~/angular-research/angular
git fetch origin
# HEAD（いまの clone）より先の main で、この 2 ファイルを変えたコミット
git log --oneline HEAD..origin/main -- \
  contributing-docs/commit-message-guidelines.md .ng-dev/commit-message.mjs
# 最新の main の図の 5 行
git show origin/main:contributing-docs/commit-message-guidelines.md | sed -n '30,34p'
# 図の中の文字列が最後に変わったコミット
git log --oneline -S'packaging|changelog' -- contributing-docs/commit-message-guidelines.md
```

📄 `このマシンの結果（origin/main は 2026-10-30 に fetch された 74961c66242）`

```
$ git log --oneline HEAD..origin/main -- contributing-docs/commit-message-guidelines.md .ng-dev/commit-message.mjs
（出力なし）
$ git show origin/main:contributing-docs/commit-message-guidelines.md | sed -n '30,34p'
  │       └─⫸ Commit Scope: animations|bazel|benchpress|common|compiler|compiler-cli|core|
  │                          elements|forms|http|language-service|localize|platform-browser|
  │                          platform-browser-dynamic|platform-server|router|service-worker|
  │                          upgrade|zone.js|packaging|changelog|docs-infra|migrations|
  │                          devtools
$ git log --oneline -S'packaging|changelog' -- contributing-docs/commit-message-guidelines.md
7ecaffc008e docs: move commit message guidelies to a separate file (#58786)
```

2026-10-30 の main まで、この 2 ファイルを変えたコミットはありません（1 本目が空）。図もそのままです（2 本目）。あなたが試すときは `git fetch` のあとなので、結果が変わっていたら、その日の main を正にします。

1. **手順 2：既存の issue と PR を探す**

   CONTRIBUTING.md の「Contribution Quality」の 1 つ目が「関係する PR を開いているもの・閉じたものの両方から探す」です（[第 1 回](01-contrib-overview.md)）。GitHub の画面なら [PR の検索](https://github.com/angular/angular/pulls?q=is%3Apr+commit-message-guidelines)・ [issue の検索](https://github.com/angular/angular/issues?q=is%3Aissue+commit+scope+diagram)、手元なら `gh` で探します（読むだけのコマンド）。見つかったら、その PR にレビューのコメントで協力する方が早く片付きます。

📄 `手順 2（gh は事前に gh auth login が要る）`

```
gh search prs --repo angular/angular "commit-message-guidelines" --state open
gh search prs --repo angular/angular "commit scope diagram"
gh search issues --repo angular/angular "commit message scope" --state open
```

1. **手順 3：fork とブランチ**

   CONTRIBUTING.md の「Submitting a Pull Request」の 2〜3 番目のとおり、自分の fork で新しいブランチを切ります。あなたの `../angular` は angular/angular から直接 clone したもので、`origin` が本家を指しています。CONTRIBUTING.md の最後の `git pull --ff upstream main` に合わせて、本家を `upstream`、自分の fork を `origin` に付け替えます。ブランチの名前は何でもよく、ここでは `docs-fix-commit-scope-diagram`。`upstream/main` から切るのが要点です。

📄 `手順 3（fork を作るのは GitHub 上の操作。出すと決めてからでよい）`

```
# GitHub 上に自分の fork を作る（clone はもうあるので --clone=false）
gh repo fork angular/angular --clone=false

cd ~/angular-research/angular
# いまの origin（angular/angular）を upstream に、自分の fork を origin にする
git remote rename origin upstream
git remote add origin https://github.com/<あなたの GitHub 名>/angular.git
git remote -v

# CLA に署名したメールアドレスでコミットする（CONTRIBUTING.md の「Submitting a Pull Request」1.）
git config user.email

git fetch upstream
git switch -c docs-fix-commit-scope-diagram upstream/main
```

1. **手順 4：変更**

   図の 30〜34 行目の 5 行だけを書き換えます。並びは設定（＝箇条書き）と同じアルファベット順にし、折り返しは元の最も長い行（31・32 行目、92 文字）を超えないようにしました。30 行目の頭（` │ └─⫸ Commit Scope: `）と 31〜34 行目の頭の空白は、元のまま 1 文字も変えていません。行数も 5 行のままなので、図の下の `│` と `└─⫸ Commit Type` の位置は動きません。

📄 `git diff（../angular は変更せず、scratchpad のコピーで作った差分）`

````
diff --git a/contributing-docs/commit-message-guidelines.md b/contributing-docs/commit-message-guidelines.md
--- a/contributing-docs/commit-message-guidelines.md
+++ b/contributing-docs/commit-message-guidelines.md
@@ -27,11 +27,11 @@ The `footer` is optional. The [Commit Message Footer](#commit-footer) format des
   │       │             │
   │       │             └─⫸ Summary in present tense. Not capitalized. No period at the end.
   │       │
-  │       └─⫸ Commit Scope: animations|bazel|benchpress|common|compiler|compiler-cli|core|
-  │                          elements|forms|http|language-service|localize|platform-browser|
-  │                          platform-browser-dynamic|platform-server|router|service-worker|
-  │                          upgrade|zone.js|packaging|changelog|docs-infra|migrations|
-  │                          devtools
+  │       └─⫸ Commit Scope: animations|benchpress|common|compiler|compiler-cli|core|
+  │                          dev-infra|devtools|docs-infra|elements|forms|http|
+  │                          language-service|language-server|localize|migrations|
+  │                          platform-browser|platform-browser-dynamic|platform-server|
+  │                          router|service-worker|upgrade|vscode-extension|zone.js
   │
   └─⫸ Commit Type: build|ci|docs|feat|fix|perf|refactor|test
 ```
````

> **🧪 DEMO — 直した図の 5 行**
>
> エディタで 30〜34 行目を選んで、これに置き換えます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-first-pr)

1. **手順 5：docs: のコミット**

   `.md` の中身だけの変更なので、type は `docs`、scope は付けません。

根拠は同じファイルの scope の例外の節です（[第 9 回](09-contrib-commit-messages.md)で引用）。`docs-infra` の説明に「`.md` の中身を直すときは scope 無しの `docs:`」とあり、最後の項目に「特定のパッケージに結び付かない docs の変更も scope 無し（例 `docs: fix typo in tutorial`）」とあります。`docs` は body を省けます（設定の `minBodyLengthTypeExcludes`）。それでも「何が・なぜ」を 1〜2 文書いておくと、レビュアーが #64492 を探しに行かずに済みます。

> **🧪 DEMO — コミットメッセージの下書き**
>
> summary は命令形・小文字始まり・末尾にピリオド無し（guidelines の Summary の節）。上の ng-dev の検査を通ることを確かめました。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-first-pr)

📄 `手順 5（validate-range と format は pr.yml の lint ジョブと同じもの）`

```
git add contributing-docs/commit-message-guidelines.md
git commit            # エディタが開くので、下のメッセージを貼る

# pr.yml の lint ジョブ（第 10 回の 2 節）と同じ検査
npx -y pnpm@12.3.4 ng-dev commit-message validate-range upstream/main HEAD
npx -y pnpm@12.3.4 ng-dev format changed --check upstream/main
```

husky の commit-msg フックも同じ検査を呼びますが、実行できなかったときは警告を出すだけでコミットを通します（[第 9 回](09-contrib-commit-messages.md)）。だから最後の 2 行を手で走らせて、CI で落ちないことを先に確かめます。

同じファイルを直した `docs:` の実例を、git log から 2 つ見ておきます。

📄 `git log（読み取りだけ）`

```
$ git log -1 --format='%h %an %ad%n%n%B' --date=short 002699bcef1
002699bcef1 Damian Sire 2025-09-13

docs: clarify usage of docs-infra scope in commit messages (#63799)

The contribution guide is updated to provide clearer instructions on when to use the `docs-infra` scope versus the `docs` type.

This change helps contributors understand that `docs-infra` should only be used for infrastructure-related changes (application code, tooling, configuration) within the `/adev` directory. For simple content modifications, such as editing a `.md` file, `docs` without a scope is the correct choice.

PR Close #63799

$ git show 002699bcef1 --stat --format=
 contributing-docs/commit-message-guidelines.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

$ git log origin/20.3.x --oneline --grep='docs-infra scope'
134c31bd1b2 docs: clarify usage of docs-infra scope in commit messages (#63799)

$ git log -1 --format='%h %an %ad %s' --date=short 4739bde9fb6
4739bde9fb6 Kam 2026-03-28 docs: fix typos and grammar errors across documentation
```

#63799 は 1 行の変更で、body で「何を・なぜ」を 2 段落書いています。そして同じ修正が `20.3.x` にも別の SHA（134c31bd1b2）で入っています。2025-09 の当時のパッチのブランチに cherry-pick された、つまり `target: patch` でマージされたということです（[第 11 回](11-contrib-branches.md)の 4 節、triage-and-labelling.md の `target: patch` の説明にある「documentation changes」）。あなたの PR も、レビュアーが `target: patch` を付ける形になります。

1. **手順 6：PR の説明文の下書き**

   [第 10 回](10-contrib-pr-flow.md)の 1 節で読んだ `PULL_REQUEST_TEMPLATE.md` の項目を、そのまま埋めます。テストは足していないので 2 つ目のチェックは空のまま、種類は「Documentation content changes」、破壊的変更は「No」。PR のタイトルはコミットメッセージの header（最初の行）と同じにします（AGENTS.md は commit-message-guidelines.md を「コミットメッセージと PR のタイトルの形式」と紹介しています）。

> **🧪 DEMO — PR の説明文の下書き**
>
> 英語は短く、事実だけ。#64492 を指せば、レビュアーは経緯を 1 クリックで確かめられます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-first-pr)

1. **手順 7：出すと決めたら**

   ここから先は本家に見える操作です。出すと決めたら、push して PR を作ります。PR を作ったら、[第 10 回](10-contrib-pr-flow.md)のとおり CLA（未署名なら googlebot がコメントする）と CI を待ちます。

📄 `手順 7（出すと決めたときだけ）`

```
git push origin docs-fix-commit-scope-diagram

# PR の説明文を pr-body.md に保存してから
gh pr create --repo angular/angular --base main \
  --head <あなたの GitHub 名>:docs-fix-commit-scope-diagram \
  --title "docs: sync scopes in the commit message header diagram" \
  --body-file pr-body.md
```

1. **手順 8：レビューで言われうること**

   誰がレビューするかは、触ったファイルで決まります。

📄 `angular/.pullapprove.yml` L301–320 （▶ の行: 301, 319）

```yaml
301 ▶   dev-infra:
302 │     <<: *defaults
303 │     conditions:
304 │       - >
305 │         contains_any_globs(files
306 │             .exclude('.pullapprove.yml')
307 │             .exclude('tools/manual_api_docs/blocks/*.md')
308 │             .exclude('tools/manual_api_docs/elements/*.md')
309 │             .exclude('.agent/**/*.md'),
310 │         [
311 │           '{*,.*}',
312 │           '.agent/**/{*,.*}',
313 │           '.devcontainer/**/{*,.*}',
314 │           '.github/**/{*,.*}',
315 │           '.husky/**/{*,.*}',
316 │           '.gemini/**/{*,.*}',
317 │           '.ng-dev/**/{*,.*}',
318 │           '.vscode/**/{*,.*}',
319 ▶           'contributing-docs/*.md',
320 │           'contributing-docs/images/**/{*,.*}',
```

📄 `angular/.pullapprove.yml` L336–347 （▶ の行: 343, 345–347）

```yaml
336 │           'tools/tslint/**/{*,.*}',
337 │           'tools/utils/**/{*,.*}',
338 │           'tools/yarn/**/{*,.*}',
339 │           'tools/{*,.*}',
340 │           '**/*.bzl'
341 │           ])
342 │       - author not in ["angular-robot"]
343 ▶     reviewers:
344 │       users:
345 ▶         - alan-agius4
346 ▶         - devversion
347 ▶         - josephperrott
```

319 行目の `contributing-docs/*.md` に当たるので、301 行目の `dev-infra` の group が有効になり、343〜347 行目の 3 人（alan-agius4・devversion・josephperrott）の誰かの承認が要ります。ただし [第 10 回](10-contrib-pr-flow.md)の 4 節で読んだ `users_unavailable` に devversion が入っているので、依頼は残りの 2 人に出ます。#64492 を書いた alan-agius4 が、この group にいます。これに加えて、作者以外のチームの 1 人の承認（required-minimum-review）も要ります。`contributing-docs/` は google-sync-config.json の `syncedFilePatterns` に入っていないので、Google の社内に同期されるファイルは変わりません。

言われうることと、そのときの直し方を、規則の行と結び付けておきます。

| 言われうること | 直し方 | 根拠 |
| --- | --- | --- |
| summary の言い回しを変えて | `git commit --amend` → `git push --force-with-lease` | CONTRIBUTING.md「Updating the commit message」 |
| 並びを図の元の順に戻して／折り返しを変えて | 直して `git commit --all --fixup HEAD` → `git push` | CONTRIBUTING.md「Addressing review feedback」、第 10 回の 7 節 |
| main と衝突している（robot のコメント） | `git fetch upstream` → `git rebase upstream/main` → `git push --force-with-lease` | angular-robot.yml の `noConflict`（第 10 回の 5 節） |
| 図から scope の一覧をなくして、箇条書きへのリンクにしよう | レビュアーの案に合わせて差分を作り直す。どちらでもよい点なので、案に従う | 設定のコメントが指しているのは箇条書き（1 節） |

## 4. 次に挑戦できること

| 種類 | 例 | 読み直す回 |
| --- | --- | --- |
| docs の誤字・食い違い | contributing-docs や adev の誤字、第 11 回の branches-and-versioning.md L124 のような規則とコードの食い違い | [9. コミットメッセージ](09-contrib-commit-messages.md)・ [10. PR が通るまで](10-contrib-pr-flow.md) |
| テストの追加 | 読んだ挙動のうち spec が無いもの（第 7 回の練習を本物にする） | [5. テストを走らせる](05-contrib-run-tests.md)・ [6. spec の読み方](06-contrib-reading-specs.md)・ [7. テストを書く](07-contrib-writing-a-test.md) |
| help wanted の小さな修正 | area: ラベルで自分が読んだ場所を選び、再現 → テスト → 修正 | [12. issue の仕分け](12-contrib-triage.md)・ [13. コードの書き方](13-contrib-coding-standards.md)・ [14. 手元で確かめる](14-contrib-debugging.md)・ [8. 公開 API と golden](08-contrib-public-api.md)・ [11. ブランチとリリース](11-contrib-branches.md) |

どこまでを「いきなり PR」にしてよいかの線引きは、CONTRIBUTING.md の「Missing a Feature?」にあります（[第 1 回](01-contrib-overview.md)で引用）。小さな変更は直接 PR にしてよく、大きな機能は先に issue で設計を相談する。ドキュメントでも「新しい話題を足す・大きく書き直す」は大きな機能と同じ扱いです。誤字や食い違いの修正は「小さな変更」の側です。

## 聞かれそうな質問

**Q. こんな小さな PR を出していいの？**

はい。CONTRIBUTING.md の「Missing a Feature?」のとおり、小さな変更は issue を立てずに直接 PR にしてよく、ドキュメントで「大きい」とされるのは新しい話題の追加や大幅な書き直しだけです（4 節）。実際、同じファイルの 1 行だけを直した #63799（2 節の実例）は main と 20.3.x の両方に入っています。ただし CONTRIBUTING.md の「Contribution Quality」は「既存の PR を先に探す」ことを求めているので、手順 2 は省かないでください。

**Q. マージされなかったら？**

CONTRIBUTING.md の「Contribution Quality」の最後の段落のとおり、条件を満たさない PR は閉じられることがあります。この PR で起こりうるのは、出すまでの間に別の PR で直っていた場合と、レビュアーが別の直し方（例えば図から一覧を消す）を選んだ場合です。前者は手順 1・2 を出す直前にもう一度やれば避けられます。後者はレビューのコメントに理由が書かれるので、それに沿って作り直すか、閉じて次の題材に移ります。どちらも、ここまでの手順の誤りではありません。

**Q. 英語に自信がない**

この PR で書く英語は、コミットメッセージの 3 文と PR の説明文の数文だけで、どちらも「何が・どこで・どうなった」を短く言えば足ります。2 節の #63799 の body のように、実例の文の形を借りるのが確実です。レビューの英語が分からなければ、そう書いて聞き返してかまいません。summary の文法（命令形・小文字・ピリオド無し）は機械が検査するので、そこは ng-dev が通れば大丈夫です（1 節の実行例）。

**Q. 図と箇条書きのどちらが正しいと、どうして言える？**

検査に使われるのは `.ng-dev/commit-message.mjs` の `scopes` で、1 節の実行例のとおり `bazel` は ng-dev に弾かれます。箇条書きはその設定と一致し、設定の `scopes` の上のコメントも箇条書きを指しています。だから直す側は図です。

## 読み終えて

- 図（30〜34 行目）と箇条書きは同じ 24 個に見えて、3 つずつ入れ替わっている。正しいのは設定と一致する箇条書き。
- 食い違いは #64492 で箇条書きだけが直されたときに生まれた。履歴を読むと、PR の説明文に書くべきことが決まる。
- 出す前に、最新の main と既存の issue・PR を必ず確かめる。
- `docs:`・scope 無し・body に理由を 1〜2 文。手元で validate-range と format を通してから出す。
- 出すかどうかは自分で決める。出したら、第 10 回の門を 1 つずつ待つ。

---

← 前: [手元で確かめる：dev-app・ローカルのビルドを自分のアプリで使う](14-contrib-debugging.md)  
次: [forms の全体像：3 つの API と packages/forms の地図](../forms/01-forms-overview.md) →
