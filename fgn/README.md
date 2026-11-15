[目次](../README.md)

# 外のコンポーネント：foreignImports と foreign view

> 契約と歩み・foreign view・ɵɵforeignComponent の中・@content と後始末・コンパイラと ngtsc・spec と PR

standalone シリーズの「foreignImports（内部向け）」では、他のフレームワークのコンポーネントを Angular のテンプレートに置く仕組みの全体を 1 章で眺めました。このシリーズでは、その中身を 2026 年 3 月から 11 月までのコミットの順に読みます。head と tail のコメントで囲む foreign view、props を渡して描かせる ɵɵforeignComponent、Angular のビューを外へ渡す @content と、その後始末、テンプレートを読んで命令を出すコンパイラと、使い方を確かめる ngtsc を、今の行と spec で追います。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/fgn)

1. [契約と歩み：4 つの Symbol と g3-only の印](01-fgn-contract-history.md)  
   ForeignComponent の契約がどこまで npm に出ていて、どこからが Google の中だけか（core.ts の g3-only のコメントと、4f9ee3c056a の g3-only・3p-only の印）。0a9b19454d0 の foreign view から 34817da7354 の描く時機の変更までのコミットを月ごとに並べ、22.2 の 3 つの修正も 22.1.4・22.1.5 に同じ差分で入ったことを tag と patch-id で確かめる。ページの上で、外に出ていない Symbol のキーを Proxy で受けて、本物の Angular が外の部品の何を読みに来るか（getComponentId の toString も）を記録する。
2. [foreign view：head と tail のコメントで囲むビュー](02-fgn-foreign-view.md)  
   createForeignView が 3 つの枠の TView（TViewType.Foreign）を作り、head と tail のコメントを置き、切り離されたビューの根に置かれたときは DocumentFragment に入れる行。ノードを集める collect\_native\_nodes と、DOM に出し入れする node\_manipulation の applyForeignNodes が Foreign の型をどう扱うか。renderer の呼び出しの記録、foreign\_view\_spec.ts の 4 つの it、330e209c692 の開発モードの文字。
3. [ɵɵforeignComponent の中：props と描く時機](03-fgn-instruction.md)  
   ɵɵforeignComponent の形が 6981cd782a1 の空の命令から 34817da7354 までどう変わったか。props の関数と外の render を、作成の回ではなく更新の回のビューの effect の中で 1 回だけ呼ぶ行と、render を囲む setActiveConsumer(null) が守るもの（外すと NG0602）。再利用のときの currentTNode（0c07356c5c9）、JIT で断る行（915a03ae856）。22.1.4・22.1.6・22.2.6 を並べて動かした記録。
4. [@content と後始末：Angular のビューを外へ渡す](04-fgn-content.md)  
   ɵɵforeignContent と ɵɵforeignContentFn が、同じスロットのテンプレートの LContainer に LogicalOnly を立て（56607967dbb）、埋め込みビューを DOM に足さずに作ってノードだけ返す producer を CONTENT\_ADAPTER に渡す行。外が呼び返す破棄の関数（11b206b9190）、遅れて描く（4847c0e07b1）、ForeignContextInjector（555fc20af04）。ページの上の本物の外のコンポーネントで、破棄の関数を呼んだとき・呼ばなかったときに Angular の子の ngOnDestroy がいつ走るかを記録し、LogicalOnly を見ない getFirstNativeNode のせいで @for の並べ替えが NG05106 になる記録も読む。
5. [コンパイラと ngtsc：テンプレートから命令まで](05-fgn-compiler.md)  
   foreignImports を AST の形だけで読む行（a19c02706fd）、要素名で外のコンポーネントに照合する 3 か所の表（d596d8bd0ac）と、ディレクティブと両方に当たると TS500 になること、@content のパーサと置き場所・名前の検査（1f6e843648f・79e5d5d75f0・337442453b7）、resolve\_foreign\_content の phase と reify、制御フローの中（5bd00add071・2e442f78762）、props は式だけ型チェックされること（aeb55c8bc10）。compiler-cli 22.1.6 と 22.2.6 で 26 のテンプレートをコンパイルした診断と出力、部分コンパイルで foreignImports が消える記録。
6. [spec と PR を読む：foreign component を固めているテスト](06-fgn-tests-issues.md)  
   core の acceptance（ng\_project で AOT にした TestBed）と render3・JIT の spec、compiler の binder とパーサの spec、compiler-cli の ngtsc と compliance の spec が、このシリーズの各章の約束をどこで固めているか。runInEachFileSystem で数が 4 倍になることを含めた手元の結果。公開の issue がまだ無いので、merge された PR と、閉じたが中身の入った PR の表、コミットの月ごとの数と、angular-main の preprocessor の続き（684a89027bc・c7fd4a2ed99）。
