[目次](../README.md) › [見つけた不具合を手元で直す](README.md) › 第 6 回 / 全 10 回

# spec を直す：何も確かめていない expect を見つける

> incremental\_hydration\_spec の 4 つの it が、ハイドレーションのあとに &lt;div jsaction= が無いことを確かめていたが、要素は &lt;article&gt; だった件。イベントを送る行を一時的に消しても通ること（空回り）を示し、要素の名前を直すと keydown の it が落ちて、泡立たないイベントという 2 つ目の誤りが見つかった流れ。test: のコミット。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fix-spec-assertions)

---

この章で直すのは Angular の本体ではなく spec です。incremental\_hydration\_spec.ts の 4 つの it が、ハイドレーションのあとに `<div jsaction=` が無いことを確かめていましたが、塊の中の要素は `<article>` でした。無いものを「無い」と確かめているので、ハイドレーションが起きても起きなくても通ります。「何も確かめていない expect」の見つけ方（起こすはずの操作を一時的に消して、テストが落ちるかを見る）と、要素の名前を直したら 2 つ目の誤り（泡立たないイベント）が出てきた流れを、記録のとおりに追います。

読む対象は `packages/platform-server/test/incremental_hydration_spec.ts` の describe `triggers` の中の `hydrate on interaction` と `hydrate on hover` です。

1. [1. 準備と流れ](01-fix-overview.md)
2. [2. enum の値](02-fix-enum.md)
3. [3. 消えた修正を戻す](03-fix-defer-immediate.md)
4. [4. 修正の取りこぼし](04-fix-event-replay-clickmod.md)
5. [5. 安定しないアプリ](05-fix-defer-error-stable.md)
6. **6. spec を直す**（この章）
7. [7. 一部しか直らない](07-fix-declare-field.md)
8. [8. 覚えたままの出力](08-fix-elements-outputs.md)
9. [9. 直せても出さない](09-fix-elements-reconnect.md)
10. [10. 出す前の点検](10-fix-before-issue.md)

> [!NOTE]
> **ポイント**
>
> このシリーズでは PR も issue も出しません。ここでも、本家に出せる形のコミットを手元で作るところまでです。

## 1. 不具合の形

見つけたのは @defer シリーズの[ハイドレーションのイベントの章](../defer/18-defer-hydrate-events.md)で、[不具合の表](../defer/20-defer-issues.md)に「（spec）」として載せました。そのときの表は「881 行目・1021〜1023 行目」の **2 つ**としていました。今回、同じ形を spec の中で探し直すと、keydown（949 行目）と focusin（1093〜1095 行目）にもあり、実際は **4 つ**でした。

利用者に見える不具合ではありません。困るのは、ハイドレーションのイベントの道を壊す変更が入っても、この 4 つの it が通ってしまい、だれも気づけないことです。

## 2. 原因の行：無いものを「無い」と確かめている

click の it のテンプレートです。

📄 `angular/packages/platform-server/test/incremental_hydration_spec.ts` L822–826 （▶ の行: 824–825）

```ts
822 │             template: `
823 │               <main (click)="fnA()">
824 ▶                 @defer (on viewport; hydrate on interaction) {
825 ▶                   <article>defer block rendered!</article>
826 │                   <span id="test" (click)="fnB()">{{ value() }}</span>
```

824 行目の塊の中の要素は、825 行目の `<article>` です。サーバーの描画では、この要素に jsaction（ハイドレーション前のイベントを預かるための属性。[jsaction の属性の章](../jsaction/02-jsaction-attribute.md)）が付きます。同じ it の前半はそれを正しく確かめています。

📄 `angular/packages/platform-server/test/incremental_hydration_spec.ts` L849–851 （▶ の行: 850–851）

```ts
849 │           expect(ssrContents).toContain('<main jsaction="click:;');
850 ▶           // <div>s inside a defer block have `d0` as a namespace.
851 ▶           expect(ssrContents).toContain('<article jsaction="click:;keydown:;"');
```

851 行目は `<article jsaction="click:;keydown:;"` です。850 行目のコメントは「`<div>`s inside a defer block」と書いていて、ここにも div の名残があります。そして it の最後です。

📄 `angular/packages/platform-server/test/incremental_hydration_spec.ts` L875–881 （▶ の行: 876–877, 881）

```ts
875 │           const article = doc.getElementsByTagName('article')![0];
876 ▶           const clickEvent = new CustomEvent('click', {bubbles: true});
877 ▶           article.dispatchEvent(clickEvent);
878 │           await allPendingDynamicImports();
879 │ 
880 │           appRef.tick();
881 ▶           expect(appHostNode.outerHTML).not.toContain('<div jsaction="click:;keydown:;"');
```

876〜877 行目で `<article>` に click を送り、881 行目で「`<div jsaction="click:;keydown:;"` が無い」ことを確かめます。この it の中に `<div jsaction` は最初から無いので、881 行目はいつでも真です。残りの 3 つも同じ形です。

📄 `angular/packages/platform-server/test/incremental_hydration_spec.ts` L942–949 （▶ の行: 943–944, 949）

```ts
942 │           const article = doc.getElementsByTagName('article')![0];
943 ▶           const keydownEvent = new KeyboardEvent('keydown');
944 ▶           article.dispatchEvent(keydownEvent);
945 │           await allPendingDynamicImports();
946 │ 
947 │           appRef.tick();
948 │ 
949 ▶           expect(appHostNode.outerHTML).not.toContain('<div jsaction="click:;keydown:;"');
```

📄 `angular/packages/platform-server/test/incremental_hydration_spec.ts` L1021–1023 （▶ の行: 1021–1022）

```ts
1021 ▶           expect(appHostNode.outerHTML).not.toContain(
1022 ▶             '<div jsaction="mouseenter:;mouseover:;focusin:;"',
1023 │           );
```

📄 `angular/packages/platform-server/test/incremental_hydration_spec.ts` L1086–1095 （▶ の行: 1087–1088, 1093–1094）

```ts
1086 │           const article = doc.getElementsByTagName('article')![0];
1087 ▶           const focusEvent = new CustomEvent('focusin', {bubbles: true});
1088 ▶           article.dispatchEvent(focusEvent);
1089 │           await allPendingDynamicImports();
1090 │ 
1091 │           appRef.tick();
1092 │ 
1093 ▶           expect(appHostNode.outerHTML).not.toContain(
1094 ▶             '<div jsaction="mouseenter:;mouseover:;focusin:;"',
1095 │           );
```

949 行目・1021〜1023 行目（mouseover の it の全体は[イベントの章](../defer/18-defer-hydrate-events.md)で引用）・1093〜1095 行目が、どれも `<div jsaction=` を見ています。943 行目にはもう 1 つの違いがあります。click・mouseover・focusin は `new CustomEvent(…, {bubbles: true})`（1087 行目など）なのに、keydown だけ `new KeyboardEvent('keydown')` で、`bubbles` を指定していません。これは 5 節で効いてきます。

### なぜそうなったか

`git -C ../angular-fix log -S '<div jsaction="click:;keydown:;"' -- packages/platform-server/test/incremental_hydration_spec.ts` で探すと、この文字列を入れたのは 95449302e95（2024-10、#58193「add incremental hydration infrastructure」）でした。`new KeyboardEvent('keydown')` も同じコミットです。`git show 95449302e95:…/incremental_hydration_spec.ts` で当時のファイルを見ると、ほかの it の中には `<div jsaction="click:;keydown:;" ngb="d0"` を確かめるものがあり、triggers の it は、テンプレートが `<article>` なのに最後の expect だけが div でした。`-S` で `<article jsaction=` の側も探すと、変えたのは同じ 95449302e95 と私たちのコミットだけです。入ったときから今まで、この 4 つの expect は意味のある検査をしていません。

## 3. 空回りを見つける：起こすはずの操作を消してみる

「この expect は何かを確かめているか」を読むだけで判断するのは難しいので、手で試します。考え方はミューテーションテスト（コードをわざと壊して、テストがそれに気づくかを見る方法）です。ここでは「ハイドレーションを起こすはずの操作」を消します。

1. **一時的に書き換える**

   4 つの it の `article.dispatchEvent(…)` の行（877・944・1088 行目と、mouseover の it の同じ行）をコメントにします。イベントが来なければ塊は目を覚まさないので、jsaction が残ったままでも it が落ちるかを見ます。
2. **走らせる**

   `--test_arg=--filter=hydrate on interaction|hydrate on hover` で 4 つだけ選びます。`--filter` は Node の jasmine のターゲットで効く絞り込みで、`|` で 2 つの describe の名前のどちらかに当たる it を選びます。
3. **結果を見る**

   デモの「1. イベントを消しても通るか」。「Ran 4 of 399 specs」「4 specs, 0 failures」。ハイドレーションが起きないのに 4 つとも通りました。これで、4 つの expect が何も確かめていないことが記録で言えます。
4. **書き換えを戻す**

   コメントにした行は、このあとの直しに入れません。確かめるためだけの書き換えです。

> [!TIP]
> **新卒エンジニアへ**
>
> 「Ran 4 of 399」で、4 つが本当に走ったことを先に確かめます。絞り込みが何にも当たらなくても「0 specs, 0 failures」で PASSED になるからです（[第 4 回](04-fix-event-replay-clickmod.md)で踏んだ落とし穴です）。

## テストと直し方：手元で走らせた記録

> **🧪 記録の再生：消しても通る → div を article に → keydown が落ちる → bubbles → 通る → 消すと落ちる**
>
> これは手元の複製で走らせた記録の再生です。ブラウザの中で bazel を動かしているのではありません。出力は記録から要るところだけ抜き、長い行は「…（略）」で切っています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fix-spec-assertions)

## 4. 要素の名前を直す

「2. div を article に直す」で、4 つの expect の `<div jsaction=` を `<article jsaction=` にしました。ハイドレーションが済めば jsaction の属性は消えるので、「`<article jsaction=…` が無い」はハイドレーションが起きたことの検査になります。851 行目（サーバーの描画の時点では `<article jsaction=` が**ある**）と対になる形です。

## 5. 2 つ目の誤り：泡立たない keydown

「3. 直した spec を走らせる」は「4 specs, 1 failure」でした。落ちたのは keydown の it だけです。出力の HTML を見ると、ハイドレーションのあとも `<article jsaction="click:;keydown:;" ngb="d0">` が残っています。keydown の塊は目を覚ましていませんでした。

原因は 943 行目です。`new KeyboardEvent('keydown')` は `bubbles` を指定していないので、泡立ち（イベントが要素から親へ順に伝わること）をしません。サーバーが書き出す `window.__jsaction_bootstrap(document.body, …)` のとおり、イベントを預かる契約（[早期の契約の章](../jsaction/05-jsaction-early-contract.md)）は `document.body` で聞いています（テストでも、platform-server/test/dom\_utils.ts がこのスクリプトを `eval` して同じ契約を作ります）。keydown は捕捉の段階（親から子へ降りる段階）で聞く種類（`CAPTURE_EVENT_TYPES`。[イベントの種類の章](../jsaction/04-jsaction-event-types.md)）に入っていないので、泡立ちの段階で body に届かなければ契約は気づきません。click・mouseover・focusin の it は `{bubbles: true}` を付けていたので届いていました。

これまでは expect が空回りしていたので、イベントが届いていないことも隠れていました。1 つ目の誤りを直したことで、2 つ目が見えたわけです。「4. keydown を泡立たせる」で、943 行目を `new KeyboardEvent('keydown', {bubbles: true})` にしました。本物のブラウザでキーを押したときの keydown は泡立つので、こちらが実際の操作に近い形です。

## 6. もう一度走らせる・逆の確かめ・周り

1. **5. もう一度走らせる**

   「4 specs, 0 failures」。4 つとも通りました。
2. **6. イベントを消すと落ちるか**

   3 節と同じ一時的な書き換え（4 つの `dispatchEvent` をコメントに）を、直した spec にしました。今度は「4 specs, 4 failures」。4 つの it が、ハイドレーションが起きなければ落ちる検査になったことが、ここで初めて言えます。直したあとに「通る」だけを見るのでは足りず、この逆の確かめまでが 1 組です。
3. **7. platform-server のすべて**

   絞り込みを外して `//packages/platform-server/test:test` を走らせ、「399 specs, 0 failures」。変えたのは spec 1 ファイルなので、そのファイルを含むターゲットだけを選びました。

## 7. コミットの書き方：fix ではなく test

直したのは spec だけで、Angular の利用者が受け取るコードは 1 行も変わっていません。type の一覧は contributing-docs にあります（`.ng-dev/commit-message.mjs` には scope の一覧だけがあり、type は ng-dev の既定です）。

📄 `angular/contributing-docs/commit-message-guidelines.md` L48–54 （▶ の行: 51, 54）

```md
48 │ | **ci**       | Changes to our CI configuration files and scripts (examples: GitHub Actions)                        |
49 │ | **docs**     | Documentation only changes                                                                          |
50 │ | **feat**     | A new feature                                                                                       |
51 ▶ | **fix**      | A bug fix                                                                                           |
52 │ | **perf**     | A code change that improves performance                                                             |
53 │ | **refactor** | A code change that neither fixes a bug nor adds a feature                                           |
54 ▶ | **test**     | Adding missing tests or correcting existing tests                                                   |
```

51 行目の `fix` は「A bug fix」、54 行目の `test` は「Adding missing tests or correcting existing tests」（足りないテストを足す、または今のテストを正す）です。今回は後者そのものなので `test` にします。`fix` にすると、CHANGELOG（リリースノート）に「直った不具合」として載ります。`test` は CHANGELOG に載らない type です（[コミットメッセージの章](../contrib/09-contrib-commit-messages.md)）。利用者にとって何も変わっていないのに不具合の修正として載せるのは、読む人を迷わせます。

- **見出し：`test(platform-server): check the hydrated element in hydrate trigger tests`**。scope は、変えたファイルがある npm パッケージの `platform-server`。
- **本文**は 2 つのことを順に書きました。(1) `hydrate on interaction` と `hydrate on hover` の it が `<div jsaction=...>` を確かめていたが、要素は `<article>` なので、ハイドレーションが起きなくても通っていた。(2) 検査を直すと keydown の it が落ちた。イベントが契約まで泡立たなかったためで、`bubbles: true` で送るようにした。2 つ目を書いておかないと、レビューする人には「なぜ expect の直しに KeyboardEvent の変更が混ざっているのか」が分かりません。
- **Fixes の行は無し。**この件の issue はありません。

## 8. issue を出す前に確かめること

1. **同じ直しが無いか**

   `gh api search/issues` で「incremental\_hydration\_spec」を探すと 0 件でした。
2. **同じファイルを触るほかの変更**

   2026-10-30 の main（74961c66242）では、incremental\_hydration\_spec.ts を 4 つのコミットが変えています。それでも、この枝を main の上に cherry-pick すると衝突は出ませんでした（main ではテストを走らせていません）。[第 5 回](05-fix-defer-error-stable.md)の枝も同じファイルに it を足しますが、場所が違い、全部を重ねた枝 all-fixes でも衝突しませんでした。
3. **レビューで聞かれそうなこと**

   (1) 「本当にハイドレーションを確かめているのか」には、デモの「6. イベントを消すと落ちるか」（4 specs, 4 failures）を答えにします。(2) 「850 行目のコメントの `<div>`s も直すか」。今回の差分には入れていません。直すなら同じコミットに入れる方が、読む人には筋が通ります。(3) 「表には 2 つと書いていたのに 4 つ」のように、探す範囲を広げたら数が変わったことは、本文に書いておくと、ほかにも残っていないかを聞かれたときに答えやすくなります。

## 聞かれそうな質問

**Q. なぜ 881 行目の expect は、ハイドレーションが起きなくても通るのですか？**

確かめている文字列 `<div jsaction="click:;keydown:;"` が、この it の HTML に最初から無いからです。塊の中の要素は 825 行目の `<article>` で、851 行目が確かめているとおり jsaction は `<article>` に付きます。`not.toContain` は無いものに対していつでも真です。記録でも、イベントを送る行を消して 4 specs, 0 failures でした。

**Q. keydown の it だけが、直したあとに落ちたのはなぜですか？**

943 行目の `new KeyboardEvent('keydown')` に `bubbles` が無く、イベントが `document.body` の契約まで泡立たなかったからです。keydown は捕捉の段階で聞く種類ではないので、泡立たないと契約は受け取れません。click・mouseover・focusin は 1087 行目のように `{bubbles: true}` を付けていました。

**Q. expect が何かを確かめているかは、どうやって確かめますか？**

確かめたいことの原因（ここではイベントを送る 877・944・1088 行目と、mouseover の it の同じ行）を一時的に消して、テストが落ちるかを見ます。落ちなければ、その expect は原因と結びついていません。直したあとにも同じことをして、今度は落ちる（記録では 4 specs, 4 failures）ことまで見て 1 組です。

**Q. spec だけの直しなのに、なぜ type を fix にしないのですか？**

利用者が受け取るコードが変わっていないからです。commit-message-guidelines.md の 54 行目で `test` は「足りないテストを足す、または今のテストを正す」で、今回はそれに当たります。`fix`（51 行目）にすると CHANGELOG に不具合の修正として載ります。

## 読み終えて

- 4 つの it（881・949・1021〜1023・1093〜1095 行目）は、塊の要素が `<article>` なのに `<div jsaction=` の不在を確かめていて、入ったときから一度も検査になっていなかった。以前の表の「2 つ」は実際は 4 つ。
- 空回りは、起こすはずの操作を一時的に消して落ちるかを見る（ミューテーションテストの考え方）と、記録で示せる。
- 1 つ目を直すと、隠れていた 2 つ目（943 行目の泡立たない keydown）が出てきた。
- 直したあとは「通る」だけでなく「消すと落ちる」まで確かめる。コミットは利用者のコードを変えないので `test(platform-server): …`。

---

← 前: [アプリが安定しない：@error の無い塊の読み込みの失敗](05-fix-defer-error-stable.md)  
次: [一部しか直らない直し：declare のフィールドと NodeFlags.Ambient](07-fix-declare-field.md) →
