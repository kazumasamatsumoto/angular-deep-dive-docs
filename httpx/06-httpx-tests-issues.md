[目次](../README.md) › [HttpClient の細部と issue](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：packages/common/http の今

> packages/common/http/test と testing の spec の分け方と手元での走らせ方。ラベル area: common/http の開いている issue と最近閉じた issue の表、どの issue がこのシリーズのどの章の行に関係するか、2026 年の修正の傾向（小さく、spec つき、1 つの振る舞い）。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/httpx-tests-issues)

---

シリーズの最後に、`packages/common/http` の spec がどう分かれていて、手元でどう走らせるのかを確かめ、ラベル `area: common/http` の開いている issue 36 件と、2025-06 以降に閉じた 53 件を、このシリーズと既存の章に振り分けます。そのうえで、2026 年の修正のコミットを数えて傾向を読み、このシリーズで見つけた「不具合らしきもの」を 1 つの表にまとめます。

読む対象は `packages/common/http/test/`（spec 14 ファイルと、偽物の部品 2 ファイル）と `packages/common/http/testing/test/`、それぞれの `BUILD.bazel` です。Bazel のターゲットの読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせるやり方の一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、`HttpTestingController` の中身は[テスト用バックエンドの章](../http/12-http-testing.md)にあります。

1. [1. HttpRequest の options](01-httpx-request-options.md)
2. [2. headers と params の更新](02-httpx-headers-params-updates.md)
3. [3. オーバーロードの型](03-httpx-overload-types.md)
4. [4. httpResource の型](04-httpx-resource-types.md)
5. [5. 転送キャッシュのキー](05-httpx-transfer-cache-key.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

ファイルごとの一番外の `describe` と、`it(` で始まる行の数（grep で数えたもの）、Node で実際に走った数です。Node の数は、一番外の `describe` の名前ごとに `--test_arg=--filter=^名前 ` で走らせて「Ran N of 410 specs」を読んだもの（scratchpad/httpx-logs/b-count.log）で、合計は 410 です。

| ファイル | 行数 | 一番外の describe（行） | it の行 | Node で走った数 |
| --- | --- | --- | --- | --- |
| `test/client_spec.ts` | 309 | `HttpClient`（17）<br> | 29 | 29 |
| `test/context_spec.ts` | 62 | `HttpContext`（17）<br> | 3 | 3 |
| `test/fetch_spec.ts` | 954 | `FetchBackend`（55）<br> | 52 | 52 |
| `test/headers_spec.ts` | 228 | `HttpHeaders`（11）<br> | 24 | 24 |
| `test/jsonp_spec.ts` | 205 | `JsonpClientBackend`（28）<br> | 12 | 12 |
| `test/module_spec.ts` | 150 | `HttpClientModule`（79）<br> | 5 | 5 |
| `test/params_spec.ts` | 246 | `HttpUrlEncodedParams`（11）<br> | 36 | 36 |
| `test/provider_spec.ts` | 950 | `without provideHttpClientTesting`（58）<br>`provideHttpClient`（99）<br>`without providers`（748）<br>`HttpInterceptor signal tracking`（856）<br> | 37 | 42 |
| `test/request_spec.ts` | 319 | `HttpRequest`（17）<br> | 59 | 59 |
| `test/resource_spec.ts` | 503 | `httpResource`（28）<br> | 22 | 22 |
| `test/response_spec.ts` | 120 | `HttpResponse`（12）<br> | 7 | 7 |
| `test/transfer_cache_spec.ts` | 1395 | `TransferCache`（73）<br> | 71 | 71 |
| `test/xhr_spec.ts` | 470 | `XhrBackend`（54）<br> | 33 | 33 |
| `test/xsrf_spec.ts` | 224 | `HttpXsrfInterceptor`（33）<br>`HttpXsrfCookieExtractor`（170）<br> | 15 | 15 |
| `testing/test/request_spec.ts` | 170 | `HttpClient TestRequest`（17）<br> | 8 | 6 |

- 数が合わないのは 2 つだけです。`provider_spec.ts` は 37 行に対して 42 件で、`for (const backend of ['fetch', 'xhr'])` の中の `describe` が 5 つの it を 2 回作るからです（it の行は 1 回しか書かれていない）。
- `testing/test/request_spec.ts` は 8 行に対して Node で 6 件、ブラウザで 7 件です。理由は 3 節の 143〜167 行目です。
- 一番多いのは `transfer_cache_spec.ts` の 71 件で、`TransferCache` の 1 つの describe に入っています（[第 5 回](05-httpx-transfer-cache-key.md)）。その次が `request_spec.ts` の 59 件（[第 1 回](01-httpx-request-options.md)）です。
- `resource_spec.ts` の 22 件のうち 3 件（describe `types`）は、コンパイルが通ることが中身の it です（[第 4 回](04-httpx-resource-types.md)のテストの節）。

## 2. 同じ spec を Node とブラウザで 2 回走らせる BUILD.bazel

📄 `angular/packages/common/http/test/BUILD.bazel` L1–35 （▶ の行: 1, 3–4, 6–8, 10, 23–26, 28, 30–33, 35）

```python
 1 ▶ load("//tools:defaults.bzl", "ts_project", "zoneless_jasmine_test", "zoneless_web_test_suite")
 2 │ 
 3 ▶ ts_project(
 4 ▶     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob(
 7 ▶         ["**/*.ts"],
 8 ▶     ),
 9 │     visibility = ["//:__pkg__"],
10 ▶     deps = [
11 │         "//:node_modules/rxjs",
12 │         "//packages:types",
13 │         "//packages/common",
14 │         "//packages/common/http",
15 │         "//packages/common/http/testing",
16 │         "//packages/common/testing",
17 │         "//packages/core",
18 │         "//packages/core/testing",
19 │         "//packages/private/testing",
20 │     ],
21 │ )
22 │ 
23 ▶ zoneless_jasmine_test(
24 ▶     name = "test",
25 ▶     data = [
26 ▶         ":test_lib",
27 │     ],
28 ▶ )
29 │ 
30 ▶ zoneless_web_test_suite(
31 ▶     name = "test_web",
32 ▶     deps = [
33 ▶         ":test_lib",
34 │     ],
35 ▶ )
```

1. **3〜8 行目：`ts_project` の `test_lib` が、ディレクトリの `**/*.ts` を全部まとめる**

   spec も `xhr_mock.ts` と `jsonp_mock.ts` も、1 つのライブラリにコンパイルされます。spec のファイルを足しても BUILD.bazel を書き換える必要はありません。
2. **23〜28 行目：`zoneless_jasmine_test` の `test` が、それを Node の jasmine で走らせる**

   26 行目の `":test_lib"` を `data` で受け取ります。
3. **30〜35 行目：`zoneless_web_test_suite` の `test_web` が、同じ `test_lib` をブラウザで走らせる**

   33 行目で同じ `":test_lib"` を `deps` で受け取ります。`test_web` は 1 つの名前ですが、実際には `test_web_chromium` と `test_web_firefox` の 2 つのターゲットになります（4 節の結果）。

📄 `angular/tools/bazel/jasmine_test.bzl` L12–18 （▶ の行: 12–13, 15–16）

```python
12 ▶ def zoneless_jasmine_test(name, data = [], fixed_args = [], **kwargs):
13 ▶     jasmine_test(
14 │         name = name,
15 ▶         data = data + ["//tools/testing:node_zoneless", "//tools/testing:node_zoneless_tests.init.mjs"],
16 ▶         fixed_args = fixed_args + ["--require=$$JS_BINARY__RUNFILES/$(rlocationpath //tools/testing:node_zoneless_tests.init.mjs)"],
17 │         **kwargs
18 │     )
```

📄 `angular/tools/bazel/web_test.bzl` L38–44 （▶ の行: 38–39, 42）

```python
38 ▶ def zoneless_web_test_suite(deps = [], bootstrap = [], **kwargs):
39 ▶     web_test(
40 │         deps = deps,
41 │         bootstrap = [
42 ▶             "//tools/testing:browser_zoneless",
43 │         ] + bootstrap,
44 │         **kwargs
```

jasmine\_test.bzl の 15・16 行目で、Node の側は `node_zoneless_tests.init.mjs` を `--require` で先に読み込みます。web\_test.bzl の 42 行目で、ブラウザの側は `browser_zoneless` を bootstrap に足します。どちらも名前のとおり zone.js を読まない初期化です （中身は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)の章）。

📄 `angular/packages/common/http/testing/test/BUILD.bazel` L1–30 （▶ の行: 1, 18, 21, 23, 25, 28, 30）

```python
 1 ▶ load("//tools:defaults.bzl", "angular_jasmine_test", "ng_web_test_suite", "ts_project")
 2 │ 
 3 │ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 │     srcs = glob(
 7 │         ["**/*.ts"],
 8 │     ),
 9 │     visibility = ["//:__pkg__"],
10 │     deps = [
11 │         "//:node_modules/rxjs",
12 │         "//packages/common/http",
13 │         "//packages/common/http/testing",
14 │         "//packages/private/testing",
15 │     ],
16 │ )
17 │ 
18 ▶ angular_jasmine_test(
19 │     name = "test",
20 │     data = [
21 ▶         ":test_lib",
22 │     ],
23 ▶ )
24 │ 
25 ▶ ng_web_test_suite(
26 │     name = "test_web",
27 │     deps = [
28 ▶         ":test_lib",
29 │     ],
30 ▶ )
```

`testing/test` の BUILD.bazel は形は同じですが、1 行目で読むのが `angular_jasmine_test` と `ng_web_test_suite` です。18〜23 行目と 25〜30 行目がそれで（21・28 行目で同じ `":test_lib"` を渡す）、こちらは zone.js を読む初期化（`//tools/testing:node`・`//tools/testing:browser`）で走ります。同じパッケージの中で、2 つのディレクトリの初期化が違います。

## 3. 偽物の部品：xhr\_mock・jsonp\_mock・MockFetchFactory

`HttpClientTestingBackend` は `HttpBackend` ごと差し替えるので、本物のバックエンドの spec には使えません。本物の `HttpXhrBackend`・`JsonpClientBackend`・`FetchBackend` を確かめるために、その**下**にある `XMLHttpRequest`・`document`・`fetch` を偽物にします。

📄 `angular/packages/common/http/test/xhr_mock.ts` L9–18 （▶ の行: 9, 12, 15–16）

```ts
 9 ▶ import {XhrFactory} from '../../index';
10 │ import {HttpHeaders} from '../src/headers';
11 │ 
12 ▶ export class MockXhrFactory implements XhrFactory {
13 │   mock!: MockXMLHttpRequest;
14 │ 
15 ▶   build(): XMLHttpRequest {
16 ▶     return (this.mock = new MockXMLHttpRequest()) as any;
17 │   }
18 │ }
```

📄 `angular/packages/common/http/test/xhr_spec.ts` L54–63 （▶ の行: 59, 61–62）

```ts
54 │ describe('XhrBackend', () => {
55 │   let factory: MockXhrFactory = null!;
56 │   let backend: HttpXhrBackend = null!;
57 │   beforeEach(() => {
58 │     TestBed.configureTestingModule({
59 ▶       providers: [{provide: XhrFactory, useClass: MockXhrFactory}],
60 │     });
61 ▶     factory = TestBed.inject(XhrFactory) as MockXhrFactory;
62 ▶     backend = TestBed.inject(HttpXhrBackend);
63 │   });
```

📄 `angular/packages/common/http/test/xhr_mock.ts` L98–107 （▶ の行: 98–100, 102, 104, 106–107）

```ts
 98 ▶   mockFlush(status: number, statusText: string, body?: string) {
 99 ▶     if (typeof body === 'string') {
100 ▶       this.responseText = body;
101 │     } else {
102 ▶       this.response = body;
103 │     }
104 ▶     this.status = status;
105 │     this.statusText = statusText;
106 ▶     this.mockLoadEvent();
107 ▶   }
```

xhr\_mock.ts の 12〜18 行目の `MockXhrFactory` は、`XhrFactory`（`HttpXhrBackend` が `new XMLHttpRequest()` の代わりに呼ぶもの）を実装し、16 行目で作った偽物を `mock` に覚えます。xhr\_spec.ts の 59 行目で `XhrFactory` をこれに差し替え、61 行目で取り出しておき、it の中で `factory.mock.mockFlush(200, 'OK', …)` のように応答を起こします。98〜107 行目の `mockFlush` は状態を入れてから 106 行目で `load` のリスナーを呼ぶだけで、ブラウザの `XMLHttpRequest` の順番（状態が先、`load` があと）をなぞっています。

📄 `angular/packages/common/http/test/jsonp_mock.ts` L40–72 （▶ の行: 40, 48–49, 52–53, 62–63, 66, 69–70）

```ts
40 ▶ export class MockDocument {
41 │   mock!: MockScriptElement | null;
42 │   readonly body: any = this;
43 │ 
44 │   implementation = {
45 │     createHTMLDocument: () => new MockDocument(),
46 │   };
47 │ 
48 ▶   createElement(tag: 'script'): HTMLScriptElement {
49 ▶     return new MockScriptElement(this) as any as HTMLScriptElement;
50 │   }
51 │ 
52 ▶   appendChild(node: any): void {
53 ▶     this.mock = node;
54 │   }
55 │ 
56 │   removeNode(node: any): void {
57 │     if (this.mock === node) {
58 │       this.mock = null;
59 │     }
60 │   }
61 │ 
62 ▶   adoptNode(node: any) {
63 ▶     node.ownerDocument = this;
64 │   }
65 │ 
66 ▶   mockLoad(): void {
67 │     // Mimic behavior described by
68 │     // https://html.spec.whatwg.org/multipage/scripting.html#execute-the-script-block
69 ▶     if (this.mock!.ownerDocument === this) {
70 ▶       this.mock!.listeners.load!(null as any);
71 │     }
72 │   }
```

jsonp\_mock.ts の `MockDocument` は、`JsonpClientBackend` が使う `createElement('script')`・`appendChild`・`adoptNode` だけを持ちます。69 行目で「`script` の `ownerDocument` がまだこの文書なら `load` を呼ぶ」を確かめるのは、`JsonpClientBackend` が取り消すときに `script` を別の文書へ移す（62・63 行目の `adoptNode`）からです。ブラウザは別の文書に移った `script` を実行しないので、それと同じ振る舞いにしています（[JSONP の章](../http/10-http-jsonp.md)）。

📄 `angular/packages/common/http/test/fetch_spec.ts` L55–73 （▶ の行: 60–62, 67, 70–72）

```ts
55 │ describe('FetchBackend', () => {
56 │   let fetchMock: MockFetchFactory = null!;
57 │   let backend: FetchBackend = null!;
58 │   let fetchSpy: jasmine.Spy<typeof fetch>;
59 │ 
60 ▶   function callFetchAndFlush(req: HttpRequest<any>): void {
61 ▶     backend.handle(req).pipe(take(1)).subscribe();
62 ▶     fetchMock.mockFlush(HttpStatusCode.Ok, 'OK', 'some response');
63 │   }
64 │ 
65 │   beforeEach(() => {
66 │     TestBed.configureTestingModule({
67 ▶       providers: [{provide: FetchFactory, useClass: MockFetchFactory}, FetchBackend],
68 │     });
69 │ 
70 ▶     fetchMock = TestBed.inject(FetchFactory) as MockFetchFactory;
71 ▶     fetchSpy = spyOn(fetchMock, 'fetch').and.callThrough();
72 ▶     backend = TestBed.inject(FetchBackend);
73 │   });
```

📄 `angular/packages/common/http/test/fetch_spec.ts` L767–799 （▶ の行: 767, 777–779, 783, 785–786, 792, 795–796）

```ts
767 ▶ export class MockFetchFactory extends FetchFactory {
768 │   public readonly response = new MockFetchResponse();
769 │   public readonly request = new MockFetchRequest();
770 │   private resolve!: (value: Response | PromiseLike<Response>) => void;
771 │   private reject!: (reason?: any) => void;
772 │ 
773 │   private clearWarningTimeout?: VoidFunction;
774 │ 
775 │   private promise = this.createFetchPromise();
776 │ 
777 ▶   override fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
778 ▶     this.request.method = init?.method;
779 ▶     this.request.url = input;
780 │     this.request.body = init?.body;
781 │     this.request.headers = init?.headers;
782 │     this.request.credentials = init?.credentials;
783 ▶     this.request.signal = init?.signal;
784 │ 
785 ▶     if (init?.signal) {
786 ▶       init?.signal.addEventListener('abort', () => {
787 │         this.reject();
788 │         this.clearWarningTimeout?.();
789 │       });
790 │     }
791 │ 
792 ▶     // Fetch uses a Macrotask to keep the NgZone unstable during the fetch
793 │     // If the promise is not resolved/rejected the unit will succeed but the test suite will
794 │     // fail with a timeout
795 ▶     const timeoutId = setTimeout(() => {
796 ▶       console.error('*********  You forgot to resolve/reject the promise ********* ');
797 │       this.reject();
798 │     }, 5000);
799 │     this.clearWarningTimeout = () => clearTimeout(timeoutId);
```

fetch\_spec.ts は偽物を別ファイルにせず、767 行目から同じファイルに `MockFetchFactory` を書いています。67 行目で `FetchFactory` をこれに差し替え、71 行目で `fetch` に spy を付けます。777〜783 行目で受け取った引数を覚え、785・786 行目で `abort` を受けたら Promise を reject します。`FetchFactory` は今の公開 API に出ていない部品で、開いている #62011（「FetchFactory を公開してほしい」）が求めているのはこれです。なお 792 行目のコメントは「NgZone を不安定に保つため」と zone.js の言葉で書いていますが、この spec は 2 節の zoneless の初期化で走ります。795・796 行目は「Promise を解決し忘れたら 5 秒で知らせる」ためのタイマーです。

📄 `angular/packages/common/http/testing/test/request_spec.ts` L143–167 （▶ の行: 143–145, 154, 163–165, 167）

```ts
143 ▶     if (isBrowser) {
144 ▶       it('should allow creating HttpErrorResponse with successful status', () => {
145 ▶         const error = new ProgressEvent('error');
146 │         request.error(error, {status: 200, statusText: 'OK'});
147 │ 
148 │         expect(lastError).toBeDefined();
149 │         expect(lastError).toBeInstanceOf(HttpErrorResponse);
150 │         expect(lastError.status).toBe(200);
151 │         expect(lastError.statusText).toBe('OK');
152 │       });
153 │ 
154 ▶       it('should allow creating HttpErrorResponse with any status code', () => {
155 │         const error = new ProgressEvent('error');
156 │         request.error(error, {status: 404, statusText: 'Not Found'});
157 │ 
158 │         expect(lastError).toBeDefined();
159 │         expect(lastError).toBeInstanceOf(HttpErrorResponse);
160 │         expect(lastError.status).toBe(404);
161 │         expect(lastError.statusText).toBe('Not Found');
162 │       });
163 ▶     } else {
164 ▶       it('dummy test for node tests', () => {
165 ▶         expect(true).toBe(true);
166 │       });
167 ▶     }
```

testing/test/request\_spec.ts の 143 行目は `isBrowser` で it の組を分けます。145 行目の `new ProgressEvent('error')` は Node に無いので、ブラウザでだけ 144・154 行目の 2 つを作り、Node では 163〜167 行目の `else` で、164 行目の名前どおりの「Node のための空の it」を 1 つ作ります。1 節の「Node 6 件・ブラウザ 7 件」はここから来ます。

## 4. 手元での走らせ方と結果

📄 `走らせたコマンド`

```
cd ~/angular-research/angular
# 4 つのターゲット（ブラウザの側は Chromium と Firefox の 2 つずつに分かれ、全部で 6 つ）
pnpm bazel test //packages/common/http/test:test //packages/common/http/test:test_web \
  //packages/common/http/testing/test:test //packages/common/http/testing/test:test_web \
  --nocache_test_results --test_output=all

# Node の側だけ、名前で絞る（jasmine の --filter は正規表現）
pnpm bazel test //packages/common/http/test:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=^TransferCache "
```

📄 `scratchpad/httpx-logs/b-all.log（要点）`

```
//packages/common/http/test:test                     PASSED in 2.8s   410 specs, 0 failures
//packages/common/http/test:test_web_chromium        PASSED in 2.0s   1/1 test files | 410 passed, 0 failed
//packages/common/http/test:test_web_firefox         PASSED in 4.4s   1/1 test files | 410 passed, 0 failed
//packages/common/http/testing/test:test             PASSED in 2.1s   6 specs, 0 failures
//packages/common/http/testing/test:test_web_chromium PASSED in 1.7s  1/1 test files | 7 passed, 0 failed
//packages/common/http/testing/test:test_web_firefox PASSED in 3.8s   1/1 test files | 7 passed, 0 failed
Executed 6 out of 6 tests: 6 tests pass.   （INFO: Elapsed time: 4.804s）
```
*2026-11-06、../angular（22.2.0-next.7、8576f161ae4）*

- 6 つすべて PASSED。Node 410 件、Chromium と Firefox で 410 件ずつ、testing は Node 6 件・ブラウザ 7 件でした。共通のブリーフの記録（base.log、全体 23.5 秒）と同じ件数で、この回は前の build が残っていたので 4.8 秒でした。
- **名前で絞れるのは Node の側だけです。**`--test_arg=--filter=httpResource` を Node の `:test` に渡すと「Ran 22 of 410 specs」、同じ引数を `:test_web_chromium` に渡すと「410 passed」で、絞られませんでした（b-filter-node.log・b-filter-web.log）。ブラウザで 1 つだけ走らせたいときは、spec の中で一時的に `fit` にします。
- ログには `Please add @Injectable() to the "CustomBackendExtends" class.` という警告が出ます（b-all.log に 6 回）。provider\_spec.ts の it `'withFetch' should not override provided backend` の中で、`@Injectable()` を付けずに `HttpXhrBackend` を継承して作るクラスで、失敗ではありません。

## 5. DEMO：issue を章で絞り込む

開いている 36 件と、2025-06-01 以降に閉じた 53 件（どちらも 2026-11-06 に `gh` で取得）を、本文とコメントを読んで、関係する章に振り分けました。要約はこの章の書き手が付けたもので、題をそのまま写していません。表は下のスクリプトが作ったデータです。

| 章 | 開いている | 閉じた |
| --- | --- | --- |
| [第 1 回 HttpRequest の options](01-httpx-request-options.md) | 2 | 6 |
| [第 2 回 headers と params の更新](02-httpx-headers-params-updates.md) | 8 | 0 |
| [第 3 回 オーバーロードの型](03-httpx-overload-types.md) | 5 | 3 |
| [第 4 回 httpResource の型](04-httpx-resource-types.md) | 1 | 3 |
| [第 5 回 転送キャッシュのキー](05-httpx-transfer-cache-key.md) | 2 | 3 |
| [インターセプタの連鎖](../http/05-http.md) | 2 | 3 |
| [provideHttpClient](../http/02-http-provide.md) | 0 | 2 |
| [FetchBackend](../http/06-http-backend-fetch.md) | 5 | 3 |
| [HttpXhrBackend](../http/07-http-backend-xhr.md) | 0 | 2 |
| [HttpEvent と HttpErrorResponse](../http/08-http-response-errors.md) | 2 | 9 |
| [XSRF 対策](../http/09-http-xsrf.md) | 3 | 3 |
| [JSONP](../http/10-http-jsonp.md) | 0 | 2 |
| [転送キャッシュ](../http/11-http-transfer-cache.md) | 3 | 2 |
| [テスト用バックエンド](../http/12-http-testing.md) | 2 | 5 |
| [httpResource と rxResource](../signals/16-signals-http-resource.md) | 1 | 4 |

> **🧪 DEMO — area: common/http の issue（89 件）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/httpx-tests-issues)

本番ビルドをヘッドレスの Chrome（HeadlessChrome/155.0.8043.0）で開いて確かめると、最初は「開いている」で 36 件、「すべて」で 89 件、章を第 5 回にすると 5 件（そのうち開いているのは 2 件）、語に `xsrf` を入れると 3 件で、コンソールの警告とエラーは 0 件でした（2026-11-06、scratchpad/httpx-b/verify.json）。

表から読めることです。

- 開いている 36 件のうち 15 件は 2020 年より前に開いたもので、多くが「機能の要望」か「振る舞いを変えると壊れる（breaking changes）」のラベル付きです。一番多いのは [第 2 回](02-httpx-headers-params-updates.md)（headers と params）の 8 件で、配列の params・`undefined` の params・エンコードなど、`HttpParams` の形を変える要望が並びます。
- 2026 年に開いた 7 件のうち 3 件（#70947・#70226・#70856）には PR が付いて、どれも開いたままです（#70947 と #70226 は報告した人が自分で、#70856 はメンテナーが PR を出している）。#70947 と #70226 は[第 5 回](05-httpx-transfer-cache-key.md)の行で、今のソースでも起きることを確かめました。
- 2026 年に閉じた 26 件は、COMPLETED が 13・NOT\_PLANNED が 12・DUPLICATE が 1 です。NOT\_PLANNED には、#70738（`\0` で区切りがずれる）や #69882（転送キャッシュに当たった `httpResource` がインターセプタを通らない）のように、「意図した振る舞い」と答えて閉じたものが入っています。

📄 `scratchpad/httpx-b/issues/make-data.mjs`

```js
// 第 6 回 httpx-tests-issues の表のデータを作る。
// 入力: httpx-logs/open.json・closed.json（2026-11-06 に gh で取った area: common/http の issue。読むだけ）、
//       httpx-logs/b-count.log（Node の spec を describe ごとに --filter で数えた記録）、
//       ../angular（8576f161ae4）の spec ファイルと git log。
// NOTES・CNOTES は、この章の書き手が題・本文・コメント・閉じた PR を読んで付けた日本語の要約と、関係する章。
// 使い方: node make-data.mjs  →  angular-deep-dive/src/app/pages/chapters/httpx-tests-issues.data.ts
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const LOGS = '<scratchpad>/httpx-logs/';
const NG = '~/angular-research/angular';
const OUT = '~/angular-research/angular-deep-dive/src/app/pages/chapters/httpx-tests-issues.data.ts';
const HERE = new URL('.', import.meta.url).pathname;

// ---- spec ファイル ----
const measured = Object.fromEntries(
  readFileSync(LOGS + 'b-count.log', 'utf8').trim().split('\n').map((l) => {
    const [name, rest] = l.split(' :: ');
    return [name, Number(rest.match(/Ran (\d+) of/)[1])];
  }),
);
const specFiles = [
  ...readdirSync(`${NG}/packages/common/http/test`).filter((f) => f.endsWith('_spec.ts')).map((f) => `test/${f}`),
  'testing/test/request_spec.ts',
];
const SPECS = specFiles.map((rel) => {
  const lines = readFileSync(`${NG}/packages/common/http/${rel}`, 'utf8').split('\n');
  const tops = [];
  let its = 0;
  lines.forEach((l, i) => {
    const m = l.match(/^describe\((['`])(.+?)\1/);
    if (m) tops.push({ name: m[2], line: i + 1 });
    if (/^\s*(it|xit|fit)\(/.test(l)) its++;
  });
  const node = rel.startsWith('testing/') ? 6 : tops.reduce((a, t) => a + (measured[t.name] ?? 0), 0);
  return { file: rel, lines: lines.length, tops, its, node };
});

// ---- issue ----
// kind: bug / feature / docs / types / other。ch: 関係する章の slug。
const NOTES = {
  71207: { kind: 'feature', ch: 'http', ja: 'URL ごとにインターセプタのまとまりを宣言して当てたい', pr: '' },
  70947: { kind: 'bug', ch: 'httpx-transfer-cache-key', ja: '転送キャッシュが最終の URL と redirected を運ばず、リダイレクトを見るインターセプタの判断が SSR とブラウザで変わる', pr: '#70946（開いている）' },
  70856: { kind: 'feature', ch: 'httpx-overload-types', ja: 'HTTP の QUERY メソッド用に HttpClient.query() がほしい', pr: '#70858（開いている）' },
  70226: { kind: 'bug', ch: 'httpx-transfer-cache-key', ja: '2 進の本文（Protobuf など）の POST が、本文が違っても同じキャッシュのキーになる', pr: '#70227（開いている）' },
  70077: { kind: 'bug', ch: 'http-xsrf', ja: 'インターセプタがリクエストの行き先を変えても XSRF のヘッダーが残る', pr: '' },
  69388: { kind: 'feature', ch: 'http-backend-fetch', ja: '本文が maxResponseBodySize に近づいたら知らせてほしい', pr: '' },
  66636: { kind: 'feature', ch: 'httpx-resource-types', ja: 'httpResource の parse からレスポンスヘッダーを読みたい', pr: '' },
  63815: { kind: 'feature', ch: 'signals-http-resource', ja: 'RxJS を使わずにデータを取る道筋（canonical）', pr: '' },
  63250: { kind: 'bug', ch: 'http-response-errors', ja: 'Fetch のバックエンドで、エラーの応答に本文の text が入らない', pr: '' },
  62011: { kind: 'feature', ch: 'http-backend-fetch', ja: 'FetchBackend が使う fetch を差し替える FetchFactory を公開してほしい', pr: '' },
  58677: { kind: 'bug', ch: 'http-response-errors', ja: '大きすぎる JSON を解析できないとき、エラーとして捕まらない', pr: '' },
  58149: { kind: 'bug', ch: 'http-transfer-cache', ja: 'HTTP_TRANSFER_CACHE_ORIGIN_MAP の値に空文字を書けない', pr: '#71168（閉じた）' },
  57409: { kind: 'feature', ch: 'http', ja: 'あるインターセプタが provide されているかを調べたい', pr: '' },
  57080: { kind: 'feature', ch: 'http-transfer-cache', ja: 'サーバーとブラウザで URL が違っても転送キャッシュを使いたい', pr: '' },
  53650: { kind: 'feature', ch: 'http-backend-fetch', ja: 'FetchBackend でアップロードの進捗がほしい', pr: '' },
  52494: { kind: 'feature', ch: 'http-backend-fetch', ja: 'FetchBackend で ReadableStream の塊を 1 つずつ読みたい', pr: '' },
  52424: { kind: 'feature', ch: 'httpx-headers-params-updates', ja: 'インターセプタで、文字列にする前の HttpParams を変えたい', pr: '' },
  52376: { kind: 'docs', ch: 'httpx-request-options', ja: 'post の本文がどうエンコードされるか分かりにくい', pr: '' },
  51193: { kind: 'feature', ch: 'http-xsrf', ja: 'XSRF の設定のトークンを公開してほしい', pr: '' },
  49760: { kind: 'types', ch: 'httpx-overload-types', ja: 'リクエストの本文に型引数を付けたい', pr: '' },
  44149: { kind: 'bug', ch: 'httpx-headers-params-updates', ja: '同じ名前のヘッダーが , で分けられない', pr: '' },
  31563: { kind: 'bug', ch: 'httpx-request-options', ja: 'JSON の既定の Content-Type が AngularJS と違う', pr: '' },
  28915: { kind: 'bug', ch: 'http-backend-fetch', ja: 'HttpClient が送る Accept ヘッダーがまちがっている', pr: '' },
  25965: { kind: 'bug', ch: 'http-testing', ja: 'HttpTestingController で async/await のテストが解決しない', pr: '' },
  21866: { kind: 'types', ch: 'httpx-overload-types', ja: 'HttpClient.head が既定で本文を期待する（HEAD の仕様と合わない）', pr: '' },
  20797: { kind: 'feature', ch: 'httpx-headers-params-updates', ja: '配列の params のエンコードを変えたい', pr: '' },
  20564: { kind: 'feature', ch: 'httpx-headers-params-updates', ja: 'undefined の params を URL に出さないでほしい', pr: '' },
  20298: { kind: 'feature', ch: 'httpx-headers-params-updates', ja: 'HttpParams.set・append に入れ子のオブジェクトを渡したい', pr: '' },
  19885: { kind: 'feature', ch: 'http-xsrf', ja: 'XSRF が GET を扱わない（HttpModule と違う）', pr: '' },
  19289: { kind: 'other', ch: 'http-testing', ja: 'リクエストが投げるエラーを単体テストでうまく扱えない', pr: '' },
  19160: { kind: 'other', ch: 'httpx-headers-params-updates', ja: 'Date の値をヘッダーに入れるときの形式', pr: '' },
  19148: { kind: 'feature', ch: 'httpx-overload-types', ja: '成功とエラーで responseType を変えたい', pr: '' },
  19071: { kind: 'feature', ch: 'httpx-headers-params-updates', ja: 'HttpParams が配列を受け取らない', pr: '' },
  18586: { kind: 'feature', ch: 'httpx-overload-types', ja: 'responseType を変数で渡すと型が合わない', pr: '' },
  15730: { kind: 'bug', ch: 'http-transfer-cache', ja: 'platform-server で、受けたリクエストの Cookie を HttpClient に付けたい（SSR）', pr: '' },
  11058: { kind: 'bug', ch: 'httpx-headers-params-updates', ja: 'HttpParameterCodec が + や = をエンコードしない', pr: '' },
};
// 閉じた issue: ja・ch・commit（git log か gh で確かめた閉じたコミット / PR）。
const CNOTES = {
  45497: { ch: 'httpx-request-options', ja: 'HttpClient のメソッドに URL 型を渡したい', commit: '' },
  26161: { ch: 'http-testing', ja: 'HttpTestingController で成功の状態コードの HttpErrorResponse を作れない', commit: '' },
  61765: { ch: 'httpx-request-options', ja: 'Fetch の cache と priority を HttpClient で使いたい', commit: '' },
  61831: { ch: 'httpx-resource-types', ja: 'httpResource に keepalive を出してほしい', commit: '' },
  62314: { ch: 'httpx-request-options', ja: 'Fetch の mode と redirect を HttpClient で使いたい', commit: '' },
  62259: { ch: 'http-response-errors', ja: '204 のとき Allow ヘッダーが見えない', commit: '' },
  34421: { ch: 'httpx-request-options', ja: 'HttpClient にタイムアウトを付けたい', commit: '' },
  62616: { ch: 'httpx-resource-types', ja: 'httpResource に使う HttpClient を渡す option がほしい', commit: '' },
  63254: { ch: 'httpx-overload-types', ja: 'HttpProgressEvent の partialText を、型を変えずに読めない', commit: '' },
  62864: { ch: 'httpx-request-options', ja: 'POST で credentials: include が送られない', commit: '' },
  52027: { ch: 'http-response-errors', ja: 'JSON の XSSI 前置きを外す処理はまだ要るか', commit: '' },
  50814: { ch: 'http-response-errors', ja: 'HttpErrorResponse.error の型を unknown にしたい', commit: '' },
  47312: { ch: 'http-jsonp', ja: 'HttpClientModule のあとに HttpClientJsonpModule を import すると JSONP が失敗する', commit: '' },
  63791: { ch: 'signals-http-resource', ja: 'httpResource の isLoading の塊でインクリメンタルハイドレーションが進まない', commit: '' },
  58754: { ch: 'http-testing', ja: 'provideHttpClient と provideHttpClientTesting を正しい順に足す 1 つの関数がほしい', commit: '' },
  63638: { ch: 'http-testing', ja: 'テスト用の簡単な補助関数がほしい', commit: '' },
  61451: { ch: 'http', ja: 'インターセプタに Promise を返させたい', commit: '' },
  63704: { ch: 'http-response-errors', ja: 'withFetch のとき HTTP のエラーをグローバルの ErrorHandler に回したい', commit: '' },
  63989: { ch: 'http-provide', ja: 'HttpClient をプラットフォームの注入器で provide したい', commit: '' },
  59826: { ch: 'signals-http-resource', ja: 'rxResource と HttpClient のテストが動かない', commit: '' },
  19984: { ch: 'http', ja: 'エラーハンドラとイベントの振る舞いがおかしい', commit: '' },
  27593: { ch: 'http-backend-xhr', ja: 'HTTP のリクエストで変更検知が 2 回走る（zone.js）', commit: '' },
  23334: { ch: 'http-response-errors', ja: 'HttpErrorResponse の statusText がいつも OK', commit: '0e4e17cd97d（statusText の扱いを変えた refactor）' },
  40103: { ch: '', ja: 'iOS の Chrome で翻訳を有効にすると HttpClient が動かない', commit: '' },
  55635: { ch: 'http-xsrf', ja: 'SSG で withXsrfConfiguration と相対パスが合わない', commit: '' },
  64725: { ch: 'http-testing', ja: 'HttpTestingController が HttpErrorResponse のパスを完全な URL にしない', commit: '' },
  20511: { ch: 'http-xsrf', ja: 'POST に X-XSRF-Token が付かない', commit: '0659d11c854（同じオリジンの絶対 URL でも XSRF を付ける）' },
  66827: { ch: 'httpx-transfer-cache-key', ja: 'httpResource.arrayBuffer を SSR で使うと [object Object] の 15 バイトになる', commit: 'cb1163e5e54' },
  65583: { ch: 'http-provide', ja: '新しい SSR のプロジェクトに provideHttpClient(withFetch()) を入れたい', commit: '' },
  48505: { ch: 'http-backend-fetch', ja: 'JSON を求めるときの Accept ヘッダーがまちがっている（#28915 と重複）', commit: '' },
  64767: { ch: 'http-response-errors', ja: 'HttpStatusCode の enum を定数のオブジェクトにしたい', commit: '' },
  48167: { ch: 'http-response-errors', ja: 'HttpClient の JSON の解析を差し替えたい', commit: '' },
  67522: { ch: '', ja: 'common/http のフォルダが見えなくなった（ドキュメントの話）', commit: '' },
  67495: { ch: 'signals-http-resource', ja: 'status が idle の httpResource で reload() が効かない', commit: '' },
  68244: { ch: 'http-transfer-cache', ja: 'HTTP_TRANSFER_CACHE_ORIGIN_MAP で相対の API の URL を対応させたい', commit: '' },
  43461: { ch: 'httpx-overload-types', ja: 'HttpClient の options の引数に interface がほしい', commit: '6413e703fa1（#67343、options を型にまとめた refactor）' },
  64513: { ch: 'httpx-overload-types', ja: 'HttpClient のコードの重複を減らしたい', commit: '6413e703fa1（#67343）' },
  68572: { ch: 'http-backend-xhr', ja: 'XhrFactory.build() に HttpRequest を渡したい', commit: '' },
  68832: { ch: 'http-jsonp', ja: 'JSONP の URL が http(s) か検査されない', commit: '255151a4134' },
  69241: { ch: 'httpx-request-options', ja: 'v22 の reportUploadProgress が効かない（post と patch）', commit: 'c092a002e40' },
  69623: { ch: 'httpx-transfer-cache-key', ja: '転送キャッシュに includeRequestsWithCredentials がほしい', commit: 'e3630c23c59（#69628）' },
  58682: { ch: 'http', ja: 'インターセプタの中の signal の読みが、呼んだ effect の依存になる', commit: '6d043f86573' },
  69773: { ch: 'signals-http-resource', ja: 'httpResource を signal forms につなぐとエラーが消える', commit: '' },
  69832: { ch: 'http-response-errors', ja: 'Problem Details（RFC 7807）に対応してほしい', commit: '' },
  69882: { ch: 'httpx-resource-types', ja: '転送キャッシュに当たった httpResource がインターセプタを通らない', commit: '（意図した振る舞いと回答して閉じた）' },
  68022: { ch: '', ja: 'Agent Skill に HTTP の文書を足したい', commit: '#69645（docs）' },
  69777: { ch: 'http-transfer-cache', ja: 'withRequestsMadeViaParent のとき、認証つきの応答が転送キャッシュに入る', commit: 'bb78286e5e7（#69778）' },
  70061: { ch: 'http-backend-fetch', ja: 'FetchBackend の TextDecoder が Content-Type の charset を見ない', commit: '6a0789dc7f0' },
  70071: { ch: 'http-backend-fetch', ja: 'v22 の withFetch() で、DevTools のネットワークに空の応答が出る', commit: 'ef4dfead83e' },
  70738: { ch: 'httpx-transfer-cache-key', ja: '\\0 を URL と本文に入れると、区切りがずれて同じキーになる', commit: '（不具合ではないとして閉じた）' },
  71294: { ch: 'http-xsrf', ja: '20.3.x で、バックスラッシュや空白の URL を使うと XSRF のヘッダーが別のオリジンに送られる', commit: 'd39f913dfbc（main に spec を足した）' },
  71399: { ch: 'http-response-errors', ja: 'JSON の解析を差し替えたい（#48167 の再提出）', commit: '' },
  20878: { ch: 'http-testing', ja: 'HttpClientTestingModule で JSONP のリクエストをテストできない', commit: '' },
};
const open = JSON.parse(readFileSync(LOGS + 'open.json', 'utf8'));
const closed = JSON.parse(readFileSync(LOGS + 'closed.json', 'utf8'));
const labels = (i) => i.labels.map((l) => l.name).filter((n) => n !== 'area: common/http');
const ISSUES = [
  ...open.map((i) => {
    const n = NOTES[i.number];
    if (!n) throw new Error('no note ' + i.number);
    return { n: i.number, state: 'open', reason: '', opened: i.createdAt.slice(0, 10), closed: '', c: Array.isArray(i.comments) ? i.comments.length : i.comments, labels: labels(i), kind: n.kind, ch: n.ch, ja: n.ja, link: n.pr };
  }),
  ...closed.map((i) => {
    const n = CNOTES[i.number];
    if (!n) throw new Error('no cnote ' + i.number);
    return { n: i.number, state: 'closed', reason: i.stateReason, opened: i.createdAt.slice(0, 10), closed: i.closedAt.slice(0, 10), c: 0, labels: labels(i), kind: '', ch: n.ch, ja: n.ja, link: n.commit };
  }),
].sort((a, b) => b.n - a.n);

// ---- 2026 年の fix / feat のコミット ----
const commitLines = readFileSync(LOGS + 'recent-commits.txt', 'utf8').trim().split('\n');
const COMMITS = commitLines
  .map((l) => l.match(/^(\w+) (\S+) (.*)$/))
  .filter((m) => m[2].startsWith('2026') && /^(fix|feat)\((http|common|core)\)/.test(m[3]))
  .map(([, h, d, s]) => {
    const num = (paths) =>
      execFileSync('git', ['-C', NG, 'show', '--numstat', '--format=', h, '--', ...paths], { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean).reduce((a, l) => { const [x, y] = l.split('\t'); return { add: a.add + (+x || 0), del: a.del + (+y || 0) }; }, { add: 0, del: 0 });
    const src = num(['packages/common/http/src', 'packages/common/http/testing/src']);
    const spec = num(['packages/common/http/test', 'packages/common/http/testing/test']);
    return { h, d, s, srcAdd: src.add, srcDel: src.del, specAdd: spec.add };
  });

const body = `// 自動生成 — 手で編集しないこと（scratchpad/httpx-b/issues/make-data.mjs が作った）。
// issue の欄（番号・状態・日付・ラベル・コメント数）は 2026-11-06 に gh で取ったもの。ja・ch・link はこの章の書き手が付けたもの。
export const SPECS = ${JSON.stringify(SPECS)} as const;

export const ISSUES = ${JSON.stringify(ISSUES)} as const;

export const COMMITS = ${JSON.stringify(COMMITS)} as const;

export const SCRIPT = ${JSON.stringify(readFileSync(HERE + 'make-data.mjs', 'utf8'))};
`;
writeFileSync(OUT, body);
console.log(SPECS.length, 'spec files', ISSUES.length, 'issues', COMMITS.length, 'commits', body.length, 'bytes');
console.log(SPECS.map((s) => `${s.file} its=${s.its} node=${s.node}`).join('\n'));
const fx = COMMITS.filter((c) => c.s.startsWith('fix'));
console.log('fix', fx.length, 'with spec', fx.filter((c) => c.specAdd > 0).length, 'src lines', fx.map((c) => c.srcAdd + c.srcDel).sort((a, b) => a - b).join(','));

```
*表のデータを作ったスクリプトの全文（記録）*

## 6. 2026 年の修正の傾向

共通のブリーフの recent-commits.txt（2025-09 以降に packages/common/http を変えた 75 本）から、2026 年の `fix(…)` と `feat(…)` を選び、`git show --numstat` で packages/common/http の src と spec の行数を数えました。

| コミット | 日付 | 題 | src（足した / 消した行） | spec（足した行） |
| --- | --- | --- | --- | --- |
| `732e5050180` | 2026-08-18 | fix(core): replace all hasOwnProperty usages with Object.hasOwn | +0 / −0 | +1 |
| `1a006a8f979` | 2026-08-14 | fix(http): cancel oversized fetch response bodies | +1 / −0 | +21 |
| `09bc90003ed` | 2026-08-04 | fix(http): always decode JSON responses as UTF-8 | +1 / −1 | +10 |
| `ef4dfead83e` | 2026-08-04 | fix(http): avoid aborting completed requests in FetchBackend | +22 / −3 | +23 |
| `280d09b1601` | 2026-08-04 | fix(http): strip RFC 6265 DQUOTE characters and handle URIError in parseCookieValue | +0 / −0 | +21 |
| `6a0789dc7f0` | 2026-08-04 | fix(http): respect content-type charset in fetch backend text decoder | +26 / −4 | +41 |
| `bb78286e5e7` | 2026-07-31 | fix(http): run root interceptors in the terminal request chain | +20 / −7 | +293 |
| `de240a5d0ee` | 2026-07-29 | fix(http): enable xsrf for root-provided HttpClient | +4 / −3 | +14 |
| `f33ee95045a` | 2026-07-16 | fix(http): match header values exactly when deleting | +4 / −3 | +28 |
| `ff02a167495` | 2026-07-11 | fix(http): preserve immutability of materialized clones | +11 / −7 | +27 |
| `3192dccaa3e` | 2026-07-20 | fix(http): prevent transfer cache key collisions | +4 / −1 | +11 |
| `6d043f86573` | 2026-04-19 | fix(http): prevent interceptor signal reads from leaking into calling reactive contexts | +8 / −6 | +98 |
| `e3630c23c59` | 2026-07-06 | feat(http): add options to allow caching of credentialed and non-cacheable HTTP requests | +55 / −29 | +91 |
| `f76e8a98c10` | 2026-06-16 | fix(http): prevent caching of responses with Set-Cookie headers | +8 / −2 | +34 |
| `a6c7fc5c13e` | 2026-05-05 | fix(http): distinguish repeated transfer cache params | +5 / −5 | +40 |
| `c092a002e40` | 2026-06-08 | fix(http): pass down the \`reportUploadProgress\` and \`reportDownloadProgress\` on post/patch requests | +1 / −18 | +10 |
| `cd771d3712f` | 2026-06-04 | fix(http): preserve empty referrer option in HttpRequest | +3 / −2 | +11 |
| `255151a4134` | 2026-06-05 | fix(http): Rejects non-HTTP(S) URLs in JSONP requests | +16 / −0 | +40 |
| `5f36274da3f` | 2026-06-05 | fix(common): use cryptographically secure SHA-256 for transfer cache key generation | +267 / −109 | +33 |
| `cb8ceb1dde6` | 2026-06-04 | fix(http): ensure query parameters are inserted before URL fragments | +15 / −3 | +17 |
| `1ad6824d0dd` | 2026-05-30 | fix(common): skip transfer cache for uncacheable HTTP traffic (#69017) | +27 / −2 | +214 |
| `c0cbd46bd77` | 2026-05-29 | fix(http): skip transfer cache for fetch credentialed requests (#69017) | +7 / −2 | +41 |
| `2acca1165d7` | 2026-05-26 | fix(http): Introduce a max buffer size for fetch requests on SSR | +49 / −1 | +88 |
| `34090cb12ec` | 2026-05-26 | fix(http): exclude withCredentials requests from transfer cache | +3 / −1 | +21 |
| `ab459798d94` | 2026-03-31 | fix(http): skip TransferCache for cookie-bearing requests by default | +10 / −5 | +100 |
| `63886758787` | 2026-05-26 | fix(http): prevent \`httpResource\` from leaking a subscription | +12 / −2 | +33 |
| `5a7c1e62dc2` | 2026-05-06 | feat(core): add ability to cache resources for SSR | +1 / −0 | +0 |
| `39e382a756b` | 2026-04-07 | fix(http): add CSP nonce support to JsonpClientBackend | +8 / −0 | +39 |
| `1f057afaac8` | 2026-02-11 | fix(http): correctly cache blob responses in transfer cache (#67002) | +17 / −6 | +170 |
| `2206efa55fc` | 2026-02-27 | feat(core): add special return statuses for resource params | +36 / −33 | +16 |
| `88685cb3b6d` | 2026-02-25 | fix(core): adds transfer cache to httpResource to fix hydration | +111 / −28 | +57 |
| `cb1163e5e54` | 2026-01-31 | fix(http): correctly parse ArrayBuffer and Blob in transfer cache | +28 / −3 | +31 |

- **小さい**：`fix` の 29 本の src の変更（足した + 消した）の中央値は 14 行です。100 行を超えるのは 5f36274da3f（SHA-256 を足した、376 行）と 88685cb3b6d（`httpResource` に転送キャッシュをつないだ、139 行）の 2 本だけです。
- **spec つき**：`fix` の 29 本のうち 29 本が spec を足しています。src が 0 行のもの（732e5050180・280d09b1601）は、変えたのが packages/common/http の外（`Object.hasOwn` への置き換え、`parseCookieValue`）で、http の spec だけが変わったものです。
- **1 つの振る舞い**：題は「〜のときに〜しない」「〜を区別する」の形で、1 本が 1 つの振る舞いだけを変えます。transfer\_cache.ts の src を変えた `fix`・`feat` は 2026 年に 12 本（cb1163e5e54・88685cb3b6d・1f057afaac8・ab459798d94・34090cb12ec・c0cbd46bd77・1ad6824d0dd・5f36274da3f・a6c7fc5c13e・f76e8a98c10・e3630c23c59・3192dccaa3e。1f057afaac8 は戻された）で、それぞれ別の 1 点を変えています。
- **戻された修正もある**：1f057afaac8 と aafeb1d2bd9（2026-02-11）は、main のテストを壊したとして 2026-03-04 に戻されました（[第 5 回](05-httpx-transfer-cache-key.md)の 3 節）。流れを非同期にする修正は、周りの spec の前提も動かします。

## 7. このシリーズで見つけたもの

各章で、ソースの行と、自分で動かした記録で確かめたものです。「既存」は `gh` で探して見つかった issue・PR です（2026-11-06）。本家に PR や issue を出すことは勧めません。

| 章 | 何が起きるか | 確かめた行と記録 | 既存 |
| --- | --- | --- | --- |
| [第 5 回](05-httpx-transfer-cache-key.md) | （不具合）`responseType: 'blob'` の応答を SSR で転送キャッシュに入れると、本文が空で書かれ、ブラウザでは 0 バイトの `Blob` が返る | transfer\_cache.ts 329 行目が `Blob` を `toBase64` に渡し、436 行目の `new Uint8Array(Blob)` が長さ 0。esbuild で束ねたソースで、5 バイトの `Blob` → 書いた本文 `''` → `Blob 0 バイト`。spec の 520 行目の it はキャッシュからの応答を見ていない | 1f057afaac8 で直して 7eb33713b90 で戻された。開いている issue は見つからなかった |
| [第 5 回](05-httpx-transfer-cache-key.md) | （不具合・開発モードだけ）`includeHeaders: ['ETag']` で運んだヘッダーを `get('etag')` で読むと、値は返るのに NG02802 の警告が出る | transfer\_cache.ts 521 行目の `includes(headerName)` が大文字・小文字を区別する。記録で `get('ETag')` は警告なし、`get('etag')` は警告あり。Proxy の spec は 0 件 | 見つからなかった |
| [第 5 回](05-httpx-transfer-cache-key.md) | 2 進の本文（`ArrayBuffer`）・`Blob`・`FormData`・本文なしが、全部同じキーになる | transfer\_cache.ts 420・421 行目。記録で 7 つが同じキー。ライブの DEMO（22.1.6）で、B が A の応答をキャッシュから受け取る | #70226（開）、PR #70227（開） |
| [第 5 回](05-httpx-transfer-cache-key.md) | キャッシュから作った応答で、`url` がリクエストの URL になり、`redirected` が消える | transfer\_cache.ts 333・274 行目。記録で `redirected: true` → `undefined` | #70947（開）、PR #70946（開） |
| [第 5 回](05-httpx-transfer-cache-key.md) | （コメント）595 行目「64-bit keyspace」は、消えた DJB2 の実物（32 ビット）と合わない。response.ts 206・207 行目「既定の XHR では `undefined`」は、Fetch が既定の今と合わない | `git show 5f36274da3f` の消えた行（`<< 0` と 2 の 31 乗）、1f9a42bb424 | — |
| [第 4 回](04-httpx-resource-types.md) | （型）`httpResource.text`・`blob`・`arrayBuffer` で、引数に型を書かない `parse` と `defaultValue` を一緒に書くと、TResult が既定の型のまま決まって型のエラーになり、文は「`string` を `HttpResourceRequest` に入れられない」という原因と関係の無いものになる | resource.ts 186〜206 行目の並びと `<TResult = string>`。TypeScript 6.0.3 の記録の i・n1・n6（n2・n3・n7・n8 は通る）。describe `types` は `parse: () => 0` だけ | 見つからなかった。TypeScript の推論の振る舞いから来るもので、不具合かどうかは判断していない |
| [第 4 回](04-httpx-resource-types.md) | （spec の穴）`parse` が投げたときと、`httpResource.blob` の it が無い | resource\_spec.ts の it の一覧（22 件）。振る舞いはライブの DEMO で確かめた（resource.ts 404〜407 行目） | — |
| [第 1 回](01-httpx-request-options.md) | `post`・`put`・`patch` の options に `body` があると、第 2 引数の本文ではなく options の `body` が送られる（`body: undefined` なら本文は null）。型の検査は通る。v22.1.0 の c092a002e40（#69241 の修正）から | client.ts 43〜48 行目の `addBody` が `{ body, ...options }` の順に書く。495 行目が `options.body` を使う。22.1.6 と HttpTestingController で再現 | 見つからなかった |
| [第 2 回](02-httpx-headers-params-updates.md) | `HttpHeaders.set(name, [])` が前の値を消さない（`getAll` は前の値のまま）。コンストラクタに空の配列を渡したときとも扱いが違う | headers.ts 217〜219 行目（空の配列は `'s'` でも return）。set の doc コメントは「置き換える」。spec は無い | 見つからなかった |
| [第 3 回](03-httpx-overload-types.md) | （型）`HttpClientCommonOptions` の変数や `observe: flag ? 'events' : 'body'` を `head`・`post` などに渡すと `Observable<Object>` として通り、実行時は HttpEvent の列が届く。`get`・`delete` では型のエラーになる | v22.0.0 の 6413e703fa1 で、head・options・patch・post・put の最後のオーバーロードが `options?: HttpClientCommonOptions` だけになった（client.ts 1418・1430・2338・2351 行目）。get と delete は 1137〜1143 行目で形を残す | 見つからなかった |

## テストが走るまでの呼び出し

- 👤 `pnpm bazel test //packages/common/http/test:test` — あなたのコマンド
  - `zoneless_jasmine_test(name = "test", data = [":test_lib"])` — test/BUILD.bazel 23〜28
    - `jasmine_test(…, fixed_args = ["--require=…node_zoneless_tests.init.mjs"])` — tools/bazel/jasmine\_test.bzl 13・16
      - `ts_project(name = "test_lib", srcs = glob(["**/*.ts"]))` — test/BUILD.bazel 3〜8 — *spec 14 ファイルと偽物 2 ファイル*
        - `describe('TransferCache', …)` ほか 18 個の一番外の describe — test/\*\_spec.ts — *410 件*

## 聞かれそうな質問

**Q. common/http の spec は、どれを走らせればいいですか？**

まず Node の `//packages/common/http/test:test` です。`--test_arg=--filter=…` で名前を絞れて、数秒で終わります（4 節）。ブラウザの振る舞い（`ProgressEvent` など）に関わるものだけ、`:test_web_chromium` を足します。こちらは絞り込みが効かないので、410 件ぜんぶが走ります。

**Q. 同じ spec が Node とブラウザで結果が違うことはありますか？**

あります。resource\_spec は `ngServerMode` を `isNode` にするので、Node ではサーバーとして、ブラウザではブラウザとして同じ it が動きます（[第 4 回](04-httpx-resource-types.md)）。testing/test/request\_spec は 143 行目の `isBrowser` で it の組そのものが変わります。

**Q. 本物の XHR や fetch はテストでどうしているのですか？**

その下の部品を偽物にします。`XhrFactory` を `MockXhrFactory` に（xhr\_spec.ts 59 行目）、`FetchFactory` を `MockFetchFactory` に（fetch\_spec.ts 67 行目）、JSONP は `document` を `MockDocument` にします。`HttpTestingController` はバックエンドごと差し替えるので、バックエンドそのものの spec には使いません。

**Q. 2026 年の修正はどういう形が多いですか？**

6 節の表のとおり、`fix` は 1 本で 1 つの振る舞いを変え、src の変更は中央値 14 行で、29 本のうち 29 本が spec を足しています。題は「〜のときに〜しない」の形で、本文は「何が壊れていたか → どう変えたか」の 1〜2 段落です。

**Q. 開いている issue は、どの章に多いですか？**

5 節の表で、[第 2 回](02-httpx-headers-params-updates.md)の headers と params が 8 件で一番多く、[第 3 回](03-httpx-overload-types.md)の型と FetchBackend が 5 件ずつです。古い要望が多く、振る舞いを変えると既存のアプリが壊れるものが残っています。

## 読み終えて

- common/http の spec は test/ の 14 ファイル（Node 410 件）と testing/test の 1 ファイル。`test_lib` 1 つを Node とブラウザ（Chromium・Firefox）で走らせる。
- 名前で絞れるのは Node の側だけ。ブラウザの側は `fit` を使う。
- 本物のバックエンドの spec は、`XhrFactory`・`FetchFactory`・`document` を偽物にして確かめる。
- 2026 年の `fix` は小さく、spec つきで、1 つの振る舞い。転送キャッシュに集中している。
- このシリーズで、`blob` の応答が空になる・Proxy の警告が大文字と小文字で外れる、の 2 つを、既存の issue の無いものとして見つけた。

---

← 前: [転送キャッシュのキー：手書きの SHA-256 と、衝突の修正](05-httpx-transfer-cache-key.md)  
次: [resolveUrl：サーバーで URL を解決する 1 つの関数と、SSRF の修正](../ssrx/01-ssrx-resolve-url.md) →
