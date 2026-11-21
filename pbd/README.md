[目次](../README.md)

# platform の説明文の読み残し

> bootstrapApplication・provideClientHydration・レンダラーとイベント・Meta と Title・platform-server・platform-browser-dynamic の説明文を、本物の動きと突き合わせる

起動・DOM レンダラー・SSR のシリーズで、platform-browser と platform-server の動く行は読みました。それでも、bootstrapApplication・createApplication・provideClientHydration と with\* の機能・Meta・enableDebugTools・renderApplication・platform-browser-dynamic には、1 行も引いていない説明文（JSDoc）と例が残っています。このシリーズでは説明文を 1 段落ずつ読み、そこに書かれた約束を本物のパッケージを動かして確かめ、最後に spec と issue を読みます。

全 7 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/pbd)

1. [bootstrapApplication と BrowserModule の説明文](01-pbd-browser.md)  
   platform-browser/src/browser.ts の未読の説明文：bootstrapApplication の例（selector の無いルートは NG05104）と引数、BootstrapContext（サーバーでは必須で、渡すとブラウザーの platform の provider は足されない）、createApplication（platform は使い回し、あとの platformBrowser() は開発モードだけ NG0400）、provideProtractorTestingSupport の説明に無い option、BrowserModule の古い一文と二重読み込みの例外。
2. [provideClientHydration と with\* の説明文](02-pbd-hydration.md)  
   platform-browser/src/hydration.ts の未読の説明文：既定の機能の一覧（202 行目の書式の抜けと、既定で入るイベントの再生）、withI18nSupport・withEventReplay の約束を platform-server で描いた HTML と並べ、64 通りの with\* の組み合わせの provider と、開発モードだけの矛盾の例外（本番は片方が黙って勝つ）を確かめる。
3. [レンダラーとイベントの説明文：DomRenderer・SharedStylesHost・EventManager・key\_events](03-pbd-dom.md)  
   platform-browser/src/dom の events/event\_manager.ts・event\_manager\_plugin.ts・key\_events.ts・dom\_renderer.ts・shared\_styles\_host.ts・util.ts の未読の説明文：EVENT\_MANAGER\_PLUGINS の置き場所、キーの名前の決まり（keydown.shift.enter・code.\* など 20 の名前を本物のテンプレートで当てる）、addEventListener の戻り値、REMOVE\_STYLES\_ON\_COMPONENT\_DESTROY、開発モードだけの addBaseHrefToCssSourceMap、exportNgVar。
4. [Meta・Title・enableDebugTools・Safe\* の説明文](04-pbd-meta-tools.md)  
   platform-browser/src/browser/meta.ts・title.ts・tools/\*・security/dom\_sanitization\_service.ts の未読の説明文：Meta の selector の形（updateTag・removeTag の形は例外になる）と addTag・updateTag・removeTag を本物の head で、Title、enableDebugTools と profiler.timeChangeDetection が zoneless で何を測るか、Safe\* の印の型。
5. [platform-server の説明文：renderApplication・provideServerRendering・INITIAL\_CONFIG](05-pbd-server.md)  
   platform-server/src の utils.ts・provide\_server.ts・transfer\_state.ts・domino\_adapter.ts・location.ts の未読の行：renderApplication と renderModule の説明文と例、document・url・platformProviders と INITIAL\_CONFIG、TransferState の書き出しと BEFORE\_APP\_SERIALIZED の順、provideServerRendering の例、DominoAdapter の残り。
6. [platform-browser-dynamic の説明文：JIT の platform と ResourceLoader](06-pbd-dynamic.md)  
   platform-browser-dynamic の public\_api.ts と src の compiler\_factory.ts・platform\_providers.ts・resource\_loader/resource\_loader\_impl.ts・version.ts：platformBrowserDynamic が置くもの、JitCompilerFactory が今は何もしないこと、COMPILER\_OPTIONS が効く場所、ResourceLoaderImpl と templateUrl。
7. [spec と issue を読む：platform の説明文を固めているもの](07-pbd-tests-issues.md)  
   packages/platform-browser・platform-server・platform-browser-dynamic の test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか、手元での走らせ方と結果、issue の表と、このシリーズで見つけた食い違い。
