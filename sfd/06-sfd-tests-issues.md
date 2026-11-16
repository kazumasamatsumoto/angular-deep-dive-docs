[目次](../README.md) › [Signal Forms の \[formField\]：フィールドと DOM の境目](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：\[formField\] を固めているテスト

> packages/forms/signals/test の web（350 本）と node（539 本）の spec のうち、directive/ の約束を固めているものの地図、BUILD.bazel の target と act の読み方、手元での走らせ方と結果（Chromium・Firefox・node）、\[formField\] に関係する開いている 25 件と閉じた 38 件の issue の章ごとの表と、閉じ方の傾向。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sfd-tests-issues)

---

シリーズの最後に、第 1〜5 回で読んだ `[formField]` の約束を固めている spec が、どのファイルのどの describe にあり、どの Bazel の target で走るかを地図にします。手元で全部走らせた数を書き、spec の読み方の小さな道具（`act`）を 1 つ読み、`[formField]` に関係する issue を章ごとに振り分けて、閉じた issue の傾向を数で見ます。

読む対象は `packages/forms/signals/test/web/BUILD.bazel`・`packages/private/testing/src/utils.ts` と、`test/web`・`test/node` の spec のファイルです。BUILD.bazel の読み方の一般論は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる方法とブラウザの suite の準備（`browser_zoneless_tests.init.mts`）は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. FormField の全体](01-sfd-form-field.md)
2. [2. ネイティブの要素](02-sfd-native.md)
3. [3. parse エラーと validity](03-sfd-validity.md)
4. [4. カスタムコントロール](04-sfd-custom-control.md)
5. [5. ControlValueAccessor との互換](05-sfd-cva.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

パスは `packages/forms/signals/test/` から、行番号は 8576f161ae4 で `grep -n` したものです。「it」は走る it の数で、`(!isFirefox() ? it : xit)(…)` の形の 4 本も数えています。`[formField]` は DOM が要るので、シリーズの約束はほとんど `web` の側にあります。`node` の側は、フォームの中身（スキーマ・検証・metadata・送信）で、forms シリーズの Signal Forms の章が読んだものです。

| ファイル | describe（行） | it | target | 章 |
| --- | --- | --- | --- | --- |
| `web/form_field.spec.ts` | field directive（94）› field input（95）・host directive mapping（142）・properties（184）・input transforms（3981）・field bindings（4881）・should work with different input types（5281）・array tracking（5851）・debounce（5988）・config（6125）・reset（6321）。2411・2858・5551・5592 行目の 4 本は Firefox では xit | 212 | `web:test` | [第 1 回](01-sfd-form-field.md)・[第 2 回](02-sfd-native.md)・[第 3 回](03-sfd-validity.md)・[第 4 回](04-sfd-custom-control.md) |
| `web/interop.spec.ts` | ControlValueAccessor（59）› properties（720）・reset（1354） | 42 | `web:test` | [第 5 回](05-sfd-cva.md) |
| `web/reactive_fvc.spec.ts` | FormControlDirective with FVC（38）・error bindings（363）・FormControlName with FVC（508） | 25 | `web:test` | [第 4 回](04-sfd-custom-control.md)・[第 3 回](03-sfd-validity.md) |
| `web/template_fvc.spec.ts` | NgModel with FVC（40）・NgModel parseErrors binding（356） | 14 | `web:test` | [第 4 回](04-sfd-custom-control.md)・[第 3 回](03-sfd-validity.md) |
| `web/number_input.spec.ts` | numeric inputs（15）› parsing logic（28）・nullability（103）、text input with numeric model（169） | 12 | `web:test` | [第 2 回](02-sfd-native.md)・[第 3 回](03-sfd-validity.md) |
| `web/focus.spec.ts` | FieldState focus behavior（16） | 11 | `web:test` | [第 1 回](01-sfd-form-field.md) |
| `web/input_validity_monitor.spec.ts` | InputValidityMonitor（13）› Document injected styles（22）・Shadow DOM injected styles（61）・isBadInput（108） | 6 | `web:test` | [第 3 回](03-sfd-validity.md) |
| `web/dynamic_binding.spec.ts` | createComponent（31）› FormValueControl（32）・FormCheckboxControl（102） | 6 | `web:test` | [第 4 回](04-sfd-custom-control.md) |
| `web/orphan_repro.spec.ts` | Signal Forms array removal orphan repro（13） | 3 | `web:test` | [第 4 回](04-sfd-custom-control.md) |
| `web/compat_form.spec.ts` | compatForm with \[formField\] directive（16） | 3 | `web:test` | シリーズの外（[forms-sf-submit-compat](../forms/19-forms-sf-submit-compat.md)） |
| `web/signal_form_control_web.spec.ts` | SignalFormControl (web)（17） | 3 | `web:test` | シリーズの外（[forms-sf-submit-compat](../forms/19-forms-sf-submit-compat.md)） |
| `web/webmcp.spec.ts` | Signal Forms WebMCP Integration（16） | 9 | `web:test` | シリーズの外（WebMCP、別のシリーズ） |
| `web/assertions.spec.ts・field_proxy.spec.ts` | assertions（13）・field proxy（14） | 3 | `web:test` | シリーズの外（[signal-forms](../signals/17-signal-forms.md)） |
| `web/debounce_async_validation_bug.spec.ts` | debounced inside validateAsync bug（14） | 1 | `web:test` | シリーズの外（[resx-debounced](../resx/02-resx-debounced.md)） |
| `node/parse_errors.spec.ts` | parse errors（22） | 13 | `node:test` | [第 3 回](03-sfd-validity.md) |
| `node/form_root.spec.ts` | FormRoot（35） | 5 | `node:test` | [第 1 回](01-sfd-form-field.md) |
| `node/field_node.spec.ts` | FieldNode（45） | 92 | `node:test` | シリーズの外（[signal-forms](../signals/17-signal-forms.md)） |
| `node/ の残り 12 ファイル` | form・field\_context・field\_proxy・logic\_node・path・recursive\_logic・resource・submit・validation\_status・deep\_signal・dynamic（types.spec.ts の 17 本は走らない関数の中） | 114 | `node:test` | シリーズの外（[forms-sf-schema](../forms/16-forms-sf-schema.md)） |
| `node/api/ の 6 ファイル` | debounce・hidden・metadata・readonly・structure・when | 57 | `node:test` | シリーズの外（[forms-sf-rules-metadata](../forms/18-forms-sf-rules-metadata.md)） |
| `node/api/validators/ の 11 ファイル` | email・max・maxDate・maxLength・min・minDate・minLength・pattern・required・standard schema・validation errors | 110 | `node:test` | シリーズの外（[forms-sf-validation](../forms/17-forms-sf-validation.md)） |
| `node/compat/ の 5 ファイル` | Forms compat・destroy$・extractValue・SignalFormControl・SignalFormControl in FormGroup | 148 | `node:test` | シリーズの外（[forms-sf-submit-compat](../forms/19-forms-sf-submit-compat.md)） |

足すと web が 350、node が 539 で、3 節で走らせた数（350 と 539）と一致します。node の `types.spec.ts` の 17 本は `typeVerificationOnlyDoNotRunMe()` という、どこからも呼ばれない関数（54 行目）の中にあり、型の検査のためだけに置かれているので、走る数に入りません。

## 2. target：web と node

📄 `angular/packages/forms/signals/test/web/BUILD.bazel` L1–31 （▶ の行: 1, 3, 6–9, 14–17, 22, 26–27）

```python
 1 ▶ load("//tools:defaults.bzl", "ng_project", "zoneless_web_test_suite")
 2 │ 
 3 ▶ ng_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob([
 7 ▶         "**/*.spec.ts",
 8 ▶         "**/*.ts",
 9 ▶     ]),
10 │     deps = [
11 │         "//packages/core",
12 │         "//packages/core/testing",
13 │         "//packages/forms",
14 ▶         "//packages/forms:node_modules/@mcp-b/webmcp-polyfill",
15 ▶         "//packages/forms:node_modules/@mcp-b/webmcp-types",
16 ▶         "//packages/forms:node_modules/@standard-schema/spec",
17 ▶         "//packages/forms:node_modules/zod",
18 │         "//packages/forms/signals",
19 │         "//packages/forms/signals/compat",
20 │         "//packages/platform-browser",
21 │         "//packages/platform-browser/testing",
22 ▶         "//packages/private/testing",
23 │     ],
24 │ )
25 │ 
26 ▶ zoneless_web_test_suite(
27 ▶     name = "test",
28 │     deps = [
29 │         ":test_lib",
30 │     ],
31 │ )
```

6〜9 行目の glob で、`web/` の下の `.spec.ts` も、spec の補助の `test_input_validity_monitor.ts` も、1 つの `ng_project` にまとめます。14〜15 行目の 2 つの依存は WebMCP の polyfill と型で、`webmcp.spec.ts` のためです（このシリーズでは扱わない）。16〜17 行目の standard-schema と `zod` は検証の spec のため、22 行目の `//packages/private/testing` は 4 節の `act` のためです。26 行目の `zoneless_web_test_suite` は `tools/bazel/web_test.bzl` の規則で、zoneless の TestBed を準備する bootstrap を前に足して 1 つの bundle にし、web-test-runner で走らせます（[Bazel の読み方](../contrib/04-contrib-bazel.md)）。27 行目の名前 `test` から `test_chromium` と `test_firefox` ができます。

`node/BUILD.bazel` の方は `zoneless_jasmine_test` で、Node の Jasmine で走ります（ファイルの中身は[forms シリーズの全体の章](../forms/01-forms-overview.md)）。Jasmine なので `--test_arg=--filter=…` で describe や it の名前で絞れますが、web の suite は 1 つの bundle を丸ごと走らせるので絞れません。

## 3. 手元で走らせた結果

8576f161ae4 の ../angular で、次のコマンドを走らせました（2026-11-16）。

📄 `走らせたコマンド`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/signals/test/web:test_chromium --nocache_test_results --test_output=all
pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all
# node の suite は Jasmine なので 1 つの describe に絞れる（web の suite は絞れない）
pnpm bazel test //packages/forms/signals/test/node:test --test_arg=--filter="parse errors"
```

| target | 結果 |
| --- | --- |
| `//packages/forms/signals/test/web:test_chromium` | 350 passed, 0 failed（1.6 秒） |
| `//packages/forms/signals/test/node:test` | 539 specs, 0 failures |
| `//packages/forms/signals/test/web:test_firefox` | 346 passed, 0 failed, 4 skipped |
| `node:test --test_arg=--filter="parse errors"` | Ran 13 of 539 specs / 13 specs, 0 failures |
| `web:test_chromium（作業木に第 4・5 回の確かめの spec を 1 つ足す）` | 356 passed, 0 failed |

- Firefox の 4 skipped は、form\_field.spec.ts の 2411・2858・5551・5592 行目の `(!isFirefox() ? it : xit)` です。month・week の入力欄の min・max の 2 本ずつで、35 行目の `isFirefox()` が `navigator.userAgent` を見ます。
- web のログには、開発モードの警告が 2 種類出ます。`NG01916`（hidden のフィールドを描画している）が 8 回、`NG01921`（text の入力欄が `null` を受けた）が 4 回で、どちらも spec がわざと作る状態です。どの番号の警告をどの行が出すかは[第 2 回](02-sfd-native.md)（NG01921）と `form_field.ts` の `registerAsBinding`（NG01916、[第 1 回](01-sfd-form-field.md)）。
- 3 行目の作業木の分は、第 4 回の #71679（`model` の subscribe）と、第 5 回の呼ぶ順・`name` の追従・`pattern` の空の配列・`InteropNgControl` の無いメンバーを確かめる spec を 1 つ足したものです。作業木は終わってから消しました。

## 4. spec の読み方：act と、1 本の it

📄 `angular/packages/private/testing/src/utils.ts` L320–341 （▶ の行: 335, 337, 339）

````ts
320 │ /**
321 │  * Executes a function and flushes the Angular scheduler synchronously.
322 │  *
323 │  * Use this when the action triggers synchronous state
324 │  * changes that need to be flushed through the scheduler before assertions run.
325 │  *
326 │  * @example
327 │  * ```ts
328 │  * const fixture = act(() => TestBed.createComponent(TestComp));
329 │  * expect(fixture.nativeElement.textContent).toBe('initial');
330 │  *
331 │  * act(() => fixture.componentInstance.value.set('updated'));
332 │  * expect(fixture.nativeElement.textContent).toBe('updated');
333 │  * ```
334 │  */
335 ▶ export function act<T>(fn: () => T): T {
336 │   try {
337 ▶     return fn();
338 │   } finally {
339 ▶     TestBed.tick();
340 │   }
341 │ }
````

Signal Forms の web の spec は、ほとんどの操作を `act(() => …)` で包みます。337 行目で関数を走らせ、339 行目の `finally` で `TestBed.tick()`、つまり変更検知を 1 回同期で回します。`[formField]` の書き込みは変更検知の中（`ɵɵcontrol`、[第 4 回](04-sfd-custom-control.md)の 2 節）で起きるので、`act` を抜けた時点で DOM とコントロールの input は書き終わっています。非同期の検証や debounce の Promise を待つときは、すぐ上の `actAsync`（`whenStable` を待つ）を使います。

📄 `angular/packages/forms/signals/test/web/form_field.spec.ts` L6322–6353 （▶ の行: 6322, 6331–6333, 6337, 6345, 6348, 6350, 6352）

```ts
6322 ▶     it('should call reset on bound custom control', () => {
6323 │       let resetCalled = false;
6324 │ 
6325 │       @Component({
6326 │         selector: 'custom-control',
6327 │         template: '',
6328 │       })
6329 │       class CustomControl implements FormValueControl<string> {
6330 │         readonly value = model.required<string>();
6331 ▶         reset() {
6332 ▶           resetCalled = true;
6333 ▶         }
6334 │       }
6335 │ 
6336 │       @Component({
6337 ▶         template: ` <custom-control [formField]="f.child" /> `,
6338 │         imports: [CustomControl, FormField],
6339 │       })
6340 │       class TestCmp {
6341 │         readonly data = signal({child: 'initial'});
6342 │         readonly f = form(this.data);
6343 │       }
6344 │ 
6345 ▶       const fixture = act(() => TestBed.createComponent(TestCmp));
6346 │       const comp = fixture.componentInstance;
6347 │ 
6348 ▶       expect(resetCalled).toBe(false);
6349 │ 
6350 ▶       act(() => comp.f().reset());
6351 │ 
6352 ▶       expect(resetCalled).toBe(true);
6353 │     });
```

849dba6c650 が足した 1 本です（[第 4 回](04-sfd-custom-control.md)の 5 節）。6331〜6333 行目でコントロールに `reset()` を書き、6337 行目で `[formField]="f.child"` につなぎます。6345 行目で作るのを `act` で包み、6348 行目でまだ呼ばれていない、6350 行目で `act(() => comp.f().reset())`、6352 行目で呼ばれた、を確かめます。根の `reset()` が子の `child` のコントロールまで届くので、`node.ts` の 351〜353 行目の子への再帰も、この 1 本で同時に固まっています。

## 5. 新しい本家との違い

angular-main（74961c66242）では、8576f161ae4 から先に `packages/forms/signals` を触ったコミットが 27 あります（`git log 8576f161ae4..HEAD -- packages/forms/signals`）。`[formField]` の約束に効くものは次のとおりです。

| コミット | 中身 | 章 |
| --- | --- | --- |
| `6d36d6c0977` | ネイティブの要素の `input`・`blur` を `listenToDom` から `addEventListener` に。blur のたびの変更検知の予約をやめ、core の `listenToDom` を消した | [第 2 回](02-sfd-native.md) |
| `e118e155271` | `bindingUpdated` の比較を `!==` から `Object.is` に。`NaN` の数のフィールドが更新のたびに書き直されていた | [第 1 回](01-sfd-form-field.md)・[第 4 回](04-sfd-custom-control.md)・[第 5 回](05-sfd-cva.md) |
| `c0dc8c4bbee` | orphan のフィールドでは classes の束縛を飛ばす（#70934） | [第 1 回](01-sfd-form-field.md) |
| `c58464d13ed` | `debounce('blur')` 中のコントロールが消されたら、待っている値を書く（blur を出さないブラウザのため） | [第 4 回](04-sfd-custom-control.md)の 4 節 |
| `6688a3d5502` | コンパイラが、テンプレートの listener より先にコントロールを作るようにした（利用者の callback の前にカスタムコントロールの値を同期する） | [第 4 回](04-sfd-custom-control.md) |
| `15bfc1a4bef` | 標準の forms の下の `FormValueControl` が値を書くとき、`setValue` の前に dirty にする | [第 4 回](04-sfd-custom-control.md) |
| `95b97657376`・`ecbc89b465c`・`fade609afde` | spec の直し（期待の書き足しと、テストの書き方の一斉の更新） | この章 |

angular-main より後（2026-11-13）に、PR #72018（`control_cva.ts` の属性への書き込みで、日付の `min`・`max` を `formatDateForMinMax` で文字列にする）がマージされています。第 4 回の `control_custom.ts` 52 行目がすでにしていたことを、第 5 回の 110〜117 行目にも足したものです。

## 6. issue の表

2026-11-16 に gh で取った、本文に `formField` を含む area: forms の issue です。開いている 25 件と、閉じた 38 件（取ったのは 39 件で、2020 年の Angular Material の FormField の 1 件は関係が無いので外した）。「章」は、その issue を読むときに開く章です。どの章にも当てはまらないもの（送信・compatForm・非同期の検証など、フォームの中身の話）は「シリーズの外」にしました。

| 章 | 開いている | 完了 | 予定なし | 重複 |
| --- | --- | --- | --- | --- |
| [第 1 回](01-sfd-form-field.md) | 4 | 8 | 2 | 0 |
| [第 2 回](02-sfd-native.md) | 5 | 4 | 3 | 2 |
| [第 3 回](03-sfd-validity.md) | 3 | 1 | 0 | 0 |
| [第 4 回](04-sfd-custom-control.md) | 4 | 3 | 3 | 1 |
| [第 5 回](05-sfd-cva.md) | 3 | 5 | 1 | 0 |
| シリーズの外 | 7 | 4 | 1 | 2 |

2 つの章にまたがる issue は両方に数えています。

| # | 状態 | 開いた日 | 閉じた日 | 中身 | 章 |
| --- | --- | --- | --- | --- | --- |
| #72058 | 開いている | 2026-11-15 | ― | \[formField\] はいつも両方向。model() や ngModel のように片方向も選べるようにしたい<br>Signal Forms: Support optional one-way binding with \[formField\] | [第 1 回](01-sfd-form-field.md) |
| #71160 | 開いている | 2026-10-03 | ― | \[formField\] を付けると \[disabled\] などの束縛が使えない。テンプレートで disabled を書きたい<br>Support \[disabled\] attribute on \[formField\] inputs | [第 1 回](01-sfd-form-field.md) |
| #67982 | 開いている | 2026-04-01 | ― | FormField を hostDirectives で合成したい<br>Support Directive Composition (\`hostDirectives\`) for \`FormField\` | [第 1 回](01-sfd-form-field.md) |
| #71632 | 開いている | 2026-10-26 | ― | 1 つの入力欄の parse エラーが、同じフィールドに付いた別の入力欄にも出る<br>Signal forms: a parse error on one control shows up on every other control bound to the same field | [第 3 回](03-sfd-validity.md) |
| #71443 | 開いている | 2026-10-20 | ― | value の無い option の文字が変わっても select が同期し直さない（PR #72041 は閉じた）<br>Signal forms: select is not resynced when the text of an option without a value changes | [第 2 回](02-sfd-native.md) |
| #69782 | 開いている | 2026-07-15 | ― | value を input に使う自作の radio。model の名前が value / checked に限られる<br>Support custom radio buttons with new signal forms API with a \`value\` input that is not the model | [第 4 回](04-sfd-custom-control.md) |
| #71633 | 開いている | 2026-10-26 | ― | compatForm のフィールドが parse エラーを無視し、submit が最後の正しい値を送る<br>Signal forms: compatForm() fields ignore parse errors, so submit() sends the last valid value | [第 3 回](03-sfd-validity.md) |
| #68736 | 開いている | 2026-05-14 | ― | 利用者の操作による変化に反応しやすくしたい<br>Signal forms: make it easier to react to user changes | [第 1 回](01-sfd-form-field.md) |
| #68246 | 開いている | 2026-04-16 | ― | CVA が中で \[pattern\] を使っていると、\[formField\] が \[\] を書いて PatternValidator が落ちる<br>Using \`\[formField\]\` with a ControlValueAccessor that internally sets \`\[pattern\]\` is broken | [第 5 回](05-sfd-cva.md) |
| #69678 | 開いている | 2026-07-08 | ― | InteropNgControl に statusChanges・valueChanges・getError などが無い（PR #67087 は開いている）<br>FormField interopNgControl is missing some commonly used methods to implement CVA in custom components | [第 5 回](05-sfd-cva.md) |
| #71634 | 開いている | 2026-10-26 | ― | compatForm の FormControl のエラーが errorSummary() に出ない<br>Signal forms: compatForm() FormControl errors are missing from errorSummary() | ― |
| #69632 | 開いている | 2026-07-03 | ― | date の入力欄が、開いた時点で dirty になる<br>\[formField\] date input initializes in dirty state on component load | [第 2 回](02-sfd-native.md) |
| #70600 | 開いている | 2026-09-07 | ― | 自作のコントロールの min・max・minLength・maxLength に、ネイティブと同じ型を強いないでほしい（PR #70970 が開いている）<br>Signal Forms should not enforce native \`min\` / \`max\` / \`minLength\` / \`maxLength\` types on custom controls | [第 4 回](04-sfd-custom-control.md)・[第 5 回](05-sfd-cva.md) |
| #70093 | 開いている | 2026-08-05 | ― | FormValueControl の型の検査が片方向だけで、合わない union を通す<br>Signal Forms \[formField\]: compiler only checks one direction, allowing unsound union FormValueControl bindings | [第 4 回](04-sfd-custom-control.md) |
| #67563 | 開いている | 2026-03-11 | ― | &lt;select multiple&gt; に対応してほしい<br>Signal forms: Support &lt;select multiple&gt; | [第 2 回](02-sfd-native.md) |
| #71622 | 開いている | 2026-10-26 | ― | フォームのコンポーネントを消してもフィールドが消えず、非同期の検証が走り続ける<br>Signal forms: destroying a form's component doesn't destroy its fields, so async validation keeps running | ― |
| #69635 | 開いている | 2026-07-03 | ― | number の入力欄で、打つたびに解析した値が書き戻されて文字が消える（PR #70391 が開いている）<br>forms: signals - number \`\[formField\]\` loses characters while typing (parsed value written back to the input on every keystroke) | [第 2 回](02-sfd-native.md) |
| #71636 | 開いている | 2026-10-26 | ― | 値を変えた直後、debounce 付きの非同期の検証が pending でなく古い結果を返す<br>Signal forms: right after a value change, a debounced async validator reports the old result instead of \`pending\` | ― |
| #68217 | 開いている | 2026-04-15 | ― | number のモデルを select につなぎたい<br>Signal Forms - number type model bind to select element | [第 2 回](02-sfd-native.md) |
| #70197 | 開いている | 2026-08-13 | ― | 自作のコンポーネントを書かずに値の変換（transformedValue）を使いたい<br>Allow implementing signal form value transformations without a custom component | [第 3 回](03-sfd-validity.md) |
| #66570 | 開いている | 2026-01-15 | ― | string \| null の型で、PrimeNG の部品と組むとコンパイルエラー<br>signal forms: string \| null type is giving compile error, type errors while using it with primeng components | [第 4 回](04-sfd-custom-control.md) |
| #71631 | 開いている | 2026-10-26 | ― | 自作の debouncer の abort の listener が遅れて computed の中で走る<br>Signal forms: a custom debouncer's abort listener runs late, inside a computation | ― |
| #68097 | 開いている | 2026-04-08 | ― | compatForm の AbstractControl を展開した value の signal がほしい<br>Reactive \`value\` signal for \`compatForm\` that unwraps \`AbstractControl\` values | ― |
| #67512 | 開いている | 2026-03-08 | ― | readonly のフィールドでも検証を走らせたい<br>signal forms: allow validator to run on readonly fields | ― |
| #67407 | 開いている | 2026-03-03 | ― | 大きい・入れ子・形が変わるフォームの文書を足してほしい<br>Signal Forms Documentation: Enhance Guidance for Large, Nested, and Variant-Based Signal Form Architectures | ― |
| #71679 | 予定なし | 2026-10-28 | 2026-10-28 | FormValueControl の value.subscribe がフォームからの変更で呼ばれない。仕様（output は set したときだけ）<br>\`subscribe\` is not called on \`value\` in \`FormValueControl\` | [第 4 回](04-sfd-custom-control.md) |
| #71621 | 完了 | 2026-10-26 | 2026-11-10 | form() だけで AbstractControl と Validators が bundle に入る。PR #71753 で直った<br>Signal forms: every app that uses \`form()\` ships \`AbstractControl\` and \`Validators\` from reactive forms | [第 5 回](05-sfd-cva.md) |
| #71623 | 完了 | 2026-10-26 | 2026-11-04 | required() などの組み込みのルールが、フィールドごとに注入器を作る<br>Signal forms: \`required()\`, \`min()\`, and other built-in rules create an injector for every field | ― |
| #70219 | 完了 | 2026-08-16 | 2026-08-19 | \[(value)\] の両方向の束縛が、\[formField\] との併用の禁止（NG8022）をすり抜ける<br>forms: 2way binding \[(value)\] bypasses \[formField\] binding restriction (NG8022) | [第 4 回](04-sfd-custom-control.md) |
| #70934 | 完了 | 2026-09-25 | 2026-10-02 | provideSignalFormsConfig の classes で、view を外した間に配列を差し替えると NG01904<br>Signal Forms: NG01904 from \`provideSignalFormsConfig({ classes })\` when an array is replaced while the form's view is detached (RouteReuseStrategy) | [第 1 回](01-sfd-form-field.md) |
| #71127 | 完了 | 2026-10-01 | 2026-11-09 | ngModel・\[formControl\] の下の FormValueControl に、transformedValue の parse エラーが 1 回遅れて届く。PR #71132<br>Signal Forms interop: \`transformedValue\` parse errors reach a \`FormValueControl\` one change detection late under \`ngModel\` and \`\[formControl\]\` | [第 3 回](03-sfd-validity.md) |
| #68182 | 完了 | 2026-04-13 | 2026-09-21 | ngModel と formField で (input) イベントの時機が違う<br>forms: \`(input)\` event timing discrepancy between \`ngModel\` and \`formField\` | [第 2 回](02-sfd-native.md) |
| #69927 | 予定なし | 2026-07-24 | 2026-07-24 | 動的な input のスキーマから form() を作れない<br>Signals Forms: Unable to create form() from dynamic input schema | ― |
| #70692 | 予定なし | 2026-09-11 | 2026-09-13 | FormValueControl の中の入れ子の form() が、親の reset() で orphan になる（NG01904）。track の書き方で回避<br>reset() on parent form orphans nested form() inside FormValueControl using transformedValue (NG01904) | [第 4 回](04-sfd-custom-control.md) |
| #69624 | 重複 | 2026-07-02 | 2026-10-30 | 自作のコントロールの min という input で TS2322（#70600 の重複）<br>Error \`TS2322\` with custom form control and input called \`min\` | [第 4 回](04-sfd-custom-control.md) |
| #69677 | 完了 | 2026-07-07 | 2026-08-31 | mat-radio-group の \[name\] を \[formField\] が上書きする。38861ac41bb<br>\[formField\] directive on mat-radio-group prevents dynamic \[name\] binding, causing native browser radio selection wipe during cdkDragDrop | [第 5 回](05-sfd-cva.md) |
| #71149 | 完了 | 2026-10-03 | 2026-11-11 | submit() が、debounce 中の子の値を同期する前に action を走らせる<br>Signal forms: submit() runs the action before debounced child values are synced | ― |
| #69744 | 重複 | 2026-07-11 | 2026-07-11 | ネイティブの select が FormField&lt;number&gt; を受けない（重複）<br>Signal Forms: Native &lt;select&gt; does not support FormField&lt;number&gt; | [第 2 回](02-sfd-native.md) |
| #69562 | 完了 | 2026-06-29 | 2026-06-30 | hostDirectives で足した value の model が見分けられない（#67982 に関係）<br>v22 formField error ignore hostDirective value modelSignal | [第 1 回](01-sfd-form-field.md)・[第 4 回](04-sfd-custom-control.md) |
| #69478 | 重複 | 2026-06-23 | 2026-06-23 | select に number も渡したい（重複）<br>\[Feature Request\] Let select \[formField\] receive not only string but also number | [第 2 回](02-sfd-native.md) |
| #69387 | 完了 | 2026-06-12 | 2026-07-09 | debounce と mat-autocomplete で打った文字が戻る（v21 からの退行）。PR #69436 = 2e0cb52dbf0<br>bug(autocomplete): signal forms with debounce | [第 5 回](05-sfd-cva.md) |
| #69422 | 予定なし | 2026-06-18 | 2026-06-18 | インデックスシグネチャのフィールドを \[formField\] に渡せない<br>Can't assign fields with an index signature to \[formField\] | [第 1 回](01-sfd-form-field.md) |
| #69690 | 完了 | 2026-07-08 | 2026-07-14 | minLength() と maxLength() が入力欄の validity を付けない<br>minLength() and maxLength() don't set input validity | [第 2 回](02-sfd-native.md) |
| #69960 | 重複 | 2026-07-27 | 2026-07-27 | ngModel にオブジェクトを渡したときの変更が画面に出ない（重複）<br>Changes to ngmodel as an object do not trigger ui changes | ― |
| #68712 | 予定なし | 2026-05-13 | 2026-05-13 | selectedcontent の select が FormField で固まる<br>html select with selectedcontent freezes when bound to a FormField | [第 2 回](02-sfd-native.md) |
| #69840 | 完了 | 2026-07-18 | 2026-07-21 | FormRoot の pending が、入れ子の非同期の検証から上がってこない<br>forms: Signal Forms root \`FormRoot\` \`pending\` status not propagated upward from nested async validators child | [第 1 回](01-sfd-form-field.md) |
| #69074 | 完了 | 2026-06-02 | 2026-06-04 | CVA と FormCheckboxControl を同じコンポーネントに書くと動かない。\[formControl\] に FVC を渡せると答えて閉じた<br>Colocating ControlValueAccessor and FormCheckboxControl does not seem to work | [第 5 回](05-sfd-cva.md) |
| #68480 | 完了 | 2026-04-30 | 2026-05-05 | range の入力欄の min・max で表示がずれる<br>Signal formField range input with min/max does not correctly render | [第 2 回](02-sfd-native.md) |
| #68252 | 予定なし | 2026-04-16 | 2026-04-17 | 複数のコントロールを持つ部品を 1 つにまとめる FormGroupControl がほしい<br>Add a \`FormGroupControl\` or similar to allow parts of a signal form with multiple controls to be abstracted | [第 4 回](04-sfd-custom-control.md) |
| #69620 | 完了 | 2026-07-02 | 2026-07-09 | validateStandardSchema と validateHttp を同じ木に付けると NG0992<br>Signal Forms: \`validateStandardSchema\` + \`validateHttp\` on the same field tree throws NG0992 | ― |
| #69206 | 予定なし | 2026-06-06 | 2026-06-23 | min・max を付けた range の値が正しく入らない<br>Range input with min/max bindings is not setting its value properly | [第 2 回](02-sfd-native.md) |
| #68474 | 予定なし | 2026-04-30 | 2026-04-30 | selectedcontent の自作の select が無限ループ<br>Custom selects with &lt;selectedcontent&gt; and FormField crash the app with no error in an infinite loop | [第 2 回](02-sfd-native.md) |
| #68078 | 予定なし | 2026-04-08 | 2026-04-08 | CVA と FormValueControl を両方実装し transformedValue を使うと NG0200。どちらか 1 つ、と答えて閉じた<br>NG0200: Circular dependency when component implements both ControlValueAccessor and FormValueControl with transformedValue | [第 5 回](05-sfd-cva.md) |
| #67212 | 完了 | 2026-02-23 | 2026-03-20 | 大きい配列で遅い<br>Signal forms: poor performances with large arrays | ― |
| #66903 | 完了 | 2026-02-04 | 2026-03-19 | 数の入力のいろいろな方法（文字列と数）を許したい<br>Signal Forms allow diferent numeric input methods | [第 2 回](02-sfd-native.md) |
| #66987 | 完了 | 2026-02-10 | 2026-04-03 | type が動的な入力欄に min の検証が付かない（394ad0c2a26）<br>Signal form: FormField does not apply min validator on native input if its type is dynamic | [第 1 回](01-sfd-form-field.md) |
| #66592 | 完了 | 2026-01-15 | 2026-02-18 | hostDirectives の FormValueControl に required や disabled が届かない（v21.0.8 の退行）。PR #67065<br>\[signal forms\] FormField directive does not work with host directives inputs | [第 1 回](01-sfd-form-field.md)・[第 4 回](04-sfd-custom-control.md) |
| #67367 | 完了 | 2026-02-28 | 2026-03-23 | submit() と FormRoot で NG01915<br>submit() + FormRoot throws NG01915 runtime error | [第 1 回](01-sfd-form-field.md) |
| #67971 | 完了 | 2026-04-01 | 2026-04-01 | stopPropagation() してもページが読み直される<br>Signal Forms: Submit always causes App to reload, even if stopPropagation() is called. | [第 1 回](01-sfd-form-field.md) |
| #66451 | 完了 | 2026-01-09 | 2026-02-11 | DOM の順で最初の不正なフィールドにフォーカスしたい<br>Support focusing first invalid field in DOM/template order | [第 1 回](01-sfd-form-field.md) |
| #66796 | 重複 | 2026-01-28 | 2026-01-30 | @for の track にフィールドの値を使うと実行時エラー（重複）<br>Signal Forms: Using \`@for(userForm of valueForm.users; track userForm.id().value())\` causes runtime error | ― |
| #67847 | 完了 | 2026-03-25 | 2026-04-07 | CVA の onChange のあとに writeValue が返ってきて無限ループ。2e9aeea0fed<br>Signal Forms / FormValueControl violates ControlValueAccessor contract by calling writeValue back after onChange, causing infinite loop | [第 5 回](05-sfd-cva.md) |
| #66791 | 予定なし | 2026-01-28 | 2026-02-06 | aria の属性を付けてほしい<br>Apply aria attributes on signal forms | [第 1 回](01-sfd-form-field.md) |

## 7. 閉じた issue の傾向

- **38 件のうち、完了 23・予定なし 10・重複 5。**完了の 23 件は、開いてから閉じるまでの中央値が 15 日です（いちばん長いのは #68182 の 161 日、`(input)` の時機の違い）。
- **予定なしの 10 件のうち 8 件は、2 日以内に閉じています。**答えは「仕様です」（#71679 の subscribe）・「どちらか 1 つにする」（#68078 の CVA と FormValueControl）・「track の書き方で避ける」（#70692）のように、コードではなく使い方で返したものです。
- **重複の 5 件のうち 2 件は select に number を渡したいもの**（#69744・#69478）で、開いている #68217 が残っています。[第 2 回](02-sfd-native.md)の select の読み書きです。
- **完了の多くは、第 1 回と第 5 回に集まっています。**第 1 回が 8（hostDirectives・FormRoot・submit・focus）、第 5 回が 5（#67847・#69387・#69677・#69074・#71621）。第 5 回の 3 つは、第 5 回の 3・4 節の修正（2e9aeea0fed・2e0cb52dbf0・38861ac41bb）にそのまま対応します。
- **2026-10-26 に、1 人の報告者が同じ日に 8 件を開いています**（#71621〜#71636）。そのうち 2 件（#71621 の bundle、#71623 の注入器）は 15 日と 9 日で完了し、6 件（#71632 の parse エラー、#71633・#71634 の compatForm など）は開いたままです。

## このシリーズで見つけたもの

第 1〜5 回を書いている途中で、CVA の `name` が配列の並べ替えに追いつかないことや、`[type]` を束縛した日付の input が監視されないことなどが見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現は、このサイトの依存の @angular/forms 22.1.6 で動かしたページの上のデモと、作業木に足した spec（web の suite）です。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| `@for` の各行の CVA に自動で付いた `name` が、配列の先頭を消しても書き直されない。続けて行を足すと 2 つの CVA が同じ名前になる（ネイティブの input は正しく付け直される） | forms の signals/src/directive/control\_cva.ts 102〜106 行目と 124〜126 行目（`isDefinedPredicate` は今の値が空のときだけ真）、core の render3/instructions/control.ts 182〜183 行目 | 第 5 回のデモの「name の追従」と、作業木の spec | [第 5 回](05-sfd-cva.md) |
| number\|null のモデルを text の input につなぐ形（41b1410cb8a で扱えるようになった）でも、欄を空にするたびに開発モードで NG01921 の警告が出る | signals/src/directive/native.ts 148〜159 行目（条件が「text の input で値が null」だけ） | number\_input.spec.ts 232・254 行目の it を走らせたログに NG01921 が出る | [第 2 回](02-sfd-native.md) |
| `[type]` を束縛した日付の input は、ブラウザの検証の変化を拾う InputValidityMonitor に登録されない | signals/src/directive/control\_native.ts 67〜68 行目（作るときに 1 回だけ type を見る。67 行目に TODO がある） | 第 3 回のデモ | [第 3 回](03-sfd-validity.md) |
| まだ document につながっていない時点で監視を始めた日付の input では、監視用の style が document の head ではなく input の中に入り、要素ごとに 1 つずつ増える | signals/src/directive/input\_validity\_monitor.ts 52〜55 行目と 91〜95 行目（つながっていない要素の `getRootNode()` は要素の木の根を返す） | 第 3 回のデモ（`@if` の中の date の input） | [第 3 回](03-sfd-validity.md) |
| 最初の更新の後で `[type]` が変わると、min / max を受けるかの判定が古いまま残り、DOM の value も書き直されない | signals/src/directive/form\_field.ts 425 行目（`_elementAcceptsMinMax ??=` で 1 回だけ判定） | 第 2 回のデモ（color から text に切り替える） | [第 2 回](02-sfd-native.md) |

ほかに、日付の input を置いただけで dirty になること（開いている #69632 と同じ現象）の原因の道筋を[第 3 回](03-sfd-validity.md)に、CVA に `pattern` として空の配列が書かれること（#68246）と InteropNgControl に無いメソッド（#69678）を[第 5 回](05-sfd-cva.md)に書きました。

## 聞かれそうな質問

**Q. \[formField\] の振る舞いを 1 本だけ試したいとき、どの target を走らせますか？**

`//packages/forms/signals/test/web:test_chromium` です。`[formField]` の spec は DOM が要るので web の側にしかありません。web の suite は絞り込めないので、1 本だけのつもりでも 350 本が走ります（2 秒ほどで終わります）。Firefox も試すなら `:test_firefox`、両方なら `:test` です。

**Q. act は何をしていて、なぜ要るのですか？**

関数を走らせたあと `TestBed.tick()` で変更検知を 1 回回します（`utils.ts` 337〜339 行目）。`[formField]` がコントロールに値や状態を書くのは変更検知の中なので、`act` で包まないと、モデルを変えた直後の DOM はまだ古いままです。

**Q. spec の数を数えるとき、何に気をつけますか？**

2 つあります。form\_field.spec.ts には `(!isFirefox() ? it : xit)(…)` の形が 4 本あり、行の頭の `it(` だけを grep すると 208 本と数え落とします（走るのは 212 本）。node の types.spec.ts の 17 本は、呼ばれない関数の中なので走りません（539 本に入らない）。

**Q. 閉じた issue のうち「予定なし」が多いのはなぜですか？**

10 件のうち 8 件は 2 日以内に閉じていて、ほとんどが「意図どおり」の説明で返したものです（7 節）。Signal Forms は約束（`FormValueControl` は controlled component、CVA と FVC はどちらか 1 つ、配列はフィールドで track）を先に決めていて、それに合わない使い方は使い方の方を直す、という答えになっています。

## 読み終えて

- `[formField]` の約束は `test/web` の 350 本（form\_field.spec.ts 212・interop.spec.ts 42 など）が固めていて、`web:test_chromium` 1 つで全部走ります。
- web の suite は 1 つの bundle なので絞れず、node の Jasmine は `--test_arg=--filter` で絞れます。
- spec は `act` で 1 回ずつ変更検知を回し、そのあとの DOM とコントロールの状態を見ます。
- `[formField]` に関係する issue は、開いている 25 件のうち 18 件がこのシリーズのどれかの章で読めます。閉じた 38 件のうち完了は 23 件、予定なしの多くは数日で使い方の説明として閉じています。

---

← 前: [ControlValueAccessor との互換：古いコントロールを \[formField\] で使う](05-sfd-cva.md)
