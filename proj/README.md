[目次](../README.md)

# ng-content と投影の内側

> 1 行の ng-content が生むもの・コンパイラの出力・振り分け・描画と再投影・動的な投影とよくある誤解・spec と issue

コンポーネントのテンプレートに &lt;ng-content select="\[header\]"&gt; と 1 行書くと、コンパイラは「このコンポーネントは投影の枠をいくつ持ち、どの枠がどのセレクタか」を定義に書き込み、実行時の Angular は、使う側がタグの中に書いたノードを枠に振り分けて、ng-content の場所に描きます。このシリーズでは、その振り分けと描画を、コンパイラの出力と core の projection.ts・node\_manipulation.ts の行で 1 つずつ確かめます。セレクタの照合の規則の入口は template シリーズの「ng-content のセレクタは CSS ではない」にあるので、ここではその先を読みます。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/proj)

1. [1 行の ng-content が生むもの：投影の全体像](01-proj-what-declared.md)  
   &lt;ng-content&gt; と &lt;ng-content select="\[header\]"&gt;、既定の内容つきの枠を書いたコンポーネントと、それを使う側のテンプレートを本物のコンパイラにかけ、出てきた ngContentSelectors・ɵɵprojectionDef・ɵɵprojection と、使う側の何も変わらない出力を指さす。枠の番号は配列の位置で \* も特別扱いされないこと、命令のコメントの 2 か所が古いこと。「枠を宣言するのは中の側、ノードを作るのは外の側」という分担と、実行時に振り分け → 描画と進む地図。
2. [コンパイラの側：select の解析、ngProjectAs、既定の内容](02-proj-compile.md)  
   テンプレートパイプラインの ingestContent・removeContentSelectors・generateProjectionDefs と、セレクタを配列にする parseSelectorToR3Selector。枠の番号はビューごとに数えるので @if の中の ng-content は後ろに回り、.d.ts の並びと違うこと。ngProjectAs が最初の 1 つだけ解析されて AttributeMarker.ProjectAs の後ろに入る行（空なら undefined）、既定の内容（fallback）が別のテンプレート関数になる行。@if のルートの要素が 1 つのときだけタグ名と属性が写ることと、写らないときの拡張診断 NG8011。
3. [振り分け：ɵɵprojectionDef がホストの子を枠に分けるまで](03-proj-distribute.md)  
   ɵɵprojectionDef が、外の側の TView にあるホストの TNode に projection が無いときだけ、ホストの直接の子を 1 回だけ走査し、matchingProjectionSlotIndex で枠を決めて projectionNext の連結リストに繋ぐ行（template シリーズで読んだ範囲の先）。最初に合った枠が勝つこと、ngProjectAs は getProjectAsAttrValue で取り出され isSelectorInSelectorList で完全一致で比べられること（空の値は TypeError）、@if・@for・ng-container・テキストがそれぞれ 1 つのノードとして振り分けられること。ページの上の本物で振り分けの結果と TNode を見る。
4. [描画と再投影：ɵɵprojection、applyProjectionRecursive、既定の内容](04-proj-render.md)  
   ɵɵprojection が枠のノードを ng-content の場所に付ける行と、node\_manipulation.ts の applyProjectionRecursive・applyNodes・getProjectionNodes。ノードの持ち主は外のビューのまま、入れ子の ng-content（再投影）を外へ外へとたどる道。既定の内容（insertFallbackContent）は「枠の先頭の TNode が null か」だけで決まり、@if の子・残った空白・再投影の ng-content では出ないこと。投影されたコンポーネントが、ng-content が描かれなくても作られる理由。
5. [動的な投影：createComponent の projectableNodes と、よくある誤解](05-proj-dynamic.md)  
   createComponent や ViewContainerRef.createComponent に渡す projectableNodes が、セレクタで照合されず番号のまま枠に入る行（component\_ref.ts の projectNodes）。同じ枠の ng-content を 2 回書いたときの 3 通りの結果（最後のワイルドカード・最初のセレクタ・最後に描いた行）、@if で ng-content を切り替えても中身は作り直されず壊れないこと、条件つきで作りたいときに ng-template と ngTemplateOutlet を使う理由を、ページの上の本物で確かめる。
6. [spec と issue を読む：投影の振る舞いを決めているテスト](06-proj-tests-issues.md)  
   core の acceptance/content\_spec.ts（2386 行）と linker/projection\_integration\_spec.ts を中心に、投影の約束をどの it が固めているかの地図。コンパイラの compliance テストと ngtsc の診断の spec、ハイドレーションの spec。手元での走らせ方と結果。投影に関係する開いている issue と閉じた issue の表。
