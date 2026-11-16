[目次](../README.md)

# $locationShim の内側：AngularJS の $location を Angular の Location で動かす

> LocationUpgradeModule と provider・初期化とブラウザとの同期・url / path / search / hash の読み書き・UrlCodec・spec と issue

@angular/common/upgrade は、AngularJS と Angular を 1 つのページで動かす移行の途中で、AngularJS の $location を Angular の Location の上に作り直した部品（$locationShim）を入れるためのパッケージです。2 つのフレームワークが別々に URL を見張ると、履歴が二重に積まれたり、片方の変更をもう片方が見落としたりします。このシリーズでは、LocationUpgradeModule.config() が何を差し替えるか、$locationShim がブラウザの URL・$rootScope の digest・Location の変更通知をどう 1 本にまとめるか、URL をどう分けて組み立て直すか（UrlCodec）を、約 1300 行の本体と spec の順に読みます。

全 5 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/lshim)

1. [LocationUpgradeModule：$location を差し替える provider の組み立て](01-lshim-module.md)  
   location\_upgrade\_module.ts の LocationUpgradeModule.config() が返す 6 つの provider（設定・UrlCodec・APP\_BASE\_HREF\_RESOLVED・LocationStrategy・Location・$locationShim）と、5 つの設定のうち実際に読まれる 3 つ（hashPrefix と serverBaseHref は読まれない）。base href が appBaseHref → APP\_BASE\_HREF → '' の順で決まり &lt;base&gt; を読まないこと、$locationShimProvider が $locationProvider の形だけを持って throw すること、utils.ts の 3 つの関数、AngularJS の側の factory('$location', downgradeInjectable($locationShim)) での差し替えまで。
2. [初期化と同期：ブラウザの URL・digest・Location を 1 本にまとめる](02-lshim-sync.md)  
   $locationShim の constructor と initialize が、Location.onUrlChange → ReplaySubject の読む道と、$rootScope.$watch → $evalAsync → pushState の書く道をどうつなぎ、$locationChangeStart の preventDefault・browserUrl・cacheState が履歴の URL と state をどう扱うか。AngularJS 本来の $location と並べた記録で見える 3 つの食い違いと、root scope が壊れたときの後片付けの修正（7bd4be0fa58・36b60a97059）。
3. [url・path・search・hash：$location の読み書きを組み立て直す](03-lshim-api.md)  
   parseAppUrl・$$parse・composeUrls・url()・path()・search() の 3 通り・hash()・replace()・state() が、AngularJS の $location の約束（getter と setter を兼ねる・digest の後でブラウザに書く）をどう写しているかを、本物の AngularJS 1.8.3 と同じ操作を並べた記録で確かめる。state() だけの変更がブラウザに書かれないこと、onChange（#30466・#32037）と setBrowserUrlWithFallback、hash のモードで hash が重なる #30305 と閉じた #70501。
4. [UrlCodec と AngularJSUrlCodec：URL を分けて組み立て直す規則](04-lshim-params.md)  
   params.ts の UrlCodec と AngularJSUrlCodec が、URL を分け（parse）・decode し・組み立てる（encodePath・encodeSearch・encodeHash・normalize）行、AngularJS の encodeUriQuery・encodeUriSegment との合わせ方、Safari の修正（#32959）、query の解析で Object.hasOwn を使う修正（e5c37f21de3）、閉じた 2 つの PR（/index.html の #69023・壊れた % の #69061）。
5. [spec と issue を読む：$locationShim を固めているテスト](05-lshim-tests-issues.md)  
   common/upgrade の upgrade.spec.ts・params.spec.ts と upgrade\_location\_test\_module.ts・$rootScope の作り物が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果（64 specs）、1 行ずつ変えて落ちる spec を確かめた結果、$locationShim の issue と PR の表（#30305・APP\_BASE\_HREF の重複・閉じた外の PR）と、保守モードで入った修正と閉じた修正。
