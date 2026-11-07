[目次](../README.md)

# CLI とビルド

> ng build と ng generate の中身を、angular-cli の実際の行で

ng build は、esbuild の上に Angular コンパイラを差し込み、コンポーネントのスタイルを別に束ね、oxc で最適化し、遅延チャンクを整理し、budgets を検査して、最後にプリレンダーや i18n の差し込みを行います。ng serve の再ビルドは watcher とキャッシュで変わった所だけをやり直し、コンポーネントの HMR で画面を保ったまま差し替えます。ng generate / ng add / ng update は schematics の Tree の上で動き、すべての変更がいったん仮想の木に積まれてから書き出されます。起動から builder が呼ばれるまでは「起動の全手順」シリーズで追ったので、ここでは builder と schematics の中を 1 段ずつ読みます。

全 16 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/cli)

1. [CLI とビルドの概観：ng コマンド・architect・builder・schematics](01-cli-overview.md)  
   ng のコマンドが「builder を呼ぶもの」（build / serve / test / extract-i18n、architect 経由）と「schematics を走らせるもの」（generate / new / add。update は独自に NodeWorkflow を作る）に分かれる全体図。@angular/build の application builder の段（コンパイル → スタイル → 最適化 → チャンク → budgets → 後処理）と、どの回がどこを扱うかの地図。登場するパッケージ（@angular/cli・@angular/build・@angular-devkit/architect・@angular-devkit/schematics・@schematics/angular）の表。
2. [ng build の段取り：executeBuild と後処理が並べる段](02-build.md)  
   buildApplicationInternal から executeBuild に入り、コードとスタイルの束を作り、遅延チャンクの整理、budgets、ライセンスの抽出、i18n の差し込み、プリレンダー、service worker、出力ファイルの書き出しと表、と進む段取り。1 つのプログラムで出力と型チェックを別の仕事として回す理由と、各段がどの回に対応するか。
3. [AotCompilation と並列ワーカー：1 つのプログラムで出力と型チェックを分ける](03-cli-angular-compilation.md)  
   compiler-plugin が AngularCompilation（AOT / JIT / 並列）を選ぶ行、ParallelCompilation がワーカー 1 本で AotCompilation を動かし、emit は待ち、diagnose は待たずにバンドルと並行させて onEnd で合流する仕組み（Atomics は Web Worker の同期要求だけ）。AotCompilation.initialize が NgtscProgram を作り、emitAffectedFiles で変わったファイルだけを出す行。angular-host はテンプレートを読むだけで、スタイルだけを esbuild 側に回すこと。
4. [コンポーネントのスタイル：Sass と CSS を esbuild で別に束ねる](04-cli-component-styles.md)  
   コンパイラが styleUrl や styles を見つけると angular-host の transformResource が呼ばれ、ComponentStylesheetBundler が 1 つのスタイルを独立した esbuild の束として処理する行。stylesheet-plugin-factory が Sass / Less / CSS の言語ごとの読み込みと PostCSS（Tailwind）を差し込む行、css-resource-plugin が url() の画像やフォントを出力に足す行、キャッシュの鍵。
5. [JavaScriptTransformer：oxc で純粋の印を付け、メタデータを消す](05-cli-javascript-transformer.md)  
   esbuild の onLoad が .js / .mjs を JavaScriptTransformer に渡し、Piscina のワーカーで変換する行。v22.1 で Babel から oxc に替わった変換（pure-toplevel-functions、adjust-static-class-members、adjust-typescript-enums、elide-angular-metadata）がそれぞれ何をして、なぜ木の揺さぶり（tree shaking）が効くようになるか。リンカーだけに残る退避路 NG\_BUILD\_BABEL\_LINKER。
6. [リンカー：部分コンパイルのライブラリを、アプリのビルドで仕上げる](06-cli-linker.md)  
   ライブラリは ɵɵngDeclareComponent などの部分コンパイル（partial）で配布され、アプリのビルドでリンカーが完全な ɵcmp に変える。JavaScriptTransformer がリンクが要るファイルを見分ける行、OxcLinker が宣言の呼び出しを見つけて @angular/compiler-cli/linker の FileLinker に渡し、文字列の AST で置き換える行。なぜライブラリは full で配布しないのか。
7. [遅延チャンク：loadComponent が別ファイルになり、chunk-optimizer がまとめ直す](07-cli-code-splitting.md)  
   esbuild の splitting で import() ごとにチャンクができる仕組み、lazy-routes-transformer が loadComponent / loadChildren の import() にルートの情報を残す行、遅延チャンクが閾値より多いと chunk-optimizer が Rolldown（既定。NG\_BUILD\_CHUNKS\_ROLLDOWN=0 で Rollup）で main から辿れるチャンクを束ね直す行（NG\_BUILD\_OPTIMIZE\_CHUNKS）。初期ファイルと遅延ファイルの分け方、modulepreload のヒント。
8. [budgets と出力の表：Initial total が警告になるまで](08-cli-budgets.md)  
   angular.json の budgets（initial / anyComponentStyle / bundle など）を calculateThresholds が警告とエラーの閾値に直し、calculateSizes が種類ごとに大きさを数え、checkBudgets が比べる行。BYTES\_IN\_KILOBYTE が 1000 である理由、stats-table がビルドの最後に出す表（Initial / Lazy、Raw size と Estimated transfer size）の作り方。
9. [i18n：1 回ビルドして、ロケールごとに翻訳を差し込む](09-cli-i18n.md)  
   localize を有効にすると、アプリは 1 回だけビルドされ、出力の $localize の呼び出しに I18nInliner がワーカーでロケールごとの翻訳を差し込む行。翻訳ファイルの読み込み（xlf / json / arb）、ワーカーが polyfills の目印にロケール名とロケールのデータを差し込む行、出力のディレクトリと baseHref、extract-i18n builder がメッセージを取り出す仕組み。
10. [再ビルド：watcher とキャッシュで、変わった所だけをやり直す](10-cli-cache-watch.md)  
   ng serve や --watch で createWatcher（Parcel watcher か chokidar）が ChangedFiles を渡し、build-action が再ビルドを回す行。SourceFileCache と各 BundlerContext が、変わったファイルを読んだ結果だけを捨てる行、.angular/cache の永続キャッシュ（既定は LMDB、予備に SQLite の CacheStore）、esbuild の incremental な rebuild。どこまでが再利用されるか。
11. [コンポーネントの HMR：画面を保ったままテンプレートとスタイルを差し替える](11-cli-hmr.md)  
   テンプレートやスタイルだけが変わったとき、collectHmrCandidates が差し替え可能なコンポーネントを選ぶ行、dev-server が Vite の WebSocket で angular:component-update を送る行、ブラウザで ɵɵreplaceMetadata（core/src/render3/hmr.ts）が新しい定義を取り込み、既存の LView を作り直す行。HMR にならずに全体を読み直す場合（変更が 32 ファイルを超えたときなど）。
12. [unit-test builder と Vitest：テストを application builder で束ねる](12-cli-unit-test.md)  
   v21 から既定になった @angular/build:unit-test が、テストファイルを探し（test-discovery）、application builder の仕組みでテスト用にビルドし、Vitest の runner（executor / plugins / browser-provider）に渡す行。Karma の runner との違い、jsdom とブラウザモード、ng test が何を起動しているか。
13. [Tree と sink：ng generate はなぜ失敗しても壊れないか](13-schematics.md)  
   schematics の変更は HostTree に積まれ、実行の最後に sink がまとめて書き出す。DryRunSink で検査してから HostSink で書く設計、Action（c / o / r / d）の列、衝突（MergeConflict）で止まったときにディスクが変わらない理由、--dry-run が書き込む sink を足さないだけであること。
14. [Rule の組み立て：chain・apply・url・template・mergeWith](14-schematics-rules.md)  
   Rule が Tree・Observable・Promise・Rule・void のどれを返してもよく callRule がそろえること、chain が Rule を順に流す行、apply(url("./files"), \[template(), move()\]) が別の Tree を作り、mergeWith が今の Tree に重ねる行、MergeStrategy、template が &lt;%= %&gt; を処理する仕組みと applyTemplates、externalSchematic。
15. [ng generate component の中身：@schematics/angular の 1 本を読む](15-schematics-component.md)  
   ng generate が collection.json から component の schematic を探し、schema.json で引数を検証して、component/index.ts の Rule を走らせる流れ。プロジェクトとパスの決め方、ファイルのテンプレート（\_\_name@dasherize\_\_ など）、standalone が既定のときと NgModule に declarations を足すとき（ast-utils）の違い、--dry-run の出力。
16. [ng add と ng update：パッケージを入れて、migrations を走らせる](16-cli-add-update.md)  
   ng add がパッケージのバージョンを決めてインストールし、そのパッケージの ng-add schematic を走らせる行。ng update が package.json と registry を比べて更新の組（packageGroup）を決め、インストールの後に migration-collection.json の migrations をバージョンの範囲で選んで走らせる行。@schematics/angular の migrations の例。package.json の書き換えは Tree を通さず直接書き、インストールに失敗したら戻すこと、ng add --dry-run はインストールしないこと。
