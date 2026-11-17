[目次](../README.md) › [SSR のサーバールートの内側：ルートを取り出し、木で照合し、応答を組み立てる](README.md) › 第 2 回 / 全 5 回

# プリレンダーのパラメータとリダイレクト：:id を値で埋める

> handleSSGRoute と handlePrerenderParamsReplacement が getPrerenderParams の値で :id と \*\* を置き換え、fallback の 1 件を決める行と、resolveRedirectTo が相対のリダイレクトを解く行。0fdcde5426（正規表現の状態）・0bd22dae09 と、その後の b3bbada1ef・f2cd8c8cf7・97ed36ec4f・8aa16b6f9f・92033cea10・bf1602a916（22.2.7 に入っている）・267064ca74 の違い。

angular/angular-cli · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/srt-prerender-params)

---

この章で分かること: Prerender のサーバールートに `getPrerenderParams` を書いたとき、ルートの取り出しが `product/:id` や `docs/**` を実際の URL の一覧に変える手順と、その横で残す fallback の 1 件、リダイレクト先（`redirectTo`）を解く手順です。44129f66a3 の行を読み、その行を入れた・直したコミット（0fdcde5426・0bd22dae09）と、44129f66a3 より後の本家で同じ場所がどう変わったか（b3bbada1ef・f2cd8c8cf7・97ed36ec4f・8aa16b6f9f・92033cea10・267064ca74・bf1602a916）を、違いとして並べます。最後に、本物の @angular/ssr で値に `/` や空文字を入れた場合を含めて取り出した記録を、版ごとに見ます。

読む対象は `packages/angular/ssr/src/routes/ng-routes.ts` の `handleSSGRoute`・`handlePrerenderParamsReplacement`・`resolveRedirectTo` と、`src/utils/url.ts` の `joinUrlParts` です。この 3 つの関数の本体の行は [ssr-server-routes の章](../platform/05-ssr-server-routes.md)の 7 節で一度読んでいます。この章は、そこで引用した行の前後と、版による違い、記録で見える振る舞いを読みます。取り出しの全体（誰が、どの引数で呼ぶか）は[第 1 回](01-srt-extract.md)、リクエストのときに `*` を埋めて `Location` を作る側は [ssrx-redirects の章](../ssrx/06-ssrx-redirects.md)です。

1. [1. ルートを取り出す](01-srt-extract.md)
2. **2. プリレンダーのパラメータとリダイレクト**（この章）
3. [3. ルートの木](03-srt-route-tree.md)
4. [4. manifest と renderAngular](04-srt-manifest-render.md)
5. [5. spec と issue](05-srt-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> **プリレンダー**はビルドのときに HTML を作っておくことです。`product/:id` のように値が決まっていない経路は、そのままでは何枚の HTML を作ればよいか分かりません。そこで利用者がサーバールートに `getPrerenderParams`（`[{ id: '1' }, { id: '2' }]` のような「名前 → 値」の配列を返す関数）を書き、ビルドがそれを呼んで `/product/1`・`/product/2` を作ります。**fallback** は、作らなかった値の URL（`/product/99`）が来たときの扱いです。

## 1. handleSSGRoute の入口

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L389–421 （▶ の行: 401, 403–407, 409–410, 415–416, 418–419）

```ts
389 │ /**
390 │  * Handles SSG (Static Site Generation) routes by invoking `getPrerenderParams` and yielding
391 │  * all parameterized paths, returning any errors encountered.
392 │  *
393 │  * @param serverConfigRouteTree - The tree representing the server's routing setup.
394 │  * @param redirectTo - Optional path to redirect to, if specified.
395 │  * @param metadata - The metadata associated with the route tree node.
396 │  * @param parentInjector - The dependency injection container for the parent route.
397 │  * @param invokeGetPrerenderParams - A flag indicating whether to invoke the `getPrerenderParams` function.
398 │  * @param includePrerenderFallbackRoutes - A flag indicating whether to include fallback routes in the result.
399 │  * @returns An async iterable iterator that yields route tree node metadata for each SSG path or errors.
400 │  */
401 ▶ async function* handleSSGRoute(
402 │   serverConfigRouteTree: RouteTree<ServerConfigRouteTreeAdditionalMetadata> | undefined,
403 ▶   redirectTo: string | undefined,
404 ▶   metadata: ServerConfigRouteTreeNodeMetadata,
405 ▶   parentInjector: Injector,
406 ▶   invokeGetPrerenderParams: boolean,
407 ▶   includePrerenderFallbackRoutes: boolean,
408 │ ): AsyncIterableIterator<RouteTreeNodeMetadata | { error: string }> {
409 ▶   if (metadata.renderMode !== RenderMode.Prerender) {
410 ▶     throw new Error(
411 │       `'handleSSGRoute' was called for a route which rendering mode is not prerender.`,
412 │     );
413 │   }
414 │ 
415 ▶   const { route: currentRoutePath, fallback, ...meta } = metadata;
416 ▶   const getPrerenderParams = 'getPrerenderParams' in meta ? meta.getPrerenderParams : undefined;
417 │ 
418 ▶   if ('getPrerenderParams' in meta) {
419 ▶     delete meta['getPrerenderParams'];
420 │   }
421 │ 
```

1. **401〜408 行目：受け取るもの**

   402 行目のサーバールートの木（withRoutes が無ければ `undefined`）、403 行目の Router のルートの `redirectTo`（文字列のときだけ。関数は handleRoute が渡す前に `undefined` にする）、404 行目の `metadata`（当たったサーバールートの値を広げたもの）、405 行目の親の注入器、406・407 行目の 2 つの旗です。
2. **409〜413 行目：Prerender でなければ投げる**

   呼ぶのは handleRoute の Prerender の分岐だけなので、ここに来るのは作りの間違いのときだけです。投げたものは handleRoute の catch で 1 件のエラーになります（[第 1 回](01-srt-extract.md)の 4 節）。
3. **415〜419 行目：getPrerenderParams を metadata から取り出して消す**

   415 行目で `route` と `fallback` を別に取り、残りを `meta` にします。416 行目で関数を取り、418・419 行目で `meta` から消します。`meta` は結果の値の元になり、そのままビルドの manifest に書かれる（[第 4 回](04-srt-manifest-render.md)）ので、関数を残せません。`fallback` も結果に入れません（6 節で使うだけ）。

## 2. :param があるか、の判定と 0fdcde5426

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L432–446 （▶ の行: 432–434, 437, 440–442, 444）

```ts
432 ▶     yield {
433 ▶       ...meta,
434 ▶       route: currentRoutePath,
435 │     };
436 │ 
437 ▶     return;
438 │   }
439 │ 
440 ▶   if (invokeGetPrerenderParams) {
441 ▶     if (!getPrerenderParams) {
442 ▶       yield {
443 │         error:
444 ▶           `The '${stripLeadingSlash(currentRoutePath)}' route uses prerendering and includes parameters, but 'getPrerenderParams' ` +
445 │           `is missing. Please define 'getPrerenderParams' function for this route in your server routing configuration ` +
446 │           `or specify a different 'renderMode'.`,
```

この引用のすぐ上の行（[ssr-server-routes](../platform/05-ssr-server-routes.md) の 7 節の引用。22.2.7 では次の節の 719・720 行目）で、経路が `/**` で終わるか、`:` で始まる区切りを含むかを正規表現で調べます。どちらでもなければ、432〜437 行目でその経路をそのまま 1 件にして終わります。440 行目からが展開する場合で、441 行目から、展開する関数が無ければエラーです（記録の「getPrerenderParams なし」）。440 行目の `invokeGetPrerenderParams` が偽（リクエストのときの取り出し）なら、展開も 444 行目のエラーも飛ばして、6 節の fallback の 1 件だけになります。

📄 `git show 0fdcde5426 -- packages/angular/ssr/src/routes/ng-routes.ts`

```ts
0fdcde5426 2026-05-11 fix(@angular/ssr): remove stateful flag from URL_PARAMETER_REGEXP

diff --git a/packages/angular/ssr/src/routes/ng-routes.ts b/packages/angular/ssr/src/routes/ng-routes.ts
index 438e8450d3..04f67c96d9 100644
--- a/packages/angular/ssr/src/routes/ng-routes.ts
+++ b/packages/angular/ssr/src/routes/ng-routes.ts
@@ -74,9 +74,14 @@ const MODULE_PRELOAD_MAX = 10;
 const CATCH_ALL_REGEXP = /\/(\*\*)$/;
 
 /**
- * Regular expression to match segments preceded by a colon in a string.
+ * Regular expression to match a segment preceded by a colon in a string.
  */
-const URL_PARAMETER_REGEXP = /(?<!\\):([^/]+)/g;
+const URL_PARAMETER_REGEXP = /(?<!\\):([^/]+)/;
+
+/**
+ * Regular expression to match all segments preceded by a colon in a string.
+ */
+const URL_PARAMETER_GLOBAL_REGEXP = new RegExp(URL_PARAMETER_REGEXP, 'g');
 
 /**
  * Additional metadata for a server configuration route tree.
@@ -464,7 +469,7 @@ async function* handleSSGRoute(
       for (const params of parameters) {
         const replacer = handlePrerenderParamsReplacement(params, currentRoutePath);
         const routeWithResolvedParams = currentRoutePath
-          .replace(URL_PARAMETER_REGEXP, replacer)
+          .replace(URL_PARAMETER_GLOBAL_REGEXP, replacer)
           .replace(CATCH_ALL_REGEXP, replacer);
 
         yield {

```
*2026-05-11。#33154「getPrerenderParams が黙って飛ばされる」を閉じたコミット。spec の変更は無い。*

それまでの `URL_PARAMETER_REGEXP` は `g` 付きで、判定の `test` と置き換えの `replace` の両方に同じオブジェクトを使っていました。`g` 付きの正規表現は `test` のたびに `lastIndex`（次に探し始める位置）を覚えるので、前の経路で進んだ位置から次の経路を探してしまいます。仕組みは [ssrx-redirects](../ssrx/06-ssrx-redirects.md) の 7 節に Node で確かめた表があります。このコミットは、判定用を `g` なしにし、置き換え用に `g` 付きの `URL_PARAMETER_GLOBAL_REGEXP` を別に作りました。

取り出しの中では、どの順で呼ぶと壊れるのかを記録で確かめました（DEMO の「正規表現の状態（3 版）」）。`git archive 0fdcde5426^` で取り出した src を束ね、`a/:x`・`bb/:y`・`ccc/:z` の 3 つの Prerender のルートを、同じプロセスで 2 回取り出しています。

1. **1 回目（invoke=false）：bb/:y が Prerender の 1 件になる**

   `/a/:x` の `test` が当たって `lastIndex` が 5 になり、invoke=false なので `replace`（`lastIndex` を 0 に戻す）が走りません。次の `/bb/:y` は 5 文字目の `y` から探すので外れ、「`:param` の無い経路」として Prerender の 1 件になります。本当は fallback の Server の 1 件です。
2. **2 回目（invoke=true）：a/:x の getPrerenderParams が呼ばれない**

   1 回目の最後の `/ccc/:z` で残った `lastIndex`（7）は、正規表現がモジュールの定数なので 2 回目に持ち越されます。`/a/:x`（5 文字）は 7 から探すので外れ、関数が呼ばれずに `/a/:x` がそのまま Prerender の 1 件になります。1 回目から invoke=true なら、当たったあとの `replace` が毎回 0 に戻すので、3 つとも呼ばれます（記録を作る途中に、0fdcde5426^ を invoke=true だけで 1 回取り出して確かめた）。44129f66a3 と 22.2.7 は、2 回目も 3 つとも呼ばれています。

📄 `git show 0bd22dae09 -- packages/angular/ssr/src/routes/ng-routes.ts`

```ts
0bd22dae09 2026-07-06 fix(@angular/ssr): replace all route parameters when resolving relative redirects

diff --git a/packages/angular/ssr/src/routes/ng-routes.ts b/packages/angular/ssr/src/routes/ng-routes.ts
index 04f67c96d9..ac83aae8cd 100644
--- a/packages/angular/ssr/src/routes/ng-routes.ts
+++ b/packages/angular/ssr/src/routes/ng-routes.ts
@@ -547,7 +547,7 @@ function resolveRedirectTo(routePath: string, redirectTo: string): string {
   }
 
   // Resolve relative redirectTo based on the current route path.
-  const segments = routePath.replace(URL_PARAMETER_REGEXP, '*').split('/');
+  const segments = routePath.replace(URL_PARAMETER_GLOBAL_REGEXP, '*').split('/');
   segments.pop(); // Remove the last segment to make it relative.
 
   return joinUrlParts(...segments, redirectTo);

```
*2026-07-06。#33504。0fdcde5426 が g を外したあと、resolveRedirectTo の replace が最初の 1 つしか \* にしなくなっていた。*

0fdcde5426 は `handleSSGRoute` の `replace` を `URL_PARAMETER_GLOBAL_REGEXP` に替えましたが、`resolveRedirectTo` の `replace`（6 節の 550 行目）は `URL_PARAMETER_REGEXP` のまま残しました。その名前の中身が `g` なしに変わったので、`:param1/:param2` の 2 つ目が `*` にならなくなりました。0bd22dae09 はその 1 行を直し、spec（`should extract nested redirects with multiple path parameters`）を足しています。同じ正規表現の `g` の有無を、2 か月おいて両側から直した形です。

## 3. getPrerenderParams を呼ぶ文脈と、子への引き継ぎ

呼び出しそのもの（`runInInjectionContext(parentInjector, () => getPrerenderParams())`）は [ssr-server-routes](../platform/05-ssr-server-routes.md) の 7 節で読みました。ここでは 22.2.7 の同じ場所を、記録と並べます。22.2.7 の `handleSSGRoute` は、44129f66a3 から引数が 1 つ増え（`route` と `parentRoute`）、リダイレクトの解き方が変わっています（7 節）。

📄 `node_modules/@angular/ssr/fesm2022/ssr.mjs（22.2.7）` L706–745 （▶ の行: 706, 719–720, 727–728, 734–738, 741）

```
706 ▶ async function* handleSSGRoute(serverConfigRouteTree, route, parentRoute, metadata, parentInjector, invokeGetPrerenderParams, includePrerenderFallbackRoutes) {
707 │   if (metadata.renderMode !== RenderMode.Prerender) {
708 │     throw new Error(`'handleSSGRoute' was called for a route which rendering mode is not prerender.`);
709 │   }
710 │   const {
711 │     route: currentRoutePath,
712 │     fallback,
713 │     ...meta
714 │   } = metadata;
715 │   const getPrerenderParams = 'getPrerenderParams' in meta ? meta.getPrerenderParams : undefined;
716 │   if ('getPrerenderParams' in meta) {
717 │     delete meta['getPrerenderParams'];
718 │   }
719 ▶   const isCatchAllRoute = CATCH_ALL_REGEXP.test(currentRoutePath);
720 ▶   if (isCatchAllRoute && !getPrerenderParams || !isCatchAllRoute && !URL_PARAMETER_REGEXP.test(currentRoutePath)) {
721 │     yield {
722 │       ...meta,
723 │       route: currentRoutePath
724 │     };
725 │     return;
726 │   }
727 ▶   if (invokeGetPrerenderParams) {
728 ▶     if (!getPrerenderParams) {
729 │       yield {
730 │         error: `The '${stripLeadingSlash(currentRoutePath)}' route uses prerendering and includes parameters, but 'getPrerenderParams' ` + `is missing. Please define 'getPrerenderParams' function for this route in your server routing configuration ` + `or specify a different 'renderMode'.`
731 │       };
732 │       return;
733 │     }
734 ▶     if (serverConfigRouteTree) {
735 ▶       const catchAllRoutePath = isCatchAllRoute ? currentRoutePath : joinUrlParts(currentRoutePath, '**');
736 ▶       const match = serverConfigRouteTree.match(catchAllRoutePath);
737 ▶       if (match && match.renderMode === RenderMode.Prerender && !('getPrerenderParams' in match)) {
738 ▶         serverConfigRouteTree.insert(catchAllRoutePath, {
739 │           ...match,
740 │           presentInClientRouter: true,
741 ▶           getPrerenderParams
742 │         });
743 │       }
744 │     }
745 │     const redirectTo = typeof route.redirectTo === 'string' ? route.redirectTo : undefined;
```

📄 `node_modules/@angular/ssr/fesm2022/ssr.mjs（22.2.7）` L746–772 （▶ の行: 746–750, 754, 757–759, 761, 764, 768）

```
746 ▶     const parameters = await runInInjectionContext(parentInjector, () => getPrerenderParams());
747 ▶     try {
748 ▶       for (const params of parameters) {
749 ▶         const replacer = handlePrerenderParamsReplacement(params, currentRoutePath);
750 ▶         const routeWithResolvedParams = currentRoutePath.replace(URL_PARAMETER_GLOBAL_REGEXP, replacer).replace(CATCH_ALL_REGEXP, replacer);
751 │         yield {
752 │           ...meta,
753 │           route: routeWithResolvedParams,
754 ▶           redirectTo: redirectTo === undefined ? undefined : resolveRedirectTo(parentRoute.replace(URL_PARAMETER_GLOBAL_REGEXP, replacer), route, redirectTo, parameter => params[parameter.slice(1)])
755 │         };
756 │       }
757 ▶     } catch (error) {
758 ▶       yield {
759 ▶         error: `${error.message}`
760 │       };
761 ▶       return;
762 │     }
763 │   }
764 ▶   if (includePrerenderFallbackRoutes && (fallback !== PrerenderFallback.None || !invokeGetPrerenderParams)) {
765 │     yield {
766 │       ...meta,
767 │       route: currentRoutePath,
768 ▶       renderMode: fallback === PrerenderFallback.Client ? RenderMode.Client : RenderMode.Server
769 │     };
770 │   }
771 │ }
772 │ function handlePrerenderParamsReplacement(params, currentRoutePath) {
```

1. **22.2.7 の 746 行目：親の注入器の中で呼ぶ**

   `parentInjector` は、そのルートを辿っている注入器です。一番上のルートならアプリの環境注入器、loadChildren の子なら読み込みが返した注入器です。記録の「:id が 1 つ」では、`getPrerenderParams` の中の `inject(ProductService)`（`providedIn: 'root'`）が動き、`/product/1`・`/product/2` ができました。`await` しているので、関数は Promise を返してもかまいません。
2. **746 行目は try の外：投げると handleRoute の catch へ**

   747 行目の `try` が包むのは値の置き換えだけです。`getPrerenderParams` 自身が投げた例外は handleRoute の catch で `Error in handleRoute for '/news/:id': API が 503 を返した` の形になりました（記録の「例外を投げる」）。同じアプリの `about` は残ります。`news/:id` は fallback の 1 件も出ません。
3. **734〜743 行目：product/:id/\*\* へ関数を引き継ぐ**

   `product/:id` の関数を、サーバールートの木の `product/:id/**`（関数を持たない Prerender のもの）に入れ直します。記録の「子へ引き継ぐ」では、関数を書いていない `product/:id/**` に当たる子の `reviews` が `/product/1/reviews`・`/product/2/reviews` に展開されました。親の関数が子の分も呼ばれる形です。
4. **757〜762 行目：1 つの値が不正なら、その経路はそこで終わる**

   置き換えが投げると、エラーを 1 件流して 761 行目で `return` します。配列の残りの値も、764 行目からの fallback の 1 件も出ません。記録の値の表で、`[first, X, last]` の X が不正なとき、出るのは `/item/first` だけです。

## 4. 値の置き換えと、bf1602a916 の検査

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L524–542 （▶ の行: 524, 528）

```ts
524 ▶           'specified in this route.',
525 │       );
526 │     }
527 │ 
528 ▶     return parameterName === '**' ? `/${value}` : value;
529 │   };
530 │ }
531 │ 
532 │ /**
533 │  * Resolves the `redirectTo` property for a given route.
534 │  *
535 │  * This function processes the `redirectTo` property to ensure that it correctly
536 │  * resolves relative to the current route path. If `redirectTo` is an absolute path,
537 │  * it is returned as is. If it is a relative path, it is resolved based on the current route path.
538 │  *
539 │  * @param routePath - The current route path.
540 │  * @param redirectTo - The target path for redirection.
541 │  * @returns The resolved redirect path as a string.
542 │  */
```

44129f66a3 の置き換え関数の最後の行です。値が文字列かどうか（この引用の上の行、[ssr-server-routes](../platform/05-ssr-server-routes.md) の 7 節）しか調べず、528 行目で、`**` の値は前に `/` を付けて、ほかの値はそのまま経路に差し込みます。だから `a/b` を返すと `/item/a/b`（2 段の経路）、`..` を返すと `/item/..` になっていました（記録の値の表の左）。

📄 `git show bf1602a916 -- packages/angular/ssr/src/routes/ng-routes.ts`

```ts
bf1602a916 2026-10-30 fix(@angular/ssr): validate prerender parameter values

diff --git a/packages/angular/ssr/src/routes/ng-routes.ts b/packages/angular/ssr/src/routes/ng-routes.ts
index 72caca9994..29410a5866 100644
--- a/packages/angular/ssr/src/routes/ng-routes.ts
+++ b/packages/angular/ssr/src/routes/ng-routes.ts
@@ -91,6 +91,13 @@ const URL_PARAMETER_REGEXP = /(?<!\\):([^/]+)/;
  */
 const URL_PARAMETER_GLOBAL_REGEXP = new RegExp(URL_PARAMETER_REGEXP, 'g');
 
+/**
+ * Characters that cannot appear in a percent-decoded path segment: path separators (`\` is one in
+ * `http:` URLs), query and fragment delimiters, matrix parameters, route tree wildcards, `%` (route
+ * segments are decoded again when the route tree is restored) and control characters.
+ */
+const INVALID_PATH_SEGMENT_CHARS_REGEXP = /[/\\?#;*%\p{Control}]/u;
+
 /**
  * Additional metadata for a server configuration route tree.
  */
@@ -580,10 +587,43 @@ function handlePrerenderParamsReplacement(
       );
     }
 
+    const segments = parameterName === '**' ? (value ? value.split('/') : []) : [value];
+    if (!segments.every(isPathSegment)) {
+      throw new Error(
+        `The 'getPrerenderParams' function defined for the '${stripLeadingSlash(currentRoutePath)}' route ` +
+          `returned an invalid value '${value}' for parameter '${parameterName}'. ` +
+          `Please make sure the value is a valid URL path${parameterName === '**' ? '' : ' segment'} ` +
+          'without dot segments or reserved characters.',
+      );
+    }
+
     return parameterName === '**' ? `/${value}` : value;
   };
 }
 
+/**
+ * Checks whether a value is a single, non-empty path segment.
+ *
+ * @param segment - The percent-encoded segment to check.
+ * @returns `true` if the value is a single, non-empty path segment.
+ */
+function isPathSegment(segment: string): boolean {
+  let decoded: string;
+  try {
+    decoded = decodeURIComponent(segment);
+  } catch {
+    return false;
+  }
+
+  return (
+    decoded.length > 0 &&
+    decoded !== '.' &&
+    decoded !== '..' &&
+    decoded[0] !== ':' &&
+    !INVALID_PATH_SEGMENT_CHARS_REGEXP.test(decoded)
+  );
+}
+
 /**
  * Resolves the `redirectTo` property for a given route, replacing any `:id` route parameters
  * in its path and resolving relative paths against `parentRoute`.

```
*2026-10-30（44129f66a3 より後。22.2.7 には dcd5029bbd として入っている）。*

📄 `node_modules/@angular/ssr/fesm2022/ssr.mjs（22.2.7）` L772–785 （▶ の行: 776, 779–781, 783）

```
772 │ function handlePrerenderParamsReplacement(params, currentRoutePath) {
773 │   return match => {
774 │     const parameterName = match.slice(1);
775 │     const value = params[parameterName];
776 ▶     if (typeof value !== 'string') {
777 │       throw new Error(`The 'getPrerenderParams' function defined for the '${stripLeadingSlash(currentRoutePath)}' route ` + `returned a non-string value for parameter '${parameterName}'. ` + `Please make sure the 'getPrerenderParams' function returns values for all parameters ` + 'specified in this route.');
778 │     }
779 ▶     const segments = parameterName === '**' ? value ? value.split('/') : [] : [value];
780 ▶     if (!segments.every(isPathSegment)) {
781 ▶       throw new Error(`The 'getPrerenderParams' function defined for the '${stripLeadingSlash(currentRoutePath)}' route ` + `returned an invalid value '${value}' for parameter '${parameterName}'. ` + `Please make sure the value is a valid URL path${parameterName === '**' ? '' : ' segment'} ` + 'without dot segments or reserved characters.');
782 │     }
783 ▶     return parameterName === '**' ? `/${value}` : value;
784 │   };
785 │ }
```

📄 `node_modules/@angular/ssr/fesm2022/ssr.mjs（22.2.7）` L786–794 （▶ の行: 789, 791, 793）

```
786 │ function isPathSegment(segment) {
787 │   let decoded;
788 │   try {
789 ▶     decoded = decodeURIComponent(segment);
790 │   } catch {
791 ▶     return false;
792 │   }
793 ▶   return decoded.length > 0 && decoded !== '.' && decoded !== '..' && decoded[0] !== ':' && !INVALID_PATH_SEGMENT_CHARS_REGEXP.test(decoded);
794 │ }
```

1. **22.2.7 の 779 行目：区切りに分ける**

   `:id` の値は 1 つの区切り、`**` の値は `/` で分けた区切りの並びです。`**` の空文字は区切り 0 個なので通ります（`docs/**` に `''` → `/docs/`）。
2. **789〜791 行目：decode できない値は不正**

   `%E0` のように壊れたパーセントエンコードは `decodeURIComponent` が投げるので、偽です。
3. **793 行目：decode したあとの区切りを調べる**

   空でない、`.` と `..` でない、`:` で始まらない、そして `/ \ ? # ; * %` と制御文字を含まない。差分のコメントのとおり、`\` は http の URL では区切り、`?` と `#` はクエリとハッシュの始まり、`;` は行列パラメータ、`*` はルートの木のワイルドカード、`%` は木を manifest から組み直すときにもう一度 decode されるからです。decode してから調べるので、`a%2Fb` も `/` を含む値として外れます。

空白は外れません。記録では `a b` を返すと、どちらの版でも経路は `/item/a b` のまま（エンコードされない）でした。

## 5. fallback の 1 件

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L495–511 （▶ の行: 496, 498–499）

```ts
495 │   ) {
496 ▶     yield {
497 │       ...meta,
498 ▶       route: currentRoutePath,
499 ▶       renderMode: fallback === PrerenderFallback.Client ? RenderMode.Client : RenderMode.Server,
500 │     };
501 │   }
502 │ }
503 │ 
504 │ /**
505 │  * Creates a replacer function used for substituting parameter placeholders in a route path
506 │  * with their corresponding values provided in the `params` object.
507 │  *
508 │  * @param params - An object mapping parameter names to their string values.
509 │  * @param currentRoutePath - The current route path, used for constructing error messages.
510 │  * @returns A function that replaces a matched parameter placeholder (e.g., ':id') with its corresponding value.
511 │  */
```

展開した URL のほかに、型そのもの（`/product/:id`）を 1 件返すのが 496〜500 行目です。499 行目、描き方は fallback が Client なら Client、それ以外（書かなかったとき・Server）なら Server です。出すかどうかの条件はこの引用の直前の行（22.2.7 では 764 行目）で、`includePrerenderFallbackRoutes` が真で、しかも「fallback が None でない」か「invoke が偽」です。

| サーバールート | invoke=true・fallback=true（ビルドの server） | invoke=true・fallback=false（ビルドの static） | invoke=false・fallback=true（リクエストのとき） |
| --- | --- | --- | --- |
| `product/:id`（fallback を書かない） | `/product/1`・`/product/2`（Prerender）＋ `/product/:id`（Server） | `/product/1`・`/product/2` | `/product/:id`（Server） |
| `user/:uid/post/:pid`（Client） | 2 件 ＋ 型（Client） | 2 件 | 型（Client） |
| `tag/:name`（None） | `/tag/angular` だけ | `/tag/angular` だけ | `/tag/:name`（Server） |
| `docs/**`（None） | `/docs/guide/start`・`/docs/intro`・`/docs/` | 同じ | `/docs/**`（Server） |

右の列のとおり、None でもリクエストのときの木には型が Server で入ります。ビルドで `/tag/angular` しか作らなくても、開発サーバーなど manifest に木の無い取り出しでは `/tag/other` がサーバーで描かれます。どの列の値も 44129f66a3 と 22.2.7 で同じでした（DEMO で切り替えて確かめられます）。

## 6. リダイレクト先を解く：44129f66a3 の resolveRedirectTo

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L548–566 （▶ の行: 550–551, 553）

```ts
548 │ 
549 │   // Resolve relative redirectTo based on the current route path.
550 ▶   const segments = routePath.replace(URL_PARAMETER_GLOBAL_REGEXP, '*').split('/');
551 ▶   segments.pop(); // Remove the last segment to make it relative.
552 │ 
553 ▶   return joinUrlParts(...segments, redirectTo);
554 │ }
555 │ 
556 │ /**
557 │  * Builds a server configuration route tree from the given server routes configuration.
558 │  *
559 │  * @param serverRoutesConfig - The server routes to be used for configuration.
560 │ 
561 │  * @returns An object containing:
562 │  * - `serverConfigRouteTree`: A populated `RouteTree` instance, which organizes the server routes
563 │  *   along with their additional metadata.
564 │  * - `errors`: An array of strings that list any errors encountered during the route tree construction
565 │  *   process, such as invalid paths.
566 │  */
```

📄 `angular-cli/packages/angular/ssr/src/utils/url.ts` L81–103 （▶ の行: 92–94, 97, 101）

````ts
 81 │ /**
 82 │  * Joins URL parts into a single URL string.
 83 │  *
 84 │  * This function takes multiple URL segments, normalizes them by removing leading
 85 │  * and trailing slashes where appropriate, and then joins them into a single URL.
 86 │  *
 87 │  * @param parts - The parts of the URL to join. Each part can be a string with or without slashes.
 88 │  * @returns The joined URL string, with normalized slashes.
 89 │  *
 90 │  * @example
 91 │  * ```js
 92 ▶  * joinUrlParts('path/', '/to/resource'); // '/path/to/resource'
 93 ▶  * joinUrlParts('/path/', 'to/resource'); // '/path/to/resource'
 94 ▶  * joinUrlParts('', ''); // '/'
 95 │  * ```
 96 │  */
 97 ▶ export function joinUrlParts(...parts: string[]): string {
 98 │   const normalizedParts: string[] = [];
 99 │ 
100 │   for (const part of parts) {
101 ▶     if (part === '') {
102 │       // Skip any empty parts
103 │       continue;
````

1. **550 行目：いまの経路の :param を \* にして / で分ける**

   `/user/:id/old` は `['', 'user', '*', 'old']`。`*` はリクエストのときに、同じ位置の区切りで埋められます（[ssrx-redirects](../ssrx/06-ssrx-redirects.md) の 4 節の `buildPathWithParams`）。
2. **551 行目：最後の 1 区切りを捨てる**

   `['', 'user', '*']`。「相対の行き先は、いまの経路の最後の区切りの代わり」とみなしています。
3. **553 行目：joinUrlParts でつなぐ**

   101 行目で空の部分を飛ばし、92〜94 行目の例のとおり `/` を整えて、`/user/*/new` になります。

この「最後の 1 区切りだけ替える」が、Router と違うところでした。Router の相対の `redirectTo` は、そのルートが消費した区切りを**全部**置き換えます（[Router のリダイレクトの章](../router/10-router-redirects.md)）。`path: 'old/page', redirectTo: 'new/page'` は Router では `/new/page` ですが、44129f66a3 のサーバーは `/old/new/page` を木に入れていました（記録の「redirectTo」）。

## 7. 44129f66a3 より後：リダイレクトの解き方の 7 本

📄 `git log（読んだだけ。引用はしない）`

```
$ git log --format='%h %ad %s' --date=short 44129f66a3..origin/main -- packages/angular/ssr/src/routes/ng-routes.ts
bf1602a916 2026-10-30 fix(@angular/ssr): validate prerender parameter values
267064ca74 2026-10-26 refactor(@angular/ssr): parse route paths and redirect URLs into structured segments and query params
92033cea10 2026-10-23 refactor(@angular/ssr): combine redirect URL parameter helpers and use DefaultUrlSerializer
97ed36ec4f 2026-10-12 fix(@angular/ssr): resolve route parameters in redirect targets (#34321)
0b9a52cc95 2026-10-13 fix(@angular/ssr): preserve preload metadata for nested empty-path routes
b3bbada1ef 2026-10-12 fix(@angular/ssr): resolve relative redirects against the parent route
f2cd8c8cf7 2026-10-12 fix(@angular/ssr): preserve query parameters on relative route redirects
$ git log --format='%h %s' 44129f66a3..v22.2.7 -- packages/angular/ssr/src/routes/ng-routes.ts   # 22.2.x に入った同じ修正
dcd5029bbd fix(@angular/ssr): validate prerender parameter values                       # = bf1602a916
85e4a03114 refactor(@angular/ssr): combine redirect URL parameter helpers and use …      # = 92033cea10
ff3f3727a9 fix(@angular/ssr): resolve route parameters in redirect targets (#34321)     # = 97ed36ec4f
bd09b98fca fix(@angular/ssr): preserve preload metadata for nested empty-path routes   # = 0b9a52cc95
a2b86cc94d fix(@angular/ssr): resolve relative redirects against the parent route      # = b3bbada1ef
a925468929 fix(@angular/ssr): preserve query parameters on relative route redirects    # = f2cd8c8cf7
$ git diff --stat v22.2.7 origin/main -- packages/angular/ssr/src
 packages/angular/ssr/src/routes/ng-routes.ts |  71 ++++---     # 267064ca74 だけが 22.2.7 に無い
 packages/angular/ssr/src/utils/url.ts        | 275 ++++++++++++++++++++++++---
```

この 7 本のうち 267064ca74 以外は、22.x の枝にも入っていて、22.2.7 に含まれています。

| コミット | 何が変わったか | 記録（22.2.7）で見える違い |
| --- | --- | --- |
| b3bbada1ef（#34300） | `resolveRedirectTo` の 1 つ目の引数を「いまの経路」から「親の経路」にし、551 行目の `pop` をやめた。Router と同じく、ルートが消費した区切りを全部置き換える | `old/page` → `/new/page`、`user/:id/old` の `'new'` → `/new` |
| f2cd8c8cf7（#34298） | 相対の行き先からクエリとハッシュを捨て（`split(/[?#]/, 1)`）、値に `relativeRedirect: true` を付ける。リクエストのときは、相対ならリクエストのクエリを足す（app.ts） | `q-old` の `'q-new?x=1'` → `/q-new`（相対） |
| 97ed36ec4f（#34410・PR #34321） | 行き先の `:id` を解く。リクエストのときに埋める値は `*` と「URL の何番目の区切りか」（`*2`）で書く。Prerender で展開した経路では、その値を直接入れる。ルートの path に無い `:param` を行き先に書くと投げる | `profile/:id` の `'/u/:id'` → `/u/*2`。`p/1` の `'/product/:id'` → `/product/1`（44129f66a3 では `/product/:id` のまま）。`bad/:a` の `'/y/:b'` は `Cannot redirect to '/y/:b'. Cannot find ':b'.` が handleRoute の catch で 1 件のエラーになり、一覧から消える |
| 8aa16b6f9f（PR #34321） | 絶対の行き先のクエリの `q=:term` を、リクエストのクエリの値で埋める（app.ts と url.ts の側） | 取り出しの値は変わらない（埋めるのはリクエストのとき） |
| 92033cea10 | 97ed36ec4f の `replaceRedirectParams` を `resolveRedirectTo` にまとめ、url.ts の `buildPathWithParams` などを `buildUrlWithParams` にし、Router の `DefaultUrlSerializer` を使う | 取り出しの値の形は変わらない（`*2` を読むのがリクエストのときの `buildUrlWithParams` になる） |
| bf1602a916 | 4 節の値の検査 | 値の表 |
| 267064ca74（22.2.7 に無い） | 経路とリダイレクトの URL を、文字列の split ではなく「区切りの種類（静的・param・wildcard）」の配列にしてから扱う | — |

📄 `git show b3bbada1ef -- packages/angular/ssr/src/routes/ng-routes.ts`

```ts
b3bbada1ef 2026-10-12 fix(@angular/ssr): resolve relative redirects against the parent route

diff --git a/packages/angular/ssr/src/routes/ng-routes.ts b/packages/angular/ssr/src/routes/ng-routes.ts
index 63313b875d..915d7c2b9a 100644
--- a/packages/angular/ssr/src/routes/ng-routes.ts
+++ b/packages/angular/ssr/src/routes/ng-routes.ts
@@ -146,6 +146,7 @@ type EntryPointToBrowserMapping = AngularAppManifest['entryPointToBrowserMapping
 async function* handleRoute(options: {
   metadata: ServerConfigRouteTreeNodeMetadata;
   currentRoutePath: string;
+  parentRoute: string;
   route: Route;
   compiler: Compiler;
   parentInjector: Injector;
@@ -158,6 +159,7 @@ async function* handleRoute(options: {
     const {
       metadata,
       currentRoutePath,
+      parentRoute,
       route,
       compiler,
       parentInjector,
@@ -176,6 +178,7 @@ async function* handleRoute(options: {
       yield* handleSSGRoute(
         serverConfigRouteTree,
         typeof redirectTo === 'string' ? redirectTo : undefined,
+        parentRoute,
         metadata,
         parentInjector,
         invokeGetPrerenderParams,
@@ -191,7 +194,7 @@ async function* handleRoute(options: {
       } else if (typeof redirectTo === 'string') {
         yield {
           ...metadata,
-          redirectTo: resolveRedirectTo(metadata.route, redirectTo),
+          redirectTo: resolveRedirectTo(parentRoute, redirectTo),
           relativeRedirect: redirectTo[0] !== '/' ? true : undefined,
         };
       } else {
@@ -393,6 +396,7 @@ function appendPreloadToMetadata(
  *
  * @param serverConfigRouteTree - The tree representing the server's routing setup.
  * @param redirectTo - Optional path to redirect to, if specified.
+ * @param parentRoute - The path of the parent route.
  * @param metadata - The metadata associated with the route tree node.
  * @param parentInjector - The dependency injection container for the parent route.
  * @param invokeGetPrerenderParams - A flag indicating whether to invoke the `getPrerenderParams` function.
@@ -402,6 +406,7 @@ function appendPreloadToMetadata(
 async function* handleSSGRoute(
   serverConfigRouteTree: RouteTree<ServerConfigRouteTreeAdditionalMetadata> | undefined,
   redirectTo: string | undefined,
+  parentRoute: string,
   metadata: ServerConfigRouteTreeNodeMetadata,
   parentInjector: Injector,
   invokeGetPrerenderParams: boolean,
@@ -421,7 +426,7 @@ async function* handleSSGRoute(
   }
 
   if (redirectTo !== undefined) {
-    meta.redirectTo = resolveRedirectTo(currentRoutePath, redirectTo);
+    meta.redirectTo = resolveRedirectTo(parentRoute, redirectTo);
     meta.relativeRedirect = redirectTo[0] !== '/' ? true : undefined;
   }
 
@@ -480,7 +485,10 @@ async function* handleSSGRoute(
           redirectTo:
             redirectTo === undefined
               ? undefined
-              : resolveRedirectTo(routeWithResolvedParams, redirectTo),
+              : resolveRedirectTo(
+                  parentRoute.replace(URL_PARAMETER_GLOBAL_REGEXP, replacer),
+                  redirectTo,
+                ),
         };
       }
     } catch (error) {
@@ -535,27 +543,24 @@ function handlePrerenderParamsReplacement(
  * Resolves the `redirectTo` property for a given route.
  *
  * This function processes the `redirectTo` property to ensure that it correctly
- * resolves relative to the current route path. If `redirectTo` is an absolute path,
- * it is returned as is. If it is a relative path, it is resolved based on the current route path,
+ * resolves relative to the parent route path. If `redirectTo` is an absolute path,
+ * it is returned as is. If it is a relative path, it is resolved based on the parent route path,
  * and, like in the Angular router, its query and fragment are ignored.
  *
- * @param routePath - The current route path.
+ * @param parentRoute - The path of the parent route.
  * @param redirectTo - The target path for redirection.
  * @returns The resolved redirect path as a string.
  */
-function resolveRedirectTo(routePath: string, redirectTo: string): string {
+function resolveRedirectTo(parentRoute: string, redirectTo: string): string {
   if (redirectTo[0] === '/') {
     // If the redirectTo path is absolute, return it as is.
     return redirectTo;
   }
 
-  // Resolve relative redirectTo based on the current route path.
-  const segments = routePath.replace(URL_PARAMETER_GLOBAL_REGEXP, '*').split('/');
-  segments.pop(); // Remove the last segment to make it relative.
-
+  // Match Angular router behavior: replace all segments matched by the route.
   const [path] = redirectTo.split(/[?#]/, 1);
 
-  return joinUrlParts(...segments, path);
+  return joinUrlParts(parentRoute.replace(URL_PARAMETER_GLOBAL_REGEXP, '*'), path);
 }
 
 /**

```
*2026-10-12。resolveRedirectTo が親の経路を受け取るようになった。handleRoute と handleSSGRoute に parentRoute を渡す。*

📄 `node_modules/@angular/ssr/fesm2022/ssr.mjs（22.2.7）` L539–563 （▶ の行: 539, 543–546, 548, 550, 558）

```
539 ▶     if (ɵentryName && (loadComponent || loadChildren)) {
540 │       appendPreloadToMetadata(ɵentryName, entryPointToBrowserMapping, metadata);
541 │     }
542 │     const parentRoutes = new Map();
543 ▶     if (typeof redirectTo === 'string') {
544 ▶       metadata.redirectTo = resolveRedirectTo(parentRoute, route, redirectTo, parameter => {
545 ▶         const routeSegments = joinUrlParts(baseHref, currentRoutePath).split('/');
546 ▶         return `*${routeSegments.lastIndexOf(parameter)}`;
547 │       });
548 ▶       metadata.relativeRedirect = redirectTo[0] !== '/' ? true : undefined;
549 │     }
550 ▶     if (metadata.renderMode === RenderMode.Prerender) {
551 │       for await (const result of handleSSGRoute(serverConfigRouteTree, route, parentRoute, metadata, parentInjector, invokeGetPrerenderParams, includePrerenderFallbackRoutes)) {
552 │         if ('error' in result) {
553 │           yield result;
554 │         } else {
555 │           parentRoutes.set(result.route, result);
556 │         }
557 │       }
558 ▶     } else if (redirectTo !== undefined && metadata.status && !isValidRedirectResponseCode(metadata.status)) {
559 │       yield {
560 │         error: `The '${metadata.status}' status code is not a valid redirect response code. ` + `Please use one of the following redirect response codes: ${[...VALID_REDIRECT_RESPONSE_CODES.values()].join(', ')}.`
561 │       };
562 │     } else {
563 │       parentRoutes.set(metadata.route, metadata);
```

📄 `node_modules/@angular/ssr/fesm2022/ssr.mjs（22.2.7）` L795–814 （▶ の行: 796, 799, 801, 807–808, 810, 813）

```
795 │ function resolveRedirectTo(parentRoute, route, redirectTo, resolveParam) {
796 ▶   if (redirectTo[0] === '/' && (route.matcher || !redirectTo.includes('/:'))) {
797 │     return redirectTo;
798 │   }
799 ▶   const [path] = redirectTo.split(/[?#]/, 1);
800 │   let resolvedPath = path;
801 ▶   if (!route.matcher && path.includes(':')) {
802 │     const routeSegments = route.path?.split('/') ?? [];
803 │     resolvedPath = path.split('/').map(segment => {
804 │       if (segment[0] !== ':') {
805 │         return segment;
806 │       }
807 ▶       if (!routeSegments.includes(segment)) {
808 ▶         throw new Error(`Cannot redirect to '${redirectTo}'. Cannot find '${segment}'.`);
809 │       }
810 ▶       return resolveParam(segment);
811 │     }).join('/');
812 │   }
813 ▶   return redirectTo[0] === '/' ? resolvedPath + redirectTo.slice(path.length) : joinUrlParts(parentRoute.replace(URL_PARAMETER_GLOBAL_REGEXP, '*'), resolvedPath);
814 │ }
```

1. **22.2.7 の 543〜549 行目：リダイレクトは描き方より先に解く**

   44129f66a3 では Prerender の分岐（handleSSGRoute の中）とそれ以外の分岐で別々に解いていました。22.2.7 は handleRoute の頭で 1 回解き、`metadata` に書きます。
2. **545・546 行目：:id は「何番目の区切りか」で書く**

   `joinUrlParts(baseHref, currentRoutePath).split('/')` の中での `:id` の位置を `*2` のように書きます。`/profile/:id` なら `['', 'profile', ':id']` の 2 番目です。リクエストのときに、その位置の区切りで埋めます。
3. **796 行目：絶対で :param を含まなければ、そのまま**

   matcher のルートも、行き先の :param は実行時にしか分からないのでそのままです。
4. **801〜811 行目：行き先の :param は、ルート自身の path にあるものだけ**

   807・808 行目、無ければ投げます。Router でも、行き先に使える `:param` はそのルートの path のものだけです。
5. **813 行目：絶対なら解いた経路 + 元のクエリ、相対なら親の経路とつなぐ**

   相対の側は `path`（クエリとハッシュを落としたもの）だけを使うので、`q-new?x=1` の `?x=1` は消えます（f2cd8c8cf7）。

## 8. DEMO

> **🧪 DEMO 1 — getPrerenderParams とリダイレクトを持つアプリから取り出した記録（再生）**
>
> `<scratchpad>/srt-demo/a/record-params.mjs` を Node v24.22.1 で走らせた記録です（JIT・zoneless、@angular/core 22.2.6）。同じアプリを、44129f66a3 の src を束ねたもの・npm の @angular/ssr 22.2.7・（「正規表現の状態」だけ）0fdcde5426^ の src を束ねたもので取り出しました。呼んだのは `getRoutesFromAngularRouterConfig(bootstrap, document, new URL('http://localhost/'), invoke, fallback)` で、外への通信はありません。太字の行が Prerender です。
>
> product/:id（Prerender、fallback は書かない）。getPrerenderParams は inject(ProductService) から 2 つの id を返す
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/srt-prerender-params)

> **🧪 DEMO 2 — 値の置き換えをページの上で**
>
> 44129f66a3 の ng-routes.ts 512〜530 行目（と 74・84 行目の正規表現）、22.2.7 の ssr.mjs の 772〜794 行目を写した関数で、472・473 行目と同じ 2 回の `replace` をします。エラーの文だけ短くしています。@angular/ssr は読み込んでいません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/srt-prerender-params)

## 呼び出しの連なり

- `extractRoutesAndCreateRouteTree({ invokeGetPrerenderParams: true, … })` — ビルドの routes-extractor-worker — *リクエストのときは invoke=false*
  - `handleRoute({ metadata: { renderMode: Prerender, getPrerenderParams, fallback } })` — ng-routes.ts L146 — *22.2.7 はここで redirectTo を解く*
    - `handleSSGRoute(tree, redirectTo, metadata, parentInjector, invoke, fallback)` — L401 — *関数を meta から消す（418・419）*
      - `URL_PARAMETER_REGEXP.test(route)` — L429 — *0fdcde5426 で g なしに*
      - `runInInjectionContext(parentInjector, () => getPrerenderParams())` — L467 — *try の外*
      - `route.replace(URL_PARAMETER_GLOBAL_REGEXP, replacer).replace(CATCH_ALL_REGEXP, replacer)` — L472・473 — *22.2.7 は isPathSegment で検査*
        - `resolveRedirectTo(route, redirectTo)` — L543 — *22.2.7 は (parentRoute, route, redirectTo, resolveParam)*
      - `yield { ...meta, route, renderMode: Server | Client }` — L496 — *fallback の 1 件*

## テストと直し方

### spec と it

| describe / it | test/routes/ng-routes\_spec.ts の行 | この章のどこ |
| --- | --- | --- |
| describe ``when `invokeGetPrerenderParams` is true``（5 つの it） | 184 | 3〜5 節 |
| `should resolve parameterized routes for SSG and add a fallback route if fallback is Server`／`… is Client`／`… SSG add a fallback route if fallback is Server` | 185・218・256 | 5 節 |
| `should resolve catch all routes for SSG and add a fallback route if fallback is Server` | 293 | 4 節の 528 行目（`name` と `**`） |
| `should extract nested redirects that are not explicitly defined.`（describe の中と外に 1 つずつ） | 331・470 | 6 節 |
| `should extract nested redirects with multiple path parameters` | 505 | 2 節の 0bd22dae09 |
| ``should not resolve parameterized routes for SSG when `invokeGetPrerenderParams` is false`` | 534 | 2 節の 440 行目 |
| `should not include fallback routes …`／`should include fallback routes …` | 566・605 | 5 節 |

44129f66a3 の spec には、`getPrerenderParams` が文字列でない値・不正な値を返す it も、`getPrerenderParams` が投げる it もありません（bf1602a916 が前者の it を 97 行足しています）。0fdcde5426 は spec を足していません。

### 手元で走らせた結果

📄 `走らせたコマンド`

```
cd ~/angular-research/angular-cli-fix   # 44129f66a3
pnpm bazel test //packages/angular/ssr/test:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=invokeGetPrerenderParams'
# 作業用の複製（git worktree add <scratchpad>/srt-wt-a 44129f66a3）で、ng-routes.ts の 79 行目に g を戻す
#   -const URL_PARAMETER_REGEXP = /(?<!\\):([^/]+)/;
#   +const URL_PARAMETER_REGEXP = /(?<!\\):([^/]+)/g;
bazelisk test //packages/angular/ssr/test:test --nocache_test_results --test_output=all
```

📄 `結果（a-bazel-filter2.log・a-revert-regex.log から）`

```
（--filter=invokeGetPrerenderParams）Ran 6 of 249 specs / 6 specs, 0 failures / PASSED in 0.4s
（79 行目に g を戻す。flaky=True なので 3 回走り、jasmine は毎回ちがう順）
Randomized with seed 61263 → 249 specs, 3 failures
  … fallback is Client ／ … nested redirects that are not explicitly defined. ／ … not include fallback routes … false
Randomized with seed 01309 → 249 specs, 3 failures
  … fallback is Server ／ … nested redirects that are not explicitly defined. ／ … fallback is Client
Randomized with seed 36955 → 249 specs, 3 failures
  … nested redirects that are not explicitly defined. ／ … fallback is Client ／ … not include fallback routes … false
//packages/angular/ssr/test:test                                         FAILED in 3 out of 3 in 1.1s
（seed 61263 の 1 件目の失敗）
    Expected $.length = 2 to equal 4.
    Expected $[1].route = '/user/*/role/*' to equal '/user/joe/role/admin'.
```

0fdcde5426 を戻しても、spec は落ちます。ただし落ちる it は jasmine の並べ替え（seed）で変わり、3 回の試行で 4 種類の it が入れ替わりました。1 つの it の中の判定は毎回同じでも、前の it が残した `lastIndex` で結果が変わるからです。2 節の記録と同じことが、spec の順番として出ています。走らせたあと作業用の複製は消しました。

### 直すとしたら

- 2 節の判定は、正規表現の状態に頼らない形がいちばん固い作りです。0fdcde5426 のあと、44129f66a3 で `URL_PARAMETER_REGEXP` を `test` する場所は handleSSGRoute の判定の 1 か所だけで、`replace` は handleSSGRoute の展開と 6 節の 550 行目の 2 か所、どちらも `URL_PARAMETER_GLOBAL_REGEXP` です。spec を足すなら、ng-routes\_spec.ts の 534 行目の it（invoke=false）と 185 行目の it（invoke=true）を、同じ it の中で続けて呼ぶ形が 2 節の記録と同じ並びになります。
- 3 節の「1 つの値が不正だと、その経路の残りの値と fallback が出ない」は、22.2.7 の 747〜762 行目が `for` の外側を `try` で包んでいるからです。値ごとに続けたいなら、`try` を `for` の中に入れることになります（bf1602a916 の spec は、エラーが 1 件出ることを確かめる形）。
- 相対のリダイレクトを 44129f66a3 の上で直す練習をするなら、6 節の 551 行目が b3bbada1ef の書き換えた行です。spec は ng-routes\_spec.ts の 470 行目の it の期待（`/some/*/deep/nested/…` の形）が、そのコミットで変わっています。

## 聞かれそうな質問

**Q. getPrerenderParams の中で inject() は使えますか？**

使えます。22.2.7 の 746 行目（44129f66a3 でも同じ形）で `runInInjectionContext(parentInjector, …)` の中で呼ぶからです。`parentInjector` は、そのルートを辿っている注入器（loadChildren の子なら読み込んだ側の注入器）です。記録の「:id が 1 つ」で `inject(ProductService)` が動いています。呼ばれるのはビルドの取り出し（invoke=true）のときだけです。

**Q. 値に / を含めて product/a/b のような URL を作れますか？**

44129f66a3 では 528 行目がそのまま差し込むので作れてしまいましたが、22.2.7（bf1602a916）では `:id` の値は 1 つの区切りでなければならず、793 行目の検査でエラーです。複数の区切りにしたいなら、経路を `docs/**` にして `**` の値に `guide/start` を返します（779 行目で区切りごとに検査）。

**Q. getPrerenderParams が 1 件だけ不正な値を返すと、どうなりますか？**

その経路の展開はそこで止まります。22.2.7 の 757〜761 行目でエラーを 1 件流して `return` するので、配列の残りの値も fallback の 1 件も出ません。ビルドは errors があるので失敗します。記録の値の表の、`/item/first` だけが残る行がそれです。

**Q. fallback: None にすると、作らなかった URL は 404 になりますか？**

ビルドの木では型が入らないので、ほかのサーバールート（`**` など）に当たらなければ照合されません。ただし invoke=false の取り出し（manifest に木が無いときのリクエスト）では、fallback の条件の 2 つ目「invoke が偽」で型が Server で入るので、サーバーで描かれます（5 節の表の右の列）。

**Q. path: 'old/page', redirectTo: 'new/page' のサーバーのリダイレクト先はどこですか？**

44129f66a3 では 551 行目が最後の区切りだけを捨てるので `/old/new/page`、22.2.7 では b3bbada1ef で親の経路（ここでは空）とつなぐので `/new/page` です。Router は後者です。記録の「redirectTo」で両方を並べています。

## 読み終えて

- handleSSGRoute は、関数を metadata から外し、`:param` と `**` の有無を見て、invoke が真のときだけ `getPrerenderParams` を親の注入器の中で呼ぶ。
- 0fdcde5426 は判定用の正規表現から g を外した。g があると、invoke=false の取り出しや 2 回目の取り出しで、関数が呼ばれない・型が Prerender になる。
- 値は区切りごとに差し込む。22.2.7 は bf1602a916 の `isPathSegment` で `/`・`..`・空文字などを拒む。1 つ不正なら、その経路の残りと fallback は出ない。
- fallback の 1 件は Client なら Client、それ以外は Server。None でも invoke=false なら出る。
- 相対のリダイレクトは、44129f66a3 では最後の区切りだけを替え、22.2.7 では Router と同じく親の経路から解く。行き先の `:id` は `*N`（位置）か展開した値で書かれる。

---

← 前: [ルートを取り出す：サーバーで Router を起動して設定をたどる](01-srt-extract.md)  
次: [ルートの木：RouteTree の insert と match、serverRoutes の木](03-srt-route-tree.md) →
