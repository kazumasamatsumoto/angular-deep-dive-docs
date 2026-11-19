[目次](../README.md)

# Router のディレクティブとイベントの残り：RouterLink・RouterLinkActive・RouterOutlet・events.ts を行で埋める

> RouterLink の入力と href・RouterLinkActive の残り・RouterOutlet の入力と detach / attach・events.ts の各クラス・ExtraOptions と RouterModule・spec と issue

「Router の内側」シリーズは、ナビゲーションのパイプラインを中心に読みました。テンプレートに書く RouterLink・RouterLinkActive・RouterOutlet と、Router.events に流れるイベントのクラスは、パイプラインに関係する行だけを引いて、残りを読まずに来ました。このシリーズでは、その残りを行で埋めます。RouterLink の入力（queryParams・state・info・relativeTo・target など）が href とクリックの処理にどう効くか、RouterLinkActive の options と aria-current、RouterOutlet の name・routerOutletData・detach と attach、events.ts の各クラスの toString と取り消しの理由のコード、ExtraOptions と RouterModule.forRoot を順に読み、最後に spec と issue を読みます。デモは、このサイトの中に置いた本物の Router を使います。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/rdir)

1. [RouterLink の入力：queryParams から target まで、href とクリックに効く行](01-rdir-link-inputs.md)  
   router\_link.ts の入力（target・queryParams・fragment・queryParamsHandling・state・info・relativeTo・preserveFragment・skipLocationChange・replaceUrl・browserUrl）が、createUrlTree の options・navigateByUrl の extras・ホストの属性のどれに効くか。a / area とそれ以外で変わる href・tabindex・クリックの扱い、修飾キーと target でブラウザに任せる分岐（今の spec では固められていない）、開発モードだけの UrlTree の検査、22.2.6 との違い。
2. [RouterLinkActive の残り：options・aria-current・isActiveChange](02-rdir-link-active.md)  
   router\_link\_active.ts の未読の行：JSDoc の約束（/user で /user/bob が active になるという 1 文は実装と違う）、routerLinkActiveOptions の 4 つの形と null、ariaCurrentWhenActive の toString、queueMicrotask の中で出る isActiveChange、ContentChildren で集めた子の RouterLink の onChanges の購読と、routerLinkActive を変えたとき古いクラスが残る不具合（98c0265880f）。
3. [RouterOutlet の入力と detach / attach：名前付きの出口と routerOutletData](03-rdir-outlet.md)  
   router\_outlet.ts の未読の行：RouterOutletContract、name を変えたときの ngOnChanges（ngOnDestroy は deactivate を出さない）、4 つの出力がそれぞれ何の後に出るか、RouteReuseStrategy から detach / attach が呼ばれる場所、routerOutletData と ROUTER\_OUTLET\_DATA（未設定は undefined。文書の null は誤り）、RoutedComponentInputBinder の購読の持ち方と後始末。
4. [events.ts の各クラス：toString と stringifyEvent・取り消しの理由のコードと reason](04-rdir-events.md)  
   events.ts の未読の行：各イベントのクラスの toString と、withDebugTracing だけが使う stringifyEvent の 2 本の道（NavigationSkipped だけ toString が無く String(e) が \[object Object\] になる）、state を 1 行にする serializeNode、id を持たない Route 単位の 6 クラス、NavigationCancellationCode・NavigationSkippedCode の値と、reason が本番でほぼ空になる理由。
5. [ExtraOptions と RouterModule.forRoot：設定の型と、withX との対応表](05-rdir-options.md)  
   router\_config.ts の ExtraOptions・RouterConfigOptions・InMemoryScrollingOptions の各項目と既定値（読む側の || と ||=）、forRoot が各項目をどの provider にするか（options をコピーせず RouterScroller が書き込む・scrollOffset と ROUTER\_INITIALIZER は forRoot だけ）、ROUTER\_FORROOT\_GUARD が開発モードにしか無いこと、provideRouter の withX との対応表と、移行ツールが case の無い 3 項目を withRouterConfig に入れる行。
6. [spec と issue を読む：ディレクティブ・イベント・ExtraOptions を固めているテスト](06-rdir-tests-issues.md)  
   router\_link\_spec・router\_link\_active.spec・directives/router\_outlet.spec と integration の router\_links・router\_link\_active・route\_reuse\_strategy・router\_events の spec が各章の約束をどこで固めているか、--filter での走らせ方と数（Node 1170・Chromium 1180・Firefox 1178）、RouterLink・RouterLinkActive・RouterOutlet・events・ExtraOptions の issue と PR の表、origin/main の続き。
