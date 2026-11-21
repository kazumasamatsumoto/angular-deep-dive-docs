[目次](../README.md)

# common の説明文の読み残し

> NgOptimizedImage・ローダー・日付と数の書式・pipe・組み込みディレクティブ・Location の説明文を、本物の動きと突き合わせる

「common の内側」では、ディレクティブ・pipe・書式・画像・Location が動く行を読みました。それでも packages/common/src には、1 行も引いていない行が四千行近く残っています。大半は、NgOptimizedImage・DatePipe・formatDate・NgIf・NgForOf・Location などに付いた説明文（JSDoc）と例のコードで、これは angular.dev の API リファレンスにそのまま載ります。このシリーズでは説明文を 1 段落ずつ読み、そこに書かれた約束を本物の @angular/common を動かして確かめ、最後に spec と issue を読みます。

全 9 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/cmd)

1. [NgOptimizedImage の説明文：入力と検査の約束](01-cmd-image.md)  
   directives/ng\_optimized\_image/ng\_optimized\_image.ts・asserts.ts・error\_helper.ts の未読の行：冒頭の箇条書きの約束（preconnect の自動生成は angular-cli の webpack ビルダーだけ）、Step 1〜3 と custom loader の例（src に -undefined.jpg）、ngSrcset・decoding の説明、開発モードの検査が出す文。説明文の形の img を本物で描き、開発（記録）と本番を並べる。
2. [画像のローダーと速さの小道具の説明文](02-cmd-image-loaders.md)  
   image\_loaders/\*（cloudflare・cloudinary・imagekit・imgix・netlify・image\_loader）、preconnect\_link\_checker.ts・preload-link-creator.ts・lcp\_image\_observer.ts の未読の行：path の形の例と例外の文（Cloudflare の例は画像の URL の形）、本物のローダーでできる URL（Imgix は src の ? を捨てる）、preload と LCP の説明の食い違い。
3. [日付の書式の説明文：DatePipe と formatDate](03-cmd-date.md)  
   pipes/date\_pipe.ts と i18n/format\_date.ts の未読の行：書式の記号の表の 1 行ずつを本物の formatDate で通す（W・aaaa・B/b・ZZZZ の 10 行が en-US の出力と違う）、Format examples と Usage example、timezone と value の受け付ける形、ISO 週の年と w の無い Y。
4. [数と i18n の pipe の説明文：DecimalPipe・PercentPipe・CurrencyPipe・I18nPluralPipe・I18nSelectPipe](04-cmd-number.md)  
   pipes/number\_pipe.ts・i18n/format\_number.ts・currencies.ts・pipes/i18n\_plural\_pipe.ts・i18n\_select\_pipe.ts と、説明文が引く packages/examples の例：例のテンプレートを本物で描いてコメントの output と並べる（fr の通貨は CA$ ではなく $CA）、digitsInfo の形と丸め、currency の display と桁、複数形の選び方と mapping の null。
5. [構造ディレクティブの説明文：NgIf・NgForOf・NgSwitch・NgPlural](05-cmd-structural.md)  
   directives/ng\_if.ts・ng\_for\_of.ts・ng\_switch.ts・ng\_plural.ts の未読の行：else と then、as と let の局所変数、trackBy の約束、NgSwitch の既定、例のテンプレートが今のコンパイラーで通るか。
6. [NgClass・NgStyle と outlet の説明文](06-cmd-attr-outlets.md)  
   directives/ng\_class.ts・ng\_style.ts・ng\_template\_outlet.ts・ng\_component\_outlet.ts の未読の行：受け取れる値の形、単位つきのキー、context と injector と inputs の約束、例。
7. [AsyncPipe と小さな pipe の説明文](07-cmd-pipes.md)  
   pipes/async\_pipe.ts・slice\_pipe.ts・keyvalue\_pipe.ts・case\_conversion\_pipes.ts・json\_pipe.ts・pipes/index.ts の未読の行：購読と解除の約束、負の index、並べ方の比較関数、titlecase の区切り、例の出力。
8. [Location と LocationStrategy の説明文](08-cmd-location.md)  
   location/location.ts・location\_strategy.ts・platform\_location.ts・hash\_location\_strategy.ts・util.ts と viewport\_scroller.ts・version.ts・dom\_adapter.ts の未読の行：「正規化された URL」の定義と normalize・prepareExternalUrl・go の食い違い、APP\_BASE\_HREF の例、Path と Hash の戦略が書く URL、末尾のスラッシュの 2 つの戦略、ブラウザー用の PlatformLocation の在りか、ViewportScroller の余白と anchor。偽物の PlatformLocation を差した本物の Location で確かめる。
9. [spec と issue を読む：common の説明文を固めているもの](09-cmd-tests-issues.md)  
   packages/common/test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか、手元での走らせ方と結果、area: common の開いている issue のうち説明文に当たるものの表と、このシリーズで見つけた食い違い。
