[目次](../README.md) › [外のコンポーネント：foreignImports と foreign view](README.md) › 第 6 回 / 全 6 回

# spec と PR を読む：foreign component を固めているテスト

> core の acceptance（ng\_project で AOT にした TestBed）と render3・JIT の spec、compiler の binder とパーサの spec、compiler-cli の ngtsc と compliance の spec が、このシリーズの各章の約束をどこで固めているか。runInEachFileSystem で数が 4 倍になることを含めた手元の結果。公開の issue がまだ無いので、merge された PR と、閉じたが中身の入った PR の表、コミットの月ごとの数と、angular-main の preprocessor の続き（684a89027bc・c7fd4a2ed99）。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fgn-tests-issues)

---

シリーズの最後に、第 1〜5 回の約束を固めている spec が、どのファイルのどの describe にあり、どの Bazel の target で走るかを地図にします。手元で走らせた数を書き、公開の issue がまだ 0 件なので、代わりに merge された PR（と、閉じているが中身は入った PR）19 件を章ごとに振り分け、コミットの数の傾向を見ます。

読む対象は `packages/core/test/acceptance/foreign_component/`（2 つの spec と `BUILD.bazel`）、`packages/core/test/render3/` の `foreign_component_spec.ts`・`foreign_view_spec.ts`・`ivy/jit_spec.ts`、compiler と compiler-cli の spec と compliance の `TEST_CASES.json` です。target の読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. 契約と歩み](01-fgn-contract-history.md)
2. [2. foreign view](02-fgn-foreign-view.md)
3. [3. ɵɵforeignComponent の中](03-fgn-instruction.md)
4. [4. @content と後始末](04-fgn-content.md)
5. [5. コンパイラと ngtsc](05-fgn-compiler.md)
6. **6. spec と PR**（この章）

## 1. spec の地図

行番号は 8576f161ae4 で `grep -n` したもの、it の数は describe の範囲の `it(` を数えたものです。「× 4」は 2 節の `runInEachFileSystem` で 4 回走るものです。

| ファイル（packages/ から） | describe / it（行） | 数 | target | 章 |
| --- | --- | --- | --- | --- |
| `core/test/render3/foreign_view_spec.ts` | describe('foreign views') :54（:55 ViewContainerRef の中・:85 コンテナ間の移動・:140 ホストの変更検知・:153 ng-template の中） | it 4 | `//packages/core/test/render3:render3` | [第 2 回](02-fgn-foreign-view.md) |
| `core/test/render3/foreign_component_spec.ts` | describe('ɵɵforeignComponent') :27（:30 描く・:55 props・:73 更新の段で props の関数を呼ぶ・:98 dispose・:125 兄弟の間・:159 親の子・:193 同じテンプレートの再利用） | it 7 | `//packages/core/test/render3:render3` | [第 3 回](03-fgn-instruction.md) |
| `core/test/render3/foreign_component_spec.ts` | :229 ɵɵforeignContent を props に・:320 ɵɵforeignContentFn を props に | it 2 | `//packages/core/test/render3:render3` | [第 4 回](04-fgn-content.md) |
| `core/test/render3/ivy/jit_spec.ts` | describe('foreign components') :551（:564 JIT の foreignImports・:580 imports に入れた外のコンポーネント） | it 2 | `//packages/core/test/render3/ivy:ivy` | [第 3 回](03-fgn-instruction.md) |
| `core/test/acceptance/foreign_component/foreign_component_spec.ts` | describe('reactivity') :47 | it 3 | `//packages/core/test/acceptance/foreign_component:foreign_component` | [第 3 回](03-fgn-instruction.md) |
| `同` | describe('content projection') :163（:164 目印の隣に戻さない・:202〜:560 の 9 つ） | it 10 | `//packages/core/test/acceptance/foreign_component:foreign_component` | [第 4 回](04-fgn-content.md) |
| `同` | describe('control flow') :639（:640 :683 :732 :803 :853） | it 5 | `//packages/core/test/acceptance/foreign_component:foreign_component` | [第 5 回](05-fgn-compiler.md)・[第 4 回](04-fgn-content.md) |
| `同` | describe('queries') :915・describe('event handlers') :953 | it 2 | `//packages/core/test/acceptance/foreign_component:foreign_component` | [第 4 回](04-fgn-content.md) |
| `同` | describe('lifecycle') :987（:1039 static・:1125 dynamic） | it 2 | `//packages/core/test/acceptance/foreign_component:foreign_component` | [第 4 回](04-fgn-content.md) |
| `同` | describe('deferred rendering and property initialization') :1221（:1261〜:1469 の 9 つ。34817da7354 が足した） | it 9 | `//packages/core/test/acceptance/foreign_component:foreign_component` | [第 3 回](03-fgn-instruction.md) |
| `core/test/acceptance/foreign_component/foreign_component_context_spec.ts` | describe('foreign component context') :65（:66〜:146） | it 5 | `//packages/core/test/acceptance/foreign_component:foreign_component` | [第 4 回](04-fgn-content.md) |
| `compiler/test/render3/view/binding_spec.ts` | :1673 要素名で照合・:1688 ディレクティブと両方に当たると投げる | it 2 | `//packages/compiler/test/render3:test` | [第 5 回](05-fgn-compiler.md) |
| `compiler/test/render3/r3_template_transform_spec.ts` | describe('@content blocks') :3064 | it 7 | `//packages/compiler/test/render3:test` | [第 5 回](05-fgn-compiler.md) |
| `compiler-cli/src/ngtsc/annotations/component/test/component_spec.ts` | :1047 foreignImports を読む・:1102 別名・describe('invalid foreignImports expressions') :1159 の 5 つ | it 7 × 4 | `//packages/compiler-cli/src/ngtsc/annotations/component/test:test` | [第 5 回](05-fgn-compiler.md) |
| `compiler-cli/test/ngtsc/template_typecheck_spec.ts` | describe('foreign component template semantics') :2236〜:2768 | it 20 × 4 | `//packages/compiler-cli/test/ngtsc:ngtsc（shard 4）` | [第 5 回](05-fgn-compiler.md) |
| `compiler-cli/src/ngtsc/typecheck/extended/test/checks/interpolated_signal_not_invoked/interpolated_signal_not_invoked_spec.ts` | :356 外のコンポーネントの props なら NG8109 を出さない | it 1 × 4 | `//packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/interpolated_signal_not_invoked:test` | [第 5 回](05-fgn-compiler.md) |
| `compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/standalone/` | TEST\_CASES.json :76（foreign\_component.ts と .js・.local.js、GOLDEN\_PARTIAL.js の :379〜） | 1 項目 | `//packages/compiler-cli/test/compliance/full:full・local:local` | [第 5 回](05-fgn-compiler.md) |

## 2. なぜ TestBed で動くのか、なぜ数が 4 倍になるのか

📄 `angular/packages/core/test/acceptance/foreign_component/BUILD.bazel` L1–30 （▶ の行: 5–6, 8, 17–18, 25–26）

```python
 1 │ load("//tools:defaults.bzl", "angular_jasmine_test", "ng_project", "ng_web_test_suite")
 2 │ 
 3 │ package(default_visibility = ["//visibility:private"])
 4 │ 
 5 ▶ ng_project(
 6 ▶     name = "foreign_component_test_lib",
 7 │     testonly = True,
 8 ▶     srcs = glob(["**/*.ts"]),
 9 │     visibility = ["//:__pkg__"],
10 │     deps = [
11 │         "//packages/core",
12 │         "//packages/core/src/interface",
13 │         "//packages/core/testing",
14 │     ],
15 │ )
16 │ 
17 ▶ angular_jasmine_test(
18 ▶     name = "foreign_component",
19 │     data = [
20 │         ":foreign_component_test_lib",
21 │         "//:node_modules/source-map",
22 │     ],
23 │ )
24 │ 
25 ▶ ng_web_test_suite(
26 ▶     name = "foreign_component_web",
27 │     deps = [
28 │         ":foreign_component_test_lib",
29 │     ],
30 │ )
```

`foreignImports` は JIT で例外になります（[第 3 回](03-fgn-instruction.md)）。それでも acceptance の spec が `TestBed.createComponent` で外のコンポーネントを描けるのは、5 行目の `ng_project` が spec のファイルそのものを Angular のコンパイラで AOT にしてから、17 行目の `angular_jasmine_test`（Node）と 25 行目の `ng_web_test_suite`（ブラウザ）に渡すからです。`ng_project` は tools/defaults.bzl が `@rules_angular//src/ng_project` から読み込む規則で、その定義の説明は「Angular compiler specific version of ts\_project, running ngc on the provided files.」です。spec の中の `@Component({foreignImports: […]})` に `// @ts-ignore` が付いているのは、型に無いフィールドを AOT のコンパイラに読ませるためです。render3 の 2 つの spec は、テンプレート関数と `ɵɵforeignComponent` を手で呼ぶので AOT が要りません。

compiler-cli の spec の多くは `runInEachFileSystem(() => …)` で包まれ、同じ describe を作り物のファイルシステム 4 つ（OS/X・Windows・Unix・Native）で繰り返します （[ngtsc のテストの環境の章](../ngtsc/19-ngtsc-test-env.md)で引用した test\_helper.ts）。名前で絞り込むと、it の数の 4 倍が `Ran` に出ます。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/standalone/TEST_CASES.json` L75–85 （▶ の行: 76–77, 81, 84）

```json
75 │     {
76 ▶       "description": "should properly compile foreign component imports in a standalone component",
77 ▶       "inputFiles": ["foreign_component.ts"],
78 │       "expectations": [
79 │         {
80 │           "failureMessage": "Invalid foreign component definition",
81 ▶           "files": ["foreign_component.js"]
82 │         }
83 │       ],
84 ▶       "compilationModeFilter": ["full compile", "local compile"]
85 │     }
```

compliance は 1 つの項目が 1 つの spec です。84 行目の `compilationModeFilter` が full と local だけなので、リンクのテスト（部分コンパイル → linker）はこの項目を走らせません。[第 5 回](05-fgn-compiler.md)の 7 節で、部分コンパイルでは `foreignImports` が消えることを記録で確かめました。

## 3. 手元で走らせた結果

8576f161ae4 の ../angular で、`pnpm bazel test <target> --nocache_test_results --test_output=all "--test_arg=--filter=<filter>"` を 1 つずつ走らせました（2026-11-15。2 回目以降でビルド済み）。

| target | filter | 結果 |
| --- | --- | --- |
| `//packages/core/test/acceptance/foreign_component:foreign_component` | `（なし）` | 36 specs, 0 failures |
| `//packages/core/test/render3:render3` | `ɵɵforeignComponent\|foreign views` | Ran 13 of 574 specs / 0 failures |
| `//packages/core/test/render3/ivy:ivy` | `foreign components` | Ran 2 of 33 specs / 0 failures |
| `//packages/compiler/test/render3:test` | `foreign components\|@content blocks` | Ran 8 of 499 specs / 0 failures |
| `//packages/compiler-cli/src/ngtsc/annotations/component/test:test` | `foreignImports` | Ran 28 of 132 specs / 0 failures |
| `//packages/compiler-cli/test/ngtsc:ngtsc` | `foreign component template semantics` | shard ごとに Ran 20 of 6694 specs（4 つで 80）/ 0 failures |
| `//packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/interpolated_signal_not_invoked:test` | `foreign component` | Ran 4 of 440 specs / 0 failures |
| `//packages/compiler-cli/test/compliance/full:full` | `foreign component` | shard 2 つで Ran 0 と Ran 1 / 1 spec, 0 failures |
| `//packages/compiler-cli/test/compliance/local:local` | `foreign component` | shard 2 つで Ran 0 と Ran 1 / 1 spec, 0 failures |
| `//packages/compiler-cli/test/compliance/linked:linked` | `foreign component` | shard 2 つとも Ran 0 / 0 specs |

- acceptance の 36 は、1 節の表の 3 + 10 + 5 + 2 + 2 + 9 = 31 と context の 5 の合計です。filter を付けていないので、このディレクトリの spec が全部です。
- render3 の 13 は、foreign\_view\_spec.ts の 4 と foreign\_component\_spec.ts の 9 です。ivy の 2 は JIT の 2 つです。
- compiler の 8 は、binding\_spec.ts の 1673 行目（名前に「foreign components」）と `@content blocks` の 7 です。1688 行目の it は名前が単数形なので、この filter に入りません。
- ngtsc は 4 つの shard がどれも 20 で、合計 80 = it 20 × 4。component の 28 は 7 × 4、NG8109 の 4 は 1 × 4 です。
- web の suite（`:foreign_component_web` と `:render3_web`）は走らせていません。

### 新しい本家との違い

angular-main（74961c66242）では、core の `instructions/foreign_component.ts` と、ngtsc の `annotations/component/src/foreign_component.ts` は 8576f161ae4 と同じでした（`diff` で差分なし）。違うのは、2026-10 に入った preprocessor（`packages/compiler-cli/preprocessor`）の側に外のコンポーネントの照合と検査がもう 1 つあることと、ngtsc の spec を preprocessor でも走らせる仕組みの「失敗してよい一覧」から、c7fd4a2ed99 が外のコンポーネントの it を 8 つ消したことです（[第 5 回](05-fgn-compiler.md)の 8 節）。

## 4. PR の表

gh で「foreign」を含む PR を検索し（読むだけ）、外のコンポーネントと関係の無いもの（`ForeignFunctionResolver` の話の #71822、NgModule の #71462 など）を除き、PR に入っているコミットの見出しを `gh pr view --json commits` で照らし合わせました。commit の列は ../angular（または angular-main）で見つかったハッシュです。

| # | 状態 | 日付 | 題 | コミット | 章 | メモ |
| --- | --- | --- | --- | --- | --- | --- |
| #68336 | merge | 2026-05-15 | refactor(core): add internal API for creating foreign views | 0a9b19454d0 | [第 2 回](02-fgn-foreign-view.md) | コミットの日付は 03-25（作者の日付）で、merge は 7 週間あと |
| #68643 | merge | 2026-05-18 | refactor(compiler): add support for importing foreign components | 88b0e420cf8 | [第 1 回](01-fgn-contract-history.md)[第 5 回](05-fgn-compiler.md) | PartialEvaluator で読む最初の形 |
| #68674 | 閉 | 2026-05-19 | refactor(compiler): support matching template elements to foreign components | d596d8bd0ac・7c60a98b3cc | [第 5 回](05-fgn-compiler.md) | 閉じているが、2 つのコミットは本文に (#68674) を付けて入っている |
| #68786 | merge | 2026-05-27 | refactor(compiler): emit instructions for foreign components | 6981cd782a1 | [第 5 回](05-fgn-compiler.md) |   |
| #68787 | merge | 2026-06-03 | refactor(core): implement ɵɵforeignComponent instruction | 330e209c692・e678955eacd・aeb55c8bc10・0c07356c5c9 | [第 2 回](02-fgn-foreign-view.md)[第 3 回](03-fgn-instruction.md)[第 5 回](05-fgn-compiler.md) | 4 つのコミットを 1 つの PR に積む |
| #69104 | 閉 | 2026-06-05 | fix(compiler): support foreign components defined outside top-level scope | （9 つ。68787・68996・69087 と重なる） | [第 5 回](05-fgn-compiler.md) | 積んだ PR の 1 つ。中身は 68996 と 69087 で入った |
| #68996 | merge | 2026-06-05 | Add support for projecting content into foreign component properties | f89d0e4c8fc・f19bbe59dd9・56607967dbb・daa47b4aad8・1f6e843648f・337442453b7・79e5d5d75f0 | [第 4 回](04-fgn-content.md)[第 5 回](05-fgn-compiler.md) | 7 つのコミット |
| #69087 | merge | 2026-06-08 | refactor(compiler): support passing \`@content\` blocks as functions | b399f78c347・25c744c4d0a・11b206b9190 | [第 4 回](04-fgn-content.md)[第 5 回](05-fgn-compiler.md) |   |
| #69537 | merge | 2026-06-29 | refactor(core): enable foreign components to render content lazily | 4847c0e07b1 | [第 4 回](04-fgn-content.md) |   |
| #69502 | 閉 | 2026-06-30 | refactor(core): add context support for foreign components | 555fc20af04・a720094deb2 | [第 4 回](04-fgn-content.md) | 閉じているが、コミットの本文は PR Close #69502 |
| #69659 | merge | 2026-07-07 | refactor(compiler-cli): support foreign imports with isolated declarations | a19c02706fd | [第 5 回](05-fgn-compiler.md) |   |
| #69674 | 閉 | 2026-07-09 | fix(compiler): support foreign components inside control flow blocks | 5bd00add071・2e442f78762 | [第 5 回](05-fgn-compiler.md) | 閉じているが、コミットの本文は PR Close #69674 |
| #70389 | merge | 2026-08-25 | fix(core): explicitly reject foreign components in JIT mode | 915a03ae856 | [第 3 回](03-fgn-instruction.md) | 22.1.x には b199bdfa2ad（22.1.4〜） |
| #70390 | merge | 2026-08-25 | fix(compiler-cli): default template diagnostic related message source file to template | a46292af260 | [第 5 回](05-fgn-compiler.md) | 22.1.x には afe8499a14c（22.1.4〜） |
| #70388 | merge | 2026-08-28 | refactor(core): defer foreign component rendering to post-update pass | 34817da7354 | [第 3 回](03-fgn-instruction.md) | 22.1.x には 60f8a785fd2（22.1.5〜） |
| #70515 | merge | 2026-09-09 | fix(devtools): safely handle foreign root elements in feature detection and discovery | ef09d108f23 ほか | [第 1 回](01-fgn-contract-history.md) | devtools の側 |
| #71310 | merge | 2026-10-12 | Various fixes for the preprocessor | 684a89027bc（angular-main） | [第 5 回](05-fgn-compiler.md) | preprocessor の照合 |
| #71642 | merge | 2026-10-26 | Various preprocessor fixes | c7fd4a2ed99（angular-main） | [第 5 回](05-fgn-compiler.md) | preprocessor の検査を ngtsc に揃える |
| #71935 | merge | 2026-11-11 | refactor: remove selectorless and signal components prototypes | origin/main の ae9c706d141 ほか | [第 5 回](05-fgn-compiler.md) | SelectorlessMatcher は外のコンポーネントのために残る |

### 数で見る傾向

- ../angular の foreign の本体のコミット 33 個を、作者の日付の月で数えると  2026-03 は 1 個 2026-04 は 0 個 2026-05 は 12 個 2026-06 は 12 個 2026-07 は 4 個 2026-08 は 3 個 2026-09 は 1 個 です。5〜6 月の 2 か月に 24 個が集まり、7 月から先は直し（JIT で断る・描く時機・関連メッセージ）と、compiler-cli の別の仕組み（isolated declarations・preprocessor）への対応になっています。
- 33 個のうち 28 個が leonsenft さん（Leon Senft）のコミットで、残りは Alex Rickabaugh さん 2 個（0a9b19454d0・4f9ee3c056a）、devtools の 2 個（56847dc77a5・ef09d108f23）、テストの 1 個（eb3e480360d）です。
- PR は「いくつかのコミットを積んで 1 つの PR にする」形が多く、#68787 は 4 個、#68996 は 7 個です。閉じた 4 件のうち #68674・#69502・#69674 は、コミットの本文に PR の番号（`PR Close #69502` など）を持って入っています。#69104 は積んだ PR の 1 つで、同じ見出しのコミットが #68787・#68996・#69087 で入りました。PR を読むときは、状態が「閉」でも中身が入ったかをコミットの側で確かめる必要があります。
- 作者の日付と merge の日付は離れることがあります。0a9b19454d0 は作者の日付が 03-25 で、#68336 の merge は 05-15 です。
- 22.2 から入ったと見える 3 つ（34817da7354・915a03ae856・a46292af260）は、22.1.x にも 60f8a785fd2・b199bdfa2ad・afe8499a14c として入っています（`git tag --contains` で 22.1.4〜22.1.5 から）。このサイトの 22.1.6 と 22.2.6 で、第 4・5 回の記録が同じだったのはこのためです。

## このシリーズで見つけたもの

第 1〜5 回を書いている途中で、サーバーで描くと止まる行や、並べ替えで DOM が消える行が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、このサイトの依存の @angular/core 22.1.6 と、Node で動かした 22.2.6 を使いました。gh で検索した範囲では、同じ件を扱った issue や PR は見つかっていません。foreign component は内部向けの仕組みなので、仕様として決めてある振る舞いが含まれているかもしれません。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| 外のコンポーネントを @if などのビューの根に置いて platform-server で描くと、`ReferenceError: document is not defined` で止まる。同じ回の変更検知も止まり、ほかの外のコンポーネントの render も呼ばれない | core の render3/foreign\_view.ts 126 行目（`document.createDocumentFragment()`）、node\_manipulation.ts 962 行目（Detach の枝も大域の `document`） | 22.1.6 と 22.2.6 の renderApplication の記録 | [第 2 回](02-fgn-foreign-view.md) |
| @for の中の外のコンポーネントで、@content の中身をもう作ったあとに並べ替えると、`insertBefore` が NG05106 を投げ、要素が 1 つ消える。開発モードと本番のどちらでも起きる | core の render3/node\_manipulation.ts 714〜715 行目（`getFirstNativeNode` のコンテナの枝が LogicalOnly のコンテナに降り、外が持っているノードを返す） | 22.1.6・22.2.6 の Node の記録。LogicalOnly なら `lContainer[NATIVE]` を返す 1 行を写しに足すと並べ替わった。spec の並べ替えの it は中身の無い外のコンポーネントだけ | [第 4 回](04-fgn-content.md) |
| 同じ要素がディレクティブのセレクタと外のコンポーネントの名前の両方に当たると、テンプレートの診断ではなく素の `Error` になり、ビルドは TS500 で落ちる。spec もその throw を期待している | compiler の render3/view/t2\_binder.ts 754〜756 行目、test の binding\_spec.ts 1688 行目 | compiler-cli 22.1.6・22.2.6 の記録 | [第 5 回](05-fgn-compiler.md) |
| 部分コンパイル（ライブラリの配布の形）では foreignImports が残らず、linker が `foreignImports: null` を渡す。リンクのあとの `<Card>` はふつうの要素になり、診断は 0 件 | compiler-cli の linker/src/file\_linker/partial\_linkers/partial\_component\_linker\_1.ts 257 行目。compliance の test は linked のモードを外している | compiler-cli の部分コンパイル → linker の記録 | [第 5 回](05-fgn-compiler.md) |
| 外のコンポーネントの名前が HTML の要素名と大文字小文字を無視して同じだと、HTML の要素の定義が使われる。`<Title ... />` は「Only void, custom and foreign elements can be self closed」になる | compiler の ml\_parser/html\_tags.ts 192 行目（定義が無ければ小文字にして引き直す） | compiler-cli 22.1.6 の記録（確かめたのは Title だけ） | ― |
| @Component の定義を作るとき、consts の中の外のコンポーネントのオブジェクトを `join` で文字列にする。文字列にできないオブジェクトだと、クラスを読み込んだ時点で TypeError になる（不具合というより、橋を書く側が知っておくこと） | core の render3/definition.ts 739 行目（getComponentId） | ページの上の Proxy の橋 | [第 1 回](01-fgn-contract-history.md) |
| spec が固めていない行: 再利用のときの `setCurrentTNode(tNode, false)` の 1 行は、消しても render3 の 9 specs が通る（固めているのは前の形に戻らないことだけ） | core の render3/instructions/foreign\_component.ts | 作業木で行を消して bazel | [第 3 回](03-fgn-instruction.md) |

## 聞かれそうな質問

**Q. foreignImports の振る舞いを確かめる spec を足すなら、どこですか？**

描く・中身・後始末は acceptance の foreign\_component\_spec.ts の describe（1 節の表）に足し、`//packages/core/test/acceptance/foreign_component:foreign_component` で走らせます。この target は `ng_project` で AOT にするので、`foreignImports` を書いたコンポーネントを TestBed で描けます（2 節の BUILD.bazel の 5 行目）。テンプレートの検査は template\_typecheck\_spec.ts の `foreign component template semantics`、出力の形は compliance の `standalone/foreign_component.*` です。

**Q. なぜ filter で絞ると数が 4 の倍数になりますか？**

compiler-cli の spec が `runInEachFileSystem` で、同じ it を 4 つのファイルシステムで走らせるからです（2 節）。ngtsc は 20 × 4 = 80 を 4 つの shard に分けて、どれも 20 でした。

**Q. 部分コンパイルの spec はありますか？**

compliance の項目は `compilationModeFilter` が full と local だけで（TEST\_CASES.json 84 行目）、リンクのテストは 0 specs でした。GOLDEN\_PARTIAL.js には部分コンパイルの出力が書かれていますが、そこに `foreignImports` は無く、`@Component` の metadata（`ɵɵngDeclareClassMetadata`）の中にだけ残っています。

**Q. issue が 0 件なのに、どこで議論を追えばいいですか？**

PR とコミットの本文です。4 節の表のとおり、変更の理由はコミットの本文に長く書かれていて（例: 11b206b9190 の「ビューが生き続け、メモリが漏れる」、a19c02706fd の「isolated declarations では評価器が動かない」）、PR は積んだコミットのまとまりです。閉じた PR も、中身が入ったかをコミットの側で確かめます。

## 読み終えて

- core の spec は acceptance の 2 つ（AOT で TestBed）と render3 の 2 つ（命令を手で呼ぶ）と JIT の 1 つ。手元で 36・13・2 本がすべて通った
- compiler-cli の spec は `runInEachFileSystem` で 4 倍に数える。template\_typecheck\_spec.ts の 20 の it が 8025〜8029 を固めている
- compliance は full と local だけで、部分コンパイル（linker）は対象外
- PR は積んだコミットのまとまりで、閉じた PR も中身が入っていることがある。コミットは 5〜6 月に 24 個が集まった

---

← 前: [コンパイラと ngtsc：テンプレートから命令まで](05-fgn-compiler.md)  
次: [字句と構文：@let が 3 つのトークンと 1 つのノードになるまで](../letd/01-letd-syntax.md) →
