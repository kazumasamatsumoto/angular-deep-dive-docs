[目次](../README.md) › [フォームの内側](README.md) › 第 4 回 / 全 20 回

# Validators：同期の検証関数と errors の合成

> validators.ts の required・minLength・pattern などが返す ValidationErrors の形、空の値を「検証しない」扱いにする行（email・pattern は isEmptyInputValue、minLength は自分の長さの判定、min は parseFloat の NaN）、compose と mergeErrors で複数の検証をまとめる行（後ろ勝ち・空なら null。単体で渡すと合成されず {} が INVALID になる）、normalizeValidators が Validator オブジェクトを関数に直す理由、hasValidator が参照の一致で探すこと。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-validators)

---

`Validators.required` や `Validators.minLength(3)` は、control を受け取って `ValidationErrors | null` を返すただの関数です。この章では、組み込みの検証関数が「空の値」をどう扱うか、複数の検証関数が 1 つの関数にまとめられて errors が合成される行、そして `addValidators` / `removeValidators` / `hasValidator` が**関数の参照**で比べている行を追います。

読む対象は `packages/forms/src/validators.ts`（検証関数と合成）と、`packages/forms/src/model/abstract_model.ts` の `pickValidators`・`setValidators` から `hasValidator` まで・`_assignValidators` です。

1. [1. 全体像](01-forms-overview.md)
2. [2. AbstractControl](02-forms-abstract-control.md)
3. [3. updateValueAndValidity](03-forms-update-value-validity.md)
4. **4. Validators**（この章）
5. [5. 非同期の検証](05-forms-async-validators.md)
6. [6. events](06-forms-control-events.md)
7. [7. FormGroup と FormArray](07-forms-form-group-array.md)
8. [8. 型付きフォームと FormBuilder](08-forms-typed-forms.md)
9. [9. ControlValueAccessor](09-forms-value-accessor.md)
10. [10. 双方向の配線](10-forms-setup-control.md)
11. [11. 組み込みの accessor](11-forms-builtin-accessors.md)
12. [12. リアクティブのディレクティブ](12-forms-reactive-directives.md)
13. [13. NgModel と NgForm](13-forms-ng-model.md)
14. [14. 検証のディレクティブ](14-forms-validator-directives.md)
15. [15. 状態クラス](15-forms-status-classes.md)
16. [16. Signal Forms のスキーマ](16-forms-sf-schema.md)
17. [17. Signal Forms の検証](17-forms-sf-validation.md)
18. [18. 状態ルールと metadata](18-forms-sf-rules-metadata.md)
19. [19. submit と相互運用](19-forms-sf-submit-compat.md)
20. [20. issue と PR を読む](20-forms-issues.md)

## 1. Validators の静的メソッドは、外の関数を呼ぶだけの入口

📄 `angular/packages/forms/src/validators.ts` L418–431 （▶ の行: 418–419, 429–430）

```ts
418 ▶   static pattern(pattern: string | RegExp): ValidatorFn {
419 ▶     return patternValidator(pattern);
420 │   }
421 │ 
422 │   /**
423 │    * @description
424 │    * Validator that performs no operation.
425 │    *
426 │    * @see {@link /api/forms/AbstractControl#updateValueAndValidity updateValueAndValidity}
427 │    *
428 │    */
429 ▶   static nullValidator(control: AbstractControl): ValidationErrors | null {
430 ▶     return nullValidator(control);
431 │   }
```

418〜420 行目の `Validators.pattern` は、同じファイルの `patternValidator` を呼んで返すだけです。429〜431 行目の `nullValidator` も同じ形です。`Validators` クラスの静的メソッドはどれもこの形で、中身は 466 行目以降の `export function`（`minValidator`・`requiredValidator` …）にあります。

ここで 2 種類あることに気づきます。`Validators.required` は **control を受け取る関数そのもの**（`static required(control)`）で、`Validators.minLength(3)` は **関数を作って返す関数**（`static minLength(minLength): ValidatorFn`）です。この違いが 5 節の `hasValidator` で効いてきます。

## 2. 空の値は「検証しない」：isEmptyInputValue

📄 `angular/packages/forms/src/validators.ts` L28–49 （▶ の行: 28–29, 40, 42–45, 48）

```ts
28 ▶ function isEmptyInputValue(value: unknown): boolean {
29 ▶   return value == null || lengthOrSize(value) === 0;
30 │ }
31 │ 
32 │ /**
33 │  * Extract the length property in case it's an array or a string.
34 │  * Extract the size property in case it's a set.
35 │  * Return null else.
36 │  * @param value Either an array, set or undefined.
37 │  */
38 │ function lengthOrSize(value: unknown): number | null {
39 │   // non-strict comparison is intentional, to check for both `null` and `undefined` values
40 ▶   if (value == null) {
41 │     return null;
42 ▶   } else if (Array.isArray(value) || typeof value === 'string') {
43 ▶     return value.length;
44 ▶   } else if (value instanceof Set) {
45 ▶     return value.size;
46 │   }
47 │ 
48 ▶   return null;
49 │ }
```

29 行目、「空」とは `null` か `undefined`（`== null`）、または長さが 0 のものです。長さは `lengthOrSize` が決めます。42〜43 行目で配列と文字列は `length`、44〜45 行目で `Set` は `size`、それ以外（数や真偽値、ふつうのオブジェクト）は 48 行目で `null` になり、「空ではない」扱いです。空白だけの文字列 `' '` は長さが 1 なので空ではありません。

📄 `angular/packages/forms/src/validators.ts` L498–524 （▶ の行: 503, 512, 520–521, 523）

```ts
498 │ /**
499 │  * Validator that requires the control have a non-empty value.
500 │  * See `Validators.required` for additional information.
501 │  */
502 │ export function requiredValidator(control: AbstractControl): ValidationErrors | null {
503 ▶   return isEmptyInputValue(control.value) ? {'required': true} : null;
504 │ }
505 │ 
506 │ /**
507 │  * Validator that requires the control's value be true. This validator is commonly
508 │  * used for required checkboxes.
509 │  * See `Validators.requiredTrue` for additional information.
510 │  */
511 │ export function requiredTrueValidator(control: AbstractControl): ValidationErrors | null {
512 ▶   return control.value === true ? null : {'required': true};
513 │ }
514 │ 
515 │ /**
516 │  * Validator that requires the control's value pass an email validation test.
517 │  * See `Validators.email` for additional information.
518 │  */
519 │ export function emailValidator(control: AbstractControl): ValidationErrors | null {
520 ▶   if (isEmptyInputValue(control.value)) {
521 ▶     return null; // don't validate empty values to allow optional controls
522 │   }
523 ▶   return EMAIL_REGEXP.test(control.value) ? null : {'email': true};
524 │ }
```

503 行目、`required` は空なら `{'required': true}` を返します。520〜521 行目、`email` は逆に空なら `null`（エラー無し）を返し、正規表現を試すのは空でないときだけです。「空は required の担当、形の検査は空でないときだけ」という分担で、任意入力の欄に `email` だけを付けても、空のままなら通ります。512 行目の `requiredTrue` だけは空かどうかを見ず、`=== true` かどうかだけを見ます（チェックボックス用）。

📄 `angular/packages/forms/src/validators.ts` L526–546 （▶ の行: 535–536, 539, 542–543）

```ts
526 │ /**
527 │  * Validator that requires the number of items in the control's value to be greater than or equal
528 │  * to the provided minimum length. See `Validators.minLength` for additional information.
529 │  *
530 │  * The minLengthValidator respects every length property in an object, regardless of whether it's an array.
531 │  * For example, the object {id: 1, length: 0, width: 0} should be validated.
532 │  */
533 │ export function minLengthValidator(minLength: number): ValidatorFn {
534 │   return (control: AbstractControl): ValidationErrors | null => {
535 ▶     const length = control.value?.length ?? lengthOrSize(control.value);
536 ▶     if (length === null || length === 0) {
537 │       // don't validate empty values to allow optional controls
538 │       // don't validate values without `length` or `size` property
539 ▶       return null;
540 │     }
541 │ 
542 ▶     return length < minLength
543 ▶       ? {'minlength': {'requiredLength': minLength, 'actualLength': length}}
544 │       : null;
545 │   };
546 │ }
```

`minLength` は `isEmptyInputValue` を使わず、自分で長さを取ります。535 行目、まず `value?.length`、無ければ `lengthOrSize`。536 行目で長さが `null`（長さを持たない値）か `0`（空）なら、539 行目で `null` を返します。だから **空文字に `minLength(3)` は効きません**。542〜543 行目のエラーの形は `{minlength: {requiredLength, actualLength}}` で、キーは小文字の `minlength` です。

📄 `angular/packages/forms/src/validators.ts` L466–480 （▶ の行: 472, 475, 478）

```ts
466 │ /**
467 │  * Validator that requires the control's value to be greater than or equal to the provided number.
468 │  * See `Validators.min` for additional information.
469 │  */
470 │ export function minValidator(min: number): ValidatorFn {
471 │   return (control: AbstractControl): ValidationErrors | null => {
472 ▶     if (control.value == null || min == null) {
473 │       return null; // don't validate empty values to allow optional controls
474 │     }
475 ▶     const value = parseFloat(control.value);
476 │     // Controls with NaN values after parsing should be treated as not having a
477 │     // minimum, per the HTML forms spec: https://www.w3.org/TR/html5/forms.html#attr-input-min
478 ▶     return !isNaN(value) && value < min ? {'min': {'min': min, 'actual': control.value}} : null;
479 │   };
480 │ }
```

`min` はさらに違います。472 行目で見ているのは `control.value == null` だけで、空文字は通り抜けます。そのあと 475 行目の `parseFloat('')` が `NaN` になり、478 行目の `!isNaN(value)` で `null` になります。結果は同じ「空はエラー無し」ですが、理由の行が違います。`'2'` のような文字列も `parseFloat` で数に直して比べます。

| 検証関数 | 空の値（`''`）のとき | 理由の行 |
| --- | --- | --- |
| `required` | `{required: true}` | 503（`isEmptyInputValue`） |
| `requiredTrue` | `{required: true}` | 512（`=== true` だけを見る） |
| `email` | `null` | 520〜521（`isEmptyInputValue`） |
| `minLength` | `null` | 535〜539（自分で長さを見る） |
| `min` | `null` | 472・475・478（`parseFloat` が `NaN`） |
| `pattern` | `null` | 588〜589（次の引用） |

## 3. pattern：文字列なら ^ と $ を足す

📄 `angular/packages/forms/src/validators.ts` L565–596 （▶ の行: 570, 576, 580, 582, 584–585, 588–589, 592）

```ts
565 │ /**
566 │  * Validator that requires the control's value to match a regex pattern.
567 │  * See `Validators.pattern` for additional information.
568 │  */
569 │ export function patternValidator(pattern: string | RegExp): ValidatorFn {
570 ▶   if (!pattern) return nullValidator;
571 │   let regex: RegExp;
572 │   let regexStr: string;
573 │   if (typeof pattern === 'string') {
574 │     regexStr = '';
575 │ 
576 ▶     if (pattern.charAt(0) !== '^') regexStr += '^';
577 │ 
578 │     regexStr += pattern;
579 │ 
580 ▶     if (pattern.charAt(pattern.length - 1) !== '$') regexStr += '$';
581 │ 
582 ▶     regex = new RegExp(regexStr);
583 │   } else {
584 ▶     regexStr = pattern.toString();
585 ▶     regex = pattern;
586 │   }
587 │   return (control: AbstractControl): ValidationErrors | null => {
588 ▶     if (isEmptyInputValue(control.value)) {
589 ▶       return null; // don't validate empty values to allow optional controls
590 │     }
591 │     const value: string = control.value;
592 ▶     return regex.test(value)
593 │       ? null
594 │       : {'pattern': {'requiredPattern': regexStr, 'actualValue': value}};
595 │   };
596 │ }
```

1. **570 行目：パターンが空なら何もしない関数**

   `pattern(null)` や `pattern('')` は、何もせず `null` を返す `nullValidator`（静的メソッド版は 1 節の 429〜431 行目）をそのまま返します。
2. **576・580 行目：文字列には ^ と $ を足す**

   先頭が `^` でなければ足し、末尾が `$` でなければ足します。だから `pattern('[a-z]*')` は「全体が小文字」の意味になり、`'abc'` に `pattern('b')` は失敗します（`requiredPattern` は `'^b$'`）。
3. **584〜585 行目：RegExp はそのまま使う**

   `RegExp` オブジェクトを渡すと `^` も `$` も足しません。部分一致のままです。592 行目は同じ `regex` オブジェクトの `test` を毎回呼ぶので、`g` フラグ付きの RegExp を渡すと、JavaScript の `lastIndex` が呼び出しをまたいで残ります。
4. **588〜589 行目：空は検証しない**

   `email` と同じく `isEmptyInputValue` で空を通します。

## 4. 複数の検証関数を 1 つにまとめる

`new FormControl('', [Validators.required, Validators.minLength(3)])` と書いたとき、配列はそのまま保存されるのではなく、1 つの関数に合成されます。入口は `abstract_model.ts` の 2 つの小さな関数です。

📄 `angular/packages/forms/src/model/abstract_model.ts` L193–204 （▶ の行: 196, 203）

```ts
193 │ export function pickValidators(
194 │   validatorOrOpts?: ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
195 │ ): ValidatorFn | ValidatorFn[] | null {
196 ▶   return (isOptionsObj(validatorOrOpts) ? validatorOrOpts.validators : validatorOrOpts) || null;
197 │ }
198 │ 
199 │ /**
200 │  * Creates validator function by combining provided validators.
201 │  */
202 │ function coerceToValidator(validator: ValidatorFn | ValidatorFn[] | null): ValidatorFn | null {
203 ▶   return Array.isArray(validator) ? composeValidators(validator) : validator || null;
204 │ }
```

196 行目の `pickValidators` は、2 つ目の引数が options オブジェクト（`{validators, updateOn}`）なら `validators` を、そうでなければ引数そのものを取り出します。203 行目の `coerceToValidator` は、**配列のときだけ**`composeValidators` で 1 つの関数にし、単体の関数ならそのまま使います。

📄 `angular/packages/forms/src/validators.ts` L645–682 （▶ の行: 653, 655, 657, 666–668, 670–671, 681）

```ts
645 │ /**
646 │  * Given the list of validators that may contain both functions as well as classes, return the list
647 │  * of validator functions (convert validator classes into validator functions). This is needed to
648 │  * have consistent structure in validators list before composing them.
649 │  *
650 │  * @param validators The set of validators that may contain validators both in plain function form
651 │  *     as well as represented as a validator class.
652 │  */
653 ▶ export function normalizeValidators<V>(validators: (V | Validator | AsyncValidator)[]): V[] {
654 │   return validators.map((validator) => {
655 ▶     return isValidatorFn<V>(validator)
656 │       ? validator
657 ▶       : (((c: AbstractControl) => validator.validate(c)) as unknown as V);
658 │   });
659 │ }
660 │ 
661 │ /**
662 │  * Merges synchronous validators into a single validator function.
663 │  * See `Validators.compose` for additional information.
664 │  */
665 │ function compose(validators: (ValidatorFn | null | undefined)[] | null): ValidatorFn | null {
666 ▶   if (!validators) return null;
667 ▶   const presentValidators: ValidatorFn[] = validators.filter(isPresent) as any;
668 ▶   if (presentValidators.length == 0) return null;
669 │ 
670 ▶   return function (control: AbstractControl) {
671 ▶     return mergeErrors(executeValidators<ValidatorFn>(control, presentValidators));
672 │   };
673 │ }
674 │ 
675 │ /**
676 │  * Accepts a list of validators of different possible shapes (`Validator` and `ValidatorFn`),
677 │  * normalizes the list (converts everything to `ValidatorFn`) and merges them into a single
678 │  * validator function.
679 │  */
680 │ export function composeValidators(validators: Array<Validator | ValidatorFn>): ValidatorFn | null {
681 ▶   return validators != null ? compose(normalizeValidators<ValidatorFn>(validators)) : null;
682 │ }
```

1. **681 行目：composeValidators = normalize してから compose**

   配列を受け取り、まず `normalizeValidators`、その結果を `compose` に渡します。
2. **653〜657 行目：Validator オブジェクトを関数に直す**

   配列には関数だけでなく、`validate(c)` メソッドを持つオブジェクト（`RequiredValidator` などのディレクティブ）も入りえます。655 行目で関数ならそのまま、そうでなければ 657 行目で `(c) => validator.validate(c)` という関数に包みます。ディレクティブが `NG_VALIDATORS` で自分を差し出す流れは[第 14 回](14-forms-validator-directives.md)です。
3. **666〜668 行目：null を捨て、空なら null**

   667 行目で `null` / `undefined` を取り除き、何も残らなければ 668 行目で合成関数そのものが `null` になります。
4. **670〜671 行目：合成した関数**

   検証のたびに全部の関数を呼び（`executeValidators`）、結果を `mergeErrors` で 1 つにします。

📄 `angular/packages/forms/src/validators.ts` L623–643 （▶ の行: 626, 629, 638, 642）

```ts
623 │ function mergeErrors(arrayOfErrors: (ValidationErrors | null)[]): ValidationErrors | null {
624 │   let res: {[key: string]: any} = {};
625 │   arrayOfErrors.forEach((errors: ValidationErrors | null) => {
626 ▶     res = errors != null ? {...res!, ...errors} : res!;
627 │   });
628 │ 
629 ▶   return Object.keys(res).length === 0 ? null : res;
630 │ }
631 │ 
632 │ type GenericValidatorFn = (control: AbstractControl) => any;
633 │ 
634 │ function executeValidators<V extends GenericValidatorFn>(
635 │   control: AbstractControl,
636 │   validators: V[],
637 │ ): ReturnType<V>[] {
638 ▶   return validators.map((validator) => validator(control));
639 │ }
640 │ 
641 │ function isValidatorFn<V>(validator: V | Validator | AsyncValidator): validator is V {
642 ▶   return !(validator as Validator).validate;
643 │ }
```

638 行目の `executeValidators` は配列の順に呼んで結果を並べるだけです。626 行目の `mergeErrors` は、`null` でない結果をスプレッドで重ねていきます。**同じキーなら後ろの関数が勝ちます**。629 行目、キーが 1 つも無ければ `{}` ではなく `null` を返します。642 行目の `isValidatorFn` は「`validate` プロパティが無ければ関数」とみなす判定で、上の 655 行目が使っています。

> [!WARNING]
> **ハマりどころ**
>
> **errors が `{}` になる道がある。** 629 行目の「空なら null」は `compose` を通ったときだけ効きます。203 行目のとおり、単体の関数は合成されずにそのまま使われるので、自作の検証関数が `{}` を返すと `errors` は `{}` のままです。状態を決める `_calculateStatus`（abstract\_model.ts 1696 行目、[第 3 回](03-forms-update-value-validity.md)）は `if (this.errors)` で見るので、空のオブジェクトでも `INVALID` になります。下のデモの 2 つ目で確かめられます。

## 5. 足し外しと hasValidator：参照で比べる

📄 `angular/packages/forms/src/model/abstract_model.ts` L817–849 （▶ の行: 817–818, 838–839, 847–848）

```ts
817 ▶   setValidators(validators: ValidatorFn | ValidatorFn[] | null): void {
818 ▶     this._assignValidators(validators);
819 │   }
820 │ 
821 │   /**
822 │    * Sets the asynchronous validators that are active on this control. Calling this
823 │    * overwrites any existing asynchronous validators.
824 │    *
825 │    * When you add or remove a validator at run time, you must call
826 │    * `updateValueAndValidity()` for the new validation to take effect.
827 │    *
828 │    * If you want to add a new validator without affecting existing ones, consider
829 │    * using `addAsyncValidators()` method instead.
830 │    */
831 │   setAsyncValidators(validators: AsyncValidatorFn | AsyncValidatorFn[] | null): void {
832 │     this._assignAsyncValidators(validators);
833 │   }
834 │ 
835 │   /**
836 │    * Add a synchronous validator or validators to this control, without affecting other validators.
837 │    *
838 ▶    * When you add or remove a validator at run time, you must call
839 ▶    * `updateValueAndValidity()` for the new validation to take effect.
840 │    *
841 │    * Adding a validator that already exists will have no effect. If duplicate validator functions
842 │    * are present in the `validators` array, only the first instance would be added to a form
843 │    * control.
844 │    *
845 │    * @param validators The new validator function or functions to add to this control.
846 │    */
847 ▶   addValidators(validators: ValidatorFn | ValidatorFn[]): void {
848 ▶     this.setValidators(addValidators(validators, this._rawValidators));
849 │   }
```

📄 `angular/packages/forms/src/model/abstract_model.ts` L1785–1808 （▶ の行: 1791–1793, 1807）

```ts
1785 │   /**
1786 │    * Internal implementation of the `setValidators` method. Needs to be separated out into a
1787 │    * different method, because it is called in the constructor and it can break cases where
1788 │    * a control is extended.
1789 │    */
1790 │   private _assignValidators(validators: ValidatorFn | ValidatorFn[] | null): void {
1791 ▶     this._rawValidators = Array.isArray(validators) ? validators.slice() : validators;
1792 ▶     this._composedValidatorFn = coerceToValidator(this._rawValidators);
1793 ▶     this._updateHasRequiredValidator();
1794 │   }
1795 │ 
1796 │   /**
1797 │    * Internal implementation of the `setAsyncValidators` method. Needs to be separated out into a
1798 │    * different method, because it is called in the constructor and it can break cases where
1799 │    * a control is extended.
1800 │    */
1801 │   private _assignAsyncValidators(validators: AsyncValidatorFn | AsyncValidatorFn[] | null): void {
1802 │     this._rawAsyncValidators = Array.isArray(validators) ? validators.slice() : validators;
1803 │     this._composedAsyncValidatorFn = coerceToAsyncValidator(this._rawAsyncValidators);
1804 │   }
1805 │ 
1806 │   private _updateHasRequiredValidator(): void {
1807 ▶     untracked(() => this._hasRequired.set(this.hasValidator(Validators.required)));
1808 │   }
```

1. **818 行目 → 1791 行目：渡された配列をコピーして持つ**

   `setValidators` は `_assignValidators` を呼ぶだけです。1791 行目で配列なら `slice()` でコピーして `_rawValidators` に入れます。呼び出し側の配列をあとで書き換えても control には影響しません。
2. **1792 行目：合成した関数を作り直す**

   4 節の `coerceToValidator` で `_composedValidatorFn` を作ります。`control.validator` の getter が返すのはこちらです。
3. **1793・1807 行目：required を持っているかを signal に書く**

   1807 行目、`hasValidator(Validators.required)` の結果を `_hasRequired`（signal）に入れます。読むのは `NgControl` の `isRequired`（directives/ng\_control.ts 292 行目）で、自作の入力部品に `required` を渡すときに使われます （ディレクティブ側は[第 12 回](12-forms-reactive-directives.md)）。`untracked` の中では「いま動いている reactive な文脈」（signals の `activeConsumer`）が外れるので、`computed` などの中から `setValidators` が呼ばれても、signal への書き込みとして拒まれません（この行を入れた commit d1576ee92b0 のメッセージに理由の説明はありません）。
4. **838〜839 行目：検証はやり直さない**

   ここまでのどこにも `updateValueAndValidity` がありません。doc コメントのとおり、足し外ししたら自分で `updateValueAndValidity()` を呼ぶまで `errors` は古いままです。
5. **848 行目：addValidators は「今の配列 + 新しいもの」で setValidators**

   中で使う `addValidators`（validators.ts の同名の関数）を次に見ます。

📄 `angular/packages/forms/src/validators.ts` L762–799 （▶ の行: 766, 780, 787–788, 798）

```ts
762 │ export function hasValidator<T extends ValidatorFn | AsyncValidatorFn>(
763 │   validators: T | T[] | null,
764 │   validator: T,
765 │ ): boolean {
766 ▶   return Array.isArray(validators) ? validators.includes(validator) : validators === validator;
767 │ }
768 │ 
769 │ /**
770 │  * Combines two arrays of validators into one. If duplicates are provided, only one will be added.
771 │  *
772 │  * @param validators The new validators.
773 │  * @param currentValidators The base array of current validators.
774 │  * @returns An array of validators.
775 │  */
776 │ export function addValidators<T extends ValidatorFn | AsyncValidatorFn>(
777 │   validators: T | T[],
778 │   currentValidators: T | T[] | null,
779 │ ): T[] {
780 ▶   const current = makeValidatorsArray(currentValidators);
781 │   const validatorsToAdd = makeValidatorsArray(validators);
782 │   validatorsToAdd.forEach((v: T) => {
783 │     // Note: if there are duplicate entries in the new validators array,
784 │     // only the first one would be added to the current list of validators.
785 │     // Duplicate ones would be ignored since `hasValidator` would detect
786 │     // the presence of a validator function and we update the current list in place.
787 ▶     if (!hasValidator(current, v)) {
788 ▶       current.push(v);
789 │     }
790 │   });
791 │   return current;
792 │ }
793 │ 
794 │ export function removeValidators<T extends ValidatorFn | AsyncValidatorFn>(
795 │   validators: T | T[],
796 │   currentValidators: T | T[] | null,
797 │ ): T[] {
798 ▶   return makeValidatorsArray(currentValidators).filter((v) => !hasValidator(validators, v));
799 │ }
```

766 行目が核心です。配列なら `includes`、単体なら `===`。**どちらも参照の一致**で、関数の中身は比べません。787〜788 行目の `addValidators` は、まだ持っていない関数だけを足します（同じ参照を 2 回足しても 1 つ）。780 行目の `makeValidatorsArray` は単体の関数も配列に直すので、`addValidators` を通った control の検証関数は必ず配列になり、4 節の `compose` を通ります。798 行目の `removeValidators` は、渡された関数と参照が一致するものを `filter` で外します。

📄 `angular/packages/forms/src/model/abstract_model.ts` L885–895 （▶ の行: 885, 893–894）

````ts
885 ▶    * ctrl.removeValidators(minValidator);
886 │    * ```
887 │    *
888 │    * When you add or remove a validator at run time, you must call
889 │    * `updateValueAndValidity()` for the new validation to take effect.
890 │    *
891 │    * @param validators The validator or validators to remove.
892 │    */
893 ▶   removeValidators(validators: ValidatorFn | ValidatorFn[]): void {
894 ▶     this.setValidators(removeValidators(validators, this._rawValidators));
895 │   }
````

📄 `angular/packages/forms/src/model/abstract_model.ts` L930–958 （▶ の行: 933–934, 956–957）

```ts
930 │    * @param validator The validator to check for presence. Compared by function reference.
931 │    * @returns Whether the provided validator was found on this control.
932 │    */
933 ▶   hasValidator(validator: ValidatorFn): boolean {
934 ▶     return hasValidator(this._rawValidators, validator);
935 │   }
936 │ 
937 │   /**
938 │    * Check whether an asynchronous validator function is present on this control. The provided
939 │    * validator must be a reference to the exact same function that was provided.
940 │    *
941 │    * @param validator The asynchronous validator to check for presence. Compared by function
942 │    *     reference.
943 │    * @returns Whether the provided asynchronous validator was found on this control.
944 │    */
945 │   hasAsyncValidator(validator: AsyncValidatorFn): boolean {
946 │     return hasValidator(this._rawAsyncValidators, validator);
947 │   }
948 │ 
949 │   /**
950 │    * Empties out the synchronous validator list.
951 │    *
952 │    * When you add or remove a validator at run time, you must call
953 │    * `updateValueAndValidity()` for the new validation to take effect.
954 │    *
955 │    */
956 ▶   clearValidators(): void {
957 ▶     this.validator = null;
958 │   }
```

934 行目の `hasValidator` は `_rawValidators`（コピーした元の配列）に対して 766 行目を呼びます。1 節で見たとおり `Validators.minLength(3)` は呼ぶたびに 534 行目の `return (control) => …` で**新しい関数**を作るので、もう一度 `Validators.minLength(3)` と書いて渡しても見つかりません（`Validators.minLength(3) === Validators.minLength(3)` は `false`）。`Validators.required` は毎回同じ静的メソッドなので見つかります。957 行目の `clearValidators` は `validator` の setter に `null` を入れ、setter が `_rawValidators` も空にします（setter は abstract\_model.ts 587〜589 行目、[第 2 回](02-forms-abstract-control.md)の範囲）。

> **🧪 DEMO — 本物の FormControl に Validators を足し外しする**
>
> @angular/forms 22.1.6 の `FormControl` と `[formControl]` です。チェックボックスは `addValidators` / `removeValidators` のあとに `updateValueAndValidity()` を呼びます。minLength のチェックボックスが使う関数は、章のコンポーネントが 1 回だけ作って持っている参照です。
>
> 2 つ目：`{}` を返す自作の検証関数を、単体で渡すか配列で渡すか。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-validators)

試すと次のことが見えます。

- minLength だけを付けて空にすると `errors` は `null`。1 文字入れると `minlength` が出る（536 行目）。
- 「新しく作った Validators.minLength(3) で removeValidators」を押しても、minLength のチェックは外れない（766 行目の参照比較）。
- `{}` を単体で渡すと `errors: {}` で `INVALID`、配列で渡すと `null` で `VALID`（203 行目と 629 行目）。

## ここまでの流れ

- 👤 `new FormControl('', [required, minLength(3)])` — あなたのコード
  - `pickValidators(validatorOrOpts)` — abstract\_model.ts 196 — *options なら validators を取り出す*
  - `_assignValidators(validators)` — abstract\_model.ts 1790 — *slice でコピー*
    - `coerceToValidator → composeValidators` — abstract\_model.ts 203 / validators.ts 681 — *配列のときだけ合成*
      - `normalizeValidators → compose` — validators.ts 653 / 665 — *Validator オブジェクトを関数に、null を捨てる*
    - `_updateHasRequiredValidator()` — abstract\_model.ts 1806 — *\_hasRequired signal*
- `updateValueAndValidity() → _runValidator()` — abstract\_model.ts（第 3 回） — *合成関数を 1 回呼ぶ*
  - `executeValidators → mergeErrors` — validators.ts 638 / 623 — *後ろが勝つ、空なら null*

## テストと直し方

組み込みの検証関数と合成は `packages/forms/test/validators_spec.ts` が確かめています。外側が 49 行目の `describe('Validators')`、その中に関数ごとの describe（52 行目 `min`、184 行目 `required`、250 行目 `minLength`、387 行目 `pattern`、444 行目 `compose`、470 行目 `composeAsync`）が並びます。

📄 `angular/packages/forms/test/validators_spec.ts` L444–468 （▶ の行: 444, 454, 456, 459, 461）

```ts
444 ▶     describe('compose', () => {
445 │       it('should return null when given null', () => {
446 │         expect(Validators.compose(null!)).toBe(null);
447 │       });
448 │ 
449 │       it('should collect errors from all the validators', () => {
450 │         const c = Validators.compose([validator('a', true), validator('b', true)])!;
451 │         expect(c(new FormControl(''))).toEqual({'a': true, 'b': true});
452 │       });
453 │ 
454 ▶       it('should run validators left to right', () => {
455 │         const c = Validators.compose([validator('a', 1), validator('a', 2)])!;
456 ▶         expect(c(new FormControl(''))).toEqual({'a': 2});
457 │       });
458 │ 
459 ▶       it('should return null when no errors', () => {
460 │         const c = Validators.compose([Validators.nullValidator, Validators.nullValidator])!;
461 ▶         expect(c(new FormControl(''))).toBeNull();
462 │       });
463 │ 
464 │       it('should ignore nulls', () => {
465 │         const c = Validators.compose([null!, Validators.required])!;
466 │         expect(c(new FormControl(''))).toEqual({'required': true});
467 │       });
468 │     });
```

454〜457 行目の「左から右へ」は、626 行目のスプレッドで後ろが勝つことをそのまま確かめています（`{a: 2}`）。459〜462 行目は 629 行目の「空なら null」です。

📄 `angular/packages/forms/test/form_control_spec.ts` L420–431 （▶ の行: 425, 428–429）

```ts
420 │ 
421 │         control.removeAsyncValidators(firstValidator);
422 │         expect(originalValidators.length).toBe(1);
423 │       });
424 │ 
425 ▶       it('should return false when checking presence of a validator not identical by reference', () => {
426 │         const minValidator = Validators.min(5);
427 │         const c = new FormControl('1', minValidator);
428 ▶         expect(c.hasValidator(minValidator)).toEqual(true);
429 ▶         expect(c.hasValidator(Validators.min(5))).toEqual(false);
430 │       });
431 │     });
```

参照比較は `form_control_spec.ts` の 186 行目 `describe('validator')` の最後、425〜430 行目にあります。429 行目が「新しく作った `Validators.min(5)` は見つからない」で、デモの minLength と同じ話です。

📄 `ターミナル`

```
cd ~/angular-research/angular

# validators_spec.ts の describe('Validators') > describe('minLength') だけ
pnpm bazel test //packages/forms/test:test \
  --test_arg=--filter="Validators minLength" --test_output=all

# 2026-11-01 にこのマシンで走らせた結果（~/…/scratchpad/forms-logs/b-forms-validators.log から抜粋）
Ran 13 of 1153 specs
13 specs, 0 failures
//packages/forms/test:test                                               PASSED in 0.8s

# hasValidator / addValidators / removeValidators は form_control_spec.ts の describe('validator')
pnpm bazel test //packages/forms/test:test \
  --test_arg=--filter="FormControl validator" --test_output=all
# 2026-11-01 の実行: Ran 22 of 1153 specs / 22 specs, 0 failures
```

- `--filter` はフルネーム（describe と it をスペースでつないだ名前）への部分一致です。`"Validators compose"` と書くと `"Validators composeAsync …"` にも一致します。`compose` だけにしたいなら `"Validators compose should"` のように it の頭まで含めます。名前が一致しないと 0 本でも PASSED になる落とし穴は[第 1 回](01-forms-overview.md)にあります。
- **直すとしたら**：組み込みの検証関数の挙動は `validators.ts` の 466 行目から並ぶ `export function`（静的メソッドではなく、こちらが本体）。テストは `validators_spec.ts` のその関数の describe に `it` を足します。足し外し・`hasValidator` は `validators.ts` 762〜799 行目の補助関数と `abstract_model.ts` の `_assignValidators`、テストは `form_control_spec.ts` の `describe('validator')`（FormGroup なら `form_group_spec.ts` 1128 行目の `describe('validator')`）。
- エラーの形（`minlength` のキー名、`requiredLength` など）は公開 API の一部で、変えると利用者のテンプレートが壊れます。手元で壊して spec が落ちるのを見るところまでにして、issue を読むときの手がかりにしてください（issue の読み方は[第 20 回](20-forms-issues.md)）。

## 聞かれそうな質問

**Q. 空文字に minLength(3) が効かないのはなぜですか？**

`minLengthValidator` の 536 行目が、長さ 0 を「任意入力の空欄」とみなして 539 行目で `null` を返すからです。空も許さないなら `Validators.required` を一緒に付けます。`required` は 503 行目で空を `{required: true}` にします。

**Q. errors が null と {} では何が違いますか？**

`null` は「エラー無し」で `VALID`。`{}` はキーが無くても truthy なので、`_calculateStatus`（1696 行目の `if (this.errors)`）で `INVALID` になります。配列で渡した検証関数は `mergeErrors` の 629 行目で `{}` が `null` に直されますが、単体で渡すと 203 行目で合成を通らないので直りません。自作の検証関数は「エラー無しなら `null`」を返すのが約束です。

**Q. removeValidators(Validators.minLength(3)) が効きません。**

`removeValidators` は 798 行目で `hasValidator`（766 行目の `includes`）を使い、参照が一致するものだけを外します。`Validators.minLength(3)` は呼ぶたびに新しい関数を作る（534 行目）ので、足したときの関数とは別物です。足すときに `const min3 = Validators.minLength(3)` のように変数に持ち、その変数で外します。外したあとは `updateValueAndValidity()` も呼びます（838〜839 行目の doc のとおり、足し外しは検証をやり直さない）。

**Q. 2 つの検証関数が同じキーのエラーを返したらどうなりますか？**

626 行目で `{...res, ...errors}` と重ねるので、配列の後ろの関数の値が残ります。validators\_spec.ts 454〜457 行目の「should run validators left to right」がそれを確かめています。

**Q. Validator クラス（validate メソッドを持つオブジェクト）を FormControl に直接渡せますか？**

型の上では `ValidatorFn` なので渡せません。ただし配列で合成されるとき、`composeValidators` は 681 行目で必ず `normalizeValidators` を通し、657 行目で `validate` を呼ぶ関数に包みます。これはディレクティブ（`RequiredValidator` など）を混ぜるための仕組みで、使っているのは[第 14 回](14-forms-validator-directives.md)の配線です。

## 読み終えて

- `Validators.xxx` は 466 行目以降の関数を呼ぶだけの入口。`required` は関数そのもの、`minLength(3)` は関数を作る関数
- 空の値は `required` の担当。`email`・`pattern` は `isEmptyInputValue`、`minLength` は自分の長さの判定、`min` は `parseFloat` の `NaN` で、それぞれ空を通す
- 配列の検証関数は `normalizeValidators → compose` で 1 つになり、結果は `mergeErrors` で後ろ勝ち・空なら `null`
- `hasValidator` / `removeValidators` は参照の一致。足し外しは検証をやり直さないので `updateValueAndValidity()` を自分で呼ぶ

---

← 前: [updateValueAndValidity：値と検証が親へ伝わる全手順](03-forms-update-value-validity.md)  
次: [非同期の検証：PENDING と打ち切り](05-forms-async-validators.md) →
