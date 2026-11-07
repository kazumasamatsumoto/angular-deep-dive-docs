[目次](../README.md) › [テストの内側](README.md) › 第 10 回 / 全 20 回

# 自動の変更検知：autoDetect が zoneless で既定になる理由と TestBed.tick

> autoDetect の既定が ZONELESS\_ENABLED で決まる行、autoDetectTestViews に入ったビューだけがスケジューラの tick で更新される仕組み、ComponentFixtureAutoDetect、zoneless で autoDetectChanges(false) が投げる理由。TestBed.tick（flushEffects は非推奨の別名）が includeAllTestViews を立てる行。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/testing-auto-detect)

---

v22 の TestBed で fixture を作ると、何もしなくても signal の変化が画面に出ます。これが「自動の変更検知（autoDetect）」です。この章では、**autoDetect の既定が `ZONELESS_ENABLED` の値そのものである行**、autoDetect の fixture だけがスケジューラの tick で更新される仕組み、zoneless で `autoDetectChanges(false)` が投げる行、そして `TestBed.tick()` が何をするかを読みます。

読む対象は `packages/core/testing/src/fixture.ts`・`test_bed.ts`・`test_bed_common.ts`、確かめる spec は `packages/core/test/test_bed_spec.ts` と `component_fixture_spec.ts` です。

1. [1. 全体像](01-testing-overview.md)
2. [2. initTestEnvironment](02-testing-init-environment.md)
3. [3. 後片付け](03-testing-reset-teardown.md)
4. [4. TestBed.inject](04-testing-inject.md)
5. [5. createComponent](05-testing-create-component.md)
6. [6. 入力の渡し方](06-testing-component-bindings.md)
7. [7. createDirective](07-testing-directive-fixture.md)
8. [8. DebugElement と By](08-testing-debug-element.md)
9. [9. detectChanges](09-testing-detect-changes.md)
10. **10. 自動の変更検知**（この章）
11. [11. whenStable](11-testing-when-stable.md)
12. [12. エラーの伝わり方](12-testing-errors.md)
13. [13. fakeAsync](13-testing-fake-async.md)
14. [14. 偽の時計](14-testing-fake-async-scheduler.md)
15. [15. waitForAsync と ProxyZone](15-testing-wait-for-async.md)
16. [16. zone なしの時間](16-testing-zoneless-time.md)
17. [17. effect と signal](17-testing-effects.md)
18. [18. @defer](18-testing-defer.md)
19. [19. RouterTestingHarness](19-testing-router-harness.md)
20. [20. issue と変更を読む](20-testing-issues.md)

## 1. fixture のフィールド：autoDetect はどこで決まるか

📄 `angular/packages/core/testing/src/fixture.ts` L59–82 （▶ の行: 61, 63, 71–72, 75–76, 78–80）

```ts
59 │   private _isDestroyed = false;
60 │   /** @internal */
61 ▶   protected readonly _noZoneOptionIsSet = inject(ComponentFixtureNoNgZone, {optional: true});
62 │   /** @internal */
63 ▶   protected _ngZone: NgZone = this._noZoneOptionIsSet ? new NoopNgZone() : inject(NgZone);
64 │   // Inject ApplicationRef to ensure NgZone stableness causes after render hooks to run
65 │   // This will likely happen as a result of fixture.detectChanges because it calls ngZone.run
66 │   // This is a crazy way of doing things but hey, it's the world we live in.
67 │   // The zoneless scheduler should instead do this more imperatively by attaching
68 │   // the `ComponentRef` to `ApplicationRef` and calling `appRef.tick` as the `detectChanges`
69 │   // behavior.
70 │   /** @internal */
71 ▶   protected readonly _appRef = inject(ApplicationRef);
72 ▶   private readonly _testAppRef = this._appRef as unknown as TestAppRef;
73 │   private readonly pendingTasks = inject(PendingTasksInternal);
74 │   private readonly appErrorHandler = inject(TestBedApplicationErrorHandler);
75 ▶   private readonly zonelessEnabled = inject(ZONELESS_ENABLED);
76 ▶   private readonly scheduler = inject(ɵChangeDetectionScheduler);
77 │   private readonly rootEffectScheduler = inject(EffectScheduler);
78 ▶   private readonly autoDetectDefault = this.zonelessEnabled ? true : false;
79 ▶   private autoDetect =
80 ▶     inject(ComponentFixtureAutoDetect, {optional: true}) ?? this.autoDetectDefault;
81 │ 
82 │   private subscriptions = new Subscription();
```

フィールドの初期化子は constructor より前に、TestBed のインジェクタの中で走るので `inject()` が使えます。

1. **75 行目 zonelessEnabled**

   `ZONELESS_ENABLED` を読みます。TestBed はテストモジュールに `provideZonelessChangeDetectionInternal()` を入れるので既定は `true`、providers に `provideZoneChangeDetection()` を入れたときだけ `false` になります（組み立ては[ngmodule-testbed](../ngmodule/17-ngmodule-testbed.md)、上書きの仕組みは [zoneless-default](../zoneless/01-zoneless-default.md)）。
2. **78 行目 autoDetectDefault**

   **zoneless なら true、zone なら false**。autoDetect の既定は、変更検知の方式で決まります。
3. **79〜80 行目 autoDetect**

   `ComponentFixtureAutoDetect` が provide されていればその値、無ければ 78 行目の既定です。`??` なので `false` を provide すれば zoneless でも `false` になります（3 節で起こしてみます）。
4. **71〜72・76 行目**

   71 行目の `ApplicationRef` を 72 行目で `TestAppRef` と見なおし、[第 9 回](09-testing-detect-changes.md)で見た 3 つのフィールドを触れるようにします。76 行目はスケジューラ（`ChangeDetectionSchedulerImpl`）です。
5. **61・63 行目**

   `ComponentFixtureNoNgZone` が true なら、63 行目で本物の NgZone の代わりに `NoopNgZone` を new します。zone の時代の「zone を使わない fixture」のための古い仕組みで、5 節の 190 行目に出てきます。

autoDetect が true のとき constructor が何をするかは[第 9 回](09-testing-detect-changes.md)の 2 節で見ました。`autoDetectTestViews` に入れ、スケジューラに 2 回通知します。この通知があるから、作った直後のビューが「最初の描画」を予約されます。

## 2. スケジューラの tick は autoDetect のビューだけを見る

どのビューが自動で更新されるかの答えは、`TestBed.tick` のコメントに書いてあります。

📄 `angular/packages/core/testing/src/test_bed.ts` L999–1027 （▶ の行: 1002, 1004–1005, 1013–1014, 1019, 1022–1023, 1025）

```ts
 999 │   /**
1000 │    * Execute any pending effects by executing any pending work required to synchronize model to the UI.
1001 │    *
1002 ▶    * @deprecated use `TestBed.tick()` instead
1003 │    */
1004 ▶   flushEffects(): void {
1005 ▶     this.tick();
1006 │   }
1007 │ 
1008 │   /**
1009 │    * Execute any pending work required to synchronize model to the UI.
1010 │    *
1011 │    * @publicApi
1012 │    */
1013 ▶   tick(): void {
1014 ▶     const appRef = this.inject(ApplicationRef);
1015 │     try {
1016 │       // TODO(atscott): ApplicationRef.tick should set includeAllTestViews to true itself rather than doing this here and in ComponentFixture
1017 │       // The behavior should be that TestBed.tick, ComponentFixture.detectChanges, and ApplicationRef.tick all result in the test fixtures
1018 │       // getting synchronized, regardless of whether they are autoDetect: true.
1019 ▶       // Automatic scheduling (zone or zoneless) will call _tick which will _not_ include fixtures with autoDetect: false
1020 │       // If this does get changed, we will need a new flag for the scheduler to use to omit the microtask scheduling
1021 │       // from a tick initiated by tests.
1022 ▶       (appRef as any).includeAllTestViews = true;
1023 ▶       appRef.tick();
1024 │     } finally {
1025 ▶       (appRef as any).includeAllTestViews = false;
1026 │     }
1027 │   }
```

1. **1019 行目**

   「自動のスケジューリング（zone でも zoneless でも）は `_tick` を呼び、それは autoDetect: false の fixture を含まない」。`ChangeDetectionSchedulerImpl.tick` も zone の `NgZoneChangeDetectionScheduler` も `ApplicationRef._tick()` を呼び（[zoneless-tick](../zoneless/05-zoneless-tick.md)・[zone-ngzone-scheduler](../zone/11-zone-ngzone-scheduler.md)）、そのとき `includeAllTestViews` は false なので、`allViews` は `autoDetectTestViews` + `_views` です（[第 9 回](09-testing-detect-changes.md)の 1 節）。
2. **1013〜1026 行目 TestBed.tick**

   1014 行目で ApplicationRef を取り、1022 行目で旗を立て、1023 行目で `tick()`、1025 行目の `finally` で下ろします。zoneless の `fixture.detectChanges()`（第 9 回の 3 節）と同じ形で、相手は**全部の fixture**です。1016〜1018 行目の TODO は「いずれ ApplicationRef.tick 自身がこの旗を立てるべきだ」と書いています。
3. **1002〜1006 行目 flushEffects**

   `@deprecated use TestBed.tick() instead`。中身は 1005 行目の `this.tick()` だけです。「effect を流す」という名前ですが、実際はビューの更新と afterRender まで含めた tick 全部を回します。

## 3. このサイトの ng test で確かめる

このサイトの ng test（Vitest + jsdom、zone.js なし、`@angular/core` 22.1.6）で、テンプレート `<p>{{ n() }}</p>` のコンポーネントを使いました。`typeof Zone` は `"undefined"` です。

| 設定 | やったこと | 結果 |
| --- | --- | --- |
| 既定（zoneless、autoDetect = true） | `createComponent` の直後 | `<p></p>`、`isStable()` は false |
| `await fixture.whenStable()` | true が返り、`<p>1</p>` |   |
| `n.set(2)` の直後 | `isStable()` は false、DOM は `<p>1</p>` |   |
| もう一度 `await fixture.whenStable()` | true が返り、`<p>2</p>` |   |
| `autoDetectChanges(false)` | `Cannot set autoDetect to false with zoneless change detection.` |   |
| `{ provide: ComponentFixtureAutoDetect, useValue: false }`（zoneless） | 作った直後 | allTestViews 1 件 / autoDetectTestViews 0 件。`isStable()` は**すぐ true**、DOM は `<p></p>` |
| `await whenStable()` のあと `TestBed.tick()` | NG0100（Previous value: 'undefined'）。DOM は `<p></p>` |   |
| `n.set(2)` → `appRef.tick()` → `TestBed.tick()` | どちらも投げないが、DOM は `<p></p>` のまま |   |
| `n.set(3)` → `await whenStable()` → `TestBed.tick()` | DOM は `<p></p>` のまま |   |
| `provideZoneChangeDetection()`（zone.js なし） | `TestBed.inject(NgZone)` / `createComponent` | どちらも `NG0908: In this configuration Angular requires Zone.js` |

1. **false を provide すると最初の描画が予約されない**

   80 行目で autoDetect が false になるので、第 9 回で見た constructor の通知が飛ばされます。誰も通知しないので `isStable()` はすぐ true で、`ApplicationRef` の `dirtyFlags` は None のままです。そこで `TestBed.tick()` を呼ぶと、第 9 回の 4 節で見た synchronize のループ（dirtyFlags が None なら回らない）が回らず、開発モードの checkNoChanges だけが走って「一度も描いていないビュー」の値の違いを NG0100（Previous value: 'undefined'）として投げます。
2. **set のあとも描かれない**

   `n.set(2)` の通知で `dirtyFlags` は立ちますが、旗なしの `appRef.tick()` やスケジューラの `_tick` は、このビューを相手にしません（1019 行目）。相手にしたビューに汚れが無いので、`syncDirtyFlagsWithViews` が `dirtyFlags` を下ろし（[cd-after-render](../cd/08-cd-after-render.md)）、そのあとの `TestBed.tick()` では synchronize のループが回りません。2 回目以降に NG0100 が出なかった理由（検査のときビューのどの状態が効いたか）は、この章では追っていません。
3. **zone は試せない**

   zone.js が無い環境で `provideZoneChangeDetection()` を入れると、本物の `NgZone` の constructor が NG0908 を投げます。なので 78 行目の「zone なら false」は、この環境ではソースの行で確かめるだけにします。Angular 本体の `//packages/core/test:test` は zone.js を読み込んで走るので、そこでは試せます（テストと直し方の節）。

## 4. ComponentFixtureAutoDetect

📄 `angular/packages/core/testing/src/test_bed_common.ts` L40–48 （▶ の行: 43, 48）

```ts
40 │ /**
41 │  * @publicApi
42 │  */
43 ▶ export const ComponentFixtureAutoDetect = new InjectionToken<boolean>('ComponentFixtureAutoDetect');
44 │ 
45 │ /**
46 │  * @publicApi
47 │  */
48 ▶ export const ComponentFixtureNoNgZone = new InjectionToken<boolean>('ComponentFixtureNoNgZone');
```

43 行目はただの `InjectionToken<boolean>` です。`factory` が無いので、provide しなければ 80 行目の `inject(..., {optional: true})` は `null` を返し、`??` で既定に落ちます。zone の時代は「全部の fixture を autoDetect にしたい」ときに `true` を provide するものでした。zoneless では既定が true なので、provide する意味があるのは `false` のときだけで、それは 3 節のとおり描画が止まります。

## 5. autoDetectChanges(false) が投げる行

📄 `angular/packages/core/testing/src/fixture.ts` L169–202 （▶ の行: 175–176, 187–188, 190–191, 194–195, 197, 200–201）

```ts
169 │   /**
170 │    * Set whether the fixture should autodetect changes.
171 │    *
172 │    * Also runs detectChanges once so that any existing change is detected.
173 │    *
174 │    * @param autoDetect Whether to autodetect changes. By default, `true`.
175 ▶    * @deprecated For `autoDetect: true`, use `autoDetectChanges()`.
176 ▶    * We have not seen a use-case for `autoDetect: false` but `changeDetectorRef.detach()` is a close equivalent.
177 │    */
178 │   autoDetectChanges(autoDetect: boolean): void;
179 │ 
180 │   /**
181 │    * Enables automatically synchronizing the view, as it would in an application.
182 │    *
183 │    * Also runs detectChanges once so that any existing change is detected.
184 │    */
185 │   autoDetectChanges(): void;
186 │   autoDetectChanges(autoDetect = true): void {
187 ▶     if (!autoDetect && this.zonelessEnabled) {
188 ▶       throw new Error('Cannot set autoDetect to false with zoneless change detection.');
189 │     }
190 ▶     if (this._noZoneOptionIsSet && !this.zonelessEnabled) {
191 ▶       throw new Error('Cannot call autoDetectChanges when ComponentFixtureNoNgZone is set.');
192 │     }
193 │ 
194 ▶     if (autoDetect) {
195 ▶       this._testAppRef.autoDetectTestViews.add(this.hostView);
196 │     } else {
197 ▶       this._testAppRef.autoDetectTestViews.delete(this.hostView);
198 │     }
199 │ 
200 ▶     this.autoDetect = autoDetect;
201 ▶     this.detectChanges();
202 │   }
```

1. **187〜188 行目**

   zoneless で false を渡すと投げます。ng test で見た文はこの 188 行目の文字列です。
2. **190〜191 行目**

   zone なのに `ComponentFixtureNoNgZone` が付いていると、true でも投げます。自動で回すための zone が無いからです。
3. **194〜201 行目**

   集合に足すか抜くかを決め（195・197 行目）、200 行目で覚え、201 行目で 1 回 `detectChanges()` します。ここは同期なので、`autoDetectChanges()` を呼んだ直後に DOM が最新になります。
4. **175〜176 行目**

   引数ありの形は `@deprecated`。「false の使い道は見たことがない。近いのは `changeDetectorRef.detach()`」と書いてあります。

## 6. デモ：autoDetect の決まり方と、誰が更新するか

> **🧪 DEMO — 78〜80 行目、constructor の登録（第 9 回）、187 行目の再現**
>
> 本物の TestBed は使わず、行の条件だけを関数にしています。「スケジューラの tick」は 1019 行目の `_tick`、「TestBed.tick」は 1022〜1023 行目です。zoneless で false の行は、3 節の ng test の結果をそのまま載せています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/testing-auto-detect)

## テストと直し方

📄 `angular/packages/core/test/test_bed_spec.ts` L2529–2553 （▶ の行: 2529, 2533–2534, 2541, 2545, 2547, 2550）

```ts
2529 ▶     describe('with zone change detection', () => {
2530 │       it('should update fixtures with autoDetect', () => {
2531 │         TestBed.configureTestingModule({
2532 │           providers: [
2533 ▶             {provide: ComponentFixtureAutoDetect, useValue: true},
2534 ▶             provideZoneChangeDetection(),
2535 │           ],
2536 │         });
2537 │         const {nativeElement, componentInstance} = TestBed.createComponent(Thing1);
2538 │         expect(nativeElement.textContent).toBe('1');
2539 │ 
2540 │         componentInstance.state.set(2);
2541 ▶         TestBed.tick();
2542 │         expect(nativeElement.textContent).toBe('2');
2543 │       });
2544 │ 
2545 ▶       it('should update fixtures without autoDetect', () => {
2546 │         const {nativeElement, componentInstance} = TestBed.createComponent(Thing1);
2547 ▶         expect(nativeElement.textContent).toBe(''); // change detection didn't run yet
2548 │ 
2549 │         componentInstance.state.set(2);
2550 ▶         TestBed.tick();
2551 │         expect(nativeElement.textContent).toBe('2');
2552 │       });
2553 │     });
```

📄 `angular/packages/core/test/test_bed_spec.ts` L2555–2573 （▶ の行: 2558, 2564, 2569–2571）

```ts
2555 │     describe('with zoneless change detection', () => {
2556 │       beforeEach(() => {
2557 │         TestBed.configureTestingModule({
2558 ▶           providers: [provideZonelessChangeDetection()],
2559 │         });
2560 │       });
2561 │ 
2562 │       it('should update fixtures with zoneless', async () => {
2563 │         const fixture = TestBed.createComponent(Thing1);
2564 ▶         await fixture.whenStable();
2565 │ 
2566 │         const {nativeElement, componentInstance} = fixture;
2567 │         expect(nativeElement.textContent).toBe('1');
2568 │ 
2569 ▶         componentInstance.state.set(2);
2570 ▶         TestBed.tick();
2571 ▶         expect(nativeElement.textContent).toBe('2');
2572 │       });
2573 │     });
```

`describe('TestBed')` の中の `describe('TestBed.tick')`（test\_bed\_spec.ts:2521）です。2533〜2534 行目は zone で autoDetect を true にし、2541 行目の `TestBed.tick()` で更新されることを見ています。2564 行目の `await fixture.whenStable()` で最初の描画を待ち、2570 行目の `TestBed.tick()` で同期に更新されることを確かめています。

> [!NOTE]
> **さらに深く**
>
> 2545 行目の `it('should update fixtures without autoDetect')` は、名前は 2529 行目の `describe('with zone change detection')` の中ですが、この it 自身は providers を足していません （外側の `describe('TestBed')` の beforeEach も `HelloWorldModule` を import するだけです）。だから TestBed の既定どおり zoneless で走り、78 行目で autoDetect は true です。2547 行目で空なのは autoDetect が無いからではなく、スケジューラの tick がまだ来ていないからです。spec の名前と実際の設定がずれている例として、issue や PR を読むときに「その it に何が provide されているか」を確かめる練習になります。

📄 `angular/packages/core/test/component_fixture_spec.ts` L660–671 （▶ の行: 669）

```ts
660 │   it('disallows autoDetect: false', () => {
661 │     @Component({
662 │       template: '{{thing()}}',
663 │     })
664 │     class App {
665 │       thing = signal(1);
666 │     }
667 │ 
668 │     const fixture = TestBed.createComponent(App);
669 ▶     expect(() => fixture.autoDetectChanges(false)).toThrow();
670 │   });
671 │ });
```

zoneless で false を拒む 188 行目の確かめは、`describe('ComponentFixture with zoneless')` の `it('disallows autoDetect: false')`（component\_fixture\_spec.ts:660）の 669 行目です。この it は[第 9 回](09-testing-detect-changes.md)のフィルタでも走ります。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test:test --test_arg=--filter="TestBed.tick" --test_output=all
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
Ran 0 of 1398 specs
0 specs, 0 failures
Ran 1 of 1399 specs
1 spec, 0 failures
Ran 1 of 1399 specs
1 spec, 0 failures
Ran 1 of 1399 specs
1 spec, 0 failures
INFO: Elapsed time: 6.813s, Critical Path: 1.58s
//packages/core/test:test                                                PASSED in 1.5s
```

1. **件数の読み方**

   `"TestBed.tick"` はフルネーム「`TestBed TestBed.tick with ...`」に部分一致します（jasmine のフィルタは正規表現なので `.` は任意の 1 文字ですが、結果は同じです）。4 つの shard に 0 + 1 + 1 + 1 = 3 本。2530・2545・2562 行目の 3 本の it と一致します。1 つの shard が `Ran 0` でも、合計で数えれば問題ありません。
2. **直すとしたら**

   既定の決まり方は `AbstractFixture` の 78〜80 行目、切り替えは `autoDetectChanges`（186 行目）、全部の fixture を回すのは `TestBedImpl.tick`（1013 行目）です。TestBed.tick の振る舞いを変えたら `describe('TestBed.tick')` に、autoDetect の既定なら `component_fixture_spec.ts` の `describe('ComponentFixture with zoneless')` に足すのが入口です。
3. **issue を読むときの手がかり**

   「`ComponentFixtureAutoDetect` を false にしたら zoneless で何も描かれない」「`flushEffects` を消したら壊れた」という話は、3 節の表と 1005 行目でたどれます（[第 20 回](20-testing-issues.md)）。

## 聞かれそうな質問

**Q. zoneless で autoDetect を切れないのはなぜですか？**

188 行目で投げるからです。理由のコメントはソースにありません。ただ、トークンで false を入れたときに起きることは 3 節で見たとおりで、作った直後の通知（第 9 回の 2 節）が無くなり、スケジューラの `_tick` にも相手にされない（1019 行目）ので、ビューを確実に描く道が残りません。止めたい場面には、176 行目のとおり `changeDetectorRef.detach()` が近い代わりです。

**Q. TestBed.tick() と fixture.detectChanges() は何が違いますか？**

zoneless では、どちらも「`includeAllTestViews` を立てて `ApplicationRef.tick()`」（1022〜1025 行目と第 9 回の 3 節）なので、相手のビューは同じ全部の fixture です。違いは `detectChanges` に `checkNoChanges` の引数があることと、zone のとき `detectChanges` は自分のビューだけを見る道に分かれることです（第 9 回の 3 節）。fixture を持っていない場面（サービスや effect だけのテスト）では `TestBed.tick()` を使います。

**Q. flushEffects はなぜ非推奨なのですか？**

1004〜1006 行目のとおり、中身は `this.tick()` だけで、名前が言う「effect だけ」より多くのこと（root effect、ビューの更新、afterRender）をするからです。同じものに正しい名前を付けたのが `TestBed.tick()` で、1002 行目の `@deprecated` がそちらを指しています。置き換えても振る舞いは変わりません。

**Q. autoDetect が true なら whenStable を待たなくてもよいですか？**

いいえ。3 節の表のとおり、`set` の直後は DOM がまだ古いです。autoDetect は「スケジューラが tick を予約する」だけで、tick は非同期に来ます（[zoneless-raf-race](../zoneless/04-zoneless-raf-race.md)）。`await fixture.whenStable()` で待つか、同期に進めたいなら `TestBed.tick()` を呼びます。

## 読み終えて

- autoDetect の既定は `zonelessEnabled ? true : false`（L78）。`ComponentFixtureAutoDetect` が provide されていればそちらが勝つ（L79-80）。
- スケジューラは `_tick` を呼び、旗なしなので autoDetect の fixture だけが自動で更新される（L1019）。
- `TestBed.tick()` は旗を立てた `ApplicationRef.tick()`（L1022-1025）。`flushEffects` はその別名で非推奨（L1004-1006）。
- zoneless で `autoDetectChanges(false)` は投げる（L187-188）。トークンで false にすると、最初の描画の通知が無くなり、ng test では一度も描かれなかった。

---

← 前: [fixture.detectChanges：zoneless では appRef.tick、zone では detectChanges](09-testing-detect-changes.md)  
次: [isStable と whenStable：何を「安定」と呼んで待つのか](11-testing-when-stable.md) →
