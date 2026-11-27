[目次](../README.md)

# @angular/build の読み残し（sass・i18n・dev-server・unit-test）

> sass の url の書き換えとワーカー・extract-i18n と翻訳の差し込み・チャンクの最適化と esbuild の小道具・dev-server と Vite の middleware の残り・ng-packagr と unit-test の builder・spec と issue

「application builder の読み残し」「tools/esbuild の読み残し」「compilation と utils の読み残し」で @angular/build の大きな部分は埋めました。それでも、スタイルに sass を使ったとき、ng extract-i18n を走らせたとき、翻訳を差し込むとき、ng serve で Vite を立てるとき、ng test や ng-packagr の builder を呼ぶときに必ず通る行が、まだ 1 行も引かれずに残っています。sass の lexer と url を書き換える importer、sass をワーカーで動かすサービス、メッセージの抽出と翻訳ファイルの読み込み、チャンクを束ね直す最適化、dev-server の入口と Vite のサーバーの設定、アセットを返す middleware、unit-test の builder と Vitest の実行器です。このシリーズではそれを順に埋め、最後に spec と issue を読みます。デモは本物の @angular/build を Node で動かした記録を再生します。

全 9 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/bld)

1. [sass の url を書き換える：lexer と rebasing-importer](01-bld-sass-rebase.md)  
   packages/angular/build/src/tools/sass/lexer.ts・rebasing-importer.ts：url( を探す小さな lexer（@import / @use は拾わない。前の 1 文字が空白・, ・: のときだけ）、部分ファイルの相対 url を「フォルダ||file:値」に書き換える load、部分ファイルの名前の補い方とフォルダの表、パッケージとロードパスの importer、書き換えが壊れる 4 つの書き方。
2. [sass を常駐のコンパイラで動かす：sass-service](02-bld-sass-service.md)  
   tools/sass/sass-service.ts：ワーカーのプールに代わった SassCompiler が sass-embedded（または JavaScript 版）のコンパイラを 1 つだけ作って使い回す仕組み、rebase のときに importer を包み直してロードパスを Sass に渡さない理由、ソースマップのつなぎ方、close と同じ瞬間の compile、pkg: に containingUrl が渡らないこと。
3. [メッセージを取り出す：extract-i18n の builder](03-bld-extract-i18n.md)  
   builders/extract-i18n/builder.ts・options.ts・application-extraction.ts：ビルドの前に確かめること、format の別名と出力のパスの正規化、重複メッセージの扱いと schema.json の説明、6 つの書き手の作り方、MessageExtractor に見せる仮のファイルシステム、AOT を強制していなかったこと。
4. [翻訳を差し込む：i18n-locale-plugin と翻訳の読み込み](04-bld-i18n-inline.md)  
   tools/esbuild/i18n-locale-plugin.ts・builders/application/i18n.ts・i18n-translation-reader.ts：ロケールのデータを探す起点（プラグインはワークスペースの根、ワーカーは作業フォルダ）、書き換えないビルドのプラグイン、inlineI18n の結果の集め方と並べ直し、読めない翻訳ファイルのときの文、ワーカーの辞書を読む側の残り。
5. [チャンクを束ね直す：chunk-optimizer と esbuild の小道具](05-bld-chunk-optimizer.md)  
   builders/application/chunk-optimizer.ts・tools/esbuild/utils.ts・profiling.ts：Rolldown の出力を esbuild の metafile に按分して戻す仕組みと、そのずれ（minify の前の長さ・残るソースマップの行）、失敗したときの 1 つのエラー、出力の表・JSON のログ・ディスクへの書き出しの小道具、NG\_BUILD\_DEBUG\_PERF の計測。
6. [ng serve の入口の残り：dev-server の options と Vite のサーバー](06-bld-dev-server-rest.md)  
   builders/dev-server/options.ts・vite/index.ts・vite/server.ts：inspect・PORT・allowedHosts の正規化、serveWithVite がビルドの options を書き換える所、ssl と basic-ssl、SSR のデバッガーの待ち、ブラウザからのログとキーボードの r の受け口。
7. [Vite の middleware の残り：コンポーネントのスタイルとメモリ上のファイル](07-bld-vite-middlewares.md)  
   tools/vite/plugins/setup-middlewares-plugin.ts・middlewares/assets-middleware.ts・angular-memory-plugin.ts：middleware を並べる plugin と SSR の 3 つのかたち、?ngcomp= のコンポーネントのスタイルに encapsulation を付ける所、Vitest のブラウザ用のアセットの middleware、SSR のテンプレートの更新を返すメモリの plugin。
8. [unit-test と ng-packagr の builder の残り](08-bld-unit-test-packagr.md)  
   builders/unit-test/builder.ts・runners/vitest/executor.ts・plugins.ts・builders/ng-packagr/builder.ts・private.ts：知らない build の target と実行器の失敗、NG\_TEST\_LOG、ng-packagr を呼ぶ builder とその結果の返し方（無いとき・watch のとき）、@angular/build/private が出しているもの。
9. [spec と issue を読む：@angular/build の読み残しを固めているもの](09-bld-tests-issues.md)  
   このシリーズで読んだ sass・i18n・chunk-optimizer・dev-server・Vite の middleware・unit-test と ng-packagr の約束を固める spec、手元での走らせ方と結果、作業木で試した直し、関係する issue の表と、このシリーズで見つけた食い違いと不具合。
