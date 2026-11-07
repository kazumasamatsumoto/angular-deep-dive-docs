[目次](../README.md) › [見つけた不具合を手元で直す](README.md) › 第 10 回 / 全 10 回

# 出す前の点検：8 つの直しをどう並べるか

> 8 つの枝を 1 つに重ねて関係するテストをすべて走らせた結果、spec の衝突、新しい main の上に乗るかの確かめ、gh（読むだけ）で同じ報告や PR を探した結果。issue を書くときに要るもの（最小の再現・版・期待と実際）、レビューで聞かれそうなこと、どれから出すか・出さないか、直さないと決めたものとその理由。

angular/angular · 読了 約 13 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fix-before-issue)

---

シリーズの最終回です。第 2〜9 回で作った 8 つの枝を 1 つの枝に重ね、関係するテストをまとめて走らせ、新しい main の上に乗るかを確かめ、gh（読むだけ）で同じ報告を探しました。この章ではその記録と、issue や PR を書くときに本家が求めるもの（テンプレートと CONTRIBUTING.md の行）を並べ、8 つをどう並べるか・どれを出さないかを考えます。そして、このシリーズで何も出さなかった理由を書きます。

読む対象は `CONTRIBUTING.md`・`.github/ISSUE_TEMPLATE/1-bug-report.yaml`・`.github/PULL_REQUEST_TEMPLATE.md`・ `contributing-docs/commit-message-guidelines.md`・`contributing-docs/spam.md` です（../angular と ../angular-fix で同じ中身であることを diff で確かめた）。

1. [1. 準備と流れ](01-fix-overview.md)
2. [2. enum の値](02-fix-enum.md)
3. [3. 消えた修正を戻す](03-fix-defer-immediate.md)
4. [4. 修正の取りこぼし](04-fix-event-replay-clickmod.md)
5. [5. 安定しないアプリ](05-fix-defer-error-stable.md)
6. [6. spec を直す](06-fix-spec-assertions.md)
7. [7. 一部しか直らない](07-fix-declare-field.md)
8. [8. 覚えたままの出力](08-fix-elements-outputs.md)
9. [9. 直せても出さない](09-fix-elements-reconnect.md)
10. **10. 出す前の点検**（この章）

> [!NOTE]
> **ポイント**
>
> このシリーズでは PR も issue も出しません。この章の表の「出すとしたら」の欄は、方針の提案として書くもので、出す予定ではありません。理由は 6 節に書きます。

## 1. 出す前に読む決まり：まず探す、設計は issue で

CONTRIBUTING.md の issue の節は、探すことと再現から始まります。貢献の全体の流れは [貢献の全体像](../contrib/01-contrib-overview.md) で読みました。

📄 `angular/CONTRIBUTING.md` L56–59 （▶ の行: 56, 58–59）

```md
56 ▶ Before you submit an issue, please search the issue tracker. An issue for your problem might already exist and the discussion might inform you of workarounds readily available.
57 │ 
58 ▶ We want to fix all the issues as soon as possible, but before fixing a bug, we need to reproduce and confirm it.
59 ▶ In order to reproduce bugs, we require that you provide a minimal reproduction.
```

56 行目「issue を出す前に issue の一覧を探す」。58〜59 行目「直す前に再現して確かめる必要があるので、最小の再現を求める」。私たちが gh で探したのは、この 56 行目に当たります（デモの「4. gh で同じ報告を探す」）。

PR の側の最低限の期待（Contribution Quality）は、こう始まります。

📄 `angular/CONTRIBUTING.md` L76–81 （▶ の行: 76, 78, 80–81）

```md
76 ▶ 1. Search [GitHub](https://github.com/angular/angular/pulls) for an open or closed PR that relates to your submission.
77 │    - You don't want to duplicate existing efforts.
78 ▶ 2. Be sure that an issue or pull request clearly describes the problem you're fixing, or documents the design for the feature you'd like to add. Issues require a _minimal_ reproduction.
79 │ 
80 ▶ 3. Discussing the design in an issue upfront helps to ensure that we're ready to accept your work. Pull requests are not the right place to do design work.
81 ▶    - When in doubt, open an issue first before doing any sort of speculative implementation work
```

1. **76 行目：開いている PR も閉じた PR も探す**

   同じことをしている人がいないか。[第 9 回](09-fix-elements-reconnect.md) の #38778 には、閉じた PR が 2 つありました。閉じた PR まで読むのは、この行のためです。
2. **78 行目：issue には最小の再現が要る**

   58〜59 行目と同じことを、PR の側からも言っています。
3. **80〜81 行目：設計は issue で先に話す。PR は設計の場ではない**

   迷ったら、推測で実装する前に issue を開く。第 9 回の 2 つの PR は、まさに PR の中で設計の議論になって止まりました。

## 2. issue を書くときに要るもの

不具合の issue は `1-bug-report.yaml` のフォームで書きます（白紙の issue は config.yml で閉じてあります）。

📄 `angular/.github/ISSUE_TEMPLATE/1-bug-report.yaml` L33–39 （▶ の行: 35, 37–39）

```yaml
33 │     id: is-regression
34 │     attributes:
35 ▶       label: Is this a regression?
36 │       options:
37 ▶         - 'Yes'
38 ▶         - 'No'
39 ▶     validations:
```

📄 `angular/.github/ISSUE_TEMPLATE/1-bug-report.yaml` L49–55 （▶ の行: 49, 52）

```yaml
49 ▶   - type: input
50 │     id: reproduction
51 │     attributes:
52 ▶       label: Please provide a link to a minimal reproduction of the bug
53 │ 
54 │   - type: textarea
55 │     id: exception-or-error
```

35 行目「後退か」は Yes / No を選ぶ必須の欄（39 行目の validations）です。52 行目の「最小の再現へのリンク」は `type: input` の 1 行で、このフォームの上では必須になっていません（49〜53 行目に validations が無い）。でも 1 節の 59 行目のとおり、再現が無い issue は確かめられずに閉じられます。

| フォームの欄 | 必須か | 手元にあるもの | 足りないもの |
| --- | --- | --- | --- |
| どのパッケージか | 必須 | 枝ごとに分かっている（compiler-cli・core・platform-server・elements） | — |
| 後退か（35 行目） | 必須 | 第 3 回は Yes と言える（383e093e6a1 の条件が 30891d8dec1 で落ちた）。第 9 回は No（2018 年の最初のコミットから） | ほかの 6 つは、前の版で動いていたかを確かめていない |
| 説明 | 必須 | 各章の 1 節の症状と、原因の行 | 英語の文 |
| 最小の再現へのリンク（52 行目） | フォームでは任意。CONTRIBUTING では必要 | リポジトリの中の失敗する spec（各章の「1. spec を足す」） | リポジトリの外で開ける再現（StackBlitz のような小さなアプリ）を、どの件もまだ作っていない |
| 出た例外やエラー | 任意 | spec の失敗のメッセージ（たとえば「Expected spy error not to have been called.」、NG0953） | — |
| 環境（ng version） | 任意 | 基点 8576f161ae4（22.2.0-next.7）と main 74961c66242 のコミット | 利用者のアプリでの ng version の出力 |
| そのほか | 任意 | 関係する issue と PR（デモの「4.」と各章の最後の節） | — |

## 3. PR を書くときの決まり：テンプレート・CLA・commit message・数

📄 `angular/.github/PULL_REQUEST_TEMPLATE.md` L9–15 （▶ の行: 9, 13, 15）

```md
 9 ▶ ## PR Type
10 │ 
11 │ What kind of change does this PR introduce?
12 │ 
13 ▶ <!-- Please check the one that applies to this PR using "x". -->
14 │ 
15 ▶ - [ ] Bugfix
```

9 行目の「PR の種類」では、13 行目のとおり当てはまる**1 つ**に x を付けます（15 行目の Bugfix など）。「1 つの PR に 1 つの変更」とそのまま書いた行は、CONTRIBUTING.md にも contributing-docs にも見つかりませんでした。いちばん近いのがこの 13 行目です。私たちの 8 つも、1 つの不具合に 1 つの枝・1 つのコミットにしてあります（[第 1 回](01-fix-overview.md)）。

ほかの決まりは CONTRIBUTING.md の Submitting a Pull Request の節にあります。CLA（Contributor License Agreement、貢献者のライセンスの同意書）に署名し、署名に使ったメールアドレスでコミットすること。テストを含めること。全体のテストを走らせること。Coding Rules の節でも、直しは 1 つ以上の spec で確かめることを求めています。PR が通るまでの流れは [PR が通るまで](../contrib/10-contrib-pr-flow.md) で読みました。

commit message の本文については、ガイドラインがこう書いています。

📄 `angular/contributing-docs/commit-message-guidelines.md` L109–112 （▶ の行: 109, 111–112）

```md
109 ▶ Just as in the summary, use the imperative, present tense: "fix" not "fixed" nor "fixes".
110 │ 
111 ▶ Explain the motivation for the change in the commit message body. This commit message should explain _why_ you are making the change.
112 ▶ You can include a comparison of the previous behavior with the new behavior in order to illustrate the impact of the change.
```

109 行目「要約と同じく、命令形・現在形で」。111 行目「本文には変更の動機、なぜ変えるのかを書く」。112 行目「前の振る舞いと新しい振る舞いを比べて書いてもよい」。本文の長さの検査（20 文字以上）は [第 9 回](09-fix-elements-reconnect.md) の 4 節で読みました。

この行で私たちの 8 つのコミットを読み返すと、直すところがあります。8 つのうち 5 つ（第 2・4・5・8・9 回）は、本文が「何が起きていたか」の過去形の説明だけで（たとえば第 8 回の「When the component was destroyed, …」）、この変更が何をするかを書いた文がありません。残りの 3 つ（第 3・6・7 回）には「This commit restores the check…」のような文があります。手元の検査（ng-dev commit-message pre-commit-validate）は、過去形だけの本文でも通しました。時制は検査では見つからないので、出す前に自分で読み直す点です。

最後に、数の決まりです。

📄 `angular/contributing-docs/spam.md` L7–9 （▶ の行: 7–9）

```md
7 ▶ Community contributors should limit themselves to no more than 3 open PRs at a
8 ▶ single time. If you have more than 3 open PRs, we ask that you wait until some of those
9 ▶ PRs are merged or closed before opening more.
```

7〜8 行目「コミュニティの貢献者が同時に開いておける PR は 3 つまで」。9 行目「それより多いときは、いくつかが merge されるか閉じられるまで待つ」。同じファイルの冒頭には、短い期間に多くの issue や PR を作ると、見られずに閉じられることがある、とも書いてあります（全体は [issue の仕分け](../contrib/12-contrib-triage.md)）。8 つを一度に出すことは、この決まりの上でもできません。

## テストと直し方：手元で走らせた記録

> **🧪 all-fixes：重ねる・まとめて走らせる・main に乗るか・gh で探す**
>
> これは手元の複製で走らせた記録の再生です。ボタンを押すと、その手順のコマンドと出力（要るところだけ）が出ます。gh の結果は 2026-11-06 に読むだけで取ったものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fix-before-issue)

### 「1. 8 つを 1 つの枝に重ねる」：Elements の 2 つが衝突した

基点（fix-practice）から all-fixes を作り、8 つの枝のコミットを順に cherry-pick（別の枝のコミットの変更を、今の枝の上にもう一度当てる操作）しました。衝突したのは 5 つ目、第 9 回の 91387bf99b7 です。第 8 回と第 9 回の直しが、どちらも component-factory-strategy\_spec.ts の同じ場所（`describe('disconnect')` の最後の it の後ろ）に it を足していたからです。直す側のファイル（component-factory-strategy.ts）は、変えた行が離れているので自動でまとまりました（記録の「Auto-merging」）。

衝突の印（`<<<<<<< HEAD`・`=======`・`>>>>>>> 91387bf99b7`）の間を見ると、2 つの it は名前と後半が違うだけで、前半の 4 行（つなぐ・外す・待つ・null を確かめる）は同じです。解き方は「両方の it を残す」です。どちらかを消すと、その直しのテストが無くなります。前半が同じだからと 1 つの it にまとめることもしませんでした。2 つは別の不具合で、別のコミットなので、それぞれの it がそれぞれの直しを確かめる形を保ちます。all-fixes の上では、第 8 回の it のあとに第 9 回の it が並んでいます（2b911c003cb）。

### 失敗：衝突の印が残ったままコミットした

1 回目にこれを解いたとき、私（取りまとめ役）の解く処理が失敗していたのに、衝突の印が残ったファイルを add して cherry-pick を続けてしまいました。手元の複製の reflog（枝の先がどう動いたかの記録）に、そのまま残っています。

1. **0ea44b02995「commit (cherry-pick)」**

   第 9 回の直しのコミットです。`git show 0ea44b02995:packages/elements/test/component-factory-strategy_spec.ts` には、衝突の印が 6 行残っています。コミットのときのフック（format staged と commit-message の検査）は、これを止めませんでした。
2. **そのあと 3 つを重ねた**

   declare・spec・defer-error の 3 つを cherry-pick して、f4ccd06fd09 まで進みました。
3. **枝を戻してやり直した**

   reflog の次の行は「reset: moving to 6aebd236da9」（第 8 回の直しまで戻す）です。そこから第 9 回を解き直して 2b911c003cb を作り、残りの 3 つを重ね直しました。

この失敗から付けた習慣は、cherry-pick を続ける前（`git cherry-pick --continue` の前）と、重ね終えたあとに、`git grep -n '^<<<<<<<'` で衝突の印を探すことです。今の all-fixes では 1 件も出ません。ビルドやテストが代わりに見つけてくれると当てにせず、印そのものを探します。

### 「2. 関係するテストをまとめて」

8 つの章で選んだターゲットを 1 つの `pnpm bazel test` に並べました。ターゲットは 9 つで、Elements と event-dispatch がそれぞれ Chromium と Firefox に分かれるので、テストは 11 になります。結果は「Executed 11 out of 11 tests: 11 tests pass.」、かかった時間は 50.7 秒でした。`//packages/compiler-cli/test/ngtsc:ngtsc` は 4 つの shard（1 つのテストを分けて並べて走らせる単位）で、記録には「Stats over 4 runs」と出ています。Elements の 2 つの it が同じ describe に並んでも、互いに邪魔をしていないことも、ここで分かります。

### 「3. 新しい main に乗るか」

../angular-main の 74961c66242（2026-10-30）を snapshot/main として取り込み、そこから作った一時的な枝に 8 つを 1 つずつ cherry-pick しました。8 つとも衝突はありませんでした。main では interpreter.ts・defer/instructions.ts・event\_replay.ts・incremental\_hydration\_spec.ts などが別の件で変わっていて、component-factory-strategy\_spec.ts も ecbc89b465c（テストの書き方の整理）で 1 行消えていましたが、cherry-pick はどれも衝突しませんでした。また、main でも 8 つとも同じ行のままで、直っていません。

ただし、**main の上ではテストを走らせていません**（依存を入れ直す必要があるため）。「衝突しない」は「main の上で通る」とは違います。出す前に残っている確かめの 1 つです。

### 「4. gh で同じ報告を探す」

言葉を変えて `gh api search/issues` で探し、言葉ごとに上位 8 件を取りました。題に言葉が無くても本文にあれば出るので、関係の無いもの（依存の更新の PR など）も多く混ざります。読み取れたことは次のとおりです。

- enum・declare・clickmod・spec の 4 つは、同じ報告が見つかりませんでした（clickmod の言葉で出るのは #57201 などの元のコミットだけ）。
- defer-immediate は、元の issue #54385（2024-02 に閉じた）が出ます。今の後退の報告はありません。
- Elements は #38778（開いている）と #58586（閉じた PR）が出ます。出力が届かなくなる件（第 8 回）の報告はありません。
- defer-error は #71769（開いている、2026-11-02）が出ます。同じ関数の別の道の件で、承認済みの PR #71798 があります（[第 5 回](05-fix-defer-error-stable.md)）。

## 4. 8 つを並べる

| 直し | 大きさ | 根拠の強さ | 既存の issue・PR | 出すとしたら | 出さない・待つ理由と、聞かれそうなこと |
| --- | --- | --- | --- | --- | --- |
| [第 6 回](06-fix-spec-assertions.md) spec の expect | spec だけ +5 −5 | 強い。直す前はイベントの行を消しても 4 specs, 0 failures、直したあとは同じ書き換えで 4 failures | なし | 最初の候補（テストだけ、test: の型） | keydown にだけ bubbles を足した理由を聞かれうる |
| [第 3 回](03-fix-defer-immediate.md) on immediate | 1 行・spec +22 | 強い。後退で、元の修正（383e093e6a1）と元の issue（#54385）がある | #54385（閉じた） | 早い候補（後退） | shouldTriggerDeferBlock を使わなかった理由。元の修正に spec が無かったこと |
| [第 2 回](02-fix-enum.md) enum | +5 −2・spec +15 | 強い。TypeScript の値と比べられ、4 つのファイルシステムで落ちて直る | なし（近いのは #29062・#36461、別件） | 早い候補（小さい） | 実際のアプリのどこで値のずれが困るか、の例を聞かれうる |
| [第 4 回](04-fix-event-replay-clickmod.md) clickmod | 1 行（と整形）・spec +28 | 強い。元のコミット（2a915d1912d）の片方だけに渡していた | なし（#57201 の元のコミット） | 上の 3 つのあと | format staged が直していない行も整形したので、差分が直しより大きく見える。片方だけにしたのは意図か、を聞かれうる |
| [第 7 回](07-fix-declare-field.md) declare | +6 −1・spec +23 | 一部だけ。`@Input() declare` は直したあとも残る | なし | 直しより先に、issue で方針を聞く | 残りを直すには公開されていない TypeScript の API が要る。どこまで直すかは方針の話 |
| [第 5 回](05-fix-defer-error-stable.md) @error の無い塊 | +10 −8・spec +56 | 強い。PR #71798 だけでは私たちの spec は落ちたまま、両方当てると通る | #71769（開いている）・PR #71798（承認済み） | #71798 が入るのを待つ | 私たちの症状が止まる関数（triggerHydrationForBlockQueue）と、同じ spec のファイルを、承認済みの PR が変えている。入ったあとに rebase が要る |
| [第 8 回](08-fix-elements-outputs.md) Elements の出力 | +2・spec +13 | spec で落ちて直る | なし（近いのは #38778） | 設計の結論を待つ | 「壊して作り直す」今の設計の上の直し。#64229 の形になれば要らない |
| [第 9 回](09-fix-elements-reconnect.md) #38778 | +1・spec +10 | spec で落ちて直る | #38778（開いている）・PR #38816・#58586（閉じた）・#64229・#64228 | 出さない | 同じ方向の PR が設計への疑問で 2 回止まった |

表の上から下への並べ方は、次の考え方によります。**方針の提案として書くもので、このシリーズでは出しません。**

1. **小さく、根拠が強いものから**

   テストだけの直し（第 6 回）は、製品の振る舞いを変えないので確かめる人の負担が小さい。後退（第 3 回）は「前はこうだった」というコミットが根拠になる。小さな直し（第 2 回）は差分を読む時間が短い。
2. **同時に開くのは 3 つまで**

   3 節の spam.md の 7〜8 行目。上の 3 つが済んでから次、という順番になります。
3. **一部しか直らないものは、先に方針を聞く**

   第 7 回は「どこまで直すか」が決まっていないので、1 節の 80〜81 行目のとおり issue が先です。
4. **承認済みの PR と同じ場所は、それが入るまで待つ**

   第 5 回。先に出すと、レビューする人が 2 つの PR の関係を整理しなければならなくなります。
5. **設計の議論中のものは出さない**

   第 8・9 回。メンテナーが「作り直し」自体を疑っているところに、作り直しを前提にした直しを出しても答えになりません。

## 5. 直さないと決めたもの

| 件 | どこ | 直さない理由 |
| --- | --- | --- |
| EventDispatcher に同じ Event を 2 回渡すと「Cannot redefine property: stopPropagation」 | event\_dispatcher.ts（configurable: false の defineProperty） | Angular のアプリ 2 つでの再現をまだ作っていない（jsaction のシリーズでも「試していない」と書いた）。先に再現を作るのが順番 |
| registerAppScopedDispatcher が効かない | earlyeventcontract.ts | Angular の中では呼ばれていない。使う人のいない API の直しは優先が低い |
| `@Input() declare` が JS に出る（第 7 回の残り） | compiler-cli の transform.ts | 内部の API が要るので、issue で方針を聞くのが先 |
| #71518（早期の契約のリスナーが外されない） | jsaction の早期の契約 | 承認済みの PR #71519 がある |

## 6. なぜこのシリーズでは出さないのか

著者の方針は「いきなり PR を出さない。戦略的にいく」です。知らない人から突然 8 つの PR が来れば、受け取る側は戸惑います。ここまでの記録から、その方針を支える事実を並べます。

- **数の決まりがある。**3 節の spam.md の 7〜9 行目。短い期間に多く出したものは、中身を見られずに閉じられることがある。
- **正しいコードでも、設計で止まる。**第 9 回の 2 つの PR は、テストを書き、rebase し、何年も待っても、「作り直すこと」への疑問で閉じられました。1 節の 80 行目のとおり、設計は PR で決めるものではありません。
- **レビューの時間は人の時間。**CONTRIBUTING.md の Contribution Quality の節は、どの PR もチームの誰かが時間を使ってレビューし merge する、と書いています。1 つ出すことは、その時間を 1 つ頼むことです。
- **手元の準備にも、まだ穴がある。**main の上でテストを走らせていない。リポジトリの外の最小の再現を作っていない。commit message の本文が命令形になっていないものがある。衝突の印をコミットしたこともある。

だから、このシリーズの到達点は「出せる状態まで手元で仕上げる」ことでした。8 つの枝・spec・記録・この表がその状態です。出すかどうか、いつ、どれからにするかは、このシリーズの外で決めます。

## 7. 次に何をするか

- **開いている issue を読んで、手元で再現を試す。**たとえば #71769 は「再現を作れなかった」と本文に書いています。手元の複製で、その道（Map の get と PendingTask）を通る spec が書けるかを試すのは、読むだけの練習としてもよい題です。
- **メンテナーのレビューを読む。**第 9 回のように、閉じた PR のレビューは「何が受け入れられないか」の一番の教材です。merge された PR の行へのコメントも同じように読めます。
- **main に追いつく。**8 つの枝を新しい main の上に乗せ直し、今度は main の上でテストを走らせる。衝突しないことと、通ることは別だからです。
- **直さないと決めたものの再現を作る。**5 節の 1 行目（同じ Event を 2 回渡す）は、Angular のアプリ 2 つでの再現が無いので、まずそこから。

## 聞かれそうな質問

**Q. cherry-pick の衝突は、どう解くのが正しかったのですか？**

Elements の 2 つの直しが、spec の同じ場所に別々の it を足していたので、両方の it を残すのが正解でした。前半が同じでも 1 つにまとめず、それぞれの直しを確かめる it を保ちます。解いたあとは `git grep -n '^<<<<<<<'` で印が残っていないことを確かめてから続けます。1 回目はそれをせず、印が残ったまま 0ea44b02995 をコミットし、6aebd236da9 まで戻してやり直しました。

**Q. 新しい main で衝突しなかったなら、そのまま出せますか？**

まだです。衝突しないのは「同じ行を誰も変えていない」ことだけで、main の上でテストを走らせていません。main では interpreter.ts や event\_replay.ts などが別の件で変わっているので、通ることは走らせて確かめる必要があります。

**Q. issue のフォームで最小の再現は任意なのに、なぜ要るのですか？**

フォーム（1-bug-report.yaml の 49〜53 行目）には validations がありませんが、CONTRIBUTING.md の 58〜59 行目は、直す前に再現して確かめる必要があるので最小の再現を求める、と書いています。リポジトリの中の spec は再現の一つですが、利用者のアプリの形の再現はまだどの件にもありません。

**Q. 一度にいくつまで出せますか？**

contributing-docs/spam.md の 7〜8 行目で、コミュニティの貢献者が同時に開いておける PR は 3 つまでです。9 行目で、それより多いときはいくつかが merge か close されるまで待つように書いています。

**Q. 8 つの中で、いちばん受け入れられやすいのはどれですか？**

ソースと記録から言えるのは、「小さい・根拠が強い・振る舞いを変えない」ものほど確かめる負担が小さい、ということです。その点で、spec だけの第 6 回、後退の第 3 回、小さい第 2 回が表の上に来ます。受け入れられるかどうかはメンテナーが決めることで、このシリーズでは確かめていません。

## 読み終えて

- 8 つを重ねた all-fixes では、Elements の 2 つが spec の同じ場所で衝突し、両方の it を残して解きました。9 ターゲット・11 テストがすべて通りました。
- 衝突の印を残したままコミットした失敗から、`git grep -n '^<<<<<<<'` で確かめる習慣を付けました。
- 新しい main には 8 つとも衝突なく乗りますが、main の上ではテストを走らせていません。
- 本家の決まりは「先に探す・再現を付ける・設計は issue で・PR は同時に 3 つまで」。並べ方の提案は、小さく根拠の強いものから、設計の議論中と承認済みの PR と同じ場所は待つ、です。
- このシリーズでは PR も issue も出していません。出せる状態まで手元で仕上げたところで終わります。

---

← 前: [直せても出さない：#38778 と閉じた 2 つの PR](09-fix-elements-reconnect.md)  
次: [HttpRequest の options：1 つずつ写す行と、最近の修正](../httpx/01-httpx-request-options.md) →
