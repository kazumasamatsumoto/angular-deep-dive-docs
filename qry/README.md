[目次](../README.md)

# クエリ（viewChild・contentChildren）の内側

> 1 行の viewChild が生むもの・コンパイラの出力・TQuery の照合・LQuery と結果の集め方・更新の時機と signal クエリ・コンテンツと投影・spec と issue

コンポーネントに viewChild('box') や @ContentChildren(Item) と 1 行書くと、コンパイラは viewQuery と contentQueries という関数を作り、実行時の Angular は「テンプレートのどのノードが、このクエリの条件に合うか」をビューを作るたびに照合し、結果を QueryList や signal に入れます。このシリーズでは、その照合と結果の集め方を、コンパイラの出力と core の render3/queries の行で 1 つずつ確かめます。signal のクエリの書き方とマイグレーションは signals と mig のシリーズにあるので、ここでは実行時の仕組みを読みます。

全 7 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/qry)

1. [1 行の viewChild が生むもの：クエリの全体像](01-qry-what-declared.md)  
   viewChild('box')・viewChildren(Item)・contentChild(TemplateRef) と比べるための @ViewChild('box', {static: true}) を書いたコンポーネントを本物のコンパイラにかけ、出てきた viewQuery / contentQueries 関数・ɵɵviewQuerySignal と ɵɵviewQuery の連なり・ɵɵqueryAdvance(2)・述語（文字列の定数か型か）・フラグ（5 と 7）を指さす。命令が自分を返して連なる行、signal の版が同じ createViewQuery に番号を結ぶ行。実行時に TQuery が作られ、ノードと照合され、LQuery に結果が溜まり、QueryList や signal に届くまでの地図。
2. [コンパイラの側：query\_generation と QueryFlags、ngtsc と JIT と部分コンパイル](02-qry-compile.md)  
   compiler の query\_generation.ts が R3QueryMetadata から viewQuery / contentQueries 関数を組み立てる行。toQueryFlags（descendants・isStatic・emitDistinctChangesOnly の 3 ビット。isSignal はフラグではなく命令の名前で分ける）、述語の定数化とカンマの分割、read の引数、signal を先にまとめる作成の段と ɵɵqueryAdvance をまとめる collapseAdvanceStatements。ngtsc が @ViewChild と viewChild() をメタデータにして signal → 単数 → 複数の順に並べる行、JIT（metadata/di.ts と jit/directive.ts）と部分コンパイル + リンカーが同じ関数に合流すること、単数のクエリだけ AOT と JIT でフラグが 4 違うこと。
3. [TQuery の照合：どのノードが「合う」のか、read で何を返すのか](03-qry-tquery-match.md)  
   ビューの作成中に elementStart と template から呼ばれる TQueries / TQuery\_ の行。文字列の述語は参照名（#box、tNode.localNames）で、型の述語はノードの注入器のトークンで照合する matchTNode。matches に積む \[ノードの番号, 読むもの\] の組と、read が無いときに ElementRef・TemplateRef・コンポーネントのどれを返すか（createResultByTNodeType）、read: ViewContainerRef などの特別なトークン（-2）。TemplateRef の述語が @if のブロックにも合うこと、descendants: false のときに直接の子だけを見る isApplyingToNode、ng-template の中に入るときに子の TQuery を作る embeddedTView。ページの上の本物で TView の matches を読む。
4. [LQuery と結果の集め方：埋め込みビューと QueryList](04-qry-lquery-results.md)  
   LView ごとの LQueries と LQuery\_。埋め込みビューの LQuery は宣言したビューの QueryList を共有する clone で、ビューを作り終えた・入れた・外したときに setDirty される。materializeViewResults と collectQueryResults が、書いた順に結果を集め、ng-template の中身を ng-template を書いた位置に（宣言した LContainer の順 → 別の場所に入れたビューは入れた時刻の順）差し込むこと。QueryList の reset・dirty・changes と emitDistinctChangesOnly。ページの上の本物で、ビューを足し引きして DOM の順と結果の順を比べる。
5. [更新の時機：static、ngAfterViewInit、ɵɵqueryRefresh と signal クエリ](05-qry-refresh-timing.md)  
   結果がいつ見えるようになるか。ɵɵqueryRefresh は dirty で、かつ「作成の段か」と「static か」が一致するときだけ集めて代入する。static は部品のビューの作成の段の最後に 1 回だけで、@if の中は取れない。refreshView の中ではコンテンツのクエリが埋め込みビューの後、ビューのクエリが子のコンポーネントの後。signal のクエリは ɵɵqueryAdvance で番号だけ進め、CreationMode が下りたあと読まれたときに集める。コンストラクタ・ngOnInit・ngAfterViewInit・effect の中で読んだ値をページの上の本物で記録し、required で結果が無いときの NG0951 も見る。
6. [コンテンツのクエリ：投影されたノード、ディレクティブのクエリ、継承](06-qry-content-projection.md)  
   contentChildren が見るのは「ホストの要素の中に書かれたノード」で、ng-content でどこに投影されたかではないこと。createContentQuery と saveContentQueryAndDirectiveIndex、ホストのノードで contentQueries が作られて照合が始まる行。ディレクティブにもクエリが書けること、継承（InheritDefinitionFeature）でクエリ関数がつながる行。ページの上の本物で、投影の有無と descendants の違いを比べる。
7. [spec と issue を読む：クエリの振る舞いを決めているテスト](07-qry-tests-issues.md)  
   core の acceptance/query\_spec.ts（104 件）、authoring/signal\_queries\_spec.ts（AOT と JIT で 23 件ずつ）、linker/query\_integration\_spec.ts・query\_list\_spec.ts、render3/query\_spec.ts、コンパイラの compliance テスト（14 件）が、このシリーズの各章の約束をどこで固めているか。BUILD.bazel のターゲットと、手元で走らせた数。ラベル core: queries を中心に、開いている issue と閉じた issue の表。
