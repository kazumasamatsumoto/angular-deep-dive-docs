[目次](../README.md) › [core の説明文の読み残し](README.md) › 第 7 回 / 全 10 回

# ライフサイクルの説明文：OnChanges・DoCheck・AfterView・ChangeDetectorRef

> change\_detection/lifecycle\_hooks.ts・simple\_change.ts・change\_detector\_ref.ts・constants.ts の未読の行：各フックの呼ばれる時と例（OnPush の子の ngDoCheck・ngAfterViewChecked）、SimpleChange の previousValue と firstChange、markForCheck・detach・detectChanges・reattach の約束、既定が OnPush になったことと公開 API から消えた checkNoChanges。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crd-lifecycle)

---

この章で分かること：ライフサイクルのフック（`OnChanges`・`OnInit`・`DoCheck`・`AfterContent*`・`AfterView*`・`OnDestroy`）、`SimpleChange`、`ChangeDetectorRef` の説明文が「いつ呼ばれる」「何をする」と約束していることを、呼ばれた順を書き留める小さな親子のコンポーネントで確かめます。結果として、`ChangeDetectorRef` の「既定は CheckAlways」（v22 から既定は OnPush）、`ngAfterViewChecked` の「ビューを確かめ終えたあと」（確かめていない回にも呼ばれる）、`SimpleChange` の「最初に代入された値か」（入力ごとではない）の 3 つが実物と合いませんでした。

読む対象は `packages/core/src/change_detection/` の `lifecycle_hooks.ts`・`simple_change.ts`・`change_detector_ref.ts`・`constants.ts` と、説明文が指す `packages/examples/core/ts/change_detect/change-detection.ts`（../angular、8576f161ae4）です。フックが `TView` のどの配列に積まれ、`refreshView` のどこで呼ばれるかは[フックは TView の数列の章](../ivy/13-ivy-hooks.md)と[refreshView の全ステップの章](../cd/03-cd-refresh-view.md)、OnPush と `markForCheck` の実装は[OnPush と markForCheck の章](../cd/04-cd-onpush-markforcheck.md)、`checkNoChanges` は[checkNoChanges の章](../cd/07-cd-check-no-changes.md)にあるので、ここでは行だけ指します。

1. [1. @Directive](01-crd-directive.md)
2. [2. @Component](02-crd-component.md)
3. [3. クエリと @NgModule](03-crd-query-module.md)
4. [4. @Injectable・InjectionToken](04-crd-injectable-token.md)
5. [5. Provider の形](05-crd-provider.md)
6. [6. inject と Injector](06-crd-inject.md)
7. **7. ライフサイクル**（この章）
8. [8. differ](08-crd-differs.md)
9. [9. スケジューラー](09-crd-scheduling.md)
10. [10. spec と issue](10-crd-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> デモの組み立て：親（`Eager`）のテンプレートに子（`OnPush`）を 1 つ置き、子には投影する中身（`<b>`）と、子のテンプレートの中の要素に付けるディレクティブ（`[crdLcDir]`、自分のビューを持たない）、子の `providers` のサービス、親のテンプレートの pipe があります。どれもフックが呼ばれるたびに名前を 1 つの配列に足し、`detectChanges` を 1 回呼ぶごとにその配列を読みます。

> **🧪 DEMO 1 — フックが呼ばれた順**
>
> 押すと、このページ（本番ビルド）で親を `createComponent` で作り（文書に付けない div の上。`ApplicationRef` には付けません）、`ChangeDetectorRef.detectChanges` を 1 回ずつ呼びながら、呼ばれたフックを順に書きます。最後に destroy します。下の 1〜8 節は、この表の行を指して説明します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-lifecycle)

## 1. OnChanges：signal の入力も入る

📄 `angular/packages/core/src/change_detection/lifecycle_hooks.ts` L10–47 （▶ の行: 12–13, 23–24, 29–30, 40–43）

````ts
10 │ /**
11 │  * @description
12 ▶  * A lifecycle hook that is called when the value of one or more component or directive inputs
13 ▶  * change. This includes both signal-based and decorator-based inputs.
14 │  * Define an `ngOnChanges()` method to handle the changes.
15 │  *
16 │  * @see {@link DoCheck}
17 │  * @see {@link OnInit}
18 │  * @see [Lifecycle hooks guide](guide/components/lifecycle)
19 │  *
20 │  * @usageNotes
21 │  * The following snippet shows how a component can implement this interface to
22 │  * define an on-changes handler for an input property. While you should prefer
23 ▶  * `computed` and `effect` when working with signal-based inputs, the `ngOnChanges`
24 ▶  * method does include value changes for signal-based inputs.
25 │  *
26 │  * ```ts
27 │  * @Component({ ... })
28 │  * export class UserProfile implements OnChanges {
29 ▶  *   userId = input<number>(0);
30 ▶  *   ngOnChanges(changes: SimpleChanges<UserProfile>) {
31 │  *     // changes.userId contains the old and new value.
32 │  *   }
33 │  * }
34 │  * ```
35 │  *
36 │  * @publicApi
37 │  */
38 │ export interface OnChanges {
39 │   /**
40 ▶    * A callback method that is invoked immediately after the
41 ▶    * default change detector has checked data-bound properties
42 ▶    * if at least one has changed, and before the view and content
43 ▶    * children are checked.
44 │    * @param changes The changed properties.
45 │    */
46 │   ngOnChanges(changes: SimpleChanges): void;
47 │ }
````

12〜13 行目「デコレーターの入力も signal の入力も」と 23〜24 行目は、871fa1b2ddf（2026-01-12、`docs: update OnChanges API reference w/ signal input`）で足された文です。DEMO 1 の 1 回目は `Child.ngOnChanges(value, sig)` で、`@Input() value` と `input(0)` の `sig` が 1 回の呼び出しにまとまりました。`s = 20` にした回は `ngOnChanges(sig)` だけです。40〜43 行目「データの束縛を確かめた直後、少なくとも 1 つ変わっていれば、ビューと中身の子を確かめる前」も表のとおりで、どの回も `ngOnChanges` が子のフックの先頭です。何も変えない 2 回目は呼ばれません。

27〜33 行目の例（`@Component({ ... })` を `template: ''` にしただけ）は strict の ngc に通り、`changes.userId?.currentValue` の型は `number | undefined` でした。`SimpleChanges<UserProfile>` は signal の入力の型から中身の型を取り出します（simple\_change.ts の 48〜49 行目、3 節）。

## 2. OnInit と DoCheck：OnPush でも DoCheck は呼ばれる

📄 `angular/packages/core/src/change_detection/lifecycle_hooks.ts` L49–75 （▶ の行: 51–52, 68–72）

```ts
49 │ /**
50 │  * @description
51 ▶  * A lifecycle hook that is called after Angular has initialized
52 ▶  * all data-bound properties of a directive.
53 │  * Define an `ngOnInit()` method to handle any additional initialization tasks.
54 │  *
55 │  * @see {@link AfterContentInit}
56 │  * @see [Lifecycle hooks guide](guide/components/lifecycle)
57 │  *
58 │  * @usageNotes
59 │  * The following snippet shows how a component can implement this interface to
60 │  * define its own initialization method.
61 │  *
62 │  * {@example core/ts/metadata/lifecycle_hooks_spec.ts region='OnInit'}
63 │  *
64 │  * @publicApi
65 │  */
66 │ export interface OnInit {
67 │   /**
68 ▶    * A callback method that is invoked immediately after the
69 ▶    * default change detector has checked the directive's
70 ▶    * data-bound properties for the first time,
71 ▶    * and before any of the view or content children have been checked.
72 ▶    * It is invoked only once when the directive is instantiated.
73 │    */
74 │   ngOnInit(): void;
75 │ }
```

📄 `angular/packages/core/src/change_detection/lifecycle_hooks.ts` L77–116 （▶ の行: 80–82, 89–93, 108–110）

```ts
 77 │ /**
 78 │  * A lifecycle hook that invokes a custom change-detection function for a directive,
 79 │  * in addition to the check performed by the default change-detector on the input
 80 ▶  * bindings for this directive usage in the parent template. Note that this hook is
 81 ▶  * invoked even when the directive's own change detection is skipped (e.g., with
 82 ▶  * the `OnPush` change detection strategy). Developers might use this hook to
 83 │  * implement a custom change detection strategy for some of the inputs.
 84 │  *
 85 │  * The default change-detection algorithm looks for differences by comparing
 86 │  * bound-property values by reference across change detection runs. You can use this
 87 │  * hook to check for and respond to changes by some other means.
 88 │  *
 89 ▶  * When the default change detector detects changes to the directive's input bindings,
 90 ▶  * it invokes `ngOnChanges()` if supplied, regardless of whether you perform
 91 ▶  * additional change detection.
 92 ▶  * Typically, you should not use both `DoCheck` and `OnChanges` to respond to
 93 ▶  * changes on the same input.
 94 │  *
 95 │  * @see {@link OnChanges}
 96 │  * @see [Lifecycle hooks guide](guide/components/lifecycle)
 97 │  *
 98 │  * @usageNotes
 99 │  * The following snippet shows how a component can implement this interface
100 │  * to invoke it own change-detection cycle.
101 │  *
102 │  * {@example core/ts/metadata/lifecycle_hooks_spec.ts region='DoCheck'}
103 │  *
104 │  * @publicApi
105 │  */
106 │ export interface DoCheck {
107 │   /**
108 ▶    * A callback method that performs change-detection, invoked
109 ▶    * after the default change-detector has checked the directive's input
110 ▶    * bindings in the parent template.
111 │    * See `KeyValueDiffers` and `IterableDiffers` for implementing
112 │    * custom change checking for collections.
113 │    *
114 │    */
115 │   ngDoCheck(): void;
116 │ }
```

68〜72 行目のとおり、`ngOnInit` は 1 回目の `ngOnChanges` の直後に 1 回だけで、2 回目以降は出ません。`createComponent` の直後（変更検知の前）はどのフックも呼ばれていません。80〜82 行目「自分の変更検知が飛ばされても（OnPush など）呼ばれる」は ca440551661（2026-05-20、`docs: clarify ngDoCheck invocation behavior with OnPush strategy`）で足された文で、DEMO 1 の 2 回目は子が OnPush で印も無いのに `Child.ngDoCheck` が呼ばれました。DEMO 2 の「OnPush の子の ngDoCheck」でも、親を 3 回 `detectChanges` して `ngDoCheck` は 3 回、表示は変わりませんでした。子の `ngDoCheck` は親のビューの pre-order フック（`TView.preOrderCheckHooks`）として親の `refreshView` の中で呼ばれ、子のビューを確かめるかどうかはそのあとで決まるからです（[refreshView の章](../cd/03-cd-refresh-view.md)の 4 節）。

## 3. 中身（content）とビュー（view）のフック

📄 `angular/packages/core/src/change_detection/lifecycle_hooks.ts` L140–166 （▶ の行: 142–143, 160–163）

```ts
140 │ /**
141 │  * @description
142 ▶  * A lifecycle hook that is called after Angular has fully initialized
143 ▶  * all content of a directive. It will run only once when the projected content is initialized.
144 │  * Define an `ngAfterContentInit()` method to handle any additional initialization tasks.
145 │  *
146 │  * @see {@link OnInit}
147 │  * @see {@link AfterViewInit}
148 │  * @see [Lifecycle hooks guide](guide/components/lifecycle)
149 │  *
150 │  * @usageNotes
151 │  * The following snippet shows how a component can implement this interface to
152 │  * define its own content initialization method.
153 │  *
154 │  * {@example core/ts/metadata/lifecycle_hooks_spec.ts region='AfterContentInit'}
155 │  *
156 │  * @publicApi
157 │  */
158 │ export interface AfterContentInit {
159 │   /**
160 ▶    * A callback method that is invoked immediately after
161 ▶    * Angular has completed initialization of all of the directive's
162 ▶    * content.
163 ▶    * It is invoked only once when the directive is instantiated.
164 │    */
165 │   ngAfterContentInit(): void;
166 │ }
```

📄 `angular/packages/core/src/change_detection/lifecycle_hooks.ts` L168–192 （▶ の行: 170–172）

```ts
168 │ /**
169 │  * @description
170 ▶  * A lifecycle hook that is called after the default change detector has
171 ▶  * completed checking all content of a directive. It will run after the content
172 ▶  * has been checked and most of the time it's during a change detection cycle.
173 │  *
174 │  * @see {@link AfterViewChecked}
175 │  * @see [Lifecycle hooks guide](guide/components/lifecycle)
176 │  *
177 │  * @usageNotes
178 │  * The following snippet shows how a component can implement this interface to
179 │  * define its own after-check functionality.
180 │  *
181 │  * {@example core/ts/metadata/lifecycle_hooks_spec.ts region='AfterContentChecked'}
182 │  *
183 │  * @publicApi
184 │  */
185 │ export interface AfterContentChecked {
186 │   /**
187 │    * A callback method that is invoked immediately after the
188 │    * default change detector has completed checking all of the directive's
189 │    * content.
190 │    */
191 │   ngAfterContentChecked(): void;
192 │ }
```

📄 `angular/packages/core/src/change_detection/lifecycle_hooks.ts` L194–220 （▶ の行: 196–197, 214–216）

```ts
194 │ /**
195 │  * @description
196 ▶  * A lifecycle hook that is called after Angular has fully initialized
197 ▶  * a component's view.
198 │  * Define an `ngAfterViewInit()` method to handle any additional initialization tasks.
199 │  *
200 │  * @see {@link OnInit}
201 │  * @see {@link AfterContentInit}
202 │  * @see [Lifecycle hooks guide](guide/components/lifecycle)
203 │  *
204 │  * @usageNotes
205 │  * The following snippet shows how a component can implement this interface to
206 │  * define its own view initialization method.
207 │  *
208 │  * {@example core/ts/metadata/lifecycle_hooks_spec.ts region='AfterViewInit'}
209 │  *
210 │  * @publicApi
211 │  */
212 │ export interface AfterViewInit {
213 │   /**
214 ▶    * A callback method that is invoked immediately after
215 ▶    * Angular has completed initialization of a component's view.
216 ▶    * It is invoked only once when the view is instantiated.
217 │    *
218 │    */
219 │   ngAfterViewInit(): void;
220 │ }
```

📄 `angular/packages/core/src/change_detection/lifecycle_hooks.ts` L222–245 （▶ の行: 224–225, 240–242）

```ts
222 │ /**
223 │  * @description
224 ▶  * A lifecycle hook that is called after the default change detector has
225 ▶  * completed checking a component's view for changes.
226 │  *
227 │  * @see {@link AfterContentChecked}
228 │  * @see [Lifecycle hooks guide](guide/components/lifecycle)
229 │  *
230 │  * @usageNotes
231 │  * The following snippet shows how a component can implement this interface to
232 │  * define its own after-check functionality.
233 │  *
234 │  * {@example core/ts/metadata/lifecycle_hooks_spec.ts region='AfterViewChecked'}
235 │  *
236 │  * @publicApi
237 │  */
238 │ export interface AfterViewChecked {
239 │   /**
240 ▶    * A callback method that is invoked immediately after the
241 ▶    * default change detector has completed one change-check cycle
242 ▶    * for a component's view.
243 │    */
244 │   ngAfterViewChecked(): void;
245 │ }
```

1 回目の順は `Child.ngAfterContentInit → Child.ngAfterContentChecked → Dir.* → Child.ngAfterViewInit → Child.ngAfterViewChecked → Parent.ngAfterViewInit` で、中身のフックが子のビューより前、ビューのフックは内側（子のテンプレートの `Dir`）から外側（親）の順でした。`*Init` はどれも 1 回目だけです（143・163・216 行目）。

合わないのは 224〜225 行目と 240〜242 行目です。`ngAfterViewChecked` を「変更検知がコンポーネントのビューを確かめ終えたあと」と書きますが、DEMO 1 の 2 回目は子のビューを確かめていないのに `Child.ngAfterViewChecked` が呼ばれました。子のテンプレートの中の `Dir.ngDoCheck` と `Dir.ngAfterViewChecked` が出ていないことと、DEMO 2 の「ngAfterViewChecked +3 回、表示 docheck-view=0」が、子のビューが飛ばされた証拠です。子の `ngAfterViewChecked` は親の `TView.viewCheckHooks` に積まれ、親の `refreshView` の最後に、子のビューを確かめたかどうかに関係なく呼ばれます（[refreshView の章](../cd/03-cd-refresh-view.md)の 8 節）。同じことが `ngAfterContentChecked` にも起きていますが、こちらは 170〜172 行目で「たいていは（most of the time）変更検知の回の中」とぼかしています。224〜225 行目は f1ab3942187（2018-07-02）のころの文で、v22 で OnPush が既定になったあと（5 節）は、印の無い子のビューは確かめない回の方が多くなっています。

もう 1 つ、196〜197 行目と 215 行目は「コンポーネントのビュー」と書きますが、自分のビューを持たないディレクティブ（`Dir`）の `ngAfterViewInit` と `ngAfterViewChecked` も呼ばれました。ディレクティブでは「置かれた要素を含むビューを確かめたあと」です。

## 4. OnDestroy：サービスと pipe も

📄 `angular/packages/core/src/change_detection/lifecycle_hooks.ts` L118–138 （▶ の行: 119–121, 134–135）

```ts
118 │ /**
119 ▶  * A lifecycle hook that is called when a directive, pipe, or service is destroyed.
120 ▶  * Use for any custom cleanup that needs to occur when the
121 ▶  * instance is destroyed.
122 │  * @see [Lifecycle hooks guide](guide/components/lifecycle)
123 │  *
124 │  * @usageNotes
125 │  * The following snippet shows how a component can implement this interface
126 │  * to define its own custom clean-up method.
127 │  *
128 │  * {@example core/ts/metadata/lifecycle_hooks_spec.ts region='OnDestroy'}
129 │  *
130 │  * @publicApi
131 │  */
132 │ export interface OnDestroy {
133 │   /**
134 ▶    * A callback method that performs custom clean-up, invoked immediately
135 ▶    * before a directive, pipe, or service instance is destroyed.
136 │    */
137 │   ngOnDestroy(): void;
138 │ }
```

119 行目「ディレクティブ、pipe、サービスが壊されるとき」のとおり、destroy では `Dir.ngOnDestroy → Svc.ngOnDestroy → Child.ngOnDestroy → Pipe.ngOnDestroy` の 4 つが呼ばれました。子の `providers` のサービスが子自身より先です。要素の注入器のサービスの `ngOnDestroy` は `TView.destroyHooks` に積まれます（[DestroyRef と破棄の章](../di/14-di-destroy.md)の 6 節）。説明文は順を約束していません。

> [!WARNING]
> **ハマりどころ**
>
> 「サービスが壊されるとき」に当たらない場合があります。コンポーネントの `providers` に `{provide: X, useClass: S}` と `{provide: Y, useFactory: () => new S()}` を並べて destroy すると、呼ばれたのは `useClass` の 1 つだけでした（DEMO 2 の「useFactory のサービスの ngOnDestroy」）。要素の注入器の provider の `ngOnDestroy` は、型の provider と `useClass` のときだけ、コンパイルされたクラスの prototype から `TView.destroyHooks` に積まれるからです（render3/di\_setup.ts L260〜269、[DestroyRef と破棄の章](../di/14-di-destroy.md)の 6 節）。環境の注入器（`R3Injector`）は作った値が `ngOnDestroy` を持っていれば積むので、`useFactory` でも呼ばれます。これは開いている issue #28738（ngOnDestroy not called for injectables created via factory providers provided at component level、2019-02-14）のとおりで、22.2.6 でも再現しました。

## 5. SimpleChange：previousValue と firstChange

📄 `angular/packages/core/src/change_detection/simple_change.ts` L11–32 （▶ の行: 20, 22–24, 27, 29–30）

```ts
11 │ /**
12 │  * Represents a basic change from a previous to a new value for a single
13 │  * property on a directive instance. Passed as a value in a
14 │  * {@link SimpleChanges} object to the `ngOnChanges` hook.
15 │  *
16 │  * @see {@link OnChanges}
17 │  *
18 │  * @publicApi
19 │  */
20 ▶ export class SimpleChange<T = any> {
21 │   constructor(
22 ▶     public previousValue: T,
23 ▶     public currentValue: T,
24 ▶     public firstChange: boolean,
25 │   ) {}
26 │   /**
27 ▶    * Check whether the new value is the first value assigned.
28 │    */
29 ▶   isFirstChange(): boolean {
30 ▶     return this.firstChange;
31 │   }
32 │ }
```

📄 `angular/packages/core/src/change_detection/simple_change.ts` L34–54 （▶ の行: 37–38, 46, 48–49, 53）

```ts
34 │ /**
35 │  * A hashtable of changes represented by {@link SimpleChange} objects stored
36 │  * at the declared property name they belong to on a Directive or Component. This is
37 ▶  * the type passed to the `ngOnChanges` hook. Pass the current class or `this` as the
38 ▶  * first generic argument for stronger type checking (e.g. `SimpleChanges<YourComponent>`).
39 │  *
40 │  * @see {@link OnChanges}
41 │  *
42 │  * @see [Inspecting changes](guide/components/lifecycle#inspecting-changes)
43 │  *
44 │  * @publicApi
45 │  */
46 ▶ export type SimpleChanges<T = unknown> = T extends object
47 │   ? {
48 ▶       [Key in keyof T]?: SimpleChange<
49 ▶         T[Key] extends {[ɵINPUT_SIGNAL_BRAND_READ_TYPE]: infer V} ? V : T[Key]
50 │       >;
51 │     }
52 │   : {
53 ▶       [propName: string]: SimpleChange; // Backwards-compatible signature.
54 │     };
```

DEMO 1 の最後の行のとおり、1 回目は `value: undefined→1 first=true isFirstChange()=true`、2 回目は `value: 1→2 first=false` でした。`isFirstChange()` は 29〜30 行目で `firstChange` を返すだけです。22 行目の `previousValue: T` は、1 回目には `undefined` が入ります。`ngOnChangesSetInput` が `previousChange && previousChange.currentValue` で作るからです（render3/features/ng\_onchanges\_feature.ts L113〜117、[custom element の入力の章](../elements/05-elements-inputs-cd.md)の 3 節）。型に `undefined` が入っていないことは、開いている issue #67516（previousValue for SimpleChange might be undefined、2026-03-09）が指摘しています。

27 行目「新しい値が最初に代入された値か」は、入力ごとではありません。`firstChange` は「このインスタンスの `ngOnChanges` がまだ 1 回も呼ばれていないか」（同じファイルの L116、`previous === EMPTY_OBJ`）です。DEMO 2 の「firstChange は入力ごとか」で、`setInput('a', 1)` のあと初めて `setInput('b', 2)` すると、`b` は初めての値なのに `firstChange=false` でした。テンプレートで束縛した入力は 1 回目に全部そろって入るので、ふつうは表に出ません。`setInput` と custom element で出ます（Angular Elements の spec の `xit` がこれを待っています。[elements の spec と issue の章](../elements/08-elements-tests-issues.md)）。

## 6. ChangeDetectorRef：markForCheck・detach・detectChanges・reattach

📄 `angular/packages/core/src/change_detection/change_detector_ref.ts` L18–57 （▶ の行: 20–22, 33–35, 37, 44–45, 47, 53–55, 57）

```ts
18 │ /**
19 │  * Base class that provides change detection functionality.
20 ▶  * A change-detection tree collects all views that are to be checked for changes.
21 ▶  * Use the methods to add and remove views from the tree, initiate change-detection,
22 ▶  * and explicitly mark views as _dirty_, meaning that they have changed and need to be re-rendered.
23 │  *
24 │  * @see [Using change detection hooks](guide/components/lifecycle)
25 │  *
26 │  * @usageNotes
27 │  *
28 │  * The following examples demonstrate how to modify default change-detection behavior
29 │  * to perform explicit detection when needed.
30 │  *
31 │  * ### Use `markForCheck()` with `CheckOnce` strategy
32 │  *
33 ▶  * The following example sets the `OnPush` change-detection strategy for a component
34 ▶  * (`CheckOnce`, rather than the default `CheckAlways`), then forces a second check
35 ▶  * after an interval.
36 │  *
37 ▶  * {@example core/ts/change_detect/change-detection.ts region='mark-for-check'}
38 │  *
39 │  * ### Detach change detector to limit how often check occurs
40 │  *
41 │  * The following example defines a component with a large list of read-only data
42 │  * that is expected to change constantly, many times per second.
43 │  * To improve performance, we want to check and update the list
44 ▶  * less often than the changes actually occur. To do that, we detach
45 ▶  * the component's change detector and perform an explicit local check every five seconds.
46 │  *
47 ▶  * {@example core/ts/change_detect/change-detection.ts region='detach'}
48 │  *
49 │  *
50 │  * ### Reattaching a detached component
51 │  *
52 │  * The following example creates a component displaying live data.
53 ▶  * The component detaches its change detector from the main change detector tree
54 ▶  * when the `live` property is set to false, and reattaches it when the property
55 ▶  * becomes true.
56 │  *
57 ▶  * {@example core/ts/change_detect/change-detection.ts region='reattach'}
```

📄 `angular/packages/core/src/change_detection/change_detector_ref.ts` L61–88 （▶ の行: 61, 63–65, 67–69, 77–78, 81–82）

```ts
61 ▶ export abstract class ChangeDetectorRef {
62 │   /**
63 ▶    * When a view uses the {@link ChangeDetectionStrategy#OnPush} (checkOnce)
64 ▶    * change detection strategy, explicitly marks the view as changed so that
65 ▶    * it can be checked again.
66 │    *
67 ▶    * Components are normally marked as dirty (in need of rerendering) when inputs
68 ▶    * have changed or events have fired in the view. Call this method to ensure that
69 ▶    * a component is checked even if these triggers have not occurred.
70 │    *
71 │    * <!-- TODO: Add a link to a chapter on OnPush components -->
72 │    *
73 │    */
74 │   abstract markForCheck(): void;
75 │ 
76 │   /**
77 ▶    * Detaches this view from the change-detection tree.
78 ▶    * A detached view is  not checked until it is reattached.
79 │    * Use in combination with `detectChanges()` to implement local change detection checks.
80 │    *
81 ▶    * Detached views are not checked during change detection runs until they are
82 ▶    * re-attached, even if they are marked as dirty.
83 │    *
84 │    * <!-- TODO: Add a link to a chapter on detach/reattach/local digest -->
85 │    * <!-- TODO: Add a live demo once ref.detectChanges is merged into master -->
86 │    *
87 │    */
88 │   abstract detach(): void;
```

📄 `angular/packages/core/src/change_detection/change_detector_ref.ts` L89–108 （▶ の行: 91–92, 101–102, 108）

```ts
 89 │ 
 90 │   /**
 91 ▶    * Checks this view and its children. Use in combination with {@link ChangeDetectorRef#detach}
 92 ▶    * to implement local change detection checks.
 93 │    *
 94 │    * <!-- TODO: Add a link to a chapter on detach/reattach/local digest -->
 95 │    * <!-- TODO: Add a live demo once ref.detectChanges is merged into master -->
 96 │    *
 97 │    */
 98 │   abstract detectChanges(): void;
 99 │ 
100 │   /**
101 ▶    * Re-attaches the previously detached view to the change detection tree.
102 ▶    * Views are attached to the tree by default.
103 │    *
104 │    * <!-- TODO: Add a link to a chapter on detach/reattach/local digest -->
105 │    *
106 │    */
107 │   abstract reattach(): void;
108 ▶ 
```

DEMO 2 の 1 つ目の表で、63〜69 行目・77〜82 行目・91〜92 行目・101〜102 行目は全部そのとおりでした。OnPush の子のフィールドを変えただけでは親を `detectChanges` しても `onpush=0`、`markForCheck` のあとは `onpush=1`。`detach` した Eager の子は、フィールドを変えても、`markForCheck` しても、テンプレートが読む signal を変えても親からは確かめられず、子の `detectChanges` で `eager=1 sig=1`、`reattach` のあと親から `eager=2` でした。signal の行は説明文に無いことです。signal が変わると子のビューに印が付きますが（[Targeted モードの章](../cd/06-cd-targeted-traversal.md)）、外したビューは印があっても降りません（81〜82 行目と同じ理由）。

合わないのは 33〜34 行目です。「OnPush（`CheckOnce`）を、既定の `CheckAlways` の代わりに設定する」と書きますが、eae8f7e30b9（2026-03-16、`feat(core): Set default Component changeDetection strategy to OnPush`、BREAKING CHANGE）から、`changeDetection` を書かないコンポーネントは OnPush です。DEMO 2 で `changeDetection` を書かない子のフィールドを変えても `default=0` のままでした。説明文が指す例（下の 3 つ）のうち 2 つ目と 3 つ目の `GiantList` と `LiveData` も `changeDetection` を書いていないので、今は OnPush です（そのままでも動きます。`detach` した上で自分で `detectChanges` するか、signal を読むので）。新しい本家（origin/main の d201dd76ef2、2026-11-19）でも 33〜34 行目は同じ文です。

📄 `angular/packages/core/src/change_detection/constants.ts` L9–17 （▶ の行: 10–11）

```ts
 9 │ /**
10 ▶  * The strategy that the default change detector uses to detect changes.
11 ▶  * When set, takes effect the next time change detection is triggered.
12 │  *
13 │  * @see {@link /api/core/ChangeDetectorRef?tab=usage-notes Change detection usage}
14 │  * @see {@link /best-practices/skipping-subtrees Skipping component subtrees}
15 │  *
16 │  * @publicApi
17 │  */
```

`ChangeDetectionStrategy` の各値の説明（同じファイルの L19〜43）は[Ivy の概観の章](../ivy/02-ivy-overview.md)が引いています。L25 に「NOTE: OnPush is enabled by default.」があり、L37〜42 の `Default` は deprecated で `Eager` と同じ値（1）です。L20〜21 の「`Default`（`CheckAlways`）に戻すまで自動の検知を止める」は、`Default` が deprecated になったあとも直っていません。L23「子のディレクティブにも効き、上書きできない」は、OnPush の親の中の Eager の子でフィールドを変えても表示が変わらなかったことと合います。同じ子の signal を変えると子だけ描き直されました（`eager=5 sig=5`）。これは説明文に無いことです。

## 7. 説明文の 3 つの例

📄 `angular/packages/examples/core/ts/change_detect/change-detection.ts` L18–35 （▶ の行: 22, 27, 31）

```ts
18 │ // #docregion mark-for-check
19 │ @Component({
20 │   selector: 'app-root',
21 │   template: `Number of ticks: {{ numberOfTicks }}`,
22 ▶   changeDetection: ChangeDetectionStrategy.OnPush,
23 │ })
24 │ class AppComponent {
25 │   numberOfTicks = 0;
26 │ 
27 ▶   constructor(private ref: ChangeDetectorRef) {
28 │     setInterval(() => {
29 │       this.numberOfTicks++;
30 │       // require view to be updated
31 ▶       this.ref.markForCheck();
32 │     }, 1000);
33 │   }
34 │ }
35 │ // #enddocregion mark-for-check
```
*37 行目が指す例（packages/examples/core/ts/change\_detect/change-detection.ts）*

📄 `angular/packages/examples/core/ts/change_detect/change-detection.ts` L37–72 （▶ の行: 45, 58–60）

```ts
37 │ // #docregion detach
38 │ class DataListProvider {
39 │   // in a real application the returned data will be different every time
40 │   get data() {
41 │     return [1, 2, 3, 4, 5];
42 │   }
43 │ }
44 │ 
45 ▶ @Component({
46 │   selector: 'giant-list',
47 │   template: ` <ul>
48 │     @for (d of dataProvider.data; track $index) {
49 │       <li>Item {{ d }}</li>
50 │     }
51 │   </ul>`,
52 │ })
53 │ class GiantList {
54 │   constructor(
55 │     private ref: ChangeDetectorRef,
56 │     public dataProvider: DataListProvider,
57 │   ) {
58 ▶     ref.detach();
59 ▶     setInterval(() => {
60 ▶       this.ref.detectChanges();
61 │     }, 5000);
62 │   }
63 │ }
64 │ 
65 │ @Component({
66 │   selector: 'app',
67 │   providers: [DataListProvider],
68 │   imports: [GiantList],
69 │   template: `<giant-list />`,
70 │ })
71 │ class App {}
72 │ // #enddocregion detach
```
*47 行目が指す例*

📄 `angular/packages/examples/core/ts/change_detect/change-detection.ts` L74–103 （▶ の行: 76, 86, 89, 94–96, 98）

```ts
 74 │ // #docregion reattach
 75 │ class DataProvider {
 76 ▶   data = signal(1);
 77 │   constructor() {
 78 │     setInterval(() => {
 79 │       this.data.set(2);
 80 │     }, 500);
 81 │   }
 82 │ }
 83 │ 
 84 │ @Component({
 85 │   selector: 'live-data',
 86 ▶   template: 'Data: {{dataProvider.data()}}',
 87 │ })
 88 │ class LiveData {
 89 ▶   live = input.required<boolean>();
 90 │   constructor(
 91 │     private ref: ChangeDetectorRef,
 92 │     public dataProvider: DataProvider,
 93 │   ) {
 94 ▶     effect(() => {
 95 ▶       if (this.live()) {
 96 ▶         this.ref.reattach();
 97 │       } else {
 98 ▶         this.ref.detach();
 99 │       }
100 │     });
101 │   }
102 │ }
103 │ 
```
*57 行目が指す例*

3 つとも strict の ngc に通りました（L104〜116 の `App1` も含めて、ファイルの全部）。DEMO 2 の表の操作は、この 3 つの例の `markForCheck`・`detach` と `detectChanges`・`reattach` を、`setInterval` の代わりにボタンの 1 回の操作で行ったものです。3 つ目の例は e7608e503f1（2025-05-26、`docs: update API examples to modern angular (#61688)`）で signal と `effect` と `input.required` に書き換えられました。86 行目のテンプレートが signal を読むので、`live` が `true` の間はデータが変わるたびに描き直され、`false` で `detach` すると signal が変わっても止まります（DEMO 2 の「外したまま signal」の行）。

## 8. checkNoChanges は公開 API から消えた

`ChangeDetectorRef` の抽象クラス（61〜108 行目）にはメソッドが 4 つしかありません。`checkNoChanges` は 69fb1614eff（2026-03-05、``refactor(core): remove `checkNoChanges` from the public API.``、BREAKING CHANGE「テストでは `fixture.detectChanges()` を使う」）で消えました。実装の `ViewRef.checkNoChanges`（render3/view\_ref.ts L323〜340、[checkNoChanges の章](../cd/07-cd-check-no-changes.md)）は残っていて、`if (ngDevMode)` の中でだけ働きます。DEMO 2 で型を外して呼ぶと、開発モードの記録では Eager の子の値を変えたあとに「NG0100: ExpressionChangedAfterItHasBeenCheckedError: Expression has changed after it was checked. Previous value: '2'. Current value: '77'.」、OnPush の子（印の無い既定の子）の値を変えたあとは例外なし、本番（このページと記録）ではどちらも例外なし、でした。

> **🧪 DEMO 2 — ChangeDetectorRef・DoCheck・firstChange**
>
> 押すと、このページ（本番ビルド）で小さなコンポーネントを `createComponent` で作り、表の上から順に操作して、そのあとの DOM の文字か結果を「このページ」の列に書きます。「開発モード（記録）」の列は、同じ関数（crd-lifecycle.demo-lc.ts）を Node（domino の上の JIT）で開発モードで実行した記録です。最後の 2 行（checkNoChanges）だけが開発モードと本番で違います。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-lifecycle)

## ここまでの呼び出し

- 👤 `parentRef.changeDetectorRef.detectChanges()`（2 回目、何も変えない）
  - `refreshView(親)` — render3/instructions/change\_detection.ts
    - `preOrderCheckHooks → Child.ngDoCheck` — *子が OnPush でも呼ぶ（lifecycle\_hooks.ts L80〜82）*
    - `contentCheckHooks → Child.ngAfterContentChecked`
    - `detectChangesInChildComponents → 子は OnPush で印なし → 降りない` — *Dir のフックは出ない*
    - `viewCheckHooks → Child.ngAfterViewChecked → Parent.ngAfterViewChecked` — *子のビューを確かめていなくても呼ぶ（L224〜225 と合わない）*

## テストと直し方

| ファイル（packages/core/test/acceptance/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `lifecycle_spec.ts` | `onChanges`（32）› `should call onChanges method after inputs are set in creation and update mode`（96）・`should not call onChanges if props are set directly`（1237） | 1 節。`meta-programming`（1268）の 2 つ（1302・1361）が `firstChange` を見るが、入力ごとかは見ない |
| `lifecycle_spec.ts` | `onInit`（1576）› `should call onInit after inputs are the first time`（1582）、`doCheck`（2286）› `should call ngOnInit before ngDoCheck if creation mode`（2370） | 2 節 |
| `lifecycle_spec.ts` | `hook order`（4612）› `should call all hooks in correct order with view and content`（4821） | 3 節の順 |
| `change_detection_spec.ts` | `OnPush`（417）› `should call doCheck even when OnPush components are not dirty`（454）・`should skip OnPush components in update mode when they are not dirty`（466） | 2 節の 80〜82 行目 |
| `change_detection_spec.ts` | `attach/detach`（1055）› `should not check detached components`（1086）・`should check re-attached components`（1100）・`should call lifecycle hooks on detached components`（1115）・`should check detached component when detectChanges is called`（1128）・`should not check detached component when markDirty is called`（1143） | 6 節 |
| `pipe_spec.ts` | `should call ngOnDestroy on pipes`（530） | 4 節 |
| `providers_spec.ts` | `lifecycles`（75）› `should not invoke ngOnDestroy on multi providers created via useFactory`（495） | 4 節の callout（useFactory では呼ばない、を固める） |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
（絞らない）                              2693 specs, 0 failures, 3 pending
--filter=^onChanges                       Ran 14 of 2693 specs、0 failures
--filter=^doCheck                         Ran 7 of 2693 specs、0 failures
--filter=^hooks order                     Ran 2 of 2693 specs、0 failures
--filter=^hook order                      Ran 3 of 2693 specs、0 failures
--filter=^afterViewInit                   Ran 10 of 2693 specs、0 failures
--filter=^onDestroy                       Ran 11 of 2693 specs、0 failures
--filter=change detection ChangeDetectorRef   Ran 36 of 2693 specs、0 failures
--filter=change detection OnPush          Ran 20 of 2693 specs、0 failures
--filter=providers lifecycles             Ran 12 of 2693 specs、0 failures
--filter=should call ngOnDestroy on pipes Ran 1 of 2693 specs、0 failures
$ pnpm bazel test //packages/examples/core:test --nocache_test_results --test_output=all     "--test_arg=--filter=lifecycle hooks examples"
Ran 8 of 32 specs、0 failures              # 説明文の {@example} の lifecycle_hooks_spec.ts

# 説明文の例（lifecycle_hooks.ts L27〜33）と packages/examples/core/ts/change_detect/change-detection.ts を
# strict の ngc（サイトの @angular/compiler-cli 22.2.6、strictTemplates）にかける
$ ngc -p tsconfig.json
（この 2 つのファイルのエラーは 0）
```

直すとしたら説明文です。change\_detector\_ref.ts の 33〜34 行目は「既定の OnPush のままで」に（例の `changeDetection: ChangeDetectionStrategy.OnPush` は書かなくても同じ）。constants.ts の L20〜21 は「`Eager` に戻すまで」に。lifecycle\_hooks.ts の 224〜225・240〜242 行目は「親のビューの変更検知のたびに呼ばれる。OnPush で自分のビューが飛ばされた回にも呼ばれる」と 80〜82 行目にそろえられます。simple\_change.ts の 27 行目は「このインスタンスの最初の `ngOnChanges` か」に、22 行目の型は `T | undefined` にする案が #67516 です（型を変えるので公開 API の golden も変わります。[公開 API と golden の章](../contrib/08-contrib-public-api.md)）。#28738 の振る舞いを変えるなら render3/di\_setup.ts の `registerDestroyHooksIfSupported` で、`useFactory` の値は作るまで型が分からないので、`R3Injector` と同じく作った値を見て積む形になります。spec は今の振る舞いを固めていて、acceptance/providers\_spec.ts の `lifecycles`（75）› `should not invoke ngOnDestroy on multi providers created via useFactory`（495）が「`useFactory` の multi の provider では呼ばない（`destroyCalls` が 0）」を待っているので、変えるならこの it の期待も変わります。spec は、子のビューを確かめていない回の `ngAfterViewChecked`（change\_detection\_spec.ts の `OnPush` の describe）と、`firstChange` が入力ごとではないこと（lifecycle\_spec.ts の `onChanges`）を固める it がまだ無いので、変えるならそこに足します。

## 聞かれそうな質問

**Q. OnPush の子で、何も変わっていないのに ngDoCheck が呼ばれるのはなぜ？**

子の `ngDoCheck` は親のビューのフックとして、子のビューを確かめるかどうかを決める前に呼ばれるからです。説明文の 80〜82 行目がそのことを書いています。`ngAfterViewChecked` も同じく親から呼ばれるので、説明文（224〜225 行目）と違い、子のビューを飛ばした回にも呼ばれます。

**Q. `changeDetection` を書かないコンポーネントは Eager ですか？**

v22 からは OnPush です（eae8f7e30b9）。constants.ts の L25 は「OnPush is enabled by default」と書きますが、`ChangeDetectorRef` の説明文の 33〜34 行目はまだ「既定の CheckAlways」です。

**Q. 1 回目の `ngOnChanges` の `previousValue` は何ですか？**

`undefined` です。型は `T` ですが、`ngOnChangesSetInput` が前の記録が無いときに `undefined` を入れます（issue #67516）。

**Q. `firstChange` が true なら、その入力に初めて値が入ったと言えますか？**

言えません。インスタンスの最初の `ngOnChanges` かどうかです。2 回目の `ngOnChanges` で初めて入った入力は `firstChange=false` でした（DEMO 2）。

**Q. `detach` したコンポーネントの signal が変わったら描き直されますか？**

描き直されません。signal で子のビューに印が付いても、外したビューには降りません。子の `detectChanges` か `reattach` が要ります（DEMO 2）。

**Q. `ChangeDetectorRef.checkNoChanges` はどこへ行きましたか？**

v22 で公開 API から消えました（69fb1614eff）。`ViewRef` にメソッドは残っていますが、開発モードでしか働かず、テストでは `fixture.detectChanges()` が同じ確かめをします。

## 読み終えて

- フックの順は「子の OnChanges・OnInit・DoCheck → 中身のフック → 内側のビューのフック → 外側のビューのフック」。`*Init` は 1 回だけ。
- OnPush の子の `ngDoCheck`・`ngAfterContentChecked`・`ngAfterViewChecked` は親のフックとして毎回呼ばれ、子のビューを飛ばした回にも出る。
- `SimpleChange` の 1 回目の `previousValue` は `undefined`、`firstChange` はインスタンスで 1 つ。
- v22 では `changeDetection` の既定が OnPush。`ChangeDetectorRef` の説明文の「既定は CheckAlways」は古い。
- `detach` したビューは印があっても signal が変わっても確かめない。`checkNoChanges` は公開 API から消えた。

---

← 前: [inject と Injector の説明文：フラグ・注入の文脈・Injector.create](06-crd-inject.md)  
次: [IterableDiffer と KeyValueDiffer の説明文](08-crd-differs.md) →
