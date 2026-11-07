[目次](../README.md) › [Signal の内側](README.md) › 第 4 回 / 全 18 回

# set と update：equal・version・epoch、そして NG0600 で書き込みを止める場所

> signalSetFn が producerUpdatesAllowed で書き込みを許すか判定し、equal（既定は Object.is）で同じ値なら何もしない行、signalValueChanged が version++ → producerIncrementEpoch → producerNotifyConsumers → postSignalSetFn の順に呼ぶ行。consumerAllowSignalWrites が false の consumer（computed・linkedSignal・テンプレート）の中で書くと NG0600 になり、そのメッセージを application\_ref.ts の publishSignalConfiguration が差し込む仕組み。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/signals-set)

---

この章で分かること：`count.set(v)` は、(1) いまの文脈で書いてよいかを確かめ、(2) `equal` で前の値と比べ、(3) 違うときだけ値を入れて `version` と `epoch` を増やし consumer に知らせる、の 3 段で終わります。`computed` やテンプレートの中で書くと出る NG0600 が、primitives では中身の無い `Error` で、Angular が起動時にそれを `RuntimeError` に差し替えていることも行で確かめます。

読む対象は `packages/core/primitives/signals/src/signal.ts`、`equality.ts`、`errors.ts`、`graph.ts` と、`packages/core/src/application/application_ref.ts`、`platform/platform.ts`、`errors.ts`、`render3/reactivity/signal.ts`、`asserts.ts` です。

1. [1. 概観](01-signals.md)
2. [2. ReactiveNode の構造](02-signals-reactive-node.md)
3. [3. 依存の追跡](03-signals-tracking.md)
4. **4. set と update**（この章）
5. [5. push と pull](05-signals-push-pull.md)
6. [6. computed](06-signals-computed.md)
7. [7. live と non-live](07-signals-live.md)
8. [8. linkedSignal](08-signals-linked-signal.md)
9. [9. effect のノードと寿命](09-signals-effect-node.md)
10. [10. afterRenderEffect](10-signals-after-render-effect.md)
11. [11. input と viewChild](11-authoring.md)
12. [12. input() とコンパイラ](12-signals-input-compile.md)
13. [13. model() と output()](13-signals-model-output.md)
14. [14. toSignal と toObservable](14-signals-rxjs-interop.md)
15. [15. resource](15-resource.md)
16. [16. httpResource と rxResource](16-signals-http-resource.md)
17. [17. Signal Forms](17-signal-forms.md)
18. [18. DevTools と signal グラフ](18-signals-debug.md)

## 1. set と update の本体

📄 `angular/packages/core/primitives/signals/src/signal.ts` L86–107 （▶ の行: 87–88, 91–93, 98–99, 102, 106）

```ts
 86 │ export function signalSetFn<T>(node: SignalNode<T>, newValue: T) {
 87 ▶   if (!producerUpdatesAllowed()) {
 88 ▶     throwInvalidWriteToSignalError(node);
 89 │   }
 90 │ 
 91 ▶   if (!node.equal(node.value, newValue)) {
 92 ▶     node.value = newValue;
 93 ▶     signalValueChanged(node);
 94 │   }
 95 │ }
 96 │ 
 97 │ export function signalUpdateFn<T>(node: SignalNode<T>, updater: (value: T) => T): void {
 98 ▶   if (!producerUpdatesAllowed()) {
 99 ▶     throwInvalidWriteToSignalError(node);
100 │   }
101 │ 
102 ▶   signalSetFn(node, updater(node.value));
103 │ }
104 │ 
105 │ export function runPostSignalSetFn<T>(node: SignalNode<T>): void {
106 ▶   postSignalSetFn?.(node);
107 │ }
```

1. **87〜88 行目：書いてよい文脈かを確かめる**

   だめなら `throwInvalidWriteToSignalError` で例外を投げます。判定の中身は 4 節、例外の中身は 5 節です。
2. **91 行目：`node.equal(node.value, newValue)` で前の値と比べる**

   **等しければここで終わり**です。値も version も変わらず、誰にも知らせません。
3. **92〜93 行目：違えば値を入れて、`signalValueChanged`**

   値を入れるのが先、知らせるのが後です（3 節）。

`update(fn)` は 97〜103 行目です。98 行目で同じ判定をし、102 行目で `updater(node.value)` の結果を `signalSetFn` に渡します。つまり **`update` は「今の値から新しい値を作って `set` する」だけ**で、比較も通知も `set` と同じ経路です。102 行目が今の値を getter ではなく `node.value` から直接読んでいる点も覚えておいてください（聞かれそうな質問で使います）。

## 2. equal：既定は Object.is

📄 `angular/packages/core/primitives/signals/src/equality.ts` L9–19 （▶ の行: 17–18）

```ts
 9 │ /**
10 │  * A comparison function which can determine if two values are equal.
11 │  */
12 │ export type ValueEqualityFn<T> = (a: T, b: T) => boolean;
13 │ 
14 │ /**
15 │  * The default equality function used for `signal` and `computed`, which uses referential equality.
16 │  */
17 ▶ export function defaultEquals<T>(a: T, b: T) {
18 ▶   return Object.is(a, b);
19 │ }
```

18 行目、既定の比較は `Object.is(a, b)` です。`===` とほぼ同じで、違いは `NaN` 同士を等しいとみなすことと、`+0` と `-0` を区別することだけです。オブジェクトや配列は**参照が同じかどうか**しか見ません。中身は比べません。

📄 `angular/packages/core/src/render3/reactivity/signal.ts` L53–73 （▶ の行: 60, 65, 73）

```ts
53 │ /**
54 │  * Options passed to the `signal` creation function.
55 │  */
56 │ export interface CreateSignalOptions<T> {
57 │   /**
58 │    * A comparison function which defines equality for signal values.
59 │    */
60 ▶   equal?: ValueEqualityFn<T>;
61 │ 
62 │   /**
63 │    * A debug name for the signal. Used in Angular DevTools to identify the signal.
64 │    */
65 ▶   debugName?: string;
66 │ }
67 │ 
68 │ /**
69 │  * Create a `Signal` that can be set or updated directly.
70 │  * @see [Angular Signals](guide/signals)
71 │  */
72 │ export function signal<T>(initialValue: T, options?: CreateSignalOptions<T>): WritableSignal<T> {
73 ▶   const [get, set, update] = createSignal(initialValue, options?.equal);
```

利用者が `signal(v, { equal })` で渡した関数は、73 行目で primitives の `createSignal` に渡り、ノードの `equal` になります（[第 2 回](02-signals-reactive-node.md)の 4 節）。1 節の 91 行目はそれを呼ぶだけです。65 行目の `debugName` は比較とは関係なく、開発モードでだけノードに残ります。

## 3. 値が変わったとき：4 つの処理の順番

📄 `angular/packages/core/primitives/signals/src/signal.ts` L120–125 （▶ の行: 121–124）

```ts
120 │ function signalValueChanged<T>(node: SignalNode<T>): void {
121 ▶   node.version++;
122 ▶   producerIncrementEpoch();
123 ▶   producerNotifyConsumers(node);
124 ▶   postSignalSetFn?.(node);
125 │ }
```

1. **121 行目：`node.version++`**

   この signal の値の版を上げます。
2. **122 行目：`producerIncrementEpoch()`**

   グラフ全体の通し番号 `epoch` を上げます（[第 1 回](01-signals.md)）。
3. **123 行目：`producerNotifyConsumers(node)`**

   live な consumer に `dirty` を立てていきます。値は渡しません。version を先に上げているので、知らされた側がその場で比べても新しい version が見えます。中身は [第 5 回](05-signals-push-pull.md)です。
4. **124 行目：`postSignalSetFn?.(node)`**

   設定されていれば呼ばれるフックです。次で誰が設定するかを見ます。

📄 `angular/packages/core/primitives/signals/src/signal.ts` L27–33 （▶ の行: 30–31, 33）

```ts
27 │ /**
28 │  * If set, called after `WritableSignal`s are updated.
29 │  *
30 ▶  * This hook can be used to achieve various effects, such as running effects synchronously as part
31 ▶  * of setting a signal.
32 │  */
33 ▶ let postSignalSetFn: ReactiveHookFn | null = null;
```

📄 `angular/packages/core/primitives/signals/src/signal.ts` L75–79 （▶ の行: 75, 77）

```ts
75 ▶ export function setPostSignalSetFn(fn: ReactiveHookFn | null): ReactiveHookFn | null {
76 │   const prev = postSignalSetFn;
77 ▶   postSignalSetFn = fn;
78 │   return prev;
79 │ }
```

33 行目のモジュール変数を、75〜79 行目の `setPostSignalSetFn` で差し替えます。30〜31 行目のコメントは「set の一部として effect を同期的に走らせる、といった用途に使える」と書いています。ところが `packages/` を検索すると、`setPostSignalSetFn` を呼んでいるのは `core/test/signals/signal_spec.ts`（テスト）だけで、Angular 本体は設定していません。つまり**普通のアプリでは 124 行目は何もしません**。1 節の 105〜107 行目の `runPostSignalSetFn` も、本体からは呼ばれていません。

## 4. 書いてよいかの判定：producerUpdatesAllowed

📄 `angular/packages/core/primitives/signals/src/graph.ts` L363–369 （▶ の行: 368）

```ts
363 │ /**
364 │  * Whether this `ReactiveNode` in its producer capacity is currently allowed to initiate updates,
365 │  * based on the current consumer context.
366 │  */
367 │ export function producerUpdatesAllowed(): boolean {
368 ▶   return activeConsumer?.consumerAllowSignalWrites !== false;
369 │ }
```

368 行目の 1 行だけです。`activeConsumer?.consumerAllowSignalWrites !== false`。`activeConsumer` が `null`（計算中のノードが無い）なら `?.` の結果は `undefined` で、`undefined !== false` は真なので**許可**。ノードがあれば、そのノードの `consumerAllowSignalWrites` が `false` のときだけ禁止です。`activeConsumer` が何になるかは [第 3 回](03-signals-tracking.md)で読みました。

| どこで set するか | そのときの activeConsumer | consumerAllowSignalWrites | 結果 |
| --- | --- | --- | --- |
| イベントハンドラ（`(click)` など） | `null`（render3/view/listeners.ts L88 で明示的に外す） | — | 許可 |
| ライフサイクルフック（`ngOnInit` など） | `null`（render3/hooks.ts L288） | — | 許可 |
| `setTimeout`、`await` の後、コンストラクタ | `null`（計算の外） | — | 許可 |
| `untracked(() => …)` の中 | `null`（primitives/signals/src/untracked.ts L16） | — | 許可 |
| `computed` の計算関数 | その `computed` のノード | `false`（`REACTIVE_NODE` の既定 graph.ts L73 のまま） | **NG0600** |
| `linkedSignal` の計算関数 | その `linkedSignal` のノード | `false`（既定のまま） | **NG0600** |
| テンプレートの式（補間・バインディング） | テンプレートの consumer | `false`（既定のまま） | **NG0600**（メッセージがテンプレート用になる） |
| `effect` の中 | effect のノード | `true`（primitives/signals/src/effect.ts L40） | 許可 |
| `afterRenderEffect` の各フェーズ | フェーズのノード | `true`（render3/reactivity/after\_render\_effect.ts L87） | 許可 |

> [!NOTE]
> **ポイント**
>
> テンプレートの更新中に子コンポーネントの `input()` へ値を入れる処理も、最後は `signalSetFn` を呼びます （render3/apply\_value\_input\_field.ts L18 → authoring/input/input\_signal\_node.ts の `applyValueToInputSignal`）。その前に render3/instructions/write\_to\_directive\_input.ts L24 で `setActiveConsumer(null)` しているので、テンプレートの consumer は外れており、この検査には掛かりません。

## 5. NG0600 の正体：primitives の空の Error を、起動時に差し替える

📄 `angular/packages/core/primitives/signals/src/errors.ts` L9–23 （▶ の行: 11–12, 15, 18, 21–22）

```ts
 9 │ import type {SignalNode} from './signal';
10 │ 
11 ▶ function defaultThrowError(): never {
12 ▶   throw new Error();
13 │ }
14 │ 
15 ▶ let throwInvalidWriteToSignalErrorFn: <T>(node: SignalNode<T>) => never = defaultThrowError;
16 │ 
17 │ export function throwInvalidWriteToSignalError<T>(node: SignalNode<T>) {
18 ▶   throwInvalidWriteToSignalErrorFn(node);
19 │ }
20 │ 
21 ▶ export function setThrowInvalidWriteToSignalError(fn: <T>(node: SignalNode<T>) => never): void {
22 ▶   throwInvalidWriteToSignalErrorFn = fn;
23 │ }
```

primitives の既定は 11〜13 行目、**メッセージもコードも無い `throw new Error()`** です。15 行目のモジュール変数に入っていて、18 行目でそれを呼び、21〜22 行目の `setThrowInvalidWriteToSignalError` で差し替えられます。primitives は `@angular/core` に依存しないので（[第 1 回](01-signals.md)）、Angular のエラーコードをここに書けません。だから差し替え口があります。

📄 `angular/packages/core/src/application/application_ref.ts` L70–85 （▶ の行: 73–74, 76–77, 79–81, 83）

```ts
70 │ /**
71 │  * Sets the error for an invalid write to a signal to be an Angular `RuntimeError`.
72 │  */
73 ▶ export function publishSignalConfiguration(): void {
74 ▶   setThrowInvalidWriteToSignalError(() => {
75 │     let errorMessage = '';
76 ▶     if (ngDevMode) {
77 ▶       const activeConsumer = getActiveConsumer();
78 │       errorMessage =
79 ▶         activeConsumer && isReactiveLViewConsumer(activeConsumer)
80 ▶           ? 'Writing to signals is not allowed while Angular renders the template (eg. interpolations)'
81 ▶           : 'Writing to signals is not allowed in a `computed`';
82 │     }
83 ▶     throw new RuntimeError(RuntimeErrorCode.SIGNAL_WRITE_FROM_ILLEGAL_CONTEXT, errorMessage);
84 │   });
85 │ }
```

1. **74 行目：差し替える関数を登録する**

   以後、1 節の 88 行目の `throwInvalidWriteToSignalError` は、上の 18 行目を通ってこの関数を呼びます。
2. **76〜82 行目：開発モードのときだけメッセージを作る**

   77 行目で今の `activeConsumer` を取り、79 行目でそれがテンプレートの consumer かを見て、80 行目「テンプレートを描いている最中（補間など）に signal を書くことは許されない」か、81 行目「`computed` の中で signal を書くことは許されない」かを選びます。`linkedSignal` の中で書いた場合も 81 行目の文面になります。
3. **83 行目：`RuntimeError(SIGNAL_WRITE_FROM_ILLEGAL_CONTEXT, …)` を投げる**

📄 `angular/packages/core/src/render3/reactive_lview_consumer.ts` L113–115 （▶ の行: 114）

```ts
113 │ export function isReactiveLViewConsumer(node: ReactiveNode): node is ReactiveLViewConsumer {
114 ▶   return node.kind === 'template';
115 │ }
```

79 行目の判定の中身は 114 行目、**`node.kind === 'template'`** です。`kind` は DevTools 用の名札ですが、ここではエラー文の選択に使われています。

📄 `angular/packages/core/src/errors.ts` L95–98 （▶ の行: 96, 98）

```ts
95 │   // Signal Errors
96 ▶   SIGNAL_WRITE_FROM_ILLEGAL_CONTEXT = 600,
97 │   REQUIRE_SYNC_WITHOUT_SYNC_EMIT = 601,
98 ▶   ASSERTION_NOT_INSIDE_REACTIVE_CONTEXT = -602,
```

📄 `angular/packages/core/src/errors.ts` L201–207 （▶ の行: 205, 207）

```ts
201 │ export function formatRuntimeError<T extends number = RuntimeErrorCode>(
202 │   code: T,
203 │   message: null | false | string,
204 │ ): string {
205 ▶   const fullCode = formatRuntimeErrorCode(code);
206 │ 
207 ▶   let errorMessage = `${fullCode}${message ? ': ' + message : ''}`;
```

96 行目、`SIGNAL_WRITE_FROM_ILLEGAL_CONTEXT` は 600。`RuntimeError` はメッセージを 205〜207 行目で整形し、`NG0600` にメッセージがあれば `': ' + message` を足します。本番ビルドでは 76 行目の `if (ngDevMode)` に入らずメッセージが空なので、**本番のメッセージは `NG0600` だけ**です。

### publishSignalConfiguration を呼ぶ場所

📄 `angular/packages/core/src/platform/platform.ts` L38–50 （▶ の行: 47）

```ts
38 │ export function createPlatform(injector: Injector): PlatformRef {
39 │   if (getPlatform()) {
40 │     throw new RuntimeError(
41 │       RuntimeErrorCode.MULTIPLE_PLATFORMS,
42 │       ngDevMode && 'There can be only one platform. Destroy the previous one to create a new one.',
43 │     );
44 │   }
45 │ 
46 │   publishDefaultGlobalUtils();
47 ▶   publishSignalConfiguration();
48 │   if (typeof ngDevMode !== 'undefined' && ngDevMode) {
49 │     _unregisterAiTools = registerAiTools();
50 │   }
```

📄 `angular/packages/core/src/platform/platform.ts` L187–193 （▶ の行: 191）

```ts
187 │   if (typeof ngServerMode === 'undefined' || !ngServerMode) {
188 │     _platformInjector = injector;
189 │   }
190 │ 
191 ▶   publishSignalConfiguration();
192 │   runPlatformInitializers(injector);
193 │   return injector;
```

呼ぶのはこの 2 か所です。47 行目は `createPlatform`（`platformBrowser()` などで platform を作るとき）、191 行目は `createOrReusePlatformInjector`（`bootstrapApplication` が platform のインジェクタを作るとき。[boot-injectors の章](../boot/08-boot-injectors.md)）です。どちらも**アプリの起動時**に通るので、利用者のコードが signal を書く頃にはもう差し替わっています。裏返すと、Angular を起動せずに primitives だけを使えば、エラーは 12 行目の空の `Error` のままです。

## 6. NG0602 は別物

📄 `angular/packages/core/src/render3/reactivity/asserts.ts` L22–34 （▶ の行: 22, 25, 27）

```ts
22 ▶ export function assertNotInReactiveContext(debugFn: Function, extraContext?: string): void {
23 │   // Taking a `Function` instead of a string name here prevents the un-minified name of the function
24 │   // from being retained in the bundle regardless of minification.
25 ▶   if (getActiveConsumer() !== null) {
26 │     throw new RuntimeError(
27 ▶       RuntimeErrorCode.ASSERTION_NOT_INSIDE_REACTIVE_CONTEXT,
28 │       ngDevMode &&
29 │         `${debugFn.name}() cannot be called from within a reactive context.${
30 │           extraContext ? ` ${extraContext}` : ''
31 │         }`,
32 │     );
33 │   }
34 │ }
```

名前が似た `assertNotInReactiveContext` は、25 行目で `activeConsumer` が**何であれ**存在すれば、27 行目の `ASSERTION_NOT_INSIDE_REACTIVE_CONTEXT`（errors.ts の 98 行目、-602）を投げます。書き込みとは関係なく「この関数はリアクティブな文脈の中で呼んではいけない」という検査で、`effect()`（render3/reactivity/effect.ts L142）や `toSignal()`（rxjs-interop/src/to\_signal.ts L134）の入口で使われています。NG0600 は「書き込みを許さない consumer の中での set」、NG0602 は「consumer の中での呼び出しそのもの」です。

> **🧪 DEMO — set が止まる 2 つの場所**
>
> version は `getter[SIGNAL].version` を学習用に覗いて表示しています。
>
> `user = signal(…, { equal: (a, b) => a.id === b.id })`。同じ id なら名前が違っても値は入らず、version も増えません。
>
> push してから同じ配列を set すると `Object.is` が真なので version は増えず、画面の「長さ」も変わりません （配列の中身は実際には増えているので、次に描き直されたときに一緒に反映されます）。
>
> 開発サーバーでは `` NG0600: Writing to signals is not allowed in a `computed` ``、本番ビルド（このサイトの公開版）では `NG0600` だけが表示されます（5 節の 76 行目と 207 行目）。例外は computed の計算関数の中で投げられ、computed がいったん保存してから、読んだ側（このデモの `try`）に投げ直します（[第 6 回](06-signals-computed.md)）。untracked で包むと activeConsumer が `null` になるので、検査を通ってしまいます（4 節の表）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/signals-set)

## ここまでの呼び出し

- 👤 `count.update((n) => n + 1)` — 利用者のコード
  - `signalUpdateFn(node, fn)` — signal.ts L97
    - `producerUpdatesAllowed()` — graph.ts L367 — *activeConsumer が null か、書き込み可のノードなら true*
    - 👤 `fn(node.value)` — signal.ts L102 — *getter を通らないので依存にならない*
    - `signalSetFn(node, newValue)` — signal.ts L86
      - `producerUpdatesAllowed()` — graph.ts L367 — *もう一度*
      - `node.equal(old, new)` — signal.ts L91 — *既定は Object.is。等しければここで終わり*
      - `signalValueChanged(node)` — signal.ts L120 — *version++ → epoch++ → producerNotifyConsumers → postSignalSetFn（本体では未設定）*

- 👤 `computed(() => { other.set(1); … })` を読む — 利用者のコード
  - `signalSetFn` → `producerUpdatesAllowed()` が false — signal.ts L87
    - `throwInvalidWriteToSignalError(node)` — primitives/signals/src/errors.ts L17
      - `publishSignalConfiguration` が登録した関数 — core/src/application/application\_ref.ts L74 — *new RuntimeError(600, message)*

## 聞かれそうな質問

**Q. 同じ値を set したら、consumer に通知されますか？**

されません。signal.ts 91 行目の `equal`（既定は equality.ts 18 行目の `Object.is`）が真なら、92〜93 行目に進まないので、値も version も epoch も変わらず、`producerNotifyConsumers` も呼ばれません。テンプレートが dirty にされることも、変更検知が予約されることもありません。

**Q. 配列に push してから set(arr) しても画面が更新されないのはなぜですか？**

渡しているのが同じ配列（同じ参照）だからです。`Object.is(arr, arr)` は真なので、91 行目で終わります。新しい配列を作って渡せば（`items.update((a) => [...a, x])`）参照が変わるので通ります。中身で比べたいなら `signal(v, { equal })` で比較関数を渡します（core の signal.ts 73 行目でノードに入る）。

**Q. update と set は何が違いますか？**

`update(fn)` は signal.ts 102 行目で `signalSetFn(node, fn(node.value))` を呼ぶだけなので、比較・通知は `set` と同じです。違いは今の値を **getter を通さずに `node.value` から読む**こと。effect の中で `count.set(count() + 1)` と書くと `count()` の読み取りで count が effect の依存になりますが、`count.update((n) => n + 1)` なら依存になりません（getter を通らないので `producerAccessed` が呼ばれない）。

**Q. 本番で NG0600 のメッセージが「NG0600」だけなのはなぜですか？**

application\_ref.ts 76 行目の `if (ngDevMode)` の中でしかメッセージを作らないからです。本番では `errorMessage` が空文字のまま 83 行目に渡り、errors.ts 207 行目で `NG0600` にメッセージが付きません。どちらの文面になるかは開発サーバーで再現して確かめます。

**Q. effect の中で signal を set してよいのですか？**

書き込み自体は許可されます。effect のノードは `consumerAllowSignalWrites: true`（4 節の表）なので、graph.ts 368 行目が真を返します。effect が**いつ**走るか、書いた結果が同じ周回で反映されるかは [cd-effects](../cd/09-cd-effects.md) と [第 9 回](09-signals-effect-node.md)で読みます。

## 読み終えて

- `set` は「書いてよいか（87 行目）→ 等しいか（91 行目）→ 値を入れて `signalValueChanged`」の 3 段。`update` はその前に `fn(node.value)` を挟むだけ
- 既定の比較は `Object.is`。等しければ値も version も epoch も変わらず、誰にも知らせない
- 値が変わると version++ → epoch++ → 通知 → `postSignalSetFn` の順。`postSignalSetFn` を設定しているのはテストだけ
- 書き込みの許可は `activeConsumer?.consumerAllowSignalWrites !== false` の 1 行。`computed`・`linkedSignal`・テンプレートが `false`
- NG0600 は primitives の空の `Error` を、起動時に `publishSignalConfiguration` が `RuntimeError(600)` に差し替えたもの。文面は `kind === 'template'` で選ばれる

---

← 前: [依存の追跡：activeConsumer、producerAccessed、ReactiveLink、untracked](03-signals-tracking.md)  
次: [push と pull：dirty を伝える producerNotifyConsumers と、version を見比べる consumerPollProducersForChange](05-signals-push-pull.md) →
