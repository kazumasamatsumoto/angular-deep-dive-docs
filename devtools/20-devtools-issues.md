[目次](../README.md) › [Angular DevTools の内側](README.md) › 第 20 回 / 全 20 回

# issue と PR を読む：DevTools の今

> area: devtools のラベルで開いている issue と、2025-11-01 以降に閉じた issue の表。どの issue がこのシリーズのどの章の行に関係するか、2025 年 11 月〜2026 年に入った修正の commit 20 個の読み方と、その修正に付いた spec。手元の木と main の差。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-issues)

---

最終回は、DevTools の「今」を issue と commit から読みます。`area: devtools` のラベルで開いている issue は 11 件、2025-11-01 以降に閉じたものは 26 件でした（2026-11-05 に gh で取得）。ラベルは無くても DevTools に近い開いている issue を 1 件足し、合わせて 38 件を、第 1〜18 回のどの章の話かに結びつけて表にします。後半で、2025-11 から 2026 年に入った devtools の commit を 20 個、直したファイルと足した spec で読み、最初に読む issue の選び方をまとめます。

読む対象は GitHub の angular/angular の issue と PR（`gh` で読むだけ）と、`git -C ../angular log`・`git show` です。この章にはソースの引用はありません。行は各章で引用したものを指します。

1. [1. 全体像](01-devtools-overview.md)
2. [2. Angular を見つける](02-devtools-detect.md)
3. [3. メッセージの道](03-devtools-messaging.md)
4. [4. プロトコル](04-devtools-protocol.md)
5. [5. コンポーネントの木](05-devtools-component-tree.md)
6. [6. 制御フローの塊](06-devtools-control-flow.md)
7. [7. 同じノードを見分ける](07-devtools-identity.md)
8. [8. パネルの木](08-devtools-forest-ui.md)
9. [9. プロパティの直列化](09-devtools-state-serializer.md)
10. [10. 入れ子を開く](10-devtools-property-resolver.md)
11. [11. 値を書き換える](11-devtools-property-mutation.md)
12. [12. 選ぶ・光らせる](12-devtools-inspector-highlight.md)
13. [13. プロファイラーの記録](13-devtools-profiler-capture.md)
14. [14. 記録を描く](14-devtools-profiler-formatters.md)
15. [15. 変更検知を見張る](15-devtools-cd-analyzer.md)
16. [16. 注入器の木](16-devtools-injector-tree.md)
17. [17. signal のグラフ](17-devtools-signal-graph.md)
18. [18. ルーター・TransferState](18-devtools-router-transfer.md)
19. [19. テストとビルド](19-devtools-test-build.md)
20. **20. issue と PR を読む**（この章）

## 0. 先に確かめる：手元の木と main の差

- このシリーズのソースは ../angular の 8576f161ae4（22.2.0-next.7、commit の日付は 2026-09-09）です。origin/main（2026-11-04 の 57905ca4e67）はその 807 commit 先にあり、そのうち `devtools/` に触れるものは 30 個です。
- その 30 個には、このシリーズで読んだ行の直しが入っています。ハイドレーションのずれた子を探す再帰（3eaae88e5d7、[第 18 回](18-devtools-router-transfer.md)の 6 節）、Transfer State を null-prototype のオブジェクトにまとめる（ad9058ad879、同じ 5 節）、`BreakpointManager` の送り手の確かめと spec（11838e481a0、[第 17 回](17-devtools-signal-graph.md)の 8 節）、デバッガーが外れたときのボタン（36a0ab6ed8d、#70949）、見張りのボタンを隠す（ad548b9c008、#70948）、バックエンドの設定をまとめる（fe94aae0348、#70683）です。
- 拡張の版は、手元の木で作ったものの manifest が 1.21.0 でした（[第 19 回](19-devtools-test-build.md)のデモ）。main には 1.21.1・1.22.0・1.22.1 への版上げの commit があります。
- このサイトの DEMO が動かす core は node\_modules の 22.1.6 で、`toggleWatchSignal` や `linkedSignal` の値（第 17 回）のように、手元の木の core にはあって 22.1.6 には無いものがあります。issue の報告の版と、読む行の版をそろえてから読みます。

## 1. データの取り方

📄 `ターミナル（読むだけ）`

```
cd ~/angular-research/angular
gh issue list -R angular/angular --label "area: devtools" --state open --limit 200 \
  --json number,title,labels,createdAt,updatedAt,comments
gh issue list -R angular/angular --label "area: devtools" --state closed --search "closed:>=2025-11-01" \
  --limit 200 --json number,title,labels,closedAt,stateReason
gh search issues --repo angular/angular devtools --state open --limit 100 \
  --json number,title,labels,createdAt,updatedAt,commentsCount,isPullRequest
gh issue view <番号> -R angular/angular --json closedByPullRequestsReferences,comments
gh pr list -R angular/angular --state all --search "<番号>"
git log --since=2025-11-01 --format='%h %ad %an | %s' --date=short -- devtools     # 207 個
git log --format='%h %ad %s' --date=short HEAD..origin/main -- devtools           # 30 個
```

- 開いているもの・閉じたものの JSON は、2026-11-05 にシリーズの準備で取ったもの（scratchpad/devtools-logs/open-area--devtools.json・closed-area--devtools.json）です。同じ欄は上の 1・2 行目の形で取れます。
- ラベルの無いものは 3 行目の `gh search issues … devtools` の 28 件から探しました。多くは別の area（core・router・docs など）の話で、DevTools そのものに近いのは #70927（ページの要素からテンプレートのソースへ飛びたい、`area: compiler`）だけでした。#53703 は Redux DevTools（別の拡張）の話なので入れていません。
- 「PR・commit」の列は、`closedByPullRequestsReferences`、`gh pr list --search`、commit の本文の `Fixes #番号`、メンバーのコメントのどれかで見つけたものだけです。`gh pr list --search 57516` は番号が本文に偶然入った別の PR（node の版上げ）も返したので、中身を見て外しました。
- 表の「内容」は題そのものではなく日本語で短くし、「章」と「どこ」は第 1〜18 回のどこを開いて読むかです。この付け方は下の make-issues-data.mjs の `NOTES` に書いてあります。

## 2. 一覧

> **🧪 issue を絞る**
>
> 2026-11-05 に gh で取ったデータを、このページの中に持っています（通信はしない）。開いているものの日付は立った日、閉じたものは閉じた日です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-issues)

- 開いている 12 件のうち 4 件が[第 16 回](16-devtools-injector-tree.md)（注入器の木）の話で、不具合として残っているもの（#70452・#57516・#55570）はどれもここに集まっています。
- 閉じた 26 件のうち 5 件が[第 17 回](17-devtools-signal-graph.md)の話（塊・見張り・ブレークポイント・文書）で、signal のグラフは 2026 年にいちばん動いた場所です。
- 閉じた理由が `NOT_PLANNED`・`DUPLICATE` の 5 件は、再現が無い（#68589）・DevTools の話でない（#68008）・期待どおりの動き（#57392）・本当のリークではない（#66087）などで、メンバーのコメントに理由が書かれています。

📄 `scratchpad の make-issues-data.mjs（gh の JSON からこの表の data.ts を作る。全文）`

```
// 第 20 回 devtools-issues の data.ts を作る。
// gh で取った JSON（scratchpad/devtools-logs/ の open-area--devtools.json・closed-area--devtools.json・
// e-closed-refs.json・e-search-open.json、どれも 2026-11-05 に取得）の番号・状態・ラベル・日付・コメントの数・閉じた PR に、
// このスクリプトの NOTES（内容の日本語の短い説明・種類・章・どこ・PR と commit）を足して、1 つの表にする。
// NOTES はこのシリーズを書く途中で、gh issue view・gh pr view・git log --grep・git show で確かめて書いた。
// 使い方: node make-issues-data.mjs <devtools-logs のディレクトリ> <出力の data.ts>
import { readFileSync, writeFileSync } from 'node:fs';

const [dir, out] = process.argv.slice(2);
const read = (f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
const open = read('open-area--devtools.json');
const closed = read('closed-area--devtools.json');
const refs = new Map(read('e-closed-refs.json').map((r) => [r.n, r]));
const search = read('e-search-open.json');

// kind: bug（不具合）・feature（機能の要望）・docs（文書）・other（再現なし・対象外・重複）
const NOTES = {
  // ---- 開いている ----
  70452: { kind: 'bug', ja: 'カスタム要素（Angular Elements）を含むアプリを調べると、注入器の道筋をたどる再帰で RangeError になり、パネルが何も出さない', ch: 'devtools-injector-tree', where: '注入器の道筋（core の getInjectorResolutionPath）', pr: '#70454（fix(elements)、開いている）' },
  65894: { kind: 'feature', ja: 'フレームワークの中の signal（forms・router など）がグラフを埋めて、アプリの signal が見えにくい', ch: 'devtools-signal-graph', where: '5 節 convertToDevtoolsSignalGraph・debugName', pr: '#65982・#66099（どちらもマージされずに閉じた）' },
  62748: { kind: 'feature', ja: 'Components タブで、プロパティの値がいつどう変わったかの時系列を見たい', ch: 'devtools-property-resolver', where: 'プロパティの欄', pr: '' },
  62743: { kind: 'feature', ja: 'root の service（store）が持つ signal や resource を調べる手段がほしい', ch: 'devtools-signal-graph', where: '3 節 グラフの入口は要素の注入器', pr: '' },
  62736: { kind: 'feature', ja: 'Router のタブで、ルートの情報を木ではなく表でも見たい', ch: 'devtools-router-transfer', where: '4 節 パネルの木', pr: '' },
  62221: { kind: 'feature', ja: 'テンプレートの @let の値を見たい', ch: 'devtools-state-serializer', where: 'インスタンスのプロパティだけを直列化している', pr: '' },
  60327: { kind: 'feature', ja: 'プロパティの欄を名前で絞り込みたい', ch: 'devtools-property-resolver', where: 'プロパティの木', pr: '' },
  57516: { kind: 'bug', ja: 'Components タブの注入器のプレビューが、NgModule の注入器を正しくない形で出す', ch: 'devtools-injector-tree', where: '環境の注入器の木', pr: '' },
  57286: { kind: 'feature', ja: 'createEnvironmentInjector で作った注入器も、注入器の木に出してほしい', ch: 'devtools-injector-tree', where: '環境の注入器の木', pr: '' },
  55570: { kind: 'bug', ja: 'providers と viewProviders を両方持つコンポーネントで、provider をコンソールに出すと value が違う', ch: 'devtools-injector-tree', where: 'logProvider（client-event-subscribers.ts）', pr: '' },
  45887: { kind: 'feature', ja: 'プロファイラーの親の並びやライフサイクルの名前を、ソースへのリンクにしたい', ch: 'devtools-profiler-formatters', where: 'プロファイラーの表示', pr: '' },
  70927: { kind: 'feature', ja: '開発モードでテンプレートのソースの場所を出し、ページの要素からエディターへ飛べるようにしたい（area: compiler。DevTools の Open Source に近い話）', ch: 'devtools-inspector-highlight', where: '要素を選ぶ', pr: '' },
  // ---- 2025-11-01 以降に閉じた ----
  71238: { kind: 'docs', ja: 'signal のグラフの DevTools の手引きを書く', ch: 'devtools-signal-graph', where: '', pr: '#71269（ba977131b35、main だけ）' },
  70949: { kind: 'bug', ja: 'デバッガーが外れたあと、signal のブレークポイントを外せない', ch: 'devtools-signal-graph', where: '8 節 BreakpointManager', pr: '36a0ab6ed8d（commit が Fixes #70949。main だけ）' },
  70948: { kind: 'bug', ja: 'signal の見張り（watch）を外せない', ch: 'devtools-signal-graph', where: '3 節 toggleWatchSignal', pr: '#70986（ad548b9c008、未対応の版ではボタンを隠す。main だけ）' },
  70683: { kind: 'bug', ja: 'ページを再読み込みすると、ノードの横の変更検知のデータが戻らない', ch: 'devtools-cd-analyzer', where: 'CD analyzer の設定', pr: '#70617（fe94aae0348、バックエンドの設定をまとめる。main だけ）' },
  70104: { kind: 'bug', ja: 'Components タブの Open Source のボタンが動かない', ch: 'devtools-component-tree', where: '位置の文字列（serializedId）の読み方', pr: '#70105（03f1758e2ae）' },
  70023: { kind: 'bug', ja: '外部の開発者にも「Angular & Wiz」の名前が出る', ch: 'devtools-messaging', where: 'background の isGoogler の判定', pr: '#70034（3a293291911）' },
  69944: { kind: 'bug', ja: '本番モードの Angular のアプリで DevTools が例外を投げる', ch: 'devtools-cd-analyzer', where: 'performance-track.ts の初期化', pr: '#69946（1a2bcb2295c）' },
  68974: { kind: 'other', ja: 'angular-scan のような、変更検知されたコンポーネントを光らせる機能（重複）', ch: 'devtools-cd-analyzer', where: '', pr: '' },
  68798: { kind: 'bug', ja: 'null-prototype のオブジェクト（Object.groupBy の結果など）で落ちる', ch: 'devtools-state-serializer', where: 'serialized-descriptor-factory.ts の Object の preview', pr: '#68879（d7161fd431a）' },
  68589: { kind: 'other', ja: 'WebStorm から起動すると、パネルが空のまま（情報が足りず閉じた）', ch: 'devtools-detect', where: '', pr: '' },
  68008: { kind: 'other', ja: 'Angular 19 と Webpack で、ブレークポイントで止まってもソースが開かない（バグの報告の形でないとして閉じた）', ch: 'devtools-overview', where: '', pr: '' },
  67143: { kind: 'bug', ja: '1.11.0 で、タブのメモリが毎秒増え続ける', ch: 'devtools-detect', where: 'detect-angular.ts が送る先の URI', pr: '#67145（6f922c18d9f）' },
  66087: { kind: 'other', ja: '最初のルートのコンポーネントが Detached のままメモリに残る（メンバーは「キャッシュの値が持っているだけで、本当のリークではない」）', ch: 'devtools-identity', where: 'バックエンドが持つ参照', pr: '' },
  65849: { kind: 'feature', ja: 'Components タブに @for のループを出したい（41a392d85e8、#66167 で @for の塊が出るようになった。issue には閉じた PR の記録が無い）', ch: 'devtools-control-flow', where: '@for の塊', pr: '' },
  65081: { kind: 'bug', ja: '「This page is not using Angular, or it has a strict extension policy」と出て使えない', ch: 'devtools-detect', where: '検出の結果を background へ', pr: '#65210（7d417167030）' },
  64723: { kind: 'bug', ja: 'OIDC・Keycloak を使うと「Angular application not detected」（転送先の URL の query が原因）', ch: 'devtools-messaging', where: 'SamePageMessageBus の送り元と宛先', pr: '#64806（2d7a72314dc）' },
  63960: { kind: 'feature', ja: 'Chrome の Performance パネルから、DevTools のコンポーネントへ飛びたい', ch: 'devtools-cd-analyzer', where: 'performance-track・deep link', pr: '#68201（95f56d33fe6）' },
  63959: { kind: 'feature', ja: 'Performance パネルの Angular の段から、Angular の文書へリンクしたい', ch: 'devtools-cd-analyzer', where: 'performance-track', pr: '#67942（gh の closedBy。メンバーは「performance mark の性能の影響が大きい」とコメント）' },
  63493: { kind: 'bug', ja: 'Home のルートがいつも active に見える', ch: 'devtools-router-transfer', where: '2 節 active の判定', pr: '#65037（cfb26f59992）' },
  63490: { kind: 'bug', ja: 'トップページでは、すべてのルートが active に見える', ch: 'devtools-router-transfer', where: '2 節 active の判定', pr: '#65037（cfb26f59992）' },
  63227: { kind: 'feature', ja: 'signal のグラフで、resource のような複合の signal をまとめて見せたい', ch: 'devtools-signal-graph', where: '5 節 塊（cluster）', pr: '#65623（9273f1c3c2a）' },
  62236: { kind: 'feature', ja: 'signal の値の変化を、見張りを切り替えて追いたい', ch: 'devtools-signal-graph', where: '3 節 toggleWatchSignal', pr: '#69800（82a767535e5）' },
  59057: { kind: 'feature', ja: 'react-scan のような、変更検知を見える化する道具がほしい（CD analyzer の 07605ba793b と同じ月に閉じた。閉じた理由のコメントは無い）', ch: 'devtools-cd-analyzer', where: 'CD analyzer', pr: '' },
  57392: { kind: 'other', ja: '注入器の木に root の provider が出ない（メンバーは「Route の注入器に置かれているので、期待どおり」）', ch: 'devtools-injector-tree', where: '', pr: '' },
  56781: { kind: 'docs', ja: 'angular.dev の DevTools のページに、ハイドレーションの節が無い', ch: 'devtools-router-transfer', where: '6 節 ハイドレーションの重ね表示', pr: '' },
  51074: { kind: 'bug', ja: '30 秒ほど何もしないと、拡張がページから切れる', ch: 'devtools-detect', where: '検出', pr: '#66166（0db09e33b19、メンバーのコメント「#66166 で直る」）' },
};

const labelsOf = (i) => (i.labels ?? []).map((l) => l.name).filter((n) => n !== 'area: devtools');
const rows = [];
for (const i of open) {
  rows.push({ n: i.number, state: 'open', labels: labelsOf(i), d: i.createdAt.slice(0, 10), reason: '', c: Array.isArray(i.comments) ? i.comments.length : i.comments, area: true, ...NOTES[i.number] });
}
for (const i of search) {
  if (rows.some((r) => r.n === i.number) || !NOTES[i.number]) continue;
  rows.push({ n: i.number, state: 'open', labels: i.labels.map((l) => l.name), d: i.createdAt.slice(0, 10), reason: '', c: i.commentsCount, area: false, ...NOTES[i.number] });
}
for (const i of closed) {
  const r = refs.get(i.number);
  rows.push({ n: i.number, state: 'closed', labels: labelsOf(i), d: i.closedAt.slice(0, 10), reason: i.stateReason, c: r?.comments ?? null, area: true, opened: r?.created ?? '', ...NOTES[i.number] });
}
const missing = rows.filter((r) => !r.ja).map((r) => r.n);
if (missing.length) throw new Error('NOTES が無い: ' + missing.join(', '));

const self = readFileSync(new URL(import.meta.url), 'utf8');
writeFileSync(
  out,
  `// 自動生成 — 手で編集しないこと（scratchpad の make-issues-data.mjs が作った）。\n\n` +
    `export const ROWS = ${JSON.stringify(rows, null, 1)} as const;\n\n` +
    `export const SCRIPT = ${JSON.stringify(self)};\n`,
);
console.log(out, rows.length);

```

## 3. 2025-11 以降に入った修正を commit で読む

どれも `git show` で、直した行と足した spec を読んでから書きました。行の数は `--numstat` の `+` と `-` です。書いた人の欄は、`gh api repos/angular/angular/commits/<sha>/pulls` の PR の `author_association` です。

| commit | 日付・PR・書いた人 | 直した所と、前と後の違い | 足した spec | 章 |
| --- | --- | --- | --- | --- |
| cfb26f59992 | 2025-11-09 #65037 AleksanderBodurri（MEMBER） | `router-tree.ts`。active の判定を URL の前方一致から、`routerState` の `routeConfig` の集まりとの同一性に。#63490・#63493 を閉じた | router-tree.spec.ts の期待値 8 か所（`undefined` → `false`）だけ | [第 18 回](18-devtools-router-transfer.md) |
| 6f922c18d9f | 2026-02-19 #67145 JeanMeche（MEMBER） | `detect-angular.ts`（+2 −2）。検出のメッセージを送る先を detect のスクリプトの URI から content script の URI に。#67143（メモリが増え続ける）を閉じた | **無し** | [第 2 回](02-devtools-detect.md) |
| 50c0ce8275b | 2026-03-20 #68183 csmick（CONTRIBUTOR） | `component-tree.ts`（+5 −1）。`ng.getComponentForest` があれば、木をそれで作る（DOM を描かないコンポーネントも出すため） | **無し** | [第 5 回](05-devtools-component-tree.md) |
| 33b001d478e | 2026-03-23 #67795 AleksanderBodurri（MEMBER） | `identity-tracker.ts`（+41 −4）・`capture.ts`（+3）。消えたディレクティブの記録を、プロファイル中は残して止めたときにまとめて片付ける | identity-tracker.spec.ts（+161） | [第 7 回](07-devtools-identity.md) |
| 06db706238b | 2026-05-03 #68535 AleksanderBodurri（MEMBER） | Transfer State のタブを既定で有効にし、値を木で、絞り込み・並べ替え・5 秒の待ちを足す。バックエンドはすべてのルートを合わせる | transfer-state.component.spec.ts（+209、新しい）・track-state.e2e.js（+42 −30） | [第 18 回](18-devtools-router-transfer.md) |
| 116b4cd936c | 2026-05-19 #68735 hawkgs（MEMBER） | `devtools-signal-graph.ts`（+65 −2）。`processClusterToClusterDependencies` を足し、閉じた塊どうしの辺を作る | devtools-signal-graph.spec.ts（+391、it 3 件） | [第 17 回](17-devtools-signal-graph.md) |
| d7161fd431a | 2026-05-22 #68879 JeanMeche（MEMBER） | `serialized-descriptor-factory.ts`（+7 −3）。`constructor` の無いオブジェクトで `prop.constructor.name` を読んで落ちていた。#68798 を閉じた | state-serializer.spec.ts（+45 −1） | [第 9 回](09-devtools-state-serializer.md) |
| fe50a7ea947 | 2026-06-08 #68745 hawkgs（MEMBER） | signal の値を開くたびに `ɵgetSignalGraph` を呼び直さず、`SignalGraphRef` に最後のグラフを控える。core から `ɵDebugSignalGraph` の型を出す | signal-graph-ref.spec.ts（+41、新しい） | [第 17 回](17-devtools-signal-graph.md) |
| 56847dc77a5 | 2026-06-21 #69458 AleksanderBodurri（MEMBER） | `highlighter.ts`（+28 −27）ほか。`HTMLElement` ではなく `Element` で調べて SVG のホストを光らせる、ディレクティブだけのホストで止まる、id 0 を「無い」と扱わない、枠の大きさを小数のまま | highlighter.spec.ts（+161 −12）・directive-forest-utils.spec.ts（+76 −1）・directive-explorer.spec.ts（+30）・tree-node.component.spec.ts（+15） | [第 12 回](12-devtools-inspector-highlight.md) |
| 95f56d33fe6 | 2026-06-24 #68201 SkyZeroZx（CONTRIBUTOR） | Chrome の Performance パネルから DevTools のコンポーネントへ飛ぶ（`deep_link.ts` ほか 12 ファイル以上）。#63960 を閉じた | devtools-tabs.spec.ts（+63 −2） | [第 15 回](15-devtools-cd-analyzer.md) |
| 1a2bcb2295c | 2026-07-27 #69946 splincode（CONTRIBUTOR） | `performance-track.ts`（+19 −5）。読み込んだだけでプロファイラーを購読していたのを、有効にしたときに 1 回だけ初期化する形に。本番モードで例外（#69944） | performance-track.spec.ts（+31、新しい）とその BUILD | [第 15 回](15-devtools-cd-analyzer.md) |
| 4b83d09a94c | 2026-07-28 #69983 erkamyaman（CONTRIBUTOR） | `directive-forest.component.ts`（+1 −1）。`!this.selectedNode`（signal そのもの、いつも偽）を `!this.selectedNode()` に | **無し** | [第 8 回](08-devtools-forest-ui.md) |
| 3a293291911 | 2026-07-31 #70034 JeanMeche（MEMBER） | `background.ts`（+4 −1）。Google の社員かの判定を、fetch が終わったかではなく応答の `status` で。#70023 を閉じた | **無し** | [第 3 回](03-devtools-messaging.md) |
| 03f1758e2ae | 2026-08-06 #70105 JeanMeche（MEMBER） | `component-tree.ts`。位置の文字列を `split(',')` ではなく `JSON.parse` で読む（#69309 で形が変わったのに追いついていなかった）。#70104（Open Source が動かない）を閉じた | chrome-application-operations.spec.ts（+54、新しい） | [第 5 回](05-devtools-component-tree.md) |
| 12b0acd498b | 2026-08-06 #69860 eduhmc（CONTRIBUTOR） | `breakpoint_manager.ts`（+261、新しい）ほか。CDP で computed・effect にブレークポイント（feat） | **breakpoint\_manager の spec は無し**（app\_operations\_mock.ts +18）。spec は main の 11838e481a0 で足された | [第 17 回](17-devtools-signal-graph.md) |
| f746463caa5 | 2026-08-07 #70115 hawkgs（MEMBER） | `breadcrumbs.component.ts`（+31 −6）。`ResizeObserver` を 100 ミリ秒で間引き、最初の描画のあとにも矢印の要否を計算 | **無し** | [第 8 回](08-devtools-forest-ui.md) |
| 07605ba793b | 2026-08-13 #70254 hawkgs（MEMBER） | CD analyzer（`profiling/cd-analyzer/` の 4 ファイル、+338）。変更検知で確かめたコンポーネントを数えて光らせる（feat） | analyzer.spec.ts（+243、新しい） | [第 15 回](15-devtools-cd-analyzer.md) |
| a3a77649754 | 2026-08-17 #70228 AleksanderBodurri（MEMBER） | `injector-tree.component.ts`（+9 −3）。`highlightComponent` の購読を作るたびに足していたのを、`DestroyRef` で外す | **無し** | [第 16 回](16-devtools-injector-tree.md) |
| ef09d108f23 | 2026-09-02 #70515 eduhmc（CONTRIBUTOR） | `component-tree.ts`・`ng-debug-api.ts`。ルートの候補のうち `ng.getComponent` が返す要素だけを使い、`dir` が無いときに `getDirectiveMetadata` を呼ばない（外のフレームワークのルートの要素） | component-tree.spec.ts（+21）・ng-debug-api.spec.ts（+34） | [第 5 回](05-devtools-component-tree.md)・[第 2 回](02-devtools-detect.md) |
| 635ef1bd80e | 2026-09-04 #70567 hawkgs（MEMBER） | ハイドレーションの重ね表示の描き直しを、パネルからバックエンド（`hydration-overlays.ts`）に移す（refactor） | spec は減っただけ（client-event-subscribers.spec.ts −4・directive-explorer.spec.ts −10） | [第 18 回](18-devtools-router-transfer.md) |

- 20 個のうち spec を足していないのは 7 個（6f922c18d9f・50c0ce8275b・4b83d09a94c・3a293291911・12b0acd498b・f746463caa5・a3a77649754）です。多くは数行の直しか、拡張の殻（`background.ts`・`detect-angular.ts`）やパネルの部品の購読の直しで、[第 19 回](19-devtools-test-build.md)の表のとおり、そこには spec のターゲットが無いか、薄い場所です。
- spec の足し方は 3 通りでした。既存の spec の期待値を直す（cfb26f59992）、既存の spec に it を足す（116b4cd936c・d7161fd431a・56847dc77a5）、新しい spec とターゲットを BUILD ごと作る（1a2bcb2295c・03f1758e2ae・fe50a7ea947・07605ba793b）。
- 書いた人は 20 個で 8 人、MEMBER が 14 個・CONTRIBUTOR が 6 個です。CONTRIBUTOR の 6 個には、`!this.selectedNode` の 1 文字の直し（4b83d09a94c）から、新しい機能（12b0acd498b・95f56d33fe6）までがあります。

## 4. issue を 3 つ、行まで読む

1. **#63490・#63493 ルートがいつも active（2025-08-29 に立ち、2026-10-08 に閉じた、PR #65037）**

   行は `router-tree.ts` の `assignChildrenToParent` です（[第 18 回](18-devtools-router-transfer.md)の 2 節）。前の判定 `currentUrl?.startsWith(routePath.split('/:')[0])` では、`''` のルートの道筋 `/` がどの URL にも前方一致します。直しは active を「`routerState` の木にある `routeConfig` と同じオブジェクトか」に変えました。PR は 2025-11-10 に入りましたが、issue が閉じたのは 2026-10-08 のメンバー（hawkgs）の「Fixed by #65037」のコメントのときです。**直しが入っても、issue がすぐ閉じるとは限りません**。直しの spec は期待値の `undefined` → `false` だけで、spec の偽のルーターに `routerState` が無いので「active になる」側は確かめていません（第 18 回のテストの節）。
2. **#65894 フレームワークの中の signal がグラフを埋める（2025-12-06 に立った、開いている）**

   [第 17 回](17-devtools-signal-graph.md)のデモのとおり、resource 1 つが 7 つのノードになります。forms や router が中で signal を使うと、アプリの signal よりそちらが多くなります。パネルが今まとめているのは `Resource#…` の名前の形だけ（`utils.ts` の 29 行目の `CLUSTERS`）で、ほかの内部の signal を見分ける印はありません。「内部の signal を隠す」PR（#65982）と試作（#66099）はマージされずに閉じ、メンバー（hawkgs）は「内部のノードを隠すか目立たなくする方向で、設定で見られるようにする」とコメントしています。別の PR（#68716、forms に debugName を足す）について、メンバーが「内部に大量の debug name を手で足すのは DX によくない」と書いたことも、この issue で触れられています。**名前の付け方（core）と見せ方（パネル）のどちらで解くかが、まだ決まっていない**話です。
3. **#70452 カスタム要素のあるアプリで RangeError（2026-08-28 に立った、開いている、PR #70454 が開いている）**

   報告のスタックは `getInjectorResolutionPathHelper` → `getInjectorParent` の再帰で、core の `ɵgetInjectorResolutionPath`（[di-debug](../di/16-di-debug.md)）です。DevTools はこれを木を集めるときに呼ぶので（[第 5 回](05-devtools-component-tree.md)の resolutionPath）、パネルが何も出せなくなります。開いている PR は `fix(elements)` で、devtools ではなく @angular/elements の側で、カスタム要素の環境の注入器を正しく引くようにするものです。**DevTools の issue でも、直す場所が devtools/ の外のことがあります**。

## 5. 修正の spec を手元で走らせる

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
# cfb26f59992（active の判定）・116b4cd936c（塊から塊の辺）・06db706238b（Transfer State のタブ）の spec
pnpm bazel test //devtools/projects/ng-devtools-backend/src/lib/router-tree:test \
  //devtools/projects/ng-devtools/src/lib/shared/signal-graph:test \
  //devtools/projects/ng-devtools/src/lib/devtools-tabs/transfer-state:test \
  --nocache_test_results --test_output=all
# 結果（第 17・18 回で走らせたログから）
#   router-tree      26 passed（Chromium・Firefox とも）
#   signal-graph     26 passed（同）
#   transfer-state   16 passed（同）
# //devtools/... 全部: Executed 313 out of 313 tests: 313 tests pass.（135 秒、第 19 回）
```

- どれも直したあとの木なので通ります。直す前に落ちることを確かめるには、src の直しだけを手元で戻して走らせることになりますが、../angular を変えないこのシリーズではそこまでしていません。
- ターゲットの中の 1 つの it だけを選ぶ方法は、`--test_arg` では効きませんでした（第 19 回）。走らせるのはいつもターゲット全体です。

## 6. 最初に読む issue の選び方

1. **どの場所の話かを、章で分ける**

   2 節の表の「章」の列で、その issue がバックエンド・パネル・拡張の殻・core の窓口のどこの話かを先に決めます。#70452 のように、DevTools の issue でも直す場所が core や elements のことがあります。
2. **再現があるかを見る**

   #70452 は再現のリポジトリとスタックがあり、行までたどれます。#68589 は情報が足りずに閉じました。最初に読むなら、[第 19 回](19-devtools-test-build.md)の表の spec の形（`window.ng` の偽物・偽のルーター・`DebugSignalGraph` を手で書く）に写せるものです。
3. **関数 1 つで閉じているものから**

   3 節の直しの多くは 1 つのファイルの 1 つの関数でした。パネルの `*-fns.ts` やフォーマッタ、バックエンドの `router-tree.ts`・`serialization.ts` のように、入力を手で書けば spec になる場所の話が読みやすい。
4. **メンバーのコメントを先に読む**

   #66087 の「本当のリークではない」、#57392 の「期待どおり」、#62736 の「先に話し合いたい」、#65894 の方向のように、方針は 1 つのコメントに書かれています。`gh issue view N --json comments -q '.comments[] | select(.authorAssociation=="MEMBER")'` で拾えます。
5. **main と手元の木の差を確かめる**

   0 節のとおり、main だけで直っているものがあります。読む行が main で同じかを `git diff HEAD origin/main -- devtools/…` で確かめてから、どの章のどの行の話かをメモにします。本家にコメントや PR を出すことは、このシリーズでは勧めません。

## 7. このシリーズで見つけたもの

第 1〜19 回を書く途中で、本家の不具合らしきものと、テストの小さな食い違いが見つかりました。どれも **issue も PR も出していません**。どれも記録（本物の devtools のソースと本物の @angular/core 22.1.6）で起き、手元の木（8576f161ae4）のソースの行と照らして確かめました。記録の環境（Node と domino）のせいで起きるだけのものは入れていません。gh で探した範囲では、同じ報告は見つかりませんでした（#55570 は既存の issue です）。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| 要素の注入器が GC で消え、そのあと provider の一覧を頼んでも返事が来ない。core の `getInjector` は呼ぶたびに新しい NodeInjector を作るが、id の表は最初に作ったものを WeakRef でしか持たない | ng-devtools-backend の component-tree.ts 70-78 行目（getOrCreateInjectorId）と、core の discovery\_utils.ts 147 行目 | `node --expose-gc` で走らせた記録（GC の前後） | [第 7 回](07-devtools-identity.md) |
| 注入されたサービスの一覧から、要素の注入器の依存が落ちる。道筋の注入器と `providedIn` を、オブジェクトが同じかどうかで比べているが、core が NodeInjector を毎回作り直すので一致しない | directive-forest/component-tree/component-tree.ts の getDependenciesForDirective の 347 行目の比べ方と、core の injector\_discovery\_utils.ts 648 行目 | ɵgetInjectorResolutionPath を 2 回呼んで比べた記録 | [第 16 回](16-devtools-injector-tree.md) |
| ページに、アプリより前に別の `[ng-version]` の要素があると、版をその要素の値で読み、ivy でないと判定して「対応していない」と出す | shared-utils/src/lib/angular-check.ts 18-19 行目と 55-59 行目（querySelector で最初の 1 つだけを見る） | よその要素を前に置いた場面の記録 | [第 2 回](02-devtools-detect.md) |
| プロファイラーで複数のフレームを選ぶと、listener の時間（outputs）と、最初のフレームに無いフックの時間が合計から落ちる | ng-devtools の frame-merger.ts の mergeDirective（lifecycle の鍵を足し込まれる側だけで回し、outputs を足す行が無い） | 第 13 回の記録のフレームを足し合わせた結果 | [第 14 回](14-devtools-profiler-formatters.md) |
| 入れ子の途中の値が null だと、ログを出すだけで止まらずに TypeError になり、返事が送られない。パネルに残った once が次の返事も受け取り、別の行の中身が違う行の下に入る | client-event-subscribers.ts 269-273 行目（getNestedPropertiesCallback）と、パネルの property-data-source.ts の \_toggleNode | 本物のパネルの部品とバックエンドをつないだ記録 | [第 10 回](10-devtools-property-resolver.md) |
| ハイドレーションの重ね表示を有効にすると、状態が `dehydrated` の要素で例外になって止まる（プロトコルの型には dehydrated がある） | hydration/hydration-overlays.ts 85-97 行目の switch | `ngh` を付けた要素で enableHydrationOverlays を送った記録 | [第 18 回](18-devtools-router-transfer.md) |
| overlay の大きさを小数のまま書く修正（56847dc77a5）が、あとの highlighter の作り直し（98115e81371）で消え、再び整数に切り捨てている。その修正で足した spec も無くなっている | shared/highlighter/dom.ts 113-116 行目（`~~width`） | merge-base で 56847dc77a5 が祖先であることと、spec の grep | [第 12 回](12-devtools-inspector-highlight.md) |
| 同じオブジェクトを 2 か所から指すと、循環していないのに 2 つめが `[Circular]` で届く | shared/utils/serialization.ts 32-35 行目（一度見たものをすべて seen に入れる） | route の data に同じオブジェクトを 2 つ入れた記録 | [第 18 回](18-devtools-router-transfer.md) |
| （小さなもの）制御フローの塊が、木を頼むたびに「新しい」と「消えた」の両方に入り、id が増え続ける。オブジェクトの provider（`{provide, useValue}`）がルーターの木で名前 null になる。signal の中のプロトタイプの無いオブジェクトを書き換えると、意図したエラーではなく TypeError になる | identity-tracker.ts 137-139 行目、router-tree.ts 102 行目、property-mutation.ts 220 行目 | それぞれの記録 | [第 7 回](07-devtools-identity.md)・[第 18 回](18-devtools-router-transfer.md)・[第 11 回](11-devtools-property-mutation.md) |
| （テスト）prop-type.spec.ts 89 行目が `expect(actual).toBe(actual)` で、自分と自分を比べているので型の判定を何も確かめていない。identity-tracker.spec.ts 139 行目の it は「二度は足さない」という名前だが、148 行目は足されることを確かめている | shared/state-serializer/prop-type.spec.ts 89 行目、directive-forest/identity-tracker/identity-tracker.spec.ts 139-148 行目 | spec の行を読む | [第 9 回](09-devtools-state-serializer.md)・[第 7 回](07-devtools-identity.md) |
| （既存の issue）コンソールに出す provider の値が、選んだ provider ではなく `injector.get(token)` の値になる。#55570 の症状 | client-event-subscribers.ts 601 行目（logProvider） | providers と viewProviders に同じ token を置いた記録 | [第 16 回](16-devtools-injector-tree.md) |

読み方の目安: 上の 2 つ（注入器の件）は、どちらも「core が NodeInjector を毎回作り直す」ことと「devtools がオブジェクトの同一性に頼る」ことの組み合わせで起きています。直す場所が core の側か devtools の側かを決めるところから考える、よい練習になります。issue を探すときは、題の言葉より、表の「どこ」のファイル名や関数名で gh を検索すると見つけやすくなります。

## 聞かれそうな質問

**Q. DevTools の issue は、どこに立てられていますか？**

angular/angular です。DevTools は `devtools/` にあり、`area: devtools` のラベルが付きます。ラベルの無いものもあるので、`gh search issues --repo angular/angular devtools` でも探します（1 節）。

**Q. issue が閉じていれば、手元の DevTools でも直っていますか？**

限りません。手元の木（2026-09-09）より後に main に入った直しが 30 個あり、#70948・#70949・#70683 の直しは main にだけあります（0 節）。逆に、#63490 のように直しが入ってから 11 か月たって閉じたものもあります（4 節）。

**Q. DevTools の直しには、だいたい spec が付いていますか？**

3 節の 20 個では 13 個に付いていました。付いていないのは、数行の直しと、spec のターゲットの無い拡張の殻（`background.ts`・`detect-angular.ts`）やパネルの部品の購読の直しです。新しい機能では、ブレークポイント（12b0acd498b）だけが spec 無しで入り、main で後から足されました。

**Q. いま開いている issue で、いちばん多いのはどの場所の話ですか？**

注入器の木（第 16 回）で、開いている 12 件のうち 4 件です。不具合として残っている 3 件（#70452・#57516・#55570）はすべてここです。

## 読み終えて

- `area: devtools` で開いている issue は 11 件で、多くは機能の要望、不具合は注入器の木に集まっています。
- 2026 年にいちばん動いたのは signal のグラフ（塊・見張り・ブレークポイント）で、閉じた issue の 5 件がその話です。
- 直しの commit の 3 分の 2 には spec が付き、付け方は「期待値を直す・it を足す・spec とターゲットを新しく作る」の 3 通りです。
- 手元の木と main には差があり、issue を読むときは版と main の行を先に確かめます。

---

← 前: [DevTools のテストとビルド：zoneless\_web\_test\_suite と demo のアプリ](19-devtools-test-build.md)  
次: [@defer の全体像：命令・記録・状態・トリガー](../defer/01-defer-overview.md) →
