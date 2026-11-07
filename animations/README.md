[目次](../README.md)

# アニメーションの内側

> animate.enter / animate.leave と、旧 @angular/animations

Angular のアニメーションは今 2 つあります。v20.2 で core に入った animate.enter / animate.leave は、要素に CSS のクラスを付けて、ブラウザのアニメーションが終わるのを待ってから外します。v20.2 で非推奨になり v23 で削除予定の @angular/animations は、trigger や transition の DSL をキーフレームに組み立て、専用のレンダラーとエンジンで動かします。このシリーズは、テンプレートの animate.enter が命令になるところから、アニメーションの待ち行列、いちばん長いアニメーションの見つけ方、要素を消すのを遅らせる仕組み、入れ子と並べ替え、スタイルの後片付けまでを実際の行で 1 ステップずつ読み、旧エンジンのレンダラー・DSL・TransitionAnimationEngine、2 つが同居するときと移行、テストの仕方へ進みます。新しい仕組みのテストはブラウザでしか走らないので、各章の最後に「どの spec が確かめていて、手元のブラウザでどう走らせ、直すならどのファイルか」を置きます。最終回は、この 1 年に直された 50 件の issue と最近の変更を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/animations)

1. [アニメーションの全体像：core の animate.enter / leave と @angular/animations](01-animations-overview.md)  
   2 つの仕組みがどのパッケージのどのファイルにあるかの地図。@angular/animations の @deprecated 20.2（v23 で削除予定）と、それを巡る issue。新しい仕組みの spec（acceptance/animation\_spec.ts）が Node では isNode で中身を飛ばし、ブラウザ版の acceptance\_web でだけ走ること、その走らせ方と件数の読み方。旧エンジンの spec の置き場。
2. [テンプレートから命令へ：animate.enter が ɵɵanimateEnter になるまで](02-animations-compile.md)  
   animate.enter="cls"・\[animate.enter\]・(animate.leave)="fn($event)" を BindingParser と template pipeline（ingest・binding\_specialization・convert\_animations・reify）がどう見分けて ɵɵanimateEnter / ɵɵanimateEnterListener / ɵɵanimateLeave / ɵɵanimateLeaveListener を出すか。名前を確かめていないので animate.entr が leave になる issue と、それを直す PR。
3. [命令がすること：LView の ANIMATIONS に「あとで走らせる関数」を登録する](03-animations-instructions.md)  
   ɵɵanimateEnter と ɵɵanimateLeave が、サーバーでの実行・getAnimations の無い環境・ANIMATIONS\_DISABLED で早く戻る行、NgZone をその場で取っておく理由、addAnimationToLView が LView の ANIMATIONS（enter / leave の Map）に TNode の index ごとに関数を積む仕組み。この時点ではまだ何も動かないこと。
4. [アニメーションの待ち行列：ANIMATION\_QUEUE と afterNextRender](04-animations-queue.md)  
   ルートの環境インジェクタに 1 つだけ作られる ANIMATION\_QUEUE（Set と isScheduled）、scheduleAnimationQueue が afterNextRender で 1 回だけ流す仕組み、Set で同じ関数を 2 回走らせない理由。node\_manipulation.ts が要素を DOM に入れる直前（Create = コンテンツ投影、Insert = @if / @for）に maybeQueueEnterAnimation で enter の関数を積み直す行と、命令のところと合わせて 2 か所で積む理由。
5. [animate.enter のクラス：付けて、終わったら外す](05-animations-enter-classes.md)  
   runEnterAnimation がクラスを addClass し、animationstart / transitionstart を受けてから animationend / transitionend を聞く 2 段の仕組み、子の要素から泡立ってきたイベントを target で弾く行、次のフレームでアニメーションが無いと分かったらすぐクラスを外す requestAnimationFrame、enterClassMap に後片付けの関数を持つ理由。
6. [いちばん長いアニメーション：getAnimations と getComputedStyle](06-animations-longest.md)  
   determineLongestAnimation が element.getAnimations() から、それが空なら getComputedStyle の animation-duration・transition-duration・delay から長さを計算する行（繰り返しの回数は掛けない）、longestAnimations の WeakMap、isLongestAnimation が終わったイベントの Animation の長さを 1 ms の誤差で比べ、無ければ名前で照らし合わせる仕組み、無限に繰り返すアニメーションの扱い（#67350）。core/test/animation/longest\_animation\_spec.ts。
7. [関数で動かす：(animate.enter) と (animate.leave) と animationComplete](07-animations-functions.md)  
   イベントの形で書いた (animate.enter)="fn($event)" が AnimationCallbackEvent（target と animationComplete）を受け取る仕組み、enter では animationComplete が何もしない理由、leave では呼ぶまで要素が消えず、呼び忘れたときに MAX\_ANIMATION\_TIMEOUT（既定 4000 ms）で消える行。クラス名を関数や signal で渡す AnimationClassBindingFn と getClassListFromValue。
8. [アニメーションが動かないとき：ANIMATIONS\_DISABLED・SSR・getAnimations](08-animations-disabled.md)  
   areAnimationSupported が ngServerMode と document.documentElement.getAnimations の有無で決まる行、ANIMATIONS\_DISABLED トークンで止めたとき enter は何もせず、(animate.leave) だけは登録を続けてすぐ消す理由。サーバーで描いたページやハイドレーション、jsdom のテスト環境（getAnimations が無い）で何が起きるか。
9. [要素を消すのを遅らせる：runLeaveAnimationsWithCallback](09-animations-leave-removal.md)  
   ビューを外すとき node\_manipulation.ts の Detach と Destroy が、すぐ removeChild せずに runLeaveAnimationsWithCallback へ「消す関数」を渡す行。leave アニメーションが無ければその場で消し、あれば待ち行列に executeLeaveAnimations を積み、すべての Promise が終わってから消す流れ。インジェクタが壊れたあとの逃げ道と、enter を取り消す行。
10. [animate.leave のクラス：付けて、終わりを待って、消す](10-animations-leave-classes.md)  
   animateLeaveClassRunner が動いている enter を止め、クラスを付けて offsetWidth で再計算させ、いちばん長いアニメーションの終わりで LView に置いた resolvers を全部呼ぶ仕組み。次のフレームでアニメーションが無いと分かったときの即時の片付けと、終わりのイベントが来ないとき長さ + 50 ms で片付ける setTimeout、ng-content を持つコンポーネントのホスト要素だけクラスを外す理由。22.1.6 の配布物では offsetWidth の行が rollup の設定で消えていること。
11. [入れ子の leave：子孫と埋め込みビューのアニメーションを集めて待つ](11-animations-leave-nested.md)  
   外す要素の子孫で leave を持つものを、同じ LView の leave の Map から親をたどって探す aggregateDescendantAnimations、埋め込みビューへ降りて集める collectNestedViewAnimations と collectAllViewLeaveAnimations（子コンポーネントのビューには降りない）、すべてを待ってから消す runAfterLeaveAnimations。入れ子の leave が入って、戻されて、コンポーネントの境目で絞って入れ直された経緯（#67552・#67633）と、集めるだけのつもりで関数を呼んでしまう判定。
12. [並べ替えと出し直し：leave の途中で戻ってきた要素](12-animations-leave-reorder.md)  
   @for の並べ替えでビューを外してすぐ入れ直すとき、leavingNodes・cancelLeavingNodes・reusedNodes が「消える途中の要素」を取り消したり重複を消したりする仕組み、control\_flow.ts の clearDetachAnimationList と detachedLeaveAnimationFns で待ち行列から関数を抜く行。acceptance の「animation element duplication」の spec。
13. [スタイルの後片付け：leave の間はコンポーネントの CSS を消さない](13-animations-styles-teardown.md)  
   コンポーネントが壊されるとき NoneEncapsulationDomRenderer.destroy がスタイルを外す行と、allLeavingAnimations（leave 中の LView の ID の Set）が空でない間は外さない理由、命令・node\_animations.ts・control\_flow.ts が ID を足し引きする 7 か所。(animate.leave) は要素を作った時点で足すため、スタイルのタグが残り続ける開いている issue #66244 と、どこを直せばよいかの入口。
14. [旧 @angular/animations の入口：provideAnimations と AnimationRenderer](14-animations-legacy-setup.md)  
   provideAnimations・provideAnimationsAsync・provideNoopAnimations が入れるもの、AnimationRendererFactory が DomRendererFactory2 を包み、\[@trigger\] の setProperty と (@trigger.done) の listen を横取りする行、begin / end で変更検知の終わりにエンジンを flush する仕組み、provideAnimationsAsync がエンジンを別のチャンクで後から読む流れ。
15. [旧 DSL がキーフレームになるまで：trigger から timeline へ](15-animations-legacy-dsl.md)  
   trigger・state・transition・style・animate・query・stagger・group・sequence が返すメタデータのオブジェクト、AnimationAstBuilder が検証して AST にする行、"void =&gt; \*" や ":enter" を関数にする transition の式、AnimationTransitionFactory と AnimationTimelineBuilder が時間とスタイルを積んでキーフレームの命令を作る手順。
16. [TransitionAnimationEngine：トリガーの値が変わってからプレイヤーが動くまで](16-animations-legacy-engine.md)  
   trigger() が値の変化を待ち行列に積み、removeNode が leave アニメーションの終わりまで要素を DOM に残し、flush がまとめて遷移を解いて query の要素を集め、WebAnimationsDriver が作った WebAnimationsPlayer が play のときに element.animate() を呼ぶまで。done のコールバックが呼ばれる順番と、プレイヤーを止めるとき（destroy でも done は呼ばれる）。
17. [2 つが同居するとき：旧エンジンのレンダラーと animate.leave](17-animations-legacy-compat.md)  
   @angular/animations を入れたアプリで animate.leave を使うと、要素を消す役が旧エンジンのレンダラーに渡る。BaseAnimationRenderer.removeChild の requireSynchronousElementRemoval と、その TODO、acceptance の「legacy animations compatibility」の spec、同居で要素が残った issue。2 つのどちらが先に消すかを 1 本の流れで追う。
18. [移行：@angular/animations から animate.enter / animate.leave へ](18-animations-migration.md)  
   旧 DSL の書き方ごとに、CSS と animate.enter / leave でどう書き直せるか（:enter / :leave、state、params、query と stagger、group）と、書き直せないもの。移行の自動化（schematic）が今あるかをソースで確かめる。v23 での削除を延ばしてほしいという issue が挙げる「足りないもの」を、ここまでの章の行に当てはめて読む。
19. [アニメーションのテスト：ブラウザでしか確かめられないもの](19-animations-testing.md)  
   acceptance の animation\_spec.ts が beforeEach で resetTestEnvironment し直してアニメーションを有効にする仕組み、tickAnimationFrames が requestAnimationFrame を 16.6 ms の tick にする行、旧エンジンの MockAnimationDriver と NoopAnimationsModule。このサイトの ng test（Vitest + jsdom）で animate.enter が何もしないことを確かめ、利用者が自分のテストで何を確かめられるか。
20. [animations の issue と変更を読む：直されたバグから学ぶ](20-animations-issues.md)  
   core: animations のラベルで閉じた 50 件の issue を、このシリーズのどの章の仕組みの話かで分け（並べ替えと出し直しが 10 件、入れ子の leave が 7 件）、報告が 20.2 の直後に集中したこと、入れ子の leave が「入れる → 取り消す → コンポーネントの境界で入れ直す」と往復したことを追う。開いている issue と PR、この 1 年のコミット 30 件が ../angular に入っているか、#64423 の修正と spec、外から入った #69291 の修正。新しいバグの報告を手元のブラウザ版の spec で再現する手順。2026-11-01 時点のスナップショット。
