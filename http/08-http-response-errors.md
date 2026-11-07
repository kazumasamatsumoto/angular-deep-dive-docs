[目次](../README.md) › [HttpClient の内側](README.md) › 第 8 回 / 全 12 回

# HttpEvent と HttpErrorResponse：イベントの種類、ok、エラーの作られ方

> HttpEventType の 6 種類（Sent / UploadProgress / ResponseHeader / DownloadProgress / Response / User）、HttpResponseBase の ok が 200〜299 で決まる行、HttpErrorResponse の message の作り方、ステータスコード 0 になる場面、本文の JSON 解析に失敗したときの error の形、HttpStatusCode の列挙。retry や catchError をどこに置くとどう効くか。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/http-response-errors)

---

`HttpClient` の Observable に流れてくるのは「レスポンス本文」だけではありません。中身は `HttpEvent` という 6 種類のイベントの列で、失敗したときは `HttpErrorResponse` という 1 つのクラスがエラーとして流れます。この章では、イベントの種類を決める列挙、`ok` を計算する 1 行、`HttpErrorResponse` が `message` を作る条件分岐を読み、ステータスコード 0 になる場面と、本文の JSON 解析に失敗したときに `error` に何が入るかを確かめます。最後に `retry` を「`get` の後ろ」と「インターセプタの中」に置いたとき、バックエンドが何回呼ばれるかをデモで数えます。

読む対象は `packages/common/http/src/response.ts` と、挙動の根拠として `packages/common/http/test/fetch_spec.ts` の数件です。イベントやエラーを**作る側**の行は [第 6 回 FetchBackend](06-http-backend-fetch.md) と [第 7 回 HttpXhrBackend](07-http-backend-xhr.md) で読んだので、ここでは受け取る側の型と、作られ方の結果だけを扱います。

1. [1. 概観](01-http-overview.md)
2. [2. provideHttpClient と features](02-http-provide.md)
3. [3. HttpClient.request](03-http-client-request.md)
4. [4. 不変なリクエスト](04-http-request-immutable.md)
5. [5. インターセプタの連鎖](05-http.md)
6. [6. FetchBackend](06-http-backend-fetch.md)
7. [7. HttpXhrBackend](07-http-backend-xhr.md)
8. **8. HttpEvent とエラー**（この章）
9. [9. XSRF 対策](09-http-xsrf.md)
10. [10. JSONP](10-http-jsonp.md)
11. [11. SSR の転送キャッシュ](11-http-transfer-cache.md)
12. [12. テスト用バックエンド](12-http-testing.md)

## 1. HttpEventType：イベントは 6 種類

📄 `angular/packages/common/http/src/response.ts` L18–50 （▶ の行: 18, 22, 27, 29, 34, 39, 44, 49）

```ts
18 ▶ export enum HttpEventType {
19 │   /**
20 │    * The request was sent out over the wire.
21 │    */
22 ▶   Sent,
23 │ 
24 │   /**
25 │    * An upload progress event was received.
26 │    *
27 ▶    * Note: The `FetchBackend` doesn't support progress report on uploads.
28 │    */
29 ▶   UploadProgress,
30 │ 
31 │   /**
32 │    * The response status code and headers were received.
33 │    */
34 ▶   ResponseHeader,
35 │ 
36 │   /**
37 │    * A download progress event was received.
38 │    */
39 ▶   DownloadProgress,
40 │ 
41 │   /**
42 │    * The full response including the body was received.
43 │    */
44 ▶   Response,
45 │ 
46 │   /**
47 │    * A custom event from an interceptor or a backend.
48 │    */
49 ▶   User,
50 │ }
```

18 行目の `HttpEventType` は TypeScript の `enum`（名前付きの数値の集まり）で、値を書いていないので上から 0, 1, 2… が振られます。22 行目 `Sent` = 0、29 行目 `UploadProgress` = 1、34 行目 `ResponseHeader` = 2、39 行目 `DownloadProgress` = 3、44 行目 `Response` = 4、49 行目 `User` = 5 です。27 行目の注意書きのとおり、既定の `FetchBackend` はアップロードの進捗（1）を出しません。49 行目の `User` はインターセプタやバックエンドが独自のイベントを流すための枠で、`common/http/src` の中にこの値でイベントを作る行はありません。

📄 `angular/packages/common/http/src/response.ts` L143–162 （▶ の行: 143–145, 156–162）

```ts
143 ▶ export interface HttpJsonParseError {
144 ▶   error: Error;
145 ▶   text: string;
146 │ }
147 │ 
148 │ /**
149 │  * Union type for all possible events on the response stream.
150 │  *
151 │  * Typed according to the expected type of the response.
152 │  *
153 │  * @see [Intercepting response events](guide/http/interceptors#intercepting-response-events)
154 │  * @publicApi
155 │  */
156 ▶ export type HttpEvent<T> =
157 ▶   | HttpSentEvent
158 ▶   | HttpHeaderResponse
159 ▶   | HttpResponse<T>
160 ▶   | HttpDownloadProgressEvent
161 ▶   | HttpUploadProgressEvent
162 ▶   | HttpUserEvent<T>;
```

156〜162 行目が `HttpEvent<T>` の正体で、6 つの型の合併型（union。どれか 1 つ）です。どの型も `type` プロパティに 1 で見た値を持つので、`event.type === HttpEventType.Response` と比べると TypeScript が型を絞り込みます。143〜146 行目の `HttpJsonParseError` は 4 節で出てきます。

1. **購読直後：`Sent`（0）**

   バックエンドが通信を始めた印です。中身は `{type: 0}` だけです（第 6 回で読んだ `doRequest` が `await` の前に出します）。
2. **`reportProgress: true` のときだけ：`ResponseHeader`（2）と `DownloadProgress`（3）**

   ステータスとヘッダーが届いた時点で `HttpHeaderResponse`、本文を読み進めるたびに `loaded` / `total` を持つ進捗イベントが出ます。
3. **最後に 1 回：`Response`（4）か、エラー**

   成功なら `HttpResponse` を `next` してから `complete`、失敗なら `HttpErrorResponse` を `error` に流します。両方が来ることはありません。

普段 `http.get(url)` でイベントを意識しないのは、`HttpClient.request` が既定の `observe: 'body'` のときに `HttpResponse` 以外のイベントを捨て、本文だけを取り出すからです（[第 3 回](03-http-client-request.md)の `filter` の行）。`observe: 'events'` にすると、この節の列がそのまま見えます。

## 2. HttpResponseBase：ok は 200〜299 かどうか

📄 `angular/packages/common/http/src/response.ts` L232–255 （▶ の行: 241–242, 246–249, 253）

```ts
232 │   constructor(
233 │     init: {
234 │       headers?: HttpHeaders;
235 │       status?: number;
236 │       statusText?: string;
237 │       url?: string;
238 │       redirected?: boolean;
239 │       responseType?: ResponseType;
240 │     },
241 ▶     defaultStatus: number = 200,
242 ▶     defaultStatusText: string = 'OK',
243 │   ) {
244 │     // If the hash has values passed, use them to initialize the response.
245 │     // Otherwise use the default values.
246 ▶     this.headers = init.headers || new HttpHeaders();
247 ▶     this.status = init.status !== undefined ? init.status : defaultStatus;
248 ▶     this.statusText = init.statusText || defaultStatusText;
249 ▶     this.url = init.url || null;
250 │     this.redirected = init.redirected;
251 │     this.responseType = init.responseType;
252 │     // Cache the ok value to avoid defining a getter.
253 ▶     this.ok = this.status >= 200 && this.status < 300;
254 │   }
255 │ }
```

`HttpResponse`・`HttpHeaderResponse`・`HttpErrorResponse` の 3 つが継承する基底クラスのコンストラクタです。241〜242 行目、ステータスを渡さなかったときの既定は `200` と `'OK'` です（ただし `HttpErrorResponse` は 3 節で別の既定を渡します）。247 行目は `!== undefined` で比べているので、**0 を渡すと 0 のまま**になります。`||` だと 0 が既定値に化けてしまうからです。248 行目の `statusText` は逆に `||` なので、空文字なら既定値になります。253 行目が `ok` の計算のすべてです。**`status >= 200 && status < 300` を一度だけ計算してフィールドに入れます**（252 行目のコメントのとおり getter にしないため）。

📄 `angular/packages/common/http/src/response.ts` L268–283 （▶ の行: 268, 280, 283）

```ts
268 ▶ export class HttpHeaderResponse extends HttpResponseBase {
269 │   /**
270 │    * Create a new `HttpHeaderResponse` with the given parameters.
271 │    */
272 │   constructor(
273 │     init: {
274 │       headers?: HttpHeaders;
275 │       status?: number;
276 │       statusText?: string;
277 │       url?: string;
278 │     } = {},
279 │   ) {
280 ▶     super(init);
281 │   }
282 │ 
283 ▶   override readonly type: HttpEventType.ResponseHeader = HttpEventType.ResponseHeader;
```

📄 `angular/packages/common/http/src/response.ts` L328–343 （▶ の行: 330, 339–340, 343）

```ts
328 │   constructor(
329 │     init: {
330 ▶       body?: T | null;
331 │       headers?: HttpHeaders;
332 │       status?: number;
333 │       statusText?: string;
334 │       url?: string;
335 │       redirected?: boolean;
336 │       responseType?: ResponseType;
337 │     } = {},
338 │   ) {
339 ▶     super(init);
340 ▶     this.body = init.body !== undefined ? init.body : null;
341 │   }
342 │ 
343 ▶   override readonly type: HttpEventType.Response = HttpEventType.Response;
```

`HttpHeaderResponse`（268 行目）は本文を持たず、283 行目で `type` を `ResponseHeader` に固定します。`HttpResponse` は 340 行目で `body` を決め、**渡されなければ `null`** にします。343 行目で `type` は `Response` です。204 No Content のように本文が無い応答では、バックエンドが `body` を `null` のまま渡すので、`http.get` の値も `null` になります（5 節のデモの 204 の行）。

## 3. HttpErrorResponse：message は 2 通り

📄 `angular/packages/common/http/src/response.ts` L401–436 （▶ の行: 401–404, 409, 421, 426–427, 430–432, 434）

```ts
401 ▶ export class HttpErrorResponse extends HttpResponseBase implements Error {
402 ▶   readonly name = 'HttpErrorResponse';
403 ▶   readonly message: string;
404 ▶   readonly error: any | null;
405 │ 
406 │   /**
407 │    * Errors are never okay, even when the status code is in the 2xx success range.
408 │    */
409 ▶   override readonly ok = false;
410 │ 
411 │   constructor(init: {
412 │     error?: any;
413 │     headers?: HttpHeaders;
414 │     status?: number;
415 │     statusText?: string;
416 │     url?: string;
417 │     redirected?: boolean;
418 │     responseType?: ResponseType;
419 │   }) {
420 │     // Initialize with a default status of 0 / Unknown Error.
421 ▶     super(init, 0, 'Unknown Error');
422 │ 
423 │     // If the response was successful, then this was a parse error. Otherwise, it was
424 │     // a protocol-level failure of some sort. Either the request failed in transit
425 │     // or the server returned an unsuccessful status code.
426 ▶     if (this.status >= 200 && this.status < 300) {
427 ▶       this.message = `Http failure during parsing for ${init.url || '(unknown url)'}`;
428 │     } else {
429 │       // TODO: Cleanup G3 to update the tests that rely on having the status text in the Error message.
430 ▶       this.message = `Http failure response for ${init.url || '(unknown url)'}: ${init.status} ${
431 ▶         init.statusText
432 ▶       }`;
433 │     }
434 ▶     this.error = init.error || null;
435 │   }
436 │ }
```

1. **401〜402 行目：`Error` の形をしているが、`Error` を継承していない**

   `extends HttpResponseBase implements Error` なので、`name` と `message` を持つだけで `instanceof Error` は `false` です。`name` は文字列 `'HttpErrorResponse'` で固定され、本番ビルドでクラス名が短くなっても変わりません。
2. **409 行目：`ok` は常に `false`**

   基底の 253 行目で計算した値を、フィールド初期化子で上書きします。ステータスが 200 でも `ok` は `false` です。
3. **421 行目：既定のステータスは 0、文言は `'Unknown Error'`**

   基底コンストラクタの 2・3 番目の引数（241〜242 行目）に 0 と `'Unknown Error'` を渡します。`status` を渡さずに作った `HttpErrorResponse` は、すべて status 0 です。
4. **426〜427 行目：status が 2xx なら「解析の失敗」**

   2xx でエラーになるのは、本文を解析できなかったときだけ、という前提です。`message` は `Http failure during parsing for <url>` になります。
5. **430〜432 行目：それ以外は「失敗した応答」**

   `Http failure response for <url>: <status> <statusText>`。ここで使うのは `this.statusText` ではなく **引数の `init.statusText`** なので、呼び出し側が `statusText` を渡さないと文字列 `undefined` がそのまま入ります（5 節のデモの通信失敗の行）。
6. **434 行目：`error` はバックエンドが渡したもの、無ければ `null`**

   ここに入るのは「サーバーが返したエラー本文」か「通信や解析で起きた例外」です。`||` なので空文字の本文も `null` になります。

## 4. error に何が入るか

434 行目の `error` に何を入れるかは、バックエンドが決めます。[第 6 回](06-http-backend-fetch.md)と[第 7 回](07-http-backend-xhr.md)で読んだ行の結果をまとめると、次のとおりです。

| 場面 | status | error |
| --- | --- | --- |
| サーバーが 4xx / 5xx を返し、本文が JSON | そのまま | JSON を解析したオブジェクト |
| サーバーが 4xx / 5xx を返し、本文が JSON でない | そのまま | 本文の文字列（解析に失敗しても例外にしない） |
| 2xx だが `responseType: 'json'` の本文が壊れている（FetchBackend） | そのまま（200 など） | `JSON.parse` が投げた `SyntaxError` そのもの |
| 同上（HttpXhrBackend） | そのまま | `{error: SyntaxError, text: 元の本文}`（143 行目の `HttpJsonParseError`） |
| 通信そのものが失敗（オフライン、DNS、CORS で拒否、中断、タイムアウト） | 0 | fetch の例外（`TypeError` や `DOMException`）か XHR の `ProgressEvent` |

テストにも、本文の形がそのまま書いてあります。

📄 `angular/packages/common/http/test/fetch_spec.ts` L252–273 （▶ の行: 254–257, 262, 267, 271）

```ts
252 │   it('handles a json error response', async () => {
253 │     const promise = trackEvents(backend.handle(TEST_POST.clone({responseType: 'json'})));
254 ▶     fetchMock.mockFlush(
255 ▶       HttpStatusCode.InternalServerError,
256 ▶       'Error',
257 ▶       JSON.stringify({data: 'some data'}),
258 │     );
259 │     const events = await promise;
260 │     expect(events.length).toBe(2);
261 │     const res = events[1] as any as HttpErrorResponse;
262 ▶     expect(res.error.data).toBe('some data');
263 │   });
264 │ 
265 │   it('handles a text error response when a json success response was expected', async () => {
266 │     const promise = trackEvents(backend.handle(TEST_POST.clone({responseType: 'json'})));
267 ▶     fetchMock.mockFlush(HttpStatusCode.InternalServerError, 'Error', 'simple text error');
268 │     const events = await promise;
269 │     expect(events.length).toBe(2);
270 │     const res = events[1] as any as HttpErrorResponse;
271 ▶     expect(res.error).toBe('simple text error');
272 │   });
273 │ 
```

254〜258 行目、500 で JSON 本文を返すと、262 行目のとおり `error.data` で中身を読めます。267 行目、500 でただの文字列を返すと、271 行目のとおり `error` はその文字列です。JSON として解析できなくても、ステータスが 2xx でなければ文字列のまま渡す、という第 6 回の `parseBody` の分岐の結果です。

📄 `angular/packages/common/http/test/fetch_spec.ts` L339–353 （▶ の行: 339, 346–348, 352）

```ts
339 ▶   it('emits real errors via the error path', (done) => {
340 │     // Skipping the HttpEventType.Sent that is sent first
341 │     backend
342 │       .handle(TEST_POST)
343 │       .pipe(skip(1))
344 │       .subscribe({
345 │         error: (err: HttpErrorResponse) => {
346 ▶           expect(err instanceof HttpErrorResponse).toBe(true);
347 ▶           expect(err.error instanceof Error).toBeTrue();
348 ▶           expect(err.url).toBe('/test');
349 │           done();
350 │         },
351 │       });
352 ▶     fetchMock.mockErrorEvent(new Error('blah'));
353 │   });
```

352 行目で `fetch` 自体を失敗させると、346〜348 行目のとおり `HttpErrorResponse` の `error` は `Error` のインスタンスです。status は書いていませんが、FetchBackend の `catch` が `error.status ?? 0` を渡すので 0 になります（デモで確かめます）。

> [!WARNING]
> **ハマりどころ**
>
> status 0 は「サーバーが 0 を返した」ではなく、**HTTP の応答を受け取れなかった**という意味です。ブラウザは CORS で拒否した応答の中身を JavaScript に見せないので、CORS の設定ミスもオフラインも同じ status 0 になります。原因を知るには、開発者ツールのネットワークタブとコンソールを見ます。なお、ステータス 0 で本文があるときは 200 に読み替える行が両方のバックエンドにあります（第 6 回・第 7 回の「Same behavior as the XhrBackend」「Normalize another potential bug」のコメントの行）。

## 5. DEMO：本物の FetchBackend に偽の Response を処理させる

> **🧪 DEMO — 6 種類の応答を http.get(url, { observe: 'response' }) で受ける**
>
> 章の中だけの `createEnvironmentInjector([provideHttpClient(...), {provide: HttpBackend, ...}])` を作り、`HttpBackend` を「本物の `FetchBackend` を呼ぶ間だけ `globalThis.fetch` を偽物に差し替えるもの」にしています。`FetchBackend` は呼ぶたびに `globalThis.fetch` を読み直すので（第 6 回）、**Response の処理は本物のコード**で、通信だけがありません。偽の fetch は `new Response(...)` を返すか、通信失敗をまねて `TypeError` で reject します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/http-response-errors)

1. **200 JSON**

   `next` に `HttpResponse`。253 行目で `ok` は `true`。`message` を持つのはエラーだけです。
2. **404 テキスト / 500 JSON**

   `error` に `HttpErrorResponse`。`message` は 430〜432 行目の形で、`error` は 404 なら文字列、500 なら解析済みのオブジェクトです。
3. **通信失敗**

   status 0、`statusText` は 421 行目の既定 `'Unknown Error'`。しかし `message` の末尾は `0 undefined` です。FetchBackend は `TypeError` の `statusText`（存在しない）を渡し、431 行目は `init.statusText` を使うからです。`error` は `TypeError` そのものです。
4. **200 だが壊れた JSON**

   status は 200 なのに `error` 側に届きます。`ok` は 409 行目で `false`、`message` は 427 行目の「during parsing」、`error` は `SyntaxError` です。`statusText` が `'Unknown Error'` なのは、偽の Response の `statusText` が空文字で、248 行目の `||` が 421 行目の既定値を選ぶからです。
5. **204 No Content**

   `next` に `HttpResponse`、`body` は 340 行目の既定の `null` です。

> **🧪 DEMO — observe: 'events' と reportProgress: true で 1 節のイベント列を見る**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/http-response-errors)

`type=0`（Sent）→ `type=2`（ResponseHeader）→ `type=3`（DownloadProgress）→ `type=4`（Response）→ complete の順に並びます。偽の Response には `content-length` ヘッダーが無いので、`total` は `?`（`undefined`）です。`HttpProgressEvent` の `total` が省略可能（`total?: number`）なのはこのためです。

## 6. retry と catchError をどこに置くか

`HttpClient.request` は `of(req).pipe(concatMap(req => this.handler.handle(req)))` の形で Observable を返します（[第 3 回](03-http-client-request.md)）。**購読し直すたびに、インターセプタの連鎖を先頭からもう一度走らせる**形です。だから `retry` を置く場所で、やり直す範囲が変わります。

> **🧪 DEMO — 500 を返す URL に retry(2) を置く場所を変える**
>
> インターセプタは `withInterceptors([countOuter, retryInside])` の順です。`countOuter` は呼ばれた回数を数えるだけ、`retryInside` は「中」を選んだときだけ `next(req).pipe(retry(2))` を返します。バックエンドの回数は 5 節の差し替えたバックエンドの `handle` が数えます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/http-response-errors)

1. **retry なし：1 回 / 1 回**

   最初の `HttpErrorResponse` がそのまま届きます。
2. **`get` の後ろ：3 回 / 3 回**

   `retry(2)` は「エラーが来たら購読し直す」を 2 回までします。購読し直すと `of(req)` から始まるので、`countOuter` を含む**全部のインターセプタ**がもう一度走ります。XSRF のヘッダーを付け直す、認証トークンを読み直す、といった処理も毎回やり直されます。
3. **インターセプタの中：1 回 / 3 回**

   `retryInside` が購読し直すのは自分の `next(req)`、つまり**自分より後ろ**だけです。前にいる `countOuter` は 1 回しか走りません。

`catchError` も同じ考え方です。インターセプタの中で `next(req).pipe(catchError(...))` と書くと、それより前のインターセプタと利用者には「エラーが起きなかった」ように見せられます（代わりの値を返した場合）。特定の画面だけで扱いたいエラーは `get` の後ろ、アプリ全体で同じ扱いをしたいエラー（401 でログイン画面へ、など）はインターセプタ、と分けるのが基本です。なお 404 や 400 のように**やり直しても結果が変わらないエラー**まで `retry` しないよう、`retry({count, delay})` の `delay` 関数で `status` を見て、やり直さないものは `throwError` で返す、という書き方がよく使われます。

## 7. HttpStatusCode

📄 `angular/packages/common/http/src/response.ts` L438–460 （▶ の行: 438–440, 442–443, 450, 456, 460）

```ts
438 ▶ /**
439 ▶  * We use these constant to prevent pulling the whole HttpStatusCode enum
440 ▶  * Those are the only ones referenced directly by the framework
441 │  */
442 ▶ export const HTTP_STATUS_CODE_OK = 200;
443 ▶ export const HTTP_STATUS_CODE_NO_CONTENT = 204;
444 │ 
445 │ /**
446 │  * Http status codes.
447 │  * As per https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml
448 │  * @publicApi
449 │  */
450 ▶ export enum HttpStatusCode {
451 │   Continue = 100,
452 │   SwitchingProtocols = 101,
453 │   Processing = 102,
454 │   EarlyHints = 103,
455 │ 
456 ▶   Ok = HTTP_STATUS_CODE_OK,
457 │   Created = 201,
458 │   Accepted = 202,
459 │   NonAuthoritativeInformation = 203,
460 ▶   NoContent = HTTP_STATUS_CODE_NO_CONTENT,
```

450 行目の `HttpStatusCode` は、IANA の一覧（HTTP ステータスコードの公式な登録簿）をそのまま列挙したもので、`err.status === HttpStatusCode.NotFound` のように数値の代わりに名前で書くためのものです。442〜443 行目、Angular 自身が使うのは 200 と 204 の 2 つだけで、それは**列挙全体ではなく定数として**持っています。438〜440 行目のコメントのとおり、フレームワークのコードが列挙を参照すると、使わない 60 個以上の値まで利用者のバンドルに入ってしまうからです。456 行目と 460 行目は、その定数を列挙の値として再利用しています。

## ここまでの流れ

- 👤 `http.get(url).subscribe({next, error})` — 利用者のコード
  - `of(req).pipe(concatMap(req => handler.handle(req)))` — client.ts（第 3 回） — *購読し直すと、ここから全部やり直す*
    - `インターセプタの連鎖` — interceptor.ts（第 5 回） — *中で retry / catchError すると、後ろだけやり直す・握りつぶす*
      - `FetchBackend.handle(req)` — fetch.ts（第 6 回）
        - `observer.next({type: Sent})` — response.ts L22
        - `new HttpResponse({body, status, ...})` — response.ts L328 — *ok = 200〜299（L253）、body の既定は null（L340）*
        - `new HttpErrorResponse({error, status, statusText, url})` — response.ts L411 — *既定 status 0（L421）、message は 2 通り（L426〜432）、ok は常に false（L409）*

## 聞かれそうな質問

**Q. status 0 って何ですか？**

HTTP の応答を受け取れなかった、という意味です。`HttpErrorResponse` の既定のステータスが 0（421 行目）で、FetchBackend は `fetch` が reject したとき `error.status ?? 0`、XHR は `xhr.status || 0` を渡すので、オフライン・DNS の失敗・CORS での拒否・中断・タイムアウトはすべて 0 になります。JSONP のエラーも全部 0 です（[第 10 回](10-http-jsonp.md)）。デモの「通信失敗」の行で `status` が 0、`error` が `TypeError` になるのを確かめられます。

**Q. エラーのときのレスポンス本文はどこに入りますか？**

`err.error` です（434 行目）。`err.message` は Angular が作った説明文（430〜432 行目）で、サーバーの本文ではありません。本文が JSON ならオブジェクト、JSON でなければ文字列が入ります（fetch\_spec.ts 262・271 行目）。`err.error.message` と書くとサーバーの JSON の `message` を読むことになるので、`err.message` と混同しないようにします。

**Q. 204 No Content のとき body は何になりますか？**

`null` です。本文が無いのでバックエンドは `body` を `null` のまま `HttpResponse` を作り、340 行目でも渡されなければ `null` になります。`ok` は 253 行目で `true` なので、`error` ではなく `next` に届きます。`http.get<User>()` の型が `User` でも実際の値は `null` なので、204 を返す API では型に `| null` を入れておきます。

**Q. 200 なのにエラーになることはありますか？**

あります。`responseType: 'json'`（既定）で本文が JSON として解析できないときです。status は 200 のまま、`ok` は 409 行目で `false`、`message` は 427 行目の `Http failure during parsing for ...` になります。画像やテキストを返す URL を `http.get(url)` で取ると、これになります。`responseType: 'text'` や `'blob'` を指定します。

**Q. HttpErrorResponse は instanceof Error ですか？**

いいえ。401 行目は `extends HttpResponseBase implements Error` で、`Error` の形（`name` と `message`）を持つだけです。エラーの種類を判定するときは `err instanceof HttpErrorResponse` と書きます。

## 読み終えて

- `HttpEvent` は 6 種類。普段は `observe: 'body'` で `Response`（4）の本文だけが見えている
- `ok` は 253 行目の `status >= 200 && status < 300` を一度だけ計算したもの。`HttpErrorResponse` では 409 行目で常に `false`
- `HttpErrorResponse` の既定は status 0。`message` は 2xx なら「解析の失敗」、それ以外は「失敗した応答」。サーバーの本文は `message` ではなく `error`
- JSON の解析に失敗したとき、FetchBackend は `SyntaxError`、XHR は `{error, text}` を `error` に入れる
- 購読し直すとインターセプタの連鎖が先頭から走る。`retry` を `get` の後ろに置くと全部、インターセプタの中に置くとそれより後ろだけがやり直される

---

← 前: [HttpXhrBackend：XMLHttpRequest のイベントと、アップロードの進捗](07-http-backend-xhr.md)  
次: [XSRF 対策：クッキーを読んでヘッダーに載せるインターセプタ](09-http-xsrf.md) →
