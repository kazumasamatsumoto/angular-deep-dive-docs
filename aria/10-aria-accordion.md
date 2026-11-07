[目次](../README.md) › [Angular Aria の内側](README.md) › 第 10 回 / 全 20 回

# Accordion：ListExpansion で開いて閉じる

> ListExpansion の open / close / toggle / openAll が expanded の値を書く行と、multiExpandable が偽なら他を閉じる仕組み。AccordionGroup・AccordionTrigger・AccordionPanel が aria-expanded・aria-controls・role="region" をどう結ぶか、トリガーが別のコンポーネントの中にあっても見つかる理由。パネルの中で Enter を押すと開閉してしまう開いている issue。

angular/components · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/aria-accordion)

---

アコーディオンは「見出しのボタンを押すと、その下のパネルが開いたり閉じたりする」部品です。開閉の状態を書き換えるのは `ListExpansion` という小さな Behavior で、`AccordionGroupPattern` がそれに `ListFocus` と `ListNavigation` を足して、キーとクリックを受けます。この章では、`expanded` を書く行、`multiExpandable` が偽のとき他を閉じる行、トリガーとパネルが `aria-expanded`・`aria-controls`・`role="region"`・`aria-labelledby` で結ばれる行、そして**パネルの中で Enter を押すと開閉してしまう**開いている issue #34011 の原因の行を読みます。

読む対象は `src/aria/private/behaviors/expansion/expansion.ts`、`src/aria/private/accordion/accordion.ts`、`src/aria/accordion/accordion-group.ts`・`accordion-trigger.ts`・`accordion-panel.ts` です。ページの上のデモは @angular/aria 22.1.8 で、このうち `accordion-trigger.ts` だけが引用（22.2.0-next.5 の e81c398a86）と違います（5 節）。

1. [1. 全体像](01-aria-overview.md)
2. [2. SignalLike](02-aria-signal-like.md)
3. [3. SortedCollection](03-aria-collection.md)
4. [4. イベントマネージャ](04-aria-events.md)
5. [5. ListFocus](05-aria-list-focus.md)
6. [6. ListNavigation](06-aria-list-navigation.md)
7. [7. ListSelection](07-aria-list-selection.md)
8. [8. ListTypeahead](08-aria-typeahead.md)
9. [9. Listbox](09-aria-listbox.md)
10. **10. Accordion**（この章）
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

## 1. ListExpansion：expanded を書く Behavior

📄 `components/src/aria/private/behaviors/expansion/expansion.ts` L34–60 （▶ の行: 36, 39–43, 45–46, 50–51, 53, 58–59）

```ts
34 │ /** Manages the expansion state of a list of items. */
35 │ export class ListExpansion {
36 ▶   constructor(readonly inputs: ListExpansionInputs) {}
37 │ 
38 │   /** Opens the specified item. */
39 ▶   open(item: ExpansionItem): boolean {
40 ▶     if (!this.isExpandable(item)) return false;
41 ▶     if (item.expanded()) return false;
42 ▶     if (!this.inputs.multiExpandable()) {
43 ▶       this.closeAll();
44 │     }
45 ▶     item.expanded.set(true);
46 ▶     return true;
47 │   }
48 │ 
49 │   /** Closes the specified item. */
50 ▶   close(item: ExpansionItem): boolean {
51 ▶     if (!this.isExpandable(item)) return false;
52 │ 
53 ▶     item.expanded.set(false);
54 │     return true;
55 │   }
56 │ 
57 │   /** Toggles the expansion state of the specified item. */
58 ▶   toggle(item: ExpansionItem): boolean {
59 ▶     return item.expanded() ? this.close(item) : this.open(item);
60 │   }
```

1. **36 行目 状態を持たない**

   `ListExpansion` が持つのは `inputs` だけです。「開いているか」は各項目の `expanded`（`WritableSignalLike<boolean>`。書ける signal のようなもの。[第 2 回](02-aria-signal-like.md)）にあり、この Behavior はそれを読み書きするだけです。
2. **39〜47 行目 open**

   40 行目で開けない項目なら false、41 行目で既に開いていれば false を返します。42〜44 行目で、`multiExpandable` が偽なら**先に全部を閉じ**、45 行目で自分を開きます。「1 つしか開けないアコーディオンで別の項目を開くと、前の項目が閉じる」はこの 3 行です。
3. **50〜55 行目 close**

   開けない項目でなければ、53 行目で `expanded` を false にします。既に閉じていても書きます（`open` と違い、41 行目に当たる確かめが無い）。
4. **58〜60 行目 toggle**

   いまの `expanded()` を見て `close` か `open` を呼ぶだけです。

📄 `components/src/aria/private/behaviors/expansion/expansion.ts` L62–81 （▶ の行: 63–66, 72–74, 79–80）

```ts
62 │   /** Opens all focusable items in the list. */
63 ▶   openAll(): void {
64 ▶     if (this.inputs.multiExpandable()) {
65 ▶       for (const item of this.inputs.items()) {
66 ▶         this.open(item);
67 │       }
68 │     }
69 │   }
70 │ 
71 │   /** Closes all focusable items in the list. */
72 ▶   closeAll(): void {
73 ▶     for (const item of this.inputs.items()) {
74 ▶       this.close(item);
75 │     }
76 │   }
77 │ 
78 │   /** Checks whether the specified item is expandable / collapsible. */
79 ▶   isExpandable(item: ExpansionItem) {
80 ▶     return !this.inputs.disabled() && !item.disabled() && item.expandable();
81 │   }
```

64 行目のとおり、`openAll` は `multiExpandable` が真のときしか何もしません（1 つしか開けないのに全部を開くと矛盾するため）。`closeAll`（72〜76 行目）はいつでも全部を閉じます。80 行目の `isExpandable` は「グループが無効でない・項目が無効でない・項目が開ける」の 3 つの AND です。

## 2. AccordionGroupPattern：List を使わず 3 つの Behavior を組む

📄 `components/src/aria/private/accordion/accordion.ts` L28–54 （▶ の行: 28, 42–44, 46, 49, 51–52）

```ts
28 ▶ const focusMode = () => 'roving' as const;
29 │ 
30 │ /** A pattern controls the nested Accordions. */
31 │ export class AccordionGroupPattern {
32 │   /** Controls navigation for the group. */
33 │   readonly navigationBehavior: ListNavigation<AccordionTriggerPattern>;
34 │ 
35 │   /** Controls focus for the group. */
36 │   readonly focusBehavior: ListFocus<AccordionTriggerPattern>;
37 │ 
38 │   /** Controls expansion for the group. */
39 │   readonly expansionBehavior: ListExpansion;
40 │ 
41 │   constructor(readonly inputs: AccordionGroupInputs) {
42 ▶     this.focusBehavior = new ListFocus({
43 ▶       ...inputs,
44 ▶       focusMode,
45 │     });
46 ▶     this.navigationBehavior = new ListNavigation({
47 │       ...inputs,
48 │       focusMode,
49 ▶       focusManager: this.focusBehavior,
50 │     });
51 ▶     this.expansionBehavior = new ListExpansion({
52 ▶       ...inputs,
53 │     });
54 │   }
```

第 9 回の listbox は `List`（4 つの Behavior の束）を 1 つ持ちました。アコーディオンは選択も頭文字検索も要らないので、`List` を使わず、42 行目で `ListFocus`、46 行目で `ListNavigation`（49 行目で `focusManager` にいま作った `ListFocus` を渡す）、51 行目で `ListExpansion` を直接作ります。28 行目の `focusMode` は `'roving'` を返す関数で固定です。利用者は `activedescendant` を選べません。

📄 `components/src/aria/private/accordion/accordion.ts` L72–102 （▶ の行: 73, 75–80, 86–87, 89–90, 95–96, 100–101）

```ts
 72 │   /** The keydown event manager for the accordion trigger. */
 73 ▶   readonly keydown = computed(() => {
 74 │     return new KeyboardEventManager()
 75 ▶       .on(this.prevKey, () => this.navigationBehavior.prev(), {ignoreRepeat: false})
 76 ▶       .on(this.nextKey, () => this.navigationBehavior.next(), {ignoreRepeat: false})
 77 ▶       .on('Home', () => this.navigationBehavior.first())
 78 ▶       .on('End', () => this.navigationBehavior.last())
 79 ▶       .on(' ', () => this.toggle())
 80 ▶       .on('Enter', () => this.toggle());
 81 │   });
 82 │ 
 83 │   /** The click event manager for the accordion trigger. */
 84 │   readonly click = computed(() => {
 85 │     return new ClickEventManager<PointerEvent>().on((e: PointerEvent) => {
 86 ▶       const item = this._findTriggerPattern(_getEventTarget(e));
 87 ▶       if (!item) return;
 88 │ 
 89 ▶       this.navigationBehavior.goto(item);
 90 ▶       this.expansionBehavior.toggle(item);
 91 │     });
 92 │   });
 93 │ 
 94 │   /** Handles keydown events on the trigger, delegating to the group if not disabled. */
 95 ▶   onKeydown(event: KeyboardEvent): void {
 96 ▶     this.keydown().handle(event);
 97 │   }
 98 │ 
 99 │   /** Handles click events on the trigger, delegating to the group if not disabled. */
100 ▶   onClick(event: PointerEvent): void {
101 ▶     this.click().handle(event);
102 │   }
```

1. **73〜81 行目 キーの表**

   前 / 次（縦固定なので ↑ / ↓。`prevKey` / `nextKey` は listbox と同じ形）と Home / End で**トリガーの間**を移り、79〜80 行目で Space と Enter が `this.toggle()` を呼びます。`KeyboardEventManager` は既定で、一致したキーに `preventDefault()` と `stopPropagation()` をします（[第 4 回](04-aria-events.md)）。
2. **84〜92 行目 クリック**

   86 行目で、クリックの発生元から `_findTriggerPattern`（4 節）でトリガーを探し、見つからなければ 87 行目で何もしません。見つかれば 89 行目でそこへ移り（`goto`）、90 行目で開閉します。
3. **95〜97 行目 onKeydown には、その確かめが無い**

   クリックは「トリガーから来たか」を 86〜87 行目で確かめますが、`onKeydown` はイベントをそのまま 96 行目で表に渡します。グループの `keydown` はグループの要素で受けるので（4 節の 65 行目）、**パネルの中の入力欄やボタンで押したキーも、泡立ってここに来ます**。これが 6 節の #34011 です。

📄 `components/src/aria/private/accordion/accordion.ts` L104–118 （▶ の行: 105–108, 110, 114–117）

```ts
104 │   /** Handles focus events on the trigger. This ensures the tabbing changes the active index. */
105 ▶   onFocus(event: FocusEvent): void {
106 ▶     const item = this._findTriggerPattern(_getEventTarget(event));
107 ▶     if (!item) return;
108 ▶     if (!this.focusBehavior.isFocusable(item)) return;
109 │ 
110 ▶     this.focusBehavior.focus(item);
111 │   }
112 │ 
113 │   /** Toggles the expansion state of the active accordion item. */
114 ▶   toggle() {
115 ▶     const activeItem = this.inputs.activeItem();
116 ▶     if (activeItem === undefined) return;
117 ▶     this.expansionBehavior.toggle(activeItem);
118 │   }
```

`focusin` を受ける `onFocus` は、106 行目でフォーカスの移った要素からトリガーを探し、見つかれば 110 行目で `focusBehavior.focus(item)` してアクティブにします。Tab キーでトリガーに入ったときもアクティブが追いつくのはこの行です。パネルの中の入力欄にフォーカスが移ったときは 107 行目で返るので、**アクティブは最後に触ったトリガーのまま**です。そして 114〜118 行目の `toggle()` は、そのアクティブなトリガー（115 行目の `activeItem()`）を開閉します。

📄 `components/src/aria/private/accordion/accordion.ts` L146–162 （▶ の行: 150, 152–154, 158）

```ts
146 │   /** Finds the trigger pattern for a given element. */
147 │   private _findTriggerPattern(
148 │     element: Element | null | undefined,
149 │   ): AccordionTriggerPattern | undefined {
150 ▶     let target = element;
151 │ 
152 ▶     while (target) {
153 ▶       const pattern = this.inputs.items().find(t => t.element() === target);
154 ▶       if (pattern) {
155 │         return pattern;
156 │       }
157 │ 
158 ▶       target = target.parentElement?.closest('[ngAccordionTrigger]');
159 │     }
160 │ 
161 │     return undefined;
162 │   }
```

153 行目で、要素そのものがどれかのトリガーの要素か調べ、違えば 158 行目で **親から上へ `closest('[ngAccordionTrigger]')`** で次の候補を探します。トリガーのボタンの中の `<span>` をクリックしても、発生元の span から上にたどってボタンが見つかります。この行は属性 `ngAccordionTrigger` を名前で探しているので、5 節の差分に関わります。

## 3. AccordionTriggerPattern と、全部が tabindex="0" であること

📄 `components/src/aria/private/accordion/accordion.ts` L176–214 （▶ の行: 184, 187, 190, 193, 196–197, 201–202, 206–207, 212–213）

```ts
176 │ export class AccordionTriggerPattern implements ListNavigationItem, ListFocusItem, ExpansionItem {
177 │   /** A unique identifier for this trigger. */
178 │   readonly id: SignalLike<string>; // set from inputs
179 │ 
180 │   /** A reference to the trigger element. */
181 │   readonly element: SignalLike<HTMLElement> = () => this.inputs.element()!;
182 │ 
183 │   /** Whether this trigger has expandable panel. */
184 ▶   readonly expandable: SignalLike<boolean> = () => true;
185 │ 
186 │   /** Whether the corresponding panel is expanded. */
187 ▶   readonly expanded: WritableSignalLike<boolean>; // set from inputs
188 │ 
189 │   /** Whether the trigger is active. */
190 ▶   readonly active = computed(() => this.inputs.accordionGroup().inputs.activeItem() === this);
191 │ 
192 │   /** Id of the accordion panel controlled by the trigger. */
193 ▶   readonly controls: SignalLike<string>; // set from inputs
194 │ 
195 │   /** The tabindex of the trigger. */
196 ▶   readonly tabIndex = computed(() =>
197 ▶     this.inputs.accordionGroup().focusBehavior.isFocusable(this) ? 0 : -1,
198 │   );
199 │ 
200 │   /** Whether the trigger is disabled. Disabling an accordion group disables all the triggers. */
201 ▶   readonly disabled = computed(
202 ▶     () => this.inputs.disabled() || this.inputs.accordionGroup().inputs.disabled(),
203 │   );
204 │ 
205 │   /** Whether the trigger is hard disabled.  */
206 ▶   readonly hardDisabled = computed(
207 ▶     () => this.disabled() && !this.inputs.accordionGroup().inputs.softDisabled(),
208 │   );
209 │ 
210 │   constructor(readonly inputs: AccordionTriggerInputs) {
211 │     this.id = inputs.id;
212 ▶     this.expanded = inputs.expanded;
213 ▶     this.controls = inputs.accordionPanelId;
214 │   }
```

1. **184・187 行目 ExpansionItem になる**

   `expandable` は常に true、`expanded` は入力（212 行目。ディレクティブの `model`）をそのまま使います。だから `ListExpansion` が 45 行目で `expanded.set(true)` すると、ディレクティブの `[(expanded)]` に値が出ていきます。
2. **193 行目 aria-controls の値**

   `controls` は入力の `accordionPanelId`（213 行目）、つまり結んだパネルの id です。
3. **196〜198 行目 tabindex はフォーカスできれば 0**

   listbox やタブの項目は `ListFocus.getItemTabIndex`（アクティブな 1 つだけ 0）を使いますが、アコーディオンのトリガーは `isFocusable(this) ? 0 : -1` です。無効でない（または `softDisabled`）トリガーは**全部が 0** なので、Tab キーで 1 つずつ止まります。↑↓ でも移れます。このページのプリレンダーした HTML でも、デモの 3 つのトリガーはすべて `tabindex="0"` でした（`afterRenderEffect` を待たずに計算できる値だからです）。
4. **201〜208 行目 disabled と hardDisabled**

   自分かグループのどちらかが無効なら `disabled`。そのうえ `softDisabled` が偽なら `hardDisabled` で、ディレクティブはこのときだけ本物の `disabled` 属性を付けます（4 節の 53 行目）。

📄 `components/src/aria/private/accordion/accordion.ts` L130–144 （▶ の行: 134–136, 138）

```ts
130 │   /** Returns a set of violations */
131 │   validate(): string[] {
132 │     const violations: string[] = [];
133 │ 
134 ▶     if (!this.inputs.multiExpandable()) {
135 ▶       const expandedCount = this.inputs.items().filter(t => t.expanded()).length;
136 ▶       if (expandedCount > 1) {
137 │         violations.push(
138 ▶           'ngAccordionGroup has multiExpandable set to false, but multiple ngAccordionTrigger panels are initially expanded.',
139 │         );
140 │       }
141 │     }
142 │ 
143 │     return violations;
144 │   }
```

`validate()` は 1 つだけです。`multiExpandable` が偽なのに、開いているトリガーが 2 つ以上あれば警告します（135〜136 行目）。`[(expanded)]` の初期値を 2 つとも `true` にしたときに出ます。

## 4. ディレクティブ：グループ・トリガー・パネルの結び付け

📄 `components/src/aria/accordion/accordion-group.ts` L61–71 （▶ の行: 65–67, 69）

```ts
61 │ @Directive({
62 │   selector: '[ngAccordionGroup]',
63 │   exportAs: 'ngAccordionGroup',
64 │   host: {
65 ▶     '(keydown)': '_pattern.onKeydown($event)',
66 ▶     '(click)': '_pattern.onClick($event)',
67 ▶     '(focusin)': '_pattern.onFocus($event)',
68 │   },
69 ▶   providers: [{provide: ACCORDION_GROUP, useExisting: AccordionGroup}],
70 │ })
71 │ export class AccordionGroup implements OnDestroy {
```

📄 `components/src/aria/accordion/accordion-group.ts` L89–126 （▶ の行: 90, 93, 99, 102, 105, 108–110, 115, 122）

```ts
 89 │   /** Whether the entire accordion group is disabled. */
 90 ▶   readonly disabled = input(false, {transform: booleanAttribute});
 91 │ 
 92 │   /** Whether multiple accordion items can be expanded simultaneously. */
 93 ▶   readonly multiExpandable = input(true, {transform: booleanAttribute});
 94 │ 
 95 │   /**
 96 │    * Whether to allow disabled items to receive focus. When `true`, disabled items are
 97 │    * focusable but not interactive. When `false`, disabled items are skipped during navigation.
 98 │    */
 99 ▶   readonly softDisabled = input(true, {transform: booleanAttribute});
100 │ 
101 │   /** Whether keyboard navigation should wrap around from the last item to the first, and vice-versa. */
102 ▶   readonly wrap = input(false, {transform: booleanAttribute});
103 │ 
104 │   /** The UI pattern instance for this accordion group. */
105 ▶   readonly _pattern: AccordionGroupPattern = new AccordionGroupPattern({
106 │     ...this,
107 │     element: () => this.element,
108 ▶     activeItem: signal(undefined),
109 ▶     items: this._triggerPatterns,
110 ▶     orientation: () => 'vertical',
111 │   });
112 │ 
113 │   constructor() {
114 │     afterNextRender(() => {
115 ▶       this._collection.startObserving(this.element);
116 │     });
117 │ 
118 │     // Check for any violations after the DOM has been updated.
119 │     if (typeof ngDevMode === 'undefined' || ngDevMode) {
120 │       afterRenderEffect({
121 │         read: () => {
122 ▶           reportViolations(this._pattern.validate(), this.element);
123 │         },
124 │       });
125 │     }
126 │   }
```

グループは 65〜67 行目で `keydown`・`click`・`focusin` を**グループの要素で**受けます。69 行目で自分を `ACCORDION_GROUP` として provide します。既定値は 93 行目の `multiExpandable` が **true**（複数同時に開ける）、102 行目の `wrap` が false（listbox とは逆）です。110 行目で `orientation` は `'vertical'` に固定です。109 行目の `items` は `_collection`（[第 3 回](03-aria-collection.md)）から作ったトリガーの Pattern の配列です。

📄 `components/src/aria/accordion/accordion-trigger.ts` L43–56 （▶ の行: 48–54）

```ts
43 │ @Directive({
44 │   selector: '[ngAccordionTrigger]',
45 │   exportAs: 'ngAccordionTrigger',
46 │   host: {
47 │     '[attr.data-active]': 'active()',
48 ▶     'role': 'button',
49 ▶     '[id]': 'id()',
50 ▶     '[attr.aria-expanded]': 'expanded()',
51 ▶     '[attr.aria-controls]': '_pattern.controls()',
52 ▶     '[attr.aria-disabled]': '_pattern.disabled()',
53 ▶     '[attr.disabled]': '_pattern.hardDisabled() ? true : null',
54 ▶     '[attr.tabindex]': '_pattern.tabIndex()',
55 │   },
56 │ })
```

📄 `components/src/aria/accordion/accordion-trigger.ts` L88–115 （▶ の行: 90–91, 100–102, 105）

```ts
 88 │   constructor() {
 89 │     // Automatically prevent form submission.
 90 ▶     if (this.element.tagName === 'BUTTON' && !this.element.hasAttribute('type')) {
 91 ▶       this.element.setAttribute('type', 'button');
 92 │     }
 93 │ 
 94 │     // Check for any violations after the DOM has been updated.
 95 │     if (typeof ngDevMode === 'undefined' || ngDevMode) {
 96 │       afterRenderEffect({
 97 │         read: () => {
 98 │           const violations: string[] = [];
 99 │ 
100 ▶           if (this.panel() && this.panel().element.contains(this.element)) {
101 ▶             violations.push(
102 ▶               'ngAccordionTrigger must not be nested inside its controlled ngAccordionPanel, otherwise it will become unreachable when collapsed.',
103 │             );
104 │           }
105 ▶           if (this.panel() && (this.panel() as any)._pattern !== this._pattern) {
106 │             violations.push(
107 │               'ngAccordionPanel is already controlled by another ngAccordionTrigger.',
108 │             );
109 │           }
110 │ 
111 │           reportViolations(violations, this.element);
112 │         },
113 │       });
114 │     }
115 │   }
```

📄 `components/src/aria/accordion/accordion-trigger.ts` L117–134 （▶ の行: 118, 121–122, 125, 127, 131, 133）

```ts
117 │   ngOnInit() {
118 ▶     this._pattern = new AccordionTriggerPattern({
119 │       ...this,
120 │       element: () => this.element,
121 ▶       accordionGroup: () => this._accordionGroup._pattern,
122 ▶       accordionPanelId: this.panelId,
123 │     });
124 │ 
125 ▶     this.panel()._pattern = this._pattern;
126 │ 
127 ▶     this._accordionGroup._collection.register(this);
128 │   }
129 │ 
130 │   ngOnDestroy() {
131 ▶     this.panel()._pattern = undefined;
132 │ 
133 ▶     this._accordionGroup._collection.unregister(this);
134 │   }
```

1. **48〜54 行目 トリガーの属性**

   `role="button"`、50 行目の `aria-expanded` は自分の `expanded()`、51 行目の `aria-controls` は Pattern の `controls()`（パネルの id）、54 行目の `tabindex` は 3 節の 196 行目の値です。
2. **90〜92 行目 form の送信を防ぐ**

   要素が `<button>` で `type` が無ければ `type="button"` を付けます。form の中に置いても、押して送信されません（#33297）。
3. **100〜109 行目 開発モードの確かめ**

   トリガーが自分のパネルの**中**にあると、閉じたとき（パネルが `inert` になる）に届かなくなるので警告します（101〜102 行目）。105 行目は、1 つのパネルを 2 つのトリガーが取り合っていないかです。
4. **118〜127 行目 ngOnInit で結ぶ**

   118 行目で `AccordionTriggerPattern` を作り、121 行目で `inject(ACCORDION_GROUP)` したグループの Pattern を、122 行目でパネルの id を渡します。125 行目で**パネルの `_pattern` に自分の Pattern を入れ**、127 行目でグループの `_collection` に自分を登録します。131・133 行目の `ngOnDestroy` でその逆をします。

> [!NOTE]
> **ポイント**
>
> トリガーがグループと**別のコンポーネントのテンプレートの中**にあっても見つかるのは、127 行目の登録が DI（`inject(ACCORDION_GROUP)`）で親をたどるからです。以前はグループが `contentChildren(AccordionTrigger, {descendants: true})` で探していて、別のコンポーネントのビューの中は見えませんでした（#32995）。#33027（2026-04-15、「ContentChildren をやめてトリガーの手動登録にする」）で今の形になり、入れ子のアコーディオンが動かない #33078 も、メンテナが「#33027 で直った」とコメントして閉じています。

📄 `components/src/aria/accordion/accordion-panel.ts` L42–57 （▶ の行: 45, 47–48, 52, 54–55）

```ts
42 │ @Directive({
43 │   selector: '[ngAccordionPanel]',
44 │   exportAs: 'ngAccordionPanel',
45 ▶   hostDirectives: [
46 │     {
47 ▶       directive: DeferredContentAware,
48 ▶       inputs: ['preserveContent'],
49 │     },
50 │   ],
51 │   host: {
52 ▶     'role': 'region',
53 │     '[attr.id]': 'id()',
54 ▶     '[attr.aria-labelledby]': '_pattern?.id()',
55 ▶     '[attr.inert]': '!visible() ? true : null',
56 │   },
57 │ })
```

📄 `components/src/aria/accordion/accordion-panel.ts` L73–90 （▶ の行: 74, 81, 85–87）

```ts
73 │   /** Whether the accordion panel is visible. True if the associated trigger is expanded. */
74 ▶   readonly visible = computed(() => this._pattern?.expanded() === true);
75 │ 
76 │   /**
77 │    * The pattern for the accordion trigger that controls this panel.
78 │    * This is set by the trigger when it initializes.
79 │    * There is no need for a panel pattern, as the trigger has all the necessary logic.
80 │    */
81 ▶   _pattern?: AccordionTriggerPattern;
82 │ 
83 │   constructor() {
84 │     // Connect the panel's hidden state to the DeferredContentAware's visibility.
85 ▶     afterRenderEffect({
86 ▶       write: () => {
87 ▶         this._deferredContentAware.contentVisible.set(this.visible());
88 │       },
89 │     });
90 │ 
```

パネルは 52 行目で `role="region"`、54 行目の `aria-labelledby` は `_pattern?.id()`、つまり 125 行目で入れてもらったトリガーの id です。これで「トリガーの `aria-controls` → パネルの id」「パネルの `aria-labelledby` → トリガーの id」が双方向に結ばれます。パネル自身には Pattern がありません（77〜80 行目のコメント）。74 行目の `visible` はトリガーの `expanded()` で、55 行目で見えないときは `inert` 属性を付けます。`inert` はフォーカスと支援技術から外すだけで、**見た目は消えません**。デモでは章の CSS で `[inert] { display: none }` を当てています。85〜89 行目で `visible()` を `DeferredContentAware.contentVisible` に写し、45〜50 行目の `hostDirectives` から `preserveContent` 入力を外に出します。中身を作る・消す側は[第 11 回](11-aria-deferred-content.md)で読みます。

## 5. 22.1.8 との差：ngAccordionTrigger 属性

📄 `accordion/accordion-trigger.ts の host（scratchpad/aria-22.1.8-vs-snapshot.diff から）`

```
--- 22.1.8（このサイトの node_modules から復元）
+++ 22.2.0-next.5（../components の e81c398a86）
@@ -52,11 +52,6 @@
     '[attr.aria-disabled]': '_pattern.disabled()',
     '[attr.disabled]': '_pattern.hardDisabled() ? true : null',
     '[attr.tabindex]': '_pattern.tabIndex()',
-
-    // `AccordionGroupPattern` depends on this to find the closest
-    // trigger so ensure that it is set. It's usually there for normal usage,
-    // but it might not be when the trigger is a host directive.
-    'ngAccordionTrigger': '',
   },
 })
```

このサイトに入れた 22.1.8 には、引用（e81c398a86、2026-09-10）に無い host の属性 `'ngAccordionTrigger': ''` があります。これは snapshot の後に main に入った 6a9f2d05ec「fix(aria/accordion): ensure right attribute is set when used as a host directive（#33839、2026-09-18）」で、22.1.8 に取り込まれています。トリガーを自作コンポーネントの `hostDirectives` で付けると、テンプレートに `ngAccordionTrigger` と書かないので属性が無く、2 節の 158 行目の `closest('[ngAccordionTrigger]')` がトリガーの中の子要素から上へたどれませんでした（#33810「custom trigger click」。2026-09-19 に「#33839 で直った」として閉じた）。このデモはテンプレートに `ngAccordionTrigger` と書いているので、この差で動きは変わりません。

## 6. 開いている #34011：パネルの中の Enter / Space で開閉する

#34011（2026-10-24、@angular/aria 22.2.4 と 22.1.6 で報告）は「開いたパネルの中のリンクで Enter、ボタンで Space を押すと、それが動かずにパネルが閉じる。入力欄で Home を押すとトリガーへフォーカスが飛ぶ」というものです。ここまでの行で説明できます。

1. **入力欄やボタンで押したキーが、グループに届く**

   グループは 4 節の 65 行目で `keydown` をグループの要素で受けます。パネルはグループの中にあるので、パネルの中で押したキーは泡立ってここに来ます。
2. **発生元を確かめずに表へ渡す**

   2 節の 95〜97 行目は、クリック（86〜87 行目）と違って発生元を見ません。
3. **Enter / Space はアクティブなトリガーを開閉し、既定の動作を止める**

   79〜80 行目が `toggle()` を呼び、115 行目の `activeItem()`（最後に触ったトリガー。107 行目のとおり、パネルの中へのフォーカスでは変わらない）を開閉します。一致したキーには `KeyboardEventManager` の既定で `preventDefault()` がかかるので、ボタンの click も、入力欄への空白の入力も起きません。Home / End は 77〜78 行目でトリガーの先頭 / 末尾へ移ります。

開いている PR #34012（2026-10-25、外部のコントリビューター）は、`onKeydown` の頭に 2 行を足すものです。

📄 `PR #34012 の private/accordion/accordion.ts の差分（gh pr diff で読んだもの）`

```
   /** Handles keydown events on the trigger, delegating to the group if not disabled. */
   onKeydown(event: KeyboardEvent): void {
+    const target = _getEventTarget<Element>(event);
+    if (target !== this.inputs.element() && !this._findTriggerPattern(target)) return;
+
     this.keydown().handle(event);
   }
```

発生元がグループの要素そのものでも、どれかのトリガー（またはその中）でもなければ、表に渡さずに返します。spec には `describe('with interactive content inside a panel')` を足し、リンクで Enter・ボタンで Space・入力欄で Home / End のとき `defaultPrevented` が false で、パネルが開いたままであることを見ています。2026-11-02 の時点でこの PR は開いたままで、main の private/accordion/accordion.ts は snapshot から変わっていません。

## 7. デモ：本物のアコーディオンで #34011 が出るか

> **🧪 DEMO — このページの @angular/aria 22.1.8 のアコーディオン**
>
> 本物の `ngAccordionGroup` / `ngAccordionTrigger` / `ngAccordionPanel` / `ngAccordionContent` です。キーボードで操作できます。Tab で見出しのボタンに入り、↑↓・Home・End で見出しの間を動き、Enter / Space で開閉します。「1. 入力欄とボタンのある項目」を開いて、中の入力欄・ボタンにフォーカスを移し、Enter・Space・Home を押してみてください。外枠で `keydown` を capture（捕獲。子に届く前に外側で受ける）で記録し、50ms 後に `event.defaultPrevented` と各トリガーの `aria-expanded`、フォーカスのある要素を読みます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/aria-accordion)

2026-11-02 にヘッドレスの Chrome でこのページを開き、キーを 1 つずつ押して記録した結果です。**22.1.8 で #34011 の症状は出ました**。

- **トリガー 1 で Enter**：`defaultPrevented=true`、`aria-expanded 1=true`。正しい動きです。
- **入力欄で a、続けて Space**：a は `defaultPrevented=false` で入力されます（表に無いキー）。Space は `defaultPrevented=true` で、`1=false`（パネル 1 が閉じた）、フォーカスは `body` になり、メモは「a」のままでした。閉じると `ngAccordionContent` の中身が消える（第 11 回）ので、フォーカスのあった入力欄ごと無くなります。
- **中のボタンで Enter / Space**：どちらも `defaultPrevented=true` でパネル 1 が閉じ、ボタンの click は来ませんでした。
- **入力欄で Home**：`defaultPrevented=true`、フォーカスがトリガー 1 に移りました（77 行目の `first()`）。
- **トリガー 2 で Enter（2 を開く）→ パネル 1 の中のボタンで Enter**：閉じたのは**パネル 2** でした（`1=true 2=false`）。ボタンがあるパネルではなく、アクティブなトリガー（115 行目）を開閉していることが分かります。
- **中のボタンをマウスでクリック**：「パネルの中のボタンの click が来た」と出て、パネルは閉じません。クリックは 86〜87 行目で弾かれるからです。

## 8. 呼び出しの連なり（パネルの中のボタンで Enter）

- 👤 `keydown "Enter"` — パネルの中のボタン — *泡立ってグループへ*
  - `(keydown) → _pattern.onKeydown($event)` — accordion-group.ts L65
    - `AccordionGroupPattern.onKeydown` — accordion.ts L95 — *発生元を見ない*
      - `keydown().handle(event)` — L96 — *一致したので preventDefault・stopPropagation（第 4 回）*
        - `this.toggle()` — L80 → L114
          - `expansionBehavior.toggle(activeItem)` — L117 — *activeItem は最後に触ったトリガー*
            - `ListExpansion.close(item) → expanded.set(false)` — expansion.ts L59 → L53
  - `aria-expanded="false"・inert・中身を破棄` — trigger L50 / panel L55・L87

## テストと直し方

📄 `components/src/aria/accordion/accordion.spec.ts` L281–299 （▶ の行: 281, 284–285, 287–288, 291, 294）

```ts
281 ▶       it('should toggle expansion of focused trigger with Enter', async () => {
282 │         expect(isTriggerExpanded(0)).toBeFalse();
283 │ 
284 ▶         await enterKey(triggerElements[0]);
285 ▶         expect(isTriggerExpanded(0)).toBeTrue();
286 │ 
287 ▶         await enterKey(triggerElements[0]);
288 ▶         expect(isTriggerExpanded(0)).toBeFalse();
289 │       });
290 │ 
291 ▶       it('should toggle expansion of focused trigger with Space', async () => {
292 │         expect(isTriggerExpanded(0)).toBeFalse();
293 │ 
294 ▶         await spaceKey(triggerElements[0]);
295 │         expect(isTriggerExpanded(0)).toBeTrue();
296 │ 
297 │         await spaceKey(triggerElements[0]);
298 │         expect(isTriggerExpanded(0)).toBeFalse();
299 │       });
```

2 節の 79〜80 行目を確かめているのは accordion.spec.ts の `describe('Keyboard navigation and interaction')`（:241）の `it('should toggle expansion of focused trigger with Enter')`（:281）と `it('should toggle expansion of focused trigger with Space')`（:291）です。284 行目と 287 行目で**トリガーの要素に**Enter を投げています。パネルの中の要素からキーを投げる it は、この snapshot の spec にはありません。PR #34012 が足しているのがそれです。

ほかに、この章の仕組みに当たる it です（行番号は e81c398a86）。

- `describe('single expansion mode (multiExpandable=false)')`（:146）の `it('should expand one and collapse others')`（:160）— 1 節の 42〜44 行目。
- `describe('AccordionPanel')`（:124）の `it('should have aria-labelledby pointing to the trigger id')`（:131）と `it('should have "inert" attribute when collapsed')`（:137）— 4 節のパネルの属性。
- `describe('structural validations')`（:490）の `it('should warn when trigger is nested inside its controlled panel')`（:520）— 4 節の 100〜104 行目。

📄 `ターミナル`

```
cd ~/angular-research/components
pnpm bazel test //src/aria/accordion:unit_tests_chromium --nocache_test_results --test_output=all
```

📄 `出力（抜粋。2026-11-02 に実行）`

```
Chromium: |██████████████████████████████| 1/1 test files | 42 passed, 0 failed
Finished running tests in 0.6s, all tests passed! 🎉
INFO: Elapsed time: 2.237s, Critical Path: 1.18s
//src/aria/accordion:unit_tests_chromium                                 PASSED in 1.1s
```

1. **本数**

   ターゲットを絞る引数は無いので、accordion.spec.ts の全部（42 本）が走ります。Pattern を単体で動かす `//src/aria/private/accordion:unit_tests_chromium`（27 本）と `//src/aria/private/behaviors/expansion:unit_tests_chromium`（33 本）は、シリーズでまとめて走らせた記録の数です（この章では走らせていません）。
2. **直すとしたら**

   #34011 の入口は `AccordionGroupPattern.onKeydown`（private/accordion/accordion.ts 95 行目）です。PR #34012 はここで発生元を確かめています。振る舞いの spec は accordion/accordion.spec.ts に、Pattern の spec は private/accordion/accordion.spec.ts に足します。
3. **issue を読むときの手がかり**

   「パネルの中で何かが効かない」報告なら、グループの要素で受けている 3 つのイベント（65〜67 行目）のどれが泡立って来ているかを分けて見ます。クリックは 86〜87 行目で弾かれ、`focusin` は 107 行目で返り、`keydown` だけが素通りします。閉じた issue と PR の流れは[第 20 回](20-aria-issues.md)にまとめます。#34011 には既に外部の PR が付いているので、手元で症状と行を確かめるところまでにします。

## 聞かれそうな質問

**Q. 複数のパネルを同時に開けますか？**

既定で開けます。グループの `multiExpandable` の既定が true（accordion-group.ts 93 行目）だからです。`[multiExpandable]="false"` にすると、1 節の 42〜44 行目で、開く前に `closeAll()` が走ります。このとき `[(expanded)]` の初期値で 2 つ以上を開いていると、3 節の 135〜136 行目の `validate()` が開発モードで警告します。

**Q. 開いていないパネルの中身は、いつ作られますか？**

`<ng-template ngAccordionContent>` に書いた中身は、パネルが見えるようになった描画のあとで作られ、既定では閉じると壊されます。4 節の 85〜89 行目で `visible()` を `contentVisible` に写し、それを `DeferredContent` が見ています。続きは[第 11 回](11-aria-deferred-content.md)です。

**Q. 見出しのレベル（h3 など）はどうするのですか？**

利用者が書きます。トリガーが付けるのは 48 行目の `role="button"` までで、src/aria/accordion の .ts を grep しても `aria-level` や見出しを付ける行はありません。`AccordionGroup` の doc コメントの例は、`<button ngAccordionTrigger>` を `<h3>` で包んでいます。このページのデモも同じです。

**Q. トリガーを無効にするとどうなりますか？**

`disabled` が真になり（201〜203 行目）、1 節の 80 行目の `isExpandable` が偽になるので開閉しません。グループの `softDisabled` が既定の true なら、フォーカスは止まり（`tabindex="0"`）、`aria-disabled="true"` が付きます。`softDisabled` を false にすると `hardDisabled`（206〜208 行目）になり、本物の `disabled` 属性が付いて Tab でも飛ばされます。

## 読み終えて

- `ListExpansion` は状態を持たず、各項目の `expanded` を書く。`multiExpandable` が偽なら開く前に全部を閉じる（expansion.ts L39-47）。
- `AccordionGroupPattern` は `List` を使わず、ListFocus・ListNavigation・ListExpansion を直接組む。トリガーは全部 `tabindex="0"`（accordion.ts L196-198）。
- トリガーは `ngOnInit` でパネルの `_pattern` に自分を入れ、DI でたどったグループに登録する。だから別のコンポーネントの中でも見つかる（accordion-trigger.ts L118-127）。
- パネルは `role="region"`・`aria-labelledby`・閉じたら `inert`。見た目は CSS で隠す（accordion-panel.ts L52-55）。
- #34011：グループの `onKeydown` は発生元を見ないので、パネルの中の Enter / Space / Home がアクティブなトリガーに効く。22.1.8 のデモでも出る（accordion.ts L95-97）。

---

← 前: [Listbox：Behavior を組み合わせた最初の部品](09-aria-listbox.md)  
次: [DeferredContent：閉じているパネルの中身を作らない](11-aria-deferred-content.md) →
