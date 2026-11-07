[目次](../README.md) › [Angular Aria の内側](README.md) › 第 19 回 / 全 20 回

# Aria のテスト：ハーネス・axe-core・violations

> Behavior・Pattern・ディレクティブの 3 種類の spec（signal だけで Pattern を確かめる書き方と、TestBed とブラウザ）、private/testing/test-helpers.ts、ComboboxHarness などのテストハーネス、cdk/testing/private の runAccessibilityChecks 経由で axe-core を走らせる spec、開発モードだけの validate と reportViolations（console.warn）。components リポジトリの bazel のブラウザテスト（chromium と firefox、strict\_deps\_test）の走らせ方と件数、このサイトの Vitest + jsdom で Aria を動かした結果。

angular/components · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/aria-testing)

---

この章は、Angular Aria のテストを「どこに・どう書かれ・どう走るか」で読みます。spec は 3 種類あり（Behavior・Pattern・ディレクティブ）、そのうえにテストハーネス、axe-core による ARIA の検査、開発モードの `reportViolations` があります。最後に components の bazel でブラウザのテストを走らせる形と件数、このサイトの `ng test`（Vitest + jsdom）で Aria を動かした結果を見ます。

読む対象は `src/aria/private/ui-pattern-rules.md`、各部品の `*.spec.ts`、`src/aria/private/testing/test-helpers.ts`、`src/aria/private/utils/violations.ts`、`src/cdk/testing/private/run-accessibility-checks.ts`、`src/aria/combobox/testing/combobox-harness.ts`、`test/angular-test.init.ts`、`tools/defaults.bzl` です。

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
11. [11. DeferredContent](11-aria-deferred-content.md)
12. [12. Tabs](12-aria-tabs.md)
13. [13. Toolbar](13-aria-toolbar.md)
14. [14. Tree](14-aria-tree.md)
15. [15. Grid](15-aria-grid.md)
16. [16. Grid のセル](16-aria-grid-cells.md)
17. [17. Combobox](17-aria-combobox.md)
18. [18. Menu](18-aria-menu.md)
19. **19. テスト**（この章）
20. [20. issue と PR を読む](20-aria-issues.md)

## 1. 3 つの層、3 種類の spec

Aria はディレクティブ → UI Pattern → Behavior の 3 層です（[第 1 回](01-aria-overview.md)）。spec も層ごとに分かれ、それぞれのパッケージの横に置かれます。

| 種類 | 置き場所の例 | 作るもの | DOM |
| --- | --- | --- | --- |
| Behavior の spec | private/behaviors/popup/popup.spec.ts | `new PopupControl({...signal})` | 使わない |
| Pattern の spec | private/combobox/combobox.spec.ts | `new ComboboxPattern({...signal})` | 要素を手で作って入力に渡す |
| ディレクティブの spec | combobox/combobox.spec.ts | `TestBed.createComponent(...)` | 本物の DOM とイベント |
| ハーネスの spec | combobox/testing/combobox-harness.spec.ts | `TestbedHarnessEnvironment.loader(fixture)` | 本物の DOM |

Pattern が持つべきメソッドは、private/ui-pattern-rules.md に決まりとして書かれています。

📄 `components/src/aria/private/ui-pattern-rules.md` L57–86 （▶ の行: 59, 61–64, 85–86）

````md
57 │ #### Core Methods
58 │ 
59 ▶ Each UI Pattern implements the following core methods:
60 │ 
61 ▶ - `validate()`
62 ▶ - `setDefaultState()`
63 ▶ - `onKeydown()`
64 ▶ - `onPointerdown()`
65 │ 
66 │ ```ts
67 │ // License...
68 │ 
69 │ // Imports...
70 │ 
71 │ // Type Definition...
72 │ 
73 │ export class ExamplePattern {
74 │   /** Controls behavior1 for the accessiblity pattern. */
75 │   behavior1: Behavior1;
76 │ 
77 │   /** Controls behavior2 for the accessiblity pattern. */
78 │   behavior2: Behavior2;
79 │ 
80 │   constructor(inputs: ExampleInputs) {
81 │     this.behavior1 = new Behavior1(inputs);
82 │     this.behavior2 = new Behavior2(inputs);
83 │   }
84 │ 
85 ▶   /** Checks that the internal state of the pattern is valid. */
86 ▶   validate(): string[] {}
````

61 行目の `validate()` は 85〜86 行目のとおり「Pattern の中の状態が正しいかを調べ、違反の文字列の配列を返す」メソッドです。3 節の `reportViolations` と、ディレクティブの spec の「構造の検査」がこれを使います。snapshot で `validate(): string[]` を持つ Pattern は accordion・tree・listbox・menu・grid の 5 つで、combobox にはありません（grep）。

### Behavior の spec：signal だけ

📄 `components/src/aria/private/behaviors/popup/popup.spec.ts` L9–35 （▶ の行: 9–10, 14–17, 19, 28, 31–33）

```ts
 9 ▶ import {signal} from '../signal-like/signal-like';
10 ▶ import {PopupTypes, PopupControl, PopupControlInputs} from './popup';
11 │ 
12 │ type TestInputs = Partial<Pick<PopupControlInputs, 'expanded'>>;
13 │ 
14 ▶ function getPopupControl(inputs: TestInputs = {}): PopupControl {
15 ▶   const expanded = inputs.expanded || signal(false);
16 ▶   const controls = signal('popup-element-id');
17 ▶   const hasPopup = signal(PopupTypes.LISTBOX);
18 │ 
19 ▶   return new PopupControl({
20 │     controls,
21 │     expanded,
22 │     hasPopup,
23 │   });
24 │ }
25 │ 
26 │ describe('Popup Control', () => {
27 │   describe('#open', () => {
28 ▶     it('should set expanded to true and popup inert to false', () => {
29 │       const control = getPopupControl();
30 │ 
31 ▶       expect(control.inputs.expanded()).toBeFalse();
32 ▶       control.open();
33 ▶       expect(control.inputs.expanded()).toBeTrue();
34 │     });
35 │   });
```

1. **9 行目 signal は Angular からではなく signal-like から**

   Behavior は `SignalLike` を入力に取るので（[第 2 回](02-aria-signal-like.md)）、spec も signal-like.ts の `signal` で入力を作ります。TestBed も注入コンテキストも要りません。
2. **14〜24 行目 既定の入力を作る小さな関数**

   15 行目、呼び出し側が `expanded` を渡せば使い、渡さなければ `signal(false)`。list-focus.spec.ts の `getListFocus` なども同じ「既定を置いて上書き」の形です（list-focus.spec.ts の形は[第 5 回](05-aria-list-focus.md)）。
3. **28〜33 行目 メソッドを呼んで、入力の signal を見る**

   `open()` を呼び、渡した `expanded` が true になったかを見るだけです。28 行目の it の名前には「popup inert to false」とありますが、popup.ts（[第 17 回](17-aria-combobox.md)の 6 節）に inert の処理はありません。`PopupControl` は 2025-07-21 の 4ce794ca70 で spec と一緒に入り、そのまま使われていない Behavior です。spec の名前とコードが食い違っていても、テストは通ります。

### Pattern の spec：要素は手で作る

📄 `components/src/aria/private/combobox/combobox.spec.ts` L15–50 （▶ の行: 15–17, 26, 29–30, 32, 35, 38, 41–42, 50）

```ts
15 ▶     const element = document.createElement('input');
16 ▶     const value = signal('');
17 ▶     const expanded = signal(false);
18 │     const alwaysExpanded = signal(inputs.alwaysExpanded ?? false);
19 │     const disabled = signal(inputs.disabled ?? false);
20 │     const readonly = signal(inputs.readonly ?? false);
21 │     const inlineSuggestion = signal<string | undefined>(inputs.inlineSuggestion);
22 │ 
23 │     // Mock a generic popup pattern
24 │     const popupId = signal('popup-1');
25 │     const activeDescendant = signal<string | undefined>('item-1');
26 ▶     const controlTarget = document.createElement('div');
27 │     const popupType = signal<'listbox' | 'tree' | 'grid' | 'dialog'>(inputs.popupType ?? 'listbox');
28 │ 
29 ▶     const combobox = signal<ComboboxPattern | undefined>(undefined);
30 ▶     const popup = new ComboboxPopupPattern({
31 │       popupType,
32 ▶       controlTarget: signal(controlTarget),
33 │       activeDescendant,
34 │       popupId,
35 ▶       combobox,
36 │     });
37 │ 
38 ▶     const pattern = new ComboboxPattern({
39 │       alwaysExpanded,
40 │       value,
41 ▶       element: signal(element),
42 ▶       popup: signal(popup),
43 │       inlineSuggestion,
44 │       disabled,
45 │       readonly,
46 │       expanded,
47 │       expandable: signal(true),
48 │     });
49 │ 
50 ▶     combobox.set(pattern);
```

📄 `components/src/aria/private/combobox/combobox.spec.ts` L92–108 （▶ の行: 93–94, 97–98, 105–106）

```ts
 92 │   describe('Expansion via Keyboard', () => {
 93 ▶     it('should open on ArrowDown when collapsed', () => {
 94 ▶       const {pattern, expanded} = setup();
 95 │       expect(expanded()).toBe(false);
 96 │ 
 97 ▶       pattern.onKeydown(createKeyboardEvent('keydown', 40, 'ArrowDown'));
 98 ▶       expect(expanded()).toBe(true);
 99 │     });
100 │ 
101 │     it('should close on Escape when expanded', () => {
102 │       const {pattern, expanded} = setup();
103 │       expanded.set(true);
104 │ 
105 ▶       pattern.onKeydown(createKeyboardEvent('keydown', 27, 'Escape'));
106 ▶       expect(expanded()).toBe(false);
107 │     });
108 │   });
```

1. **15・26 行目 本物の要素を 2 つだけ**

   `ComboboxPattern` は入力欄のタグ名（`isEditable`）と、キーを投げる先（`controlTarget`）に要素が要るので、`document.createElement` で作ります。ページには挿入しません。
2. **29〜50 行目 popup と combobox を互いに渡す**

   popup は combobox を、combobox は popup を入力に持ちます。29 行目で空の signal を作って 30〜36 行目の popup に渡し、38〜48 行目で combobox を作り、50 行目でその signal に入れて輪を閉じます。ディレクティブの登録（`_registerPopup`）の代わりです。
3. **97〜98 行目 onKeydown を直接呼ぶ**

   `createKeyboardEvent` は `@angular/cdk/testing/private` の関数で、`KeyboardEvent` を作るだけです。97 行目で Pattern の `onKeydown` を呼び、98 行目で `expanded` の signal を見ます。描画も effect もありません。だから「描画のあとに中継する」`keyboardEventRelayEffect` は、Pattern の spec では `keyboardEventRelay()` の値を見るところまでしか確かめられません（第 17 回の「テストと直し方」）。

### ディレクティブの spec：TestBed とブラウザ

ディレクティブの spec は TestBed でテスト用のコンポーネントを作り、本物の要素に `dispatchEvent` して、属性やフォーカスを見ます。書き方の具体は各部品の章（[第 17 回](17-aria-combobox.md)・[第 18 回](18-aria-menu.md)の「テストと直し方」）にあります。ここでは、どの spec にも出てくる小さな関数を 1 つ見ます。

📄 `components/src/aria/private/testing/test-helpers.ts` L1–15 （▶ の行: 10–11, 13–14）

```ts
 1 │ /**
 2 │  * @license
 3 │  * Copyright Google LLC All Rights Reserved.
 4 │  *
 5 │  * Use of this source code is governed by an MIT-style license that can be
 6 │  * found in the LICENSE file at https://angular.dev/license
 7 │  */
 8 │ 
 9 │ /**
10 ▶  * Yields execution to the microtask queue, allowing MutationObserver callbacks to fire.
11 ▶  * Useful for testing async behaviors without relying on Zone.js.
12 │  */
13 ▶ export function waitForMicrotasks(): Promise<void> {
14 ▶   return new Promise(resolve => setTimeout(resolve, 0));
15 │ }
```

`waitForMicrotasks` は、10 行目のコメントでは「マイクロタスクの列に譲って `MutationObserver` のコールバックを走らせる」ですが、14 行目の中身は `setTimeout(resolve, 0)`、つまり**マクロタスク**を 1 つ待ちます。マイクロタスク（`MutationObserver` のコールバックもその 1 つ）はマクロタスクの前に全部終わるので、結果として「その時点までのマイクロタスクがすべて済んだあと」になります。11 行目のとおり zone.js の `fakeAsync` に頼らない待ち方です。src/aria の 8 つの spec ファイルが使っています（grep。private/testing の BUILD.bazel の `ts_project` は `testonly = True`）。

## 2. 開発モードの検査：validate と reportViolations

📄 `components/src/aria/private/menu/menu.ts` L197–211 （▶ の行: 198, 201, 203–207, 210）

```ts
197 │   /** Returns a set of violations */
198 ▶   validate(): string[] {
199 │     const violations: string[] = [];
200 │ 
201 ▶     const values = this.inputs
202 │       .items()
203 ▶       .map(i => i.value())
204 ▶       .filter((val): val is V => val !== undefined);
205 ▶     const duplicates = values.filter((val, idx) => values.indexOf(val) !== idx);
206 ▶     if (duplicates.length > 0) {
207 ▶       violations.push(`Duplicate value '${duplicates[0]}' detected inside ngMenu.`);
208 │     }
209 │ 
210 ▶     return violations;
211 │   }
```

📄 `components/src/aria/menu/menu.ts` L193–209 （▶ の行: 193–197, 202–203）

```ts
193 ▶     // Check for any violations after the DOM has been updated.
194 ▶     if (typeof ngDevMode === 'undefined' || ngDevMode) {
195 ▶       afterRenderEffect({
196 ▶         read: () => {
197 ▶           reportViolations(this._pattern.validate(), this.element);
198 │         },
199 │       });
200 │     }
201 │ 
202 ▶     afterNextRender(() => {
203 ▶       this._collection.startObserving(this.element);
204 │     });
205 │   }
206 │ 
207 │   ngOnDestroy() {
208 │     this._collection.stopObserving();
209 │   }
```

📄 `components/src/aria/private/utils/violations.ts` L1–17 （▶ の行: 9–14）

```ts
 1 │ /**
 2 │  * @license
 3 │  * Copyright Google LLC All Rights Reserved.
 4 │  *
 5 │  * Use of this source code is governed by an MIT-style license that can be
 6 │  * found in the LICENSE file at https://angular.dev/license
 7 │  */
 8 │ 
 9 ▶ /** Logs each of the violations to the console as errors, optionally with the host element context. */
10 ▶ export function reportViolations(violations: string[], element: Element): void {
11 ▶   if (violations.length) {
12 ▶     console.warn('Violations found on element: %o:', element);
13 ▶     violations.forEach(violation => {
14 ▶       console.warn(violation);
15 │     });
16 │   }
17 │ }
```

1. **198〜211 行目 validate は配列を返すだけ**

   menu の `validate()` は、項目の value を集め（201〜204 行目、snapshot では `undefined` を除く）、205 行目で「前に同じ値がある」ものを探し、207 行目で最初の 1 つだけを文字列にします。DOM にも console にも触りません。
2. **194 行目 開発モードのときだけ登録する**

   `typeof ngDevMode === 'undefined' || ngDevMode` は Angular の本体と同じ書き方です。本番ビルドでは CLI が `ngDevMode` を `false` に置き換えるので、この `if` の中身ごと消え、`afterRenderEffect` も登録されません。
3. **195〜199 行目 描画のあとの read 段階で**

   DOM が更新されたあと（193 行目のコメント）、197 行目で `validate()` の結果を `reportViolations` に渡します。effect なので、項目が変わって `validate()` の読む signal が変わるたびにまた走ります。
4. **violations.ts 10〜16 行目 console.warn を 2 種類**

   違反があれば、12 行目で `'Violations found on element: %o:'` と要素を、13〜15 行目で違反ごとに 1 行を、`console.warn` に出します。9 行目のコメントは「errors として」ですが、使っているのは `warn` です。例外は投げないので、アプリは止まりません。

この仕組みは 33593e781b（2026-05-12、#33195「Angular Aria のディレクティブの誤った使い方を調べて違反を記録する」）で入りました。`git show --stat` で見ると 33 ファイル、accordion・grid・listbox・menu・tabs・toolbar・tree の Pattern とディレクティブ、それぞれの spec が変わっています。snapshot で `reportViolations(` を呼ぶディレクティブは 12 か所で、menu では `ngMenu`（上の 197 行目）と `ngMenuItem`（親がいないとき。[第 18 回](18-aria-menu.md)の 1 節の `MenuItem` の constructor）です。

### spec は console.warn を spy する

📄 `components/src/aria/private/menu/menu.spec.ts` L1078–1106 （▶ の行: 1078–1080, 1082, 1085, 1095, 1105）

```ts
1078 ▶     it('should report duplicate violations for items with the same defined value', () => {
1079 ▶       const items = signal<MenuItemPattern<any>[]>([]);
1080 ▶       const menu = createTestMenu(items);
1081 │ 
1082 ▶       items.set([
1083 │         new MenuItemPattern({
1084 │           id: signal('item-1'),
1085 ▶           value: signal('copy'),
1086 │           disabled: signal(false),
1087 │           searchTerm: signal('Copy'),
1088 │           parent: signal(menu),
1089 │           element: signal(document.createElement('div')),
1090 │           submenu: signal(undefined),
1091 │           role: signal('menuitem'),
1092 │         }),
1093 │         new MenuItemPattern({
1094 │           id: signal('item-2'),
1095 ▶           value: signal('copy'),
1096 │           disabled: signal(false),
1097 │           searchTerm: signal('Copy Again'),
1098 │           parent: signal(menu),
1099 │           element: signal(document.createElement('div')),
1100 │           submenu: signal(undefined),
1101 │           role: signal('menuitem'),
1102 │         }),
1103 │       ]);
1104 │ 
1105 ▶       expect(menu.validate()).toEqual(["Duplicate value 'copy' detected inside ngMenu."]);
1106 │     });
```

📄 `components/src/aria/menu/menu.spec.ts` L559–591 （▶ の行: 559, 563, 566–568, 571, 576–577, 579, 582, 590）

```ts
559 ▶   describe('structural validations', () => {
560 │     let consoleSpy: jasmine.Spy;
561 │ 
562 │     beforeEach(() => {
563 ▶       consoleSpy = spyOn(console, 'warn');
564 │     });
565 │ 
566 ▶     afterEach(async () => {
567 ▶       TestBed.resetTestingModule();
568 ▶       await setupMenu();
569 │     });
570 │ 
571 ▶     it('should warn when duplicate values are detected inside ngMenu', () => {
572 │       TestBed.resetTestingModule();
573 │       TestBed.configureTestingModule({
574 │         imports: [MenuWithDuplicateValues],
575 │       });
576 ▶       const duplicateFixture = TestBed.createComponent(MenuWithDuplicateValues);
577 ▶       duplicateFixture.detectChanges();
578 │ 
579 ▶       expect(consoleSpy).toHaveBeenCalledWith("Duplicate value 'item0' detected inside ngMenu.");
580 │     });
581 │ 
582 ▶     it('should not warn when items inside ngMenu have no value', () => {
583 │       TestBed.resetTestingModule();
584 │       TestBed.configureTestingModule({
585 │         imports: [MenuWithOptionalValues],
586 │       });
587 │       const optionalValuesFixture = TestBed.createComponent(MenuWithOptionalValues);
588 │       optionalValuesFixture.detectChanges();
589 │ 
590 ▶       expect(consoleSpy).not.toHaveBeenCalled();
591 │     });
```

1. **Pattern の spec：返り値を toEqual**

   1105 行目で `validate()` の配列そのものを比べます。開発モードかどうかは関係ありません。
2. **ディレクティブの spec：563 行目 spyOn(console, 'warn')**

   `describe('structural validations')` の `beforeEach` で `console.warn` を spy に替えます。jasmine の `spyOn` は元の関数を呼ばないので、テストの出力に警告は出ません。576〜577 行目で作って描画し、579 行目で違反の文字列で呼ばれたかを見ます（1 回目の `'Violations found on element'` の呼び出しは見ていない）。590 行目は「value の無い項目なら警告しない」です。テストのブラウザは開発モードなので、194 行目の `if` の中が登録されています。
3. **566〜569 行目 afterEach で組み直す**

   この `describe` の it はそれぞれ `TestBed.resetTestingModule()` から別のコンポーネントを作るので、afterEach で外側の `describe` が使う `setupMenu()` をもう一度呼んで戻しています。

`spyOn(console, 'warn')` を使う spec は accordion・grid・listbox・menu・tabs・toolbar・tree の 7 ファイルで（grep）、33593e781b が変えた部品と同じです。

> **🧪 DEMO — わざと違反した本物の ngMenu を描く（このサイトの 22.1.8）**
>
> ボタンを押すと、下の枠の中に違反した使い方の `ngMenu` / `ngMenuItem` を描きます。描く直前から 500ms だけ `console.warn` を横取りして、呼ばれた中身をここに出し、そのあと元に戻します（ブラウザのコンソールには出ません）。このページのビルドでは **ngDevMode = 偽（本番ビルド）** です。偽なら 194 行目の `if` の中が無いので、何も捕まりません。「validate() を直接呼ぶ」は開発モードかどうかに関係なく、Pattern の返り値を見ます。描いた項目には Tab で入れます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/aria-testing)

2026-11-02 にヘッドレスの Chrome（156）で、このページを開発ビルドと本番ビルド（プリレンダー）の両方で開いて押した結果です。

| ボタン | 開発ビルド | 本番ビルド |
| --- | --- | --- |
| 重複した value | `console.warn` 2 回：`Violations found on element: %o: <div ngMenu>` と `Duplicate value 'copy' detected inside ngMenu.` | 0 回 |
| ngMenu の外の ngMenuItem | 2 回：`<div ngMenuItem>` と `ngMenuItem must be placed inside an ngMenu or ngMenuBar container.` | 0 回 |
| validate() を直接呼ぶ | `["Duplicate value 'copy' detected inside ngMenu."]`（どちらのビルドでも同じ） |   |

> [!TIP]
> **新卒エンジニアへ**
>
> ブリーフでは「option の無い listbox」も違反の例に考えましたが、listbox の `validate()` が調べるのは「単一選択なのに 2 つ以上選ばれている」「value の重複」「id の重複」の 3 つで（[第 9 回](09-aria-listbox.md)）、option が 0 個は違反ではありません。違反として何を調べるかは部品ごとの `validate()` を読むのが確実です。

## 3. axe-core：spec の中で ARIA の規則を調べる

📄 `components/src/cdk/testing/private/run-accessibility-checks.ts` L23–37 （▶ の行: 23, 27–28, 30–31, 34, 36）

```ts
23 ▶ /**
24 │  * Runs accessibility checks on a specified HTML element using the axe-core library.
25 │  * @param root The root HTML element to check for accessibility violations.
26 │  */
27 ▶ export async function runAccessibilityChecks(root: HTMLElement): Promise<void> {
28 ▶   const results = await axe.run(root);
29 │ 
30 ▶   if (!results.violations.length) {
31 ▶     return;
32 │   }
33 │ 
34 ▶   const reportLines: string[] = [];
35 │   const append = (text: string) => reportLines.push(colors.default(text));
36 ▶   append(colors.red(`Found ${results.violations.length} accessibility violation(s):`));
37 │ 
```

📄 `components/src/aria/combobox/combobox.spec.ts` L88–98 （▶ の行: 97）

```ts
88 │     function getOption(text: string): HTMLElement | null {
89 │       const options = Array.from(document.querySelectorAll('[ngoption]')) as HTMLElement[];
90 │       return options.find(option => option.textContent?.trim() === text) || null;
91 │     }
92 │ 
93 │     function getOptions(): HTMLElement[] {
94 │       return Array.from(document.querySelectorAll('[ngoption]')) as HTMLElement[];
95 │     }
96 │ 
97 ▶     afterEach(async () => await runAccessibilityChecks(fixture.nativeElement));
98 │ 
```

- `runAccessibilityChecks` は `@angular/cdk/testing/private` にあり、28 行目で `axe.run(root)`（axe-core。DOM を ARIA やアクセシビリティの規則で調べるライブラリ）を走らせ、違反が無ければ 30〜32 行目で帰ります。違反があれば規則の id・影響度・説明・失敗した要素のセレクタを行に組み立て、最後に jasmine の `fail(...)` でその it を失敗にします。
- src/aria では 6 つの spec ファイルが 8 か所で呼んでいます（accordion・combobox 3 か所・listbox・tabs・toolbar・tree）。combobox は 97 行目のように `afterEach` で、各 it の終わりの DOM を毎回調べます。
- **src/aria の .ts には `import ... from 'axe-core'` がありません**。import しているのは cdk の run-accessibility-checks.ts（9 行目）で、src/aria の spec はそれを経由して使います。BUILD.bazel の deps に `//:node_modules/axe-core` を直接書いているのは listbox・menu・grid の 3 つで、そのうち menu と grid の spec は `runAccessibilityChecks` を呼んでいません。逆に combobox の spec は呼んでいるのに deps に axe-core が無く、`//src/cdk/testing/private` の deps（axe-core を持つ）で届いています。

## 4. テストハーネス

📄 `components/src/aria/combobox/testing/combobox-harness.ts` L49–84 （▶ の行: 49, 55–56, 61, 68–69, 73, 75, 81, 83）

```ts
49 ▶   async getPopupWidget<T extends ComponentHarness>(
50 │     type: ComponentHarnessConstructor<T> & {
51 │       with: (options?: {selector?: string}) => HarnessPredicate<T>;
52 │     },
53 │   ): Promise<T> {
54 │     const host = await this.host();
55 ▶     const controlsId = await host.getAttribute('aria-controls');
56 ▶     if (!controlsId) {
57 │       throw new Error(
58 │         'Cannot retrieve popup content because the combobox is closed or not associated with a popup controls ID.',
59 │       );
60 │     }
61 ▶     return this.documentRootLocatorFactory().locatorFor(type.with({selector: `#${controlsId}`}))();
62 │   }
63 │ 
64 │   /**
65 │    * Gets a harness loader scoped to the content inside the popup container.
66 │    * Note that lookups performed by this loader will only find descendants of the popup container.
67 │    */
68 ▶   async getPopupLoader(): Promise<HarnessLoader> {
69 ▶     return this.getRootHarnessLoader();
70 │   }
71 │ 
72 │   /** Overrides root loader to automatically resolve queries nested inside the associated popup. */
73 ▶   protected override async getRootHarnessLoader(): Promise<HarnessLoader> {
74 │     const host = await this.host();
75 ▶     const controlsId = await host.getAttribute('aria-controls');
76 │     if (!controlsId) {
77 │       throw new Error(
78 │         'Cannot retrieve popup content because the combobox is closed or not associated with a popup controls ID.',
79 │       );
80 │     }
81 ▶     const documentRoot = await this.documentRootLocatorFactory().rootHarnessLoader();
82 │     // Locate the widget by ID, which was assigned by ngComboboxWidget and linked via aria-controls.
83 ▶     return documentRoot.getChildLoader(`#${controlsId}`);
84 │   }
```

📄 `components/src/aria/combobox/testing/combobox-harness.spec.ts` L54–76 （▶ の行: 58, 60, 62, 64, 73–74）

```ts
54 │     it('should open and close the popup', async () => {
55 │       const combobox = await loader.getHarness(ComboboxHarness);
56 │       expect(await combobox.isOpen()).toBeFalse();
57 │ 
58 ▶       await combobox.open();
59 │       fixture.detectChanges();
60 ▶       expect(await combobox.isOpen()).toBeTrue();
61 │ 
62 ▶       await combobox.close();
63 │       fixture.detectChanges();
64 ▶       expect(await combobox.isOpen()).toBeFalse();
65 │     });
66 │ 
67 │     it('should allow loading nested harnesses within the popup content via unified container API', async () => {
68 │       const combobox = await loader.getHarness(ComboboxHarness);
69 │       await combobox.open();
70 │       fixture.detectChanges();
71 │ 
72 │       // We access the main widget harness using getPopupWidget.
73 ▶       const listbox = await combobox.getPopupWidget(ListboxHarness);
74 ▶       const options = await listbox.getOptions();
75 │       expect(options.length).toBe(3);
76 │     });
```

ハーネスは、テストから DOM の細部を隠して「開く」「値を入れる」のような操作で部品を扱う仕組みです（[CDK のハーネスの章](../cdk/20-harness.md)）。src/aria には部品ごとに `<部品>/testing/*-harness.ts` があり、e3d84f2e0a（2026-05-04、#33194）で combobox のハーネスが入りました。

1. **55・75 行目 ポップアップは aria-controls でたどる**

   ポップアップは CDK Overlay などで DOM の別の場所に出るので、combobox の子孫ではありません。ハーネスは host の `aria-controls` の id を読み、61 行目では `documentRootLocatorFactory()`（文書全体から探す）で `#id` の widget を、81〜83 行目では文書全体のローダーから `#id` の子のローダーを作ります。閉じていて `aria-controls` が無いと 56〜60 行目で例外です。第 17 回の 2 節で見た「widget が登録されて初めて `aria-controls` が付く」が、ハーネスの前提になっています。
2. **73 行目 getRootHarnessLoader を上書きする**

   `ContentContainerComponentHarness` の「中身のローダー」をポップアップの中に向けるので、`combobox.getHarness(ListboxOptionHarness)` のように、ポップアップの中の項目を combobox から直接探せます。

## 5. bazel で走らせる

📄 `components/src/aria/menu/BUILD.bazel` L19–41 （▶ の行: 19, 21–22, 26, 31–34, 38–40）

```python
19 ▶ ng_project(
20 │     name = "unit_test_sources",
21 ▶     testonly = True,
22 ▶     srcs = glob(
23 │         ["**/*.spec.ts"],
24 │         exclude = ["**/*.e2e.spec.ts"],
25 │     ),
26 ▶     deps = [
27 │         ":menu",
28 │         "//:node_modules/@angular/common",
29 │         "//:node_modules/@angular/core",
30 │         "//:node_modules/@angular/platform-browser",
31 ▶         "//:node_modules/axe-core",
32 ▶         "//src/aria/private/testing",
33 ▶         "//src/cdk/overlay",
34 ▶         "//src/cdk/testing/private",
35 │     ],
36 │ )
37 │ 
38 ▶ ng_web_test_suite(
39 ▶     name = "unit_tests",
40 ▶     deps = [":unit_test_sources"],
41 │ )
```

📄 `components/tools/defaults.bzl` L169–198 （▶ の行: 169, 178–179, 181, 193–197）

```python
169 ▶ def ng_project(
170 │         name,
171 │         srcs = [],
172 │         deps = [],
173 │         source_map = True,
174 │         testonly = False,
175 │         tsconfig = None,
176 │         visibility = None,
177 │         **kwargs):
178 ▶     if tsconfig == None and native.package_name().startswith("src"):
179 ▶         tsconfig = "//src:test-tsconfig" if testonly else "//src:build-tsconfig"
180 │ 
181 ▶     _ng_project(
182 │         name = name,
183 │         source_map = source_map,
184 │         testonly = testonly,
185 │         declaration = True,
186 │         tsconfig = tsconfig,
187 │         visibility = visibility,
188 │         srcs = srcs,
189 │         deps = deps,
190 │         **kwargs
191 │     )
192 │ 
193 ▶     strict_deps_test(
194 ▶         name = "%s_strict_deps_test" % name,
195 ▶         srcs = srcs,
196 ▶         deps = deps,
197 ▶         tsconfig = tsconfig,
198 │     )
```

1. **menu/BUILD.bazel：spec を集めて 1 つのテストに**

   19〜36 行目で `**/*.spec.ts` を `testonly` の `ng_project` にまとめ、38〜41 行目の `ng_web_test_suite` に渡します。`ng_web_test_suite` は spec を 1 つのファイルに束ね（`spec_bundle`）、rules\_browsers の `wtr_test`（web-test-runner + jasmine）で走らせます。`wtr_test` は 1 つの名前から `unit_tests_chromium`・`unit_tests_firefox`・`unit_tests_debug`（手で開く用、`manual` タグ）の 3 つを作り、前の 2 つを `unit_tests` という test\_suite にまとめます（tools/bazel/web\_test\_suite.bzl の中身は[第 1 回](01-aria-overview.md)、wtr の側は bazel の external/rules\_browsers+/wtr/index.bzl で読みました）。
2. **defaults.bzl 193〜198 行目：ng\_project はいつも strict\_deps\_test を作る**

   `ng_project`（と `ts_project`）のマクロは、名前の後ろに `_strict_deps_test` を付けたテストを必ず作ります。devinfra の strict\_deps の実装（index.mts）を読むと、srcs の各ファイルの import を取り出し、相対 import は srcs か deps の型ファイルにあるか、パッケージの import は deps に書いた npm パッケージか、を調べるテストです。「BUILD に書いていない依存を import していない」ことだけを見ます。src/aria で走ったテスト 151 本のうち 77 本がこれでした。event-manager と signal-like には spec が無く、テストはこの strict\_deps\_test だけです。

📄 `components/test/angular-test.init.ts` L9–29 （▶ の行: 9–10, 17, 24）

```ts
 9 ▶ import 'zone.js';
10 ▶ import 'zone.js/testing';
11 │ 
12 │ import {NgModule, provideCheckNoChangesConfig, provideZonelessChangeDetection} from '@angular/core';
13 │ import {TestBed} from '@angular/core/testing';
14 │ import {BrowserTestingModule, platformBrowserTesting} from '@angular/platform-browser/testing';
15 │ 
16 │ @NgModule({
17 ▶   providers: [provideZonelessChangeDetection(), provideCheckNoChangesConfig({exhaustive: true})],
18 │ })
19 │ export class TestModule {}
20 │ 
21 │ /*
22 │  * Common setup / initialization for all unit tests in Angular Material and CDK.
23 │  */
24 ▶ TestBed.initTestEnvironment([BrowserTestingModule, TestModule], platformBrowserTesting());
25 │ 
26 │ (window as any).module = {};
27 │ (window as any).isNode = false;
28 │ (window as any).isBrowser = true;
29 │ (window as any).global = window;
```

どのブラウザのテストも、最初に test/angular-test.init.ts を読み込みます（`ng_web_test_suite` の bootstrap）。9〜10 行目で zone.js を読み込みながら、17 行目で `provideZonelessChangeDetection()` と `provideCheckNoChangesConfig({exhaustive: true})` を全部のテストに入れています。だからログに毎回 `NG0914`（zoneless なのに zone.js を読み込んでいる）が出ます。zone.js の上で確かめたい spec は、combobox.zone.spec.ts のように自分で `provideZoneChangeDetection()` を置きます（[第 17 回](17-aria-combobox.md)）。

📄 `ターミナル`

```
cd ~/angular-research/components
# 1 本のターゲット = 1 つのブラウザで、そのパッケージの spec を全部
pnpm bazel test //src/aria/combobox:unit_tests_chromium --nocache_test_results --test_output=all
pnpm bazel test //src/aria/menu:unit_tests_firefox --nocache_test_results --test_output=all

# 並び順の種（jasmine の random）を固定して、落ちた順番を再現する（試していない）
pnpm bazel test //src/aria/menu:unit_tests_chromium --test_env=JASMINE_RANDOM_SEED=45227
```

📄 `出力（抜粋。2026-11-02 に実行）`

```
      NG0914: The application is using zoneless change detection, but is still loading Zone.js. ...
      Jasmine randomize seed: 45227

Chromium: |██████████████████████████████| 1/1 test files | 112 passed, 0 failed

Finished running tests in 2.2s, all tests passed!
//src/aria/combobox:unit_tests_chromium                                  PASSED in 2.7s
```

- **spec を絞る指定は無い**：wtr\_test の引数は `<パッケージ>/**/*.spec.js` などの glob で、wtr.config.mjs にも名前で絞る設定はありません。ターゲットを走らせると、そのパッケージの spec が全部走ります（束ねた 1 ファイルなので「1/1 test files」）。1 本だけ見たいときは、自分の作業コピーで `it` を `fit` にすると jasmine がそれだけを走らせます（私たちは ../components を変えないので試していません）。
- **順番はランダム**：wtr.config.mjs は jasmine の `seed` を環境変数 `JASMINE_RANDOM_SEED` から取り、無ければ乱数にします。ログの `Jasmine randomize seed: 45227` がその値です。順番に依存して落ちたら、その seed を渡すと同じ順番になるはずの形ですが、`--test_env` で渡すのは試していません。
- ブラウザは 1 つずつ（wtr.config.mjs の `concurrency: 1`・`concurrentBrowsers: 1`）、Chromium はヘッドレスの shell です。

### 件数（chromium、2026-11-02）

全体は `bazel test //src/aria/... --nocache_test_results` で 151 ターゲット（chromium 37・firefox 37・strict\_deps 77）がすべて PASSED、Elapsed 104.5s でした（このシリーズの準備で走らせたログ）。chromium の件数を足すと 1784 です。私が自分で走らせた 5 本（下の表の ✓）は、どれもこの表と同じ件数でした。

| ディレクティブ | 件数 | ハーネス（testing） | Pattern（private/…） | 件数 |
| --- | --- | --- | --- | --- |
| accordion | 42 | 13 | accordion | 27 |
| combobox | 112 ✓ | 10 | combobox | 21 ✓ |
| grid | 71 | 13 | grid | 51 |
| listbox | 105 | 8 | listbox | 68 |
| menu | 90 ✓（firefox も 90 ✓） | 13 | menu | 86 ✓ |
| tabs | 85 | 11 | tabs | 37 |
| toolbar | 62 | 12 | toolbar | 111 |
| tree | 142 | 7 | tree | 95 |

Behavior：expansion 33・grid 213・label 6・list 42・list-focus 11・list-navigation 39・list-selection 52・list-typeahead 17・popup 3・tree 49。そのほか deferred-content 5、utils 11、`//src/aria/private:unit_tests` 11。最後の 2 つは同じ spec です。private/BUILD.bazel の `ng_web_test_suite` の deps が `//src/aria/private/utils:unit_test_sources` なので、utils の spec が 2 つのターゲットで走っています。

## 6. このサイトの ng test（Vitest + jsdom）で Aria を動かす

components の外、ふつうのアプリのテストで Aria を確かめられるかも見ました。このサイトの `ng test` は `@angular/build:unit-test`（Vitest、DOM は jsdom 28.1）です。src/verify-e/ に spec を 1 つ置き、TestBed で `ngListbox`、重複した value の `ngMenu`、`ngCombobox` + `ngListbox` を作って `dispatchEvent` し、結果を `throw new Error('PROBE ' + JSON.stringify(r))` で出しました（2 回走らせ、そのあと src/verify-e/ は消した）。

📄 `npx ng test --watch=false --include src/verify-e/aria-probe.spec.ts（抜粋。2026-11-02）`

```
PROBE {"initial":{"ulTab":"-1","liTabs":["0","-1","-1"],"value":["a"]},
       "afterDown":{"value":["b"],"liTabs":["-1","0","-1"],"active":"B"},
       "warns":[["Violations found on element: %o:","<div>"],
                ["Duplicate value 'x' detected inside ngMenu."]]}

PROBE {"open":{"expanded":"true","controls":true,"active":"alpha"},
       "oneStep":"bravo","burst3":"bravo","spaced3":"delta",
       "focusoutImmediate":true,"focusoutAfterTimeout":false,"warns":[]}
```

- listbox：最初の `whenStable` のあと、1 つ目の option だけ `tabindex="0"`。ArrowDown で value が `["b"]`、フォーカスも B に移りました。jsdom でもキー・フォーカス・`tabindex` は動きます。
- menu：重複した value で、`console.warn` が 2 回（要素と違反の文字列）。Vitest は開発モードなので、2 節の検査が走ります。
- combobox：ArrowDown で開いて `aria-controls` が付き、alpha が今の候補。**ArrowDown を 3 回続けて送ってから `whenStable` すると bravo（1 つだけ）、毎回待つと delta**。#33973 は jsdom でも同じに出ます。focusout の直後はまだ開いていて、`setTimeout` を待つと閉じました。
- どれも警告は（わざと出した menu の 2 回のほかは）出ませんでした。

## テストと直し方

1. **どの spec に足すか**

   signal だけで決まる振る舞い（どの項目へ動くか、開くか）は Behavior か Pattern の spec に、描画や effect をまたぐもの（中継、フォーカスの移動、`aria-*` の属性）はディレクティブの spec に足します。combobox の #33973 が Pattern の spec では見えないのは、中継が描画のあとの effect だからです（1 節）。
2. **違反の検査を足すなら**

   その部品の Pattern の `validate()`（menu なら private/menu/menu.ts 198 行目）に文字列を足し、Pattern の spec で返り値を `toEqual`（1105 行目の形）、ディレクティブの spec の `describe('structural validations')` で `console.warn` の spy（579 行目の形）を足します。combobox には `validate()` がなく、`reportViolations` も呼んでいません。violations.ts 自体の spec もありません（private/utils の BUILD.bazel の spec は collection と element-resolver だけ）。
3. **走らせて確かめる**

   自分の変更に近いターゲットを chromium で 1 本、通ったら firefox でも 1 本。BUILD.bazel の deps を変えたら `<名前>_strict_deps_test` も走らせます。公開 API の型を変えたら goldens/aria/ の `index.api.md` も変わります（第 18 回の PR #33965 がその例）。
4. **issue を読むときの手がかり**

   issue の再現が「キーを続けて送る」「`whenStable` を挟まない」テストなら、components の spec の書き方（キーごとに待つ）と違うところに原因があるかもしれません。開発モードの警告の報告なら、その文字列で `validate()` を grep すると行が見つかります。一覧は[第 20 回](20-aria-issues.md)です。

## 聞かれそうな質問

**Q. 本番ビルドでも Aria は使い方の間違いを教えてくれますか？**

教えてくれません。menu.ts の 194 行目の `typeof ngDevMode === 'undefined' || ngDevMode` は本番ビルドで偽になり、`reportViolations` を呼ぶ effect が登録されません。デモの表のとおり、本番ビルドでは 0 回でした。開発中（`ng serve` やテスト）に `console.warn` を見るか、`validate()` を spec で呼びます。

**Q. axe-core は Aria の部品の中で動いているのですか？**

動いていません。axe-core を使うのは spec だけで、cdk の `runAccessibilityChecks`（28 行目の `axe.run`）を spec が呼びます。src/aria の公開・private のどの .ts も axe-core を import していません。

**Q. 自分のアプリのテスト（Vitest + jsdom）で Aria の部品を確かめられますか？**

6 節のとおり、TestBed と `dispatchEvent` で、listbox のキー移動・選択、menu の開発モードの警告、combobox の開閉と中継まで、このサイトの jsdom で動きました。ただし combobox のキーはキーごとに `await fixture.whenStable()` を挟みます（#33973）。ハーネス（`@angular/aria/combobox/testing` など）も使えますが、このサイトでは試していません。

**Q. components の spec を 1 本だけ走らせたいときは？**

bazel の側に絞る指定はありません（5 節）。ターゲットは 1 パッケージ分で数秒なので全部走らせるか、作業コピーで `fit` / `fdescribe` にします（試していない）。`_debug` のターゲットは手で開くブラウザ用（`MANUAL_MODE`）ですが、これも試していません。

**Q. テストのログに出る NG0914 は問題ですか？**

いいえ。test/angular-test.init.ts が 9〜10 行目で zone.js を読み込み、17 行目で zoneless を入れているので、Angular が「zoneless なのに zone.js を読み込んでいる」と知らせているだけです。zone.js 側の確かめは、spec が自分で `provideZoneChangeDetection()` を置いたときだけ行われます。

## 読み終えて

- spec は 3 層に合わせて 3 種類。Behavior と Pattern の spec は signal-like の `signal` で入力を作り、メソッドを直接呼ぶ。描画のあとの effect はディレクティブの spec でしか見えない。
- `validate()` は配列を返すだけで、ディレクティブが開発モードのときだけ `afterRenderEffect` の read で `reportViolations`（`console.warn`）に渡す。spec は `spyOn(console, 'warn')` で受ける。
- axe-core は cdk/testing/private の `runAccessibilityChecks` 経由で 6 つの spec が使う。src/aria の .ts には import が無い。
- bazel の 1 ターゲット = 1 パッケージの spec 全部 × 1 ブラウザ。ng\_project ごとに strict\_deps\_test が付く。spec を絞る指定は無く、順番は jasmine の seed で乱れる。
- このサイトの Vitest + jsdom でも Aria は動き、#33973 も同じに再現する。

---

← 前: [Menu と MenuBar：入れ子のメニューを開いて閉じる](18-aria-menu.md)  
次: [issue と PR を読む：Angular Aria の今](20-aria-issues.md) →
