[目次](../README.md) › [common の説明文の読み残し](README.md) › 第 8 回 / 全 9 回

# Location と LocationStrategy の説明文

> location/location.ts・location\_strategy.ts・platform\_location.ts・hash\_location\_strategy.ts・util.ts と viewport\_scroller.ts・version.ts・dom\_adapter.ts の未読の行：「正規化された URL」の定義と normalize・prepareExternalUrl・go の食い違い、APP\_BASE\_HREF の例、Path と Hash の戦略が書く URL、末尾のスラッシュの 2 つの戦略、ブラウザー用の PlatformLocation の在りか、ViewportScroller の余白と anchor。偽物の PlatformLocation を差した本物の Location で確かめる。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-location)

---

この章で分かること：`Location`・`LocationStrategy`（`PathLocationStrategy`・`HashLocationStrategy`・末尾のスラッシュの 2 つ）・`PlatformLocation`・`ViewportScroller` の説明文が約束すること（正規化された URL の形、`APP_BASE_HREF`、hash の扱い、スクロールの余白）を、説明文の例の入力で本物に通した結果です。いちばん大きな食い違いは、`Location` のクラスの説明が「正規化された URL は base href を含む」と書くのに、`normalize` も `path` も base href を外すことです。

読む対象は `packages/common/src/location/` の `location.ts`・`location_strategy.ts`・`hash_location_strategy.ts`・`platform_location.ts`・`util.ts`、`packages/common/src/viewport_scroller.ts`、小さなファイルの `version.ts`・`dom_adapter.ts` と、例の `packages/examples/common/location/ts/`（../angular、8576f161ae4）です。デモはページの URL もスクロールも変えません。`PlatformLocation` を、受け取った URL を配列に覚えるだけの偽物にして `createEnvironmentInjector` の providers で差し、その injector から本物の `Location` と戦略を取ります。実装の行（`_stripBasePath`・`prepareExternalUrl`・`onUrlChange`）は[Location の章](../cmn/17-cmn-location.md)、テスト用の偽物は[テスト用の Location の章](../cmn/18-cmn-location-testing.md)、スクロールの実装は[ViewportScroller の章](../cmn/19-cmn-viewport-scroller.md)、ルーターが URL を読み書きする流れは[ルーターとブラウザーの URL の章](../router/16-router-browser-url.md)にあります。

1. [1. NgOptimizedImage](01-cmd-image.md)
2. [2. 画像のローダー](02-cmd-image-loaders.md)
3. [3. 日付の書式](03-cmd-date.md)
4. [4. 数と i18n の pipe](04-cmd-number.md)
5. [5. 構造ディレクティブ](05-cmd-structural.md)
6. [6. NgClass・NgStyle と outlet](06-cmd-attr-outlets.md)
7. [7. AsyncPipe と小さな pipe](07-cmd-pipes.md)
8. **8. Location**（この章）
9. [9. spec と issue](09-cmd-tests-issues.md)

## 1. 「正規化された URL」の定義

📄 `angular/packages/common/src/location/location.ts` L15–51 （▶ の行: 30–31, 35–37, 39–44, 48）

```ts
15 │ /** @publicApi */
16 │ export interface PopStateEvent {
17 │   pop?: boolean;
18 │   state?: any;
19 │   type?: string;
20 │   url?: string;
21 │   /** Whether the user agent performed a visual transition for this navigation. */
22 │   hasUAVisualTransition?: boolean;
23 │ }
24 │ 
25 │ /**
26 │  * @description
27 │  *
28 │  * A service that applications can use to interact with a browser's URL.
29 │  *
30 ▶  * Depending on the `LocationStrategy` used, `Location` persists
31 ▶  * to the URL's path or the URL's hash segment.
32 │  *
33 │  * @usageNotes
34 │  *
35 ▶  * It's better to use the `Router.navigate()` service to trigger route changes. Use
36 ▶  * `Location` only if you need to interact with or create normalized URLs outside of
37 ▶  * routing.
38 │  *
39 ▶  * `Location` is responsible for normalizing the URL against the application's base href.
40 ▶  * A normalized URL is absolute from the URL host, includes the application's base href, and has no
41 ▶  * trailing slash:
42 ▶  * - `/my/app/user/123` is normalized
43 ▶  * - `my/app/user/123` **is not** normalized
44 ▶  * - `/my/app/user/123/` **is not** normalized
45 │  *
46 │  * ### Example
47 │  *
48 ▶  * {@example common/location/ts/path_location_component.ts region='LocationComponent'}
49 │  *
50 │  * @publicApi
51 │  */
```

39〜41 行目は「`Location` は URL をアプリの base href に対して正規化する。正規化された URL は host からの絶対パスで、base href を含み、末尾にスラッシュが無い」と書き、42〜44 行目に 3 つの例を置きます。`APP_BASE_HREF` を `'/my/app/'` にして本物の `Location` に通すと、次のとおりでした（DEMO の「正規化」の表）。

| 入力 | 説明文 | `normalize` | `prepareExternalUrl` |
| --- | --- | --- | --- |
| `'/my/app/user/123'` | 正規化されている（42 行目） | `'/user/123'` | `'/my/app/my/app/user/123'` |
| `'my/app/user/123'` | 正規化されていない（43 行目） | `'my/app/user/123'`（そのまま） | — |
| `'/my/app/user/123/'` | 正規化されていない（44 行目） | `'/user/123'` | — |
| `'user/123'` | — | — | `'/my/app/user/123'` |

`normalize` は base href を**外し**、末尾のスラッシュを外し、先頭のスラッシュは足しません。base href を含む「正規化された URL」を作るのは書く側の `prepareExternalUrl` で、こちらは先頭のスラッシュを足して base href を付けます。読む側と書く側で規則が違うこと自体は[Location の章](../cmn/17-cmn-location.md)の 3〜4 節が読んでいます。spec の describe の名前は `location.normalize(url) should return only route`（location\_spec.ts 252）で、「route だけを返す」ことを固めています。39〜44 行目の定義は、spec とも `normalize` とも合いません。

48 行目が指す例（path\_location\_component.ts）は、`Normalize: <code>/foo/bar/</code> is: …location.normalize('foo/bar')…` と書いていて、見出しの `/foo/bar/` と渡している `'foo/bar'` が違います。`APP_BASE_HREF` が `'/'` のその例で実行すると、Path と Hash のどちらの戦略でも `'foo/bar'`（43 行目の「正規化されていない」形）がそのまま返りました。

📄 `angular/packages/common/src/location/location.ts` L91–98 （▶ の行: 94–96）

```ts
91 │   }
92 │ 
93 │   /** @docs-private */
94 ▶   ngOnDestroy(): void {
95 ▶     this._urlChangeSubscription?.unsubscribe();
96 ▶     this._urlChangeListeners = [];
97 │   }
98 │ 
```

`Location` が壊れるとき（injector の破棄）に、`onUrlChange` のために作った購読と登録した関数を捨てます。デモでは偽物を差した injector を 1 行ごとに `destroy` しているので、ここが毎回走ります。

## 2. go の「正規化した URL に変える」

📄 `angular/packages/common/src/location/location.ts` L160–170 （▶ の行: 161, 163–164）

```ts
160 │ 
161 ▶   // TODO: rename this method to pushState
162 │   /**
163 ▶    * Changes the browser's URL to a normalized version of a given URL, and pushes a
164 ▶    * new item onto the platform's history.
165 │    *
166 │    * @param path  URL path to normalize.
167 │    * @param query Query parameters.
168 │    * @param state Location history state.
169 │    *
170 │    */
```

163〜164 行目は「与えた URL の正規化した形にブラウザーの URL を変える」と書きますが、`go` は `LocationStrategy.pushState` にそのまま渡し、戦略は `prepareExternalUrl`（base href をつなぐだけ）を通すだけです。`go('/foo/')` は `/my/app/foo/` を書き、44 行目の定義の「末尾にスラッシュが無い」にはなりません。末尾をそろえたいなら 7 節の 2 つの戦略です。161 行目の TODO は、名前を `pushState` に変えたい、というものです。

## 3. static な関数：joinWithSlash・stripTrailingSlash・normalizeQueryParams

📄 `angular/packages/common/src/location/location.ts` L279–310 （▶ の行: 281, 287, 290, 298, 301–303, 309）

```ts
279 │ 
280 │   /**
281 ▶    * Normalizes URL parameters by prepending with `?` if needed.
282 │    *
283 │    * @param  params String of URL parameters.
284 │    *
285 │    * @returns The normalized URL parameters string.
286 │    */
287 ▶   public static normalizeQueryParams: (params: string) => string = normalizeQueryParams;
288 │ 
289 │   /**
290 ▶    * Joins two parts of a URL with a slash if needed.
291 │    *
292 │    * @param start  URL string
293 │    * @param end    URL string
294 │    *
295 │    *
296 │    * @returns The joined URL string.
297 │    */
298 ▶   public static joinWithSlash: (start: string, end: string) => string = joinWithSlash;
299 │ 
300 │   /**
301 ▶    * Removes a trailing slash from a URL string if needed.
302 ▶    * Looks for the first occurrence of either `#`, `?`, or the end of the
303 ▶    * line as `/` characters and removes the trailing slash if one exists.
304 │    *
305 │    * @param url URL string.
306 │    *
307 │    * @returns The URL string, modified if needed.
308 │    */
309 ▶   public static stripTrailingSlash: (url: string) => string = stripTrailingSlash;
310 │ }
```

📄 `angular/packages/common/src/location/util.ts` L9–17 （▶ の行: 10）

```ts
 9 │ /**
10 ▶  * Joins two parts of a URL with a slash if needed.
11 │  *
12 │  * @param start  URL string
13 │  * @param end    URL string
14 │  *
15 │  *
16 │  * @returns The joined URL string.
17 │  */
```

📄 `angular/packages/common/src/location/util.ts` L30–39 （▶ の行: 32–34）

```ts
30 │ 
31 │ /**
32 ▶  * Removes a trailing slash from a URL string if needed.
33 ▶  * Looks for the first occurrence of either `#`, `?`, or the end of the
34 ▶  * line as `/` characters and removes the trailing slash if one exists.
35 │  *
36 │  * @param url URL string.
37 │  *
38 │  * @returns The URL string, modified if needed.
39 │  */
```

3 つの static は util.ts の関数をそのまま載せたもので（287・298・309 行目）、説明文も util.ts と同じ文です。302〜303 行目（util.ts の 33〜34 行目）の「`#`・`?`・行の末尾の最初の出現を、`/` の文字として探し」は文として崩れていますが、実装は「`#` か `?` か文字列の末尾の位置を探し、その直前が `/` なら 1 つ外す」です（util.ts L40〜47、Location の章）。DEMO では、`'/my/app/user/?page=1'` は `'/my/app/user?page=1'`、query の中の `'?next=/a/'` は外さず、`'/my/app//'` は 1 つだけ外して `'/my/app/'`、`'/'` は `''` でした。最後の形は spec の `should strip single character slash`（location\_spec.ts 24）が固めています。290 行目「必要なら / をはさむ」の `joinWithSlash` は、片方が空ならもう片方をそのまま返し、つなぎ目の `/` を 1 つにするのは 1 つずつだけで、`'/my/app//'` と `'//user'` は `'/my/app///user'` でした。

同じクラスの `subscribe` の説明（L255〜266、[Location の章](../cmn/17-cmn-location.md)の 7 節が引用）は、`@param value`・`@param exception` と、実際の引数 `onNext`・`onThrow`・`onReturn` と違う名前を書いています。これは main の 6e024600e0b（2026-10-08、`docs: fix @param names that don't match their parameters`）で 3 つの名前に直りました。8576f161ae4 には入っていません。

## 4. LocationStrategy と APP\_BASE\_HREF

📄 `angular/packages/common/src/location/location_strategy.ts` L20–38 （▶ の行: 23–25, 30–33）

```ts
20 │ import {joinWithSlash, normalizeQueryParams} from './util';
21 │ 
22 │ /**
23 ▶  * Enables the `Location` service to read route state from the browser's URL.
24 ▶  * Angular provides two strategies:
25 ▶  * `HashLocationStrategy` and `PathLocationStrategy`.
26 │  *
27 │  * Applications should use the `Router` or `Location` services to
28 │  * interact with application route state.
29 │  *
30 ▶  * For instance, `HashLocationStrategy` produces URLs like
31 ▶  * <code class="no-auto-link">http://example.com/#/foo</code>,
32 ▶  * and `PathLocationStrategy` produces
33 ▶  * <code class="no-auto-link">http://example.com/foo</code> as an equivalent URL.
34 │  *
35 │  * See these two classes for more.
36 │  *
37 │  * @publicApi
38 │  */
```

📄 `angular/packages/common/src/location/location_strategy.ts` L54–80 （▶ の行: 58–59, 66–68, 70–74）

````ts
54 │ 
55 │ /**
56 │  * A predefined DI token for the base href
57 │  * to be used with the `PathLocationStrategy`.
58 ▶  * The base href is the URL prefix that should be preserved when generating
59 ▶  * and recognizing URLs.
60 │  *
61 │  * @usageNotes
62 │  *
63 │  * The following example shows how to use this token to configure the root app injector
64 │  * with a base href value, so that the DI framework can supply the dependency anywhere in the app.
65 │  *
66 ▶  * ```ts
67 ▶  * import {NgModule} from '@angular/core';
68 ▶  * import {APP_BASE_HREF} from '@angular/common';
69 │  *
70 ▶  * @NgModule({
71 ▶  *   providers: [{provide: APP_BASE_HREF, useValue: '/my/app'}]
72 ▶  * })
73 ▶  * class AppModule {}
74 ▶  * ```
75 │  *
76 │  * @publicApi
77 │  */
78 │ export const APP_BASE_HREF = new InjectionToken<string>(
79 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'appBaseHref' : '',
80 │ );
````

66〜74 行目の例は strict の ngc に通りました。71 行目の値 `'/my/app'` は末尾にスラッシュがありませんが、すぐ下の 94〜95 行目は「`<base href>` と `APP_BASE_HREF` は `/` で終わるべき」と書きます。`Location` の側では、`joinWithSlash` がつなぎ目にスラッシュを足すので、`'/my/app'` でも `'/my/app/'` でも `go('/foo')` は `/my/app/foo` を書きました。94〜95 行目の理由「相対 URI を正しく解決するため」は、ブラウザーが `<base href>` で画像や script の相対 URL を解決する話です。

## 5. PathLocationStrategy

📄 `angular/packages/common/src/location/location_strategy.ts` L81–115 （▶ の行: 89–90, 92–94, 101–103, 105–106）

```ts
 81 │ 
 82 │ /**
 83 │  * @description
 84 │  * A {@link LocationStrategy} used to configure the {@link Location} service to
 85 │  * represent its state in the
 86 │  * [path](https://en.wikipedia.org/wiki/Uniform_Resource_Locator#Syntax) of the
 87 │  * browser's URL.
 88 │  *
 89 ▶  * If you're using `PathLocationStrategy`, you may provide a {@link APP_BASE_HREF}
 90 ▶  * or add a `<base href>` element to the document to override the default.
 91 │  *
 92 ▶  * For instance, if you provide an `APP_BASE_HREF` of `'/my/app/'` and call
 93 ▶  * `location.go('/foo')`, the browser's URL will become
 94 ▶  * `example.com/my/app/foo`. To ensure all relative URIs resolve correctly,
 95 │  * the `<base href>` and/or `APP_BASE_HREF` should end with a `/`.
 96 │  *
 97 │  * Similarly, if you add `<base href='/my/app/'/>` to the document and call
 98 │  * `location.go('/foo')`, the browser's URL will become
 99 │  * `example.com/my/app/foo`.
100 │  *
101 ▶  * Note that when using `PathLocationStrategy`, neither the query nor
102 ▶  * the fragment in the `<base href>` will be preserved, as outlined
103 ▶  * by the [RFC](https://tools.ietf.org/html/rfc3986#section-5.2.2).
104 │  *
105 ▶  * To ensure that trailing slashes are always present or never present in the URL, use
106 ▶  * {@link TrailingSlashPathLocationStrategy} or {@link NoTrailingSlashPathLocationStrategy}.
107 │  *
108 │  * @usageNotes
109 │  *
110 │  * ### Example
111 │  *
112 │  * {@example common/location/ts/path_location_component.ts region='LocationComponent'}
113 │  *
114 │  * @publicApi
115 │  */
```

92〜94 行目の `APP_BASE_HREF` が `'/my/app/'` で `go('/foo')` は、偽物の `PlatformLocation` に `push /my/app/foo` が届き、説明のとおりです。query を付けると `/my/app/foo?a=1` です。101〜103 行目「`<base href>` の query と fragment は残らない」は `<base href>`（DOM から読む方）の話で、`APP_BASE_HREF` に `'/my/app/?x=1#f'` を渡すと、そのまま前につないで `/my/app/?x=1#f/foo` を書きました。`APP_BASE_HREF` の値は確かめずに使われます。89〜90 行目の「既定を上書きする」の既定は、`APP_BASE_HREF` → DOM の `<base href>` → `document.location.origin` → `''` の順です（コンストラクター、L127〜131、Location の章）。

## 6. HashLocationStrategy

📄 `angular/packages/common/src/location/hash_location_strategy.ts` L92–108 （▶ の行: 93–94, 97–98, 101–102, 105–106）

```ts
 92 │ 
 93 ▶   override forward(): void {
 94 ▶     this._platformLocation.forward();
 95 │   }
 96 │ 
 97 ▶   override back(): void {
 98 ▶     this._platformLocation.back();
 99 │   }
100 │ 
101 ▶   override getState(): unknown {
102 ▶     return this._platformLocation.getState();
103 │   }
104 │ 
105 ▶   override historyGo(relativePosition: number = 0): void {
106 ▶     this._platformLocation.historyGo?.(relativePosition);
107 │   }
108 │ }
```

戻る・進む・state・`historyGo` は `PlatformLocation` にそのまま渡すだけです。クラスの説明（17〜23 行目、[ルーターの機能の章](../rmd/05-rmd-features.md)が引用）は「`location.go('/foo')` で `example.com#/foo` になる」と書き、`LocationStrategy` の 30〜31 行目は `http://example.com/#/foo` と書きます。どちらも、書く URL は `#/foo` という相対の URL で（DEMO で `push #/foo`）、ブラウザーが今のページの path に付けるので、ページの path によって変わります。説明文に無いことが 3 つあります。`APP_BASE_HREF` を渡すと hash の中に入り（`'/my/app'` で `#/my/app/foo`）、`go('')` は今の pathname を書き（`/index.html`）、`path(includeHash)` は引数を使わずに hash から `#` を外すだけです（`'#/foo#bar'` は `path(true)` でも `path(false)` でも `'/foo#bar'`。実装は L66〜72、[ルーターとブラウザーの URL の章](../router/16-router-browser-url.md)）。

## 7. 末尾のスラッシュをそろえる 2 つの戦略

📄 `angular/packages/common/src/location/location_strategy.ts` L188–196 （▶ の行: 191–193）

```ts
188 │ }
189 │ 
190 │ /**
191 ▶  * A `LocationStrategy` that ensures URLs never have a trailing slash.
192 ▶  * This strategy only affects the URL written to the browser.
193 ▶  * `Location.path()` and `Location.normalize()` will continue to strip trailing slashes when reading the URL.
194 │  *
195 │  * @publicApi
196 │  */
```

192〜193 行目「書く URL だけに効き、`path()` と `normalize()` は読むときに末尾を外し続ける」のとおり、`NoTrailingSlashPathLocationStrategy` は `go('/a/b/', 'x=1')` で `/my/app/a/b?x=1`、`TrailingSlashPathLocationStrategy` は `go('/a/b', 'x=1')` で `/my/app/a/b/?x=1` を書き、pathname が `/my/app/a/b/` のときの `path()` は `'/a/b'` でした。入った経緯（8bbe6dc46c9）は Location の章の 5 節、ルーターと組み合わせた spec は packages/router/test/trailing\_slash\_integration.spec.ts にあり、packages/common/test には無いです。

## 8. PlatformLocation：ブラウザー用の実装はどこにあるか

📄 `angular/packages/common/src/location/platform_location.ts` L13–34 （▶ の行: 14–15, 17–22, 24–25）

```ts
13 │ /**
14 ▶  * This class should not be used directly by an application developer. Instead, use
15 ▶  * {@link Location}.
16 │  *
17 ▶  * `PlatformLocation` encapsulates all calls to DOM APIs, which allows the Router to be
18 ▶  * platform-agnostic.
19 ▶  * This means that we can have different implementation of `PlatformLocation` for the different
20 ▶  * platforms that Angular supports. For example, `@angular/platform-browser` provides an
21 ▶  * implementation specific to the browser environment, while `@angular/platform-server` provides
22 ▶  * one suitable for use with server-side rendering.
23 │  *
24 ▶  * The `PlatformLocation` class is used directly by all implementations of {@link LocationStrategy}
25 ▶  * when they need to interact with the DOM APIs like pushState, popState, etc.
26 │  *
27 │  * {@link LocationStrategy} in turn is used by the {@link Location} service which is used directly
28 │  * by the {@link /api/router/Router Router} in order to navigate between routes. Since all interactions between
29 │  * {@link /api/router/Router Router} /
30 │  * {@link Location} / {@link LocationStrategy} and DOM APIs flow through the `PlatformLocation`
31 │  * class, they are all platform-agnostic.
32 │  *
33 │  * @publicApi
34 │  */
```

20〜22 行目は「`@angular/platform-browser` がブラウザー用の実装を、`@angular/platform-server` がサーバー用の実装を持つ」と書きます。サーバーの側は合っていますが（`ServerPlatformLocation`）、ブラウザー用の `BrowserPlatformLocation` は同じファイルの下（L106〜185）にあり、`@angular/common` から公開されています。DEMO で、このページの `inject(PlatformLocation)` は `@angular/common` の `BrowserPlatformLocation` の instance でした。platform-browser の src には `PlatformLocation` という語が 1 つもありません（grep）。`BrowserPlatformLocation` を common に移したのは 1537791f06d（2019-08-22、``perf(core): Make `PlatformLocation` tree-shakable (#32154)``）で、20〜21 行目はそれより前の文のままです。

📄 `angular/packages/common/src/location/platform_location.ts` L35–67 （▶ の行: 35, 52, 64–65）

```ts
35 ▶ @Injectable({providedIn: 'platform', useFactory: () => inject(BrowserPlatformLocation)})
36 │ export abstract class PlatformLocation {
37 │   abstract getBaseHrefFromDOM(): string;
38 │   abstract getState(): unknown;
39 │   /**
40 │    * Returns a function that, when executed, removes the `popstate` event handler.
41 │    */
42 │   abstract onPopState(fn: LocationChangeListener): VoidFunction;
43 │   /**
44 │    * Returns a function that, when executed, removes the `hashchange` event handler.
45 │    */
46 │   abstract onHashChange(fn: LocationChangeListener): VoidFunction;
47 │ 
48 │   abstract get href(): string;
49 │   abstract get protocol(): string;
50 │   abstract get hostname(): string;
51 │   abstract get port(): string;
52 ▶   abstract get pathname(): string;
53 │   abstract get search(): string;
54 │   abstract get hash(): string;
55 │ 
56 │   abstract replaceState(state: any, title: string, url: string): void;
57 │ 
58 │   abstract pushState(state: any, title: string, url: string): void;
59 │ 
60 │   abstract forward(): void;
61 │ 
62 │   abstract back(): void;
63 │ 
64 ▶   historyGo?(relativePosition: number): void {
65 ▶     throw new Error(ngDevMode ? 'Not implemented' : '');
66 │   }
67 │ }
```

35 行目の `providedIn: 'platform'` と `useFactory: () => inject(BrowserPlatformLocation)` が、何も provide しないときの実装を決めます。`historyGo` は抽象ではなく、既定の本体が `Not implemented`（本番は空の文）を投げます（64〜65 行目）。`LocationStrategy` の `historyGo`（L48〜50）も同じ形です。

📄 `angular/packages/common/src/location/platform_location.ts` L68–90 （▶ の行: 71, 75–77, 81, 85–87, 89）

```ts
68 │ 
69 │ /**
70 │  * @description
71 ▶  * Indicates when a location is initialized.
72 │  *
73 │  * @publicApi
74 │  */
75 ▶ export const LOCATION_INITIALIZED = new InjectionToken<Promise<any>>(
76 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'Location Initialized' : '',
77 ▶ );
78 │ 
79 │ /**
80 │  * @description
81 ▶  * A serializable version of the event from `onPopState` or `onHashChange`
82 │  *
83 │  * @publicApi
84 │  */
85 ▶ export interface LocationChangeEvent {
86 ▶   type: string;
87 ▶   state: any;
88 │   /** Whether the user agent performed a visual transition for this navigation. */
89 ▶   hasUAVisualTransition?: boolean;
90 │ }
```

71 行目「location が初期化されたことを示す」の `LOCATION_INITIALIZED` は、framework の中では誰も provide しません。読むのはルーターだけで、`injector.get(LOCATION_INITIALIZED, Promise.resolve())` と既定の値つきで読み、それを待ってから最初の navigation を始めます（packages/router/src/provide\_router.ts L401〜406）。framework の外（アプリ）が「URL の準備ができるまで待って」と伝えるための口です。

📄 `angular/packages/common/src/location/platform_location.ts` L91–105 （▶ の行: 100–102）

```ts
 91 │ 
 92 │ /**
 93 │  * @publicApi
 94 │  */
 95 │ export interface LocationChangeListener {
 96 │   (event: LocationChangeEvent): any;
 97 │ }
 98 │ 
 99 │ /**
100 ▶  * `PlatformLocation` encapsulates all of the direct calls to platform APIs.
101 ▶  * This class should not be used directly by an application developer. Instead, use
102 ▶  * {@link Location}.
103 │  *
104 │  * @publicApi
105 │  */
```

📄 `angular/packages/common/src/location/platform_location.ts` L130–161 （▶ の行: 131–133, 158–160）

```ts
130 │ 
131 ▶   override onHashChange(fn: LocationChangeListener): VoidFunction {
132 ▶     const window = getDOM().getGlobalEventTarget(this._doc, 'window');
133 ▶     window.addEventListener('hashchange', fn, false);
134 │     return () => window.removeEventListener('hashchange', fn);
135 │   }
136 │ 
137 │   override get href(): string {
138 │     return this._location.href;
139 │   }
140 │   override get protocol(): string {
141 │     return this._location.protocol;
142 │   }
143 │   override get hostname(): string {
144 │     return this._location.hostname;
145 │   }
146 │   override get port(): string {
147 │     return this._location.port;
148 │   }
149 │   override get pathname(): string {
150 │     return this._location.pathname;
151 │   }
152 │   override get search(): string {
153 │     return this._location.search;
154 │   }
155 │   override get hash(): string {
156 │     return this._location.hash;
157 │   }
158 ▶   override set pathname(newPath: string) {
159 ▶     this._location.pathname = newPath;
160 ▶   }
161 │ 
```

158〜160 行目の `set pathname` は `BrowserPlatformLocation` にだけあり、抽象の `PlatformLocation`（52 行目は getter だけ）にはありません。`window.location.pathname` に書くので、ページの読み込みし直しになります。

## 9. ViewportScroller：余白は x も、anchor は name も

📄 `angular/packages/common/src/viewport_scroller.ts` L9–21 （▶ の行: 18）

```ts
 9 │ import {
10 │   inject,
11 │   ɵɵdefineInjectable,
12 │   DOCUMENT,
13 │   ɵformatRuntimeError as formatRuntimeError,
14 │ } from '@angular/core';
15 │ import {RuntimeErrorCode} from './errors';
16 │ 
17 │ /**
18 ▶  * Defines a scroll position manager. Implemented by `BrowserViewportScroller`.
19 │  *
20 │  * @publicApi
21 │  */
```

📄 `angular/packages/common/src/viewport_scroller.ts` L42–72 （▶ の行: 43–45, 55–58, 62–63, 67, 71）

```ts
42 │ 
43 ▶   /**
44 ▶    * Retrieves the current scroll position.
45 ▶    * @returns A position in screen coordinates (a tuple with x and y values).
46 │    */
47 │   abstract getScrollPosition(): [number, number];
48 │ 
49 │   /**
50 │    * Scrolls to a specified position.
51 │    * @param position A position in screen coordinates (a tuple with x and y values).
52 │    */
53 │   abstract scrollToPosition(position: [number, number], options?: ScrollOptions): void;
54 │ 
55 ▶   /**
56 ▶    * Scrolls to an anchor element.
57 ▶    * @param anchor The ID of the anchor element.
58 ▶    * @param options Scroll options
59 │    */
60 │   abstract scrollToAnchor(anchor: string, options?: ScrollOptions): void;
61 │ 
62 ▶   /**
63 ▶    * Disables automatic scroll restoration provided by the browser.
64 │    * See also [window.history.scrollRestoration
65 │    * info](https://developers.google.com/web/updates/2015/09/history-api-scroll-restoration).
66 │    */
67 ▶   abstract setHistoryScrollRestoration(scrollRestoration: 'auto' | 'manual'): void;
68 │ }
69 │ 
70 │ /**
71 ▶  * Manages the scroll position for a browser window.
72 │  */
```

`BrowserViewportScroller` は公開されていないので、DEMO はこのページの `ViewportScroller` の instance の `constructor` を借り、偽物の `document` と `window` を渡して作りました（ページはスクロールしません）。`setOffset([10, 50])` のあと、window のスクロールが `(100, 200)`、要素の `getBoundingClientRect` が `left 30, top 400` のときの `scrollToAnchor('target')` は `scrollTo({left: 120, top: 550})` でした。

- 抽象の側の `setOffset` の説明（L35〜38、ViewportScroller の章が引用）は「anchor へのスクロールに使う**上の**余白」ですが、x も引かれます（30 + 100 − 10 = 120）。tuple の 1 つ目が x であることは同じ文の「(a tuple with x and y values)」が書いています。
- 56〜57 行目「`anchor` は anchor の要素の ID」は、ID が無ければ `name` でも探します（`getElementsByName`、shadow root の中も）。DEMO の `'named'` も見つかり、`{behavior: 'smooth'}` も `scrollTo` に渡りました。実装の側の説明（L117、ViewportScroller の章）は「要素の ID か anchor の name」と正しく書いています。どちらでも見つかった要素に `focus({preventScroll: true})` を呼びます。
- 62〜63 行目「ブラウザーの自動のスクロールの復元を止める」は、`'manual'` だけでなく `'auto'` も受けて、そのまま `history.scrollRestoration` に書きます（DEMO で `manual → auto`）。止めるだけではなく、戻すこともできます。
- 18 行目「`BrowserViewportScroller` が実装する」のほかに、サーバーでは次の `NullViewportScroller` が使われます（factory の分かれは ViewportScroller の章の 1 節）。

📄 `angular/packages/common/src/viewport_scroller.ts` L237–247 （▶ の行: 239, 241, 244, 246）

```ts
237 │ 
238 │   /**
239 ▶    * Empty implementation
240 │    */
241 ▶   scrollToAnchor(anchor: string, options?: ScrollOptions): void {}
242 │ 
243 │   /**
244 ▶    * Empty implementation
245 │    */
246 ▶   setHistoryScrollRestoration(scrollRestoration: 'auto' | 'manual'): void {}
247 │ }
```

## 10. 小さなファイル：version.ts と dom\_adapter.ts

📄 `angular/packages/common/src/version.ts` L9–20 （▶ の行: 10, 12, 20）

```ts
 9 │ /**
10 ▶  * @module
11 │  * @description
12 ▶  * Entry point for all public APIs of the common package.
13 │  */
14 │ 
15 │ import {Version} from '@angular/core';
16 │ 
17 │ /**
18 │  * @publicApi
19 │  */
20 ▶ export const VERSION = /* @__PURE__ */ new Version('0.0.0-PLACEHOLDER');
```

10〜12 行目の `@module` の説明「common パッケージのすべての公開 API の入口」は、`VERSION` 1 つだけのこのファイルには合いません。同じ形の文は common を含めて 10 個のパッケージ（forms・router・platform-browser など）の version.ts にあり、ひな形をそのまま写したものです（公開の入口は common.ts の `export` の並び）。20 行目の `'0.0.0-PLACEHOLDER'` は配る前の build で置き換わり、このページの `VERSION.full` は `'22.2.6'` でした（DEMO）。

📄 `angular/packages/common/src/dom_adapter.ts` L18–25 （▶ の行: 19–20, 22–23）

```ts
18 │ 
19 ▶ /**
20 ▶  * Provides DOM operations in an environment-agnostic way.
21 │  *
22 ▶  * @security Tread carefully! Interacting with the DOM directly is dangerous and
23 ▶  * can introduce XSS risks.
24 │  */
25 │ export abstract class DomAdapter {
```

`DomAdapter` は `@angular/common` の中では `getDOM()` の型で、中身はブラウザーなら platform-browser の `BrowserDomAdapter` が `setRootDomAdapter` で入れます。`BrowserPlatformLocation` が window を取るのもこれを通ります（8 節の 132 行目の `getDOM().getGlobalEventTarget`）。抽象のメソッドの一覧は[Title と Meta の章](../domr/19-domr-title-meta.md)が読んでいます。

> **🧪 DEMO — 説明文の例の入力を本物の Location に通す**
>
> 押すと、偽物の `PlatformLocation`（受け取った URL を覚えるだけ）を差した injector を行ごとに作り、本物の `Location`・戦略に渡して結果を書きます。押す前と後で、このページの `location.href` と `history.length` を比べて下に書きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-location)

## ここまでの呼び出し

- 👤 `location.normalize('/my/app/user/123/')`（`APP_BASE_HREF` は `'/my/app/'`）
  - `constructor: _basePath = _stripOrigin(stripTrailingSlash(_stripIndexHtml('/my/app/')))` — location.ts L78 — *'/my/app'*
  - `normalize → _stripIndexHtml → _stripBasePath('/my/app', …)` — L140〜142・L316〜325 — *'/user/123/'*
    - `Location.stripTrailingSlash('/user/123/')` — util.ts L40〜47 — *'/user/123'。base href は残らない*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `packages/common/test/location/location_spec.ts` | `Location Class`（22）› `stripTrailingSlash`（23）の 5 本、`location.normalize(url) should return only route`（252）の 5 本 | 3 節と 1 節。252 は「base href を外す」の向きで、クラスの説明の 40 行目と逆 |
| `packages/common/test/viewport_scroller_spec.ts` | `scrollToAnchor`（52）› `should scroll when anchor with matching name is found`（76）・`should honor the scroll offset when smooth scrolling`（131） | 9 節。Node では `isNode` で飛ばし、web の suite だけで走る |
| `packages/router/test/trailing_slash_integration.spec.ts` | `Trailing Slash Integration`（32） | 7 節。common には無い |
| （無い） | `HashLocationStrategy` の単体の spec | 6 節。router/test の integration の中で使われるだけ |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
--filter=^Location Class            Ran 22 of 667 specs、0 failures
--filter=^BrowserViewportScroller   Ran 4 of 667 specs、0 failures
--filter=provideLocationMocks       Ran 1 of 667 specs、0 failures

# 説明文の例（location_strategy.ts L66〜74）と packages/examples/common/location/ts の 2 つの例を strictTemplates の ngc に
$ ngc -p tsconfig.json
（doc/location.ts・ex/path_location_component.ts・ex/hash_location_component.ts のエラーは 0）
```

web の suite（`//packages/common/test:test_web`）では `scrollToAnchor` の it も走りますが、このマシン（JST）では日付の 2 本が落ちました（第 9 回）。直すとしたら説明文です。location.ts の 39〜44 行目は「`path()` と `normalize()` は base href と末尾のスラッシュを外した形を返し、`prepareExternalUrl()` は base href を付けた形を返す」と、読む側と書く側を分けて書くと実装と spec に合います。163 行目の「正規化した URL」は「`prepareExternalUrl` を通した URL」に。path\_location\_component.ts と hash\_location\_component.ts の見出しは `foo/bar` に。platform\_location.ts の 20〜21 行目は「`@angular/common` の `BrowserPlatformLocation`」に。viewport\_scroller.ts の 57 行目は「ID か name」、63 行目は「`'auto'` か `'manual'` を設定する」にすると、実装の側の説明と同じになります。

## 聞かれそうな質問

**Q. `Location.path()` は base href を含みますか？**

含みません。`normalize` を通すので base href と末尾のスラッシュが外れます。クラスの説明の 40 行目は「含む」と書きますが、spec（252）も実物も外します。base href を付けたいときは `prepareExternalUrl` です。

**Q. `APP_BASE_HREF` は `/` で終わらせないといけませんか？**

`Location` の読み書きは、どちらでも同じ URL になりました（`joinWithSlash` がつなぎ目をそろえる）。94〜95 行目が言うのはブラウザーの相対 URL の解決のことです。説明文の例（71 行目）自身は `'/my/app'` です。

**Q. HashLocationStrategy で `path(true)` と `path(false)` は違いますか？**

違いません。hash から `#` を 1 つ外すだけで、引数は使いません。hash の中にさらに `#` があれば、どちらでも残ります。

**Q. ブラウザー用の `PlatformLocation` はどのパッケージにありますか？**

`@angular/common` の `BrowserPlatformLocation` です（2019 年の 1537791f06d から）。説明文の 20〜21 行目の「platform-browser が持つ」は古い文です。

**Q. `ViewportScroller.setOffset` の x は使われますか？**

使われます。`scrollToAnchor` は要素の位置から x も y も引いて `scrollTo` します。説明の「上の余白」は y のことだけを言っています。

## 読み終えて

- `normalize`・`path` は base href を外し、`prepareExternalUrl` は付ける。クラスの説明の「正規化された URL は base href を含む」は、読む側の関数と合わない。
- `go` は「正規化」せず、末尾のスラッシュも残す。そろえるのは末尾のスラッシュの 2 つの戦略。
- `APP_BASE_HREF` は確かめずに前につながれ、Hash の戦略では hash の中に入る。
- ブラウザー用の `PlatformLocation` は common にある。`LOCATION_INITIALIZED` は誰も provide せず、ルーターが既定の値つきで読むだけ。
- `ViewportScroller` の余白は x と y、anchor は ID と name、scroll restoration は止めるだけでなく戻せる。

---

← 前: [AsyncPipe と小さな pipe の説明文](07-cmd-pipes.md)  
次: [spec と issue を読む：common の説明文を固めているもの](09-cmd-tests-issues.md) →
