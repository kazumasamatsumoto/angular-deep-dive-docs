[目次](../README.md) › [Signal Forms の組み込みの検証：required から minDate まで、1 つの validate に下りるまで](README.md) › 第 1 回 / 全 5 回

# 共通の形：when・message・error と、空の値を検証しない isEmpty

> validation/util.ts の BaseValidatorConfig（message と error のどちらか一方、when）、getOption・isEmpty・normalizeErrors、email.ts と pattern.ts が validate に下りるまでの行。空文字・null・false・NaN を検証しない理由と、required だけが空を見る分担（467b37b4b42）、when が email では検証の関数、pattern では metadata の側で評価される違い（df54e6a7b2e）、g フラグの RegExp を pattern に渡すと lastIndex で結果が交互に変わること。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sfv-common)

---

`required`・`email`・`pattern`・`min`・`maxLength`・`minDate` といった組み込みの検証は、どれも同じ部品でできています。この章では、**設定の型（`message` と `error` のどちらか一方と `when`）、値か関数かを見分ける `getOption`、空の値を検証しない `isEmpty`**を読み、いちばん短い `email` と、metadata も書く `pattern` が `validate` に下りるまでを 1 行ずつ追います。空を見るのは `required` だけ、という分担もここで確かめます。

読む対象は `packages/forms/signals/src/api/rules/validation/` の `util.ts`・`email.ts`・`pattern.ts`・`required.ts` と、spec の `test/node/api/validators/email.spec.ts`・`pattern.spec.ts`・`required.spec.ts` です。`validate` がルールを積むだけで、検証は `computed` の中で走ることは [signal-forms](../signals/17-signal-forms.md) の 6 節、ルールの結果が 1 本の配列になる仕組みは [forms-sf-validation](../forms/17-forms-sf-validation.md) の 2 節、metadata の鍵と reducer は [forms-sf-rules-metadata](../forms/18-forms-sf-rules-metadata.md) の 5 節で読みました。この章はその上に乗ります。

1. **1. 共通の形と isEmpty**（この章）
2. [2. 数と長さの上限下限](02-sfv-limits.md)
3. [3. 日付の上限下限](03-sfv-dates.md)
4. [4. エラーの型](04-sfv-errors.md)
5. [5. spec と issue](05-sfv-tests-issues.md)

## 1. 設定の型：BaseValidatorConfig は 2 つの形の和

組み込みの検証の 3 つ目の引数（`config`）の型です。

📄 `angular/packages/forms/signals/src/api/rules/validation/util.ts` L12–33 （▶ の行: 13, 16–17, 19–20, 22, 24, 29–30, 32）

```ts
12 │ /** Represents a value that has a length or size, such as an array or string, or set. */
13 ▶ export type ValueWithLengthOrSize = {length: number} | {size: number};
14 │ 
15 │ /** Common options available on the standard validators. */
16 ▶ export type BaseValidatorConfig<TValue, TPathKind extends PathKind = PathKind.Root> =
17 ▶   | {
18 │       /** A user-facing error message to include with the error. */
19 ▶       message?: string | LogicFn<TValue, string, TPathKind>;
20 ▶       error?: never;
21 │       /** A function that receives the `FieldContext` and returns true if the validator should be applied. */
22 ▶       when?: NoInfer<LogicFn<TValue, boolean, TPathKind>>;
23 │     }
24 ▶   | {
25 │       /**
26 │        * Custom validation error(s) to report instead of the default,
27 │        * or a function that receives the `FieldContext` and returns custom validation error(s).
28 │        */
29 ▶       error?: OneOrMany<ValidationError> | LogicFn<TValue, OneOrMany<ValidationError>, TPathKind>;
30 ▶       message?: never;
31 │       /** A function that receives the `FieldContext` and returns true if the validator should be applied. */
32 ▶       when?: NoInfer<LogicFn<TValue, boolean, TPathKind>>;
33 │     };
```

16 行目の型は、17〜23 行目の形と 24〜33 行目の形の**和**（どちらか一方）です。1 つ目の形は 19 行目の `message`（エラーに入れる文、文字か `LogicFn`）を持ち、20 行目で `error?: never`。2 つ目の形は 29 行目の `error`（既定のエラーの代わりに返すエラー、1 つか配列か、それを返す関数）を持ち、30 行目で `message?: never`。`never` 型の項目には `undefined` 以外を入れられないので、`message` と `error` を同時に書くと型エラーになります。22 行目と 32 行目の `when`（真のときだけ検証する条件）は両方の形にあり、どちらとも一緒に書けます。

📄 `message と error を同時に書く（記録）`

```
$ cat t.ts
import {signal} from '@angular/core';
import {form, email, emailError} from '@angular/forms/signals';
const m = signal({e: ''});
form(m, (p) => {
  email(p.e, {message: 'x', error: emailError()});
});

$ npx tsc --noEmit --strict --moduleResolution bundler --skipLibCheck t.ts   # サイトの 22.2.6 の型
t.ts(5,29): error TS2322: Type 'WithoutFieldTree<EmailValidationError>' is not assignable to type 'undefined'.
```

`error` 側の形の `message` が `never` なので、`emailError()` の型が `undefined` と比べられて落ちます。13 行目の `ValueWithLengthOrSize` は長さの検証が使う型で、[第 2 回](02-sfv-limits.md)で読みます。

> [!TIP]
> **新卒エンジニアへ**
>
> `LogicFn<TValue, T>` は「フィールドの文脈（`FieldContext`）を受け取って `T` を返す関数」の型です。`message: (ctx) => ...` と書けば、メッセージを他のフィールドの値から作れます。

## 2. getOption と isEmpty

📄 `angular/packages/forms/signals/src/api/rules/validation/util.ts` L41–64 （▶ の行: 49–50, 53, 59–61, 63）

```ts
41 │ /**
42 │  * Gets the value for an option that may be either a static value or a logic function that produces
43 │  * the option value.
44 │  *
45 │  * @param opt The option from BaseValidatorConfig.
46 │  * @param ctx The current FieldContext.
47 │  * @returns The value for the option.
48 │  */
49 ▶ export function getOption<TOption, TValue, TPathKind extends PathKind = PathKind.Root>(
50 ▶   opt: Exclude<TOption, Function> | LogicFn<TValue, TOption, TPathKind> | undefined,
51 │   ctx: FieldContext<TValue, TPathKind>,
52 │ ): TOption | undefined {
53 ▶   return opt instanceof Function ? opt(ctx) : opt;
54 │ }
55 │ 
56 │ /**
57 │  * Checks if the given value is considered empty. Empty values are: null, undefined, '', false, NaN.
58 │  */
59 ▶ export function isEmpty(value: unknown): boolean {
60 ▶   if (typeof value === 'number') {
61 ▶     return isNaN(value);
62 │   }
63 ▶   return value === '' || value === false || value == null;
64 │ }
```

1. **53 行目：getOption は「関数なら呼ぶ、そうでなければそのまま」**

   `message` と `error` は値でも `LogicFn` でもよいので、使う直前にこの関数を通します。判定は `instanceof Function` です。50 行目の型の `Exclude<TOption, Function>` は「値の側に関数は来ない」という約束で、関数そのものをメッセージにすることはできません。呼ばれるのは検証の関数の中（3 節の 74・76 行目）なので、`message` の関数が読んだ signal も検証の `computed` の依存になります。
2. **60〜61 行目：数は NaN だけが空**

   `typeof value === 'number'` なら `isNaN` の結果を返します。`0` は空ではありません。
3. **63 行目：それ以外は ''・false・null・undefined**

   `value == null`（`==` が 2 つ）は `null` と `undefined` の両方で真です。空白だけの文字（`' '`）や空の配列（`[]`）は空ではありません。

この判定が実際にどう効くかを、`required` を付けたフィールドで確かめた記録です（3・4 節の `email` と `pattern` の記録も同じ実行）。

📄 `記録：required・email・pattern に値を入れた結果`

```
# <work>/sfv-demo/a/rec-common.mjs を Node 24 で実行（サイトの node_modules の @angular/forms 22.2.6）
--- required(p) を付けたフィールドに入れた値 → errors() の kind
null       required
undefined  required
''         required
false      required
NaN        required
0          （なし）
[]         （なし）
' '        （なし）
'a'        （なし）
--- email の長さの先読み（ローカル部 64 文字まで、全体 254 文字まで）
''                     （なし）
a@b                    （なし）
a@b.                   email
.a@b.com               email
local 64 文字           （なし）
local 65 文字           email
全体 255 文字           email
全体 254 文字           （なし）
a@b.com, c@d.com       email
a@b.com,c@d.com        email
--- pattern(p.plain, /^[a-z]+$/) と pattern(p.global, /^[a-z]+$/g) に同じ値を順に入れる
a      plain: （なし）  global: （なし）  lastIndex=1
ab     plain: （なし）  global: pattern   lastIndex=0
abc    plain: （なし）  global: （なし）  lastIndex=3
abcd   plain: （なし）  global: pattern   lastIndex=0
abcde  plain: （なし）  global: （なし）  lastIndex=5
```

上の 5 つが 59〜64 行目で空、下の 4 つが空でない値です。`false` が空なのは、HTML の `<input type="checkbox" required>` がチェックされるまで無効なのに合わせた決まりで、#68509（「boolean のフィールドで `false` を入れると required のエラーになる」）は「意図した設計」として閉じられました。空の配列が空でないことも #66721 で「期待どおり。配列には `minLength` を使う」と答えられています。この 2 つは長くドキュメントに書かれておらず、2026-09-12 の 467b37b4b42 で `required` の doc コメントに足されました。

📄 `git show 467b37b4b42（required.ts の部分）`

```
$ git show 467b37b4b42 -- packages/forms/signals/src/api/rules/validation/required.ts
# docs(forms): document what required() considers empty（2026-09-12、v22.2.0 に入った。8576f161ae4 より後）
@@ -17,6 +17,14 @@ import {requiredError} from './validation_errors';
  * This function can only be called on any type of path.
  * In addition to binding a validator, this function adds `REQUIRED` property to the field.
  *
+ * A value is considered empty when it is `null`, `undefined`, the empty string `''`, `false`, or
+ * `NaN`. Every other value is considered non-empty, including `0` and the empty array `[]` — use
+ * [`minLength()`](api/forms/signals/minLength) to require a minimum number of items in an array.
+ *
+ * `false` is empty to follow the native semantics of `required` on `<input type="checkbox">`, where
+ * an unchecked box fails validation. `NaN` is empty because it is usually the result of a parsing
+ * error, and is not a valid number.
+ *
  * @param path Path of the field to validate

# 同じコミットで required.spec.ts に describe('emptiness') の 2 つの it（空とみなす 4 つの値、空でない 0・[]・true・'a'）が足された。
```

## 3. email：when → isEmpty → 検査 → エラー

📄 `angular/packages/forms/signals/src/api/rules/validation/email.ts` L44–82 （▶ の行: 45, 61–63, 65–67, 69–70, 72–74, 76, 80）

```ts
44 │ const EMAIL_REGEXP =
45 ▶   /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
46 │ 
47 │ /**
48 │  * Binds a validator to the given path that requires the value to match the standard email format.
49 │  * This function can only be called on string paths.
50 │  *
51 │  * @param path Path of the field to validate
52 │  * @param config Optional, allows providing any of the following options:
53 │  *  - `error`: Custom validation error(s) to be used instead of the default `ValidationError.email()`
54 │  *    or a function that receives the `FieldContext` and returns custom validation error(s).
55 │  * @template TPathKind The kind of path the logic is bound to (a root path, child path, or item of an array)
56 │  *
57 │  * @see [Signal Form Email Validation](guide/forms/signals/validation#email)
58 │  * @category validation
59 │  * @publicApi 22.0
60 │  */
61 ▶ export function email<TPathKind extends PathKind = PathKind.Root>(
62 ▶   path: SchemaPath<string, SchemaPathRules.Supported, TPathKind>,
63 ▶   config?: BaseValidatorConfig<string, TPathKind>,
64 │ ) {
65 ▶   validate(path, (ctx) => {
66 ▶     if (config?.when && !config.when(ctx)) {
67 ▶       return undefined;
68 │     }
69 ▶     if (isEmpty(ctx.value())) {
70 ▶       return undefined;
71 │     }
72 ▶     if (!EMAIL_REGEXP.test(ctx.value())) {
73 ▶       if (config?.error) {
74 ▶         return getOption(config.error, ctx);
75 │       } else {
76 ▶         return emailError({message: getOption(config?.message, ctx)});
77 │       }
78 │     }
79 │ 
80 ▶     return undefined;
81 │   });
82 │ }
```

1. **65 行目：検証の関数を 1 つ積む**

   `email` は metadata を何も書かず、`validate` を 1 回呼ぶだけです。62 行目の型で、文字列のフィールドにしか付けられません。
2. **66〜68 行目：when が偽ならエラー無し**

   `config.when(ctx)` を**検証の関数の中**で呼ぶので、`when` が読んだ signal も依存になり、条件が変われば再検証されます。
3. **69〜71 行目：空なら黙る**

   `''` は 2 節の `isEmpty` で空なので、エラーを返しません。空のときに「必須です」を出すのは `required` の役目です（5 節）。
4. **72 行目：正規表現で検査**

   45 行目の `EMAIL_REGEXP` は `g` フラグを持たないので、`test` を何度呼んでも結果は値だけで決まります（4 節の `pattern` との違い）。
5. **73〜77 行目：error があればそれ、無ければ emailError**

   74 行目は `config.error` を `getOption` に通してそのまま返します。76 行目は既定のエラーを作る `emailError` に、`getOption` を通した `message` を渡します。エラーの作り手と、返したエラーに `fieldTree` が付く流れは [第 4 回](04-sfv-errors.md)と [forms-sf-validation](../forms/17-forms-sf-validation.md) の 3 節です。

45 行目の正規表現は、引用の外の doc コメントにあるとおり AngularJS の `input.js` から持ってきたもので、先頭の 2 つの先読み `(?=.{1,254}$)` と `(?=.{1,64}@)` が「全体で 254 文字まで」「`@` の前が 64 文字まで」を、文字を消費せずに確かめます。その後ろは、ローカル部（`@` の前）が点で始まらず点で終わらないこと、ドメインの各ラベルが英数字で始まって終わり 63 文字までであることです。ドメインの点は必須ではないので、記録のとおり `a@b` は通ります。

> [!WARNING]
> **ハマりどころ**
>
> 正規表現は文字列全体を 1 つのアドレスとして見るので、`<input type="email" multiple>` のようにカンマで区切った複数のアドレスは、記録の最後の 2 行のとおり `email` のエラーになります。開いている #69715 は、Chrome で `multiple` の email の欄に `a@b.com, a` と打つとカーソルが先頭へ飛ぶという報告です。ブラウザが返す `value` と DOM に書き戻す値の扱いは [sfd-native](../sfd/02-sfd-native.md) の 1・2 節です。

66〜68 行目の `when` は、最初からあったわけではありません。

📄 `git show df54e6a7b2e（email.ts の部分）`

```
$ git show df54e6a7b2e -- packages/forms/signals/src/api/rules/validation/email.ts
# refactor(forms): use when consistently for conditional rules and validators（2026-05-04）
@@ -63,6 +63,9 @@ export function email<TPathKind extends PathKind = PathKind.Root>(
   config?: BaseValidatorConfig<string, TPathKind>,
 ) {
   validate(path, (ctx) => {
+    if (config?.when && !config.when(ctx)) {
+      return undefined;
+    }
     if (isEmpty(ctx.value())) {
       return undefined;
     }

# 同じコミットで util.ts の BaseValidatorConfig の 2 つの形に when が足された（22・32 行目）。
# pattern・max・min・maxLength・minLength は、検証の関数ではなく MEMO の metadata の関数の先頭に同じ 3 行が入った。
```

2026-05-04 の df54e6a7b2e で、`required` だけにあった `when` がすべての組み込みの検証に広がりました。開いている #63932（2025-09-19、「`required` 以外の検証にも条件を付けたい」）が求めていた形ですが、issue は開いたままです。

## 4. pattern：when は metadata の側にある

📄 `angular/packages/forms/signals/src/api/rules/validation/pattern.ts` L31–60 （▶ の行: 33, 36–38, 40, 42–44, 47–48, 51, 53, 55）

```ts
31 │ export function pattern<TPathKind extends PathKind = PathKind.Root>(
32 │   path: SchemaPath<string, SchemaPathRules.Supported, TPathKind>,
33 ▶   pattern: RegExp | LogicFn<string | undefined, RegExp | undefined, TPathKind>,
34 │   config?: BaseValidatorConfig<string, TPathKind>,
35 │ ) {
36 ▶   const PATTERN_MEMO = metadata(path, createMetadataKey<RegExp | undefined>(), (ctx) => {
37 ▶     if (config?.when && !config.when(ctx)) {
38 ▶       return undefined;
39 │     }
40 ▶     return pattern instanceof RegExp ? pattern : pattern(ctx);
41 │   });
42 ▶   metadata(path, PATTERN, ({state}) => state.metadata(PATTERN_MEMO)!());
43 ▶   validate(path, (ctx) => {
44 ▶     if (isEmpty(ctx.value())) {
45 │       return undefined;
46 │     }
47 ▶     const pattern = ctx.state.metadata(PATTERN_MEMO)!();
48 ▶     if (pattern === undefined) {
49 │       return undefined;
50 │     }
51 ▶     if (!pattern.test(ctx.value())) {
52 │       if (config?.error) {
53 ▶         return getOption(config.error, ctx);
54 │       } else {
55 ▶         return patternError(pattern, {message: getOption(config?.message, ctx)});
56 │       }
57 │     }
58 │     return undefined;
59 │   });
60 │ }
```

1. **36〜41 行目：使う RegExp を metadata に 1 回だけ計算する**

   `createMetadataKey()` でこの呼び出し専用の鍵を作り、`metadata` の戻り値（鍵そのもの）を `PATTERN_MEMO` に取っておきます。37〜39 行目で `when` が偽なら `undefined`、そうでなければ 40 行目で、渡されたのが `RegExp` ならそのもの、関数なら呼んだ結果です。`email` と違い、`when` はここ（metadata の関数）で評価されます。
2. **42 行目：公開の鍵 PATTERN に流す**

   memo の値を `PATTERN` に書きます。フィールドの `pattern()` はこの鍵を読みます（下の引用）。
3. **44〜50 行目：空と「パターン無し」は黙る**

   44 行目で空なら黙り、47 行目で memo を読み、48 行目で `undefined`（`when` が偽か、関数が `undefined` を返した）なら黙ります。
4. **51〜56 行目：test して、error か patternError**

   形は `email` の 73〜77 行目と同じで、55 行目の `patternError` は使った `RegExp` をエラーに入れます。

📄 `angular/packages/forms/signals/src/api/rules/metadata.ts` L418–430 （▶ の行: 426–430）

```ts
418 │ /**
419 │  * A {@link MetadataKey} representing the patterns the field must match.
420 │  *
421 │  * @see [Pattern validation](guide/forms/signals/validation#pattern)
422 │  *
423 │  * @category validation
424 │  * @publicApi 22.0
425 │  */
426 ▶ export const PATTERN: MetadataKey<
427 ▶   Signal<RegExp[]>,
428 ▶   RegExp | undefined,
429 ▶   RegExp[]
430 ▶ > = createMetadataKey(MetadataReducer.list<RegExp>());
```

`PATTERN` の reducer は `list` なので、`pattern` を 2 回付けたフィールドの `pattern()` は 2 つの `RegExp` の配列です。`undefined` は捨てられるので（[forms-sf-rules-metadata](../forms/18-forms-sf-rules-metadata.md) の 5 節の `list`）、`when` が偽のパターンは配列から消えます。検証の関数は 2 回の呼び出しで別々に積まれるので、合わないパターンの数だけエラーが出ます。なお `pattern()` は input の `pattern` 属性にはなりません（[sfd-native](../sfd/02-sfd-native.md) の 3 節）。

> [!WARNING]
> **ハマりどころ**
>
> 51 行目は渡された `RegExp` の `test` をそのまま呼びます。`g`（や `y`）フラグ付きの `RegExp` は `test` が一致した位置を `lastIndex` に覚え、次の `test` をそこから始めるので、2 節の記録の最後のとおり、`/^[a-z]+$/g` では同じ形の値が交互に `pattern` のエラーになります（`ab` の検査が `a` の後の位置 1 から始まり、`^` が合わない）。Reactive Forms の `Validators.pattern` は同じ動きを doc コメントに書いています（`packages/forms/src/validators.ts` の doc コメントの「Pattern matching with the global or sticky flag」、#14669・#39053）。`pattern.ts` の doc コメントにはこの注意がありません。

## 5. required との分担：空を見るのは required だけ

📄 `angular/packages/forms/signals/src/api/rules/validation/required.ts` L15–39 （▶ の行: 17–18, 25, 33, 35–37, 39）

```ts
15 │ /**
16 │  * Binds a validator to the given path that requires the value to be non-empty.
17 ▶  * This function can only be called on any type of path.
18 ▶  * In addition to binding a validator, this function adds `REQUIRED` property to the field.
19 │  *
20 │  * @param path Path of the field to validate
21 │  * @param config Optional, allows providing any of the following options:
22 │  *  - `message`: A user-facing message for the error.
23 │  *  - `error`: Custom validation error(s) to be used instead of the default `ValidationError.required()`
24 │  *    or a function that receives the `FieldContext` and returns custom validation error(s).
25 ▶  *  - `when`: A function that receives the `FieldContext` and returns true if the field is required
26 │  * @template TValue The type of value stored in the field the logic is bound to.
27 │  * @template TPathKind The kind of path the logic is bound to (a root path, child path, or item of an array)
28 │  *
29 │  * @see [Signal Form Required Validation](guide/forms/signals/validation#required)
30 │  * @category validation
31 │  * @publicApi 22.0
32 │  */
33 ▶ export function required<TValue, TPathKind extends PathKind = PathKind.Root>(
34 │   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
35 ▶   config?: BaseValidatorConfig<TValue, TPathKind> & {
36 ▶     when?: NoInfer<LogicFn<TValue, boolean, TPathKind>>;
37 ▶   },
38 │ ): void {
39 ▶   const REQUIRED_MEMO = metadata(path, createMetadataKey<boolean>(), (ctx) =>
```

`required` の本体（39 行目から）は [signal-forms](../signals/17-signal-forms.md) の 6 節で引用しました。`REQUIRED_MEMO` に「必須か」を入れ、検証の関数は「必須で、しかも `isEmpty`」のときだけエラーを返します。ほかの検証は逆に「`isEmpty` なら黙る」ので、**空の値は `required` だけが見て、形や長さの検証は値が入ってから働く**という分担になります。`email` だけを付けた欄は空のまま送れます。

35〜37 行目は、`config` の型に `{ when?: ... }` を重ねています。1 節の `BaseValidatorConfig` は 22・32 行目にもう `when` を持つので、今は同じ型の重ね書きです。df54e6a7b2e より前、`when` が `required` にしか無かったころの名残です。25 行目の doc コメントの `when` の説明も `required` にだけあり、`email` などの doc コメントは `config` の項目として `error` しか説明していません。

## 6. normalizeErrors：1 つか配列か

📄 `angular/packages/forms/signals/src/api/rules/validation/util.ts` L66–78 （▶ の行: 70–72, 74–75, 77）

```ts
66 │ /**
67 │  * Normalizes validation errors (which can be a single error, an array of errors, or undefined)
68 │  * into a list of errors.
69 │  */
70 ▶ export function normalizeErrors<T>(error: OneOrMany<T> | undefined): readonly T[] {
71 ▶   if (error === undefined) {
72 ▶     return [];
73 │   }
74 ▶   if (Array.isArray(error)) {
75 ▶     return error as readonly T[];
76 │   }
77 ▶   return [error as T];
78 │ }
```

`error` も検証の関数も「1 つ・配列・`undefined`」のどれでも返せるので（`OneOrMany`）、配列にそろえる関数が要ります。71〜73 行目で `undefined` は空の配列、74〜76 行目で配列はそのまま、77 行目で 1 つなら包みます。ただし `util.ts` のこの関数を import しているのは `src/util/parser.ts`（parse エラー、[sfd-validity](../sfd/03-sfd-validity.md)）だけです。検証の結果を混ぜる側は、同じ形の関数を自分のファイルに持っています。

📄 `angular/packages/forms/signals/src/field/validation.ts` L375–387 （▶ の行: 376–377, 381, 385）

```ts
375 │ /** Normalizes a validation result to a list of validation errors. */
376 ▶ function normalizeErrors<T extends ValidationResult>(error: T | readonly T[]): readonly T[] {
377 ▶   if (error === undefined) {
378 │     return [];
379 │   }
380 │ 
381 ▶   if (isArray(error)) {
382 │     return error as readonly T[];
383 │   }
384 │ 
385 ▶   return [error as T];
386 │ }
387 │ 
```

`field/validation.ts` の 376 行目の関数は export されておらず、`submit` のサーバーエラー（`submissionErrors()`）を配列にするのに使われます。組み込みの検証の戻り値は、さらに手前の `reduce`（[forms-sf-validation](../forms/17-forms-sf-validation.md) の 2 節）で展開されます。

## 7. DEMO：同じ部品でできた 3 つの検証

> **🧪 DEMO — errors() の kind・message と metadata の読み口**
>
> 本物の `@angular/forms/signals`（22.2.6）です。`form(signal({ mail: '', code: '', agree: false }), p => ...)` に、mail には `required({ message })` と `email({ message, when })`、code には `pattern(/^[A-Z]{3}-\d{2}$/, { when })` と `required({ when })`、agree には `required` を付けています。`when` は上のチェックボックスの signal を読みます。下の表は g フラグの記録を、この場で `form()` を作って取り直します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sfv-common)

押した結果のうち、コードの行で説明できるものです。

| 操作 | 結果 | 理由（行） |
| --- | --- | --- |
| 最初の状態 | mail は `required「必須です」`だけ、code はエラー無し、agree は `required` | mail の `''` は email の 69〜71 行目で黙る。agree の `false` は 63 行目で空 |
| mail に `a@b.` | `email「メールアドレスの形ではありません」` | 72・76 行目。`message` は `getOption`（53 行目）を通って入る |
| その状態で「email の when」を外す | エラー無し | 66〜68 行目。`when` の signal が検証の依存になっている |
| code に `abc-12`、「pattern の when」を外す | エラーが消え、`pattern()` が `[]` | pattern の 37〜39 行目で memo が `undefined`、48 行目で黙り、`list` の reducer が捨てる |
| code を `''` にして「code の required の when」を入れる | `required`、`required()` が `true` | 5 節。pattern は 44 行目で黙る |
| 「a → ... → abcde を順に入れる」 | `/g` の列だけ `ab` と `abcd` で `pattern`。もう 1 回押すと `a`・`abc`・`abcde` の方が `pattern` | 4 節の注意。`lastIndex` が前の一致の長さで残る（1 回目の最後の 5 から始まる） |

## ここまでの呼び出し

- 👤 `email(p.mail, { message, when })`（schema の関数の中）
  - `validate(path, fn)` — email.ts 65 — *builder に同期エラーのルールを 1 つ積むだけ*
- 👤 `f.mail().errors()` を読む
  - `syncErrors` の `computed` — field/validation.ts — *signal-forms の 6 節*
    - email の検証の関数 — email.ts 65–81
      - `config.when(ctx)` — email.ts 66 — *偽なら undefined*
      - `isEmpty(ctx.value())` — util.ts 59–64 — *空なら undefined*
      - `EMAIL_REGEXP.test(value)` — email.ts 72
      - `emailError({ message: getOption(config.message, ctx) })` — email.ts 76 → util.ts 53
    - `addDefaultField(...)` で `fieldTree` を付け、配列に展開 — validate.ts 41 — *forms-sf-validation の 2・3 節*

## テストと直し方

この章の約束を固めているのは `test/node/api/validators/` の 3 つの spec です。`email.spec.ts` の `describe('email validator')`（14 行目）、`it('supports custom errors')` 32 行目・`'supports custom error message'` 54 行目・`'should treat empty value as valid'` 76 行目、`pattern.spec.ts` の `describe('pattern validator')`（13 行目）と `describe('custom properties')`（70 行目）の 6 つの it・`describe('dynamic values')`（162 行目）、`required.spec.ts` の `describe('required validator')`（14 行目）と `it('supports custom condition')`（72 行目）です。

📄 `angular/packages/forms/signals/test/node/api/validators/email.spec.ts` L14–30 （▶ の行: 15, 20, 27–29）

```ts
14 │ describe('email validator', () => {
15 ▶   it('returns requiredTrue error when the value is false', () => {
16 │     const cat = signal({name: 'pirojok-the-cat', email: 'cat@cat.meow'});
17 │     const f = form(
18 │       cat,
19 │       (p) => {
20 ▶         email(p.email);
21 │       },
22 │       {
23 │         injector: TestBed.inject(Injector),
24 │       },
25 │     );
26 │ 
27 ▶     expect(f.email().errors()).toEqual([]);
28 ▶     f.email().value.set('not-real-email');
29 ▶     expect(f.email().errors()).toEqual([emailError({fieldTree: f.email})]);
30 │   });
```

28〜29 行目で値を `'not-real-email'` にすると `emailError` が 1 つ出ることを確かめます。15 行目の it の名前は「false のときに requiredTrue のエラー」で、中身（email の検査）と合っていません（origin/main の 943ec3bd8d6 でも同じ名前）。

📄 `angular/packages/forms/signals/test/node/api/validators/email.spec.ts` L76–90 （▶ の行: 77, 81, 88）

```ts
76 │   it('should treat empty value as valid', () => {
77 ▶     const model = signal('');
78 │     const f = form(
79 │       model,
80 │       (p) => {
81 ▶         email(p);
82 │       },
83 │       {
84 │         injector: TestBed.inject(Injector),
85 │       },
86 │     );
87 │ 
88 ▶     expect(f().errors()).toEqual([]);
89 │   });
90 │ });
```

77 行目の根が `''` で、88 行目でエラー無し。3 節の 69〜71 行目を固めています。

📄 `angular/packages/forms/signals/test/node/api/validators/pattern.spec.ts` L114–128 （▶ の行: 119–120, 126–127）

```ts
114 │     it('validates multiple patterns independently - partial match produces errors', () => {
115 │       const model = signal('abc');
116 │       const f = form(
117 │         model,
118 │         (p) => {
119 ▶           pattern(p, /abc/); // matches
120 ▶           pattern(p, /\d+/); // does not match
121 │         },
122 │         {injector: TestBed.inject(Injector)},
123 │       );
124 │ 
125 │       // Only one pattern matches, so we get an error from the non-matching one
126 ▶       expect(f().pattern()).toEqual([/abc/, /\d+/]);
127 ▶       expect(f().errors()).toEqual([patternError(/\d+/, {fieldTree: f})]);
128 │     });
```

126 行目で `pattern()` が 2 つの配列（4 節の `list`）、127 行目で合わない方だけのエラーです。

📄 `angular/packages/forms/signals/test/node/api/validators/required.spec.ts` L72–91 （▶ の行: 78–79, 88–90）

```ts
72 │   it('supports custom condition', () => {
73 │     const cat = signal({name: '', age: 5});
74 │     const f = form(
75 │       cat,
76 │       (p) => {
77 │         required(p.name, {
78 ▶           when({valueOf}) {
79 ▶             return valueOf(p.age) > 10;
80 │           },
81 │         });
82 │       },
83 │       {
84 │         injector: TestBed.inject(Injector),
85 │       },
86 │     );
87 │ 
88 ▶     expect(f.name().errors()).toEqual([]);
89 ▶     f.age().value.set(15);
90 ▶     expect(f.name().errors()).toEqual([requiredError({fieldTree: f.name})]);
91 │   });
```

`when` を確かめる it は、validators の spec の中ではこの `required` の 1 つだけです。`email`・`pattern` の `when`（3 節の 66 行目、4 節の 37 行目）を直接確かめる it は、この 3 つのファイルにありません。467b37b4b42 の `describe('emptiness')` は 8576f161ae4 の後に入ったので、手元の spec にはまだありません。

📄 `走らせ方（Node の jasmine。--filter が効く）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=^(email|pattern|required) validator "
```

📄 `結果`

```
# 2026-11-19、手元の macOS で（8576f161ae4）
Ran 20 of 539 specs
20 specs, 0 failures
//packages/forms/signals/test/node:test                                  PASSED in 2.4s
# 内訳: email validator 4・pattern validator 11・required validator 5
```

### 直すとしたら

- 4 節の `g` フラグは `pattern.ts` の検証の関数（43〜59 行目）の中で、51 行目の `test` の前に `pattern.lastIndex = 0` を置くか、doc コメント（15〜30 行目）に Reactive Forms と同じ注意を足す形です。spec は `pattern.spec.ts` の `describe('dynamic values')`（162 行目）の隣に、`/^[a-z]+$/g` を付けたフィールドに `'a'`・`'ab'` を順に set して、両方ともエラー無しを確かめる it を足します（記録の 3 つ目の表がそのまま期待値になります）。
- `email`・`pattern` の `when` は、`required.spec.ts` の 72 行目と同じ形（他のフィールドの値で条件を切り替え、前後の `errors()` を比べる）の it を `email.spec.ts`・`pattern.spec.ts` に足せます。`pattern` では `when` が偽のとき `pattern()` も `[]` になることまで確かめられます。

## 聞かれそうな質問

**Q. email を付けたのに、空のまま送信できてしまいます。**

email.ts の 69〜71 行目で、空（`isEmpty`）の値は検証しないからです。空を拒むのは `required` の役目で、required.ts の検証の関数だけが「必須で空」のときにエラーを返します（5 節）。両方を付けます。

**Q. message と error を両方書けますか？**

書けません。util.ts の 20 行目と 30 行目で、片方を持つ形ではもう片方が `never` なので型エラーになります（1 節の記録）。`when` は 22・32 行目のとおりどちらの形にも書けます。

**Q. boolean のフィールドに required を付けると、false でエラーになるのはなぜですか？**

util.ts の 63 行目で `false` が空だからです。`<input type="checkbox" required>` に合わせた意図的な決まりで（#68509 で確認、467b37b4b42 で doc に明記）、「同意する」のチェックボックスを必須にするのに使います。

**Q. when はいつ評価されますか？**

`email` は検証の関数の中（email.ts 66 行目）、`pattern`・`required` などは memo の metadata の関数の中（pattern.ts 37 行目）です。どちらも `computed` の中なので、`when` が読んだ signal が変われば結果が変わります。後者は `pattern()`・`required()` の値も一緒に変わります。

**Q. pattern に /.../g を渡しても大丈夫ですか？**

結果が値だけで決まらなくなります。pattern.ts の 51 行目が同じ `RegExp` の `test` を呼び続け、`lastIndex` が前の一致の位置で残るためで、記録では `ab` と `abcd` が `pattern` のエラーになりました。`g` の無い `RegExp` を渡します。

## 読み終えて

- 設定は「`message` か `error` のどちらか + `when`」の和の型。値か関数かは `getOption` が使う直前に見分ける
- `isEmpty` は `null`・`undefined`・`''`・`false`・`NaN` を空とする。`0`・`' '`・`[]` は空でない
- 空を見るのは `required` だけで、ほかの検証は空なら黙る。だから両方を付けて使う
- `email` は `validate` だけ、`pattern` は memo の metadata + `PATTERN` + `validate`。`when` の置き場所が違う
- `pattern` に `g` フラグの `RegExp` を渡すと `lastIndex` のせいで結果が交互に変わる（doc に注意が無い）

---

← 前: [index.html の前と後：script と link、重要な CSS とフォントの埋め込み、プリレンダーとの違い](../bmap/03-bmap-index-html.md)  
次: [数と長さの上限下限：max・minLength・maxLength と metadata の集約](02-sfv-limits.md) →
