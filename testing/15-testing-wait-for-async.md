[目次](../README.md) › [テストの内側](README.md) › 第 15 回 / 全 20 回

# waitForAsync と ProxyZone：zone.js/testing が jasmine に入れるもの

> waitForAsync が Zone\[\_\_symbol\_\_("asyncTest")\] に委ね、AsyncTestZoneSpec がマクロタスクとマイクロタスクが無くなるまでテストの終わりを待つ仕組み。zone.js/testing が jasmine の describe を SyncTestZone、it / beforeEach を queueRunner ごとの ProxyZone で走らせるように包む行、fakeAsync と waitForAsync が ProxyZone を必要とする理由とエラー文、Vitest 用の別パッチ（vitest-patch）。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/testing-wait-for-async)

---

`it('...', waitForAsync(() => { setTimeout(...) }))` は、本体の中で予約された非同期の処理が全部終わるまでテストを終わらせません。この章では、その「全部終わった」を誰がどう数えているのか（`AsyncTestZoneSpec`）、そして fakeAsync と waitForAsync の両方が前提にしている **ProxyZone** を、`zone.js/testing` が jasmine のどこに差し込んでいるのかを、行を指して追います。

読む対象は `packages/core/testing/src/async.ts`、zone.js の `lib/zone-spec/async-test.ts`・`lib/zone-spec/proxy.ts`・`lib/jasmine/jasmine.ts`・`lib/testing/zone-testing.ts` です。

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
15. **15. waitForAsync と ProxyZone**（この章）
16. [16. zone なしの時間](16-testing-zoneless-time.md)
17. [17. effect と signal](17-testing-effects.md)
18. [18. @defer](18-testing-defer.md)
19. [19. RouterTestingHarness](19-testing-router-harness.md)
20. [20. issue と変更を読む](20-testing-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> `onHasTask` は「このゾーンのマイクロタスク（またはマクロタスク）の数が 0 と 1 以上の間で変わった」ときに呼ばれるフックです。仕組みは [zone-hastask](../zone/08-zone-hastask.md) で読みました。この章の `AsyncTestZoneSpec` はこのフックだけでテストの終わりを決めます。

## 1. core の waitForAsync も窓口を呼ぶだけ

📄 `angular/packages/core/testing/src/async.ts` L35–45 （▶ の行: 35–37, 39, 41–42）

```ts
35 ▶   const asyncTest = _Zone && _Zone[_Zone.__symbol__('asyncTest')];
36 ▶   if (typeof asyncTest === 'function') {
37 ▶     return asyncTest(fn);
38 │   }
39 ▶   return function () {
40 │     return Promise.reject(
41 ▶       'zone-testing.js is needed for the async() test helper but could not be found. ' +
42 ▶         'Please make sure that your environment includes zone.js/testing',
43 │     );
44 │   };
45 │ }
```

35 行目で `Zone[__symbol__('asyncTest')]` を取り出し、関数なら 37 行目でそれに `fn` を渡した結果を返します。fakeAsync と同じく、`@angular/core/testing` の中には何も無い包みです。窓口が無いとき（zone.js はあるが zone.js/testing が無い）は 39〜44 行目で「呼ぶと reject される関数」を返します。その手前の、`Zone` そのものが無いときの分岐は[次の回](16-testing-zoneless-time.md)で、このサイトの ng test で実際に呼んで確かめます。

## 2. zone.js の asyncTest：jasmine なら done を受け取る関数を返す

📄 `angular/packages/zone.js/lib/zone-spec/async-test.ts` L231–268 （▶ の行: 231, 236, 239, 241–242, 245, 250, 252, 254, 263–265）

```ts
231 ▶   Zone.__load_patch('asynctest', (global: any, Zone: ZoneType, api: _ZonePrivate) => {
232 │     /**
233 │      * Wraps a test function in an asynchronous test zone. The test will automatically
234 │      * complete when all asynchronous calls within this zone are done.
235 │      */
236 ▶     (Zone as any)[api.symbol('asyncTest')] = function asyncTest(fn: Function): (done: any) => any {
237 │       // If we're running using the Jasmine test framework, adapt to call the 'done'
238 │       // function when asynchronous activity is finished.
239 ▶       if (global.jasmine) {
240 │         // Not using an arrow function to preserve context passed from call site
241 ▶         return function (this: unknown, done: any) {
242 ▶           if (!done) {
243 │             // if we run beforeEach in @angular/core/testing/testing_internal then we get no done
244 │             // fake it here and assume sync.
245 ▶             done = function () {};
246 │             done.fail = function (e: any) {
247 │               throw e;
248 │             };
249 │           }
250 ▶           runInTestZone(fn, this, undefined, done, (err: any) => {
251 │             if (typeof err === 'string') {
252 ▶               return done.fail(new Error(err));
253 │             } else {
254 ▶               done.fail(err);
255 │             }
256 │           });
257 │         };
258 │       }
259 │       // Otherwise, return a promise which will resolve when asynchronous activity
260 │       // is finished. This will be correctly consumed by the Mocha framework with
261 │       // it('...', async(myFn)); or can be used in a custom framework.
262 │       // Not using an arrow function to preserve context passed from call site
263 ▶       return function (this: unknown, ...args: unknown[]) {
264 ▶         return new Promise<void>((finishCallback, failCallback) => {
265 ▶           runInTestZone(fn, this, args, finishCallback, failCallback);
266 │         });
267 │       };
268 │     };
```

1. **231〜236 行目：パッチとして登録**

   `Zone.__load_patch('asynctest', ...)` の中で、236 行目 `Zone[api.symbol('asyncTest')]` に関数を置きます。1 節の 35 行目が取り出すのはこれです。
2. **239〜257 行目：jasmine がいるとき**

   `global.jasmine` があれば、241 行目 `function (done)` を返します。**引数が 1 つなので jasmine はこれを「done で終わりを知らせる非同期のテスト」として扱います**。242〜249 行目、`done` が来なかったとき（引数なしで呼ばれたとき）は何もしない `done` を作ります。250 行目で 3 節の `runInTestZone` に、終わったら `done`、失敗したら `done.fail`（252・254 行目）を渡します。
3. **263〜266 行目：jasmine がいないとき**

   Mocha などのために、終わったら resolve される Promise を返す関数にします。**Vitest もこちらの道を通ります**（Vitest は `jasmine` というグローバルを置かない）。ただしそれだけでは ProxyZone が無いので動きません（7 節）。

## 3. runInTestZone：ProxyZone の delegate を AsyncTestZoneSpec に

📄 `angular/packages/zone.js/lib/zone-spec/async-test.ts` L270–300 （▶ の行: 277–279, 281, 285, 289, 291, 295–296, 299–300）

```ts
270 │     function runInTestZone(
271 │       fn: Function,
272 │       context: any,
273 │       applyArgs: unknown[] | undefined,
274 │       finishCallback: Function,
275 │       failCallback: Function,
276 │     ) {
277 ▶       const currentZone = Zone.current;
278 ▶       const AsyncTestZoneSpec = (Zone as any)['AsyncTestZoneSpec'];
279 ▶       if (AsyncTestZoneSpec === undefined) {
280 │         throw new Error(
281 ▶           'AsyncTestZoneSpec is needed for the async() test helper but could not be found. ' +
282 │             'Please make sure that your environment includes zone.js/plugins/async-test',
283 │         );
284 │       }
285 ▶       const ProxyZoneSpec = (Zone as any)['ProxyZoneSpec'] as {
286 │         get(): {setDelegate(spec: ZoneSpec): void; getDelegate(): ZoneSpec};
287 │         assertPresent: () => void;
288 │       };
289 ▶       if (!ProxyZoneSpec) {
290 │         throw new Error(
291 ▶           'ProxyZoneSpec is needed for the async() test helper but could not be found. ' +
292 │             'Please make sure that your environment includes zone.js/plugins/proxy',
293 │         );
294 │       }
295 ▶       const proxyZoneSpec = ProxyZoneSpec.get();
296 ▶       ProxyZoneSpec.assertPresent();
297 │       // We need to create the AsyncTestZoneSpec outside the ProxyZone.
298 │       // If we do it in ProxyZone then we will get to infinite recursion.
299 ▶       const proxyZone = Zone.current.getZoneWith('ProxyZoneSpec');
300 ▶       const previousDelegate = proxyZoneSpec.getDelegate();
```

📄 `angular/packages/zone.js/lib/zone-spec/async-test.ts` L301–333 （▶ の行: 301–302, 305, 309, 312–313, 318, 320, 329, 332）

```ts
301 ▶       proxyZone!.parent!.run(() => {
302 ▶         const testZoneSpec: ZoneSpec = new AsyncTestZoneSpec(
303 │           () => {
304 │             // Need to restore the original zone.
305 ▶             if (proxyZoneSpec.getDelegate() == testZoneSpec) {
306 │               // Only reset the zone spec if it's
307 │               // still this one. Otherwise, assume
308 │               // it's OK.
309 ▶               proxyZoneSpec.setDelegate(previousDelegate);
310 │             }
311 │             (testZoneSpec as any).unPatchPromiseForTest();
312 ▶             currentZone.run(() => {
313 ▶               finishCallback();
314 │             });
315 │           },
316 │           (error: any) => {
317 │             // Need to restore the original zone.
318 ▶             if (proxyZoneSpec.getDelegate() == testZoneSpec) {
319 │               // Only reset the zone spec if it's sill this one. Otherwise, assume it's OK.
320 ▶               proxyZoneSpec.setDelegate(previousDelegate);
321 │             }
322 │             (testZoneSpec as any).unPatchPromiseForTest();
323 │             currentZone.run(() => {
324 │               failCallback(error);
325 │             });
326 │           },
327 │           'test',
328 │         );
329 ▶         proxyZoneSpec.setDelegate(testZoneSpec);
330 │         (testZoneSpec as any).patchPromiseForTest();
331 │       });
332 ▶       return Zone.current.runGuarded(fn, context, applyArgs);
333 │     }
```

1. **277〜296 行目：必要な物がそろっているか**

   277 行目で今のゾーン（jasmine の it の中なら ProxyZone）を覚えます。279〜284 行目で `AsyncTestZoneSpec`、289〜294 行目で `ProxyZoneSpec` のクラスが無ければエラー。296 行目 `assertPresent()` で、今が ProxyZone の中であることを確かめます。
2. **299〜302 行目：ProxyZone の親で作る**

   297〜298 行目の注記のとおり、ProxyZone の中で作ると無限に再帰するので、299 行目で ProxyZone を見つけ、301 行目でその親のゾーンで `new AsyncTestZoneSpec(...)` します。このとき `AsyncTestZoneSpec` の `runZone`（4 節の 27 行目）は **ProxyZone の親**になります。これが 4 節の「終わりのタイマーが数に入らない」理由です。
3. **329 行目：delegate を差し替える**

   fakeAsync の 976 行目と同じく、新しいゾーンを fork せず、ProxyZone の delegate を入れ替えます（300 行目で前の delegate を覚えてある）。
4. **332 行目：本体を走らせる**

   今のゾーン（ProxyZone）で `runGuarded(fn)`。`runGuarded` は投げられたエラーを `onHandleError` に回す `run` です。
5. **303〜326 行目：終わったら戻す**

   成功の 303〜315 行目も失敗の 316〜326 行目も、305・318 行目で「delegate がまだ自分なら」300 行目の前の delegate に戻し、312〜313・323〜324 行目で 277 行目のゾーンに戻ってから `done` / `done.fail` を呼びます。

## 4. AsyncTestZoneSpec：数が 0 になったら、もう 1 回待ってから終わる

📄 `angular/packages/zone.js/lib/zone-spec/async-test.ts` L20–41 （▶ の行: 20–24, 26–27, 30, 40）

```ts
20 ▶   _pendingMicroTasks: boolean = false;
21 ▶   _pendingMacroTasks: boolean = false;
22 ▶   _alreadyErrored: boolean = false;
23 ▶   _isSync: boolean = false;
24 ▶   _existingFinishTimer: ReturnType<typeof setTimeout> | null = null;
25 │ 
26 ▶   entryFunction: Function | null = null;
27 ▶   runZone = Zone.current;
28 │   unresolvedChainedPromiseCount = 0;
29 │ 
30 ▶   supportWaitUnresolvedChainedPromise = false;
31 │ 
32 │   constructor(
33 │     private finishCallback: Function,
34 │     private failCallback: Function,
35 │     namePrefix: string,
36 │   ) {
37 │     this.name = 'asyncTestZone for ' + namePrefix;
38 │     this.properties = {'AsyncTestZoneSpec': this};
39 │     this.supportWaitUnresolvedChainedPromise =
40 ▶       __global[__symbol__('supportWaitUnResolvedChainedPromise')] === true;
41 │   }
```

持っている状態は 20〜24 行目のフラグです。`_pendingMicroTasks` と `_pendingMacroTasks` は「今そのゾーンに残っているか」、`_isSync` は「本体が何も予約せずに終わったか」、`_existingFinishTimer` は終わりの予約です。27 行目の `runZone` は作られたときのゾーン（3 節で ProxyZone の親）。30 行目と 40 行目の `supportWaitUnresolvedChainedPromise` は、グローバルの印を立てたときだけ「まだ resolve されていない Promise の鎖」も待つ追加の機能で、既定では `false` です。

📄 `angular/packages/zone.js/lib/zone-spec/async-test.ts` L152–182 （▶ の行: 161–162, 165–166, 178–179）

```ts
152 │   onInvoke(
153 │     parentZoneDelegate: ZoneDelegate,
154 │     currentZone: Zone,
155 │     targetZone: Zone,
156 │     delegate: Function,
157 │     applyThis: any,
158 │     applyArgs?: any[],
159 │     source?: string,
160 │   ): any {
161 ▶     if (!this.entryFunction) {
162 ▶       this.entryFunction = delegate;
163 │     }
164 │     try {
165 ▶       this._isSync = true;
166 ▶       return parentZoneDelegate.invoke(targetZone, delegate, applyThis, applyArgs, source);
167 │     } finally {
168 │       // We need to check the delegate is the same as entryFunction or not.
169 │       // Consider the following case.
170 │       //
171 │       // asyncTestZone.run(() => { // Here the delegate will be the entryFunction
172 │       //   Zone.current.run(() => { // Here the delegate will not be the entryFunction
173 │       //   });
174 │       // });
175 │       //
176 │       // We only want to check whether there are async tasks scheduled
177 │       // for the entry function.
178 ▶       if (this._isSync && this.entryFunction === delegate) {
179 ▶         this._finishCallbackIfDone();
180 │       }
181 │     }
182 │   }
```

161〜162 行目、最初に呼ばれた関数（= 3 節 332 行目の `fn`）を `entryFunction` に覚えます。165 行目で `_isSync = true` にしてから本体を呼びます。本体の中でタスクが予約・実行・取り消しされると、`onScheduleTask` / `onInvokeTask` / `onCancelTask`（このクラスの 3 つのフック。eventTask 以外のとき）が `_isSync = false` にします。178〜179 行目、本体が**何も予約せずに**終わり、しかも呼ばれたのが `entryFunction` なら、その場で終わりの判定に進みます。同期だけのテストは `onHasTask` が 1 回も来ないので、ここが無いと終わりません。

📄 `angular/packages/zone.js/lib/zone-spec/async-test.ts` L184–223 （▶ の行: 191–194, 196, 200, 213, 216–221）

```ts
184 │   onHandleError(
185 │     parentZoneDelegate: ZoneDelegate,
186 │     currentZone: Zone,
187 │     targetZone: Zone,
188 │     error: any,
189 │   ): boolean {
190 │     // Let the parent try to handle the error.
191 ▶     const result = parentZoneDelegate.handleError(targetZone, error);
192 ▶     if (result) {
193 ▶       this.failCallback(error);
194 ▶       this._alreadyErrored = true;
195 │     }
196 ▶     return false;
197 │   }
198 │ 
199 │   onHasTask(delegate: ZoneDelegate, current: Zone, target: Zone, hasTaskState: HasTaskState) {
200 ▶     delegate.hasTask(target, hasTaskState);
201 │     // We should only trigger finishCallback when the target zone is the AsyncTestZone
202 │     // Consider the following cases.
203 │     //
204 │     // const childZone = asyncTestZone.fork({
205 │     //   name: 'child',
206 │     //   onHasTask: ...
207 │     // });
208 │     //
209 │     // So we have nested zones declared the onHasTask hook, in this case,
210 │     // the onHasTask will be triggered twice, and cause the finishCallbackIfDone()
211 │     // is also be invoked twice. So we need to only trigger the finishCallbackIfDone()
212 │     // when the current zone is the same as the target zone.
213 ▶     if (current !== target) {
214 │       return;
215 │     }
216 ▶     if (hasTaskState.change == 'microTask') {
217 ▶       this._pendingMicroTasks = hasTaskState.microTask;
218 ▶       this._finishCallbackIfDone();
219 ▶     } else if (hasTaskState.change == 'macroTask') {
220 ▶       this._pendingMacroTasks = hasTaskState.macroTask;
221 ▶       this._finishCallbackIfDone();
222 │     }
223 │   }
```

216〜222 行目が中心です。マイクロタスクの数が変われば 217 行目、マクロタスクの数が変われば 220 行目でフラグを更新し、どちらでも終わりの判定に進みます。213 行目、このゾーンから fork した子ゾーンの `onHasTask` でも呼ばれるので、自分のゾーンの変化のときだけにします。191〜196 行目、エラーは親に渡して「処理すべき」と返されたら `failCallback` を呼び、`_alreadyErrored` を立てます。196 行目で `false` を返すので、エラーはそれ以上投げられません。

📄 `angular/packages/zone.js/lib/zone-spec/async-test.ts` L62–84 （▶ の行: 62–64, 67, 69–70, 76–79）

```ts
62 ▶     if (this._existingFinishTimer !== null) {
63 ▶       clearTimeout(this._existingFinishTimer);
64 ▶       this._existingFinishTimer = null;
65 │     }
66 │ 
67 ▶     if (
68 │       !(
69 ▶         this._pendingMicroTasks ||
70 ▶         this._pendingMacroTasks ||
71 │         (this.supportWaitUnresolvedChainedPromise && this.isUnresolvedChainedPromisePending())
72 │       )
73 │     ) {
74 │       // We wait until the next tick because we would like to catch unhandled promises which could
75 │       // cause test logic to be executed. In such cases we cannot finish with tasks pending then.
76 ▶       this.runZone.run(() => {
77 ▶         this._existingFinishTimer = setTimeout(() => {
78 ▶           if (!this._alreadyErrored && !(this._pendingMicroTasks || this._pendingMacroTasks)) {
79 ▶             this.finishCallback();
80 │           }
81 │         }, 0);
82 │       });
83 │     }
84 │   }
```

1. **62〜65 行目：前の予約を消す**

   終わりの予約がもうあれば消します。`done` を 2 回呼ばないためです（関数の先頭の長い注記に、beforeEach の microtask が絡む例が書かれています）。
2. **67〜73 行目：まだ何か残っていれば何もしない**

   マイクロタスクもマクロタスクも残っていない（と、追加の機能が有効なら未解決の鎖も無い）ときだけ進みます。
3. **76〜82 行目：もう 1 回だけ待つ**

   すぐには終わらず、76 行目 `runZone.run(...)` の中で 77 行目 `setTimeout(..., 0)` を予約します。74〜75 行目の注記のとおり、処理されなかった Promise の reject などがこのあとにテストの続きを動かすかもしれないからです。**この setTimeout は ProxyZone の外（`runZone`）で予約されるので、自分の数には入りません**。78 行目、その時点でもまだエラーが無く何も残っていなければ `finishCallback()`（3 節の 303 行目）。

> **🧪 DEMO — waitForAsync がテストを終わらせるまで**
>
> zone.js は動かさず、本体の中身ごとに「どのフックが、どの順に呼ばれ、3 つのフラグがどう変わるか」を並べた再現です。「次へ」で 1 つずつ出します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/testing-wait-for-async)

## 5. ProxyZone：中身を入れ替えられるゾーン

fakeAsync も waitForAsync も「今の ProxyZone の delegate を差し替える」ことで動きました。その ProxyZone の正体です。

📄 `angular/packages/zone.js/lib/zone-spec/proxy.ts` L27–58 （▶ の行: 28, 30, 32, 38, 40–41, 48–51, 56–57）

```ts
27 │ export class ProxyZoneSpec implements ZoneSpec {
28 ▶   name: string = 'ProxyZone';
29 │ 
30 ▶   private _delegateSpec: ZoneSpec | null = null;
31 │ 
32 ▶   properties: {[k: string]: any} = {'ProxyZoneSpec': this};
33 │   propertyKeys: string[] | null = null;
34 │ 
35 │   lastTaskState: HasTaskState | null = null;
36 │   isNeedToTriggerHasTask = false;
37 │ 
38 ▶   private tasks: Task[] = [];
39 │ 
40 ▶   static get(): ProxyZoneSpec | undefined {
41 ▶     return Zone.current.get('ProxyZoneSpec');
42 │   }
43 │ 
44 │   static isLoaded(): boolean {
45 │     return ProxyZoneSpec.get() instanceof ProxyZoneSpec;
46 │   }
47 │ 
48 ▶   static assertPresent(): ProxyZoneSpec {
49 ▶     const spec = ProxyZoneSpec.get();
50 ▶     if (spec === undefined) {
51 ▶       throw new Error(`Expected to be running in 'ProxyZone', but it was not found.`);
52 │     }
53 │     return spec;
54 │   }
55 │ 
56 ▶   constructor(private defaultSpecDelegate: ZoneSpec | null = null) {
57 ▶     this.setDelegate(defaultSpecDelegate);
58 │   }
```

📄 `angular/packages/zone.js/lib/zone-spec/proxy.ts` L60–86 （▶ の行: 60, 62–63, 65–67, 70, 75, 83, 85）

```ts
60 ▶   setDelegate(delegateSpec: ZoneSpec | null) {
61 │     const isNewDelegate = this._delegateSpec !== delegateSpec;
62 ▶     this._delegateSpec = delegateSpec;
63 ▶     this.propertyKeys && this.propertyKeys.forEach((key) => delete this.properties[key]);
64 │     this.propertyKeys = null;
65 ▶     if (delegateSpec && delegateSpec.properties) {
66 ▶       this.propertyKeys = Object.keys(delegateSpec.properties);
67 ▶       this.propertyKeys.forEach((k) => (this.properties[k] = delegateSpec.properties![k]));
68 │     }
69 │     // if a new delegateSpec was set, check if we need to trigger hasTask
70 ▶     if (
71 │       isNewDelegate &&
72 │       this.lastTaskState &&
73 │       (this.lastTaskState.macroTask || this.lastTaskState.microTask)
74 │     ) {
75 ▶       this.isNeedToTriggerHasTask = true;
76 │     }
77 │   }
78 │ 
79 │   getDelegate() {
80 │     return this._delegateSpec;
81 │   }
82 │ 
83 ▶   resetDelegate() {
84 │     const delegateSpec = this.getDelegate();
85 ▶     this.setDelegate(this.defaultSpecDelegate);
86 │   }
```

1. **30 行目：delegate は 1 つ**

   `_delegateSpec` に「今の中の人」の `ZoneSpec` を 1 つだけ持ちます。32 行目、`properties` に自分を `'ProxyZoneSpec'` という名前で入れるので、40〜41 行目の `Zone.current.get('ProxyZoneSpec')` で、ProxyZone の中（とその子ゾーン）のどこからでも見つかります。
2. **48〜54 行目：assertPresent**

   見つからなければ `"Expected to be running in 'ProxyZone', but it was not found."`。fakeAsync の 959 行目、waitForAsync の 296 行目が呼ぶのはこれです。
3. **60〜68 行目：setDelegate は properties も入れ替える**

   63 行目で前の delegate のプロパティを消し、65〜67 行目で新しい delegate の `properties` を自分に写します。`FakeAsyncTestZoneSpec` は `properties` に `'FakeAsyncTestZoneSpec'` を持つので、差し替えたとたんに `Zone.current.get('FakeAsyncTestZoneSpec')` が見つかるようになります（前の回の `FakeDate.now` や入れ子の検出がこれを使う）。
4. **70〜76 行目：差し替えた瞬間の hasTask**

   前の delegate の時点でタスクが残っていれば `isNeedToTriggerHasTask` を立て、次のフックで新しい delegate に `onHasTask` を届けます。こうして、`beforeEach` で予約したタスクも waitForAsync の `AsyncTestZoneSpec` に数えられます。
5. **83〜86 行目：resetDelegate**

   コンストラクタで渡された既定（jasmine の場合は `null`）に戻します。前の回の `resetFakeAsyncZone` が呼ぶのはこれです。

📄 `angular/packages/zone.js/lib/zone-spec/proxy.ts` L201–215 （▶ の行: 207–208, 210–211, 213）

```ts
201 │   onScheduleTask(
202 │     parentZoneDelegate: ZoneDelegate,
203 │     currentZone: Zone,
204 │     targetZone: Zone,
205 │     task: Task,
206 │   ): Task {
207 ▶     if (task.type !== 'eventTask') {
208 ▶       this.tasks.push(task);
209 │     }
210 ▶     if (this._delegateSpec && this._delegateSpec.onScheduleTask) {
211 ▶       return this._delegateSpec.onScheduleTask(parentZoneDelegate, currentZone, targetZone, task);
212 │     } else {
213 ▶       return parentZoneDelegate.scheduleTask(targetZone, task);
214 │     }
215 │   }
```

フックはどれも同じ形です。delegate があればそれに、無ければ親（`parentZoneDelegate`）に渡します。207〜208 行目、eventTask 以外の予約を自分の `tasks` にも積みます。これが 6 節のタイムアウトのメッセージに使われます。

📄 `angular/packages/zone.js/lib/zone-spec/proxy.ts` L13–25 （▶ の行: 14–15, 17, 21–22）

```ts
13 │ export function throwProxyZoneError(): never {
14 ▶   const jestPatched = typeof jest !== 'undefined' && jest['__zone_patch__'];
15 ▶   if (jestPatched) {
16 │     throw new Error(
17 ▶       'Only globals are patched with zone-testing. If you import `it`, `describe`, etc. directly, you cannot use `fakeAsync` or `waitForAsync`.',
18 │     );
19 │   } else {
20 │     throw new Error(
21 ▶       'ProxyZoneSpec is needed for the fakeAsync and waitForAsync test helpers but could not be found. ' +
22 ▶         'Make sure that your environment includes zone-testing.js',
23 │     );
24 │   }
25 │ }
```

クラスが無いとき（zone.js/testing を読み込んでいない）のエラーです。14 行目、jest にパッチが当たっているなら「`it` などをグローバルではなく import して使うと fakeAsync / waitForAsync は使えない」という別の文になります。

## 6. zone.js/testing が jasmine に入れるもの

📄 `angular/packages/zone.js/lib/testing/zone-testing.ts` L21–31 （▶ の行: 23–25, 28–29）

```ts
21 │ export function rollupTesting(Zone: ZoneType): void {
22 │   patchLongStackTrace(Zone);
23 ▶   patchProxyZoneSpec(Zone);
24 ▶   patchSyncTest(Zone);
25 ▶   patchJasmine(Zone);
26 │   patchJest(Zone);
27 │   patchMocha(Zone);
28 ▶   patchAsyncTest(Zone);
29 ▶   patchFakeAsyncTest(Zone);
30 │   patchPromiseTesting(Zone);
31 │ }
```

`zone.js/testing` の入口は、ProxyZone（23 行目）・SyncTest（24 行目）・jasmine（25 行目）・asyncTest（28 行目）・fakeAsync（29 行目）などのパッチを順に当てるだけです。Angular のリポジトリの Node のテストは、同じ物を 1 つずつ読み込んでいます。

📄 `angular/tools/testing/zone_base_setup.mts` L9–17 （▶ の行: 13–17）

```ts
 9 │ import 'reflect-metadata';
10 │ 
11 │ import 'zone.js/plugins/long-stack-trace-zone';
12 │ import 'zone.js/plugins/task-tracking';
13 ▶ import 'zone.js/plugins/proxy';
14 ▶ import 'zone.js/plugins/sync-test';
15 ▶ import 'zone.js/plugins/async-test';
16 ▶ import 'zone.js/plugins/fake-async-test';
17 ▶ import 'zone.js/plugins/jasmine-patch';
```

17 行目の `jasmine-patch` が 25 行目の `patchJasmine` です。これを読み込む `node_tests.init.mts` 全体は[contrib-reading-specs](../contrib/06-contrib-reading-specs.md)で見ました。

📄 `angular/packages/zone.js/lib/jasmine/jasmine.ts` L58–89 （▶ の行: 59–60, 66, 70, 78, 82, 86）

```ts
58 │     // Monkey patch all of the jasmine DSL so that each function runs in appropriate zone.
59 ▶     const jasmineEnv: any = jasmine.getEnv();
60 ▶     ['describe', 'xdescribe', 'fdescribe'].forEach((methodName) => {
61 │       let originalJasmineFn: Function = jasmineEnv[methodName];
62 │       jasmineEnv[methodName] = function (description: string, specDefinitions: Function) {
63 │         return originalJasmineFn.call(
64 │           this,
65 │           description,
66 ▶           wrapDescribeInZone(description, specDefinitions),
67 │         );
68 │       };
69 │     });
70 ▶     ['it', 'xit', 'fit'].forEach((methodName) => {
71 │       let originalJasmineFn: Function = jasmineEnv[methodName];
72 │       jasmineEnv[symbol(methodName)] = originalJasmineFn;
73 │       jasmineEnv[methodName] = function (
74 │         description: string,
75 │         specDefinitions: Function,
76 │         timeout: number,
77 │       ) {
78 ▶         arguments[1] = wrapTestInZone(specDefinitions);
79 │         return originalJasmineFn.apply(this, arguments);
80 │       };
81 │     });
82 ▶     ['beforeEach', 'afterEach', 'beforeAll', 'afterAll'].forEach((methodName) => {
83 │       let originalJasmineFn: Function = jasmineEnv[methodName];
84 │       jasmineEnv[symbol(methodName)] = originalJasmineFn;
85 │       jasmineEnv[methodName] = function (specDefinitions: Function, timeout: number) {
86 ▶         arguments[0] = wrapTestInZone(specDefinitions);
87 │         return originalJasmineFn.apply(this, arguments);
88 │       };
89 │     });
```

📄 `angular/packages/zone.js/lib/jasmine/jasmine.ts` L173–204 （▶ の行: 177–178, 188–190, 192, 196, 199–200, 202）

```ts
173 │     function wrapDescribeInZone(description: string, describeBody: Function): Function {
174 │       return function (this: unknown) {
175 │         // Create a synchronous-only zone in which to run `describe` blocks in order to raise an
176 │         // error if any asynchronous operations are attempted inside of a `describe`.
177 ▶         const syncZone = ambientZone.fork(new SyncTestZoneSpec(`jasmine.describe#${description}`));
178 ▶         return syncZone.run(describeBody, this, arguments as any as any[]);
179 │       };
180 │     }
181 │ 
182 │     function runInTestZone(
183 │       testBody: Function,
184 │       applyThis: any,
185 │       queueRunner: QueueRunner,
186 │       done?: Function,
187 │     ) {
188 ▶       const isClockInstalled = !!(jasmine as any)[symbol('clockInstalled')];
189 ▶       const testProxyZoneSpec = queueRunner.testProxyZoneSpec!;
190 ▶       const testProxyZone = queueRunner.testProxyZone!;
191 │       let lastDelegate;
192 ▶       if (isClockInstalled && enableAutoFakeAsyncWhenClockPatched) {
193 │         // auto run a fakeAsync
194 │         const fakeAsyncModule = (Zone as any)[Zone.__symbol__('fakeAsyncTest')];
195 │         if (fakeAsyncModule && typeof fakeAsyncModule.fakeAsync === 'function') {
196 ▶           testBody = fakeAsyncModule.fakeAsync(testBody);
197 │         }
198 │       }
199 ▶       if (done) {
200 ▶         return testProxyZone.run(testBody, applyThis, [done]);
201 │       } else {
202 ▶         return testProxyZone.run(testBody, applyThis);
203 │       }
204 │     }
```

📄 `angular/packages/zone.js/lib/jasmine/jasmine.ts` L211–225 （▶ の行: 217–219, 221–222）

```ts
211 │     function wrapTestInZone(testBody: Function): Function {
212 │       // The `done` callback is only passed through if the function expects at least one argument.
213 │       // Note we have to make a function with correct number of arguments, otherwise jasmine will
214 │       // think that all functions are sync or async.
215 │       return (
216 │         testBody &&
217 ▶         (testBody.length
218 ▶           ? function (this: QueueRunnerUserContext, done: Function) {
219 ▶               return runInTestZone(testBody, this, this.queueRunner!, done);
220 │             }
221 ▶           : function (this: QueueRunnerUserContext) {
222 ▶               return runInTestZone(testBody, this, this.queueRunner!);
223 │             })
224 │       );
225 │     }
```

1. **60〜69 行目：describe は SyncTestZone で**

   `describe` の本体は 66 行目 `wrapDescribeInZone` で包まれ、177 行目で `SyncTestZoneSpec` のゾーンで走ります。175〜176 行目の注記のとおり、`describe` の中で非同期の処理を予約するとエラーにするためです。**ProxyZone ではありません**。
2. **70〜89 行目：it と beforeEach / afterEach は ProxyZone で**

   `it` の 2 つ目の引数（78 行目）と `beforeEach` などの 1 つ目の引数（86 行目）を `wrapTestInZone` で包みます。217〜222 行目、元の関数が引数を取る（`done` を使う）かどうかで、引数の数が同じ包みを返します。jasmine は引数の数で同期か非同期かを決めるからです。
3. **188〜203 行目：queueRunner の ProxyZone で呼ぶ**

   189〜190 行目で、今の queueRunner が持っている `testProxyZone` を取り出し、200 行目（done あり）・202 行目（なし）でその中で本体を呼びます。192〜198 行目は、`jasmine.clock().install()` 済みで自動 fakeAsync の印があるとき、本体を勝手に `fakeAsync` で包む機能です（8 節の spec で使う）。

📄 `angular/packages/zone.js/lib/jasmine/jasmine.ts` L312–349 （▶ の行: 312, 323, 335–337, 343, 347）

```ts
312 ▶       ZoneQueueRunner.prototype.execute = function () {
313 │         let zone: Zone | null = Zone.current;
314 │         let isChildOfAmbientZone = false;
315 │         while (zone) {
316 │           if (zone === ambientZone) {
317 │             isChildOfAmbientZone = true;
318 │             break;
319 │           }
320 │           zone = zone.parent;
321 │         }
322 │ 
323 ▶         if (!isChildOfAmbientZone) throw new Error('Unexpected Zone: ' + Zone.current.name);
324 │ 
325 │         // This is the zone which will be used for running individual tests.
326 │         // It will be a proxy zone, so that the tests function can retroactively install
327 │         // different zones.
328 │         // Example:
329 │         //   - In beforeEach() do childZone = Zone.current.fork(...);
330 │         //   - In it() try to do fakeAsync(). The issue is that because the beforeEach forked the
331 │         //     zone outside of fakeAsync it will be able to escape the fakeAsync rules.
332 │         //   - Because ProxyZone is parent fo `childZone` fakeAsync can retroactively add
333 │         //     fakeAsync behavior to the childZone.
334 │ 
335 ▶         this.testProxyZoneSpec = new ProxyZoneSpec();
336 ▶         this.testProxyZone = ambientZone.fork(this.testProxyZoneSpec);
337 ▶         if (!Zone.currentTask) {
338 │           // if we are not running in a task then if someone would register a
339 │           // element.addEventListener and then calling element.click() the
340 │           // addEventListener callback would think that it is the top most task and would
341 │           // drain the microtask queue on element.click() which would be incorrect.
342 │           // For this reason we always force a task when running jasmine tests.
343 ▶           Zone.current.scheduleMicroTask('jasmine.execute().forceTask', () =>
344 │             QueueRunner.prototype.execute.call(this),
345 │           );
346 │         } else {
347 ▶           _super.prototype.execute.call(this);
348 │         }
349 │       };
```

ProxyZone を作るのはここです。jasmine の `QueueRunner`（1 つのテストの `beforeEach`・`it`・`afterEach` を順に呼ぶ係）を継承した `ZoneQueueRunner` の `execute` で、335〜336 行目、**実行のたびに `new ProxyZoneSpec()` と、それで fork した `testProxyZone`** を作ります。同じ queueRunner の中の `beforeEach` と `it` は同じ ProxyZone を使います（core の spec の ``describe('only one `fakeAsync` zone per test')`` がそれを確かめている）。325〜333 行目の注記の例が、ProxyZone が必要な理由です。`beforeEach` で fork した子ゾーンも ProxyZone の子なので、あとから delegate を差し替えれば子ゾーンのタイマーまで fakeAsync に入ります。

📄 `angular/packages/zone.js/lib/jasmine/jasmine.ts` L250–270 （▶ の行: 253, 256–258, 262, 266–268）

```ts
250 │     privateApis.QueueRunner = (function (_super) {
251 │       __extends(ZoneQueueRunner, _super);
252 │       function ZoneQueueRunner(this: QueueRunner, attrs: QueueRunnerAttrs) {
253 ▶         if (attrs.onComplete) {
254 │           attrs.onComplete = ((fn) => () => {
255 │             // All functions are done, clear the test zone.
256 ▶             this.testProxyZone = null;
257 ▶             this.testProxyZoneSpec = null;
258 ▶             ambientZone.scheduleMicroTask('jasmine.onComplete', fn);
259 │           })(attrs.onComplete);
260 │         }
261 │ 
262 ▶         const nativeSetTimeout = global[Zone.__symbol__('setTimeout')];
263 │         const nativeClearTimeout = global[Zone.__symbol__('clearTimeout')];
264 │         if (nativeSetTimeout) {
265 │           // should run setTimeout inside jasmine outside of zone
266 ▶           attrs.timeout = {
267 ▶             setTimeout: nativeSetTimeout ? nativeSetTimeout : global.setTimeout,
268 ▶             clearTimeout: nativeClearTimeout ? nativeClearTimeout : global.clearTimeout,
269 │           };
270 │         }
```

256〜258 行目、全部終わったら ProxyZone を捨てます。262〜269 行目、jasmine 自身のタイムアウトの監視には**書き換える前の本物の**`setTimeout` を渡します。そうしないと監視のタイマーまで fakeAsync の偽の時計に入ってしまいます。

📄 `angular/packages/zone.js/lib/jasmine/jasmine.ts` L286–311 （▶ の行: 289–292, 296, 298, 301）

```ts
286 │         // patch attrs.onException
287 │         const onException = attrs.onException;
288 │         attrs.onException = function (this: undefined | QueueRunner, error: any) {
289 ▶           if (
290 ▶             error &&
291 ▶             error.message ===
292 ▶               'Timeout - Async callback was not invoked within timeout specified by jasmine.DEFAULT_TIMEOUT_INTERVAL.'
293 │           ) {
294 │             // jasmine timeout, we can make the error message more
295 │             // reasonable to tell what tasks are pending
296 ▶             const proxyZoneSpec: any = this && this.testProxyZoneSpec;
297 │             if (proxyZoneSpec) {
298 ▶               const pendingTasksInfo = proxyZoneSpec.getAndClearPendingTasksInfo();
299 │               try {
300 │                 // try catch here in case error.message is not writable
301 ▶                 error.message += pendingTasksInfo;
302 │               } catch (err) {}
303 │             }
304 │           }
305 │           if (onException) {
306 │             onException.call(this, error);
307 │           }
308 │         };
309 │ 
310 │         _super.call(this, attrs);
311 │       }
```

waitForAsync の本体が `setInterval` を止めないと、4 節の 220 行目でマクロタスクの数が 0 にならず、`done` が呼ばれません。jasmine がタイムアウトで落とすとき、291〜292 行目のメッセージなら 298 行目で ProxyZone が覚えている残りのタスク（5 節の 208 行目で積んだ物）を `--Pending async tasks are: [...]` の形で付け足します。

### jasmine.clock() との橋渡し

📄 `angular/packages/zone.js/lib/jasmine/jasmine.ts` L91–121 （▶ の行: 94–95, 100–103, 108, 112）

```ts
 91 │     if (!disablePatchingJasmineClock) {
 92 │       // need to patch jasmine.clock().mockDate and jasmine.clock().tick() so
 93 │       // they can work properly in FakeAsyncTest
 94 ▶       const originalClockFn: Function = ((jasmine as any)[symbol('clock')] = jasmine['clock']);
 95 ▶       (jasmine as any)['clock'] = function () {
 96 │         const clock = originalClockFn.apply(this, arguments);
 97 │         if (!clock[symbol('patched')]) {
 98 │           clock[symbol('patched')] = symbol('patched');
 99 │           const originalTick = (clock[symbol('tick')] = clock.tick);
100 ▶           clock.tick = function () {
101 ▶             const fakeAsyncZoneSpec = Zone.current.get('FakeAsyncTestZoneSpec');
102 ▶             if (fakeAsyncZoneSpec) {
103 ▶               return fakeAsyncZoneSpec.tick.apply(fakeAsyncZoneSpec, arguments);
104 │             }
105 │             return originalTick.apply(this, arguments);
106 │           };
107 │           const originalMockDate = (clock[symbol('mockDate')] = clock.mockDate);
108 ▶           clock.mockDate = function () {
109 │             const fakeAsyncZoneSpec = Zone.current.get('FakeAsyncTestZoneSpec');
110 │             if (fakeAsyncZoneSpec) {
111 │               const dateTime = arguments.length > 0 ? arguments[0] : new Date();
112 ▶               return fakeAsyncZoneSpec.setFakeBaseSystemTime.apply(
113 │                 fakeAsyncZoneSpec,
114 │                 dateTime && typeof dateTime.getTime === 'function'
115 │                   ? [dateTime.getTime()]
116 │                   : arguments,
117 │               );
118 │             }
119 │             return originalMockDate.apply(this, arguments);
120 │           };
121 │           // for auto go into fakeAsync feature, we need the flag to enable it
```

`jasmine.clock()` の戻り値の `tick` を 100〜106 行目で包み、fakeAsync の中なら 103 行目で `FakeAsyncTestZoneSpec.tick`（前の回）を呼びます。`mockDate` も 108〜120 行目で fakeAsync の中なら偽の時計の基準時刻を変えます。この引用のすぐ後（ここには載せていない 122〜134 行目）では、自動 fakeAsync の印があるときだけ `install` / `uninstall` を「印を付けるだけ」に替えます。

## 7. Vitest では

6 節のパッチは jasmine の `getEnv()` を書き換えるので、Vitest には効きません。CLI の `@angular/build:unit-test` が zone.js をどう読み込むかは[cli-unit-test](../cli/12-cli-unit-test.md)で見ました（`getZoneTestingStrategy`）。その結果、テストの初期化ファイルに入る行はこれです。

📄 `angular-cli/packages/angular/build/src/builders/unit-test/runners/vitest/build-options.ts` L47–60 （▶ の行: 48–51, 54, 56, 58–59）

```ts
47 │   let zoneTestingSnippet = '';
48 ▶   if (zoneTestingStrategy === 'static') {
49 ▶     zoneTestingSnippet = `import 'zone.js/testing';`;
50 ▶   } else if (zoneTestingStrategy === 'dynamic') {
51 ▶     zoneTestingSnippet = `if (typeof Zone !== 'undefined') {
52 │       // 'zone.js/testing' is used to initialize the ZoneJS testing environment.
53 │       // It must be imported dynamically to avoid a static dependency on 'zone.js'.
54 ▶       await import('zone.js/testing');
55 │     }`;
56 ▶   } else if (zoneTestingStrategy === 'dynamic-zone') {
57 │     zoneTestingSnippet = `
58 ▶       await import('zone.js');
59 ▶       await import('zone.js/testing');`;
60 │   }
```

どの場合も読み込むのは `zone.js/testing` まで（49・54・59 行目）で、Vitest 用のパッチは入りません。ProxyZone のクラスはあっても Vitest の `it` は ProxyZone の中で走らないので、fakeAsync は第 13 回の 959 行目の `assertPresent()` で、waitForAsync は 296 行目で止まります。zone.js には Vitest 用のパッチが別の入口（`zone.js/plugins/vitest-patch`、`lib/vitest/vitest.ts`）として 2025-05-14 のコミット `62c6e3b7ee8` で入っています。

📄 `angular/packages/zone.js/lib/vitest/vitest.ts` L67–97 （▶ の行: 68–70, 76, 82, 91, 96）

```ts
67 │     // Setup testing related Zone instances
68 ▶     const rootZone = Zone.current;
69 ▶     const syncZone = rootZone.fork(new Zone.SyncTestZoneSpec('vitest.describe'));
70 ▶     const proxyZone = rootZone.fork(new Zone.ProxyZoneSpec());
71 │ 
72 │     /**
73 │      * Gets a function wrapping the body of a vitest `describe` block to execute in a
74 │      * synchronous-only zone.
75 │      */
76 ▶     function wrapDescribeInZone(describeBody: Function): Function {
77 │       // `describe` might be called without a body (e.g. `describe.todo`)
78 │       if (typeof describeBody !== 'function') {
79 │         return describeBody;
80 │       }
81 │       return function (this: unknown, ...args: unknown[]) {
82 ▶         return syncZone.run(describeBody, this, args);
83 │       };
84 │     }
85 │ 
86 │     /**
87 │      * Gets a function wrapping the body of a vitest `it/beforeEach/afterEach` block to
88 │      * execute in a ProxyZone zone.
89 │      * This will run in the `proxyZone`.
90 │      */
91 ▶     function wrapTestInZone(testBody: Function): Function {
92 │       if (typeof testBody !== 'function') {
93 │         return testBody;
94 │       }
95 │       const wrappedFunc = function () {
96 ▶         return proxyZone.run(testBody, null, arguments as any);
97 │       };
```

jasmine 版との違いは 70 行目です。**ProxyZone をファイルの読み込み時に 1 つだけ作り**、96 行目で全部のテストをその同じ ProxyZone で走らせます（jasmine 版はテストごとに作る）。adev のガイドも、このパッチを polyfills に足す方法を書いています。

📄 `angular/adev/src/content/guide/testing/migrating-to-vitest.md` L226–233 （▶ の行: 228, 230）

```md
226 │ ## `zone.js` Vitest patch
227 │ 
228 ▶ In order to use functions like `fakeAsync`, `flush` or `waitForAsync`, or to enable your existing tests to work with them, you can add `zone.js/plugins/vitest-patch` to your test target polyfills in `angular.json`.
229 │ 
230 ▶ Regardless, we strongly recommend you start planning to convert your existing test suites to native `async` and Vitest fake timers, since this is the established approach.
231 │ 
232 │ See [an example here](/guide/testing/components-scenarios#async-test-with-a-vitest-fake-timers) for fake timers usage with Vitest.
233 │ 
```

228 行目で `zone.js/plugins/vitest-patch` を足せば `fakeAsync`・`flush`・`waitForAsync` が使えると書き、230 行目で「ネイティブの async と Vitest の偽タイマーへの移行を強く勧める」と続けています。このサイトの環境（zone.js なし）で実際に何が起きるかは[次の回](16-testing-zoneless-time.md)で確かめます。

## ここまでの呼び出し

- `ZoneQueueRunner.execute()` — zone.js/lib/jasmine/jasmine.ts L312 — *new ProxyZoneSpec() と testProxyZone（L335-336）*
- 👤 `it('...', waitForAsync(fn))` — あなたの spec
  - `waitForAsync(fn)` — core/testing/src/async.ts L35-37 — *Zone\[\_\_symbol\_\_('asyncTest')\](fn)*
    - `asyncTest(fn)` — zone-spec/async-test.ts L236 — *function (done) を返す（L241）*
  - `wrapTestInZone → runInTestZone` — jasmine.ts L211 / L182 — *testProxyZone.run(testBody, this, \[done\])（L200）*
    - `runInTestZone(fn, this, undefined, done, fail)` — async-test.ts L270
      - `new AsyncTestZoneSpec(...)` — L302 — *ProxyZone の親で（L301）*
      - `proxyZoneSpec.setDelegate(testZoneSpec)` — L329
      - `Zone.current.runGuarded(fn)` — L332 — *onInvoke で \_isSync = true（L165）*
        - `onHasTask` — L199 — *数が 0 になるたび \_finishCallbackIfDone（L218 / L221）*
          - `runZone.run(() => setTimeout(..., 0))` — L76-82 — *もう 1 回待つ*
            - `finishCallback() → setDelegate(previousDelegate) → done()` — L303-314

## テストと直し方

waitForAsync の振る舞いを利用者の形で確かめている spec は `packages/platform-browser/test/testing_public_spec.ts` の `describe('public testing API')`（:156）の中の `describe('using the async helper with context passing')`（:157）と、`describe('errors')`（:923）の 2 本（`should fail when an asynchronous error is thrown` :941、`should fail when a returned promise is rejected` :963）です。

📄 `angular/packages/platform-browser/test/testing_public_spec.ts` L157–187 （▶ の行: 164–165, 172, 175, 179–180, 183–185）

```ts
157 │   describe('using the async helper with context passing', () => {
158 │     type TestContext = {actuallyDone: boolean};
159 │ 
160 │     beforeEach(function (this: TestContext) {
161 │       this.actuallyDone = false;
162 │     });
163 │ 
164 ▶     afterEach(function (this: TestContext) {
165 ▶       expect(this.actuallyDone).toEqual(true);
166 │     });
167 │ 
168 │     it('should run normal tests', function (this: TestContext) {
169 │       this.actuallyDone = true;
170 │     });
171 │ 
172 ▶     it('should run normal async tests', function (this: TestContext, done) {
173 │       setTimeout(() => {
174 │         this.actuallyDone = true;
175 ▶         done();
176 │       }, 0);
177 │     });
178 │ 
179 ▶     it('should run async tests with tasks', waitForAsync(function (this: TestContext) {
180 ▶       setTimeout(() => (this.actuallyDone = true), 0);
181 │     }));
182 │ 
183 ▶     it('should run async tests with promises', waitForAsync(function (this: TestContext) {
184 ▶       const p = new Promise((resolve, reject) => setTimeout(resolve, 10));
185 ▶       p.then(() => (this.actuallyDone = true));
186 │     }));
187 │   });
```

164〜166 行目の `afterEach` が「本当に終わってから次へ進んだか」を見る仕掛けです。179〜181 行目は 4 節のマクロタスク、183〜186 行目は 10ms の setTimeout のあとの `then`（マクロ → マイクロ）を待てているかを確かめます。

📄 `angular/packages/core/test/fake_async_spec.ts` L410–433 （▶ の行: 412, 416, 422–425, 427–428）

```ts
410 │ describe('ProxyZone', () => {
411 │   beforeEach(() => {
412 ▶     ProxyZoneSpec.assertPresent();
413 │   });
414 │ 
415 │   afterEach(() => {
416 ▶     ProxyZoneSpec.assertPresent();
417 │   });
418 │ 
419 │   it('should allow fakeAsync zone to retroactively set a zoneSpec outside of fakeAsync', () => {
420 │     ProxyZoneSpec.assertPresent();
421 │     let state: string = 'not run';
422 ▶     const testZone = Zone.current.fork({name: 'test-zone'});
423 ▶     fakeAsync(() => {
424 ▶       testZone.run(() => {
425 ▶         Promise.resolve('works').then((v) => (state = v));
426 │         expect(state).toEqual('not run');
427 ▶         flushMicrotasks();
428 ▶         expect(state).toEqual('works');
429 │       });
430 │     })();
431 │     expect(state).toEqual('works');
432 │   });
433 │ });
```

core の `fake_async_spec.ts` の一番外の `describe('ProxyZone')` は、6 節の 325〜333 行目の注記そのものです。422 行目で fakeAsync の外で fork した子ゾーンの中の `then` が、427 行目の `flushMicrotasks()` で流れます。この spec は[第 13 回](13-testing-fake-async.md)のコマンド（`"^(fake async|ProxyZone) "`）にも含まれていて、34 本のうちの 1 本です。

📄 `angular/packages/zone.js/test/zone-spec/clock-tests/fake-async-unpatched-clock.spec.ts` L15–46 （▶ の行: 15, 18, 23, 40–41, 43, 45）

```ts
15 ▶ jasmine.clock().uninstall();
16 │ 
17 │ describe('fake async unpatched clock tests', () => {
18 ▶   const fakeAsync = (Zone as any)[Zone.__symbol__('fakeAsyncTest')].fakeAsync;
19 │   let spy: any;
20 │ 
21 │   beforeEach(() => {
22 │     spy = jasmine.createSpy('timer');
23 ▶     jasmine.clock().install();
24 │   });
25 │ 
26 │   afterEach(() => {
27 │     jasmine.clock().uninstall();
28 │   });
29 │ 
30 │   it('should check date type correctly', fakeAsync(() => {
31 │     const d: any = new Date();
32 │     expect(d instanceof Date).toBe(true);
33 │   }));
34 │ 
35 │   it('should check date type correctly without fakeAsync', () => {
36 │     const d: any = new Date();
37 │     expect(d instanceof Date).toBe(true);
38 │   });
39 │ 
40 ▶   it('should tick correctly', fakeAsync(() => {
41 ▶     jasmine.clock().mockDate();
42 │     const start = Date.now();
43 ▶     jasmine.clock().tick(100);
44 │     const end = Date.now();
45 ▶     expect(end - start).toBe(100);
46 │   }));
```

zone.js の Node のテストで fakeAsync を使うのは `test/zone-spec/clock-tests/` だけです。`test_unpatched` は 18 行目で窓口から `fakeAsync` を取り出し、41・43 行目の `jasmine.clock()` が 6 節の 100〜120 行目の橋渡しで偽の時計を動かすことを確かめます。`test_patched` は自動 fakeAsync の印（`enable-clock-patch.ts`）を立て、it に fakeAsync を書かずに同じことを確かめます（ファイルの describe の名前は、なぜか両方とも `fake async unpatched clock tests`）。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/platform-browser/test:test --test_arg=--filter="^public testing API (using the async helper|errors should fail when)" --test_output=all
pnpm bazel test //packages/zone.js/test/zone-spec/clock-tests:test_patched //packages/zone.js/test/zone-spec/clock-tests:test_unpatched --test_arg=--filter="^fake async unpatched clock tests" --test_output=all
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
# 1 本目
Ran 6 of 159 specs
6 specs, 0 failures
INFO: Build completed successfully, 23 total actions
//packages/platform-browser/test:test                                    PASSED in 1.1s

# 2 本目（2 つのターゲットを 1 回で）
==================== Test output for //packages/zone.js/test/zone-spec/clock-tests:test_patched:
6 specs, 0 failures
==================== Test output for //packages/zone.js/test/zone-spec/clock-tests:test_unpatched:
10 specs, 0 failures
INFO: Build completed successfully, 141 total actions
//packages/zone.js/test/zone-spec/clock-tests:test_patched               PASSED in 0.5s
//packages/zone.js/test/zone-spec/clock-tests:test_unpatched             PASSED in 0.8s
```

1. **数の読み方**

   1 本目は `//packages/platform-browser/test:test` で、shard に分かれないので `Ran 6 of 159 specs` が 1 回だけ出ます（:157 の 4 本 + :941・:963 の 2 本）。2 本目の zone.js のターゲットは、フィルタがファイルの全部の it に一致したので `Ran N of M` の行が出ず、`6 specs` と `10 specs` だけが出ます。jasmine は一部だけ選んだときにだけ `Ran` の行を出すからです。
2. **直すとしたら**

   終わりの決め方は `async-test.ts` の `_finishCallbackIfDone` と `onHasTask`、ProxyZone の差し替えは `proxy.ts` の `setDelegate`、jasmine への差し込みは `jasmine.ts` の `wrapTestInZone` と `ZoneQueueRunner` です。Angular 側から見える振る舞いなら `testing_public_spec.ts`、zone.js の内部なら `packages/zone.js/test/zone-spec/async-test.spec.ts` と `proxy.spec.ts`（どちらもブラウザのターゲットでだけ走る。第 13 回）に足すのが入口です。
3. **issue を読むときの手がかり**

   「waitForAsync のテストが終わらない / タイムアウトする」は、まず `--Pending async tasks are` の中身（6 節の 298 行目）を見ます。「Vitest で Expected to be running in 'ProxyZone'」は 7 節です。issue の探し方は[第 20 回](20-testing-issues.md)で扱います。

## 聞かれそうな質問

**Q. waitForAsync と async/await は何が違いますか？**

待つ物が違います。`async` の it は、返した Promise が resolve されるのを jasmine が待つだけです。`await` しなかった `setTimeout` は待ちません。waitForAsync は 4 節の 216〜222 行目のとおり、**ProxyZone の中で予約されたマイクロタスクとマクロタスクの数が 0 になるまで**待つので、本体が何も返さなくても、中で予約した物を全部待ちます。逆に言うと、止めない `setInterval` があるといつまでも終わりません（6 節のタイムアウト）。zone.js が無い環境では使えません（次の回）。

**Q. Vitest で zone.js/testing は使えますか？**

読み込むことはできますが、それだけでは fakeAsync も waitForAsync も動きません。jasmine のパッチ（6 節）は jasmine の `getEnv()` を書き換える物で、Vitest の `it` は ProxyZone の中で走らないからです。CLI の unit-test builder は polyfills に `zone.js` があるとき `zone.js/testing` を読み込みます（7 節の 49 行目。判断の流れは [cli-unit-test](../cli/12-cli-unit-test.md)）。Vitest で使うには、別の入口の `zone.js/plugins/vitest-patch` を polyfills に足し、`describe` / `it` を共有の ProxyZone で包ませます（7 節の 70・96 行目、adev の 228 行目）。

**Q. ProxyZone はいつ作られますか？**

jasmine では、`ZoneQueueRunner.execute()` の 335〜336 行目で、queueRunner が実行されるたびに 1 つ作られます。1 つのテストの `beforeEach`・`it`・`afterEach` は同じ ProxyZone を使い、全部終わると 256〜257 行目で捨てられます。Vitest のパッチでは、ファイルの読み込み時に 70 行目で 1 つだけ作られ、全部のテストで共有されます。

**Q. fakeAsync で「Expected to be running in 'ProxyZone'」と言われるのはなぜですか？**

fakeAsync の包みを ProxyZone の外で呼んだからです。前の回の 959 行目が 5 節の 48〜54 行目の `assertPresent()` を呼び、`Zone.current.get('ProxyZoneSpec')` が見つからないと、このエラーです。jasmine なら it の本体は 200・202 行目で ProxyZone の中なので出ません。`setTimeout` のコールバックの中など、テストの外のゾーンで fakeAsync を呼ぶと出ます。`ProxyZoneSpec` のクラスそのものが無いときは別の文（5 節の 21〜22 行目）です。

**Q. waitForAsync の中で返した Promise が reject されたら？**

jasmine の包み（241〜257 行目）は本体の戻り値を返さないので、jasmine は Promise を見ていません。それでも、処理されない reject は zone.js の Promise がエラーとしてゾーンに渡し、4 節の 191〜194 行目で `failCallback` → `done.fail` になります。`testing_public_spec.ts` の `should fail when a returned promise is rejected`（:963）が、`err.message` が `'baz'` になることを確かめています。

## 読み終えて

- `waitForAsync` は `Zone[__symbol__('asyncTest')]` を呼ぶだけ。jasmine では `function (done)` を返し、jasmine に「done を待つテスト」と思わせる。
- `AsyncTestZoneSpec` は `onHasTask` で 2 つの数を見て、両方 0 になったら ProxyZone の外の `setTimeout(0)` でもう 1 回待ってから `done` を呼ぶ。同期だけのテストは `onInvoke` の finally で判定する。
- ProxyZone は delegate を 1 つ持てるゾーンで、fakeAsync も waitForAsync も新しいゾーンを作らず delegate を差し替える。`setDelegate` は `properties` も写す。
- jasmine のパッチは `describe` を SyncTestZone、`it` / `beforeEach` を queueRunner ごとの ProxyZone で走らせる。Vitest は別のパッチ（`vitest-patch`）が要る。
- 確かめるコマンドは platform-browser の 6 本と、zone.js の clock-tests の 6 本 + 10 本。

---

← 前: [偽の時計：Scheduler が setTimeout と setInterval を並べて進める](14-testing-fake-async-scheduler.md)  
次: [zone を使わないテストの時間：whenStable・偽タイマー・zone 依存の道具の境目](16-testing-zoneless-time.md) →
