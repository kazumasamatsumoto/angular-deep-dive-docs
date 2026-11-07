[目次](../README.md) › [Angular Aria の内側](README.md) › 第 20 回 / 全 20 回

# issue と PR を読む：Angular Aria の今

> area: aria/\* ラベルで開いている issue と、この 1 年に閉じた issue の表。開いている issue の多くに数日のうちに外部の PR が付いていること、その PR がどの行を直しているか。developer preview が外れた変更、Material との関係、spinbutton など新しい部品の提案。

angular/components · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/aria-issues)

---

最終回は、Angular Aria の「今」を issue と PR から読みます。部品ごとのラベル（`area: aria/<部品>`）で開いている issue と、この 1 年に閉じた issue を表にし、開いている issue に数日のうちに外部の PR が付く流れと、その PR がどのファイルを直しているかを、gh で読んだ事実だけで並べます。developer preview が外れた変更、Material との関係、spinbutton の提案も見ます。最後に、このシリーズの各章の「テストと直し方」を 1 つの表にまとめます。

読む対象は GitHub の angular/components の issue と PR（`gh` で読むだけ）、`git -C ../components log -- src/aria`、それに 3 つの小さな引用です。

1. [1. 全体像](01-aria-overview.md)
2. [2. SignalLike](02-aria-signal-like.md)
3. [3. SortedCollection](03-aria-collection.md)
4. [4. イベントマネージャ](04-aria-events.md)
5. [5. ListFocus](05-aria-list-focus.md)
6. [6. ListNavigation](06-aria-list-navigation.md)
7. [7. ListSelection](07-aria-list-selection.md)
8. [8. ListTypeahead](08-aria-typeahead.md)
9. [9. Listbox](09-aria-listbox.md)
10. [10. Accordion](10-aria-accordion.md)
11. [11. DeferredContent](11-aria-deferred-content.md)
12. [12. Tabs](12-aria-tabs.md)
13. [13. Toolbar](13-aria-toolbar.md)
14. [14. Tree](14-aria-tree.md)
15. [15. Grid](15-aria-grid.md)
16. [16. Grid のセル](16-aria-grid-cells.md)
17. [17. Combobox](17-aria-combobox.md)
18. [18. Menu](18-aria-menu.md)
19. [19. テスト](19-aria-testing.md)
20. **20. issue と PR を読む**（この章）

## 0. データの取り方

📄 `ターミナル（読むだけ。コメントやリアクションはしない）`

```
# ラベルごとに（開いている / 閉じた）。2026-11-02 に取得
gh issue list -R angular/components --label "area: aria/combobox" --state open --json number,title,createdAt
gh issue list -R angular/components --label "area: aria/combobox" --state closed --limit 100 --json number,title,createdAt,closedAt

# issue に付いた PR（ほかのリポジトリからの参照も混ざる）
gh api repos/angular/components/issues/33973/timeline --paginate \
  -q '.[] | select(.event=="cross-referenced" and .source.issue.pull_request != null) | .source.issue.number'

# PR のレビューとコメント（読むだけ）
gh api repos/angular/components/pulls/33965/reviews -q '.[] | "\(.user.login) \(.author_association) \(.state)"'
gh pr diff 33975 -R angular/components
```

- `area: aria` という 1 つのラベルはありません。部品ごとに `area: aria/accordion`・`combobox`・`grid`・`listbox`・`menu`・`tabs`・`toolbar`・`tree` の 8 つです。
- 1 つの issue に 2 つのラベルが付くことがあるので、ラベルごとの数を足すと重なります（開いている 16 → 14 件、閉じた 39 → 36 件）。
- ラベルが `area: many` の issue はこの数に入りません。たとえば開いている #33934（menu と tabs で、スクリプトでフォーカスを動かしたあとの Enter が今の項目に効く）がそうで、外部の PR #34009 が付いています。
- 「外部」は、PR の `author_association` が `MEMBER` でないもの、とします（`CONTRIBUTOR` は以前にマージされたことがある人、`NONE` は初めての人）。

## 1. 部品ごとの数（2026-11-02）

| ラベル | 開いている | 閉じた（取得した範囲） | snapshot までの 1 年のコミット（題の scope） |
| --- | --- | --- | --- |
| aria/combobox | 6 | 12 | 28 |
| aria/listbox | 4 | 5 | 4 |
| aria/menu | 3 | 9 | 26 |
| aria/tabs | 2 | 1 | 8 |
| aria/accordion | 1 | 3 | 8 |
| aria/grid | 0 | 6 | 19 |
| aria/tree | 0 | 2 | 10 |
| aria/toolbar | 0 | 1 | 9 |

コミットの数は `git -C ../components log --since=2025-11-02 -- src/aria` の 179 件の題から `fix(aria/combobox)` のような scope を数えたものです（`multiple` が 42 件で最多）。部品では combobox がいちばん多く、menu が続きます。種類は refactor 74・fix 59・build 13・feat 10。書いた人は Kristiyan Kostadinov 47、Cheng-Hsuan Tsai 40、Andrey Dolgachev 38、Wagner Maciel 23、tjshiu 12 で、この 5 人で 160 件です。

## 2. 開いている 14 件

| # | ラベル | 立った日 | 内容 | 付いている PR |
| --- | --- | --- | --- | --- |
| 34041 | listbox | 2026-11-01 | option が変わる途中で押した Enter が、もう描かれていない option を選ぶ | なし |
| 34011 | accordion | 2026-10-24 | パネルの中の Enter / Space で開閉してしまう | #34012（agarwalU001、10-25） |
| 33973 | combobox | 2026-10-20 | 続けて押したキーが落ちる（[第 17 回](17-aria-combobox.md)） | #33975（drakeo338、10-20） |
| 33964 | menu | 2026-10-15 | MenuItem の `disabled` が素の属性を受けない（[第 18 回](18-aria-menu.md)） | #33965（DuncanFaulkner、10-15） |
| 33961 | tabs | 2026-10-15 | 触ったあとに選んだタブを消すと、タブの列から Tab の止まり場所が無くなる | #33969（abhisheksi-ngh、10-17） |
| 33950 | tabs | 2026-10-12 | タブの中身を最初から描きたい | #33966（felipdsa21、10-16） |
| 33580 | menu | 2026-07-24 | （題は `mat-menu`）iOS の VoiceOver でメニューの外へ出られる | なし |
| 32765 | combobox | 2026-02-10 | autocomplete でクリックや Enter で選べず、Tab でだけ選べる | なし |
| 32762 | listbox | 2026-02-10 | `goToFirst()` のあと Enter で最初の option を選べない | なし |
| 32731 | menu | 2026-01-30 | （feat）共有のメニュー部品を作れるようにしてほしい | なし（メンテナーの #33320 は閉じた） |
| 32712 | combobox | 2026-01-27 | autocomplete（readonly=false）で listbox の選択状態が壊れる | なし |
| 32659 | combobox・listbox | 2026-01-16 | listbox の `[multi]` が combobox の readonly のときだけ効く | なし |
| 32658 | combobox | 2026-01-16 | `filterMode="auto-select"` が古い値を返す（以前の API の名前） | なし |
| 32504 | combobox・listbox | 2025-12-09 | Combobox と Listbox を `hostDirectives` にするとクリックが効かない | なし |

PR の列は issue のタイムラインの「cross-referenced」から、angular/components の PR だけを拾ったものです（ほかのリポジトリからの参照は除いた）。どの PR も `gh pr view` の `closingIssuesReferences` がその issue を指していることを確かめました。

## 3. 数日で外部の PR が付く

| issue（立った時刻 UTC） | PR（作られた時刻） | 間 | PR の作者 | 変えたファイル | reviews / comments（11-02） |
| --- | --- | --- | --- | --- | --- |
| #33964（10-15 20:14） | #33965（10-15 20:15） | 約 1 分 | DuncanFaulkner（CONTRIBUTOR、issue も同じ人） | menu-item.ts・menu.spec.ts・goldens/aria/menu/index.api.md | 1（APPROVED）/ 6 |
| #33961（10-15 10:12） | #33969（10-17 05:54） | 約 2 日 | abhisheksi-ngh（NONE） | private/tabs/tabs.ts・tabs.spec.ts | 0 / 2（CLA の bot と作者） |
| #33950（10-12 05:28） | #33966（10-16 15:36） | 約 4 日 | felipdsa21（CONTRIBUTOR） | accordion と tabs の content・panel、spec、golden 2 つ | 0 / 0 |
| #33973（10-20 00:36） | #33975（10-20 04:17） | 約 4 時間 | drakeo338（NONE） | private/combobox/combobox.ts・combobox.spec.ts | 0 / 0 |
| #34011（10-24 18:03） | #34012（10-25 16:49） | 約 1 日 | agarwalU001（NONE） | private/accordion/accordion.ts・accordion.spec.ts | 0 / 0 |
| #33934（10-07 05:42） | #34009（10-24 05:29） | 約 17 日 | dajiaohuang（NONE） | menu と tabs の 6 ファイル | 0 / 0 |

- 2026-10 に立って今も開いている 5 件（#34011・#33973・#33964・#33961・#33950）には、どれも数分から 4 日で外部の PR が付いています。ただし 11-02 の時点でレビューが付いているのは #33965 だけでした。
- #33965 の流れ（[第 18 回](18-aria-menu.md)の 10 節）：メンテナーが CI の失敗を指摘 → 承認 → 別のメンテナーが「menu の項目は soft-disabled だけ」と設計の前提を書いて懸念を出す → 作者が host binding と spec を足す、の順でした。PR のレビューは「直っているか」だけでなく「その部品の設計の前提に合うか」を見ていることが分かります。
- #33976（menu の DOM の変化）では、外部の #33977（lazerg、10-20）が先に付きましたが、メンテナーの crisbeto が別の直し方の #33996 を 10-22 に出してマージし、#33977 は 10-23 に閉じられました（[第 18 回](18-aria-menu.md)の 9 節）。
- 逆に、外部の PR がそのままマージされた例もあります。lazerg の #33635（#33640、PR を出してからマージまで 2 日）、#33697（#33696、8 日）、#33974（#33972、同じ日）です。3 つとも combobox で、spec を足していました。

### PR の変える場所を、引用で見る

📄 `components/src/aria/menu/menu-item.ts` L43–64 （▶ の行: 46, 53–54）

```ts
43 │ @Directive({
44 │   selector: '[ngMenuItem]',
45 │   exportAs: 'ngMenuItem',
46 ▶   host: {
47 │     '[attr.role]': '_pattern.role()',
48 │     '(focusin)': '_pattern.onFocusIn()',
49 │     '[attr.tabindex]': '_pattern.tabIndex()',
50 │     '[attr.data-active]': 'active()',
51 │     '[attr.aria-haspopup]': 'hasPopup()',
52 │     '[attr.aria-expanded]': 'expanded()',
53 ▶     '[attr.aria-disabled]': '_pattern.disabled()',
54 ▶     '[attr.aria-controls]': '_pattern.submenu()?.id()',
55 │   },
56 │ })
57 │ export class MenuItem<V> implements OnInit, OnDestroy {
58 │   /** A reference to the host element. */
59 │   private readonly _elementRef = inject(ElementRef);
60 │ 
61 │   /** A reference to the host element. */
62 │   readonly element = this._elementRef.nativeElement as HTMLElement;
63 │ 
64 │   /** The unique ID of the menu item. */
```

#33965 は、53 行目の `'[attr.aria-disabled]'` の下に `'[attr.disabled]': 'null'` を足し、同じファイルの `disabled` の input（[第 18 回](18-aria-menu.md)の 1 節）を `input(false, {transform: booleanAttribute})` にする PR です（`gh pr diff 33965`）。host に足す 1 行は、`<button ngMenuItem disabled>` と書いてもネイティブの `disabled` を消し、`aria-disabled` だけにするためのものです。

## 4. この 1 年に閉じた 36 件

> **🧪 閉じた issue（ラベルで絞る）**
>
> 2026-11-02 に gh で取ったデータを、このページの中に持っています（通信はしない）。「直した変更」は git log の本文の `#番号`、または issue の `closedByPullRequestsReferences` から拾えたものだけで、空は「見つけていない」です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/aria-issues)

- combobox の 12 件のうち 9 件が 2026-06〜08 に立っています（#33352・#33358・#33359・#33361・#33396・#33448・#33516・#33640・#33696）。5 月の 0ca47b4a06（#33206）で以前の combobox を消し、simple-combobox を `Combobox` にした直後です（[第 17 回](17-aria-combobox.md)の 6 節）。
- #32603 は 2026-07-02 に閉じたあと、09-23 に外部の PR #33859（grid の CDK table との連携）が付き、PR は開いたままです。issue のタイムラインの PR と、issue を閉じた変更は、同じとは限りません。
- #33684（toolbar に select / combobox を置きたい）を閉じたのは #33747「toolbar から選択の Behavior を外す」で、これがこのサイトの 22.1.8 と snapshot の toolbar の差の大部分です（[第 13 回](13-aria-toolbar.md)）。

## 5. developer preview が外れた、Material との関係、新しい部品

- **00707801b4（2026-05-09、#33232「aria から developer preview の印を外す」）**：本文は「v22 で安定にするので」。`git show --stat` で 26 ファイル、48 行の削除だけで、どれも JSDoc の `@developerPreview 21.0` の行（とその前の空の ` *`）でした。コードは変えていません。
- **Material は Aria を使っていない**：../components の src で `@angular/aria` を import しているのは、src/aria の外では src/components-examples/aria の 82 ファイルだけでした。src/material・src/cdk の BUILD.bazel にも `//src/aria` はありません。
- **spinbutton の提案（PR #32663、OmerGronich、2026-01-16）**：src/aria/spinbutton と private/spinbutton を新しく作る 32 ファイル・+1949 行の PR です。メンテナーの JeanMeche が 2026-01-27 に 12 のレビューコメント、作者が 01-28 に 7 つ返し、そのあと更新はありません（updated 2026-01-28）。新しい部品は、config.bzl の入口・private/public-api.ts・golden・examples・dev-app まで、一度に足す量になります。
- **ほかの開いている PR**：#32904（JoostK、メンバー、signal の `debugName` を落とす perf）は andrewseguin が「内部の Wiz ライブラリが debugName を使う」と返し、2026-03-10 の作者の返事のあと動きがありません。#33198（tjshiu、combobox のポップアップを開く仕組みを差し替える）は、変えるファイルがまだ `simple-combobox` のパスのままです。

## 6. issue になっていない食い違い（このシリーズで見つけたもの）

📄 `components/src/aria/private/combobox/combobox.ts` L9–40 （▶ の行: 9, 11–12, 16, 21, 27）

```ts
 9 ▶ import {computed, signal, untracked} from '@angular/core';
10 │ import {_getEventTarget} from '@angular/cdk/platform';
11 ▶ import {KeyboardEventManager, ClickEventManager, Modifier} from '../behaviors/event-manager';
12 ▶ import {SignalLike, WritableSignalLike} from '../behaviors/signal-like/signal-like';
13 │ import {ExpansionItem} from '../behaviors/expansion/expansion';
14 │ 
15 │ /** Represents the required inputs for a simple combobox. */
16 ▶ export interface ComboboxInputs extends ExpansionItem {
17 │   /** Whether the combobox should always remain expanded. */
18 │   alwaysExpanded: SignalLike<boolean>;
19 │ 
20 │   /** The value of the combobox. */
21 ▶   value: WritableSignalLike<string>;
22 │ 
23 │   /** The element that the combobox is attached to. */
24 │   element: SignalLike<HTMLElement>;
25 │ 
26 │   /** The popup associated with the combobox. */
27 ▶   popup: SignalLike<ComboboxPopupPattern | undefined>;
28 │ 
29 │   /** An inline suggestion to be displayed in the input. */
30 │   inlineSuggestion: SignalLike<string | undefined>;
31 │ 
32 │   /** Whether the combobox is disabled. */
33 │   disabled: SignalLike<boolean>;
34 │ 
35 │   /** Whether the combobox is readonly. */
36 │   readonly: SignalLike<boolean>;
37 │ 
38 │   /** Whether the combobox is soft disabled. */
39 │   softDisabled?: SignalLike<boolean>;
40 │ }
```

📄 `components/src/aria/private/behaviors/popup/popup.ts` L9–30 （▶ の行: 9, 12, 21, 23, 26, 29）

```ts
 9 ▶ import {SignalLike, WritableSignalLike} from '../signal-like/signal-like';
10 │ 
11 │ /** Valid popup types for aria-haspopup. */
12 ▶ export enum PopupTypes {
13 │   MENU = 'menu',
14 │   TREE = 'tree',
15 │   GRID = 'grid',
16 │   DIALOG = 'dialog',
17 │   LISTBOX = 'listbox',
18 │ }
19 │ 
20 │ /** Represents the inputs for the PopupControl behavior. */
21 ▶ export interface PopupControlInputs {
22 │   /* Refers to the element that serves as the popup. */
23 ▶   controls: SignalLike<string>;
24 │ 
25 │   /* Whether the popup is open or closed. */
26 ▶   expanded: WritableSignalLike<boolean>;
27 │ 
28 │   /* Corresponds to the popup type. */
29 ▶   hasPopup: SignalLike<PopupTypes>;
30 │ }
```

- private/combobox/combobox.ts は 9 行目で `computed`・`signal`・`untracked` を `@angular/core` から import しています。ui-pattern-rules.md の決まりは「signal などは signal-like.ts から」です（[第 2 回](02-aria-signal-like.md)）。private/&lt;部品&gt;/ の Pattern で `@angular/core` を直接 import しているのは combobox だけでした（grep。ほかに import しているのは utils と deferred-content で、どちらも Pattern ではない）。12 行目の型は signal-like から取っています。
- popup.ts の `PopupControl` と、21〜30 行目の入力（`controls`・`expanded`・`hasPopup`）は、どの Pattern からも使われていません。`ComboboxPattern` の popup の種類は、12 行目の `PopupTypes` ではなく文字列の `'listbox' | 'tree' | 'grid' | 'dialog'` です（[第 17 回](17-aria-combobox.md)の 6 節）。
- violations.ts のコメントは「errors として」、使っているのは `console.warn`。test-helpers.ts の `waitForMicrotasks` は `setTimeout(0)`。popup.spec.ts の it の名前の「inert」はコードに無い（[第 19 回](19-aria-testing.md)）。

どれも動きは変わらないので、issue にするほどのものかは分かりません。読むときに「決まりと実物が違う所がある」と知っておくための一覧です。

## 7. このシリーズの「直す入口」

| 章 | 主に直すファイル | spec のターゲット（chromium） | 件数 |
| --- | --- | --- | --- |
| [2. SignalLike](02-aria-signal-like.md) | private/behaviors/signal-like/signal-like.ts | （spec なし、strict\_deps\_test だけ） | — |
| [3. SortedCollection](03-aria-collection.md) | private/utils/collection.ts | //src/aria/private/utils:unit\_tests\_chromium | 11 |
| [4. イベントマネージャ](04-aria-events.md) | private/behaviors/event-manager/\*.ts | （spec なし） | — |
| [5. ListFocus](05-aria-list-focus.md) | private/behaviors/list-focus/list-focus.ts | //src/aria/private/behaviors/list-focus:unit\_tests\_chromium | 11 |
| [6. ListNavigation](06-aria-list-navigation.md) | private/behaviors/list-navigation/list-navigation.ts | …/list-navigation:unit\_tests\_chromium | 39 |
| [7. ListSelection](07-aria-list-selection.md) | private/behaviors/list-selection/list-selection.ts | …/list-selection:unit\_tests\_chromium | 52 |
| [8. ListTypeahead](08-aria-typeahead.md) | private/behaviors/list-typeahead/list-typeahead.ts | …/list-typeahead:unit\_tests\_chromium | 17 |
| [9. Listbox](09-aria-listbox.md) | private/listbox/\*.ts・listbox/\*.ts | //src/aria/listbox・private/listbox | 105・68 |
| [10. Accordion](10-aria-accordion.md) | private/accordion/accordion.ts・accordion/\*.ts | //src/aria/accordion・private/accordion | 42・27 |
| [11. DeferredContent](11-aria-deferred-content.md) | private/deferred-content/deferred-content.ts | //src/aria/private/deferred-content | 5 |
| [12. Tabs](12-aria-tabs.md) | private/tabs/tabs.ts・tabs/\*.ts | //src/aria/tabs・private/tabs | 85・37 |
| [13. Toolbar](13-aria-toolbar.md) | private/toolbar/\*.ts・toolbar/\*.ts | //src/aria/toolbar・private/toolbar | 62・111 |
| [14. Tree](14-aria-tree.md) | private/tree/tree.ts・behaviors/tree・tree/\*.ts | //src/aria/tree・private/tree・behaviors/tree | 142・95・49 |
| [15〜16. Grid](15-aria-grid.md) | private/grid/\*.ts・behaviors/grid・grid/\*.ts | //src/aria/grid・private/grid・behaviors/grid | 71・51・213 |
| [17. Combobox](17-aria-combobox.md) | private/combobox/combobox.ts・combobox/\*.ts | //src/aria/combobox・private/combobox | 112・21 |
| [18. Menu](18-aria-menu.md) | private/menu/menu.ts・menu/\*.ts | //src/aria/menu・private/menu | 90・86 |
| [19. テスト](19-aria-testing.md) | private/utils/violations.ts・各 Pattern の validate() | 各部品のディレクティブの spec | — |

件数は 2026-11-02 の chromium の結果です（第 19 回の 5 節）。ハーネスの spec は各部品の `<部品>/testing:unit_tests_chromium` です。

> [!TIP]
> **新卒エンジニアへ**
>
> このシリーズは本家に PR を出すことを勧めません。上の表は、issue を読むときに「その報告はどのファイルのどの関数の話か」「どのターゲットを手元で走らせれば確かめられるか」を引くためのものです。開いている issue には多くの場合すでに PR が付いているので、まずその PR の差分と、上の表のターゲットを手元で走らせた結果を見比べるのが、読むことの練習になります。

## テストと直し方

1. **issue を 1 つ手元で確かめる流れ**

   1) issue の再現コードを、その部品のディレクティブの spec の形（キーごとに `whenStable` を待つ、など）に書き直す。2) 上の表のターゲットを `--nocache_test_results` で走らせ、今の main（または snapshot）で落ちることを確かめる。3) 付いている PR を `gh pr diff` で読み、変えた関数が、この章の表の「主に直すファイル」のどの行かを探す。#33973 と PR #33975 でこの流れをたどったのが[第 17 回](17-aria-combobox.md)です。
2. **公開 API が変わる PR**

   input の型や export が変わると goldens/aria/&lt;部品&gt;/index.api.md も変わります。#33965・#33966・#32663 はどれも golden を変えていました。
3. **ラベルの外も見る**

   `area: many` の #33934 のように、部品のラベルが付かない issue もあります。部品名で `gh issue list --search "aria/menu in:title"` のように題でも探すと漏れが減ります（この章の表はラベルだけで作った）。

## 聞かれそうな質問

**Q. Angular Aria はもう安定版ですか？**

00707801b4（2026-05-09）で JSDoc の `@developerPreview` が全部外れました。コミットの本文は「v22 で安定にするため」です。ただし 5 月には以前の combobox を消す BREAKING CHANGE（0ca47b4a06）もあり、その後の数か月に combobox の修正が集中しています（4 節）。

**Q. Material の部品は Aria の上に作り直されていますか？**

snapshot の時点ではいいえ。src/material に `@angular/aria` の import は 0 件で、Aria を import しているのは components-examples/aria だけです（5 節）。

**Q. 開いている issue に PR を出せば取り込まれますか？**

分かりません。事実として、外部の PR がそのまま入った例（lazerg の 3 本）も、メンテナーが別の直し方で直して外部の PR が閉じられた例（#33977 → #33996）も、レビューが付かずに止まっている例（#33975・#34012 など、11-02 時点）もあります。#33965 のように、設計の前提（soft-disabled）に合わせて直すよう求められることもあります。

**Q. いちばん issue が多い部品はどれですか？**

開いている数でも閉じた数でも、コミットの数でも combobox です（1 節：開いている 6・閉じた 12・コミット 28）。次が menu です。

## 読み終えて

- ラベルは部品ごとに 8 つ。開いている issue は 14 件（重なりを除く）、閉じた issue は 36 件を取得した。`area: many` は別に探す。
- 2026-10 の issue には数時間〜数日で外部の PR が付くが、11-02 時点でレビューが付いたのは #33965 だけ。
- combobox がいちばん直された部品で、5 月の作り直しのあと 6〜8 月に修正が集中した。
- developer preview の印は 2026-05 に外れた。Material はまだ Aria を使っていない。
- 各章の「テストと直し方」は、7 節の表で「ファイル」と「ターゲット」に引ける。

---

← 前: [Aria のテスト：ハーネス・axe-core・violations](19-aria-testing.md)  
次: [テンプレート型チェックの全体像：TCB を作って TypeScript に任せる](../typecheck/01-typecheck-overview.md) →
