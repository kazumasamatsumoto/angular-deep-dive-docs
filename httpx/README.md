[目次](../README.md)

# HttpClient の細部と issue

> HttpRequest の options・headers と params の更新の規則・オーバーロードの型・httpResource の型・転送キャッシュのキー・spec と issue

HttpClient の大きな流れ（request から バックエンドまで、インターセプタの連鎖、転送キャッシュ）は、HTTP のシリーズで読みました。このシリーズでは、その章で通り過ぎた細部を読みます。HttpRequest が options を 1 つずつ写す行、HttpHeaders と HttpParams の append・set・delete が積まれてから当てられる規則、get や post の何十ものオーバーロードの型が observe と responseType で選ばれるしくみ、httpResource の型、転送キャッシュのキーを作る手書きの SHA-256 です。packages/common/http は issue と修正がとても多い場所で、2026 年だけでも細部の修正が 20 本ほど入っています。各章は、その章の行を変えた最近の修正のコミットを読み、どう直されたかを学びます。最終回は spec と、ラベル area: common/http の issue を読みます。ページの上のデモは、本物の @angular/common/http を、ネットワークに出ない差し替えのバックエンドで動かします。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/httpx)

1. [HttpRequest の options：1 つずつ写す行と、最近の修正](01-httpx-request-options.md)  
   HttpRequest のコンストラクタが options（headers・context・params・responseType・withCredentials・priority・keepalive・cache・credentials・mode・redirect・referrer・integrity・timeout など）を写す行が、項目ごとに !!・値があるか・typeof・!== undefined・条件なしの 5 通りに分かれていること、写さなかった欄が undefined のまま fetch に渡ること、clone が受け継ぐ行。HttpClient.request から渡る道と、referrer の空文字（cd771d3712f）・post と patch の進捗の指定（c092a002e40）・# の前に params を入れる（cb8ceb1dde6）の修正、そして addBody の { body, ...options } が options の body を優先してしまう副作用。
2. [headers と params の更新の規則：append・set・delete と遅れた適用](02-httpx-headers-params-updates.md)  
   HttpHeaders と HttpParams が append・set・delete を更新の列に積み、読まれたときに 1 つずつ当てる行（a・s・d の分岐）、値を指定した delete と名前だけの delete の違い、配列の値、fromObject と fromString。値の一致を厳密にした修正（f33ee95045a）と、clone を実体化したあとの不変性の修正（ff02a167495）、開いている #44149。
3. [オーバーロードの型：observe と responseType で戻り値が決まるしくみ](03-httpx-overload-types.md)  
   client.ts の get・post などが observe（body・events・response）と responseType（json・text・blob・arraybuffer）の組み合わせごとにオーバーロードを持つ理由、TypeScript がどれを選ぶか（型引数の数で候補を絞り、上から最初に合うもの）、options を変数に入れると responseType が string に広がって選ばれなくなる落とし穴（as const）、公開の型 HttpClientCommonOptions の変数が get では通らず head・post では Observable&lt;Object&gt; として通る違い、実行時の分岐との対応。開いている #49760・#21866 を型の面から読む。
4. [httpResource の型：text・blob・arrayBuffer と parse](04-httpx-resource-types.md)  
   resource.ts の HttpResourceFn（httpResource と text・blob・arrayBuffer の入口が、それぞれ url・request × defaultValue の有無の 4 つのシグネチャを持つ）、実行時に違うのは responseType だけであること、parse・defaultValue・equal の型（NoInfer）と TypeScript に聞いた記録、parse が呼ばれる 2 か所（応答と転送キャッシュ）、HttpResourceRef の headers・statusCode・hasValue。本物の httpResource をページで動かすデモと、開いている #66636（parse からヘッダーを読みたい）を行から読む。
5. [転送キャッシュのキー：手書きの SHA-256 と、衝突の修正](05-httpx-transfer-cache-key.md)  
   transfer\_cache.ts がキーを作る行（params の並べ方・本文・\\0 の区切り）、同期で動く SHA-256 を手で書いている理由と 1 ステップずつの中身、本文を base64 にする行（32 KB ずつ）と blob の応答が空になる行、運ばれなかったヘッダーを開発モードで知らせる Proxy。キーの衝突を防ぐ修正（3192dccaa3e・a6c7fc5c13e）と、安全なハッシュへの差し替え（5f36274da3f）、Set-Cookie（f76e8a98c10）、開いている #70226・#70947 を、ライブのデモと Node の記録で確かめる。
6. [spec と issue を読む：packages/common/http の今](06-httpx-tests-issues.md)  
   packages/common/http/test と testing の spec の分け方と手元での走らせ方。ラベル area: common/http の開いている issue と最近閉じた issue の表、どの issue がこのシリーズのどの章の行に関係するか、2026 年の修正の傾向（小さく、spec つき、1 つの振る舞い）。
