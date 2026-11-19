[目次](../README.md)

# application builder の読み残し：options の正規化・結果の形・BundlerContext・キャッシュ・小さなプラグインを行で埋める

> normalizeOptions・ExecutionResult と Result の種類・BundlerContext と後処理の残り・永続キャッシュ・esbuild の小さなプラグインと検査・spec と issue

「CLI とビルド」と「起動の全手順」で、ng build が executeBuild に入って esbuild でコードとスタイルを束ねる流れは読みました。それでも @angular/build の builders/application と tools/esbuild には、まだ 1 行も引いていない行がまとまって残っています。angular.json の options を正規化する normalizeOptions、ビルドの結果を dev-server に渡す ExecutionResult と Result の型、esbuild を包む BundlerContext と後処理の残り、ディスクに残るキャッシュ、そして外部パッケージ・仮想モジュール・wasm・CommonJS の検査などの小さなプラグインです。このシリーズではそれを順に埋め、最後に spec と issue を読みます。デモは本物の @angular/build を Node で動かした記録を再生します。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/abl)

1. [normalizeOptions：angular.json の options がビルドの設定になるまで](01-abl-options.md)  
   builders/application/options.ts の未読の行：ApplicationBuilderExtensions と schema に無い内部の options、normalizeOptions が fileReplacements・loader・outputMode・server・ssr・appShell・index・security を既定値と絶対パスにそろえる段、返す値、入口・外部依存・Tailwind・@angular/core の版を決める補助関数。getLocaleBaseHref は i18n の章が読んだので、記録で値だけを見る。
2. [ビルドの結果の形：ExecutionResult から Full・Incremental・ComponentUpdate の Result へ](02-abl-results.md)  
   tools/esbuild/bundler-execution-result.ts の ExecutionResult、bundler-files.ts の BuildOutputFile と createOutputFile、builders/application/results.ts の ResultKind と Result の型、build-action.ts の未読の行（出力ファイルの差分から Incremental を作る所と、書き出し）。
3. [BundlerContext と後処理の残り：esbuild の文脈・束ね方の設定・debug ID](03-abl-context-post.md)  
   tools/esbuild/bundler-context.ts の未読の行（BundleContextResult、bundleAll、増分の context と dispose、出力の種類分け）、setup-bundling.ts・execute-build.ts・execute-post-bundle.ts の残り、inject-debug-ids.ts。
4. [ディスクに残るキャッシュ：Cache・NamespacedCacheStore・SQLite と LMDB・読み込み結果のキャッシュ](04-abl-cache.md)  
   tools/esbuild/cache.ts の Cache.getOrCreate・MemoryCache・createPersistentCacheStore、sqlite-cache-store.ts と lmdb-cache-store.ts、load-result-cache.ts の残りと、まだどこからも使われていない persistent-load-result-cache.ts。本物の store を Node で動かし、カウンターの ng build が .angular/cache に残すものを録る。
5. [小さなプラグインと検査：外部パッケージ・仮想モジュール・wasm・CommonJS・ライセンス](05-abl-plugins.md)  
   tools/esbuild の external-packages・virtual-module・rxjs-esm-resolution・loader-import-attribute・wasm・sourcemap-ignorelist・server-bundle-metadata・localize-init-warning の各プラグインが何を拾い何を返すかと、global-scripts・commonjs-checker・license-extractor。本物の esbuild に 1 つずつ差して録る。
6. [spec と issue を読む：application builder の読み残しを固めているテスト](06-abl-tests-issues.md)  
   builders/application/tests と tools/esbuild の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で 1 か所ずつ変えて落ちる it、angular/build:application の開いている issue のうちこのシリーズの行に当たるものの表。
