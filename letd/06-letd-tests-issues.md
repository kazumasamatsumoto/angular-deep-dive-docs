[目次](../README.md) › [@let の内側：字句から LView の枠まで](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：@let を固めているテスト

> lexer・parser・binder の spec、compliance の r3\_view\_compiler\_let（22 項目）、acceptance の let\_spec.ts、platform-server のハイドレーションの spec、ngtsc の型チェックと拡張診断の spec、言語サービスと schematics の spec が、このシリーズの各章の約束をどこで固めているか。15 回の bazel の手元の結果と、runInEachFileSystem で 4 倍になる数え方、@let の issue 22 件と PR の表（分割代入・型注釈の要望、LView の枠の取り違え）、コミットの年ごとの数。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/letd-tests-issues)

---

シリーズの最後に、第 1〜5 回の約束を固めている spec が、どのファイルのどの describe にあり、どの Bazel の target で走るかを地図にします。手元で走らせた数を書き、`@let` に関係する issue 22 件（開いている 3 件、閉じた 19 件。2026-11-16 に gh で取得）を章ごとに振り分けて、閉じ方とコミットの傾向を数で見ます。

読む対象は、compiler の `ml_parser`・`render3` の spec、compliance の `r3_view_compiler_let/TEST_CASES.json`、core の `acceptance/let_spec.ts`、platform-server の `full_app_hydration_spec.ts`、compiler-cli の `template_typecheck_spec.ts` と `typecheck/extended/test/checks/`、language-service の spec です。target の読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. 字句と構文](01-letd-syntax.md)
2. [2. スコープと binder](02-letd-scope.md)
3. [3. テンプレートのパイプライン](03-letd-pipeline.md)
4. [4. 実行時とハイドレーション](04-letd-runtime.md)
5. [5. 型チェックと診断](05-letd-typecheck.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

行番号は 8576f161ae4 で `grep -n` したもの、it の数は describe の範囲の `it(` を数えたものです。「× 4」は 2 節の `runInEachFileSystem` で 4 回走るものです。1 つの機能が、字句（compiler）→ 出力の形（compliance）→ 実行時（core）→ サーバーとハイドレーション（platform-server）→ 型チェック（compiler-cli）→ エディタ（language-service）→ 移行（schematics）の 7 か所の spec に分かれています。

| ファイル（packages/ から） | describe / it（行） | 数 | target | 章 |
| --- | --- | --- | --- | --- |
| `compiler/test/ml_parser/lexer_spec.ts` | describe('@let declarations') :1489（:1490 基本〜:1717 終わりの無い宣言・:1735 補間の中） | it 18 | `//packages/compiler/test/ml_parser:ml_parser` | [第 1 回](01-letd-syntax.md) |
| `compiler/test/ml_parser/html_parser_spec.ts` | describe('let declaration') :1266（:1284 位置・:1290 不完全な宣言） | it 5 | `//packages/compiler/test/ml_parser:ml_parser` | [第 1 回](01-letd-syntax.md) |
| `compiler/test/render3/r3_template_transform_spec.ts` | describe('@let declarations') :2790（:2795 値の構文エラー・:2801 値が無い・:2805 ngNonBindable） | it 4 | `//packages/compiler/test/render3:test` | [第 1 回](01-letd-syntax.md) |
| `compiler/test/render3/r3_ast_spans_spec.ts` | describe('@let declaration') :993 | it 1 | `//packages/compiler/test/render3:test` | [第 1 回](01-letd-syntax.md) |
| `compiler/test/render3/view/binding_spec.ts` | :272 ルートの entity・:288 ビューごとのスコープ・:318 式の行き先・:365 this は @let にならない・:382 定義のノード | it 5 | `//packages/compiler/test/render3:test` | [第 2 回](02-letd-scope.md) |
| `compiler-cli/test/compliance/test_cases/r3_view_compiler_let/TEST_CASES.json` | 22 項目（最適化・i18n・pipe・子のビュー・リスナー） | 22 | `//packages/compiler-cli/test/compliance/full:full` | [第 3 回](03-letd-pipeline.md) |
| `compiler-cli/test/compliance/test_cases/r3_view_compiler_listener/TEST_CASES.json` | should not generate restore/reset view when listener does not use @let in the same scope（ce80136e7b9） | 1 | `//packages/compiler-cli/test/compliance/full:full` | [第 3 回](03-letd-pipeline.md) |
| `core/test/acceptance/let_spec.ts` | describe('@let declarations') :25（:150 NG0314・:198 pipe と ChangeDetectorRef・:283 使わない宣言も評価・:392 投影しない・:429 :450 優先順位） | it 16 | `//packages/core/test/acceptance:acceptance` | [第 4 回](04-letd-runtime.md)・[第 2 回](02-letd-scope.md)・[第 3 回](03-letd-pipeline.md) |
| `core/test/acceptance/control_flow_if_spec.ts・control_flow_for_spec.ts` | :881・:1258 根のノード 1 つと @let の投影（c421ffdbfbf） | it 2 | `//packages/core/test/acceptance:acceptance` | [第 4 回](04-letd-runtime.md) |
| `core/test/render3/interfaces/node_spec.ts` | describe('TNodeType') :12（:13 toTNodeTypeAsString） | it 1 | `//packages/core/test/render3:render3` | [第 4 回](04-letd-runtime.md) |
| `platform-server/test/full_app_hydration_spec.ts` | describe('@let') :7697（:7907 :7938 a752178f28b・:7971 4231e8f28ff） | it 9 | `//packages/platform-server/test:test` | [第 4 回](04-letd-runtime.md) |
| `compiler-cli/test/ngtsc/template_typecheck_spec.ts` | describe('@let declarations') :7822（30 個）と :9356 | it 31 × 4 | `//packages/compiler-cli/test/ngtsc:ngtsc` | [第 5 回](05-letd-typecheck.md)・[第 2 回](02-letd-scope.md) |
| `compiler-cli/test/ngtsc/host_bindings_type_check_spec.ts` | :354 テンプレートの @let がホストのバインディングに漏れない | it 1 × 4 | `//packages/compiler-cli/test/ngtsc:ngtsc` | [第 5 回](05-letd-typecheck.md) |
| `compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` | describe('let declarations') :2444 | it 2 | `//packages/compiler-cli/src/ngtsc/typecheck/test:test` | [第 5 回](05-letd-typecheck.md) |
| `compiler-cli/src/ngtsc/typecheck/test/ の 3 ファイル` | get\_symbol\_of\_template\_node :2366（2 個）・completion :74・diagnostics :1506 | it 4 × 4 | `//packages/compiler-cli/src/ngtsc/typecheck/test:test` | [第 5 回](05-letd-typecheck.md) |
| `compiler-cli/src/ngtsc/typecheck/extended/test/checks/unused_let_declaration/unused_let_declaration_spec.ts` | describe('UnusedLetDeclarationCheck') :20 | it 7 × 4 | `//packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/unused_let_declaration:test` | [第 5 回](05-letd-typecheck.md) |
| `compiler-cli/src/ngtsc/typecheck/extended/test/checks/interpolated_signal_not_invoked/interpolated_signal_not_invoked_spec.ts` | describe('@let declarations') :1205（faafd18a4c0） | it 6 × 4 | `//packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/interpolated_signal_not_invoked:test` | [第 5 回](05-letd-typecheck.md) |
| `compiler-cli/src/ngtsc/indexer/test/template_spec.ts` | describe('let declarations') :738 | it 1 × 4 | `//packages/compiler-cli/src/ngtsc/indexer/test:test` | [第 5 回](05-letd-typecheck.md) |
| `language-service/test/ の 5 ファイル` | completions :2185（5 個）・definitions :489・inlay\_hints :151・quick\_info :892（2 個）・references\_and\_rename :1412（4 個） | it 13 | `//packages/language-service/test:test` | [第 5 回](05-letd-typecheck.md) |
| `core/schematics/test/control_flow_migration_spec.ts` | :6411 @let の中で使う CommonModule を消さない（aa285c548c1） | it 1 | `//packages/core/schematics/test:test` | 移行 |
| `core/schematics/migrations/safe-optional-chaining/safe-optional-chaining.spec.ts` | :181 @let の値も書き換える | it 1 | `//packages/core/schematics/migrations/safe-optional-chaining:test` | 移行 |

## 2. spec の 3 つの書き方

### core：TestBed で描いて textContent を見る

📄 `angular/packages/core/test/acceptance/let_spec.ts` L25–56 （▶ の行: 28, 34–35, 38, 45–46, 49–50）

```ts
25 │ describe('@let declarations', () => {
26 │   beforeEach(() => {
27 │     TestBed.configureTestingModule({
28 ▶       providers: [provideZoneChangeDetection()],
29 │     });
30 │   });
31 │   it('should update the value of a @let declaration over time', () => {
32 │     @Component({
33 │       template: `
34 ▶         @let multiplier = 2;
35 ▶         @let result = value * multiplier;
36 │         {{ value }} times {{ multiplier }} is {{ result }}
37 │       `,
38 ▶       changeDetection: ChangeDetectionStrategy.Eager,
39 │     })
40 │     class TestComponent {
41 │       value = 0;
42 │     }
43 │ 
44 │     const fixture = TestBed.createComponent(TestComponent);
45 ▶     fixture.detectChanges();
46 ▶     expect(fixture.nativeElement.textContent).toContain('0 times 2 is 0');
47 │ 
48 │     fixture.componentInstance.value = 1;
49 ▶     fixture.detectChanges();
50 ▶     expect(fixture.nativeElement.textContent).toContain('1 times 2 is 2');
51 │ 
52 │     fixture.componentInstance.value = 2;
53 │     fixture.detectChanges();
54 │     expect(fixture.nativeElement.textContent).toContain('2 times 2 is 4');
55 │   });
56 │ 
```

acceptance の spec は、テンプレートを書いたコンポーネントを TestBed で描き、`detectChanges()` のたびに文字列を見ます。命令の名前は出てきません。28 行目の `provideZoneChangeDetection()` は c3576506b3c（2025-09、zoneless を既定にしたときのテストの更新）で、38 行目の `ChangeDetectionStrategy.Eager`（`Default` の新しい名前）は eae8f7e30b9（2026-03、コンポーネントの既定を OnPush にした）で足された行です。どちらも、プロパティを書き換えて `detectChanges()` する元の書き方のまま動かすためのものです。angular-main では fade609afde・ecbc89b465c（2026-10）でこの形が書き換えられ、let\_spec.ts は 58 行足して 91 行消えています（it は 16 個のまま）。命令の並びそのものを固めているのは compliance の 22 項目で、[第 3 回](03-letd-pipeline.md)で読みました。

### 拡張診断：1 つの検査に 1 つの target

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/unused_let_declaration/BUILD.bazel` L1–27 （▶ の行: 6, 16, 21–22, 25）

```python
 1 │ load("//tools:defaults.bzl", "jasmine_test", "ts_project")
 2 │ 
 3 │ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = ["unused_let_declaration_spec.ts"],
 7 │     deps = [
 8 │         "//:node_modules/typescript",
 9 │         "//packages/compiler",
10 │         "//packages/compiler-cli/src/ngtsc/core:api",
11 │         "//packages/compiler-cli/src/ngtsc/diagnostics",
12 │         "//packages/compiler-cli/src/ngtsc/file_system",
13 │         "//packages/compiler-cli/src/ngtsc/file_system/testing",
14 │         "//packages/compiler-cli/src/ngtsc/testing",
15 │         "//packages/compiler-cli/src/ngtsc/typecheck/extended",
16 ▶         "//packages/compiler-cli/src/ngtsc/typecheck/extended/checks/unused_let_declaration",
17 │         "//packages/compiler-cli/src/ngtsc/typecheck/testing",
18 │     ],
19 │ )
20 │ 
21 ▶ jasmine_test(
22 ▶     name = "test",
23 │     data = [
24 │         ":test_lib",
25 ▶         "//packages/core:npm_package",
26 │     ],
27 │ )
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/unused_let_declaration/unused_let_declaration_spec.ts` L19–45 （▶ の行: 19, 23, 27, 38, 41, 44）

```ts
19 ▶ runInEachFileSystem(() => {
20 │   describe('UnusedLetDeclarationCheck', () => {
21 │     function diagnose(template: string) {
22 │       const fileName = absoluteFrom('/main.ts');
23 ▶       const {program, templateTypeChecker} = setup([
24 │         {
25 │           fileName,
26 │           templates: {
27 ▶             'TestCmp': template,
28 │           },
29 │           source: `
30 │             export class TestCmp {
31 │               eventCallback(value: any) {}
32 │             }
33 │           `,
34 │         },
35 │       ]);
36 │       const sf = getSourceFileOrError(program, fileName);
37 │       const component = getClass(sf, 'TestCmp');
38 ▶       const extendedTemplateChecker = new ExtendedTemplateCheckerImpl(
39 │         templateTypeChecker,
40 │         program.getTypeChecker(),
41 ▶         [unusedLetDeclarationFactory],
42 │         {},
43 │       );
44 ▶       return extendedTemplateChecker.getDiagnosticsForComponent(component);
45 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/unused_let_declaration/unused_let_declaration_spec.ts` L54–65 （▶ の行: 61–64）

```ts
54 │     it('should report a @let declaration that is not used (with other @let declarations)', () => {
55 │       const diags = diagnose(`
56 │         @let used = 1;
57 │         @let unused = 2;
58 │         {{used}}
59 │       `);
60 │ 
61 ▶       expect(diags.length).toBe(1);
62 ▶       expect(diags[0].category).toBe(ts.DiagnosticCategory.Warning);
63 ▶       expect(diags[0].code).toBe(ngErrorCode(ErrorCode.UNUSED_LET_DECLARATION));
64 ▶       expect(getSourceCodeForDiagnostic(diags[0])).toBe('@let unused = 2;');
65 │     });
```

c76b440ac00 は、検査の本体（`checks/unused_let_declaration/`）と spec（`test/checks/unused_let_declaration/`）にそれぞれ `BUILD.bazel` を足しています。spec は 23 行目の `setup` で TestCmp のテンプレートだけを差し替え、38〜43 行目でこの検査 1 つだけを持つ `ExtendedTemplateCheckerImpl` を作ります。63 行目で **code まで比べている**ことに注目してください。ngtsc の `template_typecheck_spec.ts` の `@let` の it の多くは `messageText` だけを比べるので、[第 5 回](05-letd-typecheck.md)の 4 節の NG998005 は spec では見えませんでした。19 行目の `runInEachFileSystem` があるので、7 個の it が 28 回走ります。

### ngtsc の統合テスト：driveDiagnostics

`template_typecheck_spec.ts` は、`env.write('test.ts', …)` で本物に近いファイルを書き、`env.driveDiagnostics()` で ngtsc を通して全部の診断を受け取ります（[ngtsc のテストの環境の章](../ngtsc/19-ngtsc-test-env.md)）。第 5 回で引いた 8340 行目・8536 行目の it がこの形です。1 つの it で TCB の生成から OOB・TemplateSemanticsChecker まで通るので、`@let` の診断の it はほとんどここにあります。

## 3. 手元で走らせた結果

8576f161ae4 の ../angular で、`pnpm bazel test <target> --nocache_test_results --test_output=all "--test_arg=--filter=<filter>"` を 1 つずつ走らせました（2026-11-16）。

| target | filter | 結果 |
| --- | --- | --- |
| `//packages/compiler/test/ml_parser:ml_parser` | `@let\|let declaration` | 23 of 437 specs、0 failures |
| `//packages/compiler/test/render3:test` | `@let\|let declaration` | 10 of 499 specs、0 failures |
| `//packages/compiler-cli/test/compliance/full:full` | `r3_view_compiler_let` | 11 ＋ 11（2 つの shard）of 606 specs、0 failures |
| `//packages/core/test/acceptance:acceptance` | `@let\|let declaration` | 18 of 2693 specs、0 failures |
| `//packages/platform-server/test:test` | `@let` | 9 of 399 specs、0 failures |
| `//packages/compiler-cli/test/ngtsc:ngtsc` | `@let` | 29 ＋ 29 ＋ 33 ＋ 37 = 128（4 つの shard）、0 failures |
| `//packages/compiler-cli/src/ngtsc/typecheck/test:test` | `let declaration` | 18 of 1747 specs、0 failures |
| `//packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/unused_let_declaration:test` | `（なし）` | 28 specs、0 failures |
| `//packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/interpolated_signal_not_invoked:test` | `@let` | 24 of 440 specs、0 failures |
| `//packages/compiler-cli/src/ngtsc/indexer/test:test` | `let declaration` | 4 of 268 specs、0 failures |
| `//packages/language-service/test:test` | `let declaration\|@let` | 4 ＋ 3 ＋ 3 ＋ 3 = 13（4 つの shard）、0 failures |
| `//packages/compiler-cli/test/compliance/full:full` | `does not use @let` | 0 ＋ 1（2 つの shard）、0 failures |
| `//packages/core/test/render3:render3` | `TNodeType` | 1 of 574 specs、0 failures |
| `//packages/core/schematics/test:test` | `@let` | 1（16 の shard のうち 1 つ）、0 failures |
| `//packages/core/schematics/migrations/safe-optional-chaining:test` | `@let` | 1 of 29 specs、0 failures |

- ml\_parser の 23 は lexer\_spec の 18 と html\_parser\_spec の 5、compiler の render3 の 10 は r3\_template\_transform の 4・r3\_ast\_spans の 1・binding\_spec の 5 です。
- compliance の 22 は TEST\_CASES.json の項目の数と同じで、2 つの shard に 11 ずつ分かれました。
- acceptance の 18 は let\_spec の 16 と control\_flow の 2、platform-server の 9 は `describe('@let')` の 9 です。
- ngtsc の 128 は 32 個 × 4、typecheck の 18 は 2 ＋ 4 × 4、拡張診断の 28 と 24 は 7 × 4 と 6 × 4、indexer の 4 は 1 × 4 です。language-service の 13 は × 4 になりません（`runInEachFileSystem` を使っていない）。
- filter が 0 件でも PASSED になるので、表の数と `Ran` の数を見比べました。schematics の 16 の shard のうち 15 は 0 件です。web の suite は走らせていません。

### 新しい本家との違い

angular-main（74961c66242）は 8576f161ae4 から 766 コミット先です。`@let` の見出しを持つコミットは 2 つで、439d495aaa5（#71172、NG8011 が `@let` を数えない）と 9fe64d48d29（2026-10-28、間違った `@let` の参照を `undefined` ではなく invalid の命令にする。[第 3 回](03-letd-pipeline.md)）です。第 4・5 回で読んだ let\_declaration.ts・annotate.ts・let.ts・unused\_let\_declaration/index.ts は差分なし、cleanup.ts は `nextSibling` の読み方の 2 行だけが違い、`cleanupLView` のループは同じでした。template\_semantics\_checker.ts は行がずれ、`ngErrorCode(ErrorCode.WRITE_TO_READ_ONLY_VARIABLE)` は 166 行目にあります。expression.ts は 13618ea5518（2026-09-16）で書き込みの枝が `++`・`--` も扱うようになり、`@let` への `x++` も同じ `illegalWriteToLetDeclaration`（NG8015）を通ります。spec は、full\_app\_hydration\_spec.ts の `describe('@let')` が 7987 行目、template\_typecheck\_spec.ts の `describe('@let declarations')` が 8827 行目へずれています。compliance の項目は 22 のままです。

## 4. issue の表

コーディネータが gh で取った 2 つの一覧（ラベル `let declaration` の 20 件と、題に let を含む 21 件）から `@let` と関係の無いもの（2017 年の 2 件、NgOptimizedImage など）を除き、第 4・5 回を書く途中で gh の検索（読むだけ）で見つけたもの（#71929・#71138・#57160・#56842・#61643・#65491・#62221）を足しました。

| # | 状態 | 作成 → 閉 | 題（言い換え） | 章 | メモ |
| --- | --- | --- | --- | --- | --- |
| #56737 | COMPLETED | 2024-06-27 → 2024-07-01 | ローカルの @let より親のビューの @let が勝つ | [第 2 回](02-letd-scope.md) | 2a1291e942a で直った |
| #56842 | COMPLETED | 2024-07-04 → 2024-07-05 | @if の式で後ろの @let を読んでも NG8016 が出ない | [第 5 回](05-letd-typecheck.md) | d7ab5c3a7bc |
| #56935 | COMPLETED | 2024-07-10 → 2024-07-11 | signal と同じ名前の @let（@let user = user()）を書きたい | [第 2 回](02-letd-scope.md)[第 5 回](05-letd-typecheck.md) | NG8016 になる。JeanMeche さんが this.user() の形の注意を残す |
| #57095 | NOT\_PLANNED | 2024-07-23 → 2024-07-23 | @let user = user() が NG8016 | [第 5 回](05-letd-typecheck.md) | 「設計どおり」として #56935 を案内 |
| #57160 | COMPLETED | 2024-07-27 → 2024-07-30 | ハイドレーションで ASSERTION ERROR（@let が @if を挟む） | [第 4 回](04-letd-runtime.md) | a752178f28b（getFirstNativeNode） |
| #57923 | NOT\_PLANNED | 2024-09-23 → 2024-09-23 | @let で分割代入したい | [第 1 回](01-letd-syntax.md) | alxhub さん「@let は式ではなく文」 |
| #59504 | COMPLETED | 2025-01-13 → 2025-10-27 | @let の値が内部の配列に見える | [第 4 回](04-letd-runtime.md) | #59694（開いたまま）。報告者が閉じたが、最小の形は 22.1.6・22.2.6 で投げる |
| #60100 | COMPLETED | 2025-02-25 → 2025-02-25 | ng-template の中の @let とハイドレーションでエラー | [第 4 回](04-letd-runtime.md) | #59504 の重複として閉じた（reason は COMPLETED） |
| #61643 | COMPLETED | 2025-05-23 → 2025-12-17 | @let の値の中の {{ }} の色付け | [第 5 回](05-letd-typecheck.md) | 9f5744a92dd（TextMate の文法） |
| #62221 | 開 | 2025-06-23 | DevTools で @let の値を見たい | [第 4 回](04-letd-runtime.md) | TNode に名前が残らない（node.ts 844 行目の TODO） |
| #64274 | NOT\_PLANNED | 2025-10-07 → 2025-10-07 | ジェネリクスの keyof T を @let に入れると never | [第 5 回](05-letd-typecheck.md) | JoostK さんの説明で閉じた |
| #65417 | DUPLICATE | 2025-11-20 → 2025-11-20 | @let で分割代入 | [第 1 回](01-letd-syntax.md) | 重複として閉じた（同じ要望は #57923） |
| #65491 | COMPLETED | 2025-07-09 → 2026-04-01 | 絞り込まれた @let の型がホバーで違う | [第 5 回](05-letd-typecheck.md) | 75ac1204936 |
| #66286 | COMPLETED | 2025-12-31 → 2026-01-20 | @let があると余分な restore / reset view が残る | [第 3 回](03-letd-pipeline.md) | ce80136e7b9 |
| #66651 | DUPLICATE | 2026-01-20 → 2026-01-20 | @let に型注釈を書きたい | [第 1 回](01-letd-syntax.md)[第 5 回](05-letd-typecheck.md) | #43485 の重複 |
| #66824 | NOT\_PLANNED | 2026-01-29 → 2026-01-29 | 親のディレクティブが子のビューを同期に描くと NG0314 | [第 4 回](04-letd-runtime.md) | alxhub さん「明示の detectChanges が原因」 |
| #67188 | 開 | 2026-02-21 | ngModel に読み取り専用の signal を渡しても型チェックが通る | [第 5 回](05-letd-typecheck.md) | コメントで「@let にも同じ確かめを」。template\_semantics\_checker の話 |
| #69619 | NOT\_PLANNED | 2026-07-02 → 2026-10-30 | クラスのメンバーを隠す @let に警告を | [第 5 回](05-letd-typecheck.md) | 「隠す使い方を勧めている」「linter の役目」 |
| #70476 | COMPLETED | 2026-08-30 → 2026-09-01 | NG8109 が @let の別名を見ない | [第 5 回](05-letd-typecheck.md) | faafd18a4c0（#70481） |
| #71138 | DUPLICATE | 2026-10-02 → 2026-11-11 | 入れ子のビューから読む @let の配列を片付けが書き換える | [第 4 回](04-letd-runtime.md) | #71141（閉じた） |
| #71172 | COMPLETED | 2026-10-04 → 2026-10-06 | @let が隣にあると NG8011（投影できない）が誤って出る | [第 5 回](05-letd-typecheck.md) | 439d495aaa5（angular-main だけ） |
| #71929 | 開 | 2026-11-10 | ハイドレーションの片付けが @let の配列の要素に書き込む | [第 4 回](04-letd-runtime.md) | #71990（開いている） |

### PR の表（このシリーズで本文に出たもの）

| # | 状態 | 日付 | 題 | コミット | 章 |
| --- | --- | --- | --- | --- | --- |
| #59694 | 開 | 2025-01-24 | fix(core): avoid confusion between let value and internal data structures | ― | [第 4 回](04-letd-runtime.md) |
| #71141 | 閉 | 2026-10-21 | Fix hydration cleanup let declarations | ― | [第 4 回](04-letd-runtime.md) |
| #71990 | 開 | 2026-11-12 | fix(core): skip let declarations during hydration cleanup | ― | [第 4 回](04-letd-runtime.md) |
| #65614 | merge | 2025-11-25 | refactor: add mark for signal forms | c994267f17d | [第 4 回](04-letd-runtime.md) |
| #66004 | merge | 2025-12-17 | fix(language-service): avoid interpolation highlighting inside @let | 9f5744a92dd | [第 5 回](05-letd-typecheck.md) |
| #66632 | merge | 2026-01-20 | fix(compiler): optimize away unnecessary restore/reset view calls | ce80136e7b9 | [第 3 回](03-letd-pipeline.md) |
| #67963 | merge | 2026-04-01 | fix(language-service): get quick info at local var location … | 75ac1204936 | [第 5 回](05-letd-typecheck.md) |
| #68389 | merge | 2026-04-28 | fix(compiler): let declaration span not including end character | 6bd17216627 | [第 1 回](01-letd-syntax.md) |
| #68493 | merge | 2026-05-01 | fix(core): visit ng-let expression value in signal migration schematics | 0ea27f4e652 | 移行 |
| #70481 | merge | 2026-09-01 | fix(compiler-cli): check uninvoked signal aliases in extended diagnostic | faafd18a4c0 | [第 5 回](05-letd-typecheck.md) |
| #71173 | merge | 2026-10-06 | fix(compiler): ignore @let declarations in the control flow content projection diagnostic | 439d495aaa5（angular-main） | [第 5 回](05-letd-typecheck.md) |

### 数で見る傾向

- ../angular の `@let` のコミット 45 個（8576f161ae4 まで）を作者の日付の年で数えると  2024 年 32 個 2025 年 6 個 2026 年 7 個 です。2024 年の 32 個のうち 2024-04〜07 の 4 か月に 28 個が集まり、字句（4 月）→ binder と型チェック（5 月）→ パイプラインと実行時（5〜6 月）→ 既定で有効（6 月）→ 直し（7 月）の順に入りました。9 月の e5adf929659 で安定版になったあとは、年に数個の直しです。
- 見出しの種類は  fix 21 個、refactor 16 個、docs 4 個、feat 2 個、perf 1 個、Revert 1 個 です。2024 年の refactor は、機能の旗（`enableLetSyntax`）の陰で段ごとに入れたもので、0a48d584f2f（feat）で旗を外して公開しています。45 個のうち 34 個が Kristiyan Kostadinov さんのコミットで、ほかは Matthieu Riegler さん 4 個（4231e8f28ff・faafd18a4c0 など）、Andrew Scott さん 2 個（revert と 75ac1204936）と、1 個ずつの 5 人です。
- 表の閉じた 19 件のうち、COMPLETED は 11 件、NOT\_PLANNED は 5 件、DUPLICATE は 3 件です。NOT\_PLANNED と DUPLICATE の多くは**文法を広げる要望**（分割代入・型注釈）と**設計どおりの振る舞い**（宣言より前・`@let user = user()`・隠す名前・同期の `detectChanges`）で、閉じるまでが 0〜1 日のものが多くなっています。
- 開いている 3 件のうち #71929 は、実行時に利用者の値をそのまま LView の枠に入れることから来ていて、閉じた #59504・#60100・#71138 も同じ根です。ほかの 2 件は DevTools（#62221）と、双方向バインディングの型の確かめ（#67188）です。この根には 2025-01 から 3 つの PR（#59694・#71141・#71990）が出ていて、merge されたものはありません。第 4 回の 7 節の記録で、#71990 の形はクライアントの片付けを直し、サーバーの注釈の `['a', true]` は残ることを確かめました。

## このシリーズで見つけたもの

第 1〜5 回を書いている途中で、lexer が止まらなくなる書き方や、ハイドレーションが止まる `@let` の値が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、このサイトの依存の @angular/\* 22.1.6 と、Node で動かした 22.2.6 を使いました。2 つ目と 3 つ目は、すでに開いている issue や PR と根が同じです。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| `@let` の構文を切った設定（`tokenizeLet: false`）でブロックの構文は有効にしておくと、`@let` の文字で lexer が先へ進まず、空の TEXT のトークンを積み続けてメモリが尽きる。`a@letter.example` のような文字でも起きる。版の古い部分コンパイルの宣言を linker にかける道で届く | compiler の ml\_parser/lexer.ts 1421〜1424 行目（`_isTextEnd` が `_tokenizeLet` を見ずに `_isLetStart()` で止まる。読む側の 251 行目は `_tokenizeLet` を見る）。18a675081f9（20.2.0）から | heap 64 MB の Worker で `parseTemplate(…, {enableLetSyntax: false})`。compiler 22.1.6・22.2.6 の linker の記録 | [第 1 回](01-letd-syntax.md) |
| `@let pair = ['a', true];` のように 1 番目の要素が true の配列を子のビューで読むと、サーバーの側でコンテナとして書き出され、ブラウザのハイドレーションが NG0502 で止まる | core の hydration/annotate.ts 658 行目（`isLContainer` の枝が 686 行目の `!isLetDeclaration` より先）、node\_lookup\_utils.ts 172 行目 | 22.1.6・22.2.6 の platform-server と domino の記録。658 行目の前で LetDeclaration を外す写しで消える。根は #59504・#71929 と同じ | [第 4 回](04-letd-runtime.md) |
| ハイドレーションの後片付けが、`@let` に入れた利用者の配列に `i18nNodes` などを書き足す。凍らせた配列では TypeError（#71929 の最小の形は今も起きる。#71990 は開いたまま） | core の hydration/cleanup.ts 114〜120 行目 | 22.1.6・22.2.6 の記録。#71990 の形の写しで消える | [第 4 回](04-letd-runtime.md) |
| 読み取りだけの変数への書き込み（`[(x)]` に signal でない `@let` を書くなど）の診断が、NG8005 ではなく NG998005 と表示される。spec は文だけを比べている | compiler-cli の ngtsc/typecheck/template\_semantics/src/template\_semantics\_checker.ts 149 行目で `ngErrorCode()` を掛け、受け取る checker.ts 927 行目がもう一度掛ける | compiler-cli 22.1.6・22.2.6 の formatDiagnostics の記録 | [第 5 回](05-letd-typecheck.md) |
| `@let` の終わりの `;` を忘れると、名前の span が飲み込まれた後ろの方の同じ文字を指す | compiler の ml\_parser/parser.ts 894 行目（`lastIndexOf(name)`） | ページの上の parseTemplate | [第 1 回](01-letd-syntax.md) |
| NG8109（signal を呼ばずに補間した）の文の閉じ括弧が 1 つ多い（`s()}`） | compiler-cli の typecheck/extended/checks/interpolated\_signal\_not\_invoked/index.ts 217 行目 | compiler-cli の記録 | [第 5 回](05-letd-typecheck.md) |

## 聞かれそうな質問

**Q. @let の実行時の振る舞いを確かめる spec を足すなら、どこですか？**

クライアントだけの振る舞いは core の `acceptance/let_spec.ts`（`//packages/core/test/acceptance:acceptance`）です。ハイドレーションが絡むなら platform-server の `full_app_hydration_spec.ts` の `describe('@let')`（7697 行目、`//packages/platform-server/test:test`）で、`ssr()` → `prepareEnvironmentAndHydrate()` の形の it を足します。出力の命令の並びは compliance の `r3_view_compiler_let/TEST_CASES.json` に項目と期待する出力の .js を足します。

**Q. 型チェックの診断の spec はどちらに足しますか？**

OOB と TemplateSemanticsChecker の診断は `template_typecheck_spec.ts` の `describe('@let declarations')`（7822 行目）で、`env.driveDiagnostics()` の結果を比べます。拡張診断は検査ごとの spec（`unused_let_declaration_spec.ts` など）で、その検査だけの `ExtendedTemplateCheckerImpl` を作ります。code まで比べる書き方は拡張診断の spec の 63 行目です。

**Q. filter で絞ると、なぜ 4 の倍数になるものと、ならないものがありますか？**

compiler-cli の spec の多くが `runInEachFileSystem` で同じ it を 4 つの作り物のファイルシステムで走らせるからです（拡張診断の spec の 19 行目）。type\_check\_block\_spec.ts と language-service の spec は使っていないので、そのままの数です。

**Q. @let の issue は、どんな理由で閉じられることが多いですか？**

表の閉じた 19 件では、直ったもの（COMPLETED）が 11 件で、残りは文法を広げる要望（分割代入・型注釈）や、設計どおりの振る舞い（宣言より前の読み、同期の `detectChanges`、名前を隠すこと）として閉じられています。後者は、コメントに理由（「`@let` は式ではなく文」「linter の役目」など）が書かれているので、要望を読むときはそこまで読みます。

## 読み終えて

- `@let` の spec は compiler・compliance・core・platform-server・compiler-cli・language-service・schematics の 7 か所にあり、手元で走らせた 15 回（14 の target）がすべて通った
- core は TestBed で描いて文字列を見る。命令の並びは compliance、診断は ngtsc の `driveDiagnostics` と拡張診断ごとの spec が固める
- ngtsc の spec の多くは文だけを比べ、拡張診断の spec は code まで比べる。この差が、NG998005 が spec で見えない理由
- コミットは 2024 年の 4 か月に集まり、そのあとは年に数個の直し。開いている #71929 と閉じた 3 件は「値をそのまま LView に入れる」同じ根から来ていて、3 つの PR はまだ merge されていない

---

← 前: [型チェックと診断：TCB と NG8015〜8017・NG8112](05-letd-typecheck.md)
