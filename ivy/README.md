[目次](../README.md)

# Ivy ランタイム

> TNode・TView・LView を 1 つずつ

コンポーネントは実行時に配列になります。その配列の設計図（TView）、ノード 1 つぶんの情報（TNode）、インスタンスごとの中身（LView）、命令セットを、1 概念 1 ページで読みます。

全 17 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/ivy)

1. [コンポーネントの実体は配列だった（概観）](01-component.md)  
   LView が Array を継承していること、インスタンスが型紙の slice() で作られること、ライフサイクルフックが TView 側にあることをソースから読む。
2. [Ivy とは何か：ɵcmp にテンプレートが関数として入っている](02-ivy-overview.md)  
   ɵɵdefineComponent が受け取る decls / vars / consts / template。コンポーネントの外を知らずにコンパイルできる「局所性」が、Ivy の設計の中心にある。
3. [テンプレート関数と RenderFlags：同じ関数を Create と Update で 2 回呼ぶ](03-ivy-template-function.md)  
   rf & 1 のブロックは DOM を作り、rf & 2 のブロックは値を流す。executeTemplate がどう呼び分け、ɵɵadvance が「今どの要素か」を進めるか。
4. [TNode：テンプレートの 1 ノードぶんの静的情報](04-ivy-tnode.md)  
   type / index / child / next / parent / directiveStart / directiveEnd / flags / attrs。要素 1 つにつき 1 個、全インスタンスで共有される。
5. [TView：テンプレートの設計図](05-ivy-tview.md)  
   type / blueprint / data / bindingStartIndex / expandoStartIndex / フック配列 / components。createTView が何を初期化し、def.tView にどうキャッシュされるか。
6. [LView：インスタンスごとの 28 + decls + vars + expando](06-ivy-lview.md)  
   HEADER の 28 スロットを 1 つずつ。createLView が blueprint.slice() で配列を作り、HOST・CONTEXT・INJECTOR・RENDERER を埋めていく手順。
7. [blueprint と TData：同じ番号で 2 本の配列を引く](07-ivy-blueprint.md)  
   VIEW\_DATA.md に描かれた 4 区画。syncViewWithBlueprint で足りないぶんを伸ばし、allocExpando で末尾に追加する。番号 = 意味、という約束。
8. [firstCreatePass：最初の 1 インスタンスだけがする仕事](08-ivy-first-create-pass.md)  
   elementStartFirstCreatePass で TNode を作り、ディレクティブを照合し、フックを登録する。2 インスタンス目は tView.data\[index\] を読むだけ。
9. [DOM を組む命令：ɵɵelementStart / ɵɵtext / ɵɵelementEnd](09-ivy-create-instructions.md)  
   createElementNode → appendChild → getParentRElement。renderer 経由で要素を作り、親を見つけて挿す。elementEnd が閉じるのは TNode の木。
10. [値を更新する命令：ɵɵproperty / ɵɵtextInterpolate と bindingUpdated](10-ivy-update-instructions.md)  
   bindingIndex が前回の値の場所を指す。Object.is で比べ、変わっていなければ NO\_CHANGE。setPropertyAndInputs が DOM かディレクティブ入力かを振り分ける。
11. [LContainer：@if が入れ替えるビューの入れ物](11-ivy-lcontainer.md)  
   TYPE / NATIVE / VIEW\_REFS / CONTAINER\_HEADER\_OFFSET = 10。ɵɵtemplate がコメントノードを碇として置き、createAndRenderEmbeddedLView がそこにビューを足す。
12. [ビューの木をどう歩くか：CHILD\_HEAD / NEXT / PARENT / DECLARATION\_VIEW](12-ivy-view-tree.md)  
   addToEndOfViewTree が連結リストを伸ばす。「どこに挿入されたか」の木と「どこで宣言されたか」の木は別で、ずれると transplanted view になる。
13. [ライフサイクルフックは TView の数列](13-ivy-hooks.md)  
   registerPreOrderHooks / registerPostOrderHooks が \[index, fn, index, fn, …\] を積む。InitPhaseState の 2 ビットで ngOnInit を 1 回だけにする仕組み。
14. [ディレクティブのインスタンス化と EXPANDO](14-ivy-directives.md)  
   instantiateAllDirectives が directiveStart から directiveEnd まで順に new する。インスタンスは LView の EXPANDO 区画に並び、属性からの初期入力はここで流れる。
15. [命令が「今どこか」を知る方法：LFrame と instructionState](15-ivy-lframe.md)  
   ɵɵelementStart(0, 'h1') には lView が渡されない。enterView / leaveView がグローバルなスタックを積み、bindingIndex と selectedIndex を持ち回る。
16. [ViewRef / ComponentRef / ElementRef は配列への窓](16-ivy-refs.md)  
   ViewRef は \_lView を 1 本持つだけ。detectChanges は detectChangesInternal、markForCheck は markViewDirty を呼ぶ。公開 API が内部配列にどう対応するか。
17. [ビューの破棄：destroyLView → cleanUpView → executeOnDestroys](17-ivy-destroy.md)  
   DOM から外し、リスナーを解除し、ngOnDestroy を呼ぶ順番。TView.cleanup と LView\[CLEANUP\] に積まれていた後始末が、ここでまとめて消費される。
