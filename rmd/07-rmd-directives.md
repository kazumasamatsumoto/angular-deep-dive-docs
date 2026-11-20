[目次](../README.md) › [Router の型と説明文の読み残し](README.md) › 第 7 回 / 全 9 回

# RouterLink・RouterLinkActive・RouterOutlet の説明文

> directives/router\_link.ts・router\_link\_active.ts・router\_outlet.ts の未読の行：RouterLink の説明と例（差分の URL、相対パス、query、state、custom element）、入力と RouterLinkWithHref、RouterLinkActive と RouterOutlet の説明の残り。説明文の例を本物に入れて href と active を読む。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-directives)

---

この章で分かること：`RouterLink` の長い doc コメント（angular.dev の API リファレンスになる文）の例を、本物の `RouterLink` に 1 つずつ入れると、どんな `href` になるか。`RouterLinkActive` と `RouterOutlet` の doc の残りが何を約束しているか。例の結果はほとんど doc のとおりで、合わないのは「`../` は Route の木を 1 段上がる」の 1 文です。

読む対象は `packages/router/src/directives/router_link.ts`・`router_link_active.ts`・`router_outlet.ts` の、これまでの章が引いていない行です（../angular、8576f161ae4）。入力が行き先ごとにどう分かれるかは[RouterLink の入力](../rdir/01-rdir-link-inputs.md)、active の判定と doc の「`'/user'` でも付く」の誤りは[RouterLinkActive](../rdir/02-rdir-link-active.md)、outlet の 4 つの出力と `name` は[RouterOutlet](../rdir/03-rdir-outlet.md)で読みました。

1. [1. models.ts の小さな型](01-rmd-basic-types.md)
2. [2. Route の説明文](02-rmd-route.md)
3. [3. ガードの型](03-rmd-guards.md)
4. [4. Resolve と NavigationBehaviorOptions](04-rmd-resolve-nav.md)
5. [5. provideRouter の機能](05-rmd-features.md)
6. [6. ルーターのイベント](06-rmd-events.md)
7. **7. RouterLink と RouterOutlet**（この章）
8. [8. URL とナビゲーションの小道具](08-rmd-url-rest.md)
9. [9. spec と issue](09-rmd-tests-issues.md)

## 1. router\_link.ts の import：signal で組んだディレクティブ

📄 `angular/packages/router/src/directives/router_link.ts` L9–44 （▶ の行: 13, 15, 21–22, 27–28, 30, 42–43）

```ts
 9 │ import {LocationStrategy} from '@angular/common';
10 │ import {
11 │   Attribute,
12 │   booleanAttribute,
13 ▶   computed,
14 │   Directive,
15 ▶   effect,
16 │   ElementRef,
17 │   HostAttributeToken,
18 │   HostListener,
19 │   inject,
20 │   Input,
21 ▶   input,
22 ▶   linkedSignal,
23 │   OnChanges,
24 │   OnDestroy,
25 │   Renderer2,
26 │   ɵRuntimeError as RuntimeError,
27 ▶   Service,
28 ▶   signal,
29 │   SimpleChanges,
30 ▶   untracked,
31 │   ɵINTERNAL_APPLICATION_ERROR_HANDLER,
32 │ } from '@angular/core';
33 │ import {Subject} from 'rxjs';
34 │ 
35 │ import {RuntimeErrorCode} from '../errors';
36 │ import {NavigationEnd} from '../events';
37 │ import {QueryParamsHandling} from '../models';
38 │ import {Router} from '../router';
39 │ import {ROUTER_CONFIGURATION} from '../router_config';
40 │ import {ActivatedRoute} from '../router_state';
41 │ import {Params} from '../shared';
42 ▶ import {StateManager} from '../statemanager/state_manager';
43 ▶ import {isUrlTree, UrlSerializer, UrlTree} from '../url_tree';
44 │ 
```

13・15・21・22・28・30 行目の `computed`・`effect`・`input`・`linkedSignal`・`signal`・`untracked` は、89d47d814de（2026-01-12、`refactor(router): Change RouterLink internals to use signals`）で入れ替えた中身の部品です。セッターが signal に書くだけになった話は[RouterLink の入力](../rdir/01-rdir-link-inputs.md)の 2 節にあります。27 行目の `Service` は、45〜72 行目の `ReactiveRouterState`（`@Service()`）に使います。42 行目の `StateManager` と 43 行目の `UrlSerializer` は、その中で今の URL を読み直すためです（[RouterLinkActive の仕組み](../router/18-router-link-active.md)の引用）。

## 2. doc の前半：静的なリンク、配列、「今の URL への差分」

📄 `angular/packages/router/src/directives/router_link.ts` L74–99 （▶ の行: 81, 83, 88–89, 92, 94–97）

```ts
74 │ /**
75 │  * @description
76 │  *
77 │  * When applied to an element in a template, makes that element a link
78 │  * that initiates navigation to a route. Navigation opens one or more routed
79 │  * components in one or more `<router-outlet>` locations on the page.
80 │  *
81 ▶  * Given a route configuration `[{ path: 'user/:name', component: UserCmp }]`,
82 │  * the following creates a static link to the route:
83 ▶  * `<a routerLink="/user/bob">link to user component</a>`
84 │  *
85 │  * You can use dynamic values to generate the link.
86 │  * For a dynamic link, pass an array of path segments,
87 │  * followed by the params for each segment.
88 ▶  * For example, `['/team', teamId, 'user', userName, {details: true}]`
89 ▶  * generates a link to `/team/11/user/bob;details=true`.
90 │  *
91 │  * Multiple static segments can be merged into one term and combined with
92 ▶  * dynamic segments. For example, `['/team/11/user', userName, {details: true}]`
93 │  *
94 ▶  * The input that you provide to the link is treated as a delta to the current
95 ▶  * URL. For instance, suppose the current URL is `/user/(box//aux:team)`. The
96 ▶  * link `<a [routerLink]="['/user/jim']">Jim</a>` creates the URL
97 ▶  * `/user/(jim//aux:team)`.
98 │  * See {@link Router#createUrlTree} for more information.
99 │  *
```

81〜83 行目の Route と静的なリンク、88〜89 行目の配列の例（`/team/11/user/bob;details=true`）、92 行目の「静的な部分を 1 つにまとめる」例を、デモはそのまま入れます。結果はどれも doc のとおりでした（デモの r1〜r3）。94〜97 行目は「入力は今の URL への差分として扱われる。今の URL が `/user/(box//aux:team)` なら、`['/user/jim']` は `/user/(jim//aux:team)` を作る」です。デモでも `/user/(jim//aux:team)` になり、`aux` の outlet が残りました。`routerLink="/user/bob"` の文字列でも同じで、`/user/(bob//aux:team)` です。先頭が `/` のコマンドは根の `UrlSegmentGroup` を作り直すのではなく、今の木の `user` の下の primary だけを替えるからです（[createUrlTree](../router/03-router-create-url-tree.md)）。

## 3. 相対パスと query：../ だけが言い方と合わない

📄 `angular/packages/router/src/directives/router_link.ts` L100–127 （▶ の行: 107–113, 121–122, 126）

````ts
100 │  * @usageNotes
101 │  *
102 │  * You can use absolute or relative paths in a link, set query parameters,
103 │  * control how parameters are handled, and keep a history of navigation states.
104 │  *
105 │  * ### Relative link paths
106 │  *
107 ▶  * The first segment name can be prepended with `/`, `./`, or `../`.
108 ▶  * * If the first segment begins with `/`, the router looks up the route from
109 ▶  * the root of the app.
110 ▶  * * If the first segment begins with `./`, or doesn't begin with a slash, the
111 ▶  * router looks in the children of the current activated route.
112 ▶  * * If the first segment begins with `../`, the router goes up one level in the
113 ▶  * route tree.
114 │  *
115 │  * ### Setting and handling query params and fragments
116 │  *
117 │  * The following link adds a query parameter and a fragment to the generated
118 │  * URL:
119 │  *
120 │  * ```html
121 ▶  * <a [routerLink]="['/user/bob']" [queryParams]="{debug: true}"
122 ▶  * fragment="education"> link to user component
123 │  * </a>
124 │  * ```
125 │  * By default, the directive constructs the new URL using the given query
126 ▶  * parameters. The example generates the link: `/user/bob?debug=true#education`.
127 │  *
````

107〜113 行目は先頭の 3 つの形を説明します。`/` は「アプリの根から」、`./` かスラッシュ無しは「今 activate されている Route の子」、`../` は「**Route の木で 1 段上がる**」。デモでは `UserCmp`（Route は `path: 'user/:name'`、URL は `/team/11/user/bob`）の中に置いた `routerLink="../jim"` が `/team/11/user/jim` になりました。doc の言い方どおり Route の木で 1 段上がるのなら、行き先は `team/:id` の Route（`/team/11`）の下の `jim`、つまり `/team/11/jim` です。実際は **URL のセグメントを 1 つ戻って**（`bob` を外して）`jim` を足しています。

`Router.createUrlTree` の doc（router.ts の 457〜466 行目、[createUrlTree](../router/03-router-create-url-tree.md)で引用）は「Route が `user/11` を指すとき、`['../22']` は `/team/33/user/22`」と、セグメントで数える例を載せています。112〜113 行目の文は 296a447e3c9（2016-06-28、`docs(router): add api docs`）からで、origin/main でも同じです。`path` が 1 セグメントの Route ばかりなら 2 つの言い方は同じ結果になるので、違いが出るのは `'user/:name'` のような複数セグメントの `path` のときです。121〜126 行目の `queryParams` と `fragment` の例は、doc のとおり `/user/bob?debug=true#education` でした（r5）。

📄 `angular/packages/router/src/directives/router_link.ts` L128–147 （▶ の行: 130, 132–133, 143–144）

````ts
128 │  * You can instruct the directive to handle query parameters differently
129 │  * by specifying the `queryParamsHandling` option in the link.
130 ▶  * Allowed values are:
131 │  *
132 ▶  *  - `'merge'`: Merge the given `queryParams` into the current query params.
133 ▶  *  - `'preserve'`: Preserve the current query params.
134 │  *
135 │  * For example:
136 │  *
137 │  * ```html
138 │  * <a [routerLink]="['/user/bob']" [queryParams]="{debug: true}"
139 │  * queryParamsHandling="merge"> link to user component
140 │  * </a>
141 │  * ```
142 │  *
143 ▶  * `queryParams`, `fragment`, `queryParamsHandling`, `preserveFragment`, and
144 ▶  * `relativeTo` cannot be used when the `routerLink` input is a `UrlTree`.
145 │  *
146 │  * See {@link UrlCreationOptions#queryParamsHandling}.
147 │  *
````

130〜133 行目は使える値を `'merge'` と `'preserve'` の 2 つだけ挙げます。型の `QueryParamsHandling` にはほかに `'replace'` と `''` があり（[第 1 回](01-rmd-basic-types.md)）、どちらも既定と同じく「渡した `queryParams` だけ」です。デモで今の URL が `/team/11/user/bob?page=1#intro` のとき、`'merge'` は `/user/bob?page=1&debug=true`、`'preserve'` は `/user/bob?page=1`（`debug` は捨てる）、`preserveFragment` は `/user/bob#intro` でした。

143〜144 行目は「`routerLink` が `UrlTree` のときは `queryParams`・`fragment`・`queryParamsHandling`・`preserveFragment`・`relativeTo` を使えない」です。使えないことを知らせるのは開発モードの `effect` だけで（[RouterLink の入力](../rdir/01-rdir-link-inputs.md)の 5 節）、Node の開発モードでは `NG04017` の例外が 1 回、このページ（本番ビルド）では例外が無く、`href` は `queryParams` を黙って捨てた `/user/bob` です（デモの下の行）。

## 4. state と、custom element

📄 `angular/packages/router/src/directives/router_link.ts` L148–182 （▶ の行: 150, 156, 161–162, 168–169, 175–177）

````ts
148 │  * ### Preserving navigation history
149 │  *
150 ▶  * You can provide a `state` value to be persisted to the browser's
151 │  * [`History.state`
152 │  * property](https://developer.mozilla.org/en-US/docs/Web/API/History#Properties).
153 │  * For example:
154 │  *
155 │  * ```html
156 ▶  * <a [routerLink]="['/user/bob']" [state]="{tracingId: 123}">
157 │  *   link to user component
158 │  * </a>
159 │  * ```
160 │  *
161 ▶  * Use {@link Router#currentNavigation} to retrieve a saved Signal
162 ▶  * navigation-state value. For example, to capture the `tracingId` during the `NavigationStart`
163 │  * event:
164 │  *
165 │  * ```ts
166 │  * // Get NavigationStart events
167 │  * router.events.pipe(filter(e => e instanceof NavigationStart)).subscribe(e => {
168 ▶  *   const navigation = router.currentNavigation();
169 ▶  *   tracingService.trace({id: navigation.extras.state.tracingId});
170 │  * });
171 │  * ```
172 │  *
173 │  * ### RouterLink compatible custom elements
174 │  *
175 ▶  * In order to make a custom element work with routerLink, the corresponding
176 ▶  * custom element must implement the `href` attribute and must list `href` in
177 ▶  * the array of the static property/getter `observedAttributes`.
178 │  *
179 │  * @ngModule RouterModule
180 │  *
181 │  * @publicApi
182 │  */
````

150〜156 行目は「`state` の値はブラウザの `History.state` に保存される」、161〜169 行目は「`NavigationStart` のときに `router.currentNavigation()` から `extras.state.tracingId` を読める」です。デモは `[state]="{tracingId: 123}"` のリンクを `click()` し、`NavigationStart` の中で `currentNavigation()?.extras.state` が `{"tracingId":123}`、偽の `LocationStrategy` に届いた `pushState` の state が `{"tracingId":123,"navigationId":9}` でした。Router は自分の `navigationId` を足して保存します。166〜170 行目の例をそのまま TypeScript（サイトの 6.0.3、`--strict`）にかけると、169 行目で `TS18047: 'navigation' is possibly 'null'.` と `TS18048: 'navigation.extras.state' is possibly 'undefined'.` です。`currentNavigation()` の型が `Navigation | null`、`extras.state` が省略できるためで、デモは `?.` を使っています。

175〜177 行目は「custom element で使うには、`href` 属性を実装し、`observedAttributes` に `href` を入れる」です。実装は 384〜400 行目の `customElements.get(tagName)?.observedAttributes?.includes?.('href')`（[RouterLinkActive の仕組み](../router/18-router-link-active.md)の引用）で、`href` 属性を「実装する」かどうかは見ていません。このページのデモでは custom element を登録しません（`customElements.define` はページ全体に残り、取り消せないため）。

## 5. 入力の doc 2 つと、古い別名

📄 `angular/packages/router/src/directives/router_link.ts` L229–237 （▶ の行: 232–233, 237）

```ts
229 │   protected _target = signal<string | undefined>(undefined);
230 │ 
231 │   /**
232 ▶    * Passed to {@link Router#createUrlTree} as part of the
233 ▶    * `UrlCreationOptions`.
234 │    * @see {@link UrlCreationOptions#queryParams}
235 │    * @see {@link Router#createUrlTree}
236 │    */
237 ▶   @Input() set queryParams(value: Params | null | undefined) {
```

📄 `angular/packages/router/src/directives/router_link.ts` L442–453 （▶ の行: 444, 446–448, 451）

```ts
442 │ 
443 │   /**
444 ▶    * Commands to pass to {@link Router#createUrlTree} or a `UrlTree`.
445 │    *   - **array**: commands to pass to {@link Router#createUrlTree}.
446 ▶    *   - **string**: shorthand for array of commands with just the string, i.e.
447 ▶    * `['/route']`
448 ▶    *   - **UrlTree**: a `UrlTree` for this link rather than creating one from
449 │    * the commands and other inputs that correspond to properties of
450 │    * `UrlCreationOptions`.
451 ▶    *   - **null|undefined**: effectively disables the `routerLink`
452 │    * @see {@link Router#createUrlTree}
453 │    */
```

232〜233 行目は `queryParams` を「`UrlCreationOptions` の一部として `Router#createUrlTree` に渡す」と書きます。444〜451 行目は `routerLink` 自身の型ごとの意味で、文字列は `['/route']` の略、`UrlTree` はそのまま、`null` / `undefined` は「リンクを実質的に無効にする」。デモの `[routerLink]="null"` は `href` 属性が消え（`getAttribute('href')` が `null`）、`urlTree` も `null` です。447 行目の「文字列は 1 要素の配列の略」は、`'../jim'` のような文字列も `['../jim']` と同じに扱う、という意味です（u3）。

📄 `angular/packages/router/src/directives/router_link.ts` L583–592 （▶ の行: 587–588, 590, 592）

```ts
583 │ }
584 │ 
585 │ /**
586 │  * @description
587 ▶  * An alias for the `RouterLink` directive.
588 ▶  * Deprecated since v15, use `RouterLink` directive instead.
589 │  *
590 ▶  * @publicApi
591 │  */
592 ▶ export {RouterLink as RouterLinkWithHref};
```

592 行目の `RouterLinkWithHref` は `RouterLink` そのものの別名で、デモの `RouterLinkWithHref === RouterLink` は `true` です。588 行目は「v15 から非推奨」と本文に書くだけで、`@deprecated` の印がありません。TypeScript のエディターは `@deprecated` の印を見て取り消し線を出すので、この別名を使っても印が出ません（590 行目は `@publicApi`）。この doc は、少し前まで `export` の行が doc コメントの中に紛れ込み、`nstead.` という切れ端も残っていました。a74801c59cd（2026-06-29、`fix(router): fix malformed jsdoc comment for RouterLinkWithHref export`）で今の形になっています。

## 6. RouterLinkActive と RouterOutlet の doc の残り

📄 `angular/packages/router/src/directives/router_link_active.ts` L9–42 （▶ の行: 31, 33, 39–41）

```ts
 9 │ import {
10 │   AfterContentInit,
11 │   ChangeDetectorRef,
12 │   ContentChildren,
13 │   Directive,
14 │   ElementRef,
15 │   EventEmitter,
16 │   inject,
17 │   Input,
18 │   OnChanges,
19 │   OnDestroy,
20 │   Output,
21 │   QueryList,
22 │   Renderer2,
23 │   SimpleChanges,
24 │   untracked,
25 │ } from '@angular/core';
26 │ import {from, of, Subscription} from 'rxjs';
27 │ import {mergeAll} from 'rxjs/operators';
28 │ 
29 │ import {Event, NavigationEnd} from '../events';
30 │ import {Router} from '../router';
31 ▶ import {isActive, IsActiveMatchOptions, exactMatchOptions, subsetMatchOptions} from '../url_tree';
32 │ 
33 ▶ import {RouterLink} from './router_link';
34 │ 
35 │ /**
36 │  *
37 │  * @description
38 │  *
39 ▶  * Tracks whether the linked route of an element is currently active, and allows you
40 ▶  * to specify one or more CSS classes to add to the element when the linked route
41 ▶  * is active.
42 │  *
```

📄 `angular/packages/router/src/directives/router_link_active.ts` L101–108 （▶ の行: 101, 103, 107）

```ts
101 ▶  * Content children queries do not retrieve elements or directives that are in other components' templates, since a component's template is always a black box to its ancestors.
102 │  *
103 ▶  * @ngModule RouterModule
104 │  *
105 │  * @see [Detect active current route with RouterLinkActive](guide/routing/read-route-state#detect-active-current-route-with-routerlinkactive)
106 │  *
107 ▶  * @publicApi
108 │  */
```

📄 `angular/packages/router/src/directives/router_link_active.ts` L220–227 （▶ の行: 224–225）

```ts
220 │     this.update();
221 │   }
222 │   /** @docs-private */
223 │   ngOnDestroy(): void {
224 ▶     this.routerEventsSubscription.unsubscribe();
225 ▶     this.linkInputChangesSubscription?.unsubscribe();
226 │   }
227 │ 
```

39〜41 行目は「リンク先の Route が active かを追い、active のとき 1 つ以上の CSS クラスを付ける」。31 行目で `url_tree.ts` の `isActive` と 2 つの既定の options を import し、33 行目で `RouterLink` を import します（判定の中身は[RouterLinkActive の仕組み](../router/18-router-link-active.md)）。101 行目は「`ContentChildren` の query なので、ほかのコンポーネントのテンプレートの中のリンクは拾えない」です。224〜225 行目の `ngOnDestroy` は、Router の購読とリンクの入力の変化の購読を外します。

デモは doc の例（43〜98 行目、[前のシリーズ](../rdir/02-rdir-link-active.md)の引用）を 6 つ置きます。`'/user'` で `routerLink="/user/bob"` に `active-link` が付かないことは前のシリーズで読んだ食い違いで、ここでも同じでした。もう 1 つ見えるのは、`routerLink="/"` に `ariaCurrentWhenActive="page"` を付けた例が、**どの URL でも active**になることです。既定の subset の判定では `/` はすべての URL に含まれるので、ホームのリンクは `{exact: true}` を足さないと常に `aria-current="page"` になります。doc の例はそこに触れていません。

📄 `angular/packages/router/src/directives/router_outlet.ts` L9–42 （▶ の行: 36, 41）

```ts
 9 │ import {
10 │   ChangeDetectorRef,
11 │   ComponentRef,
12 │   Directive,
13 │   effect,
14 │   EffectRef,
15 │   EnvironmentInjector,
16 │   EventEmitter,
17 │   inject,
18 │   Injectable,
19 │   InjectionToken,
20 │   Injector,
21 │   Input,
22 │   input,
23 │   OnDestroy,
24 │   OnInit,
25 │   Output,
26 │   reflectComponentType,
27 │   ɵRuntimeError as RuntimeError,
28 │   Signal,
29 │   SimpleChanges,
30 │   ViewContainerRef,
31 │ } from '@angular/core';
32 │ import {combineLatest, of, Subscription} from 'rxjs';
33 │ import {switchMap} from 'rxjs/operators';
34 │ 
35 │ import {RuntimeErrorCode} from '../errors';
36 ▶ import type {RouterResourcesFeatureImplementation} from '../router_resource_feature';
37 │ import {Data} from '../models';
38 │ import {ChildrenOutletContexts} from '../router_outlet_context';
39 │ import {ActivatedRoute} from '../router_state';
40 │ import {PRIMARY_OUTLET} from '../shared';
41 ▶ import {ComponentInputBindingOptions} from '../router_config';
42 │ 
```

📄 `angular/packages/router/src/directives/router_outlet.ts` L67–80 （▶ の行: 71, 73–76）

```ts
67 │ 
68 │ /**
69 │  * An interface that defines the contract for developing a component outlet for the `Router`.
70 │  *
71 ▶  * An outlet acts as a placeholder that Angular dynamically fills based on the current router state.
72 │  *
73 ▶  * A router outlet should register itself with the `Router` via
74 ▶  * `ChildrenOutletContexts#onChildOutletCreated` and unregister with
75 ▶  * `ChildrenOutletContexts#onChildOutletDestroyed`. When the `Router` identifies a matched `Route`,
76 ▶  * it looks for a registered outlet in the `ChildrenOutletContexts` and activates it.
77 │  *
78 │  * @see {@link ChildrenOutletContexts}
79 │  * @publicApi
80 │  */
```

📄 `angular/packages/router/src/directives/router_outlet.ts` L189–225 （▶ の行: 190–194, 213, 223）

````ts
189 │  *
190 ▶  * A router outlet emits an activate event when a new component is instantiated,
191 ▶  * deactivate event when a component is destroyed.
192 ▶  * An attached event emits when the `RouteReuseStrategy` instructs the outlet to reattach the
193 ▶  * subtree, and the detached event emits when the `RouteReuseStrategy` instructs the outlet to
194 ▶  * detach the subtree.
195 │  *
196 │  * ```html
197 │  * <router-outlet
198 │  *   (activate)='onActivate($event)'
199 │  *   (deactivate)='onDeactivate($event)'
200 │  *   (attach)='onAttach($event)'
201 │  *   (detach)='onDetach($event)'></router-outlet>
202 │  * ```
203 │  *
204 │  * @see {@link RouterLink}
205 │  * @see {@link Route}
206 │  * @see [Show routes with outlets](guide/routing/show-routes-with-outlets)
207 │  * @ngModule RouterModule
208 │  *
209 │  * @publicApi
210 │  */
211 │ @Directive({
212 │   selector: 'router-outlet',
213 ▶   exportAs: 'outlet',
214 │ })
215 │ export class RouterOutlet implements OnDestroy, OnInit, RouterOutletContract {
216 │   private activated: ComponentRef<any> | null = null;
217 │   /** @internal */
218 │   get activatedComponentRef(): ComponentRef<any> | null {
219 │     return this.activated;
220 │   }
221 │   private _activatedRoute: ActivatedRoute | null = null;
222 │   /**
223 ▶    * The name of the outlet
224 │    *
225 │    */
````

36 行目の `RouterResourcesFeatureImplementation` は `import type` で、`withRouterResources` を使わないアプリに resources の実装を持ち込まないための形です。41 行目の `ComponentInputBindingOptions` は `RoutedComponentInputBinder` が受け取ります（[第 5 回](05-rmd-features.md)の 9 節）。73〜76 行目は「outlet は `ChildrenOutletContexts#onChildOutletCreated` で登録し、`onChildOutletDestroyed` で外す。Router は一致した Route の outlet をそこで探して activate する」です（[RouterOutlet](../rdir/03-rdir-outlet.md)の 1 節）。190〜194 行目は 4 つの出力の約束で、デモの根の outlet は `/user/…` と `/team/…` と `/` を行き来するたびに `activate(ShellCmp)` と `deactivate(ShellCmp)` を出しました。`/user/bob` から `/user/jim` のように同じ `ShellCmp` のままの移動では出ません。213 行目の `exportAs: 'outlet'` で `#o="outlet"` と書けます。223 行目の `name` の doc は「outlet の名前」だけで、上の 166〜167 行目（[RouterOutlet](../rdir/03-rdir-outlet.md)の引用）の「動的に変えられない」は、origin/main の 2af465b71f3（2026-11-03、`docs(router): fix the router outlet name note`）で「値を変えると、今のコンポーネントを壊して新しい名前の Route を描く」に直りました。

## 7. 動かして確かめる

> **🧪 DEMO — doc の例の RouterLink / RouterLinkActive を本物に入れ、href と active を読む**
>
> ボタンを押すと、子の環境インジェクター（`INJECTOR_SCOPE = 'root'` を置き、Router などをこのサイトと共有しない）に Router を作り、根のコンポーネントを文書に付けない div の上に `createComponent` で作ります。7 つの「今の URL」に順に移り、そのたびに自分で変更検知を回して、各 `<a>` の `href` 属性と `class`・`aria-current` を読みます。`LocationStrategy` は記録するだけの偽物で、このページの URL と履歴は変わりません。u で始まる行は、URL に合った `UserCmp`（`user/:name`）の中に置いたリンクで、`UserCmp` が表示されない URL では空です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-directives)

同じデモのファイルを Node（domino の上の JIT）で開発モードと本番の両方で走らせると、7 つの URL の `href` と active は全部同じで、違ったのは UrlTree の行の例外の数（開発モード 1 回、本番 0 回）だけでした。

## テストと直し方

### spec と it

| doc の約束 | spec（packages/router/test/ から） |
| --- | --- |
| 143〜144 行目 UrlTree と queryParams | `router_link_spec.ts` の `describe('RouterLink')`（15 行目）› 287 `can use a UrlTree as the input`・302 `cannot use a UrlTree with queryParams`（開発モードの例外の側） |
| 444〜451 行目 null で無効 | 同じファイルの 76・151 行目 `null, removes href` ほか |
| 175〜177 行目 custom element | 同じファイルの 211 行目 `describe('on a custom element anchor')` |
| 112〜113 行目 `../` | `create_url_tree.spec.ts` の `describe('relative navigation')`（467 行目）› 510 行目 `should support going to a parent (within a segment)`・525 行目 `(across segments)` ほか。`'user/:name'` のような複数セグメントの `path` の中から `../` を使う it は無い |
| 94〜97 行目 差分の例 | doc の `/user/(box//aux:team)` の例そのものの it は無い（`grep -rn "aux:team" packages/router/test` で 0 件） |
| 190〜194 行目 outlet の出力 | `directives/router_outlet.spec.ts` と integration の `activate` / `deactivate` の it（[RouterOutlet](../rdir/03-rdir-outlet.md)の「テストと直し方」） |

### 手元で走らせた結果

../angular で `pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all` は `1170 specs, 0 failures` でした（2026-11-21）。`--test_arg=--filter=` で `RouterLink` の describe に絞った件数は[第 9 回](09-rmd-tests-issues.md)の表にあります。

### 直すとしたら

- 3 節は router\_link.ts の 112〜113 行目を「`../` で始まるときは、今の Route の URL のセグメントを 1 つ戻る」のように、`createUrlTree` の doc の例と同じ数え方に変えます。spec は router\_link\_spec.ts に、`path: 'user/:name'` の中の `routerLink="../jim"` の `href` を確かめる it を足すと固まります。
- 5 節は 588 行目の下に `@deprecated Use RouterLink instead.` の印を足す形です。
- 130〜133 行目に `'replace'` と `''` を足すか、「ほかの値は `UrlCreationOptions#queryParamsHandling` を見よ」と書く（146 行目の `See` がその役をしている）。

## 聞かれそうな質問

**Q. routerLink="../jim" は、Route の木を 1 段上がりますか？**

いいえ。URL のセグメントを 1 つ戻ります。`path: 'user/:name'` の中では `/team/11/user/bob` から `/team/11/user/jim` になりました。112〜113 行目の言い方と違い、`createUrlTree` の doc の例とは合います（3 節）。

**Q. 先頭が / のリンクで、名前付きの outlet は消えますか？**

消えません。今の URL が `/user/(box//aux:team)` なら、`['/user/jim']` も `"/user/bob"` も `aux:team` を残します。94〜97 行目の「差分として扱う」のとおりです（2 節）。

**Q. UrlTree の routerLink に queryParams を付けたら、本番ではどうなりますか？**

例外は出ず、queryParams は黙って捨てられます（このページで `href` は `/user/bob`）。止まるのは開発モードの `NG04017` だけです（3 節）。

**Q. ホームのリンクに ariaCurrentWhenActive="page" を付けると？**

既定の subset ではすべての URL で active になり、常に `aria-current="page"` が付きます。`{exact: true}` を足します（6 節）。

**Q. RouterLinkWithHref は消えましたか？**

残っています。`RouterLink` と同じものの別名で、本文に「v15 から非推奨」とあるだけで `@deprecated` の印はありません（5 節）。

## 読み終えて

- RouterLink の doc の例は、`/user/(jim//aux:team)` を含めてほとんど書いてあるとおりの `href` になる。
- `../` は Route の木ではなく URL のセグメントで数える。112〜113 行目の言い方は合わない。
- UrlTree と queryParams の組み合わせを止めるのは開発モードだけ。本番では黙って捨てる。
- `RouterLinkWithHref` は `@deprecated` の印の無い別名。
- outlet の `name` の doc は main で直った。`RouterLinkActive` の `'/user'` の文はまだ。

---

← 前: [ルーターのイベントの説明文：EventType から stringifyEvent まで](06-rmd-events.md)  
次: [URL とナビゲーションの小道具の残り](08-rmd-url-rest.md) →
