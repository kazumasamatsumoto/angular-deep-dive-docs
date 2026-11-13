[目次](../README.md) › [resource の細部と新しい部品](README.md) › 第 5 回 / 全 6 回

# 後片付けと漏れ：destroy、abort、購読の漏れの修正

> 壊す・params を変える・set() の入口がどれも abortInProgressLoad で AbortController を止めること、abort を受けて購読をやめる rxResource と httpResource の onAbort に足されてきた修正（93e8565f0ef・080b3687d32・e0e902a8fa9・63886758787・5128dec0ca1）を、コミットの差分と spec で読む。読み込み中に params が使えなくなると前の読み込みが止まらない穴と、origin/main の修正（efbab16e567・833c1f2c96c）。ページの上の本物で、loader の回数・abort・まだ解決していない Promise・生きている購読を数える。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/resx-cleanup-leaks)

---

resource は「読み込みを始める」だけでなく、「要らなくなった読み込みを片付ける」ことも引き受けています。片付け忘れは、通信や購読（Observable の subscribe）が残り続ける**漏れ**になり、SSR では `PendingTasks` の仕事が残ってアプリが安定しなくなります。この章では、片付けの入口（壊す・params を変える・`set()`）が呼ぶ `abortInProgressLoad` の先で、`rxResource` と `httpResource` の abort の受け手に残っていた穴を、e0e902a8fa9・63886758787 を中心にコミットの差分と spec で読みます。

読む対象は `packages/core/rxjs-interop/src/rx_resource.ts`、`packages/common/http/src/resource.ts` の `HttpResourceImpl`、`packages/core/src/resource/resource.ts` と、それぞれの spec です。`destroy()`・`abortInProgressLoad()`・`shouldDiscard` の行そのものは[resource の章](../signals/15-resource.md)の 5・6 節で、`rxResource` と `httpResource` の stream の全体は[httpResource と rxResource の章](../signals/16-signals-http-resource.md)で読みました。ここでは、そこに後から足された行だけを見ます。

1. [1. params から状態を返す](01-resx-params-status.md)
2. [2. debounced()](02-resx-debounced.md)
3. [3. エラーの包み方](03-resx-errors.md)
4. [4. SSR と resource](04-resx-ssr-cache.md)
5. **5. 後片付けと漏れ**（この章）
6. [6. spec と issue](06-resx-tests-issues.md)

## 1. 片付けの入口と、ResourceImpl が持っているもの

📄 `angular/packages/core/src/resource/resource.ts` L195–199 （▶ の行: 195–198）

```ts
195 ▶   private pendingController: AbortController | undefined;
196 ▶   private resolvePendingTask: (() => void) | undefined = undefined;
197 ▶   private destroyed = false;
198 ▶   private unregisterOnDestroy: () => void;
199 │ 
```

片付けの対象は、195 行目の今の読み込みの `AbortController`、196 行目の `PendingTasks` の仕事を外す関数、それに effect と `DestroyRef` への登録です。197 行目の `destroyed` は壊した後の `set()` を無視するための印、198 行目の `unregisterOnDestroy` は 080b3687d32（2025-06）で足されました（3 節）。

| 入口 | 何が呼ばれるか | 止まるもの |
| --- | --- | --- |
| 注入器が壊れる（コンポーネントが壊れる） | `DestroyRef.onDestroy` に登録した `destroy()` | effect・今の読み込み（abort）・`PendingTasks` の仕事。状態は `idle` |
| `res.destroy()` を手で呼ぶ | 同じ `destroy()`。`DestroyRef` の登録も外す | 同上 |
| params が別の値になる | 次の loadEffect の先頭近くの `abortInProgressLoad()` | 前の読み込み（abort）と、その仕事 |
| `set()` / `value.set()` | `set()` の最後の `abortInProgressLoad()` | 今の読み込みと、その仕事。状態は `local` |
| params が `undefined`・`IDLE`・`LOADING`・エラーになる | （8576f161ae4 では）何も呼ばれない | 止まらない。5 節 |

どの入口も、行き着く先は `AbortController.abort()` です。resource の側の仕事はそこで終わりで、**abort を受けて購読をやめるのは loader（stream）の側**です。`resource()` に Promise の loader を渡すときは、利用者が `abortSignal` を `fetch` などに渡します。`rxResource` と `httpResource` は、この受け手を自分で書いています。漏れの修正のほとんどは、この受け手の側にあります。

## 2. abort を受ける側：4 本の修正

`rxResource` と `httpResource` は、stream の中で `onAbort` という関数を `abortSignal` の `abort` に登録し、そこで `unsubscribe()` します。この受け手は、次の順で直されてきました。

| コミット | 日付 | 残っていたもの | 足した行 |
| --- | --- | --- | --- |
| 93e8565f0ef（#58306） | 2024-10（取り込み 2025-05） | Observable が `error` で終わったとき、`abort` の受け手が登録されたまま | `error` でも `removeEventListener` |
| 080b3687d32（#61870） | 2025-06 | `destroy()` を手で呼んでも、`DestroyRef` に登録した関数が resource を握ったまま | `onDestroy` の戻り値で登録を外す |
| e0e902a8fa9（PR #68924） | 2026-05-27 | `rxResource`：subscribe の途中で abort されると、購読をやめる人がいない | `aborted` の旗と、subscribe の後の `unsubscribe()` |
| 63886758787（同じ PR） | 2026-05-27 | `httpResource` の同じ穴。`rxResource` は abort のときに Promise も解決する | 同じ旗。rx 側は `resolveOnce()` |
| 5128dec0ca1（angular-main） | 2026-09-21 | `httpResource`：abort で終わった道では、受け手が登録されたまま | `{once: true}` |

📄 `git show 93e8565f0ef -- packages/core/rxjs-interop/src/rx_resource.ts`

```ts
commit 93e8565f0ef（8576f161ae4 の祖先）
Date:   2024-10-22（取り込み 2025-05-21）

    fix(core): cleanup `rxResource` abort listener (#58306)

diff --git a/packages/core/rxjs-interop/src/rx_resource.ts b/packages/core/rxjs-interop/src/rx_resource.ts
--- a/packages/core/rxjs-interop/src/rx_resource.ts
+++ b/packages/core/rxjs-interop/src/rx_resource.ts
@@ -82,7 +82,10 @@ export function rxResource<T, R>(opts: RxResourceOptions<T, R>): ResourceRef<T |
 
       sub = streamFn(params).subscribe({
         next: (value) => send({value}),
-        error: (error) => send({error}),
+        error: (error) => {
+          send({error});
+          params.abortSignal.removeEventListener('abort', onAbort);
+        },
         complete: () => {
           if (resolve) {
             send({

```

1 本目は `error` の枝に `removeEventListener` を足すだけです。Observable は `error` を出したらもう `complete` を出さないので、`complete` の枝だけで外していては外れませんでした（同じコミットで `httpResource` にも同じ 1 行が入っています）。

## 3. destroy() を手で呼んだときの登録（080b3687d32）

📄 `git show 080b3687d32 -- packages/core/src/resource/resource.ts`

```ts
commit 080b3687d32（8576f161ae4 の祖先）
Date:   2025-05-22（取り込み 2025-06-04）

    fix(core): unregister `onDestroy` in `ResourceImpl` when `destroy()` is called (#61870)

diff --git a/packages/core/src/resource/resource.ts b/packages/core/src/resource/resource.ts
--- a/packages/core/src/resource/resource.ts
+++ b/packages/core/src/resource/resource.ts
@@ -167,6 +167,7 @@ export class ResourceImpl<T, R> extends BaseWritableResource<T> implements Resou
   private pendingController: AbortController | undefined;
   private resolvePendingTask: (() => void) | undefined = undefined;
   private destroyed = false;
+  private unregisterOnDestroy: () => void;
 
   constructor(
     request: () => R,
@@ -250,7 +251,7 @@ export class ResourceImpl<T, R> extends BaseWritableResource<T> implements Resou
     this.pendingTasks = injector.get(PendingTasks);
 
     // Cancel any pending request when the resource itself is destroyed.
-    injector.get(DestroyRef).onDestroy(() => this.destroy());
+    this.unregisterOnDestroy = injector.get(DestroyRef).onDestroy(() => this.destroy());
   }
 
   override readonly status = computed(() => projectStatusOfState(this.state()));
@@ -302,6 +303,7 @@ export class ResourceImpl<T, R> extends BaseWritableResource<T> implements Resou
 
   destroy(): void {
     this.destroyed = true;
+    this.unregisterOnDestroy();
     this.effectRef.destroy();
     this.abortInProgressLoad();

```

`DestroyRef.onDestroy(fn)` は、登録を外す関数を返します（[DestroyRef の章](../di/14-di-destroy.md)）。前は戻り値を捨てていたので、`res.destroy()` を手で呼んだ後も、注入器が壊れるまで `() => this.destroy()` が resource を握り続けました。ルートの注入器のように壊れない注入器で resource を作っては手で壊す、を繰り返すと、壊した resource が 1 つずつ溜まっていきます。このコミットに spec は足されていません。

## 4. subscribe の途中で abort されたら（e0e902a8fa9・63886758787）

同期の abort は、loader の中から同じ resource の `set()` を呼ぶと起きます。順番を追います。

1. **loadEffect が `AbortController` を作り、loader（stream）を呼ぶ**

   [resource の章](../signals/15-resource.md)の 5 節の行です。
2. **stream の中で `onAbort` を登録し、`streamFn(params).subscribe(…)` を呼ぶ**

   subscribe は Observable の中身を同期で走らせます。`sub` にはまだ何も入っていません。
3. **Observable の中身が `res.set()` を呼ぶ**

   `set()` の最後の `abortInProgressLoad()` が、今作ったばかりの `AbortController` を abort します。
4. **`onAbort` が同期で呼ばれる**

   ここで `sub` はまだ `undefined` です。前の `rxResource` は `sub?.unsubscribe()` で何もせず、前の `httpResource` は `sub.unsubscribe()` で `TypeError` を投げていました。
5. **subscribe が返り、`sub` に購読が入る**

   abort のイベントは 1 回しか来ないので、**この購読をやめる人はもういません**。Observable が自分で終わるまで、値を出し続けます。

📄 `git show e0e902a8fa9 -- packages/core/rxjs-interop/src/rx_resource.ts`

```ts
commit e0e902a8fa9（8576f161ae4 の祖先）
Date:   2026-05-26（取り込み 2026-05-27）

    fix(core): prevent rxResource from leaking a subscription

diff --git a/packages/core/rxjs-interop/src/rx_resource.ts b/packages/core/rxjs-interop/src/rx_resource.ts
--- a/packages/core/rxjs-interop/src/rx_resource.ts
+++ b/packages/core/rxjs-interop/src/rx_resource.ts
@@ -59,9 +59,16 @@ export function rxResource<T, R>(opts: RxResourceOptions<T, R>): ResourceRef<T |
     stream: (params) => {
       let sub: Subscription | undefined;
 
+      // `abort` can fire synchronously while the subscription is not initialized yet.
+      // Use this flag to unsubscribe immediately once `sub` exists.
+      let aborted = false;
+
       // Track the abort listener so it can be removed if the Observable completes (as a memory
       // optimization).
-      const onAbort = () => sub?.unsubscribe();
+      const onAbort = () => {
+        aborted = true;
+        sub?.unsubscribe();
+      };
       params.abortSignal.addEventListener('abort', onAbort);
 
       // Start off stream as undefined.
@@ -102,6 +109,10 @@ export function rxResource<T, R>(opts: RxResourceOptions<T, R>): ResourceRef<T |
         },
       });
 
+      if (aborted) {
+        sub.unsubscribe();
+      }
+
       if (resolve === undefined) {
         return stream;
       }

```

直し方は「abort されたことを覚えておき、subscribe が返ったらやめる」です。今のコードで見ます。

📄 `angular/packages/core/rxjs-interop/src/rx_resource.ts` L70–76 （▶ の行: 70, 72–74）

```ts
70 ▶       let sub: Subscription | undefined;
71 │ 
72 ▶       // `abort` can fire synchronously while the subscription is not initialized yet.
73 ▶       // Use this flag to unsubscribe immediately once `sub` exists.
74 ▶       let aborted = false;
75 │ 
76 │       // Start off stream as undefined.
```

📄 `angular/packages/core/rxjs-interop/src/rx_resource.ts` L131–137 （▶ の行: 132, 134–135）

```ts
131 │         },
132 ▶       });
133 │ 
134 ▶       if (aborted) {
135 ▶         sub.unsubscribe();
136 │       }
137 │ 
```

74 行目の `aborted` を、`onAbort` の中で真にします（`onAbort` の全体は[httpResource と rxResource の章](../signals/16-signals-http-resource.md)の 6 節）。132 行目で subscribe が返った後、134〜135 行目で `aborted` なら `sub.unsubscribe()` します。`sub` はこの時点で必ず入っているので `?.` は要りません。

📄 `git show 63886758787 -- packages/common/http/src/resource.ts`

```ts
commit 63886758787（8576f161ae4 の祖先）
Date:   2026-05-26（取り込み 2026-05-27）

    fix(http): prevent `httpResource` from leaking a subscription

diff --git a/packages/common/http/src/resource.ts b/packages/common/http/src/resource.ts
--- a/packages/common/http/src/resource.ts
+++ b/packages/common/http/src/resource.ts
@@ -371,11 +371,17 @@ class HttpResourceImpl<T>
     super(
       request,
       ({params: request, abortSignal}) => {
-        let sub: Subscription;
+        let sub: Subscription | undefined;
+        // In the unlikely case the request returns synchronously we want to make sure the observable
+        // is subscribe even if it isn't initialized yet.
+        let aborted = false;
 
         // Track the abort listener so it can be removed if the Observable completes (as a memory
         // optimization).
-        const onAbort = () => sub.unsubscribe();
+        const onAbort = () => {
+          aborted = true;
+          sub?.unsubscribe();
+        };
         abortSignal.addEventListener('abort', onAbort);
 
         // Start off stream as undefined.
@@ -428,6 +434,10 @@ class HttpResourceImpl<T>
           },
         });
 
+        if (aborted) {
+          sub.unsubscribe();
+        }
+
         return promise;
       },
       defaultValue,

```

📄 `angular/packages/common/http/src/resource.ts` L377–383 （▶ の行: 377, 381–383）

```ts
377 ▶         let aborted = false;
378 │ 
379 │         // Track the abort listener so it can be removed if the Observable completes (as a memory
380 │         // optimization).
381 ▶         const onAbort = () => {
382 ▶           aborted = true;
383 ▶           sub?.unsubscribe();
```

📄 `angular/packages/common/http/src/resource.ts` L433–439 （▶ の行: 433, 437–438）

```ts
433 ▶             abortSignal.removeEventListener('abort', onAbort);
434 │           },
435 │         });
436 │ 
437 ▶         if (aborted) {
438 ▶           sub.unsubscribe();
439 │         }
```

`httpResource` も同じ形です。377 行目の旗を 382 行目で立て、383 行目は `sub?.` になって `TypeError` を投げなくなりました。437〜438 行目が subscribe の後の `unsubscribe()` です。433 行目は `complete` の枝の `removeEventListener` で、`error` の枝の同じ 1 行（2 節の 93e8565f0ef）と合わせて、abort されずに終わった道では受け手が外れます。

### 63886758787 の rxResource の側：abort で Promise も解決する

📄 `git show 63886758787 -- packages/core/rxjs-interop/src/rx_resource.ts`

```ts
commit 63886758787（8576f161ae4 の祖先）
Date:   2026-05-26（取り込み 2026-05-27）

    fix(http): prevent `httpResource` from leaking a subscription

diff --git a/packages/core/rxjs-interop/src/rx_resource.ts b/packages/core/rxjs-interop/src/rx_resource.ts
--- a/packages/core/rxjs-interop/src/rx_resource.ts
+++ b/packages/core/rxjs-interop/src/rx_resource.ts
@@ -20,6 +20,7 @@ import {
   ɵRuntimeErrorCode,
 } from '../../src/core';
 import {encapsulateResourceError} from '../../src/resource/resource';
+import {promiseWithResolvers} from '../../src/util/promise_with_resolvers';
 
 /**
  * Like `ResourceOptions` but uses an RxJS-based `loader`.
@@ -63,23 +64,35 @@ export function rxResource<T, R>(opts: RxResourceOptions<T, R>): ResourceRef<T |
       // Use this flag to unsubscribe immediately once `sub` exists.
       let aborted = false;
 
+      // Start off stream as undefined.
+      const stream = signal<ResourceStreamItem<T>>({value: undefined as T});
+      const {resolve, promise} = promiseWithResolvers<Signal<ResourceStreamItem<T>>>();
+      let hasResolved = false;
+
+      function resolveOnce(): void {
+        if (!hasResolved) {
+          hasResolved = true;
+          resolve(stream);
+        }
+      }
+
       // Track the abort listener so it can be removed if the Observable completes (as a memory
       // optimization).
       const onAbort = () => {
         aborted = true;
         sub?.unsubscribe();
+        // Remove the listener immediately since unsubscribe won't trigger the subscription's
+        // error/complete handlers. This ensures the promise resolves and PendingTask is released.
+        params.abortSignal.removeEventListener('abort', onAbort);
+        // Resolve the promise with the current stream state if it hasn't been resolved yet.
+        // This ensures the PendingTask created for this request is released.
+        resolveOnce();
       };
       params.abortSignal.addEventListener('abort', onAbort);
 
-      // Start off stream as undefined.
-      const stream = signal<ResourceStreamItem<T>>({value: undefined as T});
-      let resolve: ((value: Signal<ResourceStreamItem<T>>) => void) | undefined;
-      const promise = new Promise<Signal<ResourceStreamItem<T>>>((r) => (resolve = r));
-
       function send(value: ResourceStreamItem<T>): void {
         stream.set(value);
-        resolve?.(stream);
-        resolve = undefined;
+        resolveOnce();
       }
 
       const streamFn = opts.stream;
@@ -97,7 +110,7 @@ export function rxResource<T, R>(opts: RxResourceOptions<T, R>): ResourceRef<T |
           params.abortSignal.removeEventListener('abort', onAbort);
         },
         complete: () => {
-          if (resolve) {
+          if (!hasResolved) {
             send({
               error: new ɵRuntimeError(
                 ɵRuntimeErrorCode.RESOURCE_COMPLETED_BEFORE_PRODUCING_VALUE,
@@ -113,7 +126,7 @@ export function rxResource<T, R>(opts: RxResourceOptions<T, R>): ResourceRef<T |
         sub.unsubscribe();
       }
 
-      if (resolve === undefined) {
+      if (hasResolved) {
         return stream;
       }

```

題は「`httpResource` の漏れ」ですが、このコミットは `rxResource` も変えています。`onAbort` の中で受け手を外し、`resolveOnce()` で loader の Promise を解決するようにしました。コメントは「これで PendingTask が外れる」と書き、spec には「PendingTask を外す（regression）」の it が 3 つ足されています（テストと直し方）。

> [!NOTE]
> **さらに深く**
>
> 作業木で、差分の `onAbort` に足された 2 行（`removeEventListener` と `resolveOnce()`）だけを消して `rxResource` の spec を走らせると、**17 件すべて通りました**（3 つの regression の it を含む。res-logs/b-exp-b-no-resolveonce.log）。PendingTask を外しているのは、どの入口でも `abortInProgressLoad()` の中の `this.resolvePendingTask?.()` だからです（[resource の章](../signals/15-resource.md)の 5 節）。`PendingTasks.add()` の返す関数は 2 回目以降は何もしないので（[PendingTasks の章](../zoneless/09-zoneless-pending-tasks.md)）、loadEffect の `finally` が後から呼んでも害はありません。`resolveOnce()` が変えるのは、abort された読み込みの `await` が終わるかどうか（終わらない Promise を待ったままの loadEffect が残るかどうか）です。

### angular-main の 5128dec0ca1：abort で終わった道の受け手

📄 `git show 5128dec0ca1 -- packages/common/http/src/resource.ts（2 つ目の hunk）`

```
commit 5128dec0ca1（angular-main 74961c66242 の祖先）
Date:   2026-09-17（取り込み 2026-09-21）

    fix(common): remove abort listener on the abort path too in httpResource

diff --git a/packages/common/http/src/resource.ts b/packages/common/http/src/resource.ts
--- a/packages/common/http/src/resource.ts
+++ b/packages/common/http/src/resource.ts
@@ -376,13 +375,13 @@ class HttpResourceImpl<T>
         // is subscribe even if it isn't initialized yet.
         let aborted = false;
 
-        // Track the abort listener so it can be removed if the Observable completes (as a memory
-        // optimization).
+        // `once: true`: calling unsubscribe() here (on abort) doesn't trigger the error/complete
+        // callbacks below, so without it this listener wouldn't get removed on the abort path.
         const onAbort = () => {
           aborted = true;
           sub?.unsubscribe();
         };
-        abortSignal.addEventListener('abort', onAbort);
+        abortSignal.addEventListener('abort', onAbort, {once: true});
 
         // Start off stream as undefined.
         const stream = signal<ResourceStreamItem<T>>({value: undefined as T});

```

`httpResource` の `onAbort`（381〜383 行目）は、63886758787 の後の `rxResource` と違って自分を外しません。`unsubscribe()` では `error` も `complete` も呼ばれないので、abort で終わった道では受け手が残ります。5128dec0ca1 は `addEventListener` に `{once: true}` を付けて、1 回呼ばれたら外れるようにしました。コミットの本文は、受け手が付いた `AbortSignal` が abort されるまで回収されない WebKit の不具合（bugs.webkit.org の 298499）にも触れています。手元の 8576f161ae4 と、このサイトの 22.1.6 には入っていません。

## 5. まだ残っていた穴：params が使えなくなったとき（origin/main の efbab16e567）

1 節の表の最後の行です。読み込み中に params が `undefined` になる（または `ResourceParamsStatus.IDLE`・`LOADING` やエラーを投げる。[第 1 回](01-resx-params-status.md)）と、状態の linkedSignal はすぐ `idle` などに変わります。ところが loadEffect は「request が `undefined` なら帰る」「状態が `loading` でなければ帰る」の 2 つの `return` を、前の読み込みを止める `abortInProgressLoad()` より**前**に置いていました（[resource の章](../signals/15-resource.md)の 5 節の引用の順）。前の読み込みは abort されず、その `PendingTasks` の仕事は Promise が終わるまで残ります。終わらない Promise なら、アプリはいつまでも安定しません。

📄 `git show efbab16e567 -- packages/core/src/resource/resource.ts（origin/main、2026-11-10 取り込み）`

```
commit efbab16e567（origin/main。手元の angular-main 74961c66242 より後）
Date:   2026-11-02（取り込み 2026-11-10）

    fix(core): cancel obsolete resource loads when params become unavailable

diff --git a/packages/core/src/resource/resource.ts b/packages/core/src/resource/resource.ts
--- a/packages/core/src/resource/resource.ts
+++ b/packages/core/src/resource/resource.ts
@@ -434,6 +434,10 @@ export class ResourceImpl<T, R> extends BaseWritableResource<T> implements Resou
     // we do not want the effect to depend on the state of the resource, only on the request.
     const {status: currentStatus, previousStatus} = untracked(this.state);
 
+    // A changed request invalidates the previous load even when the new params are unavailable
+    // or errored. Cancel it before returning so its pending task cannot keep the app unstable.
+    this.abortInProgressLoad();
+
     if (extRequest.request === undefined) {
       // Nothing to load (and we should already be in a non-loading state).
       return;
@@ -442,9 +446,6 @@ export class ResourceImpl<T, R> extends BaseWritableResource<T> implements Resou
       return;
     }
 
-    // Cancel any previous loading attempts.
-    this.abortInProgressLoad();
-
     // Capturing _this_ load's pending task in a local variable is important here. We may attempt to
     // resolve it twice:
     //

```

直し方は、`abortInProgressLoad()` を 2 つの `return` より前に動かすことでした。issue #71765（2026-11-02）で報告され、2026-11-11 に閉じています。手元の angular-main（74961c66242）にはまだ入っていません。同じ形の要望は 2025-10 にも #64625（「params を `undefined` にしたとき abort イベントを出してほしい」）としてあり、#71765 の本文によれば、作者が閉じ、直すコミットはありませんでした。

作業木（8576f161ae4）に、efbab16e567 が足した it「should cancel a pending load and release stability when params becomes undefined」だけを写して走らせると、**`appRef.whenStable()` が終わらず、5000 ミリ秒のタイムアウトで落ちました**（b-exp-e-before.log）。src の 2 か所を差分のとおりに動かすと、その it を含む 71 件が通りました（b-exp-e-after.log）。下の DEMO でも、loader が abortSignal を見ていても、params を `undefined` にしたときだけは abort イベントが出ません。`rxResource` では、もっと目に見える形になります。値を出し続ける Observable の購読が、status が `idle` になった後も生きたまま残り、次に params が値を返して `abortInProgressLoad()` が呼ばれるまで unsubscribe されません（DEMO の子 B）。

### もう 1 本：終わった読み込みへの abort（origin/main の 833c1f2c96c）

📄 `git show 833c1f2c96c -- packages/core/src/resource/resource.ts（4・5 つ目の hunk）`

```
commit 833c1f2c96c（origin/main。手元の angular-main 74961c66242 より後）
Date:   2026-10-22（取り込み 2026-11-10）

    perf(core): avoid unnecessary aborts and reuse abort reason during resource teardown

diff --git a/packages/core/src/resource/resource.ts b/packages/core/src/resource/resource.ts
--- a/packages/core/src/resource/resource.ts
+++ b/packages/core/src/resource/resource.ts
@@ -526,11 +531,17 @@ export class ResourceImpl<T, R> extends BaseWritableResource<T> implements Resou
       // Resolve the pending task now that the resource has a value.
       resolvePendingTask?.();
       resolvePendingTask = undefined;
+
+      // For non-streaming resources, once the load is complete (settled),
+      // there is no longer an in-progress operation to abort.
+      if (!this.isStreaming && this.pendingController?.signal === abortSignal) {
+        this.pendingController = undefined;
+      }
     }
   }
 
   private abortInProgressLoad(): void {
-    untracked(() => this.pendingController?.abort());
+    untracked(() => this.pendingController?.abort(getAbortReason()));
     this.pendingController = undefined;
 
     // Once the load is aborted, we no longer want to block stability on its resolution.
@@ -539,6 +550,16 @@ export class ResourceImpl<T, R> extends BaseWritableResource<T> implements Resou
   }
 }
 
+let abortReason: DOMException | undefined;
+
+/**
+ * Returns a shared `AbortError` reason, since `abort()` without a reason creates a new one (with a
+ * stack trace) on every call, causing performance degradation on deep component trees.
+ */
+function getAbortReason(): DOMException {
+  return (abortReason ??= new DOMException('The operation was aborted.', 'AbortError'));
+}
+
 function saveToTransferState<R, T>(
   result: ResourceStreamItem<T> | undefined,
   transferCacheKey: StateKey<T> | undefined,

```

[resource の章](../signals/15-resource.md)の DEMO で見た「resolved になった後の reload でも abort イベントが出る」は、`finally` が `pendingController` を残していたからでした。833c1f2c96c（#71422、2026-11-10 取り込み）は、stream でない loader なら、終わった読み込みの `pendingController` を `finally` で消します。`rxResource` のような stream は、壊すときに abort で購読をやめる必要があるので残します。もう 1 つ、`abort()` に理由を渡さないと毎回 `DOMException` が作られ、V8 ではそのたびに呼び出し履歴を取るので、深いコンポーネントの木を壊すと遅くなる、という理由で、理由のオブジェクトを 1 つ作って使い回すようにしました。

## 6. DEMO：読み込み中に params を変える・壊す・set する

> **🧪 DEMO — このサイトの @angular/core 22.1.6 の resource と rxResource（ページの上の本物）**
>
> 子 A は `resource({ params: () => query(), loader })` を持つコンポーネントで、loader は外へ通信せず、選んだ時間だけ `setTimeout` で待つ Promise を返します。「loader が abortSignal を見て止まる」を外すと、abort されても Promise は時間どおりに解決します。子 B は `rxResource` で、stream は 1 秒ごとに値を出し続ける Observable です。数は loader と Observable の中から数えています。`PendingTasks` の仕事はページの上からは数えられないので、「まだ解決していない Promise」を見ます（resource の仕事は、abort されるか Promise が解決するまで外れません）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/resx-cleanup-leaks)

- 子 A を作り、'a' を押してすぐ 'b' を押すと、「abort イベント #1」が出て、まだ解決していない Promise は 1 つのままです（#1 は止まり、#2 が待っている）。
- 'a' を押してすぐ `params = undefined` を押すと、status はすぐ `idle` になりますが、**abort イベントは出ず**、Promise は時間が来るまで残ります。その間、この読み込みの `PendingTasks` の仕事も外れません（5 節の穴。作業木の spec で確かめた）。4 秒にすると分かりやすくなります。
- 読み込み中に「子 A を壊す」と、`destroy()` から abort が出ます。解決した後に壊すと「もう解決していた」の abort が出ます（5 節の 833c1f2c96c が消すもの）。
- 子 B を作って 'x' → 'y' と押すと、'x' の購読が unsubscribe されてから 'y' を subscribe します。'set-in-subscribe' は e0e902a8fa9 の spec と同じ形で、subscribe の途中で `set()` します。22.1.6 では直っているので、生きている購読は 0 に戻り、value は set した値です。
- 子 B で 'x' の後に「rx の params = undefined」を押すと、status は `idle` なのに**生きている購読は 1 のまま**で、ログに unsubscribe が出ません。次に 'y' を押すと、そこで初めて「unsubscribe（'x'）」が出ます（5 節の穴の、`rxResource` での見え方）。

## 全体の流れ

- 👤 `query.set('b')` — *読み込み中に params を変える*
  - `loadEffect()` → `abortInProgressLoad()` — resource の章 5 節
    - `pendingController.abort()` — *前の読み込みの AbortSignal に abort*
      - `onAbort()` — http resource.ts 381〜383 — *aborted = true、sub?.unsubscribe()*
    - `resolvePendingTask()` — *前の仕事を外す*
- 👤 `res.set(v)`（stream の subscribe の中から）
  - `abortInProgressLoad()` → `onAbort()` — *sub はまだ undefined*
  - subscribe が返る → `if (aborted) sub.unsubscribe()` — rx 134〜135 / http 437〜438
- 👤 コンポーネントを壊す
  - `DestroyRef` → `destroy()` → `unregisterOnDestroy()`・`effectRef.destroy()`・`abortInProgressLoad()` — resource の章 6 節
- 👤 `query.set(undefined)` — *読み込み中*
  - `loadEffect()` → `return` — *8576f161ae4 では abort しない。efbab16e567 で abort してから帰る*

## テストと直し方

### spec と it

| ファイル | describe / it | 行 | この章のどこ |
| --- | --- | --- | --- |
| core/test/resource/resource\_spec.ts | `resource` › `should cancel pending requests before starting a new one` | 432 | 1 節（params が変わる） |
|   | › `should cancel pending requests when the resource is destroyed via injector` ／ `… manually destroyed` | 465 ／ 497 | 1・3 節 |
|   | › `set() should abort a pending load` ／ `set() should abort a pending reload` | 690 ／ 721 | 1 節（set） |
|   | › `should not accept new values/errors after a request is cancelled` | 910 | abort の後の値を捨てる |
| core/rxjs-interop/test/rx\_resource\_spec.ts | `rxResource()` › `should cleanup without error when the stream function threw an error` | 111 | [第 3 回](03-resx-errors.md)（9ae98753849） |
|   | › `should unsubscribe when the observable emits synchronously` | 331 | 4 節（e0e902a8fa9） |
|   | › `should release the PendingTask when …`（3 つ） | 352・383・410 | 4 節（63886758787） |
| common/http/test/resource\_spec.ts | `httpResource` › `should unsubscribe the observable when the request emits synchronously` | 376 | 4 節（63886758787） |

📄 `angular/packages/core/test/resource/resource_spec.ts` L465–495 （▶ の行: 469, 473, 488, 490, 494）

```ts
465 │   it('should cancel pending requests when the resource is destroyed via injector', async () => {
466 │     const counter = signal(0);
467 │     const backend = new MockEchoBackend<{counter: number}>();
468 │     const aborted: {counter: number}[] = [];
469 ▶     const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
470 │     const echoResource = resource<{counter: number}, {counter: number}>({
471 │       params: () => ({counter: counter()}),
472 │       loader: ({params, abortSignal}) => {
473 ▶         abortSignal.addEventListener('abort', () => backend.abort(params));
474 │         return backend.fetch(params).catch((reason) => {
475 │           if (reason === 'aborted') {
476 │             aborted.push(params);
477 │           }
478 │           throw new Error(reason);
479 │         });
480 │       },
481 │       injector,
482 │     });
483 │ 
484 │     // start a request without resolving the previous one
485 │     TestBed.tick();
486 │     await Promise.resolve();
487 │ 
488 ▶     injector.destroy();
489 │     await backend.flush();
490 ▶     expect(echoResource.status()).toBe('idle');
491 │     expect(echoResource.value()).toBe(undefined);
492 │     expect(echoResource.error()).toBe(undefined);
493 │ 
494 ▶     expect(aborted).toEqual([{counter: 0}]);
495 │   });
```

469 行目で使い捨ての注入器を作り、473 行目で abort を偽の backend に伝えます。488 行目で注入器を壊すと、490 行目で `idle`、494 行目で読み込みが abort されたことを確かめます。

📄 `angular/packages/core/test/resource/resource_spec.ts` L516–528 （▶ の行: 520, 523, 527）

```ts
516 │     // start a request without resolving the previous one
517 │     TestBed.tick();
518 │     await Promise.resolve();
519 │ 
520 ▶     echoResource.destroy();
521 │     await backend.flush();
522 │ 
523 ▶     expect(echoResource.status()).toBe('idle');
524 │     expect(echoResource.value()).toBe(undefined);
525 │     expect(echoResource.error()).toBe(undefined);
526 │ 
527 ▶     expect(aborted).toEqual([{counter: 0}]);
528 │   });
```

手で壊す it は 520 行目の `destroy()` の後、523・527 行目で同じことを確かめるだけで、3 節の「`DestroyRef` の登録が外れたか」は見ていません。080b3687d32 は spec を足していないので、その行を消しても通ります。

📄 `angular/packages/core/rxjs-interop/test/rx_resource_spec.ts` L331–351 （▶ の行: 336, 338, 340–341, 347–349）

```ts
331 │   it('should unsubscribe when the observable emits synchronously ', () => {
332 │     let unsubscribed = false;
333 │ 
334 │     const res = rxResource({
335 │       stream: () => {
336 ▶         return new Observable((subscriber) => {
337 │           // Synchronously set the resource to trigger abort during subscription initialization
338 ▶           res.set('local value');
339 │           subscriber.next('stream value');
340 ▶           return () => {
341 ▶             unsubscribed = true;
342 │           };
343 │         });
344 │       },
345 │       injector: TestBed.inject(Injector),
346 │     });
347 ▶     TestBed.tick();
348 ▶     expect(res.value()).toBe('local value');
349 ▶     expect(unsubscribed).toBeTrue();
350 │   });
351 │ 
```

338 行目が 4 節の手順 3 の `set()` です。340〜342 行目の後片付けが呼ばれたかを、349 行目で確かめます。347 行目の `TestBed.tick()` で loadEffect を走らせます。

📄 `angular/packages/core/rxjs-interop/test/rx_resource_spec.ts` L352–382 （▶ の行: 353–355, 363, 375, 380）

```ts
352 │   it('should release the PendingTask when abort fires synchronously during subscription (regression)', async () => {
353 ▶     // Regression: when `res.set()` is called synchronously inside the stream factory (before
354 ▶     // the subscription is returned), the abort signal fired before `sub` was assigned.
355 ▶     // The resource stayed in a loading state forever, keeping the app unstable indefinitely.
356 │     const appRef = TestBed.inject(ApplicationRef);
357 │ 
358 │     const res = rxResource({
359 │       stream: () => {
360 │         return new Observable((subscriber) => {
361 │           // Calling res.set() triggers an abort of this very request synchronously,
362 │           // before the Observable constructor has returned the subscription.
363 ▶           res.set('local value');
364 │           subscriber.next('stream value');
365 │           return () => {};
366 │         });
367 │       },
368 │       injector: appRef.injector,
369 │     });
370 │ 
371 │     TestBed.tick();
372 │ 
373 │     // The resource should have taken the locally-set value, not the stream value.
374 │     expect(res.value()).toBe('local value');
375 ▶     expect(res.status()).toBe('local');
376 │ 
377 │     // The app must become stable. Before the fix this would never resolve because
378 │     // the PendingTask created for the loading request was never cleaned up. If the
379 │     // PendingTask wasn't properly released, this would timeout after 10 seconds.
380 ▶     await appRef.whenStable();
381 │   });
382 │ 
```

353〜355 行目のコメントは「修正の前は loading のまま、アプリはいつまでも安定しなかった」と書いていますが、375 行目で確かめている状態は `local` です。380 行目の `whenStable()` は、4 節の囲みのとおり、修正の 2 行を消しても終わります。

📄 `angular/packages/common/http/test/resource_spec.ts` L376–402 （▶ の行: 386–388, 390, 397, 400）

```ts
376 │   it('should unsubscribe the observable when the request emits synchronously', async () => {
377 │     let unsubscribed = false;
378 │     const request = signal('/data/0');
379 │ 
380 │     TestBed.resetTestingModule();
381 │     TestBed.configureTestingModule({
382 │       providers: [
383 │         provideHttpClient(
384 │           withInterceptors([
385 │             () =>
386 ▶               new Observable<HttpEvent<unknown>>((subscriber) => {
387 ▶                 subscriber.next(new HttpResponse({body: request()}));
388 ▶                 subscriber.complete();
389 │ 
390 ▶                 return () => (unsubscribed = true);
391 │               }),
392 │           ]),
393 │         ),
394 │       ],
395 │     });
396 │ 
397 ▶     const res = httpResource(() => request(), {injector: TestBed.inject(Injector)});
398 │     await TestBed.inject(ApplicationRef).whenStable();
399 │     expect(res.value()).toBe('/data/0');
400 ▶     expect(unsubscribed).toBeTrue();
401 │   });
402 │ 
```

386〜391 行目のインターセプタは、応答を同期で出して 388 行目で `complete` します。RxJS は `complete` の後に後片付け（390 行目）を必ず呼ぶので、400 行目は abort の道を通らなくても真になります。作業木で `HttpResourceImpl` の 437〜439 行目を消しても、この it を含む 22 件は通りました（b-exp-c-http-no-aborted.log）。この it は同期の応答を固めていますが、4 節の「subscribe の途中で abort」は通っていません。

### 手元で走らせた結果

📄 `走らせたコマンド（2026-11-13、8576f161ae4）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/resource:resource --nocache_test_results --test_output=all
pnpm bazel test //packages/core/rxjs-interop/test:test --nocache_test_results --test_output=all '--test_arg=--filter=rxResource'
pnpm bazel test //packages/common/http/test:test --nocache_test_results --test_output=all '--test_arg=--filter=httpResource'
```

| ターゲット | そのまま | 作業木で変えたもの → 結果 |
| --- | --- | --- |
| `//packages/core/test/resource:resource` | 70 specs, 0 failures | efbab16e567 の it を 1 つ足す → Ran 1 of 71、Timeout で 1 failure。src を差分のとおり直す → 71 specs, 0 failures |
| `//packages/core/rxjs-interop/test:test`（rxResource） | Ran 17 of 77、0 failures | 134〜136 行目を消す → 1 failure（331 行目の it）。`onAbort` の 2 行を消す → 0 failures |
| `//packages/common/http/test:test`（httpResource） | Ran 22 of 410、0 failures | 437〜439 行目を消す → 0 failures |

### 直すとしたら

- 4 節の `httpResource` の穴を固める it は、common/http/test/resource\_spec.ts に「インターセプタの Observable の中で `res.set()` を呼び、後片付けが呼ばれる」を足す形です。rx\_resource\_spec.ts 331 行目の it と同じ形です（rx の方は、134〜136 行目を消すと落ちることを作業木で確かめました）。
- 3 節の登録を外す行は、上の「手で壊す」it の隣に「手で壊した後、注入器を壊しても `destroy()` がもう一度呼ばれない」を確かめる形で固められます。
- 5 節の穴は、手元の木では `ResourceImpl.loadEffect` の `abortInProgressLoad()` の位置です。origin/main は efbab16e567 で直し、resource\_spec.ts と params\_status\_spec.ts に it を足しています（[第 6 回](06-resx-tests-issues.md)）。

## 聞かれそうな質問

**Q. コンポーネントを壊すと、読み込み中の fetch は止まりますか？**

loader が `abortSignal` を `fetch` に渡していれば止まります。`DestroyRef` に登録した `destroy()` が `abortInProgressLoad()` を呼ぶからです（1 節の表）。渡していなければ通信は最後まで走り、結果は捨てられます。`rxResource` と `httpResource` は 4 節の `onAbort` で自分で `unsubscribe()` します。

**Q. e0e902a8fa9 の前は、何が残っていたのですか？**

`rxResource` の stream の Observable が subscribe の途中で abort されたとき、その購読です。`onAbort` が呼ばれた時点で `sub` が `undefined` なので何もできず、abort は 1 回しか来ないので、Observable が自分で終わるまで購読が残りました。74 行目の旗と 134〜135 行目で、subscribe が返った後にやめるようにしました。

**Q. 63886758787 の「PendingTask を外す」は必要だったのですか？**

この木の spec では確かめられません。`onAbort` に足された 2 行を消しても、3 つの regression の it は通りました。仕事を外しているのは `abortInProgressLoad()` の `this.resolvePendingTask?.()` で、`resolveOnce()` が変えるのは abort された読み込みの `await` が終わるかどうかです（4 節の囲み）。

**Q. params を undefined にすれば、前の読み込みは止まりますか？**

8576f161ae4 と 22.1.6 では止まりません。loadEffect が `abortInProgressLoad()` より前に帰るからです（5 節）。DEMO では、Promise の loader に abort イベントが届かず、`rxResource` の Observable の購読も残ります。origin/main の efbab16e567（2026-11-10）で、帰る前に止めるようになりました。

**Q. 終わった読み込みにも abort イベントが来るのはなぜですか？**

8576f161ae4 の `finally` は `PendingTasks` の仕事だけを外し、`pendingController` を残すので、次の読み込みや `destroy()` の `abortInProgressLoad()` が終わった読み込みの `AbortController` も abort します。origin/main の 833c1f2c96c が、stream でない loader についてこれを消しました（5 節）。

## 読み終えて

- 片付けの入口（壊す・params を変える・`set()`）は、どれも `abortInProgressLoad()` で `AbortController` を abort し、`PendingTasks` の仕事を外す
- abort を受けて購読をやめるのは stream の側の `onAbort`。`rxResource` と `httpResource` の漏れの修正はここに集まっている
- e0e902a8fa9・63886758787 は、subscribe の途中の abort を旗で覚え、subscribe が返った後に `unsubscribe()` する（rx 134〜135、http 437〜438 行目）
- 63886758787 の httpResource の it と PendingTask の 3 つの it は、作業木で修正を消しても通った
- params が使えなくなったときに前の読み込みを止めない穴は、origin/main の efbab16e567 で直った（手元の木と 22.1.6 には残っている）

---

← 前: [SSR と resource：id で TransferState に値を残す、待ってから描く](04-resx-ssr-cache.md)  
次: [spec と issue を読む：resource の振る舞いを決めているテスト](06-resx-tests-issues.md) →
