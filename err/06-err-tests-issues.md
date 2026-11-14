[目次](../README.md) › [ErrorHandler とエラーの行き先](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：エラーの行き先を固めているテスト

> core/test の error\_handler\_spec.ts と render3/error\_boundary\_spec.ts、acceptance のリスナー・描画後・PendingTasks と render3 の effect のエラーの spec、compiler の r3\_template\_transform\_spec.ts、compiler-cli の boundary\_spec.ts と compliance、言語サービスの spec が、このシリーズの各章の約束をどこで固めているか。Bazel の target と手元で走らせた数。ErrorHandler・全体のエラー・境界に関係する開いている issue と閉じた issue の表と、数で見る傾向。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/err-tests-issues)

---

シリーズの最後に、第 1〜5 回の約束を固めている spec がどのファイルのどの describe にあり、どの Bazel の target で走るかを地図にします。手元で走らせた数を書き、ErrorHandler・捕まえる場所・全体のエラー・エラーの境界に関係する issue から 25 件（開いている 5 件、閉じた 20 件。2026-11-15 に gh で取得）を選んで、どの章に関係するかを振り分けます。

読む対象は `packages/core/test/error_handler_spec.ts`・`packages/core/test/render3/error_boundary_spec.ts`・acceptance の関係する spec、`packages/compiler/test/render3/r3_template_transform_spec.ts`、`packages/compiler-cli/test/ngtsc/boundary_spec.ts`、言語サービスの spec と、それぞれの `BUILD.bazel` です。target の読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. ErrorHandler と内部の入口](01-err-handler-core.md)
2. [2. エラーを捕まえる場所の地図](02-err-where-caught.md)
3. [3. ブラウザの全体のエラー](03-err-global-listeners.md)
4. [4. @boundary の実行時](04-err-boundary-runtime.md)
5. [5. @boundary のコンパイル](05-err-boundary-compile.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

行番号は 8576f161ae4 で `grep -n` したものです。target は spec のある場所の `BUILD.bazel` を読んで決めました（shard の数は `shard_count`）。

| ファイル | describe / it（行） | 数 | target | 章 |
| --- | --- | --- | --- | --- |
| `packages/core/test/error_handler_spec.ts` | describe('ErrorHandler') :30 | it 5 本（:31・:36・:46・:71・:101） | `//packages/core/test:test（shard 4）` | [第 1 回](01-err-handler-core.md)・[第 3 回](03-err-global-listeners.md) |
| `packages/core/test/component_fixture_spec.ts` | describe('errors during ApplicationRef.tick') :424 | it 2 本 | `//packages/core/test:test` | [第 2 回](02-err-where-caught.md) |
| `packages/core/test/change_detection_scheduler_spec.ts` | it('can recover when an error is re-thrown by the ErrorHandler') :508 | it 1 本 | `//packages/core/test:test` | [第 2 回](02-err-where-caught.md) |
| `packages/core/test/acceptance/listener_spec.ts` | it('should try to execute remaining coalesced listeners if one of the listeners throws') :446 | it 1 本 | `//packages/core/test/acceptance:acceptance` | [第 2 回](02-err-where-caught.md) |
| `packages/core/test/acceptance/after_render_hook_spec.ts` | it('should propagate errors to the ErrorHandler') :331・:1025 | it 2 本 | `//packages/core/test/acceptance:acceptance` | [第 2 回](02-err-where-caught.md) |
| `packages/core/test/acceptance/pending_tasks_spec.ts` | describe('public PendingTasks') の :98・:112 | it 2 本 | `//packages/core/test/acceptance:acceptance` | [第 2 回](02-err-where-caught.md) |
| `packages/core/test/render3/reactivity_spec.ts` | describe('effects') の it('should propagate errors to the ErrorHandler') :99 | it 1 本 | `//packages/core/test/render3:render3` | [第 2 回](02-err-where-caught.md) |
| `packages/core/test/render3/error_boundary_spec.ts` | describe('Error Boundary Runtime Interception') :23 / describe('@boundary runtime instructions (JIT)') :515 | it 12 + 14 本 | `//packages/core/test/render3:render3` | [第 4 回](04-err-boundary-runtime.md) |
| `packages/compiler/test/render3/r3_template_transform_spec.ts` | describe('Boundary blocks') :280 と it('should report connected defer blocks used without a defer block') :1466 | it 2 本 | `//packages/compiler/test/render3:test` | [第 5 回](05-err-boundary-compile.md) |
| `packages/compiler-cli/test/ngtsc/boundary_spec.ts` | describe('ngtsc @boundary type checking') :16 | it 8 本 | `//packages/compiler-cli/test/ngtsc:ngtsc（shard 4）` | [第 5 回](05-err-boundary-compile.md) |
| `packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_boundaries/` | TEST\_CASES.json | 7 件 | `//packages/compiler-cli/test/compliance/full:full（shard 2）` | [第 5 回](05-err-boundary-compile.md) |
| `packages/language-service/test/get_outlining_spans_spec.ts・quick_info_spec.ts` | :207 / :851・:859 | it 3 本 | `//packages/language-service/test:test（shard 4）` | [第 5 回](05-err-boundary-compile.md) |

1. **どこに何があるか**

   ErrorHandler 本体と全体のリスナーは core の直下の `error_handler_spec.ts`、捕まえる場所はそれぞれの機能の spec（リスナー・描画後・PendingTasks・effect）に散らばっています。境界の実行時は render3 の `error_boundary_spec.ts` 1 本にまとまり、コンパイラの側はパーサ・型チェック・出力・言語サービスの 4 か所に分かれます。
2. **target が名前の場所と違うもの**

   `r3_template_transform_spec.ts` は `//packages/compiler/test:test` ではなく、`packages/compiler/test/render3/BUILD.bazel` の `//packages/compiler/test/render3:test` です。私は最初に前者を同じ filter で走らせ、`Ran 0 of 403 specs` で PASSED になりました。filter が 0 件でも失敗にならないので、`Ran` の数を必ず見ます。

## 2. 各章の約束と、それを固めている it

| 章 | 約束 | it（ファイル:行） |
| --- | --- | --- |
| [第 1 回](01-err-handler-core.md) | 既定の `handleError` は値をそのまま console に出す | should correctly handle primitive values（error\_handler\_spec.ts:36） |
| [第 1 回](01-err-handler-core.md) | 壊れた注入器から ErrorHandler を取らない（c4dd258658f） | should not try to inject the `ErrorHandler` lazily once app is destroyed（error\_handler\_spec.ts:101） |
| [第 2 回](02-err-where-caught.md) | tick のエラーで whenStable が reject、`rethrowApplicationErrors: false` なら resolve | describe('errors during ApplicationRef.tick')（component\_fixture\_spec.ts:424） |
| [第 2 回](02-err-where-caught.md) | PendingTasks.run の失敗で安定を止め続けない（7232ce5b17c・0e16bb701f2） | should stop blocking stability if run promise rejects / … throws synchronously（pending\_tasks\_spec.ts:98・:112） |
| [第 3 回](03-err-global-listeners.md) | 全体のリスナーは 2 回 provide しても 1 回だけ、error の無い ErrorEvent を包む | installs global error handler once / handles error events without error（error\_handler\_spec.ts:46・:71） |
| [第 4 回](04-err-boundary-runtime.md) | 作るときのエラーは境界の catch、公開 API の onError は受けない | should intercept errors thrown during component constructor（:539）/ should NOT intercept … via createComponent（:137） |
| [第 4 回](04-err-boundary-runtime.md) | onViewError に boundary つきの ErrorDetails が届く | should populate ErrorDetails correctly when caught by @boundary …（error\_boundary\_spec.ts:1020、下の引用） |
| [第 4 回](04-err-boundary-runtime.md) | 投影された子は受けない、合わなければ BoundaryError | does not support catching errors from projected content（:340）/ should fall through and rethrow …（:952） |
| [第 5 回](05-err-boundary-compile.md) | AST の形、暗黙の `$error`・`$reset` | should parse @boundary blocks with multiple @error blocks（r3\_template\_transform\_spec.ts:281） |
| [第 5 回](05-err-boundary-compile.md) | 受け皿の `@error` は 1 つで最後、`when` で絞り込む | boundary\_spec.ts:107（下の引用）・:75 |

📄 `angular/packages/core/test/render3/error_boundary_spec.ts` L1020–1030 （▶ の行: 1020, 1025–1028）

```ts
1020 ▶   it('should populate ErrorDetails correctly when caught by @boundary and handled by ErrorHandler.onViewError', () => {
1021 │     let capturedDetails!: ErrorDetails;
1022 │     let capturedError: Error;
1023 │ 
1024 │     const CustomErrorHandler = {
1025 ▶       handleError: () => {},
1026 ▶       onViewError: (e: Error, details: ErrorDetails) => {
1027 ▶         capturedError = e;
1028 ▶         capturedDetails = details;
1029 │       },
1030 │     };
```

📄 `angular/packages/core/test/render3/error_boundary_spec.ts` L1054–1067 （▶ の行: 1055, 1059, 1062–1066）

```ts
1054 │     TestBed.configureTestingModule({
1055 ▶       providers: [{provide: ErrorHandler, useValue: CustomErrorHandler}],
1056 │     });
1057 │ 
1058 │     const fixture = TestBed.createComponent(Host);
1059 ▶     fixture.detectChanges();
1060 │ 
1061 │     expect(capturedDetails).toBeDefined();
1062 ▶     expect(capturedDetails.declarationInstance).toBeInstanceOf(Throwing);
1063 ▶     expect(capturedDetails.declarationType).toBe(Throwing);
1064 ▶     expect(capturedDetails.boundary).toBeDefined();
1065 ▶     expect(capturedDetails.boundary!.type).toBe(Host);
1066 ▶     expect(typeof capturedDetails.boundary!.reset).toBe('function');
1067 │   });
```

1026 行目の `onViewError` を持つ ErrorHandler を 1055 行目で入れ、1062〜1066 行目で `details` の 4 つを見ています。投げているのは子のテンプレートの更新なので、第 4 回の 6 節の道（`declarationType` は投げた子、1063 行目）です。作るときの道（第 4 回の 7 節。`declarationType` がホストになり、`caughtBy` が無い）の `details` を見る it はありません。

📄 `angular/packages/compiler-cli/test/ngtsc/boundary_spec.ts` L107–138 （▶ の行: 107, 118, 120, 129–131, 133, 136）

```ts
107 ▶     it('should report an error if there are multiple unconditional @error blocks', () => {
108 │       env.write(
109 │         'test.ts',
110 │         `
111 │         import {Component} from '@angular/core';
112 │ 
113 │         @Component({
114 │           selector: 'test-cmp',
115 │           template: \`
116 │             @boundary {
117 │               <div>Normal</div>
118 ▶             } @error {
119 │               <div>Fallback 1</div>
120 ▶             } @error {
121 │               <div>Fallback 2</div>
122 │             }
123 │           \`,
124 │         })
125 │         export class TestCmp {}
126 │       `,
127 │       );
128 │ 
129 ▶       const diags = env.driveDiagnostics();
130 ▶       // It will report two errors: one because the first block isn't the last, and one for the duplicate
131 ▶       expect(diags.length).toBe(2);
132 │       expect(diags[0].messageText).toContain(
133 ▶         'Unconditional @error block must be the last @error block in the boundary chain',
134 │       );
135 │       expect(diags[1].messageText).toContain(
136 ▶         '@boundary block can only have one unconditional @error block',
137 │       );
138 │     });
```

compiler-cli の it は、`env.write` で 1 ファイルのプロジェクトを書き、129 行目の `env.driveDiagnostics()` で診断を集めて、131 行目で数、133・136 行目で文言を見る形です。第 5 回の記録の「条件なしの `@error` が 2 つ」と同じ 2 件です。第 5 回の TS500 の件を固めるなら、この形で「`let e = $index` のとき NG5002 が 1 件」を書きます。

## 3. 手元で走らせた結果

8576f161ae4 の ../angular で、`pnpm bazel test <target> --nocache_test_results --test_output=all "--test_arg=--filter=<filter>"` を 1 つずつ走らせました（2026-11-15）。

| target | filter | 結果 |
| --- | --- | --- |
| `//packages/core/test:test` | `^ErrorHandler \|errors during ApplicationRef.tick\|can recover when an error is re-thrown by the ErrorHandler` | shard 4 つで 3 + 2 + 2 + 1 = 8 本、0 failures |
| `//packages/core/test/acceptance:acceptance` | `should stop blocking stability if run\|should propagate errors to the ErrorHandler\|coalesced listeners if one of the listeners throws` | Ran 5 of 2693 specs、0 failures |
| `//packages/core/test/render3:render3` | `should propagate errors to the ErrorHandler` | Ran 1 of 574 specs、0 failures |
| `//packages/core/test/render3:render3` | `Error Boundary Runtime Interception\|@boundary runtime instructions` | Ran 26 of 574 specs、0 failures |
| `//packages/compiler/test/render3:test` | `Boundary blocks\|connected defer blocks used without a defer block` | Ran 2 of 499 specs、0 failures |
| `//packages/compiler-cli/test/ngtsc:ngtsc` | `ngtsc @boundary type checking` | shard 4 つのそれぞれで Ran 8 of 6730 specs、0 failures |
| `//packages/compiler-cli/test/compliance/full:full` | `r3_view_compiler_boundaries` | shard 2 つで 3 + 4 = 7 件、0 failures |
| `//packages/language-service/test:test` | `boundary` | shard 4 つで 0 + 1 + 1 + 1 = 3 本、0 failures |

- core の直下の 8 本は、ErrorHandler の 5 本、tick のエラーの 2 本、scheduler の 1 本です。`^ErrorHandler ` の `^` と後ろの空白で、ほかの describe の名前に含まれる「ErrorHandler」を外しています。
- acceptance の 5 本は、リスナー 1・描画後 2・PendingTasks 2 です。effect の 1 本は render3 の target にあるので別に走らせました。
- ngtsc の boundary\_spec.ts は 4 つの shard のどれでも `Ran 8 of 6730` と出ました。

### 新しい本家との違い

angular-main（74961c66242）の error\_boundary\_spec.ts は it が 31 本で、5 本増えています。投影の子を**受ける**形（境界が受け取る側のコンポーネントを囲むとき、fe75da1af56）、targeted な更新での view の effect のエラー 2 本（ea43e6c3934）、reactive な文脈の外で `onError` を呼ぶ 2 本（3be586f930d）です。多くの it が `async` に書き換わっています。第 4 回の 9 節の表の直しは、どれも spec に it を足しています。

## 4. エラーの行き先の issue

| # | 状態 | 作成 → 閉 | 題（言い換え） | 章 | メモ |
| --- | --- | --- | --- | --- | --- |
| #72027 | 開 | 2026-11-13 | Router のエラーの境界で、同じ RedirectCommand の実体は 1 回目しかリダイレクトしない | [第 4 回](04-err-boundary-runtime.md) | 22.3.0-rc.0 の 262417f1555。読んでいる版には無い。PR #72051 が開いている |
| #69228 | 開 | 2026-06-08 | テンプレートのリスナーが返した Promise の reject を ErrorHandler に渡してほしい | [第 2 回](02-err-where-caught.md) | リスナーの戻り値は await されない |
| #51357 | 開 | 2023-08-14 | DISABLE\_WRAPPING\_UNCAUGHT\_PROMISE\_REJECTION で unhandledrejection が出ない | [第 3 回](03-err-global-listeners.md) | area: zones |
| #51090 | 開 | 2023-07-19 | 既定の provider が自作の provider を上書きするときに警告してほしい | [第 1 回](01-err-handler-core.md) |   |
| #47505 | 開 | 2022-09-21 | クリックのハンドラのエラーでテストを失敗させたい | [第 2 回](02-err-where-caught.md) | P4・needs: discussion。いまの TestBed の投げ直しは testing-errors |
| #18509 | COMPLETED | 2017-08-03 → 2026-10-30 | React 16 の ErrorBoundary のような宣言的なエラー処理 | [第 4 回](04-err-boundary-runtime.md) | 最後のコメントは v22.2 のガイド（error-boundaries）へのリンク。9 年かかった要望 |
| #43504 | COMPLETED | 2021-09-18 → 2026-10-30 | コンポーネントごとに ErrorHandler を与えたい | [第 4 回](04-err-boundary-runtime.md) | 同じ日に、境界が入ったとして閉じられた |
| #70673 | COMPLETED | 2026-09-11 → 2026-09-24 | HMR のあと境界の @error が出ない | [第 4 回](04-err-boundary-runtime.md) | 04ce74197a6（PR #70674）。angular-main のみ |
| #71199 | COMPLETED | 2026-10-06 → 2026-10-07 | 境界の onError が失敗したビューの reactive な文脈で走り、signal に書くと NG0600 | [第 4 回](04-err-boundary-runtime.md) | 3be586f930d（PR #71204）。22.2.6 に入っている |
| #71288 | COMPLETED | 2026-10-10 → 2026-10-14 | @boundary で投影されなくなる要素に NG8011 が出ない | [第 5 回](05-err-boundary-compile.md) | d9bd68258dc（PR #71289）。angular-main のみ |
| #47301 | COMPLETED | 2022-08-31 → 2025-10-17 | ComponentRef で作ったコンポーネントのエラーが ErrorHandler に届かないことがある | [第 2 回](02-err-where-caught.md) | P3・core: dynamic view creation |
| #42957 | COMPLETED | 2021-07-25 → 2025-08-31 | NGxxxx のエラーを全体の ErrorHandler に出してほしい | [第 1 回](01-err-handler-core.md) | feature: under consideration のまま 4 年 |
| #60219 | COMPLETED | 2025-03-05 → 2025-08-20 | httpResource のエラーで ErrorHandler が呼ばれない | [第 2 回](02-err-where-caught.md) | resource はエラーを状態に持つ（resx-errors） |
| #56240 | COMPLETED | 2024-06-03 → 2025-04-25 | zoneless で Angular の外のエラーを捕まえるには | [第 3 回](03-err-global-listeners.md) | #60704（65adb3024d6、provideBrowserGlobalErrorListeners）ほかで完了として閉じられた |
| #62078 | COMPLETED | 2025-06-16 → 2025-06-18 | 全体のリスナーが ResizeObserver の警告で null を渡す | [第 3 回](03-err-global-listeners.md) | 572c32a0387（error の無い ErrorEvent を包む） |
| #55590 | COMPLETED | 2024-04-30 → 2026-04-15 | PromiseRejectionEvent が出ない | [第 3 回](03-err-global-listeners.md) | area: zones |
| #52680 | COMPLETED | 2023-11-08 → 2024-01-03 | ErrorHandler が effect / computed を作ると循環依存になる | [第 1 回](01-err-handler-core.md) |   |
| #70984 | COMPLETED | 2026-09-27 → 2026-10-12 | zone の外で tick を呼び effect が流れると NG0101 が出る | [第 2 回](02-err-where-caught.md) |   |
| #46213 | COMPLETED | 2022-06-01 → 2022-08-01 | リスナーで投げたらテストを失敗にするオプション | [第 2 回](02-err-where-caught.md) | 機能の要望の投票で票が集まらなかったという bot のコメントのあとに閉じられた（stateReason は COMPLETED） |
| #47348 | NOT\_PLANNED | 2022-09-05 → 2022-09-19 | ErrorHandler を複数 provide したい | [第 1 回](01-err-handler-core.md) |   |
| #57106 | NOT\_PLANNED | 2024-07-24 → 2024-07-24 | async 関数のエラーを ErrorHandler が受けない | [第 2 回](02-err-where-caught.md) | 題の上では #69228 と近い |
| #59976 | NOT\_PLANNED | 2025-02-17 → 2025-02-24 | 最初の例外が描画の例外に隠れる | [第 2 回](02-err-where-caught.md) | needs: clarification |
| #63704 | NOT\_PLANNED | 2025-09-10 → 2025-09-15 | withFetch の HTTP エラーを全体の ErrorHandler に回したい | [第 2 回](02-err-where-caught.md) |   |
| #65877 | DUPLICATE | 2025-12-05 → 2025-12-05 | importProvidersFrom の BrowserAnimationsModule が自作の ErrorHandler を上書きする | [第 1 回](01-err-handler-core.md) | 「すでに開いている issue がある」として重複で閉じられた |
| #59802 | DUPLICATE | 2025-01-30 → 2025-01-30 | エラーになる signal で ErrorHandler が無限に呼ばれる | [第 2 回](02-err-where-caught.md) |   |

### 数で見る傾向

- ラベル `core: error handling` の issue は 28 件で、開いているのは 1 件（#17010）だけです。閉じたものは COMPLETED 19・NOT\_PLANNED 8。作られた年：  2016 年 2 件 2017 年 8 件 2018 年 3 件 2020 年 2 件 2021 年 4 件 2022 年 4 件 2023 年 2 件 2024 年 1 件 2025 年 2 件 。2017 年までが 10 件で、2023 年以降は 5 件です。このラベルは最近の issue にはあまり付いていません（境界の 4 件にも付いていない）。
- そのラベルの中で 2025〜2026 年に閉じたのは 7 件で、うち 2 件（#18509 の宣言的なエラー処理、#43504 のコンポーネントごとの ErrorHandler）は 2026-10-30 に、境界が入ったとして COMPLETED になりました。#18509 は 2017-08 の要望です。
- 境界そのものの不具合の issue は、v22.2.0（2026-09-23）の前後の 2 か月で 4 件です（#70673 HMR、#71199 NG0600、#71288 NG8011、#72027 Router）。閉じた 3 件は 1〜13 日で直っています。
- merge 済みの PR 60 件（eh-logs の prs.json）のうち、エラーの境界に関係するのは 15 件です： `fix(core)` #70674（HMR）・#71204（reactive な文脈）・#70976 と #71488（view の effect、main と 22.x の 2 本）・#71885（クロージャ）、`fix(compiler)` #71289 と #71351（NG8011、2 本）、`feat(router)` #71117（Router のエラーの境界）、`test` #70636（25228d0cc3c）・#70791（投影の it）、`docs` #70560・#70917・#71396・#72016、`refactor(vscode-extension)` #70836（ハイライト）。#71289 と #71351、#70976 と #71488 は、同じ直しを main と 22.x の枝に入れた 2 本ずつです。
- 閉じた 20 件のうち NOT\_PLANNED は 4 件で、ErrorHandler への届き方についての要望と質問です（ErrorHandler を複数持ちたい #47348、async 関数のエラー #57106、withFetch の HTTP エラー #63704、最初の例外が隠れる #59976）。開いている #69228（リスナーの Promise）も、届き方の要望です。

## このシリーズで見つけたもの

第 1〜5 回を書いている途中で、エラーのあとで止まったままになる処理や、何も確かめていない spec が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、このサイトの依存の @angular/core 22.1.6 と、Node で動かした 22.2.6 を使いました。gh で検索した範囲では、同じ件を扱った issue は見つかっていません。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| root の effect が 1 つ投げると、同じ回に待っていた後ろの effect が汚れたまま止まる。旗は先に消されているので、次の tick でも `appRef.tick()` を呼んでも走らず、別の root の effect が汚れて初めて走る。ErrorHandler には 1 回しか届かない。angular-main も同じ | application\_ref.ts 619〜621 行目（旗を消してから flush）、root\_effect\_scheduler.ts 132〜133 行目（「TODO: what happens if this throws an error?」） | 第 2 回のデモの「root の effect」の行と、22.1.6・22.2.6 の Node の記録 | [第 2 回](02-err-where-caught.md) |
| error\_handler\_spec.ts の 2 つの it が中身を一度も走らせていない。`() => () => {…}` の形で、jasmine は返った関数を捨てる（b84859073bf から）。別の 2 つの it は、取り消せない `new Event('error')` の `dispatchEvent` の戻り値でハンドラが呼ばれなかったことを確かめているが、呼ばれても true が返る | core/test/error\_handler\_spec.ts 46・71 行目、123・137 行目 | 同じ形の小さな spec が「2 specs, 0 failures」で通ること、Chrome で戻り値を測った結果 | [第 3 回](03-err-global-listeners.md) |
| `@error (let value)` の別名が、@error の中ではなく境界を書いたビューに足される。ホストのコンポーネントに同じ名前のプロパティがあると、ホストのテンプレートの `value` が境界のエラーを読み、本体の中では別のビューの枠を読んで 2 回目の更新で TypeError を投げ、境界が @error に切り替わる。型チェックは別名を @error の中にしか置かないので診断は出ない | compiler の template/pipeline/src/phases/generate\_variables.ts 244〜257 行目 | 22.2.6 の AOT と JIT の Node の記録 | [第 5 回](05-err-boundary-compile.md) |
| `@error (let e = $index)` のような誤った書き方が、パーサの NG5002 ではなく、スタック付きの TS500 になる。パーサはエラーを積むが変数も残すので、型チェックの中で例外になる。`@for` の `let i = $foo` も同じ形 | compiler の render3/r3\_boundaries.ts 73〜79 行目と、型チェックの scope.ts の境界の分岐 | 22.2.6 の compiler-cli で 16 の書き方をコンパイルした記録 | [第 5 回](05-err-boundary-compile.md) |
| 境界の中のビューを作るときに投げられたエラーは、包まずに覚えられる。子の constructor が文字列を投げると @error の `$error` は文字列のまま（更新のときは包まれ、型チェックは Error として扱う）。このときの details は declarationType がホストになり、caughtBy が無い | core の render3/instructions/boundary.ts 159 行目と 164〜173 行目 | 22.2.6 の Node の記録 | [第 4 回](04-err-boundary-runtime.md) |
| （細かいもの）全体のリスナーの `if (e.error)` は、`throw 0` のような偽の値も「error を持たない ErrorEvent」として包む | error\_handler.ts 204 行目 | 第 3 回のデモ | [第 3 回](03-err-global-listeners.md) |

## 聞かれそうな質問

**Q. 境界の spec を 1 本だけ走らせるには？**

`pnpm bazel test //packages/core/test/render3:render3 --nocache_test_results --test_output=all "--test_arg=--filter=<it の名前の一部>"` です。render3 の target は shard が無いので、出力の `Ran N of 574 specs` が 1 つだけ出ます。0 件でも PASSED になるので N を見ます。

**Q. テンプレートの @boundary の出力の期待値はどこにありますか？**

compliance の `packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_boundaries/` の `basic.js` などで、TEST\_CASES.json の 7 件が入力のファイルと期待値のファイルを結びます。走らせる target は `//packages/compiler-cli/test/compliance/full:full`（shard 2 つ）です。

**Q. ErrorHandler の振る舞いを変える直しは、どの spec に足すのが今までの形ですか？**

ErrorHandler 本体と全体のリスナーは `error_handler_spec.ts` の `describe('ErrorHandler')`（:30）、捕まえる場所の直しはその機能の spec（たとえば PendingTasks の 0e16bb701f2 は pending\_tasks\_spec.ts の :112）、境界の直しは `error_boundary_spec.ts` です（3 節の「新しい本家との違い」）。

**Q. ラベル core: error handling で探せば、関係する issue は揃いますか？**

揃いません。ラベルの 28 件のうち 2023 年以降は 5 件で、境界の 4 件にはどれも付いていません（付いているのは `area: core` などだけ）。題に ErrorHandler・boundary・global error を含むもので探し直して、4 節の表を作りました。

## 読み終えて

- ErrorHandler と全体のリスナーは error\_handler\_spec.ts、捕まえる場所は機能ごとの spec、境界の実行時は error\_boundary\_spec.ts の 26 本、コンパイラの側は 4 か所。
- render3 の下のコンパイラの spec は `//packages/compiler/test/render3:test`。filter が 0 件でも PASSED になるので `Ran` を見る。
- 境界の作るときの `details` と、Error でない値の `$error` を見る it はまだ無い。
- 境界の不具合の issue は v22.2.0 の前後 2 か月で 4 件、閉じた 3 件は 2 週間以内に直った。

---

← 前: [@boundary のコンパイル：字句解析から型チェックまで](05-err-boundary-compile.md)
