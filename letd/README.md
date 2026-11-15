[目次](../README.md)

# @let の内側：字句から LView の枠まで

> 字句と構文・スコープと binder・テンプレートのパイプライン・実行時とハイドレーション・型チェックと診断・spec と issue

@let は template シリーズや typecheck シリーズ、パイプのシリーズで少しずつ顔を出しましたが、1 つの機能として通して読んだことはありませんでした。このシリーズでは、\`@let x = expr;\` という 1 行が、字句解析で始まり・値・終わりの 3 つのトークンになり、binder がスコープを決め、テンプレートのパイプラインが ɵɵdeclareLet・ɵɵstoreLet・ɵɵreadContextLet に分け、実行時に LView の 1 つの枠に値を入れるまでを、2024 年 4 月からのコミットの順に読みます。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/letd)

1. [字句と構文：@let が 3 つのトークンと 1 つのノードになるまで](01-letd-syntax.md)  
   lexer が @let を LET\_START・LET\_VALUE・LET\_END の 3 トークンに切る行（62c5b66b411、名前の $ は 341a116d611）、値の終わりは引用符の外の最初の ; で括弧は数えないこと、; を忘れるとテンプレートの残りが値に飲まれること、html の AST の LetDeclaration と 3 つの span（1ae06e4fc61、span の修正 6bd17216627）、ngNonBindable の中で組み立て直すテキスト（9eef041211e）。tokenizeLet だけを切ると \_isTextEnd のせいで lexer が止まらない組み合わせを、Node の記録で示す。ページの上で本物の @angular/compiler を動的 import し、AST とエラーを、Node で記録したトークンと並べる。
2. [スコープと binder：どこから読めて、何に結び付くか](02-letd-scope.md)  
   t2\_binder の Scope が @let を maybeDeclare で登録する行（b7fc7fdba94）、スコープを作るのは制御フローのブロックと ng-template で要素は作らないこと、lookup が親の方へだけたどるので子からは読めて親からは読めないこと、スコープを先に全部作るので宣言より前の読みも同じ宣言に結び付くこと、同じスコープの #ref・@for の変数とは先勝ちで子は親に勝つこと（パイプラインの側の修正 2a1291e942a と compliance の shadowed\_let）、this. の読み（09f589f0006・fa7cb4b87af）と代入の左辺。ページの上で本物の R3TargetBinder を動かし、名前がどの宣言に結び付くかを表にする。
3. [テンプレートのパイプライン：declareLet・storeLet・readContextLet](03-letd-pipeline.md)  
   ingest が置く DeclareLetOp と StoreLetOp（64990a50ed9）、StoreLetExpr と ContextLetReferenceExpr、generate\_local\_let\_references と remove\_illegal\_let\_references の phase、ほかのビューから読まれず pipe も無い @let の storeLet と declareLet を消す store\_let\_optimization（a6b7b9b8c5e）と、読まれない @let の値の式が文として残る理由、i18n の phase の移動（8f2874e86d8）、@let を読まないリスナーの restore / reset view を消す修正（ce80136e7b9）、内容の写しの判定（c421ffdbfbf）、angular-main の ɵɵinvalid（9fe64d48d29）。ページの上で本物の compileComponentFromMetadata を動かし、出る命令を数える。
4. [実行時とハイドレーション：LView の 1 つの枠](04-letd-runtime.md)  
   let\_declaration.ts の 3 つの命令（ɵɵdeclareLet・ɵɵstoreLet・ɵɵreadContextLet）と UNINITIALIZED\_LET、NG0314（UNINITIALIZED\_LET\_ACCESS）が出る 2 つの道（リスナーと、作成の回の同期の detectChanges。#66824）、TNodeType.LetDeclaration を DOM をたどる 9 か所がどう飛ばすか、ハイドレーションでの @let（7dfe302f479・a752178f28b・4231e8f28ff）。利用者の値をそのまま LView の枠に入れるので、isLView・isLContainer に当たる配列が片付け（#59504・#71929）とサーバーの注釈（\['a', true\] で NG0502）で取り違えられることを、22.1.6・22.2.6 と手を入れた写しでサーバーの描画からハイドレーションまで動かして確かめる。ページの上で @let の値を変えて LView の枠を読む。
5. [型チェックと診断：TCB と NG8015〜8017・NG8112](05-letd-typecheck.md)  
   型チェックのブロックで @let が const になる行（695126453e5・59965029210）、宣言より前の読み（NG8016、4bcec1ca95a・d7ab5c3a7bc）、代入（NG8015）と双方向バインディング（cb165923e02。code が NG998005 と表示される）、名前の衝突（NG8017、9aea8a0576a・4d18c5bfd54）、使われない @let の警告（NG8112、c76b440ac00 と revert と 6c2fbda6942・d4ff6bc0b20）、signal を呼ばずに読む検査（NG8109、faafd18a4c0）、#69619 の結末、言語サービスが TCB の const を探す行。compiler-cli 22.1.6 と 22.2.6 で 22 のテンプレートを型チェックした TCB と診断を再生する。
6. [spec と issue を読む：@let を固めているテスト](06-letd-tests-issues.md)  
   lexer・parser・binder の spec、compliance の r3\_view\_compiler\_let（22 項目）、acceptance の let\_spec.ts、platform-server のハイドレーションの spec、ngtsc の型チェックと拡張診断の spec、言語サービスと schematics の spec が、このシリーズの各章の約束をどこで固めているか。15 回の bazel の手元の結果と、runInEachFileSystem で 4 倍になる数え方、@let の issue 22 件と PR の表（分割代入・型注釈の要望、LView の枠の取り違え）、コミットの年ごとの数。
