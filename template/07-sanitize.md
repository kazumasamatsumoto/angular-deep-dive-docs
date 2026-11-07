[目次](../README.md) › [テンプレートと DOM](README.md) › 第 7 回 / 全 8 回

# innerHTML のタグが消える理由

> サニタイズの許可リストと URL 判定の正規表現を読む。何が残り何が消えるかは全部コードに書いてある。core に置かれた経緯も面白い。

angular/angular · 読了 約 9 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sanitize)

---

`[innerHTML]` にバインドすると、一部のタグが消えることがあります。「Angular が勝手に消した」ように見えますが、**何を残して何を消すかは全部コードに書いてあります**。読む対象は `packages/core/src/sanitization/` です。

## 1. 許可リスト方式

📄 `angular/packages/core/src/sanitization/html_sanitizer.ts` L71–76 （▶ の行: 71）

```ts
71 ▶ export const VALID_ELEMENTS: BooleanRecord = merge(
72 │   VOID_ELEMENTS,
73 │   BLOCK_ELEMENTS,
74 │   INLINE_ELEMENTS,
75 │   OPTIONAL_END_TAG_ELEMENTS,
76 │ );
```

71 行目。**「有効な要素」の一覧を作っています**。危険なものを列挙して消すのではなく、**安全と分かっているものだけを通す**という方式です。

これは重要な違いです。禁止リスト方式だと、新しい攻撃手法が見つかるたびに追加する必要があります。許可リストなら、**知らないものは自動的に落ちます**。

## 2. 消し方は 2 通りある

📄 `angular/packages/core/src/sanitization/html_sanitizer.ts` L113–117 （▶ の行: 113–114, 117）

```ts
113 ▶ //
114 ▶ // Typically, `<invalid>Some content</invalid>` would traverse (and in this case preserve)
115 │ // `Some content`, but strip `invalid-element` opening/closing tags. For some elements, though, we
116 │ // don't want to preserve the content, if the elements themselves are going to be removed.
117 ▶ const SKIP_TRAVERSING_CONTENT_IF_INVALID_ELEMENTS = tagSet('script,style,template');
```

113 行目からのコメントが挙動を説明しています。**通常、許可されていないタグは「タグだけ消して中身は残す」**。`<invalid>Some content</invalid>` なら `Some content` が残ります。

ただし 117 行目の 3 つ、`script`・`style`・`template` は例外で、**中身ごと消えます**。中身自体が危険だからです。

📄 `angular/packages/core/src/sanitization/html_sanitizer.ts` L180–190 （▶ の行: 182–184）

```ts
180 │   private startElement(element: Element): boolean {
181 │     const tagName = getNodeName(element).toLowerCase();
182 ▶     if (!Object.hasOwn(VALID_ELEMENTS, tagName)) {
183 ▶       this.sanitizedSomething = true;
184 ▶       return !Object.hasOwn(SKIP_TRAVERSING_CONTENT_IF_INVALID_ELEMENTS, tagName);
185 │     }
186 │     this.buf.push('<');
187 │     this.buf.push(tagName);
188 │     const elAttrs = element.attributes;
189 │     for (let i = 0; i < elAttrs.length; i++) {
190 │       const elAttr = elAttrs.item(i);
```

182 行目で許可リストを確認し、無ければ 183 行目で 「何かを消した」という印を立てます。そして 184 行目の戻り値で、**中身をたどるかどうかを決めます**。

## 3. URL は正規表現 1 本で判定される

📄 `angular/packages/core/src/sanitization/url_sanitizer.ts` L30–45 （▶ の行: 38）

```ts
30 │  * protocol name, which should never happen, e.g. "h&#116;tp" for "http".
31 │  * It also disallows HTML entities in the first path part of a relative path,
32 │  * e.g. "foo&lt;bar/baz".  Our existing escaping functions should not produce
33 │  * that. More importantly, it disallows masking of a colon,
34 │  * e.g. "javascript&#58;...".
35 │  *
36 │  * This regular expression was taken from the Closure sanitization library.
37 │  */
38 ▶ const SAFE_URL_PATTERN = /^(?!javascript:)(?:[a-z0-9+.-]+:|[^&:\/?#]*(?:[\/?#]|$))/i;
39 │ export function _sanitizeUrl(url: string): string {
40 │   url = String(url);
41 │   if (url.match(SAFE_URL_PATTERN)) return url;
42 │ 
43 │   if (typeof ngDevMode === 'undefined' || ngDevMode) {
44 │     console.warn(`WARNING: sanitizing unsafe URL value ${url} (see ${XSS_SECURITY_URL})`);
45 │   }
```

38 行目がすべてです。冒頭の `(?!javascript:)` が **「javascript: で始まらないこと」**を要求しています。

36 行目に出典も書かれていて、Closure のサニタイズライブラリから持ってきたものだ、とあります。**自前で考えずに、検証済みのものを使う**という判断です。

> **🧪 DEMO — URL の判定**
>
> 上の正規表現をそのまま使っています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sanitize)

大文字小文字を混ぜた `JaVaScRiPt:` も弾かれます。正規表現の末尾に `i` が付いているからです。

## 4. なぜ core にあるのか

このフォルダには `readme.md` があり、経緯が書かれています。もともとサニタイズは `platform-browser` にありました。DOM に関わる処理なので、そのほうが筋が通っています。

それでも `core` に移したのは、**ツリーシェイキングのため**でした。コンパイラが生成するコードから参照できる場所に置かないと、「使っていないサニタイザを消す」ができなかったのです。

> [!NOTE]
> **さらに深く**
>
> 設計の理想（プラットフォーム依存の処理は分離する）と、現実の制約（バンドルサイズ）がぶつかったときの判断が記録されています。readme にはこうも書かれています。**「理論上はサニタイザを差し替えられるが、実際にはそうされていない」**。使われていない柔軟性を捨てて、サイズを取ったわけです。

## 5. 迂回する方法と、その危険

どうしても許可リストに無いタグを使いたい場合、`DomSanitizer.bypassSecurityTrustHtml()` で迂回できます。**関数名に「bypass（迂回）」と「trust（信頼する）」が入っている**のは意図的です。

> [!WARNING]
> **ハマりどころ**
>
> ユーザーが入力した文字列に対してこれを使うと、XSS の穴がそのまま開きます。使ってよいのは **自分が中身を完全に把握している文字列**だけです。迷ったら使わない、が正解です。

## 読み終えて

- 許可リスト方式。知らないタグは自動的に落ちる
- 通常はタグだけ消して中身を残す。`script` など 3 つは中身ごと消す
- URL は 1 本の正規表現で判定。出典も明記されている
- サニタイズが `core` にあるのは、ツリーシェイキングを効かせるため

「勝手に消された」と思っていた挙動が、**読める規則**だったと分かるのがこの章の収穫だと思います。

---

← 前: [数値 1 つに 3 つの情報を詰める](06-i18n.md)  
次: [| async が面倒をみている 3 つのこと](08-async-pipe.md) →
