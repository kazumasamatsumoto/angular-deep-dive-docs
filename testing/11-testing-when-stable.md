[目次](../README.md) › [テストの内側](README.md) › 第 11 回 / 全 20 回

# isStable と whenStable：何を「安定」と呼んで待つのか

> isStable が PendingTasksInternal の hasPendingTasks を読むだけであること、whenStable が appRef.whenStable を待ち、その間に起きたエラーで Promise を reject する仕組み（whenStableRejectFunctions）、whenRenderingDone。HttpClient や Router が PendingTasks を足すので await fixture.whenStable() で待てる理由。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/testing-when-stable)

---

zoneless のテストでは `await fixture.whenStable()` が「待つ」ための基本の 1 行です。この章では、**`isStable()` が保留中のタスク（PendingTasks）の有無を読むだけ**であること、`whenStable()` が返す `true` / `false` の意味、待っている間に起きたエラーで Promise が reject される仕組み、そして何を待って何を待たないか（setTimeout は待たない）を、行と ng test の結果で確かめます。

読む対象は `packages/core/testing/src/fixture.ts`・`packages/core/src/application/application_ref.ts`・`packages/core/src/pending_tasks_internal.ts`、確かめる spec は `packages/core/test/acceptance/pending_tasks_spec.ts` と `component_fixture_spec.ts` です。

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
11. **11. whenStable**（この章）
12. [12. エラーの伝わり方](12-testing-errors.md)
13. [13. fakeAsync](13-testing-fake-async.md)
14. [14. 偽の時計](14-testing-fake-async-scheduler.md)
15. [15. waitForAsync と ProxyZone](15-testing-wait-for-async.md)
16. [16. zone なしの時間](16-testing-zoneless-time.md)
17. [17. effect と signal](17-testing-effects.md)
18. [18. @defer](18-testing-defer.md)
19. [19. RouterTestingHarness](19-testing-router-harness.md)
20. [20. issue と変更を読む](20-testing-issues.md)

## 1. isStable と whenStable

[spec の読み方の章](../contrib/06-contrib-reading-specs.md)と [harness の章](../cdk/20-harness.md)でも短く見た範囲です。ここが主題なので、1 行ずつ追います。

📄 `angular/packages/core/testing/src/fixture.ts` L204–230 （▶ の行: 209, 219–220, 223–227）

```ts
204 │   /**
205 │    * Return whether the fixture is currently stable or has async tasks that have not been completed
206 │    * yet.
207 │    */
208 │   isStable(): boolean {
209 ▶     return !this.pendingTasks.hasPendingTasks;
210 │   }
211 │ 
212 │   /**
213 │    * Get a promise that resolves when the fixture is stable.
214 │    *
215 │    * This can be used to resume testing after events have triggered asynchronous activity or
216 │    * asynchronous change detection.
217 │    */
218 │   whenStable(): Promise<any> {
219 ▶     if (this.isStable()) {
220 ▶       return Promise.resolve(false);
221 │     }
222 │ 
223 ▶     return new Promise((resolve, reject) => {
224 ▶       this.appErrorHandler.whenStableRejectFunctions.add(reject);
225 ▶       this._appRef.whenStable().then(() => {
226 ▶         this.appErrorHandler.whenStableRejectFunctions.delete(reject);
227 ▶         resolve(true);
228 │       });
229 │     });
230 │   }
```

1. **209 行目 isStable**

   `PendingTasksInternal` の `hasPendingTasks` を反転して返すだけです。DOM もビューの汚れも見ていません。「安定」とは**保留中のタスクが 0 件**のことです。
2. **219〜221 行目 すでに安定なら false**

   いま安定していれば、`Promise.resolve(false)` をすぐ返します。`false` は「待つものが無かった」という意味です。
3. **223〜229 行目 待つときは true**

   224 行目で、この Promise の `reject` を `TestBedApplicationErrorHandler` の `whenStableRejectFunctions` に登録します（使われ方は 4 節と[第 12 回](12-testing-errors.md)）。225 行目で `ApplicationRef.whenStable()` を待ち、解決したら 226 行目で登録を外して、227 行目で `true` で resolve します。`true` は「待ってから安定した」です。

## 2. 「保留中のタスク」の正体

📄 `angular/packages/core/src/pending_tasks_internal.ts` L20–30 （▶ の行: 22, 24, 27, 29）

```ts
20 │ export class PendingTasksInternal implements OnDestroy {
21 │   private taskId = 0;
22 ▶   private pendingTasks = new Set<number>();
23 │   private destroyed = false;
24 ▶   private pendingTask = new BehaviorSubject<boolean>(false);
25 │   private debugTaskTracker = inject(DEBUG_TASK_TRACKER, {optional: true});
26 │ 
27 ▶   get hasPendingTasks(): boolean {
28 │     // Accessing the value of a closed `BehaviorSubject` throws an error.
29 ▶     return this.destroyed ? false : this.pendingTask.value;
30 │   }
```

22 行目の `Set<number>` がタスクの番号、24 行目の `BehaviorSubject<boolean>` が「1 件以上あるか」です。29 行目の `hasPendingTasks` は、その今の値を読むだけです。`add` / `remove` で 0 件と 1 件の境目をまたいだときに Subject が流れる仕組みは [zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md) で読みました。

タスクを足すのは、たとえば次のものです。どれも「終わるまでアプリは安定していない」と宣言します。

- `ChangeDetectionSchedulerImpl`：通知を受けて tick を予約してから、tick が終わるまで（[zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md)）。
- `HttpClient`：`HttpInterceptorHandler.handle` がリクエストごとに `PendingTasks.add()` し、`finalize` で外す（同じ章）。
- `Router`：ナビゲーションの間（[router-initial-navigation](../router/06-router-initial-navigation.md)）。
- あなたのコード：公開 API の `PendingTasks.add()` / `run()`。

## 3. ApplicationRef.whenStable

📄 `angular/packages/core/src/application/application_ref.ts` L335–351 （▶ の行: 338, 341, 343–344, 348–349）

```ts
335 │   /**
336 │    * @returns A promise that resolves when the application becomes stable
337 │    */
338 ▶   whenStable(): Promise<void> {
339 │     let subscription: Subscription;
340 │     return new Promise<void>((resolve) => {
341 ▶       subscription = this.isStable.subscribe({
342 │         next: (stable) => {
343 ▶           if (stable) {
344 ▶             resolve();
345 │           }
346 │         },
347 │       });
348 ▶     }).finally(() => {
349 ▶       subscription.unsubscribe();
350 │     });
351 │   }
```

341 行目で `isStable`（`hasPendingTasksObservable` を `!pending` に map したもの。[zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md)）を購読し、343〜344 行目で最初に `true` が来たら resolve、348〜349 行目で購読をやめます。`BehaviorSubject` なので購読した瞬間に今の値が来ます。fixture の 219 行目が先に安定を確かめているのは、すでに安定ならこの購読を作らずに済ませるためです。

## 4. このサイトの ng test で確かめる

このサイトの ng test（Vitest + jsdom、zone.js なし、`@angular/core` 22.1.6）の結果です。

| やったこと | 結果 | 理由（行） |
| --- | --- | --- |
| 描画が済んで何も無いときに `isStable()` / `await whenStable()` | true / **false** | 209 行目、220 行目 |
| `TestBed.inject(PendingTasks).add()` の直後の `isStable()` | false | タスクが 1 件（29 行目） |
| その状態で `whenStable()` を呼び、30ms 待つ | 解決しない | 343 行目の true が来ない |
| タスクを外した直後の `isStable()` | まだ false。そのあと `whenStable()` は **true** で解決 | 外したことをスケジューラに通知し、スケジューラが次の tick まで自分のタスクを持つ（[zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md)） |
| `appRef.isStable` を購読して add → remove → whenStable | `[true, false, true]` | 境目をまたいだときだけ流れる |
| `ngOnInit` で `setTimeout(..., 20)` するコンポーネントで `await whenStable()` | true で解決した時点でタイマーは**まだ走っていない**。40ms 後に走り、`isStable()` は true | setTimeout はタスクを足さない |
| `PendingTasks.run(async () => { throw ... })` のあと `await whenStable()` | reject（`boom in run`） | run のエラーは `INTERNAL_APPLICATION_ERROR_HANDLER` へ行き、224 行目で登録した reject が呼ばれる |
| `ngOnInit` で投げるコンポーネントを作って `await whenStable()` | reject（`boom in ngOnInit`） | スケジューラの tick の中のエラーも同じ道（[第 12 回](12-testing-errors.md)） |
| `RendererFactory2` の `whenRenderingDone` | `undefined` | 5 節。`whenRenderingDone()` は `whenStable()` と同じ |

> [!WARNING]
> **ハマりどころ**
>
> zoneless の `whenStable()` は setTimeout も Promise も「見て」いません。見ているのは PendingTasks の件数だけです。zone のときに `whenStable` がタイマーを待てたのは、`ZoneStablePendingTask`（ng\_zone\_scheduling.ts）が、zone にマクロタスク（タイマーなど）が残っている間 PendingTasks のタスクを持ち続けるからです（[zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md)）。zoneless で時間を進める方法は[第 16 回](16-testing-zoneless-time.md)で扱います。

## 5. whenRenderingDone

📄 `angular/packages/core/testing/src/fixture.ts` L232–248 （▶ の行: 233–234, 244–245, 247）

```ts
232 │   private _getRenderer() {
233 ▶     if (this._renderer === undefined) {
234 ▶       this._renderer = this.hostRef.injector.get(RendererFactory2, null);
235 │     }
236 │     return this._renderer as RendererFactory2 | null;
237 │   }
238 │ 
239 │   /**
240 │    * Get a promise that resolves when the ui state is stable following animations.
241 │    */
242 │   whenRenderingDone(): Promise<any> {
243 │     const renderer = this._getRenderer();
244 ▶     if (renderer && renderer.whenRenderingDone) {
245 ▶       return renderer.whenRenderingDone();
246 │     }
247 ▶     return this.whenStable();
248 │   }
```

233〜235 行目で、host の injector から `RendererFactory2` を 1 回だけ取って覚えます。244〜245 行目で、その RendererFactory2 が `whenRenderingDone` を持っていればそれを待ち、無ければ 247 行目で `whenStable()` に落ちます。ng test では `whenRenderingDone` は `undefined` だったので、このサイトの環境では `whenStable()` と同じです。

## 6. 呼び出しの連なり

- 👤 `await fixture.whenStable()` — あなたの spec
  - `isStable()` — fixture.ts L208 — *!hasPendingTasks（L209）。true なら Promise.resolve(false)*
  - `whenStableRejectFunctions.add(reject)` — fixture.ts L224
  - `ApplicationRef.whenStable()` — application\_ref.ts L338
    - `isStable.subscribe(...)` — application\_ref.ts L341 — *PendingTasksInternal の BehaviorSubject（pending\_tasks\_internal.ts L24）*
      - `（スケジューラの tick が終わり、最後のタスクが外れる）` — zoneless\_scheduling\_impl.ts
    - `resolve()` — application\_ref.ts L344
  - `whenStableRejectFunctions.delete(reject); resolve(true)` — fixture.ts L226-227

## 7. デモ：本物の PendingTasks と ApplicationRef.isStable

> **🧪 DEMO — このページのアプリで PendingTasks を足し引きする**
>
> これは再現ではなく、このサイト自身の `ApplicationRef` と `PendingTasks`（`@angular/core` の公開 API）です。isStable は購読し続けず、操作の 50ms 後に 1 回だけ今の値を読みます（購読して画面に出し続けると、その描画のための tick がまた isStable を揺らすからです）。タスクを持ったままこのページを離れると、ページのコンポーネントが壊れるときに全部外します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/testing-when-stable)

タスクを 2 つ足して「whenStable を待つ」を押すと、1 つ外しても解決せず、50ms 後の isStable も `false` のままです。2 つ目を外すと解決が記録され、isStable は `true` になります。ボタンを押すこと自体もリスナーの通知でスケジューラにタスクを足させるので（[zoneless-listener-path](../zoneless/08-zoneless-listener-path.md)）、押した瞬間の値ではなく 50ms 後の値を読んでいます。

## テストと直し方

📄 `angular/packages/core/test/acceptance/pending_tasks_spec.ts` L70–96 （▶ の行: 75–80, 83–84, 92–93, 95）

```ts
70 │ describe('public PendingTasks', () => {
71 │   it('should allow adding and removing tasks influencing stability', async () => {
72 │     const appRef = TestBed.inject(ApplicationRef);
73 │     const pendingTasks = TestBed.inject(PendingTasks);
74 │ 
75 ▶     const removeTaskA = pendingTasks.add();
76 ▶     await expectAsync(applicationRefIsStable(appRef)).toBeResolvedTo(false);
77 ▶     removeTaskA();
78 ▶     // stability is delayed until a tick happens
79 ▶     await expectAsync(applicationRefIsStable(appRef)).toBeResolvedTo(false);
80 ▶     TestBed.inject(ApplicationRef).tick();
81 │     // Stability is not synchronous after a tick. We wait for a microtask
82 │     // in case there is a Promise inside tick that requires tick again
83 ▶     await Promise.resolve();
84 ▶     await expectAsync(applicationRefIsStable(appRef)).toBeResolvedTo(true);
85 │   });
86 │ 
87 │   it('should allow blocking stability with run', async () => {
88 │     const appRef = TestBed.inject(ApplicationRef);
89 │     const pendingTasks = TestBed.inject(PendingTasks);
90 │ 
91 │     const {promise, resolve} = Promise.withResolvers<void>();
92 ▶     pendingTasks.run(() => promise);
93 ▶     await expectAsync(applicationRefIsStable(appRef)).toBeResolvedTo(false);
94 │     resolve();
95 ▶     await expectAsync(TestBed.inject(ApplicationRef).whenStable()).toBeResolved();
96 │   });
```

`describe('public PendingTasks')`（pending\_tasks\_spec.ts:70）です。75〜76 行目で足すと不安定、77〜79 行目で**外しても tick までは不安定**（78 行目のコメント）、80 行目で tick して 83 行目でマイクロタスク 1 つ待つと 84 行目で安定、を確かめています。4 節の表の 4 段目と同じことを、スケジューラを待たずに tick で進めています。92〜95 行目は `run` の Promise が終わるまで安定しないことです。

📄 `angular/packages/core/test/component_fixture_spec.ts` L628–640 （▶ の行: 634, 639）

```ts
628 │   it('rejects whenStable promise when errors happen during detectChanges', async () => {
629 │     @Component({
630 │       template: '',
631 │     })
632 │     class App {
633 │       ngOnInit() {
634 ▶         throw new Error();
635 │       }
636 │     }
637 │ 
638 │     const fixture = TestBed.createComponent(App);
639 ▶     await expectAsync(fixture.whenStable()).toBeRejected();
640 │   });
```

`describe('ComponentFixture with zoneless')` の `it('rejects whenStable promise when errors happen during detectChanges')`（:628）。634 行目で投げ、639 行目で `whenStable()` が reject されることを見ています。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test:test --test_arg=--filter="PendingTasks" --test_output=all
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
Ran 3 of 1391 specs
3 specs, 0 failures
Ran 3 of 1391 specs
3 specs, 0 failures
Ran 4 of 1392 specs
4 specs, 0 failures
Ran 3 of 1391 specs
3 specs, 0 failures
INFO: Elapsed time: 2.461s, Critical Path: 1.61s
//packages/core/test:test                                                PASSED in 1.5s
```

1. **件数の読み方**

   `"PendingTasks"` で 3 + 3 + 4 + 3 = 13 本が 4 つの shard に分かれて走りました。pending\_tasks\_spec.ts の `describe('PendingTasks')`（:16）と `describe('public PendingTasks')`（:70）の 8 本のほかに、`testability/testability_spec.ts` の `describe('Testability with PendingTasks')`（:122）と `describe('Testability with PendingTasks disabled')`（:312）も名前に一致します。`--filter` は部分一致なので、狙ったファイルの外も拾うことがあります。
2. **直すとしたら**

   fixture 側は `AbstractFixture.isStable` / `whenStable`（fixture.ts 208・218 行目）、待つ相手は `ApplicationRef.whenStable`（338 行目）、件数は `PendingTasksInternal` です。fixture の振る舞いなら `component_fixture_spec.ts`、PendingTasks なら `pending_tasks_spec.ts` に足すのが入口です。
3. **issue を読むときの手がかり**

   「whenStable が永遠に解決しない」は誰かがタスクを外していない、「whenStable がすぐ解決して値が古い」はタスクを足さない非同期（setTimeout など）、で多くが説明できます。手元では 4 節の表の形で `isStable()` を並べて記録すると切り分けられます（[第 20 回](20-testing-issues.md)）。

## 聞かれそうな質問

**Q. whenStable() が返す true と false は何を意味しますか？**

`false` は「呼んだ時点で安定していて、何も待たなかった」（219〜220 行目）、`true` は「不安定だったので待ち、安定した」（227 行目）です。どちらも「いまは安定している」ことに変わりはありません。テストでは値を確かめずに `await` だけすることがほとんどです。

**Q. whenStable は setTimeout を待ってくれますか？**

zoneless では待ちません。209 行目のとおり見ているのは PendingTasks だけで、setTimeout はタスクを足さないからです。ng test で、`ngOnInit` の 20ms のタイマーより先に `whenStable()` が true で解決しました。タイマーを待ちたいなら、テストの側で時間を進めるか待つ必要があります（[第 16 回](16-testing-zoneless-time.md)）。

**Q. HttpClient の応答を whenStable で待てるのはなぜですか？**

`HttpInterceptorHandler.handle` がリクエストを始めるときに `PendingTasks.add()` し、Observable が終わるときに `finalize` で外すからです（[zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md)）。タスクがある間は 209 行目が false なので、225 行目で待ちます。ただし `provideHttpClientTesting()` では応答はテストが `flush` するまで来ないので（[http-testing](../http/12-http-testing.md)）、flush の前に `await whenStable()` すると終わりません。

**Q. 待っている間にエラーが起きるとどうなりますか？**

224 行目で登録した `reject` が呼ばれて、`await` が投げます（ng test で `run` のエラーと `ngOnInit` のエラーで確かめた）。誰がこの関数を呼ぶかは[第 12 回](12-testing-errors.md)で、`application_error_handler.ts` の 33〜37 行目です。

## 読み終えて

- `isStable()` は `!pendingTasks.hasPendingTasks`（L209）。安定 = PendingTasks が 0 件。
- `whenStable()` は安定なら `false` をすぐ返し（L220）、そうでなければ `ApplicationRef.whenStable()` を待って `true`（L225-227）。
- 待っている間のエラーは、L224 で登録した reject で Promise を失敗させる。
- スケジューラ・HttpClient・Router はタスクを足すので待てる。setTimeout は足さないので待てない。

---

← 前: [自動の変更検知：autoDetect が zoneless で既定になる理由と TestBed.tick](10-testing-auto-detect.md)  
次: [エラーがテストの失敗になるまで：TestBedApplicationErrorHandler](12-testing-errors.md) →
