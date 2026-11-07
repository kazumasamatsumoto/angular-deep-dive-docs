[目次](../README.md) › [common の内側](README.md) › 第 20 回 / 全 20 回

# issue と PR を読む：common の今

> area: common・common: image directive・core: pipes のラベルで開いている issue と、この 1 年に閉じた issue の表。どの issue がこのシリーズのどの章の行に関係するか、2026 年に入った修正（日付の書式・数の書式・画像・Location・ViewportScroller）の読み方と、その修正に付いた spec。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-issues)

---

最終回は、`@angular/common` の「今」を issue と commit から読みます。4 つのラベルで開いている issue と、2025-11-01 以降に閉じた issue を番号で重ねると、開いている 25 件・閉じた 27 件になりました（取った日は 2026-11-05）。表のあとで、2026 年に入った修正の commit がどの spec を足したか、開いている issue を 3 件、第 1〜19 回で読んだどの行の話かに結びつけて読みます。

読む対象は GitHub の angular/angular の issue と PR（`gh` で読むだけ）と `git -C ../angular log` です。この章にはソースの引用はありません。行は各章で引用したものを指します。

1. [1. 全体像](01-cmn-overview.md)
2. [2. NgClass と NgStyle](02-cmn-ng-class-style.md)
3. [3. NgForOf](03-cmn-ng-for-of.md)
4. [4. NgIf と NgSwitch](04-cmn-ng-if-switch.md)
5. [5. outlet](05-cmn-outlets.md)
6. [6. pipe の仕組み](06-cmn-pipe-mechanism.md)
7. [7. 小さな pipe](07-cmn-simple-pipes.md)
8. [8. KeyValuePipe](08-cmn-keyvalue-pipe.md)
9. [9. DatePipe](09-cmn-date-pipe.md)
10. [10. 日付の書式](10-cmn-format-date.md)
11. [11. 日付の部品](11-cmn-date-getters.md)
12. [12. 数の書式](12-cmn-format-number.md)
13. [13. NgOptimizedImage](13-cmn-image-overview.md)
14. [14. srcset と sizes](14-cmn-image-srcset.md)
15. [15. 画像のローダー](15-cmn-image-loaders.md)
16. [16. LCP と preload](16-cmn-image-lcp-preload.md)
17. [17. Location](17-cmn-location.md)
18. [18. テスト用の Location](18-cmn-location-testing.md)
19. [19. ViewportScroller](19-cmn-viewport-scroller.md)
20. **20. issue と PR を読む**（この章）

## 0. 先に確かめる：手元の木と main の差

- このシリーズのソースは ../angular の 8576f161ae4（22.2.0-next.7）で、この commit を入れた日は 2026-09-09 です。`git rev-list --count HEAD..origin/main` は 807 で、origin/main（2026-11-04）は 807 commit 先にあります。
- その 807 のうち、`packages/common/src`（http を除く）の fix・feat は 1 つだけでした：2cecc4aa608（2026-09-01 に書かれ、09-29 に main へ。arturovt、`disableOptimizedSrcset` のとき `[srcset]` のバインディングを通す、issue #49335）。第 14 回の srcset の話です。
- このシリーズで「main も同じ」と書いた所（Location・ViewportScroller・テスト用の Location）は、`gh api 'repos/angular/angular/contents/…?ref=main'` で main のファイルを読んで比べています。
- このサイトの DEMO が動かす本物は node\_modules の 22.1.6 です。この章の表の修正が 22.1.6 に入っているかは、`git tag --contains <hash> --sort=creatordate` の最初の tag で見ます（例：d109bf90d50 は v22.1.0-next.0、a69e56df718 は v22.1.0-next.1）。

## 1. データの取り方

📄 `ターミナル（読むだけ）`

```
# 取ったコマンド（読むだけ。2026-11-05）
gh issue list -R angular/angular --label "area: common" --state open --limit 200 \
  --json number,title,labels,createdAt,updatedAt,comments
gh issue list -R angular/angular --label "area: common" --state closed \
  --search "closed:>=2025-11-01" --json number,title,labels,createdAt,closedAt,stateReason
#   （common: image directive・core: pipes・common: async pipe も同じ形）
gh api graphql -f query='query{repository(owner:"angular",name:"angular"){issue(number:69636){
  comments{totalCount} timelineItems(first:100,itemTypes:[CROSS_REFERENCED_EVENT,CONNECTED_EVENT]){…}}}}'

# commit の側（../angular で）
git log --since=2026-01-01 --format='%h %ad %an | %s' --date=short \
  -- packages/common/src packages/common/testing ':!packages/common/http' | grep -E '\| (fix|feat|perf)'
git show --stat <hash>
git log HEAD..origin/main -- packages/common/src     # 手元の木より新しい main
```

| ラベル | 開いている | 閉じた（2025-11-01 以降） |
| --- | --- | --- |
| `area: common` | 24 | 26 |
| `common: image directive` | 11（全部 area: common にも付いている） | 6（同じ） |
| `core: pipes` | 1（#61501） | 1（#39276） |
| `common: async pipe` | 2（どちらも area: common にも付いている） | 0 |

- 2 つ以上のラベルが付いた issue は 1 行にしました。その結果が開いている 25 件・閉じた 27 件です。
- 開いているもののコメントの数と PR は GraphQL で取り直しました（`comments.totalCount` と、timeline の `CrossReferencedEvent`・`ConnectedEvent` のうち angular/angular の PR）。閉じたものの PR の列は、閉じた PR か、`git log --all -E --grep='#番号([^0-9]|$)'` で見つけた commit です。
- `common/http`（HttpClient）は別のラベル（`area: common/http`）なので、この表に入っていません。cookie の #70060 は `area: common` が付いていたので入っています。

## 2. 一覧

> **🧪 issue を絞る**
>
> 2026-11-05 に gh で取ったデータを、このページの中に持っています（通信はしない）。「章」の列は、その issue を読むときに開いておくとよい章です。内容は題そのものではなく、日本語で短くしました。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-issues)

- 開いている 25 件のうち 11 件が `common: image directive`（NgOptimizedImage）で、ほとんどが 2023〜2024 年の機能の要望です（`<picture>`・メディアクエリ・Observable のローダーなど）。PR が開いているのは #59495（#71694）と #69636（#69955）の 2 件だけです。
- コメントが多いのは、#15360（70 件、NgComponentOutlet の input・output）・#61501（44 件、signal の時代の pipe）・#43727（34 件、async pipe の null）。どれも 1 つの関数の直しでは終わらない設計の話です。
- 閉じたもののうち NOT\_PLANNED は 14 件です。「Intl を使うのを勧める」（#39606）、「型は API の約束」（#69863）、「抽象クラスへの追加は破壊的変更」（#70469）、「サポートの切れた版」（#69534）と、閉じた理由がコメントに 1 行で書かれています。
- COMPLETED の多くは、2026 年の画像のローダーと NgOptimizedImage の直し（3 節）です。

## 3. 2026 年に入った修正を commit で読む

CMN の各章で読んだ修正を、`git show --stat` で「どのファイルを変え、どの spec を足したか」と並べます。行の数は `+` と `-` を足したものです。

| commit | 日付・書いた人 | 何を変えたか | 足した spec | 章 |
| --- | --- | --- | --- | --- |
| dfdfbe34a57 | 2026-05-21 Matthieu Riegler | digitsInfo の桁に上限（format\_number.ts 16 行） | format\_number\_spec.ts（14 行） | [第 12 回](12-cmn-format-number.md) |
| 7596548e9b8 | 2026-08-25 Xia Chao | NaN をロケールの記号で書く（format\_number.ts 6 行） | format\_number\_spec.ts（10 行） | 第 12 回 |
| eeb03f4ea31 | 2026-05-30 SkyZeroZx | 日付の書式の文字列の長さに上限（format\_date.ts 12 行） | format\_date\_spec.ts（10 行）・date\_pipe\_spec.ts（6 行） | [第 10 回](10-cmn-format-date.md) |
| 1ec125276d8 | 2026-05-29 arturovt | formatDateTime のプロトタイプ汚染を防ぐ（format\_date.ts 2 行） | **無し**（src だけ） | 第 10 回 |
| 359fb503b8f | 2026-07-14 arshiya tabasum | 日付の書式のキャッシュで prototype を引かない（format\_date.ts 8 行） | format\_date\_spec.ts（9 行） | 第 10 回 |
| 311aff05aa2 | 2026-06-04 arturovt | I18nSelectPipe が `Object.hasOwn` で mapping を引く（4 行） | i18n\_select\_pipe\_spec.ts（16 行） | [第 7 回](07-cmn-simple-pipes.md) |
| 46d2cb7ff04 | 2026-08-14 arturovt | KeyValuePipe.transform の型でキーのリテラルの union を残す（keyvalue\_pipe.ts 27 行・公開 API の golden） | keyvalue\_pipe\_spec.ts（32 行） | [第 8 回](08-cmn-keyvalue-pipe.md) |
| 18003a33bb0 | 2026-02-06 Miles Malerba | ngTemplateOutlet の injector に `'outlet'` を足す（feat、22 行・golden） | ng\_template\_outlet\_spec.ts（70 行） | [第 5 回](05-cmn-outlets.md) |
| 38749698d05 | 2026-02-20 SkyZeroZx | 同じ URL が複数あるときの LCP の画像の見分け（lcp\_image\_observer.ts 73 行、fixes #53278） | e2e の `lcp-check-duplicate.e2e-spec.ts`（35 行） | [第 16 回](16-cmn-image-lcp-preload.md) |
| c1312da1832 | 2026-03-17 SkyZeroZx | sizes="auto" の画像を壊すときに取り直さない（ng\_optimized\_image.ts 9 行、fixes #67055） | **無し**（src だけ） | [第 14 回](14-cmn-image-srcset.md) |
| d14696e4308 | 2026-07-22 Jaime Burgos | preload の link に crossorigin を残す（preload-link-creator.ts 27 行ほか） | ng\_optimized\_image\_spec.ts（39 行） | 第 16 回 |
| b56e8651482 | 2026-05-25 Matthieu Riegler | placeholder の値をサニタイズ（18 行） | ng\_optimized\_image\_spec.ts（35 行） | 第 16 回 |
| 51cc9148076・d8790972bea・a6b8cb68afa | 2026-01-28・2025-12-30・2026-01-02 SkyZeroZx | ローダーに height・独自の変換（feat、closes #51723・fixes #65191 #64639） | image\_loader\_spec.ts（87 行・84 行ほか） | [第 15 回](15-cmn-image-loaders.md) |
| 8bbe6dc46c9 | 2025-12-29 Andrew Scott | 末尾のスラッシュを書くときだけ揃える 2 つの LocationStrategy（feat、45 行・golden・guide） | router の trailing\_slash\_integration.spec.ts（178 行） | [第 17 回](17-cmn-location.md) |
| d109bf90d50 | 2026-05-29 rootvector2 | `_stripIndexHtml` の正規表現の `.` を `\.` に（2 行） | location\_spec.ts（14 行） | 第 17 回 |
| 97cac1cf4d0 | 2026-04-21 SkyZeroZx | scrollToAnchor の `focus({preventScroll: true})`（8 行、fixes #65938） | viewport\_scroller\_spec.ts（26 行。ブラウザだけで走る） | [第 19 回](19-cmn-viewport-scroller.md) |
| a69e56df718 | 2026-06-04 rootvector2 | shadow root の `[name]` のセレクタに `CSS.escape`（3 行） | viewport\_scroller\_spec.ts（16 行。同上） | 第 19 回 |
| 8ec0d1eee80 | 2026-04-12 arturovt | hydration の最初の移動で頭へスクロールしない（router\_scroller.ts 21 行、closes #64578） | router\_scroller.spec.ts（100 行） | 第 19 回 |

- 書いた人を数えると、SkyZeroZx が 7 つ、arturovt が 5 つ（main の 2cecc4aa608 を入れると 6 つ）です。どちらもメンバーではなく、コメントの `authorAssociation` は CONTRIBUTOR です。**common の修正の多くは、外の常連の人が書いています**。
- 1ec125276d8 と c1312da1832 は spec を足していません。c1312da1832 はコンポーネントを壊すときの画像の取り直しで、ブラウザの通信を見ないと確かめられない種類の直しです。
- ViewportScroller の 2 つ（97cac1cf4d0・a69e56df718）の spec は、Node では `isNode` で飛ばす describe の中にあります。直したあと `//packages/common/test:test` だけを走らせても、足した it は 1 つも走りません（第 19 回）。
- 2026 年の範囲には、このほか 3dd35c242ca（05-31 arturovt、`escapeCssUrl` で CSS の文字列を閉じる文字をエスケープ。placeholder の `url("…")`）と、732e5050180（08-18、core の側で `hasOwnProperty` を全部 `Object.hasOwn` に）があります。

## 4. issue を 3 つ、行まで読む

1. **#48542 入れ子の ShadowDom で anchorScrolling が効かない（2022-12、open、PR なし）**

   本文の「Which package」は router ですが、行は common の `findAnchorFromDocument` です（[第 19 回](19-cmn-viewport-scroller.md)の 3 節の 193・210 行目）。ルーターは `Scroll` のイベントで `scrollToAnchor(e.anchor)` を呼ぶだけで（同じ章の 5 節の 120 行目）、探すのは common です。**issue の「どの package」は、利用者から見えた場所であって、直す場所とは限りません**。TreeWalker は `document.body` の下の普通の木だけを歩くので、shadow root の中にある別の shadow host には来ません。報告の「1 段目だけは見つかる」と、197〜204 行目の 1 段だけの中を見る書き方がぴったり合います。第 19 回の DEMO の `cmn-vs-target-shadow2` で、このサイトの 22.1.6 の本物が同じ結果になります。spec の形にするなら、同じ章の「テストと直し方」のとおり `createTallElementWithShadowRoot` を 2 段にして、**Chromium のターゲット**で走らせます。
2. **#55383 scroll-margin を守らない（2024-04、open）と、閉じた PR #70509**

   行は `scrollToElement`（第 19 回の 3 節の 167〜175 行目）で、オフセットは `setOffset` の値しか引きません。2026-09-01 の PR #70509 は `getComputedStyle` から `scroll-margin-top` を読んで引く 1 か所の直しでしたが、翌日 Andrew Scott が閉じました。理由は「`ViewportScroller` は古い仕組みで、推測を足したくない」「`scroll-margin` を書いている今のアプリの位置が変わる」「直すならルーターの側で `scrollIntoView` などを使って設計し直す」の 3 つです。issue には利用者の回避策（`Scroll` のイベントで `scrollMarginTop` を読んで `setOffset` する、自分で `scrollIntoView` する）がコメントで残っています。**直し方が正しくても、メンテナーの方針と合わない PR は閉じられます**。PR を考える前に、MEMBER・担当者のコメントを先に読む理由です。
3. **#69636 fill の画像の高さ 0 の警告が誤って出る（2026-07、open、PR #69955 が開いている）**

   報告は手順まで具体的です。同じ URL の画像が複数の `@defer` にあると、後から描くほうはブラウザのメモリのキャッシュから読まれ、`load` がビューを DOM に付ける前に来る。付いていない要素の `clientHeight` は 0 なので、NG02952 が出る。NgOptimizedImage の開発モードの検査は [第 13 回](13-cmn-image-overview.md)です。最初の PR #69809（07-16）は、CLA（貢献の契約）の署名を求める bot のコメントだけが付いて同じ日に閉じ、次の PR #69955（07-26）には JeanMeche が「`isConnected` で止めるだけだと、キャッシュから読んだ画像を二度と確かめない見逃しが入る」とレビューし、書いた人が「付いていなければ次のフレームで確かめ直す」に書き換えています。Node の spec の環境で `requestAnimationFrame` がどう用意されているかもやり取りに出ていて、**レビューで直されるのは、ふつうは「止める」から「確かめ直す」のような、見逃しを作らない形**だと読めます。

> [!NOTE]
> **ポイント**
>
> #20167（Location.go で外の URL へ行けない、2017 年、P4）は、2020 年のコメントで「文書を直すか、`https://` で始まる URL に警告を出すか」の 2 案が出たまま、PR が付いていません。行は [第 17 回](17-cmn-location.md)の 4 節（`joinWithSlash` が文字列をつなぐだけ）です。#50733（onPopState を base href で絞るか）も PR がありません。どちらも「振る舞いを変えるか、文書に書くか」を決める issue で、コードの直しの前に方針が要ります。

## 5. このシリーズで見つけた「不具合らしきもの」

各章で、ソースの行と本物の配布物（このサイトの node\_modules の 22.1.6）で確かめたものです。../angular のファイルは変えていません。`gh search issues` で同じ issue は見つかりませんでした（2026-11-05、各章に検索の言葉を書いた）。どれも**本家に issue や PR を出すことは勧めません**。issue を読むときの手がかりにします。確かめ方の細部は各章にあります。

| 場所 | 形 | 確かめ方 | 章 |
| --- | --- | --- | --- |
| mock\_platform\_location.ts の `forward` | 最後の要素で forward すると、位置が配列の外に出て `TypeError`（225 行目が `< length`） | 第 18 回の DEMO と Node で 22.1.6 を動かした。main も同じ行 | [第 18 回](18-cmn-location-testing.md) |
| mock\_platform\_location.ts の `pushState`・location\_mock.ts の `pushHistory` | 位置 0 まで戻ってから書くと、進む側の履歴が残る（`> 0` のときだけ捨てる） | 同上。go → go → back → back → go で 4 つ残る | 第 18 回 |
| mock\_location\_strategy.ts の `back` | replaceState のあとで戻ると、今のパスが記録用の文字列 `replace: /b` になる | 本物の Location と組み合わせて Node で動かした | 第 18 回 |
| location.ts の `go` と `onUrlChange` | listener が受け取る URL が、go では base href 付き、戻るでは正規化済み。# が変わる戻るでは 2 回 | 第 17 回の DEMO。振る舞いとして文書に書かれていないので、不具合かどうかは決めていない | [第 17 回](17-cmn-location.md) |
| imgix\_loader.ts の独自の変換 | 値にカンマを含む変換（`crop: 'faces,edges'`）が `split(',')` で割れる | 第 15 回の DEMO と Node | [第 15 回](15-cmn-image-loaders.md) |
| keyvalue\_pipe.ts の `compareFn` | 関数 → `null` に変えても並びが戻らない | 第 8 回で 22.1.6 を Node で動かした | [第 8 回](08-cmn-keyvalue-pipe.md) |
| NgStyle の shorthand と longhand | `padding` だけを変えると `padding-left` が画面で消える | 第 2 回の DEMO（renderer に届いた呼び出し） | [第 2 回](02-cmn-ng-class-style.md) |
| format\_date.ts | 閉じていない `'` が消える／-00:30 のタイムゾーンの符号／0〜99 年の `W` | 第 10・11 回で本物の 22.1.6 を動かして確かめた（第 11 回は spec の形の再現も示した） | [第 10 回](10-cmn-format-date.md)・[第 11 回](11-cmn-date-getters.md) |
| number\_pipe.ts の CurrencyPipe | `currencyCode` に `null`・`''` を渡したときの通貨の決め方 | 第 12 回 | [第 12 回](12-cmn-format-number.md) |
| router\_testing\_module.ts の文書コメント | 「TestBed の既定は MockPlatformLocation」は v21 の c795960ada1 から古い（今は FakeNavigationPlatformLocation） | `git show c795960ada1` の BREAKING CHANGE の文と、platform-browser/testing の providers | 第 18 回 |

テスト用の部品（第 18 回の 3 つ）は TestBed の既定ではないので、ふつうのアプリのテストには出ません。自分で `MockPlatformLocation` を入れたテストで、端の操作をしたときだけ出ます。

## 6. issue を読む手順

1. **ラベルと題で章を当てる**

   `common: image directive` なら第 13〜16 回、題に DatePipe・formatDate があれば第 9〜11 回、Location・anchorScrolling・scroll なら第 17〜19 回。2 節の表の「章」の列がその対応です。本文の「Which package」は見えた場所なので、行で確かめ直します（4 節の #48542）。
2. **メンバーと担当者のコメントだけを拾う**

   `gh issue view N -R angular/angular --json comments -q '.comments[] | select(.authorAssociation=="MEMBER")'`。#69979 の「次の破壊的変更の時期に」、#70488 の「アプリの中でロケールがばらばらなのは良くない」のように、方針は 1 つのコメントに書かれていることが多いです。PR の側の担当者のコメントは `gh pr view N --json comments` で読みます（#70509 の 3 つの理由）。
3. **付いた PR と、その閉じ方を見る**

   2 節の GraphQL で、issue に付いた PR を並べます。#59495 には閉じた PR が 4 つと開いた PR が 1 つ、#69636 には閉じた 1 つと開いた 1 つ。閉じた PR のレビューに、どんな直し方が受け入れられないかが書いてあります。
4. **spec の形で手元で再現する**

   ターゲットは下のとおりです。ブラウザでしか中身が走らない describe（`isNode`・`isBrowser` で止めるもの）は、`test_web_chromium` で走らせます。web test runner には `--filter` を渡さず全部走らせ、落ちた it の名前を見ます。このマシン（JST）では、Chromium で日付の it が 2 件落ちます（ブラウザが端末の時刻帯で日付を作るため。Node のターゲットでは通る）。自分の変更と関係の無い失敗を先に知っておきます。

   📄 `bazel のターゲット（../angular で。2026-11-05）`

   ```
   # このシリーズで使ったターゲット（../angular で。--nocache_test_results）
   //packages/common/test:test                 Node。packages/common/test/ の spec 全部（667 件）
   //packages/common/test:test_web_chromium    Chromium。isNode / isBrowser で止める spec の中身も走る（678 件）
   //packages/core/test:test                   core の change_detection/differs など
   //packages/core/test/acceptance:acceptance  pipe_spec・pure_function_spec など
   //packages/router/test:test                 router_scroller.spec・trailing_slash_integration.spec

   # 絞り方（正規表現。0 件でも PASSED になるので Ran N of M を見る）
   --test_arg=--filter='Location Class'
   ```
5. **直った issue は commit からたどる**

   `git log --all -E --grep='#番号([^0-9]|$)'` と `git show --stat`。#49335 を閉じた PR #70532 の commit は、main では 2cecc4aa608、22.2.x では ad2f291ba06 と、ブランチごとに別の hash です（patch の版へは cherry-pick で入る）。`git branch -a --contains <hash>` でどこに入ったかを見ます。

## 聞かれそうな質問

**Q. common でいちばん issue が多い場所はどこですか？**

NgOptimizedImage です。開いている 25 件のうち 11 件が `common: image directive` で、2026 年の修正の commit も画像のものが一番多い（3 節の表の 5 行）です。

**Q. open for contributions のラベルが付いた issue はありますか？**

開いているものでは #59495（assertNoComplexSizes を外す）と #48279（IANA のタイムゾーン）の 2 件です。#59495 には PR が 5 つ付き、4 つが閉じ、1 つ（#71694）が開いています。ラベルがあっても、直し方の議論は PR の上で続きます。

**Q. PR が無い古い issue は、直してもいいということですか？**

そうとは限りません。#55383 の PR #70509 は、直し方より前に「ViewportScroller に推測を足さない」という方針で閉じられました（4 節）。#20167 のように方針の 2 案が出たまま止まっているものもあります。メンバーのコメントを先に読みます。

**Q. 修正の commit に spec が無いことはありますか？**

あります。2026 年の表では 1ec125276d8（formatDateTime のプロトタイプ汚染）と c1312da1832（sizes="auto" の取り直し）が src だけです（3 節）。spec が無い所は、手元で振る舞いを確かめるときに自分で書くことになります。

**Q. 手元のソースで読んだ行は、今の main と同じですか？**

手元は 2026-09-09 の 8576f161ae4 で、main は 807 commit 先です。common の src（http を除く）の fix・feat は、その間に 2cecc4aa608 の 1 つだけでした（0 節）。ほかの場所は `gh api …?ref=main` で比べてから「同じ」と書きます。

## 読み終えて

- 4 つのラベルで、開いている issue は 25 件、2025-11 以降に閉じたものは 27 件。開いているものの半分近くは NgOptimizedImage の機能の要望。
- 2026 年の common の修正は、日付・数の書式の上限とプロトタイプ、画像のローダーと LCP、Location と ViewportScroller の 1〜数行の直し。書いた人の多くは外の常連の人。
- issue の「どの package」は見えた場所。直す行は、各章の行で確かめ直す。ブラウザだけで走る spec は Chromium のターゲットで。
- 閉じた PR のレビューと担当者のコメントに、受け入れられない直し方と方針が書いてある。PR を考える前にそこを読む。

---

← 前: [ViewportScroller：位置とアンカーへのスクロール](19-cmn-viewport-scroller.md)  
次: [ngtsc の全体像：tsc の横で動くもう 1 つのコンパイラ](../ngtsc/01-ngtsc-overview.md) →
