[目次](../README.md) › [Signal Forms の組み込みの検証：required から minDate まで、1 つの validate に下りるまで](README.md) › 第 5 回 / 全 5 回

# spec と issue を読む：組み込みの検証を固めているテスト

> packages/forms/signals/test/node/api/validators の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で 1 行ずつ変えて見つけた spec が固めていない行（parse エラーのクラス・\_\_brand）、組み込みの検証の issue と PR の表、origin/main の続き。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sfv-tests-issues)

---

シリーズの最後に、第 1〜4 回で読んだ組み込みの検証の約束を固めている spec が、どのファイルのどの describe にあり、どう走らせるかを地図にします。手元で走らせた数、spec を 4 本、作業木で 1 行ずつ変えて「spec が固めていない行」を探した結果、組み込みの検証の issue と PR の表、origin/main の続き、このシリーズで見つけたものをまとめます。

読む対象は `packages/forms/signals/test/node/api/validators/` の 11 のファイルと、`test/node/validation_status.spec.ts`・`compat/compat_validation_error.spec.ts`・`field_node.spec.ts`、`test/web/form_field.spec.ts` です（../angular、8576f161ae4）。`node/BUILD.bazel` と web の suite の作りは[sft-tests-issues](../sft/05-sft-tests-issues.md)と[sfd-tests-issues](../sfd/06-sfd-tests-issues.md)、1 本だけ走らせる方法は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. 共通の形と isEmpty](01-sfv-common.md)
2. [2. 数と長さの上限下限](02-sfv-limits.md)
3. [3. 日付の上限下限](03-sfv-dates.md)
4. [4. エラーの型](04-sfv-errors.md)
5. **5. spec と issue**（この章）

## 1. spec の地図

パスは `packages/forms/signals/test/` から、括弧の数は describe の行、ほかの数は it の行です。「it」は行の頭が `it(` の数で、`api/validators/` の 11 のファイルで 110 本あります。組み込みの検証のファイル 1 つに spec のファイルが 1 つ、という並びです。どのファイルも「既定のエラー → `error` → `message` → 空の値は通す」の順で it が並び、metadata を持つ検証には `custom properties`（metadata の値と 2 つのルールの集約）と `dynamic values`（値を関数で渡す）の describe が足されています。input の属性（`min`・`maxlength`・`required`）は DOM が要るので、web の `form_field.spec.ts` の `properties` の中にあります。

| ファイル | describe と主な it（行） | it | 走らせた数 | target | 章 |
| --- | --- | --- | --- | --- | --- |
| `node/api/validators/required.spec.ts` | required validator（14）› 15 空のとき・32 error・51 message・72 when・93 プレーンなエラー | 5 | 5 | `node:test` | [第 1 回](01-sfv-common.md) |
| `node/api/validators/email.spec.ts` | email validator（14）› 15・32 error・54 message・76 空は通す | 4 | 4 | `node:test` | [第 1 回](01-sfv-common.md)・[第 4 回](04-sfv-errors.md) |
| `node/api/validators/pattern.spec.ts` | pattern validator（13）› 14・27・40・55 空・custom properties（70）› 71〜149 PATTERN の配列・dynamic values（162） | 11 | 11 | `node:test` | [第 1 回](01-sfv-common.md) |
| `node/api/validators/min.spec.ts` | min validator（13）› custom errors（53）・145 NaN・158 空・custom properties（173）› 187 大きい方が残る・dynamic values（261） | 16 | 16 | `node:test` | [第 2 回](02-sfv-limits.md)・[第 4 回](04-sfv-errors.md) |
| `node/api/validators/max.spec.ts` | max validator（13）› custom errors（53）・119 NaN・132 空・custom properties（147）› 165 小さい方が残る・219 undefined を無視・dynamic values（250） | 15 | 15 | `node:test` | [第 2 回](02-sfv-limits.md) |
| `node/api/validators/min_length.spec.ts` | minLength validator（13）› 27 配列・112 Set・125 空・custom properties（140）・dynamic values（218） | 14 | 14 | `node:test` | [第 2 回](02-sfv-limits.md) |
| `node/api/validators/max_length.spec.ts` | maxLength validator（13）› 27 配列・112 Set・125 空・custom properties（140）› 161 小さい方が残る・dynamic values（218） | 14 | 14 | `node:test` | [第 2 回](02-sfv-limits.md) |
| `node/api/validators/min_date.spec.ts` | minDate validator（13）› 14・29 等しい・43・58 Invalid Date | 4 | 4 | `node:test` | [第 3 回](03-sfv-dates.md) |
| `node/api/validators/max_date.spec.ts` | maxDate validator（13）› 14・29 等しい・43・58 Invalid Date | 4 | 4 | `node:test` | [第 3 回](03-sfv-dates.md) |
| `node/api/validators/standard_schema.spec.ts` | standard schema integration（29）› 198 message を issue から | 15 | 15 | `node:test` | [第 4 回](04-sfv-errors.md) |
| `node/api/validators/validation_errors.spec.ts` | validation errors（18）› 19・35・59・84・type tests（116） | 8 | 8 | `node:test` | [第 4 回](04-sfv-errors.md) |
| `node/validation_status.spec.ts` | NgValidationError（665）› 666・675 | 2 | 2 | `node:test` | [第 4 回](04-sfv-errors.md) |
| `node/compat/compat_validation_error.spec.ts` | destroy$（18）・extracts validation errors（35）・signalErrorsToValidationErrors（70） | 10 | 10 | `node:test` | [第 4 回](04-sfv-errors.md) |
| `node/field_node.spec.ts` | FieldNode › errorSummary（1311） | 7 | ― | `node:test` | [第 4 回](04-sfv-errors.md) |
| `node/api/metadata.spec.ts` | metadata（13）（origin/main の 67e50693274 が注入器の it を足した） | 6 | ― | `node:test` | [第 2 回](02-sfv-limits.md) |
| `web/form_field.spec.ts` | properties（184）› required（2117）9・max（2369）16・min（2797）17・maxLength（3244）11・minLength（3530）10・pattern（3798）6 | 69 | ― | `web:test` | [第 1 回](01-sfv-common.md)・[第 2 回](02-sfv-limits.md)・[第 3 回](03-sfv-dates.md) |

第 1 回の `isEmpty` の分担（空の値は required 以外が黙る）は、email・pattern・min・max・minLength・maxLength の 6 つのファイルの「`should treat empty value as valid`」の it が 1 本ずつ固めています（日付の 2 つには無い）。第 2 回の metadata の集約（2 つ付けると厳しい方が残る）は `custom properties` の `merges two …`、第 3 回の Invalid Date は日付の 2 つのファイルの 58 行目、第 4 回のエラーの型は `validation_errors.spec.ts` と `compat_validation_error.spec.ts` です。

## 2. 手元で走らせた結果

8576f161ae4 の ../angular で、次のコマンドを走らせました（2026-11-19）。

📄 `走らせたコマンド`

```
$ cd ~/angular-research/angular        # 8576f161ae4
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=^min validator "      # ほかの 10 個も同じ形で、describe の名前を ^ と空白で挟む
# 作業木は git -C ~/angular-research/angular-fix worktree add <scratchpad>/sfv-wt-b 8576f161ae4 で作り、
# そこで ~/angular-research/angular/node_modules/.bin/bazel test … を直接走らせた（終わってから worktree remove --force で消した）
```

| //packages/forms/signals/test/node:test | 結果 |
| --- | --- |
| `node:test（絞り込みなし）` | PASSED（539 specs, 0 failures） |
| `--filter=^required validator ` | Ran 5 of 539 specs、0 failures |
| `--filter=^email validator ` | Ran 4 of 539 specs、0 failures |
| `--filter=^pattern validator ` | Ran 11 of 539 specs、0 failures |
| `--filter=^min validator ` | Ran 16 of 539 specs、0 failures |
| `--filter=^max validator ` | Ran 15 of 539 specs、0 failures |
| `--filter=^minLength validator ` | Ran 14 of 539 specs、0 failures |
| `--filter=^maxLength validator ` | Ran 14 of 539 specs、0 failures |
| `--filter=^minDate validator ` | Ran 4 of 539 specs、0 failures |
| `--filter=^maxDate validator ` | Ran 4 of 539 specs、0 failures |
| `--filter=^standard schema integration ` | Ran 15 of 539 specs、0 failures |
| `--filter=^validation errors ` | Ran 8 of 539 specs、0 failures |
| `--filter=validation errors（^ なし）` | Ran 14 of 539 specs（名前の途中に同じ語を含む compat などの 6 本も入る） |
| `--filter=NgValidationError` | Ran 2 of 539 specs、0 failures |

Jasmine の `--filter` は describe と it をつないだ名前を正規表現で探すので、`validation errors` とだけ書くと `extracts validation errors` などの 6 本も入って 14 本になります。`^` と後ろの空白で挟むと、そのファイルの describe だけ（8 本）に絞れます。ほかの 10 個も同じ形で走らせ、どれも 1 節の表の it の数と一致しました。

## 3. spec を 4 本読む

📄 `angular/packages/forms/signals/test/node/api/validators/min.spec.ts` L77–101 （▶ の行: 77, 83–85, 94, 98）

```ts
 77 ▶     it('supports returning custom plain error, and wraps it as custom', () => {
 78 │       const cat = signal({name: 'pirojok-the-cat', age: 3});
 79 │       const f = form(
 80 │         cat,
 81 │         (p) => {
 82 │           min(p.age, 5, {
 83 ▶             error: ({value}) => {
 84 ▶               return {
 85 ▶                 kind: 'special-min',
 86 │                 message: value().toString(),
 87 │               };
 88 │             },
 89 │           });
 90 │         },
 91 │         {injector: TestBed.inject(Injector)},
 92 │       );
 93 │ 
 94 ▶       expect(f.age().errors()).toEqual([
 95 │         {
 96 │           kind: 'special-min',
 97 │           message: '3',
 98 ▶           fieldTree: f.age,
 99 │         },
100 │       ]);
101 │     });
```

第 1 回の `error` の設定と、第 4 回の `fieldTree` の付け方を同時に見る 1 本です。83〜88 行目の関数が返すのはただのオブジェクトで、94〜100 行目はそれに 98 行目の `fieldTree: f.age` が足されただけのものを期待します。77 行目の名前の「`wraps it as custom`」は、`customError()` で包んでいた頃の名前です。46dbd185664（2026-01-06、`customError()` を消した）で本体は包まない形に直り、名前だけが残りました。`required.spec.ts` 93 行目の it も同じ名前です。

📄 `angular/packages/forms/signals/test/node/api/validators/validation_errors.spec.ts` L84–114 （▶ の行: 85–86, 88, 101, 108, 110）

```ts
 84 │   it('supports custom errors', () => {
 85 ▶     class PirojokError implements ValidationError {
 86 ▶       readonly kind = 'pirojok-the-error';
 87 │ 
 88 ▶       constructor(readonly flavor: string) {}
 89 │     }
 90 │ 
 91 │     function createPirojokError(flavor: string) {
 92 │       return new PirojokError(flavor);
 93 │     }
 94 │ 
 95 │     const cat = signal({password: 'pirojok-the-password'});
 96 │ 
 97 │     const f = form(
 98 │       cat,
 99 │       (p) => {
100 │         validate(p.password, () => {
101 ▶           return createPirojokError('cherry');
102 │         });
103 │       },
104 │       {injector: TestBed.inject(Injector)},
105 │     );
106 │ 
107 │     const error = f.password().errors()[0]!;
108 ▶     expect(error).toBeInstanceOf(PirojokError);
109 │     if (error instanceof PirojokError) {
110 ▶       expect(error.flavor).toBe('cherry');
111 │     } else {
112 │       fail('this should not happen');
113 │     }
114 │   });
```

自分のクラスのエラーを返す 1 本です。85 行目の `PirojokError` は `BaseNgValidationError` を継がず、`ValidationError` の interface を満たすだけです。108 行目で `errors()` から取り出したものが同じインスタンスであることを確かめます。`validate` の結果は `addDefaultField` がオブジェクトに `fieldTree` を書き込むだけなので、クラスは保たれます（第 4 回の 3 節）。parse エラーだけが展開でクラスを失う（第 4 回の 4 節）のと対になる spec です。

📄 `angular/packages/forms/signals/test/node/api/validators/standard_schema.spec.ts` L198–211 （▶ の行: 198, 203, 210）

```ts
198 ▶   it('should set the error message from the schema issue', () => {
199 │     const model = signal({age: -5});
200 │     const f = form(
201 │       model,
202 │       (p) => {
203 ▶         validateStandardSchema(p.age, z.number().min(0, {message: 'Age must be non-negative'}));
204 │       },
205 │       {
206 │         injector: TestBed.inject(Injector),
207 │       },
208 │     );
209 │ 
210 ▶     expect(f.age().errors()[0].message).toBe('Age must be non-negative');
211 │   });
```

#65247 を受けた b41a94bc851 の spec です。203 行目の zod の文言が、210 行目で `StandardSchemaValidationError` の `message` に出ることを見ます。`error.issue.message` まで降りなくても、ほかの組み込みのエラーと同じ `message` で読めます。

📄 `angular/packages/forms/signals/test/node/compat/compat_validation_error.spec.ts` L18–33 （▶ の行: 18, 21–22, 28, 30）

```ts
18 ▶ describe('destroy$', () => {
19 │   it('converts an error to a custom error', () => {
20 │     const control = new FormControl();
21 ▶     expect(reactiveErrorsToSignalErrors({min: true}, control)).toEqual([
22 ▶       new CompatValidationError({kind: 'min', context: true, control}),
23 │     ]);
24 │   });
25 │ 
26 │   it('converts multiple errors', () => {
27 │     const control = new FormControl();
28 ▶     expect(reactiveErrorsToSignalErrors({min: true, max: {max: 1, actual: 0}}, control)).toEqual([
29 │       new CompatValidationError({kind: 'min', context: true, control}),
30 ▶       new CompatValidationError({kind: 'max', context: {max: 1, actual: 0}, control}),
31 │     ]);
32 │   });
33 │ });
```

18 行目の describe の名前は `destroy$` ですが、中身は `reactiveErrorsToSignalErrors` の 2 本です（60447945bc5 で compat を足したときから）。21〜22 行目、Reactive の `{min: true}` が `kind: 'min'`・`context: true` の `CompatValidationError` になります。

## 4. spec が固めていない行

8576f161ae4 の作業木で、第 4 回で読んだ行を 1 か所ずつ変えて、node の 539 本（と 1 つは web の 350 本）を走らせました。落ちる spec が無い行は、直すときに一緒に spec を足す必要がある行です。

| # | 変えた所 | node:test | web:test\_chromium | 章 |
| --- | --- | --- | --- | --- |
| E1 | validation\_errors.ts 447 行目（基底の Object.assign(this, options)）を消す | 62 failures（message と fieldTree を渡す作り手を使う spec 全般） | ― | [第 4 回](04-sfv-errors.md) |
| E2 | field/validation.ts 411 行目の ??= を = に（1 件のエラーの付け先を必ず上書き） | 6 failures（type tests の 127 行目、submit・resource の付け先） | ― | [第 4 回](04-sfv-errors.md) |
| E3 | compat/validation\_errors.ts 44 行目で context を剥がさない | 2 failures（82・96 行目の it） | ― | [第 4 回](04-sfv-errors.md) |
| E4 | 同じ 44 行目を ??= に（同じ kind は先のものが残る） | 1 failure（113 行目の it） | ― | [第 4 回](04-sfv-errors.md) |
| E5 | standard\_schema.ts 178 行目で message を渡さない | 1 failure（standard\_schema.spec.ts 198 行目の it） | ― | [第 4 回](04-sfv-errors.md) |
| E6 | form\_field.ts 187〜188 行目の展開を、プロトタイプを保つ Object.assign(Object.create(…), err, …) に | 0 failures | 350 passed, 0 failed | [第 4 回](04-sfv-errors.md) |
| E7 | field/validation.ts 283 行目（errorSummary の並べ替え）を消す | 2 failures（field\_node と parse\_errors の DOM の順） | ― | [第 4 回](04-sfv-errors.md) |
| E8 | validation\_errors.ts 648 行目の NgValidationError を別のクラスに | 1 failure（validation\_status.spec.ts 666 行目の it） | ― | [第 4 回](04-sfv-errors.md) |
| E9 | validation\_errors.ts 434 行目（private \_\_brand）を消す | 0 failures（型の検査も通る） | ― | [第 4 回](04-sfv-errors.md) |

- **E6**：parse エラーのクラスを保つ形に変えても、node も web も全部通ります。今の「`instanceof NgValidationError` が偽」も、変えたあとの「真」も、どの spec も見ていません。`parse_errors.spec.ts` の 208 行目は `jasmine.objectContaining({kind: 'parse'})` で、プロトタイプを比べません。
- **E9**：`__brand` を消しても、実行時の spec も型の spec（`@ts-expect-error` の行）も通ります。「同じ形の自作オブジェクトをクラスと見なさない」印は、spec では確かめられていません。
- **E1・E2・E7** は広く落ちます。`Object.assign` は `message` と `fieldTree` を渡すほとんどの spec が、`??=` は `submit` と resource の付け先の spec が、並べ替えは DOM の順の 2 本が固めています。

## 5. issue と PR の表

2026-11-19 に gh で読んだ（読むだけ）、組み込みの検証とエラーの型に関係する area: forms の issue です。開いている 12 件と、閉じた 24 件。「章」は、その issue を読むときに開く章です。PR は本文やタイトルでその issue を指しているものです。

| 章 | 開いている | 完了 | 予定なし | 重複 |
| --- | --- | --- | --- | --- |
| [第 1 回](01-sfv-common.md) | 5 | 2 | 4 | 2 |
| [第 2 回](02-sfv-limits.md) | 2 | 6 | 2 | 2 |
| [第 3 回](03-sfv-dates.md) | 1 | 2 | 0 | 0 |
| [第 4 回](04-sfv-errors.md) | 4 | 4 | 1 | 0 |

2 つの章にまたがる issue は両方に数えています。

| # | 状態 | 開いた日 | 閉じた日 | 中身 | PR | 章 |
| --- | --- | --- | --- | --- | --- | --- |
| #63932 | 開いている | 2025-09-19 | ― | 報告の時点では when が required にしか無かった。今は BaseValidatorConfig の全部にある（一度閉じて開き直された）<br>Make all signal forms validator optional/conditional | #63993（閉じた） | [第 1 回](01-sfv-common.md) |
| #63858 | 開いている | 2025-09-17 | ― | 組み込みの検証の種類を増やす予定はあるか<br>Do we have any plans to extend the built-in validators in the new signal-based forms? | #70223（閉じた） | [第 1 回](01-sfv-common.md) |
| #69715 | 開いている | 2026-07-09 | ― | type="email" multiple の input でカンマと空白を打つとカーソルが先頭に飛ぶ（Chromium）<br>Odd behavior in multiple email input in signal form | ― | [第 1 回](01-sfv-common.md) |
| #67512 | 開いている | 2026-03-08 | ― | readonly のフィールドでも検証を走らせたい（shouldSkipValidation）<br>signal forms: allow validator to run on readonly fields | #69978（閉じた） | [第 1 回](01-sfv-common.md) |
| #65705 | 開いている | 2025-11-28 | ― | 総称型の値の path に required が書けない（型）<br>signal form: required() cannot handle SchemaPath with generic type \`value: T\` | ― | [第 1 回](01-sfv-common.md) |
| #70600 | 開いている | 2026-09-07 | ― | カスタムコントロールの min などの input の型を縛らないでほしい<br>Signal Forms should not enforce native \`min\` / \`max\` / \`minLength\` / \`maxLength\` types on custom controls | #70601（閉じた）・#70970（開いている） | [第 2 回](02-sfv-limits.md) |
| #69831 | 開いている | 2026-07-17 | ― | maxlength 属性を付けずに maxLength で検証したい<br>allow maxLength to validate without setting the native maxlength attribute | #70185（閉じた） | [第 2 回](02-sfv-limits.md) |
| #67643 | 開いている | 2026-03-12 | ― | Temporal の値で上限下限を書きたい<br>Signal Forms: Support of Temporal types for min/max validators | ― | [第 3 回](03-sfv-dates.md) |
| #66396 | 開いている | 2026-01-08 | ― | 既定の message をアプリ全体で設定したい（SignalFormsConfig は classes だけ）<br>Feature Request: Form Signal Default Validation Messages Configuration | ― | [第 4 回](04-sfv-errors.md) |
| #71634 | 開いている | 2026-10-26 | ― | compat のエラーが errorSummary に出ない。CompatValidationError に fieldTree が無い<br>Signal forms: compatForm() FormControl errors are missing from errorSummary() | #71630（再現の spec だけ、閉じた） | [第 4 回](04-sfv-errors.md) |
| #71632 | 開いている | 2026-10-26 | ― | 1 つのフィールドに複数の control をつなぐと、CVA と native の control にほかの control の parse エラーも届く<br>Signal forms: a parse error on one control shows up on every other control bound to the same field | #71629（再現の spec だけ、閉じた） | [第 4 回](04-sfv-errors.md) |
| #66385 | 開いている | 2026-01-07 | ― | invalid にしない「警告」のエラーがほしい<br>\[Signal forms\] Allow Non Blocking Validation Errors | ― | [第 4 回](04-sfv-errors.md) |
| #68509 | 完了 | 2026-05-01 | 2026-06-08 | required が false を空とみなす。仕様として docs に書いた（9cfd3f52e1b）<br>\[Signal Forms\] required validator function treats false as not present | #69240（マージ） | [第 1 回](01-sfv-common.md) |
| #63624 | 予定なし | 2025-09-06 | 2025-10-28 | 同じ話の古い報告<br>signal-forms: required validation considers false as invalid | ― | [第 1 回](01-sfv-common.md) |
| #66721 | 予定なし | 2026-01-23 | 2026-01-23 | 空の配列を required が空とみなさない<br>\[signal forms\] required validator not longer works for empty array | ― | [第 1 回](01-sfv-common.md) |
| #65424 | 予定なし | 2025-11-20 | 2025-11-21 | Validators.required との違い（空の配列）<br>inconsistency between "classic" and signal forms validators regarding empty arrays | ― | [第 1 回](01-sfv-common.md) |
| #66896 | 完了 | 2026-02-03 | 2026-02-10 | docs の「空の配列は空」を直した<br>Signal Form: Documentation states that an empty array is considered as empty value by the required validator | ― | [第 1 回](01-sfv-common.md) |
| #69047 | 重複 | 2026-06-01 | 2026-06-01 | when をどの検証にも（#63932 の重複）<br>Consistent 'when' availability on build-in Signal Forms validators | ― | [第 1 回](01-sfv-common.md) |
| #64437 | 重複 | 2025-10-15 | 2025-11-14 | min に when を（#63932 の重複）<br>Ability to add condition (when) form min validator (signal form) | ― | [第 1 回](01-sfv-common.md)・[第 2 回](02-sfv-limits.md) |
| #65230 | 予定なし | 2025-11-15 | 2025-12-03 | 検証を宣言的な設定で書きたい<br>Declarative validator configuration for signal forms | ― | [第 1 回](01-sfv-common.md) |
| #71623 | 完了 | 2026-10-26 | 2026-11-04 | 組み込みのルールがフィールドごとに注入器を作っていた。67e50693274<br>Signal forms: \`required()\`, \`min()\`, and other built-in rules create an injector for every field | #71737（マージ） | [第 2 回](02-sfv-limits.md) |
| #69690 | 完了 | 2026-07-08 | 2026-07-14 | minLength が input の validity を立てない<br>minLength() and maxLength() don't set input validity | ― | [第 2 回](02-sfv-limits.md) |
| #63789 | 完了 | 2025-09-13 | 2025-11-14 | number \| null などの値に min・max を書けるように<br>signal-forms: Relax typing for max and min validators to support impure number field values | ― | [第 2 回](02-sfv-limits.md) |
| #66188 | 完了 | 2025-12-19 | 2025-12-21 | \[field\] の要素に \[maxlength\] を書くとエラーになる<br>Signal form field should allow maxlength attribute to be set. | ― | [第 2 回](02-sfv-limits.md) |
| #65053 | 予定なし | 2025-11-10 | 2025-11-11 | FieldState の max() などを型から外してほしい<br>max, maxLength, min, minLength should not be present in the return type and value of form function | ― | [第 2 回](02-sfv-limits.md) |
| #68480 | 完了 | 2026-04-30 | 2026-05-05 | range の input の min・max と値の順番。3524de29f34<br>Signal formField range input with min/max does not correctly render | #68484（マージ） | [第 2 回](02-sfv-limits.md) |
| #66987 | 完了 | 2026-02-10 | 2026-04-03 | type を後から決める input に min 属性が付かない。394ad0c2a26<br>Signal form: FormField does not apply min validator on native input if its type is dynamic | ― | [第 2 回](02-sfv-limits.md) |
| #71377 | 予定なし | 2026-10-15 | 2026-10-29 | transform 付きの min・max の input<br>Signal Forms: FormUiControl doesn't allow for min/max inputs with transform | ― | [第 2 回](02-sfv-limits.md) |
| #69624 | 重複 | 2026-07-02 | 2026-10-30 | min という名前の input の型（#70600 の側）<br>Error \`TS2322\` with custom form control and input called \`min\` | ― | [第 2 回](02-sfv-limits.md) |
| #65676 | 完了 | 2025-11-26 | 2026-06-19 | 日付の min・max を number 以外でも（MIN\_DATE の鍵が入った）<br>FormValueControl min/max are limited to numbers, but date inputs allow these to be strings | ― | [第 3 回](03-sfv-dates.md) |
| #67300 | 完了 | 2026-02-25 | 2026-03-20 | date の input を消したときの値。df8b020299b<br>regression: signal forms: input of type date isn't required anymore when cleared | #67416（マージ） | [第 3 回](03-sfv-dates.md) |
| #65247 | 完了 | 2025-11-16 | 2025-11-17 | Standard Schema のエラーの message を issue から。b41a94bc851<br>Expose standard schema error message on top-level | #65248（マージ） | [第 4 回](04-sfv-errors.md) |
| #66687 | 完了 | 2026-01-21 | 2026-01-30 | validate は fieldTree を返せない（validateTree を使う）。docs を直した 63d828aa339<br>Signal forms custom validator with 'fieldTree' field in validation result error | #66772（マージ） | [第 4 回](04-sfv-errors.md) |
| #63905 | 完了 | 2025-09-18 | 2026-03-24 | FieldState.getError を足した。709f5a390ca<br>Consider adding \`hasError\` function for signal forms | #67811（マージ） | [第 4 回](04-sfv-errors.md) |
| #68905 | 完了 | 2026-05-24 | 2026-11-02 | compat の required が Validators.required を映さない。97bde8aa6cb<br>\[Signal Forms\] \`compatForm\` signal form \`required\` state does not reflect \`Validators.required\` | #68911（マージ） | [第 4 回](04-sfv-errors.md) |
| #66884 | 予定なし | 2026-02-03 | 2026-02-06 | Standard Schema から required の metadata を立てたい<br>Support for required in validateStandardSchema | ― | [第 4 回](04-sfv-errors.md) |

- **空の値の issue は、予定なしと docs の直しで閉じています。**`false` を空とみなす（#63624・#68509）、空の配列を空とみなさない（#66721・#65424・#66896）は、どれも「今の `isEmpty` のまま、docs に書く」で閉じました（第 1 回、467b37b4b42 も同じ流れ）。
- **上限下限は「input の属性」との組で開いています。**#70600（カスタムコントロールの input の型）・#69831（属性を付けずに検証）は、metadata が `[formField]` の属性になる行（第 2 回）の話です。
- **エラーの型の開いている issue は、compat と parse エラーです。**#71634 と #71632 は 2026-10-26 に同じ人が開き、どちらにも「再現の spec だけ」の閉じた PR が付いています。既定の文言（#66396）には PR がありません。

## 6. origin/main の続き

`git log 8576f161ae4..origin/main -- packages/forms/signals`（origin/main は 943ec3bd8d6、2026-11-17）の 38 本のうち、組み込みの検証とその周りのものです。サイトの依存の 22.2.6 に入っているかは `node_modules/@angular/forms/fesm2022/` の `.mjs` の実物で確かめました。

| コミット | 日付 | 中身 | 22.2.6 | 章 |
| --- | --- | --- | --- | --- |
| `467b37b4b42` | 2026-09-12 | required.ts の doc コメントに空の値を書き、required.spec.ts に emptiness（17）の 2 本を足す<br>docs(forms): document what required() considers empty | 実行時の違いなし（doc コメントと spec） | [第 1 回](01-sfv-common.md) |
| `45125306905` | 2026-09-19 | 9 つの検証の doc コメントの ValidationError.min(…) を minError() などに<br>docs(forms): name the default error factories in the signal validators | 実行時の違いなし（doc コメント） | [第 4 回](04-sfv-errors.md) |
| `2a662755113` | 2026-10-10 | min\_date.ts・max\_date.ts の doc コメントと validation.md に UTC の約束<br>docs(forms): document that minDate and maxDate expect UTC dates | 実行時の違いなし（doc コメント） | [第 3 回](03-sfv-dates.md) |
| `cf37344a4d6` | 2026-10-24 | markAsTouchedInternal が子孫でも flushSync する（#71149）<br>fix(forms): flush debounced descendant values when a field is touched | 入っている（markAsTouchedInternal の中の this.flushSync()） | [sft-structure](../sft/01-sft-structure.md)（debounce と touched） |
| `67e50693274` | 2026-10-30 | managed な metadata のときだけ注入器を作り、作った注入器だけを壊す（#71623）<br>perf(forms): avoid creating unused field injectors | 入っている（this.\_injector?.destroy()） | [第 2 回](02-sfv-limits.md) |
| `189afa9ce5d` | 2026-11-13 | CVA の経路の input の min・max に Date を文字にして書く<br>fix(forms): format Date min/max for controls with a ControlValueAccessor | 入っていない（22.2.x の枝の 818bf54607d にあるが、リリースのタグはまだ） | [第 3 回](03-sfv-dates.md) |

3 本の docs の直しは、どれも doc コメント（API の文書になる）と adev の `validation.md` で、配布物の JS は変わりません。`validation_errors.ts`・`compat/validation_errors.ts`・`field/validation.ts` と `api/validators/` の spec は、origin/main でも `required.spec.ts` に 467b37b4b42 の 52 行が足された以外は 8576f161ae4 と同じです。

## このシリーズで見つけたもの

このシリーズを書いている途中で見つけたものです。どれも **issue も PR も出していません**。ソースの行は 8576f161ae4 で、origin/main（943ec3bd8d6）とサイトの 22.2.6 の `.mjs` でも同じ形であることを確かめました。gh で探した範囲で、同じことを報告した issue があるものは「既存」に書きました。上の 3 つは第 1〜3 回で見つけたもので、詳しい行と記録はそれぞれの章にあります。

| 何が起きるか | ソースの行 | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| `pattern` に `g`（か `y`）フラグの `RegExp` を渡すと、`lastIndex` が前の一致の位置で残り、同じ種類の値でも結果が交互に変わる。doc コメントに注意が無い | `pattern.ts` 51 行目（渡された `RegExp` の `test` をそのまま呼ぶ） | 第 1 回の DEMO と記録 | gh の検索では見つからず | [第 1 回](01-sfv-common.md) |
| `max(NaN)` を `max(10)` より先に積むと、`max()` と input の `max` 属性が `NaN` のまま（検証は 10 で正しく落ちる）。積む順で結果が変わる | `api/rules/metadata.ts` 86〜88 行目の reducer（`item < acc` が `NaN` で常に偽） | 第 2 回の DEMO と記録。`max.spec.ts` 119 行目は検証の結果だけを見る | gh の検索では見つからず | [第 2 回](02-sfv-limits.md) |
| Invalid Date の下限を先に積むと、`min()` が Invalid Date のまま、`min` 属性が `"NaN-NaN-NaN"`（検証は正しい） | `api/rules/metadata.ts` 101 行目の reducer（`item > acc`）と `min_date.ts` 60 行目（検証だけが飛ばす） | 第 3 回の DEMO と記録 | gh の検索では見つからず | [第 3 回](03-sfv-dates.md) |
| `[formField]` を通った parse エラーは、`errors()` と `getError('parse')` で `instanceof NgValidationError`・`instanceof NativeInputParseError` が偽（ただのオブジェクト）。型は `NgValidationError` の和に入っている | `directive/form_field.ts` 187〜191 行目（`{...err, fieldTree, formField}`）。parse エラーを入れた ebae211add3 からこの形（a67e00741c2 で今の場所に移った） | 第 4 回の DEMO（qty に `3a`）、4 節の E6（変えても spec は全部通る） | gh の検索では見つからず | [第 4 回](04-sfv-errors.md) |
| `error` に schema の外の 1 つのオブジェクトを渡して 2 つのフィールド（か 2 つのフォーム）に使うと、2 つ目のエラーの `fieldTree` が 1 つ目のフィールドを指す。`errorSummary()` の並びもそこに寄る | `field/validation.ts` 408・411 行目（`??=` で返されたオブジェクトに書き込む）と `required.ts` などの `getOption(config.error, ctx)`（関数でなければ同じオブジェクト） | 第 4 回の DEMO（shareA・shareB）と Node の記録 | gh の検索では見つからず | [第 4 回](04-sfv-errors.md) |
| spec の名前が中身と合っていない：`min.spec.ts` 77 行目・`required.spec.ts` 93 行目の「`wraps it as custom`」（包まない）、`email.spec.ts` 15 行目の「`returns requiredTrue error when the value is false`」（email のエラーを見る）、`compat_validation_error.spec.ts` 18 行目の `describe('destroy$')`（中身は `reactiveErrorsToSignalErrors`） | それぞれ 46dbd185664・b8314bd3409・60447945bc5 から。origin/main も同じ | grep と `git log -S` | 無し | [第 1 回](01-sfv-common.md)・[第 4 回](04-sfv-errors.md) |
| `validation_errors.ts` の `WithFieldTree` などの doc コメントが「`field` property」と書いている（プロパティは `fieldTree`） | `validation_errors.ts` 22・32・44 行目。ae0c59028a2（`field` から `fieldTree` に改名）の残り。origin/main も同じ | grep | 無し | [第 4 回](04-sfv-errors.md) |

ほかに、既存の issue を今のコードで確かめたものがあります。第 4 回の `CompatValidationError` が `fieldTree` と `message` を書かないこと（#71634）、既定の文言を設定する口が無いこと（#66396）です。

## 聞かれそうな質問

**Q. min() の振る舞いを 1 つだけ試したいとき、どう走らせますか？**

`//packages/forms/signals/test/node:test` に `--test_arg=--filter=^min validator ` を付けます（2 節）。`^` と後ろの空白が無いと、名前の途中に同じ語を含む spec も拾います。ログの `Ran 16 of 539 specs` で絞れたことを確かめます。0 本でも PASSED になるので、数を見るのが大事です。

**Q. input の maxlength 属性の spec はどこですか？**

web の `form_field.spec.ts` の `properties`（184 行目）の中、`maxLength`（3244 行目）の 11 本です。属性は DOM が要るので node の validators の spec にはありません。web の suite は `--filter` が効かないので、350 本を全部走らせます。

**Q. parse エラーを instanceof で判定できるように直したら、どの spec が落ちますか？**

どれも落ちません（4 節の E6、node 539 本・web 350 本が全部通る）。直すなら、`parse_errors.spec.ts` に「`errors()` の parse エラーが `NgValidationError` のインスタンスである」を足すところからです。

**Q. 組み込みの検証の issue は、どの章に多いですか？**

第 1 回（空の値と when）と第 2 回（上限下限と input の属性）です。空の値の issue は docs の直しと予定なしで閉じ、開いているものは第 2 回の属性まわり（#70600・#69831）と第 4 回の compat・parse エラー（#71634・#71632）にあります（5 節）。

## 読み終えて

- 組み込みの検証の spec は検証 1 つにファイル 1 つで、node の `api/validators/` に 110 本。input の属性だけが web の `form_field.spec.ts` にある。
- Jasmine の `--filter` は正規表現なので、`^` と空白で describe を挟んで絞り、`Ran N of 539` を見る。
- parse エラーのクラスと `__brand` は、変えても spec が落ちない。`Object.assign`・`??=`・並べ替え・compat の変換は固まっている。
- 空の値の issue は docs で閉じ、開いているのは input の属性・compat・parse エラー・既定の文言。

---

← 前: [エラーの型：ValidationError を作る関数とクラス、fieldTree が付くまで](04-sfv-errors.md)  
次: [FieldTree と Field：呼べて、プロパティで下りられる木の型](../sfty/01-sfty-tree.md) →
