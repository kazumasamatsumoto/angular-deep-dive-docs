[目次](../README.md) › [Router の型と説明文の読み残し](README.md) › 第 8 回 / 全 9 回

# URL とナビゲーションの小道具の残り

> create\_url\_tree.ts・url\_tree.ts・recognize.ts・router.ts・navigation\_transition.ts・url\_handling\_strategy.ts・page\_title\_strategy.ts・router\_scroller.ts・router\_config.ts・router\_resource.ts・utils の未読の行：コマンドの説明と例、UrlCreationOptions、isActive の既定値、UrlHandlingStrategy と TitleStrategy の説明、内部のコメント。例を本物で全部当てる。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-url-rest)

---

この章で分かること：URL を作る関数（`createUrlTree` と `createUrlTreeFromSnapshot`）、`UrlCreationOptions`、`UrlHandlingStrategy`、`TitleStrategy` の doc コメントの例を本物で全部当てた結果と、URL とナビゲーションのまわりに残った小さな doc・内部のコメントが実装と合っているか。例のうち `['../../team/44/user/22']` の 1 つは書いてある URL にならず、`TitleStrategy` の例の配列は閉じ括弧が足りません。

読む対象は、`packages/router/src` の create\_url\_tree.ts・url\_tree.ts・recognize.ts・router.ts・navigation\_transition.ts・url\_handling\_strategy.ts・page\_title\_strategy.ts・router\_scroller.ts・router\_config.ts・router\_resource.ts と、utils の preactivation.ts・collection.ts・view\_transition.ts の、これまでの章が引いていない行です（../angular、8576f161ae4）。コマンドを木に当てる計算は[createUrlTree](../router/03-router-create-url-tree.md)、UrlTree の形は[UrlTree・UrlSegment・ParamMap](../rtl/01-rtl-url-tree.md)で読みました。

1. [1. models.ts の小さな型](01-rmd-basic-types.md)
2. [2. Route の説明文](02-rmd-route.md)
3. [3. ガードの型](03-rmd-guards.md)
4. [4. Resolve と NavigationBehaviorOptions](04-rmd-resolve-nav.md)
5. [5. provideRouter の機能](05-rmd-features.md)
6. [6. ルーターのイベント](06-rmd-events.md)
7. [7. RouterLink と RouterOutlet](07-rmd-directives.md)
8. **8. URL とナビゲーションの小道具**（この章）
9. [9. spec と issue](09-rmd-tests-issues.md)

## 1. createUrlTreeFromSnapshot の doc：例の 1 つが合わない

📄 `angular/packages/router/src/create_url_tree.ts` L25–51 （▶ の行: 26, 28, 35–36, 38–41, 47, 50）

````ts
25 │ /**
26 ▶  * Creates a `UrlTree` relative to an `ActivatedRouteSnapshot`.
27 │  *
28 ▶  * @publicApi
29 │  *
30 │  *
31 │  * @param relativeTo The `ActivatedRouteSnapshot` to apply the commands to
32 │  * @param commands An array of URL fragments with which to construct the new URL tree.
33 │  * If the path is static, can be the literal URL string. For a dynamic path, pass an array of path
34 │  * segments, followed by the parameters for each segment.
35 ▶  * The fragments are applied to the one provided in the `relativeTo` parameter.
36 ▶  * @param queryParams The query parameters for the `UrlTree`. `null` if the `UrlTree` does not have
37 │  *     any query parameters.
38 ▶  * @param fragment The fragment for the `UrlTree`. `null` if the `UrlTree` does not have a fragment.
39 ▶  * @param urlSerializer The `UrlSerializer` to use for handling query parameter normalization.
40 ▶  * You should provide your application's custom `UrlSerializer` if one is configured to parse and
41 ▶  * serialize query parameter values to and from objects other than strings/string arrays.
42 │  *
43 │  * @usageNotes
44 │  *
45 │  * ```ts
46 │  * // create /team/33/user/11
47 ▶  * createUrlTreeFromSnapshot(snapshot, ['/team', 33, 'user', 11]);
48 │  *
49 │  * // create /team/33;expand=true/user/11
50 ▶  * createUrlTreeFromSnapshot(snapshot, ['/team', 33, {expand: true}, 'user', 11]);
51 │  *
````

📄 `angular/packages/router/src/create_url_tree.ts` L52–78 （▶ の行: 52–53, 57, 60, 64, 66–67, 70, 73, 75–76）

````ts
52 ▶  * // you can collapse static segments like this (this works only with the first passed-in value):
53 ▶  * createUrlTreeFromSnapshot(snapshot, ['/team/33/user', userId]);
54 │  *
55 │  * // If the first segment can contain slashes, and you do not want the router to split it,
56 │  * // you can do the following:
57 ▶  * createUrlTreeFromSnapshot(snapshot, [{segmentPath: '/one/two'}]);
58 │  *
59 │  * // create /team/33/(user/11//right:chat)
60 ▶  * createUrlTreeFromSnapshot(snapshot, ['/team', 33, {outlets: {primary: 'user/11', right:
61 │  * 'chat'}}], null, null);
62 │  *
63 │  * // remove the right secondary node
64 ▶  * createUrlTreeFromSnapshot(snapshot, ['/team', 33, {outlets: {primary: 'user/11', right: null}}]);
65 │  *
66 ▶  * // For the examples below, assume the current URL is for the `/team/33/user/11` and the
67 ▶  * `ActivatedRouteSnapshot` points to `user/11`:
68 │  *
69 │  * // navigate to /team/33/user/11/details
70 ▶  * createUrlTreeFromSnapshot(snapshot, ['details']);
71 │  *
72 │  * // navigate to /team/33/user/22
73 ▶  * createUrlTreeFromSnapshot(snapshot, ['../22']);
74 │  *
75 ▶  * // navigate to /team/44/user/22
76 ▶  * createUrlTreeFromSnapshot(snapshot, ['../../team/44/user/22']);
77 │  * ```
78 │  */
````

26 行目は「`ActivatedRouteSnapshot` に対して相対の `UrlTree` を作る」、35 行目は「コマンドは `relativeTo` に当てる」です。39〜41 行目は「`queryParams` をオブジェクトとして扱う独自の `UrlSerializer` があるなら渡す」で、渡さないときは `DefaultUrlSerializer` です。デモは今の URL を `/team/33/user/11`、snapshot を `user/:uid` の Route（URL のセグメントは `user` と `11` の 2 つ）にして、46〜76 行目の例を全部当てます。

1. **根からの 6 つ（47〜64 行目）**

   `router.createUrlTree` では書いてあるとおりでした。`createUrlTreeFromSnapshot` は 35 行目のとおり snapshot に当てるので、先頭が `/` でない `[{segmentPath: '/one/two'}]` は `/team/33/user/11/%2Fone%2Ftwo` になります（router のほうは `/%2Fone%2Ftwo`）。57 行目の「スラッシュを分けない」は、どちらでも `%2F` に符号化されることです。
2. **相対の 2 つ（70・73 行目）**

   `['details']` は `/team/33/user/11/details`、`['../22']` は `/team/33/user/22` で、doc のとおりです。`..` 1 つで URL のセグメントを 1 つ戻ります（`11` を外す）。
3. **75〜76 行目だけが合わない**

   `['../../team/44/user/22']` は `/team/44/user/22` ではなく `/team/33/team/44/user/22` でした。`..` 2 つは `user` と `11` を外すだけで、`team/33` は残ります。`/team/44/user/22` にするには `['../../../../team/44/user/22']` が要ります。

`Router.createUrlTree` の doc の同じ例（router.ts の 465〜466 行目）が同じ理由で合わないことは、[createUrlTree](../router/03-router-create-url-tree.md)の 4 節が計算で示しています。create\_url\_tree.ts の 75〜76 行目は、`createUrlTreeFromSnapshot` を足した 53ca936366f（2022-05-04、#45877）が router.ts の例を写したもので、同じ誤りを持っています。origin/main の 75〜76 行目も同じです。もう 1 つ、67 行目は先頭に `//` が無く、コードの塊の中で地の文になっています（66 行目の続き）。

## 2. Router.createUrlTree の doc：「今の URL の木に足す」と「根から」

📄 `angular/packages/router/src/router.ts` L424–456 （▶ の行: 425, 430–431, 439, 449, 452, 455）

````ts
424 │   /**
425 ▶    * Appends URL segments to the current URL tree to create a new URL tree.
426 │    *
427 │    * @param commands An array of URL fragments with which to construct the new URL tree.
428 │    * If the path is static, can be the literal URL string. For a dynamic path, pass an array of path
429 │    * segments, followed by the parameters for each segment.
430 ▶    * The fragments are applied to the current URL tree or the one provided  in the `relativeTo`
431 ▶    * property of the options object, if supplied.
432 │    * @param navigationExtras Options that control the navigation strategy.
433 │    * @returns The new URL tree.
434 │    *
435 │    * @usageNotes
436 │    *
437 │    * ```ts
438 │    * // create /team/33/user/11
439 ▶    * router.createUrlTree(['/team', 33, 'user', 11]);
440 │    *
441 │    * // create /team/33;expand=true/user/11
442 │    * router.createUrlTree(['/team', 33, {expand: true}, 'user', 11]);
443 │    *
444 │    * // you can collapse static segments like this (this works only with the first passed-in value):
445 │    * router.createUrlTree(['/team/33/user', userId]);
446 │    *
447 │    * // If the first segment can contain slashes, and you do not want the router to split it,
448 │    * // you can do the following:
449 ▶    * router.createUrlTree([{segmentPath: '/one/two'}]);
450 │    *
451 │    * // create /team/33/(user/11//right:chat)
452 ▶    * router.createUrlTree(['/team', 33, {outlets: {primary: 'user/11', right: 'chat'}}]);
453 │    *
454 │    * // remove the right secondary node
455 ▶    * router.createUrlTree(['/team', 33, {outlets: {primary: 'user/11', right: null}}]);
456 │    *
````

425 行目は「今の URL の木にセグメントを足して、新しい URL の木を作る」、430〜431 行目は「コマンドは今の URL の木か、`relativeTo` の Route に当てる」です。一方、この下の 468〜469 行目（[createUrlTree](../router/03-router-create-url-tree.md)の引用）は「`relativeTo` が `null` か `undefined` なら根に対して作る」と書きます。`/team/33/user/11` の上で `router.createUrlTree(['details'])` を呼ぶと、結果は `/details` でした。493 行目の `relativeTo ? relativeTo.snapshot : this.routerState.snapshot.root`（[createUrlTree](../router/03-router-create-url-tree.md)の引用）のとおり根に当たり、「今の URL に足す」ことはしません。425・430 行目は、`relativeTo` の無いときの動きを言い当てていません。425 行目の文は c179b5033b7（2016-05-26、`feat(router): implement relative navigation`）からです。

## 3. UrlCreationOptions の relativeTo の例

📄 `angular/packages/router/src/navigation_transition.ts` L89–108 （▶ の行: 92–94, 104）

```ts
 89 │ /**
 90 │  * @description
 91 │  *
 92 ▶  * Options that modify the `Router` URL.
 93 ▶  * Supply an object containing any of these properties to a `Router` navigation function to
 94 ▶  * control how the target URL should be constructed.
 95 │  *
 96 │  * @see {@link Router#navigate}
 97 │  * @see {@link Router#createUrlTree}
 98 │  * @see [Routing and Navigation guide](guide/routing/common-router-tasks)
 99 │  *
100 │  * @publicApi
101 │  */
102 │ export interface UrlCreationOptions {
103 │   /**
104 ▶    * Specifies a root URI to use for relative navigation.
105 │    *
106 │    * For example, consider the following route configuration where the parent route
107 │    * has two children.
108 │    *
```

📄 `angular/packages/router/src/navigation_transition.ts` L109–136 （▶ の行: 123–124, 129, 132）

````ts
109 │    * ```ts
110 │    * [{
111 │    *   path: 'parent',
112 │    *   component: ParentComponent,
113 │    *   children: [{
114 │    *     path: 'list',
115 │    *     component: ListComponent
116 │    *   },{
117 │    *     path: 'child',
118 │    *     component: ChildComponent
119 │    *   }]
120 │    * }]
121 │    * ```
122 │    *
123 ▶    * The following `go()` function navigates to the `list` route by
124 ▶    * interpreting the destination URI as relative to the activated `child`  route
125 │    *
126 │    * ```ts
127 │    *  @Component({...})
128 │    *  class ChildComponent {
129 ▶    *    constructor(private router: Router, private route: ActivatedRoute) {}
130 │    *
131 │    *    go() {
132 ▶    *      router.navigate(['../list'], { relativeTo: this.route });
133 │    *    }
134 │    *  }
135 │    * ```
136 │    *
````

92〜94 行目は「Router の URL を変えるオプション。ナビゲーションの関数に渡して、行き先の URL の作り方を決める」、104 行目は `relativeTo` を「相対のナビゲーションの根にする URI」と書きます。123〜124 行目の例（`child` の Route から `['../list']`）は、デモで `/parent/child` から `/parent/list` になりました。この下の `queryParams`・`queryParamsHandling`・`preserveFragment` の 4 つの例（137〜194 行目、[ナビゲーションの依頼](../router/07-router-navigation-request.md)と[Router クラスと Navigation の型](../rtl/04-rtl-router-class.md)の引用）も、デモでは全部 doc のとおりでした。132 行目は `this.router` ではなく `router.navigate` と書いていて、129 行目の `private router` を指していません。この例をそのまま写して TypeScript（サイトの 6.0.3、`--strict`）にかけると `TS2663: Cannot find name 'router'. Did you mean the instance member 'this.router'?` です。origin/main の同じ行も同じです。

## 4. URL を作る・読む内部のコメント

📄 `angular/packages/router/src/create_url_tree.ts` L161–171 （▶ の行: 163, 165–166, 168）

```ts
161 │ 
162 │ /**
163 ▶  * Normalizes a query parameter value by using the `UrlSerializer` to serialize then parse the value.
164 │  *
165 ▶  * This ensures that the value is consistent between parsing a URL in the browser on a fresh page load (or page refresh)
166 ▶  * and a navigation where the query parameter value is passed directly to the router.
167 │  *
168 ▶  * This also allows custom `UrlSerializer` implementations to define how query parameter values are represented
169 │  * in a `UrlTree`. Since `UrlSerializer` already has a `parse` that takes a string, it already has control
170 │  * over how a browser URL is parsed into a `UrlTree` on initial load/page refresh.
171 │  */
```

📄 `angular/packages/router/src/create_url_tree.ts` L215–222 （▶ の行: 217–220）

```ts
215 │ 
216 │ /**
217 ▶  * Replaces the `oldSegment` which is located in some child of the `current` with the `newSegment`.
218 ▶  * This also has the effect of creating new `UrlSegmentGroup` copies to update references. This
219 ▶  * shouldn't be necessary but the fallback logic for an invalid ActivatedRoute in the creation uses
220 ▶  * the Router's current url tree. If we don't create new segment groups, we end up modifying that
221 │  * value.
222 │  */
```

163〜166 行目は、query の値を一度 `UrlSerializer` で文字列にして読み直す理由を「ページを開いたときに URL から読んだ値と、ナビゲーションで直接渡した値を同じにするため」と書きます。217〜221 行目は、セグメントを置き換えるたびに `UrlSegmentGroup` を作り直す理由を「不正な `ActivatedRoute` のときの退避策（router.ts の 495〜512 行目、[createUrlTree](../router/03-router-create-url-tree.md)）が Router の今の URL の木を使うので、作り直さないとそれを書き換えてしまう」と書きます。どちらも実装と合っています。

📄 `angular/packages/router/src/create_url_tree.ts` L425–445 （▶ の行: 430, 432, 434, 436, 444–445）

```ts
425 │     // If the set of commands applies to anything other than the primary outlet and the child
426 │     // segment is an empty path primary segment on its own, we want to apply the commands to the
427 │     // empty child path rather than here. The outcome is that the empty primary child is effectively
428 │     // removed from the final output UrlTree. Imagine the following config:
429 │     //
430 ▶     // {path: '', children: [{path: '**', outlet: 'popup'}]}.
431 │     //
432 ▶     // Navigation to /(popup:a) will activate the child outlet correctly Given a follow-up
433 │     // navigation with commands
434 ▶     // ['/', {outlets: {'popup': 'b'}}], we _would not_ want to apply the outlet commands to the
435 │     // root segment because that would result in
436 ▶     // //(popup:a)(popup:b) since the outlet command got applied one level above where it appears in
437 │     // the `ActivatedRoute` rather than updating the existing one.
438 │     //
439 │     // Because empty paths do not appear in the URL segments and the fact that the segments used in
440 │     // the output `UrlTree` are squashed to eliminate these empty paths where possible
441 │     // https://github.com/angular/angular/blob/13f10de40e25c6900ca55bd83b36bd533dacfa9e/packages/router/src/url_tree.ts#L755
442 │     // it can be hard to determine what is the right thing to do when applying commands to a
443 │     // `UrlSegmentGroup` that is created from an "unsquashed"/expanded `ActivatedRoute` tree.
444 ▶     // This code effectively "squashes" empty path primary routes when they have no siblings on
445 ▶     // the same level of the tree.
```

📄 `angular/packages/router/src/create_url_tree.ts` L547–562 （▶ の行: 553–554, 556–557）

```ts
547 │ 
548 │ function createNewSegmentChildren(outlets: {[name: string]: readonly unknown[] | string}): {
549 │   [outlet: string]: UrlSegmentGroup;
550 │ } {
551 │   const children: {[outlet: string]: UrlSegmentGroup} = {};
552 │   Object.entries(outlets).forEach(([outlet, commands]) => {
553 ▶     if (typeof commands === 'string') {
554 ▶       commands = [commands];
555 │     }
556 ▶     if (commands !== null) {
557 ▶       children[outlet] = createNewSegmentGroup(new UrlSegmentGroup([], {}), 0, commands);
558 │     }
559 │   });
560 │   return children;
561 │ }
562 │ 
```

425〜445 行目は、空の path の primary を「兄弟がいなければ潰して」から outlet のコマンドを当てる理由のコメントです（`//(popup:a)(popup:b)` にならないように）。548〜561 行目の `createNewSegmentChildren` は、556 行目で `null` の outlet を飛ばします。1 節の「`right: null` で right を消す」例（64 行目）は、ここで子を作らないことで消えます。

📄 `angular/packages/router/src/url_tree.ts` L852–862 （▶ の行: 855–857, 859–860）

```ts
852 │ 
853 │ /**
854 │  * Recursively
855 ▶  * - merges primary segment children into their parents
856 ▶  * - drops empty children (those which have no segments and no children themselves). This latter
857 ▶  * prevents serializing a group into something like `/a(aux:)`, where `aux` is an empty child
858 │  * segment.
859 ▶  * - merges named outlets without a primary segment sibling into the children. This prevents
860 ▶  * serializing a URL like `//(a:a)(b:b) instead of `/(a:a//b:b)` when the aux b route lives on the
861 │  * root but the `a` route lives under an empty path primary route.
862 │  */
```

📄 `angular/packages/router/src/url_tree.ts` L525–532 （▶ の行: 527, 529–530）

```ts
525 │ 
526 │ /**
527 ▶  * Encodes a URI string with the default encoding. This function will only ever be called from
528 │  * `encodeUriQuery` or `encodeUriSegment` as it's the base set of encodings to be used. We need
529 ▶  * a custom encoding because encodeURIComponent is too aggressive and encodes stuff that doesn't
530 ▶  * have to be encoded per https://url.spec.whatwg.org.
531 │  */
532 │ function encodeUriString(s: string): string {
```

854〜861 行目は `squashSegmentGroup` の 3 つの仕事（primary の子を親に混ぜる、空の子を捨てる、primary の兄弟の無い名前付きの outlet を子に混ぜる）です。860 行目は `` `//(a:a)(b:b) `` の後ろの `` ` `` が抜けていて、コードの印が 861 行目の途中まで続きます。527〜531 行目は「`encodeURIComponent` は強すぎるので、url.spec.whatwg.org で符号化しなくてよいものは戻す」です（符号化の中身は[UrlTree・UrlSegment・ParamMap](../rtl/01-rtl-url-tree.md)）。

📄 `angular/packages/router/src/recognize.ts` L36–43 （▶ の行: 40–42）

```ts
36 │ import {firstValueFrom} from './utils/first_value_from';
37 │ import {isEmptyError} from './utils/type_guards';
38 │ 
39 │ /**
40 ▶  * Class used to indicate there were no additional route config matches but that all segments of
41 ▶  * the URL were consumed during matching so the route was URL matched. When this happens, we still
42 ▶  * try to match child configs in case there are empty path children.
43 │  */
```

📄 `angular/packages/router/src/recognize.ts` L179–187 （▶ の行: 181–182）

```ts
179 │ 
180 │   /**
181 ▶    * Matches every child outlet in the `segmentGroup` to a `Route` in the config. Returns `null` if
182 ▶    * we cannot find a match for _any_ of the children.
183 │    *
184 │    * @param config - The `Routes` to match against
185 │    * @param segmentGroup - The `UrlSegmentGroup` whose children need to be matched against the
186 │    *     config.
187 │    */
```

📄 `angular/packages/router/src/recognize.ts` L269–279 （▶ の行: 270, 279）

```ts
269 │ 
270 ▶   async processSegmentAgainstRoute(
271 │     injector: EnvironmentInjector,
272 │     routes: Route[],
273 │     route: Route,
274 │     rawSegment: UrlSegmentGroup,
275 │     segments: UrlSegment[],
276 │     outlet: string,
277 │     allowRedirects: boolean,
278 │     parentRoute: ActivatedRouteSnapshot,
279 ▶   ): Promise<TreeNode<ActivatedRouteSnapshot> | NoLeftoversInUrl> {
```

📄 `angular/packages/router/src/recognize.ts` L545–552 （▶ の行: 548–550）

```ts
545 │ }
546 │ 
547 │ /**
548 ▶  * Finds `TreeNode`s with matching empty path route configs and merges them into `TreeNode` with
549 ▶  * the children from each duplicate. This is necessary because different outlets can match a
550 ▶  * single empty path route config and the results need to then be merged.
551 │  */
552 │ function mergeEmptyPathMatches(
```

📄 `angular/packages/router/src/recognize.ts` L602–610 （▶ の行: 604, 608）

```ts
602 │ 
603 │ function getData(route: Route): Data {
604 ▶   return route.data || {};
605 │ }
606 │ 
607 │ function getResolve(route: Route): ResolveData {
608 ▶   return route.resolve || {};
609 │ }
610 │ 
```

40〜42 行目の `NoLeftoversInUrl` は「URL のセグメントは使い切ったが、空の path の子がまだ合うかもしれないので続ける」ための印で、279 行目の `processSegmentAgainstRoute` の戻り値の型に出てきます。181〜182 行目は `processChildren` を「どれか 1 つの子でも合わなければ `null` を返す」と書きますが、今の `processChildren`（188〜233 行目、[recognize](../router/09-router-recognize.md)の引用）の戻り値の型は `Promise<TreeNode<ActivatedRouteSnapshot>[]>` で、`null` を返す道はありません。合わないときは、下の `processSegmentGroup` が `NoMatch` を投げます。このコメントは 3966bcc5d97（2020-11-25、#40029）のときの戻り値（`| null`）のままで、origin/main でも同じ文です。外に出ない内部のコメントですが、読む人をまちがった方へ連れて行きます。548〜550 行目の `mergeEmptyPathMatches` と、604・608 行目の `getData` / `getResolve`（無ければ空のオブジェクト）は、書いてあるとおりです。

## 5. isActive と IsActiveMatchOptions の doc

📄 `angular/packages/router/src/url_tree.ts` L14–22 （▶ の行: 14, 17–18, 21）

```ts
14 ▶ import {equalArraysOrString, shallowEqual} from './utils/collection';
15 │ 
16 │ /**
17 ▶  * A set of options which specify how to determine if a `UrlTree` is active, given the `UrlTree`
18 ▶  * for the current router state.
19 │  *
20 │  * @publicApi
21 ▶  * @see {@link isActive}
22 │  */
```

📄 `angular/packages/router/src/url_tree.ts` L63–72 （▶ の行: 64, 66, 71）

```ts
63 │ 
64 ▶ type ParamMatchOptions = 'exact' | 'subset' | 'ignored';
65 │ 
66 ▶ type PathCompareFn = (
67 │   container: UrlSegmentGroup,
68 │   containee: UrlSegmentGroup,
69 │   matrixParams: ParamMatchOptions,
70 │ ) => boolean;
71 ▶ type ParamCompareFn = (container: Params, containee: Params) => boolean;
72 │ 
```

📄 `angular/packages/router/src/url_tree.ts` L104–118 （▶ の行: 106, 108, 110–114, 117）

```ts
104 │ 
105 │ /**
106 ▶  * Returns a computed signal of whether the given url is activated in the Router.
107 │  *
108 ▶  * As the router state changes, the signal will update to reflect whether the url is active.
109 │  *
110 ▶  * When using the `matchOptions` argument, any missing properties fall back to the following defaults:
111 ▶  * - `paths`: 'subset'
112 ▶  * - `queryParams`: 'subset'
113 ▶  * - `matrixParams`: 'ignored'
114 ▶  * - `fragment`: 'ignored'
115 │  *
116 │  * @see [Check if a URL is active](guide/routing/read-route-state#check-if-a-url-is-active)
117 ▶  * @publicApi 21.1
118 │  */
```

📄 `angular/packages/router/src/url_tree.ts` L133–146 （▶ の行: 135, 140–143）

```ts
133 │ 
134 │ /**
135 ▶  * Determines if a `UrlTree` is contained within another `UrlTree` based on the provided matching options.
136 │  *
137 │  * @param container The outer or reference `UrlTree`.
138 │  * @param containee The target `UrlTree` to test against the container.
139 │  * @param options Optional, matching options:
140 ▶  * - `paths`: Defines how to compare URL segments ('exact' or 'subset'). Defaults to 'subset'.
141 ▶  * - `matrixParams`: Defines how to compare matrix parameters ('exact', 'subset', or 'ignored'). Defaults to 'ignored'.
142 ▶  * - `queryParams`: Defines how to compare query parameters ('exact', 'subset', or 'ignored'). Defaults to 'subset'.
143 ▶  * - `fragment`: Defines how to compare URL fragments ('exact' or 'ignored'). Defaults to 'ignored'.
144 │  *
145 │  * @publicApi
146 │  */
```

110〜114 行目（`isActive`）と 140〜143 行目（`containsTree`）は、省いた項目の既定値を「paths は subset、queryParams は subset、matrixParams は ignored、fragment は ignored」と書きます。実装の `subsetMatchOptions`（98〜103 行目）と `containsTree` の 152〜155 行目の `{...subsetMatchOptions, ...options}`（[RouterLinkActive の仕組み](../router/18-router-link-active.md)の引用）と合っています。117 行目は `@publicApi 21.1`。106・108 行目の「computed の signal を返し、Router の状態が変わると更新する」は、`router.lastSuccessfulNavigation()` を読む `computed` だからです。

📄 `angular/packages/router/src/utils/collection.ts` L48–55 （▶ の行: 50, 52）

```ts
48 │ 
49 │ /**
50 ▶  * Test equality for arrays of strings or a string.
51 │  */
52 ▶ export function equalArraysOrString(
53 │   a: string | readonly string[],
54 │   b: string | readonly string[],
55 │ ): boolean {
```

50 行目の `equalArraysOrString` は「文字列の配列か文字列の等しさ」で、配列は並べ替えてから比べます。`queryParams: 'exact'`（IsActiveMatchOptions の 41 行目の doc は「完全に一致」）でも、`?a=1&a=2` と `?a=2&a=1` は同じと判定されます。doc は順の扱いに触れていません。

## 6. router.ts の残り：ブラウザに合わせるナビゲーション

📄 `angular/packages/router/src/router.ts` L263–271 （▶ の行: 265, 268–269）

```ts
263 │ 
264 │   /** @internal */
265 ▶   resetRootComponentType(rootComponentType: Type<any>): void {
266 │     // TODO: vsavkin router 4.0 should make the root component set to null
267 │     // this will simplify the lifecycle of the router.
268 ▶     this.routerState.root.component = rootComponentType;
269 ▶     this.navigationTransitions.rootComponentType = rootComponentType;
270 │   }
271 │ 
```

📄 `angular/packages/router/src/router.ts` L303–325 （▶ の行: 305, 307–308, 318–321, 324–325）

```ts
303 │ 
304 │   /**
305 ▶    * Schedules a router navigation to synchronize Router state with the browser state.
306 │    *
307 ▶    * This is done as a response to a popstate event and the initial navigation. These
308 ▶    * two scenarios represent times when the browser URL/state has been updated and
309 │    * the Router needs to respond to ensure its internal state matches.
310 │    */
311 │   private navigateToSyncWithBrowser(
312 │     url: string,
313 │     source: NavigationTrigger,
314 │     state: RestoredState | null | undefined,
315 │     extras: NavigationExtras,
316 │     hasUAVisualTransition?: boolean,
317 │   ) {
318 ▶     // TODO: restoredState should always include the entire state, regardless
319 ▶     // of navigationId. This requires a breaking change to update the type on
320 ▶     // NavigationStart’s restoredState, which currently requires navigationId
321 ▶     // to always be present. The Router used to only restore history state if
322 │     // a navigationId was present.
323 │ 
324 ▶     // The stored navigationId is used by the RouterScroller to retrieve the scroll
325 ▶     // position for the page.
```

265 行目の `resetRootComponentType` は内部用で、bootstrap のときに根のコンポーネントの型を routerState と transitions の両方に入れます（呼ぶのは `getBootstrapListener`、[第 5 回](05-rmd-features.md)）。305〜309 行目は `navigateToSyncWithBrowser` を「popstate と**初期ナビゲーション**のときに、ブラウザの URL / state に Router を合わせる」と書きます。`NavigationStart.restoredState` の doc の「popstate のとき以外は null」と合わない理由が、この内部のコメントには正しく書かれています（[第 6 回](06-rmd-events.md)の 2 節）。318〜322 行目の TODO は「`restoredState` にはいつも state の全部を入れるべきだが、`navigationId` を必須にしている型を変える破壊的変更が要る」です。

## 7. UrlHandlingStrategy と TitleStrategy

📄 `angular/packages/router/src/url_handling_strategy.ts` L13–45 （▶ の行: 16, 18, 22, 27–29, 35–36, 41）

```ts
13 │ /**
14 │  * @description
15 │  *
16 ▶  * Provides a way to migrate AngularJS applications to Angular.
17 │  *
18 ▶  * @see [URL handling strategy](guide/routing/customizing-route-behavior#built-in-preloading-strategies)
19 │  *
20 │  * @publicApi
21 │  */
22 ▶ @Service({factory: () => inject(DefaultUrlHandlingStrategy)})
23 │ export abstract class UrlHandlingStrategy {
24 │   /**
25 │    * Tells the router if this URL should be processed.
26 │    *
27 ▶    * When it returns true, the router will execute the regular navigation.
28 ▶    * When it returns false, the router will set the router state to an empty state.
29 ▶    * As a result, all the active components will be destroyed.
30 │    *
31 │    */
32 │   abstract shouldProcessUrl(url: UrlTree): boolean;
33 │ 
34 │   /**
35 ▶    * Extracts the part of the URL that should be handled by the router.
36 ▶    * The rest of the URL will remain untouched.
37 │    */
38 │   abstract extract(url: UrlTree): UrlTree;
39 │ 
40 │   /**
41 ▶    * Merges the URL fragment with the rest of the URL.
42 │    */
43 │   abstract merge(newUrlPart: UrlTree, rawUrl: UrlTree): UrlTree;
44 │ }
45 │ 
```

16 行目は「AngularJS のアプリを Angular へ移す手段」、27〜29 行目は「`shouldProcessUrl` が `false` を返すと Router の状態を空にし、active なコンポーネントはすべて壊す」、35〜36 行目は「`extract` は Router が扱う部分を取り出し、残りはそのまま」、41 行目は「`merge` は残りと合わせる」です。18 行目のガイドへのリンクは `#built-in-preloading-strategies`（事前読み込みの節）を指していて、origin/main の deade10d4d1（2026-09-25、`docs(router): fix UrlHandlingStrategy guide link`）で `#url-handling-strategy` に直りました。

デモの 3 つの行がこの約束を確かめます。`/a` の `AppCmp` を表示してから、処理しない `/legacy/page` へ移ると、Promise は `true`、`a` のコンポーネントが壊れ、routerState の根の子は 0 個になりました。流れたイベントは `NavigationStart・GuardsCheckStart・GuardsCheckEnd・NavigationEnd` で、`RoutesRecognized` はありません（空の状態を作るのは navigation\_transition.ts の 598〜608 行目、[ナビゲーションの依頼](../router/07-router-navigation-request.md)の引用）。続けて `/legacy/other` へ移ると、今の URL も次の URL も処理しないので `NavigationSkipped` 1 個です。`old` という名前の outlet を `extract` で外し `merge` で戻す策では、`/a(old:x)` へ移ったあと `router.url` は `/a`、偽の `LocationStrategy` に書かれた URL は `/a(old:x)`、続けて `/b` へ移ると `/b(old:x)` でした。

📄 `angular/packages/router/src/page_title_strategy.ts` L15–37 （▶ の行: 18–20, 22–27, 31–32）

````ts
15 │ /**
16 │  * Provides a strategy for setting the page title after a router navigation.
17 │  *
18 ▶  * The built-in implementation traverses the router state snapshot and finds the deepest primary
19 ▶  * outlet with `title` property. Given the `Routes` below, navigating to
20 ▶  * `/base/child(popup:aux)` would result in the document title being set to "child".
21 │  * ```ts
22 ▶  * [
23 ▶  *   {path: 'base', title: 'base', children: [
24 ▶  *     {path: 'child', title: 'child'},
25 ▶  *   ],
26 ▶  *   {path: 'aux', outlet: 'popup', title: 'popupTitle'}
27 ▶  * ]
28 │  * ```
29 │  *
30 │  * This class can be used as a base class for custom title strategies. That is, you can create your
31 ▶  * own class that extends the `TitleStrategy`. Note that in the above example, the `title`
32 ▶  * from the named outlet is never used. However, a custom strategy might be implemented to
33 │  * incorporate titles in named outlets.
34 │  *
35 │  * @publicApi
36 │  * @see [Page title guide](guide/routing/define-routes#using-titlestrategy-for-page-titles)
37 │  */
````

18〜20 行目は「既定の実装は、title を持ついちばん深い primary の outlet を探す。下の Routes で `/base/child(popup:aux)` に移ると、文書のタイトルは "child"」です。**22〜27 行目の配列は、そのままでは読めません**。23 行目の `{path: 'base', …, children: [` を、25 行目の `],` は `children` の `[` だけ閉じ、`base` のオブジェクトの `}` がありません。26 行目の前に `}` が要ります。そのまま TypeScript にかけると `TS1136: Property assignment expected.` です。この例は `Route.title` を足した 910de8bc337（2021-06-14、#43307）からで、origin/main でも同じです。

デモは `}` を補った同じ Routes で、`Title` を偽物に替えた既定の `DefaultTitleStrategy` を動かします。`/base/child(popup:aux)` で `setTitle` に来た値は `child`、`/base(popup:aux)` では `base` でした。31〜32 行目のとおり、名前付きの outlet の `popupTitle` は使われません。

## 8. スクロール・設定・resources の小さな doc

📄 `angular/packages/router/src/router_scroller.ts` L22–37 （▶ の行: 23, 31, 34–35）

```ts
22 │ import {
23 ▶   IMPERATIVE_NAVIGATION,
24 │   NavigationEnd,
25 │   NavigationSkipped,
26 │   NavigationSkippedCode,
27 │   NavigationStart,
28 │   NavigationTrigger,
29 │   Scroll,
30 │ } from './events';
31 ▶ import {NavigationTransitions} from './navigation_transition';
32 │ import {UrlSerializer} from './url_tree';
33 │ 
34 ▶ export const ROUTER_SCROLLER = new InjectionToken<RouterScroller>(
35 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'Router Scroller' : '',
36 │ );
37 │ 
```

📄 `angular/packages/router/src/router_scroller.ts` L161–168 （▶ の行: 162, 164–165）

```ts
161 │ 
162 ▶   /** @docs-private */
163 │   ngOnDestroy(): void {
164 ▶     this.routerEventsSubscription?.unsubscribe();
165 ▶     this.scrollEventsSubscription?.unsubscribe();
166 │   }
167 │ }
168 │ 
```

34〜35 行目の `ROUTER_SCROLLER` は factory の無いトークンで、`withInMemoryScrolling` だけが provide します（[第 5 回](05-rmd-features.md)の 2 節）。164〜165 行目の `ngOnDestroy` は 2 つの購読を外すだけです。

📄 `angular/packages/router/src/router_config.ts` L34–42 （▶ の行: 36, 38）

```ts
34 │ 
35 │ /**
36 ▶  * Extra configuration options that can be used with the `withRouterConfig` function.
37 │  *
38 ▶  * @see [Router configuration options](guide/routing/customizing-route-behavior#router-configuration-options)
39 │  *
40 │  * @publicApi
41 │  */
42 │ export interface RouterConfigOptions {
```

📄 `angular/packages/router/src/router_config.ts` L167–191 （▶ の行: 168–169, 175–177, 179–182, 185）

````ts
167 │    *
168 ▶    * You can implement custom scroll restoration behavior by adapting the enabled behavior as
169 ▶    * in the following example.
170 │    *
171 │    * ```ts
172 │    * class AppComponent {
173 │    *   movieData: any;
174 │    *
175 ▶    *   constructor(private router: Router, private viewportScroller: ViewportScroller,
176 ▶    * changeDetectorRef: ChangeDetectorRef) {
177 ▶    *   router.events.pipe(filter((event: Event): event is Scroll => event instanceof Scroll)
178 │    *     ).subscribe(e => {
179 ▶    *       fetch('http://example.com/movies.json').then(response => {
180 ▶    *         this.movieData = response.json();
181 ▶    *         // update the template with the data before restoring scroll
182 ▶    *         changeDetectorRef.detectChanges();
183 │    *
184 │    *         if (e.position) {
185 ▶    *           viewportScroller.scrollToPosition(e.position);
186 │    *         }
187 │    *       });
188 │    *     });
189 │    *   }
190 │    * }
191 │    * ```
````

168〜169 行目は「`'enabled'` の動きを真似て、独自のスクロールの戻し方を書ける」、171〜191 行目がその例です。180 行目の `this.movieData = response.json()` は、`Response.json()` が Promise を返すので、データではなく Promise を入れます。181〜182 行目は「スクロールを戻す前にテンプレートを更新する」ために `detectChanges()` を呼びますが、この時点で `movieData` はまだ Promise です。origin/main の 4380e683d80（2026-09-10、`docs(router): update scroll restoration example`）は、この例を `inject()` と `signal` の形に書き直しましたが、`this.movieData.set(response.json())` と、やはり Promise をそのまま入れています（`detectChanges` の行は消えた）。`interface MovieData { title: string }` を足して TypeScript にかけると `TS2345: Argument of type 'Promise<any>' is not assignable to parameter of type 'MovieData'.` になります（8576f161ae4 の版は `movieData: any` なので型の誤りは出ず、値が Promise になるだけ）。

📄 `angular/packages/router/src/router_config.ts` L302–309 （▶ の行: 304, 308）

```ts
302 │ 
303 │ /**
304 ▶  * A DI token for the router service.
305 │  *
306 │  * @publicApi
307 │  */
308 ▶ export const ROUTER_CONFIGURATION = new InjectionToken<ExtraOptions>(
309 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'router config' : '',
```

304 行目は `ROUTER_CONFIGURATION` を「Router のサービスの DI トークン」と書きますが、308 行目のとおり、これは `ExtraOptions` の値（Router の**設定**）のトークンです。Router のサービス自身は `Router` クラスで注入します。origin/main の同じ行（303 行目）も同じ文です。

📄 `angular/packages/router/src/router_resource.ts` L185–196 （▶ の行: 187, 190, 192–193）

```ts
185 │ 
186 │ /**
187 ▶  * Creates reactive effects to bind the unwrapped values of blocking router resources
188 │  * to matching component inputs.
189 │  *
190 ▶  * Non-blocking resources are bound as the `Resource` instance itself through the standard
191 │  * route data stream in `RoutedComponentInputBinder`. In contrast, blocking resources have
192 ▶  * resolved before navigation completes and bind their unwrapped `.value()` to the component
193 ▶  * input. This sets up an `effect` for each matching blocking resource to keep the component
194 │  * input reactively updated, and returns the handled keys so the standard data subscription
195 │  * skips them.
196 │  */
```

187〜195 行目は、blocking の resources は `.value()` を外した値を入力に結び付け、そうでないものは `Resource` のまま結び付ける、と書きます（中身は[Route の resources](../router/20-router-resources.md)）。[第 5 回](05-rmd-features.md)の 9 節の「resources がいちばん強い」は、この関数が返す `handledKeys` を通常の data の購読が飛ばすことで実現しています。

## 9. utils の残り

📄 `angular/packages/router/src/utils/preactivation.ts` L57–65 （▶ の行: 61–63）

```ts
57 │ 
58 │ export function getCanActivateChild(
59 │   p: ActivatedRouteSnapshot,
60 │ ): {node: ActivatedRouteSnapshot; guards: any[]} | null {
61 ▶   const canActivateChild = p.routeConfig ? p.routeConfig.canActivateChild : null;
62 ▶   if (!canActivateChild || canActivateChild.length === 0) return null;
63 ▶   return {node: p, guards: canActivateChild};
64 │ }
65 │ 
```

📄 `angular/packages/router/src/utils/collection.ts` L13–20 （▶ の行: 14, 16）

```ts
13 │ export function shallowEqualArrays(a: readonly any[], b: readonly any[]): boolean {
14 ▶   if (a.length !== b.length) return false;
15 │   for (let i = 0; i < a.length; ++i) {
16 ▶     if (!shallowEqual(a[i], b[i])) return false;
17 │   }
18 │   return true;
19 │ }
20 │ 
```

📄 `angular/packages/router/src/utils/collection.ts` L65–72 （▶ の行: 67, 70）

```ts
65 │ 
66 │ /**
67 ▶  * Return the last element of an array.
68 │  */
69 │ export function last<T>(a: readonly T[]): T | null {
70 ▶   return a.length > 0 ? a[a.length - 1] : null;
71 │ }
72 │ 
```

📄 `angular/packages/router/src/utils/collection.ts` L87–94 （▶ の行: 89–90, 92）

```ts
87 │ 
88 │ export function wrapIntoPromise<T>(value: T | Promise<T> | Observable<T>): Promise<T> {
89 ▶   if (isObservable(value)) {
90 ▶     return firstValueFrom(value);
91 │   }
92 ▶   return Promise.resolve(value);
93 │ }
94 │ 
```

preactivation.ts の `getCanActivateChild`（58〜64 行目）は、`canActivateChild` が空なら `null` を返し、ガードのある親だけを集めます。collection.ts の `shallowEqualArrays`（13〜19 行目）は要素ごとに `shallowEqual`、`last`（69〜71 行目）は空なら `null`、`wrapIntoPromise`（88〜93 行目）は Observable なら `firstValueFrom` で最初の値を待ちます。

📄 `angular/packages/router/src/utils/view_transition.ts` L20–27 （▶ の行: 22, 24–25）

```ts
20 │ 
21 │ /**
22 ▶  * Options to configure the View Transitions integration in the Router.
23 │  *
24 ▶  * @developerPreview 20.0
25 ▶  * @see withViewTransitions
26 │  */
27 │ export interface ViewTransitionsFeatureOptions {
```

📄 `angular/packages/router/src/utils/view_transition.ts` L41–48 （▶ の行: 43–44, 46）

```ts
41 │ 
42 │ /**
43 ▶  * The information passed to the `onViewTransitionCreated` function provided in the
44 ▶  * `withViewTransitions` feature options.
45 │  *
46 ▶  * @developerPreview 20.0
47 │  */
48 │ export interface ViewTransitionInfo {
```

📄 `angular/packages/router/src/utils/view_transition.ts` L63–70 （▶ の行: 65–66, 68–69）

```ts
63 │ 
64 │ /**
65 ▶  * A helper function for using browser view transitions. This function skips the call to
66 ▶  * `startViewTransition` if the browser does not support it or has already provided a transition.
67 │  *
68 ▶  * @returns A Promise that resolves when the view transition callback begins, or `undefined` when
69 ▶  * the user agent has already provided a transition and the navigation should continue immediately.
70 │  */
```

24・46 行目は `@developerPreview 20.0`、`withViewTransitions` 自身は `@developerPreview 19.0`（[第 5 回](05-rmd-features.md)の 9 節）で、版の印がずれています。origin/main の 64502f9ae23（`feat(router): Mark view transitions as stable`）で、この 2 つは `@publicApi 22.3` になりました。65〜69 行目は「対応していないか、ブラウザがすでに遷移を出しているときは `startViewTransition` を呼ばない。後者のときは `undefined` を返して、すぐ続ける」で、実装は[View Transitions](../router/19-router-view-transitions.md)で読みました。

## 10. 動かして確かめる

> **🧪 DEMO — doc の例を本物の createUrlTree・Router・UrlHandlingStrategy・TitleStrategy に当てる**
>
> ボタンを押すと、子の環境インジェクター（`INJECTOR_SCOPE = 'root'` を置き、Router などをこのサイトと共有しない）に Router を 4 回作り、それぞれの doc の例を当てて読み、`destroy` します。`LocationStrategy` は記録するだけの偽物、`Title` は `setTitle` の値を覚えるだけの偽物なので、このページの URL・履歴・タイトルは変わりません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-url-rest)

同じデモのファイルを Node（domino の上の JIT）で開発モードと本番の両方で走らせると、20 行すべてが同じ文字列でした。

## テストと直し方

### spec と it

| doc の約束 | spec（packages/router/test/ から） |
| --- | --- |
| 1 節 `createUrlTreeFromSnapshot` | `create_url_tree.spec.ts` の `describe('createUrlTreeFromSnapshot')`（660 行目）。doc の `team/44` の例そのものの it は無い |
| 1 節 相対の `..` | 同じファイルの `describe('relative navigation')`（467 行目）› 510・525 行目ほか |
| 7 節 UrlHandlingStrategy | `integration/lazy_loading.spec.ts` の `describe('custom url handling strategies')` だけ（`grep -rln UrlHandlingStrategy packages/router/test` で 1 ファイル）。› 930 行目 `should work` が、処理しない URL で routerState の根の子が 0 個・表示が空になり、続けて `NavigationSkipped` が出ることを確かめる |
| 7 節 TitleStrategy | `page_title_strategy_spec.ts`（名前は `_spec`）の `describe('DefaultTitleStrategy')`（27 行目）› 74 行目 `sets title with child routes and named outlets` |
| 5 節 isActive の既定値 | `url_tree.spec.ts` の `describe('containsTree')`（73 行目） |

### 手元で走らせた結果

../angular で `pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all` は `1170 specs, 0 failures` でした（2026-11-21）。`createUrlTree` の describe に絞った件数は[第 9 回](09-rmd-tests-issues.md)の表にあります。

### 直すとしたら

- 1 節は create\_url\_tree.ts の 75〜76 行目と router.ts の 465〜466 行目を、`['../../../../team/44/user/22']` にするか、結果を `/team/33/team/44/user/22` と書くかのどちらかです。67 行目の先頭に `//` を足します。spec は create\_url\_tree.spec.ts の `describe('createUrlTreeFromSnapshot')` に、doc と同じ Route と URL で 3 つの相対の例を確かめる it を足すと、doc と spec が揃います。
- 2 節は router.ts の 425 行目を「コマンドを根か `relativeTo` の Route に当てて、新しい URL の木を作る」にします。
- 3 節は navigation\_transition.ts の 132 行目を `this.router.navigate` にします。
- 4 節は recognize.ts の 181〜182 行目を「どれか 1 つの子でも合わなければ `NoMatch` を投げる」にします。860 行目は抜けた `` ` `` を足します。
- 7 節は page\_title\_strategy.ts の 25 行目のあとに `},` を足します。8 節は router\_config.ts の 180 行目を `response.json().then(…)` の形にし、304 行目を「Router の設定の DI トークン」にします。

## 聞かれそうな質問

**Q. user/11 を指す Route から \['../../team/44/user/22'\] で /team/44/user/22 に行けますか？**

行けません。`..` は URL のセグメントで数えるので、2 つでは `user` と `11` しか外れず、`/team/33/team/44/user/22` になります。doc の 75〜76 行目（と router.ts の同じ例）は合いません（1 節）。

**Q. router.createUrlTree(\['details'\]) は今の URL に details を足しますか？**

足しません。`relativeTo` が無いと根に当てるので `/details` です。425 行目の「今の URL の木に足す」は、468〜469 行目の「根から」と食い違っています（2 節）。

**Q. UrlHandlingStrategy が false を返すと、何が起きますか？**

前の URL を処理していたなら、Router の状態を空にしてコンポーネントを壊し、`NavigationEnd` まで流れます（`RoutesRecognized` は無い）。前の URL も処理していなかったなら `NavigationSkipped` だけです（7 節）。

**Q. 名前付きの outlet の title はページのタイトルになりますか？**

既定の `DefaultTitleStrategy` ではなりません。いちばん深い primary の title だけを見ます。使いたければ `TitleStrategy` を継承して書きます（7 節、31〜33 行目）。

**Q. ROUTER\_CONFIGURATION を inject すると Router が手に入りますか？**

いいえ。304 行目の doc はそう読めますが、中身は `ExtraOptions`（設定の値）です（8 節）。

## 読み終えて

- createUrlTree の doc の例は、`['../../team/44/user/22']` の 1 つを除いて書いてあるとおりに動く。誤った例は 2 つのファイルにある。
- `relativeTo` の無い `createUrlTree` は根に当てる。「今の URL に足す」は言い過ぎ。
- UrlHandlingStrategy と TitleStrategy の約束は動きと合う。TitleStrategy の例の配列は閉じ括弧が足りない。
- 内部のコメントにも古いもの（`processChildren` の `null`）と誤記（`ROUTER_CONFIGURATION` の「Router のサービス」）がある。
- スクロールの例は main で書き直されたが、`response.json()` の Promise をそのまま入れるのは変わらない。

---

← 前: [RouterLink・RouterLinkActive・RouterOutlet の説明文](07-rmd-directives.md)  
次: [spec と issue を読む：型と説明文を固めているもの](09-rmd-tests-issues.md) →
