[目次](../README.md) › [Signal Forms の \[formField\]：フィールドと DOM の境目](README.md) › 第 2 回 / 全 6 回

# ネイティブの要素：input・select・checkbox・radio の読み書き

> native.ts の getNativeControlValue と setNativeControlValue が input の type と今のモデルの値の型の組で値を読み書きする行、number | null を text の input につなぐ 41b1410cb8a と null の警告（37f3279fe78）の食い違い、属性を先に値を後に書く range の修正（3524de29f34）、打っている途中の数を残す修正とその revert（2e32872720e・7a626175f75）、radio の同期（9e37a58e14b）、select.ts の MutationObserver と文字の変化を捨てる判定（#71443）。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sfd-native)

---

[第 1 回](01-sfd-form-field.md)で `FormField` がネイティブの経路（`nativeControlCreate`）に入るまでを見ました。この章では、その経路の中で **DOM の要素から値を読む関数（`getNativeControlValue`）と書く関数（`setNativeControlValue`）が、`type` とモデルの型の組み合わせごとに何をするか**を 1 行ずつ追います。`number`・`date`・`range`・`radio`・`select` の扱いを入れた / 直したコミットと、入れてから 5 日で戻った修正（2e32872720e と revert の 7a626175f75）も差分で読みます。

読む対象は `packages/forms/signals/src/directive/native.ts`・`control_native.ts`・`select.ts` と、`@angular/forms` の `packages/forms/src/directives/native.ts`、spec は `test/web/form_field.spec.ts`・`number_input.spec.ts` です。`nativeControlCreate` の前半（parser を作り、`input` と `blur` を購読する 42〜65 行目）と更新の関数（99〜129 行目）は [signal-forms](../signals/17-signal-forms.md) の 8 節で引用しました。ブラウザの検証（`validity.badInput`）と日付の input の監視は[第 3 回](03-sfd-validity.md)で読みます。

1. [1. FormField の全体](01-sfd-form-field.md)
2. **2. ネイティブの要素**（この章）
3. [3. parse エラーと validity](03-sfd-validity.md)
4. [4. カスタムコントロール](04-sfd-custom-control.md)
5. [5. ControlValueAccessor との互換](05-sfd-cva.md)
6. [6. spec と issue](06-sfd-tests-issues.md)

## 1. 読む：getNativeControlValue は「今のモデルの型」に合わせる

signal-forms の 8 節の 53 行目のとおり、parser の「解析する関数」は `input` イベントの引数を使わず、`getNativeControlValue(input, parent.state().value, validityMonitor)` で要素から直接読みます。その関数の前半（38〜49 行目、`badInput` なら parse エラー）は[第 3 回](03-sfd-validity.md)で引用します。その後の `type` ごとの枝です。

📄 `angular/packages/forms/signals/src/directive/native.ts` L50–79 （▶ の行: 52–57, 60–62, 65, 71–75）

```ts
50 │ 
51 │   // Special cases for specific input types.
52 ▶   switch (element.type) {
53 ▶     case 'checkbox':
54 ▶       return {value: element.checked};
55 ▶     case 'number':
56 ▶     case 'range':
57 ▶     case 'datetime-local':
58 │       // We can read a `number` or a `string` from this input type. Prefer whichever is consistent
59 │       // with the current type.
60 ▶       modelValue = untracked(currentValue);
61 ▶       if (typeof modelValue === 'number' || modelValue === null) {
62 ▶         return {value: element.value === '' ? null : element.valueAsNumber};
63 │       }
64 │       break;
65 ▶     case 'date':
66 │     case 'month':
67 │     case 'time':
68 │     case 'week':
69 │       // We can read a `Date | null`, `number`, or `string` from this input type. Prefer whichever
70 │       // is consistent with the current type.
71 ▶       modelValue = untracked(currentValue);
72 ▶       if (modelValue === null || modelValue instanceof Date) {
73 ▶         return {value: element.valueAsDate};
74 ▶       } else if (typeof modelValue === 'number') {
75 ▶         return {value: element.valueAsNumber};
76 │       }
77 │       break;
78 │   }
79 │ 
```

1. **checkbox は checked**

   53〜54 行目。`value` の属性は見ず、`element.checked`（`boolean`）を返します。
2. **number・range・datetime-local は「モデルが数か null なら数」**

   60 行目で**今のモデルの値**を `untracked` で読みます（parser の中で signal の依存を作らないため）。61 行目、それが `number` か `null` なら、62 行目で空の文字なら `null`、そうでなければ `valueAsNumber` を返します。モデルが文字列なら 64 行目の `break` で下の既定（文字列）へ進みます。`datetime-local` は HTML の仕様で `valueAsDate` が使えない type（読むと `null`）で、ここでは数（ミリ秒）か文字列だけを扱います。
3. **date・month・time・week は Date か数か文字列**

   71 行目でモデルを読み、72〜73 行目で `null` か `Date` なら `valueAsDate`、74〜75 行目で数なら `valueAsNumber` を返します。`valueAsDate` は UTC の 0 時の `Date` です（DEMO の d の行の `2026-11-16T00:00:00.000Z`）。

📄 `angular/packages/forms/signals/src/directive/native.ts` L80–97 （▶ の行: 81–85, 87–89, 91, 96）

```ts
80 │   // For text-like <input> elements, parse numeric values if the model is numeric.
81 ▶   if (element.tagName === 'INPUT' && element.type === 'text') {
82 ▶     modelValue ??= untracked(currentValue);
83 ▶     if (typeof modelValue === 'number' || modelValue === null) {
84 ▶       if (element.value === '') {
85 ▶         return {value: null};
86 │       }
87 ▶       const parsed = Number(element.value);
88 ▶       if (Number.isNaN(parsed)) {
89 ▶         return {error: new NativeInputParseError() as WithoutFieldTree<NativeInputParseError>};
90 │       }
91 ▶       return {value: parsed};
92 │     }
93 │   }
94 │ 
95 │   // Default to reading the value as a string.
96 ▶   return {value: element.value};
97 │ }
```

81〜93 行目は 41b1410cb8a（2026-02-24、feat(forms): support binding `number|null` to `<input type="text">`）が足した枝です。コミットの本文は、MDN が `<input type="number">` の代わりに `<input type="text" inputmode="numeric">` を使う場面を説明していることを挙げ、`number | null` のモデルを text の input にそのままつなげるようにした、と説明しています。83 行目でモデルが数か `null` のときだけ、84〜85 行目で空の文字を `null`、87 行目で `Number()` にかけ、88〜89 行目で `NaN` なら parse エラーを返します。82 行目の `??=` は、上の `switch` でもうモデルを読んでいれば読み直さないためです（text の input では `switch` のどの枝にも入らないので、ここで初めて読みます）。どれにも当たらなければ 96 行目で `element.value`（文字列）です。同じコミットは型チェックの側（`compiler-cli` の `signal_forms.ts`）も直し、`type="text"` に `number | null` のフィールドを渡しても NG8022 にならないようにしました（型チェックの仕組みは [typecheck-two-way](../typecheck/12-typecheck-two-way.md)）。

> [!NOTE]
> **ポイント**
>
> 読む側に「`type` がこれなら必ず数」という規則はありません。**モデルが今どの型の値を持っているか**で、返す型が決まります。だから `string` のモデルを `type="number"` につなぐと、モデルは文字列のまま（DEMO の s の行で `"7"（string）`）、`number` のモデルなら数になります。モデルの初期値を `undefined` にすると 61 行目にも 83 行目にも当たらず、最初の入力で文字列が入ります。

## 2. 書く：setNativeControlValue

更新の関数（signal-forms の 8 節の 119〜126 行目）は、`controlValue` が前回と違うときだけこの関数を呼びます。

📄 `angular/packages/forms/signals/src/directive/native.ts` L105–140 （▶ の行: 107–109, 111, 114, 120–121, 123–124, 133–134, 136–137）

```ts
105 │ export function setNativeControlValue(element: NativeFormControl, value: unknown) {
106 │   // Special cases for specific input types.
107 ▶   switch (element.type) {
108 ▶     case 'checkbox':
109 ▶       element.checked = value as boolean;
110 │       return;
111 ▶     case 'radio':
112 │       // Although HTML behavior is to clear the input already, we do this just in case. It seems
113 │       // like it might be necessary in certain environments (e.g. Domino).
114 ▶       element.checked = value === element.value;
115 │       return;
116 │     case 'number':
117 │     case 'range':
118 │     case 'datetime-local':
119 │       // This input type can receive a `number` or a `string`.
120 ▶       if (typeof value === 'number') {
121 ▶         setNativeNumberControlValue(element, value);
122 │         return;
123 ▶       } else if (value === null) {
124 ▶         element.value = '';
125 │         return;
126 │       }
127 │       break;
128 │     case 'date':
129 │     case 'month':
130 │     case 'time':
131 │     case 'week':
132 │       // This input type can receive a `Date | null` or a `number` or a `string`.
133 ▶       if (value === null || value instanceof Date) {
134 ▶         element.valueAsDate = value;
135 │         return;
136 ▶       } else if (typeof value === 'number') {
137 ▶         setNativeNumberControlValue(element, value);
138 │         return;
139 │       }
140 │   }
```

1. **checkbox と radio**

   109 行目で checkbox は `checked` にそのまま書きます。radio は 114 行目で「モデルの値と自分の `value` の属性が同じなら `checked`」です。同じ `name` の radio の中で 1 つを `checked` にすれば、ブラウザがほかを外しますが、112〜113 行目のコメントのとおり Domino（サーバーの DOM）のために自分で外しもします。
2. **number・range・datetime-local**

   120〜121 行目で数なら `setNativeNumberControlValue`、123〜124 行目で `null` なら空の文字です。文字列なら 127 行目の `break` で既定へ進みます。
3. **date・month・time・week**

   133〜134 行目で `null` か `Date` なら `valueAsDate`、136〜137 行目で数なら `valueAsNumber` に書きます。

📄 `angular/packages/forms/signals/src/directive/native.ts` L141–176 （▶ の行: 143–145, 148–150, 152, 158, 164, 171–172, 174）

```ts
141 │ 
142 │   // For text-like <input> elements, handle numeric and null values.
143 ▶   if (element.tagName === 'INPUT' && element.type === 'text') {
144 ▶     if (typeof value === 'number') {
145 ▶       element.value = isNaN(value) ? '' : String(value);
146 │       return;
147 │     }
148 ▶     if (value === null) {
149 ▶       if (typeof ngDevMode !== 'undefined' && ngDevMode) {
150 ▶         console.warn(
151 │           formatRuntimeError(
152 ▶             RuntimeErrorCode.TEXT_INPUT_NULL_VALUE,
153 │             `The text input ${element.name} received a null value. Text inputs should use empty strings to represent null values. ` +
154 │               ` The input's value will be set to an empty string instead.`,
155 │           ),
156 │         );
157 │       }
158 ▶       element.value = '';
159 │       return;
160 │     }
161 │   }
162 │ 
163 │   // Default to setting the value as a string.
164 ▶   element.value = value as string;
165 │ }
166 │ 
167 │ /** Writes a value to a native <input type="number">. */
168 │ export function setNativeNumberControlValue(element: HTMLInputElement, value: number) {
169 │   // Writing `NaN` causes a warning in the console, so we instead write `''`.
170 │   // This allows the user to safely use `NaN` as a number value that means "clear the input".
171 ▶   if (isNaN(value)) {
172 ▶     element.value = '';
173 │   } else {
174 ▶     element.valueAsNumber = value;
175 │   }
176 │ }
```

143〜147 行目は 41b1410cb8a の書く側で、text の input に数が来れば 145 行目で `String(value)`（`NaN` なら空）にします。148〜159 行目は、text の input が `null` を受けたときです。158 行目で空の文字を書き、その前の 149〜157 行目で開発モードだけ NG01921 の警告を出します。164 行目がそれ以外の全部で、文字列としてそのまま書きます。171〜172 行目は `NaN` を `valueAsNumber` に書くとブラウザが警告を出すので、空の文字にする工夫です（`NaN` を「欄を空にする」意味に使える）。

149〜157 行目の警告は 37f3279fe78（2026-07-14、refactor(forms): warn when a text input receives a null value in Signal Forms）が足しました。きっかけは #69757 で、API から来た `string | null` のデータを text の input につないだ利用者が、`null` が黙って空の文字になることに気づかなかった、という話です。issue の中で「型チェックが拾えない（`type` を束縛すると型は `any` と同じになる）ので、せめて実行時に警告を」という提案があり、それが入りました。

> [!WARNING]
> **ハマりどころ**
>
> この警告は、モデルの型を見ていません。148 行目の条件は「text の input で値が `null`」だけです。だから 1 節の 81〜93 行目（41b1410cb8a）で正式に扱えるようになった **`number | null` のモデルを text の input につなぐ使い方**でも、欄を空にしてモデルが `null` になるたびに NG01921 が出ます。`number_input.spec.ts` の `describe('text input with numeric model')`（169 行目）の 232 行目（欄を空にする）と 254 行目（`null` で始める）の it がちょうどこの組み合わせで、web の suite を走らせるとログに NG01921 が出ます（テストの節）。spec はコンソールの警告を確かめていないので、落ちません。

## 3. 属性を書く：setNativeDomProperty と日付の min / max

値と別に、`required`・`disabled`・`min` などの状態を属性として書くのがこの関数です（[第 1 回](01-sfd-form-field.md)の 7 節のとおり、`@angular/forms` の側にあります）。

📄 `angular/packages/forms/src/directives/native.ts` L43–81 （▶ の行: 54, 58–59, 61–65, 67, 74–75, 77）

```ts
43 │ /**
44 │  * Updates the native DOM property on the given node.
45 │  *
46 │  * @param renderer The renderer to use for DOM operations.
47 │  * @param element The native form control element.
48 │  * @param name The DOM attribute/property name.
49 │  * @param value The new value for the property.
50 │  */
51 │ export function setNativeDomProperty(
52 │   renderer: Renderer2,
53 │   element: NativeFormControl,
54 ▶   name: 'name' | 'disabled' | 'required' | 'readonly' | 'min' | 'max' | 'minLength' | 'maxLength',
55 │   value: string | number | boolean | undefined,
56 │ ) {
57 │   switch (name) {
58 ▶     case 'name':
59 ▶       renderer.setAttribute(element, name, value as string);
60 │       break;
61 ▶     case 'disabled':
62 ▶     case 'readonly':
63 ▶     case 'required':
64 ▶       if (value) {
65 ▶         renderer.setAttribute(element, name, '');
66 │       } else {
67 ▶         renderer.removeAttribute(element, name);
68 │       }
69 │       break;
70 │     case 'max':
71 │     case 'min':
72 │     case 'minLength':
73 │     case 'maxLength':
74 ▶       if (value !== undefined) {
75 ▶         renderer.setAttribute(element, name, value.toString());
76 │       } else {
77 ▶         renderer.removeAttribute(element, name);
78 │       }
79 │       break;
80 │   }
81 │ }
```

`Renderer2` を通すので、サーバーで描くときも同じ属性が出ます。59 行目の `name` はそのまま、61〜69 行目の真偽値の 3 つは `''` を付けるか外すか、74〜78 行目の数の 4 つは `toString()` するか外すかです。`pattern` は 54 行目の一覧に無く、`elementAcceptsNativeProperty` も `false` を返すので、`pattern()` の規則を付けても input に `pattern` の属性は付きません。

📄 `angular/packages/forms/signals/src/directive/native.ts` L191–211 （▶ の行: 192–193, 198, 204–206, 208）

```ts
191 │ function formatDateForInput(date: Date, type: 'date' | 'month'): string {
192 ▶   const year = date.getUTCFullYear();
193 ▶   const month = String(date.getUTCMonth() + 1).padStart(2, '0');
194 │ 
195 │   if (type === 'month') {
196 │     return `${year}-${month}`;
197 │   }
198 ▶   const day = String(date.getUTCDate()).padStart(2, '0');
199 │   return `${year}-${month}-${day}`;
200 │ }
201 │ 
202 │ export function formatDateForMinMax(name: string, value: unknown, type: string): unknown {
203 │   if (
204 ▶     value instanceof Date &&
205 ▶     (name === 'min' || name === 'max') &&
206 ▶     (type === 'date' || type === 'month')
207 │   ) {
208 ▶     return formatDateForInput(value, type);
209 │   }
210 │   return value;
211 │ }
```

`minDate` / `maxDate` の規則は `min` / `max` の状態に `Date` を入れます。204〜206 行目で `date` か `month` の input の `min` / `max` なら、208 行目で `YYYY-MM-DD`（か `YYYY-MM`）の文字にします。192〜198 行目は `getUTC…` で年月日を取り出します。1 節の `valueAsDate` も UTC の 0 時の `Date` を返すので、モデルの `Date` と属性の文字が同じ日付になります（1f30aacbe5d、2026-05-05）。

## 4. 書く順：3524de29f34（range が範囲の外の値を受けたとき）

更新の関数の中で、属性（`min` / `max`）と値のどちらを先に書くかで結果が変わります。`type="range"` の input は、`max` より大きい値を書かれると `max` に丸めるからです。

📄 `git show 3524de29f34（control_native.ts の部分）`

```
$ git show 3524de29f34 -- packages/forms/signals/src/directive/control_native.ts
# fix(forms): Add support for range type with outside of native bounds（2026-04-30、fixes #68480）
@@ -91,10 +91,6 @@ export function nativeControlCreate(
 
   return () => {
     const state = parent.state();
-    const controlValue = state.controlValue();
-    if (bindingUpdated(bindings, 'controlValue', controlValue)) {
-      setNativeControlValue(input, controlValue);
-    }
 
     for (const name of CONTROL_BINDING_NAMES) {
       const value = readFieldStateBindingValue(state, name);
@@ -106,6 +102,12 @@ export function nativeControlCreate(
       }
     }
 
+    // We need to update the value after setting the attributes as some attributes like min/max might prevent from setting the value
+    const controlValue = state.controlValue();
+    if (bindingUpdated(bindings, 'controlValue', controlValue)) {
+      setNativeControlValue(input, controlValue);
+    }
+
     updateMode = true;
   };
 }
```

変更の前は、値を先に書いてから属性を書いていました。モデルが `max` を後から広げると同時に大きな値になる場合（spec の 5773〜5774 行目）、値を書いた時点ではまだ古い `max`（または既定の 100）で丸められ、その後で `max` を広げても値は戻りませんでした（#68480）。変更の後は 102〜116 行目の属性のループの後に 119〜126 行目で値を書きます（今のコードは signal-forms の 8 節の引用で、118 行目のコメントがこの理由です）。

> [!NOTE]
> **ポイント**
>
> 丸められた値はモデルに戻りません。DEMO の n の行を range にして「n に 50」を押すと、モデルは `50`、DOM の value は `"10"`（`max` が 10）です。値を書くのは `controlValue` が変わったときだけで、丸めはブラウザの中で起き、`input` イベントも出ないからです。`max(p.n, 10)` の規則は `max` のエラーを出すので、モデルが範囲の外にあることはエラーで分かります。

## 5. 打っている途中の数：2e32872720e と revert

`number | null` のフィールドにつないだ `type="number"` の input に、1 文字ずつ打った記録です（下の DEMO と同じ部品、headless Chrome）。

📄 `打った文字と、描画の後の DOM の value`

```
# DEMO の n の行（number | null、type="number"）に 1 文字ずつ打った記録（headless Chrome 157、記録したときのサイトの 22.1.6）
# event: input イベントの時点の DOM の value / after: 描画の後の DOM の value
--- "-0" と打つ
event: value=""   badInput=true     after: ""        # "-" だけでは数でない → parse エラー、モデルはそのまま
event: value="-0" badInput=false    after: "0"       # モデルが -0 に変わる → valueAsNumber = -0 で書き直され "0" になる
--- "01" と打つ
event: value="0"  badInput=false    after: "0"
event: value="01" badInput=false    after: "1"       # 0 → 1 に変わる → "1" に書き直される
--- "1e5" と打つ
event: value="1"  badInput=false    after: "1"
event: value=""   badInput=true     after: ""        # "1e" は数でない
event: value="1e5" badInput=false   after: "100000"  # 1（エラーの前のまま）→ 100000 に変わる → 書き直される
--- "1.50" と打つ
event: value="1"   after: "1"
event: value="1"   after: "1"                         # "1." は value では "1"。モデルは 1 のまま → 書かない
event: value="1.5" after: "1.5"
event: value="1.50" after: "1.50"                     # 1.5 のまま → 書かない（打った文字が残る）
```

書き直しが起きるのは、**解析した数が前回の `controlValue` と違い、かつその数を書いた文字が打った文字と違うとき**です。`"-0"` は `-0` になり、前回の `1` と違うので、2 節の 121 行目 → 174 行目の `valueAsNumber = -0` で `"0"` に書き直されます。`"01"` も `"1e5"` も同じです。`"1.50"` は `1.5` のままなので書かれず、打った文字が残ります。#69635 は、この書き直しで「打った文字が消える」という報告です（v21 から、開いたまま）。

2e32872720e（2026-07-15、#69637）は、parser が書いた値を「もう要素に出ている値」として先に箱に入れることで、次の更新で書き直さないようにしました。

📄 `git show 2e32872720e（src の部分）`

```
$ git show 2e32872720e -- packages/forms/signals/src
# fix(forms): preserve intermediate number values in signal forms（2026-07-15、#69637、Fixes #69635）
diff --git a/packages/forms/signals/src/directive/bindings.ts b/packages/forms/signals/src/directive/bindings.ts
--- a/packages/forms/signals/src/directive/bindings.ts
+++ b/packages/forms/signals/src/directive/bindings.ts
@@ -76,7 +76,7 @@ export function bindingUpdated<TKey extends string>(
   key: TKey,
   value: unknown,
 ) {
-  if (bindings[key] !== value) {
+  if (!Object.is(bindings[key], value)) {
     bindings[key] = value;
     return true;
   }
diff --git a/packages/forms/signals/src/directive/control_native.ts b/packages/forms/signals/src/directive/control_native.ts
--- a/packages/forms/signals/src/directive/control_native.ts
+++ b/packages/forms/signals/src/directive/control_native.ts
@@ -41,13 +41,19 @@ export function nativeControlCreate(
 ): () => void {
   let updateMode = false;
   const input = parent.nativeFormElement;
+  const bindings = createBindings<ControlBindingKey | 'controlValue'>();
 
   // TODO: (perf) ok to always create this?
   const parser = createParser(
     // Read from the model value
     () => parent.state().value(),
     // Write to the buffered "control value"
-    (rawValue: unknown) => parent.state().controlValue.set(rawValue),
+    (rawValue: unknown) => {
+      // Mark the parsed value as already seen from this native control so the next update pass
+      // does not reformat and write it back over the user's in-progress input text.
+      bindings['controlValue'] = rawValue;
+      parent.state().controlValue.set(rawValue);
+    },
     // Our parse function doesn't care about the raw value that gets passed in,
     // It just reads the newly parsed value directly off the input element.
     (_rawValue: unknown) => getNativeControlValue(input, parent.state().value, validityMonitor),
@@ -94,8 +100,6 @@ export function nativeControlCreate(
     );
   }
 
-  const bindings = createBindings<ControlBindingKey | 'controlValue'>();
-
   return () => {
     const state = parent.state();
 
diff --git a/packages/forms/signals/src/directive/native.ts b/packages/forms/signals/src/directive/native.ts
--- a/packages/forms/signals/src/directive/native.ts
+++ b/packages/forms/signals/src/directive/native.ts
@@ -84,8 +84,8 @@ export function getNativeControlValue(
       if (element.value === '') {
         return {value: null};
       }
-      const parsed = Number(element.value);
-      if (Number.isNaN(parsed)) {
+      const parsed = parseDecimalNumber(element.value);
+      if (parsed === undefined) {
         return {error: new NativeInputParseError() as WithoutFieldTree<NativeInputParseError>};
       }
       return {value: parsed};
@@ -164,6 +164,17 @@ export function setNativeControlValue(element: NativeFormControl, value: unknown
   element.value = value as string;
 }
 
+function parseDecimalNumber(value: string): number | undefined {
+  const parsed = Number(value);
+  // `parseFloat` does not consume non-decimal prefixes like `0b`/`0x`, while `Number`
+  // rejects trailing garbage. Requiring both to agree keeps decimal input permissive
+  // without accepting other JavaScript numeric literal forms.
+  if (Number.isNaN(parsed) || !Object.is(parsed, parseFloat(value))) {
+    return undefined;
+  }
+  return parsed;
+}
+
 /** Writes a value to a native <input type="number">. */
 export function setNativeNumberControlValue(element: HTMLInputElement, value: number) {
   // Writing `NaN` causes a warning in the console, so we instead write `''`.
```

1. **bindings.ts：`!==` を `Object.is` に**

   `0 !== -0` は `false` なので、`-0` と `0` を区別するために要ります（`NaN` も同時に直る）。
2. **control\_native.ts：parser が書いた値を箱に入れる**

   `bindings` を parser より前に作り、`controlValue.set(rawValue)` の直前に `bindings['controlValue'] = rawValue` とします。次の更新の `bindingUpdated` は「前回と同じ」と判断し、`setNativeControlValue` を呼びません。
3. **native.ts：text の input の数の解析を厳しく**

   レビューで「`Number('0x22')` が 34 になる」と指摘され、`Number()` と `parseFloat()` の結果が一致するときだけ数とする `parseDecimalNumber` を足しました。

📄 `git show 7a626175f75`

```
$ git log -1 --format='%h %ad%n%B' --date=short 7a626175f75
7a626175f75 2026-07-20
Revert "fix(forms): preserve intermediate number values in signal forms"

This reverts commit 2e32872720ee95f24029d20e24e91edbc2054b1e.

$ git show --stat --format= 7a626175f75
 packages/forms/signals/src/directive/bindings.ts   |   2 +-
 .../forms/signals/src/directive/control_native.ts  |  10 +-
 packages/forms/signals/src/directive/native.ts     |  15 +-
 .../forms/signals/test/web/number_input.spec.ts    | 160 +--------------------
 4 files changed, 7 insertions(+), 180 deletions(-)
```

5 日後の 7a626175f75 で、3 つのファイルとも元に戻りました。revert のコミットの本文は git の既定の 1 行だけで、理由は書かれていません。#69635 には、マージの翌日（2026-07-16）にメンテナーが「breaking だったので #69637 を revert する」と書いています。22.0.x に入った同じ変更も #69851 で戻りました。何が壊れたかは、revert のコミットにも、#69850・#69851 の本文にも、#69635 のコメントにも書かれていません。その後、同じ issue に対して別の作者の #70391（フォーカスがあり、打っている途中の形の文字のときだけ書き直しを止める形）が 2026-08-26 に出され、開いたままです。bindings.ts の `Object.is` の部分だけは、angular-main の e118e155271（2026-10-05）で別に入り直しました（[第 1 回](01-sfd-form-field.md)の 5 節）。

## 6. radio：9e37a58e14b（value だけが変わった radio）

2 節の 114 行目のとおり、radio の `checked` は「モデルの値」と「自分の `value` の属性」の 2 つで決まります。ところが更新の関数は、もともと `controlValue` が変わったときしか書きませんでした。

📄 `git show 9e37a58e14b（control_native.ts の部分）`

```
$ git show 9e37a58e14b -- packages/forms/signals/src/directive/control_native.ts
# fix(forms): keep radio inputs in sync when values change（2026-07-31）
@@ -117,7 +117,11 @@ export function nativeControlCreate(
 
     // We need to update the value after setting the attributes as some attributes like min/max might prevent from setting the value
     const controlValue = state.controlValue();
-    if (bindingUpdated(bindings, 'controlValue', controlValue)) {
+    const controlValueChanged = bindingUpdated(bindings, 'controlValue', controlValue);
+    const radioValueChanged =
+      input.type === 'radio' && bindingUpdated(bindings, 'radioValue', input.value);
+
+    if (controlValueChanged || radioValueChanged) {
       setNativeControlValue(input, controlValue);
     }
```

`@for` の `track` で要素が使い回され、モデルはそのままで `[value]` だけが変わると、`checked` が古いままになります（spec の場面）。このコミットで、radio のときは `input.value` も箱（`'radioValue'`）に入れて比べ、どちらかが変われば書くようにしました。同じコミットで、標準の forms の `RadioControlValueAccessor` にも `ngOnChanges` で `value` の変化を拾う修正が入っています。DEMO の radio の行の「value を入れ替える」が、spec と同じ入れ替え（`shared` の要素の `value` が `other` から `selected` に変わる）です。

## 7. select：option が後から来る

📄 `angular/packages/forms/signals/src/directive/control_native.ts` L74–97 （▶ の行: 75–76, 81–82, 88–89, 91, 97）

```ts
74 │   // The native `<select>` tracks its `value` by keeping track of the selected `<option>`.
75 ▶   // Therefore if we set the value to an arbitrary string *before* the corresponding option has been
76 ▶   // created, the `<select>` will ignore it.
77 │   //
78 │   // This means that we need to know when an `<option>` is created, destroyed, or has its `value`
79 │   // changed so that we can re-sync the `<select>` to the field state's value. We implement this
80 │   // using a `MutationObserver` that we create to observe `<option>` changes.
81 ▶   if (input.tagName === 'SELECT') {
82 ▶     observeSelectMutations(
83 │       input as HTMLSelectElement,
84 │       () => {
85 │         // It's not legal to access `parent.state()` until update mode has run, but
86 │         // `observeSelectMutations` may fire earlier. It's okay to ignore these early notifications
87 │         // because we'll write `input.value` in that first update pass anyway.
88 ▶         if (!updateMode) {
89 ▶           return;
90 │         }
91 ▶         input.value = parent.state().controlValue() as string;
92 │       },
93 │       parent.destroyRef,
94 │     );
95 │   }
96 │ 
97 ▶   const bindings = createBindings<ControlBindingKey | 'controlValue' | 'radioValue'>();
```

`<select>` の `value` は「選ばれている `<option>`」で決まるので、75〜76 行目のコメントのとおり、該当する option がまだ無いうちに `value` を書いても無視されます。`@for` で option を作る場合、最初の更新では option がまだ描かれていないことがあります。そこで 81 行目で `SELECT` なら、option の変化を見張って 91 行目で `controlValue` を書き直します。88〜89 行目は、最初の更新（`updateMode = true`、更新の関数の 128 行目。signal-forms の 8 節の引用）より前の通知を捨てます。`parent.state()` は最初の更新の前には読めない（`[formField]` の input がまだ入っていない）からです。

📄 `angular/packages/forms/signals/src/directive/select.ts` L19–45 （▶ の行: 24, 29–31, 35–36, 40–42, 44）

```ts
19 │ export function observeSelectMutations(
20 │   select: HTMLSelectElement,
21 │   onMutation: () => void,
22 │   destroyRef: DestroyRef,
23 │ ): void {
24 ▶   if (typeof MutationObserver !== 'function') {
25 │     // Observing mutations is best-effort.
26 │     return;
27 │   }
28 │ 
29 ▶   const observer = new MutationObserver((mutations) => {
30 ▶     if (mutations.some((m) => isRelevantSelectMutation(m))) {
31 ▶       onMutation();
32 │     }
33 │   });
34 │   observer.observe(select, {
35 ▶     attributes: true,
36 ▶     attributeFilter: ['value'],
37 │     // We watch the character data, because an `<option>` with no explicit `value` property set uses
38 │     // its text content as its value.
39 │     // (See https://developer.mozilla.org/en-US/docs/Web/API/HTMLOptionElement/value)
40 ▶     characterData: true,
41 ▶     childList: true,
42 ▶     subtree: true,
43 │   });
44 ▶   destroyRef.onDestroy(() => observer.disconnect());
45 │ }
```

📄 `angular/packages/forms/signals/src/directive/select.ts` L47–80 （▶ の行: 55, 57, 61–62, 66–67, 72, 75–76）

```ts
47 │ /**
48 │  * Checks if a given mutation record is relevant for resyncing a <select>.
49 │  * In general its relevant if:
50 │  * - Non comment content of the select changed
51 │  * - The value attribute of an option changed.
52 │  */
53 │ function isRelevantSelectMutation(mutation: MutationRecord) {
54 │   // Consider changes that may add / remove options, or change their text content.
55 ▶   if (mutation.type === 'childList' || mutation.type === 'characterData') {
56 │     // If the target element is a comment it's not relevant.
57 ▶     if (mutation.target instanceof Comment) {
58 │       return false;
59 │     }
60 │     // Otherwise if any non-comment nodes were added / removed it is relevant.
61 ▶     for (const node of mutation.addedNodes) {
62 ▶       if (!(node instanceof Comment)) {
63 │         return true;
64 │       }
65 │     }
66 ▶     for (const node of mutation.removedNodes) {
67 ▶       if (!(node instanceof Comment)) {
68 │         return true;
69 │       }
70 │     }
71 │     // Otherwise it's not relevant.
72 ▶     return false;
73 │   }
74 │   // If the value attribute of an option changed, it's relevant.
75 ▶   if (mutation.type === 'attributes' && mutation.target instanceof HTMLOptionElement) {
76 ▶     return true;
77 │   }
78 │   // Everything else is not relevant.
79 │   return false;
80 │ }
```

34〜43 行目で、`value` の属性（35〜36）、文字の変化（40）、子の追加と削除（41）を、子孫まで（42）見張ります。40 行目のコメントは「`value` の属性の無い option は文字が `value` になるので、文字の変化も見る」と言っています。ところが 53〜80 行目の判定では、`characterData` の記録も 55 行目の枝に入り、61〜70 行目で `addedNodes` / `removedNodes` を見ます。文字が変わっただけの記録では両方とも空なので、72 行目で `false` になります。つまり 40 行目で見張っている変化は、いつも「関係ない」と判断されます。

> [!WARNING]
> **ハマりどころ**
>
> これが開いている #71443（2026-10-20）の内容です。DEMO の select の行（モデルは `"two"`、option は `one` と `{{ label() }}`）で、「2 つ目の option の文字を two に」を押しても `value` は `""`・`selectedIndex=-1` のままです。続けて「option two を足す」を押すと、子の追加（`childList`）で 91 行目が走り、`value="two"`・`selectedIndex=1`（文字を変えた 2 つ目の option）になります。サイトの 22.2.6 の `isRelevantSelectMutation` も同じ形です。

## 8. DEMO：type とモデルの型の組み合わせ

> **🧪 DEMO — 打った文字・モデルの値・DOM の value**
>
> 本物の `@angular/forms/signals`（22.2.6）です。`form(signal({ s: '42', n: 5, d: null, sel: 'two', r: 'selected' }), p => { min(p.n, 0); max(p.n, 10) })` の 5 つのフィールドを、`[type]` を束縛した input・select・radio につないでいます。表は操作の後に 1 回だけ DOM を読み直したものです。「打った文字」は `input` イベントの時点の DOM の value（`badInput` ならその印）です。number | null のモデルを text の input につなぐ組み合わせは、欄を空にすると開発モードで NG01921 が出る（2 節）ので、この DEMO には入れていません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sfd-native)

手元の Chrome で押した結果のうち、コードの行で説明できるものです。

| 操作 | モデル | DOM | 理由（行） |
| --- | --- | --- | --- |
| s（string）を number にして `5e` と打つ | `"5"`（string） | `""`・badInput | `5` の時点で文字列 `"5"`（1 節の 96 行目）、`e` で badInput の parse エラー（[第 3 回](03-sfd-validity.md)） |
| その後 s の type を color、date に変える | `"5"` のまま | `"#000000"`、`""` | `type` が変わっても `controlValue` は変わらないので書かない（更新の関数の 124 行目）。DOM はブラウザが新しい `type` に合わせて直した値 |
| n（range、max 10）に 50 | `50` | `"10"` | 4 節 |
| n（range）に null | `null` | `"5"` | 123〜124 行目で `''` を書き、range のブラウザが中間（`(min+max)/2`）にする |
| n（number）に NaN | `NaN` | `""` | 171〜172 行目 |
| d に Date を入れて type を month に変える | Date のまま | `""` → set し直すと `"2026-11"` | type の変更では書かない。set で 133〜134 行目の `valueAsDate` |
| select の option の文字を two に | `"two"` | `""` | 7 節（#71443） |
| radio の value を入れ替える | `"selected"` | 2 つ目が ● | 6 節（9e37a58e14b） |

> [!WARNING]
> **ハマりどころ**
>
> 2 行目と 6 行目は、**input の `type` を後から変えると、DOM の value とモデルがずれたままになる**ことを示しています。更新の関数が値を書くきっかけは `controlValue` の変化と radio の `value` の変化だけで（9e37a58e14b で足されたのが後者）、`type` の変化はきっかけに入っていません。[第 1 回](01-sfd-form-field.md)の 7 節の `min` / `max` の判定と同じく、「`type` は最初に決まったら変わらない」という前提の上に書かれています。

## ここまでの呼び出し

- 👤 number の input に `-0` と打つ
  - `listenToDom('input')` → `parser.setRawValue(undefined)` — control\_native.ts 64
    - `getNativeControlValue(input, value, monitor)` — native.ts 38–97 — *モデルが number なので 62 行目の valueAsNumber → -0*
    - `controlValue.set(-0)` — control\_native.ts 50
  - `ɵɵcontrol` → 更新の関数 — control\_native.ts 99–129 — *変更検知の中*
    - `setNativeDomProperty`（min / max などが変わっていれば） — forms/src/directives/native.ts 51–81
    - `bindingUpdated(bindings, 'controlValue', -0)` — bindings.ts 74–84 — *前回 1 なので true*
      - `setNativeControlValue` → `setNativeNumberControlValue` — native.ts 121 → 174 — *valueAsNumber = -0 → 表示は "0"*

## テストと直し方

この章の約束を固めているのは `form_field.spec.ts` の `describe('should work with different input types')`（5281 行目、`it('should sync number field with number type input')` 5310 行目・`'should sync date field with date type input'` 5366 行目・`'should sync number field with datetime-local type input'` 5422 行目・`'should sync string field with dynamically typed input'` 5697 行目・`'should sync number with range type input'` 5742 行目）、radio と select の it（`'synchronizes with a radio group'` 4191 行目・`'synchronizes the checked state when a reused radio changes value'` 4239 行目・`'synchronizes with a select'` 4307 行目・`'should resync the select value when an option is added'` 4805 行目）、`number_input.spec.ts` の `describe('numeric inputs')`（15 行目）と `describe('text input with numeric model')`（169 行目）です。

📄 `angular/packages/forms/signals/test/web/form_field.spec.ts` L5742–5780 （▶ の行: 5745, 5752–5753, 5762, 5765, 5767, 5770–5771, 5773–5774, 5777, 5779）

```ts
5742 │     it('should sync number with range type input', () => {
5743 │       @Component({
5744 │         imports: [FormField],
5745 ▶         template: `<input type="range" [formField]="form.range" />`,
5746 │       })
5747 │       class TestCmp {
5748 │         min = signal<number | undefined>(undefined);
5749 │         max = signal<number | undefined>(undefined);
5750 │ 
5751 │         form = form(signal({range: 80}), (path) => {
5752 ▶           min(path.range, this.min);
5753 ▶           max(path.range, this.max);
5754 │         });
5755 │       }
5756 │ 
5757 │       const fix = act(() => TestBed.createComponent(TestCmp));
5758 │       const input = fix.nativeElement.firstChild as HTMLInputElement;
5759 │       const cmp = fix.componentInstance as TestCmp;
5760 │ 
5761 │       // Initial state
5762 ▶       expect(input.value).toBe('80');
5763 │ 
5764 │       // Model -> View
5765 ▶       act(() => cmp.form().value.set({range: 150}));
5766 │       // Value is caped to max
5767 ▶       expect(input.value).toBe('100');
5768 │ 
5769 │       cmp.min.set(0);
5770 ▶       cmp.max.set(200);
5771 ▶ 
5772 │       act(() => cmp.form().value.set({range: 101}));
5773 ▶       expect(input.value).toBe('101');
5774 ▶ 
5775 │       act(() => cmp.form().value.set({range: 220}));
5776 │       // Value is caped to max
5777 ▶       expect(input.value).toBe('200');
5778 │     });
5779 ▶   });
5780 │ 
```

5767 行目は「範囲の外の値は既定の `max`（100）に丸められる」、5770〜5774 行目は「`max` を 200 に広げると同時に 101 にすると、101 のまま」で、後者が 3524de29f34 の書く順を固めています。5770〜5771 行目は `act` の外で signal を書き、5773 行目の `act` の中の 1 回の更新で `max` と値を一緒に書かせているのがポイントです。

📄 `angular/packages/forms/signals/test/web/form_field.spec.ts` L4239–4277 （▶ の行: 4249, 4254, 4256–4257, 4268, 4270–4271, 4276）

```ts
4239 │   it('synchronizes the checked state when a reused radio changes value', async () => {
4240 │     interface RadioOption {
4241 │       readonly id: string;
4242 │       readonly value: string;
4243 │     }
4244 │ 
4245 │     @Component({
4246 │       imports: [FormField],
4247 │       template: `
4248 │         @for (option of options(); track option.id) {
4249 ▶           <input type="radio" [formField]="f" [value]="option.value" />
4250 │         }
4251 │       `,
4252 │     })
4253 │     class TestCmp {
4254 ▶       readonly f = form(signal('selected'), {name: 'test'});
4255 │       readonly options = signal<ReadonlyArray<RadioOption>>([
4256 ▶         {id: 'shared', value: 'other'},
4257 ▶         {id: 'old', value: 'selected'},
4258 │       ]);
4259 │     }
4260 │ 
4261 │     const fixture = TestBed.createComponent(TestCmp);
4262 │     await fixture.whenStable();
4263 │     const getCheckedStates = () =>
4264 │       Array.from(
4265 │         (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input'),
4266 │       ).map((input) => input.checked);
4267 │ 
4268 ▶     expect(getCheckedStates()).toEqual([false, true]);
4269 │ 
4270 ▶     fixture.componentInstance.options.set([
4271 ▶       {id: 'new', value: 'other'},
4272 │       {id: 'shared', value: 'selected'},
4273 │     ]);
4274 │     await fixture.whenStable();
4275 │ 
4276 ▶     expect(getCheckedStates()).toEqual([false, true]);
4277 │   });
```

4249 行目が `@for` の中の radio、4270〜4271 行目で `id: 'shared'` の要素を残したまま `value` を `'other'` から `'selected'` に変え、4276 行目で 2 つ目が `checked` になったことを確かめます。

📄 `angular/packages/forms/signals/test/web/form_field.spec.ts` L4805–4831 （▶ の行: 4810–4811, 4818, 4826–4827, 4830）

```ts
4805 │   it('should resync the select value when an option is added', async () => {
4806 │     @Component({
4807 │       imports: [FormField],
4808 │       template: `
4809 │         <select #select [formField]="f">
4810 ▶           @for (opt of options(); track opt) {
4811 ▶             <option>{{ opt }}</option>
4812 │           }
4813 │         </select>
4814 │       `,
4815 │     })
4816 │     class TestCmp {
4817 │       f = form(signal('four'));
4818 ▶       select = viewChild<ElementRef<HTMLSelectElement>>('select');
4819 │       options = signal(['one', 'two', 'three']);
4820 │     }
4821 │ 
4822 │     const fix = act(() => TestBed.createComponent(TestCmp));
4823 │     await fix.whenStable();
4824 │     const cmp = fix.componentInstance as TestCmp;
4825 │ 
4826 ▶     expect(fix.componentInstance.select()!.nativeElement.value).toEqual('');
4827 ▶ 
4828 │     act(() => cmp.options.update((o) => [...o, 'four']));
4829 │     await fix.whenStable();
4830 ▶ 
4831 │     expect(fix.componentInstance.select()!.nativeElement.value).toEqual('four');
```

4811 行目は `value` の属性の無い option（文字が value）で、4827 行目で option を足すと 4830 行目で `'four'` が選ばれます。#71443 の「文字だけが変わる」場面（`options` の配列の中の文字を書き換える）を確かめる it はありません。

📄 `走らせ方（web の suite。--test_arg=--filter は効かない）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/signals/test/web:test_chromium \
  --nocache_test_results --test_output=all
```

📄 `結果`

```
# 2026-11-16、手元の macOS で（8576f161ae4）。web の suite は絞り込めないので全体の数
Chromium: |██████████████████████████████| 1/1 test files | 350 passed, 0 failed
//packages/forms/signals/test/web:test_chromium                          PASSED in 1.5s
# Browser logs に NG01921 が 4 回（number_input.spec.ts の「text input with numeric model」の null の it から）
```

### 直すとしたら

- 7 節の #71443 は `select.ts` の `isRelevantSelectMutation`（53〜80 行目）で、`mutation.type === 'characterData'` のときに、対象が `Comment` でなければ `true` を返す枝を 61 行目の前に足す形です。spec は `form_field.spec.ts` の 4805 行目の it の隣に、option の文字を signal で持ち、その signal を書き換えたら `select.value` が追従することを確かめる it を足します（`await fix.whenStable()` で `MutationObserver` の通知を待つのは 4826〜4828 行目と同じ）。
- 2 節の NG01921 は `native.ts` の `setNativeControlValue` の 148 行目の条件に「モデルが数として扱われていない」ことを足す必要があります。ただしこの関数はモデルの値（`null`）しか受け取らないので、読む側の 83 行目のように「`null` は数のモデルの空」と区別する情報がありません。呼び出し元（`control_native.ts` の更新の関数と `onReset`）から、そのフィールドが数として扱われているかを渡す形になります。spec は `number_input.spec.ts` の 232・254 行目の it に `spyOn(console, 'warn')` を足して「呼ばれない」を確かめる形です。

## 聞かれそうな質問

**Q. type="number" の input にはいつも数が入りますか？**

いいえ。native.ts の 60〜61 行目で、**今のモデルの値**が数か `null` のときだけ `valueAsNumber` を使います。モデルが文字列なら 96 行目の `element.value`（文字列）です。DEMO の s の行で確かめられます。

**Q. &lt;input type="text"&gt; に number | null のフィールドをつないでもいいのですか？**

41b1410cb8a（v22）から正式に扱います。読む側は 83〜91 行目（空なら `null`、数でなければ parse エラー）、書く側は 144〜146 行目です。ただし今の版では、モデルが `null` になると 148〜157 行目の NG01921 の警告が開発モードで出ます（2 節の注意）。

**Q. number の input で -0 や 1e5 と打つと文字が変わるのはなぜですか？**

解析した数（`-0`・`100000`）が前回の `controlValue` と違うので、更新の関数が 174 行目の `valueAsNumber` で書き直し、ブラウザがその数の標準の文字（`"0"`・`"100000"`）にするからです。直そうとした 2e32872720e は 7a626175f75 で戻り、#69635 は開いたままです（5 節）。

**Q. range の input で max を超える値をモデルに入れるとどうなりますか？**

DOM はブラウザが `max` に丸めますが、モデルは丸めません（DEMO で `50` と `"10"`）。3524de29f34 からは属性を先に書くので、`max` を広げると同時に値を入れれば丸められません（spec の 5770〜5774 行目）。

**Q. select の option を後から足しても、モデルの値が選ばれるのはなぜですか？**

control\_native.ts の 81〜95 行目で `MutationObserver` を付け、option の追加・削除・`value` の属性の変化があれば 91 行目で `controlValue` を書き直すからです。ただし option の文字だけが変わる場合は、select.ts の 72 行目で「関係ない」と判断されて書き直しません（#71443）。

## 読み終えて

- 読む側（`getNativeControlValue`）は `type` と「今のモデルの値の型」の組で返す型を決める。モデルが文字列なら number の input でも文字列
- 書く側（`setNativeControlValue`）は `controlValue` が変わったときだけ呼ばれ、`NaN` と `null` を空の文字にする。text の input の `null` には NG01921 の警告（数のモデルでも出る）
- 属性を先に、値を後に書く（3524de29f34）。radio は `value` の変化でも書き直す（9e37a58e14b）。`type` の変化はきっかけにならない
- 打っている途中の数の書き直し（#69635）は 2e32872720e で直されたが、7a626175f75 で戻った
- select は `MutationObserver` で option の変化を見て書き直すが、文字だけの変化は捨てられている（#71443）

---

← 前: [FormField の全体：1 つのディレクティブが相手を見分けるまで](01-sfd-form-field.md)  
次: [parse エラーと validity：ブラウザの検証をフィールドに戻す](03-sfd-validity.md) →
