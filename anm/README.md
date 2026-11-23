[目次](../README.md)

# animations の説明文の読み残し

> trigger・state・transition・query・stagger の DSL、AnimationBuilder とプレイヤー、AST・タイムライン・エンジン・Web Animations の説明文を、本物の動きと突き合わせる

「animations」のシリーズでは、新しい animate.enter・animate.leave と、古い @angular/animations の大筋を読みました。それでも @angular/animations には、1 行も引いていない行が七千行以上残っています。trigger や transition の JSDoc と例（angular.dev の API リファレンスにそのまま載る）、AnimationBuilder とプレイヤーの約束、DSL を AST とタイムラインに変える行、遷移のエンジン、Web Animations のドライバーです。このシリーズでは説明文とコメントを 1 段落ずつ読み、本物の @angular/animations 22.2.6 を動かして確かめ、最後に spec と issue を読みます。

全 9 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/anm)

1. [trigger・state・style・animate の説明文](01-anm-trigger-state.md)  
   animations/src/animation\_metadata.ts の前半の未読の行：AnimationMetadataType、trigger と state と style と animate の説明と例、timings の文字列の形、AUTO\_STYLE と「\*」。説明に書かれた約束を本物で確かめる。
2. [transition・group・sequence・keyframes・query・stagger の説明文](02-anm-transition-query.md)  
   animation\_metadata.ts の後半の未読の行：transition の式（:enter・:leave・:increment・関数）、group と sequence、keyframes の offset、query の limit と optional、stagger、animateChild と useAnimation と animation の params。
3. [AnimationBuilder とプレイヤーの説明文](03-anm-builder-players.md)  
   animations/src の animation\_builder.ts・players/animation\_player.ts・players/animation\_group\_player.ts・animation\_event.ts・errors.ts の未読の行：build と create が setProperty の命令になる道、AnimationPlayer の各メソッドの約束と 3 種のプレイヤーで記録した onStart・onDone・onDestroy の順、AnimationGroupPlayer の totalTime、AnimationEvent の各値、3000 番台のエラーの番号。
4. [DSL を AST にする：animation\_ast\_builder と transition\_factory](04-anm-ast.md)  
   animations/browser/src/dsl の animation\_ast\_builder.ts・animation\_ast.ts・animation.ts・animation\_transition\_factory.ts・animation\_transition\_instruction.ts・animation\_trigger.ts・animation\_transition\_expr.ts の未読の行：誤った DSL の検査とエラー（開発モードと本番）、働かない検査、:self の正規表現、遷移の式の照合、state のスタイルと params の既定。
5. [タイムラインを組む：animation\_timeline\_builder](05-anm-timeline.md)  
   animations/browser/src/dsl/animation\_timeline\_builder.ts の未読の行：頭のコメントが約束する時間の数え方、startTime と duration、group と sequence の分かれ方、keyframes と query と stagger の遅れ、animateChild の keyframe の引き延ばし。本物の build でタイムラインを取り出して並べ、コメントの例と stagger('full') の食い違いを見る。
6. [遷移のエンジン：TransitionAnimationEngine ほか](06-anm-engine.md)  
   animations/browser/src/render の transition\_animation\_engine.ts・timeline\_animation\_engine.ts・animation\_engine\_next.ts・animation\_renderer.ts の未読の行：トリガーの値と params だけの変化、リスナー、名前空間の並び、途中での置き換え、親子と animateChild、@.disabled、\* と ! のスタイル、AnimationBuilder の側のエンジン。
7. [Web Animations のドライバーとスタイルの小道具](07-anm-driver.md)  
   render/web\_animations/\*・animation\_driver.ts・special\_cased\_styles.ts・shared.ts・util.ts・style\_normalization・error\_helpers.ts の未読の行：AnimationDriver の約束、Web Animations で動かせるプロパティ、単位の補い、display と position の扱い、WebAnimationsPlayer の reset、エラーの文。
8. [provideAnimations と BrowserAnimationsModule の説明文](08-anm-module.md)  
   platform-browser/animations の module.ts・providers.ts・animations.ts と async の providers.ts、core/src/animation と render3/instructions/animation.ts の未読の行：provideAnimations・provideAnimationsAsync・provideNoopAnimations・withConfig の説明と、設定ごとに本物で起動した記録、新しい animate.enter との関係。
9. [spec と issue を読む：animations の説明文を固めているもの](09-anm-tests-issues.md)  
   packages/animations の spec が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、area: animations の issue の表と、このシリーズで見つけた食い違い。
