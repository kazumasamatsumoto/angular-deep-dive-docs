[目次](../README.md) › [Navigation API と FakeNavigation](README.md) › 第 6 回 / 全 7 回

# テストの土台：FakeNavigationPlatformLocation と provideFakePlatformNavigation

> TestBed の既定の PlatformLocation が FakeNavigation の上に立つ FakeNavigationPlatformLocation になっている行、provideFakePlatformNavigation、Location と Navigation をつなぐ NavigationAdapterForLocation の残り。router の with\_platform\_navigation.spec.ts と common の navigation\_spec.ts が、FakeNavigation をどう使って振る舞いを試しているか。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/navx-testing)

---

TestBed で `Location` や Router を使うテストは、何も足さなければ、本物のブラウザの履歴ではなく `FakeNavigation` の上で動いています。この章では、その組み合わせ（`FakeNavigation` と `FakeNavigationPlatformLocation`）が、どの行で TestBed の既定になり、`Location` の呼び出しがどの行を通って `FakeNavigation` に届くのかを読みます。あわせて、`withExperimentalPlatformNavigation()` が `Location` に差し込む `NavigationAdapterForLocation` の残りの行と、本家の spec がこの土台をどう使って書かれているかを見ます。

読む対象は `packages/platform-browser/testing/src/browser.ts`、`packages/common/testing/src/navigation/provide_fake_platform_navigation.ts`、`packages/common/testing/src/mock_platform_location.ts` の `FakeNavigationPlatformLocation`、`packages/common/src/location/navigation_adapter_for_location.ts`、spec は `packages/router/test/with_platform_navigation.spec.ts` と `packages/common/test/navigation/navigation_spec.ts` です。テスト用の `Location` の 3 つの偽物（`SpyLocation`・`MockLocationStrategy`・`MockPlatformLocation`）は[テスト用の Location の章](../cmn/18-cmn-location-testing.md)に、`BrowserTestingModule` が TestBed に入るまでは[initTestEnvironment の章](../testing/02-testing-init-environment.md)にあります。

1. [1. 型と PlatformNavigation](01-navx-api-types.md)
2. [2. FakeNavigation の navigate](02-navx-fake-navigate.md)
3. [3. 戻る・進む](03-navx-fake-traverse.md)
4. [4. precommitHandler](04-navx-precommit.md)
5. [5. Router の連携の残り](05-navx-router-integration.md)
6. **6. テストの土台**（この章）
7. [7. spec と issue](07-navx-tests-issues.md)

## 1. TestBed の既定は 1 行：ɵprovideFakePlatformNavigation()

📄 `angular/packages/platform-browser/testing/src/browser.ts` L28–34 （▶ の行: 30, 32）

```ts
28 │ @NgModule({
29 │   exports: [BrowserModule],
30 ▶   providers: [
31 │     {provide: APP_ID, useValue: 'a'},
32 ▶     ɵprovideFakePlatformNavigation(),
33 │     {provide: TestComponentRenderer, useClass: DOMTestComponentRenderer},
34 │   ],
```

`BrowserTestingModule` の providers の 32 行目です。この関数が返す 3 つのプロバイダ（`PlatformNavigation`・`PlatformLocation`・`PRECOMMIT_HANDLER_SUPPORTED`）の中身は [テスト用の Location の章](../cmn/18-cmn-location-testing.md)の 1 節で読めるので、ここでは 1 つ目の `PlatformNavigation` が使う `FAKE_NAVIGATION` と、2 つ目の `FakeNavigationPlatformLocation` を読みます。

> [!NOTE]
> **ポイント**
>
> 本家の Node の spec の初期化（`tools/testing/node_zoneless_tests.init.mts`）は `BrowserTestingModule` ではなく `ServerTestingModule` で TestBed を初期化します。`ServerTestingModule` は `BrowserDynamicTestingModule` を、それが `BrowserTestingModule` を exports しているので、Node の spec でも 32 行目の既定が入ります（テスト環境の初期化の一般論は[initTestEnvironment の章](../testing/02-testing-init-environment.md)）。プラットフォームの側の `ServerPlatformLocation` より、TestBed のモジュールの providers のほうが優先されます。

📄 `git show c795960ada1（2025-08-26、#63406、抜粋）`

```
--- a/packages/platform-browser/testing/src/browser.ts
-import {PlatformLocation} from '@angular/common';
-import {MockPlatformLocation} from '@angular/common/testing';
+import {ɵprovideFakePlatformNavigation} from '@angular/common/testing';
 ...
-    {provide: PlatformLocation, useClass: MockPlatformLocation},
+    ɵprovideFakePlatformNavigation(),
```

これを入れたのが c795960ada1（「Navigation API の実験的な対応」）で、それまでの既定は `MockPlatformLocation` でした。コミットの本文には「BREAKING CHANGE: (test only)」として「前の既定に戻すには `{provide: PlatformLocation, useClass: MockPlatformLocation}` を providers に足す」とあります。

## 2. FAKE\_NAVIGATION：テストのたびに 1 つ作られる FakeNavigation

📄 `angular/packages/common/testing/src/navigation/provide_fake_platform_navigation.ts` L20–30 （▶ の行: 20, 22–27）

```ts
20 ▶ const FAKE_NAVIGATION = new InjectionToken<FakeNavigation>('fakeNavigation', {
21 │   // Providing a factory implies that the token is provided in root by default
22 ▶   factory: () => {
23 ▶     const config = inject(MOCK_PLATFORM_LOCATION_CONFIG, {optional: true});
24 ▶     const baseFallback = 'http://_empty_/';
25 ▶     const startUrl = new URL(config?.startUrl || baseFallback, baseFallback);
26 ▶     const fakeNavigation = new FakeNavigation(inject(DOCUMENT), startUrl.href as `http${string}`);
27 ▶     fakeNavigation.setSynchronousTraversalsForTesting(true);
28 │     return fakeNavigation;
29 │   },
30 │ });
```

1. **20〜22 行目：`factory` つきの `InjectionToken`**

   21 行目のコメントのとおり、`factory` があるトークンはルートの注入器で作られます。TestBed は it のたびに注入器を作り直すので、`FakeNavigation` も it ごとに新しくなります。
2. **23〜25 行目：始まりの URL は `MOCK_PLATFORM_LOCATION_CONFIG` の `startUrl`、無ければ `http://_empty_/`**

   テストで `navigation.currentEntry.url` を見ると `http://_empty_/first` のような値になるのは、24 行目のこの既定のせいです。`MOCK_PLATFORM_LOCATION_CONFIG` は `MockPlatformLocation` と共用の設定のトークンです。
3. **26 行目：`inject(DOCUMENT)` を渡して `new FakeNavigation`**

   ブラウザで走る spec では本物の `document` です。`FakeNavigation` はその `defaultView` を window として使うので（下の 132 行目）、traverse のときの popstate は**テストのページの本物の window に配られます**。Node の spec では `document` は domino の文書です。
4. **27 行目：traverse を同期にする**

   `FakeNavigation` の既定は、traverse を `setTimeout` 1 回分遅らせます（本物のブラウザで、戻る・進むが別のプロセスとのやり取りで遅れるのを真似ている。[第 3 回](03-navx-fake-traverse.md)）。TestBed の中ではそれを切り、`location.back()` から戻ったときには URL がもう変わっています。下のデモで切り替えられます。

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L132–133 （▶ の行: 132）

```ts
132 ▶     this._window = doc.defaultView ?? this.createEventTarget();
133 │     this.eventTarget = this.createEventTarget();
```

📄 `angular/packages/common/testing/src/navigation/fake_navigation.ts` L9–9 （▶ の行: 9）

```ts
9 ▶ export {ɵFakeNavigation as FakeNavigation} from '@angular/core/testing';
```

132 行目、`defaultView` が無ければ、その文書で作った `div`（作れなければ `EventTarget`）を window の代わりにします。[第 4 回](04-navx-precommit.md)のページの上のデモが `createHTMLDocument('')` の文書を渡すのは、この行で popstate を本物の window から外すためです。この章の記録のスクリプトは、`createElement` が投げる小さな代わりを渡すので、括弧の中の `EventTarget` になります。`@angular/common/testing` の `FakeNavigation` は、9 行目のとおり `@angular/core/testing` の `ɵFakeNavigation` をそのまま出し直したもので、クラスは 1 つです。

## 3. FakeNavigationPlatformLocation：PlatformLocation の口を FakeNavigation につなぐ

📄 `angular/packages/common/testing/src/mock_platform_location.ts` L285–318 （▶ の行: 290–294, 300, 302, 306–307, 311–312, 316–317）

```ts
285 │ @Injectable()
286 │ export class FakeNavigationPlatformLocation implements PlatformLocation {
287 │   private readonly _platformNavigation: FakeNavigation;
288 │ 
289 │   constructor() {
290 ▶     const platformNavigation = inject(PlatformNavigation);
291 ▶     if (!(platformNavigation instanceof FakeNavigation)) {
292 ▶       throw new Error(
293 ▶         'FakePlatformNavigation cannot be used without FakeNavigation. Use ' +
294 ▶           '`provideFakeNavigation` to have all these services provided together.',
295 │       );
296 │     }
297 │     this._platformNavigation = platformNavigation;
298 │   }
299 │ 
300 ▶   private config = inject(MOCK_PLATFORM_LOCATION_CONFIG, {optional: true});
301 │   getBaseHrefFromDOM(): string {
302 ▶     return this.config?.appBaseHref ?? '';
303 │   }
304 │ 
305 │   // window, addEventListener, removeEventListener might be undefined due to test mocks
306 ▶   onPopState(fn: LocationChangeListener): VoidFunction {
307 ▶     this._platformNavigation.window?.addEventListener?.('popstate', fn);
308 │     return () => this._platformNavigation.window?.removeEventListener?.('popstate', fn);
309 │   }
310 │ 
311 ▶   onHashChange(fn: LocationChangeListener): VoidFunction {
312 ▶     this._platformNavigation.window?.addEventListener?.('hashchange', fn as any);
313 │     return () => this._platformNavigation.window?.removeEventListener?.('hashchange', fn as any);
314 │   }
315 │ 
316 ▶   get href(): string {
317 ▶     return this._platformNavigation.currentEntry.url!;
318 │   }
```

1. **290〜297 行目：`PlatformNavigation` が `FakeNavigation` でなければ例外**

   本物の `window.navigation` と組み合わせることはできません。292〜295 行目の文は「`provideFakeNavigation` を使えば全部まとめて provide できる」と言いますが、**その名前の関数はありません**。実際の関数は `provideFakePlatformNavigation`（公開名は `ɵprovideFakePlatformNavigation`）で、293 行目の `FakePlatformNavigation` もこのクラスの名前（`FakeNavigationPlatformLocation`）と違います。新しい本家でも同じ文のままです。
2. **300〜303 行目：`<base href>` は文書を読まず、設定の `appBaseHref`**

   無ければ空文字です。`PathLocationStrategy` はこの値を `APP_BASE_HREF` の次に使うので、TestBed の既定では base は空文字で、パスはオリジンの直下から数えます。
3. **306〜314 行目：popstate と hashchange のリスナーは `FakeNavigation.window` に付ける**

   2 節の 132 行目の window です。305 行目のコメントと `?.` は 49295778bc1（下の差分）で足されたもので、テストが window を何かで差し替えたときに落ちないようにしています。
4. **316〜318 行目：`href` は `currentEntry.url`**

   このあとに並ぶ `protocol`・`hostname`・`pathname`・`search`・`hash` の getter も、毎回 `new URL(currentEntry.url)` で取り出します。URL を自分で分解して持っていた `MockPlatformLocation` との違いです。

📄 `git show 49295778bc1（2025-12-17、抜粋）`

```
--- a/packages/common/testing/src/mock_platform_location.ts
+  // window, addEventListener, removeEventListener might be undefined due to test mocks
   onPopState(fn: LocationChangeListener): VoidFunction {
-    this._platformNavigation.window.addEventListener('popstate', fn);
-    return () => this._platformNavigation.window.removeEventListener('popstate', fn);
+    this._platformNavigation.window?.addEventListener?.('popstate', fn);
+    return () => this._platformNavigation.window?.removeEventListener?.('popstate', fn);
   }
--- a/packages/core/primitives/dom-navigation/testing/fake_navigation.ts
-    this._window = document.defaultView ?? this.createEventTarget();
+    this._window = doc.defaultView ?? this.createEventTarget();
```

📄 `angular/packages/common/testing/src/mock_platform_location.ts` L338–360 （▶ の行: 338–339, 342–343, 346, 350, 354–355, 358–359）

```ts
338 ▶   pushState(state: any, title: string, url: string): void {
339 ▶     this._platformNavigation.pushState(state, title, url);
340 │   }
341 │ 
342 ▶   replaceState(state: any, title: string, url: string): void {
343 ▶     this._platformNavigation.replaceState(state, title, url);
344 │   }
345 │ 
346 ▶   forward(): void {
347 │     this._platformNavigation.forward();
348 │   }
349 │ 
350 ▶   back(): void {
351 │     this._platformNavigation.back();
352 │   }
353 │ 
354 ▶   historyGo(relativePosition: number = 0): void {
355 ▶     this._platformNavigation.go(relativePosition);
356 │   }
357 │ 
358 ▶   getState(): unknown {
359 ▶     return this._platformNavigation.currentEntry.getHistoryState();
360 │   }
```

書く側の 5 つは、`FakeNavigation` の同じ名前のメソッドへの受け渡しだけです。339 行目の `pushState` と 343 行目の `replaceState` は、`FakeNavigation` の中で navigate イベントを配り、intercept されなければ同じ文書の中でエントリを足すか置き換えます（[第 2 回](02-navx-fake-navigate.md)）。354〜355 行目の `historyGo` は `go` です。358〜359 行目の `getState()` は `getHistoryState()`、つまり `history.state` の側を返します。Navigation API の `state`（`getState()`）ではありません。4 節の `NavigationAdapterForLocation` はここが逆です。

## 4. NavigationAdapterForLocation の残り

📄 `angular/packages/common/src/location/navigation_adapter_for_location.ts` L15–29 （▶ の行: 16, 21–22, 24–25）

```ts
15 │ /**
16 ▶  * A `Location` implementation that uses the browser's `Navigation` API.
17 │  *
18 │  * This class is an adapter that maps the methods of the `Location` service to the newer
19 │  * browser `Navigation` API. It is used when the `Navigation` API is available.
20 │  *
21 ▶  * This adapter uses `navigation.navigate()` for `go` and `replaceState` to ensure a single source
22 ▶  * of truth for the navigation state. The Navigation API's state and `history.state` are separate.
23 │  *
24 ▶  * Note that `navigation.back()` and `navigation.forward()` can differ from the traditional
25 ▶  * `history` API in how they traverse the joint session history.
26 │  *
27 │  * @see {@link Location}
28 │  * @see https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API
29 │  */
```

`withExperimentalPlatformNavigation()` が `Location` をこのクラスに差し替えます（[Router の Navigation API の章](../router/21-router-platform-navigation.md)の 1 節が、コンストラクタ・`getState`・`replaceState`・`go` を読んでいます）。21〜22 行目、`go` と `replaceState` を `navigation.navigate()` にするのは「状態の出どころを 1 つにするため」で、Navigation API の state と `history.state` は別物だからです。24〜25 行目は、`back()` と `forward()` が history の `back()` と違う動きをすることがある、という注意です。

📄 `angular/packages/common/src/location/navigation_adapter_for_location.ts` L69–86 （▶ の行: 70, 72, 76, 79–80, 82–84）

```ts
69 │   // Navigation.back/forward differs from history in how it traverses the joint session history
70 ▶   // https://github.com/WICG/navigation-api?tab=readme-ov-file#correspondence-with-the-joint-session-history
71 │   override back() {
72 ▶     this.navigation.back();
73 │   }
74 │ 
75 │   override forward() {
76 ▶     this.navigation.forward();
77 │   }
78 │ 
79 ▶   override onUrlChange(fn: (url: string, state: unknown) => void): VoidFunction {
80 ▶     this._urlChangeListeners.push(fn);
81 │ 
82 ▶     return () => {
83 ▶       const fnIndex = this._urlChangeListeners.indexOf(fn);
84 ▶       this._urlChangeListeners.splice(fnIndex, 1);
85 │     };
86 │   }
```

1. **71〜77 行目：`back` と `forward` は `navigation.back()` と `navigation.forward()`**

   70 行目のリンク先（WICG の説明）によると、Navigation API の back は「この文書の中のエントリ」だけをたどり、iframe などを含む「全体の履歴」の 1 つ前とは限りません。`historyGo` は上書きしていないので、もとの `Location` の実装（`LocationStrategy` → `PlatformLocation.historyGo`）を通ります。テストでは 3 節の 354〜355 行目、ブラウザでは `history.go` です。
2. **79〜86 行目：`onUrlChange` は、関数を配列に足すだけ**

   もとの `Location.onUrlChange` は、最初の 1 つで popstate の購読を始め、最後の 1 つが外れたら購読をやめます（[Location の章](../cmn/17-cmn-location.md)）。このクラスは popstate を使わず、コンストラクタで付けた `currententrychange` のリスナーから知らせるので（Router の章の 1 節）、80 行目で足し、82〜85 行目で外すだけです。その結果、`go` を呼んだときの通知は「`navigate()` の中で `currententrychange` が出たとき」になり、commit が遅れればそれだけ遅れます（[第 4 回](04-navx-precommit.md)の spec）。

📄 `angular/packages/router/src/provide_router.ts` L253–259 （▶ の行: 253, 258–259）

```ts
253 ▶             if (!(locationInstance instanceof ɵNavigationAdapterForLocation)) {
254 │               const locationConstructorName = (locationInstance as any).constructor.name;
255 │               let message =
256 │                 `'withExperimentalPlatformNavigation' provides a 'Location' implementation that ensures navigation APIs are consistently used.` +
257 │                 ` An instance of ${locationConstructorName} was found instead.`;
258 ▶               if (locationConstructorName === 'SpyLocation') {
259 ▶                 message += ` One of 'RouterTestingModule' or 'provideLocationMocks' was likely used. 'withExperimentalPlatformNavigation' does not work with these because they override the Location implementation.`;
```

開発モードでは、`withExperimentalPlatformNavigation()` が「`Location` がこのクラスか」を確かめます。258〜259 行目、`SpyLocation` だったら 「`RouterTestingModule` か `provideLocationMocks` を使っていませんか。それは `Location` を置き換えるので一緒に使えません」と足します。テストで最初にぶつかる壁がこれです（5 節の spec）。

## 5. spec はこの土台をどう使っているか

📄 `angular/packages/common/test/navigation/navigation_spec.ts` L13–25 （▶ の行: 15–16, 21–23）

```ts
13 │ describe('Navigation', () => {
14 │   it('provides fake navigation by default', () => {
15 ▶     const nav = TestBed.inject(PlatformNavigation);
16 ▶     expect(nav).toBeInstanceOf(FakeNavigation);
17 │   });
18 │ 
19 │   it('can inject and use the navigation API by default', async () => {
20 │     const nav = TestBed.inject(PlatformNavigation);
21 ▶     expect(nav.entries().length).toBe(1);
22 ▶     await nav.navigate('/someUrl').finished;
23 ▶     expect(nav.entries().length).toBe(2);
24 │   });
25 │ });
```

common の spec は 2 つだけで、c795960ada1 が 1 節の既定と一緒に足しました。15〜16 行目、何も provide しない TestBed で `PlatformNavigation` が `FakeNavigation` であること。21〜23 行目、最初のエントリが 1 つあり、`navigate().finished` を待つと 2 つになること（2 節の 23〜26 行目で作られた 1 つ目です）。

📄 `angular/packages/router/test/with_platform_navigation.spec.ts` L47–60 （▶ の行: 50, 55, 59）

```ts
47 │ describe('withPlatformNavigation feature', () => {
48 │   beforeEach(() => {
49 │     TestBed.configureTestingModule({
50 ▶       providers: [provideRouter([], withExperimentalPlatformNavigation())],
51 │     });
52 │   });
53 │ 
54 │   it('provides FakeNavigation by default', () => {
55 ▶     expect(TestBed.inject(PlatformNavigation)).toBeInstanceOf(FakeNavigation);
56 │   });
57 │ 
58 │   it('provides FakeNavigationPlatformLocation by default', () => {
59 ▶     expect(TestBed.inject(PlatformLocation)).toBeInstanceOf(FakeNavigationPlatformLocation);
60 │   });
```

📄 `angular/packages/router/test/with_platform_navigation.spec.ts` L62–90 （▶ の行: 71–72, 78–79, 84, 88–89）

```ts
62 │   describe('ensures location information is synced with navigation', () => {
63 │     let location: Location;
64 │     let navigation: PlatformNavigation;
65 │     beforeEach(() => {
66 │       location = TestBed.inject(Location);
67 │       navigation = TestBed.inject(PlatformNavigation);
68 │     });
69 │ 
70 │     it('state changes via location are reflected in navigation', () => {
71 ▶       location.go('/a', undefined, {someState: 'someValue'});
72 ▶       expect(navigation.currentEntry!.getState()).toEqual(
73 │         jasmine.objectContaining({someState: 'someValue'}),
74 │       );
75 │     });
76 │ 
77 │     it('state changes via navigation are reflected in location', () => {
78 ▶       navigation.navigate('/b', {state: {otherState: 'otherValue'}});
79 ▶       expect(location.getState()).toEqual(jasmine.objectContaining({otherState: 'otherValue'}));
80 │     });
81 │ 
82 │     it('onurlchange tracks changes from navigation API', async () => {
83 │       let changed = false;
84 ▶       location.onUrlChange(() => {
85 │         changed = true;
86 │       });
87 │ 
88 ▶       navigation.navigate('/c');
89 ▶       expect(changed).toBeTrue();
90 │     });
```

router の spec の最初の 2 つ（54・58 行目）は、`withExperimentalPlatformNavigation()` を足しても TestBed の既定がそのまま使われることを確かめます。次の 3 つが `Location` と Navigation の同期です。71 行目の `location.go` の state が 72 行目で `navigation.currentEntry.getState()` に出ること（4 節の adapter が `navigate(url, { state })` するから）、78 行目の `navigation.navigate` の state が 79 行目で `location.getState()` に出ること、88 行目の `navigation.navigate` だけで 84 行目の `onUrlChange` が呼ばれること（4 節の `currententrychange` の通知）。

📄 `angular/packages/router/test/with_platform_navigation.spec.ts` L388–395 （▶ の行: 391, 393）

```ts
388 │ describe('configuration error', () => {
389 │   it('throws an error mentioning SpyLocation and the location mocks', () => {
390 │     TestBed.configureTestingModule({
391 ▶       providers: [provideRouter([], withExperimentalPlatformNavigation()), provideLocationMocks()],
392 │     });
393 ▶     expect(() => TestBed.inject(Location)).toThrowError(/SpyLocation.*provideLocationMocks/);
394 │   });
395 │ });
```

4 節の開発モードの検査の spec です。391 行目で `provideLocationMocks()` を足し、393 行目で `Location` を inject すると、文に `SpyLocation` と `provideLocationMocks` の両方が入った例外になることを確かめます。

📄 `angular/packages/router/test/computed_state_restoration.spec.ts` L21–32 （▶ の行: 21, 23–26, 28–29）

```ts
21 ▶ for (const browserAPI of ['navigation', 'history'] as const) {
22 │   const expectPageIndex = (index: number) => {
23 ▶     if (browserAPI === 'navigation') {
24 ▶       const navigation = TestBed.inject(PlatformNavigation);
25 ▶       const entries = navigation.entries();
26 ▶       expect(entries.indexOf(navigation.currentEntry!)).toBe(index);
27 │     } else {
28 ▶       expect(TestBed.inject(Location).getState()).toEqual(
29 ▶         jasmine.objectContaining({ɵrouterPageId: index}),
30 │       );
31 │     }
32 │   };
```

📄 `angular/packages/router/test/computed_state_restoration.spec.ts` L124–132 （▶ の行: 129–131）

```ts
124 │             withRouterConfig({
125 │               urlUpdateStrategy,
126 │               canceledNavigationResolution: 'computed',
127 │               resolveNavigationPromiseOnError: true,
128 │             }),
129 ▶             browserAPI === 'navigation'
130 ▶               ? withExperimentalPlatformNavigation()
131 ▶               : (makeEnvironmentProviders([]) as any),
132 │           ),
```

computed\_state\_restoration.spec.ts は、同じ it を 2 つの API で走らせる形の例です。21 行目の `for` で `'navigation'` と `'history'` を回し、129〜131 行目で `'navigation'` のときだけ `withExperimentalPlatformNavigation()` を足します。「今どの位置のエントリにいるか」の確かめ方は API で違うので、23〜26 行目は `navigation.entries()` の中の `currentEntry` の位置、28〜29 行目は `history.state` の `ɵrouterPageId` を見ます。TestBed の既定がどちらも `FakeNavigation` なので、`'history'` の側も `FakeNavigation` の上の `pushState` で動いています。

> [!NOTE]
> **ポイント**
>
> router の integration の spec（`packages/router/test/integration/`）も同じ形で、`navigation-based routing` と `history-based routing` の describe が 269 件ずつ走ります（[第 7 回](07-navx-tests-issues.md)）。

## 6. DEMO：Location と FakeNavigationPlatformLocation を組み立てた記録

> **🧪 DEMO — Location の呼び出しと、FakeNavigation の entries（Node で動かした記録の再生）**
>
> **これは Node で動かした記録です。**このページでは何も動かさず、下のスクリプトが残した結果を 1 操作ずつ表にします。このページで動かさないのは、`ɵFakeNavigationPlatformLocation` が `@angular/core/testing` の `FakeNavigation` を `instanceof` で参照していて（3 節の 291 行目）、`@angular/core/testing` を読み込むと TestBed と JIT の部品が一緒に入り、このサイトの初期の JS が約 60 kB 増えるからです。スクリプトは配布物（22.1.6）の `ɵFakeNavigation`（`https://app.example/` から）と `ɵFakeNavigationPlatformLocation` を、別のルートの注入器（親はプラットフォームの注入器、`ɵINJECTOR_SCOPE` は `'root'`）に入れ、その中で作られる本物の `Location` と `PathLocationStrategy` で、7 つの操作をこの順に行いました。実装と同期・非同期の 4 通りを記録してあります。
>
> 操作の順： 1. go('/a') → 2. go('/b', 'x=1') → 3. replaceState('/c') → 4. back() → 5. forward() → 6. historyGo(-2) → 7. navigation.navigate('/d')
>
> 「次の操作」を押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/navx-testing)

📄 `record-location.mjs`

```js
// 第 6 回 navx-testing の記録を作るスクリプト（Node で動かす）。
// 使い方: NM=<angular-deep-dive の node_modules> node record-location.mjs <出力する .data.ts>
// サイトの依存の配布物（@angular/core・common と core/testing・common/testing、22.1.6）をそのまま読み込み、
// TestBed と同じ組み合わせ（FakeNavigation + FakeNavigationPlatformLocation + 本物の Location と PathLocationStrategy）を組む。
// - FakeNavigation に渡す Document は createElement が投げる小さな代わり（fake_navigation.ts 125〜130 行目で
//   new EventTarget() になる）。defaultView も null なので、popstate はその EventTarget に配られ、
//   FakeNavigationPlatformLocation.onPopState もそこに登録する。
// - 注入器はプラットフォームの注入器を親にし、ɵINJECTOR_SCOPE を 'root' にする（Location・LocationStrategy をこの中で作る）。
// - 3 通り（Location で同期・NavigationAdapterForLocation で同期・Location で非同期）を、同じ 7 つの操作の順で記録する。
import { writeFileSync, readFileSync } from 'node:fs';
const NM = process.env.NM.replace(/\/$/, '') + '/';
await import(NM + '@angular/compiler/fesm2022/compiler.mjs');
const core = await import(NM + '@angular/core/fesm2022/core.mjs');
const common = await import(NM + '@angular/common/fesm2022/common.mjs');
const ctesting = await import(NM + '@angular/common/fesm2022/testing.mjs');
const { ɵFakeNavigation } = await import(NM + '@angular/core/fesm2022/testing.mjs');
const platform = core.platformCore();

const path = (url) => { if (!url) return '(null)'; const u = new URL(url); return u.pathname + u.search + u.hash; };
const show = (v) => (v === undefined ? 'undefined' : JSON.stringify(v));
const tick = () => new Promise((r) => setTimeout(r, 0));
const OPS = ['go-a', 'go-b', 'replace-c', 'back', 'forward', 'history-go-2', 'navigate-d'];

async function record(impl, synchronous) {
  const doc = { createElement() { throw new Error('no DOM'); }, defaultView: null };
  const fake = new ɵFakeNavigation(doc, 'https://app.example/');
  fake.setSynchronousTraversalsForTesting(synchronous);
  const injector = core.createEnvironmentInjector([
    { provide: core.ɵINJECTOR_SCOPE, useValue: 'root' },
    { provide: common.DOCUMENT, useValue: doc },
    { provide: common.PlatformNavigation, useValue: fake },
    { provide: common.PlatformLocation, useClass: ctesting.ɵFakeNavigationPlatformLocation },
    impl === 'adapter' ? { provide: common.Location, useClass: common.ɵNavigationAdapterForLocation } : [],
  ], platform.injector, 'record');
  const loc = injector.get(common.Location);
  const pl = injector.get(common.PlatformLocation);
  const implName = loc instanceof common.ɵNavigationAdapterForLocation ? 'NavigationAdapterForLocation' : 'Location';
  let rows = [];
  let n = 0;
  const log = (source, text) => rows.push({ no: ++n, source, text });
  fake.addEventListener('navigate', (e) => log('FakeNavigation', `navigate '${e.navigationType}' → ${path(e.destination.url)}`));
  fake.addEventListener('currententrychange', () => log('FakeNavigation', `currententrychange（currentEntry は ${path(fake.currentEntry.url)}）`));
  loc.subscribe((ev) => log('Location.subscribe', `${ev.type ?? ''} url=${ev.url ?? ''} state=${show(ev.state)}`));
  loc.onUrlChange((url, state) => log('Location.onUrlChange', `url=${url} state=${show(state)}`));
  const steps = [];
  for (const op of OPS) {
    rows = []; n = 0;
    switch (op) {
      case 'go-a': log('呼び出し', "location.go('/a', '', { n: 'a' })"); loc.go('/a', '', { n: 'a' }); break;
      case 'go-b': log('呼び出し', "location.go('/b', 'x=1', { n: 'b' })"); loc.go('/b', 'x=1', { n: 'b' }); break;
      case 'replace-c': log('呼び出し', "location.replaceState('/c', '', { n: 'c' })"); loc.replaceState('/c', '', { n: 'c' }); break;
      case 'back': log('呼び出し', 'location.back()'); loc.back(); break;
      case 'forward': log('呼び出し', 'location.forward()'); loc.forward(); break;
      case 'history-go-2': log('呼び出し', 'location.historyGo(-2)'); loc.historyGo(-2); break;
      case 'navigate-d': log('呼び出し', "navigation.navigate('/d', { state: { n: 'd' } })（Location を通さない）"); fake.navigate('/d', { state: { n: 'd' } }).finished.catch(() => {}); break;
    }
    log('呼び出し', `戻った直後の location.path() は '${loc.path()}'`);
    await tick(); await tick();
    const cur = fake.currentEntry;
    steps.push({
      op,
      rows,
      entries: fake.entries().map((en) => ({ index: en.index, url: path(en.url), state: show(en.getState()), historyState: show(en.getHistoryState()), current: en === cur })),
      path: loc.path(),
      locationState: show(loc.getState()),
      platformState: show(pl.getState()),
      href: pl.href,
      impl: implName,
    });
  }
  injector.destroy();
  fake.dispose();
  return steps;
}

const RECORDS = {
  'location|sync': await record('location', true),
  'adapter|sync': await record('adapter', true),
  'location|async': await record('location', false),
  'adapter|async': await record('adapter', false),
};
writeFileSync(process.argv[2], `// 自動生成 — 手で編集しないこと（record-location.mjs を Node ${process.version} で動かした記録、@angular/common ${common.VERSION.full}）。
export interface LocStep { op: string; rows: { no: number; source: string; text: string }[]; entries: { index: number; url: string; state: string; historyState: string; current: boolean }[]; path: string; locationState: string; platformState: string; href: string; impl: string }
export const RECORDS: Record<string, LocStep[]> = ${JSON.stringify(RECORDS)};
export const SCRIPT = ${JSON.stringify(readFileSync(new URL(import.meta.url), 'utf8'))};
`);
console.log('ok');
process.exit(0);

```
*記録を作ったスクリプトの全文（Node で動かした記録です）*

記録から分かることです（記録に切り替える前に、同じ操作を本番ビルドのページの上で動かした結果とも同じでした）。

1. **Location のとき、`go` の state は entries の `getHistoryState()` の欄に入る**

   `Location.go` → `PathLocationStrategy.pushState` → 3 節の 339 行目 → `FakeNavigation.pushState` の経路だからです。`getState()` の欄は `undefined`。`location.getState()` と `platformLocation.getState()` は、どちらも 358〜359 行目の `getHistoryState()` なので同じ値です。
2. **NavigationAdapterForLocation にすると、state は `getState()` の欄に入り、`platformLocation.getState()` は `null` になる**

   4 節の adapter は `navigation.navigate(url, { state })` で書き、`currentEntry.getState()` で読むからです。2 つの「状態」がはっきり分かれます。
3. **back() で、`Location.subscribe` に popstate が届く**

   popstate は本物の window ではなく、2 節の 132 行目の「window の代わり」（この記録では `EventTarget`）に配られ、3 節の 307 行目で付けたリスナーが受け取ります。NavigationAdapterForLocation のときは、popstate の state が `null` で、`location.getState()` の値と違います（popstate が運ぶのは `history.state` の側だから）。
4. **同期を外すと、`back()` から戻った直後の `location.path()` はまだ前のパス**

   traverse が `setTimeout` のあとに起きるからです。TestBed の中ではこれが同期なので、テストで `await` しなくても URL が変わっています。
5. **`navigation.navigate('/d')` を直接呼ぶと、Location のときは `onUrlChange` も `subscribe` も呼ばれない**

   push の navigate では popstate が出ないからです。NavigationAdapterForLocation のときは `currententrychange` から `onUrlChange` が呼ばれます（5 節の 82〜90 行目の it）。

## ここまでの呼び出し（TestBed で location.back()）

- 👤 `TestBed.inject(Location).back()` — あなたのテスト
  - `PathLocationStrategy.back()` → `PlatformLocation.back()` — common/src/location — *PlatformLocation は BrowserTestingModule の既定（browser.ts L32）*
    - `FakeNavigationPlatformLocation.back()` — mock\_platform\_location.ts L350-351
      - `FakeNavigation.back()` → `traverseTo(key)` — fake\_navigation.ts（第 3 回） — *FAKE\_NAVIGATION の L27 で同期*
        - `navigate`（traverse）→ `currententrychange` → `popstate` — fake\_navigation.ts — *popstate は L132 の window へ*
          - `onPopState` のリスナー — mock\_platform\_location.ts L306-307
            - `Location` の `_subject.next({ pop: true, … })` → `subscribe`・`onUrlChange` — common/src/location/location.ts

## テストと直し方

### spec と it

| ファイル | describe / it | 行 | この章のどこ |
| --- | --- | --- | --- |
| common/test/navigation/navigation\_spec.ts | `Navigation` › 2 つ | 14・19 | 1・2 節（c795960ada1 が足した） |
| router/test/with\_platform\_navigation.spec.ts | `provides FakeNavigation by default`・`provides FakeNavigationPlatformLocation by default` | 54・58 | 1 節 |
| 同上 | `ensures location information is synced with navigation` › 4 つ | 70〜92 | 4 節 |
| 同上 | `configuration error` › `throws an error mentioning SpyLocation …` | 389 | 4 節 |
| router/test/computed\_state\_restoration.spec.ts | `canceledNavigationResolution: 'computed' with ${browserAPI}-based routing` | 34 | 5 節（2 つの API で同じ it） |
| （無い） | `FakeNavigationPlatformLocation` そのものの spec（290〜297 行目の例外の文、`getState` が history の側を返すこと） | — | 3 節 |

### 手元で走らせた結果

📄 `../angular（22.2.0-next.7、8576f161ae4）、2026-11-07`

```
pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all --test_arg=--filter=Navigation
  Ran 2 of 667 specs / 2 specs, 0 failures
pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all --test_arg=--filter=withPlatformNavigation
  Ran 14 of 1170 specs / 14 specs, 0 failures
pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all "--test_arg=--filter=navigation-based routing"
  Ran 269 of 1170 specs / 269 specs, 0 failures   （"history-based routing" も 269 件）
```

1 節の既定が本当に spec に守られているかを、作業木で確かめました。

📄 `scratchpad/nav-logs/b-wt-c795-revert.log（要点）`

```
# 作業木（8576f161ae4）で browser.ts の 32 行目を
#   {provide: PlatformLocation, useClass: MockPlatformLocation}
# に戻してから
pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all --test_arg=--filter=Navigation

1) Navigation can inject and use the navigation API by default
    TypeError: Cannot read properties of undefined (reading 'entries')
2) Navigation provides fake navigation by default
    Expected instance of undefined to be an instance of FakeNavigation
Ran 2 of 667 specs
2 specs, 2 failures
```

既定を `MockPlatformLocation` に戻すと、`PlatformNavigation` は `providedIn: 'platform'` の `window.navigation`（Node では `undefined`）になり、2 つとも落ちます。common の Node の spec で `FakeNavigation` が使えるのは、この 1 行のおかげです。

### 直すとしたら

- 3 節の 292〜295 行目の例外の文は、関数の名前を `provideFakePlatformNavigation`（または公開名の `ɵprovideFakePlatformNavigation`）に、293 行目の主語をクラスの名前に合わせることになります。直すのは mock\_platform\_location.ts の文字列だけで、spec は common/test の下に「`PlatformNavigation` が FakeNavigation でないと例外」の it を足す形です。
- `FakeNavigationPlatformLocation` の `getState()` が history の側を返すこと（358〜359 行目）を確かめる it はありません。5 節の spec は adapter の側（Navigation API の state）だけを見ています。
- 関係する issue は[第 7 回](07-navx-tests-issues.md)です。

## 聞かれそうな質問

**Q. TestBed で Router のテストを書くと、本物のブラウザの履歴は動きますか？**

動きません。`BrowserTestingModule` の providers（browser.ts 32 行目）が `PlatformLocation` を `FakeNavigationPlatformLocation` にし、`pushState` や `back` は `FakeNavigation` の同じ名前のメソッドに渡されます（mock\_platform\_location.ts 338〜356 行目）。ただし、ブラウザで走る spec では `FakeNavigation` に本物の `document` が渡るので、traverse の popstate は本物の window に配られます（provide\_fake\_platform\_navigation.ts 26 行目、fake\_navigation.ts 132 行目）。

**Q. テストの URL が `http://_empty_/` になるのはなぜですか？**

`FAKE_NAVIGATION` の factory が、`MOCK_PLATFORM_LOCATION_CONFIG` の `startUrl` が無いときの既定にしているからです（provide\_fake\_platform\_navigation.ts 24〜25 行目）。変えたいときは `{ provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: 'http://localhost/' } }` を足します。

**Q. `location.back()` のあと、すぐに `location.path()` を見てよいですか？**

TestBed の既定なら、はい。`FAKE_NAVIGATION` の factory が `setSynchronousTraversalsForTesting(true)` を呼ぶので（27 行目）、`back()` から戻る前に traverse が済んでいます。自分で `new FakeNavigation` したときは既定が非同期なので、`setTimeout` 1 回分待つ必要があります。

**Q. `withExperimentalPlatformNavigation()` と `provideLocationMocks()` を一緒に使えないのはなぜですか？**

`provideLocationMocks()` は `Location` を `SpyLocation` にし、`withExperimentalPlatformNavigation()` は `NavigationAdapterForLocation` にするからです。開発モードでは provide\_router.ts の検査が `SpyLocation` を見つけて例外にします（258〜259 行目、spec は with\_platform\_navigation.spec.ts 389 行目）。

**Q. `location.getState()` と `navigation.currentEntry.getState()` は同じですか？**

実装で違います。TestBed の既定の `Location` は `PlatformLocation.getState()`、つまり `getHistoryState()`（mock\_platform\_location.ts 358〜359 行目）。`NavigationAdapterForLocation` は Navigation API の `currentEntry.getState()` です。デモで実装を切り替えると、entries の表で入る欄が変わります。

## 読み終えて

- TestBed の既定は `BrowserTestingModule` の 1 行（`ɵprovideFakePlatformNavigation()`、c795960ada1 から）。`PlatformLocation` は `FakeNavigationPlatformLocation`、`PlatformNavigation` は it ごとの `FakeNavigation`。
- `FAKE_NAVIGATION` は `http://_empty_/` から始まり、traverse を同期にする。
- `FakeNavigationPlatformLocation` は受け渡しだけ。`getState()` は history の側。例外の文の関数の名前は実在しない。
- `NavigationAdapterForLocation` は `back`・`forward` を Navigation API に、`onUrlChange` を `currententrychange` に任せ、`historyGo` はもとのまま。

---

← 前: [Router の連携の残り：reload・URL の比較・push と replace の時機](05-navx-router-integration.md)  
次: [spec と issue を読む：Navigation API の連携の今](07-navx-tests-issues.md) →
