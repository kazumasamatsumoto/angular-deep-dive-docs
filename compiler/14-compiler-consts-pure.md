[目次](../README.md) › [テンプレートコンパイラの内側](README.md) › 第 14 回 / 全 18 回

# 定数配列と pure function：consts・AttributeMarker・ɵɵpureFunction

> const\_collection.ts が静的な属性・クラス・スタイル・テンプレート属性を AttributeMarker で区切った配列にまとめ、consts のインデックスで共有する行、pure\_literal\_structures.ts と pure\_function\_extraction.ts が \[x\]="\[a, b\]" の配列リテラルを ɵɵpureFunction2 に変えて毎回の生成を避ける理由、chaining.ts が同じ命令の連続を ɵɵproperty(...)(...) の連鎖にまとめる行。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-consts-pure)

---

コンパイル後のコンポーネントには `consts: [["title", "Hello", 1, "my-app"]]` のような配列が付き、テンプレート関数では `ɵɵelementStart(0, "div", 0)` の最後の `0` がその番号を指します。また `[names]="['Nancy', customName]"` は `ɵɵpureFunction1(1, _c0, ctx.customName)` になり、`ɵɵproperty(…)(…)` のように命令がつながって出力されることもあります。この章では、この 3 つ ―― 静的な属性を **AttributeMarker で区切った定数配列**にする、配列・オブジェクトリテラルを **pure function** にする、同じ命令を**連鎖**させる ―― を、それぞれのフェーズの行で読みます。

読む対象は `packages/compiler/src/template/pipeline/src/phases/` の `attribute_extraction.ts`・`parse_extracted_styles.ts`・`const_collection.ts`・ `pure_literal_structures.ts`・`pure_function_extraction.ts`・`chaining.ts`、`compiler/src/constant_pool.ts`、実行時側の `core/src/render3/interfaces/attribute_marker.ts`・`util/attrs_utils.ts`・`pure_function.ts`、fixture の `test_cases/r3_compiler_compliance/` です。

1. [1. 全体図](01-compiler.md)
2. [2. コンパイラの入口](02-compiler-entry.md)
3. [3. HTML の字句解析](03-compiler-html-lexer.md)
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
14. **14. 定数配列と pure function**（この章）
15. [15. 制御フローのフェーズ](15-compiler-control-flow-phases.md)
16. [16. reify と出力](16-compiler-reify-emit.md)
17. [17. 型検査（TCB）](17-compiler-typecheck.md)
18. [18. スタイルのカプセル化](18-compiler-shadow-css.md)

## 1. 先にゴールを見る：consts とその番号

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/elements/dom.ts` L3–9 （▶ の行: 5）

```ts
3 │ @Component({
4 │     selector: 'my-component',
5 ▶     template: '<div class="my-app" title="Hello">Hello <b>World</b>!</div>',
6 │     standalone: false
7 │ })
8 │ export class MyComponent {
9 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/elements/dom_template.js` L1–13 （▶ の行: 1–2, 5, 7）

```js
 1 ▶ // NOTE: AttributeMarker.Classes = 1
 2 ▶ consts: [["title", "Hello", 1, "my-app"]],
 3 │ template: function MyComponent_Template(rf, ctx) {
 4 │   if (rf & 1) {
 5 ▶     $r3$.ɵɵelementStart(0, "div", 0);
 6 │     $r3$.ɵɵtext(1, "Hello ");
 7 ▶     $r3$.ɵɵelementStart(2, "b");
 8 │     $r3$.ɵɵtext(3, "World");
 9 │     $r3$.ɵɵelementEnd();
10 │     $r3$.ɵɵtext(4, "!");
11 │     $r3$.ɵɵelementEnd();
12 │   }
13 │ }
```

`<div class="my-app" title="Hello">` の 2 つの静的な属性は、2 行目の consts の 0 番の配列 `["title", "Hello", 1, "my-app"]` になり、5 行目の `ɵɵelementStart(0, "div", 0)` の 3 つ目の引数 `0` がその番号です。属性の無い 7 行目の `<b>` には番号がありません。配列の中の `1` は 1 行目の注記どおり `AttributeMarker.Classes` で、「ここから後ろはクラス名」という区切りです。`title` が前、`class` が後ろに並び替わっている点にも注意してください（4 節）。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/elements/deduplicate_attributes.ts` L3–12 （▶ の行: 6–7）

```ts
 3 │ @Component({
 4 │     selector: 'my-component',
 5 │     template: `
 6 ▶     <div title="hi"></div>
 7 ▶     <span title="hi"></span>
 8 │   `,
 9 │     standalone: false
10 │ })
11 │ export class MyComponent {
12 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/elements/deduplicate_attributes.js` L1–7 （▶ の行: 1, 4）

```js
1 ▶ consts: [["title", "hi"]],
2 │ template: function MyComponent_Template(rf, ctx) {
3 │   if (rf & 1) {
4 ▶     $r3$.ɵɵelement(0, "div", 0)(1, "span", 0);
5 │   }
6 │   …
7 │ }
```

別の要素でも属性が同じなら、consts の項目は 1 つだけで、2 つの命令が同じ番号 `0` を指します（4 行目）。同じ 4 行目の `ɵɵelement(0, …)(1, …)` が、7 節で読む「連鎖」です。

## 2. AttributeMarker：配列の中の区切り

📄 `angular/packages/core/src/render3/interfaces/attribute_marker.ts` L9–46 （▶ の行: 13, 21, 28, 46）

````ts
 9 │ /**
10 │  * A set of marker values to be used in the attributes arrays. These markers indicate that some
11 │  * items are not regular attributes and the processing should be adapted accordingly.
12 │  */
13 ▶ export const enum AttributeMarker {
14 │   /**
15 │    * An implicit marker which indicates that the value in the array are of `attributeKey`,
16 │    * `attributeValue` format.
17 │    *
18 │    * NOTE: This is implicit as it is the type when no marker is present in array. We indicate that
19 │    * it should not be present at runtime by the negative number.
20 │    */
21 ▶   ImplicitAttributes = -1,
22 │ 
23 │   /**
24 │    * Marker indicates that the following 3 values in the attributes array are:
25 │    * namespaceUri, attributeName, attributeValue
26 │    * in that order.
27 │    */
28 ▶   NamespaceURI = 0,
29 │ 
30 │   /**
31 │    * Signals class declaration.
32 │    *
33 │    * Each value following `Classes` designates a class name to include on the element.
34 │    * ## Example:
35 │    *
36 │    * Given:
37 │    * ```html
38 │    * <div class="foo bar baz">...</div>
39 │    * ```
40 │    *
41 │    * the generated code is:
42 │    * ```ts
43 │    * var _c1 = [AttributeMarker.Classes, 'foo', 'bar', 'baz'];
44 │    * ```
45 │    */
46 ▶   Classes = 1,
````

📄 `angular/packages/core/src/render3/interfaces/attribute_marker.ts` L65–107 （▶ の行: 65, 79, 82, 96–97, 104, 107）

````ts
 65 ▶   Styles = 2,
 66 │ 
 67 │   /**
 68 │    * Signals that the following attribute names were extracted from input or output bindings.
 69 │    *
 70 │    * For example, given the following HTML:
 71 │    *
 72 │    * ```html
 73 │    * <div moo="car" [foo]="exp" (bar)="doSth()">
 74 │    * ```
 75 │    *
 76 │    * the generated code is:
 77 │    *
 78 │    * ```ts
 79 ▶    * var _c1 = ['moo', 'car', AttributeMarker.Bindings, 'foo', 'bar'];
 80 │    * ```
 81 │    */
 82 ▶   Bindings = 3,
 83 │ 
 84 │   /**
 85 │    * Signals that the following attribute names were hoisted from an inline-template declaration.
 86 │    *
 87 │    * For example, given the following HTML:
 88 │    *
 89 │    * ```html
 90 │    * <div *ngFor="let value of values; trackBy:trackBy" dirA [dirB]="value">
 91 │    * ```
 92 │    *
 93 │    * the generated code for the `template()` instruction would include:
 94 │    *
 95 │    * ```
 96 ▶    * ['dirA', '', AttributeMarker.Bindings, 'dirB', AttributeMarker.Template, 'ngFor', 'ngForOf',
 97 ▶    * 'ngForTrackBy', 'let-value']
 98 │    * ```
 99 │    *
100 │    * while the generated code for the `element()` instruction inside the template function would
101 │    * include:
102 │    *
103 │    * ```
104 ▶    * ['dirA', '', AttributeMarker.Bindings, 'dirB']
105 │    * ```
106 │    */
107 ▶   Template = 4,
````

📄 `angular/packages/core/src/render3/interfaces/attribute_marker.ts` L109–143 （▶ の行: 122, 125, 139, 142）

````ts
109 │   /**
110 │    * Signals that the following attribute is `ngProjectAs` and its value is a parsed
111 │    * `CssSelector`.
112 │    *
113 │    * For example, given the following HTML:
114 │    *
115 │    * ```html
116 │    * <h1 attr="value" ngProjectAs="[title]">
117 │    * ```
118 │    *
119 │    * the generated code for the `element()` instruction would include:
120 │    *
121 │    * ```ts
122 ▶    * ['attr', 'value', AttributeMarker.ProjectAs, ['', 'title', '']]
123 │    * ```
124 │    */
125 ▶   ProjectAs = 5,
126 │ 
127 │   /**
128 │    * Signals that the following attribute will be translated by runtime i18n
129 │    *
130 │    * For example, given the following HTML:
131 │    *
132 │    * ```html
133 │    * <div moo="car" foo="value" i18n-foo [bar]="binding" i18n-bar>
134 │    * ```
135 │    *
136 │    * the generated code is:
137 │    *
138 │    * ```ts
139 ▶    * var _c1 = ['moo', 'car', AttributeMarker.I18n, 'foo', 'bar'];
140 │    * ```
141 │    */
142 ▶   I18n = 6,
143 │ }
````

| 値 | 名前 | 行 | 後ろに続くもの |
| --- | --- | --- | --- |
| （無し） | `ImplicitAttributes` = -1 | 21 | 先頭から最初のマーカーまでは `名前, 値` の組。-1 は配列には出てこない（18・19 行目） |
| 0 | `NamespaceURI` | 28 | 名前空間・属性名・値の 3 つ |
| 1 | `Classes` | 46 | クラス名を 1 つずつ |
| 2 | `Styles` | 65 | スタイル名・値の組 |
| 3 | `Bindings` | 82 | 束縛（`[foo]`・`(bar)`）の**名前だけ** |
| 4 | `Template` | 107 | `*ngFor` などから `<ng-template>` に持ち上げた名前だけ |
| 5 | `ProjectAs` | 125 | `ngProjectAs` を解析したセレクタ |
| 6 | `I18n` | 142 | 実行時に翻訳する属性の名前だけ |

13 行目、`const enum`（TypeScript がコンパイル時に数値へ置き換え、実行時には名前が残らない enum）です。3 と 4 の後ろに値が無いのは、束縛の値は実行時に更新命令が入れるもので、consts には「この名前の束縛がある」ことだけを書けば足りるからです。それでも名前を入れておくのは、ディレクティブのセレクタ照合（`[foo]` で選ぶディレクティブ）が、この配列の名前を見るからです。

📄 `angular/packages/core/src/render3/node_selector_matcher.ts` L236–270 （▶ の行: 246, 250–251, 253, 256, 258–259, 268, 270）

```ts
236 │ function findAttrIndexInNode(
237 │   name: string,
238 │   attrs: TAttributes | null,
239 │   isInlineTemplate: boolean,
240 │   isProjectionMode: boolean,
241 │ ): number {
242 │   if (attrs === null) return -1;
243 │ 
244 │   let i = 0;
245 │ 
246 ▶   if (isProjectionMode || !isInlineTemplate) {
247 │     let bindingsMode = false;
248 │     while (i < attrs.length) {
249 │       const maybeAttrName = attrs[i];
250 ▶       if (maybeAttrName === name) {
251 ▶         return i;
252 │       } else if (
253 ▶         maybeAttrName === AttributeMarker.Bindings ||
254 │         maybeAttrName === AttributeMarker.I18n
255 │       ) {
256 ▶         bindingsMode = true;
257 │       } else if (
258 ▶         maybeAttrName === AttributeMarker.Classes ||
259 ▶         maybeAttrName === AttributeMarker.Styles
260 │       ) {
261 │         let value = attrs[++i];
262 │         // We should skip classes here because we have a separate mechanism for
263 │         // matching classes in projection mode.
264 │         while (typeof value === 'string') {
265 │           value = attrs[++i];
266 │         }
267 │         continue;
268 ▶       } else if (maybeAttrName === AttributeMarker.Template) {
269 │         // We do not care about Template attributes in this scenario.
270 ▶         break;
```

実行時の照合関数です。250・251 行目、配列の中に探している名前があれば一致。253〜256 行目、`Bindings` / `I18n` のマーカーを越えても探し続けるので、`[foo]="x"` と書いた要素も `[foo]` セレクタのディレクティブに一致します。258・259 行目、クラスとスタイルの部分は読み飛ばし、268〜270 行目、`Template` まで来たら止まります。セレクタ照合の全体は[第 9 回](09-compiler-binder.md)（コンパイラ側）と [ディレクティブの章](../ivy/14-ivy-directives.md)（実行時側）です。

📄 `angular/packages/compiler/src/core.ts` L198–209 （▶ の行: 198, 203, 209）

```ts
198 ▶ // Pasted from render3/interfaces/node.ts
199 │ /**
200 │  * A set of marker values to be used in the attributes arrays. These markers indicate that some
201 │  * items are not regular attributes and the processing should be adapted accordingly.
202 │  */
203 ▶ export const enum AttributeMarker {
204 │   /**
205 │    * Marker indicates that the following 3 values in the attributes array are:
206 │    * namespaceUri, attributeName, attributeValue
207 │    * in that order.
208 │    */
209 ▶   NamespaceURI = 0,
```

コンパイラは `@angular/core` を import しないので、198 行目のコメントのとおり**同じ値の写し**を `compiler/src/core.ts` に持っています。以下のコンパイラのコードの `core.AttributeMarker.Classes` はこちらです。

## 3. 属性を「抜き出す」：extractAttributes と parseExtractedStyles

consts に入れる材料を集めるのは、phases 配列の 13 番目 `extractAttributes` と 15 番目 `parseExtractedStyles` です。どちらも、要素の op の**直前**に `ExtractedAttributeOp`（「この要素にこの属性がある」というだけの作成側の op）を差し込みます。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/attribute_extraction.ts` L18–57 （▶ の行: 20–21, 24, 26, 36–37, 39, 42, 44, 49, 54）

```ts
18 │ export function extractAttributes(job: CompilationJob): void {
19 │   for (const unit of job.units) {
20 ▶     const elements = createOpXrefMap(unit);
21 ▶     for (const op of unit.ops()) {
22 │       switch (op.kind) {
23 │         case ir.OpKind.Attribute:
24 ▶           extractAttributeOp(unit, op, elements);
25 │           break;
26 ▶         case ir.OpKind.Property:
27 │           if (
28 │             op.bindingKind !== ir.BindingKind.LegacyAnimation &&
29 │             op.bindingKind !== ir.BindingKind.Animation
30 │           ) {
31 │             let bindingKind: ir.BindingKind;
32 │             if (op.i18nMessage !== null && op.templateKind === null) {
33 │               // If the binding has an i18n context, it is an i18n attribute, and should have that
34 │               // kind in the consts array.
35 │               bindingKind = ir.BindingKind.I18n;
36 ▶             } else if (op.isStructuralTemplateAttribute) {
37 ▶               bindingKind = ir.BindingKind.Template;
38 │             } else {
39 ▶               bindingKind = ir.BindingKind.Property;
40 │             }
41 │ 
42 ▶             ir.OpList.insertBefore<ir.CreateOp>(
43 │               // Deliberately null i18nMessage value
44 ▶               ir.createExtractedAttributeOp(
45 │                 op.target,
46 │                 bindingKind,
47 │                 null,
48 │                 op.name,
49 ▶                 /* expression */ null,
50 │                 /* i18nContext */ null,
51 │                 /* i18nMessage */ null,
52 │                 op.securityContext,
53 │               ),
54 ▶               lookupElement(elements, op.target),
55 │             );
56 │           }
57 │           break;
```

1. **20・21 行目：要素の逆引き表を作り、全 op を回す**

   `unit.ops()` は作成側（リスナーを含む）を先に、更新側を後に返します（compilation.ts の `CompilationUnit.ops()`）。この順番が、後で `Bindings` の並びになります。
2. **26〜57 行目：プロパティ束縛は名前だけ抜き出す**

   `[id]="x"` の PropertyOp は更新側に残したまま、42〜55 行目で要素の op の前に `ExtractedAttributeOp` を足します。49 行目、式は `null`（値は consts に入れない）。種類は 36・37 行目、`*ngFor` から来た束縛なら `Template`、普通なら 39 行目の `Property`。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/attribute_extraction.ts` L96–119 （▶ の行: 96, 98, 100, 108, 113）

```ts
 96 ▶         case ir.OpKind.Listener:
 97 │           if (!op.isLegacyAnimationListener) {
 98 ▶             const extractedAttributeOp = ir.createExtractedAttributeOp(
 99 │               op.target,
100 ▶               ir.BindingKind.Property,
101 │               null,
102 │               op.name,
103 │               /* expression */ null,
104 │               /* i18nContext */ null,
105 │               /* i18nMessage */ null,
106 │               SecurityContext.NONE,
107 │             );
108 ▶             if (job.kind === CompilationJobKind.Host) {
109 │               // TemplateDefinitionBuilder does not extract listener bindings to the const array
110 │               // (which is honestly pretty inconsistent).
111 │               break;
112 │             } else {
113 ▶               ir.OpList.insertBefore<ir.CreateOp>(
114 │                 extractedAttributeOp,
115 │                 lookupElement(elements, op.target),
116 │               );
117 │             }
118 │           }
119 │           break;
```

`(click)` も同じく名前だけを `Property` の種類で抜き出します（98〜100 行目）。だから consts の `Bindings` には入力と出力が混ざって並びます。108〜111 行目、ホストのリスナーは抜き出しません（コメントによれば、古いコンパイラ TemplateDefinitionBuilder がそうしていたため）。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/attribute_extraction.ts` L161–193 （▶ の行: 166–167, 172–173, 175, 178, 189, 191）

```ts
161 │ function extractAttributeOp(
162 │   unit: CompilationUnit,
163 │   op: ir.AttributeOp,
164 │   elements: Map<ir.XrefId, ir.ConsumesSlotOpTrait & ir.CreateOp>,
165 │ ) {
166 ▶   if (op.expression instanceof ir.Interpolation) {
167 ▶     return;
168 │   }
169 │ 
170 │   // TemplateDefinitionBuilder only extracts text attributes. It does not extract attriibute
171 │   // bindings, even if they are constants.
172 ▶   if (op.isTextAttribute) {
173 ▶     const extractedAttributeOp = ir.createExtractedAttributeOp(
174 │       op.target,
175 ▶       op.isStructuralTemplateAttribute ? ir.BindingKind.Template : ir.BindingKind.Attribute,
176 │       op.namespace,
177 │       op.name,
178 ▶       op.expression,
179 │       op.i18nContext,
180 │       op.i18nMessage,
181 │       op.securityContext,
182 │     );
183 │     if (unit.job.kind === CompilationJobKind.Host) {
184 │       // This attribute will apply to the enclosing host binding compilation unit, so order doesn't
185 │       // matter.
186 │       unit.create.push(extractedAttributeOp);
187 │     } else {
188 │       const ownerOp = lookupElement(elements, op.target);
189 ▶       ir.OpList.insertBefore<ir.CreateOp>(extractedAttributeOp, ownerOp);
190 │     }
191 ▶     ir.OpList.remove<ir.UpdateOp>(op);
192 │   }
193 │ }
```

静的な属性 `title="Hello"` は、ingest の時点では更新側の `AttributeOp` です。172 行目、テキストの属性（`isTextAttribute`）なら、189 行目で値ごと `ExtractedAttributeOp` にして要素の前へ入れ、191 行目で**更新側の op を消します**。実行時に毎回更新する必要が無いからです。166・167 行目、補間を含む属性（`title="a{{b}}"` のような）は抜き出さず、更新命令のまま残します。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/parse_extracted_styles.ts` L150–186 （▶ の行: 150–152, 156, 158–159, 167–169, 174, 176, 185）

```ts
150 ▶         if (op.name === 'style') {
151 ▶           const parsedStyles = parse(op.expression.value);
152 ▶           for (let i = 0; i < parsedStyles.length - 1; i += 2) {
153 │             ir.OpList.insertBefore<ir.CreateOp>(
154 │               ir.createExtractedAttributeOp(
155 │                 op.target,
156 ▶                 ir.BindingKind.StyleProperty,
157 │                 null,
158 ▶                 parsedStyles[i],
159 ▶                 o.literal(parsedStyles[i + 1]),
160 │                 null,
161 │                 null,
162 │                 SecurityContext.STYLE,
163 │               ),
164 │               op,
165 │             );
166 │           }
167 ▶           ir.OpList.remove<ir.CreateOp>(op);
168 ▶         } else if (op.name === 'class') {
169 ▶           const parsedClasses = op.expression.value.trim().split(/\s+/g);
170 │           for (const parsedClass of parsedClasses) {
171 │             ir.OpList.insertBefore<ir.CreateOp>(
172 │               ir.createExtractedAttributeOp(
173 │                 op.target,
174 ▶                 ir.BindingKind.ClassName,
175 │                 null,
176 ▶                 parsedClass,
177 │                 null,
178 │                 null,
179 │                 null,
180 │                 SecurityContext.NONE,
181 │               ),
182 │               op,
183 │             );
184 │           }
185 ▶           ir.OpList.remove<ir.CreateOp>(op);
186 │         }
```

抜き出した属性のうち `style` と `class` だけは、15 番目の `parseExtractedStyles` がさらに分解します。150〜152 行目、`style="color: red; padding: 4px"` を `['color', 'red', 'padding', '4px']` に解析し、組ごとに 156 行目の `StyleProperty` の op を作ります。168・169 行目、`class="card big"` は空白で分けて、174 行目の `ClassName` の op を 1 つずつ。元の `style` / `class` の op は 167・185 行目で消します。

## 4. consts に並べる：collectElementConsts

📄 `angular/packages/compiler/src/template/pipeline/src/phases/const_collection.ts` L24–63 （▶ の行: 24, 26, 29–30, 32–33, 51–52）

```ts
24 ▶ export function collectElementConsts(job: CompilationJob): void {
25 │   // Collect all extracted attributes.
26 ▶   const allElementAttributes = new Map<ir.XrefId, ElementAttributes>();
27 │   for (const unit of job.units) {
28 │     for (const op of unit.create) {
29 ▶       if (op.kind === ir.OpKind.ExtractedAttribute) {
30 ▶         const attributes = allElementAttributes.get(op.target) || new ElementAttributes();
31 │         allElementAttributes.set(op.target, attributes);
32 ▶         attributes.add(op.bindingKind, op.name, op.expression, op.namespace, op.trustedValueFn);
33 ▶         ir.OpList.remove<ir.CreateOp>(op);
34 │       }
35 │     }
36 │   }
37 │ 
38 │   // Serialize the extracted attributes into the const array.
39 │   if (job instanceof ComponentCompilationJob) {
40 │     for (const unit of job.units) {
41 │       for (const op of unit.create) {
42 │         // TODO: Simplify and combine these cases.
43 │         if (op.kind == ir.OpKind.Projection) {
44 │           const attributes = allElementAttributes.get(op.xref);
45 │           if (attributes !== undefined) {
46 │             const attrArray = serializeAttributes(attributes);
47 │             if (attrArray.entries.length > 0) {
48 │               op.attributes = job.pool.getConstLiteral(attrArray, true);
49 │             }
50 │           }
51 ▶         } else if (ir.isElementOrContainerOp(op)) {
52 ▶           op.attributes = getConstIndex(job, allElementAttributes, op.xref);
53 │ 
54 │           // TODO(dylhunn): `@for` loops with `@empty` blocks need to be special-cased here,
55 │           // because the slot consumer trait currently only supports one slot per consumer and we
56 │           // need two. This should be revisited when making the refactors mentioned in:
57 │           // https://github.com/angular/angular/pull/53620#discussion_r1430918822
58 │           if (op.kind === ir.OpKind.RepeaterCreate && op.emptyView !== null) {
59 │             op.emptyAttributes = getConstIndex(job, allElementAttributes, op.emptyView);
60 │           }
61 │         }
62 │       }
63 │     }
```

phases 配列の 61 番目です（位置は[第 12 回](12-compiler-slots-vars.md)の 2 節）。29〜33 行目、作成側の `ExtractedAttributeOp` を要素の XrefId ごとの `ElementAttributes` に集めながら、op 自体は消します（33 行目）。役目はここで終わりです。51・52 行目、要素の op に、集めた属性の consts 番号を書き込みます。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/const_collection.ts` L150–167 （▶ の行: 160–165）

```ts
150 │   add(
151 │     kind: ir.BindingKind,
152 │     name: string,
153 │     value: o.Expression | null,
154 │     namespace: string | null,
155 │     trustedValueFn: o.Expression | null,
156 │   ): void {
157 │     // TemplateDefinitionBuilder puts duplicate attribute, class, and style values into the consts
158 │     // array. This seems inefficient, we can probably keep just the first one or the last value
159 │     // (whichever actually gets applied when multiple values are listed for the same attribute).
160 ▶     const allowDuplicates =
161 ▶       kind === ir.BindingKind.Attribute ||
162 ▶       kind === ir.BindingKind.ClassName ||
163 ▶       kind === ir.BindingKind.StyleProperty;
164 ▶     if (!allowDuplicates && this.isKnown(kind, name)) {
165 ▶       return;
166 │     }
167 │ 
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/const_collection.ts` L183–228 （▶ の行: 183–185, 199, 205–206, 209–210, 224, 227）

```ts
183 ▶     const array = this.arrayFor(kind);
184 ▶     array.push(...getAttributeNameLiterals(namespace, name));
185 ▶     if (kind === ir.BindingKind.Attribute || kind === ir.BindingKind.StyleProperty) {
186 │       if (value === null) {
187 │         throw Error('Attribute, i18n attribute, & style element attributes must have a value');
188 │       }
189 │       if (trustedValueFn !== null && ir.isStringLiteral(value)) {
190 │         array.push(
191 │           o.taggedTemplate(
192 │             trustedValueFn,
193 │             new o.TemplateLiteralExpr([new o.TemplateLiteralElementExpr(value.value)], []),
194 │             undefined,
195 │             value.sourceSpan,
196 │           ),
197 │         );
198 │       } else {
199 ▶         array.push(value);
200 │       }
201 │     }
202 │   }
203 │ 
204 │   private arrayFor(kind: ir.BindingKind): o.Expression[] {
205 ▶     if (kind === ir.BindingKind.Property || kind === ir.BindingKind.TwoWayProperty) {
206 ▶       this.propertyBindings ??= [];
207 │       return this.propertyBindings;
208 │     } else {
209 ▶       if (!this.byKind.has(kind)) {
210 ▶         this.byKind.set(kind, []);
211 │       }
212 │       return this.byKind.get(kind)!;
213 │     }
214 │   }
215 │ }
216 │ 
217 │ /**
218 │  * Gets an array of literal expressions representing the attribute's namespaced name.
219 │  */
220 │ function getAttributeNameLiterals(namespace: string | null, name: string): o.LiteralExpr[] {
221 │   const nameLiteral = o.literal(name);
222 │ 
223 │   if (namespace) {
224 ▶     return [o.literal(core.AttributeMarker.NamespaceURI), o.literal(namespace), nameLiteral];
225 │   }
226 │ 
227 ▶   return [nameLiteral];
228 │ }
```

`ElementAttributes.add` は種類ごとの配列に積みます。160〜166 行目、束縛の名前（`Property` など）は同じ名前を 2 回入れません。183・184 行目で名前を積み（224 行目、名前空間付きなら `[0, 名前空間, 名前]` の 3 つ）、185・199 行目、静的な属性とスタイルだけは値も積みます。205・206 行目、`Property` と `TwoWayProperty` は 1 本の配列 `propertyBindings` にまとめて、書かれた順を保ちます。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/const_collection.ts` L233–269 （▶ の行: 242, 249, 254, 257, 260, 263, 266, 268）

```ts
233 │ function serializeAttributes({
234 │   attributes,
235 │   bindings,
236 │   classes,
237 │   i18n,
238 │   projectAs,
239 │   styles,
240 │   template,
241 │ }: ElementAttributes): o.LiteralArrayExpr {
242 ▶   const attrArray = [...attributes];
243 │ 
244 │   if (projectAs !== null) {
245 │     // Parse the attribute value into a CssSelectorList. Note that we only take the
246 │     // first selector, because we don't support multiple selectors in ngProjectAs.
247 │     const parsedR3Selector = core.parseSelectorToR3Selector(projectAs)[0];
248 │     attrArray.push(
249 ▶       o.literal(core.AttributeMarker.ProjectAs),
250 │       literalOrArrayLiteral(parsedR3Selector),
251 │     );
252 │   }
253 │   if (classes.length > 0) {
254 ▶     attrArray.push(o.literal(core.AttributeMarker.Classes), ...classes);
255 │   }
256 │   if (styles.length > 0) {
257 ▶     attrArray.push(o.literal(core.AttributeMarker.Styles), ...styles);
258 │   }
259 │   if (bindings.length > 0) {
260 ▶     attrArray.push(o.literal(core.AttributeMarker.Bindings), ...bindings);
261 │   }
262 │   if (template.length > 0) {
263 ▶     attrArray.push(o.literal(core.AttributeMarker.Template), ...template);
264 │   }
265 │   if (i18n.length > 0) {
266 ▶     attrArray.push(o.literal(core.AttributeMarker.I18n), ...i18n);
267 │   }
268 ▶   return o.literalArr(attrArray);
269 │ }
```

最後に 1 本の配列にします。順番は固定で、242 行目の静的な属性（マーカー無し）→ 249 行目 `ProjectAs` → 254 行目 `Classes` → 257 行目 `Styles` → 260 行目 `Bindings` → 263 行目 `Template` → 266 行目 `I18n`。種類が 1 つも無ければマーカーも出しません。1 節の fixture で `class` を先に書いても `title` が前に来たのは、242 行目が先頭だからです。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/const_collection.ts` L81–94 （▶ の行: 88–90）

```ts
81 │ function getConstIndex(
82 │   job: ComponentCompilationJob,
83 │   allElementAttributes: Map<ir.XrefId, ElementAttributes>,
84 │   xref: ir.XrefId,
85 │ ): ir.ConstIndex | null {
86 │   const attributes = allElementAttributes.get(xref);
87 │   if (attributes !== undefined) {
88 ▶     const attrArray = serializeAttributes(attributes);
89 ▶     if (attrArray.entries.length > 0) {
90 ▶       return job.addConst(attrArray);
91 │     }
92 │   }
93 │   return null;
94 │ }
```

📄 `angular/packages/compiler/src/template/pipeline/src/compilation.ts` L148–163 （▶ の行: 151–154, 157–158, 162）

```ts
148 │   /**
149 │    * Add a constant `o.Expression` to the compilation and return its index in the `consts` array.
150 │    */
151 ▶   addConst(newConst: o.Expression, initializers?: o.Statement[]): ir.ConstIndex {
152 ▶     for (let idx = 0; idx < this.consts.length; idx++) {
153 ▶       if (this.consts[idx].isEquivalent(newConst)) {
154 ▶         return idx as ir.ConstIndex;
155 │       }
156 │     }
157 ▶     const idx = this.consts.length;
158 ▶     this.consts.push(newConst);
159 │     if (initializers) {
160 │       this.constsInitializers.push(...initializers);
161 │     }
162 ▶     return idx as ir.ConstIndex;
163 │   }
```

空でなければ 90 行目の `job.addConst` で番号をもらいます。151〜156 行目、既に consts にある項目と `isEquivalent`（出力 AST の式として中身が同じか）で比べ、同じものがあればその番号を返します。無ければ 157・158 行目で末尾に足して新しい番号。1 節の deduplicate\_attributes で `div` と `span` が同じ `0` を指していたのはこの 152〜154 行目です。こうしてできた `tpl.consts` が、ɵcmp の `consts` になります（ɵcmp に書く行は[第 12 回](12-compiler-slots-vars.md)の 1 節）。

### 実行時：番号から配列を引き、マーカーまで読む

📄 `angular/packages/core/src/render3/util/view_utils.ts` L180–194 （▶ の行: 187, 191, 193）

```ts
180 │ /** Returns a constant from `TConstants` instance. */
181 │ export function getConstant<T>(consts: TConstants | null, index: null | undefined): null;
182 │ export function getConstant<T>(consts: TConstants, index: number): T | null;
183 │ export function getConstant<T>(
184 │   consts: TConstants | null,
185 │   index: number | null | undefined,
186 │ ): T | null;
187 ▶ export function getConstant<T>(
188 │   consts: TConstants | null,
189 │   index: number | null | undefined,
190 │ ): T | null {
191 ▶   if (index === null || index === undefined) return null;
192 │   ngDevMode && assertIndexInRange(consts!, index);
193 ▶   return consts![index] as unknown as T;
194 │ }
```

📄 `angular/packages/core/src/render3/util/attrs_utils.ts` L42–80 （▶ の行: 44, 46, 49–50, 57–60, 63–64, 69, 79）

```ts
42 │ export function setUpAttributes(renderer: Renderer, native: RElement, attrs: TAttributes): number {
43 │   let i = 0;
44 ▶   while (i < attrs.length) {
45 │     const value = attrs[i];
46 ▶     if (typeof value === 'number') {
47 │       // only namespaces are supported. Other value types (such as style/class
48 │       // entries) are not supported in this function.
49 ▶       if (value !== AttributeMarker.NamespaceURI) {
50 ▶         break;
51 │       }
52 │ 
53 │       // we just landed on the marker value ... therefore
54 │       // we should skip to the next entry
55 │       i++;
56 │ 
57 ▶       const namespaceURI = attrs[i++] as string;
58 ▶       const attrName = attrs[i++] as string;
59 ▶       const attrVal = attrs[i++] as string;
60 ▶       renderer.setAttribute(native, attrName, attrVal, namespaceURI);
61 │     } else {
62 │       // attrName is string;
63 ▶       const attrName = value as string;
64 ▶       const attrVal = attrs[++i];
65 │       // Standard attributes
66 │       if (isAnimationProp(attrName)) {
67 │         renderer.setProperty(native, attrName, attrVal);
68 │       } else {
69 ▶         renderer.setAttribute(native, attrName, attrVal as string);
70 │       }
71 │       i++;
72 │     }
73 │   }
74 │ 
75 │   // another piece of code may iterate over the same attributes array. Therefore
76 │   // it may be helpful to return the exact spot where the attributes array exited
77 │   // whether by running into an unsupported marker or if all the static values were
78 │   // iterated over.
79 ▶   return i;
80 │ }
```

実行時は、要素の作成命令が受け取った番号で `getConstant` を呼び、193 行目で `tView.consts[番号]` を取り出します（呼んでいる場所は [first create pass の章](../ivy/08-ivy-first-create-pass.md)の `directiveHostFirstCreatePass`）。DOM に属性を付ける `setUpAttributes` は、46 行目で数（マーカー）に出会うまで 63〜69 行目の「名前, 値」の組を `setAttribute` し、49・50 行目、`NamespaceURI` 以外のマーカーで止まります。79 行目でその位置を返し、クラスやスタイルの部分は別の処理が読みます。consts は TView（ビューの設計図。全インスタンスで共有）が持つので、同じテンプレートの要素を何個作っても配列は 1 つです。

> **🧪 DEMO — このサイトのビルドが作った ɵcmp.consts を、マーカーの名前付きで読む**
>
> この章のファイル（compiler-consts-pure.ts）には、画面に出さない `CpSample` を置いてあります。テンプレートは `<div class="card big" style="color: red; padding: 4px" title="static" [id]="idValue()" (click)="noop()">`、`<li class="item">` を 2 つ、`<p [title]="[first(), 'x', second()].join('/')">` です。ボタンで `ɵcmp.consts`（公開 API ではないので学習用に覗くだけ）を読み、項目の直下にある数を AttributeMarker の名前に置き換えて表示します。この章のコンポーネント自身の consts も読めます。値はビルドの最適化の影響を受けないので、本番ビルドでも同じです。
>
> CpSample の 0 番は `["title", "static", Classes, "card", "big", Styles, "color", "red", "padding", "4px", Bindings, "click", "id"]` になるはずです。`click` が `id` より前なのは、リスナーが作成側の op で、`unit.ops()` が作成側を先に返すからです（3 節）。2 つの `li` は 1 番を共有し、`p` は 2 番 `[Bindings, "title"]`。vars 5 は、`[id]` 1・`[title]` 1・3 要素の配列リテラルの pure function（引数 2 個）1 + 2 = 3 です（[第 12 回](12-compiler-slots-vars.md)）。この章のコンポーネントの consts には、`<app-code>` の `[file]` などの束縛名や、`class="demo"` などが並びます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-consts-pure)

## 5. pure function：\[x\]="\[a, b\]" を毎回作らない

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/value_composition/array_literals.ts` L15–24 （▶ の行: 18）

```ts
15 │ @Component({
16 │     selector: 'my-app',
17 │     template: `
18 ▶   <my-comp [names]="['Nancy', customName]"></my-comp>
19 │ `,
20 │     standalone: false
21 │ })
22 │ export class MyApp {
23 │   customName = 'Bess';
24 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/value_composition/array_literals.js` L1–23 （▶ の行: 1, 10, 17）

```js
 1 ▶ const $e0_ff$ = $v$ => ["Nancy", $v$];
 2 │ // ...
 3 │ export class MyApp {
 4 │   // ...
 5 │   static ɵcmp = /*@__PURE__*/ $r3$.ɵɵdefineComponent({
 6 │     type: MyApp,
 7 │     selectors: [["my-app"]],
 8 │     standalone: false,
 9 │     decls: 1,
10 ▶     vars: 3,
11 │     consts: [[__AttributeMarker.Bindings__, "names"]],
12 │     template:  function MyApp_Template(rf, ctx) {
13 │       if (rf & 1) {
14 │         $r3$.ɵɵelement(0, "my-comp", 0);
15 │       }
16 │       if (rf & 2) {
17 ▶         $r3$.ɵɵproperty("names", $r3$.ɵɵpureFunction1(1, $e0_ff$, ctx.customName));
18 │       }
19 │     },
20 │    dependencies: [MyComp],
21 │    encapsulation: 2
22 │   });
23 │ }
```

18 行目の `['Nancy', customName]` は、17 行目で `ɵɵpureFunction1(1, $e0_ff$, ctx.customName)` になり、1 行目に `$v$ => ["Nancy", $v$]` という関数が**コンポーネントの外**に出ています。テンプレートの式は変更検知のたびに評価されます。もし `['Nancy', customName]` をそのまま出すと、毎回**新しい配列**ができ、前回値との比較（`Object.is`。[更新命令の章](../ivy/10-ivy-update-instructions.md)）で毎回「変わった」と判定されて、子の input に毎回新しい値が入ります。pure function は「引数が前回と同じなら前回の配列を返す」ことで、それを防ぎます。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/pure_literal_structures.ts` L13–35 （▶ の行: 13, 15–16, 19, 23–26）

```ts
13 ▶ export function generatePureLiteralStructures(job: CompilationJob): void {
14 │   for (const unit of job.units) {
15 ▶     for (const op of unit.update) {
16 ▶       ir.transformExpressionsInOp(
17 │         op,
18 │         (expr, flags) => {
19 ▶           if (flags & ir.VisitorContextFlag.InChildOperation) {
20 │             return expr;
21 │           }
22 │ 
23 ▶           if (expr instanceof o.LiteralArrayExpr) {
24 ▶             return transformLiteralArray(expr);
25 ▶           } else if (expr instanceof o.LiteralMapExpr) {
26 ▶             return transformLiteralMap(expr);
27 │           }
28 │ 
29 │           return expr;
30 │         },
31 │         ir.VisitorContextFlag.None,
32 │       );
33 │     }
34 │   }
35 │ }
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/pure_literal_structures.ts` L37–61 （▶ の行: 52–53, 55–57, 60）

```ts
37 │ function transformLiteralArray(expr: o.LiteralArrayExpr): o.Expression {
38 │   const derivedEntries: o.Expression[] = [];
39 │   const nonConstantArgs: o.Expression[] = [];
40 │   for (const entry of expr.entries) {
41 │     if (entry instanceof o.SpreadElementExpr) {
42 │       if (entry.expression.isConstant()) {
43 │         derivedEntries.push(entry);
44 │       } else {
45 │         const idx = nonConstantArgs.length;
46 │         nonConstantArgs.push(entry.expression);
47 │         derivedEntries.push(new o.SpreadElementExpr(new ir.PureFunctionParameterExpr(idx)));
48 │       }
49 │       continue;
50 │     }
51 │ 
52 ▶     if (entry.isConstant()) {
53 ▶       derivedEntries.push(entry);
54 │     } else {
55 ▶       const idx = nonConstantArgs.length;
56 ▶       nonConstantArgs.push(entry);
57 ▶       derivedEntries.push(new ir.PureFunctionParameterExpr(idx));
58 │     }
59 │   }
60 ▶   return new ir.PureFunctionExpr(o.literalArr(derivedEntries), nonConstantArgs);
61 │ }
```

1. **15・16 行目：更新側の op の式を全部見る**

   phases 配列の 26 番目 `generatePureLiteralStructures` です。[第 11 回](11-compiler-ir.md)の「型 2」の形をしています。19 行目、リスナーの中など子の op の式は対象外です。
2. **23〜26 行目：配列リテラルとオブジェクトリテラルを変換**

   式の木は子から先に変換される（第 11 回 7 節）ので、入れ子の `[[a], b]` なら内側が先に pure function になります。
3. **52・53 行目：定数の要素はそのまま本体に残す**

   `'Nancy'` は定数なので配列の本体にそのまま。
4. **55〜57 行目：定数でない要素は引数にし、本体には「何番目の引数」の印**

   `customName` は 56 行目で引数リストへ、本体の同じ位置には 57 行目の `PureFunctionParameterExpr(0)`。
5. **60 行目：本体と引数をまとめた PureFunctionExpr にする**

   本体 `["Nancy", 引数0]`、引数 `[customName]`。要素が全部定数なら引数 0 個で、`ɵɵpureFunction0` になります。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/pure_function_extraction.ts` L15–43 （▶ の行: 15, 18–19, 23–25, 36–38）

```ts
15 ▶ export function extractPureFunctions(job: CompilationJob): void {
16 │   for (const view of job.units) {
17 │     for (const op of view.ops()) {
18 ▶       ir.visitExpressionsInOp(op, (expr) => {
19 ▶         if (!(expr instanceof ir.PureFunctionExpr) || expr.body === null) {
20 │           return;
21 │         }
22 │ 
23 ▶         const constantDef = new PureFunctionConstant(expr.args.length);
24 ▶         expr.fn = job.pool.getSharedConstant(constantDef, expr.body);
25 ▶         expr.body = null;
26 │       });
27 │     }
28 │   }
29 │ }
30 │ 
31 │ class PureFunctionConstant extends GenericKeyFn implements SharedConstantDefinition {
32 │   constructor(private numArgs: number) {
33 │     super();
34 │   }
35 │ 
36 ▶   override keyOf(expr: o.Expression): string {
37 ▶     if (expr instanceof ir.PureFunctionParameterExpr) {
38 ▶       return `param(${expr.index})`;
39 │     } else {
40 │       return super.keyOf(expr);
41 │     }
42 │   }
43 │ 
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/pure_function_extraction.ts` L44–72 （▶ の行: 45, 47–48, 53, 56, 60, 65, 67）

```ts
44 │   // TODO: Use the new pool method `getSharedFunctionReference`
45 ▶   toSharedConstantDeclaration(declName: string, keyExpr: o.Expression): o.Statement {
46 │     const fnParams: o.FnParam[] = [];
47 ▶     for (let idx = 0; idx < this.numArgs; idx++) {
48 ▶       fnParams.push(new o.FnParam('a' + idx, o.DYNAMIC_TYPE));
49 │     }
50 │ 
51 │     // We will never visit `ir.PureFunctionParameterExpr`s that don't belong to us, because this
52 │     // transform runs inside another visitor which will visit nested pure functions before this one.
53 ▶     const returnExpr = ir.transformExpressionsInExpression(
54 │       keyExpr,
55 │       (expr) => {
56 ▶         if (!(expr instanceof ir.PureFunctionParameterExpr)) {
57 │           return expr;
58 │         }
59 │ 
60 ▶         return o.variable('a' + expr.index);
61 │       },
62 │       ir.VisitorContextFlag.None,
63 │     );
64 │ 
65 ▶     return new o.DeclareVarStmt(
66 │       declName,
67 ▶       new o.ArrowFunctionExpr(fnParams, returnExpr),
68 │       undefined,
69 │       o.StmtModifier.Final,
70 │     );
71 │   }
72 │ }
```

本体を関数として外へ出すのは、phases 配列の 72 番目（reify の直前）`extractPureFunctions` です。24 行目の `job.pool.getSharedConstant` に本体を渡し、返ってきた変数の参照を `expr.fn` に入れて、25 行目で本体を捨てます。宣言の形は 45〜71 行目、引数の数だけ `a0, a1, …` の仮引数を作り（48 行目）、本体の `PureFunctionParameterExpr(i)` を `a` + i に置き換え（60 行目）、`const 名前 = (a0) => ["Nancy", a0]` の宣言にします（65〜67 行目）。36〜38 行目、同じかどうかの鍵では引数の印を `param(0)` と書きます。

📄 `angular/packages/compiler/src/constant_pool.ts` L155–163 （▶ の行: 155–160, 162）

```ts
155 ▶   getSharedConstant(def: SharedConstantDefinition, expr: o.Expression): o.Expression {
156 ▶     const key = def.keyOf(expr);
157 ▶     if (!this.sharedConstants.has(key)) {
158 ▶       const id = this.freshName();
159 ▶       this.sharedConstants.set(key, o.variable(id));
160 ▶       this.statements.push(def.toSharedConstantDeclaration(id, expr));
161 │     }
162 ▶     return this.sharedConstants.get(key)!;
163 │   }
```

📄 `angular/packages/compiler/src/constant_pool.ts` L231–247 （▶ の行: 234–236, 241, 246）

```ts
231 │ export class GenericKeyFn implements ExpressionKeyFn {
232 │   static readonly INSTANCE = new GenericKeyFn();
233 │ 
234 ▶   keyOf(expr: o.Expression): string {
235 ▶     if (expr instanceof o.LiteralExpr && typeof expr.value === 'string') {
236 ▶       return `"${expr.value}"`;
237 │     } else if (expr instanceof o.LiteralExpr) {
238 │       return String(expr.value);
239 │     } else if (expr instanceof o.RegularExpressionLiteralExpr) {
240 │       return `/${expr.body}/${expr.flags ?? ''}`;
241 ▶     } else if (expr instanceof o.LiteralArrayExpr) {
242 │       const entries: string[] = [];
243 │       for (const entry of expr.entries) {
244 │         entries.push(this.keyOf(entry));
245 │       }
246 ▶       return `[${entries.join(',')}]`;
247 │     } else if (expr instanceof o.LiteralMapExpr) {
```

📄 `angular/packages/compiler/src/constant_pool.ts` L205–221 （▶ の行: 210–212, 218–219）

```ts
205 │    *
206 │    * The name might be unique among different prefixes if any of the prefixes end in
207 │    * a digit so the prefix should be a constant string (not based on user input) and
208 │    * must not end in a digit.
209 │    */
210 ▶   uniqueName(name: string, alwaysIncludeSuffix = true): string {
211 ▶     const count = this._claimedNames.get(name) ?? 0;
212 ▶     const result = count === 0 && !alwaysIncludeSuffix ? `${name}` : `${name}${count}`;
213 │ 
214 │     this._claimedNames.set(name, count + 1);
215 │     return result;
216 │   }
217 │ 
218 ▶   private freshName(): string {
219 ▶     return this.uniqueName(CONSTANT_PREFIX);
220 │   }
221 │ }
```

`ConstantPool` は 1 つのソースファイル全体で共有される定数の置き場です（ngtsc は `transformIvySourceFile` の冒頭でソースファイルごとに 1 つ作ります。[第 16 回](16-compiler-reify-emit.md)）。156 行目で式を文字列の鍵にし（`["Nancy",param(0)]` のように。241〜246 行目）、157 行目、同じ鍵がまだ無いときだけ 158 行目で新しい名前を取り、160 行目で宣言文を積みます。同じ形の配列リテラルを何か所に書いても、関数は 1 つだけ作られて使い回されます。名前は 219 行目の `uniqueName(CONSTANT_PREFIX)` で、接頭辞 `_c` に 211・212 行目で通し番号を付けた `_c0`、`_c1`、… です （fixture の `$e0_ff$` はその名前に一致するプレースホルダ）。

📄 `angular/packages/compiler/src/template/pipeline/src/instruction.ts` L1095–1109 （▶ の行: 1096–1097, 1105, 1107–1108）

```ts
1095 │ const PURE_FUNCTION_CONFIG: VariadicInstructionConfig = {
1096 ▶   constant: [
1097 ▶     Identifiers.pureFunction0,
1098 │     Identifiers.pureFunction1,
1099 │     Identifiers.pureFunction2,
1100 │     Identifiers.pureFunction3,
1101 │     Identifiers.pureFunction4,
1102 │     Identifiers.pureFunction5,
1103 │     Identifiers.pureFunction6,
1104 │     Identifiers.pureFunction7,
1105 ▶     Identifiers.pureFunction8,
1106 │   ],
1107 ▶   variable: Identifiers.pureFunctionV,
1108 ▶   mapping: (n) => n,
1109 │ };
```

reify は `PureFunctionExpr` を、命令の組み立て関数 `pureFunction(varOffset, fn, args)`（instruction.ts）で `ɵɵpureFunctionN(varOffset, fn, ...args)` にします（reify の全体は[第 16 回](16-compiler-reify-emit.md)）。1 つ目の引数 `varOffset` は第 12 回で数えた変数 slot の位置です。N は引数の数で、上の 1097〜1105 行目の `pureFunction0`〜`pureFunction8` から選び、表に無い 9 個以上なら 1107 行目の `ɵɵpureFunctionV` に引数を配列で渡します （選ぶ処理 `callVariadicInstructionExpr` は第 16 回で引用）。1108 行目の `mapping` は「引数の数がそのまま表の番号」という対応です。

📄 `angular/packages/core/src/render3/pure_function.ts` L22–56 （▶ の行: 25, 27, 30, 50–51, 53–55）

```ts
22 │ /**
23 │  * Bindings for pure functions are stored after regular bindings.
24 │  *
25 ▶  * |-------decls------|---------vars---------|                 |----- hostVars (dir1) ------|
26 │  * ------------------------------------------------------------------------------------------
27 ▶  * | nodes/refs/pipes | bindings | fn slots  | injector | dir1 | host bindings | host slots |
28 │  * ------------------------------------------------------------------------------------------
29 │  *                    ^                      ^
30 ▶  *      TView.bindingStartIndex      TView.expandoStartIndex
31 │  *
32 │  * Pure function instructions are given an offset from the binding root. Adding the offset to the
33 │  * binding root gives the first index where the bindings are stored. In component views, the binding
34 │  * root is the bindingStartIndex. In host bindings, the binding root is the expandoStartIndex +
35 │  * any directive instances + any hostVars in directives evaluated before it.
36 │  *
37 │  * See VIEW_DATA.md for more information about host binding resolution.
38 │  */
39 │ 
40 │ /**
41 │  * If the value hasn't been saved, calls the pure function to store and return the
42 │  * value. If it has been saved, returns the saved value.
43 │  *
44 │  * @param slotOffset the offset from binding root to the reserved slot
45 │  * @param pureFn Function that returns a value
46 │  * @returns value
47 │  *
48 │  * @codeGenApi
49 │  */
50 ▶ export function ɵɵpureFunction0<T>(slotOffset: number, pureFn: () => T): T {
51 ▶   const bindingIndex = getBindingRoot() + slotOffset;
52 │   const lView = getLView();
53 ▶   return lView[bindingIndex] === NO_CHANGE
54 ▶     ? updateBinding(lView, bindingIndex, pureFn())
55 ▶     : getBinding(lView, bindingIndex);
56 │ }
```

📄 `angular/packages/core/src/render3/pure_function.ts` L339–351 （▶ の行: 347–350）

```ts
339 │ export function pureFunction1Internal(
340 │   lView: LView,
341 │   bindingRoot: number,
342 │   slotOffset: number,
343 │   pureFn: (v: any) => any,
344 │   exp: any,
345 │   thisArg?: any,
346 │ ): any {
347 ▶   const bindingIndex = bindingRoot + slotOffset;
348 ▶   return bindingUpdated(lView, bindingIndex, exp)
349 ▶     ? updateBinding(lView, bindingIndex + 1, thisArg ? pureFn.call(thisArg, exp) : pureFn(exp))
350 ▶     : getPureFunctionReturnValue(lView, bindingIndex + 1);
351 │ }
```

実行時側です。25〜30 行目の図のとおり、pure function のマスは LView の vars の領域（「fn slots」）にあり、位置は binding の開始位置 + `slotOffset` です。引数 1 個の版は 348 行目で引数を前回値と比べ（1 マス目）、変わっていれば 349 行目で関数を呼んで結果を次のマス（`bindingIndex + 1`）に保存し、変わっていなければ 350 行目で保存しておいた結果を返します。引数 0 個の版は 53〜55 行目、マスがまだ空（`NO_CHANGE`）のときだけ 1 回作ります。これが第 12 回の「pure function は 1 + 引数の数マス」の中身です。

## 6. 連鎖：ɵɵproperty(…)(…)

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_bindings/attribute_bindings/chain_multiple_bindings_mixed.ts` L3–11 （▶ の行: 5）

```ts
 3 │ @Component({
 4 │     template: `
 5 ▶     <button [attr.title]="1" [id]="2" [attr.tabindex]="3" attr.aria-label="prefix-{{1 + 3}}">
 6 │     </button>
 7 │   `,
 8 │     standalone: false
 9 │ })
10 │ export class MyComponent {
11 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_bindings/attribute_bindings/chain_multiple_bindings_mixed.js` L1–8 （▶ の行: 4–6）

```js
1 │ template: function MyComponent_Template(rf, ctx) {
2 │   …
3 │   if (rf & 2) {
4 ▶     $r3$.ɵɵattribute("aria-label", $r3$.ɵɵinterpolate1("prefix-", 1 + 3));
5 ▶     $r3$.ɵɵproperty("id", 2);
6 ▶     $r3$.ɵɵattribute("title", 1)("tabindex", 3);
7 │   }
8 │ }
```

6 行目、`[attr.title]` と `[attr.tabindex]` の 2 つの `ɵɵattribute` が `ɵɵattribute("title", 1)("tabindex", 3)` の 1 文になっています。4・5 行目のように命令が変わるところでは連鎖は切れます。

📄 `angular/packages/core/src/render3/instructions/property.ts` L20–37 （▶ の行: 33–34）

```ts
20 │ /**
21 │  * Update a property on a selected element.
22 │  *
23 │  * Operates on the element selected by index via the {@link select} instruction.
24 │  *
25 │  * If the property name also exists as an input property on one of the element's directives,
26 │  * the component property will be set instead of the element property. This check must
27 │  * be conducted at runtime so child components that add new `@Inputs` don't have to be re-compiled
28 │  *
29 │  * @param propName Name of property. Because it is going to DOM, this is not subject to
30 │  *        renaming as part of minification.
31 │  * @param value New value to write.
32 │  * @param sanitizer An optional function used to sanitize the value.
33 ▶  * @returns This function returns itself so that it may be chained
34 ▶  * (e.g. `property('name', ctx.name)('title', ctx.title)`)
35 │  *
36 │  * @codeGenApi
37 │  */
```

連鎖できるのは、実行時の命令が**自分自身を返す**からです。33・34 行目のとおり `ɵɵproperty` は戻り値が `typeof ɵɵproperty` で、`property('name', ctx.name)('title', ctx.title)` のように続けて呼べます（関数の本体は[更新命令の章](../ivy/10-ivy-update-instructions.md)）。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/chaining.ts` L14–50 （▶ の行: 14, 16, 18, 23, 26, 28, 36–37）

```ts
14 ▶ const CHAIN_COMPATIBILITY = new Map<o.ExternalReference, o.ExternalReference>([
15 │   [R3.ariaProperty, R3.ariaProperty],
16 ▶   [R3.attribute, R3.attribute],
17 │   [R3.classProp, R3.classProp],
18 ▶   [R3.element, R3.element],
19 │   [R3.elementContainer, R3.elementContainer],
20 │   [R3.elementContainerEnd, R3.elementContainerEnd],
21 │   [R3.elementContainerStart, R3.elementContainerStart],
22 │   [R3.elementEnd, R3.elementEnd],
23 ▶   [R3.elementStart, R3.elementStart],
24 │   [R3.domProperty, R3.domProperty],
25 │   [R3.i18nExp, R3.i18nExp],
26 ▶   [R3.listener, R3.listener],
27 │   [R3.listener, R3.listener],
28 ▶   [R3.property, R3.property],
29 │   [R3.styleProp, R3.styleProp],
30 │   [R3.syntheticHostListener, R3.syntheticHostListener],
31 │   [R3.syntheticHostProperty, R3.syntheticHostProperty],
32 │   [R3.templateCreate, R3.templateCreate],
33 │   [R3.twoWayProperty, R3.twoWayProperty],
34 │   [R3.twoWayListener, R3.twoWayListener],
35 │   [R3.declareLet, R3.declareLet],
36 ▶   [R3.conditionalCreate, R3.conditionalBranchCreate],
37 ▶   [R3.conditionalBranchCreate, R3.conditionalBranchCreate],
38 │   [R3.domElement, R3.domElement],
39 │   [R3.domElementStart, R3.domElementStart],
40 │   [R3.domElementEnd, R3.domElementEnd],
41 │   [R3.domElementContainer, R3.domElementContainer],
42 │   [R3.domElementContainerStart, R3.domElementContainerStart],
43 │   [R3.domElementContainerEnd, R3.domElementContainerEnd],
44 │   [R3.domListener, R3.domListener],
45 │   [R3.domTemplate, R3.domTemplate],
46 │   [R3.animationEnter, R3.animationEnter],
47 │   [R3.animationLeave, R3.animationLeave],
48 │   [R3.animationEnterListener, R3.animationEnterListener],
49 │   [R3.animationLeaveListener, R3.animationLeaveListener],
50 │ ]);
```

どの命令を連鎖させてよいかは 14〜50 行目の `CHAIN_COMPATIBILITY` の表で決まっています。キーが「今の連鎖の命令」、値が「その後ろにつなげてよい命令」です。ほとんどは自分自身（28 行目の `property` → `property` など）ですが、36 行目の `conditionalCreate` の後ろには `conditionalBranchCreate` をつなげられます。表に無い命令（`ɵɵadvance`・`ɵɵtext`・`ɵɵtextInterpolate` など）は連鎖しません。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/chaining.ts` L52–81 （▶ の行: 53–54, 57, 63, 66–67, 73, 76, 78–79）

````ts
52 │ /**
53 ▶  * Chaining results in repeated call expressions, causing a deep AST of receiver expressions. To prevent running out of
54 ▶  * stack depth the maximum number of chained instructions is limited to this threshold, which has been selected
55 │  * arbitrarily.
56 │  */
57 ▶ const MAX_CHAIN_LENGTH = 256;
58 │ 
59 │ /**
60 │  * Post-process a reified view compilation and convert sequential calls to chainable instructions
61 │  * into chain calls.
62 │  *
63 ▶  * For example, two `elementStart` operations in sequence:
64 │  *
65 │  * ```ts
66 ▶  * elementStart(0, 'div');
67 ▶  * elementStart(1, 'span');
68 │  * ```
69 │  *
70 │  * Can be called as a chain instead:
71 │  *
72 │  * ```ts
73 ▶  * elementStart(0, 'div')(1, 'span');
74 │  * ```
75 │  */
76 ▶ export function chain(job: CompilationJob): void {
77 │   for (const unit of job.units) {
78 ▶     chainOperationsInList(unit.create);
79 ▶     chainOperationsInList(unit.update);
80 │   }
81 │ }
````

57 行目、1 本の連鎖は 256 個までです。53〜55 行目のコメントのとおり、連鎖は呼び出しの式が入れ子になった深い AST になるので、スタックがあふれないための上限です。63〜74 行目のコメントが、このフェーズがすることの全部です。76〜80 行目、作成側と更新側のリストをそれぞれ処理します。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/chaining.ts` L83–105 （▶ の行: 85–86, 88, 91–93, 100–101, 103）

```ts
 83 │ function chainOperationsInList(opList: ir.OpList<ir.CreateOp | ir.UpdateOp>): void {
 84 │   let chain: Chain | null = null;
 85 ▶   for (const op of opList) {
 86 ▶     if (op.kind !== ir.OpKind.Statement || !(op.statement instanceof o.ExpressionStatement)) {
 87 │       // This type of statement isn't chainable.
 88 ▶       chain = null;
 89 │       continue;
 90 │     }
 91 ▶     if (
 92 ▶       !(op.statement.expr instanceof o.InvokeFunctionExpr) ||
 93 ▶       !(op.statement.expr.fn instanceof o.ExternalExpr)
 94 │     ) {
 95 │       // This is a statement, but not an instruction-type call, so not chainable.
 96 │       chain = null;
 97 │       continue;
 98 │     }
 99 │ 
100 ▶     const instruction = op.statement.expr.fn.value;
101 ▶     if (!CHAIN_COMPATIBILITY.has(instruction)) {
102 │       // This instruction isn't chainable.
103 ▶       chain = null;
104 │       continue;
105 │     }
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/chaining.ts` L107–134 （▶ の行: 109–112, 115, 120–121, 123, 126）

```ts
107 │     // This instruction can be chained. It can either be added on to the previous chain (if
108 │     // compatible) or it can be the start of a new chain.
109 ▶     if (
110 ▶       chain !== null &&
111 ▶       CHAIN_COMPATIBILITY.get(chain.instruction) === instruction &&
112 ▶       chain.length < MAX_CHAIN_LENGTH
113 │     ) {
114 │       // This instruction can be added onto the previous chain.
115 ▶       const expression = chain.expression.callFn(
116 │         op.statement.expr.args,
117 │         op.statement.expr.sourceSpan,
118 │         op.statement.expr.pure,
119 │       );
120 ▶       chain.expression = expression;
121 ▶       chain.op.statement = expression.toStmt();
122 │       chain.length++;
123 ▶       ir.OpList.remove(op as ir.Op<ir.CreateOp | ir.UpdateOp>);
124 │     } else {
125 │       // Leave this instruction alone for now, but consider it the start of a new chain.
126 ▶       chain = {
127 │         op,
128 │         instruction,
129 │         expression: op.statement.expr,
130 │         length: 1,
131 │       };
132 │     }
133 │   }
134 │ }
```

1. **85〜105 行目：命令呼び出しの文でなければ連鎖を切る**

   phases 配列の最後（74 番目）なので、op はもう全部 `Statement` です。86 行目、式の文でない（`const x = …` の変数宣言など）、91〜93 行目、外部の関数（`ɵɵ…`）の呼び出しでない、101 行目、表に無い命令、のどれかなら `chain = null`。
2. **109〜112 行目：前の連鎖につなげられるか**

   前の連鎖があり、表でつなげてよい命令で、256 個未満なら、つなげます。
3. **115〜123 行目：前の文の式に「呼び出し」を足し、今の文を消す**

   115 行目、前の連鎖の式（`ɵɵattribute("title", 1)`）をさらに関数として、今の文の引数で呼ぶ式 `…("tabindex", 3)` を作り、121 行目で前の文をそれに差し替え、123 行目で今の文を `OpList.remove` で消します。
4. **126〜131 行目：つなげられなければ、ここから新しい連鎖**

   今の文を連鎖の先頭として覚えます。

> [!NOTE]
> **ポイント**
>
> chaining.ts には「なぜ連鎖させるのか」の理由は書かれていません（コメントにあるのは 59〜75 行目の「何をするか」と、52〜56 行目の上限の理由だけです）。v22.2.0-next.7 のコンパイラと実行時のソースを検索しても、連鎖とバンドルサイズを結び付けたコメントは見つかりませんでした。出力から言えるのは、2 つ目以降の命令について `i0.ɵɵattribute` という参照と文の区切りが消え、生成されるコードがその分短くなる、ということです。本番ビルドでは `ɵɵattribute` は短い名前に変わりますが、呼び出しごとの参照が 1 つ減ることに変わりはありません。

## ここまでの流れ

- 👤 `<div class="my-app" title="Hello" [names]="['Nancy', customName]">` — あなたのテンプレート
  - `extractAttributes`（13） — attribute\_extraction.ts L42 / L189 / L191 — *要素の前に ExtractedAttributeOp。静的属性の更新 op は消す*
  - `parseExtractedStyles`（15） — parse\_extracted\_styles.ts L151 / L169 — *style / class を分解*
  - `generatePureLiteralStructures`（26） — pure\_literal\_structures.ts L60 — *\[…\] → PureFunctionExpr(本体, 引数)*
  - `collectElementConsts`（61） — const\_collection.ts L52 / L90 — *マーカーで区切った配列、addConst で重複をまとめる*
  - `extractPureFunctions`（72） — pure\_function\_extraction.ts L24 — *ConstantPool に const \_c0 = (a0) =&gt; \[…\]*
  - `reify`（73） — reify.ts / instruction.ts L1095 — *ɵɵpureFunction1(offset, \_c0, …)*
  - `chain`（74） — chaining.ts L115 / L123 — *ɵɵattribute(…)(…)*
- 👤 `consts: [[…]]` / `ɵɵelementStart(0, "div", 0)` — 実行時：getConstant → setUpAttributes

## 聞かれそうな質問

**Q. consts を共有すると何が得ですか？**

2 つあります。1 つは、同じ属性の組を持つ要素がいくつあっても配列が 1 つで済むことです（compilation.ts 152〜154 行目の重複判定。deduplicate\_attributes.js 1・4 行目）。もう 1 つは、consts がコンポーネント定義（ɵcmp）に 1 回だけ書かれ、実行時は TView に置かれて全インスタンスで共有されることです。命令には番号だけが入るので（`ɵɵelementStart(0, "div", 0)`）、属性の配列をテンプレート関数の中で毎回作ることもありません。

**Q. \[x\]="\[a, b\]" を毎回作らないのはなぜですか？**

毎回作ると、中身が同じでも別の配列になり、前回値との比較で毎回「変わった」と判定されるからです。pure function にすると、引数 `a`・`b` を前回値と比べ（pure\_function.ts 348 行目）、変わっていなければ保存しておいた**同じ配列**を返します（350 行目）。すると `[x]` の束縛も「変わっていない」と判定され、子の input への書き込みも起きません。変換するのは pure\_literal\_structures.ts 23〜26 行目、関数を外へ出すのは pure\_function\_extraction.ts 24 行目です。

**Q. ɵɵproperty(...)(...) の連鎖は何のためですか？**

仕組みは、実行時の命令が自分自身を返し（property.ts 33・34 行目）、コンパイラの最後のフェーズが続く同じ命令の文を 1 つの呼び出し式にまとめる（chaining.ts 115〜123 行目）ことです。目的について chaining.ts のコメントには書かれていません。出力から確かめられる効果は、2 つ目以降の命令名の参照と文の区切りが消えてコードが短くなることです。「バンドルサイズのため」と説明するなら、それは出力の比較から言えることで、ソースのコメントが述べている理由ではない、と区別して話すのが正確です。

**Q. consts の Bindings に値が無いのはなぜですか？**

束縛の値は実行時に変わるので、定数配列には入れられないからです。attribute\_extraction.ts 49 行目で式を `null` にして名前だけを抜き出し、値は更新側に残した `ɵɵproperty` などが毎回入れます。名前だけでも入れておくのは、実行時のセレクタ照合が `Bindings` マーカーの後ろの名前も探すからです （node\_selector\_matcher.ts 250〜256 行目）。これで `[foo]="x"` と書いた要素が `[foo]` セレクタのディレクティブに一致します。

**Q. 静的な属性はなぜ更新ブロックに出てこないのですか？**

ingest の時点では `title="Hello"` も更新側の `AttributeOp` ですが、attribute\_extraction.ts 172・189・191 行目で、テキストの属性なら consts へ抜き出して更新側の op を消すからです。実行時は作成のときに `setUpAttributes`（attrs\_utils.ts 63〜69 行目）が 1 回だけ DOM に付けます。補間を含む属性は 166・167 行目で抜き出されず、更新命令のまま残ります。

## 読み終えて

- 静的な属性・クラス・スタイルと束縛の名前は、要素ごとに `ExtractedAttributeOp` として集められ、AttributeMarker で区切った 1 本の配列になる（const\_collection.ts 242〜268 行目の順）
- 配列は `addConst` で重複をまとめた consts に入り、命令には番号だけが入る。実行時は TView の consts から引く
- 配列・オブジェクトリテラルは、定数部分を本体、可変部分を引数にした pure function になり、ConstantPool に `_c0` として 1 回だけ宣言される
- `ɵɵpureFunctionN` は引数が前回と同じなら前回の値を返す。だから束縛は「変わっていない」と判定される
- 連鎖は最後のフェーズ。命令が自分を返すことを使い、表に載った命令の連続を 1 つの式にまとめる（理由はソースに書かれていない）

---

← 前: [ctx・nextContext・restoreView：テンプレート変数とコンテキストの解決](13-compiler-variables.md)  
次: [@if・@for・@defer の命令ができるまで：conditional・repeater・defer のフェーズ](15-compiler-control-flow-phases.md) →
