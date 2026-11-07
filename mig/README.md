[目次](../README.md)

# マイグレーションの内側

> ng update と ng generate の自動書き換え・Tsurge・signal への移行・テンプレートの書き換え

ng update @angular/core を走らせると、コードが新しい書き方に自動で直ります。ng generate @angular/core:signal-input-migration は @Input を input() に、control-flow は \*ngIf を @if に書き換えます。この書き換えをしているのが @angular/core の schematics/ にある 30 近いマイグレーションです。中では TypeScript のプログラムと Angular のコンパイラ（NgCompiler とテンプレートのパーサー）を作り、コードとテンプレートを読んで、文字列の置き換え（Replacement）を集め、最後にまとめてファイルに書きます。このシリーズは、ng update がマイグレーションを見つける仕組みから始めて、新しい形の土台 Tsurge（分析・合流・移行の 3 段階）、置き換えと import の足し方、テンプレートの見つけ方を読み、signal の input・クエリ・output、制御フロー、inject()、テンプレートの書き換え、使っていない import の削除、v22 の ng update で走るマイグレーションを 1 つずつ読みます。ページの上のデモは、このサイトに入っている本物の @angular/compiler でテンプレートを解析して動きます。各章の最後に、そのマイグレーションの spec と手元での走らせ方を置きます。最終回は、開いている issue を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/mig)

1. [マイグレーションの全体像：ng update と ng generate](01-mig-overview.md)  
   packages/core/schematics の中身（migrations/ は ng update で走るもの、ng-generate/ は自分で選んで走らせるもの、utils/ は共通部品）。migrations.json と collection.json の違い、新しい形（Tsurge）と古い形（Tree と ChangeTracker）の 2 つの書き方の一覧、spec の置き場と走らせ方。
2. [入口と配布物：migrations.json から bundles/\*.cjs まで](02-mig-entry-bundles.md)  
   @angular/core の package.json の ng-update が migrations.json を指し、各項目の version と factory（./bundles/&lt;名前&gt;.cjs#migrate）で走るものが決まる流れ（CLI の側は cli-add-update へ）。BUILD.bazel の bundle\_entrypoints と rollup.config.js で 23 個のマイグレーションを 1 つずつ .cjs にまとめる仕組み（external と chunk、.cjs にする理由）、今は誰も使っていない load\_esm.ts と、ESM の @angular/compiler-cli を require で読んでいる今の形。
3. [tsconfig を探してプログラムを作る](03-mig-program.md)  
   project\_tsconfig\_paths.ts が angular.json の全ターゲットの tsConfig を集め、名前に test を含むかで build と test に分ける行（58efd86c78f・f72600eaddf の 2 つの修正）、Tsurge の createProgram が NgtscProgram（Angular のコンパイラ込み）か素の TS プログラムを作る分かれ目（create\_program.ts・ngtsc\_program.ts）と ProgramInfo の各フィールド（rootDir の修正 26b0c719eff）。DevkitMigrationFilesystem が schematics の Tree を compiler-cli の FileSystem に見せる仕組み。
4. [Tsurge：分析・合流・移行の 3 段階](04-mig-tsurge.md)  
   TsurgeBaseMigration の analyze・combine・globalMeta・stats と、Funnel（分析の段階で置き換えまで作る）と Complex（移行の段階でプログラムを作り直す）の違い。google3 の大きなリポジトリを分けて走らせるための設計と、それを 1 台で順に呼ぶ runMigrationInDevkit、同じ .ts が 2 つの tsconfig に入るときに 1 回だけ数える処理。
5. [置き換えを集めて書く：Replacement・TextUpdate・ImportManager](05-mig-replacements.md)  
   Replacement（どのファイルの）と TextUpdate（何文字目から何文字目を何に）の形、groupReplacementsByFile、Tree の recorder で remove と insertRight を順に当てる行。import を足したり消したりする ImportManager と applyImportManagerChanges、古い形の ChangeTracker。ページの上で TextUpdate を文字列に当てるデモ。
6. [テンプレートを見つけて解析する](06-mig-templates.md)  
   マイグレーションがコンポーネントのテンプレートを見つける仕組み（インラインの template の文字列と templateUrl の .html）、ng\_component\_template.ts・parse\_html.ts・template\_ast\_visitor.ts。テンプレートの中の位置をファイルの中の位置に直す計算と、行と列に直す line\_mappings.ts。NgCompiler の TemplateTypeChecker を使うマイグレーションとの違い。
7. [signal input への移行：10 の段階](07-mig-signal-input-passes.md)  
   SignalInputMigration の analyze が入力を見つけ（1）、参照を探し（2）、移行できない書き方を調べ（3・4）、migrate が TS の参照・宣言・テンプレート・ホストバインディング・型の参照を書き換えて（5〜9）、import を直す（10）まで、passes/ を呼ぶ順番と各段階の入出力。KnownInputs と InputDescriptor（ファイルをまたいで入力を 1 つに数える鍵）、tsconfig ごとに分けて走らせたときに合わせるデータ（batch/）。
8. [参照の書き換え：this.x を this.x() に](08-mig-signal-input-references.md)  
   TS の中の this.x、テンプレートの中の x、ホストバインディングの中の x を見つけて x() に変える仕組み（reference\_resolution・reference\_migration）。if (this.x) { this.x.foo } のように型の絞り込みに頼るコードを、flow\_analysis で調べてローカルの const に取り出す書き換え。
9. [移行できない入力：理由の判定と TODO](09-mig-signal-input-incompatible.md)  
   入力に値を書き込むコード、継承で上書きされる入力、getter と setter、spyOn などで使われる入力を「移行できない」と判定する仕組み（problematic\_patterns/）と、その理由（InputIncompatibilityReason・FieldIncompatibilityReason）。--best-effort-mode で無視できる理由と無視できない理由、--insert-todos で残す TODO の文。
10. [signal クエリへの移行：@ViewChild を viewChild() に](10-mig-signal-queries.md)  
   signal-queries-migration が @ViewChild・@ViewChildren・@ContentChild・@ContentChildren を見つけ、signal-migration と同じ参照の仕組みで書き換える流れ。QueryList の toArray()・first・last・get() を配列の操作に直す書き換え（fn\_\*.ts）、QueryList の changes を使うと移行できない理由。
11. [output() への移行と signals のまとめ役](11-mig-output.md)  
   output-migration が @Output() と new EventEmitter() を output() に変え、.next() を .emit() に、文として単独の .complete() を消し、引数のない emit() に TODO を入れる仕組み。移行をやめる書き方（静的でない別名・式の中の .complete()・テスト以外の .pipe()。.subscribe() は調べない）と、置き換えを出力の ID ごとに採るか捨てる migrate。3 つの signal 系のマイグレーションを名前順に chain する ng-generate/signals。
12. [制御フローへの移行：\*ngIf を @if に](12-mig-control-flow.md)  
   control-flow-migration が、テンプレートの文字列を parse\_html で解析し、\*ngIf・\*ngFor・\*ngSwitch とその ng-template を見つけて、外側から順に @if・@for・@switch のブロックの文字列に組み立て直す仕組み（ifs.ts・fors.ts・switches.ts・cases.ts）。else と then の ng-template、ngFor の trackBy と index、移行できないときの理由。
13. [inject() への移行と @Service](13-mig-inject.md)  
   inject-migration がコンストラクタの引数を inject() を使うプロパティに変える仕組み（analysis.ts の調べ方、@Inject・@Optional・@Self などのデコレーターの変換、super() と引数を使うコンストラクタの扱い、backwardsCompatibleConstructors などの設定）。v22 の新しい @Service に @Injectable を変える service-migration。
14. [テンプレートの書き換え：自己終了タグ・ngClass・ngStyle](14-mig-template-rewrites.md)  
   self-closing-tags-migration が中身の無い要素を &lt;x /&gt; に変える判定（まだ /&gt; でない・DomElementSchemaRegistry の要素名に無い・中身が無いか空白だけ）と、ngclass-to-class・ngstyle-to-style が \[ngClass\] と \[ngStyle\] をオブジェクトリテラルのときだけ \[class.x\]・\[class\]・\[style.x\]・\[style\] に変える判定、NgClass の import を消してよいかの判定。どれもテンプレート全体を 1 つの置き換えにする。ngStyle の側に残る 2 つの穴（変えられなかった \[ngStyle\] が残っても NgStyle を消す・値の " で属性が壊れる）を本物の bundle で確かめる。ページの上で本物の HtmlParser（parse\_html.ts の parseTemplate と同じオプション）を使った自己終了タグの書き換えのデモ（移植）。
15. [使っていない import を消す・CommonModule を分ける](15-mig-cleanup-imports.md)  
   cleanup-unused-imports が NgCompiler の診断（NG8113 使っていない standalone の import）を集めて、imports の配列から消す仕組みと、消したあとに要らなくなった TS の import も消す行。common-to-standalone-migration が CommonModule を NgIf・AsyncPipe など使っているものだけに分ける仕組み。
16. [ルーティングのマイグレーション：遅延読み込みと RouterTestingModule](16-mig-routing.md)  
   route-lazy-loading が、ルートの component: X を loadComponent: () =&gt; import(...) に変える仕組み（ルートの配列を見つける 5 つの形、standalone のコンポーネントだけ、同じファイルに無いものだけ、NgModule のものだけを報告する）。router-testing-module-migration が .spec.ts の RouterTestingModule を RouterModule（routes があれば RouterModule.forRoot）に変え、SpyLocation.urlChanges を使うときだけ provideLocationMocks() を足す仕組み。
17. [v22 の ng update（1）：既定が変わったものを元に戻す](17-mig-v22-defaults.md)  
   v22 で既定が変わった 4 つに、前の動きを残す設定を足すマイグレーション: change-detection-eager（OnPush が既定になったので ChangeDetectionStrategy.Eager を足す）、strict-templates-default（tsconfig に strictTemplates: false）、http-xhr-backend（withXhr）、incremental-hydration（withNoIncrementalHydration）。それぞれが何を見て足し、何があれば足さないか。
18. [v22 の ng update（2）：?. の意味が変わる](18-mig-v22-safe-navigation.md)  
   v22 でテンプレートの ?. が null でなく undefined を返すようになったこと（コンパイラの legacyOptionalChaining と $safeNavigationMigration の印）に合わせる safe-optional-chaining（受け手が null と undefined を区別する式だけを $safeNavigationMigration() で包む）と strict-safe-navigation-narrow（拡張診断を止める）。model() と同名の output の重複を直す model-output、canMatch の 3 つ目の引数を足す can-match-snapshot-required。
19. [マイグレーションのテスト：SchematicTestRunner とゴールデン](19-mig-testing.md)  
   test/ の spec が、仮想のファイルシステムに angular.json と tsconfig と .ts を書き、SchematicTestRunner で本物の bundles を走らせて結果のファイルを比べる形（helpers.ts）。Tsurge のテストの助け（runTsurgeMigration・diffText・dedent・toMatchWithDiff）と、それが CLI と違う当て方（appendLeft）で combine を通らないこと。signal-migration のゴールデンテスト（golden\_test\_runner.ts と、bazel run で golden.txt を作り直す仕組み）。新しい spec を足す手順。
20. [issue と PR を読む：マイグレーションの今](20-mig-issues.md)  
   area: migrations のラベルで開いている issue と、この 1 年に閉じた issue の表。マイグレーションが 2 回走る、制御フローの移行で ng-content や i18n が壊れる、standalone の移行が長い、など。どの issue がこのシリーズのどの章の行に関係するか。
