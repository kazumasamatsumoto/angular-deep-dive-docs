[目次](../README.md)

# SSR の守りと細部

> resolveUrl・location と allowedHosts・サーバーの HttpClient・ホストの検査・プロキシのヘッダー・リダイレクト・ロケール・Node のストリーム・アセットと CSS・spec と issue

SSR の大きな流れ（renderApplication、platformServer、AngularAppEngine、サーバールート、プリレンダー）は、SSR とハイドレーションのシリーズで読みました。このシリーズでは、その章が通り過ぎた細部を読みます。中心は、2026 年に platform-server と @angular/ssr に続けて入った「守り」の修正です。サーバーは、リクエストの Host ヘッダーや URL をもとに、自分自身へ HTTP のリクエストを送ったり、リダイレクトの先を作ったりします。そこに細工した値が来ると、内部のサーバーへのリクエスト（SSRF）や、よそのサイトへのリダイレクトが起こりえます。各章は、その行を変えた修正のコミットを git show で読み、何が破られ、どの行をどう直し、どんな spec を足したかを学びます。デモは、本物の @angular/platform-server と @angular/ssr を Node で動かした記録を再生します。

全 10 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/ssrx)

1. [resolveUrl：サーバーで URL を解決する 1 つの関数と、SSRF の修正](01-ssrx-resolve-url.md)  
   platform-server の url.ts の resolveUrl が、相対の URL・プロトコル相対（//example.com）・バックスラッシュ・権限部の無い http: を、どの行でどう扱うか。allowProtocolRelative と allowOriginChange、怪しい URL で投げる RuntimeError。プロトコル相対とバックスラッシュの修正（ede7c58a2aa・0b19c92d44f）、Unicode の空白（3e924cc8dbb）、権限部の無い URL（b3bb36ad873）を git show で読む。
2. [document と location の初期化：allowedHosts と origin の検査](02-ssrx-location-allowed-hosts.md)  
   renderApplication と renderModule に渡した url と document から、サーバーの document.location と ServerPlatformLocation が作られる行。allowedHosts の option（60552a73e82）、origin の末尾のスラッシュ（2a6b6fafb03）、location の origin の検査を固くした修正（cf9d7fa0f80）と、document の初期化の SSRF とパスの乗っ取りを防ぐ修正（1307ff355c9）。
3. [サーバーの HttpClient：相対 URL の解決と、応答の大きさの上限](03-ssrx-server-http.md)  
   platform-server の http.ts のインターセプタが、相対の URL を location の origin で絶対にする行と、バックスラッシュの URL で外へ出ないようにした修正（140c4d04cb3）。SSR の fetch の応答に上限を付けた修正（2acca1165d7）。HttpClient の大きな流れは http の章へ。
4. [ホストとヘッダーの検査：validateRequest と allowedHosts](04-ssrx-host-validation.md)  
   @angular/ssr の validation.ts が、Host と X-Forwarded-Host の最初の値を URL に入れて分け、allowedHosts（完全一致・\*.example.com・\*）と照らす行と、外れたときに AngularAppEngine が返す 400 の中身。下線を許した修正（e7e434ca3d）、\* を許して警告を出す修正（3b99ee140d）、不正なホストで CSR に逃げるのをやめた変更（27cd355619）、開発サーバーで検査を止める旗（13902292e7）、正規表現をやめた 5adc925414。環境変数 NG\_ALLOWED\_HOSTS と options の優先（5875b6024f）。
5. [プロキシのヘッダー：trustProxyHeaders と Forwarded](05-ssrx-proxy-headers.md)  
   X-Forwarded-Host・X-Forwarded-Proto・X-Forwarded-Prefix などを、明示して許したときだけ使うようにした修正（5adc925414）と、その設定の正規化、環境変数（126b19b9c7）、すべての X-Forwarded-\* への対応（b75423d7a0）、標準の Forwarded ヘッダー（7ef9ed24d3）。X-Forwarded-Prefix による開いたリダイレクトの修正（f086eccc36・4d564f66f6）。
6. [リダイレクトと URL の照合：redirect.ts と utils/url.ts](06-ssrx-redirects.md)  
   createRedirectResponse が状態コードと Location と Vary を作る行、許す状態コード、ヘッダーを保つ修正（d9fb854c9a・998b8298e3・ff1160e301）、相対のリダイレクトですべての :param を置き換える修正（0bd22dae09）。utils/url.ts の joinUrlParts・buildPathWithParams・stripMatrixParams と、ルートの区切りを decode して照合する修正（53b9623b7b）、Router で URL を正規化して比べる修正（c34c569b07）。
7. [ロケールの選び方：URL の先頭と Accept-Language](07-ssrx-i18n-locale.md)  
   @angular/ssr の i18n.ts が、URL の先頭の区切りからロケールを取り出す行と、Accept-Language の q 値で好みのロケールを選ぶ行。ロケールの無い URL を、選んだロケールへリダイレクトするときに、転送の接頭辞と Vary を付ける修正（ca6f08c6e5）。AngularAppEngine の入口の選び方は ssr-app-engine へ。
8. [Node のリクエストとレスポンス：中断と切断](08-ssrx-node-streams.md)  
   node/src/request.ts が Node の IncomingMessage を Web の Request に変える行（本文、ヘッダー、URL）、Node のリクエストが中断されたら signal を中断する修正（f8576e3c8b）、本文を貯めずにヘッダーを整える修正（33169801c6）。response.ts がストリームを書き出す行、客が切断したときに終わらせる修正（b74eef889f）と、ストリームが取り消されたらプラットフォームを壊す修正（6a3446770a）。
9. [サーバーのアセットと重要 CSS：ServerAssets・hooks・CommonEngine](09-ssrx-assets-css.md)  
   ServerAssets がマニフェストから HTML を取り出す行と、リクエストからアセットのパスを作るときに decode する修正（4fa81d403c）。Hooks（html:transform:pre）と、それを登録する開発サーバー。重要 CSS の計画をビルド時に作るようにした変更（23e3d44a7f）。非推奨になった CommonEngine（50b16a65b1）が public の外のファイルを読まないようにした修正（bb72145f9a）。
10. [spec と issue を読む：platform-server と @angular/ssr の今](10-ssrx-tests-issues.md)  
   platform-server の spec（url\_spec・platform\_location\_spec・render\_spec など）と @angular/ssr の spec の分け方と手元での走らせ方（angular は ../angular、angular-cli は練習用の複製で bazel test）。angular のラベル area: server と angular-cli のラベル area: @angular/ssr の issue の表、どの issue がこのシリーズのどの章の行に関係するか、2026 年の守りの修正の傾向。
