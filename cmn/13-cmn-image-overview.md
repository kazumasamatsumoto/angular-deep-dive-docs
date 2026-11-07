[目次](../README.md) › [common の内側](README.md) › 第 13 回 / 全 20 回

# NgOptimizedImage の全体：入力・検査・img に書く属性

> NgOptimizedImage の入力（ngSrc・width・height・priority・fill・loading・placeholder など）と、ngOnInit の開発モードの検査（assert の関数の並び）、setHostAttributes が loading・fetchpriority・decoding・width・height を書く行、priority の数の数え方、初期化のあとの入力の変更を止める assertNoPostInitInputChange。ページの上で本物の NgOptimizedImage を描いて、img に書かれた属性を見るデモ。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-image-overview)

---

`<img ngSrc="hero.jpg" width="800" height="600" priority>` と書くと、`NgOptimizedImage` が `img` に `loading`・`fetchpriority`・`decoding`・`src`・`srcset` を書き込みます。この章では、入力がどの `transform` で何の型になり、`ngOnInit` がどの順で検査をして、`setHostAttributes` がどの行でどの値を書くのかを 1 ステップずつ追います。「priority を付けたら何が変わるの？」「width を後から変えたら？」に行番号で答えられるようにします。

読む対象は `packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts`（1475 行）と、その spec の `packages/common/test/directives/ng_optimized_image_spec.ts` です。

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
13. **13. NgOptimizedImage**（この章）
14. [14. srcset と sizes](14-cmn-image-srcset.md)
15. [15. 画像のローダー](15-cmn-image-loaders.md)
16. [16. LCP と preload](16-cmn-image-lcp-preload.md)
17. [17. Location](17-cmn-location.md)
18. [18. テスト用の Location](18-cmn-location-testing.md)
19. [19. ViewportScroller](19-cmn-viewport-scroller.md)
20. [20. issue と PR を読む](20-cmn-issues.md)

第 13〜16 回は 1 つのディレクティブを 4 つに分けて読みます。この回が全体の流れ（入力 → 検査 → 属性を書く）、[第 14 回](14-cmn-image-srcset.md)が `srcset` と `sizes` の作り方、[第 15 回](15-cmn-image-loaders.md)が URL を作るローダー、[第 16 回](16-cmn-image-lcp-preload.md)が LCP（Largest Contentful Paint。ページで一番大きく描かれた要素が描かれた時刻）の警告・preconnect・preload・placeholder です。

## 1. 何に付くディレクティブか

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L257–283 （▶ の行: 258, 260–264, 267–268, 273–276）

```ts
257 │ @Directive({
258 ▶   selector: 'img[ngSrc]',
259 │   host: {
260 ▶     '[style.position]': 'fill ? "absolute" : null',
261 ▶     '[style.width]': 'fill ? "100%" : null',
262 ▶     '[style.height]': 'fill ? "100%" : null',
263 ▶     '[style.inset]': 'fill ? "0" : null',
264 ▶     '[style.background-size]': 'placeholder ? "cover" : null',
265 │     '[style.background-position]': 'placeholder ? "50% 50%" : null',
266 │     '[style.background-repeat]': 'placeholder ? "no-repeat" : null',
267 ▶     '[style.background-image]': 'placeholder ? generatePlaceholder(placeholder) : null',
268 ▶     '[style.filter]':
269 │       'placeholder && shouldBlurPlaceholder(placeholderConfig) ? "blur(15px)" : null',
270 │   },
271 │ })
272 │ export class NgOptimizedImage implements OnInit, OnChanges {
273 ▶   private imageLoader = inject(IMAGE_LOADER);
274 ▶   private config: ImageConfig = processConfig(inject(IMAGE_CONFIG));
275 ▶   private renderer = inject(Renderer2);
276 ▶   private imgElement: HTMLImageElement = inject(ElementRef).nativeElement;
277 │   private injector = inject(Injector);
278 │   private destroyRef = inject(DestroyRef);
279 │ 
280 │   // An LCP image observer should be injected only in development mode.
281 │   // Do not assign it to `null` to avoid having a redundant property in the production bundle.
282 │   private lcpObserver?: LCPImageObserver;
283 │ 
```

- 258 行目：セレクタは `img[ngSrc]`。`ngSrc` の付いた `img` だけに付きます。`src` と書いた `img` には付きません。
- 260〜263 行目：`fill` のとき、ホストのスタイルに `position: absolute`・`width/height: 100%`・`inset: 0` を書きます。親の箱いっぱいに広げる、という意味です（スタイルのバインディングの仕組みは [domr-styling-overview](../domr/09-domr-styling-overview.md)）。
- 264〜269 行目：`placeholder` のときの背景画像とぼかし。[第 16 回](16-cmn-image-lcp-preload.md)で読みます。
- 273〜276 行目：`IMAGE_LOADER`（URL を作る関数。[第 15 回](15-cmn-image-loaders.md)）、`IMAGE_CONFIG`（breakpoints などの設定）、`Renderer2`、ホストの `img` 要素そのものを inject します。`img` への書き込みはすべてこの `renderer` を通ります（[domr-renderer-api](../domr/02-domr-renderer-api.md)）。

## 2. 入力と transform

`transform` は、テンプレートから来た値をディレクティブに入れる前に通す関数です。`width="800"` のような静的な属性は文字列で来るので、ここで数や真偽に直します。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L292–328 （▶ の行: 297, 310, 316, 322, 328）

````ts
292 │   /**
293 │    * Name of the source image.
294 │    * Image name will be processed by the image loader and the final URL will be applied as the `src`
295 │    * property of the image.
296 │    */
297 ▶   @Input({required: true, transform: unwrapSafeUrl}) ngSrc!: string;
298 │ 
299 │   /**
300 │    * A comma separated list of width or density descriptors.
301 │    * The image name will be taken from `ngSrc` and combined with the list of width or density
302 │    * descriptors to generate the final `srcset` property of the image.
303 │    *
304 │    * Example:
305 │    * ```html
306 │    * <img ngSrc="hello.jpg" ngSrcset="100w, 200w" />  =>
307 │    * <img src="path/hello.jpg" srcset="path/hello.jpg?w=100 100w, path/hello.jpg?w=200 200w" />
308 │    * ```
309 │    */
310 ▶   @Input() ngSrcset!: string;
311 │ 
312 │   /**
313 │    * The base `sizes` attribute passed through to the `<img>` element.
314 │    * Providing sizes causes the image to create an automatic responsive srcset.
315 │    */
316 ▶   @Input() sizes?: string;
317 │ 
318 │   /**
319 │    * For responsive images: the intrinsic width of the image in pixels.
320 │    * For fixed size images: the desired rendered width of the image in pixels.
321 │    */
322 ▶   @Input({transform: numberAttribute}) width: number | undefined;
323 │ 
324 │   /**
325 │    * For responsive images: the intrinsic height of the image in pixels.
326 │    * For fixed size images: the desired rendered height of the image in pixels.
327 │    */
328 ▶   @Input({transform: numberAttribute}) height: number | undefined;
````

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L340–376 （▶ の行: 340, 350, 355, 360, 365, 371, 376）

```ts
340 ▶   @Input() decoding?: 'sync' | 'async' | 'auto';
341 │ 
342 │   /**
343 │    * The desired loading behavior (lazy, eager, or auto). Defaults to `lazy`,
344 │    * which is recommended for most images.
345 │    *
346 │    * Warning: Setting images as loading="eager" or loading="auto" marks them
347 │    * as non-priority images and can hurt loading performance. For images which
348 │    * may be the LCP element, use the `priority` attribute instead of `loading`.
349 │    */
350 ▶   @Input() loading?: 'lazy' | 'eager' | 'auto';
351 │ 
352 │   /**
353 │    * Indicates whether this image should have a high priority.
354 │    */
355 ▶   @Input({transform: booleanAttribute}) priority = false;
356 │ 
357 │   /**
358 │    * Data to pass through to custom loaders.
359 │    */
360 ▶   @Input() loaderParams?: {[key: string]: any};
361 │ 
362 │   /**
363 │    * Disables automatic srcset generation for this image.
364 │    */
365 ▶   @Input({transform: booleanAttribute}) disableOptimizedSrcset = false;
366 │ 
367 │   /**
368 │    * Sets the image to "fill mode", which eliminates the height/width requirement and adds
369 │    * styles such that the image fills its containing element.
370 │    */
371 ▶   @Input({transform: booleanAttribute}) fill = false;
372 │ 
373 │   /**
374 │    * A URL or data URL for an image to be used as a placeholder while this image loads.
375 │    */
376 ▶   @Input({transform: booleanOrUrlAttribute}) placeholder?: string | boolean;
```

| 入力 | 行 | transform | 何に使うか |
| --- | --- | --- | --- |
| `ngSrc` | 297 | `unwrapSafeUrl`（必須） | ローダーに渡す画像の名前 |
| `ngSrcset` | 310 | なし | `"100w, 200w"` のような候補の幅（第 14 回） |
| `sizes` | 316 | なし | 表示の幅。あると自動の srcset が「幅の候補」になる（第 14 回） |
| `width`・`height` | 322・328 | `numberAttribute` | `img` の width・height 属性、縦横比 |
| `decoding` | 340 | なし | `decoding` 属性（5 節） |
| `loading` | 350 | なし | `loading` 属性（5 節） |
| `priority` | 355 | `booleanAttribute` | LCP になる画像の印（5 節） |
| `loaderParams` | 360 | なし | ローダーに渡す追加の値（第 15 回） |
| `disableOptimizedSrcset` | 365 | `booleanAttribute` | 自動の srcset を止める（第 14 回） |
| `fill` | 371 | `booleanAttribute` | width・height なしで親いっぱいに描く |
| `placeholder` | 376 | `booleanOrUrlAttribute` | 読み込み中の背景（第 16 回） |

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L378–398 （▶ の行: 382, 386–387, 390, 398）

```ts
378 │   /**
379 │    * Configuration object for placeholder settings. Options:
380 │    *   * blur: Setting this to false disables the automatic CSS blur.
381 │    */
382 ▶   @Input() placeholderConfig?: ImagePlaceholderConfig;
383 │ 
384 │   /**
385 │    * Value of the `src` attribute if set on the host `<img>` element.
386 ▶    * This input is exclusively read to assert that `src` is not set in conflict
387 ▶    * with `ngSrc` and that images don't start to load until a lazy loading strategy is set.
388 │    * @internal
389 │    */
390 ▶   @Input() src?: string;
391 │ 
392 │   /**
393 │    * Value of the `srcset` attribute if set on the host `<img>` element.
394 │    * This input is exclusively read to assert that `srcset` is not set in conflict
395 │    * with `ngSrcset` and that images don't start to load until a lazy loading strategy is set.
396 │    * @internal
397 │    */
398 ▶   @Input() srcset?: string;
```

382 行目の `placeholderConfig` はぼかしを止めるための設定です（第 16 回）。390・398 行目の `src`・`srcset` は `@internal` の入力で、386〜387 行目のとおり 「利用者が `ngSrc` と一緒に書いてしまっていないか」を検査するためだけにあります（3 節の 429・431 行目）。入力として宣言しているので、`[srcset]="…"` とバインドしても値はこの入力に入り、`img` には届きません（第 14 回の「テストと直し方」）。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1459–1475 （▶ の行: 1461–1462, 1465, 1470–1472, 1474）

```ts
1459 │ // Transform function to handle SafeValue input for ngSrc. This doesn't do any sanitization,
1460 │ // as that is not needed for img.src and img.srcset. This transform is purely for compatibility.
1461 ▶ function unwrapSafeUrl(value: string | SafeValue): string {
1462 ▶   if (typeof value === 'string') {
1463 │     return value;
1464 │   }
1465 ▶   return unwrapSafeValue(value);
1466 │ }
1467 │ 
1468 │ // Transform function to handle inputs which may be booleans, strings, or string representations
1469 │ // of boolean values. Used for the placeholder attribute.
1470 ▶ export function booleanOrUrlAttribute(value: boolean | string): boolean | string {
1471 ▶   if (typeof value === 'string' && value !== 'true' && value !== 'false' && value !== '') {
1472 ▶     return value;
1473 │   }
1474 ▶   return booleanAttribute(value);
1475 │ }
```

- 1461〜1466 行目 `unwrapSafeUrl`：文字列ならそのまま。`DomSanitizer.bypassSecurityTrustUrl` などで包んだ値（`SafeValue`）なら中身を取り出します。1459 行目のコメントのとおり、サニタイズ（危ない値を消す処理）はしません。
- 1470〜1475 行目 `booleanOrUrlAttribute`：`'true'`・`'false'`・`''` 以外の文字列は URL としてそのまま返し、それ以外は `booleanAttribute` に回します。`placeholder`（値なし）は `''` なので `true` になります。

📄 `angular/packages/core/src/util/coercion.ts` L23–25 （▶ の行: 24）

```ts
23 │ export function booleanAttribute(value: unknown): boolean {
24 ▶   return typeof value === 'boolean' ? value : value != null && value !== 'false';
25 │ }
```

📄 `angular/packages/core/src/util/coercion.ts` L41–47 （▶ の行: 41, 45–46）

```ts
41 ▶ export function numberAttribute(value: unknown, fallbackValue = NaN): number {
42 │   // parseFloat(value) handles most of the cases we're interested in (it treats null, empty string,
43 │   // and other non-number values as NaN, where Number just uses 0) but it considers the string
44 │   // '123hello' to be a valid number. Therefore we also check if Number(value) is NaN.
45 ▶   const isNumberValue = !isNaN(parseFloat(value as any)) && !isNaN(Number(value));
46 ▶   return isNumberValue ? Number(value) : fallbackValue;
47 │ }
```

core の 2 つの transform は [cdk-platform-bidi](../cdk/02-cdk-platform-bidi.md) でも読んでいます。ここで大事なのは 41 行目の既定値 `NaN` です。`[width]="undefined"` とバインドすると、`width` は `undefined` ではなく `NaN` になります。これが 4 節の検査の結果を変えます（DEMO で確かめられます）。

## 3. ngOnInit の前半：開発モードの検査の並び

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L421–449 （▶ の行: 423, 425, 427–431, 433–436, 439–440, 442–445, 447–448）

```ts
421 │   /** @docs-private */
422 │   ngOnInit() {
423 ▶     performanceMarkFeature('NgOptimizedImage');
424 │ 
425 ▶     if (ngDevMode) {
426 │       const ngZone = this.injector.get(NgZone);
427 ▶       assertNonEmptyInput(this, 'ngSrc', this.ngSrc);
428 ▶       assertValidNgSrcset(this, this.ngSrcset);
429 ▶       assertNoConflictingSrc(this);
430 ▶       if (this.ngSrcset) {
431 ▶         assertNoConflictingSrcset(this);
432 │       }
433 ▶       assertNotBase64Image(this);
434 ▶       assertNotBlobUrl(this);
435 ▶       if (this.fill) {
436 ▶         assertEmptyWidthAndHeight(this);
437 │         // This leaves the Angular zone to avoid triggering unnecessary change detection cycles when
438 │         // `load` tasks are invoked on images.
439 ▶         ngZone.runOutsideAngular(() =>
440 ▶           assertNonZeroRenderedHeight(this, this.imgElement, this.renderer, this.destroyRef),
441 │         );
442 ▶       } else {
443 ▶         assertNonEmptyWidthAndHeight(this);
444 ▶         if (this.height !== undefined) {
445 ▶           assertGreaterThanZero(this, this.height, 'height');
446 │         }
447 ▶         if (this.width !== undefined) {
448 ▶           assertGreaterThanZero(this, this.width, 'width');
449 │         }
```

1. **423 行目：使っている印を付ける**

   `performanceMarkFeature('NgOptimizedImage')` は、Chrome の性能の記録に「この機能を使った」と残す呼び出しです。本番でも走ります。
2. **425 行目：ここから 479 行目までは `ngDevMode` のときだけ**

   `ngDevMode` は開発ビルドで真になる大域の値です。angular-cli は最適化するビルドで `ngDevMode` を `false` に置き換えるので、本番のバンドルでは 426〜478 行目がまるごと消えます。**検査はどれも開発モードだけ**で、本番では例外も警告も出ません。
3. **427〜434 行目：`ngSrc` と `ngSrcset` の形**

   427 行目が「`ngSrc` が空でない文字列か」、428 行目が `ngSrcset` の書式（第 14 回）、429・431 行目が `src`・`srcset` との二重の指定、433・434 行目が `data:`・`blob:` で始まる `ngSrc` を拒みます。どれも見つけたら `RuntimeError` を投げます。
4. **435〜441 行目：`fill` なら width・height が*無い*こと**

   436 行目で width・height があれば投げ、439〜441 行目で「読み込んだ後に高さが 0 でないか」を見るリスナーを付けます（`runOutsideAngular` は zone.js のアプリで変更検知を起こさないため）。
5. **442〜449 行目：`fill` でなければ width・height が*ある*こと、0 より大きいこと**

   443 行目で無ければ投げ、444・447 行目で「`undefined` でなければ」0 より大きいかを見ます。続く 452〜454 行目（次の引用）で、読み込んだ後に縦横比が崩れていないかを見るリスナーを付けます。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1203–1235 （▶ の行: 1208–1211, 1227–1228）

```ts
1203 │ /**
1204 │  * Verifies that a specified input is set.
1205 │  */
1206 │ function assertNonEmptyWidthAndHeight(dir: NgOptimizedImage) {
1207 │   let missingAttributes = [];
1208 ▶   if (dir.width === undefined) missingAttributes.push('width');
1209 ▶   if (dir.height === undefined) missingAttributes.push('height');
1210 ▶   if (missingAttributes.length > 0) {
1211 ▶     throw new RuntimeError(
1212 │       RuntimeErrorCode.REQUIRED_INPUT_MISSING,
1213 │       `${imgDirectiveDetails(dir.ngSrc)} these required attributes ` +
1214 │         `are missing: ${missingAttributes.map((attr) => `"${attr}"`).join(', ')}. ` +
1215 │         `Including "width" and "height" attributes will prevent image-related layout shifts. ` +
1216 │         `To fix this, include "width" and "height" attributes on the image tag or turn on ` +
1217 │         `"fill" mode with the \`fill\` attribute.`,
1218 │     );
1219 │   }
1220 │ }
1221 │ 
1222 │ /**
1223 │  * Verifies that width and height are not set. Used in fill mode, where those attributes don't make
1224 │  * sense.
1225 │  */
1226 │ function assertEmptyWidthAndHeight(dir: NgOptimizedImage) {
1227 ▶   if (dir.width || dir.height) {
1228 ▶     throw new RuntimeError(
1229 │       RuntimeErrorCode.INVALID_INPUT,
1230 │       `${imgDirectiveDetails(dir.ngSrc)} the attributes \`height\` and/or \`width\` are present ` +
1231 │         `along with the \`fill\` attribute. Because \`fill\` mode causes an image to fill its containing ` +
1232 │         `element, the size attributes have no effect and should be removed.`,
1233 │     );
1234 │   }
1235 │ }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1036–1073 （▶ の行: 1062–1067）

```ts
1036 │ /**
1037 │  * Verify that none of the listed inputs has changed.
1038 │  */
1039 │ function assertNoPostInitInputChange(
1040 │   dir: NgOptimizedImage,
1041 │   changes: SimpleChanges,
1042 │   inputs: string[],
1043 │ ) {
1044 │   inputs.forEach((input) => {
1045 │     const isUpdated = Object.hasOwn(changes, input);
1046 │     if (isUpdated && !changes[input].isFirstChange()) {
1047 │       if (input === 'ngSrc') {
1048 │         // When the `ngSrc` input changes, we detect that only in the
1049 │         // `ngOnChanges` hook, thus the `ngSrc` is already set. We use
1050 │         // `ngSrc` in the error message, so we use a previous value, but
1051 │         // not the updated one in it.
1052 │         dir = {ngSrc: changes[input].previousValue} as NgOptimizedImage;
1053 │       }
1054 │       throw postInitInputChangeError(dir, input);
1055 │     }
1056 │   });
1057 │ }
1058 │ 
1059 │ /**
1060 │  * Verifies that a specified input is a number greater than 0.
1061 │  */
1062 ▶ function assertGreaterThanZero(dir: NgOptimizedImage, inputValue: unknown, inputName: string) {
1063 ▶   const validNumber = typeof inputValue === 'number' && inputValue > 0;
1064 ▶   const validString =
1065 ▶     typeof inputValue === 'string' && /^\d+$/.test(inputValue.trim()) && parseInt(inputValue) > 0;
1066 ▶   if (!validNumber && !validString) {
1067 ▶     throw new RuntimeError(
1068 │       RuntimeErrorCode.INVALID_INPUT,
1069 │       `${imgDirectiveDetails(dir.ngSrc)} \`${inputName}\` has an invalid value. ` +
1070 │         `To fix this, provide \`${inputName}\` as a number greater than 0.`,
1071 │     );
1072 │   }
1073 │ }
```

1208・1209 行目は `=== undefined` で比べます。`[width]="undefined"` の `NaN` はここを通り抜け、1063 行目の `inputValue > 0` が `false` になって「`width` has an invalid value」で投げます。書かなかったとき（`undefined`）とバインドで `undefined` を渡したとき（`NaN`）で、出る例外の文が違うということです。1227 行目の `fill` の側は `dir.width || dir.height` なので、`NaN` は偽として通ります。

## 4. ngOnInit の後半：ローダーの検査・LCP・priority

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L450–484 （▶ の行: 452–453, 456–459, 461–464, 466–467, 470–472, 474–476, 480–481, 483）

```ts
450 │         // Only check for distorted images when not in fill mode, where
451 │         // images may be intentionally stretched, cropped or letterboxed.
452 ▶         ngZone.runOutsideAngular(() =>
453 ▶           assertNoImageDistortion(this, this.imgElement, this.renderer, this.destroyRef),
454 │         );
455 │       }
456 ▶       assertValidLoadingInput(this);
457 ▶       assertValidDecodingInput(this);
458 ▶       if (!this.ngSrcset) {
459 ▶         assertNoComplexSizes(this);
460 │       }
461 ▶       assertValidPlaceholder(this, this.imageLoader);
462 ▶       assertNotMissingBuiltInLoader(this.ngSrc, this.imageLoader);
463 ▶       assertNoNgSrcsetWithoutLoader(this, this.imageLoader);
464 ▶       assertNoLoaderParamsWithoutLoader(this, this.imageLoader);
465 │ 
466 ▶       ngZone.runOutsideAngular(() => {
467 ▶         this.lcpObserver!.registerImage(this.getRewrittenSrc(), this.priority);
468 │       });
469 │ 
470 ▶       if (this.priority) {
471 ▶         const checker = this.injector.get(PreconnectLinkChecker);
472 ▶         checker.assertPreconnect(this.getRewrittenSrc(), this.ngSrc);
473 │ 
474 ▶         if (typeof ngServerMode !== 'undefined' && !ngServerMode) {
475 ▶           const applicationRef = this.injector.get(ApplicationRef);
476 ▶           assetPriorityCountBelowThreshold(applicationRef);
477 │         }
478 │       }
479 │     }
480 ▶     if (this.placeholder) {
481 ▶       this.removePlaceholderOnLoad(this.imgElement);
482 │     }
483 ▶     this.setHostAttributes();
484 │   }
```

1. **456〜464 行目：残りの検査**

   456 行目 `loading`、457 行目 `decoding`、459 行目 `sizes` に px が無いか（第 14 回）、461 行目 `placeholder`（第 16 回）、462〜464 行目は「ローダーが既定のままなのに、CDN の URL・`ngSrcset`・`loaderParams` を使っている」の警告です（第 15 回）。
2. **466〜468 行目：LCP の見張り役に登録**

   `LCPImageObserver` に「この URL の画像は priority か」を伝えます。後で LCP になった画像が priority でなければ、コンソールにエラーを出します（[第 16 回](16-cmn-image-lcp-preload.md)）。
3. **470〜478 行目：priority のときだけ preconnect と数**

   471〜472 行目で `PreconnectLinkChecker` が「画像の origin への `<link rel="preconnect">` が head にあるか」を見ます（第 16 回）。474〜477 行目はブラウザ（`ngServerMode` が `false`）のときだけ、priority の数を数えます（6 節）。
4. **480〜483 行目：ここからは本番でも走る**

   `placeholder` があれば、読み込み後に外すリスナーを付け（第 16 回）、最後に 483 行目で `setHostAttributes` を呼びます。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1284–1308 （▶ の行: 1289, 1299–1300）

```ts
1284 │ /**
1285 │  * Verifies that the `loading` attribute is set to a valid input &
1286 │  * is not used on priority images.
1287 │  */
1288 │ function assertValidLoadingInput(dir: NgOptimizedImage) {
1289 ▶   if (dir.loading && dir.priority) {
1290 │     throw new RuntimeError(
1291 │       RuntimeErrorCode.INVALID_INPUT,
1292 │       `${imgDirectiveDetails(dir.ngSrc)} the \`loading\` attribute ` +
1293 │         `was used on an image that was marked "priority". ` +
1294 │         `Setting \`loading\` on priority images is not allowed ` +
1295 │         `because these images will always be eagerly loaded. ` +
1296 │         `To fix this, remove the “loading” attribute from the priority image.`,
1297 │     );
1298 │   }
1299 ▶   const validInputs = ['auto', 'eager', 'lazy'];
1300 ▶   if (typeof dir.loading === 'string' && !validInputs.includes(dir.loading)) {
1301 │     throw new RuntimeError(
1302 │       RuntimeErrorCode.INVALID_INPUT,
1303 │       `${imgDirectiveDetails(dir.ngSrc)} the \`loading\` attribute ` +
1304 │         `has an invalid value (\`${dir.loading}\`). ` +
1305 │         `To fix this, provide a valid value ("lazy", "eager", or "auto").`,
1306 │     );
1307 │   }
1308 │ }
```

1289 行目：`loading` と `priority` は一緒に書けません。priority の画像は必ず `eager`（5 節の 606 行目）なので、`loading` を書くのは間違いだ、という扱いです。1299〜1300 行目は値の検査です。`loading` はテンプレートの型検査でも `'lazy' | 'eager' | 'auto'` に絞られています（350 行目）が、静的な属性の文字列は実行時にここで見ます。

## 5. setHostAttributes：img に何を書くか

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L486–507 （▶ の行: 489–490, 492–493, 496–498, 502, 504–506）

```ts
486 │   private setHostAttributes() {
487 │     // Must set width/height explicitly in case they are bound (in which case they will
488 │     // only be reflected and not found by the browser)
489 ▶     if (this.fill) {
490 ▶       this.sizes ||= '100vw';
491 │     } else {
492 ▶       this.setHostAttribute('width', this.width!.toString());
493 ▶       this.setHostAttribute('height', this.height!.toString());
494 │     }
495 │ 
496 ▶     this.setHostAttribute('loading', this.getLoadingBehavior());
497 ▶     this.setHostAttribute('fetchpriority', this.getFetchPriority());
498 ▶     this.setHostAttribute('decoding', this.getDecoding());
499 │ 
500 │     // The `data-ng-img` attribute flags an image as using the directive, to allow
501 │     // for analysis of the directive's performance.
502 ▶     this.setHostAttribute('ng-img', 'true');
503 │ 
504 ▶     // The `src` and `srcset` attributes should be set last since other attributes
505 ▶     // could affect the image's loading behavior.
506 ▶     const rewrittenSrcset = this.updateSrcAndSrcset();
507 │ 
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L778–782 （▶ の行: 780）

```ts
778 │ 
779 │   private setHostAttribute(name: string, value: string): void {
780 ▶     this.renderer.setAttribute(this.imgElement, name, value);
781 │   }
782 │ }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L602–625 （▶ の行: 603–604, 606, 610, 614, 619, 624）

```ts
602 │   private getLoadingBehavior(): string {
603 ▶     if (!this.priority && this.loading !== undefined) {
604 ▶       return this.loading;
605 │     }
606 ▶     return this.priority ? 'eager' : 'lazy';
607 │   }
608 │ 
609 │   private getFetchPriority(): string {
610 ▶     return this.priority ? 'high' : 'auto';
611 │   }
612 │ 
613 │   private getDecoding(): string {
614 ▶     if (this.priority) {
615 │       // `sync` means the image is decoded immediately when it's loaded,
616 │       // reducing the risk of content shifting later (important for LCP).
617 │       // If we're marking an image as priority, we want it decoded and
618 │       // painted as early as possible.
619 ▶       return 'sync';
620 │     }
621 │     // Returns the value of the `decoding` attribute, defaulting to `auto`
622 │     // if not explicitly provided. This mimics native browser behavior and
623 │     // avoids breaking changes when no decoding strategy is specified.
624 ▶     return this.decoding ?? 'auto';
625 │   }
```

1. **489〜494 行目：width と height（fill でなければ）**

   487〜488 行目のコメントのとおり、`[width]="w"` とバインドすると値はディレクティブの入力に入るだけで、`img` の属性には付きません（入力があるとそちらが優先される）。だから 492〜493 行目で属性として書き直します。`fill` のときは書かず、490 行目で `sizes` の既定を `100vw` にします（第 14 回）。
2. **496 行目：`loading` は `getLoadingBehavior`（602〜607 行目）**

   priority でなく `loading` が書いてあればその値（603〜604 行目）。そうでなければ priority なら `eager`、ふつうは `lazy`（606 行目）。**何も書かない画像は遅延読み込みになる**のが既定です。
3. **497 行目：`fetchpriority` は `high` か `auto`（610 行目）**

   ブラウザに「この画像を先に取りに行って」と伝える属性です。priority だけが `high` になります。
4. **498 行目：`decoding` は priority なら `sync`、そうでなければ入力か `auto`（613〜625 行目）**

   priority の画像は届いたらすぐ描けるように同期で decode します（615〜618 行目のコメント）。priority のときは `decoding` の入力を見ません。
5. **502 行目：`ng-img` の印**

   `ng-img="true"` を書きます。core の `ImagePerformanceWarning` は、この印のある画像を自分の検査から外します（[第 15 回](15-cmn-image-loaders.md)）。500 行目のコメントは `data-ng-img` と書いていますが、502 行目が書く名前は `ng-img` です。
6. **504〜506 行目：最後に `src` と `srcset`**

   `src` を付けた瞬間にブラウザは読み込みを始めます。その前に `loading` と `fetchpriority` が付いていないと、遅延読み込みや優先度が効きません。だから `updateSrcAndSrcset`（第 14 回）は最後です。書くのはどれも 780 行目の `renderer.setAttribute` です。

> [!NOTE]
> **ポイント**
>
> 506 行目の後ろには `sizes` を書く行（[第 14 回](14-cmn-image-srcset.md)）と、サーバーのときだけ preload の `<link>` を足す行（[第 16 回](16-cmn-image-lcp-preload.md)）が続きます。

> **🧪 DEMO — 本物の NgOptimizedImage を描いて、img に書かれた属性を見る**
>
> 「描く」を押すと、この章の中の小さなコンポーネント（`<img [ngSrc] [width] [height] [priority] [fill] [loading]>` を 1 つ持つ）を `createComponent` で作り、下の枠に描きます。`NgOptimizedImage` はこのサイトの本物（`@angular/common` 22.1.6）です。`IMAGE_LOADER` だけはこのコンポーネントの `providers` で差し替えていて、頼まれた幅と高さを文字で描いた SVG を `data:` の URL で返します（通信しません）。「Renderer2 への呼び出し」は、このサイトの本物の `RendererFactory2` を記録係で包んで（`domr-probe.ts`）、`img` に届いた呼び出しを順に並べたものです。width は 0〜1200 に丸めます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-image-overview)

見どころ：Renderer2 の表で、`setAttribute` が width → height → loading → fetchpriority → decoding → ng-img → src → srcset の順に並びます（489〜506 行目の順）。開発ビルドなら、その前後に `listen … load` と `listen … error` が並びます。3 節の「読み込んだ後に縦横比を見る」リスナーです。最後に並ぶ `removeStyle` は、1 節の 260〜269 行目のホストのスタイルのバインディングが最初の変更検知で `null` だった分です（fill でも placeholder でもないので、どれも書かずに外す側の呼び出しになる）。priority を付けると loading が `eager`、fetchpriority が `high`、decoding が `sync` に変わります。「width を undefined で渡す」は、`width` がない、ではなく `width` has an invalid value で止まります（2 節の 41 行目と 3 節の 1208・1063 行目）。

> [!WARNING]
> **ハマりどころ**
>
> DEMO の作りについて：priority の画像は `PreconnectLinkChecker` が「画像の origin への preconnect があるか」を調べ、無ければ `console.warn` を出します。`data:` の URL の origin は文字列の `"null"` です。この checker は一度調べた origin を覚えて二度と調べない（[第 16 回](16-cmn-image-lcp-preload.md)の 104・107 行目）ので、DEMO は priority で描くときだけ一瞬 `<link rel="preconnect" href="data:,">` を head に置き、描き終わったら外しています。警告を出さないための DEMO 側の工夫で、本物のアプリでは本物の CDN の origin を書きます。

## 6. priority の数の数え方

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L141–158 （▶ の行: 144, 151, 156–157）

```ts
141 │ /**
142 │  * Threshold for the PRIORITY_TRUE_COUNT
143 │  */
144 ▶ const PRIORITY_COUNT_THRESHOLD = 10;
145 │ 
146 │ /**
147 │  * This count is used to log a devMode warning
148 │  * when the count of directive instances with priority=true
149 │  * exceeds the threshold PRIORITY_COUNT_THRESHOLD
150 │  */
151 ▶ let IMGS_WITH_PRIORITY_ATTR_COUNT = 0;
152 │ 
153 │ /**
154 │  * This function is for testing purpose.
155 │  */
156 ▶ export function resetImagePriorityCount() {
157 ▶   IMGS_WITH_PRIORITY_ATTR_COUNT = 0;
158 │ }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1395–1415 （▶ の行: 1399–1403, 1412–1413）

```ts
1395 │ /**
1396 │  * Warns if the priority attribute is used too often on page load
1397 │  */
1398 │ async function assetPriorityCountBelowThreshold(appRef: ApplicationRef) {
1399 ▶   if (IMGS_WITH_PRIORITY_ATTR_COUNT === 0) {
1400 ▶     IMGS_WITH_PRIORITY_ATTR_COUNT++;
1401 ▶     await appRef.whenStable();
1402 ▶     if (IMGS_WITH_PRIORITY_ATTR_COUNT > PRIORITY_COUNT_THRESHOLD) {
1403 ▶       console.warn(
1404 │         formatRuntimeError(
1405 │           RuntimeErrorCode.TOO_MANY_PRIORITY_ATTRIBUTES,
1406 │           `NgOptimizedImage: The "priority" attribute is set to true more than ${PRIORITY_COUNT_THRESHOLD} times (${IMGS_WITH_PRIORITY_ATTR_COUNT} times). ` +
1407 │             `Marking too many images as "high" priority can hurt your application's LCP (https://web.dev/lcp). ` +
1408 │             `"Priority" should only be set on the image expected to be the page's LCP element.`,
1409 │         ),
1410 │       );
1411 │     }
1412 ▶   } else {
1413 ▶     IMGS_WITH_PRIORITY_ATTR_COUNT++;
1414 │   }
1415 │ }
```

1. **151 行目：数はモジュールの中の変数 1 つ**

   インジェクタにもアプリにも属さない、ファイルの中の `let` です。156〜158 行目の `resetImagePriorityCount` は 154 行目のとおりテストのためだけにあります。
2. **1399〜1401 行目：最初の 1 枚だけが待つ**

   数が 0 のとき（最初の priority の画像）だけ、1 を足して `appRef.whenStable()` を待ちます。アプリが落ち着く（保留中の仕事がなくなる）まで待つ間に、ほかの priority の画像は 1412〜1413 行目で数を足すだけです。
3. **1402〜1410 行目：落ち着いた時点で 10 を超えていれば 1 回だけ警告**

   比べるのはこの 1 回だけです。数は減らず、0 に戻りもしないので、**最初に落ち着いた後に増えた priority の画像では警告は出ません**。「ページを開いたときに priority が多すぎないか」を見る検査だということです。

## 7. ngOnChanges：初期化の後の変更を止める

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L536–574 （▶ の行: 538–540, 548, 551, 553, 555, 560, 566–568, 572）

```ts
536 │   /** @docs-private */
537 │   ngOnChanges(changes: SimpleChanges<NgOptimizedImage>) {
538 ▶     if (ngDevMode) {
539 ▶       assertNoPostInitInputChange(this, changes, [
540 ▶         'ngSrcset',
541 │         'width',
542 │         'height',
543 │         'priority',
544 │         'fill',
545 │         'loading',
546 │         'sizes',
547 │         'loaderParams',
548 ▶         'disableOptimizedSrcset',
549 │       ]);
550 │     }
551 ▶     if (changes['ngSrc'] && !changes['ngSrc'].isFirstChange()) {
552 │       const oldSrc = this._renderedSrc;
553 ▶       this.updateSrcAndSrcset(true);
554 │ 
555 ▶       if (ngDevMode) {
556 │         const newSrc = this._renderedSrc;
557 │         if (oldSrc && newSrc && oldSrc !== newSrc) {
558 │           const ngZone = this.injector.get(NgZone);
559 │           ngZone.runOutsideAngular(() => {
560 ▶             this.lcpObserver!.updateImage(oldSrc, newSrc);
561 │           });
562 │         }
563 │       }
564 │     }
565 │ 
566 ▶     if (
567 ▶       ngDevMode &&
568 ▶       changes['placeholder']?.currentValue &&
569 │       typeof ngServerMode !== 'undefined' &&
570 │       !ngServerMode
571 │     ) {
572 ▶       assertPlaceholderDimensions(this, this.imgElement);
573 │     }
574 │   }
```

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1012–1034 （▶ の行: 1018–1019, 1023–1024, 1029, 1032）

```ts
1012 │ /**
1013 │  * Creates a `RuntimeError` instance to represent a situation when an input is set after
1014 │  * the directive has initialized.
1015 │  */
1016 │ function postInitInputChangeError(dir: NgOptimizedImage, inputName: string): {} {
1017 │   let reason!: string;
1018 ▶   if (inputName === 'width' || inputName === 'height') {
1019 ▶     reason =
1020 │       `Changing \`${inputName}\` may result in different attribute value ` +
1021 │       `applied to the underlying image element and cause layout shifts on a page.`;
1022 │   } else {
1023 ▶     reason =
1024 ▶       `Changing the \`${inputName}\` would have no effect on the underlying ` +
1025 │       `image element, because the resource loading has already occurred.`;
1026 │   }
1027 │   return new RuntimeError(
1028 │     RuntimeErrorCode.UNEXPECTED_INPUT_CHANGE,
1029 ▶     `${imgDirectiveDetails(dir.ngSrc)} \`${inputName}\` was updated after initialization. ` +
1030 │       `The NgOptimizedImage directive will not react to this input change. ${reason} ` +
1031 │       `To fix this, either switch \`${inputName}\` to a static value ` +
1032 ▶       `or wrap the image element in an @if that is gated on the necessary value.`,
1033 │   );
1034 │ }
```

1. **539〜549 行目：9 つの入力は、2 回目の変更で投げる**

   `assertNoPostInitInputChange`（次の引用の 1039〜1057 行目）は、`changes` にその名前があって `isFirstChange()` でなければ `postInitInputChangeError` を投げます。理由の文は 1018〜1021 行目（width・height は「レイアウトがずれる」）と 1023〜1025 行目（ほかは「読み込みはもう起きたので効かない」）の 2 つで、1032 行目は「値を固定するか、`@if` で描き直して」と勧めます。
2. **551〜564 行目：`ngSrc` だけは変えてよい**

   `ngSrc` は 540〜548 行目の一覧に入っていません。変わったら 553 行目で `updateSrcAndSrcset(true)` を呼んで `src` と `srcset` を作り直し、560 行目で LCP の見張り役の表の URL を差し替えます（第 16 回）。`loading` などは作り直さないので、最初の値のままです。
3. **566〜573 行目：placeholder の大きさの警告**

   ブラウザで `placeholder` に値が入ったとき、描かれた幅か高さが 1000px を超えていれば警告します（`assertPlaceholderDimensions`）。

📄 `angular/packages/common/src/directives/ng_optimized_image/ng_optimized_image.ts` L1036–1073 （▶ の行: 1044–1047, 1052, 1054）

```ts
1036 │ /**
1037 │  * Verify that none of the listed inputs has changed.
1038 │  */
1039 │ function assertNoPostInitInputChange(
1040 │   dir: NgOptimizedImage,
1041 │   changes: SimpleChanges,
1042 │   inputs: string[],
1043 │ ) {
1044 ▶   inputs.forEach((input) => {
1045 ▶     const isUpdated = Object.hasOwn(changes, input);
1046 ▶     if (isUpdated && !changes[input].isFirstChange()) {
1047 ▶       if (input === 'ngSrc') {
1048 │         // When the `ngSrc` input changes, we detect that only in the
1049 │         // `ngOnChanges` hook, thus the `ngSrc` is already set. We use
1050 │         // `ngSrc` in the error message, so we use a previous value, but
1051 │         // not the updated one in it.
1052 ▶         dir = {ngSrc: changes[input].previousValue} as NgOptimizedImage;
1053 │       }
1054 ▶       throw postInitInputChangeError(dir, input);
1055 │     }
1056 │   });
1057 │ }
1058 │ 
1059 │ /**
1060 │  * Verifies that a specified input is a number greater than 0.
1061 │  */
1062 │ function assertGreaterThanZero(dir: NgOptimizedImage, inputValue: unknown, inputName: string) {
1063 │   const validNumber = typeof inputValue === 'number' && inputValue > 0;
1064 │   const validString =
1065 │     typeof inputValue === 'string' && /^\d+$/.test(inputValue.trim()) && parseInt(inputValue) > 0;
1066 │   if (!validNumber && !validString) {
1067 │     throw new RuntimeError(
1068 │       RuntimeErrorCode.INVALID_INPUT,
1069 │       `${imgDirectiveDetails(dir.ngSrc)} \`${inputName}\` has an invalid value. ` +
1070 │         `To fix this, provide \`${inputName}\` as a number greater than 0.`,
1071 │     );
1072 │   }
1073 │ }
```

1045 行目の `Object.hasOwn` は、`changes` がその名前を自分のプロパティとして持つか、の確かめです（2026-08 の 732e5050180 で `hasOwnProperty` から置き換わった）。1047〜1053 行目の `ngSrc` の分かれは、呼び出し側の一覧に `ngSrc` が無いので今は通りません。

> [!TIP]
> **新卒エンジニアへ**
>
> 本番ビルドでは 538 行目の `ngDevMode` が偽なので、width を後から変えても例外は出ず、何も起きません。`img` の width 属性は最初の値のままです（DEMO の「作ったあとで width を変える」を本番のこのサイトで押すと見られます）。開発中に例外で気付けるのは開発ビルドだけ、ということです。

## 8. ここまでを 1 本に

- 👤 `<img ngSrc="hero.jpg" width="800" height="600" priority>` — あなたのテンプレート
- `new NgOptimizedImage()` — L272-419 — *IMAGE\_LOADER・IMAGE\_CONFIG・Renderer2 を inject*
  - `transform`: `numberAttribute('800')`・`booleanAttribute('')` — coercion.ts L23・L41
- `ngOnChanges(changes)` — L537 — *最初の変更なので何もしない*
- `ngOnInit()` — L422
  - `assertNonEmptyInput` … `assertNoLoaderParamsWithoutLoader` — L427-464 — *開発モードだけ*
  - `lcpObserver.registerImage(src, true)` — L467 — *第 16 回*
  - `PreconnectLinkChecker.assertPreconnect`・`assetPriorityCountBelowThreshold` — L471-476
  - `setHostAttributes()` — L486
    - `setAttribute` width・height・loading=eager・fetchpriority=high・decoding=sync・ng-img — L492-502
    - `updateSrcAndSrcset()` → src・srcset — L506 — *第 14 回*
    - `sizes`・（サーバーなら）preload の link — L508-533 — *第 14・16 回*

## テストと直し方

### spec と describe

| spec | describe / it | どこで走るか |
| --- | --- | --- |
| common/test/directives/ng\_optimized\_image\_spec.ts | it `` should set `loading` and `fetchpriority` attributes before `src` ``（261 行目）、describe `setup error handling`（326 行目。`src` と `ngSrc`、width・height、`ngSrcset` の書式、初期化後の変更）、`lazy loading`（784）・`decoding attribute`（810）・`loading attribute`（862）・`fetch priority`（916）・`meta data`（995） | 261 行目の it は 264 行目の `if (!isBrowser) return;` で Node では中身を飛ばす。ほかは Node でも走る |

📄 `angular/packages/common/test/directives/ng_optimized_image_spec.ts` L273–310 （▶ の行: 273–276, 300–303, 307, 310）

```ts
273 ▶     const setAttributeSpy = spyOn(
274 ▶       _window.HTMLImageElement.prototype,
275 ▶       'setAttribute',
276 ▶     ).and.callThrough();
277 │ 
278 │     const fixture = TestBed.createComponent(TestComponent);
279 │     await fixture.whenStable();
280 │ 
281 │     const nativeElement = fixture.nativeElement as HTMLElement;
282 │ 
283 │     const img = nativeElement.querySelector('img')!;
284 │     expect(img.getAttribute('loading')).toBe('eager');
285 │ 
286 │     let _imgInstance = null;
287 │     let _loadingAttrId = -1;
288 │     let _fetchpriorityAttrId = -1;
289 │     let _srcAttrId = -1;
290 │     const count = setAttributeSpy.calls.count();
291 │     for (let i = 0; i < count; i++) {
292 │       if (!_imgInstance) {
293 │         _imgInstance = setAttributeSpy.calls.thisFor(i);
294 │       } else if (_imgInstance !== setAttributeSpy.calls.thisFor(i)) {
295 │         // Verify that the <img> instance is the same during the test.
296 │         fail('Unexpected instance of a second <img> instance present in a test.');
297 │       }
298 │ 
299 │       // Note: spy.calls.argsFor(i) returns args as an array: ['src', 'eager']
300 ▶       const attrName = setAttributeSpy.calls.argsFor(i)[0];
301 ▶       if (attrName == 'loading') _loadingAttrId = i;
302 ▶       if (attrName == 'fetchpriority') _fetchpriorityAttrId = i;
303 ▶       if (attrName == 'src') _srcAttrId = i;
304 │     }
305 │     // Verify that both `loading` and `fetchpriority` are set *before* `src`:
306 │     expect(_loadingAttrId).toBeGreaterThan(-1); // was actually set
307 ▶     expect(_loadingAttrId).toBeLessThan(_srcAttrId); // was set after `src`
308 │ 
309 │     expect(_fetchpriorityAttrId).toBeGreaterThan(-1); // was actually set
310 ▶     expect(_fetchpriorityAttrId).toBeLessThan(_srcAttrId); // was set after `src`
```

273〜276 行目で `HTMLImageElement.prototype.setAttribute` を spy にして、呼ばれた順を数えます。307・310 行目が 5 節の「src は最後」の確かめです。この it の頭のコメントのとおり、Node の DOM では prototype を差し替えにくいのでブラウザだけで走ります。

📄 `angular/packages/common/test/directives/ng_optimized_image_spec.ts` L674–685 （▶ の行: 674–675, 682, 684–685）

```ts
674 ▶     const inputs = [
675 ▶       ['width', 10],
676 │       ['height', 20],
677 │       ['priority', true],
678 │       ['fill', true],
679 │       ['loading', true],
680 │       ['sizes', '90vw'],
681 │       ['disableOptimizedSrcset', true],
682 ▶       ['loaderParams', '{foo: "test1"}'],
683 │     ];
684 ▶     inputs.forEach(([inputName, value]) => {
685 ▶       it(`should throw if the \`${inputName}\` input changed after directive initialized the input`, async () => {
```

📄 `angular/packages/common/test/directives/ng_optimized_image_spec.ts` L714–730 （▶ の行: 717–718, 720–722, 724, 726–727）

```ts
714 │         setupTestingModule({component: TestComponent});
715 │ 
716 │         // Initial render
717 ▶         const fixture = TestBed.createComponent(TestComponent);
718 ▶         await fixture.whenStable();
719 │ 
720 ▶         const expectedErrorMessage = //
721 ▶           `NG02953: The NgOptimizedImage directive (.*)? ` +
722 ▶           `has detected that \`${inputName}\` was updated after initialization`;
723 │         // Update input (expect to throw)
724 ▶         (fixture.componentInstance as unknown as {[key: string]: unknown})[inputName as string] =
725 │           value;
726 ▶         fixture.changeDetectorRef.markForCheck();
727 ▶         await expectAsync(fixture.whenStable()).toBeRejectedWithError(
728 │           new RegExp(expectedErrorMessage),
729 │         );
730 │       });
```

674〜683 行目の 8 つの入力ごとに it を 1 つ作り（684 行目の `forEach`）、一度描いてから値を変え、`whenStable()` が NG02953 で失敗することを見ます。7 節の 540〜548 行目の一覧と比べると、`ngSrcset` だけはこの表にありません。

📄 `angular/packages/common/test/directives/ng_optimized_image_spec.ts` L875–888 （▶ の行: 879, 881–884）

```ts
875 │     it('should throw if used with priority images', async () => {
876 │       setupTestingModule();
877 │ 
878 │       const template =
879 ▶         '<img ngSrc="path/img.png" width="150" height="50" loading="eager" priority>';
880 │       const fixture = createTestComponent(template);
881 ▶       await expectAsync(fixture.whenStable()).toBeRejectedWithError(
882 ▶         'NG02952: The NgOptimizedImage directive (activated on an <img> element ' +
883 ▶           'with the `ngSrc="path/img.png"`) has detected that the `loading` attribute ' +
884 ▶           'was used on an image that was marked "priority". Setting `loading` on priority ' +
885 │           'images is not allowed because these images will always be eagerly loaded. ' +
886 │           'To fix this, remove the “loading” attribute from the priority image.',
887 │       );
888 │     });
```

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=Image directive (setup error handling|lazy loading|decoding attribute|loading attribute|fetch priority|meta data)"

# ブラウザでしか中身が走らない it があるので、こちらも（--filter は効かない。全部走る）
pnpm bazel test //packages/common/test:test_web_chromium --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/cmn-logs/e-ov.log・e-web.log）`

```
Ran 53 of 667 specs
53 specs, 0 failures
Finished in 0.168 seconds
//packages/common/test:test                                              PASSED in 0.9s

Chromium: 1/1 test files | 676 passed, 2 failed
//packages/common/test:test_web_chromium                                 FAILED in 5.8s
```

- Node：53 件（名前が 6 つの describe に合う it。describe の外にある `` should set `loading` and `fetchpriority` attributes before `src` `` などは入らない）。そのうち `isBrowser` で中身を飛ばすものも「成功」に数えられます。
- ブラウザ（Chromium）：`test_web_chromium` は `--filter` が効かないので、common の spec を全部走らせました。676 件成功・2 件失敗で、失敗は `DatePipe`（date\_pipe\_spec.ts 171 行目）と `formatDate`（format\_date\_spec.ts 374 行目）の日付の 1 日ずれです。この章の spec ではありません。ブラウザのログには、3・4 節の `RuntimeError`（NG02952 など）が `ngOnInit`（461・459 行目）から出た記録が残っていて、中身が走ったことが分かります。

### 直すとしたら

- 入力の型と既定は 297〜398 行目、検査の並びは `ngOnInit`（422〜484 行目）、書く属性は 486 行目からの `setHostAttributes` と 602〜625 行目の 3 つの getter です。足す spec は describe `setup error handling` か、属性ごとの describe（`loading attribute` など）の形です。
- 2 節・3 節の「`[width]="undefined"` は `NaN` になって 'invalid value' の文で止まる」は、例外の文が実際の原因（バインドの値が無い）と合っていない、という小さな食い違いです。直すなら 1206〜1220 行目の `assertNonEmptyWidthAndHeight` の比べ方で、spec は describe `setup error handling` の it ``should throw if `width` and `height` are not set`` の並びに足します。issue があるかはまだ確かめていません（[第 20 回](20-cmn-issues.md)で探し方を扱います）。
- open の issue #59495「`assertNoComplexSizes` を外してほしい」（2025-01）は、4 節の 459 行目の検査についてです（第 14 回）。
- 本家に PR を出すことは勧めません。画像の issue を読むときに「開発モードの検査（425〜479 行目）の話か、本番でも走る 480〜483 行目の話か」を最初に切り分ける手がかりにします。

## 聞かれそうな質問

**Q. priority を付けると、何が変わりますか？**

属性は 3 つ変わります。`loading` が `eager`（606 行目）、`fetchpriority` が `high`（610 行目）、`decoding` が `sync`（619 行目）。開発モードでは、470〜478 行目で preconnect の確かめと priority の数の数えが足されます。サーバーでは preload の `<link>` も足されます（第 16 回）。

**Q. 何も書かない画像の loading は？**

`lazy` です。602〜607 行目で、priority でも `loading` の入力でもないときは 606 行目の `'lazy'` になり、496 行目で書かれます。

**Q. width をバインドしているのに、img に width 属性が付かないことはありますか？**

ありません。`[width]` のバインドはディレクティブの入力（322 行目）に入るだけですが、`setHostAttributes` の 492〜493 行目が属性として書き直します（spec の it `should always reflect the width/height attributes if bound`）。ただし後から値を変えても書き直しません。開発モードでは 539 行目の検査で例外になります。

**Q. 本番で width と height を書き忘れたら？**

例外は出ません。443 行目の検査は 425 行目の `ngDevMode` の中だけです。492 行目の `this.width!.toString()` は `undefined` に対して呼ばれるので `TypeError` で止まります（`!` は型の上の約束で、実行時には何もしない）。開発中に 1 度は描いて、3 節の例外で気付くのが前提の作りです。

**Q. loading="eager" と priority は同じですか？**

違います。`loading="eager"` は 603〜604 行目でその値を書くだけで、`fetchpriority` は `auto`、`decoding` も入力か `auto` のままです。preconnect の確かめも preload もありません。両方を書くと 1289 行目で例外です。

## 読み終えて

- `NgOptimizedImage` は `img[ngSrc]` に付き、入力は `numberAttribute`・`booleanAttribute`・`booleanOrUrlAttribute`・`unwrapSafeUrl` で型を揃える。`[width]="undefined"` は `NaN`。
- `ngOnInit` の 425〜479 行目は開発モードだけの検査で、見つけたら `RuntimeError` を投げる。本番では何も確かめない。
- `setHostAttributes` は width・height → loading・fetchpriority・decoding → ng-img → src・srcset の順に書く。src を最後にするのは、読み込みが始まる前に loading と優先度を効かせるため。
- priority の数は最初の priority の画像が `whenStable` を待つ間に数え、1 回だけ比べる。
- `ngSrc` 以外の 9 つの入力は、初期化の後に変えると開発モードで例外。本番では黙って無視される。

---

← 前: [数の書式：DecimalPipe・CurrencyPipe と formatNumber の中](12-cmn-format-number.md)  
次: [srcset と sizes：自動で作る候補の幅](14-cmn-image-srcset.md) →
