[目次](../README.md) › [SSR とハイドレーション](README.md) › 第 5 回 / 全 15 回

# サーバールート：RenderMode と、Router の設定からルートを取り出す仕組み

> ServerRoute の型（renderMode: Server / Client / Prerender、getPrerenderParams、fallback、headers、status（Prerender は不可））、withRoutes と SERVER\_ROUTES\_CONFIG。getRoutesFromAngularRouterConfig がアプリをルートコンポーネント無し（ɵENABLE\_ROOT\_COMPONENT\_BOOTSTRAP = false）で起動して Router の config を辿り、遅延ルートを読み込み、サーバールートと突き合わせて RouteTree に入れる行。\*\* と :param の照合、リダイレクトの解決。このサイトの app.routes.server.ts が何を意味するか。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ssr-server-routes)

---

`@angular/ssr` は、URL ごとに「サーバーで毎回描く（Server）」「ビルド時に描いておく（Prerender）」「サーバーでは描かない（Client）」を選べます。その表が **サーバールート**（`ServerRoute[]`）です。ただし表に書くのは `'**'` や `'product/:id'` のような型だけで、実際の URL の一覧は Angular の Router の設定から取り出します。この章では、型の定義から、アプリを特別な設定で起動して `Router.config` を辿り、サーバールートと突き合わせて `RouteTree` に入れ、リクエストの URL を照合するまでを追います。

読む対象は `packages/angular/ssr/src/routes/` の `route-config.ts`・`ng-routes.ts`・`route-tree.ts`・`router.ts` です（angular-cli リポジトリ）。

1. [1. 概観](01-ssr-overview.md)
2. [2. renderApplication](02-ssr-render-application.md)
3. [3. platformServer と domino](03-ssr-platform-server.md)
4. [4. AngularAppEngine](04-ssr-app-engine.md)
5. **5. サーバールート**（この章）
6. [6. プリレンダー](06-ssr-prerender.md)
7. [7. provideClientHydration](07-hydration-provide.md)
8. [8. ngh の書き出し](08-hydration-annotate.md)
9. [9. ノードの道順](09-hydration.md)
10. [10. ノードの確保](10-hydration-claim.md)
11. [11. コンテナと片付け](11-hydration-containers.md)
12. [12. 不一致のエラー](12-hydration-errors.md)
13. [13. i18n](13-hydration-i18n.md)
14. [14. イベントの再生](14-event-replay.md)
15. [15. インクリメンタル](15-incremental-hydration.md)

このサイト自身のサーバールートは、次の 1 件だけです（`src/app/app.routes.server.ts`）。

📄 `src/app/app.routes.server.ts`

```ts
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
```
*このサイトの設定。すべての URL を Prerender にする。*

## 1. ServerRoute の型：RenderMode と、モードごとに書ける項目

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L50–84 （▶ の行: 52, 55, 58, 71, 77, 83）

```ts
50 │ export enum RenderMode {
51 │   /** Server-Side Rendering (SSR) mode, where content is rendered on the server for each request. */
52 ▶   Server,
53 │ 
54 │   /** Client-Side Rendering (CSR) mode, where content is rendered on the client side in the browser. */
55 ▶   Client,
56 │ 
57 │   /** Static Site Generation (SSG) mode, where content is pre-rendered at build time and served as static files. */
58 ▶   Prerender,
59 │ }
60 │ 
61 │ /**
62 │  * Defines the fallback strategies for Static Site Generation (SSG) routes when a pre-rendered path is not available.
63 │  * This is particularly relevant for routes with parameterized URLs where some paths might not be pre-rendered at build time.
64 │  * @see {@link ServerRoutePrerenderWithParams}
65 │  */
66 │ export enum PrerenderFallback {
67 │   /**
68 │    * Fallback to Server-Side Rendering (SSR) if the pre-rendered path is not available.
69 │    * This strategy dynamically generates the page on the server at request time.
70 │    */
71 ▶   Server,
72 │ 
73 │   /**
74 │    * Fallback to Client-Side Rendering (CSR) if the pre-rendered path is not available.
75 │    * This strategy allows the page to be rendered on the client side.
76 │    */
77 ▶   Client,
78 │ 
79 │   /**
80 │    * No fallback; if the path is not pre-rendered, the server will not handle the request.
81 │    * This means the application will not provide any response for paths that are not pre-rendered.
82 │    */
83 ▶   None,
84 │ }
```

50〜59 行目、`RenderMode` は 3 つです。数値の enum なので `Server` が 0、`Client` が 1、`Prerender` が 2 になります。66〜84 行目の `PrerenderFallback` は、`:id` のようなパラメータ付きの Prerender ルートで「ビルド時に作らなかった URL が来たらどうするか」です。71 行目 Server（その場で描く）、77 行目 Client（`index.csr.html` を返す）、83 行目 None（扱わない）。

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L89–119 （▶ の行: 91, 94, 97, 106, 113, 118）

```ts
 89 │ export interface ServerRouteCommon {
 90 │   /** The path associated with this route. */
 91 ▶   path: string;
 92 │ 
 93 │   /** Optional additional headers to include in the response for this route. */
 94 ▶   headers?: Record<string, string>;
 95 │ 
 96 │   /** Optional status code to return for this route. */
 97 ▶   status?: number;
 98 │ }
 99 │ 
100 │ /**
101 │  * A server route that uses Client-Side Rendering (CSR) mode.
102 │  * @see {@link RenderMode}
103 │  */
104 │ export interface ServerRouteClient extends ServerRouteCommon {
105 │   /** Specifies that the route uses Client-Side Rendering (CSR) mode. */
106 ▶   renderMode: RenderMode.Client;
107 │ }
108 │ 
109 │ /**
110 │  * A server route that uses Static Site Generation (SSG) mode.
111 │  * @see {@link RenderMode}
112 │  */
113 ▶ export interface ServerRoutePrerender extends Omit<ServerRouteCommon, 'status'> {
114 │   /** Specifies that the route uses Static Site Generation (SSG) mode. */
115 │   renderMode: RenderMode.Prerender;
116 │ 
117 │   /** Fallback cannot be specified unless `getPrerenderParams` is used. */
118 ▶   fallback?: never;
119 │ }
```

89〜98 行目が共通部分で、`path`・`headers`・`status`。ただし 113 行目、Prerender は `Omit<ServerRouteCommon, 'status'>` で **`status` を書けません**。作り置きの HTML は静的ファイルとして配られるので、ステータスを変える手段が無いからです。118 行目の `fallback?: never` は「パラメータを展開しない Prerender に fallback は書けない」を型で表しています。

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L127–139 （▶ の行: 127, 137, 139）

```ts
127 ▶ export interface ServerRoutePrerenderWithParams extends Omit<ServerRoutePrerender, 'fallback'> {
128 │   /**
129 │    * Optional strategy to use if the SSG path is not pre-rendered.
130 │    * This is especially relevant for routes with parameterized URLs, where some paths may not be pre-rendered at build time.
131 │    *
132 │    * This property determines how to handle requests for paths that are not pre-rendered:
133 │    * - `PrerenderFallback.Server`: Use Server-Side Rendering (SSR) to dynamically generate the page at request time.
134 │    * - `PrerenderFallback.Client`: Use Client-Side Rendering (CSR) to fetch and render the page on the client side.
135 │    * - `PrerenderFallback.None`: No fallback; if the path is not pre-rendered, the server will not handle the request.
136 │    *
137 ▶    * @default `PrerenderFallback.Server` if not provided.
138 │    */
139 ▶   fallback?: PrerenderFallback;
```

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L178–198 （▶ の行: 178, 187, 194, 197）

```ts
178 ▶   getPrerenderParams: () => Promise<Record<string, string>[]>;
179 │ }
180 │ 
181 │ /**
182 │  * A server route that uses Server-Side Rendering (SSR) mode.
183 │  * @see {@link RenderMode}
184 │  */
185 │ export interface ServerRouteServer extends ServerRouteCommon {
186 │   /** Specifies that the route uses Server-Side Rendering (SSR) mode. */
187 ▶   renderMode: RenderMode.Server;
188 │ }
189 │ 
190 │ /**
191 │  * Server route configuration.
192 │  * @see {@link withRoutes}
193 │  */
194 ▶ export type ServerRoute =
195 │   | ServerRouteClient
196 │   | ServerRoutePrerender
197 ▶   | ServerRoutePrerenderWithParams
198 │   | ServerRouteServer;
```

127 行目の `ServerRoutePrerenderWithParams` だけが 139 行目の `fallback`（既定は 137 行目のとおり Server）と、178 行目の `getPrerenderParams` を持てます。`getPrerenderParams` は「パラメータ名 → 値」のオブジェクトの配列を返す関数で、1 要素が 1 つの URL になります（6 節）。194〜198 行目、`ServerRoute` はこの 4 つの合併型です。

## 2. withRoutes・withAppShell・provideServerRendering

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L204–218 （▶ の行: 208, 211, 218）

```ts
204 │ export interface ServerRoutesConfig {
205 │   /**
206 │    * Defines the route to be used as the app shell.
207 │    */
208 ▶   appShellRoute?: string;
209 │ 
210 │   /** List of server routes for the application. */
211 ▶   routes: ServerRoute[];
212 │ }
213 │ 
214 │ /**
215 │  * Token for providing the server routes configuration.
216 │  * @internal
217 │  */
218 ▶ export const SERVER_ROUTES_CONFIG = new InjectionToken<ServerRoutesConfig>('SERVER_ROUTES_CONFIG');
```

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L259–273 （▶ の行: 262, 265, 268–269）

```ts
259 │ export function withRoutes(
260 │   routes: ServerRoute[],
261 │ ): ServerRenderingFeature<ServerRenderingFeatureKind.ServerRoutes> {
262 ▶   const config: ServerRoutesConfig = { routes };
263 │ 
264 │   return {
265 ▶     ɵkind: ServerRenderingFeatureKind.ServerRoutes,
266 │     ɵproviders: [
267 │       {
268 ▶         provide: SERVER_ROUTES_CONFIG,
269 ▶         useValue: config,
270 │       },
271 │     ],
272 │   };
273 │ }
```

`withRoutes` は配列を 262 行目で `{ routes }` に包み、268〜269 行目で `SERVER_ROUTES_CONFIG`（218 行目）の値として provide するだけです。これを読むのは 4 節の `getRoutesFromAngularRouterConfig` で、**アプリの注入器から `inject` して**取り出します。サーバールートが DI で運ばれるのは、取り出す側がアプリを起動して調べるからです。

📄 `angular-cli/packages/angular/ssr/src/routes/route-config.ts` L315–342 （▶ の行: 319, 323, 325, 332, 334, 338）

```ts
315 │ export function withAppShell(
316 │   component: Type<unknown> | (() => Promise<Type<unknown> | DefaultExport<Type<unknown>>>),
317 │ ): ServerRenderingFeature<ServerRenderingFeatureKind.AppShell> {
318 │   const routeConfig: Route = {
319 ▶     path: APP_SHELL_ROUTE,
320 │   };
321 │ 
322 │   if ('ɵcmp' in component) {
323 ▶     routeConfig.component = component as Type<unknown>;
324 │   } else {
325 ▶     routeConfig.loadComponent = component as () => Promise<Type<unknown>>;
326 │   }
327 │ 
328 │   return {
329 │     ɵkind: ServerRenderingFeatureKind.AppShell,
330 │     ɵproviders: [
331 │       {
332 ▶         provide: ROUTES,
333 │         useValue: routeConfig,
334 ▶         multi: true,
335 │       },
336 │       provideEnvironmentInitializer(() => {
337 │         const config = inject(SERVER_ROUTES_CONFIG);
338 ▶         config.appShellRoute = APP_SHELL_ROUTE;
339 │       }),
340 │     ],
341 │   };
342 │ }
```

App Shell（読み込み中に見せる骨組みだけのページ）です。319 行目、`ng-app-shell` という Router のルートを作り、332〜334 行目で `ROUTES` に**足します**（利用者のルート配列に手で書かなくてよい）。336〜339 行目、注入器ができたときに `SERVER_ROUTES_CONFIG` の `appShellRoute` を書き換えます。これを 5 節の `buildServerConfigRouteTree` が読みます。

この 2 つを受け取る `@angular/ssr` の `provideServerRendering` は、`@angular/platform-server` 版のプロバイダを先に入れ、features のプロバイダを積み、`withAppShell` だけで `withRoutes` が無ければエラーにします。その行は [第 3 回](03-ssr-platform-server.md)で引用しているので、ここでは繰り返しません。

## 3. いつ・どこでルートを取り出すのか

📄 `angular-cli/packages/angular/ssr/src/routes/router.ts` L48–73 （▶ の行: 49–50, 52, 57, 59–60, 69）

```ts
48 │   static from(manifest: AngularAppManifest, url: URL): Promise<ServerRouter> {
49 ▶     if (manifest.routes) {
50 ▶       const routeTree = RouteTree.fromObject(manifest.routes);
51 │ 
52 ▶       return Promise.resolve(new ServerRouter(routeTree));
53 │     }
54 │ 
55 │     // Create and store a new promise for the build process.
56 │     // This prevents concurrent builds by re-using the same promise.
57 ▶     ServerRouter.#extractionPromise ??= extractRoutesAndCreateRouteTree({ url, manifest })
58 │       .then(({ routeTree, errors }) => {
59 ▶         if (errors.length > 0) {
60 ▶           throw new Error(
61 │             'Error(s) occurred while extracting routes:\n' +
62 │               errors.map((error) => `- ${error}`).join('\n'),
63 │           );
64 │         }
65 │ 
66 │         return new ServerRouter(routeTree);
67 │       })
68 │       .finally(() => {
69 ▶         ServerRouter.#extractionPromise = undefined;
70 │       });
71 │ 
72 │     return ServerRouter.#extractionPromise;
73 │   }
```

[第 4 回](04-ssr-app-engine.md)の `AngularServerApp.handle` が最初のリクエストで呼ぶ `ServerRouter.from` です。2 つの道があります。

1. **49〜53 行目：ビルド時に取り出した木がマニフェストにある**

   `outputMode: "server"` の本番ビルドでは、ビルドが取り出した結果を `angular-app-manifest.mjs` の `routes` に書いておきます（[第 6 回](06-ssr-prerender.md)）。それを `RouteTree.fromObject` で組み直すだけで、アプリは起動しません。
2. **57〜70 行目：無ければその場で取り出す**

   開発サーバーなどです。57 行目の `??=` で、同時に来たリクエストが同じ Promise を待ちます。59〜64 行目、取り出しにエラーがあれば例外にし、69 行目で Promise を捨てます（次回また作り直せる）。

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L816–844 （▶ の行: 817–819, 829–830, 835, 842–843）

```ts
816 │     const routeTree = new RouteTree();
817 ▶     const document = await new ServerAssets(manifest).getIndexServerHtml().text();
818 ▶     const bootstrap = await manifest.bootstrap();
819 ▶     const { baseHref, appShellRoute, routes, errors } = await getRoutesFromAngularRouterConfig(
820 │       bootstrap,
821 │       document,
822 │       url,
823 │       invokeGetPrerenderParams,
824 │       includePrerenderFallbackRoutes,
825 │       manifest.entryPointToBrowserMapping,
826 │     );
827 │ 
828 │     for (const { route, ...metadata } of routes) {
829 ▶       if (metadata.redirectTo !== undefined) {
830 ▶         metadata.redirectTo = joinUrlParts(baseHref, metadata.redirectTo);
831 │       }
832 │ 
833 │       // Remove undefined fields
834 │       // Helps avoid unnecessary test updates
835 ▶       for (const [key, value] of Object.entries(metadata)) {
836 │         if (value === undefined) {
837 │           // eslint-disable-next-line @typescript-eslint/no-explicit-any
838 │           delete (metadata as any)[key];
839 │         }
840 │       }
841 │ 
842 ▶       const fullRoute = joinUrlParts(baseHref, route);
843 ▶       routeTree.insert(fullRoute, metadata);
844 │     }
```

取り出しの本体です。817 行目で土台の HTML（`index.server.html`）、818 行目で `main.server.mjs` の bootstrap 関数を用意して、819 行目で次節の関数を呼びます。戻ってきた 1 件ずつを、842 行目で `baseHref` を前に付けて 843 行目で `RouteTree` に入れます。829〜831 行目、リダイレクト先にも `baseHref` を付けます。835〜840 行目は値が `undefined` のキーを消すだけです。

## 4. getRoutesFromAngularRouterConfig：アプリを「ルートを調べる用」に起動する

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L44–58 （▶ の行: 52, 55–56）

```ts
44 │ /**
45 │  * A DI token that indicates whether the application is in the process of discovering routes.
46 │  *
47 │  * This token is provided with the value `true` when route discovery is active, allowing other
48 │  * parts of the application to conditionally execute logic. For example, it can be used to
49 │  * disable features or behaviors that are not necessary or might interfere with the route
50 │  * discovery process.
51 │  */
52 ▶ export const IS_DISCOVERING_ROUTES = new InjectionToken<boolean>(
53 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'IS_DISCOVERING_ROUTES' : '',
54 │   {
55 ▶     providedIn: 'platform',
56 ▶     factory: () => false,
57 │   },
58 │ );
```

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L629–653 （▶ の行: 632, 635, 646–647, 650–651）

```ts
629 │   const { protocol, host } = url;
630 │ 
631 │   // Create and initialize the Angular platform for server-side rendering.
632 ▶   const platformRef = platformServer([
633 │     {
634 │       provide: INITIAL_CONFIG,
635 ▶       useValue: { document, url: `${protocol}//${host}/` },
636 │     },
637 │     {
638 │       // An Angular Console Provider that does not print a set of predefined logs.
639 │       provide: ɵConsole,
640 │       // Using `useClass` would necessitate decorating `Console` with `@Injectable`,
641 │       // which would require switching from `ts_library` to `ng_module`. This change
642 │       // would also necessitate various patches of `@angular/bazel` to support ESM.
643 │       useFactory: () => new Console(),
644 │     },
645 │     {
646 ▶       provide: ɵENABLE_ROOT_COMPONENT_BOOTSTRAP,
647 ▶       useValue: false,
648 │     },
649 │     {
650 ▶       provide: IS_DISCOVERING_ROUTES,
651 ▶       useValue: true,
652 │     },
653 │   ]);
```

1. **632〜635 行目：本物と同じ platformServer を作る**

   URL はオリジンの `/` だけです。どのページでもなく、「起動できること」と「相対 URL の HTTP が解決できること」だけが要るからです。
2. **646〜647 行目：ルートコンポーネントを作らせない**

   `ɵENABLE_ROOT_COMPONENT_BOOTSTRAP` を `false` にすると、`bootstrapApplication` は `APP_INITIALIZER` まで走らせたあと、`appRef.bootstrap(App)` を呼ばずに `ApplicationRef` を返します（分岐の行は [bootstrapApplication の章](../boot/07-boot-bootstrap-application.md)で読んだ bootstrap.ts の中）。`<app-root>` の描画、つまりコンポーネントのコンストラクタやテンプレートは動きません。
3. **650〜651 行目：IS\_DISCOVERING\_ROUTES を true に**

   52〜58 行目のトークンは `providedIn: 'platform'` で既定値が `false`。ここでだけ `true` になります。`@angular/ssr` の中にこれを読む行はありません。利用者のコード（`APP_INITIALIZER` など）が `inject(IS_DISCOVERING_ROUTES)` で「いまはルート調べ中だから重い処理を飛ばす」と判断するための公開トークンです。

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L655–691 （▶ の行: 662, 666, 671, 674, 678–680, 684, 687–688）

```ts
655 │   try {
656 │     let applicationRef: ApplicationRef;
657 │ 
658 │     if (isNgModule(bootstrap)) {
659 │       const moduleRef = await platformRef.bootstrapModule(bootstrap);
660 │       applicationRef = moduleRef.injector.get(ApplicationRef);
661 │     } else {
662 ▶       applicationRef = await bootstrap({ platformRef });
663 │     }
664 │ 
665 │     const injector = applicationRef.injector;
666 ▶     const router = injector.get(Router);
667 │ 
668 │     // Workaround to unblock navigation when `withEnabledBlockingInitialNavigation()` is used.
669 │     // This is necessary because route extraction disables component bootstrapping.
670 │     // eslint-disable-next-line @typescript-eslint/no-explicit-any
671 ▶     (router as any).navigationTransitions.afterPreactivation()?.next?.();
672 │ 
673 │     // Wait until the application is stable.
674 ▶     await applicationRef.whenStable();
675 │ 
676 │     const errors: string[] = [];
677 │ 
678 ▶     const rawBaseHref =
679 ▶       injector.get(APP_BASE_HREF, null, { optional: true }) ??
680 ▶       injector.get(PlatformLocation).getBaseHrefFromDOM();
681 │     const { pathname: baseHref } = new URL(rawBaseHref, 'http://localhost');
682 │ 
683 │     const compiler = injector.get(Compiler);
684 ▶     const serverRoutesConfig = injector.get(SERVER_ROUTES_CONFIG, null, { optional: true });
685 │     let serverConfigRouteTree: RouteTree<ServerConfigRouteTreeAdditionalMetadata> | undefined;
686 │ 
687 ▶     if (serverRoutesConfig) {
688 ▶       const result = buildServerConfigRouteTree(serverRoutesConfig);
689 │       serverConfigRouteTree = result.serverConfigRouteTree;
690 │       errors.push(...result.errors);
691 │     }
```

662 行目で起動し、666 行目で `Router` を取ります。671 行目は回避策です。`withEnabledBlockingInitialNavigation()` を使うアプリでは、初回ナビゲーションがルートコンポーネントのブートストラップ完了を待って止まります（[初回ナビゲーションの章](../router/06-router-initial-navigation.md)）。646 行目でそのブートストラップを止めたので、ここで待ちを手で外さないと 674 行目の `whenStable()` が来ません。678〜681 行目で `baseHref` を決め、684 行目で 2 節の `SERVER_ROUTES_CONFIG` を**任意で**取ります。あれば 687〜691 行目で、サーバールートだけの木（5 節）を先に作ります。

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L701–729 （▶ の行: 702, 705, 709, 716–718, 725–726）

```ts
701 │     const routesResults: RouteTreeNodeMetadata[] = [];
702 ▶     if (router.config.length) {
703 │       // Retrieve all routes from the Angular router configuration.
704 │       const traverseRoutes = traverseRoutesConfig({
705 ▶         routes: router.config,
706 │         compiler,
707 │         parentInjector: injector,
708 │         parentRoute: '',
709 ▶         serverConfigRouteTree,
710 │         invokeGetPrerenderParams,
711 │         includePrerenderFallbackRoutes,
712 │         entryPointToBrowserMapping,
713 │       });
714 │ 
715 │       const seenRoutes: Set<string> = new Set();
716 ▶       for await (const routeMetadata of traverseRoutes) {
717 ▶         if ('error' in routeMetadata) {
718 ▶           errors.push(routeMetadata.error);
719 │           continue;
720 │         }
721 │ 
722 │         // If a result already exists for the exact same route, subsequent matches should be ignored.
723 │         // This aligns with Angular's app router behavior, which prioritizes the first route.
724 │         const routePath = routeMetadata.route;
725 ▶         if (!seenRoutes.has(routePath)) {
726 ▶           routesResults.push(routeMetadata);
727 │           seenRoutes.add(routePath);
728 │         }
729 │       }
```

705 行目、`router.config`（`provideRouter(routes)` に渡した配列が正規化されたもの）を、709 行目のサーバールートの木と一緒に 6 節の再帰に渡します。716 行目の `for await` で 1 件ずつ受け取り、`error` なら 717〜718 行目でためるだけで止まりません（全部のエラーを 1 回で報告する）。725〜728 行目、同じ URL が 2 回出たら**最初の 1 件だけ**を残します。Router も上から順に照合して最初に当たったものを使うので、それに合わせています。

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L735–771 （▶ の行: 736–737, 742, 750–752, 759, 770）

```ts
735 │       if (serverConfigRouteTree) {
736 ▶         for (const { route, presentInClientRouter } of serverConfigRouteTree.traverse()) {
737 ▶           if (presentInClientRouter || route.endsWith('/**')) {
738 │             // Skip if matched or it's the catch-all route.
739 │             continue;
740 │           }
741 │ 
742 ▶           errors.push(
743 │             `The '${stripLeadingSlash(route)}' server route does not match any routes defined in the Angular ` +
744 │               `routing configuration (typically provided as a part of the 'provideRouter' call). ` +
745 │               'Please make sure that the mentioned server route is present in the Angular routing configuration.',
746 │           );
747 │         }
748 │       }
749 │     } else {
750 ▶       const rootRouteMetadata = serverConfigRouteTree?.match('') ?? {
751 ▶         route: '',
752 ▶         renderMode: RenderMode.Prerender,
753 │       };
754 │ 
755 │       routesResults.push({
756 │         ...rootRouteMetadata,
757 │         // Matched route might be `/*` or `/**`, which would make Angular serve all routes rather than just `/`.
758 │         // So we limit to just `/` for the empty app router case.
759 ▶         route: '',
760 │       });
761 │     }
762 │ 
763 │     return {
764 │       baseHref,
765 │       routes: routesResults,
766 │       errors,
767 │       appShellRoute: serverRoutesConfig?.appShellRoute,
768 │     };
769 │   } finally {
770 ▶     platformRef.destroy();
771 │   }
```

736〜747 行目は逆向きの検査です。サーバールートのうち、Router のどのルートにも使われなかったもの（`presentInClientRouter` が立たなかったもの）をエラーにします。ただし `/**` は 737 行目で除外。750〜760 行目、Router にルートが 1 つも無いアプリでは `/` 1 件だけにします。最後に 770 行目、`finally` で必ずプラットフォームを壊します。

## 5. サーバールートの木：buildServerConfigRouteTree

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L567–600 （▶ の行: 572–573, 575, 583–584, 589, 596）

```ts
567 │ function buildServerConfigRouteTree({ routes, appShellRoute }: ServerRoutesConfig): {
568 │   errors: string[];
569 │   serverConfigRouteTree: RouteTree<ServerConfigRouteTreeAdditionalMetadata>;
570 │ } {
571 │   const serverRoutes: ServerRoute[] = [...routes];
572 ▶   if (appShellRoute !== undefined) {
573 ▶     serverRoutes.unshift({
574 │       path: appShellRoute,
575 ▶       renderMode: RenderMode.Prerender,
576 │     });
577 │   }
578 │ 
579 │   const serverConfigRouteTree = new RouteTree<ServerConfigRouteTreeAdditionalMetadata>();
580 │   const errors: string[] = [];
581 │ 
582 │   for (const { path, ...metadata } of serverRoutes) {
583 ▶     if (path[0] === '/') {
584 ▶       errors.push(`Invalid '${path}' route configuration: the path cannot start with a slash.`);
585 │ 
586 │       continue;
587 │     }
588 │ 
589 ▶     if ('getPrerenderParams' in metadata && (path.includes('/*/') || path.endsWith('/*'))) {
590 │       errors.push(
591 │         `Invalid '${path}' route configuration: 'getPrerenderParams' cannot be used with a '*' route.`,
592 │       );
593 │       continue;
594 │     }
595 │ 
596 ▶     serverConfigRouteTree.insert(path, metadata);
597 │   }
598 │ 
599 │   return { serverConfigRouteTree, errors };
600 │ }
```

572〜577 行目、App Shell があれば先頭に Prerender として足します。583〜584 行目、`path` が `/` で始まるとエラーです（Router の `path` と同じ書き方）。589 行目、`getPrerenderParams` は 1 区切りのワイルドカード `*` とは組めません（値をどの名前に入れるか決まらない）。596 行目で、`path` を除いた残り（`renderMode` など）を値として木に入れます。木の入れ方は 8 節です。

## 6. Router の設定を辿る：traverseRoutesConfig と handleRoute

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L255–271 （▶ の行: 255, 268–270）

```ts
255 ▶ async function* traverseRoutesConfig(options: {
256 │   routes: Route[];
257 │   compiler: Compiler;
258 │   parentInjector: Injector;
259 │   parentRoute: string;
260 │   serverConfigRouteTree?: RouteTree<ServerConfigRouteTreeAdditionalMetadata>;
261 │   invokeGetPrerenderParams: boolean;
262 │   includePrerenderFallbackRoutes: boolean;
263 │   entryPointToBrowserMapping?: EntryPointToBrowserMapping;
264 │   parentPreloads?: readonly string[];
265 │ }): AsyncIterableIterator<RouteTreeNodeMetadata | { error: string }> {
266 │   const { routes: routeConfigs, parentPreloads, parentRoute, serverConfigRouteTree } = options;
267 │ 
268 ▶   for (const route of routeConfigs) {
269 ▶     const { matcher, path = matcher ? '**' : '' } = route;
270 ▶     const currentRoutePath = joinUrlParts(parentRoute, path);
271 │ 
```

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L322–353 （▶ の行: 324–325, 328, 334, 340–341, 346）

```ts
322 │     let matchedMetaData: ServerConfigRouteTreeNodeMetadata | undefined;
323 │     if (serverConfigRouteTree) {
324 ▶       matchedMetaData = serverConfigRouteTree.match(currentRoutePath);
325 ▶       if (!matchedMetaData) {
326 │         yield {
327 │           error:
328 ▶             `The '${stripLeadingSlash(currentRoutePath)}' route does not match any route defined in the server routing configuration. ` +
329 │             'Please ensure this route is added to the server routing configuration.',
330 │         };
331 │         continue;
332 │       }
333 │ 
334 ▶       matchedMetaData.presentInClientRouter = true;
335 │     }
336 │ 
337 │     yield* handleRoute({
338 │       ...options,
339 │       metadata: {
340 ▶         renderMode: RenderMode.Prerender,
341 ▶         ...matchedMetaData,
342 │         preload: parentPreloads,
343 │         // Match Angular router behavior
344 │         // ['one', 'two', ''] -> 'one/two/'
345 │         // ['one', 'two', 'three'] -> 'one/two/three'
346 ▶         route: path === '' ? addTrailingSlash(currentRoutePath) : currentRoutePath,
347 │         presentInClientRouter: undefined,
348 │       },
349 │       currentRoutePath,
350 │       route,
351 │     });
352 │   }
353 │ }
```

1. **268〜270 行目：親のパスとつないで、いまのルートの完全なパスを作る**

   `matcher`（関数で照合するルート）は `path` が無いので `'**'` として扱います（その場合の照合はこの節の引用の直後にある別の分岐で行います。ここでは省略）。
2. **324 行目：サーバールートの木で照合する**

   Router のルート 1 つを、8 節と同じ `match` で引きます。当たらなければ 325〜331 行目でエラー 「`The '…' route does not match any route defined in the server routing configuration.`」です。**Router にあるルートは、全部どれかのサーバールートに当たらなければなりません**。
3. **334 行目：当たったサーバールートに印を付ける**

   4 節の 736 行目の逆向きの検査は、この印を見ます。
4. **340〜346 行目：結果の 1 件を作る**

   340 行目の `RenderMode.Prerender` は、`withRoutes` を使わない古い構成のための既定値で、341 行目で当たったサーバールートの値に上書きされます。346 行目、`path: ''` のルートは末尾に `/` を付けます（`''` → `/`、`docs` の子の `''` → `/docs/`）。

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L170–201 （▶ の行: 171–172, 175–176, 184–185, 191, 194, 200）

```ts
170 │     const { redirectTo, loadChildren, loadComponent, children, ɵentryName } = route;
171 ▶     if (ɵentryName && loadComponent) {
172 ▶       appendPreloadToMetadata(ɵentryName, entryPointToBrowserMapping, metadata);
173 │     }
174 │ 
175 ▶     if (metadata.renderMode === RenderMode.Prerender) {
176 ▶       yield* handleSSGRoute(
177 │         serverConfigRouteTree,
178 │         typeof redirectTo === 'string' ? redirectTo : undefined,
179 │         metadata,
180 │         parentInjector,
181 │         invokeGetPrerenderParams,
182 │         includePrerenderFallbackRoutes,
183 │       );
184 ▶     } else if (redirectTo !== undefined) {
185 ▶       if (metadata.status && !isValidRedirectResponseCode(metadata.status)) {
186 │         yield {
187 │           error:
188 │             `The '${metadata.status}' status code is not a valid redirect response code. ` +
189 │             `Please use one of the following redirect response codes: ${[...VALID_REDIRECT_RESPONSE_CODES.values()].join(', ')}.`,
190 │         };
191 ▶       } else if (typeof redirectTo === 'string') {
192 │         yield {
193 │           ...metadata,
194 ▶           redirectTo: resolveRedirectTo(metadata.route, redirectTo),
195 │         };
196 │       } else {
197 │         yield metadata;
198 │       }
199 │     } else {
200 ▶       yield metadata;
201 │     }
```

171〜172 行目、`loadComponent` のルートは**コンポーネントを読み込みません**。ビルドが付けた `ɵentryName` から、そのチャンクのファイル名を `preload` に足すだけです（第 4 回の `modulepreload` はこれ）。175〜183 行目、Prerender なら 7 節の `handleSSGRoute` へ。184〜198 行目、リダイレクトのルートは 185 行目でステータスが 301/302/303/307/308 のどれかを確かめ、194 行目で行き先を解決して持たせます。

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L203–238 （▶ の行: 204–205, 214, 219–220, 227, 229–230, 233）

```ts
203 │     // Recursively process child routes
204 ▶     if (children?.length) {
205 ▶       yield* traverseRoutesConfig({
206 │         ...options,
207 │         routes: children,
208 │         parentRoute: currentRoutePath,
209 │         parentPreloads: metadata.preload,
210 │       });
211 │     }
212 │ 
213 │     // Load and process lazy-loaded child routes
214 ▶     if (loadChildren) {
215 │       if (ɵentryName) {
216 │         appendPreloadToMetadata(ɵentryName, entryPointToBrowserMapping, metadata);
217 │       }
218 │ 
219 ▶       const routeInjector = route.providers
220 ▶         ? createEnvironmentInjector(
221 │             route.providers,
222 │             parentInjector.get(EnvironmentInjector),
223 │             `Route: ${route.path}`,
224 │           )
225 │         : parentInjector;
226 │ 
227 ▶       const loadedChildRoutes = await loadChildrenHelper(route, compiler, routeInjector);
228 │       if (loadedChildRoutes) {
229 ▶         const { routes: childRoutes, injector = routeInjector } = loadedChildRoutes;
230 ▶         yield* traverseRoutesConfig({
231 │           ...options,
232 │           routes: childRoutes,
233 ▶           parentInjector: injector,
234 │           parentRoute: currentRoutePath,
235 │           parentPreloads: metadata.preload,
236 │         });
237 │       }
238 │     }
```

204〜211 行目、`children` は同じ関数で再帰します。214 行目以降が `loadChildren` です。こちらは子のルート配列が無いと先へ進めないので、**実際に読み込みます**。219〜225 行目、ルートに `providers` があれば Router と同じく環境注入器を作り、227 行目で Router 自身の `ɵloadChildren`（[遅延読み込みの章](../router/11-router-lazy-loading.md)）を呼んで、229〜236 行目で子を辿ります。子の `getPrerenderParams` は 233 行目の `parentInjector` の中で走るので、遅延モジュールで provide したサービスも `inject` できます。

## 7. Prerender のルート：handleSSGRoute と :param の展開

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L70–84 （▶ の行: 74, 79, 84）

```ts
70 │ /**
71 │  * Regular expression to match a catch-all route pattern in a URL path,
72 │  * specifically one that ends with '/**'.
73 │  */
74 ▶ const CATCH_ALL_REGEXP = /\/(\*\*)$/;
75 │ 
76 │ /**
77 │  * Regular expression to match a segment preceded by a colon in a string.
78 │  */
79 ▶ const URL_PARAMETER_REGEXP = /(?<!\\):([^/]+)/;
80 │ 
81 │ /**
82 │  * Regular expression to match all segments preceded by a colon in a string.
83 │  */
84 ▶ const URL_PARAMETER_GLOBAL_REGEXP = new RegExp(URL_PARAMETER_REGEXP, 'g');
```

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L415–438 （▶ の行: 416, 419, 423, 426, 428–429, 432, 437）

```ts
415 │   const { route: currentRoutePath, fallback, ...meta } = metadata;
416 ▶   const getPrerenderParams = 'getPrerenderParams' in meta ? meta.getPrerenderParams : undefined;
417 │ 
418 │   if ('getPrerenderParams' in meta) {
419 ▶     delete meta['getPrerenderParams'];
420 │   }
421 │ 
422 │   if (redirectTo !== undefined) {
423 ▶     meta.redirectTo = resolveRedirectTo(currentRoutePath, redirectTo);
424 │   }
425 │ 
426 ▶   const isCatchAllRoute = CATCH_ALL_REGEXP.test(currentRoutePath);
427 │   if (
428 ▶     (isCatchAllRoute && !getPrerenderParams) ||
429 ▶     (!isCatchAllRoute && !URL_PARAMETER_REGEXP.test(currentRoutePath))
430 │   ) {
431 │     // Route has no parameters
432 ▶     yield {
433 │       ...meta,
434 │       route: currentRoutePath,
435 │     };
436 │ 
437 ▶     return;
438 │   }
```

416〜420 行目、サーバールートから `getPrerenderParams` を取り出し、結果に残らないよう消します（関数はマニフェストに書けない）。426 行目、パスが `/**` で終わるか（74 行目の正規表現）。428〜429 行目の条件は「`**` だが展開関数が無い」か「`**` でもなく `:param` も無い」で、どちらも**このパスをそのまま 1 件**として 432〜437 行目で返します。このサイトの `chapter/router` などはすべてここを通ります。

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L440–466 （▶ の行: 440–441, 444, 452, 457–459）

```ts
440 ▶   if (invokeGetPrerenderParams) {
441 ▶     if (!getPrerenderParams) {
442 │       yield {
443 │         error:
444 ▶           `The '${stripLeadingSlash(currentRoutePath)}' route uses prerendering and includes parameters, but 'getPrerenderParams' ` +
445 │           `is missing. Please define 'getPrerenderParams' function for this route in your server routing configuration ` +
446 │           `or specify a different 'renderMode'.`,
447 │       };
448 │ 
449 │       return;
450 │     }
451 │ 
452 ▶     if (serverConfigRouteTree) {
453 │       // Automatically resolve dynamic parameters for nested routes.
454 │       const catchAllRoutePath = isCatchAllRoute
455 │         ? currentRoutePath
456 │         : joinUrlParts(currentRoutePath, '**');
457 ▶       const match = serverConfigRouteTree.match(catchAllRoutePath);
458 ▶       if (match && match.renderMode === RenderMode.Prerender && !('getPrerenderParams' in match)) {
459 ▶         serverConfigRouteTree.insert(catchAllRoutePath, {
460 │           ...match,
461 │           presentInClientRouter: true,
462 │           getPrerenderParams,
463 │         });
464 │       }
465 │     }
466 │ 
```

440 行目の `invokeGetPrerenderParams` は、ビルド時のルート取り出し（第 6 回）だけが `true` にします。441〜449 行目、`:id` を含む Prerender のルートに `getPrerenderParams` が無ければエラー。452〜465 行目は、`product/:id` の展開関数を、その下の `product/:id/**` のサーバールートにも自動で引き継がせる処理です。

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L467–489 （▶ の行: 467, 469–470, 472–473, 475, 477）

```ts
467 ▶     const parameters = await runInInjectionContext(parentInjector, () => getPrerenderParams());
468 │     try {
469 ▶       for (const params of parameters) {
470 ▶         const replacer = handlePrerenderParamsReplacement(params, currentRoutePath);
471 │         const routeWithResolvedParams = currentRoutePath
472 ▶           .replace(URL_PARAMETER_GLOBAL_REGEXP, replacer)
473 ▶           .replace(CATCH_ALL_REGEXP, replacer);
474 │ 
475 ▶         yield {
476 │           ...meta,
477 ▶           route: routeWithResolvedParams,
478 │           redirectTo:
479 │             redirectTo === undefined
480 │               ? undefined
481 │               : resolveRedirectTo(routeWithResolvedParams, redirectTo),
482 │         };
483 │       }
484 │     } catch (error) {
485 │       yield { error: `${(error as Error).message}` };
486 │ 
487 │       return;
488 │     }
489 │   }
```

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L512–530 （▶ の行: 517–519, 528）

```ts
512 │ function handlePrerenderParamsReplacement(
513 │   params: Record<string, string>,
514 │   currentRoutePath: string,
515 │ ): (substring: string, ...args: unknown[]) => string {
516 │   return (match) => {
517 ▶     const parameterName = match.slice(1);
518 ▶     const value = params[parameterName];
519 ▶     if (typeof value !== 'string') {
520 │       throw new Error(
521 │         `The 'getPrerenderParams' function defined for the '${stripLeadingSlash(currentRoutePath)}' route ` +
522 │           `returned a non-string value for parameter '${parameterName}'. ` +
523 │           `Please make sure the 'getPrerenderParams' function returns values for all parameters ` +
524 │           'specified in this route.',
525 │       );
526 │     }
527 │ 
528 ▶     return parameterName === '**' ? `/${value}` : value;
529 │   };
530 │ }
```

467 行目、`runInInjectionContext` の中で呼ぶので、`getPrerenderParams` の中で `inject(ProductService)` が書けます。469 行目で返った配列を 1 要素ずつ回し、472 行目で `:id` を、473 行目で `/**` を、512〜530 行目の置き換え関数で値にします。517 行目で `:` を落とした名前を引き、519 行目、値が文字列でなければエラー。528 行目、`**` の値は `/` 付きで差し込みます。`[{id: '1'}, {id: '2'}]` なら 475〜482 行目で `/product/1` と `/product/2` の 2 件になります。

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L491–501 （▶ の行: 493–494, 498–499）

```ts
491 │   // Handle fallback render modes
492 │   if (
493 ▶     includePrerenderFallbackRoutes &&
494 ▶     (fallback !== PrerenderFallback.None || !invokeGetPrerenderParams)
495 │   ) {
496 │     yield {
497 │       ...meta,
498 ▶       route: currentRoutePath,
499 ▶       renderMode: fallback === PrerenderFallback.Client ? RenderMode.Client : RenderMode.Server,
500 │     };
501 │   }
```

展開した各 URL のほかに、`/product/:id` という**型そのもの**も 1 件返します（498 行目）。ビルド時に作らなかった `/product/99` が来たとき用で、499 行目のとおり fallback が Client なら Client、それ以外は Server の扱いです。493 行目の `includePrerenderFallbackRoutes` は、ビルド時の取り出しでは `outputMode: "server"` のときだけ真です（実行時の取り出しでは `extractRoutesAndCreateRouteTree` の既定値どおり真）。`fallback: None` なら 494 行目で出しません。

📄 `angular-cli/packages/angular/ssr/src/routes/ng-routes.ts` L543–554 （▶ の行: 544, 550–551, 553）

```ts
543 │ function resolveRedirectTo(routePath: string, redirectTo: string): string {
544 ▶   if (redirectTo[0] === '/') {
545 │     // If the redirectTo path is absolute, return it as is.
546 │     return redirectTo;
547 │   }
548 │ 
549 │   // Resolve relative redirectTo based on the current route path.
550 ▶   const segments = routePath.replace(URL_PARAMETER_GLOBAL_REGEXP, '*').split('/');
551 ▶   segments.pop(); // Remove the last segment to make it relative.
552 │ 
553 ▶   return joinUrlParts(...segments, redirectTo);
554 │ }
```

リダイレクト先の解決です。544 行目、`/` で始まればそのまま。相対なら、550 行目でいまのパスの `:param` を `*` にし、551 行目で最後の区切りを捨てて、553 行目で行き先をつなぎます。`user/:id/old` の `redirectTo: 'new'` は `/user/*/new` になり、リクエスト時に第 4 回の `buildPathWithParams` が `*` を実際の値で埋めます。

## 8. RouteTree：insert と match の規則

📄 `angular-cli/packages/angular/ssr/src/routes/route-tree.ts` L114–137 （▶ の行: 116, 121–122, 124–125, 133, 135）

```ts
114 │   insert(route: string, metadata: RouteTreeNodeMetadataWithoutRoute & AdditionalMetadata): void {
115 │     let node = this.root;
116 ▶     const segments = this.getPathSegments(route);
117 │     const normalizedSegments: string[] = [];
118 │ 
119 │     for (const segment of segments) {
120 │       // Replace parameterized segments (e.g., :id) with a wildcard (*) for matching
121 ▶       const normalizedSegment = segment[0] === ':' ? '*' : segment;
122 ▶       let childNode = node.children.get(normalizedSegment);
123 │       if (!childNode) {
124 ▶         childNode = this.createEmptyRouteTreeNode();
125 ▶         node.children.set(normalizedSegment, childNode);
126 │       }
127 │ 
128 │       node = childNode;
129 │       normalizedSegments.push(normalizedSegment);
130 │     }
131 │ 
132 │     // At the leaf node, store the full route and its associated metadata
133 ▶     node.metadata = {
134 │       ...metadata,
135 ▶       route: addLeadingSlash(normalizedSegments.join('/')),
136 │     };
137 │   }
```

116 行目でパスを `/` で区切り（空の区切りは捨て、`decodeURIComponent` する）、1 区切りずつ子の `Map` を降ります。121 行目、`:id` のような区切りは名前を捨てて `*` に正規化します。だから `:id` と `:slug` は同じ枝です。`**` は文字どおり `'**'` というキーの子になります。133〜136 行目、最後の区切りの節点に値を置きます。

📄 `angular-cli/packages/angular/ssr/src/routes/route-tree.ts` L139–151 （▶ の行: 148, 150）

```ts
139 │   /**
140 │    * Matches a given route against the route tree and returns the best matching route's metadata.
141 │    * The best match is determined by the lowest insertion index, meaning the earliest defined route
142 │    * takes precedence.
143 │    *
144 │    * @param route - The route path to match against the route tree.
145 │    * @returns The metadata of the best matching route or `undefined` if no match is found.
146 │    */
147 │   match(route: string): (RouteTreeNodeMetadata & AdditionalMetadata) | undefined {
148 ▶     const segments = this.getPathSegments(route);
149 │ 
150 ▶     return this.traverseBySegments(segments)?.metadata;
151 │   }
```

📄 `angular-cli/packages/angular/ssr/src/routes/route-tree.ts` L227–262 （▶ の行: 232–233, 236, 243, 245, 252, 254, 261）

```ts
227 │   private traverseBySegments(
228 │     segments: string[],
229 │     node = this.root,
230 │     currentIndex = 0,
231 │   ): RouteTreeNode<AdditionalMetadata> | undefined {
232 ▶     if (currentIndex >= segments.length) {
233 ▶       return node.metadata ? node : node.children.get('**');
234 │     }
235 │ 
236 ▶     if (!node.children.size) {
237 │       return undefined;
238 │     }
239 │ 
240 │     const segment = segments[currentIndex];
241 │ 
242 │     // 1. Attempt exact match with the current segment.
243 ▶     const exactMatch = node.children.get(segment);
244 │     if (exactMatch) {
245 ▶       const match = this.traverseBySegments(segments, exactMatch, currentIndex + 1);
246 │       if (match) {
247 │         return match;
248 │       }
249 │     }
250 │ 
251 │     // 2. Attempt wildcard match ('*').
252 ▶     const wildcardMatch = node.children.get('*');
253 │     if (wildcardMatch) {
254 ▶       const match = this.traverseBySegments(segments, wildcardMatch, currentIndex + 1);
255 │       if (match) {
256 │         return match;
257 │       }
258 │     }
259 │ 
260 │     // 3. Attempt double wildcard match ('**').
261 ▶     return node.children.get('**');
262 │   }
```

1. **232〜233 行目：区切りを使い切ったら**

   その節点に値があればそれ。無ければ子の `**`。だから `admin/**` は `/admin` 自体にも当たります。
2. **243〜249 行目：まず完全一致の子へ**

   245 行目で 1 つ先へ再帰し、その先で当たればそれを返します。
3. **252〜258 行目：だめなら `*`（`:param`）の子へ**

   完全一致の枝で最後まで当たらなかったときだけ、ここに戻ってきます（後戻り）。
4. **261 行目：最後に `**`**

   残りの区切りが何個でも、`**` の節点が丸ごと受けます。

つまり優先順位は「書いた順」ではなく**区切りごとに 完全一致 → `*` → `**`** です（147 行目の上の JSDoc は「先に定義したものが勝つ」と書いていますが、実装は 243〜261 行目のとおりです）。リクエスト時は `ServerRouter.match` がこの前に URL を整えます。

📄 `angular-cli/packages/angular/ssr/src/routes/router.ts` L85–92 （▶ の行: 88–89, 91）

```ts
85 │   match(url: URL): RouteTreeNodeMetadata | undefined {
86 │     // Strip 'index.html' from URL if present.
87 │     // A request to `http://www.example.com/page/index.html` will render the Angular route corresponding to `http://www.example.com/page`.
88 ▶     let { pathname } = stripIndexHtmlFromURL(url);
89 ▶     pathname = stripMatrixParams(pathname);
90 │ 
91 ▶     return this.routeTree.match(pathname);
92 │   }
```

88 行目で末尾の `/index.html` を外し、89 行目で `;a=1` のような行列パラメータを消してから、91 行目で木を引きます。

> **🧪 DEMO — 同じ照合規則で、パスがどのサーバールートに当たるか**
>
> route-tree.ts の insert（121 行目の `:x` → `*`）と traverseBySegments（232〜261 行目）を数行で書き直した関数です。`@angular/ssr` は読み込んでいません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ssr-server-routes)

## このサイトの app.routes.server.ts が意味すること

サーバールートの木は `**` の節点 1 つだけです。Router の各ルートを 324 行目で照合すると、根に完全一致の子も `*` の子も無いので、どれも 261 行目の `**` に当たります。

| Router のルート（app.routes.ts） | traverseRoutesConfig が作る route | 当たるサーバールート | 結果 |
| --- | --- | --- | --- |
| `path: ''`（loadComponent） | `/`（346 行目で末尾 `/`） | `**` | Prerender。426〜437 行目でそのまま 1 件 |
| `'chapters'`・`'repos'`・`'glossary'` | `/chapters` など | `**` | Prerender 1 件ずつ |
| `'series/platform'` など（シリーズ数ぶん） | `/series/platform` | `**` | Prerender 1 件ずつ |
| `'chapter'`（`loadChildren`）の子 `'ssr-server-routes'` など（章数ぶん） | `/chapter/ssr-server-routes` | `**` | Prerender 1 件ずつ。`preload` にその章のチャンク（172 行目） |
| `{ path: '**', redirectTo: '' }` | `/**`、`redirectTo: '/'`（423 行目） | `**` | 木には入るが、`*` を含むのでプリレンダーでは飛ばされる（第 6 回） |

どのルートも `:param` を持たないので `getPrerenderParams` は要りません。章のルートは `chapter.routes.ts` に分けてあり（main に章の一覧を入れないため）、ルートの抜き出しは上の 214〜236 行目で `loadChildren` を実際に読み込んで辿るので、親の `chapter` と子の `path` がつながった `/chapter/…` になります。章を足すと Router のルートが 1 本増え、それがそのまま 1 件の Prerender になります。数は[第 6 回](06-ssr-prerender.md)のデモで数えます。

## 呼び出しの連なり

- `ServerRouter.from(manifest, url)` — ssr/src/routes/router.ts L48 — *マニフェストに routes があれば fromObject で終わり*
  - `extractRoutesAndCreateRouteTree({ url, manifest })` — ng-routes.ts L796
    - `getRoutesFromAngularRouterConfig(bootstrap, document, url, ...)` — ng-routes.ts L621
      - `platformServer([..., ENABLE_ROOT_COMPONENT_BOOTSTRAP=false, IS_DISCOVERING_ROUTES=true])` — L632
      - 👤 `bootstrap({ platformRef })` — src/main.server.ts — *APP\_INITIALIZER は走る、App は作られない*
      - `buildServerConfigRouteTree(SERVER_ROUTES_CONFIG)` — L567
      - `traverseRoutesConfig({ routes: router.config, ... })` — L255
        - `serverConfigRouteTree.match(currentRoutePath)` — route-tree.ts L147
        - `handleRoute → handleSSGRoute / resolveRedirectTo / loadChildrenHelper` — L146, L401
    - `routeTree.insert(baseHref + route, metadata)` — route-tree.ts L114
- `ServerRouter.match(url) → RouteTree.match(pathname)` — router.ts L85 — *リクエストごと*

## 聞かれそうな質問

**Q. サーバールートに書いていない Router のルートはどうなりますか？**

エラーです。traverseRoutesConfig の 324 行目で当たらないと、328〜329 行目のメッセージが返り、4 節の 717〜718 行目でたまります。ビルド時ならビルドが失敗し、実行時なら router.ts 59〜64 行目で例外になります。だから最後に `{ path: '**', renderMode: ... }` を置くのが定石です。逆に、Router に無いサーバールートも 742 行目でエラーです（`/**` を除く）。

**Q. `:id` を含むルートはプリレンダーできますか？**

`getPrerenderParams` を書けばできます。467 行目で注入コンテキストの中で呼ばれ、返した配列の要素ごとに 472 行目で `:id` を置き換えた URL が 1 件ずつできます。書かずに Prerender にすると 444 行目のエラーです。作らなかった値の URL は、`outputMode: "server"` なら 498〜499 行目の fallback（既定 Server）で描かれ、`static` では fallback 自体が作られない（493 行目）ので配られません。

**Q. ルートを取り出すためにアプリを起動すると、副作用はありませんか？**

あります。646 行目でルートコンポーネントの描画は止めますが、`bootstrapApplication` の `APP_INITIALIZER` と環境注入器の初期化は走ります。`loadChildren` は 227 行目で実際に読み込まれ、子の `getPrerenderParams` も実行されます（`loadComponent` は読み込まない）。初期化で API を叩く・ログを送るなどがあるなら、`inject(IS_DISCOVERING_ROUTES)`（650 行目で `true`）を見て飛ばします。

**Q. `product/:id` と `product/new` の両方があると、`/product/new` はどちらに当たりますか？**

書いた順に関係なく `product/new` です。243〜249 行目の完全一致が 252〜258 行目の `*` より先に試されるからです。`/product/42` は完全一致の子が無いので `*`（`:id`）に当たります。上のデモの「例」で確かめられます。

**Q. Prerender のルートに `status: 404` を書けますか？**

書けません。113 行目で `ServerRoutePrerender` は `status` を `Omit` しているので型エラーです。作り置きは静的ファイルとして 200 で配られるので、404 を返したいページは Server にします。`headers` は書けて、[第 4 回](04-ssr-app-engine.md)の `handleServe` が作り置きを返すときの応答ヘッダーに足します（静的ホスティングで配る場合は、そのホスティングの設定で付けます）。

## 読み終えて

- `withRoutes` は配列を `SERVER_ROUTES_CONFIG` として provide するだけ。読むのはアプリを起動したあとの `inject`。
- ルートの取り出しは、`ɵENABLE_ROOT_COMPONENT_BOOTSTRAP=false` と `IS_DISCOVERING_ROUTES=true` で platformServer を作ってアプリを起動し、`router.config` を再帰で辿る。`loadChildren` は読み込み、`loadComponent` はチャンク名だけ。
- Router のルートは全部どれかのサーバールートに当たる必要がある。当たったサーバールートの RenderMode・headers・status がそのルートの値になる。
- Prerender の `:param` は `getPrerenderParams` の配列で展開し、fallback 用に型そのものも 1 件残す（server のとき）。
- `RouteTree` は `:x` を `*` にした区切りの木。照合は区切りごとに 完全一致 → `*` → `**` の順で、後戻りあり。

---

← 前: [AngularAppEngine と AngularServerApp：Request から Response まで](04-ssr-app-engine.md)  
次: [プリレンダー：ビルド時に全ルートを HTML にする](06-ssr-prerender.md) →
