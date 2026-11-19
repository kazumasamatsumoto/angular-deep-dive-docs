[目次](../README.md) › [Router の読み残し：UrlTree と RouterState の小道具・provideRouter の残り・Router クラス・読み込みとガードを行で埋める](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：Router の読み残しを固めているテスト

> packages/router/test の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、router の開いている issue のうちこのシリーズの行に当たるものの表。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rtl-tests-issues)

---

シリーズの最後に、第 1〜5 回で読んだ公開 API の小さな関数（ParamMap と木、ActivatedRoute の継承、`withX`、Router の公開メソッドと `Navigation`、読み込み・再利用・関数ガード）の約束が、どの spec のどの describe で固められているかを地図にし、手元で走らせた数を並べます。そのあと、このシリーズの行に当たる area: router の issue と PR を、本文を読んで今のコードのどこに当たるかで表にし、origin/main の続きをまとめます。

読む対象は `packages/router/test/` の spec です（../angular、8576f161ae4）。`BUILD.bazel` は `glob(["**/*.ts"])` の `test_lib` を、Node の `:test`（`zoneless_jasmine_test`）と web の `:test_web`（`zoneless_web_test_suite`）の両方で走らせます。走らせ方の細かいところは[前のシリーズの最終回](../rdir/06-rdir-tests-issues.md)と[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. UrlTree・UrlSegment・ParamMap](01-rtl-url-tree.md)
2. [2. ActivatedRoute の Observable と継承](02-rtl-router-state.md)
3. [3. provideRouter と RouterModule の残り](03-rtl-provide-router.md)
4. [4. Router クラスと Navigation の型](04-rtl-router-class.md)
5. [5. 読み込み・事前読み込み・再利用・関数ガード](05-rtl-load-guard.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

パスは `packages/router/test/` から、括弧の数は describe の行、ほかの数は it の行です。「it」は行の頭が `it(` の数、「走らせた数」は 2 節の絞り込みで jasmine が数えた数です。`integration/` の spec は `integration.spec.ts` の `for (const browserAPI of ['navigation', 'history'])` の中で 2 回登録されるので、走らせた数が it の倍になります。

| ファイル | describe と主な it（行） | it | 絞り込み | 走らせた数 | 章 |
| --- | --- | --- | --- | --- | --- |
| `shared.spec.ts` | ParamsMap（11）› 12 has・19 keys・24 単一の値・30 複数の値・36 無いと null・41 無いと \[\]・46 Object.create(null) でも get が投げない | 7 | `^ParamsMap ` | 7 | [第 1 回](01-rtl-url-tree.md) |
| `utils/tree.spec.ts` | tree（11）› 12 root・17 / 23 parent・31 children・37 firstChild・43 siblings・51 pathFromRoot | 7 | `^tree ` | 7 | [第 1 回](01-rtl-url-tree.md) |
| `url_tree.spec.ts` | UrlTree（19）› DefaultUrlSerializer（22）・containsTree（73）› exact = true（74）・isActive（156）› 157・176・exact = false（188）・ignored query params（274）・fragment（282）・matrix params（296） | 55 | `^UrlTree ` | 55 | [第 1 回](01-rtl-url-tree.md)・[第 4 回](04-rtl-router-class.md) |
| `url_serializer.spec.ts` | url serializer（19）› encoding/decoding（246）・special character encoding/decoding（327）・multiple leading slashes（431）・error handling（450） | 52 | `^url serializer ` | 52 | [第 1 回](01-rtl-url-tree.md) |
| `router_state.spec.ts` | RouterState & Snapshot（23）› RouterStateSnapshot（24）› 40〜60・RouterState（68）› 84〜104・equalParamsAndUrlSegments（112）・advanceActivatedRoute（209）› 238・ActivatedRoute（253）› 254 title | 18 | `^RouterState & Snapshot ` | 18 | [第 2 回](02-rtl-router-state.md) |
| `bootstrap.spec.ts` | bootstrap（40）› 106〜342 initialNavigation の 3 通り・381 disabled・418 ルートでない部品の bootstrap・441 壊したあとの bootstrap・471 / 552（!isNode の中）・586 | 13 | `^bootstrap ` | 11（!isNode の 2 本は web だけ） | [第 3 回](03-rtl-provide-router.md) |
| `integration/navigation_errors.spec.ts` | 89 DI を使う error handler・118 forRoot で redirect・158 redirect・196 handler の中のエラー・430 commands の null / undefined | 14 | `error handler\|NavigationErrorHandler` | 9 | [第 3 回](03-rtl-provide-router.md)・[第 4 回](04-rtl-router-class.md) |
| `directives/router_outlet.spec.ts` | component input binding（201）› 12 本（withComponentInputBinding） | 22 | `^component input binding ` | 12 | [第 3 回](03-rtl-provide-router.md) |
| `router_scroller.spec.ts` | RouterScroller（33）› scroll to top（56）・stored position（80）・anchor scrolling（108）・SSR hydration（158）・extending（231）・NavigationBehaviorOptions（284） | 13 | `^RouterScroller ` | 13 | [第 3 回](03-rtl-provide-router.md) |
| `router.spec.ts` | Router（29）› resetConfig（30）› 37・resetRootComponentType（71）› 78・setUpLocationChangeListener（88）› 93・parseUrl（111）› 116・PreActivation（135） | 21 | `^Router (resetConfig\|resetRootComponentType\|setUpLocationChangeListener\|parseUrl) ` | 4（^Router 全体は 49） | [第 4 回](04-rtl-router-class.md) |
| `integration/integration.spec.ts ほか` | integration.spec.ts 766 currentNavigation・790 LastSuccessfulNavigation／router\_events.spec.ts 107・128 dispose のあと |   | `should set LastSuccessfulNavigation\|…／should stop emitting events after the router is destroyed\|…` | 4 ／ 4（2 本 × navigation / history） | [第 4 回](04-rtl-router-class.md) |
| `router_preloader.spec.ts` | RouterPreloader（47）› should properly handle（55）› 68・configurations with canLoad guard（76）› 101・112・should preload loadComponent configs（716）› 731〜875 | 22 | `^RouterPreloader ` | 22 | [第 5 回](05-rtl-load-guard.md) |
| `route_injector_cleanup.spec.ts` | Route Injector Destruction（26）› 147・164・194・210・230 保存した子と親・256・278 親を壊すと子も・307 destroyDetachedRouteHandle・333・376 遅延の注入器 | 10 | `Route Injector Destruction` | 10 | [第 5 回](05-rtl-load-guard.md) |
| `standalone.spec.ts` | standalone in Router API（27）› loadChildren =&gt; routes（28）・route providers（71）・loadComponent（308）・default export unwrapping（394）› 395・414・injection context（434） | 17 | `^standalone in Router API ` | 17 | [第 5 回](05-rtl-load-guard.md) |
| `（なし）` | mapToCanMatch・mapToCanActivate・mapToCanActivateChild・mapToCanDeactivate・mapToResolve、withDebugTracing、withHashLocation、Router.isActive |   | `mapTo` | 0 | [第 5 回](05-rtl-load-guard.md)・[第 3 回](03-rtl-provide-router.md)・[第 4 回](04-rtl-router-class.md) |

第 1・2 回の部品（`ParamMap`・`Tree`・`UrlTree`・`RouterState`）は、それぞれ 1 つの spec のファイルにまとまっていて、名前の頭で絞れます。第 3〜5 回の部品は、Router を組み立てて動かす integration の spec に散らばっています。`withDebugTracing`・`withHashLocation`・`mapTo*`・`Router.isActive` は、`grep -rn` で packages/router/test に 1 件も出ません。

## 2. 走らせ方と結果

📄 `走らせたコマンドと結果（2026-11-20、8576f161ae4 の作業木）`

```
$ git -C ~/angular-research/angular-fix worktree add <作業木> 8576f161ae4
$ cd <作業木> && pnpm install --frozen-lockfile --offline
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all
1170 specs, 0 failures
$ pnpm bazel test //packages/router/test:test_web --nocache_test_results --test_output=all
Chromium: 1/1 test files | 1180 passed, 0 failed
Firefox: 1/1 test files | 1178 passed, 0 failed
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=^ParamsMap "      # ほかも同じ形。--filter は正規表現
```

| --test\_arg=--filter= | 結果 |
| --- | --- |
| `^ParamsMap ` | Ran 7 of 1170 specs、0 failures |
| `^tree ` | Ran 7 of 1170 specs、0 failures |
| `^UrlTree ` | Ran 55 of 1170 specs、0 failures |
| `^url serializer ` | Ran 52 of 1170 specs、0 failures |
| `^RouterState & Snapshot ` | Ran 18 of 1170 specs、0 failures |
| `^bootstrap ` | Ran 11 of 1170 specs、0 failures |
| `error handler\|NavigationErrorHandler` | Ran 9 of 1170 specs、0 failures |
| `^component input binding ` | Ran 12 of 1170 specs、0 failures |
| `^RouterScroller ` | Ran 13 of 1170 specs、0 failures |
| `^Router ` | Ran 49 of 1170 specs、0 failures |
| `^Router (resetConfig\|resetRootComponentType\|setUpLocationChangeListener\|parseUrl) ` | Ran 4 of 1170 specs、0 failures |
| `should set LastSuccessfulNavigation\|should properly set currentNavigation when cancelling` | Ran 4 of 1170 specs、0 failures |
| `should stop emitting events after the router is destroyed\|should resolve navigation promise with false after the router is destroyed` | Ran 4 of 1170 specs、0 failures |
| `should throw an error when one of the commands is null` | Ran 2 of 1170 specs、0 failures |
| `^RouterPreloader ` | Ran 22 of 1170 specs、0 failures |
| `Route Injector Destruction` | Ran 10 of 1170 specs、0 failures |
| `Custom Route Reuse Strategy` | Ran 20 of 1170 specs、0 failures |
| `^standalone in Router API ` | Ran 17 of 1170 specs、0 failures |
| `default export unwrapping` | Ran 2 of 1170 specs、0 failures |
| `^router_devtools ` | Ran 6 of 1170 specs、0 failures |
| `mapTo` | Ran 0 of 1170 specs |
| `^view transitions ` | Ran 1 of 1170 specs（Node では it が 1 本だけの isNode の枝） |

../angular そのものは読むだけにして、`angular-fix` から 8576f161ae4 の作業木を作って走らせました。数は前のシリーズと同じで、Node の `:test` は 1170 本、web は Chromium が 1180 本、Firefox が 1178 本です。差は `if (!isNode)` の中の it（bootstrap.spec.ts L470の 2 本など）です。`--filter` は jasmine の正規表現で、describe と it の名前をつないだ全体に当てます。`^bootstrap ` は 13 本の it のうち 11 本、`^view transitions ` は Node では `isNode` の枝の空の it 1 本だけになります。`mapTo` の 0 本は、名前に `mapTo` を含む describe も it も無いからです。

## 3. 各章の約束を固める spec を 1 つずつ

### 第 1 回と第 4 回：isActive 関数は lastSuccessfulNavigation を読む

📄 `angular/packages/router/test/url_tree.spec.ts` L156–186 （▶ の行: 158–161, 173, 179, 184）

```ts
156 │     describe('isActive', () => {
157 │       it('should allow partial match options and use subset match options as default', () => {
158 ▶         const router = {
159 ▶           parseUrl: (url: string) => serializer.parse(url),
160 ▶           lastSuccessfulNavigation: () => ({finalUrl: serializer.parse('/one/two?a=1&b=2')}),
161 ▶         } as unknown as Router;
162 │ 
163 │         const t2 = serializer.parse('/one/two?a=1');
164 │ 
165 │         // With partial options: paths: 'exact'.
166 │         // derived options should be:
167 │         // paths: 'exact'
168 │         // queryParams: 'subset' (default)
169 │         // matrixParams: 'ignored' (default)
170 │         // fragment: 'ignored' (default)
171 │ 
172 │         // This should return true because paths match exactly, and queryParams is subset (t2 is subset of t1)
173 ▶         expect(isActive(t2, router, {paths: 'exact'})()).toBe(true);
174 │       });
175 │ 
176 │       it('should use subset match options as base for other properties', () => {
177 │         const router = {
178 │           parseUrl: (url: string) => serializer.parse(url),
179 ▶           lastSuccessfulNavigation: () => ({finalUrl: serializer.parse('/one/two#frag')}),
180 │         } as unknown as Router;
181 │         const t2 = serializer.parse('/one/two#diff');
182 │ 
183 │         // fragment is ignored by default in subsetMatchOptions
184 ▶         expect(isActive(t2, router, {paths: 'exact'})()).toBe(true);
185 │       });
186 │     });
```

158〜161 行目の Router は本物ではなく、`parseUrl` と `lastSuccessfulNavigation` の 2 つだけを持つオブジェクトです。`isActive` 関数（url\_tree.ts L127）が `router.lastSuccessfulNavigation()?.finalUrl` を読むので、160 行目は「呼べば `{finalUrl}` を返す関数」を置いています。[第 4 回](04-rtl-router-class.md)の 3 節の signal を、関数として呼ぶ形だけに頼っていることが分かります。173 行目は `{paths: 'exact'}` だけを渡し、`queryParams` が subset で比べられること、184 行目は `fragment` が既定で無視されることを確かめます。`Router.isActive` のオブジェクト版（第 4 回の 6 節）も同じ `subsetMatchOptions` の上に重ねますが、そちらを呼ぶ spec はありません。

### 第 2 回：RouterState の root・parent・firstChild・children

📄 `angular/packages/router/test/router_state.spec.ts` L68–103 （▶ の行: 79, 81, 85, 90–91, 96, 101）

```ts
 68 │   describe('RouterState', () => {
 69 │     let state: RouterState;
 70 │     let a: ActivatedRoute;
 71 │     let b: ActivatedRoute;
 72 │     let c: ActivatedRoute;
 73 │ 
 74 │     beforeEach(() => {
 75 │       a = createActivatedRoute('a');
 76 │       b = createActivatedRoute('b');
 77 │       c = createActivatedRoute('c');
 78 │ 
 79 ▶       const root = new TreeNode(a, [new TreeNode(b, []), new TreeNode(c, [])]);
 80 │ 
 81 ▶       state = new (RouterState as any)(root, null);
 82 │     });
 83 │ 
 84 │     it('should return first child', () => {
 85 ▶       expect(state.root.firstChild).toBe(b);
 86 │     });
 87 │ 
 88 │     it('should return children', () => {
 89 │       const cc = state.root.children;
 90 ▶       expect(cc[0]).toBe(b);
 91 ▶       expect(cc[1]).toBe(c);
 92 │     });
 93 │ 
 94 │     it('should return root', () => {
 95 │       const b = state.root.firstChild!;
 96 ▶       expect(b.root).toBe(state.root);
 97 │     });
 98 │ 
 99 │     it('should return parent', () => {
100 │       const b = state.root.firstChild!;
101 ▶       expect(b.parent).toBe(state.root);
102 │     });
103 │ 
```

79 行目で `a` を根、`b` と `c` を子にした `TreeNode` の木を作り、81 行目で `RouterState` を `as any` で直接 new します（コンストラクタは公開されていない）。85 行目の `firstChild`、90〜91 行目の `children`、96 行目の `root`、101 行目の `parent` は、どれも `ActivatedRoute` が自分の木（`_routerState`）に聞く getter です（[第 2 回](02-rtl-router-state.md)）。ナビゲーションを 1 度も走らせずに確かめられるので、Router の spec の中でいちばん軽い部類です。

### 第 3 回：ルートでない部品を bootstrap しても、Router は初期化し直さない

📄 `angular/packages/router/test/bootstrap.spec.ts` L418–439 （▶ の行: 420, 422, 432, 435, 437）

```ts
418 │   it('should not init router navigation listeners if a non root component is bootstrapped', async () => {
419 │     @NgModule({
420 ▶       imports: [BrowserModule, RouterModule.forRoot([])],
421 │       declarations: [SecondRootCmp, RootCmp],
422 ▶       bootstrap: [RootCmp],
423 │       providers: testProviders,
424 │       schemas: [CUSTOM_ELEMENTS_SCHEMA],
425 │     })
426 │     class TestModule {}
427 │ 
428 │     await platformBrowser([])
429 │       .bootstrapModule(TestModule)
430 │       .then((res) => {
431 │         const router = res.injector.get(Router);
432 ▶         spyOn(router as any, 'resetRootComponentType').and.callThrough();
433 │ 
434 │         const appRef: ApplicationRef = res.injector.get(ApplicationRef);
435 ▶         appRef.bootstrap(SecondRootCmp);
436 │ 
437 ▶         expect((router as any).resetRootComponentType).not.toHaveBeenCalled();
438 │       });
439 │   });
```

420 行目は `RouterModule.forRoot([])`、422 行目でルートの部品は `RootCmp` です。435 行目で 2 つ目の部品を `appRef.bootstrap` しても、437 行目で `resetRootComponentType` が呼ばれないことを確かめます。守っているのは `getBootstrapListener` の先頭の `bootstrappedComponentRef !== ref.components[0]` で返す行（provide\_router.ts L279、[第 3 回](03-rtl-provide-router.md)）です。[第 5 回](05-rtl-load-guard.md)の DEMO が `appRef.bootstrap` で事前読み込みを始められるのも、同じリスナーが `setUpPreloading` を呼ぶからです。

### 第 4 回：dispose のあとは events が流れない

📄 `angular/packages/router/test/integration/router_events.spec.ts` L107–126 （▶ の行: 113, 117, 120–121, 124）

```ts
107 │     it('should stop emitting events after the router is destroyed', async () => {
108 │       const router: Router = TestBed.inject(Router);
109 │       const fixture = await createRoot(router, RootCmp);
110 │       router.resetConfig([{path: 'user/:name', component: UserCmp}]);
111 │ 
112 │       let events = 0;
113 ▶       const subscription = router.events.subscribe(() => events++);
114 │ 
115 │       router.navigateByUrl('/user/frodo');
116 │       await advance(fixture);
117 ▶       expect(events).toBeGreaterThan(0);
118 │ 
119 │       const previousCount = events;
120 ▶       router.dispose();
121 ▶       router.navigateByUrl('/user/bilbo');
122 │       await advance(fixture);
123 │ 
124 ▶       expect(events).toBe(previousCount);
125 │       subscription.unsubscribe();
126 │     });
```

113 行目で `dispose` の**前に**購読し、120 行目の `dispose` のあと 121 行目で移動しても、124 行目で数が増えないことを確かめます。`_events.unsubscribe()`（router.ts 416 行目）が購読者の配列を捨てるからです。`dispose` の**あとに**`subscribe()` すると `ObjectUnsubscribedError` になることは、この it も同じ describe の L128の it も見ていません（[第 4 回](04-rtl-router-class.md)の「テストと直し方」）。

### 第 5 回：default export の routes を読む

📄 `angular/packages/router/test/standalone.spec.ts` L414–431 （▶ の行: 420, 427, 430）

```ts
414 │     it('should work for loadChildren', async () => {
415 │       TestBed.configureTestingModule({
416 │         imports: [
417 │           RouterModule.forRoot([
418 │             {
419 │               path: 'home',
420 ▶               loadChildren: () => import('./default_export_routes'),
421 │             },
422 │           ]),
423 │         ],
424 │       });
425 │ 
426 │       const root = TestBed.createComponent(RootCmp);
427 ▶       await TestBed.inject(Router).navigateByUrl('/home');
428 │       root.detectChanges();
429 │ 
430 ▶       expect(root.nativeElement.innerHTML).toContain('default exported');
431 │     });
```

420 行目の `import('./default_export_routes')` は、`export default [{path: '', pathMatch: 'full', component: TestRoute}] as Routes` のモジュールを返します。`RouterConfigLoader` がこの値を `maybeUnwrapDefaultExport` に通して配列を取り出すので（[第 5 回](05-rtl-load-guard.md)の 1 節）、427 行目の移動のあと 430 行目で部品の文字が出ます。同じ describe の L395の it が `loadComponent` の側です。第 5 回の DEMO 1 は、同じ形を `Promise.resolve({default: routes})` で作りました。

## 4. issue と PR の表

2026-11-20 に gh で読んだ（読むだけ）、このシリーズの行に当たる area: router の issue と PR です。開いているもの 23 件と、本文から辿った閉じたもの 5 件。「今のコード」は、本文を読んで 8576f161ae4 のどの行に当たるかです。Node で確かめたものは、サイトの依存の @angular/router 22.2.6 の `DefaultUrlSerializer` を直接呼んでいます。

| # |   | 状態 | 開いた日 | 閉じた日 | 反応 | コメント | 内容 | 今のコード | 章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 72080 | issue | 開いている | 2026-11-18 |   | 6 | 4 | Support pre-loading on hover（リンクに乗ったときに事前読み込み） | PreloadingStrategy.preload は Route と fn だけを受け（router\_preloader.ts L33）、RouterPreloader は NavigationEnd ごとに config 全体を回す（L109〜120）。リンクの hover を知る口は無い | [第 5 回](05-rtl-load-guard.md) |
| 71007 | issue | 開いている | 2026-09-28 |   | 0 | 5 | RouteReuseStrategy: reattached child keeps providers from a destroyed parent injector | 部品の providers（要素の注入器）の話。付け直しは保存した hostView を差し込むだけで、作ったときの親の注入器のまま。第 5 回の Route の \_injector の後片付けとは別の道 | [第 5 回](05-rtl-load-guard.md) |
| 70906 | issue | 開いている | 2026-09-24 |   | 0 | 0 | routed component に afterAttach / afterDetach / beforeDetach のフックがほしい | RouteReuseStrategy にも BaseRouteReuseStrategy にも部品へ知らせる口は無く（route\_reuse\_strategy.ts L126〜148）、知れるのは outlet の attach / detach の出力だけ | [第 5 回](05-rtl-load-guard.md) |
| 70784 | issue | 開いている | 2026-09-17 |   | 0 | 1 | canceledNavigationResolution=computed の戻しの移動かどうかを知りたい | Navigation の公開の項目（navigation\_transition.ts L251〜309）に、Router が履歴を戻すための移動を示すものは無い。trigger は popstate になる | [第 4 回](04-rtl-router-class.md) |
| 70103 | issue | 開いている | 2026-08-06 |   | 0 | 1 | First-class version skew recovery for lazy-loaded chunks | import() の失敗は loadChildren / loadComponent の reject になり、finally で loader の Map から消えるので次の移動でもう一度呼ばれる（router\_config\_loader.ts L74〜76・L104〜106）。PreloadAllModules は catchError で null（L64） | [第 5 回](05-rtl-load-guard.md) |
| 65824 | issue | 開いている | 2025-12-03 |   | 3 | 1 | Router の内部の等しさの比べ方の深さを設定したい | Observable 側の比較（utils/collection.ts の shallowEqual → equalArraysOrString）は文字列の配列を並べ替えて要素で比べる。=== で比べるのは router\_state.ts L184〜190 のコメントの signal 側 | [第 2 回](02-rtl-router-state.md) |
| 65141 | issue | 開いている | 2025-11-13 |   | 8 | 5 | router.url signal | url は getter（router.ts L360〜362）で signal ではない。signal で読めるのは currentNavigation と lastSuccessfulNavigation（L177・L378）で、成功した URL は lastSuccessfulNavigation()?.finalUrl（url\_tree.ts L127 の isActive 関数も読む） | [第 4 回](04-rtl-router-class.md) |
| 59782 | issue | 開いている | 2025-01-29 |   | 1 | 0 | \[Router\]: Include call stack while in debug mode | Navigation.trigger は 3 つの文字列だけ（navigation\_transition.ts L286）で、呼んだ場所は持たない。任意の値を運べるのは extras.info（リダイレクトでも router.ts L222 で引き継ぐ） | [第 4 回](04-rtl-router-class.md)・[第 3 回](03-rtl-provide-router.md) |
| 48673 | issue | 開いている | 2023-01-09 |   | 12 | 2 | ナビゲーションでどの Route が外れるかを知りやすくしたい | Navigation に移動先の木 targetRouterState はあるが @internal（navigation\_transition.ts L278〜282）。公開の型からは見えない | [第 4 回](04-rtl-router-class.md) |
| 46218 | issue | 開いている | 2022-06-02 |   | 0 | 5 | navigate(\['/test?param1=value1'\], {queryParams}) で ? が 2 つになる | ? を含む文字列は commands の segment の path になる。22.2.6 の DefaultUrlSerializer を Node で serialize すると '/test%3Fparam1%3Dvalue1?param2=value2'（? は %3F に encode され、クエリにはならない） | [第 1 回](01-rtl-url-tree.md)・[第 4 回](04-rtl-router-class.md) |
| 46186 | issue | 開いている | 2022-05-30 |   | 0 | 3 | URL の途中の // で後ろの segment が消える | DefaultUrlSerializer.parse。22.2.6 を Node で parse すると '/first//third' は '/first' になる（今も同じ） | [第 1 回](01-rtl-url-tree.md) |
| 45815 | issue | 開いている | 2022-04-29 |   | 0 | 1 | queryParams に空の配列を渡すと、ActivatedRoute と URL が食い違う | serialize は空の配列のキーを書かない。22.2.6 を Node で {x: \[\]} の UrlTree を serialize すると '/a' | [第 1 回](01-rtl-url-tree.md) |
| 40869 | issue | 開いている | 2021-02-16 |   | 0 | 7 | Disable router location subscription | dispose（router.ts L410〜422）は popstate の購読を外し、以後の移動を false にする。setUpLocationChangeListener を呼び直すと新しく購読する（router.spec.ts の L93の it） | [第 4 回](04-rtl-router-class.md) |
| 40010 | issue | 開いている | 2020-12-07 |   | 23 | 5 | 遅延の子も router.config の children に入れてほしい | 読み込んだ子は route.\_loadedRoutes に入り、children には入らない（router\_config\_loader.ts L100、preloader の L183） | [第 5 回](05-rtl-load-guard.md) |
| 31800 | issue | 開いている | 2019-07-23 |   | 13 | 6 | Hook into router config loading | 読んだ Route は export された loadChildren 関数（router\_config\_loader.ts L121）の standardizeConfig と、開発モードの validateConfig だけを通る。RouteConfigLoadEnd は Route しか持たず、子の配列に手を入れる口は無い | [第 5 回](05-rtl-load-guard.md) |
| 28917 | issue | 開いている | 2019-02-22 |   | 68 | 16 | URI の encode を止める option、または UrlSerializer を丸ごと書かずに serialize を変えたい | encode は DefaultUrlSerializer の中にあり、Router は UrlSerializer を 1 つ注入して使う（router.ts L104、serializeUrl は L597〜599）。部分だけ替える口は無い | [第 1 回](01-rtl-url-tree.md)・[第 4 回](04-rtl-router-class.md) |
| 24069 | issue | 開いている | 2018-05-23 |   | 2 | 25 | Expose '\_loadedConfig' in a public way | 今は \_loadedRoutes / \_loadedInjector / \_loadedNgModuleFactory（内部の項目、router\_config\_loader.ts L100〜102）。公開の読み口は devtools 向けの getLoadedRoutes（router\_devtools.spec.ts の L24の describe） | [第 5 回](05-rtl-load-guard.md) |
| 22799 | issue | 開いている | 2018-03-15 |   | 30 | 4 | Add ability to provide reason to navigation cancellation | ガードの false の NavigationCancel の reason は開発モードの文で、本番は空（rdir-events の 5 節）。ガードから理由を渡す型は無く、RedirectCommand で別の URL へ送ることだけできる | [第 4 回](04-rtl-router-class.md) |
| 20912 | issue | 開いている | 2017-12-09 |   | 20 | 10 | Router • Allow to have a PreloadingStrategy in lazy loaded modules | PreloadingStrategy は withPreloading が root に 1 つ provide し（provide\_router.ts L586）、RouterPreloader はコンストラクタで 1 つ受ける（router\_preloader.ts L105）。processRoutes は遅延の注入器を子に渡すが、戦略は引き直さない | [第 5 回](05-rtl-load-guard.md)・[第 3 回](03-rtl-provide-router.md) |
| 12627 | issue | 開いている | 2016-10-31 |   | 29 | 28 | Allow CanActivate\[Child\] Guards to be "blocking" | Route の段の間はすでに順番（check\_guards.ts L93〜111 の concatMap）。同じ配列の中のガードは runCanActivate が全部すぐ呼ぶ（第 5 回の DEMO 2） | [第 5 回](05-rtl-load-guard.md) |
| 12289 | issue | 開いている | 2016-10-14 |   | 67 | 29 | Feature: more robust module loader for router | 失敗した読み込みは finally で childrenLoaders から消え（router\_config\_loader.ts L104〜106）、次の移動でもう一度 loadChildren が呼ばれる。自動の再試行は無い（router\_preloader.spec.ts の L385・L420の it が「失敗のあとの再試行」を固める） | [第 5 回](05-rtl-load-guard.md) |
| 11836 | issue | 開いている | 2016-09-22 |   | 99 | 27 | Add canDeactivateChild guard | Route の項目にも mapTo\* にも canDeactivate しかない（functional\_guards.ts L84〜92）。canActivateChild の逆は無い | [第 5 回](05-rtl-load-guard.md) |
| 6634 | issue | 開いている | 2016-01-22 |   | 35 | 36 | persisting route tabs and child routes（タブの部品を壊さずに残したい） | 既定の BaseRouteReuseStrategy は何も保存しない（route\_reuse\_strategy.ts L131〜148）。残すには自作の戦略の shouldDetach / store、捨てるときは 22.2 の destroyDetachedRouteHandle | [第 5 回](05-rtl-load-guard.md) |
| 37095 | issue | 完了 | 2020-05-13 | 2026-01-05 | 113 | 60 | Angular Module instance never get destroyed | 5edceffd043（#65991、withAutoCleanupInjectors）で閉じた。NavigationEnd ごとに使っていない Route の \_injector / \_loadedInjector を壊す（route\_injector\_cleanup.ts） | [第 5 回](05-rtl-load-guard.md) |
| 27290 | issue | 完了 | 2018-11-27 | 2026-01-05 | 122 | 22 | Refine RouteReuseStrategy | 同じ 5edceffd043 で destroyDetachedRouteHandle と、RouteReuseStrategy の retrieveStoredRouteHandles / shouldDestroyInjector が入った | [第 5 回](05-rtl-load-guard.md) |
| 65991 | PR | 入った | 2025-12-10 | 2026-01-05 | 36 | 3 | feat(router): add controls for route cleanup | route\_injector\_cleanup.ts を足した PR。保存した handle は pathFromRoot だけを集める（L36〜45）。第 5 回の 3 節 | [第 5 回](05-rtl-load-guard.md) |
| 63057 | PR | 入った | 2025-08-07 | 2025-08-08 | 9 | 6 | feat(router): convert \`lastSuccessfulNavigation\` to signal | 4e0fc81491b。router.ts L378の戻り値の型だけを変え、asReadonly は付けていない（第 4 回の 3 節） | [第 4 回](04-rtl-router-class.md) |
| 59327 | PR | 入った | 2024-12-28 | 2024-12-28 | 0 | 11 | fix(router): complete router \`events\` on dispose | 52a6710f54b。題は complete だが、入った行は \_events.unsubscribe()（router.ts L416） | [第 4 回](04-rtl-router-class.md) |

反応が多いのは、`canDeactivateChild`（#11836、99）・遅延のモジュールの読み込みの再試行（#12289、67）・URL の encode（#28917、68）で、どれも「その口が無い」形の要望です。閉じたものでは、モジュールの注入器が壊されない（#37095、113）と RouteReuseStrategy の作り直し（#27290、122）が、同じ 5edceffd043（2026-01-05）で閉じました。このコミットの `route_injector_cleanup.ts` は、保存した handle の祖先だけを守ります。親を保存すると子の部品は detach のときに壊されているので、子の注入器も壊され、戻ると両方作り直されます（[第 5 回](05-rtl-load-guard.md)の 3 節）。この「親を保存したときの子」を固める spec はありません。#71007 は名前が似ていますが、子を保存して親が作り直されたときの、部品の `providers`（要素の注入器）の話で、別の道です。

## 5. origin/main の続き

`git -C ~/angular-research/angular log 8576f161ae4..origin/main` を、このシリーズの src（url\_tree.ts・shared.ts・utils/tree.ts・router\_state.ts・provide\_router.ts・router\_module.ts・router.ts・navigation\_transition.ts・router\_config\_loader.ts・router\_preloader.ts・route\_reuse\_strategy.ts・route\_injector\_cleanup.ts・utils/functional\_guards.ts・operators/check\_guards.ts・utils/config\_matching.ts）に絞ったものです（origin/main は 943ec3bd8d6）。「22.2.6」は、サイトの依存に同じ変更が入っているか（`node_modules/@angular/router` の fesm2022 と types で確かめた）です。docs だけのコミットと、取り消された 41d6a8bb843 / 0ebea404382 の組（同じ内容が a1bffc29dda で入り直した）は、行を分けずに入った方だけを書きました。

| コミット | 日付 | 変えたもの | 22.2.6 | 章 |
| --- | --- | --- | --- | --- |
| `8260542ce03` | 2026-10-24 | NavigationBehaviorOptions に focusReset。router.ts のリダイレクトの extras（L219〜234）にも運ぶ行を足す | 一部（state manager の行はある。router.ts の行は無い） | [第 4 回](04-rtl-router-class.md) |
| `2dd93cd949b` | 2026-10-22 | null / undefined の query params を落とす処理を、Router の removeEmptyProps（router.ts L656〜663、消える）から create\_url\_tree.ts の tree() に移し、createUrlTreeFromSnapshot でも落とす | あり（removeEmptyProps が無い） | [第 4 回](04-rtl-router-class.md) |
| `81389f21b9d` | 2026-09-18 | Navigation の説明の UrlSerializer.extract() を UrlHandlingStrategy.extract() に | あり（d.ts の説明） | [第 4 回](04-rtl-router-class.md) |
| `f825c9bc7cc` | 2026-09-16 | NavigationExtras の @see の Router#createurltree を Router#createUrlTree に | あり（d.ts の説明） | [第 4 回](04-rtl-router-class.md) |
| `e8b1afd07fe` | 2026-11-02 | loadComponent をルートの resources と並べて走らせる（navigation\_transition.ts と operators/load\_components.ts） | あり | [第 5 回](05-rtl-load-guard.md) |
| `cfad3f58543` | 2026-09-22 | google3 だけ、loadComponent / loadChildren を root の環境の注入器で走らせる（g3-only の印） | 3p は変わらない | [第 5 回](05-rtl-load-guard.md) |
| `ef4f80ad4f6` | 2026-11-05 | PreloadAllModules の例の ROUTES を routes に | あり（d.ts の説明） | [第 5 回](05-rtl-load-guard.md) |
| `574e5d76ea6` | 2026-09-11 | google3 の中で canLoad を使わせない（check\_guards と preloader の canLoad を any 経由に） | — | [第 5 回](05-rtl-load-guard.md) |
| `95383cdf28b` | 2026-09-26 | shouldReuseRoute が false でもガードと resolver は自動で走り直さない、という注 | あり（d.ts の説明） | [第 5 回](05-rtl-load-guard.md) |
| `21dd0171b39` | 2026-10-21 | ガードが RedirectCommand を投げたときも配列の順の優先度を守る（check\_guards の callGuard） | あり | [第 5 回](05-rtl-load-guard.md) |
| `5048f502683` | 2026-09-29 | 空のパスの outlet を通り抜けるときは split しない（config\_matching の containsEmptyPathMatchesWithNamedOutlets の呼び方） | あり | [第 5 回](05-rtl-load-guard.md) |
| `b6bf6504ada` | 2026-09-29 | outlet が Route に一致してから子の segment を処理する | あり | [第 5 回](05-rtl-load-guard.md) |
| `74e7cc94b7a` | 2026-11-04 | google3 だけ、canMatch を root の環境の注入器で走らせる | 3p は変わらない | [第 5 回](05-rtl-load-guard.md) |
| `011675e417d` | 2026-10-20 | 括弧の中の primary の子の segment の : を escape する（url\_tree.ts） | あり | [第 1 回](01-rtl-url-tree.md) |
| `a1bffc29dda` | 2026-09-30 | protocol-relative（// で始まる）URL になる serialize は NG04019 を警告して / にする | あり | [第 1 回](01-rtl-url-tree.md) |
| `37196053d5e` | 2026-09-13 | 数字のキーの query params で、密な配列の領域を確保しない | あり | [第 1 回](01-rtl-url-tree.md) |
| `fac2f234d79` | 2026-09-25 | query params と継承した params を、各 snapshot にコピーせず凍結したものを共有する | あり | [第 2 回](02-rtl-router-state.md) |
| `e2b9a32ba61` | 2026-11-13 | setRouterState を RouterState のコンストラクタから外し、createEmptyState と ActivateRoutes.activate の頭で呼ぶ（取り消されうる段では参照を張らない） | あり | [第 2 回](02-rtl-router-state.md) |
| `262417f1555` | 2026-11-10 | withErrorBoundaries（Route の errorComponent とリダイレクトの扱い） | 無い | [第 3 回](03-rtl-provide-router.md) |
| `64502f9ae23` | 2026-10-20 | withViewTransitions を @publicApi 22.3 に（developerPreview を外す） | 無い（developerPreview 19.0 のまま） | [第 3 回](03-rtl-provide-router.md) |

route\_injector\_cleanup.ts と utils/functional\_guards.ts は 8576f161ae4 と origin/main で同じです（`git log 8576f161ae4..origin/main` に出ない）。第 5 回の後片付けの振る舞いも、`mapTo*` の使い方の例の `region='CanActivate'` も、origin/main でそのままです。第 4 回の `lastSuccessfulNavigation` の getter（router.ts L378〜380）も origin/main で変わっていません。

## 6. spec が無い約束

| 何を | どこで | 確かめ方 |
| --- | --- | --- |
| `Router.isActive` の 3 通り（`true` / `false` / オブジェクト） | [第 4 回](04-rtl-router-class.md)の 6 節 | ページの DEMO の「isActive」 |
| `dispose()` のあとの `events.subscribe()` が `ObjectUnsubscribedError` | 第 4 回の 4 節 | 作業木で足した it、ページの DEMO の「dispose」 |
| `lastSuccessfulNavigation` が書ける signal（`set` がある） | 第 4 回の 3 節 | 作業木で足した it、ページの DEMO の「2 つの signal」 |
| `resetConfig` が `navigated` を `false` に戻し、次の同じ URL を飛ばさない | 第 4 回の 2 節 | ページの DEMO の「resetConfig と同じ URL」 |
| `mapToCanMatch`・`mapToCanActivate`・`mapToCanActivateChild`・`mapToCanDeactivate`・`mapToResolve` | [第 5 回](05-rtl-load-guard.md)の 4 節 | 作業木で足した it（`['G1', 'G2']` の順）、ページの DEMO 2 |
| 子を持つ親を保存したときの、子の部品と子の Route の注入器（detach で子を壊し、後片付けで注入器を壊し、戻ると両方作り直す） | 第 5 回の 3 節 | 作業木の `rtl_b_probe.spec.ts`（今のソースで通る） |
| `withDebugTracing`・`withHashLocation` | [第 3 回](03-rtl-provide-router.md) | `grep -rn` で 0 件 |

本文に書いたのは、読んだ行と走らせた結果だけです。各章の「テストと直し方」に、足すならどのファイルのどの describe の隣か、を書いています。

## 7. このシリーズで見つけたもの

どれも 8576f161ae4 の行を読み、本物の @angular/router 22.2.6（ページのデモ・Node）か作業木の spec で確かめたものです。gh で同じ話の issue を探し、見つからなかったものには「既存なし」と書いています。

|   | 何が起きるか | 行 | 確かめ方 | 既存の issue |
| --- | --- | --- | --- | --- |
| A1 | `ParamMap.get` の型は `string \| null` だが、値が空の配列なら `undefined`、数なら数のまま返る | shared.ts 61 行目の型、86〜93 行目の `Array.isArray(v) ? v[0] : v` | [第 1 回](01-rtl-url-tree.md)のデモと Node。spec なし | 既存なし |
| A2 | `UrlSegment.parameters` の doc の例は `{id: 33}` だが、実際は文字列の `'33'` | url\_tree.ts 370 行目 | 第 1 回のデモと Node | 既存なし |
| A3 | `getInherited` の doc コメントは「既定では親の data を継承しない」と書くが、既定値は v22.0.0 から `'always'` | router\_state.ts 297 行目の既定値、307〜310 行目のコメント | [第 2 回](02-rtl-router-state.md)のデモ（既定で子が親の params・data・title を受け取る） | 既存なし（ガイドだけ直った） |
| A4 | 根の `ActivatedRoute.url` の初期値は `[UrlSegment('')]`、`snapshot.url` は `[]`。比べるのが snapshot なので、その後も揃わない | router\_state.ts 79 行目と 107 行目 | 第 2 回のデモ（開発・本番） | 既存なし |
| A5 | `withEnabledBlockingInitialNavigation()` と `withDisabledInitialNavigation()` を両方渡すと、順番によらず最初のナビゲーションが走る。警告もエラーも出ない（`provideHttpClient` は同じ種類の重複を調べている） | provide\_router.ts 395〜429 行目（423 行目の `initialNavigation()`）、469〜477 行目 | [第 3 回](03-rtl-provide-router.md)のデモと Node（開発・本番） | 既存なし |
| A6 | `withDebugTracing` は本番ビルドで provider を 1 つも返さないが、doc に書かれていない（`enableTracing` も同じ）。spec なし | provide\_router.ts 490〜491 行目の doc、515・534〜536 行目 | 第 3 回のデモ（本番のページで 0 個） | 既存なし |
| B1 | `Router.lastSuccessfulNavigation` が書き込める signal のまま返る（`currentNavigation` は `asReadonly()`） | router.ts 378〜380 行目と 177 行目、navigation\_transition.ts 349 行目 | [第 4 回](04-rtl-router-class.md)のデモと作業木の spec（`.set` が関数） | 既存なし |
| B2 | constructor のコメントは「破棄されると events は complete される」と書くが、`dispose` は `unsubscribe()` を呼ぶ。破棄のあとの `router.events.subscribe()` は `ObjectUnsubscribedError` を投げる。spec なし | router.ts 184〜186 行目のコメント、412〜416 行目 | 第 4 回のデモ | 既存なし |
| B3 | `NoPreloading` の doc は「既定で有効」と書くが、`withPreloading` を渡さなければ `RouterPreloader` 自体が作られない。`RouterPreloader` の doc の「すべてのナビゲーションのイベント」も、実際は `NavigationEnd` だけ | router\_preloader.ts 73 行目、90〜92 行目と 112 行目 | [第 5 回](05-rtl-load-guard.md)のデモ | 既存なし |
| B4 | `mapToCanActivate` などの `mapTo*` を通す spec が packages/router/test に 1 つもない。`mapToCanMatch` などの doc は、例のファイルに無い `region='CanActivate'` を指す | utils/functional\_guards.ts 28・61・79 行目 | grep と bazel の filter（0 件）、作業木で書き足した spec は通った | 既存なし |
| B5 | export された `loadChildren` の doc は「@angular-devkit/build-angular が使う」と書くが、今の呼び出し元は angular-cli の @angular/ssr（ng-routes.ts） | router\_config\_loader.ts 117〜119 行目 | angular-cli を grep | 既存なし |

もう 1 つ、括弧の中の primary の先頭のセグメントに `:` があると、serialize してから parse し直したとき名前付きの outlet に化ける問題（url\_tree.ts 509〜519 行目）は、8576f161ae4 では再現しますが、本家ではすでに 011675e417d で直っていて、22.2.4 以降（このサイトの 22.2.6 も）には入っています（[第 1 回](01-rtl-url-tree.md)）。

## 聞かれそうな質問

**Q. Router の公開メソッドの spec を 1 つのコマンドで走らせるには？**

router.spec.ts の describe は `Router` の下に `resetConfig`・`resetRootComponentType`・`setUpLocationChangeListener`・`parseUrl` が並ぶので、`--test_arg=--filter=^Router (resetConfig|resetRootComponentType|setUpLocationChangeListener|parseUrl) ` で 4 本です。`^Router ` だけだと、`PreActivation` などを含めて 49 本になります。

**Q. なぜ `^bootstrap ` は 13 本の it のうち 11 本しか走らないのですか？**

2 本が bootstrap.spec.ts の `if (!isNode)` の中（L470）にあり、Node の `:test` では登録されないからです。web の `:test_web` では走ります。

**Q. spec の中の Router が本物でないことがあるのはなぜですか？**

url\_tree.spec.ts の 158〜161 行目のように、関数が Router の一部しか読まないときは、その部分だけを持つオブジェクトを `as unknown as Router` で渡します。`isActive` 関数が読むのは `parseUrl` と `lastSuccessfulNavigation()` だけなので、これで足ります。

**Q. このシリーズの振る舞いのうち、本番ビルドで変わるものは spec で固められていますか？**

固められていません。spec は開発モードで走るので、`validateCommands` の message（navigation\_errors.spec.ts L436〜437は文まで見る）や `parseUrl` の警告の文（router.spec.ts L130）は開発モードの形だけが確かめられます。本番では番号だけになります（第 4 回の DEMO）。

**Q. issue を読むとき、どこから今のコードを当てればよいですか？**

まず部品（UrlTree / ActivatedRoute / withX / Router / 読み込み・再利用・ガード）を決め、その章の引用の行と、4 節の「今のコード」の列を見ます。古い issue（#46218・#46186 など）は本文のコードと今のコードが違うことがあるので、22.2.6 を Node で呼ぶか、作業木で it を書いて、今の振る舞いを確かめてから当てます。

## 読み終えて

- 第 1・2 回の部品は 1 ファイル 1 describe にまとまっていて、名前の頭の `^` で絞れる。第 3〜5 回の部品は integration の spec に散らばり、2 回ずつ走る。
- Node の `:test` は 1170 本、web は Chromium 1180・Firefox 1178。差は `!isNode` の中の it。
- `mapTo*`・`Router.isActive`・`withDebugTracing`・`withHashLocation` と、dispose のあとの購読・`lastSuccessfulNavigation` の `set`・親を保存したときの子の扱いは、spec が無い。
- 反応の多い issue は「その口が無い」要望で、読み込みの再試行や `canDeactivateChild` のように、今のコードの行でその口の無さが示せる。

---

← 前: [読み込み・事前読み込み・再利用・関数ガード：小さな関数を行で埋める](05-rtl-load-guard.md)  
次: [normalizeOptions：angular.json の options がビルドの設定になるまで](../abl/01-abl-options.md) →
