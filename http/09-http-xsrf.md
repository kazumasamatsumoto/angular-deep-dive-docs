[目次](../README.md) › [HttpClient の内側](README.md) › 第 9 回 / 全 12 回

# XSRF 対策：クッキーを読んでヘッダーに載せるインターセプタ

> xsrfInterceptorFn が GET / HEAD でないリクエストで、相対 URL（または同じオリジン）のときだけ HttpXsrfCookieExtractor でクッキーを読み、X-XSRF-TOKEN ヘッダーを付ける行。クッキーの解析をキャッシュする仕組み、サーバーでは読まない理由、withXsrfConfiguration と withNoXsrfProtection、別オリジンの URL に付けない理由（同じオリジンなら絶対 URL にも付く）、子の注入器ではクッキー名の設定が root から読まれる落とし穴。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/http-xsrf)

---

`provideHttpClient()` を書いただけで、POST のリクエストに `X-XSRF-TOKEN` というヘッダーが付くことがあります。付けているのは `provideHttpClient` が最初から連鎖の先頭に入れている `xsrfInterceptorFn` です。この章では、その関数が「付けない」と判断する 4 つの条件を 1 行ずつ読み、クッキーを読む `HttpXsrfCookieExtractor` が解析結果をキャッシュする仕組みと、サーバーでは何もしない行を確かめます。

読む対象は `packages/common/http/src/xsrf.ts`（全体で 141 行）と、クッキー文字列を解析する `packages/common/src/cookie.ts`、挙動の根拠として `test/xsrf_spec.ts` です。`withXsrfConfiguration` / `withNoXsrfProtection` が何を provide するかは [第 2 回](02-http-provide.md)で読んだので、ここではそのトークンを**読む側**を追います。

1. [1. 概観](01-http-overview.md)
2. [2. provideHttpClient と features](02-http-provide.md)
3. [3. HttpClient.request](03-http-client-request.md)
4. [4. 不変なリクエスト](04-http-request-immutable.md)
5. [5. インターセプタの連鎖](05-http.md)
6. [6. FetchBackend](06-http-backend-fetch.md)
7. [7. HttpXhrBackend](07-http-backend-xhr.md)
8. [8. HttpEvent とエラー](08-http-response-errors.md)
9. **9. XSRF 対策**（この章）
10. [10. JSONP](10-http-jsonp.md)
11. [11. SSR の転送キャッシュ](11-http-transfer-cache.md)
12. [12. テスト用バックエンド](12-http-testing.md)

## 0. XSRF とは何で、この仕組みは何を防ぐのか

XSRF（CSRF とも書く。クロスサイト・リクエスト・フォージェリ）は、**攻撃者のページが、利用者のブラウザに入っているクッキーを使って、こちらの API に勝手にリクエストを送らせる**攻撃です。ブラウザはフォーム送信などに、送り先のサイトのクッキーを自動で付けるので、サーバーは「本人の操作か」をクッキーだけでは区別できません。

Angular が手伝うのは「二重送信クッキー」と呼ばれる対策のクライアント側です。サーバーがランダムな値を `XSRF-TOKEN` クッキーに入れておき、`HttpClient` がそのクッキーを JavaScript で読んで、同じ値を `X-XSRF-TOKEN` ヘッダーに載せます。別のオリジン（スキーム・ホスト・ポートの組）のページはこのクッキーを読めないので、正しいヘッダーを作れません。サーバーはクッキーとヘッダーが一致するかを比べます。**比べるのはサーバーの仕事**で、Angular の側にあるのは「読んで、載せる」だけです。

## 1. 3 つのトークン

📄 `angular/packages/common/http/src/xsrf.ts` L25–47 （▶ の行: 25, 28, 32–33, 36–37, 41–42, 45）

```ts
25 ▶ export const XSRF_ENABLED = new InjectionToken<boolean>(
26 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'XSRF_ENABLED' : '',
27 │   {
28 ▶     factory: () => true,
29 │   },
30 │ );
31 │ 
32 ▶ export const XSRF_DEFAULT_COOKIE_NAME = 'XSRF-TOKEN';
33 ▶ export const XSRF_COOKIE_NAME = new InjectionToken<string>(
34 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'XSRF_COOKIE_NAME' : '',
35 │   {
36 ▶     // Providing a factory implies that the token is provided in root by default
37 ▶     factory: () => XSRF_DEFAULT_COOKIE_NAME,
38 │   },
39 │ );
40 │ 
41 ▶ export const XSRF_DEFAULT_HEADER_NAME = 'X-XSRF-TOKEN';
42 ▶ export const XSRF_HEADER_NAME = new InjectionToken<string>(
43 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'XSRF_HEADER_NAME' : '',
44 │   {
45 ▶     factory: () => XSRF_DEFAULT_HEADER_NAME,
46 │   },
47 │ );
```

3 つとも `factory` 付きの `InjectionToken` です。`factory` を持つトークンは誰も provide しなくてもルートの注入器で値が作られます（36 行目のコメント）。28 行目、`XSRF_ENABLED` の既定は `true`。32 行目のクッキー名の既定は `'XSRF-TOKEN'`、41 行目のヘッダー名の既定は `'X-XSRF-TOKEN'` です。`withNoXsrfProtection()` は 25 行目を `false` に、`withXsrfConfiguration()` は 33 行目と 42 行目を上書きします（第 2 回）。

## 2. xsrfInterceptorFn：付けない条件が 4 つ

📄 `angular/packages/common/http/src/xsrf.ts` L94–127 （▶ の行: 98–101, 105–109, 111–112, 114, 116, 119–120, 122–124, 126）

```ts
 94 │ export function xsrfInterceptorFn(
 95 │   req: HttpRequest<unknown>,
 96 │   next: HttpHandlerFn,
 97 │ ): Observable<HttpEvent<unknown>> {
 98 ▶   // Skip both non-mutating requests
 99 ▶   // Non-mutating requests generally don't require a token.
100 ▶   if (!inject(XSRF_ENABLED) || req.method === 'GET' || req.method === 'HEAD') {
101 ▶     return next(req);
102 │   }
103 │ 
104 │   try {
105 ▶     const locationHref = inject(PlatformLocation).href;
106 ▶     const {origin: locationOrigin} = new URL(locationHref);
107 ▶     // We can use `new URL` to normalize a relative URL like '//something.com' to
108 ▶     // 'https://something.com' in order to make consistent same-origin comparisons.
109 ▶     const {origin: requestOrigin} = new URL(req.url, locationOrigin);
110 │ 
111 ▶     if (locationOrigin !== requestOrigin) {
112 ▶       return next(req);
113 │     }
114 ▶   } catch {
115 │     // Handle invalid URLs gracefully.
116 ▶     return next(req);
117 │   }
118 │ 
119 ▶   const token = inject(HttpXsrfTokenExtractor).getToken();
120 ▶   const headerName = inject(XSRF_HEADER_NAME);
121 │ 
122 ▶   // Be careful not to overwrite an existing header of the same name.
123 ▶   if (token != null && !req.headers.has(headerName)) {
124 ▶     req = req.clone({headers: req.headers.set(headerName, token)});
125 │   }
126 ▶   return next(req);
127 │ }
```

1. **100 行目：無効、または GET / HEAD なら何もしない**

   `inject(XSRF_ENABLED)` が `false`（`withNoXsrfProtection()`）か、メソッドが `GET` か `HEAD` なら、101 行目でリクエストをそのまま次へ渡します。98〜99 行目のコメントのとおり、データを変えないリクエストにはトークンが要らない、という判断です。`POST`・`PUT`・`PATCH`・`DELETE`、それに `OPTIONS` や `JSONP` もこの行を通り抜けます。
2. **105〜106 行目：いまのページのオリジンを求める**

   `PlatformLocation`（ブラウザでは `window.location` を包んだもの）の `href` を `new URL` に渡して、`origin`（`https://example.com` のような「スキーム + ホスト + ポート」）だけを取ります。
3. **109 行目：リクエスト先のオリジンを、ページのオリジンを基準に求める**

   `new URL(req.url, locationOrigin)` の 2 つ目の引数は「相対 URL の基準」です。`'/api/todos'` のような相対 URL はページと同じオリジンになり、`'https://api.example.com/x'` のような絶対 URL はそれ自身のオリジンになります。107〜108 行目のコメントのとおり、`'//api.example.com/x'`（スキームを省いた「プロトコル相対」URL）も、ここでページのスキームが補われて正しく比べられます。
4. **111〜112 行目：オリジンが違えば何もしない**

   **判定は「相対か絶対か」ではなく「同じオリジンか」**です。絶対 URL でも、ページと同じオリジンならトークンが付きます。
5. **114〜116 行目：URL として解釈できなければ何もしない**

   `new URL` は不正な文字列で例外を投げます。そのときは付けずに次へ渡し、リクエスト自体は止めません。
6. **119〜120 行目：トークンとヘッダー名を取る**

   トークンは 3 節の `HttpXsrfTokenExtractor` から、ヘッダー名は 1 節の 42 行目のトークンから取ります。
7. **123〜124 行目：トークンがあり、同じ名前のヘッダーがまだ無いときだけ付ける**

   クッキーが無ければ `getToken()` は `null` なので付きません。利用者が自分で同じヘッダーを付けていれば上書きしません（122 行目のコメント）。付けるときは `req.clone(...)` で新しいリクエストを作ります。`HttpRequest` は不変なので書き換えられないからです（[第 4 回](04-http-request-immutable.md)）。

同じオリジンかどうかの判定は、テストで 4 通り確かめられています。このテストのページの URL は `http://sub.example.com/` です。

📄 `angular/packages/common/http/test/xsrf_spec.ts` L88–120 （▶ の行: 90, 93, 98, 100, 106, 109, 115, 118）

```ts
 88 │   it('does not apply XSRF protection when request is absolute and cross-origin', () => {
 89 │     interceptor
 90 ▶       .intercept(new HttpRequest('POST', 'https://example.com/test', {}), backend)
 91 │       .subscribe();
 92 │     const req = backend.expectOne('https://example.com/test');
 93 ▶     expect(req.request.headers.has('X-XSRF-TOKEN')).toBeFalse();
 94 │     req.flush({});
 95 │   });
 96 │ 
 97 │   it('does not apply XSRF protection when request is protocol relative and cross-origin', () => {
 98 ▶     interceptor.intercept(new HttpRequest('POST', '//example.com/test', {}), backend).subscribe();
 99 │     const req = backend.expectOne('//example.com/test');
100 ▶     expect(req.request.headers.has('X-XSRF-TOKEN')).toBeFalse();
101 │     req.flush({});
102 │   });
103 │ 
104 │   it('does apply XSRF protection when request is same-origin', () => {
105 │     interceptor
106 ▶       .intercept(new HttpRequest('POST', 'http://sub.example.com/test', {}), backend)
107 │       .subscribe();
108 │     const req = backend.expectOne('http://sub.example.com/test');
109 ▶     expect(req.request.headers.has('X-XSRF-TOKEN')).toBeTrue();
110 │     req.flush({});
111 │   });
112 │ 
113 │   it('does apply XSRF protection when request is protocol relative and same-origin', () => {
114 │     interceptor
115 ▶       .intercept(new HttpRequest('POST', '//sub.example.com/test', {}), backend)
116 │       .subscribe();
117 │     const req = backend.expectOne('//sub.example.com/test');
118 ▶     expect(req.request.headers.has('X-XSRF-TOKEN')).toBeTrue();
119 │     req.flush({});
120 │   });
```

90・93 行目、別オリジンの絶対 URL には付かない。98・100 行目、別オリジンのプロトコル相対 URL にも付かない。106・109 行目、**同じオリジンの絶対 URL には付く**。115・118 行目、同じオリジンのプロトコル相対 URL にも付く。

## 3. HttpXsrfTokenExtractor と HttpXsrfCookieExtractor

📄 `angular/packages/common/http/src/xsrf.ts` L79–92 （▶ の行: 84–85, 89, 91）

```ts
79 │ /**
80 │  * Retrieves the current XSRF token to use with the next outgoing request.
81 │  *
82 │  * @publicApi
83 │  */
84 ▶ @Injectable({providedIn: 'root', useExisting: HttpXsrfCookieExtractor})
85 ▶ export abstract class HttpXsrfTokenExtractor {
86 │   /**
87 │    * Get the XSRF token to use with an outgoing request.
88 │    *
89 ▶    * Will be called for every request, so the token may change between requests.
90 │    */
91 ▶   abstract getToken(): string | null;
92 │ }
```

119 行目で inject しているのは、この抽象クラスです。84 行目の `useExisting: HttpXsrfCookieExtractor` で、実体は次のクラスになります。抽象クラスにしてあるのは、クッキー以外（たとえばメタタグ）からトークンを読みたいときに `{provide: HttpXsrfTokenExtractor, useClass: ...}` で差し替えられるようにするためです。テストも 1 つ目の `describe` でこの差し替えをしています。89 行目のコメントのとおり、`getToken()` は**リクエストのたびに**呼ばれます。

📄 `angular/packages/common/http/src/xsrf.ts` L49–77 （▶ の行: 52, 54–55, 57–58, 63, 66–67, 69–73, 75）

```ts
49 │ /**
50 │  * `HttpXsrfTokenExtractor` which retrieves the token from a cookie.
51 │  */
52 ▶ @Service()
53 │ export class HttpXsrfCookieExtractor implements HttpXsrfTokenExtractor {
54 ▶   private readonly cookieName = inject(XSRF_COOKIE_NAME);
55 ▶   private readonly doc = inject(DOCUMENT);
56 │ 
57 ▶   private lastCookieString: string = '';
58 ▶   private lastToken: string | null = null;
59 │ 
60 │   /**
61 │    * @internal for testing
62 │    */
63 ▶   parseCount: number = 0;
64 │ 
65 │   getToken(): string | null {
66 ▶     if (typeof ngServerMode !== 'undefined' && ngServerMode) {
67 ▶       return null;
68 │     }
69 ▶     const cookieString = this.doc.cookie || '';
70 ▶     if (cookieString !== this.lastCookieString) {
71 ▶       this.parseCount++;
72 ▶       this.lastToken = parseCookieValue(cookieString, this.cookieName);
73 ▶       this.lastCookieString = cookieString;
74 │     }
75 ▶     return this.lastToken;
76 │   }
77 │ }
```

1. **66〜68 行目：サーバーでは常に `null`**

   `ngServerMode` は SSR やプリレンダーのときだけ `true` になる大域の定数です。サーバー上では `document.cookie` を読まずに `null` を返すので、123 行目の条件でヘッダーは付きません。
2. **69 行目：`document.cookie` を毎回読む**

   `document.cookie` はそのページで読めるクッキーを `"a=1; XSRF-TOKEN=abc; b=2"` のような 1 本の文字列で返します。
3. **70 行目：前回と同じ文字列なら解析しない**

   57 行目の `lastCookieString` と比べ、同じなら 75 行目で 58 行目の `lastToken` を返すだけです。クッキーが変わったときだけ、71 行目で 63 行目の `parseCount`（テスト用の数）を増やし、72 行目で解析し、73 行目で文字列を覚えます。文字列の比較は `===` 1 回なので、毎回 `split` して探すより安く済みます。
4. **54〜55 行目：クッキー名と document は inject で取る**

   54 行目の `XSRF_COOKIE_NAME` は 1 節の 33 行目のトークンです。**このクラスがどの注入器で作られたか**によって、どのクッキー名を読むかが決まります（4 節）。

📄 `angular/packages/common/http/test/xsrf_spec.ts` L188–203 （▶ の行: 192–195, 198, 200–202）

```ts
188 │   it('parses the cookie from document.cookie', () => {
189 │     expect(extractor.getToken()).toEqual('test');
190 │   });
191 │ 
192 ▶   it('does not re-parse if document.cookie has not changed', () => {
193 ▶     expect(extractor.getToken()).toEqual('test');
194 ▶     expect(extractor.getToken()).toEqual('test');
195 ▶     expect(getParseCount(extractor)).toEqual(1);
196 │   });
197 │ 
198 ▶   it('re-parses if document.cookie changes', () => {
199 │     expect(extractor.getToken()).toEqual('test');
200 ▶     document['cookie'] = 'XSRF-TOKEN=blah';
201 ▶     expect(extractor.getToken()).toEqual('blah');
202 ▶     expect(getParseCount(extractor)).toEqual(2);
203 │   });
```

192〜196 行目、クッキーが変わらなければ 2 回呼んでも解析は 1 回。198〜203 行目、200 行目で `cookie` を書き換えると、次の `getToken()` で解析し直して 2 回になります。

📄 `angular/packages/common/src/cookie.ts` L9–36 （▶ の行: 10, 12–15, 17, 23, 28–29, 32, 35）

```ts
 9 │ export function parseCookieValue(cookieStr: string, name: string): string | null {
10 ▶   name = encodeURIComponent(name);
11 │ 
12 ▶   for (const cookie of cookieStr.split(';')) {
13 ▶     const eqIndex = cookie.indexOf('=');
14 ▶     const [cookieName, cookieValue]: string[] =
15 ▶       eqIndex == -1 ? [cookie, ''] : [cookie.slice(0, eqIndex), cookie.slice(eqIndex + 1)];
16 │ 
17 ▶     if (cookieName.trim() !== name) {
18 │       continue;
19 │     }
20 │ 
21 │     let value = cookieValue;
22 │     try {
23 ▶       value = decodeURIComponent(cookieValue);
24 │     } catch {
25 │       // Fall back to raw cookie value if decoding fails (e.g. malformed percent-encoding).
26 │     }
27 │ 
28 ▶     if (value.length > 1 && value[0] === '"' && value[value.length - 1] === '"') {
29 ▶       value = value.slice(1, -1);
30 │     }
31 │ 
32 ▶     return value;
33 │   }
34 │ 
35 ▶   return null;
36 │ }
```

72 行目が呼ぶ `parseCookieValue` です（`@angular/common` が `ɵparseCookieValue` として内部向けに export しているもの）。10 行目で探す名前を URL エンコードし、12 行目で `;` で区切り、13〜15 行目で最初の `=` の位置で名前と値に分けます（値の中の `=` は残ります）。17 行目で前後の空白を取った名前を比べ、23 行目で URL デコード（失敗したら生の値のまま）、28〜29 行目で値が `"..."` で囲まれていれば外します。見つからなければ 35 行目で `null` です。

## 4. どの注入器のクッキー名が使われるか

52 行目の `@Service()` は v22 の新しいデコレーターで、既定で `providedIn: 'root'` と同じ扱いになります（`@angular/core` の `ɵɵdefineService` が `autoProvided === false` でなければ `providedIn: 'root'` を返します。[起動時の注入器の章](../boot/08-boot-injectors.md)で読みました）。84 行目の `HttpXsrfTokenExtractor` も `providedIn: 'root'` です。つまり **`HttpXsrfCookieExtractor` はルートの注入器で 1 つだけ作られ、54 行目の `XSRF_COOKIE_NAME` もルートの注入器から読みます**。

一方、120 行目のヘッダー名は、インターセプタが動いている注入器（`provideHttpClient` を書いた注入器）から読みます。`provideHttpClient(withXsrfConfiguration(...))` を `app.config.ts`（ルート）に書く普通の使い方なら、両方ともルートなので問題は起きません。しかし**子の環境注入器**（遅延ロードするルートの `providers` や、`createEnvironmentInjector`）に書くと、**ヘッダー名は効くのに、クッキー名は効きません**。次のデモの B の行で確かめられます。

> [!NOTE]
> **さらに深く**
>
> 子の注入器に無いトークンを、`providedIn: 'root'` の定義を見て「自分で作る」か「親に任せる」かを決めるのは `R3Injector.get` の `injectableDefInScope` です（[providedIn の章](../ngmodule/10-ngmodule-provided-in.md)）。子の環境注入器のスコープには `'root'` が無いので、親に任せます。古い `HttpClientXsrfModule` は自分の providers に `{provide: HttpXsrfTokenExtractor, useClass: HttpXsrfCookieExtractor}` を持っているので（[第 2 回](02-http-provide.md)の `module.ts` の引用）、そのモジュールの注入器で抽出器が作られます。

## 5. DEMO：どのリクエストにヘッダーが付くか

> **🧪 DEMO — クッキーを置いて 9 本のリクエストを送り、バックエンドに届いたヘッダーを見る**
>
> 章の中で子の環境注入器を 2 つ作っています。A は `provideHttpClient()`、B は `provideHttpClient(withXsrfConfiguration({ cookieName: 'DEMO-XSRF-TOKEN', headerName: 'X-DEMO-XSRF' }))`。どちらも `HttpBackend` を「届いたヘッダーを記録して、通信せずに 200 を返す」ものに差し替えているので、`api.example.com` 宛てのリクエストも実際には送られません。クッキーは `path=/; max-age=600` で置き、この章を離れるときに消します。4 節の理由で、A のために置くクッキーは既定の名前 `XSRF-TOKEN` です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/http-xsrf)

1. **クッキーを置かずに送る**

   どの行にも付きません。`getToken()` が `null` で、123 行目の条件を満たさないからです。
2. **`XSRF-TOKEN` を置いて送る**

   付くのは「POST 相対 URL」「DELETE 相対 URL」「POST 絶対 URL（同じオリジン）」の 3 本です。GET と HEAD は 100 行目、別オリジンの 2 本は 111 行目で外れます。「ヘッダーを自分で付けたもの」は `mine` のまま、123 行目の `!req.headers.has(headerName)` で上書きされません。
3. **B の行を見る**

   B は `DEMO-XSRF-TOKEN` を読む設定なのに、`X-DEMO-XSRF` に入るのは **`XSRF-TOKEN` の値**です。`DEMO-XSRF-TOKEN` だけを置いた状態では、B にも何も付きません。ヘッダー名（120 行目）は B の注入器の値、クッキー名（54 行目）はルートの値が使われる、という 4 節のとおりです。
4. **parseCount を見る**

   クッキーを変えずに「9 本送る」を何度押しても、`parseCount` は増えません（70 行目）。クッキーを置き直すと、次に送ったときに 1 増えます。クッキーが 1 つも無いページで最初に送ったときは 0 のままです。`document.cookie` が空文字で、57 行目の初期値 `''` と等しいので、70 行目で解析を飛ばすからです。

## 6. クラス版の HttpXsrfInterceptor

📄 `angular/packages/common/http/src/xsrf.ts` L129–141 （▶ の行: 132–134, 137–138）

```ts
129 │ /**
130 │  * `HttpInterceptor` which adds an XSRF token to eligible outgoing requests.
131 │  */
132 ▶ @Injectable()
133 ▶ export class HttpXsrfInterceptor implements HttpInterceptor {
134 ▶   private readonly injector = inject(EnvironmentInjector);
135 │ 
136 │   intercept(initialRequest: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
137 ▶     return runInInjectionContext(this.injector, () =>
138 ▶       xsrfInterceptorFn(initialRequest, (downstreamRequest) => next.handle(downstreamRequest)),
139 │     );
140 │   }
141 │ }
```

`HttpClientXsrfModule` が `HTTP_INTERCEPTORS` に登録するクラス版です。中身は 137〜138 行目で、134 行目の注入器を注入コンテキストにして `xsrfInterceptorFn` を呼ぶだけです。`next.handle`（クラス版の次のハンドラ）を関数版の `next` の形に包んで渡しています。判定のロジックは 1 つしかありません。

## ここまでの流れ

- 👤 `http.post('/api/todos', body).subscribe()` — 利用者のコード
  - `HttpInterceptorHandler.handle(req)` — backend.ts（第 5 回） — *HTTP\_INTERCEPTOR\_FNS の先頭は provideHttpClient が入れた xsrfInterceptorFn*
    - `xsrfInterceptorFn(req, next)` — xsrf.ts L94 — *無効 / GET / HEAD（L100）、別オリジン（L111）、URL 不正（L114）なら素通り*
      - `inject(HttpXsrfTokenExtractor).getToken()` — xsrf.ts L119 → L65 — *ルートの HttpXsrfCookieExtractor。サーバーでは null（L66）*
        - `parseCookieValue(document.cookie, cookieName)` — common/src/cookie.ts L9 — *cookie 文字列が前回と同じなら呼ばれない（L70）*
      - `req.clone({headers: req.headers.set(headerName, token)})` — xsrf.ts L124 — *トークンがあり、同名のヘッダーが無いときだけ（L123）*
    - `next(req)` — xsrf.ts L126 — *次のインターセプタ、最後はバックエンド*

## 聞かれそうな質問

**Q. なぜ GET にはトークンが付かないのですか？**

100 行目で `GET` と `HEAD` を最初に外しているからです。98〜99 行目のコメントのとおり、データを変えないリクエストは攻撃されても被害が出ない、という前提です。裏返すと、**GET でデータを変える API を作ると、この仕組みでは守られません**。状態を変える操作は POST / PUT / PATCH / DELETE にします。

**Q. 別ドメインの API にはなぜ付かないのですか？**

109〜112 行目で、リクエスト先のオリジンがページのオリジンと違えば何もしないからです。トークンは自分のサーバーとだけ共有する秘密なので、他のサーバーに送ると漏れてしまいます。絶対 URL でも同じオリジンなら付きます（xsrf\_spec.ts 106・109 行目）。別オリジンの API（`api.example.com` など）で XSRF 対策をしたいときは、その API 向けのインターセプタを自分で書いてヘッダーを付けます。

**Q. サーバーサイドレンダリングのときはどうなりますか？**

何も付きません。66〜68 行目で `ngServerMode` のときは `getToken()` が `null` を返し、123 行目の条件で素通りします。サーバーの上の `document` は Angular がレンダリング用に作ったもので、利用者のブラウザのクッキーは入っていません。サーバーから API にトークンを送る必要があるなら、リクエストのクッキーを読んでヘッダーを付けるインターセプタをサーバー用の providers に足します。

**Q. withXsrfConfiguration でクッキー名を変えたのに効きません**

`provideHttpClient` をルート以外の注入器に書いていないか確かめます。52 行目の `@Service()` と 84 行目の `providedIn: 'root'` で抽出器はルートに 1 つだけ作られ、54 行目のクッキー名もルートから読みます。ヘッダー名（120 行目）だけが子の注入器の値になります（デモの B の行）。ルートに書くか、子の注入器で `{provide: HttpXsrfTokenExtractor, useFactory: ...}` を自分で provide します。

**Q. クッキーを読むのは毎回ですか？**

`document.cookie` の文字列は毎回読みますが（69 行目）、解析は文字列が変わったときだけです（70〜74 行目）。xsrf\_spec.ts 195 行目で、変わらなければ `parseCount` が 1 のままであることを確かめています。

## 読み終えて

- `xsrfInterceptorFn` は `provideHttpClient()` が最初から連鎖の先頭に入れている。止めるのは `withNoXsrfProtection()`（`XSRF_ENABLED` を `false`）
- 付けない条件は 4 つ：無効か GET / HEAD（L100）、別オリジン（L111）、URL が不正（L114）、トークンが無いか同名のヘッダーがある（L123）
- 判定は「相対 URL か」ではなく「同じオリジンか」。同じオリジンなら絶対 URL にも付く
- `HttpXsrfCookieExtractor` は `document.cookie` の文字列が前回と同じなら解析し直さない。サーバーでは常に `null`
- 抽出器はルートに 1 つ。子の注入器の `withXsrfConfiguration` ではヘッダー名だけが効き、クッキー名は効かない

---

← 前: [HttpEvent と HttpErrorResponse：イベントの種類、ok、エラーの作られ方](08-http-response-errors.md)  
次: [JSONP：script 要素を差し込んでコールバックを待つバックエンド](10-http-jsonp.md) →
