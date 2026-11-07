[目次](../README.md) › [見つけた不具合を手元で直す](README.md) › 第 9 回 / 全 10 回

# 直せても出さない：#38778 と閉じた 2 つの PR

> 2020 年から開いている #38778（つなぎ直すとコンポーネントが作られない）を、手元では 1 行で直せた。そのうえで、閉じた PR #38816 と #58586 のレビューを読み、メンテナーが「壊して作り直すこと自体」を疑い、#64229 と #64228 に設計の話を移したことを確かめる。直す前に読むべきもの。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fix-elements-reconnect)

---

2020 年から開いている issue #38778（要素を外して戻すとコンポーネントが作られない）は、手元では 1 行で直せました。この章の前半はその 1 行と spec の記録です。後半が本題で、merge されずに閉じた 2 つの PR（#38816・#58586）のレビューを読み、メンテナーが「壊して作り直すこと」自体を疑って、設計の issue（#64229・#64228）に話を移したことを確かめます。そのうえで、なぜこの 1 行を出さないのかを書きます。

読む対象は `packages/elements/src/component-factory-strategy.ts` の `connect` と `disconnect`、それと gh（読むだけ）で 2026-11-06 に取った #38778・#38816・#58586・#64229・#64228 の記録です。

1. [1. 準備と流れ](01-fix-overview.md)
2. [2. enum の値](02-fix-enum.md)
3. [3. 消えた修正を戻す](03-fix-defer-immediate.md)
4. [4. 修正の取りこぼし](04-fix-event-replay-clickmod.md)
5. [5. 安定しないアプリ](05-fix-defer-error-stable.md)
6. [6. spec を直す](06-fix-spec-assertions.md)
7. [7. 一部しか直らない](07-fix-declare-field.md)
8. [8. 覚えたままの出力](08-fix-elements-outputs.md)
9. **9. 直せても出さない**（この章）
10. [10. 出す前の点検](10-fix-before-issue.md)

## 1. 不具合の形

見つけたのは Elements のシリーズの [切り離しと破棄](../elements/07-elements-disconnect.md) の 3 節です。要素を外して 10 ms 以上待ってから戻すと、コンポーネントが作られません。もう一度外して戻すと、今度は作られます。つまり**待ってから戻すたびに、作られる回と作られない回が 1 回おきに入れ替わります**。この件は issue #38778（2020-09-09 に開かれ、今も開いている）として既に報告されています。

> [!NOTE]
> **ポイント**
>
> このシリーズでは PR も issue も出しません。この章は、その方針がいちばんはっきり効く回です。

## 2. 原因の行

📄 `angular/packages/elements/src/component-factory-strategy.ts` L144–150 （▶ の行: 145, 147–148）

```ts
144 │       // moved elsewhere in the DOM
145 ▶       this.scheduledDestroyFn = scheduler.schedule(() => {
146 │         if (this.componentRef !== null) {
147 ▶           this.componentRef.destroy();
148 ▶           this.componentRef = null;
149 │         }
150 │       }, DESTROY_DELAY);
```

145 行目で、壊す予定の関数を `scheduledDestroyFn` に入れます（中身は「タイマーを取り消す関数」）。10 ms たつと 147〜148 行目で壊して `componentRef` を null にしますが、**`scheduledDestroyFn` は null に戻しません**。もう終わったタイマーを取り消す関数が残ります。

📄 `angular/packages/elements/src/component-factory-strategy.ts` L118–124 （▶ の行: 120–123）

```ts
118 │       // If the element is marked to be destroyed, cancel the task since the component was
119 │       // reconnected
120 ▶       if (this.scheduledDestroyFn !== null) {
121 ▶         this.scheduledDestroyFn();
122 ▶         this.scheduledDestroyFn = null;
123 ▶         return;
124 │       }
```

次に戻したとき、120 行目は「壊す予定がまだある」と判断します。121 行目で終わったタイマーを取り消し（何も起きない）、122 行目で null にして、123 行目で return します。コンポーネントを作る次の行まで進みません。

📄 `angular/packages/elements/src/component-factory-strategy.ts` L126–128 （▶ の行: 126–127）

```ts
126 ▶       if (this.componentRef === null) {
127 ▶         this.initializeComponent(element);
128 │       }
```

126 行目で `componentRef` が null なら、127 行目で作ります。1 回目に戻したときは、ここに届きません。

📄 `angular/packages/elements/src/component-factory-strategy.ts` L136–141 （▶ の行: 139–140）

```ts
136 │   disconnect() {
137 │     this.runInZone(() => {
138 │       // Return if there is no componentRef or the component is already scheduled for destruction
139 ▶       if (this.componentRef === null || this.scheduledDestroyFn !== null) {
140 ▶         return;
141 │       }
```

もう一度外すと、139 行目で `componentRef` が null なので 140 行目で何もせずに戻ります。予定は立ちません。だから次に戻したときは、予定も `componentRef` も null で、コンポーネントが作られます。これが「1 回おき」です。4 つの状態の図は [切り離しと破棄](../elements/07-elements-disconnect.md) の 3 節にあります。

`git log -S 'scheduledDestroyFn = null' -- packages/elements/src/component-factory-strategy.ts` で探すと、出てくるのは 2018-02 の 22b96b96902（#22413、Elements を足した最初のコミット）だけです。そのときの予定の関数は `this.componentRef!.destroy()` の 1 行で、`scheduledDestroyFn` を戻していませんでした。この不具合は後退（前は動いていたものが壊れた）ではなく、最初からあるものです。#38778 の本文も「Is this a regression?」に No と答えています。

## 3. 失敗する spec を書く

場所は [第 8 回](08-fix-elements-outputs.md) と同じ `component-factory-strategy_spec.ts` の `describe('disconnect')` の中、「10 ms で壊れる」の it の後ろです。本物の strategy を使うのはこの spec だけだからです（理由は第 8 回の 3 節）。

1. **つないで、外して、10 ms 待つ**

   既にある it と同じ `await new Promise((resolve) => setTimeout(resolve, 10))` で待ちます。
2. **壊れたことを確かめる**

   `getComponentRef(strategy)` が null。ここが外れると「壊れる前に戻した」ことになり、120〜123 行目の正しい取り消しの道を試してしまいます。
3. **もう一度つなぎ、作られたことを確かめる**

   `strategy.connect(...)` のあと、`getComponentRef(strategy)` が null でないこと。connect は同期で作るので、待たずに見られます。

## テストと直し方：手元で走らせた記録

> **🧪 fix/elements-reconnect-after-destroy の手順**
>
> これは手元の複製で走らせた記録の再生です。ボタンを押すと、その手順のコマンドと出力（要るところだけ）が出ます。ページの中で bazel が走るわけではありません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fix-elements-reconnect)

- **「2. 直す前に走らせる」**：`//packages/elements/test:test` の Chromium・Firefox とも FAILED。Chromium は「59 passed, 1 failed, 5 skipped」で、メッセージは「Expected null not to be null.」（2 回目の connect のあとも null）でした。
- **「3. 直す」**：145 行目の予定の関数の先頭に `this.scheduledDestroyFn = null;` を足しました。タイマーが発火した時点で、取り消す関数はもう意味がないからです。`if` の前に置いたので、`componentRef` が既に null のときも戻ります。
- **「4. 直したあと」**：2 つとも PASSED、Chromium は「60 passed, 0 failed, 5 skipped」。
- **「5. コミット」**：`fix(elements): create the component again when reconnected after destroy`。本文に何が（予定の関数が `scheduledDestroyFn` を戻さない）・どうなるか（次の connect が取り消しの道に入って作らない、作られるのは 1 回おき）を書き、最後の段落に `Fixes #38778` を置きました。

ここまでは [第 2 回](02-fix-enum.md) からと同じ手順で、うまくいっています。違うのは、この件には閉じた PR が 2 つあることです。出す前に、それを読みます。

## 4. 閉じた 2 つの PR を読む

記録は `gh api` で取った本文・コメント・レビュー・行へのコメントです（読むだけ）。英語のコメントはここでは短く言い換えています。

### #38778 のコメント（2020-09）：メンテナーは「バグだ」と認めていた

issue を開いた人（yefim）は、本文で既に `scheduledDestroyFn` が null にならないことを指摘しています。翌日、gkalpak が次のことを書きました。

- 意図は 3 つ。10 ms 以内に戻したら壊すのをやめる、10 ms 後に戻したら新しく作る。その 3 つ目ができていないのはバグ。
- ただし、直すのは簡単ではない。投影した子は最初に取り出したので、もう要素の中に無い。作り直しても、元のコンポーネントの中の状態は戻らない。
- 回避策として、private な欄を外から触る書き方も示した（`scheduledDestroyFn` を自分で呼んで null にする）。

さらに kseamon が、壊したあとに animations のエンジンが要素そのものを外してしまう、という別の問題を見つけています（あとで #38962 になった）。2020-11 には gkalpak が「壊さずに `ApplicationRef` から外す」試作を作り、「状態は残るが、ngOnDestroy が呼ばれなくなる」と書いています。

### PR #38816（2020-09-11〜2022-02-04）

- 変えたファイルは component-factory-strategy.ts と create-custom-element.ts の 2 つ。作り直したときに、属性から入力を入れ直す変更も含んでいました。
- 最初に googlebot が CLA（貢献者のライセンスの同意書）の署名を求め、同じ日に署名が確かめられています。
- 2020-09-13、gkalpak が CHANGES\_REQUESTED。要点は「作り直す道に進むのが心配。考えることが多すぎる」。挙げた点は、外から入れた入力の値をどこから戻すか、中の状態が消えること、投影した子をどう扱うか。代わりに「一時停止する」「利用者が壊す時を決める」案を挙げました。
- 行へのコメントで、要素の側の処理を消したために CI のテストが落ちていることと、animations の件は animations の側で直すべきことを指摘。
- 2021-05 に第三者が状況を尋ね、2021-09 には別の人が「客先に当てたが、複雑なコンポーネントでは足りない」と報告。
- 2022-02-04、jessicajaniuk が「いったん閉じる。進めたければ開き直して」と閉じました。

### PR #58586（2024-11-11〜2025-11-20）

- 変えたファイルは component-factory-strategy.ts・新しい spec の reconnect\_spec.ts・platform-browser の dom\_renderer.ts の 3 つ（+239 −1）。
- 2025-03 に JeanMeche がテストを走らせ直すために閉じて開き直し、2025-08 に作者が「見落としていた」と rebase、2025-09 に作者がレビューを催促しています。
- 2025-10-01、JeanMeche が衝突と「この変更で lock ファイルを更新すべきでない」ことを指摘。
- 2025-10-02、作者が commit message の検査に落ちたと報告。JeanMeche の答えは「本文が `Fixes angular#38778` の 19 文字しかない」。
- 2025-10-02〜03、dgp1130 の行へのコメント。disconnectedCallback の約束（外れたままでいること）を変えないか、Closure compiler の名前の付け替えで入力の名前が合わなくなる、テストは async/await で書く、shadow root を空にする場所がおかしい、など。
- 2025-10-04、dgp1130 のレビュー（次の節）。設計の issue #64229・#64228 を立てたことを書き、「今の形では費用に見合わない」と結んでいます。
- そのあとコメントは無く、2025-11-20 に閉じられました。閉じたときの説明のコメントは記録にありません。

commit message の本文の長さは、リポジトリの設定で決まっています。

📄 `angular/.ng-dev/commit-message.mjs` L7–9 （▶ の行: 8–9）

```js
7 │   maxLineLength: Infinity,
8 ▶   minBodyLength: 20,
9 ▶   minBodyLengthTypeExcludes: ['docs'],
```

8 行目の `minBodyLength: 20` が「本文は 20 文字以上」、9 行目で `docs` だけが例外です。`Fixes #…` の 1 行だけの本文は、ほとんどの場合この検査に落ちます。私たちのコミットは本文に 4 行の説明を書いたので、手元のフック（ng-dev commit-message pre-commit-validate）を通っています。

### 進まなかった理由を並べる

| 理由 | #38816（2020） | #58586（2024〜2025） |
| --- | --- | --- |
| 設計への疑問 | gkalpak：作り直す道そのものが心配（状態・入力・投影） | dgp1130：作り直すと中の状態が消え、投影も再現できない |
| 直す場所が違う | animations の件は animations で | shadow root を空にするのは dom\_renderer.ts の役目ではない |
| CI | 要素の側の処理を消して、既存のテストが落ちた | テストを走らせ直すために閉じて開き直された |
| commit message | — | 本文が 19 文字で、20 文字以上の検査に落ちた |
| 関係の無い変更 | — | lock ファイルを更新していた |
| 止まった期間 | 2021-05 の催促のあと動かず、2022-02 に閉じられた | 2025-03〜08 は作者が見落とし、10-04 のレビューのあと 11-20 に閉じられた |
| 実際の利用 | 当てても複雑なコンポーネントでは足りない、という報告 | — |

commit message・lock ファイル・CI は、手順を守れば避けられる失敗です（[第 10 回](10-fix-before-issue.md) で点検の表にします）。でも、どちらの PR も、最後に止めたのは一番上の行、**設計への疑問**でした。

## 5. ハイラムの法則と「いつも壊れている → ときどき壊れている」

ハイラムの法則（Hyrum's law）は、Google の Hyrum Wright の名前の付いた経験則で、**API を使う人が十分に多いと、約束したかどうかに関係なく、外から見える振る舞いのすべてに誰かが頼るようになる**、というものです。一度世に出た振る舞いは、変えると誰かが壊れます。

dgp1130 の 2025-10-04 のレビューの論点を、順に言い換えます。

1. **作り直すと中の状態が全部消える**

   要素の外側の値は包みの側で残せても、コンポーネントの中の `signal` などの状態は消える。それなら要素ごと作り直すのと変わらない。
2. **バグが場所を移るだけ**

   「10 ms 後に戻すと動かない」という誤りから、「10 ms 後に戻すと中の状態が初期化される」という別の誤りに移るだけで、良くなったとは言い切れない。
3. **投影は作り直せない**

   最初の描画で子は `<ng-content>` の場所へ動かされるので、作り直すときには要素の直下に見つからない（#64228）。
4. **ハイラムの法則**

   今は「いつも壊れていて役に立たない」状態。PR のあとは「ときどき壊れていて、一部は役に立つ」状態になる。利用者は壊れた振る舞いに頼っていると気づかずに頼り始め、正しく直すのが長い目で見てさらに難しくなる。

4 つ目が要点です。今の振る舞いに頼る人はいません（動かないので）。だから将来、正しい形（壊さずに外して戻す、#64229）に変えても困る人はいません。ところが「戻すと作り直されるが、状態と投影は消える」を一度出すと、それに合わせて書いたアプリが生まれます。そのあとで「状態を残す」形に変えると、作り直しを前提にしたアプリが壊れます。**1 行の直しが、正しい設計への道をふさぐ**、という心配です。

## 6. 話はどこへ移ったか：#64229 と #64228

dgp1130 は 2025-10-04 に 2 つの issue を立てました（どちらも開いていて、area: elements、コメント 0 件）。

| issue | 言っていること | 案 |
| --- | --- | --- |
| #64229 Angular Elements Lifecycle is Broken | カスタム要素には「壊す」という合図が無い。外れたあと、いつでも戻されうる。今の「外したら壊す」はコンポーネントの中の状態を失うので、考え方が誤っている | connect では `attachView`（最初だけ `createComponent`）、disconnect では `detachView`。ngOnConnected・ngOnDisconnected のようなフック。ngOnDestroy は、要素がガベージコレクションされたのを FinalizationRegistry で知ってから呼ぶ、など |
| #64228 content projection should require Shadow DOM | 投影は最初の描画でしか起きず、子を動かすので、あとから子を変えられない。作り直すこともできない | Elements での投影をやめるか、ShadowDom のカプセル化のときだけ `<slot>` の形で認める |

#64229 の案のとおりになれば、外したときにコンポーネントは壊れません。すると、この章の 145〜150 行目の予定の関数も、[第 8 回](08-fix-elements-outputs.md) の「壊れた出力を覚えている」問題も、形が変わります。私たちの 2 つの 1 行は、どちらも今の「壊して作り直す」設計の上の直しです。

## 7. 私たちの観察と、それでも出さない理由

### 新しい情報はあるか

記録を読んだ範囲で、#38778 と 2 つの PR に「1 回おき」と書いたコメントはありません。gkalpak（2020）は「次に入れたとき取り消しの道に入る」と書き、dgp1130（2025）は「10 ms 後に戻すと動かない」と書いています。私たちの観察は、**その次にもう一度外して戻すと、今でも作り直される**ことです（2 節の 139〜140 行目と 126〜127 行目。[切り離しと破棄](../elements/07-elements-disconnect.md) のデモで、本物の要素でも確かめた。この章の spec が確かめているのは 1 回目に作られないことだけ）。

これは 5 節の前提に関わります。今の振る舞いは「いつも動かない」ではなく、「2 回目には作り直され、状態と投影は消える」です。つまり今でも「ときどき作り直される」振る舞いは外に出ています。これを設計の議論でどう評価するか（今すぐ直す理由になるのか、ならないのか）は、メンテナーが決めることです。私たちが PR で決めることではありません。

### それでも出さない理由

- 私たちの 1 行は、#58586 よりさらに小さいだけで、dgp1130 の心配（作り直すと状態と投影が消える）にそのまま当てはまります。何も答えていません。
- メンテナーは 2 回続けて、同じ理由で作り直しの PR を止め、話を設計の issue に移しました。CONTRIBUTING.md も「PR は設計を決める場ではない」と書いています（[第 10 回](10-fix-before-issue.md) の 1 節）。
- 手元の spec が通ることは、「この行の動きが変わった」ことしか示しません。「変えるべきか」には答えません。

### もし将来書くとしたら、の順番

このシリーズでは何も書きません。ただ、将来この件に関わるなら、順番は PR からではありません。まず #64229 か #38778 に「事実」だけを足す形です。再現の手順（spec の形の 10 行）と、1 回おきに作り直されるという観察です。設計の方向が決まってから、それに合う変更を考えます。直しのコード（この 1 行）は、その順番の最後でも要らないかもしれません。

## ここまでの流れ

- 👤 `element.remove()` → 10 ms 待つ — 利用者のコード
  - `scheduledDestroyFn` の中で壊す — component-factory-strategy.ts 147〜148 — *scheduledDestroyFn は残る*
- 👤 戻す（1 回目） — 利用者のコード
  - `connect()` — component-factory-strategy.ts 120〜123 — *取り消しの道で return。作られない*
- 👤 外す → 戻す（2 回目） — 利用者のコード
  - `disconnect()` — component-factory-strategy.ts 139〜140 — *何もしない*
  - `connect()` → `initializeComponent()` — component-factory-strategy.ts 126〜127 — *新しく作る。状態と投影は戻らない*

## 聞かれそうな質問

**Q. 1 行で直るのに、なぜ 6 年も直っていないのですか？**

1 行で変わるのは 120〜123 行目の道に入らなくなることだけで、作り直したコンポーネントは中の状態も投影も失います。2020 年の gkalpak も 2025 年の dgp1130 も、その「作り直し」自体を問題にしました。2 つの PR はどちらもそこで止まり、話は #64229・#64228 に移っています。

**Q. ハイラムの法則を一言で言うと？**

API の利用者が十分に多いと、約束していない振る舞いにも誰かが頼るようになる、という経験則です。ここでは「戻すと作り直されるが状態は消える」を出すと、それに頼るアプリができ、あとで状態を残す正しい形に変えにくくなる、という心配に使われています。

**Q. 私たちの「1 回おき」の観察は、dgp1130 の論点を崩しますか？**

崩すとは言えません。今でも 2 回目には作り直される（139〜140 行目で予定が立たず、次の connect が 126〜127 行目に進む）ので、「いつも壊れている」という前提より実際は少し複雑だ、という事実を足すだけです。それをどう評価するかは設計の議論の中で決まることです。

**Q. #58586 の commit message は何がいけなかったのですか？**

本文が `Fixes angular#38778` の 19 文字だけで、.ng-dev/commit-message.mjs の 8 行目 `minBodyLength: 20` に足りませんでした。docs 以外（9 行目）は本文に 20 文字以上の説明が要ります。

**Q. spec は何を確かめていて、何を確かめていませんか？**

「壊れたあとにもう一度 connect すると `componentRef` が null でない」ことだけです。作り直したコンポーネントの入力・状態・投影が正しいか、animations が要素を外さないか（#38962）は確かめていません。PR のレビューで問われたのは、まさにその確かめていない部分です。

## 読み終えて

- 原因は、予定の関数（145〜150 行目）が `scheduledDestroyFn` を戻さないことで、2018 年の最初のコミットからあります。手元では先頭に 1 行足して、60 passed になりました。
- 閉じた 2 つの PR は、CLA・CI・commit message の長さ・lock ファイル・放置でもつまずきましたが、止めたのは「壊して作り直すこと」への設計の疑問でした。
- dgp1130 は、いつも壊れている振る舞いを、ときどき壊れている振る舞いに変えると、ハイラムの法則で正しい直しが難しくなる、と指摘し、#64229・#64228 に話を移しました。
- 「1 回おきに作り直される」は記録に無かった観察ですが、出すとしても PR ではなく、設計の issue に事実として足す順番です。このシリーズではそれもしません。

---

← 前: [覚えたままの出力：Elements の ReplaySubject](08-fix-elements-outputs.md)  
次: [出す前の点検：8 つの直しをどう並べるか](10-fix-before-issue.md) →
