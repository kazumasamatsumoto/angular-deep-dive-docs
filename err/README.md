[目次](../README.md)

# ErrorHandler とエラーの行き先

> ErrorHandler と内部の入口・エラーを捕まえる場所の地図・ブラウザの全体のエラー・@boundary の実行時・@boundary のコンパイル・spec と issue

テストの中でエラーが失敗になるまでは testing シリーズの「エラーがテストの失敗になるまで」で、resource のエラーの包み方は resx シリーズで読みました。このシリーズでは、アプリの中で投げられたエラーが ErrorHandler に届くまでの道を、イベントのリスナー・effect・変更検知・PendingTasks・ブラウザの全体のエラーと順に地図にします。そのうえで、v22.2 で入ったエラーの境界（@boundary と ErrorBoundary の API）を、実行時とコンパイラの両方から読みます。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/err)

1. [ErrorHandler と内部の入口：INTERNAL\_APPLICATION\_ERROR\_HANDLER](01-err-handler-core.md)  
   フレームワークの中から呼ばれる入口 INTERNAL\_APPLICATION\_ERROR\_HANDLER が、ApplicationRef の生成で循環しないよう ErrorHandler を最初のエラーまで取らない理由（1c1ad12ad3e、#58970）、壊れた注入器から取らない修正（c4dd258658f・538de86a725）、zone の扱いを factory に入れた d399d7d02b6。入口を通る場所と ErrorHandler を直接取る場所（output・afterRender）の grep と、子の注入器の ErrorHandler に届くのはどちらか。ページの上で別のアプリを作り、自分の ErrorHandler に届くエラーを数える。
2. [エラーを捕まえる場所の地図：リスナー・effect・変更検知・PendingTasks](02-err-where-caught.md)  
   テンプレートのリスナー（テンプレートで書いた output も）、コードで subscribe した output、effect と afterRender、ApplicationRef.tick（338818ce899）、PendingTasks.run（7232ce5b17c・0e16bb701f2）、async パイプ（739cadae62f）が、それぞれどの行で捕まえてどの入口に渡すかの地図。root の effect が 1 つ投げると後ろの effect が止まったまま残ること、捕まえない場所（Promise を返すリスナー、#69228）も並べる。ページの上の本物で、場所ごとにエラーを投げて届き方を表にする。
3. [ブラウザの全体のエラー：provideBrowserGlobalErrorListeners](03-err-global-listeners.md)  
   window の error と unhandledrejection を入口に渡す provideBrowserGlobalErrorListeners（65adb3024d6）の全部の行、Zone.root で付けて変更検知を起こさない修正（0ac949c2666）、error を持たない ErrorEvent を包む修正（572c32a0387、#62078）、zone.js の既定で zone の外の Promise の reject が unhandledrejection にならない道（#51357）、ng new の雛形と TestBed。spec の 2 本が b84859073bf から中身を走らせていないこと。本物のリスナーを偽の window の上で動かす。
4. [@boundary の実行時：ɵɵboundaryUpdate と ON\_ERROR](04-err-boundary-runtime.md)  
   v22.2 で入ったエラーの境界の実行時（f6afb807c1e・54ed62d2405、main に入ったのは 2026-09-09）。boundary.ts の ɵɵboundaryUpdate が本体のビューの LView\[ON\_ERROR\] に置く関数で、更新のときのエラーを受けて本体を消し @error に切り替える行と、作るときのエラーを受ける自分の catch の違い、どの @error にも合わないときの BoundaryError、ErrorBoundaryWrappedError、境界に届かないエラー（リスナー・描画後・投影・公開 API の作るとき）。22.2.6 を Node で動かした記録で、場面ごとの HTML と ErrorHandler に届いたものを見る。
5. [@boundary のコンパイル：字句解析から型チェックまで](05-err-boundary-compile.md)  
   @boundary の塊が lexer と r3\_boundaries.ts の createBoundaryBlock で AST になり、テンプレートのパイプラインの ingest・boundary\_conditions・generate\_variables・resolve\_boundaries で ɵɵboundaryUpdate の式になるまで、型チェックの TCB（f7597cb7d93）と言語サービス（f4a5650ed9c）、書き方の誤りの診断。22.2.6 の compiler-cli で書き方を変えて出力と診断を比べ、22.1.6 のパーサの結果と並べる。
6. [spec と issue を読む：エラーの行き先を固めているテスト](06-err-tests-issues.md)  
   core/test の error\_handler\_spec.ts と render3/error\_boundary\_spec.ts、acceptance のリスナー・描画後・PendingTasks と render3 の effect のエラーの spec、compiler の r3\_template\_transform\_spec.ts、compiler-cli の boundary\_spec.ts と compliance、言語サービスの spec が、このシリーズの各章の約束をどこで固めているか。Bazel の target と手元で走らせた数。ErrorHandler・全体のエラー・境界に関係する開いている issue と閉じた issue の表と、数で見る傾向。
