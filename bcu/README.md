[目次](../README.md)

# @angular/build の compilation と utils の読み残し

> AotCompilation・ParallelCompilation と worker・hmr-candidates と typescript-printer・AngularHost と lazy-routes-transformer・bundle-calculator と stats-table・index-file・auto-csp・options の正規化・path/url/source-map・spec と issue

「application builder の読み残し」と「tools/esbuild の読み残し」で、builder の入口と esbuild のプラグインの周りを埋めました。それでも @angular/build には、ng build のたびに必ず通るのに 1 行も引いていない行が、2 つの場所にまとまって残っています。1 つは tools/angular の下で、AOT コンパイルの残り、ワーカーに逃がす並列コンパイル、HMR で差し替えてよいコンポーネントを見分ける hmr-candidates、TypeScript のホストと遅延ルートの書き換えです。もう 1 つは utils の下で、予算の計算と出力の表、index.html の仕上げ、自動 CSP、オプションの正規化、パスと URL とソースマップの小道具です。このシリーズではそれを順に埋め、最後に spec と issue を読みます。デモは本物の @angular/build を Node で動かした記録を再生します。

全 10 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/bcu)

1. [AotCompilation の残り：プログラムの作り直し・診断・出力の書き出し](01-bcu-aot.md)  
   tools/angular/compilation/aot-compilation.ts の未読の行と、angular-compilation.ts（AngularCompilation の土台）・compiler-options.ts・diagnostics.ts：tsconfig の読み込みと上書き、差分の再コンパイル、診断の集め方と esbuild のメッセージへの変換、emitAffectedFiles。
2. [ParallelCompilation：コンパイルをワーカーに逃がす](02-bcu-parallel.md)  
   tools/angular/compilation/parallel-compilation.ts と parallel-worker.ts、jit-compilation.ts・typescript-compilation.ts の未読の行：ワーカーに渡す InitRequest と MessagePort、スタイルの変換をメインに頼み返す番号つきの依頼、成功と失敗で閉じるポート、update で溜める変わったファイル、JitCompilation と AOT・JIT の共通の親 TypeScriptCompilation。
3. [hmr-candidates と typescript-printer：差し替えてよいコンポーネントを見分ける](03-bcu-hmr.md)  
   tools/angular/compilation/hmr-candidates.ts の未読の行と typescript-printer.ts の全部：デコレーターと @Component のフィールドの比べ方、構文木の範囲を文字で比べる equalRangeText、styleUrls が対応外になる 'stylesUrl' の綴り、Angular の変換の結果をソースマップつきで印刷する内部の API。
4. [AngularHost・uri・lazy-routes-transformer：ホストの差し替えと遅延ルートの書き換え](04-bcu-host.md)  
   tools/angular/angular-host.ts・uri.ts・transformers/lazy-routes-transformer.ts の未読の行：SourceFile の version、モジュール解決の包みと fileReplacements、リソースの名前の解決と外部のランタイムのスタイルの ID、JIT の名前空間の URI、loadComponent / loadChildren に ɵentryName を足す相手の探し方。
5. [予算と出力の表：bundle-calculator と stats-table の残り](05-bcu-budget.md)  
   utils/bundle-calculator.ts と stats-table.ts の未読の行：予算の計算が受け取る webpack の形の型、チャンクの大きさを足す Calculator の土台、届かない分岐の文言、ブラウザとサーバーを分ける表と private の表、列の数と幅のそろえ方と行の末尾に残る区切り。
6. [index.html の仕上げ：augment-index-html・IndexHtmlGenerator・inline-fonts の残り](06-bcu-index.md)  
   utils/index-file の augment-index-html.ts・index-html-generator.ts・inline-fonts.ts の未読の行：crossorigin と SRI の既定、遅延チャンクの integrity を載せる importmap（と &lt;base&gt; との並び）、ヒントの属性、lang と dir、image の preconnect、生成器の型と読み込みのエラー、Google Fonts と Adobe Fonts の取りに行き方。
7. [自動 CSP：auto-csp.ts がインラインの script をハッシュとローダーに変える](07-bcu-auto-csp.md)  
   utils/index-file/auto-csp.ts の全部：index.html の script を集め、インラインのものに sha256 のハッシュを付け、外部の script を読み込むローダーに置き換え、meta の Content-Security-Policy を足すまで。
8. [オプションの小道具：environment-options・i18n-options・normalize-\*・postcss・proxy](08-bcu-options.md)  
   utils の environment-options.ts・i18n-options.ts・normalize-asset-patterns.ts・normalize-cache.ts・postcss-configuration.ts・load-proxy-config.ts の未読の行：NG\_ で始まる環境変数、ロケールと翻訳ファイルの読み込み、assets とキャッシュの正規化、PostCSS の設定と proxy の設定の探し方。
9. [パス・URL・ソースマップ・版の小道具：path・url・source-map・hash・version](09-bcu-paths.md)  
   utils の path.ts・url.ts・source-map.ts・hash.ts・version.ts の未読の行：POSIX への正規化と中かの判定、URL の前後の / と結合、ソースマップのコメントの検出・削除・読み込み、xxHash、Angular の版の検査。
10. [spec と issue を読む：compilation と utils を固めているテスト](10-bcu-tests-issues.md)  
   tools/angular と utils の \*\_spec.ts と builders の tests が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で足した it、@angular/build の開いている issue のうちこのシリーズの行に当たるものの表と、見つけた食い違いと不具合。
