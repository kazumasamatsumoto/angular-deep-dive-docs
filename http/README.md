[目次](../README.md)

# HttpClient の内側

> http.get() の 1 行が、どの関数を、どの順で通ってネットワークに出るか

HttpClient.get() は、その場では何も送りません。HttpRequest を 1 つ作り、それを流す冷たい Observable を返すだけです。購読されると HttpInterceptorHandler が、登録されたインターセプタを reduceRight で入れ子にした関数を呼び、最後に HttpBackend（v22 の既定は FetchBackend）が fetch を呼びます。返ってきたイベントの列から observe と responseType に合わせて本文を取り出し、エラーは HttpErrorResponse になります。provideHttpClient の features、不変な HttpRequest と HttpHeaders、XSRF、JSONP、SSR の転送キャッシュ、テスト用のバックエンドまで、common/http の実際の行で 1 ステップずつ追います。

全 12 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/http)

1. [HttpClient の概観：get() から fetch() まで、関数 6 つの 1 本道](01-http-overview.md)  
   HttpClient.request が HttpRequest を作って of(req).pipe(concatMap(...)) で包み、HttpHandler（= HttpInterceptorHandler）→ インターセプタの連鎖 → HttpBackend（FetchBackend）→ HttpEvent の列 → observe / responseType に合わせた取り出し、と進む全体図。どの回がどこを扱うかの地図と、登場するクラス・トークンの表。
2. [provideHttpClient と features：HttpFeatureKind、既定の FetchBackend、withXhr](02-http-provide.md)  
   provideHttpClient が HttpClient・FetchBackend・HttpInterceptorHandler と xsrfInterceptorFn を並べ、features の ɵproviders を後ろに足す行。v22 で HttpBackend の既定が FetchBackend になったこと、withXhr / withFetch / withInterceptors / withInterceptorsFromDi / withRequestsMadeViaParent / withJsonpSupport / withXsrfConfiguration が何を足すか、矛盾する組み合わせを開発ビルドで止める行、HttpClientModule が provideHttpClient(withInterceptorsFromDi(), withXhr()) を包むだけで出口は HttpXhrBackend になること、v22 では provideHttpClient が無くても HttpClient が root で使えること。
3. [HttpClient.request：オーバーロードの山と、冷たい Observable と observe](03-http-client-request.md)  
   get / post などがすべて request に集まり、request が HttpRequest を作って of(req).pipe(concatMap((req) =&gt; this.handler.handle(req))) にする行。購読するまで送られない理由、2 回購読すると 2 回送られる理由、observe が events / response / body のときの filter と map、responseType ごとの型の付け方（オーバーロード）と実行時のチェック。
4. [不変な HttpRequest・HttpHeaders・HttpParams・HttpContext と clone](04-http-request-immutable.md)  
   HttpRequest のコンストラクタが method ごとに body を許すか決める行、clone が変更点だけを差し替えた新しいインスタンスを作る行。HttpHeaders は変更を lazyUpdate に、HttpParams は updates に積み、clone は最初のインスタンスを写し元にして、読まれたときに初めて init する仕組み、名前の大小文字の正規化、HttpUrlEncodingCodec の符号化、HttpContext と HttpContextToken（HttpContext だけは変更可能で clone 間で共有される）。
5. [インターセプタの連鎖：reduceRight で関数を入れ子にする](05-http.md)  
   reduceRight の 1 行で登録順の入れ子を作り、各段を runInInjectionContext で呼ぶ。xsrf が先頭、クラスのインターセプタは withInterceptorsFromDi の位置に 1 つの関数として入る。
6. [FetchBackend：fetch の呼び出し、本文のストリーム読み、中断とサイズ上限](06-http-backend-fetch.md)  
   FetchBackend.handle が Observable の中で doRequest を呼び、fetch に AbortController の signal を渡す行、レスポンスの本文を reader で少しずつ読んで DownloadProgress を流す行、HTTP\_FETCH\_MAX\_RESPONSE\_SIZE の上限、responseType ごとの変換と JSON の解析失敗、ステータス 0 やネットワークエラーの扱い、PendingTasks は手前の HttpInterceptorHandler が持つこと、購読解除で abort する行。
7. [HttpXhrBackend：XMLHttpRequest のイベントと、アップロードの進捗](07-http-backend-xhr.md)  
   HttpXhrBackend.handle が XMLHttpRequest を開いてヘッダーを付け、load / error / timeout / abort / progress / upload.progress のリスナーを登録する行、ヘッダー文字列の解析、JSON の XSSI 接頭辞（)\]}'）を剥がす行、reportProgress、購読解除で abort してリスナーを外す行。FetchBackend との違い（アップロードの進捗が取れるかなど）を表にする。
8. [HttpEvent と HttpErrorResponse：イベントの種類、ok、エラーの作られ方](08-http-response-errors.md)  
   HttpEventType の 6 種類（Sent / UploadProgress / ResponseHeader / DownloadProgress / Response / User）、HttpResponseBase の ok が 200〜299 で決まる行、HttpErrorResponse の message の作り方、ステータスコード 0 になる場面、本文の JSON 解析に失敗したときの error の形、HttpStatusCode の列挙。retry や catchError をどこに置くとどう効くか。
9. [XSRF 対策：クッキーを読んでヘッダーに載せるインターセプタ](09-http-xsrf.md)  
   xsrfInterceptorFn が GET / HEAD でないリクエストで、相対 URL（または同じオリジン）のときだけ HttpXsrfCookieExtractor でクッキーを読み、X-XSRF-TOKEN ヘッダーを付ける行。クッキーの解析をキャッシュする仕組み、サーバーでは読まない理由、withXsrfConfiguration と withNoXsrfProtection、別オリジンの URL に付けない理由（同じオリジンなら絶対 URL にも付く）、子の注入器ではクッキー名の設定が root から読まれる落とし穴。
10. [JSONP：script 要素を差し込んでコールバックを待つバックエンド](10-http-jsonp.md)  
   withJsonpSupport が足す jsonpInterceptorFn と JsonpClientBackend。method が JSONP のリクエストだけを横取りし、コールバック名を作って script 要素を差し込み、load / error で後片付けする行、JSONP\_CALLBACK の置き換え、コールバックが呼ばれなかったときのエラー、危険な URL を拒む行。v22.1 で非推奨になったことと、使わない理由。
11. [SSR の転送キャッシュ：サーバーで取った応答をブラウザで使い回す](11-http-transfer-cache.md)  
   withHttpTransferCache（provideClientHydration が既定で有効にする）が足す transferCacheInterceptorFn。サーバーでは応答を TransferState に書き、ブラウザでは同じキーがあればネットワークに出ずに返す行、キーの作り方（method・responseType・URL・body・並べ替えた params の SHA-256）、GET と HEAD だけが既定の理由と includePostRequests、認証ヘッダー・credentials・Cache-Control・応答の Set-Cookie で外れる条件、filter / includeHeaders、アプリが安定したらキャッシュを止める行、HTTP\_TRANSFER\_CACHE\_ORIGIN\_MAP。
12. [テスト用バックエンド：HttpTestingController と TestRequest](12-http-testing.md)  
   provideHttpClientTesting が HttpBackend を HttpClientTestingBackend に差し替える行、送られたリクエストを open 配列に積み、expectOne / match / verify が探す手順、TestRequest.flush / error / event が Observable にイベントを流す行。インターセプタは本物が通る理由と、provideHttpClient より後に書く必要がある理由。
