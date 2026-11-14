[目次](../README.md) › [ErrorHandler とエラーの行き先](README.md) › 第 2 回 / 全 6 回

# エラーを捕まえる場所の地図：リスナー・effect・変更検知・PendingTasks

> テンプレートのリスナー（テンプレートで書いた output も）、コードで subscribe した output、effect と afterRender、ApplicationRef.tick（338818ce899）、PendingTasks.run（7232ce5b17c・0e16bb701f2）、async パイプ（739cadae62f）が、それぞれどの行で捕まえてどの入口に渡すかの地図。root の effect が 1 つ投げると後ろの effect が止まったまま残ること、捕まえない場所（Promise を返すリスナー、#69228）も並べる。ページの上の本物で、場所ごとにエラーを投げて届き方を表にする。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/err-where-caught)

---

利用者のコードが投げたエラーを、Angular は**どこで** try / catch し、**どの入口**に渡すのか。この章では、テンプレートのリスナー・`output()`・effect・`afterRender`・変更検知・`PendingTasks.run`・async パイプを 1 枚の地図にし、**捕まえない場所**（Promise を返すリスナーなど、#69228）と、捕まえたあとに**止まったまま残るもの**（root の effect）も並べます。最後に、ページの上の本物で場所ごとにエラーを投げ、届き方を表にします。

読む対象は `packages/core/src/render3/reactivity/root_effect_scheduler.ts`・`application/application_ref.ts`・`packages/common/src/pipes/async_pipe.ts` と、各場所の spec（`listener_spec.ts`・`output_function_spec.ts`・`reactivity_spec.ts`・`pending_tasks_spec.ts`・`after_render_hook_spec.ts`）です。入口 `INTERNAL_APPLICATION_ERROR_HANDLER` と ErrorHandler の関係は[第 1 回](01-err-handler-core.md)、window に届いたエラーは[第 3 回](03-err-global-listeners.md)で扱います。

1. [1. ErrorHandler と内部の入口](01-err-handler-core.md)
2. **2. エラーを捕まえる場所の地図**（この章）
3. [3. ブラウザの全体のエラー](03-err-global-listeners.md)
4. [4. @boundary の実行時](04-err-boundary-runtime.md)
5. [5. @boundary のコンパイル](05-err-boundary-compile.md)
6. [6. spec と issue](06-err-tests-issues.md)

## 1. 地図：エラーを渡している行

まず、フレームワークの中で「捕まえたエラーを渡している行」を grep で全部出します。

📄 `ターミナル（grep。2026-11-15、8576f161ae4）`

```
$ cd ~/angular-research/angular
$ grep -rnE "handleUncaughtError\(|applicationErrorHandler\(|internalErrorHandler\(|this\.errorHandler\??(\.handleError)?\(|catch\(this\.errorHandler|errorHandler\??\.handleError\(|ERROR_HANDLER\)\(e\)|=> errorHandler\(e\)|next: exceptionHandler" \
    packages/core/src packages/common/src packages/router/src --include='*.ts' | grep -v "function handleUncaughtError"
packages/core/src/pending_tasks.ts:79:      fn().catch(this.errorHandler).finally(removeTask);
packages/core/src/pending_tasks.ts:81:      this.errorHandler(err);
packages/core/src/change_detection/scheduling/ng_zone_scheduling.ts:63:            this.applicationErrorHandler(e);
packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts:300:      this.applicationErrorHandler(e);
packages/core/src/change_detection/scheduling/exhaustive_check_no_changes.ts:40:              errorHandler.handleError(e);
packages/core/src/defer/triggering.ts:279:        handleUncaughtError(lView, error);
packages/core/src/defer/rendering.ts:217:      handleUncaughtError(hostLView, error);
packages/core/src/platform/bootstrap.ts:110:        next: exceptionHandler,
packages/core/src/platform/bootstrap.ts:226:        ngZone.runOutsideAngular(() => errorHandler(e));
packages/core/src/platform/bootstrap.ts:234:    ngZone.runOutsideAngular(() => errorHandler(e));
packages/core/src/authoring/output/output_emitter_ref.ts:109:          this.errorHandler?.handleError(err);
packages/core/src/render3/instructions/boundary.ts:145:                  errorHandler.handleError(error);
packages/core/src/render3/instructions/boundary.ts:177:                errorHandler.handleError(boundaryError);
packages/core/src/render3/view/listeners.ts:94:    handleUncaughtError(lView, error);
packages/core/src/render3/after_render/manager.ts:95:          this.errorHandler?.handleError(err);
packages/core/src/application/application_ref.ts:743:      this.internalErrorHandler(e);
packages/common/src/pipes/async_pipe.ts:208:      (e) => this.applicationErrorHandler(e),
packages/router/src/router.ts:354:        this.injector.get(ɵINTERNAL_APPLICATION_ERROR_HANDLER)(e);
packages/router/src/directives/router_link.ts:515:      this.applicationErrorHandler(e);
```

| 場所 | 捕まえる行（grep） | 渡す先 | 行を読んだ章 |
| --- | --- | --- | --- |
| テンプレートのイベントのリスナー（DOM も、テンプレートで書いた output も） | listeners.ts:94 | 入口（`handleUncaughtError`） | [testing-errors](../testing/12-testing-errors.md)・[zoneless-listener-path](../zoneless/08-zoneless-listener-path.md) |
| `output()` をコードで subscribe した関数 | output\_emitter\_ref.ts:109 | ErrorHandler を直接 | [signals-model-output](../signals/13-signals-model-output.md) |
| effect（root もビューも）・テンプレートの式・ライフサイクルフック | 捕まえず tick の外へ。スケジューラが zoneless\_scheduling\_impl.ts:300 / ng\_zone\_scheduling.ts:63 | 入口 | [zoneless-tick](../zoneless/05-zoneless-tick.md)・[cd-effects](../cd/09-cd-effects.md) |
| `afterRender` / `afterNextRender` | after\_render/manager.ts:95 | ErrorHandler を直接 | [cd-after-render](../cd/08-cd-after-render.md) |
| 起動時の最初の tick（`bootstrap` で根のコンポーネントを付けたとき） | application\_ref.ts:743 | 入口 | [boot-application-ref](../boot/10-boot-application-ref.md) |
| `PendingTasks.run` | pending\_tasks.ts:79（reject）・81（同期） | 入口 | [zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md) |
| async パイプ | async\_pipe.ts:208 | 入口 | この章の 6 節 |
| `@defer` の状態の切り替え・読み込みの失敗 | rendering.ts:217・triggering.ts:279 | 入口（`handleUncaughtError`） | [fix-defer-error-stable](../fix/05-fix-defer-error-stable.md) |
| zone.js の `onError`・起動の途中の失敗 | bootstrap.ts:110・226・234 | 入口 | [zone-ngzone-fork](../zone/09-zone-ngzone-fork.md)・[boot-app-initializer](../boot/09-boot-app-initializer.md) |
| Router：戻る・進むでのナビゲーション、`RouterLink` のクリック | router.ts:354・router\_link.ts:515 | 入口 | [router-events](../router/17-router-events.md)（`withNavigationErrorHandler`） |
| エラーの境界 | boundary.ts:145・177 | ErrorHandler を直接 | [第 4 回](04-err-boundary-runtime.md) |

「入口」は[第 1 回](01-err-handler-core.md)の `INTERNAL_APPLICATION_ERROR_HANDLER` の関数で、最後は ErrorHandler に渡ります。違いはテストのときに出ます（入口を通るものだけを TestBed が投げ直す。[testing-errors](../testing/12-testing-errors.md)）。以下では、表のうち地図だけでは分からないところを 1 つずつ読みます。

## 2. リスナーと output：同じ output でも道が 2 つ

1. **テンプレートで書いたリスナー**

   `(click)="boom()"` も、子コンポーネントの output に書いた `(ping)="onPing()"` も、テンプレートの `ɵɵlistener` が `wrapListener` で包んでから登録します（[zoneless-listener-path](../zoneless/08-zoneless-listener-path.md)）。包んだ関数の中の `executeListenerWithErrorHandling` が try / catch して `handleUncaughtError` に渡すので、**output でもテンプレートで書けば入口を通ります**。
2. **コードで subscribe した関数**

   `child.ping.subscribe(fn)` の `fn` は包まれません。`OutputEmitterRef.emit` が購読者ごとに try / catch し、`inject(ErrorHandler, {optional: true})` で取っておいた ErrorHandler に渡して、次の購読者へ進みます（[signals-model-output](../signals/13-signals-model-output.md)）。7 節のデモの「output をコードで subscribe」の行では、先に登録されたテンプレートの `(ping)` も呼ばれ、投げたのは 1 回だけ ErrorHandler に届きました。
3. **同じ要素の残りのリスナー**

   1 つのリスナーが投げても、同じ要素・同じイベントにまとめられた次のリスナーは呼ばれます（`wrapListener` の `__ngNextListenerFn__` のループ）。それを固めているのが「テストと直し方」の listener\_spec.ts の it です。

## 3. effect：捕まえるのはスケジューラ。root の effect は止まったまま残る

effect の関数を呼ぶ側（`EffectNode.run` と `runEffect`）は try / finally だけで catch を持たず、root の effect を順に流す `flush` には try もありません。投げたエラーは `ApplicationRef._tick` の外まで出て、スケジューラの `ChangeDetectionSchedulerImpl.tick` の catch（zoneless\_scheduling\_impl.ts:300）から入口に渡ります（[zoneless-tick](../zoneless/05-zoneless-tick.md)）。ここで問題になるのは、**同じ tick の残りの仕事**です。

📄 `angular/packages/core/src/application/application_ref.ts` L614–622 （▶ の行: 617, 619–621）

```ts
614 │   /**
615 │    * Perform a single synchronization pass.
616 │    */
617 ▶   private synchronizeOnce(): void {
618 │     // First, process any dirty root effects.
619 ▶     if (this.dirtyFlags & ApplicationRefDirtyFlags.RootEffects) {
620 ▶       this.dirtyFlags &= ~ApplicationRefDirtyFlags.RootEffects;
621 ▶       this.rootEffectScheduler.flush();
622 │     }
```

📄 `angular/packages/core/src/render3/reactivity/root_effect_scheduler.ts` L130–137 （▶ の行: 132–133）

```ts
130 │       ranOneEffect = true;
131 │ 
132 ▶       // TODO: what happens if this throws an error?
133 ▶       handle.run();
134 │     }
135 │     return ranOneEffect;
136 │   }
137 │ }
```

1. **620 行目 先に旗を下ろす**

   `synchronizeOnce` は、root の effect が汚れているという旗 `RootEffects` を 620 行目で**先に**消してから、621 行目で `flush()` を呼びます。旗は、root の effect が汚れたときにスケジューラの `notify` が立てます（[cd-effects](../cd/09-cd-effects.md)）。
2. **133 行目 1 つが投げると、残りは走らない**

   `flushQueue` は待ち行列の effect を順に `handle.run()` します。1 つが投げるとループごと抜け、後ろの汚れた effect は**汚れたまま**残ります。132 行目のコメントは「これが投げたらどうなる？」という TODO のままです。
3. **次の tick でも走らない**

   旗は 620 行目で消えたままなので、次の tick の `synchronizeOnce` は 619 行目の if に入りません。残った effect が走るのは、**別の root の effect が汚れて旗が立ち直ったとき**だけです。zoneless では `appRef.tick()` を直接呼んでも旗は立たないので、走りません（下の記録の「appRef.tick() を直接もう 1 回」）。

📄 `Node で動かした再現（スクリプト）`

```
$ node root-effect-abort.mjs <22.2.6 を入れた node_modules>
$ node root-effect-abort.mjs <このサイトの node_modules（22.1.6）>

// root-effect-abort.mjs
// 再現: root の effect が投げると、同じ flush の後ろの root effect が走らず、そのまま止まる
// 使い方: node root-effect-abort.mjs <node_modules のディレクトリ>
const NM = process.argv[2];
// 開発モードの ImagePerformanceWarning が document を探さないように
globalThis.PerformanceObserver = undefined;
await import(NM + '/@angular/compiler/fesm2022/compiler.mjs');
const core = await import(NM + '/@angular/core/fesm2022/core.mjs');
const { createApplication } = await import(NM + '/@angular/platform-browser/fesm2022/platform-browser.mjs');
const { ErrorHandler, RendererFactory2, effect, signal, provideZonelessChangeDetection, VERSION } = core;
const log = [];
const appRef = await createApplication({
  providers: [
    provideZonelessChangeDetection(),
    // Node には document が無いので、描画の部品は無しにする（このスクリプトはビューを作らない）
    { provide: RendererFactory2, useValue: null },
    { provide: ErrorHandler, useValue: { handleError: (e) => log.push('handleError: ' + e.message) } },
  ],
});
const s = signal(0);
effect(() => { throw new Error('A throws'); }, { injector: appRef.injector });
effect(() => { log.push('B ran'); }, { injector: appRef.injector });
await appRef.whenStable();
log.push('--- whenStable 1');
appRef.tick();
log.push('--- appRef.tick() を直接もう 1 回');
effect(() => { log.push('C ran, s=' + s()); }, { injector: appRef.injector });
await appRef.whenStable();
log.push('--- C を作って whenStable');
appRef.destroy();
console.log('@angular/core ' + VERSION.full);
console.log(log.join('\n'));
```

📄 `出力（2026-11-15。22.2.6 と 22.1.6）`

```
@angular/core 22.2.6
handleError: A throws
--- whenStable 1
--- appRef.tick() を直接もう 1 回
B ran
C ran, s=0
--- C を作って whenStable
=====
@angular/core 22.1.6
handleError: A throws
--- whenStable 1
--- appRef.tick() を直接もう 1 回
B ran
C ran, s=0
--- C を作って whenStable
```

A が投げたあと、B は `whenStable` を待っても、tick を直接呼んでも走らず、3 つ目の C を作って旗が立ったときに初めて走りました。npm の 22.2.6 と、このサイトの 22.1.6 で同じです。7 節のデモ（ページの上の本物）でも「2 つ目の root effect は次のクリックのあとも一度も走っていない」になります。ErrorHandler には A のエラーが 1 回届くだけで、**B が止まっていることはどこにも出ません**。../angular-main（74961c66242）でも 132 行目のコメントと、旗を先に消す形は同じです。

1. **ビューの effect（コンポーネントの中の effect）**

   ビューの effect は、そのビューを直す途中（`refreshView` や、targeted の走査の `runEffectsInView`）で走ります（[cd-effects](../cd/09-cd-effects.md)）。投げると**そのビューの残りの更新は行われず**、エラーは tick の外へ出てスケジューラが入口に渡します。デモの「コンポーネントの effect」の行で、最初の描画のカウンタが空のままだったのはこのためです。次のクリックの tick では effect が走り直し、数は 1 になりました。
2. **angular-main の ea43e6c3934**

   エラーの境界が入った今、`refreshView` の catch は先に親のビューの `ON_ERROR`（境界）に渡します（[第 4 回](04-err-boundary-runtime.md)）。ところが targeted の走査で `runEffectsInView` を呼ぶ枝はその try の外にあり、そこで投げたビューの effect は境界に届かず ErrorHandler へ行っていました。../angular-main の ea43e6c3934（2026-09-27）が、その呼び出しを try で包んで同じ `handleViewError` に渡すようにしました。../angular（8576f161ae4）には、まだ入っていません。境界が無いアプリでは、どちらでも ErrorHandler に 1 回届きます。

## 4. afterRender：段ごとに捕まえ、その並びを止める

`AfterRenderImpl.execute` は段（earlyRead → write → mixedReadWrite → read）ごと・並びごとに try / catch し、投げた並びに `erroredOrDestroyed = true` を付けて ErrorHandler を直接呼びます（[cd-after-render](../cd/08-cd-after-render.md)）。だから `afterNextRender({ earlyRead, read })` の `earlyRead` が投げると、**同じ並びの `read` は走りません**（デモの afterNextRender の行）。別々に登録した `afterNextRender` は別の並びなので、1 つが投げても残りは走ります（「テストと直し方」の spec）。

## 5. ApplicationRef.tick を直接呼ぶと、呼んだ側に投げられる

📄 `git show 338818ce899（抜粋）`

```
$ git show 338818ce899 --format='%h %ad %s' --date=short -- packages/core/src/application/application_ref.ts packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts
338818ce899 2025-02-25 fix(core): Surface errors from `ApplicationRef.tick` to callsite (#60102)
（application_ref.ts。tickImpl の中）
@@ -603,9 +603,6 @@ export class ApplicationRef {
           view.checkNoChanges();
         }
       }
-    } catch (e) {
-      // Attention: Don't rethrow as it could cancel subscriptions to Observables!
-      this.internalErrorHandler(e);
     } finally {
       this._runningTick = false;
       this.tracingSnapshot?.dispose();
（application_ref.ts。_loadComponent）
@@ -754,7 +751,11 @@ export class ApplicationRef {
 
   private _loadComponent(componentRef: ComponentRef<any>): void {
     this.attachView(componentRef.hostView);
-    this.tick();
+    try {
+      this.tick();
+    } catch (e) {
+      this.internalErrorHandler(e);
+    }
（zoneless_scheduling_impl.ts。ChangeDetectionSchedulerImpl.tick）
@@ -292,7 +294,7 @@ export class ChangeDetectionSchedulerImpl implements ChangeDetectionScheduler {
       );
     } catch (e: unknown) {
       this.taskService.remove(task);
-      throw e;
+      this.applicationErrorHandler(e);
     } finally {
       this.cleanup();
     }
```

1. **tickImpl の catch を消した**

   それまで `tick()` は中で catch して入口に渡していました。コメントの「Observable の購読を止めないため」という理由より、公開の API がエラーを隠すほうを問題にして、呼んだ側に投げるようにしました（BREAKING CHANGE）。
2. **catch は呼ぶ側へ**

   代わりに、起動時の `_loadComponent` と、スケジューラの tick（zoneless は `ChangeDetectionSchedulerImpl`、zone は `NgZoneChangeDetectionScheduler`）が catch して入口に渡します。自分で `appRef.tick()` や `changeDetectorRef.detectChanges()` を呼んだときは、エラーは自分のコードに来ます（デモの tick の行。`detectChanges` の二重の報告を消した 491b0a4ead9 も同じ方針）。

## 6. PendingTasks.run と async パイプ

📄 `git show 0e16bb701f2`

```
$ git show 0e16bb701f2 --format='%h %ad %s' --date=short -- packages/core/src/pending_tasks.ts
0e16bb701f2 2026-05-27 fix(core): Handle synchronous errors in PendingTasks.run function
@@ -75,7 +75,12 @@ export class PendingTasks {
    */
   run(fn: () => Promise<unknown>): void {
     const removeTask = this.add();
-    fn().catch(this.errorHandler).finally(removeTask);
+    try {
+      fn().catch(this.errorHandler).finally(removeTask);
+    } catch (err) {
+      this.errorHandler(err);
+      removeTask();
+    }
   }
```

`PendingTasks.run` は 7232ce5b17c（2025-02）で、渡した async 関数の reject を `.catch(this.errorHandler)` で入口に渡すようになりました（同時に戻り値を返さなくなった BREAKING CHANGE）。それでも、`async` でない関数が `Promise` を返す前に同期で投げると `fn()` の呼び出し自体が投げ、作ったタスクが消えずに安定しないままでした。0e16bb701f2 がそれを try で包んでいます。今の行は [zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md) で引用しています。

📄 `angular/packages/common/src/pipes/async_pipe.ts` L34–53 （▶ の行: 38, 47–50）

```ts
34 │ class SubscribableStrategy implements SubscriptionStrategy {
35 │   createSubscription(
36 │     async: Subscribable<any>,
37 │     updateLatestValue: any,
38 ▶     onError: (e: unknown) => void,
39 │   ): Unsubscribable {
40 │     // Subscription can be side-effectful, and we don't want any signal reads which happen in the
41 │     // side effect of the subscription to be tracked by a component's template when that
42 │     // subscription is triggered via the async pipe. So we wrap the subscription in `untracked` to
43 │     // decouple from the current reactive context.
44 │     //
45 │     // `untracked` also prevents signal _writes_ which happen in the subscription side effect from
46 │     // being treated as signal writes during the template evaluation (which throws errors).
47 ▶     return untracked(() =>
48 ▶       async.subscribe({
49 ▶         next: updateLatestValue,
50 ▶         error: onError,
51 │       }),
52 │     );
53 │   }
```

📄 `angular/packages/common/src/pipes/async_pipe.ts` L86–100 （▶ の行: 88, 91–92, 95–97）

```ts
 86 │     // The lambda will no longer have access to it after the assignment, effectively
 87 │     // preventing any further calls to the original function and allowing it to be garbage collected.
 88 ▶     async.then(
 89 │       // Using optional chaining because we may have set it to `null`; since the promise
 90 │       // is async, the view might be destroyed by the time the promise resolves.
 91 ▶       (v) => updateLatestValue?.(v),
 92 ▶       (e) => onError?.(e),
 93 │     );
 94 │     return {
 95 ▶       unsubscribe: () => {
 96 ▶         updateLatestValue = null;
 97 ▶         onError = null;
 98 │       },
 99 │     };
100 │   }
```

1. **50 行目と 92 行目**

   async パイプは 739cadae62f（2025-02）から、Observable の `error`（50 行目）と Promise の reject（92 行目）を、`_subscribe` から渡された `onError`（入口を呼ぶ関数。grep の async\_pipe.ts:208）に渡します。コミットのメッセージのとおり、zone.js なら zone が捕まえていたものが、zoneless では誰にも捕まらず、SSR では Node のプロセスを落としうるからです。
2. **95〜97 行目 パイプが消えたあとの reject**

   パイプが破棄されると、Promise の購読の解除は `onError = null` にするだけです。そのあとで reject されると、92 行目の `onError?.(e)` は何もしません。88 行目の `then` に 2 つ目の関数が付いているので、この Promise の reject は「処理済み」になり、window の `unhandledrejection` にもなりません。**どこにも届かずに消えます**。

## 7. 捕まえない場所

1. **Promise を返すリスナー（#69228）**

   `(click)="save()"` の `save` が `async` だと、try / catch が見るのは「Promise を返したこと」だけで、あとの reject は捕まえません。zoneless ではそのまま window の `unhandledrejection` になります。2026-06-08 に開かれた #69228 は「返った Promise に catch を付けて ErrorHandler に渡してほしい」という要望で、atscott さんは「`addEventListener` はもともと同期の約束で、Promise を扱い始めると `async ngOnInit` や output にも同じことを期待される」と答えています（2026-11-15 時点で開いたまま）。
2. **フレームワークの外から呼ばれるもの**

   `setTimeout`・自分で付けた `addEventListener`・`fetch().then` の中など、Angular が呼んでいない関数のエラーは、どの表の行にも来ません。zoneless なら window の `error` / `unhandledrejection` へ行きます。それを ErrorHandler に戻すのが[第 3 回](03-err-global-listeners.md)の `provideBrowserGlobalErrorListeners` です。zone.js があれば、zone の中のタスクのエラーは zone が拾って `onError` から入口へ渡ります（表の bootstrap.ts:110）。

## 8. 呼び出しの連なり（root の effect）

- `ChangeDetectionSchedulerImpl.tick()` — zoneless\_scheduling\_impl.ts — *try（[zoneless-tick](../zoneless/05-zoneless-tick.md)）*
  - `ApplicationRef._tick() → tickImpl → synchronize` — application\_ref.ts
    - `synchronizeOnce()` — application\_ref.ts L617 — *L620 で RootEffects を先に消す*
      - `rootEffectScheduler.flush() → flushQueue(queue)` — root\_effect\_scheduler.ts
        - 👤 `handle.run()` → あなたの effect が throw — L133 — *後ろの effect は汚れたまま*
  - `catch (e) → this.applicationErrorHandler(e)` — zoneless\_scheduling\_impl.ts:300
    - 👤 `ErrorHandler.handleError(e)` — 入口を通って（[第 1 回](01-err-handler-core.md)）

## 9. デモ：場所ごとに投げる

> **🧪 DEMO — 場所ごとに投げて、届き方を表にする**
>
> 押すたびに `createApplication` で別のアプリを作り（providers に記録するだけの ErrorHandler と `provideZonelessChangeDetection()`）、コンポーネントを 1 つ描いてから、選んだ場所でエラーを 1 回投げます。そのあとコンポーネントのカウンタのボタンを押して、画面の数が増えるか（アプリが続けて動くか）を見ます。終わったら `destroy()` します。「Promise を返す (click)」は、返った Promise をデモが同じ流れの中で catch して、window に届く前に止めています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/err-where-caught)

2026-11-15 に本番ビルドを headless Chrome で開き、「全部を順に」を押した結果（@angular/core 22.1.6）です。コンソールの警告・エラーは 0 件でした。

| 場所 | ErrorHandler | 呼んだ側 | そのあと | 読み方 |
| --- | --- | --- | --- | --- |
| テンプレートの (click) | 1 回 | — | 0 → 1 | 2 節の 1 |
| Promise を返す (click) | **0 回** | — | 0 → 1 | 7 節の 1。reject はデモが catch |
| output にテンプレートで (ping) | 1 回 | — | 0 → 1 | 2 節の 1（入口） |
| output をコードで subscribe | 1 回 | — | 0 → 1 | 2 節の 2（直接）。テンプレートの (ping) も呼ばれた |
| root の effect（2 つ） | 1 回 | — | 0 → 1 | **2 つ目は一度も走らない**（3 節） |
| コンポーネントの effect | 1 回 | — | （空）→ 1 | 最初の描画が途中で止まる（3 節） |
| afterNextRender の earlyRead | 1 回 | — | 0 → 1 | 同じ並びの read は走らない（4 節） |
| テンプレートの式 | 1 回 | — | 0 → 1 | スケジューラの catch |
| PendingTasks.run（reject / 同期） | 1 回 / 1 回 | — | 0 → 1 | 6 節 |
| async パイプ（Observable / Promise） | 1 回 / 1 回 | — | 0 → 1 | 6 節の 50・92 行目 |
| appRef.tick() を直接 | **0 回** | `Error('boom in template')` | 0 → 1 | 5 節 |

## テストと直し方

📄 `angular/packages/core/test/acceptance/listener_spec.ts` L458–489 （▶ の行: 460, 469–471, 476, 486–488）

```ts
458 │       @Component({
459 │         selector: 'test-cmpt',
460 ▶         template: `<button throws-on-clicks likes-clicks><button></button></button>`,
461 │         standalone: false,
462 │ 
463 │         changeDetection: ChangeDetectionStrategy.Eager,
464 │       })
465 │       class TestCmpt {}
466 │ 
467 │       let noOfErrors = 0;
468 │ 
469 ▶       class CountingErrorHandler extends ErrorHandler {
470 ▶         override handleError(error: any): void {
471 ▶           noOfErrors++;
472 │         }
473 │       }
474 │ 
475 │       TestBed.configureTestingModule({
476 ▶         rethrowApplicationErrors: false,
477 │         declarations: [TestCmpt, LikesClicks, ThrowsOnClicks],
478 │         providers: [{provide: ErrorHandler, useClass: CountingErrorHandler}],
479 │       });
480 │       const fixture = TestBed.createComponent(TestCmpt);
481 │       fixture.detectChanges();
482 │       const buttonDebugEl = fixture.debugElement.query(By.css('button'));
483 │ 
484 │       expect(buttonDebugEl.injector.get(LikesClicks).counter).toBe(0);
485 │ 
486 ▶       buttonDebugEl.nativeElement.click();
487 ▶       expect(noOfErrors).toBe(1);
488 ▶       expect(buttonDebugEl.injector.get(LikesClicks).counter).toBe(1);
489 │     });
```

`it('should try to execute remaining coalesced listeners if one of the listeners throws')`（listener\_spec.ts:446）です。460 行目の 1 つの `button` に、投げるディレクティブと数えるディレクティブの 2 つの click が付いています。476 行目の `rethrowApplicationErrors: false` で TestBed の投げ直しを止め（[testing-errors](../testing/12-testing-errors.md)）、486 行目のクリックで、487 行目の ErrorHandler が 1 回、488 行目の残りのリスナーも 1 回呼ばれることを見ています。

📄 `angular/packages/core/test/acceptance/authoring/output_function_spec.ts` L366–397 （▶ の行: 367–368, 371, 385–386, 388, 392, 394–396）

```ts
366 │       let handledErrors: unknown[] = [];
367 ▶       TestBed.configureTestingModule({
368 ▶         providers: [
369 │           {
370 │             provide: ErrorHandler,
371 ▶             useClass: class Handler extends ErrorHandler {
372 │               override handleError(error: unknown): void {
373 │                 handledErrors.push(error);
374 │               }
375 │             },
376 │           },
377 │         ],
378 │       });
379 │ 
380 │       const fixture = TestBed.createComponent(App);
381 │       const dir = fixture.debugElement.children[0].injector.get(Dir);
382 │       fixture.detectChanges();
383 │ 
384 │       let triggered = 0;
385 ▶       dir.onBla.subscribe(() => {
386 ▶         throw new Error('first programmatic listener failure');
387 │       });
388 ▶       dir.onBla.subscribe(() => {
389 │         triggered++;
390 │       });
391 │ 
392 ▶       dir.onBla.emit();
393 │ 
394 ▶       expect(handledErrors.length).toBe(1);
395 ▶       expect((handledErrors[0] as Error).message).toBe('first programmatic listener failure');
396 ▶       expect(triggered).toBe(1);
397 │     });
```

``it('should report subscription listener errors to `ErrorHandler` and continue')``（output\_function\_spec.ts:352）です。385 行目でコードから subscribe した 1 つ目が投げ、388 行目の 2 つ目は 396 行目で呼ばれています。367〜378 行目は `rethrowApplicationErrors` を書いていないのに、テストは投げ直しで失敗しません。この道が入口ではなく ErrorHandler を直接呼ぶからです（1 節の表）。

📄 `angular/packages/core/test/render3/reactivity_spec.ts` L99–124 （▶ の行: 99, 101–102, 114, 117, 119, 121, 123）

```ts
 99 ▶     it('should propagate errors to the ErrorHandler', async () => {
100 │       TestBed.configureTestingModule({
101 ▶         providers: [{provide: ErrorHandler, useFactory: () => new FakeErrorHandler()}],
102 ▶         rethrowApplicationErrors: false,
103 │       });
104 │ 
105 │       let run = false;
106 │ 
107 │       let lastError: any = null;
108 │       class FakeErrorHandler extends ErrorHandler {
109 │         override handleError(error: any): void {
110 │           lastError = error;
111 │         }
112 │       }
113 │       const appRef = TestBed.inject(ApplicationRef);
114 ▶       effect(
115 │         () => {
116 │           run = true;
117 ▶           throw new Error('fail!');
118 │         },
119 ▶         {injector: appRef.injector},
120 │       );
121 ▶       await appRef.whenStable();
122 │       expect(run).toBeTrue();
123 ▶       expect(lastError.message).toBe('fail!');
124 │     });
```

reactivity\_spec.ts の `describe('effects')` の中です。119 行目で `appRef.injector` を渡して root の effect にし、121 行目で `whenStable()` を待つので、スケジューラの tick の catch から ErrorHandler に届きます（123 行目）。effect は 1 つだけなので、3 節の「後ろの effect が止まる」はこの spec では見えません。

📄 `angular/packages/core/test/acceptance/pending_tasks_spec.ts` L98–128 （▶ の行: 98, 105, 107–109, 112, 114, 122–123, 125, 127）

```ts
 98 ▶   it('should stop blocking stability if run promise rejects', async () => {
 99 │     const appRef = TestBed.inject(ApplicationRef);
100 │     const pendingTasks = TestBed.inject(PendingTasks);
101 │     const errorHandler = TestBed.inject(ErrorHandler);
102 │     const spy = spyOn(errorHandler, 'handleError');
103 │ 
104 │     const {promise, reject} = Promise.withResolvers<void>();
105 ▶     pendingTasks.run(() => promise);
106 │     await expectAsync(applicationRefIsStable(appRef)).toBeResolvedTo(false);
107 ▶     reject();
108 ▶     await expectAsync(appRef.whenStable()).toBeResolved();
109 ▶     expect(spy).toHaveBeenCalled();
110 │   });
111 │ 
112 ▶   it('should stop blocking stability if run function throws synchronously', async () => {
113 │     TestBed.configureTestingModule({
114 ▶       rethrowApplicationErrors: false,
115 │     });
116 │ 
117 │     const appRef = TestBed.inject(ApplicationRef);
118 │     const pendingTasks = TestBed.inject(PendingTasks);
119 │     const errorHandler = TestBed.inject(ErrorHandler);
120 │     const spy = spyOn(errorHandler, 'handleError');
121 │ 
122 ▶     pendingTasks.run(() => {
123 ▶       throw new Error('Sync error');
124 │     });
125 ▶     await expectAsync(appRef.whenStable()).toBeResolved();
126 │     expect(spy).toHaveBeenCalled();
127 ▶     expect(spy.calls.mostRecent().args[0].message).toContain('Sync error');
128 │   });
```

7232ce5b17c の約束が 98〜110 行目（reject のあと 108 行目で安定し、109 行目で ErrorHandler が呼ばれる）、0e16bb701f2 が足したのが 112〜128 行目（同期に投げても 125 行目で安定する）です。

📄 `angular/packages/core/test/acceptance/after_render_hook_spec.ts` L1034–1067 （▶ の行: 1040, 1044–1045, 1048, 1052–1053, 1065–1066）

```ts
1034 │         @Component({
1035 │           template: '',
1036 │           standalone: false,
1037 │         })
1038 │         class Comp {
1039 │           constructor() {
1040 ▶             afterNextRender(() => {
1041 │               log.push('pass 1');
1042 │             });
1043 │ 
1044 ▶             afterNextRender(() => {
1045 ▶               throw new Error('fail 1');
1046 │             });
1047 │ 
1048 ▶             afterNextRender(() => {
1049 │               log.push('pass 2');
1050 │             });
1051 │ 
1052 ▶             afterNextRender(() => {
1053 ▶               throw new Error('fail 2');
1054 │             });
1055 │           }
1056 │         }
1057 │ 
1058 │         TestBed.configureTestingModule({
1059 │           declarations: [Comp],
1060 │           providers: [COMMON_PROVIDERS, {provide: ErrorHandler, useClass: FakeErrorHandler}],
1061 │         });
1062 │         createAndAttachComponent(Comp);
1063 │ 
1064 │         expect(log).toEqual([]);
1065 ▶         TestBed.inject(ApplicationRef).tick();
1066 ▶         expect(log).toEqual(['pass 1', 'fail 1', 'pass 2', 'fail 2']);
1067 │       });
```

`describe('afterNextRender')` の `it('should propagate errors to the ErrorHandler')`（after\_render\_hook\_spec.ts:1025）です。4 つの `afterNextRender` は別々の並びなので、1045 行目が投げても 1049 行目は走り、1066 行目の順になります。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance --test_arg=--filter="should try to execute remaining coalesced listeners if one of the listeners throws" --nocache_test_results --test_output=all
pnpm bazel test //packages/core/test/acceptance/authoring:test --test_arg=--filter="should report subscription listener errors" --nocache_test_results --test_output=all
pnpm bazel test //packages/core/test/render3:render3 --test_arg=--filter="should propagate errors to the ErrorHandler" --nocache_test_results --test_output=all
pnpm bazel test //packages/core/test/acceptance:acceptance --test_arg=--filter="should stop blocking stability if run" --nocache_test_results --test_output=all
pnpm bazel test //packages/core/test/acceptance:acceptance --test_arg=--filter="should propagate errors to the ErrorHandler" --nocache_test_results --test_output=all
pnpm bazel test //packages/common/test:test --test_arg=--filter="should report rejections to error handler" --nocache_test_results --test_output=all
```

📄 `出力（各ターゲットの要約。2026-11-15 に実行）`

```
（acceptance・リスナー）     Ran 1 of 2693 specs / 1 spec, 0 failures   PASSED
（authoring・output）        Ran 1 of 62 specs   / 1 spec, 0 failures   PASSED
（render3・effect）          Ran 1 of 574 specs  / 1 spec, 0 failures   PASSED
（acceptance・PendingTasks） Ran 2 of 2693 specs / 2 specs, 0 failures  PASSED
（acceptance・afterRender）  Ran 2 of 2693 specs / 2 specs, 0 failures  PASSED
（common・async パイプ）     Ran 1 of 667 specs  / 1 spec, 0 failures   PASSED
```

1. **ターゲットの選び方**

   `packages/core/test/acceptance/authoring` と `packages/core/test/render3` は、それぞれ自分の BUILD.bazel を持つので、`//packages/core/test/acceptance:acceptance` や `//packages/core/test:test` では走りません（最初に acceptance で 4 つの名前をまとめて絞ったとき、output の it は数に入らず 5 本でした）。afterRender の名前は `afterRender` と `afterNextRender` の両方の describe に同じものがあるので 2 本です。
2. **直すとしたら：root の effect が止まる件**

   触る場所は 2 つの候補があります。application\_ref.ts の `synchronizeOnce`（617 行目）で、`flush()` が投げたら `RootEffects` の旗を立て直す（汚れた effect が残っていれば）か、root\_effect\_scheduler.ts の `flushQueue`（133 行目）で 1 つの失敗が残りを止めないようにするかです。後者は、エラーをどこへ渡すか（今はスケジューラの catch に 1 回だけ届く）も決め直すことになります。spec は reactivity\_spec.ts の `describe('effects')`、今の `it('should propagate errors to the ErrorHandler')`（99 行目）の隣に、「投げる effect のあとに作った effect も、同じ `whenStable()` のうちに走る」を足すのが入口です。上の Node の再現が、その it の形になります。
3. **Promise を返すリスナー**

   #69228 を進めるなら、listeners.ts の `executeListenerWithErrorHandling` で戻り値が Promise のときに catch を付けることになり、spec は listener\_spec.ts の上の it の近くです。ただしこれは振る舞いを変える提案で、7 節の 1 のとおり方針の議論が先にあります。

## 聞かれそうな質問

**Q. async のクリックハンドラで投げたエラーが ErrorHandler に来ないのはなぜですか？**

テンプレートのリスナーを包む try / catch は、ハンドラが**同期で**投げたものだけを捕まえ、返った Promise には何も付けないからです。zoneless では window の `unhandledrejection` になるので、`provideBrowserGlobalErrorListeners()` を入れていれば ErrorHandler に戻ります（[第 3 回](03-err-global-listeners.md)）。フレームワークが拾う形にする要望が #69228 です。

**Q. effect が 1 回投げたら、ほかの effect はどうなりますか？**

root の effect なら、同じ `flush` の後ろにいた汚れた effect は走らず、application\_ref.ts の 620 行目で旗が消えているので、別の root の effect が汚れるまで止まったままです（3 節、Node の再現とデモ）。ErrorHandler には投げた 1 つ分しか届かないので、気づくには投げないことを確かめるしかありません。

**Q. `output()` の購読者が投げたエラーは、テストで失敗になりますか？**

テンプレートで `(ping)` と書いた購読者なら、入口を通るので TestBed が投げ直して失敗になります。コードで `subscribe` した購読者なら、`OutputEmitterRef.emit` が ErrorHandler を直接呼ぶので失敗になりません（output\_function\_spec.ts の 367〜378 行目は `rethrowApplicationErrors` を書いていない）。

**Q. async パイプに渡した Promise が、コンポーネントを閉じたあとで reject されたら？**

どこにも届きません。破棄のときに 97 行目で `onError = null` になり、92 行目は何もしません。88 行目で reject の関数を付けてあるので、未処理の reject にもならず、window のリスナーにも来ません。

**Q. 自分で `detectChanges()` を呼んだときのエラーは？**

呼んだ側に投げられ、ErrorHandler には行きません。338818ce899 で `ApplicationRef.tick` の中の catch が外され、491b0a4ead9 で `detectChanges` の報告も外されました。catch して入口に渡すのはスケジューラと起動時の `_loadComponent` です（5 節）。

## 読み終えて

- テンプレートで書いたリスナー（DOM も output も）・スケジューラの tick・`PendingTasks.run`・async パイプ・`@defer`・Router は入口を通り、`output()` のコードの購読者と `afterRender` は ErrorHandler を直接呼ぶ。
- effect とテンプレートの式は自分では捕まえず、tick の外のスケジューラが捕まえる。`appRef.tick()` を直接呼べば呼んだ側に出る（338818ce899）。
- root の effect が 1 つ投げると、application\_ref.ts L620 で旗が先に消えるため、後ろの effect は別の root の effect が汚れるまで止まったままになる（root\_effect\_scheduler.ts L132 の TODO）。
- Promise を返すリスナー（#69228）や、パイプが消えたあとの Promise の reject は、どこにも届かない／window に出る。

---

← 前: [ErrorHandler と内部の入口：INTERNAL\_APPLICATION\_ERROR\_HANDLER](01-err-handler-core.md)  
次: [ブラウザの全体のエラー：provideBrowserGlobalErrorListeners](03-err-global-listeners.md) →
