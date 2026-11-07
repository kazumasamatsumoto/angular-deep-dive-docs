[目次](../README.md) › [マイグレーションの内側](README.md) › 第 20 回 / 全 20 回

# issue と PR を読む：マイグレーションの今

> area: migrations のラベルで開いている issue と、この 1 年に閉じた issue の表。マイグレーションが 2 回走る、制御フローの移行で ng-content や i18n が壊れる、standalone の移行が長い、など。どの issue がこのシリーズのどの章の行に関係するか。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-issues)

---

最終回は、マイグレーションの「今」を issue と PR から読みます。ラベル `area: migrations` で開いている 5 件と 2025-11-01 以降に閉じた 23 件に、ラベルの無いものを題の言葉で探して足した 5 件を加え、合わせて開いている 6 件・閉じた 27 件を表にします。開いているものは議論と付いた PR を、閉じたものは直した commit とその章を、gh と git で読んだ事実だけで並べます。最後に、このシリーズで本物のバンドルを走らせて見つけた「不具合らしきもの」と、シリーズの spec の一覧を置きます。

読む対象は GitHub の angular/angular の issue と PR（`gh` で読むだけ）と `git -C ../angular log` です。この章にはソースの引用はありません。行は各章で引用したものを指します。

1. [1. 全体像](01-mig-overview.md)
2. [2. 入口と配布物](02-mig-entry-bundles.md)
3. [3. プログラムを作る](03-mig-program.md)
4. [4. Tsurge](04-mig-tsurge.md)
5. [5. 置き換え](05-mig-replacements.md)
6. [6. テンプレート](06-mig-templates.md)
7. [7. signal input の段階](07-mig-signal-input-passes.md)
8. [8. 参照の書き換え](08-mig-signal-input-references.md)
9. [9. 移行できない入力](09-mig-signal-input-incompatible.md)
10. [10. signal クエリ](10-mig-signal-queries.md)
11. [11. output()](11-mig-output.md)
12. [12. 制御フロー](12-mig-control-flow.md)
13. [13. inject()](13-mig-inject.md)
14. [14. テンプレートの書き換え](14-mig-template-rewrites.md)
15. [15. 使っていない import](15-mig-cleanup-imports.md)
16. [16. ルーティング](16-mig-routing.md)
17. [17. v22（1）既定](17-mig-v22-defaults.md)
18. [18. v22（2）?.](18-mig-v22-safe-navigation.md)
19. [19. テスト](19-mig-testing.md)
20. **20. issue と PR を読む**（この章）

## 0. データの取り方

📄 `ターミナル（読むだけ）`

```
# ラベル area: migrations の issue（開いている / 2025-11-01 以降に閉じた）
gh issue list -R angular/angular --label 'area: migrations' --state open \
  --limit 100 --json number,title,createdAt,comments,labels
gh issue list -R angular/angular --label 'area: migrations' --state closed \
  --search 'closed:>=2025-11-01' --limit 200 --json number,title,createdAt,closedAt
# ラベルの無いものを、題の言葉で広げる
gh search issues --repo angular/angular "migration in:title" --state open --limit 100 \
  --json number,title,createdAt,labels,commentsCount
gh search issues --repo angular/angular "migration in:title" --state closed \
  --closed '>=2025-11-03' --limit 200 --json number,title,createdAt,closedAt,labels,commentsCount
gh search issues --repo angular/angular "schematic in:title" --state open --limit 100 \
  --json number,title,createdAt,labels,commentsCount
# 1 つの issue の議論と、番号を書いた PR
gh issue view 71147 -R angular/angular --comments
gh pr list -R angular/angular --state all --search 71147
# 直した commit がスナップショット（8576f161ae4）に入っているか
git -C ../angular log --format='%h %ad %s' --date=short -F --grep=68500 -- packages/core/schematics
```

- 取った日は 2026-11-03。ソースは ../angular の 8576f161ae4（2026-09-06、22.2.0-next.7）で、main は 92c7e870caa（2026-11-03）でした。
- ラベルで取れたのは開いている 5 件と閉じた 23 件です。`gh search issues` の題の検索（migration・migrate・schematic・ng update）で足したのは、開いている #63903（ラベルは language-service）と、閉じた #67631（area: core）・#66648・#65941・#64854（ラベル無し）の 5 件です。マイグレーションでない話（アニメーションの移行の道、v16 への更新の後のエラー、移行ガイドの文書の issue など）は入れていません。
- コメントの数は bot の投稿（自動のロックなど）を含みます。
- 「直した commit」は `git log -F --grep=番号` で issue の番号を書いた commit を探したものです。番号を書いていない commit は見つけられないので、空でも「直っていない」とは限りません（PR の番号は `gh pr list --search` で探しました）。

## 1. 一覧

> **🧪 issue を絞る**
>
> 2026-11-03 に gh で取ったデータを、このページの中に持っています（通信はしない）。「章」の列は、その issue を読むときに開いておくとよい章です（シリーズの外の章もあります）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/mig-issues)

- 開いている 6 件のうち 4 件は 2025-08 より前に立っています。いちばん古いのは #49193（2023-02-24、standalone の移行）です。
- 閉じた 27 件のうち NOT\_PLANNED が 6 件、DUPLICATE が 3 件です。v22 の更新（2026-05〜07）のころに立ったものが多く、#69174・#69527 の rootDir、#68500 の重複、#69274 の不要な書き換え、#69837 の Angular でない tsconfig がそれです。
- standalone の移行の古い issue（#48941・#48950・#50483・#50886）が 2026-07〜10 にまとめて閉じられています。

## 2. 開いている issue を読む

1. **#71147 signal-queries と ngstyle-to-style が 2 回以上走る（2026-10-02、コメント 0）**

   報告者は、ライブラリのように 1 つの .ts が複数の tsconfig（build と spec など）に入るプロジェクトで `signal-queries-migration` を走らせると、クエリのフィールドと import が重複する、と書いています。前に signal-input と signal-queries で同じことがあった #61337（2025-05 に閉じた）を挙げています。付いている PR は外部の MeAkib の #71151（2026-10-03、開いている）で、本文は「クエリをプログラムの全ファイルから集めていて、今の単位のファイルに限っていなかった」です。../angular の signal-queries-migration/migration.ts の `migrate()` を読むと、`sourceQueries` を `info.fullProgramSourceFiles` のすべてを歩いて集めていて、Tsurge の Complex の形なので `migrate()` は tsconfig ごとに呼ばれます。だから 2 つの tsconfig に入るファイルのクエリが 2 回書き換えられます。JeanMeche は最初「#59656 / #60065 と同じ方法で（置き換えの重複を除く）」とレビューし、そのあと「`run_in_devkit.ts` の `modifyProgramInfoToEnsureNonOverlappingFiles` がもう単位ごとのファイルを分けているので、`migrate()` の中で単位のファイルに絞る元の方法が根本の直し方だった」と書き直しています。MeAkib は 2026-10-29 に、JeanMeche が挙げた spec だけに入るファイルの 2 点のうち 1 点（spec の中の `new SomeDirective()` などを見落とす）を直し、もう 1 点（spec の中のサブクラスの上書き）は段階の作りを変えるので別の PR にしたい、と返しています。仕組みは[第 10 回](10-mig-signal-queries.md)、単位とファイルの割り当ては[第 4 回](04-mig-tsurge.md)です。ngstyle-to-style のほうは報告者が最小の再現を作れておらず、PR も触れていません。
2. **#60899 制御フローの移行と i18n（2025-04-17、コメント 3）**

   `i18n` の要素の中の `<ng-container *ngIf>` を移行すると、翻訳の placeholder が `START_NG_CONTAINER` から `START_BLOCK_IF` に変わってビルドで正しく失敗します。ところがそこに `ng-container` を足して戻すと、ビルドは通って実行時に壊れる、という報告です。JeanMeche が 2025-10-01 に「制御フローの移行はこの使い方を壊すべきでない」として migrations のラベルを足しました。外部の anchmelev の #67768（compiler で翻訳の structural placeholder の欠けを報告する）は、2026-04-02 にメンバーの dgp1130 が「正しそうだが複雑さと影響に対して今は優先できない。issue は開けておく」と書いて閉じています。移行の側は[第 12 回](12-mig-control-flow.md)です。
3. **#56037 制御フローの移行のあと ng-content が効かない（2024-05-23、コメント 1）**

   `*ngIf="...; else deafultTemplate"` の else の `ng-template` の中身が `<ng-content>` で、同じテンプレートを `*ngTemplateOutlet` でも使っている形です。移行は `@else` の中に `<ng-content>` をコピーし、元の `ng-template` も残すので、`<ng-content>` が 2 つになります。メンバーのコメントはなく、ラベルは「needs more investigation」です。
4. **#62788 standalone の移行の進み具合（2025-07-24、コメント 2）**

   crisbeto は「時間のほとんどは TypeScript のコンパイラの初期化で、それは 1 回の同期の関数呼び出しなので進み具合を出せない」と答え、tomer953 は「初期化は無理でも、分析と移行の間は出せる」と返しています。プログラムを作る所は[第 3 回](03-mig-program.md)、standalone の移行は[NgModule の章](../ngmodule/18-ngmodule-to-standalone.md)です。
5. **#49193 standalone の移行がいろいろな場合に失敗する（2023-02-24、コメント 1）**

   crisbeto は「生成される import のパスの問題は、同じ処理を使う言語サービスにも当てはまる」と書いています。PR はありません。
6. **#63903 拡張にマイグレーションの画面を（2025-09-18、コメント 7。ラベルは language-service）**

   JeanMeche は「Nx を入れずにできるべきで、フレームワークにとって価値がある」と書いています。言語サービスの中でマイグレーションを動かしている今の例は[リファクタリングの章](../ls/19-ls-refactorings.md)です。

> [!NOTE]
> **ポイント**
>
> #71147 は、本文に「2 回走る」と書かれていても、原因は「ng update が 2 回走らせる」ではなく「1 回の実行の中で tsconfig ごとに同じファイルを書き換える」でした。`run_in_devkit.ts` がファイルを単位に 1 つずつ割り当てても、マイグレーションの側が `fullProgramSourceFiles`（全部）と `sourceFiles`（自分の単位）のどちらを歩くかで結果が変わります。同じことを見るには、safe-optional-chaining の combine の重複の除去（[第 18 回](18-mig-v22-safe-navigation.md)の 5 節）と比べてください。

## 3. 閉じたもの：v22 の更新のころ

### #69174・#69527「Path ... does not exist」→ 26b0c719eff（#69194）

v22 に上げると、最初の Tsurge のマイグレーション（change-detection-eager）が「Migration failed: Path "app/app.ts" does not exist」で止まる、という報告です。#69174 で外部の aparzi が「tsconfig.app.json の `rootDir` が `./src` だと起きる。`runMigrationInDevkit` を使うすべてのマイグレーションに当てはまる」と突き止め、報告者は「TypeScript が rootDir を書けと言うので ./src にしていた」と書いています。#69174 は 2026-06-05 に NOT\_PLANNED で閉じられましたが、aparzi の #69194（「resolve migration failure when tsconfig specifies rootDir」）が 2026-06-26 に merge され（commit は 26b0c719eff、run\_in\_devkit.ts と run\_in\_devkit.spec.ts）、#69527 はその重複として閉じられました。ファイルの位置の扱いは[第 3 回](03-mig-program.md)です。

### #69837 Angular でない tsconfig を書き換える → f72600eaddf

JeanMeche は「ng update では見つけた tsconfig をすべて移行している。angular.json のターゲットが参照するものとその親だけにできる」と書き、外部の lazerg の f72600eaddf（2026-07-20）が `getProjectTsConfigPaths` に `angularBuildersOnly` を足して、strict-templates-default と strict-safe-navigation-narrow がそれを使うようにしました（[第 17 回](17-mig-v22-defaults.md)の 2 節）。

### #68500 withNoIncrementalHydration が重複 → b723734b72c

`ng update --next` で next 版ごとにマイグレーションが走り、`withNoIncrementalHydration()` が 2 つ入った、という報告です。b723734b72c（2026-05-01）が「すでに `withNoIncrementalHydration()` があれば足さない」検査を足しました（[第 17 回](17-mig-v22-defaults.md)の 4 節）。同じ報告者は「とっくに fetch に移ったのに withXhr が入った」とも書いています（第 17 回の 3 節の note）。

### #69220 OnPush を消してほしい → NOT\_PLANNED

JeanMeche の答えは「どのマイグレーションを走らせたかを記録する手段が今は無く、Eager のマイグレーションの冪等さに `OnPush` があることを使っている」「CLI のマイグレーションの流れを改める件が backlog にあり、それができれば一度だけ走らせるものが作れる」です（[第 17 回](17-mig-v22-defaults.md)の 1 節）。

### #69274 != null まで書き換える → 6b0150faad1、#67340 model + output → 8f8972b0fde

#69274 は safe-optional-chaining の `visitBinary` に `==`・`!=` を足した変更で直りました。#67340 は PR #65952（同名の input / output をコンパイラのエラーにする BREAKING CHANGE）のあとに google3 で見つかった形のマイグレーションの要望で、aparzi が model-output を足しました。どちらも[第 18 回](18-mig-v22-safe-navigation.md)です。

### #71000 ActivatedRoute の snapshot を入力のバインディングに → NOT\_PLANNED

`route.snapshot.paramMap.get('id')` などを `withComponentInputBinding()` の入力に変えるマイグレーションの提案と、同じ人の PR #71002 です。JeanMeche は「ふちの場合が多すぎるので、エージェントに任せたほうがよい種類の移行」と答えて閉じました。ルーティングのマイグレーションの今の範囲は[第 16 回](16-mig-routing.md)です。

## 4. このシリーズで見つけた「不具合らしきもの」

第 16〜18 回では、bazel でビルドした本物のバンドル（bazel-bin の packages/core/schematics/bundles/\*.cjs）を、spec と同じ形（`SchematicTestRunner` と一時ディレクトリ）で走らせて確かめました。../angular のファイルは変えていません。どれも `gh search issues` / `gh search prs` で同じ報告は見つかりませんでした（2026-11-03）。**本家に issue や PR を出すことは勧めません。**手元で同じ形を spec にして確かめ、issue を読むときの手がかりにします。

| マイグレーション | 入力の形 | 結果 | 行（章） |
| --- | --- | --- | --- |
| route-lazy-loading | `import * as cmps` と `component: cmps.X` | TypeError で止まる | to-lazy-routes.ts 300・303（[第 16 回](16-mig-routing.md)） |
| route-lazy-loading | 同じ import 宣言にほかの名前がある | 宣言ごと消え、ほかの名前が未定義 | to-lazy-routes.ts 201〜203 |
| route-lazy-loading | `Router` を class で宣言した型の `resetConfig(routes)` | ルートの配列を見つけない | util.ts 100 |
| router-testing-module-migration | `providers` にもう `provideLocationMocks()` がある | 2 つになる | utils.ts 427〜432 |
| change-detection-eager | `describe` の中の `@Component` | Eager が足されない（v22 で OnPush に） | migration.ts 55（[第 17 回](17-mig-v22-defaults.md)） |
| strict-templates-default | `"extends": ["./tsconfig.json"]` | path.join の TypeError で止まる | index.ts 28 |
| strict-templates-default | `"extends": "./tsconfig"`（.json を書かない） | 親が true でも子に false を書く | index.ts 16・28 |
| http-xhr-backend | `provideHttpClient(withRequestsMadeViaParent())` | `withXhr()` を足し、開発モードで Configuration error になる組にする | migration.ts 80〜95 |

ほかに、動きを変えない食い違いもありました。router-testing-module-migration の README と collection.json の説明が `provideRouter()` と書いていること（コードは `RouterModule`）、http-xhr-backend の migrations.json の説明が「HttpXhrBackend を使っているとき」と書いていること、`legacyOptionalChaining` の説明の向きが逆なこと、safe-optional-chaining の使われていない `hasNullCheckInAST` です。

## 5. 誰が直しているか（スナップショットまでの 1 年）

`git log --since=2025-09-06 -- packages/core/schematics` は 90 件で、題の種類は fix 39・refactor 26・feat 16・build 5 ほかでした。書いた人は Matthieu Riegler 23、aparziale 17、Kristiyan Kostadinov 9、SkyZeroZx 7、Alan Agius 7、tmpln 4、Suraj Yadav 3、Andrew Scott 3 の順です。

- **aparziale の 17 件**は、外部の貢献者が issue を 1 つずつ直した例です。rootDir（26b0c719eff）、ビルドとテスト以外のターゲットを飛ばす（58efd86c78f）、複数プロジェクトの inject-migration（a73b4b7c30a）、registerLocaleData（bdc09e8183a）の fix と、v22 の strict-templates-default（682aaf943fe）・strict-safe-navigation-narrow（6a435658e25）・model-output（8f8972b0fde）の feat があります。issue のコメントで「再現した、原因はここ」と書いてから PR を出す順で進めています（#69174）。
- **Matthieu Riegler**は v22 の新しいマイグレーション（safe-optional-chaining・change-detection-eager）と、その冪等さの直し（6038b9ede73・12b3a1a755d・b723734b72c）が中心です。
- **SkyZeroZx・Suraj Yadav・Rishabhdeep Singh**の fix は、prune の推移的な参照（0a5a2b768c5）、then / else の判定（5ad82313975）、ngClass の import と空白のキー（223e40279f3・49672c437b4）、ngClass のカンマ（b395173cf20）のように、1 つの issue に 1 つの commit です。

## 6. issue を読む手順

1. **メンバーのコメントだけを先に拾う**

   `gh issue view N -R angular/angular --json comments -q '.comments[] | select(.authorAssociation=="MEMBER")'`。#69220 のように、方針（「記録の手段が無い」）がメンバーの 1 つのコメントに書かれていることが多いです。
2. **どのマイグレーションの、どの関数の、どの行の話かを決める**

   1 節の表の「章」の列から開きます。#71147 なら第 10 回の `migrate()` と、第 4 回の単位の割り当て。
3. **報告の形を spec にする**

   Tsurge のものは `runTsurgeMigration` にファイルを並べ、古い形のものは `UnitTestTree` か `SchematicTestRunner` に置きます（[第 19 回](19-mig-testing.md)）。4 節のように、ビルド済みのバンドルを一時ディレクトリで走らせる方法もあります。
4. **--filter で走らせ、本数を見る**

   フィルタは describe / it の名前の正規表現で、0 本でも PASSED になります。test:test は 16 shard に分かれるので、「Ran N of M」の N を足します。
5. **直った issue は commit からたどる**

   `git log -F --grep=番号 -- packages/core/schematics` で commit を探し、`git show --stat` で変えたファイルと spec を見ます。3 節の修正は、どれも同じ commit で spec を足しています（b723734b72c の hydration の spec、f72600eaddf の 3 つの spec）。

## テストと直し方（シリーズのまとめ）

`pnpm bazel test //packages/core/schematics/...` は 67 ターゲットで、2026-11-03 にすべて PASSED でした（初回のビルド込み）。主なターゲットと、それを読む章です。

| ターゲット | 中身 | 主な章 |
| --- | --- | --- |
| //packages/core/schematics/test:test（16 shard、29.2 秒） | test/\*\_spec.ts。ng generate 系（standalone\_routes・router-testing-module-migration・control\_flow・inject・queries など）と all-migrations.spec.ts。bundles の .cjs を SchematicTestRunner で走らせる | 第 1・2・10〜16・19 回 |
| //packages/core/schematics/migrations/&lt;名前&gt;:test | ng update 系の 8 つと output-migration・self-closing-tags-migration・signal-queries-migration の spec（runTsurgeMigration か UnitTestTree） | 第 10・11・14・17・18 回 |
| //packages/core/schematics/migrations/signal-migration/test:test・:test\_best\_effort・:test\_jasmine | signal-migration のゴールデンと migration\_spec.ts | 第 7〜9・19 回 |
| //packages/core/schematics/ng-generate/ngclass-to-class-migration:test | ngclass-to-class の spec | 第 14 回 |
| //packages/core/schematics/utils/tsurge/test:test・utils/tsurge/helpers/angular\_devkit:test | Tsurge の段階と run\_in\_devkit（rootDir の spec を含む） | 第 3〜5 回 |

第 16〜18 回で走らせたもの（2026-11-03）：

| ターゲット | フィルタ | 本数 | 時間 | 章 |
| --- | --- | --- | --- | --- |
| test:test | route lazy loading migration | 19（18 + xit 1） | PASSED in 2.0s | [第 16 回](16-mig-routing.md) |
| test:test | Router testing migration | 19 | PASSED in 1.7s | [第 16 回](16-mig-routing.md) |
| migrations/change-detection-eager:test | ChangeDetectionEager migration | 6 | PASSED in 1.0s | [第 17 回](17-mig-v22-defaults.md) |
| migrations/strict-templates-default:test | strict-templates-default migration | 9 | PASSED in 0.4s | [第 17 回](17-mig-v22-defaults.md) |
| migrations/http-xhr-backend:test | . | 4 | PASSED in 0.6s | [第 17 回](17-mig-v22-defaults.md) |
| migrations/incremental-hydration:test | . | 3 | PASSED in 1.0s | [第 17 回](17-mig-v22-defaults.md) |
| migrations/safe-optional-chaining:test | SafeOptionalChainingMigration | 29 | PASSED in 0.7s | [第 18 回](18-mig-v22-safe-navigation.md) |
| migrations/strict-safe-navigation-narrow:test | strict-safe-navigation-narrow migration | 6 | PASSED in 0.3s | [第 18 回](18-mig-v22-safe-navigation.md) |
| migrations/model-output:test | . | 8 | PASSED in 1.0s | [第 18 回](18-mig-v22-safe-navigation.md) |
| migrations/can-match-snapshot-required:test | . | 4 | PASSED in 1.0s | [第 18 回](18-mig-v22-safe-navigation.md) |

このシリーズでは本家に PR を出すことは勧めません。issue を読むときは、関係する章の行と spec で「今の振る舞い」を自分の目で確かめる、までにします。

## 聞かれそうな質問

**Q. v22 に上げたら「Migration failed: Path ... does not exist」で止まりました。**

#69174・#69527 と同じ形なら、tsconfig.app.json の `rootDir` が原因でした。aparzi の #69194（26b0c719eff）が 2026-06-26 に merge されたので、それを含む版の `@angular/core` のマイグレーションでは直っています（3 節）。

**Q. v22 の更新で OnPush の記述が消えないのはなぜ？**

#69220 で JeanMeche が答えたとおり、どのマイグレーションを走らせたかを記録する手段が無く、change-detection-eager の冪等さに `OnPush` の記述を使っているからです。消すのは find/replace で十分、とも書かれています（atscott）。

**Q. #71147 は ng update が同じマイグレーションを 2 回呼んでいるのですか？**

いいえ。1 回の実行の中で、signal-queries-migration の `migrate()` が tsconfig ごとに呼ばれ、そのたびにプログラムの全ファイル（`fullProgramSourceFiles`）のクエリを書き換えているのが原因です（2 節）。PR #71151 は自分の単位のファイルに絞る形で、2026-11-03 の時点で開いています。

**Q. issue が NOT\_PLANNED で閉じたのに、直す PR が merge されたのはなぜ？**

#69174 は 2026-06-05 に NOT\_PLANNED で閉じられ、そのあと外部の aparzi の #69194 が 2026-06-26 に merge されました。issue の状態と PR は別々に動くので、`gh pr list --search 番号` で PR の側も確かめます。

## 読み終えて

- area: migrations で開いているのは 5 件（ほかに関係するもの 1 件）。制御フローの移行と standalone の移行の古いものが多く、新しいものは #71147（Tsurge の単位とファイル）。
- v22 の更新のころの issue は、rootDir・重複・不要な書き換え・Angular でない tsconfig で、どれも「同じプロジェクトの形が spec に無かった」ものが commit の spec で足されて直った。
- 外部の貢献者（aparziale ほか）が、issue のコメントで原因を突き止めてから小さな fix と spec を組で出している。
- 本物のバンドルを一時ディレクトリで走らせると、spec の stub では通る分岐の取りこぼしが見える（4 節の 8 つ）。本家に出す前に、手元で spec の形にして確かめる。

---

← 前: [マイグレーションのテスト：SchematicTestRunner とゴールデン](19-mig-testing.md)  
次: [i18n の全体像：i18n 属性から画面の翻訳文まで](../loc/01-loc-overview.md) →
