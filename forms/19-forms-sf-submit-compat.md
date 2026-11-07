[目次](../README.md) › [フォームの内側](README.md) › 第 19 回 / 全 20 回

# Signal Forms の submit と、リアクティブフォームとの相互運用

> submit() が全フィールドを touched にし、既定では invalid でなければ（pending は待たずに）action を走らせ、サーバーのエラーをフィールドに戻す流れ（api/structure.ts・field/submit.ts）。compat パッケージの compatForm がリアクティブの FormControl を Signal Forms の木に入れる仕組みと、SignalFormControl が逆に Signal Forms を AbstractControl として見せる仕組み。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-sf-submit-compat)

---

Signal Forms のシリーズの最後は、フォームの「出口」と「つなぎ目」です。前半は `submit()`：全フィールドを touched にし、検証の状態を見て action か `onInvalid` のどちらかを呼び、action が返したサーバーのエラーを各フィールドに置くまでを 1 行ずつ追います（**非同期の検証が終わるのを待つかどうか**も、ここで決まります）。後半は相互運用です。`compatForm` がリアクティブフォームの `FormControl` を Signal Forms の木に入れる仕組みと、逆に `SignalFormControl` が Signal Forms を `AbstractControl` として `FormGroup` に入れる仕組みです。

読む対象は `packages/forms/signals/src/` の `api/structure.ts`（`submit`）・`api/types.ts`・`field/submit.ts`・`field/node.ts`・`field/manager.ts`・`directive/form_root.ts`・`controls/interop_ng_control.ts`、`packages/forms/signals/compat/src/` の `api/compat_form.ts`・`compat_field_adapter.ts`・`compat_structure.ts`・`compat_field_node.ts`・`compat_node_state.ts`・`compat_validation_state.ts`・`signal_form_control/signal_form_control.ts` です。リアクティブ側の `AbstractControl` は[第 2 回](02-forms-abstract-control.md)、`updateValueAndValidity` は[第 3 回](03-forms-update-value-validity.md)で読みました。

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
17. [17. Signal Forms の検証](17-forms-sf-validation.md)
18. [18. 状態ルールと metadata](18-forms-sf-rules-metadata.md)
19. **19. submit と相互運用**（この章）
20. [20. issue と PR を読む](20-forms-issues.md)

## 0. 全体の流れ

1. **submit の準備**

   送信中なら何もしない。options を決め（引数か、`form()` に渡した `submission`）、action が無ければ例外（1 節）。
2. **全部 touched**

   根から子孫へ印を付ける。hidden・disabled・readonly のフィールドは飛ばす（2 節）。
3. **走らせるか決める**

   既定では「invalid でなければ」走らせる。**pending は待たない**（1 節）。
4. **action → エラーを置く**

   action の戻り値のエラーを `fieldTree` ごとに分け、各フィールドの `submissionErrors` に set。値が変わると消える（3 節）。
5. **相互運用**

   `compatForm` は adapter を差し替えて、`FormControl` の場所に「control を写すノード」を作る（5〜6 節）。`SignalFormControl` は中に `compatForm` を持つ `AbstractControl`（7 節）。

## 1. submit()：準備と「走らせるか」

📄 `angular/packages/forms/signals/src/api/types.ts` L22–56 （▶ の行: 32, 35, 45, 51–53, 55）

```ts
22 │ export interface FormSubmitOptions<TRootModel, TSubmittedModel> {
23 │   /**
24 │    * Function to run when submitting the form data (when form is valid).
25 │    *
26 │    * @param field The contextually relevant field for this action function (the root field when
27 │    *   specified during form creation, and the submitted field when specified as part of the
28 │    *   `submit()` call)
29 │    * @param detail An object containing the root field of the submitted form as well as the
30 │    *   submitted field itself
31 │    */
32 ▶   action: (
33 │     field: FieldTree<TRootModel & TSubmittedModel>,
34 │     detail: {root: FieldTree<TRootModel>; submitted: FieldTree<TSubmittedModel>},
35 ▶   ) => Promise<TreeValidationResult>;
36 │   /**
37 │    * Function to run when attempting to submit the form data but validation is failing.
38 │    *
39 │    * @param field The contextually relevant field for this onInvalid function (the root field when
40 │    *   specified during form creation, and the submitted field when specified as part of the
41 │    *   `submit()` call)
42 │    * @param detail An object containing the root field of the submitted form as well as the
43 │    *   submitted field itself
44 │    */
45 ▶   onInvalid?: (
46 │     field: FieldTree<TRootModel & TSubmittedModel>,
47 │     detail: {root: FieldTree<TRootModel>; submitted: FieldTree<TSubmittedModel>},
48 │   ) => void;
49 │   /**
50 │    * Whether to ignore any of the validators when submitting:
51 ▶    * - 'pending': Will submit if there are no invalid validators, pending validators do not block submission (default)
52 ▶    * - 'none': Will not submit unless all validators are passing, pending validators block submission
53 ▶    * - 'all': Will always submit regardless of invalid or pending validators
54 │    */
55 ▶   ignoreValidators?: 'pending' | 'none' | 'all';
56 │ }
```

action は 35 行目のとおり `Promise<TreeValidationResult>` を返します。[第 17 回](17-forms-sf-validation.md)の `validateTree` と同じ型で、エラーに `fieldTree` を書けば付け先を選べます。51〜53 行目のコメントが送信の条件で、既定の `'pending'` は「invalid が無ければ送る。pending は送信を止めない」です。

📄 `angular/packages/forms/signals/src/api/structure.ts` L448–476 （▶ の行: 452, 454–455, 458–459, 462–465, 469–470）

```ts
448 │ export async function submit<TModel>(
449 │   form: FieldTree<TModel>,
450 │   options?: FormSubmitOptions<unknown, TModel> | FormSubmitOptions<unknown, TModel>['action'],
451 │ ): Promise<boolean> {
452 ▶   const node = untracked(form) as FieldState<unknown> as FieldNode;
453 │ 
454 ▶   if (untracked(node.submitState.submitting)) {
455 ▶     return false;
456 │   }
457 │ 
458 ▶   const field = options === undefined ? node.structure.root.fieldProxy : form;
459 ▶   const detail = {root: node.structure.root.fieldProxy, submitted: form};
460 │ 
461 │   // Normalize options.
462 ▶   options =
463 ▶     typeof options === 'function'
464 ▶       ? {action: options}
465 ▶       : (options ?? node.structure.fieldManager.submitOptions);
466 │ 
467 │   // Verify that an action was provided.
468 │   const action = options?.action as FormSubmitOptions<unknown, unknown>['action'];
469 ▶   if (!action) {
470 ▶     throw new RuntimeError(
471 │       RuntimeErrorCode.MISSING_SUBMIT_ACTION,
472 │       (typeof ngDevMode === 'undefined' || ngDevMode) &&
473 │         'Cannot submit form with no submit action. Specify the action when creating the form, or as an additional argument to `submit()`.',
474 │     );
475 │   }
476 │ 
```

1. **454〜456 行目：二重送信の防止**

   自分か祖先が送信中（3 節の `submitting`）なら、action を呼ばずに `false` を返します。
2. **458 行目：action に渡すフィールド**

   options を渡さなかった（`form()` の `submission` を使う）なら**根**、渡したなら `submit` に渡したフィールドです。459 行目の `detail` には両方（`root` と `submitted`）が入ります。
3. **462〜465 行目：options をそろえる**

   関数を直接渡したら `{action}` に包み、何も渡さなければ `fieldManager.submitOptions`（次の引用）。それも無ければ 469〜475 行目で例外です。

📄 `angular/packages/forms/signals/src/field/manager.ts` L20–33 （▶ の行: 23, 28, 32）

```ts
20 │ export class FormFieldManager {
21 │   readonly injector: Injector;
22 │   readonly rootName: string;
23 ▶   readonly submitOptions: FormSubmitOptions<unknown, unknown> | undefined;
24 │ 
25 │   constructor(
26 │     injector: Injector,
27 │     rootName: string | undefined,
28 ▶     submitOptions: FormSubmitOptions<unknown, unknown> | undefined,
29 │   ) {
30 │     this.injector = injector;
31 │     this.rootName = rootName ?? `${this.injector.get(APP_ID)}.form${nextFormId++}`;
32 ▶     this.submitOptions = submitOptions;
33 │   }
```

`form(model, schema, { submission: { action } })` の `submission` は、この 32 行目で根の `FormFieldManager` に置かれます。フォーム 1 つにつき 1 つです。

📄 `angular/packages/forms/signals/src/api/structure.ts` L477–496 （▶ の行: 477, 480, 483, 485–488, 490, 492–494）

```ts
477 ▶   node.markAsTouched();
478 │ 
479 │   const onInvalid = options?.onInvalid as FormSubmitOptions<unknown, unknown>['onInvalid'];
480 ▶   const shouldRun = shouldRunAction(node, options?.ignoreValidators);
481 │ 
482 │   // Run the action (or alternatively the `onInvalid` callback)
483 ▶   try {
484 │     if (shouldRun) {
485 ▶       node.submitState.selfSubmitting.set(true);
486 ▶       const errors = await untracked(() => action?.(field, detail));
487 ▶       errors && setSubmissionErrors(node, errors);
488 ▶       return !errors || (isArray(errors) && errors.length === 0);
489 │     } else {
490 ▶       untracked(() => onInvalid?.(field, detail));
491 │     }
492 ▶     return false;
493 ▶   } finally {
494 ▶     node.submitState.selfSubmitting.set(false);
495 │   }
496 │ }
```

📄 `angular/packages/forms/signals/src/api/structure.ts` L513–525 （▶ の行: 518–523）

```ts
513 │ function shouldRunAction(
514 │   node: FieldNode,
515 │   ignoreValidators?: FormSubmitOptions<unknown, unknown>['ignoreValidators'],
516 │ ) {
517 │   switch (ignoreValidators) {
518 ▶     case 'all':
519 ▶       return true;
520 ▶     case 'none':
521 ▶       return untracked(node.valid);
522 ▶     default: // Ignore pending validators by default (or specified 'pending').
523 ▶       return !untracked(node.invalid);
524 │   }
525 │ }
```

1. **477 行目：全部 touched**

   走らせるかどうかに関係なく、先に印を付けます（2 節）。エラーを画面に出す条件を `touched()` にしていれば、送信ボタンを押した瞬間に全部のエラーが見えます。
2. **480 行目：走らせるか**

   522〜523 行目、既定は `!invalid()`。非同期の検証が待ち中でエラーがまだ無ければ、内部の `status` は `'unknown'` で `invalid()` は偽なので（[第 17 回](17-forms-sf-validation.md) 5 節）、**action は走ります**。待ってから決めたいなら 520〜521 行目の `'none'`（`valid()` が真のときだけ）、検証を無視するなら 518 行目の `'all'` です。`submit` 自体には「pending が終わるまで待つ」処理はありません。
3. **485〜486 行目：action を呼んで待つ**

   送信中の印を立て、`untracked` の中で action を呼び、`await` します。
4. **487〜488 行目：結果**

   エラーがあれば 3 節の `setSubmissionErrors`。戻り値は「エラーが無いか空配列」なら `true`。
5. **490 行目**

   走らせないときは `onInvalid` を呼び、492 行目で `false`。
6. **493〜495 行目：finally**

   action が例外を投げても送信中の印は下ろします。`catch` は無いので、例外はそのまま `submit` の返す Promise の reject になり、エラーはどのフィールドにも置かれません（Q&A の 1 問目）。

## 2. 全部 touched：markAsTouchedInternal

📄 `angular/packages/forms/signals/src/field/node.ts` L283–297 （▶ の行: 284, 287–288, 290, 294–295）

```ts
283 │   markAsTouchedInternal(options?: MarkAsTouchedOptions): void {
284 ▶     if (this.structure.isOrphaned()) {
285 │       return;
286 │     }
287 ▶     if (this.validationState.shouldSkipValidation()) {
288 ▶       return;
289 │     }
290 ▶     this.nodeState.markAsTouched();
291 │     if (options?.skipDescendants) {
292 │       return;
293 │     }
294 ▶     for (const child of this.structure.children()) {
295 ▶       child.markAsTouchedInternal();
296 │     }
297 │   }
```

`markAsTouched()`（[signal-forms](../signals/17-signal-forms.md) の 7 節。debounce の残りもここで同期する）から呼ばれる本体です。287〜289 行目、検証を飛ばすフィールド（[第 18 回](18-forms-sf-rules-metadata.md)の hidden・disabled・readonly）には印を付けず、**その子孫にも降りません**。290 行目で自分に印を付け、294〜296 行目で子に降ります。`children()` はまだ作られていない子も作るので、ルールの無い子も含めて全部です。

## 3. サーバーのエラーを置く：submissionErrors

📄 `angular/packages/forms/signals/src/api/structure.ts` L527–554 （▶ の行: 537–538, 540, 542–543, 549, 551–552）

```ts
527 │ /**
528 │  * Sets a list of submission errors to their individual fields.
529 │  *
530 │  * @param submittedField The field that was submitted, resulting in the errors.
531 │  * @param errors The errors to set.
532 │  */
533 │ function setSubmissionErrors(
534 │   submittedField: FieldNode,
535 │   errors: OneOrMany<ValidationError.WithOptionalFieldTree>,
536 │ ) {
537 ▶   if (!isArray(errors)) {
538 ▶     errors = [errors];
539 │   }
540 ▶   const errorsByField = new Map<FieldNode, ValidationError.WithFieldTree[]>();
541 │   for (const error of errors) {
542 ▶     const errorWithField = addDefaultField(error, submittedField.fieldTree);
543 ▶     const field = errorWithField.fieldTree() as FieldNode;
544 │     let fieldErrors = errorsByField.get(field);
545 │     if (!fieldErrors) {
546 │       fieldErrors = [];
547 │       errorsByField.set(field, fieldErrors);
548 │     }
549 ▶     fieldErrors.push(errorWithField);
550 │   }
551 ▶   for (const [field, fieldErrors] of errorsByField) {
552 ▶     field.submitState.submissionErrors.set(fieldErrors);
553 │   }
554 │ }
```

1. **537〜539 行目**

   1 つでも配列でもよい（`OneOrMany`）。
2. **542 行目**

   [第 17 回](17-forms-sf-validation.md)の `addDefaultField`。`fieldTree` の無いエラーは、**submit したフィールド**（根で submit したなら根）に付きます。
3. **543・551〜553 行目**

   付け先のフィールドごとに分けて、その `submissionErrors` に **set** します。ツリーエラーのように祖先から配るのではなく直接置くので、付け先はどのフィールドでも構いません。

📄 `angular/packages/forms/signals/src/field/submit.ts` L13–40 （▶ の行: 21, 24, 27–29, 37–38）

```ts
13 │ /**
14 │  * State of a `FieldNode` that's associated with form submission.
15 │  */
16 │ export class FieldSubmitState {
17 │   /**
18 │    * Whether this field was directly submitted (as opposed to indirectly by a parent field being submitted)
19 │    * and is still in the process of submitting.
20 │    */
21 ▶   readonly selfSubmitting = signal<boolean>(false);
22 │ 
23 │   /** Submission errors that are associated with this field. */
24 ▶   readonly submissionErrors: WritableSignal<readonly ValidationError.WithFieldTree[]>;
25 │ 
26 │   constructor(private readonly node: FieldNode) {
27 ▶     this.submissionErrors = linkedSignal({
28 ▶       source: this.node.structure.value,
29 ▶       computation: () => [] as readonly ValidationError.WithFieldTree[],
30 │     });
31 │   }
32 │ 
33 │   /**
34 │    * Whether this form is currently in the process of being submitted.
35 │    * Either because the field was submitted directly, or because a parent field was submitted.
36 │    */
37 ▶   readonly submitting: Signal<boolean> = computed(() => {
38 ▶     return this.selfSubmitting() || (this.node.structure.parent?.submitting() ?? false);
39 │   });
40 │ }
```

`submissionErrors` は 27〜30 行目の linkedSignal で、**source がそのフィールドの value**、計算は常に空配列です。set したエラーは、そのフィールドの値が変わった瞬間に空に戻ります。「サーバーが『使われている』と言った名前を書き直したら、そのエラーは消える」が、この 1 つの linkedSignal で実現されています。置いたエラーは [signal-forms](../signals/17-signal-forms.md) の 6 節の `syncErrors` に入るので、`invalid()` も真になり、次の `submit` は既定では走りません（値を直すまで）。37〜39 行目、`submitting()` は「自分か祖先が送信中」です。

## 4. FormRoot：&lt;form&gt; の submit イベント

📄 `angular/packages/forms/signals/src/directive/form_root.ts` L35–57 （▶ の行: 36, 38–39, 43, 46, 48, 52–53）

```ts
35 │ @Directive({
36 ▶   selector: 'form[formRoot]',
37 │   host: {
38 ▶     'novalidate': '',
39 ▶     '(submit)': 'onSubmit($event)',
40 │   },
41 │ })
42 │ export class FormRoot<T> {
43 ▶   readonly fieldTree = input.required<FieldTree<T>>({alias: 'formRoot'});
44 │ 
45 │   protected onSubmit(event: Event): void {
46 ▶     event.preventDefault();
47 │ 
48 ▶     untracked(() => {
49 │       const fieldTree = this.fieldTree();
50 │       const node = fieldTree() as FieldState<unknown> as FieldNode;
51 │ 
52 ▶       if (node.structure.fieldManager.submitOptions) {
53 ▶         submit(fieldTree);
54 │       }
55 │     });
56 │   }
57 │ }
```

`<form [formRoot]="f">` は 38 行目でブラウザの検証を止め（`novalidate`）、39 行目で submit イベントを聞き、46 行目でページ遷移を止めます。52〜54 行目、`form()` に `submission` を渡したときだけ `submit(fieldTree)` を呼びます。引数なしなので 1 節 458 行目のとおり action には根が渡ります。53 行目は返り値の Promise を `await` も `catch` もしません。action の中の例外は、ここでは捕まえられず、未処理の Promise の reject になります。

## 5. compatForm：adapter を差し替える

📄 `angular/packages/forms/signals/compat/src/api/compat_form.ts` L130–142 （▶ の行: 136–137, 139, 141）

```ts
130 │ export function compatForm<TModel>(
131 │   model: WritableSignal<TModel>,
132 │   schema: SchemaOrSchemaFn<TModel>,
133 │   options: CompatFormOptions<TModel>,
134 │ ): FieldTree<TModel>;
135 │ 
136 ▶ export function compatForm<TModel>(...args: any[]): FieldTree<TModel> {
137 ▶   const [model, maybeSchema, maybeOptions] = normalizeFormArgs<TModel>(args);
138 │ 
139 ▶   const options = {...maybeOptions, adapter: new CompatFieldAdapter()};
140 │   const schema = maybeSchema || ((() => {}) as SchemaOrSchemaFn<TModel, PathKind>);
141 ▶   return form(model, schema, options);
142 │ }
```

`compatForm` は 141 行目で普通の `form()` を呼ぶだけで、違いは 139 行目の `adapter: new CompatFieldAdapter()` です。`form()` の中で adapter が `FieldNode` の作り方を決めることは、[signal-forms](../signals/17-signal-forms.md) の 2 節で見ました（通常は `BasicFieldAdapter`）。

📄 `angular/packages/forms/signals/compat/src/compat_field_adapter.ts` L100–132 （▶ の行: 104–105, 107–108, 111, 120–124, 128, 130）

```ts
100 │   /**
101 │    * Creates a regular or compat node based on whether the control is present.
102 │    * @param options
103 │    */
104 ▶   newChild(options: ChildFieldNodeOptions): FieldNode {
105 ▶     const value = options.parent.value()[options.initialKeyInParent];
106 │ 
107 ▶     if (value instanceof AbstractControl) {
108 ▶       return createCompatNode(options);
109 │     }
110 │ 
111 ▶     return new FieldNode(options);
112 │   }
113 │ }
114 │ 
115 │ /**
116 │  * Creates a CompatFieldNode from options.
117 │  * @param options
118 │  */
119 │ export function createCompatNode(options: FieldNodeOptions) {
120 ▶   const control = (
121 ▶     options.kind === 'root'
122 ▶       ? options.value
123 ▶       : computed(() => {
124 ▶           return options.parent.value()[options.initialKeyInParent];
125 │         })
126 │   ) as Signal<AbstractControl>;
127 │ 
128 ▶   return new CompatFieldNode({
129 │     ...options,
130 ▶     control,
131 │   });
132 │ }
```

1. **105 行目**

   子を作るとき、親の値のそのキーを見ます。
2. **107〜108 行目**

   `AbstractControl`（`FormControl`・`FormGroup` など）なら compat のノード。そうでなければ 111 行目でいつもの `FieldNode`。
3. **120〜126 行目**

   compat のノードは「control の signal」を持ちます。子なら 123〜125 行目、親の値のそのキーを読む computed なので、model の中の `FormControl` を別のものに差し替えると、ノードは新しい control を見ます。

## 6. compat のノード：control の状態を signal に写す

📄 `angular/packages/forms/signals/compat/src/compat_structure.ts` L72–102 （▶ の行: 80–84, 88, 93–94, 97–98）

```ts
 72 │ /**
 73 │  * A helper function that takes CompatFieldNodeOptions, and produce a writable signal synced to the
 74 │  * value of contained AbstractControl.
 75 │  *
 76 │  * This uses toSignal, which requires an injector.
 77 │  *
 78 │  * @param options
 79 │  */
 80 ▶ function getControlValueSignal<T>(options: CompatFieldNodeOptions) {
 81 ▶   const value = extractControlPropToSignal<T>(options, (control, destroy$) => {
 82 ▶     return toSignal(
 83 ▶       control.valueChanges.pipe(
 84 ▶         map(() => control.getRawValue()),
 85 │         takeUntil(destroy$),
 86 │       ),
 87 │       {
 88 ▶         initialValue: control.getRawValue(),
 89 │       },
 90 │     );
 91 │   }) as WritableSignal<T>;
 92 │ 
 93 ▶   value.set = (value: T) => {
 94 ▶     options.control().setValue(value);
 95 │   };
 96 │ 
 97 ▶   value.update = (fn: (current: T) => T) => {
 98 ▶     value.set(fn(value()));
 99 │   };
100 │ 
101 │   return value;
102 │ }
```

📄 `angular/packages/forms/signals/compat/src/compat_field_node.ts` L59–80 （▶ の行: 68–70, 72, 79）

```ts
59 │ export function extractControlPropToSignal<T, R = T>(
60 │   options: CompatFieldNodeOptions,
61 │   makeSignal: (c: AbstractControl<unknown, T>, destroy$: Observable<void>) => Signal<R>,
62 │ ): Signal<R> {
63 │   const injector = getInjectorFromOptions(options);
64 │ 
65 │   // Creates a subject that could be used in takeUntil.
66 │   const createDestroySubject = makeCreateDestroySubject();
67 │ 
68 ▶   const signalOfControlSignal = linkedSignal({
69 ▶     source: options.control,
70 ▶     computation: (control) => {
71 │       return untracked(() => {
72 ▶         return runInInjectionContext(injector, () => makeSignal(control, createDestroySubject()));
73 │       });
74 │     },
75 │   });
76 │ 
77 │   // We have to have computed, because we need to react to both:
78 │   // linked signal changes as well as the inner signal changes.
79 ▶   return computed(() => signalOfControlSignal()());
80 │ }
```

- 読む向き：82〜90 行目、control の `valueChanges` を `getRawValue()` に写し、`toSignal` で signal にします（初期値も 88 行目で `getRawValue()`）。compat のフィールドの `value()` は `FormControl` そのものではなく、その**値**です。
- 書く向き：93〜95 行目、`value.set(v)` は `control().setValue(v)` です。値の持ち主は `FormControl` のままで、写しは `valueChanges` を通って戻ってきます。
- 68〜75 行目、control が差し替わると linkedSignal が新しい control で `makeSignal` をやり直し、79 行目の computed は常にいまの control の signal を読みます。古い購読は `takeUntil(destroy$)` で止まります。

📄 `angular/packages/forms/signals/compat/src/compat_node_state.ts` L18–53 （▶ の行: 30–32, 34–35, 39–40, 43–44）

```ts
18 │ export class CompatNodeState extends FieldNodeState {
19 │   override readonly touched: Signal<boolean>;
20 │   override readonly dirty: Signal<boolean>;
21 │   override readonly disabled: Signal<boolean>;
22 │   private readonly control: Signal<AbstractControl>;
23 │ 
24 │   constructor(
25 │     readonly compatNode: CompatFieldNode,
26 │     options: CompatFieldNodeOptions,
27 │   ) {
28 │     super(compatNode);
29 │     this.control = options.control;
30 ▶     this.touched = getControlEventsSignal(options, (c) => c.touched);
31 ▶     this.dirty = getControlEventsSignal(options, (c) => c.dirty);
32 ▶     const controlDisabled = getControlStatusSignal(options, (c) => c.disabled);
33 │ 
34 ▶     this.disabled = computed(() => {
35 ▶       return controlDisabled() || this.disabledReasons().length > 0;
36 │     });
37 │   }
38 │ 
39 ▶   override markAsDirty() {
40 ▶     this.control().markAsDirty();
41 │   }
42 │ 
43 ▶   override markAsTouched() {
44 ▶     this.control().markAsTouched();
45 │   }
46 │ 
47 │   override markAsPristine() {
48 │     this.control().markAsPristine();
49 │   }
50 │ 
51 │   override markAsUntouched() {
52 │     this.control().markAsUntouched();
53 │   }
```

📄 `angular/packages/forms/signals/compat/src/compat_validation_state.ts` L38–53 （▶ の行: 42–44, 46, 50）

```ts
38 │   constructor(
39 │     private readonly node: CompatFieldNode,
40 │     options: CompatFieldNodeOptions,
41 │   ) {
42 ▶     this.syncValid = getControlStatusSignal(options, (c: AbstractControl) => c.status === 'VALID');
43 ▶     this.errors = getControlStatusSignal(options, extractNestedReactiveErrors);
44 ▶     this.pending = getControlStatusSignal(options, (c) => c.pending);
45 │ 
46 ▶     this.valid = getControlStatusSignal(options, (c) => {
47 │       return c.valid;
48 │     });
49 │ 
50 ▶     this.invalid = getControlStatusSignal(options, (c) => {
51 │       return c.invalid;
52 │     });
53 │   }
```

状態も同じやり方です。touched・dirty は 30〜31 行目で control の `events` から、disabled は 32 行目で `statusChanges` から写し、34〜36 行目で「control が disabled か、Signal Forms の親が disabled」にします（[第 18 回](18-forms-sf-rules-metadata.md)の `disabledReasons` も効く）。印を付ける操作は 39〜45 行目で control に転送するので、2 節の `submit` の touched は `FormControl` の `touched` にも付きます。検証は 42〜52 行目で control の `status`・`errors` を写すだけで、Signal Forms のルールは走りません。`Validators.required` の結果が `errors()` に出ます。

## 7. SignalFormControl：Signal Forms を AbstractControl として見せる

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L84–115 （▶ の行: 84, 99, 101, 104, 106–107, 110–111, 113）

```ts
 84 ▶ export class SignalFormControl<T> extends AbstractControl {
 85 │   /** Source FieldTree. */
 86 │   public readonly fieldTree: FieldTree<T>;
 87 │   /** The raw signal driving the control value. */
 88 │   public readonly sourceValue: WritableSignal<T>;
 89 │ 
 90 │   private readonly fieldState: FieldState<T>;
 91 │   private readonly initialValue: T;
 92 │   private pendingParentNotifications = 0;
 93 │   private readonly onChangeCallbacks: Array<(value?: any, emitModelEvent?: boolean) => void> = [];
 94 │   private readonly onDisabledChangeCallbacks: Array<(isDisabled: boolean) => void> = [];
 95 │   override readonly valueChanges = new EventEmitter<T>();
 96 │   override readonly statusChanges = new EventEmitter<FormControlStatus>();
 97 │ 
 98 │   constructor(value: T, schemaOrOptions?: SchemaFn<T> | FormOptions<T>, options?: FormOptions<T>) {
 99 ▶     super(null, null);
100 │ 
101 ▶     const [model, schema, opts] = normalizeFormArgs<T>([signal(value), schemaOrOptions, options]);
102 │     this.sourceValue = model;
103 │     this.initialValue = value;
104 ▶     const injector = opts?.injector ?? inject(Injector);
105 │ 
106 ▶     const rawTree = schema
107 ▶       ? compatForm(this.sourceValue, schema, {injector})
108 │       : compatForm(this.sourceValue, {injector});
109 │ 
110 ▶     this.fieldTree = wrapFieldTreeForSyncUpdates(rawTree, () =>
111 ▶       this.parent?.updateValueAndValidity({sourceControl: this} as any),
112 │     );
113 ▶     this.fieldState = this.fieldTree();
114 │ 
115 │     this.defineCompatProperties();
```

逆向きです。84 行目で `AbstractControl` を継承し、101 行目で初期値から自分の `signal` を作って、106〜108 行目で `compatForm` を作ります。中身は Signal Forms の木そのもので、`AbstractControl` の顔は、それを読む getter の集まりです。104 行目で `inject(Injector)` を呼ぶので、`new SignalFormControl(...)` は注入コンテキスト（フィールド初期化子など）の中で書きます。110〜112 行目、`fieldTree` は「値を set したら即座に親の `updateValueAndValidity` を呼ぶ」ように包んだものです。

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L503–526 （▶ の行: 508, 513, 516–518, 525）

```ts
503 │ /**
504 │  * A FieldTree proxy that patches setters to immediately react on value changes.
505 │  * @param tree
506 │  * @param onUpdate
507 │  */
508 ▶ function wrapFieldTreeForSyncUpdates<T>(tree: FieldTree<T>, onUpdate: () => void): FieldTree<T> {
509 │   const treeCache = new CachingWeakMap<FieldTree<unknown>, FieldTree<unknown>>();
510 │   const stateCache = new CachingWeakMap<FieldState<unknown>, FieldState<unknown>>();
511 │ 
512 │   // Takes a FieldState and wraps a value to instantly call onUpdate.
513 ▶   const wrapState = (state: FieldState<unknown>): FieldState<unknown> => {
514 │     const {value} = state;
515 │     const wrappedValue = Object.assign((...a: unknown[]) => (value as Function)(...a), {
516 ▶       set: (v: unknown) => {
517 ▶         value.set(v);
518 ▶         onUpdate();
519 │       },
520 │       update: (fn: (v: unknown) => unknown) => {
521 │         value.update(fn);
522 │         onUpdate();
523 │       },
524 │     }) as WritableSignal<unknown>;
525 ▶     return Object.create(state, {value: {get: () => wrappedValue}});
526 │   };
```

包み方は 513〜526 行目で、`FieldState` の `value` だけを差し替えたオブジェクトを `Object.create(state, ...)` で作り、516〜518 行目の `set` で元の set のあとに `onUpdate()` を呼びます。`FormGroup` は子の変化を自分から見に行かないので（[第 3 回](03-forms-update-value-validity.md)）、子から親を呼ぶ必要があります。

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L117–140 （▶ の行: 118, 120, 122–124, 131, 133, 135, 137）

```ts
117 │     // Value changes effect
118 ▶     effect(
119 │       () => {
120 ▶         const value = this.sourceValue();
121 │         untracked(() => {
122 ▶           this.notifyParentUnlessPending();
123 ▶           this.valueChanges.emit(value);
124 ▶           this.emitControlEvent(new ValueChangeEvent(value, this));
125 │         });
126 │       },
127 │       {injector},
128 │     );
129 │ 
130 │     // Status changes effect
131 ▶     effect(
132 │       () => {
133 ▶         const status = this.status;
134 │         untracked(() => {
135 ▶           this.statusChanges.emit(status);
136 │         });
137 ▶         this.emitControlEvent(new StatusChangeEvent(status, this));
138 │       },
139 │       {injector},
140 │     );
```

包んだ set を通らない変化（入力欄からの書き込みなど）は、この effect が拾います。118〜128 行目、`sourceValue` が変わると、122 行目で親に `updateValueAndValidity` を頼み（直前に同期で頼んであれば数を減らすだけ）、123 行目で `valueChanges` を出し、124 行目で `ValueChangeEvent` を `events` に流します。131〜140 行目の status も同じで、touched・dirty・disabled の effect もこの下に続きます。effect なので、これらの通知は値が変わった**その場ではなく**、effect が走るとき（変更検知の中）に届きます。

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L312–339 （▶ の行: 312–314, 316–317, 319–320, 322, 325–326）

```ts
312 ▶   override get status(): FormControlStatus {
313 ▶     if (this.fieldState.disabled()) {
314 ▶       return 'DISABLED';
315 │     }
316 ▶     if (this.fieldState.valid()) {
317 ▶       return 'VALID';
318 │     }
319 ▶     if (this.fieldState.invalid()) {
320 ▶       return 'INVALID';
321 │     }
322 ▶     return 'PENDING';
323 │   }
324 │ 
325 ▶   override get valid(): boolean {
326 ▶     return this.fieldState.valid();
327 │   }
328 │ 
329 │   override get invalid(): boolean {
330 │     return this.fieldState.invalid();
331 │   }
332 │ 
333 │   override get pending(): boolean {
334 │     return this.fieldState.pending();
335 │   }
336 │ 
337 │   override get disabled(): boolean {
338 │     return this.fieldState.disabled();
339 │   }
```

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L434–448 （▶ の行: 434–435, 442–443）

```ts
434 ▶   override disable(_opts?: {onlySelf?: boolean; emitEvent?: boolean}): void {
435 ▶     throw unsupportedDisableEnableError();
436 │   }
437 │ 
438 │   override enable(_opts?: {onlySelf?: boolean; emitEvent?: boolean}): void {
439 │     throw unsupportedDisableEnableError();
440 │   }
441 │ 
442 ▶   override setValidators(_validators: any): void {
443 ▶     throw unsupportedValidatorsError();
444 │   }
445 │ 
446 │   override setAsyncValidators(_validators: any): void {
447 │     throw unsupportedValidatorsError();
448 │   }
```

312〜323 行目、`status` は Signal Forms の状態から作ります。disabled なら `'DISABLED'`、`valid()` なら `'VALID'`、`invalid()` なら `'INVALID'`、どちらでもなければ `'PENDING'`。[第 17 回](17-forms-sf-validation.md)の `'unknown'` が、リアクティブの `'PENDING'` に当たります。逆に、状態を命令で変える API は 434〜448 行目のように例外です。`disable()` の代わりに `disabled` ルール、`setValidators()` の代わりに `applyWhen` を使え、とメッセージが言います（同じファイルの `unsupportedValidatorsError`）。

> [!NOTE]
> **ポイント**
>
> 最新の main（../angular-main のコミット `9e99093bfe3`「fix(forms): reject unsupported updateOn in SignalFormControl」）では、このクラスに `updateOn` の検査が足されています。コンストラクタの options に `updateOn: 'blur'` などを渡したとき、または親の `FormGroup` / `FormArray` の `updateOn` が `'change'` 以外のときに、開発ビルドで例外を投げ、`get updateOn()` は常に `'change'` を返します。この章のソース（v22.2.0-next.7）とサイトの 22.1.6 には、まだこの検査がありません。

### \[formField\] の側から：InteropNgControl

📄 `angular/packages/forms/signals/src/controls/interop_ng_control.ts` L56–80 （▶ の行: 57–59, 63, 66, 68, 70, 73–74）

```ts
56 │ /**
57 ▶  * A fake version of `NgControl` provided by the `Field` directive. This allows interoperability
58 ▶  * with a wider range of components designed to work with reactive forms, in particular ones that
59 ▶  * inject the `NgControl`. The interop control does not implement *all* properties and methods of
60 │  * the real `NgControl`, but does implement some of the most commonly used ones that have a clear
61 │  * equivalent in signal forms.
62 │  */
63 ▶ export class InteropNgControl implements CombinedControl {
64 │   constructor(protected field: () => ReadonlyFieldState<unknown>) {}
65 │ 
66 ▶   readonly control: AbstractControl<any, any> = this as unknown as AbstractControl<any, any>;
67 │ 
68 ▶   get value(): unknown {
69 │     // CVA controls are not aware of user debouncing and will expect `NgControl.value` to reflect their latest writes.
70 ▶     return this.field().controlValue();
71 │   }
72 │ 
73 ▶   get valid(): boolean {
74 ▶     return this.field().valid();
75 │   }
76 │ 
77 │   get invalid(): boolean {
78 │     return this.field().invalid();
79 │   }
80 │ 
```

📄 `angular/packages/forms/signals/src/controls/interop_ng_control.ts` L132–146 （▶ の行: 132, 134, 137–138, 143）

```ts
132 ▶   valueAccessor: ControlValueAccessor | null = null;
133 │ 
134 ▶   hasValidator(validator: ValidatorFn): boolean {
135 │     // This addresses a common case where users look for the presence of `Validators.required` to
136 │     // determine whether or not to show a required "*" indicator in the UI.
137 ▶     if (validator === Validators.required) {
138 ▶       return this.field().required();
139 │     }
140 │     return false;
141 │   }
142 │ 
143 ▶   updateValueAndValidity() {
144 │     // No-op since value and validity are always up to date in signal forms.
145 │     // We offer this method so that reactive forms code attempting to call it doesn't error.
146 │   }
```

もう 1 つのつなぎ目は、`NgControl` を inject する既存の部品（Angular Material の `mat-form-field` など）を `[formField]` の下で動かすための偽物です。`[formField]` は `NgControl` としてこれを provide します（[signal-forms](../signals/17-signal-forms.md) の 8 節）。66 行目で自分自身を `control` として返し、70 行目の `value` は debounce 前の `controlValue`、73〜75 行目以降の getter は `FieldState` の signal を読むだけです。137〜138 行目、`hasValidator(Validators.required)` は metadata の `required()` で答えます（必須の「\*」を出す部品がよくこれを呼ぶ）。143 行目、`updateValueAndValidity()` は何もしません。

## 8. ここまでを 1 本に（FormRoot から送信して、サーバーがエラーを返す）

- 👤 `<form [formRoot]="f">` の送信ボタンを押す
  - `FormRoot.onSubmit` → `preventDefault` — form\_root.ts 46
  - `submit(fieldTree)` — form\_root.ts 53 — *await しない*
    - options = `fieldManager.submitOptions` — structure.ts 465
    - `node.markAsTouched()` → `markAsTouchedInternal` — structure.ts 477 / node.ts 283 — *非対話は飛ばす*
    - `shouldRunAction` → `!invalid()` — structure.ts 523 — *pending なら走る*
    - `selfSubmitting.set(true)` → `await action(root, detail)` — structure.ts 485–486
      - 👤 action が `[{kind: 'server', fieldTree: f.username}, {kind: 'server'}]` を返す
    - `setSubmissionErrors` → `addDefaultField` → 付け先ごとに set — structure.ts 542 / 552 — *2 つ目は根に付く*
    - finally：`selfSubmitting.set(false)` — structure.ts 494
- 👤 username を書き直す → linkedSignal が空に戻る — submit.ts 27–30

## 9. DEMO 1：submit と擬似サーバー

> **🧪 DEMO — &lt;form \[formRoot\]&gt; と submit()**
>
> 本物の `@angular/forms/signals`（22.1.6）です。`form(account, schema, { submission: { action, onInvalid } })` を `<form [formRoot]="f">` に付けています。username には 1.5 秒かかる `validateAsync`（常に通る）を付けてあります。action は 800 ms 待ってから、選んだモードの結果を返す擬似サーバーです（外部通信なし）。「例外を投げる」は `FormRoot` を通さず `submit(f, { action })` を直接呼び、返る Promise を try/catch で受けます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-sf-submit-compat)

空のまま送信すると、両方の `touched` が `true` になり、`required` エラーが出て、ログには `onInvalid` だけが出ます（1 節 477・490 行目）。password を入れ、最後に username を入れて**すぐ**（1.5 秒以内に）送信すると、ログの「action 開始」に `pending=true` と出ます。非同期の検証が終わっていなくても action は走ります（523 行目）。「使われている」モードでは、800 ms 後に username に `server` エラー、`fieldTree` を書かなかった 2 つ目は根の `f().errors()` に出ます（542 行目）。username を 1 文字変えると、username の `server` エラーも根のエラーも消えます。username の value が変わると根の value（model 全体）も変わるので、根の linkedSignal も空に戻るからです。「例外を投げる」は、reject がログに出て、その時点で `submitting` はもう `false` です（494 行目）。

## 10. DEMO 2：compatForm と SignalFormControl

> **🧪 DEMO — FormControl を Signal Forms に、Signal Forms を FormGroup に**
>
> 上の段：`compatForm(signal({ title: '', legacy: new FormControl('旧フォーム', {validators: [required, minLength(3)]}) }))`。legacy の同じ `FormControl` を、`[formField]="mixed.legacy"` と リアクティブの `[formControl]="legacy"` の 2 つの入力欄につないでいます。下の段：`new FormGroup({ legacyName: new FormControl(...), signalName: new SignalFormControl('', (p) => { required(p); minLength(p, 2) }) })`。どちらも `@angular/forms/signals/compat`（22.1.6）です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-sf-submit-compat)

上の段の 2 つの legacy の入力欄は、どちらに打ってももう片方に反映されます。`[formField]` 側の書き込みは 6 節 93〜95 行目で `setValue` になり、`[formControl]` 側の書き込みは `valueChanges` → 82〜90 行目の `toSignal` で `mixed.legacy().value()` に届きます。legacy を 2 文字にすると `errors()` に `minlength` が出ます。Signal Forms のルールではなく、リアクティブの `Validators.minLength` の結果を写したものです（6 節 43 行目）。下の段で signalName を空にすると、`FormGroup` の status が `INVALID` になります。`SignalFormControl` の `status` getter（7 節 312〜323 行目）を、`FormGroup` がいつもどおり子の status として読んでいるだけです。

## テストと直し方

| spec（signals/test/） | describe / it | 確かめていること |
| --- | --- | --- |
| `node/submit.spec.ts` | 23 行目 `describe('submit')` › 51 行目 `describe('while pending')` › 52 行目 `it('should not block')` | 1 節 523 行目（pending は待たない） |
| `node/submit.spec.ts` | 255 行目 `it('maps untargeted errors to form root')`・382 行目 `it('recovers from errors thrown by submit action')`・396 行目 `it('errors are cleared on edit')`・420 行目 `it('does not mark disabled fields as touched')`・541 行目 `it('fails with pending validators with ignoreValidators: none')` | 3 節 542 行目、1 節 493〜495 行目、3 節の linkedSignal、2 節 287 行目、1 節 520〜521 行目 |
| `node/form_root.spec.ts` | 35 行目 `describe('FormRoot')` › 55 行目 `it('should not call submit if the field tree does not define submit options')` | 4 節 52 行目 |
| `node/compat/compat.spec.ts` | 28 行目 `describe('Forms compat')` › 78 行目 `it('picks up the value from a new form control')`・230 行目 `describe('state propagation')` › 231 行目 `it('propagates disabled state from parent')` | 5 節 123〜125 行目、6 節 34〜36 行目 |
| `node/compat/signal_form_control.spec.ts` | 29 行目 `describe('SignalFormControl')` › 528 行目 `describe('unsupported methods')` | 7 節 434〜448 行目 |
| `node/compat/signal_form_control_in_form_group.spec.ts` | 21 行目 `describe('SignalFormControl in FormGroup')` › 33 行目 `it('should propagate patchValue updates from child to parent')` | 7 節の親への通知 |
| `web/compat_form.spec.ts`・`web/interop.spec.ts` | 16 行目 `describe('compatForm with [formField] directive')`、59 行目 `describe('ControlValueAccessor')` | DOM を使う側（`//packages/forms/signals/test/web:test`） |

📄 `ターミナル（../angular で実行）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/signals/test/node:test \
  --test_arg=--filter="^(submit |FormRoot |Forms compat |SignalFormControl )" \
  --test_output=all
```

📄 `実際に走らせた記録（scratchpad/forms-logs/e-forms-sf-rules-submit.log）`

```
# 第 18 回のフィルタと | でつないだ 1 本で走らせた記録
# --test_arg=--filter="^(hidden |readonly |FieldNode disabled |submit |FormRoot |Forms compat |SignalFormControl )"
Ran 170 of 539 specs
170 specs, 0 failures
//packages/forms/signals/test/node:test                                  PASSED in 1.0s
# 内訳（spec ファイルの it の数）
#   この回の分: submit 28 + FormRoot 5 + Forms compat 32
#              + SignalFormControl 57 + SignalFormControl in FormGroup 28 = 150
#   第 18 回の分: 20
```

`SignalFormControl `（末尾に空白）は `SignalFormControl in FormGroup` の describe にも当たるので、2 つの spec ファイルの分が両方入ります。

- **送信の条件・順番**なら、`api/structure.ts` の `submit`・`shouldRunAction`・`setSubmissionErrors`。足す先は `node/submit.spec.ts`（`form()` を作って `await submit(...)` する形）。
- **サーバーのエラーが消える・消えない**なら、`field/submit.ts` の linkedSignal。足す先は同じく `submit.spec.ts` の `errors are cleared on edit` の近く。
- **FormControl を混ぜたときの値や状態**なら、`compat/src/compat_structure.ts`・`compat_node_state.ts`・`compat_validation_state.ts`。足す先は `node/compat/compat.spec.ts`。
- **FormGroup の中の SignalFormControl**なら、`signal_form_control.ts` の effect と `wrapFieldTreeForSyncUpdates`。足す先は `signal_form_control_in_form_group.spec.ts`。

手元で確かめるなら、`structure.ts` 523 行目を `untracked(node.valid)` に変えます。`should not block`（`submit.spec.ts` 52 行目）は解決しない Promise の loader で待ち中を作り、75 行目で `expect(await submit(f, {action: submitSpy})).toBe(true)` としているので、`valid()` が偽のこの状態では `false` が返って落ちます。確かめたら戻します。本家の issue でよくある「送信のときに非同期の検証を待ってほしい」は、523 行目と `ignoreValidators: 'none'` の話として読めます（[第 20 回](20-forms-issues.md)）。PR を出す前提では読みません。

## 聞かれそうな質問

**Q. submit の action の中で例外が出たらどうなりますか？**

送信中の印は finally で下ろされ（`structure.ts` 493〜495 行目）、例外は `submit()` の返す Promise の reject になります。`catch` が無いので、エラーはどのフィールドにも置かれません（487 行目に届かない）。`submit()` を自分で呼ぶなら `await` して try/catch で受けます。`FormRoot` は `form_root.ts` 53 行目で await せずに呼ぶので、未処理の reject になります。サーバーの失敗をフィールドのエラーとして見せたいなら、action の中で catch して `{ kind: 'server', ... }` を*返す*のが筋です。spec は `submit.spec.ts` の `recovers from errors thrown by submit action` です。

**Q. submit は非同期の検証が終わるのを待ちますか？**

待ちません。既定の判定は `!invalid()`（523 行目）で、待ち中でエラーがまだ無い状態は invalid ではないので action が走ります。待ち中なら送らない、にしたければ `ignoreValidators: 'none'`（520〜521 行目、`valid()` が真のときだけ）。その場合は送られずに `onInvalid` が呼ばれ、検証が終わってから押し直してもらう形になります。

**Q. 既存のリアクティブフォームを少しずつ Signal Forms に移すには？**

2 方向あります。新しい画面を Signal Forms で書き、まだ移せない部品の `FormControl` を model に入れて `compatForm` で包む（`compat_form.ts` 139 行目、`compat_field_adapter.ts` 107〜108 行目）。その control の値と状態は 6 節のとおり写されるので、Signal Forms の側から読めます。逆に、既存の `FormGroup` はそのまま、1 つのフィールドだけを `SignalFormControl` にしてルールを Signal Forms で書く（7 節）。どちらの場合も、検証はそれぞれの持ち主の仕組みで走ります（compat のノードは control の errors を写すだけ、`compat_validation_state.ts` 42〜52 行目）。

**Q. SignalFormControl は FormGroup に入れられますか？**

入れられます。`AbstractControl` を継承し（`signal_form_control.ts` 84 行目）、`status`・`valid` などを Signal Forms の状態から答える getter を持つので（312〜339 行目）、`FormGroup` は普通の子として読みます。子から親への通知は、包んだ `fieldTree` の set（516〜518 行目）と effect（118〜128 行目）で `parent.updateValueAndValidity` を呼びます。ただし `disable()`・`setValidators()` などは例外です（434〜448 行目）。最新の main では、親の `updateOn` が `'change'` 以外でも開発ビルドで例外になります（7 節の囲み）。

**Q. サーバーのエラーはいつ消えますか？**

そのフィールドの値が変わったときです。`submissionErrors` は value を source にした linkedSignal で（`submit.ts` 27〜30 行目）、source が変わると計算（常に `[]`）に戻ります。次の `submit` でも上書きされます（`structure.ts` 552 行目）。ただし set されるのはエラーがあったフィールドだけなので、前回エラーがあって今回は無いフィールドは、値を変えるまで前回のエラーが残ります。

## 読み終えて

- `submit()` は二重送信を止め、全部 touched にし（非対話は飛ばす）、既定では `!invalid()` なら action を走らせる。pending は待たない
- action の戻り値のエラーは `addDefaultField` で付け先を決め（無ければ submit したフィールド）、各フィールドの `submissionErrors` に直接 set される
- `submissionErrors` は value を source にした linkedSignal なので、値を直すと消える。例外は finally を通って reject になり、エラーは置かれない
- `compatForm` は adapter の差し替えだけ。`FormControl` の場所には、control の値・状態・エラーを `toSignal` で写し、書き込みを `setValue` に転送するノードができる
- `SignalFormControl` は中に `compatForm` を持つ `AbstractControl`。状態は getter で写し、変化は包んだ set と effect で親の `updateValueAndValidity` を呼んで伝える

---

← 前: [Signal Forms の状態ルール：disabled・hidden・readonly と metadata](18-forms-sf-rules-metadata.md)  
次: [forms の issue と PR を読む：どこから関わるか](20-forms-issues.md) →
