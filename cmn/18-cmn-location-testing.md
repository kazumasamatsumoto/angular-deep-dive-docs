[目次](../README.md) › [common の内側](README.md) › 第 18 回 / 全 20 回

# テスト用の Location：SpyLocation・MockPlatformLocation・provideLocationMocks

> @angular/common/testing の SpyLocation（urlChanges と履歴の配列）、MockLocationStrategy、MockPlatformLocation が URL を自分で分解して履歴を持つ行、provideLocationMocks が入れ替える provider、v21 から TestBed の既定になった FakeNavigationPlatformLocation（c795960ada1）、ルーターのテストで使われる形。本家の spec が Location をどう試しているか。ページの上で本物の MockPlatformLocation と SpyLocation を動かして履歴を見るデモ。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-location-testing)

---

テストでは、本物の `history` を動かすとテストどうしが URL を取り合うので、`@angular/common/testing` の偽物を使います。偽物は 3 つあり、[第 17 回](17-cmn-location.md)の 3 段 （`Location`・`LocationStrategy`・`PlatformLocation`）のどの段を差し替えるかが違います。この章では、それぞれが履歴をどんな配列で持ち、戻る・進むでどのイベントをどの順に出すかを行で追い、本物のブラウザと違う所を言えるようにします。

読む対象は `packages/common/testing/src/` の `mock_platform_location.ts`（361 行）・`mock_location_strategy.ts`（104 行）・`location_mock.ts`（217 行、`SpyLocation`）・`provide_location_mocks.ts`（26 行）と、spec の `packages/common/test/location/` です。

1. [1. 全体像](01-cmn-overview.md)
2. [2. NgClass と NgStyle](02-cmn-ng-class-style.md)
3. [3. NgForOf](03-cmn-ng-for-of.md)
4. [4. NgIf と NgSwitch](04-cmn-ng-if-switch.md)
5. [5. outlet](05-cmn-outlets.md)
6. [6. pipe の仕組み](06-cmn-pipe-mechanism.md)
7. [7. 小さな pipe](07-cmn-simple-pipes.md)
8. [8. KeyValuePipe](08-cmn-keyvalue-pipe.md)
9. [9. DatePipe](09-cmn-date-pipe.md)
10. [10. 日付の書式](10-cmn-format-date.md)
11. [11. 日付の部品](11-cmn-date-getters.md)
12. [12. 数の書式](12-cmn-format-number.md)
13. [13. NgOptimizedImage](13-cmn-image-overview.md)
14. [14. srcset と sizes](14-cmn-image-srcset.md)
15. [15. 画像のローダー](15-cmn-image-loaders.md)
16. [16. LCP と preload](16-cmn-image-lcp-preload.md)
17. [17. Location](17-cmn-location.md)
18. **18. テスト用の Location**（この章）
19. [19. ViewportScroller](19-cmn-viewport-scroller.md)
20. [20. issue と PR を読む](20-cmn-issues.md)

## 1. 3 つの偽物と、TestBed の既定

| 差し替える段 | 偽物 | 本物のコードで残るもの | 入れ方 |
| --- | --- | --- | --- |
| `Location` | `SpyLocation` | 無し（`Location` ごと別物） | `provideLocationMocks()` |
| `LocationStrategy` | `MockLocationStrategy` | 本物の `Location` の正規化 | `provideLocationMocks()` か、自分で provide |
| `PlatformLocation` | `MockPlatformLocation` | 本物の `Location` と `PathLocationStrategy`（base href の付け方まで） | `{provide: PlatformLocation, useClass: MockPlatformLocation}` |
| `PlatformLocation` | `FakeNavigationPlatformLocation` | 同上。中は偽の Navigation API | **TestBed の既定**（何もしなくても入る） |

📄 `angular/packages/common/testing/src/provide_location_mocks.ts` L15–26 （▶ の行: 21, 23–24）

```ts
15 │ /**
16 │  * Returns mock providers for the `Location` and `LocationStrategy` classes.
17 │  * The mocks are helpful in tests to fire simulated location events.
18 │  *
19 │  * @publicApi
20 │  */
21 ▶ export function provideLocationMocks(): Provider[] {
22 │   return [
23 ▶     {provide: Location, useClass: SpyLocation},
24 ▶     {provide: LocationStrategy, useClass: MockLocationStrategy},
25 │   ];
26 │ }
```

📄 `angular/packages/common/testing/src/navigation/provide_fake_platform_navigation.ts` L32–44 （▶ の行: 35, 38–39, 41）

```ts
32 │ /**
33 │  * Return a provider for the `FakeNavigation` in place of the real Navigation API.
34 │  */
35 ▶ export function provideFakePlatformNavigation(): Provider[] {
36 │   return [
37 │     {
38 ▶       provide: PlatformNavigation,
39 ▶       useFactory: () => inject(FAKE_NAVIGATION),
40 │     },
41 ▶     {provide: PlatformLocation, useClass: FakeNavigationPlatformLocation},
42 │     {provide: PRECOMMIT_HANDLER_SUPPORTED, useValue: true},
43 │   ];
44 │ }
```

- 23〜24 行目：`provideLocationMocks()` は 2 つの `useClass` だけです。`PlatformLocation` は差し替えません。`SpyLocation` は `LocationStrategy` を使わないので（5 節）、`Location` を inject する限り `MockLocationStrategy` は出番がありません。
- 35〜44 行目の `provideFakePlatformNavigation()` が、`BrowserTestingModule` の providers に入っています（[テスト環境の初期化の章](../testing/02-testing-init-environment.md)）。41 行目で `PlatformLocation` は `FakeNavigationPlatformLocation` です。これは c795960ada1（2025-08-26、Navigation API の実験的な対応、v21.0.0-next.2 から）で入り、commit の説明に「BREAKING CHANGE: (test only)…前の既定に戻すには `{provide: PlatformLocation, useClass: MockPlatformLocation}`」とあります。**v21 より前の TestBed の既定が `MockPlatformLocation`** でした。

> [!WARNING]
> **ハマりどころ**
>
> router の `RouterTestingModule` の文書コメントには、今も「`MockPlatformLocation` is provided in `TestBed` by default」と書かれています（`router/testing/src/router_testing_module.ts`）。上の c795960ada1 のあとは、既定は `FakeNavigationPlatformLocation` です。古い記事やコメントの「TestBed は MockPlatformLocation」は v20 までの話として読みます。

## 2. MockPlatformLocation：URL を自分で分解する

📄 `angular/packages/common/testing/src/mock_platform_location.ts` L39–63 （▶ の行: 39, 42, 47–48, 59, 61）

```ts
39 ▶ const urlParse = /^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
40 │ 
41 │ function parseUrl(urlStr: string, baseHref: string) {
42 ▶   const verifyProtocol = /^((http[s]?|ftp):\/\/)/;
43 │   let serverBase: string | undefined;
44 │ 
45 │   // URL class requires full URL. If the URL string doesn't start with protocol, we need to add
46 │   // an arbitrary base URL which can be removed afterward.
47 ▶   if (!verifyProtocol.test(urlStr)) {
48 ▶     serverBase = 'http://empty.com/';
49 │   }
50 │   let parsedUrl: {
51 │     protocol: string;
52 │     hostname: string;
53 │     port: string;
54 │     pathname: string;
55 │     search: string;
56 │     hash: string;
57 │   };
58 │   try {
59 ▶     parsedUrl = new URL(urlStr, serverBase);
60 │   } catch (e) {
61 ▶     const result = urlParse.exec(serverBase || '' + urlStr);
62 │     if (!result) {
63 │       throw new Error(`Invalid URL: ${urlStr} with base: ${baseHref}`);
```

📄 `angular/packages/common/testing/src/mock_platform_location.ts` L64–86 （▶ の行: 75–76, 79–82）

```ts
64 │     }
65 │     const hostSplit = result[4].split(':');
66 │     parsedUrl = {
67 │       protocol: result[1],
68 │       hostname: hostSplit[0],
69 │       port: hostSplit[1] || '',
70 │       pathname: result[5],
71 │       search: result[6],
72 │       hash: result[8],
73 │     };
74 │   }
75 ▶   if (parsedUrl.pathname && parsedUrl.pathname.indexOf(baseHref) === 0) {
76 ▶     parsedUrl.pathname = parsedUrl.pathname.substring(baseHref.length);
77 │   }
78 │   return {
79 ▶     hostname: (!serverBase && parsedUrl.hostname) || '',
80 ▶     protocol: (!serverBase && parsedUrl.protocol) || '',
81 ▶     port: (!serverBase && parsedUrl.port) || '',
82 ▶     pathname: parsedUrl.pathname || '/',
83 │     search: parsedUrl.search || '',
84 │     hash: parsedUrl.hash || '',
85 │   };
86 │ }
```

1. **47〜48 行目：プロトコルが無ければ、仮のオリジンを付けて URL クラスに渡す**

   `/a?x=1` のような URL は、59 行目で `new URL('/a?x=1', 'http://empty.com/')` として分解します。`new URL` が例外を投げたときだけ、39 行目の RFC 3986 の正規表現に落ちます（61 行目）。
2. **75〜76 行目：base href を頭から外す**

   `indexOf(baseHref) === 0` の単純な前方一致です。[第 17 回](17-cmn-location.md)の `_stripBasePath` と違い、外した後ろの 1 文字目を見ません。
3. **79〜81 行目：仮のオリジンを付けたときは、ホストを捨てる**

   `serverBase` を付けた（47 行目を通った）ときは、`hostname`・`protocol`・`port` を空文字にします。82 行目で `pathname` が空なら `/`。

> [!NOTE]
> **さらに深く**
>
> 61 行目の `serverBase || '' + urlStr` は、演算子の順で `serverBase || ('' + urlStr)` と読まれます。`serverBase` があるときは `'http://empty.com/'` だけを正規表現にかけ、`urlStr` を見ません。この行に来るのは 59 行目の `new URL` が例外を投げたときだけで、仮のオリジンを付けた相対 URL で `new URL` が失敗する入力は少ないので、表に出にくい書き方です。

📄 `angular/packages/common/testing/src/mock_platform_location.ts` L112–141 （▶ の行: 117–118, 126, 129, 132, 134, 136–137, 139）

```ts
112 │ @Injectable()
113 │ export class MockPlatformLocation implements PlatformLocation {
114 │   private baseHref: string = '';
115 │   private hashUpdate = new Subject<LocationChangeEvent>();
116 │   private popStateSubject = new Subject<LocationChangeEvent>();
117 ▶   private urlChangeIndex: number = 0;
118 ▶   private urlChanges: {
119 │     hostname: string;
120 │     protocol: string;
121 │     port: string;
122 │     pathname: string;
123 │     search: string;
124 │     hash: string;
125 │     state: unknown;
126 ▶   }[] = [{hostname: '', protocol: '', port: '', pathname: '/', search: '', hash: '', state: null}];
127 │ 
128 │   constructor(
129 ▶     @Inject(MOCK_PLATFORM_LOCATION_CONFIG) @Optional() config?: MockPlatformLocationConfig,
130 │   ) {
131 │     if (config) {
132 ▶       this.baseHref = config.appBaseHref || '';
133 │ 
134 ▶       const parsedChanges = this.parseChanges(
135 │         null,
136 ▶         config.startUrl || 'http://_empty_/',
137 ▶         this.baseHref,
138 │       );
139 ▶       this.urlChanges[0] = {...parsedChanges};
140 │     }
141 │   }
```

履歴は 118〜126 行目の `urlChanges` という配列で、1 つの要素が URL の部品と `state` です。117 行目の `urlChangeIndex` が今いる位置です。129 行目の `MOCK_PLATFORM_LOCATION_CONFIG` があれば、132 行目で `appBaseHref` を覚え、134〜138 行目で `startUrl` を分解して 0 番目を作り直します（136〜137 行目、このときだけ base href を外す）。

## 3. MockPlatformLocation：pushState・戻る・進む・イベント

📄 `angular/packages/common/testing/src/mock_platform_location.ts` L189–220 （▶ の行: 191, 196, 198, 208–210, 212–213, 219）

```ts
189 │   private parseChanges(state: unknown, url: string, baseHref: string = '') {
190 │     // When the `history.state` value is stored, it is always copied.
191 ▶     state = JSON.parse(JSON.stringify(state));
192 │     return {...parseUrl(url, baseHref), state};
193 │   }
194 │ 
195 │   replaceState(state: any, title: string, newUrl: string): void {
196 ▶     const {pathname, search, state: parsedState, hash} = this.parseChanges(state, newUrl);
197 │ 
198 ▶     this.urlChanges[this.urlChangeIndex] = {
199 │       ...this.urlChanges[this.urlChangeIndex],
200 │       pathname,
201 │       search,
202 │       hash,
203 │       state: parsedState,
204 │     };
205 │   }
206 │ 
207 │   pushState(state: any, title: string, newUrl: string): void {
208 ▶     const {pathname, search, state: parsedState, hash} = this.parseChanges(state, newUrl);
209 ▶     if (this.urlChangeIndex > 0) {
210 ▶       this.urlChanges.splice(this.urlChangeIndex + 1);
211 │     }
212 ▶     this.urlChanges.push({
213 ▶       ...this.urlChanges[this.urlChangeIndex],
214 │       pathname,
215 │       search,
216 │       hash,
217 │       state: parsedState,
218 │     });
219 ▶     this.urlChangeIndex = this.urlChanges.length - 1;
220 │   }
```

1. **191 行目：state は JSON で写す**

   ブラウザの `history.state` も写しを持つので、それに寄せた行です。ただし JSON なので、`Date` は文字列になり、関数は消え、`undefined` を渡すと `JSON.parse(undefined)` が `SyntaxError` を投げます（ブラウザの structured clone とは違う）。
2. **196・208 行目：書くときは base href を渡さない**

   `parseChanges` の 3 つ目の引数を省くので、2 節の 75〜76 行目は空文字で何も外しません。コンストラクタ（136〜137 行目）とは扱いが違い、`startUrl` の `pathname` からは base href が消え、`pushState` で書いた `pathname` には残ります。
3. **212〜219 行目：今の要素を写して、URL の部品だけ差し替えて末尾に足す**

   213 行目の `...this.urlChanges[this.urlChangeIndex]` でホスト名などを引き継ぎ、219 行目で位置を末尾にします。
4. **209〜211 行目：進む側を捨てる…のは位置が 1 以上のときだけ**

   ブラウザは、戻ったあとに新しく書くと「進む」の側を捨てます。ここは `urlChangeIndex > 0` のときだけ捨てるので、**最初の位置（0）まで戻ってから `pushState` すると、進む側が残ったまま末尾に足されます**。DEMO で go → go → back → back → go と押すと見えます。

📄 `angular/packages/common/testing/src/mock_platform_location.ts` L222–252 （▶ の行: 225–226, 228, 234, 237, 244–245, 247）

```ts
222 │   forward(): void {
223 │     const oldUrl = this.url;
224 │     const oldHash = this.hash;
225 ▶     if (this.urlChangeIndex < this.urlChanges.length) {
226 ▶       this.urlChangeIndex++;
227 │     }
228 ▶     this.emitEvents(oldHash, oldUrl);
229 │   }
230 │ 
231 │   back(): void {
232 │     const oldUrl = this.url;
233 │     const oldHash = this.hash;
234 ▶     if (this.urlChangeIndex > 0) {
235 │       this.urlChangeIndex--;
236 │     }
237 ▶     this.emitEvents(oldHash, oldUrl);
238 │   }
239 │ 
240 │   historyGo(relativePosition: number = 0): void {
241 │     const oldUrl = this.url;
242 │     const oldHash = this.hash;
243 │     const nextPageIndex = this.urlChangeIndex + relativePosition;
244 ▶     if (nextPageIndex >= 0 && nextPageIndex < this.urlChanges.length) {
245 ▶       this.urlChangeIndex = nextPageIndex;
246 │     }
247 ▶     this.emitEvents(oldHash, oldUrl);
248 │   }
249 │ 
250 │   getState(): unknown {
251 │     return this.state;
252 │   }
```

📄 `angular/packages/common/testing/src/mock_platform_location.ts` L254–279 （▶ の行: 265–267, 271–273）

```ts
254 │   /**
255 │    * Browsers are inconsistent in when they fire events and perform the state updates
256 │    * The most easiest thing to do in our mock is synchronous and that happens to match
257 │    * Firefox and Chrome, at least somewhat closely
258 │    *
259 │    * https://github.com/WICG/navigation-api#watching-for-navigations
260 │    * https://docs.google.com/document/d/1Pdve-DJ1JCGilj9Yqf5HxRJyBKSel5owgOvUJqTauwU/edit#heading=h.3ye4v71wsz94
261 │    * popstate is always sent before hashchange:
262 │    * https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event#when_popstate_is_sent
263 │    */
264 │   private emitEvents(oldHash: string, oldUrl: string) {
265 ▶     this.popStateSubject.next({
266 ▶       type: 'popstate',
267 ▶       state: this.getState(),
268 │       oldUrl,
269 │       newUrl: this.url,
270 │     } as LocationChangeEvent);
271 ▶     if (oldHash !== this.hash) {
272 ▶       this.hashUpdate.next({
273 ▶         type: 'hashchange',
274 │         state: null,
275 │         oldUrl,
276 │         newUrl: this.url,
277 │       } as LocationChangeEvent);
278 │     }
279 │   }
```

1. **265〜270 行目：popstate は必ず、その場で（同期で）出す**

   255〜263 行目のコメントのとおり、ブラウザごとにばらつく順番を「同期で popstate、次に hashchange」に決めています。228・237・247 行目は、位置が変わったかどうかに関係なく `emitEvents` を呼ぶので、**最初の位置で `back()` しても popstate が出ます**。
2. **271〜278 行目：# の後ろが変わったときだけ hashchange**

   第 17 回の `PathLocationStrategy.onPopState` は同じ関数を両方に付けるので、# の後ろが変わる戻るでは `Location` の `_subject` に 2 回流れます。
3. **225 行目：進むの上限が 1 つずれている**

   `back` の 234 行目と `historyGo` の 244 行目は範囲の中かを確かめますが、`forward` の 225 行目は `urlChangeIndex < urlChanges.length` です。最後の要素にいるときも 226 行目で 1 つ進み、配列の外を指します。228 行目の `emitEvents` が 267 行目で `getState()`（`urlChanges[urlChangeIndex].state`）を読み、`TypeError` になります。DEMO で go のあと forward を押すと、本物（22.1.6）がそう投げます。

## 4. MockLocationStrategy：URL の文字列の配列

📄 `angular/packages/common/testing/src/mock_location_strategy.ts` L19–46 （▶ の行: 21–22, 24, 27, 32–34, 37–38, 42–43）

```ts
19 │ @Injectable()
20 │ export class MockLocationStrategy extends LocationStrategy {
21 ▶   internalBaseHref: string = '/';
22 ▶   internalPath: string = '/';
23 │   internalTitle: string = '';
24 ▶   urlChanges: string[] = [];
25 │   /** @internal */
26 │   _subject = new Subject<_MockPopStateEvent>();
27 ▶   private stateChanges: any[] = [];
28 │   constructor() {
29 │     super();
30 │   }
31 │ 
32 ▶   simulatePopState(url: string): void {
33 ▶     this.internalPath = url;
34 ▶     this._subject.next(new _MockPopStateEvent(this.path()));
35 │   }
36 │ 
37 ▶   override path(includeHash: boolean = false): string {
38 ▶     return this.internalPath;
39 │   }
40 │ 
41 │   override prepareExternalUrl(internal: string): string {
42 ▶     if (internal.startsWith('/') && this.internalBaseHref.endsWith('/')) {
43 ▶       return this.internalBaseHref + internal.substring(1);
44 │     }
45 │     return this.internalBaseHref + internal;
46 │   }
```

📄 `angular/packages/common/testing/src/mock_location_strategy.ts` L48–72 （▶ の行: 50, 55, 57–58, 63, 71）

```ts
48 │   override pushState(ctx: any, title: string, path: string, query: string): void {
49 │     // Add state change to changes array
50 ▶     this.stateChanges.push(ctx);
51 │ 
52 │     this.internalTitle = title;
53 │ 
54 │     const url = path + (query.length > 0 ? '?' + query : '');
55 ▶     this.internalPath = url;
56 │ 
57 ▶     const externalUrl = this.prepareExternalUrl(url);
58 ▶     this.urlChanges.push(externalUrl);
59 │   }
60 │ 
61 │   override replaceState(ctx: any, title: string, path: string, query: string): void {
62 │     // Reset the last index of stateChanges to the ctx (state) object
63 ▶     this.stateChanges[(this.stateChanges.length || 1) - 1] = ctx;
64 │ 
65 │     this.internalTitle = title;
66 │ 
67 │     const url = path + (query.length > 0 ? '?' + query : '');
68 │     this.internalPath = url;
69 │ 
70 │     const externalUrl = this.prepareExternalUrl(url);
71 ▶     this.urlChanges.push('replace: ' + externalUrl);
72 │   }
```

📄 `angular/packages/common/testing/src/mock_location_strategy.ts` L74–98 （▶ の行: 75, 83–84, 86–87, 92）

```ts
74 │   override onPopState(fn: (value: any) => void): void {
75 ▶     this._subject.subscribe({next: fn});
76 │   }
77 │ 
78 │   override getBaseHref(): string {
79 │     return this.internalBaseHref;
80 │   }
81 │ 
82 │   override back(): void {
83 ▶     if (this.urlChanges.length > 0) {
84 ▶       this.urlChanges.pop();
85 │       this.stateChanges.pop();
86 ▶       const nextUrl = this.urlChanges.length > 0 ? this.urlChanges[this.urlChanges.length - 1] : '';
87 ▶       this.simulatePopState(nextUrl);
88 │     }
89 │   }
90 │ 
91 │   override forward(): void {
92 ▶     throw 'not implemented';
93 │   }
94 │ 
95 │   override getState(): unknown {
96 │     return this.stateChanges[(this.stateChanges.length || 1) - 1];
97 │   }
98 │ }
```

- 21〜22 行目：base href も今のパスも `/` から始まります。37〜38 行目の `path` は `includeHash` を無視して `internalPath` を返すだけです。
- 24 行目の `urlChanges` は、テストが「何を書いたか」を見るための公開の配列です。58 行目で書いた外向きの URL を、71 行目で `replace: ` を頭に付けて積みます。
- 83〜87 行目：`back` は `urlChanges` の最後を捨て、残った最後の文字列で 32〜35 行目の `simulatePopState` を呼びます。`urlChanges` は記録用の文字列なので、**`replaceState` のあとで戻ると、今のパスが `replace: /b` という文字列になります**。本物の `Location` と組み合わせて go('/a') → replaceState('/b') → go('/c') → back と呼ぶと、`location.path()` は `'replace: /b'` でした（22.1.6 を Node で動かして確かめた）。
- 92 行目：`forward` は文字列 `'not implemented'` を投げます（`Error` ではない）。
- 75 行目：`onPopState` は Subject を購読するだけで、外す関数を返しません。34 行目で流すのは `_MockPopStateEvent`（`newUrl` を持ち、`url` は持たない）です。

## 5. SpyLocation：Location そのものを置き換える

📄 `angular/packages/common/testing/src/location_mock.ts` L23–55 （▶ の行: 24–27, 33, 45–46, 49–50, 53–54）

```ts
23 │ @Injectable()
24 ▶ export class SpyLocation implements Location {
25 ▶   urlChanges: string[] = [];
26 ▶   private _history: LocationState[] = [new LocationState('', '', null)];
27 ▶   private _historyIndex: number = 0;
28 │   /** @internal */
29 │   _subject = new Subject<PopStateEvent>();
30 │   /** @internal */
31 │   _basePath: string = '';
32 │   /** @internal */
33 ▶   _locationStrategy: LocationStrategy = null!;
34 │   /** @internal */
35 │   _urlChangeListeners: ((url: string, state: unknown) => void)[] = [];
36 │   /** @internal */
37 │   _urlChangeSubscription: SubscriptionLike | null = null;
38 │ 
39 │   /** @docs-private */
40 │   ngOnDestroy(): void {
41 │     this._urlChangeSubscription?.unsubscribe();
42 │     this._urlChangeListeners = [];
43 │   }
44 │ 
45 ▶   setInitialPath(url: string) {
46 ▶     this._history[this._historyIndex].path = url;
47 │   }
48 │ 
49 ▶   setBaseHref(url: string) {
50 ▶     this._basePath = url;
51 │   }
52 │ 
53 ▶   path(): string {
54 ▶     return this._history[this._historyIndex].path;
55 │   }
```

- 24 行目：`extends` ではなく `implements Location` です。本物の `Location` のコードは 1 行も通りません。33 行目、`_locationStrategy` は `null` のままです。
- 26〜27 行目：履歴は `LocationState`（path・query・state）の配列で、最初の 1 つは空文字のパスです。45〜47 行目の `setInitialPath` で書き換えられます。
- 53〜54 行目：`path()` は配列の今の要素の `path` をそのまま返します。正規化はしません。

📄 `angular/packages/common/testing/src/location_mock.ts` L61–90 （▶ の行: 62, 67, 70–71, 75–76, 78, 81–82, 86–87, 89）

```ts
61 │   isCurrentPathEqualTo(path: string, query: string = ''): boolean {
62 ▶     const givenPath = path.endsWith('/') ? path.substring(0, path.length - 1) : path;
63 │     const currPath = this.path().endsWith('/')
64 │       ? this.path().substring(0, this.path().length - 1)
65 │       : this.path();
66 │ 
67 ▶     return currPath == givenPath + (query.length > 0 ? '?' + query : '');
68 │   }
69 │ 
70 ▶   simulateUrlPop(pathname: string) {
71 ▶     this._subject.next({'url': pathname, 'pop': true, 'type': 'popstate'});
72 │   }
73 │ 
74 │   simulateHashChange(pathname: string) {
75 ▶     const path = this.prepareExternalUrl(pathname);
76 ▶     this.pushHistory(path, '', null);
77 │ 
78 ▶     this.urlChanges.push('hash: ' + pathname);
79 │     // the browser will automatically fire popstate event before each `hashchange` event, so we need
80 │     // to simulate it.
81 ▶     this._subject.next({'url': pathname, 'pop': true, 'type': 'popstate'});
82 ▶     this._subject.next({'url': pathname, 'pop': true, 'type': 'hashchange'});
83 │   }
84 │ 
85 │   prepareExternalUrl(url: string): string {
86 ▶     if (url.length > 0 && !url.startsWith('/')) {
87 ▶       url = '/' + url;
88 │     }
89 ▶     return this._basePath + url;
90 │   }
```

- 70〜72 行目：`simulateUrlPop` は popstate のイベントを流すだけで、**履歴の配列も位置も変えません**。`path()` は前のままです。
- 74〜83 行目：`simulateHashChange` は 76 行目で履歴に積み、78 行目で `urlChanges` に `hash: ` 付きで記録し、81〜82 行目で popstate → hashchange の順に流します（ブラウザの順に合わせる、とコメント）。
- 85〜90 行目：`prepareExternalUrl` は先頭に `/` を足して `_basePath` を前に付けるだけです。`joinWithSlash` ではないので、`setBaseHref('/my/')` だと `/my//foo` になります。
- 62・67 行目：`isCurrentPathEqualTo` は末尾の `/` を 1 つ外して比べる、独自の比べ方です。

📄 `angular/packages/common/testing/src/location_mock.ts` L92–124 （▶ の行: 93, 95, 97–99, 103–104, 112, 114–115, 122）

```ts
 92 │   go(path: string, query: string = '', state: any = null) {
 93 ▶     path = this.prepareExternalUrl(path);
 94 │ 
 95 ▶     this.pushHistory(path, query, state);
 96 │ 
 97 ▶     const locationState = this._history[this._historyIndex - 1];
 98 ▶     if (locationState.path == path && locationState.query == query) {
 99 ▶       return;
100 │     }
101 │ 
102 │     const url = path + (query.length > 0 ? '?' + query : '');
103 ▶     this.urlChanges.push(url);
104 ▶     this._notifyUrlChangeListeners(path + normalizeQueryParams(query), state);
105 │   }
106 │ 
107 │   replaceState(path: string, query: string = '', state: any = null) {
108 │     path = this.prepareExternalUrl(path);
109 │ 
110 │     const history = this._history[this._historyIndex];
111 │ 
112 ▶     history.state = state;
113 │ 
114 ▶     if (history.path == path && history.query == query) {
115 ▶       return;
116 │     }
117 │ 
118 │     history.path = path;
119 │     history.query = query;
120 │ 
121 │     const url = path + (query.length > 0 ? '?' + query : '');
122 ▶     this.urlChanges.push('replace: ' + url);
123 │     this._notifyUrlChangeListeners(path + normalizeQueryParams(query), state);
124 │   }
```

1. **95 行目：先に積む**

   `go` は 93 行目で外向きの形にしてから、まず履歴に積みます。
2. **97〜100 行目：1 つ前と同じなら、記録も通知もしない**

   ただし 95 行目で積んだ要素はそのまま残ります。`go('/a')` を 2 回呼ぶと、履歴は `['', '/a', '/a']`、`urlChanges` は `['/a']` です。
3. **103〜104 行目：記録して、onUrlChange の listener に知らせる**

   本物の `Location.go` と同じく、`subscribe` には流しません。
4. **112〜122 行目：replaceState は今の要素を書き換える**

   112 行目で先に `state` だけ書き、114 行目で URL が同じなら記録しないで戻ります。122 行目の記録は `replace: ` 付きです。

📄 `angular/packages/common/testing/src/location_mock.ts` L126–161 （▶ の行: 127–129, 139–140, 152–153）

```ts
126 │   forward() {
127 ▶     if (this._historyIndex < this._history.length - 1) {
128 ▶       this._historyIndex++;
129 ▶       this._subject.next({
130 │         'url': this.path(),
131 │         'state': this.getState(),
132 │         'pop': true,
133 │         'type': 'popstate',
134 │       });
135 │     }
136 │   }
137 │ 
138 │   back() {
139 ▶     if (this._historyIndex > 0) {
140 ▶       this._historyIndex--;
141 │       this._subject.next({
142 │         'url': this.path(),
143 │         'state': this.getState(),
144 │         'pop': true,
145 │         'type': 'popstate',
146 │       });
147 │     }
148 │   }
149 │ 
150 │   historyGo(relativePosition: number = 0): void {
151 │     const nextPageIndex = this._historyIndex + relativePosition;
152 ▶     if (nextPageIndex >= 0 && nextPageIndex < this._history.length) {
153 ▶       this._historyIndex = nextPageIndex;
154 │       this._subject.next({
155 │         'url': this.path(),
156 │         'state': this.getState(),
157 │         'pop': true,
158 │         'type': 'popstate',
159 │       });
160 │     }
161 │   }
```

📄 `angular/packages/common/testing/src/location_mock.ts` L198–217 （▶ の行: 198–199, 203–204, 206–207）

```ts
198 ▶   normalize(url: string): string {
199 ▶     return null!;
200 │   }
201 │ 
202 │   private pushHistory(path: string, query: string, state: any) {
203 ▶     if (this._historyIndex > 0) {
204 ▶       this._history.splice(this._historyIndex + 1);
205 │     }
206 ▶     this._history.push(new LocationState(path, query, state));
207 ▶     this._historyIndex = this._history.length - 1;
208 │   }
209 │ }
210 │ 
211 │ class LocationState {
212 │   constructor(
213 │     public path: string,
214 │     public query: string,
215 │     public state: any,
216 │   ) {}
217 │ }
```

- 127・139・152 行目：`SpyLocation` の戻る・進む・`historyGo` は範囲を確かめ、外なら何もしません（popstate も出さない）。この点はブラウザに近い動きです。
- 198〜199 行目：`normalize` は **`null` を返します**。`SpyLocation` を入れたテストでは、`normalize` を使うコード（ルーターではなく、利用者のコード）の結果は確かめられません。
- 203〜204 行目：進む側を捨てる条件が、3 節の `MockPlatformLocation` と同じく `_historyIndex > 0` です。0 まで戻ってから `go` すると、進む側が残ります。

## 6. 本家の spec はどう使っているか

📄 `angular/packages/common/test/location/location_spec.ts` L50–78 （▶ の行: 58, 60, 62, 65, 75, 77）

```ts
50 │   describe('location.getState()', () => {
51 │     let location: Location;
52 │ 
53 │     beforeEach(() => {
54 │       TestBed.configureTestingModule({
55 │         teardown: {destroyAfterEach: true},
56 │         imports: [CommonModule],
57 │         providers: [
58 ▶           {provide: LocationStrategy, useClass: PathLocationStrategy},
59 │           {
60 ▶             provide: PlatformLocation,
61 │             useFactory: () => {
62 ▶               return new MockPlatformLocation();
63 │             },
64 │           },
65 ▶           {provide: Location, useClass: Location, deps: [LocationStrategy]},
66 │         ],
67 │       });
68 │ 
69 │       location = TestBed.inject(Location);
70 │     });
71 │ 
72 │     it('should get the state object', () => {
73 │       expect(location.getState()).toBe(null);
74 │ 
75 ▶       location.go('/test', '', {foo: 'bar'});
76 │ 
77 ▶       expect(location.getState()).toEqual({foo: 'bar'});
78 │     });
```

`location.getState()` の describe は、58〜65 行目で **本物の `PathLocationStrategy` と本物の `Location` の下に `MockPlatformLocation`** を入れています。75 行目の `go` の state が、3 節の 191 行目の写しを通って 77 行目で `toEqual`（中身が同じか）で返ることを見ています。`toBe`（同じオブジェクトか）ではないのは、写しだからです。

📄 `angular/packages/common/test/location/location_spec.ts` L182–198 （▶ の行: 185–187, 189–190, 193, 196–197）

```ts
182 │     it('should unregister a URL change listener and unsubscribe from URL changes when the root view is removed', () => {
183 │       const changeListener = jasmine.createSpy('changeListener');
184 │ 
185 ▶       const removeUrlChangeFn = location.onUrlChange(changeListener);
186 ▶       location.go('x');
187 ▶       expect(changeListener).toHaveBeenCalledTimes(1);
188 │ 
189 ▶       removeUrlChangeFn();
190 ▶       expect(changeListener).toHaveBeenCalledTimes(1);
191 │ 
192 │       location.onUrlChange((url: string, state: unknown) => {});
193 ▶       TestBed.resetTestingModule();
194 │       // Let's ensure that URL change listeners are unregistered when the root view is removed,
195 │       // tho the last returned `onUrlChange` function hasn't been invoked.
196 ▶       expect((location as any)._urlChangeListeners.length).toEqual(0);
197 ▶       expect((location as any)._urlChangeSubscription.closed).toEqual(true);
198 │     });
```

`location.onUrlChange()` の describe は `LocationStrategy` に `MockLocationStrategy` を入れています（describe の `beforeEach` で）。186〜187 行目で `go` が listener を 1 回呼ぶこと、193〜197 行目で `TestBed.resetTestingModule()` が injector を壊したときに、`Location` の `ngOnDestroy` が listener と購読を外すことを確かめています。

📄 `angular/packages/common/test/location/provide_location_mocks_spec.ts` L13–22 （▶ の行: 15, 19–20）

```ts
13 │ describe('provideLocationMocks() function', () => {
14 │   it('should mock Location and LocationStrategy classes', () => {
15 ▶     TestBed.configureTestingModule({providers: [provideLocationMocks()]});
16 │     const location = TestBed.inject(Location);
17 │     const locationStrategy = TestBed.inject(LocationStrategy);
18 │ 
19 ▶     expect(location).toBeInstanceOf(SpyLocation);
20 ▶     expect(locationStrategy).toBeInstanceOf(MockLocationStrategy);
21 │   });
22 │ });
```

provide\_location\_mocks\_spec.ts は it が 1 つで、19〜20 行目で 2 つの差し替えが入ったことだけを見ています。`SpyLocation` と `MockPlatformLocation` の履歴の動きそのものを確かめる spec は、`packages/common/test/` にはありません。

## 7. ルーターのテストでの形

- `provideRouter` と `RouterTestingHarness` で書くテストは、何も足さなければ TestBed の既定の `FakeNavigationPlatformLocation` の上で動きます（[ルーターのテストの章の 3 節](../testing/19-testing-router-harness.md)）。
- 非推奨の `RouterTestingModule` は `provideLocationMocks()` を入れます。`Location` が `SpyLocation` になるので、`location.path()` は正規化を通らない値、`urlChanges` で書いた順が見られます（同じ章で引用）。
- 第 17 回の `trailing_slash_integration.spec.ts` は、既定のままで `TestBed.inject(PlatformLocation).pathname` を読んでいます。`LocationStrategy` だけ本物の戦略に差し替え、`PlatformLocation` は既定の偽物です。

> **🧪 DEMO — 本物の偽物で、履歴を動かす**
>
> ボタンを押すと、章の中だけの小さな DI の木を作ります。「MockPlatformLocation」は、本物の `MockPlatformLocation`・本物の `PathLocationStrategy`（`APP_BASE_HREF` は `/`）・本物の `Location`（22.1.6）。「provideLocationMocks」は、本物の `provideLocationMocks()` だけ（`Location` は `SpyLocation`）。どちらも `location.subscribe` と `location.onUrlChange` を 1 つずつ付け、届いた順に下のログに足します。表の配列と位置は、表示のためだけに private のフィールド（`urlChanges`・`urlChangeIndex`・`_history`・`_historyIndex`）を読んでいます。このページの URL と履歴は変わりません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-location-testing)

- MockPlatformLocation で go（/a）→ forward：3 節の 225 行目のとおり `TypeError` になり、そのあと `path()` も例外になります（位置が配列の外のまま）。back を押すと、234〜235 行目で位置が配列の中に戻り、読めるようになります。
- MockPlatformLocation で go（/a）→ go（/b）→ back → back → go（/c）：配列は `/`・`/a`・`/b`・`/c` の 4 つ、位置は 3 です（209 行目）。ブラウザなら `/`・`/c` の 2 つです。provideLocationMocks でも同じ順に押すと、`_history` が同じ形になります（203 行目）。
- MockPlatformLocation で最初の位置のまま back：位置は変わりませんが、ログに `subscribe: popstate` が出ます（237 行目）。provideLocationMocks では何も出ません（139 行目）。
- go と back で、onUrlChange が受け取る URL の形が違うことも見えます（第 17 回の 7 節）。

## ここまでの呼び出し（MockPlatformLocation で back）

- 👤 `location.back()` — テストのコード
  - `PathLocationStrategy.back → MockPlatformLocation.back` — mock\_platform\_location.ts 231
    - `urlChangeIndex--`（0 より大きいときだけ） — mock\_platform\_location.ts 234
    - `emitEvents → popStateSubject.next({type: 'popstate'})` — mock\_platform\_location.ts 265 — *同期*
      - `Location のコンストラクタで渡した関数 → _subject.next({url: path(true), pop: true})` — location.ts（第 17 回）
        - `subscribe の関数 / onUrlChange の listener` — テストのコード
    - `hashUpdate.next({type: 'hashchange'})`（# の後ろが変わったときだけ） — mock\_platform\_location.ts 272

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| common/test/location/location\_spec.ts | describe `location.getState()`（50 行目。`MockPlatformLocation` を使う it 4 つ）・`location.onUrlChange()`（142 行目。`MockLocationStrategy` を使う） | `//packages/common/test:test`（Node） |
| common/test/location/provide\_location\_mocks\_spec.ts | describe `provideLocationMocks() function`（13 行目）の it 1 つ | `//packages/common/test:test`（Node） |

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/common/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=Location Class'
pnpm bazel test //packages/common/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=provideLocationMocks'
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/cmn-logs/d-location-class.log・d-mocks.log）`

```
Ran 22 of 667 specs
22 specs, 0 failures
Finished in 0.033 seconds
//packages/common/test:test                                              PASSED in 0.7s

Ran 1 of 667 specs
1 spec, 0 failures
Finished in 0.023 seconds
//packages/common/test:test                                              PASSED in 0.7s
```

- `Location Class` の 22 件の中に、`MockPlatformLocation` を使う `location.getState()` の it が 4 つ（72・80・93・107 行目）あります。最初の位置での back や、最後の位置での forward を試す it はありません。

### 直すとしたら

- 3 節の 225 行目（forward の上限）と 209 行目・5 節の 203 行目（位置 0 で進む側を捨てない）は、テスト用の部品の中の話です。直すなら `mock_platform_location.ts` の `forward`・`pushState`、`location_mock.ts` の `pushHistory` で、spec は今は無いので、`location.getState()` の describe と同じ形（本物の `Location` の下に `MockPlatformLocation`）で「最後で forward しても投げない」「0 まで戻ってから go すると進む側が消える」を足す入口になります。
- 4 節の `replace: ` の件は `mock_location_strategy.ts` の `back`（83〜87 行目）です。記録用の `urlChanges` と、戻り先の URL を同じ配列で兼ねているのが元です。
- この 3 つは `gh search issues`（"MockPlatformLocation"・"MockLocationStrategy"・"SpyLocation"）で既存の issue が見つかりませんでした（2026-11-05）。main の同じファイルも同じ行のままです（`gh api` で読んで確かめた）。どれも TestBed の既定ではない部品なので、ふつうのテストには出ません。`MockPlatformLocation` を自分で入れたテストで forward を最後に呼ぶ、などのときだけ出ます。
- 本家に PR を出すことは勧めません。テストで URL が想定と違うときに、「どの偽物が入っているか」（1 節の表）を先に確かめる手がかりにします（[第 20 回](20-cmn-issues.md)）。

## 聞かれそうな質問

**Q. TestBed で Location を inject すると、何が入っていますか？**

本物の `Location` と本物の `PathLocationStrategy` で、`PlatformLocation` だけが偽物の `FakeNavigationPlatformLocation` です（provide\_fake\_platform\_navigation.ts 41 行目、c795960ada1 から）。`provideLocationMocks()` を足したときだけ、23〜24 行目で `SpyLocation` と `MockLocationStrategy` になります。

**Q. SpyLocation の path() に base href が付いたままなのはなぜ？**

`SpyLocation` は本物の `Location` を継承せず（24 行目）、`go` の 93 行目で `_basePath` を前に付けた形を積み、`path()`（53〜54 行目）はそれをそのまま返すからです。`normalize` も 199 行目で `null` を返すだけです。

**Q. simulateUrlPop を呼んだのに path() が変わりません。**

70〜72 行目は popstate のイベントを `_subject` に流すだけで、履歴の配列も位置も変えないからです。履歴も動かしたいなら `back()`・`forward()` か、`simulateHashChange`（76 行目で積む）を使います。

**Q. MockPlatformLocation で state に Date を入れたら、文字列で返ってきました。**

191 行目で `JSON.parse(JSON.stringify(state))` の写しを持つからです。ブラウザの `history.state` は structured clone なので `Date` のまま返ります。ここは偽物とブラウザの違いです。

**Q. MockPlatformLocation の back で、hashchange も届くのはなぜ？**

271〜278 行目で、戻る前と後で `hash` が違えば popstate の後に hashchange も流すからです。`PathLocationStrategy` は両方を同じ関数で受けるので、`Location.subscribe` には 2 回届きます。

## 読み終えて

- 偽物は 3 段ぶん：`SpyLocation`（Location ごと）・`MockLocationStrategy`（戦略）・`MockPlatformLocation`（DOM の段）。v21 からの TestBed の既定は `FakeNavigationPlatformLocation`。
- `MockPlatformLocation` は URL を `new URL` で分解し、部品の配列と位置で履歴を持ち、イベントを同期で出す。下の段だけ偽物なので、本物の正規化が通る。
- `SpyLocation` は本物の `Location` を通らない。`path()` は積んだままの値、`normalize` は `null`、`urlChanges` に書いた順が残る。
- 位置 0 で進む側を捨てない・最後で forward すると例外・`replace: ` が戻り先になる、は偽物の中の振る舞い。ブラウザとは違う。

---

← 前: [Location：URL を正規化して読み書きする](17-cmn-location.md)  
次: [ViewportScroller：位置とアンカーへのスクロール](19-cmn-viewport-scroller.md) →
