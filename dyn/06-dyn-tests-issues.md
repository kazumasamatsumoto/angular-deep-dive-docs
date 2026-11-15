[目次](../README.md) › [動的コンポーネント：createComponent と ViewContainerRef](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：動的コンポーネントを固めているテスト

> acceptance の create\_component・view\_container\_ref・security・query の spec と、core の直下の test\_bed・application\_ref の spec が、このシリーズの各章の約束をどこで固めているか（render3 の component\_ref\_spec.ts は 2026-04 の df9eed4ff1d で消えた）。手元での走らせ方と結果、動的コンポーネントの開いている issue と閉じた issue の表と傾向。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/dyn-tests-issues)

---

シリーズの最後に、第 1〜5 回の約束を固めている spec がどのファイルのどの describe にあり、どの Bazel の target で走るかを地図にします。手元で走らせた数を書き、動的コンポーネントに関係する issue から 30 件（開いている 12 件、閉じた 18 件。2026-11-15 に gh で取得）を選んで、どの章に関係するかを振り分けます。

読む対象は `packages/core/test/acceptance/` の `create_component_spec.ts`・`view_container_ref_spec.ts`・`security_spec.ts`・`query_spec.ts`、`packages/core/test/` の `test_bed_spec.ts`・`application_ref_spec.ts`、`packages/common/test/directives/ng_component_outlet_spec.ts` と、それぞれの `BUILD.bazel` です。target の読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. 2 つの入口](01-dyn-entry-points.md)
2. [2. ComponentFactory.create の中](02-dyn-factory-create.md)
3. [3. directives の選択肢](03-dyn-directives.md)
4. [4. bindings と ComponentRef](04-dyn-bindings-ref.md)
5. [5. ViewContainerRef とホストの守り](05-dyn-vcr-host.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

行番号は 8576f161ae4 で `grep -n` したもの、it の数は describe の範囲の `it(` を数えたものです。target は spec のある場所の `BUILD.bazel` を読んで決めました。

| ファイル（packages/core/test/ から） | describe / it（行） | 数 | target | 章 |
| --- | --- | --- | --- | --- |
| `acceptance/create_component_spec.ts` | describe('createComponent') :41 の直下（:42 standalone・:66 NgModule・:98 投影・:129 環境の注入器・:151 NodeInjector・:202 ホストの要素を作る・:228 div に落ちる） | it 7 本 | `//packages/core/test/acceptance:acceptance` | [第 1 回](01-dyn-entry-points.md)・[第 2 回](02-dyn-factory-create.md) |
| `acceptance/create_component_spec.ts` | describe('attaching directives to root component') :258（:348 host directive の順・:455 一緒に壊れる・:596 DirectiveWithBindings・:638 standalone でない） | it 11 本 | `//packages/core/test/acceptance:acceptance` | [第 3 回](03-dyn-directives.md) |
| `acceptance/create_component_spec.ts` | describe('root component inputs') :660（:1120 NG0317・:1142 OnPush に印・:1168 formField） | it 14 本 | `//packages/core/test/acceptance:acceptance` | [第 4 回](04-dyn-bindings-ref.md)・[第 3 回](03-dyn-directives.md) |
| `acceptance/create_component_spec.ts` | describe('root component outputs') :1197（:1225 壊すと外れる・:1250 ErrorHandler・:1437 DOM のイベントにしない） | it 8 本 | `//packages/core/test/acceptance:acceptance` | [第 4 回](04-dyn-bindings-ref.md) |
| `acceptance/create_component_spec.ts` | describe('root component two-way bindings') :1457（:2022 NG0317） | it 11 本 | `//packages/core/test/acceptance:acceptance` | [第 4 回](04-dyn-bindings-ref.md) |
| `acceptance/create_component_spec.ts` | describe('error checking') :2047 | it 1 本 | `//packages/core/test/acceptance:acceptance` | [第 1 回](01-dyn-entry-points.md) |
| `acceptance/view_container_ref_spec.ts` | describe('ViewContainerRef') :54 › describe('createComponent') :1446（:1739 ルートの cdRef・:1859 注入器・:1899 directives・:1970 bindings・:2041 options） | it 15 本 | `//packages/core/test/acceptance:acceptance` | [第 1 回](01-dyn-entry-points.md)・[第 3 回](03-dyn-directives.md)・[第 4 回](04-dyn-bindings-ref.md)・[第 5 回](05-dyn-vcr-host.md) |
| `acceptance/view_container_ref_spec.ts` | describe('create') :90 › describe('element namespaces') :240（:312・:341 は 2ab5ff56ded） | it 4 本 | `//packages/core/test/acceptance:acceptance` | [第 2 回](02-dyn-factory-create.md) |
| `acceptance/view_container_ref_spec.ts` | describe('destroy should clean the DOM in all cases:') :652 | it 7 本 | `//packages/core/test/acceptance:acceptance` | [第 4 回](04-dyn-bindings-ref.md) |
| `acceptance/security_spec.ts` | describe('Component host element validation') :1267 | it 4 本 | `//packages/core/test/acceptance:acceptance` | [第 5 回](05-dyn-vcr-host.md) |
| `acceptance/security_spec.ts` | describe('host binding sanitization') :882（expectHostBinding :889） | it 18 本 | `//packages/core/test/acceptance:acceptance` | [第 5 回](05-dyn-vcr-host.md) |
| `acceptance/query_spec.ts` | it('should not throw when hydration metadata has no serialized container data') :1829 | it 1 本 | `//packages/core/test/acceptance:acceptance` | [第 5 回](05-dyn-vcr-host.md) |
| `test_bed_spec.ts` | describe('TestBed') :646 › describe('bindings') :1230 | it 3 本 | `//packages/core/test:test（shard 4）` | [第 4 回](04-dyn-bindings-ref.md) |
| `test_bed_spec.ts` | describe('TestBed.createDirective') :2969（22.2.0 から） | it 12 本 | `//packages/core/test:test（shard 4）` | [第 3 回](03-dyn-directives.md) |
| `application_ref_spec.ts` | it('supports passing bootstrap options object') :220 | it 1 本 | `//packages/core/test:test（shard 4）` | [第 1 回](01-dyn-entry-points.md) |
| `common/test/directives/ng_component_outlet_spec.ts` | describe('inputs') :284（NgComponentOutlet は setInput で渡す） | — | `//packages/common/test:test` | [第 1 回](01-dyn-entry-points.md) |

1. **ほとんどが acceptance の 1 つの target**

   動的コンポーネントの振る舞いは、公開 API の `createComponent` と `ViewContainerRef` を通して、`packages/core/test/acceptance/` で確かめる形にそろっています。このディレクトリには自分の `BUILD.bazel` があり、target は `//packages/core/test/acceptance:acceptance` です（[testing の章](../testing/06-testing-component-bindings.md)でも見た落とし穴で、`//packages/core/test:test` に同じ filter を付けても 0 本で PASSED になります）。`test_bed_spec.ts` と `application_ref_spec.ts` は core の直下で、こちらは shard が 4 つあります。
2. **render3 の `component_ref_spec.ts` はもう無い**

   `ComponentFactory` を直接作って試す `packages/core/test/render3/component_ref_spec.ts`（463 行、`describe('ComponentFactory')`）は、df9eed4ff1d（2026-04-12、`ComponentFactoryResolver` の使い道を消したコミット）でファイルごと消えました。その中にあった `setInput` の 6 本（同じ値なら書かない・知らない入力・OnPush に印を付ける など）と同じ名前の it は、今の木には見つかりません（`grep -rn` で 0 件）。`setInput` を呼ぶ it は `host_directives_spec.ts`（8 か所）や `create_component_spec.ts`（6 か所）に散らばっています。
3. **filter の書き方**

   jasmine の `--filter` は、describe と it の名前を空白でつないだ文字列に対する正規表現です。`^createComponent ` の最後の空白で、`createComponent` で始まるほかの describe を外しています。`TestBed.createDirective` の `.` は「何か 1 文字」ですが、この名前ではほかに当たりません。

## 2. 各章の約束と、それを固めている it

| 章 | 約束 | it（ファイル:行） |
| --- | --- | --- |
| [第 1 回](01-dyn-entry-points.md) | ApplicationRef.bootstrap も `directives` と `bindings` を受ける（PR #67948） | supports passing bootstrap options object（application\_ref\_spec.ts:220、下の引用） |
| [第 2 回](02-dyn-factory-create.md) | ホストの要素をセレクタから作る・無ければ div | should create a host element if none provided（create\_component\_spec.ts:202）/ :228 |
| [第 2 回](02-dyn-factory-create.md) | 差し込む場所の名前空間を引き継ぐ（2ab5ff56ded） | should inherit the namespace of the insertion context …（view\_container\_ref\_spec.ts:312）・:341 |
| [第 3 回](03-dyn-directives.md) | standalone でないディレクティブは NG0907 | should throw if attached directive is not standalone（create\_component\_spec.ts:638） |
| [第 3 回](03-dyn-directives.md) | host directive との順 | should execute host directives in the correct order（create\_component\_spec.ts:348） |
| [第 4 回](04-dyn-bindings-ref.md) | inputBinding が OnPush に印を付ける（780774f9480） | should update view of component set with the onPush strategy …（create\_component\_spec.ts:1142） |
| [第 4 回](04-dyn-bindings-ref.md) | outputBinding は壊すと外れ、DOM のイベントにはしない | should clean up root component output listeners（:1225）/ should not listen to native event …（:1437、下の引用） |
| [第 4 回](04-dyn-bindings-ref.md) | 入力の binding があると setInput は NG0317 | :1120（inputBinding）・:2022（twoWayBinding） |
| [第 5 回](05-dyn-vcr-host.md) | script のホストを断る（d7f70616a03・9f8e32616b7） | Component host element validation の 4 本（security\_spec.ts:1268〜:1327） |
| [第 5 回](05-dyn-vcr-host.md) | ホストのバインディングを本当のホストで選ぶ（d06e3748b7b・f57d5d5c8c3） | host binding sanitization の 18 本（security\_spec.ts:882） |
| [第 5 回](05-dyn-vcr-host.md) | 記録の無いコンテナでもハイドレーションで投げない（77f1ca08e4a） | query\_spec.ts:1829 |

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L1437–1454 （▶ の行: 1440, 1443–1444, 1449, 1453）

```ts
1437 │     it('should not listen to native event when creating an output binding', () => {
1438 │       @Component({template: '', changeDetection: ChangeDetectionStrategy.Eager})
1439 │       class RootComp {
1440 ▶         @Output() click = new EventEmitter<void>();
1441 │       }
1442 │ 
1443 ▶       const hostElement = document.createElement('button');
1444 ▶       const spy = spyOn(hostElement, 'addEventListener');
1445 │       const environmentInjector = TestBed.inject(EnvironmentInjector);
1446 │       const ref = createComponent(RootComp, {
1447 │         hostElement,
1448 │         environmentInjector,
1449 ▶         bindings: [outputBinding('click', () => {})],
1450 │       });
1451 │       ref.changeDetectorRef.detectChanges();
1452 │ 
1453 ▶       expect(spy).not.toHaveBeenCalled();
1454 │     });
```

1440 行目、出力の名前が DOM のイベントと同じ `click` で、1443 行目のホストは `<button>` です。1444 行目で `addEventListener` を見張り、1453 行目で一度も呼ばれないことを確かめます。テンプレートの `(click)` なら DOM にも登録するところを、`outputBinding` は出力の購読だけにする、という第 4 回の 5 節の約束です。

📄 `angular/packages/core/test/application_ref_spec.ts` L220–250 （▶ の行: 224, 241–244, 247–248）

```ts
220 │       it('supports passing bootstrap options object', inject(
221 │         [ApplicationRef],
222 │         (ref: ApplicationRef) => {
223 │           @Directive({
224 ▶             host: {'[attr.data-dir]': 'value'},
225 │           })
226 │           class HostDir {
227 │             @Input()
228 │             value = 'unset';
229 │           }
230 │ 
231 │           @Component({
232 │             selector: 'bootstrap-app',
233 │             template: `{{ name }}`,
234 │           })
235 │           class StandaloneBootComp {
236 │             @Input()
237 │             name = 'default';
238 │           }
239 │ 
240 │           createRootEl('custom-selector');
241 ▶           const comp = ref.bootstrap(StandaloneBootComp, {
242 ▶             hostElement: 'custom-selector',
243 ▶             directives: [{type: HostDir, bindings: [inputBinding('value', () => 'bound')]}],
244 ▶             bindings: [inputBinding('name', () => 'hello from binding')],
245 │           });
246 │ 
247 ▶           expect(comp.location.nativeElement.getAttribute('data-dir')).toBe('bound');
248 ▶           expect(comp.location.nativeElement.textContent.trim()).toBe('hello from binding');
249 │         },
250 │       ));
```

`ApplicationRef.bootstrap` の 2 つ目の引数に、`createComponent` と同じ形の `hostElement`・`directives`・`bindings` を渡しています（241〜245 行目）。243 行目は `DirectiveWithBindings` の形で、ディレクティブの入力にだけ値を渡し、247 行目で 224 行目のホストのバインディングの結果を見ます。この 1 本は core の直下の target にあるので、acceptance を走らせても入りません。

## 3. 手元で走らせた結果

8576f161ae4 の ../angular で、`pnpm bazel test <target> --nocache_test_results --test_output=all "--test_arg=--filter=<filter>"` を 1 つずつ走らせました（2026-11-15）。

| target | filter | 結果 |
| --- | --- | --- |
| `//packages/core/test/acceptance:acceptance` | `^createComponent ` | Ran 52 of 2693 specs / 52 specs, 0 failures / PASSED in 1.4s |
| `//packages/core/test/acceptance:acceptance` | `^ViewContainerRef createComponent` | Ran 15 of 2693 specs / 15 specs, 0 failures / PASSED in 1.3s |
| `//packages/core/test/acceptance:acceptance` | `^ViewContainerRef create element namespaces` | Ran 4 of 2693 specs / 4 specs, 0 failures / PASSED in 1.3s |
| `//packages/core/test/acceptance:acceptance` | `^Component host element validation` | Ran 4 of 2693 specs / 4 specs, 0 failures / PASSED in 1.3s |
| `//packages/core/test/acceptance:acceptance` | `^host binding sanitization` | Ran 18 of 2693 specs / 18 specs, 0 failures / PASSED in 1.4s（途中の ERROR NG0904・NG0910 はわざと起こしたもの） |
| `//packages/core/test:test` | `^TestBed bindings` | shard ごとに Ran 1・0・1・1 of 1398〜1399 specs（計 3）/ PASSED in 1.4s |
| `//packages/core/test:test` | `^TestBed.createDirective` | shard ごとに Ran 3・3・3・3 of 1392 specs（計 12）/ PASSED in 1.4s |
| `//packages/core/test:test` | `supports passing bootstrap options object` | shard ごとに Ran 0・0・0・1 of 1400〜1401 specs（計 1）/ PASSED in 1.3s |

- acceptance の 5 回は、どれも 1 節の表の数と同じでした。`Ran` の数を表と見比べると、filter が狙いどおりに当たっているかが分かります。
- core の直下は shard ごとに `Ran` が 1 行ずつ、4 回出ます。分母（1392〜1401）が shard で違うのは、it の振り分けが shard ごとに違うからです。数は 4 行の合計で見ます。
- `host binding sanitization` の出力に出る `ERROR RuntimeError: NG0904` は、`expectedError` を渡した it でわざと起こしたものを `ErrorHandler` が console に書いたもので、結果は `0 failures` です。

### 新しい本家との違い

angular-main（74961c66242）は 8576f161ae4 から 766 コミット先ですが、このシリーズで読んだ `dynamic_bindings.ts`・`directive_outputs.ts`・`view_ref.ts`・`sanitization.ts` の実装は同じで、`component_ref.ts` は `LOCALE_ID` をビューの環境に入れる 3 行（38816151b8e、locale の競合の修正）、`view_container_ref.ts` は jsdoc の 1 行だけが違います。spec は ecbc89b465c・fade609afde（2026-10、テストの書き換え）で `changeDetection: ChangeDetectionStrategy.Eager` が消え、signal と `await fixture.whenStable()` の形に直っているので、行番号がずれます。`create_component_spec.ts` の it は 52 本、`view_container_ref_spec.ts` は 78 本のままで、`security_spec.ts` は 59 本から 61 本です。増えた 2 本は 97e6aa4a557（compiler、テンプレートの中の `script` の要素を名前空間によらず取り除く）のもので、第 5 回のホストの要素の確かめとは別の場所（テンプレートのパーサ）です。

## 4. 動的コンポーネントの issue

| # | 状態 | 作成 → 閉 | 題（言い換え） | 章 | メモ |
| --- | --- | --- | --- | --- | --- |
| #71459 | 開 | 2026-10-20 | HOST\_TAG\_NAME と DebugElement.name が、テンプレートで宣言していないホストで "#host" を返す | [第 2 回](02-dyn-factory-create.md)[第 5 回](05-dyn-vcr-host.md) | 第 5 回 6 節の TNodeName.DynamicHost の印がそのまま見える |
| #70878 | DUPLICATE | 2026-09-23 → 2026-09-23 | createComponent の bindings を型安全にしたい | [第 4 回](04-dyn-bindings-ref.md) | #51878 にまとめられた。別名があるので難しいという返事 |
| #68779 | COMPLETED | 2026-05-18 → 2026-08-28 | TestBed.createComponent に directives の選択肢がほしい | [第 3 回](03-dyn-directives.md) | 同じ日に TestBed.createDirective（05c4d5a8354）が入った |
| #68573 | NOT\_PLANNED | 2026-05-05 → 2026-05-05 | signal の input() に Object.assign で値を入れられない | [第 4 回](04-dyn-bindings-ref.md) | 返事は「setInput を使う」 |
| #68014 | COMPLETED | 2026-04-03 → 2026-09-29 | テンプレート参照変数から取った ViewContainerRef がハイドレーションで投げる | [第 5 回](05-dyn-vcr-host.md) | 77f1ca08e4a（PR #68041） |
| #67946 | COMPLETED | 2026-03-30 → 2026-04-07 | ApplicationRef.bootstrap の引数を createComponent にそろえたい | [第 1 回](01-dyn-entry-points.md) | PR #67948（bootstrap に options） |
| #69550 | COMPLETED | 2026-06-27 → 2026-07-29 | ホストのバインディングのセレクタと本当のホストの食い違いで、サニタイザの選び方がずれる | [第 5 回](05-dyn-vcr-host.md) | area: security。d06e3748b7b（#69558） |
| #66851 | COMPLETED | 2026-01-30 → 2026-02-02 | DirectiveWithBindings を @angular/core から export してほしい | [第 3 回](03-dyn-directives.md) | PR #66857 |
| #63099 | DUPLICATE | 2025-08-12 → 2026-01-09 | ngComponentOutlet でも bindings と directives を使いたい | [第 1 回](01-dyn-entry-points.md)[第 3 回](03-dyn-directives.md) | PR #63101 は開いたまま（2026-11-12 更新） |
| #63489 | DUPLICATE | 2025-08-29 → 2025-08-29 | inputBinding は型安全であるべきでは | [第 4 回](04-dyn-bindings-ref.md) | 入力の考え方かコンパイラを変える必要がある、という返事 |
| #62343 | COMPLETED | 2025-06-27 → 2025-07-17 | inputBinding が OnPush のコンポーネントに印を付けない | [第 4 回](04-dyn-bindings-ref.md) | 780774f9480（#62613、v20.1.1） |
| #62150 | NOT\_PLANNED | 2025-06-19 → 2025-08-29 | ComponentRef.destroy() でホストの要素まで消える | [第 4 回](04-dyn-bindings-ref.md) | 期待どおり。attachView していると detachView が外す（第 4 回 6 節） |
| #62922 | NOT\_PLANNED | 2025-07-31 → 2025-08-05 | TestBed の bindings が効かない・不安定 | [第 4 回](04-dyn-bindings-ref.md) |   |
| #62679 | NOT\_PLANNED | 2025-07-17 → 2025-07-26 | ViewContainerRef.createComponent に readonly の配列を渡したい | [第 5 回](05-dyn-vcr-host.md) |   |
| #63901 | COMPLETED | 2025-09-18 → 2025-10-01 | 動的に作ったコンポーネントで animate.enter が動かない | [第 5 回](05-dyn-vcr-host.md) | animations のシリーズの範囲 |
| #64423 | COMPLETED | 2025-10-15 → 2025-10-16 | ng-container に createComponent したものが 20.3.4 で壊れない | [第 5 回](05-dyn-vcr-host.md) | 20.3.6 の特別なパッチで直った（退行） |
| #59918 | COMPLETED | 2025-02-11 → 2025-05-02 | ViewContainerRef.createComponent の説明が「コンテナの中に入れる」と誤っている | [第 5 回](05-dyn-vcr-host.md) | good first issue。0b6c8dc72df（#61097）の jsdoc |
| #48228 | COMPLETED | 2022-11-24 → 2026-10-29 | 動的に作るときに viewProviders を指定したい | [第 2 回](02-dyn-factory-create.md) | viewProviders は定義の一部なので外から渡す形に合わない、という整理で閉じた |
| #39892 | NOT\_PLANNED | 2020-11-30 → 2026-09-29 | CDK の ComponentPortal と ComponentFactory の組み合わせが Ivy で壊れる | [第 1 回](01-dyn-entry-points.md) | 6 年近く開いたあとで閉じた |
| #61231 | 開 | 2025-05-09 | 関数の createComponent で作ったものがハイドレーションで作り直される | [第 5 回](05-dyn-vcr-host.md)[第 2 回](02-dyn-factory-create.md) | ルートのコンポーネントなので今は両立しない、という返事 |
| #62458 | 開 | 2025-07-03 | createComponent に selector の選択肢がほしい | [第 1 回](01-dyn-entry-points.md)[第 2 回](02-dyn-factory-create.md) |   |
| #63554 | 開 | 2025-09-02 | 合わないセレクタの要素に描いたら投げるべき | [第 2 回](02-dyn-factory-create.md) |   |
| #62523 | 開 | 2025-07-08 | output に読むだけの型がほしい | [第 4 回](04-dyn-bindings-ref.md) |   |
| #54782 | 開 | 2024-03-08 | ディレクティブのインスタンスから signal の入力を書きたい | [第 4 回](04-dyn-bindings-ref.md) | コメント 80 件 |
| #51878 | 開 | 2023-09-22 | 入力を型安全に設定する API | [第 4 回](04-dyn-bindings-ref.md) | #63489・#70878 のまとめ先 |
| #50510 | 開 | 2023-05-30 | ホストのバインディングから host directive の入力に渡したい | [第 3 回](03-dyn-directives.md) |   |
| #47398 | 開 | 2022-09-10 | コンポーネントの ComponentRef を DI で取りたい | [第 4 回](04-dyn-bindings-ref.md) |   |
| #36828 | 開 | 2020-04-28 | 壊したビューをまだ操作できる | [第 4 回](04-dyn-bindings-ref.md) |   |
| #12215 | 開 | 2016-10-11 | 動的に作ったコンポーネントで ViewEncapsulation.Emulated が効かない | [第 2 回](02-dyn-factory-create.md) |   |
| #10404 | 開 | 2016-07-30 | g\[test\] のようなセレクタのコンポーネントを SVG の中に作ると壊れる | [第 2 回](02-dyn-factory-create.md) | 名前空間（2ab5ff56ded）と関係 |

### 数で見る傾向

- gh で「createComponent」を検索した 100 件・「ViewContainerRef」60 件・bindings の 24 件を合わせると、重なりを除いて 137 件で、開いているのは 42 件です。2023 年以降の閉じた年は  2023 年 4 件 2024 年 9 件 2025 年 34 件 2026 年 46 件 で、2025〜2026 年に集中しています。2025〜2026 年に作られて閉じた 59 件は、作ってから閉じるまでの中央値が 8 日でした。
- 上の表の閉じた 18 件のうち、COMPLETED は 10 件、DUPLICATE は 3 件、NOT\_PLANNED は 5 件です。DUPLICATE の多くは「型安全にしたい」（#63489・#70878 → #51878）のような、古い大きな issue へのまとめです。NOT\_PLANNED には #62150（ホストの要素が消える）や #68573（`Object.assign`）のように、振る舞いは正しく、使い方の答えで閉じたものが入っています。
- 開いている issue は 2016〜2018 年のものが 11 件残っています（検索の 42 件のうち）。表の #10404（SVG のセレクタ）・#12215（Emulated）のように、ホストの要素の作り方の古い報告です。2025〜2026 年に作られて開いているのは 16 件で、#61231（ハイドレーション）・#71459（`#host`）・#62458（selector の選択肢）など、第 2・5 回の範囲が多くなっています。
- merge 済みの PR（gh で取った 43 件）のうち、2026 年にホストの要素まわりで入った直しは 4 本です：`#68713`（2026-05、要素を渡したときの script）、`#69551`（2026-07、d7f70616a03）、`#70089`（2026-08、9f8e32616b7）、`#70298`（2026-08、2ab5ff56ded の名前空間）。どれも `ComponentFactory` がホストの要素を決めるところ（第 2・5 回）で、3 か月で 4 回です。

## このシリーズで見つけたもの

第 1〜5 回を書いている途中で、開発モードと本番で振る舞いが分かれる書き方や、古くなった説明が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、このサイトの依存の @angular/core 22.1.6 と、Node で動かした 22.2.6 を使いました。gh で検索した範囲では、同じ件を扱った issue は見つかっていません。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| `twoWayBinding('formField', sig)` が、開発モードでは呼んだ時点で ``Unexpected `create` callback in inputBinding`` の ASSERTION ERROR になる。名前が formField の inputBinding だけが create を持つため。本番では作れるが、二方向の binding は出力の create だけを使うので、入力の create（controlCreateInternal）は呼ばれない | core の render3/dynamic\_bindings.ts 134〜147 行目（formField の分岐）、229 行目（assertNotDefined）、241 行目（`create: output.create`） | 22.2.6 の Node の記録（開発と本番）。create\_component\_spec.ts の formField の it は inputBinding だけ | [第 4 回](04-dyn-bindings-ref.md) |
| `vcr.createComponent(C, {index: 5})` のように範囲の外の index を渡すと、コンポーネントを作ってから index を確かめるので、コンストラクタが走ったあとで投げる（開発は ASSERTION ERROR、本番は TypeError）。作られたものは ViewContainerRef にもアプリにも付かず、ホストやアプリを壊しても DestroyRef.onDestroy が呼ばれない。index の範囲の確かめは開発モードだけ | core の linker/view\_container\_ref.ts 524 行目（create）、536 行目（insertImpl）、664〜674 行目（\_adjustIndex）。createEmbeddedView も 413 行目で同じ順 | 22.2.6 の Node の記録（開発と本番） | [第 5 回](05-dyn-vcr-host.md) |
| reflectComponentType の JSDoc の例が、`@Input('inputName') inputPropName` に対して `{propName: 'inputName', templateName: 'inputPropName'}` と逆に書いている（isSignal も無い）。実物は propName が inputPropName を返し、spec も実物と同じ向き。angular-main でも同じ | core の render3/component.ts 188〜189 行目 | 例と同じクラスを 22.1.6 と 22.2.6 の JIT で作って呼んだ記録 | [第 1 回](01-dyn-entry-points.md) |
| ComponentFactory を公開 API から外したあとの残り: `ComponentFactory.isBoundToModule` は書くだけで読む行が無い。`TestBedCompiler._getComponentFactories` を呼ぶ行が無い。view\_container\_ref.ts の `ngModule == null` の判定とそのコメントは ComponentFactory を渡せたころの説明のまま。ComponentRef の JSDoc が非公開の ComponentFactory を指している | component\_ref.ts 226・263 行目、testing の test\_bed\_compiler.ts 494 行目、view\_container\_ref.ts 493〜509 行目、linker/component\_factory.ts 17・63 行目 | grep（呼び出し元が 0 件）、f9b74e90e3c・df9eed4ff1d の差分 | [第 1 回](01-dyn-entry-points.md) |
| spec の穴: environmentInjector と ngModuleRef を両方渡したときの確かめに it が無い。2026-04 の df9eed4ff1d で render3/component\_ref\_spec.ts がファイルごと消え、そこにあった ComponentRef.setInput の it（同じ値なら書かない など）と同じ名前の it が今の木に無い。acceptance の component\_spec.ts 893 行目の it は「投げる」という名前で null が返ることを確かめている | view\_container\_ref.ts 476〜480 行目（`grep -rn "Cannot pass both" packages/core/test` は 0 件）、component\_spec.ts 893〜904 行目 | grep と git show df9eed4ff1d | [第 5 回](05-dyn-vcr-host.md)・[第 1 回](01-dyn-entry-points.md) |
| （仕様の可能性あり）環境の注入器を親に持つ `Injector.create({parent: appEnv})` を elementInjector に渡すと、`providedIn: 'root'` のトークンは elementInjector の親から先に見つかるので、environmentInjector で上書きしても効かない。NodeInjector を親にすると上書きが効く。本番で directives にコンポーネントのクラスを渡すと、開発モードだけの確かめが無いため原因の分かりにくい TypeError になる | chained\_injector.ts 32〜44 行目、component\_ref.ts の directives を並べる行（第 3 回） | 第 2 回のデモと Node の記録、第 3 回の本番の記録 | [第 2 回](02-dyn-factory-create.md)・[第 3 回](03-dyn-directives.md) |

## 聞かれそうな質問

**Q. createComponent の spec を足すなら、どのファイルですか？**

関数の `createComponent` と bindings・directives は `packages/core/test/acceptance/create_component_spec.ts` の 5 つの describe（:258・:660・:1197・:1457・:2047）のどれかです。`ViewContainerRef` の引数と注入器は `view_container_ref_spec.ts` の `createComponent`（:1446）、ホストの要素の守りは `security_spec.ts` の :1267 と :882 です。どれも target は `//packages/core/test/acceptance:acceptance` です。

**Q. filter を付けて PASSED になったのに、自分の it が走っていないことがあるのはなぜですか？**

filter が 0 件に当たっても jasmine は失敗にしないからです。acceptance の spec を `//packages/core/test:test` で走らせると、`Ran 0 of …` で PASSED になります。必ず `Ran N of M specs` の N を、1 節の表の数と比べます。core の直下は shard が 4 つなので、4 行の合計で見ます。

**Q. ComponentFactory を直接作って試す spec はどこにありますか？**

今はありません。`render3/component_ref_spec.ts` は df9eed4ff1d（2026-04-12）で消え、`setInput` の細かい振る舞いの it も一緒に無くなりました。`ComponentFactory` は公開 API から外れたので、確かめるなら公開の `createComponent` を通して acceptance に書きます。

**Q. 動的コンポーネントの issue で多いのはどんな話ですか？**

表の範囲では、入力を型で確かめたい（#51878 とそのまとめ）、作ったものの破棄とホストの要素（#62150・#36828）、ハイドレーション（#61231・#68014）、ホストの要素の名前と名前空間（#71459・#10404）です。閉じたものの多くは、使い方の答え（`setInput` を使う、新しい要素を作って渡す）で閉じています。

## 読み終えて

- 動的コンポーネントの spec は、ほとんどが `//packages/core/test/acceptance:acceptance` の 4 つのファイル（create\_component・view\_container\_ref・security・query）にある
- 走らせたら `Ran N of M` を地図の数と比べる。core の直下は shard 4 つの合計
- `ComponentFactory` を直接試す spec は 2026-04 に消えた。`setInput` の細かい振る舞いは今は直接の it が無い
- issue は 2025〜2026 年に多く閉じ、中央値 8 日。開いているものは型安全・ハイドレーション・ホストの要素の作り方が中心

---

← 前: [ViewContainerRef.createComponent とホストの要素の守り](05-dyn-vcr-host.md)  
次: [契約と歩み：4 つの Symbol と g3-only の印](../fgn/01-fgn-contract-history.md) →
