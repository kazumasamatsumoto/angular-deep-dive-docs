[目次](../README.md) › [core の説明文の読み残し（3）](README.md) › 第 6 回 / 全 8 回

# Renderer2 の各メソッドと、i18n の token・animation の検査の説明文

> render/api.ts・api\_flags.ts、i18n/tokens.ts・locale\_data\_api.ts、animation/utils.ts の未読の行：Renderer2 の各メソッドの約束（namespace・flags・listen の戻り値）、RendererStyleFlags2 の Important が camelCase で効かないこと、DEFAULT\_CURRENCY\_CODE・TRANSLATIONS の例のコード、animate.enter の検査。章の中で inject した本物の Renderer2 で確かめる。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crh-renderer)

---

この章で分かること：`Renderer2` の各メソッドの説明文（引数の `namespace`・`flags`、`listen` の戻り値ほか）が約束していることを、この章のコンポーネントで `inject(Renderer2)` した本物の renderer で 1 つずつ呼んで確かめます。あわせて、`DEFAULT_CURRENCY_CODE` と `TRANSLATIONS` の説明文の例、ロケールのデータの小さな関数、`animate.enter` / `animate.leave` の検査の関数を読みます。合わなかったのは、`setStyle` の `Important` を camelCase の名前に付けると何も書かれないこと（`[style]` の map でも起きる）、`setAttribute` が `createElement` と違って名前空間の URI を受け付けないこと、説明文の例の `bootstrapModule(AppModule, {providers})` がアプリの注入器に届かないこと、`<ng-container animate.enter>` の失敗がアプリのほかの enter animation を止めることです。

読む対象は `packages/core/src/` の `render/api.ts`・`render/api_flags.ts`・`i18n/tokens.ts`・`i18n/locale_data_api.ts`・`animation/utils.ts`（../angular、8576f161ae4）のうち、まだどの章も引いていない行です。`Renderer2` の型の全体と `RendererFactory2` は[Renderer2 と RendererFactory2 の章](../domr/02-domr-renderer-api.md)、ブラウザーの実装 `DefaultDomRenderer2` は[DefaultDomRenderer2 の章](../domr/04-domr-default-renderer.md)・[属性とプロパティの章](../domr/05-domr-attributes-properties.md)・[スタイルを書く章](../domr/11-domr-styling-apply.md)・[listen の章](../domr/14-domr-listen.md)、`LOCALE_ID` の決まり方は[ロケールのデータの章](../loc/12-loc-locale-data.md)、`animate.enter` の仕組みは[enter のクラスの章](../animations/05-animations-enter-classes.md)にあります。

1. [1. ハイドレーションの公開 API と型](01-crh-hydration-api.md)
2. [2. ngh の書き出し](02-crh-hydration-annotate.md)
3. [3. ノードの探し方と不一致](03-crh-hydration-errors.md)
4. [4. @defer](04-crh-defer.md)
5. [5. resource()](05-crh-resource.md)
6. **6. Renderer2**（この章）
7. [7. 開発用の小道具](07-crh-dev-utils.md)
8. [8. spec と issue](08-crh-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> `Renderer2` は「DOM を書く役」の約束（抽象クラス）です。ブラウザーでは platform-browser の `DefaultDomRenderer2`（とその子クラス）が実体で、説明文の約束はその実装で果たされます。この章の DEMO の renderer は、この章のコンポーネントが `inject(Renderer2)` で受け取った物です。この章のコンポーネントは CSS を持つ（`ViewEncapsulation.Emulated`）ので、実体は `EmulatedEncapsulationDomRenderer2` です。

## 1. RendererType2 と Renderer2 の頭の説明

📄 `angular/packages/core/src/render/api_flags.ts` L8–15 （▶ の行: 12–13）

```ts
 8 │ 
 9 │ import {ViewEncapsulation} from '../metadata/view';
10 │ 
11 │ /**
12 ▶  * Used by `RendererFactory2` to associate custom rendering data and styles
13 ▶  * with a rendering implementation.
14 │  *  @publicApi
15 │  */
```

📄 `angular/packages/core/src/render/api.ts` L44–67 （▶ の行: 46–48, 52–54, 58, 60–64）

```ts
44 │ 
45 │ /**
46 ▶  * Extend this base class to implement custom rendering. By default, Angular
47 ▶  * renders a template into DOM. You can use custom rendering to intercept
48 ▶  * rendering calls, or to render to something other than DOM.
49 │  *
50 │  * <div class="docs-alert docs-alert-important">
51 │  * <p>
52 ▶  * Please be aware that usage of `Renderer2`, in context of accessing DOM elements, provides no
53 ▶  * extra security which makes it equivalent to
54 ▶  * {@link /best-practices/security#direct-use-of-the-dom-apis-and-explicit-sanitization-calls Security vulnerabilities}.
55 │  * </p>
56 │  * </div>
57 │  *
58 ▶  * Create your custom renderer using `RendererFactory2`.
59 │  *
60 ▶  * Use a custom renderer to bypass Angular's templating and
61 ▶  * make custom UI changes that can't be expressed declaratively.
62 ▶  * For example if you need to set a property or an attribute whose name is
63 ▶  * not statically known, use the `setProperty()` or
64 ▶  * `setAttribute()` method.
65 │  *
66 │  * @publicApi
67 │  */
```

12〜13 行目「`RendererFactory2` が、独自の描画のデータとスタイルを描画の実装に結びつけるのに使う」の中身（`id`・`encapsulation`・`styles`・`data`）は[Renderer2 の章](../domr/02-domr-renderer-api.md)の 3 節です。そこで読んだとおり、L26 の `Native` は v11 で消えた値のままです。46〜48 行目は「既定では DOM に描く。独自の描画を使えば、描く呼び出しを横取りしたり、DOM 以外に描いたりできる」、58 行目は「独自の renderer は `RendererFactory2` で作る」です。

52〜54 行目の注意「`Renderer2` で DOM 要素に触っても、セキュリティは何も足されない」は、DEMO の 2 で確かめました。`setProperty(div, 'innerHTML', '<b onclick="…">t</b>')` のあとの `innerHTML` には `onclick` がそのまま残っています（document に付けていない要素で試し、押していません）。`setProperty`（platform-browser の dom\_renderer.ts L462〜471）は `el[name] = value` だけで、テンプレートの `[innerHTML]` のようなサニタイズ（[サニタイズの章](../domr/17-domr-sanitization.md)）は通りません。この注意は e4a667690a6（2025-04-02、`docs: add Security-DomSanitizer link in ElemnetRef&Renderer2 (#60708)`）で足されました。60〜64 行目「名前が前もって分からないプロパティや属性を書くなら `setProperty()` か `setAttribute()`」は、独自の renderer を作る話ではなく、`inject(Renderer2)` で受け取った既定の renderer を使う話です。58 行目と 60 行目の「custom renderer」は別の物を指しています。

## 2. 作る・外す：createComment と removeChild の言い方

`createElement` から `removeChild` まで（L76〜137）の説明は[Renderer2 の章](../domr/02-domr-renderer-api.md)が引いています。DEMO の 1 で約束と比べると、次の 3 つが説明文の言い方と違いました。

- `createComment`（L88〜92）は「host element の DOM に comment を足す。`@returns` 変更した要素」、`createText`（L94〜99）も同じ言い方ですが、どちらも新しいノードを作って返すだけです。DEMO では `isConnected=false`、`parentNode=null` でした。返るのは要素ではなく `Comment`（`nodeType=8`）と `Text`（`nodeType=3`）です。
- `removeChild(parent, oldChild, isHostElement?)`（L124〜137）の `parent` を `DefaultDomRenderer2` は使いません（dom\_renderer.ts L373〜376 は `oldChild.remove()` だけ）。別の要素を `parent` に渡しても、`null` を渡しても外れました。spec の `should not error when removing a child without passing a parent`（dom\_renderer\_spec.ts 96）がこれを固めています。`isHostElement` を受け取って使うのは旧 animations の renderer です（animations/browser/src/render/renderer.ts L84〜90、[旧 @angular/animations の入口の章](../animations/14-animations-legacy-setup.md)）。
- `createElement('circle', 'http://www.w3.org/2000/svg')` のように名前空間を URI で渡しても SVG の要素になりました（dom\_renderer.ts L335 の `NAMESPACE_URIS[namespace] || namespace`）。4 節の `setAttribute` はこれを受け付けません。

## 3. selectRootElement・parentNode・nextSibling

📄 `angular/packages/core/src/render/api.ts` L138–165 （▶ の行: 139–140, 142–144, 153–155, 161–163）

```ts
138 │   /**
139 ▶    * Implement this callback to prepare an element to be bootstrapped
140 ▶    * as a root element, and return the element instance.
141 │    * @param selectorOrNode The DOM element.
142 ▶    * @param preserveContent Whether the contents of the root element
143 ▶    * should be preserved, or cleared upon bootstrap (default behavior).
144 ▶    * Use with `ViewEncapsulation.ShadowDom` to allow simple native
145 │    * content projection via `<slot>` elements.
146 │    * @returns The root element.
147 │    */
148 │   abstract selectRootElement(selectorOrNode: string | any, preserveContent?: boolean): any;
149 │   /**
150 │    * Implement this callback to get the parent of a given node
151 │    * in the host element's DOM.
152 │    * @param node The child node to query.
153 ▶    * @returns The parent node, or null if there is no parent.
154 ▶    * This is because the check is synchronous,
155 ▶    * and the caller can't rely on checking for null.
156 │    */
157 │   abstract parentNode(node: any): any;
158 │   /**
159 │    * Implement this callback to get the next sibling node of a given node
160 │    * in the host element's DOM.
161 ▶    * @returns The sibling node, or null if there is no sibling.
162 ▶    * This is because the check is synchronous,
163 ▶    * and the caller can't rely on checking for null.
164 │    */
165 │   abstract nextSibling(node: any): any;
```

139〜143 行目「root として起動する要素を準備して返す。`preserveContent` は中身を残すか、起動で消すか（既定）」は、DEMO のとおりでした。`selectRootElement('#crhrdr-root', true)` は同じ要素を返して中身の「中身」を残し、`preserveContent` を渡さないと `textContent` が空になりました（dom\_renderer.ts L388〜390）。見つからないセレクターは `RuntimeError`（`ROOT_NODE_NOT_FOUND`、コード -5104）を投げ、このページ（本番）では文が付かずに `NG05104` だけでした（L384〜385 の `ngDevMode`）。141 行目の `@param selectorOrNode The DOM element.` は、文字列のセレクターも受けることを言っていません。

153〜155 行目と 161〜163 行目には「`null` を返す。これは確認が同期だからで、呼ぶ側は `null` を確かめることに頼れない」と、前の文と反対に読める文が付いています。どちらも f1ab3942187（2018-07-02、`docs: add api doc to commonly queried elements`）からある文です。実装は `node.parentNode` と `node.nextSibling` を返すだけで（L394〜400）、DEMO では document に付けていない要素の `parentNode` も最後の子の `nextSibling` も `null` でした。`null` は確かめてよい値です。

## 4. setAttribute・removeAttribute の namespace と、addClass

📄 `angular/packages/core/src/render/api.ts` L166–195 （▶ の行: 171, 173, 179, 185, 187）

```ts
166 │   /**
167 │    * Implement this callback to set an attribute value for an element in the DOM.
168 │    * @param el The element.
169 │    * @param name The attribute name.
170 │    * @param value The new value.
171 ▶    * @param namespace The namespace.
172 │    */
173 ▶   abstract setAttribute(el: any, name: string, value: string, namespace?: string | null): void;
174 │ 
175 │   /**
176 │    * Implement this callback to remove an attribute from an element in the DOM.
177 │    * @param el The element.
178 │    * @param name The attribute name.
179 ▶    * @param namespace The namespace.
180 │    */
181 │   abstract removeAttribute(el: any, name: string, namespace?: string | null): void;
182 │   /**
183 │    * Implement this callback to add a class to an element in the DOM.
184 │    * @param el The element.
185 ▶    * @param name The class name.
186 │    */
187 ▶   abstract addClass(el: any, name: string): void;
188 │ 
189 │   /**
190 │    * Implement this callback to remove a class from an element in the DOM.
191 │    * @param el The element.
192 │    * @param name The class name.
193 │    */
194 │   abstract removeClass(el: any, name: string): void;
195 │ 
```

171・179 行目の `namespace` は「The namespace.」とだけ書かれています。`DefaultDomRenderer2.setAttribute`（L402〜414）は、`xlink` などの短い名前なら `name` を `xlink:href` にして `setAttributeNS`、知らない短い名前なら `foo:bar` という名前のただの属性にします（DEMO の 2 の表。spec は dom\_renderer\_spec.ts 35〜62 の `setAttribute › with namespace`）。名前空間を URI で渡すと、`name` が `http://www.w3.org/1999/xlink:href` になって `el.setAttribute` に渡り、ブラウザーが `InvalidCharacterError` を投げました。2 節の `createElement` は URI を受け付けるので、同じ `namespace` という引数でもメソッドによって受け付ける形が違います。

185 行目の `addClass` の引数は「The class name.」（1 つ）で、実装は `classList.add(name)` です（L429〜431）。`'b c'` のように空白を含めると、ブラウザーの `classList.add` が `InvalidCharacterError` を投げました。テンプレートの `[class]` は名前を空白で区切り、空白を含む名前は捨ててから 1 つずつ呼ぶので（[スタイルとクラスの map の章](../domr/12-domr-styling-maps.md)）、自分で `addClass` を呼ぶときだけ気をつけます。

## 5. setStyle と removeStyle の flags：Important だけでは camelCase が書かれない

📄 `angular/packages/core/src/render/api.ts` L196–227 （▶ の行: 201, 203, 209, 211, 217, 222–223, 226）

```ts
196 │   /**
197 │    * Implement this callback to set a CSS style for an element in the DOM.
198 │    * @param el The element.
199 │    * @param style The name of the style.
200 │    * @param value The new value.
201 ▶    * @param flags Flags for style variations. No flags are set by default.
202 │    */
203 ▶   abstract setStyle(el: any, style: string, value: any, flags?: RendererStyleFlags2): void;
204 │ 
205 │   /**
206 │    * Implement this callback to remove the value from a CSS style for an element in the DOM.
207 │    * @param el The element.
208 │    * @param style The name of the style.
209 ▶    * @param flags Flags for style variations to remove, if set. ???
210 │    */
211 ▶   abstract removeStyle(el: any, style: string, flags?: RendererStyleFlags2): void;
212 │ 
213 │   /**
214 │    * Implement this callback to set the value of a property of an element in the DOM.
215 │    * @param el The element.
216 │    * @param name The property name.
217 ▶    * @param value The new value.
218 │    */
219 │   abstract setProperty(el: any, name: string, value: any): void;
220 │ 
221 │   /**
222 ▶    * Implement this callback to set the value of a node in the host element.
223 ▶    * @param node The node.
224 │    * @param value The new value.
225 │    */
226 ▶   abstract setValue(node: any, value: string): void;
227 │ 
```

201 行目は「flags はスタイルの変種の印。既定では何も立てない」、209 行目は「消すスタイルの変種の印（立っていれば）。???」と、疑問符のまま残っています（f1ab3942187 から）。`RendererStyleFlags2` の 2 つの値（`Important` と `DashCase`）は[Renderer2 の章](../domr/02-domr-renderer-api.md)の 4 節です。`DefaultDomRenderer2`（dom\_renderer.ts L437〜460）の決め方は次のとおりで、DEMO の 3 の結果と同じでした。

| 呼び方 | 実装の道（dom\_renderer.ts） | DEMO の結果 |
| --- | --- | --- |
| `setStyle(el, 'color', 'red')` | L445 `el.style[style] = value` | `color: red` |
| `setStyle(el, 'color', 'red', Important)` | L443 `style.setProperty(style, value, 'important')` | `color: red !important` |
| `setStyle(el, 'backgroundColor', 'red')` | L445 | `background-color: red` |
| **`setStyle(el, 'backgroundColor', 'red', Important)`** | L443 `setProperty('backgroundColor', …)` | **何も書かれない** |
| `setStyle(el, 'background-color', 'red', DashCase \| Important)` | L443 | `background-color: red !important` |
| `removeStyle(el, 'backgroundColor')` | L458 `el.style[style] = ''` | 消える |
| `removeStyle(el, 'color', Important)` | L458（`Important` は見ない） | 消える |

太字の行が食い違いです。`CSSStyleDeclaration.setProperty` は dash-case の名前しか受け付けないので、`Important` だけを立てて camelCase の名前を渡すと、エラーも出ずに何も書かれません。この形は 44763245e1d（2020-11-08、`fix(core): handle !important in style property value (#39603)`）で、それまでの「`DashCase` のときだけ `setProperty`」に `Important` を足したときからです。テンプレートの `[style.backgroundColor]="'red !important'"` は、この道を通りません。コンパイラーが名前を `background-color` に直してから命令に渡すからで（compiler の template/pipeline/src/phases/naming.ts L159・L210 の `normalizeStylePropName`）、DEMO の 5 でも `background-color: red !important` になりました。ところが `[style]="{backgroundColor: 'red !important'}"` のような map の名前は、実行時にそのまま `applyStyling`（render3/node\_manipulation.ts L1149〜1160、[スタイルを書く章](../domr/11-domr-styling-apply.md)）に届きます。`applyStyling` は名前に「-」が無ければ `DashCase` を立てず、値が `!important` で終われば `Important` を立てるので、上の太字の行と同じになり、DEMO の 5 では何も書かれませんでした（`{'background-color': …}` なら書かれます）。spec の `should set !important on a single property`（styling\_spec.ts 893）は `width`、`should set !important on a dash-case property`（932）は `margin-right`、`should set !important on multiple properties`（952）は文字列の `[style]` で、camelCase の名前の map に `!important` を付ける it はありません。origin/main の dom\_renderer.ts も同じ行で、gh で探しても issue は見当たりません。

217 行目の `setProperty` は 1 節のとおり `el[name] = value` です。222〜226 行目の `setValue`「ノードの値を設定する」は `node.nodeValue = value`（L473〜475）で、Text と Comment には効きますが、要素では `nodeValue` が `null` のままで何も変わりませんでした（DEMO の 1）。

## 6. listen：戻り値は外す関数、的は文字列でも

📄 `angular/packages/core/src/render/api.ts` L228–244 （▶ の行: 230–232, 235–236, 239, 241）

```ts
228 │   /**
229 │    * Implement this callback to start an event listener.
230 ▶    * @param target The context in which to listen for events. Can be
231 ▶    * the entire window or document, the body of the document, or a specific
232 ▶    * DOM element.
233 │    * @param eventName The event to listen for.
234 │    * @param callback A handler function to invoke when the event occurs.
235 ▶    * @param options Options that configure how the event listener is bound.
236 ▶    * @returns An "unlisten" function for disposing of this handler.
237 │    */
238 │   abstract listen(
239 ▶     target: 'window' | 'document' | 'body' | any,
240 │     eventName: string,
241 ▶     callback: (event: any) => boolean | void,
242 │     options?: ListenerOptions,
243 │   ): () => void;
244 │ 
```

236 行目「外すための関数を返す」は DEMO の 4 のとおりで、返った関数を呼んだあとはもう呼ばれません。230〜232 行目の文字列の的（`'window'`・`'document'`・`'body'`）も、`document.body` と `window` に送った自作のイベントで呼ばれました。235 行目の `options` に `{once: true}` を渡すと、2 回送っても 1 回でした（L281〜285 の `ListenerOptions` が `addEventListener` まで届くことは[listen の章](../domr/14-domr-listen.md)の 4 節）。241 行目の callback の戻りの型は `boolean | void` ですが、説明文は `false` を返したときのことを書いていません。実装は `false` で `preventDefault()` を呼び（[listen の章](../domr/14-domr-listen.md)の 6 節）、DEMO でも `defaultPrevented=true` でした。

## 7. AnimationRendererType：ɵtype は Renderer2 に足さない

📄 `angular/packages/core/src/render/api.ts` L265–276 （▶ の行: 267–268, 270, 273–274）

```ts
265 │ 
266 │ /**
267 ▶  * This enum is meant to be used by `ɵtype` properties of the different renderers implemented
268 ▶  * by the framework
269 │  *
270 ▶  * We choose to not add `ɵtype` to `Renderer2` to no expose it to the public API.
271 │  */
272 │ export const enum AnimationRendererType {
273 ▶   Regular = 0,
274 ▶   Delegated = 1,
275 │ }
276 │ 
```

267〜270 行目は「この enum は framework の renderer の `ɵtype` に使う。公開の API に出さないため `Renderer2` には `ɵtype` を足さない」です（270 行目の `to no expose` は `to not expose` の書き違い）。読むのは `@angular/animations` の animation\_builder.ts L254〜266 だけで、`Regular`（0）か `Delegated`（1）なら旧 animations の renderer と見なします。この enum は 1c4a3677eb4（2023-10-07、``refactor(animations): make `AnimationBuilder` tree-shakable (#52097)``）で入りました。このサイトは旧 animations を使わないので、DEMO の 1 の `ɵtype` は `undefined` です。

## 8. DEFAULT\_CURRENCY\_CODE と TRANSLATIONS の説明文の例

📄 `angular/packages/core/src/i18n/tokens.ts` L88–127 （▶ の行: 90–92, 98, 100, 104, 113, 116, 125–126）

````ts
 88 │ 
 89 │ /**
 90 ▶  * Provide this token to set the default currency code your application uses for
 91 ▶  * CurrencyPipe when there is no currency code passed into it. This is only used by
 92 ▶  * CurrencyPipe and has no relation to locale currency. Defaults to USD if not configured.
 93 │  *
 94 │  * See the [i18n guide](guide/i18n/locale-id) for more information.
 95 │  *
 96 │  * <div class="docs-alert docs-alert-helpful">
 97 │  *
 98 ▶  * The default currency code is currently always `USD`.
 99 │  *
100 ▶  * If you need the previous behavior then set it by creating a `DEFAULT_CURRENCY_CODE` provider in
101 │  * your application `NgModule`:
102 │  *
103 │  * ```ts
104 ▶  * {provide: DEFAULT_CURRENCY_CODE, useValue: 'USD'}
105 │  * ```
106 │  *
107 │  * </div>
108 │  *
109 │  * @usageNotes
110 │  * ### Example
111 │  * In standalone apps:
112 │  * ```ts
113 ▶  * import { LOCALE_ID, ApplicationConfig } from '@angular/core';
114 │  *
115 │  * const appConfig: ApplicationConfig = {
116 ▶  *   providers: [{provide: DEFAULT_CURRENCY_CODE, useValue: 'EUR' }]
117 │  * };
118 │  * ```
119 │  *
120 │  * In module based apps:
121 │  * ```ts
122 │  * import { platformBrowser } from '@angular/platform-browser';
123 │  * import { AppModule } from './app/app.module';
124 │  *
125 ▶  * platformBrowser().bootstrapModule(AppModule, {
126 ▶  *   providers: [{provide: DEFAULT_CURRENCY_CODE, useValue: 'EUR' }]
127 │  * });
````

90〜92 行目「`CurrencyPipe` に通貨を渡さなかったときの既定。ロケールの通貨とは関係ない。設定しなければ USD」は、このページで `inject(DEFAULT_CURRENCY_CODE)` すると `USD` でした（L135 の factory）。98〜105 行目の注意「既定は今は常に USD。前の振る舞いが要るなら provider を書く」は、58f10026c4d（2020-01-10、`docs: add deprecation info about default currency code (#32584)`）が「v11 から既定をロケールから取る」予告と一緒に書いた文です。その変更は入らず、今も既定は USD のままなので、「前の振る舞い」が何を指すのか分からない文になっています。

例のコードには 2 つの問題があります。1 つは import です。113 行目は `LOCALE_ID` と `ApplicationConfig` を import しますが、116 行目で使うのは `DEFAULT_CURRENCY_CODE` で、122〜127 行目の例も `DEFAULT_CURRENCY_CODE` を import していません。strict の `tsc` に通すと、どちらも `TS2304: Cannot find name 'DEFAULT_CURRENCY_CODE'` でした。もう 1 つは 125〜126 行目の `bootstrapModule(AppModule, {providers: [...]})` です。`bootstrapModule` の第 2 引数の `providers` は `CompilerOptions` の物で、JIT のコンパイラーがリソースを読むときにしか使われません（application\_ngmodule\_factory\_compiler.ts L50〜58。AOT では L32〜33 で何も見ずに返ります）。手元の記録（DEMO の 6 の下の表）では、この形で `EUR` と `fr` を渡しても、モジュールの注入器の `DEFAULT_CURRENCY_CODE` は `USD`、`LOCALE_ID` は `en-US` のままでした。`applicationProviders` に書くと `EUR` と `fr` になります（platform\_ref.ts L49〜53）。

📄 `angular/packages/core/src/i18n/tokens.ts` L138–169 （▶ の行: 149, 152, 158, 165–166）

````ts
138 │ 
139 │ /**
140 │  * Use this token at bootstrap to provide the content of your translation file (`xtb`,
141 │  * `xlf` or `xlf2`) when you want to translate your application in another language.
142 │  *
143 │  * See the [i18n guide](guide/i18n/merge) for more information.
144 │  *
145 │  * @usageNotes
146 │  * ### Example
147 │  * In standalone apps:
148 │  * ```ts
149 ▶  * import { LOCALE_ID, ApplicationConfig } from '@angular/core';
150 │  *
151 │  * const appConfig: ApplicationConfig = {
152 ▶  *   providers: [{provide: TRANSLATIONS, useValue: translations }]
153 │  * };
154 │  * ```
155 │  *
156 │  * In module based apps:
157 │  * ```ts
158 ▶  * import { TRANSLATIONS } from '@angular/core';
159 │  * import { platformBrowser } from '@angular/platform-browser';
160 │  * import { AppModule } from './app/app.module';
161 │  *
162 │  * // content of your translation file
163 │  * const translations = '....';
164 │  *
165 ▶  * platformBrowser().bootstrapModule(AppModule, {
166 ▶  *   providers: [{provide: TRANSLATIONS, useValue: translations }]
167 │  * });
168 │  * ```
169 │  *
````

`TRANSLATIONS` の例も同じ形です。149 行目は `LOCALE_ID` を import して 152 行目で `TRANSLATIONS` と、どこにも無い `translations` を使うので、strict の `tsc` は `TS2304` を 2 つ出しました。165〜166 行目の `bootstrapModule` の `providers` は、記録でも `TRANSLATIONS` を注入器に入れませんでした。そもそも core の中にこの token を inject する行が無いことは[ロケールのデータの章](../loc/12-loc-locale-data.md)にあります。この形の例は b43fe29ca7e（2025-04-20、`docs: update examples for i18n tokens (#60938)`）で `platformBrowserDynamic` を `platformBrowser` に直し、standalone の例を足したときのもので、`LOCALE_ID` と `TRANSLATIONS_FORMAT` の例（L68〜76、L180 から。引用は[ロケールのデータの章](../loc/12-loc-locale-data.md)）も同じ `providers` を使っています。origin/main の tokens.ts も同じです。

## 9. ロケールのデータの小さな関数

📄 `angular/packages/core/src/i18n/locale_data_api.ts` L73–87 （▶ の行: 75, 77, 83, 85）

```ts
73 │ 
74 │ /**
75 ▶  * Retrieves the default currency code for the given locale.
76 │  *
77 ▶  * The default is defined as the first currency which is still in use.
78 │  *
79 │  * @param locale The code of the locale whose currency code we want.
80 │  * @returns The code of the default currency for the given locale.
81 │  *
82 │  */
83 ▶ export function getLocaleCurrencyCode(locale: string): string | null {
84 │   const data = findLocaleData(locale);
85 ▶   return data[LocaleDataIndex.CurrencyCode] || null;
86 │ }
87 │ 
```

`getLocaleCurrencyCode`（75 行目「ロケールの既定の通貨」、77 行目「まだ使われている最初の通貨」）は、ロケールのデータの 15 番目（`LocaleDataIndex.CurrencyCode`）を読むだけです。`ɵgetLocaleCurrencyCode` として core から出ていて（core\_private\_export.ts L121）、`@angular/common` の `getLocaleCurrencyCode` が使います。記録（DEMO の 6 の下の表）では `en-US` で `USD` で、8 節の `DEFAULT_CURRENCY_CODE` と値は同じですが、別の物です。

📄 `angular/packages/core/src/i18n/locale_data_api.ts` L124–131 （▶ の行: 126, 128–129）

```ts
124 │ 
125 │ /**
126 ▶  * Helper function to remove all the locale data from `LOCALE_DATA`.
127 │  */
128 ▶ export function unregisterAllLocaleData() {
129 ▶   LOCALE_DATA = Object.create(null);
130 │ }
131 │ 
```

128 行目の `unregisterAllLocaleData` は、core から `ɵunregisterLocaleData` という別の名前で出ています（core\_private\_export.ts L125）。使うのは `@angular/common` の spec（locale\_data\_api\_spec.ts ほか）だけで、DEMO では呼びません（サイト全体のロケールのデータが消えるため）。

📄 `angular/packages/core/src/i18n/locale_data_api.ts` L161–185 （▶ の行: 165, 174, 181, 184）

```ts
161 │ 
162 │ /**
163 │  * Index of each type of locale data from the extra locale data array
164 │  */
165 ▶ export const enum ExtraLocaleDataIndex {
166 │   ExtraDayPeriodFormats = 0,
167 │   ExtraDayPeriodStandalone,
168 │   ExtraDayPeriodsRules,
169 │ }
170 │ 
171 │ /**
172 │  * Index of each value in currency data (used to describe CURRENCIES_EN in currencies.ts)
173 │  */
174 ▶ export const enum CurrencyIndex {
175 │   Symbol = 0,
176 │   SymbolNarrow,
177 │   NbOfDigits,
178 │ }
179 │ 
180 │ /**
181 ▶  * Returns the canonical form of a locale name - lowercase with `_` replaced with `-`.
182 │  */
183 │ function normalizeLocale(locale: string): string {
184 ▶   return locale.toLowerCase().replace(/_/g, '-');
185 │ }
```

L132〜136 のコメント（[ロケールのデータの章](../loc/12-loc-locale-data.md)が引用）は「TS の enum は IIFE の副作用になって tree-shake できないので、`as const` の物にした」と言い、記録でも `typeof ɵLocaleDataIndex` は `object` でした。165・174 行目の `ExtraLocaleDataIndex` と `CurrencyIndex` は `const enum` で、コンパイルで数字に置き換わるので同じ心配はありません。181・184 行目の `normalizeLocale`「小文字にして `_` を `-` に」は `findLocaleData` の入口（L50）で使われ、`registerLocaleData` は同じ変換を L33 に自分で書いています。記録では `'EN_us'` が `en-us` になり、無いので親の `en` のデータが返りました。見つからないロケールは NG0701 で、開発モードでは `Missing locale data for the locale "crh-xx".`、本番では `NG0701` だけでした（L68〜71）。

## 10. animate.enter / animate.leave の検査の関数

📄 `angular/packages/core/src/animation/utils.ts` L42–66 （▶ の行: 44, 46–47, 50, 56, 58–59, 62）

```ts
42 │ 
43 │ /**
44 ▶  * Asserts a value passed in is actually an animation type and not something else
45 │  */
46 ▶ export function assertAnimationTypes(value: string | Function, instruction: string) {
47 ▶   if (value == null || (typeof value !== 'string' && typeof value !== 'function')) {
48 │     throw new RuntimeError(
49 │       RuntimeErrorCode.ANIMATE_INVALID_VALUE,
50 ▶       `'${instruction}' value must be a string of CSS classes or an animation function, got ${stringify(value)}`,
51 │     );
52 │   }
53 │ }
54 │ 
55 │ /**
56 ▶  * Asserts a given native element is an actual Element node and not something like a comment node.
57 │  */
58 ▶ export function assertElementNodes(nativeElement: Element, instruction: string) {
59 ▶   if ((nativeElement as Node).nodeType !== Node.ELEMENT_NODE) {
60 │     throw new RuntimeError(
61 │       RuntimeErrorCode.ANIMATE_INVALID_VALUE,
62 ▶       `'${instruction}' can only be used on an element node, got ${stringify((nativeElement as Node).nodeType)}`,
63 │     );
64 │   }
65 │ }
66 │ 
```

呼ぶのは render3/instructions/animation.ts の `ɵɵanimateEnter`・`ɵɵanimateLeave` ほかで、どれも `ngDevMode && assertAnimationTypes(...)` の形です（L64 ほか）。本番では呼ばれません。44 行目「渡された値が本当に animation の型か確かめる」は、テンプレートからは確かめられません。手元の記録で JIT のテンプレート関数を見ると、`[animate.enter]="n"` は `ɵɵanimateEnter(function () { return ctx.n; })` と、値を返す関数に包まれて渡ります。47 行目は「文字列か関数か」だけを見るので、`n` が `123` でも `null` でも通り、何も起きませんでした（クラスを読む `getClassListFromValue` が `null` を返すだけ）。

58〜64 行目の `assertElementNodes` は、記録で `<ng-container animate.enter="fade" />` を描くと、開発モードで `NG0650: 'animate.enter' can only be used on an element node, got 8` を ErrorHandler に出しました（8 は Comment）。コンパイラーはこのテンプレートを通します。本番では検査が無いので、`classList` の無いコメントに `addClass` しようとして `TypeError: Cannot read properties of undefined (reading 'add')` になりました。

この失敗は 1 回で終わりません。animate.enter の関数を溜める queue（animation/queue.ts の `scheduleAnimationQueue`、L93〜98）は、溜まった関数を順に呼んでから `queue.clear()` しますが、途中の 1 つが投げると `clear()` に届かず、投げた関数とその後ろの関数が queue に残ります。手元の記録では、`<ng-container animate.enter>` と `<p animate.enter="after-bad">` を持つコンポーネントを描くと、`p` にクラスが付かず、そのあと別のコンポーネントの `<span animate.enter="ok">`・`<i animate.enter="ok2">` を描くたびに同じエラーがもう一度出て、どちらにもクラスが付きませんでした（開発モードでも本番でも。`ng-container` の無い対照では 3 つとも付きました）。origin/main の queue.ts も同じ行で、gh で探しても issue は見当たりません。

📄 `angular/packages/core/src/animation/utils.ts` L303–313 （▶ の行: 305, 307, 309）

```ts
303 │ 
304 │ /**
305 ▶  * Checks if a given element contains the classes is a provided list
306 │  */
307 ▶ export function elementHasClassList(element: HTMLElement, classList: string[]): boolean {
308 │   for (const className of classList) {
309 ▶     if (element.classList.contains(className)) return true;
310 │   }
311 │   return false;
312 │ }
313 │ 
```

305 行目「要素が、与えたリストのクラスを含むか確かめる」は文が崩れていて（`contains the classes is a provided list`）、「全部を含むか」と読めます。実装は 309 行目で 1 つでも含めば `true` です。呼ぶのは L294 の `cancelAnimationsIfRunning` だけで、そこでは「enter のクラスがまだ 1 つでも残っていれば外す」なので、実装の「1 つでも」が正しい側です。

📄 `angular/packages/core/src/animation/utils.ts` L374–381 （▶ の行: 376, 378–380）

```ts
374 │ 
375 │ /**
376 ▶  * Stores a given animation function in the LView's animation map for later execution
377 │  *
378 ▶  * @param animations Either the enter or leave animation map from the LView
379 ▶  * @param tNode The TNode the animation is associated with
380 ▶  * @param fn The animation function to be called later
381 │  */
```

376 行目「animation の関数を LView の map にしまって後で呼ぶ」は、L382〜390 で `tNode.index` ごとに `animateFns` へ足すとおりです（[animate の命令の章](../animations/03-animations-instructions.md)）。なお、このファイルの L9 には `// Adjust imports as per actual location` という、書きかけのようなコメントが残っています。6b1f4b9e8bb（2025-07-09、`feat(core): add enter and leave animation instructions (#62682)`）で入り、62ad4db4651（2025-09-12、`refactor(core): Reorganize and cleanup animations code (#63775)`）でこのファイルに移ったものです。

> **🧪 DEMO — inject(Renderer2) した本物の renderer で、説明文の約束を呼ぶ**
>
> 押すと、この章のコンポーネントが `inject(Renderer2)` で受け取った renderer のメソッドを呼んで、結果を表にします。作った要素は下の作業場所か、document に付けない要素の上で試し、最後に取り除きます。`listen` で付けた物は返った関数で外します。5 はこの章のテンプレートの 4 つの `span` に `'red !important'` を束縛し、変更検知のあと `style` を読んで、束縛を外します。6 の下の表は、Node（domino の上の JIT、開発モードと本番）で `bootstrapModule` と animate.enter を動かした記録の再生です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crh-renderer)

## ここまでの呼び出し

- 👤 `[style]="{backgroundColor: 'red !important'}"`
  - `applyStyling(renderer, false, rNode, 'backgroundColor', 'red !important')` — render3/node\_manipulation.ts L1149〜1160 — *「-」が無いので DashCase なし、!important で Important*
    - `DefaultDomRenderer2.setStyle(el, 'backgroundColor', 'red', Important)` — platform-browser dom\_renderer.ts L437〜447
      - `el.style.setProperty('backgroundColor', 'red', 'important')` — L443 — *camelCase なので何も書かれない（\[style.backgroundColor\] はコンパイラーが先に background-color に直す）*
- 👤 `<ng-container animate.enter="x" />`
  - `ɵɵanimateEnter('x') → addAnimationToLView → queueEnterAnimations` — render3/instructions/animation.ts L58〜92
  - `afterNextRender の中の scheduleAnimationQueue の for` — animation/queue.ts L93〜98
    - `runEnterAnimation → assertElementNodes → NG0650` — animation/utils.ts L58〜65 — *clear() に届かず、queue に残る*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `platform-browser/test/dom/dom_renderer_spec.ts` | `DefaultDomRendererV2`（22）› `setAttribute › with namespace`（35〜62）・`removeAttribute › with namespace`（64〜93） | 4 節の短い名前と知らない名前。URI の it は無い |
| `platform-browser/test/dom/dom_renderer_spec.ts` | `removeChild`（95）› `should not error when removing a child without passing a parent`（96） | 2 節の `parent` を使わないこと |
| `platform-browser/test/dom/dom_renderer_spec.ts` | `should support namespaces`（341）› `should create SVG elements`（342）・`should create MathML elements`（348） | 2 節の `createElement` の短い名前 |
| `core/test/acceptance/styling_spec.ts` | `styling`（33）› `should set !important on a single property`（893）・`should set !important on a dash-case property`（932） | 5 節。`width` と `margin-right`（952 は文字列の `[style]`）で、camelCase の名前の map の it は無い |
| `core/test/i18n/locale_data_api_spec.ts` | `locale data api`（17）› `findLocaleData`（54）› `should throw if the LOCALE_DATA for the chosen locale or its parent locale is not available`（55） | 9 節の NG0701 |
| `core/test/acceptance/animation_spec.ts` | `Animation`（49） | 10 節。`ng-container` に animate.enter を書く it と、queue の中で投げる it は無い |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/platform-browser/test:test_web_chromium --nocache_test_results --test_output=all
  253 passed, 0 failed, 5 skipped（dom_renderer_spec.ts は web の suite だけ。Node の //packages/platform-browser/test:test は 159 specs）
$ pnpm bazel test //packages/core/test:test --nocache_test_results "--test_arg=--filter=locale data api"
  Ran 3 of 1392 specs（4 つの shard それぞれ）, 0 failures
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results "--test_arg=--filter=important"
  Ran 6 of 2693 specs, 0 failures
$ pnpm bazel test //packages/core/test/acceptance:acceptance_web_chromium --nocache_test_results --test_output=all
  2743 passed, 0 failed, 3 skipped（animation_spec.ts を含む）

# 説明文の例のコード（tokens.ts L112〜117・L148〜153）を strict の tsc に通す
$ npx tsc --strict --noEmit --module esnext --moduleResolution bundler --target es2022 ex-*.ts
ex-currency-standalone.ts(4,25): error TS2304: Cannot find name 'DEFAULT_CURRENCY_CODE'.
ex-currency-module.ts(5,25): error TS2304: Cannot find name 'DEFAULT_CURRENCY_CODE'.
ex-translations-standalone.ts(4,25): error TS2304: Cannot find name 'TRANSLATIONS'.
ex-translations-standalone.ts(4,49): error TS2304: Cannot find name 'translations'.
（LOCALE_ID の 2 つの例と TRANSLATIONS の NgModule の例はエラーなし）

# 記録（Node、domino の上の JIT、@angular/core・platform-browser 22.2.6、開発モード）
$ node record-tokens.mjs <angular-deep-dive>   # bootstrapModule の providers と applicationProviders
$ node record-anim.mjs <angular-deep-dive>     # animate.enter / animate.leave の NG0650
```

直すとしたら、5 節は dom\_renderer.ts の `setStyle`（L442）で、`Important` だけのときは camelCase を dash-case にしてから `setProperty` に渡すか、`DashCase` が無ければ `el.style[style] = value` のあと `setProperty` で優先度だけ付け直すのが小さな直し方で、spec は styling\_spec.ts の 932 の隣に `[style]="{backgroundColor: '… !important'}"` の it を足します。10 節の queue は、queue.ts の `scheduleAnimationQueue` の `for` を `try / finally` にして、`finally` で `clear()` する（か、1 つずつ `try` で包んで続ける）形で、spec は animation\_spec.ts に「`ng-container` の animate.enter のあとでも、ほかの要素の enter のクラスが付く」を足します。説明文は、api.ts の 153〜155・161〜163 行目の後ろの文と 209 行目の `???` を消す、tokens.ts の例の import を直し `providers` を `applicationProviders` にする、が 1〜数行の変更です。

## 聞かれそうな質問

**Q. `Renderer2` で `innerHTML` を書けば、サニタイズされますか？**

されません。52〜54 行目のとおりで、`setProperty` は `el[name] = value` だけです。DEMO でも `onclick` が残りました。

**Q. `setStyle` で `!important` を付けるには？**

`RendererStyleFlags2.Important` を渡し、名前は dash-case（`background-color`）にします。camelCase（`backgroundColor`）に `Important` だけを付けると何も書かれません（dom\_renderer.ts L443）。テンプレートの `[style.backgroundColor]` はコンパイラーが名前を直すので書かれますが、`[style]` の map の camelCase の名前は書かれません。

**Q. `setAttribute` の `namespace` には何を渡しますか？**

`'xlink'`・`'svg'` などの短い名前です（NAMESPACE\_URIS、dom\_renderer.ts L40〜47）。URI を渡すと `InvalidCharacterError` になります。`createElement` は URI も受け付けます。

**Q. `listen` の戻り値は何に使いますか？**

外すための関数です（236 行目）。呼ぶとそのあとのイベントでは呼ばれません。コンポーネントのビューが壊れるときに自動で外れるのは、テンプレートの `(event)` の方です（[listen の章](../domr/14-domr-listen.md)の 5 節）。

**Q. NgModule のアプリで `DEFAULT_CURRENCY_CODE` を変えるには？**

`bootstrapModule(AppModule, {applicationProviders: [...]})` か、`AppModule` の `providers` に書きます。説明文の例の `{providers: [...]}` はコンパイラーのオプションで、記録では `USD` のままでした。

## 読み終えて

- `createComment`・`createText` は作って返すだけで、DOM には足さない。`removeChild` の `parent` は使われない。
- `namespace` は `createElement` では URI も通るが、`setAttribute` では短い名前だけ。
- `Important` だけの `setStyle` は dash-case の名前でしか効かない。`[style]` の map の camelCase の名前の `!important` も同じ道。
- tokens.ts の例の `bootstrapModule({providers})` はアプリの注入器に届かない。import も足りない。
- `<ng-container animate.enter>` の失敗は animation の queue に残り、ほかの enter を止める。

---

← 前: [resource() の説明文：状態・params・reload・stream](05-crh-resource.md)  
次: [開発用の小道具の説明文：assert・ngDevMode・画像の警告・profiler](07-crh-dev-utils.md) →
