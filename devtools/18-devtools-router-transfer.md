[目次](../README.md) › [Angular DevTools の内側](README.md) › 第 18 回 / 全 20 回

# ルーターの木・TransferState・ハイドレーションの重ね表示

> バックエンドの router-tree.ts が router.config を名前と印（active・lazy・aux）の木に直す行と、routerState による active の判定、sanitizeObject で data を削る行、パネルの router-tree。ɵgetTransferState がページの &lt;script id="…-state"&gt; を読む Transfer State のタブ、hydration-overlays.ts がハイドレーションの状態を要素の上に重ねて見せる仕組み。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-router-transfer)

---

DevTools の Router のタブはアプリのルートの設定を木で見せ、Transfer State のタブはサーバーから送られた値を表で見せ、Components のタブの設定ではハイドレーションの状態を要素の上に色で重ねられます。この章では、バックエンドの `router-tree.ts` が `router.config` を送れる形の木に直す行、`ɵgetTransferState` が実は「ページの `<script>` の JSON」を読んでいる行、`hydration-overlays.ts` が木のノードの状態から枠を選ぶ行を追います。

読む対象は、バックエンドの `router-tree/router-tree.ts`・`client-event-subscribers.ts`（`getRoutes`・`getTransferStateCallback`・`sanitizeRouteData`）・`shared/utils/serialization.ts`・`hydration/hydration-overlays.ts`、パネルの `devtools-tabs/router-tree/router-tree-fns.ts`・`devtools-tabs/transfer-state/`、それに core と router の窓口（`transfer_state_utils.ts`・`router_devtools.ts`）です。

1. [1. 全体像](01-devtools-overview.md)
2. [2. Angular を見つける](02-devtools-detect.md)
3. [3. メッセージの道](03-devtools-messaging.md)
4. [4. プロトコル](04-devtools-protocol.md)
5. [5. コンポーネントの木](05-devtools-component-tree.md)
6. [6. 制御フローの塊](06-devtools-control-flow.md)
7. [7. 同じノードを見分ける](07-devtools-identity.md)
8. [8. パネルの木](08-devtools-forest-ui.md)
9. [9. プロパティの直列化](09-devtools-state-serializer.md)
10. [10. 入れ子を開く](10-devtools-property-resolver.md)
11. [11. 値を書き換える](11-devtools-property-mutation.md)
12. [12. 選ぶ・光らせる](12-devtools-inspector-highlight.md)
13. [13. プロファイラーの記録](13-devtools-profiler-capture.md)
14. [14. 記録を描く](14-devtools-profiler-formatters.md)
15. [15. 変更検知を見張る](15-devtools-cd-analyzer.md)
16. [16. 注入器の木](16-devtools-injector-tree.md)
17. [17. signal のグラフ](17-devtools-signal-graph.md)
18. **18. ルーター・TransferState**（この章）
19. [19. テストとビルド](19-devtools-test-build.md)
20. [20. issue と PR を読む](20-devtools-issues.md)

## 1. ルーターを見つける

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L345–362 （▶ の行: 345, 347–348, 350, 352, 356, 361）

```ts
345 ▶ // todo: parse router tree with framework APIs after they are developed
346 │ const getRoutes = (messageBus: MessageBus<Events>) => {
347 ▶   const route = getRouterConfigFromRoot();
348 ▶   if (!route) return;
349 │ 
350 ▶   const sanitizedRoute = sanitizeRouteData(route);
351 │ 
352 ▶   messageBus.emit('updateRouterTree', [[sanitizedRoute]]);
353 │ };
354 │ 
355 │ const getRouterConfigFromRoot = (): Route | void => {
356 ▶   const router = getRouterInstance();
357 │   if (!router) {
358 │     return;
359 │   }
360 │ 
361 ▶   return parseRoutes(router);
362 │ };
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L434–449 （▶ の行: 435–436, 442, 448）

```ts
434 │ function getRouterInstance() {
435 ▶   const forest = getDirectiveForestManager().getIndexedDirectiveForest();
436 ▶   const rootNode = forest[0];
437 │ 
438 │   if (!rootNode || !rootNode.nativeElement) {
439 │     return null;
440 │   }
441 │ 
442 ▶   const injector = getInjectorFromElementNode(rootNode.nativeElement);
443 │   if (!injector) {
444 │     return null;
445 │   }
446 │ 
447 │   const ng = ngDebugClient();
448 ▶   return (ng as any).ɵgetRouterInstance?.(injector);
449 │ }
```

パネルが `getRoutes` を送ると、347 行目でルーターの設定を木にし、350 行目で送れる形に削って、352 行目で `updateRouterTree` を返します。ルーターは 435〜436 行目、**コンポーネントの木の 1 つめのルート**の要素の注入器から、448 行目の `ng.ɵgetRouterInstance` で取ります。ルーターが無ければ 348 行目で何も返しません。345 行目のコメントのとおり、「フレームワークの API ができたら置き換える」つもりの作りです。

📄 `angular/packages/router/src/router_devtools.ts` L13–36 （▶ の行: 16–17, 23–24, 31–32, 35）

```ts
13 │ /**
14 │  * Returns the loaded routes for a given route.
15 │  */
16 ▶ export function getLoadedRoutes(route: Route): Route[] | undefined {
17 ▶   return route._loadedRoutes;
18 │ }
19 │ 
20 │ /**
21 │  * Returns the Router instance from the given injector, or null if not available.
22 │  */
23 ▶ export function getRouterInstance(injector: Injector): Router | null {
24 ▶   return injector.get(Router, null, {optional: true});
25 │ }
26 │ 
27 │ /**
28 │  * Navigates the given router to the specified URL.
29 │  * Throws if the provided router is not an Angular Router.
30 │  */
31 ▶ export function navigateByUrl(router: Router, url: string): Promise<boolean> {
32 ▶   if (!(router instanceof Router)) {
33 │     throw new Error('The provided router is not an Angular Router.');
34 │   }
35 ▶   return router.navigateByUrl(url);
36 │ }
```

📄 `angular/packages/router/src/provide_router.ts` L108–113 （▶ の行: 108, 110–112）

```ts
108 ▶   if (typeof ngDevMode === 'undefined' || ngDevMode) {
109 │     // Publish this util when the router is provided so that the devtools can use it.
110 ▶     ɵpublishNonCoreGlobalUtil('ɵgetLoadedRoutes', getLoadedRoutes);
111 ▶     ɵpublishNonCoreGlobalUtil('ɵgetRouterInstance', getRouterInstance);
112 ▶     ɵpublishNonCoreGlobalUtil('ɵnavigateByUrl', navigateByUrl);
113 │   }
```

この 3 つの関数は router のパッケージの中にあり、`provideRouter` が呼ばれたとき、開発モードなら 110〜112 行目で `window.ng` に置きます（`provideRouter` の残りは [router-provide-router](../router/05-router-provide-router.md)）。17 行目の `_loadedRoutes` は、`loadChildren` で読み込んだ子のルートを router が覚えておく内部の欄です。バックエンドの `supportedApis.routes`（[第 2 回](02-devtools-detect.md)）はこの 3 つがそろっているかで決まり、記録のアプリでは `true` でした。`provideRouter` の無いアプリ（第 17 回の記録）では `false` です。

## 2. router.config を木に直す：parseRoutes

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/router-tree/router-tree.ts` L65–91 （▶ の行: 66, 71, 75–76, 79, 84, 87）

```ts
65 │ export function getActiveRouteConfigs(router: Router): Set<AngularRoute> {
66 ▶   const rootActivatedRoute = router.routerState?.root;
67 │   if (!rootActivatedRoute) {
68 │     return new Set();
69 │   }
70 │ 
71 ▶   return collectActiveRouteConfigs(rootActivatedRoute);
72 │ }
73 │ 
74 │ export function parseRoutes(router: Router): Route {
75 ▶   const rootName = 'App Root';
76 ▶   const rootChildren = router.config;
77 │ 
78 │   // Get the set of active Route configuration objects from the router state
79 ▶   const activeRouteConfigs = getActiveRouteConfigs(router);
80 │ 
81 │   const root: Route = {
82 │     component: rootName,
83 │     path: rootName,
84 ▶     children: rootChildren ? assignChildrenToParent(null, rootChildren, activeRouteConfigs) : [],
85 │     isAux: false,
86 │     isLazy: false,
87 ▶     isActive: true, // Root is always active.
88 │   };
89 │ 
90 │   return root;
91 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/router-tree/router-tree.ts` L33–50 （▶ の行: 38, 40, 44, 46）

```ts
33 │ function collectActiveRouteConfigs(
34 │   activatedRoute: ActivatedRoute,
35 │   activeRoutes: Set<AngularRoute> = new Set(),
36 │ ): Set<AngularRoute> {
37 │   // Get the routeConfig for this ActivatedRoute
38 ▶   const routeConfig = activatedRoute.routeConfig;
39 │   if (routeConfig) {
40 ▶     activeRoutes.add(routeConfig);
41 │   }
42 │ 
43 │   // Recursively process all children
44 ▶   const children = activatedRoute.children || [];
45 │   for (const child of children) {
46 ▶     collectActiveRouteConfigs(child, activeRoutes);
47 │   }
48 │ 
49 │   return activeRoutes;
50 │ }
```

1. **75〜88 行目：根は名前だけの「App Root」**

   根の `path` も `'App Root'` で、87 行目のとおりいつも active です。子は 76 行目の `router.config`（`provideRouter(routes)` に渡した配列）です。
2. **79 行目と 33〜50 行目：いま有効なルートの設定の集まりを先に作る**

   66 行目の `router.routerState.root`（いまの `ActivatedRoute` の木の根）から子をたどり、38 行目の `routeConfig`（その `ActivatedRoute` を作った設定のオブジェクトそのもの）を Set に入れます。あとで「この設定は Set に入っているか」を**オブジェクトの同一性**で比べます。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/router-tree/router-tree.ts` L106–139 （▶ の行: 111–114, 116–117, 120–121, 125, 130, 134）

```ts
106 │ function assignChildrenToParent(
107 │   parentPath: string | null,
108 │   children: Routes,
109 │   activeRouteConfigs: Set<AngularRoute>,
110 │ ): Route[] {
111 ▶   return children.map((child: AngularRoute) => {
112 ▶     const childName = childRouteName(child);
113 ▶     const loadedRoutes = (window as any).ng?.ɵgetLoadedRoutes?.(child as any);
114 ▶     const childDescendents: [AngularRoute] = loadedRoutes || child.children;
115 │ 
116 ▶     const pathFragment = child.outlet ? `(${child.outlet}:${child.path})` : child.path;
117 ▶     const routePath = `${parentPath ?? ''}/${pathFragment}`.split('//').join('/');
118 │ 
119 │     // only found in aux routes, otherwise property will be undefined
120 ▶     const isAux = Boolean(child.outlet);
121 ▶     const isLazy = Boolean(child.loadChildren || child.loadComponent);
122 │ 
123 │     // Check if this route configuration object is in the active routes set
124 │     // This is the direct reference to the Route object from router.config
125 ▶     const isActive = activeRouteConfigs.has(child);
126 │ 
127 │     const routeConfig: Route = {
128 │       pathMatch: child.pathMatch,
129 │       component: childName,
130 ▶       canActivateGuards: getGuardNames(child, 'canActivate'),
131 │       canActivateChildGuards: getGuardNames(child, 'canActivateChild'),
132 │       canMatchGuards: getGuardNames(child, 'canMatch'),
133 │       canDeactivateGuards: getGuardNames(child, 'canDeactivate'),
134 ▶       providers: getProviderName(child),
135 │       path: routePath,
136 │       isAux,
137 │       isLazy,
138 │       isActive,
139 │     };
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/router-tree/router-tree.ts` L141–181 （▶ の行: 142, 146, 153, 160–161, 171–172, 177）

```ts
141 │     if (child.title) {
142 ▶       routeConfig.title = getPropertyName(child, 'title');
143 │     }
144 │ 
145 │     if (child.redirectTo) {
146 ▶       routeConfig.redirectTo = getPropertyName(child, 'redirectTo');
147 │     }
148 │ 
149 │     if (child.matcher) {
150 │       routeConfig.matcher = getPropertyName(child, 'matcher');
151 │       // For custom matchers, override the path to indicate it's a matcher
152 │       // Since the path be undefined when using a matcher, because the matcher defines the path matching
153 ▶       routeConfig.path = '[Matcher]';
154 │     }
155 │ 
156 │     if (child.runGuardsAndResolvers) {
157 │       routeConfig.runGuardsAndResolvers = getPropertyName(child, 'runGuardsAndResolvers');
158 │     }
159 │ 
160 ▶     if (childDescendents) {
161 ▶       routeConfig.children = assignChildrenToParent(
162 │         routeConfig.path,
163 │         childDescendents,
164 │         activeRouteConfigs,
165 │       );
166 │     }
167 │ 
168 │     if (child.resolve) {
169 │       routeConfig.resolvers = {};
170 │ 
171 ▶       for (const [name, resolver] of Object.entries(child.resolve)) {
172 ▶         routeConfig.resolvers[name] = getClassOrFunctionName(resolver);
173 │       }
174 │     }
175 │ 
176 │     if (child.data) {
177 ▶       routeConfig.data = child.data;
178 │     }
179 │ 
180 │     return routeConfig;
181 │   });
```

1. **113〜114 行目：子は `ɵgetLoadedRoutes` が先、無ければ `children`**

   `loadChildren` のルートは、読み込むまで子がありません。デモの「'/reports/x'」の場面で、読み込んだあとに初めて `/reports/x` が子に現れます。
2. **116〜117 行目：道筋は親の道筋＋自分。名前つきの outlet は `(名前:path)`**

   117 行目の `split('//').join('/')` で、根の直下の `//users` を `/users` にします。デモの `help`（`outlet: 'side'`）は `/(side:help)` です。
3. **121 行目：`loadChildren` か `loadComponent` があれば lazy**

   読み込んだあとでも lazy のままです。
4. **125 行目：active は 2 節の Set に「この設定のオブジェクト」が入っているか**

   前は URL の文字列の前方一致でした（4 節）。
5. **130〜134 行目と 141〜174 行目：関数やクラスは名前の文字列にする**

   guard・resolver・`title`・`redirectTo`・`matcher` は関数のこともあるので、そのままでは送れません。153 行目、`matcher` のルートは道筋を `[Matcher]` にします。
6. **177 行目：`data` だけは中身をそのまま入れる**

   中身に関数や循環があるかもしれないので、3 節で削ります。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/router-tree/router-tree.ts` L93–104 （▶ の行: 96, 101–102）

```ts
 93 │ function getGuardNames(child: AngularRoute, type: RouteGuard): string[] {
 94 │   const guards = child?.[type] || [];
 95 │ 
 96 ▶   const names = guards.map((g: any) => getClassOrFunctionName(g));
 97 │   return names || [];
 98 │ }
 99 │ 
100 │ function getProviderName(child: any): string[] {
101 ▶   const providers = child?.providers || [];
102 ▶   const names = providers.map((p: any) => p.name);
103 │   return names || [];
104 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/router-tree/router-tree.ts` L191–227 （▶ の行: 192, 194, 196–197, 200, 212–213, 220–223, 225）

```ts
191 │ function getClassOrFunctionName(fn: Function, defaultName?: string) {
192 ▶   const isArrow = !Object.hasOwn(fn, 'prototype');
193 │ 
194 ▶   const isEmptyName = fn.name === '';
195 │ 
196 ▶   if ((isArrow && isEmptyName) || isEmptyName) {
197 ▶     return '[Function]';
198 │   }
199 │ 
200 ▶   const hasDefaultName = fn.name === defaultName;
201 │   if (hasDefaultName) {
202 │     return '[Function]';
203 │   }
204 │ 
205 │   return fn.name;
206 │ }
207 │ 
208 │ function getPropertyName(
209 │   child: AngularRoute,
210 │   property: 'title' | 'redirectTo' | 'matcher' | 'runGuardsAndResolvers',
211 │ ) {
212 ▶   if (child[property] instanceof Function) {
213 ▶     return getClassOrFunctionName(child[property], property);
214 │   }
215 │ 
216 │   return child[property];
217 │ }
218 │ 
219 │ function childRouteName(child: AngularRoute): string {
220 ▶   if (child.component) {
221 ▶     return child.component.name;
222 ▶   } else if (child.loadChildren || child.loadComponent) {
223 ▶     return `${child.path} [Lazy]`;
224 │   } else {
225 ▶     return 'no-name-route';
226 │   }
227 │ }
```

名前の付け方は `getClassOrFunctionName` の 3 つの場合です。名前が空なら 196〜197 行目で `[Function]`。`const userResolver = () => …` のように変数に入れた矢印関数は、JavaScript が変数の名前を関数の `name` にするので `userResolver` と出ます。200 行目の `defaultName` は、`title: function title() {}` のように欄の名前と同じ名前の関数を `[Function]` と見なすためのものです（212〜213 行目から欄の名前を渡す）。ルートの見出しは 220〜225 行目で、コンポーネントのクラスの名前、lazy なら `admin [Lazy]`、どちらも無ければ（`redirectTo` だけのルートなど）`no-name-route` です。

> [!WARNING]
> **ハマりどころ**
>
> 102 行目の provider の名前は `p.name` だけを見ます。クラスを並べた `providers: [UsersApi]` なら `UsersApi` ですが、`{ provide: 'TOKEN', useValue: 1 }` のようなオブジェクトの provider には `name` が無いので `undefined` になり、メッセージでは `null` として届きます（デモの `/users` の providers が `["UsersApi", null]`）。router-tree.spec.ts には、オブジェクトの provider を使う it がありません（grep で確かめました）。

## 3. 送れる形に削る：sanitizeRouteData と sanitizeObject

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L695–706 （▶ の行: 697–698, 701–702）

```ts
695 │ // Route data needs to be serializable to be sent over the message bus.
696 │ export function sanitizeRouteData(route: Route): Route {
697 ▶   if (route.data) {
698 ▶     route.data = sanitizeObject(route.data);
699 │   }
700 │ 
701 ▶   if (route.children) {
702 ▶     route.children = route.children.map(sanitizeRouteData);
703 │   }
704 │ 
705 │   return route;
706 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/utils/serialization.ts` L13–48 （▶ の行: 15, 18, 21, 23, 32–33, 35, 39, 44–45）

```ts
13 │   function recurse(value: any): any {
14 │     // Primitives and null
15 ▶     if (value === null || typeof value !== 'object') {
16 │       // Some primitives are not serializable
17 │       if (
18 ▶         typeof value === 'function' ||
19 │         typeof value === 'symbol' ||
20 │         typeof value === 'bigint' ||
21 ▶         value === undefined
22 │       ) {
23 ▶         return '[Non-serializable data]';
24 │       }
25 │ 
26 │       // Most other primitives are serializable
27 │       return value;
28 │     }
29 │ 
30 │     // Down here we only have objects
31 │     // Check for circular references
32 ▶     if (seen.has(value)) {
33 ▶       return '[Circular]';
34 │     }
35 ▶     seen.add(value);
36 │ 
37 │     // Recursively serialize arrays
38 │     if (Array.isArray(value)) {
39 ▶       return value.map(recurse);
40 │     }
41 │ 
42 │     // Recursively serialize objects
43 │     const result: Record<string, any> = {};
44 ▶     for (const [key, propValue] of Object.entries(value)) {
45 ▶       result[key] = recurse(propValue);
46 │     }
47 │     return result;
48 │   }
```

697〜698 行目で `data` を作り直し、701〜702 行目で子にも同じことをします。698 行目は 2 節で作った送る用のオブジェクトの欄を差し替えるだけで、利用者の `route.data` は書き換えません（記録で確かめました。下のデモの最後）。`sanitizeObject` は、関数・symbol・bigint・`undefined` を 23 行目の `[Non-serializable data]` に、一度見たオブジェクトを 33 行目の `[Circular]` にします。

> [!WARNING]
> **ハマりどころ**
>
> 32〜35 行目の「一度見たか」は、**今たどっている道の上にあるか**ではなく、**どこかで一度でも見たか**です（`seen` から外す行が無い）。だから循環していなくても、同じオブジェクトを 2 か所から指すと、2 つめが `[Circular]` になります。デモの `data: { a: shared, b: shared }` は、`b` が `[Circular]` で届きました。serialization.spec.ts の it は 4 件（そのまま・関数・入れ子の関数・循環）で、同じものを 2 か所から指す it はありません。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L208–218 （▶ の行: 210–211, 214, 216）

```ts
208 │ const getRoutesCallback = (messageBus: MessageBus<Events>) => () => getRoutes(messageBus);
209 │ 
210 ▶ const navigateRouteCallback = (messageBus: MessageBus<Events>) => (path: string) => {
211 ▶   const router: any = getRouterInstance();
212 │   // If the router is not found or the navigateByUrl method is not available, we can't navigate
213 │   if (router) {
214 ▶     ngDebugClient().ɵnavigateByUrl?.(router, path);
215 │   } else {
216 ▶     log.warn('Router not found or navigateByUrl method not available');
217 │   }
218 │ };
```

パネルで木のノードを押して「移動」すると、`navigateRoute` にそのルートの道筋が届き、214 行目で 1 節の `ɵnavigateByUrl`（`router.navigateByUrl`）を呼びます。`:id` の入った道筋はそのまま渡るので、どのルートに当たるかは router が決めます。

## 4. パネルの木：transformRoutesIntoVisTree

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/router-tree/router-tree.component.ts` L78–88 （▶ の行: 78–79, 81–82, 85）

```ts
78 ▶   routes = input.required<Route[]>();
79 ▶   routerDebugApiSupport = input<boolean>(false);
80 │ 
81 ▶   private readonly showFullPath = signal(false);
82 ▶   protected readonly d3RootNode = linkedSignal<RouterTreeNode | null>(() => {
83 │     const routes = this.routes();
84 │     if (routes.length) {
85 ▶       return transformRoutesIntoVisTree(routes[0], this.showFullPath());
86 │     }
87 │     return null;
88 │   });
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/router-tree/router-tree-fns.ts` L20–38 （▶ の行: 25, 33–36）

```ts
20 │ export function getRouteLabel(
21 │   route: Route | RouterTreeNode,
22 │   parent: Route | RouterTreeNode | undefined,
23 │   showFullPath: boolean,
24 │ ): string {
25 ▶   return (showFullPath ? route.path : route.path.replace(parent?.path || '', '')) || '';
26 │ }
27 │ 
28 │ export function mapRoute(
29 │   route: Route,
30 │   parent: Route | undefined,
31 │   showFullPath: boolean,
32 │ ): RouterTreeNode {
33 ▶   return {
34 ▶     ...route,
35 ▶     label: getRouteLabel(route, parent, showFullPath),
36 ▶     children: [],
37 │   };
38 │ }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/router-tree/router-tree-fns.ts` L40–64 （▶ の行: 42, 45–46, 52–53, 56, 58）

```ts
40 │ export function transformRoutesIntoVisTree(root: Route, showFullPath: boolean): RouterTreeNode {
41 │   let rootNode: RouterTreeNode | undefined;
42 ▶   const routesQueue: {route: Route; parent?: RouterTreeNode}[] = [{route: root}];
43 │ 
44 │   while (routesQueue.length) {
45 ▶     const {route, parent} = routesQueue.shift()!;
46 ▶     const routeNode = mapRoute(route, parent, showFullPath);
47 │ 
48 │     if (!rootNode) {
49 │       rootNode = routeNode;
50 │     }
51 │ 
52 ▶     if (parent) {
53 ▶       parent.children.push(routeNode);
54 │     }
55 │ 
56 ▶     if (route.children) {
57 │       for (const child of route.children) {
58 ▶         routesQueue.push({route: child, parent: routeNode});
59 │       }
60 │     }
61 │   }
62 │ 
63 │   return rootNode!;
64 │ }
```

パネルの `RouterTreeComponent` は届いた配列の 1 つめ（85 行目の `routes[0]`、つまり App Root）を、`linkedSignal` で表示用の木にします。`transformRoutesIntoVisTree` は 42 行目の待ち行列で幅優先にたどり、46 行目で各ルートを写して、53 行目で親の `children` に足します。見出しは 25 行目で、ふつうは自分の道筋から親の道筋を取り除いたもの（`/users/:id` の下なら `/:id`）、「道筋を全部出す」設定（81 行目）なら道筋そのままです。79 行目、`supportedApis.routes` が偽ならタブは中身を出しません。

active の判定は cfb26f59992（2025-11-09、AleksanderBodurri、PR #65037）で 2 節の Set の形になりました。前は `currentUrl?.startsWith(routePath.split('/:')[0])` で、URL の文字列の前方一致でした。この形だと、`''` のルートの道筋 `/` はどの URL の頭にも一致するので、Home がいつも active に見え（#63493）、トップページでは子のルートまで active に見えました（#63490）。直しの spec の変更は router-tree.spec.ts の期待値 8 か所の `isActive: undefined` → `false` だけで、「active になる」ことを確かめる it は足されていません。

## 5. TransferState のタブ：ページの script を読む

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L614–641 （▶ の行: 617–619, 623, 626, 629, 632, 635, 640）

```ts
614 │ const getTransferStateCallback = (messageBus: MessageBus<Events>) => () => {
615 │   const ng = ngDebugClient();
616 │ 
617 ▶   const forest = getDirectiveForestManager().getIndexedDirectiveForest();
618 ▶   if (forest.length === 0) {
619 ▶     messageBus.emit('transferStateData', [null]);
620 │     return;
621 │   }
622 │ 
623 ▶   const merged: Record<string, TransferStateValue> = {};
624 │   let collected = false;
625 │ 
626 ▶   for (const rootNode of forest) {
627 │     if (!rootNode?.nativeElement) continue;
628 │ 
629 ▶     const injector = getInjectorFromElementNode(rootNode.nativeElement);
630 │     if (!injector) continue;
631 │ 
632 ▶     const rootData = ng.ɵgetTransferState?.(injector) as
633 │       Record<string, TransferStateValue> | null | undefined;
634 │     if (rootData && typeof rootData === 'object') {
635 ▶       Object.assign(merged, rootData);
636 │       collected = true;
637 │     }
638 │   }
639 │ 
640 ▶   messageBus.emit('transferStateData', [collected ? merged : null]);
641 │ };
```

📄 `angular/packages/core/src/render3/util/transfer_state_utils.ts` L24–39 （▶ の行: 25–26, 28, 32–34）

```ts
24 │ export function getTransferState(injector: Injector): Record<string, unknown> {
25 ▶   const doc = injector.get(DOCUMENT);
26 ▶   const appId = injector.get(APP_ID);
27 │ 
28 ▶   const transferState = retrieveTransferredState(doc, appId);
29 │ 
30 │   // Strip internal keys
31 │   const filteredEntries: Record<string, unknown> = {};
32 ▶   for (const [key, value] of Object.entries(transferState)) {
33 ▶     if (!isInternalHydrationTransferStateKey(key)) {
34 ▶       filteredEntries[key] = value;
35 │     }
36 │   }
37 │ 
38 │   return filteredEntries;
39 │ }
```

📄 `angular/packages/core/src/transfer_state.ts` L164–167 （▶ の行: 166）

```ts
164 │   // Locate the script tag with the JSON data transferred from the server.
165 │   // The id of the script tag is set to the Angular appId + 'state'.
166 ▶   const script = doc.getElementById(appId + '-state');
167 │   if (script?.tagName === 'SCRIPT' && script.textContent) {
```

1. **626〜638 行目：コンポーネントの木のルートごとに `ɵgetTransferState` を呼び、1 つにまとめる**

   06db706238b（2026-05-03、feat）で、前の「1 つめのルートだけ」から「すべてのルート」に変わりました。
2. **core の 25〜28 行目：`TransferState` の service ではなく、ページの `<script>` を読む**

   166 行目、`APP_ID`（既定は `ng`）＋ `-state` の id の要素の中身を `JSON.parse` します。サーバーが `renderApplication` の最後に書き出した JSON です（[http-transfer-cache](../http/11-http-transfer-cache.md)）。
3. **core の 32〜36 行目：ハイドレーションが使う内部の鍵を除く**

   `isInternalHydrationTransferStateKey` が除くのは `__nghData__` と `__nghDeferData__` の 2 つです（`hydration/utils.ts`）。

> [!NOTE]
> **ポイント**
>
> ページの `<script>` を読むので、**ブラウザで動いているあいだに `TransferState.set()` した値はタブに出ません**。記録のアプリはコンストラクタで `setAtRuntime` に 42 を入れ、`TransferState.get()` では 42 が返りましたが、`transferStateData` にはありませんでした。逆に、ブラウザの `TransferState` が一度読んで消した値（`HttpClient` の転送キャッシュなど）も、`<script>` が残っていれば出ます。タブが見せるのは「サーバーが送ったもの」です。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/transfer-state/transfer-state.component.ts` L177–204 （▶ の行: 180–181, 184, 195, 198）

```ts
177 │   constructor() {
178 │     const destroyRef = inject(DestroyRef);
179 │ 
180 ▶     const off = this.messageBus.on(
181 ▶       'transferStateData',
182 │       (data: Record<string, TransferStateValue> | null) => {
183 │         this.clearLoadingTimeout();
184 ▶         this.transferStateData.set(data ?? {});
185 │       },
186 │     );
187 │ 
188 │     destroyRef.onDestroy(() => {
189 │       off();
190 │       this.clearLoadingTimeout();
191 │       this.copyTimeoutIds.forEach(clearTimeout);
192 │       this.copyTimeoutIds.clear();
193 │     });
194 │ 
195 ▶     this.startLoadingTimeout();
196 │ 
197 │     try {
198 ▶       this.messageBus.emit('getTransferState');
199 │     } catch (err) {
200 │       this.clearLoadingTimeout();
201 │       this.transferStateData.set({});
202 │       this.error.set(`Error loading transfer state: ${err}`);
203 │     }
204 │   }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/transfer-state/transfer-state.component.ts` L100–120 （▶ の行: 100, 102, 104, 108–109, 113–115）

```ts
100 ▶   readonly transferStateData = signal<Record<string, TransferStateValue> | null>(null);
101 │   readonly error = signal<string | null>(null);
102 ▶   readonly isLoading = computed(() => this.transferStateData() === null);
103 │ 
104 ▶   readonly transferStateItems = linkedSignal<TransferStateItem[]>(() => {
105 │     const data = this.transferStateData();
106 │     if (!data) return [];
107 │ 
108 ▶     return Object.entries(data).map(([key, value]) => {
109 ▶       const bytes = getByteSize(key, value);
110 │       return {
111 │         key,
112 │         value,
113 ▶         tree: buildValueTree(value),
114 ▶         type: this.getValueType(value),
115 ▶         size: bytes === null ? '—' : formatBytes(bytes),
116 │         bytes,
117 │         isCopied: false,
118 │       };
119 │     });
120 │   });
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/transfer-state/transfer-state.component.ts` L50–66 （▶ の行: 54–55, 58, 61–62, 65）

```ts
50 │ // Per-entry bytes are measured as `"key":value` so summing them across the
51 │ // table approximates the total transferred payload.
52 │ function getByteSize(key: string, value: TransferStateValue): number | null {
53 │   let valueRepr: string;
54 ▶   if (value === undefined) {
55 ▶     valueRepr = 'undefined';
56 │   } else {
57 │     try {
58 ▶       const serialized = JSON.stringify(value);
59 │       if (serialized === undefined) return null;
60 │       valueRepr = serialized;
61 ▶     } catch {
62 ▶       return null;
63 │     }
64 │   }
65 ▶   return new Blob([`${JSON.stringify(key)}:${valueRepr}`]).size;
66 │ }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/transfer-state/value-tree-builder.ts` L15–46 （▶ の行: 16, 21–22, 26, 37）

```ts
15 │ export function buildValueTree(value: TransferStateValue): FlatNode[] {
16 ▶   return [createNode(ROOT_NAME, value, 0, new WeakSet())];
17 │ }
18 │ 
19 │ function createNode(name: string, value: unknown, level: number, seen: WeakSet<object>): FlatNode {
20 │   const isObj = value !== null && typeof value === 'object';
21 ▶   const circular = isObj && seen.has(value as object);
22 ▶   const expandable = isObj && !circular;
23 │ 
24 │   let children: FlatNode[] = [];
25 │   if (expandable) {
26 ▶     seen.add(value as object);
27 │     children = buildChildren(value as object, level + 1, seen);
28 │   }
29 │ 
30 │   return {
31 │     expandable,
32 │     level,
33 │     prop: {
34 │       name,
35 │       parent: null,
36 │       descriptor: {
37 ▶         preview: circular ? CIRCULAR_PREVIEW : getValuePreview(value),
38 │         value: children,
39 │         expandable,
40 │         editable: false,
41 │         containerType: null,
42 │         type: getPropType(value),
43 │       },
44 │     },
45 │   };
46 │ }
```

- **198 行目：**タブが作られたときに 1 回だけ `getTransferState` を送り、184 行目で返事を受けます。`null`（ルートが無い、どのルートからも取れない）は `{}` にそろえ、「この app には転送された値が無い」の説明の画面にします。195 行目、5 秒（`LOADING_TIMEOUT`）待って返事が無ければエラーの表示です。
- **58〜65 行目：**大きさは `"鍵":JSON` の文字列の UTF-8 のバイト数（`Blob` の `size`）です。表の合計が、送られた量の目安になります。循環があると `JSON.stringify` が投げるので 61〜62 行目で `null`（表では —）。ただし 5 節のとおり値はページの JSON から来るので、ふつうは循環しません。
- **15〜46 行目：**値の木はパネルの中で作ります（バックエンドの直列化を通さない）。21 行目、同じオブジェクトに 2 度目に会ったら 37 行目で `[Circular]` です。

## 6. ハイドレーションの重ね表示：hydration-overlays.ts

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/hydration/hydration-overlays.ts` L28–49 （▶ の行: 29, 33–34, 39–41, 46–47）

```ts
28 │ export function enableHydrationOverlays() {
29 ▶   if (hydrationOverlaysEnabled) {
30 │     return;
31 │   }
32 │ 
33 ▶   hydrationOverlaysEnabled = true;
34 ▶   highlightHydrationNodes();
35 │ 
36 │   runOutsideAngular(() => {
37 │     // We are throttling CD events due to the
38 │     // possiblity of scroll-induced event flood.
39 ▶     profilerSubs = getProfiler()
40 ▶       .changeDetection$.pipe(debounceTime(250))
41 ▶       .subscribe(() => refresh());
42 │   });
43 │ }
44 │ 
45 │ export function disableHydrationOverlays() {
46 ▶   removeHydrationHighlights();
47 ▶   profilerSubs?.unsubscribe();
48 │   hydrationOverlaysEnabled = false;
49 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/hydration/hydration-overlays.ts` L51–69 （▶ の行: 52, 55, 57, 61, 64, 66–67）

```ts
51 │ function highlightHydrationNodes(): void {
52 ▶   const forest: ComponentTreeNode[] = getDirectiveForestManager().getDirectiveForest();
53 │ 
54 │   // drop the root nodes, we don't want to highlight it
55 ▶   const forestWithoutRoots = forest.flatMap((rootNode) => rootNode.children);
56 │ 
57 ▶   const errorNodes = findErrorNodesForHydrationOverlay(forestWithoutRoots);
58 │ 
59 │   // We get the first level of hydrated nodes
60 │   // nested mismatched nodes nested in hydrated nodes aren't includes
61 ▶   const nodes = findNodesForHydrationOverlay(forestWithoutRoots);
62 │ 
63 │   // This ensures top level mismatched nodes are removed as we have a dedicated array
64 ▶   const otherNodes = nodes.filter(({status}) => status?.status !== 'mismatched');
65 │ 
66 ▶   for (const {node, status} of [...otherNodes, ...errorNodes]) {
67 ▶     highlightHydrationElement(node as Element, status);
68 │   }
69 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/hydration/hydration-overlays.ts` L82–100 （▶ の行: 85–86, 89, 92, 95–96, 99）

```ts
 82 │ function highlightHydrationElement(node: Element, {status}: HydrationStatus) {
 83 │   let template: HighlightTemplate;
 84 │ 
 85 ▶   switch (status) {
 86 ▶     case 'hydrated':
 87 │       template = hydrationCompletedHighlightTemplate;
 88 │       break;
 89 ▶     case 'mismatched':
 90 │       template = hydrationMismatchedHighlightTemplate;
 91 │       break;
 92 ▶     case 'skipped':
 93 │       template = hydrationSkippedHighlightTemplate;
 94 │       break;
 95 ▶     default:
 96 ▶       throw new AngularDevtoolsError(`Unsupported hydration status highlighting: ${status}`);
 97 │   }
 98 │ 
 99 ▶   highlightElement(node, template, {'icon': [status]});
100 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/hydration/hydration-overlays.ts` L102–133 （▶ の行: 110, 112, 114–115, 125, 127, 129–130）

```ts
102 │ /**
103 │  * Returns the first level of hydrated nodes
104 │  * Note: Mismatched nodes nested in hydrated nodes aren't included
105 │  */
106 │ function findNodesForHydrationOverlay(
107 │   forest: ComponentTreeNode[],
108 │ ): {node: Node; status: HydrationStatus}[] {
109 │   return forest.flatMap((node) => {
110 ▶     if (node?.hydration?.status) {
111 │       // We highlight first level
112 ▶       return {node: node.nativeElement!, status: node.hydration};
113 │     }
114 ▶     if (node.children.length) {
115 ▶       return findNodesForHydrationOverlay(node.children);
116 │     }
117 │     return [];
118 │   });
119 │ }
120 │ 
121 │ function findErrorNodesForHydrationOverlay(
122 │   forest: ComponentTreeNode[],
123 │ ): {node: Node; status: HydrationStatus}[] {
124 │   return forest.flatMap((node) => {
125 ▶     if (node?.hydration?.status === 'mismatched') {
126 │       // We highlight first level
127 ▶       return {node: node.nativeElement!, status: node.hydration};
128 │     }
129 ▶     if (node.children.length) {
130 ▶       return findNodesForHydrationOverlay(node.children);
131 │     }
132 │     return [];
133 │   });
```

1. **33〜41 行目：有効にしたら 1 回描き、変更検知のたびに描き直す**

   39〜41 行目、プロファイラー（[第 13 回](13-devtools-profiler-capture.md)）の `changeDetection$` を 250 ミリ秒の `debounceTime` で間引いて購読します。スクロールで変更検知が続けて走っても、描き直しは止まってからの 1 回です。635ef1bd80e（2026-09-04、refactor）で、この描き直しをパネルからバックエンドに移しました。前はパネルの `directive-explorer.component.ts` が木を受け取るたびに「消して作る」のメッセージを 2 つ送っていました。
2. **52〜61 行目：木のノードの `hydration` の欄から、枠を付けるノードを選ぶ**

   欄の値は木を集めるときに、要素の `ngh` 属性（まだハイドレーションしていない）と、core が開発モードで要素に付ける `__ngDebugHydrationInfo__` から決まります（[第 6 回](06-devtools-control-flow.md)）。55 行目でルートそのものは除き、109〜118 行目で「上から見て最初に状態を持つノード」だけを取ります。
3. **85〜99 行目：状態ごとに枠の型を選んで、99 行目で光らせる**

   光らせる仕組みは[第 12 回](12-devtools-inspector-highlight.md)の highlighter です。

> [!WARNING]
> **ハマりどころ**
>
> **129〜130 行目**：ずれた（mismatched）ノードを探す `findErrorNodesForHydrationOverlay` は、子へ進むときに自分ではなく 109 行目の `findNodesForHydrationOverlay` を呼びます。だから、ハイドレーションできた親の中の、ずれた子は見つかりません。main では 3eaae88e5d7（2026-09-20、fix）が 130 行目を自分を呼ぶ形に直しました（spec の追加は無し。手元の木にはまだ無い）。
>
> **85〜97 行目**：`switch` には `hydrated`・`mismatched`・`skipped` しかなく、プロトコルの型にある 4 つめの `dehydrated`（まだハイドレーションしていない）は 96 行目で `AngularDevtoolsError` を投げます。112 行目は状態を持つノードを種類を見ずに返すので、ルートの直下に `ngh` の残った要素があると、重ね表示を有効にしたところで投げて止まります。記録の環境で、描画したあとの子の要素に `ngh` 属性を手で付けて `enableHydrationOverlays` を送ると、`AngularDevtoolsError: Unsupported hydration status highlighting: dehydrated` が投げられました（scratchpad の hydration-dehydrated.ts）。incremental hydration（`@defer (hydrate on …)`）の本物のページでは確かめていません。main の同じ行も同じです（`git show origin/main:…` で確かめた）。gh で探した範囲では、同じ報告は見つかりませんでした。

## 7. DEMO：getRoutes と getTransferState を本物のバックエンドに送る

> **🧪 DEMO — updateRouterTree → transformRoutesIntoVisTree、transferStateData（記録の再生）**
>
> これは記録です。本物の devtools のソース（angular/angular の devtools/、8576f161ae4）を、本物の @angular/core 22.1.6（開発モード）のアプリにつないで Node で動かした結果です。アプリは `provideRouter` で入れ子・`loadComponent`・`loadChildren`・guard・resolver・`data`・名前つきの outlet を持ち、ページには「サーバーが書いたことにした」`<script id="ng-state">` を置きました。場面ごとに `router.navigateByUrl` で移ってから `getRoutes` を送り、届いた木をパネルの `transformRoutesIntoVisTree`（本物）に通しました。行の開き方と開く・閉じるのボタンはこの章のものです。
>
> 場面のボタンを押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-router-transfer)

記録から読み取れることです。

1. **active は「いま使っている設定のオブジェクト」**

   '/' では `/` だけ、'/users/7' では `/users` と `/users/:id`、'/reports/x' では `/reports` と `/reports/x` が active です。`/users` のときに `/` は active になりません（4 節の前の不具合が無い）。
2. **lazy の子は読み込んだあとに現れる**

   `/reports` の子は、'/reports/x' へ移るまで無く、移ったあと `ɵgetLoadedRoutes`（113 行目）から `Report` が出ます。`/admin`（`loadComponent`）には子がなく、見出しは `admin [Lazy]` のままです。
3. **名前**

   `export function authGuard()` は `authGuard`、クラスの `ChildGuard` は `ChildGuard`、`canMatch: [() => true]` は `[Function]`、`const userResolver = () => …` は `userResolver` です。
4. **data**

   `fn` は `[Non-serializable data]`、`loop.self` は `[Circular]`、そして循環していない `b`（`a` と同じオブジェクト）も `[Circular]` です（3 節の注意）。
5. **TransferState**

   `__nghData__` と `__nghDeferData__` は除かれ、`user` と `flags` だけが届きました。`setAtRuntime` はありません（5 節）。

記録のスクリプトの全文です（共通の部品 harness.ts は[第 1 回](01-devtools-overview.md)に全文があります）。`@angular/router` が `@angular/common` を先に読み込むので、JIT のコンパイラ（`@angular/compiler`）をいちばん先に読み込んでいます。

📄 `scratchpad の記録スクリプト（router-transfer.ts、共通の build.mjs で束ねて node で実行）`

```
// 第 18 回 devtools-router-transfer の記録。
// provideRouter で入れ子・lazy（loadComponent と loadChildren）・guard・resolver・data・名前つき outlet を持つアプリを描画し、
// 本物のバックエンドに getRoutes を送って updateRouterTree を、パネルの transformRoutesIntoVisTree にも通す。
// TransferState は、サーバーが書いたことにした <script id="ng-state"> をページに置いて getTransferState を送る。
// @angular/router が @angular/common を先に読むので、JIT のコンパイラを最初に読む
import '@angular/compiler';
import { Component, Injectable, TransferState, inject, makeStateKey, ɵglobal as g } from '@angular/core';
import { CanActivateChild, Router, RouterOutlet, provideRouter } from '@angular/router';
import { bootApp, makeBus, loadBackend, tick, writeJson, clone } from '../_shared/harness';
import { transformRoutesIntoVisTree } from '~/angular-research/angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/router-tree/router-tree-fns';

const OUT = process.argv[2] ?? 'router-transfer.json';

@Component({ selector: 'app-home', template: 'home' }) class Home {}
@Component({ selector: 'app-users', imports: [RouterOutlet], template: 'users <router-outlet />' }) class UsersShell {}
@Component({ selector: 'app-user', template: 'user' }) class UserDetail {}
@Component({ selector: 'app-help', template: 'help' }) class Help {}
@Component({ selector: 'app-admin', template: 'admin' }) class Admin {}
@Component({ selector: 'app-report', template: 'report' }) class Report {}
@Injectable() class UsersApi {}
@Injectable({ providedIn: 'root' })
class ChildGuard implements CanActivateChild {
  canActivateChild() {
    return true;
  }
}
export function authGuard() {
  return true;
}
const userResolver = () => ({ id: 7 });
const shared = { color: 'red' };
const loop: any = { name: 'loop' };
loop.self = loop;

const routes = [
  { path: '', component: Home, title: 'Home' },
  {
    path: 'users',
    component: UsersShell,
    canActivate: [authGuard],
    canActivateChild: [ChildGuard],
    providers: [UsersApi, { provide: 'TOKEN', useValue: 1 }],
    children: [
      { path: ':id', component: UserDetail, resolve: { user: userResolver }, data: { tab: 'profile', a: shared, b: shared, fn: () => 1, loop } },
    ],
  },
  { path: 'admin', loadComponent: () => Promise.resolve(Admin), canMatch: [() => true] },
  { path: 'reports', loadChildren: () => Promise.resolve([{ path: 'x', component: Report }]) },
  { path: 'legacy', redirectTo: 'users' },
  { path: 'help', component: Help, outlet: 'side' },
];

@Component({ selector: 'app-root', imports: [RouterOutlet], template: '<router-outlet /><router-outlet name="side" />' })
class Root {
  constructor() {
    // アプリが動いているあいだに TransferState に入れた値（ページの <script> には書かれない）
    inject(TransferState).set(makeStateKey<number>('setAtRuntime'), 42);
  }
}

const state = { user: { id: 7, name: 'Ada' }, flags: ['a', 'b'], __nghData__: [{ c: 1 }], __nghDeferData__: {} };
const html =
  '<html><head></head><body><app-root></app-root>' +
  `<script id="ng-state" type="application/json">${JSON.stringify(state)}</script></body></html>`;

(globalThis as any).window ??= globalThis;
const { appRef } = await bootApp(Root, { providers: [provideRouter(routes as any)], html });
await tick(20);
const { initializeMessageBus } = await loadBackend();
const { bus, send, take } = makeBus();
initializeMessageBus(bus as any);
send('queryNgAvailability');
send('getLatestComponentExplorerView', [undefined]);
await tick(20);
const availability = take().find((m) => m.topic === 'ngAvailability')?.args[0] as any;

const ng = (g as any).ng;
const router: Router = ng.ɵgetRouterInstance(ng.getInjector((globalThis as any).document.querySelector('app-root')));

function askRoutes() {
  send('getLatestComponentExplorerView', [undefined]);
  take();
  send('getRoutes');
  const msg = take().find((m) => m.topic === 'updateRouterTree');
  const routesMsg = (msg?.args[0] ?? null) as any;
  const tree = routesMsg ? clone(transformRoutesIntoVisTree(routesMsg[0], false)) : null;
  return { routes: routesMsg, tree };
}

const scenes: any[] = [];
scenes.push({ id: 'start', title: "最初（URL は '/'）", url: router.url, ...askRoutes() });
await router.navigateByUrl('/users/7');
appRef.tick();
await tick(20);
scenes.push({ id: 'users', title: "'/users/7' へ移ったあと", url: router.url, ...askRoutes() });
await router.navigateByUrl('/reports/x');
appRef.tick();
await tick(20);
scenes.push({ id: 'reports', title: "'/reports/x'（loadChildren を読み込んだあと）", url: router.url, ...askRoutes() });

// data がバックエンドで書き換えられたか（sanitizeRouteData が元の route.data に触るか）
const original = (router.config[1] as any).children[0].data;
const dataAfter = { aIsSame: original.a === shared, fnType: typeof original.fn, loopIsSame: original.loop === loop };

// TransferState
send('getTransferState');
const transfer = take().find((m) => m.topic === 'transferStateData')?.args[0] ?? null;
const runtimeValue = appRef.injector.get(TransferState).get(makeStateKey<number>('setAtRuntime'), null);

await writeJson(OUT, {
  core: availability?.version,
  supportedApis: availability?.supportedApis,
  scenes,
  dataAfter,
  transfer: { scriptJson: state, message: transfer, runtimeValue },
});
process.exit(0);

```

## ここまでの呼び出し

- 👤 `provideRouter(routes)` — router/src/provide\_router.ts 107 — *開発モードなら ɵgetLoadedRoutes などを window.ng に*
- `getRoutes(messageBus)` — client-event-subscribers.ts 346 — *パネルの getRoutes*
  - `getRouterInstance()` → `ng.ɵgetRouterInstance(injector)` — 434・448
  - `parseRoutes(router)` — router-tree.ts 74
    - `getActiveRouteConfigs(router)` → `collectActiveRouteConfigs` — 65・33
    - `assignChildrenToParent(null, router.config, active)` — 106 — *ɵgetLoadedRoutes・getClassOrFunctionName*
  - `sanitizeRouteData(route)` → `sanitizeObject(data)` — 696・serialization.ts 9
  - `emit('updateRouterTree', [[route]])` → パネル `transformRoutesIntoVisTree` — 352・router-tree-fns.ts 40
- `getTransferStateCallback` → `ng.ɵgetTransferState(injector)` — 614・632
  - `retrieveTransferredState(doc, appId)` — core/src/transfer\_state.ts 160 — *&lt;script id="ng-state"&gt;*
- `enableHydrationOverlays()` → `highlightHydrationNodes()` — hydration-overlays.ts 28・51 — *changeDetection$ を 250ms で間引いて描き直す*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| ng-devtools-backend/src/lib/router-tree/router-tree.spec.ts | describe `parseRoutes`（11 行目、it 16 件。guard の名前つき関数・矢印関数・クラス（235〜273）、matcher（335）、runGuardsAndResolvers（354・375）、resolver（394〜470））・`getRouterCallableConstructRef`（508 行目、it 10 件） | `//devtools/projects/ng-devtools-backend/src/lib/router-tree:test`（26 件） |
| ng-devtools/src/lib/devtools-tabs/router-tree/router-tree-fns.spec.ts・router-tree.component.spec.ts | 見出しの作り方と木への直し方、タブの表示 | `…/devtools-tabs/router-tree:test`（9 件） |
| router-details-row/route-data-serializer.spec.ts ほか | 選んだルートの詳しい欄（`data` の見せ方） | `…/router-tree/router-details-row:test`（9 件） |
| ng-devtools/src/lib/devtools-tabs/transfer-state/transfer-state.component.spec.ts | describe `TransferStateComponent`（36 行目、it 16 件）。`null` を空として扱う（97）・バイト数（112・120）・循環で落ちない（128）・絞り込み・並べ替え・コピー・5 秒の待ち（184） | `…/devtools-tabs/transfer-state:test`（16 件） |
| shared/utils/serialization.spec.ts | describe `sanitizeObject`（11 行目、it 4 件） | `…/ng-devtools-backend/src/lib/shared/utils:test`（[第 17 回](17-devtools-signal-graph.md)で走らせた） |
| （無し） | `hydration-overlays.ts` と `getTransferStateCallback` の spec はありません。hydration/BUILD.bazel にテストのターゲットがありません | — |

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/router-tree/router-tree.spec.ts` L255–271 （▶ の行: 256, 258, 263, 268, 270）

```ts
255 │   it('should handle guards with arrow functions', () => {
256 ▶     const arrowGuard = () => true;
257 │ 
258 ▶     const nestedRouter = {
259 │       config: [
260 │         {
261 │           path: 'protected',
262 │           component: 'ProtectedComponent',
263 ▶           canActivate: [arrowGuard],
264 │         },
265 │       ],
266 │     };
267 │ 
268 ▶     const parsedRoutes = parseRoutes(nestedRouter as any);
269 │ 
270 ▶     expect(parsedRoutes.children![0].canActivateGuards).toEqual(['arrowGuard']);
271 │   });
```

router-tree.spec.ts は、本物の router も Angular のアプリも作りません。258 行目の `{ config: [...] }` という「`config` だけを持つオブジェクト」をルーターの代わりに渡します。`routerState` が無いので 2 節の 66〜69 行目で active の Set は空になり、どのルートも `isActive: false` です。だから「active になる」ことはこの spec の形では確かめられず、確かめるなら `routerState.root` に `routeConfig` と `children` を持つオブジェクトを足すことになります。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/transfer-state/transfer-state.component.spec.ts` L97–103 （▶ の行: 99, 102）

```ts
 97 │   it('treats backend null as empty (educational state)', async () => {
 98 │     await createComponent();
 99 ▶     await emitData(null);
100 │     expect(component.isLoading()).toBe(false);
101 │     expect(component.hasData()).toBe(false);
102 ▶     expect(component.transferStateData()).toEqual({});
103 │   });
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/transfer-state/transfer-state.component.spec.ts` L128–136 （▶ の行: 131–132, 134）

```ts
128 │   it('does not crash on circular references and reports — for size', async () => {
129 │     await createComponent();
130 │     const circular: Record<string, unknown> = {name: 'loop'};
131 ▶     circular['self'] = circular;
132 ▶     await expectAsync(emitData({circ: circular})).not.toBeRejected();
133 │     const item = component.transferStateItems()[0];
134 ▶     expect(item.bytes).toBeNull();
135 │     expect(item.size).toBe('—');
136 │   });
```

パネルの spec は TestBed でタブのコンポーネントを作り、MessageBus の偽物から 99 行目でバックエンドの返事を流します（偽物の作りは[第 19 回](19-devtools-test-build.md)）。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //devtools/projects/ng-devtools-backend/src/lib/router-tree:test \
  //devtools/projects/ng-devtools/src/lib/devtools-tabs/router-tree:test \
  //devtools/projects/ng-devtools/src/lib/devtools-tabs/router-tree/router-details-row:test \
  //devtools/projects/ng-devtools/src/lib/devtools-tabs/transfer-state:test \
  --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/devtools-logs/e-router-transfer.log）`

```
ng-devtools-backend/src/lib/router-tree:test_chromium   26 passed  PASSED in 2.0s
ng-devtools-backend/src/lib/router-tree:test_firefox    26 passed  PASSED in 4.3s
devtools-tabs/router-tree:test_chromium                  9 passed  PASSED in 2.6s
devtools-tabs/router-tree:test_firefox                   9 passed  PASSED in 5.1s
router-tree/router-details-row:test_chromium             9 passed  PASSED in 3.2s
router-tree/router-details-row:test_firefox              9 passed  PASSED in 5.2s
devtools-tabs/transfer-state:test_chromium              16 passed  PASSED in 1.5s
devtools-tabs/transfer-state:test_firefox               16 passed  PASSED in 4.6s
Executed 8 out of 8 tests: 8 tests pass.
INFO: Elapsed time: 64.657s（ほかの担当の bazel とロックを待ち合った時間を含む）
```

テストそのものは 1 つ 0.4〜0.7 秒（Chromium）・2.1〜3.1 秒（Firefox）で、全体の 64.7 秒の多くは、同じ時間に走っていたほかの bazel を待った時間です（第 17 回の 4 ターゲットは 14.1 秒でした）。

### 直すとしたら

- ルーターの木の中身（名前・active・lazy・道筋）は `router-tree.ts` の `assignChildrenToParent` と `getClassOrFunctionName`・`getProviderName` です。it は router-tree.spec.ts の `parseRoutes` に、258 行目の形の偽のルーターで足します。2 節の注意（オブジェクトの provider が `null`）は、`providers: [{provide: …, useValue: …}]` の it を書けば確かめられます。
- `data` の `[Circular]` は `shared/utils/serialization.ts` の `sanitizeObject` で、serialization.spec.ts に「同じオブジェクトを 2 か所から指す」it を足す形です。
- TransferState の中身が出ない・違うときは、まずページの `<script id="…-state">` を見ます（5 節）。バックエンドの合わせ方は `getTransferStateCallback` で、main では ad9058ad879（2026-10-16）が `merged` を `Object.create(null)` にしました（鍵が `__proto__` のとき `Object.assign` が継承のセッターを通って値が消えるため）。
- 重ね表示は `hydration-overlays.ts` で、spec がありません。6 節の 2 つの注意は、どちらも `getDirectiveForestManager` の木を作る必要があり、本家の spec の形にするには木を差し替える口から作ることになります。
- 開いている issue では #62736（ルーターの情報を表でも見たい。feature）がこのタブの話で、メンバー（JeanMeche）は「先に話し合いたい」とコメントしています。一覧は[第 20 回](20-devtools-issues.md)。本家に PR を出すことは勧めません。

## 聞かれそうな質問

**Q. Router のタブの active は、URL を見て決めていますか？**

いまは見ていません。2 節の 66 行目で `router.routerState.root` から子をたどって `routeConfig` を Set に集め、125 行目で「この設定のオブジェクトが Set にあるか」を比べます。前は URL の前方一致で、Home がいつも active に見えていました（cfb26f59992 で直った）。

**Q. `loadChildren` のルートの子が木に出ないのはなぜですか？**

まだ読み込んでいないからです。113 行目の `ng.ɵgetLoadedRoutes` は router の内部の `_loadedRoutes` を返すだけで、読み込みはしません。そのルートへ一度移ると出ます。

**Q. Transfer State のタブに、アプリで `set` した値が出ません。**

タブはページの `<script id="ng-state">` の JSON を読むからです（core の `getTransferState` の 28 行目 → `retrieveTransferredState` の 166 行目）。ブラウザで動いているあいだに `TransferState` の service に入れた値は、その `<script>` に書かれません。ハイドレーションの内部の鍵 2 つも除かれます。

**Q. ルートの `data` に入れたオブジェクトが `[Circular]` と出ます。循環させていないのですが。**

`sanitizeObject` の 32〜35 行目は「一度でも見たオブジェクト」を `[Circular]` にするので、同じオブジェクトを 2 か所から指すと 2 つめがそうなります。送る用の写しだけの話で、アプリの `data` は書き換えられません。

**Q. ハイドレーションの重ね表示は、いつ描き直されますか？**

有効にしたときに 1 回と、そのあとはプロファイラーの `changeDetection$` を 250 ミリ秒で間引いて、変更検知が止まってから 1 回です（39〜41 行目）。635ef1bd80e より前は、パネルが木を受け取るたびにメッセージで消して作り直していました。

## 読み終えて

- ルーターの木は、1 つめのルートの注入器から取った router の `config` を、名前の文字列と印（active・lazy・aux）の木に直したものです。
- active は `routerState` の `routeConfig` とのオブジェクトの同一性で決まり、lazy の子は読み込んだあとに現れます。
- `data` は `sanitizeObject` で削られ、同じオブジェクトの 2 度目は `[Circular]` になります。
- Transfer State のタブは、サーバーが書いた `<script>` の JSON から内部の鍵を除いたものです。
- ハイドレーションの重ね表示はバックエンドが変更検知に合わせて描き直します。手元の木では、ずれた子を探す再帰（main で直った）と `dehydrated` の扱いに穴があります。

---

← 前: [signal のグラフ：ɵgetSignalGraph から絵まで](17-devtools-signal-graph.md)  
次: [DevTools のテストとビルド：zoneless\_web\_test\_suite と demo のアプリ](19-devtools-test-build.md) →
