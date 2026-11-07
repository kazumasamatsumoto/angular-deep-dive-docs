[目次](../README.md) › [テンプレート型チェックの内側](README.md) › 第 20 回 / 全 20 回

# issue と PR を読む：テンプレート型チェックの今

> compiler: template type-checking と compiler: extended diagnostics のラベルで開いている 25 件と、この 1 年に閉じた 10 件の表。PR が付いたのに閉じないもの（双方向バインディングの出力の型、ジェネリックの推論）、長く開いている設計の問題（ng-template の型、属性セレクタの import 忘れ、型チェックをビルドの外へ）、?. の一連の修正、新しい private アクセスの要望。どの issue がこのシリーズのどの章に関係するか。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-issues)

---

最終回は、テンプレート型チェックの「今」を issue と PR から読みます。ラベル `compiler: template type-checking` と `compiler: extended diagnostics` で開いている 25 件と、この 1 年に閉じた 10 件を表にし、PR が付いたのに閉じないもの、長く開いたままの設計の問題、直った issue がどの PR のどのファイルで直ったかを、gh と git で読んだ事実だけで並べます。最後に、このシリーズのどの章から issue を読み始めるとよいかの順番と、手元で走らせる spec の一覧を置きます。

読む対象は GitHub の angular/angular の issue と PR（`gh` で読むだけ）、`git -C ../angular log`、それに 2 つの小さな引用です。

1. [1. 全体像](01-typecheck-overview.md)
2. [2. 設定](02-typecheck-config.md)
3. [3. TCB の置き場所](03-typecheck-context.md)
4. [4. 派生プログラム](04-typecheck-program-driver.md)
5. [5. Environment](05-typecheck-environment.md)
6. [6. Scope と TcbOp](06-typecheck-scope.md)
7. [7. 式](07-typecheck-expressions.md)
8. [8. 要素と DOM](08-typecheck-elements-dom.md)
9. [9. 型コンストラクタ](09-typecheck-type-constructor.md)
10. [10. 入力](10-typecheck-inputs.md)
11. [11. 出力とイベント](11-typecheck-outputs-events.md)
12. [12. 双方向](12-typecheck-two-way.md)
13. [13. 制御フロー](13-typecheck-control-flow.md)
14. [14. ng-template のガード](14-typecheck-template-guards.md)
15. [15. 参照と pipe](15-typecheck-refs-pipes.md)
16. [16. 診断の対応付け](16-typecheck-diagnostics-mapping.md)
17. [17. 帯域外の診断](17-typecheck-oob.md)
18. [18. 拡張診断](18-typecheck-extended.md)
19. [19. TemplateTypeChecker](19-typecheck-template-type-checker.md)
20. **20. issue と PR を読む**（この章）

## 0. データの取り方

📄 `ターミナル（読むだけ）`

```
# データは 2026-11-02 に取ったもの（scratchpad/tc-logs/ の 4 つの JSON。読むだけで、コメント・リアクション・ラベル付けはしない）
# open-tc.json などは次の形（closed は closedAt も）
gh issue list -R angular/angular --label "compiler: template type-checking" --state open --limit 100 \
  --json number,title,createdAt,updatedAt,comments,labels,url

# issue に付いた PR（同じリポジトリの PR だけ）
gh api --paginate "repos/angular/angular/issues/46351/timeline?per_page=100" \
  -q '.[] | select(.event=="cross-referenced" and .source.issue.pull_request != null) | .source.issue.number'

# 閉じた issue を閉じた PR
gh issue view 37619 -R angular/angular --json stateReason,closedByPullRequestsReferences

# snapshot までの 1 年のコミット
git -C ../angular log --since=2025-09-06 --format='%an' -- packages/compiler/src/typecheck packages/compiler-cli/src/ngtsc/typecheck | sort | uniq -c | sort -rn
```

- 2 つのラベルは、どちらも `area: compiler` と一緒に付きます。取った時点（2026-11-02）で template type-checking は開いている 18 件・閉じた 64 件、extended diagnostics は開いている 7 件・閉じた 37 件でした（閉じた側は取った範囲の数）。
- 「付いている PR」は issue のタイムラインの cross-referenced のうち、angular/angular の PR だけです（ほかのリポジトリからの参照は除く）。#46351 には paperless-ngx の 7 本、#28731 には spartan-ng の 1 本が付いていますが、数えていません。
- コメントの数は自動で付く bot のコメント（ロックのお知らせなど）を含みます。
- ソースは ../angular の 8576f161ae4（2026-09-06、22.2.0-next.7）。それより後にマージされた PR は「snapshot の後」と書きます。

## 1. 一覧（開いている 25 件と、この 1 年に閉じた 10 件）

> **🧪 issue を絞る**
>
> 2026-11-02 に gh で取ったデータを、このページの中に持っています（通信はしない）。「章」の列はこのサイトの章へのリンクで、その issue を読むときに開いておくとよい章です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-issues)

- 開いている 25 件のうち 16 件は 2022 年以前に立っています。2026 年に立ったのは #71066・#69373・#68122 の 3 件だけです。
- コメントがいちばん多いのは #46351（52）、次が #28731（44）、#43131（25）です（3 節）。
- #58971 と #57644 には `state: has PR` のラベルが付いていますが、付いている PR はどちらも閉じています（2 節）。ラベルは PR の状態に合わせて自動では外れません。

## 2. PR が付いたのに開いたまま

1. **#58971（双方向バインディングが出力の型を見ない）：直したが、入れられなかった**

   crisbeto の #59002 は 2024-12-05 に 6fd8a209788「move two-way binding fix behind flag」としてマージされましたが、本文のとおり「社内のテストで破壊的だった」のでフラグ `_checkTwoWayBoundEvents` の裏に置かれ、v20 で有効にする予定でした。2026-04-28 の 72be5be9c1d「remove checkTwoWayBoundEvents flag」がそのフラグを消し、本文には「生成するコードがかなり破壊的で、有効にする機会がなかった」とあります。issue は開いたままです（[第 12 回](12-typecheck-two-way.md)）。
2. **#57644 と #69373（入力を省くとジェネリックが any）：同じ根の 2 つ**

   JoostK の draft #57724（2024-09-08）は、2025-06-30 に「方針は妥当、社内の検査（TGP）の結果を見直す」と書いたあと動かず、2026-04-17 に bot が「28 日動きが無い」として閉じました。外部の #69819（LordKay-sudo、2026-07-16）は signal の入力だけを直す形で、作者自身が「signal とそれ以外で振る舞いを分けるべきでない」と 09-03 に閉じ、#69373 は #57644 と同じ `0 as any` の推論の問題だ、と書き残しています（[第 9 回](09-typecheck-type-constructor.md)）。
3. **#40778（keyup.Enter の $event の型）：直し方が合わない**

   arturovt の #70521（2026-09-02）に、JoostK は「イベントのパーサにはまだ扱っていない機能が多く、ときどきだけ効く形にはしたくない」と返し、PR は 09-20 に閉じました。issue は「まだ有効」として開いています（[第 11 回](11-typecheck-outputs-events.md)）。
4. **#43603（存在しない出力）：snapshot の後にオプションが入った**

   aparzi の #70527「add strictUnclaimedEventNames option to catch misspelled output bindings」が 2026-09-16 にマージされました（snapshot の後なので、このシリーズのソースには無い）。issue はまだ閉じていません。
5. **#45227（参照がメンバーを隠す）：3 本の PR**

   2023 年の #48658、2026 年の #68766 と #67226。どれも同じ「新しい拡張診断は社内で警告ではなくエラーになる」壁に当たっています（[第 18 回](18-typecheck-extended.md)の 8 節）。

## 3. 長く開いている設計の問題

- **#28731 ng-template の型引数（2019-02-14、コメント 44）**： `<ng-template let-user>` の user の型を、テンプレートの中で書く方法が無い、という要望です。2019 年のメンバーの最初の返事は「テンプレートに TypeScript を書くようなものになる」というためらいでした。2026-03-10 のコメントは「7 年たっても組み込みの方法は無く、皆が `ngTemplateContextGuard` を持つディレクティブを自作して同じ回避策に落ち着いた」とまとめています。その回避策が TCB で効く仕組みは[第 14 回](14-typecheck-template-guards.md)です。
- **#46351 `button[custom-button]` の import 忘れ（2022-06-13、コメント 52）**： pkozlowski-opensource は最初の日に「構文からは、ディレクティブの付いた button か、ただの属性の付いた button か区別できない」と答えています。2026-04-11 に JeanMeche は「チームで話し、誤検知を考えると言語サービスの拡張機能で警告するのがよい」と書き、属性ディレクティブの欠落を診断する外部の #67940 はその理由で閉じました。部分的な改善として、JeanMeche の #70626「属性ディレクティブに当たった要素でも、知らない要素名を検査する」が 2026-09-29 にマージされています（snapshot の後）。[第 17 回](17-typecheck-oob.md)の OOB の表に「知らない属性セレクタ」が無いのはこのためです。
- **#43131 Out-of-band type-checking（2021-08-12、コメント 25）**： IgorMinar の RFC で、型チェックをビルドの待ち時間の外に出す（エラーは出すが、開発中の再ビルドを待たせない）提案です。[第 17 回](17-typecheck-oob.md)の OutOfBandDiagnosticRecorder とは名前が似ているだけで別の話です。議論は 2021〜2022 年に集中し、angular/angular の PR は付いていません。型検査用のプログラムを別に作る今の仕組みは[第 4 回](04-typecheck-program-driver.md)です。

## 4. この 1 年に閉じたもの：?. の一連の修正

閉じた 10 件のうち 4 件は、JeanMeche の `?.`（安全なナビゲーション）の修正の連なりでした。

| マージ | PR | 閉じた issue | 変えたもの（gh pr view --json files） |
| --- | --- | --- | --- |
| 2026-04-09 | #67959 safe navigation が null を正しく絞る | #37619（2020 年、コメント 32） | typecheck/src/expression.ts・template\_symbol\_builder.ts・completion.ts、拡張診断の spec 2 つ、span\_comments\_spec・type\_check\_block\_spec・template\_typecheck\_spec、quick\_info\_spec |
| 2026-04-28 | #68084 ?. を含む式が undefined を返す | #37622（2020 年） | 102 ファイル。実行時の式（compiler の template pipeline の expand\_safe\_reads.ts・safe\_navigation\_migration.ts など）と TCB（compiler/src/typecheck/ops/expression.ts・api.ts）の両方と compliance のテスト。issue には「v22 で移行と一緒に」 |
| 2026-07-06 | #69621 安全な関数呼び出しに普通の ?. を使う | #69609（NG8107 の誤判定） | compiler/src/typecheck/expression.ts、optional\_chain\_not\_nullable\_spec、span\_comments\_spec、type\_check\_block\_spec、getSymbolOfNode の spec、quick\_info\_spec |
| 2026-08-07 | #70088 optional chaining の正しい式 | #70085（@for の中の NG8107） | compiler/src/typecheck/expression.ts、type\_check\_block\_spec、getSymbolOfNode の spec |

TCB の式の形（[第 7 回](07-typecheck-expressions.md)）を変えると、それを読む[拡張診断](18-typecheck-extended.md)（NG8107）と [TemplateTypeChecker](19-typecheck-template-type-checker.md)（getSymbolOfNode・quick info）が順に影響を受け、その誤検知が次の issue になり、次の PR で直る、という順でした。どの PR も type\_check\_block\_spec と getSymbolOfNode の spec を一緒に直しています。

### #71066：private が見えるようになった後

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/diagnostics_spec.ts` L751–780 （▶ の行: 751, 753, 756–757, 761, 764, 769, 778）

```ts
751 ▶     it('allow access to private members', () => {
752 │       const messages = diagnose(
753 ▶         `<button (click)="doFoo()">{{ message }}</button>`,
754 │         `
755 │         class TestComponent {
756 ▶           private message = 'Hello world';
757 ▶           private doFoo(): void {}
758 │         }`,
759 │       );
760 │ 
761 ▶       expect(messages).toEqual([]);
762 │     });
763 │ 
764 ▶     it('disallows access of a nested private member', () => {
765 │       const messages = diagnose(
766 │         `<div>{{ prop.a }}</div>`,
767 │         `
768 │         export class Model {
769 ▶           private a = 1;
770 │         }
771 │ 
772 │         export class TestComponent {
773 │           private prop =  new Model();
774 │         }      
775 │         `,
776 │       );
777 │       expect(messages).toEqual([
778 ▶         `TestComponent.html(1, 14): Property 'a' is private and only accessible within class 'Model'.`,
779 │       ]);
780 │     });
```

snapshot に入っている 48a0fd6e8a8（PR #70188「allow template to access private props」、2026-08-13）で、751〜762 行目のように `private` のメンバーをテンプレートから読んでも診断が出なくなりました。TCB の `this.message` に TypeScript が出す TS2341 を、`this` の上の読み出しのときだけ捨てる形です（捨てる場所は typecheck/src/diagnostics.ts の shouldReportDiagnostic。[第 16 回](16-typecheck-diagnostics-mapping.md)）。764〜780 行目のとおり、別のクラスの private（`prop.a`）は今もエラーです。#71066 は、これを受けて「private に触れてよいかを選べるオプションがほしい」という後続の要望で、19 のコメントの最初はメンバー（alxhub）の「こういう書き方の決まりは lint で強制するのが正しい」でした。

### #70718：閉じたが直っていない

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/testing/index.ts` L330–363 （▶ の行: 331, 335, 346, 354, 356）

```ts
330 │ > {
331 ▶   selector: string | null;
332 │   name: string;
333 │   file?: AbsoluteFsPath;
334 │   type: 'directive';
335 ▶   inputs?: {
336 │     [fieldName: string]:
337 │       | string
338 │       | {
339 │           classPropertyName: string;
340 │           bindingPropertyName: string;
341 │           required: boolean;
342 │           isSignal: boolean;
343 │           transform: DecoratorInputTransform | null;
344 │         };
345 │   };
346 ▶   outputs?: {[fieldName: string]: string};
347 │   coercedInputFields?: string[];
348 │   restrictedInputFields?: string[];
349 │   stringLiteralInputFields?: string[];
350 │   undeclaredInputFields?: string[];
351 │   publicMethods?: string[];
352 │   isGeneric?: boolean;
353 │   code?: string;
354 ▶   ngContentSelectors?: string[] | null;
355 │   preserveWhitespaces?: boolean;
356 ▶   hostDirectives?: {
357 │     directive: TestDirective & {isStandalone: true};
358 │     inputs?: string[];
359 │     outputs?: string[];
360 │   }[];
361 │   bestGuessOwningModule?: OwningModule | AmbientImport;
362 │   hasNgFieldDirective?: boolean;
363 │ }
```

NG8111（関数を呼び忘れたイベント）がホストの listener を見ない、という issue です。報告者は「直し方は分かった。でもテストをどう書けばよいか」と尋ね、そのあと自分で閉じました（PR なし）。報告者の言うとおり、typecheck/testing/index.ts の `TestDirective`（spec で宣言するディレクティブの形）には 335 行目の inputs、346 行目の outputs、356 行目の hostDirectives はあっても、**host のバインディングの欄がありません**。ホストバインディングの型チェックは test/ngtsc/host\_bindings\_type\_check\_spec.ts（it 39 本）が `NgtscTestEnvironment` でファイルを書いて確かめているので、手元で試すならそちらの形です。拡張診断がホストを見ないのは extended\_template\_checker.ts が `getTemplate` しか呼ばないからで（[第 18 回](18-typecheck-extended.md)の 3 節）、main でも同じでした。

## 5. 誰が直しているか（snapshot までの 1 年）

`git log --since=2025-09-06 -- packages/compiler/src/typecheck packages/compiler-cli/src/ngtsc/typecheck` は 144 件で、Kristiyan Kostadinov 56、Matthieu Riegler（JeanMeche）21、Andrew Scott 15、Leon Senft 14（名前の書き方が 2 通り）、SkyZeroZx 9、Alex Rickabaugh 6 でした。題の種類は refactor 64・fix 50・feat 18・Revert 6 ほか。

- **SkyZeroZx の 9 件**は、外部の貢献者がこの場所で続けて入れた例です。563dbd998c8（2025-10-02、@defer の trigger の拡張診断 NG8021）から始まり、f90e5565e07（defer の trigger の式の呼び忘れ）、8edcf417608・b19fda0b153・7f9450219f5（@defer の trigger の警告を 1 つずつ）、ca67828ee24（NG8023、[第 17 回](17-typecheck-oob.md)）と、同じ話題を少しずつ広げています。snapshot の後には #63705（NG8119）も入りました。
- 大きな移動の commit：7fa274510fc（2026-04-13、TCB の生成を compiler へ）、13c8df67d9b（2026-04-03、SymbolBuilder を ts.TypeChecker から切り離す）、f3c471e0d50（2026-03-23、fullTemplateTypeCheck を消す）。古い issue のコメントに出てくるファイルの場所は、これらの前のものであることが多いので、`git log --follow` で今の場所を確かめてから読みます。

## 6. どの issue から読むか

1. **TCB の形がそのまま答えになるもの**

   #59116・#58971（[第 12 回](12-typecheck-two-way.md)）、#40778（[第 11 回](11-typecheck-outputs-events.md)）。共通の部品（typecheck-tcb.ts）のデモや type\_check\_block\_spec の `tcb()` で、issue のテンプレートがどんな TCB になるかを先に見ると、何が問題かが文字で分かります。
2. **型の推論の issue**

   #57644・#69373（[第 9 回](09-typecheck-type-constructor.md)）、#28731・#46749（[第 14 回](14-typecheck-template-guards.md)）。型コンストラクタとガードの仕組みを読んでから。
3. **拡張診断の要望**

   #68122・#45227・#48117（[第 18 回](18-typecheck-extended.md)）。技術より「社内で新しい警告が出せるか」で止まる、という前提を知ってから読みます。
4. **設計の議論**

   #46351・#43131・#71066。コメントの多い順に、メンバーのコメントだけを先に拾うと流れがつかめます（`gh issue view N --json comments -q '.comments[] | select(.authorAssociation=="MEMBER")'`）。

## 7. テストと直し方（シリーズのまとめ）

このシリーズで出てきた spec を、どの章の仕組みを確かめるかで並べます（it の数は `grep -cE '^\s*it\('`、../angular 8576f161ae4）。

| spec | it | ターゲット | 主な章 |
| --- | --- | --- | --- |
| typecheck/test/type\_check\_block\_spec.ts | 198 | //packages/compiler-cli/src/ngtsc/typecheck/test:test | TCB の形（[6](06-typecheck-scope.md)〜[15](15-typecheck-refs-pipes.md)） |
| typecheck/test/diagnostics\_spec.ts | 69 | 同上 | 診断の文と場所（[16](16-typecheck-diagnostics-mapping.md)・[17](17-typecheck-oob.md)） |
| typecheck/test/span\_comments\_spec.ts | 32 | 同上 | 位置コメント（[16](16-typecheck-diagnostics-mapping.md)） |
| typecheck/test/type\_checker\_\_get\_symbol\_of\_template\_node\_spec.ts | 86 | 同上 | [19](19-typecheck-template-type-checker.md) |
| typecheck/test/type\_checker\_\_completion\_spec.ts | 4 | 同上 | [19](19-typecheck-template-type-checker.md) |
| typecheck/extended/test/checks/&lt;名前&gt;/…\_spec.ts（16 本） | 検査ごと | //packages/compiler-cli/src/ngtsc/typecheck/extended/test/checks/&lt;名前&gt;:test | [18](18-typecheck-extended.md) |
| test/ngtsc/template\_typecheck\_spec.ts | 307 | //packages/compiler-cli/test/ngtsc:ngtsc（必ず --filter） | ngtsc 全体を通した診断（全章） |
| test/ngtsc/extended\_template\_diagnostics\_spec.ts | 11 | 同上 | [18](18-typecheck-extended.md) |
| test/ngtsc/host\_bindings\_type\_check\_spec.ts | 39 | 同上 | ホストバインディング（4 節の #70718） |
| test/ngtsc/incremental\_typecheck\_spec.ts | 25 | 同上 | 作り直し（[4](04-typecheck-program-driver.md)） |
| language-service/test/quick\_info\_spec.ts | 106 | //packages/language-service/test:test | ホバー（[19](19-typecheck-template-type-checker.md)） |

- 走らせ方は `pnpm bazel test <target> --nocache_test_results --test_output=all '--test_arg=--filter=<describe か it の文字列>'`。フィルタは正規表現で、0 本でも PASSED になるので「Ran N of M」を見ます。
- compiler-cli の spec の多くは `runInEachFileSystem` で 4 つの仮想ファイルシステムごとに同じ it を登録するので、走る本数は書かれた it の 4 倍前後になります（[第 18 回](18-typecheck-extended.md)の 9 節で 6 → 24、18 → 72）。
- このシリーズでは本家に PR を出すことは勧めません。issue を読むときは、まず関係する章のデモで TCB を作り、spec のターゲットを手元で走らせて「今の振る舞い」を自分の目で確かめる、までにします。

### issue になっていない食い違い（第 17〜19 回で見つけたもの）

- **呼ばれない `suboptimalTypeInference`**：compiler/src/typecheck/oob.ts:113 のインタフェースと compiler-cli の実装（NG10002）が残っていますが、呼ぶ側は f3c471e0d50 で消えています（[第 17 回](17-typecheck-oob.md)の 3 節）。main でもインタフェースは残っていて（main の compiler/src/typecheck/oob.ts:114。`gh api …/contents/…?ref=main` で読んだ）、`gh search code` で見た範囲では呼ぶ場所はありませんでした。同じ名前で探した issue・PR はありません（2026-11-02）。
- **ExtendedTemplateCheckerImpl が受け取る `ts.TypeChecker`**：コンストラクタの引数として渡され ctx に入りますが、16 の検査のどれも使っていません（[第 18 回](18-typecheck-extended.md)の 4 節）。外から足す検査（#48117）のために残っているのかどうかは、コードからは分かりません。

## 聞かれそうな質問

**Q. PR が付いているのに issue が閉じないのはなぜですか？**

この 2 つのラベルでは、多くが「社内のコードで破壊的だった」か「直し方の方針が合わない」です。#58971 は修正がフラグの裏でマージされたまま、フラグごと消されました（6fd8a209788 → 72be5be9c1d）。#40778 の #70521 は方針が合わずに閉じ、#57644 の #57724 は draft のまま bot に閉じられました（2 節）。

**Q. テンプレート型チェックの issue は、どのファイルを直すことが多いですか？**

この 1 年に閉じたものでは compiler/src/typecheck/expression.ts（TCB の式）が多く、spec は type\_check\_block\_spec と getSymbolOfNode の spec がほぼ必ず一緒に動いています（4 節の表）。拡張診断なら checks/&lt;名前&gt;/index.ts とその spec です（#70656）。

**Q. テンプレートから private メンバーを読めるのはいつからですか？**

48a0fd6e8a8（PR #70188、2026-08-13）からで、このシリーズの snapshot に入っています。diagnostics\_spec.ts の 751〜762 行目が「読んでも診断が出ない」ことを、764〜780 行目が「別のクラスの private はエラーのまま」を確かめています。

**Q. #43131 の Out-of-band と、第 17 回の OutOfBandDiagnosticRecorder は関係がありますか？**

ありません。#43131 はビルドの待ち時間から型チェックを外す提案で、OutOfBandDiagnosticRecorder は「TCB を TypeScript に読ませるのとは別の道で出す診断」の記録係です（3 節、[第 17 回](17-typecheck-oob.md)）。

## 読み終えて

- 開いている 25 件の半分以上は 2022 年以前。長く開いているものは、構文から区別できない（#46351）・テンプレートに型を書く方法が無い（#28731）といった設計の問題。
- PR が付いても閉じない理由は、社内のコードで破壊的になることと、直し方の方針が合わないことが多い。`state: has PR` のラベルは古いことがある。
- この 1 年の修正は ?. の一連のように、TCB の式 → 拡張診断 → TemplateTypeChecker と連鎖する。spec も同じ組で動く。
- issue を読むときは、関係する章のデモで TCB を作り、spec のターゲットを --filter で走らせて今の振る舞いを確かめてから。

---

← 前: [TemplateTypeChecker：言語サービスが型を尋ねる窓口](19-typecheck-template-type-checker.md)  
次: [言語サービスの全体像：拡張・サーバー・プラグイン・LanguageService](../ls/01-ls-overview.md) →
