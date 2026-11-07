[目次](../README.md) › [アニメーションの内側](README.md) › 第 3 回 / 全 20 回

# 命令がすること：LView の ANIMATIONS に「あとで走らせる関数」を登録する

> ɵɵanimateEnter と ɵɵanimateLeave が、サーバーでの実行・getAnimations の無い環境・ANIMATIONS\_DISABLED で早く戻る行、NgZone をその場で取っておく理由、addAnimationToLView が LView の ANIMATIONS（enter / leave の Map）に TNode の index ごとに関数を積む仕組み。この時点ではまだ何も動かないこと。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/animations-instructions)

---

[第 2 回](02-animations-compile.md)で、`<p animate.enter="fade-in">` が作成ブロックの `ɵɵanimateEnter("fade-in")` になるのを見ました。この章では、その命令が呼ばれたときに**実際に何をするか**を 1 行ずつ読みます。結論は「LView の `ANIMATIONS` という枠に、あとで走らせる関数を TNode の index ごとに積むだけ。この時点ではクラスも付かないし、何も動かない」です。

読む対象は `packages/core/src/render3/instructions/animation.ts` の `ɵɵanimateEnter`（58〜92 行目）と `ɵɵanimateLeave`（249〜278 行目）、`packages/core/src/animation/interfaces.ts` と `utils.ts` の一部、`render3/interfaces/view.ts` です。

1. [1. 全体像](01-animations-overview.md)
2. [2. テンプレートから命令へ](02-animations-compile.md)
3. **3. 命令がすること**（この章）
4. [4. 待ち行列](04-animations-queue.md)
5. [5. enter のクラス](05-animations-enter-classes.md)
6. [6. いちばん長いアニメーション](06-animations-longest.md)
7. [7. 関数で動かす](07-animations-functions.md)
8. [8. 動かないとき](08-animations-disabled.md)
9. [9. 消すのを遅らせる](09-animations-leave-removal.md)
10. [10. leave のクラス](10-animations-leave-classes.md)
11. [11. 入れ子の leave](11-animations-leave-nested.md)
12. [12. 並べ替えと出し直し](12-animations-leave-reorder.md)
13. [13. スタイルの後片付け](13-animations-styles-teardown.md)
14. [14. 旧パッケージの入口](14-animations-legacy-setup.md)
15. [15. 旧 DSL とキーフレーム](15-animations-legacy-dsl.md)
16. [16. TransitionAnimationEngine](16-animations-legacy-engine.md)
17. [17. 2 つが同居するとき](17-animations-legacy-compat.md)
18. [18. 移行](18-animations-migration.md)
19. [19. テスト](19-animations-testing.md)
20. [20. issue と変更を読む](20-animations-issues.md)

## 1. ɵɵanimateEnter の前半：早く戻る 3 つの道

📄 `angular/packages/core/src/render3/instructions/animation.ts` L50–69 （▶ の行: 54, 58–59, 61–62, 64, 66–68）

```ts
50 │ /**
51 │  * Instruction to handle the `animate.enter` behavior for class bindings.
52 │  *
53 │  * @param value The value bound to `animate.enter`, which is a string or a function.
54 ▶  * @returns This function returns itself so that it may be chained.
55 │  *
56 │  * @codeGenApi
57 │  */
58 ▶ export function ɵɵanimateEnter(value: string | AnimationClassBindingFn): typeof ɵɵanimateEnter {
59 ▶   performanceMarkFeature('NgAnimateEnter');
60 │ 
61 ▶   if ((typeof ngServerMode !== 'undefined' && ngServerMode) || !areAnimationSupported) {
62 ▶     return ɵɵanimateEnter;
63 │   }
64 ▶   ngDevMode && assertAnimationTypes(value, 'animate.enter');
65 │ 
66 ▶   const lView = getLView();
67 ▶   if (areAnimationsDisabled(lView)) {
68 ▶     return ɵɵanimateEnter;
69 │   }
```

1. **58 行目：引数は文字列か関数**

   静的属性なら `"fade-in"`、`[animate.enter]` なら式を返す関数（`AnimationClassBindingFn`、3 節）が来ます。戻り値の型は `typeof ɵɵanimateEnter` で、54 行目のとおり、自分自身を返してつなげて呼べるようにしています（`ɵɵanimateEnter(fn)("a")`、第 2 回）。
2. **59 行目：`performanceMarkFeature('NgAnimateEnter')`**

   機能ごとに 1 回だけ `performance.mark('mark_feature_usage', …)` を打つ関数です（`util/performance.ts`）。DevTools などで「このアプリは animate.enter を使っている」と分かるようにする印で、動きには関係しません。
3. **61〜63 行目：サーバーと、`getAnimations` の無い環境では何もしない**

   `ngServerMode` が真（SSR やプリレンダー）か、`areAnimationSupported` が偽なら、登録すらせずに戻ります。`areAnimationSupported` はモジュールを読み込んだときに 1 回だけ決まる定数で、`document.documentElement.getAnimations` が関数かどうかを見ています。中身と、jsdom のテストで何が起きるかは [第 8 回](08-animations-disabled.md)です。
4. **64 行目：開発モードだけの型の確かめ**

   `assertAnimationTypes` は、値が文字列でも関数でもなければ `ANIMATE_INVALID_VALUE` のエラーを投げます。
5. **66〜69 行目：`ANIMATIONS_DISABLED` なら何もしない**

   66 行目の `getLView()` は「いま作成ブロックを走らせているビュー」の LView です。67 行目の `areAnimationsDisabled` は、その LView のインジェクタから `ANIMATIONS_DISABLED` を引きます（既定は `false`）。テストで `animationsEnabled` を付けないと止まるのはここです（[第 8 回](08-animations-disabled.md)）。

## 2. ɵɵanimateEnter の後半：関数を作って、積んで、待ち行列へ

📄 `angular/packages/core/src/render3/instructions/animation.ts` L70–92 （▶ の行: 71, 73–76, 78–79, 82, 84–89, 91）

```ts
70 │ 
71 ▶   const tNode = getCurrentTNode()!;
72 │ 
73 ▶   // Capture NgZone eagerly while the injector is still valid. The animation
74 ▶   // function runs later from the queue, at which point the lView injector
75 ▶   // may have been destroyed.
76 ▶   const ngZone = lView[INJECTOR]!.get(NgZone);
77 │ 
78 ▶   addAnimationToLView(getLViewEnterAnimations(lView), tNode, () =>
79 ▶     runEnterAnimation(lView, tNode, value, ngZone),
80 │   );
81 │ 
82 ▶   initializeAnimationQueueScheduler(lView[INJECTOR]);
83 │ 
84 ▶   // We have to queue here due to the animation instruction being invoked after the element
85 ▶   // instruction. The DOM node has to exist before we can queue an animation. Any node that
86 ▶   // is not inside of control flow needs to get queued here. For nodes inside of control
87 ▶   // flow, those are queued in node_manipulation.ts and are deduped by a Set in the animation
88 ▶   // queue.
89 ▶   queueEnterAnimations(lView[INJECTOR], getLViewEnterAnimations(lView));
90 │ 
91 ▶   return ɵɵanimateEnter; // For chaining
92 │ }
```

1. **71 行目：対象の要素は「今の TNode」**

   命令に要素の番号は渡りません。`getCurrentTNode()` は、直前に呼ばれた `ɵɵdomElementStart` が作った（または見つけた）要素の TNode を返します。コンパイラがこの命令を要素の命令の直後に置くのはこのためです（第 2 回の convert\_animations）。
2. **73〜76 行目：NgZone を、今のうちに取っておく**

   コメントのとおり、アニメーションの関数はあとで待ち行列から走り、**そのときには LView のインジェクタが壊れているかもしれない**からです。壊れたインジェクタに `get` すると `NG0205: Injector has already been destroyed` が投げられます。この行は 2026-02-10 のコミット bd2868e915e（fix(core): capture animation dependencies eagerly to avoid destroyed injector）で入りました。それまでは実行時に `lView[INJECTOR].get(NgZone)` していました。取った `ngZone` は、イベントを聞くときに `runOutsideAngular` で包むのに使います（[第 5 回](05-animations-enter-classes.md)）。
3. **78〜80 行目：「あとで走らせる関数」を LView に積む**

   `() => runEnterAnimation(lView, tNode, value, ngZone)` という**引数の無い関数（クロージャ）**を作り、`addAnimationToLView` で LView の enter の Map に積みます（4 節）。`runEnterAnimation` はまだ呼ばれていません。クラスを付けるのはこの関数で、中身は [第 5 回](05-animations-enter-classes.md)です。
4. **82 行目：待ち行列を「流す予約」をする**

   `initializeAnimationQueueScheduler` は、ルートの `ANIMATION_QUEUE` に「次の描画のあとで流す」予約（`afterNextRender`）を 1 回だけ入れます。中身は [第 4 回](04-animations-queue.md)です。
5. **84〜89 行目：enter だけは、ここで待ち行列に入れる**

   コメントの理由は「この命令は要素の命令の後に呼ばれるので DOM の要素はもうある。制御フローの外の要素はここで積むしかない。制御フローの中の要素は `node_manipulation.ts` で積まれ、待ち行列の Set で重複が消える」です。89 行目は、この LView の enter の Map に**ある関数を全部**待ち行列に入れます（いま積んだ 1 つだけではありません）。同じ関数が何度入っても、Set なので 1 つです。
6. **91 行目：自分を返す**

   つなげて呼ぶための戻り値です。

## 3. ɵɵanimateLeave：積むけれど、待ち行列には入れない

📄 `angular/packages/core/src/render3/instructions/animation.ts` L239–278 （▶ の行: 241–242, 249–250, 252, 256, 259–260, 264, 269, 271–272, 275, 277）

```ts
239 │ /**
240 │  * Instruction to handle the `animate.leave` behavior for class animations.
241 ▶  * It creates a leave animation function that's tracked in the LView to
242 ▶  * be run before DOM node removal and cleanup.
243 │  *
244 │  * @param value The value bound to `animate.leave`, which can be a string or a function.
245 │  * @returns This function returns itself so that it may be chained.
246 │  *
247 │  * @codeGenApi
248 │  */
249 ▶ export function ɵɵanimateLeave(value: string | AnimationClassBindingFn): typeof ɵɵanimateLeave {
250 ▶   performanceMarkFeature('NgAnimateLeave');
251 │ 
252 ▶   if ((typeof ngServerMode !== 'undefined' && ngServerMode) || !areAnimationSupported) {
253 │     return ɵɵanimateLeave;
254 │   }
255 │ 
256 ▶   ngDevMode && assertAnimationTypes(value, 'animate.leave');
257 │ 
258 │   const lView = getLView();
259 ▶   const animationsDisabled = areAnimationsDisabled(lView);
260 ▶   if (animationsDisabled) {
261 │     return ɵɵanimateLeave;
262 │   }
263 │ 
264 ▶   const tNode = getCurrentTNode()!;
265 │ 
266 │   // Capture NgZone eagerly while the injector is still valid. The animation
267 │   // function runs later from the queue, at which point the lView injector
268 │   // may have been destroyed.
269 ▶   const ngZone = lView[INJECTOR]!.get(NgZone);
270 │ 
271 ▶   addAnimationToLView(getLViewLeaveAnimations(lView), tNode, () =>
272 ▶     runLeaveAnimations(lView, tNode, value, ngZone),
273 │   );
274 │ 
275 ▶   initializeAnimationQueueScheduler(lView[INJECTOR]);
276 │ 
277 ▶   return ɵɵanimateLeave; // For chaining
278 │ }
```

250〜269 行目は enter とほぼ同じ形です（印は `NgAnimateLeave`、252 行目のサーバー・未対応の return、259〜262 行目の `ANIMATIONS_DISABLED`、264 行目の TNode、266〜269 行目の NgZone）。271〜273 行目で `runLeaveAnimations` を呼ぶクロージャを **leave の Map** に積み、275 行目で予約を入れます。

違いは 2 つです。**enter の 84〜89 行目に当たる「待ち行列に入れる」行がありません**。leave は要素を消すときに走るものなので、241〜242 行目のコメントのとおり「DOM から外す前に走らせるために LView で覚えておく」だけです。要素を外す `node_manipulation.ts` の Detach / Destroy が、そのときに待ち行列へ入れます（[第 9 回](09-animations-leave-removal.md)）。もう 1 つ、`(animate.leave)` の `ɵɵanimateLeaveListener` は `ANIMATIONS_DISABLED` でも早く戻らず登録を続けます。それは [第 8 回](08-animations-disabled.md)・[第 7 回](07-animations-functions.md)で読みます。

## 4. LView の ANIMATIONS と、その中身

関数を積む場所は LView の 1 つの枠です。LView のヘッダの番号を見ます。

📄 `angular/packages/core/src/render3/interfaces/view.ts` L66–76 （▶ の行: 68, 75）

```ts
66 │ export const PREORDER_HOOK_FLAGS = 17;
67 │ export const QUERIES = 18;
68 ▶ export const ID = 19;
69 │ export const EMBEDDED_VIEW_INJECTOR = 20;
70 │ export const ON_DESTROY_HOOKS = 21;
71 │ export const EFFECTS_TO_SCHEDULE = 22;
72 │ export const EFFECTS = 23;
73 │ export const REACTIVE_TEMPLATE_CONSUMER = 24;
74 │ export const AFTER_RENDER_SEQUENCES_TO_ADD = 25;
75 ▶ export const ANIMATIONS = 26;
76 │ export const ON_ERROR = 27;
```

75 行目、`ANIMATIONS = 26`。LView という配列の 26 番目に、そのビューのアニメーションのデータを置きます。型は `[ANIMATIONS]: AnimationLViewData | null` で、作ったときは `null` です（LView の型の並びは [ivy-lview](../ivy/06-ivy-lview.md)）。68 行目の `ID = 19` は LView ごとの番号で、leave の途中のビューを覚えておくのに使います（[第 13 回](13-animations-styles-teardown.md)）。

📄 `angular/packages/core/src/animation/interfaces.ts` L67–97 （▶ の行: 67–69, 71–72, 76, 78, 80–81, 83–85, 91, 97）

```ts
67 ▶ export interface EnterNodeAnimations {
68 ▶   animateFns: RunEnterAnimationFn[];
69 ▶   resolvers?: VoidFunction[];
70 │ }
71 ▶ export interface LeaveNodeAnimations {
72 ▶   animateFns: RunLeaveAnimationFn[];
73 │   resolvers?: VoidFunction[];
74 │ }
75 │ 
76 ▶ export interface AnimationLViewData {
77 │   // Enter animations that apply to nodes in this view
78 ▶   enter?: Map<number, EnterNodeAnimations>;
79 │ 
80 ▶   // Leave animations that apply to nodes in this view
81 ▶   leave?: Map<number, LeaveNodeAnimations>;
82 │ 
83 ▶   // Leave animations that apply to nodes in this view
84 ▶   // We chose to use unknown instead of PromiseSettledResult<void> to avoid requiring the type
85 ▶   running?: Promise<unknown>;
86 │ 
87 │   // Animation functions that have been queued for this view when the view is detached.
88 │   // This is used to later remove them from the global animation queue if the view
89 │   // is attached before the animation queue runs. This is used in cases where views are
90 │   // moved or swapped during list reconciliation.
91 ▶   detachedLeaveAnimationFns?: VoidFunction[];
92 │ }
93 │ 
94 │ /**
95 │  * Function that returns the class or class list binded to the animate instruction
96 │  */
97 ▶ export type AnimationClassBindingFn = () => string | string[] | undefined | null;
```

| フィールド（行） | 中身 | 誰が使う |
| --- | --- | --- |
| `enter`（78） | `Map<TNode.index, EnterNodeAnimations>`。値は `animateFns`（引数なしの関数の配列、68 行目） | この章の命令が積み、待ち行列が呼ぶ |
| `leave`（81） | `Map<TNode.index, LeaveNodeAnimations>`。関数は `{promise, resolve}` を返す（`RunLeaveAnimationFn`） | 要素を外すときに集めて待つ（第 9・11 回） |
| `resolvers`（69・73） | 途中で止めるときに呼ぶ関数 | 第 9・10 回 |
| `running`（85） | このビューで走っている leave の Promise | 第 9 回 |
| `detachedLeaveAnimationFns`（91） | 外したときに待ち行列へ入れた関数の控え | @for で戻ってきたとき抜く（第 12 回） |

83 行目のコメントは 80 行目と同じ文（Leave animations that apply to nodes in this view）なので、85 行目の `running` が何かは、84 行目のコメントと型（`Promise<unknown>`）から読みます。97 行目の `AnimationClassBindingFn` が、`[animate.enter]="expr"` のときに命令へ渡る関数の型です。なお最新の main では、9a06a739076（fix(core): support function and signal bindings in animate.enter and animate.leave）で、この型の戻り値が「関数をさらに返してもよい」`AnimationClassValue` に広がっています（`[animate.enter]="mySignal"` のように signal そのものを渡す書き方のため）。

### Map を作るのは最初の 1 回だけ

📄 `angular/packages/core/src/animation/utils.ts` L256–267 （▶ の行: 257–258, 265–266）

```ts
256 │ export function getLViewEnterAnimations(lView: LView): Map<number, EnterNodeAnimations> {
257 ▶   const animationData = (lView[ANIMATIONS] ??= {});
258 ▶   return (animationData.enter ??= new Map());
259 │ }
260 │ 
261 │ /**
262 │  * Retrieves the list of specified leave animations from the lView
263 │  */
264 │ export function getLViewLeaveAnimations(lView: LView): Map<number, LeaveNodeAnimations> {
265 ▶   const animationData = (lView[ANIMATIONS] ??= {});
266 ▶   return (animationData.leave ??= new Map());
267 │ }
```

257 行目の `lView[ANIMATIONS] ??= {}` で、`null` だった枠に初めてオブジェクトを置き、258 行目で `enter` の Map を作ります。2 回目以降は同じ Map が返ります。アニメーションを 1 つも書いていないビューは、最後まで `null` のままです。

📄 `angular/packages/core/src/animation/utils.ts` L382–391 （▶ の行: 387–389）

```ts
382 │ export function addAnimationToLView(
383 │   animations: Map<number, EnterNodeAnimations | LeaveNodeAnimations>,
384 │   tNode: TNode,
385 │   fn: RunEnterAnimationFn | RunLeaveAnimationFn,
386 │ ) {
387 ▶   const nodeAnimations = animations.get(tNode.index) ?? {animateFns: []};
388 ▶   nodeAnimations.animateFns.push(fn);
389 ▶   animations.set(tNode.index, nodeAnimations);
390 │ }
391 │ 
```

1. **387 行目：キーは `tNode.index`**

   TNode の index は、その要素が LView の何番目の枠にいるかです。`ɵɵdomElementStart(0, "p")` の 0 にヘッダの長さ（`HEADER_OFFSET` = 28、[component](../ivy/01-component.md)）を足した 28 が入ります。1 つの LView の中では要素ごとに違う番号なので、要素の「名前」として使えます。
2. **388 行目：配列に push**

   同じ要素にもう 1 つ積むと、配列の 2 つ目になります。`animate.enter="a" [animate.enter]="b()"` の両方を書くと、2 つの関数が順に走ります。
3. **389 行目：Map に戻す**

   初めての要素なら、ここで Map に入ります。

> [!NOTE]
> **さらに深く**
>
> なぜ TNode そのものではなく index なのか。TNode は TView に属し、同じテンプレートから作った LView（`@for` の各行など）で共有されます（[ivy-tnode](../ivy/04-ivy-tnode.md)）。だから Map は LView ごとに持ち（`lView[ANIMATIONS]`）、その中では index で引きます。要素を DOM に出し入れする `node_manipulation.ts` は、手元にある `tNode` から `parentLView[ANIMATIONS].enter.has(tNode.index)` と引けます（[第 4 回](04-animations-queue.md)）。

## 5. 「この時点では何も動かない」を再現で見る

> **🧪 デモ（再現）：登録 → 待ち行列 → 実行**
>
> これは**再現**です。本物の命令は呼んでいません。animation.ts 58〜92・249〜278 行目、utils.ts 256〜267・382〜390 行目、queue.ts の手順を、ただの Map と Set で写しました。「関数」は名前の文字列で表しています。index 28 と 30 は `<p>`（スロット 0）と、その次の要素（スロット 2）のつもりです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-instructions)

試すと分かること: `ɵɵanimateEnter` を何度押しても、起きるのは Map と Set が増えることだけで、`runEnterAnimation` は呼ばれません。`ɵɵanimateLeave` は Map には積みますが、Set には入りません。「描画が終わる」を押して初めて、Set の関数が呼ばれます。index 28 の enter を 2 回押すと、Map の配列は 2 つになり、Set にも 2 つ（別の関数）入ります。index 30 を押すと、89 行目が Map 全体を入れ直しますが、Set なので index 28 の分は増えません。

- 👤 `<p animate.enter="fade-in">` — テンプレート
  - `ɵɵanimateEnter("fade-in")` — animation.ts 58
    - `getLView() / getCurrentTNode()` — 66・71
    - `lView[INJECTOR].get(NgZone)` — 76：今のうちに取る
    - `addAnimationToLView(getLViewEnterAnimations(lView), tNode, fn)` — 78 → utils.ts 256・382
    - `initializeAnimationQueueScheduler(injector)` — 82 → 第 4 回
    - `queueEnterAnimations(injector, enterMap)` — 89 → 第 4 回
  - `runEnterAnimation(lView, tNode, value, ngZone)` — *…あとで afterNextRender の中から* — 第 5 回

## テストと直し方

この章の行を確かめている spec は、`packages/core/test/acceptance/animation_spec.ts` のこの 4 本です。

📄 `ターミナル（../angular で実行）`

```
$ grep -n "no control flow\|only once on entry\|INJECTOR_ALREADY_DESTROYED" \
    packages/core/test/acceptance/animation_spec.ts
1021:    it('should apply classes on entry when animation is specified with no control flow', fakeAsync(() => {
1041:    it('should call animation function on entry when animation is specified with no control flow', fakeAsync(() => {
1065:    it('should call animation function only once on entry when animation is specified with control flow', fakeAsync(() => {
2409:    it('should not throw INJECTOR_ALREADY_DESTROYED when lView injector is destroyed before animation queue runs', fakeAsync(() => {
```

1. **1021・1041 行目：制御フローの外**

   `<div><p animate.enter="slide-in">` のように `@if` の外に書いた要素でも、クラスが付く（1021）・関数が呼ばれる（1041）ことを確かめています。84〜88 行目のコメントのとおり、制御フローの外の要素は 89 行目で積むしかありません。
2. **1065 行目：制御フローの中で 1 回だけ**

   89 行目と `node_manipulation.ts` の両方で積まれても、関数が 1 回しか呼ばれないこと（Set の重複除け）。詳しくは [第 4 回](04-animations-queue.md)。
3. **2409 行目：インジェクタが先に壊れたとき**

   子の環境インジェクタを `destroy()` してから待ち行列を流しても、`ErrorHandler` が呼ばれないこと。76・269 行目で NgZone を先に取っておく変更（bd2868e915e）と一緒に足された spec です。

走らせるのはブラウザ版の `//packages/core/test/acceptance:acceptance_web_chromium` です。2026-11-01 に自分で走らせて 2743 passed, 0 failed, 3 skipped（PASSED in 6.8s）でした。この 4 本だけを選ぶ filter はありません（[第 1 回](01-animations-overview.md)）。

1. **直すとしたら**

   早く戻る条件なら 61・67 行目（と `utils.ts` の `areAnimationSupported`・`areAnimationsDisabled`）、登録の形なら `utils.ts` の `addAnimationToLView`、enter をどこで積むかなら 89 行目と `node_manipulation.ts` です。「命令が呼ばれた時点で、何をまだ持っていないといけないか」（今回の NgZone のように）は、待ち行列が後で走るせいで起きる種類のバグなので、spec は `describe('animation queue timing')` に足すのが合います。

## 聞かれそうな質問

**Q. 同じ要素に animate.enter を 2 つ書いたらどうなりますか？**

同じ名前の属性は 2 つ書けないので、`animate.enter="a"` と `[animate.enter]="b()"` の組み合わせになります。コンパイラは `ɵɵanimateEnter(fn)("a")` と 2 回呼ぶ形にし（第 2 回）、2 回とも 71 行目で同じ TNode を取るので、utils.ts 387〜389 行目で同じ index の `animateFns` に 2 つ並びます。待ち行列が流れると両方が順に呼ばれ、それぞれがクラスを付けます。

**Q. SSR ではアニメーションの命令は何をしますか？**

何もしません。61 行目（leave は 252 行目）で `ngServerMode` を見て、登録の前に戻ります。LView の `ANIMATIONS` も `null` のまま、待ち行列の予約もしません。だからサーバーで描いた HTML にアニメーションのクラスは付きません。ハイドレーションのときに既にある要素をどう扱うかは [第 8 回](08-animations-disabled.md)です。

**Q. (animate.enter) の Listener 版とは何が違いますか？**

形はほぼ同じで、積むクロージャが `runEnterAnimation` ではなく、利用者の関数を呼ぶ `runEnterAnimationFunction` になります。enter の Listener 版は NgZone を取りません。`runEnterAnimationFunction` は利用者の関数を `{target, animationComplete}` 付きで呼ぶだけで、NgZone を使わないからです。leave の Listener 版は `ANIMATIONS_DISABLED` でも戻らず、`MAX_ANIMATION_TIMEOUT` も先に取ります。詳しくは [第 7 回](07-animations-functions.md)です。

**Q. なぜ NgZone を命令の中で取るのですか？zoneless なら要らないのでは？**

zoneless でも `NgZone` のトークンは `NoopNgZone` として provide されていて（[zoneless-default](../zoneless/01-zoneless-default.md)）、`runOutsideAngular` は関数をそのまま呼ぶだけです。取る理由は 73〜75 行目のコメントのとおり「関数が走るときにはインジェクタが壊れているかもしれない」からで、zone.js の有無とは関係ありません。

## 読み終えて

- `ɵɵanimateEnter` / `ɵɵanimateLeave` は、サーバー・`getAnimations` 無し・`ANIMATIONS_DISABLED` のどれかなら登録もせずに戻る
- 対象の要素は `getCurrentTNode()`。だから命令は要素の命令の直後にある
- LView の 26 番目の枠 `ANIMATIONS` に、`enter` / `leave` の Map を作り、`TNode.index` ごとに引数なしのクロージャを push する
- NgZone は命令の時点で取ってクロージャに閉じ込める。走るときにはインジェクタが壊れているかもしれないから
- enter だけはその場で待ち行列に入れる。leave は要素を外すときに入る。どちらも、命令の時点では何も動かない

---

← 前: [テンプレートから命令へ：animate.enter が ɵɵanimateEnter になるまで](02-animations-compile.md)  
次: [アニメーションの待ち行列：ANIMATION\_QUEUE と afterNextRender](04-animations-queue.md) →
