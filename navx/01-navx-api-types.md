[目次](../README.md) › [Navigation API と FakeNavigation](README.md) › 第 1 回 / 全 7 回

# Navigation API の型と PlatformNavigation：Angular が型を自分で持つ理由

> Navigation API の navigate・traverseTo・currentEntry・entries・navigate イベントと intercept の約束を、primitives/dom-navigation の navigation\_types.ts の行で読む。TypeScript の lib の型と揃えた変更（d79b3b65e95）、@angular/common の PlatformNavigation と、ブラウザの window.navigation を返す provider、precommitHandler を使えるかを示すトークン（dd58c4b667b）。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/navx-api-types)

---

ブラウザの `window.navigation`（Navigation API）は、履歴を `history.pushState` より細かく扱うための新しい API です。Angular はこの API の型を TypeScript の標準の型（`lib.dom.d.ts`）から借りずに、`@angular/core` の中に自分で書き写して持っています。この章では、その型の宣言を 1 つずつ読み、2026-07 に標準の型と名前を揃えたコミット（d79b3b65e95）と、`@angular/common` の `PlatformNavigation` がブラウザの `window.navigation` をそのまま返す行、precommitHandler を使えるかを表すトークン（dd58c4b667b）を読みます。

読む対象は `packages/core/primitives/dom-navigation/src/navigation_types.ts`、`packages/core/src/core_private_export.ts`、`packages/common/src/navigation/platform_navigation.ts`、それに `dom-navigation/testing/fake_navigation.ts` の冒頭です。Router がこの API をどう使うかの大きな流れは[Router の Navigation API の章](../router/21-router-platform-navigation.md)にあります。ここではその章が使っている「型」と「入口」を読みます。

1. **1. 型と PlatformNavigation**（この章）
2. [2. FakeNavigation の navigate](02-navx-fake-navigate.md)
3. [3. 戻る・進む](03-navx-fake-traverse.md)
4. [4. precommitHandler](04-navx-precommit.md)
5. [5. Router の連携の残り](05-navx-router-integration.md)
6. [6. テストの土台](06-navx-testing.md)
7. [7. spec と issue](07-navx-tests-issues.md)

## 1. 型は core の primitives に置かれ、ɵ 付きで出される

📄 `angular/packages/core/src/core_private_export.ts` L8–22 （▶ の行: 9–10, 13, 18, 20, 22）

```ts
 8 │ export {
 9 ▶   type NavigateEvent as ɵNavigateEvent,
10 ▶   type Navigation as ɵNavigation,
11 │   type NavigationCurrentEntryChangeEvent as ɵNavigationCurrentEntryChangeEvent,
12 │   type NavigationDestination as ɵNavigationDestination,
13 ▶   type NavigationHistoryEntry as ɵNavigationHistoryEntry,
14 │   type NavigationInterceptOptions as ɵNavigationInterceptOptions,
15 │   type NavigationNavigateOptions as ɵNavigationNavigateOptions,
16 │   type NavigationOptions as ɵNavigationOptions,
17 │   type NavigationReloadOptions as ɵNavigationReloadOptions,
18 ▶   type NavigationResult as ɵNavigationResult,
19 │   type NavigationTransition as ɵNavigationTransition,
20 ▶   type NavigationType as ɵNavigationType,
21 │   type NavigationUpdateCurrentEntryOptions as ɵNavigationUpdateCurrentEntryOptions,
22 ▶ } from '../primitives/dom-navigation';
```

22 行目、出どころは `../primitives/dom-navigation` です。このディレクトリの `index.ts` は `export * from './src/navigation_types'` の 1 行だけなので、型の本体は `navigation_types.ts` 1 つにあります。9〜21 行目はどれも `type` 付きの export で、名前の頭に `ɵ` が付いています。

- `ɵ`（シータ）は Angular の「公開 API ではない」という印です。`@angular/core` から import はできますが、使い方が変わっても破壊的変更として扱われません。
- `type` 付きの export は型だけを出します。JavaScript には何も残りません。Navigation API の実体はブラウザが持っているので、Angular が出すのは「形」だけです。
- これを使っているのは `@angular/common` の `PlatformNavigation`（6 節）と、テスト用の偽物 `FakeNavigation` です。`FakeNavigation` は `@angular/core/testing` から `ɵFakeNavigation` という名前で出されています（`core/testing/src/testing_private_export.ts`）。

## 2. Navigation：履歴の一覧と、4 つのイベント

📄 `angular/packages/core/primitives/dom-navigation/src/navigation_types.ts` L9–42 （▶ の行: 9, 11–12, 15, 18–20, 23–25, 27, 32, 35）

```ts
 9 ▶ // TODO: Figure out how to use the types from NPM in the public API
10 │ 
11 ▶ export interface NavigationEventMap {
12 ▶   navigate: NavigateEvent;
13 │   navigatesuccess: Event;
14 │   navigateerror: ErrorEvent;
15 ▶   currententrychange: NavigationCurrentEntryChangeEvent;
16 │ }
17 │ 
18 ▶ export interface NavigationResult {
19 ▶   committed: Promise<NavigationHistoryEntry>;
20 ▶   finished: Promise<NavigationHistoryEntry>;
21 │ }
22 │ 
23 ▶ export declare class Navigation extends EventTarget {
24 ▶   entries(): NavigationHistoryEntry[];
25 ▶   readonly currentEntry: NavigationHistoryEntry | null;
26 │   updateCurrentEntry(options: NavigationUpdateCurrentEntryOptions): void;
27 ▶   readonly transition: NavigationTransition | null;
28 │ 
29 │   readonly canGoBack: boolean;
30 │   readonly canGoForward: boolean;
31 │ 
32 ▶   navigate(url: string, options?: NavigationNavigateOptions): NavigationResult;
33 │   reload(options?: NavigationReloadOptions): NavigationResult;
34 │ 
35 ▶   traverseTo(key: string, options?: NavigationOptions): NavigationResult;
36 │   back(options?: NavigationOptions): NavigationResult;
37 │   forward(options?: NavigationOptions): NavigationResult;
38 │ 
39 │   onnavigate: ((this: Navigation, ev: NavigateEvent) => any) | null;
40 │   onnavigatesuccess: ((this: Navigation, ev: Event) => any) | null;
41 │   onnavigateerror: ((this: Navigation, ev: ErrorEvent) => any) | null;
42 │   oncurrententrychange: ((this: Navigation, ev: NavigationCurrentEntryChangeEvent) => any) | null;
```

1. **9 行目：「NPM の型を公開 API で使う方法を考える」という TODO**

   ファイルの先頭の 1 行が、この章の題の答えの半分です。標準の型を公開 API にそのまま使う方法がまだ決まっていないので、自分で書き写しています。残りの半分は 5 節で読みます。
2. **11〜16 行目：イベントは 4 種類**

   `navigate`（遷移が始まる直前）、`navigatesuccess` と `navigateerror`（遷移の終わり）、`currententrychange`（現在のエントリが変わった）です。`navigate` だけが `NavigateEvent` という専用の型で、ここから遷移を横取り（intercept）できます（4 節）。
3. **18〜21 行目：遷移を始めるメソッドは Promise を 2 つ返す**

   `committed` は URL と履歴が書き換わった時点、`finished` は横取りした処理まで含めて終わった時点で決着します。32〜37 行目の `navigate`・`reload`・`traverseTo`・`back`・`forward` は、どれもこの `NavigationResult` を返します。2 つの時点がどこで来るかは[第 2 回](02-navx-fake-navigate.md)で、偽物の実装の行で追います。
4. **23〜27 行目：`declare class Navigation`**

   `declare class` は「実体はどこか別にあり、ここでは形だけを書く」という宣言です。24 行目の `entries()` が履歴エントリの配列、25 行目の `currentEntry` がいまのエントリ、27 行目の `transition` が進行中の遷移（なければ `null`）です。35 行目の `traverseTo(key)` は、エントリの `key` を指して戻る・進むをします（[第 3 回](03-navx-fake-traverse.md)）。

## 3. 履歴エントリ・遷移・options

📄 `angular/packages/core/primitives/dom-navigation/src/navigation_types.ts` L66–87 （▶ の行: 66–71, 79–82, 85）

```ts
66 ▶ export declare class NavigationTransition {
67 ▶   readonly navigationType: NavigationType;
68 ▶   readonly from: NavigationHistoryEntry;
69 ▶   readonly to: NavigationDestination;
70 ▶   readonly finished: Promise<void>;
71 ▶   readonly committed: Promise<void>;
72 │ }
73 │ 
74 │ export interface NavigationHistoryEntryEventMap {
75 │   dispose: Event;
76 │ }
77 │ 
78 │ export declare class NavigationHistoryEntry extends EventTarget {
79 ▶   readonly key: string;
80 ▶   readonly id: string;
81 ▶   readonly url: string | null;
82 ▶   readonly index: number;
83 │   readonly sameDocument: boolean;
84 │ 
85 ▶   getState(): unknown;
86 │ 
87 │   ondispose: ((this: NavigationHistoryEntry, ev: Event) => any) | null;
```

66〜72 行目の `NavigationTransition` は「いま進行中の遷移」です。67 行目の種類、68 行目の出発点（エントリ）、69 行目の行き先（`NavigationDestination`）、70〜71 行目の 2 つの Promise を持ちます。69 行目の `to` は 2025-12 のコミット 5988bdedaeb が、WHATWG の HTML 仕様の更新（whatwg/html の f19930f98af）に合わせて足しました。

78〜87 行目の `NavigationHistoryEntry` は履歴の 1 件です。79 行目の `key` と 80 行目の `id` は、どちらも文字列の識別子ですが意味が違います。`key` は「履歴の中の位置」で、replace（いまのエントリを置き換える遷移）をしても変わりません。`id` は「その中身」で、replace のたびに新しくなります。偽物の実装はこの違いをそのままコメントに書いています（5 節の 85・88 行目）。82 行目の `index` は配列の中の番号、85 行目の `getState()` はエントリに付けた state の写しを返します。

📄 `angular/packages/core/primitives/dom-navigation/src/navigation_types.ts` L111–128 （▶ の行: 111, 118, 122–123）

```ts
111 ▶ export type NavigationType = 'push' | 'reload' | 'replace' | 'traverse';
112 │ 
113 │ export interface NavigationUpdateCurrentEntryOptions {
114 │   state: unknown;
115 │ }
116 │ 
117 │ export interface NavigationOptions {
118 ▶   info?: unknown;
119 │ }
120 │ 
121 │ export interface NavigationNavigateOptions extends NavigationOptions {
122 ▶   state?: unknown;
123 ▶   history?: 'auto' | 'push' | 'replace';
124 │ }
125 │ 
126 │ export interface NavigationReloadOptions extends NavigationOptions {
127 │   state?: unknown;
128 │ }
```

111 行目、遷移の種類は `push`（新しいエントリを積む）・`reload`・`replace`・`traverse`（既存のエントリへ戻る・進む）の 4 つです。118 行目の `info` は遷移の呼び出し元が付ける任意の値で、履歴には残らず `navigate` イベントにだけ載ります。122 行目の `state` は履歴エントリに残る値、123 行目の `history` は push か replace かを呼び出し側が決めるための欄です（`'auto'` の決め方は第 2 回）。

## 4. NavigateEvent と intercept の約束

📄 `angular/packages/core/primitives/dom-navigation/src/navigation_types.ts` L130–158 （▶ の行: 145–146, 148–151, 154, 156–157）

```ts
130 │ export declare class NavigationCurrentEntryChangeEvent extends Event {
131 │   constructor(type: string, eventInit?: NavigationCurrentEntryChangeEventInit);
132 │ 
133 │   readonly navigationType: NavigationType | null;
134 │   readonly from: NavigationHistoryEntry;
135 │ }
136 │ 
137 │ export interface NavigationCurrentEntryChangeEventInit extends EventInit {
138 │   navigationType?: NavigationType | null;
139 │   from: NavigationHistoryEntry;
140 │ }
141 │ 
142 │ export declare class NavigateEvent extends Event {
143 │   constructor(type: string, eventInit?: NavigateEventInit);
144 │ 
145 ▶   readonly navigationType: NavigationType;
146 ▶   readonly canIntercept: boolean;
147 │   readonly userInitiated: boolean;
148 ▶   readonly hashChange: boolean;
149 ▶   readonly hasUAVisualTransition: boolean;
150 ▶   readonly destination: NavigationDestination;
151 ▶   readonly signal: AbortSignal;
152 │   readonly formData: FormData | null;
153 │   readonly downloadRequest: string | null;
154 ▶   readonly info?: unknown;
155 │ 
156 ▶   intercept(options?: NavigationInterceptOptions): void;
157 ▶   scroll(): void;
158 │ }
```

- 146 行目 `canIntercept`：横取りしてよい遷移か。別のオリジンへの遷移などは `false` です。
- 148 行目 `hashChange`：URL の `#` の後ろだけが変わる遷移か。
- 149 行目 `hasUAVisualTransition`：ブラウザ（UA = user agent）自身がすでに画面の切り替えの見た目を出したか。2026-09 の af26a8c5217 が足し、Router の view transition の二重実行を避けるのに使います（[view transitions の章](../router/19-router-view-transitions.md)）。
- 151 行目 `signal`：この遷移が取り消されたときに abort される `AbortSignal`。
- 156 行目 `intercept(options)`：この遷移を「同じドキュメントの中の遷移」に変え、ページの読み込みの代わりに自分の処理を走らせます。157 行目の `scroll()` は、スクロールの復元を自分の好きな時点で起こすためのメソッドです。

📄 `angular/packages/core/primitives/dom-navigation/src/navigation_types.ts` L160–187 （▶ の行: 173–176, 180–183）

```ts
160 │ export interface NavigateEventInit extends EventInit {
161 │   navigationType?: NavigationType;
162 │   canIntercept?: boolean;
163 │   userInitiated?: boolean;
164 │   hashChange?: boolean;
165 │   hasUAVisualTransition?: boolean;
166 │   destination: NavigationDestination;
167 │   signal: AbortSignal;
168 │   formData?: FormData | null;
169 │   downloadRequest?: string | null;
170 │   info?: unknown;
171 │ }
172 │ 
173 ▶ export interface NavigationInterceptOptions {
174 ▶   handler?: () => Promise<void>;
175 ▶   focusReset?: 'after-transition' | 'manual';
176 ▶   scroll?: 'after-transition' | 'manual';
177 │ }
178 │ 
179 │ export declare class NavigationDestination {
180 ▶   readonly url: string;
181 ▶   readonly key: string;
182 ▶   readonly id: string;
183 ▶   readonly index: number;
184 │   readonly sameDocument: boolean;
185 │ 
186 │   getState(): unknown;
187 │ }
```

173〜177 行目の `NavigationInterceptOptions` には、`handler`・`focusReset`・`scroll` の 3 つしかありません。`handler` は commit（URL の確定）のあとに走る処理で、返した Promise が決着するまで遷移は「進行中」です。`focusReset` と `scroll` を `'manual'` にすると、遷移の終わりにブラウザがフォーカスとスクロールを戻すのをやめます。

**precommitHandler（commit の前に走る処理）はこの型にありません。** この版（22.2.0-next.7）では、`fake_navigation.ts` の側に `ExperimentalNavigationInterceptOptions` という拡張の型として置かれています（[第 4 回](04-navx-precommit.md)）。新しい本家（../angular-main）では、2026-09 の a8233232f5a がこの 173 行目の型に `precommitHandler` を移し、174 行目の `handler` の型を `() => PromiseLike<void> | void` に広げました。

179〜187 行目の `NavigationDestination` は遷移の行き先です。181〜183 行目の `key`・`id`・`index` は traverse のときだけ行き先のエントリの値が入り、それ以外では `''`・`''`・`-1` です（偽物の実装の行は第 2 回）。

## 5. TypeScript の lib.dom と揃えた変更（d79b3b65e95）

TypeScript には、ブラウザの API の型が `lib.dom.d.ts` として付いてきます。手元の 2 つの版で確かめると、**TypeScript 5.9.3 の lib.dom には `interface Navigation` も `NavigateEvent` もありません**（あるのは `NavigationActivation` と `NavigationHistoryEntry` だけ）。**6.0.3 にはあります。**Angular 22 の `@angular/compiler-cli` は peerDependencies で `typescript: ">=6.0 <6.1"` を求めているので、v22 の利用者の手元には必ず標準の型があります。

📄 `typescript/lib/lib.dom.d.ts（6.0.3、手元の node_modules から抜粋）`

```
// typescript/lib/lib.dom.d.ts（6.0.3）。行番号はこのファイルのもの
1708 interface NavigationInterceptOptions {
1709     focusReset?: NavigationFocusReset;
1710     handler?: NavigationInterceptHandler;
1711     precommitHandler?: NavigationPrecommitHandler;
1712     scroll?: NavigationScrollBehavior;
1713 }
25424 interface Navigation extends EventTarget {
25430     readonly activation: NavigationActivation | null;
       ...
41289     readonly navigation: Navigation;        // interface Window の中
43474 declare var navigation: Navigation;
44380 type NavigationType = "push" | "reload" | "replace" | "traverse";
```

lib.dom の `NavigationInterceptOptions` には `precommitHandler` があり（1711 行目）、`Navigation` には `activation` があります（25430 行目）。型の名前は `NavigationType` です（44380 行目）。これと Angular の写しを揃えたのが次のコミットです。

📄 `git show d79b3b65e95 -- navigation_types.ts（抜粋）`

```
@@ -64,7 +64,7 @@ export declare class Navigation extends EventTarget {
 export declare class NavigationTransition {
-  readonly navigationType: NavigationTypeString;
+  readonly navigationType: NavigationType;
 ...
-export type NavigationTypeString = 'reload' | 'push' | 'replace' | 'traverse';
+export type NavigationType = 'push' | 'reload' | 'replace' | 'traverse';
 ...
 export declare class NavigationDestination {
   readonly url: string;
-  readonly key: string | null;
-  readonly id: string | null;
+  readonly key: string;
+  readonly id: string;
```

2026-07-24、Kristiyan Kostadinov の d79b3b65e95（PR #69924）。説明は「Navigation API の型の写しを、TypeScript の組み込みの型と揃える。内部の issue に関係する」の 2 文だけです。変えたのは 2 点です。

1. **型の名前を `NavigationTypeString` から `NavigationType` に**

   lib.dom と同じ名前にしました。`core_private_export.ts` の export も `ɵNavigationTypeString` から `ɵNavigationType` に変わり、1 節の 20 行目がその結果です。
2. **`NavigationDestination` の `key` と `id` を `string | null` から `string` に**

   lib.dom の `key` と `id` は `string` で、traverse 以外では空文字です。偽物の実装も `null` の代わりに `''` を入れるように変わり（下の差分）、spec の期待値も `key: null` から `key: ''` に書き換えられました。

📄 `git show d79b3b65e95 -- fake_navigation.ts（抜粋）`

```
@@ -80,6 +80,8 @@ export class FakeNavigation implements Navigation {
   eventTarget: EventTarget;
 
+  readonly activation: NavigationActivation | null = null;
+
 ...
-    this.key = key;
-    this.id = id;
+    this.key = key ?? '';
+    this.id = id ?? '';
```

同じコミットで偽物に `activation` が足されています。その行と、偽物のファイルの先頭を見ます。

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L9–32 （▶ の行: 9, 12, 23–25, 32）

```ts
 9 ▶ // 3p-only-start
10 │ import {
11 │   NavigationNavigateOptions,
12 ▶   NavigationType,
13 │   NavigationOptions,
14 │   NavigateEvent,
15 │   NavigationCurrentEntryChangeEvent,
16 │   NavigationTransition,
17 │   NavigationUpdateCurrentEntryOptions,
18 │   NavigationReloadOptions,
19 │   NavigationResult,
20 │   NavigationHistoryEntry,
21 │   NavigationInterceptOptions,
22 │   NavigationDestination,
23 ▶   Navigation,
24 ▶ } from '../src/navigation_types';
25 ▶ // 3p-only-end
26 │ 
27 │ /**
28 │  * Fake implementation of user agent history and navigation behavior. This is a
29 │  * high-fidelity implementation of browser behavior that attempts to emulate
30 │  * things like traversal delay.
31 │  */
32 ▶ export class FakeNavigation implements Navigation {
```

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L77–105 （▶ の行: 83, 85, 88, 95–96, 99–100）

```ts
 77 │   /**
 78 │    * `EventTarget` to dispatch events.
 79 │    * @internal
 80 │    */
 81 │   eventTarget: EventTarget;
 82 │ 
 83 ▶   readonly activation: NavigationActivation | null = null;
 84 │ 
 85 ▶   /** The next unique id for created entries. Replace recreates this id. */
 86 │   private nextId = 0;
 87 │ 
 88 ▶   /** The next unique key for created entries. Replace inherits this id. */
 89 │   private nextKey = 0;
 90 │ 
 91 │   /** Whether this fake is disposed. */
 92 │   private disposed = false;
 93 │ 
 94 │   /** Equivalent to `navigation.currentEntry`. */
 95 ▶   get currentEntry(): FakeNavigationHistoryEntry {
 96 ▶     return this.entriesArr[this.currentEntryIndex];
 97 │   }
 98 │ 
 99 ▶   get canGoBack(): boolean {
100 ▶     return this.currentEntryIndex > 0;
101 │   }
102 │ 
103 │   get canGoForward(): boolean {
104 │     return this.currentEntryIndex < this.entriesArr.length - 1;
105 │   }
```

1. **10〜24 行目の import に `NavigationActivation` は無い**

   83 行目の `NavigationActivation` は、このファイルのどこからも import されていません。TypeScript はこの名前を lib.dom の全域の型として解決します。つまり**偽物のファイルは、すでに一部で lib.dom の型を使っています**。
2. **9 行目と 25 行目の `// 3p-only-start` と `// 3p-only-end`**

   Google の社内のコードベース（google3）に同期するときに、この囲みの中が消される印です（2026-05 の 4f9ee3c056a。印の一覧は[PR の流れの章](../contrib/10-contrib-pr-flow.md)）。社内の版ではこの import が消えるので、`NavigationType`・`NavigateEvent`・`Navigation` などの名前は、すべて lib.dom の型を指すことになります。d79b3b65e95 が名前と `key` の型を lib.dom に合わせ、lib.dom にしかない `activation` を足したことで、同じファイルが「Angular の写し」と「lib.dom」のどちらで読まれても型検査が通る形になりました。コミットの説明は「内部の issue に関係する」以上のことを書いていません。
3. **32 行目：`implements Navigation`**

   偽物は Angular の写しの `Navigation` を実装します。95〜97 行目の `currentEntry` は配列 `entriesArr` の `currentEntryIndex` 番目、99〜101 行目の `canGoBack` はその番号が 0 より大きいか、です。85 行目と 88 行目のコメントが、3 節の `id` と `key` の違い（replace で id は作り直し、key は引き継ぐ）を書いています。

> [!NOTE]
> **さらに深く**
>
> lib.dom の型がもう全員の手元にあるのに、なぜ公開 API で使わないのか。`goldens/public-api/common/index.api.md`（公開 API の一覧を固定したファイル）を見ると、`PlatformNavigation` は `implements ɵNavigation` と書かれ、メソッドの型も `ɵNavigationResult` などで載っています。公開 API の型を lib.dom に切り替えると、この一覧が変わります。9 行目の TODO が残っているのは、その切り替えがまだ行われていない、ということです。

## 6. PlatformNavigation：ブラウザの window.navigation をそのまま返す

📄 `angular/packages/common/src/navigation/platform_navigation.ts` L37–52 （▶ の行: 44, 46–49）

```ts
37 │ /**
38 │  * This class wraps the platform Navigation API which allows server-specific and test
39 │  * implementations.
40 │  *
41 │  * Browser support is limited, so this API may not be available in all environments,
42 │  * may contain bugs, and is experimental.
43 │  *
44 ▶  * @experimental 21.0.0
45 │  */
46 ▶ @Injectable({providedIn: 'platform', useFactory: () => (window as any).navigation})
47 ▶ export abstract class PlatformNavigation implements Navigation {
48 ▶   abstract entries(): NavigationHistoryEntry[];
49 ▶   abstract currentEntry: NavigationHistoryEntry | null;
50 │   abstract updateCurrentEntry(options: NavigationUpdateCurrentEntryOptions): void;
51 │   abstract transition: NavigationTransition | null;
52 │   abstract canGoBack: boolean;
```

📄 `angular/packages/common/src/navigation/platform_navigation.ts` L53–68 （▶ の行: 59, 65–67）

```ts
53 │   abstract canGoForward: boolean;
54 │   abstract navigate(url: string, options?: NavigationNavigateOptions | undefined): NavigationResult;
55 │   abstract reload(options?: NavigationReloadOptions | undefined): NavigationResult;
56 │   abstract traverseTo(key: string, options?: NavigationOptions | undefined): NavigationResult;
57 │   abstract back(options?: NavigationOptions | undefined): NavigationResult;
58 │   abstract forward(options?: NavigationOptions | undefined): NavigationResult;
59 ▶   abstract onnavigate: ((this: Navigation, ev: NavigateEvent) => any) | null;
60 │   abstract onnavigatesuccess: ((this: Navigation, ev: Event) => any) | null;
61 │   abstract onnavigateerror: ((this: Navigation, ev: ErrorEvent) => any) | null;
62 │   abstract oncurrententrychange:
63 │     | ((this: Navigation, ev: NavigationCurrentEntryChangeEvent) => any)
64 │     | null;
65 ▶   abstract addEventListener(type: unknown, listener: unknown, options?: unknown): void;
66 ▶   abstract removeEventListener(type: unknown, listener: unknown, options?: unknown): void;
67 ▶   abstract dispatchEvent(event: Event): boolean;
68 │ }
```

46 行目がこのクラスのすべてです。`providedIn: 'platform'` は「プラットフォームの注入器（アプリより 1 つ上、ページに 1 つ）で 1 回だけ作る」、`useFactory: () => (window as any).navigation` は「作るときにブラウザの `window.navigation` を返す」です。つまり**ブラウザでは `inject(PlatformNavigation)` がブラウザの Navigation オブジェクトそのもの**を返し、Angular は何も包みません。47 行目からのクラスの本体は `abstract` のメソッドの並びだけで、実装はありません。テストでは偽物に差し替えるための「型と差し替え口」です。

- 44 行目、`@experimental 21.0.0`。v21 から実験的な公開 API です。
- 59〜64 行目の `onnavigate` などは、2 節の `Navigation` の 39〜42 行目と同じ形です。
- 65〜66 行目の `addEventListener` と `removeEventListener` は引数がすべて `unknown` です。2 節の写しはその続きにイベント名ごとの重ね定義（オーバーロード）を持っていますが、抽象クラスの側は 1 つにまとめています。67 行目の `dispatchEvent` は写しの `Navigation` に無く、`EventTarget` から来るものです。
- 2 節の写しにも、このクラスにも `activation` はありません。

> [!WARNING]
> **ハマりどころ**
>
> 46 行目の factory は `window` を確かめません。`window` の無いサーバー（SSR）で `PlatformNavigation` を inject すると、`window` を読んだ時点で ReferenceError になります。Navigation API の無いブラウザでは `undefined` が返ります。`PlatformNavigation` を inject しているのは `NavigationAdapterForLocation` と Router の `NavigationStateManager` だけで、どちらも `withExperimentalPlatformNavigation()` を付けたときにだけ使われます（[Router の Navigation API の章](../router/21-router-platform-navigation.md)）。angular.dev 自身は 2026-10 に、この機能を Firefox 159 より古い版では付けないようにしました（PR #71572。Firefox 側の不具合で、`#` への遷移でタブが落ちる issue #71567 のため）。

### PRECOMMIT\_HANDLER\_SUPPORTED（dd58c4b667b）

📄 `angular/packages/common/src/navigation/platform_navigation.ts` L9–34 （▶ の行: 12–13, 22, 28–29, 31–32）

```ts
 9 │ import {
10 │   Injectable,
11 │   InjectionToken,
12 ▶   ɵNavigateEvent as NavigateEvent,
13 ▶   ɵNavigation as Navigation,
14 │   ɵNavigationCurrentEntryChangeEvent as NavigationCurrentEntryChangeEvent,
15 │   ɵNavigationHistoryEntry as NavigationHistoryEntry,
16 │   ɵNavigationNavigateOptions as NavigationNavigateOptions,
17 │   ɵNavigationOptions as NavigationOptions,
18 │   ɵNavigationReloadOptions as NavigationReloadOptions,
19 │   ɵNavigationResult as NavigationResult,
20 │   ɵNavigationTransition as NavigationTransition,
21 │   ɵNavigationUpdateCurrentEntryOptions as NavigationUpdateCurrentEntryOptions,
22 ▶ } from '@angular/core';
23 │ 
24 │ /**
25 │  * @see https://developer.mozilla.org/en-US/docs/Web/API/NavigationPrecommitController
26 │  * @see https://developer.mozilla.org/en-US/docs/Web/API/NavigateEvent/intercept#precommithandler
27 │  */
28 ▶ export const PRECOMMIT_HANDLER_SUPPORTED = new InjectionToken<boolean>('', {
29 ▶   factory: () => {
30 │     return (
31 ▶       typeof window !== 'undefined' &&
32 ▶       typeof (window as any).NavigationPrecommitController !== 'undefined'
33 │     );
34 │   },
```

12〜21 行目、`@angular/common` は 1 節の `ɵ` 付きの型を `ɵ` を外した名前で import して使います。28〜34 行目の `PRECOMMIT_HANDLER_SUPPORTED` は、2025-12-18 の dd58c4b667b（Andrew Scott）が足した真偽値のトークンです。29 行目の `factory` は、31 行目で `window` があり、32 行目で `window.NavigationPrecommitController`（precommitHandler に渡される controller のクラス）が存在するとき `true` を返します。`factory` を持つ `InjectionToken` は、どこにも provide しなくても root の注入器でこの関数の値になります。

このコミットは 4 つのファイルを変えました。トークンの定義（この 14 行）、`private_export.ts` で `ɵPRECOMMIT_HANDLER_SUPPORTED` として出す 1 行、テスト用の `provideFakePlatformNavigation()` に `{provide: PRECOMMIT_HANDLER_SUPPORTED, useValue: true}` を足す 1 行（[第 6 回](06-navx-testing.md)）、Router の `NavigationStateManager` がそれを inject する 1 行です。Router がこの値で何を分けるかは[第 4 回](04-navx-precommit.md)で読みます。偽物の `FakeNavigation` は precommitHandler を常に扱えるので、テストでは `true` に固定されます。

## 7. DEMO：このブラウザの window.navigation と、本物の FakeNavigation を並べる

デモで作る偽物の、作り方と未実装の部分を先に読みます。

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L107–136 （▶ の行: 116, 124, 129, 132–133, 135）

```ts
107 │   private readonly createEventTarget: () => EventTarget;
108 │   private readonly _window: Pick<
109 │     Window,
110 │     'addEventListener' | 'removeEventListener' | 'dispatchEvent'
111 │   >;
112 │   get window(): Pick<Window, 'addEventListener' | 'removeEventListener'> {
113 │     return this._window;
114 │   }
115 │ 
116 ▶   constructor(doc: Document, startURL: `http${string}`) {
117 │     this.createEventTarget = () => {
118 │       try {
119 │         // `document.createElement` because NodeJS `EventTarget` is
120 │         // incompatible with Domino's `Event`. That is, attempting to
121 │         // dispatch an event created by Domino's patched `Event` will
122 │         // throw an error since it is not an instance of a real Node
123 │         // `Event`.
124 ▶         return doc.createElement('div');
125 │       } catch {
126 │         // Fallback to a basic EventTarget if `document.createElement`
127 │         // fails. This can happen with tests that pass in a value for document
128 │         // that is stubbed.
129 ▶         return new EventTarget();
130 │       }
131 │     };
132 ▶     this._window = doc.defaultView ?? this.createEventTarget();
133 ▶     this.eventTarget = this.createEventTarget();
134 │     // First entry.
135 ▶     this.setInitialEntryForTesting(startURL);
136 │   }
```

1. **116 行目：`Document` と開始の URL を受け取る**

   開始の URL の型は `` `http${string}` ``（http で始まる文字列）です。135 行目で、この URL の最初のエントリが 1 件作られます。
2. **124 行目：イベントの宛先は、渡された `Document` で作った `div`**

   コメントは、Node の `EventTarget` と、サーバー用の DOM の実装 Domino の `Event` が噛み合わないので要素を使う、と書いています。`createElement` が失敗する偽の `Document` のときだけ、129 行目で素の `EventTarget` にします。
3. **132 行目：`window` の代わり**

   `doc.defaultView`（その Document の window）があればそれ、無ければ 124 行目の `div` です。偽物は `popstate` と `hashchange` をここに配ります（第 3 回）。2025-12 の 49295778bc1 が、ここをグローバルの `document` ではなく渡された `doc` を使うように直しました。

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L138–159 （▶ の行: 145, 151, 153–155）

```ts
138 │   /**
139 │    * Sets the initial entry.
140 │    */
141 │   setInitialEntryForTesting(
142 │     url: `http${string}`,
143 │     options: {historyState: unknown; state?: unknown} = {historyState: null},
144 │   ): void {
145 ▶     if (!this.canSetInitialEntry) {
146 │       throw new Error(
147 │         'setInitialEntryForTesting can only be called before any ' + 'navigation has occurred',
148 │       );
149 │     }
150 │     const currentInitialEntry = this.entriesArr[0];
151 ▶     this.entriesArr[0] = new FakeNavigationHistoryEntry(this.eventTarget, new URL(url).toString(), {
152 │       index: 0,
153 ▶       key: currentInitialEntry?.key ?? String(this.nextKey++),
154 ▶       id: currentInitialEntry?.id ?? String(this.nextId++),
155 ▶       sameDocument: true,
156 │       historyState: options?.historyState,
157 │       state: options.state,
158 │     });
159 │   }
```

135 行目が呼ぶ `setInitialEntryForTesting` です。151 行目で 0 番目のエントリを作り、153〜154 行目で `key` と `id` に数を数えた文字列（最初は `'0'`）を入れます。155 行目、`sameDocument` は常に `true` です。145 行目、最初の遷移が始まったあとに呼ぶと例外です（`canSetInitialEntry` を `false` にする行は第 2 回）。

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L610–620 （▶ の行: 614, 618–619）

```ts
610 │   set onnavigate(
611 │     // tslint:disable-next-line:no-any
612 │     _handler: ((this: Navigation, ev: NavigateEvent) => any) | null,
613 │   ) {
614 ▶     throw new Error('unimplemented');
615 │   }
616 │ 
617 │   // tslint:disable-next-line:no-any
618 ▶   get onnavigate(): ((this: Navigation, ev: NavigateEvent) => any) | null {
619 ▶     throw new Error('unimplemented');
620 │   }
```

📄 `angular/packages/core/primitives/dom-navigation/testing/fake_navigation.ts` L660–676 （▶ の行: 665, 669–670, 673–674）

```ts
660 │   private _transition: NavigationTransition | null = null;
661 │   /** @internal */
662 │   set transition(t: NavigationTransition | null) {
663 │     this._transition = t;
664 │   }
665 ▶   get transition(): NavigationTransition | null {
666 │     return this._transition;
667 │   }
668 │ 
669 ▶   updateCurrentEntry(_options: NavigationUpdateCurrentEntryOptions): void {
670 ▶     throw new Error('unimplemented');
671 │   }
672 │ 
673 ▶   reload(_options?: NavigationReloadOptions): NavigationResult {
674 ▶     throw new Error('unimplemented');
675 │   }
676 │ }
```

614 行目と 619 行目、`onnavigate` は読むだけで `Error('unimplemented')` を投げます。`oncurrententrychange`・`onnavigatesuccess`・`onnavigateerror` も同じ形です。669〜675 行目、`updateCurrentEntry` と `reload` も未実装です。新しい本家の a8233232f5a はこの 6 つをすべて実装しました。

> **🧪 DEMO — window.navigation（読むだけ）と FakeNavigation の同じ欄**
>
> ボタンを押すと、このページで、配布物（`@angular/core` 22.1.6 の `fesm2022/testing.mjs`）の `FakeNavigation` の範囲を 1 文字も変えずに写したファイル（`navx-fake-navigation.vendor.ts`）を読み込み、`new ɵFakeNavigation(document.implementation.createHTMLDocument(''), location.href)` を 1 つ作って、ブラウザの `window.navigation` と同じ欄を読みます。ブラウザの側は値を読むだけで、navigate もリスナーの登録もしません。このページの URL と履歴は変わりません。`@angular/core/testing` をそのまま読み込まないのは、そのモジュールが読み込み時に `beforeEach` と `afterEach` を登録する行（testing.mjs の 2522〜2523 行目）から TestBed と JIT の部品が引き込まれ、このサイトの最初に読む JS が 60 kB ほど増えるからです。動くコードは同じです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/navx-api-types)

見てほしいところは 4 つです。

- `key` と `id`：ブラウザは UUID のような長い文字列、偽物は 153〜154 行目（`setInitialEntryForTesting`）で数を数えた `'0'` です。
- `entries().length`：ブラウザはこのタブで同じオリジンの履歴が続いている分、偽物は作った直後なので 1 件です。
- `onnavigate を読む`：ブラウザは `null`、偽物は 619 行目の例外です。
- イベントの宛先：`createHTMLDocument('')` の `defaultView` は `null` なので、132 行目で `DIV` になります。偽物の popstate はこのページの `window` には届きません。

**本番ビルドでデモを動かした結果。**ヘッドレスの Chrome（HeadlessChrome/155.0.8043.0）で本番ビルドのこのページを開き、「読む」を 2 回押しました（2026-11-07）。window.navigation は object で、currentEntry の key と id は UUID の形の文字列、index は 0、entries().length は 1、activation は { navigationType: 'push' }、typeof NavigationPrecommitController は 'function' でした。FakeNavigation の側は key・id が '0'、onnavigate を読むと「unimplemented」の例外、イベントの宛先は DIV（doc.defaultView は null）でした。押す前と後で location.href・history.length（2）・navigation.entries().length（1）・navigation.currentEntry.key はどれも同じで、コンソールの警告とエラーは 0 件、外へ出た通信は 0 件です。初めて押したときに読み込まれた JS は 3 つ（798 バイト、FakeNavigation を含む 48.5 KB、@angular/compiler を含む 610 KB）でした。@angular/core/testing の配布物が @angular/compiler から ResourceLoader を import しているので、compiler も一緒に読み込まれます。このページの初期の JS には含まれません。

## ここまでの関係

- `navigation_types.ts` — core/primitives/dom-navigation/src — *declare class / interface だけ。実体なし*
  - `export {type Navigation as ɵNavigation, …}` — core/src/core\_private\_export.ts L8–22 — *@angular/core から ɵ 付きの型として出る*
    - `abstract class PlatformNavigation implements Navigation` — common/src/navigation/platform\_navigation.ts L47
      - `useFactory: () => window.navigation` — 同 L46 — *ブラウザでは本物をそのまま返す*
      - `PRECOMMIT_HANDLER_SUPPORTED` — 同 L28 — *NavigationPrecommitController があるか*
    - `class FakeNavigation implements Navigation` — core/primitives/dom-navigation/testing/fake\_navigation.ts L32 — *@angular/core/testing の ɵFakeNavigation。テストで PlatformNavigation に差し込まれる*
      - `activation: NavigationActivation | null` — 同 L83 — *これだけは lib.dom の全域の型*

## テストと直し方

### spec と、型を試すもの

型の宣言そのものを試す spec はありません。型が壊れると、`fake_navigation.ts` や `platform_navigation.ts` を含む `ts_project` の型検査が通らなくなり、公開 API の一覧 `goldens/public-api/common/index.api.md` とずれれば公開 API の検査が落ちます。振る舞いの spec は偽物の側にあり、`fake_platform_navigation.spec.ts` の 1 ファイルです。

📄 `angular/packages/core/primitives/dom-navigation/testing/test/fake_platform_navigation.spec.ts` L9–29 （▶ の行: 10, 12, 15, 17, 29）

```ts
 9 │ import {
10 ▶   ExperimentalNavigationInterceptOptions,
11 │   FakeNavigateEvent,
12 ▶   FakeNavigation,
13 │   FakeNavigationCurrentEntryChangeEvent,
14 │ } from '../fake_navigation';
15 ▶ import {ensureDocument, timeout} from '@angular/private/testing';
16 │ 
17 ▶ ensureDocument();
18 │ 
19 │ interface Locals {
20 │   navigation: FakeNavigation;
21 │   navigateEvents: FakeNavigateEvent[];
22 │   navigationCurrentEntryChangeEvents: FakeNavigationCurrentEntryChangeEvent[];
23 │   popStateEvents: PopStateEvent[];
24 │   pendingInterceptOptions: ExperimentalNavigationInterceptOptions[];
25 │   nextNavigateEvent: () => Promise<FakeNavigateEvent>;
26 │   setExtraNavigateCallback: (callback: (event: FakeNavigateEvent) => void) => void;
27 │ }
28 │ 
29 ▶ jasmine.DEFAULT_TIMEOUT_INTERVAL = 100;
```

📄 `angular/packages/core/primitives/dom-navigation/testing/test/fake_platform_navigation.spec.ts` L39–58 （▶ の行: 40, 48）

```ts
39 │   beforeEach(() => {
40 ▶     window.addEventListener('popstate', popStateListener);
41 │   });
42 │ 
43 │   afterEach(() => {
44 │     window.removeEventListener('popstate', popStateListener);
45 │   });
46 │ 
47 │   beforeEach(() => {
48 ▶     const navigation = new FakeNavigation(document, 'https://test.com');
49 │     const navigateEvents: FakeNavigateEvent[] = [];
50 │     let nextNavigateEventResolve!: (value: FakeNavigateEvent) => void;
51 │     let nextNavigateEventPromise = new Promise<FakeNavigateEvent>((resolve) => {
52 │       nextNavigateEventResolve = resolve;
53 │     });
54 │     const navigationCurrentEntryChangeEvents: FakeNavigationCurrentEntryChangeEvent[] = [];
55 │     const popStateEvents: PopStateEvent[] = [];
56 │     const pendingInterceptOptions: ExperimentalNavigationInterceptOptions[] = [];
57 │     let extraNavigateCallback: ((event: FakeNavigateEvent) => void) | undefined = undefined;
58 │ 
```

10 行目、spec は偽物のファイルから `ExperimentalNavigationInterceptOptions` などの拡張の型を直接 import しています。17 行目の `ensureDocument()` は、Node で走るときに Domino の `document` を用意する関数です。48 行目、spec は**グローバルの `document`** を渡して偽物を作ります。ブラウザで走る `_web` の spec では、132 行目の `_window` が本物の `window` になるので、40 行目のように `window` に popstate のリスナーを付けて数えています。29 行目、jasmine の待ち時間の上限は 100 ミリ秒です。偽物の traverse は `setTimeout` 1 回分で進むので（第 3 回）、短くて足ります。

### 手元で走らせた結果

../angular（22.2.0-next.7、8576f161ae4）で `pnpm bazel test //packages/core/primitives/dom-navigation/testing/test:test //packages/core/primitives/dom-navigation/testing/test:test_web --nocache_test_results --test_output=all` を走らせ、Node の `:test` は「91 specs, 0 failures」、`:test_web` は Chromium と Firefox でそれぞれ「91 passed, 0 failed」でした（全体 7.0 秒、2026-11-07）。target は `testing/test/BUILD.bazel` の `zoneless_jasmine_test(name = "test")` と `zoneless_web_test_suite(name = "test_web")` です。

### 直すとしたら

- 型を足す・変えるときは `navigation_types.ts` と、`core_private_export.ts` の export（1 節）、`platform_navigation.ts` の抽象メソッド（6 節）の 3 か所が組になります。`PlatformNavigation` の形が変われば `goldens/public-api/common/index.api.md` も更新が要ります。d79b3b65e95 は前の 2 つと偽物と spec を、af26a8c5217（`hasUAVisualTransition`）はそれに加えて golden も変えています。
- lib.dom と見比べるときは、手元の `node_modules/typescript/lib/lib.dom.d.ts` を開くのが早道です。この版の写しに無いもの：`NavigationInterceptOptions.precommitHandler`、`NavigateEvent.sourceElement`、`NavigationPrecommitController.addHandler`、`Navigation.activation`。前の 3 つは新しい本家の a8233232f5a が足しました。
- issue の全体は[第 7 回](07-navx-tests-issues.md)にまとめます。

## 聞かれそうな質問

**Q. Angular で window.navigation を使うには、何を inject すればよいですか？**

`@angular/common` の `PlatformNavigation` です。platform\_navigation.ts 46 行目の factory が `window.navigation` をそのまま返すので、ブラウザでは本物の Navigation オブジェクトが手に入ります。テストでは `provideFakePlatformNavigation()` が `FakeNavigation` に差し替えます。ただし 44 行目のとおり実験的な API で、サーバーで inject すると `window` が無いので例外になります。

**Q. TypeScript 6 には Navigation の型があるのに、なぜ Angular は自分で持っているのですか？**

navigation\_types.ts 9 行目の TODO のとおり、標準の型を公開 API で使う方法がまだ決まっていないからです。公開 API の一覧（goldens/public-api/common/index.api.md）では `PlatformNavigation` が `ɵNavigation` などの写しの型で載っています。その代わり、d79b3b65e95 で名前（`NavigationType`）と `NavigationDestination.key`・`id` の型を lib.dom に揃え、社内の版で import が消えて lib.dom の型で読まれても通るようにしています（fake\_navigation.ts 9・25 行目の印）。

**Q. NavigationHistoryEntry の key と id はどう違いますか？**

`key` は履歴の中の位置で、replace しても引き継がれます。`id` はエントリの中身で、replace のたびに新しくなります。fake\_navigation.ts 85 行目と 88 行目のコメントがこの違いを書いています。`traverseTo` が受け取るのは `key` です（navigation\_types.ts 35 行目）。

**Q. precommitHandler が使えるかどうかは、どう決まりますか？**

`PRECOMMIT_HANDLER_SUPPORTED`（platform\_navigation.ts 28〜34 行目）の factory が、`window.NavigationPrecommitController` の有無で決めます。テストでは `provideFakePlatformNavigation()` が `true` を provide します。型の側では、この版の `NavigationInterceptOptions`（173〜177 行目）には precommitHandler が無く、偽物の拡張の型にあります。

**Q. FakeNavigation に onnavigate を代入できますか？**

できません。fake\_navigation.ts 614 行目の setter は `Error('unimplemented')` を投げます。`addEventListener('navigate', …)` を使います。新しい本家（a8233232f5a）では、4 つの `on…` がすべて実装されています。

## 読み終えて

- Navigation API の型は `core/primitives/dom-navigation/src/navigation_types.ts` に写しとしてあり、`@angular/core` から `ɵ` 付きの型だけの export で出る
- TypeScript 6.0 の lib.dom には同じ型がある。d79b3b65e95 は名前と `key`・`id` の型をそれに揃え、偽物に lib.dom の `activation` を足した
- `PlatformNavigation` はブラウザの `window.navigation` をそのまま返す抽象クラスで、テストで偽物に差し替えるための口
- `PRECOMMIT_HANDLER_SUPPORTED` は `NavigationPrecommitController` の有無。テストでは `true`
- 次回は、偽物の `navigate` が navigate イベントを配って commit するまでを 1 行ずつ追う

---

← 前: [spec と issue を読む：platform-server と @angular/ssr の今](../ssrx/10-ssrx-tests-issues.md)  
次: [FakeNavigation の navigate：navigate イベントを配り、intercept して commit するまで](02-navx-fake-navigate.md) →
