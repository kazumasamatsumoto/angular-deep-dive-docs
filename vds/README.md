[目次](../README.md)

# ng serve の内側：Vite の middleware と plugin が 1 つの要求をさばくまで

> Vite の設定の組み立て・アセットと base href と index.html・Host の検査と開発用のヘッダー・HMR と SSR の plugin・spec と issue

ng serve は、@angular/build が esbuild で作ったファイルを、メモリの上に置いたまま Vite の開発サーバーで配ります。ブラウザからの 1 つの要求は、Angular が足した middleware（アセット・base href・index.html・HTML への fallback・Host の検査・ヘッダー・コンポーネントの HMR・SSR）と plugin（メモリの上のファイル・id の接頭辞・SSR の変換・SSL）を順に通ります。CLI と起動のシリーズで大筋を読んだ dev-server の、まだ読んでいない約 1500 行を、2025〜2026 年の修正（Host の検査・拡張子の無いアセット・Rolldown への移行など）の順に読みます。

全 5 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/vds)

1. [Vite の設定を組み立てる：server.ts と prebundle と外部の依存](01-vds-config.md)  
   builders/dev-server の options.ts・vite/index.ts・vite/server.ts と tools/vite/utils.ts が、dev-server の options と 1 回目のビルドの結果から Vite の設定（server・optimizeDeps・ssr・cacheDir・base）を作る行。PORT が --port より優先する順（fe720cab64）、port 0 と checkPort と strictPort（5d21812aae、origin/main の 3123cf2e99）、prebundle が esbuild の packages: 'external' と updateExternalMetadata を経て optimizeDeps.include になる流れ（JSON を外す 3124d165de）、Rolldown への移行と target（a583431e14・3e9fed9a6a）、worktree のキャッシュ（dfa7f03a93）。
2. [アセット・base href・index.html：どの URL に何を返すか](02-vds-assets-html.md)  
   setup-middlewares-plugin が並べる middleware の順と、assets-middleware・base-middleware・html-fallback-middleware・angular-memory-plugin の残り（Vite の client の書き換え）が、要求の URL をメモリの上の出力・アセット（/@fs/）・index.html にどう対応させるか。base href の外の要求、拡張子の無いアセット（e2ee6b3e8e）、ETag（origin/main の 0e2799d3a2）、HTML のアセット（099e52f42f）、SSR と base href（f39f7ee952）。
3. [Host の検査と開発用のヘッダー：開発サーバーを何から守るか](03-vds-host-headers.md)  
   Host の検査と CORS は Vite が plugin より先に入れ（allowedHosts が true か https なら入れない）、Angular の host-check-middleware（30b5d81b4a）は 403 の画面を angular.json の案内に替えるだけ。allowedHosts は Vite と SSR（vite/index.ts の正規化 bfdc7b0abb、true を \['\*'\] に 3b99ee140d）の 2 か所へ行き、\["\*"\] は Vite では何も許さない。headers-middleware と Access-Control-Allow-Origin（b85ec6798b、#32923）、chrome-devtools-middleware が返す JSON、ssr-ssl-plugin（HTTP/1.1 53012c89f3、既定の CA に証明書を足す ad99e00ad7・d0e9e81639）を、本物の ng serve の記録で確かめる。
4. [HMR と SSR の plugin：変更をどう届け、サーバーの側でどう読み込むか](04-vds-hmr-ssr.md)  
   builders/dev-server/vite/hmr.ts が再ビルドの結果から css-update と full-reload のどちらを送り、SSR のアプリをいつ捨てるか（80f9082df4）、ssr-middleware が要求ごとに ɵgetOrCreateAngularServerApp で取り直す行、id-prefix-plugin（004cc41048）と ssr-transform-plugin。22.1.7 で #34163（SSR で古いテンプレートの更新が残る、de91345c13）を再現し、NG\_HMR\_CSTYLES=1 の link の残りも記録で見る。
5. [spec と issue を読む：dev-server を固めているテスト](05-vds-tests-issues.md)  
   builders/dev-server/tests の harness（setup.ts・jasmine-helpers.ts・execute-fetch.ts と BuilderHarness）が本物のビルドと Vite を port 0 で起動して止める仕組み、20 の spec が各章の約束をどこで固めているかの地図、bazel での走らせ方と結果（77 specs）、作業木で行を壊して見つけた spec の無い行、dev-server の issue と PR の表、このシリーズで見つけたもの。
