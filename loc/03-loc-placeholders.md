[目次](../README.md) › [i18n と $localize の内側](README.md) › 第 3 回 / 全 20 回

# プレースホルダーの名前：INTERPOLATION と START\_BOLD\_TEXT

> メッセージの中の {{ name }} や &lt;b&gt; や @if に名前を付ける PlaceholderRegistry（placeholder.ts）。タグの名前から START\_BOLD\_TEXT・START\_LINK のような名前を作る表、同じ名前が重なるときの \_1、補間に // i18n(ph="name") と書いて名前を決める書き方。翻訳する人に見える名前と、実行時の �0� のような印の違い。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/loc-placeholders)

---

翻訳する人には `Hi {$INTERPOLATION}, {$START_BOLD_TEXT}you{$CLOSE_BOLD_TEXT}` のような文が届きます。この `INTERPOLATION` や `START_BOLD_TEXT` を決めているのが `PlaceholderRegistry` です。この章では、タグの名前から名前を作る表、同じものに同じ名前を返す仕組み、重なったときの `_1`、補間に `// i18n(ph="name")` と書いて名前を決める書き方、そして翻訳する人の見る名前と実行時の印 `�0�`・`�#2�` がどこで結び付くかを読みます。

読む対象は `packages/compiler/src/i18n/serializers/placeholder.ts`、`packages/compiler/src/i18n/i18n_parser.ts` の補間の部分、`packages/compiler/src/render3/view/i18n/util.ts` です。

1. [1. 全体像](01-loc-overview.md)
2. [2. 印とメッセージ](02-loc-markup.md)
3. **3. プレースホルダー**（この章）
4. [4. メッセージ ID](04-loc-message-id.md)
5. [5. コンパイラの段](05-loc-pipeline-phases.md)
6. [6. $localize の出力](06-loc-const-collection.md)
7. [7. ICU のコンパイル](07-loc-icu-compile.md)
8. [8. 設定と古い抽出](08-loc-compiler-options.md)
9. [9. 実行時（1）解析](09-loc-runtime-start.md)
10. [10. 実行時（2）DOM](10-loc-runtime-dom.md)
11. [11. 実行時（3）ICU](11-loc-runtime-icu.md)
12. [12. ロケールのデータ](12-loc-locale-data.md)
13. [13. $localize](13-loc-localize-tag.md)
14. [14. 実行時の翻訳](14-loc-runtime-translations.md)
15. [15. 抽出](15-loc-extract-tool.md)
16. [16. 翻訳ファイルを書く](16-loc-serializers.md)
17. [17. 翻訳ファイルを読む](17-loc-translation-parsers.md)
18. [18. 差し込み](18-loc-translate-tool.md)
19. [19. テスト](19-loc-testing.md)
20. [20. issue と PR を読む](20-loc-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> **プレースホルダー**は、翻訳文の中で「ここに元のテンプレートの何かが入る」ことを示す穴です。翻訳する人は穴の**位置**を動かせますが、中身（タグや式）は変えられません。穴に付く名前は、翻訳する人が「どの穴か」を見分けるためのものです。

## 1. タグの名前から作る表

📄 `angular/packages/compiler/src/i18n/serializers/placeholder.ts` L9–40 （▶ の行: 10–12, 23, 25, 29）

```ts
 9 │ const TAG_TO_PLACEHOLDER_NAMES: {[k: string]: string} = {
10 ▶   'A': 'LINK',
11 ▶   'B': 'BOLD_TEXT',
12 ▶   'BR': 'LINE_BREAK',
13 │   'EM': 'EMPHASISED_TEXT',
14 │   'H1': 'HEADING_LEVEL1',
15 │   'H2': 'HEADING_LEVEL2',
16 │   'H3': 'HEADING_LEVEL3',
17 │   'H4': 'HEADING_LEVEL4',
18 │   'H5': 'HEADING_LEVEL5',
19 │   'H6': 'HEADING_LEVEL6',
20 │   'HR': 'HORIZONTAL_RULE',
21 │   'I': 'ITALIC_TEXT',
22 │   'LI': 'LIST_ITEM',
23 ▶   'LINK': 'MEDIA_LINK',
24 │   'OL': 'ORDERED_LIST',
25 ▶   'P': 'PARAGRAPH',
26 │   'Q': 'QUOTATION',
27 │   'S': 'STRIKETHROUGH_TEXT',
28 │   'SMALL': 'SMALL_TEXT',
29 ▶   'SUB': 'SUBSTRIPT',
30 │   'SUP': 'SUPERSCRIPT',
31 │   'TBODY': 'TABLE_BODY',
32 │   'TD': 'TABLE_CELL',
33 │   'TFOOT': 'TABLE_FOOTER',
34 │   'TH': 'TABLE_HEADER_CELL',
35 │   'THEAD': 'TABLE_HEADER',
36 │   'TR': 'TABLE_ROW',
37 │   'TT': 'MONOSPACED_TEXT',
38 │   'U': 'UNDERLINED_TEXT',
39 │   'UL': 'UNORDERED_LIST',
40 │ };
```

よく使う 30 個のタグにだけ、読みやすい名前が決めてあります。10 行目の `A` が `LINK`、11 行目の `B` が `BOLD_TEXT`、12 行目の `BR` が `LINE_BREAK` です。23 行目の `LINK`（`<link>` 要素）は `A` と区別して `MEDIA_LINK` です。

> [!NOTE]
> **さらに深く**
>
> 29 行目の `SUB` は `SUBSTRIPT`（SUBSCRIPT の綴り違い）です。これは直せません。名前はメッセージの文（`{$START_SUBSTRIPT}`）に入り、文はメッセージ ID の材料なので、綴りを直すと `<sub>` を含むすべてのメッセージの ID が変わり、世界中の翻訳ファイルが合わなくなります（ID の作り方は[第 4 回](04-loc-message-id.md)）。この表を触る PR は、それだけで破壊的変更です。

## 2. 開始タグと閉じタグ

📄 `angular/packages/compiler/src/i18n/serializers/placeholder.ts` L42–81 （▶ の行: 49, 51, 54–56, 60–61, 63, 69, 76）

```ts
42 │ /**
43 │  * Creates unique names for placeholder with different content.
44 │  *
45 │  * Returns the same placeholder name when the content is identical.
46 │  */
47 │ export class PlaceholderRegistry {
48 │   // Count the occurrence of the base name top generate a unique name
49 ▶   private _placeHolderNameCounts: {[k: string]: number} = {};
50 │   // Maps signature to placeholder names
51 ▶   private _signatureToName: {[k: string]: string} = {};
52 │ 
53 │   getStartTagPlaceholderName(tag: string, attrs: {[k: string]: string}, isVoid: boolean): string {
54 ▶     const signature = this._hashTag(tag, attrs, isVoid);
55 ▶     if (this._signatureToName[signature]) {
56 ▶       return this._signatureToName[signature];
57 │     }
58 │ 
59 │     const upperTag = tag.toUpperCase();
60 ▶     const baseName = TAG_TO_PLACEHOLDER_NAMES[upperTag] || `TAG_${upperTag}`;
61 ▶     const name = this._generateUniqueName(isVoid ? baseName : `START_${baseName}`);
62 │ 
63 ▶     this._signatureToName[signature] = name;
64 │ 
65 │     return name;
66 │   }
67 │ 
68 │   getCloseTagPlaceholderName(tag: string): string {
69 ▶     const signature = this._hashClosingTag(tag);
70 │     if (this._signatureToName[signature]) {
71 │       return this._signatureToName[signature];
72 │     }
73 │ 
74 │     const upperTag = tag.toUpperCase();
75 │     const baseName = TAG_TO_PLACEHOLDER_NAMES[upperTag] || `TAG_${upperTag}`;
76 ▶     const name = this._generateUniqueName(`CLOSE_${baseName}`);
77 │ 
78 │     this._signatureToName[signature] = name;
79 │ 
80 │     return name;
81 │   }
```

1. **2 つの控え（49・51 行目）**

   `_placeHolderNameCounts` は「この基の名前を何回使ったか」、`_signatureToName` は「この中身にはどの名前を付けたか」です。どちらも `PlaceholderRegistry` 1 つの中だけの控えで、`PlaceholderRegistry` はメッセージごとに作り直されます（[第 2 回](02-loc-markup.md)で見た `toI18nMessage`）。
2. **中身の署名を作る（54 行目）**

   タグの名前・属性・void かどうかから、`<b class=x></b>` のような文字列（署名）を作ります（4 節）。
3. **同じ署名なら同じ名前（55・56 行目）**

   同じメッセージの中に属性まで同じ `<b>` が 2 つあれば、どちらも `START_BOLD_TEXT` です。
4. **基の名前を決める（60・61 行目）**

   表に無いタグは `TAG_` + 大文字のタグ名（`my-cmp` → `TAG_MY-CMP`）。void の要素はそのまま、そうでなければ `START_` を前に付けます。だから `<br>` は `START_LINE_BREAK` ではなく `LINE_BREAK` 1 つで、閉じの名前がありません。
5. **閉じタグは属性を見ない（69・76 行目）**

   69 行目の署名はタグの名前だけで作ります。だから `<b>` と `<b class="x">` は開始が `START_BOLD_TEXT` と `START_BOLD_TEXT_1` に分かれても、閉じは同じ `CLOSE_BOLD_TEXT` です（デモの初期値で確かめられます）。

## 3. 補間とブロックの名前

📄 `angular/packages/compiler/src/i18n/serializers/placeholder.ts` L83–120 （▶ の行: 83, 85–86, 90, 96–97, 100, 106, 117）

```ts
 83 ▶   getPlaceholderName(name: string, content: string): string {
 84 │     const upperName = name.toUpperCase();
 85 ▶     const signature = `PH: ${upperName}=${content}`;
 86 ▶     if (this._signatureToName[signature]) {
 87 │       return this._signatureToName[signature];
 88 │     }
 89 │ 
 90 ▶     const uniqueName = this._generateUniqueName(upperName);
 91 │     this._signatureToName[signature] = uniqueName;
 92 │ 
 93 │     return uniqueName;
 94 │   }
 95 │ 
 96 ▶   getUniquePlaceholder(name: string): string {
 97 ▶     return this._generateUniqueName(name.toUpperCase());
 98 │   }
 99 │ 
100 ▶   getStartBlockPlaceholderName(name: string, parameters: string[]): string {
101 │     const signature = this._hashBlock(name, parameters);
102 │     if (this._signatureToName[signature]) {
103 │       return this._signatureToName[signature];
104 │     }
105 │ 
106 ▶     const placeholder = this._generateUniqueName(`START_BLOCK_${this._toSnakeCase(name)}`);
107 │     this._signatureToName[signature] = placeholder;
108 │     return placeholder;
109 │   }
110 │ 
111 │   getCloseBlockPlaceholderName(name: string): string {
112 │     const signature = this._hashClosingBlock(name);
113 │     if (this._signatureToName[signature]) {
114 │       return this._signatureToName[signature];
115 │     }
116 │ 
117 ▶     const placeholder = this._generateUniqueName(`CLOSE_BLOCK_${this._toSnakeCase(name)}`);
118 │     this._signatureToName[signature] = placeholder;
119 │     return placeholder;
120 │   }
```

- **83〜94 行目**：補間などの名前。署名は `PH: INTERPOLATION=式の文字列`（85 行目）なので、同じ式なら同じ名前、違う式なら `_1` が付きます。
- **96〜98 行目**：`getUniquePlaceholder` は署名を見ず、呼ぶたびに新しい名前を返します。ICU の式の `VAR_PLURAL`・`VAR_SELECT` がこれを使います（[第 7 回](07-loc-icu-compile.md)）。
- **100〜120 行目**：ブロックの名前。`START_BLOCK_` + ブロック名を大文字にして英数字以外を `_` にしたもの（106 行目）。閉じは `CLOSE_BLOCK_`（117 行目）。

補間の名前を頼むのは i18n\_parser.ts の `_visitTextWithInterpolation` です。

📄 `angular/packages/compiler/src/i18n/i18n_parser.ts` L295–322 （▶ の行: 301–302, 304–306, 308, 310, 313, 315, 317, 320）

```ts
295 │     const nodes: i18n.Node[] = [];
296 │     // We will only create a container if there are actually interpolations,
297 │     // so this flag tracks that.
298 │     let hasInterpolation = false;
299 │     for (const token of tokens) {
300 │       switch (token.type) {
301 ▶         case TokenType.INTERPOLATION:
302 ▶         case TokenType.ATTR_VALUE_INTERPOLATION:
303 │           hasInterpolation = true;
304 ▶           const [startMarker, expression, endMarker] = token.parts;
305 ▶           const baseName = extractPlaceholderName(expression) || 'INTERPOLATION';
306 ▶           const phName = context.placeholderRegistry.getPlaceholderName(baseName, expression);
307 │ 
308 ▶           if (this._preserveExpressionWhitespace) {
309 │             context.placeholderToContent[phName] = {
310 ▶               text: token.parts.join(''),
311 │               sourceSpan: token.sourceSpan,
312 │             };
313 ▶             nodes.push(new i18n.Placeholder(expression, phName, token.sourceSpan));
314 │           } else {
315 ▶             const normalized = this.normalizeExpression(token);
316 │             context.placeholderToContent[phName] = {
317 ▶               text: `${startMarker}${normalized}${endMarker}`,
318 │               sourceSpan: token.sourceSpan,
319 │             };
320 ▶             nodes.push(new i18n.Placeholder(normalized, phName, token.sourceSpan));
321 │           }
322 │           break;
```

1. **補間の字句だけを拾う（301・302 行目）**

   テキストの `{{ … }}` と、属性の値の中の補間（`title="Photo of {{ who }}"`）の 2 種類です。
2. **3 つに分ける（304 行目）**

   `token.parts` は `['{{', ' name ', '}}']` のように、開始の印・式・終わりの印の 3 つです。
3. **基の名前（305 行目）**

   式に `// i18n(ph="…")` があればその名前、無ければ `INTERPOLATION` です（次の引用）。
4. **名前をもらう（306 行目）**

   2 つめの引数（署名の材料）は**式の生の文字列**です。だから同じメッセージの中の `{{a}}` と `{{ a }}` は、空白が違うだけで別の名前（`INTERPOLATION` と `INTERPOLATION_1`）になります。このページの compiler 22.1.6 で `<p i18n>{{a}} {{ a }} {{a}}</p>` を読ませると、文は `{$INTERPOLATION} {$INTERPOLATION_1} {$INTERPOLATION}` でした。
5. **元の文字列を表に入れる（308〜321 行目）**

   `preserveExpressionWhitespace` が true（ngtsc の既定）なら 310 行目で 3 つの部品をそのままつなぎ、313 行目の `Placeholder` の値も生の式です。false なら 315 行目で式を一度解析して書き直し（[第 4 回](04-loc-message-id.md)）、317・320 行目でその形を使います。この表の文字列が、XLIFF の `equiv-text` や `goog.getMsg` の `original_code` になります。

### // i18n(ph="name") で名前を決める

📄 `angular/packages/compiler/src/i18n/i18n_parser.ts` L456–461 （▶ の行: 456–457, 460）

```ts
456 ▶ const _CUSTOM_PH_EXP =
457 ▶   /\/\/[\s\S]*i18n[\s\S]*\([\s\S]*ph[\s\S]*=[\s\S]*("|')([\s\S]*?)\1[\s\S]*\)/g;
458 │ 
459 │ function extractPlaceholderName(input: string): string {
460 ▶   return input.split(_CUSTOM_PH_EXP)[2];
461 │ }
```

457 行目の正規表現は「`//`・`i18n`・`(`・`ph`・`=`・引用符で囲んだ名前・`)`」が、間に何があってもこの順に出てくれば当たります。460 行目の `split` は、正規表現の 2 つめの括弧（名前）を結果の 2 番に入れるので、`[2]` が名前です。当たらなければ `undefined` になり、305 行目の `|| 'INTERPOLATION'` に落ちます。名前は 84 行目で大文字にされるので、`ph="teSt"` は `TEST` です。

`//` から後ろは式の構文ではコメントなので、実行時には何もしません。`{{ count // i18n(ph="num") }}` をコンパイルすると、命令は `ɵɵi18nExp(ctx.count)` だけです（デモで確かめられます）。

## 4. 署名と \_1 の付け方

📄 `angular/packages/compiler/src/i18n/serializers/placeholder.ts` L122–161 （▶ の行: 123, 125–127, 129, 135, 139, 148, 152–153, 155, 158, 160）

```ts
122 │   // Generate a hash for a tag - does not take attribute order into account
123 ▶   private _hashTag(tag: string, attrs: {[k: string]: string}, isVoid: boolean): string {
124 │     const start = `<${tag}`;
125 ▶     const strAttrs = Object.keys(attrs)
126 ▶       .sort()
127 ▶       .map((name) => ` ${name}=${attrs[name]}`)
128 │       .join('');
129 ▶     const end = isVoid ? '/>' : `></${tag}>`;
130 │ 
131 │     return start + strAttrs + end;
132 │   }
133 │ 
134 │   private _hashClosingTag(tag: string): string {
135 ▶     return this._hashTag(`/${tag}`, {}, false);
136 │   }
137 │ 
138 │   private _hashBlock(name: string, parameters: string[]): string {
139 ▶     const params = parameters.length === 0 ? '' : ` (${parameters.sort().join('; ')})`;
140 │     return `@${name}${params} {}`;
141 │   }
142 │ 
143 │   private _hashClosingBlock(name: string): string {
144 │     return this._hashBlock(`close_${name}`, []);
145 │   }
146 │ 
147 │   private _toSnakeCase(name: string) {
148 ▶     return name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
149 │   }
150 │ 
151 │   private _generateUniqueName(base: string): string {
152 ▶     const seen = Object.hasOwn(this._placeHolderNameCounts, base);
153 ▶     if (!seen) {
154 │       this._placeHolderNameCounts[base] = 1;
155 ▶       return base;
156 │     }
157 │ 
158 ▶     const id = this._placeHolderNameCounts[base];
159 │     this._placeHolderNameCounts[base] = id + 1;
160 ▶     return `${base}_${id}`;
161 │   }
```

1. **属性は名前の順に並べる（125〜127 行目）**

   `<p foo="a" bar="b">` と `<p bar="b" foo="a">` は同じ署名 `<p bar=b foo=a></p>` になり、同じ名前です。値は引用符なしでつなぐだけです。
2. **void は終わり方を変える（129 行目）**

   void なら `/>`、そうでなければ `></p>`。閉じタグの署名は 135 行目で `</p></p>` のようになります。
3. **ブロックの引数も並べる（139 行目）**

   `@if (a; as b)` の引数を並べ替えて `;` でつなぎ、`@if (a; as b) {}` のような署名にします。
4. **初めての基の名前はそのまま、2 回目から \_1（152〜160 行目）**

   1 回目は 153〜155 行目で数を 1 にして基の名前をそのまま返し、2 回目は 158〜160 行目で今の数を付けて `_1`、3 回目は `_2` です。数えるのは基の名前（`START_BOLD_TEXT`）ごとなので、`START_PARAGRAPH` と `START_BOLD_TEXT` の数は別々です。

## 5. 外に出す名前の形

名前はコンパイラの中では `START_TAG_MY-CMP` のように `-` を含むことがあります。`$localize` と `goog.getMsg` に書くときに形を整えます。

📄 `angular/packages/compiler/src/render3/view/i18n/util.ts` L65–93 （▶ の行: 74–76, 78, 85, 88, 90, 92）

```ts
65 │ /**
66 │  * Converts internal placeholder names to public-facing format
67 │  * (for example to use in goog.getMsg call).
68 │  * Example: `START_TAG_DIV_1` is converted to `startTagDiv_1`.
69 │  *
70 │  * @param name The placeholder name that should be formatted
71 │  * @returns Formatted placeholder name
72 │  */
73 │ export function formatI18nPlaceholderName(name: string, useCamelCase: boolean = true): string {
74 ▶   const publicName = toPublicName(name);
75 ▶   if (!useCamelCase) {
76 ▶     return publicName;
77 │   }
78 ▶   const chunks = publicName.split('_');
79 │   if (chunks.length === 1) {
80 │     // if no "_" found - just lowercase the value
81 │     return name.toLowerCase();
82 │   }
83 │   let postfix;
84 │   // eject last element if it's a number
85 ▶   if (/^\d+$/.test(chunks[chunks.length - 1])) {
86 │     postfix = chunks.pop();
87 │   }
88 ▶   let raw = chunks.shift()!.toLowerCase();
89 │   if (chunks.length) {
90 ▶     raw += chunks.map((c) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()).join('');
91 │   }
92 ▶   return postfix ? `${raw}_${postfix}` : raw;
93 │ }
```

74 行目の `toPublicName`（xmb.ts）は「大文字にして、英数字と `_` 以外を `_` にする」関数です。`$localize` の部品には 75・76 行目の `useCamelCase = false` の形（`:START_TAG_MY_CMP:`）、Closure 用の `goog.getMsg` には 78〜92 行目の camelCase の形（`{$startTagMyCmp}`）が入ります。85 行目で末尾の数字を外してから並べ直すので、`START_TAG_DIV_1` は `startTagDiv_1` です。

## 6. 名前と実行時の印

翻訳する人が見る名前と、実行時に DOM を作るための印は別のものです。`$localize` の部品では、`:名前:` の**直前**の `${…}` に印が入ります。

| テンプレート | 名前（この章） | 実行時の印 | 印の意味 |
| --- | --- | --- | --- |
| `{{ name }}` | `INTERPOLATION` | `�0�` | `ɵɵi18nExp` で積んだ式の 0 番 |
| `<b>` / `</b>` | `START_BOLD_TEXT` / `CLOSE_BOLD_TEXT` | `�#2�` / `�/#2�` | スロット 2 の要素の開始 / 閉じ |
| `<br>` | `LINE_BREAK` | `�#4��/#4�` | 開始と閉じをつなげたもの |
| `@if (ok) {` / `}` | `START_BLOCK_IF` / `CLOSE_BLOCK_IF` | `�*6:1�` / `�/*6:1�` | スロット 6 のテンプレート、サブテンプレート 1 |
| 2 か所の `</b>` | `CLOSE_BOLD_TEXT` | `[�/#2�\|�/#5�]` | 候補の並び。`ɵɵi18nPostprocess` が前から順に取り出す |

印の形（`#` が要素、`*` がテンプレート、`/` が閉じ、`:1` がサブテンプレートの番号）を作るのはテンプレートパイプラインの段で、スロット番号を決める `resolve_i18n_element_placeholders`・`resolve_i18n_expression_placeholders` と、文字列にする `extract_i18n_messages.ts` の `formatValue` です（[第 5 回](05-loc-pipeline-phases.md)）。実行時にこの印を読んで DOM を作るのは [第 9 回](09-loc-runtime-start.md)・[第 10 回](10-loc-runtime-dom.md)です。名前は翻訳ファイルと ID のため、印は実行時のため。`$localize` の部品は、この 2 つを 1 か所に並べて持ち運ぶ形です。

## 7. デモ：名前と印を並べる

> **🧪 DEMO — 本物のコンパイラの出力から、:名前: と実行時の印の対応を表にする**
>
> 「並べる」を押すと、`compileI18nTemplate`（このページの @angular/compiler 22.1.6、legacyIds は false）でコンパイルし、`$localize` の部品を @angular/localize の `ɵparseMessage` で読んで、`placeholderNames` と、それぞれの直前の引数（実行時の印）を並べます。「元の文字列」は本物の `parseTemplate` の `Message.placeholders`（i18n\_parser.ts の `placeholderToContent`）から、名前を 5 節の形にそろえて引きます。「印の意味」の列はこの章の .ts の簡単な読み取りです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/loc-placeholders)

初期値では、`CLOSE_BOLD_TEXT` が 2 回出てきて、どちらの印も `[�/#2�|�/#5�]` の並びになります（2 節の 69 行目）。`:NUM:` は `// i18n(ph="num")` から、`:START_TAG_MY_CMP:` は 5 節の 74 行目の形です。`<b class="x">` の `class` を消すと、2 つめも `START_BOLD_TEXT` にまとまります。

## ここまでの呼び出し

- `_I18nVisitor.toI18nMessage(nodes, …)` — i18n/i18n\_parser.ts — *new PlaceholderRegistry()（第 2 回）*
  - `_visitElementLike(node)` — i18n\_parser.ts
    - `getStartTagPlaceholderName(tag, attrs, isVoid)` → `_hashTag` → `_generateUniqueName` — i18n/serializers/placeholder.ts L53・L123・L151
    - `getCloseTagPlaceholderName(tag)` → `_hashClosingTag` — placeholder.ts L68・L134
  - `_visitTextWithInterpolation(tokens, …)` — i18n\_parser.ts L301〜306
    - `extractPlaceholderName(expression) || 'INTERPOLATION'` — i18n\_parser.ts L305・L459
    - `getPlaceholderName(baseName, expression)` — placeholder.ts L83
  - `visitBlock(block)` → `getStartBlockPlaceholderName(name, params)` — placeholder.ts L100
- `formatI18nPlaceholderName(name, false)` → `toPublicName` — render3/view/i18n/util.ts L73 — *$localize の :名前:（第 6 回）*

## テストと直し方

### spec

📄 `angular/packages/compiler/test/i18n/serializers/placeholder_spec.ts` L18–58 （▶ の行: 19, 25, 34, 36, 48, 53, 57）

```ts
18 │   describe('tag placeholder', () => {
19 ▶     it('should generate names for well known tags', () => {
20 │       expect(reg.getStartTagPlaceholderName('p', {}, false)).toEqual('START_PARAGRAPH');
21 │       expect(reg.getCloseTagPlaceholderName('p')).toEqual('CLOSE_PARAGRAPH');
22 │     });
23 │ 
24 │     it('should generate names for custom tags', () => {
25 ▶       expect(reg.getStartTagPlaceholderName('my-cmp', {}, false)).toEqual('START_TAG_MY-CMP');
26 │       expect(reg.getCloseTagPlaceholderName('my-cmp')).toEqual('CLOSE_TAG_MY-CMP');
27 │     });
28 │ 
29 │     it('should generate the same name for the same tag', () => {
30 │       expect(reg.getStartTagPlaceholderName('p', {}, false)).toEqual('START_PARAGRAPH');
31 │       expect(reg.getStartTagPlaceholderName('p', {}, false)).toEqual('START_PARAGRAPH');
32 │     });
33 │ 
34 ▶     it('should be case sensitive for tag name', () => {
35 │       expect(reg.getStartTagPlaceholderName('p', {}, false)).toEqual('START_PARAGRAPH');
36 ▶       expect(reg.getStartTagPlaceholderName('P', {}, false)).toEqual('START_PARAGRAPH_1');
37 │       expect(reg.getCloseTagPlaceholderName('p')).toEqual('CLOSE_PARAGRAPH');
38 │       expect(reg.getCloseTagPlaceholderName('P')).toEqual('CLOSE_PARAGRAPH_1');
39 │     });
40 │ 
41 │     it('should generate the same name for the same tag with the same attributes', () => {
42 │       expect(reg.getStartTagPlaceholderName('p', {foo: 'a', bar: 'b'}, false)).toEqual(
43 │         'START_PARAGRAPH',
44 │       );
45 │       expect(reg.getStartTagPlaceholderName('p', {foo: 'a', bar: 'b'}, false)).toEqual(
46 │         'START_PARAGRAPH',
47 │       );
48 ▶       expect(reg.getStartTagPlaceholderName('p', {bar: 'b', foo: 'a'}, false)).toEqual(
49 │         'START_PARAGRAPH',
50 │       );
51 │     });
52 │ 
53 ▶     it('should generate different names for the same tag with different attributes', () => {
54 │       expect(reg.getStartTagPlaceholderName('p', {foo: 'a', bar: 'b'}, false)).toEqual(
55 │         'START_PARAGRAPH',
56 │       );
57 ▶       expect(reg.getStartTagPlaceholderName('p', {foo: 'a'}, false)).toEqual('START_PARAGRAPH_1');
58 │     });
```

`placeholder_spec.ts` は `PlaceholderRegistry` を直接呼びます。25 行目が `TAG_MY-CMP`（`-` を残す）、48 行目が属性の順番を無視すること、57 行目が違う属性なら `_1` になることの確認です。34〜39 行目の「タグ名の大文字小文字を区別する」は、表を引く 59 行目では大文字にするのに、署名（54 行目）は元の綴りで作るためです。

📄 `angular/packages/compiler/test/i18n/i18n_parser_spec.ts` L137–150 （▶ の行: 137, 139, 141, 145）

```ts
137 ▶     it('should support named interpolation', () => {
138 │       expect(
139 ▶         _humanizeMessages('<div i18n="m|d">before{{ exp //i18n(ph="teSt") }}after</div>'),
140 │       ).toEqual([
141 ▶         [['[before, <ph name="TEST"> exp //i18n(ph="teSt") </ph>, after]'], 'm', 'd', ''],
142 │       ]);
143 │ 
144 │       expect(
145 ▶         _humanizeMessages("<div i18n='m|d'>before{{ exp //i18n(ph='teSt') }}after</div>"),
146 │       ).toEqual([
147 │         [[`[before, <ph name="TEST"> exp //i18n(ph='teSt') </ph>, after]`], 'm', 'd', ''],
148 │       ]);
149 │     });
150 │   });
```

141 行目の期待値では、名前が `TEST`（大文字）で、値はコメントを含む元の式のままです。145 行目は単引用符の形です。

| spec（packages/compiler/test/） | describe（行） |
| --- | --- |
| `i18n/serializers/placeholder_spec.ts` | `'PlaceholderRegistry'`（11）→ `'tag placeholder'`（18）・`'arbitrary placeholders'`（79）・`'block placeholders'`（97） |
| `i18n/i18n_parser_spec.ts` | `'I18nParser'`（14）→ `'interpolation'`（130）・`'placeholders'`（275） |
| `render3/view/i18n_spec.ts` | `'Utils'`（21）→ it `'formatI18nPlaceholderName'`（22） |

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=^(PlaceholderRegistry|I18nParser (placeholders|interpolation)|Utils formatI18nPlaceholderName)'
```

2026-11-03 の結果は **Ran 20 of 403 specs、20 specs, 0 failures、PASSED in 0.7s**（ログは `scratchpad/i18n-logs/a-placeholders.log`）。

### 直すとしたら、どこから

- **名前の付け方そのもの**：`placeholder.ts`。ただし 1 節の注意のとおり、名前はメッセージの文と ID に入るので、出力が 1 文字でも変わる直しは既存の翻訳ファイルをすべて壊します。直す前に、ID が変わらないかを [第 4 回](04-loc-message-id.md)のデモで確かめます。
- **元の文字列（equiv-text）がおかしい**：`i18n_parser.ts` の 308〜321 行目と `_visitElementLike`。spec は `i18n_parser_spec.ts` の `'placeholders'` に `_humanizePlaceholders`（名前=元の文字列を並べる補助関数）で 1 つ足すのが近道です。
- **実行時の印がおかしい**：名前ではなくパイプラインの段（[第 5 回](05-loc-pipeline-phases.md)）。
- 関係する開いている issue：#56845（extract-i18n の `equiv-text` が補間の元の文字列と違う）、#52461（async パイプのある補間の `equiv-text`）、#62694（ICU の `#`）。[第 20 回](20-loc-issues.md)で読みます。

## 聞かれそうな質問

**Q. 同じ `<b>` を 2 回使うと、名前は 2 つになりますか？**

属性まで同じなら 1 つです。placeholder.ts 54 行目の署名が同じになり、55・56 行目で前の名前を返します。属性が違えば `START_BOLD_TEXT_1` になりますが、閉じは 69 行目でタグ名だけの署名なので、どちらも `CLOSE_BOLD_TEXT` です。

**Q. `INTERPOLATION_1` の `_1` は何の番号ですか？**

同じメッセージの中で、同じ基の名前に**違う中身**が来た回数です（158〜160 行目）。中身の比べ方は 85 行目の署名で、補間なら式の生の文字列（i18n\_parser.ts 306 行目）です。メッセージが変われば数え直します。

**Q. 翻訳する人に `INTERPOLATION` ではなく分かる名前を見せたいときは？**

式の後ろに `// i18n(ph="userName")` と書きます。i18n\_parser.ts 457 行目の正規表現が名前を取り出し、305 行目で `INTERPOLATION` の代わりに使います。名前は大文字（`USERNAME`）になり、実行時の動きは変わりません。

**Q. 翻訳文で `{$START_BOLD_TEXT}` の順番を入れ替えても大丈夫ですか？**

大丈夫です。名前は位置ではなく「どの穴か」を表し、`$localize` の部品で名前ごとに実行時の印（`�#2�`）が結び付いているので、翻訳文の中の位置が変わっても同じ要素が開きます。翻訳文を部品に戻す側は [第 14 回](14-loc-runtime-translations.md)で読みます。

## 読み終えて

- 名前は `PlaceholderRegistry` がメッセージごとに決める。中身の署名が同じなら同じ名前、違えば `_1`・`_2`。
- タグは 30 個の表（`B` → `BOLD_TEXT`）か `TAG_` + タグ名。void は `START_` も閉じも無い。閉じタグは属性を見ない。
- 補間は `INTERPOLATION` か `// i18n(ph="…")` の名前。署名は式の生の文字列なので、空白の違いで別の名前になる。
- `$localize` には `toPublicName` の形、`goog.getMsg` には camelCase の形で書く。
- 名前は翻訳と ID のため、`�0�`・`�#2�` の印は実行時のため。結び付けるのが `$localize` の部品の並び。名前を変える直しは ID を変える。

---

← 前: [i18n の印とメッセージの形：meaning|description@@id](02-loc-markup.md)  
次: [メッセージ ID：digest・fingerprint・legacy ID](04-loc-message-id.md) →
