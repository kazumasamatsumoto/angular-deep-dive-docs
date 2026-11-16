[目次](../README.md) › [Signal Forms の \[formField\]：フィールドと DOM の境目](README.md) › 第 4 回 / 全 6 回

# カスタムコントロール：FormValueControl と FormCheckboxControl

> api/control.ts のインターフェースが求める value・checked の model と任意の 16 個の input・touch・focus()・reset()、control\_custom.ts がそれらにどう値と状態を書き、valueChange と touch を受け取るか（フォームからの書き込みは input としてなので model の subscribe は呼ばれない、#71679）、reset の伝わり方（849dba6c650）、debounce('blur') と touch の output（12fcec8ce90）、transformedValue を使う入れ子の form()（#70692）と custom radio（#69782）。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sfd-custom-control)

---

自分で作ったコンポーネントに `[formField]` を付けると、Signal Forms はそのコンポーネントの `value`（か `checked`）の `model()` に値を書き、`disabled` や `errors` などの input に状態を書き、`valueChange` と `touch` を聞いてモデルに戻します。この章では、その約束（インターフェース）と、約束どおりに書き込む関数 `customControlCreate` を 1 行ずつ読み、`reset()` がコントロールまで届く道（849dba6c650）と `debounce('blur')` と `touch` の関係（12fcec8ce90）を確かめます。

読む対象は `packages/forms/signals/src/api/control.ts`・`directive/control_custom.ts`・`directive/form_field.ts` の `reset`・`field/node.ts` の `reset` と、core の `packages/core/src/render3/instructions/control.ts` の `ControlDirectiveHostImpl` です。`[formField]` が「相手はカスタムコントロールだ」と決めるまで（core の `initializeCustomControlStatus` と `ɵngControlCreate` の 3 つの分岐）は[第 1 回](01-sfd-form-field.md)にあります。

1. [1. FormField の全体](01-sfd-form-field.md)
2. [2. ネイティブの要素](02-sfd-native.md)
3. [3. parse エラーと validity](03-sfd-validity.md)
4. **4. カスタムコントロール**（この章）
5. [5. ControlValueAccessor との互換](05-sfd-cva.md)
6. [6. spec と issue](06-sfd-tests-issues.md)

## 1. 約束：必須は model が 1 つだけ

📄 `angular/packages/forms/signals/src/api/control.ts` L145–176 （▶ の行: 160, 166–168, 175）

```ts
145 │ /**
146 │  * A contract for a form control that edits a `FieldTree` of type `TValue`. Any component that
147 │  * implements this contract can be used with the `Field` directive.
148 │  *
149 │  * Many of the properties declared on this contract are optional. They do not need to be
150 │  * implemented, but if they are will be kept in sync with the field state of the field bound to the
151 │  * `Field` directive.
152 │  *
153 │  * @template TValue The type of `FieldTree` that the implementing component can edit.
154 │  *
155 │  * @see [Custom form controls](guide/forms/signals/custom-controls)
156 │  *
157 │  * @category control
158 │  * @publicApi 22.0
159 │  */
160 ▶ export interface FormValueControl<TValue> extends FormUiControl<TValue> {
161 │   /**
162 │    * The value is the only required property in this contract. A component that wants to integrate
163 │    * with the `Field` directive via this contract, *must* provide a `model()` that will be kept in
164 │    * sync with the value of the bound `FieldTree`.
165 │    */
166 ▶   readonly value: ModelSignal<TValue>;
167 ▶   // TODO: We currently require that a `checked` input not be present, as we may want to introduce a
168 ▶   // third kind of form control for radio buttons that defines both a `value` and `checked` input.
169 │   // We are still evaluating whether this makes sense, but if we decide not to pursue this we can
170 │   // remove this restriction.
171 │   /**
172 │    * The implementing component *must not* define a `checked` property. This is reserved for
173 │    * components that want to integrate with the `Field` directive as a checkbox.
174 │    */
175 ▶   readonly checked?: undefined;
176 │ }
```

📄 `angular/packages/forms/signals/src/api/control.ts` L178–207 （▶ の行: 191–192, 198, 206）

```ts
178 │ /**
179 │  * A contract for a form control that edits a boolean checkbox `FieldTree`. Any component that
180 │  * implements this contract can be used with the `Field` directive.
181 │  *
182 │  * Many of the properties declared on this contract are optional. They do not need to be
183 │  * implemented, but if they are will be kept in sync with the field state of the field bound to the
184 │  * `Field` directive.
185 │  *
186 │  * @see [Custom form controls](guide/forms/signals/custom-controls)
187 │  *
188 │  * @category control
189 │  * @publicApi 22.0
190 │  */
191 ▶ // TODO: should we make this generic extends `boolean | null` so people can use `null` for parse error?
192 ▶ export interface FormCheckboxControl extends FormUiControl<boolean> {
193 │   /**
194 │    * The checked is the only required property in this contract. A component that wants to integrate
195 │    * with the `Field` directive, *must* provide a `model()` that will be kept in sync with the
196 │    * value of the bound `FieldTree`.
197 │    */
198 ▶   readonly checked: ModelSignal<boolean>;
199 │   // TODO: maybe this doesn't have to be strictly `undefined`? It just can't be a model signal.
200 │   // Typescript doesn't really have a way to do any-but, but we could maybe introduce an optional
201 │   // generic for it?
202 │   /**
203 │    * The implementing component *must not* define a `value` property. This is reserved for
204 │    * components that want to integrate with the `Field` directive as a standard input.
205 │    */
206 ▶   readonly value?: undefined;
207 │ }
```

約束は 2 つです。160 行目の `FormValueControl<TValue>` は、166 行目の `value: ModelSignal<TValue>`（`model()` で作る signal）だけが必須です。192 行目の `FormCheckboxControl` は、198 行目の `checked: ModelSignal<boolean>` だけが必須です。175 行目と 206 行目で、もう片方の名前は `undefined` 型に縛られています。`value` と `checked` を両方持つコンポーネントは、型の上でどちらの約束も満たせません。167〜170 行目の TODO は、その理由を「`value` と `checked` を両方持つ radio 用の 3 つ目の種類を入れるかもしれないので、今は空けておく」と書いています（この radio の話は 7 節の #69782 につながります）。

📄 `angular/packages/forms/signals/src/api/control.ts` L14–46 （▶ の行: 22, 27–29, 34, 39, 46）

```ts
14 │ /**
15 │  * The base set of properties shared by all form control contracts.
16 │  *
17 │  * @see [Custom form controls](guide/forms/signals/custom-controls)
18 │  *
19 │  * @category control
20 │  * @publicApi 22.0
21 │  */
22 ▶ export interface FormUiControl<TValue> {
23 │   /**
24 │    * An input to receive the errors for the field. If implemented, the `Field` directive will
25 │    * automatically bind errors from the bound field to this input.
26 │    */
27 ▶   readonly errors?:
28 ▶     | InputSignal<readonly ValidationError.WithOptionalFieldTree[]>
29 ▶     | InputSignalWithTransform<readonly ValidationError.WithOptionalFieldTree[], unknown>;
30 │   /**
31 │    * An input to receive the disabled status for the field. If implemented, the `Field` directive
32 │    * will automatically bind the disabled status from the bound field to this input.
33 │    */
34 ▶   readonly disabled?: InputSignal<boolean> | InputSignalWithTransform<boolean, unknown>;
35 │   /**
36 │    * An input to receive the reasons for the disablement of the field. If implemented, the `Field`
37 │    * directive will automatically bind the disabled reason from the bound field to this input.
38 │    */
39 ▶   readonly disabledReasons?:
40 │     | InputSignal<readonly WithOptionalFieldTree<DisabledReason>[]>
41 │     | InputSignalWithTransform<readonly WithOptionalFieldTree<DisabledReason>[], unknown>;
42 │   /**
43 │    * An input to receive the readonly status for the field. If implemented, the `Field` directive
44 │    * will automatically bind the readonly status from the bound field to this input.
45 │    */
46 ▶   readonly readonly?: InputSignal<boolean> | InputSignalWithTransform<boolean, unknown>;
```

📄 `angular/packages/forms/signals/src/api/control.ts` L110–143 （▶ の行: 114, 118–121, 123, 130, 134, 140–142）

```ts
110 │   /**
111 │    * An input to receive the value patterns for the field. If implemented, the `Field` directive
112 │    * will automatically bind the value patterns from the bound field to this input.
113 │    */
114 ▶   readonly pattern?:
115 │     | InputSignal<readonly RegExp[]>
116 │     | InputSignalWithTransform<readonly RegExp[], unknown>;
117 │   /**
118 ▶    * An output to emit when the user finishes interacting with the control, marking the field as
119 ▶    * touched. Emit this in response to the native `blur` event (when focus leaves the control), not
120 ▶    * `focus`. The `Field` directive listens to this output to update the field's touched status,
121 ▶    * which blur-based rules such as `debounce('blur')` rely on.
122 │    */
123 ▶   readonly touch?: OutputRef<void>;
124 │   /**
125 │    * Focuses the UI control.
126 │    *
127 │    * If the focus method is not implemented, Signal Forms will attempt to focus the host element
128 │    * when asked to focus this control.
129 │    */
130 ▶   focus?(options?: FocusOptions): void;
131 │   /**
132 │    * Resets the UI control to its pristine state.
133 │    */
134 ▶   reset?(): void;
135 │ }
136 │ 
137 │ // Verify that `FormUiControl` implements `FormFieldBindingOptions`.
138 │ // We intend for this to be the case so that a `FormUiControl` can act as its own `FormFieldBindingOptions`.
139 │ // However, we don't want to add it as an actual `extends` clause to avoid confusing users.
140 ▶ type Check<T extends true> = T;
141 ▶ type FormUiControlImplementsFormFieldBindingOptions = Check<
142 ▶   FormUiControl<unknown> extends FormFieldBindingOptions ? true : false
143 │ >;
```

任意の部分は、2 つの約束が継ぐ `FormUiControl`（22 行目）にまとまっています。どれも `?` 付きで、実装すれば同期され、しなければ何もされません。型はすべて `InputSignal` か `InputSignalWithTransform<…, unknown>` のどちらかです（27〜29 行目の `errors`、34 行目の `disabled`、39 行目の `disabledReasons`、46 行目の `readonly` から、114 行目の `pattern` まで同じ形）。`transform` を付けた input でもよい、ということです。この章のデモのコントロールは、`transform` の中で「書かれた」ことを記録しています。

input でないものが 3 つあります。123 行目の `touch` は `OutputRef<void>`（`output()`）、130 行目の `focus()` と 134 行目の `reset()` はメソッドです。118〜121 行目の説明は 12fcec8ce90（2026-06-16、#69370）で「`touch` はネイティブの `blur` で出すこと、`focus` ではない。`debounce('blur')` はこれを頼りにする」と書き直されました。134 行目の `reset()` は 849dba6c650（2026-05-01）で足されたものです（5 節）。140〜142 行目は、型だけの検査です。`FormUiControl` が 5 節の `FormFieldBindingOptions`（`focus` と `reset`）の形を満たしていることを、コンパイルのたびに確かめています。

| 名前 | 種類 | 必須 | 向き |
| --- | --- | --- | --- |
| `value`（FormValueControl）/ `checked`（FormCheckboxControl） | `model()` | どちらか 1 つ | 両方向。書くのは 2 節の 34〜36 行目、聞くのは 24 行目 |
| `errors`・`disabled`・`disabledReasons`・`readonly`・`hidden`・`invalid`・`pending`・`touched`・`dirty`・`name`・`required`・`min`・`minLength`・`max`・`maxLength`・`pattern` | `input()` | 任意 | フォーム → コントロールだけ（2 節の 39〜60 行目） |
| `touch` | `output()` | 任意 | コントロール → フォーム（2 節の 25 行目） |
| `focus()`・`reset()` | メソッド | 任意 | フォームから呼ばれる（2 節の 27 行目、5 節） |

## 2. customControlCreate：作るときに 3 つ、更新のたびに 2 つ

📄 `angular/packages/forms/signals/src/directive/control_custom.ts` L20–37 （▶ の行: 20, 24–25, 27, 29–30, 33–35）

```ts
20 ▶ export function customControlCreate(
21 │   host: ControlDirectiveHost,
22 │   parent: FormField<unknown>,
23 │ ): () => void {
24 ▶   host.listenToCustomControlModel((value) => parent.state().controlValue.set(value));
25 ▶   host.listenToCustomControlOutput('touch', () => parent.state().markAsTouched());
26 │ 
27 ▶   parent.registerAsBinding(host.customControl as FormFieldBindingOptions);
28 │ 
29 ▶   const bindings = createBindings<ControlBindingKey | 'controlValue'>();
30 ▶   return () => {
31 │     const state = parent.state();
32 │     // Bind custom form control model ('value' or 'checked').
33 ▶     const controlValue = state.controlValue();
34 ▶     if (bindingUpdated(bindings, 'controlValue', controlValue)) {
35 ▶       host.setCustomControlModelInput(controlValue);
36 │     }
37 │ 
```

1. **24 行目：model の Change を聞く**

   コントロールが `value.set(x)` すると `model()` は `valueChange` を出します。それを聞いて、フィールドの `controlValue.set(x)` を呼びます。`controlValue` は「入力欄の値」で、`value`（モデル）に移るのは debounce のあとです（[signal-forms](../signals/17-signal-forms.md) の 7 節）。
2. **25 行目：touch を聞く**

   `touch` の output が出たら `markAsTouched()` です。`markAsTouched` の中で debounce 中の値が同期されます（[signal-forms](../signals/17-signal-forms.md) の 7 節の `flushSync`）。4 節で確かめます。
3. **27 行目：コントロール自身を binding として登録する**

   `host.customControl`（コンポーネントのインスタンス）を、そのまま `FormFieldBindingOptions` として渡します。1 節の 140〜142 行目で形が合うと確かめてあるので、コンポーネントに `focus()` や `reset()` があれば、それが `FormField` の `focus` と `reset` になります（5 節）。
4. **29〜36 行目：返す関数の前半、値を書く**

   29 行目の `bindings` は「この関数が前回書いた値」を覚える入れ物です（`createBindings` と `bindingUpdated` は[第 1 回](01-sfd-form-field.md)）。30 行目から返す関数が `ɵngControlUpdate` に入り、テンプレートの更新のたびに走ります。33 行目で `controlValue()` を読み、前回と違えば 35 行目で `value`（か `checked`）の input に書きます。

📄 `angular/packages/forms/signals/src/directive/control_custom.ts` L38–63 （▶ の行: 39, 41–42, 44, 46–47, 51–53）

```ts
38 │     // Bind remaining field state properties.
39 ▶     for (const name of CONTROL_BINDING_NAMES) {
40 │       let value: unknown;
41 ▶       if (name === 'errors') {
42 ▶         value = parent.errors();
43 │       } else {
44 ▶         value = readFieldStateBindingValue(state, name);
45 │       }
46 ▶       if (bindingUpdated(bindings, name, value)) {
47 ▶         host.setInputOnDirectives(name, value);
48 │ 
49 │         // If the host node is a native control, we can bind field state properties to native
50 │         // properties for any that weren't defined as inputs on the custom control.
51 ▶         if (parent.elementAcceptsNativeProperty(name) && !host.customControlHasInput(name)) {
52 ▶           const domValue = formatDateForMinMax(name, value, parent.nativeFormElement.type);
53 ▶           setNativeDomProperty(
54 │             parent.renderer,
55 │             parent.nativeFormElement,
56 │             name,
57 │             domValue as string | number | boolean | undefined,
58 │           );
59 │         }
60 │       }
61 │     }
62 │   };
63 │ }
```

1. **39〜45 行目：16 個の状態を読む**

   `CONTROL_BINDING_NAMES` は `disabled` から `touched` までの 16 個の名前の配列です（並びは bindings.ts の表の順。[forms-sf-rules-metadata](../forms/18-forms-sf-rules-metadata.md) の 8 節）。41〜42 行目、`errors` だけはフィールドの `errors()` ではなく `parent.errors()`（この `FormField` 用に絞ったもの。[第 3 回](03-sfd-validity.md)）を読みます。
2. **46〜47 行目：変わったものだけ、全部のディレクティブに書く**

   `setInputOnDirectives` は、その名前の input を持つ、同じ要素の上の全部のディレクティブ（`FormField` 自身は除く）に書きます。カスタムコントロールに限りません。コントロールがその input を持っていなければ、誰にも書かれずに終わります。1 回目の更新では `bindings` が空なので、`undefined` でない値は全部書かれます（デモの最初の記録）。
3. **51〜58 行目：ネイティブの要素なら、input の無い分を属性に**

   `<input myControl [formField]>` のように、ディレクティブで作ったカスタムコントロールがネイティブの要素の上にあるときだけの枝です。コントロールが `required` などの input を持っていなければ（51 行目の `customControlHasInput`）、要素のプロパティに書きます。52 行目の `formatDateForMinMax` は日付の `min`・`max` を文字列にする関数です（[第 2 回](02-sfd-native.md)）。

> [!NOTE]
> **さらに深く**
>
> 33〜36 行目は「前回この関数が書いた値」と比べるだけなので、コントロールが自分で `value.set(3)` したときも、次の更新で 35 行目が 3 をもう一度 `value` に書きます。CVA の側（[第 5 回](05-sfd-cva.md)）は 2e9aeea0fed でこの書き戻しを止めましたが、こちらは止めていません。止めなくてよいのは、書く先が signal だからです。3 節の 219 行目の `setDirectiveInput` は最後に input の signal の `signalSetFn` を呼び、同じ値なら何も通知しません（[signals-set](../signals/04-signals-set.md)）。CVA の `writeValue` は呼べば必ず何かするメソッドなので、同じ書き戻しが #67847 の無限ループになりました。

## 3. core の側：どの output を聞き、どの input に書くか

📄 `angular/packages/core/src/render3/instructions/control.ts` L124–146 （▶ の行: 124, 126, 131, 135, 137, 139, 144）

```ts
124 ▶   listenToCustomControlOutput(outputName: string, callback: (event: Event) => void): void {
125 │     const directiveDef = this.tView.data[this.tNode.customControlIndex] as DirectiveDef<unknown>;
126 ▶     listenToDirectiveOutput(
127 │       this.tNode,
128 │       this.lView,
129 │       directiveDef,
130 │       outputName,
131 ▶       wrapListener(this.tNode, this.lView, callback),
132 │     );
133 │   }
134 │ 
135 ▶   listenToCustomControlModel(listener: (value: unknown) => void): void {
136 │     const modelName =
137 ▶       this.tNode.flags & TNodeFlags.isFormValueControl ? 'valueChange' : 'checkedChange';
138 │     const directiveDef = this.tView.data[this.tNode.customControlIndex] as DirectiveDef<unknown>;
139 ▶     listenToDirectiveOutput(
140 │       this.tNode,
141 │       this.lView,
142 │       directiveDef,
143 │       modelName,
144 ▶       wrapListener(this.tNode, this.lView, listener),
145 │     );
146 │   }
```

2 節の 24 行目と 25 行目が呼ぶ `ControlDirectiveHostImpl` のメソッドです。137 行目で、作るときに付けた印（`TNodeFlags.isFormValueControl`。付け方は[第 1 回](01-sfd-form-field.md)）を見て、聞く output の名前を `'valueChange'` か `'checkedChange'` に決めます。124 行目の `touch` も 135 行目の model も、126・139 行目の `listenToDirectiveOutput` で、テンプレートに `(valueChange)="…"` と書いたときと同じ購読をします。131・144 行目の `wrapListener` は、テンプレートのイベントと同じく、呼ばれたら view を dirty にしてから callback を走らせる包みです。

📄 `angular/packages/core/src/render3/instructions/control.ts` L216–230 （▶ の行: 216, 218–219, 222, 227, 229）

```ts
216 ▶   setCustomControlModelInput(value: unknown): void {
217 │     const directiveDef = this.tView.data[this.tNode.customControlIndex] as DirectiveDef<{}>;
218 ▶     const modelName = this.tNode.flags & TNodeFlags.isFormValueControl ? 'value' : 'checked';
219 ▶     setDirectiveInput(this.tNode, this.tView, this.lView, directiveDef, modelName, value);
220 │   }
221 │ 
222 ▶   customControlHasInput(inputName: string): boolean {
223 │     if (this.tNode.customControlIndex === -1) {
224 │       return false;
225 │     }
226 │     const directiveDef = this.tView.data[this.tNode.customControlIndex] as DirectiveDef<unknown>;
227 ▶     const presence = (directiveDef.signalFormsInputPresence ??=
228 │       this._buildCustomControlInputCache(directiveDef));
229 ▶     return presence[inputName] === true;
230 │   }
```

2 節の 35 行目が呼ぶ `setCustomControlModelInput` は、218 行目で `'value'` か `'checked'` を選び、219 行目で `setDirectiveInput` を呼びます。テンプレートの `[value]="x"` と同じ書き方です。**input として書くので、`model()` の `valueChange` は出ません。**`model()` の output が出るのは、コンポーネントの中で `set` / `update` したときだけです。

これが #71679（2026-10-28 に予定なしで閉じた）の答えです。コントロールの中で `this.value.subscribe(…)` しても、フォームの側から値が変わったときは呼ばれません。メンテナーの返事は「model の subscribe は直接 set したときだけ出す。subscribe は直接呼ぶためのものではなく、output の動きを映したもの」でした。作業木の spec で確かめると、モデルを `'third'` にしても subscribe は呼ばれず、コントロールの中で `set('second')` したときだけ `['second']` が記録されました。フォームから来た変化に反応したいなら、`value()` を読む `effect` か `computed` にします（デモのコントロールは `effect` で観測しています）。

222〜229 行目の `customControlHasInput` は、2 節の 51 行目が使う「コントロールにその名前の input があるか」の答えで、227 行目でディレクティブの定義（`signalFormsInputPresence`）に一度だけ作って覚えます。hostDirectives で足された input も数えます（同じファイルの `_buildCustomControlInputCache`）。

## 4. model の変化がモデルに届くまで、と debounce('blur')

- 👤 コントロールの中で `this.value.set(3)`
  - `valueChange` が出る → `wrapListener` が view を dirty に — control.ts 139–145
    - `parent.state().controlValue.set(3)` — control\_custom.ts 24
      - `markAsDirty()` と `debounceSync()` — field/node.ts の controlValueSignal — *debounce が無ければすぐ value に移る*
  - 変更検知 → `ɵɵcontrol` → 2 節の関数 — control\_custom.ts 30
    - `value` に 3 を書き戻す（同じ値なので通知なし） — control\_custom.ts 35
    - `dirty` ← `true`、`invalid`・`errors` が変わっていれば書く — control\_custom.ts 47

`debounce(p.x, 'blur')` を付けたフィールドでは、3 段目の `debounceSync()` が `value` に移すのを止めます。止めた値を流すのは `markAsTouched()` の中の `flushSync()` で、それを呼ぶのは 2 節の 25 行目、つまり `touch` の output だけです。コントロールが `touch` を出さなければ、`debounce('blur')` のフィールドのモデルは送信（`submit` の `markAsTouched`）まで変わりません。`focus` で出すと、フォーカスした瞬間に同期して、そのあとの入力はまた止まります。#69370 はこれを文書の不足として報告し、12fcec8ce90 はガイド（`adev/.../custom-controls.md` の「Working with `debounce('blur')`」）と 1 節の 118〜121 行目の説明を足しただけで、コードは変えていません。

この間、コントロールの `value` は古い値に戻りません。2 節の 33 行目が読むのは `value()` ではなく `controlValue()` だからです。CVA の側で同じことを直したのが 2e0cb52dbf0 です（[第 5 回](05-sfd-cva.md)）。

## 5. reset()：FieldNode からコントロールまで

📄 `angular/packages/forms/signals/src/field/node.ts` L321–354 （▶ の行: 327–328, 332, 334–335, 342, 344–345, 347–348, 351–352）

```ts
321 │    * Resets the {@link touched} and {@link dirty} state of the field and its descendants.
322 │    *
323 │    * Note this does not change the data model, which can be reset directly if desired.
324 │    *
325 │    * @param value Optional value to set to the form. If not passed, the value will not be changed.
326 │    */
327 ▶   reset(value?: unknown): void {
328 ▶     untracked(() => this._reset(value));
329 │   }
330 │ 
331 │   private _reset(value?: unknown) {
332 ▶     this.pendingSync()?.abort();
333 │ 
334 ▶     if (value !== undefined) {
335 ▶       this.value.set(value);
336 │     }
337 │ 
338 │     // controlValue is a linkedSignal that only auto-resets when value *changes*.
339 │     // When the reset value equals the current value (or no value was passed),
340 │     // controlValue retains the typed text. Force it to match value by setting
341 │     // directly via the raw interface, which doesn't trigger a sync.
342 ▶     this.controlValue.rawSet(this.value());
343 │ 
344 ▶     this.nodeState.markAsUntouched();
345 ▶     this.nodeState.markAsPristine();
346 │ 
347 ▶     for (const binding of this.formFieldBindings()) {
348 ▶       binding.reset();
349 │     }
350 │ 
351 ▶     for (const child of this.structure.materializedChildren()) {
352 ▶       child._reset();
353 │     }
354 │   }
```

1. **327〜328 行目：untracked で \_reset**

   `f().reset()` も `f.x().reset(値)` もここに来ます。332 行目で debounce の待ちを捨て、値が渡されていれば 334〜336 行目でモデルに書きます。
2. **342 行目：controlValue をモデルに合わせる**

   `controlValue` は `value` から作った `linkedSignal` で、`value` が*変わったとき*しか追いつきません。debounce 中の値が残ったまま、同じ値で `reset()` されると、入力欄に古い文字が残ります。それを `rawSet`（dirty にしない書き方）で上書きするのがこの行で、68c3abbe09f（2026-04-23）で入りました。
3. **344〜345 行目：untouched と pristine**

   コントロールの `touched` と `dirty` の input には、次の更新で `false` が書かれます。
4. **347〜349 行目：このフィールドに付いた全部の FormField の reset()**

   `formFieldBindings` は、`registerAsBinding` の中の effect が足し引きする配列です（[第 1 回](01-sfd-form-field.md)）。849dba6c650 で入った 3 行です。351〜353 行目で、作られている子だけに同じことをします。

📄 `angular/packages/forms/signals/src/directive/form_field.ts` L292–325 （▶ の行: 295–297, 306–307, 315, 323–324）

```ts
292 │   /**
293 │    * Resets the bound control.
294 │    */
295 ▶   reset(): void {
296 ▶     this.resetter();
297 ▶     this.parseErrorsResetCallback?.(this.state().value());
298 │   }
299 │ 
300 │   /**
301 │    * Registers this `FormField` as a binding on its associated `FieldState`.
302 │    *
303 │    * This method should be called at most once for a given `FormField`. A `FormField` placed on a
304 │    * custom control (`FormUiControl`) automatically registers that custom control as a binding.
305 │    */
306 ▶   registerAsBinding(bindingOptions?: FormFieldBindingOptions): void {
307 ▶     if (this.isFieldBinding) {
308 │       throw new RuntimeError(
309 │         RuntimeErrorCode.BINDING_ALREADY_REGISTERED,
310 │         typeof ngDevMode !== 'undefined' &&
311 │           ngDevMode &&
312 │           'FormField already registered as a binding',
313 │       );
314 │     }
315 ▶     this.isFieldBinding = true;
316 │ 
317 │     this.installClassBindingEffect();
318 │ 
319 │     if (bindingOptions?.focus) {
320 │       this.focuser = (focusOptions?: FocusOptions) => bindingOptions.focus!(focusOptions);
321 │     }
322 │ 
323 ▶     if (bindingOptions?.reset) {
324 ▶       this.resetter = () => bindingOptions.reset!();
325 │     }
```

`FormField.reset()` は 2 つのことをします。296 行目の `resetter` は、323〜324 行目で `bindingOptions.reset` があれば差し替わったものです。カスタムコントロールでは 2 節の 27 行目がコンポーネント自身を渡すので、**コンポーネントの `reset()` メソッドがそのまま呼ばれます**。297 行目は、同じ要素で作られた `transformedValue` が登録した後片付け（parse エラーを消し、表示用の値を作り直す）です（[第 3 回](03-sfd-validity.md)）。306〜315 行目、`registerAsBinding` は 1 つの `FormField` に 1 回だけで、2 回目は `BINDING_ALREADY_REGISTERED` を投げます。

849dba6c650 の前は、`reset()` は touched と dirty を戻すだけで、コントロールには何も伝わりませんでした。コミットの本文は CVA の `writeValue`（[第 5 回](05-sfd-cva.md)）、`transformedValue`、ネイティブの要素の parser の 3 つを、同じ `reset` の口で戻すと書いています。同じコミットで標準の forms の `NgControl` にも `onReset` の口が足され、`[formControl]` や `ngModel` の下の `FormValueControl` も `FormResetEvent` で戻るようになりました（reactive\_fvc.spec.ts・template\_fvc.spec.ts）。

## 6. #70692：入れ子の form() と reset()

#70692（2026-09-11 に開かれ、09-13 に予定なしで閉じた）は、5 節の 297 行目が引き金です。`FormValueControl` の中で `transformedValue(this.value, {parse, format})` を作り、その結果をさらに `form()` に渡して、コンポーネントの中で `@for (rowField of form; track rowField().value().score)` と行を並べます。親で `reset()` すると NG01904（Orphan field）が出ます。

1. **親の `reset()`**

   5 節の 348 行目 → 297 行目 → `transformedValue` の後片付けが、`format(モデルの値)` をもう一度呼んで表示用の値に入れます。
2. **新しい配列**

   `format` は毎回新しい行のオブジェクトを作るので、入れ子の `form()` は全部の行を新しいフィールドとして作り直し、古い行のフィールドは親から外れます（orphan）。
3. **古い行で track を評価**

   `@for` は差分を取るために、古い行の `track` の式をもう一度評価します。外れたフィールドで `rowField().value()` を読むので NG01904 です。

コメントで示された回避は `track rowField`（フィールドそのものを track する）で、配列のフィールドを値ではなくフィールドで track する、という文書の指示どおりです（[forms-sf-schema](../forms/16-forms-sf-schema.md)）。メンテナーは「このエラーの文書を良くする」と答えて閉じ、コードは変えていません。spec の `web/orphan_repro.spec.ts`（13 行目 `describe('Signal Forms array removal orphan repro')`、3 本）は、別の orphan（フォーカスのある入力欄が配列から消えるとき）を固めたものです。

## 7. 開いている問題：custom radio（#69782）

#69782（2026-07-15、開いている）は、radio ボタンを自作したい、という要望です。radio は「この選択肢の値」（`value` の input）と「グループで選ばれている値」（model）の 2 つが要ります。ところが 1 節の 166 行目で `value` は model の名前に取られていて、core の見分け方（[第 1 回](01-sfd-form-field.md)の `hasModelInput`）も `value` と `valueChange` の組か、`checked` と `checkedChange` の組しか見ません。`value = input()` と `groupValue = model()` のコンポーネントに `[formField]` を付けると、どちらの組も無いので「invalid \[formField\] directive host」です。

コメントでは「ネイティブの radio と同じく `checked` の model と `value` の input にすればよいのでは」という案と、「グループの方を `FormValueControl` にする」という案が出ていて、決まっていません。1 節の 167〜170 行目の TODO が、まさにこの「`value` と `checked` を両方持つ 3 つ目の種類」を書いています。ネイティブの `<input type="radio">` は `[formField]` を radio ごとに付けて 9e37a58e14b で同期しています（[第 2 回](02-sfd-native.md)）。

## 8. DEMO：書かれた input と届いたモデル

> **🧪 DEMO — FormValueControl と FormCheckboxControl に何がいつ書かれるか**
>
> 本物の `@angular/forms/signals`（22.1.6）です。`count` と `late` は章の中で書いた `FormValueControl<number>`（＋と−）、`agree` は `FormCheckboxControl`（スイッチ）です。スキーマは `min(p.count, 0)`・`max(p.count, 3)`・`disabled(p.count, { when: lock })`・`debounce(p.late, 'blur')`。コントロールの input はどれも `transform` で「書かれた」ことを記録し、`value()` の変化は `effect` で記録しています。モデルの変化はページの側の `effect` です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sfd-custom-control)

見どころは 5 つです（↓ は `[formField]` からコントロールへ、↑ はコントロールから、● はモデル）。

- **開いた直後**：コントロールごとに `disabled`・`dirty`・`errors`・`invalid`・（count は）`max`・`min`・`name`・`touched` が 1 回ずつ、2 節の 39 行目の名前の順で書かれます。`value` は 35 行目で先に書かれますが model なので `transform` が無く、`effect` の行がそのあとに出ます。
- **count の ＋**：↑ `valueChange` のすぐあとに ● モデルが変わり、↓ `dirty ← true` が続きます。3 を超えて 4 になると ↓ `invalid ← true` と `errors ← [max]` です。`value` の書き戻し（2 節の囲み）は同じ値なので記録に出ません。
- **late の ＋**：↑ は出ても ● が出ません（表の `controlValue()` だけが進む）。late の外をクリックすると ↑ `touch.emit()` のあとに ● と ↓ `touched ← true` が出ます（4 節）。
- **lock**：↓ `disabled ← true` と一緒に、`dirty ← false`・`errors ← []`・`invalid ← false` も書かれます。disabled のフィールドは dirty と検証を数えないからです（[forms-sf-rules-metadata](../forms/18-forms-sf-rules-metadata.md) の 4 節）。ボタンが押せなくなるのは、コントロールが自分のテンプレートで `disabled()` を使っているからです。
- **f().reset()**：3 つのコントロールで ↓ `reset() が呼ばれた`（5 節の 296 行目）が先に出て、変更検知のあとに、変わっていた分だけ `touched ← false`・`dirty ← false` が続きます。late を押して外をクリックせずに reset すると、↓ `value() が …` で表示がモデルの値に戻ります（342 行目）。

## ここまでの呼び出し

- `ɵngControlCreate` → `customControlCreate(host, this)` — form\_field.ts（第 1 回）
  - `host.listenToCustomControlModel` → `'valueChange'` / `'checkedChange'` — control\_custom.ts 24 → control.ts 135–145
  - `host.listenToCustomControlOutput('touch')` — control\_custom.ts 25 → control.ts 124–133
  - `parent.registerAsBinding(host.customControl)` — control\_custom.ts 27 → form\_field.ts 306–325
- `ɵɵcontrol` → `ɵngControlUpdate`（返した関数） — control\_custom.ts 30 — *更新のたび*
  - `host.setCustomControlModelInput(controlValue)` → `setDirectiveInput` — control\_custom.ts 35 → control.ts 216–220
  - `host.setInputOnDirectives(name, value)` × 16 — control\_custom.ts 47
- 👤 `f().reset()`
  - `FieldNode._reset` → `binding.reset()` — node.ts 347–349
    - `FormField.reset` → コンポーネントの `reset()` と `transformedValue` の後片付け — form\_field.ts 295–298

## テストと直し方

| spec（packages/forms/signals/test/） | describe / it（行） | 固めていること |
| --- | --- | --- |
| `web/form_field.spec.ts` | 184 行目 `describe('properties')` の各 describe の `it('should bind to custom control')`（186 行目の dirty から）・`it('should bind to native control host of custom control without input')`（473 行目など） | 2 節の 47 行目と 51〜58 行目 |
| `web/form_field.spec.ts` | 212 行目 `it('should bind to a custom control when composed as a host directive')`・376 行目 `it('should bind to a custom control with transitive host directives')` | 3 節の 227 行目のキャッシュ（hostDirectives） |
| `web/form_field.spec.ts` | 5159 行目 `it('should synchronize with custom control touched status')` | 2 節の 25 行目 |
| `web/form_field.spec.ts` | 5988 行目 `describe('debounce')` › 6016 行目 `it('should support custom control')`・6048 行目 `it('should reset control when debounced update is reset')` | 4 節と 5 節の 342 行目 |
| `web/form_field.spec.ts` | 6321 行目 `describe('reset')` › 6322 行目 `it('should call reset on bound custom control')`・6355 行目 `it('should automatically reset transformedValue on field reset')` | 5 節の 296・297 行目 |
| `web/dynamic_binding.spec.ts` | 32 行目 `describe('FormValueControl')`・102 行目 `describe('FormCheckboxControl')` | `createComponent` の `inputBinding('formField', …)` で作ったときも 2 節が動くこと |
| `web/reactive_fvc.spec.ts`・`web/template_fvc.spec.ts` | 38 行目 `describe('FormControlDirective with FVC')`・40 行目 `describe('NgModel with FVC')` | 逆向き。標準の forms の下の `FormValueControl` |

📄 `ターミナル（~/angular-research/angular で実行、2026-11-16）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/signals/test/web:test_chromium --nocache_test_results --test_output=all
pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all
```

📄 `走らせた結果`

```
//packages/forms/signals/test/web:test_chromium
  Chromium: 1/1 test files | 350 passed, 0 failed
//packages/forms/signals/test/node:test
  539 specs, 0 failures
```

web の 350 本は、web の spec の `it` を数えた数（form\_field.spec.ts の 212 本を含む。そのうち 4 本は `(!isFirefox() ? it : xit)(…)` の形なので、行の頭の `it(` だけを grep すると数え落とす）と一致しました。web の suite はブラウザで 1 つの bundle を走らせるので、`--test_arg=--filter` では絞れません。3 節の #71679 の確かめは、8576f161ae4 の作業木に spec を 1 つ足して同じ target を走らせたもので（356 passed）、作業木は終わってから消しました。

- コントロールに**値や状態が書かれない**なら、`control_custom.ts` の 30〜62 行目の返す関数。足す先は form\_field.spec.ts の `describe('properties')` の該当する名前の describe。
- **どの output を聞くか**（valueChange・checkedChange・touch）なら core の `ControlDirectiveHostImpl` の `listenToCustomControlModel`・`listenToCustomControlOutput`。足す先は Signal Forms の web の spec です（`packages/core/test` には、このクラスを名指しで試す spec はありません。grep で当たるのは bundle の golden の一覧と TNode の形の一覧だけ）。
- **reset** なら `field/node.ts` の `_reset` と `form_field.ts` の `reset`。足す先は form\_field.spec.ts の `describe('reset')` と、node の `field_node.spec.ts`。

## 聞かれそうな質問

**Q. FormValueControl を implements しないと動かないのですか？**

動きます。core が見るのは「`value` の input と `valueChange` の output の組があるか」だけで（[第 1 回](01-sfd-form-field.md)）、`model()` はその組を作る書き方です。`implements` は型の検査のためで、1 節の 175 行目のように `checked` を置いてしまう間違いをコンパイルで見つけてくれます。input の型と field の型が合うかは、テンプレートの型検査が別に見ます（[typecheck-two-way](../typecheck/12-typecheck-two-way.md)）。

**Q. コントロールの value.subscribe がフォームからの変更で呼ばれないのはバグですか？**

仕様です（#71679、予定なしで閉じた）。3 節の 219 行目は `setDirectiveInput` で input として書くので、`model()` の output は出ません。output が出るのはコンポーネントの中で `set` / `update` したときだけです。フォームからの変化は `value()` を読む `effect` / `computed` で受けます。

**Q. debounce('blur') を付けたら、自作のコントロールだけモデルが変わらなくなりました。**

`touch` の output を、中の要素の `blur` で出していないからです。止めた値を流すのは `markAsTouched()` で、カスタムコントロールでそれを呼ぶのは `control_custom.ts` 25 行目の `touch` の購読だけです。1 節の 118〜121 行目の説明どおり、`focus` ではなく `blur` で出します（12fcec8ce90）。

**Q. f().reset() で、自作のコントロールの中の状態（開いているドロップダウンなど）も戻せますか？**

コンポーネントに `reset()` メソッドを書けば呼ばれます。`control_custom.ts` 27 行目でコンポーネント自身が binding になり、`form_field.ts` 323〜324 行目でその `reset` が `resetter` になり、`node.ts` 347〜349 行目から呼ばれます。値そのものは、342 行目と次の更新の 35 行目で `value` に書かれるので、`reset()` の中で値を戻す必要はありません。

**Q. 自分で value.set した値が、もう一度 value に書き戻されるのは無駄ではありませんか？**

書き戻しは起きています（`control_custom.ts` 33〜36 行目は前回この関数が書いた値と比べるだけ）。ただし書く先が input の signal なので、同じ値なら `signalSetFn` が何も通知せず、effect も computed も走りません。同じ形で `writeValue` を呼んでいた CVA の側は、2e9aeea0fed で止めています（[第 5 回](05-sfd-cva.md)）。

## 読み終えて

- カスタムコントロールの必須は `value` か `checked` の `model()` 1 つで、残りの 16 個の input・`touch`・`focus()`・`reset()` は任意です。
- `customControlCreate` は、作るときに valueChange と touch を聞いてコンポーネントを binding にし、更新のたびに `controlValue` と 16 個の状態を、変わったものだけ input に書きます。
- フォームからの書き込みは input としての書き込みなので、`model()` の output（subscribe）は出ません。
- `debounce('blur')` の値を流すのは `touch` だけです。`blur` で出します。
- `reset()` は `FieldNode._reset` → `FormField.reset` → コンポーネントの `reset()` の順に届きます（849dba6c650）。

---

← 前: [parse エラーと validity：ブラウザの検証をフィールドに戻す](03-sfd-validity.md)  
次: [ControlValueAccessor との互換：古いコントロールを \[formField\] で使う](05-sfd-cva.md) →
