[目次](../README.md) › [イベント配送（event-dispatch）と jsaction の内側](README.md) › 第 12 回 / 全 12 回

# spec と issue を読む：event-dispatch の今

> packages/core/primitives/event-dispatch/test/（eventcontract\_test・dispatcher\_test・event\_dispatcher\_test・event\_test）がブラウザで走る書き方と手元での走らせ方（名前の絞り込みは効かない）、platform-server の event\_replay\_test（--filter が効く）。ラベル core: event dispatch と core: event listeners の issue、ラベルの無いイベントの再生の issue、2025 年 11 月以降の修正を、このシリーズのどの章の行に関係するかで絞り込める表にする。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/jsaction-tests-issues)

---

シリーズの最終回です。event-dispatch を確かめている 4 つの spec と、Angular の側の `event_replay_spec.ts` の地図を作り、ブラウザで走る spec の書き方と手元での走らせ方（名前の絞り込みが効くか）を確かめます。そのうえで、ラベル `core: event dispatch`・`core: event listeners` の issue と、ラベルの無いイベントの再生の issue、2025 年 11 月以降の修正を、このシリーズのどの章のどの行に関係するかで表にします。

読む対象は `packages/core/primitives/event-dispatch/test/`（`BUILD.bazel`・`html.ts`・4 つの spec）と `packages/platform-server/test/` の `BUILD.bazel`・`event_replay_spec.ts` です。issue は 2026-11-06 に `gh` で読んだものです。

1. [1. 全体像](01-jsaction-overview.md)
2. [2. jsaction 属性](02-jsaction-attribute.md)
3. [3. EventInfo](03-jsaction-event-info.md)
4. [4. イベントの種類](04-jsaction-event-types.md)
5. [5. 早期の契約](05-jsaction-early-contract.md)
6. [6. EventContract](06-jsaction-contract.md)
7. [7. 行き先を探す](07-jsaction-resolver.md)
8. [8. a11y の click](08-jsaction-a11y-click.md)
9. [9. mouseenter とタッチ](09-jsaction-mouse-touch.md)
10. [10. Dispatcher](10-jsaction-dispatcher.md)
11. [11. Angular の側](11-jsaction-angular.md)
12. **12. spec と issue**（この章）

## 1. spec の地図

5 つのファイルの `it` は合わせて 134 件です。ファイルごとの数と、関係する章ごとの数は次のとおりです（章の割り当ては 4 節の DEMO のスクリプトの規則で、it の名前と describe から決めています）。

| spec | it | 大きな describe | 何を確かめるか | 章ごとの it の数 |
| --- | --- | --- | --- | --- |
| `eventcontract_test.ts` | 17 | `EventContract`（156 行目）・その中の `early events`（395）・`non-bubbling mouse events`（507） | 入れ物にリスナーが付くか、dispatcher の登録まで積むか、早期の契約から渡されるか | [6. EventContract](06-jsaction-contract.md) 9 [4. イベントの種類](04-jsaction-event-types.md) 3 [5. 早期の契約](05-jsaction-early-contract.md) 3 [9. mouseenter とタッチ](09-jsaction-mouse-touch.md) 2 |
| `dispatcher_test.ts` | 30 | `Dispatcher`（332）・`a11y click`（765）・`non-bubbling mouse events`（884） | 本物の `EventContract` と素の `Dispatcher` を組み、DOM で `dispatchEvent` して、行き先・キャッシュ・再生・`<a>` の preventDefault を見る | [7. 行き先を探す](07-jsaction-resolver.md) 6 [2. jsaction 属性](02-jsaction-attribute.md) 6 [10. Dispatcher](10-jsaction-dispatcher.md) 5 [8. a11y の click](08-jsaction-a11y-click.md) 5 [9. mouseenter とタッチ](09-jsaction-mouse-touch.md) 8 |
| `event_dispatcher_test.ts` | 7 | `EventDispatcher`（68）・`bubbling`（111） | 手で作った `EventInfo` を `EventDispatcher` に渡し、泡立ち・再生・`stopPropagation` を見る | [10. Dispatcher](10-jsaction-dispatcher.md) 7 |
| `event_test.ts` | 57 | `event test.ts`（66）の 1 つだけ | event.ts の関数を 1 つずつ（リスナーの付け方・修飾キー・Enter と Space・mouseenter の作り直し・タッチ） | [4. イベントの種類](04-jsaction-event-types.md) 12 [9. mouseenter とタッチ](09-jsaction-mouse-touch.md) 29 [8. a11y の click](08-jsaction-a11y-click.md) 16 |
| `event_replay_spec.ts` | 23 | `event replay`（70）・`host bindings`・`bubbling behavior`・`event dispatch script`・`event replay queue` | platform-server でサーバーとして描き、domino の DOM でハイドレートして、Angular の再生を見る | [11. Angular の側](11-jsaction-angular.md) 8 [event-replay（イベントの再生）](../platform/14-event-replay.md) 12 [10. Dispatcher](10-jsaction-dispatcher.md) 3 |

件数は [第 1 回](01-jsaction-overview.md)の数（17・30・7・57 と 23）と同じです。2026-03-10 の 667219230ac（重なったテストを消す）で、event-dispatch の spec から `prevents default for enter key on anchor child`（dispatcher\_test.ts）と `is mouse special event not mouse`（event\_test.ts）の、同じ名前の 2 つ目が消えています。

## 2. ブラウザで走る spec の書き方

📄 `angular/packages/core/primitives/event-dispatch/test/BUILD.bazel` L1–19 （▶ の行: 4, 6–8, 12, 16–18）

```python
 1 │ load("//tools:defaults.bzl", "ng_web_test_suite", "ts_project")
 2 │ 
 3 │ ts_project(
 4 ▶     name = "browser_test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob(
 7 ▶         [
 8 ▶             "**/*.ts",
 9 │         ],
10 │     ),
11 │     deps = [
12 ▶         "//packages/core/primitives/event-dispatch",
13 │     ],
14 │ )
15 │ 
16 ▶ ng_web_test_suite(
17 ▶     name = "browser_test",
18 ▶     deps = [":browser_test_lib"],
19 │ )
```

1. **3〜14 行目：test/ の \*.ts を全部 1 つのライブラリにする**

   6〜10 行目の `glob(["**/*.ts"])` なので、4 つの spec と `html.ts` がまとめて入ります。12 行目の依存は `//packages/core/primitives/event-dispatch` の 1 つだけで、Angular の core には依存しません。
2. **16〜19 行目：ng\_web\_test\_suite**

   名前 `browser_test` から、`browser_test_chromium` と `browser_test_firefox` の 2 つのターゲットができます。中身はライブラリを 1 つの spec のバンドルに束ね、Web Test Runner で本物のブラウザ（ヘッドレス）に読ませるものです（`tools/bazel/web_test.bzl`。[contrib-bazel の章](../contrib/04-contrib-bazel.md)）。だから、どの spec の it も 1 つのファイル（`browser_test_bundle.spec.js`）の中の Jasmine の it として走ります。

📄 `angular/packages/core/primitives/event-dispatch/test/html.ts` L9–15 （▶ の行: 10–11, 15）

```ts
 9 │ export const safeElement = {
10 ▶   async setInnerHtml(element: Element, content: string) {
11 ▶     element.innerHTML = content;
12 │   },
13 │ };
14 │ 
15 ▶ export const testonlyHtml = (content: string) => content;
```

spec は DOM を作るときに `innerHTML` を直接書かず、11 行目の `safeElement.setInnerHtml` と 15 行目の `testonlyHtml` を通します。どちらもこのファイルでは素通しです（`innerHTML` に入れるだけ、文字列をそのまま返すだけ）。各 spec の `beforeEach` は `safeElement.setInnerHtml(document.body, testonlyHtml(domContent))` で、spec の先頭に書いた HTML を `<body>` に入れ直します。

📄 `angular/packages/core/primitives/event-dispatch/test/dispatcher_test.ts` L300–330 （▶ の行: 300–301, 317–319, 325–327）

```ts
300 ▶ function createDispatchDelegateSpy() {
301 ▶   return jasmine.createSpy<(eventInfoWrapper: EventInfoWrapper) => void>('dispatchDelegate');
302 │ }
303 │ 
304 │ function createDispatcher({
305 │   dispatchDelegate,
306 │   eventContract,
307 │   eventReplayer,
308 │   a11yClickSupport = false,
309 │   syntheticMouseEventSupport = false,
310 │ }: {
311 │   dispatchDelegate: (eventInfoWrapper: EventInfoWrapper) => void;
312 │   eventContract?: EventContract;
313 │   eventReplayer?: Replayer;
314 │   a11yClickSupport?: boolean;
315 │   syntheticMouseEventSupport?: boolean;
316 │ }) {
317 ▶   const actionResolver = new ActionResolver({syntheticMouseEventSupport});
318 ▶   if (a11yClickSupport) {
319 ▶     actionResolver.addA11yClickSupport(
320 │       updateEventInfoForA11yClick,
321 │       preventDefaultForA11yClick,
322 │       populateClickOnlyAction,
323 │     );
324 │   }
325 ▶   const dispatcher = new Dispatcher(dispatchDelegate, {actionResolver, eventReplayer});
326 ▶   if (eventContract) {
327 ▶     registerDispatcher(eventContract, dispatcher);
328 │   }
329 │   return dispatcher;
330 │ }
```

dispatcher\_test.ts の組み立ての helper です。301 行目の受け手は Jasmine の spy で、317 行目で `ActionResolver` を作り、318〜324 行目で a11y の click を足すかを選び（[第 8 回](08-jsaction-a11y-click.md)）、325 行目で素の `Dispatcher` を作って、326〜328 行目で契約に登録します。it はこの helper と、本物の `MouseEvent` を `dispatchEvent` する helper を組み合わせて、受け手の spy の引数（`EventInfoWrapper`）を見ます。[第 10 回](10-jsaction-dispatcher.md)の 1 節のとおり、Angular が使う `EventDispatcher` ではなく素の `Dispatcher` を通した確かめです。

## 3. platform-server の event\_replay\_test

📄 `angular/packages/platform-server/test/BUILD.bazel` L52–83 （▶ の行: 53, 55, 60, 68–69, 73, 77–78, 81）

```python
52 │ ts_project(
53 ▶     name = "event_replay_test_lib",
54 │     testonly = True,
55 ▶     srcs = ["event_replay_spec.ts"],
56 │     deps = [
57 │         ":dom_utils",
58 │         "//packages/common",
59 │         "//packages/core",
60 ▶         "//packages/core/primitives/event-dispatch",
61 │         "//packages/core/testing",
62 │         "//packages/platform-browser",
63 │         "//packages/platform-server",
64 │         "//packages/private/testing",
65 │     ],
66 │ )
67 │ 
68 ▶ # This target is meant to run with Zone.js as some test cases are shared between Zone & Zoneless.
69 ▶ angular_jasmine_test(
70 │     name = "test",
71 │     data = [
72 │         ":test_lib",
73 ▶         "//packages/core/primitives/event-dispatch:contract_bundle_min",
74 │     ],
75 │ )
76 │ 
77 ▶ zoneless_jasmine_test(
78 ▶     name = "event_replay_test",
79 │     data = [
80 │         ":event_replay_test_lib",
81 ▶         "//packages/core/primitives/event-dispatch:contract_bundle_min",
82 │     ],
83 │ )
```

- 53〜55 行目：`event_replay_spec.ts` は 1 つだけで `event_replay_test_lib` になります。同じフォルダーのほかの spec をまとめる `test_lib` は、glob から `event_replay_spec.ts` を外しています。
- 77〜83 行目：`zoneless_jasmine_test` なので、Zone.js なしの Node の Jasmine で走ります。68 行目のコメントのとおり、69 行目の `test`（Zone.js あり）とは別のターゲットです。
- 73・81 行目：どちらも `contract_bundle_min`（最小化した早期の契約。[第 5 回](05-jsaction-early-contract.md)）を data に持ちます。spec がこれを読み込むからです。

📄 `angular/packages/platform-server/test/event_replay_spec.ts` L70–91 （▶ の行: 75–76, 80, 89–90）

```ts
70 │ describe('event replay', () => {
71 │   const originalDocument = globalThis.document;
72 │   const originalWindow = globalThis.window;
73 │ 
74 │   beforeAll(async () => {
75 ▶     globalThis.window = globalThis as unknown as Window & typeof globalThis;
76 ▶     await import('../../core/primitives/event-dispatch/contract_bundle_min.js' as string);
77 │   });
78 │ 
79 │   beforeEach(() => {
80 ▶     destroyPlatform();
81 │   });
82 │ 
83 │   afterAll(() => {
84 │     globalThis.window = originalWindow;
85 │     globalThis.document = originalDocument;
86 │   });
87 │ 
88 │   afterEach(() => {
89 ▶     destroyPlatform();
90 ▶     window._ejsas = {};
91 │   });
```

75 行目で `globalThis.window` を `globalThis` にし、76 行目で最小化した契約を import します。これで `window.__jsaction_bootstrap` ができ、サーバーで描いた HTML の 1 行を実行できるようになります。89〜90 行目で、it ごとにプラットフォームを壊し、`window._ejsas` を空にします。it の中では `ssr()` でサーバーとして描き、`prepareEnvironment` で domino の DOM に入れ、`hydrate()` でブラウザとして起動します（[第 11 回](11-jsaction-angular.md)の「テストと直し方」）。

## 4. 手元での走らせ方

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
# event-dispatch の 4 つの spec（ブラウザ 2 つ）と、安全な DOM の使い方の検査
pnpm bazel test //packages/core/primitives/event-dispatch/... --nocache_test_results --test_output=all
# Angular の側（Node の Jasmine、zoneless）
pnpm bazel test //packages/platform-server/test:event_replay_test --nocache_test_results --test_output=all
# Node の Jasmine は名前の絞り込みが効く（正規表現）
pnpm bazel test //packages/platform-server/test:event_replay_test \
  '--test_arg=--filter=bubbling behavior' --nocache_test_results --test_output=all
```

📄 `出力（抜粋）`

```
# 2026-11-06（scratchpad/jsa-logs/d-all.log・d-filter-browser.log・d-filter-server.log）
Chromium: |██████████| 1/1 test files | 111 passed, 0 failed
Firefox:  |██████████| 1/1 test files | 111 passed, 0 failed
23 specs, 0 failures
//packages/core/primitives/event-dispatch/test:browser_test_chromium   PASSED in 0.9s
//packages/core/primitives/event-dispatch/test:browser_test_firefox    PASSED in 2.0s
//packages/platform-server/test:event_replay_test                      PASSED in 1.1s

# browser_test_chromium に --test_arg=--filter=EventDispatcher を付けても
Chromium: |██████████| 1/1 test files | 111 passed, 0 failed

# event_replay_test に --test_arg=--filter=bubbling behavior
Ran 3 of 23 specs
3 specs, 0 failures
//packages/platform-server/test:event_replay_test                      PASSED in 0.6s
```

- **ブラウザの 2 つのターゲットでは、名前の絞り込みは効きません**。`--test_arg=--filter=EventDispatcher` を付けても 111 件すべてが走りました。1 つのターゲットは 1〜2 秒なので、ターゲット全体を走らせます。
- **event\_replay\_test では `--test_arg=--filter=…` が効きます**（Node の Jasmine の正規表現）。`bubbling behavior` で 3 件、第 11 回の正規表現で 6 件でした。0 件に一致しても PASSED になるので、「Ran N of 23 specs」を見ます。
- `//packages/core/primitives/event-dispatch/...` には、spec のほかに `tsec_test`（ソースの DOM の使い方の検査）と `*_deps` のターゲットも入ります。JSA-COMMON の記録（base.log）では、6 つのターゲットで 9.5 秒でした。

## 5. DEMO：spec・issue・修正を章で絞り込む

> **🧪 DEMO — spec の地図・issue の表・修正の表（ライブの絞り込み）**
>
> 章を選ぶと、3 つの表がその章に関係するものだけになります。文字を入れると、名前・要約・ラベル・ファイル名で絞り込みます。spec の表は `specmap.mjs`（下に全文）が ../angular の spec から拾った it の一覧で、issue と修正の表は 2026-11-06 に `gh` と `git show` で読んで書いたものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/jsaction-tests-issues)

📄 `scratchpad/jsa-demo/d/specmap.mjs（spec の表を作ったスクリプト。node で実行）`

```
// 5 つの spec ファイルの describe / it を行番号つきで拾い、関係する章を規則で付けて JSON にする（読むだけ）。
import { readFileSync, writeFileSync } from 'node:fs';
const A = '~/angular-research/angular/';
const FILES = [
  'packages/core/primitives/event-dispatch/test/eventcontract_test.ts',
  'packages/core/primitives/event-dispatch/test/dispatcher_test.ts',
  'packages/core/primitives/event-dispatch/test/event_dispatcher_test.ts',
  'packages/core/primitives/event-dispatch/test/event_test.ts',
  'packages/platform-server/test/event_replay_spec.ts',
];
function chapter(file, path, name) {
  const p = path.join(' > ');
  const all = `${p} > ${name}`;
  if (file.endsWith('event_replay_spec.ts')) {
    if (/already handled|cleanup `window\._ejsas|event replay queue|destroyed before becoming stable|multiple apps/.test(all)) return 'jsaction-angular';
    if (/bubbling behavior/.test(all)) return 'jsaction-dispatcher';
    return 'event-replay';
  }
  if (file.endsWith('event_dispatcher_test.ts')) return 'jsaction-dispatcher';
  if (/non-bubbling mouse|mouse special|pointer|recreate touch/.test(all)) return 'jsaction-mouse-touch';
  if (/a11y click|action key|space key|prevent default on native html control|valid action key/.test(all)) return 'jsaction-a11y-click';
  if (/early events/.test(all)) return 'jsaction-early-contract';
  if (file.endsWith('event_test.ts')) {
    if (/is modified click/.test(all)) return 'jsaction-mouse-touch';
    return 'jsaction-event-types';
  }
  if (file.endsWith('eventcontract_test.ts')) {
    if (/passive/.test(name)) return 'jsaction-event-types';
    return 'jsaction-contract';
  }
  // dispatcher_test.ts
  if (/caches jsaction|re-parses|trailing semicolon|without action names|without event type/.test(name)) return 'jsaction-attribute';
  if (/replays|prevents default|does not prevent default/.test(name)) return 'jsaction-dispatcher';
  return 'jsaction-resolver';
}
const rows = [];
for (const f of FILES) {
  const lines = readFileSync(A + f, 'utf8').split('\n');
  const stack = []; // {name, indent}
  lines.forEach((l, i) => {
    const m = /^(\s*)(describe|it)\((['`])(.*?)\3/.exec(l);
    if (!m) return;
    const indent = m[1].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (m[2] === 'describe') stack.push({ name: m[4], indent });
    else rows.push({ file: f.split('/').pop(), line: i + 1, describe: stack.map((s) => s.name).join(' > '), it: m[4], chapter: chapter(f, stack.map((s) => s.name), m[4]) });
  });
}
const counts = {};
for (const r of rows) counts[r.file] = (counts[r.file] ?? 0) + 1;
console.log(counts, rows.length);
const byCh = {};
for (const r of rows) byCh[r.chapter] = (byCh[r.chapter] ?? 0) + 1;
console.log(byCh);
writeFileSync(new URL('./specmap.json', import.meta.url), JSON.stringify(rows, null, 1));

```

## 6. 表から読み取れること

- **ラベル `core: event dispatch` の開いている issue は 2 件**（#66506・#59260）で、どちらもイベントの再生（Angular の側）の話です。event-dispatch の中身（契約・行き先の解決・配り役）の不具合として開いているものはありません。
- **ラベルの無い新しい 3 件**（#71518・#71545・#71296、2026-10）は、どれも「インクリメンタルハイドレーションが既定になり、契約がアプリの終わりまで残る」ようになった形（68628dd45bf、2026-04-08）と関係します。#71518 は再生のあとも `<body>` に残る早期の箱のリスナー、#71545 は残った `EventContract` が受け続ける click、#71296 は塊のハイドレーションの途中のイベントの話です。
- **`core: event listeners` の 13 件**は、ほとんどが 2015〜2019 年の機能の要望で、テンプレートのリスナーと EventManager（[domr-listen](../domr/14-domr-listen.md)・[domr-event-manager](../domr/13-domr-event-manager.md)）の話です。event-dispatch の行に関係するのは、捕獲の段（#11200）と passive（#8866）が[第 4 回](04-jsaction-event-types.md)の `addEventListener` に、`stopImmediatePropagation`（#9587）が[第 10 回](10-jsaction-dispatcher.md)の差し替えに、それぞれ近いことだけです。
- **修正の 25 件のうち、イベントの配り方や再生の動きを変えたのは 4 件**（d5fd51e9569・3583c01bf9a・30e9c62bdfb・a24179e1251）と、既定を変えた 68628dd45bf です。表のほかの 8 件は、印・型・import・テストの直しです。表に入れていない 12 件は、platform-server の URL と host の扱いなどの 6 件（cf9d7fa0f80・abfb04a3421・e14d34e9eec・1307ff355c9・60552a73e82・76235803784）と、整形・文書・型の整理の 6 件（6270bba056c・26fed34e0e3・0432e761713・cf47ce2db9d・34e1fe235f3・a67e00741c2）です。
- **spec が確かめていない形**：捕獲の種類を対象の要素だけに渡す行（第 10 回の 3 節）、素の `Dispatcher` の 2 回目の再生（第 10 回の 2 節）、2 つの `EventDispatcher` が同じ `Event` を配る形（第 10 回の 6 節）、安定のあとの早期の箱（第 11 回の 5 節）。

> [!TIP]
> **新卒エンジニアへ**
>
> issue を読むときは、本文の「Cause」に書かれた行が、手元の木（8576f161ae4）や main で今もその形かを、まず `git log -L` や `gh api 'repos/angular/angular/contents/<path>?ref=main'` で確かめます。#71518 の本文が指す `initEventReplay` は、main では `APP_ID` が重なったときに早く戻る形に変わっています（3a0835b3328。第 11 回の 5 節の行の少し上）が、`removeAllAppScopedEventListeners` を呼ばないことは同じでした（2026-11-06）。

## このシリーズで見つけたもの

第 1〜11 回を書く途中で、本家の不具合らしきものと、テストや文書の小さな食い違いが見つかりました。どれも **issue も PR も出していません**。上の 4 つは、本物の配布物（@angular/core 22.1.6）か手元のソース（8576f161ae4）を本物の Chrome で動かして再現し、私がソースの行をもう一度読んで確かめました。本家の spec の形では走らせていません（../angular を変更しないため）。gh で探した範囲では、#71518 のほかに同じ報告は見つかりませんでした。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| ハイドレーションの前に Shift や Cmd（Mac 以外では Ctrl）を押しながらしたクリックが、渡し直されない。早期の契約には貯まるが、再生のときに種類が clickmod に書き換わり、サーバーが付けた `click:;` に当たらない。2a915d1912d（#57201）は当時のイベントの委譲には clickModSupport を false で渡したが、イベントの再生には渡していない | core/src/hydration/event\_replay.ts 220 行目（`new EventDispatcher(fn)` で clickModSupport が既定の true）と primitives/event-dispatch/src/action\_resolver.ts 93-98 行目 | このサイトの本番のプリレンダーで main を止めたまま押してから JS を流す（ふつうのクリックは動き、Shift・Cmd は動かない）。ソースを束ねた記録でも delegate が 0 回 | [第 7 回](07-jsaction-resolver.md) |
| 同じ Event を 2 つの EventDispatcher が配ると、2 つ目で `TypeError: Cannot redefine property: stopPropagation` になる。stopPropagation を書き換えられない形（configurable: false）で貼るため。インクリメンタルハイドレーションでは body の契約が残るので、APP\_ID の違う 2 つのアプリが 1 ページにあると起きうる（Angular のアプリ 2 つでは試していない） | primitives/event-dispatch/src/event\_dispatcher.ts 105-114 行目と 172-179 行目 | 公開の入口だけで 2 組の EventContract と EventDispatcher を入れ子に置いて押す（22.1.6・手元・main のソースのどれでも出る）。このサイトでも、デモの組を body まで泡立たせると出る | [第 10 回](10-jsaction-dispatcher.md) |
| （既存の issue）早期の契約が body に付けたリスナーが、アプリの起動後も外されず、早期の箱の q に積み続ける。initEventReplay は clearAppScopedEarlyEventContract を呼ぶが、removeAllAppScopedEventListeners を呼ばない（425f44c1333 で抜け落ちた）。開いている #71518 と、承認済みの PR #71519 | core/src/hydration/event\_replay.ts の initEventReplay | 自分専用の appId で同じ順に呼ぶデモと、記録の「安定の後に押す」場面 | [第 5 回](05-jsaction-early-contract.md)・[第 11 回](11-jsaction-angular.md) |
| registerAppScopedDispatcher（と registerGlobalDispatcher）で渡した関数が呼ばれない。欄の `d` を差し替えるが、リスナーの `h` が呼ぶのは作ったときの局所の `d` のまま。最小化した min.js の中も同じ形。Angular の中ではこの関数を呼んでいないので、Angular のアプリには影響しない | primitives/event-dispatch/src/earlyeventcontract.ts 70-74 行目と 121 行目 | 自分専用の appId のデモで、登録したあとに押しても 0 回のまま | [第 5 回](05-jsaction-early-contract.md) |
| getActionCache が返した辞書に書き込むと、ほかの要素にも効く。jsaction の無い要素には共有の EMPTY\_ACTION\_MAP が、同じ文字列の要素には同じ辞書が貼られるため。Angular 本体は getActionCache を使っていない | primitives/event-dispatch/src/action\_resolver.ts 22 行目・256-257 行目と cache.ts 27-29 行目 | ライブのデモ（main でも同じ） | [第 2 回](02-jsaction-attribute.md) |
| 素の Dispatcher が再生の配列を空にしないので、2 回目の予定のときに、前のイベントがもう一度渡される。最初の版（666d6465758）のコメントは「空にするのは eventReplayer の役目」と書いていたが、今はそのコメントも無い。Angular は eventReplayer を渡さない EventDispatcher だけを使う | primitives/event-dispatch/src/dispatcher.ts 98-108 行目と createEventReplayer | ソースを束ねて Node で動かした記録 | [第 10 回](10-jsaction-dispatcher.md) |
| （文書）README が Dispatcher を `@angular/core/primitives/event-dispatch` から import する例を載せているが、index.ts は Dispatcher を出していない | primitives/event-dispatch/README.md 206 行目と index.ts 13 行目 | 2 つを見比べる（main も同じ） | [第 1 回](01-jsaction-overview.md)・[第 10 回](10-jsaction-dispatcher.md) |
| （確かめていない手がかり）hydrate トリガーの jsaction を足すときの重複よけが `indexOf` の部分一致なので、要素にすでに `dblclick:;` があると `click:;` が足されない書き方。呼ばれる順番と、実際に塊が目覚めないかは確かめていない | core/src/event\_delegation\_utils.ts 39-42 行目 | ソースの行を読む | [第 11 回](11-jsaction-angular.md) |
| （spec）event\_test.ts で、target に関数そのものを渡す it が別の条件で先に偽になって通る（262 行目）、'Enter' を 2 回確かめて Space の文字を確かめていない（276-279 行目）、重複をまとめた it で同じ expect が 2 回ずつ並ぶ（451 行目、667219230ac）。getParentNode の shadow root から host へ跳ぶ道（action\_resolver.ts 213-214 行目）はどの spec も通らない。捕獲の種類を対象の要素だけに渡す行（event\_dispatcher.ts 90-95 行目）を確かめる it が無い | primitives/event-dispatch/test/event\_test.ts ほか | spec の行を読む | [第 8 回](08-jsaction-a11y-click.md)・[第 7 回](07-jsaction-resolver.md)・[第 10 回](10-jsaction-dispatcher.md) |
| （コメント）action\_resolver.ts のコメントが「a11y の click を有効にすると addEvent が key のハンドラを自動で付ける」と書くが、今の addEvent にその処理は無い。event\_type.ts のコメントは「submit は泡立たない」と書くが、一覧（305 行目）とは食い違う（Chrome では泡立つ） | action\_resolver.ts 89-92 行目、event\_type.ts 84-85 行目 | コードと見比べる | [第 8 回](08-jsaction-a11y-click.md)・[第 4 回](04-jsaction-event-types.md) |

読み方の目安: 上の 2 つ（修飾キーのクリックが再生されない・2 つの EventDispatcher の例外）は、Angular のアプリの動きに出るので、影響がいちばん大きいものです。issue を探すときは、題の言葉より、表の「どこ」の関数名（initEventReplay・prepareEventForBubbling・clickModSupport など）で gh を検索すると見つけやすくなります。

## 聞かれそうな質問

**Q. event-dispatch の spec の 1 件だけを走らせられますか？**

bazel の `--test_arg=--filter=…` では走らせられませんでした。4 つの spec は BUILD.bazel の 6〜10 行目で 1 つのライブラリになり、16〜19 行目の `ng_web_test_suite` が 1 つのバンドルにしてブラウザで走らせます。`--filter` を付けても 111 件が走りました。ターゲット全体が 1〜2 秒です。

**Q. event-dispatch の spec は Angular の core を使いますか？**

使いません。BUILD.bazel の 12 行目の依存は event-dispatch だけです。Angular がどう使うかを確かめているのは platform-server の `event_replay_spec.ts` で、こちらは 3 節のとおり、サーバーで描いて domino の DOM でハイドレートします。

**Q. dispatcher\_test.ts は Angular と同じ配り役を通っていますか？**

通っていません。dispatcher\_test.ts の 325 行目は素の `Dispatcher` を作ります。Angular が使う `EventDispatcher` の泡立ち・再生の貼り替えは event\_dispatcher\_test.ts の 7 件が確かめています（第 10 回）。

**Q. event\_replay\_spec.ts で、早期の契約のスクリプトはどうやって動いていますか？**

75〜76 行目で `window` を `globalThis` にし、BUILD.bazel の 81 行目で data にした `contract_bundle_min.js` を import します。これで `window.__jsaction_bootstrap` が定義され、89〜90 行目で it ごとに `window._ejsas` を空にします。

**Q. いま開いている、このシリーズに一番近い issue はどれですか？**

#71518（早期の箱のリスナーが外されない）です。第 11 回の記録の after-stable の場面で、安定のあとの click が箱に積まれ続けることを確かめました。開いている PR #71519 があります。

## 読み終えて

- event-dispatch の spec は 4 ファイル 111 件で、1 つのバンドルとしてブラウザで走ります。名前の絞り込みは効かないので、ターゲット全体を走らせます。
- Angular の側の spec は `event_replay_spec.ts` の 23 件で、Node の Jasmine なので `--filter` が効きます。
- 開いている issue は、どれもイベントの再生（Angular の側）と、インクリメンタルハイドレーションで契約が残ることに関係します。
- spec が確かめていない形は、第 10 回・第 11 回で手元の記録として確かめました。issue を読むときは、本文の行が今の木でもその形かを先に確かめます。

---

← 前: [Angular の側：イベントの記録と再生・hydrate の道とのつながり](11-jsaction-angular.md)  
次: [Angular Elements の全体像：カスタム要素とコンポーネントの間](../elements/01-elements-overview.md) →
