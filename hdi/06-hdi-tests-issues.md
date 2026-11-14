[目次](../README.md) › [hostDirectives と継承（features）](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：hostDirectives と継承を固めているテスト

> core/test/acceptance の host\_directives\_spec.ts と inherit\_definition\_feature\_spec.ts、compiler の binding\_spec.ts、compiler-cli の ngtsc の spec と compliance が、このシリーズの各章の約束をどこで固めているか。手元での走らせ方と結果。hostDirectives と継承に関係する開いている issue と閉じた issue の表と、数で見る傾向。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/hdi-tests-issues)

---

シリーズの最後に、hostDirectives と継承の振る舞いを固めている spec がどのファイルのどの describe にあり、第 1〜5 回の約束がどの it で確かめられているかを地図にします。手元で走らせた数を書き、hostDirectives と継承に関係する issue（ラベル `core: host directives` の 26 件、`core: component extension and customization` の 17 件、題と本文に hostDirectives を含む 54 件。2026-11-15 に取得）から 32 件を選んで、どの章に関係するかを振り分けます。

読む対象は `packages/core/test/acceptance/host_directives_spec.ts` と `inherit_definition_feature_spec.ts`、`packages/compiler-cli/test/ngtsc/host_directives_spec.ts`、`packages/compiler/test/render3/view/binding_spec.ts`、compliance の `r3_view_compiler_directives/host_directives/` と、それぞれの `BUILD.bazel` です。ターゲットの読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、spec の書き方は[spec の読み方](../contrib/06-contrib-reading-specs.md)にあります。

1. [1. features の並びと実行](01-hdi-features-pipeline.md)
2. [2. 継承の実行時](02-hdi-inherit-runtime.md)
3. [3. 継承のコンパイル](03-hdi-inherit-compile.md)
4. [4. host directive の重複の解消](04-hdi-host-dedupe.md)
5. [5. providers と入出力](05-hdi-host-providers-bindings.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

ファイルごとの一番外の describe、その中の describe ごとの it の数（describe の入れ子を字下げでたどり、`it(` の行を数えたもの。`xit`・`fit` はどのファイルにも無い）と、bazel で実際に走った数です。spec は「実行時の振る舞い」（core/test/acceptance）、「コンパイラの出力と診断」（compiler-cli/test/ngtsc）、「t2 の binder の照合」（compiler/test/render3）、「出力の .js を golden と比べる」（compliance）の 4 層に分かれています。

| ファイル（行数） | 一番外の describe（行） | describe（行）と it の数 | it の数 | 走った数 | ターゲット |
| --- | --- | --- | --- | --- | --- |
| `core/test/acceptance/host_directives_spec.ts`（4452） | `host directives`（38） | `（直下）`（38）… 7<br>`lifecycle hooks`（546）… 3<br>`host bindings`（801）… 2<br>`dependency injection`（886）… 10<br>`outputs`（1341）… 12<br>`inputs`（1803）… 18<br>`ngOnChanges`（2457）… 4<br>`debugging and testing utilities`（2744）… 4<br>`root component with host directives（中の 3 つを含む）`（2909）… 14<br>`de-duplication`（3501）… 11<br>`invalid usage validations`（3922）… 18<br> | 103 | 103（--filter=^host directives ） | `//packages/core/test/acceptance:acceptance` |
| `core/test/acceptance/inherit_definition_feature_spec.ts`（6028） | `inheritance`（30） | `（直下）`（30）… 3<br>`multiple children`（132）… 1<br>`ngOnChanges`（230）… 7<br>`of bare super class by a directive`（508）… 14<br>`of a directive by another directive`（1149）… 12<br>`of a directive by a bare class then by another directive`（1750）… 12<br>`of bare super class by a component`（2395）… 12<br>`of a directive inherited by a component`（2989）… 13<br>`of a directive inherited by a bare class and then by a component`（3661）… 13<br>`of a component inherited by a component`（4353）… 16<br>`of a component inherited by a bare class then by a component`（5234）… 14<br> | 117 | 117（--filter=^inheritance ） | `//packages/core/test/acceptance:acceptance` |
| `compiler-cli/test/ngtsc/host_directives_spec.ts`（1487） | `ngtsc host directives compilation`（19） | `（直下）`（19）… 10<br>`de-duplication`（522）… 6<br>`validations`（782）… 26<br> | 42 | 4 つの shard で 42 ずつ | `//packages/compiler-cli/test/ngtsc:ngtsc` |
| `compiler/test/render3/view/binding_spec.ts`（1701） | `t2 binding`（208） | `directive de-duplication（うち 2 つは foreign component）`（1394）… 10<br> | 10 | 10（--filter=directive de-duplication） | `//packages/compiler/test/render3:test` |
| `compiler-cli/test/compliance/test_cases/r3_view_compiler_directives/host_directives/TEST_CASES.json`（85） | `（JSON の cases）`（3） | description の 5 件 | 5 | 2 つの shard で 2 + 3 | `//packages/compiler-cli/test/compliance/full:full` |

host\_directives\_spec.ts の 11 の describe の it は 7 + 3 + 2 + 10 + 12 + 18 + 4 + 4 + 14 + 11 + 18 = 103 で、`--filter=^host directives `（末尾の空白まで含めて一番外の describe に絞る）の「Ran 103 of 2693 specs」と合います。末尾の空白を付けずに `--filter=host directives` とすると、ほかのファイルの「…host directives…」という名前の it も拾って 112 件になりました。inherit\_definition\_feature\_spec.ts は [第 2 回](02-hdi-inherit-runtime.md)、ngtsc の継承の spec（ngtsc\_spec.ts の `describe('inherited directives')`）は [第 3 回](03-hdi-inherit-compile.md)のテストの節で読んでいます。

### compliance の 5 件

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_directives/host_directives/TEST_CASES.json` L1–20 （▶ の行: 3, 5–6, 12–13, 18）

```json
 1 │ {
 2 │   "$schema": "../../test_case_schema.json",
 3 ▶   "cases": [
 4 │     {
 5 ▶       "description": "should create a basic hostDirectives definition",
 6 ▶       "inputFiles": ["basic_host_directives.ts"],
 7 │       "expectations": [
 8 │         {
 9 │           "failureMessage": "Incorrect definition",
10 │           "files": [
11 │             {
12 ▶               "expected": "basic_host_directives_definition.js",
13 ▶               "generated": "basic_host_directives.js"
14 │             }
15 │           ]
16 │         }
17 │       ],
18 ▶       "compilationModeFilter": ["full compile", "linked compile", "declaration-only emit"]
19 │     },
20 │     {
```

compliance のテストは、`TEST_CASES.json` の `cases`（3 行目）の 1 件ごとに、5 行目の `description` の it になります。6 行目の入力をコンパイルし、13 行目の生成物を 12 行目の golden（`*_definition.js`）と比べます。18 行目の `compilationModeFilter` で、全体のコンパイル・部分コンパイルのあとのリンク・宣言だけの emit の 3 つで同じ比較をします。`//packages/compiler-cli/test/compliance/full:full` は全体のコンパイルの分で、`shard_count = 2` なので 2 つの shard に 2 件と 3 件が分かれて走りました。standalone-host-directives が読んだ fixture（`host_directives_with_inputs_outputs` と `forward_ref_host_directives`）はこの 5 件のうちの 2 件です。

### binder の spec の BUILD

📄 `angular/packages/compiler/test/render3/BUILD.bazel` L1–22 （▶ の行: 3, 6–7, 17–18）

```python
 1 │ load("//tools:defaults.bzl", "ts_project", "zoneless_jasmine_test")
 2 │ 
 3 ▶ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob(
 7 ▶         ["**/*.ts"],
 8 │     ),
 9 │     deps = [
10 │         "//packages:types",
11 │         "//packages/compiler",
12 │         "//packages/compiler/test/expression_parser/utils",
13 │         "//packages/core",
14 │     ],
15 │ )
16 │ 
17 ▶ zoneless_jasmine_test(
18 ▶     name = "test",
19 │     data = [
20 │         ":test_lib",
21 │     ],
22 │ )
```

`packages/compiler/test/render3/` の下の ts は 6〜7 行目の glob で 1 つの `test_lib` にまとめられ、17〜18 行目の `zoneless_jasmine_test` の `:test`（Node）で走ります。binding\_spec.ts の重複の解消の it だけを走らせるには `--filter=directive de-duplication` ですが、同じ describe の最後に foreign component の it が 2 つ入っているので（d596d8bd0ac、2026-05-11）、走るのは 10 件です。

## 2. 各章の約束と、それを固めている it

| 章 | 約束 | it |
| --- | --- | --- |
| [第 1 回 features の並びと実行](01-hdi-features-pipeline.md) | hostDirectives は features の ɵɵHostDirectivesFeature として出力される | compliance の host\_directives の 5 件、ngtsc host\_directives\_spec.ts の直下の it（31〜410 行目の 8 つ） |
| [第 1 回 features の並びと実行](01-hdi-features-pipeline.md) | 継承すると祖先の hostDirectives が前に並ぶ（祖父母の分 → 親の分 → 自分の分の host directive が作られ、最後に Dir 本体。本体は super の連鎖で Grandparent → Parent → Dir と記録される） | host\_directives\_spec.ts 449 行目の it |
| [第 2 回 継承の実行時](02-hdi-inherit-runtime.md) | 親の inputs・outputs・host binding・フック・クエリを混ぜる | inherit\_definition\_feature\_spec.ts の 117 件（組み合わせごとの describe） |
| [第 2 回 継承の実行時](02-hdi-inherit-runtime.md) | 継承した host directive の入出力 | host\_directives\_spec.ts 1635・1760・2056・2418 行目の it |
| [第 3 回 継承のコンパイル](03-hdi-inherit-compile.md) | 飾りのない親と、継承した診断 | ngtsc\_spec.ts の describe('inherited directives')（9159 行目、11 件）、incremental\_typecheck\_spec.ts の describe('inheritance')（1424 行目、5 件） |
| [第 4 回 host directive の重複の解消](04-hdi-host-dedupe.md) | テンプレートが勝つ・host directive どうしは合わせる・衝突は NG0312 | host\_directives\_spec.ts describe('de-duplication')（3501 行目）の 11 件と 4345〜4426 行目の 4 件 |
| [第 4 回 host directive の重複の解消](04-hdi-host-dedupe.md) | コンパイラの重複の解消と NG8024 | binding\_spec.ts 1399〜1638 行目の 8 件、ngtsc host\_directives\_spec.ts の 522 行目の describe と 1343〜1451 行目の 4 件 |
| [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md) | host directive の providers があっても viewProviders が host: true で取れる | host\_directives\_spec.ts 1295 行目の it（886cf6c452a） |
| [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md) | 入力の別名・静的な属性・同じ別名に 2 つ | host\_directives\_spec.ts describe('inputs')（1803 行目）の 18 件 |
| [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md) | host binding とフックの順 | host\_directives\_spec.ts 802・856 行目、547・626・723 行目の it |

第 4・5 回を書く途中で、固めている it が無いと分かった振る舞いです。どれも作業木（8576f161ae4）に it を足して走らせるか、DEMO で確かめました。

- [第 4 回](04-hdi-host-dedupe.md)：露出の違う設定で同じ host directive を共有する 2 つのホストを、続けて作ったときの振る舞い（`mergeBindingMaps` の書き込みが def に残る）。
- [第 4 回](04-hdi-host-dedupe.md)：1 つの別名を host directive の 2 つの入力に当てたとき（コンパイラは通し、実行時は開発モードの assert）。
- [第 5 回](05-hdi-host-providers-bindings.md)：重複の解消で共有された host directive に、`inputBinding` / `outputBinding` で届けるとき（範囲の判定）。
- [第 5 回](05-hdi-host-providers-bindings.md)：TestBed で AOT のコンポーネントの `providers` を override したとき、注入できること。
- [第 5 回](05-hdi-host-providers-bindings.md)：host\_directives\_spec.ts 1142 行目の it は、名前が viewProviders で中身が providers。

## 3. 手元で走らせた結果

📄 `走らせたコマンド（2026-11-15、8576f161ae4）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all '--test_arg=--filter=^host directives '
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all '--test_arg=--filter=^inheritance '
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc --nocache_test_results --test_output=all '--test_arg=--filter=ngtsc host directives compilation'
pnpm bazel test //packages/compiler/test/render3:test --nocache_test_results --test_output=all '--test_arg=--filter=directive de-duplication'
pnpm bazel test //packages/compiler-cli/test/compliance/full:full --nocache_test_results --test_output=all '--test_arg=--filter=host_directives'
```

| ターゲットとフィルタ | 結果 | ログ（hd-logs/） |
| --- | --- | --- |
| `//packages/core/test/acceptance:acceptance` の `^host directives ` | Ran 103 of 2693 specs、0 failures（1.4 秒） | b-acceptance-hostdir.log |
| 同じターゲットの `^inheritance ` | Ran 117 of 2693 specs、0 failures（1.5 秒） | b-acceptance-inherit.log |
| `//packages/compiler-cli/test/ngtsc:ngtsc` の `ngtsc host directives compilation` | 4 つの shard のそれぞれで Ran 42 of 6628 specs、0 failures | b-ngtsc-hostdir.log |
| `//packages/compiler/test/render3:test` の `directive de-duplication` | Ran 10 of 499 specs、0 failures | b-binding-dedupe.log |
| `//packages/compiler-cli/test/compliance/full:full` の `host_directives` | Ran 2 of 614 と Ran 3 of 615、0 failures | b-compliance-hostdir.log |
| 作業木：acceptance 全体（第 4 回の修正 ＋ it 2 つ） | 2695 specs、1 failure（第 5 回の範囲の it）、3 pending | b-wt-after-fix1-all.log |
| 作業木：`//packages/core/test:test` 全体（TestBed の修正 ＋ it 1 つ） | 351 + 350 + 351 + 350 = 1402 specs、0 failures | b-wt-testbed-fix-all.log |

作業木で変えたことと、落ちた・通った it は、[第 4 回](04-hdi-host-dedupe.md)と[第 5 回](05-hdi-host-providers-bindings.md)のテストと直し方の節にあります。886cf6c452a の前の順に戻すと 1295 行目の it が落ちることも、作業木で確かめました（第 5 回）。

### 新しい本家との違い

- angular-main（74961c66242）の host\_directives\_spec.ts は 4187 行で、it は 103 のままです。ecbc89b465c と fade609afde（2026-10、「modernize unit tests」）で書き方が変わり、行が減りました。inherit\_definition\_feature\_spec.ts は 5339 行・it 118 で、増えた 1 件は 2adfdf0f73b（JIT の飾りのない親、[第 3 回](03-hdi-inherit-compile.md)）の分です。
- angular-main には Rust で書かれた preprocessor（`packages/compiler-cli/preprocessor`）が入り、ngtsc の spec を preprocessor でも走らせる `ngtsc_ngp` ターゲットがあります。host directive の検査は 06b2d2cee0b・71106039921・0fb8466b634・eb4c9e3a3d8・323495c2ec5（2026-10-21〜29）で移植され、既知の失敗の一覧（`ngp_known_failures.ts`）に host directive の it は残っていません。
- angular-main の 5fb2b68847d（2026-10-29）は、`class` / `style` という名前の出力でノードに styling の印が立つ行を直しました（[第 5 回](05-hdi-host-providers-bindings.md)の 2 節）。spec は styling\_spec.ts に足されています。
- host\_directives\_feature.ts と t2\_binder.ts の重複の解消の行は、angular-main でも 8576f161ae4 と同じです。

## 4. hostDirectives と継承の issue

| # | 状態 | 題（言い換え） | 章 | メモ |
| --- | --- | --- | --- | --- |
| #48925 | 開（2023-02-02） | 1 つの入力を host directive の 2 つの入力に当てたい | [第 4 回 host directive の重複の解消](04-hdi-host-dedupe.md)<br> | コンパイラは通すが、実行時は開発モードで patchDeclaredInputs の assert に当たる（第 4 回の囲み） |
| #49734 | 開（2023-04-06） | reflectComponentType に host directive の入出力を含めてほしい | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | #67892（2026-03）と #58853 は重複・NOT\_PLANNED で閉じられた。露出は TNode の hostDirectiveInputs にしか無い（第 5 回 2 節） |
| #50510 | 開（2023-05-30） | host binding から host directive の入力に値を入れたい | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br>[standalone-host-directives（大筋）](../standalone/10-standalone-host-directives.md)<br> | 必須の入力は露出しないと NG2019。同じ要望の #62784 は NOT\_PLANNED |
| #53193 | 開（2023-11-27） | custom element にすると host directive の入出力が付かない | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | #65245 が重複として閉じられた。PR #70334（fix(elements): support exposed host directive bindings）が開いている |
| #55218 | 開（2024-04-04） | 入れ子の hostDirectives の深い入力の露出が、明示しなくても効く | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | ラベル area: compiler |
| #60211 | 開（2025-03-05） | withComponentInputBinding が host directive の入力に値を入れない | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | router は reflectComponentType の inputs（componentDef.inputs）の名前にだけ setInput する。PR #70139（fix(router): bind route data to host directive inputs）は 2026-08 に閉じられた |
| #65750 | 開（2025-12-01） | 使う側で host directive に providers を与えたい | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | 今の providers は host directive 自身の def の ProvidersFeature だけ（第 5 回 1 節） |
| #67982 | 開（2026-04-01） | FormField を hostDirectives で組み立てたい | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | core の instructions/control.ts も hostDirectiveInputs を読む。#66592（2026-02 に完了）の続き |
| #71459 | 開（2026-10-20） | テンプレートに無いホストで HOST\_TAG\_NAME が #host になる | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | hostDirectives と directives オプションのディレクティブも対象。PR #71460 が開いている |
| #47900 | 開（2022-10-28） | テンプレートなしでコンポーネントを継承したい | [第 2 回 継承の実行時](02-hdi-inherit-runtime.md)<br> | ラベル core: component extension and customization |
| #24463 | 開（2018-06-13） | 継承したコンポーネントのスタイルを受け継ぎたい | [第 2 回 継承の実行時](02-hdi-inherit-runtime.md)<br> | ラベル core: component extension and customization |
| #57846 | 閉（2024-09-17 → 2026-04-03 COMPLETED） | hostDirectives の二重の照合を自動で解消してほしい | [第 4 回 host directive の重複の解消](04-hdi-host-dedupe.md)<br> | PR #67996（57432f1b6a8・9c55fcb3e65）。先に出た外部の PR #64132・#67760 は閉じられた |
| #48128 | 閉（2022-11-19 → 2022-12-09 NOT\_PLANNED） | ディレクティブの hostDirectives で NG0309 になりやすい | [第 4 回 host directive の重複の解消](04-hdi-host-dedupe.md)<br> | 2022 年は NOT\_PLANNED。2026 年の #57846 で重複の解消が入った |
| #56841 | 閉（2024-07-04 → 2025-05-22 NOT\_PLANNED） | hostDirectives を持つコンポーネントを継承すると 2 回当たる | [第 4 回 host directive の重複の解消](04-hdi-host-dedupe.md)<br>[第 2 回 継承の実行時](02-hdi-inherit-runtime.md)<br> | 今は host\_directives\_spec.ts の it「should de-duplicate inherited host directives」のとおり 1 つになる |
| #51203 | 閉（2023-07-30 → 2023-11-20 COMPLETED） | 継承すると host directive が注入できない | [第 2 回 継承の実行時](02-hdi-inherit-runtime.md)<br> | 閉じた PR の記録は gh に無い。継承で hostDirectives が子に渡るのは HostDirectivesFeature の ngInherit（standalone-host-directives の 3 節、第 2 回） |
| #65724 | 閉（2025-11-30 → 2025-12-03 COMPLETED） | providers を持つ host directive があると viewProviders が取れない | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | 886cf6c452a（PR #65778）。spec は host\_directives\_spec.ts 1295 行目の it |
| #52072 | 閉（2023-10-06 → 2023-10-09 COMPLETED） | 露出していない host directive の入力が、同じ要素の別のディレクティブの入力を隠す | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | 3 日で閉じられた。今のノードでは inputs と hostDirectiveInputs が別の表（第 5 回 2 節） |
| #71660 | 閉（2026-10-27 → 2026-10-28 COMPLETED） | class・style という出力があると \[class\]・\[style\] が落ちる | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | angular-main の 5fb2b68847d。8576f161ae4 と 22.1.6 には無い |
| #66592 | 閉（2026-01-15 → 2026-02-18 COMPLETED） | FormField が host directive の入力で動かない | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | PR #67065（567f292e8e0、2026-02-13 fix(forms): support custom controls as host directives）で閉じた。control.ts が hostDirectiveInputs を引くのはこの commit から |
| #62784 | 閉（2025-07-24 → 2025-07-30 NOT\_PLANNED） | host directive の入力と host binding を一緒に使いたい | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | #50510 と同じ要望 |
| #48249 | 閉（2022-11-28 → 2022-12-07 COMPLETED） | host directive から ChangeDetectorRef を注入したい | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | spec は host\_directives\_spec.ts の it「should inject a valid ChangeDetectorRef when attached to a component」 |
| #70748 | 閉（2026-09-16 → 2026-09-24 COMPLETED） | model の入出力の組を短く露出したい | [standalone-host-directives（大筋）](../standalone/10-standalone-host-directives.md)<br> | 状態は COMPLETED だが、PR #70839 は取り込まれずに閉じられた（model は入力と出力の短縮にすぎない、需要が多くない、検査が増える、の 3 点） |
| #48951 | 閉（2023-02-03 → 2023-05-19 COMPLETED） | host directive で入力に別名を付けると NG0312 | [standalone-host-directives（大筋）](../standalone/10-standalone-host-directives.md)<br> | validateMappings の別名の検査 |
| #54096 | 閉（2024-01-26 → 2024-07-16 COMPLETED） | オブジェクトの入出力の対応で NG0311 | [standalone-host-directives（大筋）](../standalone/10-standalone-host-directives.md)<br> | 平らな配列への変換（standalone-host-directives の 1 節） |
| #58485 | 閉（2024-11-03 → 2024-11-04 COMPLETED） | hostDirectives で forwardRef が効かない | [standalone-host-directives（大筋）](../standalone/10-standalone-host-directives.md)<br> | 関数で包む出力と、照合のときの評価 |
| #51118 | 閉（2023-07-20 → 2023-09-16 NOT\_PLANNED） | テスト環境で host directive の入力の対応が効かない | [第 5 回 providers と入出力](05-hdi-host-providers-bindings.md)<br> | ラベル area: testing、needs reproduction |
| #23264 | 閉（2018-04-09 → 2022-03-28 COMPLETED） | 利用者が DefFeature を書けるようにしてほしい | [第 1 回 features の並びと実行](01-hdi-features-pipeline.md)<br> | features は今もコンパイラが並べる codegen の API（ɵɵ） |
| #36563 | 閉（2020-04-10 → 2021-05-25 COMPLETED） | \[Ivy\] 子が親の host を受け継ぐようになった | [第 2 回 継承の実行時](02-hdi-inherit-runtime.md)<br> | ラベル core: component extension and customization |
| #33632 | 閉（2019-11-06 → 2022-05-27 COMPLETED） | 子の @HostListener が親の @HostListener を上書きしないでほしい | [第 2 回 継承の実行時](02-hdi-inherit-runtime.md)<br> | ラベル core: component extension and customization |
| #16637 | 閉（2017-05-08 → 2020-03-15 COMPLETED） | AOT でディレクティブを継承すると Cannot determine the module | [第 3 回 継承のコンパイル](03-hdi-inherit-compile.md)<br> | ViewEngine の時代の報告 |
| #22825 | 閉（2018-03-16 → 2020-03-15 COMPLETED） | 外部ライブラリの親の ngOnInit が AOT で継承されない | [第 3 回 継承のコンパイル](03-hdi-inherit-compile.md)<br> | ViewEngine の時代の報告 |
| #59807 | 閉（2025-01-30 → 2025-01-30 NOT\_PLANNED） | mixin を継承したコンポーネントが入出力を受け継がない | [第 3 回 継承のコンパイル](03-hdi-inherit-compile.md)<br> | 同じ日に閉じられた |

### 数で見る傾向

- ラベル `core: host directives` の 26 件のうち、開いているのは 5 件です。閉じた 21 件の内訳は、COMPLETED 11・NOT\_PLANNED 9・DUPLICATE 1 で、閉じたものの 4 割あまりが「やらない」です。NOT\_PLANNED の 9 件のうち 5 件は「host directive に〜もさせたい」という要望（#27672・#48607 の forms の ControlValueAccessor、#51599 のクエリ、#51691 の入力の既定値、#56353 の入力の設定）でした。
- 作られた年（同じ 26 件）：  2018 年 1 件 2022 年 5 件 2023 年 10 件 2024 年 5 件 2025 年 4 件 2026 年 1 件 。v15（2022-11）で hostDirectives が入った直後の 2022〜2023 年に 15 件が集まっています。
- 開いている 5 件は、どれも「露出した入出力が、Angular のほかの仕組みから見えない」形です：custom element（#53193）、router の `withComponentInputBinding`（#60211）、`reflectComponentType`（#49734）、host binding から入力へ（#50510）、1 つの別名を 2 つの入力へ（#48925）。露出は TNode の `hostDirectiveInputs` に実行時に作られるだけで（[第 5 回](05-hdi-host-providers-bindings.md)の 2 節）、コンポーネントの def の `inputs` には入りません。`reflectComponentType` の `inputs` は `componentDef.inputs` から作られ（component\_ref.ts の `get inputs()`）、router の `withComponentInputBinding` はその一覧の名前にだけ `setInput` します（router\_outlet.ts の `reflectComponentType(activatedRoute.component)` のループ）。#60211 はこの組み合わせです。
- ラベル `core: component extension and customization`（継承の側）の 17 件は、開いている 3 件がすべて 2018〜2022 年の要望で、閉じた 14 件はすべて COMPLETED です。2020〜2022 年に ViewEngine の時代の報告がまとめて閉じられています。
- 直したコミットはたいてい host\_directives\_spec.ts に it を足しています（886cf6c452a → 1295 行目、9c55fcb3e65 → `describe('de-duplication')` の 11 件）。2026 年の hostDirectives の変更は、forms のカスタムコントロール（2 月、567f292e8e0・16adbbf4234）、重複の解消（4 月）、preprocessor への移植（10 月、angular-main）の 3 つの流れです。

## このシリーズで見つけたもの

第 1〜5 回を書いている途中で、本番ビルドだけで落ちる組み合わせや、def に残る書き込みが見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、このサイトの依存の @angular/core 22.1.6 と、手元の作業木の spec を使いました。gh で検索した範囲では、同じ件を扱った issue は見つかっていません。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| クラス式（mixin）で `ngOnChanges` を足したコンポーネントだけを使うアプリが、本番ビルドで `TypeError` になる。`registerPreOrderHooks` は prototype の `ngOnChanges` を見て実装を取り出そうとする。その実装を変数に入れる処理は `ɵɵNgOnChangesFeature` の即時実行（`/* @__PURE__ */`）の中にしかないので、どの def もその feature を参照しないと tree shaking で消える。4744bab38ef（v22.1.0）から。angular-main も同じ | ng\_onchanges\_feature.ts 17・42・53〜55 行目、hooks.ts 64 行目 | 22.1.6 の小さな CLI のワークスペースを本番ビルドした記録（`--optimization=false` では動く。`ngOnChanges` を自分で持つコンポーネントを 1 つ足しても動く） | [第 1 回](01-hdi-features-pipeline.md) |
| （記録）汚された prototype への対策 e6953793542 は、説明にない変化も起こしていた。前の形では、飾りのない中間のクラスを通ると同じ親の def が 2 回混ざり、hostVars が 2 倍になり、host バインディングも 2 回呼ばれていた。22.0.x では #69092 で差し戻されている | inherit\_definition\_feature.ts（e6953793542 の差分） | 作業木で前の形に戻して spec を走らせた結果（5 件が失敗） | [第 2 回](02-hdi-inherit-runtime.md) |
| 重複の解消で入出力の対応を合わせた結果が、def に残る。合わせる先が、def の `hostDirectives` に貼られた HostDirectiveDef そのものなので、あとで作るほかのコンポーネントにも効く。`[Plain, AsValue]` のあとで `[Plain, AsOther]` を作ると、開発モードでは NG0312 になる。本番では投げないが `other` が露出されず、`[Plain]` だけのコンポーネントにも `value` が露出される。コンパイラの側（t2\_binder.ts 821〜825 行目）は新しいオブジェクトを作るので起きない | host\_directives\_feature.ts 171〜173 行目（def をそのまま登録）、189 行目（書き込み） | 第 4 回のデモと、22.1.6 の JIT の Node の記録、作業木に足した it | [第 4 回](04-hdi-host-dedupe.md) |
| 重複の解消で 1 つにまとめられた host directive には、後ろのディレクティブに付けた `inputBinding` / `outputBinding` が届かない。`directives: [DirA, {type: DirB, bindings: [inputBinding('value', …)]}]` で、両方が Shared を host directive に持つと、開発モードでは NG0315、本番では黙って届かない。DirB → DirA の順なら届く | instructions/shared.ts 810 行目、view/directive\_outputs.ts 79 行目（host directive の範囲を連続した区間で判定する） | 第 5 回のデモと Node の記録、作業木に足した it | [第 5 回](05-hdi-host-providers-bindings.md) |
| TestBed.overrideComponent で AOT 済みのコンポーネントの providers / viewProviders を差し替えると、差し替えた値も元の値も注入されず `null` になる。v22.0 から（4ad3a1fe379）。既存の章 [standalone-testbed-override](../standalone/12-standalone-testbed-override.md) にも注を足した | testing/src/test\_bed\_compiler.ts 539〜559 行目（resolver が配列を返すだけで、providers を登録する処理を呼ばない） | 22.1.6 の Node の記録。作業木で test\_bed\_spec.ts に it を足すと「Expected null to be 'override'」で落ちる | [第 5 回](05-hdi-host-providers-bindings.md) |
| （細かいもの）1 つの別名を host directive の 2 つの入力に当てる形（#48925）は、コンパイラが診断なしで通し、実行時の開発モードでは「本来ここには来ない」とコメントのある assert に当たる。基本モードの型チェックでは `@if` の中の衝突に NG8024 が出ない。host\_directives\_spec.ts 1142 行目の it は、名前が viewProviders なのに中身は providers を試している | host\_directives\_feature.ts 255〜265 行目、host\_directives\_spec.ts 1142 行目 | Node の記録、grep | [第 4 回](04-hdi-host-dedupe.md)・[第 5 回](05-hdi-host-providers-bindings.md) |

## 聞かれそうな質問

**Q. hostDirectives の振る舞いを変えたら、どの spec を走らせればいいですか？**

実行時なら `//packages/core/test/acceptance:acceptance` を `--test_arg=--filter=^host directives `（末尾の空白も付ける）で 103 件、コンパイラなら `//packages/compiler-cli/test/ngtsc:ngtsc` を `ngtsc host directives compilation` で（shard ごとに 42 件）、照合なら `//packages/compiler/test/render3:test` を `directive de-duplication` で 10 件です。出力の形を変えたら compliance の `full` も走らせます。

**Q. 継承の振る舞いを変えたら？**

同じ acceptance のターゲットを `--filter=^inheritance ` で 117 件です。継承した host directive に関わるなら、host\_directives\_spec.ts の 449・1635・1760・2056・2418・3591 行目の it も通ります（`^host directives ` に含まれる）。

**Q. spec が全部通れば、重複の解消は正しく動いていると言えますか？**

言えない場合があります。host\_directives\_spec.ts の重複の解消の it は、どれも 1 つの要素の中で閉じています。2 つの要素が同じ host directive の設定を共有する場面や、`inputBinding` で特定のホストに届ける場面には it が無く、作業木で足すと落ちました（[第 4 回](04-hdi-host-dedupe.md)・[第 5 回](05-hdi-host-providers-bindings.md)）。

**Q. 開いている hostDirectives の issue で、どの章の知識が要りますか？**

#48925 は[第 4 回](04-hdi-host-dedupe.md)の `patchDeclaredInputs` と `mergeBindingMaps`、#53193・#60211・#49734 は[第 5 回](05-hdi-host-providers-bindings.md)の `hostDirectiveInputs` と `setAllInputsForProperty`、#65750 は第 5 回の `providersResolver` の順です。

## 読み終えて

- hostDirectives の spec は、実行時（acceptance、103 件）・コンパイラ（ngtsc、42 件）・照合（binding\_spec、10 件）・出力（compliance、5 件）の 4 層に分かれている
- 継承の実行時の spec は inherit\_definition\_feature\_spec.ts の 117 件で、組み合わせ（ディレクティブ・コンポーネント・飾りのない親）ごとの describe に分かれている
- jasmine のフィルタは名前の部分一致なので、`^host directives ` のように一番外の describe に絞ると数が合う
- 開いている issue は「露出した入出力がほかの仕組みから見えない」形にまとまり、閉じた issue のほぼ半分は NOT\_PLANNED

---

← 前: [host directive の providers と入出力：注入器と配線の細部](05-hdi-host-providers-bindings.md)
