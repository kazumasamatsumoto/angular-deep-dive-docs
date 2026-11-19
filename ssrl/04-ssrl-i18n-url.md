[目次](../README.md) › [@angular/ssr の読み残し：provideServerRendering・リクエストハンドラ・CommonEngine・ビルド側のワーカーを行で埋める](README.md) › 第 4 回 / 全 6 回

# i18n と URL の小道具：JSDoc の約束と本物の答え、ng.ts とマニフェストの残り

> i18n.ts・utils/url.ts・utils/ng.ts の残りの行（JSDoc の約束、normalizeLocale、stripTrailingSlash・addLeadingSlash・stripIndexHtmlFromURL・buildPathWithParams）を、JSDoc の例と Accept-Language を本物の関数（44129f66a3 と 22.2.7）に流した記録で照らす。manifest.ts の AngularAppEngine 用マニフェストの置き場と、app-engine.ts の static なフラグ（ɵallowStaticRouteRender など）を誰が立てるか。

angular/angular-cli · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ssrl-i18n-url)

---

@angular/ssr には、ほかの章が「中身はここ」と通り過ぎた小さな関数と、関数の上の JSDoc（使い方を書いたコメント）がまとまって残っています。この章では i18n.ts・utils/url.ts・utils/ng.ts の残りの行を読み、**JSDoc に書かれた約束と例を、本物の関数に流して照らします**。最後に manifest.ts の AngularAppEngine 用のマニフェストの置き場と、app-engine.ts の静的なフラグ（ɵ の付いた 3 つ）を誰がいつ立てるかを読みます。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/ssr/src/` の `i18n.ts`・`utils/url.ts`・`utils/ng.ts`・`manifest.ts`・`app-engine.ts` です。関数の本体の行は、[ロケールの選び方](../ssrx/07-ssrx-i18n-locale.md)（i18n.ts）、[リダイレクトと URL の照合](../ssrx/06-ssrx-redirects.md)（url.ts の多く）、[AngularAppEngine](../platform/04-ssr-app-engine.md)（handle から入口を選ぶ流れ）で読み終えているので、ここでは繰り返しません。

1. [1. provideServerRendering の中身](01-ssrl-provide.md)
2. [2. server.ts の入口](02-ssrl-handlers.md)
3. [3. CommonEngine の残りと性能の記録](03-ssrl-common-engine.md)
4. **4. i18n と URL の小道具**（この章）
5. [5. ビルド側のワーカー](05-ssrl-build-workers.md)
6. [6. spec と issue](06-ssrl-tests-issues.md)

> [!NOTE]
> **ポイント**
>
> この章の記録は 2 つの版で取っています。1 つは本文が読む 44129f66a3（2026-09-09、22.2.0-next.6 の時点）の .ts、もう 1 つはこのサイトの依存の @angular/ssr 22.2.7（v22.2.7 のタグ、72f44d79cb、2026-11-12）です。22.2.7 には 44129f66a3 のあとの修正が入っていて、URL の関数の一部の答えが違います（3 節の表）。

## 1. getPotentialLocaleIdFromUrl の約束

📄 `angular-cli/packages/angular/ssr/src/i18n.ts` L1–27 （▶ の行: 12–14, 22–23, 25）

````ts
 1 │ /**
 2 │  * @license
 3 │  * Copyright Google LLC All Rights Reserved.
 4 │  *
 5 │  * Use of this source code is governed by an MIT-style license that can be
 6 │  * found in the LICENSE file at https://angular.dev/license
 7 │  */
 8 │ 
 9 │ /**
10 │  * Extracts a potential locale ID from a given URL based on the specified base path.
11 │  *
12 ▶  * This function parses the URL to locate a potential locale identifier that immediately
13 ▶  * follows the base path segment in the URL's pathname. If the URL does not contain a valid
14 ▶  * locale ID, an empty string is returned.
15 │  *
16 │  * @param url - The full URL from which to extract the locale ID.
17 │  * @param basePath - The base path used as the reference point for extracting the locale ID.
18 │  * @returns The extracted locale ID if present, or an empty string if no valid locale ID is found.
19 │  *
20 │  * @example
21 │  * ```js
22 ▶  * const url = new URL('https://example.com/base/en/page');
23 ▶  * const basePath = '/base';
24 │  * const localeId = getPotentialLocaleIdFromUrl(url, basePath);
25 ▶  * console.log(localeId); // Output: 'en'
26 │  * ```
27 │  */
````
*i18n.ts の頭。import は 1 つもありません*

i18n.ts は import を 1 つも持たない、ただの文字列の関数の集まりです。だから Node でも、ブラウザでも、そのまま動かせます（この章の記録もそうしています）。12〜14 行目の JSDoc は「base path のすぐあとの区切りを探し、**正しいロケールが無ければ空文字を返す**」と書き、22〜25 行目で `/base/en/page` から `en` が返る例を挙げます。

例のほうは本物と同じでした（下の表の 1 行目）。ところが `/base/page` を渡すと、返ったのは空文字ではなく `page` です。本体（[ロケールの選び方](../ssrx/07-ssrx-i18n-locale.md)の 2 節）は base path の長さだけ進んで次の `/` までを切り出すだけで、それがロケールかどうかは見ません。「正しいロケールか」は、呼ぶ側の AngularAppEngine が `entryPoints[切り出した文字列]` を引けるかどうかで決まります（6 節の 263〜265 行目）。

## 2. parseLanguageHeader・getPreferredLocale・normalizeLocale の約束

📄 `angular-cli/packages/angular/ssr/src/i18n.ts` L46–70 （▶ の行: 51–52, 58, 64–65, 67–68）

````ts
46 │ 
47 │ /**
48 │  * Parses the `Accept-Language` header and returns a list of locale preferences with their respective quality values.
49 │  *
50 │  * The `Accept-Language` header is typically a comma-separated list of locales, with optional quality values
51 ▶  * in the form of `q=<value>`. If no quality value is specified, a default quality of `1` is assumed.
52 ▶  * Special case: if the header is `*`, it returns the default locale with a quality of `1`.
53 │  *
54 │  * @param header - The value of the `Accept-Language` header, typically a comma-separated list of locales
55 │  *                  with optional quality values (e.g., `en-US;q=0.8,fr-FR;q=0.9`). If the header is `*`,
56 │  *                  it represents a wildcard for any language, returning the default locale.
57 │  *
58 ▶  * @returns A `ReadonlyMap` where the key is the locale (e.g., `en-US`, `fr-FR`), and the value is
59 │  *          the associated quality value (a number between 0 and 1). If no quality value is provided,
60 │  *          a default of `1` is used.
61 │  *
62 │  * @example
63 │  * ```js
64 ▶  * parseLanguageHeader('en-US;q=0.8,fr-FR;q=0.9')
65 ▶  * // returns new Map([['en-US', 0.8], ['fr-FR', 0.9]])
66 │ 
67 ▶  * parseLanguageHeader('*')
68 ▶  * // returns new Map([['*', 1]])
69 │  * ```
70 │  */
````

Accept-Language は、ブラウザが「読める言語」を `,` で並べ、`;q=` で 0〜1 の重み（q 値）を付けて送るヘッダーです。51 行目は「q 値が無ければ 1」、52 行目は「`*` だけなら**既定のロケール**を q 値 1 で返す」と書きます。しかし 67・68 行目の例と本物の答えは `Map [['*', 1]]` で、ロケールではありません。`*` を既定のロケール（対応ロケールの先頭）に変えるのは、次の getPreferredLocale の側です。

64・65 行目の例は `en-US` を先に、`fr-FR` をあとに書きます。本物の Map は `fr-FR`（0.9）が先でした。本体は q 値の大きい順に並べてから Map にするので（[ロケールの選び方](../ssrx/07-ssrx-i18n-locale.md)の 3 節）、Map の順は書いた順ではなく q 値の順です。getPreferredLocale はこの順に 1 つずつ見るので、順はそのまま答えに効きます。

📄 `angular-cli/packages/angular/ssr/src/i18n.ts` L92–108 （▶ の行: 97, 99–101, 107）

```ts
 92 │ 
 93 │ /**
 94 │  * Gets the preferred locale based on the highest quality value from the provided `Accept-Language` header
 95 │  * and the set of available locales.
 96 │  *
 97 ▶  * This function adheres to the HTTP `Accept-Language` header specification as defined in
 98 │  * [RFC 7231](https://datatracker.ietf.org/doc/html/rfc7231#section-5.3.5), including:
 99 ▶  * - Case-insensitive matching of language tags.
100 ▶  * - Quality value handling (e.g., `q=1`, `q=0.8`). If no quality value is provided, it defaults to `q=1`.
101 ▶  * - Prefix matching (e.g., `en` matching `en-US` or `en-GB`).
102 │  *
103 │  * @param header - The `Accept-Language` header string to parse and evaluate. It may contain multiple
104 │  *                 locales with optional quality values, for example: `'en-US;q=0.8,fr-FR;q=0.9'`.
105 │  * @param supportedLocales - An array of supported locales (e.g., `['en-US', 'fr-FR']`),
106 │  *                           representing the locales available in the application.
107 ▶  * @returns The best matching locale from the supported languages, or `undefined` if no match is found.
108 │  *
```

97 行目は RFC 7231（HTTP の決まり）の 5.3.5 節に従うと書き、99〜101 行目でその中身を 3 つ挙げます。大文字と小文字を区別しない比べ方、q 値の扱い、接頭辞の一致（`en` が `en-US` に当たる）です。107 行目は「一致が無ければ `undefined`」と書きますが、本物は一致が無くても q=0 で外されていない先頭を返します。この食い違いと、すぐ下の JSDoc の 3 つの例のうち 2 つが本物と違うことは[ロケールの選び方](../ssrx/07-ssrx-i18n-locale.md)の 4 節で確かめてあります。

📄 `angular-cli/packages/angular/ssr/src/i18n.ts` L186–202 （▶ の行: 196–197, 200–201）

````ts
186 │ }
187 │ 
188 │ /**
189 │  * Normalizes a locale string by converting it to lowercase.
190 │  *
191 │  * @param locale - The locale string to normalize.
192 │  * @returns The normalized locale string in lowercase.
193 │  *
194 │  * @example
195 │  * ```ts
196 ▶  * const normalized = normalizeLocale('EN-US');
197 ▶  * console.log(normalized); // Output: "en-us"
198 │  * ```
199 │  */
200 ▶ function normalizeLocale(locale: string): string {
201 ▶   return locale.toLowerCase();
202 │ }
````

99 行目の「大文字と小文字を区別しない」を担うのは、この 3 行の関数だけです。200・201 行目で `toLowerCase()` を呼びます。getPreferredLocale は、対応ロケールの名前もヘッダーの言語タグも、この関数で小文字にしてから比べます。返すのは元の書き方（対応ロケールの側）です。ブラウザが `FR-fr` を送っても `fr-FR` が返るのはこのためです（下のデモの「大文字」）。

> **🧪 DEMO — Accept-Language を本物の 2 つの関数に渡した記録（30 件）**
>
> Node で動かした記録の再生です。ページでは @angular/ssr を読みません。対応ロケールの組とヘッダーを選ぶと、parseLanguageHeader が返した Map（順も本物のまま）と、getPreferredLocale が返した値が出ます。「決め手」は、記録の Map と対応ロケールを見て分類したもので、分類の答えが本物の答えと違えば記録のスクリプトが止まるようにしてあります。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ssrl-i18n-url)

記録から読めることを 4 つ書きます。

- **「; の前後に空白」と「q と = の間に空白」は扱いが分かれます。**`en ; q=0.5` は q = 0.5 になり、`en;q = 0.5` は q = 1 になりました。空白を落とすのは `;` で切った両端だけで、`q=` で始まるかは空白を落としたあとの文字列で見るからです。
- **同じタグを 2 回書くと、位置は 1 回目、値は 2 回目です。**`en-US;q=0.9, en-US;q=0.1, ja;q=0.5` の Map は `en-US`（0.1）が先頭で、q 値の高い `ja`（0.5）より先に見られ、答えは `en-US` でした。
- **空の項目と空文字は、q = 1 の空の言語タグ `''` になります。**空の接頭辞はどの名前の先頭にも当たるので、`en,,fr` では `en` の接頭辞の一致が先に決まり、空文字だけのヘッダーでは対応ロケールの先頭が返りました。AngularAppEngine は空のヘッダーの代わりに `*` を渡します（6 節の redirectBasedOnAcceptLanguage の中。[ロケールの選び方](../ssrx/07-ssrx-i18n-locale.md)の 5 節）。
- **2 つの版で答えは全部同じでした。**i18n.ts は 44129f66a3 から 22.2.7 まで変わっていません（`git log 44129f66a3..v22.2.7 -- packages/angular/ssr/src/i18n.ts` は空）。

### JSDoc の例を本物に流した表

この章で読む行の JSDoc の例（と 1 節の「空文字」の約束）を、そのまま呼び出しにして 2 つの版で動かしました。12 行のうち、JSDoc と本物が食い違ったのは 2 行です。

| ファイルと行 | 呼び出し | JSDoc が書く答え | 44129f66a3 | 22.2.7 |
| --- | --- | --- | --- | --- |
| i18n.ts 22 | `getPotentialLocaleIdFromUrl(new URL('https://example.com/base/en/page'), "/base")` | 'en' | "en" | "en" |
| i18n.ts 14 | `getPotentialLocaleIdFromUrl(new URL('https://example.com/base/page'), "/base")` | ''（valid な locale が無ければ空文字、と 13・14 行目） | "page" | "page" |
| i18n.ts 64 | `parseLanguageHeader("en-US;q=0.8,fr-FR;q=0.9")` | new Map(\[\['en-US', 0.8\], \['fr-FR', 0.9\]\]) | Map \[\["fr-FR",0.9\],\["en-US",0.8\]\] | Map \[\["fr-FR",0.9\],\["en-US",0.8\]\] |
| i18n.ts 67 | `parseLanguageHeader("*")` | new Map(\[\['\*', 1\]\]) | Map \[\["\*",1\]\] | Map \[\["\*",1\]\] |
| i18n.ts 196 | `normalizeLocale("EN-US")` | 'en-us' | "en-us" | "en-us" |
| url.ts 17 | `stripTrailingSlash("path/")` | 'path' | "path" | "path" |
| url.ts 19 | `stripTrailingSlash("/")` | '/' | "/" | "/" |
| url.ts 55 | `addLeadingSlash("path")` | '/path' | "/path" | "/path" |
| url.ts 56 | `addLeadingSlash("/path")` | '/path' | "/path" | "/path" |
| url.ts 138 | `stripIndexHtmlFromURL(new URL('http://www.example.com/page/index.html'))` | 'http://www.example.com/page' | URL http://www.example.com/page | URL http://www.example.com/page |
| url.ts 176 | `buildPathWithParams("/*/details", "/123/abc")` | '/123/details' | "/123/details" | "/123/details"（buildUrlWithParams） |
| url.ts 180 | `buildPathWithParams("/static/path", "/base/unused")` | '/static/path' | "/static/path" | "/static/path"（buildUrlWithParams） |

## 3. url.ts の残り：先頭と末尾のスラッシュ、index.html、\* の置き換え

📄 `angular-cli/packages/angular/ssr/src/utils/url.ts` L1–25 （▶ の行: 17, 19–20, 25）

````ts
 1 │ /**
 2 │  * @license
 3 │  * Copyright Google LLC All Rights Reserved.
 4 │  *
 5 │  * Use of this source code is governed by an MIT-style license that can be
 6 │  * found in the LICENSE file at https://angular.dev/license
 7 │  */
 8 │ 
 9 │ /**
10 │  * Removes the trailing slash from a URL if it exists.
11 │  *
12 │  * @param url - The URL string from which to remove the trailing slash.
13 │  * @returns The URL string without a trailing slash.
14 │  *
15 │  * @example
16 │  * ```js
17 ▶  * stripTrailingSlash('path/'); // 'path'
18 │  * stripTrailingSlash('/path');  // '/path'
19 ▶  * stripTrailingSlash('/'); // '/'
20 ▶  * stripTrailingSlash(''); // ''
21 │  * ```
22 │  */
23 │ export function stripTrailingSlash(url: string): string {
24 │   // Check if the last character of the URL is a slash
25 ▶   return url.length > 1 && url.at(-1) === '/' ? url.slice(0, -1) : url;
````

url.ts も import を持ちません。25 行目は「長さが 2 文字以上で、最後が `/` なら 1 文字落とす」だけです。`url.length > 1` の条件があるので、19 行目の例の `/` は `/` のまま残ります（根の URL を空にしない）。落とすのは 1 文字だけなので、`/a//` は `/a/` になりました（下のデモ）。

📄 `angular-cli/packages/angular/ssr/src/utils/url.ts` L46–62 （▶ の行: 55–56, 59, 61）

````ts
46 │ 
47 │ /**
48 │  * Adds a leading slash to a URL if it does not already have one.
49 │  *
50 │  * @param url - The URL string to which the leading slash will be added.
51 │  * @returns The URL string with a leading slash.
52 │  *
53 │  * @example
54 │  * ```js
55 ▶  * addLeadingSlash('path'); // '/path'
56 ▶  * addLeadingSlash('/path'); // '/path'
57 │  * ```
58 │  */
59 ▶ export function addLeadingSlash(url: string): string {
60 │   // Check if the URL already starts with a slash
61 ▶   return url[0] === '/' ? url : `/${url}`;
62 │ }
````

61 行目は 1 文字目が `/` かだけを見ます。空文字の 1 文字目は `undefined` なので、`addLeadingSlash('')` は `/` です。この関数は joinUrlParts の最後の 1 行でも使われ、空の部品だけを渡したときに `/` が返る理由になっています（[prerender のパラメーター](../srt/02-srt-prerender-params.md)の章が読む行）。

📄 `angular-cli/packages/angular/ssr/src/utils/url.ts` L125–149 （▶ の行: 129–131, 144–145, 147）

````ts
125 │ 
126 │ /**
127 │  * Strips `/index.html` from the end of a URL's path, if present.
128 │  *
129 ▶  * This function is used to convert URLs pointing to an `index.html` file into their directory
130 ▶  * equivalents. For example, it transforms a URL like `http://www.example.com/page/index.html`
131 ▶  * into `http://www.example.com/page`.
132 │  *
133 │  * @param url - The URL object to process.
134 │  * @returns A new URL object with `/index.html` removed from the path, if it was present.
135 │  *
136 │  * @example
137 │  * ```typescript
138 │  * const originalUrl = new URL('http://www.example.com/page/index.html');
139 │  * const cleanedUrl = stripIndexHtmlFromURL(originalUrl);
140 │  * console.log(cleanedUrl.href); // Output: 'http://www.example.com/page'
141 │  * ```
142 │  */
143 │ export function stripIndexHtmlFromURL(url: URL): URL {
144 ▶   if (url.pathname.endsWith('/index.html')) {
145 ▶     const modifiedURL = new URL(url);
146 │     // Remove '/index.html' from the pathname
147 ▶     modifiedURL.pathname = modifiedURL.pathname.slice(0, /** '/index.html'.length */ -11);
148 │ 
149 │     return modifiedURL;
````

129〜131 行目が目的です。`/page/index.html` へのリクエストを、`/page` のルートとして描くために使います。144 行目は `endsWith('/index.html')` なので、`INDEX.HTML`（大文字）や `myindex.html` は落としません。145 行目で `new URL(url)` の写しを作ってから書き換えるので、渡した URL は変わりません。147 行目の `-11` は `'/index.html'.length`（11 文字）で、コメントにその式が書いてあります。根の `/index.html` は pathname が空になり、URL の決まりで `/` に戻ります。

📄 `angular-cli/packages/angular/ssr/src/utils/url.ts` L154–190 （▶ の行: 159–160, 171, 176–177, 185–186）

````ts
154 │ 
155 │ /**
156 │  * Resolves `*` placeholders in a path template by mapping them to corresponding segments
157 │  * from a base path. This is useful for constructing paths dynamically based on a given base path.
158 │  *
159 ▶  * The function processes the `toPath` string, replacing each `*` placeholder with
160 ▶  * the corresponding segment from the `fromPath`. If the `toPath` contains no placeholders,
161 │  * it is returned as-is. Invalid `toPath` formats (not starting with `/`) will throw an error.
162 │  *
163 │  * @param toPath - A path template string that may contain `*` placeholders. Each `*` is replaced
164 │  * by the corresponding segment from the `fromPath`. Static paths (e.g., `/static/path`) are returned
165 │  * directly without placeholder replacement.
166 │  * @param fromPath - A base path string, split into segments, that provides values for
167 │  * replacing `*` placeholders in the `toPath`.
168 │  * @returns A resolved path string with `*` placeholders replaced by segments from the `fromPath`,
169 │  * or the `toPath` returned unchanged if it contains no placeholders.
170 │  *
171 ▶  * @throws If the `toPath` does not start with a `/`, indicating an invalid path format.
172 │  *
173 │  * @example
174 │  * ```typescript
175 │  * // Example with placeholders resolved
176 ▶  * const resolvedPath = buildPathWithParams('/*\/details', '/123/abc');
177 ▶  * console.log(resolvedPath); // Outputs: '/123/details'
178 │  *
179 │  * // Example with a static path
180 │  * const staticPath = buildPathWithParams('/static/path', '/base/unused');
181 │  * console.log(staticPath); // Outputs: '/static/path'
182 │  * ```
183 │  */
184 │ export function buildPathWithParams(toPath: string, fromPath: string): string {
185 ▶   if (toPath[0] !== '/') {
186 ▶     throw new Error(`Invalid toPath: The string must start with a '/'. Received: '${toPath}'`);
187 │   }
188 │ 
189 │   if (fromPath[0] !== '/') {
190 │     throw new Error(`Invalid fromPath: The string must start with a '/'. Received: '${fromPath}'`);
````

リダイレクト先（`redirectTo`）の `*` を、実際に来たパスの同じ位置の区切りで置き換える関数です（使う側は[リダイレクトと URL の照合](../ssrx/06-ssrx-redirects.md)の章）。176 行目の例は `'/*\/details'` と `\` を挟んで書いてあります。JSDoc の中で `*/` と書くと、そこでコメントが閉じてしまうからです。実際に渡す文字列は `/*/details` で、答えは 177 行目のとおり `/123/details` でした。171 行目と 185・186 行目は「`/` で始まらなければ投げる」で、JSDoc は toPath の検査だけを書き、fromPath の検査（下のデモの最後の行）には触れていません。

22.2.7 では、この関数は `buildUrlWithParams` という名前に変わり、クエリの `:name` の置き換えも受け持つようになりました（main の 97ed36ec4f・8aa16b6f9f・92033cea10。22.2.x の枝には別のハッシュで入っています）。joinUrlParts も、最後の部品のクエリとハッシュの中のスラッシュを落とさないように変わっています（main の 194b64137e）。

> **🧪 DEMO — URL の小道具を 2 つの版で（39 件、違う答え 5 件）**
>
> 関数を選ぶと、入力と 2 つの版の答えが出ます。違う行は色が付きます。buildPathWithParams は 22.2.7 では buildUrlWithParams を呼んでいます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ssrl-i18n-url)

joinUrlParts の `'/base', 'page?x=1/'` は、44129f66a3 では `/base/page?x=1`（クエリの中の末尾の `/` が消える）、22.2.7 では `/base/page?x=1/` です。joinUrlParts は「部品の両端のスラッシュを落とす」関数なので、クエリやハッシュも部品の一部として削っていました。`'https://example.com', 'a'` が `/https://example.com/a` になるように、どちらの版も URL の形を理解してつなぐ関数ではありません。buildPathWithParams の `'/*/*', '/a'` は、44129f66a3 では来たパスの区切りが足りず `undefined` が joinUrlParts に渡って投げ、22.2.7 では `*` を残した `/a/*` を返しました。

## 4. ng.ts の残り：renderAngular と constructSerializedUrl の JSDoc

📄 `angular-cli/packages/angular/ssr/src/utils/ng.ts` L38–60 （▶ の行: 46, 48–52, 54, 57, 59）

```ts
38 │ 
39 │ /**
40 │  * Renders an Angular application or module to an HTML string.
41 │  *
42 │  * This function supports both Angular modules and bootstrap functions for application initialization.
43 │  *
44 │  * @param html - The initial HTML document content.
45 │  * @param bootstrap - An Angular module type or a function returning a promise that resolves to an `ApplicationRef`.
46 ▶  * @param url - The application URL, used for route-based rendering in SSR.
47 │  * @param platformProviders - An array of platform providers for the rendering process.
48 ▶  * @param serverContext - A string representing the server context, providing additional metadata for SSR.
49 ▶  * @returns A promise resolving to an object containing:
50 ▶  *          - `hasNavigationError`: Indicates if a navigation error occurred.
51 ▶  *          - `redirectTo`: (Optional) The redirect URL if a navigation redirect occurred.
52 ▶  *          - `content`: A function returning a promise that resolves to the rendered HTML string.
53 │  */
54 ▶ export async function renderAngular(
55 │   html: string,
56 │   bootstrap: AngularBootstrap,
57 ▶   url: URL,
58 │   platformProviders: StaticProvider[],
59 ▶   serverContext: string,
60 │ ): Promise<
```

renderAngular は、AngularServerApp が 1 つのページを描くときに呼ぶ関数です（本体は[AngularAppEngine](../platform/04-ssr-app-engine.md)と[マニフェストと描画](../srt/04-srt-manifest-render.md)の章）。49〜52 行目は返す値を 3 つ（`hasNavigationError`・`redirectTo`・`content`）と書きますが、すぐ下の戻り値の型には 4 つめの `destroy`（platform を壊す関数）があり、JSDoc はそれに触れていません。48 行目の serverContext は、描いた HTML の `ng-server-context` 属性になる文字列です。5 章の記録の prerender の HTML には `ng-server-context="ssg"` が入っています。

22.2.7 の renderAngular は 6 つめの引数 `signal` を取り、リクエストが中断されたら platform を壊すようになりました（main の 47bc9c3969、22.2.x の枝の f8f9f48bfa）。この変更と、それを入れた 22.2.6 で開いた issue #34754 は[最終回](06-ssrl-tests-issues.md)の表にあります。

📄 `angular-cli/packages/angular/ssr/src/utils/ng.ts` L199–226 （▶ の行: 203–204, 212–213, 217–218, 223, 226）

```ts
199 │ 
200 │ /**
201 │  * Constructs a normalized and serialized URL string from its components.
202 │  *
203 ▶  * This function uses the provided `Router` instance to parse and serialize the URL,
204 ▶  * ensuring that the resulting string is consistent with the router's configuration.
205 │  * It also handles the optional `prefix` parameter to ensure proper URL construction.
206 │  *
207 │  * @param router - The `Router` instance to use for parsing and serializing the URL.
208 │  * @param url - An object containing the URL components:
209 │  *   - `pathname`: The path of the URL.
210 │  *   - `search`: The query string of the URL (including '?').
211 │  *   - `hash`: The hash fragment of the URL (including '#').
212 ▶  * @param prefix - An optional prefix (e.g., `APP_BASE_HREF`) to prepend to the pathname
213 ▶  * if it is not already present.
214 │  * @returns The normalized and serialized URL string.
215 │  *
216 │  * @note
217 ▶  * We use the Angular `Router` to construct the URL, so that the URL is consistent with the router's configuration.
218 ▶  * This is important for the URL to be correctly parsed and serialized by the router as it might have different encodings.
219 │  */
220 │ function constructSerializedUrl(
221 │   router: Router,
222 │   url: { pathname: string; search: string; hash: string },
223 ▶   prefix?: string | null,
224 │ ): string {
225 │   const { pathname, hash, search } = url;
226 ▶   const urlParts: string[] = [];
```

リダイレクトの行き先や、描いたあとの URL を文字列にするとき、自分でつながずに Router の `parseUrl` と `serializeUrl` を通す関数です。217・218 行目がその理由で、「Router の設定によって URL の符号化（% の付け方）が違うことがあるので、Router に組み立てさせる」と書いています。212・213 行目の prefix は `APP_BASE_HREF` のような接頭辞で、pathname がまだそれで始まっていなければ前に足します。223 行目の型も `string | null` の省略可で、226 行目から部品を並べ始めます（本体の残りは[リダイレクトと URL の照合](../ssrx/06-ssrx-redirects.md)の章）。

## 5. manifest.ts：AngularAppEngine 用のマニフェストの置き場

📄 `angular-cli/packages/angular/ssr/src/manifest.ts` L179–210 （▶ の行: 184, 191–192, 202–205）

```ts
179 │ 
180 │ /**
181 │  * The Angular app engine manifest object.
182 │  * This is used internally to store the current Angular app engine manifest.
183 │  */
184 ▶ let angularAppEngineManifest: AngularAppEngineManifest | undefined;
185 │ 
186 │ /**
187 │  * Sets the Angular app engine manifest.
188 │  *
189 │  * @param manifest - The engine manifest object to set.
190 │  */
191 ▶ export function setAngularAppEngineManifest(manifest: AngularAppEngineManifest): void {
192 ▶   angularAppEngineManifest = manifest;
193 │ }
194 │ 
195 │ /**
196 │  * Gets the Angular app engine manifest.
197 │  *
198 │  * @returns The Angular app engine manifest.
199 │  * @throws Will throw an error if the Angular app engine manifest is not set.
200 │  */
201 │ export function getAngularAppEngineManifest(): AngularAppEngineManifest {
202 ▶   if (!angularAppEngineManifest) {
203 ▶     throw new Error(
204 ▶       'Angular app engine manifest is not set. ' +
205 ▶         `Please ensure you are using the '@angular/build:application' builder to build your server application.`,
206 │     );
207 │   }
208 │ 
209 │   return angularAppEngineManifest;
210 │ }
```

184 行目はモジュールの中の 1 つの変数で、191・192 行目の setter で入れ、201〜210 行目の getter で取り出します。入っていなければ 202〜205 行目で投げます。AngularServerApp 用の `angularAppManifest`（すぐ上の行）と同じ形で、2 つは別の変数です。

誰が入れるかは、ビルドの出力で確かめました。5 章のデモのアプリ（`outputMode: 'server'`）の `server/server.mjs` には、esbuild が足した `angular:ssr-entry-inject-manifest` という名前空間の塊が 2 つあり、1 つめで `import manifest from "./angular-app-engine-manifest.mjs"`、2 つめで `setAngularAppEngineManifest(manifest)` を、利用者の `src/server.ts` の塊より前に置いていました。だから server.ts の頭で `new AngularNodeAppEngine()` を呼んでも、マニフェストはもう入っています。

📄 `記録のスクリプト（rec-engine.mjs）`

```
// AngularAppEngine の静的なフラグと、マニフェストを置く前後（配布物 22.2.7）
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('~/angular-research/angular-deep-dive/package.json');
await import(require.resolve('@angular/compiler'));
const ssr = await import(require.resolve('@angular/ssr'));
const { AngularAppEngine } = ssr;
const out = { statics: { ɵallowStaticRouteRender: AngularAppEngine.ɵallowStaticRouteRender, ɵdisableAllowedHostsCheck: AngularAppEngine.ɵdisableAllowedHostsCheck, ɵhooks: AngularAppEngine.ɵhooks?.constructor?.name } };
try { new AngularAppEngine(); out.before = 'ok'; } catch (e) { out.before = e.message; }
ssr.ɵsetAngularAppEngineManifest({ basePath: '/', allowedHosts: [], supportedLocales: { 'fr': 'francais', 'en-US': '' }, entryPoints: { '': () => Promise.resolve({}), francais: () => Promise.resolve({}) } });
const e = new AngularAppEngine();
out.after = { supportedLocales: e['supportedLocales'], allowedHosts: [...e['allowedHosts']] };
writeFileSync(new URL('./rec-engine.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));

```

| マニフェストを入れる前の `new AngularAppEngine()` | 投げた：Angular app engine manifest is not set. Please ensure you are using the '@angular/build:application' builder to build your server application. |
| --- | --- |
| 入れたあとの supportedLocales | fr, en-US（マニフェストに書いた順） |
| 静的なフラグの既定 | ɵallowStaticRouteRender = false、ɵdisableAllowedHostsCheck = false、ɵhooks は Hooks のインスタンス |

投げたのは 6 節の 90 行目（フィールドの初期化）です。コンストラクタの本体より前に getter が走るので、`options` を何も渡さなくても、マニフェストが無ければ `new` の時点で止まります。

## 6. app-engine.ts の残り：静的なフラグとフィールド

📄 `angular-cli/packages/angular/ssr/src/app-engine.ts` L1–29 （▶ の行: 9, 11–14, 24, 28）

```ts
 1 │ /**
 2 │  * @license
 3 │  * Copyright Google LLC All Rights Reserved.
 4 │  *
 5 │  * Use of this source code is governed by an MIT-style license that can be
 6 │  * found in the LICENSE file at https://angular.dev/license
 7 │  */
 8 │ 
 9 ▶ import type { AngularServerApp, getOrCreateAngularServerApp } from './app';
10 │ import { Hooks } from './hooks';
11 ▶ import { getPotentialLocaleIdFromUrl, getPreferredLocale } from './i18n';
12 ▶ import { EntryPointExports, getAngularAppEngineManifest } from './manifest';
13 ▶ import { createRedirectResponse } from './utils/redirect';
14 ▶ import { joinUrlParts } from './utils/url';
15 │ import {
16 │   normalizeTrustProxyHeaders,
17 │   sanitizeRequestHeaders,
18 │   validateRequest,
19 │ } from './utils/validation';
20 │ 
21 │ /**
22 │  * Options for the Angular server application engine.
23 │  */
24 ▶ export interface AngularAppEngineOptions {
25 │   /**
26 │    * A set of allowed hostnames for the server application.
27 │    */
28 ▶   allowedHosts?: readonly string[];
29 │ 
```

9 行目は `import type` です。AngularServerApp のクラスは値として import せず、入口のモジュールが export する関数（6 節の 250〜265 行目のあたり）から受け取ります。11 行目が 1・2 節の 2 つの関数、12 行目が 5 節の getter、14 行目が 3 節の joinUrlParts です。24〜28 行目の AngularAppEngineOptions の `allowedHosts` の扱いは[ホストとヘッダーの検査](../ssrx/04-ssrx-host-validation.md)、その下の `trustProxyHeaders` は[プロキシのヘッダー](../ssrx/05-ssrx-proxy-headers.md)の章です。

📄 `angular-cli/packages/angular/ssr/src/app-engine.ts` L48–75 （▶ の行: 55–56, 60, 62–63, 65, 67）

```ts
48 │ }
49 │ 
50 │ /**
51 │  * Angular server application engine.
52 │  * Manages Angular server applications (including localized ones), handles rendering requests,
53 │  * and optionally transforms index HTML before rendering.
54 │  *
55 ▶  * @remarks This class should be instantiated once and used as a singleton across the server-side
56 ▶  * application to ensure consistent handling of rendering requests and resource management.
57 │  */
58 │ export class AngularAppEngine {
59 │   /**
60 ▶    * A flag to enable or disable the rendering of prerendered routes.
61 │    *
62 ▶    * Typically used during development to avoid prerendering all routes ahead of time,
63 ▶    * allowing them to be rendered on the fly as requested.
64 │    *
65 ▶    * @private
66 │    */
67 ▶   static ɵallowStaticRouteRender = false;
68 │ 
69 │   /**
70 │    * A flag to enable or disable the allowed hosts check.
71 │    *
72 │    * Typically used during development to avoid the allowed hosts check.
73 │    *
74 │    * @private
75 │    */
```

📄 `angular-cli/packages/angular/ssr/src/app-engine.ts` L77–103 （▶ の行: 80–81, 83, 85, 90, 100–101）

```ts
 77 │ 
 78 │   /**
 79 │    * Hooks for extending or modifying the behavior of the server application.
 80 ▶    * These hooks are used by the Angular CLI when running the development server and
 81 ▶    * provide extensibility points for the application lifecycle.
 82 │    *
 83 ▶    * @private
 84 │    */
 85 ▶   static ɵhooks: Hooks = /* #__PURE__*/ new Hooks();
 86 │ 
 87 │   /**
 88 │    * The manifest for the server application.
 89 │    */
 90 ▶   private readonly manifest = getAngularAppEngineManifest();
 91 │ 
 92 │   /**
 93 │    * A set of allowed hostnames for the server application.
 94 │    */
 95 │   private readonly allowedHosts: ReadonlySet<string>;
 96 │ 
 97 │   /**
 98 │    * A map of supported locales from the server application's manifest.
 99 │    */
100 ▶   private readonly supportedLocales: ReadonlyArray<string> = Object.keys(
101 ▶     this.manifest.supportedLocales,
102 │   );
103 │ 
```

55・56 行目は「アプリに 1 つだけ作る」ことを求めます。理由は、入口のキャッシュ（entryPointsCache の Map）がインスタンスごとに持たれるからです（[AngularAppEngine](../platform/04-ssr-app-engine.md)の 3 節）。

67 行目の `ɵallowStaticRouteRender`、すぐ下の `ɵdisableAllowedHostsCheck`、85 行目の `ɵhooks` は `static` です。つまり、インスタンスではなくクラスに 1 つで、65・83 行目の `@private` のとおり利用者が触るものではありません。立てるのは dev-server です。../angular-cli を grep すると、`packages/angular/build/src/tools/vite/middlewares/ssr-middleware.ts` の 1 か所で 3 つとも書き換え、`ɵhooks.on('html:transform:pre', …)` で Vite の HTML 変換を差し込んでいました（中身は[Vite の HMR と SSR](../vds/04-vds-hmr-ssr.md)の章）。62・63 行目のとおり、開発中は prerender のルートも、その場で描くためです。85 行目の `/* #__PURE__*/` は、使わなければ消してよいという、バンドラーへの印です。

prerender のワーカーはこのクラスを使わず、入口の関数に直接 `allowStaticRouteRender: true` を渡します（[次の章](05-ssrl-build-workers.md)の 2 節）。90 行目は 5 節の getter で、100・101 行目の supportedLocales は記録のとおりマニフェストのキーの順の配列です。

📄 `angular-cli/packages/angular/ssr/src/app-engine.ts` L137–160 （▶ の行: 144, 146–147, 152, 155–157）

```ts
137 │ 
138 │   /**
139 │    * Handles an incoming HTTP request by serving prerendered content, performing server-side rendering,
140 │    * or delivering a static file for client-side rendered routes based on the `RenderMode` setting.
141 │    *
142 │    * @param request - The HTTP request to handle.
143 │    * @param requestContext - Optional context for rendering, such as metadata associated with the request.
144 ▶    * @returns A promise that resolves to the resulting HTTP response object, or `null` if no matching Angular route is found.
145 │    *
146 ▶    * @remarks A request to `https://www.example.com/page/index.html` will serve or render the Angular route
147 ▶    * corresponding to `https://www.example.com/page`.
148 │    *
149 │    * @remarks
150 │    * To prevent potential Server-Side Request Forgery (SSRF), this function verifies the hostname
151 │    * of the `request.url` against a list of authorized hosts.
152 ▶    * If the hostname is not recognized a 400 Bad Request is returned.
153 │    *
154 │    * Resolution:
155 ▶    * Authorize your hostname by configuring `allowedHosts` in `angular.json` in:
156 ▶    * `projects.[project-name].architect.build.options.security.allowedHosts`.
157 ▶    * Alternatively, you pass it directly through the configuration options of `AngularAppEngine`.
158 │    *
159 │    * For more information see: https://angular.dev/best-practices/security#preventing-server-side-request-forgery-ssrf
160 │    */
```

handle の JSDoc です。146・147 行目の「`/page/index.html` は `/page` のルートとして」は 3 節の stripIndexHtmlFromURL が担います。144 行目の「一致するルートが無ければ `null`」は、Express などのあとの中間処理（ミドルウェア）に任せる合図です。152 行目の 400 と、155〜157 行目の直し方の案内（angular.json の `security.allowedHosts`）は[ホストとヘッダーの検査](../ssrx/04-ssrx-host-validation.md)の章の行に対応します。

📄 `angular-cli/packages/angular/ssr/src/app-engine.ts` L183–200 （▶ の行: 186, 189–190, 193, 196–197）

```ts
183 │ 
184 │   /**
185 │    * Handles requests for the base path when i18n is enabled.
186 ▶    * Redirects the user to a locale-specific path based on the `Accept-Language` header.
187 │    *
188 │    * @param request The incoming request.
189 ▶    * @returns A `Response` object with a 302 redirect, or `null` if i18n is not enabled
190 ▶    *          or the request is not for the base path.
191 │    */
192 │   private redirectBasedOnAcceptLanguage(request: Request): Response | null {
193 ▶     const { basePath, supportedLocales } = this.manifest;
194 │ 
195 │     // If the request is not for the base path, it's not our responsibility to handle it.
196 ▶     const { pathname } = new URL(request.url);
197 ▶     if (pathname !== basePath) {
198 │       return null;
199 │     }
200 │ 
```

186 行目で、ロケールの無い base path へのリクエストを Accept-Language でロケールへ飛ばすと書きます。189・190 行目の「i18n でなければ `null`」は、呼ぶ側の 1 行（ロケールが 2 つ以上のときだけ呼ぶ）で守られています。196・197 行目は pathname と base path を文字列のまま比べるので、`/base` と `/base/` は別物です（[ロケールの選び方](../ssrx/07-ssrx-i18n-locale.md)の 5 節の記録）。

📄 `angular-cli/packages/angular/ssr/src/app-engine.ts` L223–242 （▶ の行: 230, 237–240）

```ts
223 │   }
224 │ 
225 │   /**
226 │    * Retrieves the Angular server application instance for a given request.
227 │    *
228 │    * This method checks if the request URL corresponds to an Angular application entry point.
229 │    * If so, it initializes or retrieves an instance of the Angular server application for that entry point.
230 ▶    * Requests that resemble file requests (except for `/index.html`) are skipped.
231 │    *
232 │    * @param request - The incoming HTTP request object.
233 │    * @returns A promise that resolves to an `AngularServerApp` instance if a valid entry point is found,
234 │    * or `null` if no entry point matches the request URL.
235 │    */
236 │   private async getAngularServerAppForRequest(request: Request): Promise<AngularServerApp | null> {
237 ▶     // Skip if the request looks like a file but not `/index.html`.
238 ▶     const url = new URL(request.url);
239 ▶     const entryPoint = await this.getEntryPointExportsForUrl(url);
240 ▶     if (!entryPoint) {
241 │       return null;
242 │     }
```

230 行目は「ファイルらしいリクエスト（`/index.html` を除く）は飛ばす」と書き、237 行目のコメントも同じことを言います。けれど 238・239 行目は URL を作って入口を引くだけで、拡張子を見る行はこの関数にありません。ファイルらしいリクエストを `null` にしているのは、入口の先の AngularServerApp のルートの照合です（app-engine\_spec.ts の 282 行目の it「file-like resources」がそれを確かめています）。コメントは古い形の名残です。

📄 `angular-cli/packages/angular/ssr/src/app-engine.ts` L250–265 （▶ の行: 250–251, 260–261, 263–264）

```ts
250 ▶       allowStaticRouteRender: AngularAppEngine.ɵallowStaticRouteRender,
251 ▶       hooks: AngularAppEngine.ɵhooks,
252 │     });
253 │ 
254 │     return serverApp;
255 │   }
256 │ 
257 │   /**
258 │    * Retrieves the exports for a specific entry point, caching the result.
259 │    *
260 ▶    * @param potentialLocale - The locale string used to find the corresponding entry point.
261 ▶    * @returns A promise that resolves to the entry point exports or `undefined` if not found.
262 │    */
263 ▶   private getEntryPointExports(potentialLocale: string): Promise<EntryPointExports> | undefined {
264 ▶     const cachedEntryPoint = this.entryPointsCache.get(potentialLocale);
265 │     if (cachedEntryPoint) {
```

250・251 行目の 2 つのフラグは、ここで入口の関数に渡ります。260・261 行目の JSDoc は引数を `potentialLocale` と呼びますが、渡ってくるのは 1 節の関数が切り出した URL の区切りで、マニフェストの `entryPoints` のキー（ロケールの名前ではなく subPath）です。264 行目で、まず同じキーで覚えた Promise を探すので、2 回目からは入口のモジュールを読み直しません。

## 7. ここまでの呼び出し

- 👤 `new AngularNodeAppEngine()` — src/server.ts — *server.mjs の中で、マニフェストを入れた塊のあと*
  - `getAngularAppEngineManifest()` — manifest.ts 201 — *無ければ投げる（app-engine.ts 90 から）*
  - `Object.keys(manifest.supportedLocales)` — app-engine.ts 100 — *マニフェストのキーの順*
- 👤 `engine.handle(request)` — app-engine.ts の handle
  - `getPotentialLocaleIdFromUrl(url, basePath)` — i18n.ts 28 — *ロケールかどうかは見ない*
  - `getEntryPointExports(potentialLocale)` — app-engine.ts 263 — *キーは subPath*
    - `ɵgetOrCreateAngularServerApp({ allowStaticRouteRender, hooks })` — app-engine.ts 249〜252 — *静的なフラグはここで渡る*
      - `renderAngular(html, bootstrap, url, providers, serverContext)` — utils/ng.ts 54
        - `stripIndexHtmlFromURL(url)` — utils/url.ts 143 — */page/index.html → /page*
  - `redirectBasedOnAcceptLanguage(request)` — app-engine.ts 192 — *入口が無く、ロケールが 2 つ以上*
    - `getPreferredLocale(header || '*', supportedLocales)` — i18n.ts 121
      - `parseLanguageHeader(header)` → `normalizeLocale(locale)` — i18n.ts 71・200 — *q 値の順の Map、小文字で比べる*

## 8. 記録の取り方

22.2.7 の関数は、サイトの依存の `node_modules/@angular/ssr/fesm2022/ssr.mjs` から `function 名前(` で始まる宣言を波かっこの対応で切り出し、`new Function` でまとめて評価しました（export されていない parseLanguageHeader と normalizeLocale も、配布物の中の本物です）。44129f66a3 の関数は、../angular-cli の .ts をサイトの esbuild の `transform` で JS にし、export されていない 2 つを末尾で export して import しました。2026-11-19、Node v24.22.1 で動かしました。

📄 `記録のスクリプト（rec-i18n-url.mjs）`

```
// i18n.ts と utils/url.ts の関数を、2 つの版で本物のまま動かした記録。
// - 22.2.7: サイトの依存の node_modules/@angular/ssr/fesm2022/ssr.mjs から、関数の宣言をそのまま切り出して評価する
// - 44129f66a3: ../angular-cli の .ts を esbuild の transform で JS にして import する（export されていない関数は末尾で export を足す）
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = '~/angular-research/angular-deep-dive';
const CLI = '~/angular-research/angular-cli';
const require = createRequire(SITE + '/package.json');
const esbuild = require('esbuild');
await import(require.resolve('@angular/compiler'));
const { DefaultUrlSerializer } = await import(require.resolve('@angular/router'));

// ---- 22.2.7 ----
const fesm = readFileSync(require.resolve('@angular/ssr').replace(/ssr\.mjs$/, 'ssr.mjs'), 'utf8');
function cut(name) {
  const i = fesm.indexOf(`function ${name}(`);
  if (i < 0) throw new Error('not found ' + name);
  let j = fesm.indexOf('{', i), depth = 0;
  for (; j < fesm.length; j++) { if (fesm[j] === '{') depth++; else if (fesm[j] === '}' && --depth === 0) break; }
  return fesm.slice(i, j + 1);
}
const names22 = ['stripTrailingSlash', 'stripLeadingSlash', 'addLeadingSlash', 'addTrailingSlash', 'joinUrlParts', 'stripIndexHtmlFromURL', 'buildUrlWithParams', 'stripMatrixParams', 'getPotentialLocaleIdFromUrl', 'parseLanguageHeader', 'getPreferredLocale', 'normalizeLocale'];
const body22 = `let urlSerializer; const MATRIX_PARAMS_REGEX = /;[^/]+/g;\n${names22.map(cut).join('\n')}\nreturn { ${names22.join(', ')} };`;
const v22 = new Function('DefaultUrlSerializer', body22)(DefaultUrlSerializer);

// ---- 44129f66a3 ----
mkdirSync(path.join(HERE, 'gen'), { recursive: true });
async function fromSource(rel, extra) {
  const src = readFileSync(path.join(CLI, rel), 'utf8');
  const { code } = await esbuild.transform(src + '\n' + extra, { loader: 'ts', format: 'esm' });
  const f = path.join(HERE, 'gen', path.basename(rel).replace(/\.ts$/, '.mjs'));
  writeFileSync(f, code);
  return import(pathToFileURL(f).href);
}
const i18nOld = await fromSource('packages/angular/ssr/src/i18n.ts', 'export { parseLanguageHeader, normalizeLocale };');
const urlOld = await fromSource('packages/angular/ssr/src/utils/url.ts', '');
const vOld = { ...i18nOld, ...urlOld };

const show = (v) => {
  if (v instanceof Map) return 'Map ' + JSON.stringify([...v]);
  if (v instanceof URL) return 'URL ' + v.href;
  if (v === undefined) return 'undefined';
  return JSON.stringify(v);
};
const call = (impl, fn, args) => {
  try { return show(impl[fn](...args.map((a) => (typeof a === 'object' && a?.url ? new URL(a.url) : a)))); }
  catch (e) { return 'throw ' + e.message; }
};
const argText = (args) => args.map((a) => (typeof a === 'object' && a?.url ? `new URL('${a.url}')` : JSON.stringify(a))).join(', ');

// ---- A. JSDoc の例 ----
const docs = [
  ['i18n.ts', 22, 'getPotentialLocaleIdFromUrl', [{ url: 'https://example.com/base/en/page' }, '/base'], "'en'"],
  ['i18n.ts', 14, 'getPotentialLocaleIdFromUrl', [{ url: 'https://example.com/base/page' }, '/base'], "''（valid な locale が無ければ空文字、と 13・14 行目）"],
  ['i18n.ts', 64, 'parseLanguageHeader', ['en-US;q=0.8,fr-FR;q=0.9'], "new Map([['en-US', 0.8], ['fr-FR', 0.9]])"],
  ['i18n.ts', 67, 'parseLanguageHeader', ['*'], "new Map([['*', 1]])"],
  ['i18n.ts', 111, 'getPreferredLocale', ['en-US;q=0.8,fr-FR;q=0.9', ['en-US', 'fr-FR', 'de-DE']], "'fr-FR'"],
  ['i18n.ts', 114, 'getPreferredLocale', ['en;q=0.9,fr-FR;q=0.8', ['en-US', 'fr-FR', 'de-DE']], "'en-US'"],
  ['i18n.ts', 117, 'getPreferredLocale', ['es-ES;q=0.7', ['en-US', 'fr-FR', 'de-DE']], 'undefined'],
  ['i18n.ts', 196, 'normalizeLocale', ['EN-US'], "'en-us'"],
  ['url.ts', 17, 'stripTrailingSlash', ['path/'], "'path'"],
  ['url.ts', 19, 'stripTrailingSlash', ['/'], "'/'"],
  ['url.ts', 37, 'stripLeadingSlash', ['/path/'], "'path/'"],
  ['url.ts', 55, 'addLeadingSlash', ['path'], "'/path'"],
  ['url.ts', 56, 'addLeadingSlash', ['/path'], "'/path'"],
  ['url.ts', 72, 'addTrailingSlash', ['path'], "'path/'"],
  ['url.ts', 92, 'joinUrlParts', ['path/', '/to/resource'], "'/path/to/resource'"],
  ['url.ts', 94, 'joinUrlParts', ['', ''], "'/'"],
  ['url.ts', 138, 'stripIndexHtmlFromURL', [{ url: 'http://www.example.com/page/index.html' }], "'http://www.example.com/page'"],
  ['url.ts', 176, 'buildPathWithParams', ['/*/details', '/123/abc'], "'/123/details'"],
  ['url.ts', 180, 'buildPathWithParams', ['/static/path', '/base/unused'], "'/static/path'"],
  ['url.ts', 222, 'stripMatrixParams', ['/path;param=value/to;p=1/resource'], "'/path/to/resource'"],
];
const docRows = docs.map(([file, line, fn, args, claim]) => ({
  file, line, fn, call: `${fn}(${argText(args)})`, claim,
  old: call(vOld, fn, args),
  v22: fn === 'buildPathWithParams' ? call(v22, 'buildUrlWithParams', args) + '（buildUrlWithParams）' : call(v22, fn, args),
}));

// ---- B. Accept-Language ----
const SETS = { jsdoc: ['en-US', 'fr-FR', 'de-DE'], cjk: ['ja', 'zh-Hans', 'zh-Hant', 'en-US'] };
const HEADERS = [
  ['en-US;q=0.8,fr-FR;q=0.9', 'JSDoc の例'],
  ['fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5', 'ブラウザがよく送る形'],
  ['en ; q=0.5, fr', '; の前後に空白'],
  ['en;q = 0.5, fr;q=0.4', 'q と = の間に空白'],
  ['en;q=0.5;level=1, fr;q=0.6', '; の 3 つめ'],
  ['FR-fr', '大文字'],
  ['ja;q=1.5, en-US;q=-1, zh-Hans;q=0.9', '範囲の外の q'],
  ['en-US;q=0.9, en-US;q=0.1, ja;q=0.5', '同じタグを 2 回'],
  ['en,,fr', '空の項目'],
  ['', '空文字（AngularAppEngine は空なら * を渡す）'],
  ['*', '* だけ'],
  ['*;q=0.1, de-DE;q=0.2', '* に q'],
  ['de;q=0, *', 'q=0 と *'],
  ['zh-Hant-TW, zh;q=0.9', '3 つに区切ったタグ'],
  ['es-ES;q=0.7', '一致なし'],
];
const lang = [];
for (const [header, note] of HEADERS) for (const [setName, locales] of Object.entries(SETS)) {
  const parsed = [...v22.parseLanguageHeader(header)];
  const result = v22.getPreferredLocale(header, locales);
  const resultOld = vOld.getPreferredLocale(header, locales);
  // どの行で決まったか（記録を読んで分類する。分類の答えが本物の答えと違えば止める）
  const norm = new Map(locales.map((l) => [l.toLowerCase(), l]));
  let by, predicted;
  const nonZero = parsed.filter(([, q]) => q !== 0);
  const exact = nonZero.find(([l]) => norm.has(l.toLowerCase()));
  if (locales.length < 2) { by = '125-126'; predicted = locales[0]; }
  else if (parsed.length === 0 || (parsed.length === 1 && parsed[0][0] === '*')) { by = '135-136'; predicted = locales[0]; }
  else if (exact) { by = '157-158'; predicted = norm.get(exact[0].toLowerCase()); }
  else {
    let pm;
    for (const [l] of nonZero) { const p = l.toLowerCase().split('-', 1)[0]; const k = [...norm.keys()].find((s) => s.startsWith(p)); if (k) { pm = norm.get(k); break; } }
    if (pm) { by = '176-177'; predicted = pm; }
    else { const z = new Set(parsed.filter(([, q]) => q === 0).map(([l]) => l.toLowerCase())); predicted = [...norm].find(([n]) => !z.has(n))?.[1]; by = predicted ? '181-183' : '186'; }
  }
  if (predicted !== result) throw new Error(`分類と本物が違う: ${header} ${setName} ${predicted} ${result}`);
  lang.push({ header, note, set: setName, parsed, result: result ?? null, same: result === resultOld, by });
}

// ---- C. URL の小道具 ----
const URLS = [
  ['stripTrailingSlash', [['/a/'], ['/'], [''], ['//'], ['/a//']]],
  ['stripLeadingSlash', [['/a'], ['/'], ['//a']]],
  ['addLeadingSlash', [['a'], ['/a'], ['']]],
  ['addTrailingSlash', [['a'], ['a/'], ['']]],
  ['joinUrlParts', [['path/', '/to/resource'], ['', ''], ['/', 'fr'], ['//a//', '//b//'], ['/base', 'fr', ''], ['/base', 'page?x=1/'], ['/', 'about#top/'], ['/a?x=1', 'b'], ['https://example.com', 'a']]],
  ['stripIndexHtmlFromURL', [[{ url: 'http://x/page/index.html' }], [{ url: 'http://x/index.html' }], [{ url: 'http://x/page/index.html?q=1#h' }], [{ url: 'http://x/page/INDEX.HTML' }], [{ url: 'http://x/page/myindex.html' }], [{ url: 'http://x/page/index.html/' }]]],
  ['buildPathWithParams', [['/*/details', '/123/abc'], ['/*/*', '/a'], ['/x/*', '/a/b'], ['/*?q=1', '/a/b'], ['/user/*/edit#top', '/user/42'], ['details', '/a'], ['/a', 'b']]],
  ['stripMatrixParams', [['/a;p=1/b'], ['/a;p=1;q=2'], ['/a/b']]],
];
const urlRows = [];
for (const [fn, list] of URLS) for (const args of list) {
  const old = call(vOld, fn, args);
  const nw = fn === 'buildPathWithParams' ? call(v22, 'buildUrlWithParams', args) : call(v22, fn, args);
  urlRows.push({ fn, args: argText(args), old, v22: nw });
}
const out = { node: process.version, docRows, lang, sets: SETS, urlRows };
writeFileSync(path.join(HERE, 'rec-i18n-url.json'), JSON.stringify(out, null, 2));
for (const r of docRows) console.log(r.file, r.line, r.call, '| claim', r.claim, '| old', r.old, '| 22', r.v22);
console.log();
for (const r of lang) console.log(r.set, JSON.stringify(r.header), JSON.stringify(r.parsed), '→', r.result, r.by, r.same ? '' : 'DIFF');
console.log();
for (const r of urlRows) console.log(r.fn, r.args, '|', r.old, '|', r.v22, r.old === r.v22 ? '' : '  <<');

```

## テストと直し方

| spec | describe / it と行 | この章のどこ |
| --- | --- | --- |
| test/i18n\_spec.ts | describe getPotentialLocaleIdFromUrl（11 行目、8 件） | 1 節。basePath で始まらない URL や、ロケールでない区切りの it はありません |
| test/i18n\_spec.ts | describe getPreferredLocale（69 行目、12 件） | 2 節。大文字と小文字が混ざったヘッダーやロケールの it はありません |
| test/utils/url\_spec.ts | describe URL Utils（20 行目）の stripTrailingSlash 21・addLeadingSlash 57・stripIndexHtmlFromURL 117・buildPathWithParams 167 | 3 節 |
| test/app-engine\_spec.ts | describe Localized app with single locale（228 行目）、it should return null for requests to file-like resources in a locale（282 行目） | 6 節の 230・237 行目のコメント |

練習用の作業木（../angular-cli-fix から 44129f66a3 で作った別の場所）で `pnpm bazel test //packages/angular/ssr/test:test --nocache_test_results --test_output=all` を走らせると、249 specs, 0 failures でした。そのうえで、1 行ずつ変えて走らせ直し、落ちた it を数えました（毎回 `git checkout` で戻しています）。

| 変えた行 | 落ちた it |
| --- | --- |
| i18n.ts 201 行目の `toLowerCase()` をやめる | **0 件**（249 件とも通る） |
| i18n.ts の q 値の並べ替えをやめる | 2 件（getPreferredLocale の 70 行目と 125 行目の it） |
| url.ts 147 行目の `-11` を `-10` に | 5 件（stripIndexHtmlFromURL の 5 つの it。app\_spec と app-engine\_spec の index.html の it は落ちない） |
| app-engine.ts の getEntryPointExportsForUrl から「ロケールが 1 つなら URL を見ない」近道を消す | 0 件。single locale の describe（228 行目）の 7 件は、近道を消しても 7 件とも通りました |

1 行目が示すとおり、99 行目の「大文字と小文字を区別しない」は、spec では固められていません。固めるなら、i18n\_spec.ts の describe getPreferredLocale に、`getPreferredLocale('FR-fr', ['en-US', 'fr-FR'])` が `'fr-FR'`（元の書き方）を返す it を 1 つ足すのが一番小さい形です。JSDoc のほうを本物に合わせるなら、直すのは i18n.ts の 13・14 行目（空文字の約束）、52 行目（`*` の説明）、64・65 行目（Map の順）です。

## 聞かれそうな質問

**Q. Accept-Language で `FR-fr` が来たら、`fr-FR` のロケールに当たりますか？**

当たります。比べる前に両方を 200・201 行目の normalizeLocale で小文字にし、返すのは対応ロケールの元の書き方です。記録でも `fr-FR` でした。ただし spec にこの it は無く、`toLowerCase()` を消しても 249 件とも通りました。

**Q. getPotentialLocaleIdFromUrl はロケールでない区切りに空文字を返しますか？**

返しません。13・14 行目の JSDoc は空文字と書きますが、`/base/page` には `page` が返りました。ロケールかどうかは、呼ぶ側が entryPoints を引けるか（263〜265 行目）で決まります。

**Q. stripIndexHtmlFromURL は渡した URL を書き換えますか？**

書き換えません。145 行目で `new URL(url)` の写しを作り、その pathname を 147 行目で 11 文字短くします。`/index.html` で終わらなければ、渡した URL そのものを返します。

**Q. ɵallowStaticRouteRender は誰が true にしますか？**

dev-server の ssr-middleware.ts です（62・63 行目の「開発中に prerender のルートもその場で描く」）。67 行目の static なので、クラスに 1 つです。prerender のワーカーは AngularAppEngine を通らず、入口の関数に `allowStaticRouteRender: true` を直接渡します。

**Q. server.ts の頭で `new AngularNodeAppEngine()` を呼んで、マニフェストが間に合うのはなぜですか？**

ビルドが server.mjs の中で、server.ts より前に `setAngularAppEngineManifest(manifest)` の塊を置くからです（5 節の記録）。マニフェストが無ければ 90 行目の初期化で、202〜205 行目の文で投げます。

## 読み終えて

- i18n.ts と url.ts は import の無い文字列の関数で、Node でそのまま動かして JSDoc の例を確かめられる。
- JSDoc と本物は、空文字の約束（13・14 行目）、`*` の説明（52 行目）、Map の順（64・65 行目）、`destroy` の書き漏れ（ng.ts 49〜52 行目）、ファイルを飛ばすコメント（230・237 行目）で食い違う。
- 大文字と小文字を区別しない比べ方（normalizeLocale）は、spec で固められていない。
- url.ts は 44129f66a3 のあとに変わり、22.2.7 では joinUrlParts がクエリとハッシュのスラッシュを残し、buildPathWithParams は buildUrlWithParams になった。
- AngularAppEngine の 3 つの static なフラグは dev-server が立て、マニフェストはビルドが server.mjs の中で先に入れる。

---

← 前: [CommonEngine の残りと性能の記録：enablePerformanceProfiler が測るもの](03-ssrl-common-engine.md)  
次: [ビルド側のワーカー：ルートの取り出し・prerender の描画・サーバーの起動・fetch の差し替え](05-ssrl-build-workers.md) →
