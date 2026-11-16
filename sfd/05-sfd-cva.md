[目次](../README.md) › [Signal Forms の \[formField\]：フィールドと DOM の境目](README.md) › 第 5 回 / 全 6 回

# ControlValueAccessor との互換：古いコントロールを \[formField\] で使う

> control\_cva.ts と interop\_ng\_control.ts が CVA に registerOnChange・registerOnTouched・writeValue・setDisabledState をどの順で呼ぶか（標準の forms と逆の順）、writeValue の重複を減らす修正（2e9aeea0fed）とそれが生んだ debounce 中の古い書き戻しの修正（2e0cb52dbf0）、NG\_VALIDATORS を parseErrors に入れる橋（f9f24fc6699）、空でない name の input には書かない修正（38861ac41bb）とその穴、InteropNgControl に無いメンバー（#69678）、CVA の中の \[pattern\] の問題（#68246）。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sfd-cva)

---

標準の forms 用に書かれた `ControlValueAccessor`（CVA）のコンポーネントにも、`[formField]` を付けられます。この章では、そのとき `control_cva.ts` の `cvaControlCreate` が CVA のメソッドを**どの順に、どの時機に**呼ぶかを 1 行ずつ読み、2026 年の 5 つの修正（2e9aeea0fed・f9f24fc6699・54a985c5ca8・2e0cb52dbf0・38861ac41bb）がそれぞれどの行かを確かめます。最後に、標準の forms の `setUpControl` との違いを表にし、開いている #68246 と #69678 を今のコードで確かめます。

読む対象は `packages/forms/signals/src/directive/control_cva.ts`・`controls/interop_ng_control.ts`・`compat/validation_errors.ts` と、core の `packages/core/src/render3/instructions/control.ts` の `setInputOnDirectives` です。CVA の 4 つのメソッドそのものは[forms-value-accessor](../forms/09-forms-value-accessor.md)、標準の forms がそれを呼ぶ順は[forms-setup-control](../forms/10-forms-setup-control.md)、どの CVA を選ぶか（`selectValueAccessor` と、CVA が FormValueControl より先に選ばれる優先順位）は[第 1 回](01-sfd-form-field.md)にあります。

1. [1. FormField の全体](01-sfd-form-field.md)
2. [2. ネイティブの要素](02-sfd-native.md)
3. [3. parse エラーと validity](03-sfd-validity.md)
4. [4. カスタムコントロール](04-sfd-custom-control.md)
5. **5. ControlValueAccessor との互換**（この章）
6. [6. spec と issue](06-sfd-tests-issues.md)

## 1. 作るとき：registerOnChange と registerOnTouched

📄 `angular/packages/forms/signals/src/directive/control_cva.ts` L30–48 （▶ の行: 34, 38, 40, 44–45, 47）

```ts
30 │ function isValidatorObject(v: Function | Validator): v is Validator {
31 │   return typeof v === 'object' && v !== null;
32 │ }
33 │ 
34 ▶ export function cvaControlCreate(
35 │   host: ControlDirectiveHost,
36 │   parent: FormField<unknown>,
37 │ ): () => void {
38 ▶   const bindings = createBindings<ControlBindingKey | 'controlValue'>();
39 │ 
40 ▶   parent.controlValueAccessor!.registerOnChange((value: unknown) => {
41 │     // Update tracking for 'controlValue' here so that when the effect runs,
42 │     // `bindingUpdated` sees that the model value matches the last seen view value.
43 │     // This prevents the framework from writing the same value back to the CVA (CVA loopback).
44 ▶     bindings['controlValue'] = value;
45 ▶     parent.state().controlValue.set(value);
46 │   });
47 ▶   parent.controlValueAccessor!.registerOnTouched(() => parent.state().markAsTouched());
48 │ 
```

1. **38 行目：bindings を先に作る**

   「この関数が前回 CVA に書いた値」を覚える入れ物です（`createBindings` は[第 1 回](01-sfd-form-field.md)）。2e9aeea0fed（2026-03-25）までは返す関数の直前にありました。40 行目の callback から触るために、ここへ上がりました。
2. **40〜46 行目：registerOnChange**

   CVA が画面で値を変えて `onChange(v)` を呼ぶと、44 行目で `bindings['controlValue'] = v` にしてから、45 行目でフィールドの `controlValue` に入れます。44 行目が 2e9aeea0fed の中心で、「CVA から来た値は、もう CVA に書いたことにする」という意味です。こうしておくと、次の更新で 3 節の 93 行目が同じ値を見て `writeValue` を呼びません（#67847）。45 行目は以前 `value as any` でしたが、54a985c5ca8（2026-04-23）で `as any` を外しました。`parent` が `FormField<unknown>` なので、`controlValue` は `unknown` を受け取れます。
3. **47 行目：registerOnTouched**

   CVA の `onTouched()` で `markAsTouched()` です。debounce 中の値はここで流れます（[第 4 回](04-sfd-custom-control.md)の 4 節と同じ）。

#67847（2026-03-25、完了）は、CodeMirror を包んだ CVA で「`onChange` した直後に同じ値の `writeValue` が返ってきて、エディタの状態が作り直され、無限ループになる」という報告でした。メンテナーは「CVA の方は本物のバグで直せる。`FormValueControl` の `model()` の方は意図どおり（フォームの値が正、という controlled component）」と分けて答え、CVA の方だけをこの 44 行目で直しています。

## 2. NG\_VALIDATORS を parseErrors に入れる（f9f24fc6699）

📄 `angular/packages/forms/signals/src/directive/control_cva.ts` L49–79 （▶ の行: 49, 53–57, 62–63, 65, 67, 69–71, 76）

```ts
49 ▶   const legacyValidators = parent.injector.get(NG_VALIDATORS, null, {optional: true, self: true});
50 │   if (legacyValidators) {
51 │     let version: WritableSignal<number> | undefined;
52 │ 
53 ▶     for (const v of legacyValidators) {
54 ▶       if (isValidatorObject(v) && v.registerOnValidatorChange) {
55 ▶         version ??= signal(0);
56 ▶         v.registerOnValidatorChange(() => {
57 ▶           version!.update((n) => n + 1);
58 │         });
59 │       }
60 │     }
61 │ 
62 ▶     const validatorFns = legacyValidators.map((v) =>
63 ▶       typeof v === 'function' ? (v as ValidatorFn) : v.validate.bind(v),
64 │     );
65 ▶     const mergedValidator = Validators.compose(validatorFns);
66 │ 
67 ▶     const parseErrors = computed(() => {
68 │       // Read the `version` signal to re-run the validator when legacy validators trigger their change callbacks.
69 ▶       version?.();
70 ▶       const errors = mergedValidator ? mergedValidator(parent.interopNgControl.control) : null;
71 ▶       return reactiveErrorsToSignalErrors(errors, parent.interopNgControl.control);
72 │     });
73 │     // We must cast here because `CompatValidationError` claims to have `fieldTree` statically (to
74 │     // satisfy `ValidationState` elsewhere), but at construction it is created without it and acts as
75 │     // `WithoutFieldTree` initially.
76 ▶     parent.parseErrorsSource.set(
77 │       parseErrors as unknown as Signal<readonly ValidationError.WithoutFieldTree[]>,
78 │     );
79 │   }
```

1. **49 行目：同じ要素の NG\_VALIDATORS を探す**

   `self: true` なので、同じ要素の注入器で provide された分だけです。ふつうは、CVA のコンポーネント自身が `providers` に `NG_VALIDATORS` を置いている場合（自分で検証もする CVA）です。標準の forms の `RequiredValidator` などは、セレクタが `[formControl]`・`[formControlName]`・`[ngModel]` との組なので、`[formField]` だけの要素には付きません。
2. **53〜60 行目：registerOnValidatorChange を version の signal に**

   `Validator` オブジェクトの `registerOnValidatorChange` に「`version` を 1 増やす」関数を渡します。CVA の中の状態が変わって検証をやり直したいとき（値は `null` のまま、など）に、69 行目の computed をやり直させるためです。コミットの本文にも「値が変わらなくても（null から null）更新する」とあります。
3. **62〜65 行目：1 つの関数にまとめる**

   関数の validator はそのまま、オブジェクトは `validate.bind(v)` にして、標準の forms の `Validators.compose` で 1 つにします。
4. **67〜72 行目：computed で走らせる**

   70 行目、validator に渡す「control」は `interopNgControl.control`、つまり 6 節の偽の `NgControl` 自身です。validator が `control.value` を読むと、6 節の `controlValue()` を読むことになり、この computed の依存になります。71 行目で、標準の forms のエラーの形（`{required: true}`）を Signal Forms のエラーの配列に変えます。
5. **76 行目：parseErrorsSource に置く**

   ネイティブの要素の parse エラーや `transformedValue` と同じ置き場です。ここに置いたエラーがフィールドの `errors()` に混ざる道は[第 3 回](03-sfd-validity.md)にあります。

📄 `angular/packages/forms/signals/src/compat/validation_errors.ts` L49–66 （▶ の行: 55, 59–60, 63–64）

```ts
49 │ /**
50 │  * Converts reactive form validation error to signal forms CompatValidationError.
51 │  * @param errors
52 │  * @param control
53 │  * @return list of errors.
54 │  */
55 ▶ export function reactiveErrorsToSignalErrors(
56 │   errors: ValidationErrors | null,
57 │   control: AbstractControl,
58 │ ): CompatValidationError[] {
59 ▶   if (errors === null) {
60 ▶     return [];
61 │   }
62 │ 
63 ▶   return Object.entries(errors).map(([kind, context]) => {
64 ▶     return new CompatValidationError({context, kind, control});
65 │   });
66 │ }
```

71 行目が呼ぶ変換です。59〜60 行目、`null`（エラーなし）は空の配列。63〜64 行目、`{kind: context}` の 1 つずつを `CompatValidationError` にします。`kind` はキーの名前、`context` は値（`{requiredLength: 3, actualLength: 1}` など）です。同じファイルの逆向きの変換（Signal Forms のエラーを `ValidationErrors` に）は、6 節の `errors` の getter が使います。

f9f24fc6699（2026-03-27、PR #67943）のときは、`NG_VALIDATORS` を `FormField` が inject して getter で渡していました。849dba6c650 で `form_field.ts` から `NG_VALIDATORS` の import が消え、今の 49 行目の `parent.injector.get` になっています。

## 3. 更新のたび：writeValue と状態

📄 `angular/packages/forms/signals/src/directive/control_cva.ts` L81–88 （▶ の行: 81–85）

```ts
81 ▶   parent.registerAsBinding({
82 ▶     reset: () => {
83 ▶       const value = parent.state().value();
84 ▶       bindings['controlValue'] = value;
85 ▶       untracked(() => parent.controlValueAccessor!.writeValue(value));
86 │     },
87 │   });
88 │ 
```

先に、作るときの最後の行です。81 行目で、`reset` だけを持つ binding として登録します。`reset()` されたら、83 行目でモデルの値を読み、84 行目で「書いた」ことにしてから 85 行目で `writeValue` を呼びます。849dba6c650 の本文の「`FieldNode.reset()` は CVA に必ず `writeValue` する」はこの 3 行です。値が前と同じでも呼ぶので、CVA の中に残った途中の状態も消えます。84 行目があるので、直後の更新で同じ値をもう一度書くことはありません。

📄 `angular/packages/forms/signals/src/directive/control_cva.ts` L89–126 （▶ の行: 91, 93, 96, 99–100, 102–105, 108–110, 112, 124–125）

```ts
 89 │   return () => {
 90 │     const fieldState = parent.state();
 91 ▶     const controlValue = fieldState.controlValue();
 92 │ 
 93 ▶     if (bindingUpdated(bindings, 'controlValue', controlValue)) {
 94 │       // We don't know if the interop control has underlying signals, so we must use `untracked` to
 95 │       // prevent writing to a signal in a reactive context.
 96 ▶       untracked(() => parent.controlValueAccessor!.writeValue(controlValue));
 97 │     }
 98 │ 
 99 ▶     for (const name of CONTROL_BINDING_NAMES) {
100 ▶       const value = readFieldStateBindingValue(fieldState, name);
101 │       if (bindingUpdated(bindings, name, value)) {
102 ▶         const propertyWasSet = host.setInputOnDirectives(
103 ▶           name,
104 ▶           value,
105 ▶           name === 'name' ? isDefinedPredicate : undefined,
106 │         );
107 │ 
108 ▶         if (name === 'disabled' && parent.controlValueAccessor!.setDisabledState) {
109 ▶           untracked(() => parent.controlValueAccessor!.setDisabledState!(value as boolean));
110 ▶         } else if (!propertyWasSet && parent.elementAcceptsNativeProperty(name)) {
111 │           // Fall back to native DOM properties.
112 ▶           setNativeDomProperty(
113 │             parent.renderer,
114 │             parent.nativeFormElement,
115 │             name,
116 │             value as string | number | undefined,
117 │           );
118 │         }
119 │       }
120 │     }
121 │   };
122 │ }
123 │ 
124 ▶ function isDefinedPredicate(value: unknown): boolean {
125 ▶   return value == null;
126 │ }
```

1. **91〜97 行目：controlValue を writeValue**

   前回書いた値（1 節の 44 行目で CVA から来た値も含む）と違うときだけ、`untracked` の中で `writeValue` を呼びます。`untracked` なのは、96 行目のコメントのとおり、CVA が中で signal に書くかもしれないからです（テンプレートの更新の中で signal に書くと、テンプレートの依存になってしまう）。
2. **99〜106 行目：16 個の状態を、その名前の input に**

   [第 4 回](04-sfd-custom-control.md)の `customControlCreate` と同じ `setInputOnDirectives` ですが、`name` のときだけ 3 つ目の引数 `isDefinedPredicate` を渡します（38861ac41bb、4 節）。`errors` も第 4 回と違って `parent.errors()` ではなく、フィールドの `errors()` をそのまま読みます（100 行目）。
3. **108〜109 行目：disabled は setDisabledState にも**

   CVA に `setDisabledState` があれば呼びます。input の `disabled` にも 102 行目で書いたあとです。最初の更新では `bindings` が空なので、有効なフィールドでも `setDisabledState(false)` が 1 回呼ばれます。
4. **110〜117 行目：どの input にも書けなかったら、要素の属性に**

   `<input cvaDir [formField]>` のように、CVA がネイティブの要素の上のディレクティブのときです。`required`・`name` などを要素のプロパティに書きます。

91 行目の `controlValue()` は、2e0cb52dbf0（2026-06-19）で `value()` から変わりました。2 つの修正を並べると、何が起きていたかが分かります。

1. **2e9aeea0fed の前**

   93 行目は `value()` と比べていた。`debounce` 中に CVA が `onChange('updated')` しても、`value()` は `'initial'` のまま、`bindings` も `'initial'` なので何も書かない。ただし debounce が無いときは、同じ値の書き戻しが起きる（#67847）。
2. **2e9aeea0fed のあと**

   44 行目で `bindings` が `'updated'` になる。93 行目は `value()` の `'initial'` と比べるので「違う」となり、`writeValue('initial')`。**打った文字が、debounce 中の古い値で消される。**
3. **2e0cb52dbf0 のあと**

   93 行目は `controlValue()` の `'updated'` と比べるので同じ。何も書かない。

2 つ目の段は、利用者からは「v21 では動いていた」退行として届きました。#69387（2026-06-12）は、`debounce()` を付けたフィールドを `<input matInput [matAutocomplete]>`（Angular Material の CVA）に `[formField]` でつなぐと、打った文字が戻される、という報告で、2e0cb52dbf0 を含む PR #69436（2026-07-09 にマージ）で閉じています。

📄 `angular/packages/forms/signals/test/web/interop.spec.ts` L637–664 （▶ の行: 645, 659, 661–663）

```ts
637 │     }
638 │ 
639 │     @Component({
640 │       imports: [CustomControlWritebackTest, FormField],
641 │       template: `<custom-control-writeback-test [formField]="f" />`,
642 │     })
643 │     class TestCmp {
644 │       readonly f = form(signal('initial'), (p) => {
645 ▶         debounce(p, 'blur');
646 │       });
647 │     }
648 │ 
649 │     const fixture = act(() => TestBed.createComponent(TestCmp));
650 │ 
651 │     const debugEl = fixture.debugElement.query(
652 │       (el) => el.componentInstance instanceof CustomControlWritebackTest,
653 │     );
654 │ 
655 │     const cvaInstance = debugEl.componentInstance as CustomControlWritebackTest;
656 │ 
657 │     writeValues = [];
658 │ 
659 ▶     act(() => cvaInstance.onInput('updated'));
660 │ 
661 ▶     expect(cvaInstance.value).toBe('updated');
662 ▶     expect(fixture.componentInstance.f().value()).toBe('initial');
663 ▶     expect(writeValues).toEqual([]);
664 │   });
```

2e0cb52dbf0 が足した spec です。645 行目で `debounce(p, 'blur')`、659 行目で CVA が `'updated'` を `onChange` し、661 行目で CVA の表示は `'updated'` のまま、662 行目でモデルはまだ `'initial'`、663 行目で `writeValue` は 1 回も呼ばれていない、を確かめます。1 つ目の修正の spec（2e9aeea0fed）はその前のこれです。

📄 `angular/packages/forms/signals/test/web/interop.spec.ts` L148–171 （▶ の行: 162, 165–166, 170）

```ts
148 │   it('should not write back to CVA on view change', () => {
149 │     @Component({
150 │       imports: [CustomControl, FormField],
151 │       template: `<custom-control [formField]="f" />`,
152 │     })
153 │     class TestCmp {
154 │       readonly f = form(signal('test'));
155 │       readonly control = viewChild.required(CustomControl);
156 │     }
157 │ 
158 │     const fixture = act(() => TestBed.createComponent(TestCmp));
159 │     const control = fixture.componentInstance.control();
160 │     const input = fixture.nativeElement.querySelector('input');
161 │ 
162 ▶     expect(control.writeCount).toBe(1); // Initial write
163 │ 
164 │     act(() => {
165 ▶       input.value = 'typing';
166 ▶       input.dispatchEvent(new Event('input'));
167 │     });
168 │ 
169 │     expect(fixture.componentInstance.f().value()).toBe('typing');
170 ▶     expect(control.writeCount).toBe(1); // Should still be 1 (No write-back!)
171 │   });
```

162 行目で最初の `writeValue` が 1 回、165〜166 行目で CVA の中の入力欄に打ったあとも、170 行目で 1 回のまま（書き戻しが無い）を確かめます。

## 4. name には書かない（38861ac41bb）と、その穴

📄 `angular/packages/core/src/render3/instructions/control.ts` L161–190 （▶ の行: 161, 164, 168–169, 176, 181–183, 185–187）

```ts
161 ▶   setInputOnDirectives(
162 │     inputName: string,
163 │     value: unknown,
164 ▶     writePredicate?: (currentValue: unknown) => boolean,
165 │   ): boolean {
166 │     const directiveIndices = this.tNode.inputs?.[inputName];
167 │     const hostDirectiveInputs = this.tNode.hostDirectiveInputs?.[inputName];
168 ▶     if (!directiveIndices && !hostDirectiveInputs) {
169 ▶       return false;
170 │     }
171 │ 
172 │     let wasSet = false;
173 │     if (directiveIndices) {
174 │       for (const index of directiveIndices) {
175 │         // Skip the control directive itself to avoid triggering its property setters
176 ▶         if (index === this.tNode.controlDirectiveIndex) {
177 │           continue;
178 │         }
179 │         const directive = this.lView[index];
180 │         const directiveDef = this.tView.data[index] as DirectiveDef<unknown>;
181 ▶         const matchesPredicate =
182 ▶           !writePredicate ||
183 ▶           writePredicate(readInputFromDirective(directive, directiveDef, inputName));
184 │ 
185 ▶         if (matchesPredicate) {
186 ▶           writeToDirectiveInput(directiveDef, directive, inputName, value);
187 ▶           wasSet = true;
188 │         }
189 │       }
190 │     }
```

📄 `angular/packages/core/src/render3/instructions/control.ts` L289–307 （▶ の行: 294, 300, 303, 306）

```ts
289 │ function readInputFromDirective(
290 │   instance: unknown,
291 │   directiveDef: DirectiveDef<unknown>,
292 │   inputName: string,
293 │ ): unknown {
294 ▶   if (!directiveDef.inputs || !Object.hasOwn(directiveDef.inputs, inputName)) {
295 │     return undefined;
296 │   }
297 │ 
298 │   const [privateName, flags] = directiveDef.inputs[inputName];
299 │ 
300 ▶   if ((flags & InputFlags.SignalBased) !== 0) {
301 │     const field = (instance as any)[privateName];
302 │     const node = field[SIGNAL] as InputSignalNode<unknown, unknown> | undefined;
303 ▶     return node!.value === REQUIRED_UNSET_VALUE ? undefined : node!.value;
304 │   }
305 │ 
306 ▶   return (instance as any)[privateName];
307 │ }
```

38861ac41bb（2026-08-28、#69677）は core の `setInputOnDirectives` に 164 行目の `writePredicate` を足しました。181〜183 行目で、今その input に入っている値（`readInputFromDirective`）を predicate に渡し、真のときだけ 186 行目で書きます。今の値の読み方は 300〜303 行目（signal の input は node の値、まだ一度も書かれていない required の input は `undefined`）と 306 行目（デコレーターの `@Input` はプロパティ）です。3 節の 124〜125 行目の `isDefinedPredicate` は `value == null` を返すので、「**name がまだ空のときだけ書く**」です（名前は「定義されているか」ですが、真になるのは定義されていないときです）。

#69677 は、`mat-radio-group` に `[name]="item().id"` と書いても `[formField]` が自動の名前（`form0.items.0` のような道のり）で上書きし、ドラッグで並べ替えたときにブラウザが radio の選択を消す、という報告でした。利用者が `[name]` を書いていれば、その値は空でないので、自動の名前は書かれません。interop.spec.ts の 666 行目と 693 行目の 2 本（デコレーターの input と signal の input）がそれを固めています。

> [!WARNING]
> **ハマりどころ**
>
> この predicate は「空かどうか」しか見ないので、**利用者が書いた名前と、`[formField]` が前に書いた自動の名前を区別しません**。1 回目の更新で自動の名前（`root.items.1.v`）を書くと、その CVA の `name` はもう空でないので、あとで道のりが変わっても書き直されません。8576f161ae4 の作業木に spec を 1 つ足して確かめると、配列 `items` の先頭を消したあと、残った行のネイティブの input の `name` は `root.items.0.v` に変わり、同じ行の CVA の `name` は `root.items.1.v` のままでした。さらに末尾に 1 行足すと、新しい行の CVA も `root.items.1.v` を受け取り、2 つの CVA が同じ名前になりました（下のデモの「name の追従」で同じことが見られます。22.1.6 も同じコードです）。CVA が中で radio を作るなら、2 つの行の radio が 1 つのグループになります。gh の検索では、この形の issue と PR は見つかりませんでした（近いのは、min・max などの制約の input を CVA で上書きしない #70970、開いている PR）。

## 5. 標準の forms の setUpControl との違い

|   | 標準の forms（`setUpControl`） | `[formField]`（`cvaControlCreate`） |
| --- | --- | --- |
| 呼ぶ順（最初） | `writeValue` → `setDisabledState` → `registerOnChange` → `registerOnTouched`（[forms-setup-control](../forms/10-forms-setup-control.md) の 1 節） | `registerOnChange` → `registerOnTouched`（作るとき、1 節）→ `writeValue` → `setDisabledState`（最初の更新、3 節） |
| いつ | `ngOnChanges` の中で一度に | 作るのは `ɵngControlCreate`（作成の命令の中）、書くのは `ɵɵcontrol`（テンプレートの更新のたび） |
| モデル → CVA | control の `registerOnChange` に渡した関数が `writeValue`（`emitModelToViewChange` が false なら呼ばない） | 更新のたびに `controlValue()` を前回書いた値と比べて `writeValue`（3 節 91〜97 行目） |
| CVA → モデル | `updateOn`（change・blur・submit）で `setValue` | `controlValue.set`。モデルに移すのは `debounce` のルール（1 節 45 行目） |
| disabled | `control.disable()` のたびに `setDisabledState` | `disabled()` が変わったときに `setDisabledState`、加えて `disabled` の input にも（3 節 102・109 行目） |
| そのほかの状態 | 書かない（CVA が `NgControl` を inject して読む） | 16 個を、その名前の input を持つ全部のディレクティブに書く（3 節 99〜106 行目） |
| 検証 | 同じ要素の `NG_VALIDATORS` を control の validator に足す | 同じ要素の `NG_VALIDATORS` を computed で走らせ、parseErrors に（2 節） |
| reset | `control.reset()` → 値の変化として `writeValue` | 値が同じでも必ず `writeValue`（3 節 81〜87 行目） |
| `NgControl` | 本物（`FormControlDirective` など） | 偽物の `InteropNgControl`（6 節） |

呼ぶ順の違いは、CVA の実装によっては効きます。標準の forms では `writeValue` が `registerOnChange` より先なので、`writeValue` の中で `onChange` を呼んでも、まだ空の関数です。`[formField]` では `registerOnChange` が先に済んでいるので、`writeValue` の中で `onChange` を呼ぶ CVA（値を整形して返し直すものなど）は、最初の `writeValue` の時点でフィールドの `controlValue` を書き換え、dirty にします。下のデモの 2 列は、この順の違いをそのまま並べています。

## 6. InteropNgControl：あるものと無いもの（#69678）

📄 `angular/packages/forms/signals/src/controls/interop_ng_control.ts` L23–55 （▶ の行: 23–29, 38–39, 50–53）

```ts
23 ▶ // TODO: Also consider supporting (if possible):
24 ▶ // - hasError
25 ▶ // - getError
26 ▶ // - reset
27 ▶ // - name
28 ▶ // - path
29 ▶ // - markAs[Touched,Dirty,etc.]
30 │ 
31 │ /**
32 │  * Represents a combination of `NgControl` and `AbstractControl`.
33 │  *
34 │  * Note: We have this separate interface, rather than implementing the relevant parts of the two
35 │  * controls with something like `InteropNgControl implements Pick<NgControl, ...>, Pick<AbstractControl, ...>`
36 │  * because it confuses the internal JS minifier which can cause collisions in field names.
37 │  */
38 ▶ interface CombinedControl {
39 ▶   value: unknown;
40 │   valid: boolean;
41 │   invalid: boolean;
42 │   touched: boolean;
43 │   untouched: boolean;
44 │   disabled: boolean;
45 │   enabled: boolean;
46 │   errors: ValidationErrors | null;
47 │   pristine: boolean;
48 │   dirty: boolean;
49 │   status: FormControlStatus;
50 ▶   control: AbstractControl<any, any>;
51 ▶   valueAccessor: ControlValueAccessor | null;
52 ▶   hasValidator(validator: ValidatorFn): boolean;
53 ▶   updateValueAndValidity(): void;
54 │ }
55 │ 
```

📄 `angular/packages/forms/signals/src/controls/interop_ng_control.ts` L113–131 （▶ の行: 114, 117, 120, 123, 126）

```ts
113 │   get status(): FormControlStatus {
114 ▶     if (this.field().disabled()) {
115 │       return 'DISABLED';
116 │     }
117 ▶     if (this.field().valid()) {
118 │       return 'VALID';
119 │     }
120 ▶     if (this.field().invalid()) {
121 │       return 'INVALID';
122 │     }
123 ▶     if (this.field().pending()) {
124 │       return 'PENDING';
125 │     }
126 ▶     throw new RuntimeError(
127 │       RuntimeErrorCode.UNKNOWN_STATUS,
128 │       ngDevMode && 'Unknown form control status',
129 │     );
130 │   }
131 │ 
```

`[formField]` は `NgControl` としてこのクラスを provide します（provide の行は [signal-forms](../signals/17-signal-forms.md) の 8 節、`value` などの getter は [forms-sf-submit-compat](../forms/19-forms-sf-submit-compat.md) の 7 節）。持っているのは 38〜54 行目の `CombinedControl` の分だけです。39 行目の `value` は、54a985c5ca8 で `any` から `unknown` になりました。113〜130 行目の `status` は disabled・valid・invalid・pending の順に見て、どれでもなければ 126 行目で `UNKNOWN_STATUS` を投げます。

23〜29 行目の TODO に並ぶ `hasError`・`getError`・`reset`・`name`・`path`・`markAs…` は無く、`valueChanges`・`statusChanges`・`events` の Observable もありません。#69678（2026-07-08、開いている）は、`NgControl` を inject して `statusChanges` を購読する設計の部品（Taiga UI・Kendo など）が、`[formField]` の下では `undefined` を購読しようとして落ちる、という報告です。作業木の spec で確かめると、`statusChanges`・`valueChanges`・`getError` はどれも `undefined` でした。型の上では `AbstractControlDirective.control` は `AbstractControl` のままなので、コンパイルでは気づけません（`control` は自分自身を `AbstractControl` に cast して返すため。[forms-sf-submit-compat](../forms/19-forms-sf-submit-compat.md) の 7 節）。メンテナーの返事は「Signal Forms を Observable に依存させたくない」で、足す PR（#67087、2026-02-16、開いている）は止まっています。選択肢として「制限を文書にする」「回避策を示す」「取り出した `NgControl` に Observable を足す関数を出す」が挙がっています。

## 7. #68246：CVA の中の \[pattern\]

#68246（2026-04-16、開いている）は、CVA のコンポーネントが `@Input() pattern: string` を持ち、自分のテンプレートで `<input ngModel [pattern]="pattern">` に渡しているとき、`[formField]` を付けると `TypeError: regex.test is not a function` になる、という報告です。3 節の 99〜106 行目は 16 個の名前を全部書くので、フィールドに `pattern` のルールが無くても、`pattern()` の値の空の配列 `[]` が CVA の `pattern` の input に書かれます。作業木の spec と下のデモで、`@Input pattern ← []` が書かれることを確かめました。中の `PatternValidator` はそれを正規表現として扱って落ちます（issue の再現）。

メンテナーの答えは「`pattern` の型が合わない（`readonly RegExp[]` と `string`）ことは、テンプレートの型検査が見つける」で、実際に型が合わないと TS2322 になります（コメントの報告）。つまり今の約束は「`[formField]` を付ける CVA は、16 個の名前の input を Signal Forms の型で持つか、持たないか」です。ライブラリの作者からは「`pattern` の input を消すしかない」という声が出ていて、#70970（開いている PR）は min・max・minLength・maxLength について「利用者が明示的に書いた値は上書きしない」形を出しています。

## 8. DEMO：同じ CVA を \[formField\] と \[formControl\] に

> **🧪 DEMO — CVA に呼ばれたメソッドの順**
>
> 本物の `@angular/forms/signals` と `@angular/forms`（22.1.6）です。章の中の小さな CVA（`sfdcva-box`）は、4 つのメソッドと、デコレーターの `@Input` の `name`・`pattern` の setter が呼ばれるたびに記録します。左は `form(model, s, {name: 'demo'})` の `f.text`（`disabled(p.text, {when: lock})`）、右は `new FormControl('あ')` です。ボタンは両方に同じ操作をします。
>
> `@for (item of f.items; track item)` の各行に、同じ CVA と、ネイティブの `<input [formField]>` を並べています。表は描画のあとに、フィールドの `name()`・CVA の `name`・DOM の `name` を読んだものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sfd-cva)

- **開いた直後**：左は `registerOnChange` → `registerOnTouched` → `writeValue("あ")` → `setDisabledState(false)` → `name ← "demo.text"` → `pattern ← []`、右は `writeValue("あ")` → `setDisabledState(false)` → `registerOnChange` → `registerOnTouched` です（5 節の表の 1 行目）。右には `name` と `pattern` が出ません。
- **入力欄に打つ**：両方とも `onChange` のあとに `writeValue` が来ません（左は 1 節の 44 行目）。
- **外から値を変える**：両方とも `writeValue` が 1 回です。左は変更検知のときに、右は `setValue` の中で同期的に呼ばれます。
- **disabled**：左も右も `setDisabledState` です。左は `disabled()` が変わった更新のときだけで、何度押しても 1 回ずつです。
- **reset()**：左は値が変わっていなくても `writeValue("あxい")` のように今のモデルの値で来ます（3 節 85 行目）。右の `ctrl.reset()` は初期値の `null`（`nonNullable` でない `FormControl` の既定値）に戻すので `writeValue(null)` です。
- **name の追従**：「先頭を消す」と、残った行の「CVA の name」だけが古い道のり（`demo.items.1.v`）のまま赤くなり、ネイティブの input は `demo.items.0.v` に変わります。記録にも `@Input name` の行が出ません。続けて「末尾に足す」と、新しい行の CVA が同じ `demo.items.1.v` を受け取ります。

## ここまでの呼び出し

- `ɵngControlCreate` → `cvaControlCreate(host, this)` — form\_field.ts（第 1 回） — *CVA があればネイティブ・カスタムより先*
  - `cva.registerOnChange(v => { bindings.controlValue = v; controlValue.set(v) })` — control\_cva.ts 40–46
  - `cva.registerOnTouched(() => markAsTouched())` — 47
  - `injector.get(NG_VALIDATORS, self)` → computed → `parseErrorsSource.set` — 49–79
  - `registerAsBinding({ reset })` — 81–87
- `ɵɵcontrol` → 返した関数 — 89 — *更新のたび*
  - `untracked(() => cva.writeValue(controlValue))` — 93–97 — *前回と違うときだけ*
  - `host.setInputOnDirectives(name, value, name === 'name' ? isDefinedPredicate : undefined)` — 102–106 → core control.ts 161–190
  - `untracked(() => cva.setDisabledState(disabled))` — 108–109
- 👤 CVA が `onChange('x')`
  - `bindings.controlValue = 'x'` → 次の更新で `writeValue` しない — 44 → 93

## テストと直し方

| spec（packages/forms/signals/test/web/interop.spec.ts） | 固めていること |
| --- | --- |
| 59 行目 `describe('ControlValueAccessor')` › 119 行目 `it('synchronizes value')` | モデル → CVA と CVA → モデル |
| 148 行目 `it('should not write back to CVA on view change')` | 1 節 44 行目（2e9aeea0fed） |
| 173 行目 `it('propagates parse errors from legacy NG_VALIDATORS to field')`・231 行目 `it('should re-evaluate parse errors when registerOnValidatorChange is called')` | 2 節（f9f24fc6699） |
| 308 行目 `it('should support debounce')`・541 行目 `it('should reflect latest written value in NgControl.value when debounce is active')`・603 行目 `it('should not write stale model values back to a CVA while debounce is pending')` | 3 節 91 行目（2e0cb52dbf0）と 6 節の `value` |
| 376 行目 `it('should propagate disabled status from field')` | 3 節 108〜109 行目 |
| 666 行目・693 行目 ``it('should be able to set the `name` … input on a custom CVA')``、720 行目 `describe('properties')` › 946 行目 `describe('name')` | 4 節（38861ac41bb） |
| 1354 行目 `describe('reset')` › 1355 行目 `it('should unconditionally call writeValue on CVA during reset')` | 3 節 81〜87 行目（849dba6c650） |

📄 `ターミナル（~/angular-research/angular で実行、2026-11-16）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/signals/test/web:test_chromium --nocache_test_results --test_output=all
```

📄 `走らせた結果（下の 5 行は作業木に足した spec の console.log）`

```
Chromium: 1/1 test files | 350 passed, 0 failed
（作業木に spec を 1 つ足して同じ target）: 356 passed, 0 failed
  ORDER formField:   registerOnChange | registerOnTouched | writeValue("a") | setDisabledState(false) | name=root | pattern=[]
  ORDER formControl: writeValue("a") | setDisabledState(false) | registerOnChange | registerOnTouched
  NAME before=["root.items.0.v","root.items.1.v"] afterRemove=["root.items.1.v"] native=["root.items.0.v"]
       afterAdd=["root.items.1.v","root.items.1.v"]
  INTEROP statusChanges=undefined valueChanges=undefined getError=undefined
```

- CVA に**呼ぶ順や回数**がおかしいなら `control_cva.ts` の `cvaControlCreate`。`writeValue` の回数は 1 節 44 行目・3 節 84 行目と 93 行目の `bindings` の扱いです。足す先は interop.spec.ts の 59 行目の describe（`writeCount` を数える `CustomControl` がすでにある）。
- 4 節の **name の追従**を直すなら、`control_cva.ts` の 102〜106 行目で渡す predicate を「空か、前回この関数が渡した自動の名前と同じなら書く」にする形です（前回の値は、101 行目の `bindingUpdated` が上書きする前の `bindings['name']`）。足す spec は interop.spec.ts の 946 行目の `describe('name')` に、配列の行を消したあとの `name` を見る it です。
- **InteropNgControl** のメンバーなら `interop_ng_control.ts`。足す先は interop.spec.ts の、`NgControl` を inject する CVA の spec（399 行目 ``it(`should use 'NgControl.valueAccessor' …`)`` の形）。

## 聞かれそうな質問

**Q. CVA と FormValueControl の両方を実装したコンポーネントに \[formField\] を付けたら、どちらで動きますか？**

CVA です。`ɵngControlCreate` は `controlValueAccessor` があればそれを先に選び、カスタムコントロールの枝はその次です（[第 1 回](01-sfd-form-field.md)）。ただし両方を 1 つのコンポーネントに書いた #68078（`transformedValue` と組み合わせて NG0200）は、「2 つは別の書き方で、どちらか 1 つにする」という答えで閉じられています。

**Q. なぜ registerOnChange が writeValue より先なのですか？**

作るとき（`ɵngControlCreate`）にやることと、更新のたび（`ɵɵcontrol`）にやることが分かれているからです。`registerOnChange`・`registerOnTouched` は 1 回だけでよいので作るとき（40・47 行目）、`writeValue` は値が変わるたびなので返す関数の中（96 行目）です。最初の `writeValue` は、最初の更新で `bindings` が空なので必ず呼ばれます。

**Q. debounce を付けたら CVA に古い値が書き戻されました。**

2e0cb52dbf0（2026-06-19）より前の版です。2e9aeea0fed で 44 行目が入ったあと、93 行目が `value()`（debounce 前の古い値）と比べていたので「違う」と判断して `writeValue` していました。今は 91 行目で `controlValue()` を読みます。サイトの 22.1.6 には入っています。

**Q. CVA の中で NgControl を inject して statusChanges を購読できますか？**

できません。inject されるのは `InteropNgControl` で、`statusChanges` は `undefined` です（6 節、#69678 が開いている）。`status`・`valid`・`errors` などの getter は毎回フィールドの signal を読むので、テンプレートや `computed` の中で読めば変化に追従します。

**Q. CVA に name を渡したいとき、\[formField\] と \[name\] のどちらが勝ちますか？**

`[name]` です。3 節の 102〜106 行目が `isDefinedPredicate` を渡すので、name が空でなければ `[formField]` は書きません（38861ac41bb）。逆に、`[name]` を書かなかったときは最初の自動の名前のまま固定され、配列の行が動いても追従しません（4 節の囲み）。

## 読み終えて

- `[formField]` の CVA は、作るときに `registerOnChange`・`registerOnTouched`、更新のたびに `writeValue`・状態の input・`setDisabledState` の順で呼ばれ、標準の forms と順が逆です。
- `writeValue` は「前回書いた値」と `controlValue()` を比べて決まります。CVA から来た値は書いたことにし（2e9aeea0fed）、比べる相手を debounce 前の値にした（2e0cb52dbf0）ので、書き戻しも古い値の書き戻しも起きません。
- 同じ要素の `NG_VALIDATORS` は computed で走り、parse エラーとしてフィールドに入ります（f9f24fc6699）。
- `name` は「空のときだけ書く」ので利用者の `[name]` が勝ちますが（38861ac41bb）、自動の名前も一度書くと追従しません。
- `InteropNgControl` は `NgControl` の一部だけで、Observable も `getError` もありません（#69678）。16 個の名前の input は型が合わないと壊れます（#68246）。

---

← 前: [カスタムコントロール：FormValueControl と FormCheckboxControl](04-sfd-custom-control.md)  
次: [spec と issue を読む：\[formField\] を固めているテスト](06-sfd-tests-issues.md) →
