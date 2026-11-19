[目次](../README.md) › [Router の読み残し：UrlTree と RouterState の小道具・provideRouter の残り・Router クラス・読み込みとガードを行で埋める](README.md) › 第 1 回 / 全 6 回

# UrlTree・UrlSegment・ParamMap：URL の木の公開 API と、木の小道具

> url\_tree.ts の未読の行（queryParamMap と parameterMap のキャッシュ、UrlSegmentGroup の numberOfChildren と toString、equalSegments・equalPath・mapChildrenIntoArray、UrlSerializer と DefaultUrlSerializer の宣言）、shared.ts の Params・ParamMap・ParamsAsMap・convertToParamMap と defaultUrlMatcher の入口、utils/tree.ts の Tree の残りのメソッドと findNode / findPath。括弧の中の primary の「:」が往復で outlet に化ける不具合（8576f161ae4）と、それを直したコミットも。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-url-tree)

---

URL の文字列が木（`UrlTree`）になる手順は[UrlTree と UrlParser](../router/02-router-url-tree.md)で 1 文字ずつ読みました。この章はその木の**公開 API の小さな部品**を埋めます。`queryParamMap` と `parameterMap` が何を返し、いつ作られ、どこで古くなるか。`numberOfChildren` と `toString` が何を数え、何を文字列にするか。木を比べる `equalSegments`・`equalPath` と、子を並べる `mapChildrenIntoArray`。そして `ParamMap` の実体 `ParamsAsMap`、既定のマッチャ `defaultUrlMatcher` の入口、`Tree` の残りのメソッドです。

読む対象は `packages/router/src/url_tree.ts`・`shared.ts`・`utils/tree.ts` の、これまでの章が引いていない行と、それを固める `packages/router/test/shared.spec.ts`・`utils/tree.spec.ts`・`url_serializer.spec.ts` です（../angular、8576f161ae4）。ページのデモはこのサイトの依存の `@angular/router` 22.2.6 を直接呼びます。22.2.6 には 8576f161ae4 より後の修正が入っていて、そのうち 1 つ（3 節）はこの章の行に当たります。

1. **1. UrlTree・UrlSegment・ParamMap**（この章）
2. [2. ActivatedRoute の Observable と継承](02-rtl-router-state.md)
3. [3. provideRouter と RouterModule の残り](03-rtl-provide-router.md)
4. [4. Router クラスと Navigation の型](04-rtl-router-class.md)
5. [5. 読み込み・事前読み込み・再利用・関数ガード](05-rtl-load-guard.md)
6. [6. spec と issue](06-rtl-tests-issues.md)

## 1. UrlTree.queryParamMap は 1 回だけ作って持ち続ける

📄 `angular/packages/router/src/url_tree.ts` L300–306 （▶ の行: 302–304）

```ts
300 │   }
301 │ 
302 ▶   get queryParamMap(): ParamMap {
303 ▶     this._queryParamMap ??= convertToParamMap(this.queryParams);
304 ▶     return this._queryParamMap;
305 │   }
306 │ 
```

302 行目の getter は、303 行目の `??=`（左が `null` か `undefined` のときだけ右を代入する演算子）で、初めて読まれたときにだけ `convertToParamMap(this.queryParams)` を呼び、`_queryParamMap` に入れます。2 回目からは 304 行目で同じオブジェクトを返します。つまり `tree.queryParamMap === tree.queryParamMap` は `true` です。

この形は `ParamMap` を入れたコミット a755b715ed5（2017-03-17、`feat(router): introduce ParamMap to access parameters`）からあり、`??=` になったのは f80fabbf27a（2024-01-15、#53930 の書き換え）です。キャッシュ（一度作った値を覚えておくこと）なので、**`tree.queryParams` に別のオブジェクトを代入しても `queryParamMap` は前のまま**です。手元の Node で `parse('/a?x=1')` の `queryParamMap` を一度読み、`queryParams = {x: '2'}` と代入すると、`queryParamMap.get('x')` は `'1'`、`toString()` は `/a?x=2` でした。逆に、元のオブジェクトの中身を書き換えると（`queryParams.x = '3'`）`get('x')` は `'3'` になります。理由は 5 節の 79 行目です。

📄 `angular/packages/router/src/url_tree.ts` L307–321 （▶ の行: 308–309）

```ts
307 │   /** @docs-private */
308 ▶   toString(): string {
309 ▶     return DEFAULT_SERIALIZER.serialize(this);
310 │   }
311 │ }
312 │ 
313 │ /**
314 │  * @description
315 │  *
316 │  * Represents the parsed URL segment group.
317 │  *
318 │  * See `UrlTree` for more information.
319 │  *
320 │  * @publicApi
321 │  */
```

308〜309 行目の `toString` は、モジュールに 1 つだけ作ってある `DefaultUrlSerializer`（`DEFAULT_SERIALIZER`）で自分を文字列にします。呼ぶたびに作らないのは 0c36f2353dd（2017-03-29、#15565 の `perf(router): don't create new serializer every time UrlTree.toString is called`）からです。アプリで `UrlSerializer` を差し替えていても（4 節）、`tree.toString()` は既定の形で書きます。差し替えた方で書くのは `router.serializeUrl(tree)` です。

## 2. UrlSegmentGroup：数えるのは子の outlet、文字にするのは自分の segments だけ

📄 `angular/packages/router/src/url_tree.ts` L336–342 （▶ の行: 336–337, 341–342）

```ts
336 ▶   hasChildren(): boolean {
337 ▶     return this.numberOfChildren > 0;
338 │   }
339 │ 
340 │   /** Number of child segments */
341 ▶   get numberOfChildren(): number {
342 ▶     return Object.keys(this.children).length;
```

341〜342 行目の `numberOfChildren` は `Object.keys(this.children).length`、つまり**子の outlet の数**です。segments の数ではありません。336〜337 行目の `hasChildren()` はそれが 0 より大きいかを返すだけです。呼ぶ側は多く、`serializeSegment`（url\_tree.ts）、`defaultUrlMatcher` の `pathMatch: 'full'` の判定（6 節）、`recognize.ts`・`config_matching.ts`・`apply_redirects.ts`・`create_url_tree.ts` が「この先にまだ子のグループがあるか」をこれで見ます。

📄 `angular/packages/router/src/url_tree.ts` L343–376 （▶ の行: 346–347, 366, 369–370）

````ts
343 │   }
344 │ 
345 │   /** @docs-private */
346 ▶   toString(): string {
347 ▶     return serializePaths(this);
348 │   }
349 │ }
350 │ 
351 │ /**
352 │  * @description
353 │  *
354 │  * Represents a single URL segment.
355 │  *
356 │  * A UrlSegment is a part of a URL between the two slashes. It contains a path and the matrix
357 │  * parameters associated with the segment.
358 │  *
359 │  * @usageNotes
360 │  * ### Example
361 │  *
362 │  * ```ts
363 │  * @Component({templateUrl:'template.html'})
364 │  * class MyComponent {
365 │  *   constructor(router: Router) {
366 ▶  *     const tree: UrlTree = router.parseUrl('/team;id=33');
367 │  *     const g: UrlSegmentGroup = tree.root.children[PRIMARY_OUTLET];
368 │  *     const s: UrlSegment[] = g.segments;
369 ▶  *     s[0].path; // returns 'team'
370 ▶  *     s[0].parameters; // returns {id: 33}
371 │  *   }
372 │  * }
373 │  * ```
374 │  *
375 │  * @publicApi
376 │  */
````

346〜347 行目、`UrlSegmentGroup.toString()` は `serializePaths(this)` で、**自分の segments を `/` でつなぐだけ**です。子は書きません。デモの最初の URL では、根の `toString()` は `""`（根は segments を持たない）、primary の子は `"team;id=34/user;a=1"` になり、括弧の中の `aux`・`side` は出てきません。URL 全体が欲しいときは `UrlTree` の方の `toString()` です。

366〜370 行目は `UrlSegment` の doc コメントの例です。370 行目は `s[0].parameters` が `{id: 33}`（数）を返すと書いていますが、`parse('/team;id=33')` の `parameters.id` は文字列 `'33'` です（手元の Node で `typeof` が `'string'`）。パーサはマトリクスパラメータ（`;k=v` の形の、セグメントに付くパラメータ）を必ず `decode` した文字列で入れます（[UrlTree と UrlParser](../router/02-router-url-tree.md)の 6 節）。

## 3. UrlSegment.parameterMap と、木を比べる・並べる関数

📄 `angular/packages/router/src/url_tree.ts` L387–393 （▶ の行: 389–391）

```ts
387 │   ) {}
388 │ 
389 ▶   get parameterMap(): ParamMap {
390 ▶     this._parameterMap ??= convertToParamMap(this.parameters);
391 ▶     return this._parameterMap;
392 │   }
393 │ 
```

389〜391 行目は 1 節と同じ形です。`_parameterMap` に 1 回だけ作ります。マトリクスパラメータは同じ名前を 2 回書くと後の値で上書きされる（`;id=33;id=34` は `{id: '34'}`）ので、`parameterMap.getAll('id')` は `['34']` の 1 個だけです。クエリ（`?tag=a&tag=b`）は配列になり、`getAll` で 2 個取れます。この違いはパーサの側で決まっています。

📄 `angular/packages/router/src/url_tree.ts` L394–425 （▶ の行: 395–396, 400–401, 404–406, 414–416, 419–421）

```ts
394 │   /** @docs-private */
395 ▶   toString(): string {
396 ▶     return serializePath(this);
397 │   }
398 │ }
399 │ 
400 ▶ export function equalSegments(as: UrlSegment[], bs: UrlSegment[]): boolean {
401 ▶   return equalPath(as, bs) && as.every((a, i) => shallowEqual(a.parameters, bs[i].parameters));
402 │ }
403 │ 
404 ▶ export function equalPath(as: UrlSegment[], bs: UrlSegment[]): boolean {
405 ▶   if (as.length !== bs.length) return false;
406 ▶   return as.every((a, i) => a.path === bs[i].path);
407 │ }
408 │ 
409 │ export function mapChildrenIntoArray<T>(
410 │   segment: UrlSegmentGroup,
411 │   fn: (v: UrlSegmentGroup, k: string) => T[],
412 │ ): T[] {
413 │   let res: T[] = [];
414 ▶   Object.entries(segment.children).forEach(([childOutlet, child]) => {
415 ▶     if (childOutlet === PRIMARY_OUTLET) {
416 ▶       res = res.concat(fn(child, childOutlet));
417 │     }
418 │   });
419 ▶   Object.entries(segment.children).forEach(([childOutlet, child]) => {
420 ▶     if (childOutlet !== PRIMARY_OUTLET) {
421 ▶       res = res.concat(fn(child, childOutlet));
422 │     }
423 │   });
424 │   return res;
425 │ }
```

1. **equalPath（404〜407 行目）**

   405 行目で長さを比べ、406 行目で `path` だけを順に比べます。マトリクスパラメータは見ません。`isActive` の `paths` の比較（[RouterLinkActive](../router/18-router-link-active.md)）と、ガードを走らせるかの判定 `runGuardsAndResolvers: 'pathParamsChange'`（[ガード](../router/12-router-guards.md)）がこれを使います。
2. **equalSegments（400〜402 行目）**

   401 行目、`equalPath` に加えて、各セグメントの `parameters` を `shallowEqual`（1 段だけ中身を比べる）で比べます。router\_state.ts の `equalParamsAndUrlSegments`（[次回](02-rtl-router-state.md)）が既定の `'paramsChange'` の判定にこれを使います。
3. **mapChildrenIntoArray（409〜425 行目）**

   子を 2 回なめます。414〜418 行目は `PRIMARY_OUTLET`（`'primary'`）だけ、419〜423 行目はそれ以外です。だから primary が必ず先頭に来ます。呼ぶのは `serializeSegment` の「根以外」の枝だけです（[UrlTree と UrlParser](../router/02-router-url-tree.md)の 10 節）。

なぜ 2 回なめるのかは、`children` のキーの順を見ると分かります。デモの最初の URL を parse すると、根の `Object.keys(children)` は `["aux", "side", "primary"]` です。パーサは括弧の中を先に `children` に入れ、primary を後で足すからです。`Object.keys` の順のまま書くと primary が後ろに回るので、並べ直してから書きます。

この「括弧の中に primary と名前付きが並ぶ」ところで、8576f161ae4 の serialize は往復で木が変わります。primary の子の最初のセグメントに `:` があると、括弧の中の `admin:y` がパーサには「outlet 名 `admin`、パス `y`」に見えるからです。下は、8576f161ae4 の url\_tree.ts と shared.ts（と依存の 3 ファイル）を git show で取り出し、TypeScript を JS にして Node で動かした記録です。

📄 `記録のスクリプト（old-src-record.mjs）`

```
// 8576f161ae4 の url_tree.ts・shared.ts（と依存の 3 ファイル）を git show で取り出し、TypeScript で JS にして Node で動かす。
// 使い方: node old-src-record.mjs <angular のディレクトリ> <angular-deep-dive のディレクトリ>
import {execFileSync} from 'node:child_process';
import {mkdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const [ng, site] = process.argv.slice(2);
const req = createRequire(join(site, 'package.json'));
const ts = req('typescript');
const tmp = join(dirname(fileURLToPath(import.meta.url)), 'tmp-old-src');
rmSync(tmp, {recursive: true, force: true});
mkdirSync(join(tmp, 'utils'), {recursive: true});
symlinkSync(join(site, 'node_modules'), join(tmp, 'node_modules'), 'dir');
writeFileSync(join(tmp, 'package.json'), '{"type": "module"}');
for (const f of ['url_tree', 'shared', 'errors', 'utils/collection', 'utils/first_value_from']) {
  const src = execFileSync('git', ['-C', ng, 'show', `8576f161ae4:packages/router/src/${f}.ts`], {encoding: 'utf8'});
  let out = ts.transpileModule(src, {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, experimentalDecorators: true},
  }).outputText;
  out = out.replace(/from '(\.\.?\/[^']+)'/g, "from '$1.js'");
  writeFileSync(join(tmp, f + '.js'), out);
}
await import(pathToFileURL(req.resolve('@angular/compiler')).href);
const {DefaultUrlSerializer, UrlTree, UrlSegmentGroup, UrlSegment} = await import(pathToFileURL(join(tmp, 'url_tree.js')).href);
const s = new DefaultUrlSerializer();
const tree = new UrlTree(
  new UrlSegmentGroup([], {
    primary: new UrlSegmentGroup([new UrlSegment('x', {})], {
      primary: new UrlSegmentGroup([new UrlSegment('admin:y', {})], {}),
      aux: new UrlSegmentGroup([new UrlSegment('z', {})], {}),
    }),
  }),
);
const once = s.serialize(tree);
const again = s.parse(once);
console.log(JSON.stringify({
  source: '8576f161ae4',
  serialize: once,
  reparsedOutlets: Object.keys(again.root.children.primary.children),
  reserialize: s.serialize(again),
}, null, 2));
rmSync(tmp, {recursive: true, force: true});

```

📄 `出力（8576f161ae4 の DefaultUrlSerializer）`

```
{
  "source": "8576f161ae4",
  "serialize": "/x/(admin:y//aux:z)",
  "reparsedOutlets": [
    "admin",
    "aux"
  ],
  "reserialize": "/x/(admin:y//aux:z)"
}
```

`new UrlSegment('admin:y', {})` を primary に、`aux` を隣に置いた木は `/x/(admin:y//aux:z)` になり、それを parse すると outlet は `admin` と `aux` の 2 つになりました。もとの木にあった primary の子が消えています。`encodeUriString` は `:` を戻す（`%3A` を `:` にする）ので、パスの中の `:` はそのまま出ます（[UrlTree と UrlParser](../router/02-router-url-tree.md)の 11 節）。直したのは次のコミットで、パッチの枝には 12b553bc282 として入り、v22.2.4 から含まれます。このページのデモ（22.2.6）でプリセットの `/x/(admin%3Ay//aux:z)` を押すと、serialize は `%3A` を残し、往復しても同じ文字列になります。

📄 `直したコミット（url_tree.ts の部分）`

```
$ git show 011675e417d -- packages/router/src/url_tree.ts   # 2026-10-20、fix(router): escape colons in parenthesized primary child segments
--- a/packages/router/src/url_tree.ts
+++ b/packages/router/src/url_tree.ts
@@ -540,23 +540,33 @@ function serializeSegment(segment: UrlSegmentGroup, root: boolean): string {
 
     return children.length > 0 ? `${primary}(${children.join('//')})` : primary;
   } else {
+    // use no parenthesis if the only child is a primary outlet route
+    if (Object.keys(segment.children).length === 1 && segment.children[PRIMARY_OUTLET] != null) {
+      return `${serializePaths(segment)}/${serializeSegment(segment.children[PRIMARY_OUTLET], false)}`;
+    }
+
     const children = mapChildrenIntoArray(segment, (v: UrlSegmentGroup, k: string) => {
       if (k === PRIMARY_OUTLET) {
-        return [serializeSegment(segment.children[PRIMARY_OUTLET], false)];
+        return [escapeOutletDelimiter(serializeSegment(segment.children[PRIMARY_OUTLET], false))];
       }
 
       return [`${k}:${serializeSegment(v, false)}`];
     });
 
-    // use no parenthesis if the only child is a primary outlet route
-    if (Object.keys(segment.children).length === 1 && segment.children[PRIMARY_OUTLET] != null) {
-      return `${serializePaths(segment)}/${children[0]}`;
-    }
-
     return `${serializePaths(segment)}/(${children.join('//')})`;
   }
 }
 
+/**
+ * Inside a parenthesized group, the parser distinguishes a named outlet (`name:path`) from the
+ * unprefixed primary child by looking for a `:` in the first segment token. A primary child whose
+ * first segment legitimately contains a colon (e.g. a param value `admin:y`) would therefore be
+ * misparsed as outlet `admin` on round-trip. Percent-encode colons in that leading token only.
+ */
+function escapeOutletDelimiter(serializedPrimary: string): string {
+  return serializedPrimary.replace(SEGMENT_RE, (firstSegment) => firstSegment.replace(/:/g, '%3A'));
+}
+
 /**
  * Encodes a URI string with the default encoding. This function will only ever be called from
  * `encodeUriQuery` or `encodeUriSegment` as it's the base set of encodings to be used. We need
```

直し方は 2 つです。1 つ目は「primary の子が 1 つだけのとき括弧を付けない」判定を `mapChildrenIntoArray` の前に移し、括弧が付かない場合は `:` を残すこと。2 つ目は、括弧の中の primary の**最初のセグメントだけ**、`SEGMENT_RE` で取り出して `:` を `%3A` にすることです。spec は url\_serializer.spec.ts に `describe('colon in non-root primary segment with sibling named outlet')` として足され、regression\_integration.spec.ts にも Router を通した it が足されています。

## 4. UrlSerializer と DefaultUrlSerializer の宣言

📄 `angular/packages/router/src/url_tree.ts` L427–445 （▶ の行: 432–433, 439–440, 442, 445）

```ts
427 │ /**
428 │  * @description
429 │  *
430 │  * Serializes and deserializes a URL string into a URL tree.
431 │  *
432 ▶  * The url serialization strategy is customizable. You can
433 ▶  * make all URLs case insensitive by providing a custom UrlSerializer.
434 │  *
435 │  * See `DefaultUrlSerializer` for an example of a URL serializer.
436 │  *
437 │  * @publicApi
438 │  */
439 ▶ @Service({factory: () => new DefaultUrlSerializer()})
440 ▶ export abstract class UrlSerializer {
441 │   /** Parse a url into a `UrlTree` */
442 ▶   abstract parse(url: string): UrlTree;
443 │ 
444 │   /** Converts a `UrlTree` into a url */
445 ▶   abstract serialize(tree: UrlTree): string;
```

432〜433 行目、doc コメントは「URL の扱いは差し替えられる。たとえば大文字小文字を区別しない `UrlSerializer` を provide できる」と書いています。440 行目の抽象クラスが求めるのは 442 行目の `parse` と 445 行目の `serialize` の 2 つだけです。439 行目の `@Service({factory: () => new DefaultUrlSerializer()})` が、何も provide しないときの既定を決めます（`@Service` の仕組みは[provideRouter の中身](../router/05-router-provide-router.md)の 3 節）。この行は a7dab601faf（2026-05-01、`refactor(core): use the @Service decorator where possible`）で `@Injectable` から変わりました。

📄 `angular/packages/router/src/url_tree.ts` L446–470 （▶ の行: 456–457, 460–462, 468–470）

````ts
446 │ }
447 │ 
448 │ /**
449 │  * @description
450 │  *
451 │  * A default implementation of the `UrlSerializer`.
452 │  *
453 │  * Example URLs:
454 │  *
455 │  * ```
456 ▶  * /inbox/33(popup:compose)
457 ▶  * /inbox/33;open=true/messages/44
458 │  * ```
459 │  *
460 ▶  * DefaultUrlSerializer uses parentheses to serialize secondary segments (e.g., popup:compose), the
461 ▶  * colon syntax to specify the outlet, and the ';parameter=value' syntax (e.g., open=true) to
462 ▶  * specify route specific parameters.
463 │  *
464 │  * @publicApi
465 │  */
466 │ export class DefaultUrlSerializer implements UrlSerializer {
467 │   /** Parses a url into a `UrlTree` */
468 ▶   parse(url: string): UrlTree {
469 ▶     const p = new UrlParser(url);
470 ▶     return new UrlTree(p.parseRootSegment(), p.parseQueryParams(), p.parseFragment());
````

456〜457 行目の例 `/inbox/33(popup:compose)` と `/inbox/33;open=true/messages/44` は、460〜462 行目が言う 3 つの書き方（括弧、`outlet:`、`;parameter=value`）をそれぞれ使っています。468〜470 行目の `parse` は `UrlParser` を 1 つ作り、根・クエリ・フラグメントの順に読みます（中身は[UrlTree と UrlParser](../router/02-router-url-tree.md)の 2〜8 節）。

## 5. Params と ParamMap：型の約束と、ParamsAsMap の実際

📄 `angular/packages/router/src/shared.ts` L26–46 （▶ の行: 33–35, 40–41）

```ts
26 │ /**
27 │  * A collection of matrix and query URL parameters.
28 │  * @see {@link convertToParamMap}
29 │  * @see {@link ParamMap}
30 │  *
31 │  * @publicApi
32 │  */
33 ▶ export type Params = {
34 ▶   [key: string]: any;
35 ▶ };
36 │ 
37 │ /**
38 │  * A map that provides access to the required and optional parameters
39 │  * specific to a route.
40 ▶  * The map supports retrieving a single value with `get()`
41 ▶  * or multiple values with `getAll()`.
42 │  *
43 │  * @see [URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)
44 │  *
45 │  * @publicApi
46 │  */
```

33〜35 行目、`Params` は `{[key: string]: any}` です。値の型は決まっていません。URL から作られるときは文字列か文字列の配列ですが、`router.navigate([...], {queryParams: {n: 33}})` のように数を渡すこともできます。

📄 `angular/packages/router/src/shared.ts` L47–73 （▶ の行: 53, 57–59, 61, 65–66, 69, 72）

```ts
47 │ export interface ParamMap {
48 │   /**
49 │    * Reports whether the map contains a given parameter.
50 │    * @param name The parameter name.
51 │    * @returns True if the map contains the given parameter, false otherwise.
52 │    */
53 ▶   has(name: string): boolean;
54 │   /**
55 │    * Retrieves a single value for a parameter.
56 │    * @param name The parameter name.
57 ▶    * @return The parameter's single value,
58 ▶    * or the first value if the parameter has multiple values,
59 ▶    * or `null` when there is no such parameter.
60 │    */
61 ▶   get(name: string): string | null;
62 │   /**
63 │    * Retrieves multiple values for a parameter.
64 │    * @param name The parameter name.
65 ▶    * @return An array containing one or more values,
66 ▶    * or an empty array if there is no such parameter.
67 │    *
68 │    */
69 ▶   getAll(name: string): string[];
70 │ 
71 │   /** Names of the parameters in the map. */
72 ▶   readonly keys: string[];
73 │ }
```

61 行目の `get` は `string | null` を返すと型で約束し、57〜59 行目は「1 つの値か、複数なら最初の値か、無ければ `null`」と書きます。69 行目の `getAll` は 65〜66 行目で「1 つ以上の値の配列、無ければ空の配列」です。

📄 `angular/packages/router/src/shared.ts` L75–107 （▶ の行: 79, 83, 87–89, 92, 96, 98, 101, 105）

```ts
 75 │ class ParamsAsMap implements ParamMap {
 76 │   private params: Params;
 77 │ 
 78 │   constructor(params: Params) {
 79 ▶     this.params = params || {};
 80 │   }
 81 │ 
 82 │   has(name: string): boolean {
 83 ▶     return Object.hasOwn(this.params, name);
 84 │   }
 85 │ 
 86 │   get(name: string): string | null {
 87 ▶     if (this.has(name)) {
 88 ▶       const v = this.params[name];
 89 ▶       return Array.isArray(v) ? v[0] : v;
 90 │     }
 91 │ 
 92 ▶     return null;
 93 │   }
 94 │ 
 95 │   getAll(name: string): string[] {
 96 ▶     if (this.has(name)) {
 97 │       const v = this.params[name];
 98 ▶       return Array.isArray(v) ? v : [v];
 99 │     }
100 │ 
101 ▶     return [];
102 │   }
103 │ 
104 │   get keys(): string[] {
105 ▶     return Object.keys(this.params);
106 │   }
107 │ }
```

1. **79 行目：コピーしない**

   渡されたオブジェクトをそのまま持ちます。`null` や `undefined` なら `{}` です。だから元のオブジェクトの中身を書き換えると、作ったあとの `ParamMap` にも見えます（1 節）。
2. **83 行目：has は自分のプロパティだけ**

   `Object.hasOwn` なので、`has('toString')` は `false` です。もとは `this.params.hasOwnProperty(name)` で、`Object.create(null)` で作ったオブジェクト（`hasOwnProperty` を持たない）を渡すと例外になりました。2170ea270ac（2019-07-16、#31599）で `Object.prototype.hasOwnProperty.call` にし、732e5050180（2026-08-18）で `Object.hasOwn` になりました。
3. **86〜92 行目：get**

   89 行目、配列なら `v[0]`、そうでなければ `v` をそのまま返します。型（61 行目）は `string | null` ですが、中身は確かめません。値が `33` なら数の `33`、空の配列なら `undefined`、値が `undefined` なら `undefined` です（デモの下の表）。`null` になるのは 92 行目、キーが無いときだけです。
4. **95〜101 行目：getAll**

   98 行目、配列ならその配列（コピーではない）、そうでなければ 1 個の配列に包みます。キーが無ければ 101 行目で空の配列です。
5. **104〜106 行目：keys**

   `Object.keys` を毎回計算します。

📄 `angular/packages/router/src/shared.ts` L108–119 （▶ の行: 116–117）

```ts
108 │ 
109 │ /**
110 │  * Converts a `Params` instance to a `ParamMap`.
111 │  * @param params The instance to convert.
112 │  * @returns The new map instance.
113 │  *
114 │  * @publicApi
115 │  */
116 ▶ export function convertToParamMap(params: Params): ParamMap {
117 ▶   return new ParamsAsMap(params);
118 │ }
119 │ 
```

116〜117 行目、`convertToParamMap` は呼ぶたびに新しい `ParamsAsMap` を作るだけです。キャッシュは呼ぶ側（1 節の 303 行目、3 節の 390 行目）が持ちます。`ActivatedRoute.paramMap` の Observable は、値が流れるたびにこれを呼ぶので、毎回別のオブジェクトになります（[次回](02-rtl-router-state.md)）。

## 6. defaultUrlMatcher の入口

📄 `angular/packages/router/src/shared.ts` L137–159 （▶ の行: 141, 151, 153–159）

```ts
137 │ 
138 │ /**
139 │  * Matches the route configuration (`route`) against the actual URL (`segments`).
140 │  *
141 ▶  * When no matcher is defined on a `Route`, this is the matcher used by the Router by default.
142 │  *
143 │  * @param segments The remaining unmatched segments in the current navigation
144 │  * @param segmentGroup The current segment group being matched
145 │  * @param route The `Route` to match against.
146 │  *
147 │  * @see {@link UrlMatchResult}
148 │  * @see {@link Route}
149 │  *
150 │  * @returns The resulting match information or `null` if the `route` should not match.
151 ▶  * @publicApi
152 │  */
153 ▶ export function defaultUrlMatcher(
154 ▶   segments: UrlSegment[],
155 ▶   segmentGroup: UrlSegmentGroup,
156 ▶   route: Route,
157 ▶ ): UrlMatchResult | null {
158 ▶   const parts = route.path!.split('/');
159 ▶   const wildcardIndex = parts.indexOf('**');
```

141 行目、`Route` に `matcher` が無いときに使われるのがこの関数です。`@publicApi`（151 行目）なので、自分の `matcher` の中から呼んで、既定の動きに少し足すこともできます。153〜157 行目の引数は、まだ消費していない `segments`、今のグループ `segmentGroup`、照合する `route` の 3 つです。158 行目で `route.path` を `/` で割り、159 行目で `'**'` を探します。その先（片数の比較、`pathMatch: 'full'` で `segmentGroup.hasChildren()` を見ること、`':id'` を `posParams` に入れること）は[recognize](../router/09-router-recognize.md)の 7 節が行で読んでいます。

デモで `/team/33/user` に `path: 'team/:id'` を当てると、`'prefix'` では `consumed: ['team', '33']`、`posParams: {id: '33'}`、`'full'` では残りの `user` があるので `null` です。`/team/33(aux:x)` に `'full'` を当てると一致します。`aux` は根の子で、primary のグループには子が無い（`hasChildren()` が `false`）からです。

## 7. utils/tree.ts の残り：firstChild・siblings・pathFromRoot と 2 つの探索

📄 `angular/packages/router/src/utils/tree.ts` L36–62 （▶ の行: 40–42, 48–50, 52–53, 59–60）

```ts
36 │ 
37 │   /**
38 │    * @internal
39 │    */
40 ▶   firstChild(t: T): T | null {
41 ▶     const n = findNode(t, this._root);
42 ▶     return n && n.children.length > 0 ? n.children[0].value : null;
43 │   }
44 │ 
45 │   /**
46 │    * @internal
47 │    */
48 ▶   siblings(t: T): T[] {
49 ▶     const p = findPath(t, this._root);
50 ▶     if (p.length < 2) return [];
51 │ 
52 ▶     const c = p[p.length - 2].children.map((c) => c.value);
53 ▶     return c.filter((cc) => cc !== t);
54 │   }
55 │ 
56 │   /**
57 │    * @internal
58 │    */
59 ▶   pathFromRoot(t: T): T[] {
60 ▶     return findPath(t, this._root).map((s) => s.value);
61 │   }
62 │ }
```

📄 `angular/packages/router/src/utils/tree.ts` L63–90 （▶ の行: 65–66, 68–70, 77–78, 80–81, 83–84, 88）

```ts
63 │ 
64 │ // DFS for the node matching the value
65 ▶ function findNode<T>(value: T, node: TreeNode<T>): TreeNode<T> | null {
66 ▶   if (value === node.value) return node;
67 │ 
68 ▶   for (const child of node.children) {
69 ▶     const node = findNode(value, child);
70 ▶     if (node) return node;
71 │   }
72 │ 
73 │   return null;
74 │ }
75 │ 
76 │ // Return the path to the node with the given value using DFS
77 ▶ function findPath<T>(value: T, node: TreeNode<T>): TreeNode<T>[] {
78 ▶   if (value === node.value) return [node];
79 │ 
80 ▶   for (const child of node.children) {
81 ▶     const path = findPath(value, child);
82 │     if (path.length) {
83 ▶       path.unshift(node);
84 ▶       return path;
85 │     }
86 │   }
87 │ 
88 ▶   return [];
89 │ }
90 │ 
```

`Tree` は `RouterState` と `RouterStateSnapshot` の親クラスです（`root`・`parent`・`children` は[2 つの木](../router/14-router-router-state.md)の 1 節）。41 行目の `firstChild` は `findNode` で自分のノードを探し、42 行目で最初の子の値を返します。59〜60 行目の `pathFromRoot` は `findPath` の結果からノードの値だけを取り出します。

探索はどちらも根からの深さ優先（DFS）で、66 行目と 78 行目の `value === node.value` という**同じオブジェクトか**で止まります。`findPath` は見つけたところから戻りながら、83 行目の `unshift` で親を前に足していきます。ノードは親を覚えていないので、`ActivatedRoute.parent` を読むたびに根からこの探索が走ります。

48〜54 行目の `siblings`（同じ親を持つ兄弟）は `@internal` で、packages/router/src の中に呼ぶ所がありません（grep で `.siblings(` は 0 件）。使っているのは utils/tree.spec.ts の 47〜48 行目だけです。

## 8. 動かして確かめる

> **🧪 DEMO — DefaultUrlSerializer・ParamMap・defaultUrlMatcher を直接呼ぶ**
>
> 入力した URL を `new DefaultUrlSerializer()` の `parse` にかけ、できた木の `UrlSegmentGroup` を根から並べます。続けて、各セグメントの `parameterMap` と `UrlTree.queryParamMap` の `get`・`getAll`・`has` を表にし、`serialize` で戻した文字列と入力を比べます。Router は作らないので、このページの URL と履歴は変わりません。読み込むのはボタンを押したときです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-url-tree)

> [!NOTE]
> **ポイント**
>
> 最初のプリセットでは、serialize した文字列は入力と違います。`;id=33;id=34` は `;id=34` に（3 節）、値の無いクエリ `q` は `q=` になります（url\_serializer.spec.ts の 211 行目が固めている形）。それでも 2 回目からは同じ文字列に落ち着きます。`/a(b` は閉じ括弧が無いので、`parse` が例外を投げます。開発モードでは `NG04010: Cannot parse url '/a(b'`（手元の Node）、本番ビルドのこのページでは文言が落ちて `NG04010` だけです。

## テストと直し方

### spec と it

| ファイル（packages/router/test/ から） | describe › it（行） | 固めているもの |
| --- | --- | --- |
| `shared.spec.ts` | `ParamsMap`（11）› 12・19・24・30・36・41・46 の 7 本 | 5 節の `has`・`keys`・`get`・`getAll` と `Object.create(null)` |
| `utils/tree.spec.ts` | `tree`（11）› 12〜51 の 7 本 | 7 節の `Tree` のメソッド（`siblings` を含む） |
| `url_serializer.spec.ts` | `url serializer`（19）› 76・85（`numberOfChildren`）、209・214（クエリ）など 52 本 | 2 節の数え方、1 節の `queryParamMap` |
| `url_tree.spec.ts` | `UrlTree`（19）› `DefaultUrlSerializer`（22）・`containsTree`（73）など 55 本 | 3 節の `equalPath` を通る `containsTree` / `isActive` |

📄 `angular/packages/router/test/shared.spec.ts` L11–34 （▶ の行: 13, 21, 27, 33）

```ts
11 │ describe('ParamsMap', () => {
12 │   it('should returns whether a parameter is present', () => {
13 ▶     const map = convertToParamMap({single: 's', multiple: ['m1', 'm2']});
14 │     expect(map.has('single')).toEqual(true);
15 │     expect(map.has('multiple')).toEqual(true);
16 │     expect(map.has('not here')).toEqual(false);
17 │   });
18 │ 
19 │   it('should returns the name of the parameters', () => {
20 │     const map = convertToParamMap({single: 's', multiple: ['m1', 'm2']});
21 ▶     expect(map.keys).toEqual(['single', 'multiple']);
22 │   });
23 │ 
24 │   it('should support single valued parameters', () => {
25 │     const map = convertToParamMap({single: 's', multiple: ['m1', 'm2']});
26 │     expect(map.get('single')).toEqual('s');
27 ▶     expect(map.get('multiple')).toEqual('m1');
28 │   });
29 │ 
30 │   it('should support multiple valued parameters', () => {
31 │     const map = convertToParamMap({single: 's', multiple: ['m1', 'm2']});
32 │     expect(map.getAll('single')).toEqual(['s']);
33 ▶     expect(map.getAll('multiple')).toEqual(['m1', 'm2']);
34 │   });
```

📄 `angular/packages/router/test/shared.spec.ts` L35–54 （▶ の行: 38, 43, 47, 51–52）

```ts
35 │ 
36 │   it('should return `null` when a single valued element is absent', () => {
37 │     const map = convertToParamMap({});
38 ▶     expect(map.get('name')).toEqual(null);
39 │   });
40 │ 
41 │   it('should return `[]` when a multiple valued element is absent', () => {
42 │     const map = convertToParamMap({});
43 ▶     expect(map.getAll('name')).toEqual([]);
44 │   });
45 │ 
46 │   it('should not error when trying to call ParamMap.get function using an object created with Object.create() function', () => {
47 ▶     const objectToMap: Params = Object.create(null);
48 │     objectToMap['single'] = 's';
49 │     objectToMap['multiple'] = ['m1', 'm2'];
50 │     const paramMaps: ParamMap = convertToParamMap(objectToMap);
51 ▶     expect(() => paramMaps.get('single')).not.toThrow();
52 ▶     expect(paramMaps.get('single')).toEqual('s');
53 │   });
54 │ });
```

13 行目の入力は文字列と文字列の配列だけです。27 行目が「配列なら最初」、33 行目が「1 個でも配列に包む」、38 行目と 43 行目が「無ければ `null` と `[]`」を固めています。47〜52 行目が 2170ea270ac の it です。**空の配列・数・`undefined` を渡したときの `get` を確かめる it はありません。**

📄 `angular/packages/router/test/utils/tree.spec.ts` L36–55 （▶ の行: 39–40, 47–48, 53）

```ts
36 │ 
37 │   it('should return the first child of a node', () => {
38 │     const t = new Tree<any>(new TreeNode<number>(1, [new TreeNode<number>(2, [])])) as any;
39 ▶     expect(t.firstChild(1)).toEqual(2);
40 ▶     expect(t.firstChild(2)).toEqual(null);
41 │   });
42 │ 
43 │   it('should return the siblings of a node', () => {
44 │     const t = new Tree<any>(
45 │       new TreeNode<number>(1, [new TreeNode<number>(2, []), new TreeNode<number>(3, [])]),
46 │     ) as any;
47 ▶     expect(t.siblings(2)).toEqual([3]);
48 ▶     expect(t.siblings(1)).toEqual([]);
49 │   });
50 │ 
51 │   it('should return the path to the root', () => {
52 │     const t = new Tree<any>(new TreeNode<number>(1, [new TreeNode<number>(2, [])])) as any;
53 ▶     expect(t.pathFromRoot(2)).toEqual([1, 2]);
54 │   });
55 │ });
```

📄 `angular/packages/router/test/url_serializer.spec.ts` L209–220 （▶ の行: 211–212, 216–218）

```ts
209 │   it('should serializer query params', () => {
210 │     const tree = url.parse('/one?a');
211 ▶     expect(url.serialize(tree)).toEqual('/one?a=');
212 ▶   });
213 │ 
214 │   it('should handle multiple query params of the same name into an array', () => {
215 │     const tree = url.parse('/one?a=foo&a=bar&a=swaz');
216 ▶     expect(tree.queryParams).toEqual({a: ['foo', 'bar', 'swaz']});
217 ▶     expect(tree.queryParamMap.get('a')).toEqual('foo');
218 ▶     expect(tree.queryParamMap.getAll('a')).toEqual(['foo', 'bar', 'swaz']);
219 │     expect(url.serialize(tree)).toEqual('/one?a=foo&a=bar&a=swaz');
220 │   });
```

1 節の「一度作ると代入しても古いまま」を確かめる it もありません。217〜218 行目は parse した直後に読むだけです。

### 手元で走らせた結果

📄 `走らせたコマンドと結果（2026-11-20、8576f161ae4）`

```
$ cd ~/angular-research/angular        # 8576f161ae4
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all "--test_arg=--filter=^ParamsMap "
Ran 7 of 1170 specs、7 specs, 0 failures（shared.spec.ts の 7 本）
  --filter=^tree             Ran 7 of 1170 specs、0 failures（utils/tree.spec.ts）
  --filter=^UrlTree          Ran 55 of 1170 specs、0 failures（url_tree.spec.ts）
  --filter=^url serializer   Ran 52 of 1170 specs、0 failures（url_serializer.spec.ts）
# 5 つを 1 つの正規表現 ^(ParamsMap|tree|RouterState & Snapshot|UrlTree|url serializer) にすると Ran 139 of 1170 specs、0 failures
```

### 直すとしたら

- 2 節の 370 行目の doc の例 `{id: 33}` は、url\_tree.ts の `UrlSegment` の doc コメントで `{id: '33'}` と書く形です。doc コメントだけの変更なので spec は要りません。
- 5 節の 89 行目で、空の配列に `undefined` を返すこと。`get` の約束（57〜61 行目）に合わせるなら、shared.ts の `ParamsAsMap.get` で長さ 0 の配列を `null` にし、shared.spec.ts の `ParamsMap` に `convertToParamMap({a: []}).get('a')` の it を足します。URL から空の配列は作られないので、Router の動きは変わりません。
- 1 節と 3 節のキャッシュは、`queryParams` と `parameters` が書き換えられる public のフィールドであることと組で成り立っています。キャッシュを外すか、フィールドを setter にするかは API の変更になるので、まず「代入したあとの `queryParamMap`」を url\_tree.spec.ts の it にして今の動きを固めるところからです。

## 聞かれそうな質問

**Q. queryParamMap と queryParams のどちらを読むべきですか？**

同じ名前が複数あり得るなら `queryParamMap.getAll` です。`queryParams.tag` は 1 個なら文字列、2 個以上なら配列で型が変わります。`getAll`（shared.ts 98 行目）はどちらも配列で返します。`get` は配列の最初（89 行目）です。

**Q. tree.queryParams を書き換えたのに queryParamMap が変わりません。**

url\_tree.ts 303 行目で最初の 1 回だけ作ってキャッシュしているからです。別のオブジェクトを代入すると前の `ParamMap` が残ります。中身を書き換えた場合は、`ParamsAsMap` がコピーしない（shared.ts 79 行目）ので見えます。新しい木が欲しいときは `router.createUrlTree` か `parseUrl` で作り直します。

**Q. UrlSegmentGroup の toString() で URL 全体が取れないのはなぜですか？**

347 行目が `serializePaths(this)`、つまり自分の segments だけを書くからです。子のグループと括弧は `UrlTree.toString()`（309 行目、`DefaultUrlSerializer.serialize`）が書きます。

**Q. numberOfChildren は segments の数ですか？**

違います。342 行目の `Object.keys(this.children).length`、子の outlet の数です。segments の数は `segments.length` です。

**Q. ParamMap.get は必ず string か null を返しますか？**

型はそう言いますが、shared.ts 89 行目は値をそのまま返します。URL から作った `ParamMap` なら文字列ですが、`convertToParamMap` に数を渡せば数、空の配列なら `undefined` です。`null` はキーが無いとき（92 行目）だけです。

**Q. /x/(admin:y//aux:z) のような URL が往復で壊れたのはどのバージョンですか？**

8576f161ae4（22.2.0-next.7）の serializeSegment では壊れます（3 節の記録）。011675e417d で直り、パッチの枝の 12b553bc282 として v22.2.4 から入っています。括弧の中の primary の最初のセグメントの `:` を `%3A` にします。

## 読み終えて

- `queryParamMap` と `parameterMap` は `??=` で 1 回だけ作る。`ParamsAsMap` はコピーしない。だから「代入」は見えず「中身の書き換え」は見える。
- `numberOfChildren` は子の outlet の数、`UrlSegmentGroup.toString()` は自分の segments だけ。
- `equalPath` はパスだけ、`equalSegments` はマトリクスパラメータも。`mapChildrenIntoArray` は primary を先に並べ直す。
- `ParamMap.get` の型は `string | null` だが、中身は確かめない。
- 括弧の中の primary の `:` は 8576f161ae4 では往復で outlet に化け、v22.2.4 で `%3A` にして直った。

---

← 前: [spec と issue を読む：@angular/ssr の残りを固めているテスト](../ssrl/06-ssrl-tests-issues.md)  
次: [ActivatedRoute の Observable と継承：toString・createEmptyState・paramMap と title・getInherited の既定値](02-rtl-router-state.md) →
