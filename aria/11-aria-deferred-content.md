[目次](../README.md) › [Angular Aria の内側](README.md) › 第 11 回 / 全 20 回

# DeferredContent：閉じているパネルの中身を作らない

> DeferredContentAware の contentVisible と、DeferredContent が afterRenderEffect で TemplateRef を ViewContainerRef に作る・preserveContent でなければ消す行。Accordion と Tabs のパネルが中身を遅らせて作る仕組みと、最初から作ってほしいという開いている issue。

angular/components · 読了 約 10 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/aria-deferred-content)

---

アコーディオンやタブのパネルの中身を `<ng-template ngAccordionContent>` / `<ng-template ngTabContent>` に書くと、閉じている間はその中身が**作られません**。それをしているのは 84 行しかない 2 つのディレクティブ、`DeferredContentAware`（入れ物の側）と `DeferredContent`（テンプレートの側）です。この章では、`afterRenderEffect` が `TemplateRef` から埋め込みビューを作る行・`preserveContent` でなければ壊す行を追い、プリレンダーした HTML に中身が入らないことと、`@defer` との違いを確かめます。

読む対象は `src/aria/private/deferred-content/deferred-content.ts` と、それを使う `src/aria/tabs/tab-content.ts`・`tab-panel.ts` です（アコーディオンの側は[第 10 回](10-aria-accordion.md)で引用しました）。このファイルは 22.1.8 と e81c398a86 で同じです。

1. [1. 全体像](01-aria-overview.md)
2. [2. SignalLike](02-aria-signal-like.md)
3. [3. SortedCollection](03-aria-collection.md)
4. [4. イベントマネージャ](04-aria-events.md)
5. [5. ListFocus](05-aria-list-focus.md)
6. [6. ListNavigation](06-aria-list-navigation.md)
7. [7. ListSelection](07-aria-list-selection.md)
8. [8. ListTypeahead](08-aria-typeahead.md)
9. [9. Listbox](09-aria-listbox.md)
10. [10. Accordion](10-aria-accordion.md)
11. **11. DeferredContent**（この章）
12. [12. Tabs](12-aria-tabs.md)
13. [13. Toolbar](13-aria-toolbar.md)
14. [14. Tree](14-aria-tree.md)
15. [15. Grid](15-aria-grid.md)
16. [16. Grid のセル](16-aria-grid-cells.md)
17. [17. Combobox](17-aria-combobox.md)
18. [18. Menu](18-aria-menu.md)
19. [19. テスト](19-aria-testing.md)
20. [20. issue と PR を読む](20-aria-issues.md)

## 1. 2 つのディレクティブ：入れ物とテンプレート

📄 `components/src/aria/private/deferred-content/deferred-content.ts` L21–53 （▶ の行: 24, 26–27, 37–41, 45, 47–51, 53）

````ts
21 │ /**
22 │  * A container directive controls the visibility of its content.
23 │  */
24 ▶ @Directive()
25 │ export class DeferredContentAware {
26 ▶   readonly contentVisible = signal(false);
27 ▶   readonly preserveContent = model(false);
28 │ }
29 │ 
30 │ /**
31 │  * DeferredContent loads/unloads the content based on the visibility.
32 │  * The visibilty signal is sent from a parent directive implements
33 │  * DeferredContentAware.
34 │  *
35 │  * Use this directive as a host directive. For example:
36 │  *
37 ▶  * ```ts
38 ▶  *   @Directive({
39 ▶  *     selector: 'ng-template[AccordionContent]',
40 ▶  *     hostDirectives: [DeferredContent],
41 ▶  *   })
42 │  *   class AccordionContent {}
43 │  * ```
44 │  */
45 ▶ @Directive()
46 │ export class DeferredContent implements OnDestroy {
47 ▶   private readonly _deferredContentAware = inject(DeferredContentAware, {optional: true});
48 ▶   private readonly _templateRef = inject(TemplateRef);
49 ▶   private readonly _viewContainerRef = inject(ViewContainerRef);
50 ▶   private _currentViewRef: EmbeddedViewRef<unknown> | null = null;
51 ▶   private _isRendered = false;
52 │ 
53 ▶   readonly deferredContentAware = signal(this._deferredContentAware);
````

1. **24〜28 行目 DeferredContentAware は signal を 2 つ持つだけ**

   26 行目の `contentVisible`（いま見えているか。既定 false）と、27 行目の `preserveContent`（隠れても中身を残すか。`model` なので入力にもなる。既定 false）です。selector の無い `@Directive()` なので、テンプレートに直接は書けません。パネルの側が `hostDirectives` で付けます（2 節）。
2. **37〜43 行目 DeferredContent も hostDirectives で使う**

   コメントの例のとおり、`ng-template[...]` を selector に持つディレクティブが `hostDirectives: [DeferredContent]` として付けます。
3. **47〜49 行目 3 つを inject する**

   47 行目で上の `DeferredContentAware` を `optional: true` で探します。テンプレートの要素から親の要素へ DI をたどるので、パネルの `hostDirectives` に付いた Aware が見つかります。48 行目の `TemplateRef` は自分が付いた `<ng-template>`、49 行目の `ViewContainerRef` はその場所です（[view-container](../template/04-view-container.md)）。
4. **50〜53 行目 作ったビューと、作ったかどうか**

   50 行目に作った `EmbeddedViewRef`、51 行目に「作ってあるか」を持ちます。53 行目で Aware を `signal` に包んでいます。ツリーの `TreeItemGroup` は、この signal に自分の持ち主の項目を `set` し直します（tree-item-group.ts。[第 14 回](14-aria-tree.md)）。

## 2. afterRenderEffect：作る・壊す

📄 `components/src/aria/private/deferred-content/deferred-content.ts` L55–84 （▶ の行: 56–62, 64–66, 72–73, 79–81）

```ts
55 │   constructor() {
56 ▶     afterRenderEffect({
57 ▶       write: () => {
58 ▶         if (this.deferredContentAware()?.contentVisible()) {
59 ▶           if (!this._isRendered) {
60 ▶             this._destroyContent();
61 ▶             this._currentViewRef = this._viewContainerRef.createEmbeddedView(this._templateRef);
62 ▶             this._isRendered = true;
63 │           }
64 ▶         } else if (!this.deferredContentAware()?.preserveContent()) {
65 ▶           this._destroyContent();
66 ▶           this._isRendered = false;
67 │         }
68 │       },
69 │     });
70 │   }
71 │ 
72 ▶   ngOnDestroy(): void {
73 ▶     this._destroyContent();
74 │   }
75 │ 
76 │   private _destroyContent() {
77 │     const ref = this._currentViewRef;
78 │ 
79 ▶     if (ref && !ref.destroyed) {
80 ▶       ref.destroy();
81 ▶       this._currentViewRef = null;
82 │     }
83 │   }
84 │ }
```

1. **56〜57 行目 描画のあとの write の段階で走る**

   `afterRenderEffect` は、中で読んだ signal（ここでは `contentVisible` と `preserveContent`）が変わったとき、**次の描画のあと**に走ります（[signals-after-render-effect](../signals/10-signals-after-render-effect.md)）。
2. **58〜63 行目 見えていて、まだ作っていなければ作る**

   60 行目で念のため前のビューを壊し、61 行目で `createEmbeddedView(this._templateRef)`、62 行目で `_isRendered = true`。既に作ってあれば何もしません。
3. **64〜67 行目 隠れていて、preserveContent でなければ壊す**

   65 行目で壊し、66 行目で「作っていない」に戻します。次に見えたとき 59 行目から**作り直し**になるので、中のコンポーネントの状態は残りません。`preserveContent` が true なら 64 行目の条件が偽になり、隠れても何もしません（ビューは残り、次に見えても 59 行目で作り直しません）。
4. **72〜83 行目 自分が壊れるとき**

   `ngOnDestroy` で同じ `_destroyContent()` を呼びます。79 行目で、まだ壊れていないビューだけを `destroy()` します。

| contentVisible | preserveContent | 作ってある？ | すること |
| --- | --- | --- | --- |
| true | どちらでも | いいえ | 作る（60〜62 行目） |
| true | どちらでも | はい | 何もしない |
| false | false（既定） | どちらでも | 壊す（65〜66 行目） |
| false | true | どちらでも | 何もしない（作っていなければ作らない） |

64 行目は `preserveContent()` を読むので、隠れている間に `preserveContent` を true から false に変えると、それだけでこの effect が走り、残しておいたビューが壊れます。デモの最後のログがそれです。

## 3. 使っている部品

📄 `components/src/aria/tabs/tab-content.ts` L12–34 （▶ の行: 15–17, 30, 32）

````ts
12 │ /**
13 │  * A TabContent container for the lazy-loaded content.
14 │  *
15 ▶  * This structural directive should be applied to an `ng-template` within an `ngTabPanel`.
16 ▶  * It enables lazy loading of the tab's content, meaning the content is only rendered
17 ▶  * when the tab is activated for the first time.
18 │  *
19 │  * ```html
20 │  * <div ngTabPanel value="myTabId">
21 │  *   <ng-template ngTabContent>
22 │  *     <p>This content will be loaded when 'myTabId' is selected.</p>
23 │  *   </ng-template>
24 │  * </div>
25 │  * ```
26 │  *
27 │  * @see [Tabs](guide/aria/tabs)
28 │  */
29 │ @Directive({
30 ▶   selector: 'ng-template[ngTabContent]',
31 │   exportAs: 'ngTabContent',
32 ▶   hostDirectives: [DeferredContent],
33 │ })
34 │ export class TabContent {}
````

📄 `components/src/aria/tabs/tab-panel.ts` L92–121 （▶ の行: 92, 96–98, 108–109）

```ts
 92 ▶   private readonly _tabContent = contentChild(TabContent);
 93 │ 
 94 │   constructor() {
 95 │     // Connect the panel's hidden state to the DeferredContentAware's visibility.
 96 ▶     afterRenderEffect({
 97 ▶       write: () => {
 98 ▶         this._deferredContentAware.contentVisible.set(this.visible());
 99 │       },
100 │     });
101 │ 
102 │     // Check for any violations after the DOM has been updated.
103 │     if (typeof ngDevMode === 'undefined' || ngDevMode) {
104 │       afterRenderEffect({
105 │         read: () => {
106 │           const violations: string[] = [];
107 │ 
108 ▶           if (!this._tabContent()) {
109 ▶             violations.push('ngTabPanel must have an ngTabContent structural directive to render.');
110 │           }
111 │           if (!this._tabs._tabMap().has(this.value())) {
112 │             violations.push(
113 │               `ngTabPanel with value '${this.value()}' does not have a corresponding ngTab.`,
114 │             );
115 │           }
116 │ 
117 │           reportViolations(violations, this.element);
118 │         },
119 │       });
120 │     }
121 │   }
```

タブの中身の側（`TabContent`）は、30 行目の selector `ng-template[ngTabContent]` と 32 行目の `hostDirectives: [DeferredContent]` だけで、中身は空です。パネルの側（`TabPanel`）は `hostDirectives` で `DeferredContentAware` を付け（[第 12 回](12-aria-tabs.md)）、96〜100 行目の `afterRenderEffect` で自分の `visible()` を `contentVisible` に写します。アコーディオンのパネルも同じ形です（[第 10 回](10-aria-accordion.md)の 4 節）。

`DeferredContent` を使っているのは、src/aria を grep すると 5 つの部品です。アコーディオン（`AccordionPanel` が Aware・`AccordionContent` が DeferredContent）、タブ（`TabPanel`・`TabContent`）、メニュー（`Menu`・`MenuContent`。[第 18 回](18-aria-menu.md)）、ツリー（`TreeItem` が `DeferredContentAware` を継承し、`TreeItemGroup` が DeferredContent。[第 14 回](14-aria-tree.md)）、コンボボックス（`Combobox` が継承し、`ComboboxPopup` が DeferredContent。[第 17 回](17-aria-combobox.md)）です。

> [!WARNING]
> **ハマりどころ**
>
> 15〜17 行目の doc コメントは「タブが**初めて**選ばれたときに作る（only rendered when the tab is activated for the first time）」と書いていますが、2 節の表のとおり、`preserveContent` が既定の false なら隠れるたびに壊れ、次に選ばれたときに作り直されます。開いている PR #33966 は、この doc を「when the tab is activated」に直しています（アコーディオンの `AccordionContent` の「first expanded」も同じく）。

## 4. プリレンダーした HTML に中身は入るか

入りません。2 節の 56 行目が `afterRenderEffect` で、サーバーでは何もしない（登録もせずに返る。[signals-after-render-effect](../signals/10-signals-after-render-effect.md)）ので、`contentVisible` を写す側（96〜100 行目）も、作る側（58〜63 行目）も、サーバーでは走りません。最初から開いているパネルでも同じです。このページの 6 節のデモ（A は `[(expanded)]` の初期値が `true`）を、開発ビルド（`--configuration development`。このサイトは `outputMode: static` なので開発ビルドでもプリレンダーが走る）で出力した HTML から、2 つのパネルを抜き出したのが次です（`_ngcontent-*` 属性は省いた）。

📄 `build-aria-c/browser/chapter/aria-deferred-content/index.html（抜粋）`

```
<div role="region" ngaccordionpanel="" id="dcd-panel-a" class="dcd-panel" aria-labelledby="dcd-trigger-a"><!--container--></div>
<div role="region" ngaccordionpanel="" id="dcd-panel-b" class="dcd-panel" aria-labelledby="dcd-trigger-b" inert="true"><!--container--></div>
```

A のパネルには `inert` が付いていません（パネルの `visible()` は host のバインディングなのでサーバーでも計算される）が、中は `<!--container-->`（`ViewContainerRef` の目印のコメント）だけで、子のコンポーネントはありません。ブラウザで起動し、ハイドレーション（サーバーの HTML に Angular がつながること。[hydration](../platform/09-hydration.md)）のあとの描画で 96〜100 行目と 58〜63 行目が走って、初めて中身が作られます。検索エンジンに中身を読ませたい・最初から作っておきたい、というのが開いている #33950 です（6 節）。

## 5. @defer との違い

`@defer`（[defer](../template/03-defer.md)）は、ブロックの中で使うコンポーネントを**別のチャンクに分けて、あとで読み込む**仕組みです。`DeferredContent` はコードを分けません。デモの子のコンポーネント `DcdChild` は章のコンポーネントの `imports` に静的に入っているので、章と同じチャンクに入っています。`DeferredContent` がするのは、61 行目の `createEmbeddedView` を**見えるまで呼ばない**ことと、隠れたら 80 行目で `destroy()` することだけです。読み込みも遅らせたいなら、`ngTabContent` の中に `@defer` を置く、という組み合わせになります（この組み合わせはこの章では試していません）。

## 6. 開いている #33950 と PR #33966

#33950（2026-10-12）は「タブのパネルの中身を、最初から作りたい（初期化しておきたいコンポーネントや、SSR で SEO に要るデータがある）」という報告です。本文は「`ngTabContent` は `ng-template` にしか付けられず、無いと警告が出る」と書いています。その警告が 108〜110 行目です。

開いている PR #33966（2026-10-16、外部のコントリビューター）は、`ngTabPanel` / `ngAccordionPanel` の直下に普通に書いた中身は**いまでも最初から作られて DOM に残り、隠れている間は `inert` が付くだけ**だとして、108〜110 行目（とアコーディオンの同じ警告）を消し、その使い方を正式なものにする変更です。`TabPanel` はテンプレートを持たない `@Directive` なので、パネルの要素の子は普通の DOM として作られます。PR の本文は「こうすればサーバーで描いた HTML にも中身が入る」と書いています。2026-11-02 の時点で開いたままです。

## 7. デモ：閉じているパネルの中の子は作られているか

> **🧪 DEMO — 閉じているパネルの中の子のコンポーネントは作られているか**
>
> 本物のアコーディオン（@angular/aria 22.1.8）です。どちらのパネルにも、`ngOnInit` と破棄のときにログを書く子のコンポーネント `app-dcd-child` を `<ng-template ngAccordionContent>` の中に置きました。A は `[(expanded)]` の初期値が `true`、B は `false` です。キーボードで操作できます。Tab で見出しのボタンに入り、↑↓ で移り、Enter / Space で開閉します。子の「+1」でカウンタを増やしてから閉じて開くと、状態が残るかが分かります。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/aria-deferred-content)

2026-11-02 にヘッドレスの Chrome で操作して記録したログです（番号はログの通し番号）。

- **読み込んだ直後**：`01 「A」の子が作られた` だけが出ます。B の子は作られていません。
- **B を開く**：`02 B を開いた` のあとに `03 「B」の子が作られた`。expandedChange が先で、子が作られるのは描画のあと（58〜63 行目）だからです。
- **+1 を 2 回押して B を閉じる**：`05 「B」の子が壊された（カウンタは 2 だった）`。65 行目です。
- **B をもう一度開く**：`07 「B」の子が作られた`。作り直しなのでカウンタは 0 に戻ります。
- **preserveContent を ON、+1、B を閉じる**：「閉じた」だけが出て「壊された」は出ません。このときパネルの HTML は `inert="true"` で、中に `<app-dcd-child name="B">`（カウンタ 1）が残っていました。もう一度開くとカウンタは 1 のままです。
- **B を閉じてから preserveContent を OFF**：`12 B の preserveContent = false` の直後に `13 「B」の子が壊された（カウンタは 1 だった）`。2 節の最後に書いた動きです。

## 8. 呼び出しの連なり（B を開く）

- 👤 `トリガー B をクリック` — あなたの操作
  - `ListExpansion.open → expanded.set(true)` — expansion.ts — *第 10 回*
  - `描画（AccordionPanel の visible() が true、inert が外れる）` — accordion-panel.ts
    - `afterRenderEffect：contentVisible.set(visible())` — accordion-panel.ts（tab-panel.ts L96-100 と同じ形）
    - `afterRenderEffect：DeferredContent の write` — deferred-content.ts L56 — *contentVisible が変わったので走る*
      - `_viewContainerRef.createEmbeddedView(_templateRef)` — L61
        - `DcdChild の ngOnInit` — あなたのコンポーネント

## テストと直し方

📄 `components/src/aria/private/deferred-content/deferred-content.spec.ts` L35–62 （▶ の行: 35, 40, 43–44, 49–50, 55–56, 58, 60）

```ts
35 ▶   describe('with preserveContent', () => {
36 │     let component: TestComponent;
37 │ 
38 │     beforeEach(() => {
39 │       component = fixture.componentInstance;
40 ▶       component.preserveContent.set(true);
41 │     });
42 │ 
43 ▶     it('does not create the content until first visible.', async () => {
44 ▶       collapsible.injector.get(Collapsible).contentVisible.set(false);
45 │       await fixture.whenStable();
46 │       expect(collapsible.nativeElement.innerText).toBe('');
47 │     });
48 │ 
49 ▶     it('creates the content when first visible with preserveContent.', async () => {
50 ▶       collapsible.injector.get(Collapsible).contentVisible.set(true);
51 │       await fixture.whenStable();
52 │       expect(collapsible.nativeElement.innerText).toBe('Lazy Content');
53 │     });
54 │ 
55 ▶     it('does not remove the content when hidden.', async () => {
56 ▶       collapsible.injector.get(Collapsible).contentVisible.set(true);
57 │       await fixture.whenStable();
58 ▶       collapsible.injector.get(Collapsible).contentVisible.set(false);
59 │       await fixture.whenStable();
60 ▶       expect(collapsible.nativeElement.innerText).toBe('Lazy Content');
61 │     });
62 │   });
```

deferred-content.spec.ts は 5 本です。`it('removes the content when hidden.')`（:23）と `it('creates the content when the container becomes visible.')`（:29）、そして `describe('with preserveContent')`（:35）の 3 本です。40 行目で `preserveContent` を true にし、55〜60 行目で「見えた → 隠れた」のあとも `innerText` が残ることを見ます（2 節の表の最後の行）。テスト用に `Collapsible`（Aware を `hostDirectives` で付けるディレクティブ）と `CollapsibleContent` を spec の中で作っていて、アコーディオンやタブを使いません。

📄 `ターミナル`

```
cd ~/angular-research/components
pnpm bazel test //src/aria/private/deferred-content:unit_tests_chromium --nocache_test_results --test_output=all
```

📄 `出力（抜粋。2026-11-02 に実行）`

```
Chromium: |██████████████████████████████| 1/1 test files | 5 passed, 0 failed
Finished running tests in 0.3s, all tests passed! 🎉
INFO: Elapsed time: 1.134s, Critical Path: 0.86s
//src/aria/private/deferred-content:unit_tests_chromium                  PASSED in 0.8s
```

1. **無い it**

   「隠れている間に `preserveContent` を false にすると壊れる」と「Aware が無いとき（47 行目の `optional`）」を確かめる it は、この spec にはありません。足すなら private/deferred-content/deferred-content.spec.ts です。
2. **直すとしたら**

   作る・壊すの条件は `DeferredContent` のコンストラクタの `afterRenderEffect`（56〜69 行目）だけです。最初から作る選択肢を足す変更なら、#33966 のようにパネルの側の警告（tab-panel.ts 108〜110 行目）を触ることになります。
3. **issue を読むときの手がかり**

   「中身が消える」「状態が戻る」報告は、まず `preserveContent` を見ます。「SSR で中身が出ない」報告は 56 行目が `afterRenderEffect` であることが答えです。#33950 には既に PR #33966 が付いています（[第 20 回](20-aria-issues.md)）。

## 聞かれそうな質問

**Q. SSR（プリレンダー）の HTML に、パネルの中身は入りますか？**

入りません。最初から開いているパネルでもです。作るのが 56 行目の `afterRenderEffect` で、サーバーでは走らないからです。4 節のとおり、このページのプリレンダー出力でも、開いている A のパネルの中は `<!--container-->` だけでした。中身を HTML に入れたいなら、いまは `ng-template` を使わずパネルの直下に書く（開発モードで 108〜110 行目の警告が出る）ことになり、それを正式にしようとしているのが PR #33966 です。

**Q. パネルを閉じると、中身は破棄されますか？**

既定では破棄されます（64〜66 行目）。中のコンポーネントの `ngOnDestroy` / `DestroyRef.onDestroy` も呼ばれます。デモの「壊された」のログがそれです。パネルに `[preserveContent]="true"` を付けると、64 行目の条件が偽になり、閉じても残ります。

**Q. 中のコンポーネントの状態は残りますか？**

`preserveContent` が false なら残りません。閉じたときに壊れ、開いたときに 61 行目で新しく作られるからです（デモのカウンタが 2 から 0 に戻る）。`preserveContent` が true なら、同じビューが残るので状態も残ります（カウンタ 1 のまま）。閉じている間は、パネルに `inert` が付いた状態で DOM に残っています。

**Q. @defer と同じものですか？**

違います。`@defer` はコードを別のチャンクに分けて読み込みを遅らせ、`DeferredContent` はコードを分けずにビューを作るのを遅らせるだけです（61 行目の `createEmbeddedView`）。

## 読み終えて

- `DeferredContentAware` は `contentVisible` と `preserveContent` の 2 つの signal だけ。パネルが `hostDirectives` で付けて、見えるかどうかを写す（deferred-content.ts L24-28、tab-panel.ts L96-100）。
- `DeferredContent` は `afterRenderEffect` の中で、見えたら `createEmbeddedView`、隠れたら `preserveContent` でない限り `destroy`（L56-69）。
- サーバーでは `afterRenderEffect` が走らないので、プリレンダーした HTML に中身は入らない。最初から開いているパネルでも同じ。
- `@defer` と違ってコードは分けない。遅らせるのはビューを作ることだけ。
- tab-content.ts の doc コメントの「初めて」は、既定の `preserveContent: false` の動きと合っていない。#33966 が直そうとしている。

---

← 前: [Accordion：ListExpansion で開いて閉じる](10-aria-accordion.md)  
次: [Tabs：選んだタブとパネルを結ぶ](12-aria-tabs.md) →
