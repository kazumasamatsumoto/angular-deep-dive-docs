[目次](../README.md) › [Signal の内側](README.md) › 第 9 回 / 全 18 回

# effect の内側：BASE\_EFFECT\_NODE・runEffect・onCleanup・破棄

> primitives の BASE\_EFFECT\_NODE と runEffect が consumerBeforeComputation → fn(onCleanup) → consumerAfterComputation をどう包むか、cleanup がいつ呼ばれるか（次の実行の前と destroy）。core の effect() が injector・manualCleanup・DestroyRef をどう扱い、EffectRef.destroy が何を外すか。primitives に残る createWatch が core の effect では使われていないこと。スケジューリングは「effect はいつ走るか」の章に任せ、この章はノードと寿命を読む。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/signals-effect-node)

---

`effect()` を呼ぶと、グラフの中に「いつも live な consumer」が 1 つ増えます。この章では、その consumer の正体（primitives の `BASE_EFFECT_NODE` と core の `EFFECT_NODE`）と、1 回の実行を包む `runEffect`、`onCleanup` で積んだ関数がいつ・どの順で呼ばれるか、`EffectRef.destroy()` が何を外すかを行で追います。「いつ走るか」（スケジューリング）は [cd-effects](../cd/09-cd-effects.md) に任せ、ここではノードと寿命だけを読みます。

読む対象は `packages/core/primitives/signals/src/effect.ts`、`watch.ts`、`graph.ts`（`consumerDestroy`）、`packages/core/src/render3/reactivity/effect.ts`、`render3/node_manipulation.ts`（ビューの破棄の一部）です。

1. [1. 概観](01-signals.md)
2. [2. ReactiveNode の構造](02-signals-reactive-node.md)
3. [3. 依存の追跡](03-signals-tracking.md)
4. [4. set と update](04-signals-set.md)
5. [5. push と pull](05-signals-push-pull.md)
6. [6. computed](06-signals-computed.md)
7. [7. live と non-live](07-signals-live.md)
8. [8. linkedSignal](08-signals-linked-signal.md)
9. **9. effect のノードと寿命**（この章）
10. [10. afterRenderEffect](10-signals-after-render-effect.md)
11. [11. input と viewChild](11-authoring.md)
12. [12. input() とコンパイラ](12-signals-input-compile.md)
13. [13. model() と output()](13-signals-model-output.md)
14. [14. toSignal と toObservable](14-signals-rxjs-interop.md)
15. [15. resource](15-resource.md)
16. [16. httpResource と rxResource](16-signals-http-resource.md)
17. [17. Signal Forms](17-signal-forms.md)
18. [18. DevTools と signal グラフ](18-signals-debug.md)

## 1. primitives の型：effect は「fn・cleanup・run・destroy を持つ consumer」

📄 `angular/packages/core/primitives/signals/src/effect.ts` L17–34 （▶ の行: 18–19, 22, 27, 29–33）

```ts
17 │ /**
18 ▶  * An effect can, optionally, register a cleanup function. If registered, the cleanup is executed
19 ▶  * before the next effect run. The cleanup function makes it possible to "cancel" any work that the
20 │  * previous effect run might have started.
21 │  */
22 ▶ export type EffectCleanupFn = () => void;
23 │ 
24 │ /**
25 │  * A callback passed to the effect function that makes it possible to register cleanup logic.
26 │  */
27 ▶ export type EffectCleanupRegisterFn = (cleanupFn: EffectCleanupFn) => void;
28 │ 
29 ▶ export interface BaseEffectNode extends ReactiveNode {
30 ▶   fn: () => void;
31 ▶   destroy(): void;
32 ▶   cleanup(): void;
33 ▶   run(): void;
34 │ }
```

22 行目の `EffectCleanupFn` は引数なしの関数、27 行目の `EffectCleanupRegisterFn` はそれを受け取って登録する関数です。利用者が書く `onCleanup` の型がこれです。18〜19 行目の doc は「cleanup は次の実行の前に呼ばれる」。29〜34 行目、`BaseEffectNode` は `ReactiveNode` に 4 つのメソッドを足しただけです。`fn` は 1 回分の本体、`run` は実行の入口、`cleanup` と `destroy` の中身は primitives では決めず、使う側（core）が埋めます。

📄 `angular/packages/core/primitives/signals/src/effect.ts` L39–58 （▶ の行: 39–41, 46–48, 50–51, 53–54, 56）

```ts
39 ▶     consumerIsAlwaysLive: true,
40 ▶     consumerAllowSignalWrites: true,
41 ▶     dirty: true,
42 │     kind: 'effect',
43 │   }))();
44 │ 
45 │ export function runEffect(node: BaseEffectNode) {
46 ▶   node.dirty = false;
47 ▶   if (node.version > 0 && !consumerPollProducersForChange(node)) {
48 ▶     return;
49 │   }
50 ▶   node.version++;
51 ▶   const prevNode = consumerBeforeComputation(node);
52 │   try {
53 ▶     node.cleanup();
54 ▶     node.fn();
55 │   } finally {
56 ▶     consumerAfterComputation(node, prevNode);
57 │   }
58 │ }
```

既定値は 3 つです（`BASE_EFFECT_NODE` の定義全体は [cd-effects](../cd/09-cd-effects.md) で引用）。39 行目 `consumerIsAlwaysLive: true` は「consumer がいなくても live」。effect を読む人はいないので、これが無いと producer からの通知が届きません（[第 7 回](07-signals-live.md)）。40 行目 `consumerAllowSignalWrites: true` は「中で signal を書いてよい」。41 行目 `dirty: true` は「作った時点で 1 回走らせる必要がある」。

1. **46 行目：dirty を下ろす**

   実行の途中でまた dirty になれば、それは次の実行の合図になります。
2. **47〜48 行目：2 回目以降は「本当に変わったか」を確かめる**

   `version > 0`（一度でも走った）で、`consumerPollProducersForChange` が偽（読んだ signal の版がどれも前回と同じ）なら、何もせず帰ります。dirty の印は「変わったかもしれない」でしかないからです。たとえば `computed` を読んでいて、その computed が再計算の結果同じ値だった場合がこれに当たります。このときは **cleanup も呼ばれません**。
3. **50 行目：`version++`**

   effect の version は「何回走ったか」です。47 行目の `version > 0` はこの数を見ています。
4. **51 行目：自分を今の consumer にする**

   `consumerBeforeComputation`（[第 3 回](03-signals-tracking.md)）。ここから読まれた signal が依存として記録し直されます。
5. **53 行目：`node.cleanup()` → 54 行目：`node.fn()`**

   前回の実行が積んだ cleanup を先に全部呼び、それから本体を呼びます。cleanup は consumer を立てた後に呼ばれますが、core の cleanup は自分で consumer を外します（3 節の 241 行目）。
6. **56 行目：`finally` で consumerAfterComputation**

   fn が投げても依存の記録を締め、前の consumer に戻します。今回読まなかった signal との依存はここで切れます（[第 3 回](03-signals-tracking.md)）。

### primitives の createWatch は core の effect では使われていない

📄 `angular/packages/core/primitives/signals/src/watch.ts` L65–80 （▶ の行: 65, 68, 71–72, 78–79）

```ts
65 ▶ export function createWatch(
66 │   fn: (onCleanup: WatchCleanupRegisterFn) => void,
67 │   schedule: (watch: Watch) => void,
68 ▶   allowSignalWrites: boolean,
69 │ ): Watch {
70 │   const node: WatchNode = Object.create(WATCH_NODE);
71 ▶   if (allowSignalWrites) {
72 ▶     node.consumerAllowSignalWrites = true;
73 │   }
74 │ 
75 │   node.fn = fn;
76 │   node.schedule = schedule;
77 │ 
78 ▶   const registerOnCleanup = (cleanupFn: WatchCleanupFn) => {
79 ▶     node.cleanupFn = cleanupFn;
80 │   };
```

同じ primitives には `createWatch` という、似た役割の古い部品も残っています。68 行目、書いてよいかを**引数**で受け取り、71〜72 行目で真のときだけ `consumerAllowSignalWrites` を立てます（`WATCH_NODE` の既定は false）。78〜79 行目の `onCleanup` は 1 つの変数に**上書き**するので、2 回呼ぶと 1 つ目は失われます。`packages/` 全体を `createWatch` で `grep` すると、テストを除いて出てくるのは `primitives/signals/index.ts` の export と、この定義だけです。core の `effect()` は 2 節以降のとおり `BASE_EFFECT_NODE` と `runEffect` を使います。

## 2. core の effect()：injector・manualCleanup・DestroyRef

📄 `angular/packages/core/src/render3/reactivity/effect.ts` L61–95 （▶ の行: 73, 78–79, 81–82, 84, 87, 89, 94）

```ts
61 │ /**
62 │  * Options passed to the `effect` function.
63 │  *
64 │  * @publicApi 20.0
65 │  */
66 │ export interface CreateEffectOptions {
67 │   /**
68 │    * The `Injector` in which to create the effect.
69 │    *
70 │    * If this is not provided, the current [injection context](guide/di/dependency-injection-context)
71 │    * will be used instead (via `inject`).
72 │    */
73 ▶   injector?: Injector;
74 │ 
75 │   /**
76 │    * Whether the `effect` should require manual cleanup.
77 │    *
78 ▶    * If this is `false` (the default) the effect will automatically register itself to be cleaned up
79 ▶    * with the current `DestroyRef`.
80 │    *
81 ▶    * If this is `true` and you want to use the effect outside an injection context, you still
82 ▶    * need to provide an `Injector` to the effect.
83 │    */
84 ▶   manualCleanup?: boolean;
85 │ 
86 │   /**
87 ▶    * @deprecated no longer required, signal writes are allowed by default.
88 │    */
89 ▶   allowSignalWrites?: boolean;
90 │ 
91 │   /**
92 │    * A debug name for the effect. Used in Angular DevTools to identify the effect.
93 │    */
94 ▶   debugName?: string;
95 │ }
```

オプションは 4 つです。73 行目 `injector`、84 行目 `manualCleanup`、89 行目 `allowSignalWrites`（87 行目で非推奨。もう何も変えない）、94 行目 `debugName`。78〜79 行目、`manualCleanup` が false（既定）なら「今の `DestroyRef` に自分の破棄を登録する」。81〜82 行目、true にしても注入コンテキストの外で使うなら `injector` は要る。

📄 `angular/packages/core/src/render3/reactivity/effect.ts` L158–176 （▶ の行: 158–159, 163, 165, 167–168, 171, 175）

```ts
158 ▶   const injector = options?.injector ?? inject(Injector);
159 ▶   let destroyRef = options?.manualCleanup !== true ? injector.get(DestroyRef) : null;
160 │ 
161 │   let node: EffectNode;
162 │ 
163 ▶   const viewContext = injector.get(ViewContext, null, {optional: true});
164 │   const notifier = injector.get(ChangeDetectionScheduler);
165 ▶   if (viewContext !== null) {
166 │     // This effect was created in the context of a view, and will be associated with the view.
167 ▶     node = createViewEffect(viewContext.view, notifier, effectFn);
168 ▶     if (destroyRef instanceof NodeInjectorDestroyRef && destroyRef._lView === viewContext.view) {
169 │       // The effect is being created in the same view as the `DestroyRef` references, so it will be
170 │       // automatically destroyed without the need for an explicit `DestroyRef` registration.
171 ▶       destroyRef = null;
172 │     }
173 │   } else {
174 │     // This effect was created outside the context of a view, and will be scheduled independently.
175 ▶     node = createRootEffect(effectFn, injector.get(EffectScheduler), notifier);
176 │   }
```

1. **158 行目：injector を決める**

   渡されていればそれ、無ければ `inject(Injector)`。ここが注入コンテキストを要求する本体で、直前の開発ビルド用の検査は [di-injection-context](../di/03-di-injection-context.md) で読みました。
2. **159 行目：`manualCleanup` でなければ `DestroyRef` を取る**

   true なら `null`。この先、破棄の登録をしません。
3. **163〜175 行目：ノードを作る（view か root か）**

   `ViewContext` が取れれば 167 行目で view effect、取れなければ 175 行目で root effect。振り分けとそれぞれの走る時刻は [cd-effects](../cd/09-cd-effects.md) の本題なので、ここでは「どちらも作った時点で dirty なので、最初の実行が予約される」とだけ覚えておきます。`effect()` の中で fn は呼ばれません。
4. **168〜171 行目：view effect で、DestroyRef が同じ LView なら登録をやめる**

   170〜171 行目のコメントのとおり、同じ LView に属する effect は「明示的な DestroyRef の登録が無くても自動で破棄される」から `destroyRef = null`。自動で破棄する場所は 4 節の `node_manipulation.ts` です。コンポーネントのフィールド初期化子で作った effect はこの経路です。`ViewContext` も、コンポーネントが注入する `DestroyRef`（`NodeInjectorDestroyRef`）も、そのとき処理中の LView から作られるからです。

📄 `angular/packages/core/src/render3/reactivity/effect.ts` L177–197 （▶ の行: 177, 179, 181, 184, 186–187, 196）

```ts
177 ▶   node.injector = injector;
178 │ 
179 ▶   if (destroyRef !== null) {
180 │     // If we need to register for cleanup, do that here.
181 ▶     node.onDestroyFns = [destroyRef.onDestroy(() => node.destroy())];
182 │   }
183 │ 
184 ▶   const effectRef = new EffectRefImpl(node);
185 │ 
186 ▶   if (ngDevMode) {
187 ▶     node.debugName = options?.debugName ?? '';
188 │     const prevInjectorProfilerContext = setInjectorProfilerContext({injector, token: null});
189 │     try {
190 │       emitEffectCreatedEvent(effectRef);
191 │     } finally {
192 │       setInjectorProfilerContext(prevInjectorProfilerContext);
193 │     }
194 │   }
195 │ 
196 ▶   return effectRef;
197 │ }
```

177 行目でノードに injector を持たせ、179〜181 行目で DestroyRef に「破棄されたら `node.destroy()`」を登録します。181 行目で配列に入れているのは **`onDestroy` の戻り値**、つまり「この登録を外す関数」です（`DestroyRef.onDestroy` が登録解除の関数を返すことは [di-destroy](../di/14-di-destroy.md)）。4 節の destroy はこれを呼んで、DestroyRef 側の登録を外します。184 行目で `EffectRefImpl` に包んで、196 行目で返します。187 行目、`debugName` は開発ビルドのときだけ載ります。

📄 `angular/packages/core/src/render3/reactivity/effect.ts` L35–59 （▶ の行: 44, 46, 50, 53, 57）

```ts
35 │ /**
36 │  * A global reactive effect, which can be manually destroyed.
37 │  *
38 │  * @publicApi 20.0
39 │  *
40 │  * @see [Destroying effects](guide/signals/effect#destroying-effects)
41 │  */
42 │ export interface EffectRef {
43 │   /**
44 ▶    * Shut down the effect, removing it from any upcoming scheduled executions.
45 │    */
46 ▶   destroy(): void;
47 │ }
48 │ 
49 │ export class EffectRefImpl implements EffectRef {
50 ▶   [SIGNAL]: EffectNode;
51 │ 
52 │   constructor(node: EffectNode) {
53 ▶     this[SIGNAL] = node;
54 │   }
55 │ 
56 │   destroy(): void {
57 ▶     this[SIGNAL].destroy();
58 │   }
59 │ }
```

利用者が受け取る `EffectRef` は `destroy()` だけを持つ薄い包みです。53 行目で `[SIGNAL]` にノードを持ち、57 行目でノードの `destroy()` を呼ぶだけです。

## 3. onCleanup：積んで、後ろから呼ぶ

📄 `angular/packages/core/src/render3/reactivity/effect.ts` L199–216 （▶ の行: 200, 204, 206）

```ts
199 │ export interface EffectNode extends BaseEffectNode, SchedulableEffect {
200 ▶   cleanupFns: EffectCleanupFn[] | undefined;
201 │   injector: Injector;
202 │   notifier: ChangeDetectionScheduler;
203 │ 
204 ▶   userFn: (onCleanup: EffectCleanupRegisterFn) => void;
205 │ 
206 ▶   onDestroyFns: (() => void)[] | null;
207 │ }
208 │ 
209 │ export interface ViewEffectNode extends EffectNode {
210 │   view: LView;
211 │ }
212 │ 
213 │ export interface RootEffectNode extends EffectNode {
214 │   scheduler: EffectScheduler;
215 │ }
216 │ 
```

core のノード `EffectNode` は、200 行目に cleanup の**配列**、204 行目に利用者の関数そのもの（`userFn`）、206 行目に 2 節の「登録を外す関数」の配列を持ちます。1 節の `fn`（引数なし）と 204 行目の `userFn`（`onCleanup` を受け取る）をつなぐのが次の関数です。

📄 `angular/packages/core/src/render3/reactivity/effect.ts` L338–342 （▶ の行: 339–340）

```ts
338 │ function createEffectFn(node: EffectNode, fn: (onCleanup: EffectCleanupRegisterFn) => void) {
339 ▶   return () => {
340 ▶     fn((cleanupFn) => (node.cleanupFns ??= []).push(cleanupFn));
341 │   };
342 │ }
```

340 行目、`node.fn` は「利用者の関数を、`onCleanup` を渡して呼ぶ」関数です。`onCleanup(f)` は `node.cleanupFns` を初めて使うときに作り（`??=`）、`push` するだけ。呼ぶたびに積まれます（`createWatch` の上書きとの違い）。

📄 `angular/packages/core/src/render3/reactivity/effect.ts` L237–254 （▶ の行: 238, 241, 243, 246–247, 250–251）

```ts
237 │     cleanup(this: EffectNode): void {
238 ▶       if (!this.cleanupFns?.length) {
239 │         return;
240 │       }
241 ▶       const prevConsumer = setActiveConsumer(null);
242 │       try {
243 ▶         // Attempt to run the cleanup functions. Regardless of failure or success, we consider
244 │         // cleanup "completed" and clear the list for the next run of the effect. Note that an error
245 │         // from the cleanup function will still crash the current run of the effect.
246 ▶         while (this.cleanupFns.length) {
247 ▶           this.cleanupFns.pop()!();
248 │         }
249 │       } finally {
250 ▶         this.cleanupFns = [];
251 ▶         setActiveConsumer(prevConsumer);
252 │       }
253 │     },
254 │   }))();
```

1. **238 行目：積まれていなければ何もしない**
2. **241 行目：consumer を外す**

   `runEffect` は 51 行目で consumer を立ててから 53 行目で cleanup を呼ぶので、ここで外さないと cleanup の中で読んだ signal が effect の依存になってしまいます。
3. **246〜247 行目：`pop()` で後ろから呼ぶ**

   **登録した順の逆**に呼ばれます。A、B の順に登録すれば B、A の順。デモで確かめられます。
4. **250 行目：`finally` で空にする**

   243〜245 行目のコメントのとおり、cleanup が投げても「片付けは済んだ」として空にします。ただしそのエラーで今回の実行（53 行目の後の 54 行目）は止まります。

この `cleanup` を呼ぶのは 2 か所だけです。**次の実行の直前**（`runEffect` の 53 行目）と、**destroy**（次の節の 274 行目・298 行目）。47〜48 行目で「変わっていない」と判断された回は 53 行目まで来ないので、cleanup も呼ばれません。

## 4. destroy：何を外すか

📄 `angular/packages/core/src/render3/reactivity/effect.ts` L265–276 （▶ の行: 266, 268, 270, 274–275）

```ts
265 │   destroy(this: RootEffectNode) {
266 ▶     consumerDestroy(this);
267 │ 
268 ▶     if (this.onDestroyFns !== null) {
269 │       for (const fn of this.onDestroyFns) {
270 ▶         fn();
271 │       }
272 │     }
273 │ 
274 ▶     this.cleanup();
275 ▶     this.scheduler.remove(this);
276 │   },
```

📄 `angular/packages/core/src/render3/reactivity/effect.ts` L289–300 （▶ の行: 290, 292, 294, 298–299）

```ts
289 │   destroy(this: ViewEffectNode): void {
290 ▶     consumerDestroy(this);
291 │ 
292 ▶     if (this.onDestroyFns !== null) {
293 │       for (const fn of this.onDestroyFns) {
294 ▶         fn();
295 │       }
296 │     }
297 │ 
298 ▶     this.cleanup();
299 ▶     this.view[EFFECTS]?.delete(this);
300 │   },
```

root effect（265〜276 行目）と view effect（289〜300 行目）は、最後の 1 行以外同じです。

1. **266 / 290 行目：`consumerDestroy(this)` でグラフから外す**

   読んでいた signal から、この effect への辺を全部切ります（下の graph.ts）。以後 signal を書いても dirty の通知が届きません。
2. **268〜272 / 292〜296 行目：DestroyRef の登録を外す**

   2 節 181 行目で入れた「登録を外す関数」を呼びます。`EffectRef.destroy()` を手で呼んだ後に DestroyRef が破棄されても、二重に destroy されません。
3. **274 / 298 行目：最後の cleanup**

   最後に走った回が積んだ cleanup を、3 節と同じ順（後ろから）で呼びます。
4. **275 行目：root はスケジューラから外す ／ 299 行目：view は LView の `EFFECTS` から外す**

   予約済みでも、もう実行されません。

📄 `angular/packages/core/primitives/signals/src/graph.ts` L498–515 （▶ の行: 502, 504, 506, 511–514）

```ts
498 │ /**
499 │  * Disconnect this consumer from the graph.
500 │  */
501 │ export function consumerDestroy(node: ReactiveNode): void {
502 ▶   if (consumerIsLive(node)) {
503 │     // Drop all connections from the graph to this node.
504 ▶     let link = node.producers;
505 │     while (link !== undefined) {
506 ▶       link = producerRemoveLiveConsumerLink(link);
507 │     }
508 │   }
509 │ 
510 │   // Truncate all the linked lists to drop all connection from this node to the graph.
511 ▶   node.producers = undefined;
512 ▶   node.producersTail = undefined;
513 ▶   node.consumers = undefined;
514 ▶   node.consumersTail = undefined;
515 │ }
```

502 行目、live なら（effect はいつも live）504〜507 行目で自分の producer 側のリンクを 1 本ずつ外します。producer から見た「consumer のリスト」から自分が消えるので、通知が届かなくなります。511〜514 行目で自分側のリストも切ります。リンクの構造は [第 2 回](02-signals-reactive-node.md)、live の伝わり方は [第 7 回](07-signals-live.md)。

📄 `angular/packages/core/src/render3/node_manipulation.ts` L427–434 （▶ の行: 428, 430–432）

```ts
427 │   // Destroy effects registered to the view. Many of these will have been processed above.
428 ▶   const effects = lView[EFFECTS];
429 │   if (effects !== null) {
430 ▶     lView[EFFECTS] = null;
431 ▶     for (const effect of effects) {
432 ▶       effect.destroy();
433 │     }
434 │   }
```

view effect を自動で破棄するのはここです。LView を破棄するとき、ビューの破棄フック（DestroyRef に登録したものを含む）を呼んだ後、428〜432 行目で `EFFECTS` に残っている effect を全部 `destroy()` します（破棄の全体は [ivy-destroy](../ivy/17-ivy-destroy.md)）。2 節 168〜171 行目で DestroyRef の登録を省けるのは、この行があるからです。

## 5. DEMO：cleanup → run の順と、destroy の後

> **🧪 DEMO — effect((onCleanup) =&gt; { count(); onCleanup(A); onCleanup(B); })**
>
> デモの部品のフィールド初期化子で `effect()` を作っています（view effect）。ログの最初の行は `effect()` から戻った直後のもので、run #1 はその後の変更検知の中で来ます。この部品はホストに `ngSkipHydration` を付け、ブラウザで描き直しています（サーバーでの描画でも view effect は走り、ログの行数がずれるため）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/signals-effect-node)

count を増やすと、**cleanup B → cleanup A → run** の順に並びます。B が先なのは 247 行目の `pop()`、cleanup が run より先なのは 53〜54 行目の順番です。「同じ値」を押すと何も起きません。signal の `set` が equal で止まり（[第 4 回](04-signals-set.md)）、effect に通知が届かないからです。`destroy()` を押すと、「destroy() を呼ぶ」と「destroy() から戻った」の間に cleanup B・A が出ます（298 行目）。その後 count を増やしても run は出ません（290 行目で辺が切れ、299 行目で LView から外れている）。

## 全体の流れ

- 👤 `effect(fn, options)` — 利用者のコード（注入コンテキスト）
  - `inject(Injector)` / `injector.get(DestroyRef)` — effect.ts L158-159 — *manualCleanup なら DestroyRef は null*
  - `createViewEffect` / `createRootEffect` — L167 / L175 — *dirty: true なので初回が予約される（cd-effects）*
  - `destroyRef.onDestroy(() => node.destroy())` — L181 — *戻り値（登録解除）を onDestroyFns に*
- `node.run()` — スケジューラから（cd-effects） — *実行*
  - `runEffect(node)` — primitives effect.ts L45 — *2 回目以降は L47 で変化を確認*
    - `consumerBeforeComputation(node)` — L51
    - `node.cleanup()` — L53 → effect.ts L237 — *consumer を外し、後ろから pop*
    - `node.fn()` → `userFn(onCleanup)` — L54 → L340 — *onCleanup は cleanupFns に push*
    - `consumerAfterComputation(node, prev)` — L56
- 👤 `effectRef.destroy()` — 利用者 / DestroyRef / LView の破棄（node\_manipulation.ts L432） — *破棄*
  - `consumerDestroy(node)` — effect.ts L266 / L290 → graph.ts L501 — *辺を切る*
  - `onDestroyFns の各関数` — L268-272 / L292-296 — *DestroyRef の登録を外す*
  - `this.cleanup()` — L274 / L298 — *最後の cleanup*
  - `scheduler.remove` / `view[EFFECTS].delete` — L275 / L299 — *予約からも外す*

## 聞かれそうな質問

**Q. effect の中で signal を set してよいのですか？昔は allowSignalWrites が要りましたよね？**

今はよいです。effect のノードは 40 行目で `consumerAllowSignalWrites: true` を既定に持つので、`signalSetFn` の「書いてよい文脈か」の検査（[第 4 回](04-signals-set.md)）を通ります。`allowSignalWrites` オプションは 87 行目で非推奨になり、ノードには何も反映されません（開発ビルドで警告を出すだけ）。昔の形が 1 節の `createWatch` の 68〜72 行目で、既定は書けず、引数で真を渡したときだけ書けました。変わったのは v19.0.0 です（`CHANGELOG.md` の 19.0.0 に「change effect() execution timing & no-op `allowSignalWrites`」）。

**Q. onCleanup に渡した関数はいつ呼ばれますか？**

2 つの時点だけです。(1) 次に本当に走るとき、本体の直前（primitives effect.ts 53 行目）。(2) destroy のとき（core effect.ts 274 / 298 行目）。dirty になっても、読んだ signal の版が変わっていなければ 47〜48 行目で帰るので、cleanup は呼ばれません。複数登録すると、247 行目の `pop()` で登録の逆順に呼ばれます。cleanup の中で読んだ signal は依存になりません（241 行目）。

**Q. effect が作った直後に同期で走らないのはなぜですか？**

`effect()` の中で fn を呼ぶ行が無いからです。ノードは 41 行目で dirty として作られ、view effect なら LView に印を付けて、root effect ならスケジューラに積んで、変更検知を予約するだけです（[cd-effects](../cd/09-cd-effects.md)）。実行は後で `node.run()` → `runEffect` を通ります。デモの最初の 2 行がこの順です。

**Q. manualCleanup: true にすると、コンポーネントが消えても effect は生き続けますか？**

view effect は消えます。`manualCleanup` が変えるのは 159 行目の DestroyRef の取得だけで、view effect は作られたときに LView の `EFFECTS` に入っており、LView を破棄すると node\_manipulation.ts 428〜432 行目で `destroy()` されます。生き続けるのは root effect（サービスなど `ViewContext` が無い場所で作ったもの）で、そのときは `EffectRef.destroy()` を自分で呼びます。

**Q. EffectRef.destroy() を 2 回呼ぶとどうなりますか？**

何も壊れません。`consumerDestroy` は 2 回目には外すリンクが無く、cleanup は 250 行目で空になっているので 238 行目で帰ります。DestroyRef の登録解除（`NodeInjectorDestroyRef` も `R3Injector` も `indexOf` で探して見つかったときだけ消す）、スケジューラの `remove`（キューに無ければ帰る）、`Set` の `delete` も、無いものを外そうとして何もしないだけです。

## 読み終えて

- effect のノードは「いつも live（39 行目）・書いてよい（40 行目）・最初から dirty（41 行目）」の consumer。
- 1 回の実行は `runEffect`：変化を確認 → consumer を立てる → cleanup → fn → 依存を締める。
- `onCleanup` は配列に積み（340 行目）、次の実行の前か destroy のときに、後ろから呼ばれる（247 行目）。
- destroy はグラフの辺・DestroyRef の登録・最後の cleanup・予約（スケジューラか LView）の 4 つを外す。
- primitives の `createWatch` は残っているが、core の `effect()` は使っていない。

---

← 前: [linkedSignal の内側：書ける computed、source と previous](08-signals-linked-signal.md)  
次: [afterRenderEffect：4 つのフェーズを signal でつなぐ](10-signals-after-render-effect.md) →
