[目次](../README.md) › [Angular Elements の内側](README.md) › 第 8 回 / 全 8 回

# spec と issue を読む：Angular Elements の今

> packages/elements/test の 6 つの spec（64 件、うち xit 5 件）の地図と、xit が止められている理由、ng\_web\_test\_suite で Chromium と Firefox のブラウザで走る書き方と手元での走らせ方（名前の絞り込みは効かない）。ラベル area: elements の開いている 36 件と 2025 年以降に閉じた 23 件、2024 年 6 月からの修正を、このシリーズのどの章の行に関係するかで絞り込める表にする。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/elements-tests-issues)

---

シリーズの最終回です。`packages/elements/test` の 6 つの spec の地図を作り、5 件の `xit`（飛ばしている it）がなぜ飛ばされているのか、ブラウザで走る spec の書き方と手元での走らせ方（名前の絞り込みが効くか）を確かめます。そのうえで、ラベル `area: elements` の開いている issue 36 件と、2025 年以降に閉じた 23 件を、このシリーズのどの章の行に関係するかで表にし、今の版で直っているかをソースの行で確かめられたものは書きます。

読む対象は `packages/elements/test/`（`BUILD.bazel` と 6 つの spec）です。issue は 2026-11-06 に `gh` で読んだもの、ソースは `../angular` の 8576f161ae4（22.2.0-next.7）です。

1. [1. 全体像](01-elements-overview.md)
2. [2. createCustomElement](02-elements-create.md)
3. [3. 属性と入力](03-elements-attributes-inputs.md)
4. [4. つながるとき](04-elements-connect.md)
5. [5. 入力と変更検知](05-elements-inputs-cd.md)
6. [6. 出力とイベント](06-elements-outputs.md)
7. [7. 切り離しと破棄](07-elements-disconnect.md)
8. **8. spec と issue**（この章）

## 1. spec の地図

6 つのファイルの `it` と `xit` は合わせて 64 件で、そのうち 5 件が `xit` です（走らせると「59 passed, 5 skipped」）。ファイルごとの数と、関係する章ごとの数は次のとおりです（章の割り当ては 5 節の DEMO のスクリプトの規則で、ファイルと行の範囲と describe から決めています）。

| spec | it（うち xit） | 何を確かめるか | 章ごとの it の数 |
| --- | --- | --- | --- |
| `test/create-custom-element_spec.ts` | 14（0） | createCustomElement が作るクラス（observedAttributes・getter と setter・つながる前のプロパティ・出力のイベント）。strategy は偽物の TestStrategy | [3. 属性と入力：2](03-elements-attributes-inputs.md)[2. createCustomElement：8](02-elements-create.md)[6. 出力とイベント：3](06-elements-outputs.md)[7. 切り離しと破棄：1](07-elements-disconnect.md) |
| `test/component-factory-strategy_spec.ts` | 24（5） | 既定の ComponentNgElementStrategy を本物のコンポーネントで（connect・入力・変更検知・ngOnChanges・disconnect・runInZone） | [1. 全体像：1](01-elements-overview.md)[6. 出力とイベント：3](06-elements-outputs.md)[4. つながるとき：6](04-elements-connect.md)[5. 入力と変更検知：12](05-elements-inputs-cd.md)[7. 切り離しと破棄：2](07-elements-disconnect.md) |
| `test/utils_spec.ts` | 13（0） | utils.ts の小さな関数（scheduler・camelToKebabCase・isElement・isFunction・kebabToCamelCase・matchesSelector・strictEquals） | [7. 切り離しと破棄：2](07-elements-disconnect.md)[3. 属性と入力：11](03-elements-attributes-inputs.md) |
| `test/slots_spec.ts` | 4（0） | ShadowDom のコンポーネントで &lt;slot&gt; に投影する | [4. つながるとき：4](04-elements-connect.md) |
| `test/extract-projectable-nodes_spec.ts` | 8（0） | 子を ng-content の select ごとに分ける extractProjectableNodes | [4. つながるとき：8](04-elements-connect.md) |
| `test/create-custom-element-env_spec.ts` | 1（0） | EnvironmentInjector を渡して作る | [2. createCustomElement：1](02-elements-create.md) |

形で分けると 2 種類です。`create-custom-element_spec.ts` は、strategy を偽物（`TestStrategy`。`events` は素の `Subject`、入力は `Map`）にして、要素の側（`NgElementImpl`）だけを確かめます（[第 1 回](01-elements-overview.md)）。`component-factory-strategy_spec.ts` は、本物のコンポーネントと `TestBed` の注入器で、既定の strategy を直接呼びます（[第 5 回](05-elements-inputs-cd.md)の 7 節）。**本物の strategy と本物のカスタム要素を組み合わせて、外して戻すような流れを通す it はありません**。[第 7 回](07-elements-disconnect.md)の #38778 も、[第 6 回](06-elements-outputs.md)の出力の購読が落ちる件も、この隙間にあります。

## 2. 5 件の xit

| 行 | describe | it | 章 |
| --- | --- | --- | --- |
| `component-factory-strategy_spec.ts:163` | ComponentFactoryNgElementStrategy &gt; after connected | should call ngOnChanges with proper firstChange value | [4. つながるとき](04-elements-connect.md) |
| `component-factory-strategy_spec.ts:254` | ComponentFactoryNgElementStrategy &gt; when inputs change and is connected | should detect changes once for multiple input changes | [5. 入力と変更検知](05-elements-inputs-cd.md) |
| `component-factory-strategy_spec.ts:272` | ComponentFactoryNgElementStrategy &gt; when inputs change and is connected | should call ngOnChanges once for multiple input changes | [5. 入力と変更検知](05-elements-inputs-cd.md) |
| `component-factory-strategy_spec.ts:284` | ComponentFactoryNgElementStrategy &gt; when inputs change and is connected | should call ngOnChanges twice for changes in different rounds with previous values | [5. 入力と変更検知](05-elements-inputs-cd.md) |
| `component-factory-strategy_spec.ts:347` | ComponentFactoryNgElementStrategy &gt; runInZone | should run the callback directly when called without zone.js loaded | [5. 入力と変更検知](05-elements-inputs-cd.md) |

5 件とも `component-factory-strategy_spec.ts` にあり、`git blame` で見ると 5 件とも 2024 年 6 月のコミット `0cebfd7462c`（elements の独自の予定をやめて `ComponentRef.setInput` にした）で `xit` になった行です。コミットのメッセージは「実際の動きと合っていなかった it と、`ngOnChanges` の動きが本当に変わった it を止めた」と書いています。`component-factory-strategy_spec.ts:254` の 1 件は [第 5 回](05-elements-inputs-cd.md)の 7 節で読みました。残りを読みます。

📄 `angular/packages/elements/test/component-factory-strategy_spec.ts` L270–300 （▶ の行: 270–272, 276–278, 284, 296–297）

```ts
270 ▶     // Disabled: as in "should detect changes once for multiple input changes" above, CD runs after
271 ▶     // each `setInputValue`, with `ngOnChanges` delivered for each one.
272 ▶     xit('should call ngOnChanges once for multiple input changes', async () => {
273 │       strategy.setInputValue('fooFoo', 'fooFoo-1');
274 │       strategy.setInputValue('barBar', 'barBar-1');
275 │       await whenStable();
276 ▶       expectSimpleChanges(componentRef.instance.simpleChanges[0], {
277 ▶         fooFoo: new SimpleChange(undefined, 'fooFoo-1', true),
278 ▶         barBar: new SimpleChange(undefined, 'barBar-1', true),
279 │       });
280 │     });
281 │ 
282 │     // Disabled: as in "should detect changes once for multiple input changes" above, CD runs after
283 │     // each `setInputValue`, with `ngOnChanges` delivered for each one.
284 ▶     xit('should call ngOnChanges twice for changes in different rounds with previous values', async () => {
285 │       strategy.setInputValue('fooFoo', 'fooFoo-1');
286 │       strategy.setInputValue('barBar', 'barBar-1');
287 │       await whenStable();
288 │       expectSimpleChanges(componentRef.instance.simpleChanges[0], {
289 │         fooFoo: new SimpleChange(undefined, 'fooFoo-1', true),
290 │         barBar: new SimpleChange(undefined, 'barBar-1', true),
291 │       });
292 │ 
293 │       strategy.setInputValue('fooFoo', 'fooFoo-2');
294 │       strategy.setInputValue('barBar', 'barBar-2');
295 │       await whenStable();
296 ▶       expectSimpleChanges(componentRef.instance.simpleChanges[1], {
297 ▶         fooFoo: new SimpleChange('fooFoo-1', 'fooFoo-2', false),
298 │         barBar: new SimpleChange('barBar-1', 'barBar-2', false),
299 │       });
300 │     });
```

270〜271 行目のコメントのとおり、zone の外から入れると `setInputValue` のたびに変更検知が走り、`ngOnChanges` も 1 回ずつ来ます。だから 276〜279 行目の「2 つの入力が 1 回の `SimpleChanges` にまとまる」は成り立ちません。この spec は `provideZoneChangeDetection()` の `TestBed` で走る（`c3576506b3c` で足された）ので、v22 の既定の zoneless で同じことを確かめた it はありません。[第 5 回](05-elements-inputs-cd.md)のデモでは、zoneless で 3 回入れても `ngOnChanges` は 1 回でした。

📄 `angular/packages/elements/test/component-factory-strategy_spec.ts` L324–359 （▶ の行: 330, 338–340, 347, 349, 352）

```ts
324 │   describe('runInZone', () => {
325 │     const param = 'foofoo';
326 │ 
327 │     it("should run the callback directly when invoked in element's zone", () => {
328 │       expect(
329 │         strategy['runInZone'](() => {
330 ▶           expect(Zone.current.name).toBe('angular');
331 │           return param;
332 │         }),
333 │       ).toEqual('foofoo');
334 │     });
335 │ 
336 │     it("should run the callback inside the element's zone when invoked in a different zone", () => {
337 │       expect(
338 ▶         Zone.root.run(() =>
339 ▶           strategy['runInZone'](() => {
340 ▶             expect(Zone.current.name).toBe('angular');
341 │             return param;
342 │           }),
343 │         ),
344 │       ).toEqual('foofoo');
345 │     });
346 │ 
347 ▶     xit('should run the callback directly when called without zone.js loaded', () => {
348 │       // simulate no zone.js loaded
349 ▶       (strategy as any)['elementZone'] = null;
350 │ 
351 │       expect(
352 ▶         Zone.root.run(() =>
353 │           strategy['runInZone'](() => {
354 │             return param;
355 │           }),
356 │         ),
357 │       ).toEqual('foofoo');
358 │     });
359 │   });
```

`runInZone` の 3 件です。330・340 行目で `Zone.current.name` が `'angular'` であることを確かめています。テストのバンドルは zone.js を読み込んで走るからです（3 節の `BUILD.bazel` の deps）。347 行目の `xit` は「zone.js が無いとき」を、349 行目で `elementZone` を `null` にして真似ようとしていますが、352 行目で `Zone.root.run` を呼んでいるので、zone.js が本当に無い場面にはなっていません。`0cebfd7462c` の前は `ngZone.run` の spy が呼ばれないことを確かめる it で、spy をやめて書き直したときに `xit` になりました。止めた理由は、コミットのメッセージには 1 件ずつは書かれていません。どちらにしても、v22 の既定（zone.js 無し）の `runInZone` は、どの it でも確かめていないことになります。

残りの 1 件（`component-factory-strategy_spec.ts:163` の `should call ngOnChanges with proper firstChange value`）は describe `after connected` の中で、直前のコメントが「期待は正しいが `ngOnChanges` の実装にバグがある」と書いています。2 回目の `ngOnChanges` で、初めて入れた入力（`barBar`）にも `firstChange: true` を期待していますが、core の `ngOnChangesSetInput` は `firstChange` をインスタンスで 1 つの印（`previous === EMPTY_OBJ`）で決めるので false になります（[第 5 回](05-elements-inputs-cd.md)の 3 節）。

## 3. ブラウザで走る spec の書き方

📄 `angular/packages/elements/test/BUILD.bazel` L1–24 （▶ の行: 1, 6, 9, 19, 22）

```python
 1 ▶ load("//tools:defaults.bzl", "ng_web_test_suite", "ts_project")
 2 │ 
 3 │ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob(["**/*.ts"]),
 7 │     deps = [
 8 │         "//:node_modules/rxjs",
 9 ▶         "//:node_modules/zone.js",
10 │         "//packages/compiler",
11 │         "//packages/core",
12 │         "//packages/core/testing",
13 │         "//packages/elements",
14 │         "//packages/platform-browser",
15 │         "//packages/platform-browser/testing",
16 │     ],
17 │ )
18 │ 
19 ▶ ng_web_test_suite(
20 │     name = "test",
21 │     deps = [
22 ▶         ":test_lib",
23 │     ],
24 │ )
```

- 6 行目の `glob(["**/*.ts"])` で、6 つの spec はまとめて 1 つの `ts_project` になります。
- 19 行目の `ng_web_test_suite`（1 行目で `tools/defaults.bzl` から読む）が、それを 1 つのバンドルにして、Web Test Runner の上の Jasmine で Chromium と Firefox の両方で走らせます。ターゲットは `:test_chromium` と `:test_firefox` の 2 つになります。マクロの中身は [contrib-bazel](../contrib/04-contrib-bazel.md) で、同じ形の event-dispatch の spec は [jsaction-tests-issues](../jsaction/12-jsaction-tests-issues.md) で読みました。2025 年 6 月の `b84859073bf` で、それまでの `karma_web_test_suite` からこの形に移りました。
- 9 行目で zone.js が deps に入っています。`component-factory-strategy_spec.ts` は `NgZone.assertInAngularZone()` や `Zone.current` を使うので、zone.js が読み込まれた状態で走ります（実行のログにも「zoneless なのに Zone.js を読み込んでいる」という NG0914 の警告が出ます）。
- spec はふつうの Jasmine の `describe` / `it` で、DOM はブラウザの本物です。`create-custom-element_spec.ts` は `customElements.define` を `test-element-1`・`test-element-2` … と番号を変えながら呼びます（登録は取り消せないので、このシリーズのデモと同じく名前を毎回変える）。
- 非同期は `fakeAsync` を使わず、`ApplicationRef.isStable` を待つ `whenStable` や、本物の `setTimeout` を `await` します（[第 7 回](07-elements-disconnect.md)の describe `disconnect`）。`0cebfd7462c` のメッセージに「`fakeAsync` を使わないようにした」とあります。

## 4. 手元での走らせ方

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
git rev-parse --short HEAD          # 8576f161ae4
pnpm bazel test //packages/elements/... --nocache_test_results --test_output=all

# 名前の絞り込みを試した
pnpm bazel test //packages/elements/test:test_chromium \
  '--test_arg=--filter=disconnect' --nocache_test_results --test_output=all
```

📄 `出力（2026-11-06 に実行。抜粋。ログは scratchpad/el-logs/b-all.log・b-filter.log）`

```
Chromium: |██████████| 1/1 test files | 59 passed, 0 failed, 5 skipped
Finished running tests in 0.9s, all tests passed!
Firefox:  |██████████| 1/1 test files | 59 passed, 0 failed, 5 skipped
Finished running tests in 3.4s, all tests passed!
//packages/elements:elements_api        PASSED in 2.4s
//packages/elements:elements_deps       PASSED in 1.0s
//packages/elements/test:test_chromium  PASSED in 2.7s
//packages/elements/test:test_firefox   PASSED in 5.5s
//packages/elements/test:test_lib_deps  PASSED in 1.0s
INFO: Elapsed time: 12.672s

# --test_arg=--filter=disconnect（絞り込みは効かず、59 件すべて走る）
Chromium: |██████████| 1/1 test files | 59 passed, 0 failed, 5 skipped
//packages/elements/test:test_chromium  PASSED in 1.4s
```

- `//packages/elements/...` でテストのターゲットは 5 つです。spec が走るのは `test_chromium` と `test_firefox` で、`elements_api` は `packages/elements/BUILD.bazel` の `api_golden_test_npm_package`（`goldens/public-api/elements` と公開 API を比べる）、`elements_deps`・`test_lib_deps` は `tools/defaults.bzl` のマクロが足す `strict_deps_test`（import と deps が合っているか）です。全体で 13 秒ほど、Chromium のターゲットだけなら 3 秒ほどです。
- `--test_arg=--filter=disconnect` を付けても 59 件すべてが走りました。**名前の絞り込みは効きません**。1 件だけを手元で走らせたいときは、spec の中で一時的に `fit` にする方法がありますが、本家の spec を変えることになるので、このシリーズでは試していません。
- 同じマシンで別の bazel を走らせていると、出力のロックを待ち合います。待たされても止めずに待ちます。

## 5. DEMO：spec・issue・修正を章で絞り込む

> **🧪 DEMO — spec の地図・issue の表・修正の表（ライブの絞り込み）**
>
> 章を選ぶと、3 つの表がその章に関係する行だけになります。言葉で絞ると、spec は describe と it の名前、issue は番号・要約・ラベル・「今の版では」の欄、修正はハッシュと要約から探します。データは下のスクリプト（spec）と、2026-11-06 に `gh` と `git show` で読んだ結果（issue・修正）から生成したものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/elements-tests-issues)

## 6. 表から読み取れること

- **開いている 36 件のうち 25 件は 2023 年までに開かれたもの**です。scheduleDetectChanges（#33059・#43168）のように、issue が指している関数がもう無いものがあるので、読むときは「今の版の行」で確かめ直す必要があります。表の「今の版では」の欄は、その確かめの結果です。「未確認」は、このシリーズでは確かめていないものです。
- **章で数えると、開いている issue が多いのは [第 4 回](04-elements-connect.md)（投影・ngOnInit の順番・Shadow DOM、12 件）**で、次が第 1 回と第 2 回（6 件ずつ、feature の要望が多い）、第 5 回（5 件）、[第 7 回](07-elements-disconnect.md)（4 件）です。第 7 回の開いている 4 件（#64229・#58707・#49531・#38778）と閉じた 3 件（#67890・#38962・#70905）は、どれも「外して戻す」の 1 か所に集まっています。
- **閉じた 23 件は、completed 8・not planned 8・duplicate 7**です。completed のうちコードの修正が確かめられたのは #62097（`be0455adda7`）と #59757（`0c1ecb453c8`）で、#62428・#61921 は「v21 で再現しない」として閉じています。
- **2024 年 6 月からの packages/elements の主な修正は表の 11 件（build・Node.js の版・license の文言などは除いた）で、elements のふるまいを変えたのは 4 件**（`0cebfd7462c`・`fe5c4e086ad`・`0c1ecb453c8`・`be0455adda7`）です。ほかは core 全体の変更（OnPush の既定・ComponentFactoryResolver の削除・`Object.hasOwn`・`isViewDirty` の関数化）に合わせたものと、テストの形の変更です。
- 貢献の入り口として読むなら、まず 1 節の「本物の strategy と本物の要素を組み合わせた it が無い」隙間です。#38778 のように原因の行がはっきりしている issue でも、その行を通る it が無いので、直す前に「今の挙動を確かめる it」を手元で書くところから始められます（本家に出すかどうかは、その後で考えます）。

## このシリーズで見つけたもの

第 1〜7 回を書く途中で、本家の不具合らしきものと、テストや文書の小さな食い違いが見つかりました。どれも **issue も PR も出していません**。どれも本物の @angular/elements 22.1.6 をこのサイトの本番ビルドの上で動かして再現し、上の 3 つは私がソースの行（8576f161ae4）をもう一度読んで確かめました。本家の spec の形では走らせていません（../angular を変更しないため）。gh で探した範囲では、#38778 のほかに同じ報告は見つかりませんでした。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| output() を持つコンポーネントの要素を、外して 10 ms 以上待ってから戻すと、それからあとは出力のイベントが二度と届かない。events の ReplaySubject(1) が壊れたコンポーネントの出力の配列を覚えたままで、戻したときの購読でその配列が渡り、壊れた OutputEmitterRef の subscribe が NG0953 を投げて、要素の購読が error で閉じる。あとで作り直したコンポーネントの出力（EventEmitter も）も届かない | elements/src/component-factory-strategy.ts 71・74 行目と initializeOutputs（229-241 行目）、core/src/authoring/output/output\_emitter\_ref.ts 52-58 行目 | 本番ビルドと開発ビルドで、外して 50 ms 待って戻すのを 3 回（戻すたびに NG0953、新しいボタンを押しても 0 件）。第 6 回に記録として載せた | [第 6 回](06-elements-outputs.md) |
| （既存の issue）壊れたあとに同じ要素をつなぎ直すと、コンポーネントが作られない。壊す予定の関数が scheduledDestroyFn を null に戻さないので、次の connect が取り消しの道に入って return する。待ってから戻すと、作り直される回とされない回が 1 回おきになる。2020 年から開いている #38778。直す PR の #38816・#58586 はどちらも merge されずに閉じている | elements/src/component-factory-strategy.ts 120-123 行目と 146-151 行目 | 第 7 回のデモ（外す → 50 ms 待って戻す、を繰り返す） | [第 7 回](07-elements-disconnect.md)・[第 4 回](04-elements-connect.md) |
| config.injector に NodeInjector（コンポーネントの constructor で受けた Injector。公式のガイドの例の形）を渡すと、standalone のコンポーネントの imports にある NgModule の provider が見えない。`this.injector as EnvironmentInjector` は型を言い張るだけで、core は本物の EnvironmentInjector のときしか standalone の注入器を作らない。df9eed4ff1d で ComponentFactoryResolver を使わない形にしてから | elements/src/component-factory-strategy.ts 207 行目 | Node の JIT の記録（EnvironmentInjector と `Injector.create({parent: NodeInjector})` では見え、NodeInjector では null）。21 系以前で見えていたかは確かめていない | [第 4 回](04-elements-connect.md) |
| （このサイトで目立つ形）ハイドレーションを使うアプリでは、ホストの中身が残る（PRESERVE\_HOST\_CONTENT）ので、作り直したときに古い DOM の後ろに新しい DOM が足される。どの ng-content にも合わない子は、要素の先頭に残る。ハイドレーションの無いアプリでは消える | elements/src/component-factory-strategy.ts の initializeComponent（hostElement を渡す） | 第 4 回・第 7 回のデモと、ハイドレーションの無いアプリの記録 | [第 4 回](04-elements-connect.md)・[第 7 回](07-elements-disconnect.md) |
| （仕様の言い方）ngOnChanges の firstChange が、入力ごとではなくインスタンスごとに決まる。spec の xit のコメントが「ngOnChanges の実装のバグ」と書いている | elements/test/component-factory-strategy\_spec.ts 163 行目（xit） | spec を読む。第 5 回のデモ | [第 5 回](05-elements-inputs-cd.md) |
| （spec）extract-projectable-nodes\_spec の it の名前が動きと合わない。83 行目は「コメントは無視する」とあるのに期待ではコメントが `*` に入り、99 行目は「`*` を優先する」とあるのに期待は逆で、名前に typo もある。5 つの xit（163・254・272・284・347 行目）はどれも 0cebfd7462c で xit になったまま | elements/test/extract-projectable-nodes\_spec.ts 83・99 行目、component-factory-strategy\_spec.ts | spec を読む | [第 4 回](04-elements-connect.md)・[第 8 回](08-elements-tests-issues.md) |
| （文書）reflectComponentType の JSDoc の例で、propName と templateName が逆になっている | core/src/render3/component.ts 188-189 行目 | コードと見比べる | [第 3 回](03-elements-attributes-inputs.md) |

読み方の目安: 上の 3 つは、要素を外して戻す・注入器を渡す、というよくある使い方で出るので、影響がいちばん大きいものです。とくに 1 つ目と 2 つ目は、同じ「外して戻す」の道の別の欄（eventEmitters と scheduledDestroyFn）なので、issue を読むときは一緒に見ると分かりやすくなります。

## 聞かれそうな質問

**Q. Angular Elements の spec を 1 件だけ走らせられますか？**

bazel の引数ではできません。`BUILD.bazel` の 19 行目の `ng_web_test_suite` は 6 つの spec を 1 つのバンドルにして走らせ、`--test_arg=--filter=disconnect` を付けても 59 件すべてが走りました（4 節）。Chromium のターゲットだけにすれば 3 秒ほどで終わります。

**Q. 5 skipped は何ですか？壊れているテストですか？**

5 件とも `component-factory-strategy_spec.ts` の `xit` です。4 件は `0cebfd7462c` で、実際の動き（zone の外から入れると代入ごとに変更検知と `ngOnChanges` が来る。270〜271 行目のコメント）と合わないので止めたもの、163 行目の 1 件は、直前のコメントが「この it の期待は正しいが、`ngOnChanges` の実装にバグがある」と書いています（`firstChange` が入力ごとではない。[第 5 回](05-elements-inputs-cd.md)の 3 節）。347 行目の 1 件は zone.js が無いときの it で、止めた理由は個別には書かれていません。どれも、テストの仕組みが壊れているのではなく、期待と今の動きが違うので止めてあります。

**Q. spec は zone.js ありで走っているのに、v22 の既定の zoneless は確かめられているのですか？**

`component-factory-strategy_spec.ts` は `provideZoneChangeDetection()` の `TestBed` で走ります（`c3576506b3c`）。zoneless で入力をまとめる動きや、zone.js の無い `runInZone` を確かめる it はありません（2 節）。このシリーズでは第 5 回のデモ（本番ビルドのこのサイト、zone.js 無し）で確かめました。

**Q. 開いている issue は今の版でも起きますか？**

確かめたものは表の「今の版では」の欄に書きました。#38778（外して待って戻すと作り直されない）は第 7 回のデモで v22 でも起きることを確かめました。#39489（泡立たない）・#58302（プロパティと属性で名前の付け方が違う）・#23557（属性への同期が無い）は、今のソースの行のとおりです。#33059・#43168 は、issue が指す関数がもう無く、仕組みが変わっています。

## 読み終えて

- spec は 6 ファイル 64 件。要素の側は偽物の strategy で、strategy は本物のコンポーネントで、別々に確かめています。
- ブラウザの Jasmine で Chromium と Firefox の両方で走り、名前の絞り込みは効きません。全体で 13 秒ほどです。
- 5 件の `xit` はどれも `0cebfd7462c` からで、3 件は zone のアプリでの「代入ごとの変更検知」と期待が合わないため、1 件は core の `ngOnChanges` の `firstChange` のためです。zoneless の既定を確かめる it はありません。
- issue は古いものが多く、指している関数が消えているものもあります。今の版の行で確かめ直してから読みます。外して戻す流れ（第 7 回）が、原因の行がはっきりしていて it が無い場所です。

---

← 前: [切り離しと破棄：少し待ってから壊す](07-elements-disconnect.md)  
次: [直す前の準備：手元の複製と 1 つの直しの流れ](../fix/01-fix-overview.md) →
