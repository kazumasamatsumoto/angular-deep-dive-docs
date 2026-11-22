[目次](../README.md) › [core の説明文の読み残し（3）](README.md) › 第 7 回 / 全 8 回

# 開発用の小道具の説明文：assert・ngDevMode・画像の警告・profiler

> util/\*（ng\_dev\_mode.ts・is\_dev\_mode.ts・assert.ts・stringify.ts・decorators.ts・array\_utils.ts ほか）、image\_performance\_warning.ts、profiler.ts、util/security/trusted\_types\_bypass.ts の未読の行：本番で消える仕組み（本番と開発の JS を数える）、画像の lazy の LCP と大きすぎの警告の条件、SSR の 🅰️ の印と setProfiler の印。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crh-dev-utils)

---

この章で分かること：`ngDevMode` がどこで決まり、本番ビルドで開発用の検査と文がどう消えるか、画像の 2 つの警告（LCP の画像が `loading="lazy"`、ファイルが描く大きさより大きすぎる）が出る条件、性能の印（`performance.mark` の 🅰️ と `ng.ɵsetProfiler` の印）がいつ打たれるかを、説明文の行と、本番と開発のビルド・headless Chrome・Node の記録で確かめます。合わなかったのは、assert の失敗の文で左右が入れ替わること、`truncateMiddle` が `maxLength` より長い文字列を返すこと、SSR の 🅰️ の印が途中の `return` で閉じられずに残ること、画像の警告のコメント 2 つです。

読む対象は `packages/core/src/` の `util/`（`ng_dev_mode.ts`・`is_dev_mode.ts`・`ng_server_mode.ts`・`ng_hmr_mode.ts`・`global.ts`・`closure.ts`・`assert.ts`・`stringify.ts`・`decorators.ts`・`array_utils.ts`・`performance.ts`・`security/trusted_types_bypass.ts`）、`image_performance_warning.ts`、`profiler.ts`、`event_delegation_utils.ts`（../angular、8576f161ae4）のまだ引かれていない行です。CLI が `ngDevMode` を `false` に置き換える所は[ブラウザーが読み込むまでの章](../boot/06-boot-browser-load.md)、`IMAGE_CONFIG` と画像の警告の入口は[画像の loader の章](../cmn/15-cmn-image-loaders.md)、`setProfiler` と DevTools の受け取り方は[DevTools のプロファイラーの章](../devtools/13-devtools-profiler-capture.md)、Trusted Types の policy は[Trusted Types の章](../domr/18-domr-trusted-types.md)にあります。

1. [1. ハイドレーションの公開 API と型](01-crh-hydration-api.md)
2. [2. ngh の書き出し](02-crh-hydration-annotate.md)
3. [3. ノードの探し方と不一致](03-crh-hydration-errors.md)
4. [4. @defer](04-crh-defer.md)
5. [5. resource()](05-crh-resource.md)
6. [6. Renderer2](06-crh-renderer.md)
7. **7. 開発用の小道具**（この章）
8. [8. spec と issue](08-crh-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> 「開発モード」は、Angular が検査と詳しいエラー文と警告を付けて動く状態です。コードの中では `if (ngDevMode) { … }` や `ngDevMode && assertX(…)` の形で書かれ、本番ビルドでは CLI（esbuild）が `ngDevMode` という名前を `false` に置き換えるので、その枝は「決して通らないコード」として消されます。このページは本番ビルドなので、開発モードだけで出る物は、開発ビルドを headless Chrome で開いた記録と、Node の記録で見せます。

## 1. ngDevMode の宣言：値は 3 通り

📄 `angular/packages/core/src/util/ng_dev_mode.ts` L11–36 （▶ の行: 16–17, 20–24, 26, 29, 34）

```ts
11 │ declare global {
12 │   /**
13 │    * Values of ngDevMode
14 │    * Depending on the current state of the application, ngDevMode may have one of several values.
15 │    *
16 ▶    * For convenience, the “truthy” value which enables dev mode is also an object which contains
17 ▶    * Angular’s performance counters. This is not necessary, but cuts down on boilerplate for the
18 │    * perf counters.
19 │    *
20 ▶    * ngDevMode may also be set to false. This can happen in one of a few ways:
21 ▶    * - The user explicitly sets `window.ngDevMode = false` somewhere in their app.
22 ▶    * - The user calls `enableProdMode()`.
23 ▶    * - The URL contains a `ngDevMode=false` text.
24 ▶    * Finally, ngDevMode may not have been defined at all.
25 │    */
26 ▶   const ngDevMode: null | NgDevModePerfCounters;
27 │ 
28 │   interface NgDevModePerfCounters {
29 ▶     hydratedNodes: number;
30 │     hydratedComponents: number;
31 │     dehydratedViewsRemoved: number;
32 │     dehydratedViewsCleanupRuns: number;
33 │     componentsSkippedHydration: number;
34 ▶     deferBlocksWithIncrementalHydration: number;
35 │   }
36 │ }
```

16〜17 行目「開発モードを有効にする truthy な値は、Angular の性能のカウンターを持つオブジェクト」、20〜24 行目「`false` になるのは、自分で `window.ngDevMode = false` と書く、`enableProdMode()` を呼ぶ、URL に `ngDevMode=false` が入っている、のどれか。定義されていないこともある」です。26 行目の型は `null | NgDevModePerfCounters` で、20 行目の `false` が型に入っていません（実装は 52 行目で `false` を入れます）。28〜35 行目のカウンターは 6 つともハイドレーションの数で、開発ビルドの console の「Angular hydrated 3 component(s) and 1143 node(s) …」はこれを読んで出しています（DEMO の 3）。

URL の約束は、このサイトの開発ビルドを headless Chrome で開いて確かめました（DEMO の 3）。`/` では `typeof ngDevMode` が `object`、`window.ng`（開発モードだけで置かれる道具）もあり、console に「Angular is running in development mode.」が出ます。`/?ngDevMode=false` では `ngDevMode === false`、`window.ng` は `undefined`、console は 0 行でした。開発ビルドのまま、検査と警告がすべて止まります。

## 2. initNgDevMode：最初に読まれたときに決める

📄 `angular/packages/core/src/util/ng_dev_mode.ts` L38–60 （▶ の行: 39, 49–50, 52, 54–55, 57）

```ts
38 │ function ngDevModeResetPerfCounters(): NgDevModePerfCounters {
39 ▶   const locationString = typeof location !== 'undefined' ? location.toString() : '';
40 │   const newCounters: NgDevModePerfCounters = {
41 │     hydratedNodes: 0,
42 │     hydratedComponents: 0,
43 │     dehydratedViewsRemoved: 0,
44 │     dehydratedViewsCleanupRuns: 0,
45 │     componentsSkippedHydration: 0,
46 │     deferBlocksWithIncrementalHydration: 0,
47 │   };
48 │ 
49 ▶   // Make sure to refer to ngDevMode as ['ngDevMode'] for closure.
50 ▶   const allowNgDevModeTrue = locationString.indexOf('ngDevMode=false') === -1;
51 │   if (!allowNgDevModeTrue) {
52 ▶     global['ngDevMode'] = false;
53 │   } else {
54 ▶     if (typeof global['ngDevMode'] !== 'object') {
55 ▶       global['ngDevMode'] = {};
56 │     }
57 ▶     Object.assign(global['ngDevMode'], newCounters);
58 │   }
59 │   return newCounters;
60 │ }
```

📄 `angular/packages/core/src/util/ng_dev_mode.ts` L62–92 （▶ の行: 63–64, 70–72, 74–76, 85–87, 89）

```ts
62 │ /**
63 ▶  * This function checks to see if the `ngDevMode` has been set. If yes,
64 ▶  * then we honor it, otherwise we default to dev mode with additional checks.
65 │  *
66 │  * The idea is that unless we are doing production build where we explicitly
67 │  * set `ngDevMode == false` we should be helping the developer by providing
68 │  * as much early warning and errors as possible.
69 │  *
70 ▶  * `ɵɵdefineComponent` is guaranteed to have been called before any component template functions
71 ▶  * (and thus Ivy instructions), so a single initialization there is sufficient to ensure ngDevMode
72 ▶  * is defined for the entire instruction set.
73 │  *
74 ▶  * When checking `ngDevMode` on toplevel, always init it before referencing it
75 ▶  * (e.g. `((typeof ngDevMode === 'undefined' || ngDevMode) && initNgDevMode())`), otherwise you can
76 ▶  *  get a `ReferenceError` like in https://github.com/angular/angular/issues/31595.
77 │  *
78 │  * Details on possible values for `ngDevMode` can be found on its docstring.
79 │  */
80 │ export function initNgDevMode(): boolean {
81 │   // The below checks are to ensure that calling `initNgDevMode` multiple times does not
82 │   // reset the counters.
83 │   // If the `ngDevMode` is not an object, then it means we have not created the perf counters
84 │   // yet.
85 ▶   if (typeof ngDevMode === 'undefined' || ngDevMode) {
86 ▶     if (typeof ngDevMode !== 'object' || Object.keys(ngDevMode).length === 0) {
87 ▶       ngDevModeResetPerfCounters();
88 │     }
89 ▶     return typeof ngDevMode !== 'undefined' && !!ngDevMode;
90 │   }
91 │   return false;
92 │ }
```

50 行目が URL の `ngDevMode=false` を探す所で、見つかれば 52 行目で `false`、無ければ 55〜57 行目でカウンターのオブジェクトにします。これを呼ぶのが 80 行目の `initNgDevMode` で、70〜72 行目のとおり `ɵɵdefineComponent` の中で（どのテンプレートの命令よりも先に）1 回呼ばれます。74〜76 行目は、ファイルの一番外側で `ngDevMode` を読むなら、先に `(typeof ngDevMode === 'undefined' || ngDevMode) && initNgDevMode()` の形で決めておかないと `ReferenceError` になる（#31595）、という注意です。本番ビルドでは `ngDevMode` が `false` に置き換わるので、85 行目の条件が偽になり、この関数は何もせずに `false` を返します。

## 3. isDevMode・enableProdMode と、ほかの 3 つの印

📄 `angular/packages/core/src/util/is_dev_mode.ts` L11–44 （▶ の行: 14–15, 21, 25, 32–33, 39–42）

```ts
11 │ /**
12 │  * Returns whether Angular is in development mode.
13 │  *
14 ▶  * By default, this is true, unless `enableProdMode` is invoked prior to calling this method or the
15 ▶  * application is built using the Angular CLI with the `optimization` option.
16 │  * @see {@link /cli/build ng build}
17 │  *
18 │  * @publicApi
19 │  */
20 │ export function isDevMode(): boolean {
21 ▶   return typeof ngDevMode === 'undefined' || !!ngDevMode;
22 │ }
23 │ 
24 │ /**
25 ▶  * Disable Angular's development mode, which turns off assertions and other
26 │  * checks within the framework.
27 │  *
28 │  * One important assertion this disables verifies that a change detection pass
29 │  * does not result in additional changes to any bindings (also known as
30 │  * unidirectional data flow).
31 │  *
32 ▶  * Using this method is discouraged as the Angular CLI will set production mode when using the
33 ▶  * `optimization` option.
34 │  * @see {@link /cli/build ng build}
35 │  *
36 │  * @publicApi
37 │  */
38 │ export function enableProdMode(): void {
39 ▶   // The below check is there so when ngDevMode is set via terser
40 ▶   // `global['ngDevMode'] = false;` is also dropped.
41 ▶   if (typeof ngDevMode === 'undefined' || ngDevMode) {
42 ▶     global['ngDevMode'] = false;
43 │   }
44 │ }
```

14〜15 行目「`enableProdMode` を先に呼ぶか、CLI の `optimization` でビルドしない限り `true`」は、このページ（本番ビルド）で `isDevMode()` が `false` でした（DEMO の 1）。このとき `globalThis['ngDevMode']` は `undefined` のままです。本番ビルドの `ngDevMode` は実行時の変数ではなく、ビルドのときに書き込まれた `false` だからです（angular-cli の application-code-bundle.ts L664、[ブラウザーが読み込むまでの章](../boot/06-boot-browser-load.md)）。21 行目は `typeof false === 'undefined' || !!false` になり、`false` です。39〜40 行目のコメント「terser で `ngDevMode` を入れたときに、42 行目の代入も消えるように」の terser は、今の CLI では esbuild の `define` です。仕組みは同じで、41 行目の条件が `false` になって 42 行目ごと消えます。

📄 `angular/packages/core/src/util/ng_server_mode.ts` L9–21 （▶ の行: 13–14, 17）

```ts
 9 │ declare global {
10 │   /**
11 │    * Indicates whether the application is operating in server-rendering mode.
12 │    *
13 ▶    * `ngServerMode` is a global flag set by Angular's server-side rendering mechanisms,
14 ▶    * typically configured by `provideServerRendering` and `platformServer` during runtime.
15 │    *
16 │    * @remarks
17 ▶    * - **Internal Angular Flag**: This is an *internal* Angular flag (not a public API), avoid relying on it in application code.
18 │    * - **Avoid Direct Use**: This variable is intended for runtime configuration; it should not be accessed directly in application code.
19 │    */
20 │   var ngServerMode: boolean | undefined;
21 │ }
```

📄 `angular/packages/core/src/util/ng_hmr_mode.ts` L9–20 （▶ の行: 13）

```ts
 9 │ declare global {
10 │   /**
11 │    * Indicates whether HMR is enabled for the application.
12 │    *
13 ▶    * `ngHmrMode` is a global flag set by Angular's CLI.
14 │    *
15 │    * @remarks
16 │    * - **Internal Angular Flag**: This is an *internal* Angular flag (not a public API), avoid relying on it in application code.
17 │    * - **Avoid Direct Use**: This variable is intended for runtime configuration; it should not be accessed directly in application code.
18 │    */
19 │   var ngHmrMode: boolean | undefined;
20 │ }
```

`ngServerMode` の 13〜14 行目「`provideServerRendering` と `platformServer` が実行時に立てる」は、platform-server の provide\_server.ts L36 と server.ts L133 の `globalThis['ngServerMode'] = true` のとおりです。加えて CLI もサーバー用の bundle の頭に同じ 1 行を書き（application-code-bundle.ts L203・L410）、ブラウザー用の bundle では `define` で `'false'` にします（L666）。`ngHmrMode` の 13 行目「CLI が立てる」は L667 の `define` です。

📄 `angular/packages/core/src/util/global.ts` L9–16 （▶ の行: 9, 12–14）

```ts
 9 ▶ const _global: any = globalThis;
10 │ 
11 │ /**
12 ▶  * Attention: whenever providing a new value, be sure to add an
13 ▶  * entry into the corresponding `....externs.js` file,
14 ▶  * so that closure won't use that global for its purposes.
15 │  */
16 │ export {_global as global};
```

📄 `angular/packages/core/src/util/closure.ts` L9–20 （▶ の行: 10, 12–13, 19）

```ts
 9 │ /**
10 ▶  * Convince closure compiler that the wrapped function has no side-effects.
11 │  *
12 ▶  * Closure compiler always assumes that `toString` has no side-effects. We use this quirk to
13 ▶  * allow us to execute a function but have closure compiler mark the call as no-side-effects.
14 │  * It is important that the return value for the `noSideEffects` function be assigned
15 │  * to something which is retained otherwise the call to `noSideEffects` will be removed by closure
16 │  * compiler.
17 │  */
18 │ export function noSideEffects<T>(fn: () => T): T {
19 ▶   return {toString: fn}.toString() as unknown as T;
20 │ }
```

`global` は `globalThis` そのもので、12〜14 行目の「新しい値を足すなら `….externs.js` にも書く」は Closure Compiler（Google の中のビルド）向けの注意です。リポジトリには packages/core/src/core.externs.js ほか 3 つの externs があります。`noSideEffects`（19 行目）は、Closure が「`toString` は副作用が無い」と見なす癖を使って、関数の呼び出しを副作用なしに見せます。`makeDecorator` ほか decorators.ts の 3 つの関数と、render3 の `scope.ts`・`metadata.ts` がこれで包んでいます。

## 4. assert と、本番で消える文

📄 `angular/packages/core/src/util/assert.ts` L9–21 （▶ の行: 9–11, 17, 19）

```ts
 9 ▶ // The functions in this file verify that the assumptions we are making
10 ▶ // about state in an instruction are correct before implementing any logic.
11 ▶ // They are meant only to be called in dev mode as sanity checks.
12 │ 
13 │ import {getActiveConsumer} from '../../primitives/signals';
14 │ 
15 │ import {stringify} from './stringify';
16 │ 
17 ▶ export function assertNumber(actual: any, msg: string): asserts actual is number {
18 │   if (!(typeof actual === 'number')) {
19 ▶     throwError(msg, typeof actual, 'number', '===');
20 │   }
21 │ }
```

📄 `angular/packages/core/src/util/assert.ts` L103–116 （▶ の行: 105, 111, 113–114）

```ts
103 │ export function assertDefined<T>(actual: T | null | undefined, msg: string): asserts actual is T {
104 │   if (actual == null) {
105 ▶     throwError(msg, actual, null, '!=');
106 │   }
107 │ }
108 │ 
109 │ export function throwError(msg: string): never;
110 │ export function throwError(msg: string, actual: any, expected: any, comparison: string): never;
111 ▶ export function throwError(msg: string, actual?: any, expected?: any, comparison?: string): never {
112 │   throw new Error(
113 ▶     `ASSERTION ERROR: ${msg}` +
114 ▶       (comparison == null ? '' : ` [Expected=> ${expected} ${comparison} ${actual} <=Actual]`),
115 │   );
116 │ }
```

9〜11 行目「命令の前提が正しいかを確かめる関数。開発モードでだけ呼ぶ」のとおり、呼ぶ側は `ngDevMode && assertGreaterThan(…)` の形です（例えば render3/instructions/advance.ts L44）。Node の記録で `ɵɵadvance(-1)` を呼ぶと、開発モードでは `ASSERTION ERROR: Can only advance forward [Expected=> 0 > -1 <=Actual]` を投げ、本番（`ngDevMode = false`）では検査を飛ばして先へ進み、`TypeError: Cannot read properties of null (reading '2')` になりました（DEMO の 6）。

この文は左右が入れ替わっています。`assertGreaterThan(actual, expected, msg)` は「`actual > expected` でなければ」投げ、114 行目は `${expected} ${comparison} ${actual}` の順で書くので、満たされなかった `-1 > 0` ではなく、成り立っている `0 > -1` と読めてしまいます。`==` や `!=` では左右が入れ替わっても同じ意味ですが、`<`・`<=`・`>`・`>=` では逆の意味になります。114 行目は d56cf6a92d9（2019-12-17、`refactor: improve assert error by including the failed condition (#34799)`）からこの形です。

📄 `angular/packages/core/src/util/array_utils.ts` L120–153 （▶ の行: 121, 133）

```ts
120 │ /**
121 ▶  * Same as `Array.splice2(index, 0, value1, value2)` but faster.
122 │  *
123 │  * `Array.splice()` is not fast because it has to allocate an array for the elements which were
124 │  * removed. This causes memory pressure and slows down code when most of the time we don't
125 │  * care about the deleted items array.
126 │  *
127 │  * @param array Array to splice.
128 │  * @param index Index in array where the `value` should be added.
129 │  * @param value1 Value to add to array.
130 │  * @param value2 Value to add to array.
131 │  */
132 │ export function arrayInsert2(array: any[], index: number, value1: any, value2: any): void {
133 ▶   ngDevMode && assertLessThanOrEqual(index, array.length, "Can't insert past array end.");
134 │   let end = array.length;
135 │   if (end == index) {
136 │     // inserting at the end.
137 │     array.push(value1, value2);
138 │   } else if (end === 1) {
139 │     // corner case when we have less items in array than we have items to insert.
140 │     array.push(value2, array[0]);
141 │     array[0] = value1;
142 │   } else {
143 │     end--;
144 │     array.push(array[end - 1], array[end]);
145 │     while (end > index) {
146 │       const previousEnd = end - 2;
147 │       array[end] = array[previousEnd];
148 │       end--;
149 │     }
150 │     array[index] = value1;
151 │     array[index + 1] = value2;
152 │   }
153 │ }
```

array\_utils.ts の `arrayInsert2` も 133 行目で同じ形の検査をします（`KeyValueArray` と defer の timer の配列に 2 つずつ入れる関数）。121 行目の `Array.splice2` は無いメソッドで、`Array.splice(index, 0, value1, value2)` の書き違いです。

本番ビルドから開発用の文が本当に消えているかは、このサイトの本番ビルドと開発ビルドの JS を読んで数えました（DEMO の 2）。章の引用にも同じ文が入っているので、esbuild の stats で「章のページを含まない chunk」（`main` と framework の chunk）だけを数えています。

| 文 | どこの文か | 本番 | 開発 |
| --- | --- | --- | --- |
| `ASSERTION ERROR` | util/assert.ts L113（throwError） | 0 | 3 |
| `ngDevMode=false` | util/ng\_dev\_mode.ts L50（initNgDevMode → ngDevModeResetPerfCounters） | 0 | 1 |
| `Angular is running in development mode` | application\_ref.ts（開発モードの console.log） | 0 | 1 |
| `Resource is currently in an error state` | resource/resource.ts L614（ResourceValueError の開発モードの文） | 0 | 1 |
| `has intrinsic file dimensions much larger` | image\_performance\_warning.ts L226 | 0 | 1 |
| `is the Largest Contentful Paint` | image\_performance\_warning.ts L211 | 0 | 3 |
| `can only be used on an element node` | animation/utils.ts L62（assertElementNodes） | 0 | 1 |
| `did not match any elements` | platform-browser dom\_renderer.ts L385 | 0 | 1 |
| `Missing locale data for the locale` | i18n/locale\_data\_api.ts L70 | 0 | 1 |
| `mark_feature_usage` | util/performance.ts L24（ngDevMode で囲まれていない） | 1 | 1 |
| `Performance API is not supported` | profiler.ts L67（enableProfiling、ブラウザーでは使われない） | 0 | 0 |

本番の 71 個の chunk（1.7 MB）には、開発用の 9 つの文が 1 つも無く、`ngDevMode` で囲まれていない `mark_feature_usage`（6 節）だけが 1 回ありました。開発の 79 個（4.5 MB）には全部あります。最後の行の `Performance API is not supported`（8 節の profiler.ts L67）は開発にも無く、ブラウザーの bundle では `enableProfiling` を誰も呼ばないので、`ngDevMode` と関係なく tree-shake で消えています。

## 5. stringify と decorators の説明

📄 `angular/packages/core/src/util/stringify.ts` L37–64 （▶ の行: 40–42, 45, 52, 55–56, 59, 62–63）

```ts
37 │ /**
38 │  * Concatenates two strings with separator, allocating new strings only when necessary.
39 │  *
40 ▶  * @param before before string.
41 ▶  * @param separator separator string.
42 ▶  * @param after after string.
43 │  * @returns concatenated string.
44 │  */
45 ▶ export function concatStringsWithSpace(before: string | null, after: string | null): string {
46 │   if (!before) return after || '';
47 │   if (!after) return before;
48 │   return `${before} ${after}`;
49 │ }
50 │ 
51 │ /**
52 ▶  * Ellipses the string in the middle when longer than the max length
53 │  *
54 │  * @param string
55 ▶  * @param maxLength of the output string
56 ▶  * @returns ellipsed string with ... in the middle
57 │  */
58 │ export function truncateMiddle(str: string, maxLength = 100): string {
59 ▶   if (!str || maxLength < 1 || str.length <= maxLength) return str;
60 │   if (maxLength == 1) return str.substring(0, 1) + '...';
61 │ 
62 ▶   const halfLimit = Math.round(maxLength / 2);
63 ▶   return str.substring(0, halfLimit) + '...' + str.substring(str.length - halfLimit);
64 │ }
```

`concatStringsWithSpace` の説明は 41 行目で `@param separator` を挙げますが、45 行目の関数は `before` と `after` の 2 つだけで、区切りは空白 1 つに決まっています。b7ff38b1efa（2019-12-15、``refactor(ivy): Implement `computeStaticStyling` (#34418)``）からある説明です。`truncateMiddle` の 55 行目は「`maxLength` は出力の文字列の長さ」と言いますが、62〜63 行目は前と後ろから `maxLength / 2`（四捨五入）文字ずつ取って `...` を挟むので、Node の記録では `truncateMiddle('abcdefghij', 4)` が `ab...ij`（7 文字）、`5` が `abc...hij`（9 文字）でした。使うのは common/http の transfer\_cache.ts L523（既定の 100 で、出力は 103 文字まで）だけです。この関数は 7dde42a5dfd（2023-10-04）で入りました。

📄 `angular/packages/core/src/util/decorators.ts` L13–39 （▶ の行: 14–15, 18, 28, 34, 37）

````ts
13 │ /**
14 ▶  * An interface implemented by all Angular type decorators, which allows them to be used as
15 ▶  * decorators as well as Angular syntax.
16 │  *
17 │  * ```ts
18 ▶  * @ng.Component({...})
19 │  * class MyClass {...}
20 │  * ```
21 │  *
22 │  * @publicApi
23 │  */
24 │ export interface TypeDecorator {
25 │   /**
26 │    * Invoke as decorator.
27 │    */
28 ▶   <T extends Type<any>>(type: T): T;
29 │ 
30 │   // Make TypeDecorator assignable to built-in ParameterDecorator type.
31 │   // ParameterDecorator is declared in lib.d.ts as a `declare type`
32 │   // so we cannot declare this interface as a subtype.
33 │   // see https://github.com/angular/angular/issues/3379#issuecomment-126169417
34 ▶   (target: Object, propertyKey?: string | symbol, parameterIndex?: number): void;
35 │   // Standard (non-experimental) Decorator signature that avoids direct usage of
36 │   // any TS 5.0+ specific types.
37 ▶   (target: unknown, context: unknown): void;
38 │ }
39 │ 
````

📄 `angular/packages/core/src/util/decorators.ts` L158–189 （▶ の行: 170–173, 177–178, 183）

```ts
158 │     function PropDecoratorFactory(
159 │       this: unknown | typeof PropDecoratorFactory,
160 │       ...args: any[]
161 │     ): any {
162 │       if (this instanceof PropDecoratorFactory) {
163 │         metaCtor.apply(this, args);
164 │         return this;
165 │       }
166 │ 
167 │       const decoratorInstance = new (<any>PropDecoratorFactory)(...args);
168 │ 
169 │       function PropDecorator(target: any, name: string) {
170 ▶         // target is undefined with standard decorators. This case is not supported and will throw
171 ▶         // if this decorator is used in JIT mode with standard decorators.
172 ▶         if (target === undefined) {
173 ▶           throw new Error('Standard Angular field decorators are not supported in JIT mode.');
174 │         }
175 │ 
176 │         const constructor = target.constructor;
177 ▶         // Use of Object.defineProperty is important because it creates a non-enumerable property
178 ▶         // which prevents the property from being copied during subclassing.
179 │         const meta = Object.hasOwn(constructor, PROP_METADATA)
180 │           ? (constructor as any)[PROP_METADATA]
181 │           : Object.defineProperty(constructor, PROP_METADATA, {value: {}})[PROP_METADATA];
182 │         meta[name] = (Object.hasOwn(meta, name) && meta[name]) || [];
183 ▶         meta[name].unshift(decoratorInstance);
184 │ 
185 │         if (additionalProcessing) additionalProcessing(target, name, ...args);
186 │       }
187 │ 
188 │       return PropDecorator;
189 │     }
```

`TypeDecorator` の例（18 行目の `@ng.Component`）は、`ng` という全体の名前空間から使っていたころの書き方で、今は `import` した `Component` を使います（古いだけで、型の説明としては今も合っています）。37 行目の「標準の（experimental でない）デコレーターの形」の型はありますが、170〜173 行目のとおり、項目のデコレーターを標準デコレーターとして JIT で使うと投げます。Node の記録で `Input()(undefined, {kind: 'field', name: 'x'})` を呼ぶと、開発モードでも本番でも `Standard Angular field decorators are not supported in JIT mode.` でした（この文は `ngDevMode` で囲まれていません）。

## 6. performanceMarkFeature：本番でも打たれる印

📄 `angular/packages/core/src/util/performance.ts` L9–25 （▶ の行: 13, 15–17, 20, 23–24）

```ts
 9 │ const markedFeatures = new Set<string>();
10 │ 
11 │ // tslint:disable:ban
12 │ /**
13 ▶  * A guarded `performance.mark` for feature marking.
14 │  *
15 ▶  * This method exists because while all supported browser and node.js version supported by Angular
16 ▶  * support performance.mark API. This is not the case for other environments such as JSDOM and
17 ▶  * Cloudflare workers.
18 │  */
19 │ export function performanceMarkFeature(feature: string): void {
20 ▶   if (markedFeatures.has(feature)) {
21 │     return;
22 │   }
23 ▶   markedFeatures.add(feature);
24 ▶   performance?.mark?.('mark_feature_usage', {detail: {feature}});
25 │ }
```

`performanceMarkFeature` は、`ngDevMode` で囲まれていない、本番でも動く印です。機能ごとに 1 回だけ（20〜23 行目）`mark_feature_usage` という名前の `performance.mark` を打ち、`detail.feature` に機能の名前を入れます。DEMO の 1 で、このページで打たれた機能の名前を読めます。本番ビルドの headless Chrome の記録では `NgStandalone`・`NgHydration`・`NgEventReplay`・`NgControlFlow`・`NgHttpTransferCache` の 5 つでした（Node の SSR の記録では `NgZoneless`・`NgStandalone`）。15〜17 行目の説明は「Angular が対応するブラウザーと Node は全部 `performance.mark` を持つ。JSDOM や Cloudflare Workers はそうではない」と言いたい文ですが、「while … support」で文が切れています。

## 7. 画像の 2 つの警告：ImagePerformanceWarning

📄 `angular/packages/core/src/image_performance_warning.ts` L17–24 （▶ の行: 17–21, 23）

```ts
17 ▶ // A delay in milliseconds before the scan is run after onLoad, to avoid any
18 ▶ // potential race conditions with other LCP-related functions. This delay
19 ▶ // happens outside of the main JavaScript execution and will only effect the timing
20 ▶ // on when the warning becomes visible in the console.
21 ▶ const SCAN_DELAY = 200;
22 │ 
23 ▶ const OVERSIZED_IMAGE_TOLERANCE = 1200;
24 │ 
```

📄 `angular/packages/core/src/image_performance_warning.ts` L42–72 （▶ の行: 48–49, 57–58, 60, 65–66）

```ts
42 │     const doc = getDocument();
43 │     const win = doc.defaultView;
44 │     if (win) {
45 │       this.window = win;
46 │       // Wait to avoid race conditions where LCP image triggers
47 │       // load event before it's recorded by the performance observer
48 ▶       const waitToScan = () => {
49 ▶         setTimeout(this.scanImages.bind(this), SCAN_DELAY);
50 │       };
51 │       const setup = () => {
52 │         // Consider the case when the application is created and destroyed multiple times.
53 │         // Typically, applications are created instantly once the page is loaded, and the
54 │         // `window.load` listener is always triggered. However, the `window.load` event will never
55 │         // be fired if the page is loaded, and the application is created later. Checking for
56 │         // `readyState` is the easiest way to determine whether the page has been loaded or not.
57 ▶         if (doc.readyState === 'complete') {
58 ▶           waitToScan();
59 │         } else {
60 ▶           this.window?.addEventListener('load', waitToScan, {once: true});
61 │         }
62 │       };
63 │       // Angular doesn't have to run change detection whenever any asynchronous tasks are invoked in
64 │       // the scope of this functionality.
65 ▶       if (typeof Zone !== 'undefined') {
66 ▶         Zone.root.run(() => setup());
67 │       } else {
68 │         setup();
69 │       }
70 │     }
71 │   }
72 │ 
```

呼ぶのは platform/bootstrap.ts L162〜165 の `if (typeof ngDevMode === 'undefined' || ngDevMode)` の中だけなので、本番では `start()` が呼ばれず、クラスごと bundle から消えます（4 節の表の 2 つの警告の文）。`start()`（L33〜41 は[画像の loader の章](../cmn/15-cmn-image-loaders.md)が引用）は、サーバーでなく、`PerformanceObserver` があり、2 つの警告の両方が切られていないときだけ進み、57〜60 行目でページの `load` を待ち（もう終わっていればすぐ）、49 行目で 21 行目の 200 ms を置いてから 1 回だけ調べます。

📄 `angular/packages/core/src/image_performance_warning.ts` L77–100 （▶ の行: 84–85, 88, 92, 94–96, 98）

```ts
 77 │   private initPerformanceObserver(): PerformanceObserver | null {
 78 │     if (typeof PerformanceObserver === 'undefined') {
 79 │       return null;
 80 │     }
 81 │     const observer = new PerformanceObserver((entryList) => {
 82 │       const entries = entryList.getEntries();
 83 │       if (entries.length === 0) return;
 84 ▶       // We use the latest entry produced by the `PerformanceObserver` as the best
 85 ▶       // signal on which element is actually an LCP one. As an example, the first image to load on
 86 │       // a page, by virtue of being the only thing on the page so far, is often a LCP candidate
 87 │       // and gets reported by PerformanceObserver, but isn't necessarily the LCP element.
 88 ▶       const lcpElement = entries[entries.length - 1];
 89 │ 
 90 │       // Cast to `any` due to missing `element` on the `LargestContentfulPaint` type of entry.
 91 │       // See https://developer.mozilla.org/en-US/docs/Web/API/LargestContentfulPaint
 92 ▶       const imgSrc = (lcpElement as any).element?.src ?? '';
 93 │ 
 94 ▶       // Exclude `data:` and `blob:` URLs, since they are fetched resources.
 95 ▶       if (imgSrc.startsWith('data:') || imgSrc.startsWith('blob:')) return;
 96 ▶       this.lcpImageUrl = imgSrc;
 97 │     });
 98 ▶     observer.observe({type: 'largest-contentful-paint', buffered: true});
 99 │     return observer;
100 │   }
```

88 行目のとおり、LCP（ページで一番大きく描かれた要素）は `PerformanceObserver` の最後の候補を使います。94 行目のコメント「`data:` と `blob:` は、取ってくる資源なので除く」は理由が逆で、この 2 つはネットワークから取ってこない URL です（95 行目の実装は除くので、動きはコメントの前半のとおり）。もう 1 つ、L27 のコメント「完全な画像の URL から元の `ngSrc` への Map」の下にあるのは `window` の項目で、Map はありません。どちらも 048f400efc7（2023-09-19、`feat(core): add warnings for oversized images and lazy-lcp (#51846)`）からの文です。

📄 `angular/packages/core/src/image_performance_warning.ts` L102–116 （▶ の行: 103, 106–108, 110）

```ts
102 │   private scanImages(): void {
103 ▶     const images = getDocument().querySelectorAll('img');
104 │     let lcpElementFound,
105 │       lcpElementLoadedCorrectly = false;
106 ▶     // Important: do not refactor this to use `images.forEach` or
107 ▶     // `for (const ... of ...)`, because images might be a custom internal
108 ▶     // data structure — such as a lazily evaluated query result in Domino.
109 │     // (This naturally would never be a case in any browser).
110 ▶     for (let index = 0; index < images.length; index++) {
111 │       const image = images[index];
112 │ 
113 │       if (!image) {
114 │         continue;
115 │       }
116 │ 
```

📄 `angular/packages/core/src/image_performance_warning.ts` L136–145 （▶ の行: 138–139, 143）

```ts
136 │     }
137 │     if (
138 ▶       lcpElementFound &&
139 ▶       !lcpElementLoadedCorrectly &&
140 │       this.lcpImageUrl &&
141 │       !this.options?.disableImageLazyLoadWarning
142 │     ) {
143 ▶       logLazyLCPWarning(this.lcpImageUrl);
144 │     }
145 │   }
```

📄 `angular/packages/core/src/image_performance_warning.ts` L147–172 （▶ の行: 156, 159, 167, 169）

```ts
147 │   private isOversized(image: HTMLImageElement): boolean {
148 │     if (!this.window) {
149 │       return false;
150 │     }
151 │ 
152 │     // The `isOversized` check may not be applicable or may require adjustments
153 │     // for several types of image formats or scenarios. Currently, we specify only
154 │     // `svg`, but this may also include `gif` since their quality isn’t tied to
155 │     // dimensions in the same way as raster images.
156 ▶     const nonOversizedImageExtentions = [
157 │       // SVG images are vector-based, which means they can scale
158 │       // to any size without losing quality.
159 ▶       '.svg',
160 │     ];
161 │ 
162 │     // Convert it to lowercase because this may have uppercase
163 │     // extensions, such as `IMAGE.SVG`.
164 │     // We fallback to an empty string because `src` may be `undefined`
165 │     // if it is explicitly set to `null` by some third-party code
166 │     // (e.g., `image.src = null`).
167 ▶     const imageSource = (image.src || '').toLowerCase();
168 │ 
169 ▶     if (nonOversizedImageExtentions.some((extension) => imageSource.endsWith(extension))) {
170 │       return false;
171 │     }
172 │ 
```

📄 `angular/packages/core/src/image_performance_warning.ts` L173–204 （▶ の行: 179, 182, 185, 192, 199, 201–202）

```ts
173 │     const computedStyle = this.window.getComputedStyle(image);
174 │     let renderedWidth = parseFloat(computedStyle.getPropertyValue('width'));
175 │     let renderedHeight = parseFloat(computedStyle.getPropertyValue('height'));
176 │     const boxSizing = computedStyle.getPropertyValue('box-sizing');
177 │     const objectFit = computedStyle.getPropertyValue('object-fit');
178 │ 
179 ▶     if (objectFit === `cover`) {
180 │       // Object fit cover may indicate a use case such as a sprite sheet where
181 │       // this warning does not apply.
182 ▶       return false;
183 │     }
184 │ 
185 ▶     if (boxSizing === 'border-box') {
186 │       // If the image `box-sizing` is set to `border-box`, we adjust the rendered
187 │       // dimensions by subtracting padding values.
188 │       const paddingTop = computedStyle.getPropertyValue('padding-top');
189 │       const paddingRight = computedStyle.getPropertyValue('padding-right');
190 │       const paddingBottom = computedStyle.getPropertyValue('padding-bottom');
191 │       const paddingLeft = computedStyle.getPropertyValue('padding-left');
192 ▶       renderedWidth -= parseFloat(paddingRight) + parseFloat(paddingLeft);
193 │       renderedHeight -= parseFloat(paddingTop) + parseFloat(paddingBottom);
194 │     }
195 │ 
196 │     const intrinsicWidth = image.naturalWidth;
197 │     const intrinsicHeight = image.naturalHeight;
198 │ 
199 ▶     const recommendedWidth = this.window.devicePixelRatio * renderedWidth;
200 │     const recommendedHeight = this.window.devicePixelRatio * renderedHeight;
201 ▶     const oversizedWidth = intrinsicWidth - recommendedWidth >= OVERSIZED_IMAGE_TOLERANCE;
202 ▶     const oversizedHeight = intrinsicHeight - recommendedHeight >= OVERSIZED_IMAGE_TOLERANCE;
203 │     return oversizedWidth || oversizedHeight;
204 │   }
```

条件をまとめると次のとおりで、開発ビルドの `/chapter/crh-dev-utils` を headless Chrome で開き、`DOMContentLoaded` で `body` の頭に画像を入れた記録（DEMO の 4）と同じでした。L117〜135（`ng-img` を除く・LCP の画像の `loading` を見る）は[画像の loader の章](../cmn/15-cmn-image-loaders.md)の引用です。

| 画像（記録の中） | 条件の行 | 記録の警告 |
| --- | --- | --- |
| `hero.png`（1200×700、900×525 で描く、`loading="lazy"`、LCP） | L124〜135・138〜143：LCP の画像が lazy | NG0913「… is the Largest Contentful Paint (LCP) element but was given a "loading" value of "lazy" …」 |
| `big.png`（2400×2400、200×200 で描く） | 199〜202：2400 − 1 × 200 ≥ 1200（23 行目） | NG0913「… has intrinsic file dimensions much larger than its rendered size …」 |
| `big.svg`（4000×4000、50×50 で描く） | 156〜170：`.svg` は除く | なし |
| `cover.png`（2400×2400、`object-fit: cover`） | 179〜183：sprite のような使い方と見なして除く | なし |
| `ngimg.png`（2400×2400、`ng-img` 属性） | L120：`NgOptimizedImage` は自分で調べるので除く | なし |
| `hero.png` を `loading` 無しで | L127 | なし |

📄 `angular/packages/core/src/image_performance_warning.ts` L207–232 （▶ の行: 209–210, 216–217, 224–225, 228–229）

```ts
207 │ function logLazyLCPWarning(src: string) {
208 │   console.warn(
209 ▶     formatRuntimeError(
210 ▶       RuntimeErrorCode.IMAGE_PERFORMANCE_WARNING,
211 │       `An image with src ${src} is the Largest Contentful Paint (LCP) element ` +
212 │         `but was given a "loading" value of "lazy", which can negatively impact ` +
213 │         `application loading performance. This warning can be addressed by ` +
214 │         `changing the loading value of the LCP image to "eager", or by using the ` +
215 │         `NgOptimizedImage directive's prioritization utilities. For more ` +
216 ▶         `information about addressing or disabling this warning, see ` +
217 ▶         `${ERROR_DETAILS_PAGE_BASE_URL}/NG0913`,
218 │     ),
219 │   );
220 │ }
221 │ 
222 │ function logOversizedImageWarning(src: string) {
223 │   console.warn(
224 ▶     formatRuntimeError(
225 ▶       RuntimeErrorCode.IMAGE_PERFORMANCE_WARNING,
226 │       `An image with src ${src} has intrinsic file dimensions much larger than its ` +
227 │         `rendered size. This can negatively impact application loading performance. ` +
228 ▶         `For more information about addressing or disabling this warning, see ` +
229 ▶         `${ERROR_DETAILS_PAGE_BASE_URL}/NG0913`,
230 │     ),
231 │   );
232 │ }
```

2 つの文は 216〜217・228〜229 行目で「…については `…/NG0913` を見て」と URL を書き、そのうえで `formatRuntimeError`（errors.ts）が開発モードで「Find more at …/NG0913」を足すので、記録の文は同じ URL が 2 回続いていました。なお「LCP の画像が `priority` でない」という警告は `NgOptimizedImage`（@angular/common）の側の物で、ここ（core）の 2 つとは別です（[LCP と preload の章](../cmn/16-cmn-image-lcp-preload.md)）。

## 8. profiler.ts：SSR の 🅰️ の印と、閉じられない印

📄 `angular/packages/core/src/profiler.ts` L9–26 （▶ の行: 9, 11, 14–15, 18, 24）

```ts
 9 ▶ export const PERFORMANCE_MARK_PREFIX = '🅰️';
10 │ 
11 ▶ let enablePerfLogging = false;
12 │ 
13 │ /**
14 ▶  * Function that will start measuring against the performance API
15 ▶  * Should be used in pair with stopMeasuring
16 │  */
17 │ export function startMeasuring(label: string): void {
18 ▶   if (!enablePerfLogging) {
19 │     return;
20 │   }
21 │ 
22 │   const {startLabel} = labels(label);
23 │   /* tslint:disable:ban */
24 ▶   performance.mark(startLabel);
25 │   /* tslint:enable:ban */
26 │ }
```

📄 `angular/packages/core/src/profiler.ts` L28–53 （▶ の行: 30, 39–42, 47, 50–51）

```ts
28 │ /**
29 │  * Function that will stop measuring against the performance API
30 ▶  * Should be used in pair with startMeasuring
31 │  */
32 │ export function stopMeasuring(label: string): void {
33 │   if (!enablePerfLogging) {
34 │     return;
35 │   }
36 │ 
37 │   const {startLabel, labelName, endLabel} = labels(label);
38 │   /* tslint:disable:ban */
39 ▶   performance.mark(endLabel);
40 ▶   performance.measure(labelName, startLabel, endLabel);
41 ▶   performance.clearMarks(startLabel);
42 ▶   performance.clearMarks(endLabel);
43 │   /* tslint:enable:ban */
44 │ }
45 │ 
46 │ export function labels(label: string) {
47 ▶   const labelName = `${PERFORMANCE_MARK_PREFIX}:${label}`;
48 │   return {
49 │     labelName,
50 ▶     startLabel: `start:${labelName}`,
51 ▶     endLabel: `end:${labelName}`,
52 │   };
53 │ }
```

📄 `angular/packages/core/src/profiler.ts` L55–75 （▶ の行: 57, 59, 61, 64, 67, 71）

```ts
55 │ let warningLogged = false;
56 │ /**
57 ▶  * This enables an internal performance profiler
58 │  *
59 ▶  * It should not be imported in application code
60 │  */
61 ▶ export function enableProfiling() {
62 │   if (
63 │     !warningLogged &&
64 ▶     (typeof performance === 'undefined' || !performance.mark || !performance.measure)
65 │   ) {
66 │     warningLogged = true;
67 ▶     console.warn('Performance API is not supported on this platform');
68 │     return;
69 │   }
70 │ 
71 ▶   enablePerfLogging = true;
72 │ }
73 │ export function disableProfiling() {
74 │   enablePerfLogging = false;
75 │ }
```

この `profiler.ts` は `performance.mark` / `measure` を打つ小さな物で、core の中では誰も呼びません。`ɵstartMeasuring`・`ɵstopMeasuring` として出て、platform-server の `renderApplication` ほか（utils.ts・platform\_state.ts・transfer\_state.ts）が使い、`ɵenableProfiling` を呼ぶのはリポジトリの中では modules/ssr-benchmarks/src/main.server.ts L25 だけです（84b68969561、2024-10-01、`refactor(platform-server): Add an ssr benchmark setup. (#57647)`）。59 行目「アプリのコードから import しない」とあるとおりの道具です。名前の付け方（47〜51 行目）は angular-cli の CommonEngine の profiler も同じ 🅰️ を使います（[CommonEngine の章](../ssrl/03-ssrl-common-engine.md)）。

Node の記録で `ɵenableProfiling()` のあと `renderApplication` を回すと、measure は `🅰️:renderApplication`・`createServerPlatform`・`bootstrap`・`_render`・`whenStable`・`renderToString` の 6 つでした。ハイドレーション（`provideClientHydration`）を足すと `prepareForHydration` と `serializeTransferStateFactory` が加わって 8 つです。ハイドレーションが無いときは、この 2 つの `start:` の mark が残りました（1 回で 2 つ、3 回で 6 つ）。utils.ts の `prepareForHydration`（L95〜125）はハイドレーションが無いと L101〜106 で、transfer\_state.ts の `serializeTransferStateFactory` は TransferState が空だと L83〜87 で、`stopMeasuring` の前に `return` するからです。41〜42 行目の `clearMarks` に届かないので、`ɵenableProfiling()` したままのサーバーでは描くたびに mark が 2 つずつ増えます。origin/main の 2 つのファイルも同じ形で、gh で探しても issue は見当たりません。

もう 1 つの印、`setProfiler`（render3/profiler.ts）は、テンプレートの実行や変更検知の前後に `ProfilerEvent` を配るものです（[DevTools のプロファイラーの章](../devtools/13-devtools-profiler-capture.md)）。アプリから触れる入口は開発モードだけで置かれる `window.ng.ɵsetProfiler` なので、このページ（本番）では `typeof window.ng` が `undefined` です（DEMO の 1）。開発ビルドを headless Chrome で開き、`ng.ɵsetProfiler` で数えてから返った関数で外した記録が DEMO の 5 です。

## 9. Trusted Types の bypass と、event\_delegation\_utils の頭

📄 `angular/packages/core/src/util/security/trusted_types_bypass.ts` L9–38 （▶ の行: 11–16, 30–31, 33）

```ts
 9 │ /**
10 │  * @fileoverview
11 ▶  * A module to facilitate use of a Trusted Types policy internally within
12 ▶  * Angular specifically for bypassSecurityTrust* and custom sanitizers. It
13 ▶  * lazily constructs the Trusted Types policy, providing helper utilities for
14 ▶  * promoting strings to Trusted Types. When Trusted Types are not available,
15 ▶  * strings are used as a fallback.
16 ▶  * @security All use of this module is security-sensitive and should go through
17 │  * security review.
18 │  */
19 │ 
20 │ import {global} from '../global';
21 │ import {
22 │   TrustedHTML,
23 │   TrustedScript,
24 │   TrustedScriptURL,
25 │   TrustedTypePolicy,
26 │   TrustedTypePolicyFactory,
27 │ } from './trusted_type_defs';
28 │ 
29 │ /**
30 ▶  * The Trusted Types policy, or null if Trusted Types are not
31 ▶  * enabled/supported, or undefined if the policy has not been created yet.
32 │  */
33 ▶ let policy: TrustedTypePolicy | null | undefined;
34 │ 
35 │ /**
36 │  * Returns the Trusted Types policy, or null if Trusted Types are not
37 │  * enabled/supported. The first call to this function will create the policy.
38 │  */
```

📄 `angular/packages/core/src/util/security/trusted_types_bypass.ts` L74–97 （▶ の行: 76, 78, 80–81, 84, 96）

```ts
74 │ 
75 │ /**
76 ▶  * Unsafely promote a string to a TrustedScript, falling back to strings when
77 │  * Trusted Types are not available.
78 ▶  * @security This is a security-sensitive function; any use of this function
79 │  * must go through security review. In particular, it must be assured that it
80 ▶  * is only passed strings that come directly from custom sanitizers or the
81 ▶  * bypassSecurityTrust* functions.
82 │  */
83 │ export function trustedScriptFromStringBypass(script: string): TrustedScript | string {
84 ▶   return getPolicy()?.createScript(script) || script;
85 │ }
86 │ 
87 │ /**
88 │  * Unsafely promote a string to a TrustedScriptURL, falling back to strings
89 │  * when Trusted Types are not available.
90 │  * @security This is a security-sensitive function; any use of this function
91 │  * must go through security review. In particular, it must be assured that it
92 │  * is only passed strings that come directly from custom sanitizers or the
93 │  * bypassSecurityTrust* functions.
94 │  */
95 │ export function trustedScriptURLFromStringBypass(url: string): TrustedScriptURL | string {
96 ▶   return getPolicy()?.createScriptURL(url) || url;
97 │ }
```

11〜15 行目「`bypassSecurityTrust*` と独自のサニタイザーのための Trusted Types の policy を遅れて作る。使えなければ文字列のまま」の policy の名前（`angular#unsafe-bypass`、L39〜73）は[Trusted Types の章](../domr/18-domr-trusted-types.md)で読みます。84・96 行目の Script と ScriptURL の 2 つは、sanitization.ts の `ɵɵsanitizeScript`（L165・L170）と `ɵɵsanitizeResourceUrl`（L137・L142）が呼びます。80〜81 行目の「独自のサニタイザーか `bypassSecurityTrust*` から来た文字列だけを渡す」が、呼ぶ側の 2 つの枝（サニタイザーの戻り値と `unwrapSafeValue`）にそのまま対応しています。

📄 `angular/packages/core/src/event_delegation_utils.ts` L9–24 （▶ の行: 17, 21）

```ts
 9 │ // tslint:disable:no-duplicate-imports
10 │ import type {EventContract} from '../primitives/event-dispatch';
11 │ import {Attribute} from '../primitives/event-dispatch';
12 │ import {APP_ID} from './application/application_tokens';
13 │ import {InjectionToken} from './di';
14 │ import type {RElement, RNode} from './render3/interfaces/renderer_dom';
15 │ import {INJECTOR, type LView} from './render3/interfaces/view';
16 │ 
17 ▶ export const DEFER_BLOCK_SSR_ID_ATTRIBUTE = 'ngb';
18 │ 
19 │ declare global {
20 │   interface Element {
21 ▶     __jsaction_fns: Map<string, Function[]> | undefined;
22 │   }
23 │ }
24 │ 
```

17 行目の `ngb` は、サーバーで描いた `@defer` の中の要素に付ける「どの defer block か」の属性で（L48 で付け、L63 で読み、L89 で外す）、21 行目の `__jsaction_fns` は要素ごとのイベントの関数の Map です。どちらの使い方も[イベントの再生の章](../platform/14-event-replay.md)にあります。

> **🧪 DEMO — 開発モードの印を、本番のページと記録で見比べる**
>
> 1 はこのページ（本番ビルド）でその場で読みます。2〜5 は、このサイトの本番ビルドと開発ビルドを手元で作り、JS を数えた記録と、開発ビルドを headless Chrome で開いた記録の再生です。6 は Node（domino の上の JIT、@angular/core・platform-server 22.2.6）の記録で、開発モードと本番（`ngDevMode = false`）を並べます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crh-dev-utils)

## ここまでの呼び出し

- 👤 `ng build`（optimization あり）
  - `esbuild の define: {ngDevMode: 'false', ngServerMode: 'false', ngHmrMode: …}` — angular-cli application-code-bundle.ts L659〜668
    - `if (typeof ngDevMode === 'undefined' || ngDevMode) { ImagePerformanceWarning.start() }` — platform/bootstrap.ts L162〜165 — *条件が false になり、クラスごと消える*
    - `ngDevMode && assertGreaterThan(delta, 0, …)` — render3/instructions/advance.ts L44 — *assert.ts の関数も文も消える*
- 👤 `ng serve` / 開発ビルドで `?ngDevMode=false`
  - `ɵɵdefineComponent → initNgDevMode()` — util/ng\_dev\_mode.ts L80〜92
    - `ngDevModeResetPerfCounters → location に 'ngDevMode=false' → global['ngDevMode'] = false` — L38〜60
- 👤 `ɵenableProfiling()` → `renderApplication(...)`
  - `startMeasuring('prepareForHydration')` — platform-server utils.ts L96〜97
    - `ハイドレーションが無い → return` — L101〜106 — *stopMeasuring に届かず、start: の mark が残る*

## テストと直し方

| ファイル（packages/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `core/test/util/stringify_spec.ts` | `stringify`（10）› `should return string undefined when toString returns undefined`（11）・`concatStringsWithSpace`（17）› 3 つ（18・24・30） | 5 節。`truncateMiddle` の it は無い |
| `core/test/util/decorators_spec.ts` | `Property decorators`（26）・`decorators`（52）› `should not apply decorators from the prototype chain`（66） | 5 節の decorators。標準デコレーターで投げる it は無い |
| `core/test/util/array_utils_spec.ts` | `array_utils`（22）› `fast arraySplice`（42）・`KeyValueArray`（106） | 4 節の `arrayInsert2` を通る `keyValueArraySet` |
| `core/test/bundling/image-directive/e2e/image-perf-warnings-lazy/image-perf-warnings-lazy.e2e-spec.ts` | `Image performance warnings (lazy)`（12）› `should log a warning when a LCP image is loaded lazily`（24） | 7 節の lazy の警告 |
| `core/test/bundling/image-directive/e2e/image-perf-warnings-oversized/image-perf-warnings-oversized.e2e-spec.ts` | `Image performance warnings (oversized)`（12）› `should warn if rendered image size is much smaller than intrinsic size`（24）・`should NOT warn if rendered SVG image size is much smaller that intrinsic size`（36） | 7 節の大きすぎる警告と `.svg`。`object-fit: cover` と `ng-img` の it は無い |
| `core/test/bundling/*/bundle.golden_symbols.json` | （spec ではなく、bundle に残る名前の一覧） | 本番の bundle に残る関数の名前。`initNgDevMode` は golden に無い（4 節の表と同じく消える） |
| `platform-server/test/` | （`ɵenableProfiling` の it は無い） | 8 節の 🅰️ の印 |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test:test --nocache_test_results "--test_arg=--filter=<下の名前>"
  stringify    Ran 1 + 1 + 1 + 2 = 5 specs（4 つの shard）, 0 failures
  decorators   Ran 2 + 3 + 2 + 2 = 9 specs, 0 failures
  array_utils  Ran 2 + 2 + 2 + 2 = 8 specs, 0 failures
$ pnpm bazel test //packages/core/test/bundling/image-directive:webdriver_tests --nocache_test_results --test_output=all
  14 specs, 0 failures（webdriver_tests_chromium、画像の警告の e2e を含む）

# 記録
$ node scan-strings.mjs <本番の browser> <開発の browser> <本番の stats> <開発の stats>  # 2 の表
$ node cdp-dev.mjs <開発ビルドの browser> <画像のディレクトリ>   # 3〜5 の表（headless Chrome）
$ node record-devutils.mjs <angular-deep-dive> [prod]             # 6 の表（Node、domino の上の JIT）
```

直すとしたら、assert の文は util/assert.ts の 114 行目を `${actual} ${comparison} ${expected}` の順にする（`[Expected=> … <=Actual]` の飾りも合わせる）のが 1 行の変更で、spec は packages/core/test/util/ に throwError の文の it を足します。SSR の mark は、platform-server の utils.ts の `prepareForHydration` と transfer\_state.ts の `serializeTransferStateFactory` を `try / finally` にして `stopMeasuring` を必ず呼ぶ形で、spec は packages/platform-server/test/ に「`ɵenableProfiling()` のあと、ハイドレーション無しで描いても `start:🅰️:` の mark が残らない」を足します。`truncateMiddle` は 62〜63 行目で `...` の 3 文字を引いてから半分にするか、55 行目の説明を「前後から `maxLength / 2` 文字ずつ」に直すかです。コメントは、stringify.ts の 41 行目、image\_performance\_warning.ts の L27 と 94 行目、array\_utils.ts の 121 行目、performance.ts の 15〜17 行目が、それぞれ 1 行の直しです。

## 聞かれそうな質問

**Q. 本番ビルドで `ngDevMode` を読むとどうなりますか？**

コードの中の `ngDevMode` は、ビルドのときに `false` に置き換わっています（angular-cli の L664）。実行時の `globalThis['ngDevMode']` は `undefined` のままです。このページでも `isDevMode()` は `false` でした。

**Q. 開発ビルドのまま検査を止められますか？**

URL に `ngDevMode=false` を入れます（ng\_dev\_mode.ts の 50 行目）。記録では `ngDevMode` が `false` になり、`window.ng` も開発モードの console の文も出なくなりました。ビルドの中身（大きさ）は開発ビルドのままです。

**Q. 画像の「大きすぎる」は何で決まりますか？**

ファイルの幅（高さ）から、描く幅（高さ、`border-box` なら padding を引く）× `devicePixelRatio` を引いて 1200 以上なら警告です（199〜202 行目、23 行目）。`.svg`・`object-fit: cover`・`NgOptimizedImage`（`ng-img`）は除きます。調べるのはページの `load` から 200 ms 後の 1 回だけです。

**Q. assert の文の `[Expected=> 0 > -1 <=Actual]` はどう読みますか？**

左が期待した値、右が実際の値で、真ん中の記号は「実際 記号 期待」が成り立つべきだった関係です。114 行目が左右を逆に並べるので、`<`・`>` の文は成り立っている式に見えます。`ɵɵadvance(-1)` では「`-1 > 0` であるべきだった」が正しい読み方です。

**Q. 本番のアプリで `setProfiler` を使えますか？**

入口の `window.ng.ɵsetProfiler` は開発モードだけで置かれるので、本番のページには無く、このページでも `typeof ng` は `undefined` でした。

## 読み終えて

- `ngDevMode` は、本番ビルドでは CLI の `define` で `false`、開発では最初の `ɵɵdefineComponent` でカウンターのオブジェクトになる。URL の `ngDevMode=false` でも止まる。
- `ngDevMode && assertX()` の形の検査と文は本番の JS に残らない。assert の文は左右が逆に並ぶ。
- 画像の警告は 2 つ（LCP が lazy、1200 px 以上大きすぎる）で、開発モードの bootstrap から 1 回だけ調べる。
- `profiler.ts` の 🅰️ の印は SSR のベンチマーク用で、ハイドレーションが無いと 2 つの mark が閉じられずに残る。
- `performanceMarkFeature` の `mark_feature_usage` は本番でも打たれる。

---

← 前: [Renderer2 の各メソッドと、i18n の token・animation の検査の説明文](06-crh-renderer.md)  
次: [spec と issue を読む：core の説明文（3）を固めているもの](08-crh-tests-issues.md) →
