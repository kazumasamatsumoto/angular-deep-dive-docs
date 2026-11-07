[目次](../README.md) › [テンプレートコンパイラの内側](README.md) › 第 3 回 / 全 18 回

# HTML の字句解析：テンプレートの文字列がトークンの列になるまで

> ml\_parser/lexer.ts の tokenize が \_Tokenizer で 1 文字ずつ読み、TAG\_OPEN\_START / ATTR\_NAME / TEXT / INTERPOLATION / BLOCK\_OPEN\_START / LET\_START などのトークンを作る手順。カーソル（PlainCharacterCursor / EscapedCharacterCursor）、{{ }} を TEXT の中で切り出す行、@if などのブロック構文と @let を見分ける行、&lt;script&gt; や &lt;textarea&gt; の中身を生のテキストとして読む理由。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-html-lexer)

---

テンプレートの文字列を最初に読むのは字句解析器（lexer、トークナイザ）です。字句解析とは、文字の並びを 「ここからここまでが開始タグの名前」「ここが属性値」「ここが補間」という**意味の最小単位（トークン）の列**に切り分けることです。この章では `ml_parser/lexer.ts` の `tokenize` が `_Tokenizer` で 1 文字ずつ読み、`TAG_OPEN_START`・`ATTR_NAME`・`TEXT`・`INTERPOLATION`・`BLOCK_OPEN_START`・`LET_START` などを作る手順を、分岐の行ごとに追います。

読む対象は `compiler/src/ml_parser/lexer.ts`・`tokens.ts`・`html_tags.ts` です。木を組む次の段（`parser.ts`）は [第 4 回](04-compiler-html-parser.md)で読みます。

1. [1. 全体図](01-compiler.md)
2. [2. コンパイラの入口](02-compiler-entry.md)
3. **3. HTML の字句解析**（この章）
4. [4. HTML の構文解析](04-compiler-html-parser.md)
5. [5. 式のパーサ](05-compiler-expression-parser.md)
6. [6. バインディングのパーサ](06-compiler-binding-parser.md)
7. [7. R3 AST](07-compiler-r3-ast.md)
8. [8. ブロック構文の解析](08-compiler-control-flow-blocks.md)
9. [9. ディレクティブの照合](09-compiler-binder.md)
10. [10. IR への写像](10-compiler-ingest.md)
11. [11. IR の構造](11-compiler-ir.md)
12. [12. decls・vars・advance](12-compiler-slots-vars.md)
13. [13. 変数とコンテキスト](13-compiler-variables.md)
14. [14. 定数配列と pure function](14-compiler-consts-pure.md)
15. [15. 制御フローのフェーズ](15-compiler-control-flow-phases.md)
16. [16. reify と出力](16-compiler-reify-emit.md)
17. [17. 型検査（TCB）](17-compiler-typecheck.md)
18. [18. スタイルのカプセル化](18-compiler-shadow-css.md)

## 1. トークンの種類と形

📄 `angular/packages/compiler/src/ml_parser/tokens.ts` L11–31 （▶ の行: 12–13, 15, 17–21, 27–30）

```ts
11 │ export const enum TokenType {
12 ▶   TAG_OPEN_START,
13 ▶   TAG_OPEN_END,
14 │   TAG_OPEN_END_VOID,
15 ▶   TAG_CLOSE,
16 │   INCOMPLETE_TAG_OPEN,
17 ▶   TEXT,
18 ▶   ESCAPABLE_RAW_TEXT,
19 ▶   RAW_TEXT,
20 ▶   INTERPOLATION,
21 ▶   ENCODED_ENTITY,
22 │   COMMENT_START,
23 │   COMMENT_END,
24 │   IN_ELEMENT_COMMENT,
25 │   CDATA_START,
26 │   CDATA_END,
27 ▶   ATTR_NAME,
28 ▶   ATTR_QUOTE,
29 ▶   ATTR_VALUE_TEXT,
30 ▶   ATTR_VALUE_INTERPOLATION,
31 │   DOC_TYPE,
```

📄 `angular/packages/compiler/src/ml_parser/tokens.ts` L32–56 （▶ の行: 37–40, 42–44, 55）

```ts
32 │   EXPANSION_FORM_START,
33 │   EXPANSION_CASE_VALUE,
34 │   EXPANSION_CASE_EXP_START,
35 │   EXPANSION_CASE_EXP_END,
36 │   EXPANSION_FORM_END,
37 ▶   BLOCK_OPEN_START,
38 ▶   BLOCK_OPEN_END,
39 ▶   BLOCK_CLOSE,
40 ▶   BLOCK_PARAMETER,
41 │   INCOMPLETE_BLOCK_OPEN,
42 ▶   LET_START,
43 ▶   LET_VALUE,
44 ▶   LET_END,
45 │   INCOMPLETE_LET,
46 │   COMPONENT_OPEN_START,
47 │   COMPONENT_OPEN_END,
48 │   COMPONENT_OPEN_END_VOID,
49 │   COMPONENT_CLOSE,
50 │   INCOMPLETE_COMPONENT_OPEN,
51 │   DIRECTIVE_NAME,
52 │   DIRECTIVE_OPEN,
53 │   DIRECTIVE_CLOSE,
54 │   PROCESSING_INSTRUCTION,
55 ▶   EOF,
56 │ }
```

トークンの種類は `const enum` で 44 個あります。大きく分けると、タグ（12〜16 行目）、テキスト（17〜21 行目）、コメント・CDATA（22〜26 行目）、属性（27〜30 行目）、ICU（32〜36 行目）、**ブロック（37〜41 行目）**、**`@let`（42〜45 行目）**、selectorless（46〜53 行目）、最後に 55 行目の `EOF` です。`INCOMPLETE_` が付くものは「書きかけ」を表し、エラーにするのは次の段です。

📄 `angular/packages/compiler/src/ml_parser/tokens.ts` L138–153 （▶ の行: 140, 145–147, 152）

```ts
138 │ export interface TextToken extends TokenBase {
139 │   type: TokenType.TEXT | TokenType.ESCAPABLE_RAW_TEXT | TokenType.RAW_TEXT;
140 ▶   parts: [text: string];
141 │ }
142 │ 
143 │ export interface InterpolationToken extends TokenBase {
144 │   type: TokenType.INTERPOLATION;
145 ▶   parts:
146 ▶     | [startMarker: string, expression: string, endMarker: string]
147 ▶     | [startMarker: string, expression: string];
148 │ }
149 │ 
150 │ export interface EncodedEntityToken extends TokenBase {
151 │   type: TokenType.ENCODED_ENTITY;
152 ▶   parts: [decoded: string, encoded: string];
153 │ }
```

どのトークンも `type`・`parts`（文字列の配列）・`sourceSpan`（元の文字列での位置）の 3 つだけを持ちます。`parts` の中身は種類ごとに決まっていて、たとえば 145〜147 行目の `INTERPOLATION` は `["{{", 式, "}}"]`、閉じ忘れたときは 147 行目のように終わりの印が無い 2 要素です。152 行目の `ENCODED_ENTITY` は `[デコード後, 元の書き方]`。

実際に `<p [title]="t">{{ n }}</p>` を通すと、こうなります（末尾の DEMO で他の例も見られます）。

| type | parts | 元の文字列 |
| --- | --- | --- |
| `TAG_OPEN_START` | `["", "p"]` | `"<p"` |
| `ATTR_NAME` | `["", "[title]"]` | `"[title]"` |
| `ATTR_QUOTE` | `["\""]` | `"\""` |
| `ATTR_VALUE_TEXT` | `["t"]` | `"t"` |
| `ATTR_QUOTE` | `["\""]` | `"\""` |
| `TAG_OPEN_END` | `[]` | `">"` |
| `TEXT` | `[""]` | `""` |
| `INTERPOLATION` | `["{{", " n ", "}}"]` | `"{{ n }}"` |
| `TEXT` | `[""]` | `""` |
| `TAG_CLOSE` | `["", "p"]` | `"</p>"` |
| `EOF` | `[]` | `""` |

`[title]` は 1 つの `ATTR_NAME` で、角括弧の意味（プロパティバインディング）はまだありません。補間の前後に空の `TEXT` が付いているのは、6 節の `_consumeWithInterpolation` が「テキスト → 補間 → テキスト」の順で必ずトークンを閉じるからです。

## 2. 入口：tokenize と \_Tokenizer の準備

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L109–122 （▶ の行: 112, 115–116, 118–119）

```ts
109 │ export function tokenize(
110 │   source: string,
111 │   url: string,
112 ▶   getTagDefinition: (tagName: string) => TagDefinition,
113 │   options: TokenizeOptions = {},
114 │ ): TokenizeResult {
115 ▶   const tokenizer = new _Tokenizer(new ParseSourceFile(source, url), getTagDefinition, options);
116 ▶   tokenizer.tokenize();
117 │   return new TokenizeResult(
118 ▶     mergeTextTokens(tokenizer.tokens),
119 ▶     tokenizer.errors,
120 │     tokenizer.nonNormalizedIcuExpressions,
121 │   );
122 │ }
```

115 行目で `_Tokenizer` を作り、116 行目で全部読みます。118 行目、返す前に隣り合う `TEXT` を 1 つにまとめます（6 節）。112 行目の `getTagDefinition` は「このタグの中身をどう読むか」を教える関数で、`HtmlParser` は `getHtmlTagDefinition`（8 節）を渡します。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L190–217 （▶ の行: 195, 198, 204–206, 209–210）

```ts
190 │   constructor(
191 │     _file: ParseSourceFile,
192 │     private _getTagDefinition: (tagName: string) => TagDefinition,
193 │     options: TokenizeOptions,
194 │   ) {
195 ▶     this._tokenizeIcu = options.tokenizeExpansionForms || false;
196 │     this._leadingTriviaCodePoints =
197 │       options.leadingTriviaChars && options.leadingTriviaChars.map((c) => c.codePointAt(0) || 0);
198 ▶     const range = options.range || {
199 │       endPos: _file.content.length,
200 │       startPos: 0,
201 │       startLine: 0,
202 │       startCol: 0,
203 │     };
204 ▶     this._cursor = options.escapedString
205 ▶       ? new EscapedCharacterCursor(_file, range)
206 ▶       : new PlainCharacterCursor(_file, range);
207 │     this._preserveLineEndings = options.preserveLineEndings || false;
208 │     this._i18nNormalizeLineEndingsInICUs = options.i18nNormalizeLineEndingsInICUs || false;
209 ▶     this._tokenizeBlocks = options.tokenizeBlocks ?? true;
210 ▶     this._tokenizeLet = options.tokenizeLet ?? true;
211 │     this._selectorlessEnabled = options.selectorlessEnabled ?? false;
212 │     try {
213 │       this._cursor.init();
214 │     } catch (e) {
215 │       this.handleError(e);
216 │     }
217 │   }
```

1. **195 行目：ICU を読むか**

   `parseTemplate` は常に `tokenizeExpansionForms: true` を渡すので、テンプレートでは `{` が ICU（i18n の複数形などの構文）の始まりとして読まれます（7 節の Q&A）。
2. **198〜203 行目：読む範囲**

   `range` が無ければ文字列全体。インラインテンプレートでは ngtsc が .ts ファイル全体と範囲を渡します（[第 2 回](02-compiler-entry.md)）。
3. **204〜206 行目：カーソルを選ぶ**

   JS の文字列リテラルの中を読むなら `EscapedCharacterCursor`、そうでなければ `PlainCharacterCursor`（9 節）。
4. **209〜210 行目：ブロックと @let を読むか**

   未指定なら `true`。ngtsc は core のバージョンでこれを切り替えます（[第 2 回](02-compiler-entry.md) 1 節）。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L144–164 （▶ の行: 144, 160）

```ts
144 ▶ const SUPPORTED_BLOCKS = [
145 │   '@if',
146 │   '@else', // Covers `@else if` as well
147 │   '@for',
148 │   '@switch',
149 │   '@case',
150 │   '@default',
151 │   '@empty',
152 │   '@defer',
153 │   '@placeholder',
154 │   '@loading',
155 │   '@boundary',
156 │   '@error',
157 │   '@content',
158 │ ] as const;
159 │ 
160 ▶ const INTERPOLATION = {start: '{{', end: '}}'} as const;
161 │ 
162 │ const DEFAULT_NEVER_PATTERN = /^default[^\S\r\n]+never/;
163 │ 
164 │ const ELSE_IF_PATTERN = /^else[^\S\r\n]+if/;
```

144〜158 行目の 13 個が「`@` の後ろに来たらブロックとみなす名前」、160 行目が補間の記号です。どちらも**定数**で、設定から変える口はありません。

## 3. メインループ：1 文字目で行き先を決める

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L230–249 （▶ の行: 231–232, 234–235, 239, 243–244, 248）

```ts
230 │   tokenize(): void {
231 ▶     while (this._cursor.peek() !== chars.$EOF) {
232 ▶       const start = this._cursor.clone();
233 │       try {
234 ▶         if (this._attemptCharCode(chars.$LT)) {
235 ▶           if (this._attemptCharCode(chars.$BANG)) {
236 │             if (this._attemptCharCode(chars.$LBRACKET)) {
237 │               this._consumeCdata(start);
238 │             } else if (this._attemptCharCode(chars.$MINUS)) {
239 ▶               this._consumeComment(start);
240 │             } else {
241 │               this._consumeDocType(start);
242 │             }
243 ▶           } else if (this._attemptCharCode(chars.$SLASH)) {
244 ▶             this._consumeTagClose(start);
245 │           } else if (this._attemptCharCode(chars.$QUESTION)) {
246 │             this._consumeProcessingInstruction(start);
247 │           } else {
248 ▶             this._consumeTagOpen(start);
249 │           }
```

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L250–285 （▶ の行: 251, 254, 256, 258–260, 266, 268–269, 272–274, 280, 283）

```ts
250 │         } else if (
251 ▶           this._tokenizeLet &&
252 │           // Use `peek` instead of `attempCharCode` since we
253 │           // don't want to advance in case it's not `@let`.
254 ▶           this._cursor.peek() === chars.$AT &&
255 │           !this._inInterpolation &&
256 ▶           this._isLetStart()
257 │         ) {
258 ▶           this._consumeLetDeclaration(start);
259 ▶         } else if (this._tokenizeBlocks && this._isBlockStart()) {
260 ▶           this._consumeBlockStart(start);
261 │         } else if (
262 │           this._tokenizeBlocks &&
263 │           !this._inInterpolation &&
264 │           !this._isInExpansionCase() &&
265 │           !this._isInExpansionForm() &&
266 ▶           this._attemptCharCode(chars.$RBRACE)
267 │         ) {
268 ▶           this._consumeBlockEnd(start);
269 ▶         } else if (!(this._tokenizeIcu && this._tokenizeExpansionForm())) {
270 │           // In (possibly interpolated) text the end of the text is given by `isTextEnd()`, while
271 │           // the premature end of an interpolation is given by the start of a new HTML element.
272 ▶           this._consumeWithInterpolation(
273 ▶             TokenType.TEXT,
274 ▶             TokenType.INTERPOLATION,
275 │             () => this._isTextEnd(),
276 │             () => this._isTagStart(),
277 │           );
278 │         }
279 │       } catch (e) {
280 ▶         this.handleError(e);
281 │       }
282 │     }
283 ▶     this._beginToken(TokenType.EOF);
284 │     this._endToken([]);
285 │   }
```

1. **231 行目：EOF まで繰り返す**

   1 周で 1 つ以上のトークンを作ります。232 行目でこの周の開始位置を覚えておき、トークンの `sourceSpan` の始点にします。
2. **234〜249 行目：`<` で始まる**

   続く文字で 5 方向に分かれます。`<!--` はコメント（239 行目）、`<!` その他は CDATA か DOCTYPE、`</` は閉じタグ（244 行目）、`<?` は処理命令、それ以外は開始タグ（248 行目、5 節）です。
3. **250〜258 行目：`@let`**

   254 行目で `peek`（進めずに覗く）を使うのは、`@let` でなかったときに位置を戻さなくて済むようにするためです（252〜253 行目のコメント）。
4. **259〜260 行目：`@if` などのブロック開始**
5. **261〜268 行目：`}` はブロックの終わり**

   ICU の中（264〜265 行目）でなければ、テキスト中の `}` は無条件に `BLOCK_CLOSE` です。
6. **269〜277 行目：それ以外はテキスト**

   ICU の開始でなければ、`TEXT` と `INTERPOLATION` を交互に作る `_consumeWithInterpolation` へ（6 節）。275 行目の「テキストの終わり」の判定と、276 行目の「補間が途中で切れる」判定を関数で渡しています。
7. **279〜280 行目：エラーで止まらない**

   どの分岐で例外が出ても、その周を捨ててエラーを記録し、次の周へ進みます。283〜284 行目で最後に `EOF` を 1 つ足します。

## 4. トークンの作り方とエラー

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L510–540 （▶ の行: 510–512, 515, 528–531, 536）

```ts
510 ▶   private _beginToken(type: TokenType, start = this._cursor.clone()) {
511 ▶     this._currentTokenStart = start;
512 ▶     this._currentTokenType = type;
513 │   }
514 │ 
515 ▶   private _endToken(parts: string[], end?: CharacterCursor): Token {
516 │     if (this._currentTokenStart === null) {
517 │       throw new ParseError(
518 │         this._cursor.getSpan(end),
519 │         'Programming error - attempted to end a token when there was no start to the token',
520 │       );
521 │     }
522 │     if (this._currentTokenType === null) {
523 │       throw new ParseError(
524 │         this._cursor.getSpan(this._currentTokenStart),
525 │         'Programming error - attempted to end a token which has no token type',
526 │       );
527 │     }
528 ▶     const token = {
529 ▶       type: this._currentTokenType,
530 ▶       parts,
531 ▶       sourceSpan: (end ?? this._cursor).getSpan(
532 │         this._currentTokenStart,
533 │         this._leadingTriviaCodePoints,
534 │       ),
535 │     } as Token;
536 ▶     this.tokens.push(token);
537 │     this._currentTokenStart = null;
538 │     this._currentTokenType = null;
539 │     return token;
540 │   }
```

トークンは必ず `_beginToken(type)` → （カーソルを進める）→ `_endToken(parts)` の組で作ります。511 行目で始点のカーソルを覚え、531 行目で「始点から今のカーソルまで」を `sourceSpan` にし、536 行目で配列に足します。`parts` は呼び出し側が組み立てて渡すので、字句解析器は「どこからどこまでか」と「何と呼ぶか」だけを決めています。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L542–561 （▶ の行: 543–544, 553–554, 557, 559）

```ts
542 │   private _createError(msg: string, span: ParseSourceSpan): ParseError {
543 ▶     if (this._isInExpansionForm()) {
544 ▶       msg += ` (Do you have an unescaped "{" in your template? Use "{{ '{' }}") to escape it.)`;
545 │     }
546 │     const error = new ParseError(span, msg);
547 │     this._currentTokenStart = null;
548 │     this._currentTokenType = null;
549 │     return error;
550 │   }
551 │ 
552 │   private handleError(e: any) {
553 ▶     if (e instanceof CursorError) {
554 ▶       e = this._createError(e.msg, this._cursor.getSpan(e.cursor));
555 │     }
556 │     if (e instanceof ParseError) {
557 ▶       this.errors.push(e);
558 │     } else {
559 ▶       throw e;
560 │     }
561 │   }
```

543〜545 行目、ICU を読んでいる途中のエラーには「エスケープしていない `{` がありませんか」という一文を足します。テンプレートに `{` を 1 つだけ書いたときに出るメッセージがこれです。557 行目で `ParseError` は配列に積み、559 行目、それ以外の例外（プログラムの誤り）だけを投げ直します。

## 5. タグと属性

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1002–1006 （▶ の行: 1003–1004）

```ts
1002 │   private _consumeTagOpenStart(start: CharacterCursor): TagOpenStartToken {
1003 ▶     this._beginToken(TokenType.TAG_OPEN_START, start);
1004 ▶     const parts = this._consumePrefixAndName(isNameEnd);
1005 │     return this._endToken(parts) as TagOpenStartToken;
1006 │   }
```

開始タグは `TAG_OPEN_START` の 1 トークンで、`parts` は `[prefix, name]` です（`<svg:rect>` なら `["svg", "rect"]`）。名前の後は、属性を 1 つずつ読むループに入ります（selectorless 構文の分岐を含むその部分は [standalone シリーズの selectorless の章](../standalone/13-standalone-selectorless.md)で引用済み）。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1029–1045 （▶ の行: 1030, 1032, 1034, 1041–1042, 1044）

```ts
1029 │   private _consumeAttribute() {
1030 ▶     this._consumeAttributeName();
1031 │     this._attemptCharCodeUntilFn(isNotWhitespace);
1032 ▶     if (this._attemptCharCode(chars.$EQ)) {
1033 │       this._attemptCharCodeUntilFn(isNotWhitespace);
1034 ▶       this._consumeAttributeValue();
1035 │     }
1036 │     this._attemptCharCodeUntilFn(isNotWhitespace);
1037 │   }
1038 │ 
1039 │   private _consumeAttributeName() {
1040 │     const attrNameStart = this._cursor.peek();
1041 ▶     if (attrNameStart === chars.$SQ || attrNameStart === chars.$DQ) {
1042 ▶       throw this._createError(_unexpectedCharacterErrorMsg(attrNameStart), this._cursor.getSpan());
1043 │     }
1044 ▶     this._beginToken(TokenType.ATTR_NAME);
1045 │     let nameEndPredicate: (code: number) => boolean;
```

1030 行目で名前、1032 行目で `=` があれば 1034 行目で値です。`=` の無い `disabled` のような属性は名前のトークンだけになります。1041〜1042 行目、属性名が引用符で始まっていればエラーです。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1067–1089 （▶ の行: 1067, 1070–1072, 1081, 1084）

```ts
1067 ▶     } else if (attrNameStart === chars.$LBRACKET) {
1068 │       let openBrackets = 0;
1069 │ 
1070 ▶       // Be more permissive for which characters are allowed inside square-bracketed attributes,
1071 ▶       // because they usually end up being bound as attribute values. Some third-party packages
1072 ▶       // like Tailwind take advantage of this.
1073 │       nameEndPredicate = (code: number) => {
1074 │         if (code === chars.$LBRACKET) {
1075 │           openBrackets++;
1076 │         } else if (code === chars.$RBRACKET) {
1077 │           openBrackets--;
1078 │         }
1079 │         // Only check for name-ending characters if the brackets are balanced or mismatched.
1080 │         // Also interrupt the matching on new lines.
1081 ▶         return openBrackets <= 0 ? isNameEnd(code) : chars.isNewLine(code);
1082 │       };
1083 │     } else {
1084 ▶       nameEndPredicate = isNameEnd;
1085 │     }
1086 │ 
1087 │     const prefixAndName = this._consumePrefixAndName(nameEndPredicate);
1088 │     this._endToken(prefixAndName);
1089 │   }
```

`[` で始まる名前だけは名前の終わりの判定を緩めます。1081 行目、角括弧の対応が取れている間は、空白や `=` では名前を終わらせません。1070〜1072 行目のコメントのとおり、Tailwind のように `[class.w-[50%]]` と書けるようにするためです。それ以外の名前は 1084 行目の `isNameEnd`（空白・`>`・`<`・`/`・引用符・`=`・EOF）で終わります。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1091–1129 （▶ の行: 1092, 1094, 1097–1100, 1104, 1106, 1123–1125）

```ts
1091 │   private _consumeAttributeValue() {
1092 ▶     if (this._cursor.peek() === chars.$SQ || this._cursor.peek() === chars.$DQ) {
1093 │       const quoteChar = this._cursor.peek();
1094 ▶       this._consumeQuote(quoteChar);
1095 │       // In an attribute then end of the attribute value and the premature end to an interpolation
1096 │       // are both triggered by the `quoteChar`.
1097 ▶       const endPredicate = () => this._cursor.peek() === quoteChar;
1098 ▶       this._consumeWithInterpolation(
1099 ▶         TokenType.ATTR_VALUE_TEXT,
1100 ▶         TokenType.ATTR_VALUE_INTERPOLATION,
1101 │         endPredicate,
1102 │         endPredicate,
1103 │       );
1104 ▶       this._consumeQuote(quoteChar);
1105 │     } else {
1106 ▶       const endPredicate = () => isNameEnd(this._cursor.peek());
1107 │       this._consumeWithInterpolation(
1108 │         TokenType.ATTR_VALUE_TEXT,
1109 │         TokenType.ATTR_VALUE_INTERPOLATION,
1110 │         endPredicate,
1111 │         endPredicate,
1112 │       );
1113 │     }
1114 │   }
1115 │ 
1116 │   private _consumeQuote(quoteChar: number) {
1117 │     this._beginToken(TokenType.ATTR_QUOTE);
1118 │     this._requireCharCode(quoteChar);
1119 │     this._endToken([String.fromCodePoint(quoteChar)]);
1120 │   }
1121 │ 
1122 │   private _consumeTagOpenEnd() {
1123 ▶     const tokenType = this._attemptCharCode(chars.$SLASH)
1124 ▶       ? TokenType.TAG_OPEN_END_VOID
1125 ▶       : TokenType.TAG_OPEN_END;
1126 │     this._beginToken(tokenType);
1127 │     this._requireCharCode(chars.$GT);
1128 │     this._endToken([]);
1129 │   }
```

属性値は 1094 行目で開きの引用符を `ATTR_QUOTE` にし、1098〜1103 行目で**テキストと同じ `_consumeWithInterpolation`** を `ATTR_VALUE_TEXT` / `ATTR_VALUE_INTERPOLATION` の組で呼びます。だから `title="x {{ a }} y"` も `ATTR_VALUE_TEXT`・`ATTR_VALUE_INTERPOLATION`・`ATTR_VALUE_TEXT` の 3 つに切られます。1097 行目、終わりは閉じの引用符です。引用符の無い値は 1106 行目のとおり名前と同じ規則で終わります。最後の `>` は 1123〜1125 行目で、直前に `/` があれば `TAG_OPEN_END_VOID`、無ければ `TAG_OPEN_END` です。

## 6. テキストと補間

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1239–1270 （▶ の行: 1245, 1248, 1250–1251, 1253–1255, 1258, 1261, 1269）

```ts
1239 │   private _consumeWithInterpolation(
1240 │     textTokenType: TokenType,
1241 │     interpolationTokenType: TokenType,
1242 │     endPredicate: () => boolean,
1243 │     endInterpolation: () => boolean,
1244 │   ) {
1245 ▶     this._beginToken(textTokenType);
1246 │     const parts: string[] = [];
1247 │ 
1248 ▶     while (!endPredicate()) {
1249 │       const current = this._cursor.clone();
1250 ▶       if (this._attemptStr(INTERPOLATION.start)) {
1251 ▶         this._endToken([this._processCarriageReturns(parts.join(''))], current);
1252 │         parts.length = 0;
1253 ▶         this._consumeInterpolation(interpolationTokenType, current, endInterpolation);
1254 ▶         this._beginToken(textTokenType);
1255 ▶       } else if (this._cursor.peek() === chars.$AMPERSAND) {
1256 │         this._endToken([this._processCarriageReturns(parts.join(''))]);
1257 │         parts.length = 0;
1258 ▶         this._consumeEntity(textTokenType);
1259 │         this._beginToken(textTokenType);
1260 │       } else {
1261 ▶         parts.push(this._readChar());
1262 │       }
1263 │     }
1264 │ 
1265 │     // It is possible that an interpolation was started but not ended inside this text token.
1266 │     // Make sure that we reset the state of the lexer correctly.
1267 │     this._inInterpolation = false;
1268 │ 
1269 ▶     this._endToken([this._processCarriageReturns(parts.join(''))]);
1270 │   }
```

1. **1245 行目：まずテキストのトークンを開く**
2. **1248 行目：終わりの判定が真になるまで 1 文字ずつ**

   テキストなら 3 節 275 行目の `_isTextEnd`、属性値なら閉じ引用符です。
3. **1250〜1254 行目：`{{` を見つけたら**

   1251 行目で溜めた文字でテキストを閉じ（`{{` の直前が終点）、1253 行目で補間を 1 つ読み、1254 行目で次のテキストを開き直します。補間が先頭にあっても、溜めた文字が 0 個の `TEXT` が作られます。1 節の表の空の `TEXT` はこれです。
4. **1255〜1259 行目：`&` は文字参照**

   同じようにテキストを閉じて、`ENCODED_ENTITY` を作ります（`&amp;` → `["&", "&amp;"]`）。
5. **1261 行目：それ以外は 1 文字溜める**

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1286–1320 （▶ の行: 1287, 1293, 1295, 1299, 1303, 1305, 1309–1310, 1313, 1316, 1318）

```ts
1286 │     this._beginToken(interpolationTokenType, interpolationStart);
1287 ▶     parts.push(INTERPOLATION.start);
1288 │ 
1289 │     // Find the end of the interpolation, ignoring content inside quotes.
1290 │     const expressionStart = this._cursor.clone();
1291 │     let inQuote: number | null = null;
1292 │     let inComment = false;
1293 ▶     while (
1294 │       this._cursor.peek() !== chars.$EOF &&
1295 ▶       (prematureEndPredicate === null || !prematureEndPredicate())
1296 │     ) {
1297 │       const current = this._cursor.clone();
1298 │ 
1299 ▶       if (this._isTagStart()) {
1300 │         // We are starting what looks like an HTML element in the middle of this interpolation.
1301 │         // Reset the cursor to before the `<` character and end the interpolation token.
1302 │         // (This is actually wrong but here for backward compatibility).
1303 ▶         this._cursor = current;
1304 │         parts.push(this._getProcessedChars(expressionStart, current));
1305 ▶         this._endToken(parts);
1306 │         return;
1307 │       }
1308 │ 
1309 ▶       if (inQuote === null) {
1310 ▶         if (this._attemptStr(INTERPOLATION.end)) {
1311 │           // We are not in a string, and we hit the end interpolation marker
1312 │           parts.push(this._getProcessedChars(expressionStart, current));
1313 ▶           parts.push(INTERPOLATION.end);
1314 │           this._endToken(parts);
1315 │           return;
1316 ▶         } else if (this._attemptStr('//')) {
1317 │           // Once we are in a comment we ignore any quotes
1318 ▶           inComment = true;
1319 │         }
1320 │       }
```

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1322–1339 （▶ の行: 1324, 1327, 1330, 1332, 1337–1338）

```ts
1322 │       const char = this._cursor.peek();
1323 │       this._cursor.advance();
1324 ▶       if (char === chars.$BACKSLASH) {
1325 │         // Skip the next character because it was escaped.
1326 │         this._cursor.advance();
1327 ▶       } else if (char === inQuote) {
1328 │         // Exiting the current quoted string
1329 │         inQuote = null;
1330 ▶       } else if (!inComment && inQuote === null && chars.isQuote(char)) {
1331 │         // Entering a new quoted string
1332 ▶         inQuote = char;
1333 │       }
1334 │     }
1335 │ 
1336 │     // We hit EOF without finding a closing interpolation marker
1337 ▶     parts.push(this._getProcessedChars(expressionStart, this._cursor));
1338 ▶     this._endToken(parts);
1339 │   }
```

補間の終わり探しには 3 つの工夫があります。1309〜1310 行目、**引用符の中にいない**ときだけ `}}` を終わりとみなすので、`{{ '}}' }}` のような文字列は中断しません（1330〜1332 行目で引用符に入る・1327 行目で出る）。1316〜1318 行目、`//` の後はコメントとして引用符を数えません。1324 行目、`\` の次の 1 文字は飛ばします。

もう 1 つが 1299〜1306 行目です。補間の途中で `<b` のような**タグの始まりを見つけたら、そこで補間を打ち切ります**（1302 行目のコメントは「本当は正しくないが後方互換のため」）。閉じの `}}` が無いまま EOF に着いたら、1337〜1338 行目で終わりの印なしのトークンを作ります。どちらもエラーにはしません。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1403–1430 （▶ の行: 1404, 1409, 1414, 1421, 1424）

```ts
1403 │   private _isTextEnd(): boolean {
1404 ▶     if (this._isTagStart() || this._cursor.peek() === chars.$EOF) {
1405 │       return true;
1406 │     }
1407 │ 
1408 │     if (this._tokenizeIcu && !this._inInterpolation) {
1409 ▶       if (this.isExpansionFormStart()) {
1410 │         // start of an expansion form
1411 │         return true;
1412 │       }
1413 │ 
1414 ▶       if (this._cursor.peek() === chars.$RBRACE && this._isInExpansionCase()) {
1415 │         // end of and expansion case
1416 │         return true;
1417 │       }
1418 │     }
1419 │ 
1420 │     if (
1421 ▶       this._tokenizeBlocks &&
1422 │       !this._inInterpolation &&
1423 │       !this._isInExpansion() &&
1424 ▶       (this._isBlockStart() || this._isLetStart() || this._cursor.peek() === chars.$RBRACE)
1425 │     ) {
1426 │       return true;
1427 │     }
1428 │ 
1429 │     return false;
1430 │   }
```

テキストが終わるのは、1404 行目のタグの始まりか EOF、1409〜1416 行目の ICU の境目、そして 1421〜1424 行目の**ブロックの開始・`@let`・`}`** です。つまり `@if` や `}` はテキストの途中に書いても、そこでテキストが切られて 3 節のメインループに戻り、ブロックのトークンになります。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1563–1583 （▶ の行: 1569, 1572, 1574–1575）

```ts
1563 │ function mergeTextTokens(srcTokens: Token[]): Token[] {
1564 │   const dstTokens: Token[] = [];
1565 │   let lastDstToken: Token | undefined = undefined;
1566 │   for (let i = 0; i < srcTokens.length; i++) {
1567 │     const token = srcTokens[i];
1568 │     if (
1569 ▶       (lastDstToken && lastDstToken.type === TokenType.TEXT && token.type === TokenType.TEXT) ||
1570 │       (lastDstToken &&
1571 │         lastDstToken.type === TokenType.ATTR_VALUE_TEXT &&
1572 ▶         token.type === TokenType.ATTR_VALUE_TEXT)
1573 │     ) {
1574 ▶       lastDstToken.parts[0]! += token.parts[0];
1575 ▶       lastDstToken.sourceSpan.end = token.sourceSpan.end;
1576 │     } else {
1577 │       lastDstToken = token;
1578 │       dstTokens.push(lastDstToken);
1579 │     }
1580 │   }
1581 │ 
1582 │   return dstTokens;
1583 │ }
```

最後に 2 節の 118 行目から呼ばれる後処理です。連続する `TEXT` 同士・`ATTR_VALUE_TEXT` 同士を 1574〜1575 行目で 1 つにつなぎます。開始タグに失敗したときに作る `"<"` だけのテキスト（8 節の引用の 961〜962 行目）も、ここで前後のテキストと合わさります。

## 7. ブロックと @let を見分ける

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L694–703 （▶ の行: 696–697, 702）

```ts
694 │   private _isBlockStart(): boolean {
695 │     return (
696 ▶       this._cursor.peek() === chars.$AT &&
697 ▶       SUPPORTED_BLOCKS.some((blockName) => this._peekStr(blockName))
698 │     );
699 │   }
700 │ 
701 │   private _isLetStart(): boolean {
702 ▶     return this._cursor.peek() === chars.$AT && this._peekStr('@let');
703 │   }
```

判定は**前方一致**です。697 行目、2 節の 13 個の名前のどれかで始まっていればブロック、702 行目、`@let` で始まっていれば `@let`。単語の区切りは見ないので、`@iframe` は `@if` に、`@letter` は `@let` に一致します（DEMO で確かめられます）。逆に 13 個に無い `@foo` や、後ろが空白の `@` はただのテキストです。

> [!TIP]
> **新卒エンジニアへ**
>
> このサイトの章の本文（Angular のテンプレート）で、デコレータ名まで `&#64;Component` と文字参照で書いているのはこのためです。`@Component` は 13 個のどれでも始まりませんが、`@case` や `@defer` を説明する文章を書くと前方一致に掛かるので、「本文の `@` は必ず `&#64;`」と決めておくのが安全です。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L315–360 （▶ の行: 316–318, 320, 324, 328, 332, 345–347, 349–350, 358）

```ts
315 │   private _consumeBlockStart(start: CharacterCursor) {
316 ▶     this._requireCharCode(chars.$AT);
317 ▶     this._beginToken(TokenType.BLOCK_OPEN_START, start);
318 ▶     const startToken = this._endToken([this._getBlockName()]);
319 │ 
320 ▶     if (this._cursor.peek() === chars.$LPAREN) {
321 │       // Advance past the opening paren.
322 │       this._cursor.advance();
323 │       // Capture the parameters.
324 ▶       this._consumeBlockParameters();
325 │       // Allow spaces before the closing paren.
326 │       this._attemptCharCodeUntilFn(isNotWhitespace);
327 │ 
328 ▶       if (this._attemptCharCode(chars.$RPAREN)) {
329 │         // Allow spaces after the paren.
330 │         this._attemptCharCodeUntilFn(isNotWhitespace);
331 │       } else {
332 ▶         startToken.type = TokenType.INCOMPLETE_BLOCK_OPEN;
333 │         return;
334 │       }
335 │     }
336 │ 
337 │     if (startToken.parts[0] === 'default never' && this._attemptCharCode(chars.$SEMICOLON)) {
338 │       this._beginToken(TokenType.BLOCK_OPEN_END);
339 │       this._endToken([]);
340 │       this._beginToken(TokenType.BLOCK_CLOSE);
341 │       this._endToken([]);
342 │       return;
343 │     }
344 │ 
345 ▶     if (this._attemptCharCode(chars.$LBRACE)) {
346 ▶       this._beginToken(TokenType.BLOCK_OPEN_END);
347 ▶       this._endToken([]);
348 │     } else if (
349 ▶       this._isBlockStart() &&
350 ▶       (startToken.parts[0] === 'case' || startToken.parts[0] === 'default')
351 │     ) {
352 │       // We only allow @case statements to be consecutive without a block in between.
353 │       this._beginToken(TokenType.BLOCK_OPEN_END);
354 │       this._endToken([]);
355 │       this._beginToken(TokenType.BLOCK_CLOSE);
356 │       this._endToken([]);
357 │     } else {
358 ▶       startToken.type = TokenType.INCOMPLETE_BLOCK_OPEN;
359 │     }
360 │   }
```

1. **317〜318 行目：`BLOCK_OPEN_START`**

   `parts` はブロック名 1 つ。名前を読む `_getBlockName` は `else if` のように空白を挟んだ名前も 1 つにまとめます。
2. **320〜335 行目：`(` があれば引数**

   324 行目の `_consumeBlockParameters` が `;` ごとに `BLOCK_PARAMETER` を作ります。`@for (x of xs; track x.id)` は `"x of xs"` と `"track x.id"` の 2 つです。中身を式として解釈するのは [第 8 回](08-compiler-control-flow-blocks.md)の段です。閉じの `)` が無ければ 332 行目で `INCOMPLETE_BLOCK_OPEN`。
3. **345〜347 行目：`{` で `BLOCK_OPEN_END`**

   `{` が無ければ、348〜356 行目の `@case` / `@default` の連続という例外を除き、358 行目で `INCOMPLETE_BLOCK_OPEN` です。ブロックの終わりの `}` は 3 節 268 行目で別に `BLOCK_CLOSE` になるので、**字句解析器は開きと閉じの対応を数えていません**。対応づけは [第 4 回](04-compiler-html-parser.md)の木を組む段の仕事です。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L412–450 （▶ の行: 413–414, 417, 421, 425, 431–432, 438, 442–443, 447）

```ts
412 │   private _consumeLetDeclaration(start: CharacterCursor) {
413 ▶     this._requireStr('@let');
414 ▶     this._beginToken(TokenType.LET_START, start);
415 │ 
416 │     // Require at least one white space after the `@let`.
417 ▶     if (chars.isWhitespace(this._cursor.peek())) {
418 │       this._attemptCharCodeUntilFn(isNotWhitespace);
419 │     } else {
420 │       const token = this._endToken([this._cursor.getChars(start)]);
421 ▶       token.type = TokenType.INCOMPLETE_LET;
422 │       return;
423 │     }
424 │ 
425 ▶     const startToken = this._endToken([this._getLetDeclarationName()]);
426 │ 
427 │     // Skip over white space before the equals character.
428 │     this._attemptCharCodeUntilFn(isNotWhitespace);
429 │ 
430 │     // Expect an equals sign.
431 ▶     if (!this._attemptCharCode(chars.$EQ)) {
432 ▶       startToken.type = TokenType.INCOMPLETE_LET;
433 │       return;
434 │     }
435 │ 
436 │     // Skip spaces after the equals.
437 │     this._attemptCharCodeUntilFn((code) => isNotWhitespace(code) && !chars.isNewLine(code));
438 ▶     this._consumeLetDeclarationValue();
439 │ 
440 │     // Terminate the `@let` with a semicolon.
441 │     const endChar = this._cursor.peek();
442 ▶     if (endChar === chars.$SEMICOLON) {
443 ▶       this._beginToken(TokenType.LET_END);
444 │       this._cursor.advance();
445 │       this._endToken([]);
446 │     } else {
447 ▶       startToken.type = TokenType.INCOMPLETE_LET;
448 │       startToken.sourceSpan = this._cursor.getSpan(start);
449 │     }
450 │   }
```

`@let` は 3 トークンです。414 行目で `LET_START`（`parts` は名前）、438 行目の `_consumeLetDeclarationValue` が 引用符の中を飛ばしながら `;` の手前までを `LET_VALUE` にし、443 行目で `;` を `LET_END` にします。417 行目、`@let` の直後に空白が無ければ 421 行目で `INCOMPLETE_LET`、`=` が無ければ 432 行目、`;` で終わらなければ 447 行目で同じく `INCOMPLETE_LET` です。

## 8. &lt;script&gt; や &lt;textarea&gt; の中身は生のテキスト

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L944–977 （▶ の行: 970, 972–975）

```ts
944 │ 
945 │       if (openToken.type === TokenType.COMPONENT_OPEN_START) {
946 │         this._consumeComponentOpenEnd();
947 │       } else {
948 │         this._consumeTagOpenEnd();
949 │       }
950 │     } catch (e) {
951 │       if (e instanceof ParseError) {
952 │         if (openToken) {
953 │           // We errored before we could close the opening tag, so it is incomplete.
954 │           openToken.type =
955 │             openToken.type === TokenType.COMPONENT_OPEN_START
956 │               ? TokenType.INCOMPLETE_COMPONENT_OPEN
957 │               : TokenType.INCOMPLETE_TAG_OPEN;
958 │         } else {
959 │           // When the start tag is invalid, assume we want a "<" as text.
960 │           // Back to back text tokens are merged at the end.
961 │           this._beginToken(TokenType.TEXT, start);
962 │           this._endToken(['<']);
963 │         }
964 │         return;
965 │       }
966 │ 
967 │       throw e;
968 │     }
969 │ 
970 ▶     const contentTokenType = this._getTagDefinition(tagName).getContentType(prefix);
971 │ 
972 ▶     if (contentTokenType === TagContentType.RAW_TEXT) {
973 ▶       this._consumeRawTextWithTagClose(openToken, closingTagName, false);
974 ▶     } else if (contentTokenType === TagContentType.ESCAPABLE_RAW_TEXT) {
975 ▶       this._consumeRawTextWithTagClose(openToken, closingTagName, true);
976 │     }
977 │   }
```

開始タグを読み終えたところで、970 行目で `getTagDefinition(tagName).getContentType()` を尋ねます。答えが `RAW_TEXT` か `ESCAPABLE_RAW_TEXT` なら、**閉じタグまでをタグとして読まずに丸ごと取り込みます**。

📄 `angular/packages/compiler/src/ml_parser/html_tags.ts` L165–180 （▶ の行: 167–168, 173, 178）

```ts
165 │       'pre': new HtmlTagDefinition({ignoreFirstLf: true}),
166 │       'listing': new HtmlTagDefinition({ignoreFirstLf: true}),
167 ▶       'style': new HtmlTagDefinition({contentType: TagContentType.RAW_TEXT}),
168 ▶       'script': new HtmlTagDefinition({contentType: TagContentType.RAW_TEXT}),
169 │       'title': new HtmlTagDefinition({
170 │         // The browser supports two separate `title` tags which have to use
171 │         // a different content type: `HTMLTitleElement` and `SVGTitleElement`
172 │         contentType: {
173 ▶           default: TagContentType.ESCAPABLE_RAW_TEXT,
174 │           svg: TagContentType.PARSABLE_DATA,
175 │         },
176 │       }),
177 │       'textarea': new HtmlTagDefinition({
178 ▶         contentType: TagContentType.ESCAPABLE_RAW_TEXT,
179 │         ignoreFirstLf: true,
180 │       }),
```

`<style>` と `<script>` は `RAW_TEXT`（167〜168 行目）、`<title>`（HTML のもの）と `<textarea>` は `ESCAPABLE_RAW_TEXT`（173・178 行目）です。HTML の仕様でもこの 4 つは中身にタグを書けない要素で、ブラウザも同じ読み方をします。そうしないと `<script>if (a<b) {}</script>` の `<b` がタグに見えてしまいます。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L755–775 （▶ の行: 756, 760, 762, 765, 768, 771）

```ts
755 │   private _consumeRawText(consumeEntities: boolean, endMarkerPredicate: () => boolean): void {
756 ▶     this._beginToken(consumeEntities ? TokenType.ESCAPABLE_RAW_TEXT : TokenType.RAW_TEXT);
757 │     const parts: string[] = [];
758 │     while (true) {
759 │       const tagCloseStart = this._cursor.clone();
760 ▶       const foundEndMarker = endMarkerPredicate();
761 │       this._cursor = tagCloseStart;
762 ▶       if (foundEndMarker) {
763 │         break;
764 │       }
765 ▶       if (consumeEntities && this._cursor.peek() === chars.$AMPERSAND) {
766 │         this._endToken([this._processCarriageReturns(parts.join(''))]);
767 │         parts.length = 0;
768 ▶         this._consumeEntity(TokenType.ESCAPABLE_RAW_TEXT);
769 │         this._beginToken(TokenType.ESCAPABLE_RAW_TEXT);
770 │       } else {
771 ▶         parts.push(this._readChar());
772 │       }
773 │     }
774 │     this._endToken([this._processCarriageReturns(parts.join(''))]);
775 │   }
```

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L979–1000 （▶ の行: 985–986, 988, 990, 992）

```ts
 979 │   private _consumeRawTextWithTagClose(
 980 │     openToken: TagOpenStartToken | ComponentOpenStartToken,
 981 │     tagName: string,
 982 │     consumeEntities: boolean,
 983 │   ) {
 984 │     this._consumeRawText(consumeEntities, () => {
 985 ▶       if (!this._attemptCharCode(chars.$LT)) return false;
 986 ▶       if (!this._attemptCharCode(chars.$SLASH)) return false;
 987 │       this._attemptCharCodeUntilFn(isNotWhitespace);
 988 ▶       if (!this._attemptStrCaseInsensitive(tagName)) return false;
 989 │       this._attemptCharCodeUntilFn(isNotWhitespace);
 990 ▶       return this._attemptCharCode(chars.$GT);
 991 │     });
 992 ▶     this._beginToken(
 993 │       openToken.type === TokenType.COMPONENT_OPEN_START
 994 │         ? TokenType.COMPONENT_CLOSE
 995 │         : TokenType.TAG_CLOSE,
 996 │     );
 997 │     this._requireCharCodeUntilFn((code) => code === chars.$GT, 3);
 998 │     this._cursor.advance(); // Consume the `>`
 999 │     this._endToken(openToken.parts);
1000 │   }
```

760 行目、1 文字進むごとに「ここから閉じタグか」を試します。その判定が 985〜990 行目で、`</` + 空白 + 同じタグ名（988 行目、大文字小文字を区別しない）+ `>` です。違いは 765 行目の 1 つだけで、`ESCAPABLE_RAW_TEXT` は `&` の文字参照を解き、`RAW_TEXT` は解きません。どちらも **補間 `{{` もブロック `@` も探しません**（DEMO の `<textarea>` と `<script>` の例）。

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L149–157 （▶ の行: 150–152, 155, 157）

```ts
149 │     const preparsedElement = preparseElement(element);
150 ▶     if (preparsedElement.type === PreparsedElementType.SCRIPT) {
151 ▶       return null;
152 ▶     } else if (preparsedElement.type === PreparsedElementType.STYLE) {
153 │       const contents = textContents(element);
154 │       if (contents !== null) {
155 ▶         this.styles.push(contents);
156 │       }
157 ▶       return null;
```

なお、この 2 種類のうち `<script>` と `<style>` は R3 AST に入りません。150〜151 行目で `<script>` は捨てられ、152〜157 行目で `<style>` の中身はコンポーネントのスタイルとして集められます（R3 AST の段は [第 7 回](07-compiler-r3-ast.md)）。

## 9. カーソル：1 文字進む、の中身

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1707–1725 （▶ の行: 1708, 1710, 1713–1717, 1719, 1724）

```ts
1707 │   protected advanceState(state: CursorState) {
1708 ▶     if (state.offset >= this.end) {
1709 │       this.state = state;
1710 ▶       throw new CursorError('Unexpected character "EOF"', this);
1711 │     }
1712 │     const currentChar = this.charAt(state.offset);
1713 ▶     if (currentChar === chars.$LF) {
1714 ▶       state.line++;
1715 ▶       state.column = 0;
1716 ▶     } else if (!chars.isNewLine(currentChar)) {
1717 ▶       state.column++;
1718 │     }
1719 ▶     state.offset++;
1720 │     this.updatePeek(state);
1721 │   }
1722 │ 
1723 │   protected updatePeek(state: CursorState): void {
1724 ▶     state.peek = state.offset >= this.end ? chars.$EOF : this.charAt(state.offset);
1725 │   }
```

`PlainCharacterCursor` の状態は `peek`（いまの文字コード）・`offset`・`line`・`column` の 4 つです。1713〜1718 行目、`\n` で行を 1 つ増やして列を 0 に戻し、それ以外の改行文字（`\r`）では列を増やしません。1708〜1710 行目、範囲の終わりを越えて進もうとすると `CursorError` で、4 節の `handleError` が位置付きの `ParseError` に直します。トークナイザは「先を試して、だめなら戻る」をよく行うので（たとえば `_attemptStr`）、カーソルは `clone()` で複製できる小さな値になっています。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1782–1807 （▶ の行: 1785, 1788, 1791, 1794–1795, 1801–1802）

```ts
1782 │   protected processEscapeSequence(): void {
1783 │     const peek = () => this.internalState.peek;
1784 │ 
1785 ▶     if (peek() === chars.$BACKSLASH) {
1786 │       // We have hit an escape sequence so we need the internal state to become independent
1787 │       // of the external state.
1788 ▶       this.internalState = {...this.state};
1789 │ 
1790 │       // Move past the backslash
1791 ▶       this.advanceState(this.internalState);
1792 │ 
1793 │       // First check for standard control char sequences
1794 ▶       if (peek() === chars.$n) {
1795 ▶         this.state.peek = chars.$LF;
1796 │       } else if (peek() === chars.$r) {
1797 │         this.state.peek = chars.$CR;
1798 │       } else if (peek() === chars.$v) {
1799 │         this.state.peek = chars.$VTAB;
1800 │       } else if (peek() === chars.$t) {
1801 ▶         this.state.peek = chars.$TAB;
1802 ▶       } else if (peek() === chars.$b) {
1803 │         this.state.peek = chars.$BSPACE;
1804 │       } else if (peek() === chars.$f) {
1805 │         this.state.peek = chars.$FF;
1806 │       }
1807 │ 
```

`EscapedCharacterCursor` はインラインテンプレートを .ts ファイルから直接読むときのカーソルです（[第 2 回](02-compiler-entry.md) 3 節）。1785 行目、`\` を見つけたら、1788 行目で内部の位置（ファイル上の本当の位置）と外向きの位置を分け、1791 行目でバックスラッシュを飛ばし、1794〜1795 行目で `\n` の 2 文字を**改行 1 文字として見せます**。字句解析器の本体は普通の文字を読んでいるつもりのまま、`sourceSpan` は .ts ファイルの行・列を指し続けます。DEMO の最後から 3 つ目の例では、ソースの `a\nb A`（12 文字）が `TEXT` の中身では改行入りの `a↵b A` になっています。

## ここまでの呼び出し

- 👤 `parseTemplate(template, url, options)` — render3/view/template.ts L140 — *第 2 回*
  - `HtmlParser.parse()` → `Parser.parse()` — ml\_parser/parser.ts L79
    - `tokenize(source, url, getHtmlTagDefinition, options)` — ml\_parser/lexer.ts L109
      - `new _Tokenizer(file, getTagDefinition, options)` — lexer.ts L190 — *PlainCharacterCursor か EscapedCharacterCursor*
      - `_Tokenizer.tokenize()` — lexer.ts L230 — *1 文字目で分岐するループ*
        - `_consumeTagOpen()` → `_consumeTagOpenStart` / `_consumeAttribute` / `_consumeTagOpenEnd` — lexer.ts L880 / L1002 / L1029 / L1122
          - `_consumeRawTextWithTagClose()` — lexer.ts L979 — *script / style / textarea / title のとき*
        - `_consumeBlockStart()` / `_consumeBlockEnd()` / `_consumeLetDeclaration()` — lexer.ts L315 / L362 / L412
        - `_consumeWithInterpolation(TEXT, INTERPOLATION, ...)` — lexer.ts L1239
          - `_consumeInterpolation()` / `_consumeEntity()` — lexer.ts L1280 / L705
      - `mergeTextTokens(tokens)` — lexer.ts L1563
    - `new _TreeBuilder(tokens).build()` — parser.ts L81-82 — *第 4 回*

> **🧪 DEMO — 実際のトークン列（固定の例）**
>
> `tokenize` は `@angular/compiler` の公開 API ではないためブラウザでは呼べません。ここに出すのは、angular リポジトリの `lexer.ts`（22.2.0-next.7）を束ねて Node で実際に呼んだ結果です。オプションは `parseTemplate` と同じ `tokenizeExpansionForms`・`tokenizeBlocks`・`tokenizeLet` を `true`。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-html-lexer)

## 聞かれそうな質問

**Q. {{ }} はどこで見つかるのですか？HTML の段ですか、式の段ですか？**

両方です。境目を見つけるのは字句解析器で、6 節の 1250 行目が `{{` を見つけて `INTERPOLATION` トークンを作ります。引用符の中の `}}` を無視する・タグが始まったら打ち切る、といった判定はこの段です。ただし、次の構文解析の段でトークンはいったん 1 つの文字列に戻ります。

📄 `angular/packages/compiler/src/ml_parser/parser.ts` L354–372 （▶ の行: 355, 360, 366, 370）

```ts
354 │     while (
355 ▶       this._peek.type === TokenType.INTERPOLATION ||
356 │       this._peek.type === TokenType.TEXT ||
357 │       this._peek.type === TokenType.ENCODED_ENTITY
358 │     ) {
359 │       token = this._advance();
360 ▶       tokens.push(token);
361 │       if (token.type === TokenType.INTERPOLATION) {
362 │         // For backward compatibility we decode HTML entities that appear in interpolation
363 │         // expressions. This is arguably a bug, but it could be a considerable breaking change to
364 │         // fix it. It should be addressed in a larger project to refactor the entire parser/lexer
365 │         // chain after View Engine has been removed.
366 ▶         text += token.parts.join('').replace(/&([^;]+);/g, decodeEntity);
367 │       } else if (token.type === TokenType.ENCODED_ENTITY) {
368 │         text += token.parts[0];
369 │       } else {
370 ▶         text += token.parts.join('');
371 │       }
372 │     }
```

366 行目、`INTERPOLATION` の `parts`（`"{{"`・式・`"}}"`）を `join('')` して元の文字列に戻し、`html.Text` の `value` にします（トークン自体も `tokens` として残します）。その文字列を R3 AST の段で式のパーサがもう一度 `{{` で分け、中身を式としてパースします （[第 5 回](05-compiler-expression-parser.md)）。残したトークンは、そのとき元のテンプレート上の位置を計算するのに使われます。

**Q. @ を文字として書きたいとき、なぜ `&#64;` が必要なのですか？**

7 節の判定が前方一致だからです。`@` の後ろが `if`・`for`・`case`・`default`・`error`・`let` などで始まると、単語の途中でもブロックや `@let` として読まれ、`{` が無ければ `INCOMPLETE_BLOCK_OPEN` になり、構文解析の段で「Incomplete block ... use the "&#64;" HTML entity instead.」というエラーになります（DEMO の「@ の後ろが予約語」）。文字参照なら字句解析器は `&` で分岐するので、`@` という文字はカーソルに現れません。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L705–727 （▶ の行: 706, 709, 726–727）

```ts
705 │   private _consumeEntity(textTokenType: TokenType): void {
706 ▶     this._beginToken(TokenType.ENCODED_ENTITY);
707 │     const start = this._cursor.clone();
708 │     this._cursor.advance();
709 ▶     if (this._attemptCharCode(chars.$HASH)) {
710 │       const isHex = this._attemptCharCode(chars.$x) || this._attemptCharCode(chars.$X);
711 │       const codeStart = this._cursor.clone();
712 │       this._attemptCharCodeUntilFn(isDigitEntityEnd);
713 │       if (this._cursor.peek() != chars.$SEMICOLON) {
714 │         // Advance cursor to include the peeked character in the string provided to the error
715 │         // message.
716 │         this._cursor.advance();
717 │         const entityType = isHex ? CharacterReferenceType.HEX : CharacterReferenceType.DEC;
718 │         throw this._createError(
719 │           _unparsableEntityErrorMsg(entityType, this._cursor.getChars(start)),
720 │           this._cursor.getSpan(),
721 │         );
722 │       }
723 │       const strNum = this._cursor.getChars(codeStart);
724 │       this._cursor.advance();
725 │       try {
726 ▶         const charCode = parseInt(strNum, isHex ? 16 : 10);
727 ▶         this._endToken([String.fromCodePoint(charCode), this._cursor.getChars(start)]);
```

706 行目で `ENCODED_ENTITY` を開き、709 行目の `#` で数値参照、726〜727 行目で `["@", "&#64;"]` のトークンを作ります。ブロックの判定（696 行目）は「カーソルが指す文字が `@` か」を見るので、ここを通った `@` は判定に掛かりません。13 個の名前で始まらない `@`（メールアドレスの `a@b.com` など）は、そのまま書いても問題ありません。

**Q. &lt;textarea&gt; の中の {{ }} は補間されますか？**

されます。ただし字句解析の段ではありません。`<textarea>` の中身は 8 節のとおり `ESCAPABLE_RAW_TEXT` として読まれ、`INTERPOLATION` トークンは作られません。そのテキストが R3 AST の段に来ると、テキストノードは常に補間を探されます。

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L301–305 （▶ の行: 304）

```ts
301 │   visitText(text: html.Text): t.Node | null {
302 │     return this.processedNodes.has(text)
303 │       ? null
304 ▶       : this._visitTextWithInterpolation(text.value, text.sourceSpan, text.tokens, text.i18n);
305 │   }
```

304 行目、`visitText` はテキストの `value` を `_visitTextWithInterpolation` に渡します。実際に `<textarea>{{ v }} &amp; <b></textarea>` を `parseTemplate` に通すと、`BoundText "{{ v }} &"` と `Text " <b>"` の 2 つになりました（@angular/compiler 22.1.6 で確認）。`<b>` はタグにならず、補間は効きます。`<script>` と `<style>` は 8 節の最後のとおり R3 AST から外されるので、補間されることはありません。

**Q. テンプレートに `{` や `}` を 1 つだけ書くとなぜエラーになるのですか？**

`}` は 3 節 266〜268 行目でブロックの終わり（`BLOCK_CLOSE`）になり、対応するブロックが無いので次の段で「Unexpected closing block」になります。`{` は 2 節 195 行目で ICU を読む設定なので ICU の始まりになり、続きが ICU の形でなければ 4 節 543〜544 行目の「unescaped "{"」のエラーです。どちらも `&#123;` / `&#125;` と書けば 6 節の 1255 行目で文字参照として読まれ、ブロックとも ICU とも無関係になります。

## 読み終えて

- `tokenize` は `_Tokenizer` のループで 1 文字目を見て分岐し、`_beginToken` → `_endToken` で `type`・`parts`・`sourceSpan` のトークンを作る。エラーは集めて先へ進む
- テキストと属性値は同じ `_consumeWithInterpolation` で、`{{` と `&` のところでトークンを区切る。補間の終わりは引用符の外の `}}`
- `@if` などは 13 個の名前の前方一致、`@let` も前方一致。`}` は ICU の外なら常に `BLOCK_CLOSE`。開きと閉じの対応は数えない
- `<script>` / `<style>` は `RAW_TEXT`、`<textarea>` / `<title>` は `ESCAPABLE_RAW_TEXT`。中身はタグとしても補間としても読まない
- インラインテンプレートは `EscapedCharacterCursor` が JS のエスケープを解きながら .ts ファイルを直接読み、位置は .ts のまま

---

← 前: [コンパイラの入口：ngtsc の ComponentDecoratorHandler から compileComponentFromMetadata まで](02-compiler-entry.md)  
次: [HTML の構文解析：トークンから要素の木へ、暗黙の閉じタグと空白の除去](04-compiler-html-parser.md) →
