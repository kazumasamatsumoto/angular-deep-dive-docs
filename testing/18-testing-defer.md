[目次](../README.md) › [テストの内側](README.md) › 第 18 回 / 全 20 回

# @defer のテスト：DeferBlockBehavior と DeferBlockFixture

> deferBlockBehavior（Playthrough が既定、Manual）が DEFER\_BLOCK\_CONFIG としてテストモジュールに入る行、fixture.getDeferBlocks が LView から defer ブロックを集める仕組み、DeferBlockFixture.render が状態のテンプレートの有無を確かめ、Complete なら依存を読み込み、タイマーを飛ばして描く手順、入れ子の getDeferBlocks。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/testing-defer)

---

`@defer` のブロックは、本物のアプリではトリガー（クリック、画面に入る、時間がたつ…）を待って状態が移ります。テストでは「トリガーを本当に起こす」（`Playthrough`）か、「トリガーを無視して、見たい状態をテストから描く」（`Manual`）かを選べます。この章では、その選択がどの行でテストモジュールに入り、`fixture.getDeferBlocks()` と `DeferBlockFixture.render()` が中で何をしているかを 1 ステップずつ追います。

読む対象は `packages/core/testing/src/defer.ts`、`fixture.ts` の `getDeferBlocks`、`packages/core/src/defer/discovery.ts`・`rendering.ts`・`triggering.ts` です。@defer の状態機械そのものは [defer](../template/03-defer.md) の章で読みました。

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
16. [16. zone なしの時間](16-testing-zoneless-time.md)
17. [17. effect と signal](17-testing-effects.md)
18. **18. @defer**（この章）
19. [19. RouterTestingHarness](19-testing-router-harness.md)
20. [20. issue と変更を読む](20-testing-issues.md)

## 1. 既定は Playthrough、それが DEFER\_BLOCK\_CONFIG になる

📄 `angular/packages/core/testing/src/test_bed_common.ts` L23–25 （▶ の行: 25）

```ts
23 │ 
24 │ /** Whether defer blocks should use manual triggering or play through normally. */
25 ▶ export const DEFER_BLOCK_DEFAULT_BEHAVIOR = DeferBlockBehavior.Playthrough;
```

25 行目、既定は `DeferBlockBehavior.Playthrough`（トリガーが来たら本当に進む）です。`configureTestingModule({ deferBlockBehavior: DeferBlockBehavior.Manual })` と書くと、`TestBedImpl` が 610 行目でテストごとの値として覚え（`getDeferBlockBehavior()` は 967〜968 行目でそれを返すだけ）、`TestBedCompiler` も 238 行目で同じ値を自分のフィールドに写します（[ngmodule-testbed](../ngmodule/17-ngmodule-testbed.md) で引いた範囲）。そしてテストモジュールを組むときに、こう provide します。

📄 `angular/packages/core/testing/src/test_bed_compiler.ts` L1002–1004 （▶ の行: 1004）

```ts
1002 │     const providers = [
1003 │       {provide: Compiler, useFactory: () => new R3TestCompiler(this)},
1004 ▶       {provide: DEFER_BLOCK_CONFIG, useValue: {behavior: this.deferBlockBehavior}},
```

1004 行目。`{ behavior }` というオブジェクトが `DEFER_BLOCK_CONFIG` というトークンでテストモジュールに入ります。このトークンはテスト専用ではなく、`@angular/core` の本体の `defer/rendering.ts` に定義されていて、本体が読みに来ます。

📄 `angular/packages/core/src/defer/rendering.ts` L71–76 （▶ の行: 72, 74）

```ts
71 │ /**
72 ▶  * **INTERNAL**, token used for configuring defer block behavior.
73 │  */
74 ▶ export const DEFER_BLOCK_CONFIG = new InjectionToken<DeferBlockConfig>(
75 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'DEFER_BLOCK_CONFIG' : '',
76 │ );
```

72 行目のコメントのとおり **INTERNAL** のトークンで、公開 API ではありません。テストでは `deferBlockBehavior` を通してだけ設定します。

📄 `angular/packages/core/src/defer/rendering.ts` L490–506 （▶ の行: 500–503）

```ts
490 │ /**
491 │  * Determines whether we should proceed with triggering a given defer block.
492 │  */
493 │ export function shouldTriggerDeferBlock(triggerType: TriggerType, lView: LView): boolean {
494 │   // prevents triggering regular triggers when on the server.
495 │   if (triggerType === TriggerType.Regular && typeof ngServerMode !== 'undefined' && ngServerMode) {
496 │     return false;
497 │   }
498 │ 
499 │   // prevents triggering in the case of a test run with manual defer block configuration.
500 ▶   const injector = lView[INJECTOR];
501 ▶   const config = injector.get(DEFER_BLOCK_CONFIG, null, {optional: true});
502 ▶   if (config?.behavior === DeferBlockBehavior.Manual) {
503 ▶     return false;
504 │   }
505 │   return true;
506 │ }
```

501 行目でビューの注入器から `DEFER_BLOCK_CONFIG` を*任意で*取り、502〜503 行目で `Manual` なら `false` を返します。本物のアプリでは誰も provide しないので `config` は `null`、いつも `true` です。`shouldTriggerDeferBlock` を呼んでいるのは `triggerDeferBlock`（トリガーが来たときの入口）、`scheduleDelayedTrigger`（timer と idle）、DOM のトリガー（interaction・hover・viewport）の 3 か所です。

📄 `angular/packages/core/src/defer/triggering.ts` L78–99 （▶ の行: 84, 89, 94）

```ts
78 │ export function scheduleDelayedTrigger(
79 │   scheduleFn: (callback: VoidFunction, injector: Injector) => VoidFunction,
80 │ ) {
81 │   const lView = getLView();
82 │   const tNode = getCurrentTNode()!;
83 │ 
84 ▶   renderPlaceholder(lView, tNode);
85 │ 
86 │   // Exit early to avoid invoking `scheduleFn`, which would
87 │   // add `setTimeout` call and potentially delay serialization
88 │   // on the server unnecessarily.
89 ▶   if (!shouldTriggerDeferBlock(TriggerType.Regular, lView)) return;
90 │ 
91 │   const injector = lView[INJECTOR];
92 │   const lDetails = getLDeferBlockDetails(lView, tNode);
93 │ 
94 ▶   const cleanupFn = scheduleFn(
95 │     () => triggerDeferBlock(TriggerType.Regular, lView, tNode),
96 │     injector,
97 │   );
98 │   storeTriggerCleanupFn(TriggerType.Regular, lDetails, cleanupFn);
99 │ }
```

`on timer` と `on idle` の入口です。84 行目で **先に @placeholder を描いてから**、89 行目で `Manual` なら抜けます。94 行目のタイマーは登録されません。つまり `Manual` は「何も描かない」ではなく「@placeholder までは描き、そこから先へ自分では進まない」です。

## 2. fixture.getDeferBlocks は LView を歩く

📄 `angular/packages/core/testing/src/fixture.ts` L285–299 （▶ の行: 290, 292, 294–295, 298）

```ts
285 │   /**
286 │    * Retrieves all defer block fixtures in the component fixture.
287 │    */
288 │   getDeferBlocks(): Promise<DeferBlockFixture[]> {
289 │     const deferBlocks: DeferBlockDetails[] = [];
290 ▶     const lView = (this.componentRef.hostView as any)['_lView'];
291 │     const deferBlockFixtures = [];
292 ▶     getDeferBlocks(lView, deferBlocks);
293 │ 
294 ▶     for (const block of deferBlocks) {
295 ▶       deferBlockFixtures.push(new DeferBlockFixture(block, this));
296 │     }
297 │ 
298 ▶     return Promise.resolve(deferBlockFixtures);
299 │   }
```

290 行目で `hostView` の中の `_lView`（根のコンポーネントのホストの LView）を取り出し、292 行目で本体の `getDeferBlocks` に渡して配列に集めます。294〜296 行目で 1 個ずつ `DeferBlockFixture` で包み、298 行目で `Promise.resolve` に入れて返します。集めるのは同期なので、`await` は形だけです。

📄 `angular/packages/core/src/defer/discovery.ts` L30–64 （▶ の行: 32–33, 38, 42–43, 46, 52–53, 56–57, 60–61）

```ts
30 │ export function getDeferBlocks(lView: LView, deferBlocks: DeferBlockDetails[]) {
31 │   const tView = lView[TVIEW];
32 ▶   for (let i = HEADER_OFFSET; i < tView.bindingStartIndex; i++) {
33 ▶     if (isLContainer(lView[i])) {
34 │       const lContainer = lView[i];
35 │       // An LContainer may represent an instance of a defer block, in which case
36 │       // we store it as a result. Otherwise, keep iterating over LContainer views and
37 │       // look for defer blocks.
38 ▶       const isLast = i === tView.bindingStartIndex - 1;
39 │       if (!isLast) {
40 │         const tNode = tView.data[i] as TNode;
41 │         const tDetails = getTDeferBlockDetails(tView, tNode);
42 ▶         if (isTDeferBlockDetails(tDetails)) {
43 ▶           deferBlocks.push({lContainer, lView, tNode, tDetails});
44 │           // This LContainer represents a defer block, so we exit
45 │           // this iteration and don't inspect views in this LContainer.
46 ▶           continue;
47 │         }
48 │       }
49 │ 
50 │       // The host can be an `LView` if this is the container
51 │       // for a component that injects `ViewContainerRef`.
52 ▶       if (isLView(lContainer[HOST])) {
53 ▶         getDeferBlocks(lContainer[HOST], deferBlocks);
54 │       }
55 │ 
56 ▶       for (let j = CONTAINER_HEADER_OFFSET; j < lContainer.length; j++) {
57 ▶         getDeferBlocks(lContainer[j] as LView, deferBlocks);
58 │       }
59 │     } else if (isLView(lView[i])) {
60 ▶       // This is a component, enter the `getDeferBlocks` recursively.
61 ▶       getDeferBlocks(lView[i], deferBlocks);
62 │     }
63 │   }
64 │ }
```

1. **32 行目：LView のスロットを先頭から**

   `HEADER_OFFSET` から `bindingStartIndex` の手前まで、テンプレートの要素・コンテナ・子コンポーネントが入っている部分だけを見ます（LView の並びは [ivy-lview](../ivy/06-ivy-lview.md)）。
2. **33・42〜43 行目：defer のコンテナなら記録**

   LContainer で、その TNode に defer の静的情報（`TDeferBlockDetails`）が付いていれば、`lContainer`・`lView`・`tNode`・`tDetails` をまとめて 1 件にします。これが `DeferBlockFixture` の中身です。
3. **46 行目：その中には入らない**

   `continue` で、defer のコンテナの中のビューは調べません。だから**入れ子の @defer は数えられません**。入れ子は 4 節の `DeferBlockFixture.getDeferBlocks()` で 1 段ずつ取ります。38 行目の `isLast` は、最後のスロットでは `tView.data[i]` を defer の情報として読まないための見張りです。
4. **52〜61 行目：それ以外は降りていく**

   普通の LContainer（`@if` や `*ngFor` の中身）は 56〜57 行目で中のビューへ、`ViewContainerRef` を inject したコンポーネントのホスト（52〜53 行目）と子コンポーネント（60〜61 行目）も再帰で降ります。

## 3. DeferBlockFixture.render がすること

📄 `angular/packages/core/testing/src/defer.ts` L25–52 （▶ の行: 37–39, 44–45, 49–51）

```ts
25 │ export class DeferBlockFixture {
26 │   /** @docs-private */
27 │   constructor(
28 │     private block: DeferBlockDetails,
29 │     private componentFixture: ComponentFixture<unknown>,
30 │   ) {}
31 │ 
32 │   /**
33 │    * Renders the specified state of the defer fixture.
34 │    * @param state the defer state to render
35 │    */
36 │   async render(state: DeferBlockState): Promise<void> {
37 ▶     if (!hasStateTemplate(state, this.block)) {
38 ▶       const stateAsString = getDeferBlockStateNameFromEnum(state);
39 ▶       throw new Error(
40 │         `Tried to render this defer block in the \`${stateAsString}\` state, ` +
41 │           `but there was no @${stateAsString.toLowerCase()} block defined in a template.`,
42 │       );
43 │     }
44 ▶     if (state === DeferBlockState.Complete) {
45 ▶       await triggerResourceLoading(this.block.tDetails, this.block.lView, this.block.tNode);
46 │     }
47 │     // If the `render` method is used explicitly - skip timer-based scheduling for
48 │     // `@placeholder` and `@loading` blocks and render them immediately.
49 ▶     const skipTimerScheduling = true;
50 ▶     renderDeferBlockState(state, this.block.tNode, this.block.lContainer, skipTimerScheduling);
51 ▶     this.componentFixture.detectChanges();
52 │   }
```

1. **37〜43 行目：その状態のテンプレートがあるか**

   無ければ 39 行目で投げます。判定は下の `hasStateTemplate` で、`@placeholder`・`@loading`・`@error` はテンプレートの番号が `null` でないか（78・80・82 行目）、本体（`Complete`）はいつも `true`（84 行目）です。
2. **44〜45 行目：Complete なら依存を読み込む**

   本体を描くには、`@defer` の中だけで使うコンポーネントなどの `import()` が済んでいなければなりません。`triggerResourceLoading` を `await` してから進みます。`Placeholder`・`Loading`・`Error` では依存を読み込みません。
3. **49〜50 行目：タイマーを飛ばして状態を描く**

   `skipTimerScheduling = true` を付けて本体の `renderDeferBlockState` を呼びます。`@loading (after 1s)` や `@placeholder (minimum 2s)` が書いてあっても待たずにすぐ描きます。
4. **51 行目：fixture の detectChanges**

   描いたビューの中身（バインディング）を更新するために、持ち主の `ComponentFixture` の `detectChanges()` を呼びます（[第 9 回](09-testing-detect-changes.md)）。

📄 `angular/packages/core/testing/src/defer.ts` L75–101 （▶ の行: 78, 80, 82, 84, 86, 99）

```ts
 75 │ function hasStateTemplate(state: DeferBlockState, block: DeferBlockDetails) {
 76 │   switch (state) {
 77 │     case DeferBlockState.Placeholder:
 78 ▶       return block.tDetails.placeholderTmplIndex !== null;
 79 │     case DeferBlockState.Loading:
 80 ▶       return block.tDetails.loadingTmplIndex !== null;
 81 │     case DeferBlockState.Error:
 82 ▶       return block.tDetails.errorTmplIndex !== null;
 83 │     case DeferBlockState.Complete:
 84 ▶       return true;
 85 │     default:
 86 ▶       return false;
 87 │   }
 88 │ }
 89 │ 
 90 │ function getDeferBlockStateNameFromEnum(state: DeferBlockState) {
 91 │   switch (state) {
 92 │     case DeferBlockState.Placeholder:
 93 │       return 'Placeholder';
 94 │     case DeferBlockState.Loading:
 95 │       return 'Loading';
 96 │     case DeferBlockState.Error:
 97 │       return 'Error';
 98 │     default:
 99 ▶       return 'Main';
100 │   }
101 │ }
```

エラー文の名前は 90〜101 行目で作ります。`Placeholder`・`Loading`・`Error` 以外（`Complete`）は 99 行目で `'Main'` になりますが、`Complete` は 84 行目でいつも `true` なので、`'Main'` のエラー文が実際に出ることはありません。

### 本体の renderDeferBlockState：「戻る」描き方はしない

📄 `angular/packages/core/src/defer/rendering.ts` L184–219 （▶ の行: 184, 191–193, 197–198, 211–213）

```ts
184 ▶   const currentState = lDetails[DEFER_BLOCK_STATE];
185 │ 
186 │   const ssrState = lDetails[SSR_BLOCK_STATE];
187 │   if (ssrState !== null && newState < ssrState) {
188 │     return; // trying to render a previous state, exit
189 │   }
190 │ 
191 ▶   if (
192 ▶     isValidStateChange(currentState, newState) &&
193 ▶     isValidStateChange(lDetails[NEXT_DEFER_BLOCK_STATE] ?? -1, newState)
194 │   ) {
195 │     const tDetails = getTDeferBlockDetails(hostTView, tNode);
196 │     // Skips scheduling on the server since it can delay the server response.
197 ▶     const needsScheduling =
198 ▶       !skipTimerScheduling &&
199 │       (typeof ngServerMode === 'undefined' || !ngServerMode) &&
200 │       (getLoadingBlockAfter(tDetails) !== null ||
201 │         getMinimumDurationForState(tDetails, DeferBlockState.Loading) !== null ||
202 │         getMinimumDurationForState(tDetails, DeferBlockState.Placeholder));
203 │ 
204 │     if (ngDevMode && needsScheduling) {
205 │       assertDefined(
206 │         applyDeferBlockStateWithSchedulingImpl,
207 │         'Expected scheduling function to be defined',
208 │       );
209 │     }
210 │ 
211 ▶     const applyStateFn = needsScheduling
212 ▶       ? applyDeferBlockStateWithSchedulingImpl!
213 ▶       : applyDeferBlockState;
214 │     try {
215 │       applyStateFn(newState, lDetails, lContainer, tNode, hostLView);
216 │     } catch (error: unknown) {
217 │       handleUncaughtError(hostLView, error);
218 │     }
219 │   }
```

📄 `angular/packages/core/src/defer/rendering.ts` L409–414 （▶ の行: 413）

```ts
409 │ function isValidStateChange(
410 │   currentState: DeferBlockState | DeferBlockInternalState,
411 │   newState: DeferBlockState,
412 │ ): boolean {
413 ▶   return currentState < newState;
414 │ }
```

184 行目でいまの状態を読み、191〜193 行目で `isValidStateChange` が `true` のときだけ描きます。413 行目、条件は `currentState < newState`。状態の数値は `Placeholder = 0`・`Loading = 1`・`Complete = 2`・`Error = 3` です（[defer](../template/03-defer.md) の章の `DeferBlockState`）。だから **`render(Complete)` のあとに `render(Placeholder)` しても、エラーにならずに何も起きません**。このサイトの ng test でも本体のままでした。197〜198 行目の `!skipTimerScheduling` が、3 の手順の「タイマーを飛ばす」の正体で、`true` なら 211〜213 行目でタイマー付きでない `applyDeferBlockState` が選ばれます。

📄 `angular/packages/core/src/defer/triggering.ts` L169–192 （▶ の行: 177, 181, 188）

```ts
169 │ export function triggerResourceLoading(
170 │   tDetails: TDeferBlockDetails,
171 │   lView: LView,
172 │   tNode: TNode,
173 │ ): Promise<unknown> {
174 │   const injector = lView[INJECTOR];
175 │   const tView = lView[TVIEW];
176 │ 
177 ▶   if (tDetails.loadingState !== DeferDependenciesLoadingState.NOT_STARTED) {
178 │     // If the loading status is different from initial one, it means that
179 │     // the loading of dependencies is in progress and there is nothing to do
180 │     // in this function. All details can be obtained from the `tDetails` object.
181 ▶     return tDetails.loadingPromise ?? Promise.resolve();
182 │   }
183 │ 
184 │   const lDetails = getLDeferBlockDetails(lView, tNode);
185 │   const primaryBlockTNode = getPrimaryBlockTNode(tView, tDetails);
186 │ 
187 │   // Switch from NOT_STARTED -> IN_PROGRESS state.
188 ▶   tDetails.loadingState = DeferDependenciesLoadingState.IN_PROGRESS;
189 │ 
190 │   // Prefetching is triggered, cleanup all registered prefetch triggers.
191 │   invokeTriggerCleanupFns(TriggerType.Prefetch, lDetails);
192 │ 
```

📄 `angular/packages/core/src/defer/triggering.ts` L206–219 （▶ の行: 207, 212–213, 215–216）

```ts
206 │   // Indicate that an application is not stable and has a pending task.
207 ▶   const removeTask = injector.get(PendingTasks).add();
208 │ 
209 │   // The `dependenciesFn` might be `null` when all dependencies within
210 │   // a given defer block were eagerly referenced elsewhere in a file,
211 │   // thus no dynamic `import()`s were produced.
212 ▶   if (!dependenciesFn) {
213 ▶     tDetails.loadingPromise = Promise.resolve().then(() => {
214 │       tDetails.loadingPromise = null;
215 ▶       tDetails.loadingState = DeferDependenciesLoadingState.COMPLETE;
216 ▶       removeTask();
217 │     });
218 │     return tDetails.loadingPromise;
219 │   }
```

`render(Complete)` の 45 行目が呼ぶ関数です。177〜181 行目、読み込みがもう始まっていれば（または済んでいれば）その Promise を返すだけ。188 行目で `IN_PROGRESS` にし、207 行目で `PendingTasks` に 1 つ足してから読み込みを始めます。`import()` が 1 つも無いブロック（中で使うものがすべてほかの場所でも使われている）では 212〜213 行目の `Promise.resolve().then` で、次の microtask に `COMPLETE` になり（215 行目）、216 行目で足した task を外します。`loadingState` は `tDetails`（TView に載る静的な情報）にあるので、**同じコンポーネントのクラスで 2 回目以降は読み込み済み**です。これが 5 節の表の「2 つ目の fixture では @loading を通らない」の理由です。

## 4. 入れ子の defer

📄 `angular/packages/core/testing/src/defer.ts` L54–72 （▶ の行: 64–66, 68）

```ts
54 │   /**
55 │    * Retrieves all nested child defer block fixtures
56 │    * in a given defer block.
57 │    */
58 │   getDeferBlocks(): Promise<DeferBlockFixture[]> {
59 │     const deferBlocks: DeferBlockDetails[] = [];
60 │     // An LContainer that represents a defer block has at most 1 view, which is
61 │     // located right after an LContainer header. Get a hold of that view and inspect
62 │     // it for nested defer blocks.
63 │     const deferBlockFixtures = [];
64 ▶     if (this.block.lContainer.length >= CONTAINER_HEADER_OFFSET) {
65 ▶       const lView = this.block.lContainer[CONTAINER_HEADER_OFFSET];
66 ▶       getDeferBlocks(lView, deferBlocks);
67 │       for (const block of deferBlocks) {
68 ▶         deferBlockFixtures.push(new DeferBlockFixture(block, this.componentFixture));
69 │       }
70 │     }
71 │     return Promise.resolve(deferBlockFixtures);
72 │   }
```

64 行目、defer のコンテナにはビューが多くても 1 つ（いまの状態のテンプレート）なので、65 行目で `CONTAINER_HEADER_OFFSET` の位置の 1 つだけを取り、66 行目で 2 節と同じ `getDeferBlocks` にかけます。つまり**外側を描いてからでないと、内側は見つかりません**。外側が @placeholder のままなら、そのビューは @placeholder のビューなので、本体の中の @defer は出てきません。

📄 `angular/packages/core/test/defer_fixture_spec.ts` L394–431 （▶ の行: 400, 413, 427–430）

```ts
394 │   it('should get child defer blocks', async () => {
395 │     @Component({
396 │       selector: 'deferred-comp',
397 │       imports: [SecondDeferredComp],
398 │       template: `
399 │         <div>
400 ▶           @defer (on immediate) {
401 │             <second-deferred-comp />
402 │           }
403 │         </div>
404 │       `,
405 │     })
406 │     class DeferredComp {}
407 │ 
408 │     @Component({
409 │       selector: 'defer-comp',
410 │       imports: [DeferredComp],
411 │       template: `
412 │         <div>
413 ▶           @defer (on immediate) {
414 │             <deferred-comp />
415 │           }
416 │         </div>
417 │       `,
418 │     })
419 │     class DeferComp {}
420 │ 
421 │     TestBed.configureTestingModule({
422 │       imports: [DeferComp, DeferredComp, SecondDeferredComp],
423 │       providers: COMMON_PROVIDERS,
424 │     });
425 │ 
426 │     const componentFixture = TestBed.createComponent(DeferComp);
427 ▶     const deferBlock = (await componentFixture.getDeferBlocks())[0];
428 ▶     await deferBlock.render(DeferBlockState.Complete);
429 ▶     const fixtures = await deferBlock.getDeferBlocks();
430 ▶     expect(fixtures.length).toBe(1);
431 │   });
```

413 行目の外側の中に `<deferred-comp />` があり、その 400 行目にもう 1 つ @defer があります。427 行目で外側を取り、428 行目で `render(Complete)`、429〜430 行目で内側が 1 個見つかることを確かめます。内側の @defer は子コンポーネントの LView の中にあり、2 節の 60〜61 行目（子コンポーネントへ降りる）で見つかります。

## 5. このサイトの ng test で確かめた

このサイトの `ng test`（Vitest + jsdom、@angular/core 22.1.6）で確かめました。`DeferBlockBehavior` と `DeferBlockState` は 22.1.6 の `@angular/core/testing` から import できます （`DeferBlockState` は `{Placeholder: 0, Loading: 1, Complete: 2, Error: 3}`、`DeferBlockBehavior` は `{Manual: 0, Playthrough: 1}` でした）。コンポーネントは `(on interaction(btn))`＋@placeholder＋@loading、`(when flag())`（@placeholder なし）、`(on immediate)` の中に子コンポーネント（その中にもう 1 つ @defer）、の 3 つを並べたものです。

| モード | した操作 | 結果 |
| --- | --- | --- |
| Manual | createComponent の直後 | @placeholder がある 1 つ目だけ &lt;i class="ph"&gt;P&lt;/i&gt;。@placeholder の無い 2 つ目・3 つ目は何も無い |
| Manual | fixture.getDeferBlocks() | 3 個（入れ子の @defer は数えない） |
| Manual | when の条件を true にして await whenStable() | 変わらない（placeholder のまま） |
| Manual | @placeholder の無いブロックに render(Placeholder) | エラー「Tried to render this defer block in the \`Placeholder\` state, but there was no @placeholder block defined in a template.」 |
| Manual | render(Loading) → render(Complete) | &lt;u class="ld"&gt;L&lt;/u&gt; → &lt;b class="main"&gt;M&lt;/b&gt; |
| Manual | Complete のあとに render(Placeholder) | エラーは出ず、本体のまま |
| Manual | 3 つ目を render(Complete) したあと | 子コンポーネントの中の @defer (on immediate) は描かれない。fixture.getDeferBlocks() は 3 個のまま、3 つ目の getDeferBlocks() は 1 個 |
| Playthrough | (on interaction) のボタンを click()（初めて読み込むクラス） | 同期で @loading。isStable() は false。await whenStable() のあと本体 |
| Playthrough | 同じクラスの 2 つ目の fixture で click() | 同期で本体（@loading を通らない） |
| Playthrough | (when flag()) を true にして await whenStable() | 本体が出る |
| Playthrough | (on timer(30ms)) を await whenStable() | placeholder のまま。isStable() は true。本当に 60ms 待ってからもう一度 whenStable() すると本体 |

- `Manual` の「@placeholder だけ出る」は 1 節の 84 行目、「when を true にしても進まない」は 502〜503 行目です。
- Playthrough の click の直後に `@loading` が出て `isStable()` が `false` だったのは、読み込みが始まると `PendingTasks` に 1 つ足されるからで（3 節で引いた `triggering.ts` 207 行目）、`whenStable()` はそれを待ちます。
- `on timer(30ms)` は `whenStable()` では待ってもらえませんでした（`isStable()` が `true`）。Playthrough で timer を進めるには、本当に時間を待つか、偽のタイマーを使います（[第 16 回](16-testing-zoneless-time.md)）。

## 6. 本物の @defer の状態の移り変わり

> **🧪 DEMO — 本物の @defer（on interaction と when）**
>
> 下の 2 つは、この章のテンプレートに書いた本物の @defer です。各ブロックの中の小さなコンポーネントが、作られたときにログへ 1 行足します（時刻は「作り直す」を押してからのミリ秒）。①は `@defer (on interaction(trigger))` ＋ `@loading (minimum 800ms)` ＋ `@placeholder`、②は `@defer (when ready())` ＋ `@placeholder` です。
>
> 本物のアプリでは、①はボタンを押した瞬間に @loading が作られ、最短 800 ms たってから本体に替わります（`minimum` のタイマー）。テストの `Manual` では、同じテンプレートで `render(DeferBlockState.Loading)` と `render(DeferBlockState.Complete)` を順に呼べば、クリックも 800 ms の待ちもなく、それぞれの状態がすぐ描かれます（3 節の 49〜50 行目の `skipTimerScheduling`）。②はテストの `Manual` ではチェックを入れても進みません（1 節の 502〜503 行目）。`Playthrough` なら、チェックに当たる `flag.set(true)` のあと `await fixture.whenStable()` で本体が出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/testing-defer)

## ここまでの呼び出し

- 👤 `TestBed.configureTestingModule({ deferBlockBehavior: Manual })` — テストのコード
  - `{provide: DEFER_BLOCK_CONFIG, useValue: {behavior}}` — core/testing/src/test\_bed\_compiler.ts L1004
  - `shouldTriggerDeferBlock()` → `false` — core/src/defer/rendering.ts L493 — *トリガーが来ても進まない。@placeholder までは描かれる*
- 👤 `await fixture.getDeferBlocks()` — core/testing/src/fixture.ts L288
  - `getDeferBlocks(lView, deferBlocks)` — core/src/defer/discovery.ts L30 — *defer のコンテナの中には入らない*
- 👤 `await block.render(DeferBlockState.Complete)` — core/testing/src/defer.ts L36
  - `hasStateTemplate()` — defer.ts L75 — *無ければ Error を投げる*
  - `triggerResourceLoading()` — core/src/defer/triggering.ts L169 — *Complete のときだけ。済んでいれば Promise を返すだけ*
  - `renderDeferBlockState(state, ..., skipTimerScheduling = true)` — core/src/defer/rendering.ts L164 — *currentState &lt; newState のときだけ描く*
  - `componentFixture.detectChanges()` — defer.ts L51

## テストと直し方

この章の spec は 2 か所です。`packages/core/test/defer_fixture_spec.ts` の `describe('DeferFixture')`（23 行目、it が 14 本）と、`packages/core/test/test_bed_spec.ts` の `describe('TestBed defer block behavior')`（2629 行目、it が 3 本）。どちらも `//packages/core/test:test` です。

📄 `angular/packages/core/test/test_bed_spec.ts` L2629–2649 （▶ の行: 2635, 2639–2640, 2646–2647）

```ts
2629 │ describe('TestBed defer block behavior', () => {
2630 │   beforeEach(() => {
2631 │     TestBed.resetTestingModule();
2632 │   });
2633 │ 
2634 │   it('should default defer block behavior to playthrough', () => {
2635 ▶     expect(TestBedImpl.INSTANCE.getDeferBlockBehavior()).toBe(DeferBlockBehavior.Playthrough);
2636 │   });
2637 │ 
2638 │   it('should be able to configure defer block behavior', () => {
2639 ▶     TestBed.configureTestingModule({deferBlockBehavior: DeferBlockBehavior.Manual});
2640 ▶     expect(TestBedImpl.INSTANCE.getDeferBlockBehavior()).toBe(DeferBlockBehavior.Manual);
2641 │   });
2642 │ 
2643 │   it('should reset the defer block behavior back to the default when TestBed is reset', () => {
2644 │     TestBed.configureTestingModule({deferBlockBehavior: DeferBlockBehavior.Manual});
2645 │     expect(TestBedImpl.INSTANCE.getDeferBlockBehavior()).toBe(DeferBlockBehavior.Manual);
2646 ▶     TestBed.resetTestingModule();
2647 ▶     expect(TestBedImpl.INSTANCE.getDeferBlockBehavior()).toBe(DeferBlockBehavior.Playthrough);
2648 │   });
2649 │ });
```

2635 行目で既定が `Playthrough`、2639〜2640 行目で設定できること、2646〜2647 行目で `resetTestingModule` のあと既定に戻ること（`test_bed.ts` 577 行目）を確かめています。

📄 `angular/packages/core/test/defer_fixture_spec.ts` L141–166 （▶ の行: 158, 162, 164–165）

```ts
141 │   it('should render a completed defer state', async () => {
142 │     @Component({
143 │       selector: 'defer-comp',
144 │       imports: [SecondDeferredComp],
145 │       template: `
146 │         <div>
147 │           @defer (on immediate) {
148 │             <second-deferred-comp />
149 │           }
150 │         </div>
151 │       `,
152 │     })
153 │     class DeferComp {}
154 │ 
155 │     TestBed.configureTestingModule({
156 │       imports: [DeferComp, SecondDeferredComp],
157 │       providers: COMMON_PROVIDERS,
158 ▶       deferBlockBehavior: DeferBlockBehavior.Manual,
159 │     });
160 │ 
161 │     const componentFixture = TestBed.createComponent(DeferComp);
162 ▶     const deferBlock = (await componentFixture.getDeferBlocks())[0];
163 │     const el = componentFixture.nativeElement as HTMLElement;
164 ▶     await deferBlock.render(DeferBlockState.Complete);
165 ▶     expect(el.querySelector('.more')).toBeDefined();
166 │   });
```

📄 `angular/packages/core/test/defer_fixture_spec.ts` L325–355 （▶ の行: 347–350）

```ts
325 │   it('should throw when rendering a template that does not exist', async () => {
326 │     @Component({
327 │       selector: 'defer-comp',
328 │       imports: [SecondDeferredComp],
329 │       template: `
330 │         <div>
331 │           @defer (on immediate) {
332 │             <second-deferred-comp />
333 │           }
334 │         </div>
335 │       `,
336 │     })
337 │     class DeferComp {}
338 │ 
339 │     TestBed.configureTestingModule({
340 │       imports: [DeferComp, SecondDeferredComp],
341 │       providers: COMMON_PROVIDERS,
342 │       deferBlockBehavior: DeferBlockBehavior.Manual,
343 │     });
344 │ 
345 │     const componentFixture = TestBed.createComponent(DeferComp);
346 │     const deferBlock = (await componentFixture.getDeferBlocks())[0];
347 ▶     try {
348 ▶       await deferBlock.render(DeferBlockState.Placeholder);
349 ▶     } catch (er: any) {
350 ▶       expect(er.message).toBe(
351 │         'Tried to render this defer block in the `Placeholder` state, but' +
352 │           ' there was no @placeholder block defined in a template.',
353 │       );
354 │     }
355 │   });
```

📄 `ターミナル（../angular で実行）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test:test --test_output=all \
  --test_arg=--filter="DeferFixture|TestBed defer block behavior"
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
==================== Test output for //packages/core/test:test (shard 2 of 4):
Ran 4 of 1388 specs
4 specs, 0 failures
==================== Test output for //packages/core/test:test (shard 1 of 4):
Ran 5 of 1389 specs
5 specs, 0 failures
==================== Test output for //packages/core/test:test (shard 4 of 4):
Ran 4 of 1388 specs
==================== Test output for //packages/core/test:test (shard 3 of 4):
Ran 4 of 1388 specs
INFO: Elapsed time: 5.339s, Critical Path: 2.02s
//packages/core/test:test                                  PASSED in 1.6s
```

1. **Ran の数**

   4 + 5 + 4 + 4 = **17 本**。`DeferFixture` の 14 本と `TestBed defer block behavior` の 3 本の合計と合います。`|` でつないだ正規表現で 2 つの describe を一度に選んでいます。
2. **読んでいて気づくこと（そのままにしてある書き方）**

   165 行目は `expect(el.querySelector('.more')).toBeDefined()` です。`querySelector` は見つからないと `null` を返し、jasmine の `toBeDefined()` は `undefined` でなければ通るので、この行は本体が描かれなくても通ります。同じ形が 197・225 行目にもあります。また 347〜354 行目は `try` の中で投げられなかったときに何も確かめないので、`render` が投げなくなっても通ります（`expectAsync(...).toBeRejectedWithError(...)` なら投げないと落ちる）。50 行目の it の名前は「manual trigger mode by default」ですが、64〜67 行目では `deferBlockBehavior` を指定しておらず既定は `Playthrough` で、71 行目は `createComponent` 直後（まだ CD 前）の 0 個を見ているだけです。どれも「テストが弱い」と言える箇所で、spec を書き直す練習の題材になります（[第 20 回](20-testing-issues.md)）。
3. **直すとしたら**

   テスト用の API は `packages/core/testing/src/defer.ts`（`render`・`getDeferBlocks`・`hasStateTemplate`）と `fixture.ts` の `getDeferBlocks`。どのブロックが見つかるかは `core/src/defer/discovery.ts`、状態の移り方は `rendering.ts` の `renderDeferBlockState`、Manual の効き方は `shouldTriggerDeferBlock` です。テスト用の API の振る舞いは `defer_fixture_spec.ts` に、@defer そのものの振る舞いは `acceptance/defer_spec.ts` に足します。

## 聞かれそうな質問

**Q. Manual と Playthrough のどちらを使えばよいですか？**

「各状態の見た目」を確かめたいなら `Manual` です。トリガーを起こさずに、`render(Placeholder | Loading | Error | Complete)` で見たい状態を順に描けます（3 節。タイマーも飛ばす）。「トリガーで本当に進むか」（ボタンを押したら出る、条件が true になったら出る）を確かめたいなら既定の `Playthrough` で、トリガーを起こしてから `await fixture.whenStable()` します。`Error` の見た目は、本物の読み込み失敗を起こすのが難しいので `Manual` の `render(Error)` が向いています。

**Q. 入れ子の @defer はどう取りますか？**

`fixture.getDeferBlocks()` では外側しか取れません（discovery.ts 46 行目の `continue`）。外側を `render(Complete)` してから、外側の `DeferBlockFixture.getDeferBlocks()` で内側を取ります（defer.ts 64〜68 行目）。このサイトの ng test では、外側を描いたあとも `fixture.getDeferBlocks()` は 3 個のままで、内側は外側の `getDeferBlocks()` からだけ 1 個取れました。

**Q. on timer の @defer はテストでどうなりますか？**

`Manual` では @placeholder を描いたところで止まり、タイマーそのものが登録されません（triggering.ts 84・89 行目）。`render(Complete)` で進めます。`Playthrough` では本物のタイマーが登録されますが、このサイトの ng test では `whenStable()` はそれを待たず（`isStable()` が `true`）、本当に 60 ms 待ってから初めて本体が出ました。テストを時間に依存させたくなければ `Manual` にするのが簡単です。

**Q. 2 つ目のテストでだけ @loading が出ないのはなぜですか？**

依存の読み込みの状態（`loadingState`）は、コンポーネントのクラスごとに 1 つの `tDetails` に載っているからです（triggering.ts 177〜181 行目）。前のテストで同じクラスの @defer を一度読み込むと、次のテストでは最初から `COMPLETE` で、トリガーが来ると @loading を通らずに本体が描かれます。このサイトの ng test でも、同じクラスの 2 つ目の fixture では click の直後にもう本体でした。@loading の見た目を確かめたいなら、Playthrough に頼らず `Manual` の `render(Loading)` を使います。

**Q. @placeholder の無いブロックで render(Placeholder) するとどうなりますか？**

defer.ts 39〜42 行目のエラーが投げられます。このサイトの ng test で出た文は「Tried to render this defer block in the \`Placeholder\` state, but there was no @placeholder block defined in a template.」で、spec の 350〜353 行目の文字列と同じでした。`render` は `async` なので、テストでは `await` して `try/catch` するか `expectAsync` で受けます。

## 読み終えて

- `deferBlockBehavior` は `DEFER_BLOCK_CONFIG` としてテストモジュールに入り、本体の `shouldTriggerDeferBlock` が読む。既定は `Playthrough`
- `Manual` でも @placeholder までは描かれる。そこから先はトリガーが来ても進まない
- `fixture.getDeferBlocks()` は LView を歩いて defer のコンテナを集めるが、その中には入らない。入れ子は外側を描いてから `block.getDeferBlocks()`
- `render(state)` はテンプレートの有無を確かめ、Complete なら依存を読み込み、タイマーを飛ばして描く。状態は前へしか進まない（`currentState < newState`）

---

← 前: [テストの中の effect と signal：TestBed.tick で何が流れるか](17-testing-effects.md)  
次: [RouterTestingHarness：ルーティングを本物の Router でテストする](19-testing-router-harness.md) →
