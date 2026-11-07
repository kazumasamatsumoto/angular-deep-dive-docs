[目次](../README.md) › [アニメーションの内側](README.md) › 第 8 回 / 全 20 回

# アニメーションが動かないとき：ANIMATIONS\_DISABLED・SSR・getAnimations

> areAnimationSupported が ngServerMode と document.documentElement.getAnimations の有無で決まる行、ANIMATIONS\_DISABLED トークンで止めたとき enter は何もせず、(animate.leave) だけは登録を続けてすぐ消す理由。サーバーで描いたページやハイドレーション、jsdom のテスト環境（getAnimations が無い）で何が起きるか。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/animations-disabled)

---

animate.enter / animate.leave が「何もしない」ときには、2 種類あります。**そもそも動かない環境**（サーバー、`getAnimations` の無いブラウザや jsdom）と、**止めてある**とき（`ANIMATIONS_DISABLED` が true。テストの既定）です。この章では、その 2 つを決める `areAnimationSupported` と `areAnimationsDisabled` の行、命令ごとの早い return の違い（enter は何もしない、`(animate.leave)` だけは登録を続けてすぐ消す）、そしてサーバーで描いたページ・ハイドレーション・このサイトの ng test（jsdom）で実際に何が起きるかを確かめます。

読む対象は `packages/core/src/animation/utils.ts`・`packages/core/src/animation/interfaces.ts`・`packages/core/src/render3/instructions/animation.ts`・`packages/core/testing/src/test_bed_common.ts` です。

1. [1. 全体像](01-animations-overview.md)
2. [2. テンプレートから命令へ](02-animations-compile.md)
3. [3. 命令がすること](03-animations-instructions.md)
4. [4. 待ち行列](04-animations-queue.md)
5. [5. enter のクラス](05-animations-enter-classes.md)
6. [6. いちばん長いアニメーション](06-animations-longest.md)
7. [7. 関数で動かす](07-animations-functions.md)
8. **8. 動かないとき**（この章）
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

## 1. 動く環境か：areAnimationSupported

📄 `angular/packages/core/src/animation/utils.ts` L26–41 （▶ の行: 26, 29–31, 33, 38–40）

```ts
26 ▶ const DEFAULT_ANIMATIONS_DISABLED = false;
27 │ const ANIMATION_DURATION_TOLERANCE_MS = 1;
28 │ 
29 ▶ export const areAnimationSupported =
30 ▶   (typeof ngServerMode === 'undefined' || !ngServerMode) &&
31 ▶   typeof document !== 'undefined' &&
32 │   // tslint:disable-next-line:no-toplevel-property-access
33 ▶   typeof document?.documentElement?.getAnimations === 'function';
34 │ 
35 │ /**
36 │  * Helper function to check if animations are disabled via injection token
37 │  */
38 ▶ export function areAnimationsDisabled(lView: LView): boolean {
39 ▶   const injector = lView[INJECTOR]!;
40 ▶   return injector.get(ANIMATIONS_DISABLED, DEFAULT_ANIMATIONS_DISABLED);
41 │ }
```

1. **29 行目 関数ではなく定数**

   `areAnimationSupported` は `export const` です。utils.ts が読み込まれたときに**1 回だけ**計算され、あとから変わりません。テストの中で `getAnimations` を生やしても効かないのはこのためです（5 節の表の最後の段）。
2. **30 行目 サーバーではない**

   `ngServerMode` は、ビルドが定義する値です。angular-cli の `packages/angular/build/src/tools/esbuild/application-code-bundle.ts` を見ると、サーバー用のバンドルでは `'true'`（:532）、ブラウザ用では `'false'`（:666）と定義しています。未定義か false なら通ります。
3. **31 行目 document がある**

   Node で DOM を持たずに読み込まれた場合を弾きます。
4. **33 行目 document.documentElement.getAnimations が関数**

   Web Animations API の `getAnimations` があること。いちばん長いアニメーションを測るのに使うからです（[第 6 回](06-animations-longest.md)）。jsdom にはこれがありません（5 節）。

## 2. 止めてあるか：areAnimationsDisabled と ANIMATIONS\_DISABLED

38〜41 行目の `areAnimationsDisabled(lView)` は、`lView[INJECTOR]` から `ANIMATIONS_DISABLED` を取ります。見つからなければ 26 行目の `false` です。

📄 `angular/packages/core/src/animation/interfaces.ts` L10–18 （▶ の行: 11, 13, 16）

```ts
10 │ /**
11 ▶  * A [DI token](api/core/InjectionToken) that enables or disables all enter and leave animations.
12 │  */
13 ▶ export const ANIMATIONS_DISABLED = new InjectionToken<boolean>(
14 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'AnimationsDisabled' : '',
15 │   {
16 ▶     factory: () => false,
17 │   },
18 │ );
```

- 13 行目 ふつうの `InjectionToken<boolean>`。16 行目の factory で既定は `false`（どこでも provide されていなければ動く）。
- core の公開 API ではありません。`core_private_export.ts:26` で `ɵANIMATIONS_DISABLED` として出しているだけです（ɵ は「内部用。予告なく変わる」の印。[contrib-public-api](../contrib/08-contrib-public-api.md)）。
- 誰が provide しているか。../angular の packages を `grep -rn "ANIMATIONS_DISABLED" --include='*.ts'`（spec を除く）すると、provide しているのは `packages/core/testing/src/test_bed_compiler.ts:1006` の 1 か所だけでした。旧パッケージの `provideNoopAnimations()` / `NoopAnimationsModule`（platform-browser/animations/src/providers.ts・module.ts）は `ANIMATION_MODULE_TYPE` を `'NoopAnimations'` にしますが、`ANIMATIONS_DISABLED` には触れていません。

> [!WARNING]
> **ハマりどころ**
>
> `lView[INJECTOR]` は要素のノードインジェクタ（[di-node-injector-lookup](../di/11-di-node-injector-lookup.md)）ではありません。ビューを作るときに渡されたインジェクタで、渡されなければ親のビューのものを受け継ぎます（construction.ts:209、[ivy-lview](../ivy/06-ivy-lview.md)）。子のコンポーネントのビューは親から受け継ぐので、**コンポーネントの `providers` に置いても、そのコンポーネントのテンプレートには届きません**。届くのは、環境インジェクタ（アプリやルートの providers）か、`createComponent` / `createEmbeddedView` に渡したインジェクタです。7 節のデモで本物を確かめられます。同じことが `MAX_ANIMATION_TIMEOUT`（[第 7 回](07-animations-functions.md)）にも言えます。

## 3. 命令ごとの早い return

📄 `angular/packages/core/src/render3/instructions/animation.ts` L198–210 （▶ の行: 201–202, 207–209）

```ts
198 │ export function ɵɵanimateEnterListener(value: AnimationFunction): typeof ɵɵanimateEnterListener {
199 │   performanceMarkFeature('NgAnimateEnter');
200 │ 
201 ▶   if ((typeof ngServerMode !== 'undefined' && ngServerMode) || !areAnimationSupported) {
202 ▶     return ɵɵanimateEnterListener;
203 │   }
204 │ 
205 │   ngDevMode && assertAnimationTypes(value, 'animate.enter');
206 │ 
207 ▶   const lView = getLView();
208 ▶   if (areAnimationsDisabled(lView)) {
209 ▶     return ɵɵanimateEnterListener;
210 │   }
```

`(animate.enter)` の命令の冒頭です。201 行目で「サーバー、または動かない環境」なら、208 行目で「止めてある」なら、**何も登録せずに**戻ります。クラス版の `ɵɵanimateEnter` とクラス版の `ɵɵanimateLeave` も、同じ 2 つの早い return を持っています（[第 3 回](03-animations-instructions.md)）。何も登録されないので、enter ならクラスは付かず関数も呼ばれず、leave なら要素はふつうの要素と同じく、外されたその場で DOM から消えます。

📄 `angular/packages/core/src/render3/instructions/animation.ts` L411–427 （▶ の行: 414–415, 420–422, 427）

```ts
411 │ export function ɵɵanimateLeaveListener(value: AnimationFunction): typeof ɵɵanimateLeaveListener {
412 │   performanceMarkFeature('NgAnimateLeave');
413 │ 
414 ▶   if ((typeof ngServerMode !== 'undefined' && ngServerMode) || !areAnimationSupported) {
415 ▶     return ɵɵanimateLeaveListener;
416 │   }
417 │ 
418 │   ngDevMode && assertAnimationTypes(value, 'animate.leave');
419 │ 
420 ▶   // Even when animations are disabled, we still need to register the element for removal
421 ▶   // to ensure proper cleanup and allow developers to handle element removal in tests
422 ▶   // So we don't have an early return here.
423 │ 
424 │   const lView = getLView();
425 │   const tNode = getCurrentTNode()!;
426 │ 
427 ▶   allLeavingAnimations.add(lView[ID]);
```

`(animate.leave)` だけが違います。414 行目の「サーバー、または動かない環境」の return はありますが、「止めてある」の return が**ありません**。420〜422 行目のコメントは「無効のときも、片付けを正しく行い、テストで開発者が要素の削除を扱えるよう、削除のための登録はする。だからここで早く戻らない」と書いています。そのまま 427 行目以降で登録を続け（[第 7 回](07-animations-functions.md)の 3 節）、止めてあるかどうかは関数が走るときに確かめます。

📄 `angular/packages/core/src/render3/instructions/animation.ts` L461–474 （▶ の行: 461, 466–467, 474）

```ts
461 ▶   const animationsDisabled = areAnimationsDisabled(lView);
462 │ 
463 │   (getLViewLeaveAnimations(lView).get(tNode.index)!.resolvers ??= []).push(resolve);
464 │   const resolvers = getLViewLeaveAnimations(lView).get(tNode.index)?.resolvers;
465 │ 
466 ▶   if (animationsDisabled) {
467 ▶     leaveAnimationFunctionCleanup(
468 │       lView,
469 │       tNode,
470 │       nativeElement as HTMLElement,
471 │       resolvers,
472 │       cleanupFns,
473 │     );
474 ▶   } else {
```

`runLeaveAnimationFunction` の 461 行目で `areAnimationsDisabled` を読み、true なら 466〜473 行目で**あなたの関数を呼ばずに**すぐ片付けます（片付けの中身と、false のときの 474 行目からの流れは[第 7 回](07-animations-functions.md)）。つまり止めてあるときの `(animate.leave)` の要素は、ふつうの leave と同じく待ち行列（[第 9 回](09-animations-leave-removal.md)）を通って消えますが、関数は呼ばれず、待つ時間もありません。

| 命令 | サーバー / getAnimations が無い | ANIMATIONS\_DISABLED が true |
| --- | --- | --- |
| `animate.enter="..."`（ɵɵanimateEnter） | 何もしない | 何もしない |
| `(animate.enter)`（ɵɵanimateEnterListener） | 何もしない（201 行目） | 何もしない（208 行目） |
| `animate.leave="..."`（ɵɵanimateLeave） | 何もしない → その場で消える | 何もしない → その場で消える |
| `(animate.leave)`（ɵɵanimateLeaveListener） | 何もしない → その場で消える（414 行目） | **登録する** → 待ち行列で関数を呼ばずに片付けて消える（466〜473 行目） |

## 4. テストでは既定で止まっている

📄 `angular/packages/core/testing/src/test_bed_common.ts` L26–28 （▶ の行: 28）

```ts
26 │ 
27 │ /** Whether animations are enabled or disabled. */
28 ▶ export const ANIMATIONS_ENABLED_DEFAULT = false;
```

📄 `angular/packages/core/testing/src/test_bed_common.ts` L94–105 （▶ の行: 101–102, 104）

```ts
 94 │   /**
 95 │    * Whether to infer the tag name of test components from their selectors.
 96 │    * Otherwise `div` will be used as the tag name for test components.
 97 │    */
 98 │   inferTagName?: boolean;
 99 │ 
100 │   /**
101 ▶    * Whether animate.enter / animate.leave should trigger as normal or be disabled.
102 ▶    * Defaults to `false`.
103 │    */
104 ▶   animationsEnabled?: boolean;
105 │ }
```

`TestBed.configureTestingModule({animationsEnabled: true})` の `animationsEnabled` が 100〜104 行目、既定は 28 行目の `false` です。TestBed はテスト用のモジュールの providers に `{provide: ANIMATIONS_DISABLED, useValue: !this.animationsEnabled}` を置きます（test\_bed\_compiler.ts:1005〜1008。この providers の並びは[testing-errors](../testing/12-testing-errors.md)と[ngmodule-testbed](../ngmodule/17-ngmodule-testbed.md)で読んだ範囲）。だから**何も書かないテストでは ANIMATIONS\_DISABLED が true** で、animate.enter / animate.leave は 3 節の表の右の列の振る舞いになります。acceptance の animation\_spec.ts のほとんどの it が最初に `animationsEnabled: true` を書いている（ファイルの中に 49 か所）のはこのためです。

> [!NOTE]
> **ポイント**
>
> `animationsEnabled` は TestBed の設定にしかありません（テストの環境全体の `TestEnvironmentOptions` には無い）。この設定は 2025-07 の 898244a03a5（`refactor(core): add configurable behavior for animations to testbed`）で入りました。

## 5. このサイトの ng test（jsdom）で確かめる

このサイトの ng test（`@angular/build:unit-test`、Vitest 4.1.11 + jsdom 28.1.0、zone.js なし、`@angular/core` 22.1.6）で、`@if (show()) { <p animate.enter="vb-in" animate.leave="vb-out"> }`（クラスは CSS の 300ms のアニメーション）と、`(animate.enter)="enter($event)" (animate.leave)="leave($event)"` のコンポーネントを作り、`show` を true → false にして `await fixture.whenStable()` ごとに読みました（spec は一時的に `src/verify-b/` に置き、確かめたあと消しました）。

📄 `ターミナル`

```
cd ~/angular-research/angular-deep-dive
npx ng test --watch=false --include src/verify-b/disabled.spec.ts
```

| やったこと | 結果 | 理由（行） |
| --- | --- | --- |
| `typeof document.documentElement.getAnimations` | `"undefined"` | jsdom に無い → 33 行目で `areAnimationSupported` が false |
| `Element.prototype.animate` / `AnimationEvent` / `TransitionEvent` / `requestAnimationFrame` / `matchMedia` | 無い / 無い / ある / ある / 無い | jsdom 28.1.0 の実装 |
| 何も設定しない TestBed で `TestBed.inject(ɵANIMATIONS_DISABLED)` | `true` | test\_bed\_common.ts 28 行目の既定 |
| `animationsEnabled: true` のとき | `false` | 100〜104 行目 |
| animate.enter の要素の class（表示の直後と 50ms 後。既定 / `animationsEnabled: true`） | どちらも `""`（`vb-in` は一度も付かない） | 動かない環境なので命令が何も登録しない |
| animate.leave の要素を `@if` で外したあと DOM にあるか（既定 / 有効） | どちらも無い | 何も登録されていないので、外したその場で消える |
| `(animate.enter)` / `(animate.leave)` の関数が呼ばれたか（既定 / 有効） | どちらも呼ばれない（`[]`）。要素はすぐ消える | 201 行目・414 行目の「動かない環境」の return |
| spec の中で `Element.prototype.getAnimations = () => []` を生やし、有効にして同じこと | 変わらない（class `""`、関数 `[]`） | 29 行目は読み込み時に 1 回だけ計算される定数 |

jsdom のテストでは、`animationsEnabled: true` にしても animate.enter / animate.leave は**まったく動きません**。止まっている理由が「止めてある」（TestBed の既定）から「動かない環境」に変わるだけで、見える結果は同じです。クラスが付くことや、leave の関数が呼ばれることを確かめたいテストは、本物のブラウザで走らせる必要があります。../angular の animation\_spec.ts がブラウザ版でしか走らないのも同じ理由です（[第 19 回](19-animations-testing.md)）。

## 6. サーバーで描いたページとハイドレーション

1. **サーバー（SSR / プリレンダー）**

   サーバーのバンドルでは `ngServerMode` が true なので、4 つの命令はどれも最初の if（201 行目・414 行目と同じ形）で戻ります。サーバーが出す HTML には enter のクラスは付かず、leave の登録もありません。サーバーの上で `@if` が false になった要素は、ふつうの要素と同じくその場で消えます。
2. **ブラウザでのハイドレーション**

   ハイドレーションでは、ブラウザ側でもテンプレート関数の作成の部分（`if (rf & 1)`。[第 2 回](02-animations-compile.md)）が走り、DOM 要素を新しく作る代わりにサーバーが出した要素を拾います（[hydration-claim](../platform/10-hydration-claim.md)）。animate の命令はこの作成の部分にあるので、ブラウザでもう一度走ります。このとき `ngServerMode` は false で、ブラウザには `getAnimations` があるので、早い return を通りません。
3. **enter は拾った要素にも走る**

   `ɵɵanimateEnter` は、制御フローの外の要素のために命令の中で待ち行列に入れます（[第 3 回](03-animations-instructions.md)）。一方、`@if` などのビューの要素を DOM に入れるときの待ち行列入り（node\_manipulation.ts の Create / Insert の分岐。[第 4 回](04-animations-queue.md)）は、ハイドレーションでは通りません。サーバーの DOM があるビューは `shouldAddViewToDom` が false で、DOM に入れ直さないからです（[hydration-containers](../platform/11-hydration-containers.md)）。ただ命令の中の待ち行列入りは、制御フローの内外を区別せずに全部の enter を入れています（重なりは待ち行列の Set が 1 つにまとめる）。だから、サーバーで描かれた `animate.enter` の要素は、ハイドレーションのあと最初の描画の後に、クラスが付いてアニメーションが走ります。
4. **leave はブラウザで登録される**

   ハイドレーションのあとの leave は、ブラウザで走った命令が登録したものなので、ふつうに動きます。

> [!WARNING]
> **ハマりどころ**
>
> 3 つ目は、コードを読んで分かる流れです。**このサイトでは確かめていません。**このシリーズのデモは、プリレンダーされた HTML にアニメーションの要素を入れない（最初は表示しない）方針にしているからです。../angular の packages の中に、ハイドレーションと animate.enter を一緒に確かめる spec は見つかりませんでした（`grep -rln "animate.enter" packages/platform-server packages/core/test/hydration` が 0 件）。旧パッケージには「ハイドレーションのときは最初の入場アニメーションを飛ばしたい」という要望 #58995（`area: animations`、2025-06-12 に閉じた）がありました。

## 7. デモ：このページで読む／どのインジェクタに置くと効くか

> **🧪 DEMO 1 — このページの環境を読む**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-disabled)

ふつうのブラウザなら `getAnimations` は `function`、`ɵANIMATIONS_DISABLED` は `false`（16 行目の既定）です。`prefers-reduced-motion` は、OS の「視差効果を減らす」「アニメーションを減らす」の設定で `true` になりますが、Angular は読んでいません。../angular の `packages/core/src` と `packages/platform-browser/src` を `reduced-motion` と `matchMedia` で grep しても 0 件でした。だから、この値が true でも、このシリーズのデモはどれも動きます。

> **🧪 DEMO 2 — 本物の ɵANIMATIONS\_DISABLED を 3 通りに置く**
>
> 子のコンポーネント（`<p animate.enter="ads-in" (animate.leave)="onLeave($event)">`。`ads-in` は 600ms のアニメーション）を、ボタンを押したときに `createComponent`（`@angular/core` の関数）で作り、`ApplicationRef.attachView` で変更検知に入れます。(a) ふつうに作る、(b) 子自身の `providers` に `ɵANIMATIONS_DISABLED: true` を置く、(c) `createComponent` の `elementInjector` に渡すインジェクタに置く、の 3 通りです。MutationObserver で、クラスが付いた／外れた時刻と、「消す」を押してから `<p>` が DOM から消えた時刻を記録します。`ɵANIMATIONS_DISABLED` は内部用の名前なので、アプリでは使わないでください（ここでは仕組みを見るためだけに使っています）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-disabled)

- **(a)**：`ads-in` が付き、約 600ms で外れます。「消す」で leave の関数が呼ばれ、`animationComplete()` で消えます。
- **(b)**：(a) と同じく動きます（2026-11-01 にヘッドレスの Chrome で、(a)〜(c) の 3 通りとも記録して確かめました）。子の `providers` は子の要素のノードインジェクタに入りますが、子のテンプレートの `lView[INJECTOR]` は `createComponent` のときのインジェクタで、そこには入っていないからです（2 節の囲み）。
- **(c)**：`ads-in` は一度も付きません（3 節の表の右の列）。「消す」を押すと、leave の関数は**呼ばれず**、`<p>` はすぐ（待ち行列が動く次の描画の後に）消えます。466〜473 行目です。

## 8. 呼び出しの連なり（止めてあるときの (animate.leave)）

- 👤 `<p (animate.leave)="onLeave($event)">` — あなたのテンプレート
  - `ɵɵanimateLeaveListener` — animation.ts L411 — *L414 は通る。止めてあっても早く戻らない（L420-422）*
    - `addAnimationToLView(...runLeaveAnimationFunction)` — animation.ts — *第 7 回*
  - `（@if が false → 要素を外す → 待ち行列）` — node\_animations.ts — *第 9 回*
    - `runLeaveAnimationFunction` — animation.ts L447
      - `areAnimationsDisabled(lView)` — utils.ts L38 — *lView\[INJECTOR\].get(ANIMATIONS\_DISABLED, false)*
      - `leaveAnimationFunctionCleanup` — animation.ts L467 — *関数を呼ばずに resolve → 消える*

## テストと直し方

📄 `angular/packages/core/test/acceptance/animation_spec.ts` L1385–1405 （▶ の行: 1385, 1398, 1401–1402, 1404）

```ts
1385 ▶     it('should remove right away when animations are disabled', fakeAsync(() => {
1386 │       @Component({
1387 │         changeDetection: ChangeDetectionStrategy.Eager,
1388 │         selector: 'test-cmp',
1389 │         styles: styles,
1390 │         template: '<div>@if (show()) {<p animate.enter="slide-in" #el>I should fade</p>}</div>',
1391 │         encapsulation: ViewEncapsulation.None,
1392 │       })
1393 │       class TestComponent {
1394 │         show = signal(false);
1395 │         @ViewChild('el', {read: ElementRef}) el!: ElementRef<HTMLParagraphElement>;
1396 │       }
1397 │ 
1398 ▶       const fixture = TestBed.createComponent(TestComponent);
1399 │       const cmp = fixture.componentInstance;
1400 │       fixture.detectChanges();
1401 ▶       cmp.show.set(true);
1402 ▶       fixture.detectChanges();
1403 │       expect(cmp.show()).toBeTruthy();
1404 ▶       expect(cmp.el.nativeElement.outerHTML).not.toContain('class="slide-in"');
1405 │     }));
```

`describe('animate.enter')` の `it('should remove right away when animations are disabled')`（animation\_spec.ts:1385）です。ほかの it と違って `TestBed.configureTestingModule({animationsEnabled: true})` を書いていないので、ANIMATIONS\_DISABLED は true です。1401〜1402 行目で表示しても、1404 行目でクラスは付いていません。leave 側にも同じ名前の it（:132）があり、要素がすぐ消えることを見ています。どちらもクラス版の命令で、関数版の `(animate.leave)` が止めてあるとき（3 節の表の右下）を確かめる it は、animation\_spec.ts の中に見つかりませんでした。

1. **走らせ方と結果**

   この 2 本は `//packages/core/test/acceptance:acceptance_web_chromium` に入っています。2026-11-01 に `--nocache_test_results` で走らせて 2743 passed, 0 failed, 3 skipped、PASSED in 6.8s でした。Node 版では animation\_spec.ts の `isNode`（:50〜:53）で 1 本の `should pass` になります。jsdom（5 節）でも Node でも、「動かない環境」では animate の振る舞いは確かめられません。
2. **直すとしたら**

   環境の判定は utils.ts の 29〜33 行目、止めてあるかは 38〜41 行目、命令ごとの早い return は animation.ts の各命令の冒頭、関数版の leave の無効のときの分岐は 466〜473 行目です。TestBed の既定は test\_bed\_common.ts 28 行目と test\_bed\_compiler.ts:1005〜1008 です。spec を足すなら animation\_spec.ts の 2 本の「disabled」の it の隣が入口です。
3. **issue を読むときの手がかり**

   「テストで animate.enter のクラスが付かない」は、(1) `animationsEnabled: true` を書いたか、(2) 走らせているのが本物のブラウザか（jsdom なら 33 行目で止まる）、の順に確かめます。「アプリでアニメーションを止めたい」という要望（#63161、`core: animations`、2025-08-20 に閉じた）は、70afb41f8e5（`fix(core): handle cases where classes added have no animations`、`fixes: #63161`）で、CSS の詳細度でクラスのアニメーションを打ち消せばすぐ外れる・すぐ消える、という形で答えられました（[第 5 回](05-animations-enter-classes.md)の requestAnimationFrame）。

## 聞かれそうな質問

**Q. テストでアニメーションを止めるには？**

何もしなくても止まっています。TestBed の `animationsEnabled` の既定が `false`（test\_bed\_common.ts 28 行目）で、TestBed が `ANIMATIONS_DISABLED` を true で provide するからです。逆に動かしたいときは `TestBed.configureTestingModule({animationsEnabled: true})` と書き、本物のブラウザで走らせます。jsdom では 33 行目で「動かない環境」になり、有効にしても動きません（5 節）。

**Q. prefers-reduced-motion は見ていますか？**

見ていません。core と platform-browser のソースに `reduced-motion` も `matchMedia` もありません。止めたいなら CSS で `@media (prefers-reduced-motion: reduce)` の中でクラスの `animation` を `none` にします。アニメーションを持たないクラスは次のフレームで外れ（[第 5 回](05-animations-enter-classes.md)）、leave なら要素がすぐ消えます。関数版のときは、関数の中で `matchMedia` を読んで自分で分けます。

**Q. SSR で animate.leave の要素はどうなりますか？**

サーバーでは命令が最初の if で戻るので（414 行目と同じ形）、何も登録されず、サーバーの上で外された要素はその場で消えます。サーバーが出す HTML に leave のための状態は残りません。ブラウザでハイドレーションしたあとは、ブラウザで走った命令が登録するので、それ以降の leave はふつうに動きます（6 節）。

**Q. アプリ全体でアニメーションを止める公式の方法はありますか？**

公開 API としての「止めるスイッチ」はありません。`ANIMATIONS_DISABLED` は `ɵ` の付いた内部用の名前で、provide しているのは TestBed だけです（2 節）。旧パッケージの `provideNoopAnimations()` も `ANIMATIONS_DISABLED` には触れないので、この新しい仕組みを止めるものではありません（2 つが同居するときの話は[第 17 回](17-animations-legacy-compat.md)）。#63161 への答えは CSS で打ち消す方法でした（テストと直し方の 3 つ目）。

**Q. (animate.leave) だけ止めてあっても登録するのはなぜですか？**

420〜422 行目のコメントが「片付けを正しく行い、テストで開発者が要素の削除を扱えるようにするため」と書いています。実際の振る舞いは、登録はするが、要素を外すときに 461 行目で無効と分かれば、あなたの関数を呼ばずに 466〜473 行目で resolve する、です。要素は leave の待ち行列を通って消えます。

## 読み終えて

- `areAnimationSupported` は「サーバーでない・document がある・getAnimations がある」を読み込み時に 1 回だけ計算する定数（utils.ts L29-33）。
- `areAnimationsDisabled` は `lView[INJECTOR]` から `ANIMATIONS_DISABLED`（既定 false）を読む（L38-41）。provide しているのは TestBed だけで、テストの既定は true。
- どちらかに当たると命令は何も登録しない。例外は `(animate.leave)` で、止めてあっても登録し、関数を呼ばずにすぐ片付ける（L420-422、L466-473）。
- jsdom には getAnimations が無いので、ng test では有効にしても動かない（このサイトの ng test で確かめた）。
- サーバーでは何もせず、ハイドレーションのあとブラウザで命令がもう一度走る。

---

← 前: [関数で動かす：(animate.enter) と (animate.leave) と animationComplete](07-animations-functions.md)  
次: [要素を消すのを遅らせる：runLeaveAnimationsWithCallback](09-animations-leave-removal.md) →
