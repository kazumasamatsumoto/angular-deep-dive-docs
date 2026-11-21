[目次](../README.md) › [common の説明文の読み残し](README.md) › 第 2 回 / 全 9 回

# 画像のローダーと速さの小道具の説明文

> image\_loaders/\*（cloudflare・cloudinary・imagekit・imgix・netlify・image\_loader）、preconnect\_link\_checker.ts・preload-link-creator.ts・lcp\_image\_observer.ts の未読の行：path の形の例と例外の文（Cloudflare の例は画像の URL の形）、本物のローダーでできる URL（Imgix は src の ? を捨てる）、preload と LCP の説明の食い違い。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-image-loaders)

---

組み込みの 5 つのローダー（`provideCloudflareLoader`・`provideCloudinaryLoader`・`provideImageKitLoader`・`provideImgixLoader`・`provideNetlifyLoader`）は、説明文に「path はこの形で」と例を書いています。この章は、その例を本物のローダーに渡してできる URL を表にし、間違えたときの例外の文と、速さの小道具（preconnect の検査・preload の link・LCP の見張り役）の説明文の残りを読みます。説明と違う所が 4 つ見つかりました（Cloudflare の例外の文、Imgix が src の `?` を捨てること、preload の `src` の説明、LCP の文の `ngSrc=`）。

読む対象は `packages/common/src/directives/ng_optimized_image/` の `image_loaders/*`・`preconnect_link_checker.ts`・`preload-link-creator.ts`・`lcp_image_observer.ts`（../angular、8576f161ae4）です。5 つのローダーが URL を組み立てる行と `createImageLoader` は[画像のローダーの章](../cmn/15-cmn-image-loaders.md)、preconnect・preload・LCP の処理は[LCP と preload の章](../cmn/16-cmn-image-lcp-preload.md)で読みました。ここでは説明文と、まだ引いていない行だけを読みます。

1. [1. NgOptimizedImage](01-cmd-image.md)
2. **2. 画像のローダー**（この章）
3. [3. 日付の書式](03-cmd-date.md)
4. [4. 数と i18n の pipe](04-cmd-number.md)
5. [5. 構造ディレクティブ](05-cmd-structural.md)
6. [6. NgClass・NgStyle と outlet](06-cmd-attr-outlets.md)
7. [7. AsyncPipe と小さな pipe](07-cmd-pipes.md)
8. [8. Location](08-cmd-location.md)
9. [9. spec と issue](09-cmd-tests-issues.md)

## 1. 説明文が書く path の形

5 つとも、使い方は `providers: [provideImgixLoader('https://somepath.imgix.net')]` の形です。渡した path を `createImageLoader` が確かめ、`{provide: IMAGE_LOADER, useValue: 関数}` の配列を返します（画像のローダーの章の 2 節）。下の DEMO は、この配列の `useValue` の関数を直接呼びます。

### Cloudflare

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/cloudflare_loader.ts` L9–25 （▶ の行: 15, 17–18, 20）

```ts
 9 │ import {Provider} from '@angular/core';
10 │ import {PLACEHOLDER_QUALITY} from './constants';
11 │ import {createImageLoader, ImageLoaderConfig} from './image_loader';
12 │ import {normalizeLoaderTransform} from './normalized_options';
13 │ 
14 │ /**
15 ▶  * Function that generates an ImageLoader for [Cloudflare Image
16 │  * Resizing](https://developers.cloudflare.com/images/image-resizing/) and turns it into an Angular
17 ▶  * provider. Note: Cloudflare has multiple image products - this provider is specifically for
18 ▶  * Cloudflare Image Resizing; it will not work with Cloudflare Images or Cloudflare Polish.
19 │  *
20 ▶  * @param path Your domain name, e.g. https://mysite.com
21 │  * @returns Provider that provides an ImageLoader function
22 │  *
23 │  * @see [Image Optimization Guide](guide/image-optimization)
24 │  * @publicApi
25 │  */
```

20 行目の path は「ドメイン名」で、例は `https://mysite.com` です。17〜18 行目のとおり、Cloudflare の製品のうち Image Resizing だけに使えます。URL は `{path}/cdn-cgi/image/{params}/{src}` になります（DEMO の cf-1〜4）。5 つのうち Cloudflare だけは `ImageLoaderInfo`（名前と URL を見分ける関数）を持たないので、「Cloudflare の URL なのにローダーを使っていない」の警告はありません（画像のローダーの章の 6 節の `BUILT_IN_LOADERS` に入っていない）。

### ImageKit と Imgix

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/imagekit_loader.ts` L14–45 （▶ の行: 17–19, 22, 27, 33, 35–36, 44）

```ts
14 │ /**
15 │  * Name and URL tester for ImageKit.
16 │  */
17 ▶ export const imageKitLoaderInfo: ImageLoaderInfo = {
18 ▶   name: 'ImageKit',
19 ▶   testUrl: isImageKitUrl,
20 │ };
21 │ 
22 ▶ const IMAGE_KIT_LOADER_REGEX = /https?\:\/\/[^\/]+\.imagekit\.io\/.+/;
23 │ /**
24 │  * Tests whether a URL is from ImageKit CDN.
25 │  */
26 │ function isImageKitUrl(url: string): boolean {
27 ▶   return IMAGE_KIT_LOADER_REGEX.test(url);
28 │ }
29 │ 
30 │ /**
31 │  * Function that generates an ImageLoader for ImageKit and turns it into an Angular provider.
32 │  *
33 ▶  * @param path Base URL of your ImageKit images
34 │  * This URL should match one of the following formats:
35 ▶  * https://ik.imagekit.io/myaccount
36 ▶  * https://subdomain.mysite.com
37 │  * @returns Set of providers to configure the ImageKit loader.
38 │  *
39 │  * @see [Image Optimization Guide](guide/image-optimization)
40 │  * @publicApi
41 │  */
42 │ export const provideImageKitLoader: (path: string) => Provider[] = createImageLoader(
43 │   createImagekitUrl,
44 ▶   ngDevMode ? ['https://ik.imagekit.io/mysite', 'https://subdomain.mysite.com'] : undefined,
45 │ );
```

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/imgix_loader.ts` L14–43 （▶ の行: 17–18, 22, 33–34, 42）

```ts
14 │ /**
15 │  * Name and URL tester for Imgix.
16 │  */
17 ▶ export const imgixLoaderInfo: ImageLoaderInfo = {
18 ▶   name: 'Imgix',
19 │   testUrl: isImgixUrl,
20 │ };
21 │ 
22 ▶ const IMGIX_LOADER_REGEX = /https?\:\/\/[^\/]+\.imgix\.net\/.+/;
23 │ /**
24 │  * Tests whether a URL is from Imgix CDN.
25 │  */
26 │ function isImgixUrl(url: string): boolean {
27 │   return IMGIX_LOADER_REGEX.test(url);
28 │ }
29 │ 
30 │ /**
31 │  * Function that generates an ImageLoader for Imgix and turns it into an Angular provider.
32 │  *
33 ▶  * @param path path to the desired Imgix origin,
34 ▶  * e.g. https://somepath.imgix.net or https://images.mysite.com
35 │  * @returns Set of providers to configure the Imgix loader.
36 │  *
37 │  * @see [Image Optimization Guide](guide/image-optimization)
38 │  * @publicApi
39 │  */
40 │ export const provideImgixLoader: (path: string) => Provider[] = createImageLoader(
41 │   createImgixUrl,
42 ▶   ngDevMode ? ['https://somepath.imgix.net/'] : undefined,
43 │ );
```

17〜20 行目の `imageKitLoaderInfo`・`imgixLoaderInfo` は、ローダーを使っていないときの警告のための名前と正規表現です。22 行目の正規表現は「ホスト名が `.imagekit.io`（`.imgix.net`）で終わり、その後ろに 1 文字以上のパスがある」です。説明文の path の例と、44・42 行目の例外の文に入る例（`exampleUrls`）は少しずつ違います。

| ローダー | 説明文の path の例 | 例外の文に入る例 |
| --- | --- | --- |
| ImageKit | 35〜36 行目 `https://ik.imagekit.io/myaccount`・`https://subdomain.mysite.com` | 44 行目 `…/mysite`・`https://subdomain.mysite.com` |
| Imgix | 34 行目 `https://somepath.imgix.net` または `https://images.mysite.com` | 42 行目 `https://somepath.imgix.net/` の 1 つだけ |
| Cloudflare | 20 行目 `https://mysite.com` | `https://<ZONE>/cdn-cgi/image/<OPTIONS>/<SOURCE-IMAGE>`（cloudflare\_loader.ts の `exampleUrls`。画像のローダーの章の引用、DEMO の cf-5） |

Cloudflare の例外の文は、path の形ではなく**できあがる画像の URL**の形を見せます。この文のとおりに `https://mysite.com/cdn-cgi/image/…` を path に渡すと、`/cdn-cgi/image/` が 2 回入った URL になります。この形は 59ea528f8e4（2022-06、「simplify URL construction in image loaders」）からで、その後のコミットは書式と型だけです（`git log -L26,29:…/cloudflare_loader.ts`）。

### Netlify

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/netlify_loader.ts` L9–47 （▶ の行: 29, 32–34, 43）

```ts
 9 │ import {
10 │   Provider,
11 │   ɵformatRuntimeError as formatRuntimeError,
12 │   ɵRuntimeError as RuntimeError,
13 │ } from '@angular/core';
14 │ 
15 │ import {RuntimeErrorCode} from '../../../errors';
16 │ import {isAbsoluteUrl, isValidPath} from '../url';
17 │ 
18 │ import {IMAGE_LOADER, ImageLoaderConfig, ImageLoaderInfo} from './image_loader';
19 │ import {PLACEHOLDER_QUALITY} from './constants';
20 │ 
21 │ /**
22 │  * Name and URL tester for Netlify.
23 │  */
24 │ export const netlifyLoaderInfo: ImageLoaderInfo = {
25 │   name: 'Netlify',
26 │   testUrl: isNetlifyUrl,
27 │ };
28 │ 
29 ▶ const NETLIFY_LOADER_REGEX = /https?\:\/\/[^\/]+\.netlify\.app\/.+/;
30 │ 
31 │ /**
32 ▶  * Tests whether a URL is from a Netlify site. This won't catch sites with a custom domain,
33 ▶  * but it's a good start for sites in development. This is only used to warn users who haven't
34 ▶  * configured an image loader.
35 │  */
36 │ function isNetlifyUrl(url: string): boolean {
37 │   return NETLIFY_LOADER_REGEX.test(url);
38 │ }
39 │ 
40 │ /**
41 │  * Function that generates an ImageLoader for Netlify and turns it into an Angular provider.
42 │  *
43 ▶  * @param path optional URL of the desired Netlify site. Defaults to the current site.
44 │  * @returns Set of providers to configure the Netlify loader.
45 │  *
46 │  * @publicApi
47 │  */
```

43 行目のとおり path は省けて、省くと「今のサイト」です。実装は `https://a/` という仮の origin で URL を組み立て、最後に origin を外して `/.netlify/images?url=%2Fhero.jpg` の相対 URL を返します（DEMO の nf-1、画像のローダーの章の 4 節）。32〜34 行目のコメントのとおり、29 行目の正規表現は `*.netlify.app` しか見ないので、独自ドメインのサイトでは「Netlify のローダーを使っていない」の警告が出ません。

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/constants.ts` L9–12 （▶ の行: 10, 12）

```ts
 9 │ /**
10 ▶  * Value (out of 100) of the requested quality for placeholder images.
11 │  */
12 ▶ export const PLACEHOLDER_QUALITY = '20';
```

placeholder を頼まれたとき（`isPlaceholder: true`）の品質 `'20'` です。Cloudflare は `quality=20`、ImageKit は `q-20`、Imgix と Netlify は `q=20` にします（DEMO の cf-3・ik-3・ix-3・nf-3）。Cloudinary だけはこの定数を使わず `q_auto:low` です（cl-3）。

## 2. 例外の文：開発と本番で違う

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/image_loader.ts` L123–146 （▶ の行: 124, 126–129, 135, 138–140, 143）

```ts
123 │ 
124 ▶ function throwInvalidPathError(path: unknown, exampleUrls: string[]): never {
125 │   throw new RuntimeError(
126 ▶     RuntimeErrorCode.INVALID_LOADER_ARGUMENTS,
127 ▶     ngDevMode &&
128 ▶       `Image loader has detected an invalid path (\`${path}\`). ` +
129 ▶         `To fix this, supply a path using one of the following formats: ${exampleUrls.join(
130 │           ' or ',
131 │         )}`,
132 │   );
133 │ }
134 │ 
135 ▶ function throwUnexpectedAbsoluteUrlError(path: string, url: string): never {
136 │   throw new RuntimeError(
137 │     RuntimeErrorCode.INVALID_LOADER_ARGUMENTS,
138 ▶     ngDevMode &&
139 ▶       `Image loader has detected a \`<img>\` tag with an invalid \`ngSrc\` attribute: ${url}. ` +
140 ▶         `This image loader expects \`ngSrc\` to be a relative URL - ` +
141 │         `however the provided value is an absolute URL. ` +
142 │         `To fix this, provide \`ngSrc\` as a path relative to the base URL ` +
143 ▶         `configured for this loader (\`${path}\`).`,
144 │   );
145 │ }
146 │ 
```

1. **path が URL でない（124〜133 行目）**

   `https://` の無い `mysite.com` は `new URL()` が投げるので invalid です。129〜131 行目で `exampleUrls` を `or` でつなぎます。
2. **ngSrc が絶対 URL（135〜145 行目）**

   Netlify 以外の 4 つは、ngSrc に `https://other.example/hero.jpg` を渡すと投げます（DEMO の ix-5）。Netlify は絶対 URL を `url=` にそのまま入れます（nf-5）。
3. **本番では文が消える（127・138 行目）**

   `ngDevMode && …` なので、本番ビルドでは文の代わりに `false` が入り、`RuntimeError` の message は `NG02959` だけになります。DEMO のこのページの列（本番ビルド）でそう出ます。`exampleUrls` も各ローダーの `ngDevMode ? [...] : undefined` で本番では作られません。

## 3. DEMO：説明文の path でできる URL

> **🧪 DEMO — 5 つの本物のローダーに、説明文の path と config を渡す**
>
> 各行で `provideXxxLoader(path)` を呼び、返った配列の `useValue` の関数に config を渡します。どちらもこのサイトの本物（`@angular/common` 22.2.6）です。できた URL は表に出すだけで、読み込みません。config の形は、ディレクティブが渡す形（`src` だけ・`width` と `height`・`isPlaceholder`・`loaderParams`）です。「開発モード（記録）」は同じファイルを Node で開発モードのまま走らせた記録の再生です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-image-loaders)

見どころは 3 つです。ix-4 の `hero.jpg?crop=faces` は、`?crop=faces` が消えて `?auto=format&w=400` だけになります。Imgix のローダーは `new URL(path/src)` を作ったあと `url.search` を自分の params で丸ごと置き換えるからです（`createImgixUrl` の最後の 2 行。画像のローダーの章の 4 節）。Cloudflare と Cloudinary は src を文字のままつなぐので `?` は残ります。ik-4 の空白と `é` は ImageKit が `new URL` を通すので `%20`・`%C3%A9` になり、Cloudflare・Cloudinary では元の文字のままです。nf-4 の `transform` は Netlify では使えない引数で、開発モードだけ `console.warn` が出ます。

## 4. 速さの小道具の説明文

### PreconnectLinkChecker

📄 `angular/packages/common/src/directives/ng_optimized_image/preconnect_link_checker.ts` L48–55 （▶ の行: 50–51, 53–54）

```ts
48 │ 
49 │ /**
50 ▶  * Contains the logic to detect whether an image, marked with the "priority" attribute
51 ▶  * has a corresponding `<link rel="preconnect">` tag in the `document.head`.
52 │  *
53 ▶  * Note: this is a dev-mode only class, which should not appear in prod bundles,
54 ▶  * thus there is no `ngDevMode` use in the code.
55 │  */
```

📄 `angular/packages/common/src/directives/ng_optimized_image/preconnect_link_checker.ts` L92–99 （▶ の行: 97–98）

```ts
92 │ 
93 │   /**
94 │    * Checks that a preconnect resource hint exists in the head for the
95 │    * given src.
96 │    *
97 ▶    * @param rewrittenSrc src formatted with loader
98 ▶    * @param originalNgSrc ngSrc value
99 │    */
```

📄 `angular/packages/common/src/directives/ng_optimized_image/preconnect_link_checker.ts` L138–153 （▶ の行: 140–141, 149, 151）

```ts
138 │ 
139 │   ngOnDestroy() {
140 ▶     this.preconnectLinks?.clear();
141 ▶     this.alreadySeen.clear();
142 │   }
143 │ }
144 │ 
145 │ /**
146 │  * Invokes a callback for each element in the array. Also invokes a callback
147 │  * recursively for each nested array.
148 │  */
149 ▶ function deepForEach<T>(input: (T | any[])[], fn: (value: T) => void): void {
150 │   for (let value of input) {
151 ▶     Array.isArray(value) ? deepForEach(value, fn) : fn(value);
152 │   }
153 │ }
```

53〜54 行目は「開発モードだけのクラスなので、中で `ngDevMode` を見ない」です。ディレクティブが `ngDevMode` の中でしか `inject` しないので、本番のバンドルからは木の揺さぶり（使われないコードを消す処理）で消えます（[前の章](01-cmd-image.md)の 7 節の `assertDevMode` が安全装置）。97〜98 行目の 2 つの引数は、ローダーを通した URL と元の `ngSrc` です。調べるのは前者の origin、文に出すのは後者です。149〜152 行目の `deepForEach` は、`PRECONNECT_CHECK_BLOCKLIST` の値が入れ子の配列でも平らに読むためのものです（`multi: true` で複数の provider から配列が集まると入れ子になる）。140〜141 行目は、アプリを壊すときに覚えた集合を空にします。

### PreloadLinkCreator

📄 `angular/packages/common/src/directives/ng_optimized_image/preload-link-creator.ts` L21–51 （▶ の行: 26–27, 36–37, 39–40, 47–48）

```ts
21 │ /**
22 │  * @description Contains the logic needed to track and add preload link tags to the `<head>` tag. It
23 │  * will also track what images have already had preload link tags added so as to not duplicate link
24 │  * tags.
25 │  *
26 ▶  * In dev mode this service will validate that the number of preloaded images does not exceed the
27 ▶  * configured default preloaded images limit: {@link DEFAULT_PRELOADED_IMAGES_LIMIT}.
28 │  */
29 │ @Service()
30 │ export class PreloadLinkCreator {
31 │   private readonly preloadedImages = inject(PRELOADED_IMAGES);
32 │   private readonly document = inject(DOCUMENT);
33 │   private errorShown = false;
34 │ 
35 │   /**
36 ▶    * @description Add a preload `<link>` to the `<head>` of the `index.html` that is served from the
37 ▶    * server while using Angular Universal and SSR to kick off image loads for high priority images.
38 │    *
39 ▶    * The `sizes` (passed in from the user) and `srcset` (parsed and formatted from `ngSrcset`)
40 ▶    * properties used to set the corresponding attributes, `imagesizes` and `imagesrcset`
41 │    * respectively, on the preload `<link>` tag so that the correctly sized image is preloaded from
42 │    * the CDN.
43 │    *
44 │    * {@link https://web.dev/preload-responsive-images/#imagesrcset-and-imagesizes}
45 │    *
46 │    * @param renderer The `Renderer2` passed in from the directive
47 ▶    * @param src The original src of the image that is set on the `ngSrc` input.
48 ▶    * @param srcset The parsed and formatted srcset created from the `ngSrcset` input
49 │    * @param sizes The value of the `sizes` attribute passed in to the `<img>` tag
50 │    * @param crossOrigin The value of the `crossorigin` attribute passed in to the `<img>` tag
51 │    */
```

| 行 | 説明 | 実際 |
| --- | --- | --- |
| 36〜37 | 「Angular Universal と SSR で」 | Angular Universal は v17 で `@angular/ssr` に移った前の名前です。動きは「`ngServerMode` が真のとき」（LCP と preload の章の 5 節） |
| 47 | `src` は「`ngSrc` に設定した元の src」 | ディレクティブはローダーを通した URL（`getRewrittenSrc()`）を渡します。preload の `href` もその URL で、元の `ngSrc` ではありません |
| 39・48 | `srcset` は「`ngSrcset` から作ったもの」 | `ngSrcset` が無くても、自動で作った srcset（sizes から・密度から）が渡ります |
| 26〜27 | 開発モードで、preload の数が上限を超えないか「確かめる」 | 上限 5（tokens.ts の `DEFAULT_PRELOADED_IMAGES_LIMIT`）を超えると `console.warn`（LCP と preload の章の 5 節）。tokens.ts の説明は「by throwing an error」と書きますが、投げません |

47 行目の文は、サーバーで preload の link を足す機能を入れた 75e6297f090（2022-09、#47343）から変わっていません（`git log -L47,47`）。tokens.ts の「by throwing an error」も同じコミットの文です。

### LCPImageObserver

📄 `angular/packages/common/src/directives/ng_optimized_image/lcp_image_observer.ts` L170–177 （▶ の行: 172–174）

```ts
170 │ 
171 │   ngOnDestroy() {
172 ▶     if (!this.observer) return;
173 ▶     this.observer.disconnect();
174 ▶     this.images.clear();
175 │   }
176 │ }
177 │ 
```

📄 `angular/packages/common/src/directives/ng_optimized_image/lcp_image_observer.ts` L190–202 （▶ の行: 191–192, 196–198）

```ts
190 │ 
191 ▶ function logModifiedWarning(ngSrc: string) {
192 ▶   const directiveDetails = imgDirectiveDetails(ngSrc);
193 │   console.warn(
194 │     formatRuntimeError(
195 │       RuntimeErrorCode.LCP_IMG_NGSRC_MODIFIED,
196 ▶       `${directiveDetails} this image is the Largest Contentful Paint (LCP) ` +
197 ▶         `element and has had its "ngSrc" attribute modified. This can cause ` +
198 ▶         `slower loading performance. It is recommended not to modify the "ngSrc" ` +
199 │         `property on any image which could be the LCP element.`,
200 │     ),
201 │   );
202 │ }
```

191 行目の引数の名前は `ngSrc` で、192 行目でそのまま `imgDirectiveDetails` に渡し、文は `ngSrc="…"` になります。呼ぶ側（`initPerformanceObserver` の中、LCP と preload の章の 2 節）が渡すのは、LCP の要素の `src`、つまりローダーを通した URL です。ローダーを使うアプリでは、文の `ngSrc="…"` にテンプレートに書いた値ではなく CDN の URL が出ます。同じ章で引いた `logMissingPriorityError` も同じ形です。172〜174 行目は、アプリを壊すときに `PerformanceObserver` を外し、表を空にします。

> [!NOTE]
> **ポイント**
>
> LCP の見張り役は `PerformanceObserver` の `largest-contentful-paint` を使うので、Node（domino）では作られず（`observer` が null）、本番ビルドのこのページにもありません。だから 196〜199 行目の文はこの章では記録できず、行を読んだ説明にとどめます。

## 5. ここまでを 1 本に

- 👤 `providers: [provideImgixLoader('https://somepath.imgix.net')]` — あなたの app.config.ts
  - `provideImageLoader(path)` — image\_loader.ts L97 — *path が URL でなければ L124 の文（本番は NG02959 だけ）*
  - `[{provide: IMAGE_LOADER, useValue: loaderFn}]` — L119
- 👤 `<img ngSrc="hero.jpg?crop=faces" width="400" height="300">` — あなたのテンプレート
  - `loaderFn({src, width, height})` — image\_loader.ts L106 — *絶対 URL なら L135 の文*
    - `createImgixUrl(path, config)` — imgix\_loader.ts — *url.search を置き換え → ?crop=faces が消える*
  - `PreloadLinkCreator.createPreloadLinkTag(renderer, rewrittenSrc, …)` — preload-link-creator.ts L52 — *サーバーだけ。47 行目の説明と違い、ローダーを通した URL*
  - `logModifiedWarning(imgSrc)` — lcp\_image\_observer.ts L191 — *開発だけ。文の ngSrc= に URL が入る*

## テストと直し方

| spec | describe / it |
| --- | --- |
| common/test/image\_loaders/image\_loader\_spec.ts | describe `Built-in image directive loaders`（35 行目）の下に 5 つのローダーと `loader utils`（496 行目）。Cloudinary（140）と ImageKit（248）だけが should throw if the path is invalid（175・324）を持ち、Imgix（36）・Cloudflare（347）にはありません。Netlify（431）は should construct an image with an absolute URL（461）・should warn if an unknown loader parameter is provided（470）・should not load a low quality image when a placeholder is requested with a quality param（488） |

📄 `手元で走らせたコマンド` L1–3

```
1 │ cd ~/angular-research/angular
2 │ pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
3 │   "--test_arg=--filter=^Built-in image directive loaders"
```

📄 `結果（2026-11-21）` L1–4

```
1 │ Ran 53 of 667 specs
2 │ 53 specs, 0 failures
3 │ Finished in 0.034 seconds
4 │ //packages/common/test:test                                              PASSED in 0.8s
```

53 件すべて成功です。例外の文の中身（`exampleUrls`）を確かめる it は 175・324 行目の 2 つで、どちらも spec の中の `invalidPathError` で例の並びまで丸ごと比べます。Cloudflare と Imgix にはこの it が無いので、Cloudflare の `<ZONE>` の文を固めている it はありません。src に `?` を含む Imgix の it もありません。

直すとしたら、Cloudflare は cloudflare\_loader.ts の `exampleUrls`（`https://<ZONE>/…`）を path の形（`https://mysite.com`）にし、spec の Cloudflare の describe に「invalid path の文に例の path が入る」it を足します。Imgix の `?` は `createImgixUrl` で `url.search = …` を `searchParams.set` に変えるかどうかの判断で、利用者の query と `w` などがぶつかったときの決まりが要ります（今は黙って捨てる）。preload-link-creator.ts の 47 行目と lcp\_image\_observer.ts の 191 行目は、説明（引数の名前）だけの変更です。

## 聞かれそうな質問

**Q. provideCloudflareLoader に何を渡せばいいですか？例外の文の形で渡したら URL が壊れました。**

20 行目のとおりドメイン名（`https://mysite.com`）です。例外の文が見せる `https://<ZONE>/cdn-cgi/image/…` はできあがる画像の URL の形で、これを path に渡すと `/cdn-cgi/image/` が二重になります（DEMO の cf-5 と 1 節）。

**Q. 本番でローダーの例外が NG02959 だけなのはなぜ？**

127・138 行目の `ngDevMode && …` で、本番では文が `false` になるからです。文を見たいときは開発ビルドで同じ path を試します。

**Q. Imgix で ngSrc に ?crop=faces を付けたのに効きません。**

Imgix のローダーは `url.search` を自分の params（`auto=format`・`w`・`h`・`q`・transform）で置き換えるので、src の query は消えます（DEMO の ix-4）。Imgix の引数は `loaderParams.transform` で渡します。

**Q. preconnect の警告を消すには？**

`PRECONNECT_CHECK_BLOCKLIST` に origin を入れます。値は文字列でも配列でも入れ子の配列でもよく、149〜152 行目の `deepForEach` が平らにして hostname だけを覚えます。localhost などは最初から外れています。

**Q. LCP の警告の ngSrc= に CDN の URL が出ます。テンプレートのどの img ですか？**

191〜192 行目の引数はローダーを通した URL なので、その URL を作る ngSrc の img です。ローダーの規則（src をどう URL にするか）を逆にたどって探します。

## 読み終えて

- 5 つのローダーの path は「https:// から始まる URL」。省けるのは Netlify だけです。
- Cloudflare の例外の文の例は path ではなく画像の URL の形で、説明文の 20 行目と食い違います。
- Imgix は ngSrc の `?` 以降を捨てます。ほかの 4 つは残します。
- preload の説明の `src` は「元の ngSrc」ではなくローダーを通した URL、LCP の文の `ngSrc=` にも URL が入ります。
- 例外の文も警告も開発モードだけで、本番の例外は `NG02959` の番号だけです。

---

← 前: [NgOptimizedImage の説明文：入力と検査の約束](01-cmd-image.md)  
次: [日付の書式の説明文：DatePipe と formatDate](03-cmd-date.md) →
