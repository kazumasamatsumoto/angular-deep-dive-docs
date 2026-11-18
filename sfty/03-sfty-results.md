[目次](../README.md) › [Signal Forms の型を読む：FieldTree から SchemaPath まで、api/types.ts の 1000 行](README.md) › 第 3 回 / 全 6 回

# 検証の結果と binding の型：ValidationResult・DisabledReason・FormFieldBinding・CompatFieldState

> types.ts の前半と中ほど：MarkAsTouchedOptions・OneOrMany・DisabledReason・ValidationSuccess・AsyncValidationResult、CompatFieldState・FormFieldBinding。null・undefined・void を「成功」とまとめる型と、それをルールの種類ごとに受ける logic\_node.ts の builder・addDefaultField・ArrayMergeIgnoreLogic の扱い、型を外した false や文字列が実行時にどうなるか。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sfty-results)

---

検証のルールが返してよいものは、`null`・`undefined`・何も返さない（`void`）・エラー 1 つ・エラーの配列、の 5 通りです。この章では、それを型で書いた `ValidationSuccess`・`OneOrMany`・`AsyncValidationResult` と、無効の理由の `DisabledReason`、互換の `CompatFieldState`、入力欄との結びつきの `FormFieldBinding` を 1 行ずつ読み、それぞれを受け取って実装している側の行と対応させます。型が許さない値（`false`・文字列）を型を外して返すと実行時に何が起きるかも、本物で確かめます。

読む対象は `packages/forms/signals/src/api/types.ts` の前半（57〜193 行目）と中ほど（584〜662 行目）、受け取る側の `schema/logic_node.ts`・`api/rules/disabled.ts`・`compat/src/compat_field_node.ts`・`field/node.ts`・`directive/form_field.ts`、spec は `test/node/field_node.spec.ts` です。`FormSubmitOptions`（このファイルの先頭）は [forms-sf-submit-compat](../forms/19-forms-sf-submit-compat.md) の 1 節、`TreeValidationResult` と `ValidationResult` の定義と、ルールの結果を 1 本の配列にする `ArrayMergeIgnoreLogic.compute`・付け先を決める `addDefaultField` は [forms-sf-validation](../forms/17-forms-sf-validation.md) の 1〜3 節で読みました。ここではそれらを繰り返さず、型の側から「何が通り、通ったものがどうなるか」を並べます。

1. [1. FieldTree と Field](01-sfty-tree.md)
2. [2. FieldState の読み口](02-sfty-state.md)
3. **3. 検証の結果と binding の型**（この章）
4. [4. PathKind と SchemaPath](04-sfty-path.md)
5. [5. validateHttp と debounce](05-sfty-http-debounce.md)
6. [6. spec と issue](06-sfty-tests-issues.md)

## 1. MarkAsTouchedOptions と OneOrMany

📄 `angular/packages/forms/signals/src/api/types.ts` L57–79 （▶ の行: 65, 67–68, 70, 79）

```ts
57 │ 
58 │ /**
59 │  * Options for the `markAsTouched` method.
60 │  *
61 │  * @see [Touched state](guide/forms/signals/field-state-management#touched-state)
62 │  *
63 │  * @publicApi 22.0
64 │  */
65 ▶ export interface MarkAsTouchedOptions {
66 │   /**
67 ▶    * If `true`, only marks the current field as touched.
68 ▶    * If `false` or not provided, marks the field and all its descendants as touched.
69 │    */
70 ▶   skipDescendants?: boolean;
71 │ }
72 │ 
73 │ /**
74 │  * A type that represents either a single value of type `T` or a readonly array of `T`.
75 │  * @template T The type of the value(s).
76 │  *
77 │  * @publicApi 22.0
78 │  */
79 ▶ export type OneOrMany<T> = T | readonly T[];
```

65〜71 行目の `MarkAsTouchedOptions` は、`FieldState.markAsTouched(options?)`（[前の章](02-sfty-state.md)の 3 節）の引数です。67〜68 行目のとおり、`skipDescendants` が `true` なら自分だけ、無いか `false` なら子孫も touched にします。eeba51c50b7（2026-03-04「make markAsTouched() touch all descendants by default」）が既定を「子孫も」に替え、この欄を足しました。中身（`markAsTouchedInternal` が `skipDescendants` を見て子へ下りるのをやめる）は [forms-sf-submit-compat](../forms/19-forms-sf-submit-compat.md) の 2 節です。

79 行目の `OneOrMany<T>` は「1 つか、読み取り専用の配列か」です。`readonly T[]` なので、`as const` を付けた配列もそのまま返せます。検証の結果の型（2 節）、`submit` の `action` の戻り値（`TreeValidationResult`）、parse の `error` など、「エラーは 1 つでも配列でもよい」所は全部これを使います。

## 2. 成功を表す型：ValidationSuccess = null | undefined | void

📄 `angular/packages/forms/signals/src/api/types.ts` L115–138 （▶ の行: 123, 125, 127, 138）

```ts
115 │ /**
116 │  * A reason for a field's disablement.
117 │  *
118 │  * @see [Disabled reasons](guide/forms/signals/form-logic#disabled-reasons)
119 │  *
120 │  * @category logic
121 │  * @publicApi 22.0
122 │  */
123 ▶ export interface DisabledReason {
124 │   /** The field that is disabled. */
125 ▶   readonly fieldTree: ReadonlyFieldTree<unknown>;
126 │   /** A user-facing message describing the reason for the disablement. */
127 ▶   readonly message?: string;
128 │ }
129 │ 
130 │ /**
131 │  * The absence of an error which indicates a successful validation result.
132 │  *
133 │  * @see [Validation basics](guide/forms/signals/validation#validation-basics)
134 │  *
135 │  * @category types
136 │  * @publicApi 22.0
137 │  */
138 ▶ export type ValidationSuccess = null | undefined | void;
```

138 行目の `ValidationSuccess` は「エラーが無い」を表す型で、`null`・`undefined`・`void` の 3 つの和です。`void` が入っているので、`validate(p.name, () => {})` のように何も返さない関数や、`if` の中でだけ `return` する関数も型が通ります（記録の R3）。検証の結果の型は、どれも「`ValidationSuccess | OneOrMany<エラー>`」の形です（`ValidationResult`・`TreeValidationResult` は forms-sf-validation の 1 節の引用）。

📄 `angular/packages/forms/signals/src/api/types.ts` L177–193 （▶ の行: 179, 182–183, 192–193）

```ts
177 │ 
178 │ /**
179 ▶  * An asynchronous validation result where all errors explicitly define their target field.
180 │  *
181 │  * The result may be one of the following:
182 ▶  * 1. A {@link ValidationResult} to indicate the result if resolved.
183 ▶  * 5. 'pending' if the validation is not yet resolved.
184 │  *
185 │  * @template E the type of error (defaults to {@link ValidationError}).
186 │  *
187 │  * @see [Async validation](guide/forms/signals/validation#async-validation)
188 │  *
189 │  * @category types
190 │  * @publicApi 22.0
191 │  */
192 ▶ export type AsyncValidationResult<E extends ValidationError = ValidationError> =
193 ▶   ValidationResult<E> | 'pending';
```

192〜193 行目の `AsyncValidationResult` は、それに文字列の `'pending'`（まだ結果が出ていない）を足した型です。`ValidationResult` に `'pending'` は入りません（R17 は通り、R18 は TS2322）。

> [!NOTE]
> **ポイント**
>
> 179 行目の説明は「すべてのエラーが付け先（`fieldTree`）を**明示する**結果」ですが、192 行目の既定の `E` は `ValidationError` で、`ValidationError` の interface には `fieldTree` の欄がありません。`const r: ValidationResult = {kind: 'x'}` は型が通ります（R15）。付け先を必ず書かせるのは、`ValidationError.WithFieldTree` を `E` に渡したとき（3 節の受け取る側）だけです。また 182〜183 行目の箇条書きは「1.」の次が「5.」になっています。

## 3. 受け取る側：ルールの種類ごとに、結果の型が決まっている

📄 `angular/packages/forms/signals/src/schema/logic_node.ts` L23–48 （▶ の行: 23, 30, 33, 36, 39, 42, 45, 48）

```ts
23 ▶ export abstract class AbstractLogicNodeBuilder {
24 │   constructor(
25 │     /** The depth of this node in the schema tree. */
26 │     protected readonly depth: number,
27 │   ) {}
28 │ 
29 │   /** Adds a rule to determine if a field should be hidden. */
30 ▶   abstract addHiddenRule(logic: LogicFn<any, boolean>): void;
31 │ 
32 │   /** Adds a rule to determine if a field should be disabled, and for what reason. */
33 ▶   abstract addDisabledReasonRule(logic: LogicFn<any, DisabledReason | undefined>): void;
34 │ 
35 │   /** Adds a rule to determine if a field should be read-only. */
36 ▶   abstract addReadonlyRule(logic: LogicFn<any, boolean>): void;
37 │ 
38 │   /** Adds a rule for synchronous validation errors for a field. */
39 ▶   abstract addSyncErrorRule(logic: LogicFn<any, ValidationResult>): void;
40 │ 
41 │   /** Adds a rule for synchronous validation errors that apply to a subtree. */
42 ▶   abstract addSyncTreeErrorRule(logic: LogicFn<any, ValidationResult>): void;
43 │ 
44 │   /** Adds a rule for asynchronous validation errors for a field. */
45 ▶   abstract addAsyncErrorRule(logic: LogicFn<any, AsyncValidationResult>): void;
46 │ 
47 │   /** Adds a rule to compute metadata for a field. */
48 ▶   abstract addMetadataRule<M>(key: MetadataKey<unknown, M, unknown>, logic: LogicFn<any, M>): void;
```

schema の関数で `validate` や `disabled` を呼ぶと、ルールはこの builder（ロジックの木を組み立てる係。[forms-sf-schema](../forms/16-forms-sf-schema.md)）の `add…Rule` に渡されます。23〜48 行目の抽象メソッドの引数の型が、ルールの種類ごとに「返してよいもの」を決めています。

| 行 | メソッド | ルールが返す型 | 使う API |
| --- | --- | --- | --- |
| 30 | `addHiddenRule` | `boolean` | `hidden` |
| 33 | `addDisabledReasonRule` | `DisabledReason \| undefined` | `disabled`（4 節） |
| 36 | `addReadonlyRule` | `boolean` | `readonly` |
| 39 | `addSyncErrorRule` | `ValidationResult` | `validate`・`required` など |
| 42 | `addSyncTreeErrorRule` | `ValidationResult` | `validateTree` |
| 45 | `addAsyncErrorRule` | `AsyncValidationResult`（`'pending'` を含む） | `validateAsync`・`validateHttp` |
| 48 | `addMetadataRule` | キーの型 `M` | `metadata` |

`validate` に渡す関数（`FieldValidator`）は `ValidationResult<ValidationError.WithoutFieldTree>` を返す型で、エラーに `fieldTree` を書くと TS2322 です（R9）。`validate` の中で `addDefaultField(結果, ctx.fieldTree)` を通してから 39 行目に渡すので、builder が受け取る時点では付け先が入っています（forms-sf-validation の 3 節）。付け先を自分で書くのは `validateTree`（R10）です。

この後、受け取った結果が `errors()` の配列になるまでの扱いは、5 通りの成功・失敗でこう分かれます。

1. **`addDefaultField`**

   配列なら要素ごとに、1 つならそれに、`fieldTree ??= ctx.fieldTree` を書き込みます。`null`・`undefined`・`void` は「偽」なので何もしません。
2. **`ArrayMergeIgnoreLogic.compute`**

   そのフィールドに積まれたルールを順に呼び、`undefined` は飛ばし、配列は展開し、1 つは足します。検証の箱は `ignoreNull` で作られているので `null` も捨てます（forms-sf-validation の 2 節）。
3. **結果**

   `null`・`undefined`・`void`・`[]` は `errors()` が空、1 つと配列はそのまま並びます。下の記録の上から 6 行です。

📄 `記録（Node、22.2.6）`

```
$ node results.mjs     # @angular/forms 22.2.6 / node v24.22.1、validate(p.name, () => …) の 1 つだけを付けた form
validate → null                          [] valid=true invalid=false
validate → undefined                     [] valid=true invalid=false
validate → 何も返さない（() => {}）     [] valid=true invalid=false
validate → 1 つ {kind}                   ["one@name"] valid=false invalid=true
validate → 配列 [a, b]                   ["a@name","b@name"] valid=false invalid=true
validate → 空の配列 []                   [] valid=true invalid=false
validate → 配列の中に null [a, null]     throw TypeError: Cannot read properties of null (reading 'fieldTree')
validate → false（型では不可）           [false] valid=false invalid=true
validate → '' 空文字（型では不可）       [""] valid=false invalid=true
validate → 'oops' 文字列（型では不可）   throw TypeError: Cannot create property 'fieldTree' on string 'oops'
disabled when: () => 'reason'            disabled=true [{"field":"age","message":"reason"}]
disabled when: () => true                disabled=true [{"field":"age"}]
disabled when: () => false               disabled=false []
disabled when: () => ''                  disabled=true [{"field":"age","message":""}]
disabled when: 'static'                  disabled=true [{"field":"age","message":"static"}]
disabled 設定なし                        disabled=true [{"field":"age"}]
親と子の両方 [{"field":"g","message":"parent"},{"field":"g.age","message":"child"}]
```

下の 4 行は、型が許さない値を型を外して返したときです。`false` と `''` は、`addDefaultField` では「偽」として素通りし、`compute` では `undefined` でも `null` でもないので**エラーとして足され**、`errors()` が `[false]` になり `invalid()` が `true` になります。`'oops'` は文字列に `fieldTree` を書き込もうとして、`[a, null]` は `null` の `fieldTree` を読もうとして、`addDefaultField` で投げます（`ignoreNull` が配列の中の `null` を捨てる所までは届かない）。JavaScript で `() => value() === '' && {kind: 'empty'}` と書くと `false` を返す場合があり、TypeScript ではそれが R22 の TS2322 として止まります。型がこの 5 通りに絞っているのは、こうした値を通さないためです。

## 4. DisabledReason と disabled の when

2 節の引用の 123〜128 行目が `DisabledReason` です。無効になったフィールド（125 行目、読み取り専用の木）と、任意の文言（127 行目）の 2 つだけです。

📄 `angular/packages/forms/signals/src/api/rules/disabled.ts` L13–33 （▶ の行: 19–20, 30–32）

```ts
13 │ /**
14 │  * Adds logic to a field to conditionally disable it. A disabled field does not contribute to the
15 │  * validation, touched/dirty, or other state of its parent field.
16 │  *
17 │  * @param path The target path to add the disabled logic to.
18 │  * @param config Optional configuration object.
19 ▶  *  - `when`: A reactive function that returns `true` (or a string reason) when the field is disabled,
20 ▶  *    and `false` when it is not disabled. Can also be a static string reason.
21 │  * @template TValue The type of value stored in the field the logic is bound to.
22 │  * @template TPathKind The kind of path the logic is bound to (a root path, child path, or item of an array)
23 │  *
24 │  * @see [Disabled fields](guide/forms/signals/form-logic#prevent-field-updates-with-disabled)
25 │  * @see [Availability state](guide/forms/signals/field-state-management#availability-state)
26 │  *
27 │  * @category logic
28 │  * @publicApi 22.0
29 │  */
30 ▶ export function disabled<TValue, TPathKind extends PathKind = PathKind.Root>(
31 ▶   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
32 ▶   config?: {when?: string | NoInfer<LogicFn<TValue, boolean | string, TPathKind>>},
33 │ ): void;
```

32 行目の `when` は、文字列か「`boolean | string` を返す関数」です。19〜20 行目の説明のとおり、`true` か理由の文字列なら無効、`false` なら有効です。この後の実装（[forms-sf-rules-metadata](../forms/18-forms-sf-rules-metadata.md) の 1 節の引用）が、文字列なら `{fieldTree, message}`、`true` なら `{fieldTree}`、`false` なら `undefined` を 3 節の 33 行目に渡します。`undefined` を返す関数は型が通りません（R14）。`when` を渡さない `disabled(p.x)` は、いつでも無効です（記録の「設定なし」）。

- **空文字**：`''` も文字列なので、**無効になり**、理由の `message` が `''` です（記録の `when: () => ''`）。`when: ({value}) => value() > 0 ? 'reason' : ''` は型が通る（R24）ので、`''` を「無効でない」のつもりで返すと、いつでも無効になります。19〜20 行目の説明は `false` を「無効でない」としていて、`''` には触れていません。
- **親の理由は子に入る**：子の `disabledReasons()` は、親の理由の後ろに自分の理由を並べたものです（state.ts の computed。forms-sf-rules-metadata の 3 節）。`fieldTree` を見れば、どのフィールドが原因かが分かります（記録の最後の行）。
- **fieldTree は読み取り専用の木**：125 行目は a1a6c5282ed（前の章の 1 節）で `FieldTree` から替わりました。書ける木を入れるのは通ります（R20）。

## 5. CompatFieldState：control を値に持つフィールド

📄 `angular/packages/forms/signals/src/api/types.ts` L584–615 （▶ の行: 592–593, 595–597, 600–601, 612, 615）

```ts
584 │ /**
585 │  * This is FieldState also providing access to the wrapped FormControl.
586 │  *
587 │  * @see [Migrating existing forms to Signal Forms](guide/forms/signals/migration)
588 │  *
589 │  * @category interop
590 │  * @publicApi 22.0
591 │  */
592 ▶ export type CompatFieldState<
593 ▶   TControl extends AbstractControl,
594 │   TKey extends string | number = string | number,
595 ▶   TMode extends 'writable' | 'readonly' = 'writable',
596 ▶ > = FieldStateByMode<
597 ▶   TControl extends AbstractControl<unknown, infer TValue> ? TValue : never,
598 │   TKey,
599 │   TMode
600 ▶ > & {
601 ▶   control: Signal<TControl>;
602 │ };
603 │ 
604 │ /**
605 │  * A readonly {@link CompatFieldState}.
606 │  *
607 │  * @see [Migrating existing forms to Signal Forms](guide/forms/signals/migration)
608 │  *
609 │  * @category interop
610 │  * @publicApi 22.0
611 │  */
612 ▶ export type ReadonlyCompatFieldState<
613 │   TControl extends AbstractControl,
614 │   TKey extends string | number = string | number,
615 ▶ > = CompatFieldState<TControl, TKey, 'readonly'>;
```

[第 1 回](01-sfty-tree.md)の 2 節の `FieldTree` の呼ぶ側の型で、値が `AbstractControl`（Reactive Forms の `FormControl` など）のときに呼んだ型がこれです。597 行目の `TControl extends AbstractControl<unknown, infer TValue>` で、control の 2 つ目の型引数（`getRawValue()` の値の型）を取り出し、596 行目の `FieldStateByMode`（[前の章](02-sfty-state.md)の 1 節）に渡して、ふつうの `FieldState<TValue>` か `ReadonlyFieldState<TValue>` を作ります。そのうえで 600〜602 行目で `control: Signal<TControl>` を足します。612〜615 行目の `ReadonlyCompatFieldState` は `TMode` に `'readonly'` を入れた別名です。

📄 `angular/packages/forms/signals/compat/src/compat_field_node.ts` L18–30 （▶ の行: 23–24, 28）

```ts
18 │ /**
19 │  * Field node with additional  control property.
20 │  *
21 │  * Compat node has no children.
22 │  */
23 ▶ export class CompatFieldNode extends FieldNode {
24 ▶   readonly control: Signal<AbstractControl>;
25 │ 
26 │   constructor(public readonly options: CompatFieldNodeOptions) {
27 │     super(options);
28 ▶     this.control = this.options.control;
29 │   }
30 │ }
```

実装は、`FieldNode` を継承した `CompatFieldNode` です。24 行目で `control` を持ち、28 行目で options の signal をそのまま入れます。21 行目のコメントのとおり子はありません（第 1 回の 2 節で、control の値の `FieldTree` の子の型が `object` なのと揃う）。compatForm がこのノードを作る流れは [forms-sf-submit-compat](../forms/19-forms-sf-submit-compat.md) の 5〜6 節です。

## 6. FormFieldBinding：入力欄との結びつきを、読み取り専用で見せる

📄 `angular/packages/forms/signals/src/api/types.ts` L631–662 （▶ の行: 639, 643, 648, 653, 661）

```ts
631 │ /**
632 │  * Represents a binding between a field and a UI control through a {@link FormField} directive.
633 │  *
634 │  * @see [Focus a form control bound to a form field](guide/forms/signals/field-state-management#focus-a-form-control-bound-to-a-form-field)
635 │  * @see [How the FormField directive works](guide/forms/signals/custom-controls#how-the-formfield-directive-works)
636 │  *
637 │  * @publicApi 22.0
638 │  */
639 ▶ export interface FormFieldBinding {
640 │   /**
641 │    * The HTML element on which the {@link FormField} directive is applied.
642 │    */
643 ▶   readonly element: HTMLElement;
644 │ 
645 │   /**
646 │    * The node injector for the element hosting this field binding.
647 │    */
648 ▶   readonly injector: Injector;
649 │ 
650 │   /**
651 │    * The {@link FieldState} of the field bound to the {@link FormField} directive.
652 │    */
653 ▶   readonly state: Signal<ReadonlyFieldState<unknown>>;
654 │ 
655 │   /**
656 │    * Focuses this field binding.
657 │    *
658 │    * By default, this will focus {@link element}. However, custom controls can implement their own
659 │    * focus behavior.
660 │    */
661 ▶   focus(options?: FocusOptions): void;
662 │ }
```

`FormFieldBinding` は、`[formField]` ディレクティブ 1 つ分を外に見せるための interface です。643 行目の要素、648 行目の注入器（その要素の node injector）、653 行目の状態、661 行目の `focus` の 4 つだけで、653 行目の状態は `ReadonlyFieldState` です。3e7ce0dafcf（2026-02-19「restrict SignalFormsConfig to a readonly API」、Fix #65779）が足し、`FieldState.formFieldBindings`（前の章の 2 節）と `provideSignalFormsConfig` の `classes` の関数の引数を、`FormField` からこの型に替えました。#65779 は、`classes` の関数の中から状態に書き込めてしまう、という報告です。

📄 `angular/packages/forms/signals/src/directive/form_field.ts` L253–290 （▶ の行: 254–255, 263, 265, 267, 288–289）

```ts
253 │   private installClassBindingEffect(): void {
254 ▶     const classes = Object.entries(this.config?.classes ?? {}).map(
255 ▶       ([className, computation]) => [className, computed(() => computation(this))] as const,
256 │     );
257 │     if (classes.length === 0) {
258 │       return;
259 │     }
260 │ 
261 │     // If we have class bindings to apply, set up an afterRenderEffect to apply them.
262 │     const bindings = createBindings<string>();
263 ▶     afterRenderEffect(
264 │       {
265 ▶         write: () => {
266 │           for (const [className, computation] of classes) {
267 ▶             const active = computation();
268 │             if (bindingUpdated(bindings, className, active)) {
269 │               if (active) {
270 │                 this.renderer.addClass(this.element, className);
271 │               } else {
272 │                 this.renderer.removeClass(this.element, className);
273 │               }
274 │             }
275 │           }
276 │         },
277 │       },
278 │       {injector: this.injector},
279 │     );
280 │   }
281 │ 
282 │   /**
283 │    * Focuses this field binding.
284 │    *
285 │    * By default, this will focus the host DOM element. However, custom `FormUiControl`s can
286 │    * implement custom focusing behavior.
287 │    */
288 ▶   focus(options?: FocusOptions): void {
289 ▶     this.focuser(options);
290 │   }
```

実装しているのは `FormField` ディレクティブそのものです。ただしクラスに `implements FormFieldBinding` とは書いておらず、`element`・`injector`・`state`・`focus` を同じ名前で持っていることで、型の上で当てはまります（構造的部分型）。255 行目で `classes` の関数に `this`（`FormField`）を渡し、263 行目の `afterRenderEffect` で 267 行目の結果に従って class を付け外しします。`FormField.state` は `computed<FieldState<T>>` なので、実行時の `binding.state().value` は書ける signal です。型で読み取り専用に見せているだけで、types.spec.ts の `it('should prevent writing to field value through context in a signal provider')`（前の章のテストと直し方）が「型の上で書けないこと」を固めています。

📄 `angular/packages/forms/signals/src/field/node.ts` L106–138 （▶ の行: 107–108, 123–126, 128–129, 134–137）

```ts
106 │ 
107 ▶   focusBoundControl(options?: FocusOptions): void {
108 ▶     this.getBindingForFocus()?.focus(options);
109 │   }
110 │ 
111 │   /**
112 │    * Gets the Field directive binding that should be focused when the developer calls
113 │    * `focusBoundControl` on this node.
114 │    *
115 │    * This will prioritize focusable bindings to this node, and if multiple exist, it will return
116 │    * the first one in the DOM. If no focusable bindings exist on this node, it will return the
117 │    * first focusable binding in the DOM for any descendant node of this one.
118 │    */
119 │   private getBindingForFocus():
120 │     | (FormField<unknown> & {focus: (options?: FocusOptions) => void})
121 │     | undefined {
122 │     // First try to focus one of our own bindings.
123 ▶     const own = this.formFieldBindings()
124 ▶       .filter(
125 ▶         (b): b is FormField<unknown> & {focus: (options?: FocusOptions) => void} =>
126 ▶           b.focus !== undefined,
127 │       )
128 ▶       .reduce(
129 ▶         firstInDom<FormField<unknown> & {focus: (options?: FocusOptions) => void}>,
130 │         undefined,
131 │       );
132 │     if (own) return own;
133 │     // Fallback to focusing the bound control for one of our children.
134 ▶     return this.structure
135 ▶       .children()
136 ▶       .map((child) => child.getBindingForFocus())
137 ▶       .reduce(firstInDom, undefined);
138 │   }
```

`FieldState.focusBoundControl`（前の章の 2 節）の実装です。123 行目で自分の binding を並べ、124〜127 行目で `focus` を持つものに絞り、128〜131 行目で DOM で先に出てくるものを選びます。自分に無ければ 134〜137 行目で子を探します。最初に入った 10e9022a07a（2025-12-11）のときは、ディレクティブの `focus` は `focus?()` と省略可能でした。今は 289 行目のとおり `FormField` が必ず `focus` を持つので、125〜126 行目の絞り込みで外れる binding はありません。カスタムコントロールの `focus` を使うかどうかは、`FormField` の中の `focuser` の差し替え（[sfd-custom-control](../sfd/04-sfd-custom-control.md)）で決まります。

## 7. DEMO：返すものを替えて errors() と disabledReasons() を見る

> **🧪 DEMO — 検証の結果・無効の理由・FormFieldBinding（@angular/forms 22.2.6）**
>
> 1 は `validate(p.name, () => …)` が返すものを選ぶと、ルールが走り直して `errors()` が変わります。「型では不可」のものは、型を外して返しています。2 は `disabled` の `when` が返すもの。3 は `[formField]` で結んだ入力欄の binding を覗きます（このデモのコンポーネントの providers に `provideSignalFormsConfig({classes: {'sftyr-touched': (binding) => binding.state().touched()}})`）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sfty-results)

- **1**：`null`・`undefined`・何も返さない・`[]` は `[]` と `true / false`、1 つと配列は `@f.name`（`addDefaultField` が付けた付け先）付きで並び `false / true` です。`false` と `''` はそのままエラーとして並び、`'oops'` と `[…, null]` は投げます（3 節）。
- **2**：`''` を選ぶと `disabled()` が `true` で `message: ""`。「親」を選ぶと `g` の理由の後ろに `g.age` の理由が並びます（4 節）。
- **3**：`formFieldBindings()` は 1 個、`binding.state() === h.email()` は `true`、`'set' in binding.state().value` も `true`（6 節）。`markAsTouched()` を押すと、`classes` の関数が `true` を返し、入力欄に赤い枠（`sftyr-touched`）が付きます。

### tsc の記録

次のファイルの `schema<M>((p) => { … })` の中と後ろに 1 行ずつ足して `tsc --strict` にかけました（TypeScript 6.0.3、型は 22.2.6 の `.d.ts`）。

📄 `results.ts（記録用、1〜21 行目）`

```
import {signal} from '@angular/core';
import {
  disabled,
  form,
  schema,
  validate,
  validateTree,
  type AsyncValidationResult,
  type DisabledReason,
  type OneOrMany,
  type TreeValidationResult,
  type ValidationResult,
} from '@angular/forms/signals';

interface M {
  name: string;
  age: number;
}
const f = form(signal<M>({name: '', age: 0}));

schema<M>((p) => {
```

| 記号 | 行 | 書いたもの | 確かめたいこと | tsc の結果 |
| --- | --- | --- | --- | --- |
| R1 | 22 | `validate(p.name, () => null);` | null | 通る |
| R2 | 23 | `validate(p.name, () => undefined);` | undefined | 通る |
| R3 | 24 | `validate(p.name, () => {});` | 何も返さない（void） | 通る |
| R4 | 25 | `validate(p.name, () => ({kind: 'a'}));` | 1 つ | 通る |
| R5 | 26 | `validate(p.name, () => [{kind: 'a'}, {kind: 'b'}]);` | 配列 | 通る |
| R6 | 27 | `validate(p.name, () => []);` | 空の配列 | 通る |
| R7 | 28 | `validate(p.name, () => 'oops');` | 文字列 | TS2322 Type 'string' is not assignable to type 'ValidationResult&lt;WithoutFieldTree&gt;'. |
| R25 | 29 | `validate(p.name, () => '');` | 空文字 | TS2322 Type 'string' is not assignable to type 'ValidationResult&lt;WithoutFieldTree&gt;'. |
| R8 | 30 | `validate(p.name, () => false);` | false | TS2322 Type 'boolean' is not assignable to type 'ValidationResult&lt;WithoutFieldTree&gt;'. |
| R9 | 31 | `validate(p.name, ({fieldTree}) => ({kind: 'a', fieldTree}));` | validate で fieldTree を付ける | TS2322 Type 'ReadonlyFieldTree&lt;string, string \| number&gt;' is not assignable to type 'undefined'. |
| R10 | 32 | `validateTree(p, ({fieldTree}) => ({kind: 'a', fieldTree: fieldTree.age}));` | validateTree で子に付ける | 通る |
| R11 | 33 | `validateTree(p, () => ({kind: 'a'}));` | validateTree で fieldTree なし | 通る |
| R12 | 34 | `disabled(p.age, {when: () => 'reason'});` | when が文字列 | 通る |
| R13 | 35 | `disabled(p.age, {when: () => 1});` | when が数 | TS2769 No overload matches this call. |
| R14 | 36 | `disabled(p.age, {when: () => undefined});` | when が undefined | TS2769 No overload matches this call. |
| R22 | 37 | `validate(p.name, ({value}) => value() === '' && {kind: 'empty'});` | && で書く | TS2322 Type 'false \| { kind: string; }' is not assignable to type 'ValidationResult&lt;WithoutFieldTree&gt;'. |
| R23 | 38 | `validate(p.name, () => [{kind: 'a'}, null]);` | 配列の中に null | TS2322 Type 'null' is not assignable to type 'WithoutFieldTree'. |
| R24 | 39 | `disabled(p.age, {when: ({value}) => (value() > 0 ? 'reason' : '')});` | when が空文字を返しうる | 通る |
| R15 | 42 | `const r1: ValidationResult = {kind: 'x'};` | fieldTree の無いエラーを ValidationResult に | 通る |
| R16 | 43 | `const r2: TreeValidationResult = {kind: 'x'};` | 同じものを TreeValidationResult に | 通る |
| R17 | 44 | `const r3: AsyncValidationResult = 'pending';` | 'pending' | 通る |
| R18 | 45 | `const r4: ValidationResult = 'pending';` | 'pending' を ValidationResult に | TS2322 Type '"pending"' is not assignable to type 'ValidationResult'. |
| R19 | 46 | `const o: OneOrMany<number> = [1, 2];` | OneOrMany の配列 | 通る |
| R20 | 47 | `const dr: DisabledReason = {fieldTree: f.age};` | 書ける木を DisabledReason に | 通る |
| R21 | 48 | `const dr2: DisabledReason = {fieldTree: f.age, message: 1};` | message が数 | TS2322 Type 'number' is not assignable to type 'string'. |

## ここまでの呼び出し（validate の結果が errors() になるまで）

- 👤 `validate(p.name, () => null)` — 利用者の schema — *FieldValidator の戻り値の型で絞られる（R1〜R9）*
  - `pathNode.builder.addSyncErrorRule((ctx) => addDefaultField(logic(ctx), ctx.fieldTree))` — api/rules/validation/validate.ts
    - `addSyncErrorRule(logic: LogicFn<any, ValidationResult>)` — schema/logic\_node.ts 39 — *LogicContainer.syncErrors に積む*
- 👤 `f.name().errors()` — 利用者のコード
  - `validationState.errors` → `syncErrors` — field/validation.ts — *forms-sf-validation の 0 節*
    - `ArrayMergeIgnoreLogic.compute(ctx)` — schema/logic.ts — *undefined と null を捨て、配列を展開する*
      - `logic(ctx)` → `addDefaultField(null, ctx.fieldTree)` — field/validation.ts — *偽なので何もしない*

## テストと直し方

この章の約束を固めているのは `test/node/field_node.spec.ts` の次の it です。

📄 `angular/packages/forms/signals/test/node/field_node.spec.ts` L504–518 （▶ の行: 504, 515–517）

```ts
504 ▶     it('does not propagate down when skipDescendants is true', () => {
505 │       const f = form(
506 │         signal({
507 │           a: 1,
508 │           b: 2,
509 │         }),
510 │         {injector: TestBed.inject(Injector)},
511 │       );
512 │ 
513 │       expect(f().touched()).toBe(false);
514 │       expect(f.a().touched()).toBe(false);
515 ▶       f().markAsTouched({skipDescendants: true});
516 ▶       expect(f().touched()).toBe(true);
517 ▶       expect(f.a().touched()).toBe(false);
518 │     });
```

`describe('touched')` の `it('does not propagate down when skipDescendants is true')`（504 行目）。515 行目で根だけを touched にし、517 行目で子が touched でないこと（1 節の 70 行目）。

📄 `angular/packages/forms/signals/test/node/field_node.spec.ts` L886–902 （▶ の行: 886, 890, 896–899）

```ts
886 ▶     it('should disable with reason', () => {
887 │       const f = form(
888 │         signal({a: 1, b: 2}),
889 │         (p) => {
890 ▶           disabled(p.a, {when: () => 'a cannot be changed'});
891 │         },
892 │         {injector: TestBed.inject(Injector)},
893 │       );
894 │ 
895 │       expect(f.a().disabled()).toBe(true);
896 ▶       expect(f.a().disabledReasons()).toEqual([
897 ▶         {
898 ▶           fieldTree: f.a,
899 ▶           message: 'a cannot be changed',
900 │         },
901 │       ]);
902 │     });
```

📄 `angular/packages/forms/signals/test/node/field_node.spec.ts` L927–950 （▶ の行: 927, 931, 944–947）

```ts
927 ▶     it('disabled reason should propagate to children', () => {
928 │       const f = form(
929 │         signal({a: 1, b: 2}),
930 │         (p) => {
931 ▶           disabled(p, {when: () => 'form unavailable'});
932 │         },
933 │         {injector: TestBed.inject(Injector)},
934 │       );
935 │ 
936 │       expect(f().disabled()).toBe(true);
937 │       expect(f().disabledReasons()).toEqual([
938 │         {
939 │           fieldTree: f,
940 │           message: 'form unavailable',
941 │         },
942 │       ]);
943 │       expect(f.a().disabled()).toBe(true);
944 ▶       expect(f.a().disabledReasons()).toEqual([
945 ▶         {
946 ▶           fieldTree: f,
947 ▶           message: 'form unavailable',
948 │         },
949 │       ]);
950 │     });
```

`describe('disabled')` の `it('should disable with reason')`（886 行目）は、890 行目の理由の文字列が 896〜901 行目の `{fieldTree, message}` になること、`it('disabled reason should propagate to children')`（927 行目）は、931 行目で根に付けた理由が 944〜949 行目で子の `disabledReasons()` に根の `fieldTree` のまま入ること（4 節）です。空文字の `when`（4 節）を確かめる it はありません。

📄 `angular/packages/forms/signals/test/node/field_node.spec.ts` L1227–1242 （▶ の行: 1227, 1231, 1236, 1240）

```ts
1227 ▶     it('should allow validate logic to return null to indicate no error', () => {
1228 │       const f = form(
1229 │         signal({a: 1, b: 2}),
1230 │         (p) => {
1231 ▶           validate(p.a, ({value}) => (value() > 1 ? {kind: 'error'} : null));
1232 │         },
1233 │         {injector: TestBed.inject(Injector)},
1234 │       );
1235 │ 
1236 ▶       expect(f.a().errors()).toEqual([]);
1237 │       expect(f.a().valid()).toBe(true);
1238 │ 
1239 │       f.a().value.set(2);
1240 ▶       expect(f.a().errors()).toEqual([{kind: 'error', fieldTree: f.a}]);
1241 │       expect(f.a().valid()).toBe(false);
1242 │     });
```

`describe('validation')` の `it('should allow validate logic to return null to indicate no error')`（1227 行目）。1231 行目で `null` を返すルールが 1236 行目で `[]`、エラーを返すと 1240 行目で `fieldTree: f.a` が付くこと（2・3 節）。`undefined`・何も返さない・`[]` を直接確かめる it は field\_node.spec.ts にはありません。

📄 `走らせ方`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all \
  --test_arg=--filter="FieldNode disabled|FieldNode validation"
pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all \
  --test_arg=--filter="FieldNode touched"
```

📄 `結果`

```
# 2026-11-19、手元の macOS で（8576f161ae4）
Ran 14 of 539 specs
14 specs, 0 failures     # disabled 5・validation 9（tree validation の 2 を含む）
//packages/forms/signals/test/node:test                                  PASSED in 0.8s
（touched の 16 本は前の章の 27 本の中で走らせた。skipDescendants の it も入る）
```

138 行目の `null` が spec でどれだけ使われているかを、作業木で外して確かめました。

📄 `結果（作業木、bazel を直接）`

```
# 作業木（8576f161ae4）で types.ts 138 行目から null を外し（ValidationSuccess = undefined | void）、
# //packages/forms/signals/test/node:test を走らせた。試した後で戻し、作業木も消した
[W4]
packages/forms/signals/test/node/field_node.spec.ts:1231:38 - error TS2322: Type '{ kind: string; } | null' is not assignable to type 'ValidationResult<WithoutFieldTree>'.
packages/forms/signals/test/node/resource.spec.ts:189:24 - error TS2322: Type 'null' is not assignable to type 'TreeValidationResult'.
（ほか validation_status.spec.ts 36 件・resource.spec.ts 16 件・standard_schema.spec.ts 2 件・
 compat/signal_form_control.spec.ts 2 件・types.spec.ts 1 件、合わせて 58 件）
ERROR: Build did NOT complete successfully
```

`null` で「エラー無し」を返す書き方は spec の 6 ファイル、58 か所にあり、型から外すとコンパイルの段で全部落ちます。`ValidationSuccess` の 3 つのうち `null` は、spec の上でも欠かせない形です。

### 直すとしたら

- 4 節の空文字は、`api/rules/disabled.ts` の `disabled` の実装（forms-sf-rules-metadata の引用）で `typeof result === 'string'` の前に空文字を `false` と同じに扱う分かれ道を足すか、19〜20 行目の説明に「空文字も無効」と書くかのどちらかです。前者は振る舞いが変わるので、spec は `field_node.spec.ts` の `describe('disabled')` に `when: () => ''` の it を足します。
- 2 節の 179 行目（と `ValidationResult` の同じ文）の説明と 192 行目の既定の型は、どちらかに揃える所です。型を `WithFieldTree` にすると `Validator` 型（[第 4 回](04-sfty-path.md)）の使い方が変わるので、文書を直すほうが影響が小さい形です。182〜183 行目の番号（「5.」）も同じ所で直せます。
- 6 節の 124〜127 行目の絞り込みは、今の `FormField` では常に真です。消すなら node.ts の `getBindingForFocus` で、spec は test/web の `focus.spec.ts`（10e9022a07a が足した）が受け持ちます。

## 聞かれそうな質問

**Q. validate のルールで「エラー無し」は null と undefined のどちらを返すべきですか？**

どちらでも、何も返さなくても、空の配列でも同じ結果（`errors()` が空）です。138 行目の `ValidationSuccess` が 3 つを許し、`ArrayMergeIgnoreLogic.compute` が `undefined` と `null` を捨て、空の配列は展開しても何も足しません（3 節の記録）。

**Q. ルールが false を返すとどうなりますか？**

型では TS2322 です（R8・R22）。型を外して返すと、`false` が 1 つのエラーとして `errors()` に入り、`invalid()` が `true` になります（3 節の記録）。`&&` で書いた条件式が `false` を返す形に注意が要ります。

**Q. disabledReasons() の fieldTree は何を指していますか？**

無効の原因になったフィールドです。親を無効にすると、子の `disabledReasons()` には親の `fieldTree` の理由が入ります（field\_node.spec.ts 944〜949 行目）。型は 125 行目の `ReadonlyFieldTree<unknown>` です。

**Q. provideSignalFormsConfig の classes の関数から状態に書き込めますか？**

型の上では書けません。引数が `FormFieldBinding` で、653 行目の `state` が `ReadonlyFieldState` だからです（前の章のテストと直し方の types.spec.ts）。実行時に渡されるのは `FormField` 自身で、`state()` は書ける `FieldState` です（6 節・DEMO の 3）。

**Q. CompatFieldState の値の型はどこから来ますか？**

597 行目で `AbstractControl<unknown, infer TValue>` の 2 つ目の型引数を取り出したものです。それを `FieldStateByMode` に渡し、600〜602 行目で `control` を足します。実装は `CompatFieldNode`（compat\_field\_node.ts 23〜29 行目）です。

## 読み終えて

- 検証の結果の型は `ValidationSuccess（null | undefined | void）| OneOrMany<エラー>`。非同期だけ `'pending'` が足される
- ルールの種類ごとに、builder の `add…Rule` の引数の型が「返してよいもの」を決める。`validate` は付け先を書かせず、`addDefaultField` が付ける
- 型を外した `false`・`''` はエラーとして残り、文字列と配列の中の `null` は投げる。型の 5 通りの絞り込みが、それを止めている
- `disabled` の `when` は文字列なら空でも無効になり、理由は親から子へ並んで受け継がれる
- `CompatFieldState` は `FieldStateByMode` に `control` を足した型、`FormFieldBinding` は `FormField` を読み取り専用で見せる型。どちらも実物は同じクラスで、違いは型の上だけ

---

← 前: [FieldState と ReadonlyFieldState：状態の読み口を型で並べる](02-sfty-state.md)  
次: [PathKind と SchemaPath：ルールを付けられる場所を型で決める](04-sfty-path.md) →
