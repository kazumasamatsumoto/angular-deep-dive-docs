[目次](../README.md) › [HttpClient の内側](README.md) › 第 7 回 / 全 12 回

# HttpXhrBackend：XMLHttpRequest のイベントと、アップロードの進捗

> HttpXhrBackend.handle が XMLHttpRequest を開いてヘッダーを付け、load / error / timeout / abort / progress / upload.progress のリスナーを登録する行、ヘッダー文字列の解析、JSON の XSSI 接頭辞（)\]}'）を剥がす行、reportProgress、購読解除で abort してリスナーを外す行。FetchBackend との違い（アップロードの進捗が取れるかなど）を表にする。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/http-backend-xhr)

---

`provideHttpClient(withXhr())` と書くと、[第 6 回](06-http-backend-fetch.md)の `FetchBackend` の代わりに `HttpXhrBackend` が通信します。中で使うのは `fetch` より古いブラウザ API の `XMLHttpRequest`（XHR）です。この章では `HttpXhrBackend.handle` が XHR を開いてヘッダーを付け、`load` / `error` / `timeout` / `abort` / `progress` / `upload.progress` のリスナーを登録し、購読解除でそれを外して `abort()` するまでを 1 行ずつ追います。途中で JSON の XSSI 接頭辞 `)]}'` を剥がす行も読みます。最後に `FetchBackend` との違いを表にします。

読む対象は `packages/common/http/src/xhr.ts`（448 行）が中心で、XHR を作る側の `packages/common/src/xhr.ts` と、サーバー用の `packages/platform-server/src/http.ts` を少し読みます。

1. [1. 概観](01-http-overview.md)
2. [2. provideHttpClient と features](02-http-provide.md)
3. [3. HttpClient.request](03-http-client-request.md)
4. [4. 不変なリクエスト](04-http-request-immutable.md)
5. [5. インターセプタの連鎖](05-http.md)
6. [6. FetchBackend](06-http-backend-fetch.md)
7. **7. HttpXhrBackend**（この章）
8. [8. HttpEvent とエラー](08-http-response-errors.md)
9. [9. XSRF 対策](09-http-xsrf.md)
10. [10. JSONP](10-http-jsonp.md)
11. [11. SSR の転送キャッシュ](11-http-transfer-cache.md)
12. [12. テスト用バックエンド](12-http-testing.md)

## 1. HttpXhrBackend と XhrFactory

`withXhr()` は `HttpXhrBackend` を provide し、`HttpBackend` をそれに `useExisting` で向けるだけの feature です（[第 2 回](02-http-provide.md)で引用済み）。features は `provideHttpClient` の既定の providers の後ろに足されるので、既定の `HttpBackend`（`FetchBackend`）が後勝ちで上書きされます。

📄 `angular/packages/common/http/src/xhr.ts` L100–118 （▶ の行: 107, 109, 113, 115–116）

```ts
100 │ /**
101 │  * Uses `XMLHttpRequest` to send requests to a backend server.
102 │  * @see {@link HttpHandler}
103 │  * @see {@link JsonpClientBackend}
104 │  *
105 │  * @publicApi
106 │  */
107 ▶ @Injectable({providedIn: 'root'})
108 │ export class HttpXhrBackend implements HttpBackend {
109 ▶   private readonly tracingService: TracingService<TracingSnapshot> | null = inject(TracingService, {
110 │     optional: true,
111 │   });
112 │ 
113 ▶   constructor(private xhrFactory: XhrFactory) {}
114 │ 
115 ▶   private maybePropagateTrace<T extends Function>(fn: T): T {
116 ▶     return this.tracingService?.propagate ? this.tracingService.propagate(fn) : fn;
117 │   }
118 │ 
```

1. **107 行目：`providedIn: 'root'`**

   `FetchBackend` の `@Service()` と違い、古い書き方の `@Injectable` です。
2. **113 行目：`XhrFactory` をコンストラクタで受け取る**

   `new XMLHttpRequest()` を直接書かず、工場に作らせます。ブラウザとサーバーで作り方を替えるためです（下の 2 つの引用）。
3. **109〜117 行目：`TracingService` があればコールバックを包む**

   `TracingService` は Angular 内部のトレース用の差し込み口（`core/src/application/tracing.ts`）で、`propagate(fn)` は「今のトレースの文脈を `fn` に引き継ぐ」関数です。提供されていなければ 116 行目で `fn` をそのまま返すので、ふつうのアプリでは何もしません。5〜7 節のリスナーはすべてこの `maybePropagateTrace` を通して作られます。

📄 `angular/packages/common/src/xhr.ts` L11–29 （▶ の行: 14, 17, 26–28）

```ts
11 │ /**
12 │  * A factory for `HttpXhrBackend` that uses the `XMLHttpRequest` browser API.
13 │  */
14 ▶ @Service()
15 │ export class BrowserXhr implements XhrFactory {
16 │   build(): XMLHttpRequest {
17 ▶     return new XMLHttpRequest();
18 │   }
19 │ }
20 │ 
21 │ /**
22 │  * A wrapper around the `XMLHttpRequest` constructor.
23 │  *
24 │  * @publicApi
25 │  */
26 ▶ @Injectable({providedIn: 'root', useExisting: BrowserXhr})
27 ▶ export abstract class XhrFactory {
28 ▶   abstract build(): XMLHttpRequest;
29 │ }
```

26 行目、`XhrFactory` は `providedIn: 'root'` で `BrowserXhr` を `useExisting` する抽象クラスです。17 行目の `BrowserXhr.build()` は `new XMLHttpRequest()` を返すだけです。この章の DEMO はこの `XhrFactory` を自作のものに差し替え、本物の XHR を作りつつ、`HttpXhrBackend` がそれに何を呼んだかを記録しています。

## 2. handle の入口：JSONP の検査、XHR で使えない設定の警告、サーバー用の読み込み

📄 `angular/packages/common/http/src/xhr.ts` L119–153 （▶ の行: 127–129, 136, 141, 148–150, 152–153）

```ts
119 │   /**
120 │    * Processes a request and returns a stream of response events.
121 │    * @param req The request object.
122 │    * @returns An observable of the response events.
123 │    */
124 │   handle(req: HttpRequest<any>): Observable<HttpEvent<any>> {
125 │     // Quick check to give a better error message when a user attempts to use
126 │     // HttpClient.jsonp() without installing the HttpClientJsonpModule
127 ▶     if (req.method === 'JSONP') {
128 ▶       throw new RuntimeError(
129 ▶         RuntimeErrorCode.MISSING_JSONP_MODULE,
130 │         (typeof ngDevMode === 'undefined' || ngDevMode) &&
131 │           `Cannot make a JSONP request without JSONP support. To fix the problem, either add the \`withJsonpSupport()\` call (if \`provideHttpClient()\` is used) or import the \`HttpClientJsonpModule\` in the root NgModule.`,
132 │       );
133 │     }
134 │ 
135 │     // Validate that the request is compatible with the XHR backend.
136 ▶     ngDevMode && validateXhrCompatibility(req);
137 │ 
138 │     // Check whether this factory has a special function to load an XHR implementation
139 │     // for various non-browser environments. We currently limit it to only `ServerXhr`
140 │     // class, which needs to load an XHR implementation.
141 ▶     const xhrFactory: XhrFactory & {ɵloadImpl?: () => Promise<void>} = this.xhrFactory;
142 │     const source: Observable<void | null> =
143 │       // Note that `ɵloadImpl` is never defined in client bundles and can be
144 │       // safely dropped whenever we're running in the browser.
145 │       // This branching is redundant.
146 │       // The `ngServerMode` guard also enables tree-shaking of the `from()`
147 │       // function from the common bundle, as it's only used in server code.
148 ▶       typeof ngServerMode !== 'undefined' && ngServerMode && xhrFactory.ɵloadImpl
149 ▶         ? from(xhrFactory.ɵloadImpl())
150 ▶         : of(null);
151 │ 
152 ▶     return source.pipe(
153 ▶       switchMap(() => {
```

1. **127〜133 行目：`JSONP` は投げる**

   `HttpClient.jsonp()` は `method: 'JSONP'` のリクエストを作ります。`withJsonpSupport()` のインターセプタがそれを途中で取らなかったときだけここまで来るので、設定忘れとして `MISSING_JSONP_MODULE` を投げます（[第 10 回](10-http-jsonp.md)）。
2. **136 行目：開発ビルドだけ、XHR で使えない設定を警告**

   中身は次の 2 つの引用です。
3. **141〜150 行目：サーバーなら XHR の実装を先に読み込む**

   148 行目、`ngServerMode` が `true` で、工場が `ɵloadImpl` を持っているときだけ、149 行目で `from(Promise)` にします。ブラウザでは 150 行目の `of(null)` です。143〜147 行目のコメントのとおり、ブラウザ用のバンドルでは `ngServerMode` が定数なので、`from()` ごと消えます。
4. **152〜153 行目：読み込みが済んでから本体へ**

   `switchMap` で、上の Observable が値を出したあとに 3 節以降の `new Observable` を購読します。ブラウザでは `of(null)` が同期に値を出すので、subscribe の中で同期に本体まで進みます。

📄 `angular/packages/common/http/src/xhr.ts` L37–64 （▶ の行: 38, 44, 50, 54, 58, 62）

```ts
37 │ 
38 ▶ const XSSI_PREFIX = /^\)\]\}',?\n/;
39 │ 
40 │ /**
41 │  * Validates whether the request is compatible with the XHR backend.
42 │  * Show a warning if the request contains options that are not supported by XHR.
43 │  */
44 ▶ function validateXhrCompatibility(req: HttpRequest<any>) {
45 │   const unsupportedOptions: {
46 │     property: keyof HttpRequest<any>;
47 │     errorCode: RuntimeErrorCode;
48 │   }[] = [
49 │     {
50 ▶       property: 'keepalive',
51 │       errorCode: RuntimeErrorCode.KEEPALIVE_NOT_SUPPORTED_WITH_XHR,
52 │     },
53 │     {
54 ▶       property: 'cache',
55 │       errorCode: RuntimeErrorCode.CACHE_NOT_SUPPORTED_WITH_XHR,
56 │     },
57 │     {
58 ▶       property: 'priority',
59 │       errorCode: RuntimeErrorCode.PRIORITY_NOT_SUPPORTED_WITH_XHR,
60 │     },
61 │     {
62 ▶       property: 'mode',
63 │       errorCode: RuntimeErrorCode.MODE_NOT_SUPPORTED_WITH_XHR,
64 │     },
```

📄 `angular/packages/common/http/src/xhr.ts` L65–98 （▶ の行: 66, 70, 74, 78, 82, 88–90, 93）

```ts
65 │     {
66 ▶       property: 'redirect',
67 │       errorCode: RuntimeErrorCode.REDIRECT_NOT_SUPPORTED_WITH_XHR,
68 │     },
69 │     {
70 ▶       property: 'credentials',
71 │       errorCode: RuntimeErrorCode.CREDENTIALS_NOT_SUPPORTED_WITH_XHR,
72 │     },
73 │     {
74 ▶       property: 'integrity',
75 │       errorCode: RuntimeErrorCode.INTEGRITY_NOT_SUPPORTED_WITH_XHR,
76 │     },
77 │     {
78 ▶       property: 'referrer',
79 │       errorCode: RuntimeErrorCode.REFERRER_NOT_SUPPORTED_WITH_XHR,
80 │     },
81 │     {
82 ▶       property: 'referrerPolicy',
83 │       errorCode: RuntimeErrorCode.REFERRER_POLICY_NOT_SUPPORTED_WITH_XHR,
84 │     },
85 │   ];
86 │ 
87 │   // Check each unsupported option and warn if present
88 ▶   for (const {property, errorCode} of unsupportedOptions) {
89 ▶     if (req[property]) {
90 ▶       console.warn(
91 │         formatRuntimeError(
92 │           errorCode,
93 ▶           `Angular detected that a \`HttpClient\` request with the \`${property}\` option was sent using XHR, which does not support it. To use the \`${property}\` option, use the Fetch API by removing \`withXhr()\` from the \`provideHttpClient()\` call.`,
94 │         ),
95 │       );
96 │     }
97 │   }
98 │ }
```

50〜82 行目の 9 つ（`keepalive`・`cache`・`priority`・`mode`・`redirect`・`credentials`・`integrity`・`referrer`・`referrerPolicy`）は、`FetchBackend` なら `RequestInit` にそのまま写す項目です（[第 6 回](06-http-backend-fetch.md) 4 節）。88〜89 行目、リクエストにどれかが付いていれば 90 行目で `console.warn` し、93 行目の文面で「`withXhr()` を外せ」と案内します。**投げはしません**。設定はそのまま無視されて通信は続きます。

## 3. XHR を開き、ヘッダーと responseType を付ける

📄 `angular/packages/common/http/src/xhr.ts` L154–183 （▶ の行: 155, 158–161, 165, 168–169, 173–174, 177, 181–182）

```ts
154 │         // Everything happens on Observable subscription.
155 ▶         return new Observable((observer: Observer<HttpEvent<any>>) => {
156 │           // Start by setting up the XHR object with request method, URL, and withCredentials
157 │           // flag.
158 ▶           const xhr = xhrFactory.build();
159 ▶           xhr.open(req.method, req.urlWithParams);
160 ▶           if (req.withCredentials) {
161 ▶             xhr.withCredentials = true;
162 │           }
163 │ 
164 │           // Add all the requested headers.
165 ▶           req.headers.forEach((name, values) => xhr.setRequestHeader(name, values.join(',')));
166 │ 
167 │           // Add an Accept header if one isn't present already.
168 ▶           if (!req.headers.has(ACCEPT_HEADER)) {
169 ▶             xhr.setRequestHeader(ACCEPT_HEADER, ACCEPT_HEADER_VALUE);
170 │           }
171 │ 
172 │           // Auto-detect the Content-Type header if one isn't present already.
173 ▶           if (!req.headers.has(CONTENT_TYPE_HEADER)) {
174 ▶             const detectedType = req.detectContentTypeHeader();
175 │             // Sometimes Content-Type detection fails.
176 │             if (detectedType !== null) {
177 ▶               xhr.setRequestHeader(CONTENT_TYPE_HEADER, detectedType);
178 │             }
179 │           }
180 │ 
181 ▶           if (req.timeout) {
182 ▶             xhr.timeout = req.timeout;
183 │           }
```

1. **155 行目：subscribe されたら動く**

   154 行目のコメントのとおり、ここから先はすべて購読のときに起きます。購読 1 回につき XHR が 1 つです。
2. **158〜159 行目：工場で作って `open`**

   `open(method, url)` は送信先を決めるだけで、まだ送りません。URL は `params` を付けた `urlWithParams` です。
3. **160〜162 行目：`withCredentials`**

   XHR が持つ cookie の設定はこの真偽値だけです。fetch 版の `credentials: 'omit' | 'same-origin' | 'include'` は 2 節の警告の対象です。
4. **165 行目：ヘッダーを 1 つずつ `setRequestHeader`**

   同じ名前の複数の値は `,` でつなぎます。fetch 版と同じ規則です。
5. **168〜179 行目：`Accept` と `Content-Type` を補う**

   無ければ `Accept: application/json, text/plain, */*` を足し、`Content-Type` は本文から推測します（推測は[第 4 回](04-http-request-immutable.md)）。
6. **181〜183 行目：`timeout` は XHR のプロパティに**

   XHR は自分でタイムアウトを持っているので、ミリ秒をそのまま入れるだけです。時間切れは 6 節の `timeout` イベントで届きます。

📄 `angular/packages/common/http/src/xhr.ts` L185–198 （▶ の行: 186–187, 194, 198）

```ts
185 │           // Set the responseType if one was requested.
186 ▶           if (req.responseType) {
187 ▶             const responseType = req.responseType.toLowerCase();
188 │ 
189 │             // JSON responses need to be processed as text. This is because if the server
190 │             // returns an XSSI-prefixed JSON response, the browser will fail to parse it,
191 │             // xhr.response will be null, and xhr.responseText cannot be accessed to
192 │             // retrieve the prefixed JSON data in order to strip the prefix. Thus, all JSON
193 │             // is parsed by first requesting text and then applying JSON.parse.
194 ▶             xhr.responseType = (responseType !== 'json' ? responseType : 'text') as any;
195 │           }
196 │ 
197 │           // Serialize the request body if one is present. If not, this will be set to null.
198 ▶           const reqBody = req.serializeBody();
```

194 行目が XSSI の準備です。`responseType` が `'json'` なら、XHR には `'text'` として頼みます。189〜193 行目のコメントのとおり、XHR に `'json'` で頼むと、先頭に `)]}',` が付いた本文の解析にブラウザが失敗して `xhr.response` が `null` になり、元の文字列も読めなくなるからです。`'blob'`・`'arraybuffer'`・`'text'` はそのまま渡します。198 行目で本文を送れる形にし、無ければ `null` です。

## 4. partialFromXhr：ステータスとヘッダーを 1 回だけ読む

📄 `angular/packages/common/http/src/xhr.ts` L200–227 （▶ の行: 206, 210–212, 215, 218, 222, 225）

```ts
200 │           // If progress events are enabled, response headers will be delivered
201 │           // in two events - the HttpHeaderResponse event and the full HttpResponse
202 │           // event. However, since response headers don't change in between these
203 │           // two events, it doesn't make sense to parse them twice. So headerResponse
204 │           // caches the data extracted from the response whenever it's first parsed,
205 │           // to ensure parsing isn't duplicated.
206 ▶           let headerResponse: HttpHeaderResponse | null = null;
207 │ 
208 │           // partialFromXhr extracts the HttpHeaderResponse from the current XMLHttpRequest
209 │           // state, and memoizes it into headerResponse.
210 ▶           const partialFromXhr = (): HttpHeaderResponse => {
211 ▶             if (headerResponse !== null) {
212 ▶               return headerResponse;
213 │             }
214 │ 
215 ▶             const statusText = xhr.statusText || 'OK';
216 │ 
217 │             // Parse headers from XMLHttpRequest - this step is lazy.
218 ▶             const headers = new HttpHeaders(xhr.getAllResponseHeaders());
219 │ 
220 │             // Read the response URL from the XMLHttpResponse instance and fall back on the
221 │             // request URL.
222 ▶             const url = xhr.responseURL || req.url;
223 │ 
224 │             // Construct the HttpHeaderResponse and memoize it.
225 ▶             headerResponse = new HttpHeaderResponse({headers, status: xhr.status, statusText, url});
226 │             return headerResponse;
227 │           };
```

1. **206・211〜213 行目：一度作ったら使い回す**

   進捗を出すときは、7 節の最初の `progress` と 5 節の `load` の 2 回、ヘッダーが要ります。200〜205 行目のコメントのとおり、その間ヘッダーは変わらないので、206 行目の `headerResponse` に覚えておきます。
2. **218 行目：ヘッダーは 1 本の文字列で来る**

   XHR の `getAllResponseHeaders()` は `"content-type: image/x-icon\r\ncontent-length: 15086\r\n..."` のような 1 本の文字列を返します。`HttpHeaders` のコンストラクタは文字列を受け取ると、改行で割って `:` の前後に分ける処理を**初めて読まれるときまで遅らせます**（[第 4 回](04-http-request-immutable.md)で引用済み）。217 行目のコメントの「lazy」はこのことです。
3. **215・222 行目：既定値**

   215 行目、`statusText` が空なら `'OK'`。222 行目、`xhr.responseURL`（リダイレクト後の URL）が無ければ `req.url` です。fetch 版は `urlWithParams` に戻るので、ここだけ少し違います。
4. **225 行目：`HttpHeaderResponse` を作る**

   本文を持たない、ステータスとヘッダーだけのイベントです。

## 5. onLoad：本文を読み、XSSI を剥がし、成功か失敗かを決める

📄 `angular/packages/common/http/src/xhr.ts` L229–254 （▶ の行: 233, 235, 240, 242, 246–247, 254）

```ts
229 │           // Next, a few closures are defined for the various events which XMLHttpRequest can
230 │           // emit. This allows them to be unregistered as event listeners later.
231 │ 
232 │           // First up is the load event, which represents a response being fully available.
233 ▶           const onLoad = this.maybePropagateTrace(() => {
234 │             // Read response state from the memoized partial data.
235 ▶             let {headers, status, statusText, url} = partialFromXhr();
236 │ 
237 │             // The body will be read out if present.
238 │             let body: any | null = null;
239 │ 
240 ▶             if (status !== HTTP_STATUS_CODE_NO_CONTENT) {
241 │               // Use XMLHttpRequest.response if set, responseText otherwise.
242 ▶               body = typeof xhr.response === 'undefined' ? xhr.responseText : xhr.response;
243 │             }
244 │ 
245 │             // Normalize another potential bug (this one comes from CORS).
246 ▶             if (status === 0) {
247 ▶               status = !!body ? HTTP_STATUS_CODE_OK : 0;
248 │             }
249 │ 
250 │             // ok determines whether the response will be transmitted on the event or
251 │             // error channel. Unsuccessful status codes (not 2xx) will always be errors,
252 │             // but a successful status code can still result in an error if the user
253 │             // asked for JSON data and the body cannot be parsed as such.
254 ▶             let ok = status >= 200 && status < 300;
```

1. **233 行目：`load` は「応答が全部そろった」**

   232 行目のコメントのとおりです。HTTP のステータスが 404 でも 500 でも、応答が届けば `load` です（失敗の `error` イベントはネットワークの失敗だけ。6 節）。
2. **240〜243 行目：204 でなければ本文を読む**

   242 行目、`xhr.response` があればそれ（3 節で頼んだ型）、無ければ `responseText` です。
3. **246〜248 行目：status 0 でも本文があれば 200**

   245 行目のコメントの「CORS から来る別の不具合」への対処です。[第 6 回](06-http-backend-fetch.md)の fetch 版はこの振る舞いをまねています。
4. **254 行目：`ok` は 2xx**

   `let` なのは、次の引用で JSON の解析に失敗したら `false` にするためです。

📄 `angular/packages/common/http/src/xhr.ts` L256–281 （▶ の行: 258, 260–261, 265, 270, 274, 276, 278）

```ts
256 │             // Check whether the body needs to be parsed as JSON (in many cases the browser
257 │             // will have done that already).
258 ▶             if (req.responseType === 'json' && typeof body === 'string') {
259 │               // Save the original body, before attempting XSSI prefix stripping.
260 ▶               const originalBody = body;
261 ▶               body = body.replace(XSSI_PREFIX, '');
262 │               try {
263 │                 // Attempt the parse. If it fails, a parse error should be delivered to the
264 │                 // user.
265 ▶                 body = body !== '' ? JSON.parse(body) : null;
266 │               } catch (error) {
267 │                 // Since the JSON.parse failed, it's reasonable to assume this might not have
268 │                 // been a JSON response. Restore the original body (including any XSSI prefix)
269 │                 // to deliver a better error response.
270 ▶                 body = originalBody;
271 │ 
272 │                 // If this was an error request to begin with, leave it as a string, it
273 │                 // probably just isn't JSON. Otherwise, deliver the parsing error to the user.
274 ▶                 if (ok) {
275 │                   // Even though the response status was 2xx, this is still an error.
276 ▶                   ok = false;
277 │                   // The parse error contains the text of the body that failed to parse.
278 ▶                   body = {error, text: body} as HttpJsonParseError;
279 │                 }
280 │               }
281 │             }
```

**XSSI**（クロスサイト・スクリプト・インクルージョン）は、他のサイトが `<script src="あなたの API">` で JSON を読み込んで中身を盗む攻撃です。サーバーが JSON の先頭に `)]}',` と改行を付けておくと、`<script>` としては文法エラーになって読めません。`HttpClient` はそれを剥がしてから解析します。

1. **258 行目：JSON を頼まれ、本文が文字列のときだけ**

   3 節 194 行目で `'text'` として頼んだので、ここでは文字列です。
2. **260〜261 行目：元を取っておき、接頭辞を剥がす**

   正規表現は 38 行目の `/^\)\]\}',?\n/` で、先頭にあるときだけ、`,` は有っても無くてもよく、改行まで含めて消します。fetch 版も同じ正規表現を持っています。
3. **265 行目：空なら `null`、そうでなければ `JSON.parse`**
4. **270〜279 行目：解析に失敗したら**

   270 行目で本文を**接頭辞の付いた元の文字列**に戻します。もともと 2xx でなければそのまま文字列で error に流れます。2xx だったなら 276 行目で `ok = false` にし、278 行目で `{error, text}`（`HttpJsonParseError`）を本文にします。**ステータス 200 なのに error** になるのはこの行です。

📄 `angular/packages/common/http/src/xhr.ts` L283–310 （▶ の行: 285–286, 296, 299–300, 302）

```ts
283 │             if (ok) {
284 │               // A successful response is delivered on the event stream.
285 ▶               observer.next(
286 ▶                 new HttpResponse({
287 │                   body,
288 │                   headers,
289 │                   status,
290 │                   statusText,
291 │                   url: url || undefined,
292 │                 }),
293 │               );
294 │               // The full body has been received and delivered, no further events
295 │               // are possible. This request is complete.
296 ▶               observer.complete();
297 │             } else {
298 │               // An unsuccessful request is delivered on the error channel.
299 ▶               observer.error(
300 ▶                 new HttpErrorResponse({
301 │                   // The error in this case is the response body (error from the server).
302 ▶                   error: body,
303 │                   headers,
304 │                   status,
305 │                   statusText,
306 │                   url: url || undefined,
307 │                 }),
308 │               );
309 │             }
310 │           });
```

成功なら 285 行目で `HttpResponse` を流して 296 行目で complete。失敗なら 299 行目で、302 行目のとおり本文を `error` に入れた `HttpErrorResponse` を流します（[第 8 回](08-http-response-errors.md)）。

## 6. onError と onTimeout：ネットワークの失敗

📄 `angular/packages/common/http/src/xhr.ts` L312–339 （▶ の行: 315, 318–320, 326, 328–329, 332, 334）

```ts
312 │           // The onError callback is called when something goes wrong at the network level.
313 │           // Connection timeout, DNS error, offline, etc. These are actual errors, and are
314 │           // transmitted on the error channel.
315 ▶           const onError = this.maybePropagateTrace((error: ProgressEvent) => {
316 │             const {url} = partialFromXhr();
317 │             const res = new HttpErrorResponse({
318 ▶               error,
319 ▶               status: xhr.status || 0,
320 ▶               statusText: xhr.statusText || 'Unknown Error',
321 │               url: url || undefined,
322 │             });
323 │             observer.error(res);
324 │           });
325 │ 
326 ▶           let onTimeout = onError;
327 │ 
328 ▶           if (req.timeout) {
329 ▶             onTimeout = this.maybePropagateTrace((_: ProgressEvent) => {
330 │               const {url} = partialFromXhr();
331 │               const res = new HttpErrorResponse({
332 ▶                 error: new DOMException('Request timed out', 'TimeoutError'),
333 │                 status: xhr.status || 0,
334 ▶                 statusText: xhr.statusText || 'Request timeout',
335 │                 url: url || undefined,
336 │               });
337 │               observer.error(res);
338 │             });
339 │           }
```

1. **315〜324 行目：`error` イベント**

   312〜314 行目のコメントのとおり、接続のタイムアウト、DNS の失敗、オフラインなど、応答が来なかった失敗です。318 行目、`error` にはブラウザの `ProgressEvent` がそのまま入り、319 行目のとおりふつう status は 0、320 行目で `'Unknown Error'` です。
2. **326〜339 行目：`timeout` イベント**

   326 行目、既定では `onError` と同じ関数です。328 行目、`timeout` を指定したリクエストだけ専用の関数にし、332 行目で `TimeoutError` という名前の `DOMException` を `error` に入れます。fetch 版が `abort` の理由に使う名前と同じなので、どちらのバックエンドでも `err.error.name === 'TimeoutError'` で判定できます。

## 7. progress と upload.progress

📄 `angular/packages/common/http/src/xhr.ts` L341–377 （▶ の行: 345, 349, 351–353, 358, 360, 364–365, 371–372, 376）

```ts
341 │           // The sentHeaders flag tracks whether the HttpResponseHeaders event
342 │           // has been sent on the stream. This is necessary to track if progress
343 │           // is enabled since the event will be sent on only the first download
344 │           // progress event.
345 ▶           let sentHeaders = false;
346 │ 
347 │           // The download progress event handler, which is only registered if
348 │           // progress events are enabled.
349 ▶           const onDownProgress = this.maybePropagateTrace((event: ProgressEvent) => {
350 │             // Send the HttpResponseHeaders event if it hasn't been sent already.
351 ▶             if (!sentHeaders) {
352 ▶               observer.next(partialFromXhr());
353 ▶               sentHeaders = true;
354 │             }
355 │ 
356 │             // Start building the download progress event to deliver on the response
357 │             // event stream.
358 ▶             let progressEvent: HttpDownloadProgressEvent = {
359 │               type: HttpEventType.DownloadProgress,
360 ▶               loaded: event.loaded,
361 │             };
362 │ 
363 │             // Set the total number of bytes in the event if it's available.
364 ▶             if (event.lengthComputable) {
365 ▶               progressEvent.total = event.total;
366 │             }
367 │ 
368 │             // If the request was for text content and a partial response is
369 │             // available on XMLHttpRequest, include it in the progress event
370 │             // to allow for streaming reads.
371 ▶             if (req.responseType === 'text' && !!xhr.responseText) {
372 ▶               progressEvent.partialText = xhr.responseText;
373 │             }
374 │ 
375 │             // Finally, fire the event.
376 ▶             observer.next(progressEvent);
377 │           });
```

1. **351〜354 行目：最初の 1 回だけ、先に `ResponseHeader`**

   345 行目の `sentHeaders` で 1 回に限ります。fetch 版はヘッダーが届いた時点で流しますが、XHR 版は**最初の `progress` イベントのとき**に流します。
2. **358〜366 行目：`loaded` と `total`**

   値はブラウザの `ProgressEvent` そのままです。364 行目、`lengthComputable`（全体の長さが分かる）なら `total` を入れます。
3. **371〜373 行目：`partialText`**

   テキストを頼んだときは、その時点までの `xhr.responseText` を丸ごと入れます。fetch 版はかけらを自分で `TextDecoder` に通してつないでいました。

📄 `angular/packages/common/http/src/xhr.ts` L379–397 （▶ の行: 381, 385–386, 391–392, 396）

```ts
379 │           // The upload progress event handler, which is only registered if
380 │           // progress events are enabled.
381 ▶           const onUpProgress = this.maybePropagateTrace((event: ProgressEvent) => {
382 │             // Upload progress events are simpler. Begin building the progress
383 │             // event.
384 │             let progress: HttpUploadProgressEvent = {
385 ▶               type: HttpEventType.UploadProgress,
386 ▶               loaded: event.loaded,
387 │             };
388 │ 
389 │             // If the total number of bytes being uploaded is available, include
390 │             // it.
391 ▶             if (event.lengthComputable) {
392 ▶               progress.total = event.total;
393 │             }
394 │ 
395 │             // Send the event.
396 ▶             observer.next(progress);
397 │           });
```

アップロード側は 385 行目の `HttpEventType.UploadProgress` を流すだけです。`event.loaded` は送信済みのバイト数で、これを取れるのは XHR の `xhr.upload` オブジェクトだけです。**`FetchBackend` にはこれに当たる行がありません**。

## 8. リスナーを登録して送る。購読解除で外して abort

📄 `angular/packages/common/http/src/xhr.ts` L399–421 （▶ の行: 400–403, 405–406, 409, 411, 415–416, 420–421）

```ts
399 │           // By default, register for load and error events.
400 ▶           xhr.addEventListener('load', onLoad);
401 ▶           xhr.addEventListener('error', onError);
402 ▶           xhr.addEventListener('timeout', onTimeout);
403 ▶           xhr.addEventListener('abort', onError);
404 │ 
405 ▶           const reportUploadProgress = req.reportProgress || req.reportUploadProgress;
406 ▶           const reportDownloadProgress = req.reportProgress || req.reportDownloadProgress;
407 │ 
408 │           // Progress events are only enabled if requested.
409 ▶           if (reportDownloadProgress) {
410 │             // Download progress is always enabled if requested.
411 ▶             xhr.addEventListener('progress', onDownProgress);
412 │           }
413 │ 
414 │           // Upload progress depends on whether there is a body to upload.
415 ▶           if (reportUploadProgress && reqBody !== null && xhr.upload) {
416 ▶             xhr.upload.addEventListener('progress', onUpProgress);
417 │           }
418 │ 
419 │           // Fire the request, and notify the event stream that it was fired.
420 ▶           xhr.send(reqBody!);
421 ▶           observer.next({type: HttpEventType.Sent});
```

1. **400〜403 行目：いつも登録する 4 つ**

   403 行目、`abort` イベントにも `onError` を付けています。Angular の外で XHR が中断されたときに error として届けるためです。
2. **405〜406 行目：進捗の指定を上りと下りに分ける**

   非推奨の `reportProgress` は両方を意味し、v22 からは `reportUploadProgress` と `reportDownloadProgress` を別々に指定できます。
3. **409〜412 行目：下りの進捗は頼まれたときだけ登録**
4. **415〜417 行目：上りは、送る本文があるときだけ**

   GET のように本文が `null` なら、`reportUploadProgress: true` でも登録しません（DEMO の 2 つ目）。`xhr.upload` を持たない XHR 実装も除外します。
5. **420〜421 行目：送って、`Sent`**

   fetch 版と同じく、`Sent` は subscribe の中で同期に流れます。

📄 `angular/packages/common/http/src/xhr.ts` L422–447 （▶ の行: 424, 426–429, 431–432, 435–436, 440–441）

```ts
422 │           // This is the return from the Observable function, which is the
423 │           // request cancellation handler.
424 ▶           return () => {
425 │             // On a cancellation, remove all registered event listeners.
426 ▶             xhr.removeEventListener('error', onError);
427 ▶             xhr.removeEventListener('abort', onError);
428 ▶             xhr.removeEventListener('load', onLoad);
429 ▶             xhr.removeEventListener('timeout', onTimeout);
430 │ 
431 ▶             if (reportDownloadProgress) {
432 ▶               xhr.removeEventListener('progress', onDownProgress);
433 │             }
434 │ 
435 ▶             if (reportUploadProgress && reqBody !== null && xhr.upload) {
436 ▶               xhr.upload.removeEventListener('progress', onUpProgress);
437 │             }
438 │ 
439 │             // Finally, abort the in-flight request.
440 ▶             if (xhr.readyState !== xhr.DONE) {
441 ▶               xhr.abort();
442 │             }
443 │           };
444 │         });
445 │       }),
446 │     );
447 │   }
```

1. **424 行目：teardown 関数を返す**

   unsubscribe されたとき、または complete / error で購読が終わったときに RxJS が呼びます。
2. **426〜437 行目：**先に**リスナーを全部外す**

   登録したのと同じ条件（431・435 行目）で外します。外してから `abort()` するので、403 行目の `abort` → `onError` は呼ばれず、unsubscribe した購読者に error が飛ぶことはありません。
3. **440〜442 行目：まだ終わっていなければ `abort()`**

   `readyState` が `DONE`（4）なら応答は受け取り済みなので何もしません。fetch 版の `done` フラグと同じ役目を、XHR は自分の状態で持っています。

## 9. サーバーでの XHR

📄 `angular/packages/platform-server/src/http.ts` L29–64 （▶ の行: 29, 36, 38–39, 48, 53, 63）

```ts
29 ▶ export class ServerXhr implements XhrFactory {
30 │   private xhrImpl: typeof import('xhr2') | undefined;
31 │ 
32 │   // The `xhr2` dependency has a side-effect of accessing and modifying a
33 │   // global scope. Loading `xhr2` dynamically allows us to delay the loading
34 │   // and start the process once the global scope is established by the underlying
35 │   // server platform (via shims, etc).
36 ▶   private async ɵloadImpl(): Promise<void> {
37 │     if (!this.xhrImpl) {
38 ▶       if (typeof ngDevMode === 'undefined' || ngDevMode) {
39 ▶         console.warn(
40 │           'XHR support in `@angular/platform-server` is deprecated and will be removed ' +
41 │             'in Angular 23. It has known security and performance issues in server ' +
42 │             'environments, such as forwarding `Authorization` headers on cross-origin ' +
43 │             'redirects and susceptibility to denial-of-service (DoS) via redirect loops. ' +
44 │             'Please use the HttpClient fetch backend instead, which is the default since Angular 22.',
45 │         );
46 │       }
47 │ 
48 ▶       const {default: xhr} = await import('xhr2');
49 │       this.xhrImpl = xhr;
50 │     }
51 │   }
52 │ 
53 ▶   build(): XMLHttpRequest {
54 │     const impl = this.xhrImpl;
55 │     if (!impl) {
56 │       throw new RuntimeError(
57 │         RuntimeErrorCode.XHR_NOT_LOADED,
58 │         (typeof ngDevMode === 'undefined' || ngDevMode) &&
59 │           'Unexpected state in ServerXhr: XHR implementation is not loaded.',
60 │       );
61 │     }
62 │ 
63 ▶     return new impl.XMLHttpRequest();
64 │   }
```

`@angular/platform-server` は `XhrFactory` を `ServerXhr` に替えます（同じファイルの `SERVER_HTTP_PROVIDERS` が `{provide: XhrFactory, useClass: ServerXhr}` を持ち、`server.ts` の `PLATFORM_SERVER_PROVIDERS` に含まれます）。36 行目の `ɵloadImpl` が 2 節 149 行目で呼ばれるもので、48 行目で `xhr2` という npm パッケージを動的 import します。32〜35 行目のコメントのとおり、`xhr2` は読み込んだだけで大域を書き換えるので、サーバーの準備が整うまで遅らせています。38〜45 行目、開発ビルドでは「サーバーでの XHR は非推奨で Angular 23 で消える。`Authorization` ヘッダーをオリジンをまたぐリダイレクト先に送ってしまう、リダイレクトの無限ループで DoS になる」と警告します。

📄 `angular/packages/common/http/src/backend.ts` L83–98 （▶ の行: 83, 86, 88, 93）

```ts
83 ▶         fetchBackendWarningDisplayed = true;
84 │         injector
85 │           .get(Console)
86 ▶           .warn(
87 │             formatRuntimeError(
88 ▶               RuntimeErrorCode.NOT_USING_FETCH_BACKEND_IN_SSR,
89 │               'Angular detected that `HttpClient` is not configured ' +
90 │                 "to use `fetch` APIs. It's strongly recommended to " +
91 │                 'enable `fetch` for applications that use Server-Side Rendering ' +
92 │                 'for better performance and compatibility. ' +
93 ▶                 'To enable `fetch`, remove the `withXhr()` feature from the `provideHttpClient()` call',
94 │             ),
95 │           );
96 │       }
97 │     }
98 │   }
```

もう 1 つの警告は `HttpInterceptorHandler` のコンストラクタにあります。直前の if（[第 12 回](12-http-testing.md)で引用）で「`ngServerMode` で、バックエンドが `FetchBackend` でも、テスト用でもない」ことを確かめ、83 行目で一度だけにしてから 86 行目で警告し、93 行目で「`withXhr()` を外せ」と案内します。

## 10. FetchBackend との違い

どちらも `HttpBackend` の `handle(req)` を実装し、同じ `HttpEvent` の列を返します。違いは次の表のとおりです（行番号は fetch.ts と xhr.ts）。

| 項目 | FetchBackend（fetch.ts） | HttpXhrBackend（xhr.ts） |
| --- | --- | --- |
| 既定か | 既定（`provideHttpClient()` だけで使われる） | `withXhr()` のときだけ |
| アップロードの進捗 | 取れない。`reportUploadProgress` で L372 が投げる | 取れる。L415–416 で `xhr.upload` に登録 |
| ダウンロードの進捗 | `reader.read()` のかけらごと（L244–258） | ブラウザの `progress` イベントごと（L349–377） |
| `ResponseHeader` の時機 | ヘッダーが届いた直後（L179） | 最初の `progress` のとき（L351–354） |
| XSSI の除去 | する（L346、同じ正規表現 L37） | する（L261、L38） |
| 2xx で JSON の解析に失敗 | `error` は `SyntaxError`（L360 で投げ直す） | `error` は `{error, text}`（L278） |
| 2xx 以外で JSON でない本文 | 接頭辞を剥がした文字列（L358） | 接頭辞付きの元の文字列（L270） |
| タイムアウト | `setTimeout` → `abort(TimeoutError)`（L113–116） | `xhr.timeout`（L182）→ `timeout` イベント（L329–338） |
| keepalive / cache / priority / mode / redirect / integrity / referrer / referrerPolicy | `RequestInit` に渡す（L417–424） | 開発ビルドで警告して無視（L44–98） |
| credentials | `credentials` を渡す。`withCredentials` なら `'include'`（L386–393） | `withCredentials` だけ（L160–162）。`credentials` は警告 |
| 応答の `redirected` / `responseType` | `HttpResponse` に入れる（L314–315） | 入れない（L286–292） |
| 本文の上限 | `HTTP_FETCH_MAX_RESPONSE_SIZE`（SSR で既定 1 MB） | 無い |
| 中断 | `AbortController.abort()`（`done` でなければ） | リスナーを外して `xhr.abort()`（`readyState !== DONE` なら。L426–442） |
| zone | `fetch` と読むループを `runOutsideAngular`（L144、L214） | `NgZone` を使わない |
| サーバー | Node.js の `globalThis.fetch` | `ServerXhr` が `xhr2` を読み込む（非推奨、v23 で削除予定） |

## 11. ここまでの呼び出しを 1 本に

- 👤 `http.post(url, file, { reportUploadProgress: true, observe: 'events' }).subscribe()` — あなたのコード（provideHttpClient(withXhr())）
  - `HttpInterceptorHandler.handle(req)` — backend.ts L100 — *インターセプタの連鎖の最後で backend.handle*
    - `HttpXhrBackend.handle(req)` — xhr.ts L124 — *JSONP の検査、validateXhrCompatibility、of(null) → switchMap*
      - `xhrFactory.build()` → `xhr.open(method, urlWithParams)` — xhr.ts L158–159 — *BrowserXhr なら new XMLHttpRequest()*
      - `xhr.setRequestHeader(...)` / `xhr.timeout` / `xhr.responseType` — xhr.ts L165–194 — *json は 'text' で頼む*
      - `addEventListener('load' | 'error' | 'timeout' | 'abort' | 'progress')`、`xhr.upload.addEventListener('progress')` — xhr.ts L400–416
      - `xhr.send(body)` → `next(Sent)` — xhr.ts L420–421
        - `onUpProgress` × n → `UploadProgress` — xhr.ts L381
        - `onDownProgress` → 初回だけ `ResponseHeader`、毎回 `DownloadProgress` — xhr.ts L349
        - `onLoad` → XSSI を剥がして `JSON.parse` → `HttpResponse` + complete — xhr.ts L233–296
      - `teardown`：removeEventListener × n → `xhr.abort()` — xhr.ts L424–442

> **🧪 DEMO — 同じリクエストを FetchBackend と HttpXhrBackend に送る**
>
> 章の中で `provideHttpClient()` と `provideHttpClient(withXhr())` の 2 つの環境注入器を作り、同じ `HttpRequest` を両方に送ります。XHR 側は `XhrFactory` を自作のものに差し替え、本物の `XMLHttpRequest` を作りつつ、`HttpXhrBackend` がそれに呼んだメソッドを記録しています。XSSI の 2 つは `)]}',\n` 付きの本文を `URL.createObjectURL` の `blob:` URL に置いたもので、ネットワークには出ません。
>
> FetchBackend のイベント
>
> HttpXhrBackend のイベント
>
> HttpXhrBackend が XMLHttpRequest に呼んだもの（自作 XhrFactory の記録）
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/http-backend-xhr)

1 つ目では、fetch 側は `Sent` → `ResponseHeader` → `DownloadProgress` …、XHR 側も `Sent` → `ResponseHeader` → `DownloadProgress` … と同じ形になりますが、XHR の `ResponseHeader` は最初の `progress` と同時（351〜354 行目）です。記録には `open` → `setRequestHeader(Accept, …)` → `addEventListener` × 5 → `send(null)` が並び、`responseType='blob'` が見えます。complete のあとにも teardown が走るので `removeEventListener` が並びますが、`readyState` が 4 なので `abort()` は呼ばれません。2 つ目では fetch 側だけが `NG02824` の error になり、XHR 側は通信が成功します。記録に `xhr.upload.addEventListener` が無いのは、GET で本文が `null` だからです（415 行目）。3 つ目はどちらも接頭辞が剥がれて `{"ok":true}` になり、記録の `send` の行で XHR には `responseType='text'` で頼んでいる（194 行目）のが見えます。4 つ目はどちらも status 200 の error ですが、`error` の形が違います。fetch は `SyntaxError`、XHR は接頭辞付きの `text` を持つ `{ error, text }` です（278 行目）。5 つ目は `Sent` のあと、記録に `removeEventListener` が 5 回並び、最後に `xhr.abort()` が来ます（426〜441 行目）。

## 聞かれそうな質問

**Q. fetch が既定なのに、なぜ XHR を残しているのですか？**

アップロードの進捗を取れるのが XHR だけだからです。`FetchBackend` は `reportUploadProgress` を見ると投げ、`HttpXhrBackend` は 415〜416 行目で `xhr.upload` の `progress` を購読して 385 行目の `UploadProgress` を流します。`withXhr()` の doc コメントも「アップロードの進捗が要るならこの feature を使え」と書いています（[第 2 回](02-http-provide.md)）。一方、サーバー用の XHR 実装（9 節の `ServerXhr`）は v23 で消える予定で、`withXhr()` はブラウザで使うものです。

**Q. `)]}'` はどこで剥がされますか？**

バックエンドの中です。インターセプタより後ろなので、インターセプタは剥がす前の文字列を見ることはなく、受け取るのは解析後の `HttpResponse` です。XHR では 194 行目で `'json'` を `'text'` に替えて受け取り、261 行目で 38 行目の正規表現 `/^\)\]\}',?\n/` を消してから 265 行目で `JSON.parse` します。fetch でも `parseBody` の中で同じ正規表現を消します（[第 6 回](06-http-backend-fetch.md) 7 節）。接頭辞は先頭にあって改行が続くときだけ消えるので、`)]}'` のあとに改行が無い本文は解析に失敗します。

**Q. アップロードの進捗を出すには、何を書けばよいですか？**

3 つそろえます。(1) `provideHttpClient(withXhr())`。(2) リクエストに `reportUploadProgress: true`（または非推奨の `reportProgress: true`。405 行目）。(3) `observe: 'events'` にして、`event.type === HttpEventType.UploadProgress` の `loaded` / `total` を読む。そのうえで、送る本文が必要です。415 行目のとおり `reqBody` が `null` だと登録されません。`total` は 391 行目の `lengthComputable` のときだけ入ります。

**Q. unsubscribe したのに error が届かないのはなぜですか？**

teardown が 426〜429 行目で先にリスナーを外し、そのあと 441 行目で `xhr.abort()` するからです。403 行目で `abort` に付けた `onError` はもう外れています。そもそも unsubscribe した購読者には RxJS が何も届けません。`abort` → `onError` が働くのは、Angular の外で誰かが同じ XHR を `abort()` したときです。

**Q. XHR でも `keepalive` や `priority` は効きますか？**

効きません。50〜82 行目の 9 つの設定は、開発ビルドで 90 行目の `console.warn` が出るだけで、XHR には渡されません（本番ビルドでは 136 行目の `ngDevMode &&` で警告も出ません）。ページを閉じたあとも送りたい（`keepalive`）なら `FetchBackend` を使います。

## 読み終えて

- `HttpXhrBackend` は `XhrFactory` で XHR を作り、subscribe ごとに `open` → ヘッダー → リスナー登録 → `send` → `Sent` を同期に行う（158〜421 行目）
- JSON は `'text'` で受け取り、`)]}',\n` を剥がしてから解析する。2xx で解析に失敗したら status 200 でも error（194・261・276 行目）
- アップロードの進捗は `xhr.upload` の `progress` から。本文があるときだけ登録する（415 行目）。fetch には無い
- 購読解除ではリスナーを先に外してから、終わっていなければ `abort()`（426〜442 行目）
- fetch にしか無い設定は XHR では警告して無視。サーバーの XHR（`xhr2`）は非推奨で、v23 で消える予定

---

← 前: [FetchBackend：fetch の呼び出し、本文のストリーム読み、中断とサイズ上限](06-http-backend-fetch.md)  
次: [HttpEvent と HttpErrorResponse：イベントの種類、ok、エラーの作られ方](08-http-response-errors.md) →
