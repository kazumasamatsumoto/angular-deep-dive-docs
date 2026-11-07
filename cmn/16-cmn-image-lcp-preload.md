[目次](../README.md) › [common の内側](README.md) › 第 16 回 / 全 20 回

# LCP・preconnect・preload・placeholder：速く見せる仕組み

> LCPImageObserver が PerformanceObserver で LCP の画像を見つけて priority の付け忘れを知らせる行（同じ URL の画像の修正 38749698d05）、PreconnectLinkChecker、サーバーで &lt;link rel=preload&gt; を足す PreloadLinkCreator（crossorigin の修正 d14696e4308）、placeholder のぼかしと url() のエスケープ（b56e8651482・3dd35c242ca）、読み込み後に外す removePlaceholderOnLoad（feb86e3fdeb）。ページの上で placeholder の前と後の style を見るデモ。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-image-lcp-preload)

---

`NgOptimizedImage` には、画像を速く見せるための仕組みが 4 つあります。LCP の画像に priority が付いていないと教える `LCPImageObserver`、priority の画像の origin への preconnect があるかを見る `PreconnectLinkChecker`、サーバーで `<link rel="preload">` を head に足す `PreloadLinkCreator`、読み込み中にぼかした小さな画像を背景に敷く placeholder です。この章では、それぞれが**いつ・どこで（開発モードか、サーバーか、本番のブラウザか）**動き、どの表を持ち、2026 年の修正で何が変わったかを行で追います。

読む対象は `packages/common/src/directives/ng_optimized_image/` の `lcp_image_observer.ts`（202 行）・`preconnect_link_checker.ts`（153 行）・`preload-link-creator.ts`（112 行）・`tokens.ts`・`url.ts` と、`ng_optimized_image.ts` の placeholder の関数、spec の `ng_optimized_image_spec.ts` です。

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
16. **16. LCP と preload**（この章）
17. [17. Location](17-cmn-location.md)
18. [18. テスト用の Location](18-cmn-location-testing.md)
19. [19. ViewportScroller](19-cmn-viewport-scroller.md)
20. [20. issue と PR を読む](20-cmn-issues.md)

| 仕組み | 呼ぶ場所（ng\_optimized\_image.ts。第 13 回の引用の行） | 開発モード | 本番のブラウザ | サーバー |
| --- | --- | --- | --- | --- |
| `LCPImageObserver` | ngOnInit 467 行目・ngOnChanges 560 行目（第 13 回） | 動く | 無い | 作るが何もしない（53 行目） |
| `PreconnectLinkChecker` | ngOnInit 471〜472 行目（priority だけ） | 動く | 無い | 何もしない（101 行目） |
| `PreloadLinkCreator` | setHostAttributes 524〜533 行目（priority だけ） | 上限の警告だけ足す | 呼ばない | 動く |
| placeholder | ホストのスタイル 264〜269 行目・ngOnInit 480〜482 行目 | 検査を足す | 動く | スタイルを書く |

どの仕組みも、呼ぶ側は[第 13 回](13-cmn-image-overview.md)で読んだ `ngOnInit` と `setHostAttributes` です。ここでは呼ばれる側を読みます。

## 1. LCPImageObserver：開発モードだけの見張り役

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L400–409 （▶ の行: 401–402, 404–406）

```ts
400 │   constructor() {
401 ▶     if (ngDevMode) {
402 ▶       this.lcpObserver = this.injector.get(LCPImageObserver);
403 │ 
404 ▶       this.destroyRef.onDestroy(() => {
405 ▶         if (!this.priority && this._renderedSrc !== null) {
406 ▶           this.lcpObserver!.unregisterImage(this._renderedSrc);
407 │         }
408 │       });
409 │     }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/lcp_image_observer.ts` L23–58 （▶ の行: 24–25, 28, 41, 44, 46, 50, 52–54, 56）

```ts
23 │ interface ObservedImageState {
24 ▶   priority: boolean;
25 ▶   modified: boolean;
26 │   alreadyWarnedPriority: boolean;
27 │   alreadyWarnedModified: boolean;
28 ▶   count: number;
29 │ }
30 │ 
31 │ /**
32 │  * Observer that detects whether an image with `NgOptimizedImage`
33 │  * is treated as a Largest Contentful Paint (LCP) element. If so,
34 │  * asserts that the image has the `priority` attribute.
35 │  *
36 │  * Note: this is a dev-mode only class and it does not appear in prod bundles,
37 │  * thus there is no `ngDevMode` use in the code.
38 │  *
39 │  * Based on https://web.dev/lcp/#measure-lcp-in-javascript.
40 │  */
41 ▶ @Service()
42 │ export class LCPImageObserver implements OnDestroy {
43 │   // Map of full image URLs -> original `ngSrc` values.
44 ▶   private images = new Map<string, ObservedImageState>();
45 │ 
46 ▶   private window: Window | null = inject(DOCUMENT).defaultView;
47 │   private observer: PerformanceObserver | null = null;
48 │ 
49 │   constructor() {
50 ▶     assertDevMode('LCP checker');
51 │ 
52 ▶     if (
53 ▶       (typeof ngServerMode === 'undefined' || !ngServerMode) &&
54 ▶       typeof PerformanceObserver !== 'undefined'
55 │     ) {
56 ▶       this.observer = this.initPerformanceObserver();
57 │     }
58 │   }
```

1. **401〜402 行目：ディレクティブのコンストラクタで取り出す**

   開発モードのときだけ `injector.get(LCPImageObserver)` します。本番のバンドルには `LCPImageObserver` のクラスが入りません（36〜37 行目のコメント）。
2. **41 行目：`@Service()` なので root に 1 つ**

   `@Service()` は `providedIn: 'root'` の印です（[boot-injectors](../boot/08-boot-injectors.md)）。ページの全部の画像が 1 つの表（44 行目の `images`）を共有します。
3. **50 行目：本番で呼ばれたら投げる**

   `assertDevMode`（asserts.ts）は `ngDevMode` が偽なら `RuntimeError` を投げます。「開発用のコードが本番に紛れ込んでいないか」の安全装置です。
4. **52〜57 行目：サーバーでは見張らない**

   `ngServerMode` が真か、`PerformanceObserver` が無ければ `observer` は `null` のままで、`registerImage`・`unregisterImage`・`updateImage` は先頭の `if (!this.observer) return;`（97・118・131 行目）で何もしません。
5. **23〜29 行目：URL ごとの状態**

   `priority`（その URL の画像のどれかが priority か）、`modified`（`ngSrc` を変えられたか）、2 つの「もう警告した」の印、そして `count`（同じ URL の画像が何枚あるか。38749698d05 で足した。3 節）。

## 2. LCP の候補を受け取って、priority を確かめる

📄 `angular/packages/common/src/directives/ng_optimized_image/lcp_image_observer.ts` L60–94 （▶ の行: 65–67, 72, 76, 79, 81–85, 87–89, 92）

```ts
60 │   /**
61 │    * Inits PerformanceObserver and subscribes to LCP events.
62 │    * Based on https://web.dev/lcp/#measure-lcp-in-javascript
63 │    */
64 │   private initPerformanceObserver(): PerformanceObserver {
65 ▶     const observer = new PerformanceObserver((entryList) => {
66 ▶       const entries = entryList.getEntries();
67 ▶       if (entries.length === 0) return;
68 │       // We use the latest entry produced by the `PerformanceObserver` as the best
69 │       // signal on which element is actually an LCP one. As an example, the first image to load on
70 │       // a page, by virtue of being the only thing on the page so far, is often a LCP candidate
71 │       // and gets reported by PerformanceObserver, but isn't necessarily the LCP element.
72 ▶       const lcpElement = entries[entries.length - 1];
73 │ 
74 │       // Cast to `any` due to missing `element` on the `LargestContentfulPaint` type of entry.
75 │       // See https://developer.mozilla.org/en-US/docs/Web/API/LargestContentfulPaint
76 ▶       const imgSrc = (lcpElement as any).element?.src ?? '';
77 │ 
78 │       // Exclude `data:` and `blob:` URLs, since they are not supported by the directive.
79 ▶       if (imgSrc.startsWith('data:') || imgSrc.startsWith('blob:')) return;
80 │ 
81 ▶       const img = this.images.get(imgSrc);
82 ▶       if (!img) return;
83 ▶       if (!img.priority && !img.alreadyWarnedPriority) {
84 ▶         img.alreadyWarnedPriority = true;
85 ▶         logMissingPriorityError(imgSrc);
86 │       }
87 ▶       if (img.modified && !img.alreadyWarnedModified) {
88 ▶         img.alreadyWarnedModified = true;
89 ▶         logModifiedWarning(imgSrc);
90 │       }
91 │     });
92 ▶     observer.observe({type: 'largest-contentful-paint', buffered: true});
93 │     return observer;
94 │   }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/lcp_image_observer.ts` L178–189 （▶ の行: 180, 182–184）

```ts
178 │ function logMissingPriorityError(ngSrc: string) {
179 │   const directiveDetails = imgDirectiveDetails(ngSrc);
180 ▶   console.error(
181 │     formatRuntimeError(
182 ▶       RuntimeErrorCode.LCP_IMG_MISSING_PRIORITY,
183 ▶       `${directiveDetails} this image is the Largest Contentful Paint (LCP) ` +
184 ▶         `element but was not marked "priority". This image should be marked ` +
185 │         `"priority" in order to prioritize its loading. ` +
186 │         `To fix this, add the "priority" attribute.`,
187 │     ),
188 │   );
189 │ }
```

1. **92 行目：`largest-contentful-paint` を `buffered: true` で**

   ブラウザは、より大きな要素が描かれるたびに LCP の候補を記録します。`buffered: true` は「見張りを始める前に記録されたものも渡して」という意味で、最初の画像が作られた時点より前の候補も受け取ります。
2. **72 行目：最後の候補だけを使う**

   68〜71 行目のコメントのとおり、最初に描かれた画像は（その時点で一番大きいので）候補になりやすいが、最後まで LCP とは限らないからです。
3. **76〜82 行目：要素の `src` で表を引く**

   候補の `element.src`（ブラウザが選んだ srcset の候補ではなく `src` 属性の絶対 URL）で 44 行目の表を引きます。`data:` と `blob:` は 79 行目で捨て、表に無い（`NgOptimizedImage` でない）画像も 82 行目で捨てます。
4. **83〜90 行目：priority でなければ 1 回だけエラー、`ngSrc` を変えていれば 1 回だけ警告**

   180 行目は `console.error` です（警告ではなくエラー）。`alreadyWarned…` の印で、同じ URL について 2 回は出しません。

> [!NOTE]
> **ポイント**
>
> ブラウザは、利用者の最初の操作（タップ・クリック・キー入力・スクロール）のあとは `largest-contentful-paint` の候補を記録しません。だから、ルートを移った後（ソフトナビゲーション）に表れた大きな画像は、この見張り役では調べられません。2026-11-04 に開かれた issue #71812 は、`soft-navigation` と `interaction-contentful-paint` の記録も見て、移った後の LCP の画像にも同じエラーを出そう、という提案です（同じ作者の PR #69963 は動きが無く 2026-10-27 に閉じられた）。この章の DEMO が LCP の警告を見せないのも同じ理由で、ボタンを押した後に描く画像は LCP の候補になりません。

## 3. 表の出し入れと、同じ URL の画像（38749698d05）

📄 `angular/packages/common/src/directives/ng_optimized_image/lcp_image_observer.ts` L96–128 （▶ の行: 98–99, 101, 103–104, 106, 111, 113, 119, 123–125）

```ts
 96 │   registerImage(rewrittenSrc: string, isPriority: boolean) {
 97 │     if (!this.observer) return;
 98 ▶     const url = getUrl(rewrittenSrc, this.window!).href;
 99 ▶     const existingState = this.images.get(url);
100 │ 
101 ▶     if (existingState) {
102 │       // If any instance has priority, the URL is considered to have priority
103 ▶       existingState.priority = existingState.priority || isPriority;
104 ▶       existingState.count++;
105 │     } else {
106 ▶       const newObservedImageState: ObservedImageState = {
107 │         priority: isPriority,
108 │         modified: false,
109 │         alreadyWarnedModified: false,
110 │         alreadyWarnedPriority: false,
111 ▶         count: 1,
112 │       };
113 ▶       this.images.set(url, newObservedImageState);
114 │     }
115 │   }
116 │ 
117 │   unregisterImage(rewrittenSrc: string) {
118 │     if (!this.observer) return;
119 ▶     const url = getUrl(rewrittenSrc, this.window!).href;
120 │     const existingState = this.images.get(url);
121 │ 
122 │     if (existingState) {
123 ▶       existingState.count--;
124 ▶       if (existingState.count <= 0) {
125 ▶         this.images.delete(url);
126 │       }
127 │     }
128 │   }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/url.ts` L9–24 （▶ の行: 10, 12, 16–17, 22–23）

```ts
 9 │ // Converts a string that represents a URL into a URL class instance.
10 ▶ export function getUrl(src: string, win: Window): URL {
11 │   // Don't use a base URL is the URL is absolute.
12 ▶   return isAbsoluteUrl(src) ? new URL(src) : new URL(src, win.location.href);
13 │ }
14 │ 
15 │ // Checks whether a URL is absolute (i.e. starts with `http://` or `https://`).
16 ▶ export function isAbsoluteUrl(src: string): boolean {
17 ▶   return /^https?:\/\//.test(src);
18 │ }
19 │ 
20 │ // Given a URL, extract the hostname part.
21 │ // If a URL is a relative one - the URL is returned as is.
22 ▶ export function extractHostname(url: string): string {
23 ▶   return isAbsoluteUrl(url) ? new URL(url).hostname : url;
24 │ }
```

1. **98 行目：表のキーは絶対 URL**

   url.ts 10〜13 行目の `getUrl` で、相対の URL は今のページの `location.href` を基準に絶対 URL にします。2 節の `element.src` も絶対 URL なので、同じ形で引けます。
2. **101〜104 行目：同じ URL がもうあれば、priority は「どれか 1 つでも」で、枚数を 1 足す**

   103 行目の `||` なので、priority の画像と priority でない画像が同じ URL なら、表の上は priority です。
3. **117〜128 行目：外すときは枚数を 1 引き、0 になったら消す**

   呼ぶのはディレクティブの destroy のときで、しかも 405 行目のとおり **priority でない画像だけ**です。priority の画像を destroy しても、その分の枚数は表に残ります。

38749698d05（2026-02-20、fix(common): fix LCP image detection with duplicate URLs、issue #53278 を閉じた）の前は、`registerImage` が `this.images.set(url, 新しい状態)` の 1 行、`unregisterImage` が `this.images.delete(url)` の 1 行でした。「priority の大きな画像と、同じ URL の小さな画像（priority なし）が同じページにある」と、後から登録した小さい方が状態を上書きして `priority: false` になり、LCP の大きな画像について「priority が付いていない」と間違ったエラーが出ていました。修正は 28 行目の `count` と 103 行目の `||` です。spec はディレクティブの spec ではなく、e2e の `packages/core/test/bundling/image-directive/e2e/lcp-check-duplicate/` に足しています。

📄 `angular/packages/common/src/directives/ng_optimized_image/lcp_image_observer.ts` L130–169 （▶ の行: 136, 139, 142–144, 148–149, 151–152, 158, 161, 163）

```ts
130 │   updateImage(originalSrc: string, newSrc: string) {
131 │     if (!this.observer) return;
132 │     const originalUrl = getUrl(originalSrc, this.window!).href;
133 │     const newUrl = getUrl(newSrc, this.window!).href;
134 │ 
135 │     // URL hasn't changed
136 ▶     if (originalUrl === newUrl) return;
137 │ 
138 │     const originalState = this.images.get(originalUrl);
139 ▶     if (!originalState) return;
140 │ 
141 │     // Decrement count for original URL
142 ▶     originalState.count--;
143 ▶     if (originalState.count <= 0) {
144 ▶       this.images.delete(originalUrl);
145 │     }
146 │ 
147 │     // Add or update entry for new URL
148 ▶     const newState = this.images.get(newUrl);
149 ▶     if (newState) {
150 │       // Merge if original had priority, new should too
151 ▶       newState.priority = newState.priority || originalState.priority;
152 ▶       newState.modified = true;
153 │       // Preserve warning flags from the original state to avoid duplicate warnings
154 │       newState.alreadyWarnedPriority =
155 │         newState.alreadyWarnedPriority || originalState.alreadyWarnedPriority;
156 │       newState.alreadyWarnedModified =
157 │         newState.alreadyWarnedModified || originalState.alreadyWarnedModified;
158 ▶       newState.count++;
159 │     } else {
160 │       // Create new entry, preserving state from the image that moved
161 ▶       this.images.set(newUrl, {
162 │         priority: originalState.priority,
163 ▶         modified: true,
164 │         alreadyWarnedModified: originalState.alreadyWarnedModified,
165 │         alreadyWarnedPriority: originalState.alreadyWarnedPriority,
166 │         count: 1,
167 │       });
168 │     }
169 │   }
```

`updateImage` は `ngSrc` が変わったとき（第 13 回の 560 行目）です。元の URL の枚数を 1 引き（142〜145 行目）、新しい URL に「priority を引き継ぎ、`modified: true`」で足します（148〜168 行目）。`modified` の画像が LCP になると、2 節の 87〜90 行目で「LCP の画像の `ngSrc` を変えると遅くなる」と警告します。

## 4. PreconnectLinkChecker：priority の画像の origin

preconnect は「この origin にはもうすぐ取りに行くので、先に接続（DNS・TCP・TLS）を済ませて」とブラウザに伝える `<link>` です。

📄 `angular/packages/common/src/directives/ng_optimized_image/preconnect_link_checker.ts` L24–47 （▶ の行: 25, 45–46）

````ts
24 │ // Set of origins that are always excluded from the preconnect checks.
25 ▶ const INTERNAL_PRECONNECT_CHECK_BLOCKLIST = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);
26 │ 
27 │ /**
28 │  * Injection token to configure which origins should be excluded
29 │  * from the preconnect checks. It can either be a single string or an array of strings
30 │  * to represent a group of origins, for example:
31 │  *
32 │  * ```ts
33 │  *  {provide: PRECONNECT_CHECK_BLOCKLIST, useValue: 'https://your-domain.com'}
34 │  * ```
35 │  *
36 │  * or:
37 │  *
38 │  * ```ts
39 │  *  {provide: PRECONNECT_CHECK_BLOCKLIST,
40 │  *   useValue: ['https://your-domain-1.com', 'https://your-domain-2.com']}
41 │  * ```
42 │  *
43 │  * @publicApi
44 │  */
45 ▶ export const PRECONNECT_CHECK_BLOCKLIST = new InjectionToken<Array<string | string[]>>(
46 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'PRECONNECT_CHECK_BLOCKLIST' : '',
47 │ );
````

📄 `angular/packages/common/src/directives/ng_optimized_image/preconnect_link_checker.ts` L56–91 （▶ の行: 64, 69, 73, 76–79, 84–86, 89）

```ts
56 │ @Service()
57 │ export class PreconnectLinkChecker implements OnDestroy {
58 │   private document = inject(DOCUMENT);
59 │ 
60 │   /**
61 │    * Set of <link rel="preconnect"> tags found on this page.
62 │    * The `null` value indicates that there was no DOM query operation performed.
63 │    */
64 ▶   private preconnectLinks: Set<string> | null = null;
65 │ 
66 │   /*
67 │    * Keep track of all already seen origin URLs to avoid repeating the same check.
68 │    */
69 ▶   private alreadySeen = new Set<string>();
70 │ 
71 │   private window: Window | null = this.document.defaultView;
72 │ 
73 ▶   private blocklist = new Set<string>(INTERNAL_PRECONNECT_CHECK_BLOCKLIST);
74 │ 
75 │   constructor() {
76 ▶     assertDevMode('preconnect link checker');
77 ▶     const blocklist = inject(PRECONNECT_CHECK_BLOCKLIST, {optional: true});
78 ▶     if (blocklist) {
79 ▶       this.populateBlocklist(blocklist);
80 │     }
81 │   }
82 │ 
83 │   private populateBlocklist(origins: Array<string | string[]> | string) {
84 ▶     if (Array.isArray(origins)) {
85 ▶       deepForEach(origins, (origin) => {
86 ▶         this.blocklist.add(extractHostname(origin));
87 │       });
88 │     } else {
89 ▶       this.blocklist.add(extractHostname(origins));
90 │     }
91 │   }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/preconnect_link_checker.ts` L100–137 （▶ の行: 101, 103–104, 107, 113, 115–116, 123, 131, 133–134）

```ts
100 │   assertPreconnect(rewrittenSrc: string, originalNgSrc: string): void {
101 ▶     if (typeof ngServerMode !== 'undefined' && ngServerMode) return;
102 │ 
103 ▶     const imgUrl = getUrl(rewrittenSrc, this.window!);
104 ▶     if (this.blocklist.has(imgUrl.hostname) || this.alreadySeen.has(imgUrl.origin)) return;
105 │ 
106 │     // Register this origin as seen, so we don't check it again later.
107 ▶     this.alreadySeen.add(imgUrl.origin);
108 │ 
109 │     // Note: we query for preconnect links only *once* and cache the results
110 │     // for the entire lifespan of an application, since it's unlikely that the
111 │     // list would change frequently. This allows to make sure there are no
112 │     // performance implications of making extra DOM lookups for each image.
113 ▶     this.preconnectLinks ??= this.queryPreconnectLinks();
114 │ 
115 ▶     if (!this.preconnectLinks.has(imgUrl.origin)) {
116 ▶       console.warn(
117 │         formatRuntimeError(
118 │           RuntimeErrorCode.PRIORITY_IMG_MISSING_PRECONNECT_TAG,
119 │           `${imgDirectiveDetails(originalNgSrc)} there is no preconnect tag present for this ` +
120 │             `image. Preconnecting to the origin(s) that serve priority images ensures that these ` +
121 │             `images are delivered as soon as possible. To fix this, please add the following ` +
122 │             `element into the <head> of the document:\n` +
123 ▶             `  <link rel="preconnect" href="${imgUrl.origin}">`,
124 │         ),
125 │       );
126 │     }
127 │   }
128 │ 
129 │   private queryPreconnectLinks(): Set<string> {
130 │     const preconnectUrls = new Set<string>();
131 ▶     const links = this.document.querySelectorAll<HTMLLinkElement>('link[rel=preconnect]');
132 │     for (const link of links) {
133 ▶       const url = getUrl(link.href, this.window!);
134 ▶       preconnectUrls.add(url.origin);
135 │     }
136 │     return preconnectUrls;
137 │   }
```

1. **25 行目・73〜80 行目：調べない host**

   `localhost`・`127.0.0.1`・`0.0.0.0`・`[::1]`（IPv6 の localhost は a3639e22584 で 2025-10 に足した）は最初から外します。利用者は `PRECONNECT_CHECK_BLOCKLIST`（45 行目）で足せます。配列の中の配列もたどり（84〜86 行目）、URL なら 23 行目の `extractHostname` で host だけにします。
2. **101 行目：サーバーでは調べない**

   `ngServerMode` が真なら、何も見ずに戻ります。
3. **103〜107 行目：同じ origin は 1 回だけ**

   ローダーが作った URL を絶対 URL にし、host が除外の中か、`alreadySeen` にその origin（`https://cdn.example.com` のような「scheme + host + port」）があれば何もしません。初めての origin なら 107 行目で覚えます。
4. **113 行目：head の preconnect は 1 回だけ探す**

   `??=` なので、最初の 1 回だけ 129〜137 行目で `link[rel=preconnect]` を全部探し、origin の集合を覚えます。109〜112 行目のコメントのとおり、その後に head に足された preconnect は見ません。見つからなければ 116〜125 行目で、足すべき `<link rel="preconnect" href="…">` を書いた警告を出します。

> [!TIP]
> **新卒エンジニアへ**
>
> [第 13 回](13-cmn-image-overview.md)の DEMO は、priority の画像を描くときだけ一瞬 `<link rel="preconnect" href="data:,">` を head に置いています。DEMO の画像は `data:` の URL で、その origin は文字列の `"null"` です。113 行目で最初に探したときにその link があれば、`"null"` が集合に入り、以後は 104 行目の `alreadySeen` で調べもしなくなる、という 103〜113 行目の作りをそのまま使っています。

## 5. PreloadLinkCreator：サーバーで head に preload を足す

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L524–533 （▶ の行: 524–526, 528–531）

```ts
524 ▶     if (typeof ngServerMode !== 'undefined' && ngServerMode && this.priority) {
525 ▶       const preloadLinkCreator = this.injector.get(PreloadLinkCreator);
526 ▶       preloadLinkCreator.createPreloadLinkTag(
527 │         this.renderer,
528 ▶         this.getRewrittenSrc(),
529 ▶         rewrittenSrcset,
530 ▶         this.sizes,
531 ▶         this.imgElement.getAttribute('crossorigin'),
532 │       );
533 │     }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/preload-link-creator.ts` L52–83 （▶ の行: 59, 61–64, 66–67, 78–79, 82）

```ts
52 │   createPreloadLinkTag(
53 │     renderer: Renderer2,
54 │     src: string,
55 │     srcset?: string,
56 │     sizes?: string,
57 │     crossOrigin?: string | null,
58 │   ): void {
59 ▶     const preloadKey = `${src}:${getCrossOriginMode(crossOrigin)}`;
60 │ 
61 ▶     if (
62 ▶       ngDevMode &&
63 ▶       !this.errorShown &&
64 ▶       this.preloadedImages.size >= DEFAULT_PRELOADED_IMAGES_LIMIT
65 │     ) {
66 ▶       this.errorShown = true;
67 ▶       console.warn(
68 │         formatRuntimeError(
69 │           RuntimeErrorCode.TOO_MANY_PRELOADED_IMAGES,
70 │           `The \`NgOptimizedImage\` directive has detected that more than ` +
71 │             `${DEFAULT_PRELOADED_IMAGES_LIMIT} images were marked as priority. ` +
72 │             `This might negatively affect an overall performance of the page. ` +
73 │             `To fix this, remove the "priority" attribute from images with less priority.`,
74 │         ),
75 │       );
76 │     }
77 │ 
78 ▶     if (this.preloadedImages.has(preloadKey)) {
79 ▶       return;
80 │     }
81 │ 
82 ▶     this.preloadedImages.add(preloadKey);
83 │ 
```

📄 `angular/packages/common/src/directives/ng_optimized_image/preload-link-creator.ts` L84–112 （▶ の行: 84–88, 90–91, 94–95, 98–99, 102, 107, 111）

```ts
 84 ▶     const preload = renderer.createElement('link');
 85 ▶     renderer.setAttribute(preload, 'as', 'image');
 86 ▶     renderer.setAttribute(preload, 'href', src);
 87 ▶     renderer.setAttribute(preload, 'rel', 'preload');
 88 ▶     renderer.setAttribute(preload, 'fetchpriority', 'high');
 89 │ 
 90 ▶     if (crossOrigin != null) {
 91 ▶       renderer.setAttribute(preload, 'crossorigin', crossOrigin);
 92 │     }
 93 │ 
 94 ▶     if (sizes) {
 95 ▶       renderer.setAttribute(preload, 'imageSizes', sizes);
 96 │     }
 97 │ 
 98 ▶     if (srcset) {
 99 ▶       renderer.setAttribute(preload, 'imageSrcset', srcset);
100 │     }
101 │ 
102 ▶     renderer.appendChild(this.document.head, preload);
103 │   }
104 │ }
105 │ 
106 │ function getCrossOriginMode(crossOrigin?: string | null): string | null {
107 ▶   if (crossOrigin == null) {
108 │     return null;
109 │   }
110 │ 
111 ▶   return crossOrigin.toLowerCase() === 'use-credentials' ? 'use-credentials' : 'anonymous';
112 │ }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/tokens.ts` L11–29 （▶ の行: 17, 24, 27）

```ts
11 │ /**
12 │  * In SSR scenarios, a preload `<link>` element is generated for priority images.
13 │  * Having a large number of preload tags may negatively affect the performance,
14 │  * so we warn developers (by throwing an error) if the number of preloaded images
15 │  * is above a certain threshold. This const specifies this threshold.
16 │  */
17 ▶ export const DEFAULT_PRELOADED_IMAGES_LIMIT = 5;
18 │ 
19 │ /**
20 │  * Helps to keep track of priority images that already have a corresponding preload tag. Each key
21 │  * identifies the rewritten image URL and its CORS mode, since preload tags with different CORS
22 │  * modes are not interchangeable.
23 │  */
24 ▶ export const PRELOADED_IMAGES = new InjectionToken<Set<string>>(
25 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'NG_OPTIMIZED_PRELOADED_IMAGES' : '',
26 │   {
27 ▶     factory: () => new Set<string>(),
28 │   },
29 │ );
```

1. **524 行目：サーバーで、priority のときだけ**

   `ngServerMode` は angular-cli がサーバー用のバンドルで `true`、ブラウザ用で `false` と定義する値です（[ssr-platform-server](../platform/03-ssr-platform-server.md)）。ブラウザ用では 524〜533 行目ごと消えるので、`PreloadLinkCreator` はブラウザのバンドルに入りません（10cdf0afae5、2025-01 の「tree-shake `PreloadLinkCreator` for client bundles」でこの形にした）。渡すのは src・`updateSrcAndSrcset` が返した srcset（第 14 回）・sizes・`img` の `crossorigin` 属性です。
2. **59 行目・78〜82 行目：同じ「URL と CORS の形」は 1 つだけ**

   キーは `src:CORS の形`。`getCrossOriginMode`（106〜112 行目）は属性が無ければ `null`、`use-credentials` ならそれ、ほかの値（空の文字列も）は `anonymous` にまとめます。HTML の `crossorigin` 属性の読み方と同じです。覚える集合は `PRELOADED_IMAGES`（tokens.ts 24〜29 行目）で、27 行目の `factory` で root に 1 つの `Set` です。サーバーでは要求ごとにアプリ（と root のインジェクタ）を作るので、要求ごとに空から始まります。
3. **61〜76 行目：5 枚を超えたら 1 回だけ警告**

   上限は tokens.ts 17 行目の 5。超えても足すのはやめません（以前は例外だったのを cbbea70fa37 で 2025-04 に警告に変えた）。`ngDevMode` の中なので、本番のサーバーでは数えません。
4. **84〜102 行目：link を作って head の最後に足す**

   `as=image`・`href`・`rel=preload`・`fetchpriority=high`、あれば `crossorigin`、sizes と srcset は `imageSizes`・`imageSrcset`（HTML の属性名は大文字小文字を区別しないので、出力は `imagesizes`・`imagesrcset`）。ブラウザは HTML を読んだ時点で、この srcset と sizes から選んだ候補を取りに行きます。

d14696e4308（2026-07-22、fix(common): preserve crossorigin on image preloads）の前は、531 行目の引数が無く、キーは src だけ、link に `crossorigin` を付けませんでした。コミットの説明は「preload と画像の取りに行き方（認証情報を送るかどうか）を揃え、`crossorigin="anonymous"` の画像より先に、認証情報つきの要求が出ないようにする」です。同じ URL でも `crossorigin` の有無が違えば別の link になります（spec の 146〜178 行目）。tokens.ts の `PRELOADED_IMAGES` のコメント（20〜22 行目）もこのコミットで「URL と CORS の形」に書き直しています。

## 6. placeholder：背景に敷いて、読み込んだら外す

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L264–269 （▶ の行: 264, 267–269）

```ts
264 ▶     '[style.background-size]': 'placeholder ? "cover" : null',
265 │     '[style.background-position]': 'placeholder ? "50% 50%" : null',
266 │     '[style.background-repeat]': 'placeholder ? "no-repeat" : null',
267 ▶     '[style.background-image]': 'placeholder ? generatePlaceholder(placeholder) : null',
268 ▶     '[style.filter]':
269 ▶       'placeholder && shouldBlurPlaceholder(placeholderConfig) ? "blur(15px)" : null',
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L724–754 （▶ の行: 730–733, 735–736, 739–740, 742, 750–751, 753）

```ts
724 │   /**
725 │    * Returns an image url formatted for use with the CSS background-image property. Expects one of:
726 │    * * A base64 encoded image, which is wrapped and passed through.
727 │    * * A boolean. If true, calls the image loader to generate a small placeholder url.
728 │    */
729 │   protected generatePlaceholder(placeholderInput: string | boolean): string | boolean | null {
730 ▶     const {placeholderResolution} = this.config;
731 ▶     if (placeholderInput === true) {
732 ▶       return `url("${escapeCssUrl(
733 ▶         this.callImageLoader({
734 │           src: this.ngSrc,
735 ▶           width: placeholderResolution,
736 ▶           isPlaceholder: true,
737 │         }),
738 │       )}")`;
739 ▶     } else if (typeof placeholderInput === 'string') {
740 ▶       return `url("${escapeCssUrl(placeholderInput)}")`;
741 │     }
742 ▶     return null;
743 │   }
744 │ 
745 │   /**
746 │    * Determines if blur should be applied, based on an optional boolean
747 │    * property `blur` within the optional configuration object `placeholderConfig`.
748 │    */
749 │   protected shouldBlurPlaceholder(placeholderConfig?: ImagePlaceholderConfig): boolean {
750 ▶     if (!placeholderConfig || !Object.hasOwn(placeholderConfig, 'blur')) {
751 ▶       return true;
752 │     }
753 ▶     return Boolean(placeholderConfig.blur);
754 │   }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/url.ts` L50–62 （▶ の行: 54, 58, 60）

```ts
50 │ export function escapeCssUrl(input: string): string {
51 │   return (
52 │     input
53 │       // Backslash first — later replacements must not have their own \ escaped again.
54 ▶       .replace(/\\/g, '\\\\')
55 │       // \n, \r, \f and null terminate a CSS string (CSS Syntax 3 §4.3.5,
56 │       // https://www.w3.org/TR/css-syntax-3/#consume-string-token) and are also
57 │       // invalid in URLs, so stripping them is safe.
58 ▶       .replace(/[\n\r\f\0]/g, '')
59 │       // A bare " would close the url("...") wrapper early.
60 ▶       .replace(/"/g, '\\"')
61 │   );
62 │ }
```

1. **264〜269 行目：placeholder の間だけ背景のスタイル**

   ホストのスタイルのバインディングなので、`placeholder` が偽になった次の変更検知で、5 つとも `null` になって消えます。
2. **731〜738 行目：`true` ならローダーに小さな画像を頼む**

   幅は `IMAGE_CONFIG` の `placeholderResolution`（既定 30）、`isPlaceholder: true` を付けます。組み込みのローダーはこれを見て品質を下げます（[第 15 回](15-cmn-image-loaders.md)）。width と height があれば、高さも比から足されます（第 15 回の `callImageLoader`）。
3. **739〜740 行目：文字列ならその URL（`data:` の URL でもよい）**

   どちらも `url("…")` で包み、`escapeCssUrl` を通します。
4. **749〜754 行目：ぼかすかどうか**

   `placeholderConfig` が無いか、`blur` を持っていなければ `true`（`filter: blur(15px)`、269 行目）。`{blur: false}` のときだけぼかしません。

`escapeCssUrl` は 2026 年に 2 回直っています。b56e8651482（2026-05-25、fix(common): sanitize placeholder）の前は `` `url(${placeholderInput})` `` と引用符なしでそのまま埋めていたので、`placeholder` の値に `); color: red;` のような文字列を入れると、CSS の別の宣言を書き込めました。このコミットで `url("…")` の引用符と、`\` と `"` のエスケープを足しました（spec の it 2 つ）。3dd35c242ca（2026-05-31）は関数を url.ts に移し、CSS の文字列を終わらせてしまう改行などの 4 文字を 58 行目で取り除くようにしました。コミットの説明文は「16 進のエスケープにする」と書いていますが、入った 58 行目は**取り除く**形で、spec（`escapeCssUrl` の describe）も取り除く形を確かめています。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L756–777 （▶ の行: 757–758, 761–762, 765–766, 771–773, 776）

```ts
756 │   private removePlaceholderOnLoad(img: HTMLImageElement): void {
757 ▶     const callback = () => {
758 ▶       const changeDetectorRef = this.injector.get(ChangeDetectorRef);
759 │       removeLoadListenerFn();
760 │       removeErrorListenerFn();
761 ▶       this.placeholder = false;
762 ▶       changeDetectorRef.markForCheck();
763 │     };
764 │ 
765 ▶     const removeLoadListenerFn = this.renderer.listen(img, 'load', callback);
766 ▶     const removeErrorListenerFn = this.renderer.listen(img, 'error', callback);
767 │ 
768 │     // Clean up listeners once the view is destroyed, before the image
769 │     // loads or fails to load, to avoid element from being captured
770 │     // in memory and redundant change detection.
771 ▶     this.destroyRef.onDestroy(() => {
772 ▶       removeLoadListenerFn();
773 ▶       removeErrorListenerFn();
774 │     });
775 │ 
776 ▶     callOnLoadIfImageIsLoaded(img, callback);
777 │   }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1439–1453 （▶ の行: 1442–1444, 1450–1451）

```ts
1439 │ function callOnLoadIfImageIsLoaded(img: HTMLImageElement, callback: VoidFunction): void {
1440 │   // https://html.spec.whatwg.org/multipage/embedded-content.html#dom-img-complete
1441 │   // The spec defines that `complete` is truthy once its request state is fully available.
1442 ▶   // The image may already be available if it’s loaded from the browser cache.
1443 ▶   // In that case, the `load` event will not fire at all, meaning that all setup
1444 ▶   // callbacks listening for the `load` event will not be invoked.
1445 │   // In Safari, there is a known behavior where the `complete` property of an
1446 │   // `HTMLImageElement` may sometimes return `true` even when the image is not fully loaded.
1447 │   // Checking both `img.complete` and `img.naturalWidth` is the most reliable way to
1448 │   // determine if an image has been fully loaded, especially in browsers where the
1449 │   // `complete` property may return `true` prematurely.
1450 ▶   if (img.complete && img.naturalWidth) {
1451 ▶     callback();
1452 │   }
1453 │ }
```

1. **765〜766 行目：load でも error でも同じ関数**

   読み込みに失敗しても placeholder は外します。757〜763 行目で両方のリスナーを外し、`placeholder = false` にして `markForCheck`（[cd-onpush-markforcheck](../cd/04-cd-onpush-markforcheck.md)）。次の変更検知で 264〜269 行目のスタイルが消えます。
2. **771〜774 行目：先に destroy されたら外す（feb86e3fdeb）**

   読み込みの前にビューが壊されると、後から来た load で 758 行目の `injector.get(ChangeDetectorRef)` が壊れたビューに対して走り、エラーになっていました。feb86e3fdeb（2025-05-22）はここと、開発モードの 2 つの検査（読み込み後に縦横比と高さを見るリスナー）の 3 か所に同じ `destroyRef.onDestroy` を足し、spec に `should remove placeholder event listeners once view is removed` を足しました。
3. **776 行目 → 1450 行目：もう読み込まれていれば、すぐ呼ぶ**

   ブラウザのキャッシュから来た画像は `load` が来ないことがあるので、`complete` と `naturalWidth` の両方で「もう読み込み済み」を見ます（1445〜1449 行目のコメントは Safari の `complete` が早すぎる件）。`ngOnInit` がこの関数を呼ぶのは `setHostAttributes`（src を書く）より前なので（第 13 回）、ふつうはまだ src が無く、ここでは呼ばれません。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L886–900 （▶ の行: 891–892, 896）

```ts
886 │ /**
887 │  * Warns if a relative URL placeholder is specified, but no loader is present to provide the small
888 │  * image.
889 │  */
890 │ function assertNoRelativePlaceholderWithoutLoader(dir: NgOptimizedImage, imageLoader: ImageLoader) {
891 ▶   if (dir.placeholder === true && imageLoader === noopImageLoader) {
892 ▶     throw new RuntimeError(
893 │       RuntimeErrorCode.MISSING_NECESSARY_LOADER,
894 │       `${imgDirectiveDetails(dir.ngSrc)} the \`placeholder\` attribute is set to true but ` +
895 │         `no image loader is configured (i.e. the default one is being used), ` +
896 ▶         `which would result in the same image being used for the primary image and its placeholder. ` +
897 │         `To fix this, provide a loader or remove the \`placeholder\` attribute from the image.`,
898 │     );
899 │   }
900 │ }
```

891 行目：`placeholder`（値なし）と既定のローダーの組は、開発モードで例外です。`noopImageLoader` は幅を無視するので、placeholder も本物と同じ大きな画像になってしまうからです（896 行目）。

> **🧪 DEMO — placeholder の付いた本物の NgOptimizedImage の、読み込みの前と後**
>
> 「描く」を押すと、`<img ngSrc width="320" height="180" [placeholder] [placeholderConfig]>` を 1 つ持つ小さなコンポーネントを `createComponent` で作って下に描きます。`NgOptimizedImage` はこのサイトの本物（22.1.6）で、`IMAGE_LOADER` だけ、頼まれた大きさの SVG を `data:` の URL で返す関数に差し替えています（placeholder のときは紫の小さな SVG）。描いた直後に `img` の style を読み（前）、`ApplicationRef.attachView` で変更検知の対象にしてから、`load` を待ち、`whenStable()` の後にもう一度読みます（後）。「Renderer2 への呼び出し」は、その間に `img` に届いた呼び出しです（このサイトの本物の `RendererFactory2` を `domr-probe.ts` の記録係で包んだもの）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-image-lcp-preload)

見どころ：「前」には `background-image: url("svg(30×17)")`（幅 30 は `placeholderResolution`、高さ 17 は 320:180 の比から）と `filter: blur(15px)` があり、「後」は 5 つとも消えます。Renderer2 の表には、読み込みの後に `removeStyle` が並びます（ぼかしを止めていなければ 5 つ）。264〜269 行目のバインディングが `null` になった結果です。placeholder を付けずに `{blur: false}` だけにすると、開発ビルドでは「placeholderConfig だけ」の例外になります（`assertNoPlaceholderConfigWithoutPlaceholder`）。

> [!WARNING]
> **ハマりどころ**
>
> preload の DEMO はありません。524 行目の `ngServerMode` はビルドが決める定数で、このページ（ブラウザ用のバンドル）では偽に置き換わっていて、`PreloadLinkCreator` 自体がバンドルに入っていないからです。この形は spec が `globalThis['ngServerMode'] = true` を立てて確かめています（「テストと直し方」）。

## 7. ここまでを 1 本に

- 👤 `<img ngSrc="hero.jpg" width="800" height="600" priority placeholder>` — あなたのテンプレート
- `new NgOptimizedImage()` → `injector.get(LCPImageObserver)` — L401-402 — *開発モード*
- `ngOnInit()` — 第 13 回
  - `lcpObserver.registerImage(url, true)` — lcp\_image\_observer.ts L96 — *表に priority: true, count: 1*
  - `PreconnectLinkChecker.assertPreconnect(url, 'hero.jpg')` — preconnect\_link\_checker.ts L100 — *origin ごとに 1 回*
  - `removePlaceholderOnLoad(img)` — L756 — *load・error のリスナー*
  - `setHostAttributes()` — L486
    - `preloadLinkCreator.createPreloadLinkTag(…)` — L524-533 — *サーバーだけ*
- `host のスタイル` → `generatePlaceholder(true)` — L267 → L729 — *url("…?w=30") と blur(15px)*
- 👤 `画像が届く` — ブラウザ
  - `callback()` → `placeholder = false` → `markForCheck()` — L757-762
  - `PerformanceObserver` → 最後の LCP の候補の `src` で表を引く — lcp\_image\_observer.ts L65-90 — *priority なので何も出さない*

## テストと直し方

### spec と describe

| spec | describe / it | どこで走るか |
| --- | --- | --- |
| common/test/directives/ng\_optimized\_image\_spec.ts | describe `preload <link> element on a server`（40 行目）の中の `server`（41） | 53・109・147・183 行目の `if (!isBrowser) return;` でブラウザだけ（43 行目で `ngServerMode` を真にしてから描く） |
| describe `preconnect detector`（1523 行目）と `PRECONNECT_CHECK_BLOCKLIST token`（1660） | 警告を見る it は 1534・1575・1602 行目などの `if (!isBrowser) return;` でブラウザだけ |   |
| describe `placeholder attribute`（1151 行目）。`should remove placeholder event listeners once view is removed`（1305）・`should replace the placeholder with the actual image on load`（1326）など | 大半は Node でも走る（1225・1478 行目の分かれはブラウザだけ） |   |
| core/test/bundling/image-directive/e2e/ | `lcp-check-duplicate` など、LCP の警告の e2e（38749698d05 で足した） | 本物のブラウザを動かす e2e。この章では走らせていない |

📄 `angular/packages/common/test/directives/ng_optimized_image_spec.ts` L146–178 （▶ の行: 147, 154, 157, 163–164, 173–175）

```ts
146 │       it('should create separate preload links for images with different CORS modes', async () => {
147 ▶         if (!isBrowser) return;
148 │ 
149 │         const src = 'preload-cors/img.png';
150 │         const rewrittenSrc = `https://angular.dev/${src}`;
151 │ 
152 │         setupTestingModule({
153 │           extraProviders: [
154 ▶             {provide: PLATFORM_ID, useValue: PLATFORM_SERVER_ID},
155 │             {
156 │               provide: IMAGE_LOADER,
157 ▶               useValue: (config: ImageLoaderConfig) => `https://angular.dev/${config.src}`,
158 │             },
159 │           ],
160 │         });
161 │ 
162 │         const template = `
163 ▶           <img ngSrc="${src}" width="150" height="50" priority>
164 ▶           <img ngSrc="${src}" width="150" height="50" priority crossorigin="anonymous">
165 │         `;
166 │         TestBed.overrideComponent(TestComponent, {set: {template}});
167 │ 
168 │         const _document = TestBed.inject(DOCUMENT);
169 │         const fixture = TestBed.createComponent(TestComponent);
170 │         await fixture.whenStable();
171 │ 
172 │         const preloadLinks = _document.head.querySelectorAll(`link[href="${rewrittenSrc}"]`);
173 ▶         expect(preloadLinks.length).toEqual(2);
174 ▶         expect(preloadLinks[0]!.hasAttribute('crossorigin')).toBeFalse();
175 ▶         expect(preloadLinks[1]!.getAttribute('crossorigin')).toEqual('anonymous');
176 │ 
177 │         preloadLinks.forEach((link) => link.remove());
178 │       });
```

同じ src で `crossorigin` の有無だけが違う 2 枚から、link が 2 つでき（173 行目）、1 つ目には `crossorigin` が無く、2 つ目は `anonymous`（174〜175 行目）。5 節の 59 行目のキーと 90〜92 行目の確かめです。d14696e4308 で足した it です。

📄 `angular/packages/common/test/directives/ng_optimized_image_spec.ts` L1305–1337 （▶ の行: 1306–1307, 1315–1317, 1319, 1321–1323, 1333–1334, 1336）

```ts
1305 │     it('should remove placeholder event listeners once view is removed', async () => {
1306 ▶       const addEventListenerSpy = spyOn(HTMLImageElement.prototype, 'addEventListener');
1307 ▶       const removeEventListenerSpy = spyOn(HTMLImageElement.prototype, 'removeEventListener');
1308 │       setupTestingModule();
1309 │       const template =
1310 │         '<img ngSrc="path/img.png" width="400" height="300" placeholder="https://mysite.com/assets/my-image.png" />';
1311 │       const fixture = createTestComponent(template);
1312 │       await fixture.whenStable();
1313 │       // The `load` event listener is being set up twice: once in
1314 │       // `assertNoImageDistortion` and once in `removePlaceholderOnLoad`.
1315 ▶       expect(
1316 ▶         addEventListenerSpy.calls.all().filter((info) => info.args[0] === 'load').length,
1317 ▶       ).toEqual(2);
1318 │ 
1319 ▶       fixture.destroy();
1320 │ 
1321 ▶       expect(
1322 ▶         removeEventListenerSpy.calls.all().filter((info) => info.args[0] === 'load').length,
1323 ▶       ).toEqual(2);
1324 │     });
1325 │ 
1326 │     it('should replace the placeholder with the actual image on load', async () => {
1327 │       setupTestingModule();
1328 │       const template = '<img ngSrc="path/img.png" width="400" height="300" placeholder="true" />';
1329 │       const fixture = createTestComponent(template, ChangeDetectionStrategy.OnPush);
1330 │       await fixture.whenStable();
1331 │       const nativeElement = fixture.nativeElement as HTMLElement;
1332 │       const img = nativeElement.querySelector('img')!;
1333 ▶       expect(parseInlineStyles(img).has('background-image')).toBe(true);
1334 ▶       img.dispatchEvent(new Event('load'));
1335 │       await fixture.whenStable();
1336 ▶       expect(parseInlineStyles(img).has('background-image')).toBe(false);
1337 │     });
```

1305〜1324 行目：load のリスナーは 2 つ（縦横比の検査と placeholder）で、destroy で 2 つとも外れる（feb86e3fdeb）。1326〜1337 行目：`load` を自分で `dispatchEvent` して、背景の画像が消えるのを見ます。DEMO は本物の読み込みで同じことを見ています。

📄 `angular/packages/common/test/directives/ng_optimized_image_spec.ts` L1530–1553 （▶ の行: 1532, 1534, 1539, 1543, 1551）

```ts
1530 │     it(
1531 │       'should log a warning if there is no preconnect link for a priority image',
1532 ▶       withHead('', async () => {
1533 │         // The warning is only logged on the client
1534 ▶         if (!isBrowser) return;
1535 │ 
1536 │         setupTestingModule({imageLoader});
1537 │ 
1538 │         const consoleWarnSpy = spyOn(console, 'warn');
1539 ▶         const template = '<img ngSrc="a.png" width="100" height="50" priority>';
1540 │         const fixture = createTestComponent(template);
1541 │         await fixture.whenStable();
1542 │ 
1543 ▶         expect(consoleWarnSpy.calls.count()).toBe(1);
1544 │         expect(consoleWarnSpy.calls.argsFor(0)[0]).toBe(
1545 │           'NG02956: The NgOptimizedImage directive (activated on an <img> element ' +
1546 │             'with the `ngSrc="a.png"`) has detected that there is no preconnect tag ' +
1547 │             'present for this image. Preconnecting to the origin(s) that serve ' +
1548 │             'priority images ensures that these images are delivered as soon as ' +
1549 │             'possible. To fix this, please add the following element into the <head> ' +
1550 │             'of the document:' +
1551 ▶             '\n  <link rel="preconnect" href="https://angular.dev">',
1552 │         );
1553 │       }),
```

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=Image directive (preload <link> element on a server|preconnect detector|placeholder attribute)"

# preload と preconnect の it は中身がブラウザだけ。こちらで中身まで走る（--filter は効かないので全部）
pnpm bazel test //packages/common/test:test_web_chromium --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/cmn-logs/e-lcp.log・e-web.log）`

```
Ran 37 of 667 specs
37 specs, 0 failures
Finished in 0.112 seconds
//packages/common/test:test                                              PASSED in 0.8s

Chromium: 1/1 test files | 676 passed, 2 failed
//packages/common/test:test_web_chromium                                 FAILED in 5.8s
```

- Node の 37 件には、preload と preconnect の it のうち `if (!isBrowser) return;` で中身を飛ばしたものも「成功」として入っています。
- ブラウザ（Chromium）では common の spec を全部走らせ、この章の spec は失敗に入っていません。ログには `preloadbrowser1/img.png` などについての NG02956（preconnect が無い）の警告が出ていて、preconnect の it の中身が走ったことが分かります。失敗 2 件は DatePipe と formatDate の日付のずれ（[第 13 回](13-cmn-image-overview.md)）です。

### 直すとしたら

- LCP の表は `lcp_image_observer.ts` の `registerImage`・`unregisterImage`・`updateImage`、preconnect は `assertPreconnect`、preload は `createPreloadLinkTag`、placeholder は `generatePlaceholder`・`removePlaceholderOnLoad` です。
- spec は、preload なら describe `server` の形（`globalThis['ngServerMode'] = true` と `PLATFORM_SERVER_ID` で描き、head の link を読む）、placeholder なら describe `placeholder attribute` の形（`parseInlineStyles` でスタイルを読む）、LCP の表は本物の LCP が要るので e2e です。
- 1 節と 3 節の「priority の画像は destroy で表から消さない（405 行目）」は、同じ URL を後から priority なしで描いたときに表が priority のまま残る、という形で表に出ます。ページを開いたときの LCP しか見ない（2 節の注）ので今は困らない作りですが、#71812 のようにソフトナビゲーションの後も見るようになると、この非対称が効いてきます。issue を読むときの手がかりにします。
- open の issue：#71812（ソフトナビゲーションの後の LCP）、#57196（Base64 の placeholder が入力を変えても残る）、#56594（`picture` 要素）、#55762（`data:`・`blob:` を拒む理由を書いて、または戻して）。[第 20 回](20-cmn-issues.md)で読み方を扱います。
- 本家に PR を出すことは勧めません。手元で spec を走らせ、DEMO で placeholder の前と後を見て、issue の報告と同じ順で動いているかを確かめるところまでにします。

## 聞かれそうな質問

**Q. 「LCP の画像なのに priority が無い」のエラーは本番でも出ますか？**

出ません。ディレクティブは 401 行目の `ngDevMode` の中でしか `LCPImageObserver` を取り出さず、取り出したら 50 行目の `assertDevMode` が本番では例外にします。本番のバンドルにはクラス自体が入りません。

**Q. 同じ画像を大きく 1 枚（priority）と小さく 1 枚（priority なし）出したら、エラーになりますか？**

今はなりません。103 行目の `||` で、同じ URL の表の状態は priority のままです。38749698d05 の前は、後から登録した小さい方が状態を上書きして、間違ったエラーが出ていました（issue #53278）。

**Q. preconnect を head に後から JavaScript で足したのに、警告が消えません。**

113 行目の `??=` で、head の preconnect は最初の priority の画像のときに 1 回だけ探して覚えるからです。index.html に最初から書きます。開発中だけ消したいなら `PRECONNECT_CHECK_BLOCKLIST` に origin を入れます。

**Q. preload の link はブラウザで描いたときにも足されますか？**

足されません。524 行目の条件は `ngServerMode` が真のときだけで、ブラウザ用のバンドルでは偽です。サーバーで描いた HTML の head に入り、ブラウザはそれを HTML を読む時点で見つけます。

**Q. placeholder が消えないことはありますか？**

読み込みに失敗しても 766 行目の `error` で外すので、ふつうはありません。`loading="lazy"` の画像が画面の外にあって読み込みが始まらない間は、placeholder のままです（それが目的）。`placeholder` の値を後から変えた場合の issue #57196 は open です。

## 読み終えて

- `LCPImageObserver` と `PreconnectLinkChecker` は開発モードだけの root のサービス。本番のバンドルには入らない。
- LCP の表は絶対 URL がキー。同じ URL は「どれか 1 つでも priority」と枚数で持つ（38749698d05）。見るのはページを開いたときの LCP だけ。
- preconnect の確かめは origin ごとに 1 回、head を探すのはアプリの中で 1 回だけ。
- `PreloadLinkCreator` はサーバーで priority の画像だけ。キーは「URL と CORS の形」で、`crossorigin` を link にも写す（d14696e4308）。
- placeholder はホストのスタイルで背景とぼかしを付け、load か error で外す。値は `url("…")` に入れてエスケープする（b56e8651482・3dd35c242ca）。

---

← 前: [IMAGE\_LOADER と組み込みのローダー：URL を作る関数](15-cmn-image-loaders.md)  
次: [Location：URL を正規化して読み書きする](17-cmn-location.md) →
