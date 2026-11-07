[目次](../README.md) › [i18n と $localize の内側](README.md) › 第 19 回 / 全 20 回

# i18n のテスト：spec の場所と走らせ方

> compiler の i18n の spec（test/i18n/・test/render3/view/i18n\_spec.ts）、compiler-cli のコンプライアンステスト（r3\_view\_compiler\_i18n のゴールデン）、core の render3/i18n と acceptance/i18n\_spec.ts、localize の src と tools の spec。それぞれのターゲットを手元で走らせるコマンドと、ゴールデンの出力を読む方法。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/loc-testing)

---

i18n のコードは compiler・compiler-cli・core・common・localize の 5 つのパッケージにまたがり、spec もそれぞれのパッケージの bazel のターゲットに入っています。この章では、「どのソースを変えたら、どのターゲットのどの spec を走らせるか」を各 `BUILD.bazel` の行で確かめ、コンプライアンステスト（コンパイラの出力をゴールデンのファイルと比べるテスト）の `TEST_CASES.json` の書き方と、ゴールデンの読み方・作り直し方を追います。最後に、全部のターゲットを手元で 1 回ずつ走らせた本数と秒数を並べます。

読む対象は `packages/localize/**/BUILD.bazel`・`packages/compiler/test/BUILD.bazel`・`packages/core/test/{render3,acceptance}/BUILD.bazel`・`packages/common/test/BUILD.bazel`、`packages/compiler-cli/test/compliance/` の `full/`・`test_helpers/`・`test_cases/r3_view_compiler_i18n/**/TEST_CASES.json`・`README.md`、`packages/localize/tools/test/helpers/` です。

1. [1. 全体像](01-loc-overview.md)
2. [2. 印とメッセージ](02-loc-markup.md)
3. [3. プレースホルダー](03-loc-placeholders.md)
4. [4. メッセージ ID](04-loc-message-id.md)
5. [5. コンパイラの段](05-loc-pipeline-phases.md)
6. [6. $localize の出力](06-loc-const-collection.md)
7. [7. ICU のコンパイル](07-loc-icu-compile.md)
8. [8. 設定と古い抽出](08-loc-compiler-options.md)
9. [9. 実行時（1）解析](09-loc-runtime-start.md)
10. [10. 実行時（2）DOM](10-loc-runtime-dom.md)
11. [11. 実行時（3）ICU](11-loc-runtime-icu.md)
12. [12. ロケールのデータ](12-loc-locale-data.md)
13. [13. $localize](13-loc-localize-tag.md)
14. [14. 実行時の翻訳](14-loc-runtime-translations.md)
15. [15. 抽出](15-loc-extract-tool.md)
16. [16. 翻訳ファイルを書く](16-loc-serializers.md)
17. [17. 翻訳ファイルを読む](17-loc-translation-parsers.md)
18. [18. 差し込み](18-loc-translate-tool.md)
19. **19. テスト**（この章）
20. [20. issue と PR を読む](20-loc-issues.md)

## 0. 3 つの言葉

- **ターゲット**：`//packages/localize/tools/test:test` のような bazel の名前。`:` の前が `BUILD.bazel` のあるフォルダ（パッケージ）、後ろがその中の `name` です。
- **shard**：1 つのターゲットの spec を、別々のプロセスに分けて同時に走らせること。`shard_count = 4` なら 4 つの出力が出て、それぞれの「N specs」を足したものが本数です。
- **--filter**：`--test_arg=--filter=…` で、describe と it をつないだ名前を正規表現で絞ります。**0 本に一致しても PASSED** なので、必ず「Ran N of M specs」の N を見ます。shard があるときは、絞ったあとの spec が shard に分かれます（第 17 回で `formatDiagnostics` の 4 本に絞ると、4 つの shard が「Ran 1」ずつでした）。

## 1. localize のターゲット

📄 `ターミナル`

```
cd ../angular
pnpm bazel query 'tests(//packages/localize/...)'
```

📄 `出力（2026-11-03。ログは scratchpad/i18n-logs/e-query-localize.log）`

```
js_test rule //packages/localize:localize_api
_strict_deps_test rule //packages/localize:localize_deps
_strict_deps_test rule //packages/localize/init:init_deps
_strict_deps_test rule //packages/localize/schematics/ng-add:ng-add_deps
jasmine_test rule //packages/localize/schematics/ng-add:test
_strict_deps_test rule //packages/localize/schematics/ng-add:test_lib_deps
_strict_deps_test rule //packages/localize/src/localize:localize_deps
jasmine_test rule //packages/localize/src/localize/test:test
_strict_deps_test rule //packages/localize/src/localize/test:test_lib_deps
_strict_deps_test rule //packages/localize/src/utils:utils_deps
jasmine_test rule //packages/localize/src/utils/test:test
_strict_deps_test rule //packages/localize/src/utils/test:test_lib_deps
jasmine_test rule //packages/localize/test:test
_strict_deps_test rule //packages/localize/test:test_lib_deps
_strict_deps_test rule //packages/localize/tools:tools_deps
jasmine_test rule //packages/localize/tools/test:test
_strict_deps_test rule //packages/localize/tools/test:test_lib_deps
jasmine_test rule //packages/localize/tools/test/extract/integration:integration
_strict_deps_test rule //packages/localize/tools/test/extract/integration:test_lib_deps
_strict_deps_test rule //packages/localize/tools/test/extract/integration/test_files:src_deps
_strict_deps_test rule //packages/localize/tools/test/helpers:helpers_deps
jasmine_test rule //packages/localize/tools/test/migrate/integration:integration
_strict_deps_test rule //packages/localize/tools/test/migrate/integration:test_lib_deps
jasmine_test rule //packages/localize/tools/test/translate/integration:integration
_strict_deps_test rule //packages/localize/tools/test/translate/integration:test_lib_deps
```

25 行のうち、spec を走らせるのは `jasmine_test` の 8 つと、公開 API の形を確かめる `js_test` の `localize_api` です。`_strict_deps_test` の 16 個は、ソースが `deps` に書いていないものを import していないかを見るだけのテストです。

📄 `angular/packages/localize/tools/test/BUILD.bazel` L1–34 （▶ の行: 6–8, 11, 22–23, 27–28, 33）

```python
 1 │ load("//tools:defaults.bzl", "jasmine_test", "ts_project")
 2 │ 
 3 │ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob(
 7 ▶         ["**/*.ts"],
 8 ▶     ),
 9 │     visibility = ["//packages/localize/tools/test:__subpackages__"],
10 │     deps = [
11 ▶         "//:node_modules/@babel/core",
12 │         "//:node_modules/@babel/generator",
13 │         "//:node_modules/tinyglobby",
14 │         "//packages:types",
15 │         "//packages/compiler",
16 │         "//packages/compiler-cli/private",
17 │         "//packages/compiler-cli/src/ngtsc/file_system",
18 │         "//packages/compiler-cli/src/ngtsc/file_system/testing",
19 │         "//packages/compiler-cli/src/ngtsc/logging/testing",
20 │         "//packages/localize",
21 │         "//packages/localize/src/utils",
22 ▶         "//packages/localize/tools",
23 ▶         "//packages/localize/tools/test/helpers",
24 │     ],
25 │ )
26 │ 
27 ▶ jasmine_test(
28 ▶     name = "test",
29 │     data = [
30 │         ":test_lib",
31 │         "//:node_modules/tinyglobby",
32 │     ],
33 ▶     shard_count = 4,
34 │ )
```

1. **6〜8 行目：このフォルダの下の .ts を全部**

   ただし bazel の `glob` は、下に別の `BUILD.bazel` がある（別のパッケージの）フォルダには入りません。だから `translate/integration/` と `extract/integration/`・`migrate/integration/` の spec は、このターゲットに入りません。
2. **11・22・23 行目：本物の Babel と tools と helpers**

   spec はビルドした `//packages/localize/tools` を import します。
3. **27〜34 行目：jasmine で 4 つの shard**

   第 17・18 回の spec（パーサー、ローダー、ハンドラー、プラグイン、出力のパス）と、第 15・16 回の抽出・書き手の spec はここです。

📄 `angular/packages/localize/tools/test/translate/integration/BUILD.bazel` L3–28 （▶ の行: 7, 14, 20, 24–26）

```python
 3 │ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 │     srcs = glob(
 7 ▶         ["**/*_spec.ts"],
 8 │     ),
 9 │     deps = [
10 │         "//packages:types",
11 │         "//packages/compiler-cli/src/ngtsc/file_system",
12 │         "//packages/compiler-cli/src/ngtsc/file_system/testing",
13 │         "//packages/compiler-cli/src/ngtsc/testing",
14 ▶         "//packages/localize/tools",
15 │         "//packages/localize/tools/test/helpers",
16 │     ],
17 │ )
18 │ 
19 │ jasmine_test(
20 ▶     name = "integration",
21 │     data = [
22 │         ":test_lib",
23 │         "//:node_modules/tinyglobby",
24 ▶         "//:node_modules/yargs",
25 ▶         "//packages/localize/tools/test/translate/integration/locales",
26 ▶         "//packages/localize/tools/test/translate/integration/test_files",
27 │     ],
28 │ )
```

`translate/integration` は別のパッケージで、7 行目の `*_spec.ts` だけを集めます。25〜26 行目で、本物の翻訳ファイル（`locales/` の `messages.fr.xlf` など）と、翻訳される JS（`test_files/`）をデータとして渡し、`translateFiles` を本物のファイルの上で走らせます。24 行目の `yargs` は CLI の引数の読み取りに要るものです。

📄 `angular/packages/localize/test/BUILD.bazel` L1–22 （▶ の行: 7, 11–12, 17–18）

```python
 1 │ load("//tools:defaults.bzl", "jasmine_test", "ts_project")
 2 │ 
 3 │ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 │     srcs = glob(
 7 ▶         ["**/*_spec.ts"],
 8 │     ),
 9 │     deps = [
10 │         "//packages:types",
11 ▶         "//packages/localize",
12 ▶         "//packages/localize/init",
13 │         "//packages/localize/src/utils",
14 │     ],
15 │ )
16 │ 
17 ▶ jasmine_test(
18 ▶     name = "test",
19 │     data = [
20 │         ":test_lib",
21 │     ],
22 │ )
```

`//packages/localize/test:test` は `translate_spec.ts` の 1 つだけで、11〜12 行目の `//packages/localize` と `/init` に頼るので、`loadTranslations` と本物の `$localize` を組み合わせて確かめます（[第 14 回](14-loc-runtime-translations.md)）。`src/utils/test`（`messages_spec.ts`・`translations_spec.ts`）と `src/localize/test`（`localize_spec.ts`）も同じ形で、deps が `//packages/localize/src/utils` や `/src/localize` だけです。

## 2. compiler・core・common のターゲット

📄 `angular/packages/compiler/test/BUILD.bazel` L1–29 （▶ の行: 4–5, 11–13）

```python
 1 │ load("//tools:defaults.bzl", "ts_project", "zoneless_jasmine_test", "zoneless_web_test_suite")
 2 │ 
 3 │ # Test that should only be run in node
 4 ▶ NODE_ONLY = [
 5 ▶     "**/*_node_only_spec.ts",
 6 │ ]
 7 │ 
 8 │ ts_project(
 9 │     name = "test_lib",
10 │     testonly = True,
11 ▶     srcs = glob(
12 ▶         ["**/*.ts"],
13 ▶         exclude = NODE_ONLY,
14 │     ),
15 │     deps = [
16 │         "//:node_modules/source-map",
17 │         "//packages/common",
18 │         "//packages/compiler",
19 │         "//packages/compiler/test/expression_parser/utils",
20 │         "//packages/compiler/test/ml_parser/util",
21 │         "//packages/core",
22 │         "//packages/core/src/compiler",
23 │         "//packages/core/testing",
24 │         "//packages/platform-browser",
25 │         "//packages/platform-browser-dynamic",
26 │         "//packages/platform-browser/testing",
27 │         "//packages/private/testing",
28 │     ],
29 │ )
```

📄 `angular/packages/compiler/test/BUILD.bazel` L31–53 （▶ の行: 46–47, 49–50）

```python
31 │ ts_project(
32 │     name = "test_node_only_lib",
33 │     testonly = True,
34 │     srcs = glob(
35 │         NODE_ONLY,
36 │     ),
37 │     deps = [
38 │         ":test_lib",
39 │         "//:node_modules/typescript",
40 │         "//packages/compiler",
41 │         "//packages/compiler/test/expression_parser/utils",
42 │         "//packages/core",
43 │     ],
44 │ )
45 │ 
46 ▶ zoneless_jasmine_test(
47 ▶     name = "test",
48 │     data = [
49 ▶         ":test_lib",
50 ▶         ":test_node_only_lib",
51 │         "//:node_modules/source-map",
52 │     ],
53 │ )
```

compiler の spec は 11〜14 行目で `compiler/test/` の下の全部（`*_node_only_spec.ts` を除く）を 1 つの `test_lib` にし、46〜53 行目の `//packages/compiler/test:test` で走らせます。i18n の `test/i18n/`（i18n\_parser・digest・serializers/ など）も、テンプレートパイプラインの出力を見る `test/render3/view/i18n_spec.ts` も、ここに入ります。shard はありません。

📄 `angular/packages/core/test/render3/BUILD.bazel` L5–18 （▶ の行: 8–10, 15）

```python
 5 │ ts_project(
 6 │     name = "render3_lib",
 7 │     testonly = True,
 8 ▶     srcs = glob(
 9 ▶         ["**/*.ts"],
10 ▶         exclude = [
11 │             "**/*_perf.ts",
12 │             "domino.d.ts",
13 │             "load_domino.ts",
14 │             "is_shape_of.ts",
15 ▶             "jit_spec.ts",
16 │             "matchers.ts",
17 │         ],
18 │     ),
```

📄 `angular/packages/core/test/render3/BUILD.bazel` L67–80 （▶ の行: 67–68, 75–76）

```python
67 ▶ angular_jasmine_test(
68 ▶     name = "render3",
69 │     data = [
70 │         ":domino",
71 │         ":render3_lib",
72 │     ],
73 │ )
74 │ 
75 ▶ ng_web_test_suite(
76 ▶     name = "render3_web",
77 │     deps = [
78 │         ":render3_lib",
79 │     ],
80 │ )
```

core の `test/render3/i18n/`（`i18n_parse_spec.ts`・`i18n_insert_before_index_spec.ts`・`i18n_spec.ts`）は 67〜73 行目の `//packages/core/test/render3:render3` です。75 行目の `render3_web` は同じ spec をブラウザで走らせるもので、手元ではブラウザの準備が要るので、この章では Node の `render3` だけを走らせました。

📄 `angular/packages/core/test/acceptance/BUILD.bazel` L9–42 （▶ の行: 12–14, 23, 33–34）

```python
 9 │ ts_project(
10 │     name = "acceptance_lib",
11 │     testonly = True,
12 ▶     srcs = glob(
13 ▶         ["**/*.ts"],
14 ▶         exclude = SPEC_FILES_WITH_FORWARD_REFS,
15 │     ),
16 │     visibility = ["//:__pkg__"],
17 │     deps = [
18 │         "//:node_modules/rxjs",
19 │         "//packages/animations",
20 │         "//packages/animations/browser",
21 │         "//packages/animations/browser/testing",
22 │         "//packages/common",
23 ▶         "//packages/common/locales",
24 │         "//packages/compiler",
25 │         "//packages/core",
26 │         "//packages/core/primitives/devtools",
27 │         "//packages/core/primitives/signals",
28 │         "//packages/core/src/di/interface",
29 │         "//packages/core/src/util",
30 │         "//packages/core/test/animation_utils",
31 │         "//packages/core/test/render3:matchers",
32 │         "//packages/core/testing",
33 ▶         "//packages/localize",
34 ▶         "//packages/localize/init",
35 │         "//packages/platform-browser",
36 │         "//packages/platform-browser/animations",
37 │         "//packages/platform-browser/testing",
38 │         "//packages/platform-server",
39 │         "//packages/private/testing",
40 │         "//packages/router",
41 │     ],
42 │ )
```

acceptance は、コンポーネントを本当に作って DOM を確かめる spec の集まりで、i18n は `i18n_spec.ts` です。ターゲットの `angular_jasmine_test`（acceptance）と `ng_web_test_suite`（acceptance\_web）の行は[testing-component-bindings](../testing/06-testing-component-bindings.md) で引用しています。33〜34 行目で `//packages/localize` と `/init` に、23 行目で `//packages/common/locales` に頼ります。i18n\_spec.ts は 10 行目で `import '@angular/localize/init'` して `$localize` を置き、42 行目で `loadTranslations` と `clearTranslations` を import します。60〜62 行目の `afterEach` で毎回 `clearTranslations()` し、it の中で 65 行目のように `loadTranslations({[computeMsgId('text')]: 'texte'})` と翻訳を読んでから、66 行目の `initWithTemplate`（3770〜3775 行目。`TestBed.overrideComponent` でテンプレートを差し替え、`createComponent` と `detectChanges`）でコンポーネントを作り、67 行目で `innerHTML` を比べます。この形は、翻訳を起動の前に読む、という実行時の翻訳の決まり（[第 14 回](14-loc-runtime-translations.md)）をそのまま使っています。

📄 `angular/packages/common/test/BUILD.bazel` L1–30 （▶ の行: 6–7, 14, 25–26）

```python
 1 │ load("//tools:defaults.bzl", "ts_project", "zoneless_jasmine_test", "zoneless_web_test_suite")
 2 │ 
 3 │ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob(
 7 ▶         ["**/*.ts"],
 8 │     ),
 9 │     visibility = ["//:__pkg__"],
10 │     deps = [
11 │         "//:node_modules/rxjs",
12 │         "//:node_modules/zone.js",
13 │         "//packages/common",
14 ▶         "//packages/common/locales",
15 │         "//packages/common/testing",
16 │         "//packages/compiler",
17 │         "//packages/core",
18 │         "//packages/core/testing",
19 │         "//packages/platform-browser",
20 │         "//packages/platform-browser/testing",
21 │         "//packages/private/testing",
22 │     ],
23 │ )
24 │ 
25 ▶ zoneless_jasmine_test(
26 ▶     name = "test",
27 │     data = [
28 │         ":test_lib",
29 │     ],
30 │ )
```

common の `test/i18n/`（format\_date・format\_number・locale\_data\_api・localization）と `test/pipes/i18n_plural_pipe_spec.ts`・`i18n_select_pipe_spec.ts` は 25〜30 行目の `//packages/common/test:test` です。14 行目でロケールのデータ（`//packages/common/locales`）に頼ります（[第 12 回](12-loc-locale-data.md)）。

## 3. 変えた場所からターゲットを選ぶ

> **🧪 DEMO — 変えたソースから、走らせるコマンドを作る**
>
> 2026-11-03 に ../angular（8576f161ae4）で 1 回ずつ走らせた結果を、この章の .ts に持っています（通信はしない）。フィルタは、そのとき使ったものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/loc-testing)

| ターゲット | spec | フィルタ | 本数 | 時間 |
| --- | --- | --- | --- | --- |
| `//packages/compiler/test:test` | compiler/test/i18n/\*\*・compiler/test/render3/view/i18n\_spec.ts | i18n\|I18n\|Xliff\|Xmb\|Xtb\|MessageBundle\|TranslationBundle\|digest\|Extractor | 121（ほかに pending 12） | 0.8s |
| `//packages/compiler-cli/test/compliance/full:full（2 shard）` | compiler-cli/test/compliance/test\_cases/r3\_view\_compiler\_i18n/\*\* | r3\_view\_compiler\_i18n | 90（45 + 45） | 2.2s |
| `//packages/compiler-cli/test/compliance/linked:linked（2 shard）` | 同上の GOLDEN\_PARTIAL.js | r3\_view\_compiler\_i18n | 83（41 + 42） | 1.3s |
| `//packages/compiler-cli/test/compliance/test_cases:r3_view_compiler_i18n/icu_logic.golden_test` | icu\_logic/GOLDEN\_PARTIAL.js | （なし） | （diff のテスト） | 0.4s |
| `//packages/core/test/render3:render3` | core/test/render3/i18n/\*\_spec.ts | i18n\|I18n | 45 | 0.9s |
| `//packages/core/test/acceptance:acceptance` | core/test/acceptance/i18n\_spec.ts | runtime i18n | 130 | 1.6s |
| `//packages/common/test:test` | common/test/i18n/\*・common/test/pipes/i18n\_\*\_spec.ts | I18nPluralPipe\|I18nSelectPipe\|Format date\|Format number\|locale data api\|l10n | 91 | 0.9s |
| `//packages/localize/src/utils/test:test` | localize/src/utils/test/{messages,translations}\_spec.ts | （なし） | 41 | 0.3s |
| `//packages/localize/src/localize/test:test` | localize/src/localize/test/localize\_spec.ts | （なし） | 9 | 0.3s |
| `//packages/localize/test:test` | localize/test/translate\_spec.ts | （なし） | 5 | 0.4s |
| `//packages/localize/schematics/ng-add:test` | localize/schematics/ng-add/index\_spec.ts | （なし） | 15 | 0.4s |
| `//packages/localize/tools/test:test（4 shard）` | localize/tools/test/\*\*（integration/ を除く） | （なし） | 633（159 + 158 + 158 + 158） | 1.2s |
| `//packages/localize/tools/test/extract/integration:integration` | tools/test/extract/integration/main\_spec.ts | （なし） | 21 | 0.6s |
| `//packages/localize/tools/test/translate/integration:integration` | tools/test/translate/integration/main\_spec.ts | （なし） | 5 | 0.6s |
| `//packages/localize/tools/test/migrate/integration:integration` | tools/test/migrate/integration/main\_spec.ts | （なし） | 5 | 0.4s |

時間は bazel が出す「PASSED in」で、ビルド済みのあとの 2 回目以降です。初回はビルドが入るので、LOC-COMMON の基準の実行（`//packages/localize/...` と compiler・render3・compliance/full を一度に）では compliance/full が 22.2 秒でした。「Ran N of M」の M は jasmine が数えた数をそのまま写すもので、compiler は「Ran 121 of 403」、acceptance は「Ran 130 of 2693」でした。

## 4. コンプライアンステスト：TEST\_CASES.json から it ができるまで

📄 `angular/packages/compiler-cli/test/compliance/full/BUILD.bazel` L1–21 （▶ の行: 6, 14, 17–18, 20）

```python
 1 │ load("//tools:defaults.bzl", "jasmine_test", "ts_project")
 2 │ 
 3 │ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = ["full_compile_spec.ts"],
 7 │     deps = [
 8 │         "//packages/compiler-cli/src/ngtsc/file_system",
 9 │         "//packages/compiler-cli/test/compliance/test_helpers",
10 │     ],
11 │ )
12 │ 
13 │ jasmine_test(
14 ▶     name = "full",
15 │     data = [
16 │         ":test_lib",
17 ▶         "//packages/compiler-cli/test/compliance/test_cases",
18 ▶         "//packages/core:npm_package",
19 │     ],
20 ▶     shard_count = 2,
21 │ )
```

📄 `angular/packages/compiler-cli/test/compliance/full/full_compile_spec.ts` L8–23 （▶ の行: 13, 21–22）

```ts
 8 │ import {FileSystem} from '../../../src/ngtsc/file_system';
 9 │ import {CompileResult, compileTest} from '../test_helpers/compile_test';
10 │ import {ComplianceTest} from '../test_helpers/get_compliance_tests';
11 │ import {runTests} from '../test_helpers/test_runner';
12 │ 
13 ▶ runTests('full compile', compileTests);
14 │ 
15 │ /**
16 │  * Fully compile all the input files in the given `test`.
17 │  *
18 │  * @param fs The mock file-system where the input files can be found.
19 │  * @param test The compliance test whose input files should be compiled.
20 │  */
21 ▶ function compileTests(fs: FileSystem, test: ComplianceTest): CompileResult {
22 ▶   return compileTest(fs, test.inputFiles, test.compilerOptions, test.angularCompilerOptions);
23 │ }
```

`full` のターゲットの spec は 6 行目の 1 ファイルだけです。17 行目で `test_cases` の全部をデータとして渡し、13 行目で `runTests('full compile', …)` を呼ぶだけ。22 行目の `compileTest` が、テストケースの .ts を ngtsc で本当にコンパイルします。i18n のテストケースは `test_cases/r3_view_compiler_i18n/` の下の 12 の `TEST_CASES.json` に、合わせて 90 件あります（`node` で数えました）。

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/get_compliance_tests.ts` L43–70 （▶ の行: 45, 47–49, 53, 62, 64）

```ts
43 │ export function* getComplianceTests(absTestConfigPath: AbsoluteFsPath): Generator<ComplianceTest> {
44 │   const realTestPath = fs.dirname(absTestConfigPath);
45 ▶   const testConfigJSON = loadTestCasesFile(fs, absTestConfigPath, basePath).cases;
46 │   const testConfig = Array.isArray(testConfigJSON) ? testConfigJSON : [testConfigJSON];
47 ▶   for (const test of testConfig) {
48 ▶     const inputFiles = getStringArrayOrDefault(test, 'inputFiles', realTestPath, ['test.ts']);
49 ▶     const compilationModeFilter = getStringArrayOrDefault(
50 │       test,
51 │       'compilationModeFilter',
52 │       realTestPath,
53 ▶       ['linked compile', 'full compile', 'declaration-only emit', 'instruction compile'],
54 │     ) as CompilationMode[];
55 │ 
56 │     yield {
57 │       relativePath: fs.relative(basePath, realTestPath),
58 │       realTestPath,
59 │       description: getStringOrFail(test, 'description', realTestPath),
60 │       inputFiles,
61 │       compilationModeFilter,
62 ▶       expectations: parseExpectations(test.expectations, realTestPath, inputFiles),
63 │       compilerOptions: getConfigOptions(test, 'compilerOptions', realTestPath),
64 ▶       angularCompilerOptions: getConfigOptions(test, 'angularCompilerOptions', realTestPath),
65 │       skipForTemplatePipeline: test.skipForTemplatePipeline,
66 │       focusTest: test.focusTest,
67 │       excludeTest: test.excludeTest,
68 │     };
69 │   }
70 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/get_compliance_tests.ts` L137–158 （▶ の行: 143–146, 149, 153, 155）

```ts
137 │ function parseExpectations(
138 │   value: any,
139 │   testPath: AbsoluteFsPath,
140 │   inputFiles: string[],
141 │ ): Expectation[] {
142 │   const defaultFailureMessage = 'Incorrect generated output.';
143 ▶   const tsFiles = inputFiles.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
144 ▶   const defaultFiles = tsFiles.map((inputFile) => {
145 ▶     const outputFile = inputFile.replace(/\.ts$/, '.js');
146 ▶     return {expected: outputFile, generated: outputFile};
147 │   });
148 │ 
149 ▶   if (typeof value === 'undefined') {
150 │     return [
151 │       {
152 │         failureMessage: defaultFailureMessage,
153 ▶         files: defaultFiles,
154 │         expectedErrors: [],
155 ▶         extraChecks: [],
156 │       },
157 │     ];
158 │   }
```

1. **47 行目：cases の 1 件が 1 つのテスト**

   48 行目、`inputFiles` を書かなければ `test.ts`。
2. **49〜54 行目：どのモードで走らせるか**

   既定は 53 行目の 4 つ（linked・full・declaration-only・instruction）。既定に入っていない local compile は、書いたときだけ走ります。
3. **62 行目・143〜157 行目：期待の既定**

   `expectations` を書かなければ、入力の `.ts` ごとに、同じ名前の `.js` を「期待するファイル」と「出力のファイル」の両方にした 1 件になります（144〜147 行目）。extraChecks は空です（155 行目）。
4. **64 行目：angularCompilerOptions**

   `enableI18nLegacyMessageIdFormat` や `i18nNormalizeLineEndingsInICUs` を、そのテストケースだけに渡せます（[第 8 回](08-loc-compiler-options.md)）。

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/test_runner.ts` L58–79 （▶ の行: 58, 60–61, 68–70, 78–79）

```ts
58 ▶   describe(`compliance tests (${type})`, () => {
59 │     let counter = 0;
60 ▶     for (const test of getAllComplianceTests()) {
61 ▶       if (!test.compilationModeFilter.includes(type)) {
62 │         continue;
63 │       }
64 │       if (test.skipForTemplatePipeline) {
65 │         continue;
66 │       }
67 │ 
68 ▶       describe(`[${test.relativePath}]/${counter++}`, () => {
69 ▶         const itFn = test.focusTest ? fit : test.excludeTest ? xit : it;
70 ▶         itFn(test.description, () => {
71 │           if (type === 'linked compile' && test.compilerOptions?.['target'] === 'ES5') {
72 │             throw new Error(
73 │               `The "${type}" scenario does not support ES5 output.\n` +
74 │                 `Did you mean to set \`"compilationModeFilter": ["full compile"]\` in "${test.relativePath}"?`,
75 │             );
76 │           }
77 │ 
78 ▶           const fs = initMockTestFileSystem(test.realTestPath);
79 ▶           const {errors, emittedFiles} = compileFn(fs, test);
```

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/test_runner.ts` L80–110 （▶ の行: 80, 82, 95–96, 100–101）

```ts
 80 ▶           for (const expectation of test.expectations) {
 81 │             transformExpectation(expectation, !!options.isLocalCompilation);
 82 ▶             if (expectation.expectedErrors.length > 0) {
 83 │               checkErrors(
 84 │                 test.relativePath,
 85 │                 expectation.failureMessage,
 86 │                 expectation.expectedErrors,
 87 │                 errors,
 88 │               );
 89 │             } else if (options.checkErrorsOnly) {
 90 │               checkNoUnexpectedErrors(test.relativePath, errors);
 91 │             } else if (!!options.emitDeclarationOnly) {
 92 │               checkNoUnexpectedErrors(test.relativePath, errors);
 93 │               checkTypeDeclarations(fs, emittedFiles);
 94 │             } else {
 95 ▶               checkNoUnexpectedErrors(test.relativePath, errors);
 96 ▶               checkExpectations(
 97 │                 fs,
 98 │                 test.relativePath,
 99 │                 expectation.failureMessage,
100 ▶                 expectation.files,
101 ▶                 expectation.extraChecks,
102 │                 options.skipMappingChecks,
103 │               );
104 │             }
105 │           }
106 │         });
107 │       });
108 │     }
109 │   });
110 │ }
```

58 行目の describe が「compliance tests (full compile)」、68 行目の describe が「\[r3\_view\_compiler\_i18n/icu\_logic\]/123」のようなパスと通し番号、70 行目の it が `description` です。だから `--filter=r3_view_compiler_i18n` で i18n のテストケースだけに絞れます。61 行目でモードに合わないものは飛ばし、69 行目の `focusTest` / `excludeTest` が `fit` / `xit` になります。78〜79 行目でメモリの上のファイルシステムに入力を置いてコンパイルし、82 行目で「エラーを期待する」か、96〜103 行目で「出力をゴールデンと比べる」かに分かれます。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_i18n/TEST_CASES.json` L1–27 （▶ の行: 2, 5–6, 9, 22–24）

```json
 1 │ {
 2 ▶   "$schema": "../test_case_schema.json",
 3 │   "cases": [
 4 │     {
 5 ▶       "description": "should allow repeating the same placeholder",
 6 ▶       "inputFiles": ["repeated_placeholder.ts"],
 7 │       "expectations": [
 8 │         {
 9 ▶           "extraChecks": ["verifyPlaceholdersIntegrity", "verifyUniqueConsts"]
10 │         }
11 │       ]
12 │     },
13 │     {
14 │       "description": "should support i18n message with multiple pipes",
15 │       "inputFiles": ["multiple_pipes.ts"],
16 │       "expectations": [
17 │         {
18 │           "extraChecks": ["verifyPlaceholdersIntegrity", "verifyUniqueConsts"]
19 │         }
20 │       ]
21 │     },
22 ▶     {
23 ▶       "description": "should support i18n nodes with ICUs inside",
24 ▶       "inputFiles": ["icu_and_i18n.ts"]
25 │     }
26 │   ]
27 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_i18n/localize_legacy_message_ids/TEST_CASES.json` L1–30 （▶ の行: 9–10, 12–14, 18–21, 24–26）

```json
 1 │ {
 2 │   "$schema": "../../test_case_schema.json",
 3 │   "cases": [
 4 │     {
 5 │       "description": "should add legacy message ids if `enableI18nLegacyMessageIdFormat` is true",
 6 │       "inputFiles": [
 7 │         "legacy_enabled.ts"
 8 │       ],
 9 ▶       "angularCompilerOptions": {
10 ▶         "enableI18nLegacyMessageIdFormat": true
11 │       },
12 ▶       "compilationModeFilter": [
13 ▶         "full compile",
14 ▶         "declaration-only emit"
15 │       ],
16 │       "expectations": [
17 │         {
18 ▶           "files": [
19 ▶             {
20 ▶               "generated": "legacy_enabled.js",
21 ▶               "expected": "legacy_enabled.js"
22 │             }
23 │           ],
24 ▶           "extraChecks": [
25 ▶             "verifyPlaceholdersIntegrity",
26 ▶             "verifyUniqueConsts"
27 │           ]
28 │         }
29 │       ]
30 │     },
```

いちばん上の `TEST_CASES.json` は 3 件で、22〜25 行目の 3 件目は `expectations` を書いていないので、`icu_and_i18n.ts` の出力を `icu_and_i18n.js` と比べるだけです。`localize_legacy_message_ids` の 1 件目は、9〜11 行目で `enableI18nLegacyMessageIdFormat: true` を渡し、12〜15 行目で full と declaration-only だけで走らせます。linked では走らないので、手元の linked の本数（83）は full（90）より少なくなりました。24〜27 行目の `extraChecks` は 5 節の 2 つの関数の名前です。

## 5. ゴールデンの .js の読み方

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/check_expectations.ts` L46–66 （▶ の行: 48–49, 55–56, 61）

```ts
46 │   const builtDirectory = getBuildOutputDirectory(fs);
47 │   for (const expectedFile of expectedFiles) {
48 ▶     const expectedPath = fs.resolve(getRootDirectory(fs), expectedFile.expected);
49 ▶     if (!fs.exists(expectedPath)) {
50 │       throw new Error(
51 │         `The expected file at ${expectedPath} does not exist. Please check the TEST_CASES.json file for this test case.`,
52 │       );
53 │     }
54 │ 
55 ▶     const generatedPath = fs.resolve(builtDirectory, expectedFile.generated);
56 ▶     if (!fs.exists(generatedPath)) {
57 │       const error = new Error(
58 │         `The generated file at ${generatedPath} does not exist.\n` +
59 │           'Perhaps there is no matching input source file in the TEST_CASES.json file for this test case.\n' +
60 │           'Or maybe you need to regenerate the GOLDEN_PARTIAL.js file by running:\n\n' +
61 ▶           `    pnpm bazel run //packages/compiler-cli/test/compliance/test_cases:${testPath}.golden`,
62 │       );
63 │       // Clear the stack so that we get a nice error message
64 │       error.stack = '';
65 │       throw error;
66 │     }
```

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/check_expectations.ts` L67–88 （▶ の行: 67–70, 79, 86）

```ts
67 ▶     const generated = fs.readFile(generatedPath);
68 ▶     let expected = fs.readFile(expectedPath);
69 ▶     expected = replaceMacros(expected);
70 ▶     expected = stripAndCheckMappings(
71 │       fs,
72 │       generated,
73 │       generatedPath,
74 │       expected,
75 │       expectedPath,
76 │       /** skipMappingCheck */ !!skipMappingCheck,
77 │     );
78 │ 
79 ▶     expectEmit(
80 │       generated,
81 │       expected,
82 │       `When checking against expected file "${testPath}/${expectedFile.expected}"\n` +
83 │         failureMessage,
84 │     );
85 │ 
86 ▶     runExtraChecks(testPath, generated, extraChecks);
87 │   }
88 │ }
```

1. **48・55 行目：期待するファイルと出力のファイル**

   期待するファイルはテストケースのフォルダ（例 `multiple_pipes.js`）、出力はコンパイルした結果のフォルダの同じ名前です。
2. **69 行目：マクロを展開する**

   期待するファイルの `__i18nMsg__(…)` を、下の `i18nMsg` が作るコードに置き換えます。
3. **70〜77 行目：ソースマップの印を外して確かめる**

   行末の `// SOURCE:` の印があれば、その対応を確かめてから印を消します。
4. **79〜84 行目：expectEmit で比べる**

   README の「Expected file format」の節（[contrib-reading-specs](../contrib/06-contrib-reading-specs.md) で引用）のとおり、空白の違いを無視し、`…` の所は飛ばし、`$r3$` や `$I18N_0$` のように `$` で囲んだ名前はどんな識別子とも一致する（ただしファイルの中で同じ名前は同じ識別子）比べ方です。
5. **86 行目：extraChecks**

   名前で選んだ関数を、出力の全文に当てます。

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/expected_file_macros.ts` L19–31 （▶ の行: 23, 25–29）

```ts
19 │ const EXPECTED_FILE_MACROS: [RegExp, (...args: string[]) => string][] = [
20 │   [
21 │     // E.g. `__i18nMsg__('message string', [ ['placeholder', 'pair']
22 │     // ], {original_code: {'placeholder': '{{ foo }}'}}, {meta: 'properties'})`
23 ▶     macroFn(/__i18nMsg__/, stringParam(), arrayParam(), objectParam(), objectParam()),
24 │     (_match, message, placeholders, options, meta) =>
25 ▶       i18nMsg(
26 ▶         message,
27 ▶         parsePlaceholders(placeholders),
28 ▶         parseOptions(options),
29 ▶         parseMetaProperties(meta),
30 │       ),
31 │   ],
```

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/i18n_helpers.ts` L19–43 （▶ の行: 28, 31, 33–34, 36–37, 41）

```ts
19 │ /**
20 │  * Generate a string that represents expected i18n block content for a simple message.
21 │  */
22 │ export function i18nMsg(
23 │   message: string,
24 │   placeholders: Placeholder[],
25 │   options: Options,
26 │   meta: Meta,
27 │ ): string {
28 ▶   const varName = `$I18N_${msgIndex++}$`;
29 │   const closurePlaceholders = i18nPlaceholdersToString(placeholders);
30 │   const closureOptions = i18nOptionsToString(options);
31 ▶   const locMessageWithPlaceholders = i18nMsgInsertLocalizePlaceholders(message, placeholders);
32 │   return `
33 ▶     let ${varName};
34 ▶     if (typeof ngI18nClosureMode !== "undefined" && ngI18nClosureMode) {
35 │         ${i18nMsgClosureMeta(meta)}
36 ▶         const $MSG_EXTERNAL_${msgIndex}$ = /* @ts-ignore */ goog.getMsg("${message}"${closurePlaceholders}${closureOptions});
37 ▶         ${varName} = $MSG_EXTERNAL_${msgIndex}$;
38 │     }
39 │     else {
40 │       /* @ts-ignore */
41 ▶       ${varName} = $localize \`${i18nMsgLocalizeMeta(meta)}${locMessageWithPlaceholders}\`;
42 │     }`;
43 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/i18n_helpers.ts` L111–125 （▶ の行: 116, 119–121）

```ts
111 │ /**
112 │  * Transform a message in a Closure format to a $localize version.
113 │  */
114 │ function i18nMsgInsertLocalizePlaceholders(message: string, placeholders: Placeholder[]): string {
115 │   if (placeholders.length > 0) {
116 ▶     message = message.replace(/{\$(.*?)}/g, function (_, name) {
117 │       const placeholder = placeholders.find((p) => p[0] === name)!;
118 │       // e.g. startDivTag -> START_DIV_TAG
119 ▶       const key = name.replace(/[A-Z]/g, (ch: string) => '_' + ch).toUpperCase();
120 ▶       const associated = placeholder.length === 3 ? `@@${placeholder[2]}` : '';
121 ▶       return '$' + `{${quotedValue(placeholder[1])}}:${key}${associated}:`;
122 │     });
123 │   }
124 │   return message;
125 │ }
```

たとえば `multiple_pipes.js` の 2 行目は ``__i18nMsg__('{$interpolation} and {$interpolation_1}', [['interpolation', String.raw`�0�`], …], {original_code: …}, {})`` です。23 行目でこの形を見つけ、25 行目の `i18nMsg` が 32〜42 行目のコードに展開します。**1 つのメッセージから、出力の 2 つの枝を両方作る**のがこのマクロの仕事で、34〜38 行目が Closure の `goog.getMsg` の枝、39〜42 行目が `$localize` の枝です（2 つの枝は[第 6 回](06-loc-const-collection.md)）。`$localize` の側のプレースホルダーは 116〜121 行目で作ります。`{$interpolation_1}` は 119 行目で `INTERPOLATION_1` になり、121 行目で `${"�1�"}:INTERPOLATION_1:` の形になります。28 行目の変数名が `$I18N_0$` のように `$` で囲まれているので、コンパイラが付けた本当の名前（`i18n_0` など）と一致します。

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/check_expectations.ts` L16–25 （▶ の行: 16, 21–22）

```ts
16 ▶ import {verifyPlaceholdersIntegrity, verifyUniqueConsts} from './i18n_checks';
17 │ import {stripAndCheckMappings} from './sourcemap_helpers';
18 │ 
19 │ type ExtraCheckFunction = (generated: string, ...extraArgs: any[]) => boolean;
20 │ const EXTRA_CHECK_FUNCTIONS: Record<string, ExtraCheckFunction> = {
21 ▶   verifyPlaceholdersIntegrity,
22 ▶   verifyUniqueConsts,
23 │   verifyUniqueFactory,
24 │   verifyUniqueFunctions,
25 │ };
```

📄 `angular/packages/compiler-cli/test/compliance/test_helpers/i18n_checks.ts` L8–44 （▶ の行: 8–9, 15, 18–20, 31, 37–38）

```ts
 8 ▶ const EXTRACT_GENERATED_TRANSLATIONS_REGEXP =
 9 ▶   /const\s*(.*?)\s*=\s*goog\.getMsg\("(.*?)",?\s*(.*?)\)/g;
10 │ 
11 │ /**
12 │  * Verify that placeholders in translation strings match placeholders in the object defined in the
13 │  * `goog.getMsg()` function arguments.
14 │  */
15 ▶ export function verifyPlaceholdersIntegrity(output: string): boolean {
16 │   const translations = extractTranslations(output);
17 │   for (const [msg, args] of translations) {
18 ▶     const bodyPhs = extractPlaceholdersFromMsg(msg);
19 ▶     const argsPhs = extractPlaceholdersFromArgs(args);
20 ▶     if (bodyPhs.size !== argsPhs.size || diff(bodyPhs, argsPhs).size) {
21 │       return false;
22 │     }
23 │   }
24 │   return true;
25 │ }
26 │ 
27 │ /**
28 │  * Verify that all the variables initialized with `goog.getMsg()` calls have
29 │  * unique names.
30 │  */
31 ▶ export function verifyUniqueConsts(output: string): boolean {
32 │   extract(
33 │     output,
34 │     EXTRACT_GENERATED_TRANSLATIONS_REGEXP,
35 │     (current: string[], state: Set<string>): string => {
36 │       const key = current[1];
37 ▶       if (state.has(key)) {
38 ▶         throw new Error(`Duplicate const ${key} found in generated output!`);
39 │       }
40 │       return key;
41 │     },
42 │   );
43 │   return true;
44 │ }
```

i18n 用の 2 つの extraChecks は、どちらも 8〜9 行目の正規表現で出力の `goog.getMsg("…", {…})` を拾います。`verifyPlaceholdersIntegrity` は 18〜20 行目で、文の中の `{$…}` の名前と、第 2 引数のオブジェクトのキーが同じ集合かを比べます。`verifyUniqueConsts` は 37〜38 行目で、`const MSG_… = goog.getMsg` の変数名が重なっていれば投げます。どちらも Closure の枝しか見ないので、`$localize` の枝のプレースホルダーは、ゴールデンとの比べ合わせ（`expectEmit`）だけで確かめられます。

## 6. ゴールデンを作り直す手順

📄 `angular/packages/compiler-cli/test/compliance/README.md` L171–194 （▶ の行: 173, 176, 178–179, 184, 193）

````md
171 │ ## Updating a golden partial file
172 │ 
173 ▶ There is one golden partial file per `TEST_CASES.json` file. So even if this file defines multiple
174 │ test-cases, which each contain multiple input files, there will only be one golden file.
175 │ 
176 ▶ The golden file is generated by the tooling and should not be modified manually.
177 │ 
178 ▶ When you first create a test-case, with an empty `GOLDEN_PARTIAL.js` file, or a change is made to
179 ▶ the generated partial output, we must update the `GOLDEN_PARTIAL.js` file.
180 │ 
181 │ This is done by running a specific bazel rule of the form:
182 │ 
183 │ ```sh
184 ▶ bazel run //packages/compiler-cli/test/compliance/test_cases:<path/to/test_case>.golden
185 │ ```
186 │ 
187 │ where to replace `<path/to/test_case>` with the path (relative to `test_cases`) of the directory
188 │ that contains the `GOLDEN_PARTIAL.js` to update.
189 │ 
190 │ To update all golden partial files, the following command can be run:
191 │ 
192 │ ```sh
193 ▶ node packages/compiler-cli/test/compliance/update_all_goldens.js
194 │ ```
````

📄 `angular/packages/compiler-cli/test/compliance/partial/partial_compliance_goldens.bzl` L27–48 （▶ の行: 28–29, 31, 39, 41, 46–47）

```python
27 │     js_run_binary(
28 ▶         name = "_generated_%s" % path,
29 ▶         tool = generate_partial_name,
30 │         testonly = True,
31 ▶         outs = ["%s/_generated.js" % path],
32 │         # Relativize execpath to be relative to bazel-bin (bazel-out/k8-fastbuild/bin).
33 │         args = ["../../../$(@)"],
34 │         visibility = [":__pkg__"],
35 │         mnemonic = "GeneratePartialGolden",
36 │         progress_message = "Generating partial golden: %{label}",
37 │     )
38 │ 
39 ▶     write_source_file(
40 │         visibility = ["//visibility:public"],
41 ▶         name = "%s.golden" % path,
42 │         tags = [
43 │             "partial-golden-compliance-test",
44 │         ],
45 │         testonly = True,
46 ▶         out_file = "//packages/compiler-cli/test/compliance/test_cases:%s/GOLDEN_PARTIAL.js" % path,
47 ▶         in_file = "_generated_%s" % path,
48 │     )
```

1. **ゴールデンは 2 種類ある**

   手で書く「期待するファイル」（`icu_and_i18n.js` など）と、ツールが書く `GOLDEN_PARTIAL.js`（部分コンパイルの出力。`TEST_CASES.json` 1 つに 1 つ。README の 173 行目）です。176 行目のとおり、後者は手で直しません。
2. **28〜31 行目：部分コンパイルの出力を bazel-bin に作る**

   `_generated_r3_view_compiler_i18n/icu_logic` のようなターゲットが `_generated.js` を書きます。
3. **39〜47 行目：write\_source\_file**

   41 行目の `<パス>.golden` を `bazel run` すると、47 行目の生成物で 46 行目の `GOLDEN_PARTIAL.js` を**ソースの木の中で上書き**します。同時に「生成物と今のファイルが同じか」の `.golden_test`（`_diff_test`）ができ、`bazel test` で確かめられます。
4. **全部まとめて作り直すなら**

   README の 192〜194 行目の `update_all_goldens.js`。中身は `_write_source_file` の種類のターゲットを query して、1 つずつ `bazel run` するものです。

📄 `ターミナル`

```
cd ../angular
# 読むだけの query（bazel run はしない。.golden の run は ../angular のファイルを書き換える）
pnpm bazel query 'tests(//packages/compiler-cli/test/compliance/test_cases:*)' | grep i18n
pnpm bazel test //packages/compiler-cli/test/compliance/test_cases:r3_view_compiler_i18n/icu_logic.golden_test \
  //packages/compiler-cli/test/compliance/linked:linked '--test_arg=--filter=r3_view_compiler_i18n' --nocache_test_results
```

📄 `出力（2026-11-03。ログは scratchpad/i18n-logs/e-golden.log）`

```
_diff_test rule //packages/compiler-cli/test/compliance/test_cases:r3_view_compiler_i18n.golden_test
_diff_test rule //packages/compiler-cli/test/compliance/test_cases:r3_view_compiler_i18n/blocks.golden_test
_diff_test rule //packages/compiler-cli/test/compliance/test_cases:r3_view_compiler_i18n/element_attributes.golden_test
...（ほかに es5_support・icu_logic・line_ending_normalization・localize_legacy_message_ids・namespaces・
     nested_nodes・ng-container_ng-template・self-closing_i18n_instructions・whitespace_preserving_mode。合わせて 12）

//packages/compiler-cli/test/compliance/test_cases:r3_view_compiler_i18n/icu_logic.golden_test PASSED in 0.4s
//packages/compiler-cli/test/compliance/linked:linked                    PASSED in 3.2s
```

> [!WARNING]
> **ハマりどころ**
>
> `bazel run …:<パス>.golden` と `update_all_goldens.js` は ../angular の `GOLDEN_PARTIAL.js` を書き換えます。このシリーズは ../angular を変えないので、手元では `.golden_test` を `bazel test` で走らせる（同じかどうかを見るだけ）までにしました。出力を変える修正をしたら、手で書く期待するファイルを直し、`.golden` を run して `GOLDEN_PARTIAL.js` を作り直し、full と linked の両方を走らせる、の順です。

## 7. localize/tools の spec の助け：ファイルシステムを差し替える

📄 `angular/packages/localize/tools/test/helpers/index.ts` L8–25 （▶ の行: 8–9, 14, 18–23）

```ts
 8 ▶ import {InvalidFileSystem, setFileSystem} from '@angular/compiler-cli/src/ngtsc/file_system';
 9 ▶ import {MockFileSystemNative} from '@angular/compiler-cli/src/ngtsc/file_system/testing';
10 │ 
11 │ /**
12 │  * Only run these tests on the "native" file-system.
13 │  *
14 ▶  * Babel uses the `path.resolve()` function internally, which makes it very hard to mock out the
15 │  * file-system from the outside. We run these tests on Unix and Windows in our CI jobs, so there is
16 │  * test coverage.
17 │  */
18 ▶ let counter = 0;
19 ▶ export function runInNativeFileSystem(label: string, callback: () => void) {
20 ▶   describe(`<<FileSystem: Native>>/${label}`, () => {
21 ▶     beforeEach(() => setFileSystem(new MockFileSystemNative()));
22 ▶     afterEach(() => setFileSystem(new InvalidFileSystem()));
23 ▶     callback();
24 │   });
25 │ }
```

tools のコードはファイルを `getFileSystem()` 越しに読み書きします（[第 18 回](18-loc-translate-tool.md)の 1 節の 93〜94 行目で本物を置いていた）。spec は 2 通りに差し替えます。

- **`runInEachFileSystem`**（compiler-cli の file\_system/testing）：同じ describe を、Unix・Windows・OS X の形の偽物のファイルシステムでそれぞれ走らせます。ローダーやハンドラー、出力のパスの spec がこれで、1 つの it が数回走るので本数が増えます。
- **`runInNativeFileSystem`**（19〜25 行目）：14〜16 行目のコメントのとおり、Babel は中で `path.resolve()` を使うので偽物にできません。だから Babel を使う spec（プラグイン・source\_file\_utils・integration）は、21 行目で今の OS の形の `MockFileSystemNative` だけにし、22 行目で終わったら `InvalidFileSystem`（使うと投げる）に戻します。describe の名前に「&lt;&lt;FileSystem: Native&gt;&gt;/」が付くのは 20 行目です。

18 行目の `counter` はこのファイルの中で使われていません。

## テストと直し方

### 変える場所ごとの入口

1. **テンプレートから $localize までの出力を変える**

   compiler の `src/template/pipeline/` の i18n の段か `src/render3/view/i18n/`。まず `test/render3/view/i18n_spec.ts`（`//packages/compiler/test:test`）で 1 本、次に出力の形を `r3_view_compiler_i18n/` のテストケースに足す（`TEST_CASES.json` に 1 件と .ts と期待する .js）。full と linked と `.golden_test` の 3 つが通ること。
2. **実行時の解析や DOM を変える**

   core の `src/render3/i18n/`。小さい単位は `test/render3/i18n/`、コンポーネントで確かめるなら acceptance の i18n\_spec.ts に `loadTranslations` → `initWithTemplate` → `innerHTML` の it を足す。acceptance は大きいので、必ず `--filter` で絞る。
3. **翻訳ファイルや差し込みのツールを変える**

   `localize/tools/src/`。その関数の spec（第 17・18 回の表）に it を足し、`//packages/localize/tools/test:test` を 4 つの shard の合計で読む。ファイルの出入りが絡むなら integration のターゲットも。
4. **ロケールのデータや pipe を変える**

   common の `src/i18n/`。`//packages/common/test:test`。

どの場合も、本家に PR を出すことは勧めません。手元で spec を足して走らせ、今の振る舞いを自分の目で確かめるところまでにします。i18n の issue の一覧と、それを読むときに開く章は[第 20 回](20-loc-issues.md)です。

## 聞かれそうな質問

**Q. --filter を付けたら PASSED でした。これで確かめたことになりますか？**

なりません。0 本に一致しても PASSED です。出力の「Ran N of M specs」の N を見て、shard のあるターゲット（`localize/tools/test:test` は 4、compliance の full と linked は 2）では全部の shard の N を足します。

**Q. translate/integration の spec は //packages/localize/tools/test:test に入っていますか？**

入っていません。tools/test/BUILD.bazel の 6〜8 行目の `glob(["**/*.ts"])` は、下に別の BUILD.bazel のあるフォルダに入らないので、`//packages/localize/tools/test/translate/integration:integration` という別のターゲットです（1 節の query の結果にも別に並んでいます）。

**Q. コンプライアンステストのゴールデンで、変数名が少し違っても通るのはなぜ？**

期待するファイルの `$I18N_0$` のような `$` で囲んだ名前は、どの識別子とも一致する（ただしファイルの中で一貫している）比べ方だからです（README の「Identifier tolerant」。[contrib-reading-specs](../contrib/06-contrib-reading-specs.md)）。i18n のマクロは 28 行目でこの形の名前を使い、2 つの枝のコードを作ります。

**Q. GOLDEN\_PARTIAL.js を手で直してもいいですか？**

いけません（README の 176 行目）。`bazel run //packages/compiler-cli/test/compliance/test_cases:<パス>.golden` で作り直します（184 行目）。作り直したかどうかは `.golden_test` が見ます。

**Q. acceptance の i18n のテストで、翻訳が前のテストに残らないのはなぜ？**

i18n\_spec.ts の 60〜62 行目の `afterEach` で毎回 `clearTranslations()` しているからです。`loadTranslations` は `$localize` のグローバルに翻訳を置くので、消さないと次の it にも効きます（[第 14 回](14-loc-runtime-translations.md)）。

## 読み終えて

- i18n の spec は 5 つのパッケージの 15 ほどのターゲットに分かれる。どれに入るかは各 BUILD.bazel の glob で決まり、別の BUILD.bazel のあるフォルダは別のターゲット。
- --filter は 0 本でも PASSED。「Ran N」を見て、shard のあるものは足す。
- コンプライアンステストは TEST\_CASES.json の 1 件が 1 つの it で、出力を「期待するファイル」とマクロ・`$名前$`・`…` の比べ方で照らす。i18n のマクロは 1 つのメッセージから goog.getMsg と $localize の 2 つの枝を作る。
- GOLDEN\_PARTIAL.js は `.golden` の run で作り直すもので、ソースの木を書き換える。確かめるだけなら `.golden_test`。
- tools の spec は、Babel を使うものだけ本物のファイルシステム（`runInNativeFileSystem`）、それ以外は 3 つの偽物で走る。

---

← 前: [ビルドのあとに翻訳を差し込む：localize-translate](18-loc-translate-tool.md)  
次: [issue と PR を読む：i18n の今](20-loc-issues.md) →
