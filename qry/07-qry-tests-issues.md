[目次](../README.md) › [クエリ（viewChild・contentChildren）の内側](README.md) › 第 7 回 / 全 7 回

# spec と issue を読む：クエリの振る舞いを決めているテスト

> core の acceptance/query\_spec.ts（104 件）、authoring/signal\_queries\_spec.ts（AOT と JIT で 23 件ずつ）、linker/query\_integration\_spec.ts・query\_list\_spec.ts、render3/query\_spec.ts、コンパイラの compliance テスト（14 件）が、このシリーズの各章の約束をどこで固めているか。BUILD.bazel のターゲットと、手元で走らせた数。ラベル core: queries を中心に、開いている issue と閉じた issue の表。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/qry-tests-issues)

---

シリーズの最後に、クエリの振る舞いを固めている spec がどのファイルのどの describe にあり、第 1〜6 回の約束がどの it で確かめられているかを地図にします。手元で全部走らせた数を書き、ラベル `core: queries` の issue（開いている 7 件・閉じた 60 件、2026-11-10 に取得）と、タイトルで探した関連の issue から 23 件を選んで、どの章の行に関係するかを振り分けます。

読む対象は `packages/core/test/acceptance/query_spec.ts`・`acceptance/authoring/signal_queries_spec.ts`・`linker/query_integration_spec.ts`・`linker/query_list_spec.ts`・`render3/query_spec.ts` と、コンパイラの compliance テストの `queries`・`signal_queries`、それぞれの `BUILD.bazel` です。ターゲットの読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、spec の書き方は[spec の読み方](../contrib/06-contrib-reading-specs.md)にあります。

1. [1. 1 行の viewChild が生むもの](01-qry-what-declared.md)
2. [2. コンパイラの側](02-qry-compile.md)
3. [3. TQuery の照合](03-qry-tquery-match.md)
4. [4. LQuery と結果の集め方](04-qry-lquery-results.md)
5. [5. 更新の時機](05-qry-refresh-timing.md)
6. [6. コンテンツのクエリ](06-qry-content-projection.md)
7. **7. spec と issue**（この章）

## 1. spec の地図

ファイルごとの一番外の describe、その中の describe ごとの it の数（`it(` で始まる行を grep で数えたもの）と、bazel で実際に走った数です。合計の it の行は 213 です。

| ファイル（行数） | 一番外の describe（行） | 中の describe（行）と it の数 | it の行 | 走った数 | ターゲット |
| --- | --- | --- | --- | --- | --- |
| `core/test/acceptance/query_spec.ts`（3460） | `query logic`（49） | `view queries`（79）… 16<br>`content queries`（450）… 23<br>`query order`（1150）… 2<br>`（describe の外の it）should generate an empty QueryList for root components`（1225）… 1<br>`descendants: false (default)`（1232）… 8<br>`read option`（1572）… 30<br>`observable interface`（2253）… 2<br>`view boundaries`（2315）… 7<br>`non-regression`（2694）… 5<br>`querying for string token providers`（2896）… 10<br> | 104 | 104 | `//packages/core/test/acceptance:acceptance` |
| `core/test/acceptance/authoring/signal_queries_spec.ts`（738） | `queries as signals`（32） | `view`（33）… 12<br>`content queries`（304）… 5<br>`reactivity and performance`（508）… 2<br>`dynamic component creation`（585）… 1<br>`mix of signal and decorator queries`（617）… 2<br>`（describe の外の it）should resolve static decorator queries when mixed with signal queries`（701）… 1<br> | 23 | 23（test と test\_jit の両方） | `//packages/core/test/acceptance/authoring:test / :test_jit` |
| `core/test/linker/query_integration_spec.ts`（1178） | `Query API`（35） | `querying by directive type`（76）… 12<br>`query for TemplateRef`（291）… 2<br>`read a different token`（313）… 11<br>`changes`（433）… 2<br>`querying by var binding`（490）… 7<br>`querying in the view`（576）… 8<br>`query over moved templates`（665）… 4<br> | 46 | 46（4 つに分けて 11・11・12・12） | `//packages/core/test:test` |
| `core/test/linker/query_list_spec.ts`（194） | `QueryList`（13） | `dirty and reset`（25）… 2<br>`（describe の外の it）length・get・map・filter・find・reduce・toArray・first と last・iterable など`（39）… 19<br>`simple observable interface（if (getDOM().supportsDOMEvents) の中）`（161）… 2<br> | 23 | 21（Node では 2 つが走らない） | `//packages/core/test:test` |
| `core/test/render3/query_spec.ts`（112） | `query`（21） | `predicate › providers`（23）… 2<br>`（describe の外の it）should restore queries if view changes`（82）… 1<br> | 3 | 3 | `//packages/core/test/render3:render3` |
| `compiler-cli/test/compliance/test_cases の queries と signal_queries` | `compliance tests (full compile)`（58） | `r3_compiler_compliance/components_and_directives/queries（TEST_CASES.json の cases）` … 11<br>`signal_queries` … 3<br> | 14 | 14（2 つに分けて 7・7） | `//packages/compiler-cli/test/compliance/full:full` |

query\_spec.ts の一番外の `query logic` は、ファイルの it を全部含みます（104 件）。compliance の行数の欄が空なのは、テストの本体が TEST\_CASES.json と期待値の .js（ファイルが 14 組）で、spec のファイルは `full_compile_spec.ts` などの共通の 1 本だからです。compliance の describe は `test_runner.ts` がケースごとに `[相対パス]/番号` の名前で作るので、`--filter=queries\]` で 2 つのディレクトリのケースだけに絞れます。

📄 `angular/packages/core/test/linker/query_list_spec.ts` L158–162 （▶ の行: 160–162）

```ts
158 │   });
159 │ 
160 ▶   if (getDOM().supportsDOMEvents) {
161 ▶     describe('simple observable interface', () => {
162 ▶       it('should fire callbacks on change', () => {
```

query\_list\_spec.ts の it の行は 23 ですが、Node では 21 件です。160 行目の `if (getDOM().supportsDOMEvents)` が Node では偽で、161〜162 行目の `changes` の 2 件が登録されないからです。この 2 件はブラウザで走る `//packages/core/test:test_web` の側にだけあります（今回は走らせていません）。

## 2. 2 つのコンパイルで同じ spec を走らせる BUILD.bazel

📄 `angular/packages/core/test/acceptance/authoring/BUILD.bazel` L40–75 （▶ の行: 40, 43–44, 46, 49, 52, 56, 59, 63, 66, 70, 73）

```python
40 ▶ js_run_binary(
41 │     name = "processed_test_sources",
42 │     testonly = True,
43 ▶     srcs = TEST_FILES,
44 ▶     outs = ["transformed_%s" % file for file in TEST_FILES],
45 │     args = ["../../../$(@D)"] + ["$(rootpath %s)" % file for file in TEST_FILES],
46 ▶     tool = ":test_compiler",
47 │ )
48 │ 
49 ▶ ts_project(
50 │     name = "test_jit_lib",
51 │     testonly = True,
52 ▶     srcs = ["transformed_%s" % file for file in TEST_FILES],
53 │     deps = TEST_DEPS,
54 │ )
55 │ 
56 ▶ ng_project(
57 │     name = "test_lib",
58 │     testonly = True,
59 ▶     srcs = TEST_FILES,
60 │     deps = TEST_DEPS,
61 │ )
62 │ 
63 ▶ zoneless_jasmine_test(
64 │     name = "test",
65 │     data = [
66 ▶         ":test_lib",
67 │     ],
68 │ )
69 │ 
70 ▶ zoneless_jasmine_test(
71 │     name = "test_jit",
72 │     data = [
73 ▶         ":test_jit_lib",
74 │     ],
75 │ )
```

signal のクエリの spec は、同じファイルを 2 通りにコンパイルして走らせます。56〜59 行目の `ng_project` は ngtsc で AOT にコンパイルした `test_lib`、63〜66 行目の `test` がそれを走らせます。40〜46 行目の `js_run_binary` は、同じ spec を `authoring_test_compiler`（compiler-cli の `getInitializerApiJitTransform` を使う小さな道具）で書き換えて `transformed_*.ts` を作り、49〜52 行目の `ts_project` でふつうの TypeScript としてまとめ、70〜73 行目の `test_jit` で走らせます。JIT（実行時にコンパイルする）でも `viewChild()` などの初期化子が AOT と同じメタデータになることを、spec を書き分けずに確かめるための形です（JIT の側の変換は[第 2 回](02-qry-compile.md)）。query\_spec.ts の `//packages/core/test/acceptance:acceptance` は zone.js を読む `angular_jasmine_test`、linker の 2 ファイルは `//packages/core/test:test`（`shard_count = 4` で 4 つに分けて走る）の中です。

## 3. 各章の約束と、それを固めている it

| 章 | 約束 | it |
| --- | --- | --- |
| [第 1 回 全体像](01-qry-what-declared.md) | viewQuery / contentQueries 関数と、signal のクエリの命令の形 | compliance の signal\_queries 3 件（mixed\_query\_variants など） |
| [第 2 回 コンパイラの側](02-qry-compile.md) | QueryFlags（descendants・isStatic・emitDistinctChangesOnly）と述語・read の出力 | compliance の queries 11 件（static\_view\_query・query\_with\_emit\_distinct\_changes\_only など） |
| [第 3 回 TQuery の照合](03-qry-tquery-match.md) | 文字列は参照名、型はノードの注入器のトークン。read で返すもの | query\_spec.ts の read option（1572、30 件）・querying for string token providers（2896、10 件）、render3/query\_spec.ts の predicate › providers（23） |
| [第 3 回 TQuery の照合](03-qry-tquery-match.md) | descendants: false の「直接の子」と ng-container | query\_spec.ts の descendants: false (default)（1232、8 件） |
| [第 4 回 LQuery と結果の集め方](04-qry-lquery-results.md) | 結果は書いた順。ビューの挿入・切り離しで dirty | query\_spec.ts の query order（1150）・view boundaries（2315、7 件）、query\_integration\_spec.ts の query over moved templates（665） |
| [第 4 回 LQuery と結果の集め方](04-qry-lquery-results.md) | QueryList の reset・dirty・changes と emitDistinctChangesOnly | query\_list\_spec.ts（23 件）、query\_spec.ts の observable interface（2253）と 2418 行目の it |
| [第 5 回 更新の時機](05-qry-refresh-timing.md) | static は作成の段で 1 回だけ、static でないものは更新の段 | query\_spec.ts の 157・550 行目の it |
| [第 5 回 更新の時機](05-qry-refresh-timing.md) | signal のクエリはコンストラクタでは空、作成の段のあとで読める、途中の結果は返さない | signal\_queries\_spec.ts の 54・72・128・403 行目の it、component\_spec.ts の 979 行目の it |
| [第 6 回 コンテンツのクエリ](06-qry-content-projection.md) | コンテンツのクエリはホストの中に書かれたノード。ホスト自身は入らない | query\_spec.ts の content queries（450、23 件）の 948・974 行目など、query\_integration\_spec.ts の 549 行目 |
| [第 6 回 コンテンツのクエリ](06-qry-content-projection.md) | 継承でクエリ関数がつながる | inherit\_definition\_feature\_spec.ts の should inherit ContentChildren / ViewChildren queries（12 か所） |

書いている途中で、固めている it が見つからなかったもの（第 4〜6 回の「テストと直し方」に書いたもの）をまとめておきます。

- [第 4 回](04-qry-lquery-results.md)：別の `ViewContainerRef` に入れたビュー（MOVED\_VIEWS）どうしの並びは「入れた時刻の順」で、入れた先の位置（先頭に入れたか）は見ない。DOM の順と食い違う形を確かめる it は、query\_spec.ts と query\_integration\_spec.ts には無い。
- [第 5 回](05-qry-refresh-timing.md)：`static: true` のクエリが `@if` の中の要素を最後まで取らないことを、名指しで確かめる it は、query\_spec.ts と query\_integration\_spec.ts には見つからない（query\_spec.ts 157 行目の it は、テンプレートの直下の要素で static の振る舞いを見ている）。

## 4. 手元で走らせた結果

📄 `走らせたコマンド（2026-11-10、8576f161ae4）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all '--test_arg=--filter=^query logic'
pnpm bazel test //packages/core/test/acceptance/authoring:test --nocache_test_results --test_output=all '--test_arg=--filter=^queries as signals'
pnpm bazel test //packages/core/test/acceptance/authoring:test_jit --nocache_test_results --test_output=all '--test_arg=--filter=^queries as signals'
pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all '--test_arg=--filter=^QueryList'
pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all '--test_arg=--filter=^Query API'
pnpm bazel test //packages/core/test/render3:render3 --nocache_test_results --test_output=all '--test_arg=--filter=^query '
pnpm bazel test //packages/compiler-cli/test/compliance/full:full --nocache_test_results --test_output=all '--test_arg=--filter=queries\]'
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all '--test_arg=--filter=^inheritance'
```

| フィルタ | 結果 | ログ（qry-logs/） |
| --- | --- | --- |
| `^query logic` | Ran 104 of 2693 specs、0 failures | b-acc-query.log |
| `^query logic view queries` ／ `content queries` ／ `descendants` ／ `view boundaries` | 16 ／ 23 ／ 8 ／ 7、どれも 0 failures | b-acc-view-queries.log ほか |
| `^queries as signals`（test ／ test\_jit） | Ran 23 of 62 specs、0 failures（両方） | b-signal-q.log・b-signal-q-jit.log |
| `^QueryList` | 5 + 6 + 5 + 5 = 21、0 failures | b-core-querylist.log |
| `^Query API` | 11 + 11 + 12 + 12 = 46、0 failures | b-core-queryapi.log |
| `^query `（render3） | Ran 3 of 574 specs、0 failures | b-r3-query.log |
| `queries\]`（compliance、full compile） | 7 + 7 = 14、0 failures | b-compliance-full.log |
| `^inheritance` | Ran 117 of 2693 specs、0 failures | b-acc-inherit.log |

`^query ` の後ろの空白は、render3 の describe `query` だけに絞るためです（空白が無いと `query` で始まる別の describe も拾います）。`//packages/core/test:test` の数が 4 つに分かれているのは shard ごとに出るからで、足した数がファイルの it の数と合います。

新しい本家（angular-main、74961c66242）では、query\_spec.ts は「modernize unit tests」のコミット（ecbc89b465c、PR #71209、2026-10）で 3460 行から 3042 行になり、it の行は 104 から 102 になっています。消えた 2 つは `read option` の 「should read Injector from element nodes when explicitly asked for」と「should read the node injector of the queried element」で、PR #70561（2026-09、`read: Injector` を入れた変更）で足された it です（[第 3 回](03-qry-tquery-match.md)で引用）。angular-main の query.ts には `read === Injector` の行（291・375 行目）が残っていて、`read: Injector` を確かめる it は signal\_queries\_spec.ts の 1 件（272 行目）だけになっています。angular-main で読むときは、この章の行番号がずれていることに気をつけてください。

## 5. クエリの issue

| # | 状態 | 題 | 章 | メモ |
| --- | --- | --- | --- | --- |
| #69369 | 開（2026-06） | Make viewChild(Component) compatible with deferred lazy chunks | [第 2 回 コンパイラの側](02-qry-compile.md)<br> | 述語にクラスを書くと、そのクラスへの参照がクエリの関数に残る。ラベルに core: defer も |
| #59067 | 開（2024-12） | Signal Queries are populated before the input have been set on the components | [第 5 回 更新の時機](05-qry-refresh-timing.md)<br> | 第 5 回の 5 節。ラベルは core: reactivity（core: queries ではない）。#61214 はこの重複 |
| #55237 | 開（2024-04） | contentChild support locator array | [第 2 回 コンパイラの側](02-qry-compile.md)<br>[第 3 回 TQuery の照合](03-qry-tquery-match.md)<br> | 機能の要望。述語に配列を渡したい |
| #43946 | 開（2021-10） | Accessing @ViewChild and @ViewChildren of a template declared in a different component than the one where it is host | [第 4 回 LQuery と結果の集め方](04-qry-lquery-results.md)<br> | 結果は ng-template を書いた側に入る（第 4 回の 5 節） |
| #37319 | 開（2020-05） | Make it possible to reason about content to project (content projection and content queries unification) | [第 6 回 コンテンツのクエリ](06-qry-content-projection.md)<br> | 投影とコンテンツのクエリを 1 つの考え方にまとめる議論 |
| #24858 | 開（2018-07） | \[Feature\] @ContentChildren() option to traverse just ng-container and ng-template | [第 3 回 TQuery の照合](03-qry-tquery-match.md)<br>[第 6 回 コンテンツのクエリ](06-qry-content-projection.md)<br> | 2026-09-29 に「クエリの範囲は宣言したビューで決まるので閉じてよい」というコメントが付いている |
| #16299 | 開（2017-04） | @ContentChildren not populating from parent &lt;ng-content&gt; | [第 6 回 コンテンツのクエリ](06-qry-content-projection.md)<br> | DEMO の ④（ラッパーがもう一度投影する）と同じ形 |
| #13893 | 開（2017-01） | Issue with queries and the TemplateRef predicate | [第 3 回 TQuery の照合](03-qry-tquery-match.md)<br> | TemplateRef の述語と、@if が作る ng-template の数え方 |
| #43253 | 開（2021-08） | Check generic types when using ViewChild/ContentChild and through DI | [第 2 回 コンパイラの側](02-qry-compile.md)<br> | ラベルは compiler: template type-checking |
| #47760 | 閉（2022-10 → 2026-09 COMPLETED） | Allow read Injector in ViewChild / ContentChild | [第 3 回 TQuery の照合](03-qry-tquery-match.md)<br> | PR #70561（2026-09 マージ）で read: Injector が入った |
| #38976 | 閉（2020-09 → 2025-10 COMPLETED） | ContentChildren query lags in change detection when wrapped by template | [第 5 回 更新の時機](05-qry-refresh-timing.md)<br>[第 6 回 コンテンツのクエリ](06-qry-content-projection.md)<br> | 「signal のクエリで直った」として閉じられた。ngDoCheck で読むと今も遅れる、とコメントにある |
| #57891 | 閉（2024-09 → 2026-02 DUPLICATE） | Wrong content children order when using ngTemplateOutlet to render | [第 4 回 LQuery と結果の集め方](04-qry-lquery-results.md)<br> | 並びは ng-template を書いた順（第 4 回の 5 節） |
| #14842 | 閉（2017-03 → 2026-01 DUPLICATE） | ContentChildren doesn't get children created with NgTemplateOutlet | [第 4 回 LQuery と結果の集め方](04-qry-lquery-results.md)<br>[第 6 回 コンテンツのクエリ](06-qry-content-projection.md)<br> | 投影の代表の issue の重複として閉じられた |
| #42519 | 閉（2021-06 → 2025-08 DUPLICATE） | QueryList not sorted according to the actual state | [第 4 回 LQuery と結果の集め方](04-qry-lquery-results.md)<br> | #12284（2016、「意図どおり」）の重複として閉じられた |
| #61214 | 閉（2025-05 → 2025-05 DUPLICATE） | viewchildren / contentChildren gets first value before component inputs are initialized in an @for loop | [第 5 回 更新の時機](05-qry-refresh-timing.md)<br> | #59067 の重複 |
| #35405 | 閉（2020-02 → 2025-09 NOT\_PLANNED） | QueryList change not emitted when using ChangeDetectionStrategy.OnPush | [第 4 回 LQuery と結果の集め方](04-qry-lquery-results.md)<br>[第 5 回 更新の時機](05-qry-refresh-timing.md)<br> | 「意図どおり」として閉じられた。ɵɵqueryRefresh はそのビューの変更検知の中でしか動かない |
| #51721 | 閉（2023-09 → 2025-11 NOT\_PLANNED） | Template biding of ViewChild property is one change detection behind | [第 5 回 更新の時機](05-qry-refresh-timing.md)<br> | ビューのクエリはテンプレートの更新のあとに代入される（第 5 回の 4 節）。signal なら起きない、とコメント |
| #36876 | 閉（2020-04 → 2026-05 NOT\_PLANNED） | @ContentChildren() works fine with static true but according to the ts definitions it doesn't accept it | [第 5 回 更新の時機](05-qry-refresh-timing.md)<br> | 型と実行時の食い違い |
| #60858 | 閉（2025-04 → 2025-09 NOT\_PLANNED） | NG0600 Error when using Mat Table DataSource, viewChild signals, and if-statements in Template | [第 5 回 更新の時機](05-qry-refresh-timing.md)<br> | computed の中での書き込み。API の使い方の問題として閉じられた |
| #57944 | 閉（2024-09 → 2025-09 COMPLETED） | Initializer APIs (input, output, queries) not integrating with TestBed.override in a jit & aot mix | [第 2 回 コンパイラの側](02-qry-compile.md)<br> | 閉じたあと、直した変更を一度戻して出し直している（2025-10 のコメント） |
| #54450 | 閉（2024-02 → 2024-02 COMPLETED） | \[Queries as signals\]: Signal Queries throws console errors when component is rendered as custom element | [第 6 回 コンテンツのクエリ](06-qry-content-projection.md)<br> | 根のコンポーネントのコンテンツのクエリ。signal\_queries\_spec.ts 586 行目の it |
| #54376 | 閉（2024-02 → 2024-02 COMPLETED） | Signals: viewChildren() gets new values even when query list is unchanged, and performance is hampered by lack of a 'static' option | [第 4 回 LQuery と結果の集め方](04-qry-lquery-results.md)<br> | コミット ff62244c86f（PR #54392）で直った。結果が同じなら同じ配列を返す（signal\_queries\_spec.ts 146・165・196 行目の it） |
| #16388 | 閉（2017-04 → 2024-02 COMPLETED） | \[Bug\] Inconsistent behavior for ContentChildren with structural directive | [第 6 回 コンテンツのクエリ](06-qry-content-projection.md)<br> | 「signal で状態を持てば解決」として閉じられた |

ラベル `core: queries` の開いている 7 件のうち 5 件には `feature` が付き（#37319 は `needs: discussion`、#16299 は `state: Needs Design` も）、#13893 は `type: confusing`、#69369 は機能の要望の書式で出されています。`bug` や `type: bug/fix` の付いたものはありません。閉じた issue では「並びが DOM の順と違う」（#57891・#42519・#14842）と「結果が見える時機」（#38976・#51721・#61214）が多く、どちらも「意図どおり」か「signal のクエリで解決」として閉じられています。並びの規則は[第 4 回](04-qry-lquery-results.md)の 5 節、時機は[第 5 回](05-qry-refresh-timing.md)の 4〜5 節の行で説明できます。

## 書いている途中で見つかったもの

第 1〜6 回を書く途中で、AOT と JIT の小さな食い違いと、テストやコメントの古くなった所が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で、angular-main の件はその木（74961c66242）で確かめました。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| 単数のクエリ（`@ViewChild`・`@ContentChild`）のフラグが、AOT では 5（descendants と emitDistinctChangesOnly）、JIT では 1 になる。単数のクエリは QueryList を見せないので、結果の値は変わらない | core/src/metadata/di.ts の ViewChild の既定に emitDistinctChangesOnly が無く、core/src/render3/jit/directive.ts 448 行目の `!!ann.emitDistinctChangesOnly` が false になる。ngtsc は shared.ts 535 行目で既定の true を入れる | `@ViewChild('a')` を ngtsc と JIT の両方でコンパイルした記録（AOT は `ɵɵviewQuery(_c0, 5)`、JIT は 1） | [第 2 回](02-qry-compile.md) |
| angular-main で、`read: Injector` を確かめる decorator の側の it が 2 つ消えた。機能の行は残っていて、確かめる it は signal の側の 1 つだけになった | core/test/acceptance/query\_spec.ts。8576f161ae4 では 1780・1800 行目にある it が、ecbc89b465c（2026-10 の「modernize unit tests」）で無くなっている | `git -C angular-main show ecbc89b465c -- packages/core/test/acceptance/query_spec.ts` の削除の行と、両方の木で `read: Injector` を数えた結果（2 と 0） | [第 3 回](03-qry-tquery-match.md)・[第 7 回](07-qry-tests-issues.md) |
| （これを固める it が無い振る舞い）別の ViewContainerRef に入れたビューどうしの結果は、入れた先の位置ではなく入れた時刻の順に並ぶ。先頭に入れると DOM の順と逆になる | core/src/render3/queries/query.ts 452〜456 行目（MOVED\_VIEWS を順に読む） | 第 4 回のデモ（DOM が T2 T1 のとき、結果は T1 T2）。query\_spec.ts と query\_integration\_spec.ts にこの並びの it は無い | [第 4 回](04-qry-lquery-results.md) |
| QueryFlags の定義の NOTE が、今はもう定義の無いファイルを指している | core/src/render3/interfaces/query.ts 27 行目（`packages/compiler/src/render3/view/compiler.ts` を指す。定義は query\_generation.ts にある） | grep | [第 2 回](02-qry-compile.md) |
| compliance テストの道具で、クエリのフラグの名前が分からないときの文が `Unknown SelectorFlag` になっている（別の表から写した文言のまま） | compiler-cli/test/compliance/test\_helpers/expected\_file\_macros.ts 205 行目 | grep | [第 2 回](02-qry-compile.md) |

## 聞かれそうな質問

**Q. クエリの振る舞いを変えたら、どの spec を走らせればいいですか？**

まず `//packages/core/test/acceptance:acceptance` を `--test_arg=--filter=^query logic` で（104 件）。signal のクエリに関係するなら `//packages/core/test/acceptance/authoring:test` と `:test_jit`、QueryList なら `//packages/core/test:test` の `^QueryList` と `^Query API`、出力の形を変えたら compliance の `queries\]` です。

**Q. QueryList の spec が、ファイルの it より少なく走るのはなぜですか？**

query\_list\_spec.ts 160 行目の `if (getDOM().supportsDOMEvents)` の中の 2 件は、Node では登録されません。ブラウザのターゲット（`test_web`）でだけ走ります。

**Q. signal のクエリの spec が 2 回走るのはなぜですか？**

authoring の BUILD.bazel が、同じファイルを ngtsc で AOT にした `test` と、`authoring_test_compiler` で JIT 向けに変換した `test_jit` の 2 つを作るからです（40〜73 行目）。どちらも 23 件です。

**Q. 「ViewChildren の順が画面の順と違う」という issue は、不具合ですか？**

閉じられた issue（#42519・#57891）では、どちらも重複として閉じられ、元の #12284 は 2016 年に「意図どおり」とされています。並びはテンプレートに書いた順で、ng-template の中身は ng-template を書いた位置に入ります（[第 4 回](04-qry-lquery-results.md)の 5 節）。

## 読み終えて

- クエリの spec の中心は acceptance/query\_spec.ts（104 件、describe `query logic`）と authoring/signal\_queries\_spec.ts（23 件、AOT と JIT の 2 回）。
- linker の 2 ファイルは `//packages/core/test:test` の 4 つの shard に分かれて走り、QueryList の `changes` の 2 件は Node では走らない。
- 出力の形は compliance の 14 件。`--filter=queries\]` で絞れる。
- 開いている issue は要望と設計の議論。閉じた issue の多くは「並び」と「時機」で、第 4・5 回の行で説明できる。

---

← 前: [コンテンツのクエリ：投影されたノード、ディレクティブのクエリ、継承](06-qry-content-projection.md)  
次: [1 行の ng-content が生むもの：投影の全体像](../proj/01-proj-what-declared.md) →
