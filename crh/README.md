[目次](../README.md)

# core の説明文の読み残し（3）

> ハイドレーション・@defer・resource・Renderer2・開発用の小道具の説明文とコメントを、本物の動きと突き合わせる

core の説明文を読む 3 回目です。packages/core/src の hydration・defer・resource・render・util には、SSR とハイドレーションや @defer のシリーズで動く行を読んだあとも、1 行も引いていない説明文（JSDoc）とコメントが残っています。ngh の書き出しの形、ハイドレーションの不一致のエラー文、@defer のトリガーの約束、resource() と httpResource の状態、Renderer2 の各メソッド、開発モードの assert と画像の警告などです。このシリーズでは説明とコメントを 1 段落ずつ読み、そこに書かれた約束を本物の @angular/core と platform-server を動かして確かめ、最後に spec と issue を読みます。

全 8 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/crh)

1. [ハイドレーションの公開 API と型の説明文](01-crh-hydration-api.md)  
   hydration/api.ts・interfaces.ts・tokens.ts・event\_replay.ts の未読の行：withDomHydration の約束、SerializedView ほか ngh の型のコメント、トークンとイベントの再生の説明。本物の platform-server で描いた HTML と、それをハイドレートした記録と並べる。
2. [ngh の書き出しの説明文：annotate と utils](02-crh-hydration-annotate.md)  
   hydration/annotate.ts・utils.ts の未読の行：どのビューに何を書くか、コンテナーとテンプレートの印、skip と省略のコメント。本物の SSR の出力の ngh を 1 項目ずつ読む。
3. [ノードの探し方と不一致のエラーの説明文](03-crh-hydration-errors.md)  
   hydration/node\_lookup\_utils.ts・error\_handling.ts・i18n.ts の未読の行：DOM のノードをどう探すか、NG0500 ほか不一致のエラー文の組み立て（属性の空白が消える）、i18n のブロックのハイドレーション。わざと不一致を作って本物の文を見る。
4. [@defer の実装のコメントと説明文](04-crh-defer.md)  
   defer/instructions.ts・triggering.ts・rendering.ts の未読の行：各トリガー（idle・viewport・interaction・hover・timer・immediate）と prefetch の約束、minimum と after、ハイドレーションの trigger。本物で状態の移り変わりを記録する。
5. [resource() の説明文：状態・params・reload・stream](05-crh-resource.md)  
   resource/api.ts・resource.ts の未読の行：ResourceStatus の各値、params が undefined のとき、reload と abort、set と update でローカルになる約束、stream の形、hasValue と error。本物の resource で状態の表を作り、reload の説明文と stream の undefined の食い違いを見る。
6. [Renderer2 の各メソッドと、i18n の token・animation の検査の説明文](06-crh-renderer.md)  
   render/api.ts・api\_flags.ts、i18n/tokens.ts・locale\_data\_api.ts、animation/utils.ts の未読の行：Renderer2 の各メソッドの約束（namespace・flags・listen の戻り値）、RendererStyleFlags2 の Important が camelCase で効かないこと、DEFAULT\_CURRENCY\_CODE・TRANSLATIONS の例のコード、animate.enter の検査。章の中で inject した本物の Renderer2 で確かめる。
7. [開発用の小道具の説明文：assert・ngDevMode・画像の警告・profiler](07-crh-dev-utils.md)  
   util/\*（ng\_dev\_mode.ts・is\_dev\_mode.ts・assert.ts・stringify.ts・decorators.ts・array\_utils.ts ほか）、image\_performance\_warning.ts、profiler.ts、util/security/trusted\_types\_bypass.ts の未読の行：本番で消える仕組み（本番と開発の JS を数える）、画像の lazy の LCP と大きすぎの警告の条件、SSR の 🅰️ の印と setProfiler の印。
8. [spec と issue を読む：core の説明文（3）を固めているもの](08-crh-tests-issues.md)  
   packages/core/test と platform-server の spec が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、area: core・core: hydration・core: defer の issue の表と、このシリーズで見つけた食い違い。
