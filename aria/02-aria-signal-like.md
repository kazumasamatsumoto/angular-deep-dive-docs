[目次](../README.md) › [Angular Aria の内側](README.md) › 第 2 回 / 全 20 回

# SignalLike：Pattern が core の signal を直接使わない理由

> ui-pattern-rules.md が Pattern の入力を SignalLike / WritableSignalLike に限る決まりと、signal-like.ts が @angular/core/primitives/signals の createSignal・createComputed・createLinkedSignal から signal・computed・linkedSignal を作り直す行。asReadonly が自分自身を返すこと、debugName を空文字にしている行（理由はソースに無い）と、それを消そうとする PR #32904、どこからも呼ばれていない convertGetterSetterToWritableSignalLike。ディレクティブの input() や model() がそのまま Pattern の入力になる仕組み。

angular/components · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/aria-signal-like)

---

Aria の UI Pattern と Behavior は、入力を必ず `SignalLike`（「呼ぶと値を返す関数」）か `WritableSignalLike` で受け取ります。この章では、その決まりを書いた ui-pattern-rules.md と、型と 3 つの工場関数（`signal`・`computed`・`linkedSignal`）を定義する signal-like.ts を 1 行ずつ読みます。ディレクティブの `input()` や `model()` が、変換なしでそのまま Pattern の入力になる理由も分かります。

読む対象は `src/aria/private/ui-pattern-rules.md`、`src/aria/private/behaviors/signal-like/signal-like.ts`（64 行、全部）、例として `src/aria/menu/menu-bar.ts` のコンストラクタです。

1. [1. 全体像](01-aria-overview.md)
2. **2. SignalLike**（この章）
3. [3. SortedCollection](03-aria-collection.md)
4. [4. イベントマネージャ](04-aria-events.md)
5. [5. ListFocus](05-aria-list-focus.md)
6. [6. ListNavigation](06-aria-list-navigation.md)
7. [7. ListSelection](07-aria-list-selection.md)
8. [8. ListTypeahead](08-aria-typeahead.md)
9. [9. Listbox](09-aria-listbox.md)
10. [10. Accordion](10-aria-accordion.md)
11. [11. DeferredContent](11-aria-deferred-content.md)
12. [12. Tabs](12-aria-tabs.md)
13. [13. Toolbar](13-aria-toolbar.md)
14. [14. Tree](14-aria-tree.md)
15. [15. Grid](15-aria-grid.md)
16. [16. Grid のセル](16-aria-grid-cells.md)
17. [17. Combobox](17-aria-combobox.md)
18. [18. Menu](18-aria-menu.md)
19. [19. テスト](19-aria-testing.md)
20. [20. issue と PR を読む](20-aria-issues.md)

## 1. 決まり：入力は SignalLike、signal は signal-like.ts から

📄 `components/src/aria/private/ui-pattern-rules.md` L31–55 （▶ の行: 34–35, 41–43, 55）

````md
31 │ ### Imports
32 │ 
33 │ - Imports should be at the top of the file and kept in alphabetical order.
34 ▶ - All other dependencies must come from inside of the ui-patterns folder.
35 ▶ - Signal primitives, like `signal` and `computed`,  must be imported from `signal-like.ts`
36 │ 
37 │ ### Type Definition
38 │ 
39 │ Each UI Pattern defines a type for it's constructor arguments.
40 │ 
41 ▶ All inputs must be signals. Inputs must not use the `Signal` or `WritableSignal` types from
42 ▶ `@angular/core`. Instead, they must use the `SignalLike` and `WritableSignalLike` types from
43 ▶ `ui-patterns/behaviors/signal-like`.
44 │ 
45 │ ```ts
46 │ export interface ExampleInputs extends Behavior1Inputs, Behavior2Inputs {
47 │   // Additional inputs.
48 │ }
49 │ ```
50 │ 
51 │ ### Class Definition
52 │ 
53 │ #### How to instantiate Behaviors
54 │ 
55 ▶ All Behaviors are defined as class variables and instantiated in the constructor of the UI Pattern.
````

1. **34〜35 行目 import の決まり**

   Pattern の依存は ui-patterns（いまの private）フォルダの中からだけ。`signal` や `computed` も `@angular/core` からではなく `signal-like.ts` から取る、と決めています。
2. **41〜43 行目 入力の型の決まり**

   「入力はすべて signal」。ただし `@angular/core` の `Signal` / `WritableSignal` 型は使わず、`SignalLike` / `WritableSignalLike` を使います。
3. **55 行目 Behavior はコンストラクタで作る**

   Pattern は Behavior をクラスのフィールドとして持ち、コンストラクタで `new` します（[第 1 回](01-aria-overview.md)の表）。

なぜ core の型に縛らないのか。ui-pattern-rules.md にもコメントにも理由の文はありません。手がかりは git log です。SignalLike を入れたのは fedb4d4e8d（2025-03-06、#30597、当時は cdk-experimental/ui-patterns）で、題が「loosen the API to accept different types of signals（いろいろな種類の signal を受け取れるよう API をゆるめる）」、本文が「Introduces the SignalLike and WritableSignalLike types to avoid direct uses of Signal and WritableSignal」です。書かれているのはここまでで、「どんな種類の signal を想定したか」は書かれていません。

コードから確かめられる事実もあります。src/aria/private の .ts（spec を除く）で `@angular/core` を import しているのは signal-like.ts（primitives だけ）・combobox/combobox.ts・deferred-content.ts と utils の 3 つだけでした。`inject()` を呼ぶのは deferred-content.ts だけで、これは `@Directive()` の付いたディレクティブです（[第 11 回](11-aria-deferred-content.md)）。つまり Pattern と Behavior は Angular の DI にもテンプレートにも触れず、関数と signal だけで動きます。ただし private/combobox/combobox.ts の import 文は `import {computed, signal, untracked} from '@angular/core'` で、35 行目の決まりから外れています。この行を最後に触ったコミットは 0ca47b4a06（#33206、simple-combobox を主のエントリポイントへ移した変更）でした。また 34 行目の「ほかの依存はフォルダの中から」についても、Pattern の 10 ファイルが `@angular/cdk/platform` の `_getEventTarget` を import しています（#33691、2026-08-17。[第 1 回](01-aria-overview.md)の 5 節）。決まりの文書は、いまのコードより古いところがあります。

## 2. 型：SignalLike は「引数なしの関数」

📄 `components/src/aria/private/behaviors/signal-like/signal-like.ts` L9–27 （▶ の行: 10–12, 15–17, 19, 21, 23–26）

```ts
 9 │ import {
10 ▶   createComputed,
11 ▶   createLinkedSignal,
12 ▶   createSignal,
13 │   linkedSignalSetFn,
14 │   linkedSignalUpdateFn,
15 ▶   SIGNAL,
16 ▶   untracked as primitiveUntracked,
17 ▶ } from '@angular/core/primitives/signals';
18 │ 
19 ▶ export {primitiveUntracked as untracked};
20 │ 
21 ▶ export type SignalLike<T> = () => T;
22 │ 
23 ▶ export interface WritableSignalLike<T> extends SignalLike<T> {
24 ▶   set(value: T): void;
25 ▶   update(updateFn: (value: T) => T): void;
26 ▶   asReadonly(): SignalLike<T>;
27 │ }
```

1. **9〜17 行目 primitives から取る**

   `@angular/core/primitives/signals` は、Angular の signal の土台（ReactiveNode のグラフ）だけを出す入口です。`createSignal`・`createComputed`・`createLinkedSignal` は「ノードを作って、それにぶら下がった getter 関数を返す」関数です（中身は [signals-reactive-node](../signals/02-signals-reactive-node.md)・[signals-computed](../signals/06-signals-computed.md)・[signals-linked-signal](../signals/08-signals-linked-signal.md)）。`@angular/core` の `signal()` も同じ primitives の上に作られているので、2 つは**同じグラフ**に乗ります（6 節のデモで確かめる）。
2. **19 行目 untracked を名前を変えて出し直す**

   primitives の `untracked`（読んでも依存にしない。[signals-tracking](../signals/03-signals-tracking.md)）を `untracked` として再 export します。ソースに理由の文はありませんが、こうしておけば Pattern は「signal の道具は signal-like.ts から」という 35 行目の決まりを守ったまま `untracked` を使えます。実際に signal-like の `untracked` を import しているのは private/grid/grid.ts で、8 か所で呼んでいます。private/combobox/combobox.ts は `@angular/core` の `untracked` を使っています（1 節の最後）。
3. **21 行目 SignalLike**

   `() => T` だけです。`@angular/core` の `Signal<T>` は `(() => T) & {[SIGNAL]: unknown}`（render3/reactivity/api.ts）なので、core の Signal は SignalLike を**満たします**。逆に、ただのアロー関数 `() => 'horizontal'` も SignalLike です。
4. **23〜27 行目 WritableSignalLike**

   `set`・`update`・`asReadonly` の 3 つ。core の `WritableSignal` はこの 3 つを同じ形で持ち（render3/reactivity/signal.ts の interface）、`model()` の `ModelSignal` は `WritableSignal` を extends しています（authoring/model/model\_signal.ts）。だから `model()` も WritableSignalLike として渡せます（[signals-model-output](../signals/13-signals-model-output.md)）。

## 3. 3 つの工場関数と debugName

📄 `components/src/aria/private/behaviors/signal-like/signal-like.ts` L42–64 （▶ の行: 43–44, 49–50, 52, 56–57, 60–62）

```ts
42 │ export function computed<T>(computation: () => T): SignalLike<T> {
43 ▶   const computed = createComputed(computation);
44 ▶   computed[SIGNAL].debugName = '';
45 │   return computed;
46 │ }
47 │ 
48 │ export function signal<T>(initialValue: T): WritableSignalLike<T> {
49 ▶   const [get, set, update] = createSignal(initialValue);
50 ▶   get[SIGNAL].debugName = '';
51 │   // tslint:disable-next-line:ban Have to use `Object.assign` to preserve the getter function.
52 ▶   return Object.assign(get, {set, update, asReadonly: () => get});
53 │ }
54 │ 
55 │ export function linkedSignal<T>(sourceFn: () => T): WritableSignalLike<T> {
56 ▶   const getter = createLinkedSignal(sourceFn, s => s);
57 ▶   getter[SIGNAL].debugName = '';
58 │   // tslint:disable-next-line:ban Have to use `Object.assign` to preserve the getter function.
59 │   return Object.assign(getter, {
60 ▶     set: (v: T) => linkedSignalSetFn(getter[SIGNAL], v),
61 ▶     update: (updater: (v: T) => T) => linkedSignalUpdateFn(getter[SIGNAL], updater),
62 ▶     asReadonly: () => getter,
63 │   });
64 │ }
```

1. **42〜46 行目 computed**

   43 行目で primitives の `createComputed` を呼び、返ってきた getter をそのまま返します。44 行目で、getter にぶら下がったノード（`computed[SIGNAL]`）の `debugName` に空文字を入れています。
2. **48〜53 行目 signal**

   49 行目の `createSignal` は `[getter, setter, updater]` の 3 つを返します。52 行目の `Object.assign(get, {set, update, asReadonly: () => get})` で、**getter 関数そのものに**`set` と `update` を生やします（51 行目のコメント「getter 関数を保つために Object.assign を使う」）。`asReadonly` は `get` 自身を返すので、返ってきたものにも `set` が付いたままです。core の `asReadonly()` は別の読み取り専用の関数を返すので、ここは違います（デモで確かめる）。型の上では `SignalLike` なので、TypeScript からは `set` を呼べません。
3. **55〜64 行目 linkedSignal**

   56 行目の `createLinkedSignal(sourceFn, s => s)` は「source の値をそのまま使い、書き込まれたらその値を使う」signal です。primitives の linkedSignal は getter しか返さないので、60〜61 行目で `linkedSignalSetFn` / `linkedSignalUpdateFn` にノード（`getter[SIGNAL]`）を渡す関数を自分で作ります。

`debugName = ''`（44・50・57 行目）を入れた理由は、入れたコミット e1f9a7d7a0（#32549、2025-12-16「cleanup remaining signal primitive usages」）の本文にも PR の説明にも書かれていません。primitives の側では、`debugName` は ReactiveNode の省略できるプロパティ（graph.ts の `debugName?: string`）で、開発モードの `toString()` は `node.debugName ? ' (' + node.debugName + ')' : ''` と書かれているので、空文字は「名前なし」と同じ表示になります。

これを消そうとしている PR が開いています。#32904「perf(aria): drop `debugName` from signals」（JoostK、2026-03-08、OPEN）で、説明は「debugName を毎回ノードに代入するので、signal-like 1 つごとにプロパティが 1 つ増え、JS の VM が扱う隠れクラスも増える。空文字なので丸ごと消した」というものです。差分は 44・50・57 行目の 3 行を消すだけ（この PR の差分は古い版に対するもので、computed の `toString` の行も消しています。その行は 62e0d4f10b で既に消えています）。

## 4. convertGetterSetterToWritableSignalLike

📄 `components/src/aria/private/behaviors/signal-like/signal-like.ts` L29–40 （▶ の行: 30–32, 35–38）

```ts
29 │ /** Converts a getter setter style signal to a WritableSignalLike. */
30 ▶ export function convertGetterSetterToWritableSignalLike<T>(
31 ▶   getter: () => T,
32 ▶   setter: (v: T) => void,
33 │ ): WritableSignalLike<T> {
34 │   // tslint:disable-next-line:ban Have to use `Object.assign` to preserve the getter function.
35 ▶   return Object.assign(getter, {
36 ▶     set: setter,
37 ▶     update: (updateCallback: (v: T) => T) => setter(updateCallback(getter())),
38 ▶     asReadonly: () => getter,
39 │   });
40 │ }
```

getter と setter の 2 つの関数から WritableSignalLike を組み立てます。35 行目で getter に `set`（setter そのもの）、37 行目で `update`（getter で読んで setter で書く）、38 行目で `asReadonly`（getter）を足します。この関数は src の中のどこからも呼ばれていません（grep で signal-like.ts の定義と goldens/aria/private/index.api.md だけ）。`@angular/aria/private` から export されているので、外から使う入口としてだけ残っています。

## 5. ディレクティブ側：input・model・アロー関数をそのまま渡す

📄 `components/src/aria/menu/menu-bar.ts` L105–122 （▶ の行: 106, 113–118, 120–121）

```ts
105 │   /** The menu items as a writable signal. */
106 ▶   private readonly _itemPatterns = computed(() => this._items().map(i => i._pattern));
107 │ 
108 │   /** A callback function triggered when a menu item is selected. */
109 │   readonly itemSelected = output<V | undefined>();
110 │ 
111 │   constructor() {
112 │     this._pattern = new MenuBarPattern({
113 ▶       ...this,
114 ▶       items: this._itemPatterns,
115 ▶       multi: () => false,
116 ▶       focusMode: () => 'roving',
117 ▶       orientation: () => 'horizontal',
118 ▶       selectionMode: () => 'explicit',
119 │       itemSelected: (value: V | undefined) => this.itemSelected.emit(value),
120 ▶       activeItem: signal(undefined),
121 ▶       element: computed(() => this._elementRef.nativeElement),
122 │     });
```

MenuBar のコンストラクタは、SignalLike になれるものを全種類渡しています。

1. **113 行目 `...this`**

   `disabled`・`softDisabled`・`wrap`・`typeaheadDelay` は `input()` の `InputSignal`、`value` は `model()` の `ModelSignal`、`textDirection` は CDK の `Directionality.valueSignal`（core の Signal）です。どれも変換せずに入ります。
2. **114 行目 core の computed**

   `items` は 106 行目の `computed(...)`。このファイルの `computed` は `@angular/core` のものです。ディレクティブは Pattern ではないので、35 行目の決まりの外です。
3. **115〜118 行目 ただのアロー関数**

   menubar は横向き・roving・明示的な選択に決まっているので、`() => 'horizontal'` のような定数の関数を渡します。signal ではないので、Pattern の computed がこれを読んでも依存は増えません。
4. **120〜121 行目 core の signal と computed**

   `activeItem` は書き込みもされるので `signal(undefined)`（core の WritableSignal）。`element` は core の computed です。

> [!NOTE]
> **ポイント**
>
> 119 行目の `V | undefined` は 22.1.8 では `V` です（[第 1 回](01-aria-overview.md)の表、#33715）。SignalLike の話には関係しません。Listbox の同じ所（`{...this, id, items, ...}`）は[第 1 回](01-aria-overview.md)の 3 節で読みました。

## 6. デモ：DOM なしの ListboxPattern を signal だけで動かす

> **🧪 DEMO — @angular/aria/private の ListboxPattern（private。安定 API ではない）**
>
> DOM の要素を 1 つも使わずに `ListboxPattern` と 3 つの `OptionPattern` を作ります。入力は signal-like の `signal()` / `computed()` とアロー関数、`value` だけは `@angular/core` の `signal([])` です。`element` は `() => undefined`。キーのボタンは `new KeyboardEvent('keydown', {key})` を作って `pattern.onKeydown()` に渡します（[第 4 回](04-aria-events.md)）。下の「value（core の signal）」と「activeItem（signal-like の computed）」は、テンプレートが直接読んでいます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/aria-signal-like)

見るところは 4 つです（2026-11-02 にヘッドレスの Chrome で確かめました）。

- **作る**：`setDefaultState()` で先頭の `alpha` がアクティブになり、`selectionMode` が `'follow'` なので `value` も `["alpha"]` になります。core の signal に、Pattern が `set` で書き込んだということです。
- **ArrowDown**：アクティブが `bravo` に移り、`option.tabIndex` が `-1 0 -1` になります。テンプレートの表示も変わります。signal-like の computed をテンプレートが読んでも、Angular の signal と同じように画面が更新されるということです（2 節の 1 つ目）。
- **orientation を切り替える → ArrowRight**：縦のときは「動かない」、横にすると「動いた」になります。`keydown` の表の `nextKey` が orientation の signal を読む computed だからです（[第 4 回](04-aria-events.md)）。
- **signal() の中身**：「作る」を押すと、`asReadonly() === 自分=true`、`asReadonly() に set がある=true`、`debugName=""` と出ます。3 節の 52 行目と 50 行目のとおりです。

## 7. 呼び出しの連なり

- 👤 `<div ngMenuBar [(value)]="v">` — あなたのテンプレート
  - `input() / model()` — @angular/core — *InputSignal / ModelSignal（core の Signal）*
  - `new MenuBarPattern({...this, focusMode: () => 'roving', ...})` — menu-bar.ts L112-122
    - `signal() / computed() / linkedSignal()` — signal-like.ts L42-64 — *Pattern の中の状態*
      - `createSignal / createComputed / createLinkedSignal` — @angular/core/primitives/signals — *core の signal と同じグラフ*
      - `node.debugName = ''` — signal-like.ts L44 / L50 / L57 — *#32904 が消そうとしている*

## テストと直し方

📄 `components/src/aria/private/behaviors/signal-like/BUILD.bazel` L1–11 （▶ の行: 5–9）

```python
 1 │ load("//tools:defaults.bzl", "ts_project")
 2 │ 
 3 │ package(default_visibility = ["//visibility:public"])
 4 │ 
 5 ▶ ts_project(
 6 ▶     name = "signal-like",
 7 ▶     srcs = ["signal-like.ts"],
 8 ▶     deps = [
 9 ▶         "//:node_modules/@angular/core",
10 │     ],
11 │ )
```

signal-like の BUILD.bazel には `ts_project` が 1 つあるだけで、spec も `ng_web_test_suite` もありません。確かめているのは、signal-like の `signal()` で入力を作る Pattern と Behavior の spec です。`signal-like/signal-like'` を import する spec は 22 ファイルありました（private/behaviors の 14 と private/&lt;部品&gt; の 8 つ）。たとえば private/behaviors/list/list.spec.ts は :9 で `import {signal, WritableSignalLike} from '../signal-like/signal-like'` とし、入力をその `signal()` で作ります（spec の具体は[第 5〜8 回](05-aria-list-focus.md)）。

📄 `ターミナル`

```
cd ~/angular-research/components
pnpm bazel test //src/aria/private/behaviors/list:unit_tests_chromium --nocache_test_results --test_output=all

# signal-like の signal() を import している spec の数
grep -rl "signal-like/signal-like'" --include='*.spec.ts' src/aria | wc -l
# signal-like を名指しで確かめる spec はあるか
ls src/aria/private/behaviors/signal-like/
```

📄 `出力（抜粋。2026-11-02 に実行）`

```
src/aria/private/behaviors/list/unit_tests_bundle.spec.js:
      Jasmine randomize seed: 42948
Chromium: |██████████████████████████████| 1/1 test files | 42 passed, 0 failed
Finished running tests in 1.3s, all tests passed!
//src/aria/private/behaviors/list:unit_tests_chromium                    PASSED in 1.9s

      22
BUILD.bazel	signal-like.ts
```

1. **直すとしたら**

   signal-like.ts の 3 つの工場関数（42・48・55 行目）です。ただ、ここを変えると全部の Pattern と Behavior が影響を受けるので、確かめるには 1 つの spec では足りず、private 以下のターゲットをいくつも走らせることになります。signal-like だけを確かめる spec を足すなら、private/behaviors/signal-like/ に spec と `ng_web_test_suite` を新しく作るところからです（第 1 回の listbox の BUILD と同じ形）。
2. **issue を読むときの手がかり**

   #32904 は 2026-03-08 から開いたままです。差分が小さいので、読むときは「debugName を消すと、DevTools の signal のグラフ（[signals-debug](../signals/18-signals-debug.md)）での見え方が変わるか」を primitives の側で確かめるのが手がかりになります。この PR には既に作者がいるので、私たちは手元で確かめるだけにします。

## 聞かれそうな質問

**Q. Pattern を Angular 以外で使えますか？**

6 節のデモのとおり、Pattern は DOM もディレクティブも無しに、signal を渡して `new` するだけで動きます。DI も使いません。ただし signal-like.ts の 17 行目が `@angular/core/primitives/signals` を import しているので、`@angular/core` のパッケージは要ります。また `@angular/aria/private` は安定 API ではありません。

**Q. untracked をなぜ再 export しているのですか？**

理由の文はソースにありません。分かるのは、19 行目で primitives の `untracked` を出し直しているので、Pattern は 35 行目の決まり（signal の道具は signal-like.ts から）を守ったまま、依存にしたくない読み取りができる、ということです。実際に使っているのは private/grid/grid.ts（8 か所）です。

**Q. Pattern の中で effect は使っていないのですか？**

使っていません。src/aria/private の .ts（spec を除く）で `effect(` も `afterRenderEffect(` も呼んでいるのは、ディレクティブである deferred-content.ts の `afterRenderEffect` だけでした。signal-like.ts にも `effect` の工場関数はありません。Pattern には `setDefaultStateEffect()` のような「Effect」で終わる**ふつうのメソッド**があり、それをディレクティブが core の `afterRenderEffect` の中で呼びます（[第 1 回](01-aria-overview.md)の trace、[signals-after-render-effect](../signals/10-signals-after-render-effect.md)）。いつ走るかを決めるのはディレクティブ側です。

**Q. core の signal と signal-like の signal を混ぜて大丈夫ですか？**

同じ primitives のノードなので、同じ依存グラフに乗ります。デモでは core の `signal([])` を `value` に渡し、Pattern が書き込んだ値がテンプレートに出ました。逆に signal-like の computed をテンプレートが読んでも、変わると画面が更新されました。違いは 3 節の `asReadonly()` の返り値と `debugName` くらいです。

## 読み終えて

- SignalLike は `() => T`（L21）。core の Signal も、input() も、ただのアロー関数も満たす。
- WritableSignalLike は set / update / asReadonly（L23-27）。core の WritableSignal と model() がそのまま入る。
- signal-like の `signal()` は primitives の getter に set と update を生やしたもの（L48-53）。asReadonly は自分自身を返す。
- `debugName = ''`（L44・L50・L57）の理由はソースに無い。#32904 が消そうとしている。
- 理由として書かれているのは #30597 の「いろいろな種類の signal を受け取れるようにする」だけ。Pattern は DI にも DOM にも依存しない。

---

← 前: [Angular Aria の全体像：ディレクティブ・UI Pattern・Behavior の 3 層](01-aria-overview.md)  
次: [SortedCollection：項目を DOM の順に並べる](03-aria-collection.md) →
