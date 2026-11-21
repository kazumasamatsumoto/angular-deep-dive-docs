[目次](../README.md) › [core の説明文の読み残し（2）](README.md) › 第 9 回 / 全 10 回

# サニタイズの公開 API の説明文：DomSanitizer の約束と SecurityContext

> sanitization/dom\_security\_schema.ts・bypass.ts・sanitization.ts・html\_sanitizer.ts・inert\_body.ts と platform-browser の DomSanitizer の未読の行：SecurityContext の各値がどの属性に当たるか、DomSanitizer.sanitize と bypassSecurityTrust\* が何を約束し何を約束しないか、開発モードの警告。安全な使い方の側から読む。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cra-sanitize)

---

この章で分かること：サニタイズ（危ないかもしれない値を、DOM に書く前に安全な形に直すこと）の公開 API、`SecurityContext`・`DomSanitizer`・`bypassSecurityTrust*` の説明文が何を約束し、何を約束しないかを、安全な使い方の側から読みます。試す値は、ふつうの入力と、サニタイザーが落とす最小の形（`javascript:` の URL・`<script>` の要素・`on*` の属性）だけです。食い違いは、`DomSanitizer.sanitize` の「HTML 以外はただの文字列なら例外」が URL と STYLE では成り立たないこと、命令の側の説明文（`@codeGenApi`）に実装と合わない文がいくつか残っていることです。

読む対象は `packages/core/src/sanitization/` の dom\_security\_schema.ts・bypass.ts・sanitization.ts・html\_sanitizer.ts・inert\_body.ts の説明文と、`packages/platform-browser/src/security/dom_sanitization_service.ts` の `DomSanitizer` の説明文です（../angular、8576f161ae4）。どのバインディングにどの関数が付き、実行時にどう分かれるかは[サニタイズの入口の章](../domr/17-domr-sanitization.md)、印（SafeValue）の中身と Trusted Types は[Trusted Types の章](../domr/18-domr-trusted-types.md)、HTML のサニタイザーが何を残すかの考え方（許可リスト）は[サニタイズの章](../template/07-sanitize.md)が読んでいます。

1. [1. ApplicationRef](01-cra-app-ref.md)
2. [2. platform と bootstrap](02-cra-platform.md)
3. [3. ViewContainerRef](03-cra-view-container.md)
4. [4. QueryList・DestroyRef](04-cra-linker-misc.md)
5. [5. input・model・output](05-cra-signal-io.md)
6. [6. signal のクエリ](06-cra-signal-queries.md)
7. [7. NgZone・ErrorHandler](07-cra-zone-errors.md)
8. [8. DebugElement](08-cra-debug.md)
9. **9. サニタイズ**（この章）
10. [10. spec と issue](10-cra-tests-issues.md)

## 1. SecurityContext：値の「書かれる場所」の種類

📄 `angular/packages/core/src/sanitization/dom_security_schema.ts` L9–26 （▶ の行: 10–12, 14, 18–25）

```ts
 9 │ /**
10 ▶  * A SecurityContext marks a location that has dangerous security implications, e.g. a DOM property
11 ▶  * like `innerHTML` that could cause Cross Site Scripting (XSS) security bugs when improperly
12 ▶  * handled.
13 │  *
14 ▶  * See DomSanitizer for more details on security in Angular applications.
15 │  *
16 │  * @publicApi
17 │  */
18 ▶ export enum SecurityContext {
19 ▶   NONE = 0,
20 ▶   HTML = 1,
21 ▶   STYLE = 2,
22 ▶   SCRIPT = 3,
23 ▶   URL = 4,
24 ▶   RESOURCE_URL = 5,
25 ▶   ATTRIBUTE_NO_BINDING = 6,
26 │ }
```

📄 `angular/packages/core/src/sanitization/dom_security_schema.ts` L38–57 （▶ の行: 39–40, 42–45）

```ts
38 │ /**
39 ▶  * A security schema mapping property or attribute names to namespaces,
40 ▶  * tag names, and finally their corresponding `SecurityContext`.
41 │  *
42 ▶  * - The first level keys are lowercase property or attribute names (e.g., `'href'`, `'srcdoc'`).
43 ▶  * - The second level keys are lowercase namespaces (e.g., `''` for HTML/default, `'svg'`, `'math'`).
44 ▶  * - The third level keys are lowercase tag names (e.g., `'a'`, `'iframe'`, or `'*'` for all elements)
45 ▶  *   mapping to the appropriate `SecurityContext` value.
46 │  */
47 │ type SecuritySchema = Record<
48 │   string, // Property/Attribute Name
49 │   Record<
50 │     string, // Namespace
51 │     Record<
52 │       string, // Tag Name
53 │       SecurityContext
54 │     >
55 │   >
56 │ >;
57 │ 
```

10〜12 行目のとおり、`SecurityContext` は「扱いを誤ると XSS（よそのスクリプトがページの中で動く不具合）になる場所」に付ける印で、19〜25 行目の 7 つの値があります（DEMO の「SecurityContext の値」で 0〜6）。どの属性がどの値になるかの表は、42〜45 行目のとおり「属性の名前 → 名前空間 → タグの名前」の 3 段の object で、表の中身（L76〜）と引き方は[サニタイズの入口の章](../domr/17-domr-sanitization.md)の 1 節です。DEMO で本物のテンプレートに当てた結果を、表と並べます。

| SecurityContext | 当たる要素と属性（表） | ただの文字列をバインドしたとき（DEMO・このページ） |
| --- | --- | --- |
| `HTML`（1） | どの要素の `innerHTML`・`outerHTML`、`iframe` の `srcdoc` | 許可リストで直す（`<script>` と `on*` が落ちる） |
| `STYLE`（2） | どの要素の `style` | そのまま（`color: red`） |
| `SCRIPT`（3） | 無し（テンプレートの `<script>` はパーサーが取り除く） | — |
| `URL`（4） | `a`・`area` の `href`、`form` の `action`、どの要素の `formAction`、SVG の `a`、MathML の `href` | 安全なら そのまま、`javascript:` なら頭に `unsafe:` |
| `RESOURCE_URL`（5） | `iframe`・`embed`・`frame` の `src`、`base`・`link` の `href`、`object` の `data`・`codebase` | 例外 `NG0904`（印の付いた値しか通さない）。`null` は `src=""` |
| `ATTRIBUTE_NO_BINDING`（6） | SVG のアニメーションの属性、`iframe` の `sandbox`・`allow` ほか | バインディングそのものを止める（[Trusted Types の章](../domr/18-domr-trusted-types.md)） |

このサイトが使う 22.2.6 は、../angular（8576f161ae4）の表から `img`・`video` の `src` の 2 行（L91〜92「安全なので消すべきだが…」）がもう消えた版です（6fa2b083e6f、main の 439ff1bdf4f の取り込み）。そのため 22.2.6 では `<img [src]>` は `NONE` です（このページでは画像を読み込ませないので、確かめは表と記録の Node で行った）。`<iframe [src]="null">` が例外にならず `src=""` になるのも 22.2.6 に入った同じ修正（main の 088cdd2cab6）です（8576f161ae4 では `NG0904`）。

## 2. DomSanitizer の説明：何を約束し、何を約束しないか

📄 `angular/packages/platform-browser/src/security/dom_sanitization_service.ts` L77–107 （▶ の行: 78–79, 81–83, 85–88, 90, 93–95, 97–99, 101–103）

```ts
 77 │ /**
 78 ▶  * DomSanitizer helps preventing Cross Site Scripting Security bugs (XSS) by sanitizing
 79 ▶  * values to be safe to use in the different DOM contexts.
 80 │  *
 81 ▶  * For example, when binding a URL in an `<a [href]="someValue">` hyperlink, `someValue` will be
 82 ▶  * sanitized so that an attacker cannot inject e.g. a `javascript:` URL that would execute code on
 83 ▶  * the website.
 84 │  *
 85 ▶  * In specific situations, it might be necessary to disable sanitization, for example if the
 86 ▶  * application genuinely needs to produce a `javascript:` style link with a dynamic value in it.
 87 ▶  * Users can bypass security by constructing a value with one of the `bypassSecurityTrust...`
 88 ▶  * methods, and then binding to that value from the template.
 89 │  *
 90 ▶  * These situations should be very rare, and extraordinary care must be taken to avoid creating a
 91 │  * Cross Site Scripting (XSS) security bug!
 92 │  *
 93 ▶  * When using `bypassSecurityTrust...`, make sure to call the method as early as possible and as
 94 ▶  * close as possible to the source of the value, to make it easy to verify no security bug is
 95 ▶  * created by its use.
 96 │  *
 97 ▶  * It is not required (and not recommended) to bypass security if the value is safe, e.g. a URL that
 98 ▶  * does not start with a suspicious protocol, or an HTML snippet that does not contain dangerous
 99 ▶  * code. The sanitizer leaves safe values intact.
100 │  *
101 ▶  * @security Calling any of the `bypassSecurityTrust...` APIs disables Angular's built-in
102 ▶  * sanitization for the value passed in. Carefully check and audit all values and code paths going
103 ▶  * into this call. Make sure any user data is appropriately escaped for this security context.
104 │  * For more detail, see the [Security Guide](https://g.co/ng/security).
105 │  *
106 │  * @publicApi
107 │  */
```

この段落の約束を、テンプレートのバインディングで確かめました（DEMO の「テンプレートのバインディング」）。

- 81〜83 行目「`<a [href]>` に `javascript:` の URL を入れさせない」：`href="unsafe:javascript:void(0)"` になり、`form` の `action` も同じでした。ふつうの URL と相対の URL はそのままです。
- 97〜99 行目「安全な値は手を付けずに残す」：`<b>太字</b> と <a href="/x">リンク</a>` は画面の上ではそのままでした。ただし「安全」は 5 節の許可リストで決まり、ふつうの入力でも `style` の属性・SVG・`<button>` は落ちます。`DomSanitizer.sanitize(HTML, …)` が返す文字列も、ASCII でない文字を `&#22826;` の形に直します（spec の `does not warn when just re-encoding text`、html\_sanitizer\_spec.ts L104）。「中身の意味を変えない」という意味で読むのが正確です。
- 85〜88 行目と 101〜103 行目：`bypassSecurityTrust…` で作った値は、その値のサニタイズを止めます。止めるだけで、中身を確かめることはしません（4 節）。93〜95 行目は「値の出どころのそばで、できるだけ早く呼ぶ」という使い方の約束で、実装が強制するものではありません。

## 3. sanitize：HTML 以外の文字列は例外、ではない

`sanitize` の説明（L110〜118、[サニタイズの入口の章](../domr/17-domr-sanitization.md)が引いている）は、L113「SafeValue なら中身を返す」、L114〜115「HTML で文字列なら危ないものを取り除く」、L116〜117「ほかの文脈では、ただの文字列なら例外」と書きます。DEMO の「DomSanitizer.sanitize」で、このページの本物の `DomSanitizer` に渡しました。

| 渡したもの | 結果（このページ・本番） | L116〜117 と |
| --- | --- | --- |
| `sanitize(URL, 'https://angular.dev/')` | `'https://angular.dev/'`（`javascript:` なら `'unsafe:…'`） | 例外にならない |
| `sanitize(STYLE, 'color: red')` | `'color: red'` | 例外にならない |
| `sanitize(RESOURCE_URL, '…')` | 例外 `NG05201` | 説明のとおり |
| `sanitize(SCRIPT, '…')` | 例外 `NG05200` | 説明のとおり |
| `sanitize(NONE, x)`・`sanitize(HTML, null)` | `x` のまま・`null` | 書いていない |
| `sanitize(ATTRIBUTE_NO_BINDING, x)` | 例外 `NG05202` | 書いていない |

`DomSanitizerImpl.sanitize`（dom\_sanitization\_service.ts L169〜214）は、URL では `_sanitizeUrl` の結果を、STYLE では値をそのまま返し、例外を投げるのは SCRIPT と RESOURCE\_URL だけです。L113〜117 は 0331473e3ac（2023-01-18、`docs(platform-browser): Sanitize method has more explicit documentation (#48765)`）で書き直された文で、その前の説明は「値はその文脈で安全になるようにサニタイズされる。たとえば危ないプロトコルの URL を直す」でした。書き直した時点の実装も、すでに URL では `_sanitizeUrl` を返しています。main でも同じ文です。開発モードの記録では、URL を直したときに `WARNING: sanitizing unsafe URL value javascript:void(0) (see …)`、HTML から何かを落としたときに `WARNING: sanitizing HTML stripped some content, see …` が console に出ました（下の DEMO の欄）。本番（このページ）では出ません。

## 4. bypassSecurityTrust\*：印を付けるだけ

📄 `angular/packages/platform-browser/src/security/dom_sanitization_service.ts` L120–145 （▶ の行: 122–124, 126–127, 129, 132, 140）

```ts
120 │ 
121 │   /**
122 ▶    * Bypass security and trust the given value to be safe HTML. Only use this when the bound HTML
123 ▶    * is unsafe (e.g. contains `<script>` tags) and the code should be executed. The sanitizer will
124 ▶    * leave safe HTML intact, so in most situations this method should not be used.
125 │    *
126 ▶    * **WARNING:** calling this method with untrusted user data exposes your application to XSS
127 ▶    * security risks!
128 │    */
129 ▶   abstract bypassSecurityTrustHtml(value: string): SafeHtml;
130 │ 
131 │   /**
132 ▶    * Bypass security and trust the given value to be safe style value (CSS).
133 │    *
134 │    * **WARNING:** calling this method with untrusted user data exposes your application to XSS
135 │    * security risks!
136 │    */
137 │   abstract bypassSecurityTrustStyle(value: string): SafeStyle;
138 │ 
139 │   /**
140 ▶    * Bypass security and trust the given value to be safe JavaScript.
141 │    *
142 │    * **WARNING:** calling this method with untrusted user data exposes your application to XSS
143 │    * security risks!
144 │    */
145 │   abstract bypassSecurityTrustScript(value: string): SafeScript;
```

📄 `angular/packages/platform-browser/src/security/dom_sanitization_service.ts` L146–164 （▶ の行: 148–149, 154, 157–158, 163）

```ts
146 │ 
147 │   /**
148 ▶    * Bypass security and trust the given value to be a safe style URL, i.e. a value that can be used
149 ▶    * in hyperlinks or `<img src>`.
150 │    *
151 │    * **WARNING:** calling this method with untrusted user data exposes your application to XSS
152 │    * security risks!
153 │    */
154 ▶   abstract bypassSecurityTrustUrl(value: string): SafeUrl;
155 │ 
156 │   /**
157 ▶    * Bypass security and trust the given value to be a safe resource URL, i.e. a location that may
158 ▶    * be used to load executable code from, like `<script src>`, or `<iframe src>`.
159 │    *
160 │    * **WARNING:** calling this method with untrusted user data exposes your application to XSS
161 │    * security risks!
162 │    */
163 ▶   abstract bypassSecurityTrustResourceUrl(value: string): SafeResourceUrl;
164 │ }
```

📄 `angular/packages/core/src/sanitization/bypass.ts` L26–59 （▶ の行: 27, 31, 34, 38, 41, 45, 48, 52, 55, 59）

```ts
26 │ /**
27 ▶  * Marker interface for a value that's safe to use as HTML.
28 │  *
29 │  * @publicApi
30 │  */
31 ▶ export interface SafeHtml extends SafeValue {}
32 │ 
33 │ /**
34 ▶  * Marker interface for a value that's safe to use as style (CSS).
35 │  *
36 │  * @publicApi
37 │  */
38 ▶ export interface SafeStyle extends SafeValue {}
39 │ 
40 │ /**
41 ▶  * Marker interface for a value that's safe to use as JavaScript.
42 │  *
43 │  * @publicApi
44 │  */
45 ▶ export interface SafeScript extends SafeValue {}
46 │ 
47 │ /**
48 ▶  * Marker interface for a value that's safe to use as a URL linking to a document.
49 │  *
50 │  * @publicApi
51 │  */
52 ▶ export interface SafeUrl extends SafeValue {}
53 │ 
54 │ /**
55 ▶  * Marker interface for a value that's safe to use as a URL to load executable code from.
56 │  *
57 │  * @publicApi
58 │  */
59 ▶ export interface SafeResourceUrl extends SafeValue {}
```

5 つの `bypassSecurityTrust*` は、どれも core の印の class に包んで返すだけです（[Trusted Types の章](../domr/18-domr-trusted-types.md)）。印の型（27〜59 行目）は中身の無い「marker interface」で、TypeScript の上では区別の役に立ちません。区別は実行時の class でつけます。DEMO の「bypassSecurityTrust\* の値を別の文脈に」は、ふつうの値（`'/chapter/cra-sanitize'`・`'<b>印付き</b>'`）に印を付けて、本物のテンプレートに入れたものです。

1. **同じ種類の文脈**

   `[href]` に URL の印、`[innerHTML]` に HTML の印は、中身がそのまま入りました。
2. **ResourceURL の印を URL の文脈に**

   通ります。「読み込んでよい URL」は「リンクしてよい URL」より強い信頼だから、という扱いです（bypass.ts L129〜130）。
3. **違う種類の印**

   `[href]` に HTML の印は `Required a safe URL, got a HTML`、`[innerHTML]` に URL の印は `Required a safe HTML, got a URL`、`<iframe [src]>` に URL の印は `Required a safe ResourceURL, got a URL` の例外です。この 3 つは `RuntimeError` ではない素の `Error` で、NG の番号が無く、本番でも同じ文です（bypass.ts L131）。
4. **補間 {{ }} に入れる**

   中身ではなく `SafeValue must use [property]=binding: …` という文が画面に出ました（印の `toString`）。

148〜149 行目の `bypassSecurityTrustUrl` の説明「ハイパーリンクや `<img src>` に使える safe style URL」は、2 つの点で今の実物と合いません。「style URL」は STYLE の文脈と関係が無く、22.2.6 では `<img src>` は URL の文脈から外れました（1 節）。122〜124 行目「`<script>` を含むなど、本当に危ない HTML のときだけ使う」と、157〜158 行目「`<script src>` のような、実行するものを読み込む場所」は、使う場面をはっきり絞る約束です。

📄 `angular/packages/core/src/sanitization/bypass.ts` L140–175 （▶ の行: 143–144, 149–150, 155, 159, 161–162, 167, 173–174）

```ts
140 │ /**
141 │  * Mark `html` string as trusted.
142 │  *
143 ▶  * This function wraps the trusted string in `String` and brands it in a way which makes it
144 ▶  * recognizable to {@link htmlSanitizer} to be trusted implicitly.
145 │  *
146 │  * @param trustedHtml `html` string which needs to be implicitly trusted.
147 │  * @returns a `html` which has been branded to be implicitly trusted.
148 │  */
149 ▶ export function bypassSanitizationTrustHtml(trustedHtml: string): SafeHtml {
150 ▶   return new SafeHtmlImpl(trustedHtml);
151 │ }
152 │ /**
153 │  * Mark `style` string as trusted.
154 │  *
155 ▶  * This function wraps the trusted string in `String` and brands it in a way which makes it
156 │  * recognizable to {@link styleSanitizer} to be trusted implicitly.
157 │  *
158 │  * @param trustedStyle `style` string which needs to be implicitly trusted.
159 ▶  * @returns a `style` hich has been branded to be implicitly trusted.
160 │  */
161 ▶ export function bypassSanitizationTrustStyle(trustedStyle: string): SafeStyle {
162 ▶   return new SafeStyleImpl(trustedStyle);
163 │ }
164 │ /**
165 │  * Mark `script` string as trusted.
166 │  *
167 ▶  * This function wraps the trusted string in `String` and brands it in a way which makes it
168 │  * recognizable to {@link scriptSanitizer} to be trusted implicitly.
169 │  *
170 │  * @param trustedScript `script` string which needs to be implicitly trusted.
171 │  * @returns a `script` which has been branded to be implicitly trusted.
172 │  */
173 ▶ export function bypassSanitizationTrustScript(trustedScript: string): SafeScript {
174 ▶   return new SafeScriptImpl(trustedScript);
175 │ }
```

core の側の 5 つの関数（DomSanitizer の中から呼ばれる、ɵ の付いた内部の API）の説明は、143〜144 行目「文字列を `String` に包み、印を付ける」と書きますが、150・162・174 行目のとおり `String` ではなく `SafeHtmlImpl` ほかの class に包んでいます。159 行目の `hich` は `which` の書き損じです。どちらも main でそのままです。

## 5. 何を残すか：要素と属性の許可リスト

📄 `angular/packages/core/src/sanitization/html_sanitizer.ts` L34–70 （▶ の行: 38, 40, 44, 51–52, 57, 61–62, 66–67）

```ts
34 │ // Good source of info about elements and attributes
35 │ // https://html.spec.whatwg.org/#semantics
36 │ // https://simon.html5.org/html-elements
37 │ 
38 ▶ // Safe Void Elements - HTML5
39 │ // https://html.spec.whatwg.org/#void-elements
40 ▶ const VOID_ELEMENTS = tagSet('area,br,col,hr,img,wbr');
41 │ 
42 │ // Elements that you can, intentionally, leave open (and which close themselves)
43 │ // https://html.spec.whatwg.org/#optional-tags
44 ▶ const OPTIONAL_END_TAG_BLOCK_ELEMENTS = tagSet('colgroup,dd,dt,li,p,tbody,td,tfoot,th,thead,tr');
45 │ const OPTIONAL_END_TAG_INLINE_ELEMENTS = tagSet('rp,rt');
46 │ const OPTIONAL_END_TAG_ELEMENTS = merge(
47 │   OPTIONAL_END_TAG_INLINE_ELEMENTS,
48 │   OPTIONAL_END_TAG_BLOCK_ELEMENTS,
49 │ );
50 │ 
51 ▶ // Safe Block Elements - HTML5
52 ▶ const BLOCK_ELEMENTS = merge(
53 │   OPTIONAL_END_TAG_BLOCK_ELEMENTS,
54 │   tagSet(
55 │     'address,article,' +
56 │       'aside,blockquote,caption,center,del,details,dialog,dir,div,dl,figure,figcaption,footer,h1,h2,h3,h4,h5,' +
57 ▶       'h6,header,hgroup,hr,ins,main,map,menu,nav,ol,pre,section,summary,table,ul',
58 │   ),
59 │ );
60 │ 
61 ▶ // Inline Elements - HTML5
62 ▶ const INLINE_ELEMENTS = merge(
63 │   OPTIONAL_END_TAG_INLINE_ELEMENTS,
64 │   tagSet(
65 │     'a,abbr,acronym,audio,b,' +
66 ▶       'bdi,bdo,big,br,cite,code,del,dfn,em,font,i,img,ins,kbd,label,map,mark,picture,q,ruby,rp,rt,s,' +
67 ▶       'samp,small,source,span,strike,strong,sub,sup,time,track,tt,u,var,video',
68 │   ),
69 │ );
70 │ 
```

📄 `angular/packages/core/src/sanitization/html_sanitizer.ts` L78–110 （▶ の行: 78–80, 83–84, 87, 92, 102–104, 106–108, 110）

```ts
 78 ▶ // Attributes that have href and hence need to be sanitized
 79 ▶ const URI_ATTRS: BooleanRecord = tagSet(
 80 ▶   'background,cite,href,itemtype,longdesc,poster,src,xlink:href',
 81 │ );
 82 │ 
 83 ▶ const HTML_ATTRS = tagSet(
 84 ▶   'abbr,accesskey,align,alt,autoplay,axis,bgcolor,border,cellpadding,cellspacing,class,clear,color,cols,colspan,' +
 85 │     'compact,controls,coords,datetime,default,dir,download,face,headers,height,hidden,hreflang,hspace,' +
 86 │     'ismap,itemscope,itemprop,kind,label,lang,language,loop,media,muted,nohref,nowrap,open,preload,rel,rev,role,rows,rowspan,rules,' +
 87 ▶     'scope,scrolling,shape,size,sizes,span,srclang,srcset,start,summary,tabindex,target,title,translate,type,usemap,' +
 88 │     'valign,value,vspace,width',
 89 │ );
 90 │ 
 91 │ // Accessibility attributes as per WAI-ARIA 1.1 (W3C Working Draft 14 December 2018)
 92 ▶ const ARIA_ATTRS = tagSet(
 93 │   'aria-activedescendant,aria-atomic,aria-autocomplete,aria-busy,aria-checked,aria-colcount,aria-colindex,' +
 94 │     'aria-colspan,aria-controls,aria-current,aria-describedby,aria-details,aria-disabled,aria-dropeffect,' +
 95 │     'aria-errormessage,aria-expanded,aria-flowto,aria-grabbed,aria-haspopup,aria-hidden,aria-invalid,' +
 96 │     'aria-keyshortcuts,aria-label,aria-labelledby,aria-level,aria-live,aria-modal,aria-multiline,' +
 97 │     'aria-multiselectable,aria-orientation,aria-owns,aria-placeholder,aria-posinset,aria-pressed,aria-readonly,' +
 98 │     'aria-relevant,aria-required,aria-roledescription,aria-rowcount,aria-rowindex,aria-rowspan,aria-selected,' +
 99 │     'aria-setsize,aria-sort,aria-valuemax,aria-valuemin,aria-valuenow,aria-valuetext',
100 │ );
101 │ 
102 ▶ // NB: This currently consciously doesn't support SVG. SVG sanitization has had several security
103 ▶ // issues in the past, so it seems safer to leave it out if possible. If support for binding SVG via
104 ▶ // innerHTML is required, SVG attributes should be added here.
105 │ 
106 ▶ // NB: Sanitization does not allow <form> elements or other active elements (<button> etc). Those
107 ▶ // can be sanitized, but they increase security surface area without a legitimate use case, so they
108 ▶ // are left out here.
109 │ 
110 ▶ export const VALID_ATTRS: BooleanRecord = merge(URI_ATTRS, HTML_ATTRS, ARIA_ATTRS);
```

2 節の「ふつうの入力でも落ちるもの」は、この 2 つの表で説明できます。

- `style` の属性は 83〜88 行目の `HTML_ATTRS` に無いので落ちます（spec の `should strip dangerous attributes`、html\_sanitizer\_spec.ts L155 は `id`・`name`・`style` を「危ない属性」として固めている）。`style` を残してほしいという issue #45270 が開いています。
- SVG は 102〜104 行目「過去に問題が多かったので、意図して入れていない」。DEMO の `<svg>` は中身ごと消えました。
- `<button>`・`<form>` は 106〜108 行目「正当な使い道が無く、攻撃面を広げるだけ」で、タグだけ落ちて中身の文字（`押す`）が残りました。
- 79〜80 行目の `URI_ATTRS`（`href`・`src` ほか）は、残す前に 3 節と同じ URL のサニタイザーを通します。

📄 `angular/packages/core/src/sanitization/inert_body.ts` L11–28 （▶ の行: 12–13, 15–16, 25, 27）

```ts
11 │ /**
12 ▶  * This helper is used to get hold of an inert tree of DOM elements containing dirty HTML
13 ▶  * that needs sanitizing.
14 │  * Depending upon browser support we use one of two strategies for doing this.
15 ▶  * Default: DOMParser strategy
16 ▶  * Fallback: InertDocument strategy
17 │  */
18 │ export function getInertBodyHelper(defaultDoc: Document): InertBodyHelper {
19 │   const inertDocumentHelper = new InertDocumentHelper(defaultDoc);
20 │   return isDOMParserAvailable() ? new DOMParserHelper(inertDocumentHelper) : inertDocumentHelper;
21 │ }
22 │ 
23 │ export interface InertBodyHelper {
24 │   /**
25 ▶    * Get an inert DOM element containing DOM created from the dirty HTML string provided.
26 │    */
27 ▶   getInertBodyElement: (html: string) => HTMLElement | null;
28 │ }
```

12〜13 行目の「inert（動かない）な DOM の木」は、文字列を、スクリプトを走らせず、画像も読み込まない別の文書の上で組み立てる、という意味です（15 行目の `DOMParser` が既定）。サニタイザーはその木を 5 節の表で歩き、残すものだけを文字列に書き直します。だから `[innerHTML]` に入る前の文字列は、ページの文書の上では一度も組み立てられません。

## 6. 命令の側の説明文（@codeGenApi）

📄 `angular/packages/core/src/sanitization/sanitization.ts` L36–50 （▶ の行: 37–38, 40–41, 43, 46–47, 49）

```ts
36 │ /**
37 ▶  * An `html` sanitizer which converts untrusted `html` **string** into trusted string by removing
38 ▶  * dangerous content.
39 │  *
40 ▶  * This method parses the `html` and locates potentially dangerous content (such as urls and
41 ▶  * javascript) and removes it.
42 │  *
43 ▶  * It is possible to mark a string as trusted by calling {@link bypassSanitizationTrustHtml}.
44 │  *
45 │  * @param unsafeHtml untrusted `html`, typically from the user.
46 ▶  * @returns `html` string which is safe to display to user, because all of the dangerous javascript
47 ▶  * and urls have been removed.
48 │  *
49 ▶  * @codeGenApi
50 │  */
```

📄 `angular/packages/core/src/sanitization/sanitization.ts` L74–84 （▶ の行: 75–76, 81, 83）

```ts
74 │ /**
75 ▶  * A `style` sanitizer which converts untrusted `style` **string** into trusted string by removing
76 ▶  * dangerous content.
77 │  *
78 │  * It is possible to mark a string as trusted by calling {@link bypassSanitizationTrustStyle}.
79 │  *
80 │  * @param unsafeStyle untrusted `style`, typically from the user.
81 ▶  * @returns `style` string which is safe to bind to the `style` properties.
82 │  *
83 ▶  * @codeGenApi
84 │  */
```

📄 `angular/packages/core/src/sanitization/sanitization.ts` L96–111 （▶ の行: 97–99, 101–102, 107–108）

```ts
 96 │ /**
 97 ▶  * A `url` sanitizer which converts untrusted `url` **string** into trusted string by removing
 98 ▶  * dangerous
 99 ▶  * content.
100 │  *
101 ▶  * This method parses the `url` and locates potentially dangerous content (such as javascript) and
102 ▶  * removes it.
103 │  *
104 │  * It is possible to mark a string as trusted by calling {@link bypassSanitizationTrustUrl}.
105 │  *
106 │  * @param unsafeUrl untrusted `url`, typically from the user.
107 ▶  * @returns `url` string which is safe to bind to the `src` properties such as `<img src>`, because
108 ▶  * all of the dangerous javascript has been removed.
109 │  *
110 │  * @codeGenApi
111 │  */
```

📄 `angular/packages/core/src/sanitization/sanitization.ts` L123–133 （▶ の行: 124, 126, 129–130）

```ts
123 │ /**
124 ▶  * A `url` sanitizer which only lets trusted `url`s through.
125 │  *
126 ▶  * This passes only `url`s marked trusted by calling {@link bypassSanitizationTrustResourceUrl}.
127 │  *
128 │  * @param unsafeResourceUrl untrusted `url`, typically from the user.
129 ▶  * @returns `url` string which is safe to bind to the `src` properties such as `<img src>`, because
130 ▶  * only trusted `url`s have been allowed to pass.
131 │  *
132 │  * @codeGenApi
133 │  */
```

📄 `angular/packages/core/src/sanitization/sanitization.ts` L150–161 （▶ の行: 151, 153, 157–158）

```ts
150 │ /**
151 ▶  * A `script` sanitizer which only lets trusted javascript through.
152 │  *
153 ▶  * This passes only `script`s marked trusted by calling {@link
154 │  * bypassSanitizationTrustScript}.
155 │  *
156 │  * @param unsafeScript untrusted `script`, typically from the user.
157 ▶  * @returns `url` string which is safe to bind to the `<script>` element such as `<img src>`,
158 ▶  * because only trusted `scripts` have been allowed to pass.
159 │  *
160 │  * @codeGenApi
161 │  */
```

コンパイラが命令に付ける `ɵɵsanitize*` の説明文です（49 行目ほかの `@codeGenApi`：生成されたコードだけが呼ぶ API）。API の頁には出ませんが、読む人のための約束です。

- 37〜41 行目の HTML の説明は、2 節の結果のとおりです。
- 75〜76 行目「style の文字列から危ないものを取り除く」は違います。`ɵɵsanitizeStyle` は文字列にするだけで、何も取り除きません（[サニタイズの入口の章](../domr/17-domr-sanitization.md)の 4 節の表。DEMO の `[style]` も `color: red` のまま）。
- 107〜108 行目の URL の戻り値「`<img src>` の `src` に安全に使える」は、22.2.6 では `img` が URL の文脈から外れたので、例として合わなくなりました。129〜130 行目の resource URL の同じ文は、22.2.6（7c883e02bdd）と main（088cdd2cab6、`fix(core): allow binding null and undefined to resource URL properties`）で `<iframe src>` に直っています。
- 157〜158 行目の script の戻り値「`<script>` の要素に使える、`<img src>` のような `url` の文字列」は、URL の説明を写したまま崩れた文で、main でもそのままです。

もう 1 つ、L267〜276 の `validateAgainstEventProperties` の文「ディレクティブの入力なら、今のモジュールに import されているか確かめよ」は、NgModule の頃の言い方が残ったものです（standalone では「コンポーネントの `imports` に入っているか」）。

> **🧪 DEMO — サニタイズの約束を本物で試す（このページ・本番と、開発モードの記録）**
>
> 押すと、本物の `@angular/core` と `@angular/platform-browser`（22.2.6）で、小さなコンポーネントを `createComponent` で作り（文書に付けない div の上）、バインディングのあとに DOM に入った値を読んで destroy します。画像・動画・外部の URL は読み込ませません（iframe は文書に付けず、例外で止まる値か `null` しか入れない）。「記録」は同じ関数を Node（domino の上の JIT）で開発モードで走らせた手元の記録で、そのとき出た console.warn も下に並べます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cra-sanitize)

## ここまでの呼び出し

- 👤 `<a [href]="v()">` ← `'javascript:void(0)'`
  - `ɵɵproperty('href', v, ɵɵsanitizeUrl)` — コンパイラの出力（domr-sanitization の章）
    - `allowSanitizationBypassAndThrow(value, URL)` — bypass.ts L126〜134 — *印が無いので false*
    - `_sanitizeUrl(String(value))` — url\_sanitizer.ts L39〜48 — *'unsafe:' + url、開発モードだけ警告*
- 👤 `sanitizer.sanitize(SecurityContext.URL, '…')`
  - `DomSanitizerImpl.sanitize` — dom\_sanitization\_service.ts L169〜214 — *URL は直して返す。例外は SCRIPT と RESOURCE\_URL だけ*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `packages/core/test/sanitization/html_sanitizer_spec.ts` | `HTML sanitizer › should strip dangerous elements (but potentially traverse their content)`（117）・`should strip dangerous attributes`（155）・`does not warn when just re-encoding text`（104） | 2・5 節 |
| `packages/core/test/sanitization/sanitization_spec.ts` | `sanitization › should sanitize url`（71）・`should sanitize resourceUrl`（82）・`should sanitize style`（94） | 1・6 節 |
| `packages/core/test/sanitization/url_sanitizer_spec.ts` | `URL sanitizer`（11） | 2 節の URL |
| `packages/platform-browser/test/security/dom_sanitization_service_spec.ts` | `DOM Sanitization Service › accepts resource URL values for resource contexts`（14） | 3 節の一部。URL・STYLE の文字列の it は無い |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all "--test_arg=--filter=<下の名前>"
$ pnpm bazel test //packages/platform-browser/test:test --nocache_test_results --test_output=all "--test_arg=--filter=^DOM Sanitization Service"
```

📄 `--filter ごとの結果（2026-11-22、手元の記録）`

```
# //packages/core/test:test は shard_count = 4。4 つの shard の数を足した
--filter=^HTML sanitizer       42 specs（10+11+10+11）、0 failures
--filter=^sanitization         12 specs、0 failures
--filter=^URL sanitizer        30 specs、0 failures
//packages/platform-browser/test:test --filter=^DOM Sanitization Service   Ran 1 of 159 specs、0 failures
```

直すとしたら説明文の 5 か所です。dom\_sanitization\_service.ts の L116〜117 は「SCRIPT と RESOURCE\_URL では、ただの文字列なら例外。URL は直して返し、STYLE はそのまま返す」に、148〜149 行目は「style URL」と `<img src>` を外します。sanitization.ts の 75〜76 行目は「文字列にするだけ」に、157〜158 行目は「スクリプトとして安全な文字列」に、bypass.ts の 143 行目ほか 5 つの「`String` に包む」は「印の class に包む」にします。振る舞いは変えないので spec は要りませんが、L116〜117 の約束を固めるなら dom\_sanitization\_service\_spec.ts に「URL と STYLE の文字列は例外にならない」の it を足します。

## 聞かれそうな質問

**Q. `[innerHTML]` で `style` の属性が消えるのは不具合ですか？**

許可リスト（83〜88 行目）に無いからで、spec（L155）が「危ない属性」として固めている振る舞いです。見た目を付けたいなら class を使います（`class` は許可リストにある）。

**Q. `DomSanitizer.sanitize(SecurityContext.URL, 文字列)` は例外になりますか？**

なりません。説明文（L116〜117）とは違い、URL は直した文字列を、STYLE はそのままの文字列を返します。例外は SCRIPT と RESOURCE\_URL だけです。

**Q. `bypassSecurityTrustHtml` は中身を確かめてから印を付けますか？**

確かめません。印の class に包むだけで、その値はサニタイズされずに DOM に入ります（85〜88・101〜103 行目）。だから信頼できる出どころの値にだけ、出どころのそばで使います。

**Q. 違う種類の印を渡すとどうなりますか？**

例外です（`Required a safe URL, got a HTML` など）。例外は ResourceURL の印を URL の文脈に渡すときだけで、こちらは通ります。

**Q. 本番でもサニタイズは同じに働きますか？**

値の直し方は同じで、DEMO の表はこのページ（本番）と開発モードの記録で同じでした。違うのは、開発モードだけ console に警告が出ることと、例外の文に説明が付くこと（本番は `NG0904` だけ）です。

## 読み終えて

- `SecurityContext` は値の書かれる場所の 7 つの種類で、どの属性がどれかは 3 段の表で決まる。
- サニタイズは許可リスト。`style` の属性・SVG・`<button>` のようなふつうの入力も落ちる。
- `DomSanitizer.sanitize` が文字列で例外にするのは SCRIPT と RESOURCE\_URL だけ（説明文は URL と STYLE も含める）。
- `bypassSecurityTrust*` は印を付けるだけで、中身は確かめない。種類が違えば例外。
- 命令の側の説明文には、style を「取り除く」・script の戻り値の崩れた文・`String` に包む、が残っている。

---

← 前: [DebugElement と DebugNode の説明文](08-cra-debug.md)  
次: [spec と issue を読む：core の説明文（2）を固めているもの](10-cra-tests-issues.md) →
