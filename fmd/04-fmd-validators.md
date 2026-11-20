[目次](../README.md) › [Forms の説明文の読み残し](README.md) › 第 4 回 / 全 10 回

# Validators とバリデーターのディレクティブの説明文

> validators.ts と directives/validators.ts の未読の行：NG\_VALIDATORS の例、required・requiredTrue・min・max・email・minLength・maxLength・pattern・compose の説明と例を境界の入力で試し、required・minlength・max・pattern・email のディレクティブが属性をどう読むかを本物で確かめる。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-validators)

---

`Validators` の静的メソッドの説明文は、1 つずつ「この値でこの errors になる」という例を持っています。この章は、その例の入力と、説明に書かれた境界（空文字・null・配列・数の文字列・`pattern` の `^` と `$`）を、本物の検証関数に表で通します。後半は `required`・`minlength`・`max`・`pattern`・`email` のディレクティブの説明文を読み、属性の値の受け方を本物の `FormsModule` で確かめます。

読む対象は `packages/forms/src/validators.ts` と `packages/forms/src/directives/validators.ts`（../angular、8576f161ae4）です。検証関数の中身（`isEmptyInputValue`、`pattern` の組み立て、`compose`）は[Validators の章](../forms/04-forms-validators.md)、ディレクティブが control に検証関数を足す流れ（`AbstractValidatorDirective` の `ngOnChanges`）は[検証のディレクティブの章](../forms/14-forms-validator-directives.md)にあります。

1. [1. AbstractControl](01-fmd-abstract-model.md)
2. [2. FormGroup・FormRecord・FormArray](02-fmd-group-array.md)
3. [3. FormControl と FormBuilder](03-fmd-control-builder.md)
4. **4. Validators**（この章）
5. [5. エラーの文言と小道具](05-fmd-errors.md)
6. [6. NgControl](06-fmd-ng-control.md)
7. [7. リアクティブのディレクティブ](07-fmd-reactive-dirs.md)
8. [8. テンプレート駆動のディレクティブ](08-fmd-template-dirs.md)
9. [9. 値のアクセサー](09-fmd-accessors.md)
10. [10. spec と issue](10-fmd-tests-issues.md)

## 1. NG\_VALIDATORS と NG\_ASYNC\_VALIDATORS の例

📄 `angular/packages/forms/src/validators.ts` L51–84 （▶ の行: 62–63, 68, 70–72）

````ts
51 │ /**
52 │  * @description
53 │  * An `InjectionToken` for registering additional synchronous validators used with
54 │  * `AbstractControl`s.
55 │  *
56 │  * @see {@link NG_ASYNC_VALIDATORS}
57 │  *
58 │  * @usageNotes
59 │  *
60 │  * ### Providing a custom validator
61 │  *
62 ▶  * The following example registers a custom validator directive. Adding the validator to the
63 ▶  * existing collection of validators requires the `multi: true` option.
64 │  *
65 │  * ```ts
66 │  * @Directive({
67 │  *   selector: '[customValidator]',
68 ▶  *   providers: [{provide: NG_VALIDATORS, useExisting: forwardRef(() => CustomValidatorDirective), multi: true}]
69 │  * })
70 ▶  * class CustomValidatorDirective implements Validator {
71 ▶  *   validate(control: AbstractControl): ValidationErrors | null {
72 ▶  *     return { 'custom': true };
73 │  *   }
74 │  * }
75 │  * ```
76 │  *
77 │  * @see [Defining custom validators](guide/forms/form-validation#defining-custom-validators)
78 │  *
79 │  * @publicApi
80 │  */
81 │ export const NG_VALIDATORS = new InjectionToken<ReadonlyArray<Validator | Function>>(
82 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'NgValidators' : '',
83 │ );
84 │ 
````

📄 `angular/packages/forms/src/validators.ts` L85–118 （▶ の行: 101–102, 104–105）

````ts
 85 │ /**
 86 │  * @description
 87 │  * An `InjectionToken` for registering additional asynchronous validators used with
 88 │  * `AbstractControl`s.
 89 │  *
 90 │  * @see {@link NG_VALIDATORS}
 91 │  *
 92 │  * @usageNotes
 93 │  *
 94 │  * ### Provide a custom async validator directive
 95 │  *
 96 │  * The following example implements the `AsyncValidator` interface to create an
 97 │  * async validator directive with a custom error key.
 98 │  *
 99 │  * ```ts
100 │  * @Directive({
101 ▶  *   selector: '[customAsyncValidator]',
102 ▶  *   providers: [{provide: NG_ASYNC_VALIDATORS, useExisting: CustomAsyncValidatorDirective, multi:
103 │  * true}]
104 ▶  * })
105 ▶  * class CustomAsyncValidatorDirective implements AsyncValidator {
106 │  *   validate(control: AbstractControl): Promise<ValidationErrors|null> {
107 │  *     return Promise.resolve({'custom': true});
108 │  *   }
109 │  * }
110 │  * ```
111 │  *
112 │  * @see [Implementing a custom async validator](guide/forms/form-validation#implementing-a-custom-async-validator)
113 │  *
114 │  * @publicApi
115 │  */
116 │ export const NG_ASYNC_VALIDATORS = new InjectionToken<ReadonlyArray<Validator | Function>>(
117 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'NgAsyncValidators' : '',
118 │ );
````

2 つの例は、strict と `experimentalDecorators` の tsc に通ります。101 行目は `forwardRef` を使わずにクラスの宣言より前で `CustomAsyncValidatorDirective` を書いていますが、デコレーターの引数はクラスを定義したあとに評価されるので、型検査も実行も通ります。101〜102 行目の `multi:` の後ろの改行は、コメントの中で行を折っただけです。62〜63 行目の「足すには `multi: true` が要る」の意味（同じトークンに並べて集める）は[multi プロバイダーの章](../di/09-di-multi-providers.md)にあります。

📄 `angular/packages/forms/src/directives/validators.ts` L294–326 （▶ の行: 307, 311, 315–316）

````ts
294 │ 
295 │ /**
296 │  * @description
297 │  * An interface implemented by classes that perform asynchronous validation.
298 │  *
299 │  * @usageNotes
300 │  *
301 │  * ### Provide a custom async validator directive
302 │  *
303 │  * The following example implements the `AsyncValidator` interface to create an
304 │  * async validator directive with a custom error key.
305 │  *
306 │  * ```ts
307 ▶  * import { of } from 'rxjs';
308 │  *
309 │  * @Directive({
310 │  *   selector: '[customAsyncValidator]',
311 ▶  *   providers: [{provide: NG_ASYNC_VALIDATORS, useExisting: CustomAsyncValidatorDirective, multi:
312 │  * true}]
313 │  * })
314 │  * class CustomAsyncValidatorDirective implements AsyncValidator {
315 ▶  *   validate(control: AbstractControl): Observable<ValidationErrors|null> {
316 ▶  *     return of({'custom': true});
317 │  *   }
318 │  * }
319 │  * ```
320 │  *
321 │  * @see [Creating asynchronous validators](guide/forms/form-validation#creating-asynchronous-validators)
322 │  *
323 │  * @publicApi
324 │  */
325 │ export interface AsyncValidator extends Validator {
326 │   /**
````

directives/validators.ts の `AsyncValidator` の例は、307 行目で `of` だけを import し、315 行目で `Observable` を使います。そのまま貼ると `TS2304: Cannot find name 'Observable'` です（テストの節）。

## 2. メールの正規表現の説明

📄 `angular/packages/forms/src/validators.ts` L120–152 （▶ の行: 123, 127–129, 134, 151）

```ts
120 │ /**
121 │  * A regular expression that matches valid e-mail addresses.
122 │  *
123 ▶  * At a high level, this regexp matches e-mail addresses of the format `local-part@tld`, where:
124 │  * - `local-part` consists of one or more of the allowed characters (alphanumeric and some
125 │  *   punctuation symbols).
126 │  * - `local-part` cannot begin or end with a period (`.`).
127 ▶  * - `local-part` cannot be longer than 64 characters.
128 ▶  * - `tld` consists of one or more `labels` separated by periods (`.`). For example `localhost` or
129 ▶  *   `foo.com`.
130 │  * - A `label` consists of one or more of the allowed characters (alphanumeric, dashes (`-`) and
131 │  *   periods (`.`)).
132 │  * - A `label` cannot begin or end with a dash (`-`) or a period (`.`).
133 │  * - A `label` cannot be longer than 63 characters.
134 ▶  * - The whole address cannot be longer than 254 characters.
135 │  *
136 │  * ## Implementation background
137 │  *
138 │  * This regexp was ported over from AngularJS (see there for git history):
139 │  * https://github.com/angular/angular.js/blob/c133ef836/src/ng/directive/input.js#L27
140 │  * It is based on the
141 │  * [WHATWG version](https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address) with
142 │  * some enhancements to incorporate more RFC rules (such as rules related to domain names and the
143 │  * lengths of different parts of the address). The main differences from the WHATWG version are:
144 │  *   - Disallow `local-part` to begin or end with a period (`.`).
145 │  *   - Disallow `local-part` length to exceed 64 characters.
146 │  *   - Disallow total address length to exceed 254 characters.
147 │  *
148 │  * See [this commit](https://github.com/angular/angular.js/commit/f3f5cf72e) for more details.
149 │  */
150 │ const EMAIL_REGEXP =
151 ▶   /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
152 │ 
```

151 行目の先頭の `(?=.{1,254}$)` が 134 行目（全体 254 文字まで）、`(?=.{1,64}@)` が 127 行目（`@` の前 64 文字まで）です。DEMO では、`@` の前が 64 文字なら通り、65 文字で `{email: true}` になりました。123 行目の `local-part@tld` のとおり、`@` の後ろに点は要らず、`'a@b'` は通ります。`' a@b.com'` のように前に空白があると落ちます（入力欄が値を trim しない話は issue #54827）。

## 3. min・max・required・requiredTrue

📄 `angular/packages/forms/src/validators.ts` L153–188 （▶ の行: 157–158, 167, 174, 176）

````ts
153 │ /**
154 │  * @description
155 │  * Provides a set of built-in validators that can be used by form controls.
156 │  *
157 ▶  * A validator is a function that processes a `FormControl` or collection of
158 ▶  * controls and returns an error map or null. A null map means that validation has passed.
159 │  *
160 │  * @see [Form Validation](guide/forms/form-validation)
161 │  *
162 │  * @publicApi
163 │  */
164 │ export class Validators {
165 │   /**
166 │    * @description
167 ▶    * Validator that requires the control's value to be greater than or equal to the provided number.
168 │    *
169 │    * @usageNotes
170 │    *
171 │    * ### Validate against a minimum of 3
172 │    *
173 │    * ```ts
174 ▶    * const control = new FormControl(2, Validators.min(3));
175 │    *
176 ▶    * console.log(control.errors); // {min: {min: 3, actual: 2}}
177 │    * ```
178 │    *
179 │    * @returns A validator function that returns an error map with the
180 │    * `min` property if the validation check fails, otherwise `null`.
181 │    *
182 │    * @see {@link /api/forms/AbstractControl#updateValueAndValidity updateValueAndValidity}
183 │    *
184 │    */
185 │   static min(min: number): ValidatorFn {
186 │     return minValidator(min);
187 │   }
188 │ 
````

📄 `angular/packages/forms/src/validators.ts` L189–211 （▶ の行: 191, 198, 200）

````ts
189 │   /**
190 │    * @description
191 ▶    * Validator that requires the control's value to be less than or equal to the provided number.
192 │    *
193 │    * @usageNotes
194 │    *
195 │    * ### Validate against a maximum of 15
196 │    *
197 │    * ```ts
198 ▶    * const control = new FormControl(16, Validators.max(15));
199 │    *
200 ▶    * console.log(control.errors); // {max: {max: 15, actual: 16}}
201 │    * ```
202 │    *
203 │    * @returns A validator function that returns an error map with the
204 │    * `max` property if the validation check fails, otherwise `null`.
205 │    *
206 │    * @see {@link /api/forms/AbstractControl#updateValueAndValidity updateValueAndValidity}
207 │    *
208 │    */
209 │   static max(max: number): ValidatorFn {
210 │     return maxValidator(max);
211 │   }
````

📄 `angular/packages/forms/src/validators.ts` L481–497 （▶ の行: 488–489, 491–494）

```ts
481 │ 
482 │ /**
483 │  * Validator that requires the control's value to be less than or equal to the provided number.
484 │  * See `Validators.max` for additional information.
485 │  */
486 │ export function maxValidator(max: number): ValidatorFn {
487 │   return (control: AbstractControl): ValidationErrors | null => {
488 ▶     if (control.value == null || max == null) {
489 ▶       return null; // don't validate empty values to allow optional controls
490 │     }
491 ▶     const value = parseFloat(control.value);
492 ▶     // Controls with NaN values after parsing should be treated as not having a
493 ▶     // maximum, per the HTML forms spec: https://www.w3.org/TR/html5/forms.html#attr-input-max
494 ▶     return !isNaN(value) && value > max ? {'max': {'max': max, 'actual': control.value}} : null;
495 │   };
496 │ }
497 │ 
```

167 行目と 191 行目は「値が数以上（以下）」とだけ書きます。実装は 488 行目で `null` と `undefined` だけを外し、491 行目で `parseFloat` します。だから文字列も配列も数として読みます（`min` も同じ形、L470〜480、[Validators の章](../forms/04-forms-validators.md)）。

| 入力 | `min(3)` の errors | 理由 |
| --- | --- | --- |
| `2` / `'2'` | `{min: {min: 3, actual: 2}}` / `actual: '2'` | 174〜176 行目の例。`actual` には元の値（文字列のまま）が入る |
| `'2abc'` | `{min: …, actual: '2abc'}` | `parseFloat('2abc')` は 2 |
| `'abc'` / `''` | `null` | `NaN` なので検証しない（492〜493 行目のコメントの HTML の決まり） |
| `[2]` | `{min: …, actual: [2]}` | `parseFloat([2])` は文字列 `'2'` を経て 2 |
| `'1e2'`（`max(15)`） | `{max: …, actual: '1e2'}` | 100 と読む |

📄 `angular/packages/forms/src/validators.ts` L212–235 （▶ の行: 215, 222, 224）

````ts
212 │ 
213 │   /**
214 │    * @description
215 ▶    * Validator that requires the control have a non-empty value.
216 │    *
217 │    * @usageNotes
218 │    *
219 │    * ### Validate that the field is non-empty
220 │    *
221 │    * ```ts
222 ▶    * const control = new FormControl('', Validators.required);
223 │    *
224 ▶    * console.log(control.errors); // {required: true}
225 │    * ```
226 │    *
227 │    * @returns An error map with the `required` property
228 │    * if the validation check fails, otherwise `null`.
229 │    *
230 │    * @see {@link /api/forms/AbstractControl#updateValueAndValidity updateValueAndValidity}
231 │    *
232 │    */
233 │   static required(control: AbstractControl): ValidationErrors | null {
234 │     return requiredValidator(control);
235 │   }
````

📄 `angular/packages/forms/src/validators.ts` L236–262 （▶ の行: 239–240, 247, 249）

````ts
236 │ 
237 │   /**
238 │    * @description
239 ▶    * Validator that requires the control's value be true. This validator is commonly
240 ▶    * used for required checkboxes.
241 │    *
242 │    * @usageNotes
243 │    *
244 │    * ### Validate that the field value is true
245 │    *
246 │    * ```ts
247 ▶    * const control = new FormControl('some value', Validators.requiredTrue);
248 │    *
249 ▶    * console.log(control.errors); // {required: true}
250 │    * ```
251 │    *
252 │    * @returns An error map that contains the `required` property
253 │    * set to `true` if the validation check fails, otherwise `null`.
254 │    *
255 │    * @see {@link /api/forms/AbstractControl#updateValueAndValidity updateValueAndValidity}
256 │    *
257 │    */
258 │   static requiredTrue(control: AbstractControl): ValidationErrors | null {
259 │     return requiredTrueValidator(control);
260 │   }
261 │ 
262 │   /**
````

215 行目の「空でない値」の空は、`isEmptyInputValue`（`null`・`undefined`・長さか size が 0）です。DEMO では `''`・`null`・`undefined`・`[]`・`new Set()` が `{required: true}`、`' '`・`0`・`false`・`['']`・`{}` は通りました。空白だけの文字列は空ではありません。247〜249 行目の `requiredTrue` は `=== true` だけを通すので、`'true'` も `'some value'` も `{required: true}` です（エラーのキーは `requiredTrue` ではなく `required`）。

## 4. email・minLength・maxLength

📄 `angular/packages/forms/src/validators.ts` L263–300 （▶ の行: 275–277, 287, 289）

````ts
263 │    * @description
264 │    * Validator that requires the control's value pass an email validation test.
265 │    *
266 │    * Tests the value using a [regular
267 │    * expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
268 │    * pattern suitable for common use cases. The pattern is based on the definition of a valid email
269 │    * address in the [WHATWG HTML
270 │    * specification](https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address) with
271 │    * some enhancements to incorporate more RFC rules (such as rules related to domain names and the
272 │    * lengths of different parts of the address).
273 │    *
274 │    * The differences from the WHATWG version include:
275 ▶    * - Disallow `local-part` (the part before the `@` symbol) to begin or end with a period (`.`).
276 ▶    * - Disallow `local-part` to be longer than 64 characters.
277 ▶    * - Disallow the whole address to be longer than 254 characters.
278 │    *
279 │    * If this pattern does not satisfy your business needs, you can use `Validators.pattern()` to
280 │    * validate the value against a different pattern.
281 │    *
282 │    * @usageNotes
283 │    *
284 │    * ### Validate that the field matches a valid email pattern
285 │    *
286 │    * ```ts
287 ▶    * const control = new FormControl('bad@', Validators.email);
288 │    *
289 ▶    * console.log(control.errors); // {email: true}
290 │    * ```
291 │    *
292 │    * @returns An error map with the `email` property
293 │    * if the validation check fails, otherwise `null`.
294 │    *
295 │    * @see {@link /api/forms/AbstractControl#updateValueAndValidity updateValueAndValidity}
296 │    *
297 │    */
298 │   static email(control: AbstractControl): ValidationErrors | null {
299 │     return emailValidator(control);
300 │   }
````

📄 `angular/packages/forms/src/validators.ts` L301–336 （▶ の行: 305–310, 318, 320, 324）

````ts
301 │ 
302 │   /**
303 │    * @description
304 │    * Validator that requires the number of items in the control's value to be greater than or equal
305 ▶    * to the provided minimum length. This validator is also provided by default if you use
306 ▶    * the HTML5 `minlength` attribute. Note that the `minLength` validator is intended to be used
307 ▶    * only for types that have a numeric `length` or `size` property, such as strings, arrays or
308 ▶    * sets. The `minLength` validator logic is also not invoked for values when their `length` or
309 ▶    * `size` property is 0 (for example in case of an empty string or an empty array), to support
310 ▶    * optional controls. You can use the standard `required` validator if empty values should not be
311 │    * considered valid.
312 │    *
313 │    * @usageNotes
314 │    *
315 │    * ### Validate that the field has a minimum of 3 characters
316 │    *
317 │    * ```ts
318 ▶    * const control = new FormControl('ng', Validators.minLength(3));
319 │    *
320 ▶    * console.log(control.errors); // {minlength: {requiredLength: 3, actualLength: 2}}
321 │    * ```
322 │    *
323 │    * ```html
324 ▶    * <input minlength="5">
325 │    * ```
326 │    *
327 │    * @returns A validator function that returns an error map with the
328 │    * `minlength` property if the validation check fails, otherwise `null`.
329 │    *
330 │    * @see {@link /api/forms/AbstractControl#updateValueAndValidity updateValueAndValidity}
331 │    *
332 │    */
333 │   static minLength(minLength: number): ValidatorFn {
334 │     return minLengthValidator(minLength);
335 │   }
336 │ 
````

📄 `angular/packages/forms/src/validators.ts` L337–368 （▶ の行: 340–343, 350, 352）

````ts
337 │   /**
338 │    * @description
339 │    * Validator that requires the number of items in the control's value to be less than or equal
340 ▶    * to the provided maximum length. This validator is also provided by default if you use
341 ▶    * the HTML5 `maxlength` attribute. Note that the `maxLength` validator is intended to be used
342 ▶    * only for types that have a numeric `length` or `size` property, such as strings, arrays or
343 ▶    * sets.
344 │    *
345 │    * @usageNotes
346 │    *
347 │    * ### Validate that the field has maximum of 5 characters
348 │    *
349 │    * ```ts
350 ▶    * const control = new FormControl('Angular', Validators.maxLength(5));
351 │    *
352 ▶    * console.log(control.errors); // {maxlength: {requiredLength: 5, actualLength: 7}}
353 │    * ```
354 │    *
355 │    * ```html
356 │    * <input maxlength="5">
357 │    * ```
358 │    *
359 │    * @returns A validator function that returns an error map with the
360 │    * `maxlength` property if the validation check fails, otherwise `null`.
361 │    *
362 │    * @see {@link /api/forms/AbstractControl#updateValueAndValidity updateValueAndValidity}
363 │    *
364 │    */
365 │   static maxLength(maxLength: number): ValidatorFn {
366 │     return maxLengthValidator(maxLength);
367 │   }
368 │ 
````

📄 `angular/packages/forms/src/validators.ts` L547–564 （▶ の行: 552–553, 557–558）

```ts
547 │ 
548 │ /**
549 │  * Validator that requires the number of items in the control's value to be less than or equal
550 │  * to the provided maximum length. See `Validators.maxLength` for additional information.
551 │  *
552 ▶  * The maxLengthValidator respects every length property in an object, regardless of whether it's an array.
553 ▶  * For example, the object {id: 1, length: 0, width: 0} should be validated.
554 │  */
555 │ export function maxLengthValidator(maxLength: number): ValidatorFn {
556 │   return (control: AbstractControl): ValidationErrors | null => {
557 ▶     const length = control.value?.length ?? lengthOrSize(control.value);
558 ▶     if (length !== null && length > maxLength) {
559 │       return {'maxlength': {'requiredLength': maxLength, 'actualLength': length}};
560 │     }
561 │     return null;
562 │   };
563 │ }
564 │ 
```

306〜307 行目と 341〜342 行目の「`length` か `size` を持つ型だけに使う」は、557 行目の `control.value?.length ?? lengthOrSize(control.value)` が決めます。数の `123456` には `length` が無いので、`maxLength(5)` でも通ります。`{length: 6}` のような物は 552 行目のとおり `length` を読まれて落ちます。308〜310 行目「長さ 0 なら `minLength` は検証しない」は `minLength` だけの約束で、`maxLength` の説明には無く、実装も 558 行目で長さ 0 を特別に扱いません（0 が最大を超えることは無いので結果は同じです）。553 行目の例「`{id: 1, length: 0, width: 0}` も検証する」は、`minLength` の側の同じコメント（L530〜531）にもありますが、`minLength` では長さ 0 は検証しないので、この例はちょうど検証されない物です（DEMO の `{length: 0}` は `null`）。

## 5. pattern：^ と $ を足す、の意味

📄 `angular/packages/forms/src/validators.ts` L369–406 （▶ の行: 379, 381, 390–391, 394, 396–397, 401, 404）

````ts
369 │   /**
370 │    * @description
371 │    * Validator that requires the control's value to match a regex pattern. This validator is also
372 │    * provided by default if you use the HTML5 `pattern` attribute.
373 │    *
374 │    * @usageNotes
375 │    *
376 │    * ### Validate that the field only contains letters or spaces
377 │    *
378 │    * ```ts
379 ▶    * const control = new FormControl('1', Validators.pattern('[a-zA-Z ]*'));
380 │    *
381 ▶    * console.log(control.errors); // {pattern: {requiredPattern: '^[a-zA-Z ]*$', actualValue: '1'}}
382 │    * ```
383 │    *
384 │    * ```html
385 │    * <input pattern="[a-zA-Z ]*">
386 │    * ```
387 │    *
388 │    * ### Pattern matching with the global or sticky flag
389 │    *
390 ▶    * `RegExp` objects created with the `g` or `y` flags that are passed into `Validators.pattern`
391 ▶    * can produce different results on the same input when validations are run consecutively. This is
392 │    * due to how the behavior of `RegExp.prototype.test` is
393 │    * specified in [ECMA-262](https://tc39.es/ecma262/#sec-regexpbuiltinexec)
394 ▶    * (`RegExp` preserves the index of the last match when the global or sticky flag is used).
395 │    * Due to this behavior, it is recommended that when using
396 ▶    * `Validators.pattern` you **do not** pass in a `RegExp` object with either the global or sticky
397 ▶    * flag enabled.
398 │    *
399 │    * ```ts
400 │    * // Not recommended (since the `g` flag is used)
401 ▶    * const controlOne = new FormControl('1', Validators.pattern(/foo/g));
402 │    *
403 │    * // Good
404 ▶    * const controlTwo = new FormControl('1', Validators.pattern(/foo/));
405 │    * ```
406 │    *
````

📄 `angular/packages/forms/src/validators.ts` L407–417 （▶ の行: 407–410）

```ts
407 ▶    * @param pattern A regular expression to be used as is to test the values, or a string.
408 ▶    * If a string is passed, the `^` character is prepended and the `$` character is
409 ▶    * appended to the provided string (if not already present), and the resulting regular
410 ▶    * expression is used to test the values.
411 │    *
412 │    * @returns A validator function that returns an error map with the
413 │    * `pattern` property if the validation check fails, otherwise `null`.
414 │    *
415 │    * @see {@link /api/forms/AbstractControl#updateValueAndValidity updateValueAndValidity}
416 │    *
417 │    */
```

408〜410 行目のとおり、文字列なら頭に `^`、末尾に `$` を、無ければ足します（組み立ては[Validators の章](../forms/04-forms-validators.md)の 3 節）。ここから分かることが 2 つあります。

1. **足すのは「文字列の端」**

   `'a|b'` は `'^a|b$'` になります。正規表現では `|` がいちばん弱く、これは「`^a` または `b$`」です。DEMO では `'ax'` も `'xb'` も通りました。全体に一致させたいなら `'(?:a|b)'` と書く必要があります。
2. **片方だけあれば、もう片方だけ足す**

   `'^abc'` は `'^abc$'` になり、`'abcd'` は落ちます。`RegExp` を渡すとそのまま使うので（407 行目「as is」）、`/abc/` は `'xabcx'` を通します。

390〜397 行目の `g` フラグの注意は、そのとおりに起きます。`Validators.pattern(/foo/g)` の control に `'foo'` を入れて 3 回続けて検証すると、`null` → `{pattern: …}` → `null` と交互になりました。`RegExp.prototype.test` が `lastIndex` を進めるからで、`/foo/` なら 3 回とも `null` です。

## 6. compose と composeAsync

📄 `angular/packages/forms/src/validators.ts` L432–464 （▶ の行: 435–436, 438–439, 444–445, 452–453）

```ts
432 │ 
433 │   /**
434 │    * @description
435 ▶    * Compose multiple validators into a single function that returns the union
436 ▶    * of the individual error maps for the provided control.
437 │    *
438 ▶    * @returns A validator function that returns an error map with the
439 ▶    * merged error maps of the validators if the validation check fails, otherwise `null`.
440 │    *
441 │    * @see {@link /api/forms/AbstractControl#updateValueAndValidity updateValueAndValidity}
442 │    *
443 │    */
444 ▶   static compose(validators: null): null;
445 ▶   static compose(validators: (ValidatorFn | null | undefined)[]): ValidatorFn | null;
446 │   static compose(validators: (ValidatorFn | null | undefined)[] | null): ValidatorFn | null {
447 │     return compose(validators);
448 │   }
449 │ 
450 │   /**
451 │    * @description
452 ▶    * Compose multiple async validators into a single function that returns the union
453 ▶    * of the individual error objects for the provided control.
454 │    *
455 │    * @returns A validator function that returns an error map with the
456 │    * merged error objects of the async validators if the validation check fails, otherwise `null`.
457 │    *
458 │    * @see {@link /api/forms/AbstractControl#updateValueAndValidity updateValueAndValidity}
459 │    *
460 │    */
461 │   static composeAsync(validators: (AsyncValidatorFn | null)[]): AsyncValidatorFn | null {
462 │     return composeAsync(validators);
463 │   }
464 │ }
```

435〜436 行目の「各 error の map の和」は、同じキーがあれば後ろが勝つ和です（`mergeErrors` のスプレッド、[Validators の章](../forms/04-forms-validators.md)の 4 節）。DEMO で `{k: 'a', onlyA: true}` と `{k: 'b'}` を返す 2 つを `compose([a, null, b])` にすると `{k: 'b', onlyA: true}` で、`null` は飛ばされます。`compose([])` と `compose(null)` は関数ではなく `null` を返します（444 行目の型も `null`）。

## 7. ディレクティブ：入力の読み方と、型

📄 `angular/packages/forms/src/directives/validators.ts` L34–64 （▶ の行: 35, 41, 45, 51, 62–63）

```ts
34 │ /**
35 ▶  * Method that updates string to integer if not already a number
36 │  *
37 │  * @param value The value to convert to integer.
38 │  * @returns value of parameter converted to number or integer.
39 │  */
40 │ function toInteger(value: string | number): number {
41 ▶   return typeof value === 'number' ? value : parseInt(value, 10);
42 │ }
43 │ 
44 │ /**
45 ▶  * Method that ensures that provided value is a float (and converts it to float if needed).
46 │  *
47 │  * @param value The value to convert to float.
48 │  * @returns value of parameter converted to number or float.
49 │  */
50 │ function toFloat(value: string | number): number {
51 ▶   return typeof value === 'number' ? value : parseFloat(value);
52 │ }
53 │ 
54 │ /**
55 │  * @description
56 │  * Defines the map of errors returned from failed validation checks.
57 │  *
58 │  * @see [Defining custom validators](guide/forms/form-validation#defining-custom-validators)
59 │  *
60 │  * @publicApi
61 │  */
62 ▶ export type ValidationErrors = {
63 ▶   [key: string]: any;
64 │ };
```

📄 `angular/packages/forms/src/directives/validators.ts` L504–533 （▶ の行: 507–508, 515, 520–521, 530）

```ts
504 │ 
505 │ /**
506 │  * @description
507 ▶  * A function that receives a control and synchronously returns a map of
508 ▶  * validation errors if present, otherwise null.
509 │  *
510 │  * @see [Defining custom validators](guide/forms/form-validation#defining-custom-validators)
511 │  *
512 │  * @publicApi
513 │  */
514 │ export interface ValidatorFn {
515 ▶   (control: AbstractControl): ValidationErrors | null;
516 │ }
517 │ 
518 │ /**
519 │  * @description
520 ▶  * A function that receives a control and returns a Promise or observable
521 ▶  * that emits validation errors if present, otherwise null.
522 │  *
523 │  * @see [Creating asynchronous validators](guide/forms/form-validation#creating-asynchronous-validators)
524 │  *
525 │  * @publicApi
526 │  */
527 │ export interface AsyncValidatorFn {
528 │   (
529 │     control: AbstractControl,
530 ▶   ): Promise<ValidationErrors | null> | Observable<ValidationErrors | null>;
531 │ }
532 │ 
533 │ /**
```

41 行目の `parseInt` は `minlength`・`maxlength`、51 行目の `parseFloat` は `min`・`max` の入力を数にします。`'abc'` は `NaN` になり、`enabled`（`input != null`）は `true` なので、検証関数は作られます。`length < NaN` は常に false なので、DEMO の `minlength="abc"` は何も検証せず、属性 `minlength="abc"` だけが DOM に残りました。

## 8. required と checkbox

📄 `angular/packages/forms/src/directives/validators.ts` L350–378 （▶ の行: 362–363, 372）

````ts
350 │ /**
351 │  * @description
352 │  * Provider which adds `CheckboxRequiredValidator` to the `NG_VALIDATORS` multi-provider list.
353 │  */
354 │ export const CHECKBOX_REQUIRED_VALIDATOR: Provider = {
355 │   provide: NG_VALIDATORS,
356 │   useExisting: forwardRef(() => CheckboxRequiredValidator),
357 │   multi: true,
358 │ };
359 │ 
360 │ /**
361 │  * @description
362 ▶  * A directive that adds the `required` validator to any controls marked with the
363 ▶  * `required` attribute. The directive is provided with the `NG_VALIDATORS` multi-provider list.
364 │  *
365 │  * @see [Form Validation](guide/forms/form-validation)
366 │  *
367 │  * @usageNotes
368 │  *
369 │  * ### Adding a required validator using template-driven forms
370 │  *
371 │  * ```html
372 ▶  * <input name="fullName" ngModel required>
373 │  * ```
374 │  *
375 │  * @ngModule FormsModule
376 │  * @ngModule ReactiveFormsModule
377 │  * @publicApi
378 │  */
````

📄 `angular/packages/forms/src/directives/validators.ts` L407–428 （▶ の行: 409–410, 422）

````ts
407 │ 
408 │ /**
409 ▶  * A Directive that adds the `required` validator to checkbox controls marked with the
410 ▶  * `required` attribute. The directive is provided with the `NG_VALIDATORS` multi-provider list.
411 │  *
412 │  * @see [Form Validation](guide/forms/form-validation)
413 │  *
414 │  * @usageNotes
415 │  *
416 │  * ### Adding a required checkbox validator using template-driven forms
417 │  *
418 │  * The following example shows how to add a checkbox required validator to an input attached to an
419 │  * ngModel binding.
420 │  *
421 │  * ```html
422 ▶  * <input type="checkbox" name="active" ngModel required>
423 │  * ```
424 │  *
425 │  * @publicApi
426 │  * @ngModule FormsModule
427 │  * @ngModule ReactiveFormsModule
428 │  */
````

`RequiredValidator` は入力を `booleanAttribute` で読み、`enabled` を上書きして「`true` のときだけ」にしています（L394〜404、[検証のディレクティブの章](../forms/14-forms-validator-directives.md)）。だから `required="false"` も `[required]="false"` も検証せず、DOM の `required` 属性も外れました（host の `'[attr.required]': '_enabled ? "" : null'`）。checkbox の 409〜410 行目は、同じ入力の読み方で検証関数だけ `requiredTrue` に替えます。`false` の checkbox で `{required: true}` でした。

## 9. min と max：「どの control でも」ではない

📄 `angular/packages/forms/src/directives/validators.ts` L191–228 （▶ の行: 202–203, 215, 223–224, 226）

````ts
191 │ /**
192 │  * @description
193 │  * Provider which adds `MaxValidator` to the `NG_VALIDATORS` multi-provider list.
194 │  */
195 │ export const MAX_VALIDATOR: Provider = {
196 │   provide: NG_VALIDATORS,
197 │   useExisting: forwardRef(() => MaxValidator),
198 │   multi: true,
199 │ };
200 │ 
201 │ /**
202 ▶  * A directive which installs the {@link MaxValidator} for any `formControlName`,
203 ▶  * `formControl`, or control with `ngModel` that also has a `max` attribute.
204 │  *
205 │  * @see [Form Validation](guide/forms/form-validation)
206 │  *
207 │  * @usageNotes
208 │  *
209 │  * ### Adding a max validator
210 │  *
211 │  * The following example shows how to add a max validator to an input attached to an
212 │  * ngModel binding.
213 │  *
214 │  * ```html
215 ▶  * <input type="number" ngModel max="4">
216 │  * ```
217 │  *
218 │  * @ngModule ReactiveFormsModule
219 │  * @ngModule FormsModule
220 │  * @publicApi
221 │  */
222 │ @Directive({
223 ▶   selector:
224 ▶     'input[type=number][max][formControlName],input[type=number][max][formControl],input[type=number][max][ngModel]',
225 │   providers: [MAX_VALIDATOR],
226 ▶   host: {'[attr.max]': '_enabled ? max : null'},
227 │   standalone: false,
228 │ })
````

📄 `angular/packages/forms/src/directives/validators.ts` L247–273 （▶ の行: 254–255, 267）

````ts
247 │ export const MIN_VALIDATOR: Provider = {
248 │   provide: NG_VALIDATORS,
249 │   useExisting: forwardRef(() => MinValidator),
250 │   multi: true,
251 │ };
252 │ 
253 │ /**
254 ▶  * A directive which installs the {@link MinValidator} for any `formControlName`,
255 ▶  * `formControl`, or control with `ngModel` that also has a `min` attribute.
256 │  *
257 │  * @see [Form Validation](guide/forms/form-validation)
258 │  *
259 │  * @usageNotes
260 │  *
261 │  * ### Adding a min validator
262 │  *
263 │  * The following example shows how to add a min validator to an input attached to an
264 │  * ngModel binding.
265 │  *
266 │  * ```html
267 ▶  * <input type="number" ngModel min="4">
268 │  * ```
269 │  *
270 │  * @ngModule ReactiveFormsModule
271 │  * @ngModule FormsModule
272 │  * @publicApi
273 │  */
````

202〜203 行目と 254〜255 行目は「`max`（`min`）属性を持つ **どの**`formControlName`・`formControl`・`ngModel` にも」と書きます。224 行目のセレクターは `input[type=number][max][formControlName]` などで、`input[type=number]` にしか付きません（`min` も L275 で同じ）。DEMO では `<input type="text" max="4">` に 5、`<input type="range" min="4">` に 3 を入れても errors は `null` で、属性だけがそのまま残りました。`type="range"` を外すのは意図したもので、spec `should not include the min and max validators for inputs with type range`（template\_integration\_spec.ts L2033）が固めています。202 行目の「`{@link MaxValidator}` を付けるディレクティブ」は、`MaxValidator` 自身の説明なので自分を指しています。

## 10. email・minlength・maxlength・pattern

📄 `angular/packages/forms/src/directives/validators.ts` L440–477 （▶ の行: 452–453, 455–456, 469–471）

````ts
440 │ 
441 │ /**
442 │  * @description
443 │  * Provider which adds `EmailValidator` to the `NG_VALIDATORS` multi-provider list.
444 │  */
445 │ export const EMAIL_VALIDATOR: any = {
446 │   provide: NG_VALIDATORS,
447 │   useExisting: forwardRef(() => EmailValidator),
448 │   multi: true,
449 │ };
450 │ 
451 │ /**
452 ▶  * A directive that adds the `email` validator to controls marked with the
453 ▶  * `email` attribute. The directive is provided with the `NG_VALIDATORS` multi-provider list.
454 │  *
455 ▶  * The email validation is based on the WHATWG HTML specification with some enhancements to
456 ▶  * incorporate more RFC rules. More information can be found on the [Validators.email
457 │  * page](api/forms/Validators#email).
458 │  *
459 │  * @see [Form Validation](guide/forms/form-validation)
460 │  *
461 │  * @usageNotes
462 │  *
463 │  * ### Adding an email validator
464 │  *
465 │  * The following example shows how to add an email validator to an input attached to an ngModel
466 │  * binding.
467 │  *
468 │  * ```html
469 ▶  * <input type="email" name="email" ngModel email>
470 ▶  * <input type="email" name="email" ngModel email="true">
471 ▶  * <input type="email" name="email" ngModel [email]="true">
472 │  * ```
473 │  *
474 │  * @publicApi
475 │  * @ngModule FormsModule
476 │  * @ngModule ReactiveFormsModule
477 │  */
````

469〜471 行目の 3 つの書き方は、どれも `booleanAttribute` で `true` になります。`email="false"` は `false` になって検証しません（DEMO）。`EmailValidator` だけは host の属性の束縛を持たず（セレクターの L478〜482）、DOM の `email` 属性は書いたまま残ります。

📄 `angular/packages/forms/src/directives/validators.ts` L542–563 （▶ の行: 544–545, 557）

````ts
542 │ 
543 │ /**
544 ▶  * A directive that adds minimum length validation to controls marked with the
545 ▶  * `minlength` attribute. The directive is provided with the `NG_VALIDATORS` multi-provider list.
546 │  *
547 │  * @see [Form Validation](guide/forms/form-validation)
548 │  *
549 │  * @usageNotes
550 │  *
551 │  * ### Adding a minimum length validator
552 │  *
553 │  * The following example shows how to add a minimum length validator to an input attached to an
554 │  * ngModel binding.
555 │  *
556 │  * ```html
557 ▶  * <input name="firstName" ngModel minlength="4">
558 │  * ```
559 │  *
560 │  * @ngModule ReactiveFormsModule
561 │  * @ngModule FormsModule
562 │  * @publicApi
563 │  */
````

📄 `angular/packages/forms/src/directives/validators.ts` L586–620 （▶ の行: 598–599, 611, 619）

````ts
586 │ 
587 │ /**
588 │  * @description
589 │  * Provider which adds `MaxLengthValidator` to the `NG_VALIDATORS` multi-provider list.
590 │  */
591 │ export const MAX_LENGTH_VALIDATOR: any = {
592 │   provide: NG_VALIDATORS,
593 │   useExisting: forwardRef(() => MaxLengthValidator),
594 │   multi: true,
595 │ };
596 │ 
597 │ /**
598 ▶  * A directive that adds maximum length validation to controls marked with the
599 ▶  * `maxlength` attribute. The directive is provided with the `NG_VALIDATORS` multi-provider list.
600 │  *
601 │  * @see [Form Validation](guide/forms/form-validation)
602 │  *
603 │  * @usageNotes
604 │  *
605 │  * ### Adding a maximum length validator
606 │  *
607 │  * The following example shows how to add a maximum length validator to an input attached to an
608 │  * ngModel binding.
609 │  *
610 │  * ```html
611 ▶  * <input name="firstName" ngModel maxlength="25">
612 │  * ```
613 │  *
614 │  * @ngModule ReactiveFormsModule
615 │  * @ngModule FormsModule
616 │  * @publicApi
617 │  */
618 │ @Directive({
619 ▶   selector: '[maxlength][formControlName],[maxlength][formControl],[maxlength][ngModel]',
620 │   providers: [MAX_LENGTH_VALIDATOR],
````

📄 `angular/packages/forms/src/directives/validators.ts` L645–673 （▶ の行: 653–654, 667）

````ts
645 │ export const PATTERN_VALIDATOR: any = {
646 │   provide: NG_VALIDATORS,
647 │   useExisting: forwardRef(() => PatternValidator),
648 │   multi: true,
649 │ };
650 │ 
651 │ /**
652 │  * @description
653 ▶  * A directive that adds regex pattern validation to controls marked with the
654 ▶  * `pattern` attribute. The regex must match the entire control value.
655 │  * The directive is provided with the `NG_VALIDATORS` multi-provider list.
656 │  *
657 │  * @see [Form Validation](guide/forms/form-validation)
658 │  *
659 │  * @usageNotes
660 │  *
661 │  * ### Adding a pattern validator
662 │  *
663 │  * The following example shows how to add a pattern validator to an input attached to an
664 │  * ngModel binding.
665 │  *
666 │  * ```html
667 ▶  * <input name="firstName" ngModel pattern="[a-zA-Z ]*">
668 │  * ```
669 │  *
670 │  * @ngModule ReactiveFormsModule
671 │  * @ngModule FormsModule
672 │  * @publicApi
673 │  */
````

654 行目は「正規表現は control の値**全体**に一致しなければならない」と言い切ります。ディレクティブは入力をそのまま `Validators.pattern` に渡すので、5 節のとおり `pattern="a|b"` は `'xb'` を通します（DEMO）。全体に一致させるのは「`|` を含まない文字列」か「自分で `^(?:…)$` と書いた物」だけです。HTML の `<input pattern>` は仕様で `^(?:` と `)$` で包むので、ブラウザの検証と Angular の検証で `a|b` の結果が違います。

> **🧪 DEMO 1 — Validators を境界の入力に通す**
>
> 押すと、本物の `@angular/forms`（22.2.6）で、入力ごとに `new FormControl(入力, 検証関数)` を作って `errors` を書きます。2 つ目のボタンは `g` フラグの `pattern` を 3 回続けて検証するものと、`compose` です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-validators)

> **🧪 DEMO 2 — ディレクティブの属性の値の受け方**
>
> 押すと、このサイトとは別のアプリ（`createApplication`）を作り、下の表の 15 個の `<input>` を並べたコンポーネントを、文書に付けない div に bootstrap します。`ngModel` は値を 1 拍遅れて入れるので、`whenStable` を待ってから各 `NgModel` の `errors` と、DOM の属性を読みます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-validators)

## ここまでの呼び出し

- 👤 `<input [(ngModel)]="v" pattern="a|b">`
  - `PatternValidator.ngOnChanges → createValidator('a|b')` — directives/validators.ts L160〜166・L695
    - `patternValidator('a|b') → new RegExp('^a|b$')` — validators.ts L569〜582 — *^ と $ は文字列の端に足すだけ*
  - `NgModel の control.updateValueAndValidity → validator(control)` — abstract\_model.ts L1440
    - `regex.test('xb')` — validators.ts L592 — *true なので null*

## テストと直し方

| ファイル（packages/forms/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `validators_spec.ts` | `Validators`（49）› `min`（52）› `should return a validation error on small values converted from strings`（73） | 数の文字列も読む。`'2abc'` や配列の it は無い |
| `validators_spec.ts` | `pattern`（387）› 431〜440 の 4 つの `boundary symbols` | 408〜410 行目（片方だけある、両方ある、無い）。`\|` を含む文字列の it は無い |
| `validators_spec.ts` | `required`（184）・`minLength`（250）・`maxLength`（323）・`compose`（444） | 空の値と `length`・`size` |
| `template_integration_spec.ts` | `should not include the min and max validators for inputs with type range`（2033） | range には付けない（202〜203 行目の「どの」と合わない側の事実） |
| `reactive_integration_spec.ts` | `enabling validators conditionally`（3612）・`min and max validators`（3813） | `null` の入力で検証を外す、`min`・`max` の入力の変化 |

📄 `走らせたコマンド（2026-11-21、../angular の 8576f161ae4）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/forms/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
--filter=Validators                         Ran 110 of 1153 specs、0 failures
--filter=Validators pattern                 Ran 14 of 1153 specs、0 failures
--filter=enabling validators conditionally  Ran 4 of 1153 specs、0 failures
--filter=min and max validators             Ran 24 of 1153 specs、0 failures

# 説明文の例を貼って型検査（TypeScript 6.0.3、--strict --experimentalDecorators）
$ tsc --strict --experimentalDecorators --noEmit ex-vd1.ts   # validators.ts L66〜75・L99〜108
（エラー 0）
$ tsc --strict --experimentalDecorators --noEmit ex-vd2.ts   # directives/validators.ts L307〜318
ex-vd2.ts(12,39): error TS2304: Cannot find name 'Observable'.
```

直すとしたら説明文です。validators.ts の 408〜410 行目に「`|` を含む文字列は全体に一致しない、`(?:…)` で包む」を足すこと、directives/validators.ts の 654 行目（全体に一致する、を条件つきにする）、202〜203・254〜255 行目（`input[type=number]` だけ）、307 行目の import（`Observable` を足す）です。`pattern` を固めるなら、`validators_spec.ts` の `pattern`（387）に `Validators.pattern('a|b')` で `'xb'` を通す it を足すと、今の振る舞いが記録されます。実装を HTML と同じ `^(?:…)$` に変えるのは、今通っている値が落ちる変更です。

## 聞かれそうな質問

**Q. `Validators.pattern('a|b')` で `'xb'` が通るのはなぜですか？**

足される `^` と `$` が `'^a|b$'` になり、「`^a` または `b$`」と読まれるからです（408〜410 行目）。`'(?:a|b)'` と書けば全体に一致します。`PatternValidator` の 654 行目「全体に一致」もこの場合は成り立ちません。

**Q. `Validators.min(3)` は `'2abc'` を落としますか？**

落とします。`parseFloat` で 2 と読み、`actual` には元の `'2abc'` を入れます（L470〜480）。`'abc'` は `NaN` なので検証しません。

**Q. `<input type="text" ngModel max="4">` に max の検証は付きますか？**

付きません。`MaxValidator` のセレクター（224 行目）は `input[type=number]` だけです。text なら `[formControl]` 側で `Validators.max` を足します。

**Q. `required="false"` と書くとどうなりますか？**

`booleanAttribute` で `false` になり、検証も DOM の `required` 属性も外れます。`email="false"` も同じです（`minlength` などの数の入力は `null` のときだけ外れます）。

**Q. 空白だけの文字列は `required` を通りますか？**

通ります。空と見なすのは `null`・`undefined`・長さか size が 0 の物だけです。

## 読み終えて

- 検証関数の例はどれも書いてあるとおりの errors を返し、`g` フラグの注意も実際に交互の結果になる。
- `min`・`max` は `parseFloat` で読むので、数の文字列・頭が数の文字列・配列も数として比べる。
- `pattern` の「`^` と `$` を足す」は文字列の端に足すだけで、`|` を含むと全体には一致しない。ディレクティブの説明の「全体に一致」はこの場合に外れる。
- `min`・`max` のディレクティブは `input[type=number]` にしか付かず、「どの control にも」という説明より狭い。
- `required`・`email` は `booleanAttribute`、`minlength` などは `parseInt`・`parseFloat` で属性を読む。

---

← 前: [FormControl と FormBuilder の説明文](03-fmd-control-builder.md)  
次: [エラーの文言と小道具：reactive\_errors・template\_driven\_errors・shared](05-fmd-errors.md) →
