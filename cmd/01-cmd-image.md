[目次](../README.md) › [common の説明文の読み残し](README.md) › 第 1 回 / 全 9 回

# NgOptimizedImage の説明文：入力と検査の約束

> directives/ng\_optimized\_image/ng\_optimized\_image.ts・asserts.ts・error\_helper.ts の未読の行：冒頭の箇条書きの約束（preconnect の自動生成は angular-cli の webpack ビルダーだけ）、Step 1〜3 と custom loader の例（src に -undefined.jpg）、ngSrcset・decoding の説明、開発モードの検査が出す文。説明文の形の img を本物で描き、開発（記録）と本番を並べる。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-image)

---

`NgOptimizedImage` の説明文（JSDoc）は、angular.dev の API リファレンスにそのまま載ります。この章は、その冒頭の「何をしてくれるか」の箇条書き、Step 1〜3 の使い方の例、入力の説明の残り、そして開発モードの検査が出す文を、行で引いて読みます。説明文の例をそのまま本物の `NgOptimizedImage`（このサイトの `@angular/common` 22.2.6）に通すと、3 つの場面で説明と違う結果になりました。

読む対象は `packages/common/src/directives/ng_optimized_image/` の `ng_optimized_image.ts`・`asserts.ts`・`error_helper.ts`・`index.ts`（../angular、8576f161ae4）です。ディレクティブの処理の流れ（入力 → 検査の並び → 属性を書く）は[NgOptimizedImage の章](../cmn/13-cmn-image-overview.md)、srcset の作り方は[srcset と sizes の章](../cmn/14-cmn-image-srcset.md)、ローダーは[画像のローダーの章](../cmn/15-cmn-image-loaders.md)、LCP・preconnect・placeholder は[LCP と preload の章](../cmn/16-cmn-image-lcp-preload.md)にあります。ここでは繰り返さず、説明文と検査の文だけを読みます。

1. **1. NgOptimizedImage**（この章）
2. [2. 画像のローダー](02-cmd-image-loaders.md)
3. [3. 日付の書式](03-cmd-date.md)
4. [4. 数と i18n の pipe](04-cmd-number.md)
5. [5. 構造ディレクティブ](05-cmd-structural.md)
6. [6. NgClass・NgStyle と outlet](06-cmd-attr-outlets.md)
7. [7. AsyncPipe と小さな pipe](07-cmd-pipes.md)
8. [8. Location](08-cmd-location.md)
9. [9. spec と issue](09-cmd-tests-issues.md)

## 1. 冒頭の約束：箇条書きの 8 つ

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L160–194 （▶ の行: 166–167, 175–177, 180–184, 191–192）

```ts
160 │ /**
161 │  * Config options used in rendering placeholder images.
162 │  *
163 │  * @see {@link NgOptimizedImage}
164 │  * @publicApi
165 │  */
166 ▶ export interface ImagePlaceholderConfig {
167 ▶   blur?: boolean;
168 │ }
169 │ 
170 │ /**
171 │  * Directive that improves image loading performance by enforcing best practices.
172 │  *
173 │  * `NgOptimizedImage` ensures that the loading of the Largest Contentful Paint (LCP) image is
174 │  * prioritized by:
175 ▶  * - Automatically setting the `fetchpriority` attribute on the `<img>` tag
176 ▶  * - Lazy loading non-priority images by default
177 ▶  * - Automatically generating a preconnect link tag in the document head
178 │  *
179 │  * In addition, the directive:
180 ▶  * - Generates appropriate asset URLs if a corresponding `ImageLoader` function is provided
181 ▶  * - Automatically generates a srcset
182 ▶  * - Requires that `width` and `height` are set
183 ▶  * - Warns if `width` or `height` have been set incorrectly
184 ▶  * - Warns if the image will be visually distorted when rendered
185 │  *
186 │  * @usageNotes
187 │  *
188 │  * Follow the steps below to enable and use the directive:
189 │  * 1. Import it into a Component.
190 │  * 2. Optionally provide an `ImageLoader` if you use an image hosting service.
191 ▶  * 3. Update the necessary `<img>` tags in templates and replace `src` attributes with `ngSrc`.
192 ▶  * Using a `ngSrc` allows the directive to control when the `src` gets set, which triggers an image
193 │  * download.
194 │  *
```

173〜184 行目が、API リファレンスの一番上に出る約束です。1 つずつ、実装のどこが果たしているかを並べます。

| 行 | 約束 | 果たしている所 | 本物で |
| --- | --- | --- | --- |
| 175 | `fetchpriority` を自動で付ける | `setHostAttributes` が毎回書く（[NgOptimizedImage の章](../cmn/13-cmn-image-overview.md)の 5 節） | DEMO の priority で `high`、ほかは `auto` |
| 176 | priority でない画像は既定で遅延読み込み | 同じ章の `getLoadingBehavior` | DEMO の全部の場面で `loading="lazy"`（priority・`loading="eager"` を除く） |
| 177 | document の head に preconnect の link を自動で作る | ディレクティブは作らない。開発モードで「無い」と警告するだけ。作るのは angular-cli の古い `browser` ビルダーだけ（下の引用） | このサイト（`application` ビルダー）の本番の index.html には `data-ngimg` の link が無い |
| 180 | ローダーがあれば URL を作る | `callImageLoader`（[画像のローダーの章](../cmn/15-cmn-image-loaders.md)） | DEMO の「ローダーの呼び出し」の列 |
| 181 | srcset を自動で作る | `getAutomaticSrcset`（[srcset と sizes の章](../cmn/14-cmn-image-srcset.md)） | ローダーがあるときだけ。既定のローダーでは作らない（DEMO の default） |
| 182 | `width` と `height` を必須にする | 開発モードの検査だけ（4 節） | 本番では検査が消え、無いと `TypeError`（DEMO の srcsetDoc） |
| 183・184 | 大きさの間違い・歪みを警告する | 読み込んだ後の `assertNoImageDistortion`（5 節） | 読み込みの後なので Node の記録には出ない |

166〜168 行目の `ImagePlaceholderConfig` は `blur` だけの型です（使い方は[LCP と preload の章](../cmn/16-cmn-image-lcp-preload.md)の 6 節）。191〜192 行目の「`ngSrc` にすると、ディレクティブが `src` を書く時を決められる」は、`src` を最後に書く順番のことです（[NgOptimizedImage の章](../cmn/13-cmn-image-overview.md)の 5 節）。

### 177 行目の preconnect は誰が作るか

📄 `angular-cli/packages/ngtools/webpack/src/transformers/find_image_domains.ts` L11–37 （▶ の行: 11–17, 19, 35）

```ts
11 ▶ const BUILTIN_LOADERS = new Set([
12 ▶   'provideCloudflareLoader',
13 ▶   'provideCloudinaryLoader',
14 ▶   'provideImageKitLoader',
15 ▶   'provideImgixLoader',
16 ▶ ]);
17 ▶ const URL_REGEX = /(https?:\/\/[^/]*)\//g;
18 │ 
19 ▶ export function findImageDomains(imageDomains: Set<string>): ts.TransformerFactory<ts.SourceFile> {
20 │   return (context: ts.TransformationContext) => {
21 │     return (sourceFile: ts.SourceFile) => {
22 │       const isBuiltinImageLoader = (node: ts.CallExpression): boolean => {
23 │         return BUILTIN_LOADERS.has(node.expression.getText());
24 │       };
25 │ 
26 │       const findDomainString = (node: ts.Node) => {
27 │         if (
28 │           ts.isStringLiteral(node) ||
29 │           ts.isTemplateHead(node) ||
30 │           ts.isTemplateMiddle(node) ||
31 │           ts.isTemplateTail(node)
32 │         ) {
33 │           const domain = node.text.match(URL_REGEX);
34 │           if (domain && domain[0]) {
35 ▶             imageDomains.add(domain[0]);
36 │ 
37 │             return node;
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/browser/index.ts` L308–323 （▶ の行: 310, 322）

```ts
308 │                     try {
309 │                       const indexHtmlGenerator = new IndexHtmlGenerator({
310 ▶                         cache: cacheOptions,
311 │                         indexPath: path.join(
312 │                           context.workspaceRoot,
313 │                           getIndexInputFile(options.index),
314 │                         ),
315 │                         entrypoints,
316 │                         outputPath,
317 │                         deployUrl: options.deployUrl,
318 │                         sri: options.subresourceIntegrity,
319 │                         optimization: normalizedOptimization,
320 │                         crossOrigin: options.crossOrigin,
321 │                         postTransform: transforms.indexHtml,
322 ▶                         imageDomains: Array.from(imageDomains),
323 │                       });
```
*angular-cli 44129f66a3（22.2.0-next.6）*

preconnect の link を作るのは common ではなく、angular-cli の `@ngtools/webpack` の TypeScript 変換です。11〜16 行目の 4 つの `provideXxxLoader` の呼び出しの最初の引数（と `IMAGE_LOADER` の `useValue` の関数の中の URL）を 35 行目で集め、集めた origin を 322 行目で `IndexHtmlGenerator` に渡し、index.html の head に `<link rel="preconnect" … data-ngimg>` を足します。

1. **集めるのは webpack の `browser` ビルダーだけ**

   `imageDomains` を渡す行は angular-cli の中で 322 行目の 1 か所だけです（`grep -rn imageDomains packages`）。v17 から既定の `application` ビルダー（esbuild）は `IndexHtmlGenerator` の `imageDomains` を渡さないので、何も足しません。
2. **4 つの中に Netlify が無い**

   11〜16 行目の集合に `provideNetlifyLoader` がありません。2 節の 222〜226 行目の一覧と同じ 4 つです。
3. **この文が入ったコミット**

   e33a0ff3dd0（2023-10、#52248）は、ガイドの「Asserting that there is a corresponding preconnect link tag」を「Automatically generating a preconnect link tag」に書き換えました。JSDoc の 177 行目も同じ文です。`git log -L177,177` で見ると、この行を最後に触ったのはこのコミットです。

## 2. Step 1〜3：使い方の例

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L195–226 （▶ の行: 197–202, 206–208, 218, 222–226）

````ts
195 │  * Step 1: import the `NgOptimizedImage` directive.
196 │  *
197 ▶  * ```ts
198 ▶  * @Component({
199 ▶  *   imports: [NgOptimizedImage],
200 ▶  * })
201 ▶  * class MyPage {}
202 ▶  * ```
203 │  *
204 │  * Step 2: configure a loader.
205 │  *
206 ▶  * To use the **default loader**: no additional code changes are necessary. The URL returned by the
207 ▶  * generic loader will always match the value of "src". In other words, this loader applies no
208 ▶  * transformations to the resource URL and the value of the `ngSrc` attribute will be used as is.
209 │  *
210 │  * To use an existing loader for a **third-party image service**: add the provider factory for your
211 │  * chosen service to the `providers` array. In the example below, the Imgix loader is used:
212 │  *
213 │  * ```ts
214 │  * import {provideImgixLoader} from '@angular/common';
215 │  *
216 │  * // Call the function and add the result to the `providers` array:
217 │  * providers: [
218 ▶  *   provideImgixLoader("https://my.base.url/"),
219 │  * ],
220 │  * ```
221 │  *
222 ▶  * The `NgOptimizedImage` directive provides the following functions:
223 ▶  * - `provideCloudflareLoader`
224 ▶  * - `provideCloudinaryLoader`
225 ▶  * - `provideImageKitLoader`
226 ▶  * - `provideImgixLoader`
````

📄 `angular/packages/common/src/directives/ng_optimized_image/index.ts` L9–18 （▶ の行: 11–12, 14–16）

```ts
 9 │ export {ɵIMAGE_CONFIG as IMAGE_CONFIG, ɵImageConfig as ImageConfig} from '@angular/core';
10 │ // These exports represent the set of symbols exposed as a public API.
11 ▶ export {provideCloudflareLoader} from './image_loaders/cloudflare_loader';
12 ▶ export {provideCloudinaryLoader} from './image_loaders/cloudinary_loader';
13 │ export {IMAGE_LOADER, ImageLoader, ImageLoaderConfig} from './image_loaders/image_loader';
14 ▶ export {provideImageKitLoader} from './image_loaders/imagekit_loader';
15 ▶ export {provideImgixLoader} from './image_loaders/imgix_loader';
16 ▶ export {provideNetlifyLoader} from './image_loaders/netlify_loader';
17 │ export {ImagePlaceholderConfig, NgOptimizedImage} from './ng_optimized_image';
18 │ export {PRECONNECT_CHECK_BLOCKLIST} from './preconnect_link_checker';
```

222〜226 行目は「次の関数を用意している」と 4 つを挙げますが、公開の入口の index.ts は 16 行目で `provideNetlifyLoader` も出しています。Netlify のローダーを足した 03c3b3eb79e（2024-02、#54311）は、この ts の `BUILT_IN_LOADERS` と adev のガイドの表には Netlify を足しましたが、222〜226 行目の一覧には足していません（`git show 03c3b3eb79e -- …/ng_optimized_image.ts`）。

197〜202 行目の Step 1 は、`imports` の書き方だけを見せる切れ端です。そのまま strict と strictTemplates の ngc に通すと、`template` が無いので `NG2001: @Component is missing a template` になります（テストと直し方の節）。206〜208 行目「既定のローダーは `ngSrc` の値をそのまま使う」は、DEMO の default で `src="favicon.ico"` になることで確かめられます。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L227–256 （▶ の行: 231–232, 241–243, 251）

````ts
227 │  *
228 │  * If you use a different image provider, you can create a custom loader function as described
229 │  * below.
230 │  *
231 ▶  * To use a **custom loader**: provide your loader function as a value for the `IMAGE_LOADER` DI
232 ▶  * token.
233 │  *
234 │  * ```ts
235 │  * import {IMAGE_LOADER, ImageLoaderConfig} from '@angular/common';
236 │  *
237 │  * // Configure the loader using the `IMAGE_LOADER` token.
238 │  * providers: [
239 │  *   {
240 │  *      provide: IMAGE_LOADER,
241 ▶  *      useValue: (config: ImageLoaderConfig) => {
242 ▶  *        return `https://example.com/${config.src}-${config.width}.jpg`;
243 ▶  *      }
244 │  *   },
245 │  * ],
246 │  * ```
247 │  *
248 │  * Step 3: update `<img>` tags in templates to use `ngSrc` instead of `src`.
249 │  *
250 │  * ```html
251 ▶  * <img ngSrc="logo.png" width="200" height="100">
252 │  * ```
253 │  *
254 │  * @publicApi
255 │  * @see [Image Optimization Guide](guide/image-optimization)
256 │  */
````

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L284–291 （▶ の行: 285, 290）

```ts
284 │   /**
285 ▶    * Calculate the rewritten `src` once and store it.
286 │    * This is needed to avoid repetitive calculations and make sure the directive cleanup in the
287 │    * `DestroyRef.onDestroy` does not rely on the `IMAGE_LOADER` logic (which in turn can rely on some other
288 │    * instance that might be already destroyed).
289 │    */
290 ▶   private _renderedSrc: string | null = null;
291 │ 
```

238〜245 行目の custom loader と 251 行目の Step 3 をそのまま組み合わせると、`src` は `https://example.com/logo.png-undefined.jpg` になります（DEMO の step3、開発モードの記録も同じ）。ディレクティブが `src` を作るときは、ローダーに `{src}` だけを渡し、`width` を渡さないからです（`getRewrittenSrc` のコメント「width を渡すと 2x 以上の画面で小さすぎる画像になる」、[srcset と sizes の章](../cmn/14-cmn-image-srcset.md)の 2 節）。285〜290 行目のとおり、作った `src` は `_renderedSrc` に一度だけ覚えるので、`-undefined.jpg` の URL のまま残ります。`srcset` の側は幅を渡すので `logo.png-200.jpg 1x, logo.png-400.jpg 2x` と正しく並びます。

> [!WARNING]
> **ハマりどころ**
>
> 説明文の custom loader の例は、`config.width` が無いときの形を書いていません。0eb1c5c021b（2024-10、#58085「Minor typo in code example」）は 242 行目の末尾の余計な `}` を消しましたが、`-${config.width}` はそのまま残りました。ローダーを書くときは、ガイドの例（`if (config.width)` で足す形）のように、幅が無い呼び出しを先に考えます。

## 3. 入力の説明の残り：ngSrcset の例と decoding

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L304–310 （▶ の行: 306–307）

````ts
304 │    * Example:
305 │    * ```html
306 ▶    * <img ngSrc="hello.jpg" ngSrcset="100w, 200w" />  =>
307 ▶    * <img src="path/hello.jpg" srcset="path/hello.jpg?w=100 100w, path/hello.jpg?w=200 200w" />
308 │    * ```
309 │    */
310 │   @Input() ngSrcset!: string;
````

306 行目の例は `width` と `height` を書いていません。開発モードでは `NG02954`（these required attributes are missing: "width", "height"）で止まり、本番ビルドでは検査が消えるので、属性を書くところで `TypeError: Cannot read properties of undefined (reading 'toString')` になります（DEMO の srcsetDoc。`this.width!.toString()` は[NgOptimizedImage の章](../cmn/13-cmn-image-overview.md)の 5 節）。`width="200" height="100"` を足すと、307 行目の形 `path/hello.jpg?w=100 100w, path/hello.jpg?w=200 200w` がそのまま出ます（DEMO の srcsetW。`path/` を付けるローダーはこの章で書いたもの）。説明に無い `sizes="auto, 100vw"` も付きます（幅の記述子で lazy のとき。srcset と sizes の章の 6 節）。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L329–340 （▶ の行: 331–332, 334–336）

```ts
329 │ 
330 │   /**
331 ▶    * The desired decoding behavior for the image. Defaults to `auto`
332 ▶    * if not explicitly set, matching native browser behavior.
333 │    *
334 ▶    * Use `async` to decode the image off the main thread (non-blocking),
335 ▶    * `sync` for immediate decoding (blocking), or `auto` to let the
336 ▶    * browser decide the optimal strategy.
337 │    *
338 │    * [Spec](https://html.spec.whatwg.org/multipage/images.html#image-decoding-hint)
339 │    */
340 │   @Input() decoding?: 'sync' | 'async' | 'auto';
```

331〜332 行目は「既定は `auto`」だけを書き、priority のときの扱いを書いていません。実装は priority なら入力を見ずに `sync` を返します（DEMO の priority で `decoding="sync"`。NgOptimizedImage の章の 5 節）。`loading` の説明（NgOptimizedImage の章の 2 節で引いた行）が priority との関係を書いているのと違い、`decoding` の説明だけが黙っています。

## 4. 入力の検査の文：src・Base64・blob・空文字

ここからは、開発モードだけで走る検査（`ngOnInit` から呼ばれる関数。並びは NgOptimizedImage の章の 3・4 節）の、未読の分です。どれも文の頭は `imgDirectiveDetails` です。

📄 `angular/packages/common/src/directives/ng_optimized_image/error_helper.ts` L8–15 （▶ の行: 10–14）

```ts
 8 │ 
 9 │ // Assembles directive details string, useful for error messages.
10 ▶ export function imgDirectiveDetails(ngSrc: string, includeNgSrc = true) {
11 ▶   const ngSrcInfo = includeNgSrc
12 ▶     ? `(activated on an <img> element with the \`ngSrc="${ngSrc}"\`) `
13 ▶     : '';
14 ▶   return `The NgOptimizedImage directive ${ngSrcInfo}has detected that`;
15 │ }
```

12 行目で ``(activated on an <img> element with the `ngSrc="…"`)`` を挟み、14 行目で `has detected that` で終えます。2 つめの引数を `false` にすると、ngSrc の部分を省きます。下の 840・877 行目（と srcset と sizes の章の `sizes` の検査）が `false` で呼ぶ所で、ngSrc の値が長い data: URL のときや、`placeholderConfig` の話なので ngSrc を出す意味が薄いときです。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L797–828 （▶ の行: 803, 806–807, 818, 821）

```ts
797 │ /***** Assert functions *****/
798 │ 
799 │ /**
800 │  * Verifies that there is no `src` set on a host element.
801 │  */
802 │ function assertNoConflictingSrc(dir: NgOptimizedImage) {
803 ▶   if (dir.src) {
804 │     throw new RuntimeError(
805 │       RuntimeErrorCode.UNEXPECTED_SRC_ATTR,
806 ▶       `${imgDirectiveDetails(dir.ngSrc)} both \`src\` and \`ngSrc\` have been set. ` +
807 ▶         `Supplying both of these attributes breaks lazy loading. ` +
808 │         `The NgOptimizedImage directive sets \`src\` itself based on the value of \`ngSrc\`. ` +
809 │         `To fix this, please remove the \`src\` attribute.`,
810 │     );
811 │   }
812 │ }
813 │ 
814 │ /**
815 │  * Verifies that there is no `srcset` set on a host element.
816 │  */
817 │ function assertNoConflictingSrcset(dir: NgOptimizedImage) {
818 ▶   if (dir.srcset) {
819 │     throw new RuntimeError(
820 │       RuntimeErrorCode.UNEXPECTED_SRCSET_ATTR,
821 ▶       `${imgDirectiveDetails(dir.ngSrc)} both \`srcset\` and \`ngSrcset\` have been set. ` +
822 │         `Supplying both of these attributes breaks lazy loading. ` +
823 │         `The NgOptimizedImage directive sets \`srcset\` itself based on the value of ` +
824 │         `\`ngSrcset\`. To fix this, please remove the \`srcset\` attribute.`,
825 │     );
826 │   }
827 │ }
828 │ 
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L53–61 （▶ の行: 60）

```ts
53 │ /**
54 │  * When a Base64-encoded image is passed as an input to the `NgOptimizedImage` directive,
55 │  * an error is thrown. The image content (as a string) might be very long, thus making
56 │  * it hard to read an error message if the entire string is included. This const defines
57 │  * the number of characters that should be included into the error message. The rest
58 │  * of the content is truncated.
59 │  */
60 ▶ const BASE64_IMG_MAX_LENGTH_IN_ERROR = 50;
61 │ 
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L829–847 （▶ の行: 834–836, 840–841）

```ts
829 │ /**
830 │  * Verifies that the `ngSrc` is not a Base64-encoded image.
831 │  */
832 │ function assertNotBase64Image(dir: NgOptimizedImage) {
833 │   let ngSrc = dir.ngSrc.trim();
834 ▶   if (ngSrc.startsWith('data:')) {
835 ▶     if (ngSrc.length > BASE64_IMG_MAX_LENGTH_IN_ERROR) {
836 ▶       ngSrc = ngSrc.substring(0, BASE64_IMG_MAX_LENGTH_IN_ERROR) + '...';
837 │     }
838 │     throw new RuntimeError(
839 │       RuntimeErrorCode.INVALID_INPUT,
840 ▶       `${imgDirectiveDetails(dir.ngSrc, false)} \`ngSrc\` is a Base64-encoded string ` +
841 ▶         `(${ngSrc}). NgOptimizedImage does not support Base64-encoded strings. ` +
842 │         `To fix this, disable the NgOptimizedImage directive for this element ` +
843 │         `by removing \`ngSrc\` and using a standard \`src\` attribute instead.`,
844 │     );
845 │   }
846 │ }
847 │ 
```

834 行目は `data:` で始まるかだけを見ます。840〜841 行目の文は「Base64 でエンコードした文字列」と書きますが、percent エンコードの SVG（`data:image/svg+xml,%3Csvg…`）でも同じ文になります（DEMO の base64、記録）。835〜836 行目で 60 行目の 50 文字に切り、`...` を付けます。本番ビルドでは検査が無いので、同じ `<img>` が data: の画像をそのまま描きます（DEMO のこのページの列）。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L937–968 （▶ の行: 943, 946, 958–960, 963）

```ts
937 │ 
938 │ /**
939 │  * Verifies that the `ngSrc` is not a Blob URL.
940 │  */
941 │ function assertNotBlobUrl(dir: NgOptimizedImage) {
942 │   const ngSrc = dir.ngSrc.trim();
943 ▶   if (ngSrc.startsWith('blob:')) {
944 │     throw new RuntimeError(
945 │       RuntimeErrorCode.INVALID_INPUT,
946 ▶       `${imgDirectiveDetails(dir.ngSrc)} \`ngSrc\` was set to a blob URL (${ngSrc}). ` +
947 │         `Blob URLs are not supported by the NgOptimizedImage directive. ` +
948 │         `To fix this, disable the NgOptimizedImage directive for this element ` +
949 │         `by removing \`ngSrc\` and using a regular \`src\` attribute instead.`,
950 │     );
951 │   }
952 │ }
953 │ 
954 │ /**
955 │  * Verifies that the input is set to a non-empty string.
956 │  */
957 │ function assertNonEmptyInput(dir: NgOptimizedImage, name: string, value: unknown) {
958 ▶   const isString = typeof value === 'string';
959 ▶   const isEmptyString = isString && value.trim() === '';
960 ▶   if (!isString || isEmptyString) {
961 │     throw new RuntimeError(
962 │       RuntimeErrorCode.INVALID_INPUT,
963 ▶       `${imgDirectiveDetails(dir.ngSrc)} \`${name}\` has an invalid value ` +
964 │         `(\`${value}\`). To fix this, change the value to a non-empty string.`,
965 │     );
966 │   }
967 │ }
968 │ 
```

958〜960 行目は「文字列で、trim して空でない」を見ます。`ngSrc` と `ngSrcset` の両方がこの関数を通ります（`ngSrcset` は書式の検査の前、srcset と sizes の章の 3 節）。

## 5. 読み込んだ後の検査：歪みと fill の高さ

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1074–1113 （▶ の行: 1076–1078, 1089–1091, 1094, 1099–1100, 1103–1104, 1106–1107, 1110–1111）

```ts
1074 │ 
1075 │ /**
1076 ▶  * Verifies that the rendered image is not visually distorted. Effectively this is checking:
1077 ▶  * - Whether the "width" and "height" attributes reflect the actual dimensions of the image.
1078 ▶  * - Whether image styling is "correct" (see below for a longer explanation).
1079 │  */
1080 │ function assertNoImageDistortion(
1081 │   dir: NgOptimizedImage,
1082 │   img: HTMLImageElement,
1083 │   renderer: Renderer2,
1084 │   destroyRef: DestroyRef,
1085 │ ) {
1086 │   const callback = () => {
1087 │     removeLoadListenerFn();
1088 │     removeErrorListenerFn();
1089 ▶     const computedStyle = window.getComputedStyle(img);
1090 ▶     let renderedWidth = parseFloat(computedStyle.getPropertyValue('width'));
1091 ▶     let renderedHeight = parseFloat(computedStyle.getPropertyValue('height'));
1092 │     const boxSizing = computedStyle.getPropertyValue('box-sizing');
1093 │ 
1094 ▶     if (boxSizing === 'border-box') {
1095 │       const paddingTop = computedStyle.getPropertyValue('padding-top');
1096 │       const paddingRight = computedStyle.getPropertyValue('padding-right');
1097 │       const paddingBottom = computedStyle.getPropertyValue('padding-bottom');
1098 │       const paddingLeft = computedStyle.getPropertyValue('padding-left');
1099 ▶       renderedWidth -= parseFloat(paddingRight) + parseFloat(paddingLeft);
1100 ▶       renderedHeight -= parseFloat(paddingTop) + parseFloat(paddingBottom);
1101 │     }
1102 │ 
1103 ▶     const renderedAspectRatio = renderedWidth / renderedHeight;
1104 ▶     const nonZeroRenderedDimensions = renderedWidth !== 0 && renderedHeight !== 0;
1105 │ 
1106 ▶     const intrinsicWidth = img.naturalWidth;
1107 ▶     const intrinsicHeight = img.naturalHeight;
1108 │     const intrinsicAspectRatio = intrinsicWidth / intrinsicHeight;
1109 │ 
1110 ▶     const suppliedWidth = dir.width!;
1111 ▶     const suppliedHeight = dir.height!;
1112 │     const suppliedAspectRatio = suppliedWidth / suppliedHeight;
1113 │ 
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1114–1140 （▶ の行: 1117–1123, 1125, 1129）

```ts
1114 │     // Tolerance is used to account for the impact of subpixel rendering.
1115 │     // Due to subpixel rendering, the rendered, intrinsic, and supplied
1116 │     // aspect ratios of a correctly configured image may not exactly match.
1117 ▶     // For example, a `width=4030 height=3020` image might have a rendered
1118 ▶     // size of "1062w, 796.48h". (An aspect ratio of 1.334... vs. 1.333...)
1119 ▶     const inaccurateDimensions =
1120 ▶       Math.abs(suppliedAspectRatio - intrinsicAspectRatio) > ASPECT_RATIO_TOLERANCE;
1121 ▶     const stylingDistortion =
1122 ▶       nonZeroRenderedDimensions &&
1123 ▶       Math.abs(intrinsicAspectRatio - renderedAspectRatio) > ASPECT_RATIO_TOLERANCE;
1124 │ 
1125 ▶     if (inaccurateDimensions) {
1126 │       console.warn(
1127 │         formatRuntimeError(
1128 │           RuntimeErrorCode.INVALID_INPUT,
1129 ▶           `${imgDirectiveDetails(dir.ngSrc)} the aspect ratio of the image does not match ` +
1130 │             `the aspect ratio indicated by the width and height attributes. ` +
1131 │             `\nIntrinsic image size: ${intrinsicWidth}w x ${intrinsicHeight}h ` +
1132 │             `(aspect-ratio: ${round(
1133 │               intrinsicAspectRatio,
1134 │             )}). \nSupplied width and height attributes: ` +
1135 │             `${suppliedWidth}w x ${suppliedHeight}h (aspect-ratio: ${round(
1136 │               suppliedAspectRatio,
1137 │             )}). ` +
1138 │             `\nTo fix this, update the width and height attributes.`,
1139 │         ),
1140 │       );
```

1 節の 183・184 行目の「警告する」を果たすのがこの関数です。3 つの縦横比を比べます。

1. **描かれた大きさ（1089〜1103 行目）**

   `getComputedStyle` の `width`・`height`。`box-sizing: border-box` なら padding を引きます。
2. **画像そのものの大きさ（1106〜1108 行目）**

   `naturalWidth`・`naturalHeight`。読み込みが終わらないと 0 なので、この関数は load のリスナーの中で計算します。
3. **書いた width・height（1110〜1112 行目）**

   テンプレートの `width`・`height` の入力。
4. **差が 0.1 を超えたら（1119〜1123 行目）**

   書いた比と画像の比が違えば 1125 行目の「width・height の属性が違う」、画像の比と描いた比が違えば次の引用の 1141 行目の「スタイルが歪めている」です。1117〜1118 行目のコメントの例（4030×3020 を 1062×796.48 で描く）は、1.3344 と 1.3333 の差 0.001 なので、どちらにも当たりません。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1141–1178 （▶ の行: 1141, 1150–1153, 1157, 1159–1162, 1171）

```ts
1141 ▶     } else if (stylingDistortion) {
1142 │       console.warn(
1143 │         formatRuntimeError(
1144 │           RuntimeErrorCode.INVALID_INPUT,
1145 │           `${imgDirectiveDetails(dir.ngSrc)} the aspect ratio of the rendered image ` +
1146 │             `does not match the image's intrinsic aspect ratio. ` +
1147 │             `\nIntrinsic image size: ${intrinsicWidth}w x ${intrinsicHeight}h ` +
1148 │             `(aspect-ratio: ${round(intrinsicAspectRatio)}). \nRendered image size: ` +
1149 │             `${renderedWidth}w x ${renderedHeight}h (aspect-ratio: ` +
1150 ▶             `${round(renderedAspectRatio)}). \nThis issue can occur if "width" and "height" ` +
1151 ▶             `attributes are added to an image without updating the corresponding ` +
1152 ▶             `image styling. To fix this, adjust image styling. In most cases, ` +
1153 ▶             `adding "height: auto" or "width: auto" to the image styling will fix ` +
1154 │             `this issue.`,
1155 │         ),
1156 │       );
1157 ▶     } else if (!dir.ngSrcset && nonZeroRenderedDimensions) {
1158 │       // If `ngSrcset` hasn't been set, sanity check the intrinsic size.
1159 ▶       const recommendedWidth = RECOMMENDED_SRCSET_DENSITY_CAP * renderedWidth;
1160 ▶       const recommendedHeight = RECOMMENDED_SRCSET_DENSITY_CAP * renderedHeight;
1161 ▶       const oversizedWidth = intrinsicWidth - recommendedWidth >= OVERSIZED_IMAGE_TOLERANCE;
1162 ▶       const oversizedHeight = intrinsicHeight - recommendedHeight >= OVERSIZED_IMAGE_TOLERANCE;
1163 │       if (oversizedWidth || oversizedHeight) {
1164 │         console.warn(
1165 │           formatRuntimeError(
1166 │             RuntimeErrorCode.OVERSIZED_IMAGE,
1167 │             `${imgDirectiveDetails(dir.ngSrc)} the intrinsic image is significantly ` +
1168 │               `larger than necessary. ` +
1169 │               `\nRendered image size: ${renderedWidth}w x ${renderedHeight}h. ` +
1170 │               `\nIntrinsic image size: ${intrinsicWidth}w x ${intrinsicHeight}h. ` +
1171 ▶               `\nRecommended intrinsic image size: ${recommendedWidth}w x ${recommendedHeight}h. ` +
1172 │               `\nNote: Recommended intrinsic image size is calculated assuming a maximum DPR of ` +
1173 │               `${RECOMMENDED_SRCSET_DENSITY_CAP}. To improve loading time, resize the image ` +
1174 │               `or consider using the "ngSrcset" and "sizes" attributes.`,
1175 │           ),
1176 │         );
1177 │       }
1178 │     }
```

1157〜1162 行目は、`ngSrcset` を書かずに描いた大きさより画像がずっと大きいときです。描いた大きさの 2 倍（定数 `RECOMMENDED_SRCSET_DENSITY_CAP`）より 1000 px（定数 `OVERSIZED_IMAGE_TOLERANCE`）以上大きいと、1171 行目で「勧める大きさ」を出します。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1179–1202 （▶ の行: 1181, 1183–1187, 1195, 1200）

```ts
1179 │   };
1180 │ 
1181 ▶   const removeLoadListenerFn = renderer.listen(img, 'load', callback);
1182 │ 
1183 ▶   // We only listen to the `error` event to remove the `load` event listener because it will not be
1184 ▶   // fired if the image fails to load. This is done to prevent memory leaks in development mode
1185 ▶   // because image elements aren't garbage-collected properly. It happens because zone.js stores the
1186 ▶   // event listener directly on the element and closures capture `dir`.
1187 ▶   const removeErrorListenerFn = renderer.listen(img, 'error', () => {
1188 │     removeLoadListenerFn();
1189 │     removeErrorListenerFn();
1190 │   });
1191 │ 
1192 │   // Clean up listeners once the view is destroyed, before the image
1193 │   // loads or fails to load, to avoid element from being captured
1194 │   // in memory and redundant change detection.
1195 ▶   destroyRef.onDestroy(() => {
1196 │     removeLoadListenerFn();
1197 │     removeErrorListenerFn();
1198 │   });
1199 │ 
1200 ▶   callOnLoadIfImageIsLoaded(img, callback);
1201 │ }
1202 │ 
```

1183〜1186 行目のコメントが、error のリスナーを付ける理由です。読み込みに失敗すると load は来ないので、load のリスナーが残り続け、要素が開発モードで解放されなくなる、という話です。1200 行目はキャッシュから来て load が来ない画像のための呼び出しです（LCP と preload の章の 6 節）。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1236–1263 （▶ の行: 1238–1239, 1250–1251, 1255–1257）

```ts
1236 │ 
1237 │ /**
1238 ▶  * Verifies that the rendered image has a nonzero height. If the image is in fill mode, provides
1239 ▶  * guidance that this can be caused by the containing element's CSS position property.
1240 │  */
1241 │ function assertNonZeroRenderedHeight(
1242 │   dir: NgOptimizedImage,
1243 │   img: HTMLImageElement,
1244 │   renderer: Renderer2,
1245 │   destroyRef: DestroyRef,
1246 │ ) {
1247 │   const callback = () => {
1248 │     removeLoadListenerFn();
1249 │     removeErrorListenerFn();
1250 ▶     const renderedHeight = img.clientHeight;
1251 ▶     if (dir.fill && renderedHeight === 0) {
1252 │       console.warn(
1253 │         formatRuntimeError(
1254 │           RuntimeErrorCode.INVALID_INPUT,
1255 ▶           `${imgDirectiveDetails(dir.ngSrc)} the height of the fill-mode image is zero. ` +
1256 ▶             `This is likely because the containing element does not have the CSS 'position' ` +
1257 ▶             `property set to one of the following: "relative", "fixed", or "absolute". ` +
1258 │             `To fix this problem, make sure the container element has the CSS 'position' ` +
1259 │             `property defined and the height of the element is not zero.`,
1260 │         ),
1261 │       );
1262 │     }
1263 │   };
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1264–1283 （▶ の行: 1265, 1267, 1281）

```ts
1264 │ 
1265 ▶   const removeLoadListenerFn = renderer.listen(img, 'load', callback);
1266 │ 
1267 ▶   // See comments in the `assertNoImageDistortion`.
1268 │   const removeErrorListenerFn = renderer.listen(img, 'error', () => {
1269 │     removeLoadListenerFn();
1270 │     removeErrorListenerFn();
1271 │   });
1272 │ 
1273 │   // Clean up listeners once the view is destroyed, before the image
1274 │   // loads or fails to load, to avoid element from being captured
1275 │   // in memory and redundant change detection.
1276 │   destroyRef.onDestroy(() => {
1277 │     removeLoadListenerFn();
1278 │     removeErrorListenerFn();
1279 │   });
1280 │ 
1281 ▶   callOnLoadIfImageIsLoaded(img, callback);
1282 │ }
1283 │ 
```

fill の画像は、1250〜1251 行目で読み込み後の `clientHeight` が 0 なら警告します。1256〜1257 行目は親の `position` が relative・fixed・absolute でないことを原因に挙げます。1265〜1281 行目のリスナーの付け外しは、1267 行目のコメントのとおり歪みの検査と同じ形です。

> [!NOTE]
> **ポイント**
>
> この 2 つの検査は load の後で走るので、domino（画像を読み込まない DOM）の上の記録には出ません。本番ビルドのこのページでも消えています。手で確かめるなら開発ビルドで、`width="200" height="100"` の正方形の画像を描きます。本家では `packages/core/test/bundling/image-directive/e2e/` の image-distortion と fill-mode の e2e（WebDriver で本物のブラウザ）が固めています。

## 6. placeholder・decoding・ローダーなしの警告

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L114–132 （▶ の行: 119, 124–126, 130–131）

```ts
114 │ 
115 │ /**
116 │  * Placeholder dimension (height or width) limit in pixels. Angular produces a warning
117 │  * when this limit is crossed.
118 │  */
119 ▶ const PLACEHOLDER_DIMENSION_LIMIT = 1000;
120 │ 
121 │ /**
122 │  * Used to warn or error when the user provides an overly large dataURL for the placeholder
123 │  * attribute.
124 ▶  * Character count of Base64 images is 1 character per byte, and base64 encoding is approximately
125 ▶  * 33% larger than base images, so 4000 characters is around 3KB on disk and 10000 characters is
126 ▶  * around 7.7KB. Experimentally, 4000 characters is about 20x20px in PNG or medium-quality JPEG
127 │  * format, and 10,000 is around 50x50px, but there's quite a bit of variation depending on how the
128 │  * image is saved.
129 │  */
130 ▶ export const DATA_URL_WARN_LIMIT = 4000;
131 ▶ export const DATA_URL_ERROR_LIMIT = 10000;
132 │ 
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L863–885 （▶ の行: 864–867, 874）

```ts
863 │ 
864 ▶ function assertValidPlaceholder(dir: NgOptimizedImage, imageLoader: ImageLoader) {
865 ▶   assertNoPlaceholderConfigWithoutPlaceholder(dir);
866 ▶   assertNoRelativePlaceholderWithoutLoader(dir, imageLoader);
867 ▶   assertNoOversizedDataUrl(dir);
868 │ }
869 │ 
870 │ /**
871 │  * Verifies that placeholderConfig isn't being used without placeholder
872 │  */
873 │ function assertNoPlaceholderConfigWithoutPlaceholder(dir: NgOptimizedImage) {
874 ▶   if (dir.placeholderConfig && !dir.placeholder) {
875 │     throw new RuntimeError(
876 │       RuntimeErrorCode.INVALID_INPUT,
877 │       `${imgDirectiveDetails(
878 │         dir.ngSrc,
879 │         false,
880 │       )} \`placeholderConfig\` options were provided for an ` +
881 │         `image that does not use the \`placeholder\` attribute, and will have no effect.`,
882 │     );
883 │   }
884 │ }
885 │ 
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L901–936 （▶ の行: 907–909, 911–912, 922–923）

```ts
901 │ 
902 │ /**
903 │  * Warns or throws an error if an oversized dataURL placeholder is provided.
904 │  */
905 │ function assertNoOversizedDataUrl(dir: NgOptimizedImage) {
906 │   if (
907 ▶     dir.placeholder &&
908 ▶     typeof dir.placeholder === 'string' &&
909 ▶     dir.placeholder.startsWith('data:')
910 │   ) {
911 ▶     if (dir.placeholder.length > DATA_URL_ERROR_LIMIT) {
912 ▶       throw new RuntimeError(
913 │         RuntimeErrorCode.OVERSIZED_PLACEHOLDER,
914 │         `${imgDirectiveDetails(
915 │           dir.ngSrc,
916 │         )} the \`placeholder\` attribute is set to a data URL which is longer ` +
917 │           `than ${DATA_URL_ERROR_LIMIT} characters. This is strongly discouraged, as large inline placeholders ` +
918 │           `directly increase the bundle size of Angular and hurt page load performance. To fix this, generate ` +
919 │           `a smaller data URL placeholder.`,
920 │       );
921 │     }
922 ▶     if (dir.placeholder.length > DATA_URL_WARN_LIMIT) {
923 ▶       console.warn(
924 │         formatRuntimeError(
925 │           RuntimeErrorCode.OVERSIZED_PLACEHOLDER,
926 │           `${imgDirectiveDetails(
927 │             dir.ngSrc,
928 │           )} the \`placeholder\` attribute is set to a data URL which is longer ` +
929 │             `than ${DATA_URL_WARN_LIMIT} characters. This is discouraged, as large inline placeholders ` +
930 │             `directly increase the bundle size of Angular and hurt page load performance. For better loading performance, ` +
931 │             `generate a smaller data URL placeholder.`,
932 │         ),
933 │       );
934 │     }
935 │   }
936 │ }
```

placeholder の検査は 864〜868 行目の 3 つです。907〜909 行目で「文字列で `data:` で始まる」ものだけを数え、911 行目の 10000 文字を超えたら投げ、922 行目の 4000 文字を超えたら `console.warn` です。先に投げる側を見るので、10001 文字では警告は出ずに例外だけです（DEMO の ph4001・ph10001）。124〜126 行目のコメントは「4000 文字はおよそ 3KB、PNG なら 20×20px ほど」と目安を書きます。数えるのは文字数で、Base64 かどうかは見ません。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1309–1324 （▶ の行: 1314–1315）

```ts
1309 │ 
1310 │ /**
1311 │  * Verifies that the `decoding` attribute is set to a valid input.
1312 │  */
1313 │ function assertValidDecodingInput(dir: NgOptimizedImage) {
1314 ▶   const validInputs = ['sync', 'async', 'auto'];
1315 ▶   if (typeof dir.decoding === 'string' && !validInputs.includes(dir.decoding)) {
1316 │     throw new RuntimeError(
1317 │       RuntimeErrorCode.INVALID_INPUT,
1318 │       `${imgDirectiveDetails(dir.ngSrc)} the \`decoding\` attribute ` +
1319 │         `has an invalid value (\`${dir.decoding}\`). ` +
1320 │         `To fix this, provide a valid value ("sync", "async", or "auto").`,
1321 │     );
1322 │   }
1323 │ }
1324 │ 
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1359–1394 （▶ の行: 1361, 1364–1365, 1370, 1378–1379, 1382–1383, 1388）

```ts
1359 │ 
1360 │ /**
1361 ▶  * Warns if ngSrcset is present and no loader is configured (i.e. the default one is being used).
1362 │  */
1363 │ function assertNoNgSrcsetWithoutLoader(dir: NgOptimizedImage, imageLoader: ImageLoader) {
1364 ▶   if (dir.ngSrcset && imageLoader === noopImageLoader) {
1365 ▶     console.warn(
1366 │       formatRuntimeError(
1367 │         RuntimeErrorCode.MISSING_NECESSARY_LOADER,
1368 │         `${imgDirectiveDetails(dir.ngSrc)} the \`ngSrcset\` attribute is present but ` +
1369 │           `no image loader is configured (i.e. the default one is being used), ` +
1370 ▶           `which would result in the same image being used for all configured sizes. ` +
1371 │           `To fix this, provide a loader or remove the \`ngSrcset\` attribute from the image.`,
1372 │       ),
1373 │     );
1374 │   }
1375 │ }
1376 │ 
1377 │ /**
1378 ▶  * Warns if loaderParams is present and no loader is configured (i.e. the default one is being
1379 ▶  * used).
1380 │  */
1381 │ function assertNoLoaderParamsWithoutLoader(dir: NgOptimizedImage, imageLoader: ImageLoader) {
1382 ▶   if (dir.loaderParams && imageLoader === noopImageLoader) {
1383 ▶     console.warn(
1384 │       formatRuntimeError(
1385 │         RuntimeErrorCode.MISSING_NECESSARY_LOADER,
1386 │         `${imgDirectiveDetails(dir.ngSrc)} the \`loaderParams\` attribute is present but ` +
1387 │           `no image loader is configured (i.e. the default one is being used), ` +
1388 ▶           `which means that the loaderParams data will not be consumed and will not affect the URL. ` +
1389 │           `To fix this, provide a custom loader or remove the \`loaderParams\` attribute from the image.`,
1390 │       ),
1391 │     );
1392 │   }
1393 │ }
1394 │ 
```

1364 行目と 1382 行目は、ローダーが既定（`noopImageLoader`）のまま `ngSrcset`・`loaderParams` を書いたときの警告です。投げずに警告だけなので、画像は描かれます。`ngSrcset="1x, 2x"` なら `srcset="favicon.ico 1x, favicon.ico 2x"` と同じ URL が並びます（DEMO の srcsetNoLoader）。1370 行目の「同じ画像が全部の大きさに使われる」はこのことです。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1416–1438 （▶ の行: 1418, 1420, 1422–1424, 1427, 1431–1432）

```ts
1416 │ 
1417 │ /**
1418 ▶  * Warns if placeholder's dimension are over a threshold.
1419 │  *
1420 ▶  * This assert function is meant to only run on the browser.
1421 │  */
1422 ▶ function assertPlaceholderDimensions(dir: NgOptimizedImage, imgElement: HTMLImageElement) {
1423 ▶   const computedStyle = window.getComputedStyle(imgElement);
1424 ▶   let renderedWidth = parseFloat(computedStyle.getPropertyValue('width'));
1425 │   let renderedHeight = parseFloat(computedStyle.getPropertyValue('height'));
1426 │ 
1427 ▶   if (renderedWidth > PLACEHOLDER_DIMENSION_LIMIT || renderedHeight > PLACEHOLDER_DIMENSION_LIMIT) {
1428 │     console.warn(
1429 │       formatRuntimeError(
1430 │         RuntimeErrorCode.PLACEHOLDER_DIMENSION_LIMIT_EXCEEDED,
1431 ▶         `${imgDirectiveDetails(dir.ngSrc)} it uses a placeholder image, but at least one ` +
1432 ▶           `of the dimensions attribute (height or width) exceeds the limit of ${PLACEHOLDER_DIMENSION_LIMIT}px. ` +
1433 │           `To fix this, use a smaller image as a placeholder.`,
1434 │       ),
1435 │     );
1436 │   }
1437 │ }
1438 │ 
```

1418 行目のコメントは「placeholder の大きさが上限を超えたら」と書きますが、1423〜1427 行目が測るのは `<img>` 要素そのものの描かれた幅と高さ（119 行目の 1000 px）です。placeholder の画像の大きさは見ません。1431〜1432 行目の文も「dimensions attribute (height or width)」と img の側の話をしています。呼ぶのは `ngOnChanges` で `placeholder` が変わったとき、かつブラウザ（`ngServerMode` が false）のときだけです（NgOptimizedImage の章の 7 節）。

## 7. assertDevMode：開発用のクラスの安全装置

📄 `angular/packages/common/src/directives/ng_optimized_image/asserts.ts` L9–26 （▶ の行: 13–16, 19–20, 22）

```ts
 9 │ import {ɵRuntimeError as RuntimeError} from '@angular/core';
10 │ 
11 │ import {RuntimeErrorCode} from '../../errors';
12 │ 
13 ▶ /**
14 ▶  * Asserts that the application is in development mode. Throws an error if the application is in
15 ▶  * production mode. This assert can be used to make sure that there is no dev-mode code invoked in
16 ▶  * the prod mode accidentally.
17 │  */
18 │ export function assertDevMode(checkName: string) {
19 ▶   if (!ngDevMode) {
20 ▶     throw new RuntimeError(
21 │       RuntimeErrorCode.UNEXPECTED_DEV_MODE_CHECK_IN_PROD_MODE,
22 ▶       `Unexpected invocation of the ${checkName} in the prod mode. ` +
23 │         `Please make sure that the prod mode is enabled for production builds.`,
24 │     );
25 │   }
26 │ }
```

呼ぶのは `LCPImageObserver` と `PreconnectLinkChecker` のコンストラクタの 2 か所です（LCP と preload の章の 1・4 節）。ディレクティブはこの 2 つを `ngDevMode` の中でしか `inject` しないので、本番で 19 行目が真になるのは、開発用のコードが紛れ込んだときだけです。22 行目の文の「prod mode が有効か確かめて」は、本番なのに開発の検査が呼ばれた、という向きの文なので、読むときは「開発用のクラスを本番で作った」と読み替えます。

## 8. DEMO：説明文の形の img を本物で描く

> **🧪 DEMO — 21 の場面を本物の NgOptimizedImage で描き、img の属性を説明と並べる**
>
> 場面ごとに、章の中の小さなコンポーネント（テンプレートは表の左の形）を `createComponent` で描きます。`NgOptimizedImage` はこのサイトの本物（`@angular/common` 22.2.6）です。ローダーは説明文の形の URL（`path/hello.jpg?w=100` など）を作り、このページでは同じ大きさの SVG の data: URL に置き換えて返します（通信しません）。表では data: URL を元の URL に戻して出します。ローダーなしの 4 場面だけは、このサイトにある `/favicon.ico` を読みます。「開発モード（記録）」は、同じ demo のファイルを Node（domino の上の JIT）で開発モードのまま走らせた記録の再生です。このページの列は本番ビルドなので、検査は走りません。
>
> ※ は、説明文の例のまま使うと説明と違う結果になる場面です（2・3・4 節）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-image)

見どころは 3 つです。step3 の `src` が `-undefined.jpg` で終わること（2 節）、srcsetDoc が開発では `NG02954`、本番では `TypeError` になること（3 節）、そして本番の列では srcset4x・fillWh・priorityLoading・ph10001・base64 が例外なしで描かれることです。検査は開発モードの道具で、本番の動きは「何も言わずにそれらしく描く」になります（fillWh では fill が勝ち、`width`・`height` は静的な属性のまま残ります）。

## 9. ここまでを 1 本に

- 👤 `<img ngSrc="logo.png" width="200" height="100">` — あなたのテンプレート（251 行目の形）
  - `ngOnInit()` — ng\_optimized\_image.ts L422 — *開発モードだけの検査*
    - `assertNoConflictingSrc / assertNotBase64Image / assertNotBlobUrl` — L802・L832・L941 — *4 節*
    - `assertValidPlaceholder → assertNoOversizedDataUrl` — L864・L905 — *6 節。4000 で警告、10000 で例外*
    - `assertNoNgSrcsetWithoutLoader / assertNoLoaderParamsWithoutLoader` — L1363・L1381 — *警告だけ*
    - `assertNoImageDistortion / assertNonZeroRenderedHeight` — L1080・L1241 — *load のリスナー。5 節*
  - `setHostAttributes()` — L486 — *本番でも走る*
    - `getRewrittenSrc() → imageLoader({src})` — L627 — *width なし → 例のローダーは -undefined.jpg*
- `<link rel="preconnect" data-ngimg>` — angular-cli find\_image\_domains.ts — *177 行目の約束。webpack の browser ビルダーだけ*

## テストと直し方

| spec | describe / it | どこで走るか |
| --- | --- | --- |
| common/test/directives/ng\_optimized\_image\_spec.ts | describe `setup error handling`（326 行目）の should throw if both \`src\` and \`ngSrc\` are present（327）・… \`ngSrc\` contains a Base64-encoded image（359）・… a \`blob:\` URL（373）・… set to an empty string（507）。describe `placeholder attribute`（1151）の should throw if placeholderConfig is provided without placeholder（1410）・should throw if a very large inline placeholder is supplied（1446）・should warn if a large inline placeholder is supplied（1459）。describe `loaders`（1733）の should set \`src\` to match \`ngSrc\` if image loader is not provided（1754）・should warn if there is no image loader but \`ngSrcset\` is present（1833）・… \`loaderParams\` is present（1851） | //packages/common/test:test（Node）。1488・1504 行目の placeholder の大きさの 2 つは `isBrowser` の中で、ブラウザだけ |
| core/test/bundling/image-directive/e2e/ | image-distortion.e2e-spec.ts の should warn if there is image distortion（37 行目）、fill-mode.e2e-spec.ts の should warn if an image in the fill mode has zero height after rendering（31 行目） | WebDriver の e2e（5 節の 2 つ） |

📄 `手元で走らせたコマンド` L1–3

```
1 │ cd ~/angular-research/angular
2 │ pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
3 │   "--test_arg=--filter=^Image directive"
```

📄 `結果（2026-11-21）` L1–4

```
1 │ Ran 151 of 667 specs
2 │ 151 specs, 0 failures
3 │ Finished in 0.368 seconds
4 │ //packages/common/test:test                                              PASSED in 1.1s
```

名前が `Image directive` で始まる it が 151 件、全部成功です。1434 行目の it の名前は「should throw if there is no image loader but \`ngSrcset\` is present」ですが、中身のテンプレートは `placeholder="true"` で、確かめているのは「placeholder が true なのにローダーが既定」の例外（`assertNoRelativePlaceholderWithoutLoader`、LCP と preload の章）です。名前と中身が合っていません。

説明文の例が型検査に通るかは、例を 1 つのファイルに並べて strict と strictTemplates の ngc にかけました。Step 2 の 2 つの providers と Step 3・306 行目のテンプレートは通り、Step 1（197〜202 行目）だけが `NG2001` です。

直すとしたら、2 節の custom loader の例は 242 行目を `config.width` が無い呼び出しに耐える形にすること、222〜226 行目の一覧に `provideNetlifyLoader` を足すこと、177 行目を「開発モードで preconnect が無いと警告する」に戻すことです。どれも JSDoc だけの変更で、API リファレンスの golden（`goldens/public-api/common`）は変わりません。3 節の `decoding` の説明に priority の扱いを足すなら、331 行目の段落に 1 文です。動きを固める spec は describe `decoding attribute`（810 行目）にあります。

## 聞かれそうな質問

**Q. 説明文の custom loader をそのまま貼ったら、src が -undefined.jpg になりました。なぜ？**

ディレクティブは `src` を作るとき、ローダーに `{src}` だけを渡し `width` を渡しません（2 節）。242 行目の例は `${config.width}` を無条件に入れるので `undefined` が文字になります。285〜290 行目で一度作った値を覚えるので、そのまま残ります。

**Q. NgOptimizedImage は preconnect の link を作ってくれますか？**

ディレクティブは作りません。開発モードで priority の画像の origin に preconnect が無いと警告するだけです（LCP と preload の章）。177 行目の「自動で作る」は angular-cli の webpack の `browser` ビルダーの変換（find\_image\_domains.ts の 11〜35 行目、browser/index.ts の 322 行目）のことで、既定の `application` ビルダーは作りません。

**Q. 本番ビルドでも width がないと怒られますか？**

怒られません。検査は `ngOnInit` の `if (ngDevMode)` の中だけです（NgOptimizedImage の章の 3 節）。本番では属性を書くところで `this.width!.toString()` が `TypeError` になります（DEMO の srcsetDoc）。fill のときは width を見ないので描けます。

**Q. placeholder の data: URL はどこまで長くしてよいですか？**

4000 文字を超えると警告、10000 文字を超えると例外です（130・131 行目、911・922 行目）。開発モードだけの検査なので、本番では 10001 文字でも描きます（DEMO の ph10001）。

**Q. data: の画像を ngSrc に渡すと何が起きますか？**

開発モードでは 834 行目で `data:` を見て投げます。文は「Base64」と書きますが、percent エンコードの SVG でも同じです。本番では検査が無く、そのまま描きます。

## 読み終えて

- 冒頭の箇条書きのうち、177 行目の preconnect の自動生成はディレクティブの仕事ではなく、angular-cli の古いビルダーだけの仕事です。
- Step 3 と custom loader の例を組み合わせると `src` に `undefined` が入ります。ローダーは `width` の無い呼び出しを受けます。
- 306 行目の `ngSrcset` の例は width・height が無く、開発では例外、本番では `TypeError` です。
- 222〜226 行目の組み込みのローダーの一覧には Netlify がありません（index.ts は出している）。
- 検査の文は開発モードだけです。本番では同じ間違いが黙って描かれます。

---

← 前: [spec と issue を読む：Forms の説明文を固めているもの](../fmd/10-fmd-tests-issues.md)  
次: [画像のローダーと速さの小道具の説明文](02-cmd-image-loaders.md) →
