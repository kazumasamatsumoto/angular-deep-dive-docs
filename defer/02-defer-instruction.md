[目次](../README.md) › [@defer とインクリメンタルハイドレーションの内側](README.md) › 第 2 回 / 全 20 回

# ɵɵdefer 命令：最初の creation pass で塊の記録を作る

> ɵɵdefer が最初の creation pass で TDeferBlockDetails を作り、ビューを作るたびに LContainer と LDeferBlockDetails（状態は Initial）を用意し、破棄のときにトリガーを外す登録をするまでの行。引数（各状態のテンプレートの番号・依存の関数・config の番号・flags）がどこから来るか。ɵɵdefer 自身は placeholder を描かず（描くのは後ろのトリガーの命令）、更新のときには呼ばれないこと。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/defer-instruction)

---

`ɵɵdefer` は、コンパイラが `@defer` の塊ごとに 1 回出す命令です。この章では、その引数がテンプレートのどこから来るかを確かめ、関数の中を「最初の 1 回だけすること（TView の側の記録）」と「ビューを作るたびにすること（LContainer と LView の側の記録・後片付けの登録）」に分けて 1 行ずつ読みます。最後に、`ɵɵdefer` 自身は placeholder を描かないことと、2 回目以降の描画では何もしないことを記録で確かめます。

読む対象は `packages/core/src/defer/instructions.ts` の 78〜225 行目と、コンパイラのテストの `deferred_secondary_blocks` です。

1. [1. 全体像](01-defer-overview.md)
2. **2. ɵɵdefer 命令**（この章）
3. [3. 塊の記録](03-defer-details.md)
4. [4. 状態を描く](04-defer-render-state.md)
5. [5. minimum と after](05-defer-minimum-after.md)
6. [6. 依存を読み込む](06-defer-resource-loading.md)
7. [7. トリガーから描画まで](07-defer-trigger-flow.md)
8. [8. when](08-defer-when.md)
9. [9. idle と immediate](09-defer-idle-immediate.md)
10. [10. timer](10-defer-timer.md)
11. [11. interaction と hover](11-defer-dom-triggers.md)
12. [12. viewport](12-defer-viewport.md)
13. [13. prefetch](13-defer-prefetch.md)
14. [14. 入れ子・注入器・クエリ](14-defer-nested-di.md)
15. [15. サーバーでの @defer](15-defer-server.md)
16. [16. hydrate トリガー](16-defer-hydrate-triggers.md)
17. [17. 親から順にハイドレート](17-defer-hydration-queue.md)
18. [18. hydrate のイベント](18-defer-hydrate-events.md)
19. [19. テストを読む](19-defer-tests.md)
20. [20. issue と PR を読む](20-defer-issues.md)

## 1. 引数はテンプレートのスロットの番号

@loading・@placeholder・@error を全部持つ塊をコンパイルした例です。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_deferred/deferred_secondary_blocks.ts` L3–23 （▶ の行: 7, 9, 11, 13）

```ts
 3 │ @Component({
 4 │     template: `
 5 │     <div>
 6 │       {{message}}
 7 ▶       @defer {
 8 │         <button></button>
 9 ▶       } @loading {
10 │         {{loadingMessage}}
11 ▶       } @placeholder {
12 │         <img src="loading.gif">
13 ▶       } @error {
14 │         Calendar failed to load <i>sad</i>
15 │       }
16 │     </div>
17 │   `,
18 │     standalone: false
19 │ })
20 │ export class MyApp {
21 │   message = 'hello';
22 │   loadingMessage = 'Calendar is loading';
23 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_deferred/deferred_secondary_blocks_template.js` L33–53 （▶ の行: 39, 42–44, 47）

```js
33 │ …
34 │ export class MyApp {
35 │   …
36 │   static ɵcmp = /*@__PURE__*/ $r3$.ɵɵdefineComponent({
37 │   …
38 │   template: function MyApp_Template(rf, ctx) {
39 ▶     if (rf & 1) {
40 │       $r3$.ɵɵelementStart(0, "div");
41 │       $r3$.ɵɵtext(1);
42 ▶       $r3$.ɵɵdomTemplate(2, MyApp_Defer_2_Template, 1, 0)(3, MyApp_DeferLoading_3_Template, 1, 1)(4, MyApp_DeferPlaceholder_4_Template, 1, 0)(5, MyApp_DeferError_5_Template, 3, 0);
43 ▶       $r3$.ɵɵdefer(6, 2, null, 3, 4, 5);
44 ▶       $r3$.ɵɵdeferOnIdle();
45 │       $r3$.ɵɵelementEnd();
46 │     }
47 ▶     if (rf & 2) {
48 │       $r3$.ɵɵadvance();
49 │       $r3$.ɵɵtextInterpolate1(" ", ctx.message, " ");
50 │     }
51 │   },
52 │   …
53 │ });
```

42 行目で、4 つのブロックがスロット 2・3・4・5 のテンプレートになります（`ɵɵdomTemplate(2, …)(3, …)` は同じ命令を続けて呼ぶ書き方です）。43 行目の `ɵɵdefer(6, 2, null, 3, 4, 5)` は、その番号を並べただけです。引数の意味は関数の説明に書いてあります。

📄 `angular/packages/core/src/defer/instructions.ts` L104–124 （▶ の行: 107–113, 115, 117, 119）

```ts
104 │ /**
105 │  * Creates runtime data structures for defer blocks.
106 │  *
107 ▶  * @param index Index of the `defer` instruction.
108 ▶  * @param primaryTmplIndex Index of the template with the primary block content.
109 ▶  * @param dependencyResolverFn Function that contains dependencies for this defer block.
110 ▶  * @param loadingTmplIndex Index of the template with the loading block content.
111 ▶  * @param placeholderTmplIndex Index of the template with the placeholder block content.
112 ▶  * @param errorTmplIndex Index of the template with the error block content.
113 ▶  * @param loadingConfigIndex Index in the constants array of the configuration of the loading.
114 │  *     block.
115 ▶  * @param placeholderConfigIndex Index in the constants array of the configuration of the
116 │  *     placeholder block.
117 ▶  * @param enableTimerScheduling Function that enables timer-related scheduling if `after`
118 │  *     or `minimum` parameters are setup on the `@loading` or `@placeholder` blocks.
119 ▶  * @param flags A set of flags to define a particular behavior (e.g. to indicate that
120 │  *              hydrate triggers are present and regular triggers should be deactivated
121 │  *              in certain scenarios).
122 │  *
123 │  * @codeGenApi
124 │  */
```

| 引数（説明の行） | 例の値 | どこから来るか |
| --- | --- | --- |
| `index`（107） | 6 | 塊そのもののスロット。ここに LContainer ができ、次の 7 に記録が入る |
| `primaryTmplIndex`（108） | 2 | 本体（`@defer { … }`）のテンプレートのスロット |
| `dependencyResolverFn`（109） | null | 依存を `import()` する関数。この例の `<button>` は依存ではないので null（[standalone-defer-deps の章](../standalone/11-standalone-defer-deps.md)） |
| `loadingTmplIndex`・`placeholderTmplIndex`・`errorTmplIndex`（110〜112） | 3・4・5 | 各ブロックのテンプレートのスロット。ブロックが無ければ引数ごと省かれる |
| `loadingConfigIndex`・`placeholderConfigIndex`（113〜116） | （無し） | `minimum`・`after` を書いたときだけ。コンポーネントの定数の配列の番号（[第 5 回](05-defer-minimum-after.md)） |
| `enableTimerScheduling`（117〜118） | （無し） | 同じく `minimum`・`after` のときだけ、関数 `ɵɵdeferEnableTimerScheduling` そのものが渡る（第 5 回） |
| `flags`（119〜121） | （無し） | hydrate トリガーがあるときの印（[第 16 回](16-defer-hydrate-triggers.md)） |

39 行目と 47 行目のとおり、`ɵɵdefer` とトリガーの `ɵɵdeferOnIdle`（44 行目）は `rf & 1`（ビューを作るとき）の側にあり、`rf & 2`（更新のとき）には出てきません。つまり **`ɵɵdefer` はビューを作るたびに 1 回だけ呼ばれ、変更検知のたびには呼ばれません**。

## 2. 前半：スロットの準備と、開発モードの知らせ

📄 `angular/packages/core/src/defer/instructions.ts` L137–155 （▶ の行: 139–141, 143–145, 148–149, 151–152）

```ts
137 │   const lView = getLView();
138 │   const tView = getTView();
139 ▶   const adjustedIndex = index + HEADER_OFFSET;
140 ▶   const tNode = declareNoDirectiveHostTemplate(lView, tView, index, null, 0, 0);
141 ▶   const injector = lView[INJECTOR];
142 │ 
143 ▶   const incrementalHydrationEnabled = isIncrementalHydrationEnabled(injector);
144 ▶   if (tView.firstCreatePass) {
145 ▶     performanceMarkFeature('NgDefer');
146 │ 
147 │     if (ngDevMode) {
148 ▶       if (typeof ngHmrMode !== 'undefined' && ngHmrMode) {
149 ▶         logHmrWarning(injector);
150 │       }
151 ▶       if (hasHydrateTriggers(flags) && !incrementalHydrationEnabled) {
152 ▶         warnIncrementalHydrationNotConfigured();
153 │       }
154 │     }
155 │ 
```

1. **139 行目：`index + HEADER_OFFSET`**

   LView の先頭には、どのビューにもある決まった欄（親・注入器・フラグなど）が `HEADER_OFFSET` 個並び、テンプレートのスロットはその後ろから始まります（[ivy-lview の章](../ivy/06-ivy-lview.md)）。コンパイラが出す番号（例の 6）は「テンプレートのスロットの中での番号」なので、配列の本当の位置にするためにこれを足します。
2. **140 行目：`declareNoDirectiveHostTemplate(lView, tView, index, null, 0, 0)` で LContainer を作る**

   `render3/instructions/template.ts` の関数で、最初の 1 回は TView に Container の TNode を作り、毎回このスロットに LContainer を作ります。`@if` の碇（`ɵɵtemplate`）と同じ道ですが、テンプレートの関数は `null`、スロットの数（`decls`・`vars`）は 0 です。**塊のスロットの LContainer 自身は中身を持たず、状態ごとのテンプレート（例の 2〜5）のビューを入れる箱になる**からです（中身の入れ方は [第 4 回](04-defer-render-state.md)、LContainer の作り方は [ivy-lcontainer の章](../ivy/11-ivy-lcontainer.md)）。
3. **141・143 行目：注入器と、インクリメンタルハイドレーションが有効か**

   143 行目の `isIncrementalHydrationEnabled` は、注入器から有効かどうかの印を読む関数です（[incremental-hydration の章](../platform/15-incremental-hydration.md)）。ここで読んでおき、後半の登録簿（7 節）で使います。
4. **144 行目：`tView.firstCreatePass` のときだけ**

   `firstCreatePass` は「この TView で初めてビューを作っている」という印です（[ivy-first-create-pass の章](../ivy/08-ivy-first-create-pass.md)）。同じテンプレートの 2 つ目以降のビューを作るときは false なので、144 行目の if の中（4 節で見る 172 行目まで）は丸ごと飛ばされます。145 行目の `performanceMarkFeature('NgDefer')` は「このアプリは @defer を使っている」という印を performance のマークに残すもので、1 回だけ意味があります。
5. **148〜149 行目：HMR のときの知らせ（3 節）**
6. **151〜152 行目：hydrate トリガーがあるのにインクリメンタルハイドレーションが無効なら警告**

   `flags` に hydrate トリガーの印があり、143 行目の値が false なら、`warnIncrementalHydrationNotConfigured` が 1 回だけ `console.warn` します。この確かめは 5fce27d63f7（#61741、2025-05-28）で、サーバーの印（SSR の id）があるときだけの場所からここへ移され、サーバーの描画でも行われるようになりました。いまの警告の形にしたのは dd2f53b9cd0（#64185）です。

## 3. HMR のときは「依存がすべて eager」と 1 回だけ知らせる

📄 `angular/packages/core/src/defer/instructions.ts` L78–102 （▶ の行: 82, 89–91, 93, 95）

```ts
 78 │ /**
 79 │  * Indicates whether we've already produced a warning,
 80 │  * prevents the logic from producing it multiple times.
 81 │  */
 82 ▶ let _hmrWarningProduced = false;
 83 │ 
 84 │ /**
 85 │  * Logs a message into the console to indicate that `@defer` block
 86 │  * dependencies are loaded eagerly when the HMR mode is enabled.
 87 │  */
 88 │ function logHmrWarning(injector: Injector) {
 89 ▶   if (!_hmrWarningProduced) {
 90 ▶     _hmrWarningProduced = true;
 91 ▶     const console = injector.get(Console);
 92 │     // tslint:disable-next-line:no-console
 93 ▶     console.log(
 94 │       formatRuntimeError(
 95 ▶         RuntimeErrorCode.DEFER_IN_HMR_MODE,
 96 │         'Angular has detected that this application contains `@defer` blocks ' +
 97 │           'and the hot module replacement (HMR) mode is enabled. All `@defer` ' +
 98 │           'block dependencies will be loaded eagerly.',
 99 │       ),
100 │     );
101 │   }
102 │ }
```

82 行目の `_hmrWarningProduced` はモジュールの変数なので、89〜90 行目で 1 回知らせたら、ページを読み込み直すまで二度と出ません。91 行目は `console` を直接使わず、注入器から `Console`（core の内部のクラス）を取ります。テストではこれを差し替えて知らせを数えます（テストと直し方の節）。95 行目の `DEFER_IN_HMR_MODE` はエラーコード NG0751 です。

「依存が eager になる」のはこの関数のせいではありません。HMR を有効にすると、コンパイラが塊の依存を `import()` にしないからです（[standalone-defer-deps の章](../standalone/11-standalone-defer-deps.md)の `canDeferDeps`）。実行時の `ɵɵdefer` は、それを開発者に知らせるだけです。

## 4. TView の側の記録を作る（最初の 1 回だけ）

144 行目の if の中で `TDeferBlockDetails` のオブジェクトを作ります。前半の、引数をそのまま入れる行は [standalone-defer-deps の章](../standalone/11-standalone-defer-deps.md)で引用しているので、ここでは残りを見ます。

📄 `angular/packages/core/src/defer/instructions.ts` L166–172 （▶ の行: 166–169, 171–172）

```ts
166 ▶       providers: null,
167 ▶       hydrateTriggers: null,
168 ▶       debug: null,
169 ▶       flags: flags ?? TDeferDetailsFlags.Default,
170 │     };
171 ▶     enableTimerScheduling?.(tView, tDetails, placeholderConfigIndex, loadingConfigIndex);
172 ▶     setTDeferBlockDetails(tView, adjustedIndex, tDetails);
```

1. **166〜168 行目：`providers`・`hydrateTriggers`・`debug` は null で始まる**

   `providers` は依存を読み込んだあとに（[第 6 回](06-defer-resource-loading.md)）、`hydrateTriggers` は hydrate トリガーの命令が（[第 16 回](16-defer-hydrate-triggers.md)）、`debug` は開発モードのトリガーの命令が（[第 3 回](03-defer-details.md)）あとから埋めます。直前の行では、`loadingState` は `NOT_STARTED`、`loadingPromise` は null です。
2. **169 行目：`flags` が無ければ `Default`（0）**
3. **171 行目：`minimum`・`after` があるときだけ設定を読む**

   `enableTimerScheduling?.(…)` は省略可能な呼び出しです。関数が渡っていなければ何もしません。渡っていれば、定数の配列から設定を読んで `placeholderBlockConfig`・`loadingBlockConfig` に入れます（[第 5 回](05-defer-minimum-after.md)）。タイマーの処理を「使うアプリにだけ入れる」ための形です。
4. **172 行目：`TView.data[index + 1]` に置く**

   `setTDeferBlockDetails` は渡された番号に 1 を足したスロットに入れます（[第 1 回](01-defer-overview.md)の `getDeferBlockDataIndex`）。

## 5. LContainer を受け取り、脱水されたビューを探す

ここからは `firstCreatePass` の if の外なので、**ビューを作るたびに**動きます。まず 140 行目が作った LContainer をスロットから取り、`populateDehydratedViewsInLContainer` で、ハイドレーションの最中ならサーバーの DOM から「脱水されたビュー」を探して LContainer に付けます。続けて、そのビューの印からサーバーでの塊の id（`SSR_UNIQUE_ID`）と状態（`SSR_BLOCK_STATE`）を読みます。ブラウザだけで描くときは、どちらも null のままです。ここは [incremental-hydration の章](../platform/15-incremental-hydration.md)で引用しているので、そちらで行を見てください（脱水されたビューの使い方は [第 4 回](04-defer-render-state.md)）。

## 6. LView の側の記録を作る（ビューを作るたびに）

📄 `angular/packages/core/src/defer/instructions.ts` L190–196 （▶ の行: 191, 193）

```ts
190 │   // Init instance-specific defer details and store it.
191 ▶   const lDetails: LDeferBlockDetails = [
192 │     null, // NEXT_DEFER_BLOCK_STATE
193 ▶     DeferBlockInternalState.Initial, // DEFER_BLOCK_STATE
194 │     null, // STATE_IS_FROZEN_UNTIL
195 │     null, // LOADING_AFTER_CLEANUP_FN
196 │     null, // TRIGGER_CLEANUP_FNS
```

191 行目からの配列が `LDeferBlockDetails` です。欄は 10 個で、各行のコメントが欄の名前です。**193 行目、状態の欄（`DEFER_BLOCK_STATE`）は `DeferBlockInternalState.Initial`（-1）で始まります**。まだ何も描いていない、という意味です。残りの欄は 5 節の SSR の 2 つを除いて null で、配列のすぐ後の `setLDeferBlockDetails` が `LView[index + 1]` に置きます（続きの行は incremental-hydration の章の引用、欄の意味は [第 3 回](03-defer-details.md)）。その次は、SSR の id があり、インクリメンタルハイドレーションが有効なときだけ、塊を登録簿（`DEHYDRATED_BLOCK_REGISTRY`）に入れる行です（[第 17 回](17-defer-hydration-queue.md)）。

## 7. 後片付けを 2 か所に登録して終わる

📄 `angular/packages/core/src/defer/instructions.ts` L212–225 （▶ の行: 213–214, 216, 221–222, 224）

```ts
212 │ 
213 ▶   const onLViewDestroy = () => {
214 ▶     invokeAllTriggerCleanupFns(lDetails);
215 │     if (ssrUniqueId !== null) {
216 ▶       registry?.cleanup([ssrUniqueId]);
217 │     }
218 │   };
219 │ 
220 │   // When defer block is triggered - unsubscribe from LView destroy cleanup.
221 ▶   storeTriggerCleanupFn(TriggerType.Regular, lDetails, () =>
222 ▶     removeLViewOnDestroy(lView, onLViewDestroy),
223 │   );
224 ▶   storeLViewOnDestroy(lView, onLViewDestroy);
225 │ }
```

1. **213〜218 行目：ビューが壊れたときの関数**

   214 行目で、この塊に付いているトリガー（イベントの購読・タイマー・IntersectionObserver）を全部外します。216 行目で、登録簿に入れていれば外します。トリガーが発火する前に塊のあるビューが消えても、リスナーやタイマーが残らないようにするためです。
2. **224 行目：それを LView の破棄の時に呼ぶよう登録する**

   `storeLViewOnDestroy` は、LView が壊れるときに呼ぶ関数の一覧に足します（[ivy-destroy の章](../ivy/17-ivy-destroy.md)）。
3. **221〜223 行目：「発火したら、224 行目の登録を取り消す」関数を、トリガーの後片付けとして貯める**

   `storeTriggerCleanupFn(TriggerType.Regular, …)` は、LView の側の記録の `TRIGGER_CLEANUP_FNS` に関数を足します（`cleanup.ts`）。トリガーが発火すると、`triggerDeferBlock` がこの欄の関数を全部呼ぶので（[第 7 回](07-defer-trigger-flow.md)）、そのとき 224 行目の登録も外れます。発火したあとは外すトリガーが無いので、破棄のときの関数も要らないからです。[第 1 回](01-defer-overview.md)のデモで、どの塊にも `TRIGGER_CLEANUP_FNS` が最低 1 つあったのは、この関数です。

> [!NOTE]
> **ポイント**
>
> `ɵɵdefer` はここで終わり、**placeholder を描いていません**。状態は `Initial` のままです。placeholder を描くのは、すぐ後ろに並ぶトリガーの命令です。`ɵɵdeferOnIdle`・`ɵɵdeferOnInteraction` などは作成のときに `renderPlaceholder` を呼び、`ɵɵdeferWhen` は更新のときに値が false なら呼びます（[第 7 回](07-defer-trigger-flow.md)・[第 8 回](08-defer-when.md)）。`renderPlaceholder` の中身は [第 4 回](04-defer-render-state.md)で読みます。

## 8. DEMO：@for の中の塊を 3 つ、4 つと描く（記録の再生）

> **🧪 DEMO — TView の側は 1 つ、LView の側は描いた数（記録の再生）**
>
> これは記録です。本物の @angular/core 22.1.6（開発モード・JIT）を Node で、domino の DOM の上で動かした結果です。テンプレートは `@for (item of items(); track item) { @defer (when open()) { … } @placeholder { … } }` の 1 つだけです。記録のスクリプトが `ɵgetDeferBlocks` の生の結果を使って、オブジェクトが同じもの（`===`）かを比べています。JIT では本来の「依存を読み込む関数」が null なので、`ɵDEFER_BLOCK_DEPENDENCY_INTERCEPTOR` で「20ms 後に解決する Promise を返す関数」に差し替え、呼ばれた回数を数えています。共通の部品（`harness.ts`・`build.mjs`）の全文は [第 1 回](01-defer-overview.md)にあります。
>
> 「次の段へ」か段のボタンを押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/defer-instruction)

記録から読み取れることです。

1. **段 1：塊は 3 つ、TNode・TView・tDetails は 1 つ、lDetails と LView は 3 つ**

   3 つの塊の `index` がすべて同じ（29）なのは、どれも同じ TView（`@for` の 1 行ぶんのテンプレート）の同じスロットだからです。値は 22.1.6 の `HEADER_OFFSET` の 27 を含みます。4 節の `firstCreatePass` の中身は `@for` の 1 つ目の行（a）のビューを作ったときだけ動き、b と c の行では 6 節の LView の側だけが作られた、ということです。
2. **段 2：`appRef.tick()` をしても何も作り直されない**

   1 節のとおり `ɵɵdefer` は更新のときには呼ばれないので、lDetails も同じオブジェクトのままです。
3. **段 3：行を足すと、lDetails だけが 1 つ増える**

   新しい行のビューを作るときに `ɵɵdefer` がもう 1 回呼ばれますが、`firstCreatePass` はもう false なので、tDetails は起動のときと同じオブジェクトです。
4. **段 4〜5：塊が 4 つあっても、依存を読み込む関数は 1 回**

   4 つの塊がそれぞれ発火しても、`loadingState` は共有の tDetails の 1 つの欄なので、2 つ目からは「もう読み込み中」として同じ Promise を待ちます（[第 6 回](06-defer-resource-loading.md)）。読み込み中の段 4 で状態が Placeholder のままなのは、この塊に @loading が無いからです（[第 4 回](04-defer-render-state.md)）。
5. **HMR の記録：塊が 3 つでも NG0751 は 1 回**

   3 節の 82・89〜90 行目のとおりです。もう 1 行の「Angular is running in development mode.」は Angular が起動のときに出す別の知らせです。

📄 `scratchpad の記録スクリプト（a/instruction.ts。共通の build.mjs で束ねて node で実行）`

```
// defer-instruction の記録: @for の中に @defer を 1 つ書き、3 行描く。
// (1) blocks() が返す塊の数（LView ごと）と、tDetails が同じオブジェクトか（TView の側は 1 つ）
// (2) もう一度変更検知をしても tDetails・lDetails が作り直されないこと
// (3) 行を 1 つ足すと lDetails だけが 1 つ増え、tDetails は同じオブジェクトのままであること
// (3') when を true にすると、4 つの塊があっても依存を読み込む関数は 1 回しか呼ばれないこと
// (4) ngHmrMode = true のとき、塊が 3 つあっても HMR の知らせは 1 回だけ（logHmrWarning）
// 使い方: node ../_shared/build.mjs instruction.ts instruction.mjs && node instruction.mjs instruction.json
import {
  Component, signal, ɵgetDeferBlocks as getDeferBlocks,
  ɵDEFER_BLOCK_DEPENDENCY_INTERCEPTOR as DEFER_BLOCK_DEPENDENCY_INTERCEPTOR,
} from '@angular/core';
import { installDom, bootBrowser, blocks, text, tick, writeJson, clone } from '../_shared/harness';

// 依存を読み込む関数を数えるための差し替え（JIT では本来の関数が null なので、20ms 後に解決する Promise を返す）
let intercepted = 0;
const interceptor = {
  intercept() {
    intercepted++;
    return () => [new Promise((resolve) => setTimeout(() => resolve(class {}), 20))];
  },
  setInterceptor() {},
};

@Component({
  selector: 'app-root',
  template: `
    @for (item of items(); track item) {
      @defer (when open()) { <b>{{ item }}:main</b> } @placeholder { <i>{{ item }}:placeholder</i> }
    }
  `,
})
class Root {
  items = signal(['a', 'b', 'c']);
  open = signal(false);
}

/** ɵgetDeferBlocks の生の結果（オブジェクトの同一性を比べるため、写す前のもの） */
function raw(ref: any) {
  const out: any[] = [];
  getDeferBlocks((ref.hostView as any)._lView, out);
  return out;
}

/** blocks() の写し。debug.triggers は Set なので、JSON にする前に配列に直す */
function view(ref: any) {
  return clone(
    blocks(ref).map((b: any) => ({
      ...b,
      tDetails: { ...b.tDetails, debug: b.tDetails.debug?.triggers ? [...b.tDetails.debug.triggers] : null },
    })),
  );
}

const rec: any = { steps: [] };
installDom();
const { appRef, ref } = await bootBrowser(Root, {
  providers: [{ provide: DEFER_BLOCK_DEPENDENCY_INTERCEPTOR, useValue: interceptor }],
});

const first = raw(ref);
const t0 = first[0].tDetails;
const l0 = first.map((b) => b.lView[b.tNode.index + 1]);
rec.steps.push({
  step: '起動（3 行）',
  text: text(ref),
  count: first.length,
  sameTDetails: first.every((b) => b.tDetails === t0),
  sameTNode: first.every((b) => b.tNode === first[0].tNode),
  sameTView: first.every((b) => b.lView[1] === first[0].lView[1]),
  distinctLDetails: new Set(l0).size,
  distinctLView: new Set(first.map((b) => b.lView)).size,
  blocks: view(ref),
});

appRef.tick();
const again = raw(ref);
rec.steps.push({
  step: 'appRef.tick() をもう一度',
  text: text(ref),
  count: again.length,
  sameTDetailsAsBefore: again.every((b) => b.tDetails === t0),
  sameLDetailsAsBefore: again.every((b, i) => b.lView[b.tNode.index + 1] === l0[i]),
});

(ref.instance as Root).items.update((v) => [...v, 'd']);
await appRef.whenStable();
const added = raw(ref);
rec.steps.push({
  step: "items に 'd' を足した",
  text: text(ref),
  count: added.length,
  sameTDetailsAsBefore: added.every((b) => b.tDetails === t0),
  oldLDetailsKept: l0.every((l, i) => added[i].lView[added[i].tNode.index + 1] === l),
  distinctLDetails: new Set(added.map((b) => b.lView[b.tNode.index + 1])).size,
  blocks: view(ref),
});

(ref.instance as Root).open.set(true);
await tick(5);
rec.steps.push({
  step: 'open.set(true) から 5ms（読み込み中）',
  text: text(ref),
  count: raw(ref).length,
  intercepted,
  loadingState: blocks(ref).map((b: any) => b.tDetails.loadingState),
  states: blocks(ref).map((b: any) => b.lDetails.DEFER_BLOCK_STATE),
});
await appRef.whenStable();
await tick(20); // 本体のビューの {{ item }} が更新される変更検知を待つ
await appRef.whenStable();
rec.steps.push({
  step: '読み込みが終わったあと',
  text: text(ref),
  count: raw(ref).length,
  intercepted,
  loadingState: blocks(ref).map((b: any) => b.tDetails.loadingState),
  states: blocks(ref).map((b: any) => b.lDetails.DEFER_BLOCK_STATE),
});
appRef.destroy();

// (4) HMR のときの知らせ。console.log を一時的に包んで数える（Angular の Console は console.log を呼ぶ）
const logs: string[] = [];
const origLog = console.log;
console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
(globalThis as any).ngHmrMode = true;
@Component({
  selector: 'app-hmr',
  template: `@defer (when true) { 1 } @defer (on immediate) { 2 } @defer (when true) { 3 }`,
})
class HmrRoot {}
// 同じ document に 2 つ目のアプリの置き場を足す（プラットフォームは 1 つ目と同じ）
document.body.appendChild(document.createElement('app-hmr'));
const hmr = await bootBrowser(HmrRoot);
await tick(10);
console.log = origLog;
(globalThis as any).ngHmrMode = undefined;
rec.hmr = {
  messages: logs.filter((l) => l.includes('NG0751') || l.includes('hot module replacement')),
  allLogs: logs,
  text: text(hmr.ref),
};

await writeJson(process.argv[2] ?? '/dev/stdout', rec);
process.exit(0);

```

## ここまでの呼び出し

- 👤 `@defer (…) { … } @loading … @placeholder … @error …` — あなたのテンプレート
  - `ɵɵdomTemplate(2, …)(3, …)(4, …)(5, …)` — コンパイラの出力 — *状態ごとのテンプレート*
  - `ɵɵdefer(6, 2, null, 3, 4, 5)` — defer/instructions.ts
    - `declareNoDirectiveHostTemplate(lView, tView, index, null, 0, 0)` — render3/instructions/template.ts — *塊のスロットに LContainer*
    - `logHmrWarning(injector)` — L88 — *firstCreatePass・開発モード・HMR のときだけ*
    - `enableTimerScheduling?.(…)` → `setTDeferBlockDetails(tView, …)` — L171–172 — *firstCreatePass のときだけ。TView.data\[index + 1\]*
    - `populateDehydratedViewsInLContainer(lContainer, tNode, lView)` — linker/view\_container\_ref.ts — *ハイドレーションのときだけ意味がある*
    - `setLDeferBlockDetails(lView, …)` — defer/utils.ts — *状態は Initial。LView\[index + 1\]*
    - `storeTriggerCleanupFn(Regular, …)` と `storeLViewOnDestroy(lView, …)` — L221–224
  - `ɵɵdeferOnIdle()` など — defer/instructions.ts — *ここで初めて placeholder を描く（第 7 回）*

## テストと直し方

### spec：HMR の知らせ

📄 `angular/packages/core/test/acceptance/defer_spec.ts` L603–643 （▶ の行: 604, 611, 615, 618, 621, 630, 642–643）

```ts
603 │     beforeEach(() => {
604 ▶       globalThis['ngHmrMode'] = true;
605 │     });
606 │ 
607 │     afterEach(() => {
608 │       globalThis['ngHmrMode'] = undefined;
609 │     });
610 │ 
611 ▶     it('should produce a message into a console about eagerly loaded deps', async () => {
612 │       @Component({
613 │         selector: 'simple-app',
614 │         template: `
615 ▶           @defer (when true) {
616 │             Defer block #1
617 │           }
618 ▶           @defer (on immediate) {
619 │             Defer block #2
620 │           }
621 ▶           @defer (when true) {
622 │             Defer block #3
623 │           }
624 │         `,
625 │ 
626 │         changeDetection: ChangeDetectionStrategy.Eager,
627 │       })
628 │       class MyCmp {}
629 │ 
630 ▶       TestBed.configureTestingModule({providers: [withDebugConsole()]});
631 │       const fixture = TestBed.createComponent(MyCmp);
632 │       fixture.detectChanges();
633 │ 
634 │       // Wait for all async actions to complete.
635 │       await allPendingDynamicImports();
636 │       fixture.detectChanges();
637 │ 
638 │       // Make sure that the HMR message is present in the console and there is
639 │       // only a single instance of a message.
640 │       const console = TestBed.inject(Console) as DebugConsole;
641 │       const errorCode = formatRuntimeErrorCode(RuntimeErrorCode.DEFER_IN_HMR_MODE);
642 ▶       const hmrMessages = console.logs.filter((log) => log.indexOf(errorCode) > -1);
643 ▶       expect(hmrMessages.length).withContext('HMR message should be present once').toBe(1);
```

`describe('with HMR')` は、604 行目で `globalThis['ngHmrMode']` を true にしてから、塊を 3 つ持つコンポーネントを描きます。630 行目の `withDebugConsole()` は、3 節の 91 行目が取る `Console` を、知らせを配列に貯めるクラスに差し替えるものです（このファイルの先頭で定義されています）。642〜643 行目で NG0751 の行がちょうど 1 回であることを確かめます。もう 1 つの it は「塊が無ければ 0 回」です。この 2 本は `logHmrWarning` を足した 152261cd343（#60533、2025-03-23）と一緒に入りました。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
  '--test_arg=--filter=^@defer with HMR'
```

📄 `出力（2026-11-06 に実行。抜粋。ログは scratchpad/defer-logs/a-instruction.log）`

```
Ran 2 of 2693 specs
2 specs, 0 failures
Finished in 0.099 seconds
INFO: Elapsed time: 2.398s, Critical Path: 1.55s
//packages/core/test/acceptance:acceptance          PASSED in 1.4s
```

先頭の 4 本（`should transition between placeholder…` など）と `directive matching` を合わせた 7 本の結果は [第 1 回](01-defer-overview.md)にあります。

### 直すとしたら

- **「同じ塊なのに設定が反映されない」「2 つ目のインスタンスだけおかしい」は、4 節と 6 節の境目を疑います。** TView の側に置くべき値を LView の側に置く（またはその逆）と、`@for` の 2 つ目以降の行だけが違う動きになります。spec は `defer_spec.ts` に `@for` で複数描く it を足し、記録のスクリプトでは上のデモと同じく `===` で比べると確かめられます。
- **「ビューを壊したのにトリガーが残る」は 7 節です。** 214 行目の `invokeAllTriggerCleanupFns` が外すのは LView の側の記録に貯まった関数だけなので、トリガーの命令が後片付けを貯め忘れると漏れます。各トリガーの「破棄したら外れる」spec（`should unbind the trigger events when the deferred block is destroyed` など）は [第 11 回](11-defer-dom-triggers.md)で読みます。
- **HMR の知らせの不具合は `logHmrWarning` と、上の `describe('with HMR')` です。** HMR と NgModule と @defer を組み合わせると NG0919 が出るという #68123 は、2026-04-10 に閉じられました。担当者は「HMR では defer の塊を eager に読み込むしかない」と答えていて、実行時のこの章の行ではなく、コンパイラが依存を eager にすることとの組み合わせの話です（[第 20 回](20-defer-issues.md)）。
- 本家に PR を出すことは勧めません。手元で spec を走らせ、記録のスクリプトで同じテンプレートを描いて、どちらの記録がおかしいかを確かめるところまでにします。

## 聞かれそうな質問

**Q. `ɵɵdefer` は変更検知のたびに呼ばれますか？**

呼ばれません。deferred\_secondary\_blocks\_template.js の 39〜46 行目のとおり、`ɵɵdefer` は `rf & 1`（ビューを作るとき）の側にだけあります。デモの段 2 で `appRef.tick()` をしても、lDetails は同じオブジェクトのままでした。

**Q. `@for` で 100 個描いたら、TDeferBlockDetails も 100 個できますか？**

1 個です。144 行目の `tView.firstCreatePass` の中で作るので、同じ TView の 2 つ目以降のビューでは作られません。LView の側（191 行目）はビューごとに作られるので 100 個です。

**Q. `ɵɵdefer` を呼んだ直後の塊は、何を描いていますか？**

何も描いていません。193 行目のとおり状態は `Initial`（-1）で、placeholder を描くのは後ろに並ぶトリガーの命令です。@placeholder が無い塊は、トリガーが発火するまで `Initial` のままです（[第 3 回](03-defer-details.md)のデモ）。

**Q. 開発中（ng serve）に @defer の中身がすぐ読み込まれてしまいます。**

HMR が有効だと、コンパイラが依存を `import()` にせず eager にします。実行時はそれを 93 行目の `console.log`（NG0751）で 1 回だけ知らせます（148〜149 行目）。本番ビルドや HMR を切った `ng serve` では起きません。

**Q. 塊のあるビューが、トリガーが発火する前に消えたらどうなりますか？**

224 行目で登録した関数が LView の破棄のときに呼ばれ、214 行目でトリガー（リスナー・タイマーなど）が全部外れます。発火したあとに消えた場合は、221〜223 行目の関数で 224 行目の登録はすでに取り消されています。

## 読み終えて

- `ɵɵdefer` の引数は、塊と各状態のテンプレートのスロットの番号・依存の関数・設定の番号・flags で、コンパイラがテンプレートから並べる。
- 最初の 1 回（`firstCreatePass`）だけ TView の側の記録を作り、ビューを作るたびに LContainer と LView の側の記録（状態は `Initial`）を作る。
- 最後に「ビューが壊れたらトリガーを外す」を登録し、それ自体も「発火したら取り消す」としてトリガーの後片付けに入れる。
- `ɵɵdefer` は placeholder を描かず、更新のときには呼ばれない。描くのはトリガーの命令。

---

← 前: [@defer の全体像：命令・記録・状態・トリガー](01-defer-overview.md)  
次: [塊の記録：TDeferBlockDetails と LDeferBlockDetails の欄](03-defer-details.md) →
