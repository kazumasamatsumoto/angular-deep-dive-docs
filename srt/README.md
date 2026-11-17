[目次](../README.md)

# SSR のサーバールートの内側：ルートを取り出し、木で照合し、応答を組み立てる

> ルートの取り出し・プリレンダーのパラメータとリダイレクト・ルートの木・manifest と renderAngular・応答とその後片付け・spec と issue

@angular/ssr は、アプリの Router の設定を一度サーバーで起動して読み、serverRoutes（withRoutes）の RenderMode と組み合わせて、URL ごとの扱いを決めた木（RouteTree）を作ります。既存の ssr-server-routes の章が大筋を書き、ssrx のシリーズが守りの部分を読んだので、このシリーズはその間に残った行を読みます。getRoutesFromAngularRouterConfig と traverseRoutesConfig がルートをたどる手順、getPrerenderParams とリダイレクトの置き換え、RouteTree の insert と match、manifest と renderAngular、AngularServerApp が応答を組み立てて後片付けするまでを順に追います。2026 年の修正（経路の decode・リダイレクトの引数・プラットフォームの破棄）と、origin/main の続きも読みます。

全 5 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/srt)

1. [ルートを取り出す：サーバーで Router を起動して設定をたどる](01-srt-extract.md)  
   routes/ng-routes.ts の getRoutesFromAngularRouterConfig が、ルートコンポーネントを作らず IS\_DISCOVERING\_ROUTES を真にしてアプリを起動し、traverseRoutesConfig と handleRoute が children・loadChildren・matcher・redirectTo を 1 つずつたどって、ルートの一覧と errors を作り、baseHref を付けて RouteTree に入れる手順。0f41585a7c（発見中の印）・4a1833d842（blocking の初回ナビゲーション）・appendPreloadToMetadata と、22.2.7 に入った 0b9a52cc95（'' の子と preload）。
2. [プリレンダーのパラメータとリダイレクト：:id を値で埋める](02-srt-prerender-params.md)  
   handleSSGRoute と handlePrerenderParamsReplacement が getPrerenderParams の値で :id と \*\* を置き換え、fallback の 1 件を決める行と、resolveRedirectTo が相対のリダイレクトを解く行。0fdcde5426（正規表現の状態）・0bd22dae09 と、その後の b3bbada1ef・f2cd8c8cf7・97ed36ec4f・8aa16b6f9f・92033cea10・bf1602a916（22.2.7 に入っている）・267064ca74 の違い。
3. [ルートの木：RouteTree の insert と match、serverRoutes の木](03-srt-route-tree.md)  
   routes/route-tree.ts の RouteTree が、経路を / で分けて 1 段ずつ decode し（53b9623b7b）、:param を \* にして木に入れ、段ごとに完全一致 → \* → \*\* の順で後戻りしながら照合する仕組み（4df97d1923 で insertionIndex の順をやめた）と、manifest に入れる toObject / fromObject。buildServerConfigRouteTree が serverRoutes を木にするときの検査と、route-config.ts の withRoutes・provideServerRendering の残りの行。
4. [manifest と renderAngular：ビルドの出力とサーバーの起動をつなぐ](04-srt-manifest-render.md)  
   manifest.ts の AngularAppManifest と AngularAppEngineManifest に何が入り、ビルドがどう書き、サーバーがいつ読むか。utils/ng.ts の renderAngular が 1 リクエストに 1 つのプラットフォームを作り、失敗・リダイレクト・ストリームの取り消し・接続の切断のどこからでも 1 回だけ壊す行と、それを直した fd1a2091d2・6a3446770a・origin/main の 47bc9c3969（22.2.7 と 22.1.7 で比べた記録）。
5. [spec と issue を読む：サーバールートを固めているテスト](05-srt-tests-issues.md)  
   test/ の ng-routes・route-tree・router・app・promise の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で行を変えて見つけた「消しても落ちない行」、サーバールートの issue と PR の表と origin/main の続き。
