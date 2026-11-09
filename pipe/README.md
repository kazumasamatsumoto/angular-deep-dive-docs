[目次](../README.md)

# パイプを書くと何を宣言したことになるか

> 1 行の | が生むもの・@Pipe の定義・名前の解決・書ける場所と書けない場所・インスタンスと寿命・spec と issue

テンプレートに {{ d | date:"short" }} と 1 行書くと、コンパイラはそこから「このコンポーネントは DatePipe に依存する」「このビューの決まった枠に DatePipe のインスタンスを 1 つ置く」「変更検知のたびに transform を呼ぶ（pure なら引数が同じ限り呼ばない）」「型チェックでは transform の引数と戻り値の型を確かめる」という約束をまとめて作ります。このシリーズでは、その約束を 1 つずつ、コンパイラと実行時の行で確かめます。パイプの仕組みの一部は common・コンパイラ・型チェックの章にもあるので、ここではそれらを 1 本の道につなぎ、まだ読んでいない行を読みます。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/pipe)

1. [1 行の | が生むもの：テンプレートに書いた pipe の全体像](01-pipe-what-declared.md)  
   {{ d | date:"short" }} を本物のコンパイラ（ngtsc の記録と、ページの上の @angular/compiler）にかけ、出てきた JS と TCB の中で pipe に関係する部分を全部指さす。dependencies の DatePipe、作成のときの ɵɵpipe、更新のときの ɵɵpipeBind2、decls と vars に足される枠と箱（引数の数 + 1）、型チェックの \_pipe1.transform。「宣言」＝依存・枠・呼び出し・型の 4 つの約束が、どの段でどの行から生まれるかの地図。
2. [@Pipe が作るもの：ɵpipe と ɵfac、AOT と JIT と部分コンパイル](02-pipe-class-def.md)  
   @Pipe を付けたクラスに、コンパイラが static な ɵpipe（ɵɵdefinePipe）と ɵfac を足す行（r3\_pipe\_compiler.ts）。PipeDef の name・pure・standalone・factory・onDestroy の既定と読み手。JIT の compilePipe、ライブラリの部分コンパイル（ɵɵngDeclarePipe）とリンカーが同じ compilePipeFromMetadata に戻ることを記録と DEMO で確かめる。ɵfac の ɵɵdirectiveInject(…, 16) の 16（ForPipe）と、inject() にはそれが付かないこと（#50952）。
3. [名前の解決：imports に入れた pipe が、テンプレートの名前と結ばれるまで](03-pipe-name-resolution.md)  
   テンプレートの "date" という名前が、コンポーネントの imports（standalone）や NgModule のスコープから DatePipe に結ばれる流れ。名前 → PipeMeta の Map が handler と型チェックで別々に作られること、binder が使われた名前だけを集め、dependencies に eager に使ったものだけを出す行、見つからないときの NG8004（TCB を作るときの帯域外の診断）と実行時の NG0302、同じ名前の pipe が 2 つあると AOT も JIT も imports の後ろが勝つこと（警告は JIT の NG0313 だけ）、@defer の中だけで使う pipe が依存の関数に回る行。
4. [書ける場所と書けない場所：イベント・ホスト・@let・track と優先順位](04-pipe-where-allowed.md)  
   式のパーサーが pipe を受け付ける場所と、エラーにする場所を行で確かめる。イベント・双方向のイベント側・ホストのイベント・矢印関数の本体は ParseFlags.Action で（「Cannot have a pipe in an action expression」）、ホストのプロパティは SimpleExpressionChecker で、@for の track は PipeVisitor で止まる。@let・@if・@switch・@for の of・@defer の when・i18n の ICU では書ける。| の優先順位が三項演算子より低いこと、括弧が要る書き方、矢印関数の後ろの pipe が関数そのものに掛かること。このページの上の @angular/compiler と、ngtsc にかけた記録で、エラーの文と番号（NG5001・NG5002）を見る。
5. [インスタンスの数と寿命：@for の中の pipe、inject、ngOnDestroy](05-pipe-instances-lifecycle.md)  
   pipe のインスタンスは「書いた場所 × ビュー」ごとに 1 つ。@for の各行・@if の切り替え・同じ pipe を 2 回書いたときに、いくつ作られ、いつ ngOnDestroy が呼ばれるかを、コンパイルの出力とページの上の本物で数える。pipe の中の inject() は ɵɵpipe が動いた時点の TNode から探すので、子のコンポーネントの入力に書いた pipe には、その子の providers は見え、その子の viewProviders は見えない（自分のテンプレートでは自分の viewProviders が見える）。ChangeDetectorRef は、コンストラクタで受けるか inject() で受けるかで誰のものになるかが変わる（#50952）。
6. [spec と issue を読む：pipe の振る舞いを決めているテスト](06-pipe-tests-issues.md)  
   core の acceptance/pipe\_spec.ts（28 本の it が 43 件になる）、コンパイラの compliance テストの pipe の 20 個の test case、型チェックとパーサーの spec が、このシリーズの約束をどこで固めているか。手元で走らせた件数。題に pipe を含む開いている issue と、2025-06 以降に閉じた issue の表、どの issue がどの章の行に関係するか。
