[目次](../README.md) › [DOM レンダラーとイベントの内側](README.md) › 第 19 回 / 全 20 回

# Title・Meta・DomAdapter：&lt;head&gt; を触る小さなサービス

> Title の getTitle・setTitle、Meta の addTag・getTag・updateTag・removeTag が属性のセレクタを作る行（parseSelector・escapeSelectorValue・META\_KEYS\_MAP の httpEquiv・on\* を拒む validateMetaDefinition）、getDOM と BrowserDomAdapter（createElement・remove・getBaseHref・getCookie）、BrowserGetTestability。ページの上で、別の Document を渡した本物の Meta と Title を動かすデモ。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/domr-title-meta)

---

Angular のアプリは `<body>` の中の 1 つの要素に描かれるので、`<head>` の `<title>` や `<meta>` はテンプレートから触れません。その代わりにあるのが `Title` と `Meta` の 2 つのサービスです。この章では、2 つが**どの Document に、どのメソッドで書くか**、Meta が `<meta>` を探すときに**セレクタの文字列をどう作り、どう守っているか**を行で追い、最後に、その下にある `getDOM()` と `BrowserDomAdapter`、Protractor のための `BrowserGetTestability` を読みます。

読む対象は `packages/platform-browser/src/browser/` の `title.ts`・`meta.ts`・`browser_adapter.ts`・`testability.ts` と、`packages/common/src/dom_adapter.ts` です。

1. [1. 全体像](01-domr-overview.md)
2. [2. Renderer2 の約束](02-domr-renderer-api.md)
3. [3. DomRendererFactory2](03-domr-renderer-factory.md)
4. [4. 要素とテキスト](04-domr-default-renderer.md)
5. [5. 属性とプロパティ](05-domr-attributes-properties.md)
6. [6. カプセル化](06-domr-encapsulation.md)
7. [7. SharedStylesHost](07-domr-shared-styles.md)
8. [8. CSS 変数の名前空間](08-domr-css-var-namespacing.md)
9. [9. クラスとスタイル](09-domr-styling-overview.md)
10. [10. 優先順位のリスト](10-domr-style-binding-list.md)
11. [11. 値を決めて書く](11-domr-styling-apply.md)
12. [12. \[class\] と \[style\]](12-domr-styling-maps.md)
13. [13. EventManager](13-domr-event-manager.md)
14. [14. listen](14-domr-listen.md)
15. [15. キーのイベント](15-domr-key-events.md)
16. [16. 自分のプラグイン](16-domr-custom-plugin.md)
17. [17. サニタイズ](17-domr-sanitization.md)
18. [18. 信頼の印](18-domr-trusted-types.md)
19. **19. Title と Meta**（この章）
20. [20. issue と PR を読む](20-domr-issues.md)

## 1. Title：document.title を読み書きするだけ

📄 `angular/packages/platform-browser/src/browser/title.ts` L12–38 （▶ の行: 15–17, 22, 24, 29, 37）

```ts
12 │ /**
13 │  * A service that can be used to get and set the title of a current HTML document.
14 │  *
15 ▶  * Since an Angular application can't be bootstrapped on the entire HTML document (`<html>` tag)
16 ▶  * it is not possible to bind to the `text` property of the `HTMLTitleElement` elements
17 ▶  * (representing the `<title>` tag). Instead, this service can be used to set and get the current
18 │  * title value.
19 │  *
20 │  * @publicApi
21 │  */
22 ▶ @Injectable({providedIn: 'root'})
23 │ export class Title {
24 ▶   constructor(@Inject(DOCUMENT) private _doc: any) {}
25 │   /**
26 │    * Get the title of the current HTML document.
27 │    */
28 │   getTitle(): string {
29 ▶     return this._doc.title;
30 │   }
31 │ 
32 │   /**
33 │    * Set the title of the current HTML document.
34 │    * @param newTitle
35 │    */
36 │   setTitle(newTitle: string) {
37 ▶     this._doc.title = newTitle || '';
38 │   }
```

15〜18 行目がこのサービスのある理由です。アプリは `<html>` 全体には描かれないので、`<title>` の `text` にはバインドできません。中身は 2 行だけで、29 行目は `this._doc.title` を返し、37 行目は代入します。`newTitle || ''` なので、`null` や `undefined` を渡すと空の題になります。

24 行目、書く先は `inject(DOCUMENT)` の Document で、グローバルの `document` ではありません。ブラウザでは同じものですが、サーバーで描くときは platform-server が作ったその要求ごとの Document です（[SSR の章](../platform/01-ssr-overview.md)）。22 行目の `providedIn: 'root'` なので、何も provide しなくても inject できます。

## 2. Meta：何を受け取るか

📄 `angular/packages/platform-browser/src/browser/meta.ts` L24–37 （▶ の行: 25, 27, 30–31, 34, 36）

```ts
24 │ export type MetaDefinition = {
25 ▶   charset?: string;
26 │   content?: string;
27 ▶   httpEquiv?: string;
28 │   id?: string;
29 │   itemprop?: string;
30 ▶   name?: string;
31 ▶   property?: string;
32 │   scheme?: string;
33 │   url?: string;
34 ▶ } & {
35 │   // TODO(IgorMinar): this type looks wrong
36 ▶   [prop: string]: string;
37 │ };
```

`MetaDefinition` は `<meta>` の属性の名前と値の組です。34〜37 行目の `[prop: string]: string` で、決まった 9 つ以外の名前も何でも入ります。27 行目の `httpEquiv` だけは JavaScript の名前で、属性の名前（`http-equiv`）と違います（4 節）。

📄 `angular/packages/platform-browser/src/browser/meta.ts` L61–80 （▶ の行: 61, 63–65, 78–79）

```ts
61 ▶ @Service()
62 │ export class Meta {
63 ▶   private readonly _doc = inject(DOCUMENT);
64 ▶   private readonly _dom = getDOM();
65 ▶   private _cachedHead: HTMLHeadElement | undefined;
66 │ 
67 │   /**
68 │    * Retrieves or creates a specific `<meta>` tag element in the current HTML document.
69 │    * In searching for an existing tag, Angular attempts to match the `name` or `property` attribute
70 │    * values in the provided tag definition, and verifies that all other attribute values are equal.
71 │    * If an existing element is found, it is returned and is not modified in any way.
72 │    * @param tag The definition of a `<meta>` element to match or create.
73 │    * @param forceCreation True to create a new element without checking whether one already exists.
74 │    * @returns The existing element with the same attributes and values if found,
75 │    * the new element if no match is found, or `null` if the tag parameter is not defined.
76 │    */
77 │   addTag(tag: MetaDefinition, forceCreation: boolean = false): HTMLMetaElement | null {
78 ▶     if (!tag) return null;
79 ▶     return this._getOrCreateElement(tag, forceCreation);
80 │   }
```

61 行目の `@Service()` は root に自動で provide するデコレーター（core の `di/service.ts`）で、2026-06-23 の c0eaaedef37「cleanup Meta service」で `@Injectable` から変わりました。63 行目で `DOCUMENT`、64 行目で `getDOM()`（6 節）を持ちます。65 行目の `_cachedHead` は、このファイルのどこからも読み書きされていません（`grep -n _cachedHead meta.ts` はこの 1 行だけ。main ではこの行が無くなっていました）。

## 3. 探す：getTag と getTags

📄 `angular/packages/platform-browser/src/browser/meta.ts` L96–118 （▶ の行: 103–105, 115–117）

```ts
 96 │   /**
 97 │    * Retrieves a `<meta>` tag element in the current HTML document.
 98 │    * @param attrSelector The tag attribute and value to match against, in the format
 99 │    * `"tag_attribute='value string'"`.
100 │    * @returns The matching element, if any.
101 │    */
102 │   getTag(attrSelector: string): HTMLMetaElement | null {
103 ▶     if (!attrSelector) return null;
104 ▶     const meta = this._doc.querySelector<HTMLMetaElement>(buildMetaSelector(attrSelector));
105 ▶     return isMetaTag(meta) ? meta : null;
106 │   }
107 │ 
108 │   /**
109 │    * Retrieves a set of `<meta>` tag elements in the current HTML document.
110 │    * @param attrSelector The tag attribute and value to match against, in the format
111 │    * `"tag_attribute='value string'"`.
112 │    * @returns The matching elements, if any.
113 │    */
114 │   getTags(attrSelector: string): HTMLMetaElement[] {
115 ▶     if (!attrSelector) return [];
116 ▶     const list = this._doc.querySelectorAll<HTMLMetaElement>(buildMetaSelector(attrSelector));
117 ▶     return list ? Array.from(list).filter((elem) => isMetaTag(elem)) : [];
118 │   }
```

📄 `angular/packages/platform-browser/src/browser/meta.ts` L180–210 （▶ の行: 181, 185, 189–191, 202–203, 209）

```ts
180 │ function buildMetaSelector(attrSelector: string): string {
181 ▶   return `meta[${attrSelector}]`;
182 │ }
183 │ 
184 │ function setMetaElementAttributes(tag: MetaDefinition, el: HTMLMetaElement) {
185 ▶   Object.keys(tag).forEach((prop: string) => el.setAttribute(getMetaKeyMap(prop), tag[prop]));
186 │ }
187 │ 
188 │ function validateMetaDefinition(tag: MetaDefinition): void {
189 ▶   for (const prop of Object.keys(tag)) {
190 ▶     const attributeName = getMetaKeyMap(prop);
191 ▶     if (attributeName.toLowerCase().startsWith('on')) {
192 │       throw new RuntimeError(
193 │         RuntimeErrorCode.INVALID_EVENT_ATTRIBUTE,
194 │         (typeof ngDevMode === 'undefined' || ngDevMode) &&
195 │           `The Meta service does not allow setting event handler attribute '${attributeName}' for security reasons.`,
196 │       );
197 │     }
198 │   }
199 │ }
200 │ 
201 │ function parseSelector(tag: MetaDefinition): string {
202 ▶   const attr: string = tag.name ? 'name' : 'property';
203 ▶   return `${attr}=${escapeSelectorValue(String(tag[attr]))}`;
204 │ }
205 │ 
206 │ function escapeSelectorValue(value: string): string {
207 │   // Escape backslashes and double quotes to prevent CSS selector injection.
208 │   // This securely confines the value inside an attribute selector.
209 ▶   return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
210 │ }
```

📄 `angular/packages/platform-browser/src/browser/meta.ts` L212–227 （▶ の行: 213, 217, 221, 227）

```ts
212 │ function containsAttributes(tag: MetaDefinition, elem: HTMLMetaElement): boolean {
213 ▶   return Object.keys(tag).every((key) => elem.getAttribute(getMetaKeyMap(key)) === tag[key]);
214 │ }
215 │ 
216 │ function getMetaKeyMap(prop: string): string {
217 ▶   return Object.hasOwn(META_KEYS_MAP, prop) ? META_KEYS_MAP[prop] : prop;
218 │ }
219 │ 
220 │ function isMetaTag(tag: HTMLElement | null): tag is HTMLMetaElement {
221 ▶   return tag?.nodeName.toLowerCase() === 'meta';
222 │ }
223 │ 
224 │ /**
225 │  * Mapping for MetaDefinition properties with their correct meta attribute names
226 │  */
227 ▶ const META_KEYS_MAP: {[prop: string]: string} = {httpEquiv: 'http-equiv'};
```

1. **104 行目と 181 行目：利用者の文字列を \[\] で包むだけ**

   `getTag('name="description"')` は `querySelector('meta[name="description"]')` です。`attrSelector` は**エスケープしません**。利用者が書いたセレクタを、そのまま CSS のセレクタとして使います。
2. **105 行目と 221 行目：meta でなければ null**

   `'name="x"], body, meta[name="y"'` のような文字列を渡すと、組み立てたセレクタは `meta[name="x"], body, meta[name="y"]` になり、`<body>` にも当たります。それでも 105 行目で `nodeName` が `meta` でなければ捨てるので、Meta のメソッドが `<body>` を返したり書き換えたりはしません。
3. **116〜117 行目：getTags も同じ**

   `querySelectorAll` の結果を配列にして、meta だけを残します。

## 4. 作る・書き換える

📄 `angular/packages/platform-browser/src/browser/meta.ts` L159–177 （▶ の行: 163–165, 169–170, 172–175）

```ts
159 │   private _getOrCreateElement(
160 │     meta: MetaDefinition,
161 │     forceCreation: boolean = false,
162 │   ): HTMLMetaElement {
163 ▶     validateMetaDefinition(meta);
164 ▶     if (!forceCreation) {
165 ▶       const selector: string = parseSelector(meta);
166 │       // It's allowed to have multiple elements with the same name so it's not enough to
167 │       // just check that element with the same name already present on the page. We also need to
168 │       // check if element has tag attributes
169 ▶       const elem = this.getTags(selector).filter((elem) => containsAttributes(meta, elem))[0];
170 ▶       if (elem !== undefined) return elem;
171 │     }
172 ▶     const element: HTMLMetaElement = this._dom.createElement('meta') as HTMLMetaElement;
173 ▶     setMetaElementAttributes(meta, element);
174 ▶     const head = this._doc.getElementsByTagName('head')[0];
175 ▶     head.appendChild(element);
176 │     return element;
177 │   }
```

1. **163 行目：on で始まる属性を拒む**

   188〜199 行目の `validateMetaDefinition` は、属性の名前（190 行目で `httpEquiv` を直したあと）を小文字にして `on` で始まれば NG05203 を投げます。2026-08-17 の 6f9a6bea509（issue #70126、PR #70127）で足されました。`<meta>` は `<body>` の中にも置けて、`oncontentvisibilityautostatechange` のようなイベントの属性はそこで実行されうるからです（spec の 93 行目の it）。
2. **164〜171 行目：同じものがあれば、それを返す**

   165 行目、探すためのセレクタは 201〜204 行目の `parseSelector` が作ります。202 行目、`name` があれば `name`、無ければ `property` の値で、209 行目で `\` と `"` をエスケープして `"…"` で囲みます（2026-05-27 の d5a489aed3c「sanitize meta selectors」）。169 行目で、見つかった中から**属性が全部同じ**もの（213 行目の `containsAttributes`）を選びます。同じ name で content が違えば、別の要素を作ります。
3. **172 行目：要素を作るのは getDOM()**

   `this._dom.createElement('meta')` は 2 つ目の引数（Document）を渡していないので、`BrowserDomAdapter` は**グローバルの `document`** で作ります（6 節の 41 行目）。174〜175 行目で `this._doc` の `<head>` に `appendChild` すると、DOM の決まりで要素はその Document に移ります（adopt）。デモで別の Document に書けるのはこのためです。
4. **173 行目と 185 行目：属性を 1 つずつ setAttribute**

   216〜217 行目の `getMetaKeyMap` が、227 行目の表で `httpEquiv` を `http-equiv` に直します。`Object.hasOwn` なので、`constructor` のような `Object` の prototype にある名前も表の外として扱われます（`git log -S"Object.hasOwn" -- meta.ts` では 6f9a6bea509 で入りました。spec の it `should add attributes whose names match Object prototype keys`）。

📄 `angular/packages/platform-browser/src/browser/meta.ts` L129–157 （▶ の行: 130–134, 137, 146, 154–155）

```ts
129 │   updateTag(tag: MetaDefinition, selector?: string): HTMLMetaElement | null {
130 ▶     validateMetaDefinition(tag);
131 ▶     selector ??= parseSelector(tag);
132 ▶     const meta = this.getTag(selector);
133 ▶     if (meta) {
134 ▶       setMetaElementAttributes(tag, meta);
135 │       return meta;
136 │     }
137 ▶     return this._getOrCreateElement(tag, true);
138 │   }
139 │ 
140 │   /**
141 │    * Removes an existing `<meta>` tag element from the current HTML document.
142 │    * @param attrSelector A tag attribute and value to match against, to identify
143 │    * an existing tag. A string in the format `"tag_attribute=`value string`"`.
144 │    */
145 │   removeTag(attrSelector: string): void {
146 ▶     this.removeTagElement(this.getTag(attrSelector)!);
147 │   }
148 │ 
149 │   /**
150 │    * Removes an existing `<meta>` tag element from the current HTML document.
151 │    * @param meta The tag definition to match against to identify an existing tag.
152 │    */
153 │   removeTagElement(meta: HTMLMetaElement): void {
154 ▶     if (meta) {
155 ▶       this._dom.remove(meta);
156 │     }
157 │   }
```

`updateTag` は、131 行目で selector が渡されなければ `parseSelector` で作り、132 行目で探して、あれば 134 行目で属性を上書きします。無ければ 137 行目で `forceCreation = true` で作ります。渡した `selector` は 3 節と同じくエスケープされません。`removeTag` は 146 行目で `getTag` して、155 行目で `getDOM().remove()`（6 節の 38 行目の `node.remove()`）です。

> [!WARNING]
> **ハマりどころ**
>
> 202 行目は「`name` が無ければ `property`」です。`{charset: 'utf-8'}` のように**どちらも無い**タグだと、203 行目の `String(tag[attr])` が `"undefined"` になり、探すセレクタは `property="undefined"` です。何も当たらないので、`addTag` を 2 回呼ぶと `<meta charset>` が 2 つできます。デモの「charset」で確かめられます。

> **🧪 DEMO — 別の Document に本物の Meta と Title で書く**
>
> 最初にボタンを押したとき、`document.implementation.createHTMLDocument('最初の題')` で別の Document を作り、`createEnvironmentInjector([{ provide: DOCUMENT, useValue: その Document }, Meta, Title], …)` の小さなインジェクタから、@angular/platform-browser 22.1.6 の本物の `Meta` と `Title` を取ります（spec の `beforeEach` と同じ作り方）。下に出るのはその Document の `<head>` の outerHTML です。**このページの本物の &lt;head&gt; は変えません**（一番下に、このページの meta の数と題を出しています）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/domr-title-meta)

- 「name=description」で addTag を 2 回押すと、2 回目は同じ要素が返ります（169〜170 行目）。「同じ name で content 違い」の addTag は 2 つ目を作り、updateTag は 1 つ目を書き換えます。
- 「httpEquiv」は `http-equiv="refresh"` の属性になります（227 行目）。selector も属性の名前で書きます。
- 「"onclick" を含む」は addTag も updateTag も NG05203 で、要素は増えません（163・130 行目が先に走る）。本番のビルドなので文は付かず番号だけです。
- 「引用符で抜け出す name」は、addTag を 2 回押しても 1 つしかできず、`<body>` には何も起きません（209 行目）。

## 5. ここまでの呼び出し

- 👤 `meta.addTag({ name: 'description', content: '…' })` — あなたのコード
  - `_getOrCreateElement(tag, false)` — platform-browser/src/browser/meta.ts L159
    - `validateMetaDefinition(tag)` — meta.ts L188 — *on\* なら NG05203*
    - `parseSelector(tag)` → `'name="description"'` — meta.ts L201 — *escapeSelectorValue で " と \\ をエスケープ*
    - `getTags(selector)` → `querySelectorAll('meta[name="description"]')` — meta.ts L114 — *containsAttributes で全部の属性が同じものを探す*
    - `getDOM().createElement('meta')` — browser\_adapter.ts L40 — *グローバルの document で作る*
    - `setMetaElementAttributes(tag, el)` — meta.ts L184 — *httpEquiv → http-equiv*
    - `this._doc.getElementsByTagName('head')[0].appendChild(el)` — meta.ts L174

## 6. getDOM と BrowserDomAdapter

📄 `angular/packages/common/src/dom_adapter.ts` L9–17 （▶ の行: 9, 11–12, 15–16）

```ts
 9 ▶ let _DOM: DomAdapter = null!;
10 │ 
11 ▶ export function getDOM(): DomAdapter {
12 ▶   return _DOM;
13 │ }
14 │ 
15 ▶ export function setRootDomAdapter(adapter: DomAdapter) {
16 ▶   _DOM ??= adapter;
17 │ }
```

9 行目、`_DOM` はモジュールの変数 1 つです。16 行目の `??=` なので、**最初に設定したアダプタが勝ち**、2 回目以降は無視されます。ブラウザでは `platformBrowser()` の `PLATFORM_INITIALIZER` の `initDomAdapter` が `BrowserDomAdapter.makeCurrent()` を呼びます（[ブートのインジェクタの章](../boot/08-boot-injectors.md)で引用）。

📄 `angular/packages/common/src/dom_adapter.ts` L25–57 （▶ の行: 30–32, 36, 39, 42, 45, 48, 52, 55）

```ts
25 │ export abstract class DomAdapter {
26 │   // Needs Domino-friendly test utility
27 │   abstract dispatchEvent(el: any, evt: any): any;
28 │   abstract readonly supportsDOMEvents: boolean;
29 │ 
30 ▶   // Used by Meta
31 ▶   abstract remove(el: any): void;
32 ▶   abstract createElement(tagName: any, doc?: any): HTMLElement;
33 │   abstract createHtmlDocument(): Document;
34 │   abstract getDefaultDocument(): Document;
35 │ 
36 ▶   // Used by By.css
37 │   abstract isElementNode(node: any): boolean;
38 │ 
39 ▶   // Used by Testability
40 │   abstract isShadowRoot(node: any): boolean;
41 │ 
42 ▶   // Used by KeyEventsPlugin
43 │   abstract onAndCancel(el: any, evt: any, listener: any, options?: any): Function;
44 │ 
45 ▶   // Used by PlatformLocation and ServerEventManagerPlugin
46 │   abstract getGlobalEventTarget(doc: Document, target: string): any;
47 │ 
48 ▶   // Used by PlatformLocation
49 │   abstract getBaseHref(doc: Document): string | null;
50 │   abstract resetBaseElement(): void;
51 │ 
52 ▶   // TODO: remove dependency in DefaultValueAccessor
53 │   abstract getUserAgent(): string;
54 │ 
55 ▶   // Used in the legacy @angular/http package which has some usage in g3.
56 │   abstract getCookie(name: string): string | null;
57 │ }
```

抽象クラスのメソッドには、それぞれ「誰が使うか」のコメントが付いています。30 行目の Meta、36 行目の `By.css`（[DebugElement の章](../testing/08-testing-debug-element.md)）、39 行目の Testability、42 行目の KeyEventsPlugin（[第 15 回](15-domr-key-events.md)）、45・48 行目の PlatformLocation。**DomAdapter は、Renderer2 を通さずに DOM を触る小さな仕事の寄せ集め**で、レンダリングの本筋（第 2〜4 回の renderer）には出てきません。

📄 `angular/packages/platform-browser/src/browser/browser_adapter.ts` L28–58 （▶ の行: 28–31, 38, 40–42, 45, 48, 56）

```ts
28 ▶   override onAndCancel(el: Node, evt: any, listener: any, options: any): Function {
29 ▶     el.addEventListener(evt, listener, options);
30 ▶     return () => {
31 ▶       el.removeEventListener(evt, listener, options);
32 │     };
33 │   }
34 │   override dispatchEvent(el: Node, evt: any) {
35 │     el.dispatchEvent(evt);
36 │   }
37 │   override remove(node: Node): void {
38 ▶     (node as Element | Text | Comment).remove();
39 │   }
40 ▶   override createElement(tagName: string, doc?: Document): HTMLElement {
41 ▶     doc = doc || this.getDefaultDocument();
42 ▶     return doc.createElement(tagName);
43 │   }
44 │   override createHtmlDocument(): Document {
45 ▶     return document.implementation.createHTMLDocument('fakeTitle');
46 │   }
47 │   override getDefaultDocument(): Document {
48 ▶     return document;
49 │   }
50 │ 
51 │   override isElementNode(node: Node): boolean {
52 │     return node.nodeType === Node.ELEMENT_NODE;
53 │   }
54 │ 
55 │   override isShadowRoot(node: any): boolean {
56 ▶     return node instanceof DocumentFragment;
57 │   }
58 │ 
```

28〜33 行目の `onAndCancel` は `addEventListener` して、外す関数を返します。38 行目の `remove` は `node.remove()`。41 行目、`createElement` は Document を渡されなければ 48 行目の `getDefaultDocument()`（グローバルの `document`）を使います。4 節の 172 行目で Meta が渡していないのはこの引数です。45 行目の `createHtmlDocument` は spec で使われ、Title と Meta の spec の `beforeEach` はこれで別の Document を作ります。この後ろの `getGlobalEventTarget` は [第 14 回](14-domr-listen.md)の話です。

📄 `angular/packages/platform-browser/src/browser/browser_adapter.ts` L72–97 （▶ の行: 72–74, 77, 83, 89–90, 96）

```ts
72 ▶   override getBaseHref(doc: Document): string | null {
73 ▶     const href = getBaseElementHref();
74 ▶     return href == null ? null : relativePath(href);
75 │   }
76 │   override resetBaseElement(): void {
77 ▶     baseElement = null;
78 │   }
79 │   override getUserAgent(): string {
80 │     return window.navigator.userAgent;
81 │   }
82 │   override getCookie(name: string): string | null {
83 ▶     return parseCookieValue(document.cookie, name);
84 │   }
85 │ }
86 │ 
87 │ let baseElement: HTMLElement | null = null;
88 │ function getBaseElementHref(): string | null {
89 ▶   baseElement = baseElement || document.head.querySelector('base');
90 ▶   return baseElement ? baseElement.getAttribute('href') : null;
91 │ }
92 │ 
93 │ function relativePath(url: string): string {
94 │   // The base URL doesn't really matter, we just need it so relative paths have something
95 │   // to resolve against. In the browser `HTMLBaseElement.href` is always absolute.
96 ▶   return new URL(url, document.baseURI).pathname;
97 │ }
```

72〜75 行目の `getBaseHref` は、`<base href>` を読んで、96 行目で `new URL(url, document.baseURI).pathname` のパスだけにします。引数の `doc` は使わず、89 行目でグローバルの `document.head` を探し、87 行目のモジュールの変数に覚えます。`resetBaseElement`（77 行目）がその覚えを消します。83 行目の `getCookie` も `document.cookie` を直接読みます。

## 7. BrowserGetTestability：Protractor 時代の窓口

**Testability** は、E2E テストの道具（以前の Protractor）が「Angular の処理が落ち着いたか」をページの外から聞くための仕組みです。`bootstrapApplication` では、`providers` に `provideProtractorTestingSupport()` を足したときだけ入ります（`BrowserModule` の経路では既定で入る。[BrowserModule の章](../ngmodule/12-ngmodule-browser-module.md)で `TESTABILITY_PROVIDERS` を引用）。

📄 `angular/packages/core/src/application/application_ref.ts` L501–507 （▶ の行: 502–503）

```ts
501 │       const nativeElement = compRef.location.nativeElement;
502 ▶       const testability = compRef.injector.get(TESTABILITY, null);
503 ▶       testability?.registerApplication(nativeElement);
504 │ 
505 │       compRef.onDestroy(() => {
506 │         this.detachView(compRef.hostView);
507 │         remove(this.components, compRef);
```

📄 `angular/packages/core/src/testability/testability.ts` L115–120 （▶ の行: 117–119）

```ts
115 │     // If there was no Testability logic registered in the global scope
116 │     // before, register the current testability getter as a global one.
117 ▶     if (!_testabilityGetter) {
118 ▶       setTestabilityGetter(testabilityGetter);
119 ▶       testabilityGetter.addToWindow(registry);
120 │     }
```

502〜503 行目、`ApplicationRef.bootstrap` がルートの要素を登録し、Testability を初めて作ったときに 117〜119 行目で、その getter（ブラウザでは `BrowserGetTestability`）の `addToWindow` を**1 回だけ**呼びます。

📄 `angular/packages/platform-browser/src/browser/testability.ts` L20–56 （▶ の行: 22–24, 34, 36, 38, 40, 43–44, 48, 52, 55）

```ts
20 │ export class BrowserGetTestability implements GetTestability {
21 │   addToWindow(registry: TestabilityRegistry): void {
22 ▶     global['getAngularTestability'] = (elem: any, findInAncestors: boolean = true) => {
23 ▶       const testability = registry.findTestabilityInTree(elem, findInAncestors);
24 ▶       if (testability == null) {
25 │         throw new RuntimeError(
26 │           RuntimeErrorCode.TESTABILITY_NOT_FOUND,
27 │           (typeof ngDevMode === 'undefined' || ngDevMode) &&
28 │             'Could not find testability for element.',
29 │         );
30 │       }
31 │       return testability;
32 │     };
33 │ 
34 ▶     global['getAllAngularTestabilities'] = () => registry.getAllTestabilities();
35 │ 
36 ▶     global['getAllAngularRootElements'] = () => registry.getAllRootElements();
37 │ 
38 ▶     const whenAllStable = (callback: () => void) => {
39 │       const testabilities = global['getAllAngularTestabilities']() as Testability[];
40 ▶       let count = testabilities.length;
41 │       const decrement = function () {
42 │         count--;
43 ▶         if (count == 0) {
44 ▶           callback();
45 │         }
46 │       };
47 │       testabilities.forEach((testability) => {
48 ▶         testability.whenStable(decrement);
49 │       });
50 │     };
51 │ 
52 ▶     if (!global['frameworkStabilizers']) {
53 │       global['frameworkStabilizers'] = [];
54 │     }
55 ▶     global['frameworkStabilizers'].push(whenAllStable);
56 │   }
```

1. **22〜32 行目：window.getAngularTestability(要素)**

   要素から登録を探し、無ければ NG05103 を投げます。
2. **34・36 行目：全部を返す 2 つの関数**
3. **38〜55 行目：frameworkStabilizers に whenAllStable を足す**

   Protractor はこの配列の関数を呼んで待ちます。`whenAllStable` は Testability の数を数え、全部の `whenStable` が返ったら（43 行目で 0 になったら）callback を呼びます。数え始める 40 行目で Testability が 0 個だと、`forEach` が 1 回も回らないので callback は呼ばれません。

📄 `angular/packages/platform-browser/src/browser/testability.ts` L58–76 （▶ の行: 66, 69, 72–73, 75）

```ts
58 │   findTestabilityInTree(
59 │     registry: TestabilityRegistry,
60 │     elem: any,
61 │     findInAncestors: boolean,
62 │   ): Testability | null {
63 │     if (elem == null) {
64 │       return null;
65 │     }
66 ▶     const t = registry.getTestability(elem);
67 │     if (t != null) {
68 │       return t;
69 ▶     } else if (!findInAncestors) {
70 │       return null;
71 │     }
72 ▶     if (getDOM().isShadowRoot(elem)) {
73 ▶       return this.findTestabilityInTree(registry, (<any>elem).host, true);
74 │     }
75 ▶     return this.findTestabilityInTree(registry, elem.parentElement, true);
76 │   }
```

要素から上へ親をたどって、登録された要素を探します。72〜73 行目、Shadow DOM の根（6 節の 56 行目の `DocumentFragment`）に来たら `host` へ渡ります。これで ShadowDom のカプセル化のコンポーネントの中の要素からも、アプリを見つけられます。

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| platform-browser/test/browser/meta\_spec.ts | describe `Meta service`（15）の it 22 個と、中の describe `integration test`（330）の 1 個 | `//packages/platform-browser/test:test` |
| platform-browser/test/browser/title\_spec.ts | describe `title service`（15）の it 3 個と `integration test`（45）の 1 個 | 同上 |
| platform-browser/test/browser/bootstrap\_spec.ts | it `should register each application with the testability registry`（783）。describe の先頭が `if (isNode)` で、Node では `should pass` だけになる | `//packages/platform-browser/test:test_web`（ブラウザ） |

📄 `angular/packages/platform-browser/test/browser/title_spec.ts` L15–44 （▶ の行: 21, 23, 35–36, 41–42）

```ts
15 │ describe('title service', () => {
16 │   let doc: Document;
17 │   let initialTitle: string;
18 │   let titleService: Title;
19 │ 
20 │   beforeEach(() => {
21 ▶     doc = getDOM().createHtmlDocument();
22 │     initialTitle = doc.title;
23 ▶     titleService = new Title(doc);
24 │   });
25 │ 
26 │   afterEach(() => {
27 │     doc.title = initialTitle;
28 │   });
29 │ 
30 │   it('should allow reading initial title', () => {
31 │     expect(titleService.getTitle()).toEqual(initialTitle);
32 │   });
33 │ 
34 │   it('should set a title on the injected document', () => {
35 ▶     titleService.setTitle('test title');
36 ▶     expect(doc.title).toEqual('test title');
37 │     expect(titleService.getTitle()).toEqual('test title');
38 │   });
39 │ 
40 │   it('should reset title to empty string if title not provided', () => {
41 ▶     titleService.setTitle(null!);
42 ▶     expect(doc.title).toEqual('');
43 │   });
44 │ 
```

21 行目で `getDOM().createHtmlDocument()` の別の Document を作り、23 行目で Title に直接渡します。41〜42 行目が 1 節の 37 行目の `|| ''` です。

📄 `angular/packages/platform-browser/test/browser/meta_spec.ts` L93–130 （▶ の行: 94, 100, 103, 106, 109, 117, 119, 124, 126）

```ts
 93 │   it('should reject event handler attributes targeting a body meta tag', () => {
 94 ▶     doc.body.appendChild(defaultMeta);
 95 │ 
 96 │     const evil = 'alert(1)';
 97 │ 
 98 │     expect(metaService.getTag('property="fb:app_id"')).toBe(defaultMeta);
 99 │     expect(() =>
100 ▶       metaService.updateTag({
101 │         property: 'fb:app_id',
102 │         style: 'content-visibility:auto',
103 ▶         oncontentvisibilityautostatechange: evil,
104 │       }),
105 │     ).toThrowError(
106 ▶       /NG05203: The Meta service does not allow setting event handler attribute 'oncontentvisibilityautostatechange'/,
107 │     );
108 │ 
109 ▶     expect(defaultMeta.getAttribute('style')).toBeNull();
110 │     expect(defaultMeta.getAttribute('oncontentvisibilityautostatechange')).toBeNull();
111 │   });
112 │ 
113 │   it('should not allow a custom selector to match off target elements like the body tag', () => {
114 │     // This payload attempts to break out of the `meta[name="..."]` constraint entirely
115 │     // and inject a comma to target arbitrary DOM elements like the `body` tag via the
116 │     // `selector` argument of `updateTag`.
117 ▶     const attackerSelector = 'name="description"], body, meta[name="pwned"';
118 │ 
119 ▶     const firstMeta = metaService.updateTag({content: 'pwned'}, attackerSelector)!;
120 │ 
121 │     expect(firstMeta).not.toBeNull();
122 │     // It creates a new meta element instead of targeting `body` because it did not
123 │     // find a meta element matching the dirty selector since `body` is not a `meta` tag
124 ▶     expect(firstMeta!.nodeName.toLowerCase()).toEqual('meta');
125 │     expect(firstMeta!.getAttribute('content')).toEqual('pwned');
126 ▶     expect(doc.body.getAttribute('content')).toBeNull();
127 │ 
128 │     metaService.removeTagElement(firstMeta);
129 │   });
130 │ 
```

94 行目で `<meta>` を `<body>` に置き、103 行目のイベントの属性が拒まれ、109〜110 行目で 102 行目の `style` も書かれていない（`validateMetaDefinition` が `setMetaElementAttributes` より先）ことを確かめます。117 行目は 3 節の「エスケープしない selector」の形で、124・126 行目が 105 行目の `isMetaTag` の守りです。

📄 `angular/packages/platform-browser/test/browser/meta_spec.ts` L231–266 （▶ の行: 234, 238, 241, 250, 255, 261）

```ts
231 │   it('should escape selector values when deriving the match selector', () => {
232 │     // This payload attempts to prematurely close the attribute selector
233 │     // and match another attribute.
234 ▶     const property = 'fb:app_id"][content="123456789';
235 │ 
236 │     const meta = metaService.updateTag({property, content: 'pwned'})!;
237 │ 
238 ▶     expect(meta).not.toBe(defaultMeta);
239 │     expect(meta.getAttribute('property')).toEqual(property);
240 │     expect(meta.getAttribute('content')).toEqual('pwned');
241 ▶     expect(metaService.getTags('property="fb:app_id"').length).toEqual(1);
242 │ 
243 │     // clean up
244 │     metaService.removeTagElement(meta);
245 │   });
246 │ 
247 │   it('should not let a quoted name break out of the meta selector and target body', () => {
248 │     // This payload attempts to break out of the `meta[name="..."]` constraint entirely
249 │     // and inject a comma to target arbitrary DOM elements like the `body` tag.
250 ▶     const attackerName = 'description"], body';
251 │ 
252 │     const firstMeta = metaService.addTag({name: attackerName, content: 'safe'})!;
253 │     const secondMeta = metaService.addTag({name: attackerName, content: 'safe'})!;
254 │ 
255 ▶     expect(firstMeta).toBe(secondMeta);
256 │     expect(firstMeta.tagName).toEqual('META');
257 │     expect(
258 │       Array.from(doc.getElementsByTagName('meta')).filter(
259 │         (meta) => meta.getAttribute('name') === attackerName,
260 │       ).length,
261 ▶     ).toEqual(1);
262 │     expect(doc.body).not.toBeNull();
263 │ 
264 │     // clean up
265 │     metaService.removeTagElement(firstMeta);
266 │   });
```

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/platform-browser/test:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=^Meta service '
pnpm bazel test //packages/platform-browser/test:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=^title service '
```

📄 `出力（2026-11-04 に実行。ログは scratchpad/domr-logs/e-pb-meta.log・e-pb-title.log）`

```
^Meta service   Ran 23 of 159 specs / 23 specs, 0 failures   PASSED in 0.8s（real 1.52 秒）
^title service  Ran 4 of 159 specs / 4 specs, 0 failures     PASSED in 0.8s（real 1.49 秒）
```

- `BrowserGetTestability` の `addToWindow`・`findTestabilityInTree` を直接確かめる spec は見つかりませんでした（`grep -rn "addToWindow\|getAllAngularTestabilities" packages | grep _spec.ts` は core の testability\_spec.ts の偽物の getter だけ）。bootstrap\_spec.ts の it `should register each application with the testability registry` が `TestabilityRegistry.findTestabilityInTree` を通して間接的に使いますが、これは `:test_web` でしか走りません。Node の `:test` で `--test_arg=--filter=testability registry` を付けると `Ran 0 of 159 specs` で PASSED になりました（0 件でも PASSED になる例）。ブラウザのほうは `pnpm bazel test //packages/platform-browser/test:test_web --nocache_test_results` で、`test_web_chromium`（PASSED in 2.8s）と `test_web_firefox`（PASSED in 7.0s）の 2 つが走り、両方 PASSED でした（絞らずに全部、コマンド全体 real 8.80 秒。ログは scratchpad/domr-logs/e-pb-test-web.log）。

### 直すとしたら

- Meta の振る舞いは meta.ts の中で閉じています。セレクタは `parseSelector`・`escapeSelectorValue`、属性の名前は `getMetaKeyMap`・`validateMetaDefinition`。spec は meta\_spec.ts の `Meta service` に `it` を足し、`doc` の `<head>` を見て確かめます。
- 4 節の warn の「name も property も無いタグ」は、meta\_spec.ts に it が無く（`grep -n charset meta_spec.ts` は 0 行）、今の振る舞いを確かめるなら、ここに `addTag({charset: 'utf-8'})` を 2 回呼ぶ it を手元で足すのが入口です。
- 2026 年の meta.ts の変更は d5a489aed3c（セレクタのエスケープ）・c0eaaedef37（cleanup）・6f9a6bea509（on\* を拒む・`Object.hasOwn`）の 3 つで（`git log -- meta.ts`）、cleanup 以外はセキュリティの報告から来たものです。本家に PR を出すことは勧めません。issue（#70126 など）を読むときに、どの行の話かを当てる手がかりにします（[第 20 回](20-domr-issues.md)）。

## 聞かれそうな質問

**Q. &lt;title&gt;{{ ... }}&lt;/title&gt; と書けないのはなぜ？**

アプリはルートの要素（例えば `<app-root>`）の中にしか描かれず、`<head>` はテンプレートの外だからです（title.ts 15〜18 行目）。`Title.setTitle` は `this._doc.title = newTitle || ''`（37 行目）を代入するだけです。

**Q. SSR で Meta を使うと、サーバーの HTML に入りますか？**

入ります。Meta も Title も `inject(DOCUMENT)`（meta.ts 63 行目・title.ts 24 行目）に書き、サーバーではその要求の Document が `DOCUMENT` なので、それを文字列にした HTML に含まれます。要素を作るのは `getDOM()`（サーバーでは `BrowserDomAdapter` を継いだ platform-server の `DominoAdapter`）ですが、174〜175 行目で `this._doc` の head に `appendChild` します。

**Q. 同じ name の meta が 2 つできてしまいました。**

`addTag` は 169 行目で「属性が全部同じ」ものしか再利用しません。content を変えたいなら `updateTag`（132〜135 行目で見つけた要素を上書き）を使います。name も property も無いタグは 202〜203 行目の都合で毎回新しく作られます。

**Q. updateTag の selector にユーザーの入力を入れても大丈夫？**

selector はエスケープされず（181 行目で \[\] に入れるだけ）、CSS のセレクタとして解釈されます。ただし 105 行目で meta 以外は捨てるので、Meta のメソッドが meta 以外の要素を書き換えることはありません。当たらなければ 137 行目で新しい meta を作ります（spec の 113 行目の it）。

**Q. getDOM() は何を返すのですか？どこで決まりますか？**

モジュールの変数 `_DOM`（dom\_adapter.ts 9 行目）で、ブラウザでは `BrowserDomAdapter` です。`setRootDomAdapter` は `??=`（16 行目）なので、最初に設定したものが残ります。

## 読み終えて

- Title は `DOCUMENT` の `title` を読み書きするだけ。Meta も書く先は `DOCUMENT` で、要素だけ getDOM() がグローバルの document で作る。
- Meta は自分で作るセレクタは `"` と `\` をエスケープし、利用者のセレクタはエスケープせず、meta 以外を捨てることで守る。on\* の属性は拒む。
- DomAdapter は Renderer2 を通さない小さな DOM の仕事の寄せ集めで、最初に設定したものが残る。
- BrowserGetTestability は window に 3 つの関数と frameworkStabilizers を足すだけ。bootstrapApplication では provideProtractorTestingSupport() を足したときだけ動く。

---

← 前: [bypassSecurityTrust と Trusted Types：信頼の印](18-domr-trusted-types.md)  
次: [issue と PR を読む：レンダラー・スタイル・イベント・セキュリティの今](20-domr-issues.md) →
