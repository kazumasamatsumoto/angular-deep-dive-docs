[目次](../README.md) › [Router の内側](README.md) › 第 1 回 / 全 21 回

# Router は 1 本の RxJS パイプライン

> URL は木を直列化したもの、という設計思想から読む。switchMap でナビゲーションが打ち消される仕組みと、その取りこぼし対策まで。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/router)

---

> [!NOTE]
> **ポイント**
>
> この章はシリーズ「Router の内側」の概観です。UrlTree と switchMap の全体像をここで掴み、次の章から URL の解析・Route の照合・ガード・RouterOutlet への配置・履歴の書き換えを 1 つずつ掘り下げます。[シリーズの構成を見る](README.md)

読む対象は `packages/router/src/` です。Router の中心にある考え方が、クラスのドキュメントに一文で書かれているので、そこから始めます。

## 0. @angular/router はどこにあるか

先に「読む場所」をはっきりさせます。Router は npm では `@angular/router` という **`@angular/core` とは別のパッケージ**ですが、ソースコードは同じ angular/angular リポジトリの `packages/router/` にあります。1 つのリポジトリから複数のパッケージを出す形（monorepo）です。

📄 `angular/packages/router/package.json` L1–13 （▶ の行: 2, 11–12）

```json
 1 │ {
 2 ▶   "name": "@angular/router",
 3 │   "version": "0.0.0-PLACEHOLDER",
 4 │   "description": "Angular - the routing library",
 5 │   "keywords": [
 6 │     "angular",
 7 │     "router"
 8 │   ],
 9 │   "repository": {
10 │     "type": "git",
11 ▶     "url": "git+https://github.com/angular/angular.git",
12 ▶     "directory": "packages/router"
13 │   },
```
*packages/router/package.json。2 行目がパッケージ名、11〜12 行目が「このリポジトリのこのディレクトリから出している」という宣言。*

2 行目の `name` が npm に公開される名前です。11〜12 行目の `repository` は リポジトリの URL と `directory: "packages/router"` で、**1 つのリポジトリの中の 1 ディレクトリが 1 パッケージ**になっていることを示しています。`version` が `0.0.0-PLACEHOLDER` なのは、リリース時にビルドが本物の番号に差し替えるからです。

📄 `angular/packages/router/package.json` L29–34 （▶ の行: 30–32）

```json
29 │   "peerDependencies": {
30 ▶     "@angular/core": "0.0.0-PLACEHOLDER",
31 ▶     "@angular/common": "0.0.0-PLACEHOLDER",
32 ▶     "@angular/platform-browser": "0.0.0-PLACEHOLDER",
33 │     "rxjs": "^6.5.3 || ^7.4.0"
34 │   },
```
*同じファイルの peerDependencies。router は core・common・platform-browser に依存するが、逆は無い。*

30〜32 行目で `@angular/core`、`@angular/common`、`@angular/platform-browser` を peer として要求しています。依存は片方向で、`packages/core/src` の中に `@angular/router` を参照する行はありません （`grep -rn "@angular/router" packages/core/src` が空）。core は Router を知らず、Router が core の上に乗っている、という関係です。

📄 `angular/packages/router/BUILD.bazel` L32–39 （▶ の行: 32, 36）

```python
32 ▶ ng_package(
33 │     srcs = [
34 │         "package.json",
35 │     ],
36 ▶     package = "@angular/router",
37 │     tags = [
38 │         "release-with-framework",
39 │     ],
```
*packages/router/BUILD.bazel。ng\_package ルールが、このディレクトリを @angular/router として npm 用に束ねる。*

32 行目の `ng_package` が、Bazel でこのディレクトリを 1 つの npm パッケージに束ねるルールで、36 行目にパッケージ名が書いてあります。core・common・forms・platform-browser などもそれぞれの `packages/<名前>/BUILD.bazel` に同じルールを持っています。このサイトの「angular/angular」というタグはリポジトリ名であって、パッケージ名ではありません。

## 1. URL は木を文字列にしたもの

📄 `angular/packages/router/src/url_tree.ts` L249–280 （▶ の行: 254–255）

````ts
249 │ /**
250 │  * @description
251 │  *
252 │  * Represents the parsed URL.
253 │  *
254 ▶  * Since a router state is a tree, and the URL is nothing but a serialized state, the URL is a
255 ▶  * serialized tree.
256 │  * UrlTree is a data structure that provides a lot of affordances in dealing with URLs
257 │  *
258 │  * @usageNotes
259 │  * ### Example
260 │  *
261 │  * ```ts
262 │  * @Component({templateUrl:'template.html'})
263 │  * class MyComponent {
264 │  *   constructor(router: Router) {
265 │  *     const tree: UrlTree =
266 │  *       router.parseUrl('/team/33/(user/victor//support:help)?debug=true#fragment');
267 │  *     const f = tree.fragment; // return 'fragment'
268 │  *     const q = tree.queryParams; // returns {debug: 'true'}
269 │  *     const g: UrlSegmentGroup = tree.root.children[PRIMARY_OUTLET];
270 │  *     const s: UrlSegment[] = g.segments; // returns 2 segments 'team' and '33'
271 │  *     g.children[PRIMARY_OUTLET].segments; // returns 2 segments 'user' and 'victor'
272 │  *     g.children['support'].segments; // return 1 segment 'help'
273 │  *   }
274 │  * }
275 │  * ```
276 │  *
277 │  * @publicApi
278 │  */
279 │ export class UrlTree {
280 │   /** @internal */
````

254 行目から 255 行目。**「ルーターの状態は木である。URL はそれを直列化したものにすぎない」**。これが Router の設計の出発点です。

だから `parseUrl` は文字列ではなく木を返します。266 行目からの例で、`/team/33/(user/victor//support:help)` という URL が どう分解されるかが示されています。

## 2. 木のノード

📄 `angular/packages/router/src/url_tree.ts` L322–349 （▶ の行: 328, 330, 332）

```ts
322 │ export class UrlSegmentGroup {
323 │   /** The parent node in the url tree */
324 │   parent: UrlSegmentGroup | null = null;
325 │ 
326 │   constructor(
327 │     /** The URL segments of this group. See `UrlSegment` for more information */
328 ▶     public segments: UrlSegment[],
329 │     /** The list of children of this group */
330 ▶     public children: {[key: string]: UrlSegmentGroup},
331 │   ) {
332 ▶     Object.values(children).forEach((v) => (v.parent = this));
333 │   }
334 │ 
335 │   /** Whether the segment has child segments */
336 │   hasChildren(): boolean {
337 │     return this.numberOfChildren > 0;
338 │   }
339 │ 
340 │   /** Number of child segments */
341 │   get numberOfChildren(): number {
342 │     return Object.keys(this.children).length;
343 │   }
344 │ 
345 │   /** @docs-private */
346 │   toString(): string {
347 │     return serializePaths(this);
348 │   }
349 │ }
```

328 行目が「このノードのパス片」、330 行目が子です。注目したいのは **子が配列ではなく名前付きのオブジェクト**であること。この名前が outlet の名前になります。

だから 1 つの URL で**複数の outlet の状態を同時に表せます**。括弧とスラッシュ 2 つという独特の記法は、木を文字列に落とすための構文だったわけです。

## 3. ナビゲーションの段階

実際の処理は `navigation_transition.ts` の 1 本の RxJS パイプラインです。主要な 3 段階は、それぞれ別ファイルに分かれています。

📄 `angular/packages/router/src/navigation_transition.ts` L63–65

```ts
63 │ import {checkGuards} from './operators/check_guards';
64 │ import {recognize} from './operators/recognize';
65 │ import {resolveData} from './operators/resolve_data';
```

これらが次の順に並びます。

> **🧪 DEMO — ナビゲーションの段階**
>
> クリックすると、その段階が何をしているかが出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/router)

> [!TIP]
> **新卒エンジニアへ**
>
> 順番が実務で効きます。**ガードは resolve より先**なので、権限がない人のためにデータを取りに行くことはありません。そして**コンポーネントの読み込みはさらに後**なので、アクセスできない画面の JS はダウンロードすらされません。「無駄なことを早い段階で止める」という並びです。

## 4. なぜ switchMap なのか

📄 `angular/packages/router/src/navigation_transition.ts` L448–460 （▶ の行: 452–453）

```ts
448 │     this.transitions = new BehaviorSubject<NavigationTransition | null>(null);
449 │     return this.transitions.pipe(
450 │       filter((t): t is NavigationTransition => t !== null),
451 │ 
452 ▶       // Using switchMap so we cancel executing navigations when a new one comes in
453 ▶       switchMap((overallTransitionState) => {
454 │         let abortable = true;
455 │         let completedOrAborted = false;
456 │         const abortController = new AbortController();
457 │         const shouldContinueNavigation = () => {
458 │           return !completedOrAborted && this.currentTransition?.id === overallTransitionState.id;
459 │         };
460 │         return of(overallTransitionState).pipe(
```

452 行目のコメントが理由そのものです。`switchMap` は「新しい値が来たら前の処理を捨てる」演算子なので、**移動中に別の場所へ移動したら前の移動をやめる**という意味になります。

これは実際よくある状況です。読み込みに 2 秒かかるページを開いた人が、待ちきれず別のリンクを押す。前の処理を続けると **2 秒後に古いページが表示されてしまいます**。

## 5. それでも取りこぼす場合

📄 `angular/packages/router/src/navigation_transition.ts` L461–478 （▶ の行: 462, 465–466）

```ts
461 │           switchMap((t) => {
462 ▶             // It is possible that `switchMap` fails to cancel previous navigations if a new one happens synchronously while the operator
463 │             // is processing the `next` notification of that previous navigation. This can happen when a new navigation (say 2) cancels a
464 │             // previous one (1) and yet another navigation (3) happens synchronously in response to the `NavigationCancel` event for (1).
465 ▶             // https://github.com/ReactiveX/rxjs/issues/7455
466 ▶             if (this.navigationId > overallTransitionState.id) {
467 │               const cancellationReason =
468 │                 typeof ngDevMode === 'undefined' || ngDevMode
469 │                   ? `Navigation ID ${overallTransitionState.id} is not equal to the current navigation id ${this.navigationId}`
470 │                   : '';
471 │               this.cancelNavigationTransition(
472 │                 overallTransitionState,
473 │                 cancellationReason,
474 │                 NavigationCancellationCode.SupersededByNewNavigation,
475 │               );
476 │               return EMPTY;
477 │             }
478 │             this.currentTransition = overallTransitionState;
```

462 行目から 465 行目のコメントに、取りこぼす条件と **RxJS の issue 番号**まで書かれています。「1 番を 2 番が打ち消し、その打ち消しイベントに反応して 3 番が**同期的に**始まる」という状況です。

対策が 466 行目。id を直接比べて、古い移動なら自分で止めています。

> [!NOTE]
> **さらに深く**
>
> ライブラリの既知の不具合に対して、**回避策と根拠のリンクをコードに残す** というやり方の実例です。あとから読む人が「なぜこの一見冗長なチェックがあるのか」を 調べ直さずに済みます。自分がコードを書くときにも真似できる習慣だと思います。

## 6. ガードが UrlTree を返せる理由

ガードは `true` / `false` のほかに `UrlTree` を返せます。返すとそこへリダイレクトされます。

1 節を踏まえると自然に見えます。`UrlTree` は「ルーターの状態そのもの」でした。つまりガードは**「この状態はダメです。代わりにこの状態にしてください」**と 言い返しているだけです。文字列を返す設計だと、また解析し直す必要が出てきます。

## 読み終えて

「URL は状態の直列化である」という 1 行の定義から、木構造も、名前付き outlet も、ガードが `UrlTree` を返せることも、すべて素直に導かれていました。

---

← 前: [effect はいつ走るか：root effect と view effect](../cd/09-cd-effects.md)  
次: [URL 文字列が UrlTree になるまで：UrlParser の 1 文字ずつの読み方](02-router-url-tree.md) →
