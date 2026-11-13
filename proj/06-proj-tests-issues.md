[目次](../README.md) › [ng-content と投影の内側](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：投影の振る舞いを決めているテスト

> core の acceptance/content\_spec.ts（2386 行）と linker/projection\_integration\_spec.ts を中心に、投影の約束をどの it が固めているかの地図。コンパイラの compliance テストと ngtsc の診断の spec、ハイドレーションの spec。手元での走らせ方と結果。投影に関係する開いている issue と閉じた issue の表。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/proj-tests-issues)

---

シリーズの最後に、投影の振る舞いを固めている spec がどのファイルのどの describe にあり、第 1〜5 回の約束がどの it で確かめられているかを地図にします。手元で走らせた数を書き、ラベル `core: content projection` の issue（開いている 12 件・閉じた 44 件、2026-11-11 に取得）と、題と本文で探した関連の issue から 43 件を選んで、どの章の行に関係するかを振り分けます。

読む対象は `packages/core/test/acceptance/content_spec.ts`・`core/test/linker/projection_integration_spec.ts`・`core/test/render3/node_selector_matcher_spec.ts` と、コンパイラの compliance テストの `content_projection`、`compiler-cli/test/ngtsc/template_typecheck_spec.ts` の診断の describe、`platform-server/test/full_app_hydration_spec.ts` の投影の describe、それぞれの `BUILD.bazel` です。ターゲットの読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、spec の書き方は[spec の読み方](../contrib/06-contrib-reading-specs.md)にあります。

1. [1. 1 行の ng-content が生むもの](01-proj-what-declared.md)
2. [2. コンパイラの側](02-proj-compile.md)
3. [3. 振り分け](03-proj-distribute.md)
4. [4. 描画と再投影](04-proj-render.md)
5. [5. 動的な投影とよくある誤解](05-proj-dynamic.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

ファイルごとの一番外の describe、その中の describe ごとの it の数（describe の入れ子を字下げでたどり、`it(` と `xit(` の行を数えたもの）と、bazel で実際に走った数です。

| ファイル（行数） | 一番外の describe（行） | 中の describe（行）と it の数 | it の行 | 走った数 | ターゲット |
| --- | --- | --- | --- | --- | --- |
| `core/test/acceptance/content_spec.ts`（2386） | `projection`（30） | `（一番外の describe の直下の it）` … 25<br>`with selectors`（811）… 11<br>`on inline templates (e.g. *ngIf)（中の on containers を含む）`（1415）… 9<br>`on containers`（1625）… 3<br>`fallback content`（1768）… 18<br> | 63 | 63 | `//packages/core/test/acceptance:acceptance` |
| `core/test/linker/projection_integration_spec.ts`（1125） | `projection`（32） | `（一番外の describe の直下の it）` … 32<br>`projectable nodes`（718）… 7<br> | 39 | 36（Node では 3 件が登録されない） | `//packages/core/test:test（shard 4）` |
| `compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/content_projection/TEST_CASES.json` | `[r3_compiler_compliance/components_and_directives/content_projection]` | `ケース（description）` … 10<br> | 10 | 10（5 + 5） | `//packages/compiler-cli/test/compliance/full:full` |
| `compiler-cli/test/ngtsc/template_typecheck_spec.ts`（9492） | `ngtsc type checking`（27） | `control flow content projection diagnostics`（7185）… 17<br> | 17 | 68（17 × 4 つのファイルシステム） | `//packages/compiler-cli/test/ngtsc:ngtsc（shard 4）` |
| `core/test/render3/node_selector_matcher_spec.ts`（753） | `css selector matching`（25） | `isNodeMatchingSimpleSelector`（38）… 25<br>`negations`（362）… 8<br>`isNodeMatchingSelectorList`（501）… 3<br>`reading the ngProjectAs attribute value`（533）… 4<br> | 40 | 40（うち xit が 1） | `//packages/core/test/render3:render3` |
| `platform-server/test/full_app_hydration_spec.ts`（8367） | `platform-server full application hydration integration`（95） | `content projection`（4753）… 29<br>`partial projection（content projection の中）`（5293）… 5<br> | 29 | 30（別の describe の it が 1 つ名前で合う） | `//packages/platform-server/test:test` |

content\_spec.ts の `on inline templates`（9 件）は、中の `on containers`（3 件）を含んだ数です。template\_typecheck\_spec.ts の 17 件と full\_app\_hydration\_spec.ts の 29 件は、ファイル全体ではなく、表の describe の中だけの数です。full\_app\_hydration\_spec.ts を `hydration integration .*content projection` で絞ると 30 件になるのは、別の describe の it「should support nested content projection」（1985 行目）も名前で合うからです。

### Node では登録されない 3 件

📄 `angular/packages/core/test/linker/projection_integration_spec.ts` L489–509 （▶ の行: 489–490, 506, 508–509）

```ts
489 ▶   if (!isNode) {
490 ▶     it('should support shadow dom content projection and isolate styles per component', () => {
491 │       TestBed.configureTestingModule({declarations: [SimpleShadowDom1, SimpleShadowDom2]});
492 │       TestBed.overrideComponent(MainComp, {
493 │         set: {
494 │           template:
495 │             '<simple-shadow-dom1><div>A</div></simple-shadow-dom1>' +
496 │             '<simple-shadow-dom2><div>B</div></simple-shadow-dom2>',
497 │         },
498 │       });
499 │       const main = TestBed.createComponent(MainComp);
500 │ 
501 │       const childNodes = main.nativeElement.childNodes;
502 │       expect(childNodes[0]).toHaveText('div {color: red}SIMPLE1(A)');
503 │       expect(childNodes[1]).toHaveText('div {color: blue}SIMPLE2(B)');
504 │       main.destroy();
505 │     });
506 ▶   }
507 │ 
508 ▶   if (getDOM().supportsDOMEvents) {
509 ▶     it('should support non emulated styles', () => {
```

projection\_integration\_spec.ts の it の行は 39 ですが、`//packages/core/test:test`（Node）では 36 件です。489 行目の `if (!isNode)` が Node では偽で、490 行目の Shadow DOM の it が登録されません。508 行目の `if (getDOM().supportsDOMEvents)` も Node では偽で、509 行目と、その下の「should support emulated style encapsulation」の 2 件も登録されません。この 3 件は、ブラウザで走る `//packages/core/test:test_web` の側にだけあります（今回は走らせていません）。

### 同じテストを何度も走らせる 2 つの形

- **compliance**：テストの本体は TEST\_CASES.json と期待値の .js です。`full` のターゲットは 2 つに分かれて走り、content\_projection の 10 ケースは 5 + 5 で出ます。ケースの名前は `test_runner.ts` が `[相対パス]/…` の形で作るので、`--filter=content_projection\]` でこのディレクトリだけに絞れます。
- **ngtsc の診断**：template\_typecheck\_spec.ts は `runInEachFileSystem` の中にあり、OS/X・Windows・Unix・Native の 4 つの模擬のファイルシステムで同じ describe を作ります（[型検査の全体像の章](../typecheck/01-typecheck-overview.md)の `test_helper.ts`）。17 件 × 4 = 68 件が、4 つの shard に 16 + 16 + 16 + 20 で分かれて走りました。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/content_projection/TEST_CASES.json` L28–37 （▶ の行: 29–30, 34）

```json
28 │     {
29 ▶       "description": "should support multi-slot content projection with multiple wildcard slots",
30 ▶       "inputFiles": ["multiple_wildcards.ts"],
31 │       "expectations": [
32 │         {
33 │           "failureMessage": "Invalid content projection instructions generated",
34 ▶           "files": ["multiple_wildcards.js"]
35 │         }
36 │       ]
37 │     },
```

29 行目のケースは、ワイルドカードの枠が複数あるコンポーネントの出力（`ngContentSelectors` と `ɵɵprojection` の番号）を、34 行目の期待値のファイルと比べます。実行時に「最後のワイルドカードが勝つ」（[第 5 回](05-proj-dynamic.md) 2 節）のは、この出力に番号の違う 2 つの枠があるからです。

## 2. 各章の約束と、それを固めている it

| 章 | 約束 | it |
| --- | --- | --- |
| [第 1 回 全体像](01-proj-what-declared.md) | 枠を宣言するのは中の側（ngContentSelectors・ɵɵprojectionDef・ɵɵprojection） | compliance の content\_projection の「should support content projection in root template」ほか（root\_template\_\*.js が出力の形） |
| [第 1 回 全体像](01-proj-what-declared.md) | 投影の基本（子が ng-content の場所に出る） | content\_spec.ts 42 行目「should project content」、68・94 行目 |
| [第 2 回 コンパイラの側](02-proj-compile.md) | ngProjectAs は解析済みのセレクタとして定数に入る | compliance「should parse the selector that is passed into ngProjectAs」「should include parsed ngProjectAs selectors into template attrs」 |
| [第 2 回 コンパイラの側](02-proj-compile.md) | 既定の内容は別のテンプレート関数になる | compliance「should support fallback content in ng-content」（ng\_content\_fallback.js） |
| [第 2 回 コンパイラの側](02-proj-compile.md) | 制御フローのせいで投影されない要素の診断 | template\_typecheck\_spec.ts 7185 行目の describe（17 件）。preserveWhitespaces の件は 7498 行目 |
| [第 3 回 振り分け](03-proj-distribute.md) | 最初に合った枠が勝つ | content\_spec.ts 901 行目「should project nodes into the first matching selector」 |
| [第 3 回 振り分け](03-proj-distribute.md) | ワイルドカードは余り物を受け取る（書く位置によらない） | content\_spec.ts 930・961 行目（ng-content first） |
| [第 3 回 振り分け](03-proj-distribute.md) | ngProjectAs の値で照合し、複数のセレクタは最初の 1 つ | content\_spec.ts 1078・1256・1305・1349 行目、node\_selector\_matcher\_spec.ts 533 行目の describe |
| [第 3 回 振り分け](03-proj-distribute.md) | @if / \*ngIf のブロックは 1 つのノードとして、中身の要素名と属性で振り分ける | content\_spec.ts 1415 行目の describe（9 件）、1138 行目「should match selectors against projected containers」 |
| [第 4 回 描画と再投影](04-proj-render.md) | 再投影（入れ子の ng-content を外へたどる） | content\_spec.ts 120 行目「should be able to re-project content」、283・724・767 行目 |
| [第 4 回 描画と再投影](04-proj-render.md) | 既定の内容は、枠の先頭の TNode が null のときだけ | content\_spec.ts 1769・1804・1865・1911 行目 |
| [第 4 回 描画と再投影](04-proj-render.md) | 既定の内容は ng-content の属性ごと再投影される | content\_spec.ts 2213 行目 |
| [第 4 回 描画と再投影](04-proj-render.md) | 既定の内容は毎回宣言し、出さないときは中のディレクティブを作らない | content\_spec.ts 2258・2295・2325 行目 |
| [第 5 回 動的な投影と誤解](05-proj-dynamic.md) | ワイルドカード 2 つは後ろの ng-content に入る | content\_spec.ts 505 行目「should project nodes into the last ng-content」 |
| [第 5 回 動的な投影と誤解](05-proj-dynamic.md) | @for / \*ngFor の中の 1 つの ng-content は、最後に描いた行に移る | content\_spec.ts 535 行目 |
| [第 5 回 動的な投影と誤解](05-proj-dynamic.md) | projectableNodes は番号で枠に入り、空の配列は既定の内容 | content\_spec.ts 2123・2149 行目、projection\_integration\_spec.ts 718 行目の describe（7 件） |

書いている途中で、固めている it が見つからなかった振る舞いです（どれもページの上の DEMO では確かめた）。

- [第 4 回](04-proj-render.md)：再投影で、外の ng-content に既定の内容が無く、外に何も渡されていないとき、内の ng-content の既定の内容は出ない（DEMO のケース 1）。content\_spec.ts 2213 行目の it は、外に既定の内容がある形だけを見ていて、内の既定の内容が出ないことも確かめていない。
- [第 5 回](05-proj-dynamic.md)：`@if` の中の ng-content を閉じても、投影したコンポーネントは破棄されない（DEMO 3）。content\_spec.ts と projection\_integration\_spec.ts を `destroy` で grep した範囲には無い。
- [第 5 回](05-proj-dynamic.md)：`@for` のブロックの直下に ng-content があるとき、中身の無い行を消しても、別の行にある中身が document から外れる（DEMO 2 の `prd-in-for-root`）。535 行目の it は行を消さない。

## 3. 手元で走らせた結果

📄 `走らせたコマンド（2026-11-11、8576f161ae4）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all '--test_arg=--filter=^projection '
pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all '--test_arg=--filter=^projection '
pnpm bazel test //packages/compiler-cli/test/compliance/full:full --nocache_test_results --test_output=all '--test_arg=--filter=content_projection\]'
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc --nocache_test_results --test_output=all '--test_arg=--filter=control flow content projection diagnostics'
pnpm bazel test //packages/core/test/render3:render3 --nocache_test_results --test_output=all '--test_arg=--filter=^css selector matching'
pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all '--test_arg=--filter=hydration integration .*content projection'
```

| ターゲットとフィルタ | 結果 | ログ（proj-logs/） |
| --- | --- | --- |
| `acceptance` の `^projection ` | Ran 63 of 2693 specs、0 failures | b-acc-projection.log |
| `acceptance` の `^projection fallback content` ／ `with selectors` ／ `on inline templates` | 18 ／ 11 ／ 9、どれも 0 failures | b-acc-fallback.log ほか |
| `core/test:test` の `^projection ` | 9 + 9 + 9 + 9 = 36、0 failures | b-core-projection.log |
| `core/test:test` の `^projection projectable nodes` | 2 + 2 + 1 + 2 = 7、0 failures | b-core-projectable.log |
| `compliance/full` の `content_projection\]` | 5 + 5 = 10、0 failures | b-compliance-full.log |
| `ngtsc` の `control flow content projection diagnostics` | 16 + 16 + 16 + 20 = 68、0 failures | b-ngtsc-diag.log |
| `render3` の `^css selector matching` | Ran 40 of 574 specs、0 failures、1 pending（xit） | b-r3-selector.log |
| `platform-server/test:test` の `hydration integration .*content projection` | Ran 30 of 399 specs、0 failures | b-ps-hydration-projection.log |

`^projection ` の後ろの空白は、一番外の describe `projection` だけに絞るためです。`//packages/core/test:test` の数が 4 つに分かれているのは shard ごとに出るからで、足した数が Node で登録される it の数（36・7）と合います。shard ごとの「Ran 9 of 1374」の分母は、走らせるたびに変わることがあります（今回 `projectable nodes` では 1396 と 1395）。

新しい本家（angular-main、74961c66242）では、content\_spec.ts は「modernize unit tests」の 2 つのコミット（ecbc89b465c・fade609afde、2026-10）で 2386 行から 2067 行に書き直され、it の行は 63 のままです。投影の実装の instructions/projection.ts は手元の木と同じです。node\_manipulation.ts は、7e678e0ed72（2026-09、並べ替えの途中の leave のアニメーションの修正）で `applyToElementOrContainer` の「入れる」の枝が、使い回しのノードには入場のアニメーションを積まないようになり、行が 2 つ増えました。第 4・5 回で引用した node\_manipulation.ts の行（735 行目より後ろ）は、angular-main では 2 行ずつ後ろにずれます（`applyProjection` は 990 行目）。

## 4. 投影の issue

| # | 状態 | 題 | 章 | メモ |
| --- | --- | --- | --- | --- |
| #64504 | 開（2025-10-17） | Canonical: Content Projection | [第 4 回 描画と再投影](04-proj-render.md)<br>[第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | 投影の設計から来る症状をまとめる canonical。2025-10-17〜18 に多くの issue がこの重複として閉じられた |
| #7795 | 開（2016-03-28） | Inconsistant projection behavior | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | 2 つの \*ngIf にワイルドカードの ng-content を 1 つずつ。後ろの枠にだけ入る（第 5 回 2 節の 1 つ目） |
| #26083 | 開（2018-09-24） | No ability to check if &lt;ng-content&gt; was provided to the component | [第 4 回 描画と再投影](04-proj-render.md)<br> | 枠が空かどうかを知る公開の API の要望。実行時の判定は ɵɵprojection の中だけ |
| #29395 | 開（2019-03-19） | Detect ng-content changes | [第 4 回 描画と再投影](04-proj-render.md)<br> | 機能の要望（feature: under consideration） |
| #46269 | 開（2022-06-06） | Content projection for templates | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | ng-template を投影の単位にしたいという要望 |
| #52552 | 開（2023-11-06） | Scoped Slots (similar to Vue) | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | 中から外へ値を渡す枠の要望。今は ng-template と ngTemplateOutlet の context で書く |
| #47732 | 開（2022-10-11） | Problem with nested projected content | [第 4 回 描画と再投影](04-proj-render.md)<br> | 再投影したものを contentChildren で取れない。クエリは書かれた場所で決まる（qry-content-projection） |
| #54035 | 開（2024-01-23） | @if(A && B) {} should be the same as @if (A) { @if(B) {}} but is not | [第 3 回 振り分け](03-proj-distribute.md)<br> | 入れ子の @if では、外の @if の中身が要素 1 つではない（@if のブロック）ので、select の枠に合わない |
| #54077 | 開（2024-01-25） | NG8011: Node matches the X slot of the Y component, but will not be projected into the specific slot … | [第 2 回 コンパイラの側](02-proj-compile.md)<br> | 診断の文が勧める直し方が当てはまらない形 |
| #59398 | 開（2025-01-07） | Suggested workaround for content-projection in control flow blocks does not work | [第 2 回 コンパイラの側](02-proj-compile.md)<br> | 同じく診断の文の件（area: docs、open for contributions） |
| #71881 | 開（2026-11-08） | Report bindings that have no effect on ng-container, ng-template, and ng-content | [第 2 回 コンパイラの側](02-proj-compile.md)<br> | ng-content に書いても効かない属性・バインディングを診断にする要望 |
| #68196 | 開（2026-04-14） | feat(core): support applying CSS classes directly to ng-content | [第 4 回 描画と再投影](04-proj-render.md)<br> | ng-content は要素にならない（ɵɵprojection は TNode だけで DOM を作らない） |
| #64228 | 開（2025-10-04） | Angular Elements content projection should require Shadow DOM | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | Elements の投影は projectableNodes（elements-connect） |
| #31242 | 開（2019-06-24） | \[Elements\] Slots working for an angular Element, but not Component | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | ShadowDom の &lt;slot&gt; と ng-content の違い |
| #12530 | 閉（2016-10-25 → 2024-03-26 completed） | ng-content default content | [第 2 回 コンパイラの側](02-proj-compile.md)<br>[第 4 回 描画と再投影](04-proj-render.md)<br> | a600a39d0cf（v18、PR #54854）で既定の内容が入った |
| #55466 | 閉（2024-04-22 → 2024-04-25 completed） | Fallback content throws with multiple components v18.x | [第 4 回 描画と再投影](04-proj-render.md)<br> | 97eea8d50ea で「毎回宣言だけはする」形に（第 4 回 2 節の 164〜175 行目） |
| #57471 | 閉（2024-08-21 → 2024-08-27 completed） | Default ng-content fallback doesn't work with custom elements or dynamic components using projectableNodes | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | 7b1e5be20b9 で空の配列を null に（第 5 回 1 節） |
| #62046 | 閉（2025-06-13 → 2025-10-17 duplicate） | Fallback for &lt;ng-content&gt; does not work if projected content is inside a @if | [第 4 回 描画と再投影](04-proj-render.md)<br> | @if のコンテナが枠の先頭にいる（第 4 回 3 節の 197 行目、DEMO のケース 3） |
| #66510 | 閉（2026-01-13 → 2026-01-13 not planned） | ng content fallback elements not showing when its select attribute is "mentioned" even when it isnt used | [第 4 回 描画と再投影](04-proj-render.md)<br> | 同じ形（@if (false) の中の \[slot\]）。既知の制限として #62046 と #64504 を案内 |
| #63065 | 閉（2025-08-08 → 2025-08-15 completed） | Localized content with html as fallback in ng-content fails: Cannot read properties of undefined … | [第 2 回 コンパイラの側](02-proj-compile.md)<br> | 訳のある子を持つ既定の内容。5b3933f1ae5（PR #63156）でコンパイラの側を直した |
| #40483 | 閉（2021-01-19 → 2021-01-19 completed） | ng-content childs initiliazed even without any render points | [第 4 回 描画と再投影](04-proj-render.md)<br>[第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | 描く場所が無くても子が作られる（第 4 回 1 節）。その日のうちに閉じ、議論はそのあとも続いた |
| #47571 | 閉（2022-09-28 → 2022-10-01 not planned） | \[Content Projection\] ngIf/ngSwitch on an ng-content does not destroy the projected component(s) | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | 第 5 回 3 節・DEMO 3 |
| #64498 | 閉（2025-10-17 → 2025-10-17 duplicate） | the component used inside ng-content which is inside @if is not destroyed when the condition is false | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | 同上（v20.3） |
| #61282 | 閉（2025-05-12 → 2025-05-12 duplicate） | Multiple usage of ng-content inside if and else block not working | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | #7795 の重複として閉じた |
| #35357 | 閉（2020-02-12 → 2025-06-12 completed） | Angular 9: projectable nodes change position | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | \*ngIf の中の複数の ng-content。「意図どおり。順を保証したいなら ngTemplateOutlet」として閉じた |
| #56750 | 閉（2024-06-28 → 2024-08-15 completed） | Projecting projected content through an ng-template causes \`Cannot read properties of null …\` during hydration annotation | [第 4 回 描画と再投影](04-proj-render.md)<br> | 再投影 + ng-template + ハイドレーション。d4449fce21b（PR #57383）（core: hydration） |
| #64311 | 閉（2025-10-09 → 2025-10-09 not planned） | \`@for\` control flow doesn't properly recreate components when used inside \`ng-content\` with \`OnPush\` … | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | 再現が無く閉じた（needs reproduction） |
| #54881 | 閉（2024-03-15 → 2025-10-18 duplicate） | Projected content is not hidden when dynamically creating a component if there is nowhere to project the content yet | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | projectNodes は元の場所から外さない（第 5 回 1 節の warn） |
| #51421 | 閉（2023-08-18 → 2025-10-17 duplicate） | Add the ability to set projectableNodes after createComponent | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | 枠は作るときに 1 回だけ入る（component\_ref.ts 415〜416 行目） |
| #49050 | 閉（2023-02-13 → 2023-02-13 not planned） | Dynamic Components are not working with Projectable Nodes | [第 5 回 動的な投影と誤解](05-proj-dynamic.md)<br> | projectableNodes で渡したノードの変更検知の報告。createComponent を使うよう案内されて閉じた |
| #54840 | 閉（2024-03-13 → 2024-03-22 completed） | Conditionals and content projection | [第 3 回 振り分け](03-proj-distribute.md)<br> | @if と @else の中身が、最初の分岐の枠にまとめて入っていた。1c0ec56c462（PR #54921）で分岐ごとに別のコンテナにした |
| #54872 | 閉（2024-03-15 → 2024-03-15 completed） | Dynamically generated content is not projected | [第 2 回 コンパイラの側](02-proj-compile.md)<br> | テンプレートパイプラインの回帰。879bd80b571（PR #54876）でブロックのデータバインディングも投影の照合に使うようにした |
| #71162 | 閉（2026-10-03 → 2026-10-06 completed） | Inline \`&lt;svg&gt;\` at the root of a control flow block is not matched by an \`ng-content\` tag selector | [第 2 回 コンパイラの側](02-proj-compile.md)<br>[第 3 回 振り分け](03-proj-distribute.md)<br> | ブロックの根の svg が tag のセレクタに合わなかった。0244a1cb312（2026-10-03）で直した（area: compiler） |
| #71397 | 閉（2026-10-16 → 2026-10-16 completed） | NG8011 isn't reported when a \`@defer\` block prevents a node from being projected | [第 2 回 コンパイラの側](02-proj-compile.md)<br> | @defer のブロックでも NG8011 を出すようにという報告（area: compiler） |
| #58110 | 閉（2024-10-07 → 2025-10-17 duplicate） | ng-content doesn't project deferrable views | [第 3 回 振り分け](03-proj-distribute.md)<br> | @defer のブロックは select の枠に合わない（core: defer） |
| #44755 | 閉（2022-01-19 → 2025-10-17 duplicate） | ngProjectAs not working when applied inside ng-container | [第 3 回 振り分け](03-proj-distribute.md)<br> | 照合するのはホストの直下の子だけ |
| #55438 | 閉（2024-04-19 → 2025-10-18 duplicate） | ngProjectedAs not working when used as static host property inside @Component | [第 2 回 コンパイラの側](02-proj-compile.md)<br>[第 3 回 振り分け](03-proj-distribute.md)<br> | ngProjectAs はテンプレートの属性から作る定数（host の属性ではない） |
| #46893 | 閉（2022-07-19 → 2022-09-28 not planned） | Multi-slotted content projection doesn’t work with \`ng-container\` and \`\*ngFor\` | [第 3 回 振り分け](03-proj-distribute.md)<br> | \*ngFor の ng-container は 1 つのノード |
| #37328 | 閉（2020-05-28 → 2025-10-17 duplicate） | Content projection with \`select\` can be confusing | [第 3 回 振り分け](03-proj-distribute.md)<br> | type: confusing |
| #13621 | 閉（2016-12-21 → 2022-03-28 completed） | Make ng-content's select attribute accept proper/multiple CSS selectors. | [第 3 回 振り分け](03-proj-distribute.md)<br> | セレクタは CSS ではない（projection の章） |
| #50511 | 閉（2023-05-30 → 2023-05-30 not planned） | ng-content select selector does not support :first-child, :last-child, :nth-child(), ... | [第 3 回 振り分け](03-proj-distribute.md)<br> | 擬似クラスは使えない（projection の章） |
| #71813 | 閉（2026-11-04 → 2026-11-04 duplicate） | Allow dynamic ng-content select | [第 3 回 振り分け](03-proj-distribute.md)<br> | 振り分けは作成のときに 1 回だけ（\[class.x\] は見ない） |
| #65269 | 閉（2025-11-17 → 2025-11-17 not planned） | Content projection fails when multiple @if | [第 3 回 振り分け](03-proj-distribute.md)<br> | 入れ子の @if（#54035 と同じ形） |

ラベル `core: content projection` の開いている 12 件のうち 7 件に `feature` が付き、`type: bug/fix` が付いているのは #7795・#31242 の 2 件です。2025-10-17 に canonical の #64504 が作られ、その日と翌日に、既定の内容と `@if`（#62046）、動的な作成で投影先が無い場合（#54881）、ngProjectAs（#44755・#55438）、`@defer`（#58110）などが、その重複として閉じられました。閉じた issue で多いのは「`@if` と投影」の組み合わせで、振り分けの側（[第 3 回](03-proj-distribute.md)）と、既定の内容の判定（[第 4 回](04-proj-render.md)の 197 行目）、DOM の移動（[第 5 回](05-proj-dynamic.md)）の 3 か所の行で説明できます。

## 書いている途中で見つかったもの

第 4・5 回を書く途中で、既存の it が固めていない振る舞いが 2 つ見つかりました。どちらも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で、ページの上の本物（このサイトの 22.1.6）で確かめました。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| `@for (r of rows; track r) {…<ng-content />}` のように ng-content がブロックの直下にあると、中身の無い行を消しただけで、最後の行にある中身が document から外れる。残った行には戻らない | 行のビューを外す道が node\_manipulation.ts の `applyNodes` の ng-content の分岐（854〜862 行目）から `applyProjectionRecursive` に入り、枠のノードを今どこにあっても `remove()` する | 第 5 回の DEMO 2 の `prd-in-for-root`（行 1, 2, 3 → 先頭を消す → `[行 2][行 3]` で中身が `isConnected === false`） | [第 5 回](05-proj-dynamic.md) |
| 再投影で、外の ng-content に既定の内容が無く、外に何も渡されていないと、内の ng-content の既定の内容も出ない（何も出ない） | instructions/projection.ts 197 行目。内から見た枠の先頭は外の ng-content の TNode なので空ではない | 第 4 回の DEMO のケース 1（`middle の既定（title）\| ` の後ろが空） | [第 4 回](04-proj-render.md) |

## 書いている途中で見つかったもの

第 1〜5 回を書く途中で、実行時に落ちる書き方と、DOM の付け外しの食い違いと、古くなったコメントが見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめ、再現はこのサイトの依存の @angular/\* 22.1.6 で行いました。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| `<div ngProjectAs="">` のように値を空にすると、中の側に `*` 以外の枠が 1 つでもあるとき、最初の描画で `TypeError: Cannot read properties of undefined (reading 'length')` になる。コンパイルの診断は出ない | compiler の const\_collection.ts 247 行目で `parseSelectorToR3Selector('')[0]` が undefined になり定数に入る。core の projection.ts 61 行目は `=== null` だけを見るので、node\_selector\_matcher.ts 347 行目の `selector.length` まで進む | 第 3 回のデモ（「ngProjectAs="" を試す」）と、ngtsc にかけた記録（定数が `["ngProjectAs","",5,undefined]`）。angular-main でも同じコード | [第 3 回](03-proj-distribute.md) |
| `@for` の直下に `<ng-content />` を書き、中身の無い先頭の行を消すと、最後の行に描かれていた投影の中身が document から外れ、どの行にも戻らない。ng-content を要素で包むと起きない | 行のビューを外すときに node\_manipulation.ts 854〜862 行目から applyProjectionRecursive に入り、投影されたノードを今どこにあっても外す | 第 5 回のデモ 2（「@for の直下」で描いてから先頭の行を消す）。この形を固める it は content\_spec.ts に無い | [第 4 回](04-proj-render.md)・[第 5 回](05-proj-dynamic.md) |
| 再投影のとき、外の ng-content に既定の内容が無く外に何も渡されていないと、内の ng-content の既定の内容も出ない（何も表示されない） | projection.ts 197 行目。内から見た枠の先頭は外の ng-content の TNode なので、空と判定されない | 第 4 回のデモのケース 1。content\_spec.ts 2213 行目の it は外に既定の内容がある形だけ | [第 4 回](04-proj-render.md) |
| （仕様の可能性あり）ngProjectAs は select と配列の完全一致で比べるので、`ngProjectAs="div[header]"` は `select="[header]"` に入らない。また、ちょうど `h2` とだけ書いたテキストが `select="h2"` の枠に入る | node\_selector\_matcher.ts 347〜354 行目（完全一致）と、テキストの TNode の value がタグ名の照合に使われること（84 行目の説明は「型も見る」） | 第 3 回のデモ | [第 3 回](03-proj-distribute.md) |
| projection.ts のコメント 2 か所が古い形を説明している（テキストのセレクタの引数、枠の番号の数え方） | projection.ts 77〜87 行目（def73a6728e で引数は無くなった）と 138〜140 行目（aca339e8642 より前の数え方） | git show | [第 1 回](01-proj-what-declared.md) |

## 聞かれそうな質問

**Q. 投影の振る舞いを変えたら、どの spec を走らせればいいですか？**

まず `//packages/core/test/acceptance:acceptance` を `--test_arg=--filter=^projection ` で（63 件）。linker の `//packages/core/test:test` の `^projection `（Node で 36 件）も同じ名前なので、続けて走らせます。出力の形を変えたら compliance の `content_projection\]`、診断なら ngtsc の `control flow content projection diagnostics`、ハイドレーションに関わるなら platform-server の `content projection` です。

**Q. projection\_integration\_spec.ts が、ファイルの it より少なく走るのはなぜですか？**

489 行目の `if (!isNode)` と 508 行目の `if (getDOM().supportsDOMEvents)` の中の 3 件は、Node では登録されません。ブラウザのターゲット（`test_web`）でだけ走ります。

**Q. 診断の spec が 17 件なのに 68 件走るのはなぜですか？**

template\_typecheck\_spec.ts は `runInEachFileSystem` で、4 つの模擬のファイルシステムごとに同じ describe を作るからです。`--filter` は 4 つ全部に合います。

**Q. 「@if の中の子だと既定の内容が出ない」は不具合ですか？**

#62046 は canonical の #64504 の重複として閉じられ、#66510 は「既知の制限」として not planned で閉じられています。振る舞いは content\_spec.ts 1865 行目の it が固めていて、理由は第 4 回の 197 行目（枠の先頭の TNode の有無だけを見る）です。

## 読み終えて

- 投影の spec の中心は acceptance/content\_spec.ts（63 件、describe `projection`）と linker/projection\_integration\_spec.ts（Node で 36 件、うち projectable nodes が 7 件）。
- 出力の形は compliance の content\_projection の 10 ケース、診断は ngtsc の 17 件 × 4 つのファイルシステム。
- 開いている issue の多くは要望と設計の議論で、2025-10 から canonical の #64504 にまとめられている。
- @if と投影の組み合わせの issue は、振り分け・既定の内容の判定・DOM の移動の 3 か所の行で説明できる。

---

← 前: [動的な投影：createComponent の projectableNodes と、よくある誤解](05-proj-dynamic.md)  
次: [params から状態を返す：ResourceParamsStatus と chain()](../resx/01-resx-params-status.md) →
