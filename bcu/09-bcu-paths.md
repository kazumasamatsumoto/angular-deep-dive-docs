[目次](../README.md) › [@angular/build の compilation と utils の読み残し](README.md) › 第 9 回 / 全 10 回

# パス・URL・ソースマップ・版の小道具：path・url・source-map・hash・version

> utils の path.ts・url.ts・source-map.ts・hash.ts・version.ts の未読の行：POSIX への正規化と中かの判定、URL の前後の / と結合、ソースマップのコメントの検出・削除・読み込み、xxHash、Angular の版の検査。

angular/angular-cli · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-paths)

---

ビルダーのあちこちで使う小さな関数が、utils の 5 つのファイルにまとまっています。Windows のパスを `/` にそろえる、フォルダの中かを調べる、URL をつなぐ、JavaScript の末尾の `//# sourceMappingURL=` を探して消す・その先のソースマップを読む、xxHash でハッシュを取る、Angular の版がビルダーに合うかを調べる、の 6 つです。この章では、この 5 つのファイルを全部読み、**境目の入力（空文字・`..`・正規表現の中の引用符・版の番号の前後）でどう振る舞うか**を、本物の関数に当てた記録で確かめます。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/utils/` の `path.ts`・`url.ts`・`source-map.ts`・`hash.ts`・`version.ts` です。ソースマップのコメントを JavaScriptTransformer がどこで切るか（と、使わない設定でコメントが戻る重なり）は [JavaScriptTransformer の章](../esb/02-esb-js-transformer.md)、`calculateHash`（36〜48 行目）を使うキャッシュの鍵は [キャッシュの章](../abl/04-abl-cache.md)で読みました。22.2.7 では `source-map.ts` だけが変わっていて（4 節）、デモではその違いを 2 つの版で並べます。

1. [1. AotCompilation の残り](01-bcu-aot.md)
2. [2. ParallelCompilation](02-bcu-parallel.md)
3. [3. hmr-candidates](03-bcu-hmr.md)
4. [4. AngularHost と遅延ルート](04-bcu-host.md)
5. [5. 予算と出力の表](05-bcu-budget.md)
6. [6. index.html の仕上げ](06-bcu-index.md)
7. [7. 自動 CSP](07-bcu-auto-csp.md)
8. [8. オプションの小道具](08-bcu-options.md)
9. **9. パス・URL・ソースマップ**（この章）
10. [10. spec と issue](10-bcu-tests-issues.md)

## 1. path.ts：POSIX にそろえる、中かを調べる

📄 `angular-cli/packages/angular/build/src/utils/path.ts` L9–37 （▶ の行: 10, 12, 35–36）

````ts
 9 │ import { isAbsolute, posix, relative, resolve } from 'node:path';
10 ▶ import { platform } from 'node:process';
11 │ 
12 ▶ const WINDOWS_PATH_SEPERATOR_REGEXP = /\\/g;
13 │ 
14 │ /**
15 │  * Converts a Windows-style file path to a POSIX-compliant path.
16 │  *
17 │  * This function replaces all backslashes (`\`) with forward slashes (`/`).
18 │  * It is a no-op on POSIX systems (e.g., Linux, macOS), as the conversion
19 │  * only runs on Windows (`win32`).
20 │  *
21 │  * @param path - The file path to convert.
22 │  * @returns The POSIX-compliant file path.
23 │  *
24 │  * @example
25 │  * ```ts
26 │  * // On a Windows system:
27 │  * toPosixPath('C:\\Users\\Test\\file.txt');
28 │  * // => 'C:/Users/Test/file.txt'
29 │  *
30 │  * // On a POSIX system (Linux/macOS):
31 │  * toPosixPath('/home/user/file.txt');
32 │  * // => '/home/user/file.txt'
33 │  * ```
34 │  */
35 ▶ export function toPosixPath(path: string): string {
36 ▶   return platform === 'win32' ? path.replace(WINDOWS_PATH_SEPERATOR_REGEXP, posix.sep) : path;
37 │ }
````

📄 `angular-cli/packages/angular/build/src/utils/path.ts` L39–66 （▶ の行: 46–49, 51, 60–62）

```ts
39 │ /**
40 │  * Determines if a path is a subdirectory or file within a parent directory.
41 │  *
42 │  * @param parent - The parent directory path.
43 │  * @param child - The child path to check.
44 │  * @returns `true` if the child path is within the parent directory, `false` otherwise.
45 │  */
46 ▶ export function isSubDirectory(parent: string, child: string): boolean {
47 ▶   const resolvedParent = resolve(parent);
48 ▶   const resolvedChild = resolve(parent, child);
49 ▶   const relativePath = toPosixPath(relative(resolvedParent, resolvedChild));
50 │ 
51 ▶   return relativePath !== '..' && !relativePath.startsWith('../') && !isAbsolute(relativePath);
52 │ }
53 │ 
54 │ /**
55 │  * Canonicalizes a file path by normalising Windows drive-letter casing to uppercase.
56 │  *
57 │  * @param pathString - The file path to canonicalize.
58 │  * @returns The canonicalized file path.
59 │  */
60 ▶ export function canonicalizePath(pathString: string): string {
61 ▶   if (platform === 'win32' && /^[a-z]:/.test(pathString)) {
62 ▶     return pathString[0].toUpperCase() + pathString.slice(1);
63 │   }
64 │ 
65 │   return pathString;
66 │ }
```

1. **toPosixPath**

   36 行目。`win32` のときだけ `\` を全部 `/` にし、それ以外は何もしません（cad1642643）。macOS で呼んでも変わらないので、デモは `process.platform` を `win32` に見せかけた子プロセスでも呼びました。
2. **isSubDirectory**

   47〜51 行目。child は parent を基準に解決し（48 行目、相対のパスも渡せる）、そこからの相対パスが `..` か `../` で始まるか、絶対パス（Windows で別のドライブ）なら外です（163a03264b）。文字の頭が同じだけの `/ws-other` は外、名前が `..` で始まるだけの `/ws/..foo` は中になります。[前の章](08-bcu-options.md)の assets の `startsWith` を直すのに、新しい本家はこの関数を使いました。
3. **canonicalizePath**

   61〜62 行目。Windows でドライブ文字が小文字なら大文字にします（4187e5e277）。`c:/work` と `C:/work` を同じワークスペースとして扱うためです。

## 2. url.ts：前後の / と、URL をつなぐ

📄 `angular-cli/packages/angular/build/src/utils/url.ts` L9–26 （▶ の行: 23, 25）

````ts
 9 │ /**
10 │  * Removes the trailing slash from a URL if it exists.
11 │  *
12 │  * @param url - The URL string from which to remove the trailing slash.
13 │  * @returns The URL string without a trailing slash.
14 │  *
15 │  * @example
16 │  * ```js
17 │  * stripTrailingSlash('path/'); // 'path'
18 │  * stripTrailingSlash('/path');  // '/path'
19 │  * stripTrailingSlash('/'); // '/'
20 │  * stripTrailingSlash(''); // ''
21 │  * ```
22 │  */
23 ▶ export function stripTrailingSlash(url: string): string {
24 │   // Check if the last character of the URL is a slash
25 ▶   return url.length > 1 && url.at(-1) === '/' ? url.slice(0, -1) : url;
26 │ }
````

📄 `angular-cli/packages/angular/build/src/utils/url.ts` L28–45 （▶ の行: 42, 44）

````ts
28 │ /**
29 │  * Removes the leading slash from a URL if it exists.
30 │  *
31 │  * @param url - The URL string from which to remove the leading slash.
32 │  * @returns The URL string without a leading slash.
33 │  *
34 │  * @example
35 │  * ```js
36 │  * stripLeadingSlash('/path'); // 'path'
37 │  * stripLeadingSlash('/path/');  // 'path/'
38 │  * stripLeadingSlash('/'); // '/'
39 │  * stripLeadingSlash(''); // ''
40 │  * ```
41 │  */
42 ▶ export function stripLeadingSlash(url: string): string {
43 │   // Check if the first character of the URL is a slash
44 ▶   return url.length > 1 && url[0] === '/' ? url.slice(1) : url;
45 │ }
````

📄 `angular-cli/packages/angular/build/src/utils/url.ts` L47–79 （▶ の行: 59, 61, 76, 78）

````ts
47 │ /**
48 │  * Adds a leading slash to a URL if it does not already have one.
49 │  *
50 │  * @param url - The URL string to which the leading slash will be added.
51 │  * @returns The URL string with a leading slash.
52 │  *
53 │  * @example
54 │  * ```js
55 │  * addLeadingSlash('path'); // '/path'
56 │  * addLeadingSlash('/path'); // '/path'
57 │  * ```
58 │  */
59 ▶ export function addLeadingSlash(url: string): string {
60 │   // Check if the URL already starts with a slash
61 ▶   return url[0] === '/' ? url : `/${url}`;
62 │ }
63 │ 
64 │ /**
65 │  * Adds a trailing slash to a URL if it does not already have one.
66 │  *
67 │  * @param url - The URL string to which the trailing slash will be added.
68 │  * @returns The URL string with a trailing slash.
69 │  *
70 │  * @example
71 │  * ```js
72 │  * addTrailingSlash('path'); // 'path/'
73 │  * addTrailingSlash('path/'); // 'path/'
74 │  * ```
75 │  */
76 ▶ export function addTrailingSlash(url: string): string {
77 │   // Check if the URL already end with a slash
78 ▶   return url.at(-1) === '/' ? url : `${url}/`;
79 │ }
````

25・44 行目、外すのは 1 文字だけで、長さが 1 の `/` は残します。`a//` は `a/`、`//a` は `/a` です。61・78 行目、付ける方は空文字にも付けるので、どちらも `/` になります。

📄 `angular-cli/packages/angular/build/src/utils/url.ts` L81–97 （▶ の行: 92, 94–95）

````ts
81 │ /**
82 │  * Joins URL parts into a single URL string.
83 │  *
84 │  * This function takes multiple URL segments, normalizes them by removing leading
85 │  * and trailing slashes where appropriate, and then joins them into a single URL.
86 │  *
87 │  * @param parts - The parts of the URL to join. Each part can be a string with or without slashes.
88 │  * @returns The joined URL string, with normalized slashes.
89 │  *
90 │  * @example
91 │  * ```js
92 ▶  * joinUrlParts('path/', '/to/resource'); // '/path/to/resource'
93 │  * joinUrlParts('/path/', 'to/resource'); // '/path/to/resource'
94 ▶  * joinUrlParts('http://localhost/path/', 'to/resource'); // 'http://localhost/path/to/resource'
95 ▶  * joinUrlParts('', ''); // '/'
96 │  * ```
97 │  */
````

📄 `angular-cli/packages/angular/build/src/utils/url.ts` L98–122 （▶ の行: 101, 103, 107–108, 110–111, 113–114, 118–119, 121）

```ts
 98 │ export function joinUrlParts(...parts: string[]): string {
 99 │   const normalizeParts: string[] = [];
100 │   for (const part of parts) {
101 ▶     if (part === '') {
102 │       // Skip any empty parts
103 ▶       continue;
104 │     }
105 │ 
106 │     let normalizedPart = part;
107 ▶     if (part[0] === '/') {
108 ▶       normalizedPart = normalizedPart.slice(1);
109 │     }
110 ▶     if (part.at(-1) === '/') {
111 ▶       normalizedPart = normalizedPart.slice(0, -1);
112 │     }
113 ▶     if (normalizedPart !== '') {
114 ▶       normalizeParts.push(normalizedPart);
115 │     }
116 │   }
117 │ 
118 ▶   const protocolMatch = normalizeParts.length && /^https?:\/\//.test(normalizeParts[0]);
119 ▶   const joinedParts = normalizeParts.join('/');
120 │ 
121 ▶   return protocolMatch ? joinedParts : addLeadingSlash(joinedParts);
122 │ }
```

1. **空の部分を飛ばす**

   101〜104 行目。`joinUrlParts('/base/', '', '/fr/')` は `/base/fr` です。
2. **前後の / を 1 つずつ外す**

   107〜112 行目。外したあと空になった部分も 113 行目で捨てます。2 つ以上重なった `/` は 1 つしか外さないので、`'/a//', '//b'` は `/a///b` です。
3. **/ でつなぎ、頭に / を付ける**

   119〜121 行目。最初の部分が `http://` か `https://` で始まるときだけ、頭に `/` を付けません（0fe572ed71、プリレンダーのルートの URL を正しく作るため）。118 行目の正規表現は小文字だけなので、`HTTPS://…` は `/HTTPS://…` になりました。

呼ぶのは、[i18n の章](../cli/09-cli-i18n.md)のロケールごとの baseHref（builders/application/options.ts）、プリレンダーとサーバーのマニフェスト、Vite のミドルウェアです。

## 3. source-map.ts：末尾のコメントを、デコードせずに探す

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L9–16 （▶ の行: 9, 14–15）

```ts
 9 ▶ import type { EncodedSourceMap } from '@ampproject/remapping';
10 │ import { existsSync, readFileSync } from 'node:fs';
11 │ import { dirname, resolve } from 'node:path';
12 │ import { fileURLToPath } from 'node:url';
13 │ 
14 ▶ export const SOURCEMAP_COMMENT_PREFIX = '//# sourceMappingURL=';
15 ▶ export const SOURCEMAP_COMMENT_BYTES = Buffer.from(SOURCEMAP_COMMENT_PREFIX);
16 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L17–41 （▶ の行: 24, 27–29, 31–33, 36, 38–39）

```ts
17 │ /**
18 │  * Checks for a single trailing `//# sourceMappingURL=` comment on a raw buffer.
19 │  *
20 │  * @param data The raw byte buffer to inspect.
21 │  * @returns An object containing the sliced code buffer and URL snippet if a single trailing comment exists,
22 │  *          `null` if no sourcemap comment exists in the buffer, or `undefined` if multiple/non-trailing comments exist.
23 │  */
24 ▶ export function findTrailingSourceMapComment(
25 │   data: Uint8Array,
26 │ ): { code: Uint8Array; urlLine: string } | null | undefined {
27 ▶   const dataBuffer = Buffer.isBuffer(data)
28 ▶     ? data
29 ▶     : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
30 │ 
31 ▶   const firstIndex = dataBuffer.indexOf(SOURCEMAP_COMMENT_BYTES);
32 ▶   if (firstIndex === -1) {
33 ▶     return null;
34 │   }
35 │ 
36 ▶   const lastIndex = dataBuffer.lastIndexOf(SOURCEMAP_COMMENT_BYTES);
37 │   // Skip any preceding horizontal whitespace (spaces/tabs) to find the start of the line.
38 ▶   let prevIdx = lastIndex - 1;
39 ▶   while (prevIdx >= 0 && (dataBuffer[prevIdx] === 32 || dataBuffer[prevIdx] === 9)) {
40 │     prevIdx--;
41 │   }
```

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L42–58 （▶ の行: 44, 46–48, 51–53, 57）

```ts
42 │   // Ensure the comment starts at the beginning of a line or the start of the file,
43 │   // preventing false positives for occurrences inside inline string literals or code.
44 ▶   const isLineStart = prevIdx < 0 || dataBuffer[prevIdx] === 10 || dataBuffer[prevIdx] === 13;
45 │ 
46 ▶   if (firstIndex === lastIndex && isLineStart) {
47 ▶     const urlLine = dataBuffer
48 ▶       .subarray(lastIndex + SOURCEMAP_COMMENT_BYTES.length)
49 │       .toString('utf-8');
50 │ 
51 ▶     return {
52 ▶       code: dataBuffer.subarray(0, prevIdx < 0 ? 0 : prevIdx + 1),
53 ▶       urlLine,
54 │     };
55 │   }
56 │ 
57 ▶   return undefined;
58 │ }
```

1. **Buffer の窓**

   27〜29 行目。Uint8Array なら、同じメモリを指す Buffer を作るだけで写しません。15 行目の `SOURCEMAP_COMMENT_BYTES` を、そのバイト列のまま探します（5ee54207e2）。
2. **無ければ null**

   31〜34 行目。
3. **最後の 1 つが行の頭か**

   36〜44 行目。最後の出現の前の空白とタブを飛ばし、改行かファイルの頭なら行の頭です。
4. **1 つだけで行の頭なら、切った物**

   46〜55 行目。`code` はコメントの行の前まで、`urlLine` はコメントの後ろの文字列です。それ以外（2 つ以上か、行の途中）は 57 行目で `undefined` で、呼ぶ側に「全部を見てくれ」と伝えます。

3 つの戻り値の使い分けは、[JavaScriptTransformer の章](../esb/02-esb-js-transformer.md)の 7 節の表のとおりです。

## 4. removeSourceMappingURL と、文字を 1 つずつ読む状態機械

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L60–94 （▶ の行: 72–74, 77–78, 82–83, 86, 90–91, 93）

```ts
60 │ /**
61 │  * Removes `//# sourceMappingURL=` comments safely from the given JavaScript code,
62 │  * ignoring any occurrences that are inside string literals, template literals, or block comments.
63 │  *
64 │  * For raw Uint8Array / Buffer inputs, it optimizes performance by inspecting trailing byte sequences
65 │  * to slice the buffer directly without full string decoding.
66 │  *
67 │  * @param code The JavaScript source code as a string or Uint8Array.
68 │  * @returns The code with top-level sourcemap comments removed.
69 │  */
70 │ export function removeSourceMappingURL(code: string): string;
71 │ export function removeSourceMappingURL(code: Uint8Array): Uint8Array;
72 ▶ export function removeSourceMappingURL(code: string | Uint8Array): string | Uint8Array {
73 ▶   if (typeof code === 'string') {
74 ▶     return removeSourceMappingURLFromString(code);
75 │   }
76 │ 
77 ▶   const trailing = findTrailingSourceMapComment(code);
78 ▶   if (trailing === null) {
79 │     return code;
80 │   }
81 │ 
82 ▶   if (trailing && isTrailingSourceMapComment(trailing.urlLine)) {
83 ▶     return trailing.code;
84 │   }
85 │ 
86 ▶   // Fallback to full decode and state-machine stripping for multiple comments or non-trailing comments
87 │   const dataBuffer = Buffer.isBuffer(code)
88 │     ? code
89 │     : Buffer.from(code.buffer, code.byteOffset, code.byteLength);
90 ▶   const text = dataBuffer.toString('utf-8');
91 ▶   const stripped = removeSourceMappingURLFromString(text);
92 │ 
93 ▶   return stripped === text ? code : Buffer.from(stripped, 'utf-8');
94 │ }
```

バイト列なら 77〜84 行目で 3 節の速い道を通り、末尾の 1 つが 6 節の `isTrailingSourceMapComment` にも当たれば、切った物を返します（1c00edce02）。それ以外と、文字列で来たときは、96 行目からの状態機械です。93 行目、何も変わらなければ受け取ったバイト列そのものを返します。

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L96–121 （▶ の行: 97–98, 107–109, 117–118）

```ts
 96 │ function removeSourceMappingURLFromString(code: string): string {
 97 ▶   if (!code.includes(SOURCEMAP_COMMENT_PREFIX)) {
 98 ▶     return code;
 99 │   }
100 │ 
101 │   const result: string[] = [];
102 │   let lastCopiedIndex = 0;
103 │   let i = 0;
104 │   const len = code.length;
105 │ 
106 │   // Stack to track template literal state and curly brace depth for nested interpolations.
107 ▶   const stack: { type: 'template'; braceDepth: number }[] = [];
108 ▶   let currentState:
109 ▶     'normal' | 'string_double' | 'string_single' | 'template' | 'comment_block' | 'comment_line' =
110 │     'normal';
111 │ 
112 │   while (i < len) {
113 │     const char = code[i];
114 │     const nextChar = code[i + 1];
115 │ 
116 │     if (currentState === 'normal') {
117 ▶       if (char === '/' && nextChar === '*') {
118 ▶         currentState = 'comment_block';
119 │         i += 2;
120 │         continue;
121 │       }
```

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L122–156 （▶ の行: 122, 124, 126, 129, 135–136, 140, 142, 145–146, 149, 152）

```ts
122 ▶       if (char === '/' && nextChar === '/') {
123 │         // Detect if the comment is escaped (e.g. inside a regex literal like `/\/\/#/`).
124 ▶         let isEscaped = false;
125 │         let prevIdx = i - 1;
126 ▶         while (prevIdx >= 0 && /\s/.test(code[prevIdx])) {
127 │           prevIdx--;
128 │         }
129 ▶         if (prevIdx >= 0 && code[prevIdx] === '\\') {
130 │           let bsCount = 0;
131 │           while (prevIdx >= 0 && code[prevIdx] === '\\') {
132 │             bsCount++;
133 │             prevIdx--;
134 │           }
135 ▶           if (bsCount % 2 === 1) {
136 ▶             isEscaped = true;
137 │           }
138 │         }
139 │ 
140 ▶         if (!isEscaped && code.startsWith(SOURCEMAP_COMMENT_PREFIX, i)) {
141 │           if (i > lastCopiedIndex) {
142 ▶             result.push(code.slice(lastCopiedIndex, i));
143 │           }
144 │           // Skip the rest of the comment line up to the newline
145 ▶           i += SOURCEMAP_COMMENT_PREFIX.length;
146 ▶           while (i < len && code[i] !== '\n' && code[i] !== '\r') {
147 │             i++;
148 │           }
149 ▶           lastCopiedIndex = i;
150 │           continue;
151 │         } else {
152 ▶           currentState = 'comment_line';
153 │           i += 2;
154 │           continue;
155 │         }
156 │       }
```

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L157–180 （▶ の行: 157–158, 162, 167, 169, 173, 176）

```ts
157 ▶       if (char === '"') {
158 ▶         currentState = 'string_double';
159 │         i++;
160 │         continue;
161 │       }
162 ▶       if (char === "'") {
163 │         currentState = 'string_single';
164 │         i++;
165 │         continue;
166 │       }
167 ▶       if (char === '`') {
168 │         currentState = 'template';
169 ▶         stack.push({ type: 'template', braceDepth: 0 });
170 │         i++;
171 │         continue;
172 │       }
173 ▶       if (char === '{') {
174 │         const top = stack[stack.length - 1];
175 │         if (top) {
176 ▶           top.braceDepth++;
177 │         }
178 │         i++;
179 │         continue;
180 │       }
```

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L181–197 （▶ の行: 181, 184–185, 187–188）

```ts
181 ▶       if (char === '}') {
182 │         const top = stack[stack.length - 1];
183 │         if (top) {
184 ▶           top.braceDepth--;
185 ▶           if (top.braceDepth < 0) {
186 │             // Exiting a template literal interpolation ${ ... }
187 ▶             stack.pop();
188 ▶             currentState = 'template';
189 │             i++;
190 │             continue;
191 │           }
192 │         }
193 │         i++;
194 │         continue;
195 │       }
196 │ 
197 │       i++;
```

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L198–232 （▶ の行: 198–200, 203, 216, 221, 223–224, 228–229）

```ts
198 ▶     } else if (currentState === 'string_double') {
199 ▶       if (char === '\\') {
200 ▶         i += 2;
201 │         continue;
202 │       }
203 ▶       if (char === '"') {
204 │         currentState = 'normal';
205 │       }
206 │       i++;
207 │     } else if (currentState === 'string_single') {
208 │       if (char === '\\') {
209 │         i += 2;
210 │         continue;
211 │       }
212 │       if (char === "'") {
213 │         currentState = 'normal';
214 │       }
215 │       i++;
216 ▶     } else if (currentState === 'template') {
217 │       if (char === '\\') {
218 │         i += 2;
219 │         continue;
220 │       }
221 ▶       if (char === '$' && nextChar === '{') {
222 │         // Entering template literal interpolation context
223 ▶         currentState = 'normal';
224 ▶         stack.push({ type: 'template', braceDepth: 0 });
225 │         i += 2;
226 │         continue;
227 │       }
228 ▶       if (char === '`') {
229 ▶         stack.pop();
230 │         currentState = 'normal';
231 │       }
232 │       i++;
```

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L233–257 （▶ の行: 233–234, 240–241, 248–249, 252–253, 256）

```ts
233 ▶     } else if (currentState === 'comment_block') {
234 ▶       if (char === '*' && nextChar === '/') {
235 │         currentState = 'normal';
236 │         i += 2;
237 │         continue;
238 │       }
239 │       i++;
240 ▶     } else if (currentState === 'comment_line') {
241 ▶       if (char === '\n' || char === '\r') {
242 │         currentState = 'normal';
243 │       }
244 │       i++;
245 │     }
246 │   }
247 │ 
248 ▶   if (lastCopiedIndex === 0) {
249 ▶     return code;
250 │   }
251 │ 
252 ▶   if (lastCopiedIndex < len) {
253 ▶     result.push(code.slice(lastCopiedIndex));
254 │   }
255 │ 
256 ▶   return result.join('');
257 │ }
```

1. **含まなければそのまま**

   97〜99 行目（a8f451bab9）。
2. **6 つの状態**

   108〜110 行目。ふつう・`"` の文字列・`'` の文字列・テンプレート・ブロックコメント・行コメントです。107 行目のスタックは、テンプレートの `${ … }` の中の `{` の深さを数えます（173〜195 行目と 221〜227 行目）。
3. **// を見たら**

   122〜156 行目。直前の空白を飛ばして `\` が奇数個あれば、正規表現の中の `\/\/` とみなして飛ばします（124〜138 行目、291caab615）。コメントが `sourceMappingURL=` なら、その行の改行の手前までを捨てます（140〜150 行目）。改行は残ります。
4. **文字列とテンプレートの中は見ない**

   198〜232 行目。`\` は次の 1 文字ごと飛ばします。

> [!WARNING]
> **ハマりどころ**
>
> この状態機械には、**正規表現のリテラル**の状態がありません。`/"/` のような正規表現の中の `"` を、157 行目が文字列の始まりと読み、その後の文字列の境目が全部ずれます。デモの「正規表現の中の " のあと、末尾に 1 つと文字列」では、44129f66a3 は文字列の中の `//# sourceMappingURL=inner.map` をコメントとして捨て、`const s = "` で終わる壊れた JavaScript を返しました。「正規表現の中の ' のあと、2 つ」では、本物の 2 つのコメントがどちらも残りました。これは #34590 で報告され、#34632（8984b4a0ee、22.2.x では 631ac8aa66）で、末尾に 1 つだけのときは文字列でも 3 節の速い道を使い、それ以外は oxc-parser にコメントだけを読ませる形に変わりました。22.2.7 は、この 2 つの入力を正しく処理しています。

呼ぶのは、`JavaScriptTransformer`（javascript-transformer.ts の 290・293 行目と、ワーカーの 248・266 行目）と、`ng serve` の Vite のメモリのプラグイン（angular-memory-plugin.ts の 108 行目）です。デモの「末尾に 1 つ」で、44129f66a3 の文字列の道だけ改行が 2 つ残るのは、146 行目が改行の手前で止まり、元の改行も残すからです。

## 5. 読み込み：data URI・ファイルの URL・相対パス

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L259–296 （▶ の行: 266, 270, 275, 278, 280–281, 288, 290–291, 295）

```ts
259 │ /**
260 │  * Extracts the base64 payload from an inline sourcemap data URI line and verifies
261 │  * that only trailing whitespace follows the payload.
262 │  *
263 │  * @returns The base64 payload string if valid and trailing, or `undefined` otherwise.
264 │  */
265 │ function extractTrailingBase64Payload(urlLine: string): string | undefined {
266 ▶   if (!urlLine.startsWith('data:application/json;')) {
267 │     return undefined;
268 │   }
269 │ 
270 ▶   const base64StartIndex = urlLine.indexOf('base64,');
271 │   if (base64StartIndex === -1) {
272 │     return undefined;
273 │   }
274 │ 
275 ▶   const payloadStart = base64StartIndex + 7;
276 │   let payloadEnd = urlLine.length;
277 │   // Find the first trailing whitespace character that marks the end of the base64 payload.
278 ▶   for (let i = payloadStart; i < urlLine.length; i++) {
279 │     const char = urlLine[i];
280 ▶     if (char === ' ' || char === '\r' || char === '\n' || char === '\t') {
281 ▶       payloadEnd = i;
282 │       break;
283 │     }
284 │   }
285 │ 
286 │   // Verify that everything after the base64 payload is trailing whitespace
287 │   // to ensure this is a valid trailing sourceMappingURL comment at the end of the file.
288 ▶   for (let i = payloadEnd; i < urlLine.length; i++) {
289 │     const char = urlLine[i];
290 ▶     if (char !== ' ' && char !== '\r' && char !== '\n' && char !== '\t') {
291 ▶       return undefined;
292 │     }
293 │   }
294 │ 
295 ▶   return urlLine.slice(payloadStart, payloadEnd);
296 │ }
```

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L298–329 （▶ の行: 305, 309, 314–315, 319, 325, 327）

```ts
298 │ /**
299 │  * Extracts the URL from an external sourcemap comment line and verifies
300 │  * that only trailing whitespace follows the URL.
301 │  *
302 │  * @returns The URL string if valid and trailing, or `undefined` otherwise.
303 │  */
304 │ function extractTrailingUrl(urlLine: string): string | undefined {
305 ▶   if (urlLine.startsWith('data:')) {
306 │     return undefined;
307 │   }
308 │ 
309 ▶   const urlMatch = /^([^\r\n\s'"`]+)/.exec(urlLine);
310 │   if (!urlMatch) {
311 │     return undefined;
312 │   }
313 │ 
314 ▶   const remaining = urlLine.slice(urlMatch[1].length);
315 ▶   if (!/^\s*$/.test(remaining)) {
316 │     return undefined;
317 │   }
318 │ 
319 ▶   return urlMatch[1];
320 │ }
321 │ 
322 │ /**
323 │  * Checks whether a `//# sourceMappingURL=` URL line snippet represents a valid trailing comment at the end of the file.
324 │  */
325 ▶ export function isTrailingSourceMapComment(urlLine: string): boolean {
326 │   return (
327 ▶     extractTrailingBase64Payload(urlLine) !== undefined || extractTrailingUrl(urlLine) !== undefined
328 │   );
329 │ }
```

`extractTrailingBase64Payload` は、`data:application/json;` で始まり `base64,` を含む行から、正規表現を使わずに中身を取り出します（339〜340 行目のコメントのとおり、埋め込みのソースマップは数 MB になることがあるため）。288〜293 行目、中身の後ろに空白以外があれば `undefined` です。`extractTrailingUrl` は 309 行目で空白と引用符を含まない最初のかたまりを取り、後ろが空白だけのときだけ返します。どちらかに当たれば 325〜329 行目で「末尾のコメント」です。デモの「URL の後ろに文字」（`a.js.map */`）は偽でした。

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L331–353 （▶ の行: 341–342, 344–346, 350–351）

```ts
331 │ /**
332 │  * Resolves and loads the input sourcemap referenced in a `//# sourceMappingURL=` URL line snippet.
333 │  * Supports inline base64 data URIs, local absolute file URLs, and relative/absolute filesystem paths.
334 │  */
335 │ export function loadInputSourceMapFromUrl(
336 │   filename: string,
337 │   urlLine: string,
338 │ ): EncodedSourceMap | undefined {
339 │   // Inline base64-encoded sourcemaps can be extremely large (up to megabytes).
340 │   // Parse them without regular expressions to avoid heavy backtracking and allocations.
341 ▶   const base64Payload = extractTrailingBase64Payload(urlLine);
342 ▶   if (base64Payload !== undefined) {
343 │     try {
344 ▶       return JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf-8')) as EncodedSourceMap;
345 ▶     } catch {
346 ▶       return undefined;
347 │     }
348 │   }
349 │ 
350 ▶   const url = extractTrailingUrl(urlLine);
351 ▶   if (!url) {
352 │     return undefined;
353 │   }
```

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L354–374 （▶ の行: 355, 358–360, 363, 366–368, 373）

```ts
354 │ 
355 ▶   if (url.startsWith('file://')) {
356 │     // Local absolute file URL scheme.
357 │     try {
358 ▶       const mapPath = fileURLToPath(url);
359 ▶       if (existsSync(mapPath)) {
360 ▶         return JSON.parse(readFileSync(mapPath, 'utf8')) as EncodedSourceMap;
361 │       }
362 │     } catch {}
363 ▶   } else if (!/^[a-z]+:\/\//i.test(url)) {
364 │     // Local relative or absolute filesystem path (percent-decoded as it originates from a URI).
365 │     try {
366 ▶       const mapPath = resolve(dirname(filename), decodeURIComponent(url));
367 ▶       if (existsSync(mapPath)) {
368 ▶         return JSON.parse(readFileSync(mapPath, 'utf8')) as EncodedSourceMap;
369 │       }
370 │     } catch {}
371 │   }
372 │ 
373 ▶   return undefined;
374 │ }
```

📄 `angular-cli/packages/angular/build/src/utils/source-map.ts` L376–405 （▶ の行: 384–385, 389, 392, 396–397, 401, 403）

```ts
376 │ /**
377 │  * Finds, resolves, and loads the input sourcemap referenced in the code's trailing
378 │  * sourceMappingURL comment, if present. Supports inline base64 data URIs, local absolute
379 │  * file URLs, and relative/absolute filesystem paths.
380 │  */
381 │ export function loadInputSourceMap(filename: string, code: string): EncodedSourceMap | undefined {
382 │   // Locate the last sourceMappingURL comment using lastIndexOf to avoid scanning
383 │   // the entire file with a regular expression (significant for large files).
384 ▶   const lastSourceMapIndex = code.lastIndexOf(SOURCEMAP_COMMENT_PREFIX);
385 ▶   if (lastSourceMapIndex === -1) {
386 │     return undefined;
387 │   }
388 │ 
389 ▶   if (lastSourceMapIndex > 0) {
390 │     // Skip any preceding horizontal whitespace (spaces/tabs) to find the start of the line.
391 │     let prevIdx = lastSourceMapIndex - 1;
392 ▶     while (prevIdx >= 0 && (code[prevIdx] === ' ' || code[prevIdx] === '\t')) {
393 │       prevIdx--;
394 │     }
395 │     // Ensure the comment starts at the beginning of a line, preventing false positives within code or strings.
396 ▶     if (prevIdx >= 0 && code[prevIdx] !== '\n' && code[prevIdx] !== '\r') {
397 ▶       return undefined;
398 │     }
399 │   }
400 │ 
401 ▶   return loadInputSourceMapFromUrl(
402 │     filename,
403 ▶     code.slice(lastSourceMapIndex + SOURCEMAP_COMMENT_PREFIX.length),
404 │   );
405 │ }
```

1. **data URI**

   341〜348 行目。base64 を戻して JSON にし、壊れていれば `undefined`。base64 でない data URI（`data:application/json,…`）は読みません。
2. **file://**

   355〜362 行目。`fileURLToPath` で戻して、あれば読みます。
3. **スキームの無いパス**

   363〜370 行目。JavaScript のファイルのフォルダを基準に、`%20` などを `decodeURIComponent` で戻してから解決します（10dc30f9c6）。
4. **http:// などは読まない**

   363 行目の条件に当たらず、373 行目で `undefined`。ビルドがネットに取りに行くことはありません。

`loadInputSourceMap` は文字列の最後の出現を 384 行目の `lastIndexOf` で探し、389〜399 行目でそれが行の頭かを確かめてから、上の関数に渡します。デモの「行の途中」は読みませんでした。

## 6. hash.ts：xxHash を先に用意する

📄 `angular-cli/packages/angular/build/src/utils/hash.ts` L9–35 （▶ の行: 10, 12–13, 18–19, 23–24, 28–30）

```ts
 9 │ import assert from 'node:assert';
10 ▶ import type { XXHashAPI } from 'xxhash-wasm';
11 │ 
12 ▶ let xxhashInstance: XXHashAPI | undefined;
13 ▶ let xxhashPromise: Promise<XXHashAPI> | undefined;
14 │ 
15 │ /**
16 │  * Initializes the xxHash WASM instance early to ensure synchronous hashing uses xxHash.
17 │  */
18 ▶ export async function initializeHash(): Promise<void> {
19 ▶   if (xxhashInstance) {
20 │     return;
21 │   }
22 │ 
23 ▶   xxhashPromise ??= import('xxhash-wasm').then((m) => m.default());
24 ▶   xxhashInstance = await xxhashPromise;
25 │ }
26 │ 
27 │ function getXxhash(): XXHashAPI {
28 ▶   assert(
29 ▶     xxhashInstance,
30 ▶     'Hash utility must be initialized by awaiting `initializeHash()` before use.',
31 │   );
32 │ 
33 │   return xxhashInstance;
34 │ }
35 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/hash.ts` L49–74 （▶ の行: 50, 58, 60, 63–64, 66, 69）

```ts
49 │ 
50 ▶ export interface ContentHasher {
51 │   update(data: string | Uint8Array): ContentHasher;
52 │   digest(): string;
53 │ }
54 │ 
55 │ /**
56 │  * Creates a streaming 64-bit non-cryptographic content hasher.
57 │  */
58 ▶ export function createContentHash(): ContentHasher {
59 │   const instance = getXxhash();
60 ▶   const hasher = instance.create64();
61 │ 
62 │   const contentHasher: ContentHasher = {
63 ▶     update(data: string | Uint8Array): ContentHasher {
64 ▶       hasher.update(data);
65 │ 
66 ▶       return contentHasher;
67 │     },
68 │     digest(): string {
69 ▶       return hasher.digest().toString(16).padStart(16, '0');
70 │     },
71 │   };
72 │ 
73 │   return contentHasher;
74 │ }
```

xxHash（暗号向けではない、速い 64 ビットのハッシュ）は WebAssembly で動くので、読み込みが非同期です。23 行目の `??=` で読み込みの Promise を 1 つだけ作り、24 行目でできた物を覚えます（cda8830710）。ハッシュの関数そのものは同期で呼びたいので、`initializeHash()` を先に `await` しておく約束で、忘れると 28〜31 行目の assert の文言で止まります（デモの 1 行目）。58〜74 行目の `createContentHash` は、少しずつ `update` して最後に 16 文字の 16 進を返します。`"a"` と `"bc"` を分けて入れても、`"abc"` 1 回と同じ値でした。文字列と Buffer で同じ値になるのは `calculateHash`（[キャッシュの章](../abl/04-abl-cache.md)）です。

## 7. version.ts：Angular の版がビルダーに合うか

📄 `angular-cli/packages/angular/build/src/utils/version.ts` L9–47 （▶ の行: 14, 18–19, 22, 24, 28, 31, 37, 40–42, 44, 46）

```ts
 9 │ /* eslint-disable no-console */
10 │ 
11 │ import { createRequire } from 'node:module';
12 │ import { SemVer, satisfies } from 'semver';
13 │ 
14 ▶ export function assertCompatibleAngularVersion(projectRoot: string): void | never {
15 │   let angularPkgJson;
16 │ 
17 │   // Create a custom require function for ESM compliance.
18 ▶   // NOTE: The trailing slash is significant.
19 ▶   const projectRequire = createRequire(projectRoot + '/');
20 │ 
21 │   try {
22 ▶     angularPkgJson = projectRequire('@angular/core/package.json');
23 │   } catch {
24 ▶     console.error(
25 │       'Error: It appears that "@angular/core" is missing as a dependency. Please ensure it is included in your project.',
26 │     );
27 │ 
28 ▶     process.exit(2);
29 │   }
30 │ 
31 ▶   if (!angularPkgJson?.['version']) {
32 │     console.error(
33 │       'Error: Unable to determine the versions of "@angular/core".\n' +
34 │         'This likely indicates a corrupted local installation. Please try reinstalling your packages.',
35 │     );
36 │ 
37 ▶     process.exit(2);
38 │   }
39 │ 
40 ▶   const angularCoreSemVer = new SemVer(angularPkgJson['version']);
41 ▶   const { version, build, raw } = angularCoreSemVer;
42 ▶   const supportedAngularSemver = '0.0.0-ANGULAR-FW-PEER-DEP';
43 │ 
44 ▶   if (version.startsWith('0.0.0') || supportedAngularSemver.startsWith('0.0.0')) {
45 │     // Internal CLI and FW testing version.
46 ▶     return;
47 │   }
```

📄 `angular-cli/packages/angular/build/src/utils/version.ts` L48–74 （▶ の行: 49, 62, 65–66, 72）

```ts
48 │ 
49 ▶   if (build.length && version.endsWith('.0.0-next.0')) {
50 │     // Special handle for local builds only when it's prerelease of major version and it's the 0th version.
51 │     // This happends when we are bumping to a new major version. and the cli has not releated a verion.
52 │ 
53 │     // Example:
54 │     // raw: '22.0.0-next.0+sha-c7dc705-with-local-changes',
55 │     // major: 22,
56 │     // minor: 0,
57 │     // patch: 0,
58 │     // prerelease: [ 'next', 0 ],
59 │     // build: [ 'sha-c7dc705-with-local-changes' ],
60 │     // version: '22.0.0-next.0'
61 │ 
62 ▶     return;
63 │   }
64 │ 
65 ▶   if (!satisfies(angularCoreSemVer, supportedAngularSemver, { includePrerelease: true })) {
66 ▶     console.error(
67 │       `Error: The current version of "@angular/build" supports Angular versions ${supportedAngularSemver},\n` +
68 │         `but detected Angular version ${raw} instead.\n` +
69 │         'Please visit the link below to find instructions on how to update Angular.\nhttps://update.angular.dev/',
70 │     );
71 │ 
72 ▶     process.exit(3);
73 │   }
74 │ }
```

1. **プロジェクトから @angular/core を探す**

   19〜22 行目。18 行目のコメントのとおり、`createRequire` に渡すパスの末尾の `/` が要ります。無いと、そのフォルダの「中のファイル」ではなく「隣のファイル」から探す形になるからです。見つからなければ 24〜28 行目、版が書いていなければ 31〜37 行目で、どちらも終了コード 2 で終わります。
2. **範囲は出荷のときに入る**

   42 行目の `0.0.0-ANGULAR-FW-PEER-DEP` は、パッケージを作るときに Bazel の stamp で範囲に置き換わります（0ddf6aafaa）。22.2.7 の dist では `^22.0.0` でした。
3. **素通りする 2 つ**

   44〜47 行目、どちらかが `0.0.0` なら（手元で作った物）調べません。49〜63 行目、build の部分（`+sha-…`）があり、版が `.0.0-next.0` で終わるときも調べません（7ac80a8d77）。新しいメジャーの最初の手元のビルドで、CLI がまだその版を知らないときのためです。
4. **合わなければ終了コード 3**

   65〜73 行目。プレリリースも含めて範囲に入るかを調べ、外なら文言を出して `process.exit(3)` です。

呼ぶのは application のビルダー（builders/application/index.ts の 43 行目）と extract-i18n（builder.ts の 47 行目）の入口です。例外ではなく `process.exit` なので、このファイルの unit の spec はありません。デモは子プロセスで終了コードを取りました。

## 8. デモ：本物の関数に入力を当てる

> **🧪 DEMO — path・url・source-map・hash・version（記録、@angular/build 22.2.7、darwin）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-paths)

ソースマップの読み込みは、ここで読んだ関数については 10 の入力の全部で 2 つの版が同じ結果でした。版の検査では、`22.3.0-next.1` は 65 行目の `includePrerelease` で範囲に入り、`23.0.0-next.0` は build の部分があるときだけ素通りしました。

## 9. どう録ったか

スクリプトは `<work>/bcu-demo/b/` に置き、Node v24.22.1 で、サイトの node\_modules の @angular/build 22.2.7 の `src/utils/` の .js を require しました。source-map.ts の 44129f66a3 は、../angular-cli の .ts を esbuild の `transformSync` で .js にしたものです（このファイルは型の import しか持たないので、そのまま動きます）。path.ts の `win32` は、子プロセスで `process.platform` を上書きしてから require したもので、`node:path` は macOS の POSIX のままです。version.ts は、偽の `node_modules/@angular/core/package.json` を置いた一時のフォルダごとに子プロセスで呼びました。

📄 `記録のスクリプト（rec-paths.mjs）`

```
// utils の path・url・source-map・hash・version（サイトの node_modules の @angular/build 22.2.7）に入力を当てて記録する。
// source-map.ts は 22.2.7 で中身が変わったので、../angular-cli（44129f66a3、読むだけ）の .ts を esbuild で .js にした物にも当てる。
// 使い方: node rec-paths.mjs <サイトのディレクトリ> <angular-cli のディレクトリ> <出力 JSON>
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [site, cli, out] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const tmp = path.join(here, '.paths-tmp');
const require = createRequire(path.join(site, 'package.json'));
const U = path.join(site, 'node_modules/@angular/build/src/utils');
const esbuild = require('esbuild');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const hide = (s) => String(s).replaceAll(realpathSync(tmp), '<tmp>').replaceAll(tmp, '<tmp>');

// 1. url.ts
const url = require(path.join(U, 'url.js'));
const urlCases = [
  ['stripTrailingSlash', ['path/'], ['/'], [''], ['a//']],
  ['stripLeadingSlash', ['/path'], ['/'], ['//a']],
  ['addLeadingSlash', ['path'], ['/path'], ['']],
  ['addTrailingSlash', ['path'], ['path/'], ['']],
  ['joinUrlParts', ['path/', '/to/resource'], ['/base/', '', '/fr/'], ['http://localhost/app/', 'en'], ['HTTPS://cdn.example.com/', 'x'], ['', ''], ['//', 'a'], ['/a//', '//b']],
].flatMap(([fn, ...calls]) => calls.map((args) => ({ fn, args, result: url[fn](...args) })));

// 2. path.ts（toPosixPath と canonicalizePath は、process.platform を win32 に見せかけた子プロセスでも呼ぶ）
const pathMod = path.join(U, 'path.js');
const pathCalls = [
  ['toPosixPath', 'C:\\work\\dev\\app\\src\\main.ts'],
  ['canonicalizePath', 'c:/work/app'],
  ['isSubDirectory', '/ws', '/ws/src'],
  ['isSubDirectory', '/ws', 'src/app'],
  ['isSubDirectory', '/ws', '/ws'],
  ['isSubDirectory', '/ws', '/ws-other'],
  ['isSubDirectory', '/ws', '/ws/../etc'],
  ['isSubDirectory', '/ws', '/ws/..foo'],
];
const runPath = (platform) => {
  const code = `${platform ? `Object.defineProperty(process, 'platform', { value: '${platform}' });` : ''}
    const m = require(${JSON.stringify(pathMod)});
    console.log(JSON.stringify(${JSON.stringify(pathCalls)}.map(([fn, ...a]) => m[fn](...a))));`;
  return JSON.parse(spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' }).stdout);
};
const pathRes = { [process.platform]: runPath(null), 'win32（見せかけ）': runPath('win32') };
const paths = pathCalls.map(([fn, ...args], i) => ({ fn, args, res: Object.fromEntries(Object.entries(pathRes).map(([k, v]) => [k, v[i]])) }));

// 3. source-map.ts（2 つの版）
const src44 = readFileSync(path.join(cli, 'packages/angular/build/src/utils/source-map.ts'), 'utf8');
writeFileSync(path.join(tmp, 'source-map-44129f66a3.js'), esbuild.transformSync(src44, { loader: 'ts', format: 'cjs', platform: 'node' }).code);
const SM = { '22.2.7': require(path.join(U, 'source-map.js')), '44129f66a3': require(path.join(tmp, 'source-map-44129f66a3.js')) };
const C = '//# sourceMappingURL=';
const removeCases = [
  ['末尾に 1 つ', `export const a = 1;\n${C}a.js.map\n`],
  ['コメントの前に空白', `export const a = 1;\n   ${C}a.js.map`],
  ['2 つ（途中と末尾）', `const a = 1;\n${C}old.map\nconst b = 2;\n${C}b.js.map\n`],
  ['文字列の中', `const s = "${C}x.map";\n`],
  ['テンプレートの中', `const s = \`\n${C}x.map\n\`;\n`],
  ['ブロックコメントの中', `/*\n${C}x.map\n*/\nconst a = 1;\n`],
  ['正規表現の中の " のあと、末尾に 1 つと文字列', `const q = /"/;\nconst s = "${C}inner.map";\n${C}real.map\n`],
  ["正規表現の中の ' のあと、2 つ", `const q = /'/;\n${C}first.map\nconst t = 1;\n${C}real.map\n`],
  ['割り算', `const half = 4 / 2;\n${C}a.js.map\n`],
  ['行の途中', `const a = 1; ${C}a.js.map\n`],
];
const remove = removeCases.map(([label, code]) => {
  const res = {};
  for (const [ver, m] of Object.entries(SM)) {
    let str, buf;
    try { str = m.removeSourceMappingURL(code); } catch (e) { str = 'ERROR ' + e.message; }
    try { buf = Buffer.from(m.removeSourceMappingURL(Buffer.from(code))).toString('utf8'); } catch (e) { buf = 'ERROR ' + e.message; }
    res[ver] = { str, buf };
  }
  const t = SM['22.2.7'].findTrailingSourceMapComment(Buffer.from(code));
  return { label, code, res, trailing: t === null ? 'null' : t === undefined ? 'undefined' : { code: Buffer.from(t.code).toString('utf8'), urlLine: t.urlLine } };
});

// 読み込み: データ URI・相対・file://・http://・% の符号・壊れた base64
const mapJson = JSON.stringify({ version: 3, sources: ['a.ts'], mappings: 'AAAA' });
mkdirSync(path.join(tmp, 'maps/sub dir'), { recursive: true });
writeFileSync(path.join(tmp, 'maps/a.js.map'), mapJson);
writeFileSync(path.join(tmp, 'maps/sub dir/b.js.map'), mapJson);
const fileName = path.join(tmp, 'maps/a.js');
const b64 = Buffer.from(mapJson).toString('base64');
const loadCases = [
  ['data URI（base64）', `data:application/json;charset=utf-8;base64,${b64}`],
  ['data URI の後ろに文字', `data:application/json;base64,${b64} */`],
  ['data URI、base64 でない', `data:application/json,${encodeURIComponent(mapJson)}`],
  ['壊れた base64', 'data:application/json;base64,@@@@'],
  ['相対パス', 'a.js.map'],
  ['% で符号化した相対パス', 'sub%20dir/b.js.map'],
  ['file:// の URL', pathToFileURL(path.join(tmp, 'maps/a.js.map')).href],
  ['http:// の URL', 'http://localhost:4200/a.js.map'],
  ['無いファイル', 'missing.js.map'],
  ['URL の後ろに文字', 'a.js.map */'],
];
const load = loadCases.map(([label, urlLine]) => {
  const m = SM['22.2.7'];
  const r = m.loadInputSourceMapFromUrl(fileName, urlLine);
  const r44 = SM['44129f66a3'].loadInputSourceMapFromUrl(fileName, urlLine);
  return { label, urlLine: hide(urlLine).replace(b64, '<base64>'), trailing: m.isTrailingSourceMapComment(urlLine), loaded: r ? r.sources : null, same44: JSON.stringify(r) === JSON.stringify(r44) };
});
const inputMap = [
  ['末尾のコメント', `x();\n${C}a.js.map`],
  ['行の途中', `x(); ${C}a.js.map`],
  ['文字列の中で終わる', `x("${C}a.js.map")`],
].map(([label, code]) => ({ label, code, loaded: SM['22.2.7'].loadInputSourceMap(fileName, code)?.sources ?? null }));

// 4. hash.ts
const hash = require(path.join(U, 'hash.js'));
const hashLog = [];
try { hash.calculateHash('abc'); } catch (e) { hashLog.push(['初期化の前に calculateHash', 'ERROR ' + e.message]); }
await hash.initializeHash();
hashLog.push(['calculateHash("abc")', hash.calculateHash('abc')]);
hashLog.push(['calculateHash(Buffer "abc")', hash.calculateHash(Buffer.from('abc'))]);
hashLog.push(['createContentHash().update("a").update("bc").digest()', hash.createContentHash().update('a').update('bc').digest()]);
hashLog.push(['calculateHash("")', hash.calculateHash('')]);

// 5. version.ts: 偽の @angular/core を置いた projectRoot ごとに子プロセスで呼ぶ
const versionFile = path.join(U, 'version.js');
const supported = /const supportedAngularSemver = '([^']+)'/.exec(readFileSync(versionFile, 'utf8'))[1];
const verCases = [
  ['22.2.6', '22.2.6'],
  ['22.0.0', '22.0.0'],
  ['21.2.0', '21.2.0'],
  ['23.0.0', '23.0.0'],
  ['22.3.0-next.1', '22.3.0-next.1'],
  ['0.0.0-PLACEHOLDER', '0.0.0-PLACEHOLDER'],
  ['23.0.0-next.0+sha-abc1234', '23.0.0-next.0+sha-abc1234'],
  ['23.0.0-next.0（build なし）', '23.0.0-next.0'],
  ['version の無い package.json', null],
  ['@angular/core が無い', undefined],
];
const versions = verCases.map(([label, v], i) => {
  const root = path.join(tmp, 'v' + i);
  mkdirSync(root, { recursive: true });
  if (v !== undefined) {
    mkdirSync(path.join(root, 'node_modules/@angular/core'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules/@angular/core/package.json'), JSON.stringify(v === null ? { name: '@angular/core' } : { name: '@angular/core', version: v }));
  }
  const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(versionFile)}).assertCompatibleAngularVersion(${JSON.stringify(root)}); console.log('戻った');`], { encoding: 'utf8' });
  return { label, exit: r.status, stdout: r.stdout.trim(), stderr: hide(r.stderr.trim()) };
});

rmSync(tmp, { recursive: true, force: true });
writeFileSync(out, JSON.stringify({ version: require(path.join(site, 'node_modules/@angular/build/package.json')).version, node: process.version, platform: process.platform, urlCalls: urlCases, paths, remove, load, inputMap, hashLog, supported, versions }, null, 1));
console.log('url', urlCases.length, 'paths', paths.length, 'remove', remove.length, 'load', load.length, 'versions', versions.length);

```

## ここまでの呼び出し

- `buildApplication(options, context)` — builders/application/index.ts
  - `assertCompatibleAngularVersion(workspaceRoot)` — 43 → version.ts 14
  - `normalizeOptions` → `joinUrlParts`・`addTrailingSlash` — url.ts 98・76 — *ロケールごとの baseHref*
  - `JavaScriptTransformer.transformData` — javascript-transformer.ts 290
    - `removeSourceMappingURL(data)` — source-map.ts 72
      - `findTrailingSourceMapComment` → `isTrailingSourceMapComment` — 24 → 325 — *Buffer の速い道*
      - `removeSourceMappingURLFromString` — 96 — *44129f66a3 は状態機械、22.2.7 は oxc-parser*
    - `loadInputSourceMap(filename, data)` → `loadInputSourceMapFromUrl` — 381 → 335 — *ワーカーの中*
  - `initializeHash()` → `createContentHash()` — hash.ts 18 → 58 — *キャッシュの鍵*

## テストと直し方

| spec | describe / it と行 | この章のどこ |
| --- | --- | --- |
| utils/path\_spec.ts | describe isSubDirectory（11 行目、it 7 件）、describe canonicalizePath（43 行目。Windows の it は 48 行目の `if` の中で、macOS では走らない） | 1 節。`toPosixPath` の it はありません |
| utils/source-map\_spec.ts | describe removeSourceMappingURL（16 行目、文字列 17 件・Buffer 4 件）、loadInputSourceMapFromUrl（143 行目）、loadInputSourceMap（165 行目）、isTrailingSourceMapComment（203 行目） | 3〜5 節。81 行目の「正規表現のリテラルの中」の it は `\/\/` の形だけで、`/"/` の形はありません（v22.2.7 の spec の 122〜149 行目に、631ac8aa66 で足されました） |
| utils/hash\_spec.ts | describe hash utility（11 行目、it 4 件） | 6 節 |
| （無い） | url.ts と version.ts の spec | 2・7 節 |

path\_spec.ts の 8 件（macOS で走るもの）、source-map\_spec.ts の 33 件、hash\_spec.ts の 4 件は、[6 回目](06-bcu-index.md)に書いた bazel の 1 回（`//packages/angular/build:test`、101 件、0 failures）の中で通りました。4 節の正規表現のずれを 44129f66a3 の上で固めるなら、source-map\_spec.ts の 81 行目の隣に、`const q = /"/;\nconst s = "//# sourceMappingURL=inner.map";\n` を渡して、入力がそのまま返ることを期待する it を足します。直し方は、状態機械に正規表現の状態を足すより、#34632 のとおり、JavaScript の字句を正しく読める oxc-parser にコメントの位置だけを聞く形が確かです。2 節の `HTTPS://` を固めるなら url.ts に spec のファイルを作り、118 行目の正規表現に `i` を付けるかどうかを it で決めます。

## 聞かれそうな質問

**Q. Windows のパスを / にそろえる関数を macOS で呼ぶとどうなりますか？**

36 行目で `platform === 'win32'` のときだけ置き換えるので、何もせずに返ります。macOS のファイル名の `\` は区切りではない普通の文字なので、置き換えてはいけないからです。

**Q. joinUrlParts('/app/', '/') は何になりますか？**

107〜112 行目で `/app/` は `app`、`/` は空になり、113 行目で捨てられるので、121 行目で `/app` です。末尾の `/` が要るときは、呼ぶ側が 76 行目の `addTrailingSlash` を重ねます。

**Q. ライブラリの JavaScript の中に "//# sourceMappingURL=" という文字列があると、壊れることがありますか？**

44129f66a3 では、その前に `/"/` のような引用符を含む正規表現があると、157 行目が文字列の始まりを読み違え、文字列の中を捨てて壊れた JavaScript を返しました（4 節のデモ）。22.2.7 と新しい本家は、oxc-parser でコメントの位置を読むので、正しく残します。

**Q. ソースマップのコメントが http:// の URL を指していたら、ビルドは取りに行きますか？**

行きません。363 行目は「スキーム:// で始まらない」ときだけファイルとして読み、`file://` は 355 行目で別に扱います。それ以外の URL は 373 行目で `undefined` です。

**Q. Angular 21 のプロジェクトで @angular/build 22 を使うと何が起きますか？**

65〜73 行目で範囲（22.2.7 では `^22.0.0`）の外と判定され、「supports Angular versions … but detected Angular version 21.2.0」の文言を出して、終了コード 3 で終わります（デモ）。

## 読み終えて

- `toPosixPath` と `canonicalizePath` は Windows のときだけ働く。`isSubDirectory` は相対パスで中か外かを決める。
- url.ts の関数は前後の `/` を 1 つだけ外し・足す。`joinUrlParts` は空の部分を捨て、`http(s)://` で始まるときだけ頭に `/` を付けない。
- ソースマップのコメントは、末尾に 1 つならバイト列のまま切る。それ以外は 44129f66a3 では状態機械で、正規表現のリテラルを知らない（22.2.7 は oxc-parser）。
- 読み込みは data URI・`file://`・相対パスだけ。ネットには行かない。
- xxHash は先に `initializeHash()` を await する約束。版の検査は終了コード 2 と 3 で、手元のビルドは素通りする。

---

← 前: [オプションの小道具：environment-options・i18n-options・normalize-\*・postcss・proxy](08-bcu-options.md)  
次: [spec と issue を読む：compilation と utils を固めているテスト](10-bcu-tests-issues.md) →
