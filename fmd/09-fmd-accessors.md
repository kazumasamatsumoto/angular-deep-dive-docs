[目次](../README.md) › [Forms の説明文の読み残し](README.md) › 第 9 回 / 全 10 回

# 値のアクセサーの説明文：select・radio・既定のアクセサー

> directives の select\_control\_value\_accessor.ts・select\_multiple\_control\_value\_accessor.ts・radio\_control\_value\_accessor.ts・default\_value\_accessor.ts ほかの未読の行：compareWith、ngValue と value、radio の name、IME の合成中の扱い。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-accessors)

---

この章で分かること：組み込みの値のアクセサー（control の値と DOM の要素の値を行き来させる部品）の説明文が約束していることを、本物の `select`・`select multiple`・`radio`・既定の accessor で確かめます。中心は 4 つで、`compareWith` の例、`[ngValue]` と `[value]` の違い、radio の `name` と `formControlName` の組、IME の合成中の入力を止める `COMPOSITION_BUFFER_MODE` です。

読む対象は `packages/forms/src/directives/` の `select_control_value_accessor.ts`・`select_multiple_control_value_accessor.ts`・`radio_control_value_accessor.ts`・`default_value_accessor.ts`・`checkbox_value_accessor.ts`・`number_value_accessor.ts`・`range_value_accessor.ts`、`src/directives.ts` と、例の 3 つのファイルの、これまでの章が引いていない行です（../angular、8576f161ae4）。各 accessor の `writeValue` と `registerOnChange` の中身、select が id の文字列でオブジェクトを運ぶ仕組み、radio のレジストリは[組み込みの accessor](../forms/11-forms-builtin-accessors.md)、`DefaultValueAccessor` と `COMPOSITION_BUFFER_MODE` の定義は[値のアクセサー](../forms/09-forms-value-accessor.md)で読みました。

1. [1. AbstractControl](01-fmd-abstract-model.md)
2. [2. FormGroup・FormRecord・FormArray](02-fmd-group-array.md)
3. [3. FormControl と FormBuilder](03-fmd-control-builder.md)
4. [4. Validators](04-fmd-validators.md)
5. [5. エラーの文言と小道具](05-fmd-errors.md)
6. [6. NgControl](06-fmd-ng-control.md)
7. [7. リアクティブのディレクティブ](07-fmd-reactive-dirs.md)
8. [8. テンプレート駆動のディレクティブ](08-fmd-template-dirs.md)
9. **9. 値のアクセサー**（この章）
10. [10. spec と issue](10-fmd-tests-issues.md)

## 1. 公開されている accessor の一覧：directives.ts

📄 `angular/packages/forms/src/directives.ts` L45–72 （▶ の行: 45, 47, 53–55, 59, 64–66, 68–70, 72）

```ts
45 ▶ export {CheckboxControlValueAccessor} from './directives/checkbox_value_accessor';
46 │ export {ControlValueAccessor} from './directives/control_value_accessor';
47 ▶ export {DefaultValueAccessor} from './directives/default_value_accessor';
48 │ export {NgControl} from './directives/ng_control';
49 │ export {NgControlStatus, NgControlStatusGroup} from './directives/ng_control_status';
50 │ export {NgForm} from './directives/ng_form';
51 │ export {NgModel} from './directives/ng_model';
52 │ export {NgModelGroup} from './directives/ng_model_group';
53 ▶ export {NumberValueAccessor} from './directives/number_value_accessor';
54 ▶ export {RadioControlValueAccessor} from './directives/radio_control_value_accessor';
55 ▶ export {RangeValueAccessor} from './directives/range_value_accessor';
56 │ export {FormArrayDirective} from './directives/reactive_directives/form_array_directive';
57 │ export {
58 │   FormControlDirective,
59 ▶   NG_MODEL_WITH_FORM_CONTROL_WARNING,
60 │ } from './directives/reactive_directives/form_control_directive';
61 │ export {FormControlName} from './directives/reactive_directives/form_control_name';
62 │ export {FormGroupDirective} from './directives/reactive_directives/form_group_directive';
63 │ export {FormArrayName, FormGroupName} from './directives/reactive_directives/form_group_name';
64 ▶ export {
65 ▶   NgSelectOption,
66 ▶   SelectControlValueAccessor,
67 │ } from './directives/select_control_value_accessor';
68 ▶ export {
69 ▶   NgSelectMultipleOption,
70 ▶   SelectMultipleControlValueAccessor,
71 │ } from './directives/select_multiple_control_value_accessor';
72 ▶ export {CALL_SET_DISABLED_STATE} from './directives/shared';
```

45〜72 行目は、`FormsModule` と `ReactiveFormsModule` が宣言するディレクティブを、パッケージの中の別のファイル（`forms.ts` と `form_providers.ts`）へ出し直す export です。accessor は 45・47・53・54・55 行目の checkbox・既定・number・radio・range と、64〜71 行目の select の 2 組（`NgSelectOption` と `NgSelectMultipleOption` は `<option>` に付く相棒）です。59 行目の `NG_MODEL_WITH_FORM_CONTROL_WARNING` と 72 行目の `CALL_SET_DISABLED_STATE` は、`form_providers.ts` の `withConfig` が使うトークンです（[第 7 回](07-fmd-reactive-dirs.md)の 5 節）。

## 2. select：例と compareWith

📄 `angular/packages/forms/src/directives/select_control_value_accessor.ts` L51–78 （▶ の行: 53–55, 63, 67–68, 70, 74–77）

```ts
51 │ /**
52 │  * @description
53 ▶  * The `ControlValueAccessor` for writing select control values and listening to select control
54 ▶  * changes. The value accessor is used by the `FormControlDirective`, `FormControlName`, and
55 ▶  * `NgModel` directives.
56 │  *
57 │  * @usageNotes
58 │  *
59 │  * ### Using select controls in a reactive form
60 │  *
61 │  * The following examples show how to use a select control in a reactive form.
62 │  *
63 ▶  * {@example forms/ts/reactiveSelectControl/reactive_select_control_example.ts region='Component'}
64 │  *
65 │  * ### Using select controls in a template-driven form
66 │  *
67 ▶  * To use a select in a template-driven form, simply add an `ngModel` and a `name`
68 ▶  * attribute to the main `<select>` tag.
69 │  *
70 ▶  * {@example forms/ts/selectControl/select_control_example.ts region='Component'}
71 │  *
72 │  * ### Customizing option selection
73 │  *
74 ▶  * Angular uses object identity to select option. It's possible for the identities of items
75 ▶  * to change while the data does not. This can happen, for example, if the items are produced
76 ▶  * from an RPC to the server, and that RPC is re-run. Even if the data hasn't changed, the
77 ▶  * second response will produce objects with different identities.
78 │  *
```

📄 `angular/packages/examples/forms/ts/reactiveSelectControl/reactive_select_control_example.ts` L13–41 （▶ の行: 17, 19, 24–25, 39）

```ts
13 │ @Component({
14 │   selector: 'example-app',
15 │   template: `
16 │     <form [formGroup]="form">
17 ▶       <select formControlName="state">
18 │         @for (state of states; track $index) {
19 ▶           <option [ngValue]="state">{{ state.abbrev }}</option>
20 │         }
21 │       </select>
22 │     </form>
23 │ 
24 ▶     <p>Form value: {{ form.value | json }}</p>
25 ▶     <!-- {state: {name: 'New York', abbrev: 'NY'} } -->
26 │   `,
27 │   standalone: false,
28 │ })
29 │ export class ReactiveSelectComp {
30 │   states = [
31 │     {name: 'Arizona', abbrev: 'AZ'},
32 │     {name: 'California', abbrev: 'CA'},
33 │     {name: 'Colorado', abbrev: 'CO'},
34 │     {name: 'New York', abbrev: 'NY'},
35 │     {name: 'Pennsylvania', abbrev: 'PA'},
36 │   ];
37 │ 
38 │   form = new FormGroup({
39 ▶     state: new FormControl(this.states[3]),
40 │   });
41 │ }
```

📄 `angular/packages/examples/forms/ts/selectControl/select_control_example.ts` L12–37 （▶ の行: 16–17, 19, 24–25）

```ts
12 │ @Component({
13 │   selector: 'example-app',
14 │   template: `
15 │     <form #f="ngForm">
16 ▶       <select name="state" ngModel>
17 ▶         <option value="" disabled>Choose a state</option>
18 │         @for (state of states; track $index) {
19 ▶           <option [ngValue]="state">{{ state.abbrev }}</option>
20 │         }
21 │       </select>
22 │     </form>
23 │ 
24 ▶     <p>Form value: {{ f.value | json }}</p>
25 ▶     <!-- example value: {state: {name: 'New York', abbrev: 'NY'} } -->
26 │   `,
27 │   standalone: false,
28 │ })
29 │ export class SelectControlComp {
30 │   states = [
31 │     {name: 'Arizona', abbrev: 'AZ'},
32 │     {name: 'California', abbrev: 'CA'},
33 │     {name: 'Colorado', abbrev: 'CO'},
34 │     {name: 'New York', abbrev: 'NY'},
35 │     {name: 'Pennsylvania', abbrev: 'PA'},
36 │   ];
37 │ }
```

reactiveSelectControl の例は、39 行目で `states[3]`（NY）を初期値にします。デモでは、作った直後の `select.value` が `'3: Object'`（id の `3` と、値がオブジェクトなので `Object`）で、5 つの option の DOM の value は `'0: Object'`〜`'4: Object'`、CA を選ぶと `form.value.state` は `states[1]` と**同じオブジェクト**でした。25 行目のコメントどおりです。selectControl の例は 67〜68 行目のとおり `name` と `ngModel` を付けただけで、作った直後の `f.value` は `{"state":""}`、`select.value` も `''` で、17 行目の `value=""` の「Choose a state」が選ばれた形です。値なしの `ngModel` 属性は空文字を入れるので（[第 8 回](08-fmd-template-dirs.md)）、`[ngValue]` の 5 つのどれとも一致せず、空文字の option に落ちます。NY を選ぶと 25 行目の `{state: {name: 'New York', abbrev: 'NY'}}` になりました。

📄 `angular/packages/forms/src/directives/select_control_value_accessor.ts` L79–106 （▶ の行: 79–81, 84, 88–90, 94–95, 99–101）

````ts
 79 ▶  * To customize the default option comparison algorithm, `<select>` supports `compareWith` input.
 80 ▶  * `compareWith` takes a **function** which has two arguments: `option1` and `option2`.
 81 ▶  * If `compareWith` is given, Angular selects option by the return value of the function.
 82 │  *
 83 │  * ```ts
 84 ▶  * const selectedCountriesControl = new FormControl();
 85 │  * ```
 86 │  *
 87 │  * ```html
 88 ▶  * <select [compareWith]="compareFn"  [formControl]="selectedCountriesControl">
 89 ▶  *    @for(country of countries; track $index) {
 90 ▶  *        <option[ngValue]="country">{{country.name}}</option>
 91 │  *    }
 92 │  * </select>
 93 │  *
 94 ▶  * compareFn(c1: Country, c2: Country): boolean {
 95 ▶  *     return c1 && c2 ? c1.id === c2.id : c1 === c2;
 96 │  * }
 97 │  * ```
 98 │  *
 99 ▶  * **Note:** We listen to the 'change' event because 'input' events aren't fired
100 ▶  * for selects in IE, see:
101 ▶  * https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/input_event#browser_compatibility
102 │  *
103 │  * @ngModule ReactiveFormsModule
104 │  * @ngModule FormsModule
105 │  * @publicApi
106 │  */
````

📄 `angular/packages/forms/src/directives/select_control_value_accessor.ts` L126–133 （▶ の行: 128–130, 132）

```ts
126 │ 
127 │   /**
128 ▶    * @description
129 ▶    * Tracks the option comparison algorithm for tracking identities when
130 ▶    * checking for changes.
131 │    */
132 ▶   @Input()
133 │   set compareWith(fn: (o1: any, o2: any) => boolean) {
```

74〜77 行目は「Angular は option を**オブジェクトの同一性**で選ぶ。RPC を取り直すと、中身が同じでも別のオブジェクトになる」、79〜81 行目は「`compareWith` に 2 引数の関数を渡すと、その戻り値で選ぶ」です。デモは 84〜96 行目の例を置き、control の値を、option の配列とは別に作った `{id: 2, name: 'Kenya'}` にしました。`compareWith` ありの select は `'1: Object'`（Kenya）が選ばれ、`compareWith` なし（既定の `Object.is`）の select はどの option にも当たりません。

90 行目の `<option[ngValue]="country">` は、`option` と `[ngValue]` の間の空白が抜けていて、そのままでは通りません。この例をそのままテンプレートにして `ngc` にかけると `NG5002: Unexpected closing tag "option".` と `NG5002: Unexpected closing block.` の 2 つで、空白を足すと `strictTemplates` でも通りました（デモは空白を足した形）。e7608e503f1（2025-05-26、`docs: update API examples to modern angular (#61688)`）が `*ngFor` を `@for` に書き直したときに、`<option *ngFor="…" [ngValue]="country">` の `*ngFor="…"` を消して空白も一緒に消えた形です。origin/main でも同じです。99〜101 行目の「IE では select に `input` イベントが出ないので `change` を聞く」は、Angular が IE をもう対象にしていない今では理由として古い文ですが、`change` を聞く実装（110 行目の host、[組み込みの accessor](../forms/11-forms-builtin-accessors.md)の引用）は今も同じです。

📄 `angular/packages/forms/src/directives/select_control_value_accessor.ts` L144–152 （▶ の行: 144–146, 148–151）

```ts
144 ▶   // We need this because we might be in the process of destroying the root
145 ▶   // injector, which is marked as destroyed before running destroy hooks.
146 ▶   // Attempting to use afterNextRender with the node injector would evntually
147 │   // run into that already destroyed injector.
148 ▶   private readonly appRefInjector = inject(ApplicationRef).injector;
149 ▶   private readonly destroyRef = inject(DestroyRef);
150 ▶   private readonly cdr = inject(ChangeDetectorRef);
151 ▶   private _queuedWrite = false;
152 │ 
```

📄 `angular/packages/forms/src/directives/select_control_value_accessor.ts` L280–287 （▶ の行: 283–284, 286）

```ts
280 │ 
281 │   /**
282 │    * @description
283 ▶    * Tracks simple string values bound to the option element.
284 ▶    * For objects, use the `ngValue` input binding.
285 │    */
286 ▶   @Input('value')
287 │   set value(value: any) {
```

144〜148 行目は「根の注入器を壊している途中かもしれないので、`afterNextRender` にはノードの注入器でなく `ApplicationRef` の注入器を渡す」（146 行目の `evntually` は綴りの誤り）で、151 行目の `_queuedWrite` とともに、option の増減のたびに `writeValue` を 1 回にまとめる `_writeValueAfterRender`（[組み込みの accessor](../forms/11-forms-builtin-accessors.md)）のための物です。283〜284 行目は `NgSelectOption` の `value` の説明で「単純な文字列の値。オブジェクトなら `ngValue`」です。4 節で、select と select multiple でこの文の意味が違うことを見ます。

## 3. select multiple の説明文

📄 `angular/packages/forms/src/directives/select_multiple_control_value_accessor.ts` L30–46 （▶ の行: 36–40, 43–44）

```ts
30 │ const SELECT_MULTIPLE_VALUE_ACCESSOR: Provider = {
31 │   provide: NG_VALUE_ACCESSOR,
32 │   useExisting: forwardRef(() => SelectMultipleControlValueAccessor),
33 │   multi: true,
34 │ };
35 │ 
36 ▶ function _buildValueString(id: string, value: any): string {
37 ▶   if (id == null) return `${value}`;
38 ▶   if (typeof value === 'string') value = `'${value}'`;
39 ▶   if (value && typeof value === 'object') value = 'Object';
40 ▶   return `${id}: ${value}`.slice(0, 50);
41 │ }
42 │ 
43 ▶ function _extractId(valueString: string): string {
44 ▶   return valueString.split(':')[0];
45 │ }
46 │ 
```

📄 `angular/packages/forms/src/directives/select_multiple_control_value_accessor.ts` L47–81 （▶ の行: 49–50, 59, 62, 66, 68, 75–76）

````ts
47 │ /**
48 │  * @description
49 ▶  * The `ControlValueAccessor` for writing multi-select control values and listening to multi-select
50 ▶  * control changes. The value accessor is used by the `FormControlDirective`, `FormControlName`, and
51 │  * `NgModel` directives.
52 │  *
53 │  * @see {@link SelectControlValueAccessor}
54 │  *
55 │  * @usageNotes
56 │  *
57 │  * ### Using a multi-select control
58 │  *
59 ▶  * The follow example shows you how to use a multi-select control with a reactive form.
60 │  *
61 │  * ```ts
62 ▶  * const countryControl = new FormControl();
63 │  * ```
64 │  *
65 │  * ```html
66 ▶  * <select multiple name="countries" [formControl]="countryControl">
67 │  *   @for(country of countries; track $index) {
68 ▶  *      <option [ngValue]="country">{{ country.name }}</option>
69 │  *   }
70 │  * </select>
71 │  * ```
72 │  *
73 │  * ### Customizing option selection
74 │  *
75 ▶  * To customize the default option comparison algorithm, `<select>` supports `compareWith` input.
76 ▶  * See the `SelectControlValueAccessor` for usage.
77 │  *
78 │  * @ngModule ReactiveFormsModule
79 │  * @ngModule FormsModule
80 │  * @publicApi
81 │  */
````

📄 `angular/packages/forms/src/directives/select_multiple_control_value_accessor.ts` L82–104 （▶ の行: 84–85, 97, 100, 103）

```ts
 82 │ @Directive({
 83 │   selector:
 84 ▶     'select[multiple]:not([ngNoCva])[formControlName],select[multiple]:not([ngNoCva])[formControl],select[multiple]:not([ngNoCva])[ngModel]',
 85 ▶   host: {'(change)': 'onChange($event.target)', '(blur)': 'onTouched()'},
 86 │   providers: [SELECT_MULTIPLE_VALUE_ACCESSOR],
 87 │   standalone: false,
 88 │ })
 89 │ export class SelectMultipleControlValueAccessor
 90 │   extends BuiltInControlValueAccessor
 91 │   implements ControlValueAccessor
 92 │ {
 93 │   /**
 94 │    * The current value.
 95 │    * @docs-private
 96 │    */
 97 ▶   value: any;
 98 │ 
 99 │   /** @internal */
100 ▶   _optionMap: Map<string, ɵNgSelectMultipleOption> = new Map<string, ɵNgSelectMultipleOption>();
101 │ 
102 │   /** @internal */
103 ▶   _idCounter: number = 0;
104 │ 
```

📄 `angular/packages/forms/src/directives/select_multiple_control_value_accessor.ts` L105–126 （▶ の行: 107–108, 111–112, 115, 118, 121, 124）

```ts
105 │   /**
106 │    * @description
107 ▶    * Tracks the option comparison algorithm for tracking identities when
108 ▶    * checking for changes.
109 │    */
110 │   @Input()
111 ▶   set compareWith(fn: (o1: any, o2: any) => boolean) {
112 ▶     if (typeof fn !== 'function' && (typeof ngDevMode === 'undefined' || ngDevMode)) {
113 │       throw new RuntimeError(
114 │         RuntimeErrorCode.COMPAREWITH_NOT_A_FN,
115 ▶         `compareWith must be a function, but received ${JSON.stringify(fn)}`,
116 │       );
117 │     }
118 ▶     this._compareWith = fn;
119 │   }
120 │ 
121 ▶   private _compareWith: (o1: any, o2: any) => boolean = Object.is;
122 │ 
123 │   /**
124 ▶    * Sets the "value" property on one or of more of the select's options.
125 │    * @docs-private
126 │    */
```

36〜41 行目の `_buildValueString` は、1 つの select の物と 1 行だけ違い、38 行目で**文字列の値を引用符で囲みます**（`'0: \'a\''` の形）。50 文字で切る 40 行目は同じです。59 行目の「The follow example」は「following」の誤り（radio の 113 行目も同じ）、62〜70 行目の例は `new FormControl()` と `<select multiple … [formControl]>` と `[ngValue]` です。75〜76 行目は「`compareWith` は `SelectControlValueAccessor` を見よ」。84 行目のセレクターは `select[multiple]` の 3 つ、85 行目の host は `(change)` で要素そのもの（`$event.target`）を渡します。121 行目の既定の比べ方は `Object.is`、124 行目の「one or of more」は「one or more of」の語順の誤りです。

📄 `angular/packages/forms/src/directives/select_multiple_control_value_accessor.ts` L143–150 （▶ の行: 145–146）

```ts
143 │ 
144 │   /**
145 ▶    * Registers a function called when the control value changes
146 ▶    * and writes an array of the selected options.
147 │    * @docs-private
148 │    */
149 │   override registerOnChange(fn: (value: any) => any): void {
150 │     this.onChange = (element: HTMLSelectElement) => {
```

📄 `angular/packages/forms/src/directives/select_multiple_control_value_accessor.ts` L161–199 （▶ の行: 161–163, 165, 168–169, 174–175, 181, 188–189, 196–197）

```ts
161 ▶       // Degrade to use `options` when `selectedOptions` property is not available.
162 ▶       // Note: the `selectedOptions` is available in all supported browsers, but the Domino lib
163 ▶       // doesn't have it currently, see https://github.com/fgnass/domino/issues/177.
164 │       else {
165 ▶         const options = element.options;
166 │         for (let i = 0; i < options.length; i++) {
167 │           const opt = options[i];
168 ▶           if (opt.selected) {
169 ▶             const val = this._getOptionValue(opt.value);
170 │             selected.push(val);
171 │           }
172 │         }
173 │       }
174 ▶       this.value = selected;
175 ▶       fn(selected);
176 │     };
177 │   }
178 │ 
179 │   /** @internal */
180 │   _registerOption(value: ɵNgSelectMultipleOption): string {
181 ▶     const id: string = (this._idCounter++).toString();
182 │     this._optionMap.set(id, value);
183 │     return id;
184 │   }
185 │ 
186 │   /** @internal */
187 │   _getOptionId(value: any): string | null {
188 ▶     for (const id of this._optionMap.keys()) {
189 ▶       if (this._compareWith(this._optionMap.get(id)!._value, value)) return id;
190 │     }
191 │     return null;
192 │   }
193 │ 
194 │   /** @internal */
195 │   _getOptionValue(valueString: string): any {
196 ▶     const id: string = _extractId(valueString);
197 ▶     return this._optionMap.has(id) ? this._optionMap.get(id)!._value : valueString;
198 │   }
199 │ }
```

145〜146 行目は「選ばれた option の配列を書く関数を登録する」。161〜163 行目は「`selectedOptions` はどの対応ブラウザーにもあるが、Domino（サーバーで使う DOM の実装）には無いので `options` に落とす」で、この章のデモを Node の domino で走らせたときも、165〜172 行目の道を通って同じ値になりました。188〜190 行目の `_getOptionId` は、登録された option を順に `compareWith` で比べて最初に当たった id を返し、196〜197 行目の `_getOptionValue` は id から元の値を取り出します（無ければ文字列のまま）。

📄 `angular/packages/forms/src/directives/select_multiple_control_value_accessor.ts` L200–234 （▶ の行: 203, 212, 218, 223, 225–226, 232–233）

```ts
200 │ 
201 │ /**
202 │  * @description
203 ▶  * Marks `<option>` as dynamic, so Angular can be notified when options change.
204 │  *
205 │  * @see {@link SelectMultipleControlValueAccessor}
206 │  *
207 │  * @ngModule ReactiveFormsModule
208 │  * @ngModule FormsModule
209 │  * @publicApi
210 │  */
211 │ @Directive({
212 ▶   selector: 'option',
213 │   standalone: false,
214 │ })
215 │ export class ɵNgSelectMultipleOption implements OnDestroy {
216 │   id!: string;
217 │   /** @internal */
218 ▶   _value: any;
219 │ 
220 │   constructor(
221 │     private _element: ElementRef,
222 │     private _renderer: Renderer2,
223 ▶     @Optional() @Host() private _select: SelectMultipleControlValueAccessor,
224 │   ) {
225 ▶     if (this._select) {
226 ▶       this.id = this._select._registerOption(this);
227 │     }
228 │   }
229 │ 
230 │   /**
231 │    * @description
232 ▶    * Tracks the value bound to the option element. Unlike the value binding,
233 ▶    * ngValue supports binding to objects.
234 │    */
```

📄 `angular/packages/forms/src/directives/select_multiple_control_value_accessor.ts` L235–262 （▶ の行: 236, 238–240, 245–246, 248, 250–252, 255）

```ts
235 │   @Input('ngValue')
236 ▶   set ngValue(value: any) {
237 │     if (this._select == null) return;
238 ▶     this._value = value;
239 ▶     this._setElementValue(_buildValueString(this.id, value));
240 ▶     this._select.writeValue(this._select.value);
241 │   }
242 │ 
243 │   /**
244 │    * @description
245 ▶    * Tracks simple string values bound to the option element.
246 ▶    * For objects, use the `ngValue` input binding.
247 │    */
248 ▶   @Input('value')
249 │   set value(value: any) {
250 ▶     if (this._select) {
251 ▶       this._value = value;
252 ▶       this._setElementValue(_buildValueString(this.id, value));
253 │       this._select.writeValue(this._select.value);
254 │     } else {
255 ▶       this._setElementValue(value);
256 │     }
257 │   }
258 │ 
259 │   /** @internal */
260 │   _setElementValue(value: string): void {
261 │     this._renderer.setProperty(this._element.nativeElement, 'value', value);
262 │   }
```

📄 `angular/packages/forms/src/directives/select_multiple_control_value_accessor.ts` L263–278 （▶ の行: 266, 271–273, 278）

```ts
263 │ 
264 │   /** @internal */
265 │   _setSelected(selected: boolean) {
266 ▶     this._renderer.setProperty(this._element.nativeElement, 'selected', selected);
267 │   }
268 │ 
269 │   /** @docs-private */
270 │   ngOnDestroy(): void {
271 ▶     if (this._select) {
272 ▶       this._select._optionMap.delete(this.id);
273 ▶       this._select.writeValue(this._select.value);
274 │     }
275 │   }
276 │ }
277 │ 
278 ▶ export {ɵNgSelectMultipleOption as NgSelectMultipleOption};
```

`ɵNgSelectMultipleOption` は、212 行目のセレクター `option` で、`<select multiple>` の中のすべての option に付きます（223 行目の `@Host()` で親の accessor を探し、無ければ何もしない）。245〜246 行目の `value` の説明は 1 つの select の物（283〜284 行目）と同じ「単純な文字列の値」ですが、248〜257 行目の中身は違い、251 行目で**渡された値をそのまま `_value` に入れます**。238 行目の `ngValue` と同じ置き場です。278 行目で `NgSelectMultipleOption` の名前でも出します。

## 4. ngValue と value

デモの 3 番目は、`[value]="1"`・`[value]="2"`（数）の option を、1 つの select と select multiple に置き、`[ngValue]` の select と並べました。DOM の option の value は、1 つの select の `[value]` が `'1'`・`'2'`、`[ngValue]` が `'0: 1'`・`'1: 2'`、select multiple の `[value]` も `'0: 1'`・`'1: 2'` です。2 番目を選んだ後の control の値は、1 つの select の `[value]` が **文字列の `'2'`**、`[ngValue]` が数の `2`、select multiple の `[value]` が **数の `[2]`** でした。

| option の書き方 | DOM の value | control に入る値 | compareWith |
| --- | --- | --- | --- |
| select の `[value]="2"` | `'2'` | `'2'`（文字列） | 使われない（デモで 0 回） |
| select の `[ngValue]="2"` | `'1: 2'` | `2`（数） | 使われる |
| select multiple の `[value]="2"` | `'1: 2'` | `[2]`（数） | 使われる |

1 つの select の `NgSelectOption` は、`[value]` を DOM に書くだけで `_optionMap` に入れないので（[組み込みの accessor](../forms/11-forms-builtin-accessors.md)の 3 節）、読み戻すと DOM の文字列です。`compareWith` も `_optionMap` の中しか見ないため、`[value]` の option では呼ばれません。79〜81 行目の「`compareWith` があればその戻り値で選ぶ」は、`[ngValue]` の option だけの話です。select multiple では 251 行目のとおり `[value]` も `[ngValue]` と同じに扱われ、「文字列の値」の説明文と違って型が残ります。

## 5. radio：例と、name と formControlName の組

📄 `angular/packages/forms/src/directives/radio_control_value_accessor.ts` L35–54 （▶ の行: 41, 43, 45–46, 53）

```ts
35 │ const RADIO_VALUE_ACCESSOR: Provider = {
36 │   provide: NG_VALUE_ACCESSOR,
37 │   useExisting: forwardRef(() => RadioControlValueAccessor),
38 │   multi: true,
39 │ };
40 │ 
41 ▶ function throwNameError() {
42 │   throw new RuntimeError(
43 ▶     RuntimeErrorCode.NAME_AND_FORM_CONTROL_NAME_MUST_MATCH,
44 │     `
45 ▶       If you define both a name and a formControlName attribute on your radio button, their values
46 ▶       must match. Ex: <input type="radio" formControlName="food" name="food">
47 │     `,
48 │   );
49 │ }
50 │ 
51 │ /**
52 │  * @description
53 ▶  * Class used by Angular to track radio buttons. For internal use only.
54 │  */
```

📄 `angular/packages/forms/src/directives/radio_control_value_accessor.ts` L66–83 （▶ の行: 69, 71–75）

```ts
66 │ 
67 │   /**
68 │    * @description
69 ▶    * Removes a control from the internal registry. For internal use only.
70 │    */
71 ▶   remove(accessor: RadioControlValueAccessor) {
72 ▶     for (let i = this._accessors.length - 1; i >= 0; --i) {
73 ▶       if (this._accessors[i][1] === accessor) {
74 ▶         this._accessors.splice(i, 1);
75 ▶         return;
76 │       }
77 │     }
78 │   }
79 │ 
80 │   /**
81 │    * @description
82 │    * Selects a radio button. For internal use only.
83 │    */
```

📄 `angular/packages/forms/src/directives/radio_control_value_accessor.ts` L101–122 （▶ の行: 105–106, 113–115, 117）

```ts
101 │ }
102 │ 
103 │ /**
104 │  * @description
105 ▶  * The `ControlValueAccessor` for writing radio control values and listening to radio control
106 ▶  * changes. The value accessor is used by the `FormControlDirective`, `FormControlName`, and
107 │  * `NgModel` directives.
108 │  *
109 │  * @usageNotes
110 │  *
111 │  * ### Using radio buttons with reactive form directives
112 │  *
113 ▶  * The follow example shows how to use radio buttons in a reactive form. When using radio buttons in
114 ▶  * a reactive form, radio buttons in the same group should have the same `formControlName`.
115 ▶  * Providing a `name` attribute is optional.
116 │  *
117 ▶  * {@example forms/ts/reactiveRadioButtons/reactive_radio_button_example.ts region='Reactive'}
118 │  *
119 │  * @ngModule ReactiveFormsModule
120 │  * @ngModule FormsModule
121 │  * @publicApi
122 │  */
```

📄 `angular/packages/examples/forms/ts/reactiveRadioButtons/reactive_radio_button_example.ts` L13–31 （▶ の行: 17–19, 23, 29）

```ts
13 │ @Component({
14 │   selector: 'example-app',
15 │   template: `
16 │     <form [formGroup]="form">
17 ▶       <input type="radio" formControlName="food" value="beef" /> Beef
18 ▶       <input type="radio" formControlName="food" value="lamb" /> Lamb
19 ▶       <input type="radio" formControlName="food" value="fish" /> Fish
20 │     </form>
21 │ 
22 │     <p>Form value: {{ form.value | json }}</p>
23 ▶     <!-- {food: 'lamb' } -->
24 │   `,
25 │   standalone: false,
26 │ })
27 │ export class ReactiveRadioButtonComp {
28 │   form = new FormGroup({
29 ▶     food: new FormControl('lamb'),
30 │   });
31 │ }
```

113〜115 行目は「リアクティブのフォームでは、同じグループの radio は同じ `formControlName` にする。`name` 属性は付けなくてよい」です。例の 17〜19 行目には `name` がなく、デモでは作った直後に `lamb` だけが `checked`、Beef を選ぶと `form.value` が 23 行目の形の `{"food":"beef"}` になり、ほかの 2 つの `checked` が外れました。DOM の `name` 属性は `null` のままです。`name` と `formControlName` の両方を書いて値が違うと、41〜49 行目の `NAME_AND_FORM_CONTROL_NAME_MUST_MATCH` を投げます。投げるのは開発モードだけです（下の記録）。

📄 `angular/packages/forms/src/directives/radio_control_value_accessor.ts` L134–172 （▶ の行: 150, 154, 156, 160–161, 163, 167, 169, 171–172）

```ts
134 │   /** @internal */
135 │   _state!: boolean;
136 │   /** @internal */
137 │   _control!: NgControl;
138 │   /** @internal */
139 │   _fn!: Function;
140 │ 
141 │   private setDisabledStateFired = false;
142 │ 
143 │   /**
144 │    * The registered callback function called when a change event occurs on the input element.
145 │    * Note: we declare `onChange` here (also used as host listener) as a function with no arguments
146 │    * to override the `onChange` function (which expects 1 argument) in the parent
147 │    * `BaseControlValueAccessor` class.
148 │    * @docs-private
149 │    */
150 ▶   override onChange = () => {};
151 │ 
152 │   /**
153 │    * @description
154 ▶    * Tracks the name of the radio input element.
155 │    */
156 ▶   @Input() name!: string;
157 │ 
158 │   /**
159 │    * @description
160 ▶    * Tracks the name of the `FormControl` bound to the directive. The name corresponds
161 ▶    * to a key in the parent `FormGroup` or `FormArray`.
162 │    */
163 ▶   @Input() formControlName!: string;
164 │ 
165 │   /**
166 │    * @description
167 ▶    * Tracks the value of the radio input element
168 │    */
169 ▶   @Input() value: any;
170 │ 
171 ▶   private callSetDisabledState =
172 ▶     inject(CALL_SET_DISABLED_STATE, {optional: true}) ?? setDisabledStateDefault;
```

📄 `angular/packages/forms/src/directives/radio_control_value_accessor.ts` L173–191 （▶ の行: 177–178, 185, 187–188）

```ts
173 │ 
174 │   constructor(
175 │     renderer: Renderer2,
176 │     elementRef: ElementRef,
177 ▶     private _registry: RadioControlRegistry,
178 ▶     private _injector: Injector,
179 │   ) {
180 │     super(renderer, elementRef);
181 │   }
182 │ 
183 │   /** @internal */
184 │   ngOnChanges(changes: SimpleChanges): void {
185 ▶     const control = this._control?.control;
186 │ 
187 ▶     if (changes['value'] && control) {
188 ▶       this.writeValue(control.value);
189 │     }
190 │   }
191 │ 
```

154 行目の `name` は「radio の input の名前」、160〜161 行目の `formControlName` は「親の `FormGroup` か `FormArray` のキー」、167 行目の `value` は「radio の値」です。この 3 つはこの accessor の入力で、`name` も `value` も DOM の属性には書きません（`[value]` で束縛すると DOM の `value` が `'on'` のまま、という #26037 の話の元）。`name` を省いたときは、`_checkName`（[組み込みの accessor](../forms/11-forms-builtin-accessors.md)の引用、264〜274 行目）が `formControlName` の値を**この accessor の `name` に**入れます。同じグループかどうかは、レジストリの `_isSameGroup`（同じ引用の 92〜100 行目）が「`NgControl` の `_parent` が同じで、`name` が同じ」で決めます。

> [!WARNING]
> **ハマりどころ**
>
> `[formControl]` の radio は `_parent` が `null` で、`name` を書かなければ `name` も `undefined` です。すると、**別の `FormControl` の radio どうしも同じグループ**になります。デモの 4 番目の 3 行目は、`[formControl]="a"` の 2 つ（x・y）と `[formControl]="b"` の 2 つ（x・y）を `name` なしで置き、`a` の x を選んだものです。`a` は `'x'`、`b` は `'y'` のままなのに、`b` の x の `checked` が `true`、`b` の y が `false` になり、画面の `b` は値と違う方を選んで見えます。レジストリの `select` が同じグループのほかの accessor の `fireUncheck(accessor.value)` を呼び、`fireUncheck` は `writeValue(value)`、つまり `checked = (value === this.value)` なので、同じ値の radio は外れるのではなく**入ります**。255〜256 行目の `fireUncheck` の説明は「値を書いて、チェックを外す」ですが、外すとは限りません。`name="c"` を付けた組（5 行目）や、別々の `[formGroup]` の `formControlName`（6 行目、`_parent` が違う）は巻き込まれませんでした。

1. **登録**

   radio ごとの accessor が `ngOnInit` で自分の要素の `NgControl` を取り、レジストリに `[NgControl, accessor]` の組で入ります（[組み込みの accessor](../forms/11-forms-builtin-accessors.md)の引用、192〜197 行目）。
2. **選ばれたとき**

   `change` で `onChange` が control に自分の `value` を渡し、`_registry.select(this)` を呼びます（同じ引用の 217〜223 行目）。
3. **同じ組を探す**

   レジストリは、`NgControl` の `_parent` と accessor の `name` が同じものを同じ組とみなします。
4. **ほかの radio に書く**

   同じ組のほかの accessor の `fireUncheck(選ばれた値)` → `writeValue(値)` で、`checked = (値 === 自分の value)` を書きます。値が違えば外れ、同じなら入ります。

📄 `angular/packages/forms/src/directives/radio_control_value_accessor.ts` L224–263 （▶ の行: 230, 238–243, 245–248, 250, 256, 260–261）

```ts
224 │ 
225 │   /** @docs-private */
226 │   override setDisabledState(isDisabled: boolean): void {
227 │     /**
228 │      * `setDisabledState` is supposed to be called whenever the disabled state of a control changes,
229 │      * including upon control creation. However, a longstanding bug caused the method to not fire
230 ▶      * when an *enabled* control was attached. This bug was fixed in v15 in #47576.
231 │      *
232 │      * This had a side effect: previously, it was possible to instantiate a reactive form control
233 │      * with `[attr.disabled]=true`, even though the corresponding control was enabled in the
234 │      * model. This resulted in a mismatch between the model and the DOM. Now, because
235 │      * `setDisabledState` is always called, the value in the DOM will be immediately overwritten
236 │      * with the "correct" enabled value.
237 │      *
238 ▶      * However, the fix also created an exceptional case: radio buttons. Because Reactive Forms
239 ▶      * models the entire group of radio buttons as a single `FormControl`, there is no way to
240 ▶      * control the disabled state for individual radios, so they can no longer be configured as
241 ▶      * disabled. Thus, we keep the old behavior for radio buttons, so that `[attr.disabled]`
242 ▶      * continues to work. Specifically, we drop the first call to `setDisabledState` if `disabled`
243 ▶      * is `false`, and we are not in legacy mode.
244 │      */
245 ▶     if (
246 ▶       this.setDisabledStateFired ||
247 ▶       isDisabled ||
248 ▶       this.callSetDisabledState === 'whenDisabledForLegacyCode'
249 │     ) {
250 ▶       this.setProperty('disabled', isDisabled);
251 │     }
252 │     this.setDisabledStateFired = true;
253 │   }
254 │ 
255 │   /**
256 ▶    * Sets the "value" on the radio input element and unchecks it.
257 │    *
258 │    * @param value
259 │    */
260 ▶   fireUncheck(value: any): void {
261 ▶     this.writeValue(value);
262 │   }
263 │ 
```

228〜243 行目は長い理由の説明です。「v15 の #47576 で、enabled の control を付けたときにも `setDisabledState` を呼ぶように直した。そのため `[attr.disabled]` で DOM だけ無効にする書き方が上書きされるようになったが、radio のグループは 1 つの `FormControl` なので 1 つずつ無効にする方法が無い。だから radio だけは、最初の 1 回の `setDisabledState(false)` を捨てる」。245〜251 行目がその形で、最初の呼び出しで `isDisabled` が `false` なら DOM に書かず、252 行目で印を付けます（`whenDisabledForLegacyCode` のときは書く）。一部の radio だけを無効にしたいという要望は、開いている #11763 です。

## 6. 既定の accessor と、checkbox・number・range の説明文

📄 `angular/packages/forms/src/directives/default_value_accessor.ts` L51–85 （▶ の行: 53–54, 62–63, 66, 70, 73–76, 79）

````ts
51 │ 
52 │ /**
53 ▶  * The default `ControlValueAccessor` for writing a value and listening to changes on input
54 ▶  * elements. The accessor is used by the `FormControlDirective`, `FormControlName`, and
55 │  * `NgModel` directives.
56 │  *
57 │  *
58 │  * @usageNotes
59 │  *
60 │  * ### Using the default value accessor
61 │  *
62 ▶  * The following example shows how to use an input element that activates the default value accessor
63 ▶  * (in this case, a text field).
64 │  *
65 │  * ```ts
66 ▶  * const firstNameControl = new FormControl();
67 │  * ```
68 │  *
69 │  * ```html
70 ▶  * <input type="text" [formControl]="firstNameControl">
71 │  * ```
72 │  *
73 ▶  * This value accessor is used by default for `<input type="text">` and `<textarea>` elements, but
74 ▶  * you could also use it for custom components that have similar behavior and do not require special
75 ▶  * processing. In order to attach the default value accessor to a custom element, add the
76 ▶  * `ngDefaultControl` attribute as shown below.
77 │  *
78 │  * ```html
79 ▶  * <custom-input-component ngDefaultControl [(ngModel)]="value"></custom-input-component>
80 │  * ```
81 │  *
82 │  * @ngModule ReactiveFormsModule
83 │  * @ngModule FormsModule
84 │  * @publicApi
85 │  */
````

73〜76 行目は「`<input type="text">` と `<textarea>` で既定で使う。似た動きのカスタムの部品には `ngDefaultControl` を付ける」です。セレクター（[値のアクセサー](../forms/09-forms-value-accessor.md)の引用、88 行目）は `input:not([type=checkbox])` で、`type="email"` も `type="date"` も含みます。デモの `type="email"` は `'a@b'` の文字列がそのまま入りました。number・range・radio の input にもこのセレクターは当たりますが、`selectValueAccessor` が組み込みの専用の accessor を優先します（同じ章の 6 節）。79 行目の `<custom-input-component ngDefaultControl [(ngModel)]>` の形は、デモの `<span ngDefaultControl [(ngModel)]>` で、`span` の `value` プロパティに `'ngDefaultControl の値'` が書かれました（`span` には `input` イベントが無いので、逆向きは来ません）。

`COMPOSITION_BUFFER_MODE` の説明文（[値のアクセサー](../forms/09-forms-value-accessor.md)の引用、42〜47 行目）は「IME の入力を `compositionend` まで溜めるかを決めるトークン」とだけ書き、既定の値を書いていません。既定は 111〜113 行目の `!_isAndroid()`（Android 以外は溜める）です。デモの 5 番目は、`compositionstart` → `input`（`'か'`）→ `input`（`'かn'`）→ `compositionend`（`'漢'`）を送りました。provide しないときは合成中の 2 回の `input` を捨て、control は `compositionend` で初めて `'漢'`（`valueChanges` は 1 回）、`false` を provide すると 2 回の `input` がそのまま入り（`'か'`・`'かn'`）、`compositionend` では何もしません。

📄 `angular/packages/forms/src/directives/checkbox_value_accessor.ts` L17–45 （▶ の行: 25, 35, 39）

````ts
17 │ const CHECKBOX_VALUE_ACCESSOR: Provider = {
18 │   provide: NG_VALUE_ACCESSOR,
19 │   useExisting: forwardRef(() => CheckboxControlValueAccessor),
20 │   multi: true,
21 │ };
22 │ 
23 │ /**
24 │  * @description
25 ▶  * A `ControlValueAccessor` for writing a value and listening to changes on a checkbox input
26 │  * element.
27 │  *
28 │  * @usageNotes
29 │  *
30 │  * ### Using a checkbox with a reactive form.
31 │  *
32 │  * The following example shows how to use a checkbox with a reactive form.
33 │  *
34 │  * ```ts
35 ▶  * const rememberLoginControl = new FormControl();
36 │  * ```
37 │  *
38 │  * ```html
39 ▶  * <input type="checkbox" [formControl]="rememberLoginControl">
40 │  * ```
41 │  *
42 │  * @ngModule ReactiveFormsModule
43 │  * @ngModule FormsModule
44 │  * @publicApi
45 │  */
````

📄 `angular/packages/forms/src/directives/number_value_accessor.ts` L17–46 （▶ の行: 25, 36, 40）

````ts
17 │ const NUMBER_VALUE_ACCESSOR: Provider = {
18 │   provide: NG_VALUE_ACCESSOR,
19 │   useExisting: forwardRef(() => NumberValueAccessor),
20 │   multi: true,
21 │ };
22 │ 
23 │ /**
24 │  * @description
25 ▶  * The `ControlValueAccessor` for writing a number value and listening to number input changes.
26 │  * The value accessor is used by the `FormControlDirective`, `FormControlName`, and `NgModel`
27 │  * directives.
28 │  *
29 │  * @usageNotes
30 │  *
31 │  * ### Using a number input with a reactive form.
32 │  *
33 │  * The following example shows how to use a number input with a reactive form.
34 │  *
35 │  * ```ts
36 ▶  * const totalCountControl = new FormControl();
37 │  * ```
38 │  *
39 │  * ```html
40 ▶  * <input type="number" [formControl]="totalCountControl">
41 │  * ```
42 │  *
43 │  * @ngModule ReactiveFormsModule
44 │  * @ngModule FormsModule
45 │  * @publicApi
46 │  */
````

📄 `angular/packages/forms/src/directives/range_value_accessor.ts` L17–46 （▶ の行: 25, 36, 40）

````ts
17 │ const RANGE_VALUE_ACCESSOR: Provider = {
18 │   provide: NG_VALUE_ACCESSOR,
19 │   useExisting: forwardRef(() => RangeValueAccessor),
20 │   multi: true,
21 │ };
22 │ 
23 │ /**
24 │  * @description
25 ▶  * The `ControlValueAccessor` for writing a range value and listening to range input changes.
26 │  * The value accessor is used by the `FormControlDirective`, `FormControlName`, and  `NgModel`
27 │  * directives.
28 │  *
29 │  * @usageNotes
30 │  *
31 │  * ### Using a range input with a reactive form
32 │  *
33 │  * The following example shows how to use a range input with a reactive form.
34 │  *
35 │  * ```ts
36 ▶  * const ageControl = new FormControl();
37 │  * ```
38 │  *
39 │  * ```html
40 ▶  * <input type="range" [formControl]="ageControl">
41 │  * ```
42 │  *
43 │  * @ngModule ReactiveFormsModule
44 │  * @ngModule FormsModule
45 │  * @publicApi
46 │  */
````

3 つの例はどれも `new FormControl()`（値は `null`）と 1 行の input です。デモでは、checkbox を入れると `true`（boolean）、number に `12` と打つと数の `12`、空にすると `null`、range を `30` にすると数の `30` でした。作った直後の range の DOM の値は、`writeValue(null)` が `parseFloat(null)`（`NaN`）を書くので、ブラウザーが範囲の真ん中の `'50'` に直したものです（domino の Node では `'NaN'` のまま）。control は `null` のままで、画面の `50` とは一致しません。

## 7. 動かして確かめる

> **🧪 DEMO — 説明文の例の select・radio・input を本物で動かす**
>
> ボタンを押すと、2〜6 節の例と小さな部品を、文書に付けない div の上に順に作ります。select は `value` を option の値に変えて `change` を、radio は `checked` を入れて `change` を、input は `input` を、IME は `compositionstart`・`compositionend` を直接送ります。このページの URL・履歴・入力欄は変わりません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-accessors)

> **🧪 記録 — radio の name と formControlName が違うとき（Node、domino の上の JIT）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-accessors)

本番では `_checkName` の例外が出ず、`name` の `'drink'` がグループの名前になります。上の表のほかの結果は、Node の開発モードと本番で同じでした（Node の domino には `selectedIndex` と `selectedOptions` が無いので、select の行は表の値をこのページの結果で読んでいます）。

## ここまでの呼び出し

- 👤 `<input type="radio" [formControl]="a" value="x">` の `change` — 利用者の操作
  - `RadioControlValueAccessor.onChange()` → `fn(this.value)` → `_registry.select(this)` — radio\_control\_value\_accessor.ts 219–222
    - `_isSameGroup(c, accessor)` — 92–100 — *\_parent も name も一致*
    - `c[1].fireUncheck(accessor.value)` → `writeValue(value)` — 260–262 / 208–211 — *同じ値なら checked = true*
- 👤 `<option [value]="2">` を選ぶ — select の change
  - `onChange(valueString)` → `_getOptionValue('2')` — select\_control\_value\_accessor.ts — *\_optionMap に無いので文字列*
- 👤 `compositionstart` → `input` → `compositionend` — IME
  - `_handleInput`（合成中は捨てる）→ `_compositionEnd` → `onChange` — default\_value\_accessor.ts 126–141

## テストと直し方

### spec と it

| 説明文の約束 | spec（packages/forms/test/ から） |
| --- | --- |
| 2 節 compareWith | `value_accessor_integration_spec.ts` の `describe('select controls')`（219 行目）› 261 `should compare options using provided compareWith function`・272 `should support re-assigning the options array with compareWith`、template 版は 413 行目、select multiple は 501・598 行目 |
| 4 節 `[value]` と `compareWith` | `[value]` の option で `compareWith` が呼ばれないこと、select multiple の `[value]` が型を残すことを確かめる it は無い |
| 5 節 radio の組 | 同じファイルの `describe('should support <type=radio>')`（616 行目）› 714 `should use formControlName to group radio buttons when name is absent`・769 `should differentiate controls on different levels with the same name`、template 版 899 `should support multiple named <type=radio> groups`。`name` の無い `[formControl]` の radio を 2 組置く it は無い |
| 6 節 IME | `template_integration_spec.ts` の `describe('IME events')`（2530 行目）› 2531 `should determine IME event handling depending on platform by default`・2561 `should hold IME events until compositionend if composition mode`・2589 `should work normally with composition events if composition mode is off` |
| 2 節 例のテンプレート | 説明文の中の ```` ```html ```` の例をコンパイルする spec は無い（90 行目の誤りが残る理由） |

### 手元で走らせた結果

../angular で `pnpm bazel test //packages/forms/test:test --nocache_test_results --test_output=all` は `1153 specs, 0 failures` でした（2026-11-21）。`describe` ごとに絞った件数は[第 10 回](10-fmd-tests-issues.md)の表にあります。

### 直すとしたら

- select\_control\_value\_accessor.ts の 90 行目に空白を 1 つ足し、`<option [ngValue]="country">` にします。
- 4 節は、283〜284 行目と 245〜246 行目の説明文に「1 つの select では DOM の文字列が値になり `compareWith` は使わない。select multiple では渡した値がそのまま値になる」と書き分けると、実装と合います。
- 5 節の radio は、`RadioControlRegistry._isSameGroup`（92〜100 行目）で `_parent` が `null` のときに `NgControl` の `control` まで比べれば、別の `FormControl` の radio が同じグループになりません。spec は value\_accessor\_integration\_spec.ts の `describe('in reactive forms')`（617 行目）に、name の無い 2 組の `[formControl]` の it を足すと固まります。

## 聞かれそうな質問

**Q. select の option に \[value\]="1" と数を渡すと、control の値は数ですか？**

1 つの select では文字列の `'1'` です。`[value]` は DOM に書くだけで、読み戻すのは DOM の文字列だからです。数のまま欲しければ `[ngValue]` にします。select multiple では `[value]` も数のまま残ります（4 節）。

**Q. compareWith は \[value\] の option にも効きますか？**

効きません。`compareWith` は `[ngValue]` で登録した option の表の中だけを比べます。デモでは呼び出しが 0 回でした（4 節）。

**Q. radio に name は要りますか？**

`formControlName` なら要りません（113〜115 行目）。`[formControl]` の radio を同じ画面に 2 組以上置くなら、組ごとに `name` を付けないと、Angular のレジストリが 2 組を 1 つのグループとして扱い、同じ値の radio に `checked` が付きます（5 節）。

**Q. 日本語の入力中に valueChanges が何度も出ませんか？**

Android 以外の既定では出ません。`compositionend` まで溜めて 1 回だけ出します。`COMPOSITION_BUFFER_MODE` に `false` を provide すると、合成中の `input` ごとに出ます（6 節）。

**Q. compareWith の説明文の例をそのまま貼ったら？**

90 行目の `<option[ngValue]` の空白抜けで NG5002 になります。`<option [ngValue]` にすれば通ります（2 節）。

## 読み終えて

- select の 2 つの例と radio の例は、コメントどおりに動く。compareWith の例は 90 行目の空白抜けでそのままでは通らない。
- `[value]` は 1 つの select では文字列になり `compareWith` も効かない。select multiple では型が残る。
- `name` の無い `[formControl]` の radio は、別の control どうしでも同じグループになり、説明文では「外す」とされる `fireUncheck` が同じ値の radio を入れる。
- `COMPOSITION_BUFFER_MODE` の既定は Android 以外で `true`。説明文はそれを書いていない。

---

← 前: [テンプレート駆動フォームのディレクティブの説明文](08-fmd-template-dirs.md)  
次: [spec と issue を読む：Forms の説明文を固めているもの](10-fmd-tests-issues.md) →
