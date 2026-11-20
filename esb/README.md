[目次](../README.md)

# tools/esbuild の読み残し：束ね方の設定・JS の後処理・watch・i18n の差し込み・スタイル・コンパイラプラグインの残りを行で埋める

> application-code-bundle・JavaScriptTransformer・watcher・I18nInliner・StylesheetPluginFactory と Sass/Less・compiler-plugin の残りと compilation-state・spec と issue

「application builder の読み残し」で、options の正規化・結果の形・BundlerContext・キャッシュ・小さなプラグインを埋めました。それでも @angular/build の tools/esbuild には、ng build と ng serve が毎回通るのに 1 行も引いていない行がまとまって残っています。ブラウザ・サーバー・polyfills の束ね方を決める application-code-bundle、Babel で JS を後処理する JavaScriptTransformer とそのワーカー、ファイルの変更を拾う watcher、ビルドの後で翻訳を差し込む I18nInliner、Sass と Less を CSS にするスタイルのプラグイン、そして compiler-plugin の残りです。このシリーズではそれを順に埋め、最後に spec と issue を読みます。デモは本物の @angular/build を Node で動かした記録を再生します。

全 7 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/esb)

1. [束ね方の設定を作る関数：ブラウザ・polyfills・サーバー・SSR の入口の esbuild オプション](01-esb-code-bundle.md)  
   tools/esbuild/application-code-bundle.ts の未読の行：createBrowserCodeBundleOptions・createBrowserPolyfillBundleOptions・createServerPolyfillBundleOptions・createServerMainCodeBundleOptions・createSsrEntryCodeBundleOptions と、共通の getEsBuildCommonOptions・getEsBuildCommonPolyfillsOptions。
2. [JavaScriptTransformer：esbuild に渡す前の JS をワーカーで書き換える](02-esb-js-transformer.md)  
   tools/esbuild/javascript-transformer.ts と javascript-transformer-worker.ts の未読の行：最適化の候補の Buffer の見分け、TransformOptions、同時に走らせる数のセマフォ、キャッシュへの書き込みと close、ワーカー側の依存の遅延読み込み・カバレッジの計装・ソースマップのコメントの切り落としと、何も変わらなかったときに元のバイト列を返す道。
3. [watcher：ファイルの変更を拾って ChangedFiles にまとめるまで](03-esb-watcher.md)  
   tools/esbuild/watcher.ts の未読の行：BuildWatcher と options、パスの正規化と照合のキー、変更をまとめて next() で返す WatcherQueue、cwd の外のファイルを購読する ParcelExternalManager、createParcelWatcher と createChokidarWatcher の add・remove・close。
4. [I18nInliner：ビルドの後で $localize に翻訳を差し込む](04-esb-i18n-inliner.md)  
   tools/esbuild/i18n-inliner.ts・i18n-inliner-worker.ts・i18n-translation-encoder.ts と reader の未読の行：.map の照らし合わせ、翻訳を SharedArrayBuffer に詰める形（頭・索引・置き場）と Blob の道、ロケールの窓とキャッシュの鍵、大きいファイルから配る仕事と結果の組み直し、ワーカーが覚える解析と翻訳とそれを捨てる 3 つの合図、壊れたエスケープとソースマップのつなぎ直し、HMR の inlineTemplateUpdate。
5. [スタイルのプラグイン：StylesheetPluginFactory と Sass・Less・PostCSS の結果](05-esb-styles.md)  
   tools/esbuild/stylesheets の未読の行：言語という値と create、PostCSS を 1 回だけ用意する getter と onStart（失敗のときの扱い）、PostCSS の結果の混ぜ方・警告・依存、Sass のコンパイラ（sass-embedded と JavaScript 版）・パッケージの深い import・警告、Less の読み込み、エラーのときに Sass のスタックから拾う watchFiles、url() のエラーの注とキャッシュの鍵の頭。
6. [compiler-plugin の残り：コンパイルの状態・JIT のコールバック・コンポーネントのスタイル](06-esb-compiler-rest.md)  
   tools/esbuild/angular/compiler-plugin.ts の未読の行（初期化と emit の失敗、プログラムに無いファイル、JSON の置き換え、Web Worker、片付け）、compilation-state.ts（Primary と Secondary の文脈、markAsReady と待ち合わせ）、FileReferenceTracker、jit-plugin-callbacks.ts、component-stylesheets.ts の残り、rewrite-bazel-paths.ts。
7. [spec と issue を読む：tools/esbuild の読み残しを固めているテスト](07-esb-tests-issues.md)  
   tools/esbuild の \*\_spec.ts と builders/application/tests が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、@angular/build の開いている issue のうちこのシリーズの行に当たるものの表。
