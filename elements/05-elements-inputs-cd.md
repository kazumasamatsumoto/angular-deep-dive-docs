[目次](../README.md) › [Angular Elements の内側](README.md) › 第 5 回 / 全 8 回

# 入力と変更検知：setInputValue と ChangeDetectionScheduler

> setInputValue がつながる前は値を Map に置き、つながったあとは ComponentRef.setInput に渡す行。setInput が Object.is で同じ値を弾く行、ngOnChanges のための SimpleChanges を NgOnChangesFeature が箱にためて tick の中で 1 回だけ渡す行、isViewDirty・markForRefresh と NotificationSource.CustomElement の通知、runInZone。v22 の既定（zoneless・OnPush）では何回入れても tick は 1 回にまとまる（scheduleDetectChanges は 0cebfd7462c で消えた）。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/elements-inputs-cd)

---

カスタム要素のプロパティに値を入れると、コンポーネントの入力に値が入り、いつか画面が書き換わります。この章では、その「入る」と「いつか書き換わる」の間を、`ComponentNgElementStrategy.setInputValue` から core の `ComponentRef.setInput`・`ngOnChanges` のための記録・`ChangeDetectionScheduler` への通知まで 1 行ずつ追います。同じ値を 2 回入れたとき、違う値を続けて 3 回入れたときに、`ngOnChanges` と DOM の書き換えが何回起きるかを、ページの上の本物のカスタム要素で数えます。

読む対象は `packages/elements/src/component-factory-strategy.ts`（`setInputValue`・`getInputValue`・`runInZone`）と、core の `render3/component_ref.ts`・`render3/features/ng_onchanges_feature.ts`・`render3/view_ref.ts`・`change_detection/scheduling/zoneless_scheduling_impl.ts` です。

1. [1. 全体像](01-elements-overview.md)
2. [2. createCustomElement](02-elements-create.md)
3. [3. 属性と入力](03-elements-attributes-inputs.md)
4. [4. つながるとき](04-elements-connect.md)
5. **5. 入力と変更検知**（この章）
6. [6. 出力とイベント](06-elements-outputs.md)
7. [7. 切り離しと破棄](07-elements-disconnect.md)
8. [8. spec と issue](08-elements-tests-issues.md)

> [!WARNING]
> **ハマりどころ**
>
> 古い解説やブログには、`setInputValue` が値を `strictEquals` で比べ、`recordInputChange` で `SimpleChanges` をため、`scheduleDetectChanges` で `requestAnimationFrame` まで `detectChanges` をまとめる、と書いてあるものがあります。これは 2024 年 6 月のコミット `0cebfd7462c`（fix(elements): switch to \`ComponentRef.setInput\` & remove custom scheduler）より前の形です。v22 の `component-factory-strategy.ts` にはこの 3 つの名前は 1 つも出てきません（`grep` で 0 件）。比べるのも、`SimpleChanges` をためるのも、予定を立てるのも、いまは core の仕事です。この章はその core の側を読みます。

## 1. 要素のプロパティから setInputValue まで

`el.value = 'A'` と書くと、`createCustomElement` がプロトタイプに定義した setter が `this.ngElementStrategy.setInputValue(propName, newValue, transform)` を呼びます。属性を書いたときも `attributeChangedCallback` から同じ関数に来ます（どちらも [第 2 回](02-elements-create.md)）。ここから先が `ComponentNgElementStrategy` です。

📄 `angular/packages/elements/src/component-factory-strategy.ts` L168–177 （▶ の行: 172–175）

```ts
168 │   /**
169 │    * Sets the input value for the property. If the component has not yet been created, the value is
170 │    * cached and set when the component is created.
171 │    */
172 ▶   setInputValue(property: string, value: any): void {
173 ▶     if (this.componentRef === null) {
174 ▶       this.initialInputValues.set(property, value);
175 ▶       return;
176 │     }
177 │ 
```

172 行目、引数は `property` と `value` の 2 つだけです。要素の側は 3 つ目に `transform` を渡してきますが、既定の strategy はそれを受け取りません。transform は core の `setInput` の中で入力の定義から呼ばれるからです（[第 3 回](03-elements-attributes-inputs.md)）。173〜176 行目、まだコンポーネントが無ければ（つながる前）、値を `initialInputValues` という `Map` に置いて終わりです。置いた値は、つながったときに `initializeInputs` がこの関数をもう一度呼んで入れ直します（[第 4 回](04-elements-connect.md)）。

📄 `angular/packages/elements/src/component-factory-strategy.ts` L178–184 （▶ の行: 178–179, 181–182）

```ts
178 ▶     this.runInZone(() => {
179 ▶       this.componentRef!.setInput(this.inputMap.get(property) ?? property, value);
180 │ 
181 ▶       // `setInput` won't mark the view dirty if the input didn't change from its previous value.
182 ▶       if (isViewDirty(this.componentRef!.hostView as ViewRef<unknown>)) {
183 │         // `setInput` will have marked the view dirty already, but also mark it for refresh. This
184 │         // guarantees the view will be checked even if the input is being set from within change
```

コンポーネントがあれば、178 行目で `runInZone` に包んで（5 節）、179 行目で `ComponentRef.setInput` を呼びます。名前は `inputMap.get(property) ?? property` です。`inputMap` は `ComponentNgElementStrategyFactory` が作った「プロパティの名前 → テンプレートでの名前（別名）」の表で（[第 1 回](01-elements-overview.md)）、`setInput` はテンプレートでの名前を受け取るので、ここで直します。181 行目のコメントが次の節の答えです。**`setInput` は、前と同じ値ならビューを dirty にしません**。だから 182 行目で、本当に dirty になったかを確かめてから先へ進みます。

## 2. core の setInput：同じ値なら何もしない

📄 `angular/packages/core/src/render3/component_ref.ts` L617–623 （▶ の行: 619–621, 623）

```ts
617 │     // Do not set the input if it is the same as the last value
618 │     // This behavior matches `bindingUpdated` when binding inputs in templates.
619 ▶     if (
620 ▶       this.previousInputValues.has(name) &&
621 ▶       Object.is(this.previousInputValues.get(name), value)
622 │     ) {
623 ▶       return;
```

619〜623 行目。`previousInputValues` に同じ名前があり、`Object.is` で同じなら、何もせずに戻ります。コメント（617〜618 行目）のとおり、テンプレートの `[value]="x"` の比べ方（`bindingUpdated`）と同じにしてあります。`Object.is` なので、`NaN` と `NaN` は同じ、`0` と `-0` は違うと見なされます。オブジェクトは中身ではなく参照で比べます。

📄 `angular/packages/core/src/render3/component_ref.ts` L626–630 （▶ の行: 627–628, 630）

```ts
626 │     const lView = this._rootLView;
627 ▶     const hasSetInput = setAllInputsForProperty(tNode, lView[TVIEW], lView, name, value);
628 ▶     this.previousInputValues.set(name, value);
629 │     const childComponentLView = getComponentLViewByIndex(tNode.index, lView);
630 ▶     markViewDirty(childComponentLView, NotificationSource.SetInput);
```

違う値なら、627 行目の `setAllInputsForProperty` で入力に書き込み、628 行目で今回の値を覚え、630 行目でコンポーネントのビューを `markViewDirty(…, NotificationSource.SetInput)` します。`markViewDirty` が祖先に印を付けてスケジューラに知らせるところは [cd-onpush-markforcheck](../cd/04-cd-onpush-markforcheck.md) で読みました。`setInput` 全体の形（`_hasInputBindings` の確認や、知らない入力のときのエラー）は [ivy-refs](../ivy/16-ivy-refs.md) にあります。

> [!TIP]
> **新卒エンジニアへ**
>
> 「同じ値」は **直前に `setInput` した値**と比べます。コンポーネントのフィールドの初期値（`@Input() value = ''` の `''`）とは比べません。`previousInputValues` は最初は空なので、1 回目の `setInput` は、初期値と同じ値でも必ず書き込みます。

## 3. ngOnChanges のための記録は誰がするのか

`setAllInputsForProperty` は、最後に入力の定義の `setInput` を呼んで書き込みます（[signals-input-compile](../signals/12-signals-input-compile.md) の `writeToDirectiveInput`）。コンポーネントが `ngOnChanges` を持っていると、その `setInput` が差し替わっています。

📄 `angular/packages/core/src/render3/features/ng_onchanges_feature.ts` L57–65 （▶ の行: 61–62, 64）

```ts
57 │ /**
58 │  * We don't expose the feature implementation directly in order to tree shake it when `ngOnChanges` isn't used.
59 │  */
60 │ function NgOnChangesFeatureImpl<T>(definition: DirectiveDef<T>) {
61 ▶   if (definition.type.prototype.ngOnChanges) {
62 ▶     definition.setInput = ngOnChangesSetInput;
63 │   }
64 ▶   return rememberChangeHistoryAndInvokeOnChangesHook;
65 │ }
```

`ngOnChanges` を書いたコンポーネントには、コンパイラが `features: [ɵɵNgOnChangesFeature]` を付けます。61〜62 行目で、プロトタイプに `ngOnChanges` があれば定義の `setInput` を `ngOnChangesSetInput` に替え、64 行目で、変更検知の途中で呼ばれるフック `rememberChangeHistoryAndInvokeOnChangesHook` を返します。

📄 `angular/packages/core/src/render3/features/ng_onchanges_feature.ts` L97–120 （▶ の行: 107–110, 113–116, 119）

```ts
 97 │ function ngOnChangesSetInput<T>(
 98 │   this: DirectiveDef<T>,
 99 │   instance: T,
100 │   inputSignalNode: null | InputSignalNode<unknown, unknown>,
101 │   value: unknown,
102 │   publicName: string,
103 │   privateName: string,
104 │ ): void {
105 │   const declaredName = (this.declaredInputs as {[key: string]: string})[publicName];
106 │   ngDevMode && assertString(declaredName, 'Name of input in ngOnChanges has to be a string');
107 ▶   const simpleChangesStore =
108 ▶     getSimpleChangesStore(instance) ||
109 ▶     setSimpleChangesStore(instance, {previous: EMPTY_OBJ, current: null});
110 ▶   const current = simpleChangesStore.current || (simpleChangesStore.current = {});
111 │   const previous = simpleChangesStore.previous;
112 │   const previousChange = previous[declaredName];
113 ▶   current[declaredName] = new SimpleChange(
114 ▶     previousChange && previousChange.currentValue,
115 ▶     value,
116 ▶     previous === EMPTY_OBJ,
117 │   );
118 │ 
119 ▶   applyValueToInputField(instance, inputSignalNode, privateName, value);
120 │ }
```

1. **107〜109 行目：インスタンスに記録の箱を付ける**

   箱は `{ previous, current }` の 2 つの `SimpleChanges` です。初めてなら `previous` を空の印 `EMPTY_OBJ` にして作り、インスタンスの `__ngSimpleChanges__` という名前のプロパティに置きます。
2. **110・113〜117 行目：`current` に `SimpleChange` を書く（上書き）**

   `previousValue` は「前回 `ngOnChanges` に渡した値」（`previous` の側の `currentValue`）、`currentValue` は今回の値、`firstChange` は 116 行目の `previous === EMPTY_OBJ` です。`firstChange` は入力ごとではなく、**このインスタンスで `ngOnChanges` がまだ一度も呼ばれていないか**で決まります。一度呼ばれたあとに初めて入れた入力も `firstChange: false` です（elements の spec の `component-factory-strategy_spec.ts:163` の `xit` は、これを「`ngOnChanges` の実装のバグ」とコメントして止めています。[第 8 回](08-elements-tests-issues.md)）。**同じ入力に何回書いても、`current` のその名前の欄が上書きされるだけ**です。
3. **119 行目：フィールドに書き込む**

   値はこの場でインスタンスのフィールドに入ります。`ngOnChanges` が呼ばれるのはもっとあとですが、`componentRef.instance.value` はもう新しい値です。

📄 `angular/packages/core/src/render3/features/ng_onchanges_feature.ts` L77–95 （▶ の行: 79, 81, 83–84, 88–89, 92–93）

```ts
77 │ function rememberChangeHistoryAndInvokeOnChangesHook(this: OnChanges) {
78 │   const simpleChangesStore = getSimpleChangesStore(this);
79 ▶   const current = simpleChangesStore?.current;
80 │ 
81 ▶   if (current) {
82 │     const previous = simpleChangesStore!.previous;
83 ▶     if (previous === EMPTY_OBJ) {
84 ▶       simpleChangesStore!.previous = current;
85 │     } else {
86 │       // New changes are copied to the previous store, so that we don't lose history for inputs
87 │       // which were not changed this time
88 ▶       for (let key in current) {
89 ▶         previous[key] = current[key];
90 │       }
91 │     }
92 ▶     simpleChangesStore!.current = null;
93 ▶     this.ngOnChanges(current);
94 │   }
95 │ }
```

変更検知でホストのビューが更新されるとき、このフックが `ngOnInit` などより前に呼ばれます（フックの並びは [ivy-hooks](../ivy/13-ivy-hooks.md)）。81 行目で `current` が無ければ何もしません。あれば 83〜91 行目で `previous` に写し、92 行目で `current` を空に戻してから、93 行目で `ngOnChanges(current)` を 1 回呼びます。**変更検知と変更検知の間に何回書き込まれても、`ngOnChanges` は 1 回で、中身は最後の値**です。これがデモの「違う値を 3 回」の結果の根拠です。

## 4. dirty なら、念押しを 2 つ

📄 `angular/packages/elements/src/component-factory-strategy.ts` L186–192 （▶ の行: 187, 191）

```ts
186 │         // schedule change detection in addition to the current zone run.
187 ▶         markForRefresh(this.componentRef!.changeDetectorRef as ViewRef<unknown>);
188 │ 
189 │         // Notifying the scheduler with `NotificationSource.CustomElement` causes a `tick()` to be
190 │         // scheduled unconditionally, even if the scheduler is otherwise disabled.
191 ▶         this.cdScheduler.notify(NotificationSource.CustomElement);
192 │       }
```

1 節の 182 行目でビューが dirty だったときだけ、187 行目で `markForRefresh`、191 行目で `cdScheduler.notify(NotificationSource.CustomElement)` を呼びます。`setInput` の 630 行目ですでに dirty の印と `SetInput` の通知は済んでいるので、この 2 つは念押しです。何を念押ししているのかを、core の側で確かめます。

📄 `angular/packages/core/src/render3/view_ref.ts` L379–389 （▶ の行: 383, 387–388）

```ts
379 │ /**
380 │  * Reports whether the given view is considered dirty according to the different marking mechanisms.
381 │  */
382 │ export function isViewDirty(view: ViewRef<unknown>): boolean {
383 ▶   return requiresRefreshOrTraversal(view._lView) || !!(view._lView[FLAGS] & LViewFlags.Dirty);
384 │ }
385 │ 
386 │ export function markForRefresh(view: ViewRef<unknown>): void {
387 ▶   // This function is only used by elements where _cdRefInjectingView is the same as _lView
388 ▶   markViewForRefresh(view._lView);
389 │ }
```

383 行目の `isViewDirty` は、ビューに `Dirty` の印があるか、更新か走査が必要な印（`requiresRefreshOrTraversal`）があるかを見ます。388 行目の `markForRefresh` は `markViewForRefresh` で、ビューに `RefreshView` の印を付けます。`Dirty` の印のビューは、全体を見る走査（Global）のときにだけ更新されます。`RefreshView` の印のビューは、印をたどる走査（Targeted）でも必ず更新されます（2 つの走査と印の扱いは [cd-targeted-traversal](../cd/06-cd-targeted-traversal.md)）。変更検知の最中に、すでに通り過ぎたビューの入力が変わっても、同じ tick の中でもう一度見に来させるための印です（7 節の spec の「during CD」）。387 行目のコメントにあるとおり、この関数は elements のためだけにあります。

📄 `angular/packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts` L164–170 （▶ の行: 164, 168）

```ts
164 ▶       case NotificationSource.CustomElement: {
165 │         // We use `ViewTreeTraversal` to ensure we refresh the element even if this is triggered
166 │         // during CD. In practice this is a no-op since the elements code also calls via a
167 │         // `markForRefresh()` API which sends `NotificationSource.MarkAncestorsForTraversal` anyway.
168 ▶         this.appRef.dirtyFlags |= ApplicationRefDirtyFlags.ViewTreeTraversal;
169 │         break;
170 │       }
```

`ChangeDetectionSchedulerImpl.notify` の `CustomElement` の分かれ道です。168 行目で `ApplicationRefDirtyFlags.ViewTreeTraversal` を立てます。コメント（165〜167 行目）は「`markForRefresh` がどのみち `MarkAncestorsForTraversal` を送るので、実際には何も足さない」と書いています。それでも送るのは、`notify` のこのあとの部分で tick の予定が立つからです（ほかの通知と同じく、すでに予定があれば立て直しません。[zoneless-notify](../zoneless/03-zoneless-notify.md)）。通知の種類の一覧で `CustomElement` がどこにあるかは [zoneless-notification-source](../zoneless/02-zoneless-notification-source.md) の 10 節です。

つまり v22 の elements は、自分で予定を立てません。**`setInput` がビューを dirty にし、アプリ全体で 1 つの `ChangeDetectionSchedulerImpl` が次の tick を 1 回だけ予定し、その tick の中で `ngOnChanges` とテンプレートの更新が起きます**。いくつの要素に何回値を入れても、tick の予定は 1 つにまとまります。

> [!NOTE]
> **ポイント**
>
> v22 では `changeDetection` を書かないコンポーネントは OnPush です（`eae8f7e30b9`、feat(core): Set default Component changeDetection strategy to OnPush）。カスタム要素の中のコンポーネントも同じで、デモの `ElIcdLabel` も OnPush です。それでも書き換わるのは、`setInput` の 630 行目がコンポーネントのビューそのものを dirty にするからです。OnPush の「入力が変わったら見る」の「入力が変わった」は、この `markViewDirty` のことです。このコミットで elements の spec の `TestComponent` には `changeDetection: ChangeDetectionStrategy.Eager` が足されました（7 節）。

## 5. getInputValue と runInZone

📄 `angular/packages/elements/src/component-factory-strategy.ts` L154–166 （▶ の行: 159–161, 164）

```ts
154 │   /**
155 │    * Returns the component property value. If the component has not yet been created, the value is
156 │    * retrieved from the cached initialization values.
157 │    */
158 │   getInputValue(property: string): any {
159 ▶     return this.runInZone(() => {
160 ▶       if (this.componentRef === null) {
161 ▶         return this.initialInputValues.get(property);
162 │       }
163 │ 
164 ▶       return this.componentRef.instance[property];
165 │     });
166 │   }
```

要素のプロパティを読むと、getter がここを呼びます。160〜162 行目、つながる前は `initialInputValues` から返します。164 行目、つながったあとは `componentRef.instance[property]`、つまりコンポーネントのフィールドをそのまま返します。3 節の 119 行目のとおりフィールドは代入の場で書き換わっているので、**代入した直後に読むと、まだ画面が書き換わっていなくても新しい値が返ります**。signal の入力ではフィールドが `InputSignal` なので、要素の getter の側で呼び出して中身を返します（`be0455adda7`、[第 2 回](02-elements-create.md)）。

📄 `angular/packages/elements/src/component-factory-strategy.ts` L106–109 （▶ の行: 108–109）

```ts
106 │     this.ngZone = this.injector.get(NgZone);
107 │     this.appRef = this.injector.get(ApplicationRef);
108 ▶     this.cdScheduler = injector.get(ChangeDetectionScheduler);
109 ▶     this.elementZone = typeof Zone === 'undefined' ? null : this.ngZone.run(() => Zone.current);
```

📄 `angular/packages/elements/src/component-factory-strategy.ts` L244–248 （▶ の行: 246）

```ts
244 │   /** Runs in the angular zone, if present. */
245 │   private runInZone(fn: () => unknown) {
246 ▶     return this.elementZone && Zone.current !== this.elementZone ? this.ngZone.run(fn) : fn();
247 │   }
248 │ }
```

constructor の 108 行目で、スケジューラは注入器から `ChangeDetectionScheduler` として取ります。109 行目で、zone.js が読み込まれていなければ `elementZone` は `null`、読み込まれていれば `ngZone.run` の中で見た `Zone.current`（Angular の zone）です。246 行目の `runInZone` は、`elementZone` があって、いまその zone の外にいるときだけ `ngZone.run(fn)`、それ以外は `fn()` をそのまま呼びます。

- **zone.js の無いアプリ（v22 の既定、このサイト）**：109 行目で `null` なので、`runInZone` は何もしない包みです。予定は 4 節の通知だけで立ちます。
- **`provideZoneChangeDetection()` のアプリ**：zone の外（たとえば素の `setTimeout` や別のフレームワークのコード）から値を入れると、1 回ごとに `ngZone.run` に入り、抜けるときに zone が安定して `onMicrotaskEmpty` から tick が走ります（[zone-ngzone-scheduler](../zone/11-zone-ngzone-scheduler.md)）。**3 回入れると tick も 3 回、`ngOnChanges` も 3 回**です。7 節の `xit` のコメントはこのことを書いています。

## 6. DEMO：同じ値を 2 回、違う値を 3 回

> **🧪 DEMO — 入力を入れて、ngOnChanges と DOM の書き換えを数える（ライブ。@angular/elements 22.1.6 の createCustomElement）**
>
> 「要素を作ってつなぐ」を押すと、`createCustomElement(ElIcdLabel, { injector })` で作ったクラスを `el-inputs-cd-label` の名前で登録し（2 回目からは登録済みのものを使います）、`document.createElement` で作った要素を下の枠に入れます。`ElIcdLabel` は `@Input() value` を 1 つ持ち、`changeDetection` を書いていない（v22 の既定の OnPush の）コンポーネントです。表の「時刻」はボタンを押してからのミリ秒です。「DOM」の行は、要素に付けた `MutationObserver` が要素の中の書き換えを見つけたときに出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/elements-inputs-cd)

試すと分かることです（本番ビルドをヘッドレスの Chrome で動かして確かめた結果は、章末の「テストと直し方」の最後にあります）。

1. **つなぐ：constructor と DOM の書き換えが 1 回ずつ、`ngOnChanges` は 0 回**

   まだ何も入れていないので `initialInputValues` は空で、`initializeInputs` は `setInputValue` を 1 回も呼びません。3 節の箱が作られないので、最初の `detectChanges` でも 81 行目で何もせず、`ngOnChanges` は呼ばれません。DOM の行は、最初の描画で `<span>` が入った 1 回です。
2. **同じ値 "A" を 2 回（1 回目に押したとき）：`ngOnChanges` 1 回、DOM 1 回**

   1 回目の代入は 2 節の 619 行目を通り抜けて書き込み、2 回目は 623 行目で戻ります。どちらの代入のあとでも、読み返すと `"A"` です（5 節の 164 行目）。`ngOnChanges` の行は代入の行より少しあと（ヘッドレスの Chrome では十数ミリ秒あと）に出ます。tick が予定されて、あとで走ったからです（予定の立て方は [zoneless-raf-race](../zoneless/04-zoneless-raf-race.md)）。中身は `undefined → "A"（firstChange: true）` で、フィールドの初期値 `''` は出てきません（2 節の tip、3 節の 113〜116 行目）。
3. **同じ値 "A" を 2 回（もう一度押したとき）：何も起きない**

   2 回とも 623 行目で戻るので、ビューは dirty にならず、1 節の 182 行目の `isViewDirty` も false です。`markForRefresh` も通知も呼ばれず、表には自分の代入の 2 行しか出ません。
4. **違う値を続けて 3 回：`ngOnChanges` 1 回、中身は最後の値**

   3 回とも書き込みますが、tick の予定は 1 つです。tick の中で 3 節のフックが 1 回だけ呼ばれ、中身は `"A" → "v3"（firstChange: false）` です。`v1` と `v2` は `ngOnChanges` に一度も出てきません。DOM の書き換えも 1 回（中身「v3」）です。
5. **属性 value="C" を 2 回：プロパティと同じ**

   `setAttribute` は、同じ値でも呼ぶたびに `attributeChangedCallback` を呼びます。そこから同じ `setInputValue` に来るので、1 回目に押したときは `ngOnChanges` 1 回、もう一度押すと何も起きません。属性の名前と入力の名前の対応は [第 3 回](03-elements-attributes-inputs.md)です。

## ここまでの呼び出し

- 👤 `el.value = 'v3'` — あなたのコード
  - `NgElementImpl の setter` — create-custom-element.ts — *第 2 回*
    - `ComponentNgElementStrategy.setInputValue` — component-factory-strategy.ts 172 — *つながる前なら initialInputValues に置いて終わり*
      - `runInZone(fn)` — component-factory-strategy.ts 246 — *zone.js が無ければ fn() のまま*
        - `ComponentRef.setInput(templateName, value)` — component\_ref.ts 607 — *Object.is で同じなら 623 で戻る*
          - `setAllInputsForProperty` → `writeToDirectiveInput` → `ngOnChangesSetInput` — ng\_onchanges\_feature.ts 97 — *SimpleChange を current に書き、フィールドに代入*
          - `markViewDirty(view, NotificationSource.SetInput)` — component\_ref.ts 630 — *tick を予定*
        - `isViewDirty(hostView)` → `markForRefresh` — view\_ref.ts 382・386
        - `cdScheduler.notify(NotificationSource.CustomElement)` — zoneless\_scheduling\_impl.ts 164 — *予定はすでにあるので増えない*
- `（数ミリ〜十数ミリ秒あと）ChangeDetectionSchedulerImpl.tick` → `ApplicationRef.tick` — zoneless-tick
  - `rememberChangeHistoryAndInvokeOnChangesHook` — ng\_onchanges\_feature.ts 77 — *ngOnChanges を 1 回*
  - `コンポーネントのテンプレートの更新` — DOM の書き換え 1 回

## テストと直し方

### spec と describe

| spec | describe / it | この章のどこ |
| --- | --- | --- |
| test/component-factory-strategy\_spec.ts | describe `when inputs change and not connected`（176 行目）の it `should cache the value`（177）・`should not detect changes`（185） | 1 節の 173〜176 行目・5 節の 160〜162 行目 |
| 同上 | describe `when inputs change and is connected`（192 行目）の it `should be set on the component instance`（205）・`should detect changes`（211）・`should detect changes even when updated during CD`（219）・`should call ngOnChanges`（262）、`xit` 3 件（254・272・284） | 1〜4 節 |
| 同上 | describe `runInZone`（324 行目）の it 2 件（327・336）と `xit` 1 件（347） | 5 節（[第 8 回](08-elements-tests-issues.md)で読みます） |

📄 `angular/packages/elements/test/component-factory-strategy_spec.ts` L373–383 （▶ の行: 377, 381）

```ts
373 │ @Component({
374 │   selector: 'fake-component',
375 │   imports: [CdTrackerDir],
376 │   template: `
377 ▶     <ng-container cdTracker></ng-container>
378 │     <ng-content select="content-1"></ng-content>
379 │     <ng-content select="content-2"></ng-content>
380 │   `,
381 ▶   changeDetection: ChangeDetectionStrategy.Eager,
382 │ })
383 │ export class TestComponent {
```

この spec のコンポーネントは本物です。377 行目の `cdTracker` ディレクティブの `ngDoCheck` で `cdCalls` を数え、それを「変更検知の回数」として使います。381 行目の `ChangeDetectionStrategy.Eager` は 4 節の note の OnPush の既定のコミットで足された行で、これが無いと `cdCalls` の数え方が変わります。

📄 `angular/packages/elements/test/component-factory-strategy_spec.ts` L192–217 （▶ の行: 196, 199–200, 202, 213–214, 216）

```ts
192 │   describe('when inputs change and is connected', () => {
193 │     let componentRef: ComponentRef<TestComponent>;
194 │ 
195 │     beforeEach(async () => {
196 ▶       strategy.connect(document.createElement('div'));
197 │       componentRef = getComponentRef(strategy)!;
198 │       expect(componentRef).not.toBeNull();
199 ▶       await whenStable();
200 ▶       expect(componentRef.instance.cdCalls).toBe(2);
201 │ 
202 ▶       componentRef.instance.cdCalls = 0;
203 │     });
204 │ 
205 │     it('should be set on the component instance', () => {
206 │       strategy.setInputValue('fooFoo', 'fooFoo-1');
207 │       expect(componentRef.instance.fooFoo).toBe('fooFoo-1');
208 │       expect(strategy.getInputValue('fooFoo')).toBe('fooFoo-1');
209 │     });
210 │ 
211 │     it('should detect changes', async () => {
212 │       expect(componentRef.instance.cdCalls).toBe(0);
213 ▶       strategy.setInputValue('fooFoo', 'fooFoo-1');
214 ▶       await whenStable();
215 │       // Connect detected changes automatically
216 ▶       expect(componentRef.instance.cdCalls).toBe(1);
217 │     });
```

196 行目で本物の `connect` を呼び、199 行目の `whenStable`（`ApplicationRef.isStable` が true になるのを待つ helper）のあと、200 行目でつながるまでに `cdCalls` が 2 になったことを確かめ、202 行目で 0 に戻します。213〜216 行目、1 回入れて安定を待つと 1 回です。この spec の `TestBed` は、ファイルの先頭の `beforeEach` で `provideZoneChangeDetection()` を足して作られています（[第 4 回](04-elements-connect.md)）。

📄 `angular/packages/elements/test/component-factory-strategy_spec.ts` L219–245 （▶ の行: 224, 232, 238, 242–244）

```ts
219 │     it('should detect changes even when updated during CD', async () => {
220 │       @Component({
221 │         template: ``,
222 │       })
223 │       class DriverCmp {
224 ▶         ngAfterViewChecked(): void {
225 │           // This runs within the Angular zone, within change detection.
226 │           NgZone.assertInAngularZone();
227 │ 
228 │           // Because we're inside the zone, setting the input won't cause a fresh tick() to be
229 │           // scheduled (the scheduler knows we're in the zone and in fact that a tick() is in
230 │           // progress). However, setting the input should cause the view to be marked for _refresh_
231 │           // as well as dirty, allowing CD to revisit this view and pick up the change.
232 ▶           strategy.setInputValue('fooFoo', 'fooFoo-2');
233 │         }
234 │       }
235 │ 
236 │       const appRef = TestBed.inject(ApplicationRef);
237 │       const cmpRef = createComponent(DriverCmp, {environmentInjector: appRef.injector});
238 ▶       appRef.attachView(cmpRef.hostView);
239 │ 
240 │       // Wait for CD of the application, which needs to check `TestComponent` twice since it only
241 │       // becomes dirty after `DriverCmp.ngAfterViewChecked`.
242 ▶       await whenStable();
243 ▶       expect(componentRef.instance.fooFoo).toBe('fooFoo-2');
244 ▶       expect(componentRef.instance.cdCalls).toBe(2);
245 │     });
```

4 節の `markForRefresh` を確かめる it です。別のコンポーネントの `ngAfterViewChecked`（224 行目、変更検知の最中）で 232 行目のように値を入れます。242〜244 行目で、その tick の中で値が反映され、`TestComponent` が 2 回見られたことを確かめます。

📄 `angular/packages/elements/test/component-factory-strategy_spec.ts` L247–268 （▶ の行: 247–249, 254, 259, 262, 265–266）

```ts
247 ▶     // Disabled: when `setInputValue()` is called from outside the zone (like in this test), CD will
248 ▶     // be forced to run after each `setInputValue()` call, thanks to `setInputValue()` running
249 ▶     // `NgZone.run()`.
250 │     //
251 │     // Previously, this test spied on `.detectChanges()` and therefore did not detect that this was
252 │     // happening, since the CD triggered from `ApplicationRef.tick()` didn't go through
253 │     // `.detectChanges()`.
254 ▶     xit('should detect changes once for multiple input changes', async () => {
255 │       strategy.setInputValue('fooFoo', 'fooFoo-1');
256 │       expect(componentRef.instance.cdCalls).toBe(0);
257 │       strategy.setInputValue('barBar', 'barBar-1');
258 │       await whenStable();
259 ▶       expect(componentRef.instance.cdCalls).toBe(1);
260 │     });
261 │ 
262 ▶     it('should call ngOnChanges', async () => {
263 │       strategy.setInputValue('fooFoo', 'fooFoo-1');
264 │       await whenStable();
265 ▶       expectSimpleChanges(componentRef.instance.simpleChanges[0], {
266 ▶         fooFoo: new SimpleChange(undefined, 'fooFoo-1', true),
267 │       });
268 │     });
```

247〜249 行目のコメントが 5 節の「zone のアプリでは 1 回ごとに tick」の根拠です。**zone の外から 2 回入れると変更検知も 2 回になるので、「1 回にまとまる」を期待する 254 行目の it は `xit`（飛ばす）になっています**。262〜268 行目は 1 回入れて `ngOnChanges` が `firstChange: true` で 1 回来ることだけを見ています。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/elements/... --nocache_test_results --test_output=all

# 名前の絞り込みを試した（効かない）
pnpm bazel test //packages/elements/test:test_chromium \
  '--test_arg=--filter=disconnect' --nocache_test_results --test_output=all
```

📄 `出力（2026-11-06 に実行。抜粋。ログは scratchpad/el-logs/b-all.log・b-filter.log）`

```
Chromium: |██████████| 1/1 test files | 59 passed, 0 failed, 5 skipped
Firefox:  |██████████| 1/1 test files | 59 passed, 0 failed, 5 skipped
//packages/elements:elements_api        PASSED in 2.4s
//packages/elements:elements_deps       PASSED in 1.0s
//packages/elements/test:test_chromium  PASSED in 2.7s
//packages/elements/test:test_firefox   PASSED in 5.5s
//packages/elements/test:test_lib_deps  PASSED in 1.0s
INFO: Elapsed time: 12.672s

# --test_arg=--filter=disconnect を付けても
Chromium: |██████████| 1/1 test files | 59 passed, 0 failed, 5 skipped
//packages/elements/test:test_chromium  PASSED in 1.4s
```

- 6 つの spec は 1 つのバンドルになって、Web Test Runner の上の Jasmine で Chromium と Firefox の両方で走ります（`test/BUILD.bazel` の `ng_web_test_suite`。[第 8 回](08-elements-tests-issues.md)）。`--test_arg=--filter=disconnect` を付けても 59 件すべて走ったので、**名前の絞り込みは効きません**。全体で 13 秒ほどです。
- 5 skipped は 5 件の `xit` で、そのうち 4 件（`component-factory-strategy_spec.ts` の :254・:272・:284・:347）がこの章の話です（残りの :163 は 3 節の `firstChange` の話。[第 8 回](08-elements-tests-issues.md)）。

### 直すとしたら

- **zoneless の既定で「まとまる」を確かめる it が無い**：spec はどれも `provideZoneChangeDetection()` の `TestBed` で走るので、v22 の既定（zone.js 無し）での「3 回入れて `ngOnChanges` 1 回」は、このページのデモでしか確かめていません。足すなら、`provideZoneChangeDetection()` を外した describe を作り、254・272 行目の `xit` と同じ中身を `it` にする形です（私は走らせていません）。
- **つながるときの変更検知の回数**（[#33059](https://github.com/angular/angular/issues/33059)、開いている）：issue が指している `scheduleDetectChanges` は `0cebfd7462c` で消えています。いまは、つながる前に入れた値を `initializeInputs` が入れ直すと 4 節の通知で tick が予定され、そのあと `initializeComponent` の最後の `detectChanges` でも見ます（[第 4 回](04-elements-connect.md)）。触るなら `component-factory-strategy.ts` の `initializeComponent` と `setInputValue`、spec は 192 行目の describe です。
- **要素をまたいだ合流**（[#33060](https://github.com/angular/angular/issues/33060)、開いている）：zoneless では 4 節のとおり予定はアプリで 1 つです。zone のアプリで zone の外から入れる場合は、要素ごと・代入ごとに `ngZone.run` が走るので、issue の状況が残っています。
- このあたりの issue と修正の一覧は [第 8 回](08-elements-tests-issues.md)の表にあります。本家に PR を出すことは勧めません。手元で it を書いて、今の挙動を確かめるところまでにしておきます。

### 本番ビルドで確かめた結果

ヘッドレスの Chrome（HeadlessChrome/155.0.8043.0）で本番ビルドのこのページを開き、playwright-core で 6 節のデモを操作しました。「要素を作ってつなぐ」では、押してから 1 ms 以内に constructor と DOM の書き換え（中身は空、MutationRecord 3 件）が出て、ngOnChanges は 0 回でした。「同じ値 "A" を 2 回」を初めて押すと、2 回の代入の読み返しはどちらも "A"、15.4 ms 後に ngOnChanges（undefined → "A"、firstChange: true）と DOM の書き換え（中身「A」）が 1 回ずつで、もう一度押すと代入の 2 行だけでした。「違う値を続けて 3 回」は、14.3 ms 後に ngOnChanges（"A" → "v3"、firstChange: false）と DOM の書き換えが 1 回ずつでした。属性の 2 回は、初めては 15.1 ms 後に 1 回ずつ（"v3" → "C"）、2 回目に押すと代入の 2 行だけでした。@angular/elements の配布物は、最初に「要素を作ってつなぐ」を押したときに別の chunk（4.8 kB）として初めて読み込まれ、ページを開いたときの main と初期の chunk には入っていませんでした（esbuild の stats.json でも、@angular/elements を入力に持つのはその chunk だけ）。「外す」のあと要素は 0 個、コンソールの警告とエラーは 0 件でした（scratchpad/el-b/verify/verify.mjs、2026-11-06）。

## 聞かれそうな質問

**Q. カスタム要素のプロパティに同じ値を入れ直すと、変更検知は走りますか？**

走りません。`ComponentRef.setInput` の 619〜623 行目で、前回 `setInput` した値と `Object.is` で同じなら何もせずに戻ります。ビューが dirty にならないので、`setInputValue` の 182 行目の `isViewDirty` も false で、`markForRefresh` も通知も呼ばれません。ただし、比べる相手は「直前に setInput した値」で、オブジェクトは参照で比べます。中身だけ変えた同じオブジェクトを入れ直しても、何も起きません。

**Q. 続けて 3 回値を入れたら、ngOnChanges は何回呼ばれますか？**

zone.js の無い v22 の既定では 1 回で、中身は最後の値です。`ngOnChangesSetInput` は 113 行目で `current` の欄を上書きするだけで、`ngOnChanges` を呼ぶのは tick の中のフック（93 行目）です。tick の予定はアプリで 1 つなので（4 節）、3 回の代入は 1 回の tick にまとまります。`provideZoneChangeDetection()` のアプリで zone の外から入れると、`runInZone`（246 行目）の `ngZone.run` を抜けるたびに tick が走るので 3 回です（spec の 247〜249 行目のコメント）。

**Q. 値を入れた直後に el.value を読むと、古い値ですか？**

新しい値です。`getInputValue` は 164 行目で `componentRef.instance[property]` を返し、フィールドは `ngOnChangesSetInput` の 119 行目（`ngOnChanges` が無ければ `applyValueToInputField`）で代入の場で書き換わっています。まだ書き換わっていないのは画面（テンプレート）と、`ngOnChanges` の呼び出しです。

**Q. v22 で OnPush が既定になって、カスタム要素の入力の更新は壊れませんか？**

壊れません。`setInput` の 630 行目が、コンポーネントのビューそのものを `markViewDirty` するので、OnPush のビューでも次の tick で更新されます。さらに elements は 187 行目で `markForRefresh` し、変更検知の途中で入れられても同じ tick で見直させます。spec の `TestComponent` に `Eager` が足されたのは、`ngDoCheck` で数える回数を前と同じにするためです（381 行目）。

**Q. NotificationSource.CustomElement の通知は何のためにあるのですか？**

`setInput` がすでに `SetInput` を通知しているので、ふつうは足すものがありません。zoneless\_scheduling\_impl.ts の 165〜167 行目のコメントも「実際には何も足さない」と書いています。`ViewTreeTraversal` を立てるのは、変更検知の最中に入れられても要素を見直すためで、`component-factory-strategy.ts` の 189〜190 行目のコメントは「スケジューラがほかの理由で止められていても tick を予定させる」と書いています。

## 読み終えて

- `setInputValue` は、つながる前は `Map` に置くだけ、つながったあとは `ComponentRef.setInput` に渡すだけです。比べる・ためる・予定を立てるは core がします。
- 同じ値は `Object.is` で弾かれ、ビューは dirty にならず、何も起きません。
- `ngOnChanges` の記録は `__ngSimpleChanges__` の箱の `current` の上書きで、tick の中で 1 回だけ呼ばれます。
- v22 の既定では予定はアプリで 1 つの `ChangeDetectionSchedulerImpl` が立て、`runInZone` は何もしない包みです。zone のアプリで zone の外から入れると、代入ごとに tick が走ります。

---

← 前: [要素がつながるとき：ComponentNgElementStrategy.connect と投影](04-elements-connect.md)  
次: [出力とイベント：CustomEvent になるまで](06-elements-outputs.md) →
