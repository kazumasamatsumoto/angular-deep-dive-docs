[目次](../README.md) › [Service Worker の内側](README.md) › 第 20 回 / 全 20 回

# issue と PR を読む：Service Worker の今

> service-worker は security の直ししか受け付けない、という方針（PACKAGE.md と、その後の README）を先に確かめ、area: service-worker のラベルで開いている issue と 2025-11 以降に閉じた issue を表にする。更新の確認が効かない、VERSION\_READY が余分に出る、プッシュの購読が出てこない、先読みの失敗から戻れない、applicationMaxAge の数え方など。どの issue がこのシリーズのどの章の行に関係するか、このシリーズで見つけた不具合らしきもの。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sw-issues)

---

最終回は、Service Worker の「今」を issue と PR から読みます。ラベル `area: service-worker` で開いている 6 件と、2025-11-01 以降に閉じた 15 件に、ラベルの無いものを題と本文の言葉で探して足し、合わせて開いている 7 件・閉じた 19 件を表にします（取った日は 2026-11-03）。その前に、このパッケージの**受け付けの方針**を確かめます。表の多くの issue が「直されずに閉じた」「開いたまま誰も PR を出していない」理由は、ほとんどこの方針で説明できるからです。

読む対象は GitHub の angular/angular の issue と PR（`gh` で読むだけ）と `git -C ../angular log` です。この章にはソースの引用はありません。行は各章で引用したものを指します。

1. [1. 全体像](01-sw-overview.md)
2. [2. Generator](02-sw-config-generator.md)
3. [3. ビルド](03-sw-cli-build.md)
4. [4. 登録](04-sw-register.md)
5. [5. Driver の起動](05-sw-driver-lifecycle.md)
6. [6. fetch の横取り](06-sw-driver-fetch.md)
7. [7. 版とタブ](07-sw-versions.md)
8. [8. アセット](08-sw-asset-groups.md)
9. [9. ハッシュ](09-sw-hash-integrity.md)
10. [10. データ](10-sw-data-groups.md)
11. [11. 小さな DB](11-sw-database.md)
12. [12. 更新の確認](12-sw-update-check.md)
13. [13. SwUpdate](13-sw-swupdate.md)
14. [14. アイドルと掃除](14-sw-idle-cleanup.md)
15. [15. 壊れたとき](15-sw-safe-mode.md)
16. [16. プッシュ](16-sw-push.md)
17. [17. デバッグ](17-sw-debug.md)
18. [18. ワーカーのテスト](18-sw-testing-harness.md)
19. [19. アプリ側のテスト](19-sw-testing-app.md)
20. **20. issue と PR を読む**（この章）

## 0. 先に読む：このパッケージは security の直ししか受け付けない

📄 `出典（2026-11-03 に確かめた）`

```
# ../angular（8576f161ae4、2026-09-06）の packages/service-worker/PACKAGE.md の 1 行目（第 1 回に引用）
IMPORTANT: The Angular Service Worker is a basic caching utility for simple offline support with a limited featureset.
We will not be accepting any new features other than security fixes. ...

# git -C ../angular show --stat 3ace772da9c（2026-09-24、22.2.x。スナップショットより後）
docs(service-worker): clarify maintenance mode note
The note said only new features are not accepted, but bug fix PRs are
closed too, since only security fixes are accepted. Say so in the note
and add a README with it, like `@angular/upgrade`.
 packages/service-worker/PACKAGE.md | 2 +-
 packages/service-worker/README.md  | 6 ++++++

# gh api 'repos/angular/angular/contents/packages/service-worker/README.md?ref=main'
IMPORTANT: ... We will not be accepting any new features or bug fixes other than security fixes. ...

# gh pr view 67918 -R angular/angular --comments（fix(service-worker): bypass CSP violation reports）
thePunderWoman 2026-04-10: Thanks, but the service worker package is not accepting any contributions
other than security vulnerabilities. https://github.com/angular/angular/blob/main/packages/service-worker/PACKAGE.md
```

1. **スナップショットの PACKAGE.md の 1 行目**

   「Angular Service Worker は、簡単なオフラインの対応のための機能の限られた基本的なキャッシュの道具で、security の直し以外の新しい機能は受け付けない」。行そのものは[第 1 回](01-sw-overview.md)で引用しています。adev の Service Worker の overview の 3 行目にも同じ文があり、どちらも 2025-08-25 の #63364（1e3196b0c9c）で入りました。
2. **スナップショットのあと：不具合の直しも受け付けない、と書き直した**

   2026-09-24 の 3ace772da9c（22.2.x の枝。main は dec97556466）は、「新しい機能だけでなく不具合の直しの PR も閉じている。security の直しだけを受け付けるので、そう書く」として PACKAGE.md を直し、README.md を足しました。main の README.md は「security の直し以外の新しい機能も不具合の直しも受け付けない」です。
3. **実際の PR の閉じられ方**

   CSP の報告を通す #67918 は、CLA も CI も通ったあと、thePunderWoman が「security の脆弱性以外の貢献は受け付けていない」と PACKAGE.md へのリンクを付けて 2026-04-10 に閉じました（`gh pr view 67918 --comments`）。Quota exceeded のときにネットワークへ戻る #71169 は、出した日に JeanMeche が「すでに言ったとおり、このパッケージは security の直ししか受けない」として閉じています。動画のシークの #60029 は「#63364 で maintenance mode を告げた」として 2025-08-27 に閉じられました。
4. **それでもマージされたもの**

   `git log --since=2025-09-06 -- packages/service-worker` の fix は、`redirect` の方針を保つ（07abfbcc6c5、#67494）、`credentials: 'omit'` を保つ（5b0e9663e5c）、HTTP のキャッシュのモードを保つ（31399c21710）、外のオリジンへのリダイレクトで機微なヘッダーを外す（47d68dcb262）、referrer と referrer policy を保つ（716f9eb032b・6f98f98f1f4）と、TypeScript 6.0 との互換（836094c072c）です。どれも「ワーカーが作り直したアセットのリクエストが、元のリクエストの安全のための設定を落とす」という security に関わる直しで、方針と合っています。ほかに、ブラウザが固まる回帰（#63500）は原因の feat の commit を revert して直しています（2 節）。

> [!WARNING]
> **ハマりどころ**
>
> このシリーズの読者の目標はコミッターになることですが、**service-worker は最初の PR を出す場所として向いていません**。不具合を見つけても、security に関わらなければ PR は閉じられます。このパッケージでは、仕組みを読んで issue に正確に答えられること、手元で spec を書いて確かめられることを目標にし、PR の練習は[contrib-first-pr](../contrib/15-contrib-first-pr.md)のような別の場所でします。

## 1. データの取り方

📄 `ターミナル（読むだけ）`

```
# ラベル area: service-worker の issue（開いている / 2025-11-01 以降に閉じた）
gh issue list -R angular/angular --label 'area: service-worker' --state open \
  --limit 100 --json number,title,createdAt,comments,labels
gh issue list -R angular/angular --label 'area: service-worker' --state closed \
  --search 'closed:>=2025-11-01' --limit 100 --json number,title,closedAt,stateReason,labels
# ラベルの無いものを、題と本文の言葉で広げる（service worker・service-worker・serviceworker・ngsw・SwUpdate・SwPush・pwa）
gh search issues --repo angular/angular "ngsw in:title" --state open --limit 100 \
  --json number,title,createdAt,labels,commentsCount
gh search issues --repo angular/angular "ngsw in:title" --state closed \
  --closed '>=2025-11-01' --limit 100 --json number,title,createdAt,closedAt,labels,commentsCount
gh search issues --repo angular/angular "ngsw-worker" --state open --limit 100 --json number,title,labels
# 1 つの issue のメンバーのコメントと、番号を書いた PR（timeline の cross-referenced）
gh issue view 44402 -R angular/angular --json comments \
  -q '.comments[] | select(.authorAssociation=="MEMBER") | .body'
gh api 'repos/angular/angular/issues/36086/timeline?per_page=100' \
  -q '.[] | select(.event=="cross-referenced") | .source.issue | "\(.repository.full_name) #\(.number) \(.state)"'
gh pr view 67918 -R angular/angular --comments
```

- 取った日は 2026-11-03。ソースは ../angular の 8576f161ae4（2026-09-06、22.2.0-next.7）です。それより後の commit（3ace772da9c など）はスナップショットに入っていません。
- ラベルで取れたのは開いている 6 件と閉じた 15 件です。題の検索（service worker・service-worker・serviceworker・ngsw・SwUpdate・SwPush・pwa）で、閉じた #66798・#66722・#66500・#65134 を足しました。#65129（文書のリンク切れ、area: docs）は入れていません。開いているものは、題の検索ではラベル付きのものしか出ませんでした。
- 本文の検索（ngsw-worker・service worker など）で、開いている #70103（area: router）を足しました。#53650（area: common/http）は本文に `ngsw-bypass` のヘッダーを書いているだけで、原因は `withFetch()` がアップロードの進み具合を出せないことなので外しました。
- PR は issue の timeline の `cross-referenced` のうち angular/angular のものだけを書きました。fork の PR（OpenSlides/openslides-client #2808 など）は外しています。コメントの数は bot の投稿を含みます。

## 2. 一覧

> **🧪 issue を絞る**
>
> 2026-11-03 に gh で取ったデータを、このページの中に持っています（通信はしない）。「章」の列は、その issue を読むときに開いておくとよい章です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sw-issues)

- 開いている 6 件（ラベルあり）のうち 5 件は 2021〜2024 年に立ったもので、メンバーのコメントがあるのは #44402（gkalpak、2022 年）だけで、どれにも angular/angular の PR は付いていません。#55975・#54036・#48702・#45377 には、2026-09-29 に arturovt が「maintenance mode で security の直ししか受けないので閉じてよい」と書いています。
- 閉じた 15 件（ラベルあり）のうち NOT\_PLANNED は 12 件で、#47567・#47455・#38690・#37133・#25865 は、2026-09-29 に JeanMeche が README の方針（0 節）へのリンクを書いて同じ日にまとめて閉じたものです。#36086 も 2026-10-23 に「package は maintenance mode」として閉じています。
- COMPLETED は 3 件で、#63500 は revert、#58406 は文書の PR（#70763）、#59074 は番号を書いた PR #64530 が未マージのまま閉じられていて、直した commit は見つけていません。

## 3. 開いている issue を読む

1. **#44402・#55975 checkForUpdate が効かない**

   #44402 で gkalpak（MEMBER）は「強制リロードのあとのページは、ブラウザはワーカーに対応していて（`SwUpdate#isEnabled` は true）、active な登録もあるが、`navigator.serviceWorker.controller` が null のまま。その状態と、ワーカーをちょうど入れている途中の状態を確実に見分ける方法を知らない」と書いています。`NgswCommChannel` が controller を待ってから postMessage する作りは[第 13 回](13-sw-swupdate.md)、アプリの側の spec で controller の有無を作るのは `MockServiceWorkerContainer.setupSw`（[第 19 回](19-sw-testing-app.md)の 3 節）です。#55975 は「最初の読み込みで checkForUpdate が何もしない」で、登録の戦略（`registerWhenStable`）と組み合わせた報告です（[第 4 回](04-sw-register.md)）。
2. **#54036 freshness で VERSION\_READY が余分に出る**

   `navigationRequestStrategy: 'freshness'` だと、ナビゲーションで最新の index.html が返るのに、開き直したタブに VERSION\_DETECTED と VERSION\_READY が届く、という報告です。タブへの版の割り当ては[第 7 回](07-sw-versions.md)、知らせを送る行は[第 12 回](12-sw-update-check.md)です。
3. **#48702 強制リロードのあと SwPush が値を出さない**

   #44402 と同じ「controller が null」の形で、`SwPush.subscription` と `requestSubscription` が待ったままになる報告です（[第 16 回](16-sw-push.md)）。
4. **#45377 先読みの途中でオフラインになると戻れない**

   先読みの失敗が版をどう扱わせるかは[第 9 回](09-sw-hash-integrity.md)、状態を下げる行は[第 15 回](15-sw-safe-mode.md)です。デバッグのページの Driver state の行（[第 17 回](17-sw-debug.md)）を報告に付けると、どの段で止まったかが読めます。
5. **#71720 applicationMaxAge の数え方（docs）**

   ただ 1 件の 2026 年の issue で、文書の直しの PR が 2 つ付いています。#71721 は `action: merge` のラベルまで付いたあと 2026-10-31 に閉じられ、同じ題の #71759 が同じ日に出し直されて開いています。`handleFetch` の `isVersionWithinMaxAge` の行は[第 14 回](14-sw-idle-cleanup.md)です。
6. **#70103 遅延チャンクの版のずれ（area: router）**

   本文で、ワーカーがあれば多くの失敗は起きないが「ngsw.json で lazy にしたチャンクは、一度も取っていなければキャッシュに無く 404 になりうる」と書いています。lazy のアセットグループの扱いは[第 8 回](08-sw-asset-groups.md)です。

## 4. 閉じたもの

### #63500 v20.2.0 でブラウザが固まる → revert（#65087、4af408afcb6）

コメント 30 件の調査のあと、atscott が「20.2.0-next.2 では動き、next.3 で壊れる」「6d011687ec1 が原因らしい。main で再現し、revert すると直る」と書き、同じ 2025-11-11 に revert の PR #65087 がマージされました。6d011687ec1 は SkyZeroZx の「feat(service-worker): notify clients about version failures (#62718)」（2025-07-19）で、`driver.ts`・`low_level.ts`・`update.ts` と goldens と spec を変えていました（`git show --stat`）。機能を足す commit が回帰を起こし、revert で戻った例です。

### #68620・#68823 redirect: 'error' を守らない → #67494

Yenya030 の報告で、josephperrott（MEMBER）は「#67494 で直っているので閉じた」と答えています。#67494 は報告者自身の PR で、2026-03-18 にマージされ、commit は 07abfbcc6c5（作り直したアセットのリクエストで redirect の方針を保つ）と 57a07d00584（偽物のサーバーのリダイレクトの検査の型の直し）です。57a07d00584 は第 18 回の `MockServerState.fetch` のリダイレクトの行に当たります。#68823 は同じ報告の出し直しで、JeanMeche が「#68620 で答えた」として閉じました。

### #36086 Quota exceeded → PR は 2 つとも未マージで閉じた

gkalpak は 2020 年に「`Driver#sync()`（というより `CacheTable#write()` の呼び出しの全部）で Quota exceeded を正しく扱う必要がある」と書き、PR #36194 は 2021 年に閉じられました。2026-10-04 の #71169 は出した日に閉じられ、issue も 2026-10-23 に「maintenance mode」として閉じています。`CacheTable` は[第 11 回](11-sw-database.md)です。

### #58406 ヘッダーだけの変更でワーカーが更新されない → 文書（#70763）

直したのはコードではなく文書で、d6b8d99a64b「explain how to update the worker when only its headers change」（2026-09-16）です。ブラウザがワーカーのスクリプトを取り直す話は、登録の側（[第 4 回](04-sw-register.md)）です。

## 5. このシリーズで見つけた「不具合らしきもの」

第 17・18 回で、本物の配布物（サイトの node\_modules の `@angular/service-worker` 22.1.6）をデモの偽物の上で、TypeScript のソースを SwTestHarness の上で走らせて確かめました。../angular のファイルは変えていません。どれも `gh search issues` で同じ報告は見つかりませんでした（2026-11-03。「dataGroups offline」「safeFetch」など）。**本家に issue や PR を出すことは勧めません**（0 節のとおり、security に関わらない直しは受け付けられません）。issue を読むときの手がかりにします。

📄 `出力（scratchpad/sw-logs/e-harness-scratch.log）`

```
# scratchpad/sw-e-work/harness-datagroup.ts（SwTestHarness。../angular は読むだけ）
# asset の /index.html、performance のデータグループ ^/api/.*$。初期化のあと server.online = false
/index.html -> 200 OK                     ← アセットのキャッシュ
/other.txt -> 504 Gateway Timeout         ← Driver.safeFetch（return await）
/api/b -> rejected: Error: Offline.       ← DataGroup.safeFetch（await の無い return）
Debug log:
[] Error(Offline., Error: Offline. ...)   ← /other.txt の 1 行だけ。/api/b は残らない
```

| 場所 | 形 | 結果 | 章 |
| --- | --- | --- | --- |
| data.ts の `DataGroup.safeFetch` | データグループの URL を、オフラインで、キャッシュにも無いときに取る | `try` の中が `return this.scope.fetch(req)`（`await` が無い）なので、拒否が `catch` を通らず、504 にも log にもならずにページまでネットワークエラーとして届く。`Driver.safeFetch` は `return await` で 504 と log の 1 行。main の data.ts も同じ（`gh api …?ref=main` で確かめた） | [第 17 回](17-sw-debug.md)の 4 節・[第 10 回](10-sw-data-groups.md) |
| debug.ts の `since()` | 差がちょうど 0 ミリ秒 | 空の文字列になり、`Last update check:` の後ろや log の `[]` が空になる | [第 17 回](17-sw-debug.md)の 2 節 |
| worker/testing/fetch.ts の `MockRequest.clone` | POST の Request を `scope.fetch` に渡す | method と destination を写さないので、サーバーには GET として届く（テストの道具の限界。製品の動きではない） | [第 18 回](18-sw-testing-harness.md)の 8 節 |
| worker/testing/scope.ts の `ConfigBuilder`・`AssetGroupBuilder` | — | どこからも使われていない。`toManifestGroup()` は `null!` を返すだけ | 第 18 回のテストと直し方 |

> [!NOTE]
> **ポイント**
>
> デモの偽物（sw-sandbox）では、上の 1 つ目の形で `world.fetch` が `error` を入れて返さずに例外を投げます。これは sandbox の `dispatch` が async 関数で、返した Promise が平らにされるためで、本物のワーカーの話ではありません。SwTestHarness でも同じ拒否になり、data.ts の行で説明できることを確かめてから、1 つ目を「不具合らしきもの」に入れました。

## 6. 誰が直しているか（スナップショットまでの 1 年）

`git log --since=2025-09-06 -- packages/service-worker` は 25 件で、題の種類は fix 8・refactor 7・build 4・feat 2・docs 2・Revert 2 でした（feat の 2 件は compiler-cli と core の TypeScript と Node の対応で、service-worker の機能ではありません）。書いた人は SkyZeroZx 7、Alan Agius 5、Matthieu Riegler 4、Kristiyan Kostadinov 3、Yenya030 2 の順です。service-worker の fix のうち 5 件は SkyZeroZx の「アセットのリクエストが元の設定を落とさない」一続きの直し（2026-05〜06）で、0 節の security の方針の範囲です。

## 7. issue を読む手順

1. **方針を先に当てる**

   新しい機能か、security に関わらない不具合なら、閉じられるか止まったままになる見込みが高い、と知ったうえで読みます（0 節）。
2. **メンバーのコメントだけを拾う**

   `gh issue view N --json comments -q '.comments[] | select(.authorAssociation=="MEMBER")'`。#44402 の「controller が null のまま」のように、原因の見立ては 1 つのコメントに書かれていることが多いです。
3. **/ngsw/state を読む**

   報告にデバッグのページが付いていれば、Driver state と版とタブの割り当てから、どの段の話かが分かります（[第 17 回](17-sw-debug.md)）。
4. **手元で spec の形にする**

   ワーカーの話は SwTestHarness（[第 18 回](18-sw-testing-harness.md)）、アプリの側の話は comm\_spec・provider\_spec の形（[第 19 回](19-sw-testing-app.md)）。provider の話はブラウザのターゲットで走らせます。
5. **直った issue は commit からたどる**

   `git log -E --grep='#番号([^0-9]|$)'` と、PR の「merged into the following branches」のコメントで commit を探し、`git show --stat` で変えたファイルと spec を見ます。#67494 は 2 つの commit でした。

## テストと直し方（シリーズのまとめ）

service-worker のテストのターゲットと、手元で走らせた本数と秒数は[第 19 回](19-sw-testing-app.md)の 6 節の表にまとめました。SW-COMMON の基準の実行（2026-11-03、初回のビルド込み）では、`//packages/service-worker/...` の 18 ターゲットがすべて PASSED でした。issue と章の行と spec を並べるときの入口は次のとおりです。

| issue | 見る所 | 確かめるならこの spec |
| --- | --- | --- |
| #44402・#55975・#48702 | low\_level.ts の controller の待ち方（第 13 回） | comm\_spec.ts の `NgswCommsChannel`・`SwUpdate`・`SwPush`（`:test`） |
| #54036 | driver.ts の版の割り当てと知らせ（第 7・12 回） | happy\_spec.ts の `Driver` の `navigationRequestStrategy` |
| #45377 | assets.ts の先読みと versionFailed（第 9・15 回） | happy\_spec.ts の `bugs`、prefetch\_spec.ts |
| #71720 | driver.ts の isVersionWithinMaxAge（第 14 回） | happy\_spec.ts の `applicationMaxAge` |
| 5 節の 1 つ目 | data.ts の DataGroup.safeFetch（第 10・17 回） | data\_spec.ts の `data cache`（`server.online = false`） |

このパッケージでは、新しい機能の PR は受け付けられず、不具合の直しも security に関わらなければ閉じられます（0 節）。issue を読むときは、関係する章の行と spec で「今の振る舞い」を自分の目で確かめる、までにします。

## 聞かれそうな質問

**Q. Service Worker の不具合を見つけました。PR を出せば直りますか？**

security に関わらなければ、閉じられる見込みが高いです。PACKAGE.md の 1 行目（第 1 回）と、スナップショットの後の 3ace772da9c の「不具合の直しの PR も閉じている」、#67918・#71169 の閉じられ方（0 節）のとおりです。

**Q. 開いている issue が少ないのはなぜですか？**

古い issue の多くが、2026-09-29 などにまとめて NOT\_PLANNED で閉じられたからです（2 節）。開いている 4 件にも、閉じてよいというコメントが付いています。

**Q. 強制リロードのあと SwUpdate も SwPush も動きません。**

#44402 で gkalpak が書いたとおり、強制リロードしたページは登録が active でも controller が null のままで、`NgswCommChannel` が待ち続けます。ふつうに再読み込みすれば、ワーカーがそのページを受け持ちます（#48702 も同じ形）。

**Q. 新しい版で急にブラウザが固まったら、どう調べますか？**

#63500 で atscott がしたように、プレリリースの版を順に試して壊れ始めた版を見つけ、その間の commit を revert して確かめます。原因は機能を足した 6d011687ec1 で、revert（4af408afcb6）で直りました。

## 読み終えて

- service-worker は security の直ししか受け付けない。スナップショットの後には「不具合の直しも」と書き直された。
- 開いている issue は 6 件（ほかに関係するもの 1 件）。古い issue の多くは 2026 年に方針を理由に閉じられた。
- マージされた直しは、作り直したリクエストが安全のための設定を落とさない、という security の一続きと、回帰の revert。
- このシリーズで見つけたデータグループのオフラインの拒否は、ハーネスとソースの行で確かめた。PR にはせず、issue を読む手がかりにする。

---

← 前: [アプリ側のテストとテストの走らせ方](19-sw-testing-app.md)  
次: [DOM レンダラーの全体像：命令・Renderer2・DomRendererFactory2・EventManager](../domr/01-domr-overview.md) →
