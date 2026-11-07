[目次](../README.md)

# コントリビュートの道

> angular/angular に変更を出して、マージされるまで

ここまでのシリーズで Angular の中を読めるようになりました。このシリーズは、読んだ先で「直す」ための道のりです。リポジトリのどこに何があるか、pnpm と Bazel でどうビルドしてテストを 1 本走らせるか、spec をどう読みどう書くか、公開 API の golden、コミットメッセージの規約と CHANGELOG、PR の CI とラベルとレビュー、ブランチとリリースの列車、issue の仕分けと最初に手を付ける issue の選び方。最後に、実際のリポジトリで見つけた小さな食い違いを題材に、最初の PR までを通しで練習します。

全 15 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/contrib)

1. [貢献の全体像：issue から CHANGELOG まで](01-contrib-overview.md)  
   バグを見つけてから修正がリリースノートに載るまでの道のり（issue と最小の再現 → 設計の相談 → fork とブランチ → 変更とテスト → コミット → PR → CI と CLA → レビュー → merge ラベル → caretaker のマージと Google 内部のテスト → リリース）。CONTRIBUTING.md の「受け入れられる PR の条件」を 1 つずつ読み、どの回がどこを扱うかの地図。
2. [リポジトリの地図：packages・goldens・tools・adev はどこに何があるか](02-contrib-repo-map.md)  
   angular/angular の最上位のディレクトリ（packages / modules / integration / adev / goldens / tools / scripts / devtools / vscode-ng-language-service / dev-app / third\_party / contributing-docs / .ng-dev / .github、AI エージェント向けの AGENTS.md と skills）の役割と、packages.bzl で決まる npm に出るパッケージの一覧、packages の中のパッケージごとの src と test の対応。このサイトで読んできた章の対象ファイルが地図のどこにあるか、変更したいときに最初に開くべき場所とテストのターゲット。CLI と Material/CDK が別リポジトリであること。
3. [手元の準備：Node・pnpm・Bazel をそろえる](03-contrib-setup.md)  
   .nvmrc と package.json の engines・packageManager で決まる Node と pnpm の版、pnpm install が pnpm-workspace.yaml と .pnpmfile.cjs で何をするか（husky で置く git のフックを含む）、bazelisk が .bazelversion の Bazel を取ってくる仕組み、Bazel が MODULE.bazel で自分専用の Node と npm パッケージを持ってくること、.bazelrc の設定。実際にこのマシンで pnpm install と最初の bazel test を走らせたときの時間・ディスク・出力。
4. [Bazel の読み方：BUILD.bazel・ターゲット・ラベル](04-contrib-bazel.md)  
   BUILD.bazel に並ぶ ts\_project・ng\_project・zoneless\_jasmine\_test・zoneless\_web\_test\_suite などの規則と、//packages/forms/test:test のようなラベルの読み方。tools/defaults.bzl が規則を包んで tsconfig の選択と strict deps の検査を足している理由、依存（deps）を書かないと import できない理由（sandbox と strict deps）、bazel query / cquery で「このファイルを含むターゲット」「この変更で走るテスト」を探す方法、キャッシュの場所と消し方。
5. [テストを 1 本走らせる：bazel test と fit・--test\_filter](05-contrib-run-tests.md)  
   bazel test でターゲットを走らせ、dist/testlogs の test.log と test.xml で結果を読む流れ。Node（domino）で走るテストとブラウザ（Web Test Runner）で走るテストの違い、1 つの it だけを走らせる --test\_arg=--filter=（--test\_filter は効かない）と fit / fdescribe、--test\_output=streamed、--config=debug、ibazel による保存のたびの再実行。実際に packages/forms のテストを走らせた出力。
6. [spec の読み方：Angular のテストはどう書かれているか](06-contrib-reading-specs.md)  
   packages/core/test や packages/forms/test の spec の書き方。spec の探し方と、describe と it の文を並べて仕様として読む方法、TestBed でコンポーネントを宣言するテスト、AGENTS.md の zoneless の「Act → Wait → Assert」（detectChanges でなく await fixture.whenStable）がなぜそうなのかを ComponentFixture の実装で確かめる。packages/private/testing の useAutoTick と timeout、zone.js の無い target で fakeAsync が使えない理由、コンパイラの compliance テスト（TEST\_CASES.json が結ぶ入力と期待する出力のファイル）。
7. [テストを書いてみる：壊して、失敗を見て、直す](07-contrib-writing-a-test.md)  
   FormControl の reset(…, {emitEvent: false}) で FormResetEvent が出ないことを確かめる spec を form\_control\_spec.ts に 1 本足し、このマシンで実際に走らせた記録で追う練習。足して通す → 実装をわざと壊して失敗の出力（Expected true to be false. とスタックの行）を読む → 既存の統合テストも同時に落ちたことから「足す前に既存のテストを探す」 → 元に戻して通す。どの describe に足すか、名前の付け方、git diff で変更がテストだけかを確かめる。
8. [公開 API と golden：API を変えると何が起きるか](08-contrib-public-api.md)  
   goldens/public-api に、ビルドした .d.ts を API Extractor に通して作った各パッケージの公開 API の一覧が置かれ、Bazel のテスト（&lt;pkg&gt;\_api）が作り直した一覧と文字列で比べて違えば落ちる仕組み。ɵ・private・@internal が一覧に出ない理由と、コンストラクタの引数名や protected は出ること。@publicApi・@developerPreview・@experimental を読むのは golden ではなく angular.dev であること、golden を更新するコマンド（bazel run //packages/&lt;pkg&gt;:&lt;pkg&gt;\_api.accept）、golden が変わった PR に public-api グループの承認が要る理由（public-api-surface.md・.pullapprove.yml）。
9. [コミットメッセージ：type(scope): summary と CHANGELOG](09-contrib-commit-messages.md)  
   commit-message-guidelines.md の header・body・footer の規則と、それを検査する .ng-dev/commit-message.mjs と ng-dev の validateCommitMessage（scopes は 24 個、feat・fix・perf は scope 必須、body は 20 文字以上で docs は不要。summary の大文字・ピリオドは機械は見ない）。BREAKING CHANGE と DEPRECATED の footer、コミットから CHANGELOG が作られる仕組み（feat・fix・perf と注記のあるものだけ、scope ごと）、fixup コミットとレビュー後の整理、.gitmessage と husky のフック（手元は警告だけで、強制は PR の CI の validate-range）。
10. [PR が通るまで：CI・ラベル・レビュー・マージ](10-contrib-pr-flow.md)  
   PULL\_REQUEST\_TEMPLATE.md の項目、.github/workflows/pr.yml が走らせる検査と、.ng-dev/pull-request.mjs の requiredStatuses で決まるマージに必須の 5 つ、.pullapprove.yml で決まるレビューの担当（触ったファイルに当たる group 全部と作者以外の 1 人）、CLA、target: と action: のラベルと angular-robot.yml の merge の条件、merge-ready の状態、週替わりの caretaker が ng-dev pr merge で main へ rebase マージし対象ブランチへ cherry-pick する流れ、Google 内部のテスト（google-internal-tests.yml・google-sync-config.json・google-markers.md）。レビューで指摘されたときの直し方。
11. [ブランチとリリース：main・パッチのブランチ・target ラベル](11-contrib-branches.md)  
   branches-and-versioning.md の main と 22.1.x のような版のブランチ、リリースの列車（next・rc・latest）と、ng-dev が各ブランチの package.json の version から今の列車を決める仕組み。target: patch / minor / major / rc / lts のどれを選ぶかで変更がどのブランチに入るか（ng-dev のコードと手引きの食い違いも）、feat や破壊的変更を弾く検査、CHANGELOG に出る形、セマンティックバージョニングと破壊的変更の時期、LTS と非推奨（deprecation）の方針。
12. [issue の仕分け：ラベル・優先度・最初に手を付ける issue](12-contrib-triage.md)  
   triage-and-labelling.md の area: ラベル（caretaker の初期仕分け）、P0〜P5 の優先度、needs clarification（設定の angular-robot.yml には needs reproduction も）、help wanted、good first issue の意味と、ロボットのマイルストーンで仕分けの 2 段が判定される仕組み。feature-request-consideration.md で機能要望が 20 票と期限で扱われる流れ。gh や GitHub の検索で自分に合う issue を探す方法と、手を付ける前に issue でひとこと伝える理由（重複・設計・同時に開く PR は 3 つまで）、最小の再現の作り方。
13. [コードの書き方：coding-standards と format・lint](13-contrib-coding-standards.md)  
   coding-standards.md の規則（Google の JavaScript スタイルガイドを土台にした名前の付け方・コメント・JSDoc・try-catch・テストの名前）と、それを機械で守らせる prettier（.prettierrc の 100 文字、ng-dev format changed / staged）、tslint.json（ライセンスの見出し・console.log・fdescribe・\_ メンバーの @internal）、tsec（危険な DOM への書き込みと例外の一覧）。レビューでよく指摘される点を規則の行と結び付け、エラーコード NG0xxx（RuntimeErrorCode の範囲・負の番号・ngDevMode のメッセージ）の付け方を確かめる。
14. [手元で確かめる：dev-app・ローカルのビルドを自分のアプリで使う](14-contrib-debugging.md)  
   debugging-tips.md のコンソールの ng と、window.ng が開発モードでだけ作られる仕組み、dev-app（workspace:\* と ibazel）で変更をすぐに試す方法、pnpm build で dist/packages-dist に作ったパッケージを自分のアプリ（例えばこのサイト）に file: で入れて確かめる手順と戻し方、VERSION.full のスタンプで入ったことを確かめる方法、ソースマップの vendor 設定とブレークポイント、コンパイラの出力を見る方法。
15. [最初の PR の通し練習：手引きの図の食い違いを直す](15-contrib-first-pr.md)  
   commit-message-guidelines.md の図に書かれた scope の一覧が .ng-dev/commit-message.mjs の設定と合っていない（図には bazel・packaging・changelog があり、dev-infra・language-server・vscode-extension が無い。#64492 で箇条書きだけが直された）ことを題材に、最新の main で直っていないかの確認、既存の issue と PR の検索、fork とブランチ、図の幅を揃えた変更、docs: のコミットメッセージと手元での検査、PR の説明文の下書き、レビューで言われうることまでを通しで行う。出すかどうかは読者が決める。
