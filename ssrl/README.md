[目次](../README.md)

# @angular/ssr の読み残し：provideServerRendering・リクエストハンドラ・CommonEngine・ビルド側のワーカーを行で埋める

> provideServerRendering と withRoutes / withAppShell・createRequestHandler と Node の入口・CommonEngine と性能の記録・i18n と URL の小道具・prerender のワーカーとサーバー起動・spec と issue

「SSR とハイドレーション」「SSR の守りと細部」「SSR のサーバールートの内側」の 3 つのシリーズで、@angular/ssr の中心の流れ（AngularAppEngine がリクエストを受けて、ルートを照合し、描画して返すまで）は読みました。このシリーズでは、そのとき読まずに残した行を埋めます。app.config.server.ts に書く provideServerRendering・withRoutes・withAppShell の中身、server.ts の createRequestHandler / createNodeRequestHandler とビルドがそれを見分ける方法、古い CommonEngine と性能の記録、i18n と URL の小さな関数、そして ng build が prerender のときに動かすワーカー（ルートの取り出し・描画・サーバーの起動・fetch の差し替え）を順に読み、最後に spec と issue を読みます。デモは、本物の @angular/ssr を Node で動かして記録した値をページで再生します。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/ssrl)

1. [provideServerRendering の中身：withRoutes と withAppShell が積む provider](01-ssrl-provide.md)  
   route-config.ts の未読の行：ServerRenderingFeature の形、withRoutes の doc と 262 行目の { routes }、withAppShell が ɵcmp でコンポーネントか関数かを分けて ROUTES に足し、注入器ができたときに appShellRoute を書き足す行、ServerRenderingOptions と 2 つのオーバーロード・hasOptions。本物の provideServerRendering を 10 通り呼んで、返る provider の木と注入器の値（maxResponseBodySize: 0 が既定の 1MB になることなど）を並べる。
2. [server.ts の入口：createRequestHandler・createNodeRequestHandler と、ビルドが見分ける印](02-ssrl-handlers.md)  
   src/handler.ts と node/src/handler.ts が関数に付ける印、ビルド側の isSsrRequestHandler / isSsrNodeRequestHandler がそれを in で見て dev-server の中間処理の道を決める行（読むのは名前つきの reqHandler で、doc の例の export default は読まれない）、AngularNodeAppEngine の残りの行、Node の request から Web の Request を作る関数の doc の残り、attachNodeGlobalErrorHandlers がいつ何を process に付けるか。
3. [CommonEngine の残りと性能の記録：enablePerformanceProfiler が測るもの](03-ssrl-common-engine.md)  
   node/src/common-engine/common-engine.ts の未読の行（2 つのオプションの型・テンプレートのキャッシュ・bootstrap の見分け方・重要 CSS の読み込み先）、peformance-profiler.ts の runMethodAndMeasurePerf と printPerformanceLogs、重なった 2 つのリクエストで片方の render が reject する理由、src/app.ts と hooks.ts の未読の行を CommonEngine の同じ役の行と並べる。
4. [i18n と URL の小道具：JSDoc の約束と本物の答え、ng.ts とマニフェストの残り](04-ssrl-i18n-url.md)  
   i18n.ts・utils/url.ts・utils/ng.ts の残りの行（JSDoc の約束、normalizeLocale、stripTrailingSlash・addLeadingSlash・stripIndexHtmlFromURL・buildPathWithParams）を、JSDoc の例と Accept-Language を本物の関数（44129f66a3 と 22.2.7）に流した記録で照らす。manifest.ts の AngularAppEngine 用マニフェストの置き場と、app-engine.ts の static なフラグ（ɵallowStaticRouteRender など）を誰が立てるか。
5. [ビルド側のワーカー：ルートの取り出し・prerender の描画・サーバーの起動・fetch の差し替え](05-ssrl-build-workers.md)  
   packages/angular/build の utils/server-rendering の未読の行：routes-extractor-worker と render-worker が workerData で何を受け取り何を返すか（models.ts の型と RouteRenderMode）、launch-server が server.ts をワーカーの中で localhost の空いたポートで起動し、無ければ http://ng-localhost/ を土台にする理由、fetch-patch が資産をネットワークに出さずに返す行、ESM ローダーのフック、generateRedirectStaticPage、prerender.ts と manifest.ts の残り。本物の ng build を 6 通り走らせた記録つき。
6. [spec と issue を読む：@angular/ssr の残りを固めているテスト](06-ssrl-tests-issues.md)  
   packages/angular/ssr/test・ssr/node/test と packages/angular/build の server-rendering の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果（249・42・615 件）、作業木で 1 行ずつ変えて落ちる it、@angular/ssr の開いている issue の表。
