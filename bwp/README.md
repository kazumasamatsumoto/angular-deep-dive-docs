[目次](../README.md)

# webpack の builder の内側：@angular-devkit/build-angular と schematics の CLI

> browser builder・webpack の設定（common・styles・dev-server）・自前の webpack プラグイン・babel の最適化・dev-server と SSR・prerender と app-shell・webpack の i18n・karma・schematics の CLI・spec と issue

いまの ng build は @angular/build の application builder（esbuild）で動きますが、@angular-devkit/build-angular の browser・server・dev-server・karma の builder は webpack の形のまま残り、古いワークスペースや custom-webpack を使うプロジェクトでは今も毎日動いています。use-application-builder の移行が何から何へ移すのかを行で説明するにも、移す前の形を知っておく必要があります。これまでのシリーズは esbuild の側を読み、build-angular の約 9000 行と schematics の CLI はまだ読まれていません。このシリーズでは、webpack の設定がどう組み立てられ、Angular がどんな webpack プラグインと babel のプラグインを足しているのか、dev-server・SSR・prerender・i18n・karma がそれをどう使うのかを、本物の build-angular を Node で動かした記録と並べて読みます。最後に schematics の CLI と spec・issue を読みます。

全 12 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/bwp)

1. [browser builder の流れ：options から webpack の実行まで](01-bwp-browser.md)  
   packages/angular\_devkit/build\_angular/src/builders/browser/index.ts・utils/webpack-browser-config.ts・build-options.ts：options の正規化、webpack の設定を組む関数、webpack を回して結果を集め、index.html・service worker・i18n の後処理をするまで。
2. [webpack の共通の設定：configs/common.ts](02-bwp-webpack-common.md)  
   tools/webpack/configs/common.ts・utils/helpers.ts：entry と output、resolve、loader の並び、最適化（splitChunks・minimizer）、ソースマップ、キャッシュ、AngularWebpackPlugin とのつなぎ方。
3. [スタイルの設定：configs/styles.ts と postcss の道具](03-bwp-webpack-styles.md)  
   tools/webpack/configs/styles.ts・plugins/postcss-cli-resources.ts・css-optimizer-plugin.ts・any-component-style-budget-checker.ts：グローバルとコンポーネントのスタイルの loader の並び、url の書き換え、CSS の最適化、コンポーネントのスタイルの予算。
4. [Angular の webpack プラグイン：scripts・最適化・警告・統計](04-bwp-webpack-plugins.md)  
   tools/webpack/plugins/\*・utils/stats.ts：scripts を束ねるプラグイン、CommonJS の警告、JS の最適化のワーカーと esbuild の実行器、TypeScript の options の上書き、コンポーネントを数えるプラグインと小さなプラグイン（名前・重複・進み具合・転送量・ソースマップ・変わったファイル）、出力の表。
5. [babel の最適化のプラグイン：static メンバー・enum・メタデータ](05-bwp-babel.md)  
   tools/babel/plugins/\*・presets/application.ts・webpack-loader.ts：adjust-static-class-members・adjust-typescript-enums・elide-angular-metadata・pure-toplevel-functions が何を書き換えて tree-shaking を助けるか、preset と loader が何を選ぶか。
6. [webpack の dev-server：builder・設定・HMR](06-bwp-dev-server.md)  
   builders/dev-server/builder.ts・options.ts・webpack-server.ts・tools/webpack/configs/dev-server.ts・plugins/hmr/\*：application builder と webpack の振り分け、webpack-dev-server の設定（proxy・historyApiFallback・headers・allowedHosts）、index.html と service worker のプラグイン、HMR を受ける側のコード。
7. [server builder と ssr-dev-server](07-bwp-server-ssr.md)  
   builders/server/index.ts・platform-server-exports-loader.ts・builders/ssr-dev-server/\*：platform: 'server' で組む Node 向けの CommonJS の束と、renderApplication などの export を足す loader、ssr-dev-server が 2 つの target を watch で回して Node のサーバーを起動し直し、browser-sync の proxy でつなぐ仕組みと Host の扱い。
8. [prerender と app-shell の builder](08-bwp-prerender-appshell.md)  
   builders/prerender/\*・builders/app-shell/\*：routes・routesFile・discoverRoutes からルートを集める仕組み、ワーカーで server の束を import して renderApplication / renderModule を呼び HTML を書く流れ、index.original.html、app-shell の差し込みと重要 CSS の扱い。
9. [webpack の i18n：抽出と翻訳の差し込み](09-bwp-i18n.md)  
   builders/extract-i18n/\*（webpack の側）・utils/i18n-webpack.ts・i18n-inlining.ts・process-bundle.ts ほか：出力を書かない webpack のビルドの最後の loader で $localize を集める仕組み、一時のフォルダに 1 回束ねた後にワーカーでロケールごとに翻訳を差し込む処理。
10. [karma の builder の webpack の側](10-bwp-karma.md)  
   builders/karma/index.ts・browser\_builder.ts・find-tests-plugin.ts・tools/webpack/plugins/karma/karma.ts：builderMode の振り分け、組み込みの Karma の設定、webpack の compiler を Karma の framework に渡してメモリから配る古い形、ビルドの成否の伝え方。
11. [schematics の CLI：bin/schematics.ts](11-bwp-schematics-cli.md)  
   packages/angular\_devkit/schematics\_cli/bin/schematics.ts・blank/\*：schematics コマンドの引数の読み方、collection と schematic の解決、dry-run と出力、対話の質問、blank と schematic の雛形。
12. [spec と issue を読む：webpack の builder と schematics の CLI を固めているもの](12-bwp-tests-issues.md)  
   build\_angular と schematics\_cli の spec が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、関係する issue の表と、このシリーズで見つけた食い違い。
