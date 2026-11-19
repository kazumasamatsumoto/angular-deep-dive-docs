[目次](../README.md) › [@angular/ssr の読み残し：provideServerRendering・リクエストハンドラ・CommonEngine・ビルド側のワーカーを行で埋める](README.md) › 第 1 回 / 全 6 回

# provideServerRendering の中身：withRoutes と withAppShell が積む provider

> route-config.ts の未読の行：ServerRenderingFeature の形、withRoutes の doc と 262 行目の { routes }、withAppShell が ɵcmp でコンポーネントか関数かを分けて ROUTES に足し、注入器ができたときに appShellRoute を書き足す行、ServerRenderingOptions と 2 つのオーバーロード・hasOptions。本物の provideServerRendering を 10 通り呼んで、返る provider の木と注入器の値（maxResponseBodySize: 0 が既定の 1MB になることなど）を並べる。

angular/angular-cli · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ssrl-provide)

---

この章で分かること: `app.config.server.ts` に書く `provideServerRendering(withRoutes(serverRoutes), withAppShell(Shell))` が、どんな形のオブジェクトを返し、その中にどのトークンがどの順で積まれるのか。`withAppShell` がコンポーネントと関数をどう見分け、`appShellRoute` をいつ書き足すのか。オプションつきの呼び方（`{ maxResponseBodySize }`）がどの行で見分けられ、どこへ渡るのか。本物の `provideServerRendering` を Node で 10 通り呼び、返った `EnvironmentProviders` を `ɵproviders` で辿った木と、それで作った注入器の値を並べた記録を再生します。

読む対象は angular-cli（44129f66a3）の `packages/angular/ssr/src/routes/route-config.ts` の残りの行（doc コメント・2 つのオーバーロード・`ServerRenderingOptions`）です。`withRoutes`・`withAppShell` の本体と、`SERVER_ROUTES_CONFIG` を読む `buildServerConfigRouteTree` は[サーバールートの章](../platform/05-ssr-server-routes.md)の 2 節と 5 節、`provideServerRendering` の本体（L437〜473）と、そこから呼ぶ platform-server 版（`PLATFORM_SERVER_PROVIDERS` と `ngServerMode`）は[platformServer の章](../platform/03-ssr-platform-server.md)の 8 節で引用しています。ここではそれを繰り返さず、その間の行と、実物が返すものを見ます。

1. **1. provideServerRendering の中身**（この章）
2. [2. server.ts の入口](02-ssrl-handlers.md)
3. [3. CommonEngine の残りと性能の記録](03-ssrl-common-engine.md)
4. [4. i18n と URL の小道具](04-ssrl-i18n-url.md)
5. [5. ビルド側のワーカー](05-ssrl-build-workers.md)
6. [6. spec と issue](06-ssrl-tests-issues.md)

## 1. feature は 2 つの欄だけのオブジェクト

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L37–43 （▶ の行: 40–42）

```ts
37 │  * Helper type to represent a server routes feature.
38 │  * @see {@link ServerRenderingFeatureKind}
39 │  */
40 ▶ interface ServerRenderingFeature<FeatureKind extends ServerRenderingFeatureKind> {
41 ▶   ɵkind: FeatureKind;
42 ▶   ɵproviders: (Provider | EnvironmentProviders)[];
43 │ }
```

`withRoutes` と `withAppShell` が返すのは、41 行目の `ɵkind`（どちらの feature か）と、42 行目の `ɵproviders`（積む provider の配列）だけのオブジェクトです。`ɵkind` の値は L31〜34 の enum の数値（`AppShell` が 0、`ServerRoutes` が 1）で、[ルートの木の章](../srt/03-srt-route-tree.md)の 7 節で引用しています。40 行目の `interface` は export されていないので、利用者は `ServerRenderingFeature` という名前を書けません。`provideServerRendering` の引数に直接渡すだけの形です。

> [!TIP]
> **新卒エンジニアへ**
>
> `provideRouter(routes, withPreloading(…))` の `withX` も同じ「`ɵkind` と `ɵproviders`」の形です（[provideRouter の中身](../router/05-router-provide-router.md)）。`@angular/ssr` は Router の型を借りず、自分の enum で同じことをしています。

## 2. withRoutes の doc の例と、262 行目の 1 行

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L230–265 （▶ の行: 236–237, 240, 248, 253, 259, 261–262）

````ts
230 │  * @example
231 │  * ```ts
232 │  * import { provideServerRendering, withRoutes, ServerRoute, RenderMode } from '@angular/ssr';
233 │  *
234 │  * const serverRoutes: ServerRoute[] = [
235 │  *   {
236 ▶  *     path: '', // This renders the "/" route on the client (CSR)
237 ▶  *     renderMode: RenderMode.Client,
238 │  *   },
239 │  *   {
240 ▶  *     path: 'about', // This page is static, so we prerender it (SSG)
241 │  *     renderMode: RenderMode.Prerender,
242 │  *   },
243 │  *   {
244 │  *     path: 'profile', // This page requires user-specific data, so we use SSR
245 │  *     renderMode: RenderMode.Server,
246 │  *   },
247 │  *   {
248 ▶  *     path: '**', // All other routes will be rendered on the server (SSR)
249 │  *     renderMode: RenderMode.Server,
250 │  *   },
251 │  * ];
252 │  *
253 ▶  * provideServerRendering(withRoutes(serverRoutes));
254 │  * ```
255 │  *
256 │  * @see {@link provideServerRendering}
257 │  * @see {@link ServerRoute}
258 │  */
259 ▶ export function withRoutes(
260 │   routes: ServerRoute[],
261 ▶ ): ServerRenderingFeature<ServerRenderingFeatureKind.ServerRoutes> {
262 ▶   const config: ServerRoutesConfig = { routes };
263 │ 
264 │   return {
265 │     ɵkind: ServerRenderingFeatureKind.ServerRoutes,
````

234〜251 行目の例は、`''` を Client、`about` を Prerender、`profile` と `**` を Server にしています。この例のキーは、6fb85b2a4c（2025-10-15、docs）で `route:` から 236 行目などの `path:` に直りました。それまでの例は、`ServerRoute` に無いキーを書いた形で、型を通りませんでした。253 行目が、アプリが書く 1 行そのものです。

261 行目の戻り値の型は `ServerRenderingFeature<ServerRenderingFeatureKind.ServerRoutes>` で、262 行目は渡された配列を **コピーせず**`{ routes }` に包みます。この `config` オブジェクトがそのまま `SERVER_ROUTES_CONFIG` の値になり（L268〜269）、3 節の `withAppShell` は注入器ができたときにこのオブジェクトへ `appShellRoute` を書き足します。DEMO の「注入器の前」と「注入器のあと」の列で、同じオブジェクトが変わるのが見えます。

## 3. withAppShell：コンポーネントか、読み込む関数か

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L282–321 （▶ の行: 282–283, 285–286, 294, 297, 304, 309, 313, 316, 318–319）

````ts
282 ▶  * This function configures the app shell route, which serves the provided component for
283 ▶  * requests that do not match any defined server routes.
284 │  *
285 ▶  * @param component - The Angular component to render for the app shell. Can be a direct
286 ▶  * component type or a dynamic import function.
287 │  * @returns A `ServerRenderingFeature` object configuring the app shell.
288 │  *
289 │  * @example
290 │  * ```ts
291 │  * import { provideServerRendering, withAppShell, withRoutes } from '@angular/ssr';
292 │  * import { AppShellComponent } from './app-shell.component';
293 │  *
294 ▶  * provideServerRendering(
295 │  *   withRoutes(serverRoutes),
296 │  *   withAppShell(AppShellComponent)
297 ▶  * );
298 │  * ```
299 │  *
300 │  * @example
301 │  * ```ts
302 │  * import { provideServerRendering, withAppShell, withRoutes } from '@angular/ssr';
303 │  *
304 ▶  * provideServerRendering(
305 │  *   withRoutes(serverRoutes),
306 │  *   withAppShell(() =>
307 │  *     import('./app-shell.component').then((m) => m.AppShellComponent)
308 │  *   )
309 ▶  * );
310 │  * ```
311 │  *
312 │  * @see {@link provideServerRendering}
313 ▶  * @see {@link https://angular.dev/ecosystem/service-workers/app-shell App shell pattern on Angular.dev}
314 │  */
315 │ export function withAppShell(
316 ▶   component: Type<unknown> | (() => Promise<Type<unknown> | DefaultExport<Type<unknown>>>),
317 │ ): ServerRenderingFeature<ServerRenderingFeatureKind.AppShell> {
318 ▶   const routeConfig: Route = {
319 ▶     path: APP_SHELL_ROUTE,
320 │   };
321 │ 
````

285〜286 行目のとおり、引数はコンポーネントの型か、動的 import の関数です（316 行目の型。関数は `DefaultExport`、つまり `export default` の形も返してよい）。294〜297 行目と 304〜309 行目の 2 つの例は、どちらも `withRoutes` と並べて書いています。並べないと 6 節のエラーです。318〜320 行目で、path が `ng-app-shell`（L25 の定数）の Router のルートを作ります。

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L322–328 （▶ の行: 322–323, 325）

```ts
322 ▶   if ('ɵcmp' in component) {
323 ▶     routeConfig.component = component as Type<unknown>;
324 │   } else {
325 ▶     routeConfig.loadComponent = component as () => Promise<Type<unknown>>;
326 │   }
327 │ 
328 │   return {
```

見分け方は 322 行目の `'ɵcmp' in component` だけです。`ɵcmp` は、コンパイラ（AOT なら ngtsc、JIT なら `@Component` のデコレータ）がコンポーネントのクラスに付ける静的なプロパティです。持っていれば 323 行目の `component`、持っていなければ 325 行目の `loadComponent` になります。したがって `ɵcmp` を持たないクラス（デコレータの無いクラスや、ディレクティブ）を渡すと、型は通っても `loadComponent` に入り、Router がそれを関数として呼んだときに `TypeError: Class constructor … cannot be invoked without 'new'` になります（DEMO の「ɵcmp の無いクラス」）。

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L334–340 （▶ の行: 334, 336–338）

```ts
334 ▶         multi: true,
335 │       },
336 ▶       provideEnvironmentInitializer(() => {
337 ▶         const config = inject(SERVER_ROUTES_CONFIG);
338 ▶         config.appShellRoute = APP_SHELL_ROUTE;
339 │       }),
340 │     ],
```

1. **呼んだとき：ROUTES に 1 本足す**

   L332〜334（[サーバールートの章](../platform/05-ssr-server-routes.md)の 2 節）で、`ROUTES` に `multi: true` で積みます。`provideRouter(routes)` の配列とは別の 1 本として、Router の設定に混ざります。
2. **注入器を作ったとき：appShellRoute を書き足す**

   336 行目の `provideEnvironmentInitializer` は、注入器ができるときに走る関数を登録します。337 行目で `SERVER_ROUTES_CONFIG` を inject し、338 行目でそのオブジェクトに `appShellRoute = 'ng-app-shell'` を書きます。
3. **だから書く順は関係ない**

   呼んだ時点では `SERVER_ROUTES_CONFIG` を読まないので、`withAppShell` を `withRoutes` より前に書いても動きます（DEMO の「先に withAppShell」）。`withRoutes` を 2 回書くと provider が 2 つ積まれ、注入器では後の方が勝つので、`appShellRoute` も後の方のオブジェクトに書かれます（DEMO の「withRoutes を 2 回」）。
4. **読むのはルートの取り出し**

   `buildServerConfigRouteTree` が `appShellRoute` を見て、`{ path: 'ng-app-shell', renderMode: RenderMode.Prerender }` をサーバールートの先頭に足します（ng-routes.ts L572〜577、[サーバールートの章](../platform/05-ssr-server-routes.md)の 5 節）。プリレンダーした結果は、ビルドが `index.html` か `index.csr.html` の中身に使います（execute-post-bundle.ts L183〜193、[第 5 回](05-ssrl-build-workers.md)）。

282〜283 行目の doc は「どのサーバールートにも当たらないリクエストに、このコンポーネントを返す」と書いていますが、上のとおり実際の仕組みは「プリレンダーした 1 枚を CSR 用の index に使う」です。`RenderMode.Client` のルートに返る `index.csr.html` がその 1 枚になる、という意味で読めます。App Shell は、b2e2be052f（2024-11-08）までは `RenderMode.AppShell` という 4 つ目のモードでした。そのコミットがモードを消して `appShellRoute` の設定に替え、のちに今の `withAppShell` の形になっています。

## 4. ServerRenderingOptions：1 項目だけ

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L343–362 （▶ の行: 347, 350, 352, 358–359）

```ts
343 │ 
344 │ /**
345 │  * Options for configuring server-side rendering.
346 │  */
347 ▶ export interface ServerRenderingOptions {
348 │   /**
349 │    * The maximum allowed response body size when using the Fetch API.
350 ▶    * @default 1MB
351 │    */
352 ▶   maxResponseBodySize: number;
353 │ }
354 │ 
355 │ /**
356 │  * Configures server-side rendering for an Angular application.
357 │  *
358 ▶  * This function sets up the necessary providers for server-side rendering, including
359 ▶  * support for server routes and app shell. It combines features configured using
360 │  * `withRoutes` and `withAppShell` to provide a comprehensive server-side rendering setup.
361 │  *
362 │  * @param features - Optional features to configure additional server rendering behaviors.
```

347 行目の型の項目は、352 行目の `maxResponseBodySize`（サーバーで `HttpClient` が fetch で受け取る応答の本文の上限、バイト）だけです。350 行目は `@default 1MB` と書きますが、352 行目に `?` は無いので、`provideServerRendering({}, withRoutes(…))` は型エラーです。書くなら値も書きます。

既定の 1MB は、この型ではなく `@angular/common/http` の `HTTP_FETCH_MAX_RESPONSE_SIZE` の factory が決めます（fetch.ts L42 の `DEFAULT_SSR_MAX_RESPONSE_BODY_SIZE = 1024 * 1024`、L52〜59 で `ngServerMode` のときだけ）。platform-server 版は `options?.maxResponseBodySize` が真のときだけ provider を足す（provide\_server.ts L40〜42、[platformServer の章](../platform/03-ssr-platform-server.md)の 8 節）ので、`0` を渡すと「上限なし」ではなく既定の 1MB のままです。fetch.ts の doc にある「`null` で上限を外す」は、352 行目の型が `number` なので、この入口からは書けません。DEMO の「0 を渡す」で注入器の値が `1048576` になっています。

## 5. 2 つのオーバーロードと、どちらかを見分ける行

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L376–393 （▶ の行: 376–377, 384, 391–393）

````ts
376 ▶  * const bootstrap = (context: BootstrapContext) =>
377 ▶  *     bootstrapApplication(AppComponent, {
378 │  *       providers: [
379 │  *         provideServerRendering(
380 │  *           withRoutes(SERVER_ROUTES),
381 │  *           withAppShell(AppShellComponent),
382 │  *         ),
383 │  *       ],
384 ▶  *     }, context);
385 │  *
386 │  * export default bootstrap;
387 │  * ```
388 │  * @see {@link withRoutes} configures server-side routing
389 │  * @see {@link withAppShell} configures the application shell
390 │  */
391 ▶ export function provideServerRendering(
392 ▶   ...features: ServerRenderingFeature<ServerRenderingFeatureKind>[]
393 ▶ ): EnvironmentProviders;
````

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L402–436 （▶ の行: 402–403, 421, 433–436）

````ts
402 ▶  * @param options - Configuration options for server-side rendering.
403 ▶  * @param features - Optional features to configure additional server rendering behaviors.
404 │  * @returns An `EnvironmentProviders` instance with the server-side rendering configuration.
405 │  *
406 │  * @example
407 │  * Basic example of how you can enable server-side rendering with options in your application
408 │  * when using the `bootstrapApplication` function:
409 │  *
410 │  * ```ts
411 │  * import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
412 │  * import { provideServerRendering, withRoutes, withAppShell } from '@angular/ssr';
413 │  * import { AppComponent } from './app/app.component';
414 │  * import { SERVER_ROUTES } from './app/app.server.routes';
415 │  * import { AppShellComponent } from './app/app-shell.component';
416 │  *
417 │  * const bootstrap = (context: BootstrapContext) =>
418 │  *     bootstrapApplication(AppComponent, {
419 │  *       providers: [
420 │  *         provideServerRendering(
421 ▶  *           { maxResponseBodySize: 1024 * 1024 }, // 1MB limit
422 │  *           withRoutes(SERVER_ROUTES),
423 │  *           withAppShell(AppShellComponent),
424 │  *         ),
425 │  *       ],
426 │  *     }, context);
427 │  *
428 │  * export default bootstrap;
429 │  * ```
430 │  * @see {@link withRoutes} configures server-side routing
431 │  * @see {@link withAppShell} configures the application shell
432 │  */
433 ▶ export function provideServerRendering(
434 ▶   options: ServerRenderingOptions,
435 ▶   ...features: ServerRenderingFeature<ServerRenderingFeatureKind>[]
436 ▶ ): EnvironmentProviders;
````

TypeScript のオーバーロード（同じ名前の関数に、呼べる形を複数書くこと）です。利用者から見える形は 391〜393 行目の「features だけ」と、433〜436 行目の「options + features」の 2 つで、L437〜441 の実装の型（`...args` の和）は呼ぶ側からは見えません。376〜384 行目の例は、`bootstrapApplication(…, context)` の 3 つ目の引数（`BootstrapContext`）まで書いた、今の `main.server.ts` の形です。421 行目の例は 1MB を明示しています。

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L441–447 （▶ の行: 444–447）

```ts
441 │ ): EnvironmentProviders {
442 │   let options: ServerRenderingOptions | undefined;
443 │   let features: ServerRenderingFeature<ServerRenderingFeatureKind>[];
444 ▶   if (hasOptions(args)) {
445 ▶     const [first, ...rest] = args;
446 ▶     options = first;
447 ▶     features = rest;
```

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L480–486 （▶ の行: 482–483, 485）

```ts
480 │     | ServerRenderingFeature<ServerRenderingFeatureKind>[]
481 │     | [ServerRenderingOptions, ...ServerRenderingFeature<ServerRenderingFeatureKind>[]],
482 ▶ ): args is [ServerRenderingOptions, ...ServerRenderingFeature<ServerRenderingFeatureKind>[]] {
483 ▶   const value = args[0];
484 │ 
485 ▶   return !!value && typeof value === 'object' && !('ɵkind' in value);
486 │ }
```

444 行目の `hasOptions` が真なら、445 行目で先頭を `options`、残りを `features` に分けます。判定は 485 行目の 3 つ（真であること・オブジェクトであること・`ɵkind` を持たないこと）で、482 行目の戻り値の型 `args is [ServerRenderingOptions, ...]` が、445〜447 行目で型の絞り込みを効かせます。21ca098829（2026-05-28）が、この 2 つ目のオーバーロード・`ServerRenderingOptions`・`hasOptions` をまとめて足しました。コミットの本文は「キャストなしで union を絞るための、配列ごとの型ガード」と書いています。それより前は、platform-server 版を引数なしで呼んでいて、`@angular/ssr` の側からは上限を変えられませんでした。

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L453–459 （▶ の行: 453, 459）

```ts
453 ▶     provideServerRenderingPlatformServer(options),
454 │   ];
455 │ 
456 │   let hasAppShell = false;
457 │   let hasServerRoutes = false;
458 │ 
459 ▶   for (const { ɵkind, ɵproviders } of features) {
```

453 行目で、`options` が `undefined` でもそのまま platform-server 版に渡します。459 行目は各 feature を `{ ɵkind, ɵproviders }` で分割代入するので、先頭に `null` を渡すと、485 行目の `!!value` で options ではないとされ、ここで `TypeError` になります（DEMO の最後）。型では書けない呼び方ですが、エラーの文が `provideServerRendering` の名前を含まないことは、知っておくと調べやすくなります。

## 6. withAppShell だけを書いたとき

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L464–470 （▶ の行: 465, 467–468）

```ts
464 │ 
465 ▶   if (!hasServerRoutes && hasAppShell) {
466 │     throw new Error(
467 ▶       `Configuration error: found 'withAppShell()' without 'withRoutes()' in the same call to 'provideServerRendering()'.` +
468 ▶         `The 'withAppShell()' function requires 'withRoutes()' to be used.`,
469 │     );
470 │   }
```

465 行目は「`withRoutes` が無く、`withAppShell` がある」ときだけ投げます。`appShellRoute` を書く先（2 節の `config`）が無いからです。467 行目の文字列は `'provideServerRendering()'.` で終わり、468 行目は `The` で始まるので、44129f66a3 では 2 文が空白なしでつながります。13a7346493（2026-10-19、origin/main）が 467 行目の終わりに空白を足し、v22.2.7 にも 0dc103735e として入っています。DEMO で記録した 22.2.7 の文には空白があります。

## 7. DEMO：10 通りの呼び方で返るもの

> **🧪 DEMO — provideServerRendering が返す木と、注入器の値（記録の再生）**
>
> `<scratchpad>/ssrl-demo/a/provide/record.mjs` が、Node v24.22.1 で @angular/ssr 22.2.7（@angular/core・platform-server 22.2.6）の `provideServerRendering` を下の 10 通りで呼んだ記録です。返った値を `ɵproviders` で辿って木にし、そのあと `createEnvironmentInjector`（`INJECTOR_SCOPE` を `'root'` にしたもの）を作って値を読みました。`Shell` は JIT の `Component` で作ったコンポーネント、`R` と `R2` は `[{ path: '**', renderMode: Server か Prerender }]` です。`SERVER_ROUTES_CONFIG` は公開されていないので、`withRoutes([]).ɵproviders[0].provide` から取っています。
>
> ROUTES（multi）と、provideEnvironmentInitializer が包んだ ENVIRONMENT\_INITIALIZER が足されます。注入器を作ると appShellRoute が書き足されます（338 行目）。
>
> 戻り値の木（赤は、`provideServerRendering()` の木に無いトークン：SERVER\_ROUTES\_CONFIG・ROUTES・ENVIRONMENT\_INITIALIZER）
>
> `globalThis.ngServerMode`：スクリプトの最初 `undefined` → @angular/ssr を import したあと `undefined` → 最初の `provideServerRendering()` のあと `true`。import だけでは立たず、呼んだときに platform-server 版の L35〜37 が立てます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ssrl-provide)

> [!NOTE]
> **ポイント**
>
> どの場合も、1 段目の `EnvironmentProviders` の最初の子は platform-server 版で、その中身（`BEFORE_APP_SERIALIZED`・`EVENT_MANAGER_PLUGINS`・`XhrFactory`・`HTTP_ROOT_INTERCEPTOR_FNS`・`Testability`・`TESTABILITY`・`ViewportScroller`）は変わりません。feature の provider は、その後ろに書いた順で並びます（459 行目からのループ、L459〜463）。`withAppShell` の `ENVIRONMENT_INITIALIZER` だけは、`provideEnvironmentInitializer` が作ったもう 1 段の `EnvironmentProviders` の中です。

## 8. 呼び出しの連なり

- 👤 `provideServerRendering(withRoutes(serverRoutes), withAppShell(Shell))` — app.config.server.ts — *引数を先に評価する*
  - `withRoutes(serverRoutes)` — route-config.ts L259 — *262 行目で { routes }*
  - `withAppShell(Shell)` — route-config.ts L315 — *322 行目で component か loadComponent*
  - `hasOptions(args)` — route-config.ts L478 — *485 行目*
  - `provideServerRenderingPlatformServer(options)` — platform-server provide\_server.ts L32 — *ngServerMode を立てる*
  - `makeEnvironmentProviders(providers)` — route-config.ts L472 — *1 段目の EnvironmentProviders*
- 👤 `bootstrapApplication(App, config, context)` — main.server.ts — *注入器を作る*
  - `ENVIRONMENT_INITIALIZER` の関数 — route-config.ts L336 — *338 行目で appShellRoute を書く*
  - `getRoutesFromAngularRouterConfig` — ng-routes.ts — *SERVER\_ROUTES\_CONFIG を読む（サーバールートの章）*

## テストと直し方

### 今の spec

`packages/angular/ssr/test/` で `provideServerRendering` を呼ぶのは `testing-utils.ts` の L114 の 1 か所（`provideServerRendering(withRoutes(serverRoutes))`）だけで、`withAppShell`・`ServerRenderingOptions`・6 節のエラーを起動する it はありません（`grep -rn "withAppShell\|maxResponseBodySize" packages/angular/ssr/test` は 0 件）。[ルートの木のシリーズの最終回](../srt/05-srt-tests-issues.md)の T16 では、485 行目をいつも `false` にしても 249 件が通りました。`withAppShell` を通しで確かめているのは、schematics の `app-shell/index_spec.ts` L125（`provideServerRendering` の呼び出しに `withAppShell` を足す文字列の書き換え）と、e2e のビルドのテストです。

### spec を足すとしたら（作業木で書いて走らせた）

📄 `<scratchpad>/ssrl-wt-a/packages/angular/ssr/test/routes/route-config_spec.ts`

```ts
// test/routes/route-config_spec.ts（作業木で新しく書いたもの。抜粋）
// `SERVER_ROUTES_CONFIG` is marked as `@internal`, so it is read from the provider of `withRoutes`.
const SERVER_ROUTES_CONFIG = (withRoutes([]).ɵproviders[0] as { provide: unknown })
  .provide as InjectionToken<{ routes: ServerRoute[]; appShellRoute?: string }>;

describe('provideServerRendering', () => {
  const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }];
  const createInjector = (providers: EnvironmentProviders): EnvironmentInjector =>
    createEnvironmentInjector([providers], Injector.NULL as EnvironmentInjector);

  it('should add the app shell route and set appShellRoute when withAppShell is used', () => {
    const injector = createInjector(
      provideServerRendering(withRoutes(serverRoutes), withAppShell(ShellComponent)),
    );
    expect(injector.get(SERVER_ROUTES_CONFIG).appShellRoute).toBe('ng-app-shell');
    expect(injector.get(ROUTES) as unknown).toEqual([
      { path: 'ng-app-shell', component: ShellComponent },
    ]);
  });

  it('should throw when withAppShell is used without withRoutes', () => {
    expect(() => provideServerRendering(withAppShell(ShellComponent))).toThrowError(
      /found 'withAppShell\(\)' without 'withRoutes\(\)'/,
    );
  });
  // ほかに withRoutes だけ・loadComponent の形・options の形の 3 本
});
```

- 置き場所は `test/routes/` で、`test/BUILD.bazel` の `glob(["**/*.ts"])` がそのまま拾います。BUILD を変える必要はありません。
- 1 回目は `SERVER_ROUTES_CONFIG` を import して型検査で落ちました。218 行目の上の doc が `@internal` なので、spec が見る型の宣言から外されているためです。DEMO と同じく `withRoutes([]).ɵproviders[0].provide` から取る形にしました。
- 3 節の「`ɵcmp` の無いクラス」は、今は型を通り、Router がルートを読み込むときに初めて `TypeError` になります。振る舞いを決めて固めるなら、直す場所は 322〜326 行目、it はこの spec の `loadComponent` の it の隣です。

### 手元で走らせた結果

📄 `走らせたコマンド（2026-11-19）`

```
# ../angular-cli-fix（44129f66a3、pnpm install 済み）で、変えずに
pnpm bazel test //packages/angular/ssr/test:test --nocache_test_results --test_output=all
# 作業木（git -C ../angular-cli-fix worktree add <scratchpad>/ssrl-wt-a 44129f66a3）に spec を足して
pnpm bazel test //packages/angular/ssr/test:test --nocache_test_results --test_output=all
```

📄 `結果`

```
249 specs, 0 failures   //packages/angular/ssr/test:test PASSED   # 変えずに
255 specs, 0 failures   //packages/angular/ssr/test:test PASSED   # route-config_spec.ts（5 本）と handler_spec.ts（1 本）を足して
# 1 回目は SERVER_ROUTES_CONFIG を import して落ちた:
# error TS2305: Module '"../../src/routes/route-config"' has no exported member 'SERVER_ROUTES_CONFIG'.
```

## 聞かれそうな質問

**Q. withAppShell を withRoutes より前に書いても大丈夫ですか？**

大丈夫です。`withAppShell` が `SERVER_ROUTES_CONFIG` を読むのは 336〜339 行目の `provideEnvironmentInitializer` の中、つまり注入器ができたときで、そのときには全部の provider が積まれています。順を見るのは 465 行目の「どちらもあるか」だけです。

**Q. app shell のルートを自分の routes 配列に書く必要はありますか？**

ありません。`withAppShell` が `ROUTES` に `multi: true` で `{ path: 'ng-app-shell', … }` を足し（318〜320 行目と L332〜334）、サーバールートの側は `buildServerConfigRouteTree` が Prerender で足します。

**Q. maxResponseBodySize を 0 にすると上限が無くなりますか？**

なりません。platform-server 版は値が真のときだけ `HTTP_FETCH_MAX_RESPONSE_SIZE` を足すので、0 なら何も足さず、トークンの factory が既定の 1MB（1048576）を返します（DEMO の zero）。`null` は 352 行目の型が `number` なので渡せません。

**Q. provideServerRendering を呼ぶだけで何か副作用はありますか？**

あります。453 行目で呼ぶ platform-server 版が、`ngServerMode` が未定義なら `globalThis.ngServerMode = true` にします。DEMO の記録では、@angular/ssr を import しただけでは `undefined` のままで、最初の呼び出しのあとに `true` になりました。

**Q. options か feature かは、どう見分けていますか？**

485 行目で、先頭の引数が「真で、オブジェクトで、`ɵkind` を持たない」なら options です。feature は必ず `ɵkind` を持つ（41 行目）ので、これで分かれます。

## 読み終えて

- `withRoutes`・`withAppShell` は `ɵkind` と `ɵproviders` だけのオブジェクト。`provideServerRendering` は platform-server 版の後ろにそれを書いた順で積み、`makeEnvironmentProviders` で包む。
- `withAppShell` は `ɵcmp` の有無で `component` か `loadComponent` を決め、注入器ができたときに `withRoutes` の `{ routes }` へ `appShellRoute` を書き足す。
- options は `maxResponseBodySize` だけで、値が真のときだけ platform-server 版が `HTTP_FETCH_MAX_RESPONSE_SIZE` を足す。既定の 1MB はトークンの factory が持つ。
- 2 つ目のオーバーロードと `hasOptions` は 21ca098829 から。`withAppShell` と options を起動する spec は、今の `test/` に無い。

---

← 前: [spec と issue を読む：ディレクティブ・イベント・ExtraOptions を固めているテスト](../rdir/06-rdir-tests-issues.md)  
次: [server.ts の入口：createRequestHandler・createNodeRequestHandler と、ビルドが見分ける印](02-ssrl-handlers.md) →
