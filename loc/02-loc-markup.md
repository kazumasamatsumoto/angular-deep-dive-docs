[目次](../README.md) › [i18n と $localize の内側](README.md) › 第 2 回 / 全 20 回

# i18n の印とメッセージの形：meaning|description@@id

> i18n・i18n-title のような印と、その値の meaning|description@@id を読む行（meta.ts の parseI18nMeta）。テンプレートの要素からメッセージを作る i18n\_parser.ts と、メッセージの木（i18n\_ast.ts の Message・Text・Container・Placeholder・TagPlaceholder・Icu・IcuPlaceholder・BlockPlaceholder）。&lt;ng-container i18n&gt; と、@if などのブロックの中の i18n。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/loc-markup)

---

`<h1 i18n="site header|greeting@@hello">` の値は、`|` と `@@` で 3 つに切られます。この章では、その切り方（`parseI18nMeta`）、`i18n` と `i18n-title` のような印を要素と属性に付けて回る `I18nMetaVisitor`、そして要素の子からメッセージの木を作る `_I18nVisitor` を、1 行ずつ読みます。`<ng-container i18n>` や `@if` の中の i18n が木のどこに入るかも確かめます。

読む対象は `packages/compiler/src/render3/view/i18n/meta.ts`・`util.ts`、`packages/compiler/src/i18n/i18n_parser.ts`・`i18n_ast.ts` です。

1. [1. 全体像](01-loc-overview.md)
2. **2. 印とメッセージ**（この章）
3. [3. プレースホルダー](03-loc-placeholders.md)
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

## 1. 印は 2 種類：i18n と i18n-\*

📄 `angular/packages/compiler/src/render3/view/i18n/util.ts` L13–26 （▶ の行: 14–15, 21, 25）

```ts
13 │ /** Name of the i18n attributes **/
14 ▶ export const I18N_ATTR = 'i18n';
15 ▶ export const I18N_ATTR_PREFIX = 'i18n-';
16 │ 
17 │ /** Prefix of var expressions used in ICUs */
18 │ export const I18N_ICU_VAR_PREFIX = 'VAR_';
19 │ 
20 │ export function isI18nAttribute(name: string): boolean {
21 ▶   return name === I18N_ATTR || name.startsWith(I18N_ATTR_PREFIX);
22 │ }
23 │ 
24 │ export function hasI18nAttrs(node: html.Element | html.Component): boolean {
25 ▶   return node.attrs.some((attr: html.Attribute) => isI18nAttribute(attr.name));
26 │ }
```

14 行目の `i18n` は「この要素の**中身**を翻訳する」印、15 行目の `i18n-` で始まる名前（`i18n-title` など）は「この要素の**属性**を翻訳する」印です。21 行目の `isI18nAttribute` はこの 2 つだけを見ます。25 行目の `hasI18nAttrs` が false の要素は、`I18nMetaVisitor` が何もせずに子へ進みます。

`i18n` を見つけた要素に中身のメッセージを載せる 166〜200 行目は [R3 AST の章](../compiler/07-compiler-r3-ast.md)の 7 節で読みました。要点は「`node.i18n || attr.value` を印の値として取り、子からメッセージを作り、要素の `i18n` に載せる」の 3 つです。この章はその続きを読みます。

## 2. 値を切る：parseI18nMeta

📄 `angular/packages/compiler/src/render3/view/i18n/meta.ts` L303–336 （▶ の行: 304–305, 322, 324–325, 327–332）

```ts
303 │ /** I18n separators for metadata **/
304 ▶ const I18N_MEANING_SEPARATOR = '|';
305 ▶ const I18N_ID_SEPARATOR = '@@';
306 │ 
307 │ /**
308 │  * Parses i18n metas like:
309 │  *  - "@@id",
310 │  *  - "description[@@id]",
311 │  *  - "meaning|description[@@id]"
312 │  * and returns an object with parsed output.
313 │  *
314 │  * @param meta String that represents i18n meta
315 │  * @returns Object with id, meaning and description fields
316 │  */
317 │ export function parseI18nMeta(meta: string = ''): I18nMeta {
318 │   let customId: string | undefined;
319 │   let meaning: string | undefined;
320 │   let description: string | undefined;
321 │ 
322 ▶   meta = meta.trim();
323 │   if (meta) {
324 ▶     const idIndex = meta.indexOf(I18N_ID_SEPARATOR);
325 ▶     const descIndex = meta.indexOf(I18N_MEANING_SEPARATOR);
326 │     let meaningAndDesc: string;
327 ▶     [meaningAndDesc, customId] =
328 ▶       idIndex > -1 ? [meta.slice(0, idIndex), meta.slice(idIndex + 2)] : [meta, ''];
329 ▶     [meaning, description] =
330 ▶       descIndex > -1
331 ▶         ? [meaningAndDesc.slice(0, descIndex), meaningAndDesc.slice(descIndex + 1)]
332 ▶         : ['', meaningAndDesc];
333 │   }
334 │ 
335 │   return {customId, meaning, description};
336 │ }
```

1. **区切りは 2 つ（304・305 行目）**

   `I18N_MEANING_SEPARATOR` が `|`、`I18N_ID_SEPARATOR` が `@@` です。
2. **全体の前後の空白を落とす（322 行目）**

   値の全体を `trim()` します。`i18n="\n meaning|desc\n "` のように改行して書いても、meaning の先頭の改行は残りません。中の空白は残るので、`"m | d"` は meaning が `"m "`、description が `" d"` になります（デモで確かめられます）。
3. **先に @@ で切る（324・327・328 行目）**

   最初の `@@` より右がすべて customId（自分で付けた ID）です。`@@` が無ければ customId は空文字です。
4. **次に | で切る（325・329〜332 行目）**

   `|` があれば左が meaning（意味。同じ文でも意味が違えば別のメッセージにするための語）、右が description（翻訳する人へのメモ）です。`|` が無ければ全体が description です。

> [!WARNING]
> **ハマりどころ**
>
> 325 行目の `descIndex` は、`@@` で切る**前の**全体で探しています。そのため `i18n="desc@@a|b"` のように customId の中に `|` があると、330 行目で `meaningAndDesc`（`"desc"`）を 7 文字目で切ることになり、meaning が `"desc"`、description が空になります（このページの compiler 22.1.6 で確かめた結果）。customId に `|` を使わないのが安全です。
>
> 逆向きの読み手、@angular/localize の `parseMetadata`（[第 13 回](13-loc-localize-tag.md)）は `split('@@', 2)` で切るので、`i18n="m|d@@x@@y"` の customId は compiler では `x@@y`（328 行目）、localize では `x` になります（2 つめの `@@` から右が捨てられる）。

## 3. i18n-\* の属性

`_visitElementLike` の属性のループの続きです（`i18n` そのものの枝は 166〜200 行目）。

📄 `angular/packages/compiler/src/render3/view/i18n/meta.ts` L201–243 （▶ の行: 201, 203, 208, 211, 214, 217, 221, 227, 230–231, 236, 239, 242）

```ts
201 ▶         } else if (attr.name.startsWith(I18N_ATTR_PREFIX)) {
202 │           // 'i18n-*' attributes
203 ▶           const name = attr.name.slice(I18N_ATTR_PREFIX.length);
204 │           let isTrustedType: boolean;
205 │           if (node instanceof html.Component) {
206 │             isTrustedType = node.tagName === null ? false : isTrustedTypesSink(node.tagName, name);
207 │           } else {
208 ▶             isTrustedType = isTrustedTypesSink(node.name, name);
209 │           }
210 │ 
211 ▶           if (isTrustedType || isPossibleEventHandler(name)) {
212 │             this._reportError(
213 │               attr,
214 ▶               `Translating attribute '${name}' is disallowed for security reasons.`,
215 │             );
216 │           } else {
217 ▶             attrsMeta[name] = attr.value;
218 │           }
219 │         } else {
220 │           // non-i18n attributes
221 ▶           attrs.push(attr);
222 │         }
223 │       }
224 │ 
225 │       // set i18n meta for attributes
226 │       if (Object.keys(attrsMeta).length) {
227 ▶         for (const attr of attrs) {
228 │           const meta = attrsMeta[attr.name];
229 │           // do not create translation for empty attributes
230 ▶           if (meta !== undefined && attr.value) {
231 ▶             attr.i18n = this._generateI18nMessage([attr], attr.i18n || meta);
232 │           }
233 │         }
234 │       }
235 │ 
236 ▶       if (!this.keepI18nAttrs) {
237 │         // update element's attributes,
238 │         // keeping only non-i18n related ones
239 ▶         node.attrs = attrs;
240 │       }
241 │     }
242 ▶     html.visitAll(this, node.children, message);
243 │   }
```

1. **名前を取り出す（201・203 行目）**

   `i18n-title` から `title` を取り出します。
2. **危ない属性は断る（208・211・214 行目）**

   Trusted Types の対象（`<iframe srcdoc>` など、文字列がそのまま実行や HTML になる属性）か、`on` で始まる 3 文字以上の名前（`only` を除く。同じファイルの `isPossibleEventHandler`）なら、「Translating attribute 'onclick' is disallowed for security reasons.」のエラーを積みます。翻訳文で属性の中身を差し替えられると、翻訳ファイルからスクリプトを入れられるからです。
3. **印を控え、ふつうの属性は残す（217・221 行目）**

   `attrsMeta['title'] = 'tooltip|a photo'` のように、属性の名前ごとに印の値を控えます。`i18n` と関係ない属性は 221 行目で `attrs` に残ります。
4. **相手の属性にメッセージを載せる（227・230・231 行目）**

   残った属性を 1 つずつ見て、控えた印があり、しかも**値が空でない**ときだけ（230 行目）、その属性 1 つを材料にメッセージを作り、属性の `i18n` に載せます。`title=""` や、`i18n-title` だけ書いて `title` が無い場合は、エラーにもならず何も起きません。
5. **印の属性は消す（236・239 行目）**

   `keepI18nAttrs` が false なら、`i18n` と `i18n-*` を除いた `attrs` で要素の属性を置き換えます。だから出力の DOM に `i18n` という属性は出ません。`parseTemplate` はこの値に `!preserveWhitespaces` を渡し（[第 1 回](01-loc-overview.md)で見た 1 回目の `I18nMetaVisitor`）、空白を消すときは 2 回目の訪問で消します。
6. **子へ進む（242 行目）**

   `html.visitAll(this, node.children, message)`。3 つめの引数に今のメッセージを渡すのは、子の ICU を見つけたときにそのメッセージの表を更新するためです（ICU は[第 7 回](07-loc-icu-compile.md)）。

## 4. ブロック・コメント・ng-container・ng-template

📄 `angular/packages/compiler/src/render3/view/i18n/meta.ts` L133–161 （▶ の行: 133, 139, 146–148）

```ts
133 ▶   visitText(text: html.Text): any {
134 │     return text;
135 │   }
136 │   visitAttribute(attribute: html.Attribute): any {
137 │     return attribute;
138 │   }
139 ▶   visitComment(comment: html.Comment): any {
140 │     return comment;
141 │   }
142 │   visitExpansionCase(expansionCase: html.ExpansionCase): any {
143 │     return expansionCase;
144 │   }
145 │ 
146 ▶   visitBlock(block: html.Block, context: any) {
147 ▶     html.visitAll(this, block.children, context);
148 ▶     return block;
149 │   }
150 │ 
151 │   visitBlockParameter(parameter: html.BlockParameter, context: any) {
152 │     return parameter;
153 │   }
154 │ 
155 │   visitLetDeclaration(decl: html.LetDeclaration, context: any) {
156 │     return decl;
157 │   }
158 │ 
159 │   visitDirective(directive: html.Directive, context: any) {
160 │     return directive;
161 │   }
```

`I18nMetaVisitor` の残りの visit は、ほとんど受け取ったものを返すだけです。2 つだけ大事な行があります。

- **146〜148 行目**：`@if` などのブロックは、子を同じ `context` で訪ねます。だから `@if (ok) { <p i18n>Hi</p> }` の `<p>` も印が読まれ、条件の中の埋め込みテンプレートに自分のメッセージを持ちます（出力では `Demo_Conditional_0_Template` の中の `ɵɵi18n(1,0)`）。
- **139 行目**：コメントは何もしません。`<!-- i18n -->…<!-- /i18n -->` という古い書き方は、このビジターでは読まれません。i18n\_parser\_spec.ts の `describe('blocks')` にこの書き方があるのは、spec が古い抽出（`extractor_merger.ts`、[第 8 回](08-loc-compiler-options.md)）を通るからです。

`<ng-container>` と `<ng-template>` は、HTML の木ではふつうの `html.Element` です。だから印の読み方は `<p>` と同じで、違いは出力に出ます。このページの compiler 22.1.6 でコンパイルした結果です。

| 書き方 | メッセージが載る場所 | template 関数の命令 |
| --- | --- | --- |
| `<ng-container i18n>Hi <b>…</b></ng-container>` | `ng-container` 要素 | `ɵɵdomElementContainerStart(0)` → `ɵɵi18nStart(1,0)`。DOM の要素を作らずに文だけを出す |
| `<ng-template i18n>Hi …</ng-template>` | R3 AST の `Template` | 外は `ɵɵdomTemplate(0, …)` だけ。埋め込みテンプレートの中で `ɵɵi18n(0,0)` |
| `<div i18n><span *ngIf="y">b</span></div>` | `div` の 1 つのメッセージ | 埋め込みテンプレートの中で `ɵɵi18nStart(0,0,2)`。3 つめの引数でメッセージの一部をつなぐ（[第 5 回](05-loc-pipeline-phases.md)） |
| `<div i18n>A @if (ok) {…} B</div>` | `div` の 1 つのメッセージ。`@if` は `BlockPlaceholder` | 6 節。翻訳文の中に `{$START_BLOCK_IF}` が入る |

## 5. メッセージを作る関数：createI18nMessageFactory

📄 `angular/packages/compiler/src/i18n/i18n_parser.ts` L40–63 （▶ の行: 43–45, 47–48, 53, 55–58）

```ts
40 │ /**
41 │  * Returns a function converting html nodes to an i18n Message
42 │  */
43 ▶ export function createI18nMessageFactory(
44 ▶   retainEmptyTokens: boolean,
45 ▶   preserveExpressionWhitespace: boolean,
46 │ ): I18nMessageFactory {
47 ▶   const visitor = new _I18nVisitor(_expParser, retainEmptyTokens, preserveExpressionWhitespace);
48 ▶   return (nodes, meaning, description, customId, visitNodeFn) =>
49 │     visitor.toI18nMessage(nodes, meaning, description, customId, visitNodeFn);
50 │ }
51 │ 
52 │ interface I18nMessageVisitorContext {
53 ▶   isIcu: boolean;
54 │   icuDepth: number;
55 ▶   placeholderRegistry: PlaceholderRegistry;
56 ▶   placeholderToContent: {[phName: string]: i18n.MessagePlaceholder};
57 ▶   placeholderToMessage: {[phName: string]: i18n.Message};
58 ▶   visitNodeFn: VisitNodeFn;
59 │ }
60 │ 
61 │ function noopVisitNodeFn(_html: html.Node, i18n: i18n.Node): i18n.Node {
62 │   return i18n;
63 │ }
```

43〜45 行目の 2 つの引数は空白の扱いです。`retainEmptyTokens` は「空白だけのテキストの字句も残すか」、`preserveExpressionWhitespace` は「補間の式の空白をそのまま残すか」で、どちらも ID の安定に効きます（[第 4 回](04-loc-message-id.md)）。47 行目でビジターを 1 つだけ作り、48 行目の関数が呼ばれるたびに使い回します。53〜58 行目の `I18nMessageVisitorContext` が、1 つのメッセージを作るあいだだけ使う道具箱です。

📄 `angular/packages/compiler/src/i18n/i18n_parser.ts` L65–98 （▶ の行: 72, 80, 82–84, 88, 90）

```ts
65 │ class _I18nVisitor implements html.Visitor {
66 │   constructor(
67 │     private _expressionParser: ExpressionParser,
68 │     private readonly _retainEmptyTokens: boolean,
69 │     private readonly _preserveExpressionWhitespace: boolean,
70 │   ) {}
71 │ 
72 ▶   public toI18nMessage(
73 │     nodes: html.Node[],
74 │     meaning = '',
75 │     description = '',
76 │     customId = '',
77 │     visitNodeFn: VisitNodeFn | undefined,
78 │   ): i18n.Message {
79 │     const context: I18nMessageVisitorContext = {
80 ▶       isIcu: nodes.length == 1 && nodes[0] instanceof html.Expansion,
81 │       icuDepth: 0,
82 ▶       placeholderRegistry: new PlaceholderRegistry(),
83 ▶       placeholderToContent: {},
84 ▶       placeholderToMessage: {},
85 │       visitNodeFn: visitNodeFn || noopVisitNodeFn,
86 │     };
87 │ 
88 ▶     const i18nodes: i18n.Node[] = html.visitAll(this, nodes, context);
89 │ 
90 ▶     return new i18n.Message(
91 │       i18nodes,
92 │       context.placeholderToContent,
93 │       context.placeholderToMessage,
94 │       meaning,
95 │       description,
96 │       customId,
97 │     );
98 │   }
```

1. **道具箱はメッセージごとに新しく（79〜86 行目）**

   82 行目で `new PlaceholderRegistry()`。名前の数え上げ（`_1` を付けるかどうか）は**メッセージごと**に 0 から始まります（[第 3 回](03-loc-placeholders.md)）。83 行目の `placeholderToContent` は「名前 → 元の文字列」の表（`INTERPOLATION` → `{{name}}` の文字列）、84 行目の `placeholderToMessage` は ICU のときに使う「名前 → 別のメッセージ」の表です。
2. **ICU だけのメッセージか（80 行目）**

   子が ICU 1 つだけなら `isIcu` が true になり、ICU を別のメッセージに分けません（[第 7 回](07-loc-icu-compile.md)）。
3. **子を全部訪ねて Message にする（88・90 行目）**

   `html.visitAll` が子の 1 つずつに下の visit を呼び、返ってきた i18n のノードの配列と 2 つの表、meaning・description・customId で `new i18n.Message` を作ります。

## 6. テキスト・属性・要素・ブロックを訪ねる

📄 `angular/packages/compiler/src/i18n/i18n_parser.ts` L100–135 （▶ の行: 101, 105, 109, 114–116, 127–129, 134）

```ts
100 │   visitElement(el: html.Element, context: I18nMessageVisitorContext): i18n.Node {
101 ▶     return this._visitElementLike(el, context);
102 │   }
103 │ 
104 │   visitComponent(component: html.Component, context: I18nMessageVisitorContext) {
105 ▶     return this._visitElementLike(component, context);
106 │   }
107 │ 
108 │   visitDirective(directive: html.Directive, context: any) {
109 ▶     throw new Error('Unreachable code');
110 │   }
111 │ 
112 │   visitAttribute(attribute: html.Attribute, context: I18nMessageVisitorContext): i18n.Node {
113 │     const node =
114 ▶       attribute.valueTokens === undefined || attribute.valueTokens.length === 1
115 ▶         ? new i18n.Text(attribute.value, attribute.valueSpan || attribute.sourceSpan)
116 ▶         : this._visitTextWithInterpolation(
117 │             attribute.valueTokens,
118 │             attribute.valueSpan || attribute.sourceSpan,
119 │             context,
120 │             attribute.i18n,
121 │           );
122 │     return context.visitNodeFn(attribute, node);
123 │   }
124 │ 
125 │   visitText(text: html.Text, context: I18nMessageVisitorContext): i18n.Node {
126 │     const node =
127 ▶       text.tokens.length === 1
128 ▶         ? new i18n.Text(text.value, text.sourceSpan)
129 ▶         : this._visitTextWithInterpolation(text.tokens, text.sourceSpan, context, text.i18n);
130 │     return context.visitNodeFn(text, node);
131 │   }
132 │ 
133 │   visitComment(comment: html.Comment, context: I18nMessageVisitorContext): i18n.Node | null {
134 ▶     return null;
135 │   }
```

テキストと属性の値は同じ扱いです。字句（トークン）が 1 つだけ、つまり補間が無ければ 115・128 行目で `Text` を 1 つ、補間があれば 116・129 行目の `_visitTextWithInterpolation` で `Text` と `Placeholder` を並べた `Container` にします（[第 3 回](03-loc-placeholders.md)）。134 行目のとおりコメントは消えます。109 行目の `Directive` は selectorless の書き方の部品で、101・105 行目の要素側から直接読むので、ここには来ません。

📄 `angular/packages/compiler/src/i18n/i18n_parser.ts` L221–255 （▶ の行: 225, 228–229, 237, 240, 243–244, 246, 251–252）

```ts
221 │   private _visitElementLike(
222 │     node: html.Element | html.Component,
223 │     context: I18nMessageVisitorContext,
224 │   ): i18n.Node {
225 ▶     const children = html.visitAll(this, node.children, context);
226 │     const attrs: {[k: string]: string} = {};
227 │     const visitAttribute = (attr: html.Attribute) => {
228 ▶       // Do not visit the attributes, translatable ones are top-level ASTs
229 ▶       attrs[attr.name] = attr.value;
230 │     };
231 │ 
232 │     let nodeName: string;
233 │     let isVoid: boolean;
234 │ 
235 │     if (node instanceof html.Element) {
236 │       nodeName = node.name;
237 ▶       isVoid = getHtmlTagDefinition(node.name).isVoid;
238 │     } else {
239 │       nodeName = node.fullName;
240 ▶       isVoid = node.tagName ? getHtmlTagDefinition(node.tagName).isVoid : false;
241 │     }
242 │ 
243 ▶     node.attrs.forEach(visitAttribute);
244 ▶     node.directives.forEach((dir) => dir.attrs.forEach(visitAttribute));
245 │ 
246 ▶     const startPhName = context.placeholderRegistry.getStartTagPlaceholderName(
247 │       nodeName,
248 │       attrs,
249 │       isVoid,
250 │     );
251 ▶     context.placeholderToContent[startPhName] = {
252 ▶       text: node.startSourceSpan.toString(),
253 │       sourceSpan: node.startSourceSpan,
254 │     };
255 │ 
```

📄 `angular/packages/compiler/src/i18n/i18n_parser.ts` L256–278 （▶ の行: 258–259, 261, 266, 272, 277）

```ts
256 │     let closePhName = '';
257 │ 
258 ▶     if (!isVoid) {
259 ▶       closePhName = context.placeholderRegistry.getCloseTagPlaceholderName(nodeName);
260 │       context.placeholderToContent[closePhName] = {
261 ▶         text: `</${nodeName}>`,
262 │         sourceSpan: node.endSourceSpan ?? node.sourceSpan,
263 │       };
264 │     }
265 │ 
266 ▶     const i18nNode = new i18n.TagPlaceholder(
267 │       nodeName,
268 │       attrs,
269 │       startPhName,
270 │       closePhName,
271 │       children,
272 ▶       isVoid,
273 │       node.sourceSpan,
274 │       node.startSourceSpan,
275 │       node.endSourceSpan,
276 │     );
277 ▶     return context.visitNodeFn(node, i18nNode);
278 │   }
```

1. **子を先に（225 行目）**

   子のノードを先に訪ねます。だから `<b><i>x</i></b>` の名前は、内側の `<i>` のほうが先に決まります。
2. **属性は文字列のまま控える（228・229・243・244 行目）**

   228 行目のコメントのとおり、中の要素の属性は訪ねません。翻訳したい属性は `i18n-*` で**別のメッセージ**になるからです。ここでは名前と値を `attrs` に控えるだけで、それは 246 行目の名前を決める材料になります。
3. **void の要素か（237・240 行目）**

   `<br>` や `<img>` のような閉じタグの無い要素は、`getHtmlTagDefinition` の表で決めます。
4. **開始タグの名前と元の文字列（246・251・252 行目）**

   `START_BOLD_TEXT` のような名前を `PlaceholderRegistry` に聞き、元の開始タグの文字列（`<b>`）を表に入れます。
5. **閉じタグ（258・259・261 行目）**

   void でなければ閉じタグの名前も聞き、261 行目で `</b>` を組み立てて表に入れます（元の文字列ではなく、名前から作った文字列）。
6. **TagPlaceholder を返す（266・272・277 行目）**

   名前・属性・子・void かどうかを持つ `TagPlaceholder` を作り、277 行目の `visitNodeFn` を通して返します（`visitNodeFn` は 2 回目の訪問で元の HTML のノードに i18n を付け直すための口。[第 4 回](04-loc-message-id.md)）。

📄 `angular/packages/compiler/src/i18n/i18n_parser.ts` L176–211 （▶ の行: 177, 179–180, 183–184, 188, 191, 196, 200）

```ts
176 │   visitBlock(block: html.Block, context: I18nMessageVisitorContext) {
177 ▶     const children = html.visitAll(this, block.children, context);
178 │ 
179 ▶     if (block.name === 'switch') {
180 ▶       return new i18n.Container(children, block.sourceSpan);
181 │     }
182 │ 
183 ▶     const parameters = block.parameters.map((param) => param.expression);
184 ▶     const startPhName = context.placeholderRegistry.getStartBlockPlaceholderName(
185 │       block.name,
186 │       parameters,
187 │     );
188 ▶     const closePhName = context.placeholderRegistry.getCloseBlockPlaceholderName(block.name);
189 │ 
190 │     context.placeholderToContent[startPhName] = {
191 ▶       text: block.startSourceSpan.toString(),
192 │       sourceSpan: block.startSourceSpan,
193 │     };
194 │ 
195 │     context.placeholderToContent[closePhName] = {
196 ▶       text: block.endSourceSpan ? block.endSourceSpan.toString() : '}',
197 │       sourceSpan: block.endSourceSpan ?? block.sourceSpan,
198 │     };
199 │ 
200 ▶     const node = new i18n.BlockPlaceholder(
201 │       block.name,
202 │       parameters,
203 │       startPhName,
204 │       closePhName,
205 │       children,
206 │       block.sourceSpan,
207 │       block.startSourceSpan,
208 │       block.endSourceSpan,
209 │     );
210 │     return context.visitNodeFn(block, node);
211 │   }
```

1. **@switch だけは包むだけ（179・180 行目）**

   `@switch` そのものは名前を持たず、子を `Container` にまとめるだけです。中の `@case` と `@default` がそれぞれ `BlockPlaceholder` になります。
2. **名前は「ブロックの名前 + 引数」から（183・184・188 行目）**

   `@if (ok)` なら名前 `if` と引数 `["ok"]` から `START_BLOCK_IF`、閉じは `CLOSE_BLOCK_IF` です。`@else if` は `START_BLOCK_ELSE_IF` になります（[第 3 回](03-loc-placeholders.md)）。
3. **元の文字列（191・196 行目）**

   開始は `@if (ok) {` までの元の文字列、閉じは `}` です。

## 7. メッセージの木の型

📄 `angular/packages/compiler/src/i18n/i18n_ast.ts` L23–49 （▶ の行: 25, 27, 29, 41–45, 47–48）

```ts
23 │ export class Message {
24 │   sources: MessageSpan[];
25 ▶   id: string;
26 │   /** The ids to use if there are no custom id and if `i18nLegacyMessageIdFormat` is not empty */
27 ▶   legacyIds: string[] = [];
28 │ 
29 ▶   messageString: string;
30 │ 
31 │   /**
32 │    * @param nodes message AST
33 │    * @param placeholders maps placeholder names to static content and their source spans
34 │    * @param placeholderToMessage maps placeholder names to messages (used for nested ICU messages)
35 │    * @param meaning
36 │    * @param description
37 │    * @param customId
38 │    */
39 │   constructor(
40 │     public nodes: Node[],
41 ▶     public placeholders: {[phName: string]: MessagePlaceholder},
42 ▶     public placeholderToMessage: {[phName: string]: Message},
43 ▶     public meaning: string,
44 ▶     public description: string,
45 ▶     public customId: string,
46 │   ) {
47 ▶     this.id = this.customId;
48 ▶     this.messageString = serializeMessage(this.nodes);
49 │ 
```

41〜45 行目が 5 節で渡したもの（ノード・2 つの表・meaning・description・customId）です。47 行目で `id` にまず customId を入れ、空なら `I18nMetaVisitor` があとで計算した ID を入れます。27 行目の `legacyIds` と 48 行目の `messageString` は ID の材料で、[第 4 回](04-loc-message-id.md)で読みます。

📄 `angular/packages/compiler/src/i18n/i18n_ast.ts` L117–146 （▶ の行: 117, 121–122, 124, 136, 138–139）

```ts
117 ▶ export class TagPlaceholder implements Node {
118 │   constructor(
119 │     public tag: string,
120 │     public attrs: {[k: string]: string},
121 ▶     public startName: string,
122 ▶     public closeName: string,
123 │     public children: Node[],
124 ▶     public isVoid: boolean,
125 │     // TODO sourceSpan should cover all (we need a startSourceSpan and endSourceSpan)
126 │     public sourceSpan: ParseSourceSpan,
127 │     public startSourceSpan: ParseSourceSpan | null,
128 │     public endSourceSpan: ParseSourceSpan | null,
129 │   ) {}
130 │ 
131 │   visit(visitor: Visitor, context?: any): any {
132 │     return visitor.visitTagPlaceholder(this, context);
133 │   }
134 │ }
135 │ 
136 ▶ export class Placeholder implements Node {
137 │   constructor(
138 ▶     public value: string,
139 ▶     public name: string,
140 │     public sourceSpan: ParseSourceSpan,
141 │   ) {}
142 │ 
143 │   visit(visitor: Visitor, context?: any): any {
144 │     return visitor.visitPlaceholder(this, context);
145 │   }
146 │ }
```

`TagPlaceholder` は開始と閉じの 2 つの名前（121・122 行目）と子を持ちます。`Placeholder` は値（補間の式の文字列）と名前（138・139 行目）だけです。ほかの型も同じファイルに並んでいます。

| クラス | テンプレートの何から | 持つもの |
| --- | --- | --- |
| `Message` | `i18n` の要素の中身、または `i18n-*` の属性 1 つ | ノードの配列、2 つの表、meaning・description・customId・id・legacyIds |
| `Text` | 補間の無い文字列 | `value` |
| `Container` | 補間のあるテキスト、`@switch`、ICU の各ケース | `children` |
| `Placeholder` | `{{ 式 }}` | `value`（式の文字列）・`name` |
| `TagPlaceholder` | 中の要素（`<b>`・`<my-cmp>`・`<ng-container>`） | `tag`・`attrs`・`startName`・`closeName`・`children`・`isVoid` |
| `BlockPlaceholder` | `@if`・`@for`・`@case` などのブロック | `name`・`parameters`・`startName`・`closeName`・`children` |
| `Icu` | `{count, plural, …}` | `expression`・`type`・`cases` |
| `IcuPlaceholder` | 文の途中にある ICU（ICU を別のメッセージにしたときの差し込み口） | `value`（`Icu`）・`name` |

ICU の 2 つ（`Icu` と `IcuPlaceholder`）の作り方は [第 7 回](07-loc-icu-compile.md)で読みます。

## 8. デモ：印とメッセージを読む

> **🧪 DEMO — 本物の parseTemplate と @angular/localize の ɵparseMetadata で、印とメッセージを読む**
>
> 「読む」を押すと 2 つのことをします。(1) このページの @angular/compiler 22.1.6 の `parseTemplate` の結果（R3 AST）をたどり、要素や属性の `i18n` に載った `Message` を並べます（木は `visit` で 1 行にしたもの）。(2) `compileI18nTemplate` でコンパイルし、consts の `$localize` の 1 つめの部品を @angular/localize 22.1.6 の `ɵparseMetadata` で読みます。2 つの表の順番は違います（consts は ICU などの部品が先に並ぶ）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/loc-markup)

初期値では、`<h1>` の meaning が `"site header"`・description が `"greeting"`・customId が `"hello"` になり、`<img>` は属性 `title` にだけメッセージが載ります。`<ng-container i18n="cart">` の木には `TagPlaceholder START_BOLD_TEXT` と `BlockPlaceholder START_BLOCK_IF` が並びます。印の値を `"m | d"` や `"desc@@a|b"` に変えると、2 節の切り方がそのまま見えます。

## ここまでの呼び出し

- `I18nMetaVisitor.visitElement(element)` — render3/view/i18n/meta.ts
  - `_visitElementLike(node)` → `hasI18nAttrs(node)` — meta.ts → util.ts L24
    - `attr.name === 'i18n'` → `_generateI18nMessage(children, value)` — meta.ts（R3 AST の章の 7 節）
    - `attr.name.startsWith('i18n-')` → `attrsMeta[name] = value` — meta.ts L201〜218
    - `_generateI18nMessage([attr], meta)` — meta.ts L231 — *属性 1 つが 1 つのメッセージ*
      - `_parseMetadata(meta)` → `parseI18nMeta(meta)` — meta.ts L317
      - `createI18nMessageFactory(...)` → `toI18nMessage(nodes, meaning, description, customId)` — i18n/i18n\_parser.ts L43・L72
        - `visitText` / `visitAttribute` / `_visitElementLike` / `visitBlock` — i18n\_parser.ts — *Text・Container・TagPlaceholder・BlockPlaceholder を作る*
        - `new i18n.Message(nodes, …)` — i18n/i18n\_ast.ts L39
  - `html.visitAll(this, node.children, message)` — meta.ts L242 — *中の要素・ブロックへ*

## テストと直し方

### spec

印の値の切り方は、render3 の i18n の spec にまとまっています。

📄 `angular/packages/compiler/test/render3/view/i18n_spec.ts` L39–54 （▶ の行: 40, 45–46, 52）

```ts
39 │   describe('metadata serialization', () => {
40 ▶     it('parseI18nMeta()', () => {
41 │       expect(parseI18nMeta('')).toEqual(meta());
42 │       expect(parseI18nMeta('desc')).toEqual(meta('', '', 'desc'));
43 │       expect(parseI18nMeta('desc@@id')).toEqual(meta('id', '', 'desc'));
44 │       expect(parseI18nMeta('meaning|desc')).toEqual(meta('', 'meaning', 'desc'));
45 ▶       expect(parseI18nMeta('meaning|desc@@id')).toEqual(meta('id', 'meaning', 'desc'));
46 ▶       expect(parseI18nMeta('@@id')).toEqual(meta('id', '', ''));
47 │ 
48 │       expect(parseI18nMeta('\n   ')).toEqual(meta());
49 │       expect(parseI18nMeta('\n   desc\n   ')).toEqual(meta('', '', 'desc'));
50 │       expect(parseI18nMeta('\n   desc@@id\n   ')).toEqual(meta('id', '', 'desc'));
51 │       expect(parseI18nMeta('\n   meaning|desc\n   ')).toEqual(meta('', 'meaning', 'desc'));
52 ▶       expect(parseI18nMeta('\n   meaning|desc@@id\n   ')).toEqual(meta('id', 'meaning', 'desc'));
53 │       expect(parseI18nMeta('\n   @@id\n   ')).toEqual(meta('id', '', ''));
54 │     });
```

45 行目が `meaning|desc@@id` の基本形、48〜53 行目が「前後に改行と空白があっても同じ結果」の確認です（2 節の 322 行目）。`|` を customId に入れる場合（2 節の注意）はここに無いので、もし直すなら 46 行目のあとに 1 行足すのが入口です。

メッセージの木は i18n\_parser\_spec.ts にあります。ただし入口が違うことに注意します。

📄 `angular/packages/compiler/test/i18n/i18n_parser_spec.ts` L42–60 （▶ の行: 42, 46, 55, 57）

```ts
42 ▶     it('should support void elements', () => {
43 │       expect(_humanizeMessages('<div i18n="m|d"><p><br></p></div>')).toEqual([
44 │         [
45 │           [
46 ▶             '<ph tag name="START_PARAGRAPH"><ph tag name="LINE_BREAK"/></ph name="CLOSE_PARAGRAPH">',
47 │           ],
48 │           'm',
49 │           'd',
50 │           '',
51 │         ],
52 │       ]);
53 │     });
54 │ 
55 ▶     it('should trim whitespace from custom ids (but not meanings)', () => {
56 │       expect(_humanizeMessages('<div i18n="\n   m|d@@id\n   ">text</div>')).toEqual([
57 ▶         [['text'], '\n   m', 'd', 'id'],
58 │       ]);
59 │     });
60 │   });
```

55 行目の it の名前は「customId の空白は落とすが meaning は落とさない」で、57 行目の期待値の meaning は `'\n m'` です。これは spec が使う `_extractMessages` が古い抽出（`extractor_merger.ts` の `_parseMessageMeta`）を通るからで、ngtsc の道の `parseI18nMeta` は 2 節の 322 行目で全体を trim するので meaning は `'m'` になります。meaning は ID に入るので（[第 4 回](04-loc-message-id.md)）、古い xi18n の抽出と `$localize` の道で、改行を含む印の ID が違う数になりえます。

| spec | describe / it（行） | 入口 |
| --- | --- | --- |
| `compiler/test/render3/view/i18n_spec.ts` | `'Utils'`（21）→ `'metadata serialization'`（39）→ `'parseI18nMeta()'`（40） | `parseI18nMeta` を直接 |
| `compiler/test/i18n/i18n_parser_spec.ts` | `'I18nParser'`（14）の `'elements'`（15）・`'attributes'`（62）・`'blocks'`（152）など | `extractor_merger` の `extractMessages` |
| `compiler/test/i18n/i18n_ast_spec.ts` | `'Message'`（13）→ `'messageText()'`（18） | `createI18nMessageFactory` を直接 |
| `compiler/test/i18n/serializers/i18n_ast_spec.ts` | `'i18n AST'`（14）の `CloneVisitor`・`RecurseVisitor` | ノードのクラス |

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=^(I18nParser|Message|i18n AST|Utils metadata serialization parseI18nMeta)'
```

2026-11-03 の結果は **Ran 42 of 403 specs、42 specs, 0 failures、PASSED in 0.7s**（ログは `scratchpad/i18n-logs/a-markup.log`）。`I18nMetaVisitor` の `i18n-*` の枝（3 節）を確かめる spec は compiler の単体テストには無く、セキュリティのエラーは core の `packages/core/test/linker/security_integration_spec.ts` の `describe('translation')`（302 行目）が TestBed（JIT のコンパイラ）を通して確かめています。`'should throw error on translated event attributes'`（379 行目）と `'should not throw error on translating "on" attribute'`（388 行目）が、3 節の `on` の規則の両側です。`pnpm bazel test //packages/core/test:test --test_arg=--filter='^security integration tests translation'` で **4 shard の合計 10 specs、0 failures、PASSED in 1.5s**（`a-security.log`）でした。

### 直すとしたら、どこから

- **印の値が思ったように切れない**：`meta.ts` の `parseI18nMeta`（317 行目）。逆向きの `@angular/localize` の `parseMetadata` と**両方**を揃えないと、出力と抽出がずれます。
- **属性が翻訳されない**：3 節の 230 行目（値が空なら何もしない）と、属性名が `i18n-` の後ろと一致しているか。
- **中の要素・ブロックの扱い**：`i18n_parser.ts` の `_visitElementLike`（221 行目）と `visitBlock`（176 行目）。spec は `i18n_ast_spec.ts` の `'Message'` に 1 つ足すのが小さい（`createI18nMessageFactory` を直接呼ぶので、古い抽出を通らない）。
- 関係する開いている issue：#60034（中身の空な要素に `i18n="@@button-text"` だけを書くと、1 節で触れた 166〜200 行目の「中身が空なら捨てる」分岐でメッセージが作られず、実行時の翻訳で何も出ない）、#60899（制御フローの移行と i18n）。読み方は [第 20 回](20-loc-issues.md)。

## 聞かれそうな質問

**Q. `i18n="@@myId"` だけを書くと、meaning と description はどうなりますか？**

どちらも空文字です。meta.ts 324 行目で `@@` が 0 文字目に見つかり、328 行目で左の `meaningAndDesc` は空、右の customId が `myId` になります。`|` が無いので 332 行目で meaning も空です。spec では i18n\_spec.ts 46 行目が同じ形を確かめています。

**Q. `i18n-title` を付けたのに翻訳ファイルにメッセージが出ません。**

meta.ts 230 行目を見ます。`title` の値が空のときと、`title` 属性そのものが無いときは、エラーにならずにメッセージが作られません。`[title]="…"` のようなプロパティのバインディングも、HTML の木では `[title]` という名前の属性なので、`i18n-title` とは名前が合いません。

**Q. `i18n-onclick` はなぜエラーになるのですか？**

meta.ts 211〜215 行目です。`on` で始まる属性はイベントハンドラになりうるので、翻訳文で中身を差し替えられないようにコンパイルエラーにします。Trusted Types の対象の属性（208 行目の `isTrustedTypesSink`）も同じです。

**Q. `<div i18n>` の中の `<b class="x">` の `class` は翻訳できますか？**

中身のメッセージとしては翻訳されません。i18n\_parser.ts 228〜229 行目のとおり、中の要素の属性は文字列として控えるだけで、メッセージのノードになりません。翻訳したいなら、その要素に `i18n-class` を付けて別のメッセージにします（meta.ts の 3 節の枝。ただし `class` の値は名前の決め方にも使われます：[第 3 回](03-loc-placeholders.md)）。

**Q. `@if` を `i18n` の中に書くのと外に書くのでは、何が違いますか？**

中に書くと 1 つのメッセージの中の `BlockPlaceholder`（i18n\_parser.ts 200 行目）になり、翻訳する人は `{$START_BLOCK_IF}` を含む 1 つの文を訳します。外に書くと meta.ts 146〜148 行目でブロックの中の要素に降りていき、その要素が独立したメッセージになります。

## 読み終えて

- 印は `i18n`（中身）と `i18n-*`（属性）の 2 種類。値は `parseI18nMeta` が全体を trim してから `@@`、次に `|` で切る。
- `i18n-*` は値が空でない属性 1 つを材料に 1 つのメッセージを作る。`on*` と Trusted Types の対象はコンパイルエラー。
- メッセージの中身は `_I18nVisitor` が作る。要素は `TagPlaceholder`、補間は `Placeholder`、ブロックは `BlockPlaceholder`、`@switch` は `Container`。
- `PlaceholderRegistry` と 2 つの表はメッセージごとに新しく作られる。
- 古い抽出（`extractor_merger`）と ngtsc の道は印の値の切り方が少し違い（meaning の trim）、spec の多くは古い道を通る。

---

← 前: [i18n の全体像：i18n 属性から画面の翻訳文まで](01-loc-overview.md)  
次: [プレースホルダーの名前：INTERPOLATION と START\_BOLD\_TEXT](03-loc-placeholders.md) →
