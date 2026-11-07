[目次](../README.md)

# Service Worker の内側

> ngsw.json・ngsw-worker.js の Driver・アセットとデータのキャッシュ・更新の確認・SwUpdate・SwPush

ng add @angular/pwa をして ng build すると、出力に ngsw-worker.js と ngsw.json が入り、アプリはオフラインでも開けるようになります。ngsw.json は ngsw-config.json から Generator が作る「この版のファイルとハッシュの一覧」で、ngsw-worker.js の中の Driver はそれを読んでファイルを先に取り込み、ページからの fetch を横取りしてキャッシュから返します。新しい版が出ると、開いているタブは古い版のまま動き続け、SwUpdate で知らせを受けて切り替えます。このシリーズは、ngsw.json ができるまでから始めて、ワーカーの登録、Driver の起動と fetch の横取り、版とタブの割り当て、アセットグループとデータグループ、キャッシュの中の小さな DB、更新の確認、SwUpdate とメッセージ、アイドルの掃除、壊れたときの状態、プッシュ通知、デバッグのページ、テストの仕組みを 1 つずつ読みます。ページの上のデモは、このサイトに入っている本物の @angular/service-worker の Generator と ngsw-worker.js を、偽物のブラウザ（メモリの上のキャッシュとサーバー、仮想の時計）の中で動かします。各章の最後に、その仕組みの spec と手元での走らせ方を置きます。最終回は、開いている issue を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/sw)

1. [Service Worker の全体像：ngsw.json・ngsw-worker.js・SwUpdate](01-sw-overview.md)  
   packages/service-worker の分担（config/ は ngsw.json を作る Generator、cli/ は ngsw-config のコマンド、worker/ はブラウザの中で動く Driver、src/ はアプリの側の provideServiceWorker・SwUpdate・SwPush、testing/ と worker/testing/ はテストの偽物）。ビルドで ngsw.json ができ、ページがワーカーを登録し、ワーカーがファイルを取り込んで fetch を横取りし、新しい版を知らせるまでの流れ。
2. [ngsw-config.json から ngsw.json へ：Generator](02-sw-config-generator.md)  
   Generator.process が assetGroups の glob をファイルの一覧に当てて urls と patterns に分け、hashTable にファイルごとの SHA-1 を入れ、dataGroups の maxAge や timeout を ms に直し（duration.ts）、navigationUrls の既定（ファイル名に . や \_\_ を含むものを除く）を正規表現にする流れ。glob.ts の globToRegex と、configVersion・timestamp・appData。ページの上で本物の Generator を動かすデモ。
3. [ビルドで ngsw.json を作る：CLI と ngsw-config](03-sw-cli-build.md)  
   ng build の serviceWorker の設定で、angular-cli の augmentAppWithServiceWorker が出力のファイルを Generator に渡し、ngsw.json を書き、ngsw-worker.js と safety-worker.js を出力にコピーする行（angular-cli の utils/service-worker.ts）。単独で走らせる ngsw-config のコマンド（cli/main.ts・filesystem.ts）、ng add @angular/pwa と service-worker の schematic が足すもの。
4. [ワーカーの登録：provideServiceWorker と登録の戦略](04-sw-register.md)  
   provideServiceWorker と ServiceWorkerModule.register が、アプリの初期化のあとに navigator.serviceWorker.register を呼ぶまで（provider.ts の ngswAppInitializer）。registrationStrategy の registerWhenStable:30000（既定）・registerImmediately・registerWithDelay・Observable、enabled: false や対応しないブラウザのときの NgswCommChannel、SwRegistrationOptions。
5. [Driver の起動：install・activate・初期化](05-sw-driver-lifecycle.md)  
   ngsw-worker.js の入口（worker/main.ts）が Adapter と CacheDatabase を作って Driver に渡し、Driver が install で skipWaiting、activate で clients.claim と初期化の合図を送る流れ。ensureInitialized と initialize（DB から版の一覧と割り当てを読む、無ければ ngsw.json を取ってくる）、DriverReadyState（NORMAL・EXISTING\_CLIENTS\_ONLY・SAFE\_MODE）。
6. [fetch を横取りする：Driver.onFetch と handleFetch](06-sw-driver-fetch.md)  
   onFetch が横取りしないもの（ngsw-bypass の印、SAFE\_MODE、https から http の混在コンテンツ、only-if-cached と same-origin 以外の mode）と、その前に無条件に答える /ngsw/state、横取りするときに respondWith で handleFetch を渡す行。onFetch はスコープ（オリジン）も method も見ないこと。初期化を待つ、タブに版を割り当てる、版に聞いて無ければネットワークへ、ネットワークも駄目なら safeFetch が 504 を作る戻り方。
7. [版とタブ：AppVersion とクライアントの割り当て](07-sw-versions.md)  
   ngsw.json 1 つが 1 つの AppVersion（ハッシュで呼ぶ）になり、Driver の clientVersionMap がタブごとに使う版を覚える仕組み。ナビゲーション（新しいタブや再読み込み）は最新の版、開いているタブは今の版のまま。AppVersion.handleFetch がグループを順に聞き、ナビゲーションを index.html に向ける行（isNavigationRequest・navigationUrls・navigationRequestStrategy）。
8. [アセットグループ：prefetch と lazy](08-sw-asset-groups.md)  
   assets.ts の AssetGroup・PrefetchAssetGroup・LazyAssetGroup。installMode（版を入れるときに全部取るか、要るときに取るか）と updateMode（読むのは LazyAssetGroup だけ）、fetchAndCacheOnce が同じ URL を 1 回だけ取る仕組み、前の版のキャッシュからハッシュが同じファイルを写す maybeUpdate、ハッシュの無い patterns の扱い（needToRevalidate と previouslyCachedResources）。
9. [ハッシュを確かめる：壊れたファイルと回復できない状態](09-sw-hash-integrity.md)  
   取ってきたファイルの SHA-1 を ngsw.json の hashTable と比べ（sha1.ts）、違えば cache-bust を付けてもう一度取り、それでも違えば版を壊れたものとして扱う流れ。キャッシュから消えたファイルをもう取れないときの SwUnrecoverableStateError と、アプリ側の SwUpdate.unrecoverable。issue #45377。
10. [データグループ：performance と freshness](10-sw-data-groups.md)  
   data.ts の DataGroup が API の応答をキャッシュする 2 つの戦略（performance はキャッシュを先に、freshness はネットワークを先に timeout まで待つ）、maxAge と maxSize（LruList で古いものから消す）、refreshAhead、cacheOpaqueResponses、version が変わったときにキャッシュを捨てる行。ページの上で本物のワーカーと仮想の時計で maxAge を過ぎさせるデモ。
11. [キャッシュの中の小さな DB：CacheDatabase と名前の付け方](11-sw-database.md)  
   ワーカーが状態（版の一覧・タブの割り当て・最新のハッシュ・LRU の表・取ってきた時刻）を Cache Storage の中に JSON で置く CacheDatabase と CacheTable（db-cache.ts・database.ts）、キャッシュの名前 ngsw:/:db:control などの付け方と、スコープごとに名前を分ける NamedCacheStorage・Adapter（adapter.ts）。
12. [更新の確認：ngsw.json を取り直す](12-sw-update-check.md)  
   checkForUpdate が ngsw.json を cache-bust 付きで取り、ハッシュが違えば新しい AppVersion を作って全部のファイルを取り込み、VERSION\_DETECTED・VERSION\_READY・VERSION\_INSTALLATION\_FAILED を全部のタブに知らせる流れ。ナビゲーションのたびの確認（scheduledNavUpdateCheck）、アイドルの確認、configVersion が違うときの扱い。
13. [アプリの側：SwUpdate と NgswCommChannel](13-sw-swupdate.md)  
   low\_level.ts の NgswCommChannel が navigator.serviceWorker の controller に postMessage し、nonce で答えを待つ仕組み（postMessageWithOperation・waitForOperationCompleted・eventsOfType）。SwUpdate の versionUpdates・unrecoverable・checkForUpdate・activateUpdate、ワーカーの側の msg.ts。issue #55975・#54036・#44402。
14. [アイドルの仕事と古い版の掃除](14-sw-idle-cleanup.md)  
   idle.ts の IdleScheduler（最後の fetch から 5 秒、最初に積んでから遅くても 30 秒で、積んだ仕事を直列に走らせる）と、積まれる仕事の全部（ナビゲーションのたびの更新の確認・起動のときの更新の確認と掃除・版の取り込み・ハッシュの無いファイルの取り直し）。どのタブも使っていない古い版のキャッシュを消す cleanupCaches が、起動（初期化）のときにしか積まれないこと。applicationMaxAge がビルドの時刻から数えられること（issue #71720）。
15. [壊れたときの状態：EXISTING\_CLIENTS\_ONLY・SAFE\_MODE・safety-worker](15-sw-safe-mode.md)  
   版が壊れたときに Driver が EXISTING\_CLIENTS\_ONLY（開いているタブだけ面倒をみる）や SAFE\_MODE（何も横取りしない）に下がる行と、戻る条件。ngsw.json が 404 のときに全部のキャッシュを消して登録を外す行、ワーカーを止めるための safety-worker.js、ブラウザのキャッシュの容量（navigator.storage）。
16. [プッシュ通知：SwPush と push・notificationclick](16-sw-push.md)  
   アプリの側の SwPush（requestSubscription・subscription・messages・notificationClicks・notificationCloses・pushSubscriptionChanges・unsubscribe、push.ts）と、ワーカーの側の onPush・handlePush（決まった 15 個の欄だけを showNotification に渡す）、onClick・handleClick が notification.data.onActionClick の operation（openWindow・focusLastFocusedOrOpen・navigateLastFocusedOrOpen・sendRequest）を実行する行。強制リロードで止まる issue #48702。
17. [デバッグのページ：/ngsw/state と DebugHandler](17-sw-debug.md)  
   ngsw/state を開くと出る文字列を作る DebugHandler（debug.ts）と、Driver の debugState・debugVersions・debugIdleState（状態と理由・版ごとのタブ・IdleScheduler の列をメモリから読む。AppVersion と IdleScheduler 自身は debug の関数を持たない）、エラーを 100 件ずつ 2 つの配列に貯める log。/ngsw/state は初期化を起こさないので起こし直した直後は空に近いこと、本番で困ったときにこのページで何が読めるか。ページの上で本物のワーカーのデバッグのページを v1 → v2 → オフラインで並べて読むデモ。
18. [ワーカーのテスト：SwTestHarness と偽物のブラウザ](18-sw-testing-harness.md)  
   worker/testing/ の SwTestHarness（scope.ts）・MockServerState（mock.ts）・MockCacheStorage（cache.ts）・MockClients（clients.ts）・MockRequest と MockResponse（fetch.ts）・イベント（events.ts）で、Driver を Node の中で動かす仕組み。happy\_spec.ts の書き方（サーバーを作る、版を入れる、fetch を送る、時計を進める）と、このシリーズのデモの偽物との違い。
19. [アプリ側のテストとテストの走らせ方](19-sw-testing-app.md)  
   test/ の comm\_spec.ts・provider\_spec.ts・integration\_spec.ts と testing/mock.ts の MockServiceWorkerContainer、config/test/generator\_spec.ts。service-worker のテストのターゲットの表と、手元で走らせるコマンド、直したいときにどの spec に足すか。
20. [issue と PR を読む：Service Worker の今](20-sw-issues.md)  
   service-worker は security の直ししか受け付けない、という方針（PACKAGE.md と、その後の README）を先に確かめ、area: service-worker のラベルで開いている issue と 2025-11 以降に閉じた issue を表にする。更新の確認が効かない、VERSION\_READY が余分に出る、プッシュの購読が出てこない、先読みの失敗から戻れない、applicationMaxAge の数え方など。どの issue がこのシリーズのどの章の行に関係するか、このシリーズで見つけた不具合らしきもの。
