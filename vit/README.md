[目次](../README.md)

# ng test と Vitest の内側：テストを束ねて走らせるまで

> テストの探し方と options・テスト用のビルド・Vitest の plugin・executor とブラウザ・spec と issue

v21 から ng test の既定になった @angular/build:unit-test は、テストのファイルを探し、application builder の仕組みで esbuild に束ね、出来たファイルをメモリの上に置いたまま Vitest に渡します。CLI のシリーズの 1 章で大筋を読んだこの builder の、まだ読んでいない約 1800 行を読みます。TestBed の初期化を差し込む仮想のファイル、Vitest の設定とどう混ぜるか、coverage（V8 と Istanbul）、ブラウザのモード、watch と後片付けを、2026 年の修正（isolate・quiet・Istanbul・code splitting の出し入れ・後片付けの timeout など）の順に読みます。

全 5 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/vit)

1. [テストを探す：options の正規化・依存の確認・test-discovery](01-vit-discovery.md)  
   schema.json の既定（include は \*\*/\*.spec.ts と \*\*/\*.test.ts、splitting は true）が architect で足されてから、options.ts の normalizeOptions が reporters・browsers・quiet・setupFiles・runnerConfig を正規化し、preserveSymlinks を build の target から継ぐ（dc27e17fc2 → 4187e5e277 → 6c6bb21485、#34162 の watcher の 4 本）。dependency-checker.ts と createProjectResolver（0010b922f8）が jsdom などを確かめ、--list-tests はその後で一覧だけを出す。test-discovery.ts の findTests が glob とパスを分け（exclude は glob にだけ効く）、getTestEntrypoints が entry の名前を付ける（-2 の重なり、128 文字の短縮と SHA-256 から xxhash への変更 cda8830710）。#34089（--include でも全部をコンパイル、origin/main の 5e05373507）と #34335（見つけた順、01afbf418c）も、本物の ng test の 10 通りの記録で確かめる。
2. [テスト用のビルド：3 つの層の options と、TestBed を初期化する仮想のファイル](02-vit-build.md)  
   application builder に渡る options を、build の target → runner（runners/vitest/build-options.ts）→ builder.ts の 3 つの層で重ねる行。outputHashing を media に落とす adjustOutputHashing、code splitting の行き来（0ffe2d27f2 → 4d0be683b7 の ignoreAnnotations → 51565d4bcb → 4b8c62a8f1 → 66bd6bd1ea）、polyfills の既定 \[\] と library の target で分かれる zone.js の 4 通りの読み方（61e25fb1db、origin/main の d09f98ee70）、@angular/localize の自動の読み込み（75c1dce387）、TestBed を初期化する仮想のファイルと DynamicDOMTestComponentRenderer（edfa782d52）、--dump-virtual-files、configuration.ts の vitest-base.config の探索。zoneless・zone.js あり・library・--no-splitting の本物の ng test の記録で、options・仮想のファイルの全文・出力のファイルを並べる。
3. [Vitest の plugin：メモリの上の出力を Vitest に読ませる](03-vit-plugins.md)  
   runners/vitest/plugins.ts の 3 つの plugin が、ビルドの出力を Vitest の module の解決と読み込みにつなぎ、利用者の vitest の設定を消す・警告する・混ぜる行（355ebe8c54・a203dcf1d9・ec10eb3652・8504cfffcf、executor 側の 80edac58b3）、coverage の provider と設定（73233dc5f4・9a3c34bd16・01bd5d0641）、setupFiles の POSIX 化（2274babb66）。
4. [executor とブラウザ：Vitest を起動し、watch し、後片付けする](04-vit-executor.md)  
   runners/vitest/executor.ts と browser-provider.ts が、Vitest を作り、再ビルドのたびに変わった出力から spec を選んで走らせ直し、終わるときに後片付けする行（95510511d9）、ブラウザのモードの provider と headless・CHROME\_BIN（f190263a40・8dd341e21b）、isolate（e9aa7967ba・2d0a1c598c）と quiet、Karma の runner との違い。
5. [spec と issue を読む：unit-test builder を固めているテスト](05-vit-tests-issues.md)  
   builders/unit-test の 30 の統合の spec と 2 つの unit の spec が、このシリーズの各章の約束をどこで固めているか、bazel での走らせ方と結果、行を変えても落ちない spec の穴、unit-test builder の issue と PR の表、このシリーズで見つけたもの。
