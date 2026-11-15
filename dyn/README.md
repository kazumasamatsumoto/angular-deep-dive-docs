[目次](../README.md)

# 動的コンポーネント：createComponent と ViewContainerRef

> 2 つの入口・ComponentFactory.create の中・directives の選択肢・bindings と ComponentRef・ViewContainerRef.createComponent とホストの要素・spec と issue

ViewContainerRef が LContainer に差し込む仕組みは template シリーズの「あとからビューを差し込む場所」で、テストで bindings を渡す話は testing シリーズで、projectableNodes は投影のシリーズで読みました。このシリーズでは、テンプレートに書かずにコンポーネントを作る道そのものを読みます。createComponent 関数と ViewContainerRef.createComponent の 2 つの入口が ComponentFactory.create に集まり、注入器をつなぎ、ホストの要素を決め、directives と bindings を当てるまでを、コミットと今の行と spec の順に追います。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/dyn)

1. [2 つの入口：createComponent 関数と ViewContainerRef.createComponent](01-dyn-entry-points.md)  
   テンプレートの外でコンポーネントを作る 2 つの入口の引数（environmentInjector・elementInjector・hostElement と、index・injector・ngModuleRef。directives・bindings・projectableNodes・onError は共通）を golden で並べ、どちらも new ComponentFactory(def).create に集まるまで。attachView の有無で変更検知が届くかが変わることをページの上で 2 つの入口から作って確かめ、reflectComponentType の JSDoc の例が propName と templateName を逆に書いていることを記録で示す。ComponentFactoryResolver と ComponentFactory を公開 API から外し、revert して、同じ差分で入れ直した 2026 年 4 月の経緯（9d76ac82290・ecae525970a・b1f5181ffd8・df9eed4ff1d・f9b74e90e3c）と、残ったもの。
2. [ComponentFactory.create の中：注入器・tracing・ホストの要素](02-dyn-factory-create.md)  
   ComponentFactory.create が signal の読み取りを外し、注入器と環境を決め、TracingService があれば componentCreate で包んで（c19066c741a）createComponentRef に進むまで。ChainedInjector が要素の側に渡す「要素だけを調べて」という印と、それがつながった ChainedInjector の中で効く条件、環境の注入器を親に持つ Injector.create を elementInjector に渡すと environmentInjector の上書きが効かないこと、RendererFactory2 が取れないときの NG0407。ホストの要素を探すか作るか、ViewContainerRef だけが差し込む場所の名前空間を渡す修正（2ab5ff56ded、22.1 系列には 9a8e4826b9d で v22.1.4 から）。ページの上で注入器の組み合わせと selector ごとのタグ名・名前空間の表を作る。
3. [directives の選択肢：作るときにディレクティブを当てる](03-dyn-directives.md)  
   createComponent の directives に渡したディレクティブが、selector の照合なしでコンポーネントの後ろに並び、host directive が前に差し込まれ、その順にコンストラクタとライフサイクルが回るまでを spec で読む。同じものを 2 回（NG0309）・standalone でないもの（NG0907）の確かめは開発モードだけで、本番では 2 回作られたりそのまま作られたりすること、コンポーネントの host directive をもう一度渡すと 1 つにまとまって後ろに移ること、DirectiveWithBindings の bindings はそのディレクティブだけに届くこと。ページの上でディレクティブを選んで作り直し、ホストの属性とライフサイクルの順を記録する。#68779 で TestBed.createComponent に directives が入らなかった経緯。
4. [bindings と ComponentRef：作ったあとの入力・出力・破棄](04-dyn-bindings-ref.md)  
   inputBinding・outputBinding・twoWayBinding の値と購読がいつ入るか（入力は作るときではなく最初の変更検知、出力の購読は作るとき）、setInput と bindings を両方使うときの NG0317（本番では投げずに値が残る）、出力の購読がルートのビューの破棄で外れること、ComponentRef.destroy のフックの順と、ホストの要素を DOM から外すのが appRef.detachView であること（#62150）、hostView と changeDetectorRef。testing シリーズの章の続きとして、テストではなくアプリの中の動きを、ページの上の本物と Node の記録で確かめる。
5. [ViewContainerRef.createComponent とホストの要素の守り](05-dyn-vcr-host.md)  
   ViewContainerRef.createComponent の引数の確かめ（environmentInjector と ngModuleRef を両方渡すと開発モードだけ番号なしの ASSERTION ERROR）、injector の既定が parentInjector でアンカー自身の providers が見えないこと、index の範囲は開発モードだけで子を作ったあとに確かめること、ハイドレーションで記録の無いコンテナを許す 77f1ca08e4a。ホストの要素として script を断る修正（d7f70616a03・9f8e32616b7、NG0905）と、ホストのバインディングを本当のホストで選ぶサニタイズ（d06e3748b7b・f57d5d5c8c3）を、守りの側から読む。
6. [spec と issue を読む：動的コンポーネントを固めているテスト](06-dyn-tests-issues.md)  
   acceptance の create\_component・view\_container\_ref・security・query の spec と、core の直下の test\_bed・application\_ref の spec が、このシリーズの各章の約束をどこで固めているか（render3 の component\_ref\_spec.ts は 2026-04 の df9eed4ff1d で消えた）。手元での走らせ方と結果、動的コンポーネントの開いている issue と閉じた issue の表と傾向。
