[目次](../README.md)

# common の内側

> 組み込みディレクティブ・pipe・formatDate と formatNumber・NgOptimizedImage・Location・ViewportScroller

@angular/common は、ほとんどのアプリが最初に import するパッケージです。NgClass や NgForOf のような組み込みのディレクティブ、DatePipe や KeyValuePipe のような pipe、その下で日付と数を文字列にする formatDate と formatNumber、画像を速く出す NgOptimizedImage、URL を読み書きする Location、ページの中の位置へスクロールする ViewportScroller が入っています。どれも小さなファイルに分かれていて、1 つずつ読み切れる大きさです。そして 2026 年も修正がよく入る場所です（日付の書式の長さの上限、プロトタイプ汚染の対策、画像の preload の crossorigin、URL の index.html の扱いなど）。このシリーズは、各ディレクティブと pipe が core のどの仕組み（differ・ViewContainerRef・pure pipe のキャッシュ）を使っているか、日付と数の書式の文字列をどう読むか、NgOptimizedImage が srcset と preload をどう作るか、Location と ViewportScroller が URL と位置をどう扱うかを 1 つずつ読みます。ページの上のデモは、本物のディレクティブ・pipe・formatDate・NgOptimizedImage・テスト用の Location を動かします。各章の最後に、その仕組みの spec と手元での走らせ方を置きます。最終回は、開いている issue を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/cmn)

1. [common の全体像：ディレクティブ・pipe・i18n・画像・Location](01-cmn-overview.md)  
   packages/common/src のディレクトリの分担（directives/・pipes/・i18n/・location/・navigation/・viewport\_scroller.ts・platform\_id.ts・dom\_adapter.ts）と、公開の入口 common.ts、CommonModule と standalone の import の違い、@angular/common/testing と @angular/common/locales の役目。各章へのリンク。ページの上で、1 つの値を本物の pipe と書式の関数に順に通すデモ。
2. [NgClass と NgStyle：DoCheck で差分を取って書く](02-cmn-ng-class-style.md)  
   NgClass が ngDoCheck のたびに静的な class（@Input('class')）と文字列・配列・Set・オブジェクトを読み直し、クラスごとの状態の表（enabled・changed・touched）を \_updateState で作って \_applyStateDiff で Renderer2 の addClass・removeClass を呼ぶまで。NgStyle が KeyValueDiffer（DefaultKeyValueDiffer）で差分を取り、消す → 足す → 変えるの順に "width.px" の単位を分けて setStyle する行と、shorthand と longhand を同じオブジェクトに入れたときのずれ。\[class\]・\[style\] のバインディングとの違い。ページの上で、本物の NgClass・NgStyle が renderer に送る呼び出しを記録するデモ。
3. [NgForOf と IterableDiffer：一覧の差分をビューに当てる](03-cmn-ng-for-of.md)  
   NgForOf の ngDoCheck が IterableDiffers で differ を選び、diff の結果を \_applyChanges の forEachOperation で ViewContainerRef の createEmbeddedView・move・remove に直す行、trackBy と NgForOfContext（index・count・first・last・even・odd）、core の DefaultIterableDiffer の仕組み。@for との違い。ページの上で、本物の differ に一覧を渡して操作の列を見るデモ。
4. [NgIf・NgSwitch・NgPlural：テンプレートを出し入れする](04-cmn-ng-if-switch.md)  
   NgIf の \_updateView が then と else の 2 つのテンプレートを ViewContainerRef で出し入れする行、NgSwitch が NgSwitchCase の数を数えて既定のケースを決める仕組み（SwitchView・\_matchCase・\_updateDefaultCases）と === に変わった経緯、NgPlural が NgLocalization でカテゴリを選ぶ行。@if・@switch の組み込みの制御フローとの違い。ページの上で、本物の NgSwitch・NgIf・NgPlural のビューの出し入れを記録し、ケースを \*ngIf で包むと既定のケースがずれる issue #47578 を再現するデモ。
5. [NgTemplateOutlet と NgComponentOutlet：外から渡したものを描く](05-cmn-outlets.md)  
   NgTemplateOutlet がテンプレートか injector が変わったときだけビューを作り直し（\_shouldRecreateView）、context は作り直さずに Proxy が毎回読み直す仕組み（\_createContextForwardProxy）、2026 年 2 月に入った injector の 'outlet' の選択肢（18003a33bb0）。NgComponentOutlet が createComponent に渡すもの（injector・ngModuleRef・content・environmentInjector）と、ngDoCheck の \_applyInputStateDiff が毎回すべての入力を setInput し、消えた入力に undefined を書く行（同じ値をはじくのは ComponentRef.setInput の側）。
6. [pipe の仕組み：ɵɵpipeBind と pure pipe のキャッシュ](06-cmn-pipe-mechanism.md)  
   テンプレートの {{ d | date:'short' }} がコンパイルで ɵɵpipe と ɵɵpipeBind2 になり、pure な pipe は pureFunction の仕組みで引数が同じなら transform を呼ばない行（core の pipe.ts と pure\_function.ts）、pure: false の pipe が毎回呼ばれる理由、pipe のインスタンスがいつ作られ ngOnDestroy がいつ呼ばれるか。common の invalidPipeArgumentError と、signal を渡したときの警告。
7. [小さな pipe たち：JsonPipe・SlicePipe・大文字小文字・I18nSelectPipe](07-cmn-simple-pipes.md)  
   JsonPipe が pure: false である理由と JSON.stringify の引数、SlicePipe が配列と文字列だけを受け取る行（supports）、TitleCasePipe の単語の切り方の正規表現、UpperCasePipe・LowerCasePipe、I18nSelectPipe が Object.hasOwn で mapping を引く行（2026 年 6 月の修正 311aff05aa2）と other への戻り方。
8. [KeyValuePipe：オブジェクトと Map を並べる](08-cmn-keyvalue-pipe.md)  
   KeyValuePipe が KeyValueDiffers で入力の変化を確かめ、変わったときだけ配列を作り直して compareFn で並べる行、defaultComparator が数・文字列・それ以外をどう比べるか、compareFn に null を渡したときの並び（途中で null に変えると並びが戻らない点も）、2026 年 8 月の型の修正（46d2cb7ff04）と signal を渡したときの警告（97ed3d9e859）。ページの上で本物の KeyValuePipe に値を渡すデモ。
9. [DatePipe：transform から formatDate まで](09-cmn-date-pipe.md)  
   DatePipe のコンストラクタが LOCALE\_ID・DATE\_PIPE\_DEFAULT\_TIMEZONE・DATE\_PIPE\_DEFAULT\_OPTIONS を受け取る行、transform が null・空・NaN を null にし、format・timezone・locale の既定を決めて formatDate を呼び、例外を invalidPipeArgumentError に包む流れ。DatePipeConfig と provide の書き方。ページの上で本物の DatePipe と formatDate に値を渡すデモ。
10. [formatDate の書式の読み方：toDate・名前つきの書式・DATE\_FORMATS\_SPLIT](10-cmn-format-date.md)  
   toDate が数・ISO 8601 の文字列・Date を Date に直す行（isoStringToDate）、getNamedFormat が 'short' や 'medium' をロケールの書式に展開してキャッシュする行、DATE\_FORMATS\_SPLIT の正規表現で書式を部品に切って 1 つずつ書く formatDate のループ。2026 年 5〜7 月の修正（書式の長さの上限 eeb03f4ea31、formatDateTime のプロトタイプ汚染 1ec125276d8、キャッシュの prototype の参照 359fb503b8f）。
11. [日付の部品とタイムゾーン：dateGetter から convertTimezoneToLocal まで](11-cmn-date-getters.md)  
   getDateFormatter が y・M・d・E・a・h・Z・w などの記号を dateGetter・dateStrGetter・timeZoneGetter・weekGetter に結び付ける表、ロケールのデータから曜日や月の名前を引く getDateTranslation、ISO の週番号（getThursdayThisIsoWeek）、timezone の '+0900' を分に直す timezoneToOffset と convertTimezoneToLocal。IANA のタイムゾーン名が使えない理由（#48279）。
12. [数の書式：DecimalPipe・CurrencyPipe と formatNumber の中](12-cmn-format-number.md)  
   DecimalPipe・PercentPipe・CurrencyPipe が strToNumber で入力を数に直して formatNumber・formatPercent・formatCurrency を呼ぶ行、getCurrencySymbol と currencies.ts、DEFAULT\_CURRENCY\_CODE。formatNumberToLocaleString の中の parseNumberFormat（#,##0.00 の読み方）・parseNumber・roundNumber と digitsInfo の正規表現、2026 年の修正（digitsInfo の上限 dfdfbe34a57、ロケールの NaN の記号 7596548e9b8）。
13. [NgOptimizedImage の全体：入力・検査・img に書く属性](13-cmn-image-overview.md)  
   NgOptimizedImage の入力（ngSrc・width・height・priority・fill・loading・placeholder など）と、ngOnInit の開発モードの検査（assert の関数の並び）、setHostAttributes が loading・fetchpriority・decoding・width・height を書く行、priority の数の数え方、初期化のあとの入力の変更を止める assertNoPostInitInputChange。ページの上で本物の NgOptimizedImage を描いて、img に書かれた属性を見るデモ。
14. [srcset と sizes：自動で作る候補の幅](14-cmn-image-srcset.md)  
   updateSrcAndSrcset が getRewrittenSrcset（ngSrcset）・getResponsiveSrcset（sizes があるとき。config の breakpoints の幅の候補。sizes がちょうど 100vw なら VIEWPORT\_BREAKPOINT\_CUTOFF の 640 未満を捨てる）・getFixedSrcset（sizes が無いとき。DENSITY\_SRCSET\_MULTIPLIERS の 1x・2x）に分かれる行と、自動で作らない 4 つの条件、ngSrcset の書式と密度の上限、fill のときの sizes の既定、遅延読み込みの sizes="auto, …" と destroy で loading を外す修正（c1312da1832）。ページの上で、本物の NgOptimizedImage に幅と sizes を渡して srcset を見るデモ。
15. [IMAGE\_LOADER と組み込みのローダー：URL を作る関数](15-cmn-image-loaders.md)  
   IMAGE\_LOADER の既定（noopImageLoader）と ImageLoaderConfig（src・width・height・isPlaceholder・loaderParams）、createImageLoader が path を確かめて provider を作る行、Cloudflare・Cloudinary・ImageKit・Imgix・Netlify のローダーの URL の作り方と、2025 年末から 2026 年に入った height と独自の変換（51cc9148076・d8790972bea・a6b8cb68afa）、IMAGE\_CONFIG と core の ImagePerformanceWarning。ページの上で本物のローダーに設定を渡して URL を見るデモ。
16. [LCP・preconnect・preload・placeholder：速く見せる仕組み](16-cmn-image-lcp-preload.md)  
   LCPImageObserver が PerformanceObserver で LCP の画像を見つけて priority の付け忘れを知らせる行（同じ URL の画像の修正 38749698d05）、PreconnectLinkChecker、サーバーで &lt;link rel=preload&gt; を足す PreloadLinkCreator（crossorigin の修正 d14696e4308）、placeholder のぼかしと url() のエスケープ（b56e8651482・3dd35c242ca）、読み込み後に外す removePlaceholderOnLoad（feb86e3fdeb）。ページの上で placeholder の前と後の style を見るデモ。
17. [Location：URL を正規化して読み書きする](17-cmn-location.md)  
   Location の path・prepareExternalUrl・normalize と、util.ts の joinWithSlash・stripTrailingSlash・normalizeQueryParams、\_stripBasePath・\_stripIndexHtml（2026 年 5 月の修正 d109bf90d50）、onUrlChange と subscribe の違い、2025 年 12 月に入った末尾のスラッシュを書くときだけ揃える LocationStrategy（8bbe6dc46c9）。読む側（normalize）と書く側（prepareExternalUrl）で規則が違うこと。ルーターの章で読んだ範囲はリンク。ページの上で、MockPlatformLocation の上に置いた本物の Location に URL を渡して正規化を見るデモ。
18. [テスト用の Location：SpyLocation・MockPlatformLocation・provideLocationMocks](18-cmn-location-testing.md)  
   @angular/common/testing の SpyLocation（urlChanges と履歴の配列）、MockLocationStrategy、MockPlatformLocation が URL を自分で分解して履歴を持つ行、provideLocationMocks が入れ替える provider、v21 から TestBed の既定になった FakeNavigationPlatformLocation（c795960ada1）、ルーターのテストで使われる形。本家の spec が Location をどう試しているか。ページの上で本物の MockPlatformLocation と SpyLocation を動かして履歴を見るデモ。
19. [ViewportScroller：位置とアンカーへのスクロール](19-cmn-viewport-scroller.md)  
   BrowserViewportScroller の setOffset・getScrollPosition・scrollToPosition・scrollToAnchor、findAnchorFromDocument が id・name・shadow root の中を探す行（2026 年 6 月の修正 a69e56df718）、フォーカスでスクロールさせない修正（97cac1cf4d0、focus({preventScroll: true})）、setHistoryScrollRestoration、サーバーの NullViewportScroller。ルーターの RouterScroller が Scroll のイベントで呼ぶ行と、開いている issue（#48542・#55383・#69979）。ページの上で本物の scrollToAnchor を章の中の的と shadow root に向けるデモ。
20. [issue と PR を読む：common の今](20-cmn-issues.md)  
   area: common・common: image directive・core: pipes のラベルで開いている issue と、この 1 年に閉じた issue の表。どの issue がこのシリーズのどの章の行に関係するか、2026 年に入った修正（日付の書式・数の書式・画像・Location・ViewportScroller）の読み方と、その修正に付いた spec。
