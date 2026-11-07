[目次](../README.md) › [フォームの内側](README.md) › 第 17 回 / 全 20 回

# Signal Forms の検証：validate・validateAsync・Standard Schema

> validate と組み込みのルール（required・min・pattern など）が返すエラーの形（validation\_errors.ts）、子孫にエラーを配る validateTree、validateAsync がフィールドごとの resource でサーバーに聞き 'pending' を経てエラーになる流れと validateHttp、Zod などの Standard Schema をつなぐ validateStandardSchema。エラーがどのフィールドに付くか（fieldTree の指定）。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-sf-validation)

---

Signal Forms の検証ルールは 4 系統あります。値 1 つを見る `validate`、子孫にエラーを配れる `validateTree`、サーバーに聞く `validateAsync`（とその HTTP 版 `validateHttp`）、Zod などをつなぐ `validateStandardSchema`。この章では、それぞれが返すエラーの形、エラーが**どのフィールドに付くか**（`fieldTree`）、非同期の結果が `'pending'` を経て `errors()` と `valid()` / `invalid()` になるまでを、行で追います。

読む対象は `packages/forms/signals/src/` の `api/rules/validation/`（`validation_errors.ts`・`validate_tree.ts`・`validate_async.ts`・`validate_http.ts`・`standard_schema.ts`）、`api/types.ts`、`schema/logic.ts`、`field/validation.ts`・`field/metadata.ts` です。同期エラーが `syncErrors` の computed で評価されること、`valid()` と `invalid()` の違いは [signal-forms](../signals/17-signal-forms.md) の 6 節で、ルールが builder に記録される仕組みは[第 16 回](16-forms-sf-schema.md)で読みました。

1. [1. 全体像](01-forms-overview.md)
2. [2. AbstractControl](02-forms-abstract-control.md)
3. [3. updateValueAndValidity](03-forms-update-value-validity.md)
4. [4. Validators](04-forms-validators.md)
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
17. **17. Signal Forms の検証**（この章）
18. [18. 状態ルールと metadata](18-forms-sf-rules-metadata.md)
19. [19. submit と相互運用](19-forms-sf-submit-compat.md)
20. [20. issue と PR を読む](20-forms-issues.md)

## 0. 全体の流れ

1. **エラーはただのオブジェクト**

   `kind`（と任意の `message`）を持つオブジェクト。付け先は `fieldTree` プロパティで表す（1 節）。
2. **ルールの結果を集める**

   1 つのフィールドに積まれたルールの結果は、`undefined` と `null` を捨てて 1 本の配列になる（2 節）。
3. **付け先を決める**

   `fieldTree` が無ければ「ルールを付けたフィールド」を入れる。`validateTree` のエラーは祖先から子孫へ配られ、各フィールドが自分宛てだけを拾う（3 節）。
4. **非同期**

   `validateAsync` はフィールドごとに resource を 1 つ作り、その状態を `'pending'` かエラーに読み替える（4・5 節）。
5. **まとめる**

   `errors()`（自分のエラー）、`errorSummary()`（子孫込み）、`pending()`、内部の `status`（`valid()`・`invalid()` はこれを読む）が computed で決まる（5 節）。

## 1. エラーの形：ValidationError と fieldTree

📄 `angular/packages/forms/signals/src/api/rules/validation/validation_errors.ts` L355–386 （▶ の行: 368, 370, 372, 382, 384–385）

```ts
355 │ /**
356 │  * Common interface for all validation errors.
357 │  *
358 │  * This can be returned from validators.
359 │  *
360 │  * It's also used by the creation functions to create an instance
361 │  * (e.g. `requiredError`, `minError`, etc.).
362 │  *
363 │  * @see [Signal Form Validation](guide/forms/signals/validation)
364 │  * @see [Signal Form Validation Errors](guide/forms/signals/validation#validation-errors)
365 │  * @category validation
366 │  * @publicApi 22.0
367 │  */
368 ▶ export interface ValidationError {
369 │   /** Identifies the kind of error. */
370 ▶   readonly kind: string;
371 │   /** Human readable error message. */
372 ▶   readonly message?: string;
373 │ }
374 │ 
375 │ export declare namespace ValidationError {
376 │   /**
377 │    * Validation error with an associated field tree.
378 │    *
379 │    * This is returned from field state, e.g., catField.errors() would be of a list of errors with
380 │    * `field: catField` bound to state.
381 │    */
382 ▶   export interface WithFieldTree extends ValidationError {
383 │     /** The field associated with this error. */
384 ▶     readonly fieldTree: ReadonlyFieldTree<unknown>;
385 ▶     readonly formField?: FormField<unknown>;
386 │   }
```

📄 `angular/packages/forms/signals/src/api/rules/validation/validation_errors.ts` L397–422 （▶ の行: 403, 405, 415, 417）

```ts
397 │   /**
398 │    * Validation error with optional field.
399 │    *
400 │    * This is generally used in places where the result might have a field.
401 │    * e.g., as a result of a `validateTree`, or when handling form submission.
402 │    */
403 ▶   export interface WithOptionalFieldTree extends ValidationError {
404 │     /** The field associated with this error. */
405 ▶     readonly fieldTree?: ReadonlyFieldTree<unknown>;
406 │   }
407 │   /** @deprecated Use `ValidationError.WithOptionalFieldTree` instead  */
408 │   export type WithOptionalField = WithOptionalFieldTree;
409 │ 
410 │   /**
411 │    * Validation error with no field.
412 │    *
413 │    * This is used to strongly enforce that fields are not allowed in validation result.
414 │    */
415 ▶   export interface WithoutFieldTree extends ValidationError {
416 │     /** The field associated with this error. */
417 ▶     readonly fieldTree?: never;
418 │     readonly formField?: never;
419 │   }
420 │   /** @deprecated Use `ValidationError.WithoutFieldTree` instead  */
421 │   export type WithoutField = WithoutFieldTree;
422 │ }
```

368〜373 行目、エラーに必須なのは `kind`（種類を表す文字列）だけです。`message` は任意で、クラスである必要もありません。`{ kind: 'tooShort' }` というただのオブジェクトがエラーです。「どのフィールドのエラーか」は 384 行目の `fieldTree` で表し、型の上で 3 つの段階があります。382 行目 `WithFieldTree`（必ずある。`errors()` で読めるのはこれ）、403 行目 `WithOptionalFieldTree`（あってもよい）、415 行目 `WithoutFieldTree`（あってはいけない、417 行目で `never`）。

📄 `angular/packages/forms/signals/src/api/types.ts` L897–919 （▶ の行: 897, 899, 915, 917）

```ts
897 ▶ export type FieldValidator<TValue, TPathKind extends PathKind = PathKind.Root> = LogicFn<
898 │   TValue,
899 ▶   ValidationResult<ValidationError.WithoutFieldTree>,
900 │   TPathKind
901 │ >;
902 │ 
903 │ /**
904 │  * A function that takes the `FieldContext` for the field being validated and returns a
905 │  * `TreeValidationResult` indicating errors for the field and its sub-fields.
906 │  *
907 │  * @template TValue The type of value stored in the field being validated
908 │  * @template TPathKind The kind of path being validated (root field, child field, or item of an array)
909 │  *
910 │  * @see [Custom validation rules](guide/forms/signals/validation#using-validatetree)
911 │  *
912 │  * @category types
913 │  * @publicApi 22.0
914 │  */
915 ▶ export type TreeValidator<TValue, TPathKind extends PathKind = PathKind.Root> = LogicFn<
916 │   TValue,
917 ▶   TreeValidationResult,
918 │   TPathKind
919 │ >;
```

📄 `angular/packages/forms/signals/src/api/types.ts` L156–176 （▶ の行: 156–158, 175–176）

```ts
156 ▶ export type TreeValidationResult<
157 ▶   E extends ValidationError.WithOptionalFieldTree = ValidationError.WithOptionalFieldTree,
158 ▶ > = ValidationSuccess | OneOrMany<E>;
159 │ 
160 │ /**
161 │  * A validation result where all errors explicitly define their target field.
162 │  *
163 │  * The result may be one of the following:
164 │  * 1. A {@link ValidationSuccess} to indicate no errors.
165 │  * 2. A {@link ValidationError} with a field to indicate an error on the target field.
166 │  * 3. A list of {@link ValidationError} with fields to indicate multiple errors.
167 │  *
168 │  * @template E the type of error (defaults to {@link ValidationError}).
169 │  *
170 │  * @see [Validation errors](guide/forms/signals/validation#validation-errors)
171 │  *
172 │  * @category types
173 │  * @publicApi 22.0
174 │  */
175 ▶ export type ValidationResult<E extends ValidationError = ValidationError> =
176 ▶   ValidationSuccess | OneOrMany<E>;
```

この 3 段階が API の使い分けそのものです。`validate` に渡す `FieldValidator` は 899 行目のとおり `WithoutFieldTree` しか返せません。付け先は必ず自分です。`validateTree` に渡す `TreeValidator` は 917 行目の `TreeValidationResult`、つまり 157 行目の `WithOptionalFieldTree` を返せるので、子孫を付け先に指定できます。158・176 行目の `OneOrMany` のとおり、どちらも 1 つでも配列でも返せます。

📄 `angular/packages/forms/signals/src/api/rules/validation/validation_errors.ts` L61–80 （▶ の行: 61–63, 73–75, 79）

```ts
61 ▶ export function requiredError(
62 ▶   options: WithFieldTree<ValidationErrorOptions>,
63 ▶ ): RequiredValidationError;
64 │ /**
65 │  * Create a required error
66 │  * @param options The optional validation error options
67 │  *
68 │  * @see [Required validation](guide/forms/signals/validation#required)
69 │  *
70 │  * @category validation
71 │  * @publicApi 22.0
72 │  */
73 ▶ export function requiredError(
74 ▶   options?: ValidationErrorOptions,
75 ▶ ): WithoutFieldTree<RequiredValidationError>;
76 │ export function requiredError(
77 │   options?: ValidationErrorOptions,
78 │ ): WithOptionalFieldTree<RequiredValidationError> {
79 ▶   return new RequiredValidationError(options);
80 │ }
```

📄 `angular/packages/forms/signals/src/api/rules/validation/validation_errors.ts` L424–462 （▶ の行: 432, 434, 437, 440, 446–447, 460–461）

```ts
424 │ /**
425 │  * Internal version of `NgValidationError`, we create this separately so we can change its type on
426 │  * the exported version to a type union of the possible sub-classes.
427 │  *
428 │  * @see [Signal Form Validation Errors](guide/forms/signals/validation#validation-errors)
429 │  *
430 │  * @publicApi 22.0
431 │  */
432 ▶ export abstract class BaseNgValidationError implements ValidationError {
433 │   /** Brand the class to avoid Typescript structural matching */
434 ▶   private __brand = undefined;
435 │ 
436 │   /** Identifies the kind of error. */
437 ▶   readonly kind: string = '';
438 │ 
439 │   /** The field associated with this error. */
440 ▶   readonly fieldTree!: ReadonlyFieldTree<unknown>;
441 │ 
442 │   /** Human readable error message. */
443 │   readonly message?: string;
444 │ 
445 │   constructor(options?: ValidationErrorOptions) {
446 ▶     if (options) {
447 ▶       Object.assign(this, options);
448 │     }
449 │   }
450 │ }
451 │ 
452 │ /**
453 │  * An error used to indicate that a required field is empty.
454 │  *
455 │  * @see [Required validation](guide/forms/signals/validation#required)
456 │  *
457 │  * @category validation
458 │  * @publicApi 22.0
459 │  */
460 ▶ export class RequiredValidationError extends BaseNgValidationError {
461 ▶   override readonly kind = 'required';
462 │ }
```

組み込みのエラーは作る関数とクラスの組です。`requiredError()` は 79 行目で `new RequiredValidationError(options)` を返し、61〜63 行目と 73〜75 行目のオーバーロードで「`fieldTree` を渡したら `WithFieldTree`、渡さなければ `WithoutFieldTree`」と型を変えます。クラスは 446〜447 行目で options（`message` と `fieldTree`）をそのまま自分にコピーし、461 行目で `kind` を固定します。434 行目の `__brand` は、同じ形の自作オブジェクトが TypeScript の構造的な型の一致でこのクラスと見なされないための印です。

📄 `angular/packages/forms/signals/src/api/rules/validation/validation_errors.ts` L645–660 （▶ の行: 648–649, 659–660）

```ts
645 │  * @category validation
646 │  * @publicApi 22.0
647 │  */
648 ▶ export const NgValidationError: abstract new () => NgValidationError = BaseNgValidationError as any;
649 ▶ export type NgValidationError =
650 │   | RequiredValidationError
651 │   | MinValidationError
652 │   | MinDateValidationError
653 │   | MaxValidationError
654 │   | MaxDateValidationError
655 │   | MinLengthValidationError
656 │   | MaxLengthValidationError
657 │   | PatternValidationError
658 │   | EmailValidationError
659 ▶   | StandardSchemaValidationError
660 ▶   | NativeInputParseError;
```

組み込みのエラーの種類は 649〜660 行目の 11 個です（`required`・`min`・`minDate`・`max`・`maxDate`・`minLength`・`maxLength`・`pattern`・`email`・`standardSchema`・`parse`）。648 行目、値としての `NgValidationError` は基底クラスそのものなので、`e instanceof NgValidationError` で「組み込みか」を判定し、`e.kind` の switch で型を絞れます。660 行目の `NativeInputParseError`（`kind: 'parse'`）は入力欄の値が解析できなかったときのエラーです（[signal-forms](../signals/17-signal-forms.md) の 8 節の parser）。

## 2. ルールの結果を 1 本の配列にする

📄 `angular/packages/forms/signals/src/schema/logic.ts` L140–176 （▶ の行: 145–146, 160–161, 164–167, 169, 172）

```ts
140 │ export class ArrayMergeIgnoreLogic<TElement, TIgnore = never> extends AbstractLogic<
141 │   readonly TElement[],
142 │   TElement | readonly (TElement | TIgnore)[] | TIgnore | undefined | void
143 │ > {
144 │   /** Creates an instance of this class that ignores `null` values. */
145 ▶   static ignoreNull<TElement>(predicates: ReadonlyArray<BoundPredicate>) {
146 ▶     return new ArrayMergeIgnoreLogic<TElement, null>(predicates, (e: unknown) => e === null);
147 │   }
148 │ 
149 │   constructor(
150 │     predicates: ReadonlyArray<BoundPredicate>,
151 │     private ignore: undefined | ((e: TElement | undefined | TIgnore) => e is TIgnore),
152 │   ) {
153 │     super(predicates);
154 │   }
155 │ 
156 │   override get defaultValue() {
157 │     return [];
158 │   }
159 │ 
160 ▶   override compute(arg: FieldContext<any>): readonly TElement[] {
161 ▶     return this.fns.reduce((prev, f) => {
162 │       const value = f(arg);
163 │ 
164 ▶       if (value === undefined || value === IGNORED) {
165 ▶         return prev;
166 ▶       } else if (isArray(value)) {
167 ▶         return [...prev, ...(this.ignore ? value.filter((e) => !this.ignore!(e)) : value)];
168 │       } else {
169 ▶         if (this.ignore && this.ignore(value as TElement | TIgnore | undefined)) {
170 │           return prev;
171 │         }
172 ▶         return [...prev, value];
173 │       }
174 │     }, [] as TElement[]);
175 │   }
176 │ }
```

1 つのフィールドに積まれた検証ルール（[第 16 回](16-forms-sf-schema.md)の `LogicContainer.syncErrors`）は、この `compute` で混ぜられます。161 行目の `reduce` で積んだ順に呼び、164 行目、`undefined`（エラー無し）と `IGNORED`（条件が偽、第 16 回 3 節）は飛ばします。166〜167 行目、配列なら展開し、169〜172 行目、1 つなら足します。145〜146 行目の `ignoreNull` で作られたものは `null` も捨てます。エラーの種類のコンテナはどれもこれで作られています。だからルールは「エラー無し」を `undefined`・`null`・`[]` のどれで返してもかまいません。

## 3. エラーの付け先：addDefaultField と validateTree

📄 `angular/packages/forms/signals/src/field/validation.ts` L388–414 （▶ の行: 394–396, 406–408, 410–411）

```ts
388 │ /**
389 │  * Sets the given field on the given error(s) if it does not already have a field.
390 │  * @param error The error(s) to add the field to
391 │  * @param fieldTree The default field to add
392 │  * @returns The passed in error(s), with its field set.
393 │  */
394 ▶ export function addDefaultField<E extends ValidationError.WithOptionalFieldTree>(
395 ▶   error: E,
396 ▶   fieldTree: ReadonlyFieldTree<unknown>,
397 │ ): E & {fieldTree: ReadonlyFieldTree<unknown>};
398 │ export function addDefaultField<E extends ValidationError>(
399 │   errors: TreeValidationResult<E>,
400 │   fieldTree: ReadonlyFieldTree<unknown>,
401 │ ): ValidationResult<E & {fieldTree: ReadonlyFieldTree<unknown>}>;
402 │ export function addDefaultField<E extends ValidationError>(
403 │   errors: TreeValidationResult<E>,
404 │   fieldTree: ReadonlyFieldTree<unknown>,
405 │ ): ValidationResult<E & {fieldTree: ReadonlyFieldTree<unknown>}> {
406 ▶   if (isArray(errors)) {
407 ▶     for (const error of errors) {
408 ▶       (error as ɵWritable<ValidationError.WithOptionalFieldTree>).fieldTree ??= fieldTree;
409 │     }
410 ▶   } else if (errors) {
411 ▶     (errors as ɵWritable<ValidationError.WithOptionalFieldTree>).fieldTree ??= fieldTree;
412 │   }
413 │   return errors as ValidationResult<E & {fieldTree: ReadonlyFieldTree<unknown>}>;
414 │ }
```

付け先を決める唯一の関数です。408・411 行目の `??=` のとおり、`fieldTree` が**まだ無いときだけ**、渡された既定の付け先を入れます。`validate` は [signal-forms](../signals/17-signal-forms.md) の 6 節で見たとおり `addDefaultField(logic(ctx), ctx.fieldTree)` と呼ぶので、付け先は「ルールを付けたフィールド」です。

📄 `angular/packages/forms/signals/src/api/rules/validation/validate_tree.ts` L29–39 （▶ の行: 33, 36–37）

```ts
29 │ export function validateTree<TValue, TPathKind extends PathKind = PathKind.Root>(
30 │   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
31 │   logic: NoInfer<TreeValidator<TValue, TPathKind>>,
32 │ ): void {
33 ▶   assertPathIsCurrent(path);
34 │ 
35 │   const pathNode = FieldPathNode.unwrapFieldPath(path);
36 ▶   pathNode.builder.addSyncTreeErrorRule((ctx) =>
37 ▶     addDefaultField(logic(ctx as FieldContext<TValue, TPathKind>), ctx.fieldTree),
38 │   );
39 │ }
```

`validateTree` の違いは 36 行目の 1 語だけです。`addSyncErrorRule` ではなく `addSyncTreeErrorRule`（コンテナの `syncTreeErrors`）に積みます。37 行目の `addDefaultField` は同じで、`fieldTree` を書かなければ自分、書けばそこが付け先です。別の箱に積む理由は、評価の仕方が違うからです。

📄 `angular/packages/forms/signals/src/field/validation.ts` L150–169 （▶ の行: 157, 159, 164–165, 168）

```ts
150 │ export class FieldValidationState implements ValidationState {
151 │   constructor(readonly node: FieldNode) {}
152 │ 
153 │   /**
154 │    * The full set of synchronous tree errors visible to this field. This includes ones that are
155 │    * targeted at a descendant field rather than at this field.
156 │    */
157 ▶   readonly rawSyncTreeErrors: Signal<ValidationError.WithFieldTree[]> = computed(
158 │     () => {
159 ▶       if (this.shouldSkipValidation()) {
160 │         return [];
161 │       }
162 │ 
163 │       return [
164 ▶         ...this.node.logicNode.logic.syncTreeErrors.compute(this.node.context),
165 ▶         ...(this.node.structure.parent?.validationState.rawSyncTreeErrors() ?? []),
166 │       ];
167 │     },
168 ▶     {equal: shallowArrayEquals},
169 │   );
```

📄 `angular/packages/forms/signals/src/field/validation.ts` L209–218 （▶ の行: 214–215）

```ts
209 │ 
210 │   /**
211 │    * The synchronous tree errors visible to this field that are specifically targeted at this field
212 │    * rather than a descendant.
213 │    */
214 ▶   readonly syncTreeErrors: Signal<ValidationError.WithFieldTree[]> = computed(
215 ▶     () => this.rawSyncTreeErrors().filter((err) => err.fieldTree === this.node.fieldTree),
216 │     {equal: shallowArrayEquals},
217 │   );
218 │ 
```

1. **164 行目：自分に付いたツリールールを評価する**

   結果には子孫宛てのエラーも混ざっています。
2. **165 行目：親の「生の」ツリーエラーを全部受け継ぐ**

   親の `rawSyncTreeErrors` は、さらにその親の分を含みます。根に付けたツリールールの結果は、こうして木の下へ全員に配られます。
3. **215 行目：自分宛てだけを拾う**

   `err.fieldTree === this.node.fieldTree`。拾った分が [signal-forms](../signals/17-signal-forms.md) の 6 節の `syncErrors` に入り、そのフィールドの `errors()` になります。

「配る → 拾う」の形なので、`validateTree(p, ...)` で `fieldTree: fieldTree.confirm` を返すと、エラーは根ではなく `confirm` の `errors()` に出ます。根の `errors()` には出ません（215 行目で根は拾わない）が、5 節の `status` は子の状態を集めるので、根の `valid()` は偽になります。

## 4. validateAsync：フィールドごとの resource

📄 `angular/packages/forms/signals/src/api/rules/validation/validate_async.ts` L80–110 （▶ の行: 83, 88, 93, 105, 109）

```ts
 80 │   /**
 81 │    * A function that receives the resource params and returns a resource of the given params.
 82 │    * The given params should be used as is to create the resource.
 83 ▶    * The forms system will report the params as `undefined` when this validation doesn't need to be run.
 84 │    *
 85 │    * @param params The params to use for constructing the resource
 86 │    * @returns A reference to the constructed resource.
 87 │    */
 88 ▶   readonly factory: (params: Signal<TParams | undefined>) => Resource<TResult | undefined>;
 89 │   /**
 90 │    * A function to handle errors thrown by httpResource (HTTP errors, network errors, etc.).
 91 │    * Receives the error and the field context, returns a list of validation errors.
 92 │    */
 93 ▶   readonly onError: (error: unknown, ctx: FieldContext<TValue, TPathKind>) => TreeValidationResult;
 94 │   /**
 95 │    * A function that takes the resource result, and the current field context and maps it to a list
 96 │    * of validation errors.
 97 │    *
 98 │    * @param result The resource result.
 99 │    * @param ctx The context for the field the validator is attached to.
100 │    * @return A validation error, or list of validation errors to report based on the resource result.
101 │    *   The returned errors can optionally specify a field that the error should be targeted to.
102 │    *   A targeted error will show up as an error on its target field rather than the field being validated.
103 │    *   If a field is not given, the error is assumed to apply to the field being validated.
104 │    */
105 ▶   readonly onSuccess: MapToErrorsFn<TValue, TResult, TPathKind>;
106 │   /**
107 │    * A function that receives the field context and returns true if the async validation should be run.
108 │    */
109 ▶   readonly when?: NoInfer<LogicFn<TValue, boolean, TPathKind>>;
110 │ }
```

使う側が渡すのは 5 つです。`params`（この引用の少し上で宣言されています）で「何を聞くか」を値から作り、88 行目の `factory` がそれを受け取って `Resource` を作り、105 行目の `onSuccess` と 93 行目の `onError` が結果をエラーに読み替えます。109 行目の `when` は走らせる条件です。83 行目のコメントが要点で、「検証しなくてよいときは params を `undefined` にする」のはフォーム側の仕事です。

`validateAsync` の本体の最初の部分は [signal-forms](../signals/17-signal-forms.md) の 10 節で引用しました。`createManagedMetadataKey` で「params の signal を受け取って `factory` を呼ぶ」キーを作り、debounce があれば間に挟む部分です。そのキーに値を入れるのが次の行です。

📄 `angular/packages/forms/signals/src/api/rules/validation/validate_async.ts` L146–157 （▶ の行: 147–148, 150–151, 153–154, 156）

```ts
146 │ 
147 ▶   metadata(path, RESOURCE, (ctx) => {
148 ▶     const node = ctx.stateOf(path) as FieldNode;
149 │     const validationState = node.validationState;
150 ▶     if (validationState.shouldSkipValidation() || !validationState.syncValid()) {
151 ▶       return undefined;
152 │     }
153 ▶     if (opts.when && !opts.when(ctx)) {
154 ▶       return undefined;
155 │     }
156 ▶     return opts.params(ctx);
157 │   });
```

1. **150〜152 行目：走らせない条件その 1**

   そのフィールドが検証を飛ばす状態（hidden・disabled・readonly。[第 18 回](18-forms-sf-rules-metadata.md)）か、**同期の検証が通っていない**（`syncValid` が偽）なら、params は `undefined`。`syncValid` は子孫の同期エラーも見るので、親に付けた非同期検証は、子が全部同期で通るまで走りません。
2. **153〜155 行目：走らせない条件その 2**

   `when` が偽なら `undefined`。
3. **156 行目**

   それ以外は使う側の `params(ctx)`。この関数も metadata のルールとして computed の中で評価されるので、値が変わると params が変わり、resource が読み直されます。

📄 `angular/packages/forms/signals/src/field/metadata.ts` L30–59 （▶ の行: 34–35, 43, 45, 47–49, 51）

```ts
30 │   /**
31 │    * Force eager creation of managed keys,
32 │    * as managed keys have a `create` function that needs to run during construction.
33 │    */
34 ▶   runMetadataCreateLifecycle(): void {
35 ▶     if (!this.node.logicNode.logic.hasMetadataKeys()) {
36 │       return;
37 │     }
38 │ 
39 │     const wasInParams = ɵisInParamsFunction();
40 │     if (wasInParams) ɵsetInParamsFunction(false);
41 │     try {
42 │       untracked(() =>
43 ▶         runInInjectionContext(this.node.structure.injector, () => {
44 │           for (const key of this.node.logicNode.logic.getMetadataKeys()) {
45 ▶             if (key.create) {
46 │               const logic = this.node.logicNode.logic.getMetadata(key);
47 ▶               const result = key.create!(
48 ▶                 this.node,
49 ▶                 computed(() => logic.compute(this.node.context)),
50 │               );
51 ▶               this.metadata.set(key, result);
52 │             }
53 │           }
54 │         }),
55 │       );
56 │     } finally {
57 │       if (wasInParams) ɵsetInParamsFunction(true);
58 │     }
59 │   }
```

resource がいつ、どこで作られるかはここです。`FieldNode` のコンストラクタの最後（[signal-forms](../signals/17-signal-forms.md) の 3 節の `runMetadataCreateLifecycle`）から呼ばれ、45 行目で `create` を持つキー（managed なキー）を探し、47〜50 行目で「上の 147〜157 行目の計算」を computed にして渡します。これが signal-forms の 10 節で見た `createManagedMetadataKey((_state, params) => ...)` の `params` です。43 行目、作るのはフィールドごとの注入器の中なので、resource の寿命はそのフィールドと同じです。配列の行が増えれば、行ごとに resource が 1 つ増えます。

📄 `angular/packages/forms/signals/src/api/rules/validation/validate_async.ts` L158–180 （▶ の行: 159–160, 162–167, 170, 173–174, 176–177）

```ts
158 │ 
159 ▶   pathNode.builder.addAsyncErrorRule((ctx) => {
160 ▶     const res = ctx.state.metadata(RESOURCE)!;
161 │     let errors;
162 ▶     switch (res.status()) {
163 ▶       case 'idle':
164 ▶         return undefined;
165 ▶       case 'loading':
166 ▶       case 'reloading':
167 ▶         return 'pending';
168 │       case 'resolved':
169 │       case 'local':
170 ▶         if (!res.hasValue()) {
171 │           return undefined;
172 │         }
173 ▶         errors = opts.onSuccess(res.value()!, ctx as FieldContext<TValue, TPathKind>);
174 ▶         return addDefaultField(errors, ctx.fieldTree);
175 │       case 'error':
176 ▶         errors = opts.onError(res.error(), ctx as FieldContext<TValue, TPathKind>);
177 ▶         return addDefaultField(errors, ctx.fieldTree);
178 │     }
179 │   });
180 │ }
```

| resource の status() | 行 | 非同期ルールの結果 |
| --- | --- | --- |
| `'idle'`（params が undefined） | 163〜164 | `undefined`（エラー無し、待ちでもない） |
| `'loading'` / `'reloading'` | 165〜167 | `'pending'` という文字列 |
| `'resolved'` / `'local'` | 168〜174 | `onSuccess(value)` を `addDefaultField` に通したもの |
| `'error'` | 175〜177 | `onError(error)` を `addDefaultField` に通したもの |

非同期のルールも同期と同じ「ルールの関数」で、resource の status を読んで答えを返すだけです。待っていることは、エラーの配列に混ざる `'pending'` という番兵で表します。174・177 行目で `addDefaultField` を通るので、`onSuccess` が `fieldTree` を付けて返せば、非同期のエラーも別のフィールドに付けられます。

📄 `angular/packages/forms/signals/src/api/rules/validation/validate_http.ts` L96–110 （▶ の行: 100–101, 105, 108）

```ts
 96 │ export function validateHttp<TValue, TResult = unknown, TPathKind extends PathKind = PathKind.Root>(
 97 │   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
 98 │   opts: HttpValidatorOptions<TValue, TResult, TPathKind>,
 99 │ ) {
100 ▶   validateAsync(path, {
101 ▶     params: opts.request as (
102 │       ctx: FieldContext<TValue, TPathKind>,
103 │     ) => string | HttpResourceRequest | undefined,
104 │     debounce: opts.debounce,
105 ▶     factory: (request: Signal<any>) => httpResource(request, opts.options),
106 │     onSuccess: opts.onSuccess,
107 │     onError: opts.onError,
108 ▶     when: opts.when,
109 │   });
110 │ }
```

`validateHttp` は 100〜109 行目で `validateAsync` を呼ぶだけです。101 行目、使う側の `request`（URL か `HttpResourceRequest`）が params になり、105 行目の `factory` が `httpResource(request, opts.options)` です。`request` が `undefined` を返せば、httpResource も idle のままでリクエストを送りません。

## 5. pending はどこまで広がるか

📄 `angular/packages/forms/signals/src/field/validation.ts` L219–256 （▶ の行: 224, 227, 233, 235, 246, 251–252）

```ts
219 │   /**
220 │    * The full set of asynchronous tree errors visible to this field. This includes ones that are
221 │    * targeted at a descendant field rather than at this field, as well as sentinel 'pending' values
222 │    * indicating that the validator is still running and an error could still occur.
223 │    */
224 ▶   readonly rawAsyncErrors: Signal<(ValidationError.WithFieldTree | 'pending')[]> = computed(
225 │     () => {
226 │       // Short-circuit running validators if validation doesn't apply to this field.
227 ▶       if (this.shouldSkipValidation()) {
228 │         return [];
229 │       }
230 │ 
231 │       return [
232 │         // TODO: add field in `validateAsync` and remove this map
233 ▶         ...this.node.logicNode.logic.asyncErrors.compute(this.node.context),
234 │         // TODO: does it make sense to filter this to errors in this subtree?
235 ▶         ...(this.node.structure.parent?.validationState.rawAsyncErrors() ?? []),
236 │       ];
237 │     },
238 │     {equal: shallowArrayEquals},
239 │   );
240 │ 
241 │   /**
242 │    * The asynchronous tree errors visible to this field that are specifically targeted at this field
243 │    * rather than a descendant. This also includes all 'pending' sentinel values, since those could
244 │    * theoretically result in errors for this field.
245 │    */
246 ▶   readonly asyncErrors: Signal<(ValidationError.WithFieldTree | 'pending')[]> = computed(
247 │     () => {
248 │       if (this.shouldSkipValidation()) {
249 │         return [];
250 │       }
251 ▶       return this.rawAsyncErrors().filter(
252 ▶         (err) => err === 'pending' || err.fieldTree === this.node.fieldTree,
253 │       );
254 │     },
255 │     {equal: shallowArrayEquals},
256 │   );
```

非同期のエラーも 3 節のツリーエラーと同じ「配る → 拾う」です。233 行目で自分の非同期ルールを評価し、235 行目で親の分を受け継ぎます。拾うのは 252 行目、**`'pending'` は全部**と、自分宛てのエラーです。「まだ結果が出ていないルールは、どのフィールドにエラーを付けるか分からない」ので、祖先の非同期ルールが待っている間は、子孫も全員 pending です（Q&A の 2 問目）。

📄 `angular/packages/forms/signals/src/field/validation.ts` L263–298 （▶ の行: 266, 268–270, 275, 277, 279, 283, 293, 295–296）

```ts
263 │   /**
264 │    * The combined set of all errors that currently apply to this field.
265 │    */
266 ▶   readonly errors = computed(
267 │     () => [
268 ▶       ...this.parseErrors(),
269 ▶       ...this.syncErrors(),
270 ▶       ...this.asyncErrors().filter((err) => err !== 'pending'),
271 │     ],
272 │     {equal: shallowArrayEquals},
273 │   );
274 │ 
275 ▶   readonly errorSummary = computed(
276 │     () => {
277 ▶       const errors = this.node.structure.reduceChildren(this.errors(), (child, result) => [
278 │         ...result,
279 ▶         ...child.errorSummary(),
280 │       ]);
281 │       // Sort by DOM order on client-side only.
282 │       if (typeof ngServerMode === 'undefined' || !ngServerMode) {
283 ▶         untracked(() => errors.sort(compareErrorPosition));
284 │       }
285 │       return errors;
286 │     },
287 │     {equal: shallowArrayEquals},
288 │   );
289 │ 
290 │   /**
291 │    * Whether this field has any asynchronous validators still pending.
292 │    */
293 ▶   readonly pending = computed(() =>
294 │     this.node.structure.reduceChildren(
295 ▶       this.asyncErrors().includes('pending'),
296 ▶       (child, value) => value || child.validationState.pending(),
297 │     ),
298 │   );
```

- 266〜273 行目、`errors()` は「解析エラー + 同期エラー + 非同期エラー」で、270 行目で `'pending'` を取り除きます。`errors()` に番兵は出てきません。
- 275〜288 行目、`errorSummary()` は自分の `errors()` に子の `errorSummary()` を足したもの、つまり子孫全部です。283 行目で、ブラウザでは入力欄の DOM の順に並べ替えます（エラー一覧を画面の上から順に出せる）。
- 293〜298 行目、`pending()` は「自分の asyncErrors に `'pending'` がある、または子のどれかが pending」です。

📄 `angular/packages/forms/signals/src/field/validation.ts` L17–32 （▶ の行: 24–25, 27–28, 31）

```ts
17 │ /**
18 │  * Helper function taking validation state, and returning own state of the node.
19 │  * @param state
20 │  */
21 │ export function calculateValidationSelfStatus(
22 │   state: ValidationState,
23 │ ): 'invalid' | 'unknown' | 'valid' {
24 ▶   if (state.errors().length > 0) {
25 ▶     return 'invalid';
26 │   }
27 ▶   if (state.pending()) {
28 ▶     return 'unknown';
29 │   }
30 │ 
31 ▶   return 'valid';
32 │ }
```

📄 `angular/packages/forms/signals/src/field/validation.ts` L317–336 （▶ の行: 319–320, 322, 327, 329, 334）

```ts
317 │   readonly status: Signal<'valid' | 'invalid' | 'unknown'> = computed(() => {
318 │     // Short-circuit checking children if validation doesn't apply to this field.
319 ▶     if (this.shouldSkipValidation()) {
320 ▶       return 'valid';
321 │     }
322 ▶     let ownStatus = calculateValidationSelfStatus(this);
323 │ 
324 │     return this.node.structure.reduceChildren<'valid' | 'invalid' | 'unknown'>(
325 │       ownStatus,
326 │       (child, value) => {
327 ▶         if (value === 'invalid' || child.validationState.status() === 'invalid') {
328 │           return 'invalid';
329 ▶         } else if (value === 'unknown' || child.validationState.status() === 'unknown') {
330 │           return 'unknown';
331 │         }
332 │         return 'valid';
333 │       },
334 ▶       (v) => v === 'invalid', // short-circuit on 'invalid'
335 │     );
336 │   });
```

自分の状態は 24 行目、エラーがあれば `'invalid'`（待ちがあっても）、27 行目、エラーが無くて待ちがあれば `'unknown'`。322〜335 行目で子と合わせ、1 つでも `'invalid'` なら `'invalid'`（334 行目でそこで打ち切り）、なければ 1 つでも `'unknown'` なら `'unknown'` です。319〜320 行目、検証を飛ばす状態のフィールドは、子が何であっても `'valid'` です。

> [!NOTE]
> **ポイント**
>
> この `status` は `FieldValidationState` の内部の signal で、`FieldState`（`f.x()`）には公開されていません。公開されているのは、これを読む `valid()`（`status === 'valid'`）と `invalid()`（`status === 'invalid'`）で、[signal-forms](../signals/17-signal-forms.md) の 6 節で引用した行です。`'unknown'` は「`valid()` も `invalid()` も偽」として外から見えます。

## 6. validateStandardSchema：同期と非同期の両方を張る

Standard Schema は、Zod・Valibot・ArkType などの検証ライブラリが共通に持つ interface です。スキーマのオブジェクトが `'~standard'` プロパティに `validate(value)` を持ち、結果は `{ value }` か `{ issues: [{ message, path }] }`、またはその Promise です。

📄 `angular/packages/forms/signals/src/api/rules/validation/standard_schema.ts` L70–102 （▶ の行: 74–76, 80, 82, 84, 86, 91, 93–95, 98–99）

```ts
 70 │ export function validateStandardSchema<TSchema, TModel extends IgnoreUnknownProperties<TSchema>>(
 71 │   path: SchemaPath<TModel> & SchemaPathTree<TModel>,
 72 │   schema: StandardSchemaV1<TSchema> | LogicFn<TModel, StandardSchemaV1<unknown> | undefined>,
 73 │ ) {
 74 ▶   // We create both a sync and async validator because the standard schema validator can return
 75 ▶   // either a sync result or a Promise, and we need to handle both cases. The sync validator
 76 ▶   // handles the sync result, and the async validator handles the Promise.
 77 │   // We memoize the result of the validation function here, so that it is only run once for both
 78 │   // validators, it can then be passed through both sync & async validation.
 79 │   type Result = StandardSchemaV1.Result<TSchema> | Promise<StandardSchemaV1.Result<TSchema>>;
 80 ▶   const VALIDATOR_MEMO = metadata(
 81 │     path as SchemaPath<TModel>,
 82 ▶     createMetadataKey<Result | undefined>(),
 83 │     (ctx) => {
 84 ▶       const resolvedSchema = typeof schema === 'function' ? schema(ctx) : schema;
 85 │       return resolvedSchema
 86 ▶         ? (resolvedSchema['~standard'].validate(ctx.value()) as Result)
 87 │         : undefined;
 88 │     },
 89 │   );
 90 │ 
 91 ▶   validateTree<TModel>(path, ({state, fieldTreeOf}) => {
 92 │     // Skip sync validation if the result is a Promise or undefined.
 93 ▶     const result = state.metadata(VALIDATOR_MEMO)!();
 94 ▶     if (!result || ɵisPromise(result)) {
 95 ▶       return [];
 96 │     }
 97 │     return (
 98 ▶       result?.issues?.map((issue) =>
 99 ▶         standardIssueToFormTreeError(fieldTreeOf<TModel>(path), issue),
100 │       ) ?? []
101 │     );
102 │   });
```

1. **80〜89 行目：validate の呼び出しを 1 回にまとめる**

   74〜78 行目のコメントのとおり、`validate` の結果は同期かもしれないし Promise かもしれません。そこで結果を metadata に入れて（82 行目の `createMetadataKey`、[第 18 回](18-forms-sf-rules-metadata.md)）、同期側と非同期側の 2 つのルールがそれを読み合います。metadata は computed なので、86 行目の `validate(ctx.value())` は値が変わったときに 1 回だけ走ります。
2. **91〜102 行目：同期側は validateTree**

   94〜96 行目、結果が Promise なら同期側は何もしません。98〜100 行目、issue を 1 つずつエラーに変えます。`validateTree` なのは、issue の path で子孫にエラーを付けるためです。

📄 `angular/packages/forms/signals/src/api/rules/validation/standard_schema.ts` L104–125 （▶ の行: 109, 111–112, 114–117, 120–121）

```ts
104 │   validateAsync<
105 │     TModel,
106 │     Promise<StandardSchemaV1.Result<TSchema>> | undefined,
107 │     readonly StandardSchemaV1.Issue[]
108 │   >(path, {
109 ▶     params: ({state}) => {
110 │       // Skip async validation if the result is *not* a Promise.
111 ▶       const result = state.metadata(VALIDATOR_MEMO)!();
112 ▶       return result && ɵisPromise(result) ? result : undefined;
113 │     },
114 ▶     factory: (params) => {
115 ▶       return resource({
116 ▶         params,
117 ▶         loader: async ({params}) => (await params)?.issues ?? [],
118 │       });
119 │     },
120 ▶     onSuccess: (issues, {fieldTreeOf}) => {
121 ▶       return issues.map((issue) => standardIssueToFormTreeError(fieldTreeOf<TModel>(path), issue));
122 │     },
123 │     onError: () => {},
124 │   });
125 │ }
```

非同期側は 4 節の `validateAsync` です。111〜112 行目、結果が Promise のときだけ params にし、そうでなければ `undefined`（idle）。115〜118 行目の resource は、その Promise を `await` して issues を取り出すだけの loader です。サーバーに聞くのではなく、ライブラリの非同期の検証を resource の状態（`'pending'`）に乗せるための resource です。

📄 `angular/packages/forms/signals/src/api/rules/validation/standard_schema.ts` L162–179 （▶ の行: 173–176, 178）

```ts
162 │ /**
163 │  * Converts a `StandardSchemaV1.Issue` to a `FormTreeError`.
164 │  *
165 │  * @param fieldTree The root field to which the issue's path is relative.
166 │  * @param issue The `StandardSchemaV1.Issue` to convert.
167 │  * @returns A `ValidationError` representing the issue.
168 │  */
169 │ function standardIssueToFormTreeError(
170 │   fieldTree: ReadonlyFieldTree<unknown>,
171 │   issue: StandardSchemaV1.Issue,
172 │ ): StandardSchemaValidationError {
173 ▶   let target = fieldTree as ReadonlyFieldTree<Record<PropertyKey, unknown>>;
174 ▶   for (const pathPart of issue.path ?? []) {
175 ▶     const pathKey = typeof pathPart === 'object' ? pathPart.key : pathPart;
176 ▶     target = target[pathKey] as ReadonlyFieldTree<Record<PropertyKey, unknown>>;
177 │   }
178 ▶   return addDefaultField(standardSchemaError(issue, {message: issue.message}), target);
179 │ }
```

issue の付け先です。173 行目、ルールを付けたフィールドから始めて、174〜177 行目で issue の `path`（`['password']` など）を 1 つずつプロパティとしてたどります。第 16 回の path と違い、これは値の木の `FieldTree` の Proxy なので、たどった先は本物のフィールドです。178 行目で `kind: 'standardSchema'` のエラーを作り、そこを付け先にします。だから根に `validateStandardSchema(p, schema)` を 1 つ付けるだけで、エラーは各フィールドに分かれて出ます。

## 7. ここまでを 1 本に（非同期の 1 往復）

- 👤 `username` の欄に `admin` と打つ
  - `syncErrors` が再評価され、`tooShort` が消える — validation.ts（signal-forms 6 節）
  - `metadata(RESOURCE)` のルール：`syncValid` が真 → `params(ctx)` — validate\_async.ts 150–156 — *'admin'*
    - resource の params が変わる → loader が走る — factory（使う側） — *status: loading*
  - 非同期ルール：`res.status()` が `'loading'` → `'pending'` — validate\_async.ts 165–167
  - `asyncErrors` が `'pending'` を拾う → `pending()` 真、内部の `status``'unknown'` — validation.ts 252 / 295 / 27
    - loader が解決 → `status()``'resolved'` — resource
  - `onSuccess(true)` → `{kind: 'taken'}` → `addDefaultField` — validate\_async.ts 173–174 — *付け先は username*
  - `errors()` に `taken`、内部の `status``'invalid'` — validation.ts 266–273 / 24

## 8. DEMO：4 系統のルールと pending

> **🧪 DEMO — validate・validateAsync・validateTree・validateStandardSchema**
>
> 本物の `@angular/forms/signals`（22.1.6）です。username は `validate`（3 文字以上）と `validateAsync` （`resource` の loader が 800 ms の `setTimeout` で答える擬似サーバー。`admin`・`root`・`angular` は使用中）。根に `validateTree`（confirm が password と違えば confirm にエラー）と `validateStandardSchema`。サイトには Zod を依存として入れていないので、Standard Schema は `'~standard'` の interface を満たす手書きのオブジェクトで再現しています（`forms-sf-validation.ts` の `passwordRules`）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-sf-validation)

username に `ad` と打っても問い合わせは起きません。`tooShort` で `syncValid` が偽なので、4 節 150 行目で params が `undefined` のままです。`admin` まで打つと「問い合わせ開始」が出て、800 ms の間は username も根も `pending() = true`（内部の `status` は `'unknown'`）で、`valid()` も `invalid()` も `false` です。速く打つと「中断」が出ます。params が変わると resource が前の読み込みを中断するからです。password と confirm のエラーは、どちらも根に付けたルールから来ていますが、`f().errors()` は空のままで、`errorSummary()` に付け先ごとに出ます（3 節 215 行目と 6 節 174〜178 行目）。

## テストと直し方

| spec（signals/test/node/） | describe / it | 確かめていること |
| --- | --- | --- |
| `validation_status.spec.ts` | 36 行目 `describe('validation status')` › 123 行目 `describe('tree validator')` › 141 行目 `it('should affect validity of targeted field')`・179 行目 `it('should not affect sibling validity')` | 3 節の「配る → 拾う」 |
| `validation_status.spec.ts` | 199 行目 `describe('async validator')` › 347 行目 `it('pending should flow from parent to child')`・482 行目 `it('should produce pending status during debounce period')` | 5 節 252 行目、debounce 中の pending |
| `resource.spec.ts` | 45 行目 `describe('resources')` › 285 行目 `it('should only run async validation when synchronously valid')`・241 行目 `it('should support shorthand http validation')` | 4 節 150 行目、`validateHttp` |
| `api/validators/standard_schema.spec.ts` | 29 行目 `describe('standard schema integration')` › 30 行目 `it('should perform sync validation using a standard schema')`・64 行目 `it('should perform async validation using a standard schema')` | 6 節の同期と非同期の振り分け（こちらは本物の Zod を使う） |
| `api/validators/validation_errors.spec.ts` | 18 行目 `describe('validation errors')` › 116 行目 `describe('type tests')` | 1 節の `WithoutFieldTree` の型の制約 |

📄 `ターミナル（../angular で実行）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/signals/test/node:test \
  --test_arg=--filter="^(validation status|resources|standard schema integration) " \
  --test_output=all
```

📄 `出力（抜粋。scratchpad/forms-logs/e-forms-sf-validation.log）`

```
==================== Test output for //packages/forms/signals/test/node:test:
Randomized with seed 71992
Started
.................................................

Ran 49 of 539 specs
49 specs, 0 failures
================================================================================
//packages/forms/signals/test/node:test                                  PASSED in 0.9s
```

3 つの describe の it は 21 本・13 本・15 本で、合わせて 49 本です。`^(...) ` と先頭と末尾の空白で囲んだのは、describe 名がほかの it の名前の途中に当たらないようにするためです。

- **付け先がおかしい**（エラーが別のフィールドに出る・出ない）なら、`field/validation.ts` の `addDefaultField`・`syncTreeErrors`・`asyncErrors` の filter。足す先は `validation_status.spec.ts` の `tree validator` か `async validator`。
- **非同期が走る・走らない条件**なら、`validate_async.ts` の 147〜157 行目。足す先は `resource.spec.ts`。
- **Standard Schema の issue の扱い**なら、`standard_schema.ts` の `standardIssueToFormTreeError`。足す先は `standard_schema.spec.ts`。

手元で試すなら、252 行目の `err === 'pending' ||` を消します。`pending should flow from parent to child`（347 行目）は、根に付けた非同期検証が待ち中のあいだ 兄弟の `sibling().pending()` が `true` であることを最初に expect しているので、ここが落ちます（spec のコメントにも「親が兄弟にツリーエラーを付けないとは言えないので、兄弟は親の pending を受け継ぐ」とあります）。走らせて落ちる場所を確かめたら、必ず戻します。本家への PR は勧めません。issue で「親が pending のとき子の `valid()` が偽になる」と言われたら、それは 252 行目の仕様だと説明できるところまでが目標です（[第 20 回](20-forms-issues.md)）。

## 聞かれそうな質問

**Q. validateTree はいつ使うのですか？validate との違いは？**

エラーを**別のフィールド**に付けたいときです。`validate` の関数の型は `WithoutFieldTree` しか返せず（`types.ts` 899 行目）、付け先は必ず自分です。`validateTree` は `WithOptionalFieldTree` を返せて（157・917 行目）、`syncTreeErrors` に積まれます（`validate_tree.ts` 36 行目）。その結果は `validation.ts` 165 行目で子孫に配られ、各フィールドが 215 行目で自分宛てを拾います。「確認用パスワードが一致しない」を、根で両方の値を見て `confirm` に付ける、のが典型です。

**Q. 非同期の検証が走らないのはどんなときですか？**

params が `undefined` のときで、フォームがそうするのは 3 つです（`validate_async.ts` 150〜155 行目）。そのフィールドが hidden・disabled・readonly のとき、`syncValid` が偽（自分か子孫に同期エラーがある）のとき、`when` が偽のときです。加えて、使う側の `params` が `undefined` を返したときも idle です（163〜164 行目）。なお「走っていない」と「待っている」は別で、待っている間は 5 節 252 行目のとおり、**子孫も全員 pending** になります。

**Q. エラーを別のフィールドに付けたいときは？**

エラーのオブジェクトに `fieldTree` を書きます。`validateTree`・`validateAsync` の `onSuccess`/`onError`・`submit` の action の戻り値で書けます。どれも `addDefaultField`（`validation.ts` 408・411 行目）を通り、`fieldTree` が無いときだけ既定（ルールを付けたフィールド）が入ります。`validateTree` と `validateAsync` で付け先にできるのは、ルールを付けたフィールド自身とその子孫です。祖先から配る仕組み（165・235 行目）なので、兄弟や親を指したエラーはどのフィールドにも拾われず、`errorSummary()` にも出ません。親や兄弟に付けたいなら、ルールを共通の祖先（たいていは根）に付けます。`submit` の戻り値だけは配らずに付け先へ直接入れるので、どこでも指せます（[第 19 回](19-forms-sf-submit-compat.md)）。

**Q. errors() と errorSummary() はどう違いますか？**

`errors()` はそのフィールド自身のエラーだけ（`validation.ts` 266〜273 行目）、`errorSummary()` は子孫の分も全部です（275〜288 行目）。フォーム全体のエラー一覧を出すなら根の `errorSummary()` を使います。ブラウザでは入力欄の DOM 順に並びます（283 行目）。

**Q. Zod のスキーマが Promise を返すと、どうなりますか？**

同期側のルールは何もせず（`standard_schema.ts` 94〜96 行目）、非同期側の `validateAsync` の params にその Promise が入り（111〜112 行目）、resource が解決するまでフィールドは pending です。解決すると issues がエラーになります（120〜122 行目）。1 回の値の変化で `validate` を呼ぶのは 86 行目の 1 回だけです。

## 読み終えて

- エラーは `kind` を持つただのオブジェクト。付け先は `fieldTree` で、`addDefaultField` が無いときだけ「ルールを付けたフィールド」を入れる
- `validate` は自分にしか付けられず、`validateTree` は子孫に付けられる。ツリーエラーは祖先から全員に配られ、各フィールドが自分宛てを拾う
- `validateAsync` はフィールドごとに resource を 1 つ作る。同期で通っていない・hidden/disabled/readonly・`when` 偽なら params が undefined で idle
- 待ちは `'pending'` という番兵で表され、子孫にも配られる。`errors()` には出ず、`pending()` が真、`valid()` も `invalid()` も偽になる
- `validateStandardSchema` は結果を metadata で 1 回にまとめ、同期なら `validateTree`、Promise なら `validateAsync` で受ける。issue の path が付け先になる

---

← 前: [Signal Forms のスキーマ：schema・apply・applyWhen が作るロジックの木](16-forms-sf-schema.md)  
次: [Signal Forms の状態ルール：disabled・hidden・readonly と metadata](18-forms-sf-rules-metadata.md) →
