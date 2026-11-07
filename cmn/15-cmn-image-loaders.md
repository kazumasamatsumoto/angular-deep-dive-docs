[目次](../README.md) › [common の内側](README.md) › 第 15 回 / 全 20 回

# IMAGE\_LOADER と組み込みのローダー：URL を作る関数

> IMAGE\_LOADER の既定（noopImageLoader）と ImageLoaderConfig（src・width・height・isPlaceholder・loaderParams）、createImageLoader が path を確かめて provider を作る行、Cloudflare・Cloudinary・ImageKit・Imgix・Netlify のローダーの URL の作り方と、2025 年末から 2026 年に入った height と独自の変換（51cc9148076・d8790972bea・a6b8cb68afa）、IMAGE\_CONFIG と core の ImagePerformanceWarning。ページの上で本物のローダーに設定を渡して URL を見るデモ。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-image-loaders)

---

`NgOptimizedImage` は自分では URL を作りません。`ngSrc` の名前と幅を `IMAGE_LOADER` の関数に渡し、返ってきた文字列を `src` や `srcset` に書くだけです。この章では、その関数の型と既定（`noopImageLoader`）、組み込みの 5 つのローダーを作る `createImageLoader`、それぞれの URL の作り方、2026 年に入った `height` と独自の変換（`transform`）を行で追います。「Cloudinary のローダーに絶対 URL を渡したら？」「height はどこから来る？」に答えられるようにします。

読む対象は `packages/common/src/directives/ng_optimized_image/image_loaders/` の 7 ファイルと `url.ts`、`ng_optimized_image.ts` の `callImageLoader`、core の `application_tokens.ts`・`image_performance_warning.ts`、spec の `packages/common/test/image_loaders/image_loader_spec.ts` です。

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
15. **15. 画像のローダー**（この章）
16. [16. LCP と preload](16-cmn-image-lcp-preload.md)
17. [17. Location](17-cmn-location.md)
18. [18. テスト用の Location](18-cmn-location-testing.md)
19. [19. ViewportScroller](19-cmn-viewport-scroller.md)
20. [20. issue と PR を読む](20-cmn-issues.md)

ローダーを呼ぶ場所は 3 つです。`src`（幅なし）、`srcset` の候補（幅あり。[第 14 回](14-cmn-image-srcset.md)）、`placeholder` の小さな画像（[第 16 回](16-cmn-image-lcp-preload.md)）。どれも `ng_optimized_image.ts` の `callImageLoader` を通ります（3 節）。

## 1. ImageLoaderConfig と ImageLoader

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/image_loader.ts` L14–43 （▶ の行: 25, 29, 33, 38, 42）

```ts
14 │ /**
15 │  * Config options recognized by the image loader function.
16 │  *
17 │  * @see {@link ImageLoader}
18 │  * @see {@link NgOptimizedImage}
19 │  * @publicApi
20 │  */
21 │ export interface ImageLoaderConfig {
22 │   /**
23 │    * Image file name to be added to the image request URL.
24 │    */
25 ▶   src: string;
26 │   /**
27 │    * Width of the requested image (to be used when generating srcset).
28 │    */
29 ▶   width?: number;
30 │   /**
31 │    * Height of the requested image (to be used when generating srcset).
32 │    */
33 ▶   height?: number;
34 │   /**
35 │    * Whether the loader should generate a URL for a small image placeholder instead of a full-sized
36 │    * image.
37 │    */
38 ▶   isPlaceholder?: boolean;
39 │   /**
40 │    * Additional user-provided parameters for use by the ImageLoader.
41 │    */
42 ▶   loaderParams?: {[key: string]: any};
43 │ }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/image_loader.ts` L45–82 （▶ の行: 51, 60, 77–80）

```ts
45 │ /**
46 │  * Represents an image loader function. Image loader functions are used by the
47 │  * NgOptimizedImage directive to produce full image URL based on the image name and its width.
48 │  *
49 │  * @publicApi
50 │  */
51 ▶ export type ImageLoader = (config: ImageLoaderConfig) => string;
52 │ 
53 │ /**
54 │  * Noop image loader that does no transformation to the original src and just returns it as is.
55 │  * This loader is used as a default one if more specific logic is not provided in an app config.
56 │  *
57 │  * @see {@link ImageLoader}
58 │  * @see {@link NgOptimizedImage}
59 │  */
60 ▶ export const noopImageLoader = (config: ImageLoaderConfig) => config.src;
61 │ 
62 │ /**
63 │  * Metadata about the image loader.
64 │  */
65 │ export type ImageLoaderInfo = {
66 │   name: string;
67 │   testUrl: (url: string) => boolean;
68 │ };
69 │ 
70 │ /**
71 │  * Injection token that configures the image loader function.
72 │  *
73 │  * @see {@link ImageLoader}
74 │  * @see {@link NgOptimizedImage}
75 │  * @publicApi
76 │  */
77 ▶ export const IMAGE_LOADER = new InjectionToken<ImageLoader>(
78 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'ImageLoader' : '',
79 ▶   {
80 ▶     factory: () => noopImageLoader,
81 │   },
82 │ );
```

- 21〜43 行目：ローダーが受け取る値は 5 つ。`src`（必須）、`width`、`height`（2026 年に足した。3 節）、`isPlaceholder`、`loaderParams`（テンプレートの `[loaderParams]` をそのまま渡す）。
- 51 行目：ローダーは「config を受け取って文字列を返す」関数の型です。クラスでもサービスでもありません。
- 60 行目 `noopImageLoader`：`config.src` をそのまま返します。幅を渡しても無視するので、srcset の候補にならない（第 14 回の 719 行目）。
- 77〜82 行目 `IMAGE_LOADER`：`factory` 付きの `InjectionToken` です。誰も provide しなければ 80 行目で `noopImageLoader` が入ります（トークンの `factory` の仕組みは [di-injection-token](../di/06-di-injection-token.md)）。ディレクティブは[第 13 回](13-cmn-image-overview.md)の 273 行目でこれを inject します。

## 2. createImageLoader：path を確かめて provider を作る

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/image_loader.ts` L84–122 （▶ の行: 93–95, 97–99, 104, 106–107, 113, 116, 119–120）

```ts
 84 │ /**
 85 │  * Internal helper function that makes it easier to introduce custom image loaders for the
 86 │  * `NgOptimizedImage` directive. It is enough to specify a URL builder function to obtain full DI
 87 │  * configuration for a given loader: a DI token corresponding to the actual loader function, plus DI
 88 │  * tokens managing preconnect check functionality.
 89 │  * @param buildUrlFn a function returning a full URL based on loader's configuration
 90 │  * @param exampleUrls example of full URLs for a given loader (used in error messages)
 91 │  * @returns a set of DI providers corresponding to the configured image loader
 92 │  */
 93 ▶ export function createImageLoader(
 94 ▶   buildUrlFn: (path: string, config: ImageLoaderConfig) => string,
 95 ▶   exampleUrls?: string[],
 96 │ ) {
 97 ▶   return function provideImageLoader(path: string) {
 98 ▶     if (!isValidPath(path)) {
 99 ▶       throwInvalidPathError(path, exampleUrls || []);
100 │     }
101 │ 
102 │     // The trailing / is stripped (if provided) to make URL construction (concatenation) easier in
103 │     // the individual loader functions.
104 ▶     path = normalizePath(path);
105 │ 
106 ▶     const loaderFn = (config: ImageLoaderConfig) => {
107 ▶       if (isAbsoluteUrl(config.src)) {
108 │         // Image loader functions expect an image file name (e.g. `my-image.png`)
109 │         // or a relative path + a file name (e.g. `/a/b/c/my-image.png`) as an input,
110 │         // so the final absolute URL can be constructed.
111 │         // When an absolute URL is provided instead - the loader can not
112 │         // build a final URL, thus the error is thrown to indicate that.
113 ▶         throwUnexpectedAbsoluteUrlError(path, config.src);
114 │       }
115 │ 
116 ▶       return buildUrlFn(path, {...config, src: normalizeSrc(config.src)});
117 │     };
118 │ 
119 ▶     const providers: Provider[] = [{provide: IMAGE_LOADER, useValue: loaderFn}];
120 ▶     return providers;
121 │   };
122 │ }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/url.ts` L26–48 （▶ の行: 29, 35, 37, 43, 47）

```ts
26 │ export function isValidPath(path: unknown): boolean {
27 │   const isString = typeof path === 'string';
28 │ 
29 ▶   if (!isString || path.trim() === '') {
30 │     return false;
31 │   }
32 │ 
33 │   // Calling new URL() will throw if the path string is malformed
34 │   try {
35 ▶     const url = new URL(path);
36 │     return true;
37 ▶   } catch {
38 │     return false;
39 │   }
40 │ }
41 │ 
42 │ export function normalizePath(path: string): string {
43 ▶   return path.endsWith('/') ? path.slice(0, -1) : path;
44 │ }
45 │ 
46 │ export function normalizeSrc(src: string): string {
47 ▶   return src.startsWith('/') ? src.slice(1) : src;
48 │ }
```

1. **93〜97 行目：2 段の関数**

   `createImageLoader(buildUrlFn, exampleUrls)` は「path を受け取る関数」を返します。`provideCloudinaryLoader` などはこの返り値で、`provideCloudinaryLoader('https://res.cloudinary.com/mysite')` と呼んだ時点で 98〜120 行目が走ります。
2. **98〜100 行目：path は絶対 URL でないといけない**

   `isValidPath`（url.ts 26〜40 行目）は、空でない文字列で、35 行目の `new URL(path)` が投げないことを見ます。`new URL` は基準の URL なしでは絶対 URL しか読めないので、`'my-cloudinary-account'` や `'mysite.imgix.net'`（`https://` なし）は 37 行目で `false` になり、99 行目で `exampleUrls` を並べた例外を投げます。**これは開発モードに関係なく投げます**（例外の文だけが `ngDevMode && …` で、本番では番号だけになる）。
3. **104 行目：path の末尾の `/` を 1 つ外す**

   url.ts 42〜44 行目の `normalizePath`。各ローダーが `` `${path}/…` `` とつなぐので、二重の `//` を防ぎます。
4. **106〜117 行目：本当のローダーの関数**

   107 行目、`config.src` が `http://`・`https://` で始まる絶対 URL なら 113 行目で例外です。`ngSrc` は「path からの相対の名前」でなければいけない、という約束です（Netlify だけは違う。4 節）。116 行目で `src` の先頭の `/` を外し（url.ts 46〜48 行目）、`config` を写して `buildUrlFn(path, …)` を呼びます。
5. **119〜120 行目：provider は 1 つだけ**

   `{provide: IMAGE_LOADER, useValue: loaderFn}` の配列です。85〜88 行目のコメントは「preconnect の確かめのトークンも」と書いていますが、今の 119 行目が返すのは `IMAGE_LOADER` だけです。アプリの `providers` に入れれば、`IMAGE_LOADER` の既定（80 行目）より優先されます。

## 3. callImageLoader：ディレクティブが渡す config と height

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L576–600 （▶ の行: 580–582, 590–592, 595–597, 599）

```ts
576 │   /**
577 │    * Calculates the aspect ratio of the image based on width and height.
578 │    * Returns null if the aspect ratio cannot be calculated (missing dimensions or height is 0).
579 │    */
580 ▶   private getAspectRatio(): number | null {
581 ▶     if (this.width && this.height && this.height !== 0) {
582 ▶       return this.width / this.height;
583 │     }
584 │     return null;
585 │   }
586 │ 
587 │   private callImageLoader(
588 │     configWithoutCustomParams: Omit<ImageLoaderConfig, 'loaderParams'>,
589 │   ): string {
590 ▶     let augmentedConfig: ImageLoaderConfig = configWithoutCustomParams;
591 ▶     if (this.loaderParams) {
592 ▶       augmentedConfig.loaderParams = this.loaderParams;
593 │     }
594 │     // Calculate height if width is provided and aspect ratio is available
595 ▶     const ratio = this.getAspectRatio();
596 ▶     if (ratio !== null && augmentedConfig.width) {
597 ▶       augmentedConfig.height = Math.round(augmentedConfig.width / ratio);
598 │     }
599 ▶     return this.imageLoader(augmentedConfig);
600 │   }
```

1. **591〜593 行目：`loaderParams` を足す**

   入力の `loaderParams` があれば、どの呼び出しにも同じものを付けます。589 行目の型が `Omit<ImageLoaderConfig, 'loaderParams'>` なのは、呼ぶ側に付けさせないためです。
2. **595〜598 行目：幅があるときだけ、縦横比から高さを出す**

   `getAspectRatio`（580〜585 行目）は width と height の両方があれば `width / height`。呼び出しの `width`（srcset の候補の幅や placeholder の幅）を比で割って丸めた値を `height` にします。`src` の呼び出しには幅が無いので、`height` も入りません。`fill` の画像は width・height が無いので、どの呼び出しにも入りません。

この 2 つ（580〜585 行目と 594〜598 行目）は 51cc9148076（2026-01-28、feat(common): support height in ImageLoaderConfig and built-in loaders、issue #51723 を閉じた）で足しました。同じコミットで `ImageLoaderConfig` に `height`（33 行目）を足し、5 つのローダーに「`config.height` があれば高さの引数を付ける」4 行ずつを足し、ディレクティブの spec に 143 行（it 6 つ）を足しています。**組み込みのローダーを使っていれば、このコミットから srcset の候補の URL に高さの引数が付く**ようになった、ということです。

## 4. 5 つのローダーの URL

| ローダー | config `{src: 'a.png', width: 300, height: 200}` の結果（path は下の例） | placeholder |
| --- | --- | --- |
| Cloudflare | https://mysite.com/cdn-cgi/image/format=auto,width=300,height=200/a.png | `quality=20` |
| Cloudinary | https://res.cloudinary.com/mysite/image/upload/f\_auto,q\_auto,w\_300,h\_200/a.png | `q_auto:low` |
| ImageKit | https://ik.imagekit.io/mysite/tr:w-300,h-200/a.png | `q-20` |
| Imgix | https://somepath.imgix.net/a.png?auto=format&w=300&h=200 | `q=20` |
| Netlify（path なし） | /.netlify/images?url=%2Fa.png&w=300&h=200 | `q=20`（`quality` を渡していなければ） |

表の URL は DEMO の「5 つ全部で作る」で同じものが出ます。`20` は `constants.ts` の `PLACEHOLDER_QUALITY`（100 のうちの品質）です。

### Cloudflare

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/cloudflare_loader.ts` L26–55 （▶ の行: 26, 28, 32, 34, 38, 43, 47–48, 54）

```ts
26 ▶ export const provideCloudflareLoader: (path: string) => Provider[] = createImageLoader(
27 │   createCloudflareUrl,
28 ▶   ngDevMode ? ['https://<ZONE>/cdn-cgi/image/<OPTIONS>/<SOURCE-IMAGE>'] : undefined,
29 │ );
30 │ 
31 │ function createCloudflareUrl(path: string, config: ImageLoaderConfig) {
32 ▶   let params = `format=auto`;
33 │   if (config.width) {
34 ▶     params += `,width=${config.width}`;
35 │   }
36 │ 
37 │   if (config.height) {
38 ▶     params += `,height=${config.height}`;
39 │   }
40 │ 
41 │   // When requesting a placeholder image we ask for a low quality image to reduce the load time.
42 │   if (config.isPlaceholder) {
43 ▶     params += `,quality=${PLACEHOLDER_QUALITY}`;
44 │   }
45 │ 
46 │   // Support custom transformation parameters
47 ▶   if (config.loaderParams?.['transform']) {
48 ▶     const transformStr = normalizeLoaderTransform(config.loaderParams['transform'], '=');
49 │     params += `,${transformStr}`;
50 │   }
51 │ 
52 │   // Cloudflare image URLs format:
53 │   // https://developers.cloudflare.com/images/image-resizing/url-format/
54 ▶   return `${path}/cdn-cgi/image/${params}/${config.src}`;
55 │ }
```

32 行目の `format=auto` から始め、`,` でつなぎます。54 行目、Cloudflare の画像変換は `/cdn-cgi/image/<設定>/<元の画像>` の形です。47〜49 行目が独自の変換で、`=` でつなぎます（5 節）。

### Cloudinary

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/cloudinary_loader.ts` L13–51 （▶ の行: 16–18, 21, 25–26, 42, 44, 46–48）

```ts
13 │ /**
14 │  * Name and URL tester for Cloudinary.
15 │  */
16 ▶ export const cloudinaryLoaderInfo: ImageLoaderInfo = {
17 ▶   name: 'Cloudinary',
18 ▶   testUrl: isCloudinaryUrl,
19 │ };
20 │ 
21 ▶ const CLOUDINARY_LOADER_REGEX = /https?\:\/\/[^\/]+\.cloudinary\.com\/.+/;
22 │ /**
23 │  * Tests whether a URL is from Cloudinary CDN.
24 │  */
25 ▶ function isCloudinaryUrl(url: string): boolean {
26 ▶   return CLOUDINARY_LOADER_REGEX.test(url);
27 │ }
28 │ 
29 │ /**
30 │  * Function that generates an ImageLoader for Cloudinary and turns it into an Angular provider.
31 │  *
32 │  * @param path Base URL of your Cloudinary images
33 │  * This URL should match one of the following formats:
34 │  * https://res.cloudinary.com/mysite
35 │  * https://mysite.cloudinary.com
36 │  * https://subdomain.mysite.com
37 │  * @returns Set of providers to configure the Cloudinary loader.
38 │  *
39 │  * @see [Image Optimization Guide](guide/image-optimization)
40 │  * @publicApi
41 │  */
42 ▶ export const provideCloudinaryLoader: (path: string) => Provider[] = createImageLoader(
43 │   createCloudinaryUrl,
44 ▶   ngDevMode
45 │     ? [
46 ▶         'https://res.cloudinary.com/mysite',
47 ▶         'https://mysite.cloudinary.com',
48 ▶         'https://subdomain.mysite.com',
49 │       ]
50 │     : undefined,
51 │ );
```

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/cloudinary_loader.ts` L53–83 （▶ の行: 61, 63, 65, 69, 72–73, 77–78, 82）

```ts
53 │ function createCloudinaryUrl(path: string, config: ImageLoaderConfig) {
54 │   // Cloudinary image URLformat:
55 │   // https://cloudinary.com/documentation/image_transformations#transformation_url_structure
56 │   // Example of a Cloudinary image URL:
57 │   // https://res.cloudinary.com/mysite/image/upload/c_scale,f_auto,q_auto,w_600/marketing/tile-topics-m.png
58 │ 
59 │   // For a placeholder image, we use the lowest image setting available to reduce the load time
60 │   // else we use the auto size
61 ▶   const quality = config.isPlaceholder ? 'q_auto:low' : 'q_auto';
62 │ 
63 ▶   let params = `f_auto,${quality}`;
64 │   if (config.width) {
65 ▶     params += `,w_${config.width}`;
66 │   }
67 │ 
68 │   if (config.height) {
69 ▶     params += `,h_${config.height}`;
70 │   }
71 │ 
72 ▶   if (config.loaderParams?.['rounded']) {
73 ▶     params += `,r_max`;
74 │   }
75 │ 
76 │   // Allows users to add any Cloudinary transformation parameters as a string or object
77 ▶   if (config.loaderParams?.['transform']) {
78 ▶     const transformStr = normalizeLoaderTransform(config.loaderParams['transform'], '_');
79 │     params += `,${transformStr}`;
80 │   }
81 │ 
82 ▶   return `${path}/image/upload/${params}/${config.src}`;
83 │ }
```

- 16〜27 行目 `cloudinaryLoaderInfo`：名前と「この URL は Cloudinary か」を見る正規表現。6 節の「組み込みのローダーを使っていない」警告に使います。Imgix・ImageKit・Netlify にも同じ形の `…LoaderInfo` があります（Cloudflare には無い）。
- 44〜50 行目：例の URL は開発モードのときだけ配列にします（本番では `undefined` で、2 節の例外の文も無い）。
- 61 行目：placeholder は `q_auto:low`、ふつうは `q_auto`。72〜74 行目、`loaderParams.rounded` で `r_max`（丸く切る）。77〜80 行目が独自の変換で `_` でつなぎます。

### ImageKit と Imgix

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/imagekit_loader.ts` L47–75 （▶ の行: 53–54, 57–58, 62–63, 67–69, 72–73）

```ts
47 │ export function createImagekitUrl(path: string, config: ImageLoaderConfig): string {
48 │   // Example of an ImageKit image URL:
49 │   // https://ik.imagekit.io/demo/tr:w-300,h-300/medium_cafe_B1iTdD0C.jpg
50 │   const {src, width} = config;
51 │   const params: string[] = [];
52 │ 
53 ▶   if (width) {
54 ▶     params.push(`w-${width}`);
55 │   }
56 │ 
57 ▶   if (config.height) {
58 ▶     params.push(`h-${config.height}`);
59 │   }
60 │ 
61 │   // When requesting a placeholder image we ask for a low quality image to reduce the load time.
62 ▶   if (config.isPlaceholder) {
63 ▶     params.push(`q-${PLACEHOLDER_QUALITY}`);
64 │   }
65 │ 
66 │   // Allows users to add any ImageKit transformation parameters as a string or object
67 ▶   if (config.loaderParams?.['transform']) {
68 ▶     const transformStr = normalizeLoaderTransform(config.loaderParams['transform'], '-');
69 ▶     params.push(transformStr);
70 │   }
71 │ 
72 ▶   const urlSegments = params.length ? [path, `tr:${params.join(',')}`, src] : [path, src];
73 ▶   const url = new URL(urlSegments.join('/'));
74 │   return url.href;
75 │ }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/imgix_loader.ts` L45–73 （▶ の行: 49, 52, 56, 60, 65–67, 70–71）

```ts
45 │ function createImgixUrl(path: string, config: ImageLoaderConfig) {
46 │   const params: string[] = [];
47 │ 
48 │   // This setting ensures the smallest allowable format is set.
49 ▶   params.push('auto=format');
50 │ 
51 │   if (config.width) {
52 ▶     params.push(`w=${config.width}`);
53 │   }
54 │ 
55 │   if (config.height) {
56 ▶     params.push(`h=${config.height}`);
57 │   }
58 │ 
59 │   // When requesting a placeholder image we ask a low quality image to reduce the load time.
60 ▶   if (config.isPlaceholder) {
61 │     params.push(`q=${PLACEHOLDER_QUALITY}`);
62 │   }
63 │ 
64 │   // Allows users to add any Imgix transformation parameters as a string or object
65 ▶   if (config.loaderParams?.['transform']) {
66 ▶     const transform = normalizeLoaderTransform(config.loaderParams['transform'], '=').split(',');
67 ▶     params.push(...transform);
68 │   }
69 │ 
70 ▶   const url = new URL(`${path}/${config.src}`);
71 ▶   url.search = params.join('&');
72 │   return url.href;
73 │ }
```

- ImageKit 72 行目：変換が 1 つでもあれば `tr:w-300,h-200` を path と src の間に挟み、無ければ `path/src`。73 行目で `new URL` を通すので、結果は正規化された絶対 URL です。
- Imgix 49 行目：必ず `auto=format`。66 行目、独自の変換を `=` でつないだ文字列を**カンマで割って** 1 つずつ `&` の引数にします。71 行目で `url.search` にまとめて入れます。

### Netlify：createImageLoader を使わない

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/netlify_loader.ts` L48–69 （▶ の行: 48–49, 58–60, 63–64, 67）

```ts
48 ▶ export function provideNetlifyLoader(path?: string) {
49 ▶   if (path && !isValidPath(path)) {
50 │     throw new RuntimeError(
51 │       RuntimeErrorCode.INVALID_LOADER_ARGUMENTS,
52 │       ngDevMode &&
53 │         `Image loader has detected an invalid path (\`${path}\`). ` +
54 │           `To fix this, supply either the full URL to the Netlify site, or leave it empty to use the current site.`,
55 │     );
56 │   }
57 │ 
58 ▶   if (path) {
59 ▶     const url = new URL(path);
60 ▶     path = url.origin;
61 │   }
62 │ 
63 ▶   const loaderFn = (config: ImageLoaderConfig) => {
64 ▶     return createNetlifyUrl(config, path);
65 │   };
66 │ 
67 ▶   const providers: Provider[] = [{provide: IMAGE_LOADER, useValue: loaderFn}];
68 │   return providers;
69 │ }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/netlify_loader.ts` L71–104 （▶ の行: 71–72, 74–75, 81–82, 84–85, 88, 100–102）

```ts
 71 ▶ const validParams = new Map<string, string>([
 72 ▶   ['height', 'h'],
 73 │   ['fit', 'fit'],
 74 ▶   ['quality', 'q'],
 75 ▶   ['q', 'q'],
 76 │   ['position', 'position'],
 77 │ ]);
 78 │ 
 79 │ function createNetlifyUrl(config: ImageLoaderConfig, path?: string) {
 80 │   // Note: `path` can be undefined, in which case we use a fake one to construct a `URL` instance.
 81 ▶   const url = new URL(path ?? 'https://a/');
 82 ▶   url.pathname = '/.netlify/images';
 83 │ 
 84 ▶   if (!isAbsoluteUrl(config.src) && !config.src.startsWith('/')) {
 85 ▶     config.src = '/' + config.src;
 86 │   }
 87 │ 
 88 ▶   url.searchParams.set('url', config.src);
 89 │ 
 90 │   if (config.width) {
 91 │     url.searchParams.set('w', config.width.toString());
 92 │   }
 93 │ 
 94 │   if (config.height) {
 95 │     url.searchParams.set('h', config.height.toString());
 96 │   }
 97 │ 
 98 │   // When requesting a placeholder image we ask for a low quality image to reduce the load time.
 99 │   // If the quality is specified in the loader config - always use provided value.
100 ▶   const configQuality = config.loaderParams?.['quality'] ?? config.loaderParams?.['q'];
101 ▶   if (config.isPlaceholder && !configQuality) {
102 ▶     url.searchParams.set('q', PLACEHOLDER_QUALITY);
103 │   }
104 │ 
```

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/netlify_loader.ts` L105–121 （▶ の行: 105–107, 109–110, 120）

```ts
105 ▶   for (const [param, value] of Object.entries(config.loaderParams ?? {})) {
106 ▶     if (validParams.has(param)) {
107 ▶       url.searchParams.set(validParams.get(param)!, value.toString());
108 │     } else {
109 ▶       if (ngDevMode) {
110 ▶         console.warn(
111 │           formatRuntimeError(
112 │             RuntimeErrorCode.INVALID_LOADER_ARGUMENTS,
113 │             `The Netlify image loader has detected an \`<img>\` tag with the unsupported attribute "\`${param}\`".`,
114 │           ),
115 │         );
116 │       }
117 │     }
118 │   }
119 │   // The "a" hostname is used for relative URLs, so we can remove it from the final URL.
120 ▶   return url.hostname === 'a' ? url.href.replace(url.origin, '') : url.href;
121 │ }
```

1. **48〜61 行目：path は省略できて、origin だけを使う**

   path を渡せば 49 行目で確かめ、59〜60 行目で `https://mysite.com/foo` も `https://mysite.com` に縮めます。渡さなければ「今のサイト」です。
2. **81〜82 行目・120 行目：仮の host `a`**

   path が無いと `new URL` が作れないので、`https://a/` で作り、最後に 120 行目で origin を消して `/.netlify/images?…` の相対 URL にします。
3. **84〜88 行目：src は絶対 URL でもよい**

   ほかの 4 つと違い絶対 URL を拒みません。相対なら頭に `/` を付け、`url` の引数に入れます（`searchParams.set` なので `%2F` に符号化される）。85 行目は受け取った `config` そのものを書き換えます。
4. **100〜118 行目：`loaderParams` は決まったキーだけ**

   71〜77 行目の表にあるキー（`height`・`fit`・`quality`・`q`・`position`）だけを短い名前で付けます。ほかのキーは 110 行目で開発モードの `console.warn` です。`transform` も表に無いので、Netlify では独自の変換は使えません。`quality` を渡していれば、placeholder の `q=20` は付けません（100〜103 行目）。

## 5. 独自の変換：normalizeLoaderTransform

📄 `angular/packages/common/src/directives/ng_optimized_image/image_loaders/normalized_options.ts` L9–25 （▶ の行: 12, 18–19, 22–24）

```ts
 9 │ /**
10 │  * Converts transform parameter to URL parameter string.
11 │  * @param transform The transform parameter as string or object
12 ▶  * @param separator The separator between key and value ('_' for Cloudinary, '=' for Cloudflare/Imgix , '-' for ImageKit)
13 │  */
14 │ export function normalizeLoaderTransform(
15 │   transform: string | Record<string, string>,
16 │   separator: string,
17 │ ): string {
18 ▶   if (typeof transform === 'string') {
19 ▶     return transform;
20 │   }
21 │ 
22 ▶   return Object.entries(transform)
23 ▶     .map(([key, value]) => `${key}${separator}${value}`)
24 ▶     .join(',');
25 │ }
```

`loaderParams.transform` は文字列ならそのまま（19 行目）、オブジェクトなら 22〜24 行目で `キー + 区切り + 値` をカンマでつなぎます。区切りはローダーごとに違い、12 行目のコメントのとおり Cloudinary は `_`、Cloudflare と Imgix は `=`、ImageKit は `-` です。d8790972bea（2025-12-30、Cloudflare と Cloudinary。issue #65191・#64639）でこのファイルを作り、a6b8cb68afa（2026-01-02、ImageKit と Imgix）で 2 つのローダーに足しました。a6b8cb68afa は Imgix の URL の組み立てを `url.searchParams.set` から「配列に `キー=値` を貯めて 71 行目で `url.search` に入れる」形に書き換えています。spec はどちらのコミットも `image_loader_spec.ts` に足しています（87 行と 84 行）。

## 6. 組み込みのローダーを使っていない、の警告

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L133–139 （▶ の行: 134–138）

```ts
133 │ /** Info about built-in loaders we can test for. */
134 ▶ export const BUILT_IN_LOADERS = [
135 ▶   imgixLoaderInfo,
136 ▶   imageKitLoaderInfo,
137 ▶   cloudinaryLoaderInfo,
138 ▶   netlifyLoaderInfo,
139 │ ];
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1325–1358 （▶ の行: 1335, 1337–1339, 1343–1344, 1350）

```ts
1325 │ /**
1326 │  * Warns if NOT using a loader (falling back to the generic loader) and
1327 │  * the image appears to be hosted on one of the image CDNs for which
1328 │  * we do have a built-in image loader. Suggests switching to the
1329 │  * built-in loader.
1330 │  *
1331 │  * @param ngSrc Value of the ngSrc attribute
1332 │  * @param imageLoader ImageLoader provided
1333 │  */
1334 │ function assertNotMissingBuiltInLoader(ngSrc: string, imageLoader: ImageLoader) {
1335 ▶   if (imageLoader === noopImageLoader) {
1336 │     let builtInLoaderName = '';
1337 ▶     for (const loader of BUILT_IN_LOADERS) {
1338 ▶       if (loader.testUrl(ngSrc)) {
1339 ▶         builtInLoaderName = loader.name;
1340 │         break;
1341 │       }
1342 │     }
1343 ▶     if (builtInLoaderName) {
1344 ▶       console.warn(
1345 │         formatRuntimeError(
1346 │           RuntimeErrorCode.MISSING_BUILTIN_LOADER,
1347 │           `NgOptimizedImage: It looks like your images may be hosted on the ` +
1348 │             `${builtInLoaderName} CDN, but your app is not using Angular's ` +
1349 │             `built-in loader for that CDN. We recommend switching to use ` +
1350 ▶             `the built-in by calling \`provide${builtInLoaderName}Loader()\` ` +
1351 │             `in your \`providers\` and passing it your instance's base URL. ` +
1352 │             `If you don't want to use the built-in loader, define a custom ` +
1353 │             `loader function using IMAGE_LOADER to silence this warning.`,
1354 │         ),
1355 │       );
1356 │     }
1357 │   }
1358 │ }
```

ローダーが既定の `noopImageLoader` のまま（1335 行目）で、`ngSrc` が Imgix・ImageKit・Cloudinary・Netlify の URL に見えたら（1338 行目の `testUrl`）、「`provide…Loader()` を使って」と警告します。[第 13 回](13-cmn-image-overview.md)の `ngOnInit` の 462 行目から呼ぶので開発モードだけです。134〜139 行目に Cloudflare は入っていません。cloudflare\_loader.ts には `…LoaderInfo` が無く、Cloudflare の URL に見えても警告は出ません。

## 7. IMAGE\_CONFIG と、core の ImagePerformanceWarning

📄 `angular/packages/core/src/application/application_tokens.ts` L175–191 （▶ の行: 186–189）

```ts
175 │ /**
176 │  * Injection token that configures the image optimized image functionality.
177 │  * See {@link ImageConfig} for additional information about parameters that
178 │  * can be used.
179 │  *
180 │  * @see {@link NgOptimizedImage}
181 │  * @see {@link ImageConfig}
182 │  * @see [Responsive images](guide/image-optimization#responsive-images)
183 │  * @see [Using placeholders](guide/image-optimization#using-placeholders)
184 │  * @publicApi
185 │  */
186 ▶ export const IMAGE_CONFIG = new InjectionToken<ImageConfig>(
187 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'ImageConfig' : '',
188 ▶   {
189 ▶     factory: () => IMAGE_CONFIG_DEFAULTS,
190 │   },
191 │ );
```

`IMAGE_CONFIG` は core の `application_tokens.ts` にあり、`@angular/common` は `ɵIMAGE_CONFIG` を `IMAGE_CONFIG` の名前で出し直しています。189 行目で既定値（breakpoints・`placeholderResolution: 30`・2 つの `disable…`）が入ります。breakpoints の使い方は[第 14 回](14-cmn-image-srcset.md)、`placeholderResolution` は[第 16 回](16-cmn-image-lcp-preload.md)です。core に置いてあるのは、残りの 2 つの値を core の `ImagePerformanceWarning` が読むからです。

📄 `angular/packages/core/src/image_performance_warning.ts` L25–41 （▶ の行: 25, 30, 33, 35–37, 41）

```ts
25 ▶ @Service()
26 │ export class ImagePerformanceWarning implements OnDestroy {
27 │   // Map of full image URLs -> original `ngSrc` values.
28 │   private window: Window | null = null;
29 │   private observer: PerformanceObserver | null = null;
30 ▶   private options: ImageConfig = inject(IMAGE_CONFIG);
31 │   private lcpImageUrl?: string;
32 │ 
33 ▶   public start() {
34 │     if (
35 ▶       (typeof ngServerMode !== 'undefined' && ngServerMode) ||
36 ▶       typeof PerformanceObserver === 'undefined' ||
37 ▶       (this.options?.disableImageSizeWarning && this.options?.disableImageLazyLoadWarning)
38 │     ) {
39 │       return;
40 │     }
41 ▶     this.observer = this.initPerformanceObserver();
```

📄 `angular/packages/core/src/image_performance_warning.ts` L117–135 （▶ の行: 117, 120–121, 124–125, 127）

```ts
117 ▶       if (!this.options?.disableImageSizeWarning) {
118 │         // Image elements using the NgOptimizedImage directive are excluded,
119 │         // as that directive has its own version of this check.
120 ▶         if (!image.getAttribute('ng-img') && this.isOversized(image)) {
121 ▶           logOversizedImageWarning(image.src);
122 │         }
123 │       }
124 ▶       if (!this.options?.disableImageLazyLoadWarning && this.lcpImageUrl) {
125 ▶         if (image.src === this.lcpImageUrl) {
126 │           lcpElementFound = true;
127 ▶           if (image.loading !== 'lazy' || image.getAttribute('ng-img')) {
128 │             // This variable is set to true and never goes back to false to account
129 │             // for the case where multiple images have the same src url, and some
130 │             // have lazy loading while others don't.
131 │             // Also ignore NgOptimizedImage because there's a different warning for that.
132 │             lcpElementLoadedCorrectly = true;
133 │           }
134 │         }
135 │       }
```

- `ImagePerformanceWarning` は `NgOptimizedImage` を使っていない画像も含めて、ページの全部の `img` を 1 回だけ調べます。開発モードで `bootstrapApplication` の途中から `start()` が呼ばれます（[boot-bootstrap-application](../boot/07-boot-bootstrap-application.md)）。
- 37 行目：`disableImageSizeWarning` と `disableImageLazyLoadWarning` の**両方**が真なら何もしません。片方だけなら、117 行目（大きすぎる画像）か 124 行目（LCP の画像が `loading="lazy"`）の片方だけを止めます。
- 120 行目・127 行目：`ng-img` 属性（第 13 回の 502 行目）のある画像はどちらの警告からも外します。`NgOptimizedImage` には自分の検査があるからです。

> [!NOTE]
> **ポイント**
>
> `IMAGE_CONFIG` を `providers` で上書きすると、core の側はその値をそのまま読みます（30 行目）。`NgOptimizedImage` の側は既定と重ねてから読みます（第 14 回の `processConfig`）。`{disableImageSizeWarning: true}` だけを渡しても breakpoints が消えないのはこのためです。

> **🧪 DEMO — 本物の組み込みのローダーで URL を作る**
>
> 「作る」を押すと、選んだ `provide…Loader(path)`（このサイトの本物の `@angular/common` 22.1.6）を `createEnvironmentInjector` で小さな木に入れ、そこから `IMAGE_LOADER` を取り出して下の config で呼びます（spec の `createCloudinaryLoader` と同じやり方）。URL を作るだけで、読み込みはしません。例外は画面に出します。Netlify で表に無いキーを渡したときだけは、110 行目の `console.warn` を出さないよう、71〜77 行目の表を写した集合で先に止めています。「このページの IMAGE\_LOADER」は、この章のコンポーネントに inject した本物で、アプリが何も provide していないので `noopImageLoader` です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-image-loaders)

試すと良い組：src を `https://angular.dev/a.png` にすると、Netlify 以外の 4 つは 2 節の 113 行目の例外、Netlify は `url=https%3A%2F%2F…` になります。path を `mysite.imgix.net`（`https://` なし）にすると 99 行目の例外です。loaderParams を `{"transform": {"crop": "faces,edges", "fit": "crop"}}` にして Imgix で作ると、`crop=faces&edges&fit=crop` になります（4 節の 66 行目でカンマで割るため。「テストと直し方」）。

## 8. ここまでを 1 本に

- 👤 `providers: [provideCloudinaryLoader('https://res.cloudinary.com/mysite')]` — あなたの app.config.ts
  - `isValidPath(path)` → `normalizePath(path)` — image\_loader.ts L98-104
  - `[{provide: IMAGE_LOADER, useValue: loaderFn}]` — L119
- 👤 `<img ngSrc="hero.png" width="800" height="600">` — あなたのテンプレート
- `inject(IMAGE_LOADER)` — ng\_optimized\_image.ts L273 — *第 13 回*
- `getFixedSrcset()` → `callImageLoader({src, width: 1600})` — L699 → L587 — *第 14 回*
  - `height = Math.round(1600 / (800 / 600))` = 1200 — L595-598
  - `loaderFn({src: 'hero.png', width: 1600, height: 1200})` — image\_loader.ts L106
    - `createCloudinaryUrl(path, …)` → `…/image/upload/f_auto,q_auto,w_1600,h_1200/hero.png` — cloudinary\_loader.ts L53-83

## テストと直し方

### spec と describe

| spec | describe / it | どこで走るか |
| --- | --- | --- |
| common/test/image\_loaders/image\_loader\_spec.ts | describe `Built-in image directive loaders`（35 行目）の中に `Imgix loader`（36）・`Cloudinary loader`（140）・`ImageKit loader`（248）・`Cloudflare loader`（347）・`Netlify loader`（431）・`loader utils`（496） | Node（DOM を使わない） |
| common/test/directives/ng\_optimized\_image\_spec.ts | describe `loaders`（1733 行目）の it（ローダーを渡したときの src・srcset、`loaderParams`、height の 6 つ） | Node |

📄 `angular/packages/common/test/image_loaders/image_loader_spec.ts` L140–158 （▶ の行: 141–144, 146, 152, 157）

```ts
140 │   describe('Cloudinary loader', () => {
141 ▶     function createCloudinaryLoader(path: string): ImageLoader {
142 ▶       const injector = createEnvironmentInjector(
143 ▶         [provideCloudinaryLoader(path)],
144 ▶         TestBed.inject(EnvironmentInjector),
145 │       );
146 ▶       return injector.get(IMAGE_LOADER);
147 │     }
148 │ 
149 │     it('should construct an image loader with the given path', () => {
150 │       const path = 'https://res.cloudinary.com/mysite';
151 │       const loader = createCloudinaryLoader(path);
152 ▶       expect(loader({src: 'img.png'})).toBe(`${path}/image/upload/f_auto,q_auto/img.png`);
153 │       expect(
154 │         loader({
155 │           src: 'marketing/img-2.png',
156 │         }),
157 ▶       ).toBe(`${path}/image/upload/f_auto,q_auto/marketing/img-2.png`);
158 │     });
```

141〜147 行目がローダーを取り出す決まった形です。`createEnvironmentInjector` に `provideCloudinaryLoader(path)` を入れて、`IMAGE_LOADER` を `get` します。DEMO も同じことをしています。

📄 `angular/packages/common/test/image_loaders/image_loader_spec.ts` L470–479 （▶ の行: 473–477）

```ts
470 │     it('should warn if an unknown loader parameter is provided', () => {
471 │       const path = 'https://mysite.com';
472 │       const loader = createNetlifyLoader(path);
473 ▶       const config = {src: 'img.png', loaderParams: {unknown: 'value'}};
474 ▶       spyOn(console, 'warn');
475 ▶       expect(loader(config)).toBe('https://mysite.com/.netlify/images?url=%2Fimg.png');
476 ▶       expect(console.warn).toHaveBeenCalledWith(
477 ▶         `NG0${RuntimeErrorCode.INVALID_LOADER_ARGUMENTS}: The Netlify image loader has detected an \`<img>\` tag with the unsupported attribute "\`unknown\`".`,
478 │       );
479 │     });
```

📄 `angular/packages/common/test/directives/ng_optimized_image_spec.ts` L2047–2067 （▶ の行: 2056, 2062–2065）

```ts
2047 │     it('should pass calculated height to custom image loader when generating srcsets', async () => {
2048 │       const imageLoader = (config: ImageLoaderConfig) => {
2049 │         const widthStr = config.width ? `w=${config.width}` : '';
2050 │         const heightStr = config.height ? `h=${config.height}` : '';
2051 │         const params = [widthStr, heightStr].filter((p) => p).join('&');
2052 │         return `${IMG_BASE_URL}/${config.src}${params ? '?' + params : ''}`;
2053 │       };
2054 │       setupTestingModule({imageLoader});
2055 │ 
2056 ▶       const template = '<img ngSrc="img.png" width="150" height="50">';
2057 │       const fixture = createTestComponent(template);
2058 │       await fixture.whenStable();
2059 │ 
2060 │       const nativeElement = fixture.nativeElement as HTMLElement;
2061 │       const img = nativeElement.querySelector('img')!;
2062 ▶       // Aspect ratio is 150/50 = 3, so for widths 150 and 300:
2063 ▶       // height should be 50 and 100 respectively
2064 ▶       expect(img.srcset).toBe(
2065 ▶         `${IMG_BASE_URL}/img.png?w=150&h=50 1x, ${IMG_BASE_URL}/img.png?w=300&h=100 2x`,
2066 │       );
2067 │     });
```

2062〜2065 行目：width 150・height 50 なので比は 3。1x の 150 に 50、2x の 300 に 100 が入ります（3 節の 595〜598 行目）。51cc9148076 で足した it の 1 つです。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=Built-in image directive loaders"
pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=Image directive loaders should"
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/cmn-logs/e-node-loaders.log・e-ld.log）`

```
Ran 53 of 667 specs
53 specs, 0 failures
Finished in 0.038 seconds
//packages/common/test:test                                              PASSED in 0.8s

Ran 23 of 667 specs
23 specs, 0 failures
Finished in 0.1 seconds
//packages/common/test:test                                              PASSED in 0.8s
```

- 53 件 = `image_loader_spec.ts` の it の全部。23 件 = ディレクティブの spec の describe `loaders` の直下の it（名前が `should` で始まるもの）。どちらも Node で中身まで走ります。

### 直すとしたら

- URL の作り方は各ローダーの `create…Url`、path の確かめは `createImageLoader`（image\_loader.ts 93〜122 行目）と url.ts、height は `callImageLoader`（ng\_optimized\_image.ts 587〜600 行目）です。spec は `image_loader_spec.ts` のローダーごとの describe に「config を渡して `toBe` で URL を比べる」形で足します。
- **本家の不具合らしきもの（手元で確かめた）**：Imgix の独自の変換で、値にカンマを含むもの（Imgix の `crop=faces,edges` や `auto=format,compress` のように、1 つの引数にカンマで複数の値を書く形）が壊れます。`{transform: {crop: 'faces,edges'}}` は 5 節の 22〜24 行目で `crop=faces,edges` になり、imgix\_loader.ts 66 行目の `.split(',')` で `crop=faces` と `edges` に割れて、`?auto=format&crop=faces&edges` という URL になります。このサイトの 22.1.6 の本物の `provideImgixLoader` を Node で呼んで確かめ、DEMO でも同じ URL が出ます。手元の木（8576f161ae4）の 66 行目も同じ行です。spec の Imgix の it（87〜138 行目）はカンマを含む値を試していません。`gh search issues "imgix transform"` では既存の issue は見つかりませんでした。直すとしたら imgix\_loader.ts 65〜68 行目で、文字列とオブジェクトを分けて扱う（オブジェクトなら `Object.entries` から直接 `キー=値` を作る）形になり、spec は describe `Imgix loader` に足します。
- Netlify の 85 行目は、渡された `config` の `src` を書き換えます。ディレクティブは呼ぶたびに新しいオブジェクトを渡す（3 節の 590 行目の元はどれも新しいリテラル）ので、今は表に出ません。
- open の issue：#56466（Cloudinary で動画のサムネイル）、#53309（独自のローダーをもっと細かく）、#50928（`IMAGE_LOADER` を Observable にしたい）。閉じたもの：#51723（height。51cc9148076）、#65191（Cloudflare で高さを使う srcset。d8790972bea）。[第 20 回](20-cmn-issues.md)で読み方を扱います。
- 本家に PR を出すことは勧めません。上の Imgix の件も、まず手元で spec の形（`createImgixLoader` に config を渡して `toBe`）にして失敗することを確かめ、issue を読む・探す手がかりにするところまでにします。

## 聞かれそうな質問

**Q. ローダーを入れないと、src はどうなりますか？**

`IMAGE_LOADER` の既定（image\_loader.ts 80 行目）の `noopImageLoader` が `config.src` をそのまま返すので、`ngSrc` の値がそのまま `src` になります（60 行目）。自動の srcset は作られません（第 14 回）。

**Q. Cloudinary のローダーに絶対 URL の ngSrc を渡すと？**

107 行目で絶対 URL と判定し、113 行目で例外です。`ngSrc` は path からの相対の名前にします。Netlify のローダーだけは 84〜88 行目のとおり絶対 URL も受け付けます。

**Q. ImageLoaderConfig の height は、いつ入りますか？**

ディレクティブが幅つきでローダーを呼び、しかも width と height の両方の入力があるときです（ng\_optimized\_image.ts 595〜598 行目）。srcset の候補と placeholder の呼び出しには入り、`src` の呼び出し（幅なし）と fill の画像には入りません。

**Q. 独自のローダーで、テンプレートから好きな値を渡せますか？**

`[loaderParams]="{…}"` です。591〜593 行目で、どの呼び出しの config にも `loaderParams` として付きます。既定のローダーのまま使うと、開発モードで「loaderParams は使われない」と警告されます。

**Q. provideImgixLoader('mysite.imgix.net') と書いたら？**

呼んだ時点で例外です。`isValidPath` の `new URL('mysite.imgix.net')` が投げて `false`（url.ts 35〜38 行目）になり、image\_loader.ts 99 行目で `throwInvalidPathError` です。開発モードでなくても投げます。

## 読み終えて

- ローダーは「config を受け取って URL を返す関数」。`IMAGE_LOADER` の既定は src をそのまま返す `noopImageLoader`。
- 組み込みの 4 つは `createImageLoader` で作られ、path を絶対 URL か確かめ、末尾の `/` を外し、ngSrc の絶対 URL を拒む。Netlify だけは別の作りで、origin だけを使い、絶対 URL も受ける。
- height は `callImageLoader` が width と height の比から足す。src の呼び出しには入らない。
- `loaderParams.transform` は文字列ならそのまま、オブジェクトならローダーごとの区切りでつなぐ。Imgix はそれをカンマで割るので、カンマを含む値は割れる。
- `IMAGE_CONFIG` は core のトークンで、breakpoints・placeholder の幅と、core の `ImagePerformanceWarning` の 2 つの警告の切り替えを持つ。

---

← 前: [srcset と sizes：自動で作る候補の幅](14-cmn-image-srcset.md)  
次: [LCP・preconnect・preload・placeholder：速く見せる仕組み](16-cmn-image-lcp-preload.md) →
