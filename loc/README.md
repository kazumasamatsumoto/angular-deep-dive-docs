[目次](../README.md)

# i18n と $localize の内側

> i18n 属性・メッセージ ID・$localize・翻訳ファイル・実行時の翻訳・ロケールのデータ

テンプレートに i18n と書くと、その文がほかの言語に置き換わるようになります。このとき、コンパイラはテンプレートの文を「メッセージ」に分け、{{ name }} や &lt;b&gt; を INTERPOLATION や START\_BOLD\_TEXT のようなプレースホルダーに変え、メッセージ ID を計算して、$localize のタグ付きテンプレートを出力に書きます。実行時には ɵɵi18nStart が翻訳された文を読んで DOM を組み立てます。翻訳はビルドのあとで $localize の呼び出しに直接差し込むか（@angular/localize/tools）、起動の前に loadTranslations で読み込みます。このシリーズは、i18n の印の書き方とメッセージの形から始めて、プレースホルダーの名前、メッセージ ID、コンパイラの i18n の段、$localize の出力、ICU（plural と select）、実行時の命令、$localize のタグ関数と実行時の翻訳、メッセージの抽出と翻訳ファイルの読み書き、ビルド後の差し込み、ロケールのデータと日付や数の書式を 1 つずつ読みます。ページの上のデモは、このサイトに入っている本物の @angular/compiler と @angular/localize で動きます。各章の最後に、その仕組みの spec と手元での走らせ方を置きます。最終回は、開いている issue を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/loc)

1. [i18n の全体像：i18n 属性から画面の翻訳文まで](01-loc-overview.md)  
   i18n にかかわるコードの置き場（compiler の i18n/ と render3/view/i18n/ とテンプレートパイプラインの i18n の段、core の render3/i18n/ と i18n/、@angular/localize の実行時の部品と tools/、common のロケールのデータ）。翻訳をビルドで差し込む道と、実行時に loadTranslations で読む道の 2 つ。1 つのテンプレートがコンパイラの出力の $localize になり、実行時に DOM になるまでの流れ。
2. [i18n の印とメッセージの形：meaning|description@@id](02-loc-markup.md)  
   i18n・i18n-title のような印と、その値の meaning|description@@id を読む行（meta.ts の parseI18nMeta）。テンプレートの要素からメッセージを作る i18n\_parser.ts と、メッセージの木（i18n\_ast.ts の Message・Text・Container・Placeholder・TagPlaceholder・Icu・IcuPlaceholder・BlockPlaceholder）。&lt;ng-container i18n&gt; と、@if などのブロックの中の i18n。
3. [プレースホルダーの名前：INTERPOLATION と START\_BOLD\_TEXT](03-loc-placeholders.md)  
   メッセージの中の {{ name }} や &lt;b&gt; や @if に名前を付ける PlaceholderRegistry（placeholder.ts）。タグの名前から START\_BOLD\_TEXT・START\_LINK のような名前を作る表、同じ名前が重なるときの \_1、補間に // i18n(ph="name") と書いて名前を決める書き方。翻訳する人に見える名前と、実行時の �0� のような印の違い。
4. [メッセージ ID：digest・fingerprint・legacy ID](04-loc-message-id.md)  
   同じ文と meaning から同じ ID を作る digest.ts（sha1 と fingerprint、computeMsgId と decimalDigest）。$localize の ID と、式の文字列を含む古い 2 つの ID（XLIFF 1.2 の sha1、XMB・XLIFF 2 の 10 進）の違い。@@ で自分で ID を付けたとき、meaning が ID に入り description が入らない理由、空白や改行で ID が変わる場合。古い ID を enableI18nLegacyMessageIdFormat で ␟ のあとに残す仕組みと、それを新しい ID に移す localize-migrate。ICU の行き先の ID（:ICU@@…:）がずれる #53089 の原因。
5. [コンパイラの i18n の段：文脈を作り、プレースホルダーを解決する](05-loc-pipeline-phases.md)  
   テンプレートパイプラインが i18n のために走らせる段を順に（create\_i18n\_contexts・propagate\_i18n\_blocks・i18n\_text\_extraction・convert\_i18n\_bindings・resolve\_i18n\_element\_placeholders・resolve\_i18n\_expression\_placeholders・assign\_i18n\_slot\_dependencies・apply\_i18n\_expressions など）。I18nStartOp・I18nContextOp・I18nExpressionOp の形と、ng-template の中のメッセージを外のメッセージにつなぐ仕組み。
6. [出力に $localize を書く：i18n の定数と goog.getMsg](06-loc-const-collection.md)  
   i18n\_const\_collection.ts がメッセージごとに consts の関数に変数を作る行、localize\_utils.ts が $localize のタグ付きテンプレートの文字列（:meaning|description@@id: と :INTERPOLATION:）を組む行、get\_msg\_utils.ts が Closure 用の goog.getMsg を書く行と、2 つを ngI18nClosureMode で分ける出力。i18nUseExternalIds と MSG\_EXTERNAL\_ の名前。ページの上で本物のコンパイラの出力を見るデモ。
7. [ICU をコンパイルする：plural と select](07-loc-icu-compile.md)  
   {count, plural, =0 {...} other {...}} がメッセージの中で別のメッセージ（サブメッセージ）になり、VAR\_PLURAL と ICU のプレースホルダーでつながる仕組み（i18n\_parser の ICU の扱い・icu\_serializer.ts・wrap\_icus.ts）。ɵɵi18nPostprocess に渡す表と、i18nNormalizeLineEndingsInICUs。
8. [コンパイラの i18n の設定と古い抽出](08-loc-compiler-options.md)  
   angularCompilerOptions の i18n の設定（I18nOptions の 8 つ）が ngtsc の中でどこに届くか。enableI18nLegacyMessageIdFormat・i18nNormalizeLineEndingsInICUs は parseTemplate へ、i18nUseExternalIds はコンポーネントのメタデータを通って MSG\_EXTERNAL\_ の名前へ、i18nPreserveWhitespaceForLegacyExtraction は古い抽出と普通のコンパイルの両方へ。i18nInLocale は ngc が値を入れるが読む行が無いこと。compiler-cli の xi18n（ng-xi18n・MessageBundle と XLIFF・XMB の書き手）と、いまの ng extract-i18n の違い。
9. [実行時（1）：ɵɵi18nStart と翻訳文の解析](09-loc-runtime-start.md)  
   ɵɵi18nStart が consts から翻訳された文を取り出し、初回だけ i18n\_parse.ts で �0� や �#2� の印を読み、作る命令（I18nCreateOpCodes）と更新の命令（I18nUpdateOpCodes）を TView に作る流れ。ng-template の中の部分を切り出す getTranslationForTemplate（�\*1:1� の印）、ɵɵi18nPostprocess。命令のビットの詰め方は template シリーズの i18n の章へ。
10. [実行時（2）：翻訳の順に DOM を並べる](10-loc-runtime-dom.md)  
   翻訳で要素の順番が変わっても正しい場所に入る仕組み（i18n\_insert\_before\_index.ts の insertBeforeIndex）、ɵɵi18nEnd、テキストノードと要素の作り方（i18n\_apply.ts の applyCreateOpCodes）、ɵɵi18nAttributes が i18n-title を翻訳して属性に入れる流れ、ɵɵi18nExp と ɵɵi18nApply。ページの上で翻訳を読み込んでから i18n の付いたコンポーネントを作るデモ。
11. [実行時（3）：ICU の切り替え](11-loc-runtime-icu.md)  
   ICU が実行時に TIcu（cases・create・remove・update）になる解析（i18n\_parse.ts の icuStart と parseIcuCase）、値が変わったときに getPluralCase で case を選び、前の case の DOM を消して新しい case を作る流れ（i18n\_apply.ts）、i18n\_icu\_container\_visitor.ts。ロケールの plural の規則がどこから来るか。
12. [ロケールのデータ：LOCALE\_ID・registerLocaleData・CLDR](12-loc-locale-data.md)  
   LOCALE\_ID・DEFAULT\_CURRENCY\_CODE などのトークン（tokens.ts）と、それが実行時の i18n に届く setLocaleId（i18n\_locale\_id.ts）。registerLocaleData と findLocaleData（locale\_data\_api.ts）、common/locales のファイルを CLDR から作る generate-locales-tool（plural-function.ts など）。formatDate・formatNumber・I18nPluralPipe がロケールのデータを引く行。
13. [$localize のタグ関数と @angular/localize/init](13-loc-localize-tag.md)  
   $localize\`...\` が呼ばれたときの処理（localize.ts）。メッセージの文字列から meaning・description・id とプレースホルダーの名前を取り出す parseMessage と parseMetadata・splitBlock・findEndOfBlock（messages.ts）、:の escape。globalThis.$localize を置く @angular/localize/init と、それを polyfills と tsconfig の types に入れる ng add @angular/localize。ページの上で本物の $localize を呼ぶデモ。
14. [実行時の翻訳：loadTranslations と translate](14-loc-runtime-translations.md)  
   起動の前に loadTranslations で読んだ翻訳が $localize.translate と $localize.TRANSLATIONS に入り、$localize の呼び出しのたびに translate（translations.ts）で文の部品と式を並べ替える流れ。parseTranslation、翻訳が無いときの MissingTranslationError と元の文への戻り方、consts の関数が 1 回しか呼ばれないので、起動のあとで翻訳を変えても画面が変わらない理由。
15. [メッセージを集める：localize-extract](15-loc-extract-tool.md)  
   ビルドした JS の $localize の呼び出しを Babel で探してメッセージを集める MessageExtractor（extraction.ts・es2015\_extract\_plugin.ts・es5\_extract\_plugin.ts）と、ソースマップで元の .ts や .html の行に戻す処理、同じ ID で違う文のメッセージを見つける duplicates.ts、localize-extract の CLI。ng extract-i18n から呼ばれる側（CLI の側は cli-i18n へ）。
16. [翻訳ファイルを書く：XLIFF・XMB・JSON・ARB](16-loc-serializers.md)  
   集めたメッセージを翻訳ファイルにする TranslationSerializer の 6 つの実装（xliff1・xliff2・xmb・json・arb・legacy\_message\_id\_migration）。同じ ID をまとめる consolidateMessages、プレースホルダーを &lt;x id="INTERPOLATION" equiv-text="..."/&gt; や &lt;pc&gt;・&lt;ph&gt; に書く行、ICU の中を読み直す icu\_parsing.ts、XmlFile、formatOptions。手元で 6 つを走らせて見つけた XMB の行番号のずれと ICU の xid のずれ。ページの上で $localize の文から &lt;trans-unit&gt; を書くデモ（XLIFF 1.2 の書き手の移植）。
17. [翻訳ファイルを読む：TranslationLoader と各パーサー](17-loc-translation-parsers.md)  
   TranslationLoader が、ファイルごとに並んだパーサーの analyze() に名前と中身を見せ、最初に canParse: true と答えたもので parse() する流れ（拡張子で決めるのは XTB と JSON だけ）。XLIFF 1.2・XLIFF 2・XTB・ARB・JSON のパーサーと、&lt;target&gt; の中身を ICU 込みで読み直して {$NAME} の形の部品に戻す MessageSerializer・TargetMessageRenderer、診断（Diagnostics）の warning と error、同じロケールの複数のファイルの合わせ方。
18. [ビルドのあとに翻訳を差し込む：localize-translate](18-loc-translate-tool.md)  
   Translator がファイルごとにハンドラーを選び、SourceFileTranslationHandler が Babel のプラグイン（es2015\_translate\_plugin・es5\_translate\_plugin・locale\_plugin）で $localize の呼び出しを翻訳した文字列に置き換える流れ。$localize.locale を文字列にする locale\_plugin、翻訳が無いときの missingTranslation の設定、出力のパス（output\_path.ts）。CLI の I18nInliner との関係は cli-i18n へ。
19. [i18n のテスト：spec の場所と走らせ方](19-loc-testing.md)  
   compiler の i18n の spec（test/i18n/・test/render3/view/i18n\_spec.ts）、compiler-cli のコンプライアンステスト（r3\_view\_compiler\_i18n のゴールデン）、core の render3/i18n と acceptance/i18n\_spec.ts、localize の src と tools の spec。それぞれのターゲットを手元で走らせるコマンドと、ゴールデンの出力を読む方法。
20. [issue と PR を読む：i18n の今](20-loc-issues.md)  
   area: i18n のラベルで開いている issue と、この 1 年に閉じた issue の表。ICU の抽出、プレースホルダーの equiv-text、ロケールのデータの遅延読み込み、制御フローとの組み合わせ、実行時の翻訳の設定など。どの issue がこのシリーズのどの章の行に関係するか。
