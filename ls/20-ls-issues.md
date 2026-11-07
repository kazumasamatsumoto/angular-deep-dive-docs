[目次](../README.md) › [言語サービスの内側](README.md) › 第 20 回 / 全 20 回

# issue と PR を読む：言語サービスの今

> area: language-service と area: vscode-extension のラベルで開いている issue と、この 1 年に閉じた issue の表。コンポーネントの自動 import の順番、TS に定義へのジャンプを回す、カスタム要素の型、モノレポの tsconfig など、長く開いているもの。どの issue がこのシリーズのどの章の行に関係するか。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ls-issues)

---

最終回は、言語サービスの「今」を issue と PR から読みます。ラベル `area: language-service` と `area: vscode-extension` で開いている 42 件と、この 1 年（2025-11-03 以降）に閉じた 59 件を表にし、コメントの多いもの・長く開いているものの議論が今の実装のどの行に当たるか、直った issue がスナップショットのどの commit のどのファイルで直ったかを、gh と git で読んだ事実だけで並べます。最後に、issue を手元で確かめる手順と、このシリーズで出てきた spec の一覧を置きます。

読む対象は GitHub の angular/angular の issue と PR（`gh` で読むだけ）、`git -C ../angular log`、それに 1 つの小さな引用です。

1. [1. 全体像](01-ls-overview.md)
2. [2. VS Code クライアント](02-ls-client.md)
3. [3. LSP サーバー](03-ls-server-session.md)
4. [4. tsserver プラグイン](04-ls-ts-plugin.md)
5. [5. CompilerFactory](05-ls-compiler-factory.md)
6. [6. 外部テンプレート](06-ls-external-templates.md)
7. [7. カーソルの位置](07-ls-template-target.md)
8. [8. 診断](08-ls-diagnostics.md)
9. [9. ホバー](09-ls-quick-info.md)
10. [10. 定義へのジャンプ](10-ls-definitions.md)
11. [11. 参照と名前変更](11-ls-references-rename.md)
12. [12. 式の補完](12-ls-completions.md)
13. [13. 要素と属性の補完](13-ls-attribute-completions.md)
14. [14. シグネチャヘルプ](14-ls-signature-help.md)
15. [15. インレイヒント](15-ls-inlay-hints.md)
16. [16. 色分け](16-ls-semantic-tokens.md)
17. [17. 文書のシンボル](17-ls-document-symbols.md)
18. [18. コード修正](18-ls-code-fixes.md)
19. [19. リファクタリング](19-ls-refactorings.md)
20. **20. issue と PR を読む**（この章）

## 0. データの取り方

📄 `ターミナル（読むだけ）`

```
# 開いている issue（2 つのラベル）
gh issue list -R angular/angular --label 'area: language-service' --state open \
  --limit 100 --json number,title,createdAt,comments,labels
gh issue list -R angular/angular --label 'area: vscode-extension' --state open \
  --limit 100 --json number,title,createdAt,comments,labels
# この 1 年（2025-11-03 以降）に閉じた issue
gh issue list -R angular/angular --label 'area: vscode-extension' --state closed \
  --search 'closed:>=2025-11-03' --limit 200 \
  --json number,title,createdAt,closedAt,stateReason,comments
# issue の議論と、番号を書いた PR
gh issue view 68522 -R angular/angular --comments
gh pr list -R angular/angular --state all --search 68522
# 直した commit がスナップショットに入っているか
git -C ../angular log --format='%h %ad %s' --date=short -F --grep=67108
```

- 取った日は 2026-11-03。ソースは ../angular の 8576f161ae4（2026-09-06、22.2.0-next.7）で、それより後の commit は「スナップショットの後」と書きます。
- コメントの数は bot のコメントを含みます。#68522 の 20 件のうち 16 件は同じ自動の投稿者のもので、人のコメントは 4 件です（2 節）。
- 拡張が angular/angular に移った 863c7eaafee（2025-09-10、#63924）のとき、元のリポジトリの issue が #65484〜#65527 の番号で移されました。立った日は元のリポジトリの日付のままです。開いている vscode-extension の 31 件のうち 24 件がこの番号です。
- 「直した commit」は `git log --grep` で issue の番号を書いた commit を探したものです。番号を書いていない commit は見つけられないので、空でも「直っていない」とは限りません。

## 1. 一覧（開いている 42 件と、この 1 年に閉じた 59 件）

> **🧪 issue を絞る**
>
> 2026-11-03 に gh で取ったデータを、このページの中に持っています（通信はしない）。「章」の列は、その issue を読むときに開いておくとよい章です（シリーズの外の型チェックの章もあります）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ls-issues)

- 開いている 42 件のうち 12 件は 2022 年以前に立っています。いちばん古いのは #13726（2016-12-30）、次が #65527（2017-08-31。元のリポジトリから移されたもの）です。
- 閉じた 59 件のうち 14 件は NOT\_PLANNED（直さないと決めた）です。2026-10-30 には #65526・#66641・#66699 など移されたものがまとめて閉じられています。
- 章で見ると、開いているものは色分け（ls-semantic-tokens）・クライアント（ls-client）・サーバーのプロジェクトの扱い（ls-server-session）が多く、テンプレートの意味の機能（ホバー・補完・定義）は少なめです。

## 2. コメントが多いもの・長く開いているもの

1. **#68522 要素名の自動 import で、コンポーネントを先に（2026-05-02、コメント 20）**

   `app-button` のコンポーネントと `app-button[appAddButton]` のディレクティブがあると、`<app-button` と打ったときの補完の自動 import が名前の順でディレクティブを先に出す、という要望です。JeanMeche は最初に「WebStorm の言語サービスでは」と返し、報告者が VS Code だと答えると、「quick fix のほうがよい候補を出す」と画像で示しました。報告者はそれに「quick fix がうまくいくのは、タグに当たるのがコンポーネントだけだからで、属性を足せば両方出る」と返しています。quick fix の候補の選び方は[第 18 回](18-ls-code-fixes.md)の 5 節（`getDirectiveMatchesForElementTag`）で、8 節のデモで同じ形を確かめられます。補完のほうは[第 13 回](13-ls-attribute-completions.md)です。JeanMeche の draft の #68526「Improve directive completion」（completions.ts +128 −34、completions\_spec.ts +51）は「fixes #68522」と書いていますが、28 日動きが無かったので 2026-05-31 に bot が閉じました。
2. **#59888 Angular が定義を見つけなかったら TypeScript に回す（2025-02-07、コメント 5）**

   Zed の拡張を作っている人の報告で、Zed は 1 つのファイルに 1 つの言語サーバーしか使わないので、Angular の言語サーバーが TS ファイルの定義の要求に null を返すと、テンプレートの外の定義へも飛べない、という話です。atscott は「2 つの言語サーバーが同じファイルで並べないほうが根本の問題だ」と返し、名前変更の優先の問題は VS Code でも未解決で、「だから VS Code では TS ファイルの名前変更を Angular 側では全部止めている」と書いています。PR はありません。定義の要求がどこで TypeScript と Angular に分かれるかは[第 10 回](10-ls-definitions.md)、名前変更は[第 11 回](11-ls-references-rename.md)です。
3. **#58483 要素の型を TypeScript のインタフェースで足したい（2024-11-03、コメント 10）**

   カスタム要素（Web Components）の入力・出力の型を、React の `JSX.IntrinsicElements` のような拡張できるインタフェースで足したい、という要望です。メンバーのコメントはありません。2026-07-27 に外部の JSMike が #69957「type-check web components via Custom Elements Manifests」（100 ファイル、開いている）を出し、JSON の manifest を読む形を提案しています。issue では MillerSvt が「manifest でなくグローバルなインタフェースの拡張で」と返し、JSMike は「コンパイラと言語サービスのスキーマの仕組みは型の情報だけでは足りない」と答えています。PR の JeanMeche のレビューは本文が「AGENT:」で始まるものです。要素とスキーマの補完は[第 13 回](13-ls-attribute-completions.md)、DOM の型チェックは[型チェックのシリーズ第 8 回](../typecheck/08-typecheck-elements-dom.md)です。
4. **#65527 テンプレートでの参照数の CodeLens（2017-08-31、コメント 18）**

   TS のメンバーの上に「N references」と出る CodeLens に、テンプレートでの使用を含めたい、という要望です。2021-02-02 に atscott が「その CodeLens は VS Code の TypeScript の拡張が出しているので、結果に足せない。Angular が自分の CodeLens を出す必要がある」と書いて開き直しました。atscott の draft #64807（2025-10-30、session.ts +137 など 9 ファイル。「今はトップレベルのクラスのメンバーだけ」）は 2026-04-17 に bot が閉じています。今の CodeLens は .html の先頭の「Go to component」だけです（[第 17 回](17-ls-document-symbols.md)の 9 節）。
5. **#13726 テンプレートのエラーを黙らせたい（2016-12-30、コメント 9）**

   `<!-- NG-IGNORE-ERROR -->` のようなコメントで、行やページのエラーを黙らせたい、という要望です。後のコメントは Storybook の `moduleMetadata` のように言語サービスが理解できない書き方での誤検知を挙げています。メンバーのコメントはありません。今の拡張にはエラー番号の単位で黙らせる設定 `angular.suppressAngularDiagnosticCodes`（「無視する診断のエラー番号をカンマで並べる」）があり、拡張を移した 863c7eaafee の時点でもう package.json にありました。行やファイルの単位で黙らせる方法はありません。診断の流れは[第 8 回](08-ls-diagnostics.md)です。

> [!NOTE]
> **ポイント**
>
> 2 節の PR のうち 2 本（#68526・#64807）は、メンバー自身の draft が 28 日動かずに bot に閉じられたものです。issue に PR の番号が付いていても、その PR が開いているか、draft か、誰が閉じたかを `gh pr view N --json state,isDraft,closedAt,comments` で確かめてから読みます。

## 3. この 1 年に閉じたもの：スナップショットに入っている修正

### #65488（Sticky Scroll で制御フローを）→ cfd0f9950c0

VS Code の Sticky Scroll（画面の上に今いるブロックの見出しを貼り付ける機能）は文書のシンボルの範囲を使うので、テンプレートの `@if` などが出ない、という報告です。外部の kbrilla の cfd0f9950c0（2026-03-16、「resolves #65488」）が文書のシンボルを丸ごと足しました（api.ts +67、document\_symbols.ts +760、サーバーの handlers/document\_symbols.ts +440、package.json の設定 2 つ）。中身は[第 17 回](17-ls-document-symbols.md)です。同じ日の 0b697f14105 が結合テスト ivy\_spec.ts に 898 行を足しています。

### #67108（import の quick fix が引用符の設定に従わない）→ 0f0d52e9c11

📄 `angular/packages/language-service/test/code_fixes_spec.ts` L606–643 （▶ の行: 606, 609, 617, 629, 636, 640）

```ts
606 ▶     it('respects an explicit double quote preference for the generated import', () => {
607 │       const standaloneFiles = {
608 │         'foo.ts': `
609 ▶          import {Component} from '@angular/core';
610 │          @Component({
611 │            selector: 'foo',
612 │            template: '<bar></bar>'
613 │          })
614 │          export class FooComponent {}
615 │          `,
616 │         'bar.ts': `
617 ▶          import {Component} from '@angular/core';
618 │          @Component({
619 │            selector: 'bar',
620 │            template: '<div>bar</div>'
621 │          })
622 │          export class BarComponent {}
623 │          `,
624 │       };
625 │ 
626 │       const project = createModuleAndProjectWithDeclarations(env, 'test', {}, {}, standaloneFiles);
627 │       const diags = project.getDiagnosticsForFile('foo.ts');
628 │       const fixFile = project.openFile('foo.ts');
629 ▶       fixFile.moveCursorToText('<¦bar>');
630 │ 
631 │       const codeActions = project.getCodeFixesAtPosition(
632 │         'foo.ts',
633 │         fixFile.cursor,
634 │         fixFile.cursor,
635 │         [diags[0].code],
636 ▶         {quotePreference: 'double'},
637 │       );
638 │       const actionChanges = allChangesForCodeActions(fixFile.contents, codeActions);
639 │       actionChangesMatch(actionChanges, `Import BarComponent from './bar' on FooComponent`, [
640 ▶         [``, `import { BarComponent } from "./bar";`],
641 │         [``, `, imports: [BarComponent]`],
642 │       ]);
643 │     });
```

外部の aparziale の 0f0d52e9c11（2026-08-19、「Fixes #67108」）は、ts\_utils.ts に `shouldUseSingleQuotes` を足し、`generateImport` に引用符の引数を足し、fix\_missing\_import.ts と completions.ts の 2 か所から `preferences` を渡すようにしました（7 ファイル、+129 −16）。spec は code\_fixes\_spec.ts に 2 本足していて、その 1 本が上です。609 行目の foo.ts は `'` で import していますが、636 行目で `quotePreference: 'double'` を渡すので、640 行目の期待は `"./bar"` です。もう 1 本（ファイルの最初の import に合わせる）と、関数の中身は[第 18 回](18-ls-code-fixes.md)の 5 節とテストの節です。

### #69905（strictTemplates が既定なのに「有効に」と言われる）→ e606a020e90

📄 `git show e606a020e90 -- packages/language-service/src/language_service.ts`

```ts
--- a/packages/language-service/src/language_service.ts
+++ b/packages/language-service/src/language_service.ts
@@ -899,7 +899,7 @@ export class LanguageService {
         project.readFile(path),
       );

-      if (!this.options.strictTemplates) {
+      if (this.options.strictTemplates === false) {
         diagnostics.push({
           messageText:
             'Some language features are not available. ' +
```

v22 で `strictTemplates` が既定で有効になったのに、tsconfig に書いていないと「一部の機能が使えない。strictTemplates を有効に」という提案が出ていました。crisbeto の e606a020e90（2026-07-23）は条件を `!strictTemplates` から `=== false` に変える 1 行で、test/legacy/language\_service\_spec.ts の確かめを直しています。古い版のプロジェクトでは既定を false に戻す処理が同じファイルにあります（[第 8 回](08-ls-diagnostics.md)）。

### #69768（solution-style の Nx で外部テンプレートが言語サービスを失う）→ 3f8d9d6ea6a

tsconfig.json が project references だけの「solution-style」のワークスペースでは、HTML のファイルに対して TypeScript が tsconfig を見つけられません。元のリポジトリの #2165 で、テンプレートを開いたときに隣の TS ファイルを一瞬開いて正しいプロジェクトを読ませる回避策が入っていましたが、プロジェクトを失ったあとに取り戻す `getDefaultProjectForScriptInfo` には同じ回避策が無く、コンポーネントのファイルを閉じたあとなどにテンプレートの要求が「No config file」で null を返し続けていました。Shayan の 3f8d9d6ea6a（2026-07-14）は session.ts だけを変え（+69 −11）、同じ回避策を足し、それでも見つからなければテンプレートをコンポーネントのプロジェクトに付け、隣の .ts が無い HTML（src/index.html など）では探さないようにしました。サーバーとプロジェクトの扱いは[第 3 回](03-ls-server-session.md)と[第 6 回](06-ls-external-templates.md)です。

## 4. 誰が直しているか（スナップショットまでの 1 年）

`git log --since=2025-09-06 -- packages/language-service vscode-ng-language-service` は 236 件で、題の種類は build 100（多くは Angular Robot の依存の更新）・refactor 44・fix 39・feat 21・docs 17 ほかでした。書いた人は Andrew Scott 55、Angular Robot 47、Alan Agius 46、Matthieu Riegler 23、Kristiyan Kostadinov 21、kbrilla 9、Charles Lyding 8、SkyZeroZx 7 の順です。

- **kbrilla の 9 件**は、外部の貢献者が新しい LSP の機能を続けて足した例です。LSP のライブラリを 3.17 に上げる 5d6e534d8b3（2026-01-21）から始まり、linked editing ranges（8c21866f49f）、インレイヒント（5a6d88626b6 と、その spec の cc64def294c）、文書のシンボル（cfd0f9950c0 と 0b697f14105）と、1 つずつ機能と spec を組で入れています。残りの 3 件は拡張の設定の整理 2 件と、起動の軽量化（39f62fa4080）です。
- **aparziale・SkyZeroZx・Kam**は、1〜2 ファイルの小さな fix や refactor（引用符、エスケープした区切り文字の色分け、JSDoc のリンクの差し込みの防止、重複した関数の削除）です。issue の番号を commit に書いているので、3 節のように issue から commit をたどれます。

## 5. issue を読む手順

1. **メンバーのコメントだけを先に拾う**

   `gh issue view N -R angular/angular --json comments -q '.comments[] | select(.authorAssociation=="MEMBER")'`。#68522 のように bot の投稿が多い issue でも、方針を決める発言がすぐ見つかります。
2. **関係する章を開き、どの関数のどの行の話かを決める**

   1 節の表の「章」の列です。たとえば #68522 なら quick fix は第 18 回の `getDirectiveMatchesForElementTag`、補完は第 13 回。
3. **今の振る舞いを spec の形で書いてみる**

   `LanguageServiceTestEnv.setup()` → `createModuleAndProjectWithDeclarations` → `openFile` → `moveCursorToText('¦…')` → 調べたいメソッド、の形です（[第 1 回](01-ls-overview.md)）。下は #68522 の報告者の説明（「タグだけならコンポーネントだけ」）を確かめる形の書きかけで、**このページでは走らせていません**。手元のブランチに置いて走らせ、通るか落ちるかで説明が今のコードに合っているかが分かります。
4. **--filter で 1 本だけ走らせ、本数を見る**

   フィルタは spec の名前の部分一致で、0 本でも PASSED になります。[第 18 回](18-ls-code-fixes.md)で `quote` と絞ったら別の spec の 1 本が混ざったように、「Ran N of M」の N を shard ごとに足して確かめます。
5. **直った issue は commit からたどる**

   `git log -F --grep=番号` で commit を探し、`git show --stat` で変えたファイルと spec を見ます。3 節のどれも、直したファイルと同じ組の spec を足しています。

📄 `書きかけの spec（走らせていない）`

```
// packages/language-service/test/ の spec を手元のコピーで書いてみる形（このページでは走らせていない）
import {createModuleAndProjectWithDeclarations, LanguageServiceTestEnv} from '../testing';

describe('issue 68522 を読む', () => {
  it('タグだけなら、quick fix の候補はコンポーネントだけ', () => {
    const env = LanguageServiceTestEnv.setup();
    const project = createModuleAndProjectWithDeclarations(env, 'test', {}, {}, {
      'app.ts': `
        import {Component} from '@angular/core';
        @Component({selector: 'app-root', template: '<app-button></app-button>'})
        export class App {}`,
      'button.ts': `
        import {Component, Directive} from '@angular/core';
        @Component({selector: 'app-button', template: ''})
        export class ButtonComponent {}
        @Directive({selector: 'app-button[appAddButton]'})
        export class AddButtonDirective {}`,
    });
    const diags = project.getDiagnosticsForFile('app.ts');
    const app = project.openFile('app.ts');
    app.moveCursorToText('<¦app-button>');
    const actions = project.getCodeFixesAtPosition('app.ts', app.cursor, app.cursor, [diags[0].code]);
    expect(actions.map((a) => a.description)).toEqual([
      `Import ButtonComponent from './button' on App`,
    ]);
  });
});
// 走らせ方：pnpm bazel test //packages/language-service/test:test \
//   --nocache_test_results --test_output=all '--test_arg=--filter=issue 68522'
// 「Ran N of M」の N の合計が 1 になっているかを必ず見る
```

このシリーズでは本家に PR を出すことは勧めません。issue を読むときは、関係する章の行と spec で「今の振る舞い」を自分の目で確かめる、までにします。

## テストと直し方（シリーズのまとめ）

このシリーズで出てきた spec を、どの章の仕組みを確かめるかで並べます（it の数は `grep -cE '^\s*it\('`、../angular 8576f161ae4。ターゲットの数と時間は LS-COMMON の確認と各章の実行の結果）。

| spec | ターゲット | 主な章 |
| --- | --- | --- |
| packages/language-service/test/\*\_spec.ts（completions・quick\_info・definitions・references\_and\_rename・inlay\_hints・code\_fixes・semantic\_tokens・signature\_help・get\_outlining\_spans・signal\_\*\_refactoring\_action ほか） | //packages/language-service/test:test（4 shard、689 本、28.4 秒） | 第 7〜19 回 |
| packages/language-service/test/legacy/\*（古い形の固定のプロジェクト） | //packages/language-service/test/legacy:legacy（231 本） | 第 4・8 回 |
| vscode-ng-language-service/server/src/tests/\* | //vscode-ng-language-service/server/src/tests:test（49 本） | 第 3 回 |
| vscode-ng-language-service/client/src/tests/\* | //vscode-ng-language-service/client/src/tests:test（20 本） | 第 2 回 |
| vscode-ng-language-service/syntaxes/test/\* | //vscode-ng-language-service/syntaxes/test:test（8 本） | 第 16 回 |
| vscode-ng-language-service/integration/lsp/ivy\_spec.ts（本物のサーバーを起動する結合テスト。文書のシンボル 17 本・コード修正 4 本を含む） | //vscode-ng-language-service/integration/lsp:test（このスナップショットではビルドに失敗） | 第 3・17・18 回 |

この 4 回で走らせたもの（すべて //packages/language-service/test:test、2026-11-03）：

| フィルタ | 本数（shard ごと） | 時間 | 章 |
| --- | --- | --- | --- |
| get outlining spans | 7（1・2・2・2） | PASSED in 1.7s | [第 17 回](17-ls-document-symbols.md) |
| code fixes | 35（8・9・9・9） | PASSED in 3.0s | [第 18 回](18-ls-code-fixes.md) |
| quote | 3（0・0・1・2。completions\_spec の 1 本を含む） | PASSED in 1.7s | [第 18 回](18-ls-code-fixes.md) |
| Signal input refactoring action | 13（3・3・3・4） | PASSED in 2.0s | [第 19 回](19-ls-refactorings.md) |

## 聞かれそうな質問

**Q. vscode-extension のラベルの issue に、2017 年や 2020 年のものがあるのはなぜですか？**

拡張のリポジトリ（angular/vscode-ng-language-service）が 863c7eaafee（2025-09-10、#63924）で angular/angular に移ったとき、開いていた issue が #65484〜#65527 の番号で移されたからです。立った日は元の日付のままなので、#65527 は 2017-08-31 と表示されます。

**Q. PR の番号が付いているのに issue が閉じないのはなぜですか？**

2 節の #68522 と #65527 では、付いている PR はどちらもメンバーの draft で、28 日動きが無いので bot に閉じられていました（#68526 は 2026-05-31、#64807 は 2026-04-17）。#58483 の #69957 は外部の 100 ファイルの PR で、2026-11-03 の時点で開いています。

**Q. テンプレートのエラーを黙らせる方法はありますか？**

エラー番号の単位なら、拡張の設定 `angular.suppressAngularDiagnosticCodes` にカンマで並べます。#13726 が求める行やページの単位のコメントはありません（2 節）。

**Q. 言語サービスの issue を直すとき、最初に開くファイルはどこですか？**

3 節の修正では、テンプレートの意味に関わるもの（#67108・#69905）は packages/language-service/src、プロジェクトの扱い（#69768）は vscode-ng-language-service/server/src/session.ts、新しい LSP の機能（#65488）は両方とサーバーのハンドラでした。1 節の表の章から関数を決め、その章の「テストと直し方」の spec を一緒に走らせます。

## 読み終えて

- 開いている 42 件は、色分け・クライアントの起動・プロジェクトの扱いが多く、24 件は拡張を移したときに古いリポジトリから来たもの。
- コメントの多い issue でも、bot の投稿を除くと議論は短い。メンバーのコメントを先に拾い、付いた PR の状態（draft・bot が閉じた）を確かめる。
- この 1 年の修正は、外部の貢献者が機能と spec を組で入れた例（kbrilla の文書のシンボル、aparziale の引用符）が多い。issue の番号を書いた commit は git log --grep でたどれる。
- issue を読むときは、関係する章の行を開き、LanguageServiceTestEnv の形の spec で今の振る舞いを手元で確かめるまでにする。

---

← 前: [リファクタリング：@Input を input() に変える](19-ls-refactorings.md)  
次: [マイグレーションの全体像：ng update と ng generate](../mig/01-mig-overview.md) →
