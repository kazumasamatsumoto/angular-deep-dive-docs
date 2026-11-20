[目次](../README.md) › [Forms の説明文の読み残し](README.md) › 第 8 回 / 全 10 回

# テンプレート駆動フォームのディレクティブの説明文

> directives/ng\_form.ts・ng\_model.ts・ng\_model\_group.ts・ng\_no\_validate\_directive.ts の未読の行：NgForm の submitted と reset、ngFormOptions と ngModelOptions（name・standalone・updateOn）、NgModelGroup の親、novalidate。例のアプリを本物で動かし、値がいつ入るかを 3 つの時点で読む。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-template-dirs)

---

この章で分かること：`NgForm`・`NgModel`・`NgModelGroup` の説明文の例（`packages/examples/forms/ts/` の 3 つと、説明文の中に書かれた ```` ```html ```` の例）を本物で動かすと、コメントの値になるか。`standalone`・`name`・`updateOn` のオプション、`submitted` と reset の約束。そして「値がいつ入るか」：テンプレート駆動のフォームは、作った直後の同じ処理の中では空で、1 回の microtask（`Promise` の後の処理）のあとに値が入ることを、3 つの時点で読んで記録します。

読む対象は `packages/forms/src/directives/` の `ng_form.ts`・`ng_model.ts`・`ng_model_group.ts`・`ng_no_validate_directive.ts` と、例の 3 つのファイルの、これまでの章が引いていない行です（../angular、8576f161ae4）。`NgModel` が自分で `FormControl` を作り、`resolvedPromise` で 1 拍遅らせて登録する仕組みは[ngModel の章](../forms/13-forms-ng-model.md)で読みました。ここでは説明文の約束を、その仕組みの上で確かめます。

1. [1. AbstractControl](01-fmd-abstract-model.md)
2. [2. FormGroup・FormRecord・FormArray](02-fmd-group-array.md)
3. [3. FormControl と FormBuilder](03-fmd-control-builder.md)
4. [4. Validators](04-fmd-validators.md)
5. [5. エラーの文言と小道具](05-fmd-errors.md)
6. [6. NgControl](06-fmd-ng-control.md)
7. [7. リアクティブのディレクティブ](07-fmd-reactive-dirs.md)
8. **8. テンプレート駆動のディレクティブ**（この章）
9. [9. 値のアクセサー](09-fmd-accessors.md)
10. [10. spec と issue](10-fmd-tests-issues.md)

## 1. NgForm の説明文

📄 `angular/packages/forms/src/directives/ng_form.ts` L53–82 （▶ の行: 53, 57–58, 60–61, 63–65, 69–70, 72–74, 76–80）

```ts
53 ▶ const resolvedPromise = (() => Promise.resolve())();
54 │ 
55 │ /**
56 │  * @description
57 ▶  * Creates a top-level `FormGroup` instance and binds it to a form
58 ▶  * to track aggregate form value and validation status.
59 │  *
60 ▶  * As soon as you import the `FormsModule`, this directive becomes active by default on
61 ▶  * all `<form>` tags.  You don't need to add a special selector.
62 │  *
63 ▶  * You optionally export the directive into a local template variable using `ngForm` as the key
64 ▶  * (ex: `#myForm="ngForm"`). This is optional, but useful.  Many properties from the underlying
65 ▶  * `FormGroup` instance are duplicated on the directive itself, so a reference to it
66 │  * gives you access to the aggregate value and validity status of the form, as well as
67 │  * user interaction properties like `dirty` and `touched`.
68 │  *
69 ▶  * To register child controls with the form, use `NgModel` with a `name`
70 ▶  * attribute. You may use `NgModelGroup` to create sub-groups within the form.
71 │  *
72 ▶  * If necessary, listen to the directive's `ngSubmit` event to be notified when the user has
73 ▶  * triggered a form submission. The `ngSubmit` event emits the original form
74 ▶  * submission event.
75 │  *
76 ▶  * In template driven forms, all `<form>` tags are automatically tagged as `NgForm`.
77 ▶  * To import the `FormsModule` but skip its usage in some forms,
78 ▶  * for example, to use native HTML5 validation, add the `ngNoForm` and the `<form>`
79 ▶  * tags won't create an `NgForm` directive. In reactive forms, using `ngNoForm` is
80 ▶  * unnecessary because the `<form>` tags are inert. In that case, you would
81 │  * refrain from using the `formGroup` directive.
82 │  *
```

53 行目の `resolvedPromise` は、このファイルの「1 拍遅らせる」処理がみな使う、解決済みの `Promise` です（[ngModel の章](../forms/13-forms-ng-model.md)の 4〜5 節）。57〜58 行目は「最上位の `FormGroup` を作って form に結ぶ」、60〜61 行目は「`FormsModule` を import すれば、すべての `<form>` で既定で有効」、63〜67 行目は「`#myForm="ngForm"` で取り出すと、`FormGroup` の多くのプロパティがディレクティブにもある」です（getter が control に読みに行く形は[第 6 回](06-fmd-ng-control.md)）。69〜70 行目は「子は `name` を付けた `NgModel` で登録、`NgModelGroup` で下のグループ」、72〜74 行目は「`ngSubmit` は元の submit イベントを出す」。76〜81 行目は「`ngNoForm` を付けた `<form>` には `NgForm` を作らない。リアクティブのフォームでは `<form>` は何もしないので `ngNoForm` は要らない」です。セレクター（[ngModel の章](../forms/13-forms-ng-model.md)の引用、120 行目）は `form:not([ngNoForm]):not([formGroup]):not([formArray]),ng-form,[ngForm]` で、60〜61 行目の「すべての `<form>`」から `[formGroup]` と `[formArray]` を除き、`ng-form` 要素と `[ngForm]` 属性を足した形です。デモの最後の表で、`<div ngForm>` にも `ng-valid` などのクラスが付きました。

📄 `angular/packages/forms/src/directives/ng_form.ts` L83–118 （▶ の行: 89, 93–94, 97–98, 104–108, 111）

````ts
 83 │  * @usageNotes
 84 │  *
 85 │  * ### Listening for form submission
 86 │  *
 87 │  * The following example shows how to capture the form values from the "ngSubmit" event.
 88 │  *
 89 ▶  * {@example forms/ts/simpleForm/simple_form_example.ts region='Component'}
 90 │  *
 91 │  * ### Setting the update options
 92 │  *
 93 ▶  * The following example shows you how to change the "updateOn" option from its default using
 94 ▶  * ngFormOptions.
 95 │  *
 96 │  * ```html
 97 ▶  * <form [ngFormOptions]="{updateOn: 'blur'}">
 98 ▶  *    <input name="one" ngModel>  <!-- this ngModel will update on blur -->
 99 │  * </form>
100 │  * ```
101 │  *
102 │  * ### Native DOM validation UI
103 │  *
104 ▶  * In order to prevent the native DOM form validation UI from interfering with Angular's form
105 ▶  * validation, Angular automatically adds the `novalidate` attribute on any `<form>` whenever
106 ▶  * `FormModule` or `ReactiveFormModule` are imported into the application.
107 ▶  * If you want to explicitly enable native DOM validation UI with Angular forms, you can add the
108 ▶  * `ngNativeValidate` attribute to the `<form>` element:
109 │  *
110 │  * ```html
111 ▶  * <form ngNativeValidate>
112 │  *   ...
113 │  * </form>
114 │  * ```
115 │  *
116 │  * @ngModule FormsModule
117 │  * @publicApi
118 │  */
````

93〜100 行目は「`ngFormOptions` で `updateOn` を既定から変える」例で、デモでは `one` に `'x'` を入れても `form.value` は `{"one":""…}` のまま、`blur` で `'x'` になりました。104〜109 行目は「ネイティブの検証の UI がぶつからないよう、`novalidate` 属性を自動で付ける。付けたくなければ `ngNativeValidate`」。106 行目の `FormModule` と `ReactiveFormModule` は、どちらも実在しない名前で、`FormsModule` と `ReactiveFormsModule` のことです（9a550202860、2020-02-05 から。origin/main でも同じ）。

📄 `angular/packages/forms/src/directives/ng_no_validate_directive.ts` L9–35 （▶ の行: 14, 16, 18, 21, 29–30, 33, 35）

````ts
 9 │ import {Directive} from '@angular/core';
10 │ 
11 │ /**
12 │  * @description
13 │  *
14 ▶  * Adds `novalidate` attribute to all forms by default.
15 │  *
16 ▶  * `novalidate` is used to disable browser's native form validation.
17 │  *
18 ▶  * If you want to use native validation with Angular forms, just add `ngNativeValidate` attribute:
19 │  *
20 │  * ```html
21 ▶  * <form ngNativeValidate></form>
22 │  * ```
23 │  *
24 │  * @publicApi
25 │  * @ngModule ReactiveFormsModule
26 │  * @ngModule FormsModule
27 │  */
28 │ @Directive({
29 ▶   selector: 'form:not([ngNoForm]):not([ngNativeValidate])',
30 ▶   host: {'novalidate': ''},
31 │   standalone: false,
32 │ })
33 ▶ export class ɵNgNoValidate {}
34 │ 
35 ▶ export {ɵNgNoValidate as NgNoValidate};
````

`novalidate` を付けるのは `NgForm` ではなく、この `ɵNgNoValidate` です。29 行目のセレクターは `form:not([ngNoForm]):not([ngNativeValidate])`、30 行目の host で属性を付けます。14 行目の「すべての form に既定で」から、`ngNoForm` の form も外れます。デモでは、ふつうの form が `novalidate=""`、`ngNativeValidate` と `ngNoForm` の form は属性なし、`ngNoForm` の form には ng-\* のクラスも付きませんでした。セレクターに `[formGroup]` の除外が無いので、`[formGroup]` の form にも付きます（`ReactiveFormsModule` にもこのディレクティブが入っているため。105〜106 行目のとおり）。

📄 `angular/packages/forms/src/directives/ng_form.ts` L140–163 （▶ の行: 143, 145, 149, 151, 157–159, 162）

```ts
140 │ 
141 │   /**
142 │    * @description
143 ▶    * The `FormGroup` instance created for this form.
144 │    */
145 ▶   form: FormGroup;
146 │ 
147 │   /**
148 │    * @description
149 ▶    * Event emitter for the "ngSubmit" event
150 │    */
151 ▶   ngSubmit = new EventEmitter();
152 │ 
153 │   /**
154 │    * @description
155 │    * Tracks options for the `NgForm` instance.
156 │    *
157 ▶    * **updateOn**: Sets the default `updateOn` value for all child `NgModels` below it
158 ▶    * unless explicitly set by a child `NgModel` using `ngModelOptions`). Defaults to 'change'.
159 ▶    * Possible values: `'change'` | `'blur'` | `'submit'`.
160 │    *
161 │    */
162 ▶   @Input('ngFormOptions') options!: {updateOn?: FormHooks};
163 │ 
```

📄 `angular/packages/forms/src/directives/ng_form.ts` L186–211 （▶ の行: 189, 191, 197, 199, 205–206, 208–209）

```ts
186 │ 
187 │   /**
188 │    * @description
189 ▶    * The directive instance.
190 │    */
191 ▶   override get formDirective(): Form {
192 │     return this;
193 │   }
194 │ 
195 │   /**
196 │    * @description
197 ▶    * The internal `FormGroup` instance.
198 │    */
199 ▶   override get control(): FormGroup {
200 │     return this.form;
201 │   }
202 │ 
203 │   /**
204 │    * @description
205 ▶    * Returns an array representing the path to this group. Because this directive
206 ▶    * always lives at the top level of a form, it is always an empty array.
207 │    */
208 ▶   override get path(): string[] {
209 ▶     return [];
210 │   }
211 │ 
```

📄 `angular/packages/forms/src/directives/ng_form.ts` L212–226 （▶ の行: 214, 216–217, 222–223）

```ts
212 │   /**
213 │    * @description
214 ▶    * Returns a map of the controls in this group.
215 │    */
216 ▶   get controls(): {[key: string]: AbstractControl} {
217 ▶     return this.form.controls;
218 │   }
219 │ 
220 │   /**
221 │    * @description
222 ▶    * Method that sets up the control directive in this group, re-calculates its value
223 ▶    * and validity, and adds the instance to the internal list of directives.
224 │    *
225 │    * @param dir The `NgModel` directive instance.
226 │    */
```

157〜159 行目は「`updateOn` は、子の `NgModel` が `ngModelOptions` で変えない限り、下のすべての `NgModel` の既定になる」（158 行目の閉じ括弧 `)` は開き括弧が無いまま）。この値を `FormGroup` に入れるのは `ngAfterViewInit` の `_setUpdateStrategy` です（[ngModel の章](../forms/13-forms-ng-model.md)の引用、363〜367 行目）。子の `NgModel` の登録はそのあとの microtask で走るので、登録のときにはもう `blur` が入っています。デモの `two`（`[ngModelOptions]="{updateOn: 'change'}"`）は `change`、`one` は `blur` でした。189〜210 行目の 3 つの getter と 216〜218 行目の `controls` は `this`・`this.form`・`[]`・`this.form.controls` を返すだけです。206 行目の「it is always an empty array」は、[第 7 回](07-fmd-reactive-dirs.md)の `AbstractFormDirective` の同じ文（is が抜けている）の正しい形です。

📄 `angular/packages/forms/src/directives/ng_form.ts` L264–272 （▶ の行: 267, 270–271）

```ts
264 │ 
265 │   /**
266 │    * @description
267 ▶    * Adds a new `NgModelGroup` directive instance to the form.
268 │    *
269 │    * @param dir The `NgModelGroup` directive instance.
270 ▶    */
271 ▶   addFormGroup(dir: NgModelGroup): void {
272 │     resolvedPromise.then(() => {
```

📄 `angular/packages/forms/src/directives/ng_form.ts` L293–315 （▶ の行: 300–301, 305, 310–313）

```ts
293 │ 
294 │   /**
295 │    * @description
296 │    * Retrieves the `FormGroup` for a provided `NgModelGroup` directive instance
297 │    *
298 │    * @param dir The `NgModelGroup` directive instance.
299 │    */
300 ▶   getFormGroup(dir: NgModelGroup): FormGroup {
301 ▶     return <FormGroup>this.form.get(dir.path);
302 │   }
303 │ 
304 │   /**
305 ▶    * Sets the new value for the provided `NgControl` directive.
306 │    *
307 │    * @param dir The `NgControl` directive instance.
308 │    * @param value The new value for the directive's control.
309 │    */
310 ▶   updateModel(dir: NgControl, value: any): void {
311 ▶     resolvedPromise.then(() => {
312 ▶       const ctrl = <FormControl>this.form.get(dir.path!);
313 ▶       ctrl.setValue(value);
314 │     });
315 │   }
```

📄 `angular/packages/forms/src/directives/ng_form.ts` L316–333 （▶ の行: 319, 323–324, 329–330）

```ts
316 │ 
317 │   /**
318 │    * @description
319 ▶    * Sets the value for this `FormGroup`.
320 │    *
321 │    * @param value The new value
322 │    */
323 ▶   setValue(value: {[key: string]: any}): void {
324 ▶     this.control.setValue(value);
325 │   }
326 │ 
327 │   /**
328 │    * @description
329 ▶    * Method called when the "submit" event is triggered on the form.
330 ▶    * Triggers the `ngSubmit` emitter to emit the "submit" event as its payload.
331 │    *
332 │    * @param $event The "submit" event object
333 │    */
```

271 行目の `addFormGroup` も、311 行目の `updateModel` も、中身を `resolvedPromise.then` の中で走らせます。`updateModel` は `[ngModel]` の値が変わったとき（`NgModel` の側の `_updateValue`）とは別に、`Form` インターフェースの口として残っているもので、312 行目で `dir.path` の control を探して 313 行目で `setValue` します。323〜325 行目の `setValue` は `control.setValue` に渡すだけです。329〜330 行目の `onSubmit` の説明は 3 節で確かめます。

## 2. NgModel の説明文

📄 `angular/packages/forms/src/directives/ng_model.ts` L81–110 （▶ の行: 83–84, 86–89, 94–98, 100–104）

```ts
 81 │ /**
 82 │  * @description
 83 ▶  * Creates a `FormControl` instance from a [domain
 84 ▶  * model](https://en.wikipedia.org/wiki/Domain_model) and binds it to a form control element.
 85 │  *
 86 ▶  * The `FormControl` instance tracks the value, user interaction, and
 87 ▶  * validation status of the control and keeps the view synced with the model. If used
 88 ▶  * within a parent form, the directive also registers itself with the form as a child
 89 ▶  * control.
 90 │  *
 91 │  * This directive is used by itself or as part of a larger form. Use the
 92 │  * `ngModel` selector to activate it.
 93 │  *
 94 ▶  * It accepts a domain model as an optional `Input`. If you have a one-way binding
 95 ▶  * to `ngModel` with `[]` syntax, changing the domain model's value in the component
 96 ▶  * class sets the value in the view. If you have a two-way binding with `[()]` syntax
 97 ▶  * (also known as 'banana-in-a-box syntax'), the value in the UI always syncs back to
 98 ▶  * the domain model in your class.
 99 │  *
100 ▶  * To inspect the properties of the associated `FormControl` (like the validity state),
101 ▶  * export the directive into a local template variable using `ngModel` as the key (ex:
102 ▶  * `#myVar="ngModel"`). You can then access the control using the directive's `field` property.
103 ▶  * However, the most commonly used properties (like `valid` and `dirty`) also exist on the control
104 ▶  * for direct access. See a full list of properties directly available in
105 │  * `AbstractControlDirective`.
106 │  *
107 │  * @see {@link RadioControlValueAccessor}
108 │  * @see {@link SelectControlValueAccessor}
109 │  *
110 │  * @usageNotes
```

83〜84 行目は「ドメインモデルから `FormControl` を作って要素に結ぶ」、86〜89 行目は「親の form があれば子として登録する」、94〜98 行目は「`[]` の片方向なら model → view、`[()]` の双方向なら UI の値がいつも model に戻る」です。100〜102 行目は「`#myVar="ngModel"` で取り出すと、ディレクティブの **`field` プロパティ**で control にアクセスできる」と書きますが、`NgModel` に `field` はありません。control は `control` プロパティ（[ngModel の章](../forms/13-forms-ng-model.md)の引用、173 行目 `public override readonly control: FormControl = new FormControl()`）です。デモで `'field' in m` は `false`、`m.control instanceof FormControl` は `true`、`{{ myVar.field?.valid }}` と書いたテンプレートは `strictTemplates` の `ngc` で `TS2339: Property 'field' does not exist on type 'NgModel'.` でした。

> [!NOTE]
> **ポイント**
>
> この 1 語は、もとは `control` でした。2fdd4da2a86（2025-10-06、`refactor(forms): rename the control directive to the field directive (#64300)`）は Signal Forms の `[control]` ディレクティブを `[field]` に改名したコミットで、20 個のファイルのうち、このファイルだけは doc の 1 行（``- … the directive's `control` property.`` → ``+ … the directive's `field` property.``）が書き換わりました。Signal Forms と関係の無い `NgModel` の説明文まで、置き換えが届いた形です。origin/main（d201dd76ef2、2026-11-19）の 102 行目でも `field` のままです。

103〜104 行目の「よく使うプロパティ（`valid`・`dirty`）は control に**も**直接ある」も、意味は「ディレクティブにも」です（105 行目の `AbstractControlDirective` の一覧を見よ、と続くので）。

📄 `angular/packages/forms/src/directives/ng_model.ts` L111–135 （▶ の行: 112, 116, 118–119, 121–123, 126–128, 134）

```ts
111 │  *
112 ▶  * ### Using ngModel on a standalone control
113 │  *
114 │  * The following examples show a simple standalone control using `ngModel`:
115 │  *
116 ▶  * {@example forms/ts/simpleNgModel/simple_ng_model_example.ts region='Component'}
117 │  *
118 ▶  * When using the `ngModel` within `<form>` tags, you'll also need to supply a `name` attribute
119 ▶  * so that the control can be registered with the parent form under that name.
120 │  *
121 ▶  * In the context of a parent form, it's often unnecessary to include one-way or two-way binding,
122 ▶  * as the parent form syncs the value for you. You access its properties by exporting it into a
123 ▶  * local template variable using `ngForm` such as (`#f="ngForm"`). Use the variable where
124 │  * needed on form submission.
125 │  *
126 ▶  * If you do need to populate initial values into your form, using a one-way binding for
127 ▶  * `ngModel` tends to be sufficient as long as you use the exported form's value rather
128 ▶  * than the domain model's value on submit.
129 │  *
130 │  * ### Using ngModel within a form
131 │  *
132 │  * The following example shows controls using `ngModel` within a form:
133 │  *
134 ▶  * {@example forms/ts/simpleForm/simple_form_example.ts region='Component'}
135 │  *
```

📄 `angular/packages/forms/src/directives/ng_model.ts` L136–165 （▶ の行: 138–139, 143–144, 146, 151–153, 157, 160）

````ts
136 │  * ### Using a standalone ngModel within a group
137 │  *
138 ▶  * The following example shows you how to use a standalone ngModel control
139 ▶  * within a form. This controls the display of the form, but doesn't contain form data.
140 │  *
141 │  * ```html
142 │  * <form>
143 ▶  *   <input name="login" ngModel placeholder="Login">
144 ▶  *   <input type="checkbox" ngModel [ngModelOptions]="{standalone: true}"> Show more options?
145 │  * </form>
146 ▶  * <!-- form value: {login: ''} -->
147 │  * ```
148 │  *
149 │  * ### Setting the ngModel `name` attribute through options
150 │  *
151 ▶  * The following example shows you an alternate way to set the name attribute. Here,
152 ▶  * an attribute identified as name is used within a custom form control component. To still be able
153 ▶  * to specify the NgModel's name, you must specify it using the `ngModelOptions` input instead.
154 │  *
155 │  * ```html
156 │  * <form>
157 ▶  *   <my-custom-form-control name="Nancy" ngModel [ngModelOptions]="{name: 'user'}">
158 │  *   </my-custom-form-control>
159 │  * </form>
160 ▶  * <!-- form value: {user: ''} -->
161 │  * ```
162 │  *
163 │  * @ngModule FormsModule
164 │  * @publicApi
165 │  */
````

118〜119 行目は「`<form>` の中では、その名前で登録するために `name` 属性が要る」（無いときの例外は[第 5 回](05-fmd-errors.md)）。121〜128 行目は「form の中では片方向・双方向の束縛は要らないことが多く、送信のときは `#f="ngForm"` の値を使え」です。141〜147 行目の例はデモでそのまま `{"login":""}` になり、`standalone: true` の checkbox は form の値に入りませんでした（146 行目のコメントどおり）。151〜160 行目の例は「カスタムの部品が `name` という input を持つなら、`ngModelOptions` の `name` で登録名を決める」です。`name` の input を持つ CVA（記録の場所の部品）に置くと、form の値は `{"user":""}`（160 行目のとおり）、部品の `name` input は `'Nancy'` のまま、`writeValue` には `null` と `''` が来ました。`''` になるのは、`ngModel` を値なしの属性で書くと入力 `model` に空文字が入るからです（[ngModel の章](../forms/13-forms-ng-model.md)の 3 節の `isPropertyUpdated`）。

📄 `angular/packages/forms/src/directives/ng_model.ts` L187–194 （▶ の行: 187, 193）

```ts
187 ▶   private _ngModelInjector?: Injector;
188 │ 
189 │   /**
190 │    * Internal reference to the view model value.
191 │    * @docs-private
192 │    */
193 ▶   viewModel: any;
194 │ 
```

📄 `angular/packages/forms/src/directives/ng_model.ts` L314–340 （▶ の行: 319–320, 327–328, 332, 334–335, 337–338）

```ts
314 │ 
315 │   /**
316 │    * Internal control directive creation lifecycle hook.
317 │    * @internal
318 │    */
319 ▶   ɵngControlCreate(host: ControlDirectiveHost): void {
320 ▶     super.ngControlCreate(host);
321 │   }
322 │ 
323 │   /**
324 │    * Internal control directive update lifecycle hook.
325 │    * @internal
326 │    */
327 ▶   ɵngControlUpdate(host: ControlDirectiveHost): void {
328 ▶     super.ngControlUpdate(host, false);
329 │   }
330 │ 
331 │   /**
332 ▶    * Template-driven forms handle `required` via the `RequiredValidator` directive.
333 │    *
334 ▶    * This directive has a `required` input and a host binding to `[attr.required]`. It defines the
335 ▶    * source of truth for required-ness, so disable the normal control binding for it.
336 │    */
337 ▶   protected override get shouldBindRequired() {
338 ▶     return false;
339 │   }
340 │ 
```

187 行目の `_ngModelInjector` は、開発モードでだけ「子のコンポーネントの `ngModel` が親の form に入らない」警告（[第 5 回](05-fmd-errors.md)）を出すために覚えておく注入器です。193 行目の `viewModel` は「前回の model の値」です。319〜329 行目の 2 つは、[第 6 回](06-fmd-ng-control.md)の FVC の道への入口です。332〜338 行目は「テンプレート駆動のフォームは `required` を `RequiredValidator` ディレクティブ（`required` の input と `[attr.required]` の host 束縛）が持つので、`required` を FVC に書かない」で、`shouldBindRequired` を `false` にします。main の f9cf82642ca で、要素の `RequiredValidator` があるときは `NgControl` の側が FVC の `required` だけを書き分ける形に変わり、この上書きは消えました。

## 3. 例のアプリと、値が入る時点

📄 `angular/packages/examples/forms/ts/simpleForm/simple_form_example.ts` L14–35 （▶ の行: 17–19, 23, 25, 32–33）

```ts
14 │ @Component({
15 │   selector: 'example-app',
16 │   template: `
17 ▶     <form #f="ngForm" (ngSubmit)="onSubmit(f)" novalidate>
18 ▶       <input name="first" ngModel required #first="ngModel" />
19 ▶       <input name="last" ngModel />
20 │       <button>Submit</button>
21 │     </form>
22 │ 
23 ▶     <p>First name value: {{ first.value }}</p>
24 │     <p>First name valid: {{ first.valid }}</p>
25 ▶     <p>Form value: {{ f.value | json }}</p>
26 │     <p>Form valid: {{ f.valid }}</p>
27 │   `,
28 │   standalone: false,
29 │ })
30 │ export class SimpleFormComp {
31 │   onSubmit(f: NgForm) {
32 ▶     console.log(f.value); // { first: '', last: '' }
33 ▶     console.log(f.valid); // false
34 │   }
35 │ }
```

📄 `angular/packages/examples/forms/ts/simpleNgModel/simple_ng_model_example.ts` L12–30 （▶ の行: 15, 17–18, 25, 28）

```ts
12 │ @Component({
13 │   selector: 'example-app',
14 │   template: `
15 ▶     <input [(ngModel)]="name" #ctrl="ngModel" required />
16 │ 
17 ▶     <p>Value: {{ name }}</p>
18 ▶     <p>Valid: {{ ctrl.valid }}</p>
19 │ 
20 │     <button (click)="setValue()">Set value</button>
21 │   `,
22 │   standalone: false,
23 │ })
24 │ export class SimpleNgModelComp {
25 ▶   name: string = '';
26 │ 
27 │   setValue() {
28 ▶     this.name = 'Nancy';
29 │   }
30 │ }
```

📄 `angular/packages/examples/forms/ts/ngModelGroup/ng_model_group_example.ts` L14–46 （▶ の行: 18, 21–24, 27, 36, 39–40, 44）

```ts
14 │ @Component({
15 │   selector: 'example-app',
16 │   template: `
17 │     <form #f="ngForm" (ngSubmit)="onSubmit(f)">
18 ▶       @if (nameCtrl.invalid) {
19 │         <p>Name is invalid.</p>
20 │       }
21 ▶       <div ngModelGroup="name" #nameCtrl="ngModelGroup">
22 ▶         <input name="first" [ngModel]="name.first" minlength="2" />
23 ▶         <input name="middle" [ngModel]="name.middle" maxlength="2" />
24 ▶         <input name="last" [ngModel]="name.last" required />
25 │       </div>
26 │ 
27 ▶       <input name="email" ngModel />
28 │       <button>Submit</button>
29 │     </form>
30 │ 
31 │     <button (click)="setValue()">Set value</button>
32 │   `,
33 │   standalone: false,
34 │ })
35 │ export class NgModelGroupComp {
36 ▶   name = {first: 'Nancy', middle: 'J', last: 'Drew'};
37 │ 
38 │   onSubmit(f: NgForm) {
39 ▶     console.log(f.value); // {name: {first: 'Nancy', middle: 'J', last: 'Drew'}, email: ''}
40 ▶     console.log(f.valid); // true
41 │   }
42 │ 
43 │   setValue() {
44 ▶     this.name = {first: 'Bess', middle: 'S', last: 'Marvin'};
45 │   }
46 │ }
```

3 つの例のコメントは、どれも本物と同じでした。simpleForm の Submit は 32〜33 行目のとおり `{"first":"","last":""}` と `false`（`first` が `required` で空）、ngModelGroup の Submit は 39〜40 行目のとおり `{"name":{"first":"Nancy","middle":"J","last":"Drew"},"email":""}` と `true` です。3 つのファイルは `strict` と `strictTemplates` の `ngc` にそのまま通りました。

値が入る時点は、デモの最初の表のとおりです。simpleForm を作った直後（最初の `detectChanges()` の同じ処理の中）の `f.value` は `{}` で `controls` は 0 個、`await Promise.resolve()` を 1 回はさむと `{"first":"","last":""}` になりました。simpleNgModel の Set value（28 行目 `this.name = 'Nancy'`）も、click と `detectChanges()` のすぐあとの input は `''` で、microtask のあとに `'Nancy'` です。逆向きの「input に打つ → コンポーネントの `name`」は同じ処理の中で入りました（`ngModelChange` はすぐ出る）。`NgForm.addControl` と `NgModel._updateValue` がどちらも `resolvedPromise.then` の中で動くためで、理由は[ngModel の章](../forms/13-forms-ng-model.md)の 4 節の「1 回の変更検知の中で、親のテンプレートの値を書き換えない」です。

1. **同期：ngOnChanges**

   `NgModel` が自分の `FormControl` を持ったまま、親の `NgForm.addControl` を呼びます。`addControl` は `resolvedPromise.then` に積むだけなので、この時点の `f.value` は `{}` です。
2. **同期：ngAfterViewInit**

   `NgForm` が `ngFormOptions` の `updateOn` を自分の `FormGroup` に入れます。
3. **microtask：登録**

   積んだ処理が走り、`registerControl` で control が form に入り、`setUpControl` で accessor とつながります。ここで `f.value` に `{"first":"","last":""}` が入ります。
4. **microtask：model の値**

   `[ngModel]` の値が変わったときも、`_updateValue` が `resolvedPromise.then` の中で `setValue` し、そこで input に書きます。

> [!WARNING]
> **ハマりどころ**
>
> reset の説明文（`NgForm.resetForm` の「初期の値に戻し、submitted も戻す」、[ngModel の章](../forms/13-forms-ng-model.md)の引用、354 行目）は、テンプレート駆動では初期の値に戻りません。デモでは `first` に `'Nancy'` を入れてから reset イベントを送ると、`f.value` は `{"first":null,"last":null}` で、作った直後の `''` ではありませんでした。`NgModel` の control は `new FormControl()`（既定値 `null`）なので、`reset()` は `null` にするからです。spec も template\_integration\_spec.ts の 1252 行目 `should reset the form to empty when reset event is fired` で、`null` になることを固めています。同じ文は `AbstractFormDirective.resetForm`（[第 7 回](07-fmd-reactive-dirs.md)のデモの nestedFormGroup の reset で、`'Nancy'` ではなく `null`）にもあります。

## 4. NgModelGroup の説明文

📄 `angular/packages/forms/src/directives/ng_model_group.ts` L30–60 （▶ の行: 31–32, 37, 39, 41–43, 45–47, 56）

```ts
30 │ export const modelGroupProvider: any = {
31 ▶   provide: ControlContainer,
32 ▶   useExisting: forwardRef(() => NgModelGroup),
33 │ };
34 │ 
35 │ /**
36 │  * @description
37 ▶  * Creates and binds a `FormGroup` instance to a DOM element.
38 │  *
39 ▶  * This directive can only be used as a child of `NgForm` (within `<form>` tags).
40 │  *
41 ▶  * Use this directive to validate a sub-group of your form separately from the
42 ▶  * rest of your form, or if some values in your domain model make more sense
43 ▶  * to consume together in a nested object.
44 │  *
45 ▶  * Provide a name for the sub-group and it will become the key
46 ▶  * for the sub-group in the form's full value. If you need direct access, export the directive into
47 ▶  * a local template variable using `ngModelGroup` (ex: `#myGroup="ngModelGroup"`).
48 │  *
49 │  * @usageNotes
50 │  *
51 │  * ### Consuming controls in a grouping
52 │  *
53 │  * The following example shows you how to combine controls together in a sub-group
54 │  * of the form.
55 │  *
56 ▶  * {@example forms/ts/ngModelGroup/ng_model_group_example.ts region='Component'}
57 │  *
58 │  * @ngModule FormsModule
59 │  * @publicApi
60 │  */
```

39 行目は「`NgForm` の子として（`<form>` タグの中で）だけ使える」です。実装の親の検査（[ngModel の章](../forms/13-forms-ng-model.md)の引用、90〜98 行目）は「親が `NgModelGroup` か `NgForm`」で、デモの `<div ngForm>` の中の `ngModelGroup="outer"` の中の `ngModelGroup="inner"` は、例外なく値 `'入れ子'` が入りました。`<form>` タグでなくても `[ngForm]` や `ng-form` の下でよく、`NgModelGroup` の下にも置けます。45〜47 行目は「名前がフォームの値の中のキーになる。`#myGroup="ngModelGroup"` で取り出せる」で、ngModelGroup の例の 21 行目が `#nameCtrl="ngModelGroup"` の形で使っています。

## 5. 動かして確かめる

> **🧪 DEMO — 例と説明文の中の例を本物で動かし、値が入る時点を読む**
>
> ボタンを押すと、3 節の 3 つの例（テンプレートはそのまま、`console.log` だけ記録に替えたもの）と、1〜4 節の説明文の中の例を、文書に付けない div の上に作ります。「同期」は最初の `detectChanges()` のすぐあと、「microtask のあと」は `await Promise.resolve()` を 1 回はさんだあと、「macrotask のあと」は `setTimeout(0)` を待ってもう一度 `detectChanges()` したあとです。このページの URL・履歴・入力欄は変わりません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-template-dirs)

同じデモのファイルを Node（domino の上の JIT）で開発モードと本番の両方で走らせると、結果は完全に同じでした。`updateOn` の表の `alone`（form の外の `[ngModelOptions]="{updateOn: 'submit'}"`）は、送信する form が無いので、`blur` しても値が入りません。ng\_model.ts の 226〜227 行目の `updateOn` の説明（[ngModel の章](../forms/13-forms-ng-model.md)の引用）は `'submit'` も選べると書くだけで、form の外では値が入らないことには触れていません。

## ここまでの呼び出し

- 👤 `<input name="first" ngModel>` — 利用者のテンプレート
  - `NgModel.ngOnChanges` → `_setUpControl` → `formDirective.addControl(this)` — ng\_model.ts 264–313 — *同期*
    - `resolvedPromise.then(() => registerControl …)` — ng\_form.ts 227–237 — *microtask*
  - `_updateValue(model)` → `resolvedPromise.then(() => control.setValue …)` — ng\_model.ts — *microtask*
- `NgForm.ngAfterViewInit` → `_setUpdateStrategy` — ng\_form.ts 363–367 — *ngFormOptions の updateOn*
- 👤 `reset` イベント → `onReset` → `resetForm()` → `form.reset()` — ng\_form.ts 348–361 — *null に戻る*

## テストと直し方

### spec と it

| 説明文の約束 | spec（packages/forms/test/template\_integration\_spec.ts） |
| --- | --- |
| 104〜109 行目 novalidate と ngNativeValidate | `describe('basic functionality')`（57 行目）› 109 `should add novalidate by default to form element`・118 `should be possible to use native validation and angular forms`・331 `should not create a template-driven form when ngNoForm is used`・337 `should not add novalidate when ngNoForm is used` |
| 141〜147・151〜160 行目 standalone と name | `describe('name and ngModelOptions')`（460 行目）› 473 `should not register standalone ngModels with parent form`・486 `should override name attribute with ngModelOptions name if provided` |
| 157〜159 行目 ngFormOptions の updateOn | `describe('updateOn')`（497 行目）› `describe('ngFormOptions')`（1102 行目） |
| submitted と reset | `describe('submit and reset events')`（1225 行目）› 1238 `should mark NgForm as submitted on submit event`・1252 `should reset the form to empty when reset event is fired`・1273 `should reset the form submit state when reset button is clicked` |
| NgModelGroup | 127 `should support ngModelGroup`。`[ngForm]` の要素や `NgModelGroup` の入れ子の下の it は 296 `should set status classes involving nested FormGroups` などのクラスの it に限られる |
| 100〜102 行目 `field` | 説明文の言い方を確かめる spec は無い |

### 手元で走らせた結果

../angular で `pnpm bazel test //packages/forms/test:test --nocache_test_results --test_output=all` は `1153 specs, 0 failures` でした（2026-11-21）。`describe` ごとの件数は[第 10 回](10-fmd-tests-issues.md)の表にあります。

### 直すとしたら

- ng\_model.ts の 102 行目の `field` を `control` に戻します（2fdd4da2a86 の前の文）。103 行目の「on the control」も「on the directive」にすると、105 行目とつながります。
- ng\_form.ts の 106 行目を `FormsModule` / `ReactiveFormsModule` に、158 行目の閉じ括弧を消します。
- `resetForm` の説明文（ng\_form.ts の 354 行目と abstract\_form.directive.ts の 296 行目）を「`FormGroup.reset(value)` を呼ぶ。値を渡さなければ各 control の既定値（`nonNullable` でなければ `null`）」のように書くと、1252 行目の spec と合います。
- ng\_model\_group.ts の 39 行目を「`NgForm` か `NgModelGroup` の子として」にします。

## 聞かれそうな質問

**Q. テンプレート駆動のフォームで、ngAfterViewInit の中で f.value を読むと空なのはなぜですか？**

子の `NgModel` の登録が `resolvedPromise.then` の中、つまり 1 回の microtask のあとだからです。デモでも同期の時点は `{}`、microtask のあとに値が入りました（3 節）。

**Q. #m="ngModel" の m.field で FormControl を取れますか？**

取れません。`NgModel` に `field` は無く、`m.control` です。説明文の 102 行目は、Signal Forms の改名のコミットで `control` が `field` に置き換わったものです（2 節）。

**Q. form の reset イベントで、ngModel の値は最初の値に戻りますか？**

戻りません。`null` になります。`NgModel` の control は既定値の無い `new FormControl()` だからで、spec もそれを固めています（3 節）。

**Q. ngModelGroup は &lt;form&gt; の中でしか使えませんか？**

`[ngForm]` の要素の下でも、別の `ngModelGroup` の下でも使えます。親の検査は `NgModelGroup` か `NgForm` かだけです（4 節）。

**Q. \[formGroup\] の form にも novalidate は付きますか？**

付きます。付けるのは `ɵNgNoValidate` で、セレクターは `ngNoForm` と `ngNativeValidate` だけを除きます（1 節）。

## 読み終えて

- 3 つの例と説明文の中の 2 つの例は、コメントどおりの値になる。
- テンプレート駆動のフォームの値は、作った直後の同じ処理の中では空で、1 回の microtask のあとに入る。
- `NgModel` の説明文の `field` は、Signal Forms の改名のコミットが紛れ込ませた誤りで、正しくは `control`。
- reset は「初期の値」ではなく `null` に戻す。`NgModelGroup` は `<form>` の外の `[ngForm]` の下でも、入れ子でも使える。

---

← 前: [リアクティブフォームのディレクティブの説明文](07-fmd-reactive-dirs.md)  
次: [値のアクセサーの説明文：select・radio・既定のアクセサー](09-fmd-accessors.md) →
