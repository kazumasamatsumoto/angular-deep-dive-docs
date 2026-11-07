[目次](../README.md) › [アニメーションの内側](README.md) › 第 19 回 / 全 20 回

# アニメーションのテスト：ブラウザでしか確かめられないもの

> acceptance の animation\_spec.ts が beforeEach で resetTestEnvironment し直してアニメーションを有効にする仕組み、tickAnimationFrames が requestAnimationFrame を 16.6 ms の tick にする行、旧エンジンの MockAnimationDriver と NoopAnimationsModule。このサイトの ng test（Vitest + jsdom）で animate.enter が何もしないことを確かめ、利用者が自分のテストで何を確かめられるか。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/animations-testing)

---

`animate.enter` / `animate.leave` は、ブラウザの `getAnimations()` と `animationend` に頼っています。だから Angular 自身のアニメーションの spec は、ほぼすべてブラウザでしか走りません。この章では、acceptance の `animation_spec.ts` がテスト環境を作り直してアニメーションを有効にする行、`tickAnimationFrames` が rAF を 16.6ms の時計に置き換える行、待ち行列が tick で流れることを確かめる spec、旧エンジンの `MockAnimationDriver` を読みます。そのうえで、このサイトの ng test（Vitest + jsdom）で、利用者が自分のテストで何を確かめられて何を確かめられないかを、実行した結果の表で示します。

読む対象は `packages/core/test/acceptance/animation_spec.ts`・`packages/core/test/animation_utils/tick_animation_frames.ts`・`packages/animations/browser/testing/src/mock_animation_driver.ts`、公式ガイドの `adev/src/content/guide/animations/enter-and-leave.md` です。

1. [1. 全体像](01-animations-overview.md)
2. [2. テンプレートから命令へ](02-animations-compile.md)
3. [3. 命令がすること](03-animations-instructions.md)
4. [4. 待ち行列](04-animations-queue.md)
5. [5. enter のクラス](05-animations-enter-classes.md)
6. [6. いちばん長いアニメーション](06-animations-longest.md)
7. [7. 関数で動かす](07-animations-functions.md)
8. [8. 動かないとき](08-animations-disabled.md)
9. [9. 消すのを遅らせる](09-animations-leave-removal.md)
10. [10. leave のクラス](10-animations-leave-classes.md)
11. [11. 入れ子の leave](11-animations-leave-nested.md)
12. [12. 並べ替えと出し直し](12-animations-leave-reorder.md)
13. [13. スタイルの後片付け](13-animations-styles-teardown.md)
14. [14. 旧パッケージの入口](14-animations-legacy-setup.md)
15. [15. 旧 DSL とキーフレーム](15-animations-legacy-dsl.md)
16. [16. TransitionAnimationEngine](16-animations-legacy-engine.md)
17. [17. 2 つが同居するとき](17-animations-legacy-compat.md)
18. [18. 移行](18-animations-migration.md)
19. **19. テスト**（この章）
20. [20. issue と変更を読む](20-animations-issues.md)

## 1. TestBed の既定はアニメーションを止める

📄 `angular/adev/src/content/guide/animations/enter-and-leave.md` L94–106 （▶ の行: 96, 98, 101, 106）

````md
 94 │ ## Testing
 95 │ 
 96 ▶ TestBed provides built-in support for enabling or disabling animations in your test environment. CSS animations require a browser to run, and many of the APIs are not available in a test environment. By default, TestBed disables animations for you in your test environments.
 97 │ 
 98 ▶ If you want to test that the animations are animating in a browser test, for example an end-to-end test, you can configure TestBed to enable animations by specifying `animationsEnabled: true` in your test configuration.
 99 │ 
100 │ ```typescript
101 ▶ TestBed.configureTestingModule({animationsEnabled: true});
102 │ ```
103 │ 
104 │ This will configure animations in your test environment to behave normally.
105 │ 
106 ▶ NOTE: Some test environments do not emit animation events like `animationstart`, `animationend` and their transition event equivalents.
````

1. **96 行目 既定で止める**

   「CSS のアニメーションはブラウザが無いと動かず、テストの環境には無い API も多い。だから TestBed は既定でアニメーションを止める」。中身は `test_bed_common.ts` の `ANIMATIONS_ENABLED_DEFAULT = false` と、TestBed がテストモジュールに足す `{provide: ANIMATIONS_DISABLED, useValue: !this.animationsEnabled}` です（test\_bed\_compiler.ts 1005〜1008 行目。[testing-errors](../testing/12-testing-errors.md) で引いた 1002〜1023 行目の中）。`ANIMATIONS_DISABLED` が `true` だと、命令が早く戻ります（[第 8 回](08-animations-disabled.md)）。
2. **98〜101 行目 有効にするには animationsEnabled: true**

   `TestBed.configureTestingModule({animationsEnabled: true})` で `ANIMATIONS_DISABLED` が `false` になります。このサイトの ng test でも、`TestBed.inject(ɵANIMATIONS_DISABLED)` は `false` でした（4 節）。
3. **106 行目 イベントが来ない環境がある**

   「`animationstart` / `animationend` などを出さないテスト環境もある」。jsdom がそれで、4 節のとおり、jsdom ではイベント以前に命令そのものが何もしません。

## 2. Angular 自身のテスト：環境を作り直して有効にする

../angular のブラウザ版のテスト（`ng_web_test_suite`）は、すべての spec の前に `tools/testing/browser_tests.init.mts` を読み込み、`TestBed.initTestEnvironment([BrowserTestingModule, NoopAnimationsModule, TestModule], platformBrowserTesting())` で環境を作ります。**既定の環境に旧エンジンの `NoopAnimationsModule` が入っている**ことが、この spec の準備の理由です。

📄 `angular/packages/core/test/acceptance/animation_spec.ts` L44–75 （▶ の行: 45, 50–52, 55–57, 60–63, 68）

```ts
44 │ @NgModule({
45 ▶   providers: [provideZonelessChangeDetection()],
46 │ })
47 │ export class TestModule {}
48 │ 
49 │ describe('Animation', () => {
50 ▶   if (isNode) {
51 ▶     it('should pass', () => expect(true).toBe(true));
52 ▶     return;
53 │   }
54 │ 
55 ▶   beforeEach(() => {
56 ▶     TestBed.resetTestEnvironment();
57 ▶     TestBed.initTestEnvironment([BrowserTestingModule, TestModule], platformBrowserTesting());
58 │   });
59 │ 
60 ▶   afterEach(() => {
61 ▶     TestBed.resetTestEnvironment();
62 ▶     TestBed.initTestEnvironment(
63 ▶       [BrowserTestingModule, NoopAnimationsModule, TestModule],
64 │       platformBrowserTesting(),
65 │     );
66 │   });
67 │ 
68 ▶   afterAll(() => {
69 │     TestBed.resetTestEnvironment();
70 │     TestBed.initTestEnvironment(
71 │       [BrowserTestingModule, NoopAnimationsModule, TestModule],
72 │       platformBrowserTesting(),
73 │     );
74 │   });
75 │ 
```

1. **50〜53 行目 Node では 1 本だけ**

   Node で走るときは `it('should pass')` を 1 本だけ登録して `describe` から戻ります。だから Node 版の `acceptance` を名前で絞ると `Ran 0 of 2693 specs` で PASSED になります（テストと直し方の節）。
2. **55〜58 行目 it ごとに旧エンジンを抜く**

   56 行目の `resetTestEnvironment()`（[testing-reset-teardown](../testing/03-testing-reset-teardown.md)）で既定の環境を捨て、57 行目で `NoopAnimationsModule` を**入れずに**作り直します。こうすると `RendererFactory2` は `DomRendererFactory2` になり、要素を消すときに旧エンジンのレンダラーを通りません（[第 17 回](17-animations-legacy-compat.md)）。45 行目の `TestModule` は zoneless にするためのものです。
3. **60〜66 行目 it ごとに元へ戻す**

   63 行目で `NoopAnimationsModule` を入れ直し、`browser_tests.init.mts` と同じ環境に戻します。ブラウザ版では 1 つのターゲットの spec が 1 つの bundle（`spec_bundle`）にまとめられて同じページで走るので、ほかの spec ファイルは既定の環境のつもりで書かれています。68〜74 行目の `afterAll` も同じものです。

> [!NOTE]
> **ポイント**
>
> 「なぜ毎回テスト環境を作り直すのか」の答えはこの 2 つです。既定の環境（旧エンジン入り）のままだと新しい仕組みのタイミングが旧エンジンに左右され、作り直したまま戻さないと、同じページで走るほかの spec が旧エンジン無しで走ってしまいます。ただし外側の `beforeEach` は内側の `beforeAll` より後に走るので、`describe('legacy animations compatibility')` の 930 行目の作り直しは it の時点では効いていません（[第 17 回](17-animations-legacy-compat.md)の 6 節）。

## 3. tickAnimationFrames：rAF を時計で進める

📄 `angular/packages/core/test/animation_utils/tick_animation_frames.ts` L9–14 （▶ の行: 9, 12–13）

```ts
 9 ▶ import {tick} from '@angular/core/testing';
10 │ 
11 │ /** Ticks the specified amount of `requestAnimationFrame`-s. */
12 ▶ export function tickAnimationFrames(amount: number) {
13 ▶   tick(16.6 * amount); // Angular turns rAF calls into 16.6ms timeouts in tests.
14 │ }
```

13 行目で `tick(16.6 * amount)`。9 行目の `tick` は `@angular/core/testing` の `fakeAsync` の時計です。コメントのとおり、`fakeAsync` の中では `requestAnimationFrame` が 16ms の `setTimeout` として扱われます（zone.js の `fake-async-test.ts` の 798〜805 行目。[testing-fake-async-scheduler](../testing/14-testing-fake-async-scheduler.md)）。16.6 × 1 は 16 を超えるので、`tickAnimationFrames(1)` で rAF の予約が 1 回分ちょうど走ります。`runEnterAnimation` が rAF の中で長さを測る（[第 5 回](05-animations-enter-classes.md)）のも、待ち行列が描画のあとで流れる（[第 4 回](04-animations-queue.md)）のも、これで進めます。

animation\_spec.ts では `fakeAsync(` が 50 回、`tickAnimationFrames(` が 66 回出てきます。最新の main では c60c41e29aa（2026-09-08「animation のテストの fakeAsync を減らす」）でこのファイルが消え、spec は `async` / `await` と `@angular/private/testing` の `nextAnimationFrame()`・`timeout()`（browser\_utils.ts）に書き直されました。main の animation\_spec.ts の `fakeAsync(` は 0 回です。

## 4. describe('animation queue timing')：待ち行列は tick で流れる

📄 `angular/packages/core/test/acceptance/animation_spec.ts` L2439–2474 （▶ の行: 2439, 2441, 2447, 2451–2453, 2457–2460, 2465, 2470–2471, 2473）

```ts
2439 ▶       TestBed.configureTestingModule({animationsEnabled: true});
2440 │       const rootEnvInjector = TestBed.inject(EnvironmentInjector);
2441 ▶       const childEnvInjector = createEnvironmentInjector([], rootEnvInjector);
2442 │       const appRef = TestBed.inject(ApplicationRef);
2443 │       const errorHandler = TestBed.inject(ErrorHandler);
2444 │       spyOn(errorHandler, 'handleError');
2445 │ 
2446 │       const hostEl = document.createElement('animated-child');
2447 ▶       const compRef = createComponentFn(AnimatedChild, {
2448 │         environmentInjector: childEnvInjector,
2449 │         hostElement: hostEl,
2450 │       });
2451 ▶       appRef.attachView(compRef.hostView);
2452 ▶       appRef.tick();
2453 ▶       tickAnimationFrames(1);
2454 │ 
2455 │       expect(hostEl.querySelector('.item')).not.toBeNull();
2456 │ 
2457 ▶       // Trigger leave animation via local detectChanges (queues animation
2458 ▶       // without flushing the queue - afterNextRender only runs during tick)
2459 ▶       compRef.instance.show.set(false);
2460 ▶       compRef.changeDetectorRef.detectChanges();
2461 │ 
2462 │       // Destroy the child injector before the animation queue flushes.
2463 │       // This simulates what happens when a component's lView injector is
2464 │       // destroyed while leave animations are pending.
2465 ▶       childEnvInjector.destroy();
2466 │ 
2467 │       // Tick to flush the animation queue. Without the fix, the animation
2468 │       // function would call lView[INJECTOR].get(NgZone) which delegates to
2469 │       // the destroyed childEnvInjector, throwing NG0205.
2470 ▶       appRef.tick();
2471 ▶       tickAnimationFrames(1);
2472 │ 
2473 ▶       expect(errorHandler.handleError).not.toHaveBeenCalled();
2474 │     }));
```

1. **2439〜2453 行目 別の注入器でコンポーネントを作る**

   2439 行目で有効にし、2441 行目で子の `EnvironmentInjector` を作って、2447 行目でそれを使ってコンポーネントを作ります。2451 行目で `ApplicationRef` に付け、2452 行目の `appRef.tick()` と 2453 行目の rAF 1 回で描画を済ませます。
2. **2457〜2460 行目 detectChanges では流れない**

   2457〜2458 行目のコメントが要点です。「局所の `detectChanges` は leave を待ち行列に積むだけで流さない。`afterNextRender` は tick の中でしか走らない」。待ち行列を流すのが `afterNextRender` であることは[第 4 回](04-animations-queue.md)で読みます。
3. **2465〜2473 行目 注入器を壊してから流す**

   2465 行目で、待ち行列が流れる前に子の注入器を壊し、2470 行目の tick で流します。2473 行目で `ErrorHandler` が呼ばれていないこと（NG0205 が出ないこと）を確かめます。直したのは bd2868e915e（Matt Lewis、2026-02-10）で、`NgZone` と `MAX_ANIMATION_TIMEOUT` を命令の時点で先に取っておくようにしました（[第 3 回](03-animations-instructions.md)の `ɵɵanimateEnter` 73〜76 行目）。

この describe には it が 3 本あります（2311・2409・2476 行目）。2311 行目の it は待ち行列を `afterEveryRender` から `afterNextRender` に変えた aab73671e4e（#64423 の修正）で入ったもので、[第 20 回](20-animations-issues.md)で読みます。

## 5. 旧エンジン：MockAnimationDriver と NoopAnimationsModule

📄 `angular/packages/animations/browser/testing/src/mock_animation_driver.ts` L26–35 （▶ の行: 29, 31–32）

```ts
26 │ /**
27 │  * @publicApi
28 │  *
29 ▶  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
30 │  */
31 ▶ export class MockAnimationDriver implements AnimationDriver {
32 ▶   static log: AnimationPlayer[] = [];
33 │ 
34 │   validateStyleProperty(prop: string): boolean {
35 │     return validateStyleProperty(prop);
```

📄 `angular/packages/animations/browser/testing/src/mock_animation_driver.ts` L59–78 （▶ の行: 59, 67, 75–76）

```ts
59 ▶   animate(
60 │     element: any,
61 │     keyframes: Array<ɵStyleDataMap>,
62 │     duration: number,
63 │     delay: number,
64 │     easing: string,
65 │     previousPlayers: any[] = [],
66 │   ): MockAnimationPlayer {
67 ▶     const player = new MockAnimationPlayer(
68 │       element,
69 │       keyframes,
70 │       duration,
71 │       delay,
72 │       easing,
73 │       previousPlayers,
74 │     );
75 ▶     MockAnimationDriver.log.push(<AnimationPlayer>player);
76 ▶     return player;
77 │   }
78 │ }
```

1. **31〜32 行目 static log**

   旧エンジンは、実際に動かす部分を `AnimationDriver`（ドライバー：要素とキーフレームを受け取ってプレイヤーを返す役）に任せます（[第 16 回](16-animations-legacy-engine.md)）。`MockAnimationDriver` はその偽物で、32 行目の `static log` に作ったプレイヤーを全部ためます。29 行目のとおり、これも 20.2 で非推奨です。
2. **59〜77 行目 animate はプレイヤーを記録して返すだけ**

   67 行目で `MockAnimationPlayer` を作り、75 行目で `log` に積み、76 行目で返します。ブラウザのアニメーションは始まりません。旧エンジンの spec は「`MockAnimationDriver.log` に何本のプレイヤーが、どの keyframes と duration で積まれたか」を確かめます。`grep -rc MockAnimationDriver` では、`animations/browser/test` の 6 ファイル、`core/test/legacy_animation` の 3 ファイル、acceptance の `integration_spec.ts`・`renderer_factory_spec.ts` が使っています。
3. **NoopAnimationsModule**

   `NoopAnimationsModule` は `AnimationDriver` に `NoopAnimationDriver` を入れます（platform-browser/animations の providers.ts。[第 14 回](14-animations-legacy-setup.md)）。`NoopAnimationDriver.animate` は `new NoopAnimationPlayer(duration, delay)` を返すだけで、記録もしません（animations/browser の animation\_driver.ts）。旧エンジンの仕組みは動くが見た目は動かない、という状態で、2 節の既定の環境はこれです。新しい `animate.enter` / `animate.leave` はドライバーを使わないので、どちらのドライバーも関係しません。

## 6. このサイトの ng test で確かめる

このサイトの ng test（`@angular/build:unit-test`、Vitest 4.1.11 + jsdom、zone.js なし、`@angular/core` 22.1.6）で、利用者が自分のテストで書きそうなことを 3 回に分けて走らせました。jsdom に `getAnimations` があるか、既定と `animationsEnabled: true` でクラスが付くかの基本は、[第 8 回](08-animations-disabled.md)で確かめています。

📄 `src/verify-e/*.spec.ts（要点。確かめたあと消した）`

```
// src/verify-e/testing.spec.ts（要点。確かめたあと消した）
@Component({
  template: `@if (show()) { <p id="p" animate.leave="ve-out">x</p> }`,
  styles: `.ve-out { animation: vek 300ms; } @keyframes vek { from { opacity: 1 } to { opacity: 0 } }`,
})
class LeaveCmp { show = signal(true); }

it('leave class', async () => {
  TestBed.configureTestingModule({ animationsEnabled: true });
  const f = TestBed.createComponent(LeaveCmp);
  f.detectChanges();
  f.componentInstance.show.set(false);
  f.detectChanges();
  // f.nativeElement.querySelector('#p') → null（もう無い）
});

it('call the leave handler directly', async () => {
  const f = TestBed.createComponent(DirectCmp);  // (animate.leave)="leave($event)"
  await f.whenStable();
  const p = f.nativeElement.querySelector('#p');
  f.componentInstance.leave({ target: p, animationComplete: () => completed++ } as AnimationCallbackEvent);
  // p.className → 've-leaving'、20ms 後に completed → 1
});
```

| やったこと | 結果 | 理由 |
| --- | --- | --- |
| `animationsEnabled: true` で `animate.leave` の要素を `@if` で消し、`fixture.detectChanges()` の直後に探す | **もう無い**（`whenStable` を待つ前） | jsdom には `document.documentElement.getAnimations` が無いので `areAnimationSupported` が `false`。`ɵɵanimateLeave` が何も登録しない（第 8 回）。Detach の分岐で leave が 0 件になり、その場で消える（第 9 回） |
| 既定の設定で `(animate.leave)="leave($event)"` の要素を消す | 関数は **0 回**。要素は消えている | `ɵɵanimateLeaveListener` も `areAnimationSupported` で戻る（第 7 回）。ブラウザで `ANIMATIONS_DISABLED` が true のときは、関数は呼ばないが要素の削除の登録はする作り |
| `providers: [{provide: ɵANIMATIONS_DISABLED, useValue: false}]` で同じことをする | `TestBed.inject` は `false`。関数は 0 回 | トークンより先に `areAnimationSupported` で戻る。`ɵANIMATIONS_DISABLED` は 22.1.6 の型（`types/core.d.ts`）に private export として出ている |
| `animationsEnabled: true` のときの `TestBed.inject(ɵANIMATIONS_DISABLED)` | `false` | 1 節の 98 行目のとおり |
| spec の中で `Element.prototype.getAnimations = () => []` を足してから `animate.enter` の要素を出す | クラスは付かない（`className` は空） | `areAnimationSupported` は `@angular/core` を読み込んだ時点で 1 回だけ決まる定数（utils.ts。第 8 回） |
| `ng test --setup-files` で同じものを足す | setup のファイルは走った（`getAnimations` は function）が、クラスは付かず、`(animate.leave)` の関数も 0 回 | unit-test の builder の説明のとおり「アプリの polyfills と Angular の TestBed は、setup のファイルより先に初期化される」。`@angular/core` はもう読み込まれている |
| `(animate.leave)` の関数を、テストから `{ target, animationComplete }` の偽物を渡して直接呼ぶ | クラスが付き、10ms 後に `animationComplete` が 1 回呼ばれた | ただの関数として確かめられる。Angular がいつ呼ぶか・呼んだあと消すかは確かめていない |

> [!WARNING]
> **ハマりどころ**
>
> jsdom のテストで「`animate.leave` の要素が消えた」ことは確かめられますが、それはアニメーションを待ってから消えたのではなく、**アニメーションの仕組みが丸ごと動いていない**から消えただけです。クラスが付くか、leave を待つか、`animationComplete` を呼ぶまで残るかは、ブラウザで確かめるしかありません。このサイトの unit-test の builder には `browsers` の設定（Vitest のブラウザモード）がありますが、このサイトには provider が入っていないので試していません。

## 7. デモ：ブラウザのテストが見るもの（本物）

> **🧪 DEMO — animate.enter / animate.leave を毎フレーム記録する**
>
> このページの本物の `animate.enter="aty-in"` / `animate.leave="aty-out"`（500ms）です。ボタンを押したときだけ、要素の有無・クラス・`getAnimations()` の数が変わったフレームを記録し、要素の上で `animationend` を聞きます（3 秒で止める）。OS の設定で動きを減らしていても、このデモは動きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-testing)

「消す」を押した直後（同期）は、要素はまだあり、`.aty-out` もまだ付いていません。leave は待ち行列に積まれ、描画のあとに走るからです（[第 4 回](04-animations-queue.md)）。次のフレーム（ログでは 2ms 後）には `.aty-out` が付いて `getAnimations()` が 1 になり、500ms ほどあとの `animationend` と同じフレームで要素が無くなります（2026-11-01 に Chrome で確かめた）。`animationend` の `animationName` は `aty-pop-out` ではなく `_ngcontent-ng-c…_aty-pop-out` でした。コンポーネントのスタイルのカプセル化が keyframes の名前を書き換えるからで（[compiler-shadow-css](../compiler/18-compiler-shadow-css.md)）、名前で比べるテストではこの接頭辞に気を付けます。6 節の jsdom では、この全部が飛ばされて `detectChanges()` の直後に消えました。acceptance の spec が `tickAnimationFrames(1)` で進めたり `animationend` を手で送ったりしているのは（[第 17 回](17-animations-legacy-compat.md)の 980・985 行目）、このフレームとイベントを時計の上で再現するためです。

## テストと直し方

| ターゲット | 中身 | 結果（2026-11-01、Chromium） | 誰が走らせたか |
| --- | --- | --- | --- |
| `//packages/core/test/acceptance:acceptance_web_chromium` | animation\_spec.ts（新しい仕組み。51 本）を含む acceptance 全部 | 2743 passed, 0 failed, 3 skipped / PASSED in 6.8s | 担当 E が --nocache\_test\_results で実行 |
| `//packages/core/test/acceptance:acceptance（Node）` | 同じ spec を Node で。--test\_arg=--filter="legacy animations compatibility" | Ran 0 of 2693 specs / PASSED in 1.3s | 担当 E |
| `//packages/animations/browser/test:test_web_chromium` | 旧エンジン（MockAnimationDriver を使う spec が多い） | 124 passed, 0 failed / PASSED in 1.3s | 担当 E が --nocache\_test\_results で実行 |
| `//packages/core/test:test_web_chromium` | core のユニット（longest\_animation\_spec・legacy\_animation/\*） | 1591 passed, 4 skipped | シリーズの準備で実行（scratchpad/anim-logs） |
| `//packages/animations/test:test_web_chromium` | 旧 API（AnimationBuilder など） | 14 passed | 同上 |
| `//packages/platform-browser/animations/test:test_web_chromium` | NoopAnimationsModule・BrowserAnimationsModule | 21 passed, 1 skipped | 同上 |
| `//packages/platform-browser/animations/async/test:test_web_chromium` | provideAnimationsAsync | 15 passed, 1 skipped | 同上 |

📄 `ターミナル（../angular で実行）`

```
cd ~/angular-research/angular
# ブラウザ版（Chromium だけ）。絞れないので、いつもターゲットの全 spec が走る
pnpm bazel test //packages/core/test/acceptance:acceptance_web_chromium --nocache_test_results --test_output=all
# Chromium と Firefox の 2 本
pnpm bazel test //packages/core/test/acceptance:acceptance_web
# 旧エンジン
pnpm bazel test //packages/animations/browser/test:test_web_chromium --nocache_test_results --test_output=all
```

1. **ブラウザ版は絞れない**

   `ng_web_test_suite`（tools/bazel/web\_test.bzl 29 行目）は、spec を 1 つの bundle にまとめて rules\_browsers の `wtr_test`（web-test-runner + jasmine。Chromium と Firefox）で走らせます。Node 版の `--test_arg=--filter=` に当たるものはありません。ほしい describe / it が何本あるかは grep で数えます。

   📄 `ターミナル（数え方）`

   ```
   cd ~/angular-research/angular/packages/core/test/acceptance
   grep -c "^\s*it(" animation_spec.ts                 # 52（Node 用の 'should pass' を含む）
   grep -c "animationsEnabled: true" animation_spec.ts  # 49
   grep -c "fakeAsync(" animation_spec.ts               # 50
   grep -c "tickAnimationFrames(" animation_spec.ts     # 66
   # describe ごと（2 段目の describe から次の describe までの it）
   #   animate.leave (L76) 17 / animate.enter (L995) 27 / animation queue timing (L2310) 3
   #   animation element duplication (L2530) 2 / infinite animations (L2760) 2
   ```
2. **1 本だけ見たいとき**

   自分の作業コピーで `it` を `fit`（`describe` を `fdescribe`）に変えると、jasmine はそれだけを走らせます。**私たちは ../angular を変えないので、これは試していません。**

   📄 `下書き（試していない）`

   ```
   // 自分の作業コピーでだけ。../angular は変えていないので、これは試していない
   describe('animation queue timing', () => {
     fit('should not throw INJECTOR_ALREADY_DESTROYED ...', fakeAsync(() => { ... }));
   });
   // jasmine は fit / fdescribe があると、それ以外を走らせない（pending にする）。
   // 走らせ終わったら必ず it / describe に戻す（コミットに混ぜない）
   ```
3. **直すとしたら**

   TestBed の既定は `test_bed_common.ts` の `ANIMATIONS_ENABLED_DEFAULT` と `test_bed_compiler.ts` の `ANIMATIONS_DISABLED` の provider（testing-errors の章の 1005〜1008 行目）、jsdom で何もしない理由は `animation/utils.ts` の `areAnimationSupported`（第 8 回）です。新しい仕組みの振る舞いは `acceptance/animation_spec.ts` の `describe('animate.leave')`（76 行目）・`describe('animate.enter')`（995 行目）・`describe('animation queue timing')`（2310 行目）に足すのが入口で、確かめるのは `acceptance_web_chromium` です。
4. **issue を読むときの手がかり**

   「テストでは消えるのにブラウザでは残る」「テストで `(animate.leave)` が呼ばれない」は、ほとんどが 6 節の表の 1・2 段目（jsdom では仕組みが動かない）か、TestBed の既定（止めている）で説明できます。#63551（ShadowDom のコンポーネントのテストで DomRenderer が落ちる）のように、テストの環境から報告される issue もあります（[第 20 回](20-animations-issues.md)）。

## 聞かれそうな質問

**Q. jsdom のテストでアニメーションのクラスを確かめられますか？**

確かめられません。`areAnimationSupported` が `false` なので、`animationsEnabled: true` にしてもクラスは付きません。spec の中で `getAnimations` を足しても、`--setup-files` で足しても付きませんでした（6 節の表の 5・6 段目）。定数は `@angular/core` を読み込んだ時点で決まり、ng test では TestBed の初期化がそれより先に済んでいるからです。確かめられるのは、`(animate.leave)` の関数をただの関数として直接呼ぶことまでです。

**Q. leave を待つテストはどう書きますか？**

ブラウザで、`animationsEnabled: true` にして書きます。../angular の acceptance では `fakeAsync` の中で、消してから `tickAnimationFrames(1)` で待ち行列と rAF を進め、`animationend` を手で送ってから `tick()` します（第 17 回の 978〜990 行目）。最新の main では、同じことを `await fixture.whenStable()`・`await nextAnimationFrame()`・`await timeout()` で書いています。待ち行列は tick の中でしか流れないので、局所の `detectChanges()` だけでは leave が始まらないことに注意します（4 節の 2457〜2458 行目）。

**Q. Angular のテストはなぜ毎回テスト環境を作り直すのですか？**

既定の環境（`browser_tests.init.mts`）に旧エンジンの `NoopAnimationsModule` が入っているからです。animation\_spec.ts は 55〜58 行目で旧エンジンを抜いた環境を it ごとに作り、60〜66 行目で既定に戻します。同じターゲットの spec は 1 つのページで走るので、戻さないとほかの spec ファイルの前提が崩れます。

**Q. MockAnimationDriver は animate.enter のテストに使えますか？**

使えません。`MockAnimationDriver` は旧エンジンの `AnimationDriver` の偽物で、旧エンジンが `animate()` を呼んだときにプレイヤーを記録するだけです（75 行目）。`animate.enter` / `animate.leave` は CSS のクラスと `getAnimations()` を使い、ドライバーを通りません。

## 読み終えて

- TestBed は既定でアニメーションを止める（`ANIMATIONS_DISABLED` = true）。`animationsEnabled: true` で有効にする。
- jsdom では `areAnimationSupported` が false で、命令が何もしない。要素はすぐ消え、`(animate.leave)` も呼ばれない。後から polyfill しても効かない。
- ../angular の animation\_spec.ts は 55〜66 行目で旧エンジンを抜いた環境を it ごとに作って戻す。Node では 1 本だけ。
- `tickAnimationFrames` は `tick(16.6 * n)`。待ち行列は tick の中で流れる。main ではこのファイルが消え、async / await に書き直された。
- ブラウザ版は絞れないので、数は grep で数え、1 本だけ見るなら作業コピーで `fit`（試していない）。

---

← 前: [移行：@angular/animations から animate.enter / animate.leave へ](18-animations-migration.md)  
次: [animations の issue と変更を読む：直されたバグから学ぶ](20-animations-issues.md) →
