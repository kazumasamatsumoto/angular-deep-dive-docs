[目次](../README.md)

# @defer とインクリメンタルハイドレーションの内側

> ɵɵdefer 命令・ブロックの記録・状態の切り替え・minimum と after・依存の読み込み・トリガー（when・idle・immediate・timer・interaction・hover・viewport）・prefetch・後片付け・サーバーでの @defer・hydrate トリガー・ハイドレーションの順番

@defer の塊は、テンプレートに書くと ɵɵdefer という命令とトリガーの命令（ɵɵdeferOnViewport など）にコンパイルされ、packages/core/src/defer/ のコードが実行時に動かします。塊ごとに、TView の側の記録（TDeferBlockDetails：各状態のテンプレートの番号、依存を読み込む関数、minimum と after）と、LView の側の記録（LDeferBlockDetails：今の状態、トリガーの後片付けの関数）が作られます。トリガーが発火すると依存を import() で読み込み、placeholder・loading・本体・error のどれかのビューを LContainer に入れ替えます。SSR でハイドレーションを使うときは、hydrate トリガーの付いた塊はサーバーで中身まで描かれ、ブラウザでは脱水のまま残って、トリガーが来たときに親の塊から順にハイドレートされます。このシリーズでは、命令が作る記録、状態の切り替えとその時間の決まり、依存の読み込み、トリガーの 1 つずつの実装、prefetch、後片付け、サーバーでの @defer、hydrate トリガーとハイドレーションの順番、そして spec の読み方を 1 つずつ読みます。テンプレートの構文（compiler-control-flow-blocks）、@defer の依存がコンパイラで import() になるまで（standalone-defer-deps）、テストの道具（testing-defer）、インクリメンタルハイドレーションの概観（incremental-hydration）、イベントの記録と再生（event-replay）はこれまでの章に書いたので、そこへリンクします。ページの上のデモは、このサイトのページに置いた本物の @defer の塊を動かすか、本物の @angular/core 22.1.6 と @angular/platform-server を Node で動かした記録を再生します。各章の最後に、その仕組みの spec と手元での走らせ方を置きます。最終回は、開いている issue を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/defer)

1. [@defer の全体像：命令・記録・状態・トリガー](01-defer-overview.md)  
   テンプレートの @defer がコンパイルで ɵɵdefer とトリガーの命令になり、packages/core/src/defer/ の各ファイル（instructions・interfaces・utils・rendering・triggering・timer\_scheduler・idle\_scheduler・dom\_triggers・cleanup・registry・discovery）がどう分担して動かすか。塊が placeholder から本体に変わるまでの道筋の全体図と、各章へのリンク。
2. [ɵɵdefer 命令：最初の creation pass で塊の記録を作る](02-defer-instruction.md)  
   ɵɵdefer が最初の creation pass で TDeferBlockDetails を作り、ビューを作るたびに LContainer と LDeferBlockDetails（状態は Initial）を用意し、破棄のときにトリガーを外す登録をするまでの行。引数（各状態のテンプレートの番号・依存の関数・config の番号・flags）がどこから来るか。ɵɵdefer 自身は placeholder を描かず（描くのは後ろのトリガーの命令）、更新のときには呼ばれないこと。
3. [塊の記録：TDeferBlockDetails と LDeferBlockDetails の欄](03-defer-details.md)  
   interfaces.ts の TDeferBlockDetails（loadingState・dependencyResolverFn・loadingPromise・各テンプレートの番号・placeholderBlockConfig・loadingBlockConfig・flags）と LDeferBlockDetails（今の状態・トリガーの後片付け・state の予定）、DeferBlockState と DeferBlockInternalState の違い、utils.ts の getTemplateIndexForState・getMinimumDurationForState などの読み出し。
4. [状態を描く：renderDeferBlockState と applyDeferBlockState](04-defer-render-state.md)  
   renderDeferBlockState が今の状態と比べて切り替えを決め（isValidStateChange）、applyDeferBlockState が LContainer の中のビューを消して新しい状態のテンプレートのビューを入れる行。本体のビューに渡す注入器（createDeferBlockInjector・getOrCreateEnvironmentInjector）と、ハイドレーションの脱水されたビューを探す行。
5. [ちらつきを防ぐ：minimum と after のタイマー](05-defer-minimum-after.md)  
   applyDeferBlockStateWithScheduling・scheduleDeferBlockUpdate が、loading の after（表示を遅らせる）と minimum（最低限表示する）、placeholder の minimum を TimerScheduler の予定に直す行と、予定のあいだに来た次の状態を NEXT\_DEFER\_BLOCK\_STATE に覚えて予定が明けたら描く扱い。ɵɵdeferEnableTimerScheduling が、minimum や after を書いた塊でだけ渡され、consts の設定を tDetails に置いてタイマー付きの描き方を差し込む理由。
6. [依存を読み込む：triggerResourceLoading](06-defer-resource-loading.md)  
   triggerResourceLoading が dependencyResolverFn を呼んで import() を始め、Promise.allSettled で待ち、読み込んだディレクティブとパイプを TView の registry に足す（addDepsToRegistry）行、失敗したときに Failed になって error のテンプレートを出す行、DEFER\_BLOCK\_DEPENDENCY\_INTERCEPTOR、読み込み中の PendingTasks、2 つのトリガーが同時に来たときに loadingPromise を共有する行。
7. [トリガーから描画まで：triggerDeferBlock と shouldTriggerDeferBlock](07-defer-trigger-flow.md)  
   どのトリガーも最後に呼ぶ triggerDeferBlock が、shouldTriggerDeferBlock でサーバーとテストの Manual を除き、ほかのトリガーをすべて外してから、loadingState に応じて loading を出して読み込みを始める・同じ Promise を待つ・すぐ本体・すぐエラーに分かれ、読み込みの後に本体を出す（renderDeferStateAfterResourceLoading）順番。cleanup.ts がトリガーの後片付けの関数を種類ごとにしまい、本体の発火では全部、prefetch の発火では prefetch の分だけを外す行。
8. [when のトリガー：式が真になったときだけ](08-defer-when.md)  
   ɵɵdeferWhen が、update pass のたびに bindingUpdated で値の変化を確かめ、偽で未描画なら placeholder を、真に変わったときだけ triggerDeferBlock を呼ぶ行。いちど本体を出したあとに偽へ戻っても戻らない理由と、signal を読む when 式が変更検知とどうつながるか、OnPush の中でふつうのフィールドを読む when。
9. [on idle と on immediate：requestIdleCallback と次の描画](09-defer-idle-immediate.md)  
   ɵɵdeferOnIdle が onIdleWrapper で IdleScheduler に頼み、IdleScheduler が requestIdleCallback（無ければ setTimeout）で塊ごとの関数をまとめて呼ぶ行、idle の timeout の指定、ɵɵdeferOnImmediate が予定を作らずにすぐ発火する行。injectAsync の章と共有する IdleScheduler は差分だけを書く。
10. [on timer：TimerScheduler が 1 つの setTimeout で並べる](10-defer-timer.md)  
   ɵɵdeferOnTimer と scheduleTimerTrigger、TimerScheduler が「時刻と関数」を平らな配列に並べて、いちばん早い時刻にだけ setTimeout を張り直す行（add・remove・scheduleTimer）。minimum と after もこれを使う。後片付けで予定を消す行。
11. [on interaction と on hover：トリガーの要素を見つけてリスナーを共有する](11-defer-dom-triggers.md)  
   ɵɵdeferOnInteraction・ɵɵdeferOnHover が registerDomTrigger で、placeholder の中や親のビューにあるトリガーの要素（getTriggerLView・getTriggerElement と walkUpTimes）を探し、要素が描かれるのを待ってから primitives/defer の onInteraction・onHover（click と keydown、mouseenter・mouseover・focusin）を付ける行。同じ要素に付いた複数の塊がリスナーを共有する WeakMap。
12. [on viewport：IntersectionObserver を共有する](12-defer-viewport.md)  
   ɵɵdeferOnViewport と onViewportWrapper、primitives/defer の onViewport と createIntersectionObserver が、同じ options の IntersectionObserver を 1 つにまとめて数を数える行（getIntersectionObserverKey）、rootMargin などの options、要素が見えたときに呼ぶ関数と後片付け。
13. [prefetch：本体を出さずに依存だけ先に読む](13-defer-prefetch.md)  
   prefetch on・prefetch when の命令が、triggerPrefetching で依存の読み込みだけを始める行と、そのあと本体のトリガーが来たときに読み込み済みの依存を使う流れ。scheduleDelayedPrefetching、prefetch と本体のトリガーで後片付けの関数を分けてしまう理由。
14. [入れ子・注入器・クエリ：塊の中のビューが外とつながる所](14-defer-nested-di.md)  
   塊の中の塊、本体のビューの注入器の親（NodeInjector の道と、読み込んだ依存の providers を持つ環境の注入器）、@defer の中の要素を外のクエリが見つけるまで、content projection を塊に入れたとき。defer\_spec.ts の nested blocks・DI・queries・content projection の場面で確かめる。
15. [サーバーでの @defer：placeholder を出す理由](15-defer-server.md)  
   platform-server で描画するとき、shouldAttachTrigger がトリガーの種類ごとに答えを変え、ふつうのトリガーは placeholder を描いて shouldTriggerDeferBlock で止まる行（when が最初から true の塊と on immediate ＋ @loading の塊は placeholder も出ない）。hydrate トリガーの付いた塊だけが triggerDeferBlock(Hydrate) で依存を読んで中身まで描かれる分かれ道と、ハイドレーションの情報（s・dN・\_\_nghDeferData\_\_・ngh=dN・jsaction）に塊がどう記録されるか（詳しくは hydration-annotate・incremental-hydration へリンク）。
16. [hydrate トリガーの命令：ɵɵdeferHydrateOn と processAndInitTriggers](16-defer-hydrate-triggers.md)  
   ɵɵdeferHydrateOnTimer・ɵɵdeferHydrateOnImmediate・ɵɵdeferHydrateWhen・ɵɵdeferHydrateOnHover などが、どれも shouldAttachTrigger(Hydrate) を確かめて hydrateTriggers の Map に書き、サーバーではその場で triggerDeferBlock(Hydrate) で中身を描き、ブラウザでは timer・idle を予約・immediate をすぐ開始・viewport・hover・interaction・never は何もしない行。ハイドレーションの後に processAndInitTriggers が入れ子の塊も含めて timer・idle・immediate・viewport のトリガーを張る行と、interaction・hover が jsaction の道に回る理由。
17. [塊のハイドレーション：親から順に目を覚ます](17-defer-hydration-queue.md)  
   triggerHydrationFromBlockName が DehydratedBlockRegistry から塊と親の連なり（getParentBlockHydrationQueue）を取り、triggerHydrationForBlockQueue が親の塊から 1 つずつ依存を読み込み、描画を待ち（nextRender）、子へ進む行。失敗した塊の後始末（cleanupRemainingHydrationQueue）と、ハイドレーションが済んだ塊を registry から消す行。
18. [hydrate on interaction のイベント：jsaction から塊のハイドレーションへ](18-defer-hydrate-events.md)  
   hydrate on interaction・hover の塊で、サーバーが付けた jsaction の属性から、ブラウザの EventContract がイベントを捕まえ、塊の id を見つけてハイドレーションを始め、ハイドレーションの後にそのイベントを本物のリスナーに渡し直すまで。event-replay の章の道との違い。
19. [@defer のテストを読む：defer\_spec と incremental\_hydration\_spec](19-defer-tests.md)  
   packages/core/test/acceptance/defer\_spec.ts（約 5600 行）の describe の地図と、依存の読み込みを止める書き方（DEFER\_BLOCK\_DEPENDENCY\_INTERCEPTOR や手作りの Promise）、タイマーを進める書き方。packages/platform-server/test/incremental\_hydration\_spec.ts がサーバーで描いた HTML をブラウザ側でハイドレートする書き方。手元での走らせ方と、@defer の不具合を spec の形で再現する手順。
20. [issue と PR を読む：@defer とインクリメンタルハイドレーションの今](20-defer-issues.md)  
   area: core の @defer とインクリメンタルハイドレーションに関わる開いている issue と、この 1 年に閉じた issue の表。どの issue がこのシリーズのどの章の行に関係するか、最近入った修正の読み方と、その修正に付いた spec。
