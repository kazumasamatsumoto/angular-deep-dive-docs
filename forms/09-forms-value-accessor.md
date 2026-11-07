[目次](../README.md) › [フォームの内側](README.md) › 第 9 回 / 全 20 回

# ControlValueAccessor：入力欄と control の通訳

> writeValue・registerOnChange・registerOnTouched・setDisabledState の 4 つの約束、NG\_VALUE\_ACCESSOR トークン、BaseControlValueAccessor と BuiltInControlValueAccessor、DefaultValueAccessor が input イベントと IME の compositionstart / compositionend を扱う行。selectValueAccessor が「組み込み・既定・自作」の中から 1 つを選ぶ順番。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-value-accessor)

---

`FormControl` は DOM を知りません。`<input>` の `value` を書くのも、`input` イベントを聞くのも、間に立つ **ControlValueAccessor**（以下 accessor）の仕事です。この章では、accessor が守る 4 つのメソッド、accessor を探すための `NG_VALUE_ACCESSOR` トークン、全部の組み込み accessor の親である `BaseControlValueAccessor`、いちばんよく使われる `DefaultValueAccessor` が日本語入力（IME）を待つ行、そして 1 つの要素に accessor が何個も付いたときに `selectValueAccessor` が 1 つを選ぶ順番を読みます。

読む対象は `packages/forms/src/directives/` の `control_value_accessor.ts`・`default_value_accessor.ts`・ `shared.ts`（`selectValueAccessor`）・`ng_control.ts`（呼び出し元）、テストは `packages/forms/test/directives_spec.ts` です。

1. [1. 全体像](01-forms-overview.md)
2. [2. AbstractControl](02-forms-abstract-control.md)
3. [3. updateValueAndValidity](03-forms-update-value-validity.md)
4. [4. Validators](04-forms-validators.md)
5. [5. 非同期の検証](05-forms-async-validators.md)
6. [6. events](06-forms-control-events.md)
7. [7. FormGroup と FormArray](07-forms-form-group-array.md)
8. [8. 型付きフォームと FormBuilder](08-forms-typed-forms.md)
9. **9. ControlValueAccessor**（この章）
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

## 0. 全体の流れ

accessor は「通訳」です。`FormControl` は値を JavaScript の値（文字列・数・オブジェクト）で持ち、DOM は `value` や `checked` というプロパティで持ちます。その間を訳すのが accessor で、訳し方の約束が `ControlValueAccessor` インターフェースです。比喩はここまでにして、実物を順に見ます。

1. **accessor が自分を登録する**

   accessor のディレクティブは、自分の要素の注入器に `NG_VALUE_ACCESSOR` を `multi: true` で provide する（3 節・4 節）。
2. **NgControl が集める**

   `[formControl]` などのディレクティブ（`NgControl`）が、同じ要素の `NG_VALUE_ACCESSOR` を配列で受け取る（6 節）。
3. **1 つを選ぶ**

   `selectValueAccessor` が「自作 → 組み込み → 既定」の順で 1 つ選ぶ（6 節）。
4. **配線する**

   `setUpControlValueAccessor` が `writeValue`・`registerOnChange` などを呼んで、両方向をつなぐ（[第 10 回](10-forms-setup-control.md)）。
5. **動く**

   DOM のイベントで accessor が登録された関数を呼び、control が変わると control が `writeValue` を呼ぶ（4 節・5 節）。

## 1. 4 つの約束：ControlValueAccessor インターフェース

📄 `angular/packages/forms/src/directives/control_value_accessor.ts` L23–44 （▶ の行: 23, 28–29, 44）

````ts
23 ▶ export interface ControlValueAccessor {
24 │   /**
25 │    * @description
26 │    * Writes a new value to the element.
27 │    *
28 ▶    * This method is called by the forms API to write to the view when programmatic
29 ▶    * changes from model to view are requested.
30 │    *
31 │    * @usageNotes
32 │    * ### Write a value to the element
33 │    *
34 │    * The following example writes a value to the native DOM element.
35 │    *
36 │    * ```ts
37 │    * writeValue(value: any): void {
38 │    *   this._renderer.setProperty(this._elementRef.nativeElement, 'value', value);
39 │    * }
40 │    * ```
41 │    *
42 │    * @param obj The new value for the element
43 │    */
44 ▶   writeValue(obj: any): void;
````

23 行目、`ControlValueAccessor` はクラスではなく `interface` です。実行時には何も残らないので、「accessor かどうか」は型ではなく、後で見る DI トークンで決まります。44 行目の `writeValue` は **control → 入力欄**の向きです。28〜29 行目の説明のとおり、プログラムから値を変えたとき（`setValue` など）にフォームの側が呼びます。

📄 `angular/packages/forms/src/directives/control_value_accessor.ts` L68–79 （▶ の行: 72–74, 79）

````ts
68 │    * When the value changes in the UI, call the registered
69 │    * function to allow the forms API to update itself:
70 │    *
71 │    * ```ts
72 ▶    * host: {
73 ▶    *    '(change)': '_onChange($event.target.value)'
74 ▶    * }
75 │    * ```
76 │    *
77 │    * @param fn The callback function to register
78 │    */
79 ▶   registerOnChange(fn: any): void;
````

79 行目の `registerOnChange` は**入力欄 → control**の向きの入口です。フォームの側が関数を 1 つ渡してくるので、accessor はそれを覚えておき、72〜74 行目の例のように DOM のイベントでその関数を呼びます。accessor は自分から control を触りません。渡された関数を呼ぶだけです。

📄 `angular/packages/forms/src/directives/control_value_accessor.ts` L101–132 （▶ の行: 105–107, 112, 116–118, 131）

````ts
101 │    * On blur (or equivalent), your class should call the registered function to allow
102 │    * the forms API to update itself:
103 │    *
104 │    * ```ts
105 ▶    * host: {
106 ▶    *    '(blur)': '_onTouched()'
107 ▶    * }
108 │    * ```
109 │    *
110 │    * @param fn The callback function to register
111 │    */
112 ▶   registerOnTouched(fn: any): void;
113 │ 
114 │   /**
115 │    * @description
116 ▶    * Function that is called by the forms API when the control status changes to
117 ▶    * or from 'DISABLED'. Depending on the status, it enables or disables the
118 ▶    * appropriate DOM element.
119 │    *
120 │    * @usageNotes
121 │    * The following is an example of writing the disabled property to a native DOM element:
122 │    *
123 │    * ```ts
124 │    * setDisabledState(isDisabled: boolean): void {
125 │    *   this._renderer.setProperty(this._elementRef.nativeElement, 'disabled', isDisabled);
126 │    * }
127 │    * ```
128 │    *
129 │    * @param isDisabled The disabled status to set on the element
130 │    */
131 ▶   setDisabledState?(isDisabled: boolean): void;
132 │ }
````

112 行目の `registerOnTouched` も同じ形で、105〜107 行目の例のように `blur` で呼ぶ関数を受け取ります。131 行目の `setDisabledState` だけ名前の後ろに `?` があり、**実装しなくてよい**メソッドです。116〜118 行目のとおり、control が `DISABLED` になったとき・戻ったときに呼ばれます。

| メソッド | 向き | 誰がいつ呼ぶか |
| --- | --- | --- |
| `writeValue(obj)` | control → 入力欄 | フォームの側。配線した直後と、`setValue` のたび |
| `registerOnChange(fn)` | 入力欄 → control | フォームの側が配線のときに 1 回。`fn` は accessor が DOM のイベントで呼ぶ |
| `registerOnTouched(fn)` | 入力欄 → control（touched） | 同上。`fn` は accessor が `blur` などで呼ぶ |
| `setDisabledState?(b)` | control → 入力欄 | フォームの側。配線した直後と、`disable()` / `enable()` のたび |

## 2. 組み込みの親：BaseControlValueAccessor と BuiltInControlValueAccessor

📄 `angular/packages/forms/src/directives/control_value_accessor.ts` L141–168 （▶ の行: 141, 148, 154, 157–158, 166–167）

```ts
141 ▶ @Directive()
142 │ export class BaseControlValueAccessor {
143 │   /**
144 │    * The registered callback function called when a change or input event occurs on the input
145 │    * element.
146 │    * @docs-private
147 │    */
148 ▶   onChange = (_: any) => {};
149 │ 
150 │   /**
151 │    * The registered callback function called when a blur event occurs on the input element.
152 │    * @docs-private
153 │    */
154 ▶   onTouched = () => {};
155 │ 
156 │   constructor(
157 ▶     private _renderer: Renderer2,
158 ▶     private _elementRef: ElementRef,
159 │   ) {}
160 │ 
161 │   /**
162 │    * Helper method that sets a property on a target element using the current Renderer
163 │    * implementation.
164 │    * @docs-private
165 │    */
166 ▶   protected setProperty(key: string, value: any): void {
167 ▶     this._renderer.setProperty(this._elementRef.nativeElement, key, value);
168 │   }
```

フォームのパッケージに入っている accessor は、全部この `BaseControlValueAccessor` を継承しています。141 行目の `@Directive()` は selector の無いディレクティブで、継承の親として DI の情報を持たせるためのものです。148 行目と 154 行目、`onChange` と `onTouched` は最初は「何もしない関数」です。配線される前に DOM のイベントが来ても、エラーにならずに捨てられます。166〜167 行目の `setProperty` は、DOM の要素に直接代入せず、157〜158 行目で受け取った `Renderer2` を通してプロパティを書きます。

📄 `angular/packages/forms/src/directives/control_value_accessor.ts` L170–205 （▶ の行: 174–175, 182–183, 190–191, 196–199, 204–205）

```ts
170 │   /**
171 │    * Registers a function called when the control is touched.
172 │    * @docs-private
173 │    */
174 ▶   registerOnTouched(fn: () => void): void {
175 ▶     this.onTouched = fn;
176 │   }
177 │ 
178 │   /**
179 │    * Registers a function called when the control value changes.
180 │    * @docs-private
181 │    */
182 ▶   registerOnChange(fn: (_: any) => {}): void {
183 ▶     this.onChange = fn;
184 │   }
185 │ 
186 │   /**
187 │    * Sets the "disabled" property on the range input element.
188 │    * @docs-private
189 │    */
190 ▶   setDisabledState(isDisabled: boolean): void {
191 ▶     this.setProperty('disabled', isDisabled);
192 │   }
193 │ }
194 │ 
195 │ /**
196 ▶  * Base class for all built-in ControlValueAccessor classes (except DefaultValueAccessor, which is
197 ▶  * used in case no other CVAs can be found). We use this class to distinguish between default CVA,
198 ▶  * built-in CVAs and custom CVAs, so that Forms logic can recognize built-in CVAs and treat custom
199 ▶  * ones with higher priority (when both built-in and custom CVAs are present).
200 │  *
201 │  * Note: this is an *internal-only* class and should not be extended or used directly in
202 │  * applications code.
203 │  */
204 ▶ @Directive()
205 ▶ export class BuiltInControlValueAccessor extends BaseControlValueAccessor {}
```

174〜175 行目と 182〜183 行目、`registerOnTouched` と `registerOnChange` は、渡された関数をフィールドに入れるだけです。190〜191 行目、`setDisabledState` は要素の `disabled` プロパティを書きます。204〜205 行目の `BuiltInControlValueAccessor` は**中身が空**のクラスです。196〜199 行目のコメントのとおり、これは目印です。checkbox・number・select などの組み込み accessor はこちらを継承し、`DefaultValueAccessor` だけは継承しません（4 節の 101 行目）。この違いを 6 節の `selectValueAccessor` が使います。

## 3. accessor を探すための DI トークン：NG\_VALUE\_ACCESSOR

📄 `angular/packages/forms/src/directives/control_value_accessor.ts` L207–216 （▶ の行: 214–215）

```ts
207 │ /**
208 │  * Used to provide a `ControlValueAccessor` for form controls.
209 │  *
210 │  * See `DefaultValueAccessor` for how to implement one.
211 │  *
212 │  * @publicApi
213 │  */
214 ▶ export const NG_VALUE_ACCESSOR = new InjectionToken<ReadonlyArray<ControlValueAccessor>>(
215 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'NgValueAccessor' : '',
216 │ );
```

214 行目、型が `ReadonlyArray<ControlValueAccessor>` になっています。このトークンは 1 つの値ではなく、**同じ要素についた accessor の配列**を受け取るためのものです。配列になるのは、provide する側が `multi: true` を付けるからです （[DI の章](../di/10-di.md)）。自作の accessor も、次の節の `DefaultValueAccessor` と同じ形で自分を登録します。

## 4. いちばん使われる accessor：DefaultValueAccessor

📄 `angular/packages/forms/src/directives/default_value_accessor.ts` L27–50 （▶ の行: 27–31, 34–35, 37–39, 48）

```ts
27 ▶ export const DEFAULT_VALUE_ACCESSOR: Provider = {
28 ▶   provide: NG_VALUE_ACCESSOR,
29 ▶   useExisting: forwardRef(() => DefaultValueAccessor),
30 ▶   multi: true,
31 ▶ };
32 │ 
33 │ /**
34 ▶  * We must check whether the agent is Android because composition events
35 ▶  * behave differently between iOS and Android.
36 │  */
37 ▶ function _isAndroid(): boolean {
38 ▶   const userAgent = getDOM() ? getDOM().getUserAgent() : '';
39 ▶   return /android (\d+)/.test(userAgent.toLowerCase());
40 │ }
41 │ 
42 │ /**
43 │  * @description
44 │  * Provide this token to control if form directives buffer IME input until
45 │  * the "compositionend" event occurs.
46 │  * @publicApi
47 │  */
48 ▶ export const COMPOSITION_BUFFER_MODE = new InjectionToken<boolean>(
49 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'CompositionEventMode' : '',
50 │ );
```

27〜31 行目が accessor の登録の形そのものです。`provide: NG_VALUE_ACCESSOR`、`useExisting` で**このディレクティブのインスタンス自身**を指し、`multi: true` で配列に足します。`useExisting` なので新しいインスタンスは作られません。`forwardRef` は、この定数がクラスの宣言より前にあるために必要です。37〜39 行目の `_isAndroid` は User-Agent に `android 数字` が含まれるかを見ます。48 行目の `COMPOSITION_BUFFER_MODE` は、IME の入力を確定まで待つかどうかを利用者が決めるためのトークンです。

📄 `angular/packages/forms/src/directives/default_value_accessor.ts` L86–114 （▶ の行: 87–88, 93–96, 98, 101, 103, 108, 111–113）

```ts
 86 │ @Directive({
 87 ▶   selector:
 88 ▶     'input:not([type=checkbox]):not([ngNoCva])[formControlName],textarea:not([ngNoCva])[formControlName],input:not([type=checkbox]):not([ngNoCva])[formControl],textarea:not([ngNoCva])[formControl],input:not([type=checkbox]):not([ngNoCva])[ngModel],textarea:not([ngNoCva])[ngModel],[ngDefaultControl]',
 89 │   // TODO: vsavkin replace the above selector with the one below it once
 90 │   // https://github.com/angular/angular/issues/3011 is implemented
 91 │   // selector: '[ngModel],[formControl],[formControlName]',
 92 │   host: {
 93 ▶     '(input)': '_handleInput($any($event.target).value)',
 94 ▶     '(blur)': 'onTouched()',
 95 ▶     '(compositionstart)': '_compositionStart()',
 96 ▶     '(compositionend)': '_compositionEnd($any($event.target).value)',
 97 │   },
 98 ▶   providers: [DEFAULT_VALUE_ACCESSOR],
 99 │   standalone: false,
100 │ })
101 ▶ export class DefaultValueAccessor extends BaseControlValueAccessor implements ControlValueAccessor {
102 │   /** Whether the user is creating a composition string (IME events). */
103 ▶   private _composing = false;
104 │ 
105 │   constructor(
106 │     renderer: Renderer2,
107 │     elementRef: ElementRef,
108 ▶     @Optional() @Inject(COMPOSITION_BUFFER_MODE) private _compositionMode: boolean,
109 │   ) {
110 │     super(renderer, elementRef);
111 ▶     if (this._compositionMode == null) {
112 ▶       this._compositionMode = !_isAndroid();
113 ▶     }
114 │   }
```

1. **87〜88 行目：どこに付くか**

   `input`（ただし `type=checkbox` 以外）と `textarea` で、`formControlName`・`formControl`・`ngModel` のどれかがある要素。それと `ngDefaultControl` 属性のある要素です。`type=number` や `type=radio` も除外されていないので、それらの input では**組み込みの accessor と一緒に**付きます（6 節で選び分ける）。`ngNoCva` を書いた要素には付きません。
2. **93〜96 行目：何を聞くか**

   `input` で `_handleInput`、`blur` で `onTouched`、IME の `compositionstart` / `compositionend` で 2 つのメソッド。`change` は聞いていません。
3. **98 行目：自分を登録**

   上の 27〜31 行目の provider を、このディレクティブの `providers` に入れています。
4. **101 行目：親**

   `BaseControlValueAccessor` を直接継承します。`BuiltInControlValueAccessor` ではありません。
5. **108〜113 行目：IME を待つかどうか**

   108 行目、`COMPOSITION_BUFFER_MODE` を `@Optional()` で受けます。誰も provide していなければ `null` なので、111〜112 行目で `!_isAndroid()`、つまり**Android 以外では待つ**（`true`）になります。

📄 `angular/packages/forms/src/directives/default_value_accessor.ts` L116–142 （▶ の行: 121–122, 127–128, 134, 139–140）

```ts
116 │   /**
117 │    * Sets the "value" property on the input element.
118 │    * @docs-private
119 │    */
120 │   writeValue(value: any): void {
121 ▶     const normalizedValue = value == null ? '' : value;
122 ▶     this.setProperty('value', normalizedValue);
123 │   }
124 │ 
125 │   /** @internal */
126 │   _handleInput(value: any): void {
127 ▶     if (!this._compositionMode || (this._compositionMode && !this._composing)) {
128 ▶       this.onChange(value);
129 │     }
130 │   }
131 │ 
132 │   /** @internal */
133 │   _compositionStart(): void {
134 ▶     this._composing = true;
135 │   }
136 │ 
137 │   /** @internal */
138 │   _compositionEnd(value: any): void {
139 ▶     this._composing = false;
140 ▶     this._compositionMode && this.onChange(value);
141 │   }
142 │ }
```

1. **121〜122 行目：writeValue**

   `null` と `undefined` は空文字にしてから `value` に書きます。そのまま書くと入力欄に `null` という文字が出てしまうためです。
2. **134 行目：変換が始まった**

   `compositionstart` で `_composing = true`。
3. **127〜128 行目：変換中の input は捨てる**

   `_compositionMode` が `true` で `_composing` も `true` のときだけ、`onChange` を呼びません。「にほんご」と打っている途中の「に」「にほ」は control に届きません。
4. **139〜140 行目：確定で 1 回送る**

   `compositionend` で `_composing = false` にし、`_compositionMode` が `true` なら、確定した文字列で `onChange` を呼びます。

> [!WARNING]
> **ハマりどころ**
>
> `COMPOSITION_BUFFER_MODE` に `false` を provide すると、127 行目の条件は常に成り立つので、変換中の「に」「にほ」もそのたびに control へ届きます。そのかわり 140 行目は何もしません。検索欄で 1 文字ごとにリクエストを出す、といった処理が変換中に走るのはこの設定のときです。

## 5. デモ：自作の accessor と、本物の DefaultValueAccessor

> **🧪 DEMO 1 — 自作の accessor（★の評価）が呼ばれる順**
>
> この章の .ts で `NG_VALUE_ACCESSOR` に自分を登録した ★ の部品に、本物の `FormControl` を `[formControl]` でつないでいます。ページを開いた時点で、配線の 4 行がすでに積まれています（順番は第 10 回の `setUpControlValueAccessor` そのもの）。★ を押す・ボタンで外から変える・`disable()` して、どのメソッドが呼ばれるかを見てください。
>
> `setValue(3)` では `writeValue(3)` が `valueChanges` より先に出ます。`FormControl.setValue` が、値を入れた直後に登録済みの関数（その先が `writeValue`）を呼び、そのあとで `updateValueAndValidity` から `valueChanges` を流すためです（第 10 回の 3 節）。★ を押したときは `writeValue` が出ません。入力欄から来た値を入力欄に書き戻さないようにしているからです（同じく第 10 回）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-value-accessor)

> **🧪 DEMO 2 — IME の変換中は control に届かない（本物の DefaultValueAccessor）**
>
> ただの `<input [formControl]>` です。日本語入力をオンにして「にほんご」などと打ち、変換してから確定してください。DOM のイベント（この章のテンプレートで聞いたもの）と、`control.valueChanges` を順に積みます。Android 以外では、確定するまで `valueChanges` が出ません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-value-accessor)

## 6. どの accessor を使うか：selectValueAccessor

`<input type="number" [formControl]="c">` には、4 節の `DefaultValueAccessor` と、[第 11 回](11-forms-builtin-accessors.md)の `NumberValueAccessor` の両方が付きます。`FormControlDirective` などの `NgControl` は、コンストラクタで同じ要素の `NG_VALUE_ACCESSOR` を `@Self()` で配列のまま受け取り （[第 12 回](12-forms-reactive-directives.md)）、使うときに 1 つ選びます。

📄 `angular/packages/forms/src/directives/ng_control.ts` L102–111 （▶ の行: 105, 109–110）

```ts
102 │   /**
103 │    * Raw `ControlValueAccessor`s retrieved from DI.
104 │    */
105 ▶   private readonly rawValueAccessors: ControlValueAccessor[] | undefined;
106 │ 
107 │   private _selectedValueAccessor: ControlValueAccessor | null = null;
108 │ 
109 ▶   protected get selectedValueAccessor(): ControlValueAccessor | null {
110 ▶     return (this._selectedValueAccessor ??= selectValueAccessor(this, this.rawValueAccessors));
111 │   }
```

105 行目に DI から来た配列をそのまま持ち、109〜110 行目の getter で、初めて読まれたときに `selectValueAccessor` を 1 回だけ呼びます（`??=`）。選ぶのがコンストラクタではなく後なのは、v22 では accessor を持たない部品（`value` か `checked` という `model()` 入力を持つ、Signal Forms の `FormValueControl` の形のコンポーネント）を `[formControl]` に直接つなぐ道が `NgControl` に入っていて、`FormControlDirective` は「その道を使わない」と分かってから accessor を選ぶためです （`form_control_directive.ts` の `ngOnChanges` に「Now that we know we're not using FVC, select the value accessor」というコメントがあります。相互運用は[第 19 回](19-forms-sf-submit-compat.md)）。

📄 `angular/packages/forms/src/directives/shared.ts` L380–384 （▶ の行: 383）

```ts
380 │ export function isBuiltInAccessor(valueAccessor: ControlValueAccessor): boolean {
381 │   // Check if a given value accessor is an instance of a class that directly extends
382 │   // `BuiltInControlValueAccessor` one.
383 ▶   return Object.getPrototypeOf(valueAccessor.constructor) === BuiltInControlValueAccessor;
384 │ }
```

383 行目、「組み込みかどうか」は、**コンストラクタの親が `BuiltInControlValueAccessor` そのものか**で決めます。`instanceof` ではないので、`CheckboxControlValueAccessor` を継承して自分のクラスを作ると、その親は `CheckboxControlValueAccessor` になり、組み込みではなく「自作」として扱われます。

📄 `angular/packages/forms/src/directives/shared.ts` L401–436 （▶ の行: 405, 407–408, 414–420, 422–424, 426, 428–430, 433）

```ts
401 │ export function selectValueAccessor(
402 │   dir: NgControl,
403 │   valueAccessors: readonly ControlValueAccessor[] | null | undefined,
404 │ ): ControlValueAccessor | null {
405 ▶   if (!valueAccessors) return null;
406 │ 
407 ▶   if (!Array.isArray(valueAccessors) && (typeof ngDevMode === 'undefined' || ngDevMode))
408 ▶     _throwInvalidValueAccessorError(dir);
409 │ 
410 │   let defaultAccessor: ControlValueAccessor | undefined = undefined;
411 │   let builtinAccessor: ControlValueAccessor | undefined = undefined;
412 │   let customAccessor: ControlValueAccessor | undefined = undefined;
413 │ 
414 ▶   valueAccessors.forEach((v: ControlValueAccessor) => {
415 ▶     if (v.constructor === DefaultValueAccessor) {
416 ▶       defaultAccessor = v;
417 ▶     } else if (isBuiltInAccessor(v)) {
418 ▶       if (builtinAccessor && (typeof ngDevMode === 'undefined' || ngDevMode))
419 ▶         _throwError(dir, 'More than one built-in value accessor matches form control with');
420 ▶       builtinAccessor = v;
421 │     } else {
422 ▶       if (customAccessor && (typeof ngDevMode === 'undefined' || ngDevMode))
423 ▶         _throwError(dir, 'More than one custom value accessor matches form control with');
424 ▶       customAccessor = v;
425 │     }
426 ▶   });
427 │ 
428 ▶   if (customAccessor) return customAccessor;
429 ▶   if (builtinAccessor) return builtinAccessor;
430 ▶   if (defaultAccessor) return defaultAccessor;
431 │ 
432 │   if (typeof ngDevMode === 'undefined' || ngDevMode) {
433 ▶     _throwError(dir, 'No valid value accessor for form control with');
434 │   }
435 │   return null;
436 │ }
```

1. **405 行目：accessor が 1 つも無い**

   配列が無ければ `null`。呼び出し元の `setUpControlValueAccessor` が開発モードで「No value accessor for form control」を投げます（第 10 回）。
2. **407〜408 行目：配列でない**

   `multi: true` を書き忘れて provide すると、配列でなく 1 つのオブジェクトが来ます。開発モードではここで NG01200 のエラーになります。
3. **414〜426 行目：3 つの箱に分ける**

   415 行目、コンストラクタが `DefaultValueAccessor` そのものなら「既定」。417 行目、上の `isBuiltInAccessor` なら「組み込み」。それ以外は全部「自作」。418〜419 行目と 422〜423 行目、同じ箱に 2 つ目が来たら開発モードではエラーです。
4. **428〜430 行目：自作 → 組み込み → 既定**

   自作があれば自作、無ければ組み込み、それも無ければ既定。`type=number` の input では、既定の `DefaultValueAccessor` より組み込みの `NumberValueAccessor` が勝ちます。自作の部品に `ngDefaultControl` を書いても、自作の accessor が provide されていればそちらが勝ちます。
5. **433 行目：どれにも入らなかった**

   配列はあったが中身が空のときは、開発モードで「No valid value accessor」。本番では `null` を返します。

## ここまでの呼び出し

- 👤 `<input type="number" [formControl]="c">` — あなたのテンプレート
  - `DefaultValueAccessor / NumberValueAccessor の providers` — default\_value\_accessor.ts L98 ほか — *NG\_VALUE\_ACCESSOR に multi で自分を足す*
  - `new FormControlDirective(..., valueAccessors)` — reactive\_directives/form\_control\_directive.ts — *@Self() で配列を受ける（第 12 回）*
    - `NgControl.rawValueAccessors = valueAccessors` — ng\_control.ts L105
  - `ngOnChanges → this.valueAccessor ??= this.selectedValueAccessor` — form\_control\_directive.ts
    - `selectValueAccessor(dir, rawValueAccessors)` — shared.ts L401 — *自作 → 組み込み → 既定*
      - `isBuiltInAccessor(v)` — shared.ts L380 — *親が BuiltInControlValueAccessor か*
  - `setUpControlValueAccessor(control, dir)` — shared.ts L82 — *第 10 回*
- `（入力）_handleInput(value) → onChange(value)` — default\_value\_accessor.ts L126 — *変換中は捨てる*
- `（確定）_compositionEnd(value) → onChange(value)` — default\_value\_accessor.ts L138

## 聞かれそうな質問

**Q. 自作の accessor で onTouched を呼び忘れると、何が起きますか？**

`registerOnTouched` で受け取った関数を誰も呼ばないので、control は**いつまでも touched になりません**。その関数の中身は第 10 回の `setUpBlurPipeline` で、`markAsTouched()` と、`updateOn: 'blur'` のときの値の確定をしています。つまり呼び忘れると、`ng-touched` のクラスが付かず（[第 15 回](15-forms-status-classes.md)）、「触ったらエラーを出す」という `@if (c.touched && c.invalid)` のような表示も出ず、`updateOn: 'blur'` の control には値が一度も届きません。2 節の 154 行目のとおり、`onTouched` は既定で「何もしない関数」なので、呼び忘れてもエラーは出ません。気づきにくい不具合です。

**Q. 1 つの要素に accessor が 2 つ付いたら、どちらが使われますか？**

6 節の 428〜430 行目のとおり、**自作 → 組み込み → 既定**の順です。種類が違えば必ずどちらかに決まります。同じ種類が 2 つのとき（自作が 2 つ、組み込みが 2 つ）は、開発モードでは 418〜419 行目・422〜423 行目で 「More than one custom value accessor matches form control with ...」のエラーになります。本番のビルドでは `ngDevMode` が偽なのでエラーにならず、420 行目・424 行目で後から来たほうが上書きします。どちらが「後」かは provide の順に頼ることになるので、エラーを消すために本番の挙動に頼らず、どちらかを外してください。既定の `DefaultValueAccessor` は 416 行目で上書きされるだけで、エラーにはなりません。

**Q. COMPOSITION\_BUFFER\_MODE は何のためのトークンですか？**

`DefaultValueAccessor` が IME の変換中の入力を control に送るかどうかを決めます。4 節の 108〜112 行目で、provide されていなければ Android 以外は `true`（確定まで待つ）、Android では `false` です。Android は 34〜35 行目のコメントのとおり、composition のイベントの出方が iOS などと違うため、待つと値が届かなくなることがあるからです。アプリ全体で決めたいときは `{ provide: COMPOSITION_BUFFER_MODE, useValue: true }` のように provide します。効くのは `DefaultValueAccessor` だけで、自作の accessor は自分で `compositionstart` / `compositionend` を扱う必要があります。

**Q. 自作 accessor の provide に useClass ではなく useExisting を使うのはなぜですか？**

4 節の 29 行目と同じ理由です。`useExisting` は「すでに作られた、このディレクティブ（コンポーネント）のインスタンス」を返します。`useClass` にすると、テンプレートに置いた部品とは別のインスタンスがもう 1 つ作られ、フォームはそちらの `writeValue` を呼ぶので、画面の部品は何も変わりません。

**Q. setDisabledState を実装しなかったら？**

1 節の 131 行目で `?` 付きなので、実装しなくても型エラーにはなりません。フォームの側は第 10 回で見る `setDisabledState?.(...)` の形で呼ぶので、無ければ何もしません。そのかわり `control.disable()` しても部品の見た目は変わらず、利用者は押せてしまいます（押しても、無効の control の値は親の `value` に入りません）。

## テストと直し方

6 節の選び方は、`packages/forms/test/directives_spec.ts` の `describe('Form Directives')` → `describe('shared')` → `describe('selectValueAccessor')` に 10 本の `it` があります。DOM を使わず、accessor のインスタンスを並べた配列を直接 `selectValueAccessor` に渡す、小さなテストです。

📄 `angular/packages/forms/test/directives_spec.ts` L129–148 （▶ の行: 129–130, 133–134, 146–147）

```ts
129 ▶       it('should return custom accessor when provided', () => {
130 ▶         const customAccessor: ControlValueAccessor = {} as any;
131 │         const checkboxAccessor = new CheckboxControlValueAccessor(null!, null!);
132 │         expect(
133 ▶           selectValueAccessor(dir, <any>[defaultAccessor, customAccessor, checkboxAccessor]),
134 ▶         ).toEqual(customAccessor);
135 │       });
136 │ 
137 │       it('should return custom accessor when provided with select multiple', () => {
138 │         const customAccessor: ControlValueAccessor = {} as any;
139 │         const selectMultipleAccessor = new SelectMultipleControlValueAccessor(null!, null!);
140 │         expect(
141 │           selectValueAccessor(dir, <any>[defaultAccessor, customAccessor, selectMultipleAccessor]),
142 │         ).toEqual(customAccessor);
143 │       });
144 │ 
145 │       it('should throw when more than one custom accessor is provided', () => {
146 ▶         const customAccessor: ControlValueAccessor = {} as any;
147 ▶         expect(() => selectValueAccessor(dir, [customAccessor, customAccessor])).toThrowError();
148 │       });
```

130 行目、「自作の accessor」は `{}` という空のオブジェクトです。コンストラクタが `Object` なので、6 節の 415 行目にも 417 行目にも当てはまらず「自作」の箱に入ります。133〜134 行目で、既定・自作・組み込みの 3 つを渡して自作が返ることを確かめ、146〜147 行目で、自作が 2 つなら投げることを確かめています。

📄 `ターミナル（../angular で実行）`

```
$ pnpm bazel test //packages/forms/test:test \
    --test_arg=--filter="Form Directives shared selectValueAccessor" --test_output=all
...
==================== Test output for //packages/forms/test:test:
Randomized with seed 02275
Started
..........

Ran 10 of 1153 specs
10 specs, 0 failures
Finished in 0.023 seconds
...
//packages/forms/test:test                                               PASSED in 0.9s
```

- `--filter` に渡す文字列は、describe と it をスペースでつないだ名前に対する正規表現（部分一致）です。`"Form Directives shared selectValueAccessor"` で、この describe の 10 本だけが走りました（`Ran 10 of 1153 specs`）。名前が合わないと 0 本で PASSED になる落とし穴は[第 1 回](01-forms-overview.md)にあります。
- 直す場所の入口: 選び方は `packages/forms/src/directives/shared.ts` の `selectValueAccessor` と `isBuiltInAccessor`。IME は `default_value_accessor.ts` の `_handleInput` / `_compositionEnd`。
- 足す場所: 選び方は上の describe に `it` を 1 本。IME は `reactive_integration_spec.ts` の `describe('IME events')` と、テンプレート駆動の `template_integration_spec.ts` の同名の箇所に、`triggerEventHandler('compositionstart')` で再現するテストがあります。
- 手元で 1 行壊して確かめるとき（例: 428 行目と 429 行目の順を入れ替える）は、[「テストを書いて壊して戻す」の回](../contrib/07-contrib-writing-a-test.md)の手順で、必ず元に戻します。本家に PR を出すのはまだ先で、ここでは issue を読むときに「どの行の話か」が分かれば十分です（[第 20 回](20-forms-issues.md)）。

## 読み終えて

- accessor の約束は 4 つ。`writeValue` と `setDisabledState` が control → 入力欄、`registerOnChange` と `registerOnTouched` は入力欄 → control の関数を受け取るだけ。
- accessor は `NG_VALUE_ACCESSOR` に `multi: true`・`useExisting` で自分を足す。だから 1 つの要素に何個でも付けられ、NgControl は配列で受け取る。
- `selectValueAccessor` は「自作 → 組み込み → 既定」。組み込みの判定は「親が `BuiltInControlValueAccessor` そのものか」。
- `DefaultValueAccessor` は `input` を聞き、Android 以外では IME の変換中を捨てて `compositionend` で 1 回送る。

---

← 前: [型付きフォームと FormBuilder](08-forms-typed-forms.md)  
次: [setUpControlValueAccessor：control と入力欄を双方向につなぐ配線](10-forms-setup-control.md) →
