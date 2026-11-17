[目次](../README.md)

# Karma の builder の内側：esbuild で束ねたテストを Karma に配るまで

> 入口と Karma の設定・テストを束ねる・Karma に配る・unit-test の karma runner・spec と issue

@angular/build:karma は、webpack を使っていた @angular-devkit/build-angular:karma の代わりに、application builder の仕組み（esbuild）でテストを束ね、その出力を Karma に配る builder です。v21 から ng test の既定は Vitest になりましたが、既存の多くのプロジェクトは今も Karma で動いており、unit-test builder の runner: "karma" もこの builder を呼びます。約 1300 行のソースを、Karma の設定の作り方、テストを束ねる手順、メモリの上の出力を Karma のサーバーに配る middleware、reporter と coverage、unit-test の karma runner の順に読みます。2026 年の修正（stream controller の守り・preserveSymlinks・localize・launcher と karma-coverage の要求の絞り込み）もたどります。

全 5 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/kar)

1. [入口と Karma の設定：options の正規化・テストを探す・Karma の設定を作る](01-kar-entry.md)  
   builders/karma の index.ts・options.ts・find-tests.ts・karma-config.ts が、builder の options を正規化し、include / exclude からテストのファイルを探し（先頭の「/」を落とす古い書き方と、絶対パスが見つからないこと）、karmaConfig が無ければ既定の設定から、あれば空から Karma の設定を作るまで。既定の設定の frameworks・plugins・reporters・browsers と、karma.conf.js を読んだあとに builder の値（basePath・singleRun・clearContext・CLI の browsers と reporters）がもう一度上書きする順（#30956）。
2. [テストを束ねる：application builder でテストを esbuild にかける](02-kar-build.md)  
   application\_builder.ts の initializeApplication・setupBuildOptions・runEsbuild と utils.ts・polyfills-plugin.ts・polyfills/ が、テストのファイルを entry にした application builder の options（index なし・hash なし・aot の既定が偽で JIT）を作り、polyfills を jasmine の前と後（zone.js/testing・jasmine の大域の後片付け）に分け、Karma の files をほぼすべて module にして並べ替え、TestBed を初期化する仮想のファイルを作って一時ディレクトリに書き出す行。preserveSymlinks（95d16dc521・41bd100dd8）、localize（75c1dce387・0010b922f8）、届いていなかった progress と poll（0edb6c646f）。
3. [Karma に配る：一時のフォルダ・middleware・reporter・coverage](03-kar-serve.md)  
   application\_builder.ts の execute と configureKarma・utils.ts・assets-middleware.ts・progress-reporter.ts・coverage.ts が、ビルドの出力を一時のフォルダに書いて Karma の files（basePath と 5 つのパターン）と独自の middleware で配り、テストの結果を ReadableStream で architect に返し、watch のときだけ足す reporter でビルドし直した出力を Karma に知らせ、coverage を Istanbul で計る行。stream controller が閉じたあとの守り（5914877e28）と、一時ディレクトリの後片付け（1c2d49ec73）。
4. [unit-test の karma runner：ng test から Karma の builder を呼ぶ](04-kar-runner.md)  
   builders/unit-test/runners/karma の executor.ts が、unit-test builder の options と build の target の options を Karma の builder の options に写し、filter と coverage の threshold を transforms.karmaOptions で Karma の設定に書き、zone.js のときテスト用の polyfills を足して（385165cbc6）起動する行。webpack を使う @angular-devkit/build-angular:karma（browser\_builder.ts）との違いと、2026-10〜11 の修正（launcher と karma-coverage の要求の絞り込み、使えない options の警告、poll と progress）。
5. [spec と issue を読む：Karma の builder を固めているテスト](05-kar-tests-issues.md)  
   builders/karma/tests の options と behavior の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、Karma の builder の issue と PR の表。
