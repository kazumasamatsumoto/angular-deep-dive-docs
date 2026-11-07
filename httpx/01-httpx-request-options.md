[目次](../README.md) › [HttpClient の細部と issue](README.md) › 第 1 回 / 全 6 回

# HttpRequest の options：1 つずつ写す行と、最近の修正

> HttpRequest のコンストラクタが options（headers・context・params・responseType・withCredentials・priority・keepalive・cache・credentials・mode・redirect・referrer・integrity・timeout など）を写す行が、項目ごとに !!・値があるか・typeof・!== undefined・条件なしの 5 通りに分かれていること、写さなかった欄が undefined のまま fetch に渡ること、clone が受け継ぐ行。HttpClient.request から渡る道と、referrer の空文字（cd771d3712f）・post と patch の進捗の指定（c092a002e40）・# の前に params を入れる（cb8ceb1dde6）の修正、そして addBody の { body, ...options } が options の body を優先してしまう副作用。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/httpx-request-options)

---

`http.post(url, body, { referrer: '', priority: 'high' })` と書いた options は、`HttpRequest` のコンストラクタで 1 つずつ写されます。この章では、その「写す行」が項目ごとに違う条件（`!!`・値があるか・`!== undefined`・数の検査）で書かれていることと、その違いが原因で起きた 3 つの不具合の修正（referrer の空文字・post の進捗・`#` の前の params）を、行番号とコミットで読みます。

読む対象は `packages/common/http/src/request.ts` のコンストラクタと `clone`、それに `client.ts` の `addBody` です。大きな流れ（`get()` から `fetch()` まで）は[概観の章](../http/01-http-overview.md)、コンストラクタの前半（body か options か）と `clone` の基本形は[不変なリクエストの章](../http/04-http-request-immutable.md)にあります。ここではその章が「繰り返しなので省きます」と飛ばした部分を読みます。

1. **1. HttpRequest の options**（この章）
2. [2. headers と params の更新](02-httpx-headers-params-updates.md)
3. [3. オーバーロードの型](03-httpx-overload-types.md)
4. [4. httpResource の型](04-httpx-resource-types.md)
5. [5. 転送キャッシュのキー](05-httpx-transfer-cache-key.md)
6. [6. spec と issue](06-httpx-tests-issues.md)

## 1. options に書ける 19 項目

📄 `angular/packages/common/http/src/request.ts` L104–141 （▶ の行: 109, 112–113, 117–118, 122, 124, 128, 139–140）

```ts
104 │ /**
105 │  * Options to configure the `HttpRequest`, like headers, parameters, etc.
106 │  *
107 │  * @publicApi 22.0
108 │  */
109 ▶ export interface HttpRequestOptions {
110 │   headers?: HttpHeaders;
111 │   context?: HttpContext;
112 ▶   /** @deprecated 22.0 Use `reportUploadProgress` and `reportDownloadProgress` instead */
113 ▶   reportProgress?: boolean;
114 │   /**
115 │    * When set to `true` a request emited against the `FetchBackend` will throw an error.
116 │    */
117 ▶   reportUploadProgress?: boolean;
118 ▶   reportDownloadProgress?: boolean;
119 │   params?: HttpParams;
120 │   responseType?: HttpResponseType;
121 │   withCredentials?: boolean;
122 ▶   credentials?: RequestCredentials;
123 │   keepalive?: boolean;
124 ▶   priority?: RequestPriority;
125 │   cache?: RequestCache;
126 │   mode?: RequestMode;
127 │   redirect?: RequestRedirect;
128 ▶   referrer?: string;
129 │   integrity?: string;
130 │   referrerPolicy?: ReferrerPolicy;
131 │   /**
132 │    * This property accepts either a boolean to enable/disable transferring cache for eligible
133 │    * requests performed using `HttpClient`, or an object, which allows to configure cache
134 │    * parameters, such as which headers should be included (no headers are included by default).
135 │    *
136 │    * Setting this property will override the options passed to `provideClientHydration()` for this
137 │    * particular request
138 │    */
139 ▶   transferCache?: HttpTransferCacheRequestOptions;
140 ▶   timeout?: number;
141 │ }
```

109 行目の `HttpRequestOptions` が、`HttpRequest` に渡せる options の型です。`@publicApi 22.0`（107 行目）のとおり、v22 で公開の型になりました。それまでは `client.ts` のオーバーロード 1 つ 1 つに同じ項目が書き写されていて、2026-02 のコミット 6413e703fa1（「refactor http options」）がこの 1 つにまとめました。

- 112〜118 行目：`reportProgress` は v22 で非推奨になり、`reportUploadProgress`（送る側）と `reportDownloadProgress`（受ける側）に分かれました（7c8c3347efc）。
- 122〜130 行目の 9 つ（`credentials`・`keepalive`・`priority`・`cache`・`mode`・`redirect`・`referrer`・`integrity`・`referrerPolicy`）は、型が DOM の `RequestInit`（`fetch` の第 2 引数）と同じです。中身はほぼそのまま `fetch` に渡ります（6 節）。
- 139 行目の `transferCache` と 140 行目の `timeout` は Angular だけの項目です。

`HttpClient` の側の options の型 `HttpClientCommonOptions` はこれを `Omit` して `headers` と `params` にただのオブジェクトも許し、`observe` を足したものです。その型の話は[第 3 回](03-httpx-overload-types.md)で読みます。

## 2. 写さなかった欄の値

📄 `angular/packages/common/http/src/request.ts` L184–213 （▶ の行: 184, 189, 191, 196, 202, 207, 213）

```ts
184 ▶   readonly reportProgress: boolean = false;
185 │ 
186 │   /**
187 │    * When set to `true` a request emited against the `FetchBackend` will throw an error.
188 │    */
189 ▶   readonly reportUploadProgress: boolean = false;
190 │ 
191 ▶   readonly reportDownloadProgress: boolean = false;
192 │ 
193 │   /**
194 │    * Whether this request should be sent with outgoing credentials (cookies).
195 │    */
196 ▶   readonly withCredentials: boolean = false;
197 │ 
198 │   /**
199 │    *  The credentials mode of the request, which determines how cookies and HTTP authentication are handled.
200 │    *  This can affect whether cookies are sent with the request, and how authentication is handled.
201 │    */
202 ▶   readonly credentials!: RequestCredentials;
203 │ 
204 │   /**
205 │    * When using the fetch implementation and set to `true`, the browser will not abort the associated request if the page that initiated it is unloaded before the request is complete.
206 │    */
207 ▶   readonly keepalive: boolean = false;
208 │ 
209 │   /**
210 │    * Controls how the request will interact with the browser's HTTP cache.
211 │    * This affects whether a response is retrieved from the cache, how it is stored, or if it bypasses the cache altogether.
212 │    */
213 ▶   readonly cache!: RequestCache;
```

フィールドの宣言は 2 種類あります。184・189・191・196・207 行目の 5 つは `= false` の初期値を持ちます。202 行目の `credentials!` と 213 行目の `cache!` は `!`（「あとで必ず入る」と TypeScript に伝える印）だけで、初期値がありません。コンストラクタが写さなければ、実行時の値は `undefined` です。`priority`・`mode`・`redirect`・`referrer`・`integrity`・`referrerPolicy` も同じ形です。

📄 `angular/packages/common/http/src/request.ts` L215–249 （▶ の行: 218, 224, 230, 237, 243, 249）

```ts
215 │   /**
216 │    * Indicates the relative priority of the request. This may be used by the browser to decide the order in which requests are dispatched and resources fetched.
217 │    */
218 ▶   readonly priority!: RequestPriority;
219 │ 
220 │   /**
221 │    * The mode of the request, which determines how the request will interact with the browser's security model.
222 │    * This can affect things like CORS (Cross-Origin Resource Sharing) and same-origin policies.
223 │    */
224 ▶   readonly mode!: RequestMode;
225 │ 
226 │   /**
227 │    * The redirect mode of the request, which determines how redirects are handled.
228 │    * This can affect whether the request follows redirects automatically, or if it fails when a redirect occurs.
229 │    */
230 ▶   readonly redirect!: RequestRedirect;
231 │ 
232 │   /**
233 │    * The referrer of the request, which can be used to indicate the origin of the request.
234 │    * This is useful for security and analytics purposes.
235 │    * Value is a same-origin URL, "about:client", or the empty string, to set request's referrer.
236 │    */
237 ▶   readonly referrer!: string;
238 │ 
239 │   /**
240 │    * The integrity metadata of the request, which can be used to ensure the request is made with the expected content.
241 │    * A cryptographic hash of the resource to be fetched by request
242 │    */
243 ▶   readonly integrity!: string;
244 │ 
245 │   /**
246 │    * The referrer policy of the request, which can be used to specify the referrer information to be included with the request.
247 │    * This can affect the amount of referrer information sent with the request, and can be used to enhance privacy and security.
248 │    */
249 ▶   readonly referrerPolicy!: ReferrerPolicy;
```

218・224・230・237・243・249 行目、どれも `!` だけで初期値がありません。235 行目のコメントは referrer に「同じオリジンの URL、`about:client`、または空文字」を入れられると書いています。

> [!TIP]
> **新卒エンジニアへ**
>
> `undefined` のまま `fetch` に渡ると、ブラウザはその項目を「指定なし」として既定値を使います。たとえば `referrer` の既定値は `'about:client'`（ページの URL を Referer として送る）です。2 つ先の節の不具合は、ここが効いています。

## 3. コンストラクタが options を写す行

[不変なリクエストの章](../http/04-http-request-immutable.md)の 2 節で、コンストラクタが「第 3 引数と第 4 引数のどちらが options か」を決めるところまで読みました。その続きです。

📄 `angular/packages/common/http/src/request.ts` L318–344 （▶ の行: 319, 321–325, 328–329, 333, 337, 341）

```ts
318 │     // If options have been passed, interpret them.
319 ▶     if (options) {
320 │       // Normalize progress and credential flags.
321 ▶       this.reportProgress = !!options.reportProgress;
322 ▶       this.reportUploadProgress = !!options.reportUploadProgress;
323 ▶       this.reportDownloadProgress = !!options.reportDownloadProgress;
324 ▶       this.withCredentials = !!options.withCredentials;
325 ▶       this.keepalive = !!options.keepalive;
326 │ 
327 │       // Override default response type of 'json' if one is provided.
328 ▶       if (!!options.responseType) {
329 ▶         this.responseType = options.responseType;
330 │       }
331 │ 
332 │       // Override headers if they're provided.
333 ▶       if (options.headers) {
334 │         this.headers = options.headers;
335 │       }
336 │ 
337 ▶       if (options.context) {
338 │         this.context = options.context;
339 │       }
340 │ 
341 ▶       if (options.params) {
342 │         this.params = options.params;
343 │       }
344 │ 
```

1. **319 行目：options が無ければ、この節はまるごと飛ばす**

   `new HttpRequest('GET', '/x')` なら 2 節の初期値（`false` と `undefined`）のままです。
2. **321〜325 行目：真偽の 5 つは `!!` で必ず代入する**

   `!!x` は「x を true か false にそろえる」書き方です。options があれば、指定が無くても `!!undefined` で `false` が入ります。初期値と同じ `false` なので結果は変わりません。`keepalive: 1` のような真偽でない値も `true` にそろいます。
3. **328〜330 行目：responseType は値があるときだけ**

   空文字 `''` を渡しても、`!!''` は `false` なので、フィールドの宣言の既定値 `'json'` のままです。
4. **333〜343 行目：headers・context・params も値があるときだけ**

   ここで代入されなかったものは、コンストラクタの後半（[前の章](../http/04-http-request-immutable.md)の 2 節の引用）で空の `HttpHeaders`・`HttpContext`・`HttpParams` が作られます。

📄 `angular/packages/common/http/src/request.ts` L345–368 （▶ の行: 345, 349, 353, 357, 360–362, 367）

```ts
345 ▶       if (options.priority) {
346 │         this.priority = options.priority;
347 │       }
348 │ 
349 ▶       if (options.cache) {
350 │         this.cache = options.cache;
351 │       }
352 │ 
353 ▶       if (options.credentials) {
354 │         this.credentials = options.credentials;
355 │       }
356 │ 
357 ▶       if (typeof options.timeout === 'number') {
358 │         // XHR will ignore any value below 1. AbortSignals only accept unsigned integers.
359 │ 
360 ▶         if (options.timeout < 1 || !Number.isInteger(options.timeout)) {
361 ▶           throw new RuntimeError(
362 ▶             RuntimeErrorCode.INVALID_TIMEOUT_VALUE,
363 │             ngDevMode ? '`timeout` must be a positive integer value' : '',
364 │           );
365 │         }
366 │ 
367 ▶         this.timeout = options.timeout;
368 │       }
```

345・349・353 行目、`priority`・`cache`・`credentials` は値があるときだけ写します。どれも DOM の文字列の列挙なので、空文字は正しい値ではなく、これで困りません。

357 行目の `timeout` だけは「数かどうか」で見ます。0 は値があるときだけの判定（`if (options.timeout)`）だと「指定なし」に化けますが、`typeof` なら 0 も検査に回ります。360 行目で 1 より小さいか整数でなければ、361〜364 行目で `RuntimeError`（コード 2822）を投げます。358 行目のコメントのとおり、XHR は 1 未満を無視し、`AbortSignal` は符号なしの整数しか受け付けないからです。投げる場所はコンストラクタなので、**`http.get(url, { timeout: 0 })` は購読する前、`get()` を呼んだその場で例外になります**（`HttpClient.request` は呼ばれた時点で同期的に `new HttpRequest` します。[HttpClient.request の章](../http/03-http-client-request.md)の 2 節）。

📄 `angular/packages/common/http/src/request.ts` L369–392 （▶ の行: 370, 374, 378, 382–383, 386, 390–391）

```ts
369 │ 
370 ▶       if (options.mode) {
371 │         this.mode = options.mode;
372 │       }
373 │ 
374 ▶       if (options.redirect) {
375 │         this.redirect = options.redirect;
376 │       }
377 │ 
378 ▶       if (options.integrity) {
379 │         this.integrity = options.integrity;
380 │       }
381 │ 
382 ▶       if (options.referrer !== undefined) {
383 ▶         this.referrer = options.referrer;
384 │       }
385 │ 
386 ▶       if (options.referrerPolicy) {
387 │         this.referrerPolicy = options.referrerPolicy;
388 │       }
389 │ 
390 ▶       // We do want to assign transferCache even if it's falsy (false is valid value)
391 ▶       this.transferCache = options.transferCache;
392 │     }
```

370〜380 行目の `mode`・`redirect`・`integrity`、386 行目の `referrerPolicy` は値があるときだけ。**382 行目の `referrer` だけが `!== undefined`** で、空文字 `''` も写します。391 行目の `transferCache` は条件なしで代入します。390 行目のコメントのとおり `false`（「この要求は転送キャッシュを使わない」）が意味を持つからです。

| 判定 | 項目 | 空文字・0・false を渡すと |
| --- | --- | --- |
| `!!` で必ず代入（321〜325 行目） | reportProgress・reportUploadProgress・reportDownloadProgress・withCredentials・keepalive | `false` が入る（初期値と同じ） |
| 値があるときだけ（328〜386 行目） | responseType・headers・context・params・priority・cache・credentials・mode・redirect・integrity・referrerPolicy | 「指定なし」と同じ |
| `typeof === 'number'` と検査（357 行目） | timeout | 0 は例外（2822） |
| `!== undefined`（382 行目） | referrer | `''` がそのまま入る |
| 条件なし（391 行目） | transferCache | `false` がそのまま入る |

### referrer だけが違う理由：cd771d3712f

📄 `git show cd771d3712f -- packages/common/http/src/request.ts（抜粋）`

```
@@ -379,7 +379,7 @@ export class HttpRequest<T> implements HttpRequestOptions {
         this.integrity = options.integrity;
       }

-      if (options.referrer) {
+      if (options.referrer !== undefined) {
         this.referrer = options.referrer;
       }

@@ -555,7 +555,8 @@ export class HttpRequest<T> implements HttpRequestOptions {
     const credentials = update.credentials || this.credentials;
-    const referrer = update.referrer || this.referrer;
+
+    const referrer = update.referrer ?? this.referrer;
     const integrity = update.integrity || this.integrity;
```

2026-06-04 の修正です。それまでは 382 行目も `if (options.referrer)` で、空文字は「指定なし」になり、2 節の `undefined` のまま `fetch` に渡っていました。`fetch` の `referrer: ''` は「Referer ヘッダーを送らない」という意味の正しい値で、Angular のドキュメントも機密の要求ではそう書くよう案内しています。コミットの本文は「以前の truthy の判定は、この option が渡されなかったかのように扱っていた。そのため要求はブラウザの既定の referrer の振る舞いに戻っていた」と書いています。直したのはコンストラクタと `clone` の 2 か所です（`clone` は 5 節）。v22.1.0 に入っています。

## 4. urlWithParams：# の前に params を入れる

params があるとき、コンストラクタの最後で `urlWithParams`（実際に送る URL）を組み立てます。その行は[不変なリクエストの章](../http/04-http-request-immutable.md)の 2 節で 1 行ずつ読んだので、ここでは「どう変わったか」だけを見ます。

📄 `git show cb8ceb1dde6 -- packages/common/http/src/request.ts（抜粋）`

```
       } else {
+        // Strip the fragment (e.g. #bypass) from the URL before checking for existing query parameters.
+        ...
+        let urlWithoutFragment = url;
+        let fragment = '';
+        const hashIdx = url.indexOf('#');
+        if (hashIdx !== -1) {
+          fragment = url.substring(hashIdx);
+          urlWithoutFragment = url.substring(0, hashIdx);
+        }
+
         // Does the URL already have query parameters? Look for '?'.
-        const qIdx = url.indexOf('?');
+        const qIdx = urlWithoutFragment.indexOf('?');
 ...
-        const sep: string = qIdx === -1 ? '?' : qIdx < url.length - 1 ? '&' : '';
-        this.urlWithParams = url + sep + params;
+        const sep: string = qIdx === -1 ? '?' : qIdx < urlWithoutFragment.length - 1 ? '&' : '';
+        this.urlWithParams = urlWithoutFragment + sep + params + fragment;
```

2026-06-04 の修正（v22.1.0）。それまでは URL に `#`（フラグメント。ブラウザの中だけで使い、サーバーには送られない部分）があっても、その後ろに `?auth_token=…` を足していました。`'/api/data/123#bypass'` に params を付けると `'/api/data/123#bypass?auth_token=secret'` になり、params ごとフラグメントに入ってサーバーに届きません。コミットの本文は「サーバー側の検査をすり抜けうる」と書いています。直し方は「最初の `#` で 2 つに分け、前半で `?` を探し、params を足してから後半をつなぎ直す」です。最初の `#` で分けるので、`'#a#b'` は `#a#b` のまま後ろに残ります（spec は章末のテストの節）。

## 5. clone が受け継ぐ行

`clone` の前半は[前の章](../http/04-http-request-immutable.md)の 4 節の引用にあります。`update.x || this.x` が基本で、`keepalive`・`transferCache`・`timeout` だけが `??` でした。3 節の差分（下半分）のとおり、`referrer` の行も `??` になりました。残りの真偽の 4 つがここです。

📄 `angular/packages/common/http/src/request.ts` L573–580 （▶ の行: 576–579）

```ts
573 │ 
574 │     // Carefully handle the boolean options to differentiate between
575 │     // `false` and `undefined` in the update args.
576 ▶     const withCredentials = update.withCredentials ?? this.withCredentials;
577 ▶     const reportProgress = update.reportProgress ?? this.reportProgress;
578 ▶     const reportUploadProgress = update.reportUploadProgress ?? this.reportUploadProgress;
579 ▶     const reportDownloadProgress = update.reportDownloadProgress ?? this.reportDownloadProgress;
580 │ 
```

576〜579 行目、`withCredentials` と 3 つの進捗は `??`（左が `null` か `undefined` のときだけ右を使う）です。`req.clone({ withCredentials: false })` で `true` を `false` に戻せます。`||` だと `false` が「指定なし」になり、元の `true` が残ってしまいます。

`||` のまま残っている文字列の項目（`integrity` など）は、`clone` で空文字に戻せません。ただし `integrity` の空文字は `fetch` の既定値と同じ意味なので、送られる要求は変わりません。空文字に意味があるのは `referrer` だけで、だから clone でも `referrer` の行だけが直されました。

## 6. HttpClient から HttpRequest へ、HttpRequest から fetch へ

`HttpClient.request` は `new HttpRequest(first, url, body, { headers, context, params, … })` と 19 項目を 1 つずつ書いて渡します（[HttpClient.request の章](../http/03-http-client-request.md)の 2 節）。`post`・`put`・`patch` はその手前で `addBody(options, body)` を通ります。そこで起きた不具合がこれです。

📄 `git show c092a002e40 -- packages/common/http/src/client.ts（抜粋）`

```
@@ -43,24 +43,7 @@
 function addBody<T>(options: HttpClientCommonOptions, body: T | null): any {
   return {
     body,
-    headers: options.headers,
-    context: options.context,
-    observe: options.observe,
-    params: options.params,
-    reportProgress: options.reportProgress,
-    responseType: options.responseType,
-    withCredentials: options.withCredentials,
-    ...（credentials・transferCache・timeout・keepalive・priority・cache・mode・
-         redirect・integrity・referrer・referrerPolicy も 1 行ずつ）
+    ...options,
   };
 }
```

2026-06-08 の修正（#69241、v22.1.0）。`addBody` は項目を 1 つずつ書き写していて、v22.0 で増えた `reportUploadProgress` と `reportDownloadProgress` を写し忘れていました。`http.post(url, body, { reportDownloadProgress: true })` の `HttpRequest` は `reportDownloadProgress: false` になります（`get` は `addBody` を通らないので問題なし）。修正は書き写しをやめて `...options`（スプレッド構文。オブジェクトの全部のプロパティを写す）にしたことです。コミット本文は「addBody が引数を正しく渡していなかった」の 1 行です。

> [!WARNING]
> **ハマりどころ**
>
> **この修正の副作用（本家の不具合らしきもの）。**直したあとの `addBody` は `{ body, ...options }` の順で書かれています。スプレッドはあとに書いたものが勝つので、**options に `body` というプロパティがあると、post の第 2 引数の body を上書きします**。options を変数で渡すと TypeScript の余分なプロパティの検査（オブジェクトをその場に書いたときだけ働く）が効かないので、型検査も通ります。
>
> 📄 `22.1.6 で確かめた式`
>
> ```
> // 22.1.6 の配布物。HttpClientTestingBackend で受け取った request.body を見る
> const deleteOptions = { body: { id: 1 }, headers: { 'X-A': '1' } };
> http.delete('/p', deleteOptions);               // body は { id: 1 }（意図どおり）
> http.post('/p', { real: 1 }, deleteOptions);    // 型検査は通る（Observable<Object>）
> // → 送られた body は { id: 1 }。第 2 引数の { real: 1 } ではない
>
> const shared = { headers: { 'X-A': '1' }, body: undefined };
> http.post('/p', { real: 1 }, shared);           // → 送られた body は null
> ```
>
> `delete` の options の型には `body?: any | null` があるので、`delete` 用の options を `post` に使い回すと起きます。`body: undefined` を持つ options でも、`request` の `options.body !== undefined ? options.body : null` で `null` になります。v22.0 までの書き写し版は `body` を写さなかったので起きません。確かめ方と、既存の issue が無いことは章末に書きます。

`HttpRequest` から先は、`FetchBackend` の `createRequestInit` が `fetch` の第 2 引数を作ります（[FetchBackend の章](../http/06-http-backend-fetch.md)）。対応は次のとおりです。

| HttpRequest の欄 | fetch に渡るもの |
| --- | --- |
| urlWithParams | 第 1 引数（`#` 以降も付いたまま。`fetch` 自身がフラグメントを送らない） |
| keepalive・cache・priority・mode・redirect・referrer・integrity・referrerPolicy | 同じ名前でそのまま |
| credentials と withCredentials | `credentials`。`withCredentials: true` なら `'include'` に上書き（両方あると開発モードで警告） |
| headers | 名前ごとに値を `,` でつないだ 1 本の文字列（[第 2 回](02-httpx-headers-params-updates.md)） |
| timeout | `signal`（`AbortController` と `setTimeout`） |
| reportUploadProgress | `true` なら `fetch` を呼ぶ前にエラー（コード 2824） |
| responseType・transferCache・reportDownloadProgress | 渡さない（応答の読み方と、インターセプタが使う） |

## 7. DEMO：options を選んで、本物の HttpClient で送る

> **🧪 DEMO — options はどう写り、fetch に何が渡るか**
>
> ボタンを押すと、このページで `@angular/common/http` を読み込み、`provideHttpClient(withNoXsrfProtection())` で作った本物の `HttpClient` から 1 回送ります。`HttpBackend` は「受け取った `HttpRequest` を記録して、本物の `FetchBackend` に渡すだけ」のものに差し替えています。`FetchBackend` が呼ぶ `fetch` は、その間だけ「引数を記録して `{"ok":true}` を返す関数」に替えるので、ネットワークには出ません。post と patch の body は `{ a: 1 }` です。
>
> options を選んで「送る」を押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/httpx-request-options)

試すと分かることです。

1. **referrer を「''」にすると、HttpRequest にも init にも `''` が入る**

   382 行目の `!== undefined` のおかげです。「指定なし」では両方 `undefined` です。「インターセプタで `req.clone()` を通す」を付けても `''` のまま（clone の `referrer` の行の `??`）。
2. **post で reportDownloadProgress を付けると、HttpRequest の欄が true**

   修正後の `addBody` が `...options` で写すからです。v22.0 の配布物ならここが `false` でした。
3. **URL に # があっても、params は # の前に入る**

   `'/api/items?lang=ja#top'` と params の組み合わせで、`urlWithParams` は `'/api/items?lang=ja&page=2&tag=a&tag=b#top'` です。`'#a#b'` は最初の `#` で分かれます。
4. **timeout に 0 や 1.5 を選ぶと、バックエンドに届く前に例外**

   360〜364 行目です。本番ビルドでは開発モードの文が消えるので、例外の文はコード（`NG02822`）だけになります。
5. **reportUploadProgress を付けると、fetch は呼ばれずにエラー**

   HttpRequest の欄は `true` ですが、`FetchBackend` が `fetch` の前にエラー（2824）を流します。送る側の進捗が要るなら `withXhr()` です（[HttpXhrBackend の章](../http/07-http-backend-xhr.md)）。
6. **withCredentials は init で credentials: 'include' になる**

   headers の `['1', '2']` は init で `"1,2"` の 1 本です。

## ここまでの呼び出し

- 👤 `http.post(url, body, options)` — あなたのコード
  - `addBody(options, body)` — client.ts — *{ body, ...options }（c092a002e40）*
  - `this.request('POST', url, …)` — client.ts（post の本体）
    - `new HttpRequest(first, url, body, {19 項目})` — client.ts（request の本体）
      - `constructor` の options の写し — request.ts 319〜392 — *!!・値があるか・!== undefined・typeof*
      - `urlWithParams` — request.ts（コンストラクタの最後） — *# の前に params（cb8ceb1dde6）*
    - `req.clone(update)`（インターセプタ） — request.ts（clone） — *referrer は ??（cd771d3712f）*
    - `FetchBackend.createRequestInit(req)` — fetch.ts — *RequestInit を作る*
      - `fetch(req.urlWithParams, { signal, ...init })` — fetch.ts

## テストと直し方

### spec と it

| ファイル | describe / it | 行 | この章のどこ |
| --- | --- | --- | --- |
| request\_spec.ts | `HttpRequest` › `constructor` › `should allow setting … option`（keepalive・priority・cache・timeout・credentials・integrity・referrer・referrerPolicy） | 67〜105 | 3 節 |
| request\_spec.ts | `should preserve an empty string referrer (used to suppress the Referer header)` | 98 | 3 節（cd771d3712f が足した） |
| request\_spec.ts | `clone() copies the request` › `and preserves an existing empty string referrer when the update omits it`・`and can update the referrer to an empty string` | 201・205 | 5 節（同上） |
| request\_spec.ts | `parameter handling` › `appends parameters before a …` の 4 つ | 300〜316 | 4 節（cb8ceb1dde6 が足した） |
| client\_spec.ts | `HttpClient` › `makes a basic request` › `post with a split progress events enabled` | 148 | 6 節（c092a002e40 が足した） |
| client\_spec.ts | `makes a POST request` › `validates all fetch API options are properly handled` | 180 | 6 節 |

📄 `angular/packages/common/http/test/request_spec.ts` L94–113 （▶ の行: 98–100, 106, 111–112）

```ts
 94 │     it('should allow setting referrer option', () => {
 95 │       const req = new HttpRequest('GET', '/test', {referrer: 'about:client'});
 96 │       expect(req.referrer).toBe('about:client');
 97 │     });
 98 ▶     it('should preserve an empty string referrer (used to suppress the Referer header)', () => {
 99 ▶       const req = new HttpRequest('GET', '/test', {referrer: ''});
100 ▶       expect(req.referrer).toBe('');
101 │     });
102 │     it('should allow setting referrerPolicy option', () => {
103 │       const req = new HttpRequest('GET', '/test', {referrerPolicy: 'no-referrer'});
104 │       expect(req.referrerPolicy).toBe('no-referrer');
105 │     });
106 ▶     it('should allow setting upload and download progress options', () => {
107 │       const req = new HttpRequest('GET', '/test', {
108 │         reportUploadProgress: true,
109 │         reportDownloadProgress: true,
110 │       });
111 ▶       expect(req.reportUploadProgress).toBe(true);
112 ▶       expect(req.reportDownloadProgress).toBe(true);
113 │     });
```

98〜101 行目が空文字の referrer の it です。`toBe('')` で確かめているので、修正前（`undefined`）なら落ちます。106〜113 行目は `HttpRequest` を直接作って 2 つの進捗を確かめる it で、こちらは `addBody` を通らないので、#69241 の不具合のときも通っていました。

📄 `angular/packages/common/http/test/request_spec.ts` L198–207 （▶ の行: 202–203, 206）

```ts
198 │     it('and updates the referrer', () => {
199 │       expect(req.clone({referrer: 'https://example.com'}).referrer).toBe('https://example.com');
200 │     });
201 │     it('and preserves an existing empty string referrer when the update omits it', () => {
202 ▶       const emptyReferrerReq = new HttpRequest('GET', '/test', {referrer: ''});
203 ▶       expect(emptyReferrerReq.clone().referrer).toBe('');
204 │     });
205 │     it('and can update the referrer to an empty string', () => {
206 ▶       expect(req.clone({referrer: ''}).referrer).toBe('');
207 │     });
```

202〜203 行目は「空文字を持つ要求を引数なしで clone しても空文字のまま」、206 行目は「clone で空文字に変えられる」。clone の `referrer` の行の `??` の、両方の向きです。

📄 `angular/packages/common/http/test/request_spec.ts` L300–317 （▶ の行: 302–303, 310–311, 314–315）

```ts
300 │     it('appends parameters before a fragment', () => {
301 │       const fragmentParams = new HttpParams({fromString: 'auth_token=secret'});
302 ▶       const req = baseReq.clone({params: fragmentParams, url: '/api/data/123#bypass'});
303 ▶       expect(req.urlWithParams).toEqual('/api/data/123?auth_token=secret#bypass');
304 │     });
305 │     it('appends parameters before a URL fragment', () => {
306 │       const req = baseReq.clone({params, url: '/test#fragment'});
307 │       expect(req.urlWithParams).toEqual('/test?test=true#fragment');
308 │     });
309 │     it('appends parameters before a URL fragment when URL has a query string', () => {
310 ▶       const req = baseReq.clone({params, url: '/test?other=false#fragment'});
311 ▶       expect(req.urlWithParams).toEqual('/test?other=false&test=true#fragment');
312 │     });
313 │     it('appends parameters before a URL fragment when URL has multiple hash characters', () => {
314 ▶       const req = baseReq.clone({params, url: '/test#frag1#frag2'});
315 ▶       expect(req.urlWithParams).toEqual('/test?test=true#frag1#frag2');
316 │     });
317 │   });
```

303 行目がコミット本文の例そのもの（`#bypass`）です。311 行目は既存の `?` があるとき `&` でつなぐこと、315 行目は `#` が 2 つあるとき最初で分けることを確かめています。

📄 `angular/packages/common/http/test/client_spec.ts` L138–157 （▶ の行: 140, 148, 150, 153–154）

```ts
138 │     it('with split progress events enabled', (done) => {
139 │       client
140 ▶         .get('/test', {reportUploadProgress: true, reportDownloadProgress: true})
141 │         .subscribe(() => done());
142 │       const req = backend.expectOne('/test');
143 │       expect(req.request.reportUploadProgress).toBe(true);
144 │       expect(req.request.reportDownloadProgress).toBe(true);
145 │       req.flush({});
146 │     });
147 │ 
148 ▶     it('post with a split progress events enabled', (done) => {
149 │       client
150 ▶         .post('/test', {}, {reportUploadProgress: true, reportDownloadProgress: true})
151 │         .subscribe(() => done());
152 │       const req = backend.expectOne('/test');
153 ▶       expect(req.request.reportUploadProgress).toBe(true);
154 ▶       expect(req.request.reportDownloadProgress).toBe(true);
155 │       req.flush({});
156 │     });
157 │   });
```

138〜146 行目の `get` の it はもとからありました。`get` は `addBody` を通らないので、これだけでは `post` の写し忘れを見つけられません。c092a002e40 は 148〜156 行目の `post` 版を足しました。

📄 `angular/packages/common/http/test/client_spec.ts` L180–216 （▶ の行: 182, 185, 197, 214）

```ts
180 │     it('validates all fetch API options are properly handled', (done) => {
181 │       client
182 ▶         .post(
183 │           '/test',
184 │           {},
185 ▶           {
186 │             credentials: 'include',
187 │             cache: 'force-cache',
188 │             priority: 'high',
189 │             mode: 'cors',
190 │             redirect: 'follow',
191 │             referrer: 'www.example.com',
192 │             integrity: 'sha256-abc',
193 │             timeout: 1000,
194 │             keepalive: true,
195 │             withCredentials: true,
196 │             referrerPolicy: 'no-referrer',
197 ▶           },
198 │         )
199 │         .subscribe(() => {
200 │           done();
201 │         });
202 │       const testReq = backend.expectOne('/test');
203 │       expect(testReq.request.credentials).toBe('include');
204 │       expect(testReq.request.cache).toBe('force-cache');
205 │       expect(testReq.request.priority).toBe('high');
206 │       expect(testReq.request.mode).toBe('cors');
207 │       expect(testReq.request.redirect).toBe('follow');
208 │       expect(testReq.request.referrer).toBe('www.example.com');
209 │       expect(testReq.request.referrerPolicy).toBe('no-referrer');
210 │       expect(testReq.request.integrity).toBe('sha256-abc');
211 │       expect(testReq.request.timeout).toBe(1000);
212 │       expect(testReq.request.keepalive).toBe(true);
213 │       expect(testReq.request.withCredentials).toBe(true);
214 ▶       expect(testReq.request.body).toEqual({});
215 │       testReq.flush({});
216 │     });
```

「fetch の option をすべて確かめる」という名前の it ですが、185〜197 行目に進捗の 2 つが無く、`addBody` の写し忘れを見逃していました。214 行目は `body` を `{}` と確かめていますが、options に `body` を入れた場合の it はありません。6 節の副作用を確かめる it はまだ無い、ということです。

### 手元で走らせた結果

../angular（22.2.0-next.7）で `pnpm bazel test //packages/common/http/test:test //packages/common/http/test:test_web --nocache_test_results --test_output=all` を走らせ、Node は「410 specs, 0 failures」、Chromium と Firefox はそれぞれ「410 passed, 0 failed」、全体 3.7 秒でした（2026-11-06、2 回目以降でビルド済み。ログは scratchpad/httpx-logs/a-all.log）。

Node の `:test` には `--test_arg=--filter=HttpRequest` が効き、「60 specs, 0 failures」でした（1.6 秒、a-filter-request.log）。request\_spec.ts の it は 59 個で、残りの 1 つは resource\_spec.ts 101 行目の `should support the suite of HttpRequest APIs` です。絞り込みは describe と it の名前をつないだ全体の中に、その文字列があるかで決まります。

### 直すとしたら

- 6 節の body の上書きは、client.ts の `addBody` で `{ ...options, body }` の順にすれば、第 2 引数の body が必ず勝ちます。spec は client\_spec.ts の `makes a POST request`（158 行目の describe）に「options に body があっても第 2 引数を送る」it を足す形です。
- 3 節の「値があるときだけ」の項目に、空文字や 0 が意味を持つものがほかに無いかは、項目を足すたびに見直す必要があります。`referrer` の修正はコンストラクタの 382 行目と clone の行の 2 か所を同じコミットで直し、spec もコンストラクタと clone の両方に足しました。この「対になる場所を一緒に直す」が、この 3 本の修正に共通する形です。
- 3 本のコミットはどれも、1 つの振る舞いだけを直し、src の数行と spec の it を 1〜4 個足しています。issue の全体と傾向は[第 6 回](06-httpx-tests-issues.md)にまとめます。本家に PR を出すことは勧めません。

**本番ビルドでデモを動かした結果（2026-11-06）。**ヘッドレスの Chrome（HeadlessChrome/155.0.8043.0）で本番ビルドのこのページを開き、7 通りの options で「送る」を押しました。既定の post（'/api/items?lang=ja#top'・params はオブジェクト・referrer ''・reportDownloadProgress）は、HttpRequest も init も referrer が ''、reportDownloadProgress は true、urlWithParams と fetch の第 1 引数は '/api/items?lang=ja&page=2&tag=a&tag=b#top' でした。インターセプタで clone を通しても同じでした。get の '/api/items#a#b' と new HttpParams().set('q', 'a b') は '/api/items?q=a%20b#a#b'、withCredentials: true は init で credentials: 'include'、headers の \['1', '2'\] は init で "1,2" でした。timeout 0 と 1.5 は HttpRequest を作る時点の例外で、本番では文が消えて「NG02822」だけ、reportUploadProgress は fetch が呼ばれずに「NG02824」のエラーでした。/api/ への通信は 0 件、コンソールの警告とエラーは 0 件です（scratchpad/a-httpx/verify/verify.mjs、prod.json）。初めて押したときに読み込まれた JS は 680 バイトと 706 バイトの 2 つだけで、どちらも main と共有の chunk から名前を引き直すだけのものでした。このサイトの main には、provideClientHydration（platform-browser.mjs が ɵwithHttpTransferCache を @angular/common/http から import している）のために、FetchBackend や HttpClient を含む @angular/common/http の本体が、この章とは関係なくもともと入っています（2026-11-02 の古い本番ビルドの main にも JSONP\_CALLBACK の文字列がありました）。この章のデモの文字列（'/api/items' など）は main に 0 件で、章の chunk にだけあります。

## 聞かれそうな質問

**Q. `referrer: ''` を渡したのに Referer ヘッダーが送られます。なぜですか？**

v22.0 以前を使っているなら、382 行目が `if (options.referrer)` だったので空文字が「指定なし」になり、`fetch` にも `undefined` が渡って既定の `'about:client'` が使われていました。cd771d3712f（v22.1.0）でコンストラクタは `!== undefined`、clone の `referrer` の行は `??` になり、空文字がそのまま `fetch` に届きます。

**Q. `http.get(url, { timeout: 0 })` はいつエラーになりますか？**

`get()` を呼んだその場です。`HttpClient.request` は購読を待たずに `new HttpRequest` し、コンストラクタの 357〜365 行目が 1 未満か整数でない値で `RuntimeError`（2822）を投げます。Observable の error ではなく、普通の例外として呼び出し元に飛びます。

**Q. clone で `withCredentials: false` を渡すと、元の `true` は消えますか？**

消えます。576 行目が `update.withCredentials ?? this.withCredentials` なので、`false` は `false` として使われます。`||` で書かれている項目（`integrity` など）は空文字で消せません。

**Q. post で `reportDownloadProgress: true` が効かなかったのはなぜですか？**

v22.0 の `addBody` が options を 1 項目ずつ書き写していて、新しい 2 項目を写していなかったからです（#69241）。c092a002e40（v22.1.0）で `...options` に変わりました。`get` は `addBody` を通らないので、最初から効いていました。

**Q. URL の # の後ろに params が付くことはありますか？**

v22.1.0 からはありません。コンストラクタは最初の `#` で URL を 2 つに分け、前半に `?` か `&` で params を足してから後半をつなぎます（4 節の差分）。行の説明は[不変なリクエストの章](../http/04-http-request-immutable.md)の 2 節です。

## 読み終えて

- コンストラクタの options の写し方は項目ごとに 5 通りあります（`!!`・値があるか・`typeof`・`!== undefined`・条件なし）。空文字や 0 や false に意味がある項目だけ、判定が違います。
- 写さなかった欄は `undefined` で、`fetch` に渡るとブラウザの既定値になります。referrer の不具合はこれが原因でした。
- 3 本の修正（cd771d3712f・c092a002e40・cb8ceb1dde6）は、どれも src の数行と、対応する spec の it を足しただけの小さなコミットです。
- `addBody` の `{ body, ...options }` は、options にある `body` が第 2 引数に勝つ並びです。

---

← 前: [出す前の点検：8 つの直しをどう並べるか](../fix/10-fix-before-issue.md)  
次: [headers と params の更新の規則：append・set・delete と遅れた適用](02-httpx-headers-params-updates.md) →
