[目次](../README.md) › [Router のディレクティブとイベントの残り：RouterLink・RouterLinkActive・RouterOutlet・events.ts を行で埋める](README.md) › 第 5 回 / 全 6 回

# ExtraOptions と RouterModule.forRoot：設定の型と、withX との対応表

> router\_config.ts の ExtraOptions・RouterConfigOptions・InMemoryScrollingOptions の各項目と既定値（読む側の || と ||=）、forRoot が各項目をどの provider にするか（options をコピーせず RouterScroller が書き込む・scrollOffset と ROUTER\_INITIALIZER は forRoot だけ）、ROUTER\_FORROOT\_GUARD が開発モードにしか無いこと、provideRouter の withX との対応表と、移行ツールが case の無い 3 項目を withRouterConfig に入れる行。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rdir-options)

---

`RouterModule.forRoot(routes, options)` の `options`（`ExtraOptions`）には 16 の項目があり、`provideRouter` では `withX` の関数に分かれています。この章では、`ExtraOptions` を作る 3 つの型（`RouterConfigOptions`・`InMemoryScrollingOptions`・`ExtraOptions` 自身）の各項目と既定値、forRoot が各項目をどの provider にするか、`provideRouter` 側に対応が無い項目と、移行ツールがそれをどう書き換えるかを行で読みます。最後に、同じ設定を 2 通りで書いた本物の Router を並べます。

読む対象は `packages/router/src/router_config.ts` と `router_module.ts` の残りの行、移行ツールの `standalone-bootstrap.ts` です（../angular、8576f161ae4）。forRoot が返す `ModuleWithProviders` の全体と ROUTER\_FORROOT\_GUARD の働きは[forRoot と ModuleWithProviders](../ngmodule/09-ngmodule-module-with-providers.md)に、`provideRouter` の本体と各 `withX` の中身・`RouterConfigOptions` の既定値の表は[provideRouter の中身](../router/05-router-provide-router.md)にあります。ここではその 2 つの間を埋めます。

1. [1. RouterLink の入力](01-rdir-link-inputs.md)
2. [2. RouterLinkActive の残り](02-rdir-link-active.md)
3. [3. RouterOutlet の入力と detach / attach](03-rdir-outlet.md)
4. [4. events.ts の各クラス](04-rdir-events.md)
5. **5. ExtraOptions と RouterModule**（この章）
6. [6. spec と issue](06-rdir-tests-issues.md)

## 1. ExtraOptions は 2 つの型を継承する

📄 `angular/packages/router/src/router_config.ts` L224–266 （▶ の行: 233, 238, 244, 247, 258, 265）

```ts
224 │ /**
225 │  * A set of configuration options for a router module, provided in the
226 │  * `forRoot()` method.
227 │  *
228 │  * @see {@link /api/router/RouterModule#forRoot forRoot}
229 │  *
230 │  *
231 │  * @publicApi
232 │  */
233 ▶ export interface ExtraOptions extends InMemoryScrollingOptions, RouterConfigOptions {
234 │   /**
235 │    * When true, log all internal navigation events to the console.
236 │    * Use for debugging.
237 │    */
238 ▶   enableTracing?: boolean;
239 │ 
240 │   /**
241 │    * When true, enable the location strategy that uses the URL fragment
242 │    * instead of the history API.
243 │    */
244 ▶   useHash?: boolean;
245 │ 
246 │   /**
247 ▶    * One of `enabled`, `enabledBlocking`, `enabledNonBlocking` or `disabled`.
248 │    * When set to `enabled` or `enabledBlocking`, the initial navigation starts before the root
249 │    * component is created. The bootstrap is blocked until the initial navigation is complete. This
250 │    * value should be set in case you use [server-side rendering](guide/ssr), but do not enable
251 │    * [hydration](guide/hydration) for your application. When set to `enabledNonBlocking`,
252 │    * the initial navigation starts after the root component has been created.
253 │    * The bootstrap is not blocked on the completion of the initial navigation. When set to
254 │    * `disabled`, the initial navigation is not performed. The location listener is set up before the
255 │    * root component gets created. Use if there is a reason to have more control over when the router
256 │    * starts its initial navigation due to some complex initialization logic.
257 │    */
258 ▶   initialNavigation?: InitialNavigation;
259 │ 
260 │   /**
261 │    * When true, enables binding information from the `Router` state directly to the inputs of the
262 │    * component in `Route` configurations. Can also accept an `ComponentInputBindingOptions` object
263 │    * to set whether to exclude queryParams from binding.
264 │    */
265 ▶   bindToComponentInputs?: boolean | ComponentInputBindingOptions;
266 │ 
```

233 行目、`ExtraOptions` は `InMemoryScrollingOptions` と `RouterConfigOptions` を継承し、自分の 8 項目を足します。継承した 2 つの型は、`provideRouter` では `withInMemoryScrolling` と `withRouterConfig` の引数の型そのものです。つまり型の上でも、`ExtraOptions` = 「2 つの `withX` の引数」+「それ以外の 8 項目」になっています。

247 行目の説明は「`enabled`・`enabledBlocking`・`enabledNonBlocking`・`disabled` の 1 つ」と書き、「`enabled` か `enabledBlocking` なら最初のナビゲーションはルートのコンポーネントより前に始まる」と続きます。ところが 258 行目の型は次の `InitialNavigation` で、`'enabled'` はありません。

📄 `angular/packages/router/src/router_config.ts` L13–33 （▶ の行: 17, 20, 24, 33）

```ts
13 │ /**
14 │  * Allowed values in an `ExtraOptions` object that configure
15 │  * when the router performs the initial navigation operation.
16 │  *
17 ▶  * * 'enabledNonBlocking' - (default) The initial navigation starts after the
18 │  * root component has been created. The bootstrap is not blocked on the completion of the initial
19 │  * navigation.
20 ▶  * * 'enabledBlocking' - The initial navigation starts before the root component is created.
21 │  * The bootstrap is blocked until the initial navigation is complete. This value should be set in
22 │  * case you use [server-side rendering](guide/ssr), but do not enable [hydration](guide/hydration)
23 │  * for your application.
24 ▶  * * 'disabled' - The initial navigation is not performed. The location listener is set up before
25 │  * the root component gets created. Use if there is a reason to have
26 │  * more control over when the router starts its initial navigation due to some complex
27 │  * initialization logic.
28 │  *
29 │  * @see {@link /api/router/RouterModule#forRoot forRoot}
30 │  *
31 │  * @publicApi
32 │  */
33 ▶ export type InitialNavigation = 'disabled' | 'enabledBlocking' | 'enabledNonBlocking';
```

33 行目の型は 3 つだけで、17 行目が `'enabledNonBlocking'` を既定と書いています。`initialNavigation: 'enabled'` と書くと型エラーです。移行ツールは今も `'enabled'` を `withEnabledBlockingInitialNavigation` に写す case を持っています（6 節の表、standalone-bootstrap.ts L591）。型から `'enabled'` が消えたあとも、説明と移行ツールに残っている形です。

## 2. RouterConfigOptions：Router と StateManager が読む 6 項目

📄 `angular/packages/router/src/router_config.ts` L69–99 （▶ の行: 72, 78, 84, 86, 99）

```ts
69 │   /**
70 │    * Configures the default for handling a navigation request to the current URL.
71 │    *
72 ▶    * If unset, the `Router` will use `'ignore'`.
73 │    *
74 │    * @see {@link OnSameUrlNavigation}
75 │    *
76 │    * @see [React to same-URL navigations](guide/routing/customizing-route-behavior#react-to-same-url-navigations)
77 │    */
78 ▶   onSameUrlNavigation?: OnSameUrlNavigation;
79 │ 
80 │   /**
81 │    * Defines how the router merges parameters, data, and resolved data from parent to child
82 │    * routes.
83 │    *
84 ▶    * By default ('always'), a route inherits all parameters from its parent routes.
85 │    *
86 ▶    * Set to 'emptyOnly' to preserve the legacy behavior where a route only inherits the parent
87 │    * route's parameters when the route itself has an empty path or when the parent route doesn't
88 │    * have any component set.
89 │    *
90 │    * Note that when dealing with matrix parameters, "parent" refers to the parent `Route`
91 │    * config which does not necessarily mean the "URL segment to the left". When the `Route` `path`
92 │    * contains multiple segments, the matrix parameters must appear on the last segment. For example,
93 │    * matrix parameters for `{path: 'a/b', component: MyComp}` should appear as `a/b;foo=bar` and not
94 │    * `a;foo=bar/b`.
95 │    *
96 │    * @see [Control parameter inheritance](guide/routing/customizing-route-behavior#control-parameter-inheritance)
97 │    *
98 │    */
99 ▶   paramsInheritanceStrategy?: 'emptyOnly' | 'always';
```

📄 `angular/packages/router/src/router_config.ts` L113–139 （▶ の行: 117, 119–120, 129, 132, 135, 138）

```ts
113 │   /**
114 │    * The default strategy to use for handling query params in `Router.createUrlTree` when one is not provided.
115 │    *
116 │    * The `createUrlTree` method is used internally by `Router.navigate` and `RouterLink`.
117 ▶    * Note that `QueryParamsHandling` does not apply to `Router.navigateByUrl`.
118 │    *
119 ▶    * When neither the default nor the queryParamsHandling option is specified in the call to `createUrlTree`,
120 ▶    * the current parameters will be replaced by new parameters.
121 │    *
122 │    * @see {@link Router#createUrlTree}
123 │    * @see {@link QueryParamsHandling}
124 │    * 
125 │    * @see [Choose default query parameter handling](guide/routing/customizing-route-behavior#choose-default-query-parameter-handling)
126 │ 
127 │    * 
128 │    */
129 ▶   defaultQueryParamsHandling?: QueryParamsHandling;
130 │ 
131 │   /**
132 ▶    * When `true`, the `Promise` will instead resolve with `false`, as it does with other failed
133 │    * navigations (for example, when guards are rejected).
134 │ 
135 ▶    * Otherwise the `Promise` returned by the Router's navigation with be rejected
136 │    * if an error occurs.
137 │    */
138 ▶   resolveNavigationPromiseOnError?: boolean;
139 │ }
```

6 項目（L67の `canceledNavigationResolution`、L78・L99・L111・L129・L138）は、どれも `ROUTER_CONFIGURATION` の値として Router・StateManager・NavigationTransitions が `inject` し、`||` で既定を決めます。説明の既定（72 行目の `'ignore'`、84 行目の `'always'`）と、読む側の行（router.ts L160、navigation\_transition.ts L368〜370）が合っていることは[provideRouter の中身](../router/05-router-provide-router.md)の 4 節の表で確かめてあります。

- 117 行目、`defaultQueryParamsHandling` は `createUrlTree`（つまり `navigate` と RouterLink）にだけ効き、`navigateByUrl` には効きません。読む行は router.ts L477の `switch (queryParamsHandling ?? this.options.defaultQueryParamsHandling)` で、119〜120 行目のとおり、どちらも無ければ今のクエリを新しいもので置き換えます。RouterLink 側からの見え方は[第 1 回](01-rdir-link-inputs.md)です。
- 132〜136 行目の `resolveNavigationPromiseOnError` は、`true` なら失敗したナビゲーションの Promise を reject ではなく `false` で解決します（navigation\_transition.ts L982）。`NavigationError` のイベントは、どちらでも出ます。

## 3. InMemoryScrollingOptions と ComponentInputBindingOptions

📄 `angular/packages/router/src/router_config.ts` L141–166 （▶ の行: 143, 149, 152, 154, 157, 162, 166）

```ts
141 │ /**
142 │  * Configuration options for the scrolling feature which can be used with `withInMemoryScrolling`
143 ▶  * function or `RouterModule.forRoot`.
144 │  *
145 │  * @publicApi
146 │  * @see withInMemoryScrolling
147 │  * @see RouterModule#forRoot
148 │  */
149 ▶ export interface InMemoryScrollingOptions {
150 │   /**
151 │    * When set to 'enabled', scrolls to the anchor element when the URL has a fragment.
152 ▶    * Anchor scrolling is disabled by default.
153 │    *
154 ▶    * Anchor scrolling does not happen on 'popstate'. Instead, we restore the position
155 │    * that we stored or scroll to the top.
156 │    */
157 ▶   anchorScrolling?: 'disabled' | 'enabled';
158 │ 
159 │   /**
160 │    * Configures if the scroll position needs to be restored when navigating back.
161 │    *
162 ▶    * * 'disabled'- (Default) Does nothing. Scroll position is maintained on navigation.
163 │    * * 'top'- Sets the scroll position to x = 0, y = 0 on all navigation.
164 │    * * 'enabled'- Restores the previous scroll position on backward navigation, else sets the
165 │    * position to the anchor if one is provided, or sets the scroll position to [0, 0] (forward
166 ▶    * navigation). This option will be the default in the future.
```

📄 `angular/packages/router/src/router_config.ts` L192–222 （▶ の行: 193, 198, 205, 210, 215, 217, 221）

```ts
192 │    */
193 ▶   scrollPositionRestoration?: 'disabled' | 'enabled' | 'top';
194 │ }
195 │ 
196 │ /**
197 │  * Configuration options for the component input binding feature which can be used
198 ▶  * with `withComponentInputBinding` function or `RouterModule.forRoot`
199 │  *
200 │  * @publicApi
201 │  * @see withComponentInputBinding
202 │  * @see RouterModule#forRoot
203 │  * @see [Disable query parameter binding](guide/routing/common-router-tasks#disable-query-parameter-binding)
204 │  */
205 ▶ export interface ComponentInputBindingOptions {
206 │   /**
207 │    * When true (default), will configure query parameters to bind to component
208 │    * inputs.
209 │    */
210 ▶   queryParams?: boolean;
211 │ 
212 │   /**
213 │    * Configures the behavior when an input is not matched by any key in the router data.
214 │    *
215 ▶    * - `'alwaysUndefined'`: (Default) Binds `undefined` to the input. This ensures that stale data
216 │    *   is not retained.
217 ▶    * - `'undefinedIfStale'`: Binds `undefined` only if the input was previously available
218 │    *   in the router data during the lifetime of the active route in this outlet. This avoids
219 │    *   setting `undefined` for inputs that were never expected to be set by the router.
220 │    */
221 ▶   unmatchedInputBehavior?: 'alwaysUndefined' | 'undefinedIfStale';
222 │ }
```

143 行目のとおり、`InMemoryScrollingOptions` は `withInMemoryScrolling` と `RouterModule.forRoot` の両方で使う型です。152・162 行目の既定 `'disabled'` は、型ではなく `RouterScroller` のコンストラクタ（router\_scroller.ts L63〜64の `||=`、[Router.events の全種類](../router/17-router-events.md)の引用）が決めます。166 行目は `'enabled'` を「将来の既定」と書いていますが、8576f161ae4 でも origin/main（943ec3bd8d6）でも既定は `'disabled'` のままです。205〜221 行目の `ComponentInputBindingOptions` は `bindToComponentInputs`（265 行目）にオブジェクトで渡す形で、`withComponentInputBinding` の引数と同じ型です。

## 4. 残りの 8 項目と、forRoot が作る provider

📄 `angular/packages/router/src/router_config.ts` L267–301 （▶ の行: 273, 275, 284, 288, 290, 300）

```ts
267 │   /**
268 │    * When true, enables view transitions in the Router by running the route activation and
269 │    * deactivation inside of `document.startViewTransition`.
270 │    *
271 │    * @see https://developer.chrome.com/docs/web-platform/view-transitions/
272 │    * @see https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API
273 ▶    * @experimental 17.0
274 │    */
275 ▶   enableViewTransitions?: boolean;
276 │ 
277 │   /**
278 │    * A custom error handler for failed navigations.
279 │    * If the handler returns a value, the navigation Promise is resolved with this value.
280 │    * If the handler throws an exception, the navigation Promise is rejected with the exception.
281 │    *
282 │    * @see RouterConfigOptions
283 │    */
284 ▶   errorHandler?: (error: any) => RedirectCommand | any;
285 │ 
286 │   /**
287 │    * Configures a preloading strategy.
288 ▶    * One of `PreloadAllModules` or `NoPreloading` (the default).
289 │    */
290 ▶   preloadingStrategy?: any;
291 │ 
292 │   /**
293 │    * Configures the scroll offset the router will use when scrolling to an element.
294 │    *
295 │    * When given a tuple with x and y position value,
296 │    * the router uses that offset each time it scrolls.
297 │    * When given a function, the router invokes the function every time
298 │    * it restores scroll position.
299 │    */
300 ▶   scrollOffset?: [number, number] | (() => [number, number]);
301 │ }
```

273 行目の `@experimental 17.0` は、origin/main で消されています（`git diff 8576f161ae4 origin/main -- packages/router/src/router_config.ts` の 1 行）。290 行目の `preloadingStrategy` は `any` で、288 行目が既定を `NoPreloading` と書きます。300 行目の `scrollOffset` は、組か、組を返す関数です。この項目は `InMemoryScrollingOptions` ではなく `ExtraOptions` の側にあり、6 節のとおり `provideRouter` には対応する `withX` がありません。

forRoot の本体（L127〜164）は[forRoot と ModuleWithProviders](../ngmodule/09-ngmodule-module-with-providers.md)で読んだので、ここでは 150〜154 行目の 5 行だけを見ます。

📄 `angular/packages/router/src/router_module.ts` L148–154 （▶ の行: 150–154）

```ts
148 │             }
149 │           : [],
150 ▶         {provide: ROUTER_CONFIGURATION, useValue: config ? config : {}},
151 ▶         config?.useHash ? provideHashLocationStrategy() : providePathLocationStrategy(),
152 ▶         provideRouterScroller(),
153 ▶         config?.preloadingStrategy ? withPreloading(config.preloadingStrategy).ɵproviders : [],
154 ▶         config?.initialNavigation ? provideInitialNavigation(config) : [],
```

150 行目は、渡された `config` のオブジェクトを **そのまま**`ROUTER_CONFIGURATION` の値にします（コピーしない）。152 行目の `provideRouterScroller()` は、スクロールの項目を書いたかどうかに関係なく、いつも入ります。151・154 行目は次の 2 つの引用です。

📄 `angular/packages/router/src/router_module.ts` L190–219 （▶ の行: 191–192, 196, 199–201, 203, 208–209, 211, 214–215, 217）

```ts
190 │ /**
191 ▶  * For internal use by `RouterModule` only. Note that this differs from `withInMemoryRouterScroller`
192 ▶  * because it reads from the `ExtraOptions` which should not be used in the standalone world.
193 │  */
194 │ export function provideRouterScroller(): Provider {
195 │   return {
196 ▶     provide: ROUTER_SCROLLER,
197 │     useFactory: () => {
198 │       const viewportScroller = inject(ViewportScroller);
199 ▶       const config: ExtraOptions = inject(ROUTER_CONFIGURATION);
200 ▶       if (config.scrollOffset) {
201 ▶         viewportScroller.setOffset(config.scrollOffset);
202 │       }
203 ▶       return new RouterScroller(config);
204 │     },
205 │   };
206 │ }
207 │ 
208 ▶ // Note: For internal use only with `RouterModule`. Standalone setup via `provideRouter` should
209 ▶ // provide hash location directly via `{provide: LocationStrategy, useClass: HashLocationStrategy}`.
210 │ function provideHashLocationStrategy(): Provider {
211 ▶   return {provide: LocationStrategy, useClass: HashLocationStrategy};
212 │ }
213 │ 
214 ▶ // Note: For internal use only with `RouterModule`. Standalone setup via `provideRouter` does not
215 ▶ // need this at all because `PathLocationStrategy` is the default factory for `LocationStrategy`.
216 │ function providePathLocationStrategy(): Provider {
217 ▶   return {provide: LocationStrategy, useClass: PathLocationStrategy};
218 │ }
219 │ 
```

1. **199 行目：ROUTER\_CONFIGURATION をそのまま読む**

   191〜192 行目のコメントが「`withInMemoryScrolling` と違い、standalone では使うべきでない `ExtraOptions` を読む」と書いています。`ROUTER_SCROLLER` の factory は、bootstrap の `getBootstrapListener` が `ROUTER_SCROLLER` を取るときに走ります（[provideRouter の中身](../router/05-router-provide-router.md)の bootstrap の節）。
2. **200〜202 行目：scrollOffset は ViewportScroller に渡す**

   `scrollOffset` の行き先はここだけです。`RouterScroller` は offset を知らず、`ViewportScroller.setOffset` が覚えて `scrollToAnchor` のときに引きます（[ViewportScroller](../cmn/19-cmn-viewport-scroller.md)）。
3. **203 行目：同じオブジェクトを RouterScroller に渡す**

   `RouterScroller` のコンストラクタは `this.options.scrollPositionRestoration ||= 'disabled'` と書き込むので、`ROUTER_CONFIGURATION` の値にも、利用者が forRoot に渡したオブジェクトにも、`scrollPositionRestoration` と `anchorScrolling` が足されます。DEMO の表の 2〜5 段目（ROUTER\_CONFIGURATION と渡したオブジェクト）で見えます。
4. **208〜218 行目：LocationStrategy は 2 つのどちらかを必ず置く**

   214〜215 行目のコメントのとおり、`provideRouter` では `PathLocationStrategy` が `LocationStrategy` の既定の factory なので、この行は要りません。forRoot は `useHash` が無くても 217 行目の provider を置きます。

📄 `angular/packages/router/src/router_module.ts` L233–262 （▶ の行: 233–234, 237–239, 244, 251, 257–260）

```ts
233 ▶ // Note: For internal use only with `RouterModule`. Standalone router setup with `provideRouter`
234 ▶ // users call `withXInitialNavigation` directly.
235 │ function provideInitialNavigation(config: Pick<ExtraOptions, 'initialNavigation'>): Provider[] {
236 │   return [
237 ▶     config.initialNavigation === 'disabled' ? withDisabledInitialNavigation().ɵproviders : [],
238 ▶     config.initialNavigation === 'enabledBlocking'
239 ▶       ? withEnabledBlockingInitialNavigation().ɵproviders
240 │       : [],
241 │   ];
242 │ }
243 │ 
244 ▶ // TODO(atscott): This should not be in the public API
245 │ /**
246 │  * A DI token for the router initializer that
247 │  * is called after the app is bootstrapped.
248 │  *
249 │  * @publicApi
250 │  */
251 ▶ export const ROUTER_INITIALIZER = new InjectionToken<(compRef: ComponentRef<any>) => void>(
252 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'Router Initializer' : '',
253 │ );
254 │ 
255 │ function provideRouterInitializer(): Provider[] {
256 │   return [
257 ▶     // ROUTER_INITIALIZER token should be removed. It's public API but shouldn't be. We can just
258 ▶     // have `getBootstrapListener` directly attached to APP_BOOTSTRAP_LISTENER.
259 ▶     {provide: ROUTER_INITIALIZER, useFactory: getBootstrapListener},
260 ▶     {provide: APP_BOOTSTRAP_LISTENER, multi: true, useExisting: ROUTER_INITIALIZER},
261 │   ];
262 │ }
```

237〜240 行目、`'disabled'` と `'enabledBlocking'` だけが `withX().ɵproviders` になり、`'enabledNonBlocking'` はどちらの条件にも当たらず何も足しません。既定の `INITIAL_NAVIGATION`（provide\_router.ts L340〜342、factory が `EnabledNonBlocking`）と同じだからです。251 行目の `ROUTER_INITIALIZER` は公開のトークンですが、244 行目と 257〜258 行目のコメントが「公開 API にあるべきではない」「`getBootstrapListener` を `APP_BOOTSTRAP_LISTENER` に直接付ければよい」と書いています。`provideRouter` は実際にそうしていて（provide\_router.ts L118）、`inject(ROUTER_INITIALIZER)` は forRoot のときにしか値がありません。

## 5. ROUTER\_FORROOT\_GUARD は開発モードにしか無い

📄 `angular/packages/router/src/router_module.ts` L57–63 （▶ の行: 57, 60–61）

```ts
57 ▶ /**
58 │  * @docsNotRequired
59 │  */
60 ▶ export const ROUTER_FORROOT_GUARD = new InjectionToken<void>(
61 ▶   typeof ngDevMode === 'undefined' || ngDevMode ? 'router duplicate forRoot guard' : '',
62 │ );
63 │ 
```

60 行目のトークンを provide するのは forRoot の L138〜143、inject するのは `RouterModule` のコンストラクタの L104〜106で、どちらも `typeof ngDevMode === 'undefined' || ngDevMode` の中です（[forRoot と ModuleWithProviders](../ngmodule/09-ngmodule-module-with-providers.md)の 4 節）。本番ビルドではトークンの provider も inject も消えるので、`provideForRootGuard`（L220〜231）は呼ばれず、forRoot を子の注入器でもう一度書いても例外は出ません。

| アプリの注入器の子で `importProvidersFrom(RouterModule.forRoot(routes))` | 結果 |
| --- | --- |
| 開発モード（Node の記録） | `例外：NG04007: The Router was provided more than once. This can happen if 'forRoot' is used outside of the root injector. Lazy loaded modules should use RouterModule.forChild() instead.` |
| 本番（Node の記録、`ngDevMode = false`） | `例外は出ませんでした。子の注入器の inject(Router) はアプリとは別の Router です。` |

本番では子の注入器に `ROUTER_PROVIDERS`（L68〜75）の `Router` の record ができ、子から `inject(Router)` すると 2 つ目の Router が作られます。その Router も `NavigationTransitions`（`providedIn: 'root'`）はアプリのものを使います。二重の forRoot に気づけるのは開発モードで走らせたときだけ、ということです。spec は `lazy_loading.spec.ts` の L346の it で、開発モードの NG04007 を確かめています（[第 6 回](06-rdir-tests-issues.md)）。

## 6. ExtraOptions → withX の対応表と、移行ツールの穴

16 の項目それぞれが、forRoot（router\_module.ts の行）・`provideRouter` の `withX`・読む側・移行ツール（`getRouterModuleForRootFeatures`、standalone-bootstrap.ts の行）でどうなるかです。「定義」は router\_config.ts の行です。

| 項目 | 型 | 定義 | forRoot | provideRouter | 読む側（既定） | 移行ツール |
| --- | --- | --- | --- | --- | --- | --- |
| `canceledNavigationResolution` | RouterConfigOptions | 67 | 150 ROUTER\_CONFIGURATION | `withRouterConfig` | state\_manager.ts 36〜37（既定 'replace'） | withRouterConfig（617〜619） |
| `onSameUrlNavigation` | RouterConfigOptions | 78 | 150 | `withRouterConfig` | router.ts 160（既定 'ignore'）。navigation\_transition.ts 478 で extras が先 | withRouterConfig |
| `paramsInheritanceStrategy` | RouterConfigOptions | 99 | 150 | `withRouterConfig` | navigation\_transition.ts 368〜370（既定は定数 'always'） | withRouterConfig |
| `urlUpdateStrategy` | RouterConfigOptions | 111 | 150 | `withRouterConfig` | router.ts 102・state\_manager.ts 40（既定 'deferred'） | withRouterConfig |
| `defaultQueryParamsHandling` | RouterConfigOptions | 129 | 150 | `withRouterConfig` | router.ts 477（undefined なら置き換え） | withRouterConfig |
| `resolveNavigationPromiseOnError` | RouterConfigOptions | 138 | 150 | `withRouterConfig` | navigation\_transition.ts 982（undefined なら reject） | withRouterConfig |
| `anchorScrolling` | InMemoryScrollingOptions | 157 | 152 provideRouterScroller → 203 new RouterScroller(config) | `withInMemoryScrolling` | router\_scroller.ts 64（\|\|= 'disabled'） | withInMemoryScrolling（612〜614・624〜629） |
| `scrollPositionRestoration` | InMemoryScrollingOptions | 193 | 152 → 203 | `withInMemoryScrolling` | router\_scroller.ts 63（\|\|= 'disabled'） | withInMemoryScrolling |
| `enableTracing` | ExtraOptions | 238 | 132〜136（開発モードだけ） | `withDebugTracing` | provide\_router.ts 515（こちらも開発モードだけ） | withDebugTracing（578〜582） |
| `useHash` | ExtraOptions | 244 | 151 → 210〜212 / 216〜218 | `withHashLocation` | LocationStrategy の provider | withHashLocation（599〜603） |
| `initialNavigation` | ExtraOptions | 258 | 154 → 235〜242 | `withEnabledBlockingInitialNavigation / withDisabledInitialNavigation` | INITIAL\_NAVIGATION（既定 EnabledNonBlocking） | 'enabled'・'enabledBlocking' → withEnabledBlocking…、'disabled' → withDisabled…、'enabledNonBlocking' は消す（587〜597） |
| `bindToComponentInputs` | ExtraOptions | 265 | 155〜159 | `withComponentInputBinding` | INPUT\_BINDER | case が無く withRouterConfig へ（TS2353） |
| `enableViewTransitions` | ExtraOptions | 275 | 160 | `withViewTransitions` | CREATE\_VIEW\_TRANSITION | case が無く withRouterConfig へ（TS2353） |
| `errorHandler` | ExtraOptions | 284 | 144〜149 NAVIGATION\_ERROR\_HANDLER | `withNavigationErrorHandler` | navigation\_transition.ts の catchError | withNavigationErrorHandler（606〜608） |
| `preloadingStrategy` | ExtraOptions | 290 | 153 | `withPreloading` | RouterPreloader | withPreloading（573〜575） |
| `scrollOffset` | ExtraOptions | 300 | 152 → 200〜202 viewportScroller.setOffset | `無い（ViewportScroller.setOffset を自分で呼ぶ）` | ViewportScroller | case が無く withRouterConfig へ（TS2353） |

📄 `angular/packages/core/schematics/ng-generate/standalone-migration/standalone-bootstrap.ts` L609–633 （▶ の行: 612–614, 617–619, 624, 631–632）

```ts
609 │ 
610 │       // `anchorScrolling` and `scrollPositionRestoration` arguments have to be combined into an
611 │       // object literal that is passed into the `withInMemoryScrolling` feature.
612 ▶       case 'anchorScrolling':
613 ▶       case 'scrollPositionRestoration':
614 ▶         inMemoryScrollingOptions.push(prop);
615 │         break;
616 │ 
617 ▶       // All remaining properties can be passed through the `withRouterConfig` feature.
618 ▶       default:
619 ▶         configOptions.push(prop);
620 │         break;
621 │     }
622 │   }
623 │ 
624 ▶   if (inMemoryScrollingOptions.length > 0) {
625 │     features.track(
626 │       'withInMemoryScrolling',
627 │       ts.factory.createObjectLiteralExpression(inMemoryScrollingOptions),
628 │     );
629 │   }
630 │ 
631 ▶   if (configOptions.length > 0) {
632 ▶     features.track('withRouterConfig', ts.factory.createObjectLiteralExpression(configOptions));
633 │   }
```

L571〜608の switch（[importProvidersFrom](../ngmodule/14-ngmodule-import-providers-from.md)の 6 節）の続きです。617〜619 行目の `default` は「残りは全部 `withRouterConfig` に渡せる」と書き、case の無い項目を 631〜632 行目で `withRouterConfig({…})` にまとめます。ところが `withRouterConfig` の引数は `RouterConfigOptions`（2 節の 6 項目）で、case の無い `bindToComponentInputs`・`enableViewTransitions`・`scrollOffset` はそこに入りません。

1. **作業木で移行ツールを走らせる**

   standalone\_migration\_spec.ts の L5009の it（`should copy properties that do not map to a feature into withRouterConfig`）と同じ形で、`RouterModule.forRoot([], {bindToComponentInputs: true, enableViewTransitions: true, scrollOffset: [0, 64], initialNavigation: 'enabledNonBlocking'})` を `standalone-bootstrap` で移すと、main.ts は `provideRouter([], withRouterConfig({ bindToComponentInputs: true, enableViewTransitions: true, scrollOffset: [0, 64] }))` になりました（`//packages/core/schematics/test:test`）。
2. **型を検査する**

   この 1 行をサイトの依存（`@angular/router` 22.2.6、TypeScript 6.0.3）で tsc にかけると、`TS2353: Object literal may only specify known properties, and 'bindToComponentInputs' does not exist in type 'RouterConfigOptions'.` で止まります。
3. **型を外しても働かない**

   `withRouterConfig` は provide\_router.ts の L632で値を `ROUTER_CONFIGURATION` に置くだけで、`INPUT_BINDER` も `CREATE_VIEW_TRANSITION` も `setOffset` も作りません。forRoot では L155〜160 と 200〜202 行目がしていたことが消えます。

`scrollOffset` を `provideRouter` に入れないのは意図されたものです。#51601（2023-08-31、「provideRouter で scrollOffset を設定できない」）は、atscott が「`ViewportScroller` にすでにある機能の重複なので意図的に外した。`ViewportScroller.setOffset` を呼ぶ」と答えて、not planned で閉じています。移行ツールの側は、この 3 項目を `withRouterConfig` に入れない形にはなっていません（origin/main の standalone-bootstrap.ts でも case は同じ 7 つ）。

> **🧪 DEMO — 同じ設定を forRoot と provideRouter の 2 通りで作って並べる**
>
> ボタンを押すと、`createApplication` でこのサイトとは別のアプリを 2 つ作ります。1 つは `importProvidersFrom(RouterModule.forRoot(routes, options))`、もう 1 つは 6 節の移行ツールと同じ対応で書いた `provideRouter(routes, withX…)` です。`PlatformLocation` は URL を配列に積むだけの偽物、`ViewportScroller` は呼ばれた順に記録するだけの偽物に替えてあり、`PathLocationStrategy`・`HashLocationStrategy`・`RouterScroller` は本物です。このページの URL・履歴・スクロールは変わりません。それぞれ文書に付けない div にルートのコンポーネントを `appRef.bootstrap` し（最初のナビゲーションと `RouterScroller.init` はこのとき）、30 ms 待ってから `'/a?q=1#x'` へ移動し、読み終えたら `destroy` します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rdir-options)

> [!NOTE]
> **ポイント**
>
> 全部の項目に印を付けて（scrollPositionRestoration は 'top'、anchorScrolling は 'enabled'）押すと、2 つの列が違うのは ROUTER\_CONFIGURATION の中身（forRoot は全部、provideRouter は `withRouterConfig` の 1 項目だけ）・渡したオブジェクト・「同じオブジェクトか」・ROUTER\_INITIALIZER・ViewportScroller の記録（`setOffset([0,64])` が forRoot の側にだけある）です。LocationStrategy・PreloadingStrategy・最初のナビゲーション・ルートの入力 `q` は同じになります。何も付けずに押すと、forRoot の側だけ ROUTER\_CONFIGURATION が `{}` から `{"scrollPositionRestoration":"disabled","anchorScrolling":"disabled"}` に変わります（4 節の 203 行目）。

📄 `記録のスクリプト（options-record.mjs、5 節の表。ページのデモと同じファイルを JIT で動かす）`

```
// rdir-options の記録: ページのデモと同じファイル（rdir-options.demo-apps.ts）を TypeScript で JS にし、
// domino の上で JIT で動かす。開発モードと本番（globalThis.ngDevMode = false）の両方で同じ操作をする。
// 使い方: node options-record.mjs <angular-deep-dive のディレクトリ> [prod]
import {mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const [root, mode] = process.argv.slice(2);
if (mode === 'prod') {
  globalThis.ngDevMode = false;
  globalThis.ngServerMode = false;
}
const req = createRequire(join(root, 'package.json'));
const ts = req('typescript');
const tmp = join(dirname(fileURLToPath(import.meta.url)), 'tmp-options-' + (mode ?? 'dev'));
rmSync(tmp, {recursive: true, force: true});
mkdirSync(tmp, {recursive: true});
symlinkSync(join(root, 'node_modules'), join(tmp, 'node_modules'), 'dir');
writeFileSync(join(tmp, 'package.json'), '{"type": "module"}');
const src = readFileSync(join(root, 'src/app/pages/chapters/rdir-options.demo-apps.ts'), 'utf8');
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

const base = {useHash: false, scrollPositionRestoration: '', anchorScrolling: '', scrollOffset: false, initialNavigation: '', onSameUrlNavigation: false, preloading: false, bindToComponentInputs: false};
const presets = {
  none: base,
  all: {...base, useHash: true, scrollPositionRestoration: 'top', anchorScrolling: 'enabled', scrollOffset: true, onSameUrlNavigation: true, preloading: true, bindToComponentInputs: true},
  disabled: {...base, initialNavigation: 'disabled'},
  blocking: {...base, initialNavigation: 'enabledBlocking'},
};
const results = {};
for (const [name, p] of Object.entries(presets)) {
  results[name] = {};
  for (const kind of ['forRoot', 'provideRouter']) {
    try {
      results[name][kind] = await demo.runRdirOptApp(kind, p);
    } catch (e) {
      results[name][kind] = {error: String(e?.stack ?? e).split('\n').slice(0, 3).join(' / ')};
    }
  }
}
const twice = await demo.runRdirOptTwice();
rmSync(tmp, {recursive: true, force: true});
console.log(JSON.stringify({mode: mode ?? 'dev', results, twice}, null, 2));

```

## テストと直し方

### spec と it

| ファイル（packages/router/test/ から） | describe › it（行） | 固めている項目 |
| --- | --- | --- |
| `bootstrap.spec.ts` | `bootstrap`（40）› 106〜381 の 8 本（`initialNavigation = enabledBlocking` など） | initialNavigation（forRoot で書く） |
| `bootstrap.spec.ts` | 471 `should restore the scrolling position`（`if (!isNode)` の中、web だけ） | scrollPositionRestoration・anchorScrolling・scrollOffset |
| `router_scroller.spec.ts` | `RouterScroller`（33）› 34 `defaults to disabled` ほか | InMemoryScrollingOptions の既定 |
| `regression_integration.spec.ts` | `Integration`（49）› `useHash`（285）› 286 | useHash |
| `integration/navigation_errors.spec.ts` | 118 `can redirect from error handler with RouterModule.forRoot` | errorHandler・resolveNavigationPromiseOnError |
| `integration/lazy_loading.spec.ts` | `lazy loading`（65）› 346 `throws an error when forRoot() is used in a lazy context` | ROUTER\_FORROOT\_GUARD（開発モード） |
| `integration/navigation.spec.ts` | 90・120 `should override default onSameUrlNavigation with extras …` | onSameUrlNavigation（withRouterConfig で書く） |
| `computed_state_restoration.spec.ts` | 34 `canceledNavigationResolution: 'computed' with …-based routing` | canceledNavigationResolution |

📄 `angular/packages/router/test/bootstrap.spec.ts` L486–503 （▶ の行: 489, 498–501）

```ts
486 │       @NgModule({
487 │         imports: [
488 │           BrowserModule,
489 ▶           RouterModule.forRoot(
490 │             [
491 │               {path: '', pathMatch: 'full', redirectTo: '/aa'},
492 │               {path: 'aa', component: TallComponent},
493 │               {path: 'bb', component: TallComponent},
494 │               {path: 'cc', component: TallComponent},
495 │               {path: 'fail', component: TallComponent, canActivate: [() => false]},
496 │             ],
497 │             {
498 ▶               scrollPositionRestoration: 'enabled',
499 ▶               anchorScrolling: 'enabled',
500 ▶               scrollOffset: [0, 100],
501 ▶               onSameUrlNavigation: 'ignore',
502 │             },
503 │           ),
```

📄 `angular/packages/router/test/bootstrap.spec.ts` L534–550 （▶ の行: 538, 540–541, 546, 549–550）

```ts
534 │       await router.navigateByUrl('/cc');
535 │       await resolveAfter(100);
536 │       expect(window.pageYOffset).toEqual(0);
537 │ 
538 ▶       await router.navigateByUrl('/aa#marker2');
539 │       await resolveAfter(100);
540 ▶       expect(window.scrollY).toBeGreaterThanOrEqual(5900);
541 ▶       expect(window.scrollY).toBeLessThan(6000); // offset
542 │ 
543 │       // Scroll somewhere else, then navigate to the hash again. Even though the same url navigation
544 │       // is ignored by the Router, we should still scroll.
545 │       window.scrollTo(0, 3000);
546 ▶       await router.navigateByUrl('/aa#marker2');
547 │       await resolveAfter(100);
548 │       expect(window.scrollY).toBeGreaterThanOrEqual(5900);
549 ▶       expect(window.scrollY).toBeLessThan(6000); // offset
550 ▶     });
```

`scrollOffset` を確かめているのは、forRoot で書いた 500 行目の `[0, 100]` と、541 行目の「アンカーの位置から 100 だけ手前で止まる」（6000 未満）の 2 か所です。本物のブラウザで `window.scrollY` を読むので、この it は `test_web` にしかありません。546〜550 行目は、同じ URL への移動（`NavigationSkipped`）でもアンカーへスクロールすることを確かめています（第 4 回の 6 節の `Scroll`）。

forRoot が `config` をコピーせずに `RouterScroller` に渡し、中身が書き換わること（4 節の 203 行目）を確かめる spec はありません。`router_scroller.spec.ts` L34の it は、`new RouterScroller({})` の `scroller['options']` が `'disabled'` になることを確かめていて、書き換えそのものを前提にしています。

### 手元で走らせた結果

📄 `走らせたコマンドと結果（2026-11-19、8576f161ae4）`

```
$ cd ~/angular-research/angular        # 8576f161ae4
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all "--test_arg=--filter=bootstrap "
Ran 11 of 1170 specs、0 failures（describe('bootstrap') の 11 本。471 行目の it は Node では登録されない）
  --filter=RouterScroller                                   Ran 13 of 1170 specs、0 failures
  --filter=useHash                                          Ran 1 of 1170 specs、0 failures
  --filter=can redirect from error handler with RouterModule.forRoot   Ran 2 of 1170 specs、0 failures
  --filter=is used in a lazy context                        Ran 2 of 1170 specs、0 failures
  --filter=should override default onSameUrlNavigation      Ran 4 of 1170 specs、0 failures
  --filter=canceledNavigationResolution: 'computed'         Ran 36 of 1170 specs、0 failures
  --filter=eager url updates                                Ran 9 of 1170 specs、0 failures
  --filter=paramsInheritanceStrategy                        Ran 5 of 1170 specs、0 failures
# --filter は正規表現なので、"forRoot() is used" の () は空のグループになり 0 本になる
$ pnpm bazel test //packages/router/test:test_web --nocache_test_results --test_output=all
Chromium: 1180 passed, 0 failed / Firefox: 1178 passed, 0 failed（471 行目の it を含む）
```

### 直すとしたら

- 6 節の移行ツールは、standalone-bootstrap.ts の `getRouterModuleForRootFeatures` の switch に、`bindToComponentInputs`（→ `withComponentInputBinding`、オブジェクトならそれを引数に）と `enableViewTransitions`（→ `withViewTransitions`）の case を足す形です。`scrollOffset` は写す先が無いので、静的に読めない設定と同じく null を返して forRoot を残す（L5060の `should preserve a RouterModule.forRoot where the config cannot be statically analyzed` と同じ扱い）か、`withRouterConfig` に入れないかの判断が要ります。spec は standalone\_migration\_spec.ts の L5009の it の隣です。
- 1 節の 247 行目の `enabled` は doc コメントだけの話で、型（33 行目）は正しい形です。

## 聞かれそうな質問

**Q. forRoot の options に書いたスクロールの設定は、どこで読まれますか？**

forRoot の 152 行目の `provideRouterScroller()` が置く factory（router\_module.ts 197〜204 行目）が、199 行目で `ROUTER_CONFIGURATION`（150 行目で置いた options そのもの）を読み、203 行目で `new RouterScroller(config)` に渡します。`scrollOffset` だけは 200〜202 行目で `ViewportScroller.setOffset` に渡ります。

**Q. provideRouter で scrollOffset を書くには？**

`withX` はありません。`ViewportScroller` を inject して `setOffset` を呼びます（#51601 の答え）。forRoot がしていることも 200〜202 行目のそれだけです。

**Q. initialNavigation: 'enabledNonBlocking' を書くと何が変わりますか？**

何も変わりません。provideInitialNavigation（235〜242 行目）は `'disabled'` と `'enabledBlocking'` のときだけ provider を足し、`'enabledNonBlocking'` は既定の `INITIAL_NAVIGATION` と同じです。移行ツールもこの値を消します。

**Q. 本番ビルドで forRoot を 2 回書くとどうなりますか？**

例外は出ません。ROUTER\_FORROOT\_GUARD の provide（L138〜143）も inject（L104〜106）も `ngDevMode` の中だからです。子の注入器では 2 つ目の Router が作られます（5 節の表）。気づけるのは開発モードの NG04007 だけです。

**Q. 移行ツールで forRoot を provideRouter にしたら型エラーになりました。なぜですか？**

switch に case の無い `bindToComponentInputs`・`enableViewTransitions`・`scrollOffset` が、617〜619 行目の default で `withRouterConfig({…})` に入るからです。`withRouterConfig` の引数は `RouterConfigOptions` なので TS2353 になります。それぞれ `withComponentInputBinding()`・`withViewTransitions()`・`ViewportScroller.setOffset` に書き直します。

## 読み終えて

- `ExtraOptions` = `RouterConfigOptions`（`withRouterConfig`）+ `InMemoryScrollingOptions`（`withInMemoryScrolling`）+ 8 項目。既定値は型ではなく読む側の `||` と `||=`。
- forRoot は options をコピーせず `ROUTER_CONFIGURATION` に置き、いつも `RouterScroller` と `LocationStrategy` を置く。`RouterScroller` がその options に既定を書き込む。
- `scrollOffset` と `ROUTER_INITIALIZER` は forRoot にしか無い。`'enabledNonBlocking'` は何も足さない。
- 二重 forRoot の検出は開発モードだけ。
- 移行ツールは case の無い 3 項目を `withRouterConfig` に入れ、TS2353 になる。

---

← 前: [events.ts の各クラス：toString と stringifyEvent・取り消しの理由のコードと reason](04-rdir-events.md)  
次: [spec と issue を読む：ディレクティブ・イベント・ExtraOptions を固めているテスト](06-rdir-tests-issues.md) →
