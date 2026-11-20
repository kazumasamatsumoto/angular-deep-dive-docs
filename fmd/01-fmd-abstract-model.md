[目次](../README.md) › [Forms の説明文の読み残し](README.md) › 第 1 回 / 全 10 回

# AbstractControl の説明文：値・状態・イベントの約束

> model/abstract\_model.ts の未読の行：status の 4 つの値と各フラグ、validator の getter、events・valueChanges の順番の約束、markAs\*・disable・enable の onlySelf と emitEvent、get のパスの形、getError と hasError、setErrors の例。説明に書かれた約束を本物で確かめる。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-abstract-model)

---

`AbstractControl` は `FormControl`・`FormGroup`・`FormArray` の共通の親で、その説明文（JSDoc）は angular.dev の API リファレンスにそのまま載ります。この章は、まだどの章も引いていない説明文の段落を 1 つずつ読み、そこに書かれた約束（`onlySelf`・`emitEvent`・各フラグ・`get` のパス・`getError` の戻り値・`events` の順番）を本物の control で確かめます。合わない所は表に残します。

読む対象は `packages/forms/src/model/abstract_model.ts`（../angular、8576f161ae4）です。中の処理の流れ（signal で持つ状態、`updateValueAndValidity` の全行、イベントがどこで `next` されるか）は [AbstractControl の章](../forms/02-forms-abstract-control.md)・[updateValueAndValidity の章](../forms/03-forms-update-value-validity.md)・[events の章](../forms/06-forms-control-events.md)にあるので、ここでは繰り返さず行番号で指します。

1. **1. AbstractControl**（この章）
2. [2. FormGroup・FormRecord・FormArray](02-fmd-group-array.md)
3. [3. FormControl と FormBuilder](03-fmd-control-builder.md)
4. [4. Validators](04-fmd-validators.md)
5. [5. エラーの文言と小道具](05-fmd-errors.md)
6. [6. NgControl](06-fmd-ng-control.md)
7. [7. リアクティブのディレクティブ](07-fmd-reactive-dirs.md)
8. [8. テンプレート駆動のディレクティブ](08-fmd-template-dirs.md)
9. [9. 値のアクセサー](09-fmd-accessors.md)
10. [10. spec と issue](10-fmd-tests-issues.md)

## 1. status の 4 つの値と、その説明

📄 `angular/packages/forms/src/model/abstract_model.ts` L39–70 （▶ の行: 44, 51, 57, 60, 63–64, 66, 69）

```ts
39 │ /**
40 │  * Reports that a control is valid, meaning that no errors exist in the input value.
41 │  *
42 │  * @see {@link status}
43 │  */
44 ▶ export const VALID = 'VALID';
45 │ 
46 │ /**
47 │  * Reports that a control is invalid, meaning that an error exists in the input value.
48 │  *
49 │  * @see {@link status}
50 │  */
51 ▶ export const INVALID = 'INVALID';
52 │ 
53 │ /**
54 │  * Reports that a control is pending, meaning that async validation is occurring and
55 │  * errors are not yet available for the input value.
56 │  *
57 ▶  * @see {@link markAsPending}
58 │  * @see {@link status}
59 │  */
60 ▶ export const PENDING = 'PENDING';
61 │ 
62 │ /**
63 ▶  * Reports that a control is disabled, meaning that the control is exempt from ancestor
64 ▶  * calculations of validity or value.
65 │  *
66 ▶  * @see {@link markAsDisabled}
67 │  * @see {@link status}
68 │  */
69 ▶ export const DISABLED = 'DISABLED';
70 │ 
```

44・51・60・69 行目の 4 つの文字列が `status` の値です。63〜64 行目は「DISABLED の control は祖先の検証と値の計算から外れる」と約束します。DEMO の 2 行目のとおり、`{a: required(''), b: 'x'}` の group は `a.disable()` で `VALID` になり、値から `a` が消えます。全部を無効にすると group 自身が `DISABLED` になり、そのときだけ値に全部が戻ります（`_reduceValue` の `control.enabled || this.disabled`、[FormGroup の章](../forms/07-forms-form-group-array.md)の 3 節）。

66 行目の `@see {@link markAsDisabled}` は、どこにも無い名前を指しています。`packages/forms/src` を grep しても `markAsDisabled` はこの 1 行だけで、無効にするメソッドは `disable()` です。60 行目の `PENDING` の説明が 57 行目で指す `markAsPending` は実在します。66 行目は 9d114c052a3（2018-06-07、#24255）で入り、origin/main でも同じです。

## 2. 型の説明：Value と RawValue

📄 `angular/packages/forms/src/model/abstract_model.ts` L331–359 （▶ の行: 335, 339, 342, 356, 358）

````ts
331 │  * the values as follows:
332 │  *
333 │  * ```ts
334 │  * interface PartyFormControls {
335 ▶  *   address: FormControl<string>;
336 │  * }
337 │  *
338 │  * // Value operates on controls; the object must be wrapped in a FormGroup.
339 ▶  * type PartyFormValues = Value<FormGroup<PartyFormControls>>;
340 │  * ```
341 │  *
342 ▶  * The resulting type is `{address: string|undefined}`.
343 │  *
344 │  * ### `FormArray` value type
345 │  *
346 │  * You can extract values from FormArrays as well:
347 │  *
348 │  * ```ts
349 │  * type GuestNamesControls = FormArray<FormControl<string>>;
350 │  *
351 │  * type NamesValues = Value<GuestNamesControls>;
352 │  * ```
353 │  *
354 │  * The resulting type is `string[]`.
355 │  *
356 ▶  * **Internal: not for public use.**
357 │  */
358 ▶ export type ɵValue<T extends AbstractControl | undefined> =
359 │   T extends AbstractControl<any, any> ? T['value'] : never;
````

342 行目は `Value<FormGroup<{address: FormControl<string>}>>` を「`{address: string|undefined}`」と書きます。実際の型は `ɵFormGroupValue` の `Partial<…>` で、`{address?: string}`（キーごと省ける）です。strict の tsc で `const v: PartyFormValues = {}` が通り、`RawValue` のほうは同じ代入が `TS2741: Property 'address' is missing` になります（テストの節）。この型は名前に `ɵ` が付いた内部用（356 行目の「Internal: not for public use」、358 行目の `ɵValue`）で、説明文の中でも `Value`・`RawValue` と `ɵ` を落として書いています。`FormGroup` の値が `Partial` になる理由は[型付きフォームの章](../forms/08-forms-typed-forms.md)の 4 節です。

## 3. validator と asyncValidator の getter

📄 `angular/packages/forms/src/model/abstract_model.ts` L579–602 （▶ の行: 581–582, 588, 594–595, 601）

```ts
579 │   /**
580 │    * Returns the function that is used to determine the validity of this control synchronously.
581 ▶    * If multiple validators have been added, this will be a single composed function.
582 ▶    * See `Validators.compose()` for additional information.
583 │    */
584 │   get validator(): ValidatorFn | null {
585 │     return this._composedValidatorFn;
586 │   }
587 │   set validator(validatorFn: ValidatorFn | null) {
588 ▶     this._rawValidators = this._composedValidatorFn = validatorFn;
589 │     this._updateHasRequiredValidator();
590 │   }
591 │ 
592 │   /**
593 │    * Returns the function that is used to determine the validity of this control asynchronously.
594 ▶    * If multiple validators have been added, this will be a single composed function.
595 ▶    * See `Validators.compose()` for additional information.
596 │    */
597 │   get asyncValidator(): AsyncValidatorFn | null {
598 │     return this._composedAsyncValidatorFn;
599 │   }
600 │   set asyncValidator(asyncValidatorFn: AsyncValidatorFn | null) {
601 ▶     this._rawAsyncValidators = this._composedAsyncValidatorFn = asyncValidatorFn;
602 │   }
```

595 行目は非同期の getter なのに「`Validators.compose()` を見よ」と書きます。複数の非同期の検証関数をまとめるのは `Validators.composeAsync()`（[第 4 回](04-fmd-validators.md)）で、`_assignAsyncValidators` が呼ぶのも `coerceToAsyncValidator` → `composeAsyncValidators` です。582 行目をそのまま写した形で、1d9d02696ea（2021-07-12、#42838）からこの文です。588 行目と 601 行目の setter は、渡した関数を「元の並び（`_rawValidators`）」と「まとめた関数」の両方にそのまま入れます。`control.validator = fn` のあとの `hasValidator(fn)` が `true` になるのはこのためです。

## 4. disabled と enabled

📄 `angular/packages/forms/src/model/abstract_model.ts` L665–691 （▶ の行: 668–670, 677, 690）

```ts
665 │   /**
666 │    * A control is `disabled` when its `status` is `DISABLED`.
667 │    *
668 ▶    * Disabled controls are exempt from validation checks and
669 ▶    * are not included in the aggregate value of their ancestor
670 ▶    * controls.
671 │    *
672 │    * @see {@link AbstractControl.status}
673 │    *
674 │    * @returns True if the control is disabled, false otherwise.
675 │    */
676 │   get disabled(): boolean {
677 ▶     return this.status === DISABLED;
678 │   }
679 │ 
680 │   /**
681 │    * A control is `enabled` as long as its `status` is not `DISABLED`.
682 │    *
683 │    * @returns True if the control has any status other than 'DISABLED',
684 │    * false if the status is 'DISABLED'.
685 │    *
686 │    * @see {@link AbstractControl.status}
687 │    *
688 │    */
689 │   get enabled(): boolean {
690 ▶     return this.status !== DISABLED;
691 │   }
```

668〜670 行目は 63〜64 行目と同じ約束で、677 行目と 690 行目は `status` を比べるだけです。`pristine`・`touched` の説明（L699〜755）は[AbstractControl の章](../forms/02-forms-abstract-control.md)が引いています。その L703〜704「プログラムからの値の変更では dirty にならない」は DEMO の 3 行目で確かめられます（`setValue('b')` のあとも `pristine=true`）。

## 5. events・valueChanges・statusChanges の順番の約束

📄 `angular/packages/forms/src/model/abstract_model.ts` L767–787 （▶ の行: 769, 776–778, 780–781）

```ts
767 │    * of this event might result in getting a value that has not been updated yet. Subscribe to the
768 │    * `events` of the parent control instead.
769 ▶    * For other event types, the events are emitted after the parent control has been updated.
770 │    *
771 │    * @see [Unified control state change events](guide/forms/reactive-forms#unified-control-state-change-events)
772 │    */
773 │   public readonly events = this._events.asObservable();
774 │ 
775 │   /**
776 ▶    * A multicasting observable that emits an event every time the value of the control changes, in
777 ▶    * the UI or programmatically. It also emits an event each time you call enable() or disable()
778 ▶    * without passing along {emitEvent: false} as a function argument.
779 │    *
780 ▶    * **Note**: the emit happens right after a value of this control is updated. The value of a
781 ▶    * parent control (for example if this FormControl is a part of a FormGroup) is updated later, so
782 │    * accessing a value of a parent control (using the `value` property) from the callback of this
783 │    * event might result in getting a value that has not been updated yet. Subscribe to the
784 │    * `valueChanges` event of the parent control instead.
785 │    */
786 │   public readonly valueChanges!: Observable<TValue>;
787 │ 
```

この段落の前半（L762〜768、[テストを書く章](../contrib/07-contrib-writing-a-test.md)が引用）は「値のイベントは、この control の値が変わった直後に出る。親の値はまだ古い」です。769 行目は続けて「ほかの種類のイベントは、親を更新したあとに出る」と書きます。DEMO の events の 4 行を並べると、次のとおりでした。

| 操作 | 子の events に来たイベント | その時点の親 | 769 行目と |
| --- | --- | --- | --- |
| `a.setValue('')`（required） | `ValueChangeEvent('')` | value は `{a: 'x'}`（古い） | 前半の約束どおり |
| 同じ操作の 2 つ目 | `StatusChangeEvent(INVALID)` | status は `VALID`（古い） | **合わない** |
| `a.markAsTouched()` / `a.markAsDirty()` | `TouchedChangeEvent` / `PristineChangeEvent` | touched / dirty は更新済み | 合う |
| `a.disable()` | `ValueChangeEvent`・`StatusChangeEvent(DISABLED)` | status は `VALID`（古い） | **合わない** |

理由は実装の順番です。`updateValueAndValidity` は自分の `ValueChangeEvent` と `StatusChangeEvent` を続けて `next` し（L1416〜1421）、そのあとで親の `updateValueAndValidity` を呼びます（L1424〜1426、[updateValueAndValidity の章](../forms/03-forms-update-value-validity.md)）。`disable` も L1283〜1284 で 2 つを流してから L1289 の `_updateAncestors` です。一方 `markAsTouched`・`markAsDirty` は親を先に mark してから自分のイベントを流します（L1006〜1012、L1140〜1146）。769 行目は 1c736dc3b25（2024-03-27、#54579「Unified Control State Change Events」）で `events` と同時に入った文で、そのコミットの `updateValueAndValidity` でもすでに「自分の 2 つ → 親」の順でした。origin/main でも同じです。

776〜778 行目の「`enable()`・`disable()` を `emitEvent: false` なしで呼べば `valueChanges` も出る」は合います（DEMO の flags の最後の行）。

📄 `angular/packages/forms/src/model/abstract_model.ts` L788–816 （▶ の行: 789–790, 800–801, 804, 811–812）

```ts
788 │   /**
789 ▶    * A multicasting observable that emits an event every time the validation `status` of the control
790 ▶    * recalculates.
791 │    *
792 │    * @see {@link FormControlStatus}
793 │    * @see {@link AbstractControl.status}
794 │    */
795 │   public readonly statusChanges!: Observable<FormControlStatus>;
796 │ 
797 │   /**
798 │    * Reports the update strategy of the `AbstractControl` (meaning
799 │    * the event on which the control updates itself).
800 ▶    * Possible values: `'change'` | `'blur'` | `'submit'`
801 ▶    * Default value: `'change'`
802 │    */
803 │   get updateOn(): FormHooks {
804 ▶     return this._updateOn ? this._updateOn : this.parent ? this.parent.updateOn : 'change';
805 │   }
806 │ 
807 │   /**
808 │    * Sets the synchronous validators that are active on this control.  Calling
809 │    * this overwrites any existing synchronous validators.
810 │    *
811 ▶    * When you add or remove a validator at run time, you must call
812 ▶    * `updateValueAndValidity()` for the new validation to take effect.
813 │    *
814 │    * If you want to add a new validator without affecting existing ones, consider
815 │    * using `addValidators()` method instead.
816 │    */
```

804 行目のとおり、`updateOn` は自分で決めた値 → 親の `updateOn` → `'change'` の順に探します。DEMO の最後の行で、`{updateOn: 'blur'}` の group の子は `blur`、自分で `'change'` を決めた子は `change`、親の無い control は `change` でした。811〜812 行目「足し外しのあとは `updateValueAndValidity()` を呼ぶまで効かない」も合います。`addValidators(Validators.minLength(3))` の直後の `errors` は `{required: true}` のままで、`setValue('ab')` で初めて `minlength` になりました。

## 6. removeValidators と hasValidator の例

📄 `angular/packages/forms/src/model/abstract_model.ts` L866–884 （▶ の行: 868–869, 876, 879–881, 883）

````ts
866 │   /**
867 │    * Remove a synchronous validator from this control, without affecting other validators.
868 ▶    * Validators are compared by function reference; you must pass a reference to the exact same
869 ▶    * validator function as the one that was originally set. If a provided validator is not found,
870 │    * it is ignored.
871 │    *
872 │    * @usageNotes
873 │    *
874 │    * ```ts
875 │    * // Reference to the RequiredValidator
876 ▶    * const ctrl = new FormControl<string | null>('', Validators.required);
877 │    * ctrl.removeValidators(Validators.required);
878 │    *
879 ▶    * // Reference to anonymous function inside MinValidator
880 ▶    * const minValidator = Validators.min(3);
881 ▶    * const ctrl = new FormControl<string | null>('', minValidator);
882 │    * expect(ctrl.hasValidator(minValidator)).toEqual(true)
883 ▶    * expect(ctrl.hasValidator(Validators.min(3))).toEqual(false)
884 │    *
````

📄 `angular/packages/forms/src/model/abstract_model.ts` L912–929 （▶ の行: 920, 925–927）

````ts
912 │   /**
913 │    * Check whether a synchronous validator function is present on this control. The provided
914 │    * validator must be a reference to the exact same function that was provided.
915 │    *
916 │    * @usageNotes
917 │    *
918 │    * ```ts
919 │    * // Reference to the RequiredValidator
920 ▶    * const ctrl = new FormControl<number | null>(0, Validators.required);
921 │    * expect(ctrl.hasValidator(Validators.required)).toEqual(true)
922 │    *
923 │    * // Reference to anonymous function inside MinValidator
924 │    * const minValidator = Validators.min(3);
925 ▶    * const ctrl = new FormControl<number | null>(0, minValidator);
926 ▶    * expect(ctrl.hasValidator(minValidator)).toEqual(true)
927 ▶    * expect(ctrl.hasValidator(Validators.min(3))).toEqual(false)
928 │    * ```
929 │    *
````

2 つの例は、どちらも 1 つのコードブロックの中で `const ctrl` を 2 回宣言しています（876 行目と 881 行目、920 行目と 925 行目）。コピーして貼ると TypeScript は `TS2451: Cannot redeclare block-scoped variable 'ctrl'` を 4 か所に出します（テストの節）。7316fa71c43（2022-06-23、#46472「add usage notes」）で入った例で、origin/main でも同じです。変数名を 1 つにすれば、926〜927 行目の `true` / `false` のとおりです（DEMO の validators の 1 行目）。`Validators.min(3)` は呼ぶたびに新しい関数を返すので、参照で比べる（868〜869 行目）と別物になります。比べ方は[Validators の章](../forms/04-forms-validators.md)の 5 節です。

## 7. markAsTouched・markAllAs\*・markAsUntouched の opts

📄 `angular/packages/forms/src/model/abstract_model.ts` L971–998 （▶ の行: 972–973, 981–985）

```ts
971 │   /**
972 ▶    * Marks the control as `touched`. A control is touched by focus and
973 ▶    * blur events that do not change the value.
974 │    *
975 │    * @see {@link markAsUntouched()}
976 │    * @see {@link markAsDirty()}
977 │    * @see {@link markAsPristine()}
978 │    *
979 │    * @param opts Configuration options that determine how the control propagates changes
980 │    * and emits events after marking is applied.
981 ▶    * * `onlySelf`: When true, mark only this control. When false or not supplied,
982 ▶    * marks all direct ancestors. Default is false.
983 ▶    * * `emitEvent`: When true or not supplied (the default), the `events`
984 ▶    * observable emits a `TouchedChangeEvent` with the `touched` property being `true`.
985 ▶    * When false, no events are emitted.
986 │    *
987 │    * @see [Managing form control state](guide/forms/reactive-forms#managing-form-control-state)
988 │    *
989 │    */
990 │   markAsTouched(opts?: {onlySelf?: boolean; emitEvent?: boolean}): void;
991 │   /**
992 │    * @internal Used to propagate the source control downwards
993 │    */
994 │   markAsTouched(opts?: {
995 │     onlySelf?: boolean;
996 │     emitEvent?: boolean;
997 │     sourceControl?: AbstractControl;
998 │   }): void;
```

981〜982 行目の `onlySelf` は合います。`a.markAsTouched({onlySelf: true})` では親は `touched=false` のまま、省くと `true` です。972〜973 行目の「値を変えない focus と blur で touched になる」は、組み込みの値のアクセサーが blur で `onTouched` を呼ぶことを指していて、値を変えた blur でも touched になります（呼ぶ所は[setUpControl の章](../forms/10-forms-setup-control.md)の 2 節）。

📄 `angular/packages/forms/src/model/abstract_model.ts` L1015–1052 （▶ の行: 1016, 1029, 1031, 1035, 1048, 1050）

```ts
1015 │   /**
1016 ▶    * Marks the control and all its descendant controls as `dirty`.
1017 │    * @see {@link markAsDirty()}
1018 │    *
1019 │    * @param opts Configuration options that determine how the control propagates changes
1020 │    * and emits events after marking is applied.
1021 │    * * `emitEvent`: When true or not supplied (the default), the `events`
1022 │    * observable emits a `PristineChangeEvent` with the `pristine` property being `false`.
1023 │    * When false, no events are emitted.
1024 │    *
1025 │    * @see [Managing form control state](guide/forms/reactive-forms#managing-form-control-state)
1026 │    *
1027 │    */
1028 │   markAllAsDirty(opts: {emitEvent?: boolean} = {}): void {
1029 ▶     this.markAsDirty({onlySelf: true, emitEvent: opts.emitEvent, sourceControl: this});
1030 │ 
1031 ▶     this._forEachChild((control: AbstractControl) => control.markAllAsDirty(opts));
1032 │   }
1033 │ 
1034 │   /**
1035 ▶    * Marks the control and all its descendant controls as `touched`.
1036 │    * @see {@link markAsTouched()}
1037 │    *
1038 │    * @param opts Configuration options that determine how the control propagates changes
1039 │    * and emits events after marking is applied.
1040 │    * * `emitEvent`: When true or not supplied (the default), the `events`
1041 │    * observable emits a `TouchedChangeEvent` with the `touched` property being `true`.
1042 │    * When false, no events are emitted.
1043 │    *
1044 │    * @see [Managing form control state](guide/forms/reactive-forms#managing-form-control-state)
1045 │    *
1046 │    */
1047 │   markAllAsTouched(opts: {emitEvent?: boolean} = {}): void {
1048 ▶     this.markAsTouched({onlySelf: true, emitEvent: opts.emitEvent, sourceControl: this});
1049 │ 
1050 ▶     this._forEachChild((control: AbstractControl) => control.markAllAsTouched(opts));
1051 │   }
1052 │ 
```

1029 行目と 1048 行目は、自分を `onlySelf: true` で mark してから子へ同じ関数を呼びます。説明（1016・1035 行目）のとおり「自分と子孫」で、祖先は mark しません。

📄 `angular/packages/forms/src/model/abstract_model.ts` L1053–1083 （▶ の行: 1056–1057, 1065–1069）

```ts
1053 │   /**
1054 │    * Marks the control as `untouched`.
1055 │    *
1056 ▶    * If the control has any children, also marks all children as `untouched`
1057 ▶    * and recalculates the `touched` status of all parent controls.
1058 │    *
1059 │    * @see {@link markAsTouched()}
1060 │    * @see {@link markAsDirty()}
1061 │    * @see {@link markAsPristine()}
1062 │    *
1063 │    * @param opts Configuration options that determine how the control propagates changes
1064 │    * and emits events after the marking is applied.
1065 ▶    * * `onlySelf`: When true, mark only this control. When false or not supplied,
1066 ▶    * marks all direct ancestors. Default is false.
1067 ▶    * * `emitEvent`: When true or not supplied (the default), the `events`
1068 ▶    * observable emits a `TouchedChangeEvent` with the `touched` property being `false`.
1069 ▶    * When false, no events are emitted.
1070 │    *
1071 │    * @see [Managing form control state](guide/forms/reactive-forms#managing-form-control-state)
1072 │    *
1073 │    */
1074 │   markAsUntouched(opts?: {onlySelf?: boolean; emitEvent?: boolean}): void;
1075 │   /**
1076 │    *
1077 │    * @internal Used to propagate the source control downwards
1078 │    */
1079 │   markAsUntouched(opts: {
1080 │     onlySelf?: boolean;
1081 │     emitEvent?: boolean;
1082 │     sourceControl?: AbstractControl;
1083 │   }): void;
```

1065〜1066 行目は「`onlySelf` を省けば、直接の祖先を全部 mark する」と書きますが、1057 行目の言うとおり、祖先は untouched に*しません*。`_updateTouched` が「子のどれかが touched か」で数え直すだけです（L1748〜1755）。DEMO では `a`・`b` を touched にしてから `a.markAsUntouched()` すると、親は `b` のために touched のままでした。同じ「marks all direct ancestors」は `markAsPristine` の 1162〜1163 行目にもあります。

1069 行目の「`emitEvent: false` なら何も流さない」は、自分の `events` については合いますが、親の `_updateTouched` は `emitEvent` を見ずに `TouchedChangeEvent` を流します。DEMO の結果は `g:Touched(false)←a` の 1 つでした。この振る舞い自体は[events の章](../forms/06-forms-control-events.md)の 6 節が実装の側から読んでいます。

## 8. markAsDirty・markAsPristine・markAsPending

📄 `angular/packages/forms/src/model/abstract_model.ts` L1105–1132 （▶ の行: 1106–1107, 1115–1116）

```ts
1105 │   /**
1106 ▶    * Marks the control as `dirty`. A control becomes dirty when
1107 ▶    * the control's value is changed through the UI; compare `markAsTouched`.
1108 │    *
1109 │    * @see {@link markAsTouched()}
1110 │    * @see {@link markAsUntouched()}
1111 │    * @see {@link markAsPristine()}
1112 │    *
1113 │    * @param opts Configuration options that determine how the control propagates changes
1114 │    * and emits events after marking is applied.
1115 ▶    * * `onlySelf`: When true, mark only this control. When false or not supplied,
1116 ▶    * marks all direct ancestors. Default is false.
1117 │    * * `emitEvent`: When true or not supplied (the default), the `events`
1118 │    * observable emits a `PristineChangeEvent` with the `pristine` property being `false`.
1119 │    * When false, no events are emitted.
1120 │    *
1121 │    * @see [Managing form control state](guide/forms/reactive-forms#managing-form-control-state)
1122 │    *
1123 │    */
1124 │   markAsDirty(opts?: {onlySelf?: boolean; emitEvent?: boolean}): void;
1125 │   /**
1126 │    * @internal Used to propagate the source control downwards
1127 │    */
1128 │   markAsDirty(opts: {
1129 │     onlySelf?: boolean;
1130 │     emitEvent?: boolean;
1131 │     sourceControl?: AbstractControl;
1132 │   }): void;
```

📄 `angular/packages/forms/src/model/abstract_model.ts` L1149–1179 （▶ の行: 1152–1153, 1162–1163, 1166）

```ts
1149 │   /**
1150 │    * Marks the control as `pristine`.
1151 │    *
1152 ▶    * If the control has any children, marks all children as `pristine`,
1153 ▶    * and recalculates the `pristine` status of all parent
1154 │    * controls.
1155 │    *
1156 │    * @see {@link markAsTouched()}
1157 │    * @see {@link markAsUntouched()}
1158 │    * @see {@link markAsDirty()}
1159 │    *
1160 │    * @param opts Configuration options that determine how the control emits events after
1161 │    * marking is applied.
1162 ▶    * * `onlySelf`: When true, mark only this control. When false or not supplied,
1163 ▶    * marks all direct ancestors. Default is false.
1164 │    * * `emitEvent`: When true or not supplied (the default), the `events`
1165 │    * observable emits a `PristineChangeEvent` with the `pristine` property being `true`.
1166 ▶    * When false, no events are emitted.
1167 │    *
1168 │    * @see [Managing form control state](guide/forms/reactive-forms#managing-form-control-state)
1169 │    *
1170 │    */
1171 │   markAsPristine(opts?: {onlySelf?: boolean; emitEvent?: boolean}): void;
1172 │   /**
1173 │    * @internal Used to propagate the source control downwards
1174 │    */
1175 │   markAsPristine(opts: {
1176 │     onlySelf?: boolean;
1177 │     emitEvent?: boolean;
1178 │     sourceControl?: AbstractControl;
1179 │   }): void;
```

📄 `angular/packages/forms/src/model/abstract_model.ts` L1202–1227 （▶ の行: 1205, 1211–1216）

```ts
1202 │   /**
1203 │    * Marks the control as `pending`.
1204 │    *
1205 ▶    * A control is pending while the control performs async validation.
1206 │    *
1207 │    * @see {@link AbstractControl.status}
1208 │    *
1209 │    * @param opts Configuration options that determine how the control propagates changes and
1210 │    * emits events after marking is applied.
1211 ▶    * * `onlySelf`: When true, mark only this control. When false or not supplied,
1212 ▶    * marks all direct ancestors. Default is false.
1213 ▶    * * `emitEvent`: When true or not supplied (the default), the `statusChanges`
1214 ▶    * observable emits an event with the latest status the control is marked pending
1215 ▶    * and the `events` observable emits a `StatusChangeEvent` with the `status` property being
1216 ▶    * `PENDING` When false, no events are emitted.
1217 │    *
1218 │    */
1219 │   markAsPending(opts?: {onlySelf?: boolean; emitEvent?: boolean}): void;
1220 │   /**
1221 │    * @internal Used to propagate the source control downwards
1222 │    */
1223 │   markAsPending(opts: {
1224 │     onlySelf?: boolean;
1225 │     emitEvent?: boolean;
1226 │     sourceControl?: AbstractControl;
1227 │   }): void;
```

1106〜1107 行目は「UI から値が変わったら dirty」で、DEMO の 3 行目の裏返しです。`markAsPending` は 1211〜1216 行目のとおりで、`a.markAsPending()` で `statusChanges` が 1 回、`events` に `StatusChangeEvent(PENDING)`、親も `PENDING` になりました。1216 行目の `PENDING` のあとにはピリオドが無く、「When false, …」と 1 文につながっています。

## 9. disable と enable の opts

📄 `angular/packages/forms/src/model/abstract_model.ts` L1244–1265 （▶ の行: 1245–1246, 1248, 1254–1258）

```ts
1244 │   /**
1245 ▶    * Disables the control. This means the control is exempt from validation checks and
1246 ▶    * excluded from the aggregate value of any parent. Its status is `DISABLED`.
1247 │    *
1248 ▶    * If the control has children, all children are also disabled.
1249 │    *
1250 │    * @see {@link AbstractControl.status}
1251 │    *
1252 │    * @param opts Configuration options that determine how the control propagates
1253 │    * changes and emits events after the control is disabled.
1254 ▶    * * `onlySelf`: When true, mark only this control. When false or not supplied,
1255 ▶    * marks all direct ancestors. Default is false.
1256 ▶    * * `emitEvent`: When true or not supplied (the default), the `statusChanges`,
1257 ▶    * `valueChanges` and `events`
1258 ▶    * observables emit events with the latest status and value when the control is disabled.
1259 │    * When false, no events are emitted.
1260 │    */
1261 │   disable(opts?: {onlySelf?: boolean; emitEvent?: boolean}): void;
1262 │   /**
1263 │    * @internal Used to propagate the source control downwards
1264 │    */
1265 │   disable(opts: {onlySelf?: boolean; emitEvent?: boolean; sourceControl?: AbstractControl}): void;
```

📄 `angular/packages/forms/src/model/abstract_model.ts` L1293–1310 （▶ の行: 1298, 1302–1303, 1306–1308）

```ts
1293 │   /**
1294 │    * Enables the control. This means the control is included in validation checks and
1295 │    * the aggregate value of its parent. Its status recalculates based on its value and
1296 │    * its validators.
1297 │    *
1298 ▶    * By default, if the control has children, all children are enabled.
1299 │    *
1300 │    * @see {@link AbstractControl.status}
1301 │    *
1302 ▶    * @param opts Configure options that control how the control propagates changes and
1303 ▶    * emits events when marked as untouched
1304 │    * * `onlySelf`: When true, mark only this control. When false or not supplied,
1305 │    * marks all direct ancestors. Default is false.
1306 ▶    * * `emitEvent`: When true or not supplied (the default), the `statusChanges`,
1307 ▶    * `valueChanges` and `events`
1308 ▶    * observables emit events with the latest status and value when the control is enabled.
1309 │    * When false, no events are emitted.
1310 │    */
```

1302〜1303 行目は `enable` の opts を「untouched に mark したときに、どう伝えて、どうイベントを出すか」と説明しています。`enable` は touched を触らないので、これは `markAsUntouched` の説明の写し間違いです。実際は 1306〜1308 行目のとおり値と状態のイベントで、DEMO では `ValueChangeEvent('x')` と `StatusChangeEvent(VALID)` が出ました。a57825acf35（2018-06-11、#24255）からこの文で、origin/main でも同じです。1298 行目の「既定では子も全部 enable にする」には、子を残す opts がありません（実装 L1318〜1320 は必ず子を `enable` する）。その opts を求める issue が開いています（#51296）。

## 10. 抽象メソッドと updateValueAndValidity の説明

📄 `angular/packages/forms/src/model/abstract_model.ts` L1339–1369 （▶ の行: 1351, 1356, 1361, 1364–1365, 1368）

```ts
1339 │   /**
1340 │    * Sets the parent of the control
1341 │    *
1342 │    * @param parent The new parent.
1343 │    */
1344 │   setParent(parent: FormGroup | FormArray | null): void {
1345 │     this._parent = parent;
1346 │   }
1347 │ 
1348 │   /**
1349 │    * Sets the value of the control. Abstract method (implemented in sub-classes).
1350 │    */
1351 ▶   abstract setValue(value: TRawValue, options?: Object): void;
1352 │ 
1353 │   /**
1354 │    * Patches the value of the control. Abstract method (implemented in sub-classes).
1355 │    */
1356 ▶   abstract patchValue(value: TValue, options?: Object): void;
1357 │ 
1358 │   /**
1359 │    * Resets the control. Abstract method (implemented in sub-classes).
1360 │    */
1361 ▶   abstract reset(value?: TValueWithOptionalControlStates, options?: Object): void;
1362 │ 
1363 │   /**
1364 ▶    * The raw value of this control. For most control implementations, the raw value will include
1365 ▶    * disabled children.
1366 │    */
1367 │   getRawValue(): any {
1368 ▶     return this.value;
1369 │   }
```

1351・1356・1361 行目の 3 つは子クラスが実装し、opts の説明はそれぞれのクラスの説明文にあります（[次の章](02-fmd-group-array.md)と[第 3 回](03-fmd-control-builder.md)）。1368 行目の既定の `getRawValue` は `value` を返すだけで、group と array が上書きします。

📄 `angular/packages/forms/src/model/abstract_model.ts` L1371–1396 （▶ の行: 1374, 1378–1380, 1382）

```ts
1371 │   /**
1372 │    * Recalculates the value and validation status of the control.
1373 │    *
1374 ▶    * By default, it also updates the value and validity of its ancestors.
1375 │    *
1376 │    * @param opts Configuration options determine how the control propagates changes and emits events
1377 │    * after updates and validity checks are applied.
1378 ▶    * * `onlySelf`: When true, only update this control. When false or not supplied,
1379 ▶    * update all direct ancestors. Default is false.
1380 ▶    * * `emitEvent`: When true or not supplied (the default), the `statusChanges`,
1381 │    * `valueChanges` and `events`
1382 ▶    * observables emit events with the latest status and value when the control is updated.
1383 │    * When false, no events are emitted.
1384 │    *
1385 │    * @see [Understanding propagation control](guide/forms/reactive-forms#understanding-event-emission)
1386 │    *
1387 │    */
1388 │   updateValueAndValidity(opts?: {onlySelf?: boolean; emitEvent?: boolean}): void;
1389 │   /**
1390 │    * @internal Used to propagate the source control downwards
1391 │    */
1392 │   updateValueAndValidity(opts: {
1393 │     onlySelf?: boolean;
1394 │     emitEvent?: boolean;
1395 │     sourceControl?: AbstractControl;
1396 │   }): void;
```

## 11. setErrors

📄 `angular/packages/forms/src/model/abstract_model.ts` L1477–1506 （▶ の行: 1480, 1482, 1486–1487, 1494, 1499, 1504）

````ts
1477 │   /**
1478 │    * Sets errors on a form control when running validations manually, rather than automatically.
1479 │    *
1480 ▶    * Calling `setErrors` also updates the validity of the parent control.
1481 │    *
1482 ▶    * Note: Manually set errors are always overwritten by the results of the next validation run.
1483 │    *
1484 │    * @param opts Configuration options that determine how the control propagates
1485 │    * changes and emits events after the control errors are set.
1486 ▶    * * `emitEvent`: When true or not supplied (the default), the `statusChanges`
1487 ▶    * observable emits an event after the errors are set.
1488 │    *
1489 │    * @usageNotes
1490 │    *
1491 │    * ### Manually set the errors for a control
1492 │    *
1493 │    * ```ts
1494 ▶    * const login = new FormControl('someLogin');
1495 │    * login.setErrors({
1496 │    *   notUnique: true
1497 │    * });
1498 │    *
1499 ▶    * expect(login.valid).toEqual(false);
1500 │    * expect(login.errors).toEqual({ notUnique: true });
1501 │    *
1502 │    * login.setValue('someOtherLogin');
1503 │    *
1504 ▶    * expect(login.valid).toEqual(true);
1505 │    * ```
1506 │    */
````

例はそのまま型検査に通り、動かしても 1499・1504 行目のとおりです。1480 行目の「親の validity も更新する」は、`_updateControlsErrors` が親の `_updateControlsErrors` を呼ぶからで（L1682〜1684、[events の章](../forms/06-forms-control-events.md)）、DEMO で親も `INVALID` になりました。1486〜1487 行目は `statusChanges` だけを挙げますが、`events` にも `StatusChangeEvent` が出ます（L1678〜1680）。

## 12. get：パスの 2 つの形と、その実装

📄 `angular/packages/forms/src/model/abstract_model.ts` L1522–1556 （▶ の行: 1525, 1534–1535, 1544, 1546, 1554）

```ts
1522 │   /**
1523 │    * Retrieves a child control given the control's name or path.
1524 │    *
1525 ▶    * This signature for get supports strings and `const` arrays (`.get(['foo', 'bar'] as const)`).
1526 │    */
1527 │   get<P extends string | readonly (string | number)[]>(
1528 │     path: P,
1529 │   ): AbstractControl<ɵGetProperty<TRawValue, P>> | null;
1530 │ 
1531 │   /**
1532 │    * Retrieves a child control given the control's name or path.
1533 │    *
1534 ▶    * This signature for `get` supports non-const (mutable) arrays. Inferred type
1535 ▶    * information will not be as robust, so prefer to pass a `readonly` array if possible.
1536 │    */
1537 │   get<P extends string | Array<string | number>>(
1538 │     path: P,
1539 │   ): AbstractControl<ɵGetProperty<TRawValue, P>> | null;
1540 │ 
1541 │   /**
1542 │    * Retrieves a child control given the control's name or path.
1543 │    *
1544 ▶    * @param path A dot-delimited string or array of string/number values that define the path to the
1545 │    * control. If a string is provided, passing it as a string literal will result in improved type
1546 ▶    * information. Likewise, if an array is provided, passing it `as const` will cause improved type
1547 │    * information to be available.
1548 │    *
1549 │    * @usageNotes
1550 │    * ### Retrieve a nested control
1551 │    *
1552 │    * For example, to get a `name` control nested within a `person` sub-group:
1553 │    *
1554 ▶    * * `this.form.get('person.name');`
1555 │    *
1556 │    * -OR-
```

📄 `angular/packages/forms/src/model/abstract_model.ts` L1557–1582 （▶ の行: 1558, 1565, 1569, 1575–1580）

```ts
1557 │    *
1558 ▶    * * `this.form.get(['person', 'name'] as const);` // `as const` gives improved typings
1559 │    *
1560 │    * ### Retrieve a control in a FormArray
1561 │    *
1562 │    * When accessing an element inside a FormArray, you can use an element index.
1563 │    * For example, to get a `price` control from the first element in an `items` array you can use:
1564 │    *
1565 ▶    * * `this.form.get('items.0.price');`
1566 │    *
1567 │    * -OR-
1568 │    *
1569 ▶    * * `this.form.get(['items', 0, 'price']);`
1570 │    */
1571 │   get<P extends string | (string | number)[]>(
1572 │     path: P,
1573 │   ): AbstractControl<ɵGetProperty<TRawValue, P>> | null {
1574 │     let currPath: Array<string | number> | string = path;
1575 ▶     if (currPath == null) return null;
1576 ▶     if (!Array.isArray(currPath)) currPath = currPath.split('.');
1577 ▶     if (currPath.length === 0) return null;
1578 ▶     return currPath.reduce(
1579 ▶       (control: AbstractControl | null, name) => control && control._find(name),
1580 ▶       this,
1581 │     );
1582 │   }
```

1. **1575 行目**

   `null` と `undefined` なら `null`。
2. **1576 行目**

   配列でなければ `'.'` で割ります。`''` は `['']` になり、名前 `''` の子は無いので `null` です。
3. **1577 行目**

   空の配列なら `null`（自分自身は返さない）。
4. **1578〜1580 行目**

   先頭から `_find(name)` を順に呼びます。group の `_find` は `hasOwnControl`、array の `_find` は `this.at(name as number)` です（[次の章](02-fmd-group-array.md)）。

1554〜1569 行目の 4 つの例は DEMO のとおり全部取れます。説明に無い所が 2 つあります。配列の形の `['items', -1, 'price']` は `at(-1)` になって最後の要素が取れますが、文字列の `'items.-1.price'` は `null` です。1576 行目で割った `'-1'` は文字列のまま `at` に渡り、`_adjustIndex` の `index < 0` は `true`（比べるときは数になる）でも `index + this.length` は文字列の連結 `'-12'` になるからです。

## 13. getError と hasError

📄 `angular/packages/forms/src/model/abstract_model.ts` L1584–1614 （▶ の行: 1601, 1605–1606, 1608–1609, 1612–1613）

````ts
1584 │   /**
1585 │    * @description
1586 │    * Reports error data for the control with the given path.
1587 │    *
1588 │    * @param errorCode The code of the error to check
1589 │    * @param path A list of control names that designates how to move from the current control
1590 │    * to the control that should be queried for errors.
1591 │    *
1592 │    * @usageNotes
1593 │    * For example, for the following `FormGroup`:
1594 │    *
1595 │    * ```ts
1596 │    * form = new FormGroup({
1597 │    *   address: new FormGroup({ street: new FormControl() })
1598 │    * });
1599 │    * ```
1600 │    *
1601 ▶    * The path to the 'street' control from the root form would be 'address' -> 'street'.
1602 │    *
1603 │    * It can be provided to this method in one of two formats:
1604 │    *
1605 ▶    * 1. An array of string control names, e.g. `['address', 'street']`
1606 ▶    * 1. A period-delimited list of control names in one string, e.g. `'address.street'`
1607 │    *
1608 ▶    * @returns error data for that particular error. If the control or error is not present,
1609 ▶    * null is returned.
1610 │    */
1611 │   getError(errorCode: string, path?: Array<string | number> | string): any {
1612 ▶     const control = path ? this.get(path) : this;
1613 ▶     return control?.errors ? control.errors[errorCode] : null;
1614 │   }
````

1608〜1609 行目は「control か error が無ければ `null`」と約束します。1613 行目は `control?.errors` があれば `control.errors[errorCode]` をそのまま返すので、**errors はあるが、そのキーが無い**ときは `undefined` です。DEMO では `errors` が `{required: true}` の control に `getError('minlength', …)` で `undefined` が返りました。control が無いときと errors が `null` のときは `null` です。この約束の文は e268a0579a3（2018-12-28、#27861）で入り、そのときの実装も `control && control.errors ? control.errors[errorCode] : null` でした。origin/main でも同じです。

📄 `angular/packages/forms/src/model/abstract_model.ts` L1616–1648 （▶ の行: 1640, 1644, 1647）

````ts
1616 │   /**
1617 │    * @description
1618 │    * Reports whether the control with the given path has the error specified.
1619 │    *
1620 │    * @param errorCode The code of the error to check
1621 │    * @param path A list of control names that designates how to move from the current control
1622 │    * to the control that should be queried for errors.
1623 │    *
1624 │    * @usageNotes
1625 │    * For example, for the following `FormGroup`:
1626 │    *
1627 │    * ```ts
1628 │    * form = new FormGroup({
1629 │    *   address: new FormGroup({ street: new FormControl() })
1630 │    * });
1631 │    * ```
1632 │    *
1633 │    * The path to the 'street' control from the root form would be 'address' -> 'street'.
1634 │    *
1635 │    * It can be provided to this method in one of two formats:
1636 │    *
1637 │    * 1. An array of string control names, e.g. `['address', 'street']`
1638 │    * 1. A period-delimited list of control names in one string, e.g. `'address.street'`
1639 │    *
1640 ▶    * If no path is given, this method checks for the error on the current control.
1641 │    *
1642 │    * @returns whether the given error is present in the control at the given path.
1643 │    *
1644 ▶    * If the control is not present, false is returned.
1645 │    */
1646 │   hasError(errorCode: string, path?: Array<string | number> | string): boolean {
1647 ▶     return !!this.getError(errorCode, path);
1648 │   }
````

`hasError` は 1647 行目で `!!` にするので、`undefined` も `null` も `false` になり、1644 行目の約束と合います。テンプレートで `getError(...) === null` と比べると、キーが無いときに一致しません。

> **🧪 DEMO — 説明文の約束を本物の control で試す**
>
> 押すと、このサイトの依存の本物の `@angular/forms`（22.2.6）で、行ごとに新しい `FormControl`・`FormGroup`・`FormArray` を作って操作し、値・状態・`events` に来たイベントを文字列にします。イベントは「`子の名前:種類(中身)←発生源`」で、括弧の中はそのイベントを受け取った瞬間に読んだ親の値です。合わない行を赤くします。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-abstract-model)

## ここまでの呼び出し

- 👤 `a.setValue('')` — form\_control.ts L499
  - `a.updateValueAndValidity(options)` — abstract\_model.ts L1397
    - `a._events.next(ValueChangeEvent) → next(StatusChangeEvent)` — L1418〜1419 — *ここで購読者が親を読むと、親はまだ古い*
    - `parent.updateValueAndValidity({...opts, sourceControl})` — L1425 — *親の値と状態はここで変わる*
- 👤 `form.getError('minlength', 'address.street')` — L1611
  - `this.get(path) → reduce(_find)` — L1571〜1581
  - `control.errors[errorCode]` — L1613 — *キーが無ければ undefined*

## テストと直し方

| ファイル（packages/forms/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `form_group_spec.ts` | `getError`（1047）› `should return null otherwise`（1055） | errors が `null` のときと、control が無いときの `null`。errors はあるがキーが無い場合の it は無い |
| `form_group_spec.ts` | `disabled events`（2106）› `should emit status change events in the right order`（2128） | `statusChanges` が子 → group → form の順に出ること（769 行目と逆の向きの事実を固めている） |
| `reactive_integration_spec.ts` | `unified form state change`（1151）› `Nested formControl should emit changes for itself and its parent`（1276） | 子と親の `events` に来るイベントの種類と数。受け取った瞬間の親の状態は見ていない |
| `form_control_spec.ts` | `setErrors`（1194） | 1480・1482 行目 |

📄 `走らせたコマンド（2026-11-21、../angular の 8576f161ae4）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/forms/test:test --nocache_test_results --test_output=all
//packages/forms/test:test   PASSED      1153 specs, 0 failures
$ pnpm bazel test //packages/forms/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
--filter=getError                   Ran 5 of 1153 specs、0 failures
--filter=disabled events            Ran 13 of 1153 specs、0 failures
--filter=unified form state change  Ran 20 of 1153 specs、0 failures
--filter=setErrors                  Ran 5 of 1153 specs、0 failures

# 説明文の例を const に貼って型検査（サイトの TypeScript 6.0.3）
$ tsc --strict --noEmit ex-am-validators.ts     # L875〜885 と L919〜927 の例
ex-am-validators.ts(6,8): error TS2451: Cannot redeclare block-scoped variable 'ctrl'.
ex-am-validators.ts(11,8): error TS2451: Cannot redeclare block-scoped variable 'ctrl'.
ex-am-validators.ts(20,8): error TS2451: Cannot redeclare block-scoped variable 'ctrl'.
ex-am-validators.ts(25,8): error TS2451: Cannot redeclare block-scoped variable 'ctrl'.
$ tsc --strict --noEmit ex-am-misc.ts           # setErrors・Value・RawValue・get の例
ex-am-misc.ts(26,7): error TS2741: Property 'address' is missing in type '{}' but required in type '{ address: string; }'.
#   ↑ RawValue に {} を入れた行。Value（L342 の {address: string|undefined}）には {} が通る = 実際は {address?: string}
```

直すとしたら、どれも abstract\_model.ts の説明文です。66 行目の `markAsDisabled` → `disable`、595 行目の `compose` → `composeAsync`、769 行目（状態のイベントは親より先に出る、と書く）、876・881・920・925 行目の 2 つ目の `const ctrl`（別の名前にする）、1065・1162 行目の「mark all direct ancestors」（祖先は数え直す）、1302〜1303 行目（enable にしたとき）、1608〜1609 行目（キーが無ければ `undefined`）です。1613 行目の実装を説明文に合わせるなら `control?.errors?.[errorCode] ?? null` のような形になり、`form_group_spec.ts` の `getError`（1047）に「errors があり、別のキーを聞く」it を足して固めます。こちらは戻り値が変わるので、説明文を直すのとは重さが違います。

## 聞かれそうな質問

**Q. 子の `events` で `StatusChangeEvent` を受けたとき、親の `status` は新しいですか？**

古いままです。`updateValueAndValidity` は自分の 2 つのイベントを流してから（L1418〜1419）親を更新します（L1425）。親の新しい状態がほしければ、769 行目の後ろの言うとおり親の `events` を購読します。touched と pristine のイベントは親を先に更新するので新しい値が読めます。

**Q. `getError('x')` が `null` でなく `undefined` を返すのはどんなときですか？**

errors が `null` でなく、その中に `'x'` のキーが無いときです（1613 行目）。説明文（1608〜1609 行目）は `null` と書きます。`hasError` は `!!` で包むので、どちらでも `false` です。

**Q. `markAsUntouched()` で親も untouched になりますか？**

ほかの子が touched なら、親は touched のままです。親は mark されるのではなく、`_updateTouched` で子から数え直されます（1057 行目、L1748〜1755）。

**Q. `form.get('items.-1')` で最後の要素は取れますか？**

取れません。文字列は 1576 行目で割られて `'-1'` のまま `FormArray._find` に渡り、添字の計算が文字列の連結になります。`form.get(['items', -1])` なら取れます。

**Q. `removeValidators(Validators.min(3))` で外れないのはなぜですか？**

`Validators.min(3)` は呼ぶたびに新しい関数を返し、外すときは参照で比べるからです（868〜869 行目）。足したときの関数を変数に取っておいて、それを渡します（879〜883 行目の例）。

## 読み終えて

- status の 4 つの値と各フラグの説明は、実装と合う。DISABLED は親の検証と値から外れる。
- 769 行目の「ほかのイベントは親を更新したあと」は、状態のイベントについて 2024 年に入ったときから成り立っていない。
- `getError` は「キーが無い」とき `undefined` を返し、説明文の `null` と合わない。
- `onlySelf` を省いた `markAsUntouched`・`markAsPristine` は、祖先を mark せずに数え直す。`emitEvent: false` でも親のイベントは出る。
- 説明文の例のうち 2 つは `const` の二重宣言で、そのままでは型検査に通らない。リンク先の無い `markAsDisabled` と、enable の opts の写し間違いもある。

---

← 前: [spec と issue を読む：型と説明文を固めているもの](../rmd/09-rmd-tests-issues.md)  
次: [FormGroup・FormRecord・FormArray の説明文](02-fmd-group-array.md) →
