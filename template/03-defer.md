[目次](../README.md) › [テンプレートと DOM](README.md) › 第 3 回 / 全 8 回

# @defer の中身は状態機械

> 8 種類のトリガーと 4 つの状態。on hover に focusin が入っている理由や、スピナーのちらつきを防ぐ 2 つの時間指定を読む。

angular/angular · 読了 約 10 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/defer)

---

読む対象は `packages/core/src/defer/` です。`@defer` がどんな状態を持ち、何をきっかけに動くのかを、型の定義から順に見ていきます。

## 1. 画面の状態は 4 つ

📄 `angular/packages/core/src/defer/interfaces.ts` L173–190 （▶ の行: 180, 183, 186, 189）

```ts
173 │ /**
174 │  * Describes the current state of this defer block instance.
175 │  *
176 │  * @publicApi
177 │  */
178 │ export enum DeferBlockState {
179 │   /** The placeholder block content is rendered */
180 ▶   Placeholder = 0,
181 │ 
182 │   /** The loading block content is rendered */
183 ▶   Loading = 1,
184 │ 
185 │   /** The main content block content is rendered */
186 ▶   Complete = 2,
187 │ 
188 │   /** The error block content is rendered */
189 ▶   Error = 3,
190 │ }
```

テンプレートに書く `@placeholder` が 0、`@loading` が 1、本体が 2、`@error` が 3 です。番号が振られているのは、後で見る命令に**数値として渡される**からです。

> **🧪 DEMO — 状態の移り変わり**
>
> 読み込みが速ければ 1 を飛ばして 0 から 2 へ進むこともあります。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/defer)

## 2. 読み込みの状態は別に持つ

📄 `angular/packages/core/src/defer/interfaces.ts` L54–67 （▶ の行: 56, 59, 62, 65）

```ts
54 │ export enum DeferDependenciesLoadingState {
55 │   /** Initial state, dependency loading is not yet triggered */
56 ▶   NOT_STARTED,
57 │ 
58 │   /** Dependency loading is in progress */
59 ▶   IN_PROGRESS,
60 │ 
61 │   /** Dependency loading has completed successfully */
62 ▶   COMPLETE,
63 │ 
64 │   /** Dependency loading has failed */
65 ▶   FAILED,
66 │ }
67 │ 
```

1 節のものとよく似ていますが、役割が違います。こちらは **「依存の読み込みがどこまで進んだか」**です。

分けている理由は、**同じブロックが画面に複数あっても読み込みは 1 回で済ませたい**からです。リストの中に `@defer` があれば行の数だけブロックができますが、取りに行くファイルは同じです。だからこの状態はテンプレート側 （全インスタンスで共有される側）に置かれます。

## 3. トリガーは 8 種類

📄 `angular/packages/core/src/defer/interfaces.ts` L192–204 （▶ の行: 196, 198–200, 203）

```ts
192 │ /**
193 │  * Represents defer trigger types.
194 │  */
195 │ export const enum DeferBlockTrigger {
196 ▶   Idle,
197 │   Immediate,
198 ▶   Viewport,
199 ▶   Interaction,
200 ▶   Hover,
201 │   Timer,
202 │   When,
203 ▶   Never,
204 │ }
```

| 行 | 書き方 | いつ発火するか |
| --- | --- | --- |
| 196 | `on idle` | ブラウザが暇になったとき。既定値 |
| 197 | `on immediate` | 描画直後にすぐ |
| 198 | `on viewport` | 画面に入ったとき |
| 199 | `on interaction` | クリックまたはキー入力 |
| 200 | `on hover` | マウスが乗った、またはフォーカスが入った |
| 201 | `on timer(1s)` | 指定時間が経過 |
| 202 | `when 式` | 式が真になったとき |
| 203 | `on never` | 発火しない。サーバー描画の制御用 |

## 4. 「操作」と「ホバー」の実体

抽象的に見える 199 行目と 200 行目ですが、実装はイベント名の配列でした。

📄 `angular/packages/core/primitives/defer/src/triggers.ts` L21–29 （▶ の行: 25, 28）

```ts
21 │ /** Currently-registered `viewport` triggers. */
22 │ export const viewportTriggers = new WeakMap<Element, Map<string, DeferEventEntry>>();
23 │ 
24 │ /** Names of the events considered as interaction events. */
25 ▶ export const interactionEventNames = ['click', 'keydown'] as const;
26 │ 
27 │ /** Names of the events considered as hover events. */
28 ▶ export const hoverEventNames = ['mouseenter', 'mouseover', 'focusin'] as const;
29 │ 
```

> [!NOTE]
> **さらに深く**
>
> 28 行目に `focusin` が入っています。マウスを乗せるだけでなく、**キーボードで Tab 移動してフォーカスが当たった場合**も ホバー扱いになるということです。マウスを使わない人でも同じ体験になるようにという配慮が、配列にリテラルとして書かれています。

## 5. 画面に入ったかの判定

📄 `angular/packages/core/src/defer/dom_triggers.ts` L36–56 （▶ の行: 52–53）

```ts
36 │ /**
37 │  * Wrapper for onViewport trigger with angular specific Injector for resolving NgZone instance
38 │  * and creating an IntersectionObserver which can run outside of Angular zone.
39 │  * @param trigger Element that is the trigger.
40 │  * @param callback Callback to be invoked when the trigger comes into the viewport.
41 │  * @param injector Injector that can be used by the trigger to resolve DI tokens.
42 │  */
43 │ export function onViewportWrapper(
44 │   trigger: Element,
45 │   callback: VoidFunction,
46 │   injector: Injector,
47 │   wrapperOptions?: IntersectionObserverInit,
48 │ ) {
49 │   const ngZone = injector.get(NgZone);
50 │   return onViewport(
51 │     trigger,
52 ▶     () => ngZone.run(callback),
53 ▶     (options) => ngZone.runOutsideAngular(() => createIntersectionObserver(options)),
54 │     wrapperOptions,
55 │   );
56 │ }
```

52 行目と 53 行目で zone の使い分けが書かれています。**監視の設置は `runOutsideAngular`、コールバックは `ngZone.run`**。

スクロールのたびに変更検知が走ると重いので、監視自体は Angular の外に置き、実際に画面へ入った瞬間だけ中に戻ります。37 行目からのコメントにも、その意図がそのまま書かれています。

## 6. ちらつきを防ぐ 2 つの時間

📄 `angular/packages/core/src/defer/interfaces.ts` L68–78 （▶ の行: 69, 72, 75）

```ts
68 │ /** Slot index where `minimum` parameter value is stored. */
69 ▶ export const MINIMUM_SLOT = 0;
70 │ 
71 │ /** Slot index where `after` parameter value is stored. */
72 ▶ export const LOADING_AFTER_SLOT = 1;
73 │ 
74 │ /** Configuration object for a loading block as it is stored in the component constants. */
75 ▶ export type DeferredLoadingBlockConfig = [minimumTime: number | null, afterTime: number | null];
76 │ 
77 │ /** Configuration object for a placeholder block as it is stored in the component constants. */
78 │ export type DeferredPlaceholderBlockConfig = [minimumTime: number | null];
```

75 行目の型を見ると、`@loading` の設定が **2 つの数値の組**として保存されることが分かります。それぞれ意味が違います。

| 指定 | 意味 | 防ぎたいこと |
| --- | --- | --- |
| `after` | この時間より早く終わったら読み込み表示を出さない | 一瞬だけスピナーが光って消える |
| `minimum` | 一度出したら最低この時間は表示し続ける | 出た瞬間に消えてガタつく |

> [!TIP]
> **新卒エンジニアへ**
>
> `@loading (after 100ms; minimum 500ms)` と書くと、「100 ミリ秒以内に終わったらスピナーを出さない。出したなら最低 500 ミリ秒は見せる」になります。自分で実装すると面倒な処理が、構文として用意されています。

## 読み終えて

`@defer (on interaction; prefetch on hover)` のように トリガーを 2 つ書けるのは、2 節で見たとおり **読み込みの状態と表示の状態が別々に管理されている**からです。先に取りに行くだけ、あとで表示するだけ、を独立に指定できます。

`@defer` の中でだけ使う依存が、コンパイル時に `import()` へ置き換わる手順は [standalone シリーズの @defer と imports の章](../standalone/11-standalone-defer-deps.md)で読めます。

hydrate トリガー（`hydrate on viewport` など）で、サーバーが描画した中身を後からハイドレートする仕組みは [インクリメンタルハイドレーションの章](../platform/15-incremental-hydration.md)で読めます。

---

← 前: [ng-content のセレクタは CSS ではない](02-projection.md)  
次: [あとからビューを差し込む場所](04-view-container.md) →
