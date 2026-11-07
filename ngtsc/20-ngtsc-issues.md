[目次](../README.md) › [ngtsc の内側](README.md) › 第 20 回 / 全 20 回

# issue と PR を読む：ngtsc の今

> area: compiler のラベルで開いている issue のうち、テンプレートの外側（プログラム・handler・静的な評価・import・差分ビルド・循環・HMR・診断）に関係するものと、この 1 年に閉じた issue の表。どの issue がこのシリーズのどの章の行に関係するか、2025 年 11 月〜2026 年に入った修正の読み方と、その修正に付いた spec。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-issues)

---

最終回は、ngtsc の「今」を issue と commit から読みます。`area: compiler` のラベルの issue は、開いているもの 106 件・2025-11-01 以降に閉じたもの 95 件（2026-11-05 に gh で取得）で、多くはテンプレートの構文と型チェックの話です。この章では、そのうちテンプレートの外側（プログラム・handler・静的な評価・import・差分ビルド・循環・HMR・診断・性能・リンカー）に関係する、開いている 18 件と閉じた 20 件を、第 1〜19 回のどこの話かに結びつけて表にします。後半で、2025-11 以降に入った ngtsc の修正の commit を 12 個、直した行と足した spec で読み、最初に読む issue の選び方をまとめます。

読む対象は GitHub の angular/angular の issue と PR（`gh` で読むだけ）と `git -C ../angular log`・`git show` です。この章にはソースの引用はありません。行は各章で引用したものを指します。

1. [1. 全体像](01-ngtsc-overview.md)
2. [2. NgtscProgram](02-ngtsc-program.md)
3. [3. NgCompiler とチケット](03-ngtsc-compiler-ticket.md)
4. [4. リフレクション](04-ngtsc-reflection.md)
5. [5. 静的な評価](05-ngtsc-partial-evaluator.md)
6. [6. 参照と import](06-ngtsc-references-imports.md)
7. [7. 解析](07-ngtsc-trait-analyze.md)
8. [8. 解決と出力](08-ngtsc-trait-resolve-compile.md)
9. [9. @Directive の handler](09-ngtsc-directive-handler.md)
10. [10. メタデータの登録](10-ngtsc-metadata-registry.md)
11. [11. .d.ts を読む](11-ngtsc-dts-metadata.md)
12. [12. JS の書き換え](12-ngtsc-ivy-transform.md)
13. [13. .d.ts の書き換え](13-ngtsc-dts-transform.md)
14. [14. 差分ビルド](14-ngtsc-incremental.md)
15. [15. 意味のグラフ](15-ngtsc-semantic-graph.md)
16. [16. import の循環](16-ngtsc-cycles.md)
17. [17. HMR](17-ngtsc-hmr.md)
18. [18. 診断と性能](18-ngtsc-diagnostics-perf.md)
19. [19. テストを書く](19-ngtsc-test-env.md)
20. **20. issue と PR を読む**（この章）

## 0. 先に確かめる：手元の木と main の差

- このシリーズのソースは ../angular の 8576f161ae4（22.2.0-next.7）です。`git rev-list --count HEAD..origin/main` は 807 で、origin/main（2026-11-03）は 807 commit 先にあります。
- その 807 のうち `packages/compiler-cli/src/ngtsc` に触れるものは 141 個で、多くは**新しいプリプロセッサー（NGP）**の仕事です。2026-10-09 の 51a127ad7f1（#71313）で ngtsc の結合テストを NGP でも走らせる `ngtsc_ngp` のターゲットができ、HMR（d348fd884a2）・差分ビルド（4501ff813ff）・診断の番号（57905ca4e67）が NGP に移植されています。
- 第 17 回（HMR）・第 18 回（診断）・第 19 回（テスト）では、main で変わった所を各章の注意に書きました（`git diff HEAD origin/main -- <path>` で確かめた）。この章の commit の表は、手元の木に入っているものだけです。
- このサイトの DEMO が動かす本物は node\_modules の 22.1.6 です。表の修正が 22.1.6 に入っているかは、`git tag --contains <hash> --sort=creatordate` と、22.1.x のブランチへの cherry-pick（別の hash）で見ます。たとえば 45ebb127e32（main、v22.2.0-next.3）は 22.1.x では 9d8aa3a829c（v22.1.3）です。

## 1. データの取り方

📄 `ターミナル（読むだけ）`

```
# 取ったコマンド（読むだけ。2026-11-05）
gh issue list -R angular/angular --label 'area: compiler' --state open --limit 300 \
  --json number,title,labels,createdAt,updatedAt,comments
gh issue list -R angular/angular --label 'area: compiler' --state closed \
  --search 'closed:>=2025-11-01' --limit 300 --json number,title,labels,closedAt,stateReason
# 閉じた issue に付いた PR
gh issue view 68164 -R angular/angular --json closedByPullRequestsReferences,stateReason
# メンバーのコメントだけ
gh issue view 68069 -R angular/angular --json comments \
  -q '.comments[] | select(.authorAssociation=="MEMBER") | .body'
# 修正の commit
git -C ../angular log --since=2025-11-01 --format='%h %ad %an | %s' --date=short \
  -- packages/compiler-cli/src/ngtsc ':!packages/compiler-cli/src/ngtsc/typecheck'
git -C ../angular show --numstat <hash>
```

- 開いている 106 件のうち、題とラベルがテンプレートの構文・型チェック・CSS のものを除き、残りから第 1〜19 回の行に結びつくものを選びました。閉じた 95 件も同じです。`compiler: extended diagnostics` の 7 件・2 件は [typecheck-extended](../typecheck/18-typecheck-extended.md) の持ち場なので入れていません。
- 閉じたものの「PR・commit」の列は、`gh issue view N --json closedByPullRequestsReferences`、`git log --all -E --grep='#番号([^0-9]|$)'`、メンバーのコメントのどれかで見つけたものだけです。見つからないものは空です。

## 2. 一覧

> **🧪 issue を絞る**
>
> 2026-11-05 に gh で取ったデータを、このページの中に持っています（通信はしない）。「章」の列は、その issue を読むときに開いておく章、「どこ」はその章の中の場所です。内容は題そのものではなく、日本語で短くしました。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-issues)

- 開いているもので一番コメントが多いのは #42011（55 件、TypeScript の incremental）・#37769（43 件、抽象クラスにもデコレーターが要る）・#37276（32 件、project references）・#48089（29 件、export した配列を imports に）です。どれも 2018〜2022 年の、1 つの関数の直しでは終わらない設計の話です。
- 2026 年に立って開いているのは #71674（host バインディングの検査）だけでした。コメントは 0 件です。
- 閉じたもののうち NOT\_PLANNED は 20 件中 9 件です。#70444 の「セキュリティの問題ではない。直す価値がない」、#60091 の「再現が無いので動けない」、#67706 の「ng-packagr を単独で使うと strictNullChecks が無い設定になる」のように、閉じた理由がメンバーのコメントに 1〜2 文で書かれています。
- #69719（TypeScript 7）は、メンバーが TypeScript 7 で動くコンパイラについてのブログの記事を示したうえで NOT\_PLANNED になっています。0 節の NGP は、その流れの中の仕事です。

## 3. 2025-11 以降に入った修正を commit で読む

どれも `git show` で、直した行と足した spec を読んでから書きました。行の数は `--numstat` の `+` と `-` です。

| commit | 日付・書いた人 | 直した所と、前と後の違い | 足した spec | 章 |
| --- | --- | --- | --- | --- |
| 1628125bcbc | 2025-11-11 Syam Gadde | `file_system/src/ts_read_directory.ts`（+12 −4）。ディレクトリを読むとき、壊れたシンボリックリンク（エディターのロックファイルなど）の `stat` で ENOENT が出るとコンパイラごと落ちていた。`try` で包み、ENOENT だけ飛ばす。 | **無し**（src だけ） | [第 2 回](02-ngtsc-program.md) |
| 106ba636503 | 2025-12-22 JoostK | `annotations/component/src/util.ts`（+28 −13）。`imports` の診断を配列の要素に付ける工夫（#60455）が、ライブラリの `.d.ts` の中まで飛んで、CLI が集めない場所に診断が出ていた（#65686）。`imports` の式の中にあるときだけ、その位置に付ける。 | ngtsc\_spec.ts（+61 −2） | [standalone-imports-check](../standalone/03-standalone-imports-check.md) |
| d94b19a92fe | 2026-01-18 JoostK | `file_system/src/util.ts`（+3 −3）。コンパイラが足す相対の import から拡張子を取る正規表現が `.ts`・`.d.ts`・`.js` だけで、`.tsx` のファイルを指すと `./index.tsx` のまま残っていた（closes #66262）。 | imports/test/emitter\_spec.ts（+26）`should drop .tsx extension` | [第 6 回](06-ngtsc-references-imports.md) |
| 7a0d6b8df21 | 2026-03-13 Kristiyan Kostadinov | `transform/src/transform.ts`（+1 −1）。Ivy の変換がプロパティを作り直すとき `questionToken` だけを渡し、`exclamationToken`（`foo!: T` の `!`）を落としていた。`node.questionToken \|\| node.exclamationToken` に。 | **無し**（1 行だけ） | [第 12 回](12-ngtsc-ivy-transform.md) |
| fcd0bb0db83 | 2026-03-26 Andrei Chmelev | `scope/src/local.ts`（+22 −13）。不正な NgModule の imports が循環を作ると、スコープを引く関数が自分を呼び続けた。解決中の印（`IN_PROGRESS_RESOLUTION`）に当たったら `'cycle'` を返して止める。PR #67750 が #65040（言語サービスが落ちる）を閉じた。 | ngtsc\_spec.ts（+24） | [ngmodule-compilation-scope](../ngmodule/04-ngmodule-compilation-scope.md) |
| ab061a7610b | 2026-04-07 Kristiyan Kostadinov | `translator/src/type_translator.ts`（+4 −2）・`typecheck/src/tcb_adapter.ts`（+10 −8）。型引数が自分の型引数を持つとき、型の訳し手が `TypeParameterDeclaration` を知らずに例外。訳し方を足し、自分自身への依存で総称の扱いを上書きしないように（relates #67704）。 | ngtsc\_spec.ts（+36 −7） | [typecheck-program-driver](../typecheck/04-typecheck-program-driver.md) |
| 8b2785b597c | 2026-06-23 aparziale | `annotations/directive/src/shared.ts`（+10 −1）。壊れた `host` で `parseHostBindings` が普通の `Error` を投げ、コンパイラと言語サービスが落ちた（fixes #69106）。`FatalDiagnosticError` に包む。 | ngtsc\_spec.ts（+19）。5 節で走らせた | [第 18 回](18-ngtsc-diagnostics-perf.md)の 1 節 |
| ae0ec7315c6 | 2026-07-14 LordKay-sudo | `program_driver/src/ts_create_program_driver.ts`（+7）。`updateFiles` が古いプログラムのタグを外すと、TypeScript が新しいプログラムと共有している `SourceFile` のタグまで外れ、`getSemanticDiagnostics()` が落ちた。新しいプログラムに `retagAllTsFiles` し直す（PR #69548、#68164）。 | typecheck/test/program\_spec.ts（+154 −1）。5 節で走らせた | [typecheck-program-driver](../typecheck/04-typecheck-program-driver.md) |
| 8d6c925392c | 2026-08-06 Matthew Beck | `imports/src/deferred_symbol_tracker.ts`（+25 −1）。`ts.isTypeNode` は `extends` の節（`ExpressionWithTypeArguments`）にも真を返すので、基底クラスの import を「型だけ」と見なして消し、実行時に ReferenceError。`extends` は値として数える。 | compliance のテスト（TEST\_CASES.json・GOLDEN\_PARTIAL.js ほか 7 ファイル、+127） | [standalone-defer-deps](../standalone/11-standalone-defer-deps.md) |
| 45ebb127e32 | 2026-08-17 Jaime Burgos | `diagnostics/src/util.ts`（+58 −1）・`error_code.ts`（+9 −9）・`docs.ts`（−24）・`core/src/compiler.ts`（+12 −6）。説明のページがある番号を `COMPILER_ERRORS_WITH_GUIDES` の Set から「ErrorCode の負の値」に移した。前の判定は `has(ngErrorCode(diag.code))` と、すでに -99 の付いた数にもう一度 -99 を付けていた。 | diagnostics/test/（新しい BUILD と spec、+50）・ngtsc\_spec.ts（+107 −47）ほか | [第 18 回](18-ngtsc-diagnostics-perf.md)の 3〜4 節 |
| 74b294cd51b | 2026-08-19 root | `annotations/directive/src/shared.ts`（+16 −6）・`pipe.ts`（+10 −6）・handler 2 つ（+1 ずつ）。`strictStandalone` のエラーを投げずに診断として返し、解析の結果を残す。 | standalone\_spec.ts（+32） | [第 18 回](18-ngtsc-diagnostics-perf.md)の 2 節 |
| 2e2c426e760 | 2026-08-20 Alex Rickabaugh | `annotations/component/src/util.ts`（+5 −1）。`deferredImports` をブロックの名前ごとの形で書いたとき、ブロックをまたいで同じ依存が 2 回入り、DirectiveMatcher で重複の衝突。`node` が同じものは足さない。 | defer\_spec.ts（+40） | [standalone-defer-deps](../standalone/11-standalone-defer-deps.md) |

- 12 個のうち spec を足していないのは 1628125bcbc（壊れたシンボリックリンク）と 7a0d6b8df21（1 行）の 2 つです。前者は偽のファイルシステム（[第 19 回](19-ngtsc-test-env.md)）にシンボリックリンクはあっても「壊れたリンクの `stat` が ENOENT」を作りにくい種類の直しです。
- 8d6c925392c は結合テストではなく compliance のテスト（入力と期待する出力の組。[contrib-reading-specs](../contrib/06-contrib-reading-specs.md) の 9 節）で確かめています。出力の形の直しは、この形で足すのが本家の流儀です。
- 45ebb127e32 は `refactor` と名乗っていますが、前の判定ではリンクが 1 つも付かなかった（第 18 回の 3 節の注意）ので、出力が変わる直しです。spec の期待の文字列が 47 行変わっています。
- 書いた人は 12 個で 10 人でした。PR の `author_association`（`gh api repos/angular/angular/commits/<sha>/pulls`）で見ると、crisbeto（Kristiyan Kostadinov）・JoostK・alxhub・mattrbeck の 6 個が MEMBER、SyamGadde・anchmelev・aparzi・LordKay-sudo・SkyZeroZx・97Fakhreddine（commit の名前は root）の 6 個が CONTRIBUTOR です。**ngtsc の修正の半分は、外の人が書いています**。

## 4. issue を 3 つ、行まで読む

1. **#68164 updateFiles が共有の SourceFile のタグを外す（2026-04-13 に立ち、07-14 に閉じた、PR #69548）**

   報告は「TS 5.5 以上で `getSemanticDiagnostics()` が `Cannot destructure property 'pos' of 'file.referencedFiles[index]'` で落ちる」です。行は型チェックのプログラムを作り直す `TsCreateProgramDriver.updateFiles` で、型チェック用の shim の参照を `referencedFiles` に足す「タグ」と、その付け外しは [typecheck-program-driver](../typecheck/04-typecheck-program-driver.md) と [第 2 回](02-ngtsc-program.md)で読みました。TypeScript は変わっていない `SourceFile` を古いプログラムと新しいプログラムで同じオブジェクトとして使い回すので、古い方のタグを外すと新しい方からも消えます。直しは 7 行で、新しいプログラムに付け直すだけでした。足した spec は単体テストで、`TsCreateProgramDriver` を直接作り、`updateFiles` のあとの `referencedFiles` の長さを見ています（5 節で 8 件を走らせた）。
2. **#49874 export していない standalone のクラス（2023-04-16 に立ち、2026-06-10 に閉じた、PR #68454）**

   言語サービス（エディター）だけで出るエラーで、`open for contributions` と `P4` が付いていました。閉じたのは atscott の「#68454 で直った。v22 の機能の締め切りに間に合わず、言語サービスの v22.1 で出る」というコメントです。直した 7f0265e43ab は `TraitCompiler.analyzeTrait` の「export していないクラスは解析の結果を捨てる」条件に `!isStandalone` を足し、`shouldSkipResolution` の 1 つの変数にまとめました（[第 7 回](07-ngtsc-trait-analyze.md)）。ふつうの `ngc` は `compileNonExportedClasses` が真なので関係が無く、言語サービスだけが偽で動いていた、という読み方ができます（[ls-compiler-factory](../ls/05-ls-compiler-factory.md)）。**同じコンパイラでも、呼ぶ側の設定で通る道が違う**例です。
3. **#44650 エラーのリンクを今の版の文書に（2022-01-06 に立ち、2026-02-12 に閉じた、PR #66374）**

   直しは `error_details_base_url.ts` の `DOC_PAGE_BASE_URL` で、版が `-next`・`-rc`・`0.0.0-PLACEHOLDER` なら `next.angular.dev`、それ以外は `v22.angular.dev` のような場所にします（[第 18 回](18-ngtsc-diagnostics-perf.md)の 4 節）。ところが第 18 回で確かめたとおり、配布物 22.1.6 の compiler-cli ではバンドルのときに `'0.0.0' + '-PLACEHOLDER'` が 1 つの文字列になってから版の番号に置き換えられ、いつも `next` を指していました。**issue が閉じていても、配布物で意図どおりに動いているとは限りません**。ソースの行と配布物の行の両方を見るのは、このシリーズの DEMO が 22.1.6 を動かしている理由でもあります。

## 5. 修正の spec を手元で走らせる

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
# 8b2785b597c が足した it（ngtsc_spec.ts の error handling の中）
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=should report a diagnostic instead of crashing when a host property binding'
# ae0ec7315c6 が足した it（typecheck/test/program_spec.ts）
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=should retain shim tags on shared SourceFiles'
```

- 1 つめは 4 つの shard が 0・1・1・2 件（合計 4 = it 1 つ × 4 つのファイルシステム）で、2.6 秒で PASSED でした。**shard の 1 つは 0 件**でも PASSED です。shard の分け方は spec の通し番号の余りなので（[第 17 回](17-ngtsc-hmr.md)）、件数が偏ることがあります。合計で見ます。
- 2 つめは単体テストのターゲットで shard が無く、8 件（2 つの it × 4）で 1.0 秒でした（ログは scratchpad/ngtsc-logs/e-issues-host.log・e-issues-retag.log）。
- どちらも直したあとの木なので通ります。直す前に落ちることを確かめるには、src の直しだけを手元で戻して走らせることになりますが、../angular を変えないこのシリーズではそこまでしていません。

## 6. 最初に読む issue の選び方

1. **ラベルで、テンプレートの外か中かを分ける**

   `compiler: template type-checking`・`compiler: parser`・`compiler: template pipeline` の付いたものはテンプレートの中（typecheck シリーズ・compiler シリーズ）です。ラベルが `area: compiler` だけのものに、このシリーズの話が多く混じっています（2 節の表の多くはラベルが空）。
2. **再現があるかを見る**

   `needs reproduction` の付いたものは、#67706・#60091 のように再現が出ないまま閉じるか、#59502（2025-01 から開いたまま）のように止まります。最初に読むなら、本文に最小の入力があり、[第 19 回](19-ngtsc-test-env.md)の `env.write` → `driveMain` の形にそのまま写せるものです。#68164 は、報告にエラーのメッセージと TypeScript の版が書かれていて、行まで追えました。
3. **関係するファイルが小さいものから**

   3 節の表で直したファイルは、`file_system/`・`imports/`・`program_driver/`・`diagnostics/` のように 1 つのディレクトリに収まっています。数百行のファイルの 1 つの関数なら、第 1〜19 回の章を 1 つ開けば読めます。`annotations/component/src/handler.ts`（2900 行を超える）の真ん中の話は後回しにします。
4. **メンバーのコメントを先に読む**

   #68069 の「#68279 で直った」、#69187 の「型チェックの都合の制限」、#15520 の「CLI から ngc を使う時代ではない」のように、方針は 1 つのコメントに書かれています。`gh issue view N --json comments -q '.comments[] | select(.authorAssociation=="MEMBER")'` で拾えます。
5. **手元で再現して、どの行かを決めるところまで**

   spec の形で再現できたら、どの章のどの行の話かをメモにします。本家にコメントや PR を出すことは、このシリーズでは勧めません。0 節のとおり main は NGP で大きく動いているので、手元の木の行が main で同じかも `git diff HEAD origin/main` で確かめてからにします。

## 7. このシリーズで見つけたもの

第 1〜19 回を書く途中で、本家の不具合らしきものと、テストや文書の小さな食い違いが見つかりました。どれも **issue も PR も出していません**。どれも本物の @angular/compiler-cli 22.1.6 で再現し、手元の木（8576f161ae4）のソースの行と照らして確かめました。本家の spec の形では走らせていません（../angular を変更しないため）。gh で探した範囲では、同じ報告は見つかりませんでした（最後の行の #48976 は既存の issue です）。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| 初期値の無い enum のメンバーの値が TypeScript と違う。`enum Size { Small = 1, Large }` の `Size.Large` を評価すると 1 になる（TypeScript では 2）。selector に使うと `app-size-1` が出力される | partial\_evaluator/src/interpreter.ts 323 行目（並びの番号 index をそのまま値にする） | PartialEvaluator と NgtscProgram の emit の記録 | [第 5 回](05-ngtsc-partial-evaluator.md) |
| Angular のクラスで、ほかのデコレーターが付いた `declare` のフィールドが、`useDefineForClassFields: true` のとき JS に `note;` として出る | transform/src/transform.ts 315-316 行目（作り直したノードに NodeFlags.Ambient が無い） | NgtscProgram の emit と、作り直す前後のノードの比較。既存の spec は es2015 で走るので拾わない | [第 12 回](12-ngtsc-ivy-transform.md) |
| 途中にデコレーターの無い素のクラスを挟むと、継承した入力が型チェックで見えなくなり NG8002 になる（実行時は ɵɵInheritDefinitionFeature で親の入力が効く） | metadata/src/inheritance.ts 50-56 行目（'dynamic' で止まる） | 継承の連なりの記録（plainMiddle の場面） | [第 10 回](10-ngtsc-metadata-registry.md) |
| 配布物 22.1.6 では、エラーの説明へのリンクが v22 ではなく next.angular.dev を指す。ソースでは版の判定の文字列を 2 つに分けて書いているが、配布物では 1 つにまとまったあとで版の番号に置き換わり、`full === "22.1.6"` になっている | diagnostics/src/error\_details\_base\_url.ts 14 行目と、配布物の chunk-NPM4D5UO.js 147 行目 | 記録した診断のリンクと、配布物の中身 | [第 18 回](18-ngtsc-diagnostics-perf.md) |
| （不具合とはしない）resourceChangeTicket の道のあとに emit すると、出力のテンプレートが古いまま。この道を使うのは emit しない言語サービスだけ | annotations/component/src/handler.ts 1547 行目（analysis.template だけ書き換える）と 1602 行目（compileFull は analysis.meta を使う） | チケットの記録 | [第 3 回](03-ngtsc-compiler-ticket.md) |
| （テスト）hmr\_spec.ts 378-392 行目の it は「HMR に対応しない Angular のクラス」を試す名前だが、`Directive` を import して `@Component` と書いているため、実際はデコレーターの無いクラスの道を通っている | test/ngtsc/hmr\_spec.ts 378-392 行目 | 同じ入力の記録（spec-directive と real-directive の場面） | [第 17 回](17-ngtsc-hmr.md) |
| （テスト）ngtsc\_spec.ts 1754 行目の it は名前が @ContentChild なのに、1755 行目で 'ContentChildren' を渡している。@ContentChild そのものを試す it が無い | test/ngtsc/ngtsc\_spec.ts 1754-1755 行目 | spec の行を読む | [第 9 回](09-ngtsc-directive-handler.md) |
| （今は影響なし）性能の記録の JSON を作るとき、事件の配列を段の配列の長さで回している。事件の数が段の数を超えると、後ろの事件が出なくなる書き方 | perf/src/recorder.ts 103 行目 | ソースの行を読む | [第 18 回](18-ngtsc-diagnostics-perf.md) |
| （文書）perf/README.md の説明（ts: の前置き、mark と span）が今のコードと合っていない | perf/README.md | コードと見比べる | [第 18 回](18-ngtsc-diagnostics-perf.md) |
| （既存の issue）standalone のコンポーネントどうしの循環は build のときに知らされず、実行時に ReferenceError で落ちる。開いている #48976 の症状 | annotations/component/src/handler.ts 2111 行目（standalone は循環を調べない） | 記録した .js を Node で読み込む | [第 16 回](16-ngtsc-cycles.md) |

読み方の目安: 上の 2 つ（enum と declare）は、出力の JS がソースの意味とずれるので、影響がいちばん大きいものです。issue を探すときは、題の言葉より、表の「どこ」のファイル名や関数名で gh を検索すると見つけやすくなります。

## 聞かれそうな質問

**Q. area: compiler の issue は、ほとんどテンプレートの話ですか？**

多くはそうです。開いている 106 件のうち、この章の表に入れたテンプレートの外側の話は 18 件でした。残りは型チェック・テンプレートの構文・CSS のカプセル化などで、typecheck シリーズや compiler シリーズの持ち場です。

**Q. ngtsc の修正の commit に spec が無いことはありますか？**

あります。3 節の 12 個では 1628125bcbc（壊れたシンボリックリンク）と 7a0d6b8df21（exclamationToken、1 行）が src だけです。8d6c925392c のように、結合テストではなく compliance のテストで確かめるものもあります。

**Q. closed の issue に付いた PR は、どうやって探しますか？**

`gh issue view N --json closedByPullRequestsReferences` が一番確かです（#68164 → #69548）。PR で閉じず、メンバーのコメントで閉じたもの（#68069 → #68279、#49874 → #68454）は、コメントを読みます。`git log --grep` は commit のメッセージに番号があるときだけ当たります。

**Q. 手元のソースで読んだ ngtsc は、今の main と同じですか？**

大きく違い始めています。main は 807 commit 先で、ngtsc に触れる 141 個の多くが NGP（新しいプリプロセッサー）です。HMR の依存の集め方は別のファイルに移り、env.ts は NGP でも走る形になりました（0 節）。仕組みの考え方は同じですが、行番号はずれます。

**Q. 最初に読むなら、どの issue がよいですか？**

6 節の基準（テンプレートの外・再現がある・1 つのディレクトリ・メンバーのコメントあり）に合うのは、閉じたものなら #68164 と #65040、開いているものなら #71674（host バインディングの検査、[第 9 回](09-ngtsc-directive-handler.md)。本文に @HostBinding('attr.onerror') の最小の例がある）です。まず spec の形で再現し、行を決めるところまでにします。

## 読み終えて

- area: compiler の issue のうち、テンプレートの外側のものは開いている 18 件・閉じた 20 件。開いているものの多くは 2018〜2022 年の設計の話。
- 2025-11 以降の ngtsc の修正は、1 つのディレクトリの数行の直しと、その形に合った spec（結合・単体・compliance）の組。2 つは spec が無い。
- 閉じた issue でも、配布物で意図どおりとは限らない（#44650 と 22.1.6 のリンク）。ソースの行と配布物の行を両方見る。
- main は NGP で大きく動いている。手元の木で読んだ行を main で確かめてから、issue を読む手がかりにする。

---

← 前: [ngtsc のテストを書く：NgtscTestEnvironment と runInEachFileSystem](19-ngtsc-test-env.md)  
次: [DevTools の全体像：ページ・content script・background・パネル](../devtools/01-devtools-overview.md) →
