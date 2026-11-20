[目次](../README.md) › [Forms の説明文の読み残し](README.md) › 第 7 回 / 全 10 回

# リアクティブフォームのディレクティブの説明文

> directives/reactive\_directives の form\_group\_name.ts・abstract\_form.directive.ts・form\_control\_name.ts・form\_control\_directive.ts と form\_providers.ts の未読の行：formGroupName・formArrayName・formControlName・\[formControl\]・\[formArray\] の説明文と例のアプリ、ReactiveFormsModule.withConfig、disabled 属性と ngModel の警告がいつ何回出るか。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-reactive-dirs)

---

この章で分かること：`formGroupName`・`formArrayName`・`formControlName`・`[formControl]`・`[formGroup]`・`[formArray]` の説明文が `{@example}` で指す例のアプリを、テンプレートを変えずに本物で動かすと、コメントに書かれた値になるか。説明文の「親は `FormGroupDirective` だけ」「次の例は」「`whenDisabled`」のような言い方が、実装と合っているか。開発モードだけの 2 つの警告（`disabled` 属性と `ngModel`）がいつ何回出るか。

読む対象は `packages/forms/src/directives/reactive_directives/` の `form_group_name.ts`・`abstract_form.directive.ts`・`form_control_name.ts`・`form_control_directive.ts`・`form_group_directive.ts`・`form_array_directive.ts`、`directives/abstract_form_group_directive.ts`、`form_providers.ts`、例の `packages/examples/forms/ts/` の 4 つで、これまでの章が引いていない行です（../angular、8576f161ae4）。名前から control を探す流れ、`ngOnChanges`、`_updateDomValue`、submit と reset の中身は[リアクティブのディレクティブ](../forms/12-forms-reactive-directives.md)で読みました。ここでは説明文と例の約束を確かめます。

1. [1. AbstractControl](01-fmd-abstract-model.md)
2. [2. FormGroup・FormRecord・FormArray](02-fmd-group-array.md)
3. [3. FormControl と FormBuilder](03-fmd-control-builder.md)
4. [4. Validators](04-fmd-validators.md)
5. [5. エラーの文言と小道具](05-fmd-errors.md)
6. [6. NgControl](06-fmd-ng-control.md)
7. **7. リアクティブのディレクティブ**（この章）
8. [8. テンプレート駆動のディレクティブ](08-fmd-template-dirs.md)
9. [9. 値のアクセサー](09-fmd-accessors.md)
10. [10. spec と issue](10-fmd-tests-issues.md)

## 1. 最上位：FormGroupDirective と FormArrayDirective の説明文

📄 `angular/packages/forms/src/directives/reactive_directives/abstract_form.directive.ts` L47–55 （▶ の行: 50–51, 53）

```ts
47 │ /**
48 │  * @description
49 │  *
50 ▶  * Abstract class for top-level form directives (FormArrayDirective, FormGroupDirective) who bind an
51 ▶  * existing `Form` to a DOM element.
52 │  *
53 ▶  * @publicApi
54 │  */
55 │ @Directive()
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_group_directive.ts` L16–44 （▶ の行: 16–18, 24, 26–29, 37–38, 40）

```ts
16 ▶ const formDirectiveProvider: Provider = {
17 ▶   provide: ControlContainer,
18 ▶   useExisting: forwardRef(() => FormGroupDirective),
19 │ };
20 │ 
21 │ /**
22 │  * @description
23 │  *
24 ▶  * Binds an existing `FormGroup` or `FormRecord` to a DOM element.
25 │  *
26 ▶  * This directive accepts an existing `FormGroup` instance. It will then use this
27 ▶  * `FormGroup` instance to match any child `FormControl`, `FormGroup`/`FormRecord`,
28 ▶  * and `FormArray` instances to child `FormControlName`, `FormGroupName`,
29 ▶  * and `FormArrayName` directives.
30 │  *
31 │  * @see [Reactive Forms Guide](guide/forms/reactive-forms)
32 │  * @see {@link AbstractControl}
33 │  *
34 │  * @usageNotes
35 │  * ### Register Form Group
36 │  *
37 ▶  * The following example registers a `FormGroup` with first name and last name controls,
38 ▶  * and listens for the *ngSubmit* event when the button is clicked.
39 │  *
40 ▶  * {@example forms/ts/simpleFormGroup/simple_form_group_example.ts region='Component'}
41 │  *
42 │  * @ngModule ReactiveFormsModule
43 │  * @publicApi
44 │  */
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_array_directive.ts` L16–42 （▶ の行: 24, 26–29, 35, 37–38, 40）

```ts
16 │ const formDirectiveProvider: Provider = {
17 │   provide: ControlContainer,
18 │   useExisting: forwardRef(() => FormArrayDirective),
19 │ };
20 │ 
21 │ /**
22 │  * @description
23 │  *
24 ▶  * Binds an existing `FormArray` to a DOM element.
25 │  *
26 ▶  * This directive accepts an existing `FormArray` instance. It will then use this
27 ▶  * `FormArray` instance to match any child `FormControl`, `FormGroup`/`FormRecord`,
28 ▶  * and `FormArray` instances to child `FormControlName`, `FormGroupName`,
29 ▶  * and `FormArrayName` directives.
30 │  *
31 │  * @see [Reactive Forms Guide](guide/forms/reactive-forms)
32 │  * @see {@link AbstractControl}
33 │  *
34 │  * @usageNotes
35 ▶  * ### Register Form Array
36 │  *
37 ▶  * The following example registers a `FormArray` with first name and last name controls,
38 ▶  * and listens for the *ngSubmit* event when the button is clicked.
39 │  *
40 ▶  * @ngModule ReactiveFormsModule
41 │  * @publicApi
42 │  */
```

`AbstractFormDirective` の 50〜51 行目は「既存の `Form` を DOM の要素に結ぶ最上位のディレクティブ（`FormArrayDirective`・`FormGroupDirective`）の抽象クラス」です。2 つの子の説明文はほぼ同じ文で、24 行目「既存の `FormGroup`（`FormArray`）を結ぶ」、26〜29 行目「子の `FormControlName`・`FormGroupName`・`FormArrayName` を、渡したものの子に名前で合わせる」。16〜19 行目でどちらも `ControlContainer` として自分を出します。

違いは最後です。form\_group\_directive.ts は 37〜38 行目「次の例は…」のあと 40 行目に `{@example …}` がありますが、form\_array\_directive.ts は 37〜38 行目で「次の例は、名と姓の control を持つ `FormArray` を登録し、ボタンで *ngSubmit* を聞く」と書いたまま、40 行目は `@ngModule` で、**例がありません**。この 3 行は 0dd95c503f4（2024-06-18、`feat(forms): Add FormArrayDirective (#55880)`）で form\_group\_directive.ts の説明文を写したときのもので、origin/main でも同じです。`[formArray]` の使い方は、下のデモの 6 番目（`<form [formArray]="arr">` の下の `[formGroupName]="0"`）で動くことを確かめました。

📄 `angular/packages/forms/src/directives/reactive_directives/abstract_form.directive.ts` L92–119 （▶ の行: 95, 97, 101, 103, 106, 112–113, 116–117）

```ts
 92 │ 
 93 │   /**
 94 │    * @description
 95 ▶    * Tracks the form bound to this directive.
 96 │    */
 97 ▶   public abstract form: AbstractControl;
 98 │ 
 99 │   /**
100 │    * @description
101 ▶    * Emits an event when the form submission has been triggered.
102 │    */
103 ▶   abstract ngSubmit: EventEmitter<any>;
104 │ 
105 │   constructor(
106 ▶     @Optional() @Self() @Inject(NG_VALIDATORS) validators: (Validator | ValidatorFn)[],
107 │     @Optional()
108 │     @Self()
109 │     @Inject(NG_ASYNC_VALIDATORS)
110 │     asyncValidators: (AsyncValidator | AsyncValidatorFn)[],
111 │     @Optional()
112 ▶     @Inject(CALL_SET_DISABLED_STATE)
113 ▶     private callSetDisabledState?: SetDisabledStateOption,
114 │   ) {
115 │     super();
116 ▶     this._setValidators(validators);
117 ▶     this._setAsyncValidators(asyncValidators);
118 │   }
119 │ 
```

📄 `angular/packages/forms/src/directives/reactive_directives/abstract_form.directive.ts` L140–165 （▶ の行: 143–144, 151–153, 160, 162–163）

```ts
140 │ 
141 │   /** @nodoc */
142 │   protected onDestroy() {
143 ▶     if (this.form) {
144 ▶       cleanUpValidators(this.form, this);
145 │ 
146 │       // Currently the `onCollectionChange` callback is rewritten each time the
147 │       // `_registerOnCollectionChange` function is invoked. The implication is that cleanup should
148 │       // happen *only* when the `onCollectionChange` callback was set by this directive instance.
149 │       // Otherwise it might cause overriding a callback of some other directive instances. We should
150 │       // consider updating this logic later to make it similar to how `onChange` callbacks are
151 ▶       // handled, see https://github.com/angular/angular/issues/39732 for additional info.
152 ▶       if (this.form._onCollectionChange === this._onCollectionChange) {
153 ▶         this.form._registerOnCollectionChange(() => {});
154 │       }
155 │     }
156 │   }
157 │ 
158 │   /**
159 │    * @description
160 ▶    * Returns this directive's instance.
161 │    */
162 ▶   override get formDirective(): Form {
163 ▶     return this;
164 │   }
165 │ 
```

📄 `angular/packages/forms/src/directives/reactive_directives/abstract_form.directive.ts` L166–180 （▶ の行: 168, 170, 174–175, 177–178）

```ts
166 │   /**
167 │    * @description
168 ▶    * Returns the Form bound to this directive.
169 │    */
170 ▶   abstract override get control(): AbstractControl;
171 │ 
172 │   /**
173 │    * @description
174 ▶    * Returns an array representing the path to this group. Because this directive
175 ▶    * always lives at the top level of a form, it always an empty array.
176 │    */
177 ▶   override get path(): string[] {
178 ▶     return [];
179 │   }
180 │ 
```

97 行目の抽象プロパティ `form` を、子が `@Input('formGroup')` / `@Input('formArray')` で埋めます。106〜117 行目の constructor は、自分の要素の検証のディレクティブ（`NG_VALIDATORS`）と、112〜113 行目の `CALL_SET_DISABLED_STATE`（5 節）を受けます。143〜155 行目の `onDestroy` は、自分が足した検証関数を外し、152 行目で「コレクションの変化のコールバックが自分の物のときだけ」空の関数に戻します（151 行目の #39732）。162〜164 行目の `formDirective` は自分自身、174〜179 行目の `path` は必ず空の配列です。175 行目の文は「it **is** always」の is が抜けています（`NgForm` の同じ文は 206 行目で「it is always」、[第 8 回](08-fmd-template-dirs.md)）。

📄 `angular/packages/forms/src/directives/reactive_directives/abstract_form.directive.ts` L216–254 （▶ の行: 218, 222–223, 232–233, 238, 242–243, 248, 252–253）

```ts
216 │ 
217 │   /**
218 ▶    * Adds a new `FormGroupName` directive instance to the form.
219 │    *
220 │    * @param dir The `FormGroupName` directive instance.
221 │    */
222 ▶   addFormGroup(dir: FormGroupName): void {
223 ▶     this._setUpFormContainer(dir);
224 │   }
225 │ 
226 │   /**
227 │    * Performs the necessary cleanup when a `FormGroupName` directive instance is removed from the
228 │    * view.
229 │    *
230 │    * @param dir The `FormGroupName` directive instance.
231 │    */
232 ▶   removeFormGroup(dir: FormGroupName): void {
233 ▶     this._cleanUpFormContainer(dir);
234 │   }
235 │ 
236 │   /**
237 │    * @description
238 ▶    * Retrieves the `FormGroup` for a provided `FormGroupName` directive instance
239 │    *
240 │    * @param dir The `FormGroupName` directive instance.
241 │    */
242 ▶   getFormGroup(dir: FormGroupName): FormGroup {
243 ▶     return <FormGroup>this.form.get(dir.path);
244 │   }
245 │ 
246 │   /**
247 │    * @description
248 ▶    * Retrieves the `FormArray` for a provided `FormArrayName` directive instance.
249 │    *
250 │    * @param dir The `FormArrayName` directive instance.
251 │    */
252 ▶   getFormArray(dir: FormArrayName): FormArray {
253 ▶     return <FormArray>this.form.get(dir.path);
254 │   }
```

📄 `angular/packages/forms/src/directives/reactive_directives/abstract_form.directive.ts` L255–285 （▶ の行: 257, 261–262, 271–272, 276, 281–283）

```ts
255 │ 
256 │   /**
257 ▶    * Performs the necessary setup when a `FormArrayName` directive instance is added to the view.
258 │    *
259 │    * @param dir The `FormArrayName` directive instance.
260 │    */
261 ▶   addFormArray(dir: FormArrayName): void {
262 ▶     this._setUpFormContainer(dir);
263 │   }
264 │ 
265 │   /**
266 │    * Performs the necessary cleanup when a `FormArrayName` directive instance is removed from the
267 │    * view.
268 │    *
269 │    * @param dir The `FormArrayName` directive instance.
270 │    */
271 ▶   removeFormArray(dir: FormArrayName): void {
272 ▶     this._cleanUpFormContainer(dir);
273 │   }
274 │ 
275 │   /**
276 ▶    * Sets the new value for the provided `FormControlName` directive.
277 │    *
278 │    * @param dir The `FormControlName` directive instance.
279 │    * @param value The new value for the directive's control.
280 │    */
281 ▶   updateModel(dir: FormControlName, value: any): void {
282 ▶     const ctrl = <FormControl>this.form.get(dir.path);
283 ▶     ctrl.setValue(value);
284 │   }
285 │ 
```

📄 `angular/packages/forms/src/directives/reactive_directives/abstract_form.directive.ts` L347–368 （▶ の行: 348–350, 354, 357–358, 360, 364）

```ts
347 │ 
348 ▶   private _setUpFormContainer(dir: FormArrayName | FormGroupName): void {
349 ▶     const ctrl: any = this.form.get(dir.path);
350 ▶     setUpFormContainer(ctrl, dir);
351 │     // NOTE: this operation looks unnecessary in case no new validators were added in
352 │     // `setUpFormContainer` call. Consider updating this code to match the logic in
353 │     // `_cleanUpFormContainer` function.
354 ▶     ctrl.updateValueAndValidity({emitEvent: false});
355 │   }
356 │ 
357 ▶   private _cleanUpFormContainer(dir: FormArrayName | FormGroupName): void {
358 ▶     const ctrl: any = this.form?.get(dir.path);
359 │     if (ctrl) {
360 ▶       const isControlUpdated = cleanUpFormContainer(ctrl, dir);
361 │       if (isControlUpdated) {
362 │         // Run validity check only in case a control was updated (i.e. view validators were
363 │         // removed) as removing view validators might cause validity to change.
364 ▶         ctrl.updateValueAndValidity({emitEvent: false});
365 │       }
366 │     }
367 │   }
368 │ 
```

`addFormGroup`・`addFormArray`（222・261 行目）はどちらも 348〜355 行目の `_setUpFormContainer` で、`form.get(dir.path)` の control に要素の検証関数を足します（`setUpFormContainer`、[第 5 回](05-fmd-errors.md)）。354 行目の `NOTE` は「検証関数が増えていなくても毎回 `updateValueAndValidity` している」と自分で書いています。外すときの 357〜367 行目は、検証関数が本当に外れたときだけ検証し直します。`getFormGroup`・`getFormArray`（242・252 行目）は `form.get(dir.path)` を型で言い直すだけです。281〜284 行目の `updateModel` は `Form` インターフェース（[第 6 回](06-fmd-ng-control.md)の 7 節）の 1 つで、`formControlName` に `ngModel` を一緒に書いたときに使われます（4 節）。

## 2. formGroupName と formArrayName

📄 `angular/packages/forms/src/directives/reactive_directives/form_group_name.ts` L33–65 （▶ の行: 34–35, 41, 43, 45–47, 49–51, 63）

````ts
33 │ const formGroupNameProvider: Provider = {
34 ▶   provide: ControlContainer,
35 ▶   useExisting: forwardRef(() => FormGroupName),
36 │ };
37 │ 
38 │ /**
39 │  * @description
40 │  *
41 ▶  * Syncs a nested `FormGroup` or `FormRecord` to a DOM element.
42 │  *
43 ▶  * This directive can only be used with a parent `FormGroupDirective`.
44 │  *
45 ▶  * It accepts the string name of the nested `FormGroup` or `FormRecord` to link, and
46 ▶  * looks for a `FormGroup` or `FormRecord` registered with that name in the parent
47 ▶  * `FormGroup` instance you passed into `FormGroupDirective`.
48 │  *
49 ▶  * Use nested form groups to validate a sub-group of a
50 ▶  * form separately from the rest or to group the values of certain
51 ▶  * controls into their own nested object.
52 │  *
53 │  * @see [Reactive Forms Guide](guide/forms/reactive-forms)
54 │  *
55 │  * @usageNotes
56 │  *
57 │  * ### Access the group by name
58 │  *
59 │  * The following example uses the `AbstractControl.get` method to access the
60 │  * associated `FormGroup`
61 │  *
62 │  * ```ts
63 ▶  *   this.form.get('name');
64 │  * ```
65 │  *
````

📄 `angular/packages/forms/src/directives/reactive_directives/form_group_name.ts` L66–89 （▶ の行: 72, 77–78, 80, 86）

````ts
66 │  * ### Access individual controls in the group
67 │  *
68 │  * The following example uses the `AbstractControl.get` method to access
69 │  * individual controls within the group using dot syntax.
70 │  *
71 │  * ```ts
72 ▶  *   this.form.get('name.first');
73 │  * ```
74 │  *
75 │  * ### Register a nested `FormGroup`.
76 │  *
77 ▶  * The following example registers a nested *name* `FormGroup` within an existing `FormGroup`,
78 ▶  * and provides methods to retrieve the nested `FormGroup` and individual controls.
79 │  *
80 ▶  * {@example forms/ts/nestedFormGroup/nested_form_group_example.ts region='Component'}
81 │  *
82 │  * @ngModule ReactiveFormsModule
83 │  * @publicApi
84 │  */
85 │ @Directive({
86 ▶   selector: '[formGroupName]',
87 │   providers: [formGroupNameProvider],
88 │   standalone: false,
89 │ })
````

📄 `angular/packages/forms/src/directives/reactive_directives/form_group_name.ts` L90–122 （▶ の行: 93–95, 97–98, 100, 103, 117–119）

```ts
 90 │ export class FormGroupName extends AbstractFormGroupDirective implements OnInit, OnDestroy {
 91 │   /**
 92 │    * @description
 93 ▶    * Tracks the name of the `FormGroup` bound to the directive. The name corresponds
 94 ▶    * to a key in the parent `FormGroup` or `FormArray`.
 95 ▶    * Accepts a name as a string or a number.
 96 │    * The name in the form of a string is useful for individual forms,
 97 ▶    * while the numerical form allows for form groups to be bound
 98 ▶    * to indices when iterating over groups in a `FormArray`.
 99 │    */
100 ▶   @Input('formGroupName') override name: string | number | null = null;
101 │ 
102 │   constructor(
103 ▶     @Optional() @Host() @SkipSelf() parent: ControlContainer,
104 │     @Optional() @Self() @Inject(NG_VALIDATORS) validators: (Validator | ValidatorFn)[],
105 │     @Optional()
106 │     @Self()
107 │     @Inject(NG_ASYNC_VALIDATORS)
108 │     asyncValidators: (AsyncValidator | AsyncValidatorFn)[],
109 │   ) {
110 │     super();
111 │     this._parent = parent;
112 │     this._setValidators(validators);
113 │     this._setAsyncValidators(asyncValidators);
114 │   }
115 │ 
116 │   /** @internal */
117 ▶   override _checkParentType(): void {
118 ▶     if (hasInvalidParent(this._parent) && (typeof ngDevMode === 'undefined' || ngDevMode)) {
119 ▶       throw groupParentException();
120 │     }
121 │   }
122 │ }
```

41 行目は「入れ子の `FormGroup` か `FormRecord` を DOM の要素に結ぶ」、43 行目は「**親の `FormGroupDirective` とだけ**使える」、45〜47 行目は「名前を受け取り、`FormGroupDirective` に渡した `FormGroup` の中からその名前の物を探す」です。ところが同じクラスの 93〜98 行目は「名前は親の `FormGroup`**か `FormArray`** のキー。数は `FormArray` の中のグループを繰り返すときに便利」と、`FormArray` の下で使う書き方を説明しています。117〜121 行目の親の検査は 233〜238 行目の `hasInvalidParent` で、`FormGroupName`・`AbstractFormDirective`（`[formGroup]` と `[formArray]`）・`FormArrayName` のどれでもよい形です。デモの 6 番目では、`formArrayName="items"` の下の `[formGroupName]="0"` も、`[formArray]` の下の `[formGroupName]="0"` も、中の `formControlName="x"` に値が入りました。43 行目の文は 3e51a199830（2017-03-02、ソースを packages/ に移したとき）より前からで、origin/main でも同じです。

59〜63 行目と 71〜72 行目の例は `this.form.get('name')` と `this.form.get('name.first')` で、80 行目が次の 3 節の nestedFormGroup の例を指します。103 行目の親は `@Optional() @Host() @SkipSelf()` で、自分の要素の外の、同じテンプレートの中の `ControlContainer` を探します。

1. **DI で親を受け取る**

   103 行目の `@Optional() @Host() @SkipSelf()` で、外側の `ControlContainer`（`[formGroup]`・`[formArray]`・`formArrayName`・`formGroupName`）を 111 行目の `_parent` に入れます。
2. **ngOnInit で親を確かめる**

   117〜121 行目の `_checkParentType` が `hasInvalidParent` を呼び、3 つの形のどれでもなければ開発モードで例外です。
3. **最上位に登録する**

   `formDirective`（親をたどった最上位）の `addFormGroup` が `form.get(dir.path)` の control に要素の検証関数を足します（1 節の 348〜355 行目）。
4. **子の formControlName が control を探す**

   子の `path` は親の `path` に自分の名前を足した配列で、最上位の `form.get(path)` で control が決まります。

📄 `angular/packages/forms/src/directives/reactive_directives/form_group_name.ts` L124–157 （▶ の行: 132, 134–135, 137–139, 148）

```ts
124 │ export const formArrayNameProvider: any = {
125 │   provide: ControlContainer,
126 │   useExisting: forwardRef(() => FormArrayName),
127 │ };
128 │ 
129 │ /**
130 │  * @description
131 │  *
132 ▶  * Syncs a nested `FormArray` to a DOM element.
133 │  *
134 ▶  * This directive is designed to be used with a parent `FormGroupDirective`/`FormArrayDirective` (selector:
135 ▶  * `[formGroup]`/`[formArray]`).
136 │  *
137 ▶  * It accepts the string name of the nested `FormArray` you want to link, and
138 ▶  * will look for a `FormArray` registered with that name in the parent
139 ▶  * `FormGroup`/`FormArray` instance you passed into `FormGroupDirective`/`FormArrayDirective`.
140 │  *
141 │  * @see [Reactive Forms Guide](guide/forms/reactive-forms)
142 │  * @see {@link AbstractControl}
143 │  *
144 │  * @usageNotes
145 │  *
146 │  * ### Example
147 │  *
148 ▶  * {@example forms/ts/nestedFormArray/nested_form_array_example.ts region='Component'}
149 │  *
150 │  * @ngModule ReactiveFormsModule
151 │  * @publicApi
152 │  */
153 │ @Directive({
154 │   selector: '[formArrayName]',
155 │   providers: [formArrayNameProvider],
156 │   standalone: false,
157 │ })
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_group_name.ts` L158–197 （▶ の行: 158, 164–165, 168–169, 171, 192–194, 196）

```ts
158 ▶ export class FormArrayName extends ControlContainer implements OnInit, OnDestroy {
159 │   /** @internal */
160 │   _parent: ControlContainer;
161 │ 
162 │   /**
163 │    * @description
164 ▶    * Tracks the name of the `FormArray` bound to the directive. The name corresponds
165 ▶    * to a key in the parent `FormGroup` or `FormArray`.
166 │    * Accepts a name as a string or a number.
167 │    * The name in the form of a string is useful for individual forms,
168 ▶    * while the numerical form allows for form arrays to be bound
169 ▶    * to indices when iterating over arrays in a `FormArray`.
170 │    */
171 ▶   @Input('formArrayName') override name: string | number | null = null;
172 │ 
173 │   constructor(
174 │     @Optional() @Host() @SkipSelf() parent: ControlContainer,
175 │     @Optional() @Self() @Inject(NG_VALIDATORS) validators: (Validator | ValidatorFn)[],
176 │     @Optional()
177 │     @Self()
178 │     @Inject(NG_ASYNC_VALIDATORS)
179 │     asyncValidators: (AsyncValidator | AsyncValidatorFn)[],
180 │   ) {
181 │     super();
182 │     this._parent = parent;
183 │     this._setValidators(validators);
184 │     this._setAsyncValidators(asyncValidators);
185 │   }
186 │ 
187 │   /**
188 │    * A lifecycle method called when the directive's inputs are initialized. For internal use only.
189 │    * @throws If the directive does not have a valid parent.
190 │    * @docs-private
191 │    */
192 ▶   ngOnInit(): void {
193 ▶     if (hasInvalidParent(this._parent) && (typeof ngDevMode === 'undefined' || ngDevMode)) {
194 ▶       throw arrayParentException();
195 │     }
196 ▶     this.formDirective!.addFormArray(this);
197 │   }
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_group_name.ts` L198–231 （▶ の行: 204, 211–212, 219–220, 225–226, 229）

```ts
198 │ 
199 │   /**
200 │    * A lifecycle method called before the directive's instance is destroyed. For internal use only.
201 │    * @docs-private
202 │    */
203 │   ngOnDestroy(): void {
204 ▶     this.formDirective?.removeFormArray(this);
205 │   }
206 │ 
207 │   /**
208 │    * @description
209 │    * The `FormArray` bound to this directive.
210 │    */
211 ▶   override get control(): FormArray {
212 ▶     return this.formDirective!.getFormArray(this);
213 │   }
214 │ 
215 │   /**
216 │    * @description
217 │    * The top-level directive for this group if present, otherwise null.
218 │    */
219 ▶   override get formDirective(): AbstractFormDirective | null {
220 ▶     return this._parent ? <AbstractFormDirective>this._parent.formDirective : null;
221 │   }
222 │ 
223 │   /**
224 │    * @description
225 ▶    * Returns an array that represents the path from the top-level form to this control.
226 ▶    * Each index is the string name of the control on that level.
227 │    */
228 │   override get path(): string[] {
229 ▶     return controlPath(this.name == null ? this.name : this.name.toString(), this._parent);
230 │   }
231 │ }
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_group_name.ts` L232–239 （▶ の行: 233, 235–237）

```ts
232 │ 
233 ▶ function hasInvalidParent(parent: ControlContainer): boolean {
234 │   return (
235 ▶     !(parent instanceof FormGroupName) &&
236 ▶     !(parent instanceof AbstractFormDirective) &&
237 ▶     !(parent instanceof FormArrayName)
238 │   );
239 │ }
```

`FormArrayName` の 134〜139 行目は、v21 で入った `[formArray]`（0dd95c503f4 は 21.0.0-next.1 から入っている）に合わせて「`FormGroupDirective`/`FormArrayDirective` の下で使う」と書き直されています。158 行目で `AbstractFormGroupDirective` ではなく `ControlContainer` を直接継承し、192〜197 行目の `ngOnInit` で親を確かめて（193〜195 行目、開発モードだけ）、196 行目で `addFormArray` を呼びます。219〜221 行目で `formDirective` を `AbstractFormDirective` に**キャスト**しているのは、`addFormArray` が `Form` インターフェースに無いからです（[第 6 回](06-fmd-ng-control.md)の 7 節）。229 行目の `path` は `this.name.toString()` で、225〜226 行目の「各要素は文字列の名前」を守ります（`formGroupName` も同じ形で、abstract\_form\_group\_directive.ts の 60〜62 行目、[リアクティブのディレクティブ](../forms/12-forms-reactive-directives.md)の引用）。

📄 `angular/packages/forms/src/directives/abstract_form_group_directive.ts` L9–25 （▶ の行: 19, 21, 23–24）

```ts
 9 │ import {Directive, OnDestroy, OnInit} from '@angular/core';
10 │ 
11 │ import {FormGroup} from '../model/form_group';
12 │ 
13 │ import {ControlContainer} from './control_container';
14 │ import type {Form} from './form_interface';
15 │ import {controlPath} from './shared';
16 │ 
17 │ /**
18 │  * @description
19 ▶  * A base class for code shared between the `NgModelGroup` and `FormGroupName` directives.
20 │  *
21 ▶  * @publicApi
22 │  */
23 ▶ @Directive({
24 ▶   standalone: false,
25 │ })
```

📄 `angular/packages/forms/src/directives/abstract_form_group_directive.ts` L63–74 （▶ の行: 68–69, 73）

```ts
63 │ 
64 │   /**
65 │    * @description
66 │    * The top-level directive for this group if present, otherwise null.
67 │    */
68 ▶   override get formDirective(): Form | null {
69 ▶     return this._parent ? this._parent.formDirective : null;
70 │   }
71 │ 
72 │   /** @internal */
73 ▶   _checkParentType(): void {}
74 │ }
```

19 行目は「`NgModelGroup` と `FormGroupName` の共通のコード」。68〜70 行目の `formDirective` は親をたどって最上位を返し、73 行目の `_checkParentType` は空で、子が上書きします（`FormGroupName` は 117 行目、`NgModelGroup` は[第 8 回](08-fmd-template-dirs.md)）。60〜62 行目の `path` と 36〜46 行目の登録は[リアクティブのディレクティブ](../forms/12-forms-reactive-directives.md)で引用しました。

## 3. 例のアプリ：コメントに書かれた値と、本物の値

📄 `angular/packages/examples/forms/ts/simpleFormGroup/simple_form_group_example.ts` L14–47 （▶ の行: 17–19, 21–22, 26, 32–33, 41, 45）

```ts
14 │ @Component({
15 │   selector: 'example-app',
16 │   template: `
17 ▶     <form [formGroup]="form" (ngSubmit)="onSubmit()">
18 ▶       @if (first.invalid) {
19 ▶         <div>Name is too short.</div>
20 │       }
21 ▶       <input formControlName="first" placeholder="First name" />
22 ▶       <input formControlName="last" placeholder="Last name" />
23 │ 
24 │       <button type="submit">Submit</button>
25 │     </form>
26 ▶     <button (click)="setValue()">Set preset value</button>
27 │   `,
28 │   standalone: false,
29 │ })
30 │ export class SimpleFormGroup {
31 │   form = new FormGroup({
32 ▶     first: new FormControl('Nancy', Validators.minLength(2)),
33 ▶     last: new FormControl('Drew'),
34 │   });
35 │ 
36 │   get first(): any {
37 │     return this.form.get('first');
38 │   }
39 │ 
40 │   onSubmit(): void {
41 ▶     console.log(this.form.value); // {first: 'Nancy', last: 'Drew'}
42 │   }
43 │ 
44 │   setValue() {
45 ▶     this.form.setValue({first: 'Carson', last: 'Drew'});
46 │   }
47 │ }
```

`formControlName` と `[formGroup]` の説明文が指す例です。デモでは、作った直後の 2 つの input が `'Nancy', 'Drew'`、Submit で 41 行目のコメントどおり `{"first":"Nancy","last":"Drew"}`、`first` に `'a'` を入れると 19 行目の文が出て、Set preset value で `'Carson', 'Drew'` になりました。

📄 `angular/packages/examples/forms/ts/nestedFormGroup/nested_form_group_example.ts` L14–40 （▶ の行: 18, 21–23, 25, 35–37, 39）

```ts
14 │ @Component({
15 │   selector: 'example-app',
16 │   template: `
17 │     <form [formGroup]="form" (ngSubmit)="onSubmit()">
18 ▶       @if (name.invalid) {
19 │         <p>Name is invalid.</p>
20 │       }
21 ▶       <div formGroupName="name">
22 ▶         <input formControlName="first" placeholder="First name" />
23 ▶         <input formControlName="last" placeholder="Last name" />
24 │       </div>
25 ▶       <input formControlName="email" placeholder="Email" />
26 │       <button type="submit">Submit</button>
27 │     </form>
28 │ 
29 │     <button (click)="setPreset()">Set preset</button>
30 │   `,
31 │   standalone: false,
32 │ })
33 │ export class NestedFormGroupComp {
34 │   form = new FormGroup({
35 ▶     name: new FormGroup({
36 ▶       first: new FormControl('Nancy', Validators.minLength(2)),
37 ▶       last: new FormControl('Drew', Validators.required),
38 │     }),
39 ▶     email: new FormControl(),
40 │   });
```

📄 `angular/packages/examples/forms/ts/nestedFormGroup/nested_form_group_example.ts` L41–60 （▶ の行: 51–54, 58）

```ts
41 │ 
42 │   get first(): any {
43 │     return this.form.get('name.first');
44 │   }
45 │ 
46 │   get name(): any {
47 │     return this.form.get('name');
48 │   }
49 │ 
50 │   onSubmit() {
51 ▶     console.log(this.first.value); // 'Nancy'
52 ▶     console.log(this.name.value); // {first: 'Nancy', last: 'Drew'}
53 ▶     console.log(this.form.value); // {name: {first: 'Nancy', last: 'Drew'}, email: ''}
54 ▶     console.log(this.form.status); // VALID
55 │   }
56 │ 
57 │   setPreset() {
58 ▶     this.name.setValue({first: 'Bess', last: 'Marvin'});
59 │   }
60 │ }
```

51・52・54 行目のコメントは本物と同じでした（`'Nancy'`、`{first: 'Nancy', last: 'Drew'}`、`VALID`）。違うのは 53 行目です。コメントは `email: ''` ですが、本物の `form.value` は `{"name":{"first":"Nancy","last":"Drew"},"email":null}` でした。39 行目の `new FormControl()` は値が `null` で、`formControlName="email"` の `DefaultValueAccessor` は `null` を `''` にして**input に書くだけ**（[第 9 回](09-fmd-accessors.md)）なので、利用者が触るまで control は `null` のままです。このコメントは 2cdd0511092（2016-09-12、`docs(forms): update example for formGroupName (#11510)`）からで、origin/main でも同じです。例の e2e の spec（`e2e_test/nested_form_group_spec.ts`）は input の値と文を見るだけで、`form.value` を確かめていません。デモの最後の行で form に reset イベントを送ると、`form.value` は `{"name":{"first":null,"last":null},"email":null}` でした。`resetForm` の説明文（abstract\_form.directive.ts の 296 行目「初期の値に戻す」、[リアクティブのディレクティブ](../forms/12-forms-reactive-directives.md)の引用）とは違い、`nonNullable` でない control は `null` に戻ります（[第 8 回](08-fmd-template-dirs.md)の 3 節）。

📄 `angular/packages/examples/forms/ts/nestedFormArray/nested_form_array_example.ts` L14–52 （▶ の行: 18–20, 33, 41, 45–46, 50）

```ts
14 │ @Component({
15 │   selector: 'example-app',
16 │   template: `
17 │     <form [formGroup]="form" (ngSubmit)="onSubmit()">
18 ▶       <div formArrayName="cities">
19 ▶         @for (city of cities.controls; track city) {
20 ▶           <input [formControlName]="$index" placeholder="City" />
21 │         }
22 │       </div>
23 │       <button>Submit</button>
24 │     </form>
25 │ 
26 │     <button (click)="addCity()">Add City</button>
27 │     <button (click)="setPreset()">Set preset</button>
28 │   `,
29 │   standalone: false,
30 │ })
31 │ export class NestedFormArray {
32 │   form = new FormGroup({
33 ▶     cities: new FormArray([new FormControl('SF'), new FormControl('NY')]),
34 │   });
35 │ 
36 │   get cities(): FormArray {
37 │     return this.form.get('cities') as FormArray;
38 │   }
39 │ 
40 │   addCity() {
41 ▶     this.cities.push(new FormControl());
42 │   }
43 │ 
44 │   onSubmit() {
45 ▶     console.log(this.cities.value); // ['SF', 'NY']
46 ▶     console.log(this.form.value); // { cities: ['SF', 'NY'] }
47 │   }
48 │ 
49 │   setPreset() {
50 ▶     this.cities.patchValue(['LA', 'MTV']);
51 │   }
52 │ }
```

20 行目の `[formControlName]="$index"` は、`FormControlName` の 116〜117 行目の「数の名前は `FormArray` の中を繰り返すときに便利」の使い方です。Submit で 45〜46 行目のとおり `["SF","NY"]` と `{"cities":["SF","NY"]}`、Add City で input が 3 つ（3 つ目は `''`）、Set preset（50 行目の `patchValue(['LA', 'MTV'])`）で 3 つ目の control は `null` のまま `["LA","MTV",null]` でした。

📄 `angular/packages/examples/forms/ts/simpleFormControl/simple_form_control_example.ts` L13–31 （▶ の行: 16, 18–19, 26, 29）

```ts
13 │ @Component({
14 │   selector: 'example-app',
15 │   template: `
16 ▶     <input [formControl]="control" />
17 │ 
18 ▶     <p>Value: {{ control.value }}</p>
19 ▶     <p>Validation status: {{ control.status }}</p>
20 │ 
21 │     <button (click)="setValue()">Set value</button>
22 │   `,
23 │   standalone: false,
24 │ })
25 │ export class SimpleFormControl {
26 ▶   control: FormControl = new FormControl('value', Validators.minLength(2));
27 │ 
28 │   setValue() {
29 ▶     this.control.setValue('new value');
30 │   }
31 │ }
```

`[formControl]` の説明文が指す例です。作った直後は `Value: value` / `Validation status: VALID`、`'x'` を入れると `minLength(2)` で `INVALID`、Set value で `'new value'` / `VALID` でした。4 つの例のファイルは、どれも `strict` と `strictTemplates` を付けた `ngc` にそのまま通りました（記録の場所の `tsc-ex`）。

## 4. formControlName と \[formControl\] の説明文

📄 `angular/packages/forms/src/directives/reactive_directives/form_control_name.ts` L54–90 （▶ の行: 61–62, 72–73, 75, 79–80, 84–86）

```ts
54 │ const controlNameBinding: Provider = {
55 │   provide: NgControl,
56 │   useExisting: forwardRef(() => FormControlName),
57 │ };
58 │ 
59 │ /**
60 │  * @description
61 ▶  * Syncs a `FormControl` in an existing `FormGroup` to a form control
62 ▶  * element by name.
63 │  *
64 │  * @see [Reactive Forms Guide](guide/forms/reactive-forms)
65 │  * @see {@link FormControl}
66 │  * @see {@link AbstractControl}
67 │  *
68 │  * @usageNotes
69 │  *
70 │  * ### Register `FormControl` within a group
71 │  *
72 ▶  * The following example shows how to register multiple form controls within a form group
73 ▶  * and set their value.
74 │  *
75 ▶  * {@example forms/ts/simpleFormGroup/simple_form_group_example.ts region='Component'}
76 │  *
77 │  * To see `formControlName` examples with different form control types, see:
78 │  *
79 ▶  * * Radio buttons: `RadioControlValueAccessor`
80 ▶  * * Selects: `SelectControlValueAccessor`
81 │  *
82 │  * ### Use with ngModel is deprecated
83 │  *
84 ▶  * Support for using the `ngModel` input property and `ngModelChange` event with reactive
85 ▶  * form directives has been deprecated in Angular v6 and is scheduled for removal in
86 ▶  * a future version of Angular.
87 │  *
88 │  * @ngModule ReactiveFormsModule
89 │  * @publicApi
90 │  */
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_control_name.ts` L91–120 （▶ の行: 93, 97, 102, 108, 113, 116–117, 119）

```ts
 91 │ @Directive({
 92 │   selector: '[formControlName]',
 93 ▶   providers: [controlNameBinding, NG_CONTROL_INTEGRATION_PROVIDER],
 94 │   standalone: false,
 95 │ })
 96 │ export class FormControlName extends NgControl implements OnChanges, OnDestroy {
 97 ▶   private _added = false;
 98 │   /**
 99 │    * Internal reference to the view model value.
100 │    * @internal
101 │    */
102 ▶   viewModel: any;
103 │ 
104 │   /**
105 │    * @description
106 │    * Tracks the `FormControl` instance bound to the directive.
107 │    */
108 ▶   override readonly control!: FormControl;
109 │ 
110 │   /**
111 │    * @description
112 │    * Tracks the name of the `FormControl` bound to the directive. The name corresponds
113 ▶    * to a key in the parent `FormGroup` or `FormArray`.
114 │    * Accepts a name as a string or a number.
115 │    * The name in the form of a string is useful for individual forms,
116 ▶    * while the numerical form allows for form controls to be bound
117 ▶    * to indices when iterating over controls in a `FormArray`.
118 │    */
119 ▶   @Input('formControlName') override name: string | number | null = null;
120 │ 
```

61〜62 行目は「既存の `FormGroup` の中の `FormControl` を名前で要素に結ぶ」、84〜86 行目は「`ngModel` の入力と `ngModelChange` を一緒に使うのは v6 で非推奨、将来消す」です。93 行目の `providers` には `NG_CONTROL_INTEGRATION_PROVIDER` があり、[第 6 回](06-fmd-ng-control.md)の 3 節の口をここでも出します。97 行目の `_added` は「まだ親に登録していない」の印です。113 行目の「名前は親の `FormGroup` か `FormArray` のキー」は、61 行目の「`FormGroup` の中の」より広く、実装に合うのはこちらです（`checkParentType` は `FormArrayName` の下も許す。[リアクティブのディレクティブ](../forms/12-forms-reactive-directives.md)の 9 節）。

📄 `angular/packages/forms/src/directives/reactive_directives/form_control_name.ts` L131–157 （▶ の行: 134–135, 137–138, 142–143, 147, 151–152, 156）

```ts
131 │ 
132 │   // TODO(kara): remove next 4 properties once deprecation period is over
133 │ 
134 ▶   /** @deprecated as of v6 */
135 ▶   @Input('ngModel') model: any;
136 │ 
137 ▶   /** @deprecated as of v6 */
138 ▶   @Output('ngModelChange') update = new EventEmitter();
139 │ 
140 │   /**
141 │    * @description
142 ▶    * Static property used to track whether any ngModel warnings have been sent across
143 ▶    * all instances of FormControlName. Used to support warning config of "once".
144 │    *
145 │    * @internal
146 │    */
147 ▶   static _ngModelWarningSentOnce = false;
148 │ 
149 │   /**
150 │    * @description
151 ▶    * Instance property used to track whether an ngModel warning has been sent out for this
152 ▶    * particular FormControlName instance. Used to support warning config of "always".
153 │    *
154 │    * @internal
155 │    */
156 ▶   _ngModelWarningSent = false;
157 │ 
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_control_name.ts` L204–220 （▶ の行: 207, 212, 216–218）

```ts
204 │ 
205 │   /** @docs-private */
206 │   ngOnDestroy(): void {
207 ▶     this.formDirective?.removeControl(this);
208 │   }
209 │ 
210 │   /**
211 │    * @description
212 ▶    * Sets the new value for the view model and emits an `ngModelChange` event.
213 │    *
214 │    * @param newValue The new value for the view model.
215 │    */
216 ▶   override viewToModelUpdate(newValue: any): void {
217 ▶     this.viewModel = newValue;
218 ▶     this.update.emit(newValue);
219 │   }
220 │ 
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_control_name.ts` L245–276 （▶ の行: 255–256, 264, 266, 270–273）

```ts
245 │ 
246 │   /**
247 │    * Internal control directive creation lifecycle hook.
248 │    *
249 │    * The presence of this method tells the compiler to install `ɵɵControlFeature`, which will
250 │    * cause this directive to be recognized as a control directive by the `ɵcontrolCreate` and
251 │    * `ɵcontrol` instructions.
252 │    *
253 │    * @internal
254 │    */
255 ▶   ɵngControlCreate(host: ControlDirectiveHost): void {
256 ▶     super.ngControlCreate(host);
257 │   }
258 │ 
259 │   /**
260 │    * Internal control directive update lifecycle hook.
261 │    *
262 │    * @internal
263 │    */
264 ▶   ɵngControlUpdate(host: ControlDirectiveHost): void {
265 │     // Ensure behavior is the same if we're not using the custom control codepath.
266 ▶     if (!this.isCustomControlBased) {
267 │       return;
268 │     }
269 │ 
270 ▶     // this.control is typically initialized by `ngOnChanges`, however `ɵngControlUpdate` fires
271 ▶     // first. So, we're responsible for initializing it here.
272 ▶     if (!this._added) this._setUpControl();
273 ▶     super.ngControlUpdate(host, true);
274 │   }
275 │ }
276 │ 
```

134〜138 行目の `model` と `update` は `@deprecated as of v6` の印付きです。147 行目の static の `_ngModelWarningSentOnce` は「どれか 1 つの `FormControlName` で警告を出したか」（142〜143 行目、"once" のため）、156 行目は「このインスタンスで出したか」（151〜152 行目、"always" のため）で、5 節の設定がこの 2 つを読み分けます。216〜219 行目の `viewToModelUpdate` は `ngModelChange` を出すだけ、207 行目の `ngOnDestroy` は親から自分を外します。264〜274 行目は FVC の道（[第 6 回](06-fmd-ng-control.md)の 4 節）のときだけ、270〜272 行目のコメントどおり `ngOnChanges` より先に来る `ɵngControlUpdate` の中で親に登録します。main の 63f4bd4c7eb（`fix(forms): don't crash when formControlName has no matching control`）で、ここでは control を探すだけにして登録は `ngOnChanges` に任せる形に変わりました。273 行目で渡す `true` は、`NgControl.ngControlUpdate` の 2 つ目の引数 `bindRequired`（ng\_control.ts の 250 行目）に入りますが、本体はこの引数を読まず `shouldBindRequired` を見ます。main では引数ごと消えました。

📄 `angular/packages/forms/src/directives/reactive_directives/form_control_directive.ts` L44–82 （▶ の行: 45, 47–48, 58, 60–61, 72, 78–80）

```ts
44 │ /**
45 ▶  * Token to provide to turn off the ngModel warning on formControl and formControlName.
46 │  */
47 ▶ export const NG_MODEL_WITH_FORM_CONTROL_WARNING = new InjectionToken(
48 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'NgModelWithFormControlWarning' : '',
49 │ );
50 │ 
51 │ const formControlBinding: Provider = {
52 │   provide: NgControl,
53 │   useExisting: forwardRef(() => FormControlDirective),
54 │ };
55 │ 
56 │ /**
57 │  * @description
58 ▶  * Synchronizes a standalone `FormControl` instance to a form control element.
59 │  *
60 ▶  * Note that support for using the `ngModel` input property and `ngModelChange` event with reactive
61 ▶  * form directives was deprecated in Angular v6 and is scheduled for removal in
62 │  * a future version of Angular.
63 │  *
64 │  * @see [Reactive Forms Guide](guide/forms/reactive-forms)
65 │  * @see {@link FormControl}
66 │  * @see {@link AbstractControl}
67 │  *
68 │  * @usageNotes
69 │  *
70 │  * The following example shows how to register a standalone control and set its value.
71 │  *
72 ▶  * {@example forms/ts/simpleFormControl/simple_form_control_example.ts region='Component'}
73 │  *
74 │  * @ngModule ReactiveFormsModule
75 │  * @publicApi
76 │  */
77 │ @Directive({
78 ▶   selector: '[formControl]',
79 ▶   providers: [formControlBinding, NG_CONTROL_INTEGRATION_PROVIDER],
80 ▶   exportAs: 'ngForm',
81 │   standalone: false,
82 │ })
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_control_directive.ts` L83–93 （▶ の行: 83, 88）

```ts
83 ▶ export class FormControlDirective extends NgControl implements OnChanges, OnDestroy {
84 │   /**
85 │    * Internal reference to the view model value.
86 │    * @docs-private
87 │    */
88 ▶   viewModel: any;
89 │ 
90 │   /**
91 │    * @description
92 │    * Tracks the `FormControl` instance bound to the directive.
93 │    */
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_control_directive.ts` L114–132 （▶ の行: 115–118, 122, 131）

```ts
114 │ 
115 ▶   /**
116 ▶    * @description
117 ▶    * Static property used to track whether any ngModel warnings have been sent across
118 ▶    * all instances of FormControlDirective. Used to support warning config of "once".
119 │    *
120 │    * @internal
121 │    */
122 ▶   static _ngModelWarningSentOnce = false;
123 │ 
124 │   /**
125 │    * @description
126 │    * Instance property used to track whether an ngModel warning has been sent out for this
127 │    * particular `FormControlDirective` instance. Used to support warning config of "always".
128 │    *
129 │    * @internal
130 │    */
131 ▶   _ngModelWarningSent = false;
132 │ 
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_control_directive.ts` L182–206 （▶ の行: 185–186, 192–193, 196, 203–204）

```ts
182 │ 
183 │   /** @docs-private */
184 │   ngOnDestroy() {
185 ▶     if (this.form) {
186 ▶       cleanUpControl(this.form, this, /* validateControlPresenceOnChange */ false);
187 │     }
188 │   }
189 │ 
190 │   /**
191 │    * @description
192 ▶    * Returns an array that represents the path from the top-level form to this control.
193 ▶    * Each index is the string name of the control on that level.
194 │    */
195 │   override get path(): string[] {
196 ▶     return [];
197 │   }
198 │ 
199 │   /**
200 │    * @description
201 │    * The `FormControl` bound to this directive.
202 │    */
203 ▶   override get control(): FormControl {
204 ▶     return this.form;
205 │   }
206 │ 
```

📄 `angular/packages/forms/src/directives/reactive_directives/form_control_directive.ts` L221–243 （▶ の行: 231–232, 240–241）

```ts
221 │ 
222 │   /**
223 │    * Internal control directive creation lifecycle hook.
224 │    *
225 │    * The presence of this method tells the compiler to install `ɵɵControlFeature`, which will
226 │    * cause this directive to be recognized as a control directive by the `ɵcontrolCreate` and
227 │    * `ɵcontrol` instructions.
228 │    *
229 │    * @internal
230 │    */
231 ▶   ɵngControlCreate(host: ControlDirectiveHost): void {
232 ▶     super.ngControlCreate(host);
233 │   }
234 │ 
235 │   /**
236 │    * Internal control directive update lifecycle hook.
237 │    *
238 │    * @internal
239 │    */
240 ▶   ɵngControlUpdate(host: ControlDirectiveHost): void {
241 ▶     super.ngControlUpdate(host, true);
242 │   }
243 │ }
```

58 行目は「単独の `FormControl` を要素に結ぶ」。80 行目の `exportAs` は `'ngForm'` で、デモの `#c="ngForm"` は `FormControlDirective` を指しました。`[formControl]` の説明文は `exportAs` に触れていません。45 行目の `NG_MODEL_WITH_FORM_CONTROL_WARNING` は「`formControl` と `formControlName` の ngModel の警告を止めるために provide するトークン」で、5 節の `withConfig` がこのトークンに値を入れます。192〜197 行目の `path` は空の配列、203〜205 行目の `control` は入力の `form` そのものです。

デモの 5 番目は `[formControl]="current()"` の signal を `a` から `b` に替えました。input は `'B の値'` になり、そのあとの入力は `b` にだけ入り、外れた `a` に `setValue` しても input は変わりません。前の control を `cleanUpControl` で外してから新しい方を `setUpControlValueAccessor` する `ngOnChanges` は[リアクティブのディレクティブ](../forms/12-forms-reactive-directives.md)の 1 節にあります。

## 5. ReactiveFormsModule.withConfig と、開発モードの 2 つの警告

📄 `angular/packages/forms/src/form_providers.ts` L9–31 （▶ の行: 24–25, 27–28）

```ts
 9 │ import {ModuleWithProviders, NgModule} from '@angular/core';
10 │ 
11 │ import {
12 │   InternalFormsSharedModule,
13 │   NG_MODEL_WITH_FORM_CONTROL_WARNING,
14 │   REACTIVE_DRIVEN_DIRECTIVES,
15 │   TEMPLATE_DRIVEN_DIRECTIVES,
16 │ } from './directives';
17 │ import {
18 │   CALL_SET_DISABLED_STATE,
19 │   setDisabledStateDefault,
20 │   SetDisabledStateOption,
21 │ } from './directives/shared';
22 │ 
23 │ /**
24 ▶  * Exports the required providers and directives for template-driven forms,
25 ▶  * making them available for import by NgModules that import this module.
26 │  *
27 ▶  * @see [Forms Overview](guide/forms)
28 ▶  * @see [Template-driven Forms Guide](guide/forms)
29 │  *
30 │  * @publicApi
31 │  */
```

📄 `angular/packages/forms/src/form_providers.ts` L74–102 （▶ の行: 79–82, 85–86, 93, 97）

```ts
 74 │   /**
 75 │    * @description
 76 │    * Provides options for configuring the reactive forms module.
 77 │    *
 78 │    * @param opts An object of configuration options
 79 ▶    * * `warnOnNgModelWithFormControl` Configures when to emit a warning when an `ngModel`
 80 ▶    * binding is used with reactive form directives.
 81 ▶    * * `callSetDisabledState` Configures whether to `always` call `setDisabledState`, which is more
 82 ▶    * correct, or to only call it `whenDisabled`, which is the legacy behavior.
 83 │    */
 84 │   static withConfig(opts: {
 85 ▶     /** @deprecated as of v6 */ warnOnNgModelWithFormControl?: 'never' | 'once' | 'always';
 86 ▶     callSetDisabledState?: SetDisabledStateOption;
 87 │   }): ModuleWithProviders<ReactiveFormsModule> {
 88 │     return {
 89 │       ngModule: ReactiveFormsModule,
 90 │       providers: [
 91 │         {
 92 │           provide: NG_MODEL_WITH_FORM_CONTROL_WARNING,
 93 ▶           useValue: opts.warnOnNgModelWithFormControl ?? 'always',
 94 │         },
 95 │         {
 96 │           provide: CALL_SET_DISABLED_STATE,
 97 ▶           useValue: opts.callSetDisabledState ?? setDisabledStateDefault,
 98 │         },
 99 │       ],
100 │     };
101 │   }
102 │ }
```

27〜28 行目の 2 つの `@see` は、「Forms Overview」と「Template-driven Forms Guide」がどちらも `guide/forms` を指しています。adev には `guide/forms/template-driven-forms` のページ（adev/src/content/guide/forms/template-driven-forms.md）があり、`ReactiveFormsModule` の側は `guide/forms/reactive-forms` を指しています。

81〜82 行目は「`callSetDisabledState` は、`always`（より正しい）か、`whenDisabled`（古い動き）だけで呼ぶかを決める」と書きますが、型 `SetDisabledStateOption` の値は `'whenDisabledForLegacyCode' | 'always'` で、`'whenDisabled'` はありません。説明文のとおり `ReactiveFormsModule.withConfig({callSetDisabledState: 'whenDisabled'})` と書くと、`tsc --strict` で `TS2322: Type '"whenDisabled"' is not assignable to type 'SetDisabledStateOption | undefined'.` でした。この文は 96b7fe93af3（2022-10-06、`fix(forms): call setDisabledState on ControlValueAcessor when control is enabled (#47576)`）で値の名前と一緒に入ったもので、`FormsModule.withConfig` の説明文（42〜43 行目、[forms の全体](../forms/01-forms-overview.md)の引用）も同じ言い方です。origin/main でも同じです。デモの 7 番目は、enabled の control に `[attr.disabled]="true"` を付けた input で、`'always'` は `input.disabled = false`（`setDisabledState(false)` が DOM を上書き）、`'whenDisabledForLegacyCode'` は `true` のままでした。

79〜80 行目の `warnOnNgModelWithFormControl` は 85 行目で `@deprecated as of v6` の印付きです。93 行目で、`withConfig` を呼んで値を省いたときの既定は `'always'` です。一方 `withConfig` を呼ばない（`ReactiveFormsModule` だけ）ときはトークンが無く `null` が入り、`_ngModelWarning` は `null` を `'once'` と同じに扱います（[第 5 回](05-fmd-errors.md)の shared.ts）。`withConfig({})` と書いただけで警告の数が変わる、ということです。

> **🧪 記録 — 開発モードの console.warn（Node、domino の上の JIT）**
>
> `[formControl]="c1" [disabled]="true"` の input を 1 つと、`[formControl]` に `[(ngModel)]` を一緒に書いた input を 2 つ置いたコンポーネントを、設定を替えて 4 回作ったときの警告の 1 行目です。このページ（本番ビルド）では警告が出ないので、記録を見せます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-reactive-dirs)

`disabled` の警告は、`FormControlName` の 121〜130 行目（[forms の issue](../forms/20-forms-issues.md)の引用）と `FormControlDirective` の 96〜105 行目（[リアクティブのディレクティブ](../forms/12-forms-reactive-directives.md)の引用）の setter が、入力の値を見ずに `console.warn` するだけなので、`[disabled]="false"` でも出ます。`ngModel` の警告は、`'once'` と設定なしで 2 つの input に 1 回、`'always'` で 2 回、`'never'` で 0 回でした。本番ではどれも 0 個です。

## 6. 動かして確かめる

> **🧪 DEMO — 例のアプリと説明文の文を、本物の @angular/forms で動かす**
>
> ボタンを押すと、3 節の 4 つの例（テンプレートはそのまま、`console.log` だけ記録に替えたもの）と、4〜5 節の小さな部品を、文書に付けない div の上に順に作ります。input には `input` イベントを、form には `submit` と `reset` のイベントを直接送り、ボタンは `click()` します。このページの URL・履歴・入力欄は変わりません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-reactive-dirs)

同じデモのファイルを Node（domino の上の JIT）で開発モードと本番の両方で走らせると、この表の結果は完全に同じでした。違うのは 5 節の警告の数だけです。

## ここまでの呼び出し

- 👤 `<div formArrayName="items"><div [formGroupName]="0">` — 利用者のテンプレート
  - `FormGroupName.ngOnInit` → `_checkParentType` → `hasInvalidParent` — form\_group\_name.ts 117–121 / 233–238 — *FormArrayName も許す*
  - `formDirective.addFormGroup(this)` → `_setUpFormContainer` — abstract\_form.directive.ts 222 / 348–355
- 👤 `[formControl]` + `[disabled]` / `[(ngModel)]` — 利用者のテンプレート
  - `set isDisabled` → `console.warn(disabledAttrWarning)` — form\_control\_directive.ts 100–105 — *開発モードだけ*
  - `ngOnChanges` → `_ngModelWarning('formControl', …, _ngModelWarningConfig)` — NG\_MODEL\_WITH\_FORM\_CONTROL\_WARNING（45–49） — *null は once*
- 👤 `ReactiveFormsModule.withConfig({callSetDisabledState})` — form\_providers.ts 84–101
  - `CALL_SET_DISABLED_STATE` → `AbstractFormDirective` / `FormControlDirective` の constructor — abstract\_form.directive.ts 112–113

## テストと直し方

### spec と it

| 説明文の約束 | spec（packages/forms/test/ から） |
| --- | --- |
| 2 節 formGroupName を FormArray の下で | `reactive_integration_spec.ts` の `describe('form arrays')`（666 行目）› 707 `should support form groups nested in form arrays`。`[formArray]` の直下の `formGroupName` の it は無い |
| 3 節 例のコメントの値 | 例の e2e（`packages/examples/forms/ts/*/e2e_test/`）は input の値と文を見るだけで、`onSubmit` の `console.log` の値は確かめない |
| 4 節 `[formControl]` の差し替え | `reactive_integration_spec.ts` の `describe('nested control rebinding')`（430 行目）› 431 `should attach dir to control when leaf control changes` ほか |
| 5 節 ngModel の警告の回数 | 同じファイルの `describe('deprecation warnings')`（2996 行目）› 2997・3019 `should warn once by default …`・3039 `"always"`・3057 `"never"` |
| 5 節 `disabled` 属性の警告 | `disabledAttrWarning` の `console.warn` を確かめる it は無い（`grep -rn "disabled attribute with a reactive" packages/forms/test` で 0 件） |
| 5 節 callSetDisabledState | `value_accessor_integration_spec.ts` の `describe('value accessors in reactive forms with custom options')`（1665 行目）› 1685 `does not set the enabled state when the control is initially enabled` |
| 1 節 resetForm | `reactive_integration_spec.ts` の 1474 `formControl should emit an event when resetting a form`・1566 `formArray should emit an event when resetting a form` |

### 手元で走らせた結果

../angular で `pnpm bazel test //packages/forms/test:test --nocache_test_results --test_output=all` は `1153 specs, 0 failures` でした（2026-11-21）。`--test_arg=--filter=` で `deprecation warnings` などに絞った件数は[第 10 回](10-fmd-tests-issues.md)の表にあります。

### 直すとしたら

- form\_array\_directive.ts の 37〜38 行目の後に、`[formArray]` の例（`packages/examples/forms/ts/` に新しく足すか、```` ```html ```` の小さな例）を置くか、37〜38 行目を消します。
- form\_group\_name.ts の 43 行目を「親の `FormGroupDirective`・`FormArrayDirective`・`FormGroupName`・`FormArrayName` と使える」にします。`[formArray]` の直下の it は reactive\_integration\_spec.ts の `describe('form arrays')` に足せます。
- nested\_form\_group\_example.ts の 53 行目のコメントを `email: null` にします。
- form\_providers.ts の 82 行目（と 43 行目）の `whenDisabled` を `whenDisabledForLegacyCode` にします。

## 聞かれそうな質問

**Q. formGroupName は \[formGroup\] の下でしか使えませんか？**

いいえ。`formArrayName` の下でも `[formArray]` の下でも使えます。親の検査（233〜238 行目）がその 3 つを許します。43 行目の説明文だけが狭く書いています（2 節）。

**Q. new FormControl() を formControlName で input に付けると、value は '' ですか？**

`null` のままです。accessor は `null` を `''` にして input に書くだけで、control は変えません。nestedFormGroup の例の 53 行目のコメント `email: ''` は実際と違います（3 節）。

**Q. #c="ngForm" を \[formControl\] の input に付けると何が入りますか？**

`FormControlDirective` です。80 行目の `exportAs: 'ngForm'` のためで、`NgForm` ではありません（4 節）。

**Q. ReactiveFormsModule.withConfig({}) にしただけで、何か変わりますか？**

`ngModel` の警告が `'once'` から `'always'` になります。呼ばないとトークンが `null`（once と同じ）、呼ぶと 93 行目の既定 `'always'` が入るからです（5 節）。

**Q. callSetDisabledState の古い動きの値は？**

`'whenDisabledForLegacyCode'` です。説明文の `whenDisabled` は型に無く、TS2322 になります（5 節）。

## 読み終えて

- 4 つの例はほぼコメントどおりに動く。nestedFormGroup の `email: ''` だけが `null`。
- `formGroupName` の「`FormGroupDirective` の下だけ」は狭すぎ、`[formArray]` の説明文は例を約束して例が無い。
- `callSetDisabledState` の説明文は値の名前（`whenDisabled`）を間違えている。
- 開発モードの `disabled` 属性の警告は値によらず出て、spec は無い。`ngModel` の警告の回数は `withConfig` を呼ぶかどうかで変わる。

---

← 前: [NgControl と AbstractControlDirective の説明文](06-fmd-ng-control.md)  
次: [テンプレート駆動フォームのディレクティブの説明文](08-fmd-template-dirs.md) →
