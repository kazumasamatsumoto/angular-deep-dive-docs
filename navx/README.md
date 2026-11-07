[目次](../README.md)

# Navigation API と FakeNavigation

> Navigation API の型と PlatformNavigation・FakeNavigation の navigate・戻る進む・precommitHandler・Router の連携の残り・テストでの使い方・spec と issue

ブラウザの Navigation API（window.navigation）は、history.pushState と popstate の代わりに、すべての遷移を navigate イベント 1 つで受け取り、intercept で SPA の遷移に変えられる新しい API です。Router がこれを使う道（withExperimentalPlatformNavigation）は、Router のシリーズの 1 章で読みました。このシリーズでは、その下にある部品を読みます。Angular は Navigation API の型を自分で持ち（primitives/dom-navigation）、テストのために、仕様（WHATWG HTML）の手順を 1338 行で写した FakeNavigation を持っています。FakeNavigation は v21 から TestBed の既定の土台です。各章は、その行を変えた最近の修正のコミットを git show で読みます。デモは、本物の FakeNavigation をこのページの上で動かします。

全 7 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/navx)

1. [Navigation API の型と PlatformNavigation：Angular が型を自分で持つ理由](01-navx-api-types.md)  
   Navigation API の navigate・traverseTo・currentEntry・entries・navigate イベントと intercept の約束を、primitives/dom-navigation の navigation\_types.ts の行で読む。TypeScript の lib の型と揃えた変更（d79b3b65e95）、@angular/common の PlatformNavigation と、ブラウザの window.navigation を返す provider、precommitHandler を使えるかを示すトークン（dd58c4b667b）。
2. [FakeNavigation の navigate：navigate イベントを配り、intercept して commit するまで](02-navx-fake-navigate.md)  
   FakeNavigation.navigate が InternalNavigateOptions を作り、dispatchNavigateEvent が NavigateEvent を作って配り、intercept の handler を集め、commit で URL と履歴を更新し、handler の Promise を待って navigatesuccess か navigateerror を出すまで。abortOngoingNavigation、committed と finished の 2 つの Promise、フォーカスとスクロールの扱い。仕様の手順の名前との対応。
3. [FakeNavigation の戻る・進む：traverseTo と、取り消された traverse](03-navx-fake-traverse.md)  
   traverseTo・back・forward・go が entries の中の位置を動かす行、synchronousTraversals、updateNavigationEntriesForSameDocumentNavigation が push・replace・traverse で entries を書き換える行、popstate と hashchange と currententrychange の順。取り消された traverse の修正（86dc1283e8c）と、仕様の更新に合わせた変更（d3552051988・5988bdedaeb、新しい本家の a8233232f5a）。
4. [precommitHandler：URL の確定を遅らせ、途中でリダイレクトする](04-navx-precommit.md)  
   intercept の precommitHandler が commit の前に走り、controller.redirect で行き先を変える行（FakeNavigation の側）と、Router がそれを使う行（navigation\_state\_manager.ts の残り）。precommitHandler の対応（522fa716b84）と取り消し（97fd1de0ac9）とやり直し（da364d26357）、元の navigate イベントをリダイレクトのあとも持つ変更（e8c44a00f9a）、traverse の commit を遅らせる変更（778b7486942）。
5. [Router の連携の残り：reload・URL の比較・push と replace の時機](05-navx-router-integration.md)  
   navigation\_state\_manager.ts で、Router の章が通り過ぎた行。reload を intercept しない修正（dbd50be7f71）、ネイティブの URL で比べる修正（fe721868a6e）、push と replace の時機の調整（37598cf6fe8）、新しい本家のダウンロードを intercept しない修正（e09bbed21a7）や traverse 中のリダイレクトの修正（3320da96da2）。開いている #71596（巻き戻しで再読み込みになる）を行から読む。
6. [テストの土台：FakeNavigationPlatformLocation と provideFakePlatformNavigation](06-navx-testing.md)  
   TestBed の既定の PlatformLocation が FakeNavigation の上に立つ FakeNavigationPlatformLocation になっている行、provideFakePlatformNavigation、Location と Navigation をつなぐ NavigationAdapterForLocation の残り。router の with\_platform\_navigation.spec.ts と common の navigation\_spec.ts が、FakeNavigation をどう使って振る舞いを試しているか。
7. [spec と issue を読む：Navigation API の連携の今](07-navx-tests-issues.md)  
   primitives/dom-navigation/testing の spec、router と common の spec の分け方と手元での走らせ方。Navigation API に関係する issue（開いている #71596 ほか）と閉じた issue の表、どの issue がこのシリーズのどの章の行に関係するか。実験的な機能が、取り消しとやり直しを重ねて固まっていく様子。
