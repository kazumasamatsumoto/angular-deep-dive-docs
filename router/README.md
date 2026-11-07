[目次](../README.md)

# Router の内側

> URL の解析からコンポーネントの表示まで

URL 文字列が UrlTree になり、Route 設定と照合され、ガードとリゾルバを通り、RouterOutlet にコンポーネントが置かれ、ブラウザの履歴が書き換わる。1 回のナビゲーションで動く関数を 1 つずつ読みます。Router は npm では @angular/router という別パッケージですが、ソースは angular/angular リポジトリの packages/router にあります（core・common・forms も同じ monorepo の中の別パッケージです）。

全 21 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/router)

1. [Router は 1 本の RxJS パイプライン](01-router.md)  
   URL は木を直列化したもの、という設計思想から読む。switchMap でナビゲーションが打ち消される仕組みと、その取りこぼし対策まで。
2. [URL 文字列が UrlTree になるまで：UrlParser の 1 文字ずつの読み方](02-router-url-tree.md)  
   DefaultUrlSerializer.parse → UrlParser.parseRootSegment → parseChildren → parseSegment。/a/b;x=1(aux:c)?q=1#f がどの関数でどの木になるか。マトリックスパラメータと副アウトレットの括弧の扱い、serialize で戻す手順まで。
3. [routerLink の配列が UrlTree になるまで：createUrlTree と「..」の解決](03-router-create-url-tree.md)  
   Router.createUrlTree → createUrlTreeFromSnapshot → computeNavigation → tree → updateSegmentGroup。\['../x', {id: 1}\] がどう解釈されるか、相対パスの起点はどこか、queryParamsHandling の merge / preserve が何を足すか。
4. [Route 設定の検証と正規化：validateConfig と EmptyOutletComponent](04-router-route-config.md)  
   アプリが渡した Routes に Router が最初にすること。validateNode が弾く組み合わせ（redirectTo と children など）、standardizeConfig が component の無い親に ɵEmptyOutletComponent を差し込む理由、route.providers が EnvironmentInjector になる場所。
5. [provideRouter が provide するもの：ROUTES・Router・各 withX の中身](05-router-provide-router.md)  
   provideRouter(routes, ...features) が返す EnvironmentProviders の全要素。routerFeature がどう provider 配列を包むか、withRouterConfig / withPreloading / withHashLocation / withComponentInputBinding がそれぞれ何を上書きするか。ROUTER\_CONFIGURATION の既定値。
6. [最初のナビゲーションはいつ走るか：enabledNonBlocking と enabledBlocking](06-router-initial-navigation.md)  
   getBootstrapListener → Router.initialNavigation → setUpLocationChangeListener。既定の enabledNonBlocking と withEnabledBlockingInitialNavigation の違いを、APP\_INITIALIZER と BOOTSTRAP\_DONE の行で追う。SSR で blocking が要る理由。
7. [navigateByUrl から NavigationTransition が生まれるまで](07-router-navigation-request.md)  
   navigate / navigateByUrl / NavigationExtras → scheduleNavigation → handleNavigationRequest。navigationId、Promise の resolve/reject、PendingTasks への登録、UrlHandlingStrategy.extract、同じ URL のとき NavigationSkipped になる判定（onSameUrlNavigation）。
8. [setupNavigations の全段：パイプラインの順番と中断のしくみ](08-router-pipeline.md)  
   navigation\_transition.ts の switchMap の中を上から下へ。各段で出るイベント、takeUntil と abortController、take(1)、catchError が NavigationCancel / NavigationError / RedirectRequest に振り分ける条件、finalize と rollbackState。以降の章の地図。
9. [URL と Route を照合する：Recognizer と match の規則](09-router-recognize.md)  
   Recognizer.match → processSegmentGroup → processChildren → processSegment → processSegmentAgainstRoute。config\_matching.ts の match が path / \*\* / 空パス / pathMatch: 'full' / matcher をどう判定するか。結果が ActivatedRouteSnapshot の木になるところ。
10. [redirectTo はいつ・どこで解決されるか：ApplyRedirects と 31 回の上限](10-router-redirects.md)  
   Recognizer の中で redirectTo を見つけたときの流れ。相対リダイレクトの lineralizeSegments、絶対リダイレクトが AbsoluteRedirect 例外で match を最初からやり直す仕組み、MAX\_ALLOWED\_REDIRECTS、関数形式の redirectTo、canMatch の位置。
11. [loadChildren と loadComponent：RouterConfigLoader が import() を呼ぶ瞬間](11-router-lazy-loading.md)  
   Recognizer が loadChildren を見つけてから RouterConfigLoader.loadChildren が動き、\_loadedRoutes と \_loadedInjector が Route に書き込まれるまで。canLoad の位置、WeakMap キャッシュ、LOAD COMPONENTS 段、RouterPreloader と PreloadAllModules が同じ loader を使うこと。
12. [ガードの実行順：checkGuards が canDeactivate を先に走らせる理由](12-router-guards.md)  
   getAllRouteGuards が「離れる経路」と「入る経路」を分け、runCanDeactivateChecks → runCanActivateChecks の順で動く。関数ガードの runInInjectionContext、prioritizedGuardValue、UrlTree / RedirectCommand を返したときの redirectIfUrlTree、runGuardsAndResolvers の既定。
13. [resolve と data と title：resolveData が ActivatedRouteSnapshot を埋める手順](13-router-resolvers.md)  
   resolveData → runResolve → resolveNode → getResolver。paramsInheritanceStrategy の既定が 'always' である意味と getInherited、resolver が値を出さずに complete したとき NavigationCancel(NoDataFromResolver) になる行、TitleStrategy.updateTitle が呼ばれる場所。
14. [ActivatedRoute と ActivatedRouteSnapshot：2 つの木と advanceActivatedRoute](14-router-router-state.md)  
   RouterStateSnapshot と RouterState の違い。createRouterState が RouteReuseStrategy.shouldReuseRoute で ActivatedRoute を使い回す判定、\_futureSnapshot、advanceActivatedRoute が params / data の BehaviorSubject に値を流す条件（変わったときだけ）。
15. [RouterOutlet にコンポーネントが置かれる：ActivateRoutes と ChildrenOutletContexts](15-router-activate-routes.md)  
   ActivateRoutes.activate → deactivateChildRoutes → activateChildRoutes → activateRoutes。ChildrenOutletContexts / OutletContext の木、RouterOutlet.activateWith の OutletInjector、deactivate の destroy、shouldDetach / store / retrieve による detach と attach、ActivationStart / End。
16. [ブラウザの URL と履歴：HistoryStateManager と canceledNavigationResolution](16-router-browser-url.md)  
   handleRouterEvent が BeforeActivateRoutes で setBrowserUrl を呼ぶ既定（deferred）と eager の違い。ɵrouterPageId を history.state に埋める理由、キャンセル時の restoreHistory が 'replace' と 'computed' でどう戻すか、popstate の registerNonRouterCurrentEntryChangeListener、withHashLocation。
17. [Router.events の全種類と出る順番：どの行が何を流すか](17-router-events.md)  
   EventType 17 種類を、1 回のナビゲーションで出る順に並べ、送信元の行を表にする。NavigationCancellationCode と NavigationSkippedCode の意味。Router.subscribeToNavigationEvents が公開前に stateManager と RedirectRequest を処理する順序、RouterScroller と withDebugTracing の購読。
18. [RouterLink の href と RouterLinkActive の判定：isActive と containsTree](18-router-link-active.md)  
   RouterLink が href を作り直すタイミング（ngOnChanges / router.events 購読）。RouterLinkActive.update が Router.isActive → containsTree → containsSegmentGroupHelper で 'exact' と 'subset' を比べる手順、exactMatchOptions / subsetMatchOptions の中身、ariaCurrentWhenActive。
19. [withViewTransitions：document.startViewTransition をどこで待つか](19-router-view-transitions.md)  
   createViewTransition が afterNextRender の Promise と startViewTransition を組み合わせ、パイプラインが「遷移の開始」を待って ActivateRoutes に進む流れ。skipInitialTransition、onViewTransitionCreated、hasUAVisualTransition の意味。
20. [withRouterResources：ルートに resource を結び付けて読み込みを待つ](20-router-resources.md)  
   routerResource と setupAndRunResources。BLOCKING\_SYMBOL / nonBlocking の区別、createTransactionalSnapshot が前のルートの値を保ったまま次を読む手順、createResourceOutletBindingEffects がコンポーネント input へ値を流す仕組み。v22 で入った新しい段。
21. [withExperimentalPlatformNavigation：Navigation API の navigate イベントを intercept する](21-router-platform-navigation.md)  
   NavigationStateManager が history.pushState の代わりに navigation.navigate を使い、navigate イベントを handleNavigate で intercept し、precommitHandler で URL 確定を遅らせる手順。HistoryStateManager との差分と、Router の外から来た遷移の扱い。
