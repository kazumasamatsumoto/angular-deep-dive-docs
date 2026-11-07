[目次](../README.md)

# テストの内側

> TestBed・ComponentFixture・fakeAsync を、Angular 自身のテストと一緒に

ng test を走らせると、spec の前後で TestBed が何かを作って壊し、fixture.detectChanges() や await fixture.whenStable() がアプリの変更検知を代わりに回します。このシリーズは @angular/core/testing を中心に、テスト環境の初期化、テストごとの後片付け、TestBed.inject、createComponent が DOM に根の要素を置いてコンポーネントを作る手順、ComponentFixture が zoneless と zone のどちらで変更検知を回すか、whenStable が何を待つか、エラーがテストの失敗になるまで、fakeAsync の偽の時計、@defer とルーターのテスト用の道具を、実際の行で 1 つずつ読みます。各章の最後に「この仕組みのテストはどこにあり、手元でどう 1 本走らせ、直すならどのファイルか」を置きます。NgModule 側のコンパイル（TestBedCompiler）は ngmodule・standalone シリーズの章へつなぎます。最終回は testing の issue と最近の変更を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/testing)

1. [テストの全体像：@angular/core/testing と、テストを支えるパッケージの地図](01-testing-overview.md)  
   @angular/core/testing・platform-browser/testing・zone.js/testing・common/http/testing・router/testing・cdk/testing が何を受け持つか。test\_hooks.ts が import されただけで beforeEach / afterEach を登録する仕組みと、ng test では CLI の setup も同じフックを登録して 2 組になること。ng test（Vitest）と Angular 自身の bazel test の初期化の違い。core のテストが 4 つの shard に分かれて走るときの Ran N of M の読み方（N の合計が走った本数、M = 全 spec 数 − (filter に一致した総数 − N)）。
2. [initTestEnvironment：テスト用のプラットフォームと BrowserTestingModule](02-testing-init-environment.md)  
   TestBed がクラス TestBedImpl そのもので、static のメソッドが 1 つだけの TestBedImpl.INSTANCE へ委ねる作り。initTestEnvironment が platform・ngModule・最初の TestBedCompiler と static の環境オプションを持ち、2 回目を拒む行。platformBrowserTesting（platformBrowser + 印のトークン）と BrowserTestingModule（APP\_ID・偽の Navigation・DOMTestComponentRenderer）、TestEnvironmentOptions（teardown・errorOnUnknownElements・errorOnUnknownProperties）が instance ?? 環境 ?? 既定 の順で効く場所、resetTestEnvironment が戻すものと戻さないもの。
3. [テストごとの後片付け：resetTestingModule と destroyAfterEach](03-testing-reset-teardown.md)  
   getCleanupHook が beforeEach と afterEach のどちらで resetTestingModule を呼ぶかを destroyAfterEach で決める仕組み。resetTestingModule の try / finally の連なり（destroyActiveFixtures → tearDownTestingModule → オプションを戻す）、fixture の破棄で投げられたエラーを数えて最後に投げる行、removeAllRootElements が DOM の根を消す順番、rethrowErrors の既定値の決まり方。
4. [TestBed.inject と注入コンテキスト：テストモジュールはいつ作られるか](04-testing-inject.md)  
   TestBed.inject が testModuleRef を初めて読んだときに compiler.finalize() でテストモジュールを作る遅延、そのあと configureTestingModule や override を呼ぶと assertNotInstantiated が投げるエラー。inject が テストモジュールのインジェクタ → コンパイラのインジェクタの 2 段で探す行、TestBed.inject(TestBed)、runInInjectionContext、古い inject() / withModule。
5. [createComponent：根の要素を置いて、コンポーネントを作るまで](05-testing-create-component.md)  
   TestBed.createComponent が TestComponentRenderer.insertRootElement で root0 のような id の要素を body に置き、ComponentFactory.create にテストモジュールを環境インジェクタとして渡す手順。コンパイルされていないときの 2 種類のエラー、inferTagName、NgZone.run で包む条件、\_activeFixtures への登録と getLastFixture。
6. [入力の渡し方：setInput と bindings（inputBinding・outputBinding・twoWayBinding）](06-testing-component-bindings.md)  
   fixture.componentRef.setInput が入力を書き込み、OnPush のビューに印を付ける流れと、createComponent の bindings に inputBinding / outputBinding / twoWayBinding を渡すと、signal の値がテンプレートのバインディングのように入力へ流れ続ける仕組み（dynamic\_bindings.ts）。componentInstance に直接代入してはいけない理由。
7. [createDirective と DirectiveFixture：ディレクティブだけをテストする](07-testing-directive-fixture.md)  
   最新のソースに入った TestBed.createDirective（このサイトの 22.1.6 には未収録）が、セレクタからタグ名を決め、DirectiveTestHost という空のホストにディレクティブを載せて DirectiveFixture を返す手順。複数のタグ名を持つセレクタのエラー、directiveInstance と onDestroy、これまでのテスト用ホストコンポーネントを書く方法との比較。
8. [DebugElement と By：テストから DOM とコンポーネントを覗く](08-testing-debug-element.md)  
   fixture.debugElement が getDebugNode で DOM の節に DebugElement を 1 つだけ作って貼る仕組み、query / queryAll が TNode の木・子コンポーネントのビュー・DOM の子孫の順に歩くことと By.css・By.directive（providers のトークンにも一致）・By.all の述語、injector・componentInstance・properties・attributes が LView から読まれ、styles・classes は DOM だけを読む行、triggerEventHandler が DOM イベントを出さずに cleanup に記録されたリスナーを呼ぶこと。nativeElement との使い分け。
9. [fixture.detectChanges：zoneless では appRef.tick、zone では detectChanges](09-testing-detect-changes.md)  
   AbstractFixture の constructor が ApplicationRef の allTestViews に自分のビューを登録する行と、detectChanges が zoneless なら includeAllTestViews を立てて appRef.tick()、zone なら ngZone.run の中で root effect → detectChanges → checkNoChanges を回す違い。checkNoChanges 引数、テストで ExpressionChangedAfterItHasBeenChecked が出る理由。
10. [自動の変更検知：autoDetect が zoneless で既定になる理由と TestBed.tick](10-testing-auto-detect.md)  
   autoDetect の既定が ZONELESS\_ENABLED で決まる行、autoDetectTestViews に入ったビューだけがスケジューラの tick で更新される仕組み、ComponentFixtureAutoDetect、zoneless で autoDetectChanges(false) が投げる理由。TestBed.tick（flushEffects は非推奨の別名）が includeAllTestViews を立てる行。
11. [isStable と whenStable：何を「安定」と呼んで待つのか](11-testing-when-stable.md)  
   isStable が PendingTasksInternal の hasPendingTasks を読むだけであること、whenStable が appRef.whenStable を待ち、その間に起きたエラーで Promise を reject する仕組み（whenStableRejectFunctions）、whenRenderingDone。HttpClient や Router が PendingTasks を足すので await fixture.whenStable() で待てる理由。
12. [エラーがテストの失敗になるまで：TestBedApplicationErrorHandler](12-testing-errors.md)  
   TestBed がテストモジュールに入れる TestBedApplicationErrorHandler と INTERNAL\_APPLICATION\_ERROR\_HANDLER の差し替えが、イベントのリスナーやスケジューラの tick、PendingTasks.run で捕まえたエラーを利用者の ErrorHandler に渡したあと、whenStable を待つ Promise があれば reject、なければ投げ直す流れ。TestBed.tick() を直接呼んだときは ErrorHandler を通らずにそのまま投げること、rethrowApplicationErrors: false で元の振る舞いに戻す行。fixture の constructor が ngZone.onError を購読して投げ直す理由と、zone.js が無いときと fakeAsync の中では投げない例外。
13. [fakeAsync：@angular/core/testing から zone.js の FakeAsyncTestZoneSpec へ](13-testing-fake-async.md)  
   core の fakeAsync・tick・flush・flushMicrotasks が Zone\[\_\_symbol\_\_("fakeAsyncTest")\] に委ねるだけの薄い包みであること。zone.js 側の fakeAsync が新しいゾーンを作らず ProxyZone の delegate を FakeAsyncTestZoneSpec に差し替えて fn を同期で呼び、終わりに flush（既定）して戻す手順。残ったタイマーをエラーにするのは flush: false のときだけであること、入れ子の禁止、Date の差し替え。
14. [偽の時計：Scheduler が setTimeout と setInterval を並べて進める](14-testing-fake-async-scheduler.md)  
   FakeAsyncTestZoneSpec.onScheduleTask が setTimeout・setInterval・requestAnimationFrame を Scheduler の待ち行列に入れる行、tick(ms) が締め切りの早い順に関数を実行して時刻を進め、周期タイマーを入れ直す仕組み、flush の上限 20 回、マイクロタスクを毎回流す順番、tick の processNewMacroTasksSynchronously。
15. [waitForAsync と ProxyZone：zone.js/testing が jasmine に入れるもの](15-testing-wait-for-async.md)  
   waitForAsync が Zone\[\_\_symbol\_\_("asyncTest")\] に委ね、AsyncTestZoneSpec がマクロタスクとマイクロタスクが無くなるまでテストの終わりを待つ仕組み。zone.js/testing が jasmine の describe を SyncTestZone、it / beforeEach を queueRunner ごとの ProxyZone で走らせるように包む行、fakeAsync と waitForAsync が ProxyZone を必要とする理由とエラー文、Vitest 用の別パッチ（vitest-patch）。
16. [zone を使わないテストの時間：whenStable・偽タイマー・zone 依存の道具の境目](16-testing-zoneless-time.md)  
   zone.js を読み込まないとき fakeAsync と waitForAsync が返すエラー、zoneless で await fixture.whenStable() が待つ物（描画と PendingTasks）と待たない物（素の setTimeout）、TestBed.tick の役目、Vitest の vi.useFakeTimers が rAF まで偽物にして whenStable を止める理由と進め方。このサイトの ng test（Vitest + jsdom、zone.js なし）で実際に確かめた振る舞い。
17. [テストの中の effect と signal：TestBed.tick で何が流れるか](17-testing-effects.md)  
   root effect と view effect が、テストの TestBed.tick()・fixture.detectChanges()・await fixture.whenStable() からどこで流れるか（zoneless ではどれも appRef.tick の synchronizeOnce で root → view の順、zone の detectChanges だけは自分で root effect を flush する）。TestBed.runInInjectionContext で作る effect が必ず root effect になる理由。core/test/test\_bed\_effect\_spec.ts の 5 本の it が確かめていることと、render3/reactivity\_spec.ts が別のターゲットにあること。
18. [@defer のテスト：DeferBlockBehavior と DeferBlockFixture](18-testing-defer.md)  
   deferBlockBehavior（Playthrough が既定、Manual）が DEFER\_BLOCK\_CONFIG としてテストモジュールに入る行、fixture.getDeferBlocks が LView から defer ブロックを集める仕組み、DeferBlockFixture.render が状態のテンプレートの有無を確かめ、Complete なら依存を読み込み、タイマーを飛ばして描く手順、入れ子の getDeferBlocks。
19. [RouterTestingHarness：ルーティングを本物の Router でテストする](19-testing-router-harness.md)  
   RouterTestingHarness.create が RootCmp を createComponent し、navigateByUrl が Router.navigateByUrl を待ったあと fixture を更新し、出てきたコンポーネントの型を確かめる手順。routeDebugElement と routeNativeElement、BrowserTestingModule が入れる偽の Navigation、RouterTestingModule との違い。最新の main に入った変更も 1 つ読む。
20. [testing の issue と変更を読む：どこから関わるか](20-testing-issues.md)  
   area: testing のラベルで開いている issue を種類と優先度で分け、この 1 年に @angular/core/testing などへ入ったコミット（getLastFixture、createDirective、RouterTestingHarness.navigate など）の大きさと種類を並べる。issue を手元の spec で再現する手順と、役に立つコメントの書き方。2026-11-01 時点のスナップショット。
