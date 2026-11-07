[目次](../README.md) › [テストの内側](README.md) › 第 16 回 / 全 20 回

# zone を使わないテストの時間：whenStable・偽タイマー・zone 依存の道具の境目

> zone.js を読み込まないとき fakeAsync と waitForAsync が返すエラー、zoneless で await fixture.whenStable() が待つ物（描画と PendingTasks）と待たない物（素の setTimeout）、TestBed.tick の役目、Vitest の vi.useFakeTimers が rAF まで偽物にして whenStable を止める理由と進め方。このサイトの ng test（Vitest + jsdom、zone.js なし）で実際に確かめた振る舞い。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/testing-zoneless-time)

---

ここまでの 3 回の道具（`fakeAsync`・`tick`・`flush`・`waitForAsync`）は、どれも zone.js の上に立っていました。v22 の新しいアプリは zone.js を読み込みません（[zoneless-default](../zoneless/01-zoneless-default.md)）。この章では、zone.js が無いときにそれらの道具が何を返すのか、そして代わりに `await fixture.whenStable()`・`TestBed.tick()`・Vitest の `vi.useFakeTimers()`・`PendingTasks` がどこまで時間を扱えるのかを、**このサイトの ng test（Vitest 4.1.11 + jsdom、zone.js なし、@angular/core 22.1.6）で実際に走らせた結果**で確かめます。

読む対象は `packages/core/testing/src/fake_async.ts` の冒頭（12〜42 行目）と `async.ts` の冒頭（25〜34 行目）です。残りは ng test の出力と、それを説明するスケジューラの章へのリンクです。サイトの `@angular/core` は 22.1.6、`../angular` のソースは 22.2.0-next.7 ですが、この章で引く 2 ファイルの該当部分とエラー文はインストール版の `fesm2022/testing.mjs` でも同じでした。

1. [1. 全体像](01-testing-overview.md)
2. [2. initTestEnvironment](02-testing-init-environment.md)
3. [3. 後片付け](03-testing-reset-teardown.md)
4. [4. TestBed.inject](04-testing-inject.md)
5. [5. createComponent](05-testing-create-component.md)
6. [6. 入力の渡し方](06-testing-component-bindings.md)
7. [7. createDirective](07-testing-directive-fixture.md)
8. [8. DebugElement と By](08-testing-debug-element.md)
9. [9. detectChanges](09-testing-detect-changes.md)
10. [10. 自動の変更検知](10-testing-auto-detect.md)
11. [11. whenStable](11-testing-when-stable.md)
12. [12. エラーの伝わり方](12-testing-errors.md)
13. [13. fakeAsync](13-testing-fake-async.md)
14. [14. 偽の時計](14-testing-fake-async-scheduler.md)
15. [15. waitForAsync と ProxyZone](15-testing-wait-for-async.md)
16. **16. zone なしの時間**（この章）
17. [17. effect と signal](17-testing-effects.md)
18. [18. @defer](18-testing-defer.md)
19. [19. RouterTestingHarness](19-testing-router-harness.md)
20. [20. issue と変更を読む](20-testing-issues.md)

## 1. zone.js が無いときの fakeAsync：包む前に投げる

📄 `angular/packages/core/testing/src/fake_async.ts` L12–42 （▶ の行: 12, 14, 17–21, 23, 27, 39–40）

```ts
12 ▶ const _Zone: any = typeof Zone !== 'undefined' ? Zone : null;
13 │ function getFakeAsyncTestModule() {
14 ▶   return _Zone && _Zone[_Zone.__symbol__('fakeAsyncTest')];
15 │ }
16 │ 
17 ▶ function withFakeAsyncTestModule(fn: (fakeAsyncTestModule: any) => any): any {
18 ▶   const fakeAsyncTestModule = getFakeAsyncTestModule();
19 ▶   if (!fakeAsyncTestModule) {
20 ▶     throw new Error(`zone-testing.js is needed for the fakeAsync() test helper but could not be found.
21 ▶         Please make sure that your environment includes zone.js/testing`);
22 │   }
23 ▶   return fn(fakeAsyncTestModule);
24 │ }
25 │ 
26 │ /**
27 ▶  * IMPORTANT: This API requires Zone.js and cannot be used with the Vitest test runner
28 │  *
29 │  * Clears out the shared fake async zone for a test.
30 │  * To be called in a global `beforeEach`.
31 │  *
32 │  * @publicApi
33 │  */
34 │ export function resetFakeAsyncZone(): void {
35 │   withFakeAsyncTestModule((v) => v.resetFakeAsyncZone());
36 │ }
37 │ 
38 │ export function resetFakeAsyncZoneIfExists(): void {
39 ▶   if (getFakeAsyncTestModule() && (Zone as any)['ProxyZoneSpec']?.isLoaded()) {
40 ▶     getFakeAsyncTestModule().resetFakeAsyncZone();
41 │   }
42 │ }
```

1. **12 行目：ファイルを読み込んだ瞬間に Zone を見る**

   `typeof Zone !== 'undefined' ? Zone : null`。zone.js が無ければ `_Zone` は `null` のまま、以後変わりません。**あとから zone.js を読み込んでも、このファイルはもう見ません**。
2. **13〜15 行目：窓口を探す**

   `_Zone` が `null` なら 14 行目は `null`。zone.js はあっても zone.js/testing が無ければ `undefined`。どちらも 19 行目で偽になります。
3. **17〜24 行目：見つからなければ投げる**

   20〜21 行目の `'zone-testing.js is needed for the fakeAsync() test helper but could not be found. Please make sure that your environment includes zone.js/testing'`。`fakeAsync` だけでなく `tick`・`flush`・`flushMicrotasks`・`discardPeriodicTasks`・`resetFakeAsyncZone` も全部これを通るので、**同じ文**になります（「fakeAsync()」と書いてあっても tick から出ることがある）。注意したいのは、`fakeAsync(fn)` が**包みを作る時点で**投げることです（[第 13 回](13-testing-fake-async.md)の 71 行目で窓口を呼ぶので）。`it('...', fakeAsync(...))` と書くと、テストの本体ではなく、spec ファイルを読み込んで `it` を登録するところで落ちます。
4. **38〜42 行目：後片付けからは黙って何もしない**

   `resetFakeAsyncZoneIfExists` は窓口と ProxyZone の両方があるときだけ reset します。`test_hooks.ts` の後片付け（[第 3 回](03-testing-reset-teardown.md)）はこちらを呼ぶので、zone.js が無くてもテストごとの後片付けは落ちません。

## 2. zone.js が無いときの waitForAsync：呼ぶと reject

📄 `angular/packages/core/testing/src/async.ts` L25–34 （▶ の行: 25–31）

```ts
25 ▶ export function waitForAsync(fn: Function): (done: any) => any {
26 ▶   const _Zone: any = typeof Zone !== 'undefined' ? Zone : null;
27 ▶   if (!_Zone) {
28 ▶     return function () {
29 ▶       return Promise.reject(
30 ▶         'Zone is needed for the waitForAsync() test helper but could not be found. ' +
31 ▶           'Please make sure that your environment includes zone.js',
32 │       );
33 │     };
34 │   }
```

こちらは投げません。26 行目で `Zone` を見て、無ければ 28〜32 行目の「呼ぶと `Promise.reject(文字列)` を返す関数」を返します。fakeAsync と違って **包む時点では落ちず、テストを実行したときに失敗します**。reject の値は `Error` ではなく**文字列**です。zone.js はあるが zone.js/testing が無いときの分岐（35 行目から）は[第 15 回](15-testing-wait-for-async.md)で見ました。

## 3. このサイトの ng test で確かめた

確かめ方は、`src/verify-d/time.spec.ts` を置いて `--include` で 1 本だけ走らせ、結果を `throw new Error('PROBE ' + JSON.stringify(r))` で出力に出す、です（Vitest では console.log が出力に出ないため）。全部の it がわざと失敗するので「×」が並びますが、中身は PROBE の JSON です。2 回走らせ、確かめたあとファイルは消しました。

📄 `ターミナル`

```
cd ~/angular-research/angular-deep-dive
npx ng test --watch=false --include src/verify-d/time.spec.ts
```

📄 `確かめた spec（抜粋）`

```
// src/verify-d/time.spec.ts（抜粋。確かめたあと消した）
@Component({ selector: 'v-timer', template: '<p>{{ n() }}</p>' })
class TimerCmp {
  n = signal(1);
  constructor() { setTimeout(() => this.n.set(2), 100); }
}

@Component({ selector: 'v-pending', template: '<p>{{ n() }}</p>' })
class PendingCmp {
  n = signal(1);
  constructor() {
    const done = inject(PendingTasks).add();
    setTimeout(() => { this.n.set(2); done(); }, 100);
  }
}

it('B setTimeout + whenStable (real timers)', async () => {
  const f = TestBed.createComponent(TimerCmp);
  r.afterCreate = text(f);              // ''
  await f.whenStable();
  r.after1stWhenStable = text(f);       // '1'（12ms）
  await new Promise((res) => realSetTimeout(res, 150));
  r.after150msReal = text(f);           // '2'
  throw new Error('PROBE ' + JSON.stringify(r));
});

it('C vi.useFakeTimers + whenStable / TestBed.tick', async () => {
  vi.useFakeTimers();
  const f = TestBed.createComponent(TimerCmp);
  r.whenStableRace = await race(f.whenStable(), 300);  // 本物の 300ms と競走
  TestBed.tick();
  r.afterTestBedTick = text(f);         // '1'
  vi.advanceTimersByTime(100);
  r.afterAdvance100 = text(f);          // '1'
  TestBed.tick();
  r.afterAdvanceThenTick = text(f);     // '2'
  ...
});
```

📄 `出力 1 回目（PROBE の行。2026-11-01 に実行）`

```
× A zone tools without zone.js
× B setTimeout + whenStable (real timers)
× C vi.useFakeTimers + whenStable / TestBed.tick
× D vi.useFakeTimers + advance + whenStable
× E runAllTimersAsync
× F PendingTasks + whenStable (real timers)
× G PendingTasks + fake timers
Error: PROBE {"typeofZone":"undefined","fakeAsyncWrap":"zone-testing.js is needed for the fakeAsync() test helper but could not be found.\n        Please make sure that your environment includes zone.js/testing","tick":"zone-testing.js is needed for the fakeAsync() test helper bu","flush":"zone-testing.js is needed for the fakeAsync() test helper bu","waitForAsyncWrapType":"function","waitForAsyncCall":{"type":"string","value":"Zone is needed for the waitForAsync() test helper but could not be found. Please make sure that your environment includes zone.js"}}
Error: PROBE {"afterCreate":"","isStable0":false,"after1stWhenStable":"1","ms1":12,"isStable1":true,"2ndWhenStable":"resolved","after2ndWhenStable":"1","after150msReal":"2","after150msThenWhenStable":"2"}
Error: PROBE {"afterCreate":"","isStable0":false,"whenStableRace":"timeout 300ms","afterRace":"","afterTestBedTick":"1","isStableAfterTick":true,"afterAdvance100":"1","isStableAfterAdvance":false,"afterAdvanceThenTick":"2"}
Error: PROBE {"afterAdvance100":"1","isStable":false,"whenStableRace":"resolved","afterWhenStable":"2","afterAdvanceAsync20":"2","isStable2":true}
Error: PROBE {"afterRunAll":"2","isStable":true,"fakeNow":true}
Error: PROBE {"afterCreate":"","isStable0":false,"afterWhenStable":"2","ms":106}
Error: PROBE {"raceBeforeAdvance":"timeout 300ms","text0":"","afterAdvanceAsync100":"1","isStable":false,"raceAfter":"timeout 300ms","text1":"1"}
```

📄 `出力 2 回目`

```
× H which globals are faked
× I sync advance then one microtask
× J fake only setTimeout
Error: PROBE {"typeofRaf":"function","setTimeoutFaked":true,"rafFaked":true,"queueMicrotaskFaked":false,"dateFaked":true}
Error: PROBE {"afterAdvance":"1","afterOneMicrotask":"2","isStable":false}
Error: PROBE {"race0":"resolved","ms0":20,"text0":"1","afterAdvance":"1","race1":"resolved","text1":"2"}
```

1 行ずつ読みます。

1. **A：zone 依存の道具**

   `typeof Zone` は `"undefined"`。`fakeAsync(() => {})`・`tick(10)`・`flush()` はどれも 1 節の 20〜21 行目の文で投げました。`waitForAsync(...)` は関数を返し（`"function"`）、それを呼ぶと 2 節の 29〜30 行目の**文字列**で reject されました（`"type":"string"`）。
2. **B：setTimeout で signal を変えるコンポーネントを whenStable で待つ（本物のタイマー）**

   `createComponent` 直後は空、`await whenStable()` は 12ms で resolve して表示は `1`。**100ms の setTimeout は待ちませんでした**。本物の時間で 150ms 待つと `2` になっていました。signal の変更がスケジューラに通知され、自動で描画されたからです（[第 10 回](10-testing-auto-detect.md)）。
3. **F：PendingTasks を使うと whenStable が待つ**

   コンストラクタで `inject(PendingTasks).add()` し、setTimeout の中で `done()` を呼ぶと、`await whenStable()` は 106ms かかり、表示は `2` でした。zoneless の `whenStable` が見ているのは `PendingTasks` だけだからです（中身は[第 11 回](11-testing-when-stable.md)、PendingTasks は[zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md)）。
4. **C：vi.useFakeTimers() のあと、whenStable は返ってこない**

   偽タイマーにしてから `createComponent` すると、`whenStable()` は本物の 300ms 待っても resolve しませんでした（`"timeout 300ms"`）。`TestBed.tick()` を呼ぶと同期で `1` が描かれ、`isStable()` は `true`。`vi.advanceTimersByTime(100)` でコンポーネントの setTimeout を進めても表示は `1` のまま（`isStable()` は `false`）で、もう一度 `TestBed.tick()` すると `2` でした。
5. **H：何が偽物になっていたか**

   jsdom には `requestAnimationFrame` があり、`vi.useFakeTimers()` は `setTimeout`・`requestAnimationFrame`・`Date` を偽物にし、`queueMicrotask` はそのままでした。zoneless のスケジューラは「`setTimeout` と `requestAnimationFrame` の早いほう」で描画を予約するので（[zoneless-raf-race](../zoneless/04-zoneless-raf-race.md)）、**両方が偽物だと描画の予約が本物の時間では来ません**。予約のあいだは `PendingTasks` に 1 つ載っている（[zoneless-notify](../zoneless/03-zoneless-notify.md)）ので、`whenStable` は C のように待ち続けます。
6. **J：setTimeout だけを偽物にすると whenStable は返る**

   `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` にすると、`whenStable()` は 20ms で resolve しました（本物の rAF が先に来る）。`await vi.advanceTimersByTimeAsync(100)` でコンポーネントの setTimeout を進めたあと、もう一度 `whenStable()` で `2` になりました。
7. **D と I：同期で一気に進めると、続きがマイクロタスクで描かれる**

   `createComponent` の直後に**同期の**`vi.advanceTimersByTime(100)` を呼ぶと、最初の描画（偽の setTimeout）と 100ms のコンポーネントの setTimeout が続けて走り、表示は `1`。ここで `await Promise.resolve()` を 1 回挟むだけで `2` になりました（I）。D でも `whenStable()` が resolve しています。描画の直後 1 マイクロタスクの間に来た通知は、rAF / setTimeout ではなくマイクロタスクで次の描画を予約する仕組みがあるからです（[zoneless-microtask](../zoneless/06-zoneless-microtask.md)）。`queueMicrotask` は偽物になっていないので、この描画だけは進みます。G のように `await vi.advanceTimersByTimeAsync(100)`（途中で await を挟む）にすると、その 1 マイクロタスクの窓が過ぎてから通知されるので、また偽の rAF / setTimeout で予約され、`whenStable` は返りませんでした。
8. **E：vi.runAllTimersAsync() は全部進める**

   adev の例と同じ `await vi.runAllTimersAsync()` は、描画の予約もコンポーネントの setTimeout も全部進め、表示は `2`、`isStable()` は `true` でした。`Date.now()` も偽の時刻（`vi.getMockedSystemTime()` と同じ）でした。

## 4. zone あり / なしの表

この章と第 13〜15 回で**実際に走らせて確かめた**ことだけを書きます。空欄の代わりに「確かめていない」と書いた所は、この調査では走らせていません。

| 道具 | zone.js あり（../angular の bazel、jasmine） | zone.js なし（このサイトの ng test、Vitest + jsdom） |
| --- | --- | --- |
| `fakeAsync` | 動く（第 13 回の 34 本） | 包む時点で投げる（A） |
| `tick` / `flush` | 動く（第 14 回の 17 本） | 同じ文で投げる（A） |
| `waitForAsync` | 動く（第 15 回の 6 本） | 呼ぶと文字列で reject（A） |
| `await fixture.whenStable()` | setTimeout も待つ spec がある（下の component\_fixture\_spec.ts:251）。走らせていない | 描画は待つ。setTimeout は待たない（B）。PendingTasks は待つ（F） |
| `TestBed.tick()` | 確かめていない | 同期で描画する。偽タイマーの中でも効く（C） |
| `vi.useFakeTimers()` | 確かめていない | 既定では whenStable が返らなくなる（C・G）。`runAllTimersAsync` か `TestBed.tick()` で進める（E・C）。`toFake` を setTimeout だけにすると whenStable も返る（J） |

### zone ありの whenStable が setTimeout を待つ spec

📄 `angular/packages/core/test/component_fixture_spec.ts` L130–144 （▶ の行: 139–142）

```ts
130 │ @Component({
131 │   selector: 'async-timeout-comp',
132 │   template: `<span (click)="click()">{{ text }}</span>`,
133 │   standalone: false,
134 │   changeDetection: ChangeDetectionStrategy.Eager,
135 │ })
136 │ class AsyncTimeoutComp {
137 │   text: string = '1';
138 │ 
139 ▶   click() {
140 ▶     setTimeout(() => {
141 ▶       this.text += '1';
142 ▶     }, 10);
143 │   }
144 │ }
```

📄 `angular/packages/core/test/component_fixture_spec.ts` L251–270 （▶ の行: 252–253, 259, 264–265, 267）

```ts
251 │   it(
252 ▶     'should wait for macroTask(setTimeout) while checking for whenStable ' + '(autoDetectChanges)',
253 ▶     waitForAsync(() => {
254 │       const componentFixture = TestBed.createComponent(AsyncTimeoutComp);
255 │       componentFixture.autoDetectChanges();
256 │       expect(componentFixture.nativeElement).toHaveText('1');
257 │ 
258 │       const element = componentFixture.debugElement.children[0];
259 ▶       dispatchEvent(element.nativeElement, 'click');
260 │       expect(componentFixture.nativeElement).toHaveText('1');
261 │ 
262 │       // Component is updated asynchronously. Wait for the fixture to become
263 │       // stable before checking for new value.
264 ▶       expect(componentFixture.isStable()).toBe(false);
265 ▶       componentFixture.whenStable().then((waited) => {
266 │         expect(waited).toBe(true);
267 ▶         expect(componentFixture.nativeElement).toHaveText('11');
268 │       });
269 │     }),
270 │   );
```

この it が入っている `describe('ComponentFixture')`（component\_fixture\_spec.ts:164）は `beforeEach` で `provideZoneChangeDetection()` を渡しています。264〜267 行目、zone ありでは click の中の 10ms の setTimeout が終わるまで `whenStable` が待ち、`11` を確かめています。NgZone はマクロタスクが残っている間は stable にならないからです（[zone-ngzone-stability](../zone/10-zone-ngzone-stability.md)）。B の結果と並べると、**同じ `whenStable` が、zone ありでは setTimeout を待ち、zoneless では待たない**ことが分かります。

## 5. adev が書いていること

📄 `angular/adev/src/content/guide/testing/components-scenarios.md` L440–449 （▶ の行: 445, 447, 449）

```md
440 │ 
441 │ Then you can assert that the quote element displays the expected text.
442 │ 
443 │ ### Async tests with `zone.js` and `fakeAsync`
444 │ 
445 ▶ The `fakeAsync` helper function is another mock clock that relies on patching asynchronous APIs with `zone.js`. It was commonly used in `zone.js` based applications for testing. The use of `fakeAsync` is no longer recommended.
446 │ 
447 ▶ TIP: Prefer using native async testing strategies or other fake timers (also called mock clocks) like those from Vitest or Jasmine.
448 │ 
449 ▶ IMPORTANT: `fakeAsync` cannot be used with the Vitest test runner as no `zone.js` patch is applied for this runner.
```

445 行目で fakeAsync は「もう勧めない」、447 行目で「ネイティブの async か、Vitest や Jasmine の偽タイマーを」、449 行目で「Vitest では zone.js のパッチが当たらないので使えない」と書いています。ただし[第 15 回](15-testing-wait-for-async.md)で見たとおり、同じ adev の `migrating-to-vitest.md` は `zone.js/plugins/vitest-patch` を polyfills に足せば使えると書いています。449 行目は「CLI が既定で入れる物だけでは」と読むのが、ソースと合う読み方です。

> **🧪 DEMO — このページの上で appRef.whenStable() を待つ**
>
> このサイトは zone.js なしの zoneless アプリです。`fixture.whenStable()` が最後に待つ `ApplicationRef.whenStable()` を、本物の setTimeout（100ms）と一緒にページの上で呼び、何 ms で resolve したかを出します。TestBed は使っていません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/testing-zoneless-time)

## ここまでの呼び出し

- 👤 `it('...', fakeAsync(fn))` — あなたの spec（zone.js なし）
  - `withFakeAsyncTestModule(...)` — core/testing/src/fake\_async.ts L17 — *\_Zone は L12 で null*
    - `throw new Error('zone-testing.js is needed ...')` — L20-21 — *it を登録する時点で落ちる*
- 👤 `await fixture.whenStable()` — あなたの spec（zoneless）
  - `isStable() / appRef.whenStable()` — core/testing/src/fixture.ts（第 11 回） — *PendingTasks だけを見る*
    - `ChangeDetectionSchedulerImpl.notify` — （zoneless-notify） — *描画の予約のあいだ PendingTasks に 1 つ*
      - `scheduleCallbackWithRafRace` — （zoneless-raf-race） — *setTimeout と rAF。偽タイマーだと来ない*

## テストと直し方

1. **手元で確かめるのは ng test**

   この章の主題は「zone.js の無い環境」なので、確かめる場所は zone.js を読み込む `../angular` の bazel ではなく、読者の手元と同じ ng test です。3 節のコマンドで 7 本 + 3 本（2 回目）を走らせ、PROBE の値は 3 節の出力のとおりでした。`--include` を付けないと他の spec まで走ります。
2. **本体の spec の場所**

   zone ありで whenStable が setTimeout を待つことは 4 節の `component_fixture_spec.ts` の `should wait for macroTask(setTimeout) while checking for whenStable (autoDetectChanges)`（:251）、zoneless の fixture は同じファイルの `describe('ComponentFixture with zoneless')`（:581）です。この章のためには bazel で走らせていません（各回 4 本までの約束で、第 13〜15 回に使いました）。`../angular` の Node のテストは zone.js を読み込む（[第 15 回](15-testing-wait-for-async.md)の `zone_base_setup.mts`）ので、「zone.js が無いとき」の 1 節・2 節の分岐は、そこでは通りません。
3. **直すとしたら**

   エラー文や判定は `fake_async.ts` の `withFakeAsyncTestModule` と `async.ts` の `waitForAsync` です。偽タイマーとスケジューラの関係は `packages/core/src/util/callback_scheduler.ts` と `zoneless_scheduling_impl.ts` で、Angular 側の変更になります。どちらも、本家に出す前に、この章の C・I のような小さな spec で今の振る舞いを手元に固定してから読みます。

## 聞かれそうな質問

**Q. zoneless に移ったら、fakeAsync のテストはどうすればいいですか？**

zone.js を外すと 1 節の 12 行目で `_Zone` が `null` になり、`fakeAsync` は包む時点で投げます（A）。選べる道は 2 つです。1 つは test の polyfills にだけ zone.js を残す（CLI の判断は [cli-unit-test](../cli/12-cli-unit-test.md)、Vitest なら vitest-patch も。第 15 回）。もう 1 つは書き換えで、setTimeout を待ちたい所は `vi.useFakeTimers()` + `await vi.runAllTimersAsync()`（E）か、時間を進めてから `TestBed.tick()`（C）にします。adev の 447 行目が勧めるのも後者です。

**Q. zoneless のテストで setTimeout を待ちたいときは？**

`await fixture.whenStable()` だけでは待てません（B）。zoneless の whenStable は PendingTasks しか見ないからです。テストの側で時間を進めるなら Vitest の偽タイマー（E・C）。コンポーネントの側で「これが終わるまで stable ではない」と示すなら `PendingTasks.add()` / `run()` を使い、そうすれば whenStable が待ちます（F、106ms）。後者はアプリの SSR の安定判定にも効くので、テストのためだけの書き換えではありません（[zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md)）。

**Q. Vitest の偽タイマーと Angular のスケジューラは喧嘩しませんか？**

既定の `vi.useFakeTimers()` では喧嘩します。jsdom の `requestAnimationFrame` も偽物になる（H）ので、スケジューラの描画の予約が本物の時間では来ず、`whenStable()` が返りません（C）。避け方は確かめた範囲で 3 つです。`await vi.runAllTimersAsync()` で描画の予約ごと進める（E）、時間を進めたあと `TestBed.tick()` で同期に描く（C）、`toFake` を `['setTimeout', 'clearTimeout']` に絞って rAF を本物に残す（J）。同期の `advanceTimersByTime` のあとに 1 回 await するだけで描かれる場合がある（D・I）のは、描画直後の通知がマイクロタスクで予約されるからで、いつもそうなるわけではありません（G）。

**Q. waitForAsync を zone.js なしで呼ぶと、なぜテストの外ではなく中で落ちるのですか？**

2 節の 27〜33 行目が投げずに「reject する関数」を返すからです。`it` を登録するときは関数が返るだけで、テストを実行したときにその Promise が文字列で reject されます（A の `"type":"string"`）。fakeAsync は 1 節の 19〜21 行目で包む時点で投げるので、spec ファイルを読み込むところで落ちます。

## 読み終えて

- zone.js が無いと、`fakeAsync`・`tick`・`flush` は同じ「zone-testing.js is needed」で投げる。fakeAsync は包む時点で投げる（fake\_async.ts 12・19〜21 行目）。
- `waitForAsync` は投げずに、呼ぶと文字列で reject する関数を返す（async.ts 26〜33 行目）。
- zoneless の `whenStable` は描画と PendingTasks は待つが、素の setTimeout は待たない。zone ありの spec（component\_fixture\_spec.ts:251）とは逆。
- 既定の `vi.useFakeTimers()` は setTimeout と rAF の両方を偽物にするので、描画の予約が進まず whenStable が返らない。`runAllTimersAsync`・`TestBed.tick()`・`toFake` の絞り込みで進める。

---

← 前: [waitForAsync と ProxyZone：zone.js/testing が jasmine に入れるもの](15-testing-wait-for-async.md)  
次: [テストの中の effect と signal：TestBed.tick で何が流れるか](17-testing-effects.md) →
