[目次](../README.md) › [フォームの内側](README.md) › 第 11 回 / 全 20 回

# 組み込みの value accessor：checkbox・number・select・radio

> CheckboxControlValueAccessor、NumberValueAccessor・RangeValueAccessor の文字列から数への変換、SelectControlValueAccessor が NgSelectOption の ngValue を自分の \_optionMap（id → 値）に登録し、compareWith で選ばれた項目を探す行、SelectMultipleControlValueAccessor、RadioControlValueAccessor が RadioControlRegistry で同じ親・同じ name のボタンをそろえる仕組み。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-builtin-accessors)

---

`<input type="checkbox">` の値は `value` ではなく `checked`、`type="number"` の `value` は数ではなく文字列、`<select>` の `value` は文字列しか持てない。DOM のこうした癖を、フォームのパッケージに入っている組み込みの accessor が 1 つずつ吸収しています。この章では、checkbox・number・range・select・select multiple・radio の accessor が、どの要素に付き、どのイベントを聞き、値をどう変換しているかを行で確かめます。特に、select がオブジェクトの値を扱うための `_optionMap` と `compareWith`、radio が同じグループのボタンをそろえる `RadioControlRegistry` を詳しく読みます。

読む対象は `packages/forms/src/directives/` の `checkbox_value_accessor.ts`・`number_value_accessor.ts`・`range_value_accessor.ts`・ `select_control_value_accessor.ts`・`select_multiple_control_value_accessor.ts`・`radio_control_value_accessor.ts`、テストは `packages/forms/test/value_accessor_integration_spec.ts` です。

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
11. **11. 組み込みの accessor**（この章）
12. [12. リアクティブのディレクティブ](12-forms-reactive-directives.md)
13. [13. NgModel と NgForm](13-forms-ng-model.md)
14. [14. 検証のディレクティブ](14-forms-validator-directives.md)
15. [15. 状態クラス](15-forms-status-classes.md)
16. [16. Signal Forms のスキーマ](16-forms-sf-schema.md)
17. [17. Signal Forms の検証](17-forms-sf-validation.md)
18. [18. 状態ルールと metadata](18-forms-sf-rules-metadata.md)
19. [19. submit と相互運用](19-forms-sf-submit-compat.md)
20. [20. issue と PR を読む](20-forms-issues.md)

## 0. 一覧：どの要素に、どの accessor が付くか

どの accessor も `BuiltInControlValueAccessor` を継承し（[第 9 回の 2 節](09-forms-value-accessor.md)）、selector の最後に `[formControlName]`・`[formControl]`・`[ngModel]` のどれかが付きます。`:not([ngNoCva])` も全部に付いています。下の表はその前の部分と、聞くイベントです。

| accessor | 要素（selector の前半） | 聞くイベント | control に入る値 |
| --- | --- | --- | --- |
| `DefaultValueAccessor` | `input:not([type=checkbox])`・`textarea`・`[ngDefaultControl]` | input・blur・composition | 文字列 |
| `CheckboxControlValueAccessor` | `input[type=checkbox]` | change・blur | `checked`（真偽値） |
| `NumberValueAccessor` | `input[type=number]` | input・blur | 数、空なら `null` |
| `RangeValueAccessor` | `input[type=range]` | change・input・blur | 数、空なら `null` |
| `SelectControlValueAccessor` | `select:not([multiple])` | change・blur | `ngValue` の値そのもの（`value` なら文字列） |
| `SelectMultipleControlValueAccessor` | `select[multiple]` | change・blur | 選ばれた値の配列 |
| `RadioControlValueAccessor` | `input[type=radio]` | change・blur | そのボタンの `value` 入力の値 |

`DefaultValueAccessor` の selector は checkbox しか除外していないので、number・range・radio の input には**組み込みと既定の 2 つ**が付きます。どちらを使うかは `selectValueAccessor` が「組み込みが勝つ」で決めます（第 9 回の 6 節）。使われない方の `DefaultValueAccessor` も `input` イベントを聞いていますが、`registerOnChange` されないので、`onChange` は最初の「何もしない関数」のままです。

## 1. checkbox：value ではなく checked

📄 `angular/packages/forms/src/directives/checkbox_value_accessor.ts` L46–64 （▶ の行: 48–49, 54, 61–62）

```ts
46 │ @Directive({
47 │   selector:
48 ▶     'input[type=checkbox]:not([ngNoCva])[formControlName],input[type=checkbox]:not([ngNoCva])[formControl],input[type=checkbox]:not([ngNoCva])[ngModel]',
49 ▶   host: {'(change)': 'onChange($any($event.target).checked)', '(blur)': 'onTouched()'},
50 │   providers: [CHECKBOX_VALUE_ACCESSOR],
51 │   standalone: false,
52 │ })
53 │ export class CheckboxControlValueAccessor
54 ▶   extends BuiltInControlValueAccessor
55 │   implements ControlValueAccessor
56 │ {
57 │   /**
58 │    * Sets the "checked" property on the input element.
59 │    * @docs-private
60 │    */
61 ▶   writeValue(value: any): void {
62 ▶     this.setProperty('checked', value);
63 │   }
64 │ }
```

49 行目、聞くのは `input` ではなく `change` で、渡すのは `$event.target.checked`（真偽値）です。61〜62 行目の `writeValue` も `checked` プロパティを書きます。`registerOnChange` は親（`BaseControlValueAccessor`）のものをそのまま使うので、変換はありません。`setValue('yes')` のように真偽値でないものを渡すと、`checked` には JavaScript の真偽の判定で入り、control の値は `'yes'` のまま残ります。

## 2. number と range：文字列から数へ

📄 `angular/packages/forms/src/directives/number_value_accessor.ts` L47–77 （▶ の行: 49–50, 62, 64–65, 72–74）

```ts
47 │ @Directive({
48 │   selector:
49 ▶     'input[type=number]:not([ngNoCva])[formControlName],input[type=number]:not([ngNoCva])[formControl],input[type=number]:not([ngNoCva])[ngModel]',
50 ▶   host: {'(input)': 'onChange($any($event.target).value)', '(blur)': 'onTouched()'},
51 │   providers: [NUMBER_VALUE_ACCESSOR],
52 │   standalone: false,
53 │ })
54 │ export class NumberValueAccessor
55 │   extends BuiltInControlValueAccessor
56 │   implements ControlValueAccessor
57 │ {
58 │   /**
59 │    * Sets the "value" property on the input element.
60 │    * @docs-private
61 │    */
62 ▶   writeValue(value: number): void {
63 │     // The value needs to be normalized for IE9, otherwise it is set to 'null' when null
64 ▶     const normalizedValue = value == null ? '' : value;
65 ▶     this.setProperty('value', normalizedValue);
66 │   }
67 │ 
68 │   /**
69 │    * Registers a function called when the control value changes.
70 │    * @docs-private
71 │    */
72 ▶   override registerOnChange(fn: (_: number | null) => void): void {
73 ▶     this.onChange = (value) => {
74 ▶       fn(value == '' ? null : parseFloat(value));
75 │     };
76 │   }
77 │ }
```

1. **50 行目：input を聞く**

   DOM の `value` は `type="number"` でも文字列です。それをそのまま `onChange` に渡します。
2. **72〜74 行目：registerOnChange で変換を挟む**

   親の `registerOnChange` を上書きして、渡された `fn` を包みます。74 行目、空文字なら `null`、そうでなければ `parseFloat` した数を `fn` に渡します。変換は「受け取った関数を包む」ことで入るので、50 行目の host は第 9 回の基底クラスと同じ `onChange` を呼ぶだけで済んでいます。
3. **62〜65 行目：writeValue**

   `null` / `undefined` は空文字にして `value` に書きます。数は文字列に変換して書かれます。

📄 `angular/packages/forms/src/directives/range_value_accessor.ts` L47–79 （▶ の行: 51–53, 66–67, 74–76）

```ts
47 │ @Directive({
48 │   selector:
49 │     'input[type=range]:not([ngNoCva])[formControlName],input[type=range]:not([ngNoCva])[formControl],input[type=range]:not([ngNoCva])[ngModel]',
50 │   host: {
51 ▶     '(change)': 'onChange($any($event.target).value)',
52 ▶     '(input)': 'onChange($any($event.target).value)',
53 ▶     '(blur)': 'onTouched()',
54 │   },
55 │   providers: [RANGE_VALUE_ACCESSOR],
56 │   standalone: false,
57 │ })
58 │ export class RangeValueAccessor
59 │   extends BuiltInControlValueAccessor
60 │   implements ControlValueAccessor
61 │ {
62 │   /**
63 │    * Sets the "value" property on the input element.
64 │    * @docs-private
65 │    */
66 ▶   writeValue(value: any): void {
67 ▶     this.setProperty('value', parseFloat(value));
68 │   }
69 │ 
70 │   /**
71 │    * Registers a function called when the control value changes.
72 │    * @docs-private
73 │    */
74 ▶   override registerOnChange(fn: (_: number | null) => void): void {
75 ▶     this.onChange = (value) => {
76 ▶       fn(value == '' ? null : parseFloat(value));
77 │     };
78 │   }
79 │ }
```

range は 51〜52 行目で `change` と `input` の両方を聞きます。つまみを動かしている間（`input`）も、離したとき（`change`）も `onChange` が呼ばれます。74〜76 行目の変換は number と同じです。違うのは 66〜67 行目で、`writeValue` でも `parseFloat` してから書きます。

## 3. select：文字列しか持てない value に、オブジェクトを載せる

`<option>` の `value` は文字列です。`[ngValue]="{ id: 1 }"` のようなオブジェクトをそのまま DOM に書くことはできません。そこで `SelectControlValueAccessor` は、option ごとに id を振り、**id → 本当の値**の Map を自分で持ちます。

📄 `angular/packages/forms/src/directives/select_control_value_accessor.ts` L107–125 （▶ の行: 109–110, 119, 122, 125）

```ts
107 │ @Directive({
108 │   selector:
109 ▶     'select:not([multiple]):not([ngNoCva])[formControlName],select:not([multiple]):not([ngNoCva])[formControl],select:not([multiple]):not([ngNoCva])[ngModel]',
110 ▶   host: {'(change)': 'onChange($any($event.target).value)', '(blur)': 'onTouched()'},
111 │   providers: [SELECT_VALUE_ACCESSOR],
112 │   standalone: false,
113 │ })
114 │ export class SelectControlValueAccessor
115 │   extends BuiltInControlValueAccessor
116 │   implements ControlValueAccessor
117 │ {
118 │   /** @docs-private */
119 ▶   value: any;
120 │ 
121 │   /** @internal */
122 ▶   _optionMap: Map<string, any> = new Map<string, any>();
123 │ 
124 │   /** @internal */
125 ▶   _idCounter: number = 0;
```

109 行目、`multiple` の無い `select` に付き、110 行目で `change` の `$event.target.value`（文字列）を渡します。122 行目の `_optionMap` が id → 値の Map、125 行目の `_idCounter` が id の通し番号です。option 側の `NgSelectOption` は selector が `option` で、コンストラクタで親の select の accessor を `@Host()` で探し、`_registerOption()` で id をもらいます。

📄 `angular/packages/forms/src/directives/select_control_value_accessor.ts` L268–279 （▶ の行: 273, 275–278）

```ts
268 │   /**
269 │    * @description
270 │    * Tracks the value bound to the option element. Unlike the value binding,
271 │    * ngValue supports binding to objects.
272 │    */
273 ▶   @Input('ngValue')
274 │   set ngValue(value: any) {
275 ▶     if (this._select == null) return;
276 ▶     this._select._optionMap.set(this.id, value);
277 ▶     this._setElementValue(_buildValueString(this.id, value));
278 ▶     this._select._writeValueAfterRender();
279 │   }
```

`[ngValue]` が入ると、276 行目で Map に「自分の id → 値」を入れ、277 行目で DOM の `value` には次の `_buildValueString` で作った文字列を書きます。278 行目、option が増えたり値が変わったりしたので、select の選択を描画のあとで書き直す予約をします（下の 173 行目）。275 行目、親の select に accessor が無い（フォームにつながっていない select）なら何もしません。

📄 `angular/packages/forms/src/directives/select_control_value_accessor.ts` L35–49 （▶ の行: 42–44, 48）

```ts
35 │ const SELECT_VALUE_ACCESSOR: Provider = {
36 │   provide: NG_VALUE_ACCESSOR,
37 │   useExisting: forwardRef(() => SelectControlValueAccessor),
38 │   multi: true,
39 │ };
40 │ 
41 │ function _buildValueString(id: string | null, value: any): string {
42 ▶   if (id == null) return `${value}`;
43 ▶   if (value && typeof value === 'object') value = 'Object';
44 ▶   return `${id}: ${value}`.slice(0, 50);
45 │ }
46 │ 
47 │ function _extractId(valueString: string): string {
48 ▶   return valueString.split(':')[0];
49 │ }
```

43 行目、値がオブジェクトなら文字列の部分は `'Object'` になり、44 行目で `"1: Object"` のような形（最大 50 文字）になります。DOM には「id: 中身の要約」が載り、読み戻すときは 48 行目で `:` の前の id だけを取り出します。42 行目、id が無いときは値を文字列にしたものそのままです。

📄 `angular/packages/forms/src/directives/select_control_value_accessor.ts` L198–236 （▶ の行: 199–205, 213–215, 226–227, 234–235）

```ts
198 │   writeValue(value: any): void {
199 ▶     // TODO(atscott): This could likely be optimized more by only marking for check if the value is changed
200 ▶     // note that this needs to include both the internal value and the value in the DOM.
201 ▶     this.cdr.markForCheck();
202 ▶     this.value = value;
203 ▶     const id: string | null = this._getOptionId(value);
204 ▶     const valueString = _buildValueString(id, value);
205 ▶     this.setProperty('value', valueString);
206 │   }
207 │ 
208 │   /**
209 │    * Registers a function called when the control value changes.
210 │    * @docs-private
211 │    */
212 │   override registerOnChange(fn: (value: any) => any): void {
213 ▶     this.onChange = (valueString: string) => {
214 ▶       this.value = this._getOptionValue(valueString);
215 ▶       fn(this.value);
216 │     };
217 │   }
218 │ 
219 │   /** @internal */
220 │   _registerOption(): string {
221 │     return (this._idCounter++).toString();
222 │   }
223 │ 
224 │   /** @internal */
225 │   _getOptionId(value: any): string | null {
226 ▶     for (const id of this._optionMap.keys()) {
227 ▶       if (this._compareWith(this._optionMap.get(id), value)) return id;
228 │     }
229 │     return null;
230 │   }
231 │ 
232 │   /** @internal */
233 │   _getOptionValue(valueString: string): any {
234 ▶     const id: string = _extractId(valueString);
235 ▶     return this._optionMap.has(id) ? this._optionMap.get(id) : valueString;
236 │   }
```

1. **203 行目：control の値から id を探す（control → select）**

   226〜227 行目、Map を順に回し、`_compareWith(Map の値, 書きたい値)` が `true` になった最初の id を返します。見つからなければ `null`。
2. **204〜205 行目：その id の文字列を select の value に書く**

   `"1: Object"` を `select.value` に書くと、同じ `value` を持つ option が選ばれます。id が `null` なら 42 行目で `"[object Object]"` という文字列になり、どの option とも一致しないので、**何も選ばれない**状態になります。
3. **213〜215 行目：選ばれた文字列から値を引く（select → control）**

   234〜235 行目、`"1: Object"` の `1` で Map を引き、見つかれば本当の値（オブジェクト）を、無ければ文字列をそのまま返します。
4. **201〜202 行目：markForCheck と、値を覚える**

   書くたびに `markForCheck()` を呼びます。199〜200 行目の TODO のとおり、値が変わっていなくても毎回呼んでいて、そこはまだ最適化されていません。202 行目で覚えた値は、下の 187 行目で option が描かれたあとに書き直すときに使います。

📄 `angular/packages/forms/src/directives/select_control_value_accessor.ts` L132–143 （▶ の行: 133–134, 140, 143）

```ts
132 │   @Input()
133 ▶   set compareWith(fn: (o1: any, o2: any) => boolean) {
134 ▶     if (typeof fn !== 'function' && (typeof ngDevMode === 'undefined' || ngDevMode)) {
135 │       throw new RuntimeError(
136 │         RuntimeErrorCode.COMPAREWITH_NOT_A_FN,
137 │         `compareWith must be a function, but received ${JSON.stringify(fn)}`,
138 │       );
139 │     }
140 ▶     this._compareWith = fn;
141 │   }
142 │ 
143 ▶   private _compareWith: (o1: any, o2: any) => boolean = Object.is;
```

143 行目、`_compareWith` の既定は `Object.is`、つまり**同じオブジェクト（同じ参照）**のときだけ一致です。サーバーから取り直したデータのように「中身は同じだが別のオブジェクト」を `setValue` すると、226〜227 行目で見つからず、何も選ばれません。`[compareWith]` に関数を渡すと 140 行目で差し替わります。134 行目、関数でないものを渡すと開発モードでエラーです。

📄 `angular/packages/forms/src/directives/select_control_value_accessor.ts` L153–192 （▶ の行: 153–156, 158–159, 164–165, 170, 173–174, 178, 180, 187, 192）

```ts
153 ▶   /**
154 ▶    * This is needed to efficiently set the select value when adding/removing options. If
155 ▶    * writeValue is instead called for every added/removed option, this results in exponentially
156 ▶    * more _compareValue calls than the number of option elements (issue #41330).
157 │    *
158 ▶    * Secondly, calling writeValue when rendering individual option elements instead of after they
159 ▶    * are all rendered caused an issue in Safari and IE 11 where the first option element failed
160 │    * to be deselected when no option matched the select ngModel. This was because Angular would
161 │    * set the select element's value property before appending the option's child text node to the
162 │    * DOM (issue #14505).
163 │    *
164 ▶    * Finally, this approach is necessary to avoid an issue with delayed element removal when
165 ▶    * using the animations module (in all browsers). Otherwise when a selected option is removed
166 │    * (so no option matches the ngModel anymore), Angular would change the select element value
167 │    * before actually removing the option from the DOM. Then when the option is finally removed
168 │    * from the DOM, the browser would change the select value to that of the first option, even
169 │    * though it doesn't match the ngModel (issue #18430).
170 ▶    *
171 │    * @internal
172 │    */
173 ▶   _writeValueAfterRender(): void {
174 ▶     if (this._queuedWrite || this.appRefInjector.destroyed) {
175 │       return;
176 │     }
177 │ 
178 ▶     this._queuedWrite = true;
179 │ 
180 ▶     afterNextRender(
181 │       {
182 │         write: () => {
183 │           if (this.destroyRef.destroyed) {
184 │             return;
185 │           }
186 │           this._queuedWrite = false;
187 ▶           this.writeValue(this.value);
188 │         },
189 │       },
190 │       {injector: this.appRefInjector},
191 │     );
192 ▶   }
```

178 行目で「予約済み」の印を立て、174 行目で 2 回目以降の予約を捨て、180 行目の `afterNextRender` で描画のあとに 1 回だけ、187 行目で覚えておいた値を書き直します。理由は 153〜170 行目の doc コメントに 3 つ書かれています。154〜156 行目、option を 1 つ足すたびに `writeValue` すると、比べる回数が option の数より急に増える。158〜159 行目、option を 1 つ描くたびに書くと、option の文字がまだ DOM に入る前に select の値を書いてしまい、Safari などで選択が外れなかった。164〜165 行目、アニメーションで option の削除が遅れると、消える前に値を書いてしまい、消えたあとでブラウザが最初の option を選んでしまった。どれも issue 番号つきで書かれています。issue の探し方と読み方は[第 20 回](20-forms-issues.md)で扱います。

## 4. select multiple：配列と selectedOptions

📄 `angular/packages/forms/src/directives/select_multiple_control_value_accessor.ts` L127–142 （▶ の行: 130, 132, 134, 137–138, 141）

```ts
127 │   writeValue(value: any): void {
128 │     this.value = value;
129 │     let optionSelectedStateSetter: (opt: ɵNgSelectMultipleOption, id: string) => void;
130 ▶     if (Array.isArray(value)) {
131 │       // convert values to ids
132 ▶       const ids = value.map((v) => this._getOptionId(v));
133 │       optionSelectedStateSetter = (opt, id) => {
134 ▶         opt._setSelected(ids.indexOf(id) > -1);
135 │       };
136 │     } else {
137 ▶       optionSelectedStateSetter = (opt) => {
138 ▶         opt._setSelected(false);
139 │       };
140 │     }
141 ▶     this._optionMap.forEach(optionSelectedStateSetter);
142 │   }
```

multiple の方は、DOM の `value` では複数の選択を表せないので、option の `selected` を 1 つずつ書きます。130 行目、値が配列なら、132 行目で各要素を id に変え（比べ方は 1 つの select と同じ `_compareWith`）、134 行目でその id の option だけ `selected` にします。137〜138 行目、配列でなければ全部の選択を外します。141 行目で Map の全 option に適用します。

📄 `angular/packages/forms/src/directives/select_multiple_control_value_accessor.ts` L149–160 （▶ の行: 150, 152, 157）

```ts
149 │   override registerOnChange(fn: (value: any) => any): void {
150 ▶     this.onChange = (element: HTMLSelectElement) => {
151 │       const selected: Array<any> = [];
152 ▶       const selectedOptions = element.selectedOptions;
153 │       if (selectedOptions !== undefined) {
154 │         const options = selectedOptions;
155 │         for (let i = 0; i < options.length; i++) {
156 │           const opt = options[i];
157 ▶           const val = this._getOptionValue(opt.value);
158 │           selected.push(val);
159 │         }
160 │       }
```

読む方向では、host が `onChange($event.target)` で要素そのものを渡し（150 行目の `element`）、152 行目で `selectedOptions`（選ばれている option の一覧）を回して、157 行目で 1 つずつ Map から値を引きます。この accessor の Map は値ではなく option のディレクティブ自身を持っていて、値はその `_value` です。

## 5. radio：同じグループのボタンを、レジストリでそろえる

📄 `angular/packages/forms/src/directives/radio_control_value_accessor.ts` L123–133 （▶ の行: 125–126, 131）

```ts
123 │ @Directive({
124 │   selector:
125 ▶     'input[type=radio]:not([ngNoCva])[formControlName],input[type=radio]:not([ngNoCva])[formControl],input[type=radio]:not([ngNoCva])[ngModel]',
126 ▶   host: {'(change)': 'onChange()', '(blur)': 'onTouched()'},
127 │   providers: [RADIO_VALUE_ACCESSOR],
128 │   standalone: false,
129 │ })
130 │ export class RadioControlValueAccessor
131 ▶   extends BuiltInControlValueAccessor
132 │   implements ControlValueAccessor, OnDestroy, OnInit
133 │ {
```

radio は、ボタン 1 つごとに accessor が 1 つ付きます。3 つのボタンを同じ control につなげば、accessor は 3 つです。126 行目、`change` で引数なしの `onChange()` を呼びます。値は DOM からではなく、そのボタンの `value` 入力から取ります（下の 220 行目）。

📄 `angular/packages/forms/src/directives/radio_control_value_accessor.ts` L192–223 （▶ の行: 194–196, 201, 209–210, 218–221）

```ts
192 │   /** @docs-private */
193 │   ngOnInit(): void {
194 ▶     this._control = this._injector.get(NgControl);
195 ▶     this._checkName();
196 ▶     this._registry.add(this._control, this);
197 │   }
198 │ 
199 │   /** @docs-private */
200 │   ngOnDestroy(): void {
201 ▶     this._registry.remove(this);
202 │   }
203 │ 
204 │   /**
205 │    * Sets the "checked" property value on the radio input element.
206 │    * @docs-private
207 │    */
208 │   writeValue(value: any): void {
209 ▶     this._state = value === this.value;
210 ▶     this.setProperty('checked', this._state);
211 │   }
212 │ 
213 │   /**
214 │    * Registers a function called when the control value changes.
215 │    * @docs-private
216 │    */
217 │   override registerOnChange(fn: (_: any) => {}): void {
218 ▶     this._fn = fn;
219 ▶     this.onChange = () => {
220 ▶       fn(this.value);
221 ▶       this._registry.select(this);
222 │     };
223 │   }
```

1. **194〜196 行目：ngOnInit でレジストリに登録**

   同じ要素の `NgControl`（`[formControl]` など）を取り、名前を確かめ（下の `_checkName`）、レジストリに「control と自分」の組で登録します。201 行目、破棄で外します。
2. **209〜210 行目：writeValue は「自分の値と同じか」**

   control の値と自分の `value` を `===` で比べ、同じなら `checked`。select と違って `compareWith` はありません。
3. **219〜221 行目：押されたら、自分の値を送ってから、他を外す**

   220 行目で自分の `value` を control に送り、221 行目でレジストリに「自分が選ばれた」と知らせます。

221 行目が要るのは、[第 10 回](10-forms-setup-control.md)で見たとおり、入力欄から来た値の `setValue` は `emitModelToViewChange: false` で、同じ control につながった他のボタンの `writeValue` が呼ばれないからです。他のボタンの `checked` を外すのは、レジストリの役目です。

📄 `angular/packages/forms/src/directives/radio_control_value_accessor.ts` L55–65 （▶ の行: 55, 57, 63–64）

```ts
55 ▶ @Service()
56 │ export class RadioControlRegistry {
57 ▶   private _accessors: [NgControl, RadioControlValueAccessor][] = [];
58 │ 
59 │   /**
60 │    * @description
61 │    * Adds a control to the internal registry. For internal use only.
62 │    */
63 ▶   add(control: NgControl, accessor: RadioControlValueAccessor) {
64 ▶     this._accessors.push([control, accessor]);
65 │   }
```

55 行目の `@Service()` は v22 のデコレータで、`providedIn: 'root'` のサービスとして自動で provide されます。レジストリはアプリに 1 つで、57 行目の配列に**アプリ中の全部の radio**が入ります。

📄 `angular/packages/forms/src/directives/radio_control_value_accessor.ts` L84–100 （▶ の行: 85–87, 96, 98）

```ts
 84 │   select(accessor: RadioControlValueAccessor) {
 85 ▶     this._accessors.forEach((c) => {
 86 ▶       if (this._isSameGroup(c, accessor) && c[1] !== accessor) {
 87 ▶         c[1].fireUncheck(accessor.value);
 88 │       }
 89 │     });
 90 │   }
 91 │ 
 92 │   private _isSameGroup(
 93 │     controlPair: [NgControl, RadioControlValueAccessor],
 94 │     accessor: RadioControlValueAccessor,
 95 │   ): boolean {
 96 ▶     if (!controlPair[0].control) return false;
 97 │     return (
 98 ▶       controlPair[0]._parent === accessor._control._parent && controlPair[1].name === accessor.name
 99 │     );
100 │   }
```

85 行目で全部を回し、86 行目で「同じグループで、自分以外」に 87 行目の `fireUncheck`（中身は `writeValue`）を呼びます。渡すのは選ばれた値なので、209 行目の比較で外れ、`checked` が `false` になります。同じグループかどうかは 98 行目、**親（`_parent`、つまり同じ `formGroup` など）が同じで、`name` が同じ**こと。96 行目、control の無いものは外します。

📄 `angular/packages/forms/src/directives/radio_control_value_accessor.ts` L264–274 （▶ の行: 266–268, 271, 273）

```ts
264 │   private _checkName(): void {
265 │     if (
266 ▶       this.name &&
267 ▶       this.formControlName &&
268 ▶       this.name !== this.formControlName &&
269 │       (typeof ngDevMode === 'undefined' || ngDevMode)
270 │     ) {
271 ▶       throwNameError();
272 │     }
273 ▶     if (!this.name && this.formControlName) this.name = this.formControlName;
274 │   }
```

266〜271 行目、`name` と `formControlName` の両方を書いて値が違えば、開発モードでエラーです。273 行目、`name` を書かずに `formControlName` だけなら、`formControlName` を `name` として使います。98 行目の比較に使うのはこの `name` です。

## 6. デモ：本物の組み込み accessor

> **🧪 DEMO — control の値と typeof**
>
> 全部、この章の .ts の 1 つの `FormGroup` の control につないだ本物の accessor です（radio だけは `[formControl]`、他は `formControlName`）。number を空にすると `null`、range を動かすと数、select の 2 つは片方だけ `compareWith` 付きです。
>
> 「新しいオブジェクト」のボタンでは、control の値は両方とも `{"id":2,...}` になりますが、A の DOM は `selectedIndex=-1`（何も選ばれていない）になります。B は `compareWith` で id を比べるので「みかん」が選ばれます。「同じ参照」のボタンなら両方で「ぶどう」が選ばれます。number に `'42'` を `setValue` すると、control の値は文字列のままです（変換は入力欄 → control の向きにしか無い）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-builtin-accessors)

## 聞かれそうな質問

**Q. type="number" の input なのに、control の値が文字列になることがあるのはなぜですか？**

3 つあります。1 つ目は、コードから文字列を `setValue` したとき。2 節の 74 行目の `parseFloat` は入力欄 → control の向きだけで、`writeValue`（62〜65 行目）は変換しないので、control には渡した文字列が残ります（デモのボタン）。2 つ目は、`NumberValueAccessor` が付いていないとき。49 行目の selector は**テンプレートに静的に書いた**`type=number` 属性で一致するので、`[type]="inputType"` のようにバインドで type を決めると一致せず、`DefaultValueAccessor` が使われて文字列が入ります（同じ一時的な spec で、`[type]="t"`（t = 'number'）の入力欄に 5 と打つと `typeof value` は `string`、静的な `type="number"` なら `number` でした）。3 つ目は、`ngNoCva` や自作の accessor を付けて、別の accessor が選ばれたときです（第 9 回の 6 節）。

**Q. select にオブジェクトを渡すとき、何に気をつけますか？**

option には `[value]` ではなく `[ngValue]` を使うことと、比べ方です。`[value]` だと 276 行目の Map に入らないので、235 行目で DOM の文字列がそのまま control に入ります。`[ngValue]` なら値はそのまま戻りますが、control → select の向きは 227 行目の `_compareWith`（既定は 143 行目の `Object.is`）で探すので、同じ参照でないと選ばれません。API から取り直したオブジェクトを使うなら `[compareWith]` に id で比べる関数を渡します。

**Q. radio の name を書き忘れると、どうなりますか？**

`formControlName` を使っていれば、273 行目でその名前が `name` の代わりになるので、Angular の側のグループ分けは動きます。ただし DOM の `name` 属性は付かないので、ブラウザは別々のボタンとして扱います（矢印キーでグループ内を移動する、などのブラウザの radio の振る舞いが無くなる）。`[formControl]` で `name` も無いと、98 行目の比較は「親が同じ（どちらも `null`）で、name も同じ（どちらも `undefined`）」になるので、別々の control につないだ名前の無い radio 同士まで、87 行目でお互いの `checked` を外し合います。外されたほうの control の値は変わらないので、画面と値が食い違います（2026-11-01 にこのサイトの `ng test` で一時的な spec を書いて確かめました。control `a`（値 `'x'`）の radio が、別の control `b` の radio をクリックしただけで外れ、`a.value` は `'x'` のまま）。radio には必ず `name` を書きます。

**Q. checkbox の値を true / false 以外（'yes' / 'no' など）にできますか？**

組み込みの `CheckboxControlValueAccessor` ではできません。49 行目で `checked`（真偽値）をそのまま送り、変換を挟む `registerOnChange` の上書きもありません。別の値にしたいときは、自作の accessor を書くか（第 9 回）、control の値を読む側で変換します。

## テストと直し方

組み込みの accessor は `value_accessor_integration_spec.ts` の `describe('value accessors')` の下に、要素ごとの describe があります （`should support <type=number>`・`select controls`・`select multiple controls`・`should support <type=radio>`・`should support <type=range>` など）。number を空にすると `null` になることを確かめているのがこの it です。

📄 `angular/packages/forms/test/value_accessor_integration_spec.ts` L169–187 （▶ の行: 176–177, 179–180, 182–183, 186）

```ts
169 │     it('when value is cleared in the UI', async () => {
170 │       const fixture = initTest(FormControlNumberInput);
171 │       const control = new FormControl(10, Validators.required);
172 │       fixture.componentInstance.control = control;
173 │       await fixture.whenStable();
174 │ 
175 │       const input = fixture.debugElement.query(By.css('input'));
176 ▶       input.nativeElement.value = '';
177 ▶       dispatchEvent(input.nativeElement, 'input');
178 │ 
179 ▶       expect(control.valid).toBe(false);
180 ▶       expect(control.value).toEqual(null);
181 │ 
182 ▶       input.nativeElement.value = '0';
183 ▶       dispatchEvent(input.nativeElement, 'input');
184 │ 
185 │       expect(control.valid).toBe(true);
186 ▶       expect(control.value).toEqual(0);
187 │     });
```

176〜177 行目で入力欄を空にして `input` を起こし、180 行目で値が `null`（2 節の 74 行目の前半）、179 行目で `required` に引っかかることを確かめます。182〜183 行目で `'0'` を入れ、186 行目で数の `0`（74 行目の後半の `parseFloat`）になることを確かめています。

📄 `ターミナル（../angular で実行）`

```
$ pnpm bazel test //packages/forms/test:test \
    --test_arg=--filter="value accessors should support <type=number>" --test_output=all
...
==================== Test output for //packages/forms/test:test:
Randomized with seed 65892
Started
....

Ran 4 of 1153 specs
4 specs, 0 failures
Finished in 0.045 seconds
...
//packages/forms/test:test                                               PASSED in 0.9s
```

- `<` や `=` は正規表現で特別な意味を持たないので、describe の名前をそのまま使えます。`"value accessors should support <type=number>"` で 4 本が走りました（`Ran 4 of 1153 specs`）。
- 直す場所の入口: 変換は各 accessor の `registerOnChange` / `writeValue`、select の比べ方は `_getOptionId`、radio のグループは `RadioControlRegistry._isSameGroup`。足すテストは同じファイルの、その要素の describe の中です。select には `in reactive forms` と `in template-driven forms` の 2 つがあり、両方に足すのが慣習です。
- select の option と `compareWith` の組み合わせは、テストの数が多い（describe が 2 か所に分かれている）ところです。issue で「option を差し替えると選択が消える」といった報告を読むときは、3 節の 153〜192 行目（描画のあとの書き直しと、その doc コメントにある 3 つの issue）が入口になります。PR は出さず、手元で読む・壊して確かめるまでにします（[第 20 回](20-forms-issues.md)）。

## 読み終えて

- 組み込みの accessor は selector で要素の種類を、host でイベントを、`registerOnChange` の上書きで変換を決める。変換は入力欄 → control の向きにだけある。
- number・range・radio の input には `DefaultValueAccessor` も付くが、`selectValueAccessor` で組み込みが勝つ。
- select は option に id を振り、`_optionMap`（id → 値）と `"id: 要約"` の文字列でオブジェクトを運ぶ。control → select は `compareWith`（既定 `Object.is`）で探す。
- radio はボタンごとに accessor があり、アプリに 1 つの `RadioControlRegistry` が「同じ親・同じ name」の他のボタンを外す。

---

← 前: [setUpControlValueAccessor：control と入力欄を双方向につなぐ配線](10-forms-setup-control.md)  
次: [リアクティブのディレクティブ：formControl・formGroup・formControlName](12-forms-reactive-directives.md) →
