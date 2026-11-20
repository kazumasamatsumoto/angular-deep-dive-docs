[目次](../README.md) › [Forms の説明文の読み残し](README.md) › 第 3 回 / 全 10 回

# FormControl と FormBuilder の説明文

> model/form\_control.ts と form\_builder.ts の未読の行：FormControlOptions と nonNullable、defaultValue と reset、registerOnChange、FormBuilder・NonNullableFormBuilder・UntypedFormBuilder の group・control・array・record の型と例。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-control-builder)

---

`FormControl` の説明文は「作る」「型引数」「updateOn」「reset」の例でできていて、`FormBuilder` の説明文は `nonNullable` の 3 つの例と、`group` が受ける 6 つの形の例を持ちます。この章は、その例を 1 つずつ本物で動かし、`nonNullable` と `reset`、`defaultValue`、配列の形の引数（`[値, 同期, 非同期]`、`{value, disabled}`）、`NonNullableFormBuilder` の型の約束を確かめます。

読む対象は `packages/forms/src/model/form_control.ts` と `packages/forms/src/form_builder.ts`（../angular、8576f161ae4）です。`nonNullable` の型の仕組みと、`FormBuilder` が引数の形を読み分ける `_createControl` は[型付きフォームの章](../forms/08-forms-typed-forms.md)の 2〜3 節と 6 節、`setValue` の中は[updateValueAndValidity の章](../forms/03-forms-update-value-validity.md)にあります。

1. [1. AbstractControl](01-fmd-abstract-model.md)
2. [2. FormGroup・FormRecord・FormArray](02-fmd-group-array.md)
3. **3. FormControl と FormBuilder**（この章）
4. [4. Validators](04-fmd-validators.md)
5. [5. エラーの文言と小道具](05-fmd-errors.md)
6. [6. NgControl](06-fmd-ng-control.md)
7. [7. リアクティブのディレクティブ](07-fmd-reactive-dirs.md)
8. [8. テンプレート駆動のディレクティブ](08-fmd-template-dirs.md)
9. [9. 値のアクセサー](09-fmd-accessors.md)
10. [10. spec と issue](10-fmd-tests-issues.md)

## 1. FormControl を作る 4 つの例

📄 `angular/packages/forms/src/model/form_control.ts` L57–77 （▶ の行: 65–67）

```ts
57 │ /**
58 │  * Tracks the value and validation status of an individual form control.
59 │  *
60 │  * This is one of the four fundamental building blocks of Angular forms, along with
61 │  * `FormGroup`, `FormArray` and `FormRecord`. It extends the `AbstractControl` class that
62 │  * implements most of the base functionality for accessing the value, validation status,
63 │  * user interactions and events.
64 │  *
65 ▶  * `FormControl` takes a single generic argument, which describes the type of its value. This
66 ▶  * argument always implicitly includes `null` because the control can be reset. To change this
67 ▶  * behavior, set `nonNullable` or see the usage notes below.
68 │  *
69 │  * See [usage examples below](#usage-notes).
70 │  *
71 │  * @see {@link AbstractControl}
72 │  * @see [Reactive Forms Guide](guide/forms/reactive-forms)
73 │  * @see [Usage Notes](#usage-notes)
74 │  *
75 │  * @publicApi
76 │  *
77 │  * @overriddenImplementation ɵFormControlCtor
```

📄 `angular/packages/forms/src/model/form_control.ts` L79–114 （▶ の行: 86–87, 90–91, 94–96, 102–104, 110–112）

````ts
 79 │  * @usageNotes
 80 │  *
 81 │  * ### Initializing Form Controls
 82 │  *
 83 │  * Instantiate a `FormControl`, with an initial value.
 84 │  *
 85 │  * ```ts
 86 ▶  * const control = new FormControl('some value');
 87 ▶  * console.log(control.value);     // 'some value'
 88 │  * ```
 89 │  *
 90 ▶  * The following example initializes the control with a form state object. The `value`
 91 ▶  * and `disabled` keys are required in this case.
 92 │  *
 93 │  * ```ts
 94 ▶  * const control = new FormControl({ value: 'n/a', disabled: true });
 95 ▶  * console.log(control.value);     // 'n/a'
 96 ▶  * console.log(control.status);    // 'DISABLED'
 97 │  * ```
 98 │  *
 99 │  * The following example initializes the control with a synchronous validator.
100 │  *
101 │  * ```ts
102 ▶  * const control = new FormControl('', Validators.required);
103 ▶  * console.log(control.value);      // ''
104 ▶  * console.log(control.status);     // 'INVALID'
105 │  * ```
106 │  *
107 │  * The following example initializes the control using an options object.
108 │  *
109 │  * ```ts
110 ▶  * const control = new FormControl('', {
111 ▶  *    validators: Validators.required,
112 ▶  *    asyncValidators: myAsyncValidator
113 │  * });
114 │  * ```
````

4 つの例は、strict の tsc に通り（112 行目の `myAsyncValidator` は宣言だけ足した）、動かしても 87・95・96・103・104 行目のとおりです。90〜91 行目の「この場合は `value` と `disabled` の 2 つのキーが要る」は、次の関数がそのまま決めています。

📄 `angular/packages/forms/src/model/form_control.ts` L442–468 （▶ の行: 445–449, 458）

```ts
442 │ 
443 │ function isFormControlState(formState: unknown): formState is FormControlState<unknown> {
444 │   return (
445 ▶     typeof formState === 'object' &&
446 ▶     formState !== null &&
447 ▶     Object.keys(formState).length === 2 &&
448 ▶     'value' in formState &&
449 ▶     'disabled' in formState
450 │   );
451 │ }
452 │ 
453 │ export const FormControl: ɵFormControlCtor = class FormControl<TValue = any>
454 │   extends AbstractControl<TValue>
455 │   implements FormControlInterface<TValue>
456 │ {
457 │   /** @publicApi */
458 ▶   public defaultValue: TValue = null as unknown as TValue;
459 │ 
460 │   /** @internal */
461 │   _onChange: Array<Function> = [];
462 │ 
463 │   /** @internal */
464 │   _pendingValue!: TValue;
465 │ 
466 │   /** @internal */
467 │   _pendingChange: boolean = false;
468 │ 
```

447 行目のとおりキーが**ちょうど 2 つ**のときだけ「形の物」（`FormControlState`）と見ます。`{value: 'n/a'}` も `{value, disabled, note}` も、物そのものが値になります（DEMO の 3 行目）。形の物を値として持ちたい control（`{value, disabled}` という形のデータ）は区別できません。458 行目の `defaultValue` の初期値は `null` です。

📄 `angular/packages/forms/src/model/form_control.ts` L594–606 （▶ の行: 596, 598–600, 602）

```ts
594 │ 
595 │   private _applyFormState(formState: FormControlState<TValue> | TValue) {
596 ▶     if (isFormControlState(formState)) {
597 │       (this as Writable<this>).value = this._pendingValue = formState.value;
598 ▶       formState.disabled
599 ▶         ? this.disable({onlySelf: true, emitEvent: false})
600 ▶         : this.enable({onlySelf: true, emitEvent: false});
601 │     } else {
602 ▶       (this as Writable<this>).value = this._pendingValue = formState;
603 │     }
604 │   }
605 │ };
606 │ 
```

形の物なら 598〜600 行目で `disable` か `enable` を `emitEvent: false` で呼び、ただの値なら 602 行目で値を入れるだけです。ただの値で `reset` しても無効のままなのは、602 行目が状態に触らないからです（3 節）。

## 2. 型引数と null、updateOn

📄 `angular/packages/forms/src/model/form_control.ts` L116–148 （▶ の行: 125, 129–131, 138, 146）

````ts
116 │  * ### The single type argument
117 │  *
118 │  * `FormControl` accepts a generic argument, which describes the type of its value.
119 │  * In most cases, this argument will be inferred.
120 │  *
121 │  * If you are initializing the control to `null`, or you otherwise wish to provide a
122 │  * wider type, you may specify the argument explicitly:
123 │  *
124 │  * ```ts
125 ▶  * let fc = new FormControl<string|null>(null);
126 │  * fc.setValue('foo');
127 │  * ```
128 │  *
129 ▶  * You might notice that `null` is always added to the type of the control.
130 ▶  * This is because the control will become `null` if you call `reset`. You can change
131 ▶  * this behavior by setting `{nonNullable: true}`.
132 │  *
133 │  * ### Configure the control to update on a blur event
134 │  *
135 │  * Set the `updateOn` option to `'blur'` to update on the blur `event`.
136 │  *
137 │  * ```ts
138 ▶  * const control = new FormControl('', { updateOn: 'blur' });
139 │  * ```
140 │  *
141 │  * ### Configure the control to update on a submit event
142 │  *
143 │  * Set the `updateOn` option to `'submit'` to update on a submit `event`.
144 │  *
145 │  * ```ts
146 ▶  * const control = new FormControl('', { updateOn: 'submit' });
147 │  * ```
148 │  *
````

65〜66 行目と 129〜131 行目の「型に null がいつも入るのは reset で null になるから」は型の話で、実行時にも `new FormControl(undefined)` と `new FormControl()` の値は `null` です（DEMO）。コンストラクターの引数の既定が `formState = null`（L470〜471、[型付きフォームの章](../forms/08-forms-typed-forms.md)）なので、`undefined` を渡すと既定の `null` に置き換わります。これを問う issue が開いています（#47027「Form control value is null when initialized with undefined」）。

## 3. reset の 3 つの例と、既定の値

📄 `angular/packages/forms/src/model/form_control.ts` L149–178 （▶ の行: 151–153, 160, 162, 167–168, 171, 175, 177）

````ts
149 │  * ### Reset the control back to a specific value
150 │  *
151 ▶  * You reset to a specific form state by passing through a standalone
152 ▶  * value or a form state object that contains both a value and a disabled state
153 ▶  * (these are the only two properties that cannot be calculated).
154 │  *
155 │  * ```ts
156 │  * const control = new FormControl('Nancy');
157 │  *
158 │  * console.log(control.value); // 'Nancy'
159 │  *
160 ▶  * control.reset('Drew');
161 │  *
162 ▶  * console.log(control.value); // 'Drew'
163 │  * ```
164 │  *
165 │  * ### Reset the control to its initial value
166 │  *
167 ▶  * If you wish to always reset the control to its initial value (instead of null),
168 ▶  * you can pass the `nonNullable` option:
169 │  *
170 │  * ```ts
171 ▶  * const control = new FormControl('Nancy', {nonNullable: true});
172 │  *
173 │  * console.log(control.value); // 'Nancy'
174 │  *
175 ▶  * control.reset();
176 │  *
177 ▶  * console.log(control.value); // 'Nancy'
178 │  * ```
````

📄 `angular/packages/forms/src/model/form_control.ts` L179–212 （▶ の行: 188, 190–191, 199–201, 203）

````ts
179 │  *
180 │  * ### Reset the control back to an initial value and disabled
181 │  *
182 │  * ```ts
183 │  * const control = new FormControl('Nancy');
184 │  *
185 │  * console.log(control.value); // 'Nancy'
186 │  * console.log(control.status); // 'VALID'
187 │  *
188 ▶  * control.reset({ value: 'Drew', disabled: true });
189 │  *
190 ▶  * console.log(control.value); // 'Drew'
191 ▶  * console.log(control.status); // 'DISABLED'
192 │  * ```
193 │  *
194 │  * @see [FormControl: Getting Started](guide/forms/typed-forms#formcontrol-getting-started)
195 │  *
196 │  */
197 │ export interface FormControl<TValue = any> extends AbstractControl<TValue> {
198 │   /**
199 ▶    * The default value of this FormControl, used whenever the control is reset without an explicit
200 ▶    * value. See {@link FormControlOptions#nonNullable} for more information on configuring
201 ▶    * a default value.
202 │    */
203 ▶   defaultValue: TValue;
204 │ 
205 │   /** @internal */
206 │   _onChange: Function[];
207 │ 
208 │   /**
209 │    * This field holds a pending value that has not yet been applied to the form's value.
210 │    * @internal
211 │    */
212 │   _pendingValue: TValue;
````

3 つの例は 162・177・190〜191 行目のとおりです。199〜200 行目は `defaultValue` を「値を**明示せずに** reset したときに使う」と書きます。実装は `reset(formState = this.defaultValue, …)`（L531〜532）で、JavaScript の既定の引数は `undefined` のときだけ働きます。だから `nonNullable` の control でも `reset(null)` は `null` になります（型は `string` なので、DEMO では型を外して呼んだ）。

- `{value: 'v', disabled: true}` を `nonNullable` で作ると、`defaultValue` は `'v'` です（L491〜492 が形の物の `value` を取る）。`reset()` で `'v'` に戻りますが、無効の状態は既定に入らず、`DISABLED` のままです。
- `reset({value: 'Drew', disabled: true})` のあとの `reset('again')` は、値だけ変わって `DISABLED` のままです（1 節の 602 行目）。spec にも `should retain the disabled state of the control`（form\_control\_spec.ts L1032）があります。

📄 `angular/packages/forms/src/model/form_control.ts` L269–302 （▶ の行: 270–272, 276–277, 280–281, 284–285, 300）

````ts
269 │   /**
270 ▶    * Resets the form control, marking it `pristine` and `untouched`, and resetting
271 ▶    * the value. The new value will be the provided value (if passed), `null`, or the initial value
272 ▶    * if `nonNullable` was set in the constructor via {@link FormControlOptions}.
273 │    *
274 │    * ```ts
275 │    * // By default, the control will reset to null.
276 ▶    * const dog = new FormControl('spot');
277 ▶    * dog.reset(); // dog.value is null
278 │    *
279 │    * // If this flag is set, the control will instead reset to the initial value.
280 ▶    * const cat = new FormControl('tabby', {nonNullable: true});
281 ▶    * cat.reset(); // cat.value is "tabby"
282 │    *
283 │    * // A value passed to reset always takes precedence.
284 ▶    * const fish = new FormControl('finn', {nonNullable: true});
285 ▶    * fish.reset('bubble'); // fish.value is "bubble"
286 │    * ```
287 │    *
288 │    * @param formState Resets the control with an initial value,
289 │    * or an object that defines the initial value and disabled state.
290 │    *
291 │    * @param options Configuration options that determine how the control propagates changes
292 │    * and emits events after the value changes.
293 │    *
294 │    * * `onlySelf`: When true, each change only affects this control, and not its parent. Default is
295 │    * false.
296 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
297 │    * `valueChanges`
298 │    * observables emit events with the latest status and value when the control is reset.
299 │    * When false, no events are emitted.
300 ▶    * * `overwriteDefaultValue`: When true, the value used to reset the control becomes the new default value of the control.
301 │    *
302 │    */
````

276〜285 行目の dog・cat・fish は、そのまま動かして `null`・`'tabby'`・`'bubble'` でした。300 行目の `overwriteDefaultValue` は、`reset('b', {overwriteDefaultValue: true})` のあと `setValue('c')` → `reset()` で `'b'` に戻ります（L539〜541 で `defaultValue = this.value`）。

## 4. setValue の opts と registerOnChange

📄 `angular/packages/forms/src/model/form_control.ts` L213–239 （▶ の行: 232–237）

```ts
213 │ 
214 │   /** @internal */
215 │   _pendingChange: boolean;
216 │ 
217 │   /**
218 │    * Sets a new value for the form control.
219 │    *
220 │    * @param value The new value for the control.
221 │    * @param options Configuration options that determine how the control propagates changes
222 │    * and emits events when the value changes.
223 │    * The configuration options are passed to the {@link AbstractControl#updateValueAndValidity
224 │    * updateValueAndValidity} method.
225 │    *
226 │    * * `onlySelf`: When true, each change only affects this control, and not its parent. Default is
227 │    * false.
228 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
229 │    * `valueChanges`
230 │    * observables emit events with the latest status and value when the control value is updated.
231 │    * When false, no events are emitted.
232 ▶    * * `emitModelToViewChange`: When true or not supplied  (the default), each change triggers an
233 ▶    * `onChange` event to
234 ▶    * update the view.
235 ▶    * * `emitViewToModelChange`: When true or not supplied (the default), each change triggers an
236 ▶    * `ngModelChange`
237 ▶    * event to update the model.
238 │    *
239 │    */
```

📄 `angular/packages/forms/src/model/form_control.ts` L246–268 （▶ の行: 253–255）

```ts
246 │       emitViewToModelChange?: boolean;
247 │     },
248 │   ): void;
249 │ 
250 │   /**
251 │    * Patches the value of a control.
252 │    *
253 ▶    * This function is functionally the same as {@link FormControl#setValue setValue} at this level.
254 ▶    * It exists for symmetry with {@link FormGroup#patchValue patchValue} on `FormGroups` and
255 ▶    * `FormArrays`, where it does behave differently.
256 │    *
257 │    * @see {@link FormControl#setValue} for options
258 │    */
259 │   patchValue(
260 │     value: TValue,
261 │     options?: {
262 │       onlySelf?: boolean;
263 │       emitEvent?: boolean;
264 │       emitModelToViewChange?: boolean;
265 │       emitViewToModelChange?: boolean;
266 │     },
267 │   ): void;
268 │ 
```

📄 `angular/packages/forms/src/model/form_control.ts` L518–530 （▶ の行: 528）

```ts
518 │ 
519 │   override patchValue(
520 │     value: TValue,
521 │     options: {
522 │       onlySelf?: boolean;
523 │       emitEvent?: boolean;
524 │       emitModelToViewChange?: boolean;
525 │       emitViewToModelChange?: boolean;
526 │     } = {},
527 │   ): void {
528 ▶     this.setValue(value, options);
529 │   }
530 │ 
```

📄 `angular/packages/forms/src/model/form_control.ts` L331–356 （▶ の行: 335, 337, 348, 350）

```ts
331 │ 
332 │   /**
333 │    * Register a listener for change events.
334 │    *
335 ▶    * @param fn The method that is called when the value changes
336 │    */
337 ▶   registerOnChange(fn: Function): void;
338 │ 
339 │   /**
340 │    * Internal function to unregister a change events listener.
341 │    * @internal
342 │    */
343 │   _unregisterOnChange(fn: (value?: any, emitModelEvent?: boolean) => void): void;
344 │ 
345 │   /**
346 │    * Register a listener for disabled events.
347 │    *
348 ▶    * @param fn The method that is called when the disabled status changes.
349 │    */
350 ▶   registerOnDisabledChange(fn: (isDisabled: boolean) => void): void;
351 │ 
352 │   /**
353 │    * Internal function to unregister a disabled event listener.
354 │    * @internal
355 │    */
356 │   _unregisterOnDisabledChange(fn: (isDisabled: boolean) => void): void;
```

232〜237 行目の 2 つの opts は、`registerOnChange` で登録した関数への呼び方を変えます。`setValue` の中（L508〜515、[updateValueAndValidity の章](../forms/03-forms-update-value-validity.md)）は「登録した関数があり、`emitModelToViewChange !== false` なら、`(値, emitViewToModelChange !== false)` で呼ぶ」です。DEMO では 4 回の呼び出しで次の 3 つが記録されました。

| 呼び出し | 登録した関数に来た引数 |
| --- | --- |
| `setValue('b')` | `('b', true)` |
| `setValue('c', {emitModelToViewChange: false})` | （呼ばれない） |
| `setValue('d', {emitViewToModelChange: false})` | `('d', false)` |
| `patchValue('e')` | `('e', true)`（528 行目で setValue を呼ぶだけ） |

335 行目の「値が変わったときに呼ぶ」は、正確には「`setValue` が呼ばれたとき」です。同じ値でも呼びます。登録するのは `setUpControl` の model → view の道（[setUpControl の章](../forms/10-forms-setup-control.md)の 3 節）で、2 つ目の引数が `false` だと `ngModelChange` を出しません。348 行目の `registerOnDisabledChange` も「状態が変わったとき」と書きますが、`disable()` を 2 回続けても 2 回呼ばれます（`disable` の最後の L1290 が毎回 `_onDisabledChange` を回す、[第 1 回](01-fmd-abstract-model.md)）。

## 5. コンストラクターの型と、型を絞る関数

📄 `angular/packages/forms/src/model/form_control.ts` L367–378 （▶ の行: 373, 375, 377）

````ts
367 │ // This internal interface is present to avoid a naming clash, resulting in the wrong `FormControl`
368 │ // symbol being used.
369 │ type FormControlInterface<TValue = any> = FormControl<TValue>;
370 │ 
371 │ /**
372 │  * Various available constructors for `FormControl`.
373 ▶  * Do not use this interface directly. Instead, use `FormControl`:
374 │  * ```ts
375 ▶  * const fc = new FormControl('foo');
376 │  * ```
377 ▶  * This symbol is prefixed with ɵ to make plain that it is an internal symbol.
378 │  */
````

📄 `angular/packages/forms/src/model/form_control.ts` L629–640 （▶ の行: 632, 638–639）

```ts
629 │ 
630 │ /**
631 │  * @description
632 ▶  * Asserts that the given control is an instance of `FormControl`
633 │  *
634 │  * @see [Utility functions for narrowing form control types](guide/forms/reactive-forms#utility-functions-for-narrowing-form-control-types)
635 │  *
636 │  * @publicApi
637 │  */
638 ▶ export const isFormControl = (control: unknown): control is FormControl =>
639 ▶   control instanceof FormControl;
640 │ 
```

`ɵFormControlCtor` のオーバーロード（L379〜433）は[型付きフォームの章](../forms/08-forms-typed-forms.md)が読んでいます。632 行目の「Asserts that …」は、[前の章](02-fmd-group-array.md)の `isFormGroup` と同じく、例外を投げない型の絞り込みです。

## 6. FormBuilder.nonNullable の 3 つの例

📄 `angular/packages/forms/src/form_builder.ts` L127–157 （▶ の行: 131–132, 145–146, 150, 153–156）

````ts
127 │ /**
128 │  * @description
129 │  * Creates an `AbstractControl` from a user-specified configuration.
130 │  *
131 ▶  * The `FormBuilder` provides syntactic sugar that shortens creating instances of a
132 ▶  * `FormControl`, `FormGroup`, or `FormArray`. It reduces the amount of boilerplate needed to
133 │  * build complex forms.
134 │  *
135 │  * @see [Reactive Forms Guide](guide/forms/reactive-forms)
136 │  *
137 │  * @publicApi
138 │  */
139 │ @Service()
140 │ export class FormBuilder {
141 │   private useNonNullable: boolean = false;
142 │ 
143 │   /**
144 │    * @description
145 ▶    * Returns a FormBuilder in which automatically constructed `FormControl` elements
146 ▶    * have `{nonNullable: true}` and are non-nullable.
147 │    *
148 │    * **Constructing non-nullable controls**
149 │    *
150 ▶    * When constructing a control, it will be non-nullable, and will reset to its initial value.
151 │    *
152 │    * ```ts
153 ▶    * let nnfb = new FormBuilder().nonNullable;
154 ▶    * let name = nnfb.control('Alex'); // FormControl<string>
155 ▶    * name.reset();
156 ▶    * console.log(name); // 'Alex'
157 │    * ```
````

📄 `angular/packages/forms/src/form_builder.ts` L158–175 （▶ の行: 161–162, 165–168, 172–173）

````ts
158 │    *
159 │    * **Constructing non-nullable groups or arrays**
160 │    *
161 ▶    * When constructing a group or array, all automatically created inner controls will be
162 ▶    * non-nullable, and will reset to their initial values.
163 │    *
164 │    * ```ts
165 ▶    * let nnfb = new FormBuilder().nonNullable;
166 ▶    * let name = nnfb.group({who: 'Alex'}); // FormGroup<{who: FormControl<string>}>
167 ▶    * name.reset();
168 ▶    * console.log(name); // {who: 'Alex'}
169 │    * ```
170 │    * **Constructing *nullable* fields on groups or arrays**
171 │    *
172 ▶    * It is still possible to have a nullable field. In particular, any `FormControl` which is
173 ▶    * *already* constructed will not be altered. For example:
174 │    *
175 │    * ```ts
````

154 行目と 166 行目の型のコメントは合います。strict の tsc で `typeof name` がそれぞれ `FormControl<string>`・`FormGroup<{who: FormControl<string>}>` と等しいことを確かめました（3 つ目の例の `FormGroup<{who: FormControl<string|null>}>` も）。ただし 156 行目と 168 行目の `console.log(name)` は、`name`（control そのもの）を出します。`// 'Alex'`・`// {who: 'Alex'}` になるのは `name.value` です。DEMO では「`name` は FormControl のインスタンス、`name.value` は `'Alex'`」でした。3 つ目の例（L178〜179、[型付きフォームの章](../forms/08-forms-typed-forms.md)が引用）も同じ書き方です。

## 7. group が受ける 6 つの形

📄 `angular/packages/forms/src/form_builder.ts` L191–212 （▶ の行: 197–200, 202–205, 211–212）

```ts
191 │   /**
192 │    * @description
193 │    * Constructs a new `FormGroup` instance. Accepts a single generic argument, which is an object
194 │    * containing all the keys and corresponding inner control types.
195 │    *
196 │    * @param controls A collection of child controls. The key for each child is the name
197 ▶    * under which it is registered. Each value can be one of:
198 ▶    * * An `AbstractControl` instance — passed through as-is.
199 ▶    * * A raw value — shorthand for `fb.control(value)`.
200 ▶    * * A `FormControlState` object (`{value, disabled}`) — initializes the control with a value
201 │    *   and disabled status.
202 ▶    * * A `ControlConfig` tuple — `[value | FormControlState, validatorOrOpts?, asyncValidator?]`.
203 ▶    *   The second element accepts a `ValidatorFn`, an array of `ValidatorFn`, or an
204 ▶    *   `AbstractControlOptions` object (use this to set `updateOn`). The optional third element
205 ▶    *   accepts an `AsyncValidatorFn` or an array of `AsyncValidatorFn`.
206 │    *
207 │    * @param options Configuration options object for the `FormGroup`. The object should have the
208 │    * `AbstractControlOptions` type and might contain the following fields:
209 │    * * `validators`: A synchronous validator function, or an array of validator functions.
210 │    * * `asyncValidators`: A single async validator or array of async validator functions.
211 ▶    * * `updateOn`: The event upon which the control should be updated (options: 'change' | 'blur'
212 ▶    * | submit').
```

📄 `angular/packages/forms/src/form_builder.ts` L213–245 （▶ の行: 223, 226, 229, 232, 235, 238）

````ts
213 │    *
214 │    * @usageNotes
215 │    *
216 │    * ### Different ways to specify a control value
217 │    *
218 │    * ```ts
219 │    * const fb = new FormBuilder();
220 │    *
221 │    * fb.group({
222 │    *   // Raw value — equivalent to fb.control('Ada')
223 ▶    *   name: 'Ada',
224 │    *
225 │    *   // FormControlState — sets initial value and disabled status
226 ▶    *   city: {value: 'London', disabled: true},
227 │    *
228 │    *   // ControlConfig tuple — value with a sync validator
229 ▶    *   email: ['ada@example.com', Validators.email],
230 │    *
231 │    *   // ControlConfig tuple — value, sync validator, and async validator
232 ▶    *   username: ['ada', Validators.required, checkUsernameAvailable],
233 │    *
234 │    *   // ControlConfig tuple — disabled value with updateOn option
235 ▶    *   role: [{value: 'admin', disabled: true}, {updateOn: 'blur'}],
236 │    *
237 │    *   // Pre-built control — passed through unchanged
238 ▶    *   address: new FormControl('', Validators.required),
239 │    * });
240 │    * ```
241 │    */
242 │   group<T extends {}>(
243 │     controls: T,
244 │     options?: AbstractControlOptions | null,
245 │   ): FormGroup<ɵNullableFormControls<T>>;
````

実行時は 6 つとも説明のとおりでした（DEMO の group の 1 行目: `city` と `role` は `DISABLED`、`role` の `updateOn` は `blur`、`address` は渡した物と同じ）。読み分けは `_createControl`（L422〜443）で、配列なら `[0]` を値、`[1]` を `validatorOrOpts`、`[2]` を非同期として `control()` に渡します。211〜212 行目の `'blur' | submit')` は `'submit'` の前の引用符が抜けています（`record` の 301〜302 行目も同じ）。

型は 1 か所だけ合いません。235 行目の `role: [{value: 'admin', disabled: true}, {updateOn: 'blur'}]` から推論される control の型は `FormControl<string | null>` ではなく、配列そのものを値に持つ `FormControl<({value: string; disabled: boolean; …} | {updateOn: string; …})[] | null>` でした（テストの節）。次の型がその理由です。

📄 `angular/packages/forms/src/form_builder.ts` L32–55 （▶ の行: 36, 46, 49–50, 52–53）

```ts
32 │ 
33 │ /**
34 │  * The union of all validator types that can be accepted by a ControlConfig.
35 │  */
36 ▶ type ValidatorConfig = ValidatorFn | AsyncValidatorFn | ValidatorFn[] | AsyncValidatorFn[];
37 │ 
38 │ /**
39 │  * The compiler may not always be able to prove that the elements of the control config are a tuple
40 │  * (i.e. occur in a fixed order). This slightly looser type is used for inference, to catch cases
41 │  * where the compiler cannot prove order and position.
42 │  *
43 │  * For example, consider the simple case `fb.group({foo: ['bar', Validators.required]})`. The
44 │  * compiler will infer this as an array, not as a tuple.
45 │  */
46 ▶ type PermissiveControlConfig<T> = Array<T | FormControlState<T> | ValidatorConfig>;
47 │ 
48 │ /**
49 ▶  * Helper type to allow the compiler to accept [XXXX, { updateOn: string }] as a valid shorthand
50 ▶  * argument for .group()
51 │  */
52 ▶ interface PermissiveAbstractControlOptions extends Omit<AbstractControlOptions, 'updateOn'> {
53 ▶   updateOn?: string;
54 │ }
55 │ 
```

1. **46 行目の要素の型に options が無い**

   `PermissiveControlConfig<T>` の要素は `T | FormControlState<T> | ValidatorConfig` だけです。
2. **値がただの値なら、options は T に吸われる**

   `['admin', {updateOn: 'blur'}]` では `T` が `string | {updateOn: string}` と推論され、`ɵElement` の最後の枝が `Exclude<U, ValidatorConfig | PermissiveAbstractControlOptions>`（L121〜124）で options を取り除いて `FormControl<string | null>` になります。49〜53 行目と、この `Exclude` は d3218804401（2022-11-16、#48084）が入れたものです。
3. **値が形の物だと、T が 1 つに決まらない**

   `[{value, disabled}, {updateOn}]` では、1 つ目から `T = string`（`FormControlState<string>`）、2 つ目の `{updateOn}` は `T` にも `FormControlState` にも `ValidatorConfig` にも当てはまらず、`PermissiveControlConfig` に一致しません。最後の `FormControl<T | N>` に落ち、配列が値の型になります。`nonNullable` でも同じでした。

235 行目の例は 3b8503f960f（2026-05-20、「docs: document FormBuilder.group() controlsConfig value shapes」）で入りました。202〜205 行目は「2 つ目の要素は `AbstractControlOptions` も受ける」と書きますが、公開の型 `ControlConfig<T>`（L71〜75）の 2 つ目は `(ValidatorFn | ValidatorFn[])?` で、`const cc: ControlConfig<string> = ['x', {updateOn: 'blur'}]` は `TS2353` になります。

📄 `angular/packages/forms/src/form_builder.ts` L246–271 （▶ の行: 251, 253–255, 257–258, 265–266）

```ts
246 │ 
247 │   /**
248 │    * @description
249 │    * Constructs a new `FormGroup` instance.
250 │    *
251 ▶    * @deprecated This API is not typesafe and can result in issues with Closure Compiler renaming.
252 │    * Use the `FormBuilder#group` overload with `AbstractControlOptions` instead.
253 ▶    * Note that `AbstractControlOptions` expects `validators` and `asyncValidators` to be valid
254 ▶    * validators. If you have custom validators, make sure their validation function parameter is
255 ▶    * `AbstractControl` and not a sub-class, such as `FormGroup`. These functions will be called
256 │    * with an object of type `AbstractControl` and that cannot be automatically downcast to a
257 ▶    * subclass, so TypeScript sees this as an error. For example, change the `(group: FormGroup) =>
258 ▶    * ValidationErrors|null` signature to be `(group: AbstractControl) => ValidationErrors|null`.
259 │    *
260 │    * @param controls A record of child controls. The key for each child is the name
261 │    * under which the control is registered.
262 │    *
263 │    * @param options Configuration options object for the `FormGroup`. The legacy configuration
264 │    * object consists of:
265 ▶    * * `validator`: A synchronous validator function, or an array of validator functions.
266 ▶    * * `asyncValidator`: A single async validator or array of async validator functions
267 │    * Note: the legacy format is deprecated and might be removed in one of the next major versions
268 │    * of Angular.
269 │    */
270 │   group(controls: {[key: string]: any}, options: {[key: string]: any}): FormGroup;
271 │ 
```

255〜258 行目は、[前の章](02-fmd-group-array.md)で `FormGroup` の説明の例が落ちた理由（`(g: FormGroup)` を `ValidatorFn` に渡せない）を、ここで自分で説明しています。265〜266 行目の古い形 `{validator: v}` は今も読まれ、DEMO で `errors={legacy: true}` になりました（`group` の実装 L272〜287 は `isAbstractControlOptions` でなければ古い形として読む）。

## 8. record・control・array

📄 `angular/packages/forms/src/form_builder.ts` L289–311 （▶ の行: 294–295, 301–302, 308, 310）

```ts
289 │   /**
290 │    * @description
291 │    * Constructs a new `FormRecord` instance. Accepts a single generic argument, which is an object
292 │    * containing all the keys and corresponding inner control types.
293 │    *
294 ▶    * @param controls A collection of child controls. The key for each child is the name
295 ▶    * under which it is registered.
296 │    *
297 │    * @param options Configuration options object for the `FormRecord`. The object should have the
298 │    * `AbstractControlOptions` type and might contain the following fields:
299 │    * * `validators`: A synchronous validator function, or an array of validator functions.
300 │    * * `asyncValidators`: A single async validator or array of async validator functions.
301 ▶    * * `updateOn`: The event upon which the control should be updated (options: 'change' | 'blur'
302 ▶    * | submit').
303 │    */
304 │   record<T>(
305 │     controls: {[key: string]: T},
306 │     options: AbstractControlOptions | null = null,
307 │   ): FormRecord<ɵElement<T, null>> {
308 ▶     const reducedControls = this._reduceControls(controls);
309 │     // Cast to `any` because the inferred types are not as specific as Element.
310 ▶     return new FormRecord(reducedControls, options) as any;
311 │   }
```

📄 `angular/packages/forms/src/form_builder.ts` L335–365 （▶ の行: 337, 343–345, 351–353, 364）

```ts
335 │   control<T>(
336 │     formState: T | FormControlState<T>,
337 ▶     validatorOrOpts?: ValidatorFn | ValidatorFn[] | FormControlOptions | null,
338 │     asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
339 │   ): FormControl<T | null>;
340 │ 
341 │   /**
342 │    * @description
343 ▶    * Constructs a new `FormControl` with the given state, validators and options. Sets
344 ▶    * `{nonNullable: true}` in the options to get a non-nullable control. Otherwise, the
345 ▶    * control will be nullable. Accepts a single generic argument, which is the type  of the
346 │    * control's value.
347 │    *
348 │    * @param formState Initializes the control with an initial state value, or
349 │    * with an object that contains both a value and a disabled status.
350 │    *
351 ▶    * @param validatorOrOpts A synchronous validator function, or an array of
352 ▶    * such functions, or a `FormControlOptions` object that contains
353 ▶    * validation functions and a validation trigger.
354 │    *
355 │    * @param asyncValidator A single async validator or array of async validator
356 │    * functions.
357 │    *
358 │    * @usageNotes
359 │    *
360 │    * ### Initialize a control as disabled
361 │    *
362 │    * The following example returns a control with an initial value in a disabled state.
363 │    *
364 ▶    * {@example forms/ts/formBuilder/form_builder_example.ts region='disabled-control'}
365 │    */
```

351〜353 行目は「2 つ目は検証関数か、その配列か、`FormControlOptions` の物」です。`nonNullable` の builder では、この 2 つ目を `isAbstractControlOptions`（L22〜31、[型付きフォームの章](../forms/08-forms-typed-forms.md)）で見分けます。この関数は「`validators`・`asyncValidators`・`updateOn` のどれかが `undefined` でない」ときだけ options と判断します。

1. **空の options を渡す**

   `fb.nonNullable.control('a', {})`。`{}` は型の上では正しい `AbstractControlOptions`（全部が省略できる）です。
2. **options と見なされない**

   3 つのキーがどれも無いので、`control()` の L375〜381 は `else` に進み、`newOptions.validators = validatorOrOpts`、つまり `{}` を**検証関数として**入れます。
3. **検証で落ちる**

   `new FormControl('a', {validators: {}, …, nonNullable: true})` のコンストラクターが最初の `updateValueAndValidity` で `this.validator(this)` を呼び、`TypeError: this.validator is not a function` です。`fb.nonNullable.group({a: ['x', {}]})` も同じ道で落ちます。

nullable な `fb.control('a', {})` はそのまま `new FormControl` に渡り、そちらの `isOptionsObj`（abstract\_model.ts L257〜265、「配列でない物」なら options）が正しく options と読むので、`'a'` の control ができます。2 つの builder で同じ引数の結果が違います。`{validators: cond ? v : undefined}` のように、キーはあっても値が `undefined` の options も同じです。この分かれ道は 2dbdebc6467（2022-05-02、#45852「Add FormBuilder.nonNullable」）からで、origin/main でも同じです。

📄 `angular/packages/forms/src/form_builder.ts` L385–399 （▶ の行: 387–388, 391–392）

```ts
385 │ 
386 │   /**
387 ▶    * Constructs a new `FormArray` from the given array of configurations,
388 ▶    * validators and options. Accepts a single generic argument, which is the type of each control
389 │    * inside the array.
390 │    *
391 ▶    * @param controls An array of child controls or control configs. Each child control is given an
392 ▶    *     index when it is registered.
393 │    *
394 │    * @param validatorOrOpts A synchronous validator function, or an array of such functions, or an
395 │    *     `AbstractControlOptions` object that contains
396 │    * validation functions and a validation trigger.
397 │    *
398 │    * @param asyncValidator A single async validator or array of async validator functions.
399 │    */
```

`array` も各要素を `_createControl` で読むので、`['a', ['b', required], {value: 'c', disabled: true}]` は 3 つの control になり、値は `['a', 'b']`、`getRawValue()` は `['a', 'b', 'c']` です。

## 9. NonNullableFormBuilder と UntypedFormBuilder

📄 `angular/packages/forms/src/form_builder.ts` L444–453 （▶ の行: 447–448）

```ts
444 │ 
445 │ /**
446 │  * @description
447 ▶  * `NonNullableFormBuilder` is similar to {@link FormBuilder}, but automatically constructed
448 ▶  * {@link FormControl} elements have `{nonNullable: true}` and are non-nullable.
449 │  *
450 │  * @see [FormBuilder and NonNullableFormBuilder](guide/forms/typed-forms#formbuilder-and-nonnullableformbuilder)
451 │  *
452 │  * @publicApi
453 │  */
```

`NonNullableFormBuilder` は抽象クラスで、注入されると `@Service({factory: () => inject(FormBuilder).nonNullable})`（L454、[型付きフォームの章](../forms/08-forms-typed-forms.md)）の物が来ます。DEMO では「`FormBuilder` のインスタンス: true、2 回とも同じ物: true、root の `FormBuilder` と同じ物: false」でした。`nonNullable` の getter（L185〜189）が毎回 `new FormBuilder()` を作るのに 2 回とも同じなのは、root の注入器が factory の結果を 1 つだけ持つからです。

📄 `angular/packages/forms/src/form_builder.ts` L465–500 （▶ の行: 467–469, 488–489, 493）

```ts
465 │ 
466 │   /**
467 ▶    * Similar to `FormBuilder#record`, except any implicitly constructed `FormControl`
468 ▶    * will be non-nullable (i.e. it will have `nonNullable` set to true). Note
469 ▶    * that already-constructed controls will not be altered.
470 │    */
471 │   abstract record<T>(
472 │     controls: {[key: string]: T},
473 │     options?: AbstractControlOptions | null,
474 │   ): FormRecord<ɵElement<T, never>>;
475 │ 
476 │   /**
477 │    * Similar to `FormBuilder#array`, except any implicitly constructed `FormControl`
478 │    * will be non-nullable (i.e. it will have `nonNullable` set to true). Note
479 │    * that already-constructed controls will not be altered.
480 │    */
481 │   abstract array<T>(
482 │     controls: Array<T>,
483 │     validatorOrOpts?: ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
484 │     asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
485 │   ): FormArray<ɵElement<T, never>>;
486 │ 
487 │   /**
488 ▶    * Similar to `FormBuilder#control`, except this overridden version of `control` forces
489 ▶    * `nonNullable` to be `true`, resulting in the control always being non-nullable.
490 │    */
491 │   abstract control<T>(
492 │     formState: T | FormControlState<T>,
493 ▶     validatorOrOpts?: ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
494 │     asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
495 │   ): FormControl<T>;
496 │ }
497 │ 
498 │ /**
499 │  * UntypedFormBuilder is the same as `FormBuilder`, but it provides untyped controls.
500 │  */
```

📄 `angular/packages/forms/src/form_builder.ts` L501–549 （▶ の行: 501–502, 504, 524）

```ts
501 ▶ @Service()
502 ▶ export class UntypedFormBuilder extends FormBuilder {
503 │   /**
504 ▶    * Like `FormBuilder#group`, except the resulting group is untyped.
505 │    */
506 │   override group(
507 │     controlsConfig: {[key: string]: any},
508 │     options?: AbstractControlOptions | null,
509 │   ): UntypedFormGroup;
510 │ 
511 │   /**
512 │    * @deprecated This API is not typesafe and can result in issues with Closure Compiler renaming.
513 │    * Use the `FormBuilder#group` overload with `AbstractControlOptions` instead.
514 │    */
515 │   override group(
516 │     controlsConfig: {[key: string]: any},
517 │     options: {[key: string]: any},
518 │   ): UntypedFormGroup;
519 │ 
520 │   override group(
521 │     controlsConfig: {[key: string]: any},
522 │     options: AbstractControlOptions | {[key: string]: any} | null = null,
523 │   ): UntypedFormGroup {
524 ▶     return super.group(controlsConfig, options);
525 │   }
526 │ 
527 │   /**
528 │    * Like `FormBuilder#control`, except the resulting control is untyped.
529 │    */
530 │   override control(
531 │     formState: any,
532 │     validatorOrOpts?: ValidatorFn | ValidatorFn[] | FormControlOptions | null,
533 │     asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
534 │   ): UntypedFormControl {
535 │     return super.control(formState, validatorOrOpts, asyncValidator);
536 │   }
537 │ 
538 │   /**
539 │    * Like `FormBuilder#array`, except the resulting array is untyped.
540 │    */
541 │   override array(
542 │     controlsConfig: any[],
543 │     validatorOrOpts?: ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
544 │     asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
545 │   ): UntypedFormArray {
546 │     return super.array(controlsConfig, validatorOrOpts, asyncValidator);
547 │   }
548 │ }
549 │ 
```

493 行目の `control` の 2 つ目の型は `AbstractControlOptions` で、`FormBuilder.control`（337 行目）の `FormControlOptions` より狭くなっています。`nonNullable` は builder が足すので、渡せなくしているわけです。`UntypedFormBuilder` は 502 行目のとおり `FormBuilder` を継いで、戻り値の型を `Untyped…` にするだけで、実行時は同じ物を作ります。

> **🧪 DEMO — FormControl と FormBuilder の例を本物で**
>
> 本物の `@angular/forms`（22.2.6）で動かします。`FormBuilder`・`NonNullableFormBuilder`・`UntypedFormBuilder` は、この章のコンポーネントの注入器から `get` した本物です（説明文の例の `new FormBuilder()` はそのまま new）。例外は「例外 クラス名: message の 1 行目」で書き、合わない行を赤くします。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-control-builder)

## ここまでの呼び出し

- 👤 `fb.nonNullable.control('a', {})` — form\_builder.ts L366
  - `isAbstractControlOptions({})` — L22〜31 — *3 つのキーが無いので false*
  - `newOptions.validators = {}` — L380
  - `new FormControl('a', {validators: {}, nonNullable: true})` — L383
    - `updateValueAndValidity → _runValidator → this.validator(this)` — abstract\_model.ts L1439〜1440 — *TypeError*
- 👤 `control.reset(null)` — form\_control.ts L531 — *null は「渡した値」なので defaultValue を使わない*

## テストと直し方

| ファイル（packages/forms/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `form_control_spec.ts` | `reset()`（860）› 897・931・945・1032 | 既定の値、形の物の `value` を既定にする、無効の状態を残す |
| `form_control_spec.ts` | `boxed values`（60）› 61・69 | 447〜449 行目（`value` が無い物は形の物と見ない） |
| `form_builder_spec.ts` | `Form Builder`（28）› `should create groups with shorthand parameters and with right typings`（209） | `[5, {updateOn: 'blur'}]` の型（ただの値 + options）。形の物 + options の型は無い |
| `form_builder_spec.ts` | `should be injectable as NonNullableFormBuilder`（294） | 注入した物が `FormBuilder` で、`reset` で最初の値に戻る |
| （なし） | — | `nonNullable` の builder に options の物（空、または値が undefined のキーだけ）を渡すこと |

📄 `走らせたコマンド（2026-11-21、../angular の 8576f161ae4）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/forms/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
--filter=Form Builder             Ran 38 of 1153 specs、0 failures
--filter=FormControl reset()      Ran 21 of 1153 specs、0 failures
--filter=boxed values             Ran 6 of 1153 specs、0 failures
--filter=NonNullableFormBuilder   Ran 1 of 1153 specs、0 failures

# 説明文の例を貼って、型が説明のとおりかを確かめる（TypeScript 6.0.3、--strict）
# Eq<A, B> は 2 つの型が等しいときだけ true になる型
$ tsc --strict --noEmit ex-cb.ts
ex-cb.ts(44,5): error TS2344: Type 'false' does not satisfy the constraint 'true'.
#   ↑ L235 の role は FormControl<string | null> と等しくない（L154・L166・L178 の 3 つの型は等しい）
ex-cb.ts(48,42): error TS2353: Object literal may only specify known properties, and 'updateOn' does not exist in type 'ValidatorFn | ValidatorFn[]'.
#   ↑ const cc: ControlConfig<string> = ['x', {updateOn: 'blur'}]
$ tsc --strict --noEmit ex-cb3.ts       # 推論された型をエラーの文で出す
plain:     FormControl<string | null>                          # ['admin', {updateOn: 'blur'}]
state:     FormControl<string | null>                          # [{value: 'admin', disabled: true}]
stateOpts: FormControl<({ value: string; disabled: boolean; updateOn?: undefined; }
             | { updateOn: string; value?: undefined; disabled?: undefined; })[] | null>
nonNullable の stateOpts: 同じ配列の型（| null だけ無い）
```

説明文で直す所は、form\_builder.ts の 156・168 行目（と L179）の `console.log(name.value)`、211〜212・301〜302 行目の引用符です。235 行目の型を通すなら、`PermissiveControlConfig`（46 行目）の要素に `PermissiveAbstractControlOptions` を足す形になり、`form_builder_spec.ts` の L209 の it に `[{value: 5, disabled: true}, {updateOn: 'blur'}]` の型の確かめを足して固めます。空の options の `TypeError` は `control()`（L375〜381）の分かれ道の問題で、`isAbstractControlOptions` を `FormControl` 側の `isOptionsObj` と同じ「配列でない物」に寄せるか、`validatorOrOpts` が関数か配列かで分けるかの形になります。spec は `form_builder_spec.ts` の `Form Builder`（28）に `fb.nonNullable.control('a', {})` の it を足します。

## 聞かれそうな質問

**Q. `nonNullable` の control で `reset(null)` を呼ぶと、最初の値に戻りますか？**

戻りません。`reset` の既定の引数（L531〜532）は `undefined` のときだけ働くので、`null` は渡した値として入ります。型は `null` を許さないので、型を外したときだけ起きます。

**Q. `new FormControl({value: 1})` の値は何ですか？**

`{value: 1}` そのものです。形の物と見るのはキーがちょうど `value` と `disabled` の 2 つのときだけです（447〜449 行目）。

**Q. `fb.group({role: [{value: 'a', disabled: true}, {updateOn: 'blur'}]})` は使えますか？**

実行時は使えます（無効、`updateOn: 'blur'` の control）。ただし推論される型が `FormControl<配列 | null>` になるので、`role.value` を文字列として使うには型を書く必要があります（46 行目）。

**Q. `fb.nonNullable.control('a', {})` が落ちるのはなぜですか？**

nonNullable の builder は「3 つのキーのどれかがある物」だけを options と見なし、それ以外を検証関数として渡すからです（L22〜31・L375〜381）。nullable な `fb.control` は同じ引数で落ちません。

**Q. `inject(NonNullableFormBuilder)` は呼ぶたびに別の物ですか？**

同じ物です。root の注入器が `inject(FormBuilder).nonNullable` の結果を 1 つ持ちます。`fb.nonNullable` を自分で読むと、そのたびに新しい builder ができます。

## 読み終えて

- `FormControlState` と見なすのは、キーがちょうど `value` と `disabled` の 2 つの物だけ。
- `defaultValue` は「`undefined` で reset したとき」に使われ、`null` は渡した値として入る。無効の状態は既定に含まれない。
- `nonNullable` の説明の例の `console.log(name)` は control を出す。値は `name.value`。
- `group` の 6 つの形は実行時は説明どおりだが、「形の物 + options」の配列だけ型の推論が崩れる。
- `nonNullable` の builder に空の options を渡すと `TypeError` になる。nullable な builder とは振る舞いが違う。

---

← 前: [FormGroup・FormRecord・FormArray の説明文](02-fmd-group-array.md)  
次: [Validators とバリデーターのディレクティブの説明文](04-fmd-validators.md) →
