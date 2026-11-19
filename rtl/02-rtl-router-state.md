[目次](../README.md) › [Router の読み残し：UrlTree と RouterState の小道具・provideRouter の残り・Router クラス・読み込みとガードを行で埋める](README.md) › 第 2 回 / 全 6 回

# ActivatedRoute の Observable と継承：toString・createEmptyState・paramMap と title・getInherited の既定値

> router\_state.ts の未読の行：RouterState・RouterStateSnapshot・ActivatedRouteSnapshot・ActivatedRoute の toString と serializeNode、createEmptyState と createEmptyStateSnapshot（根の url の食い違い）、ActivatedRoute の title・paramMap の作り方、ActivatedRouteSnapshot の root・parent・firstChild・children・pathFromRoot と equalParamsAndUrlSegments、paramsInheritanceStrategy の既定値と古いままの getInherited の doc コメント、doc コメントの例。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-router-state)

---

`RouterState`（`ActivatedRoute` の木）と `RouterStateSnapshot`（`ActivatedRouteSnapshot` の木）の作りと、ナビゲーションのたびに Observable へ値が流れる仕組み（`advanceActivatedRoute`）は[2 つの木](../router/14-router-router-state.md)で読みました。この章は、その章が引かずに残した router\_state.ts の行を埋めます。`toString` が何を書くか、ナビゲーションの前の木（`createEmptyState`）に何が入っているか、`ActivatedRoute` の `title`・`paramMap` がどう作られるか、`ActivatedRouteSnapshot` の木をたどる getter、`getInherited` の doc コメントと既定値、そして doc コメントの例です。

読む対象は `packages/router/src/router_state.ts` と `packages/router/test/router_state.spec.ts` です（../angular、8576f161ae4）。継承の 3 つの条件（`getInherited` の 319〜326 行目）は[resolver と継承](../router/13-router-resolvers.md)の 4 節が行で読んでいるので、ここでは条件を繰り返さず、本物の Router で結果を見ます。

1. [1. UrlTree・UrlSegment・ParamMap](01-rtl-url-tree.md)
2. **2. ActivatedRoute の Observable と継承**（この章）
3. [3. provideRouter と RouterModule の残り](03-rtl-provide-router.md)
4. [4. Router クラスと Navigation の型](04-rtl-router-class.md)
5. [5. 読み込み・事前読み込み・再利用・関数ガード](05-rtl-load-guard.md)
6. [6. spec と issue](06-rtl-tests-issues.md)

## 1. toString：3 つのクラスが 1 つの形に落ちる

📄 `angular/packages/router/src/router_state.ts` L66–72 （▶ の行: 69–70）

```ts
66 │     setRouterState(<RouterState>this, root);
67 │   }
68 │ 
69 ▶   override toString(): string {
70 ▶     return this.snapshot.toString();
71 │   }
72 │ }
```

📄 `angular/packages/router/src/router_state.ts` L536–542 （▶ の行: 536–537）

```ts
536 ▶   override toString(): string {
537 ▶     return serializeNode(this._root);
538 │   }
539 │ }
540 │ 
541 │ function setRouterState<U, T extends {_routerState: U}>(state: U, node: TreeNode<T>): void {
542 │   node.value._routerState = state;
```

📄 `angular/packages/router/src/router_state.ts` L545–552 （▶ の行: 546–548）

```ts
545 │ 
546 ▶ function serializeNode(node: TreeNode<ActivatedRouteSnapshot>): string {
547 ▶   const c = node.children.length > 0 ? ` { ${node.children.map(serializeNode).join(', ')} } ` : '';
548 ▶   return `${node.value}${c}`;
549 │ }
550 │ 
551 │ /**
552 │  * The expectation is that the activate route is created with the right set of parameters.
```

📄 `angular/packages/router/src/router_state.ts` L490–524 （▶ の行: 491–494）

````ts
490 │ 
491 ▶   toString(): string {
492 ▶     const url = this.url.map((segment) => segment.toString()).join('/');
493 ▶     const matched = this.routeConfig ? this.routeConfig.path : '';
494 ▶     return `Route(url:'${url}', path:'${matched}')`;
495 │   }
496 │ }
497 │ 
498 │ /**
499 │  * @description
500 │  *
501 │  * Represents the state of the router at a moment in time.
502 │  *
503 │  * This is a tree of activated route snapshots. Every node in this tree knows about
504 │  * the "consumed" URL segments, the extracted parameters, and the resolved data.
505 │  *
506 │  * The following example shows how a component is initialized with information
507 │  * from the snapshot of the root node's state at the time of creation.
508 │  *
509 │  * ```ts
510 │  * @Component({templateUrl:'template.html'})
511 │  * class MyComponent {
512 │  *   constructor(router: Router) {
513 │  *     const state: RouterState = router.routerState;
514 │  *     const snapshot: RouterStateSnapshot = state.snapshot;
515 │  *     const root: ActivatedRouteSnapshot = snapshot.root;
516 │  *     const child = root.firstChild;
517 │  *     const id: Observable<string> = child.params.map(p => p.id);
518 │  *     //...
519 │  *   }
520 │  * }
521 │  * ```
522 │  *
523 │  * @publicApi
524 │  */
````

📄 `angular/packages/router/src/router_state.ts` L279–285 （▶ の行: 283–284）

```ts
279 │     );
280 │     return this._queryParamMap;
281 │   }
282 │ 
283 ▶   toString(): string {
284 ▶     return this.snapshot ? this.snapshot.toString() : `Future(${this._futureSnapshot})`;
285 │   }
```

1. **RouterState.toString（69〜70 行目）**

   自分の木ではなく、対になる `snapshot` の `toString()` を返します。だから `router.routerState.toString()` と `router.routerState.snapshot.toString()` はいつも同じ文字列です（デモの表の上の 2 行）。
2. **RouterStateSnapshot.toString（536〜537 行目）→ serializeNode（546〜548 行目）**

   根の `TreeNode` から再帰します。547 行目、子があれば子の文字列を `', '` でつなぎ、前に `' { '`、後ろに `' } '` を付けます（前後に空白が 1 つずつ）。548 行目で「自分の値の文字列 + それ」を返します。548 行目の `node.value` を文字列に埋めるところで、次の `ActivatedRouteSnapshot.toString()` が呼ばれます。
3. **ActivatedRouteSnapshot.toString（491〜494 行目）**

   492 行目で自分の `url`（消費した `UrlSegment`）を `/` でつなぎ、493 行目で `routeConfig.path`（根は `routeConfig` が `null` なので `''`）を取り、494 行目で `Route(url:'…', path:'…')` にします。
4. **ActivatedRoute.toString（283〜284 行目）**

   `snapshot` があればその `toString()`、まだ無ければ `Future(…)` です。`snapshot` を入れるのは `advanceActivatedRoute` で（[2 つの木](../router/14-router-router-state.md)の 5 節）、それより前に `ActivatedRoute` を見られるのは Router の中だけです。

デモで `/org/acme/item/7` に移ると、`Route(url:'', path:'') { Route(url:'org/acme', path:'org/:org') { Route(url:'item/7', path:'item/:id') } } ` になります。547 行目の前後の空白が入れ子の数だけ重なるので、`}` の前に空白が 2 つ並び、最後も空白で終わります。クエリとフラグメントはどのノードの `toString` にも出ません。URL 全体は `router.routerState.snapshot.url`（recognize が `serialize` した文字列）にあります。

この形は 05eebe0fed1（2016-06-09、`feat(router): provide meaningful toString impls`）からほぼそのままです。`RoutesRecognized` などのイベントの `toString()` もこの文字列を `state: …` に埋めます（[events.ts の各クラス](../rdir/04-rdir-events.md)）。

## 2. ナビゲーションの前の木：createEmptyState と createEmptyStateSnapshot

📄 `angular/packages/router/src/router_state.ts` L77–83 （▶ の行: 78–79, 83）

```ts
77 │ ): RouterState {
78 ▶   const snapshot = createEmptyStateSnapshot(rootComponent, injector);
79 ▶   const emptyUrl = new BehaviorSubject([new UrlSegment('', {})]);
80 │   const emptyParams = new BehaviorSubject({});
81 │   const emptyData = new BehaviorSubject({});
82 │   const emptyQueryParams = new BehaviorSubject({});
83 ▶   const fragment = new BehaviorSubject<string | null>('');
```

📄 `angular/packages/router/src/router_state.ts` L97–120 （▶ の行: 98, 105–107, 112, 114–116, 118）

```ts
 97 │ 
 98 ▶ export function createEmptyStateSnapshot(
 99 │   rootComponent: Type<any> | null,
100 │   injector: EnvironmentInjector,
101 │ ): RouterStateSnapshot {
102 │   const emptyParams = {};
103 │   const emptyData = {};
104 │   const emptyQueryParams = {};
105 ▶   const fragment = '';
106 ▶   const activated = new ActivatedRouteSnapshot(
107 ▶     [],
108 │     emptyParams,
109 │     emptyQueryParams,
110 │     fragment,
111 │     emptyData,
112 ▶     PRIMARY_OUTLET,
113 │     rootComponent,
114 ▶     null,
115 ▶     {},
116 ▶     injector,
117 │   );
118 ▶   return new RouterStateSnapshot('', new TreeNode<ActivatedRouteSnapshot>(activated, []));
119 │ }
120 │ 
```

`StateManager` が作られるときに `createEmptyState(null, inject(EnvironmentInjector))` が呼ばれ、これが最初の `router.routerState` になります（[2 つの木](../router/14-router-router-state.md)の 1 節が 74〜96 行目を読んでいます）。78 行目で先に `createEmptyStateSnapshot` を呼びます。

1. **snapshot の根（106〜117 行目）**

   107 行目の `url` は空の配列 `[]`、105 行目の `fragment` は `''`、112 行目の outlet は `PRIMARY_OUTLET`、114 行目の `routeConfig` は `null`、115 行目の resolve は `{}`、116 行目でアプリの環境の注入器を持ちます。118 行目、`RouterStateSnapshot` の URL の文字列は `''` です。
2. **ActivatedRoute の根（79〜83 行目）**

   79 行目の `url` の `BehaviorSubject` の初めの値は `[new UrlSegment('', {})]`、つまり**空のパスのセグメントが 1 つ入った配列**です。83 行目の `fragment` は `''` です。

107 行目と 79 行目で根の URL の形が違います。根の snapshot の `url` は、ナビゲーションのあとも `[]` のままです（recognize が作る根も消費するセグメントが無い）。`advanceActivatedRoute` は前後の snapshot の `url` を比べて違うときだけ `next` するので、根の `ActivatedRoute.url` は **最初の `['']` から一度も変わりません**。デモの表の根の行で、「url の今の値」は `['']`、「snapshot.url」は `[]` と並びます。`provideRouter` は根の `ActivatedRoute` を `inject(ActivatedRoute)` で取れるようにしている（[provideRouter の中身](../router/05-router-provide-router.md)の 1 節）ので、ルートのコンポーネントで `route.url` を購読するとこの値が届きます。79 行目は 6f68330fa50（2016-07-25、`UrlPathWithParams` を `UrlSegment` に改名）の形から変わっていません。origin/main（943ec3bd8d6）でも同じです。

`fragment` も、ナビゲーションの前は `''`、フラグメントの無い URL に移ったあとは `null` です（デモの 4 つ目の表）。

## 3. ActivatedRoute の Observable：同じ BehaviorSubject と、そこから map したもの

📄 `angular/packages/router/src/router_state.ts` L121–135 （▶ の行: 129–131）

```ts
121 │ /**
122 │  * Provides access to information about a route associated with a component
123 │  * that is loaded in an outlet.
124 │  * Use to traverse the `RouterState` tree and extract information from nodes.
125 │  *
126 │  * The following example shows how to construct a component using information from a
127 │  * currently activated route.
128 │  *
129 ▶  * Note: the observables in this class only emit when the current and previous values differ based
130 ▶  * on shallow equality. For example, changing deeply nested properties in resolved `data` will not
131 ▶  * cause the `ActivatedRoute.data` `Observable` to emit a new value.
132 │  *
133 │  * {@example router/activated-route/activated_route_component.ts region="activated-route"}
134 │  *
135 │  * @see [Getting route information](guide/routing/common-router-tasks#getting-route-information)
```

129〜131 行目の注意書きは、`advanceActivatedRoute` の `shallowEqual`（1 段だけ中身を比べる）のことです。resolve した `data` の奥の値だけが変わっても、`data` の Observable は値を出しません。

📄 `angular/packages/router/src/router_state.ts` L220–226 （▶ の行: 222–226）

```ts
220 │     futureSnapshot: ActivatedRouteSnapshot,
221 │   ) {
222 ▶     this._futureSnapshot = futureSnapshot;
223 ▶     this.title = this.dataSubject?.pipe(map((d: Data) => d[RouteTitleKey])) ?? of(undefined);
224 ▶     // TODO(atscott): Verify that these can be changed to `.asObservable()` with TGP.
225 ▶     this.url = urlSubject;
226 ▶     this.params = paramsSubject;
```

223 行目、`title` は `dataSubject` を `map` して `data[RouteTitleKey]`（`Route.title` を `data` に入れておくための symbol のキー）を取り出したものです。別の Subject は持ちません。`dataSubject` が無ければ `of(undefined)` です。225〜226 行目、`url`・`params` などは引数の `BehaviorSubject` をそのまま入れます。224 行目の TODO が言うとおり `.asObservable()` で包んでいないので、型を外せば `next` を呼べてしまう同じオブジェクトです。

📄 `angular/packages/router/src/router_state.ts` L266–272 （▶ の行: 267–269）

```ts
266 │    */
267 ▶   get paramMap(): Observable<ParamMap> {
268 ▶     this._paramMap ??= this.params.pipe(map((p: Params): ParamMap => convertToParamMap(p)));
269 ▶     return this._paramMap;
270 │   }
271 │ 
272 │   /**
```

268 行目、`paramMap` は `params` を `map` して `convertToParamMap` を通すだけです。`??=` で Observable は 1 つにしますが、**値が流れるたびに新しい `ParamMap`** ができます（デモの「同じ ParamMap か」が `false`）。`ParamMap` の中身は[前回](01-rtl-url-tree.md)の 5 節です。

📄 `angular/packages/router/src/router_state.ts` L182–203 （▶ の行: 183, 185–187, 192, 194, 196, 198, 200, 202）

```ts
182 │   /** @internal */
183 ▶   readonly pending?: WritableSignal<boolean>;
184 │   // Note for framework developers: `paramsSignal`, `queryParamsSignal`, and `dataSignal`
185 ▶   // do NOT use `{equal: shallowEqual}`. Even though navigations can re-emit structurally
186 ▶   // identical parameters, we rely on the default strict equality (`===`) so that any consumer
187 ▶   // depending on the entire object is correctly invalidated. This encourages developers to properly
188 │   // project nested scalar properties (e.g. `paramMap().get('id')`) instead of subscribing to the
189 │   // naked object. Furthermore, `shallowEqual` unsafely relies on mutations (`.sort()`) for generic
190 │   // arrays, making it unsuitable for signals that might carry complex `data` objects.
191 │   /** @internal */
192 ▶   readonly paramsSignal!: Signal<Params>;
193 │   /** @internal */
194 ▶   readonly queryParamsSignal!: Signal<Params>;
195 │   /** @internal */
196 ▶   readonly paramMapSignal!: Signal<ParamMap>;
197 │   /** @internal */
198 ▶   readonly queryParamMapSignal!: Signal<ParamMap>;
199 │   /** @internal */
200 ▶   readonly fragmentSignal!: Signal<string | null>;
201 │   /** @internal */
202 ▶   readonly dataSignal!: Signal<Data>;
203 │ 
```

192〜202 行目の 6 つの signal は `@internal` で、`initializeActivatedRoute` が後から入れます（[2 つの木](../router/14-router-router-state.md)の 6 節）。185〜187 行目のコメントは、これらが `{equal: shallowEqual}` を使わず、同じ形の値でも別のオブジェクトなら変化として扱う、と書いています。Observable の側（`shallowEqual` で止める）とは逆の選び方です。

## 4. ActivatedRouteSnapshot の木をたどる getter と、比べる関数

📄 `angular/packages/router/src/router_state.ts` L455–480 （▶ の行: 457–458, 462–463, 467–468, 472–473, 477–478）

```ts
455 │ 
456 │   /** The root of the router state */
457 ▶   get root(): ActivatedRouteSnapshot {
458 ▶     return this._routerState.root;
459 │   }
460 │ 
461 │   /** The parent of this route in the router state tree */
462 ▶   get parent(): ActivatedRouteSnapshot | null {
463 ▶     return this._routerState.parent(this);
464 │   }
465 │ 
466 │   /** The first child of this route in the router state tree */
467 ▶   get firstChild(): ActivatedRouteSnapshot | null {
468 ▶     return this._routerState.firstChild(this);
469 │   }
470 │ 
471 │   /** The children of this route in the router state tree */
472 ▶   get children(): ActivatedRouteSnapshot[] {
473 ▶     return this._routerState.children(this);
474 │   }
475 │ 
476 │   /** The path from the root of the router state tree to this route */
477 ▶   get pathFromRoot(): ActivatedRouteSnapshot[] {
478 ▶     return this._routerState.pathFromRoot(this);
479 │   }
480 │ 
```

458・463・468・473・478 行目、5 つとも `_routerState`（コンストラクタで木が全ノードに書き込む）の `Tree` のメソッドを呼ぶだけです。`parent` と `pathFromRoot` は根から深さ優先で探すので、毎回 O(ノード数) かかります（探索の中身は[前回](01-rtl-url-tree.md)の 7 節）。`ActivatedRoute` の側の同じ 5 つも同じ形です（[2 つの木](../router/14-router-router-state.md)の 3 節）。

📄 `angular/packages/router/src/router_state.ts` L412–435 （▶ の行: 424, 426, 429–430）

````ts
412 │ 
413 │   /** @internal */
414 │   constructor(
415 │     /** The URL segments matched by this route */
416 │     public url: UrlSegment[],
417 │     /**
418 │      *  The matrix parameters scoped to this route.
419 │      *
420 │      *  You can compute all params (or data) in the router state or to get params outside
421 │      *  of an activated component by traversing the `RouterState` tree as in the following
422 │      *  example:
423 │      *  ```ts
424 ▶      *  collectRouteParams(router: Router) {
425 │      *    let params = {};
426 ▶      *    let stack: ActivatedRouteSnapshot[] = [router.routerState.snapshot.root];
427 │      *    while (stack.length > 0) {
428 │      *      const route = stack.pop()!;
429 ▶      *      params = {...params, ...route.params};
430 ▶      *      stack.push(...route.children);
431 │      *    }
432 │      *    return params;
433 │      *  }
434 │      *  ```
435 │      */
````

`params` の doc コメントは、木の全部の `params` を集める例を載せています。426 行目で根から始め、429 行目で合わせ、430 行目で `children` を積みます。既定の `'always'`（5 節）では子が親の `params` をすでに持っているので、葉の `params` だけでほとんど足ります。この例が要るのは、名前付きの outlet の枝（primary 以外の子）の `params` も集めたいときです。

📄 `angular/packages/router/src/router_state.ts` L618–632 （▶ の行: 623–624, 627–629）

```ts
618 │ 
619 │ export function equalParamsAndUrlSegments(
620 │   a: ActivatedRouteSnapshot,
621 │   b: ActivatedRouteSnapshot,
622 │ ): boolean {
623 ▶   const equalUrlParams = shallowEqual(a.params, b.params) && equalSegments(a.url, b.url);
624 ▶   const parentsMismatch = !a.parent !== !b.parent;
625 │ 
626 │   return (
627 ▶     equalUrlParams &&
628 ▶     !parentsMismatch &&
629 ▶     (!a.parent || equalParamsAndUrlSegments(a.parent, b.parent!))
630 │   );
631 │ }
632 │ 
```

623 行目で `params` を `shallowEqual`、`url` を `equalSegments`（[前回](01-rtl-url-tree.md)の 3 節、マトリクスパラメータも比べる）で比べます。624 行目は「片方だけ親がある」かです。629 行目で親へ再帰するので、**先祖のどこかの params か URL が違えば `false`** です。呼ぶのは preactivation.ts の `shouldRunGuardsAndResolvers` で、`runGuardsAndResolvers` の既定の `'paramsChange'` がこれです（[ガード](../router/12-router-guards.md)）。

## 5. 継承の既定値と、古いままの doc コメント

📄 `angular/packages/router/src/router_state.ts` L293–299 （▶ の行: 294, 296–297）

```ts
293 │ 
294 ▶ export type ParamsInheritanceStrategy = 'emptyOnly' | 'always';
295 │ 
296 ▶ // g3-only export const DEFAULT_PARAMS_INHERITANCE_STRATEGY: ParamsInheritanceStrategy = 'emptyOnly';
297 ▶ export const DEFAULT_PARAMS_INHERITANCE_STRATEGY: ParamsInheritanceStrategy = 'always'; // 3p-only
298 │ 
299 │ /** @internal */
```

📄 `angular/packages/router/src/router_state.ts` L305–318 （▶ の行: 306, 309–310, 312, 315）

```ts
305 │ 
306 ▶ /**
307 │  * Returns the inherited params, data, and resolve for a given route.
308 │  *
309 ▶  * By default, we do not inherit parent data unless the current route is path-less or the parent
310 ▶  * route is component-less.
311 │  */
312 ▶ export function getInherited(
313 │   route: ActivatedRouteSnapshot,
314 │   parent: ActivatedRouteSnapshot | null,
315 ▶   paramsInheritanceStrategy: ParamsInheritanceStrategy,
316 │ ): Inherited {
317 │   let inherited: Inherited;
318 │   const {routeConfig} = route;
```

297 行目、外向けの既定は `'always'` です。296 行目は Google 社内のビルド（g3）では `'emptyOnly'` になる、という印で、4f9ee3c056a（2026-05-21）で付きました。既定を `'emptyOnly'` から `'always'` に変えたのは 17d10f7a992（2026-04-16、`fix(router): set default paramsInheritanceStrategy to 'always'`、BREAKING CHANGE、v22.0.0 から）です。

一方、309〜310 行目の doc コメントは「既定では、自分が空のパスか、親がコンポーネントを持たないときにしか親の data を継承しない」と書いています。これは `'emptyOnly'` の動きで、17d10f7a992 はこのコメントを変えていません（このコメントの最後の変更は 32789660683、2023-10-11）。adev のガイドの方は #71049（2026-09-29 にマージ、customizing-route-behavior.md だけ）で新しい既定に合わせて書き直されましたが、origin/main（943ec3bd8d6）の router\_state.ts でもこの文は残っています。デモで strategy を「書かない」にすると、`org/:org` に component があっても、葉の `params` は `{org, id}`、`data` には親の値も入り、`title` も親の `'Org'` になります。コメントの言う動きになるのは `'emptyOnly'` を選んだときだけです。

> [!NOTE]
> **ポイント**
>
> `title` が親から降りてくるのは、`Route.title` の文字列が `getInherited` の最後で `data[RouteTitleKey]` に入り（[resolver と継承](../router/13-router-resolvers.md)の 4 節）、継承の `{...parent.data, ...route.data}` が symbol のキーも写すからです。`'emptyOnly'` で親に component があると、子の `title` は `undefined` になります。

## 6. doc コメントの例が今の API と合わない所

📄 `angular/packages/router/src/router_state.ts` L27–64 （▶ の行: 44–47, 58, 63）

````ts
27 │ /**
28 │  * Represents the state of the router as a tree of activated routes.
29 │  *
30 │  * @usageNotes
31 │  *
32 │  * Every node in the route tree is an `ActivatedRoute` instance
33 │  * that knows about the "consumed" URL segments, the extracted parameters,
34 │  * and the resolved data.
35 │  * Use the `ActivatedRoute` properties to traverse the tree from any node.
36 │  *
37 │  * The following fragment shows how a component gets the root node
38 │  * of the current state to establish its own route tree:
39 │  *
40 │  * ```ts
41 │  * @Component({templateUrl:'template.html'})
42 │  * class MyComponent {
43 │  *   constructor(router: Router) {
44 ▶  *     const state: RouterState = router.routerState;
45 ▶  *     const root: ActivatedRoute = state.root;
46 ▶  *     const child = root.firstChild;
47 ▶  *     const id: Observable<string> = child.params.map(p => p.id);
48 │  *     //...
49 │  *   }
50 │  * }
51 │  * ```
52 │  *
53 │  * @see {@link ActivatedRoute}
54 │  * @see [Getting route information](guide/routing/common-router-tasks#getting-route-information)
55 │  *
56 │  * @publicApi
57 │  */
58 ▶ export class RouterState extends Tree<ActivatedRoute> {
59 │   /** @internal */
60 │   constructor(
61 │     root: TreeNode<ActivatedRoute>,
62 │     /** The current snapshot of the router state */
63 ▶     public snapshot: RouterStateSnapshot,
64 │   ) {
````

📄 `angular/packages/router/src/router_state.ts` L359–384 （▶ の行: 373–376）

````ts
359 │ 
360 │ /**
361 │  * @description
362 │  *
363 │  * Contains the information about a route associated with a component loaded in an
364 │  * outlet at a particular moment in time. ActivatedRouteSnapshot can also be used to
365 │  * traverse the router state tree.
366 │  *
367 │  * The following example initializes a component with route information extracted
368 │  * from the snapshot of the root node at the time of creation.
369 │  *
370 │  * ```ts
371 │  * @Component({templateUrl:'./my-component.html'})
372 │  * class MyComponent {
373 ▶  *   constructor(route: ActivatedRoute) {
374 ▶  *     const id: string = route.snapshot.params.id;
375 ▶  *     const url: string = route.snapshot.url.join('');
376 ▶  *     const user = route.snapshot.data.user;
377 │  *   }
378 │  * }
379 │  * ```
380 │  *
381 │  * @see [Understanding route snapshots](guide/routing/read-route-state#understanding-route-snapshots)
382 │  *
383 │  * @publicApi
384 │  */
````

- **47 行目**：`child.params.map(p => p.id)`。`params` は RxJS の `Observable` で、RxJS 6 からは `map` をメソッドとして持たず、`pipe(map(...))` と書きます（3 節の 268 行目がその形）。46 行目の `root.firstChild` は `ActivatedRoute | null` なので、strict な TypeScript ではここでも型エラーです。
- **1 節の 517 行目**（`RouterStateSnapshot` の doc）：同じ `child.params.map(p => p.id)` を、`Observable<string>` に入れています。ここの `child` は `ActivatedRouteSnapshot` で、`params` は普通のオブジェクト（`Params`）なので、`map` も Observable もありません。`child.params['id']` か `child.paramMap.get('id')` の形です。
- **375 行目**：`route.snapshot.url.join('')` は、各 `UrlSegment` の `toString()`（パスとマトリクスパラメータ）を区切り無しでつなぐので、`team/33` は `'team33'` になります。492 行目の `toString` は `'/'` でつないでいます。

## 7. 動かして確かめる

> **🧪 DEMO — 親子のルートで ActivatedRoute を読む**
>
> ボタンを押すと、`createApplication` でこのサイトとは別のアプリを作り、`provideRouter` に次のルートを渡します。`{path: 'org/:org', component?, title: 'Org', data: {from: 'org'}, children: [{path: 'item/:id', data: {from: 'item', leaf: true}}, {path: '', data: {empty: true}}]}`。`PlatformLocation` は URL を配列に積むだけの偽物で、このページの URL と履歴は変わりません。移動の前・`/org/acme/item/7?tab=a&tab=b#top`・`/org/acme/item/8?…`・`/org/acme` の 4 回、根から `firstChild` をたどって各ノードの Observable の今の値（購読してすぐ外す）と snapshot を表にし、終わったら `destroy` します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-router-state)

> [!NOTE]
> **ポイント**
>
> strategy を変えて押し比べると、違いが出るのは 2 つ目と 3 つ目の表の深さ 2（`item/:id`）だけです。`'emptyOnly'` で `component` ありのときに限り、`params` から `org` が、`data` から親の値が、`title` から `'Org'` が消えます。4 つ目の表の `path: ''` の子は、どの組み合わせでも親を継承します（自分のパスが空だから）。`:id` を変えたときは `params`・`paramMap`・`url` が 2 回（購読の 1 回 + 変化の 1 回）、`queryParams`・`fragment`・`data`・`title` は 1 回です。

📄 `記録のスクリプト（record.mjs。ページのデモと同じファイルを domino の上の JIT で動かす）`

```
// 章のデモのファイル（.demo-*.ts）を TypeScript で JS にし、domino の上で JIT で動かして、書き出した関数の結果を JSON で出す。
// 開発モードと本番（globalThis.ngDevMode = false）の両方で同じ操作ができる。
// 使い方: node record.mjs <angular-deep-dive のディレクトリ> <demo のファイル名> <関数名> '<引数の JSON 配列>' [prod]
import {mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const [root, file, fn, args, mode] = process.argv.slice(2);
if (mode === 'prod') {
  globalThis.ngDevMode = false;
  globalThis.ngServerMode = false;
}
const req = createRequire(join(root, 'package.json'));
const ts = req('typescript');
const tmp = join(dirname(fileURLToPath(import.meta.url)), 'tmp-' + file.replace(/\W/g, '-') + '-' + (mode ?? 'dev'));
rmSync(tmp, {recursive: true, force: true});
mkdirSync(tmp, {recursive: true});
symlinkSync(join(root, 'node_modules'), join(tmp, 'node_modules'), 'dir');
writeFileSync(join(tmp, 'package.json'), '{"type": "module"}');
const src = readFileSync(join(root, 'src/app/pages/chapters', file), 'utf8');
const out = ts.transpileModule(src, {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, experimentalDecorators: true, useDefineForClassFields: false},
}).outputText;
writeFileSync(join(tmp, 'demo.mjs'), out);

const serverDir = dirname(req.resolve('@angular/platform-server/package.json'));
const domino = (await import(pathToFileURL(join(serverDir, 'third_party/domino/bundled-domino.mjs')).href)).default;
const win = domino.createWindow('<html><head></head><body></body></html>', 'http://localhost/');
Object.assign(globalThis, domino.impl);
globalThis.window = win;
globalThis.document = win.document;
await import(pathToFileURL(req.resolve('@angular/compiler')).href);
const demo = await import(pathToFileURL(join(tmp, 'demo.mjs')).href);
const results = [];
for (const a of JSON.parse(args)) {
  try {
    results.push({args: a, result: await demo[fn](...a)});
  } catch (e) {
    results.push({args: a, error: String(e?.stack ?? e).split('\n').slice(0, 4).join(' / ')});
  }
}
rmSync(tmp, {recursive: true, force: true});
process.stdout.write('<<<JSON\n' + JSON.stringify({mode: mode ?? 'dev', file, fn, results}, null, 2) + '\nJSON>>>\n');

```

📄 `Node で動かした記録（開発モード）`

```
$ node record.mjs ~/angular-research/angular-deep-dive rtl-router-state.demo-state.ts runRtlRs '[...4 通り]'        # 開発モード
# 本番（最後に prod を付ける）でも、出力の JSON は mode の 1 行を除いて同じ

== strategy: （書かない）、org/:org の component: あり
  navigateByUrl('/org/acme/item/7?tab=a&tab=b#top') のあと
    葉 Route(url:'item/7', path:'item/:id')  params {"org":"acme","id":"7"}  data {"from":"item","leaf":true}  title "Org"
  navigateByUrl('/org/acme')（path: '' の子）のあと
    葉 Route(url:'', path:'')  params {"org":"acme"}  data {"from":"org","empty":true}  title "Org"
  葉を購読して :id を 7 → 8：params: 2 / paramMap: 2 / queryParams: 1 / data: 1 / url: 2 / fragment: 1 / title: 1（購読した瞬間の 1 回を含む）

== strategy: 'always'、org/:org の component: あり
  navigateByUrl('/org/acme/item/7?tab=a&tab=b#top') のあと
    葉 Route(url:'item/7', path:'item/:id')  params {"org":"acme","id":"7"}  data {"from":"item","leaf":true}  title "Org"
  navigateByUrl('/org/acme')（path: '' の子）のあと
    葉 Route(url:'', path:'')  params {"org":"acme"}  data {"from":"org","empty":true}  title "Org"
  葉を購読して :id を 7 → 8：params: 2 / paramMap: 2 / queryParams: 1 / data: 1 / url: 2 / fragment: 1 / title: 1（購読した瞬間の 1 回を含む）

== strategy: 'emptyOnly'、org/:org の component: あり
  navigateByUrl('/org/acme/item/7?tab=a&tab=b#top') のあと
    葉 Route(url:'item/7', path:'item/:id')  params {"id":"7"}  data {"from":"item","leaf":true}  title undefined
  navigateByUrl('/org/acme')（path: '' の子）のあと
    葉 Route(url:'', path:'')  params {"org":"acme"}  data {"from":"org","empty":true}  title "Org"
  葉を購読して :id を 7 → 8：params: 2 / paramMap: 2 / queryParams: 1 / data: 1 / url: 2 / fragment: 1 / title: 1（購読した瞬間の 1 回を含む）

== strategy: 'emptyOnly'、org/:org の component: なし
  navigateByUrl('/org/acme/item/7?tab=a&tab=b#top') のあと
    葉 Route(url:'item/7', path:'item/:id')  params {"org":"acme","id":"7"}  data {"from":"item","leaf":true}  title "Org"
  navigateByUrl('/org/acme')（path: '' の子）のあと
    葉 Route(url:'', path:'')  params {"org":"acme"}  data {"from":"org","empty":true}  title "Org"
  葉を購読して :id を 7 → 8：params: 2 / paramMap: 2 / queryParams: 1 / data: 1 / url: 2 / fragment: 1 / title: 1（購読した瞬間の 1 回を含む）
```

## テストと直し方

### spec と it

| ファイル（packages/router/test/ から） | describe › it（行） | 固めているもの |
| --- | --- | --- |
| `router_state.spec.ts` | `RouterState & Snapshot`（23）› `RouterStateSnapshot`（24）・`RouterState`（68）の各 5 本 | 4 節の 5 つの getter |
| `router_state.spec.ts` | `equalParamsAndUrlSegments`（112）› 154〜198 の 6 本 | 4 節の 623〜629 行目 |
| `router_state.spec.ts` | `advanceActivatedRoute`（209）› 238 | [2 つの木](../router/14-router-router-state.md)の 5 節 |
| `router_state.spec.ts` | `ActivatedRoute`（253）› 254 `should get resolved route title` | 3 節の 223 行目と、`ActivatedRouteSnapshot.title` |
| `regression_integration.spec.ts` | `duplicate navigation handling (#43447, #43446)`（331）› 396 | 1 節の `toString`（`toContain` だけ） |

📄 `angular/packages/router/test/router_state.spec.ts` L23–49 （▶ の行: 35, 37, 41, 46–47）

```ts
23 │ describe('RouterState & Snapshot', () => {
24 │   describe('RouterStateSnapshot', () => {
25 │     let state: RouterStateSnapshot;
26 │     let a: ActivatedRouteSnapshot;
27 │     let b: ActivatedRouteSnapshot;
28 │     let c: ActivatedRouteSnapshot;
29 │ 
30 │     beforeEach(() => {
31 │       a = createActivatedRouteSnapshot('a');
32 │       b = createActivatedRouteSnapshot('b');
33 │       c = createActivatedRouteSnapshot('c');
34 │ 
35 ▶       const root = new TreeNode(a, [new TreeNode(b, []), new TreeNode(c, [])]);
36 │ 
37 ▶       state = new (RouterStateSnapshot as any)('url', root);
38 │     });
39 │ 
40 │     it('should return first child', () => {
41 ▶       expect(state.root.firstChild).toBe(b);
42 │     });
43 │ 
44 │     it('should return children', () => {
45 │       const cc = state.root.children;
46 ▶       expect(cc[0]).toBe(b);
47 ▶       expect(cc[1]).toBe(c);
48 │     });
49 │ 
```

📄 `angular/packages/router/test/router_state.spec.ts` L112–129 （▶ の行: 114–116, 124–125, 127）

```ts
112 │   describe('equalParamsAndUrlSegments', () => {
113 │     function createSnapshot(params: Params, url: UrlSegment[]): ActivatedRouteSnapshot {
114 ▶       const snapshot = new (ActivatedRouteSnapshot as any)(
115 ▶         url,
116 ▶         params,
117 │         null,
118 │         null,
119 │         null,
120 │         null,
121 │         null,
122 │         null,
123 │         null,
124 ▶         -1,
125 ▶         null,
126 │       );
127 ▶       snapshot._routerState = new (RouterStateSnapshot as any)('', new TreeNode(snapshot, []));
128 │       return snapshot;
129 │     }
```

114〜126 行目は `ActivatedRouteSnapshot` のコンストラクタに 11 個の引数を渡しています。今のコンストラクタ（4 節の 2 つ目の引用の 414 行目から始まる）は 10 個で、10 個目は `environmentInjector` です。124 行目の `-1` がそこに入り、125 行目の `null` は余ります。`as any` で型の検査を外しているので通ります。`equalParamsAndUrlSegments` は `params` と `url` と親しか読まないので結果は変わりませんが、引数の並びは古い形のままです（253 行目からの it と 283 行目からの helper も同じ 11 個）。

📄 `angular/packages/router/test/router_state.spec.ts` L178–196 （▶ の行: 181, 185, 192, 195）

```ts
178 │     it('should return false when upstream params are different', () => {
179 │       const [snapshot1, snapshot2] = createSnapshotPairWithParent(
180 │         [{a: '1'}, {a: '1'}],
181 ▶         [{b: '1'}, {c: '1'}],
182 │         ['a', 'a'],
183 │       );
184 │ 
185 ▶       expect(equalParamsAndUrlSegments(snapshot1, snapshot2)).toEqual(false);
186 │     });
187 │ 
188 │     it('should return false when upstream urls are different', () => {
189 │       const [snapshot1, snapshot2] = createSnapshotPairWithParent(
190 │         [{a: '1'}, {a: '1'}],
191 │         [{b: '1'}, {b: '1'}],
192 ▶         ['a', 'b'],
193 │       );
194 │ 
195 ▶       expect(equalParamsAndUrlSegments(snapshot1, snapshot2)).toEqual(false);
196 │     });
```

📄 `angular/packages/router/test/router_state.spec.ts` L253–281 （▶ の行: 255–256, 271, 273, 278–279）

```ts
253 │   describe('ActivatedRoute', () => {
254 │     it('should get resolved route title', () => {
255 ▶       const data = {[RouteTitleKey]: 'resolved title'};
256 ▶       const route = createActivatedRoute('a');
257 │       const snapshot = new (ActivatedRouteSnapshot as any)(
258 │         [],
259 │         null,
260 │         null,
261 │         null,
262 │         data,
263 │         null,
264 │         'test',
265 │         null,
266 │         null,
267 │         -1,
268 │         null!,
269 │       );
270 │       let resolvedTitle: string | undefined;
271 ▶ 
272 │       route.data.next(data);
273 ▶ 
274 │       route.title.forEach((title: string | undefined) => {
275 │         resolvedTitle = title;
276 │       });
277 │ 
278 ▶       expect(resolvedTitle).toEqual('resolved title');
279 ▶       expect(snapshot.title).toEqual('resolved title');
280 │     });
281 │   });
```

📄 `angular/packages/router/test/regression_integration.spec.ts` L396–405 （▶ の行: 403）

```ts
396 │     it('works with a duplicate popstate/hashchange navigation (as seen in firefox)', async () => {
397 │       (location as any)._subject.next({'url': 'one', 'pop': true, 'type': 'popstate'});
398 │       await timeout(1);
399 │       (location as any)._subject.next({'url': 'one', 'pop': true, 'type': 'hashchange'});
400 │       await timeout(10);
401 │       await advance(fixture);
402 │ 
403 ▶       expect(router.routerState.toString()).toContain(`url:'one'`);
404 │       expect(fixture.nativeElement.innerHTML).toContain('one');
405 │     });
```

`toString` の形を固めているのは 403 行目の ``toContain(`url:'one'`)`` だけです。1 節の入れ子の形と空白、2 節の根の `url` の `['']`、5 節の「書かないときに親の data を継承する」を、`RouterState` の側から確かめる it は router\_state.spec.ts にありません（継承は recognize.spec.ts の L193 の it が snapshot で確かめています）。

### 手元で走らせた結果

📄 `走らせたコマンドと結果（2026-11-20、8576f161ae4）`

```
$ cd ~/angular-research/angular        # 8576f161ae4
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all "--test_arg=--filter=^RouterState & Snapshot "
Ran 18 of 1170 specs、18 specs, 0 failures（router_state.spec.ts の全部）
  --filter=duplicate navigation handling         Ran 2 of 1170 specs、0 failures（regression_integration.spec.ts L331 の describe。L396 の it を含む）
  --filter=paramsInheritanceStrategy|emptyOnly    Ran 6 of 1170 specs、0 failures（recognize.spec.ts など、it の名前にこの語があるもの）
```

### 直すとしたら

- 5 節の 309〜310 行目は、router\_state.ts の `getInherited` の doc コメントを「既定（`'always'`）では常に継承し、`'emptyOnly'` では自分が空のパスか親がコンポーネントを持たないときだけ」と書き直す形です。動きは変わらないので spec は要りません。
- 6 節の 47・517・375 行目も doc コメントだけです。`child.params.pipe(map(p => p['id']))`（47 行目）、`child.params['id']`（517 行目）、`route.snapshot.url.join('/')`（375 行目）の形にします。
- 2 節の根の `url` の食い違いを直すなら、router\_state.ts の `createEmptyState` の 79 行目を `new BehaviorSubject<UrlSegment[]>([])` にする形です。根の `ActivatedRoute.url` の最初の値が変わるので、router\_state.spec.ts に「`createEmptyState` の根の `url` の今の値と `snapshot.url` が同じ」を確かめる it を足し、router\_state.spec.ts の 300 行目の helper（同じ `[new UrlSegment('', {})]` を使う）も合わせます。
- specCreateSnapshot の 11 個の引数は、router\_state.spec.ts の 3 か所を今のコンストラクタの 10 個に合わせる形です。

## 聞かれそうな質問

**Q. router.routerState.toString() と router.routerState.snapshot.toString() は何が違いますか？**

同じです。69〜70 行目で `RouterState` は snapshot の `toString()` を返します。中身は 546〜548 行目の `serializeNode` が作る `Route(url:'…', path:'…') { 子 } ` の入れ子で、クエリとフラグメントは入りません。

**Q. 子のルートで親の :id が取れるのはなぜですか？ドキュメントには継承しないと書いてあるのに。**

297 行目の既定が `'always'` だからです（17d10f7a992、v22.0.0）。309〜310 行目の doc コメントは `'emptyOnly'` が既定だったころの文で、直されていません。`withRouterConfig({paramsInheritanceStrategy: 'emptyOnly'})` を書いたときだけ、その文のとおりになります。

**Q. paramMap を購読すると、毎回同じ ParamMap が届きますか？**

届きません。268 行目で値が流れるたびに `convertToParamMap` が新しいオブジェクトを作ります。Observable そのものは `??=` で 1 つです。`ActivatedRouteSnapshot.paramMap` の方は 1 回だけ作ってキャッシュします。

**Q. ルートのコンポーネントで inject(ActivatedRoute).url を購読すると何が届きますか？**

`[UrlSegment('')]` の 1 つだけで、そのあと値は流れません。79 行目の初めの値が `['']`、根の snapshot の `url` は 107 行目から `[]` のままで、`advanceActivatedRoute` は snapshot どうしを比べるからです。`route.snapshot.url` は `[]` です。

**Q. ActivatedRoute.title はどこから来ますか？**

223 行目、`data` の Subject を `map` して `data[RouteTitleKey]` を取り出したものです。`data` が親から継承されると、`title` も親の値になります（5 節の callout）。

## 読み終えて

- `RouterState.toString()` は snapshot の文字列。`serializeNode` の入れ子には URL のクエリもフラグメントも出ない。
- 最初の木は `createEmptyState`。根の `ActivatedRoute.url` は `['']` から変わらず、`snapshot.url` は `[]`。
- `url`・`params` などは `BehaviorSubject` そのもの、`title`・`paramMap` はそれを `map` したもの。`paramMap` は毎回新しい。
- 継承の既定は `'always'`。`getInherited` の doc コメントは `'emptyOnly'` のころのまま。
- `equalParamsAndUrlSegments` は先祖まで再帰し、`'paramsChange'` の判定になる。

---

← 前: [UrlTree・UrlSegment・ParamMap：URL の木の公開 API と、木の小道具](01-rtl-url-tree.md)  
次: [provideRouter と RouterModule の残り：RouterFeatures の型、初期ナビゲーションの組み合わせ、withX の doc と本番の動き](03-rtl-provide-router.md) →
