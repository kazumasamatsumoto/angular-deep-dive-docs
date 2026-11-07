[目次](../README.md)

# DOM レンダラーとイベントの内側

> Renderer2・DomRendererFactory2・カプセル化とスタイル・クラスとスタイルのバインディング・EventManager・サニタイズ

テンプレートの &lt;div \[class.active\]="on" (click)="go()"&gt; は、コンパイルされると ɵɵclassProp や ɵɵlistener の命令になります。命令は DOM を直接は触らず、Renderer2 という窓口を通して要素を作り、属性やクラスを書き、イベントを登録します。ブラウザでその窓口を作るのは @angular/platform-browser の DomRendererFactory2 で、コンポーネントのカプセル化（Emulated・None・ShadowDom）ごとに別の renderer を返し、スタイルの &lt;style&gt; を SharedStylesHost で数えながら足し引きします。イベントは EventManager がプラグイン（DOM のイベント、keydown.enter のようなキーのイベント）に振り分けます。このシリーズは、命令から DOM までの層、renderer の種類とスタイル、core の中でクラスとスタイルのバインディングの値を決める仕組み、イベントの登録、値を消毒するサニタイズと Trusted Types、Title と Meta を 1 つずつ読みます。ページの上のデモは、このサイトの本物の renderer に届く呼び出しを記録したり、本物の KeyEventsPlugin や DomSanitizer を動かしたりします。各章の最後に、その仕組みの spec と手元での走らせ方を置きます。最終回は、開いている issue を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/domr)

1. [DOM レンダラーの全体像：命令・Renderer2・DomRendererFactory2・EventManager](01-domr-overview.md)  
   テンプレートの命令（ɵɵelementStart・ɵɵproperty・ɵɵclassProp・ɵɵlistener）が DOM を直接触らず、LView に入った Renderer を通して書く分担。core の dom\_node\_manipulation.ts と node\_manipulation.ts、platform-browser の dom\_renderer.ts・shared\_styles\_host.ts・events/、core の styling/ と sanitization/ の場所。ページの上で本物のコンポーネントを描いて、renderer に届いた呼び出しを順に並べるデモ。
2. [Renderer2 と RendererFactory2：窓口の約束](02-domr-renderer-api.md)  
   render/api.ts の RendererFactory2（createRenderer・begin・end・whenRenderingDone）と Renderer2 の各メソッド、RendererType2（id・encapsulation・styles・data）、RendererStyleFlags2。core の中の型 Renderer（interfaces/renderer.ts）と、LViewEnvironment に入った rendererFactory がルートから子のビューに受け継がれる行。ディレクティブに inject(Renderer2) したときに渡されるもの。
3. [DomRendererFactory2：コンポーネントごとの renderer](03-domr-renderer-factory.md)  
   DomRendererFactory2 のコンストラクタ（EventManager・SharedStylesHost・APP\_ID・REMOVE\_STYLES\_ON\_COMPONENT\_DESTROY・DOCUMENT・NgZone・CSP\_NONCE・TracingService・CSS\_VAR\_NAMESPACE）と、そこで 1 つだけ作る defaultRenderer。createRenderer は element か type が無ければ defaultRenderer、サーバーでは ShadowDom を Emulated に替え、Emulated と None の renderer だけを rendererByCompId に覚える（ShadowDom の 2 つは毎回作る）。id がぶつかったときの NG0912、HMR の componentReplaced。ページの上で 4 つのカプセル化を 2 つずつ描いて比べるデモ。
4. [DefaultDomRenderer2：要素とテキストを作って差し込む](04-domr-default-renderer.md)  
   createElement の名前空間（'svg'・'math' の短い名前と NAMESPACE\_URIS、URI をそのまま渡す道）がコンパイラの emitNamespaceChanges と core の ɵɵnamespaceSVG から来る道、createText・createComment、appendChild と insertBefore が &lt;template&gt; の content に入れる行、参照のノードが無いときの NG05106（1cb3d606bf5）、親を使わない removeChild、parentNode・nextSibling、destroyNode が null のとき core が省く走査。ページの上で svg・math・&lt;template&gt; を描くデモと、本物の defaultRenderer で NG05106 を起こすデモ。
5. [属性とプロパティ：ɵɵattribute・ɵɵproperty から setAttribute・setProperty へ](05-domr-attributes-properties.md)  
   \[attr.x\]・\[x\]・x="…" がコンパイラの出力（ɵɵattribute・ɵɵdomProperty / ɵɵproperty / ɵɵariaProperty・consts）の段階から別の道を通る仕組み。null で removeAttribute に分かれる setElementAttribute、静的な属性を書く setUpAttributes、名前空間つきの属性（xlink:href）を NAMESPACE\_URIS で setAttributeNS にする行、DefaultDomRenderer2 の setAttribute・removeAttribute・setProperty と、@ で始まる名前を止める checkNoSyntheticProp。既定で出なくなった ng-reflect-\* が input に入れたときだけ付く行。
6. [Emulated・None・ShadowDom：renderer ごとのカプセル化](06-domr-encapsulation.md)  
   EmulatedEncapsulationDomRenderer2 が \_nghost-%COMP% と \_ngcontent-%COMP% を付ける行（shimHostAttribute・shimContentAttribute・applyToHost・createElement）、NoneEncapsulationDomRenderer の applyStyles、ShadowDomRenderer が attachShadow して SharedStylesHost の分を複製してから自分の &lt;style&gt; を shadow root に入れる行と、SharedStylesHost を渡さない ExperimentalIsolatedShadowDom。styles の無いコンポーネントが None になる行。ページの上で 4 つのモードの本物のコンポーネントを描き比べるデモ。
7. [SharedStylesHost：&lt;style&gt; を数えて足し引きする](07-domr-shared-styles.md)  
   SharedStylesHost の inline と external（&lt;link&gt;）の表と使用回数、addStyles・removeStyles、addHost で shadow root にも配る仕組み、サーバーが出した &lt;style ng-app-id&gt; を再利用する addServerStyles、CSP\_NONCE。REMOVE\_STYLES\_ON\_COMPONENT\_DESTROY が true（既定）のとき最後の 1 つが消えると &lt;style&gt; も消える行。
8. [CSS 変数の名前空間：provideCssVarNamespacing と %NS%](08-domr-css-var-namespacing.md)  
   2026 年 5 月に入った新しい仕組み（#68846、v22.1.0 から）。コンパイラが全部のコンポーネントの CSS の --x（宣言・var()・@property）と \[style.--x\] の名前に %NS% を入れ（--global-- は外す）、renderer が CSS\_VAR\_NAMESPACE の値（provideCssVarNamespacing で「名前空間 + \_」、無ければ空文字）に置き換える行、CssVarNamespacer.namespace。ルートに置かないと効かない理由、書き換わらないもの（静的な style 属性・\[style\] のオブジェクト・値の中の var()・グローバルな CSS）と、マイクロフロントエンドで変数がぶつからない理由。
9. [クラスとスタイルのバインディング：命令と静的なスタイル](09-domr-styling-overview.md)  
   \[class.a\]・\[style.width.px\]・\[class\]・\[style\] がコンパイルで ɵɵclassProp・ɵɵstyleProp・ɵɵclassMap・ɵɵstyleMap になる対応と、class="x" や style="..." の静的な値を最初に集める static\_styling.ts（computeStaticStyling）。テンプレート・ホストのバインディング・ディレクティブのホストのバインディングが同じ要素に書くときの優先順位。ページの上で本物のコンポーネントにぶつかるバインディングを置いて結果を見るデモ。
10. [優先順位の連結リスト：style\_binding\_list.ts](10-domr-style-binding-list.md)  
   TNode の classBindings・styleBindings と TData に置く TStylingRange（前と次の番号を 1 つの数に詰める）、insertTStylingBinding が新しいバインディングをどこに差し込むか、同じ名前を持つ前後のバインディングに重複の印を付ける markDuplicates。初回のテンプレートの実行で 1 回だけ作られる表。
11. [値を決めて DOM に書く：checkStylingProperty から applyStyling まで](11-domr-styling-apply.md)  
   styling.ts の checkStylingProperty が bindingUpdated で値の変化を確かめ、normalizeSuffix で単位（.px）を付け、updateStyling が重複の印を見て findStylingValue で上の値・下の値を探し、node\_manipulation.ts の applyStyling が renderer の addClass・removeClass・setStyle・removeStyle（RendererStyleFlags2 の DashCase と Important）を呼ぶまで。「値なし」は undefined だけで、null と false は下の値があっても消すこと。スタイルの値のサニタイズは無く、開発モードの NG0318 の警告だけがあること。
12. [\[class\] と \[style\] のマップ：文字列・配列・オブジェクト](12-domr-styling-maps.md)  
   \[class\] に文字列・配列・オブジェクト・Set、\[style\] に文字列・オブジェクトを渡したときの扱い（toStylingKeyValueArray、classStringParser・styleStringParser と styling\_parser.ts の parseClassName・parseStyle）、名前の順に並んだ KeyValueArray を前の値と 1 回なめて比べる updateStylingMap と、その順番のせいで起きる issue #37224（padding と padding-left）、静的なクラスと混ざるとき（TStylingStatic と residual）。class\_differ.ts は今は差分を取らず、セレクタの照合の classIndexOf だけであること。
13. [EventManager とプラグイン：イベント名で振り分ける](13-domr-event-manager.md)  
   EVENT\_MANAGER\_PLUGINS（BrowserModule と bootstrapApplication の providers で入る DomEventsPlugin・KeyEventsPlugin）、EventManager のコンストラクタが DomEventsPlugin 以外を逆順にして DomEventsPlugin を必ず最後に置く行、\_findPluginFor が supports を順に聞いて結果を \_eventNameToPlugin に覚える行と NG05101 が出る条件、EventManagerPlugin の抽象クラス。ページの上で本物の EventManager にイベント名を振り分けさせるデモ。
14. [renderer.listen：window: と document: の的、オプション、外し方](14-domr-listen.md)  
   (window:resize) と @HostListener('document:keydown') の window: をコンパイラが切って ɵɵresolveWindow などに変え、core の listeners.ts が本物の的を取って引数 3 つで renderer.listen を呼ぶまで。DefaultDomRenderer2.listen が直接呼ばれたときの 'window'・'document'・'body' の文字列を getGlobalEventTarget で直す行、ListenerOptions（passive・capture・once）が届く道、DomEventsPlugin の addEventListener と removeEventListener、返した関数をビューの破棄で呼ぶまで、false で preventDefault。
15. [keydown.enter と keydown.shift.a：KeyEventsPlugin](15-domr-key-events.md)  
   key\_events.ts の parseEventName が keydown.control.shift.a を「主なキー」と「修飾キー」に分けて決まった順に並べ直す行、matchEventFullKeyCode が event.key（\_keyMap で Del・Esc・Left などの古い値を直す）や event.code（keydown.code.keyA）から同じ形の文字列を作って比べる行、修飾キーの getter、eventCallback。ページの上で本物の ɵKeyEventsPlugin と EventManager にキーを押して当たるかを見るデモ。
16. [自分のプラグインを足す：EVENT\_MANAGER\_PLUGINS](16-domr-custom-plugin.md)  
   multi: true の EVENT\_MANAGER\_PLUGINS に自分の EventManagerPlugin を足すと、supports が先に聞かれる順番、addEventListener で返す関数、NgZone の外でリスナーを付けたいときの manager.getZone()。Hammer の統合が 2026 年 3 月に消えた（f99e7ed20f0）あとの、長押しのような独自のイベントの作り方。ページの上で本物の EventManager に独自のプラグインを入れて動かすデモ。
17. [サニタイズの流れ：ɵɵsanitizeHtml から DomSanitizer まで](17-domr-sanitization.md)  
   コンパイラが dom\_security\_schema.ts の表で \[innerHTML\] や \[href\] に付ける ɵɵsanitizeHtml・ɵɵsanitizeUrl・ɵɵsanitizeResourceUrl と、ɵɵsanitize\* が「LView の sanitizer → SafeValue の印 → core の \_sanitizeHtml・\_sanitizeUrl」の順に見る分かれ（Sanitizer は既定で null なので、ふつうは core のサニタイザが直接動く）、ホストのバインディングを本当の要素で選び直す修正（d06e3748b7b・f57d5d5c8c3）、DomSanitizerImpl.sanitize の SecurityContext ごとの分かれ。ページの上で本物の DomSanitizer と本物のテンプレートに値を渡すデモ。
18. [bypassSecurityTrust と Trusted Types：信頼の印](18-domr-trusted-types.md)  
   bypass.ts の SafeValueImpl とその子クラス、allowSanitizationBypassAndThrow が違う種類の印を拒む行、trusted\_types.ts の 'angular' のポリシーと trusted\_types\_bypass.ts の 'angular#unsafe-bypass'、ɵɵtrustConstantHtml、iframe の危ない属性を止める iframe\_attrs\_validation.ts と ɵɵvalidateAttribute（SVG のアニメーション属性の修正 7168bed663b・3499a1321bf）。
19. [Title・Meta・DomAdapter：&lt;head&gt; を触る小さなサービス](19-domr-title-meta.md)  
   Title の getTitle・setTitle、Meta の addTag・getTag・updateTag・removeTag が属性のセレクタを作る行（parseSelector・escapeSelectorValue・META\_KEYS\_MAP の httpEquiv・on\* を拒む validateMetaDefinition）、getDOM と BrowserDomAdapter（createElement・remove・getBaseHref・getCookie）、BrowserGetTestability。ページの上で、別の Document を渡した本物の Meta と Title を動かすデモ。
20. [issue と PR を読む：レンダラー・スタイル・イベント・セキュリティの今](20-domr-issues.md)  
   area: security・core: sanitization・core: DOM rendering・core: CSS encapsulation・core: stylesheets・core: styling bindings・core: event listeners・core: event dispatch・core: host and host bindings のラベルで開いている issue と、2025-11 以降に閉じた issue の表。security の issue の流れ（VRP）、どの issue がこのシリーズのどの章の行に関係するか、2026 年に入った修正（insertBefore のエラー、SVG のアニメーション属性、ReDoS、ホストのバインディングのサニタイズ）の読み方。
