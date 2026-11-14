[目次](../README.md) › [resource の細部と新しい部品](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：resource の振る舞いを決めているテスト

> core/test/resource の resource\_spec.ts・chain\_spec.ts・params\_status\_spec.ts・debounce\_spec.ts・resource\_snapshot\_spec.ts（70 件）、rx\_resource\_spec.ts、common/http の resource\_spec.ts が、このシリーズの各章の約束をどの it で固めているかの地図。手元での走らせ方と結果、修正の行を消しても通る it。resource に関係する開いている issue と閉じた issue の表。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/resx-tests-issues)

---

シリーズの最後に、resource の振る舞いを固めている spec がどのファイルのどの describe にあり、第 1〜5 回の約束がどの it で確かめられているかを地図にします。手元で走らせた数を書き、resource に関係する issue（ラベル `cross-cutting: resource` の 32 件のうち開いている 6 件と、題の検索で見つけたもの。2026-11-13 に取得）から 41 件を選んで、どの章に関係するかを振り分けます。

読む対象は `packages/core/test/resource/` の 5 つの spec（resource\_spec.ts・chain\_spec.ts・params\_status\_spec.ts・debounce\_spec.ts・resource\_snapshot\_spec.ts）と `BUILD.bazel`、`packages/core/rxjs-interop/test/rx_resource_spec.ts`、`packages/common/http/test/resource_spec.ts` です。ターゲットの読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、spec の書き方は[spec の読み方](../contrib/06-contrib-reading-specs.md)にあります。

1. [1. params から状態を返す](01-resx-params-status.md)
2. [2. debounced()](02-resx-debounced.md)
3. [3. エラーの包み方](03-resx-errors.md)
4. [4. SSR と resource](04-resx-ssr-cache.md)
5. [5. 後片付けと漏れ](05-resx-cleanup-leaks.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

ファイルごとの一番外の describe、その中の describe ごとの it の数（describe の入れ子を字下げでたどり、`it(` の行を数えたもの。`xit`・`fit` はどのファイルにも無い）と、bazel で実際に走った数です。

| ファイル（行数） | 一番外の describe（行） | describe（行）と it の数 | it の行 | 走った数 | ターゲット |
| --- | --- | --- | --- | --- | --- |
| `core/test/resource/resource_spec.ts`（1184） | `resource ／ with TransferState`（87） | `resource（中の types を含む）`（87）… 35<br>`resource › types`（1035）… 3<br>`with TransferState`（1120）… 3<br> | 38 | 70（ターゲット全体） | `//packages/core/test/resource:resource` |
| `core/test/resource/chain_spec.ts`（98） | `chain`（21） | `chain`（21）… 6<br> | 6 | （同じターゲット） | `//packages/core/test/resource:resource` |
| `core/test/resource/params_status_spec.ts`（121） | `resource with ResourceParamsStatus`（22） | `resource with ResourceParamsStatus`（22）… 4<br> | 4 | （同じターゲット） | `//packages/core/test/resource:resource` |
| `core/test/resource/debounce_spec.ts`（486） | `debounced`（19） | `debounced（中の timer cleanup を含む）`（19）… 17<br>`debounced › timer cleanup`（337）… 4<br> | 17 | （同じターゲット） | `//packages/core/test/resource:resource` |
| `core/test/resource/resource_snapshot_spec.ts`（131） | `resource snapshots`（17） | `resourceFromSnapshots`（18）… 3<br>`Resource.snapshot`（93）… 2<br> | 5 | （同じターゲット） | `//packages/core/test/resource:resource` |
| `core/rxjs-interop/test/rx_resource_spec.ts`（457） | `rxResource()`（24） | `rxResource()（中の with TransferState を含む）`（24）… 17<br>`rxResource() › with TransferState`（235）… 4<br> | 17 | 17 of 77（filter=rxResource） | `//packages/core/rxjs-interop/test:test` |
| `common/http/test/resource_spec.ts`（502） | `httpResource`（28） | `httpResource（中の 2 つを含む）`（28）… 22<br>`httpResource › types`（403）… 3<br>`httpResource › TransferCache integration`（448）… 2<br> | 22 | 22 of 410（filter=httpResource） | `//packages/common/http/test:test` |

core の 5 つのファイルの it は 38 + 6 + 4 + 17 + 5 = 70 で、`//packages/core/test/resource:resource` の「70 specs」と合います。resource\_spec.ts には一番外の describe が 2 つあり、`with TransferState`（1120 行目）は `resource` の外です（[第 4 回](04-resx-ssr-cache.md)のテストの節）。

📄 `angular/packages/core/test/resource/BUILD.bazel` L19–31 （▶ の行: 19–20, 26–27）

```python
19 ▶ zoneless_jasmine_test(
20 ▶     name = "resource",
21 │     data = [
22 │         ":resource_lib",
23 │     ],
24 │ )
25 │ 
26 ▶ ng_web_test_suite(
27 ▶     name = "resource_web",
28 │     deps = [
29 │         ":resource_lib",
30 │     ],
31 │ )
```

19〜24 行目の `zoneless_jasmine_test` が Node で走る `:resource`、26〜31 行目の `ng_web_test_suite` がブラウザで走る `:resource_web` です。rxjs-interop と common/http の spec は、それぞれのディレクトリの `:test` にほかの spec と一緒に入っているので、`--test_arg=--filter=` で一番外の describe の名前に絞ります（rxjs-interop は 77 件中 17 件、common/http は 410 件中 22 件）。

### cancel の it を支える MockBackend

📄 `angular/packages/core/test/resource/resource_spec.ts` L30–68 （▶ の行: 36, 38, 44–45, 48, 52, 58, 62, 66–67）

```ts
30 │ abstract class MockBackend<T, R> {
31 │   protected pending = new Map<
32 │     T,
33 │     {resolve: (r: R) => void; reject: (reason: any) => void; promise: Promise<R>}
34 │   >();
35 │ 
36 ▶   fetch(request: T): Promise<R> {
37 │     const p = new Promise<R>((resolve, reject) => {
38 ▶       this.pending.set(request, {resolve, reject, promise: undefined!});
39 │     });
40 │     this.pending.get(request)!.promise = p;
41 │     return p;
42 │   }
43 │ 
44 ▶   abort(req: T) {
45 ▶     return this.reject(req, 'aborted');
46 │   }
47 │ 
48 ▶   reject(req: T, reason: any) {
49 │     const entry = this.pending.get(req);
50 │     if (entry) {
51 │       this.pending.delete(req);
52 ▶       entry.reject(reason);
53 │     }
54 │ 
55 │     return timeout();
56 │   }
57 │ 
58 ▶   async flush(): Promise<void> {
59 │     const allPending = Array.from(this.pending.values()).map((pending) => pending.promise);
60 │ 
61 │     for (const [req, {resolve}] of this.pending) {
62 ▶       resolve(this.prepareResponse(req));
63 │     }
64 │     this.pending.clear();
65 │ 
66 ▶     await Promise.all(allPending);
67 ▶     await timeout();
68 │   }
```

resource\_spec.ts の読み込みの it の多くは、この偽の backend を loader から呼びます。36〜42 行目の `fetch` は解決されない Promise を作って覚えるだけで、44〜45 行目の `abort` が `'aborted'` で reject します。loader は `abortSignal` の `abort` でこの `abort` を呼ぶので（[第 5 回](05-resx-cleanup-leaks.md)のテストの節の it）、「どの request が abort されたか」を数えられます。58〜68 行目の `flush` は残っている全部を解決し、66〜67 行目で Promise と `timeout()`（`setTimeout` 0 を待つ）を待ちます。テストの中で「時間を進める」代わりに、解決する時点をテストが決める作りです。

## 2. 各章の約束と、それを固めている it

| 章 | 約束 | it |
| --- | --- | --- |
| [第 1 回 params から状態を返す](01-resx-params-status.md) | params が ResourceParamsStatus.IDLE ／ LOADING を投げると idle ／ loading、Error なら error | params\_status\_spec.ts 23・44・69 |
| [第 1 回 params から状態を返す](01-resx-params-status.md) | 特別な状態から、params が値を返すと戻る | params\_status\_spec.ts 89 |
| [第 1 回 params から状態を返す](01-resx-params-status.md) | chain() は相手の idle・loading・reloading・error をそれぞれ投げ、resolved なら値を返す | chain\_spec.ts 22・28・34・40・46 |
| [第 1 回 params から状態を返す](01-resx-params-status.md) | chain() で 2 段につないだ resource が、前の段の状態を引き継ぐ | chain\_spec.ts 52 |
| [第 1 回 params から状態を返す](01-resx-params-status.md) | params の中で resource（を作るもの）を作ると NG0992 | debounce\_spec.ts 476（debounced を params の中で作る。resource\_spec.ts には無い） |
| [第 2 回 debounced()](02-resx-debounced.md) | 最初は resolved、値が変わると待っている間 loading で値は前のまま、待ち終わると resolved | debounce\_spec.ts 26・42・69 |
| [第 2 回 debounced()](02-resx-debounced.md) | 待つ関数が Promise ／ void を返す形 | debounce\_spec.ts 138・176・194 |
| [第 2 回 debounced()](02-resx-debounced.md) | 古いタイマーを止める（0904f90b13a） | debounce\_spec.ts 337 の describe timer cleanup（372・410・432・450） |
| [第 2 回 debounced()](02-resx-debounced.md) | 計算の循環を避ける遅い初期化（50e599e73ec） | forms/signals/test/web/debounce\_async\_validation\_bug.spec.ts（core の spec には無い） |
| [第 3 回 エラーの包み方](03-resx-errors.md) | loader が投げると error、error の状態で value() は投げる（defaultValue があっても） | resource\_spec.ts 140・382 |
| [第 3 回 エラーの包み方](03-resx-errors.md) | error の状態から reload したとき value() は defaultValue | resource\_spec.ts 993（905194fa57b） |
| [第 3 回 エラーの包み方](03-resx-errors.md) | error の状態でも set() できる | resource\_spec.ts 859（36a193139ac） |
| [第 3 回 エラーの包み方](03-resx-errors.md) | Error に似たオブジェクトはそのまま、stream が Observable を返す前に投げても後片付けで落ちない | rx\_resource\_spec.ts 122・111（9ae98753849） |
| [第 3 回 エラーの包み方](03-resx-errors.md) | 値を出さずに完了した Observable は NG0991 | rx\_resource\_spec.ts 183 |
| [第 4 回 SSR と resource](04-resx-ssr-cache.md) | キーがあれば作った直後に resolved、loader の値で上書きしない | resource\_spec.ts 1130、rx\_resource\_spec.ts 247 |
| [第 4 回 SSR と resource](04-resx-ssr-cache.md) | サーバーでは resolved のときに書き、ブラウザでは書かない | resource\_spec.ts 1149・1169、rx\_resource\_spec.ts 267・287・312 |
| [第 4 回 SSR と resource](04-resx-ssr-cache.md) | httpResource は転送キャッシュから同期で resolved | common/http resource\_spec.ts 456・482 |
| [第 5 回 後片付けと漏れ](05-resx-cleanup-leaks.md) | 新しい params ／ 注入器を壊す ／ destroy() で、前の読み込みが abort される | resource\_spec.ts 432・465・497 |
| [第 5 回 後片付けと漏れ](05-resx-cleanup-leaks.md) | set() で読み込み（reload も）が止まる | resource\_spec.ts 690・721・940 |
| [第 5 回 後片付けと漏れ](05-resx-cleanup-leaks.md) | subscribe の途中で abort されても購読をやめる（e0e902a8fa9） | rx\_resource\_spec.ts 331 |
| [第 5 回 後片付けと漏れ](05-resx-cleanup-leaks.md) | abort された読み込みの PendingTask が外れる（63886758787） | rx\_resource\_spec.ts 352・383・410 |

第 4・5 回を書く途中で、固めている it が無いと分かった振る舞いです。どれも作業木で src を変えて spec を走らせるか、DEMO で確かめました。

- [第 4 回](04-resx-ssr-cache.md)：アプリが安定した後に作った resource は、キーが残っていても `TransferState` を読まない（`isActive` の条件を消しても 70 件と 77 件が通った）。サーバーで失敗したときに書かないこと、stream の 2 つ目の値を書かないこと、`provideClientHydration` が無いときに読まないことにも it は無い（Node の記録で確かめた）。
- [第 5 回](05-resx-cleanup-leaks.md)：`destroy()` を手で呼んだときに `DestroyRef` の登録が外れること（080b3687d32 は spec を足していない）。`httpResource` の subscribe の途中の abort（subscribe の後の `if (aborted)` の 3 行を消しても 22 件が通った）。`rxResource` の `onAbort` の `resolveOnce()`（2 行を消しても 3 つの regression の it が通った）。
- [第 5 回](05-resx-cleanup-leaks.md)：読み込み中に params が使えなくなったら前の読み込みを止めること。8576f161ae4 には it が無く、origin/main の efbab16e567 が resource\_spec.ts と params\_status\_spec.ts に足した（写して走らせると 8576f161ae4 ではタイムアウトで落ちた）。

## 3. 手元で走らせた結果

📄 `走らせたコマンド（2026-11-13、8576f161ae4）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/resource:resource --nocache_test_results --test_output=all
pnpm bazel test //packages/core/test/resource:resource_web --nocache_test_results --test_output=all
pnpm bazel test //packages/core/rxjs-interop/test:test --nocache_test_results --test_output=all
pnpm bazel test //packages/core/rxjs-interop/test:test --nocache_test_results --test_output=all '--test_arg=--filter=rxResource'
pnpm bazel test //packages/common/http/test:test --nocache_test_results --test_output=all '--test_arg=--filter=httpResource'
```

| ターゲットとフィルタ | 結果 | ログ（res-logs/） |
| --- | --- | --- |
| `//packages/core/test/resource:resource` | 70 specs, 0 failures（1.3 秒） | b-core-resource.log |
| `//packages/core/test/resource:resource_web` | Chromium 70 passed、Firefox 70 passed | b-core-resource-web.log |
| `//packages/core/rxjs-interop/test:test` | 77 specs, 0 failures | b-rxjs-interop.log |
| `//packages/core/rxjs-interop/test:test` の `rxResource` | Ran 17 of 77 specs、0 failures | b-exp-b-no-resolveonce.log ほか（作業木） |
| `//packages/common/http/test:test` の `httpResource` | Ran 22 of 410 specs、0 failures | b-http-resource.log |

作業木（8576f161ae4）で src を変えて走らせた 5 つの結果は、[第 4 回](04-resx-ssr-cache.md)と[第 5 回](05-resx-cleanup-leaks.md)のテストの節にあります。落ちたのは「`rxResource` の subscribe の後の `if (aborted)` の 3 行を消す」（rx\_resource\_spec.ts 331 行目の it）と「efbab16e567 の it を写す」（タイムアウト）の 2 つで、残りの 3 つ（`isActive` の条件、`resolveOnce()`、`httpResource` の同じ 3 行）はすべて通りました。

### 新しい本家との違い

- angular-main（74961c66242）では、resource\_spec.ts は 1227 行・it 39、params\_status\_spec.ts は 208 行・it 7 です。5c4b6a48679（2026-09、params が同じ値なら読み込まない）が it を足しています。
- angular-main の debounce\_spec.ts は 345 行・it 13 です。ecbc89b465c（2026-10-06、「modernize unit tests across all packages」）が、0904f90b13a の足した `describe('timer cleanup')` の 4 件を消しました。src の debounce.ts の修正（古いタイマーを止める行）は残っています。消えた 4 件を戻す PR #71495（2026-10-20）は、取り込まれずに閉じられています。origin/main（551c446d98e、2026-11-12）でも 13 件です。
- origin/main には、手元の angular-main より後に efbab16e567 と 833c1f2c96c（どちらも 2026-11-10 取り込み）が入り、resource\_spec.ts は it 44、params\_status\_spec.ts は it 8 になっています（[第 5 回](05-resx-cleanup-leaks.md)の 5 節）。

## 4. resource の issue

| # | 状態 | 題 | 章 | メモ |
| --- | --- | --- | --- | --- |
| #71765 | 閉（2026-11-02 → 2026-11-11 ） | resource: obsolete loads keep the application unstable when params become unavailable | [第 5 回 後片付けと漏れ](05-resx-cleanup-leaks.md)<br> | 読み込み中に params が使えなくなると、前の読み込みが abort されず PendingTasks の仕事が残る。origin/main の efbab16e567 で直った |
| #71636 | 開（2026-10-26） | Signal forms: right after a value change, a debounced async validator reports the old result instead of \`pending\` | [第 2 回 debounced()](02-resx-debounced.md)<br> | validateAsync の debounce で、値を変えた直後に pending にならない。debounced() の遅らせている間の状態に関係する |
| #71622 | 開（2026-10-26） | Signal forms: destroying a form's component doesn't destroy its fields, so async validation keeps running | [第 5 回 後片付けと漏れ](05-resx-cleanup-leaks.md)<br> | Signal Forms：フォームのコンポーネントを壊しても、非同期のバリデーションが走り続ける |
| #71585 | 開（2026-10-24） | resource.reload() while params is in error switches the resource to 'idle' instead of retrying | [第 1 回 params から状態を返す](01-resx-params-status.md)<br> | params がエラーの状態で reload() すると idle になり、以後 reload() が効かない、という報告。reload() の extRequest.update が request だけを作り直し、error を落とすと本文が書いている |
| #71449 | 開（2026-10-20） | feat(core): Expose the previous resource value to the loader | [resource（大筋の章）](../signals/15-resource.md)<br> | loader の previous に前の値も渡してほしい、という要望 |
| #71422 | 閉（2026-10-19 → 2026-11-10 ） | resource: destroying a resource calls AbortController.abort() without a reason, creating an AbortError with a stack trace each time | [第 5 回 後片付けと漏れ](05-resx-cleanup-leaks.md)<br> | destroy のたびに理由なしの abort() で DOMException が作られる。origin/main の 833c1f2c96c で理由を使い回し、終わった読み込みは abort しない |
| #71421 | 開（2026-10-18） | feat(core): allow resource defaultValue to be derived reactively (e.g. from a component input) | [resource（大筋の章）](../signals/15-resource.md)<br> | defaultValue を input などから反応的に決めたい、という要望 |
| #70265 | 閉（2026-08-19 → 2026-08-24 ） | TransferState prototype pollution via keys | [第 4 回 SSR と resource](04-resx-ssr-cache.md)<br> | TransferState のキーで \_\_proto\_\_ などが通る。168a324cce0（2026-08-19）で store を createDictionary にし、get と hasKey は Object.hasOwn で見る |
| #70036 | 開（2026-07-31） | Add an opt-in \`lazy\` option to resource() to defer loading until the first read | [resource（大筋の章）](../signals/15-resource.md)<br> | 最初に読まれるまで読み込みを始めない lazy オプションの要望 |
| #69882 | 閉（2026-07-22 → 2026-07-22 ） | \`httpResource\` bypasses configured HttpClient interceptors | [第 4 回 SSR と resource](04-resx-ssr-cache.md)<br> | httpResource が転送キャッシュを getInitialStream で直接読むので、HttpClient のインターセプタを通らない、という報告 |
| #69443 | 閉（2026-06-19 → 2026-06-24 ） | Allow the Resource interface in validateAsync factory | [第 2 回 debounced()](02-resx-debounced.md)<br> | validateAsync の factory に Resource を返せるようにする要望。debounced() の Resource を渡すため |
| #69360 | 閉（2026-06-15 → 2026-06-15 ） | New synchronous resource behavior in v22 can cause test failures but is not called out as a breaking change | [resource（大筋の章）](../signals/15-resource.md)<br> | v22 で stream の resource が同期で値を持つようになり（4e331062e83）、テストが落ちる。破壊的変更として書いてほしい、という報告 |
| #69330 | 閉（2026-06-12 → 2026-07-06 ） | The documentation or the implementation of chain is incorrect | [第 1 回 params から状態を返す](01-resx-params-status.md)<br> | chain() は相手が reloading でも LOADING を投げる。doc と実装の食い違いの指摘で、doc の方を直した（5ad937be5ec） |
| #69329 | 閉（2026-06-12 → 2026-06-24 ） | Document resource chaining | [第 1 回 params から状態を返す](01-resx-params-status.md)<br> | chain の使い方の文書化（7057b1257f0） |
| #68931 | 開（2026-05-26） | Hydration fails with rxResource + @else inside nested &lt;router-outlet&gt; | [第 4 回 SSR と resource](04-resx-ssr-cache.md)<br> | #62897 の続き。入れ子の router-outlet の中の rxResource + @else では、まだハイドレーションが壊れるという報告 |
| #68808 | 開（2026-05-20） | How to test an httpResource triggering an httpResource? | [第 6 回 spec と issue](06-resx-tests-issues.md)<br> | httpResource の結果で別の httpResource が動く形を、コンポーネント無しでテストする方法。docs の issue として開いている |
| #67495 | 閉（2026-03-06 → 2026-03-25 not planned） | httpResource.reload() not works if httpResource.status is "idle" | [resource（大筋の章）](../signals/15-resource.md)<br> | idle の httpResource に reload() が効かない。reload() は idle と loading では何もしない作り（not planned） |
| #67124 | 開（2026-02-18） | Add support for ResourceRef in resourceFromSnapshot | [resource（大筋の章）](../signals/15-resource.md)<br> | resourceFromSnapshots に ResourceRef（reload を持つもの）を渡したい、という要望 |
| #66827 | 閉（2026-01-29 → 2026-02-09 ） | httpResource.arrayBuffer causes \[Object object\] error with SSR | [第 4 回 SSR と resource](04-resx-ssr-cache.md)<br> | httpResource.arrayBuffer が SSR の転送キャッシュで \[Object object\] になる |
| #65588 | 閉（2025-11-24 → 2025-11-25 not planned） | resource: Add ability to reload resource even when reactive input parameter is set to undefined | [resource（大筋の章）](../signals/15-resource.md)<br> | params が undefined でも reload したい、という要望（not planned） |
| #64625 | 閉（2025-10-23 → 2025-10-23 ） | streaming resource: trigger the abort event when the params is set to undefined | [第 5 回 後片付けと漏れ](05-resx-cleanup-leaks.md)<br> | params を undefined にしたとき abort イベントを出してほしい。作者が閉じた（#71765 の本文） |
| #63791 | 閉（2025-09-13 → 2025-09-14 duplicate） | httpResource isLoading block prevents incremental hydration to work as expected | [第 4 回 SSR と resource](04-resx-ssr-cache.md)<br> | httpResource の isLoading の分岐が incremental hydration を妨げる。重複として閉じた |
| #63480 | 閉（2025-08-29 → 2026-10-21 ） | Resource \`value()\` throwing on error state | [第 3 回 エラーの包み方](03-resx-errors.md)<br> | error の状態で value() が投げることへの議論。2026-10-21 に閉じた |
| #63341 | 閉（2025-08-22 → 2025-08-28 ） | \`rxResource\` abort callback throws when stream function threw before returning an \`Observable\` | [第 3 回 エラーの包み方](03-resx-errors.md)<br>[第 5 回 後片付けと漏れ](05-resx-cleanup-leaks.md)<br> | stream が Observable を返す前に投げると、後片付けで onAbort が sub.unsubscribe() を呼んで落ちる。9ae98753849 で sub?. にした |
| #63070 | 開（2025-08-09） | Feature Request: Strong error typing on \`Resource\` and \`HttpResource\` signatures | [第 3 回 エラーの包み方](03-resx-errors.md)<br> | Resource と HttpResource のエラーの型を強くする要望 |
| #62986 | 閉（2025-08-04 → 2025-08-04 not planned） | Resource called twice in SSR Application | [第 4 回 SSR と resource](04-resx-ssr-cache.md)<br> | SSR で resource が 2 回呼ばれる（サーバーとブラウザ）。not planned。今は id で 1 回にできる |
| #62897 | 閉（2025-07-30 → 2026-05-06 ） | Resource \`hasValue()\` is false for a moment when using TransferState cached data, causing hydration to fail | [第 4 回 SSR と resource](04-resx-ssr-cache.md)<br> | TransferState に値があるのに、ブラウザの最初の描画で hasValue() が false。88685cb3b6d（httpResource）と 5a7c1e62dc2（id）で閉じた |
| #62724 | 開（2025-07-21） | rxResource \`params\` field type in \`stream\` function doesn't derive possible null value | [第 1 回 params から状態を返す](01-resx-params-status.md)<br> | rxResource の stream の params の型から null が落ちる、という型の報告 |
| #62489 | 閉（2025-07-06 → 2026-06-19 ） | Derive resource from another resource | [第 1 回 params から状態を返す](01-resx-params-status.md)<br>[resource（大筋の章）](../signals/15-resource.md)<br> | resource から resource を作る要望。閉じたのは 2026-06-19 で、それまでに snapshot（1ba9b7ac500）と chain（2206efa55fc）が入っている |
| #62397 | 閉（2025-07-01 → 2025-07-02 ） | rxResource can not be tested | [第 6 回 spec と issue](06-resx-tests-issues.md)<br> | rxResource がテストで動かない、という報告。2025-07-02 に閉じた |
| #62241 | 閉（2025-06-24 → 2025-06-25 ） | Resource: value.set() fails after resource goes in error state | [第 3 回 エラーの包み方](03-resx-errors.md)<br> | error の状態で value.set() が効かない。36a193139ac で直し、resource\_spec.ts 859 行目の it を足した |
| #62099 | 閉（2025-06-17 → 2025-06-17 duplicate） | ResourceWrappedError: Resource returned an error that's not an Error instance: \[object Object\]. | [第 3 回 エラーの包み方](03-resx-errors.md)<br> | ResourceWrappedError の \[object Object\]。#61861 の重複 |
| #61861 | 閉（2025-06-04 → 2026-01-08 ） | resource does not recognize HttpErrorResponse as error | [第 3 回 エラーの包み方](03-resx-errors.md)<br> | HttpErrorResponse が Error でないので ResourceWrappedError に包まれていた。Error に似たオブジェクトをそのまま使う isErrorLike は 835a6431619（2025-06）で入った |
| #60768 | 閉（2025-04-07 → 2025-04-07 duplicate） | Feature Request: Debounce in signal / httpResource | [第 2 回 debounced()](02-resx-debounced.md)<br> | 同じ要望の重複 |
| #60742 | 閉（2025-04-04 → 2026-06-08 not planned） | fixture.whenStable does not resolve with pending resource/rxResource | [第 4 回 SSR と resource](04-resx-ssr-cache.md)<br> | resource の読み込み中は fixture.whenStable() が終わらない。PendingTasks に仕事を足す作りどおりで、not planned |
| #60219 | 閉（2025-03-05 → 2025-08-20 ） | httpResource on error doesn't trigger the ErrorHandler | [第 3 回 エラーの包み方](03-resx-errors.md)<br> | httpResource のエラーが ErrorHandler に届かない |
| #59842 | 閉（2025-02-03 → 2025-02-05 ） | Race condition in \`resource()\` | [resource（大筋の章）](../signals/15-resource.md)<br> | resource() の競合。読み込み中に params が変わり、effect の前に古い Promise が解決すると新しい読み込みが落ちる。b592b1b0516 で直し、resource\_spec.ts 338 行目の it を足した |
| #59712 | 開（2025-01-25） | extend streaming resource with {status} capability | [resource（大筋の章）](../signals/15-resource.md)<br> | stream の resource が status を自分で出せるようにする要望 |
| #59528 | 閉（2025-01-15 → 2025-01-15 not planned） | Debounce support for \`resource\` | [第 2 回 debounced()](02-resx-debounced.md)<br> | resource の debounce の要望。このときは閉じ、のちに debounced()（b918beda323、2026-03）が入った |
| #59272 | 閉（2024-12-20 → 2025-01-29 ） | Calling resource.set(value) does not abort in-progress loaders if the given value is equal to the value before the resource was reloaded | [第 5 回 後片付けと漏れ](05-resx-cleanup-leaks.md)<br> | reload 中に前と同じ値を set() すると読み込みが止まらない。96e602ebe9c で直し、resource\_spec.ts 940 行目の it を足した |
| #58602 | 閉（2024-11-11 → 2026-02-07 ） | resource signal : have a way to make value() to persists while loading like when we use reload() | [resource（大筋の章）](../signals/15-resource.md)<br> | params が変わって読み込む間も前の値を出したい、という要望 |

ラベル `cross-cutting: resource` の開いている 6 件は、型（#70525・#63070・#62724）、resourceFromSnapshots（#67124）、lazy オプション（#70036）の要望と、ハイドレーションの #68931 です。閉じた issue で多いのは、エラーの扱い（[第 3 回](03-resx-errors.md)：value() が投げる・Error でない値・set できない）と、SSR とハイドレーション（[第 4 回](04-resx-ssr-cache.md)）です。2026 年の 10〜11 月には、読み込みを止める・止めないの行（[第 5 回](05-resx-cleanup-leaks.md)）の報告が続けて出て、#71422 と #71765 は origin/main で直りました。直した issue の多くは、直すコミットが resource\_spec.ts か rx\_resource\_spec.ts に it を 1 つ足していて、メモにはその行を書きました（#59842 → 338 行目、#59272 → 940 行目、#62241 → 859 行目）。

## 書いている途中で見つかったもの

第 1〜5 回を書く途中で、状態の食い違い、SSR のキャッシュの抜け、修正を固めきれていない spec が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめ、再現はこのサイトの依存の @angular/core 22.1.6 で行いました。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| params が Error を投げて error になったあと、params が `undefined` を返すと、status() は idle になるのに error() は前のエラーのままで、value()・hasValue()・snapshot() が ResourceValueError を投げる。`@if (hasValue())` で守ったテンプレートも投げる。IDLE や LOADING を投げた場合は起きない | resource.ts 306〜308 行目。要求の無い状態どうしが `undefined === undefined` で同じ要求と見なされ、エラーの stream が引き継がれる。angular-main でも同じ | 第 1 回のデモと Node の記録の \[4\] | [第 1 回](01-resx-params-status.md) |
| params のエラーのあとで reload() すると、エラーが消えて idle になる（開いている #71585 と同じ。根は上と同じ行） | resource.ts 393 行目 | Node の記録の \[2\] | [第 1 回](01-resx-params-status.md) |
| params の中で resource を作ったときの NG0992 が、入れ子になると出ない。内側の params を計算したあとで印が false に戻り、外側では NG0602 が error() にしまわれる | resource.ts 263 行目（前の値を覚えずに false にする）、debounce.ts 77・109 行目も同じ形 | Node の記録の \[5\] | [第 1 回](01-resx-params-status.md) |
| debounced() は元の signal が投げた値を包まないので、文字列を投げると error() が文字列を返し、value() のメッセージの末尾が "undefined" になる | debounce.ts 75・104 行目 | 第 2 回のデモ | [第 2 回](02-resx-debounced.md)・[第 3 回](03-resx-errors.md) |
| stream の resource は、最初に解決した 1 つ目の値しか TransferState に書かない。サーバーの HTML は 2 つ目の値、ng-state は 1 つ目の値になり、ブラウザは 1 つ目の値を出す | resource.ts 476・494 行目（loadEffect が resolved にした直後の 1 回だけ saveToTransferState を呼ぶ） | 第 4 回の Node の記録（stream が 2 回値を出す場面） | [第 4 回](04-resx-ssr-cache.md) |
| 修正の行を消しても通る spec がある。63886758787 の httpResource の it は購読の途中の abort を通らず、rxResource の PendingTask の it 3 つは resolveOnce を消しても通る。CACHE\_ACTIVE の isActive を固める it は無い | common/http/src/resource.ts の `if (aborted)` の 3 行、rx\_resource.ts の onAbort の 2 行、resource.ts 289 行目 | 作業木で行を消して bazel で走らせた結果（すべて通過） | [第 5 回](05-resx-cleanup-leaks.md)・[第 4 回](04-resx-ssr-cache.md) |
| angular-main で、debounce\_spec.ts の timer cleanup の it 4 つが消えた（ecbc89b465c の「modernize unit tests」）。debounce.ts の修正そのものは残っている。手元の木で修正を戻すと、そのうち 3 つが落ちる | core/test/resource/debounce\_spec.ts（0904f90b13a が足した `describe('timer cleanup')`） | `git -C angular-main show ecbc89b465c` と、作業木で修正を戻して走らせた結果（17 件中 3 件が失敗） | [第 2 回](02-resx-debounced.md) |
| （細かいもの）resource.ts 290 行目の `const key` が使われていない。api.ts 241 行目の説明に「value value」の重複 | resource.ts 290 行目、api.ts 241 行目 | grep | [第 4 回](04-resx-ssr-cache.md) |

読み込み中に params が undefined などになると前の読み込みが abort されない件（#71765）は、origin/main の efbab16e567（2026-11-10）で直っています。手元の木と 22.1.6 には入っていません。詳しくは[第 5 回](05-resx-cleanup-leaks.md)にあります。

## 聞かれそうな質問

**Q. resource の振る舞いを変えたら、どの spec を走らせればいいですか？**

まず `//packages/core/test/resource:resource`（70 件、core の 5 つのファイル全部）です。`rxResource` に関わるなら `//packages/core/rxjs-interop/test:test` を `--test_arg=--filter=rxResource` で（17 件）、`httpResource` なら `//packages/common/http/test:test` を `--test_arg=--filter=httpResource` で（22 件）。ブラウザで確かめるなら `:resource_web` が Chromium と Firefox で 70 件ずつ走ります。

**Q. resource の spec はどうやって「読み込み中」を作っていますか？**

resource\_spec.ts の `MockBackend`（30 行目）が、解決しない Promise を作って覚え、`abort`（44 行目）と `flush`（58 行目）で、テストが決めた時点で reject ／ 解決します。読み込みを始めるには `TestBed.tick()` で loadEffect を走らせます。

**Q. spec が全部通れば、直した不具合は戻らないと言えますか？**

言えない場合があります。第 4・5 回で、修正の行を消しても通る it が 3 つ見つかりました（`isActive` の条件、`resolveOnce()`、`httpResource` の subscribe の後の `unsubscribe()`）。また angular-main では、0904f90b13a の 4 件が別のコミット（ecbc89b465c）で消えています。it を足したら、修正の行を消すと落ちることを確かめる、というのが第 5 回の作業木の手順です。

**Q. 開いている resource の issue で、どの章の知識が要りますか？**

#68931（入れ子の router-outlet でのハイドレーション）は[第 4 回](04-resx-ssr-cache.md)の最初の計算と `isActive`、#71585（params のエラーの後の reload）は[第 1 回](01-resx-params-status.md)の `extRequest` と reload の行、#71636（validateAsync の debounce）は[第 2 回](02-resx-debounced.md)の遅らせている間の状態です。

## 読み終えて

- resource の spec の中心は core/test/resource の 5 つのファイル（70 件）で、`:resource`（Node）と `:resource_web`（Chromium・Firefox）で走る
- rxResource と httpResource の spec は、それぞれのディレクトリの `:test` の中にあり、describe の名前で絞って走らせる（17 件・22 件）
- 修正のコミットはたいてい it を 1 つ足すが、修正の行を消しても通る it がある。作業木で消して確かめるのが確実
- angular-main では debounce の timer cleanup の 4 件が消えたまま。origin/main には、読み込みを止める行の修正が 2 本入った

---

← 前: [後片付けと漏れ：destroy、abort、購読の漏れの修正](05-resx-cleanup-leaks.md)  
次: [features とは何か：コンパイラが並べ、defineComponent が順に呼ぶ](../hdi/01-hdi-features-pipeline.md) →
