[目次](../README.md) › [Router の型と説明文の読み残し](README.md) › 第 9 回 / 全 9 回

# spec と issue を読む：型と説明文を固めているもの

> packages/router/test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか（固めていないものも）、手元での走らせ方と件数、area: router の issue のうち説明文に当たるものの表、このシリーズで見つけた食い違いの一覧。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-tests-issues)

---

この章で分かること：第 1〜8 回で読んだ説明文（angular.dev の API リファレンスになる doc コメント）の約束を、packages/router/test のどの spec が固めているか、固めていないのはどれか。手元で走らせた target と件数。area: router の issue のうち、このシリーズの説明文に当たるもの。そして、このシリーズで見つけた説明と実装の食い違いの一覧です。

読む対象は `packages/router/test/` の spec（../angular、8576f161ae4）と、2026-11-21 に取った area: router の開いている issue 68 件・docs を含む 60 件です。走らせ方の細かいところは[前のシリーズの最終回](../rtl/06-rtl-tests-issues.md)と[その前の最終回](../rdir/06-rdir-tests-issues.md)にあります。

1. [1. models.ts の小さな型](01-rmd-basic-types.md)
2. [2. Route の説明文](02-rmd-route.md)
3. [3. ガードの型](03-rmd-guards.md)
4. [4. Resolve と NavigationBehaviorOptions](04-rmd-resolve-nav.md)
5. [5. provideRouter の機能](05-rmd-features.md)
6. [6. ルーターのイベント](06-rmd-events.md)
7. [7. RouterLink と RouterOutlet](07-rmd-directives.md)
8. [8. URL とナビゲーションの小道具](08-rmd-url-rest.md)
9. **9. spec と issue**（この章）

## 1. 走らせ方と件数

packages/router/test/BUILD.bazel は、`glob(["**/*.ts"])` の `test_lib` を Node の `:test`（`zoneless_jasmine_test`）と web の `:test_web`（`zoneless_web_test_suite`）の 2 つで走らせます。ここで走らせたのは Node の `:test` だけです。../angular で `pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all` は `1170 specs, 0 failures`、PASSED でした（2026-11-21）。`--test_arg=--filter=<正規表現>` で describe か it の名前に絞った数は次のとおりで、どれも 0 failures です。`integration/` の spec は navigation と history の 2 回登録されるので、it の数の 2 倍になります。

| --filter | 件数 | 固めている約束 | 章 |
| --- | --- | --- | --- |
| `component input binding` | 12 | 入力の優先順、`queryParams: false`、`undefined` にする | [5](05-rmd-features.md) |
| `^RouterScroller` | 13 | `withInMemoryScrolling` の各オプション | [5](05-rmd-features.md) |
| `^RouterPreloader` | 22 | `withPreloading` | [5](05-rmd-features.md) |
| `"eager" urlUpdateStrategy` | 12 | `urlUpdateStrategy: 'eager'` | [5](05-rmd-features.md) |
| `error handler` | 6 | `withNavigationErrorHandler` の `RedirectCommand` と DI | [5](05-rmd-features.md) |
| `route events` | 8 | (Child)Activation の順 | [6](06-rmd-events.md) |
| `restoredState` | 2 | 命令のナビゲーションで `restoredState` が `null` | [6](06-rmd-events.md) |
| `duplicate popstate/hashchange` | 1 | popstate と hashchange が続いても 1 回 | [6](06-rmd-events.md) |
| `^RouterLink ` | 11 | UrlTree と queryParams、`null`、custom element | [7](07-rmd-directives.md) |
| `routerLinkActive` | 24 | active の付き方 | [7](07-rmd-directives.md) |
| `^createUrlTree` | 64 | コマンド、相対、query、`createUrlTreeFromSnapshot` | [8](08-rmd-url-rest.md) |
| `containsTree` | 50 | `isActive` の既定値と各オプション | [8](08-rmd-url-rest.md) |
| `custom url handling strategies` | 6 | `UrlHandlingStrategy` | [8](08-rmd-url-rest.md) |
| `title strategy` | 9 | `TitleStrategy`（第 2 回の title と同じ） | [8](08-rmd-url-rest.md) |

第 1〜4 回の絞り込みの件数は、各章の「テストと直し方」の表にあります（`prioritizedGuardValue operator` 9、`runGuardsAndResolvers` 14、`title strategy` 9、`resolveData operator` 10、`CanLoad` 12 など）。

## 2. 約束と spec の表

「固めていない」は、grep と describe を読んで、その約束を確かめる it が見つからなかったものです。

| 章 | 説明文の約束 | 固めている spec（packages/router/test/ から） |
| --- | --- | --- |
| [1](01-rmd-basic-types.md) | 型の外の値を返すガードは無視して次へ | `operators/prioritized_guard_value.spec.ts` 175 `should ignore invalid values` |
| [1](01-rmd-basic-types.md) | `RedirectCommand` の `navigationBehaviorOptions`、投げた `RedirectCommand` | `integration/guards.spec.ts` 482・508、2552 `throwing redirect` |
| [1](01-rmd-basic-types.md) | `LoadChildrenCallback` の 4 つの形 | **固めていない** |
| [2](02-rmd-route.md) | `runGuardsAndResolvers` の 6 つの値 | `integration/guards.spec.ts` の `runGuardsAndResolvers`（598）› 679 ほか |
| [2](02-rmd-route.md) | 空の path の `'prefix'` の redirect で「無限ループ」 | **固めていない**（確かめる it も否定する it も無い） |
| [3](03-rmd-guards.md) | 各ガードの引数と戻り値の形 | `integration/guards.spec.ts` の CanActivate（81）・CanActivateChild（1509）・CanDeactivate（981）・canMatch（2088）。説明文の例そのものを型検査する仕組みは無い |
| [4](04-rmd-resolve-nav.md) | 「親のガード → 子のガード → 親の resolver → 子の resolver」の順 | **固めていない**（`guards order`（2004）はガードだけ） |
| [4](04-rmd-resolve-nav.md) | `info` はコピーしない | `integration/navigation.spec.ts` 147 は `toEqual` で、同じオブジェクトかは**固めていない** |
| [5](05-rmd-features.md) | `withHashLocation` | **0 件**（router の test に使う spec が無い） |
| [5](05-rmd-features.md) | `withNavigationErrorHandler` の `UrlTree` は無視 | **固めていない**（`RedirectCommand` の側だけ、navigation\_errors.spec.ts 158） |
| [6](06-rmd-events.md) | (Child)Activation の Start はガードの段、End は activate の段 | `integration/router_events.spec.ts` 31 が順を固める（doc の「Resolve の段」とは逆の側を固めている） |
| [6](06-rmd-events.md) | `restoredState` は命令のナビゲーションで `null` | `integration/navigation.spec.ts` 243（下の引用）。初期ナビゲーションの側は**固めていない** |
| [6](06-rmd-events.md) | activate が無いと `ResolveStart` が出ない／`loadComponent` の `RouteConfigLoadStart` | **固めていない** |
| [7](07-rmd-directives.md) | `../` は URL のセグメントで数える | `create_url_tree.spec.ts` 510・525。複数セグメントの `path` の中の `RouterLink` は**固めていない** |
| [7](07-rmd-directives.md) | UrlTree と queryParams は使えない | `router_link_spec.ts` 302（開発モードの例外の側） |
| [8](08-rmd-url-rest.md) | `UrlHandlingStrategy` が `false` で空の状態、次も `false` なら skip | `integration/lazy_loading.spec.ts` 930 `should work`（下の引用） |
| [8](08-rmd-url-rest.md) | doc の `team/44` の例、`TitleStrategy` の例の Routes | **固めていない**（doc の例をそのまま使う it は無い） |

📄 `angular/packages/router/test/integration/navigation.spec.ts` L243–263 （▶ の行: 258, 261–262）

```ts
243 │     it('should set the restoredState to null when executing imperative navigations', async () => {
244 │       const router = TestBed.inject(Router);
245 │       router.resetConfig([
246 │         {path: '', component: SimpleCmp},
247 │         {path: 'simple', component: SimpleCmp},
248 │       ]);
249 │ 
250 │       const fixture = await createRoot(router, RootCmp);
251 │       let event: NavigationStart;
252 │       router.events.subscribe((e) => {
253 │         if (e instanceof NavigationStart) {
254 │           event = e;
255 │         }
256 │       });
257 │ 
258 ▶       router.navigateByUrl('/simple');
259 │       await timeout();
260 │ 
261 ▶       expect(event!.navigationTrigger).toEqual('imperative');
262 ▶       expect(event!.restoredState).toEqual(null);
263 │     });
```

258 行目の `navigateByUrl('/simple')` の `NavigationStart` で、261〜262 行目が `'imperative'` と `null` を確かめます。[第 6 回](06-rmd-events.md)の「初期ナビゲーションでは `history.state` が入る」は、`initialNavigation()` の前に state を置く別の it を足さないと固まりません。

📄 `angular/packages/router/test/integration/lazy_loading.spec.ts` L966–988 （▶ の行: 971–973, 975, 978, 987）

```ts
966 │ 
967 │         // unsupported URL
968 │         router.navigateByUrl('/exclude/one');
969 │         await advance(fixture);
970 │ 
971 ▶         expect(location.path()).toEqual('/exclude/one');
972 ▶         expect(Object.keys(router.routerState.root.children).length).toEqual(0);
973 ▶         expect(fixture.nativeElement).toHaveText('');
974 │         expectEvents(events, [
975 ▶           [NavigationStart, '/exclude/one'],
976 │           [GuardsCheckStart, '/exclude/one'],
977 │           [GuardsCheckEnd, '/exclude/one'],
978 ▶           [NavigationEnd, '/exclude/one'],
979 │         ]);
980 │         events.splice(0);
981 │ 
982 │         // another unsupported URL
983 │         simulateLocationChange('/exclude/two', browserAPI);
984 │         await advance(fixture);
985 │ 
986 │         expect(location.path()).toEqual('/exclude/two');
987 ▶         expectEvents(events, [[NavigationSkipped, '/exclude/two']]);
988 │         events.splice(0);
```

972〜973 行目が「routerState の根の子が 0、表示が空」、974〜979 行目が `RoutesRecognized` の無いイベントの列、987 行目が続けての `NavigationSkipped` です。[第 8 回](08-rmd-url-rest.md)のデモの `0,7,8,1` と `16` と同じ並びです。

## 3. issue の表

開いている 68 件と docs を含む 60 件の題名と本文を読み、このシリーズの説明文の行に当たるものだけを並べました（読んだだけ）。

| # | 状態 | 題 | 当たる説明文 | 章 |
| --- | --- | --- | --- | --- |
| 68378 | 閉じた（2026-04-28） | Align Router API docs with `inject` based DI | 直した #68379 は models.ts だけを変えた。events.ts の 62〜63 行目と navigation\_transition.ts の 129 行目の例は、今もコンストラクターの注入のまま | [6](06-rmd-events.md)・[8](08-rmd-url-rest.md) |
| 65657 | 閉じた（2026-04-15） | `router.navigate()` method does not explain some usages（`..` と `relativeTo`） | ガイドの側。router\_link.ts の 112〜113 行目の `../` の言い方は残る | [7](07-rmd-directives.md) |
| 65182 | 閉じた | Incorrect `event.reason` comparison on error-handling Router Example Docs | ガイドの例。events.ts の `reason` と `code` の doc は合っている | [6](06-rmd-events.md) |
| 71345 | 閉じた（2026-10-21） | Note how to respect `prefers-reduced-motion` in `withViewTransitions()` | provide\_router.ts の `withViewTransitions` の doc（main で注記が入った） | [5](05-rmd-features.md) |
| 63064 | 開いている | `withHashLocation()`: Routing breaks when operating inside a `blob:` page | `withHashLocation`。doc の「history API の代わりに」とは別の話（blob の URL での base の扱い） | [5](05-rmd-features.md) |
| 26854 | 開いている | Avoid anchorScrolling DOMException error with hash fragments that are not valid selectors | `withInMemoryScrolling` の `anchorScrolling` | [5](05-rmd-features.md) |
| 30139 | 開いている | Router scrolling does not work properly when dealing with content that is not immediately visible | `InMemoryScrollingOptions` の独自のスクロールの例（router\_config.ts の 171〜191 行目）。例そのものが Promise を待っていない | [8](08-rmd-url-rest.md) |
| 50362 | 開いている | Scroll position is not restored when skipLocationChange is used in a page guard | `withInMemoryScrolling` と `skipLocationChange` | [5](05-rmd-features.md)・[4](04-rmd-resolve-nav.md) |
| 58940 | 開いている | Typesafety for routed input bindings | `withComponentInputBinding` | [5](05-rmd-features.md) |
| 22799 | 開いている | Add ability to provide reason to navigation cancellation | `NavigationCancel` の `reason` と `code`（ガードの false は理由を持てない） | [6](06-rmd-events.md) |
| 47789 | 開いている | Router's popstate listener incompatible with asynchronous route configs and when popstate fires on page load | popstate だけでナビゲーションを始める作り（state\_manager.ts） | [6](06-rmd-events.md) |
| 54624 | 開いている | `Router.createUrlTree(...)` creates new UrlTree which reuses UrlSegmentGroups from the `Router.currentUrlTree` | create\_url\_tree.ts の 216〜221 行目のコメントが、置き換えるときだけ作り直す理由を書いている | [8](08-rmd-url-rest.md) |
| 54992・22588・62973 | 開いている | `routerLinkActiveOptions` の fragment、複数の Route、初回の描画 | `RouterLinkActive` の doc と `IsActiveMatchOptions` | [7](07-rmd-directives.md) |
| 28345 | 開いている | routerLink directive always makes element focusable | `RouterLink`（a 以外の要素の `tabindex`） | [7](07-rmd-directives.md) |
| 38111 | 開いている | Why is Route#data a type instead of an interface? | models.ts の `Data` | [1](01-rmd-basic-types.md) |
| 57021 | 開いている | UrlMatcher no longer receives the full url SegmentGroup after redirect | models.ts の `UrlMatcher` | [1](01-rmd-basic-types.md) |
| 53946 | 開いている | Expose strategies that correspond to string values of runGuardsAndResolvers | models.ts の `RunGuardsAndResolvers` | [2](02-rmd-route.md) |
| 72027 | 開いている | Router error boundaries: a reused RedirectCommand instance only redirects the first time | `RedirectCommand`。main だけのエラー境界の話で、8576f161ae4 のガードの道では 2 回とも redirect した | [1](01-rmd-basic-types.md) |
| 71007 | 開いている（area: docs） | RouteReuseStrategy: reattached child keeps providers from a destroyed parent injector | `withAutoCleanupInjectors` の doc（壊す条件） | [5](05-rmd-features.md) |

このシリーズで見つけた食い違い（次の節）について、`gh search issues` と `gh search prs` をキーワードで引いた範囲では、同じ話の issue / PR は見つかりませんでした（第 1 回の `path` と `matcher` だけは閉じた #58507 がある）。検索の回数に上限があるので、網羅ではありません。

## 4. このシリーズで見つけたもの（食い違いと不具合）

どれも 8576f161ae4 の行を読み、本物の @angular/router 22.2.6（ページのデモと Node の記録）か、説明文の例をそのまま取り出した .ts の型検査（サイトの TypeScript 6.0.3、`--strict`）で確かめたものです。「main」は origin/main（d201dd76ef2、2026-11-20）で、直っていなければ main の行番号を書きました。

| 章 | 何が起きるか | 行（8576f161ae4） | 確かめ方と main |
| --- | --- | --- | --- |
| [1](01-rmd-basic-types.md) | （説明不足）`RedirectCommand` は「ガードから返せる」とだけ書くが、ガードと resolver から投げても redirect になる | models.ts 131〜135 | navigation\_transition.ts の 909〜911 行目と guards.spec.ts 2552。main 149 も同じ |
| [1](01-rmd-basic-types.md) | （食い違い）`LoadChildrenCallback` を「次の形のアロー関数でなければならない」と書くが、型は Routes・部品・Observable も受け、4 つの形とも動く | models.ts 266 | デモ。main 283 |
| [1](01-rmd-basic-types.md) | （食い違い）`matcher` は `path` と一緒に使えないと書くが、`path: ''` と一緒なら通り、matcher は呼ばれない | models.ts 208・639 | デモ（matcher 0 回）。既知の閉じた #58507。main 225・656 |
| [2](02-rmd-route.md) | （例の誤り）Multiple Outlets の例でカンマが抜けている | models.ts 415 | TS1005。main 432 |
| [2](02-rmd-route.md) | （例の誤り）`redirectTo: '/user/:name'` の例は、そのままでは NG04002 | models.ts 456〜457 | デモ。main 474 |
| [2](02-rmd-route.md) | （古い）「空の path のルートは親の params と data を継ぐ」。既定が `'always'` になり、path に関係なく継ぐ | models.ts 485 | デモ。main 502 |
| [2](02-rmd-route.md) | （食い違い）空の path の redirect を `'prefix'` にすると無限ループと書くが、redirect は 1 回で止まる | models.ts 519〜523・628〜632 | デモ（recognize.ts の 372 行目の allowRedirects）。main 540・649 |
| [2](02-rmd-route.md) | （説明不足）`pathMatch: 'prefix', //default`。開発モードでは空の path の redirect に書かないと例外 | models.ts 511 | validateConfig。main 528 |
| [2](02-rmd-route.md) | （説明不足）`paramsChange` の説明が行列パラメーターに触れない（行頭の `- ` も無い） | models.ts 784〜785・352〜353 | デモ（`;m=1` で走る）、guards.spec.ts 679。main 813・369 |
| [2](02-rmd-route.md) | （古い）`resolve` は「DI トークンの map」、`title` は「文字列か Resolve の Injectable」と書くが、関数も受ける | models.ts 753・600〜601 | 型の 757・606 行目、デモ。main 782・617 |
| [3](03-rmd-guards.md) | （例の誤り）`Permissions.canActivate()` を引数 2 つで呼ぶ。`route.params.id` | models.ts 853・867・986 | TS2554・TS4111。main 882 |
| [3](03-rmd-guards.md) | （食い違い）CanActivateChildFn の説明が `canActivate`、例は `children: []` でガードが呼ばれない | models.ts 1031・1034 | デモ。main 1060 |
| [3](03-rmd-guards.md) | （例の誤り）CanDeactivate の例の `route` は存在しない名前 | models.ts 1080 | TS2552。main 1109 |
| [3](03-rmd-guards.md) | （綴り）「at in this phase」 | models.ts 1236 | main 1265 |
| [4](04-rmd-resolve-nav.md) | （例の誤り）「`HeroComponent` から」と書くが、例の部品は `HeroDetailComponent` | models.ts 1305・1404 | main 1334・1433 |
| [4](04-rmd-resolve-nav.md) | （例の誤り）Resolve の順の例にカンマ 2 つの抜けと、`Route` に無い `guards` | models.ts 1333・1335・1339 | TS1005 ×2、TS2353。main 1362・1368 |
| [4](04-rmd-resolve-nav.md) | （例の誤り）ResolveFn の順の例もカンマが抜けている | models.ts 1443・1445 | TS1005 ×2。main 1472 |
| [4](04-rmd-resolve-nav.md) | （綴り）「redirect a `RedirectCommand`」（return a） | models.ts 1365 | main 1394 |
| [4](04-rmd-resolve-nav.md) | （例の誤り）CanLoad の例で `string` の引数に `route` を渡す | models.ts 1482・1493 | TS2345。main 1522 |
| [4](04-rmd-resolve-nav.md) | （古い）`onSameUrlNavigation` を「`OnSameUrlNavigation` の一部」と書くが、型は全部 | models.ts 1553〜1554 | 726530a9af9 が型を広げた。main 1582 |
| [4](04-rmd-resolve-nav.md) | （表示）info の例の箇条書きが途中で改行され 2 項目に描かれる | models.ts 1609〜1610 | main 1638 |
| [4](04-rmd-resolve-nav.md) | （綴り）`UrlHandingStrategy`、「the browser URL the differ」 | models.ts 1647・1654 | main 1676・1683 |
| [4](04-rmd-resolve-nav.md) | （誤ったリンク）`@see withInMemoryRouterScroller`（公開の名前は `withInMemoryScrolling`） | models.ts 1668 | main 1697 |
| [4](04-rmd-resolve-nav.md) | （例の誤り）`isFunction<product>(fn)`（値を型に使う） | utils/type\_guards.ts 20 | TS2749。main 20 |
| [5](05-rmd-features.md) | （食い違い）`withHashLocation` は「history API の代わりに URL の fragment を使う」と書くが、`#` 付きの URL で `history.pushState` を呼ぶ | provide\_router.ts 647 | デモ（偽の PlatformLocation に `pushState('#/a?x=1')`）。router の spec 0 件。main 650 |
| [5](05-rmd-features.md) | （言い方）`withExperimentalPlatformNavigation` は「`Location` strategy を provide する」と書くが、差し替えるのは `Location`。222 行目に `*` が無く、239・244 行目に行末の空白 | provide\_router.ts 213・222・239・244 | 行の読み比べ（266〜270 行目）。main 216 |
| [6](06-rmd-events.md) | （食い違い）`ChildActivationStart`・`ChildActivationEnd`・`ActivationStart`・`ActivationEnd` を「Resolve の段の一部」と書くが、Start はガードの段、End は activate の段で出る | events.ts 530〜531・553〜554・575〜576・598〜599 | デモの「成功」と router\_events.spec.ts 31。49cd8513e45（2017）から。main 同じ行 |
| [6](06-rmd-events.md) | （食い違い）`restoredState` は「popstate のとき以外は null」と書くが、初期ナビゲーションでも `history.state` に `navigationId` があれば入る（trigger は imperative） | events.ts 105〜106 | デモの「初期ナビゲーション」。router.ts 305〜309 行目の内部のコメントは正しい。main 106 |
| [6](06-rmd-events.md) | （古い）`NavigationTrigger` の `'hashchange'` は、9e039ca68bf（2021-09-02）から出ない | events.ts 19・23、navigation\_transition.ts 242 | デモの「hash の変更」（trigger は popstate）。main 19 |
| [6](06-rmd-events.md) | （説明不足）`ResolveStart` は「解決するものがあってもなくても出る」と書くが、activate する Route が無いと出ない | events.ts 430〜431 | デモの「query だけ変える」、navigation\_transition.ts 681〜683 行目。main 430 |
| [6](06-rmd-events.md) | （説明不足）`RouteConfigLoadStart` は「Route の設定を遅延読み込みする前」と書くが、`loadComponent` でも、Resolve の段のあとに出る | events.ts 488 | デモの「loadComponent」。main 488 |
| [6](06-rmd-events.md) | （説明不足）`NavigationCancellationCode.Redirect` は「ガードが UrlTree を返したとき」と書くが、resolver の `RedirectCommand` とエラー処理の `RedirectCommand` も同じ code | events.ts 181 | デモの「resolver が RedirectCommand」と第 5 回の 8 節。main 181 |
| [7](07-rmd-directives.md) | （食い違い）`../` は「Route の木を 1 段上がる」と書くが、URL のセグメントを 1 つ戻る | directives/router\_link.ts 112〜113 | デモの u3（`/team/11/user/jim`）。`createUrlTree` の doc の例とは合う。main 112 |
| [7](07-rmd-directives.md) | （例の誤り）state の例が strict で通らない | directives/router\_link.ts 169 | TS18047・TS18048。main 169 |
| [7](07-rmd-directives.md) | （印の欠け）`RouterLinkWithHref` は本文に「v15 から非推奨」と書くだけで `@deprecated` が無い | directives/router\_link.ts 588 | 行の読み比べ。main 602 |
| [8](08-rmd-url-rest.md) | （例の誤り）`['../../team/44/user/22']` は `/team/44/user/22` ではなく `/team/33/team/44/user/22`。67 行目に `//` が無い | create\_url\_tree.ts 75〜76・67（router.ts 465〜466 は[createUrlTree](../router/03-router-create-url-tree.md)で既出） | デモ。main 75〜76 |
| [8](08-rmd-url-rest.md) | （食い違い）`createUrlTree` は「今の URL の木にセグメントを足す」と書くが、`relativeTo` が無ければ根に当てる（`['details']` → `/details`） | router.ts 425・430〜431 | デモ。main 426 |
| [8](08-rmd-url-rest.md) | （例の誤り）`router.navigate`（`this.` が無い） | navigation\_transition.ts 132 | TS2663。#68378 を直した #68379 は models.ts だけ。main 133 |
| [8](08-rmd-url-rest.md) | （例の誤り）`TitleStrategy` の例の Routes に閉じ括弧 `}` が足りない | page\_title\_strategy.ts 22〜27 | TS1136。main 23 |
| [8](08-rmd-url-rest.md) | （例の誤り）独自のスクロールの例が `response.json()` の Promise をそのまま入れる。main で書き直した版は型の誤りになる | router\_config.ts 180 | 8576f161ae4 は `any` で通る。main 182 は TS2345（4380e683d80、2026-09-10） |
| [8](08-rmd-url-rest.md) | （言い方）`ROUTER_CONFIGURATION` を「Router のサービスの DI トークン」と書く（中身は設定） | router\_config.ts 304 | main 303 |
| [8](08-rmd-url-rest.md) | （古い内部のコメント）`processChildren` は「合わなければ null を返す」と書くが、戻り値の型に null は無く、`NoMatch` を投げる | recognize.ts 181〜182 | 行の読み比べ。main 198 |
| [8](08-rmd-url-rest.md) | （記号）`` `//(a:a)(b:b) `` の閉じの `` ` `` が抜けている（内部のコメント） | url\_tree.ts 860 | main 922 |
| [8](08-rmd-url-rest.md) | （誤ったリンク）`UrlHandlingStrategy` のガイドへのリンクが事前読み込みの節 | url\_handling\_strategy.ts 18 | main の deade10d4d1（2026-09-25）で直った |
| [8](08-rmd-url-rest.md) | （版の印）`ViewTransitionsFeatureOptions`・`ViewTransitionInfo` は `@developerPreview 20.0`、`withViewTransitions` は 19.0 | utils/view\_transition.ts 24・46 | main の 64502f9ae23 で `@publicApi 22.3` に揃った |

45 件のうち、main で直っていたのは最後の 2 件（リンクと版の印）だけでした。ほかは 8576f161ae4 と同じ文が、上の表の main の行に残っています。

## 聞かれそうな質問

**Q. 説明文の例は、どこかで型検査されていますか？**

{@example} で packages/examples から引く例は、その BUILD.bazel の ng\_project でコンパイルされます。models.ts・provide\_router.ts などに直接書いた例はどこでも検査されず、このシリーズで見つけた例の誤り（TS1005・TS2663・TS1136 など）はすべてこちらです（[第 3 回](03-rmd-guards.md)の「テストと直し方」）。

**Q. router の Node の spec は何件で、どう絞りますか？**

`//packages/router/test:test` で 1170 件。`--test_arg=--filter=` に describe か it の名前の正規表現を渡します。0 件でも PASSED になるので、ログの `N specs` を見ます（1 節）。

**Q. doc と spec が逆のことを言っている所はありますか？**

(Child)Activation のイベントです。doc は「Resolve の段」と書き、router\_events.spec.ts の 31 行目の it は `GuardsCheckEnd` の前と `ResolveEnd` の後に並べた順を固めています（[第 6 回](06-rmd-events.md)）。

**Q. main で直っているものはどれですか？**

`UrlHandlingStrategy` のガイドへのリンク（deade10d4d1）と、view transitions の版の印（64502f9ae23、`@publicApi 22.3`）だけです。スクロールの例は main で書き直されましたが、型の誤りになりました（4 節）。

**Q. このシリーズの食い違いに当たる既存の issue はありますか？**

検索した範囲では、`path` と `matcher` の閉じた #58507 だけでした。#68378（inject の形に揃える）は閉じていますが、直した #68379 は models.ts だけで、events.ts と navigation\_transition.ts の例は残っています（3 節）。

## 読み終えて

- router の Node の spec は 1170 件。このシリーズの約束の多くは固まっているが、`withHashLocation`・doc の例そのもの・初期ナビゲーションの `restoredState` などは固まっていない。
- 説明文に直接書いた例は型検査されず、カンマや名前の誤りが何年も残る。
- イベントの doc は「Resolve の段」「popstate のとき以外は null」「hashchange」の 3 つが実装と合わない。
- 見つけた 45 件のうち、main で直っていたのは 2 件。

---

← 前: [URL とナビゲーションの小道具の残り](08-rmd-url-rest.md)  
次: [AbstractControl の説明文：値・状態・イベントの約束](../fmd/01-fmd-abstract-model.md) →
