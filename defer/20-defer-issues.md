[目次](../README.md) › [@defer とインクリメンタルハイドレーションの内側](README.md) › 第 20 回 / 全 20 回

# issue と PR を読む：@defer とインクリメンタルハイドレーションの今

> area: core の @defer とインクリメンタルハイドレーションに関わる開いている issue と、この 1 年に閉じた issue の表。どの issue がこのシリーズのどの章の行に関係するか、最近入った修正の読み方と、その修正に付いた spec。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/defer-issues)

---

最終回は、`@defer` とインクリメンタルハイドレーションの「今」を、issue と commit から読みます。ラベル `core: defer` と `core: incremental hydration` の付いた開いている issue は 10 件、2025-11-01 以降に閉じたものは 6 件でした（2026-11-06 に gh で取得）。ラベルは無くても第 1〜19 回の行に直接かかる issue を `gh search issues` で探して足し、開いているもの 14 件・閉じたもの 21 件を、このシリーズのどの章の話かに結びつけて表にします。後半で、2025-11 から 2026 年に入った修正の commit を `git show` で読み、issue を 3 つ行まで追い、issue を読むときの手順をまとめます。

読む対象は GitHub の angular/angular の issue と PR（`gh` で読むだけ）と、`git -C ../angular log`・`git show` です。この章にはソースの引用はありません。行は各章で引用したものを指します。

1. [1. 全体像](01-defer-overview.md)
2. [2. ɵɵdefer 命令](02-defer-instruction.md)
3. [3. 塊の記録](03-defer-details.md)
4. [4. 状態を描く](04-defer-render-state.md)
5. [5. minimum と after](05-defer-minimum-after.md)
6. [6. 依存を読み込む](06-defer-resource-loading.md)
7. [7. トリガーから描画まで](07-defer-trigger-flow.md)
8. [8. when](08-defer-when.md)
9. [9. idle と immediate](09-defer-idle-immediate.md)
10. [10. timer](10-defer-timer.md)
11. [11. interaction と hover](11-defer-dom-triggers.md)
12. [12. viewport](12-defer-viewport.md)
13. [13. prefetch](13-defer-prefetch.md)
14. [14. 入れ子・注入器・クエリ](14-defer-nested-di.md)
15. [15. サーバーでの @defer](15-defer-server.md)
16. [16. hydrate トリガー](16-defer-hydrate-triggers.md)
17. [17. 親から順にハイドレート](17-defer-hydration-queue.md)
18. [18. hydrate のイベント](18-defer-hydrate-events.md)
19. [19. テストを読む](19-defer-tests.md)
20. **20. issue と PR を読む**（この章）

## 0. 先に確かめる：手元の木と main の差

- このシリーズのソースは ../angular の 8576f161ae4（22.2.0-next.7、commit の日付は 2026-09-06）です。`origin/main`（2026-11-05 の 4491b39c120）はその 826 commit 先にあり、そのうち `packages/core/src/defer`・`hydration`・`event_delegation_utils.ts`・`primitives/event-dispatch`・`primitives/defer` に触れるものは 12 個です。
- その 12 個には、このシリーズで読んだ行の直しが入っています。ハイドレーションの後片付けの前に安定を待つ（80dba4b997c、[第 17 回](17-defer-hydration-queue.md)の 5 節）、jsaction の解析結果を `Object.create(null)` に（8d8859cb211、[第 18 回](18-defer-hydrate-events.md)の 2 節）、同じ `APP_ID` の 2 つのアプリ（3a0835b3328）、`IdleScheduler` の束の消し方（09e132a2cdd・9486df5e263、[第 9 回](09-defer-idle-immediate.md)）、hydrate トリガーの登録を値の確かめの中へ（6d32550fbba、[第 16 回](16-defer-hydrate-triggers.md)）などです。
- このサイトの記録が動かす core は node\_modules の 22.1.6 です。565dbb2fe54（2026-08-07）のように手元の木より前の直しでも、22.1.6 に入っているかは配布物（`node_modules/@angular/core/fesm2022/`）を `grep` して確かめます（第 17 回の 4 節）。issue の報告の版と、読む行の版をそろえてから読みます。

## 1. データの取り方

📄 `ターミナル（読むだけ）`

```
cd ~/angular-research/angular
gh issue list -R angular/angular --label "core: defer" --state open --limit 200 \
  --json number,title,labels,createdAt,updatedAt,comments
gh issue list -R angular/angular --label "core: defer" --state closed --search "closed:>=2025-11-01" \
  --limit 200 --json number,title,labels,closedAt,stateReason
gh issue list -R angular/angular --label "core: incremental hydration" --state all --limit 200 --json …
gh search issues --repo angular/angular '"incremental hydration"' --state open --limit 60 \
  --json number,title,labels,createdAt,updatedAt,commentsCount,isPullRequest
gh search issues --repo angular/angular defer --state closed --closed '>=2025-11-01' --limit 100 --json …
gh issue view <番号> -R angular/angular \
  --json number,title,state,stateReason,createdAt,closedAt,labels,comments,closedByPullRequestsReferences
gh pr list -R angular/angular --state all --search "<番号>" --json number,title,state
git log origin/main --format='%h %ad %s' --date=short --grep="#<番号>"
git log --oneline HEAD..origin/main -- packages/core/src/defer packages/core/src/hydration \
  packages/core/src/event_delegation_utils.ts packages/core/primitives/event-dispatch packages/core/primitives/defer
```

- ラベルの付いたものの JSON は、シリーズの準備で取ったもの（scratchpad/defer-logs/open-core\_-defer.json ほか 4 つ）です。`core: incremental hydration` のラベルは、開いているものが 1 件（#58695）、2025-11 以降に閉じたものは 0 件でした。
- ラベルの無いものは、`gh search issues` の `"incremental hydration"`・`defer`・`hydration` の結果から、第 1〜19 回の行に直接かかるものだけを選びました。ハイドレーションの道の不具合（#71769・#71296・#71545・#70796・#69908・#70113）は、どれもラベルが `area: core` だけでした。ラベルで絞るだけでは、このシリーズの話の半分を見落とします。
- 「PR・commit」の列は、`closedByPullRequestsReferences`、`gh pr list --search`、commit の本文の `Fixes #番号` のどれかで見つけたものだけです。`gh pr list --search` が返した PR は、本文に `Fixes #番号` があるかを `gh pr view` で読んで確かめました。
- 表の「内容」は題をそのまま写さず、本文とコメントを読んで日本語で短くしたものです。「章」と「どこ」は、このシリーズのどこを開いて読むかです。付け方は下の make-issues-data.mjs の `NOTES` にあります。

## 2. 一覧

> **🧪 issue を絞る**
>
> 2026-11-06 に gh で取ったデータを、このページの中に持っています（通信はしない）。開いているものの日付は立った日、閉じたものは閉じた日です。「ラベル」の ● は `core: defer` か `core: incremental hydration` が付いているものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/defer-issues)

📄 `scratchpad の make-issues-data.mjs（表のデータを作る。NOTES が書き手の付けた要約と章）`

```
// 第 20 回 defer-issues の表のデータを作る。
// 入力: defer-logs/e-issues.jsonl（2026-11-06 に `gh issue view N -R angular/angular --json …` で取ったもの。読むだけ）
// NOTES は、この章の書き手が issue の本文・コメント・付いた PR・commit を読んで付けたもの（題をそのまま写さず日本語で要約）。
// 使い方: node make-issues-data.mjs  →  angular-deep-dive/src/app/pages/chapters/defer-issues.data.ts
import { readFileSync, writeFileSync } from 'node:fs';
const LOGS = '<scratchpad>/defer-logs/';
const OUT = '~/angular-research/angular-deep-dive/src/app/pages/chapters/defer-issues.data.ts';
const HERE = new URL('.', import.meta.url).pathname;

// kind: bug / feature / docs / other。ch: このシリーズ（か近い章）の slug。pr: 付いた PR・commit。
const NOTES = {
  69369: { kind: 'feature', ch: 'defer-nested-di', ja: '@defer の中のコンポーネントを viewChild(型) で問い合わせると、型を参照するだけでその chunk が eager になる。遅延読み込みと両立させたい', where: '依存の import()（第 6 回）とクエリ（第 14 回）', pr: '' },
  61001: { kind: 'other', ch: '', ja: 'Angular の中で Web Components を使うときの推奨のやり方（@defer で読み込む形を含む）を知りたい', where: '—', pr: '' },
  59203: { kind: 'feature', ch: 'defer-render-state', ja: '@defer と Resource API をつなぎ、非同期の状態（読み込み中・失敗）を 1 つの書き方で扱いたい', where: '4 つの状態（第 4 回）', pr: '' },
  58873: { kind: 'bug', ch: 'defer-resource-loading', ja: 'ライブラリから 1 つのコンポーネントだけを @defer で読み込むと、ライブラリの使っていない部分まで chunk に入る', where: '依存の import() の生成（第 6 回・standalone-defer-deps）', pr: '' },
  54389: { kind: 'feature', ch: 'defer-resource-loading', ja: '@defer の中で、遅延できない依存（ほかでも eager に使われているもの）を使ったら、警告かエラーを出してほしい', where: 'コンパイラが依存を分ける行（第 6 回）', pr: '' },
  53700: { kind: 'feature', ch: 'defer-nested-di', ja: '@defer の中のコンポーネントに、遅延読み込みと一緒に EnvironmentProvider を渡したい', where: '塊の注入器（第 14 回）', pr: '' },
  52800: { kind: 'feature', ch: 'defer-resource-loading', ja: '@error の塊に、エラーの中身と「もう一度読み込む」操作がほしい', where: '読み込みの失敗（第 6 回）', pr: '#68738（feat(core): @defer の retry、開いている）' },
  52593: { kind: 'feature', ch: 'defer-render-state', ja: '@defer の各塊でテンプレートの変数（コンテキスト）を使えるようにしたい', where: '状態のテンプレート（第 4 回）', pr: '' },
  52556: { kind: 'feature', ch: 'defer-tests', ja: 'テストなどで、どの @defer の塊かを名前で見分けたい', where: 'DeferBlockFixture（第 19 回・testing-defer）', pr: '' },
  58695: { kind: 'feature', ch: '', ja: '<router-outlet> が無いのに遷移しようとしたら警告してほしい（インクリメンタルハイドレーションのラベル付き）', where: 'ルーター', pr: '' },
  71769: { kind: 'bug', ch: 'defer-hydration-queue', ja: 'triggerHydrationForBlockQueue の hydrating の読みに ?. が無く、投げると PendingTasks が戻らず、アプリが二度と安定しない（再現はまだ無い）', where: '第 17 回 3 節・7 節（478 行目・PendingTasks）', pr: '#71798（try/finally と ?. を足す。開いている）' },
  71296: { kind: 'bug', ch: 'defer-hydrate-events', ja: 'ほかのトリガーでハイドレーションが進んでいる間に押したクリックが、キューに積まれたまま渡し直されない', where: '第 18 回 6 節 inflight・第 17 回 2 節の重複よけ', pr: '#71301（マージされずに閉じた）' },
  71545: { kind: 'bug', ch: 'defer-hydrate-events', ja: '早いクリックで要素に残った jsaction の解析結果（__jsaction）が、属性を外したあとも残り、target="_blank" のリンクが押せなくなる', where: '第 18 回 7 節（removeListeners・dispatcher.ts）', pr: '#71550（マージされずに閉じた）' },
  69727: { kind: 'feature', ch: 'defer-render-state', ja: '@defer の塊の読み込みと描画が済んだことを知らせるイベントがほしい', where: 'ON_COMPLETE_FNS（第 4 回・第 17 回 3 節）', pr: '' },
  68285: { kind: 'other', ch: 'defer-viewport', ja: 'translateX(100%) で画面の外に出したトリガーでも、on viewport の塊が描かれてしまう', where: 'IntersectionObserver（第 12 回）。ブラウザの振る舞いとして閉じた', pr: '' },
  68123: { kind: 'other', ch: 'defer-instruction', ja: 'HMR と NgModule と @defer を組み合わせると NG0919 になる', where: 'HMR では依存が eager（第 2 回）。standalone でないと @defer は効かない、として閉じた', pr: '' },
  65596: { kind: 'other', ch: 'defer-nested-di', ja: '@defer の中身が 1 つずつ描かれるたびに ViewChildren が何度も更新される', where: 'クエリ（第 14 回）。zone.js の場合だけの話と分かって閉じた', pr: '' },
  61233: { kind: 'bug', ch: 'defer-tests', ja: 'aot: true で fakeAsync を使うと、on timer の塊のテストが落ちる', where: 'テストの書き方（第 19 回）。fakeAsync をやめる流れで、直さないとして閉じた', pr: '' },
  52746: { kind: 'feature', ch: 'defer-prefetch', ja: 'prefetch の条件だけがあって、本体のトリガーが無いときは知らせてほしい', where: 'prefetch（第 13 回）', pr: '#67497 → 7f9450219f5（compiler-cli に警告を足す）' },
  52554: { kind: 'docs', ch: 'defer-resource-loading', ja: 'バレルファイル（index.ts の再 export）から import したコンポーネントでは、@defer の遅延 chunk ができない', where: '依存の import()（第 6 回・standalone-defer-deps）', pr: '#68829 → d985957f09c（文書に注意を書く）' },
  70796: { kind: 'bug', ch: 'defer-hydration-queue', ja: '塊のハイドレーションの後片付けが、アプリの安定の前に走り、まだ使う脱水ビューを消してしまう', where: '第 17 回 5 節（cleanupHydratedDeferBlocks）', pr: '80dba4b997c（main だけ。whenStable を待つ）' },
  69908: { kind: 'bug', ch: 'defer-hydrate-triggers', ja: 'ルートの中のコンポーネントにある @defer (hydrate …) が、いつまでも発火しない（実行時の部品を後から有効にしたとき）', where: '第 16 回・incremental-hydration 2 節（requested と activated）', pr: '#69920 → cfe2cda1100' },
  70198: { kind: 'other', ch: 'defer-hydration-queue', ja: 'まだ脱水の塊は、データが変わっても表示が更新されない', where: '脱水の塊には LView が無い（第 17 回 0 節）。仕様として閉じた', pr: '' },
  70113: { kind: 'bug', ch: 'defer-hydration-queue', ja: 'cleanupRemainingHydrationQueue が配列に for…in を使い、Promise を reject していない', where: '第 17 回 4 節（544 行目）', pr: '#70114 → 565dbb2fe54' },
  68800: { kind: 'bug', ch: 'defer-viewport', ja: 'DeferBlockBehavior.Manual でも on viewport の IntersectionObserver が作られ、JSDOM のテストが落ちる', where: 'DOM のトリガーの登録（第 11・12 回）', pr: '#68878 → abc61aaf7c0' },
  70941: { kind: 'bug', ch: 'defer-idle-immediate', ja: 'IdleScheduler が、ほかの束の処理の途中で作られた束を消してしまい、その idle の要求を取り消せなくなる', where: 'IdleScheduler（第 9 回）', pr: '#70959 → 09e132a2cdd（main だけ）' },
  70728: { kind: 'bug', ch: 'defer-idle-immediate', ja: 'IdleScheduler の束の処理で例外が出ると、その束がずっと残る', where: 'IdleScheduler（第 9 回）', pr: '#70730 → 9486df5e263（main だけ）' },
  67328: { kind: 'bug', ch: 'defer-hydrate-events', ja: 'アプリが安定する前にハイドレートした要素で、イベントの再生と本物のリスナーの両方が呼ばれる', where: 'invokeListeners の二重よけ（第 18 回・event-replay）', pr: 'd5fd51e9569' },
  65263: { kind: 'feature', ch: 'defer-hydrate-triggers', ja: 'SSR のプロジェクトで withIncrementalHydration() を既定にしたい', where: '第 16 回・incremental-hydration 1 節', pr: '#68092 → 68628dd45bf' },
  67187: { kind: 'feature', ch: 'defer-idle-immediate', ja: 'on idle のトリガーに IdleDeadline（timeout）を渡したい', where: 'IdleScheduler（第 9 回）', pr: '#67190 → 98eb24cea04' },
  67476: { kind: 'feature', ch: 'defer-viewport', ja: 'on viewport の IntersectionObserver を DI で設定・差し替えたい', where: 'viewport（第 12 回）。差し替えはしない、と返して閉じた', pr: '' },
  65711: { kind: 'other', ch: 'defer-when', ja: '@defer に if の条件を足したい', where: 'when（第 8 回）。重複として閉じた', pr: '' },
  71397: { kind: 'other', ch: 'defer-nested-di', ja: '@defer の塊のせいで投影されないノードに、NG8011 が出ない', where: '投影（第 14 回）。意図した振る舞いとして閉じた', pr: '' },
  70680: { kind: 'other', ch: 'defer-when', ja: '@defer (when count) のように () を付け忘れた signal に、NG8109 が出ない', where: 'when（第 8 回）。TypeScript の検査で出るとして閉じた', pr: '' },
  59261: { kind: 'bug', ch: 'defer-hydrate-events', ja: 'イベントの再生が、アプリを壊したあとも要素を持ち続ける（メモリリーク）', where: 'EVENT_REPLAY_QUEUE（第 18 回）', pr: '#66371 → 30e9c62bdfb（キューをアプリごとに）' },
};

const raw = readFileSync(LOGS + 'e-issues.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const rows = raw.map((i) => {
  const n = NOTES[i.n];
  if (!n) throw new Error('no note for ' + i.n);
  return {
    n: i.n, state: i.state === 'OPEN' ? 'open' : 'closed', reason: i.reason ?? '',
    d: i.state === 'OPEN' ? i.created : i.closed, opened: i.created, c: i.c,
    labels: i.labels.filter((l) => l !== 'area: core'),
    label: i.labels.some((l) => l === 'core: defer' || l === 'core: incremental hydration'),
    ...n,
  };
});

// 2025-11 以降の commit のうち、このシリーズの行に直接かかるもの（git show で読んだ）。
const COMMITS = [
  { h: '565dbb2fe54', d: '2026-08-07', s: 'fix(core): incorrect loop in defer blocks', issue: '#70113', ch: 'defer-hydration-queue', what: 'cleanupRemainingHydrationQueue の for…in を for…of に（1 行）', spec: 'なし', head: true },
  { h: 'cfe2cda1100', d: '2026-07-23', s: 'fix(core): initialize hydration triggers after late runtime activation', issue: '#69908', ch: 'defer-hydrate-triggers', what: 'requested と activated の 2 つがそろったときに初期化（api.ts・incremental_runtime.ts）', spec: 'incremental_hydration_spec.ts に 63 行', head: true },
  { h: 'c2b14b7ab44', d: '2026-06-26', s: 'fix(core): prevent orphaned requestIdleCallback handle from re-entrant scheduling', issue: '', ch: 'defer-idle-immediate', what: '束の処理の間は idleId を残し、再入で 2 つ目の要求を出さない（idle_scheduler.ts 5 行）', spec: 'defer_spec.ts に 154 行（it 6 個）', head: true },
  { h: 'abc61aaf7c0', d: '2026-05-22', s: 'fix(core): do not register dom triggers when defer blocks are in manual mode', issue: '#68800', ch: 'defer-dom-triggers', what: 'shouldTriggerDeferBlock を rendering.ts に移し、registerDomTrigger の先頭で聞く', spec: 'defer_spec.ts に 41 行', head: true },
  { h: 'd5fd51e9569', d: '2026-04-25', s: 'fix(core): prevent event replay double-invocation when element hydrates before app stability', issue: '#67328', ch: 'defer-hydrate-events', what: 'markEventHandledForElement と invokeListeners の二重よけ', spec: 'event_replay_spec.ts に 47 行', head: true },
  { h: '11721509b0b', d: '2026-04-23', s: 'refactor(core): Makes `@defer(hydrate ...)` runtime tree-shakable', issue: '', ch: 'defer-hydrate-triggers', what: 'ɵɵenableIncrementalHydrationRuntime を足し、hydrate を使わないアプリから実行時の部品を外す', spec: 'incremental_hydration_spec.ts に 88 行', head: true },
  { h: '68628dd45bf', d: '2026-04-08', s: 'feat(platform-browser): make incremental hydration default behavior', issue: '#65263', ch: 'defer-hydrate-triggers', what: 'provideClientHydration が既定でインクリメンタルを入れる。withNoIncrementalHydration と移行の schematic', spec: 'hydration_spec.ts ほか', head: true },
  { h: '98eb24cea04', d: '2026-03-03', s: 'feat(core): Support optional timeout for idle deferred triggers', issue: '#67187', ch: 'defer-idle-immediate', what: 'on idle(500) の timeout（compiler・idle_scheduler・instructions）', spec: 'defer_spec.ts に 429 行・incremental_hydration_spec.ts に 108 行', head: true },
  { h: 'a5981b83a60', d: '2026-02-24', s: "feat(core): support customization of @defer's on idle behavior", issue: '', ch: 'defer-idle-immediate', what: 'IdleService を DI で差し替えられるように', spec: 'defer_spec.ts に 91 行', head: true },
  { h: '30e9c62bdfb', d: '2026-01-07', s: 'fix(core): fix memory leak with event replay', issue: '#59261', ch: 'defer-hydrate-events', what: 'モジュールの変数だった blockEventQueue を EVENT_REPLAY_QUEUE（アプリごと）に', spec: 'event_replay_spec.ts に 146 行', head: true },
  { h: '80dba4b997c', d: '2026-09-05', s: 'fix(core): wait for app stability before cleaning up dehydrated views', issue: '#70796', ch: 'defer-hydration-queue', what: 'ほかの PendingTasks があれば whenStable を待ってから後片付け', spec: 'incremental_hydration_spec.ts に 277 行', head: false },
  { h: '09e132a2cdd', d: '2026-09-26', s: "fix(core): avoid deleting idle bucket created during another bucket's drain", issue: '#70941', ch: 'defer-idle-immediate', what: '消すのは自分の束だけ（idle_scheduler.ts 1 行）', spec: 'defer_spec.ts に 135 行', head: false },
  { h: '9486df5e263', d: '2026-09-15', s: 'fix(core): ensure references are cleared from idle scheduler', issue: '#70728', ch: 'defer-idle-immediate', what: '例外が出ても束の参照を消す', spec: 'なし', head: false },
  { h: '8d8859cb211', d: '2026-09-01', s: "fix(core): don't use plain objects as maps for jsaction data", issue: '', ch: 'defer-hydrate-events', what: 'jsaction の解析結果を Object.create(null) に', spec: '5cb3ed2958a（dispatcher_test.ts）', head: false },
  { h: '3a0835b3328', d: '2026-09-22', s: "fix(core): don't crash initEventReplay when two apps share an APP_ID", issue: '', ch: 'defer-hydrate-events', what: '同じ APP_ID の 2 つ目のアプリで警告して戻る', spec: 'event_replay_spec.ts に 84 行', head: false },
];

const body = `// 自動生成 — 手で編集しないこと（scratchpad の make-issues-data.mjs が作った）。
// issue の欄（番号・状態・日付・ラベル・コメント数）は 2026-11-06 に gh で取ったもの。ja・ch・where・pr はこの章の書き手が付けたもの。

export const ROWS = ${JSON.stringify(rows, null, 1)} as const;

export const COMMITS = ${JSON.stringify(COMMITS, null, 1)} as const;

export const SCRIPT = ${JSON.stringify(readFileSync(HERE + 'make-issues-data.mjs', 'utf8'))};
`;
writeFileSync(OUT, body);
console.log(rows.length, 'rows', COMMITS.length, 'commits', body.length, 'bytes');

```

- `core: defer` のラベルで開いているものは、9 件すべてが 2023〜2026 年の機能の要望と相談（retry・コンテキスト変数・テストでの見分け・Resource との統合など）で、不具合はライブラリの tree-shake の 1 件（#58873）だけです。
- 開いている不具合のうち 3 件（#71769・#71296・#71545）は、2026-10〜11 に立った、ラベルの無いハイドレーションの道のものです。どれも PR が付いたか、付いて閉じられています。
- 閉じたもののうち、#68285・#68123・#65596・#70198・#71397・#70680 は、メンバーのコメントで「ブラウザの振る舞い」「standalone が前提」「zone.js の場合だけ」「仕様」「意図した振る舞い」などと説明されて閉じています。直す前に、まず仕様かどうかを確かめる、という読み方の手本になります。

## 3. 2025-11 以降に入った修正を commit で読む

recent-commits.txt（33 個）のうち、このシリーズの行に直接かかるものと、手元の木より新しい main の直しを `git show` で読みました。「手元」は 8576f161ae4 に入っているかです。

| commit | 日付 | 題 | issue | 何を直したか | 足した spec | 手元 | 章 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 565dbb2fe54 | 2026-08-07 | fix(core): incorrect loop in defer blocks | #70113 | cleanupRemainingHydrationQueue の for…in を for…of に（1 行） | なし | あり | [17. 親から順にハイドレート](17-defer-hydration-queue.md) |
| cfe2cda1100 | 2026-07-23 | fix(core): initialize hydration triggers after late runtime activation | #69908 | requested と activated の 2 つがそろったときに初期化（api.ts・incremental\_runtime.ts） | incremental\_hydration\_spec.ts に 63 行 | あり | [16. hydrate トリガー](16-defer-hydrate-triggers.md) |
| c2b14b7ab44 | 2026-06-26 | fix(core): prevent orphaned requestIdleCallback handle from re-entrant scheduling |   | 束の処理の間は idleId を残し、再入で 2 つ目の要求を出さない（idle\_scheduler.ts 5 行） | defer\_spec.ts に 154 行（it 6 個） | あり | [9. idle と immediate](09-defer-idle-immediate.md) |
| abc61aaf7c0 | 2026-05-22 | fix(core): do not register dom triggers when defer blocks are in manual mode | #68800 | shouldTriggerDeferBlock を rendering.ts に移し、registerDomTrigger の先頭で聞く | defer\_spec.ts に 41 行 | あり | [11. interaction と hover](11-defer-dom-triggers.md) |
| d5fd51e9569 | 2026-04-25 | fix(core): prevent event replay double-invocation when element hydrates before app stability | #67328 | markEventHandledForElement と invokeListeners の二重よけ | event\_replay\_spec.ts に 47 行 | あり | [18. hydrate のイベント](18-defer-hydrate-events.md) |
| 11721509b0b | 2026-04-23 | refactor(core): Makes \`@defer(hydrate ...)\` runtime tree-shakable |   | ɵɵenableIncrementalHydrationRuntime を足し、hydrate を使わないアプリから実行時の部品を外す | incremental\_hydration\_spec.ts に 88 行 | あり | [16. hydrate トリガー](16-defer-hydrate-triggers.md) |
| 68628dd45bf | 2026-04-08 | feat(platform-browser): make incremental hydration default behavior | #65263 | provideClientHydration が既定でインクリメンタルを入れる。withNoIncrementalHydration と移行の schematic | hydration\_spec.ts ほか | あり | [16. hydrate トリガー](16-defer-hydrate-triggers.md) |
| 98eb24cea04 | 2026-03-03 | feat(core): Support optional timeout for idle deferred triggers | #67187 | on idle(500) の timeout（compiler・idle\_scheduler・instructions） | defer\_spec.ts に 429 行・incremental\_hydration\_spec.ts に 108 行 | あり | [9. idle と immediate](09-defer-idle-immediate.md) |
| a5981b83a60 | 2026-02-24 | feat(core): support customization of @defer's on idle behavior |   | IdleService を DI で差し替えられるように | defer\_spec.ts に 91 行 | あり | [9. idle と immediate](09-defer-idle-immediate.md) |
| 30e9c62bdfb | 2026-01-07 | fix(core): fix memory leak with event replay | #59261 | モジュールの変数だった blockEventQueue を EVENT\_REPLAY\_QUEUE（アプリごと）に | event\_replay\_spec.ts に 146 行 | あり | [18. hydrate のイベント](18-defer-hydrate-events.md) |
| 80dba4b997c | 2026-09-05 | fix(core): wait for app stability before cleaning up dehydrated views | #70796 | ほかの PendingTasks があれば whenStable を待ってから後片付け | incremental\_hydration\_spec.ts に 277 行 | main だけ | [17. 親から順にハイドレート](17-defer-hydration-queue.md) |
| 09e132a2cdd | 2026-09-26 | fix(core): avoid deleting idle bucket created during another bucket's drain | #70941 | 消すのは自分の束だけ（idle\_scheduler.ts 1 行） | defer\_spec.ts に 135 行 | main だけ | [9. idle と immediate](09-defer-idle-immediate.md) |
| 9486df5e263 | 2026-09-15 | fix(core): ensure references are cleared from idle scheduler | #70728 | 例外が出ても束の参照を消す | なし | main だけ | [9. idle と immediate](09-defer-idle-immediate.md) |
| 8d8859cb211 | 2026-09-01 | fix(core): don't use plain objects as maps for jsaction data |   | jsaction の解析結果を Object.create(null) に | 5cb3ed2958a（dispatcher\_test.ts） | main だけ | [18. hydrate のイベント](18-defer-hydrate-events.md) |
| 3a0835b3328 | 2026-09-22 | fix(core): don't crash initEventReplay when two apps share an APP\_ID |   | 同じ APP\_ID の 2 つ目のアプリで警告して戻る | event\_replay\_spec.ts に 84 行 | main だけ | [18. hydrate のイベント](18-defer-hydrate-events.md) |

- 直しの大きさはさまざまです。565dbb2fe54 は 1 行で spec なし、09e132a2cdd は 1 行の直しに 135 行の spec、80dba4b997c は 33 行の直しに 277 行の spec でした。spec の方が長いのがふつうで、[第 19 回](19-defer-tests.md)の書き方（サーバーで描く → ハイドレート → 確かめる）がそのまま使われています。
- IdleScheduler（[第 9 回](09-defer-idle-immediate.md)）は、2026 年に機能が 3 つ（a5981b83a60・17d3ea44e25・98eb24cea04）、直しが 4 つ（f9d8da69243・c2b14b7ab44・9486df5e263・09e132a2cdd）入り、一番動いている部品です。
- インクリメンタルハイドレーションは、既定にする（68628dd45bf）→ 実行時の部品を tree-shake できるようにする（11721509b0b）→ 後から有効になったときの初期化を直す（cfe2cda1100、#69908）の順で、1 つの変更が次の不具合を生み、それを直す流れが見えます。

## 4. issue を 3 つ、行まで読む

### #71296：ハイドレーションの途中で押したクリックが渡し直されない（開いている）

- 本文は、`hydrate on viewport` の塊の中の `routerLink` を、チャンクの読み込み中に押すと遷移しない、と報告しています。原因として、2 回目の `triggerHydrationFromBlockName` が重複よけで渡し直す関数を捨てることを挙げています。
- 行で読むと、[第 17 回](17-defer-hydration-queue.md)の 2 節の重複よけ（すでに `hydrating` にあれば戻る）と、[第 18 回](18-defer-hydrate-events.md)の 4 節の「渡し直す関数があるときだけ呼ぶ」行の組み合わせです。第 18 回の記録の inflight の場面で、22.1.6 でも同じことが起きるのを確かめました（キューにイベントが残り、`(click)` が呼ばれず、jsaction だけが消える）。
- 付いた PR #71301 は、立った日のうちにマージされずに閉じられています。issue は開いたままです。

### #71769：PendingTasks が戻らない（開いている）

- 本文は、`triggerHydrationForBlockQueue` の 478 行目の `!` が投げると、`pendingTasks.remove` まで届かず、アプリが二度と安定しないと書いています。再現は作れなかった、と正直に書いているのが特徴です。
- PR #71798（2026-11-03、開いている）は、`try/finally` で PendingTasks を必ず戻し、478 行目に `?.` を足し、`cleanup` の describe に it を 1 つ足しています（`gh pr diff 71798`）。
- このシリーズの記録では、別の形で同じ「戻らない」が起きました。`@error` の無い hydrate の塊の読み込みが失敗すると、459 行目の `await` がいつまでも解けません（[第 17 回](17-defer-hydration-queue.md)の 7 節、[第 19 回](19-defer-tests.md)の 7 節）。この形は投げないので、PR の `finally` にも届きません。

### #70113：for…in で reject していなかった（閉じた、565dbb2fe54）

- 本文は、コードを読んで `for…in` の誤りを見つけた報告で、再現はありません。立った日のうちに PR #70114 が付き、565dbb2fe54 で 1 行が直りました（[第 17 回](17-defer-hydration-queue.md)の 4 節）。
- 直ったあとの振る舞いを記録で見ると、失敗した塊から後ろの Promise は本当に reject されるようになり、だれも受け取っていない reject が Node の `unhandledRejection` として 2 つ報告されました（第 17 回の 6 節の fail-middle の場面）。直しの前は、reject が呼ばれないまま Map から消えていました。

## 5. issue を読むときの手順

1. **版をそろえる**

   報告の版（本文の `ng version`）と、手元の木・main・22.1.6 の配布物のどれで読むかを決めます。0 節のとおり、直しが main にだけあることがよくあります。
2. **本文の関数名から、このシリーズの章を開く**

   2 節の表の「章・どこ」の列がその入口です。ハイドレーションの道なら、`triggerHydrationFromBlockName`・`triggerHydrationForBlockQueue`・`hydrateAndInvokeBlockListeners` のどこで止まるかを先に決めます（第 17・18 回の「ここまでの呼び出し」）。
3. **仕様かどうかを、メンバーのコメントと章の行で確かめる**

   2 節の最後の 6 件のように、仕様・ブラウザの振る舞い・前提の違いで閉じるものが多くあります。脱水の塊が更新されない（#70198）のは、第 17 回の 0 節のとおり、その塊にまだ LView が無いからです。
4. **手元で再現する**

   本家の spec の形で書き（[第 19 回](19-defer-tests.md)の 7 節）、../angular を変えない間は、scratchpad の harness で同じ手順を走らせます。記録の環境（Node・domino・JIT・22.1.6）のせいで起きることと、本物の振る舞いを分けます。domino の `eventPhase` の値のように、環境だけの違いは不具合と書きません（第 18 回の 5 節）。
5. **付いた PR と commit を読む**

   `gh pr list --search` と `git log --grep` で探し、`gh pr diff` と `git show` で、直した行と足した spec を読みます。マージされずに閉じた PR は、コメントで理由を確かめます。

> [!NOTE]
> **ポイント**
>
> 本家に PR を出すことや、issue にコメントすることは勧めません。この章の手順は「手元で確かめる」「issue を読むときの手がかりにする」までです。

## このシリーズで見つけたもの

第 1〜19 回を書く途中で、本家の不具合らしきものと、テストやコメントの小さな食い違いが見つかりました。どれも **issue も PR も出していません**。どれも本物の @angular/core 22.1.6 を Node で動かした記録で再現し、手元の木（8576f161ae4）のソースの行と照らして確かめました。上の 3 つは、私がソースの行をもう一度読んで確かめています。本家の spec の形では走らせていません（../angular を変更しないため）。gh で探した範囲では、上の 3 つと同じ報告は見つかりませんでした（#71296 と #52800 は既存の issue です）。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| `@defer (on immediate)` に `@loading` があると、サーバーの描画で placeholder が出ず、塊のところが空になる。2024 年の修正 383e093e6a1（#54385）が足した「サーバーでは描く」条件が、あとの作り直し 30891d8dec1 で落ちている（その修正には spec が無かった） | defer/instructions.ts 440-446 行目（コメントだけ「クライアントでは」と残り、条件は `loadingTmplIndex === null` だけ） | renderServer の記録（塊 7 と、@loading の無い塊 6 の比較）と、2 つのコミットの差分 | [第 15 回](15-defer-server.md) |
| @error の無い hydrate の塊で依存の読み込みが失敗すると、アプリがいつまでも安定しない。Error のテンプレートが無いので ON\_COMPLETE\_FNS が呼ばれず、ハイドレーションの順番待ちの await が解けず、足した PendingTasks が戻らない。registry・hydrating・jsaction も残る | defer/rendering.ts 249 行目の `if (stateTmplIndex !== null)` の中にある 305-313 行目と、defer/triggering.ts 448-459 行目 | queue.ts・repro.ts の記録（@error がある形は 1 秒以内に安定、無い形は安定しない）。近い #71769・PR #71798 は 478 行目が投げる形だけを扱う | [第 17 回](17-defer-hydration-queue.md)・[第 19 回](19-defer-tests.md) |
| （spec）hydrate on interaction・hover の it が、ハイドレーションのあとに `<div jsaction=` が無いことを確かめているが、実際の要素は `<article>` なので、ハイドレーションが起きても起きなくても通る | platform-server/test/incremental\_hydration\_spec.ts 881 行目・1021-1023 行目 | spec の行を読む（同じ spec の 851 行目は `<article jsaction=` を見ている） | [第 18 回](18-defer-hydrate-events.md) |
| `@defer (when x)` で x が最初から真だと、サーバーの描画で placeholder が出ない（文書の「サーバーでは placeholder」と違う）。2024 年 2 月から同じ形で、最近の後退ではない | defer/instructions.ts 242-256 行目（真なら placeholder を描かずに triggerDeferBlock を呼び、サーバーなのでそこで止まる） | renderServer の記録（塊 1） | [第 15 回](15-defer-server.md)・[第 8 回](08-defer-when.md) |
| （小さな残り）入れ子の hydrate の塊の途中で読み込みが失敗すると、先にハイドレートできた親の塊が registry と hydrating に残る。画面への影響は確かめていない | defer/triggering.ts 488-507 行目と hydration/cleanup.ts 158 行目 | queue.ts の記録（中の塊の失敗の場面で d0 が残る） | [第 17 回](17-defer-hydration-queue.md) |
| （既存の issue）ハイドレーションの途中にもう一度イベントが来たときの #71296 の症状が、22.1.6 でも出る | hydration/event\_replay.ts の塊のハイドレーションの道 | events.ts の記録（inflight の場面） | [第 18 回](18-defer-hydrate-events.md) |
| （main で直っている）on viewport の options で scrollMargin だけが違う 2 つの塊が、1 つの IntersectionObserver を分け合い、2 つ目の options が使われない | primitives/defer/src/triggers.ts 219 行目（鍵が rootMargin と threshold だけ）。main の 61fd731e6a5 で鍵に scrollMargin が足された | viewport.ts の記録（8〜9 段目） | [第 12 回](12-defer-viewport.md) |
| （不具合とはしない）idle の予定を流し終わったあとに、終わった番号で cancelIdleCallback が呼ばれる。ブラウザでは何も起きないが、自分で IdleService を差し替えると cancelOnIdle に終わった番号が来る | defer/idle\_scheduler.ts（c2b14b7ab44 のあとの形） | idle.ts の記録（5 段目） | [第 9 回](09-defer-idle-immediate.md) |
| （仕様どおり）@error が無い塊の読み込みが失敗すると、画面は loading のまま残り、FAILED が tDetails に残るので二度と読み込みに行かない。開いている #52800（やり直し）を読む手がかり | defer/rendering.ts 446 行目・defer/triggering.ts 250 行目 | resource-loading.ts の記録 | [第 6 回](06-defer-resource-loading.md) |
| （コメント）LDeferBlockDetails の説明のコメントが「今は state の欄だけ」と書いているが、実物は 10 個の欄がある | defer/interfaces.ts 250-252 行目 | コードと見比べる | [第 3 回](03-defer-details.md) |

読み方の目安: 上の 2 つ（on immediate のサーバーの描画と、@error の無い hydrate の塊）は、画面や安定の待ちに出るので、影響がいちばん大きいものです。issue を探すときは、題の言葉より、表の「どこ」の関数名（ɵɵdeferOnImmediate・triggerHydrationForBlockQueue など）で gh を検索すると見つけやすくなります。

## 聞かれそうな質問

**Q. ラベル `core: defer` で探せば、@defer の不具合は全部見つかりますか？**

見つかりません。2026-11-06 の時点で、`core: defer` の開いている 9 件は機能の要望が中心で、ハイドレーションの道の不具合（#71769・#71296・#71545）は `area: core` だけでした。`gh search issues` で関数名や `"incremental hydration"` を探す必要があります（1 節）。

**Q. main で直っているかどうかは、どう確かめますか？**

`git log origin/main --grep="#番号"` で commit を探し、`git log HEAD..origin/main -- <ファイル>` で手元より新しい直しを見ます。ファイルの中身は `gh api 'repos/angular/angular/contents/<path>?ref=main'` で読めます。2026-11-06 では、手元の木の 826 commit 先に、このシリーズのファイルに触れる commit が 12 個ありました（0 節）。

**Q. issue に再現が無いときは、どう読みますか？**

#71769・#70113 のように、コードを読んで見つけた報告は再現が無いことがあります。本文が指す行を章で開き、その行に届く道を記録の harness で作れるかを試します。#71769 では、本文の形（478 行目が投げる）とは別の形（459 行目の `await` が解けない）で、同じ「安定に戻らない」が起きました（4 節）。

**Q. 閉じた issue のうち「直さない」ものには、どんな理由がありますか？**

2 節の表では、#68285（IntersectionObserver のブラウザの振る舞い）、#61233（`fakeAsync` をやめる流れ）、#70680（TypeScript の検査で出る）が not planned でした。ほかに、仕様として済み扱い（completed）で閉じたものもあります。

## 読み終えて

- `core: defer` のラベルの開いている issue は機能の要望が中心で、ハイドレーションの道の不具合はラベルの無いものに多くあります。
- 2026 年に一番動いたのは IdleScheduler とインクリメンタルハイドレーションの起動で、直しには必ずと言ってよいほど長い spec が付いています。
- 開いている #71296 と #71769 は、第 17・18 回の行と記録でそのまま追えます。
- issue は「版をそろえる → 章を開く → 仕様か確かめる → 手元で再現する → PR と commit を読む」の順で読みます。

---

← 前: [@defer のテストを読む：defer\_spec と incremental\_hydration\_spec](19-defer-tests.md)  
次: [JSAction の全体像：契約・行き先の解決・配送](../jsaction/01-jsaction-overview.md) →
