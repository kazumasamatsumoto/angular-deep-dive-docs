[目次](../README.md) › [見つけた不具合を手元で直す](README.md) › 第 3 回 / 全 10 回

# 消えた修正を戻す：@defer (on immediate) と SSR の placeholder

> 2024 年の修正（383e093e6a1）が足した「サーバーでは placeholder を描く」条件が、あとの作り直しで落ちていた件。git log -S と git show で消えた行を追い、full\_app\_hydration\_spec に spec を足して空の SSR 出力を確かめ、条件を戻す。元の修正に spec が無かったことが、なぜ後退を招いたか。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fix-defer-immediate)

---

2024 年 2 月に直った不具合が、同じ年の 11 月の作り直しで戻っていた件です。この回では、消えた行を `git log -S` と `git show` で追い、`full_app_hydration_spec.ts` に spec を足して空のサーバー出力を確かめ、条件を戻します。元の修正に spec が無かったことが、なぜ後退（一度直ったものがまた壊れること。regression）を見逃させたかも見ます。

読む対象は `packages/core/src/defer/instructions.ts` の `ɵɵdeferOnImmediate`、`packages/core/src/defer/rendering.ts` の `shouldTriggerDeferBlock`、`packages/platform-server/test/full_app_hydration_spec.ts` です。

1. [1. 準備と流れ](01-fix-overview.md)
2. [2. enum の値](02-fix-enum.md)
3. **3. 消えた修正を戻す**（この章）
4. [4. 修正の取りこぼし](04-fix-event-replay-clickmod.md)
5. [5. 安定しないアプリ](05-fix-defer-error-stable.md)
6. [6. spec を直す](06-fix-spec-assertions.md)
7. [7. 一部しか直らない](07-fix-declare-field.md)
8. [8. 覚えたままの出力](08-fix-elements-outputs.md)
9. [9. 直せても出さない](09-fix-elements-reconnect.md)
10. [10. 出す前の点検](10-fix-before-issue.md)

## 1. 不具合の形

[defer の issue の章](../defer/20-defer-issues.md)の表に載せたものです。サーバーでの `@defer` の描き方は[サーバーでの @defer](../defer/15-defer-server.md)の章の 2 節にあります。サーバーでは、ふつうのトリガーの塊は placeholder を描いて止まります。ところが `@defer (on immediate)` に `@loading` と `@placeholder` の両方があると、placeholder も描かず、塊のところが空の HTML になります。ドキュメントの「サーバーでは placeholder を描く」と違い、2024 年に同じ形の issue（#54385）が出て、直っていたものです。

## 2. 原因の行

📄 `angular/packages/core/src/defer/instructions.ts` L440–446 （▶ の行: 440–441, 444–445）

```ts
440 ▶   // Render placeholder block only if loading template is not present and we're on
441 ▶   // the client to avoid content flickering, since it would be immediately replaced
442 │   // by the loading block.
443 │   const tDetails = getTDeferBlockDetails(lView[TVIEW], tNode);
444 ▶   if (tDetails.loadingTmplIndex === null) {
445 ▶     renderPlaceholder(lView, tNode);
446 │   }
```

440〜441 行目のコメントは「loading のテンプレートが無く、**かつクライアントにいるとき**だけ placeholder を描く」と言っています。ところが 444 行目の条件は `tDetails.loadingTmplIndex === null` だけで、「クライアントにいるとき」を確かめていません。`@loading` があると 445 行目の `renderPlaceholder` を通らず、その次の `triggerDeferBlock` はサーバーでは何もせずに止まります（[idle と immediate](../defer/09-defer-idle-immediate.md)の章）。だから何も描かれません。コメントと条件が食い違っているのが、行が消えた跡です。

## 3. 消えた行を追う

1. **足したコミットを探す**

   `git -C ../angular log -S'shouldTriggerDeferBlock(injector)' --oneline -- packages/core/src/defer/instructions.ts`。`-S'文字列'` は「その文字列の出てくる数が変わったコミット」だけを出します。結果は 3 つでした：95449302e95（2024-10、incremental hydration の土台）・383e093e6a1（2024-02、#54394）・908f660a728（2023、defer のコードの整理）。
2. **git show 383e093e6a1：元の修正**

   見出しは「fix(core): show placeholder block on the server with immediate trigger (#54394)」、本文は「ほかのトリガーは全部サーバーで placeholder を描くのに、`on immediate` だけ描かない。ほかに合わせる」で、`Fixes #54385.` が付いています。差分は instructions.ts の 1 ファイル（+4 -3）だけで、コメントに「and we're on the client」を足し、条件を `!shouldTriggerDeferBlock(injector) || tDetails.loadingTmplIndex === null` にしました。**spec の変更はありません**。このときの `shouldTriggerDeferBlock(injector)` は、`DeferBlockBehavior.Manual` なら false、そうでなければ `isPlatformBrowser(injector)` を返す関数でした。
3. **git show 95449302e95：形が変わっただけ**

   incremental hydration の土台を入れたコミットで、条件は `!shouldTriggerDeferBlock(injector, tDetails) || …` になりました。引数が増えただけで、サーバーの確かめは残っています。`-S` がこれを出したのは、`shouldTriggerDeferBlock(injector)` という文字列が無くなったからです。
4. **落としたコミットを探す：git log -S'loadingTmplIndex === null'**

   同じファイルで探すと、30891d8dec1・42c99763f5e・95449302e95・383e093e6a1・908f660a728 が出ます。`git show 30891d8dec1` の `ɵɵdeferOnImmediate` の差分で、`- if (!shouldTriggerDeferBlock(injector, tDetails) || tDetails.loadingTmplIndex === null) {` が `+ if (tDetails.loadingTmplIndex === null) {` に変わっていました。コメントの 3 行は残したままです。
5. **30891d8dec1 は何の作り直しだったか**

   見出しは「refactor(core): Consolidates shouldTrigger\* methods down to one (#58833)」（2024-11-19）。本文は「トリガーのコードを片付け、論理を 1 つの関数にまとめる。`hydrate when` の振る舞いの issue も直す（fixes: #58709）」です。9 ファイル +357 -251 の大きな作り直しで、いくつもあった `shouldTrigger*` を、今の `shouldTriggerDeferBlock(triggerType, lView)` と `shouldAttachTrigger` にまとめました。immediate の命令は、先頭の `shouldAttachTrigger(TriggerType.Regular, …)` の確かめを得た代わりに、placeholder の条件の中のサーバーの確かめを失いました。
6. **どの版に入ったか**

   `git tag --contains` で見ると、元の修正は 17.2.0（パッチの枝の 6d00115bf45）と 17.3.0 から、落としたコミットは 19.0.2（パッチの枝の d23a5d5cae1）と 19.1.0 からです。各タグの instructions.ts を `git show <タグ>:packages/core/src/defer/instructions.ts` で読むと、17.2.0〜19.0.1 にはサーバーの確かめがあり、19.0.2 と 19.1.0 には無いことも確かめられます。

> [!NOTE]
> **さらに深く**
>
> **spec が無い修正は、作り直しで消えても誰も気づかない。** 383e093e6a1 は条件を 1 つ足しただけで、「サーバーで `@loading` がある immediate の塊は placeholder を描く」を確かめる it がありませんでした。30891d8dec1 は 9 ファイルにまたがる作り直しで、spec も変えていますが、消えた条件を確かめる it はもともとありません。だから条件が消えても落ちる spec が無く、今の基点でも platform-server の `:test` は全部通ります（[第 4 回](04-fix-event-replay-clickmod.md)の周りのテストの記録で 399 specs, 0 failures。第 4 回の直しは defer に触れていません）。この回で足す spec は、直す行よりも長く残る「この振る舞いは意図したもの」という印です。

## 4. 失敗する spec を書く

📄 `angular/packages/platform-server/test/full_app_hydration_spec.ts` L2844–2845 （▶ の行: 2844–2845）

```ts
2844 ▶     describe('defer blocks', () => {
2845 ▶       it('should not trigger defer blocks on the server', async () => {
```

2844 行目の describe `defer blocks` は、サーバーでの `@defer` を確かめる it の集まりです。2845 行目の最初の it が「サーバーでは塊を発火しない」、その次が「サーバーでは `on timer` の `setTimeout` を呼ばない」で、その後ろに足しました。「サーバーでのトリガー」の話が並ぶ場所なので、読む人が「immediate だけ placeholder を描かない」の確かめを同じ流れで見られます。

足した it（デモの「1. spec を足す」）は、テンプレートを `@defer (on immediate) { Main! } @loading { Loading... } @placeholder { Placeholder! }` にして、隣の it と同じ補助の関数 `ssr(…)` と `getAppContents(…)` でサーバーの出力を取り出し、3 つを確かめます。

- `toContain('<app ngh')`：ハイドレーションの印が付いた出力であること（隣の it と同じ）。
- `toContain('Placeholder!')`：placeholder が描かれていること。直す前に落ちるのはここです。
- `not.toContain('Loading...')`：直し方を間違えて loading を描いてしまう形を防ぐこと。

## 5. 走らせて失敗を確かめる

`full_app_hydration_spec.ts` は `:test_lib` に入るので、ターゲットは `//packages/platform-server/test:test` です（[第 1 回](01-fix-overview.md)の 3 節）。デモの「2. 直す前に走らせる」では「Ran 1 of 400 specs / 1 spec, 1 failure」でした。400 は、もとの 399 に足した 1 つです。

失敗の文は「Expected '…' to contain 'Placeholder!'.」で、'…' のところにサーバーの出力がそのまま出ます。`<app ngh="0">` の中は `<!--container-->` が 4 つ並ぶだけで、文字は 1 つもありません。1 節の「塊のところが空」が、spec の出力で確かめられました。

## 6. 最小の直し

差分はデモの「3. 直す」の 1 行です。

`if ((typeof ngServerMode !== 'undefined' && ngServerMode) || tDetails.loadingTmplIndex === null) {`

📄 `angular/packages/core/src/defer/instructions.ts` L418–420 （▶ の行: 418）

```ts
418 ▶   if (typeof ngServerMode !== 'undefined' && ngServerMode) {
419 │     // We are on the server and SSR for defer blocks is enabled.
420 │     triggerDeferBlock(TriggerType.Hydrate, lView, tNode);
```

418 行目のように、同じファイルの `ɵɵdeferHydrateOn*` などは「サーバーにいるか」を `typeof ngServerMode !== 'undefined' && ngServerMode` で確かめています。`ngServerMode` は、サーバーで描くときに true になる大域の印です（CLI の束での決まり方と platform-server が立てるところは[サーバーでの @defer](../defer/15-defer-server.md)の章）。`typeof` で確かめるのは、印がまったく無い環境（ふつうのブラウザ）でも参照のエラーにしないためです。同じファイルのほかの行と同じ書き方にそろえました。

### 採らなかった案：shouldTriggerDeferBlock を使う

元の修正に近づけるなら、今の `shouldTriggerDeferBlock(TriggerType.Regular, lView)` を使って `!shouldTriggerDeferBlock(…) || …` と書く案があります。

📄 `angular/packages/core/src/defer/rendering.ts` L499–505 （▶ の行: 499, 502–503）

```ts
499 ▶   // prevents triggering in the case of a test run with manual defer block configuration.
500 │   const injector = lView[INJECTOR];
501 │   const config = injector.get(DEFER_BLOCK_CONFIG, null, {optional: true});
502 ▶   if (config?.behavior === DeferBlockBehavior.Manual) {
503 ▶     return false;
504 │   }
505 │   return true;
```

499〜503 行目のとおり、この関数はサーバーの確かめのほかに、テストで `DeferBlockBehavior.Manual`（塊の状態をテストの側で手で進める設定）のときも false を返します。使うと、「クライアントのテストで Manual にした immediate の塊が、loading があっても placeholder を描く」という、もう 1 つの振る舞いまで変わります。この直しで確かめたのはサーバーの振る舞いだけなので、サーバーの確かめだけを戻しました。

ただし元の 383e093e6a1 の `shouldTriggerDeferBlock(injector)` も Manual で false を返していたので、Manual のときの振る舞いは 30891d8dec1 で一緒に変わっています。それを戻すべきかは、手元では確かめていません。

## 7. もう一度走らせる・周りのテスト

- デモの「4. 直したあと」：同じコマンドで PASSED。
- デモの「5. 周りのテスト」：`//packages/platform-server/test:test`（400 specs, 0 failures）と `//packages/core/test/acceptance:acceptance`（2693 specs, 0 failures, 3 pending specs）。どちらも PASSED です。

platform-server の `:test` は、サーバーの描画とハイドレーションの spec の集まりで、直した行がいちばん効く場所です。acceptance は core の振る舞いをクライアントで確かめる spec の集まりで、`@defer` の spec もここにあります。直した行はクライアントでは今までどおり `loadingTmplIndex` だけで決まるので、そこが変わっていないことをこちらで確かめました。pending は `xit` などで飛ばしている it の数です。

## 8. コミットの書き方

1. **見出し：fix(core): render placeholder on the server for \`on immediate\` with a loading block**

   直したのは core の src なので scope は `core` です。spec は platform-server のディレクトリにありますが、scope は「利用者が使うどのパッケージの振る舞いが変わるか」で決めます。
2. **本文：元の修正のコミットを名前で書く**

   記録の本文は「383e093e6a1 は immediate の placeholder をサーバーで描くようにした。あとの作り直しがサーバーの確かめを落としたので、placeholder と loading の両方がある塊は、またサーバーで何も描かなくなった。この commit は確かめを戻し、テストを足す」です。後退の直しでは、「いつ直り、何で戻ったか」を本文に書くと、読む人が `git show` で同じ道をたどれます。記録の本文は落としたコミットを「a later refactor」とだけ書いているので、30891d8dec1 の番号を書き足す余地があります。
3. **footer：閉じた issue に Fixes を付けない**

   📄 `angular/contributing-docs/commit-message-guidelines.md` L114–117 （▶ の行: 116）

   ```md
   114 │ ## <a name="commit-footer"></a>Commit Message Footer
   115 │ 
   116 ▶ The footer can contain information about breaking changes and deprecations and is also the place to reference GitHub issues and other PRs that this commit closes or is related to.
   117 │ For example:
   ```

   116 行目のとおり、footer は「この commit が閉じる、または関係する issue と PR」を書く場所です。#54385 は 2024-02-12 に閉じていて、この commit で閉じるものではありません。`Fixes #54385` と書くと、もう閉じた issue を閉じる印になります。記録のメッセージは footer を書いていません。

## 9. issue を出す前に確かめること

> [!NOTE]
> **ポイント**
>
> このシリーズでは PR も issue も出しません。ここに書くのは、出すかどうかを決める前に、手元で読んでおくことです。

- **元の issue を読む**：`gh issue view 54385 -R angular/angular`。題は「@defer doesn't render @placeholder in SSR when @loading present」、2024-02-12 に作られ同じ日に閉じています。ラベルは `area: core`・`core: defer`・`state: has PR`。本文の再現は、この回の spec と同じ形（on immediate と loading と placeholder）で、Angular 17.1.3 で報告されています。本文の「Is this a regression?」は No でした。
- **今の後退の報告があるか**：gh で「defer immediate placeholder server」「on immediate SSR loading」を探しました。出てくるのは #54385 だけで、19.0.2 からの後退を報告したものは見つかりません。
- **後退として書くなら**：issue の様式の「Is this a regression?」は Yes で、「17.2.0 で直り（383e093e6a1、#54394）、19.0.2 と 19.1.0 で戻った（30891d8dec1、#58833）」を書けます。3 節のタグの確かめがその根拠です。ただし版の境目は、各タグのソースの行で確かめたもので、各版のパッケージを入れて動かしては確かめていません。
- **レビューで聞かれそうなこと**：「Manual のときの振る舞いも戻すのか」（6 節の最後）。「30891d8dec1 の作り直しの意図と食い違わないか」——30891d8dec1 の本文は、まとめることと `hydrate when` の issue のことだけを書いていて、immediate の placeholder の振る舞いを変えるとは書いていません。意図した変更かどうかは、作者に聞いたわけではないので分かりません。
- **新しい本家**：`../angular-main` でも同じ行のままです。defer/instructions.ts は main で別の件で 3 回変わっていますが、cherry-pick は衝突しませんでした（[最終回](10-fix-before-issue.md)）。

## テストと直し方：手元で走らせた記録

> **🧪 fix/defer-immediate-ssr-placeholder：spec・直す前・直す・直したあと・周り・コミット**
>
> これは手元の複製で走らせた記録の再生です。「2. 直す前に走らせる」の失敗の文の中に、placeholder の無いサーバーの出力（`<!--container-->` が 4 つ）がそのまま出ています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fix-defer-immediate)

## 聞かれそうな質問

**Q. コメントには「クライアントにいるとき」とあるのに、なぜ条件に無いのですか？**

30891d8dec1 の作り直しで、条件の `!shouldTriggerDeferBlock(injector, tDetails)` だけが落ち、440〜442 行目のコメントは残ったからです。444 行目は `loadingTmplIndex === null` だけになりました（2・3 節）。

**Q. なぜ 2024 年の修正は消えたことに気づかれなかったのですか？**

383e093e6a1 の差分は instructions.ts の +4 -3 だけで spec がありませんでした。30891d8dec1 は既存の spec を全部通っていますが、消えた条件を確かめる it がもともと無かったからです（3 節の囲み）。

**Q. どうして `shouldTriggerDeferBlock` を使わずに `ngServerMode` を直接書いたのですか？**

今の `shouldTriggerDeferBlock` は、rendering.ts の 502〜503 行目で `DeferBlockBehavior.Manual` のときも false を返すので、テストの Manual の振る舞いまで変わるからです。サーバーの確かめだけを、同じファイルの 418 行目と同じ書き方で戻しました（6 節）。

**Q. この直しで `Fixes #54385` と書かないのはなぜですか？**

#54385 は 2024-02-12 に閉じていて、この commit が閉じるものではないからです。commit-message-guidelines.md の 116 行目のとおり、footer は閉じる・関係する issue を書く場所です。後退の経緯は本文に書きます（8 節）。

**Q. どの版から壊れていますか？**

タグのソースで見ると、条件があるのは 17.2.0〜19.0.1、無いのは 19.0.2 と 19.1.0 からです（3 節の 6 つ目）。各版を動かしては確かめていません。

## 読み終えて

- instructions.ts の 444 行目は `loadingTmplIndex === null` だけで、コメントの「クライアントにいるとき」が抜けている。サーバーで `@loading` がある immediate の塊は何も描かない。
- 消えた行は `git log -S` で 2 回探して見つけた。足したのは 383e093e6a1、形を変えたのは 95449302e95、落としたのは 30891d8dec1。
- 元の修正に spec が無かったので、作り直しで消えても CI は通った。足した spec はその印になる。
- 直しは `(typeof ngServerMode !== 'undefined' && ngServerMode) ||` を戻す 1 行。`shouldTriggerDeferBlock` は Manual まで含むので使わなかった。
- 閉じた issue に `Fixes` を付けない。後退は本文に「どのコミットで直り、どのコミットで戻ったか」を書く。

---

← 前: [enum の値がずれる：partial evaluator の 1 行](02-fix-enum.md)  
次: [同じ修正の取りこぼし：Shift クリックが再生されない](04-fix-event-replay-clickmod.md) →
