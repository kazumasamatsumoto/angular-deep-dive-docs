[目次](../README.md) › [Router の読み残し：UrlTree と RouterState の小道具・provideRouter の残り・Router クラス・読み込みとガードを行で埋める](README.md) › 第 5 回 / 全 6 回

# 読み込み・事前読み込み・再利用・関数ガード：小さな関数を行で埋める

> router\_config\_loader.ts（ROUTES・export された loadChildren・maybeResolveResources）・router\_preloader.ts（PreloadingStrategy・PreloadAllModules と NoPreloading・RouterPreloader）・route\_reuse\_strategy.ts（DetachedRouteHandle・destroyDetachedRouteHandle・BaseRouteReuseStrategy）・route\_injector\_cleanup.ts・utils/functional\_guards.ts（mapTo\*）・operators/check\_guards.ts・utils/config\_matching.ts の未読の行。親を保存したときの子の部品と注入器の扱いを作業木の spec で確かめる。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-load-guard)

---

遅延読み込み・事前読み込み・部品の再利用・ガードの 4 つは、本体の流れを[遅延読み込み](../router/11-router-lazy-loading.md)と[ガード](../router/12-router-guards.md)の章で読みました。この章は、その周りに残った小さな関数と宣言を 1 つずつ埋めます。`ROUTES` トークンの作り、`PreloadAllModules` と `NoPreloading` の 1 行の違い、`BaseRouteReuseStrategy` の既定の答え、`withAutoCleanupInjectors` の後片付けの歩き方、`mapToCanActivate` などの変換、空のパスの子を足す関数です。後片付けの節では、子を持つ親を保存したとき、子の部品と子の Route の注入器がいつ壊され、いつ作り直されるかを、作業木の spec で確かめます。

読む対象は `packages/router/src/` の `router_config_loader.ts`・`router_preloader.ts`・`route_reuse_strategy.ts`・`route_injector_cleanup.ts`・`utils/functional_guards.ts`・`operators/check_guards.ts`・`utils/config_matching.ts` です（../angular、8576f161ae4）。

1. [1. UrlTree・UrlSegment・ParamMap](01-rtl-url-tree.md)
2. [2. ActivatedRoute の Observable と継承](02-rtl-router-state.md)
3. [3. provideRouter と RouterModule の残り](03-rtl-provide-router.md)
4. [4. Router クラスと Navigation の型](04-rtl-router-class.md)
5. **5. 読み込み・事前読み込み・再利用・関数ガード**（この章）
6. [6. spec と issue](06-rtl-tests-issues.md)

## 1. router\_config\_loader.ts：ROUTES と、読んだ値の後始末

📄 `angular/packages/router/src/router_config_loader.ts` L9–27 （▶ の行: 10, 15–18, 25–26）

```ts
 9 │ import {
10 ▶   Compiler,
11 │   EnvironmentInjector,
12 │   inject,
13 │   InjectionToken,
14 │   Injector,
15 ▶   ɵmaybeUnwrapDefaultExport as maybeUnwrapDefaultExport,
16 ▶   NgModuleFactory,
17 ▶   ɵresolveComponentResources as resolveComponentResources,
18 ▶   runInInjectionContext,
19 │   Service,
20 │   Type,
21 │ } from '@angular/core';
22 │ 
23 │ import {standardizeConfig} from './components/empty_outlet';
24 │ import {LoadedRouterConfig, Route, Routes} from './models';
25 ▶ import {wrapIntoPromise} from './utils/collection';
26 ▶ import {assertStandalone, validateConfig} from './utils/config';
27 │ 
```

15 行目の `ɵmaybeUnwrapDefaultExport` と 17 行目の `ɵresolveComponentResources` は @angular/core の非公開の関数です。前者は「`'default'` というキーを持つオブジェクトなら、その値を取り出す」だけの関数で（core/src/util/default\_export.ts、中身は[遅延読み込み](../router/11-router-lazy-loading.md)の 4 節）、`loadChildren: () => import('./x.routes')` と `export default` の組み合わせはこれで動きます。25 行目の `wrapIntoPromise` は Observable なら `firstValueFrom`、それ以外は `Promise.resolve` に包む関数（utils/collection.ts L88〜93）で、`loadChildren` が配列をそのまま返しても、Observable を返しても同じに扱えます。10 行目の `Compiler` は NgModule のクラスが返ったとき `compileModuleAsync` するためで（L136）、26 行目の 2 つの検査は開発モードでだけ呼ばれます（L70・L161）。

📄 `angular/packages/router/src/router_config_loader.ts` L28–40 （▶ の行: 31, 33–34, 38–39）

```ts
28 │ /**
29 │  * The DI token for a router configuration.
30 │  *
31 ▶  * `ROUTES` is a low level API for router configuration via dependency injection.
32 │  *
33 ▶  * We recommend that in almost all cases to use higher level APIs such as `RouterModule.forRoot()`,
34 ▶  * `provideRouter`, or `Router.resetConfig()`.
35 │  *
36 │  * @publicApi
37 │  */
38 ▶ export const ROUTES = new InjectionToken<Route[][]>(
39 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'ROUTES' : '',
40 │ );
```

38 行目の型は `Route[][]`、配列の配列です。`provideRouter` も `RouterModule.forChild` も `multi: true` で 1 つずつ足すので、受け取る側が `.flat()` します（Router の L162、遅延の NgModule の L158）。足す側は[第 3 回](03-rtl-provide-router.md)にあります。39 行目の名前の付け方は `typeof ngDevMode !== 'undefined' && ngDevMode` で、ほかのトークン（たとえば route\_injector\_cleanup.ts の 21 行目、3 節）の `typeof ngDevMode === 'undefined' || ngDevMode` と逆です。`ngDevMode` が定義されていない環境では、こちらだけ名前が空になります。

📄 `angular/packages/router/src/router_config_loader.ts` L111–127 （▶ の行: 113–114, 117–119, 121）

```ts
111 │ }
112 │ 
113 ▶ /**
114 ▶  * Executes a `route.loadChildren` callback and converts the result to an array of child routes and
115 │  * an injector if that callback returned a module.
116 │  *
117 ▶  * This function is used for the route discovery during prerendering
118 ▶  * in @angular-devkit/build-angular. If there are any updates to the contract here, it will require
119 ▶  * an update to the extractor.
120 │  */
121 ▶ export async function loadChildren(
122 │   route: Route,
123 │   compiler: Compiler,
124 │   parentInjector: Injector,
125 │   onLoadEndListener?: (r: Route) => void,
126 │ ): Promise<LoadedRouterConfig> {
127 │   const loaded = await wrapIntoPromise(
```

121 行目の `loadChildren` は、`RouterConfigLoader` のメソッドとは別の、export された関数です。117〜119 行目は「@angular-devkit/build-angular の prerender の経路探しが使う」と書きますが、今これを呼んでいるのは angular-cli の `packages/angular/ssr/src/routes/ng-routes.ts`（L25で `ɵloadChildren as loadChildrenHelper` を import、L227で呼ぶ）です。private\_export.ts L11が `ɵloadChildren` として出しています。origin/main では cfad3f58543（2026-09-22）が、この関数に「google3 では root の環境の注入器で読む」引数を `g3-only` の印つきで足し、TODO に「v23 で @angular/build の経路探しも直す」と書いています。

📄 `angular/packages/router/src/router_config_loader.ts` L165–179 （▶ の行: 170, 172, 174, 178）

```ts
165 │ 
166 │ async function maybeResolveResources<T>(value: T): Promise<T> {
167 │   // In JIT mode we usually resolve the resources of components on bootstrap, however
168 │   // that won't have happened for lazy-loaded. Attempt to load any pending
169 │   // resources again here.
170 ▶   if ((typeof ngJitMode === 'undefined' || ngJitMode) && typeof fetch === 'function') {
171 │     try {
172 ▶       await resolveComponentResources(fetch);
173 │     } catch (error) {
174 ▶       console.error(error);
175 │     }
176 │   }
177 │ 
178 ▶   return value;
179 │ }
```

`loadComponent` と `loadChildren` の両方が、読んだ値をこの関数に通します（L65・L130）。170 行目の条件は「JIT で、`fetch` がある」で、AOT のビルド（このサイトも）は `ngJitMode` が `false` なので何もせず値を返します。JIT では `templateUrl` の部品を遅延で読んだとき、起動時には取りに行っていない HTML を 172 行目で取りに行きます。失敗は 174 行目で `console.error` するだけで、読み込みは止めません。660444fbf29（2025-08-08、#63062）で入りました。

## 2. router\_preloader.ts：2 つの戦略は 1 行ずつ

📄 `angular/packages/router/src/router_preloader.ts` L9–34 （▶ の行: 12, 14, 17, 32–33）

```ts
 9 │ import {
10 │   createEnvironmentInjector,
11 │   EnvironmentInjector,
12 ▶   Injectable,
13 │   OnDestroy,
14 ▶   Service,
15 │ } from '@angular/core';
16 │ import {from, Observable, of, Subscription} from 'rxjs';
17 ▶ import {catchError, concatMap, filter, mergeAll, mergeMap} from 'rxjs/operators';
18 │ 
19 │ import {Event, NavigationEnd} from './events';
20 │ import {LoadedRouterConfig, Route, Routes} from './models';
21 │ import {Router} from './router';
22 │ import {RouterConfigLoader} from './router_config_loader';
23 │ 
24 │ /**
25 │  * @description
26 │  *
27 │  * Provides a preloading strategy.
28 │  *
29 │  * @see [Preloading strategy](guide/routing/customizing-route-behavior#preloading-strategy)
30 │  * @publicApi
31 │  */
32 ▶ export abstract class PreloadingStrategy {
33 ▶   abstract preload(route: Route, fn: () => Observable<any>): Observable<any>;
34 │ }
```

📄 `angular/packages/router/src/router_preloader.ts` L36–67 （▶ の行: 42, 48, 50, 61, 63–64）

````ts
36 │ /**
37 │  * @description
38 │  *
39 │  * Provides a preloading strategy that preloads all modules as quickly as possible.
40 │  *
41 │  * ```ts
42 ▶  * RouterModule.forRoot(ROUTES, {preloadingStrategy: PreloadAllModules})
43 │  * ```
44 │  *
45 │  * ```ts
46 │  * export const appConfig: ApplicationConfig = {
47 │  * providers: [
48 ▶  *   provideRouter(
49 │  *     routes,
50 ▶  *     withPreloading(PreloadAllModules)
51 │  *   )
52 │  * ]
53 │  * };
54 │  * ```
55 │  *
56 │  *
57 │  * @see [Preloading strategy](guide/routing/customizing-route-behavior#preloading-strategy)
58 │  *
59 │  * @publicApi
60 │  */
61 ▶ @Service()
62 │ export class PreloadAllModules implements PreloadingStrategy {
63 ▶   preload(route: Route, fn: () => Observable<any>): Observable<any> {
64 ▶     return fn().pipe(catchError(() => of(null)));
65 │   }
66 │ }
67 │ 
````

📄 `angular/packages/router/src/router_preloader.ts` L78–97 （▶ の行: 79, 81–82, 90–92, 94）

```ts
78 │  */
79 ▶ @Service()
80 │ export class NoPreloading implements PreloadingStrategy {
81 ▶   preload(route: Route, fn: () => Observable<any>): Observable<any> {
82 ▶     return of(null);
83 │   }
84 │ }
85 │ 
86 │ /**
87 │  * The preloader optimistically loads all router configurations to
88 │  * make navigations into lazily-loaded sections of the application faster.
89 │  *
90 ▶  * The preloader runs in the background. When the router bootstraps, the preloader
91 ▶  * starts listening to all navigation events. After every such event, the preloader
92 ▶  * will check if any configurations can be loaded lazily.
93 │  *
94 ▶  * If a route is protected by `canLoad` guards, the preloaded will not load it.
95 │  *
96 │  * @publicApi
97 │  */
```

33 行目の `preload(route, fn)` の `fn` は「呼べば読み込みが始まる Observable を返す関数」で、戦略は呼ぶか呼ばないかを決めます。64 行目の `PreloadAllModules` はすぐ `fn()` を呼び、エラーは `catchError` で `null` にして握りつぶします。82 行目の `NoPreloading` は `fn` を呼ばずに `of(null)` を返すだけです。L73は `NoPreloading` を「既定で有効」と書きますが、`withPreloading` を付けないと `RouterPreloader` 自体が作られず（provide\_router.ts の L585〜586と L290、[第 3 回](03-rtl-provide-router.md)）、`NoPreloading` も注入されません。既定の振る舞いが「読み込まない」のは同じですが、動いている物は違います。42 行目の例の `ROUTES` は、1 節の `ROUTES` トークンと同じ名前の変数で、origin/main では ef4f80ad4f6（2026-11-05）が `routes` に直しています。

90〜92 行目の説明は「すべてのナビゲーションのイベントを聞き、そのたびに調べる」と書きますが、`setUpPreloading`（L109〜116、[遅延読み込み](../router/11-router-lazy-loading.md)の 6 節）は `NavigationEnd` だけを `filter` し、`concatMap` で 1 回ずつ順に `preload()` します。94 行目の「the preloaded will not load it」は preloader の書き違いです。12 行目の `Injectable` は L98の `RouterPreloader` のためだけに残っていて、2 つの戦略は 14 行目の `Service` です。`RouterPreloader` は今もコンストラクタの引数で注入する古い形です（L102〜107）。

📄 `angular/packages/router/src/router_preloader.ts` L118–126 （▶ の行: 119, 123–124）

```ts
118 │   preload(): Observable<any> {
119 ▶     return this.processRoutes(this.injector, this.router.config);
120 │   }
121 │ 
122 │   /** @docs-private */
123 ▶   ngOnDestroy(): void {
124 ▶     this.subscription?.unsubscribe();
125 │   }
126 │ 
```

119 行目の `preload()` は公開のメソッドで、`router.config` の全体を `processRoutes` に渡します（1 本ずつの判定は[遅延読み込み](../router/11-router-lazy-loading.md)の 6 節）。spec は `NavigationEnd` を待たずにこれを直接呼んで確かめます（テストの節）。124 行目の `ngOnDestroy` は購読を外すだけで、読み込みの途中の Promise は止めません。`preloadConfig` の中の `injector.destroyed` の検査（L168）が、そのあとの読み込みを止めます。

> **🧪 DEMO 1 — PreloadAllModules と NoPreloading で、いつ読み込まれるか**
>
> 押すたびに `createApplication` で別のアプリを作り、`provideRouter(routes, withPreloading(…))` の本物を動かします。ルートは `'lazy'`（`loadChildren` が `Promise.resolve({default: routes})`）、`'cmp'`（`loadComponent`）、`'guarded'`（`canLoad` つきの `loadChildren`）です。ネットワークは使いません。`appRef.bootstrap` でルートの部品を文書に付けない div に作ると、`APP_BOOTSTRAP_LISTENER` が最初のナビゲーションと `setUpPreloading` を呼びます。40 ms 待ってから 3 つの URL へ順に移り、時刻は bootstrap からの ms です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-load-guard)

`PreloadAllModules` では、最初の `NavigationEnd('/')` の直後に `'lazy'` の `loadChildren()` と `'cmp'` の `loadComponent()` が呼ばれ、`'guarded'` は呼ばれません（`canLoad` があるルートは事前読み込みしない、L153〜158の条件）。そのあと `navigateByUrl('/lazy')` しても、読み込み済み（`_loadedRoutes`）なので 2 回目は呼ばれません。`NoPreloading` では、移動したときに初めて呼ばれます。`'guarded'` はどちらの戦略でも、移動したときに `canLoad` → `loadChildren()` の順です。`RouteConfigLoadStart` / `End` は、`loadChildren` でも `loadComponent` でも、事前読み込みでも移動でも出ます。どれも `RouterConfigLoader` の `onLoadStartListener`（L57〜58・L89〜90）を通り、そのリスナーを入れるのは `NavigationTransitions` のコンストラクタ（navigation\_transition.ts L396〜399）だからです。

## 3. 再利用の戦略と、注入器の後片付け

📄 `angular/packages/router/src/route_reuse_strategy.ts` L9–32 （▶ の行: 21–22, 26, 28, 30–32）

```ts
 9 │ import {ComponentRef, inject, Service} from '@angular/core';
10 │ 
11 │ import {Route} from './models';
12 │ import {OutletContext} from './router_outlet_context';
13 │ import {ActivatedRoute, ActivatedRouteSnapshot} from './router_state';
14 │ import {TreeNode} from './utils/tree';
15 │ 
16 │ /**
17 │  * @description
18 │  *
19 │  * Represents the detached route tree.
20 │  *
21 ▶  * This is an opaque value the router will give to a custom route reuse strategy
22 ▶  * to store and retrieve later on.
23 │  *
24 │  * @publicApi
25 │  */
26 ▶ export type DetachedRouteHandle = {};
27 │ 
28 ▶ /** @internal */
29 │ export type DetachedRouteHandleInternal = {
30 ▶   contexts: Map<string, OutletContext>;
31 ▶   componentRef: ComponentRef<any>;
32 ▶   route: TreeNode<ActivatedRoute>;
```

📄 `angular/packages/router/src/route_reuse_strategy.ts` L34–54 （▶ の行: 40–41, 45, 48–51）

```ts
34 │ 
35 │ /**
36 │  * @description
37 │  *
38 │  * Destroys the component associated with a `DetachedRouteHandle`.
39 │  *
40 ▶  * This function should be used when a `RouteReuseStrategy` decides to drop a stored handle
41 ▶  * and wants to ensure that the component is destroyed.
42 │  *
43 │  * @param handle The detached route handle to destroy.
44 │  *
45 ▶  * @publicApi 22.2
46 │  * @see [Manually destroying detached route handles](guide/routing/customizing-route-behavior#manually-destroying-detached-route-handles)
47 │  */
48 ▶ export function destroyDetachedRouteHandle(handle: DetachedRouteHandle): void {
49 ▶   const internalHandle = handle as DetachedRouteHandleInternal;
50 ▶   if (internalHandle && internalHandle.componentRef) {
51 ▶     internalHandle.componentRef.destroy();
52 │     // It is critical to destroy the `_localInjector` here. When a route is detached
53 │     // by the `RouteReuseStrategy`, the `_localInjector` is retained because the
54 │     // ActivatedRoute object is stored and can be attached later.
```

26 行目の `DetachedRouteHandle` は公開の型としては `{}`、中を見せない値です。実体は 28〜32 行目の内部の型で、子の outlet の文脈（`contexts`）・部品（`componentRef`）・`ActivatedRoute` の木の節（`route`）を持ちます。保存されるのはその Route の部品 1 つと、木の節と、子の outlet の文脈です。子の部品は、保存の前に壊されます（3 節）。45 行目の `destroyDetachedRouteHandle` は 22.2 で公開された関数で、戦略が handle を捨てるときに部品を壊すためのものです（51 行目、続きの L57で ActivatedRoute の `_localInjector` も壊す）。5edceffd043（2026-01-05）で後片付けの仕組みと一緒に入りました。

📄 `angular/packages/router/src/route_reuse_strategy.ts` L108–132 （▶ の行: 112–113, 117, 119, 126, 131–132）

```ts
108 │ 
109 │ /**
110 │  * @description
111 │  *
112 ▶  * This base route reuse strategy only reuses routes when the matched router configs are
113 ▶  * identical. This prevents components from being destroyed and recreated
114 │  * when just the route parameters, query parameters or fragment change
115 │  * (that is, the existing component is _reused_).
116 │  *
117 ▶  * This strategy does not store any routes for later reuse.
118 │  *
119 ▶  * Angular uses this strategy by default.
120 │  *
121 │  *
122 │  * It can be used as a base class for custom route reuse strategies, i.e. you can create your own
123 │  * class that extends the `BaseRouteReuseStrategy` one.
124 │  * @publicApi
125 │  */
126 ▶ export abstract class BaseRouteReuseStrategy implements RouteReuseStrategy {
127 │   /**
128 │    * Whether the given route should detach for later reuse.
129 │    * Always returns false for `BaseRouteReuseStrategy`.
130 │    * */
131 ▶   shouldDetach(route: ActivatedRouteSnapshot): boolean {
132 ▶     return false;
```

`BaseRouteReuseStrategy` は 131〜132 行目のとおり何も保存しません。再利用の判定は `shouldReuseRoute` の `future.routeConfig === curr.routeConfig`（L156）で、112〜115 行目の「同じ Route の設定ならパラメータが変わっても部品を作り直さない」の中身です。119 行目の「既定で使う」は、抽象クラス `RouteReuseStrategy` の `@Service({factory: () => inject(DefaultRouteReuseStrategy)})`（L68）と、中身の無い `DefaultRouteReuseStrategy extends BaseRouteReuseStrategy`（L172〜173）の 2 行で実現しています（宣言と各メソッドを呼ぶ側は[RouterOutlet の detach / attach](../rdir/03-rdir-outlet.md)と[ActivateRoutes](../router/15-router-activate-routes.md)）。既定の `shouldDestroyInjector` は `true` を返します（L167〜169、[遅延の NgModule](../ngmodule/15-ngmodule-lazy-module.md)の引用の中）。

📄 `angular/packages/router/src/route_injector_cleanup.ts` L9–23 （▶ の行: 18, 20–21）

```ts
 9 │ import {InjectionToken} from '@angular/core';
10 │ 
11 │ import {Route, Routes} from './models';
12 │ import {DetachedRouteHandleInternal, RouteReuseStrategy} from './route_reuse_strategy';
13 │ import {ActivatedRouteSnapshot, RouterState} from './router_state';
14 │ 
15 │ /**
16 │  * @description
17 │  *
18 ▶  * Cleans up `EnvironmentInjector`s assigned to `Route`s that are no longer in use.
19 │  */
20 ▶ export const ROUTE_INJECTOR_CLEANUP = new InjectionToken<typeof routeInjectorCleanup>(
21 ▶   typeof ngDevMode === 'undefined' || ngDevMode ? 'RouteInjectorCleanup' : '',
22 │ );
23 │ 
```

📄 `angular/packages/router/src/route_injector_cleanup.ts` L50–87 （▶ の行: 51, 53, 56–57, 69, 71–73, 76–77, 79–80）

```ts
50 │ 
51 ▶ function collectDescendants(snapshot: ActivatedRouteSnapshot, activeRoutes: Set<Route>) {
52 │   if (snapshot.routeConfig) {
53 ▶     activeRoutes.add(snapshot.routeConfig);
54 │   }
55 │ 
56 ▶   for (const child of snapshot.children) {
57 ▶     collectDescendants(child, activeRoutes);
58 │   }
59 │ }
60 │ 
61 │ function destroyUnusedInjectors(
62 │   routes: Routes,
63 │   activeRoutes: Set<Route>,
64 │   strategy: RouteReuseStrategy,
65 │   inheritedForceDestroy: boolean,
66 │ ) {
67 │   for (const route of routes) {
68 │     const shouldDestroyCurrentRoute =
69 ▶       inheritedForceDestroy ||
70 │       !!(
71 ▶         (route._injector || route._loadedInjector) &&
72 ▶         !activeRoutes.has(route) &&
73 ▶         (strategy.shouldDestroyInjector?.(route) ?? false)
74 │       );
75 │ 
76 ▶     if (route.children) {
77 ▶       destroyUnusedInjectors(route.children, activeRoutes, strategy, shouldDestroyCurrentRoute);
78 │     }
79 ▶     if (route.loadChildren && route._loadedRoutes) {
80 ▶       destroyUnusedInjectors(
81 │         route._loadedRoutes,
82 │         activeRoutes,
83 │         strategy,
84 │         shouldDestroyCurrentRoute,
85 │       );
86 │     }
87 │ 
```

1. **呼ばれるとき**

   20 行目のトークンに値が入るのは `withAutoCleanupInjectors()` を付けたときだけで、`Router` は `NavigationEnd` のたびに `injectorCleanup?.(routeReuseStrategy, routerState, config)` を呼びます（[第 4 回](04-rtl-router-class.md)の 2 節、router.ts L212）。
2. **使っている Route を集める（51〜59 行目と L29〜46）**

   今の木は 51〜59 行目の `collectDescendants` で根から**子孫のすべて**を集めます。保存された handle の方は、L36〜45で `retrieveStoredRouteHandles()` の各 handle の `snapshot.pathFromRoot`、つまり**その Route と祖先だけ**を集めます（本体は[ActivateRoutes](../router/15-router-activate-routes.md)の引用の中）。
3. **config を上から歩く（67〜86 行目）**

   71〜73 行目の 3 つ（注入器がある・集めた中に無い・`shouldDestroyInjector` が `true`）が揃うか、69 行目のとおり親が壊されるなら、その Route の注入器を壊します（L88〜97）。76〜85 行目で `children` と、読み込み済みの `_loadedRoutes` に同じことをします。

「祖先だけ」で足りるのは、保存した handle が子の部品を持っていないからです。親を保存するとき、`detachAndStoreRouteSubtree`（operators/activate\_routes.ts L96〜117、[ActivateRoutes](../router/15-router-activate-routes.md)の引用の中）は、親の部品を outlet から外す前に、子を `deactivateRouteAndItsChildren` で壊します（L104〜106）。付け直すときは、`createRouterState` が保存した木の `children` を新しく作り直します（create\_router\_state.ts L52〜54）。そのため、親を保存したあと子の Route の `_injector` が 71〜73 行目の条件で壊されても、それを使う部品はもう無く、戻ったときに recognize が新しい注入器を作ります。設計の文書（packages/router/docs/injector\_cleanup.md）のL62の「保存されたものは `pathFromRoot` を集め、祖先を守る」は、この形に合っています。テストの節の作業木の spec で、親を保存した場合を確かめます。子そのものを保存したとき（route\_injector\_cleanup.spec.ts の 230 行目の it）は、子が `pathFromRoot` の終わりにいるので注入器が残ります。

## 4. functional\_guards.ts：クラスのガードを関数に変える

📄 `angular/packages/router/src/utils/functional_guards.ts` L9–40 （▶ の行: 28, 33–37）

```ts
 9 │ import {inject, Type} from '@angular/core';
10 │ 
11 │ import {
12 │   CanActivate,
13 │   CanActivateChild,
14 │   CanActivateChildFn,
15 │   CanActivateFn,
16 │   CanDeactivate,
17 │   CanDeactivateFn,
18 │   CanMatch,
19 │   CanMatchFn,
20 │   Resolve,
21 │   ResolveFn,
22 │ } from '../models';
23 │ 
24 │ /**
25 │  * Maps an array of injectable classes with canMatch functions to an array of equivalent
26 │  * `CanMatchFn` for use in a `Route` definition.
27 │  *
28 ▶  * Usage {@example router/utils/functional_guards.ts region='CanActivate'}
29 │  *
30 │  * @publicApi
31 │  * @see {@link Route}
32 │  */
33 ▶ export function mapToCanMatch(providers: Array<Type<CanMatch>>): CanMatchFn[] {
34 ▶   return providers.map(
35 ▶     (provider) =>
36 ▶       (...params) =>
37 ▶         inject(provider).canMatch(...params),
38 │   );
39 │ }
40 │ 
```

📄 `angular/packages/router/src/utils/functional_guards.ts` L57–92 （▶ の行: 61, 66, 69, 72, 79, 84, 87, 90）

```ts
57 │ /**
58 │  * Maps an array of injectable classes with canActivateChild functions to an array of equivalent
59 │  * `CanActivateChildFn` for use in a `Route` definition.
60 │  *
61 ▶  * Usage {@example router/utils/functional_guards.ts region='CanActivate'}
62 │  *
63 │  * @publicApi
64 │  * @see {@link Route}
65 │  */
66 ▶ export function mapToCanActivateChild(
67 │   providers: Array<Type<CanActivateChild>>,
68 │ ): CanActivateChildFn[] {
69 ▶   return providers.map(
70 │     (provider) =>
71 │       (...params) =>
72 ▶         inject(provider).canActivateChild(...params),
73 │   );
74 │ }
75 │ /**
76 │  * Maps an array of injectable classes with canDeactivate functions to an array of equivalent
77 │  * `CanDeactivateFn` for use in a `Route` definition.
78 │  *
79 ▶  * Usage {@example router/utils/functional_guards.ts region='CanActivate'}
80 │  *
81 │  * @publicApi
82 │  * @see {@link Route}
83 │  */
84 ▶ export function mapToCanDeactivate<T = unknown>(
85 │   providers: Array<Type<CanDeactivate<T>>>,
86 │ ): CanDeactivateFn<T>[] {
87 ▶   return providers.map(
88 │     (provider) =>
89 │       (...params) =>
90 ▶         inject(provider).canDeactivate(...params),
91 │   );
92 │ }
```

4 つの `mapTo*` は同じ形です。クラスの配列を `map` して、クラスごとに `(...params) => inject(provider).canXxx(...params)` という関数を 1 つ作ります（37・72・90 行目、`mapToCanActivate` は[ガード](../router/12-router-guards.md)の章の引用の中の L50〜55）。返るのは関数なので、ガードを走らせる側（check\_guards.ts の `runCanActivate` など）は `isCanActivate(guard)` が偽になる道を通り、`runInInjectionContext(closestInjector, …)` の中で呼びます。`inject(provider)` はその注入器から引くので、クラスは `providedIn: 'root'` か、Route の `providers` にある必要があります。クラスを直接 `canActivate: [AdminGuard]` と書く形は models.ts L108の `DeprecatedGuard`（`@deprecated`）で、これらはその移行のための関数です。455c7285257（2022-11-02、#48709）で入りました。

28・45・61・79 行目の使い方の例は、4 つとも `region='CanActivate'` を指しています。packages/examples/router/utils/functional\_guards.ts にある region は `CanActivate`（L12〜24）と `Resolve`（L26〜40）の 2 つだけなので、`mapToCanMatch`・`mapToCanActivateChild`・`mapToCanDeactivate` の説明にも `mapToCanActivate` の例が出ます。origin/main でも同じです。

📄 `angular/packages/router/src/operators/check_guards.ts` L20–55 （▶ の行: 28, 37, 42, 49, 53–54）

```ts
20 │ import {concatMap, first, map, mergeMap, tap} from 'rxjs/operators';
21 │ 
22 │ import {ActivationStart, ChildActivationStart, Event} from '../events';
23 │ import {
24 │   CanActivateChildFn,
25 │   CanActivateFn,
26 │   CanDeactivateFn,
27 │   GuardResult,
28 ▶   CanLoadFn,
29 │   CanMatchFn,
30 │   Route,
31 │   PartialMatchRouteSnapshot,
32 │ } from '../models';
33 │ import {redirectingNavigationError} from '../navigation_canceling_error';
34 │ import type {NavigationTransition} from '../navigation_transition';
35 │ import type {ActivatedRouteSnapshot, RouterStateSnapshot} from '../router_state';
36 │ import {UrlSegment, UrlSerializer} from '../url_tree';
37 ▶ import {wrapIntoObservable} from '../utils/collection';
38 │ import {
39 │   CanActivate,
40 │   CanDeactivate,
41 │   getCanActivateChild,
42 ▶   getTokenOrFunctionIdentity,
43 │ } from '../utils/preactivation';
44 │ import {
45 │   isBoolean,
46 │   isCanActivate,
47 │   isCanActivateChild,
48 │   isCanDeactivate,
49 ▶   isCanLoad,
50 │   isCanMatch,
51 │ } from '../utils/type_guards';
52 │ 
53 ▶ import {prioritizedGuardValue} from './prioritized_guard_value';
54 ▶ import {takeUntilAbort} from '../utils/abort_signal_to_observable';
55 │ 
```

📄 `angular/packages/router/src/operators/check_guards.ts` L112–120 （▶ の行: 114, 116–117）

```ts
112 │ 
113 │ /**
114 ▶  * This should fire off `ActivationStart` events for each route being activated at this
115 │  * level.
116 ▶  * In other words, if you're activating `a` and `b` below, `path` will contain the
117 ▶  * `ActivatedRouteSnapshot`s for both and we will fire `ActivationStart` for both. Always
118 │  * return
119 │  * `true` so checks continue to run.
120 │  */
```

📄 `angular/packages/router/src/operators/check_guards.ts` L130–148 （▶ の行: 139, 143–144, 146）

```ts
130 │ 
131 │ /**
132 │  * This should fire off `ChildActivationStart` events for each route being activated at this
133 │  * level.
134 │  * In other words, if you're activating `a` and `b` below, `path` will contain the
135 │  * `ActivatedRouteSnapshot`s for both and we will fire `ChildActivationStart` for both. Always
136 │  * return
137 │  * `true` so checks continue to run.
138 │  */
139 ▶ function fireChildActivationStart(
140 │   snapshot: ActivatedRouteSnapshot | null,
141 │   forwardEvent?: (evt: Event) => void,
142 │ ): Observable<boolean> {
143 ▶   if (snapshot !== null && forwardEvent) {
144 ▶     forwardEvent(new ChildActivationStart(snapshot));
145 │   }
146 ▶   return of(true);
147 │ }
148 │ 
```

42 行目の `getTokenOrFunctionIdentity` が、ガードの配列の 1 つを「注入器から引いた物」か「関数そのもの」にします。53 行目の `prioritizedGuardValue` は配列の結果を 1 つにする演算子（[ガード](../router/12-router-guards.md)の章の 5 節）、54 行目の `takeUntilAbort` は `abort()` で止めるためのものです。49 行目の `isCanLoad` と 28 行目の `CanLoadFn` は `canLoad` のためで、origin/main では 574e5d76ea6（2026-09-11）が google3 の中で `canLoad` を使わせないための書き換えを入れています。139〜147 行目の `fireChildActivationStart` は、親の snapshot が `null` でなく、`forwardEvent` が渡されたときだけイベントを出し、いつも `of(true)` を返します。114〜117 行目の説明は「この段で有効になる `a` と `b` の両方に出す」と書きますが、関数が受けるのは 1 つの snapshot で、複数に出すのは呼ぶ側の `concatMap`（L93〜111）です。

> **🧪 DEMO 2 — mapToCanActivate のガードが呼ばれる順**
>
> `'edit'`（`canDeactivate` に `RtlLgGuardLeave`）にいる状態から、`'admin/x'` へ移ります。`'admin'` は `canActivate: mapToCanActivate([RtlLgGuardA, RtlLgGuardB])` と、`canActivateChild` に `RtlLgGuardChild` を持ちます。`canDeactivate` と `canActivateChild` は、`mapToCanDeactivate` / `mapToCanActivateChild` が作るのと同じ形の関数（`(...) => inject(クラス).canXxx(...)`）を手で書いています。この 2 つも import すると、3 つの関数の行（約 0.2 kB）が、このサイトの最初に読む JS の共有の部分に入るからです。ガードのクラスは `providedIn: 'root'` で、`RtlLgGuardB` は 10 ms 待ってから答えます。記録は `router.events` の `GuardsCheckStart`・`ChildActivationStart`・`ActivationStart`・`GuardsCheckEnd` と、各ガードの中で書いた行です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-load-guard)

最初に `RtlLgGuardLeave.canDeactivate('edit')` が呼ばれ、そのあと `'admin'` の段で `ChildActivationStart('')`（親は根）→ `ActivationStart('admin')` → `RtlLgGuardA` → `RtlLgGuardB` です。A と B は同じ配列の中なので、両方がすぐに呼ばれ（`runCanActivate` が配列を 1 つの `prioritizedGuardValue` にまとめる）、B の 10 ms を待ってから次の段へ進みます。B が `true` なら `'x'` の段に進み、`ChildActivationStart('admin')` → `ActivationStart('x')` → `RtlLgGuardChild.canActivateChild('x')`（親の `canActivateChild` は子の snapshot を受ける）です。B が `false` なら `'x'` の段に入らず、`RtlLgGuardChild` は呼ばれません。ガードのインスタンスは、最初に呼ばれたときの `inject` で 1 つずつ作られます。

## 5. config\_matching.ts：一致の結果と、空のパスの子

📄 `angular/packages/router/src/utils/config_matching.ts` L21–53 （▶ の行: 21, 23–26, 29, 37, 40, 49–50）

```ts
21 ▶ export interface MatchResult {
22 │   matched: boolean;
23 ▶   consumedSegments: UrlSegment[];
24 ▶   remainingSegments: UrlSegment[];
25 ▶   parameters: {[k: string]: string};
26 ▶   positionalParamSegments: {[k: string]: UrlSegment};
27 │ }
28 │ 
29 ▶ const noMatch: MatchResult = {
30 │   matched: false,
31 │   consumedSegments: [],
32 │   remainingSegments: [],
33 │   parameters: {},
34 │   positionalParamSegments: {},
35 │ };
36 │ 
37 ▶ export function createPreMatchRouteSnapshot(
38 │   snapshot: ActivatedRouteSnapshot,
39 │ ): PartialMatchRouteSnapshot {
40 ▶   return {
41 │     routeConfig: snapshot.routeConfig,
42 │     url: snapshot.url,
43 │     params: snapshot.params,
44 │     queryParams: snapshot.queryParams,
45 │     fragment: snapshot.fragment,
46 │     data: snapshot.data,
47 │     outlet: snapshot.outlet,
48 │     title: snapshot.title,
49 ▶     paramMap: snapshot.paramMap,
50 ▶     queryParamMap: snapshot.queryParamMap,
51 │   };
52 │ }
53 │ 
```

21〜27 行目の `MatchResult` は `match`（[recognize](../router/09-router-recognize.md)の章）が返す形で、29〜35 行目の `noMatch` は一致しなかったときの値です。`match` は `{...noMatch}` とコピーして返すので、受け取った側が書き換えても共有の値は変わりません。37〜52 行目の `createPreMatchRouteSnapshot` は、`canMatch` のガードと `redirectTo` の関数に渡す 3 番目の引数（`PartialMatchRouteSnapshot`、models.ts L1245）を作ります。`ActivatedRouteSnapshot` から 10 の項目だけを取り出したオブジェクトで、`firstChild` や `children` はまだ無いので入りません。b51bab583d8（2026-01-02）で入りました。

📄 `angular/packages/router/src/utils/config_matching.ts` L162–194 （▶ の行: 171–173, 176, 184, 187–189）

```ts
162 │ 
163 │ function addEmptyPathsToChildrenIfNeeded(
164 │   segmentGroup: UrlSegmentGroup,
165 │   slicedSegments: UrlSegment[],
166 │   routes: Route[],
167 │   children: {[name: string]: UrlSegmentGroup},
168 │ ): {[name: string]: UrlSegmentGroup} {
169 │   const res: {[name: string]: UrlSegmentGroup} = {};
170 │   for (const r of routes) {
171 ▶     if (emptyPathMatch(segmentGroup, slicedSegments, r) && !children[getOutlet(r)]) {
172 ▶       const s = new UrlSegmentGroup([], {});
173 ▶       res[getOutlet(r)] = s;
174 │     }
175 │   }
176 ▶   return {...children, ...res};
177 │ }
178 │ 
179 │ function createChildrenForEmptyPaths(
180 │   routes: Route[],
181 │   primarySegment: UrlSegmentGroup,
182 │ ): {[name: string]: UrlSegmentGroup} {
183 │   const res: {[name: string]: UrlSegmentGroup} = {};
184 ▶   res[PRIMARY_OUTLET] = primarySegment;
185 │ 
186 │   for (const r of routes) {
187 ▶     if (r.path === '' && getOutlet(r) !== PRIMARY_OUTLET) {
188 ▶       const s = new UrlSegmentGroup([], {});
189 ▶       res[getOutlet(r)] = s;
190 │     }
191 │   }
192 │   return res;
193 │ }
194 │ 
```

📄 `angular/packages/router/src/utils/config_matching.ts` L195–226 （▶ の行: 203, 207–208, 214–215, 224）

```ts
195 │ function containsEmptyPathMatchesWithNamedOutlets(
196 │   segmentGroup: UrlSegmentGroup,
197 │   slicedSegments: UrlSegment[],
198 │   routes: Route[],
199 │   outlet?: string,
200 │ ): boolean {
201 │   return routes.some((r) => {
202 │     // 1. Can this route match as an empty path?
203 ▶     const matchesEmpty = emptyPathMatch(segmentGroup, slicedSegments, r);
204 │     if (!matchesEmpty) return false;
205 │ 
206 │     // 2. Is this a named outlet? (We only pull in empty paths if they are named outlets).
207 ▶     const isNamedOutlet = getOutlet(r) !== PRIMARY_OUTLET;
208 ▶     if (!isNamedOutlet) return false;
209 │ 
210 │     // 3. Are we already processing this outlet? If so, we ignore it as a pull-in
211 │     // candidate. For example, if we are evaluating the 'secondary' outlet, we shouldn't
212 │     // "pull in" an empty 'secondary' group.  We should let standard
213 │     // segment matching handle it (which looks at the actual characters in the URL).
214 ▶     const isSelfEvaluating = outlet !== undefined && getOutlet(r) === outlet;
215 ▶     return !isSelfEvaluating;
216 │   });
217 │ }
218 │ 
219 │ function containsEmptyPathMatches(
220 │   segmentGroup: UrlSegmentGroup,
221 │   slicedSegments: UrlSegment[],
222 │   routes: Route[],
223 │ ): boolean {
224 ▶   return routes.some((r) => emptyPathMatch(segmentGroup, slicedSegments, r));
225 │ }
226 │ 
```

この 4 つは `split`（L124〜161、[recognize](../router/09-router-recognize.md)の章）の部品です。`split` は「URL の残りがあり、空のパスの名前つき outlet がある」と「URL の残りが無く、空のパスのルートがある」の 2 つの場合に、`UrlSegmentGroup` の `children` を作り直します。1 つ目では 179〜193 行目の `createChildrenForEmptyPaths` が、残りを `primary` に入れ（184 行目）、空のパスの名前つき outlet ごとに空のグループを足します（187〜189 行目）。2 つ目では 163〜177 行目の `addEmptyPathsToChildrenIfNeeded` が、まだ無い outlet だけ空のグループを足します（171 行目の `!children[getOutlet(r)]`）。195〜216 行目の判定は 3 段で、214 行目の `isSelfEvaluating` は「いま調べている outlet と同じ名前の空のパスは引き込まない」です。この段は daa9b2a9d67（2026-03-23）で `outlet` を受けるようになり、origin/main でも 5048f502683（2026-09-29）が `split` の近くを直しています。

## テストと直し方

### spec と it

| ファイル（packages/router/test/） | describe › it（行） | 確かめていること | この章 |
| --- | --- | --- | --- |
| `router_preloader.spec.ts` | `RouterPreloader`（47）› `configurations with canLoad guard`（76）› 101・112 | canLoad があると読まず、戦略の `preload` も呼ばない | 2 節 |
| `router_preloader.spec.ts` | `should properly handle`（55）› 68 `being destroyed before expected`・`should ignore errors`（611）› 634 | `ngOnDestroy` が投げない、エラーを握りつぶす | 2 節 |
| `router_preloader.spec.ts` | `should preload loadComponent configs`（716）› 731・773・795・824・875 | `loadComponent` の事前読み込み | DEMO 1 |
| `route_injector_cleanup.spec.ts` | `Route Injector Destruction`（26）› 147・164・194・210・230・256・278・307・333・376 | 後片付けの 10 本。保存した**子**とその親（230）、親を壊すと子も（256・278） | 3 節 |
| `integration/route_reuse_strategy.spec.ts` | `Custom Route Reuse Strategy`（36） | detach / attach（[前のシリーズの最終回](../rdir/06-rdir-tests-issues.md)の 3 節） | 3 節 |
| （なし） | `mapToCanMatch`・`mapToCanActivate`・`mapToCanActivateChild`・`mapToCanDeactivate`・`mapToResolve` | `grep -rn mapTo packages/router/test` は 0 件 | 4 節 |

📄 `angular/packages/router/test/router_preloader.spec.ts` L101–120 （▶ の行: 104, 109, 115–116, 119）

```ts
101 │     it('should not load children', async () => {
102 │       const preloader = TestBed.inject(RouterPreloader);
103 │       const router = TestBed.inject(Router);
104 ▶       preloader.preload().subscribe(() => {});
105 │ 
106 │       await timeout();
107 │ 
108 │       const c = router.config;
109 ▶       expect((c[0] as any)._loadedRoutes).not.toBeDefined();
110 │     });
111 │ 
112 │     it('should not call the preloading method because children will not be loaded anyways', async () => {
113 │       const preloader = TestBed.inject(RouterPreloader);
114 │       const preloadingStrategy = TestBed.inject(PreloadingStrategy);
115 ▶       spyOn(preloadingStrategy, 'preload').and.callThrough();
116 ▶       preloader.preload().subscribe(() => {});
117 │ 
118 │       await timeout();
119 ▶       expect(preloadingStrategy.preload).not.toHaveBeenCalled();
120 │     });
```

104・116 行目は `NavigationEnd` を待たず、2 節の公開の `preload()` を直接呼びます。109 行目で `_loadedRoutes` が無いこと、119 行目で戦略の `preload` が一度も呼ばれないこと（L153〜158の条件で `preloadConfig` に入らない）を確かめます。

📄 `angular/packages/router/test/route_injector_cleanup.spec.ts` L230–254 （▶ の行: 241, 245, 248, 251, 253）

```ts
230 │   it('should NOT destroy injectors for parent of stored routes', async () => {
231 │     router.navigateByUrl('/parent/child');
232 │     await whenStable();
233 │     const parentRoute = router.config.find((r) => r.path === 'parent')!;
234 │     const childRoute = parentRoute.children![0];
235 │     const parentInjector = (parentRoute as any)._injector;
236 │     const childInjector = (childRoute as any)._injector;
237 │ 
238 │     expect(parentInjector).toBeDefined();
239 │     expect(childInjector).toBeDefined();
240 │ 
241 ▶     // This navigation will cause the `child` route to be stored
242 │     router.navigateByUrl('/away');
243 │     await whenStable();
244 │ 
245 ▶     // The parent injector should NOT be destroyed because its child is in the reuse store
246 │     expect((parentRoute as any)._injector).toBeDefined();
247 │     // @ts-ignore
248 ▶     expect(parentInjector?.destroyed).toBe(false);
249 │ 
250 │     // The child injector should also not be destroyed because it is stored.
251 ▶     expect((childRoute as any)._injector).toBeDefined();
252 │     // @ts-ignore
253 ▶     expect(childInjector?.destroyed).toBe(false);
254 │   });
```

この it が保存するのは `'child'` です（この spec の戦略の `shouldDetach` は `home`・`check`・`child` の 3 つ、L68〜74）。248 行目のコメントのとおり、子は保存されているので壊されず、親は子の `pathFromRoot` に入るので壊されません。`'parent'` を保存する it はありません。同じ describe の 164 行目の it には `// Wait, my strategy stores 'home'.`（L175）のような書きかけのコメントが残っています。

### 走らせた結果と、作業木で確かめたこと

📄 `走らせたコマンドと結果（2026-11-20、8576f161ae4 の作業木）`

```
$ cd <8576f161ae4 の作業木>             # angular-fix から worktree add
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=^RouterPreloader "
Ran 22 of 1170 specs、0 failures
  --filter=Route Injector Destruction       Ran 10 of 1170 specs、0 failures
  --filter=Custom Route Reuse Strategy      Ran 20 of 1170 specs、0 failures（10 本 × navigation / history）
  --filter=mapTo                            Ran 0 of 1170 specs（mapToCanActivate などの it は無い）

# 作業木に rtl_b_probe.spec.ts（親だけを保存する戦略 + withAutoCleanupInjectors）を足す
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=rtl-b probe|Route Injector Destruction"
RTLB at away log=["RtlbChild #1 destroyed","RtlbChildService destroyed"]
RTLB after away: parent destroyed=false child destroyed=true childRoute._injector=undefined
RTLB log=["RtlbChild #1 destroyed","RtlbChildService destroyed"] shown child #2 (first #1)
RTLB back: text="parent child" childRoute._injector same=false
14 specs, 0 failures
```

作業木（`git -C angular-fix worktree add … 8576f161ae4`）に `rtl_b_probe.spec.ts` を足しました。次の構成（`'parent'` だけを保存する戦略、子の `providers` に `ngOnDestroy` を持つサービス、子の部品の `DestroyRef` で記録）で、記録が `['RtlbChild #1 destroyed', 'RtlbChildService destroyed']` の順になること、戻ったあとの子が 2 つ目の部品で、Route の `_injector` が新しい物であることを確かめる it です。今のソースのままで通ります（既存の 10 本と合わせて 14 specs, 0 failures）。この「親を保存したときの子」を固める it は route\_injector\_cleanup.spec.ts にありません。足すなら 230 行目の it（子を保存）の隣で、spec の戦略の `shouldDetach`（L68〜74）に `'parent'` を足す形になります。

`mapTo*` には spec がありません。足すなら、DEMO 2 と同じく `providedIn: 'root'` の 2 つのクラスを `mapToCanActivate([G1, G2])` にして、`navigateByUrl` の結果と呼ばれた順を見る it です。作業木で 1 本書くと、`calls` が `['G1', 'G2']`、結果が `false`（G2 が `false`）で通りました。置き場所は `packages/router/test/` に `functional_guards.spec.ts` を新しく作る形になり、BUILD.bazel の `glob(["**/*.ts"])` がそのまま拾います。

## ここまでの呼び出し

- `getBootstrapListener()` — provide\_router.ts L274 — *bootstrap のとき*
  - `RouterPreloader.setUpPreloading()` — router\_preloader.ts L109 — *NavigationEnd ごとに*
    - `preload() → processRoutes(injector, router.config)` — L118・L127
      - `PreloadingStrategy.preload(route, fn)` — L33 — *All は fn()、No は of(null)*
        - `RouterConfigLoader.loadChildren / loadComponent` — router\_config\_loader.ts L82・L50
          - `maybeUnwrapDefaultExport → maybeResolveResources` — L130・L166
- `checkGuards → runCanActivateChecks` — check\_guards.ts L93 — *ガードの段*
  - `fireChildActivationStart / fireActivationStart` — L139・L121
  - 👤 `(...params) => inject(Guard).canActivate(...params)` — functional\_guards.ts L54 — *mapToCanActivate が作った関数*
- `Router（NavigationEnd を受けて）` — router.ts L212
  - `routeInjectorCleanup(strategy, routerState, config)` — route\_injector\_cleanup.ts L24 — *withAutoCleanupInjectors のときだけ*
    - `collectDescendants / pathFromRoot → destroyUnusedInjectors` — L51・L40・L61

## 聞かれそうな質問

**Q. `withPreloading` を付けないとき、`NoPreloading` は動いていますか？**

動いていません。`RouterPreloader` も `PreloadingStrategy` も provide されず、bootstrap のときの `setUpPreloading` の呼び出し（provide\_router.ts L290）は `optional` の `null` で飛ばされます。L73の「既定で有効」は振る舞いの説明で、実際に `NoPreloading` が注入されるのは `withPreloading(NoPreloading)` と書いたときです。

**Q. `canLoad` のあるルートが事前読み込みされないのはなぜですか？**

`processRoutes` の L153〜158の条件が `route.canLoad === undefined` を求めるからです。L145〜152のコメントのとおり、`canLoad` は副作用を持ちうるので、事前読み込みの中で走らせず、読み込みごと飛ばします。`loadComponent` だけのルートは `canLoad` に関係なく事前読み込みされます。

**Q. `loadChildren: () => import('./admin.routes')` で `export default` した配列が使えるのはなぜですか？**

読んだ値を 15 行目の `maybeUnwrapDefaultExport` に通し、`'default'` を持つオブジェクトならその値を取り出すからです（L130）。DEMO 1 の `'lazy'` は `Promise.resolve({default: routes})` を返し、読み込みのあと `_loadedRoutes` が 1 件になります。

**Q. `mapToCanActivate([A, B])` と `canActivate: [A, B]` は同じですか？**

呼ばれる `canActivate` は同じですが、通る道が違います。前者は関数なので `runInInjectionContext` の中で呼ばれ、その中の `inject(A)` でインスタンスを引きます。後者は models.ts L108の `DeprecatedGuard` の形で、`getTokenOrFunctionIdentity` が注入器から引いて `isCanActivate` の道を通ります。

**Q. `withAutoCleanupInjectors` を使うとき、子を持つ親を保存すると子の注入器はどうなりますか？**

壊されます。ただし壊す前に、子の部品は detach のときにもう壊されています（operators/activate\_routes.ts L104〜106）。L36〜45が保存した handle の `pathFromRoot`（祖先）だけを集めるのはこのためで、戻ったときは子の部品も注入器も作り直されます（テストの節の作業木の spec）。子そのものを保存したときは、子の注入器は残ります（spec の 230 行目）。

**Q. `BaseRouteReuseStrategy` を継いだ戦略で、`shouldDestroyInjector` を書かないとどうなりますか？**

継いだ既定の `true`（L167〜169）になり、`withAutoCleanupInjectors` のもとでは使っていない Route の注入器は壊されます。`RouteReuseStrategy` を直接実装して `shouldDestroyInjector` を書かなければ、71〜73 行目の `?? false` で壊されません。

## 読み終えて

- `ROUTES` は `Route[][]` で、受け取る側が `flat()` する。読んだ値は `maybeUnwrapDefaultExport` と `maybeResolveResources`（JIT だけ）を通る。
- `PreloadAllModules` と `NoPreloading` の違いは `fn()` を呼ぶかどうかの 1 行。`withPreloading` が無ければ事前読み込みの仕組みそのものが無い。
- `BaseRouteReuseStrategy` は何も保存せず、同じ Route の設定なら再利用し、注入器の後片付けには `true` と答える。
- 後片付けは今の木の子孫と、保存した handle の祖先を守る。親を保存すると子の部品は detach のときに壊されるので、子の注入器も壊され、戻ると両方作り直される。
- `mapTo*` は `inject(クラス).メソッド` の関数を作るだけで、spec も、専用の使い方の例も無い。

---

← 前: [Router クラスと Navigation の型：公開メソッドの残りと Navigation の各項目](04-rtl-router-class.md)  
次: [spec と issue を読む：Router の読み残しを固めているテスト](06-rtl-tests-issues.md) →
