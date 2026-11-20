[目次](../README.md) › [Forms の説明文の読み残し](README.md) › 第 6 回 / 全 10 回

# NgControl と AbstractControlDirective の説明文

> directives/ng\_control.ts・abstract\_control\_directive.ts・ng\_control\_status.ts・form\_interface.ts・control\_value\_accessor.ts の未読の行：ディレクティブから control の状態を読む getter と path、ng-\* のクラスが付く順、Form インターフェース、ControlValueAccessor の説明文の例、v22 で入った「CVA の無いカスタムコントロールに \[formControl\] を付けたとき」の NgControl の道（ngControlCreate・ngControlUpdate・parse のエラー）。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-ng-control)

---

この章で分かること：フォームのディレクティブ（`formControlName`・`ngModel` など）から `valid` や `errors` を読むと、何を返すのか。その説明文（JSDoc、angular.dev の API リファレンスになる文）が約束していることを本物で確かめます。もう 1 つは、`NgControl` の中に v22 で入った「カスタムコントロール（Signal Forms の形の部品）に `[formControl]` を付けたとき」の道で、どの input に何を書くかを 1 行ずつ読みます。

読む対象は `packages/forms/src/directives/` の `abstract_control_directive.ts`・`ng_control.ts`・`ng_control_status.ts`・`form_interface.ts`・`control_value_accessor.ts`・`control_container.ts`・`reactive_validation_error.ts` と `forms.ts` の、これまでの章が引いていない行です（../angular、8576f161ae4）。ディレクティブと control がつながるまでの流れは[setUpControl](../forms/10-forms-setup-control.md)、状態のクラスを付ける仕組みは[状態のクラス](../forms/15-forms-status-classes.md)、`ControlValueAccessor` の 4 つのメソッドは[値のアクセサー](../forms/09-forms-value-accessor.md)で読みました。

1. [1. AbstractControl](01-fmd-abstract-model.md)
2. [2. FormGroup・FormRecord・FormArray](02-fmd-group-array.md)
3. [3. FormControl と FormBuilder](03-fmd-control-builder.md)
4. [4. Validators](04-fmd-validators.md)
5. [5. エラーの文言と小道具](05-fmd-errors.md)
6. **6. NgControl**（この章）
7. [7. リアクティブのディレクティブ](07-fmd-reactive-dirs.md)
8. [8. テンプレート駆動のディレクティブ](08-fmd-template-dirs.md)
9. [9. 値のアクセサー](09-fmd-accessors.md)
10. [10. spec と issue](10-fmd-tests-issues.md)

## 1. 公開の入口：forms.ts が export するディレクティブの親たち

📄 `angular/packages/forms/src/forms.ts` L9–42 （▶ の行: 16–17, 21–22, 24, 27–28, 39）

```ts
 9 │ /**
10 │  * @module
11 │  * @description
12 │  * This module is used for handling user input, by defining and building a `FormGroup` that
13 │  * consists of `FormControl` objects, and mapping them onto the DOM. `FormControl`
14 │  * objects can then be used to read information from the form DOM elements.
15 │  *
16 ▶  * Forms providers are not included in default providers; you must import these providers
17 ▶  * explicitly.
18 │  */
19 │ 
20 │ export {ɵInternalFormsSharedModule} from './directives';
21 ▶ export {AbstractControlDirective} from './directives/abstract_control_directive';
22 ▶ export {AbstractFormGroupDirective} from './directives/abstract_form_group_directive';
23 │ export {CheckboxControlValueAccessor} from './directives/checkbox_value_accessor';
24 ▶ export {ControlContainer} from './directives/control_container';
25 │ export {ControlValueAccessor, NG_VALUE_ACCESSOR} from './directives/control_value_accessor';
26 │ export {COMPOSITION_BUFFER_MODE, DefaultValueAccessor} from './directives/default_value_accessor';
27 ▶ export {Form} from './directives/form_interface';
28 ▶ export {NgControl} from './directives/ng_control';
29 │ export {NgControlStatus, NgControlStatusGroup} from './directives/ng_control_status';
30 │ export {NgForm} from './directives/ng_form';
31 │ export {NgModel} from './directives/ng_model';
32 │ export {NgModelGroup} from './directives/ng_model_group';
33 │ export {ɵNgNoValidate} from './directives/ng_no_validate_directive';
34 │ export {NumberValueAccessor} from './directives/number_value_accessor';
35 │ export {RadioControlValueAccessor} from './directives/radio_control_value_accessor';
36 │ export {RangeValueAccessor} from './directives/range_value_accessor';
37 │ export {FormControlDirective} from './directives/reactive_directives/form_control_directive';
38 │ export {FormControlName} from './directives/reactive_directives/form_control_name';
39 ▶ export {AbstractFormDirective} from './directives/reactive_directives/abstract_form.directive';
40 │ export {FormArrayDirective} from './directives/reactive_directives/form_array_directive';
41 │ export {FormGroupDirective} from './directives/reactive_directives/form_group_directive';
42 │ export {FormArrayName, FormGroupName} from './directives/reactive_directives/form_group_name';
```

9〜18 行目はパッケージの説明で、16〜17 行目は「Forms の provider は既定の provider に入っていないので、明示して import する」です。21・22・24・28・39 行目で `AbstractControlDirective`・`AbstractFormGroupDirective`・`ControlContainer`・`NgControl`・`AbstractFormDirective` の 5 つの基底クラスを、27 行目で `Form` インターフェースを公開しています。どれも利用者がテンプレートに書くものではなく、`inject(NgControl)` で自分の要素のディレクティブを受け取るとき（[値のアクセサー](../forms/09-forms-value-accessor.md)の自作の accessor など）や、型として使うためのものです。

## 2. AbstractControlDirective：getter は control に読みに行くだけ

📄 `angular/packages/forms/src/directives/abstract_control_directive.ts` L22–29 （▶ の行: 24, 26, 28）

```ts
22 │ /**
23 │  * @description
24 ▶  * Base class for control directives.
25 │  *
26 ▶  * This class is only used internally in the `ReactiveFormsModule` and the `FormsModule`.
27 │  *
28 ▶  * @publicApi
29 │  */
```

24 行目は「control のディレクティブの基底クラス」、26 行目は「`ReactiveFormsModule` と `FormsModule` の中でだけ使う」と書きますが、28 行目は `@publicApi` で、1 節の 21 行目で export されています。「中でだけ」は「利用者が継承するためのものではない」という意味で読みます。直後の 37 行目の抽象 getter `control` と 43〜45 行目の `value` は[状態のクラス](../forms/15-forms-status-classes.md)の 5 節で引用しました。

📄 `angular/packages/forms/src/directives/abstract_control_directive.ts` L57–94 （▶ の行: 59–60, 63, 68–69, 73, 78–80, 83, 92）

```ts
57 │   /**
58 │    * @description
59 ▶    * Reports whether the control is invalid, meaning that an error exists in the input value.
60 ▶    * If the control is not present, null is returned.
61 │    */
62 │   get invalid(): boolean | null {
63 ▶     return this.control ? this.control.invalid : null;
64 │   }
65 │ 
66 │   /**
67 │    * @description
68 ▶    * Reports whether a control is pending, meaning that async validation is occurring and
69 ▶    * errors are not yet available for the input value. If the control is not present, null is
70 │    * returned.
71 │    */
72 │   get pending(): boolean | null {
73 ▶     return this.control ? this.control.pending : null;
74 │   }
75 │ 
76 │   /**
77 │    * @description
78 ▶    * Reports whether the control is disabled, meaning that the control is disabled
79 ▶    * in the UI and is exempt from validation checks and excluded from aggregate
80 ▶    * values of ancestor controls. If the control is not present, null is returned.
81 │    */
82 │   get disabled(): boolean | null {
83 ▶     return this.control ? this.control.disabled : null;
84 │   }
85 │ 
86 │   /**
87 │    * @description
88 │    * Reports whether the control is enabled, meaning that the control is included in ancestor
89 │    * calculations of validity or value. If the control is not present, null is returned.
90 │    */
91 │   get enabled(): boolean | null {
92 ▶     return this.control ? this.control.enabled : null;
93 │   }
94 │ 
```

📄 `angular/packages/forms/src/directives/abstract_control_directive.ts` L95–128 （▶ の行: 97, 100, 105–106, 109, 114, 118, 123–124, 127）

```ts
 95 │   /**
 96 │    * @description
 97 ▶    * Reports the control's validation errors. If the control is not present, null is returned.
 98 │    */
 99 │   get errors(): ValidationErrors | null {
100 ▶     return this.control ? this.control.errors : null;
101 │   }
102 │ 
103 │   /**
104 │    * @description
105 ▶    * Reports whether the control is pristine, meaning that the user has not yet changed
106 ▶    * the value in the UI. If the control is not present, null is returned.
107 │    */
108 │   get pristine(): boolean | null {
109 ▶     return this.control ? this.control.pristine : null;
110 │   }
111 │ 
112 │   /**
113 │    * @description
114 ▶    * Reports whether the control is dirty, meaning that the user has changed
115 │    * the value in the UI. If the control is not present, null is returned.
116 │    */
117 │   get dirty(): boolean | null {
118 ▶     return this.control ? this.control.dirty : null;
119 │   }
120 │ 
121 │   /**
122 │    * @description
123 ▶    * Reports whether the control is touched, meaning that the user has triggered
124 ▶    * a `blur` event on it. If the control is not present, null is returned.
125 │    */
126 │   get touched(): boolean | null {
127 ▶     return this.control ? this.control.touched : null;
128 │   }
```

📄 `angular/packages/forms/src/directives/abstract_control_directive.ts` L129–166 （▶ の行: 132–134, 137, 146, 151–152, 155, 161, 165）

```ts
129 │ 
130 │   /**
131 │    * @description
132 ▶    * Reports the validation status of the control. Possible values include:
133 ▶    * 'VALID', 'INVALID', 'DISABLED', and 'PENDING'.
134 ▶    * If the control is not present, null is returned.
135 │    */
136 │   get status(): string | null {
137 ▶     return this.control ? this.control.status : null;
138 │   }
139 │ 
140 │   /**
141 │    * @description
142 │    * Reports whether the control is untouched, meaning that the user has not yet triggered
143 │    * a `blur` event on it. If the control is not present, null is returned.
144 │    */
145 │   get untouched(): boolean | null {
146 ▶     return this.control ? this.control.untouched : null;
147 │   }
148 │ 
149 │   /**
150 │    * @description
151 ▶    * Returns a multicasting observable that emits a validation status whenever it is
152 ▶    * calculated for the control. If the control is not present, null is returned.
153 │    */
154 │   get statusChanges(): Observable<any> | null {
155 ▶     return this.control ? this.control.statusChanges : null;
156 │   }
157 │ 
158 │   /**
159 │    * @description
160 │    * Returns a multicasting observable of value changes for the control that emits every time the
161 ▶    * value of the control changes in the UI or programmatically.
162 │    * If the control is not present, null is returned.
163 │    */
164 │   get valueChanges(): Observable<any> | null {
165 ▶     return this.control ? this.control.valueChanges : null;
166 │   }
```

どの getter も形は同じで、`this.control ? this.control.X : null` です（63・73・83・92・100・109・118・127・137・146・155・165 行目）。説明文の「control が無ければ null を返す」（60・69〜70・80 行目ほか）は、この三項演算子そのものです。値をコピーして持たないので、ディレクティブの `valid` と control の `valid` は、読んだ瞬間にいつも同じ値です。デモでは 6 つのディレクティブの 12 個の getter（72 組）が、`Object.is` で全部一致しました（`value` や `errors` のオブジェクトも同じ参照）。

説明文の言い方で気を付けるのは 3 つです。78〜80 行目の `disabled` は「検証から外れ、親の集計値（`value`）にも入らない」。105〜106 行目の `pristine` と 114〜115 行目の `dirty` は「利用者が UI で値を変えたか」で、`setValue` で値を変えても `dirty` にはなりません（`markAsDirty` を呼べばなる）。123〜124 行目の `touched` は「`blur` イベントを起こしたか」ですが、実際は accessor が `registerOnTouched` で受け取った関数を呼んだときで、`blur` は組み込みの accessor が選んだ合図です（5 節）。132〜134 行目の `status` の 4 つの値は `FormControlStatus` の型と同じですが、137 行目の戻り値の型は `string | null` で、型としては 4 つに絞られていません。

📄 `angular/packages/forms/src/directives/abstract_control_directive.ts` L167–188 （▶ の行: 170–171, 173–174, 181, 187）

```ts
167 │ 
168 │   /**
169 │    * @description
170 ▶    * Returns an array that represents the path from the top-level form to this control.
171 ▶    * Each index is the string name of the control on that level.
172 │    */
173 ▶   get path(): string[] | null {
174 ▶     return null;
175 │   }
176 │ 
177 │   /**
178 │    * Contains the result of merging synchronous validators into a single validator function
179 │    * (combined using `Validators.compose`).
180 │    */
181 ▶   private _composedValidatorFn: ValidatorFn | null | undefined;
182 │ 
183 │   /**
184 │    * Contains the result of merging asynchronous validators into a single validator function
185 │    * (combined using `Validators.composeAsync`).
186 │    */
187 ▶   private _composedAsyncValidatorFn: AsyncValidatorFn | null | undefined;
188 │ 
```

170〜171 行目は「`path` はいちばん上のフォームからこの control までの配列で、各要素はその段の control の**文字列の**名前」、173〜175 行目の本体は `null` を返すだけで、子のクラスが上書きします。デモの `[formControlName]="$index"`（`name` は数の `0`）でも、`path` は `['tags', '0']` と両方とも文字列でした。`FormControlName` の `path` が `this.name.toString()` してから `controlPath` に渡すからです（[第 7 回](07-fmd-reactive-dirs.md)）。説明文のとおりです。181・187 行目の 2 つの private は、`_setValidators` が作る合成済みの検証関数の置き場です（[検証のディレクティブ](../forms/14-forms-validator-directives.md)）。

📄 `angular/packages/forms/src/directives/abstract_control_directive.ts` L228–241 （▶ の行: 234–235, 241）

```ts
228 │ 
229 │   /**
230 │    * @description
231 │    * Asynchronous validator function composed of all the asynchronous validators registered with
232 │    * this directive.
233 │    */
234 ▶   get asyncValidator(): AsyncValidatorFn | null {
235 ▶     return this._composedAsyncValidatorFn || null;
236 │   }
237 │ 
238 │   /*
239 │    * The set of callbacks to be invoked when directive instance is being destroyed.
240 │    */
241 ▶   private _onDestroyCallbacks: (() => void)[] = [];
```

234〜236 行目の `asyncValidator` は、同期の `validator`（[検証のディレクティブ](../forms/14-forms-validator-directives.md)で引用）と対の getter です。241 行目の `_onDestroyCallbacks` は、`setUpControl` が「ディレクティブが壊れたら外す」処理を積む配列です（[setUpControl](../forms/10-forms-setup-control.md)の 6 節）。

📄 `angular/packages/forms/src/directives/abstract_control_directive.ts` L261–302 （▶ の行: 266–267, 282–283, 287, 291–292, 294, 298, 301）

````ts
261 │ 
262 │   /**
263 │    * @description
264 │    * Resets the control with the provided value if the control is present.
265 │    */
266 ▶   reset(value: any = undefined): void {
267 ▶     this.control?.reset(value);
268 │   }
269 │ 
270 │   /**
271 │    * @description
272 │    * Reports whether the control with the given path has the error specified.
273 │    *
274 │    * @param errorCode The code of the error to check
275 │    * @param path A list of control names that designates how to move from the current control
276 │    * to the control that should be queried for errors.
277 │    *
278 │    * @usageNotes
279 │    * For example, for the following `FormGroup`:
280 │    *
281 │    * ```ts
282 ▶    * form = new FormGroup({
283 ▶    *   address: new FormGroup({ street: new FormControl() })
284 │    * });
285 │    * ```
286 │    *
287 ▶    * The path to the 'street' control from the root form would be 'address' -> 'street'.
288 │    *
289 │    * It can be provided to this method in one of two formats:
290 │    *
291 ▶    * 1. An array of string control names, e.g. `['address', 'street']`
292 ▶    * 1. A period-delimited list of control names in one string, e.g. `'address.street'`
293 │    *
294 ▶    * If no path is given, this method checks for the error on the current control.
295 │    *
296 │    * @returns whether the given error is present in the control at the given path.
297 │    *
298 ▶    * If the control is not present, false is returned.
299 │    */
300 │   hasError(errorCode: string, path?: Array<string | number> | string): boolean {
301 ▶     return this.control ? this.control.hasError(errorCode, path) : false;
302 │   }
````

📄 `angular/packages/forms/src/directives/abstract_control_directive.ts` L303–334 （▶ の行: 316–317, 325–326, 328–329, 332）

````ts
303 │ 
304 │   /**
305 │    * @description
306 │    * Reports error data for the control with the given path.
307 │    *
308 │    * @param errorCode The code of the error to check
309 │    * @param path A list of control names that designates how to move from the current control
310 │    * to the control that should be queried for errors.
311 │    *
312 │    * @usageNotes
313 │    * For example, for the following `FormGroup`:
314 │    *
315 │    * ```ts
316 ▶    * form = new FormGroup({
317 ▶    *   address: new FormGroup({ street: new FormControl() })
318 │    * });
319 │    * ```
320 │    *
321 │    * The path to the 'street' control from the root form would be 'address' -> 'street'.
322 │    *
323 │    * It can be provided to this method in one of two formats:
324 │    *
325 ▶    * 1. An array of string control names, e.g. `['address', 'street']`
326 ▶    * 1. A period-delimited list of control names in one string, e.g. `'address.street'`
327 │    *
328 ▶    * @returns error data for that particular error. If the control or error is not present,
329 ▶    * null is returned.
330 │    */
331 │   getError(errorCode: string, path?: Array<string | number> | string): any {
332 ▶     return this.control ? this.control.getError(errorCode, path) : null;
333 │   }
334 │ }
````

266〜268 行目の `reset` は `control?.reset(value)` です。`hasError` の例（282〜292 行目）は「`street` へのパスは `['address', 'street']` でも `'address.street'` でもよい」、294 行目は「パスが無ければ自分の control」、298 行目は「control が無ければ `false`」です。デモで `FormGroupDirective` から `hasError('required', 'address.street')` と `['address', 'street']` を呼ぶと、どちらも同じ結果（値が `'ab'` なので `false`）、`getError('minlength', 'address.street')` は `{"requiredLength":3,"actualLength":2}` でした。パスの解き方そのものは `AbstractControl.get` で、[第 1 回](01-fmd-abstract-model.md)が読みます。332 行目の `getError` は control が無ければ `null` で、328〜329 行目のとおりです。

## 3. ControlContainer と NgControl の説明文

📄 `angular/packages/forms/src/directives/control_container.ts` L9–18 （▶ の行: 14–15）

```ts
 9 │ import {AbstractControlDirective} from './abstract_control_directive';
10 │ import type {Form} from './form_interface';
11 │ 
12 │ /**
13 │  * @description
14 ▶  * A base class for directives that contain multiple registered instances of `NgControl`.
15 ▶  * Only used by the forms module.
16 │  *
17 │  * @publicApi
18 │  */
```

📄 `angular/packages/forms/src/directives/ng_control.ts` L51–83 （▶ の行: 53–54, 58, 65, 71, 77, 79, 81–82）

```ts
51 │ /**
52 │  * @description
53 ▶  * A base class that all `FormControl`-based directives extend. It binds a `FormControl`
54 ▶  * object to a DOM element.
55 │  *
56 │  * @publicApi
57 │  */
58 ▶ export abstract class NgControl extends AbstractControlDirective {
59 │   /**
60 │    * @description
61 │    * The parent form for the control.
62 │    *
63 │    * @internal
64 │    */
65 ▶   _parent: ControlContainer | null = null;
66 │ 
67 │   /**
68 │    * @description
69 │    * The name for the control
70 │    */
71 ▶   name: string | number | null = null;
72 │ 
73 │   /**
74 │    * @description
75 │    * The value accessor for the control
76 │    */
77 ▶   valueAccessor: ControlValueAccessor | null = null;
78 │ 
79 ▶   protected isCustomControlBased = false;
80 │ 
81 ▶   private userOnReset?: (value?: unknown) => void;
82 ▶   private resetSubscription?: Subscription;
83 │ 
```

`ControlContainer` は「複数の `NgControl` を登録して持つディレクティブの基底クラス」（14〜15 行目）で、`formGroupName`・`ngModelGroup`・`[formGroup]`・`ngForm` などが DI でこの名前で自分を出します（[リアクティブのディレクティブ](../forms/12-forms-reactive-directives.md)の 2 節）。`NgControl` の 53〜54 行目は「`FormControl` を元にするディレクティブがみな継承する基底クラスで、`FormControl` を DOM の要素に結ぶ」。58 行目で `AbstractControlDirective` を継承し、65 行目の `_parent`（親の `ControlContainer`）、71 行目の `name`、77 行目の `valueAccessor` を持ちます。79 行目の `isCustomControlBased` と 81〜82 行目の 2 つは、v22 で入ったカスタムコントロールの道（4 節）のためのものです。

📄 `angular/packages/forms/src/directives/ng_control.ts` L84–101 （▶ の行: 85–86, 88, 91–94, 97）

```ts
 84 │   /** @internal */
 85 ▶   set onReset(callback: (value?: unknown) => void) {
 86 ▶     this.userOnReset = callback;
 87 │ 
 88 ▶     this.resetSubscription?.unsubscribe();
 89 │     this.resetSubscription = undefined;
 90 │ 
 91 ▶     if (this.control) {
 92 ▶       this.resetSubscription = this.control.events.subscribe((event) => {
 93 ▶         if (event instanceof FormResetEvent && this.control) {
 94 ▶           this.userOnReset?.(this.control.value);
 95 │         }
 96 │       });
 97 ▶       this.subscription?.add(this.resetSubscription);
 98 │     }
 99 │   }
100 │   private isNativeFormElement = false;
101 │ 
```

📄 `angular/packages/forms/src/directives/ng_control.ts` L34–50 （▶ の行: 36–37, 39, 41–42, 44–45）

```ts
34 │ type ParseError = {readonly kind: string};
35 │ 
36 ▶ export const NG_CONTROL_INTEGRATION_PROVIDER: Provider = {
37 ▶   provide: FORM_CONTROL_INTEGRATION,
38 │   useFactory: () => {
39 ▶     const control = inject(NgControl, {self: true});
40 │     return {
41 ▶       setParseErrors: (source: Signal<ReadonlyArray<ParseError>> | undefined) => {
42 ▶         control.setParseErrorSource(source);
43 │       },
44 ▶       set onReset(callback: (value?: unknown) => void) {
45 ▶         control.onReset = callback;
46 │       },
47 │     };
48 │   },
49 │ };
50 │ 
```

85 行目の `onReset` は `@internal` のセッターで、渡された関数を 86 行目で覚え、91〜96 行目で control の `events` から `FormResetEvent` だけを拾ってその関数を今の値で呼びます。97 行目で購読を 143 行目の `subscription` にまとめ、control が替わったときにまとめて外せるようにします。この関数を渡してくるのは 36〜49 行目の `NG_CONTROL_INTEGRATION_PROVIDER` で、`FORM_CONTROL_INTEGRATION` というトークンに、39 行目で自分の要素の `NgControl` を包んだ小さなオブジェクトを出します。42 行目の `setParseErrorSource`（4 節）と 44〜46 行目の `onReset` の 2 つだけを外に見せる形で、Signal Forms の部品の側から使われます（reset がコントロールまで届く道は[カスタムコントロール](../sfd/04-sfd-custom-control.md)の 5 節）。このプロバイダーは `FormControlName`・`FormControlDirective`・`NgModel` の 3 つの `providers` に入っています（[第 7 回](07-fmd-reactive-dirs.md)・[第 8 回](08-fmd-template-dirs.md)）。

## 4. NgControl の後半：カスタムコントロールに \[formControl\] を付けたとき

ここから先の 230 行あまりは、b2f08574e8f（2026-01-27、`refactor(forms): base implementation of custom control binding in NgControl`）で入りました。`value` の model（input と `valueChange` の output の組）を持つコンポーネント（[カスタムコントロール](../sfd/04-sfd-custom-control.md)の形。以下 FVC）に、`ControlValueAccessor` を書かずに `[formControl]`・`formControlName`・`ngModel` を付けると、この道を通ります。

1. **コンパイラが印を付ける**

   `ɵngControlCreate` を持つ 3 つのディレクティブ（`FormControlDirective`・`FormControlName`・`NgModel`）に `ɵɵControlFeature` が入り、`[formControl]` などを書いた要素に `ɵɵcontrolCreate` と `ɵɵcontrol` の命令が出ます（209〜211 行目）。
2. **作るとき：ngControlCreate**

   CVA が無く、要素に `value` の model を持つ部品がいれば、232〜242 行目で model の変化と `touch` を聞き、`isCustomControlBased` を立てます。
3. **control が来たとき：setupCustomControl**

   `ngOnChanges`（`[formControl]`）か親への登録（`formControlName`）から呼ばれ、186〜187 行目で値と状態の変化を `markForCheck` につなぎます。
4. **描画のたび：ngControlUpdate**

   259〜283 行目で、値・6 つの状態・`required`・`errors` のうち前回と違うものだけを部品の input に書きます。
5. **利用者が触ったとき**

   部品の `value.set` が 234〜236 行目の `setValue`・`markAsDirty`・`ngModelChange` に、`touch.emit()` が 241 行目の `markAsTouched` になります。

📄 `angular/packages/forms/src/directives/ng_control.ts` L112–143 （▶ の行: 115, 119, 124, 129, 134, 136, 141, 143）

```ts
112 │ 
113 │   /**
114 │    * @description
115 ▶    * The callback method to update the model from the view when requested
116 │    *
117 │    * @param newValue The new value for the view
118 │    */
119 ▶   abstract viewToModelUpdate(newValue: any): void;
120 │ 
121 │   /**
122 │    * Validator function that returns current parse errors.
123 │    */
124 ▶   protected parseErrorsValidator: ValidatorFn | null = null;
125 │ 
126 │   /**
127 │    * Renderer for setting native DOM properties. Set by subclass constructor.
128 │    */
129 ▶   private renderer: Renderer2 | undefined;
130 │ 
131 │   /**
132 │    * Injector for creating effects. Set by subclass constructor.
133 │    */
134 ▶   private readonly injector: Injector | undefined;
135 │ 
136 ▶   private requiredValidatorViaDi: RequiredValidator | undefined;
137 │ 
138 │   /**
139 │    * Container for any RxJS subscriptions related to the current control.
140 │    *
141 ▶    * This gets cleaned up and recreated when the control changes.
142 │    */
143 ▶   private subscription: Subscription | undefined;
```

📄 `angular/packages/forms/src/directives/ng_control.ts` L144–174 （▶ の行: 148–149, 157, 161–163, 169–171）

```ts
144 │ 
145 │   /**
146 │    * Tracks last bound values to avoid unnecessary FVC updates.
147 │    */
148 ▶   protected customControlBindings: {
149 ▶     value?: unknown;
150 │     disabled?: boolean;
151 │     touched?: boolean;
152 │     dirty?: boolean;
153 │     valid?: boolean;
154 │     invalid?: boolean;
155 │     pending?: boolean;
156 │     required?: boolean;
157 ▶     errors?: ValidationErrors | null;
158 │   } | null = null;
159 │ 
160 │   constructor(
161 ▶     injector?: Injector,
162 ▶     renderer?: Renderer2,
163 ▶     rawValueAccessors?: ControlValueAccessor[],
164 │   ) {
165 │     super();
166 │     this.injector = injector;
167 │     this.renderer = renderer;
168 │     this.rawValueAccessors = rawValueAccessors;
169 ▶     this.injector?.get(DestroyRef)?.onDestroy(() => {
170 ▶       this.removeParseErrorsValidator(this.control);
171 ▶       this.subscription?.unsubscribe();
172 │     });
173 │   }
174 │ 
```

119 行目の `viewToModelUpdate` は説明文のとおり「view から model を更新する」抽象メソッドで、子のクラスが `ngModelChange` を出す形で実装します（115 行目）。124 行目の `parseErrorsValidator`、129・134 行目の `renderer` と `injector`、136 行目の `requiredValidatorViaDi`、143 行目の `subscription`（141 行目「control が替わるたびに片付けて作り直す」）は、みな FVC の道で使います。148〜158 行目の `customControlBindings` は「最後に書いた値」を覚えて、同じ値を何度も input に書かないための表です。constructor は 161〜163 行目の 3 つを**省略できる**引数で受け、169〜172 行目で、ディレクティブが壊れるときに parse のエラーの検証関数を外して購読を止めます。

📄 `angular/packages/forms/src/directives/ng_control.ts` L175–214 （▶ の行: 176, 178–179, 183, 186–187, 191–192, 201–202, 209–211）

```ts
175 │   protected setupCustomControl(): void {
176 ▶     this.subscription?.unsubscribe();
177 │ 
178 ▶     const cdr = this.injector?.get(ChangeDetectorRef);
179 ▶     if (!this.control || !cdr) {
180 │       return;
181 │     }
182 │ 
183 ▶     const markForCheck = cdr.markForCheck.bind(cdr);
184 │     this.subscription = new Subscription();
185 │ 
186 ▶     this.subscription.add(this.control.valueChanges.subscribe(markForCheck));
187 ▶     this.subscription.add(this.control.statusChanges.subscribe(markForCheck));
188 │ 
189 │     this.resetSubscription?.unsubscribe();
190 │     this.resetSubscription = undefined;
191 ▶     if (this.userOnReset) {
192 ▶       this.resetSubscription = this.control.events.subscribe((event) => {
193 │         if (event instanceof FormResetEvent && this.control) {
194 │           this.userOnReset?.(this.control.value);
195 │         }
196 │       });
197 │       this.subscription.add(this.resetSubscription);
198 │     }
199 │ 
200 │     // Add parseErrors validator if present
201 ▶     if (this.parseErrorsValidator) {
202 ▶       this.control.addValidators(this.parseErrorsValidator);
203 │     }
204 │   }
205 │ 
206 │   /**
207 │    * Internal control directive creation lifecycle hook.
208 │    *
209 ▶    * The presence of this method tells the compiler to install `ɵɵControlFeature`, which will
210 ▶    * cause this directive to be recognized as a control directive by the `ɵcontrolCreate` and
211 ▶    * `ɵcontrol` instructions.
212 │    *
213 │    * @internal
214 │    */
```

`setupCustomControl` は、CVA の道の `setUpControlValueAccessor` の代わりに呼ばれます（どこから呼ぶかは[リアクティブのディレクティブ](../forms/12-forms-reactive-directives.md)の 1 節）。176 行目で前の購読を止め、178 行目で `ChangeDetectorRef` を取り、186〜187 行目で control の `valueChanges` と `statusChanges` のたびに `markForCheck` します。OnPush の部品でも、control の変化で次の描画に入るためです。191〜198 行目は 3 節の `onReset` と同じ購読をここでも張り直し、201〜203 行目で parse のエラーの検証関数を control に足します。209〜211 行目の説明は「このメソッドがあると、コンパイラが `ɵɵControlFeature` を入れ、`ɵcontrolCreate` と `ɵcontrol` の命令がこのディレクティブを control のディレクティブとして扱う」です（コンパイラの側は[\[formField\] の章](../sfd/01-sfd-form-field.md)）。

📄 `angular/packages/forms/src/directives/ng_control.ts` L229–248 （▶ の行: 232, 234–236, 240–241, 244–245, 247）

```ts
229 │     // Listen to custom control value changes -> update FormControl
230 │     // Note: We access this.control dynamically because it may not be set yet
231 │     // (e.g., FormControlDirective's form input hasn't been bound)
232 ▶     host.listenToCustomControlModel((value) => {
233 │       // TODO: is there a case where this input has not yet been set?
234 ▶       this.control?.setValue(value, {emitModelToViewChange: false});
235 ▶       this.control?.markAsDirty();
236 ▶       this.viewToModelUpdate(value);
237 │     });
238 │ 
239 │     // Listen to touched changes from FVC
240 ▶     host.listenToCustomControlOutput('touch', () => {
241 ▶       this.control?.markAsTouched();
242 │     });
243 │ 
244 ▶     this.customControlBindings = {};
245 ▶     this.isNativeFormElement = isNativeFormElement(host.nativeElement);
246 │ 
247 ▶     this.requiredValidatorViaDi = this._rawValidators.find((v) => v instanceof RequiredValidator);
248 │   }
```

`ngControlCreate` の前半（215〜228 行目、[リアクティブのディレクティブ](../forms/12-forms-reactive-directives.md)で引用）が「CVA があるなら何もしない」を決めたあとの部分です。232〜237 行目で FVC の model の変化を聞き、234 行目で `setValue(value, {emitModelToViewChange: false})`（FVC へ書き戻さない）、235 行目で `markAsDirty()`、236 行目で `ngModelChange` を出します。240〜242 行目は FVC の `touch` の output で `markAsTouched()` です。247 行目は、同じ要素に `required` 属性のディレクティブ（`RequiredValidator`）が DI で入っていれば覚えておきます。

> [!WARNING]
> **ハマりどころ**
>
> 234 行目は `control.updateOn` を見ません。`updateOn: 'blur'` の control でも、FVC が値を出した瞬間に `setValue` します。401b4f2011c（2026-09-18、`fix(forms): support updateOn blur and submit for custom FormValueControl`）で、値をいったん pending に置き、`'blur'` なら `touch` で、`'submit'` なら送信で確定する形に直りました。このサイトの依存の 22.2.6 には a7b0e8ef9d6 として入っているので、下のデモ（22.2.6）の 7・8 行目は直った後の動きです：`value.set` のあとも control の値は `'blur の初期値'` のまま、`touch` で初めて入ります。

📄 `angular/packages/forms/src/directives/ng_control.ts` L249–285 （▶ の行: 250–251, 259–261, 265, 270, 273–274, 278–279, 281–282）

```ts
249 │ 
250 ▶   protected ngControlUpdate(host: ControlDirectiveHost, bindRequired: boolean): void {
251 ▶     if (!this.isCustomControlBased) {
252 │       return;
253 │     }
254 │ 
255 │     const control = this.control!;
256 │     const bindings = this.customControlBindings!;
257 │ 
258 │     // Bind FormControl value -> FVC
259 ▶     if (!Object.is(bindings.value, control.value)) {
260 ▶       bindings.value = control.value;
261 ▶       host.setCustomControlModelInput(control.value);
262 │     }
263 │ 
264 │     // Bind all status properties
265 ▶     this.bindControlProperty(host, bindings, 'touched', control.touched);
266 │     this.bindControlProperty(host, bindings, 'dirty', control.dirty);
267 │     this.bindControlProperty(host, bindings, 'valid', control.valid);
268 │     this.bindControlProperty(host, bindings, 'invalid', control.invalid);
269 │     this.bindControlProperty(host, bindings, 'pending', control.pending);
270 ▶     this.bindControlProperty(host, bindings, 'disabled', control.disabled);
271 │ 
272 │     // Binding to `required` may be handled by the host element itself.
273 ▶     if (this.shouldBindRequired) {
274 ▶       this.bindControlProperty(host, bindings, 'required', this.isRequired);
275 │     }
276 │ 
277 │     // Bind errors - convert Reactive Form errors to Signal Form format
278 ▶     const errorObject = control.errors;
279 ▶     if (bindings.errors !== errorObject) {
280 │       bindings.errors = errorObject;
281 ▶       const errorArray = this._convertErrors(errorObject);
282 ▶       host.setInputOnDirectives('errors', errorArray);
283 │     }
284 │   }
285 │ 
```

📄 `angular/packages/forms/src/directives/ng_control.ts` L286–303 （▶ の行: 289, 291–292, 298, 300–301）

```ts
286 │   /**
287 │    * Returns true if the control is currently considered required, false otherwise.
288 │    *
289 ▶    * A control can be required either via `NG_VALIDATORS` including the `RequiredValidator`.
290 │    */
291 ▶   private get isRequired(): boolean {
292 ▶     return (this.requiredValidatorViaDi?._enabled || this.control?._hasRequired()) ?? false;
293 │   }
294 │ 
295 │   /**
296 │    * Whether the control should bind the `required` property (in custom control mode).
297 │    *
298 ▶    * Can be overridden by subclasses that handle `required` in a different way.
299 │    */
300 ▶   protected get shouldBindRequired(): boolean {
301 ▶     return true;
302 │   }
303 │ 
```

`ngControlUpdate` はテンプレートの更新のたびに呼ばれます（`ɵcontrol` 命令から）。251 行目で CVA の道なら何もせず、259〜262 行目で値が前回と違えば FVC の model の input に書きます。265〜270 行目で `touched`・`dirty`・`valid`・`invalid`・`pending`・`disabled` の 6 つ、273〜275 行目で `required`、278〜283 行目で `errors` を書きます。`required` の値は 291〜293 行目で、要素の `RequiredValidator` が有効か、control に `Validators.required` が入っているか（`_hasRequired()`）です。289 行目の説明文は「`NG_VALIDATORS` に `RequiredValidator` が入っているか」**だけ**を挙げ、文も「either … 」で途切れていて、`_hasRequired()` の方を書いていません（main の f9cf82642ca で「要素の `RequiredValidator` が有効か、control に `Validators.required` があるとき」に直りました）。298〜302 行目の `shouldBindRequired` は子のクラスが上書きできる口で、`NgModel` は `false` にします（[第 8 回](08-fmd-template-dirs.md)）。

📄 `angular/packages/forms/src/directives/ng_control.ts` L304–344 （▶ の行: 305, 313, 316, 319, 322–325, 328, 336–337, 340–341）

```ts
304 │   /**
305 ▶    * Binds a status property to FVC, falling back to native DOM if FVC lacks the input.
306 │    */
307 │   private bindControlProperty(
308 │     host: ControlDirectiveHost,
309 │     bindings: Record<string, unknown>,
310 │     name: 'disabled' | 'touched' | 'dirty' | 'valid' | 'invalid' | 'pending' | 'required',
311 │     value: boolean,
312 │   ): void {
313 ▶     if (bindings[name] === value) {
314 │       return;
315 │     }
316 ▶     bindings[name] = value;
317 │ 
318 │     // Try setting on the custom control first.
319 ▶     const wasSet = host.setInputOnDirectives(name, value);
320 │ 
321 │     // Fall back to native DOM property for 'disabled' and 'required'
322 ▶     if (
323 ▶       this.isNativeFormElement &&
324 ▶       !wasSet &&
325 ▶       (name === 'disabled' || name === 'required') &&
326 │       this.renderer
327 │     ) {
328 ▶       setNativeDomProperty(this.renderer, host.nativeElement as NativeFormControl, name, value);
329 │     }
330 │   }
331 │ 
332 │   /**
333 │    * Converts Reactive Forms errors to Signal Forms error format.
334 │    */
335 │   private _convertErrors(errors: ValidationErrors | null): ReactiveValidationError[] {
336 ▶     if (errors === null) {
337 ▶       return [];
338 │     }
339 │     const control = this.control as FormControl;
340 ▶     return Object.entries(errors).map(([kind, context]) => {
341 ▶       return new ReactiveValidationError({context, kind, control});
342 │     });
343 │   }
344 │ 
```

📄 `angular/packages/forms/src/directives/reactive_validation_error.ts` L9–27 （▶ の行: 12, 14, 16–20, 22）

```ts
 9 │ import type {AbstractControl} from '../model/abstract_model';
10 │ 
11 │ /**
12 ▶  * A validation error used when propagating Reactive Forms errors to FVC components.
13 │  *
14 ▶  * @internal
15 │  */
16 ▶ export class ReactiveValidationError<T = unknown> {
17 ▶   readonly kind: string;
18 ▶   readonly context: T;
19 ▶   readonly control: AbstractControl;
20 ▶   readonly message?: string;
21 │ 
22 ▶   constructor({kind, context, control}: {kind: string; context: T; control: AbstractControl}) {
23 │     this.kind = kind;
24 │     this.context = context;
25 │     this.control = control;
26 │   }
27 │ }
```

`bindControlProperty` は 313 行目で前回と同じなら何もせず、319 行目で要素の上の（自分以外の）ディレクティブの同じ名前の input に書きます。FVC にその input が無く（`wasSet` が `false`）、要素が `input` などのネイティブの要素で、名前が `disabled` か `required` のときだけ、322〜329 行目で DOM のプロパティに書きます（305 行目の説明文）。`errors` は 336〜343 行目で `{minlength: {…}}` の形を、キーごとの `ReactiveValidationError` の配列に変えます。このクラス（12 行目「FVC に Reactive Forms のエラーを渡すときのもの」、14 行目 `@internal`）は 17〜20 行目の `kind`・`context`・`control`・`message?` を持ち、Signal Forms のエラーと同じ形で読めるようにしています。デモの 5 行目では、`maxLength(3)` に引っかかった control の `errors` の input に `{kind: 'maxlength', context: {"requiredLength":3,"actualLength":9}, control: FormControl}` の 1 つが入りました。

📄 `angular/packages/forms/src/directives/ng_control.ts` L345–378 （▶ の行: 346–347, 352–354, 358, 360, 368, 371, 373–374）

```ts
345 │   /** @internal */
346 ▶   setParseErrorSource(parseErrors: Signal<ReadonlyArray<ParseError>> | undefined) {
347 ▶     if (parseErrors === undefined) {
348 │       return;
349 │     }
350 │ 
351 │     let convertedErrors: ValidationErrors | null = null;
352 ▶     const convertedParseErrors = computed(() => {
353 ▶       const rawErrors = parseErrors();
354 ▶       if (rawErrors.length === 0) {
355 │         return null;
356 │       }
357 │ 
358 ▶       return rawErrors.reduce(
359 │         (acc, err) => {
360 ▶           acc[err.kind] = err;
361 │           return acc;
362 │         },
363 │         {} as Record<string, ParseError>,
364 │       );
365 │     });
366 │ 
367 │     // Create validator that returns current parse errors
368 ▶     this.parseErrorsValidator = (() => convertedErrors).bind(this);
369 │ 
370 │     // Setup effect to watch parseErrors and trigger revalidation
371 ▶     effect(
372 │       () => {
373 ▶         convertedErrors = convertedParseErrors();
374 ▶         this.control?.updateValueAndValidity({emitEvent: false});
375 │       },
376 │       {injector: this.injector},
377 │     );
378 │   }
```

📄 `angular/packages/forms/src/directives/ng_control.ts` L379–386 （▶ の行: 380, 382–383）

```ts
379 │ 
380 ▶   protected removeParseErrorsValidator(control: AbstractControl | null | undefined): void {
381 │     if (this.parseErrorsValidator) {
382 ▶       control?.removeValidators(this.parseErrorsValidator);
383 ▶       control?.updateValueAndValidity({emitEvent: false});
384 │     }
385 │   }
386 │ }
```

`setParseErrorSource` は逆向きで、FVC が「入力を値に変えられなかった」という parse のエラー（signal の配列）を control の検証エラーにします。352〜365 行目の `computed` で配列を `{kind: err}` のオブジェクトに直し、368 行目の検証関数はその最後の値を返すだけ、371〜377 行目の `effect` で signal が変わるたびに 374 行目で `updateValueAndValidity({emitEvent: false})` します。この形は、検証の途中で signal を読むと依存が漏れることと、`valueChanges` が 2 回出ることの 2 つで、main の 84d332f9c58（`prevent duplicate valueChanges events on parseErrors update`）と e6798fbfd4b（`untrack parseErrors read in validator`）で書き直されました（22.2.6 には入っています）。380〜385 行目は、control が替わるときと壊れるときに検証関数を外します。

デモの FVC の表を順に読むと：最初の描画で 259〜262 行目が `'初期値'` を書き、`setValue` のあとは新しい値を、FVC の `value.set` のあとは control が `dirty=true` になって `dirty` の input も `true` に、`touch` の emit で `touched` が両方 `true` に、`setValidators([required, maxLength(3)])` で `required` と `invalid` と `errors` が、`disable()` で `disabled=true`・`valid=false`・`invalid=false`・`errors=[]` になりました。

## 5. ControlValueAccessor の説明文の残り

📄 `angular/packages/forms/src/directives/control_value_accessor.ts` L9–22 （▶ の行: 13–14, 16–17, 19）

```ts
 9 │ import {Directive, ElementRef, InjectionToken, Renderer2} from '@angular/core';
10 │ 
11 │ /**
12 │  * @description
13 ▶  * Defines an interface that acts as a bridge between the Angular forms API and a
14 ▶  * native element in the DOM.
15 │  *
16 ▶  * Implement this interface to create a custom form control directive
17 ▶  * that integrates with Angular forms.
18 │  *
19 ▶  * @see {@link DefaultValueAccessor}
20 │  *
21 │  * @publicApi
22 │  */
```

📄 `angular/packages/forms/src/directives/control_value_accessor.ts` L45–74 （▶ の行: 48–49, 51–52, 54–55, 63–64, 73）

````ts
45 │ 
46 │   /**
47 │    * @description
48 ▶    * Registers a callback function that is called when the control's value
49 ▶    * changes in the UI.
50 │    *
51 ▶    * This method is called by the forms API on initialization to update the form
52 ▶    * model when values propagate from the view to the model.
53 │    *
54 ▶    * When implementing the `registerOnChange` method in your own value accessor,
55 ▶    * save the given function so your class calls it at the appropriate time.
56 │    *
57 │    * @usageNotes
58 │    * ### Store the change function
59 │    *
60 │    * The following example stores the provided function as an internal method.
61 │    *
62 │    * ```ts
63 ▶    * registerOnChange(fn: (_: any) => void): void {
64 ▶    *   this._onChange = fn;
65 │    * }
66 │    * ```
67 │    *
68 │    * When the value changes in the UI, call the registered
69 │    * function to allow the forms API to update itself:
70 │    *
71 │    * ```ts
72 │    * host: {
73 ▶    *    '(change)': '_onChange($event.target.value)'
74 │    * }
````

📄 `angular/packages/forms/src/directives/control_value_accessor.ts` L80–100 （▶ の行: 83–84, 86–88, 96–97）

````ts
 80 │ 
 81 │   /**
 82 │    * @description
 83 ▶    * Registers a callback function that is called by the forms API on initialization
 84 ▶    * to update the form model on blur.
 85 │    *
 86 ▶    * When implementing `registerOnTouched` in your own value accessor, save the given
 87 ▶    * function so your class calls it when the control should be considered
 88 ▶    * blurred or "touched".
 89 │    *
 90 │    * @usageNotes
 91 │    * ### Store the callback function
 92 │    *
 93 │    * The following example stores the provided function as an internal method.
 94 │    *
 95 │    * ```ts
 96 ▶    * registerOnTouched(fn: any): void {
 97 ▶    *   this._onTouched = fn;
 98 │    * }
 99 │    * ```
100 │    *
````

📄 `angular/packages/forms/src/directives/control_value_accessor.ts` L133–140 （▶ の行: 135, 138–139）

```ts
133 │ 
134 │ /**
135 ▶  * Base class for all ControlValueAccessor classes defined in Forms package.
136 │  * Contains common logic and utility functions.
137 │  *
138 ▶  * Note: this is an *internal-only* class and should not be extended or used directly in
139 ▶  * applications code.
140 │  */
```

13〜14 行目は「Angular の forms の API と DOM のネイティブの要素の間の橋」、16〜17 行目は「自分の control のディレクティブを作るときに実装する」です。`registerOnChange` の 48〜52 行目は「UI で値が変わったときに呼ぶ関数を登録する。初期化のときに forms の API が呼ぶ」、54〜55 行目は「受け取った関数を保存して、ちょうどよいときに呼べ」。`registerOnTouched` の 83〜84 行目は「blur で form の model を更新するために」とありますが、実装の側では touched の印を付けるのが仕事で（[setUpControl](../forms/10-forms-setup-control.md)の 2 節）、値を更新するのは `updateOn: 'blur'` のときだけです。86〜88 行目の「blur したか touched と見なすべきときに呼べ」の方が実装に合います。135〜139 行目の `BaseControlValueAccessor` は「内部だけのクラスで、アプリのコードが継承・直接使用してはいけない」です。

73 行目の例 `'(change)': '_onChange($event.target.value)'` は、そのまま書くと今の既定の設定では通りません。この章の例を 1 つのクラスに集め（記録の場所の `cva-example.ts`）、`strictTemplates` を付けた `ngc`（サイトの依存の compiler-cli 22.2.6）にかけると、`TS2531: Object is possibly 'null'.` と `TS2339: Property 'value' does not exist on type 'EventTarget'.` の 2 つでした。host の束縛の型検査が 0571b335b9b（2025-09-09、`feat(compiler-cli): enable type checking of host bindings by default`）で既定で有効になったためで、`typeCheckHostBindings: false` にすると通ります。組み込みの `DefaultValueAccessor` は `$any($event.target).value` と書いています（[第 9 回](09-fmd-accessors.md)）。例の文は 71b58769af0（2017-09-01）からで、origin/main でも同じです。63〜65・96〜98 行目と、`writeValue`・`setDisabledState` の例の TypeScript の部分は、`tsc --strict` で通りました。

## 6. NgControlStatus の説明文と、クラスが付く順

📄 `angular/packages/forms/src/directives/ng_control_status.ts` L84–106 （▶ の行: 86–87, 93, 95–101）

```ts
 84 │ /**
 85 │  * @description
 86 ▶  * Directive automatically applied to Angular form controls that sets CSS classes
 87 ▶  * based on control status.
 88 │  *
 89 │  * @usageNotes
 90 │  *
 91 │  * ### CSS classes applied
 92 │  *
 93 ▶  * The following classes are applied as the properties become true:
 94 │  *
 95 ▶  * * ng-valid
 96 ▶  * * ng-invalid
 97 ▶  * * ng-pending
 98 ▶  * * ng-pristine
 99 ▶  * * ng-dirty
100 ▶  * * ng-untouched
101 ▶  * * ng-touched
102 │  *
103 │  * @ngModule ReactiveFormsModule
104 │  * @ngModule FormsModule
105 │  * @publicApi
106 │  */
```

📄 `angular/packages/forms/src/directives/ng_control_status.ts` L117–129 （▶ の行: 120–122）

```ts
117 │ 
118 │ /**
119 │  * @description
120 ▶  * Directive automatically applied to Angular form groups that sets CSS classes
121 ▶  * based on control status (valid/invalid/dirty/etc). On groups, this includes the additional
122 ▶  * class ng-submitted.
123 │  *
124 │  * @see {@link NgControlStatus}
125 │  *
126 │  * @ngModule ReactiveFormsModule
127 │  * @ngModule FormsModule
128 │  * @publicApi
129 │  */
```

93 行目は「プロパティが true になると、次のクラスが付く」で、95〜101 行目の 7 つを並べます。実際に `class` 属性に並ぶ順は、この一覧の順でも、host の束縛の順（74〜82 行目、[状態のクラス](../forms/15-forms-status-classes.md)の 1 節の `ng-untouched`・`ng-touched`・`ng-pristine`・`ng-dirty`・`ng-valid`・`ng-invalid`・`ng-pending`）でもなく、**true になった順**です。最初の描画は host の束縛の順に `ng-untouched ng-pristine ng-invalid` と付き、そのあと変わったクラスは `classList.add` で後ろに足されていきます（デモの表の 2 行目で `ng-dirty` が `ng-invalid` の後ろ、3 行目で `ng-touched` が最後）。CSS の効き方はクラスの順に左右されないので困ることはありませんが、spec はクラスを `sortedClassList` で並べ替えてから比べていて（reactive\_integration\_spec.ts の 1767 行目ほか）、順は約束されていません。

120〜122 行目の `NgControlStatusGroup` は「グループには `ng-submitted` も付く」と書きますが、付くのは `submitted` を持つ最上位の `[formGroup]`・`[formArray]`・`ngForm` の要素だけで、`formGroupName` の `div` には付きません（デモの 9 行目。理由は[状態のクラス](../forms/15-forms-status-classes.md)の 4 節）。デモの 7 行目では、`street.disable()` で `street` の `ng-valid` も `ng-invalid` も外れ（`DISABLED` はどちらでもない）、子がすべて無効になった `address` のグループは `ng-untouched ng-pristine` に戻りました。無効の子を数えない集計は[第 1 回](01-fmd-abstract-model.md)の話です。

## 7. Form インターフェース

📄 `angular/packages/forms/src/directives/form_interface.ts` L9–46 （▶ の行: 17, 19, 28, 30, 36, 38, 44, 46）

```ts
 9 │ import {FormControl} from '../model/form_control';
10 │ import {FormGroup} from '../model/form_group';
11 │ 
12 │ import {AbstractFormGroupDirective} from './abstract_form_group_directive';
13 │ import {NgControl} from './ng_control';
14 │ 
15 │ /**
16 │  * @description
17 ▶  * An interface implemented by `FormGroupDirective` and `NgForm` directives.
18 │  *
19 ▶  * Only used by the `ReactiveFormsModule` and `FormsModule`.
20 │  *
21 │  * @publicApi
22 │  */
23 │ export interface Form {
24 │   /**
25 │    * @description
26 │    * Add a control to this form.
27 │    *
28 ▶    * @param dir The control directive to add to the form.
29 │    */
30 ▶   addControl(dir: NgControl): void;
31 │ 
32 │   /**
33 │    * @description
34 │    * Remove a control from this form.
35 │    *
36 ▶    * @param dir: The control directive to remove from the form.
37 │    */
38 ▶   removeControl(dir: NgControl): void;
39 │ 
40 │   /**
41 │    * @description
42 │    * The control directive from which to get the `FormControl`.
43 │    *
44 ▶    * @param dir: The control directive.
45 │    */
46 ▶   getControl(dir: NgControl): FormControl;
```

📄 `angular/packages/forms/src/directives/form_interface.ts` L47–80 （▶ の行: 52, 54, 59–60, 62, 68, 70, 76–77, 79）

```ts
47 │ 
48 │   /**
49 │    * @description
50 │    * Add a group of controls to this form.
51 │    *
52 ▶    * @param dir: The control group directive to add.
53 │    */
54 ▶   addFormGroup(dir: AbstractFormGroupDirective): void;
55 │ 
56 │   /**
57 │    * @description
58 │    * Remove a group of controls to this form.
59 ▶    *
60 ▶    * @param dir: The control group directive to remove.
61 │    */
62 ▶   removeFormGroup(dir: AbstractFormGroupDirective): void;
63 │ 
64 │   /**
65 │    * @description
66 │    * The `FormGroup` associated with a particular `AbstractFormGroupDirective`.
67 │    *
68 ▶    * @param dir: The form group directive from which to get the `FormGroup`.
69 │    */
70 ▶   getFormGroup(dir: AbstractFormGroupDirective): FormGroup;
71 │ 
72 │   /**
73 │    * @description
74 │    * Update the model for a particular control with a new value.
75 │    *
76 ▶    * @param dir: The control directive to update.
77 ▶    * @param value: The new value for the control.
78 │    */
79 ▶   updateModel(dir: NgControl, value: any): void;
80 │ }
```

17 行目は「`FormGroupDirective` と `NgForm` が実装する」。今は `AbstractFormDirective`（abstract\_form.directive.ts の 58 行目 `implements Form`、[第 7 回](07-fmd-reactive-dirs.md)）が実装し、それを継承する `FormGroupDirective` と `FormArrayDirective` の 2 つが `Form` です。`FormArrayDirective` は 0dd95c503f4（2024-06-18、`feat(forms): Add FormArrayDirective (#55880)`）で足され、17 行目の文は 07c10e28448（2018-08-27）のまま、origin/main でも同じです。7 つのメソッドのうち 54・62・70 行目のグループ用の 3 つは `AbstractFormGroupDirective`（`formGroupName` と `ngModelGroup`）を受け、`formArrayName` が使う `addFormArray`・`removeFormArray`・`getFormArray` はこのインターフェースに**ありません**。`FormArrayName` は `formDirective` を `AbstractFormDirective` にキャストして呼びます（[第 7 回](07-fmd-reactive-dirs.md)）。小さなこととして、28 行目の `@param dir The …` に対して 36・44・52・60・68・76・77 行目は `@param dir: …` とコロンが入り、59 行目は「グループを**この form に**（to）外す」と前置詞が逆です。

## 8. 動かして確かめる

> **🧪 DEMO — 本物のディレクティブの getter と control を並べ、ng-\* のクラスが並ぶ順を記録する**
>
> ボタンを押すと、`[formGroup]` の中に `formGroupName="address"` の `street`（`required`・`minLength(3)`、`'pending'` のときだけ終わらない非同期の検証）と `formArrayName="tags"` の `[formControlName]="$index"`、外に `[(ngModel)]` と、FVC に付けた `[formControl]` を 2 つ置いたコンポーネントを、文書に付けない div の上に作ります。手順は決まっていて、`input`・`blur`・`submit`・`reset` のイベントを要素に直接送り、そのたびに変更検知を回してから読みます。このページの URL・履歴・入力欄は変わりません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-ng-control)

同じデモのファイルを Node（domino の上の JIT、signal の input を JIT に知らせる `angularJitApplicationTransform` を通したもの）で開発モードと本番の両方で走らせると、結果の JSON は完全に同じでした。この章の約束には開発モードだけの例外や警告がありません。

## ここまでの呼び出し

- 👤 `dir.valid` / `dir.hasError('required', 'a.b')` — 利用者のコード
  - `this.control ? this.control.valid : null` — abstract\_control\_directive.ts 54 / 301
- `ɵcontrolCreate` → `ɵngControlCreate(host)` → `NgControl.ngControlCreate` — ng\_control.ts 215–248 — *CVA が無く FVC があるときだけ*
  - `host.listenToCustomControlModel` → `setValue` → `markAsDirty` → `viewToModelUpdate` — 232–237
  - `host.listenToCustomControlOutput('touch')` → `markAsTouched` — 240–242
- `ngOnChanges` → `setupCustomControl()` — 175–204 — *CVA の道なら setUpControlValueAccessor*
- `ɵcontrol` → `ɵngControlUpdate(host)` → `NgControl.ngControlUpdate` — 250–284 — *描画のたび*
  - `bindControlProperty` → `host.setInputOnDirectives` — 307–330
  - `_convertErrors` → `new ReactiveValidationError` — 335–343

## テストと直し方

### spec と it

| 説明文の約束 | spec |
| --- | --- |
| 2 節 getter は control と同じ値 | `packages/forms/test/directives_spec.ts` の `describe('formGroup')`（167 行目）› 194 `should reexport control properties`・209 `should reexport control methods`。`NgForm`（376・394）、`FormGroupName`（495・513）、`FormArrayName`（535・551）、`FormControlDirective`（590・594・603）、`NgModel`（636・654）、`FormControlName`（746・764）にも同じ名前の it がある。`enabled`・`disabled`・`status` を並べて比べる行は 194 行目の it に無い |
| 2 節 `path` が文字列 | `[formControlName]="$index"` の `path` の要素の型を確かめる it は無い |
| 4 節 FVC の道 | `packages/forms/signals/test/web/reactive_fvc.spec.ts` の `describe('FormControlDirective with FVC')`（38 行目）› 57 `should sync FVC value to FormControl (view -> model)`・130 `status bindings`・254 `should fall back to native disabled property when FVC lacks disabled input`・312 `error bindings`、363 行目の `describe('error bindings')` › 364 `should sync FVC parseErrors to FormControl`、508 `describe('FormControlName with FVC')` › 722 `required binding`。`updateOn` の it はこの版に無く、main の 1081 行目 `describe('updateOn options')` で入った |
| 6 節 クラスの一覧 | `reactive_integration_spec.ts` の `describe('setting status classes')`（1693 行目）› 1759 `should work with single fields and async validators` ほか。並び順は `sortedClassList` で消してから比べる |
| 5 節 例の host の書き方 | 説明文の例をコンパイルする spec は無い |

### 手元で走らせた結果

../angular で `pnpm bazel test //packages/forms/test:test --nocache_test_results --test_output=all` は `1153 specs, 0 failures`、`pnpm bazel test //packages/forms/signals/test/web:test --nocache_test_results` は Chromium で 350 passed、Firefox で 346 passed・4 skipped でした（2026-11-21）。web の suite は `--test_arg=--filter=` が効かないので全部を走らせています。件数の内訳は[第 10 回](10-fmd-tests-issues.md)にまとめます。

### 直すとしたら

- 5 節の例は control\_value\_accessor.ts の 73 行目を `'_onChange($any($event.target).value)'` にするか、`(change)` の引数を `$event` にしてクラスの側で `(event.target as HTMLInputElement).value` を読む形にします。例をコンパイルする仕組みが無いので、spec では固まりません。
- 7 節は form\_interface.ts の 17 行目に `FormArrayDirective` を足す（または「`AbstractFormDirective` を継承するディレクティブと `NgForm`」とする）だけです。
- 4 節の 289 行目の説明文は main で直っています。`path` の型の約束を固めるなら、directives\_spec.ts の `describe('FormArrayName')` に、数の `name` の `FormControlName` の `path` が `['cities', '0']` になる it を足します。

## 聞かれそうな質問

**Q. #name="ngModel" の name.valid と、name.control.valid は違うことがありますか？**

ありません。getter は `this.control ? this.control.valid : null` で、毎回 control に読みに行きます（abstract\_control\_directive.ts の 54 行目）。デモでは 72 組すべてが `Object.is` で一致しました。

**Q. \[formControlName\]="i" と数で書いたら、path に数が入りますか？**

入りません。`FormControlName` が名前を `toString()` してから `controlPath` に渡すので `['tags', '0']` です。170〜171 行目の「文字列の名前」のとおりです。

**Q. ng-\* のクラスは決まった順で並びますか？**

並びません。最初は host の束縛の順、そのあとは true になった順に後ろへ足されます。spec も並べ替えてから比べていて、順は約束されていません（6 節）。

**Q. CVA を書かずに、Signal Forms 用の部品に \[formControl\] を付けられますか？**

付けられます。`NgControl.ngControlCreate` が CVA の無いことを見て FVC の道に入り、model の変化を `setValue` に、control の状態を FVC の input に書きます（4 節）。`updateOn: 'blur'` を守るのは 401b4f2011c からで、8576f161ae4 の 234 行目はすぐ `setValue` します。

**Q. registerOnChange の説明文の例をそのまま書いたら？**

`strictTemplates` の既定の設定では、host の `$event.target.value` が TS2531 と TS2339 になります。host の束縛の型検査が 2025-09 から既定で有効だからです（5 節）。

## 読み終えて

- `AbstractControlDirective` の getter は control の値を読み直すだけで、「control が無ければ null」は三項演算子そのもの。
- `NgControl` には CVA の道と、v22 の FVC の道がある。FVC の道は `ngControlCreate` で聞き、`ngControlUpdate` で input に書く。
- ng-\* のクラスの並びは true になった順で、説明文の一覧の順ではない。`ng-submitted` は最上位のフォームの要素だけ。
- `Form` の説明文は `FormArrayDirective` を数えておらず、CVA の `(change)` の例は今の既定の型検査を通らない。

---

← 前: [エラーの文言と小道具：reactive\_errors・template\_driven\_errors・shared](05-fmd-errors.md)  
次: [リアクティブフォームのディレクティブの説明文](07-fmd-reactive-dirs.md) →
