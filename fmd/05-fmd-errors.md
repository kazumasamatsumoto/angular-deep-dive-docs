[目次](../README.md) › [Forms の説明文の読み残し](README.md) › 第 5 回 / 全 10 回

# エラーの文言と小道具：reactive\_errors・template\_driven\_errors・shared

> directives/reactive\_errors.ts・template\_driven\_errors.ts・error\_examples.ts・errors.ts・shared.ts・util.ts の未読の行：例外と警告の文と例、番号の正と負、shared.ts のトークンと小道具。わざと誤った使い方をして開発モードの本物の文を記録し、本番で何が残るかと並べる。

angular/angular · 読了 約 11 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-errors)

---

forms の例外と警告の文は、使っている所から離れた 4 つのファイル（`reactive_errors.ts`・`template_driven_errors.ts`・`error_examples.ts`・`errors.ts`）に集まっています。この章は、その文と、文に埋め込まれる例のテンプレート、番号の一覧を読み、わざと誤った使い方をして開発モードの本物の文を記録します。同じ誤りを本番（`ngDevMode` が `false`）で動かすと何が残るかも並べます。最後に `shared.ts` と `util.ts` の小道具を読みます。

読む対象は `packages/forms/src/directives/reactive_errors.ts`・`template_driven_errors.ts`・`error_examples.ts`・`shared.ts`、`packages/forms/src/errors.ts`・`util.ts`（../angular、8576f161ae4）です。例外を投げる側（ディレクティブの親の確かめ方）は[リアクティブのディレクティブの章](../forms/12-forms-reactive-directives.md)の 9 節と[NgModel の章](../forms/13-forms-ng-model.md)、`RuntimeError` が番号から文を作る `formatRuntimeError` は[コードの書き方の章](../contrib/13-contrib-coding-standards.md)が引いています。

1. [1. AbstractControl](01-fmd-abstract-model.md)
2. [2. FormGroup・FormRecord・FormArray](02-fmd-group-array.md)
3. [3. FormControl と FormBuilder](03-fmd-control-builder.md)
4. [4. Validators](04-fmd-validators.md)
5. **5. エラーの文言と小道具**（この章）
6. [6. NgControl](06-fmd-ng-control.md)
7. [7. リアクティブのディレクティブ](07-fmd-reactive-dirs.md)
8. [8. テンプレート駆動のディレクティブ](08-fmd-template-dirs.md)
9. [9. 値のアクセサー](09-fmd-accessors.md)
10. [10. spec と issue](10-fmd-tests-issues.md)

## 1. 番号の一覧：正と負

📄 `angular/packages/forms/src/errors.ts` L9–41 （▶ の行: 11, 15–17, 22, 27, 33, 40）

```ts
 9 │ /**
10 │  * The list of error codes used in runtime code of the `forms` package.
11 ▶  * Reserved error code range: 1000-1999.
12 │  */
13 │ export const enum RuntimeErrorCode {
14 │   // Structure validation errors (10xx)
15 ▶   NO_CONTROLS = 1000,
16 ▶   MISSING_CONTROL = 1001,
17 ▶   MISSING_CONTROL_VALUE = -1002,
18 │ 
19 │   // Reactive Forms errors (1050-1099)
20 │   FORM_CONTROL_NAME_MISSING_PARENT = 1050,
21 │   FORM_CONTROL_NAME_INSIDE_MODEL_GROUP = 1051,
22 ▶   FORM_GROUP_MISSING_INSTANCE = 1052,
23 │   FORM_GROUP_NAME_MISSING_PARENT = 1053,
24 │   FORM_ARRAY_NAME_MISSING_PARENT = 1054,
25 │ 
26 │   // Validators errors (11xx)
27 ▶   WRONG_VALIDATOR_RETURN_TYPE = -1101,
28 │ 
29 │   // Value Accessor Errors (12xx)
30 │   NG_VALUE_ACCESSOR_NOT_PROVIDED = 1200,
31 │   COMPAREWITH_NOT_A_FN = 1201,
32 │   NAME_AND_FORM_CONTROL_NAME_MUST_MATCH = 1202,
33 ▶   NG_MISSING_VALUE_ACCESSOR = -1203,
34 │ 
35 │   // Template-driven Forms errors (1350-1399)
36 │   NGMODEL_IN_FORM_GROUP = 1350,
37 │   NGMODEL_IN_FORM_GROUP_NAME = 1351,
38 │   NGMODEL_WITHOUT_NAME = 1352,
39 │   NGMODELGROUP_IN_FORM_GROUP = 1353,
40 ▶   NGMODEL_IN_CHILD_COMPONENT = -1354,
41 │ }
```

番号の前に `NG0` を付けたものが文の頭になり、`1000` は `NG01000` です。負の番号（17・27・33・40 行目）は「解説のページがある」印で、開発モードでは文の後ろに `Find more at https://…angular.dev/errors/NG01002` が付きます（core の errors.ts の `formatRuntimeError` の `code < 0`、[コードの書き方の章](../contrib/13-contrib-coding-standards.md)）。記録の `NG01002`・`NG01101`・`NG01203`・`NG01354` がこの形で、正の番号の `NG01001`・`NG01050` などには付きません。

負の 4 つの解説のページは adev の `reference/errors/` に 4 つともありますが、一覧（`overview.md`）の表には `NG01354` だけが載っていません。開発モードの警告はリンク先を示すので直接は開けますが、一覧からはたどれません。origin/main でも同じです（main では `-1055` が増え、一覧にも載っています）。

## 2. reactive\_errors.ts：親が違う、form が無い

📄 `angular/packages/forms/src/directives/reactive_errors.ts` L43–69 （▶ の行: 46–48, 50, 54, 60–63, 67）

```ts
43 │ 
44 │ export function ngModelGroupException(): Error {
45 │   return new RuntimeError(
46 ▶     RuntimeErrorCode.FORM_CONTROL_NAME_INSIDE_MODEL_GROUP,
47 ▶     `formControlName cannot be used with an ngModelGroup parent. It is only compatible with parents
48 ▶       that also have a "form" prefix: formGroupName, formArrayName, or formGroup.
49 │ 
50 ▶       Option 1:  Update the parent to be formGroupName (reactive form strategy)
51 │ 
52 │       ${formGroupNameExample}
53 │ 
54 ▶       Option 2: Use ngModel instead of formControlName (template-driven strategy)
55 │ 
56 │       ${ngModelGroupExample}`,
57 │   );
58 │ }
59 │ 
60 ▶ export function missingFormException(): Error {
61 ▶   return new RuntimeError(
62 ▶     RuntimeErrorCode.FORM_GROUP_MISSING_INSTANCE,
63 ▶     `formGroup expects a FormGroup instance. Please pass one in.
64 │ 
65 │       Example:
66 │ 
67 ▶       ${formControlNameExample}`,
68 │   );
69 │ }
```

📄 `angular/packages/forms/src/directives/reactive_errors.ts` L70–94 （▶ の行: 73–74, 79, 85–86, 91）

```ts
70 │ 
71 │ export function groupParentException(): Error {
72 │   return new RuntimeError(
73 ▶     RuntimeErrorCode.FORM_GROUP_NAME_MISSING_PARENT,
74 ▶     `formGroupName must be used with a parent formGroup directive.  You'll want to add a formGroup
75 │     directive and pass it an existing FormGroup instance (you can create one in your class).
76 │ 
77 │     Example:
78 │ 
79 ▶     ${formGroupNameExample}`,
80 │   );
81 │ }
82 │ 
83 │ export function arrayParentException(): Error {
84 │   return new RuntimeError(
85 ▶     RuntimeErrorCode.FORM_ARRAY_NAME_MISSING_PARENT,
86 ▶     `formArrayName must be used with a parent formGroup directive.  You'll want to add a formGroup
87 │       directive and pass it an existing FormGroup instance (you can create one in your class).
88 │ 
89 │       Example:
90 │ 
91 ▶       ${formArrayNameExample}`,
92 │   );
93 │ }
94 │ 
```

文に入る例は 6 節の `error_examples.ts` の文字列で、47〜48 行目のように「どの親なら使えるか」を書いています。DEMO の記録で読むと、文と今の実装がずれている所が 3 つあります。

- 63 行目の `formGroup expects a FormGroup instance` は、`[formArray]` に `undefined` を渡したときも同じ文です（記録の `formArrayMissing`）。投げるのは 2 つの共通の親 `AbstractFormDirective` の `_checkFormPresent`（abstract\_form.directive.ts L381〜385）です。
- 74 行目「formGroupName は親に formGroup が要る」と 86 行目「formArrayName は親に formGroup が要る」は、`[formArray]` の親も受けます。親の確かめ方 `hasInvalidParent`（form\_group\_name.ts L233〜239）は `FormGroupName`・`AbstractFormDirective`（`[formGroup]` と `[formArray]`）・`FormArrayName` を通すので、記録の `groupNameInFormArray` は例外が出ません。
- L20〜32 の `controlParentException`（[リアクティブのディレクティブの章](../forms/12-forms-reactive-directives.md)が引用）だけは「formGroup or formArray」に直っています。b0dd8136643（2025-11-14、「docs: FormArrayDirective mentions」）がこの 1 つと form\_group\_name.ts の説明だけを直し、74・86・63 行目は残りました。

origin/main では 60〜69 行目の `missingFormException` が消え、同じ文を `abstract_form.directive.ts` の中に直に書いて、`ngDevMode` に関係なく例外にする形に変わりました（fc3dc890aad、2026-08-19、「don't crash when control is missing in setUpValidators」）。サイトの依存の 22.2.6 はこちらの形で、本番でも `NG01052` が出ます（記録の prod の列）。

## 3. 警告の文：async の検証関数、ngModel と一緒に

📄 `angular/packages/forms/src/directives/reactive_errors.ts` L111–127 （▶ の行: 113–114, 119, 122, 125）

```ts
111 │ 
112 │ export const asyncValidatorsDroppedWithOptsWarning = `
113 ▶   It looks like you're constructing using a FormControl with both an options argument and an
114 ▶   async validators argument. Mixing these arguments will cause your async validators to be dropped.
115 │   You should either put all your validators in the options object, or in separate validators
116 │   arguments. For example:
117 │ 
118 │   // Using validators arguments
119 ▶   fc = new FormControl(42, Validators.required, myAsyncValidator);
120 │ 
121 │   // Using AbstractControlOptions
122 ▶   fc = new FormControl(42, {validators: Validators.required, asyncValidators: myAV});
123 │ 
124 │   // Do NOT mix them: async validators will be dropped!
125 ▶   fc = new FormControl(42, {validators: Validators.required}, /* Oops! */ myAsyncValidator);
126 │ `;
127 │ 
```

この警告は `pickAsyncValidators`（abstract\_model.ts L206〜218、[非同期の検証の章](../forms/05-forms-async-validators.md)）が、2 つ目の引数が options の物で 3 つ目もあるときに出します。[第 3 回](03-fmd-control-builder.md)で読んだ `ɵFormControlCtor` の `@deprecated` のオーバーロードと同じ話を、型と実行時の 2 か所で知らせています。

📄 `angular/packages/forms/src/directives/reactive_errors.ts` L128–164 （▶ の行: 129, 133–135, 138–139, 145, 152–153, 158, 162）

```ts
128 │ export function ngModelWarning(directiveName: string): string {
129 ▶   const versionSubDomain = VERSION.major !== '0' ? `v${VERSION.major}.` : '';
130 │ 
131 │   return `
132 │   It looks like you're using ngModel on the same form field as ${directiveName}.
133 ▶   Support for using the ngModel input property and ngModelChange event with
134 ▶   reactive form directives has been deprecated in Angular v6 and will be removed
135 ▶   in a future version of Angular.
136 │ 
137 │   For more information on this, see our API docs here:
138 ▶   https://${versionSubDomain}angular.dev/api/forms/${
139 ▶     directiveName === 'formControl' ? 'FormControlDirective' : 'FormControlName'
140 │   }
141 │   `;
142 │ }
143 │ 
144 │ function describeKey(isFormGroup: boolean, key: string | number): string {
145 ▶   return isFormGroup ? `with name: '${key}'` : `at index: ${key}`;
146 │ }
147 │ 
148 │ export function noControlsError(isFormGroup: boolean): string {
149 │   return `
150 │     There are no form controls registered with this ${
151 │       isFormGroup ? 'group' : 'array'
152 ▶     } yet. If you're using ngModel,
153 ▶     you may want to check next tick (e.g. use setTimeout).
154 │   `;
155 │ }
156 │ 
157 │ export function missingControlError(isFormGroup: boolean, key: string | number): string {
158 ▶   return `Cannot find form control ${describeKey(isFormGroup, key)}`;
159 │ }
160 │ 
161 │ export function missingControlValueError(isFormGroup: boolean, key: string | number): string {
162 ▶   return `Must supply a value for form control ${describeKey(isFormGroup, key)}`;
163 │ }
164 │ 
```

129 行目は `VERSION.major` が `'0'` でなければ `v22.` のようなサブドメインを付けます。記録では `https://v22.angular.dev/api/forms/FormControlDirective` でした。133〜135 行目「v6 で非推奨、将来のバージョンで消す」は、v22 でもまだ消えていません。この警告は `_ngModelWarning`（6 節）で「型ごとに 1 回」に絞られます。152〜153 行目の `NG01000` は「まだ control が登録されていない」場合で、`ngModel` の登録が 1 拍遅れること（[NgModel の章](../forms/13-forms-ng-model.md)の 4 節）を見越した文です。

## 4. template\_driven\_errors.ts

📄 `angular/packages/forms/src/directives/template_driven_errors.ts` L39–55 （▶ の行: 44, 46, 50）

```ts
39 │ 
40 │ export function formGroupNameException(): Error {
41 │   return new RuntimeError(
42 │     RuntimeErrorCode.NGMODEL_IN_FORM_GROUP_NAME,
43 │     `
44 ▶     ngModel cannot be used to register form controls with a parent formGroupName or formArrayName directive.
45 │ 
46 ▶     Option 1: Use formControlName instead of ngModel (reactive strategy):
47 │ 
48 │     ${formGroupNameExample}
49 │ 
50 ▶     Option 2:  Update ngModel's parent be ngModelGroup (template-driven strategy):
51 │ 
52 │     ${ngModelGroupExample}`,
53 │   );
54 │ }
55 │ 
```

📄 `angular/packages/forms/src/directives/template_driven_errors.ts` L77–93 （▶ の行: 82, 84, 88）

```ts
77 │ 
78 │ export function modelGroupParentException(): Error {
79 │   return new RuntimeError(
80 │     RuntimeErrorCode.NGMODELGROUP_IN_FORM_GROUP,
81 │     `
82 ▶     ngModelGroup cannot be used with a parent formGroup directive.
83 │ 
84 ▶     Option 1: Use formGroupName instead of ngModelGroup (reactive strategy):
85 │ 
86 │     ${formGroupNameExample}
87 │ 
88 ▶     Option 2:  Use a regular form tag instead of the formGroup directive (template-driven strategy):
89 │ 
90 │     ${ngModelGroupExample}`,
91 │   );
92 │ }
93 │ 
```

50 行目と 88 行目は `Option 2:` の後ろに空白が 2 つあり、50 行目は「Update ngModel's parent **be** ngModelGroup」と `to` が抜けています。記録の文にもそのまま出ます。L23〜38 の `modelParentException`・L67〜76 の `missingNameException`・L56〜65 の子の部品の警告（`NG01354`）は[NgModel の章](../forms/13-forms-ng-model.md)が引いています。

## 5. 開発モードの文と、本番で残るもの

下の表の「開発モード（記録）」と「本番（記録）」の列は、同じデモのファイルを Node（domino の上の JIT）で走らせたものです。本番の列は `globalThis.ngDevMode = false` を置いてから `@angular/*` を読み込みました。「このページ」の列は、押すとこの本番ビルドのページの中で同じ場面を動かします（ErrorHandler は受け取った物を積むだけに替え、`console.warn` と `console.error` も動かしている間だけ積むだけに替える）。

> **🧪 DEMO — わざと誤った使い方をして、例外と警告の文を見る**
>
> 場面ごとに別のアプリ（`createApplication`）を作り、部品を文書に付けない div に bootstrap します。`ctrlNameInModelGroup` だけは記録のみです（本番では Promise の中で `TypeError` が投げられ、ErrorHandler に届かずに console に出るため）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-errors)

本番の列から分かることは 3 つです。

1. **文は消え、番号だけが残る**

   `RuntimeError` に渡す文が `ngDevMode && …` や `typeof ngDevMode === 'undefined' || ngDevMode ? … : ''` の後ろにあるので、`NG01052`・`NG01002` のように番号だけになります。`Find more at` も開発モードだけです。
2. **親の確かめが丸ごと消え、別の所で TypeError になる**

   `formControlName` を親なしで使うと、開発モードの `NG01050` の代わりに `TypeError: Cannot read properties of null (reading 'addControl')` です。確かめ（`checkParentType`）が `ngDevMode` の後ろにあり、そのまま `this.formDirective.addControl` に進むからです。`formGroupName`・`formArrayName`・`ngModelGroup`・値のアクセサーが無い場合も同じ形でした。`ngModelGroup` の下の `formControlName` は Promise の中で落ち、ErrorHandler にも届きません。
3. **警告は 1 つも出ない**

   `console.warn` を呼ぶ 6 か所はどれも `ngDevMode` の後ろです。`ngModel` に `name` が無い場面も、本番では例外にならず黙って通りました。

`ngModelInFormGroup` と `ngModelInGroupName` の本番の列の `NG01055` は、22.2.6 にある「名前に当たる control が form に無い」番号（main の `-1055`、63f4bd4c7eb、8576f161ae4 の errors.ts にはまだ無い）です。開発モードなら先に `NG01350`・`NG01351` が出る場面が、本番では `[formGroup]` の側の確かめで止まっています。

## 6. error\_examples.ts：文に入る例

📄 `angular/packages/forms/src/directives/error_examples.ts` L9–32 （▶ の行: 9–11, 16, 20, 22）

```ts
 9 ▶ export const formControlNameExample = `
10 ▶   <div [formGroup]="myGroup">
11 ▶     <input formControlName="firstName">
12 │   </div>
13 │ 
14 │   In your class:
15 │ 
16 ▶   this.myGroup = new FormGroup({
17 │       firstName: new FormControl()
18 │   });`;
19 │ 
20 ▶ export const formGroupNameExample = `
21 │   <div [formGroup]="myGroup">
22 ▶       <div formGroupName="person">
23 │         <input formControlName="firstName">
24 │       </div>
25 │   </div>
26 │ 
27 │   In your class:
28 │ 
29 │   this.myGroup = new FormGroup({
30 │       person: new FormGroup({ firstName: new FormControl() })
31 │   });`;
32 │ 
```

📄 `angular/packages/forms/src/directives/error_examples.ts` L33–61 （▶ の行: 33, 36–37, 44, 49, 52, 56, 59）

```ts
33 ▶ export const formArrayNameExample = `
34 │   <div [formGroup]="myGroup">
35 │     <div formArrayName="cities">
36 ▶       <div *ngFor="let city of cityArray.controls; index as i">
37 ▶         <input [formControlName]="i">
38 │       </div>
39 │     </div>
40 │   </div>
41 │ 
42 │   In your class:
43 │ 
44 ▶   this.cityArray = new FormArray([new FormControl('SF')]);
45 │   this.myGroup = new FormGroup({
46 │     cities: this.cityArray
47 │   });`;
48 │ 
49 ▶ export const ngModelGroupExample = `
50 │   <form>
51 │       <div ngModelGroup="person">
52 ▶         <input [(ngModel)]="person.name" name="firstName">
53 │       </div>
54 │   </form>`;
55 │ 
56 ▶ export const ngModelWithFormGroupExample = `
57 │   <div [formGroup]="myGroup">
58 │       <input formControlName="firstName">
59 ▶       <input [(ngModel)]="showMoreControls" [ngModelOptions]="{standalone: true}">
60 │   </div>
61 │ `;
```

例は 5 つの文字列で、7 つの例外の文に入ります。36 行目の `formArrayNameExample` は `*ngFor` を使っています。v22 のテンプレートの既定は `@for` で、`*ngFor` は `CommonModule`（か `NgFor`）を部品の `imports` に入れないと動きません。例をそのまま standalone の部品に貼ると、`*ngFor` の行は何も描きません。59 行目の `showMoreControls` と 52 行目の `person.name` は、どちらも説明のための名前で、例の中のどこでも宣言されていません。

## 7. shared.ts の小道具と util.ts

📄 `angular/packages/forms/src/directives/shared.ts` L35–63 （▶ の行: 38–39, 46, 48–49, 51, 57–58, 61, 63）

```ts
35 │ /**
36 │  * DI token that provides the ɵFormControlIntegration context for FVC/UI controls.
37 │  */
38 ▶ export const ɵFORM_CONTROL_INTEGRATION = new InjectionToken<ɵFormControlIntegration>(
39 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'FORM_CONTROL_INTEGRATION' : '',
40 │ );
41 │ 
42 │ /**
43 │  * Token to provide to allow SetDisabledState to always be called when a CVA is added, regardless of
44 │  * whether the control is disabled or enabled.
45 │  *
46 ▶  * @see {@link FormsModule#withconfig}
47 │  */
48 ▶ export const CALL_SET_DISABLED_STATE = new InjectionToken(
49 ▶   typeof ngDevMode === 'undefined' || ngDevMode ? 'CallSetDisabledState' : '',
50 │   {
51 ▶     factory: () => setDisabledStateDefault,
52 │   },
53 │ );
54 │ 
55 │ /**
56 │  * The type for CALL_SET_DISABLED_STATE. If `always`, then ControlValueAccessor will always call
57 ▶  * `setDisabledState` when attached, which is the most correct behavior. Otherwise, it will only be
58 ▶  * called when disabled, which is the legacy behavior for compatibility.
59 │  *
60 │  * @publicApi
61 ▶  * @see {@link FormsModule#withconfig}
62 │  */
63 ▶ export type SetDisabledStateOption = 'whenDisabledForLegacyCode' | 'always';
```

46 行目と 61 行目の `@see {@link FormsModule#withconfig}` は、メソッド名が `withConfig`（大文字の C）なので API のページのアンカーに届きません。origin/main では f825c9bc7cc（2026-09-16、「docs: fix API links that point at missing member anchors」）で `#withConfig` に直っています。39 行目と 49 行目は、`InjectionToken` の名前を開発モードのときだけ付ける形です（39 行目は `typeof ngDevMode !== 'undefined' && ngDevMode`、49 行目は `=== 'undefined' ||` で、書き方が 2 通りあります）。

📄 `angular/packages/forms/src/directives/shared.ts` L64–81 （▶ の行: 68–69, 71–72）

```ts
64 │ 
65 │ /**
66 │  * Whether to use the fixed setDisabledState behavior by default.
67 │  */
68 ▶ // g3-only export const setDisabledStateDefault: SetDisabledStateOption = 'whenDisabledForLegacyCode';
69 ▶ export const setDisabledStateDefault: SetDisabledStateOption = 'always'; // 3p-only
70 │ 
71 ▶ export function controlPath(name: string | null, parent: ControlContainer): string[] {
72 ▶   return [...parent.path!, name!];
73 │ }
74 │ 
75 │ /**
76 │  * Links a Form control and a Form directive by setting up callbacks (such as `onChange`) on both
77 │  * instances. This function is typically invoked when form directive is being initialized.
78 │  *
79 │  * @param control Form control instance that should be linked.
80 │  * @param dir Directive that should be linked with a given control.
81 │  */
```

68〜69 行目は Google の中（g3）と外で既定を切り替える印で、外では `'always'` です。`setDisabledState` をいつ呼ぶかは[setUpControl の章](../forms/10-forms-setup-control.md)の 4 節にあります。72 行目の `controlPath` は親の `path` に自分の名前を足すだけで、エラーの文の `path: 'a -> b'`（L348〜353 の `_describeControlLocation`）の元です。

📄 `angular/packages/forms/src/directives/shared.ts` L362–370 （▶ の行: 363, 366–368）

```ts
362 │ 
363 ▶ function _throwInvalidValueAccessorError(dir: AbstractControlDirective) {
364 │   const loc = _describeControlLocation(dir);
365 │   throw new RuntimeError(
366 ▶     RuntimeErrorCode.NG_VALUE_ACCESSOR_NOT_PROVIDED,
367 ▶     `Value accessor was not provided as an array for form control with ${loc}. ` +
368 ▶       `Check that the \`NG_VALUE_ACCESSOR\` token is configured as a \`multi: true\` provider.`,
369 │   );
370 │ }
```

`NG01200` は、自分で `NG_VALUE_ACCESSOR` を `multi: true` なしで provide したときの文です。呼ぶのは `selectValueAccessor` の `ngDevMode` の後ろ（L407〜408）だけです。

📄 `angular/packages/forms/src/directives/shared.ts` L437–442 （▶ の行: 438–440）

```ts
437 │ 
438 ▶ export function removeListItem<T>(list: T[], el: T): void {
439 ▶   const index = list.indexOf(el);
440 ▶   if (index > -1) list.splice(index, 1);
441 │ }
442 │ 
```

📄 `angular/packages/forms/src/util.ts` L9–12 （▶ の行: 9–11）

```ts
 9 ▶ export function removeListItem<T>(list: T[], el: T): void {
10 ▶   const index = list.indexOf(el);
11 ▶   if (index > -1) list.splice(index, 1);
12 │ }
```

同じ中身の `removeListItem` が 2 つあります。shared.ts の 438 行目の物は `abstract_form.directive.ts`（L214、ディレクティブの一覧から外す）が、util.ts の 9 行目の物は `form_control.ts`（L567・L576、`_onChange` と `_onDisabledChange` から外す）が import しています。どちらも `indexOf` で最初の 1 つだけを外します。

## ここまでの呼び出し

- 👤 `<input formControlName="first">`（親なし）
  - `FormControlName.ngOnChanges → _setUpControl → _checkParentType` — form\_control\_name.ts
    - `checkParentType → throw controlParentException(name)` — form\_control\_name.ts L285 — *開発モードだけ*
      - ``new RuntimeError(1050, `… ${formControlNameExample}`)`` — reactive\_errors.ts L21〜31
        - `formatRuntimeError → 'NG01050: …'` — core の errors.ts — *正の番号なので Find more は付かない*
    - `this.formDirective.addControl(this)` — *本番ではここへ進み、formDirective が null で TypeError*

## テストと直し方

| ファイル（packages/forms/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `reactive_integration_spec.ts` | `errors`（4212）› `should throw if a form isn't passed into formGroup`（4222）ほか 14 本 | NG01050〜01054・01350〜01353 の文の頭（`new RegExp('formGroupName must be used with a parent formGroup directive')` など）。`[formArray]` の場合の it は無い |
| `form_group_spec.ts`・`form_array_spec.ts` | `setValue` の中（form\_group\_spec.ts L410〜423、form\_array\_spec.ts L371〜384） | NG01001・NG01002 の文 |
| `directives_spec.ts` | L233・L244・L668・L676 | NG01203 と `Find more at …/errors/`（負の番号） |
| `reactive_integration_spec.ts` | L3008・L3028・L3053 | `ngModelWarning` の文と、1 回に絞ること |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/forms/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
--filter=errors           Ran 38 of 1153 specs、0 failures
--filter=should throw if  Ran 21 of 1153 specs、0 failures
--filter=should warn      Ran 6 of 1153 specs、0 failures

# 記録の取り方（<scratchpad>/fmd-demo/a/record.mjs）
#   demo-errors.ts を TypeScript で JS にし、platform-server の domino の上で JIT で動かす。
#   prod は先に globalThis.ngDevMode = false を置いてから @angular/* を読み込む。
$ node record.mjs ~/angular-research/angular-deep-dive fmd-errors.demo-errors.ts runFmdErAll '[[]]'
$ node record.mjs … runFmdErScenario '[["<場面>"]]' prod        # 場面ごとに別のプロセス
# ctrlNameInModelGroup の prod だけ、プロセスが unhandled の TypeError で終了した
```

spec は文の頭を正規表現で見ているので、74・86 行目の文を「formGroup or formArray」に直すと、`reactive_integration_spec.ts` の L4330・L4349・L4365 の 3 つの `new RegExp(…)` も一緒に直すことになります。`[formArray]` の下の `formGroupName` が通ることを固めるなら、同じ `errors`（4212）の近くに it を足します。文の小さな直し（template\_driven\_errors.ts の 50 行目の `to`、50・88 行目の空白、error\_examples.ts の 36 行目の `@for`）は spec に当たりません。`NG01354` を一覧に足すのは adev の `reference/errors/overview.md` です。

## 聞かれそうな質問

**Q. 本番で `formControlName` の親を付け忘れると、どんなエラーになりますか？**

`NG01050` ではなく `TypeError: Cannot read properties of null (reading 'addControl')` です。親の確かめは `ngDevMode` の後ろにあり、本番では消えるからです（記録の prod の列）。開発モードで一度動かせば分かる誤りなので、確かめを本番に残さない作りです。

**Q. 文の後ろに `Find more at …` が付く番号と付かない番号があるのはなぜですか？**

errors.ts で負の番号にした物だけが「解説のページがある」印で、`formatRuntimeError` が開発モードのときにリンクを足すからです（17・27・33・40 行目）。

**Q. `[formArray]` に `undefined` を渡したのに「formGroup expects a FormGroup instance」と出るのはなぜですか？**

`[formGroup]` と `[formArray]` が同じ親クラス `AbstractFormDirective` の確かめを使い、その文が `[formArray]` を足す前のままだからです（63 行目）。

**Q. `ngModel` と `[formControl]` を一緒に使った警告は、何回出ますか？**

`withConfig` を使わなければ、ディレクティブの型ごとにアプリで 1 回です（設定のトークンが無く `null` になり、`_ngModelWarning` の L453 が `'once'` と同じに扱う）。`'always'` ならインスタンスごと、`'never'` なら出しません。`ReactiveFormsModule.withConfig({callSetDisabledState: …})` のように別の設定だけを渡しても、form\_providers.ts L93 の `opts.warnOnNgModelWithFormControl ?? 'always'` で `'always'` になります。

**Q. `ngModel` に `name` を付け忘れた本番のアプリは、どう振る舞いますか？**

例外は出ません（`NG01352` の確かめは開発モードだけ）。記録では何も出ずに通りました。

## 読み終えて

- forms の例外の番号は errors.ts にまとまっていて、負の番号は「解説のページがある」印。`NG01354` だけ一覧の表に載っていない。
- 親や form が無いときの文のうち `controlParentException` だけが `[formArray]` に追いつき、`NG01052`・`NG01053`・`NG01054` の文は formGroup だけを挙げる。
- 本番では文も警告も消え、親の確かめが無いために別の場所の `TypeError` になる。
- 文に入る例は error\_examples.ts の 5 つの文字列で、`formArrayName` の例は `*ngFor` のまま。
- `removeListItem` は shared.ts と util.ts に同じ物が 2 つあり、`FormsModule#withconfig` のリンクは main で直った。

---

← 前: [Validators とバリデーターのディレクティブの説明文](04-fmd-validators.md)  
次: [NgControl と AbstractControlDirective の説明文](06-fmd-ng-control.md) →
