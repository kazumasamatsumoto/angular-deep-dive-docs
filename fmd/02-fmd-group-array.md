[目次](../README.md) › [Forms の説明文の読み残し](README.md) › 第 2 回 / 全 10 回

# FormGroup・FormRecord・FormArray の説明文

> model/form\_group.ts と form\_array.ts の未読の行：クラスの説明の例（strict に通るか）、addControl・setControl・contains、setValue・patchValue・reset の opts、FormRecord の reset、FormArray の at・insert・removeAt・setControl の負の添字と clear。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-group-array)

---

`FormGroup`・`FormRecord`・`FormArray` の説明文は、例のコードがいちばん多い所です。この章は、クラスの説明の例と、`addControl`・`setControl`・`contains`・`setValue`・`patchValue`・`reset`・`at`・`insert`・`clear` の説明に書かれた約束を、strict の TypeScript に通る形に直して本物で動かします。例がそのままでは通らない所と、説明と結果が合わない所を表に残します。

読む対象は `packages/forms/src/model/form_group.ts` と `form_array.ts`（../angular、8576f161ae4）です。子に親を教える仕組み、`registerControl`、値の組み立て（enabled な子だけ）は[FormGroup と FormArray の章](../forms/07-forms-form-group-array.md)、値の型（`Partial` になる理由）は[型付きフォームの章](../forms/08-forms-typed-forms.md)にあります。

1. [1. AbstractControl](01-fmd-abstract-model.md)
2. **2. FormGroup・FormRecord・FormArray**（この章）
3. [3. FormControl と FormBuilder](03-fmd-control-builder.md)
4. [4. Validators](04-fmd-validators.md)
5. [5. エラーの文言と小道具](05-fmd-errors.md)
6. [6. NgControl](06-fmd-ng-control.md)
7. [7. リアクティブのディレクティブ](07-fmd-reactive-dirs.md)
8. [8. テンプレート駆動のディレクティブ](08-fmd-template-dirs.md)
9. [9. 値のアクセサー](09-fmd-accessors.md)
10. [10. spec と issue](10-fmd-tests-issues.md)

## 1. FormGroup の説明と最初の例

📄 `angular/packages/forms/src/model/form_group.ts` L72–104 （▶ の行: 76–78, 86–87, 103–104）

````ts
 72 │ 
 73 │ /**
 74 │  * Tracks the value and validity state of a group of `FormControl` instances.
 75 │  *
 76 ▶  * A `FormGroup` aggregates the values of each child `FormControl` into one object,
 77 ▶  * with each control name as the key.  It calculates its status by reducing the status values
 78 ▶  * of its children. For example, if one of the controls in a group is invalid, the entire
 79 │  * group becomes invalid.
 80 │  *
 81 │  * `FormGroup` is one of the four fundamental building blocks used to define forms in Angular,
 82 │  * along with `FormControl`, `FormArray`, and `FormRecord`.
 83 │  *
 84 │  * When instantiating a `FormGroup`, pass in a collection of child controls as the first
 85 │  * argument. The key for each child registers the name for the control.
 86 ▶  *
 87 ▶  * `FormGroup` is intended for use cases where the keys are known ahead of time.
 88 │  * If you need to dynamically add and remove controls, use {@link FormRecord} instead.
 89 │  *
 90 │  * `FormGroup` accepts an optional type parameter `TControl`, which is an object type with inner
 91 │  * control types as values.
 92 │  *
 93 │  * @usageNotes
 94 │  *
 95 │  * ### Create a form group with 2 controls
 96 │  *
 97 │  * ```ts
 98 │  * const form = new FormGroup({
 99 │  *   first: new FormControl('Nancy', Validators.minLength(2)),
100 │  *   last: new FormControl('Drew'),
101 │  * });
102 │  *
103 ▶  * console.log(form.value);   // {first: 'Nancy', last; 'Drew'}
104 ▶  * console.log(form.status);  // 'VALID'
````

76〜78 行目「子のどれかが invalid なら group も invalid」は、`_calculateStatus` の `_anyControlsHaveStatus(INVALID)`（[前の章](01-fmd-abstract-model.md)で読んだ abstract\_model.ts L1698）です。103 行目のコメントは `last; 'Drew'` と、`:` が `;` になっています。動かした値は `{first: 'Nancy', last: 'Drew'}` と `'VALID'` で、例の中身は合います。86〜87 行目は「キーが前もって分かる場合のもの。動的に足し外しするなら `FormRecord`」です。ところが 4 節の例は、`FormGroup` で省ける control を `removeControl` で外す使い方を勧めています。型でキーを決めておけば、`FormGroup` でも足し外しはできます。

## 2. 型引数と、group の検証関数の例

📄 `angular/packages/forms/src/model/form_group.ts` L105–144 （▶ の行: 112–113, 116, 118, 123, 129–130, 134, 137, 140–141, 143）

````ts
105 │  * ```
106 │  *
107 │  * ### The type argument, and optional controls
108 │  *
109 │  * `FormGroup` accepts one generic argument, which is an object containing its inner controls.
110 │  * This type will usually be inferred automatically, but you can always specify it explicitly if you
111 │  * wish.
112 ▶  *
113 ▶  * If you have controls that are optional (i.e. they can be removed, you can use the `?` in the
114 │  * type):
115 │  *
116 ▶  * ```ts
117 │  * const form = new FormGroup<{
118 ▶  *   first: FormControl<string|null>,
119 │  *   middle?: FormControl<string|null>, // Middle name is optional.
120 │  *   last: FormControl<string|null>,
121 │  * }>({
122 │  *   first: new FormControl('Nancy'),
123 ▶  *   last: new FormControl('Drew'),
124 │  * });
125 │  * ```
126 │  *
127 │  * ### Create a form group with a group-level validator
128 │  *
129 ▶  * You include group-level validators as the second arg, or group-level async
130 ▶  * validators as the third arg. These come in handy when you want to perform validation
131 │  * that considers the value of more than one child control.
132 │  *
133 │  * ```ts
134 ▶  * const form = new FormGroup({
135 │  *   password: new FormControl('', Validators.minLength(2)),
136 │  *   passwordConfirm: new FormControl('', Validators.minLength(2)),
137 ▶  * }, passwordMatchValidator);
138 │  *
139 │  *
140 ▶  * function passwordMatchValidator(g: FormGroup) {
141 ▶  *    return g.get('password').value === g.get('passwordConfirm').value
142 │  *       ? null : {'mismatch': true};
143 ▶  * }
144 │  * ```
````

116〜123 行目の `middle?` の例は、型検査に通ります。134〜143 行目の例は strict では 3 か所で落ちます（テストの節）。

- 137 行目: `(g: FormGroup) => …` は `ValidatorFn`（引数が `AbstractControl`）に代入できず `TS2345`。引数を `FormGroup` に狭めた関数は渡せません。この理由は form\_builder.ts の古い `group` の説明（[次の章](03-fmd-control-builder.md)）が自分で「`(group: AbstractControl)` に変えよ」と書いています。
- 141 行目: `g.get('password')` は `AbstractControl | null` を返すので、`.value` が 2 か所とも `TS2531: Object is possibly 'null'`。

`(g: AbstractControl)` と `?.` に直して動かすと、`{password: 'ab', passwordConfirm: 'ac'}` で `INVALID {mismatch: true}`、そろえると `VALID` になりました。129〜130 行目のとおり、group の検証関数は子の検証のあとに group の値全体を見ます。

📄 `angular/packages/forms/src/model/form_group.ts` L145–167 （▶ の行: 151–153, 158–161）

````ts
145 │  *
146 │  * Like `FormControl` instances, you choose to pass in
147 │  * validators and async validators as part of an options object.
148 │  *
149 │  * ```ts
150 │  * const form = new FormGroup({
151 ▶  *   password: new FormControl('')
152 ▶  *   passwordConfirm: new FormControl('')
153 ▶  * }, { validators: passwordMatchValidator, asyncValidators: otherValidator });
154 │  * ```
155 │  *
156 │  * ### Set the updateOn property for all controls in a form group
157 │  *
158 ▶  * The options object is used to set a default value for each child
159 ▶  * control's `updateOn` property. If you set `updateOn` to `'blur'` at the
160 ▶  * group level, all child controls default to 'blur', unless the child
161 ▶  * has explicitly specified a different `updateOn` value.
162 │  *
163 │  * ```ts
164 │  * const c = new FormGroup({
165 │  *   one: new FormControl()
166 │  * }, { updateOn: 'blur' });
167 │  * ```
````

151 行目の `new FormControl('')` の後ろにカンマがなく、貼ると `TS1005: ',' expected` です。カンマを足しても、153 行目の `passwordMatchValidator` は上と同じ `TS2345` になります。158〜161 行目の `updateOn` の約束は合います。`{updateOn: 'blur'}` の group の子は `blur`、自分で `'submit'` を決めた子は `submit` でした（`updateOn` を探す順は[前の章](01-fmd-abstract-model.md)の 5 節）。

📄 `angular/packages/forms/src/model/form_group.ts` L168–188 （▶ の行: 171–172, 176–177, 181–182）

````ts
168 │  *
169 │  * ### Using a FormGroup with optional controls
170 │  *
171 ▶  * It is possible to have optional controls in a FormGroup. An optional control can be removed later
172 ▶  * using `removeControl`, and can be omitted when calling `reset`. Optional controls must be
173 │  * declared optional in the group's type.
174 │  *
175 │  * ```ts
176 ▶  * const c = new FormGroup<{one?: FormControl<string>}>({
177 ▶  *   one: new FormControl('')
178 │  * });
179 │  * ```
180 │  *
181 ▶  * Notice that `c.value.one` has type `string|null|undefined`. This is because calling `c.reset({})`
182 ▶  * without providing the optional key `one` will cause it to become `null`.
183 │  *
184 │  * @see [Grouping form controls](guide/forms/reactive-forms#grouping-form-controls)
185 │  * @see [FormGroup and FormRecord](guide/forms/typed-forms#formgroup-and-formrecord)
186 │  *
187 │  * @publicApi
188 │  */
````

この例は、型と説明がかみ合っていません。

1. **177 行目は型検査に通らない**

   `new FormControl('')` は `FormControl<string | null>` で、176 行目の `FormControl<string>` に入りません（`TS2322`、`defaultValue` の型が合わない）。`{nonNullable: true}` を付けると通ります。
2. **181 行目の型の答えも違う**

   176 行目の型のままなら `c.value.one` は `string | undefined` で、`null` を入れると `TS2322: Type 'null' is not assignable to type 'string | undefined'` になります。
3. **実行時は 182 行目のとおり**

   177 行目のまま（nullable な control）動かすと、`c.reset({})` で `{one: null}` です。`nonNullable` にすれば `''` に戻ります（4 節の `reset`）。

つまり 181〜182 行目の文は「177 行目の control が nullable なとき」の話で、176 行目の型とは別の物を説明しています。型を `FormControl<string | null>` にすれば、例・型・文の 3 つがそろいます。

## 3. addControl・setControl・contains

📄 `angular/packages/forms/src/model/form_group.ts` L257–286 （▶ の行: 261–263, 269–271）

```ts
257 │   /**
258 │    * Add a control to this group. In a strongly-typed group, the control must be in the group's type
259 │    * (possibly as an optional key).
260 │    *
261 ▶    * If a control with a given name already exists, it would *not* be replaced with a new one.
262 ▶    * If you want to replace an existing control, use the {@link FormGroup#setControl setControl}
263 ▶    * method instead. This method also updates the value and validity of the control.
264 │    *
265 │    * @param name The control name to add to the collection
266 │    * @param control Provides the control for the given name
267 │    * @param options Specifies whether this FormGroup instance should emit events after a new
268 │    *     control is added.
269 ▶    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
270 ▶    * `valueChanges` observables emit events with the latest status and value when the control is
271 ▶    * added. When false, no events are emitted.
272 │    */
273 │   addControl(
274 │     this: FormGroup<{[key: string]: AbstractControl<any>}>,
275 │     name: string,
276 │     control: AbstractControl,
277 │     options?: {emitEvent?: boolean},
278 │   ): void;
279 │   addControl<K extends string & keyof TControl>(
280 │     name: K,
281 │     control: Required<TControl>[K],
282 │     options?: {
283 │       emitEvent?: boolean;
284 │     },
285 │   ): void;
286 │ 
```

261 行目「同じ名前があれば置き換えない」は、`registerControl` が既にあるものを返すからで（L241〜255、[FormGroup の章](../forms/07-forms-form-group-array.md)の 2 節）、DEMO でも `'old'` のままでした。ただし置き換えなくても `updateValueAndValidity` は走り、`valueChanges` は 1 回出ます。263 行目の「the control の値と検証もやり直す」の the control は group 自身です。実装（L287〜297）が呼ぶのは `this.updateValueAndValidity` で、足した control は計算し直しません。DEMO では、`setValidators(Validators.required)` だけして呼び直していない control を足すと、その control も group も `VALID` のままでした。

📄 `angular/packages/forms/src/model/form_group.ts` L334–361 （▶ の行: 338, 344–346）

```ts
334 │   /**
335 │    * Replace an existing control. In a strongly-typed group, the control must be in the group's type
336 │    * (possibly as an optional key).
337 │    *
338 ▶    * If a control with a given name does not exist in this `FormGroup`, it will be added.
339 │    *
340 │    * @param name The control name to replace in the collection
341 │    * @param control Provides the control for the given name
342 │    * @param options Specifies whether this FormGroup instance should emit events after an
343 │    *     existing control is replaced.
344 ▶    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
345 ▶    * `valueChanges` observables emit events with the latest status and value when the control is
346 ▶    * replaced with a new one. When false, no events are emitted.
347 │    */
348 │   setControl<K extends string & keyof TControl>(
349 │     name: K,
350 │     control: TControl[K],
351 │     options?: {
352 │       emitEvent?: boolean;
353 │     },
354 │   ): void;
355 │   setControl(
356 │     this: FormGroup<{[key: string]: AbstractControl<any>}>,
357 │     name: string,
358 │     control: AbstractControl,
359 │     options?: {emitEvent?: boolean},
360 │   ): void;
361 │ 
```

📄 `angular/packages/forms/src/model/form_group.ts` L377–382 （▶ の行: 380–381）

```ts
377 │   /**
378 │    * Check whether there is an enabled control with the given name in the group.
379 │    *
380 ▶    * Reports false for disabled controls. If you'd like to check for existence in the group
381 ▶    * only, use {@link AbstractControl#get get} instead.
382 │    *
```

338 行目のとおり、無い名前の `setControl` は足します。`contains` は実装（L390〜392）が `this._find(controlName)?.enabled === true` なので、380〜381 行目のとおり無効の control では `false`、`get('b')` は control を返します。

## 4. setValue・patchValue・reset

📄 `angular/packages/forms/src/model/form_group.ts` L393–428 （▶ の行: 407, 410, 413–414, 421–422）

````ts
393 │ 
394 │   /**
395 │    * Sets the value of the `FormGroup`. It accepts an object that matches
396 │    * the structure of the group, with control names as keys.
397 │    *
398 │    * @usageNotes
399 │    * ### Set the complete value for the form group
400 │    *
401 │    * ```ts
402 │    * const form = new FormGroup({
403 │    *   first: new FormControl(),
404 │    *   last: new FormControl()
405 │    * });
406 │    *
407 ▶    * console.log(form.value);   // {first: null, last: null}
408 │    *
409 │    * form.setValue({first: 'Nancy', last: 'Drew'});
410 ▶    * console.log(form.value);   // {first: 'Nancy', last: 'Drew'}
411 │    * ```
412 │    *
413 ▶    * @throws When strict checks fail, such as setting the value of a control
414 ▶    * that doesn't exist or if you exclude a value of a control that does exist.
415 │    *
416 │    * @param value The new value for the control that matches the structure of the group.
417 │    * @param options Configuration options that determine how the control propagates changes
418 │    * and emits events after the value changes.
419 │    * The configuration options are passed to the {@link AbstractControl#updateValueAndValidity
420 │    * updateValueAndValidity} method.
421 ▶    *
422 ▶    * * `onlySelf`: When true, each change only affects this control, and not its parent. Default is
423 │    * false.
424 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
425 │    * `valueChanges`
426 │    * observables emit events with the latest status and value when the control value is updated.
427 │    * When false, no events are emitted.
428 │    */
````

413〜414 行目の 2 つの例外は、[前の章](01-fmd-abstract-model.md)の abstract\_model.ts の `assertAllValuesPresent`（値が足りない、NG01002）と `assertControlPresent`（無い control、NG01001）です。DEMO の文は `NG01002: Must supply a value for form control with name: 'last'. Find more at …` と `NG01001: Cannot find form control with name: 'extra'` で、このページ（本番ビルド）では `NG01002` だけになります。文が出る所と、本番で落ちる理由は[第 5 回](05-fmd-errors.md)です。

📄 `angular/packages/forms/src/model/form_group.ts` L448–479 （▶ の行: 454, 466–467, 473–474）

````ts
448 │ 
449 │   /**
450 │    * Patches the value of the `FormGroup`. It accepts an object with control
451 │    * names as keys, and does its best to match the values to the correct controls
452 │    * in the group.
453 │    *
454 ▶    * It accepts both super-sets and sub-sets of the group without throwing an error.
455 │    *
456 │    * @usageNotes
457 │    * ### Patch the value for a form group
458 │    *
459 │    * ```ts
460 │    * const form = new FormGroup({
461 │    *    first: new FormControl(),
462 │    *    last: new FormControl()
463 │    * });
464 │    * console.log(form.value);   // {first: null, last: null}
465 │    *
466 ▶    * form.patchValue({first: 'Nancy'});
467 ▶    * console.log(form.value);   // {first: 'Nancy', last: null}
468 │    * ```
469 │    *
470 │    * @param value The object that matches the structure of the group.
471 │    * @param options Configuration options that determine how the control propagates changes and
472 │    * emits events after the value is patched.
473 ▶    * * `onlySelf`: When true, each change only affects this control and not its parent. Default is
474 ▶    * true.
475 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
476 │    * `valueChanges` observables emit events with the latest status and value when the control value
477 │    * is updated. When false, no events are emitted. The configuration options are passed to
478 │    * the {@link AbstractControl#updateValueAndValidity updateValueAndValidity} method.
479 │    */
````

473〜474 行目は `onlySelf` の既定を「**true**」と書きます。`setValue`（421〜422 行目）・`reset`・`FormArray` の同じ項目はどれも「false」です。実装（L480〜504）は `options = {}` のまま `this.updateValueAndValidity(options)` を呼ぶので、既定は `false` で、親にも伝わります。DEMO で `inner.patchValue({first: 'x'})` を opts なしで呼ぶと、外の group の `valueChanges` が 1 回出ました。spec も `should set parent values`（form\_group\_spec.ts L526）で「opts なしなら親の値も変わる」を固めています。

📄 `angular/packages/forms/src/model/form_group.ts` L505–533 （▶ の行: 507–508, 510–512）

````ts
505 │ 
506 │   /**
507 ▶    * Resets the `FormGroup`, marks all descendants `pristine` and `untouched` and sets
508 ▶    * the value of all descendants to their default values, or null if no defaults were provided.
509 │    *
510 ▶    * You reset to a specific form state by passing in a map of states
511 ▶    * that matches the structure of your form, with control names as keys. The state
512 ▶    * is a standalone value or a form state object with both a value and a disabled
513 │    * status.
514 │    *
515 │    * @param value Resets the control with an initial value,
516 │    * or an object that defines the initial value and disabled state.
517 │    *
518 │    * @param options Configuration options that determine how the control propagates changes
519 │    * and emits events when the group is reset.
520 │    * * `onlySelf`: When true, each change only affects this control, and not its parent. Default is
521 │    * false.
522 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
523 │    * `valueChanges`
524 │    * observables emit events with the latest status and value when the control is reset.
525 │    * When false, no events are emitted.
526 │    * The configuration options are passed to the {@link AbstractControl#updateValueAndValidity
527 │    * updateValueAndValidity} method.
528 │    *
529 │    * @usageNotes
530 │    *
531 │    * ### Reset the form group values
532 │    *
533 │    * ```ts
````

📄 `angular/packages/forms/src/model/form_group.ts` L534–562 （▶ の行: 554–556, 559–560）

````ts
534 │    * const form = new FormGroup({
535 │    *   first: new FormControl('first name'),
536 │    *   last: new FormControl('last name')
537 │    * });
538 │    *
539 │    * console.log(form.value);  // {first: 'first name', last: 'last name'}
540 │    *
541 │    * form.reset({ first: 'name', last: 'last name' });
542 │    *
543 │    * console.log(form.value);  // {first: 'name', last: 'last name'}
544 │    * ```
545 │    *
546 │    * ### Reset the form group values and disabled status
547 │    *
548 │    * ```ts
549 │    * const form = new FormGroup({
550 │    *   first: new FormControl('first name'),
551 │    *   last: new FormControl('last name')
552 │    * });
553 │    *
554 ▶    * form.reset({
555 ▶    *   first: {value: 'name', disabled: true},
556 ▶    *   last: 'last'
557 │    * });
558 │    *
559 ▶    * console.log(form.value);  // {last: 'last'}
560 ▶    * console.log(form.get('first').status);  // 'DISABLED'
561 │    * ```
562 │    */
````

507〜508 行目「子を既定の値に、既定が無ければ null に」は合います（`a` を `nonNullable` にした group の `reset()` は `{a: 'A', b: null}`）。554〜560 行目の例は、560 行目の `form.get('first').status` が strict で `TS2531` です。`?.` にすれば 559〜560 行目のとおり `{last: 'last'}` と `'DISABLED'` で、`getRawValue()` には `first` も入ります。

## 5. キーの「.」と FormRecord

📄 `angular/packages/forms/src/model/form_group.ts` L666–688 （▶ の行: 668, 675–676, 681, 683–685）

```ts
666 │   /** @internal */
667 │   override _find(name: string | number): AbstractControl | null {
668 ▶     return hasOwnControl(this.controls, name as string)
669 │       ? (this.controls as any)[name as keyof TControl]
670 │       : null;
671 │   }
672 │ }
673 │ 
674 │ /**
675 ▶  * Will validate that none of the controls has a key with a dot
676 ▶  * Throws other wise
677 │  */
678 │ function validateFormGroupControls<TControl>(controls: {
679 │   [K in keyof TControl]: AbstractControl<any, any>;
680 │ }) {
681 ▶   const invalidKeys = Object.keys(controls).filter((key) => key.includes('.'));
682 │   if (invalidKeys.length > 0) {
683 ▶     // TODO: make this an error once there are no more uses in G3
684 ▶     console.warn(
685 ▶       `FormGroup keys cannot include \`.\`, please replace the keys for: ${invalidKeys.join(',')}.`,
686 │     );
687 │   }
688 │ }
```

668 行目の `_find` は `Object.hasOwn` で、`get` のパスの 1 段ずつに呼ばれます（[前の章](01-fmd-abstract-model.md)の 12 節）。`get` は `'.'` で割るので、キーに `'.'` を含む control は文字列のパスでは取れません。676 行目のコメントは「Throws other wise」ですが、684 行目は `console.warn` で、683 行目の TODO のとおり例外にはしていません。呼ぶのはコンストラクターの `ngDevMode` の後ろ（L215）だけなので、本番では何も出ません。開発モードの文は[第 5 回](05-fmd-errors.md)の記録にあります。

📄 `angular/packages/forms/src/model/form_group.ts` L711–741 （▶ の行: 713, 719, 725–726, 733–735）

````ts
711 │ /**
712 │  * @description
713 ▶  * Asserts that the given control is an instance of `FormGroup`
714 │  *
715 │  * @see [Utility functions for narrowing form control types](guide/forms/reactive-forms#utility-functions-for-narrowing-form-control-types)
716 │  *
717 │  * @publicApi
718 │  */
719 ▶ export const isFormGroup = (control: unknown): control is FormGroup => control instanceof FormGroup;
720 │ 
721 │ /**
722 │  * Tracks the value and validity state of a collection of `FormControl` instances, each of which has
723 │  * the same value type.
724 │  *
725 ▶  * `FormRecord` is very similar to {@link FormGroup}, except it can be used with a dynamic keys,
726 ▶  * with controls added and removed as needed.
727 │  *
728 │  * `FormRecord` accepts one generic argument, which describes the type of the controls it contains.
729 │  *
730 │  * @usageNotes
731 │  *
732 │  * ```ts
733 ▶  * let numbers = new FormRecord({bill: new FormControl('415-123-456')});
734 ▶  * numbers.addControl('bob', new FormControl('415-234-567'));
735 ▶  * numbers.removeControl('bill');
736 │  * ```
737 │  *
738 │  * @see [FormGroup and FormRecord](guide/forms/typed-forms#formgroup-and-formrecord)
739 │  *
740 │  * @publicApi
741 │  */
````

713 行目は「Asserts that …」ですが、719 行目は `instanceof` を返す型の絞り込み（type guard）で、違っても例外は投げません。`isFormArray`・`isFormControl`・`isFormRecord` も同じ書き方です。733〜735 行目の例は DEMO のとおり `{bob: '415-234-567'}` になります。

📄 `angular/packages/forms/src/model/form_group.ts` L811–842 （▶ の行: 812–813, 815, 818）

```ts
811 │   /**
812 ▶    * Resets the `FormRecord`, marks all descendants `pristine` and `untouched` and sets
813 ▶    * the value of all descendants to null.
814 │    *
815 ▶    * See `FormGroup#reset` for additional information.
816 │    */
817 │   reset(
818 ▶     value?: {[key: string]: ɵValue<TControl> | FormControlState<ɵValue<TControl>>},
819 │     options?: {
820 │       onlySelf?: boolean;
821 │       emitEvent?: boolean;
822 │     },
823 │   ): void;
824 │ 
825 │   /**
826 │    * The aggregate value of the `FormRecord`, including any disabled controls.
827 │    *
828 │    * See `FormGroup#getRawValue` for additional information.
829 │    */
830 │   getRawValue(): {[key: string]: ɵRawValue<TControl>};
831 │ }
832 │ 
833 │ /**
834 │  * @description
835 │  * Asserts that the given control is an instance of `FormRecord`
836 │  *
837 │  * @see [Utility functions for narrowing form control types](guide/forms/reactive-forms#utility-functions-for-narrowing-form-control-types)
838 │  *
839 │  * @publicApi
840 │  */
841 │ export const isFormRecord = (control: unknown): control is FormRecord =>
842 │   control instanceof FormRecord;
```

812〜813 行目は `FormRecord.reset` を「全部の子を null に」と書きます。`FormRecord` は `FormGroup` を継いだだけのクラス（L742〜744）で、`reset` は `FormGroup.reset` そのものです。子が `nonNullable` なら、815 行目が指す `FormGroup#reset` の 507〜508 行目どおり既定の値に戻ります。DEMO では `{x: 'X'}` でした。

## 6. FormArray の説明と例

📄 `angular/packages/forms/src/model/form_array.ts` L51–80 （▶ の行: 56–58, 60, 76–77）

````ts
51 │ /**
52 │  * Tracks the value and validity state of an array of `FormControl`,
53 │  * `FormGroup` or `FormArray` instances.
54 │  *
55 │  * A `FormArray` aggregates the values of each child `FormControl` into an array.
56 ▶  * It calculates its status by reducing the status values of its children. For example, if one of
57 ▶  * the controls in a `FormArray` is invalid, the entire array becomes invalid. Similarly, if all
58 ▶  * controls in a `FormArray` are disabled, the entire array becomes disabled.
59 │  *
60 ▶  * `FormArray` accepts one generic argument, which is the type of the controls inside.
61 │  * If you need a heterogenous array, use {@link UntypedFormArray}.
62 │  *
63 │  * `FormArray` is one of the four fundamental building blocks used to define forms in Angular,
64 │  * along with `FormControl`, `FormGroup`, and `FormRecord`.
65 │  *
66 │  * @usageNotes
67 │  *
68 │  * ### Create an array of form controls
69 │  *
70 │  * ```ts
71 │  * const arr = new FormArray([
72 │  *   new FormControl('Nancy', Validators.minLength(2)),
73 │  *   new FormControl('Drew'),
74 │  * ]);
75 │  *
76 ▶  * console.log(arr.value);   // ['Nancy', 'Drew']
77 ▶  * console.log(arr.status);  // 'VALID'
78 │  * ```
79 │  *
80 │  * ### Create a form array with array-level validators
````

📄 `angular/packages/forms/src/model/form_array.ts` L81–115 （▶ の行: 87–88, 111–115）

````ts
 81 │  *
 82 │  * You include array-level validators and async validators. These come in handy
 83 │  * when you want to perform validation that considers the value of more than one child
 84 │  * control.
 85 │  *
 86 │  * The two types of validators are passed in separately as the second and third arg
 87 ▶  * respectively, or together as part of an options object.
 88 ▶  *
 89 │  * ```ts
 90 │  * const arr = new FormArray([
 91 │  *   new FormControl('Nancy'),
 92 │  *   new FormControl('Drew')
 93 │  * ], {validators: myValidator, asyncValidators: myAsyncValidator});
 94 │  * ```
 95 │  *
 96 │  * ### Set the updateOn property for all controls in a form array
 97 │  *
 98 │  * The options object is used to set a default value for each child
 99 │  * control's `updateOn` property. If you set `updateOn` to `'blur'` at the
100 │  * array level, all child controls default to 'blur', unless the child
101 │  * has explicitly specified a different `updateOn` value.
102 │  *
103 │  * ```ts
104 │  * const arr = new FormArray([
105 │  *    new FormControl()
106 │  * ], {updateOn: 'blur'});
107 │  * ```
108 │  *
109 │  * ### Adding or removing controls from a form array
110 │  *
111 ▶  * To change the controls in the array, use the `push`, `insert`, `removeAt` or `clear` methods
112 ▶  * in `FormArray` itself. These methods ensure the controls are properly tracked in the
113 ▶  * form's hierarchy. Do not modify the array of `AbstractControl`s used to instantiate
114 ▶  * the `FormArray` directly, as that result in strange and unexpected behavior such
115 ▶  * as broken change detection.
````

113〜115 行目は「作るときに渡した配列を直接いじるな」です。コンストラクター（L139〜157）は `this.controls = controls` で配列を写さずに持つので、DEMO では `arr.controls === list` が `true` で、`list.push(…)` のあと `length` は 2 なのに `value` は `['a']` のままでした。足した control には親も無く、値の計算もやり直されません。

## 7. 添字：at・insert・removeAt・setControl

📄 `angular/packages/forms/src/model/form_array.ts` L159–170 （▶ の行: 164–166, 169）

```ts
159 │   public controls: ɵTypedOrUntyped<TControl, Array<TControl>, Array<AbstractControl<any>>>;
160 │ 
161 │   /**
162 │    * Get the `AbstractControl` at the given `index` in the array.
163 │    *
164 ▶    * @param index Index in the array to retrieve the control. If `index` is negative, it will wrap
165 ▶    *     around from the back, and if index is greatly negative (less than `-length`), the result is
166 ▶    * undefined. This behavior is the same as `Array.at(index)`.
167 │    */
168 │   at(index: number): ɵTypedOrUntyped<TControl, TControl, AbstractControl<any>> {
169 ▶     return (this.controls as any)[this._adjustIndex(index)];
170 │   }
```

📄 `angular/packages/forms/src/model/form_array.ts` L197–212 （▶ の行: 201–203, 211）

```ts
197 │ 
198 │   /**
199 │    * Insert a new `AbstractControl` at the given `index` in the array.
200 │    *
201 ▶    * @param index Index in the array to insert the control. If `index` is negative, wraps around
202 ▶    *     from the back. If `index` is greatly negative (less than `-length`), prepends to the array.
203 ▶    * This behavior is the same as `Array.splice(index, 0, control)`.
204 │    * @param control Form control to be inserted
205 │    * @param options Specifies whether this FormArray instance should emit events after a new
206 │    *     control is inserted.
207 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
208 │    * `valueChanges` observables emit events with the latest status and value when the control is
209 │    * inserted. When false, no events are emitted.
210 │    *
211 ▶    * NOTE: Inserting to the FormArray will not mark it dirty. If you want to mark if dirty, call `markAsDirty()`.
212 │    */
```

📄 `angular/packages/forms/src/model/form_array.ts` L245–277 （▶ の行: 248–250, 260–261, 273）

```ts
245 │   /**
246 │    * Replace an existing control.
247 │    *
248 ▶    * @param index Index in the array to replace the control. If `index` is negative, wraps around
249 ▶    *     from the back. If `index` is greatly negative (less than `-length`), replaces the first
250 ▶    *     element. This behavior is the same as `Array.splice(index, 1, control)`.
251 │    * @param control The `AbstractControl` control to replace the existing control
252 │    * @param options Specifies whether this FormArray instance should emit events after an
253 │    *     existing control is replaced with a new one.
254 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
255 │    * `valueChanges` observables emit events with the latest status and value when the control is
256 │    * replaced with a new one. When false, no events are emitted.
257 │    */
258 │   setControl(index: number, control: TControl, options: {emitEvent?: boolean} = {}): void {
259 │     // Adjust the index, then clamp it at no less than 0 to prevent undesired underflows.
260 ▶     let adjustedIndex = this._adjustIndex(index);
261 ▶     if (adjustedIndex < 0) adjustedIndex = 0;
262 │ 
263 │     if (this.controls[adjustedIndex])
264 │       this.controls[adjustedIndex]._registerOnCollectionChange(() => {});
265 │     this.controls.splice(adjustedIndex, 1);
266 │ 
267 │     if (control) {
268 │       this.controls.splice(adjustedIndex, 0, control);
269 │       this._registerControl(control);
270 │     }
271 │ 
272 │     this.updateValueAndValidity({emitEvent: options.emitEvent});
273 ▶     this._onCollectionChange();
274 │   }
275 │ 
276 │   /**
277 │    * Length of the control array.
```

負の添字は `_adjustIndex`（L510〜512、[FormGroup と FormArray の章](../forms/07-forms-form-group-array.md)）が `index + length` にするだけで、`removeAt` と `setControl` は 261 行目のように 0 で止めます。`insert` は 203 行目のとおり `Array.splice(index, 0, control)` にそのまま渡します。DEMO では 6 通りとも、説明が「同じ」と書く `Array.prototype.splice` と同じ並びになりました。

| \['a', 'b', 'c'\] に | 本物 | 説明 |
| --- | --- | --- |
| `at(-1)` / `at(-4)` | `'c'` / `undefined` | 164〜166 行目のとおり |
| `insert(-10, x)` | `[x, a, b, c]` | 202 行目「先頭に足す」 |
| `removeAt(-10)` / `removeAt(10)` | `[b, c]` / そのまま | L224〜225「先頭を外す」。範囲外の正の数は書いていない |
| `setControl(-10, x)` | `[x, b, c]` | 249〜250 行目「先頭を置き換える」 |

273 行目の `_onCollectionChange()` は `push`（L195）と `setControl` だけが呼び、`insert`・`removeAt`・`clear` は呼びません。`FormGroup` は足し外しの 3 つとも呼びます（L296・L331・L374）。この差は意図したもので、b4cd27979b1（2018-01-26、#21822「inserting and removing controls should work in re-bound form arrays」）が `insert` と `removeAt` から外しました。`_onCollectionChange` の先で何が起きるか（`[formGroup]` の `_updateDomValue`）は[リアクティブのディレクティブの章](../forms/12-forms-reactive-directives.md)の 7 節です。211 行目と 182 行目の「足しても dirty にしない」は合います。

## 8. FormArray の setValue・patchValue・reset・clear

📄 `angular/packages/forms/src/model/form_array.ts` L283–317 （▶ の行: 287–289, 299, 302）

````ts
283 │   /**
284 │    * Sets the value of the `FormArray`. It accepts an array that matches
285 │    * the structure of the control.
286 │    *
287 ▶    * This method performs strict checks, and throws an error if you try
288 ▶    * to set the value of a control that doesn't exist or if you exclude the
289 ▶    * value of a control.
290 │    *
291 │    * @usageNotes
292 │    * ### Set the values for the controls in the form array
293 │    *
294 │    * ```ts
295 │    * const arr = new FormArray([
296 │    *   new FormControl(),
297 │    *   new FormControl()
298 │    * ]);
299 ▶    * console.log(arr.value);   // [null, null]
300 │    *
301 │    * arr.setValue(['Nancy', 'Drew']);
302 ▶    * console.log(arr.value);   // ['Nancy', 'Drew']
303 │    * ```
304 │    *
305 │    * @param value Array of values for the controls
306 │    * @param options Configure options that determine how the control propagates changes and
307 │    * emits events after the value changes
308 │    *
309 │    * * `onlySelf`: When true, each change only affects this control, and not its parent. Default
310 │    * is false.
311 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
312 │    * `valueChanges`
313 │    * observables emit events with the latest status and value when the control value is updated.
314 │    * When false, no events are emitted.
315 │    * The configuration options are passed to the {@link AbstractControl#updateValueAndValidity
316 │    * updateValueAndValidity} method.
317 │    */
````

📄 `angular/packages/forms/src/model/form_array.ts` L335–367 （▶ の行: 340, 350, 353）

````ts
335 │   /**
336 │    * Patches the value of the `FormArray`. It accepts an array that matches the
337 │    * structure of the control, and does its best to match the values to the correct
338 │    * controls in the group.
339 │    *
340 ▶    * It accepts both super-sets and sub-sets of the array without throwing an error.
341 │    *
342 │    * @usageNotes
343 │    * ### Patch the values for controls in a form array
344 │    *
345 │    * ```ts
346 │    * const arr = new FormArray([
347 │    *    new FormControl(),
348 │    *    new FormControl()
349 │    * ]);
350 ▶    * console.log(arr.value);   // [null, null]
351 │    *
352 │    * arr.patchValue(['Nancy']);
353 ▶    * console.log(arr.value);   // ['Nancy', null]
354 │    * ```
355 │    *
356 │    * @param value Array of latest values for the controls
357 │    * @param options Configure options that determine how the control propagates changes and
358 │    * emits events after the value changes
359 │    *
360 │    * * `onlySelf`: When true, each change only affects this control, and not its parent. Default
361 │    * is false.
362 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
363 │    * `valueChanges` observables emit events with the latest status and value when the control
364 │    * value is updated. When false, no events are emitted. The configuration options are passed to
365 │    * the {@link AbstractControl#updateValueAndValidity updateValueAndValidity} method.
366 │    */
367 │   override patchValue(
````

📄 `angular/packages/forms/src/model/form_array.ts` L388–420 （▶ の行: 389–390, 404, 406, 412–413, 417–418）

````ts
388 │   /**
389 ▶    * Resets the `FormArray` and all descendants are marked `pristine` and `untouched`, and the
390 ▶    * value of all descendants to null or null maps.
391 │    *
392 │    * You reset to a specific form state by passing in an array of states
393 │    * that matches the structure of the control. The state is a standalone value
394 │    * or a form state object with both a value and a disabled status.
395 │    *
396 │    * @usageNotes
397 │    * ### Reset the values in a form array
398 │    *
399 │    * ```ts
400 │    * const arr = new FormArray([
401 │    *    new FormControl(),
402 │    *    new FormControl()
403 │    * ]);
404 ▶    * arr.reset(['name', 'last name']);
405 │    *
406 ▶    * console.log(arr.value);  // ['name', 'last name']
407 │    * ```
408 │    *
409 │    * ### Reset the values in a form array and the disabled status for the first control
410 │    *
411 │    * ```ts
412 ▶    * arr.reset([
413 ▶    *   {value: 'name', disabled: true},
414 │    *   'last'
415 │    * ]);
416 │    *
417 ▶    * console.log(arr.value);  // ['last']
418 ▶    * console.log(arr.at(0).status);  // 'DISABLED'
419 │    * ```
420 │    *
````

📄 `angular/packages/forms/src/model/form_array.ts` L421–452 （▶ の行: 435, 442–443）

```ts
421 │    * @param value Array of values for the controls
422 │    * @param options Configure options that determine how the control propagates changes and
423 │    * emits events after the value changes
424 │    *
425 │    * * `onlySelf`: When true, each change only affects this control, and not its parent. Default
426 │    * is false.
427 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
428 │    * `valueChanges`
429 │    * observables emit events with the latest status and value when the control is reset.
430 │    * When false, no events are emitted.
431 │    * The configuration options are passed to the {@link AbstractControl#updateValueAndValidity
432 │    * updateValueAndValidity} method.
433 │    */
434 │   override reset(
435 ▶     value: ɵTypedOrUntyped<TControl, ɵFormArrayValue<TControl>, any> = [],
436 │     options: {
437 │       onlySelf?: boolean;
438 │       emitEvent?: boolean;
439 │       overwriteDefaultValue?: boolean;
440 │     } = {},
441 │   ): void {
442 ▶     this._forEachChild((control: AbstractControl, index: number) => {
443 ▶       control.reset(value[index], {...options, onlySelf: true});
444 │     });
445 │     this._updatePristine(options, this);
446 │     this._updateTouched(options, this);
447 │     this.updateValueAndValidity(options);
448 │     if (options?.emitEvent !== false) {
449 │       this._events.next(new FormResetEvent(this));
450 │     }
451 │   }
452 │ 
```

例はどれも書いてあるとおりに動きます（`['Nancy', null]` → `['name', 'last name']` → `['last']` と `at(0)` は `DISABLED`）。412 行目の 2 つ目の例は、前の例の `arr` を使い回す前提です。389〜390 行目は「子を null か null の map にする」と書きますが、442〜443 行目は子の `reset(value[index], …)` を呼ぶだけで、値を渡さなければ子の `reset` の既定の引数（`defaultValue`、[次の章](03-fmd-control-builder.md)）になります。子が `nonNullable` の DEMO では `['A']` でした。`FormRecord` の 812〜813 行目と同じ食い違いで、`FormGroup`（507〜508 行目）だけが今の振る舞いを書いています。

📄 `angular/packages/forms/src/model/form_array.ts` L462–497 （▶ の行: 467–469, 481, 485, 493–494）

````ts
462 │   /**
463 │    * Remove all controls in the `FormArray`.
464 │    *
465 │    * @param options Specifies whether this FormArray instance should emit events after all
466 │    *     controls are removed.
467 ▶    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
468 ▶    * `valueChanges` observables emit events with the latest status and value when all controls
469 ▶    * in this FormArray instance are removed. When false, no events are emitted.
470 │    *
471 │    * @usageNotes
472 │    * ### Remove all elements from a FormArray
473 │    *
474 │    * ```ts
475 │    * const arr = new FormArray([
476 │    *    new FormControl(),
477 │    *    new FormControl()
478 │    * ]);
479 │    * console.log(arr.length);  // 2
480 │    *
481 ▶    * arr.clear();
482 │    * console.log(arr.length);  // 0
483 │    * ```
484 │    *
485 ▶    * It's a simpler and more efficient alternative to removing all elements one by one:
486 │    *
487 │    * ```ts
488 │    * const arr = new FormArray([
489 │    *    new FormControl(),
490 │    *    new FormControl()
491 │    * ]);
492 │    *
493 ▶    * while (arr.length) {
494 ▶    *    arr.removeAt(0);
495 │    * }
496 │    * ```
497 │    */
````

467〜469 行目のとおり `clear()` で `valueChanges` は 1 回出ます。実装の最初の行（L499）が `if (this.controls.length < 1) return;` なので、空の配列の `clear()` では何も出ません（DEMO の `2 回（空なら出ない）`）。

📄 `angular/packages/forms/src/model/form_array.ts` L559–597 （▶ の行: 561–562, 592, 597）

```ts
559 │ 
560 │   /** @internal */
561 ▶   override _find(name: string | number): AbstractControl | null {
562 ▶     return this.at(name as number) ?? null;
563 │   }
564 │ }
565 │ 
566 │ interface UntypedFormArrayCtor {
567 │   new (
568 │     controls: AbstractControl[],
569 │     validatorOrOpts?: ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
570 │     asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
571 │   ): UntypedFormArray;
572 │ 
573 │   /**
574 │    * The presence of an explicit `prototype` property provides backwards-compatibility for apps that
575 │    * manually inspect the prototype chain.
576 │    */
577 │   prototype: FormArray<any>;
578 │ }
579 │ 
580 │ /**
581 │  * UntypedFormArray is a non-strongly-typed version of `FormArray`, which
582 │  * permits heterogenous controls.
583 │  */
584 │ export type UntypedFormArray = FormArray<any>;
585 │ 
586 │ export const UntypedFormArray: UntypedFormArrayCtor = FormArray;
587 │ 
588 │ /**
589 │  * @description
590 │  * Asserts that the given control is an instance of `FormArray`
591 │  *
592 ▶  * @see [Utility functions for narrowing form control types](guide/forms/reactive-forms#utility-functions-for-narrowing-form-control-types)
593 │  *
594 │  * @publicApi
595 │  */
596 │ export const isFormArray = (control: unknown): control is FormArray => control instanceof FormArray;
597 ▶ 
```

562 行目の `_find` は `at(name as number)` です。`get('items.0')` の `'0'` は文字列のまま来ても `controls['0']` で取れますが、`'-1'` は取れません（[前の章](01-fmd-abstract-model.md)の 12 節）。

> **🧪 DEMO — 説明文の例と約束を本物の FormGroup・FormRecord・FormArray で**
>
> 押すと、本物の `@angular/forms`（22.2.6）で、行ごとに新しい control を作ります。例は strict に通る形に直したもので、直した所は「操作」の列に書いています。合わない行を赤くします。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-group-array)

## ここまでの呼び出し

- 👤 `inner.patchValue({first: 'x'})` — form\_group.ts L480 — *opts は {}*
  - `first.patchValue('x', {onlySelf: true})` — L495〜500 — *子は onlySelf: true で呼ぶ*
  - `this.updateValueAndValidity({})` — L503 — *onlySelf が無いので親へ進む（473〜474 行目の「既定 true」と逆）*
- 👤 `arr.reset()` — form\_array.ts L434
  - `control.reset(value[index] /* undefined */, …)` — L442〜443
    - `FormControl.reset(formState = this.defaultValue)` — form\_control.ts L531〜532 — *nonNullable なら最初の値に戻る*

## テストと直し方

| ファイル（packages/forms/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `form_group_spec.ts` | `patchValue`（486）› `should set parent values`（526）・`should not update the parent when explicitly specified`（532） | opts なしなら親も更新（473〜474 行目の「既定 true」と逆の事実） |
| `form_group_spec.ts` | `reset() events`（822）› `should reset default value when resetting`（889） | group の reset が子の既定の値に戻すこと |
| `form_array_spec.ts` | `negative indices`（1490）の下の at・setControl・removeAt・insert | 164〜166・202・249〜250 行目と L224〜225 |
| `form_group_spec.ts` | `contains`（906）・`adding and removing controls`（240） | 380〜381・261 行目 |
| （なし） | — | `FormArray`・`FormRecord` の `reset` で `nonNullable` の子が既定の値に戻ること |

📄 `走らせたコマンド（2026-11-21、../angular の 8576f161ae4）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/forms/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
--filter=adding and removing controls  Ran 5 of 1153 specs、0 failures
--filter=patchValue                    Ran 41 of 1153 specs、0 failures
--filter=negative indices              Ran 22 of 1153 specs、0 failures
--filter=contains                      Ran 10 of 1153 specs、0 failures
--filter=FormRecord                    Ran 18 of 1153 specs、0 failures
--filter=FormArray reset()             Ran 22 of 1153 specs、0 failures

# 説明文の例をそのまま貼って型検査（サイトの TypeScript 6.0.3、--strict）
$ tsc --strict --noEmit ex-ga.ts
ex-ga.ts(31,3): error TS1005: ',' expected.                      # form_group.ts L151
$ tsc --strict --noEmit ex-ga-comma.ts                            # カンマだけ足した版
ex-ga-comma.ts(21,4): error TS2345: Argument of type '(g: FormGroup<any>) => …' is not assignable … 'ValidatorFn'.   # L137
ex-ga-comma.ts(25,11): error TS2531: Object is possibly 'null'.   # L141 の 1 つ目
ex-ga-comma.ts(25,39): error TS2531: Object is possibly 'null'.   # L141 の 2 つ目
ex-ga-comma.ts(32,4): error TS2345: … Types of property 'validators' are incompatible.   # L153
ex-ga-comma.ts(39,3): error TS2322: Type 'FormControl<string | null>' is not assignable to type 'FormControl<string>'.   # L177
ex-ga-comma.ts(52,13): error TS2531: Object is possibly 'null'.   # L560
$ tsc --strict --noEmit ex-ga2.ts                                 # L176 を nonNullable にして c.value.one の型を見る
ex-ga2.ts(7,7): error TS2322: Type 'null' is not assignable to type 'string | undefined'.
```

直すとしたら説明文です。form\_group.ts の 103 行目（`last:`）、137〜141 行目（`(g: AbstractControl)` と `?.`）、151 行目のカンマ、176 行目の型（`FormControl<string | null>`）、473〜474 行目（既定 false）、560 行目の `?.`、676 行目（警告する）、812〜813 行目（既定の値、無ければ null）と、form\_array.ts の 389〜390 行目（同じ）です。`FormArray`・`FormRecord` の reset を固めるなら、`form_array_spec.ts` の `reset()`（578）に、form\_group\_spec.ts L889 と同じ形の it を足します。

## 聞かれそうな質問

**Q. `patchValue` は親に変更を伝えますか？**

伝えます。opts を省くと `onlySelf` は無いので、`updateValueAndValidity` が親へ進みます（form\_group.ts L503）。説明文の 473〜474 行目「既定 true」は誤りで、spec（L526）は伝わるほうを固めています。

**Q. `FormArray` を `reset()` すると、`nonNullable` の子は null になりますか？**

なりません。子の `reset` に `undefined` を渡すだけなので、子の既定の値（最初の値）に戻ります（L442〜443）。389〜390 行目と `FormRecord` の 812〜813 行目は null と書きます。

**Q. `addControl` で同じ名前を渡すと何が起きますか？**

置き換えず、元の control が残ります（261 行目）。それでも group の `updateValueAndValidity` は走るので `valueChanges` は出ます。置き換えるなら `setControl` です。

**Q. `new FormArray(list)` のあと `list.push(c)` したらどうなりますか？**

同じ配列なので `arr.length` は増えますが、`c` には親が付かず、値も計算し直されません（113〜115 行目）。`arr.push(c)` を使います。

**Q. `insert` と `push` で何か違いはありますか？**

位置のほかに、`push` は `_onCollectionChange()` を呼び、`insert` は呼びません。2018 年の b4cd27979b1 で `insert`・`removeAt` から意図して外されたものです。

## 読み終えて

- `FormGroup` の説明の例 4 つのうち 3 つ（検証関数の 2 つ、省ける control）は strict の TypeScript にそのままでは通らない。
- `patchValue` の `onlySelf` の既定は実装も spec も `false` で、説明文の「true」だけが違う。
- `FormArray` と `FormRecord` の `reset` は「null にする」と書くが、実際は子の既定の値に戻す。
- 負の添字は 6 通りとも `Array.splice` と同じ並びになり、説明と合う。
- 作るときに渡した配列は写されずにそのまま `controls` になる。だから直接いじってはいけない。

---

← 前: [AbstractControl の説明文：値・状態・イベントの約束](01-fmd-abstract-model.md)  
次: [FormControl と FormBuilder の説明文](03-fmd-control-builder.md) →
