[目次](../README.md) › [core の説明文の読み残し（2）](README.md) › 第 5 回 / 全 10 回

# input()・model()・output() の説明文

> authoring/input/\*・model/\*・output/\* の未読の行：required と alias と transform、model の双方向の約束、output と outputFromObservable・OutputEmitterRef の destroy の後の emit。説明文の例を strictTemplates に通し、本物で動かす。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cra-signal-io)

---

この章で分かること：`input()`・`input.required()`・`model()`・`output()`・`OutputEmitterRef`・`outputFromObservable`・`outputToObservable` の説明文が約束していることと、それが本物でそのとおりに動くか。説明文の例が strict の tsc（`strictTemplates`）に通るか。結果として、約束の多くは書いたとおりでしたが、`model` の「値が更新されるたびに出力に流す」は子の側の更新だけであること、注入の文脈の外の例外の文が `input()` を内部の名前 `inputFunction()` で呼ぶこと、11 か所の `@publicAPI`（大文字の API）のタグが angular.dev の「stable」の札の作り方と合わないことが、説明と実物の間にありました。

読む対象は `packages/core/src/authoring/` の `input/`（`input.ts`・`input_signal.ts`・`input_signal_node.ts`）・`model/`・`output/` の説明文と、`packages/core/rxjs-interop/src/output_from_observable.ts` の説明文です（../angular、8576f161ae4）。実装は既存の章が読んでいます。`input()` が何でできているかは[input と viewChild は何でできているかの章](../signals/11-authoring.md)、コンパイラーからの見え方は[input() はコンパイラにどう見えるかの章](../signals/12-signals-input-compile.md)、`model()` と `output()` の実装は[model() と output() の章](../signals/13-signals-model-output.md)、双方向の型の確かめは[双方向バインディングと model() の章](../typecheck/12-typecheck-two-way.md)にあるので、ここでは繰り返さずに行だけ指します。

1. [1. ApplicationRef](01-cra-app-ref.md)
2. [2. platform と bootstrap](02-cra-platform.md)
3. [3. ViewContainerRef](03-cra-view-container.md)
4. [4. QueryList・DestroyRef](04-cra-linker-misc.md)
5. **5. input・model・output**（この章）
6. [6. signal のクエリ](06-cra-signal-queries.md)
7. [7. NgZone・ErrorHandler](07-cra-zone-errors.md)
8. [8. DebugElement](08-cra-debug.md)
9. [9. サニタイズ](09-cra-sanitize.md)
10. [10. spec と issue](10-cra-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> `input()` は親から値を受け取る口を、`output()` は親へ値を知らせる口を、`model()` はその 2 つの組（`[(value)]` の双方向）を、クラスのフィールドの初期化子 1 行で宣言する関数です（初期化子の API）。受け取った値は signal として読みます。DEMO は、親と子の 2 つの小さなコンポーネントを文書に付けない要素の上に作り、親のテンプレート（このページでは AOT でコンパイル済み）で束ねて試します。

## 1. input() の形と、required の「コンパイルのエラー」

📄 `angular/packages/core/src/authoring/input/input.ts` L36–58 （▶ の行: 37, 40–41, 46–47, 51–52, 54, 56, 58）

```ts
36 │ /**
37 ▶  * The `input` function allows declaration of inputs in directives and
38 │  * components.
39 │  *
40 ▶  * The function exposes an API for also declaring required inputs via the
41 ▶  * `input.required` function.
42 │  *
43 │  * @see [Accepting data with input properties](guide/components/inputs)
44 │  * @see [Required inputs](guide/components/inputs#required-inputs)
45 │  * @see [Input transforms](guide/components/inputs#input-transforms)
46 ▶  * @publicAPI
47 ▶  * @docsPrivate Ignored because `input` is the canonical API entry.
48 │  */
49 │ export interface InputFunction {
50 │   /**
51 ▶    * Initializes an input of type `T` with an initial value of `undefined`.
52 ▶    * Angular will implicitly use `undefined` as initial value.
53 │    */
54 ▶   <T>(): InputSignal<T | undefined>;
55 │   /** Declares an input of type `T` with an explicit initial value. */
56 ▶   <T>(initialValue: T, opts?: InputOptionsWithoutTransform<T>): InputSignal<T>;
57 │   /** Declares an input of type `T|undefined` without an initial value, but with input options */
58 ▶   <T>(initialValue: undefined, opts: InputOptionsWithoutTransform<T>): InputSignal<T | undefined>;
```

📄 `angular/packages/core/src/authoring/input/input.ts` L59–96 （▶ の行: 60, 63–64, 66, 71, 74–75, 81–82, 84, 89–90）

```ts
59 │   /**
60 ▶    * Declares an input of type `T` with an initial value and a transform
61 │    * function.
62 │    *
63 ▶    * The input accepts values of type `TransformT` and the given
64 ▶    * transform function will transform the value to type `T`.
65 │    */
66 ▶   <T, TransformT>(
67 │     initialValue: T,
68 │     opts: InputOptionsWithTransform<T, TransformT>,
69 │   ): InputSignalWithTransform<T, TransformT>;
70 │   /**
71 ▶    * Declares an input of type `T|undefined` without an initial value and with a transform
72 │    * function.
73 │    *
74 ▶    * The input accepts values of type `TransformT` and the given
75 ▶    * transform function will transform the value to type `T|undefined`.
76 │    */ <T, TransformT>(
77 │     initialValue: undefined,
78 │     opts: InputOptionsWithTransform<T | undefined, TransformT>,
79 │   ): InputSignalWithTransform<T | undefined, TransformT>;
80 │   /**
81 ▶    * Declares an input of type `T` with an initial value and a transform function
82 ▶    * that accepts values of type `unknown`.
83 │    */
84 ▶   <T>(
85 │     initialValue: T,
86 │     opts: InputOptionsWithTransform<T, unknown>,
87 │   ): InputSignalWithTransform<T, unknown>;
88 │   /**
89 ▶    * Declares an input of type `T|undefined` without an initial value and with a transform
90 ▶    * function that accepts values of type `unknown`.
91 │    */
92 │   <T>(
93 │     initialValue: undefined,
94 │     opts: InputOptionsWithTransform<T | undefined, unknown>,
95 │   ): InputSignalWithTransform<T | undefined, unknown>;
96 │ 
```

📄 `angular/packages/core/src/authoring/input/input.ts` L97–119 （▶ の行: 98, 100–101, 103, 105, 108, 115）

```ts
 97 │   /**
 98 ▶    * Initializes a required input.
 99 │    *
100 ▶    * Consumers of your directive/component need to bind to this
101 ▶    * input. If unset, a compile time error will be reported.
102 │    *
103 ▶    * @publicAPI
104 │    */
105 ▶   required: {
106 │     /** Declares a required input of type `T`. */
107 │ 
108 ▶     <T>(opts?: InputOptionsWithoutTransform<T>): InputSignal<T>;
109 │     /**
110 │      * Declares a required input of type `T` with a transform function.
111 │      *
112 │      * The input accepts values of type `TransformT` and the given
113 │      * transform function will transform the value to type `T`.
114 │      */
115 ▶     <T, TransformT>(
116 │       opts: InputOptionsWithTransform<T, TransformT>,
117 │     ): InputSignalWithTransform<T, TransformT>;
118 │   };
119 │ }
```

`input()` の型は 7 つの形（overload）で、初期値を渡さない 51〜54 行目は `T | undefined`、初期値を渡す 56 行目は `T`、`transform` を渡す形（66〜95 行目）は「読むときの型 `T`」と「束ねるときの型 `TransformT`」の 2 つを持ちます。100〜101 行目「使う側は必ず束ねる。束ねないとコンパイルのエラー」は合っていました。必須の input を束ねないテンプレートを ngc にかけると、`strictTemplates` が `true` でも `false` でも「NG8008: Required input 'name' from component Child must be specified.」でした。

コンパイルを通らない道、たとえば `createComponent` で作って `setInput` をしないまま読むと、実行時の例外 NG0950「Input is required but no value is available yet.」でした（本番は `NG0950` だけ。DEMO の 1 つ目の表）。説明文は実行時のこの例外を書いていません。中では `REQUIRED_UNSET_VALUE` を初期値にしておき、読むときに確かめます（[input と viewChild の章](../signals/11-authoring.md)）。

## 2. input() の説明文と例

📄 `angular/packages/core/src/authoring/input/input.ts` L120–146 （▶ の行: 125, 127–128, 130–132, 134–136, 145–146）

````ts
120 │ 
121 │ /**
122 │  * The `input` function allows declaration of Angular inputs in directives
123 │  * and components.
124 │  *
125 ▶  * There are two variants of inputs that can be declared:
126 │  *
127 ▶  *   1. **Optional inputs** with an initial value.
128 ▶  *   2. **Required inputs** that consumers need to set.
129 │  *
130 ▶  * By default, the `input` function will declare optional inputs that
131 ▶  * always have an initial value. Required inputs can be declared
132 ▶  * using the `input.required()` function.
133 │  *
134 ▶  * Inputs are signals. The values of an input are exposed as a `Signal`.
135 ▶  * The signal always holds the latest value of the input that is bound
136 ▶  * from the parent.
137 │  *
138 │  * @usageNotes
139 │  * To use signal-based inputs, import `input` from `@angular/core`.
140 │  *
141 │  * ```ts
142 │  * import {input} from '@angular/core';
143 │  * ```
144 │  *
145 ▶  * Inside your component, introduce a new class member and initialize
146 ▶  * it with a call to `input` or `input.required`.
````

📄 `angular/packages/core/src/authoring/input/input.ts` L147–170 （▶ の行: 149–151, 153–155, 163, 166）

````ts
147 │  *
148 │  * ```ts
149 ▶  * @Component({
150 ▶  *   ...
151 ▶  * })
152 │  * export class UserProfileComponent {
153 ▶  *   firstName = input<string>();             // Signal<string|undefined>
154 ▶  *   lastName  = input.required<string>();    // Signal<string>
155 ▶  *   age       = input(0)                     // Signal<number>
156 │  * }
157 │  * ```
158 │  *
159 │  * Inside your component template, you can display values of the inputs
160 │  * by calling the signal.
161 │  *
162 │  * ```html
163 ▶  * <span>{{firstName()}}</span>
164 │  * ```
165 │  *
166 ▶  * @publicAPI
167 │  * @initializerApiFunction
168 │  *
169 │  * @see [Accepting data with input properties](guide/components/inputs)
170 │  */
````

134〜136 行目「入力は signal で、親が束ねた最新の値を持つ」のとおり、親のテンプレートの `[name]="n()"` などで束ねた値がそのまま読めました（DEMO の 1 つ目の表の「テンプレートで束ねる」）。130〜131 行目は「既定の `input` は、いつも初期値を持つ省略できる入力」と書きますが、153 行目の例のとおり、初期値を渡さない形は `undefined` を初期値にします（51〜52 行目）。

149〜151 行目の `@Component({ ... })` は省略の印なので、`selector` と 163 行目のテンプレートを入れて strict の tsc（`strictTemplates`）にかけると、エラーはありませんでした。155 行目は文の終わりの `;` がありませんが、TypeScript では行の終わりで文が終わるのでエラーになりません。153〜155 行目のコメントの `Signal<string|undefined>` などは、実際の型では `InputSignal<...>` です。

## 3. InputOptions：alias と transform

📄 `angular/packages/core/src/authoring/input/input_signal.ts` L16–42 （▶ の行: 17, 24–25, 27–28, 30–34, 36, 39, 41）

```ts
16 │ /**
17 ▶  * @publicAPI
18 │  * @see [Input aliases](guide/components/inputs#input-aliases)
19 │  * @see [Input transforms](guide/components/inputs#input-transforms)
20 │  *
21 │  * Options for signal inputs.
22 │  */
23 │ export interface InputOptions<T, TransformT> {
24 ▶   /** Optional public name for the input. By default, the class field name is used. */
25 ▶   alias?: string;
26 │   /**
27 ▶    * Optional transform that runs whenever a new value is bound. Can be used to
28 ▶    * transform the input value before the input is updated.
29 │    *
30 ▶    * The transform function can widen the type of the input. For example, consider
31 ▶    * an input for `disabled`. In practice, as the component author, you want to only
32 ▶    * deal with a boolean, but users may want to bind a string if they just use the
33 ▶    * attribute form to bind to the input via `<my-dir input>`. A transform can then
34 ▶    * handle such string values and convert them to `boolean`. See: {@link booleanAttribute}.
35 │    */
36 ▶   transform?: (v: TransformT) => T;
37 │ 
38 │   /**
39 ▶    * A debug name for the input signal. Used in Angular DevTools to identify the signal.
40 │    */
41 ▶   debugName?: string;
42 │ }
```

📄 `angular/packages/core/src/authoring/input/input_signal.ts` L43–61 （▶ の行: 47, 49, 51, 55, 57）

```ts
43 │ 
44 │ /**
45 │  * Signal input options without the transform option.
46 │  *
47 ▶  * @publicApi 19.0
48 │  */
49 ▶ export type InputOptionsWithoutTransform<T> =
50 │   // Note: We still keep a notion of `transform` for auto-completion.
51 ▶   Omit<InputOptions<T, T>, 'transform'> & {transform?: undefined};
52 │ /**
53 │  * Signal input options with the transform option required.
54 │  *
55 ▶  * @publicAPI
56 │  */
57 ▶ export type InputOptionsWithTransform<T, TransformT> = Required<
58 │   Pick<InputOptions<T, TransformT>, 'transform'>
59 │ > &
60 │   InputOptions<T, TransformT>;
61 │ 
```

24〜25 行目の `alias` は「公開の名前。既定はフィールド名」で、`input(1, {alias: 'px'})` のフィールド `size` は、`setInput('px', 5)` とテンプレートの `[px]` で束ねられました。フィールド名の `[size]` はテンプレートでは「NG8002: Can't bind to 'size' since it isn't a known property of 'io-child'.」、`setInput('size', 9)` は値が変わらず、開発モードは console.error「NG0303: Can't set value of the 'size' input ...」を書き、本番は何もしませんでした（[第 4 回](04-cra-linker-misc.md)の 3 節と同じ）。

27〜28 行目「`transform` は新しい値が束ねられるたびに走る」は、「値が変わったときだけ」の意味でした。DEMO で数えると、テンプレートで `'3'` を `'3'` にしても 0 回、`3`（`===` では `'3'` と違う）にすると 1 回、`setInput('count', '4')` を 2 回と `setInput('count', 5)` では 2 回でした。テンプレートの束ねは前の値と同じなら入力を書かず、`setInput` も前に渡した値と同じなら何もしないからです（[2 つの入口の章](../dyn/01-dyn-entry-points.md)）。30〜34 行目の属性の形（`<cra-io-child disabled>`）は、空の文字列が `booleanAttribute` で `true` になりました。`transform` の引数の型は `strictTemplates` のときだけ確かめられ、`(v: string | number)` の入力に `[count]="true"` を束ねると「TS2322: Type 'boolean' is not assignable to type 'string | number'.」、`strictTemplates: false` では通りました。

📄 `angular/packages/core/src/authoring/input/input_signal.ts` L94–114 （▶ の行: 96, 98–100, 104, 106, 112）

```ts
 94 │ 
 95 │ /**
 96 ▶  * `InputSignal` represents a special `Signal` for a directive/component input.
 97 │  *
 98 ▶  * An input signal is similar to a non-writable signal except that it also
 99 ▶  * carries additional type-information for transforms, and that Angular internally
100 ▶  * updates the signal whenever a new value is bound.
101 │  *
102 │  * @see {@link InputOptionsWithTransform} for inputs with transforms.
103 │  *
104 ▶  * @publicApi 19.0
105 │  */
106 ▶ export interface InputSignal<T> extends InputSignalWithTransform<T, T> {}
107 │ 
108 │ /**
109 │  * Creates an input signal.
110 │  *
111 │  * @param initialValue The initial value.
112 ▶  *   Can be set to {@link REQUIRED_UNSET_VALUE} for required inputs.
113 │  * @param options Additional options for the input. e.g. a transform, or an alias.
114 │  */
```

📄 `angular/packages/core/src/authoring/input/input_signal_node.ts` L23–38 （▶ の行: 25–26, 28–30, 32, 35）

```ts
23 │ 
24 │   /**
25 ▶    * Applies a new value to the input signal. Expects transforms to be run
26 ▶    * manually before.
27 │    *
28 ▶    * This function is called by the framework runtime code whenever a binding
29 ▶    * changes. The value can in practice be anything at runtime, but for typing
30 ▶    * purposes we assume it's a valid `T` value. Type-checking will enforce that.
31 │    */
32 ▶   applyValueToInputSignal<T, TransformT>(node: InputSignalNode<T, TransformT>, value: T): void;
33 │ 
34 │   /**
35 ▶    * A debug name for the input signal. Used in Angular DevTools to identify the signal.
36 │    */
37 │   debugName?: string;
38 │ }
```

98〜100 行目「書き込めない signal に似ているが、Angular が中で、新しい値が束ねられるたびに更新する」の更新の口が 32 行目の `applyValueToInputSignal` で、25〜26 行目のとおり `transform` は呼ぶ側が先に済ませます。input\_signal.ts の L74〜82 の `InputSignalWithTransform` の例は、`convertToBoolean` を足すと strict の tsc に通りました。

## 4. model()：子の側の更新だけが出力に流れる

📄 `angular/packages/core/src/authoring/model/model.ts` L28–62 （▶ の行: 30–32, 41–42, 49, 51, 57–58）

```ts
28 │ 
29 │ /**
30 ▶  * `model` declares a writeable signal that is exposed as an input/output pair on the containing
31 ▶  * directive. The input name is taken either from the class member or from the `alias` option.
32 ▶  * The output name is generated by taking the input name and appending `Change`.
33 │  *
34 │  * The function exposes an API for also declaring required models via the
35 │  * `model.required` function.
36 │  *
37 │  * @see [Two-way binding between components](guide/templates/two-way-binding#two-way-binding-between-components)
38 │  * @see [Model inputs](guide/components/inputs#model-inputs)
39 │  * @see [Customizing model inputs](guide/components/inputs#customizing-model-inputs)
40 │  *
41 ▶  * @publicAPI
42 ▶  * @docsPrivate Ignored because `model` is the canonical API entry.
43 │  */
44 │ export interface ModelFunction {
45 │   /**
46 │    * Initializes a model of type `T` with an initial value of `undefined`.
47 │    * Angular will implicitly use `undefined` as initial value.
48 │    */
49 ▶   <T>(): ModelSignal<T | undefined>;
50 │   /** Initializes a model of type `T` with the given initial value. */
51 ▶   <T>(initialValue: T, opts?: ModelOptions): ModelSignal<T>;
52 │ 
53 │   required: {
54 │     /**
55 │      * Initializes a required model.
56 │      *
57 ▶      * Users of your directive/component need to bind to the input side of the model.
58 ▶      * If unset, a compile time error will be reported.
59 │      */
60 │     <T>(opts?: ModelOptions): ModelSignal<T>;
61 │   };
62 │ }
```

📄 `angular/packages/core/src/authoring/model/model_signal.ts` L27–44 （▶ の行: 28, 34–35, 37, 40–42）

```ts
27 │ /**
28 ▶  * @publicAPI
29 │  *
30 │  * Options for model signals.
31 │  */
32 │ export interface ModelOptions {
33 │   /**
34 ▶    * Optional public name of the input side of the model. The output side will have the same
35 ▶    * name as the input, but suffixed with `Change`. By default, the class field name is used.
36 │    */
37 ▶   alias?: string;
38 │ 
39 │   /**
40 ▶    * A debug name for the model signal. Used in Angular DevTools to identify the signal.
41 ▶    */
42 ▶   debugName?: string;
43 │ }
44 │ 
```

30〜32 行目「入力と出力の組。出力の名前は入力の名前に `Change` を足したもの」のとおり、`value = model(0)` は `[(value)]="v"`（`v` は親の signal）と `(valueChange)` で束ねられました。57〜58 行目の `model.required` も、設定しないまま読むと実行時は NG0952「Model is required but no value is available yet.」で、`update` も同じ例外でした（読んでから新しい値を作るため）。

📄 `angular/packages/core/src/authoring/model/model.ts` L63–99 （▶ の行: 65–66, 68–69, 83–85, 87–89）

````ts
63 │ 
64 │ /**
65 ▶  * `model` declares a writeable signal that is exposed as an input/output
66 ▶  * pair on the containing directive.
67 │  *
68 ▶  * The input name is taken either from the class member or from the `alias` option.
69 ▶  * The output name is generated by taking the input name and appending `Change`.
70 │  *
71 │  * @usageNotes
72 │  *
73 │  * To use `model()`, import the function from `@angular/core`.
74 │  *
75 │  * ```ts
76 │  * import {model} from '@angular/core';
77 │  * ```
78 │  *
79 │  * Inside your component, introduce a new class member and initialize
80 │  * it with a call to `model` or `model.required`.
81 │  *
82 │  * ```ts
83 ▶  * @Directive({
84 ▶  *   ...
85 ▶  * })
86 │  * export class MyDir {
87 ▶  *   firstName = model<string>();            // ModelSignal<string|undefined>
88 ▶  *   lastName  = model.required<string>();   // ModelSignal<string>
89 ▶  *   age       = model(0);                   // ModelSignal<number>
90 │  * }
91 │  * ```
92 │  *
93 │  * Inside your component template, you can display the value of a `model`
94 │  * by calling the signal.
95 │  *
96 │  * ```html
97 │  * <span>{{firstName()}}</span>
98 │  * ```
99 │  *
````

📄 `angular/packages/core/src/authoring/model/model.ts` L100–120 （▶ の行: 100, 103–105, 111）

````ts
100 ▶  * Updating the `model` is equivalent to updating a writable signal.
101 │  *
102 │  * ```ts
103 ▶  * updateName(newFirstName: string): void {
104 ▶  *   this.firstName.set(newFirstName);
105 ▶  * }
106 │  * ```
107 │  * @see [Two-way binding between components](guide/templates/two-way-binding#two-way-binding-between-components)
108 │  * @see [Model inputs](guide/components/inputs#model-inputs)
109 │  * @see [Customizing model inputs](guide/components/inputs#customizing-model-inputs)
110 │  *
111 ▶  * @publicApi 19.0
112 │  * @initializerApiFunction
113 │  */
114 │ export const model: ModelFunction = (() => {
115 │   // Note: This may be considered a side-effect, but nothing will depend on
116 │   // this assignment, unless this `model` constant export is accessed. It's a
117 │   // self-contained side effect that is local to the user facing `model` export.
118 │   (modelFunction as any).required = modelRequiredFunction;
119 │   return modelFunction as typeof modelFunction & {required: typeof modelRequiredFunction};
120 │ })();
````

📄 `angular/packages/core/src/authoring/model/model_signal.ts` L56–63 （▶ の行: 60–61）

```ts
56 │ 
57 │ /**
58 │  * Creates a model signal.
59 │  *
60 ▶  * @param initialValue The initial value.
61 ▶  *   Can be set to {@link REQUIRED_UNSET_VALUE} for required model signals.
62 │  * @param options Additional options for the model.
63 │  */
```

100 行目「`model` の更新は書き込める signal の更新と同じ」のとおり、子で `value.set(11)` すると、`valueChange` に 11 が流れ、親の `v()` も 11 になりました。同じ値をもう一度 `set` しても流れません（実装は `equal` で比べてから `emit`、model\_signal.ts L80〜84）。ところが、親が `v.set(20)` して描き直すと、子の `value()` は 20 になりましたが、`valueChange` は流れませんでした。model\_signal.ts の `ModelSignal` の説明（L48〜49、[双方向の章](../typecheck/12-typecheck-two-way.md)の引用）は「値が更新されるたびに出力に流す」と書きますが、流れるのは子が `set`・`update` したときだけで、親からの更新（`applyValueToInputSignal`）では流れません。spec の `should not emit to the change event when then property binding changes`（model\_inputs\_spec.ts L213）もこの振る舞いを固めています。

83〜85 行目と 103〜105 行目の例は、`...` を `selector` にし、メソッドをクラスに入れると strict の tsc に通りました。60〜61 行目の `createModelSignal` の `{@link REQUIRED_UNSET_VALUE}` は内部の名前への link です（この関数は公開されていない）。

## 5. output() と OutputEmitterRef

📄 `angular/packages/core/src/authoring/output/output.ts` L13–33 （▶ の行: 18, 20–21, 25, 28–29, 31–32）

```ts
13 │ /**
14 │  * Options for declaring an output.
15 │  *
16 │  * @see [Customizing output names](guide/components/outputs#customizing-output-names)
17 │  *
18 ▶  * @publicApi 19.0
19 │  */
20 ▶ export interface OutputOptions {
21 ▶   alias?: string;
22 │ }
23 │ 
24 │ /**
25 ▶  * The `output` function allows declaration of Angular outputs in
26 │  * directives and components.
27 │  *
28 ▶  * You can use outputs to emit values to parent directives and component.
29 ▶  * Parents can subscribe to changes via:
30 │  *
31 ▶  * - template event bindings. For example, `(myOutput)="doSomething($event)"`
32 ▶  * - programmatic subscription by using `OutputRef#subscribe`.
33 │  *
```

📄 `angular/packages/core/src/authoring/output/output.ts` L34–65 （▶ の行: 42–43, 50–51, 55–56, 59–61, 64）

````ts
34 │  * @usageNotes
35 │  *
36 │  * To use `output()`, import the function from `@angular/core`.
37 │  *
38 │  * ```ts
39 │  * import {output} from '@angular/core';
40 │  * ```
41 │  *
42 ▶  * Inside your component, introduce a new class member and initialize
43 ▶  * it with a call to `output`.
44 │  *
45 │  * ```ts
46 │  * @Directive({
47 │  *   ...
48 │  * })
49 │  * export class MyDir {
50 ▶  *   nameChange = output<string>();    // OutputEmitterRef<string>
51 ▶  *   onClick    = output();            // OutputEmitterRef<void>
52 │  * }
53 │  * ```
54 │  *
55 ▶  * You can emit values to consumers of your directive, by using
56 ▶  * the `emit` method from `OutputEmitterRef`.
57 │  *
58 │  * ```ts
59 ▶  * updateName(newName: string): void {
60 ▶  *   this.nameChange.emit(newName);
61 ▶  * }
62 │  * ```
63 │  *
64 ▶  * @see [Custom events with outputs](guide/components/outputs#customizing-output-names)
65 │  *
````

29〜32 行目「親はテンプレートの `(myOutput)` と、`OutputRef#subscribe` の 2 つで受け取れる」のとおり、`emit('a')` は親の `(pressed)` と `subscribe` の両方に届き、`unsubscribe` のあとの `emit('b')` は `(pressed)` だけに届きました。50〜51 行目と 59〜61 行目の例は strict の tsc に通りました。21 行目の `alias` には説明がありません（`input` と `model` の `alias` には 24 行目・34〜35 行目の説明がある）。

📄 `angular/packages/core/src/authoring/output/output_emitter_ref.ts` L18–32 （▶ の行: 19–20, 22–23, 26, 31）

````ts
18 │ /**
19 ▶  * An `OutputEmitterRef` is created by the `output()` function and can be
20 ▶  * used to emit values to consumers of your directive or component.
21 │  *
22 ▶  * Consumers of your directive/component can bind to the output and
23 ▶  * subscribe to changes via the bound event syntax. For example:
24 │  *
25 │  * ```html
26 ▶  * <my-comp (valueChange)="processNewValue($event)" />
27 │  * ```
28 │  *
29 │  * @see [Custom events with outputs](guide/components/outputs)
30 │  *
31 ▶  * @publicAPI
32 │  */
````

📄 `angular/packages/core/src/authoring/output/output_ref.ts` L11–21 （▶ の行: 12–13, 15–16, 20）

```ts
11 │ /**
12 ▶  * Function that can be used to manually clean up a
13 ▶  * programmatic {@link OutputRef#subscribe} subscription.
14 │  *
15 ▶  * Note: Angular will automatically clean up subscriptions
16 ▶  * when the directive/component of the output is destroyed.
17 │  *
18 │  * @see [Subscribing to outputs programmatically](guide/components/outputs#subscribing-to-outputs-programmatically)
19 │  *
20 ▶  * @publicAPI
21 │  */
```

📄 `angular/packages/core/src/authoring/output/output_emitter_ref.ts` L121–137 （▶ の行: 123, 126–128, 134–136）

```ts
121 │ }
122 │ 
123 ▶ function removeNullValues(arr: unknown[]): void {
124 │   let i = arr.length - 1;
125 │ 
126 ▶   while (i > -1) {
127 ▶     if (arr[i] === null) {
128 ▶       arr.splice(i, 1);
129 │     }
130 │     i--;
131 │   }
132 │ }
133 │ 
134 ▶ /** Gets the owning `DestroyRef` for the given output. */
135 ▶ export function getOutputDestroyRef(ref: OutputRef<unknown>): DestroyRef | undefined {
136 ▶   return ref.destroyRef;
137 │ }
```

15〜16 行目「Angular はディレクティブが壊れると購読を自動で片付ける」は、壊したあとで `subscribe` すると NG0953「Unexpected subscription to destroyed \`OutputRef\`. The owning directive/component is destroyed.」の例外になる形で現れます（output\_emitter\_ref.ts L52〜59）。壊したあとで `emit` すると、例外ではなく console.warn「NG0953: Unexpected emit for destroyed \`OutputRef\`. ...」を書いて戻ります（L84〜93、本番も `NG0953` の 1 行を書く）。この警告は開いている issue #70727（NG0953 should be suppressable）が「止められるようにしてほしい」と言っているものです。ページでは console に出るので、記録の再生にしています。

説明文に無い振る舞いが 2 つあります。`emit` の最中に listener が自分を `unsubscribe` しても、次の listener は飛ばされず（`["c", "2:c", "2:d"]`）、その listener は次の `emit` から呼ばれません。配列から消さずに `null` を置き、終わってから 123〜131 行目の `removeNullValues` で詰めるからです。listener が例外を投げても、次の listener は呼ばれ、例外は `ErrorHandler` に渡されて console.error「ERROR listener で投げた」になりました（L104〜110）。

## 6. outputFromObservable と outputToObservable

📄 `angular/packages/core/rxjs-interop/src/output_from_observable.ts` L61–85 （▶ の行: 62–63, 65–69, 78–79, 84）

````ts
61 │ /**
62 ▶  * Declares an Angular output that is using an RxJS observable as a source
63 ▶  * for events dispatched to parent subscribers.
64 │  *
65 ▶  * The behavior for an observable as source is defined as followed:
66 ▶  *    1. New values are forwarded to the Angular output (next notifications).
67 ▶  *    2. Errors notifications are not handled by Angular. You need to handle these manually.
68 ▶  *       For example by using `catchError`.
69 ▶  *    3. Completion notifications stop the output from emitting new values.
70 │  *
71 │  * @usageNotes
72 │  * Initialize an output in your directive by declaring a
73 │  * class field and initializing it with the `outputFromObservable()` function.
74 │  *
75 │  * ```ts
76 │  * @Directive({..})
77 │  * export class MyDir {
78 ▶  *   nameChange$ = <some-observable>;
79 ▶  *   nameChange = outputFromObservable(this.nameChange$);
80 │  * }
81 │  * ```
82 │  * @see [RxJS interop with component and directive outputs](ecosystem/rxjs-interop/output-interop)
83 │  *
84 ▶  * @publicApi 19.0
85 │  */
````

DEMO の 5 つ目の表（記録）で、66 行目と 69 行目のとおり、`outputFromObservable(emitter)` は `next` を流し、元の `complete` のあとの値は流しませんでした（`["x"]`）。元には rxjs の `Subject` を継ぐ `EventEmitter` を使いました。壊したあとの `subscribe` は NG0953 でした（L41〜48）。78 行目の `<some-observable>` は置き換える場所の印で、そのまま tsc にかけると「TS1005: '&gt;' expected.」です。

`outputToObservable`（output\_to\_observable.ts L13〜15、実装は[model() と output() の章](../signals/13-signals-model-output.md)）は、`output()` の値も `model()` の値の変化も流し、コンポーネントを壊すと 2 つとも `complete` しました（`["e", "value:99", "complete", "value complete"]`）。`model()` は `OutputRef` でもある（model\_signal.ts L53）ので、そのまま渡せます。

## 7. 注入の文脈の外と、@publicAPI のタグ

145〜146 行目は「クラスのフィールドを足し、`input` か `input.required` の呼び出しで初期化する」と書くだけで、ほかの場所で呼んだときのことを書いていません。関数の中で直接 `input(0)` と書くと、AOT のコンパイラーが「NG8110: Unsupported call to the input function. This function can only be called in the initializer of a class member.」で止めます（`model`・`output` も同じ。ngc で確かめた）。コンパイラーは名前を直接呼ぶ形しか見ないので、DEMO の 4 つ目の表では `{input, model, output}` のオブジェクトに入れてから関数の中（注入の文脈の外）で呼びました。すると、開発モードは 3 つとも NG0203 でしたが、文は「inputFunction() can only be used within an injection context ...」「modelFunction() can only be used ...」「output() can only be used ...」で、`input()` と `model()` は内部の関数の名前で出ました。`assertInInjectionContext(input)`（input.ts L25）は、渡した関数の `name` を文に使います（di/contextual.ts L84）。L171〜177 の `input` は `inputFunction` そのもの（`required` を足して返すだけ）なので、`name` は `'inputFunction'` です。この確かめは 018f8266b3c（2024-03-08、`fix(core): ensure all initializer functions run in an injection context (#54761)`）からで、新しい本家でも同じです。

本番では確かめが無く、`input(0)` は関数の外でも signal を返しました。`model(0)` と `output()` は、中の `OutputEmitterRef` が `inject(DestroyRef)` を呼ぶ（output\_emitter\_ref.ts L41）ので、本番でも NG0203 でした。

この章の宣言のうち 11 か所は `@publicAPI`（API が大文字）です。引用に入っているのは input.ts の 46・103・166 行目、input\_signal.ts の 17・55 行目、model.ts の 41 行目、model\_signal.ts の 28 行目、output\_emitter\_ref.ts の 31 行目、output\_ref.ts の 20 行目で、ほかに model\_signal.ts の L51（`ModelSignal`）と output\_ref.ts の L29（`OutputRef`）があります（authoring/queries.ts にも 3 か所。[第 6 回](06-cra-signal-queries.md)）。TypeScript の JSDoc の解析はタグの名前の大文字と小文字をそのまま残し（手元で `ts.getJSDocTags` で確かめた）、angular.dev の API のページが「stable」の札を作る行は名前が `publicApi` とちょうど同じタグしか見ません（adev/shared-docs/pipeline/api-gen/rendering/entities/categorization.mts L165 の `t.name === tag`、jsdoc-transforms.mts L245）。1b1519224d1（2024-09-13、`feat(core): mark input, output and model APIs as stable (#57804)`）で `@developerPreview` を `@publicAPI` に書き換え、そのあと f5803184119（2025-04-11、`docs(docs-infra): Add version of introduction for APIs (#60814)`）で `@publicApi` に「19.0」が足されたときも、`@publicAPI` の方には足されませんでした（input\_signal.ts の 47 行目は `@publicApi 19.0`、55 行目は `@publicAPI`）。

> **🧪 DEMO — input・model・output を本物で試す**
>
> 押すと、このページ（本番ビルド）で、親と子の小さなコンポーネントを文書に付けない要素の上に `createComponent` で作り、親のテンプレート（AOT でコンパイル済み）で束ねて試し、結果を「このページ」の列に書きます。ApplicationRef には付けず、表を作り終えたら destroy します。  
>  console に何かを書く操作（壊したあとの `emit`、例外を投げる listener、input でない名前の `setInput`）は、ページでは動かさず、本番の記録を「（記録）」として入れます。5 つ目の表（cra-signal-io.demo-ox.ts）も記録の再生です。`outputFromObservable`・`outputToObservable` をこのページで使うと、サイトがもともと最初に読んでいる `@angular/core/rxjs-interop` の中で新しく使う分が入り、最初に読む JS（Initial total）が 0.05 kB 増えたためです。「開発モード」の列は、同じ関数（cra-signal-io.demo-io.ts）を Node（domino の上の JIT）で動かした記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cra-signal-io)

## ここまでの呼び出し（親が v を変えたとき、子が set したとき）

- 👤 `parent.v.set(20); detectChanges()`
  - `[(value)] の入力の側：前の値と違う → setInput の道` — [双方向の章](../typecheck/12-typecheck-two-way.md)
    - `applyValueToInputSignal(node, 20)` — input\_signal\_node.ts L32 — *emit しない*
- 👤 `child.value.set(11)`
  - `equal でなければ signalSetFn(node, 11)` — model\_signal.ts L80〜82
  - `emitterRef.emit(11) → (valueChange) と親の v.set(11)` — L83

## テストと直し方

| ファイル（packages/core/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `authoring/input_signal_spec.ts` | `input signal`（13）› `should throw if there is no value for required inputs`（69）・`should include alias in required inputs error message, if available`（95） | 1 節の NG0950 |
| `acceptance/authoring/signal_inputs_spec.ts` | `signal inputs`（37）› `should support transforms`（145）・`should not run transforms lazily`（170） | 3 節。transform の回数の it は無い |
| `acceptance/authoring/model_inputs_spec.ts` | `model inputs`（26）› `should emit to the change output when the model changes`（173）・`should not emit to the change event when then property binding changes`（213）・`should throw if a required model input is updated too early`（364） | 4 節。213 は説明文（L48〜49）と違う方を固める |
| `acceptance/authoring/output_function_spec.ts` | `output() function`（22）› `should error when emitting to a destroyed output`（79）・`should not skip subsequent listeners if an earlier listener unsubscribes`（197）、`outputFromObservable()`（231）› ``should report subscription listener errors to `ErrorHandler` and continue``（352） | 5・6 節。79 は名前は error だが console.warn を待つ |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test/acceptance/authoring:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
$ pnpm bazel test //packages/core/test/authoring:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
（結果は表の下）
```

結果は手元の bazel で、`//packages/core/test/acceptance/authoring:test` の `output\(\) function` で 11、`model inputs` で 18、`signal inputs` で 10（全体は 62）、`//packages/core/test/authoring:test` の `input signal` で 8、`model signal` で 11（全体は 19）、どれも 0 failures でした（2026-11-22）。

直すとしたら、input.ts の L25・L32 と model.ts の L18・L24 の `assertInInjectionContext` に名前を渡す形にするか、`input` と `model` の関数に `name` を付けて、例外の文を `input()`・`model()` にします。spec は authoring/input\_signal\_spec.ts に「文脈の外で `input()` を呼ぶと、文が `input()` で始まる NG0203」を足します。説明文は、model\_signal.ts の L48〜49 を「子の側で `set`・`update` したときに出力に流す（親から束ねた値では流さない）」に、11 か所の `@publicAPI` を `@publicApi` に（必要なら版も）、output.ts の 21 行目の `alias` に説明を足します。

## 聞かれそうな質問

**Q. 必須の input を束ね忘れたら、いつ分かりますか？**

テンプレートで使っていれば、コンパイルの NG8008 です（`strictTemplates` が無くても）。`createComponent` などで作って `setInput` を忘れると、読んだときの NG0950 です（101 行目は前者だけを書いている）。

**Q. `transform` は、親が同じ値を束ね直しても走りますか？**

走りません。テンプレートの束ねも `setInput` も、前と同じ値なら入力を書かないので、`transform` も呼ばれません。27 行目の「束ねられるたびに」は「値が変わるたびに」です。

**Q. 親が `[(value)]` の値を変えたら、子の `valueChange` は流れますか？**

流れません。流れるのは子が `set`・`update` したときだけです（model\_inputs\_spec.ts L213 が固めている）。

**Q. コンポーネントを壊したあとで `output.emit()` すると？**

例外ではなく、console.warn の NG0953 を書いて何もしません（本番でも 1 行出る）。壊したあとの `subscribe` は例外です。

**Q. `input()` をメソッドの中で呼ぶとどうなりますか？**

開発モードは NG0203 で、文には `inputFunction()` と出ます。本番は確かめが無く、ただの signal が返りますが、コンパイラーはフィールドの初期化子しか入力として扱わないので、入力にはなりません（[コンパイラからの見え方の章](../signals/12-signals-input-compile.md)）。

## 読み終えて

- `input.required` の「コンパイルのエラー」は NG8008 で、`strictTemplates` に関係なく出る。コンパイルを通らない道では実行時の NG0950。
- `transform` は値が変わったときだけ走り、引数の型の確かめは `strictTemplates` のときだけ。
- `model` の出力に流れるのは子の側の更新だけ。親からの束ねでは流れない。
- 壊れた `output` の `emit` は console.warn（#70727）、`subscribe` は例外。listener の例外は `ErrorHandler` に渡り、次の listener は呼ばれる。
- 注入の文脈の外の NG0203 は `inputFunction()`・`modelFunction()` と内部の名前で出る。11 か所の `@publicAPI` は angular.dev の「stable」の札の作り方と合わない。

---

← 前: [QueryList・DestroyRef・ComponentRef・Compiler の説明文](04-cra-linker-misc.md)  
次: [viewChild()・contentChild() ほか signal のクエリの説明文](06-cra-signal-queries.md) →
