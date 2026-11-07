[目次](../README.md)

# SSR とハイドレーション

> サーバーで作った HTML を、ブラウザで捨てずに使い回す

サーバーでは platformServer が domino の DOM の上でアプリを起動し、安定するのを待ってから HTML に書き出します。そのとき annotateForHydration が、各コンポーネントの DOM の形を ngh 属性と TransferState に記録します。ブラウザでは provideClientHydration が、その記録を頼りに既存の DOM ノードを 1 つずつ「確保」し、作り直さずに使い回します。@angular/ssr の AngularAppEngine とサーバールート、ビルド時のプリレンダー、不一致のエラー、i18n、イベントの記録と再生、@defer の hydrate トリガーによるインクリメンタルハイドレーションまで、実際の行で 1 ステップずつ追います。このサイト自体がプリレンダー + インクリメンタルハイドレーションで動いているので、デモはこのページの HTML を調べます。

全 15 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/platform)

1. [SSR とハイドレーションの概観：サーバーで 1 回、ブラウザでもう 1 回](01-ssr-overview.md)  
   リクエスト（またはビルド時のプリレンダー）→ AngularAppEngine → renderAngular（または renderApplication）→ platformServer と domino → whenStable → annotateForHydration → serializeDocument、ブラウザで bootstrapApplication → provideClientHydration → DOM ノードの確保 → 確保されなかったノードの片付け、という全体図。どの回がどこを扱うかの地図と、登場する関数・トークン・HTML の印（ngh / ngcm / nghm / ng-state / ng-server-context / jsaction / ngb）の表。
2. [renderApplication：サーバーでアプリを起動し、安定を待って HTML にする](02-ssr-render-application.md)  
   renderApplication / renderModule が createServerPlatform で platformServer を作り、bootstrap し、renderInternal で whenStable を待ってから prepareForHydration（annotateForHydration とイベント記録用スクリプトの挿入）、BEFORE\_APP\_SERIALIZED、PlatformState.renderToString と進み、最後にプラットフォームを破棄する行。ngServerMode、SERVER\_CONTEXT（ng-server-context 属性）、allowedHosts の検査。
3. [platformServer：domino の DOM、ServerPlatformLocation、サーバー用プロバイダ](03-ssr-platform-server.md)  
   platformServer が INTERNAL\_SERVER\_PLATFORM\_PROVIDERS で DominoAdapter を DOM アダプタにし、INITIAL\_CONFIG の document（HTML 文字列）を parseDocument する行。ServerPlatformLocation が url から pathname・search・hash を作る行、PLATFORM\_SERVER\_PROVIDERS と SERVER\_RENDER\_PROVIDERS、v22 で非推奨になった ServerXhr、platform-server の provideServerRendering と @angular/ssr の provideServerRendering の違い。
4. [AngularAppEngine と AngularServerApp：Request から Response まで](04-ssr-app-engine.md)  
   @angular/ssr の AngularAppEngine.handle がホストを検査し、ロケールごとの入口を選んで AngularServerApp.handle に渡す行。ルート木で RenderMode を引き、Prerender のルートは作り置きの HTML を返し（無ければ本番では null）、Server のルートは renderAngular で描画し、Client のルートは index.csr.html を返す分岐。リダイレクトとステータス、重要 CSS のインライン化、プリロードのヒント、AngularNodeAppEngine が Node の req / res を Web の Request / Response に変える層。
5. [サーバールート：RenderMode と、Router の設定からルートを取り出す仕組み](05-ssr-server-routes.md)  
   ServerRoute の型（renderMode: Server / Client / Prerender、getPrerenderParams、fallback、headers、status（Prerender は不可））、withRoutes と SERVER\_ROUTES\_CONFIG。getRoutesFromAngularRouterConfig がアプリをルートコンポーネント無し（ɵENABLE\_ROOT\_COMPONENT\_BOOTSTRAP = false）で起動して Router の config を辿り、遅延ルートを読み込み、サーバールートと突き合わせて RouteTree に入れる行。\*\* と :param の照合、リダイレクトの解決。このサイトの app.routes.server.ts が何を意味するか。
6. [プリレンダー：ビルド時に全ルートを HTML にする](06-ssr-prerender.md)  
   @angular/build の prerenderPages がサーバー用バンドルをメモリ上で読み込み、routes-extractor-worker でルートを取り出し、WorkerPool（Piscina）の render-worker にルートを束で配り、本番と同じ AngularServerApp.handle で描画して index.html を書き出す行。outputMode static と server の違い、マニフェスト（angular-app-manifest.mjs）の中身、getPrerenderParams による :param の展開。このサイトの「Prerendered N static routes」が出るまで。
7. [provideClientHydration：features と withDomHydration が足すもの](07-hydration-provide.md)  
   provideClientHydration が features を集め、withDomHydration・転送キャッシュ・インクリメンタルハイドレーション（v22 では既定で有効、withNoIncrementalHydration で外す）を並べる行と、矛盾する組み合わせを開発ビルドで止める行。withDomHydration の IS\_HYDRATION\_DOM\_REUSE\_ENABLED がブラウザでは TransferState に ngh のデータがあるときだけ真になる行、enableHydrationRuntimeSupport が実装を差し替える仕組み、ngcm（クライアント描画）の印、whenStable の後の片付けと 10 秒のタイムアウト警告。
8. [annotateForHydration：サーバーで DOM の形を ngh に書き出す](08-hydration-annotate.md)  
   サーバーで annotateForHydration が appRef.components を回り、コンポーネントの LView ごとに serializeLView で SerializedView（テンプレートの番号、コンテナのビュー、要素コンテナの大きさ、切り離されたノード、ノードの道順）を作り、同じ内容を 1 つにまとめて ngh 属性に番号を書き、配列を TransferState（キー \_\_nghData\_\_）に入れる行。テキストノードの境目の印（ngtns / ngetn）、ShadowDom のコンポーネントを飛ばす理由、nghm の印。
9. [ノードの道順：f と n の 2 文字と、連続をまとめる圧縮](09-hydration.md)  
   確保するノードが兄弟の順で見つからないとき（投影されたノードなど）のために、サーバーが記録する道順。navigateBetween / calcPathForNode が親や前のノードから firstChild（f）と nextSibling（n）を並べた道順を作り、compressNodeLocation が連続を数字にまとめる行、ブラウザで decompressNodeLocation と navigateToNode が辿り直す行。
10. [DOM ノードの確保：命令がノードを作らずに見つける](10-hydration-claim.md)  
   ブラウザで ɵɵelementStart などの命令が、ハイドレーション中は \_locateOrCreateElementNode を通って document.createElement の代わりに locateNextRNode で既存のノードを見つける行。retrieveHydrationInfo が ngh 属性を読んで DehydratedView を作り、属性を消す行、markRNodeAsClaimedByHydration（確保の印は開発モードだけ）、テキストノードとコメント、属性やリスナーの付け方が作るときと同じになる理由。canHydrateNode と ngSkipHydration の範囲。
11. [@if・@for のビューと片付け：脱水されたビューを探して使い回す](11-hydration-containers.md)  
   locateDehydratedViewsInContainer がコンテナのアンカーの前にある脱水済みビュー（DehydratedContainerView）を数で切り出す行、ビューを作るときに findMatchingDehydratedView がテンプレートの番号で一致するものを取り出す行、使われなかったビューを cleanupDehydratedViews が whenStable の後に DOM から消す行。サーバーとブラウザで @if の分岐が違ったときに何が起きるか。
12. [ハイドレーションの不一致：NG0500 番台のエラーと ngSkipHydration](12-hydration-errors.md)  
   validateMatchingNode が期待するノードと実際のノードを比べ、describeExpectedDom / describeDomFromNode で差分のメッセージを組み立てる行。NG0500（不一致）・NG0501（兄弟が無い）・NG0502（ノードが無い）・NG0503（投影できない DOM）・NG0504（ngSkipHydration の置き場所）・NG0505（注釈が無いという警告）・NG0507（nghm が無い）が出る場面、ngSkipHydration と PRESERVE\_HOST\_CONTENT、直接 DOM を触るコードがなぜ壊すか。
13. [i18n のハイドレーション：翻訳で順番が変わるノードを辿る](13-hydration-i18n.md)  
   withI18nSupport を付けないと i18n を含むコンポーネントに ngSkipHydration が付いて丸ごと作り直される理由、サーバーで trySerializeI18nBlock が i18n のノードごとに DOM 上の位置を記録する行、ブラウザで prepareI18nBlockForHydration が翻訳後の構造を辿ってノードを集める行、ICU のケースの確保と後片付け。
14. [イベントの記録と再生：JS が来る前のクリックを失わない](14-event-replay.md)  
   サーバーで jsaction 属性を付け、ng-event-dispatch-contract のスクリプトで早期のイベント契約（EarlyEventContract）を置き、ブラウザでハイドレーション前のイベントを window.\_ejsas\[appId\].q に貯める行。withEventReplay が EventDispatcher を作り、ハイドレーション後に貯めたイベントを本物のリスナーに渡し直す行、stashEventListener、記録の対象になるイベントの種類。
15. [インクリメンタルハイドレーション：@defer の hydrate トリガーで必要な所だけ](15-incremental-hydration.md)  
   @defer (hydrate on viewport) などの hydrate トリガーが、サーバーでは中身を描画して NGH\_DEFER\_BLOCKS\_KEY に記録し、ブラウザでは中身の JS を読まずに脱水のまま残る仕組み。ɵɵenableIncrementalHydrationRuntime、トリガーが jsaction に変わる行（convertHydrateTriggersToJsAction）、発火したときに親のブロックから順にハイドレートする getParentBlockHydrationQueue、hydrate never。このサイトのシリーズページが章ごとにこれを使っている様子。
