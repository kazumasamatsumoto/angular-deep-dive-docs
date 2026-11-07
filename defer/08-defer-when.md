[目次](../README.md) › [@defer とインクリメンタルハイドレーションの内側](README.md) › 第 8 回 / 全 20 回

# when のトリガー：式が真になったときだけ

> ɵɵdeferWhen が、update pass のたびに bindingUpdated で値の変化を確かめ、偽で未描画なら placeholder を、真に変わったときだけ triggerDeferBlock を呼ぶ行。いちど本体を出したあとに偽へ戻っても戻らない理由と、signal を読む when 式が変更検知とどうつながるか、OnPush の中でふつうのフィールドを読む when。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/defer-when)

---

`@defer (when ready())` の `when` は、ほかのトリガーと違ってタイマーもリスナーも付けません。テンプレートの update pass（バインディングを更新する段）のたびに式を評価し、値が変わったかを `bindingUpdated` で比べて、**真に変わったときだけ**`triggerDeferBlock` を呼びます。この章では `ɵɵdeferWhen` を 1 行ずつ読み、いちど本体を出したあとに偽へ戻っても本体のままの理由、signal を読む式が変更検知とつながる道、OnPush のコンポーネントの中で when がどう動くかを、ページの上の本物の `@defer` で確かめます。

読む対象は `packages/core/src/defer/instructions.ts`（227〜262 行目）と、`packages/core/src/render3/bindings.ts` の `bindingUpdated` の一部です。`prefetch when` の `ɵɵdeferPrefetchWhen` は[第 13 回](13-defer-prefetch.md)、`hydrate when` は[第 16 回](16-defer-hydrate-triggers.md)で読みます。

1. [1. 全体像](01-defer-overview.md)
2. [2. ɵɵdefer 命令](02-defer-instruction.md)
3. [3. 塊の記録](03-defer-details.md)
4. [4. 状態を描く](04-defer-render-state.md)
5. [5. minimum と after](05-defer-minimum-after.md)
6. [6. 依存を読み込む](06-defer-resource-loading.md)
7. [7. トリガーから描画まで](07-defer-trigger-flow.md)
8. **8. when**（この章）
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

## 1. when は update pass の命令

コンパイラは `when` の式を、テンプレート関数の update の側（`rf & 2`）に `ɵɵadvance(n); ɵɵdeferWhen(ctx.ready());` の形で出します（構文から命令になるまでは [compiler-control-flow-phases](../compiler/15-compiler-control-flow-phases.md)）。つまり `when` の式は、`{{ name }}` の補間と同じく、**その view が変更検知で更新されるたびに評価される**バインディングの 1 つです。`ɵɵadvance` で塊の TNode を選んでから呼ぶので、233 行目の `getSelectedTNode()` がその塊を返します。

## 2. ɵɵdeferWhen を 1 行ずつ

📄 `angular/packages/core/src/defer/instructions.ts` L227–262 （▶ の行: 231, 233, 236, 239, 241–243, 245, 247–248, 250, 252–254, 256, 259）

```ts
227 │ /**
228 │  * Loads defer block dependencies when a trigger value becomes truthy.
229 │  * @codeGenApi
230 │  */
231 ▶ export function ɵɵdeferWhen(rawValue: unknown) {
232 │   const lView = getLView();
233 ▶   const tNode = getSelectedTNode();
234 │ 
235 │   if (ngDevMode) {
236 ▶     trackTriggerForDebugging(lView[TVIEW], tNode, 'when <expression>');
237 │   }
238 │ 
239 ▶   if (!shouldAttachTrigger(TriggerType.Regular, lView, tNode)) return;
240 │ 
241 ▶   const bindingIndex = nextBindingIndex();
242 ▶   if (bindingUpdated(lView, bindingIndex, rawValue)) {
243 ▶     const prevConsumer = setActiveConsumer(null);
244 │     try {
245 ▶       const value = Boolean(rawValue); // handle truthy or falsy values
246 │       const lDetails = getLDeferBlockDetails(lView, tNode);
247 ▶       const renderedState = lDetails[DEFER_BLOCK_STATE];
248 ▶       if (value === false && renderedState === DeferBlockInternalState.Initial) {
249 │         // If nothing is rendered yet, render a placeholder (if defined).
250 ▶         renderPlaceholder(lView, tNode);
251 │       } else if (
252 ▶         value === true &&
253 ▶         (renderedState === DeferBlockInternalState.Initial ||
254 ▶           renderedState === DeferBlockState.Placeholder)
255 │       ) {
256 ▶         triggerDeferBlock(TriggerType.Regular, lView, tNode);
257 │       }
258 │     } finally {
259 ▶       setActiveConsumer(prevConsumer);
260 │     }
261 │   }
262 │ }
```

1. **235〜237 行目：開発モードでは「when &lt;expression&gt;」と書き留める**

   DevTools などに見せるためのトリガーの名前です（`trackTriggerForDebugging`）。
2. **239 行目：この塊に本体のトリガーを付けてよいか**

   `shouldAttachTrigger(TriggerType.Regular, …)` は、インクリメンタルハイドレーションでサーバーで描いた塊に hydrate のトリガーがあるとき `false` を返します。そのとき本体の when は何もしません（[第 7 回](07-defer-trigger-flow.md)の補足、[第 16 回](16-defer-hydrate-triggers.md)）。
3. **241〜242 行目：値が前回と違うときだけ先へ**

   `nextBindingIndex()` でこの命令のバインディングの欄の番号を取り、`bindingUpdated(lView, bindingIndex, rawValue)` で前回の値と比べます。**比べるのは `Boolean` にする前の値**です（245 行目より前）。
4. **243・259 行目：中では signal を読んでも数えない**

   `setActiveConsumer(null)` で、いまの reactive consumer（テンプレートが読んだ signal を覚えておく相手）を外し、`finally` で戻します。この中で placeholder や loading の view を作ると、その処理が読んだ signal まで外側のテンプレートの依存に数えられてしまうからです。
5. **245〜250 行目：偽で、まだ何も描いていなければ placeholder**

   245 行目で真偽に直し、247 行目で塊の今の状態を読みます。248 行目、偽で `Initial`（まだ何も描いていない。最初の update pass）なら、250 行目で @placeholder を描きます。when の塊の placeholder は、ここで描かれます。
6. **251〜256 行目：真で、まだ Initial か Placeholder なら発火**

   256 行目で `triggerDeferBlock(TriggerType.Regular, …)`（[第 7 回](07-defer-trigger-flow.md)）。最初の update pass で式がもう真なら、placeholder を描かずにいきなり発火します。

📄 `angular/packages/core/src/render3/bindings.ts` L52–56 （▶ の行: 52, 54–55）

```ts
52 ▶   const oldValue = lView[bindingIndex];
53 │ 
54 ▶   if (Object.is(oldValue, value)) {
55 ▶     return false;
56 │   } else {
```

242 行目の中身です。52 行目で前回の値を読み、54 行目の `Object.is` で同じなら 55 行目で `false`。違えば欄に新しい値を書いて `true` を返します（全体と、開発モードの二度目の確認は [ivy-update-instructions](../ivy/10-ivy-update-instructions.md)・[cd-check-no-changes](../cd/07-cd-check-no-changes.md)）。だから、式が真のまま何度変更検知が走っても、`triggerDeferBlock` が呼ばれるのは偽から真に変わった 1 回だけです。`1` から `2` のように真のまま値が変わると 242 行目は `true` になりますが、塊はもう Loading 以降なので 251〜254 行目の条件に入りません。

## 3. 本体を出したあと、偽に戻しても戻らない

偽に戻ると 242 行目は `true`（値が変わった）なので中に入ります。けれども 248 行目は `Initial` のときだけ、251〜254 行目は真のときだけなので、**Complete の塊に偽が来ても、どの枝にも入りません**。ɵɵdeferWhen の中に「本体を消す」行はそもそもありません。仮にどこかから placeholder を描こうとしても、`renderDeferBlockState` は状態の数が今より大きいときしか描かない（Placeholder 0 &lt; Loading 1 &lt; Complete 2 &lt; Error 3）ので、前の状態には戻りません（[第 4 回](04-defer-render-state.md)、[testing-defer](../testing/18-testing-defer.md) の 3 節）。出したり消したりしたいなら、`@defer` を `@if` で包みます。`@if` が偽になれば塊ごと壊れ、真に戻れば新しい塊（`Initial` から）になります。

## 4. signal を読む when 式と、変更検知

`when ready()` の `ready` が signal なら、update pass で式を評価したときに、そのテンプレートの reactive consumer が `ready` を読んだと覚えます。`ready.set(true)` でその consumer が dirty になり、view に印が付いて、スケジューラが変更検知の予定を立てます（道のりは [zoneless-signal-path](../zoneless/07-zoneless-signal-path.md)）。その変更検知でこの view の update pass が走り、241〜256 行目で発火します。**when は signal を購読しているのではなく、signal が変更検知を起こし、変更検知の中で when の命令が値を見る**、という順番です。

ふつうのフィールド（signal でない値）を読む式では、値を書き換えても誰にも知らせが行きません。そのコンポーネントが OnPush なら、印が付くまで update pass は走らず、when も値を見ません（[cd-onpush-markforcheck](../cd/04-cd-onpush-markforcheck.md)）。v22 では `changeDetection` を書かないコンポーネントは OnPush です。

📄 `angular/packages/core/test/acceptance/defer_spec.ts` L563–599 （▶ の行: 567, 575–576, 578–580, 592, 598）

```ts
563 │       @Component({
564 │         selector: 'simple-app',
565 │         imports: [MyLazyCmp, AnotherLazyCmp],
566 │         template: `
567 ▶           @defer (when isVisible) {
568 │             <my-lazy-cmp />
569 │           } @placeholder {
570 │             <another-lazy-cmp />
571 │           }
572 │         `,
573 │       })
574 │       class MyCmp {
575 ▶         isVisible = false;
576 ▶         changeDetectorRef = inject(ChangeDetectorRef);
577 │ 
578 ▶         triggerDeferBlock() {
579 ▶           this.isVisible = true;
580 ▶           this.changeDetectorRef.detectChanges();
581 │         }
582 │       }
583 │ 
584 │       const fixture = TestBed.createComponent(MyCmp);
585 │       fixture.detectChanges();
586 │ 
587 │       // Expect placeholder to be rendered correctly.
588 │       expect(fixture.nativeElement.outerHTML).toContain(
589 │         '<another-lazy-cmp>placeholder</another-lazy-cmp>',
590 │       );
591 │ 
592 ▶       fixture.componentInstance.triggerDeferBlock();
593 │ 
594 │       // Wait for dependencies to load.
595 │       await allPendingDynamicImports();
596 │       fixture.detectChanges();
597 │ 
598 ▶       expect(fixture.nativeElement.outerHTML).toContain('<my-lazy-cmp>main</my-lazy-cmp>');
599 │     });
```

defer\_spec.ts の describe `with OnPush` の 4 件目です。`MyCmp` は `changeDetection` を書いていないので OnPush で、567 行目の `when isVisible` はふつうのフィールドです。578〜581 行目、`isVisible = true` のあと 580 行目で自分の `changeDetectorRef.detectChanges()` を呼び、この view の update pass を走らせて when に真を見せます。592 行目でそれを呼び、読み込みを待って 598 行目で本体を確かめます。

## 5. DEMO：true → false → true と、OnPush の中の when（ライブ）

> **🧪 DEMO — 本物の @defer (when …)（ライブ）**
>
> 下の 2 つは本物の `@defer` です。A はこの章（OnPush）のテンプレートの `@defer (when isOn())` で、`isOn()` は signal の `flag()` を返し、呼ばれた回数を数えます。B は OnPush の子 `defer-wh-plain` の中の `@defer (when isReady())` で、`isReady()` は **ふつうのフィールド**`ready` を返します。どの操作も、50 ms 待って（変更検知が済んでから）`ɵgetDeferBlocks` で各塊の `DEFER_BLOCK_STATE`（`LDeferBlockDetails` の 1 番の欄。内部の形を**読むだけ**、[第 3 回](03-defer-details.md)）と、式が呼ばれた回数を表に足します。どちらの本体も依存の読み込みが無い塊です。
>
> 試し方：A で true → false → true と押すと、最初の true で Complete になり、そのあと false にしても Complete のままです（3 節）。A の呼び出し回数は、この章の view が更新されるたびに増えます（表を足すこと自体も signal の更新なので、1 回の操作で数回増えます）。B は「1 秒後に ready = true」のあと 1 秒待ち、「親のボタン」を押しても Placeholder のままで、B の呼び出し回数も増えません。OnPush の子に印が付かないからです。「子に markForCheck()」を押すと、子の update pass が走って when が真を見て、Complete になります。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/defer-when)

## ここまでの呼び出し

- 👤 `ready.set(true)` — あなたのコード
  - `（テンプレートの consumer が dirty → view に印 → スケジューラ）` — zoneless-signal-path
- `ApplicationRef.tick()` → その view の update pass — cd-refresh-view
  - `ɵɵadvance(n)` → `ɵɵdeferWhen(ctx.ready())` — instructions.ts 231
    - `shouldAttachTrigger(Regular, lView, tNode)` — instructions.ts 239
    - `bindingUpdated(lView, nextBindingIndex(), rawValue)` — bindings.ts 44 — *Object.is で前回と比べる*
    - `setActiveConsumer(null)` — instructions.ts 243
      - `renderPlaceholder(lView, tNode)` — instructions.ts 250 — *偽・Initial*
      - `triggerDeferBlock(TriggerType.Regular, lView, tNode)` — instructions.ts 256 — *真・Initial か Placeholder。第 7 回*

## テストと直し方

### spec と describe

`packages/core/test/acceptance/defer_spec.ts` の describe `with OnPush`（451 行目）に it が 4 件あります：`should render when @defer is used inside of an OnPush component`（452）・`should render when @defer-loaded component uses OnPush`（484）・`should render when both @defer-loaded and host component use OnPush`（516）・`should render when both OnPush components used in other blocks (e.g. @placeholder)`（546）。when を使うのは 4 件目で、残りは `on immediate` の塊を OnPush の中や OnPush の部品で描けるかを見ています。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=@defer with OnPush'
```

📄 `出力（2026-11-06 に実行。抜粋。ログは scratchpad/defer-logs/b-when.log）`

```
Ran 4 of 2693 specs
4 specs, 0 failures
INFO: Elapsed time: 2.146s, Critical Path: 1.52s
//packages/core/test/acceptance:acceptance   PASSED in 1.5s
```

- 2693 件のうち上の 4 件だけが走りました。
- この describe のコンポーネントには `changeDetection` の指定がありません。eae8f7e30b9（2026-03-16、既定を OnPush に）のあと、49a797f510c（2026-09-06）が「既定と同じなので要らない」として `ChangeDetectionStrategy.OnPush` の 7 行を消しました。いまは「書いていない = OnPush」です。

### 直すとしたら

- when の発火の不具合は `instructions.ts` の `ɵɵdeferWhen` です。条件は 248 行目と 251〜254 行目の 2 か所だけなので、まず「その update pass で塊がどの状態だったか」を、このページのデモのように `ɵgetDeferBlocks` で読んで確かめます。
- 直したら defer\_spec.ts の when を使う it の形（`isVisible` を書き換えて `detectChanges()`、`allPendingDynamicImports()` を待つ）で足します。OnPush が絡むなら `with OnPush` の describe です。
- 2025-11 以降に `ɵɵdeferWhen` そのものを直した commit はありません（`git log -- packages/core/src/defer/instructions.ts` の範囲では、98eb24cea04 の idle の timeout と 814eaba265c の生成コードの型だけ）。本家に PR を出すことは勧めません（[第 20 回](20-defer-issues.md)）。

## 聞かれそうな質問

**Q. `@defer (when show)` で show を false に戻したら、placeholder に戻りますか？**

戻りません。偽に戻ると 242 行目の比較は `true` になりますが、248 行目は `Initial` のとき、251〜254 行目は真のときだけなので、どの枝にも入りません。戻したいなら `@if` で包み、塊ごと作り直します。

**Q. when の式が真のまま変更検知が何度も走ると、何度も読み込みますか？**

読み込みません。242 行目の `bindingUpdated` が `Object.is` で前回と同じなら `false` を返すので、256 行目に来るのは値が変わったときだけです。仮に来ても、塊が Loading 以降なら 251〜254 行目の条件に入りません。

**Q. when に signal を書くと、signal の変化を when が直接見ているのですか？**

見ていません。signal の変化はテンプレートの consumer を dirty にして変更検知の予定を立てるだけで、その変更検知の update pass で `ɵɵdeferWhen` が値を受け取ります（4 節）。だから signal でないフィールドを OnPush の中で書き換えても、印が付くまで when は何もしません（デモの B）。

**Q. 最初から真の式なら、placeholder は一瞬出ますか？**

ɵɵdeferWhen からは描きません。最初の update pass で 251〜256 行目に入り、placeholder を描く 250 行目を通らずに発火します。発火の中で @loading があれば Loading を描きます（第 7 回の 335 行目）。

**Q. 243 行目の `setActiveConsumer(null)` が無いと何が困りますか？**

250 行目や 256 行目で placeholder・loading の view を作る処理が signal を読むと、それが外側のテンプレートの consumer の依存として数えられ、その signal の変化で外側の view まで更新されるようになります。243〜259 行目で consumer を外して戻すのは、それを防ぐためです。

## 読み終えて

- when は update pass の命令で、式は変更検知のたびに評価され、`bindingUpdated` で前回と違うときだけ中に入ります。
- 偽で Initial なら placeholder を描き、真で Initial か Placeholder なら `triggerDeferBlock` を呼びます。それ以外の組み合わせでは何もしません。
- だから本体を出したあとに偽へ戻しても戻らず、戻したいなら `@if` で包みます。
- signal の when は、signal が変更検知を起こし、その中で when が値を見ます。ふつうのフィールドを OnPush の中で書き換えたら、印を付けるまで when は値を見ません。

---

← 前: [トリガーから描画まで：triggerDeferBlock と shouldTriggerDeferBlock](07-defer-trigger-flow.md)  
次: [on idle と on immediate：requestIdleCallback と次の描画](09-defer-idle-immediate.md) →
