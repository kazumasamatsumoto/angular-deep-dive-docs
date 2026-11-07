[目次](../README.md) › [i18n と $localize の内側](README.md) › 第 7 回 / 全 20 回

# ICU をコンパイルする：plural と select

> {count, plural, =0 {...} other {...}} がメッセージの中で別のメッセージ（サブメッセージ）になり、VAR\_PLURAL と ICU のプレースホルダーでつながる仕組み（i18n\_parser の ICU の扱い・icu\_serializer.ts・wrap\_icus.ts）。ɵɵi18nPostprocess に渡す表と、i18nNormalizeLineEndingsInICUs。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/loc-icu-compile)

---

`<p i18n>Hello, {count, plural, =0 {none} other {many}}</p>` をコンパイルすると、`$localize` が 2 つ出ます。ICU（plural や select の式）だけを別のメッセージ（サブメッセージ）にして、親のメッセージには `:ICU:` というプレースホルダーだけを残すからです。この章では、ICU がどこでサブメッセージになり、`VAR_PLURAL` の名前がどこで付き、親とどうつながり、`ɵɵi18nPostprocess` に渡す表がどこで作られるかを、パーサーからパイプラインの段まで順に追います。途中で、開いている issue #53089（XLIFF の `xid` が存在しない ID を指す）の原因になっている行も見ます。

読む対象は `packages/compiler/src/i18n/i18n_parser.ts` の `visitExpansion`、`packages/compiler/src/render3/view/i18n/` の `icu_serializer.ts`・`localize_utils.ts`、`packages/compiler/src/output/output_ast.ts` の `serializeI18nTemplatePart`、パイプラインの `ingest.ts` の `ingestIcu` と `phases/` の `wrap_icus.ts`・`create_i18n_contexts.ts`・`extract_i18n_messages.ts`・`i18n_const_collection.ts`、`packages/compiler/src/ml_parser/lexer.ts` の ICU の字句解析です。

1. [1. 全体像](01-loc-overview.md)
2. [2. 印とメッセージ](02-loc-markup.md)
3. [3. プレースホルダー](03-loc-placeholders.md)
4. [4. メッセージ ID](04-loc-message-id.md)
5. [5. コンパイラの段](05-loc-pipeline-phases.md)
6. [6. $localize の出力](06-loc-const-collection.md)
7. **7. ICU のコンパイル**（この章）
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
> ICU は「値によって文を選ぶ」書き方です。`{count, plural, =0 {…} other {…}}` の `count` を**切り替えの式**、`plural` を**種類**、`=0` や `other` を**case** と呼びます。テンプレートの中の `{…}` を ICU として読む字句解析・構文解析は[字句解析の章](../compiler/03-compiler-html-lexer.md)と[構文解析の章](../compiler/04-compiler-html-parser.md)（AST では `Expansion` と `ExpansionCase`）です。

## 1. 先にゴールを見る：入れ子の select

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_i18n/icu_logic/nested_icus.ts` L3–13 （▶ の行: 6–11）

```ts
 3 │ @Component({
 4 │     selector: 'my-component',
 5 │     template: `
 6 ▶   <div i18n>
 7 ▶     {gender, select,
 8 ▶       male {male of age: {age, select, 10 {ten} 20 {twenty} 30 {thirty} other {other}}}
 9 ▶       female {female}
10 ▶       other {other}
11 ▶     }
12 │   </div>
13 │ `,
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_i18n/icu_logic/nested_icus.js` L1–21 （▶ の行: 4–5, 13, 18）

```js
 1 │ decls: 2,
 2 │ vars: 2,
 3 │ consts: () => {
 4 ▶   __i18nIcuMsg__('{VAR_SELECT_1, select, male {male of age: {VAR_SELECT, select, 10 {ten} 20 {twenty} 30 {thirty} other {other}}} female {female} other {other}}', [['VAR_SELECT', String.raw`\uFFFD0\uFFFD`], ['VAR_SELECT_1', String.raw`\uFFFD1\uFFFD`]], {})
 5 ▶   __i18nMsg__(' {$icu} ', [['icu', '$i18n_0$', '2960440207608193372']], {original_code: {'icu': '{gender, select,\\n      male {male of age: {age, select, 10 {ten} 20 {twenty} 30 {thirty} other {other}}}\\n      female {female}\\n      other {other}\\n    }'}}, {})
 6 │   return [
 7 │     $i18n_1$
 8 │   ];
 9 │ },
10 │ template: function MyComponent_Template(rf, ctx) {
11 │   if (rf & 1) {
12 │     $r3$.ɵɵelementStart(0, "div");
13 ▶     $r3$.ɵɵi18n(1, 0);
14 │     $r3$.ɵɵelementEnd();
15 │   }
16 │   if (rf & 2) {
17 │     $r3$.ɵɵadvance();
18 ▶     $r3$.ɵɵi18nExp(ctx.age)(ctx.gender);
19 │     $r3$.ɵɵi18nApply(1);
20 │   }
21 │ }
```

期待する出力はテストのマクロ（`__i18nIcuMsg__` は「ICU のサブメッセージ 1 つ分の文」、`__i18nMsg__` は「普通のメッセージ 1 つ分の文」に展開される。[第 19 回](19-loc-testing.md)）で書かれています。4 行目がサブメッセージで、**外側の select が `VAR_SELECT_1`、内側が `VAR_SELECT`**、表は `VAR_SELECT → �0�`・`VAR_SELECT_1 → �1�` です。5 行目が親のメッセージで、本文は `' {$icu} '` だけ、`icu` の値はサブメッセージの変数 `$i18n_0$` です。18 行目、update では `ctx.age`（内側）が先、`ctx.gender`（外側）が後に `ɵɵi18nExp` されます。名前と番号がなぜ「内側が先」なのかを、2 節と 6 節で確かめます。

## 2. パーサー：ICU をサブメッセージにするか、そのまま置くか

テンプレートの要素からメッセージの木を作る `_I18nVisitor`（全体は[第 2 回](02-loc-markup.md)）のうち、ICU を訪問するところです。

📄 `angular/packages/compiler/src/i18n/i18n_parser.ts` L137–174 （▶ の行: 138, 141, 143, 147, 149, 153–155, 166–168）

```ts
137 │   visitExpansion(icu: html.Expansion, context: I18nMessageVisitorContext): i18n.Node {
138 ▶     context.icuDepth++;
139 │     const i18nIcuCases: {[k: string]: i18n.Node} = {};
140 │     const i18nIcu = new i18n.Icu(icu.switchValue, icu.type, i18nIcuCases, icu.sourceSpan);
141 ▶     icu.cases.forEach((caze): void => {
142 │       i18nIcuCases[caze.value] = new i18n.Container(
143 ▶         caze.expression.map((node) => node.visit(this, context)),
144 │         caze.expSourceSpan,
145 │       );
146 │     });
147 ▶     context.icuDepth--;
148 │ 
149 ▶     if (context.isIcu || context.icuDepth > 0) {
150 │       // Returns an ICU node when:
151 │       // - the message (vs a part of the message) is an ICU message, or
152 │       // - the ICU message is nested.
153 ▶       const expPh = context.placeholderRegistry.getUniquePlaceholder(`VAR_${icu.type}`);
154 ▶       i18nIcu.expressionPlaceholder = expPh;
155 ▶       context.placeholderToContent[expPh] = {
156 │         text: icu.switchValue,
157 │         sourceSpan: icu.switchValueSourceSpan,
158 │       };
159 │       return context.visitNodeFn(icu, i18nIcu);
160 │     }
161 │ 
162 │     // Else returns a placeholder
163 │     // ICU placeholders should not be replaced with their original content but with their
164 │     // translations.
165 │     // TODO(vicb): add a html.Node -> i18n.Message cache to avoid having to re-create the msg
166 ▶     const phName = context.placeholderRegistry.getPlaceholderName('ICU', icu.sourceSpan.toString());
167 ▶     context.placeholderToMessage[phName] = this.toI18nMessage([icu], '', '', '', undefined);
168 ▶     const node = new i18n.IcuPlaceholder(i18nIcu, phName, icu.sourceSpan);
169 │     return context.visitNodeFn(icu, node);
170 │   }
171 │ 
172 │   visitExpansionCase(_icuCase: html.ExpansionCase, _context: I18nMessageVisitorContext): i18n.Node {
173 │     throw new Error('Unreachable code');
174 │   }
```

1. **深さを 1 増やして、case の中身を先に訪問する（138〜147 行目）**

   各 case の中身を `i18n.Container` にして `i18n.Icu` に入れます。143 行目で中の要素や**入れ子の ICU も先に**訪問されます。
2. **「メッセージ全体が ICU」か「入れ子の中」なら、ICU のまま返す（149〜159 行目）**

   153 行目で切り替えの式に `VAR_` ＋ 種類の名前（`VAR_PLURAL`・`VAR_SELECT`）を付け、154 行目で ICU に持たせ、155〜158 行目で「名前 → 元の式の文字列」を記録します。名前は `getUniquePlaceholder`（[第 3 回](03-loc-placeholders.md)）なので、同じ種類が 2 つ目なら `_1` が付きます。**case の中身を先に訪問しているので、内側の ICU が先に `VAR_SELECT` を取り、外側は `VAR_SELECT_1`** になります（1 節の 4 行目）。
3. **それ以外（文の途中の ICU）は、プレースホルダーにする（166〜169 行目）**

   166 行目で `ICU` という名前（同じ中身の ICU なら同じ名前、違えば `ICU_1`…）を付け、167 行目で**その ICU だけを入力にもう一度 `toI18nMessage`** を呼び、別のメッセージを作って `placeholderToMessage` に入れます。このとき入力は ICU 1 つなので、新しいメッセージの中では「メッセージ全体が ICU」の場合になり、2 つ目の手順で `VAR_` の名前が付きます。168 行目、親の木には `IcuPlaceholder` を置きます。

### ICU を文字列にする：icu\_serializer.ts

📄 `angular/packages/compiler/src/render3/view/i18n/icu_serializer.ts` L13–28 （▶ の行: 22–24, 26）

```ts
13 │ class IcuSerializerVisitor implements i18n.Visitor {
14 │   visitText(text: i18n.Text): any {
15 │     return text.value;
16 │   }
17 │ 
18 │   visitContainer(container: i18n.Container): any {
19 │     return container.children.map((child) => child.visit(this)).join('');
20 │   }
21 │ 
22 ▶   visitIcu(icu: i18n.Icu): any {
23 ▶     const strCases = Object.keys(icu.cases).map(
24 ▶       (k: string) => `${k} {${icu.cases[k].visit(this)}}`,
25 │     );
26 ▶     const result = `{${icu.expressionPlaceholder}, ${icu.type}, ${strCases.join(' ')}}`;
27 │     return result;
28 │   }
```

📄 `angular/packages/compiler/src/render3/view/i18n/icu_serializer.ts` L48–60 （▶ の行: 52–53, 58–59）

```ts
48 │   visitIcuPlaceholder(ph: i18n.IcuPlaceholder, context?: any): any {
49 │     return this.formatPh(ph.name);
50 │   }
51 │ 
52 ▶   private formatPh(value: string): string {
53 ▶     return `{${formatI18nPlaceholderName(value, /* useCamelCase */ false)}}`;
54 │   }
55 │ }
56 │ 
57 │ const serializer = new IcuSerializerVisitor();
58 ▶ export function serializeIcuNode(icu: i18n.Icu): string {
59 ▶   return icu.visit(serializer);
60 │ }
```

26 行目、ICU は `{VAR_PLURAL, plural, =0 {…} other {…}}` の形の 1 本の文字列になります。切り替えの式の所には 2 節の `VAR_` の名前が入ります。53 行目、**ICU の中のプレースホルダーは `{INTERPOLATION}`（`$` なし、大文字のまま）**です。`$localize` の側（次の節）も `goog.getMsg` の側（[第 6 回](06-loc-const-collection.md)の `visitIcu`）も、ICU はこの関数で文字列にします。

### $localize の部品にする：ICU は「文字」になる

📄 `angular/packages/compiler/src/render3/view/i18n/localize_utils.ts` L62–72 （▶ の行: 69–70）

```ts
62 │     }
63 │   }
64 │ 
65 │   visitContainer(container: i18n.Container): any {
66 │     container.children.forEach((child) => child.visit(this));
67 │   }
68 │ 
69 ▶   visitIcu(icu: i18n.Icu): any {
70 ▶     this.pieces.push(new o.LiteralPiece(serializeIcuNode(icu), icu.sourceSpan));
71 │   }
72 │ 
```

📄 `angular/packages/compiler/src/render3/view/i18n/localize_utils.ts` L96–114 （▶ の行: 97–99, 108–109, 111）

```ts
 96 │ 
 97 ▶   visitIcuPlaceholder(ph: i18n.IcuPlaceholder): any {
 98 ▶     this.pieces.push(
 99 ▶       this.createPlaceholderPiece(ph.name, ph.sourceSpan, this.placeholderToMessage[ph.name]),
100 │     );
101 │   }
102 │ 
103 │   private createPlaceholderPiece(
104 │     name: string,
105 │     sourceSpan: ParseSourceSpan,
106 │     associatedMessage?: i18n.Message,
107 │   ): o.PlaceholderPiece {
108 ▶     return new o.PlaceholderPiece(
109 ▶       formatI18nPlaceholderName(name, /* useCamelCase */ false),
110 │       sourceSpan,
111 ▶       associatedMessage,
112 │     );
113 │   }
114 │ }
```

70 行目、ICU の本体はプレースホルダーの部品ではなく**文字の部品 1 つ**になります。だからサブメッセージの `$localize` は `` $localize`{VAR_PLURAL, plural, …}` `` と、置き換えの式を 1 つも持ちません。中の `{INTERPOLATION}` は文字のまま翻訳され、実行時に後処理で値が入ります（7 節）。97〜100 行目、親の側の `IcuPlaceholder` はプレースホルダーの部品になり、99 行目で 2 節の 167 行目で作ったメッセージを `associatedMessage` として持たせます。

### 親の部品 :ICU@@…: の ID

📄 `angular/packages/compiler/src/output/output_ast.ts` L789–815 （▶ の行: 793, 801, 803–807）

```ts
789 │   /**
790 │    * Serialize the given `placeholderName` and `messagePart` into "cooked" and "raw" strings that
791 │    * can be used in a `$localize` tagged string.
792 │    *
793 ▶    * The format is `:<placeholder-name>[@@<associated-id>]:`.
794 │    *
795 │    * The `associated-id` is the message id of the (usually an ICU) message to which this placeholder
796 │    * refers.
797 │    *
798 │    * @param partIndex The index of the message part to serialize.
799 │    */
800 │   serializeI18nTemplatePart(partIndex: number): CookedRawString {
801 ▶     const placeholder = this.placeHolderNames[partIndex - 1];
802 │     const messagePart = this.messageParts[partIndex];
803 ▶     let metaBlock = placeholder.text;
804 ▶     if (placeholder.associatedMessage?.legacyIds.length === 0) {
805 ▶       metaBlock += `${ID_SEPARATOR}${computeMsgId(
806 ▶         placeholder.associatedMessage.messageString,
807 ▶         placeholder.associatedMessage.meaning,
808 │       )}`;
809 │     }
810 │     return createCookedRawString(
811 │       metaBlock,
812 │       messagePart.text,
813 │       this.getMessagePartSourceSpan(partIndex),
814 │     );
815 │   }
```

2 つ目以降の部品の頭（`:INTERPOLATION:` など）を作る関数です。804〜808 行目、そのプレースホルダーに `associatedMessage` があり、legacy ID が無ければ、頭に `@@` ＋ **そのメッセージの `messageString` から計算した ID** を付けます。この ID は、抽出したファイルの中で「親の ICU プレースホルダー」と「サブメッセージ」をつなぐ印に使われます（localize の XLIFF の書き手が `<x id="ICU" xid="…"/>` の `xid` に書く。[第 16 回](16-loc-serializers.md)）。

> [!WARNING]
> **ハマりどころ**
>
> **ここに食い違いがあります。**806 行目の `messageString` は、メッセージの木を作るとき（i18n\_ast.ts の `Message` のコンストラクタ、[第 2 回](02-loc-markup.md)）に `LocalizeMessageStringVisitor` で作られ、ICU の中のプレースホルダーも `{$INTERPOLATION}` の形で書きます。一方、サブメッセージの `$localize` の文字は上の icu\_serializer.ts 53 行目の `{INTERPOLATION}` の形で、`$localize` はこの文字から ID を数えます（[第 13 回](13-loc-localize-tag.md)）。**ICU の中にプレースホルダー（補間やタグ）が 1 つでもあると、2 つの ID が違う値になり**、抽出したファイルの `xid` がどの `trans-unit` も指さなくなります。プレースホルダーの無い ICU では文字列が同じなので一致します。
>
> これは開いている issue #53089「IDs in xlf translation files are broken and contain no valid references」の現象と一致します。issue の本文の値を、このサイトのコンパイラで計算し直した結果が次です（gh で読んだかぎり、この issue に付いた PR はありません。main の output\_ast.ts も同じ行のままです）。

📄 `確かめた値（node で computeMsgId を呼んだ結果）`

```
// 2026-11-03、このサイトの @angular/compiler 22.1.6 と @angular/localize 22.1.6 で確かめた値
<span i18n="@@icu-test1">Updated {minutes, plural, =0 {just now} =1 {one minute ago} other {{{ minutes }} minutes ago}}</span>

computeMsgId('{VAR_PLURAL, plural, =0 {just now} =1 {one minute ago} other {{$INTERPOLATION} minutes ago}}')
  → 1887283401472369100   ← 親の :ICU@@…: に書かれる（output_ast.ts 805〜808 行目）
computeMsgId('{VAR_PLURAL, plural, =0 {just now} =1 {one minute ago} other {{INTERPOLATION} minutes ago}}')
  → 2002272803511843863   ← サブメッセージの $localize が実際に持つ ID（ɵparseMessage と同じ）
#53089 の本文の xid="1887283401472369100" と trans-unit id="2002272803511843863" に一致する
```

## 3. ingest：ICU を IcuStartOp と IcuEndOp で挟む

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L1102–1117 （▶ の行: 1103, 1105–1106, 1108, 1110, 1113）

```ts
1102 │ function ingestIcu(unit: ViewCompilationUnit, icu: t.Icu) {
1103 ▶   if (icu.i18n instanceof i18n.Message && isSingleI18nIcu(icu.i18n)) {
1104 │     const xref = unit.job.allocateXrefId();
1105 ▶     unit.create.push(ir.createIcuStartOp(xref, icu.i18n, icuFromI18nMessage(icu.i18n).name, null!));
1106 ▶     for (const [placeholder, text] of Object.entries({...icu.vars, ...icu.placeholders})) {
1107 │       if (text instanceof t.BoundText) {
1108 ▶         ingestBoundText(unit, text, placeholder);
1109 │       } else {
1110 ▶         ingestText(unit, text, placeholder);
1111 │       }
1112 │     }
1113 ▶     unit.create.push(ir.createIcuEndOp(xref));
1114 │   } else {
1115 │     throw Error(`Unhandled i18n metadata type for ICU: ${icu.i18n?.constructor.name}`);
1116 │   }
1117 │ }
```

R3 AST の `Icu` ノード（[R3 AST の章](../compiler/07-compiler-r3-ast.md)）は、切り替えの式を `vars`、中のプレースホルダーを `placeholders` に持っています。1105 行目で `IcuStartOp` を置き、3 つ目の引数に 2 節のプレースホルダー名（`ICU`）を渡します。1106〜1112 行目、切り替えの式と補間は 1108 行目でテキストの補間として、`<b>` のような静的なものは 1110 行目でテキストとして、**どちらも 3 つ目の引数にプレースホルダー名を付けて**積みます。1113 行目で `IcuEndOp` を置きます。

📄 `angular/packages/compiler/src/template/pipeline/ir/src/ops/create.ts` L1943–1970 （▶ の行: 1957, 1962, 1967）

```ts
1943 │ /**
1944 │  * An op that represents the start of an ICU expression.
1945 │  */
1946 │ export interface IcuStartOp extends Op<CreateOp> {
1947 │   kind: OpKind.IcuStart;
1948 │ 
1949 │   /**
1950 │    * The ID of the ICU.
1951 │    */
1952 │   xref: XrefId;
1953 │ 
1954 │   /**
1955 │    * The i18n message for this ICU.
1956 │    */
1957 ▶   message: i18n.Message;
1958 │ 
1959 │   /**
1960 │    * Placeholder used to reference this ICU in other i18n messages.
1961 │    */
1962 ▶   messagePlaceholder: string;
1963 │ 
1964 │   /**
1965 │    * A reference to the i18n context for this op. Initially null, until the context is created.
1966 │    */
1967 ▶   context: XrefId | null;
1968 │ 
1969 │   sourceSpan: ParseSourceSpan;
1970 │ }
```

📄 `angular/packages/compiler/src/template/pipeline/ir/src/ops/create.ts` L2015–2043 （▶ の行: 2029, 2036, 2042）

```ts
2015 │ /**
2016 │  * An op that represents a placeholder in an ICU expression.
2017 │  */
2018 │ export interface IcuPlaceholderOp extends Op<CreateOp> {
2019 │   kind: OpKind.IcuPlaceholder;
2020 │ 
2021 │   /**
2022 │    * The ID of the ICU placeholder.
2023 │    */
2024 │   xref: XrefId;
2025 │ 
2026 │   /**
2027 │    * The name of the placeholder in the ICU expression.
2028 │    */
2029 ▶   name: string;
2030 │ 
2031 │   /**
2032 │    * The static strings to be combined with dynamic expression values to form the text. This works
2033 │    * like interpolation, but the strings are combined at compile time, using special placeholders
2034 │    * for the dynamic expressions, and put into the translated message.
2035 │    */
2036 ▶   strings: string[];
2037 │ 
2038 │   /**
2039 │    * Placeholder values for the i18n expressions to be combined with the static strings to form the
2040 │    * full placeholder value.
2041 │    */
2042 ▶   expressionPlaceholders: I18nParamValue[];
2043 │ }
```

`IcuStartOp` は 1957 行目のメッセージ、1962 行目の親の中での名前、1967 行目の入れ物を持ちます。`IcuPlaceholderOp` は、ICU の中のプレースホルダー 1 つ（2029 行目の名前）の値を「文字の部品（2036 行目）と式の印（2042 行目）を交互につないだもの」として持ちます。`<b>` なら文字だけ、`{{count}}` なら `''`・式・`''` です。

## 4. wrap\_icus：i18n の外の ICU を包む

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_i18n/icu_logic/bare_icu.ts` L3–13 （▶ の行: 6, 10–11）

```ts
 3 │ @Component({
 4 │     selector: 'my-component',
 5 │     template: `
 6 ▶   <div>{gender, select, male {male} female {female} other {other}}</div>
 7 │   <div *ngIf="visible" title="icu only">
 8 │     {age, select, 10 {ten} 20 {twenty} other {other}}
 9 │   </div>
10 ▶   <div *ngIf="available" title="icu and text">
11 ▶     You have {count, select, 0 {no emails} 1 {one email} other {{{count}} emails}}.
12 │   </div>
13 │ `,
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_i18n/icu_logic/bare_icu.js` L17–31 （▶ の行: 20–22, 28）

```js
17 │ function $MyComponent_div_3_Template$(rf, ctx) {
18 │   if (rf & 1) {
19 │     $r3$.ɵɵelementStart(0, "div", 6);
20 ▶     $r3$.ɵɵtext(1, " You have ");
21 ▶     $r3$.ɵɵi18n(2, 2);
22 ▶     $r3$.ɵɵtext(3, ". ");
23 │     $r3$.ɵɵelementEnd();
24 │   }
25 │   if (rf & 2) {
26 │     const $ctx_r1$ = $r3$.ɵɵnextContext();
27 │     $r3$.ɵɵadvance(2);
28 ▶     $r3$.ɵɵi18nExp($ctx_r1$.count)($ctx_r1$.count);
29 │     $r3$.ɵɵi18nApply(2);
30 │   }
31 │ }
```

`i18n` 属性の無い要素の中の ICU です。11 行目の `You have …` の文字は 20・22 行目の `ɵɵtext` のまま残り、ICU の所だけが 21 行目の `ɵɵi18n(2, 2)`（i18n の開始と終了を 1 つにしたもの）になります。ICU は実行時に i18n の仕組み（[第 11 回](11-loc-runtime-icu.md)）でしか動かないので、`i18n` を付けていなくても i18n のブロックが要るのです。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/wrap_icus.ts` L12–46 （▶ の行: 21, 24, 27–29, 32, 37–39）

```ts
12 │ /**
13 │  * Wraps ICUs that do not already belong to an i18n block in a new i18n block.
14 │  */
15 │ export function wrapI18nIcus(job: CompilationJob): void {
16 │   for (const unit of job.units) {
17 │     let currentI18nOp: ir.I18nStartOp | null = null;
18 │     let addedI18nId: ir.XrefId | null = null;
19 │     for (const op of unit.create) {
20 │       switch (op.kind) {
21 ▶         case ir.OpKind.I18nStart:
22 │           currentI18nOp = op;
23 │           break;
24 ▶         case ir.OpKind.I18nEnd:
25 │           currentI18nOp = null;
26 │           break;
27 ▶         case ir.OpKind.IcuStart:
28 ▶           if (currentI18nOp === null) {
29 ▶             addedI18nId = job.allocateXrefId();
30 │             // ICU i18n start/end ops should not receive source spans.
31 │             ir.OpList.insertBefore<ir.CreateOp>(
32 ▶               ir.createI18nStartOp(addedI18nId, op.message, undefined, null),
33 │               op,
34 │             );
35 │           }
36 │           break;
37 ▶         case ir.OpKind.IcuEnd:
38 ▶           if (addedI18nId !== null) {
39 ▶             ir.OpList.insertAfter<ir.CreateOp>(ir.createI18nEndOp(addedI18nId, null), op);
40 │             addedI18nId = null;
41 │           }
42 │           break;
43 │       }
44 │     }
45 │   }
46 │ }
```

パイプラインの 7 番目の段です。create の op を前から見て、i18n ブロックの中にいなければ（28 行目）、32 行目で ICU 自身のメッセージを持つ `I18nStartOp` を ICU の直前に、39 行目で `I18nEndOp` を ICU の直後に置きます。メッセージは ICU のものなので、「メッセージ全体が ICU」の i18n ブロックができます。

## 5. create\_i18n\_contexts の ICU の部分：サブメッセージだけ入れ物を分ける

📄 `angular/packages/compiler/src/template/pipeline/src/phases/create_i18n_contexts.ts` L91–127 （▶ の行: 102–103, 106, 109–110, 112, 117, 119, 121–122）

```ts
 91 │   // Create or assign i18n contexts for ICUs.
 92 │   let currentI18nOp: ir.I18nStartOp | null = null;
 93 │   for (const unit of job.units) {
 94 │     for (const op of unit.create) {
 95 │       switch (op.kind) {
 96 │         case ir.OpKind.I18nStart:
 97 │           currentI18nOp = op;
 98 │           break;
 99 │         case ir.OpKind.I18nEnd:
100 │           currentI18nOp = null;
101 │           break;
102 ▶         case ir.OpKind.IcuStart:
103 ▶           if (currentI18nOp === null) {
104 │             throw Error('AssertionError: Unexpected ICU outside of an i18n block.');
105 │           }
106 ▶           if (op.message.id !== currentI18nOp.message.id) {
107 │             // This ICU is a sub-message inside its parent i18n block message. We need to give it
108 │             // its own context.
109 ▶             const contextOp = ir.createI18nContextOp(
110 ▶               ir.I18nContextKind.Icu,
111 │               job.allocateXrefId(),
112 ▶               currentI18nOp.root,
113 │               op.message,
114 │               null!,
115 │             );
116 │             unit.create.push(contextOp);
117 ▶             op.context = contextOp.xref;
118 │           } else {
119 ▶             // This ICU is the only translatable content in its parent i18n block. We need to
120 │             // convert the parent's context into an ICU context.
121 ▶             op.context = currentI18nOp.context;
122 ▶             blockContextByI18nBlock.get(currentI18nOp.xref)!.contextKind = ir.I18nContextKind.Icu;
123 │           }
124 │           break;
125 │       }
126 │     }
127 │   }
```

[第 5 回](05-loc-pipeline-phases.md)の 6 節で読んだ関数の後半です。103 行目、4 節の段があるので、ここに来る ICU は必ず i18n ブロックの中です。

- **ICU のメッセージと、包んでいるブロックのメッセージの ID が違う（106 行目）**：文の途中の ICU、つまりサブメッセージです。109〜115 行目で種類 `Icu` の入れ物を新しく作り、112 行目でルートのブロックに属させます。
- **同じ（119〜122 行目）**：ブロックの中身が ICU だけです。新しく作らず、122 行目で**ブロックの入れ物の種類を `Icu` に変えます**。メッセージは 1 つで済みます。

## 6. 中の式とタグ：IcuPlaceholderOp に集める

[第 5 回](05-loc-pipeline-phases.md)の 7 節の `convertI18nText` が、3 節で積んだテキストを処理します。そこで引用したとおり、プレースホルダー名の付いたテキストは消さずに `IcuPlaceholderOp` に置き換え（最初の文字は元のテキスト）、その補間は ICU の入れ物・後処理の時刻（`Postproccessing`）の `I18nExpressionOp` になります。最後に、補間の文字の部品を `IcuPlaceholderOp` に写します（111〜112 行目）。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_text_extraction.ts` L108–117 （▶ の行: 111–112）

```ts
108 │           ir.OpList.replaceWithMany(op as ir.UpdateOp, ops);
109 │           // If this interpolation is part of an ICU placeholder, add the strings and expressions to
110 │           // the placeholder.
111 ▶           if (icuPlaceholder !== undefined) {
112 ▶             icuPlaceholder.strings = op.interpolation.strings;
113 │           }
114 │           break;
115 │       }
116 │     }
117 │   }
```

式の番号は第 5 回の 11 節の段が、ブロックの中の順に振ります。3 節の 1106 行目は `{...icu.vars, ...icu.placeholders}` の順に積むので、切り替えの式（`vars`）は中の補間より先です。入れ子のときは、1 節の 18 行目の `ɵɵi18nExp(ctx.age)(ctx.gender)` のとおり内側の切り替えの式が先に並び、4 行目の `VAR_SELECT → �0�`（内側）・`VAR_SELECT_1 → �1�`（外側）になります。2 節の名前の順（内側が先）と式の番号の順が同じなので、名前と値が正しく対応します。

## 7. extract\_i18n\_messages：サブメッセージを親につなぎ、後処理の表を作る

📄 `angular/packages/compiler/src/template/pipeline/src/phases/extract_i18n_messages.ts` L83–121 （▶ の行: 85, 87, 90, 96, 100–101, 105–107, 113, 118–120）

```ts
 83 │     for (const op of unit.create) {
 84 │       switch (op.kind) {
 85 ▶         case ir.OpKind.IcuStart:
 86 │           currentIcu = op;
 87 ▶           ir.OpList.remove<ir.CreateOp>(op);
 88 │           // Skip any contexts not associated with an ICU.
 89 │           const icuContext = i18nContexts.get(op.context!)!;
 90 ▶           if (icuContext.contextKind !== ir.I18nContextKind.Icu) {
 91 │             continue;
 92 │           }
 93 │           // Skip ICUs that share a context with their i18n message. These represent root-level
 94 │           // ICUs, not sub-messages.
 95 │           const i18nBlock = i18nBlocks.get(icuContext.i18nBlock!)!;
 96 ▶           if (i18nBlock.context === icuContext.xref) {
 97 │             continue;
 98 │           }
 99 │           // Find the root message and push this ICUs message as a sub-message.
100 ▶           const rootI18nBlock = i18nBlocks.get(i18nBlock.root)!;
101 ▶           const rootMessage = i18nMessagesByContext.get(rootI18nBlock.context!);
102 │           if (rootMessage === undefined) {
103 │             throw Error('AssertionError: ICU sub-message should belong to a root message.');
104 │           }
105 ▶           const subMessage = i18nMessagesByContext.get(icuContext.xref)!;
106 ▶           subMessage.messagePlaceholder = op.messagePlaceholder;
107 ▶           rootMessage.subMessages.push(subMessage.xref);
108 │           break;
109 │         case ir.OpKind.IcuEnd:
110 │           currentIcu = null;
111 │           ir.OpList.remove<ir.CreateOp>(op);
112 │           break;
113 ▶         case ir.OpKind.IcuPlaceholder:
114 │           // Add ICU placeholders to the message, then remove the ICU placeholder ops.
115 │           if (currentIcu === null || currentIcu.context == null) {
116 │             throw Error('AssertionError: Unexpected ICU placeholder outside of i18n context');
117 │           }
118 ▶           const msg = i18nMessagesByContext.get(currentIcu.context)!;
119 ▶           msg.postprocessingParams.set(op.name, o.literal(formatIcuPlaceholder(op)));
120 ▶           ir.OpList.remove<ir.CreateOp>(op);
121 │           break;
```

1. **ICU の op は役目を終えたので消す（87・111 行目）**

   ICU は実行時に翻訳文から作るので、create の命令は要りません。
2. **サブメッセージだけを選ぶ（90・96 行目）**

   入れ物の種類が `Icu` で、しかもブロックと入れ物を共有していない（5 節の 1 つ目の場合）もの。
3. **ルートのメッセージにつなぐ（100〜107 行目）**

   106 行目でサブメッセージに親の中での名前（`ICU`）を書き、107 行目でルートのメッセージの `subMessages` に足します。
4. **中のプレースホルダーを後処理の表に入れる（113〜120 行目）**

   119 行目、`IcuPlaceholderOp` を 1 本の文字列にして、その ICU の入れ物のメッセージの `postprocessingParams` に入れます。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/extract_i18n_messages.ts` L150–161 （▶ の行: 154, 159–160）

```ts
150 │ /**
151 │  * Formats an ICU placeholder into a single string with expression placeholders.
152 │  */
153 │ function formatIcuPlaceholder(op: ir.IcuPlaceholderOp) {
154 ▶   if (op.strings.length !== op.expressionPlaceholders.length + 1) {
155 │     throw Error(
156 │       `AssertionError: Invalid ICU placeholder with ${op.strings.length} strings and ${op.expressionPlaceholders.length} expressions`,
157 │     );
158 │   }
159 ▶   const values = op.expressionPlaceholders.map(formatValue);
160 ▶   return op.strings.flatMap((str, i) => [str, values[i] || '']).join('');
161 │ }
```

160 行目、文字の部品と式の印を交互につなぎます。`<b>` は `'<b>'`、`{{count}}` は `'�2�'` です。ICU の中のタグは実行時に「翻訳された ICU の case の HTML」として解析されるので、印ではなく本物のタグの文字列が入ります（[第 11 回](11-loc-runtime-icu.md)）。

## 8. i18n\_const\_collection：サブメッセージを先に文にする

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_const_collection.ts` L219–245 （▶ の行: 231, 233, 239–242, 244）

```ts
219 │ function collectMessage(
220 │   job: ComponentCompilationJob,
221 │   fileBasedI18nSuffix: string,
222 │   messages: Map<ir.XrefId, ir.I18nMessageOp>,
223 │   messageOp: ir.I18nMessageOp,
224 │ ): {mainVar: o.ReadVarExpr; statements: o.Statement[]} {
225 │   // Recursively collect any sub-messages, record each sub-message's main variable under its
226 │   // placeholder so that we can add them to the params for the parent message. It is possible
227 │   // that multiple sub-messages will share the same placeholder, so we need to track an array of
228 │   // variables for each placeholder.
229 │   const statements: o.Statement[] = [];
230 │   const subMessagePlaceholders = new Map<string, o.Expression[]>();
231 ▶   for (const subMessageId of messageOp.subMessages) {
232 │     const subMessage = messages.get(subMessageId)!;
233 ▶     const {mainVar: subMessageVar, statements: subMessageStatements} = collectMessage(
234 │       job,
235 │       fileBasedI18nSuffix,
236 │       messages,
237 │       subMessage,
238 │     );
239 ▶     statements.push(...subMessageStatements);
240 ▶     const subMessages = subMessagePlaceholders.get(subMessage.messagePlaceholder!) ?? [];
241 ▶     subMessages.push(subMessageVar);
242 ▶     subMessagePlaceholders.set(subMessage.messagePlaceholder!, subMessages);
243 │   }
244 ▶   addSubMessageParams(messageOp, subMessagePlaceholders);
245 │ 
```

[第 6 回](06-loc-const-collection.md)の `collectMessage` の前半です。231〜243 行目、自分の `subMessages` を先に再帰で文にし、239 行目でその文を自分の文より**前に**並べます。だから出力ではサブメッセージの `i18n_0` が親の `i18n_1` より先に宣言されます。240〜242 行目で、親の中での名前ごとにサブメッセージの変数を集めます。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_const_collection.ts` L294–317 （▶ の行: 307–308, 310, 312, 314）

```ts
294 │ /**
295 │  * Adds the given subMessage placeholders to the given message op.
296 │  *
297 │  * If a placeholder only corresponds to a single sub-message variable, we just set that variable
298 │  * as the param value. However, if the placeholder corresponds to multiple sub-message
299 │  * variables, we need to add a special placeholder value that is handled by the post-processing
300 │  * step. We then add the array of variables as a post-processing param.
301 │  */
302 │ function addSubMessageParams(
303 │   messageOp: ir.I18nMessageOp,
304 │   subMessagePlaceholders: Map<string, o.Expression[]>,
305 │ ) {
306 │   for (const [placeholder, subMessages] of subMessagePlaceholders) {
307 ▶     if (subMessages.length === 1) {
308 ▶       messageOp.params.set(placeholder, subMessages[0]);
309 │     } else {
310 ▶       messageOp.params.set(
311 │         placeholder,
312 ▶         o.literal(`${ESCAPE}${I18N_ICU_MAPPING_PREFIX}${placeholder}${ESCAPE}`),
313 │       );
314 ▶       messageOp.postprocessingParams.set(placeholder, o.literalArr(subMessages));
315 │     }
316 │   }
317 │ }
```

307〜308 行目、名前 1 つにサブメッセージが 1 つなら、そのまま `$localize` の置き換えの式にします（`…, i18n_0, …`）。翻訳されたサブメッセージが、親を作るときに文字として入ります。310〜315 行目、同じ名前に 2 つ以上（同じ中身の ICU が別の場所に 2 回あると、2 節の 166 行目で同じ名前 `ICU` になる）なら、312 行目で `�I18N_EXP_ICU�` という印を置き、314 行目で変数の配列を後処理に回します。実行時の `ɵɵi18nPostprocess` が、この印を [第 5 回](05-loc-pipeline-phases.md)の `[…|…]` と同じように順に配ります。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_const_collection.ts` L259–278 （▶ の行: 263, 265, 268, 270, 273–274, 276–277）

```ts
259 │   let transformFn = undefined;
260 │ 
261 │   // If nescessary, add a post-processing step and resolve any placeholder params that are
262 │   // set in post-processing.
263 ▶   if (messageOp.needsPostprocessing || messageOp.postprocessingParams.size > 0) {
264 │     // Sort the post-processing params for consistency with TemaplateDefinitionBuilder output.
265 ▶     const postprocessingParams = Object.fromEntries(
266 │       [...messageOp.postprocessingParams.entries()].sort(),
267 │     );
268 ▶     const formattedPostprocessingParams = formatI18nPlaceholderNamesInMap(
269 │       postprocessingParams,
270 ▶       /* useCamelCase */ false,
271 │     );
272 │     const extraTransformFnParams: o.Expression[] = [];
273 ▶     if (messageOp.postprocessingParams.size > 0) {
274 ▶       extraTransformFnParams.push(mapLiteral(formattedPostprocessingParams, /* quoted */ true));
275 │     }
276 ▶     transformFn = (expr: o.ReadVarExpr) =>
277 ▶       o.importExpr(Identifiers.i18nPostprocess).callFn([expr, ...extraTransformFnParams]);
278 │   }
```

263 行目、`[…|…]` のリストがある（`needsPostprocessing`）か、後処理の表が空でなければ、276〜277 行目で `ɵɵi18nPostprocess(i18n_0, {…})` を作ります（第 6 回の 4 節で、if の外で代入し直す文になる）。265〜271 行目、表は名前の順に並べ、270 行目のとおり名前は `VAR_PLURAL` の大文字の形のまま（`goog.getMsg` の `startBoldText` の形にはしない）です。273〜274 行目、表が空のときは 1 つ目の引数だけです。この関数が実行時に何をするか（`{VAR_PLURAL}` を `�1�` に、`�I18N_EXP_ICU�` を順に）は[第 9 回](09-loc-runtime-start.md)で読みます。

## 9. i18nNormalizeLineEndingsInICUs：ICU の切り替えの式の改行

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1164–1186 （▶ の行: 1172–1174, 1176, 1179, 1181）

```ts
1164 │   private _consumeExpansionFormStart() {
1165 │     this._beginToken(TokenType.EXPANSION_FORM_START);
1166 │     this._requireCharCode(chars.$LBRACE);
1167 │     this._endToken([]);
1168 │ 
1169 │     this._expansionCaseStack.push(TokenType.EXPANSION_FORM_START);
1170 │ 
1171 │     this._beginToken(TokenType.RAW_TEXT);
1172 ▶     const condition = this._readUntil(chars.$COMMA);
1173 ▶     const normalizedCondition = this._processCarriageReturns(condition);
1174 ▶     if (this._i18nNormalizeLineEndingsInICUs) {
1175 │       // We explicitly want to normalize line endings for this text.
1176 ▶       this._endToken([normalizedCondition]);
1177 │     } else {
1178 │       // We are not normalizing line endings.
1179 ▶       const conditionToken = this._endToken([condition]);
1180 │       if (normalizedCondition !== condition) {
1181 ▶         this.nonNormalizedIcuExpressions.push(conditionToken);
1182 │       }
1183 │     }
1184 │     this._requireCharCode(chars.$COMMA);
1185 │     this._attemptCharCodeUntilFn(isNotWhitespace);
1186 │ 
```

字句解析で ICU の始まりの `{` を読んだ直後です。1172 行目で `,` までを切り替えの式として読み、1173 行目で `\r\n` を `\n` にした版を作ります。1174〜1176 行目、設定が真なら直した版を、1179 行目、偽なら**元のまま**のトークンにします。この設定が効くのは、この切り替えの式の文字だけです（case の中の文字は、同じファイルの文字を読む所で、この設定に関係なく直されます。`preserveLineEndings` を付けたときを除く）。

切り替えの式は、新しい ID（`VAR_PLURAL` に置き換わる）には入りません。入るのは legacy ID の 1 つ目（XLIFF 1.2 用の sha1）です。外部のテンプレート（`templateUrl`）を `\r\n` の改行で書いたときの、2 つの設定の期待する出力を並べます。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_i18n/line_ending_normalization/external_template_legacy_non_normalized.js` L1–8 （▶ の行: 5, 8）

```js
1 │ // NOTE: The ids generated by the compiler are different if the template is external and we are not explicitly normalizing the line endings.
2 │ $I18N_1$ = $localize `:␟4f9ce2c66b187afd9898b25f6336d1eb2be8b5dc␟7326958852138509669:abc
3 │ def`;
4 │ …
5 ▶ $I18N_2$ = $localize `:␟ed275132ef4cf80cbcf817e66b74c384e68340b1␟2056861121373082280:{VAR_SELECT, select, =0 {zero
6 │     }}`
7 │ …
8 ▶ $I18N_3$ = $localize `:␟55d63b098ee4cce61944f086cdd9b60c6bcef20b␟6752545234037626269: Some Message ${$I18N_2$}:ICU:`;
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_i18n/line_ending_normalization/external_template_legacy_normalized.js` L1–8 （▶ の行: 5, 8）

```js
1 │ // NOTE: The ids generated by the compiler are different if the template is external and we are not explicitly normalizing the line endings.
2 │ $I18N_1$ = $localize `:␟4f9ce2c66b187afd9898b25f6336d1eb2be8b5dc␟7326958852138509669:abc
3 │ def`;
4 │ …
5 ▶ $I18N_2$ = $localize `:␟47e6af99f2e9137a977cf8c7bf39d091d339ae3a␟2056861121373082280:{VAR_SELECT, select, =0 {zero
6 │     }}`
7 │ …
8 ▶ $I18N_3$ = $localize `:␟23ea0658f9e9f6c61c9e2798fff0f4b11c509fae␟6752545234037626269: Some Message ${$I18N_2$}:ICU:`;
```

5 行目と 8 行目、`␟` の後ろの 1 つ目（`ed27…` と `47e6…`、`55d6…` と `23ea…`）だけが違い、2 つ目の 10 進の ID と、`$localize` の新しい ID の材料になる本文は同じです。つまりこの設定を変えると、**XLIFF 1.2 の legacy ID で翻訳しているプロジェクトでは、ICU を含むメッセージの ID が変わります**。インラインのテンプレート（`template:` の文字列）は設定に関係なく常に直されます（[第 8 回](08-loc-compiler-options.md)）。

## 10. デモ：サブメッセージと後処理の表、ID のつながり

> **🧪 DEMO — このページの @angular/compiler 22.1.6 で ICU をコンパイルし、@angular/localize 22.1.6 の ɵparseMessage で ID を数える**
>
> 「コンパイルする」を押すと、`compileI18nTemplate`（legacy ID なし）で JS を作り、consts の `$localize` を 1 つずつ取り出して、本物の `ɵparseMessage`（`$localize` が実行時に使う関数）で ID を数えます。`ɵɵi18nPostprocess` の表と、親の `:ICU@@…:` の ID がサブメッセージの ID と同じかも並べます。翻訳は読み込みません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/loc-icu-compile)

最初の例では `i18n_0` がサブメッセージ（部品 1 つ、`{INTERPOLATION}`・`{START_BOLD_TEXT}` を文字として含む）、`i18n_1` が親（`:ICU@@…:` の部品を含む）です。後処理の表は `VAR_PLURAL → �1�`・`INTERPOLATION → �2�`・`INTERPOLATION_1 → �3�`・`START_BOLD_TEXT → <b>` で、最後の表は「違う」になります。case から `{{count}}` と `<b>` を消すと「同じ」になり、2 節の注意の条件どおりです。

## ここまでの呼び出し

- `_I18nVisitor.visitExpansion` — i18n\_parser.ts 137 — *VAR\_PLURAL（153）か ICU プレースホルダー＋サブメッセージ（166〜168）*
- `ingestIcu` — ingest.ts 1105・1113 — *IcuStart / テキスト / IcuEnd*
- `wrapI18nIcus`（7 番） — wrap\_icus.ts 32・39 — *i18n の外の ICU だけ*
- `createI18nContexts`（14 番） — create\_i18n\_contexts.ts 106・122 — *サブメッセージは新しい入れ物*
- `convertI18nText`（49 番） — 第 5 回 ／ i18n\_text\_extraction.ts 112 — *IcuPlaceholderOp と後処理の式*
- `extractI18nMessages`（57 番） — extract\_i18n\_messages.ts 107・119 — *subMessages と postprocessingParams*
- `collectI18nConsts` → `collectMessage`（58 番） — i18n\_const\_collection.ts 233・244・276 — *サブメッセージが先、ɵɵi18nPostprocess*
  - `serializeIcuNode` — icu\_serializer.ts 58 — *{INTERPOLATION} の形*
  - `LocalizedString.serializeI18nTemplatePart` — output\_ast.ts 805 — *:ICU@@id:（#53089）*

## テストと直し方

### spec とテストケース

| 場所 | 中身 | 件数 |
| --- | --- | --- |
| r3\_view\_compiler\_i18n/icu\_logic/（`nested_icus`・`bare_icu`・`shared_placeholder`・`icu_with_interpolations`・`html_content`・`multiple_icus` など） | 1・4 節。`shared_placeholder.js` に 8 節の `�I18N_EXP_ICU�` と `"ICU": [$I18N_1$, $I18N_2$, $I18N_4$]` | 17 |
| r3\_view\_compiler\_i18n/line\_ending\_normalization/ | 9 節。インライン／外部 × 設定の真偽 × legacy の有無 | 8 |
| r3\_view\_compiler\_i18n/ng-container\_ng-template/（`icus.ts`・`bare_icus.ts`） | ng-container・ng-template の中の ICU | （第 5 回で数えた 14 本の中） |

パーサーの側（`visitExpansion`）の単体の spec は compiler/test/i18n/i18n\_parser\_spec.ts です（ICU の describe を含む。持ち場の都合で[第 2 回](02-loc-markup.md)と[第 19 回](19-loc-testing.md)が扱います）。

### 手元で走らせた結果

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/test/compliance/full:full \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=r3_view_compiler_i18n/(icu_logic|line_ending_normalization)"
```

📄 `出力（2026-11-03 に実行。抜粋。ログは scratchpad/i18n-logs/b-icu.log）`

```
//packages/compiler-cli/test/compliance/full:full（shard 2）
shard 1: Ran 12 of 604 specs, 12 specs, 0 failures
shard 2: Ran 13 of 605 specs, 13 specs, 0 failures
PASSED in 1.5s（bazel 全体 2.0 秒）
```

- 2 つの shard に 12 本と 13 本、合計 25 本（17 + 8 と一致）。1.5 秒でした。

### 直すとしたら

- #53089：ずれているのは 2 つの文字列の作り方です。入口は 2 つ考えられます。output\_ast.ts の 805〜808 行目で、`messageString` ではなく `$localize` が数えるのと同じ文字列（icu\_serializer.ts の形）から ID を計算する。あるいは i18n\_ast.ts の `LocalizeMessageStringVisitor` が ICU の中で `{$…}` を書かないようにする。後者は `messageString` を使う他の所（新しい形のメッセージ ID の計算）にも効くので、影響の広さを先に確かめます。どちらでも、`:ICU@@…:` を含むゴールデン（`icu_logic/shared_placeholder.js` や `line_ending_normalization/inline_template_non_legacy.js`）の数字が変わるはずなので、それが手元で確かめる最初の spec です。本家に PR は出さず、issue のコメントを読み、関係する PR が無いことを確かめたうえで、手元で再現と原因の確認までにとどめます（[第 20 回](20-loc-issues.md)）。
- ICU を別のメッセージにせず親に含めたい（#65143）、ICU に自分の ID を付けたい（#48668）、同じ形の ICU が 1 つにまとまる（#46241）：どれも 2 節の 166〜167 行目（名前の付け方と、別のメッセージにする判断）が入口です。#65143 の本文は、この 3 つと #53089 を「ICU を別のメッセージとして抽出していること」が根っこの issue として並べています（どれも開いている）。
- 属性の中の ICU（#21615）：ICU の字句解析は要素の中身でしか行われないので、パーサーより前の段の話になります（[字句解析の章](../compiler/03-compiler-html-lexer.md)）。

## 聞かれそうな質問

**Q. ICU を含むメッセージから、$localize が 2 つ出るのはなぜですか？**

文の途中の ICU は、i18n\_parser.ts の 166〜168 行目でプレースホルダーに置き換えられ、ICU だけから別のメッセージが作られるからです。親は `:ICU:` の置き換えの式としてサブメッセージの変数を受け取ります（i18n\_const\_collection.ts 307〜308 行目）。メッセージの中身が ICU だけのときは 1 つです（create\_i18n\_contexts.ts 119〜122 行目）。

**Q. VAR\_PLURAL と VAR\_PLURAL\_1、どちらが外側ですか？**

入れ子なら `_1` の付いた方が外側です。i18n\_parser.ts は case の中身を先に訪問し（141〜146 行目）、名前を付けるのはその後（153 行目）なので、内側が先に `VAR_PLURAL` を取ります。

**Q. ICU の中の {{count}} は、なぜ $localize の置き換えの式にならないのですか？**

ICU の本体は localize\_utils.ts 70 行目で文字の部品 1 つになるからです。中の補間は `{INTERPOLATION}` という文字のまま翻訳され、`ɵɵi18nPostprocess` の表（i18n\_const\_collection.ts 276〜277 行目、値は extract\_i18n\_messages.ts 119 行目）で実行時に `�2�` などに置き換えられ、さらに `ɵɵi18nExp` の値になります。

**Q. ICU の中の &lt;b&gt; は、出力のどこに残りますか？**

後処理の表に `'START_BOLD_TEXT': '<b>'` として残ります。ingest.ts の 1110 行目でテキストとして積まれ、`IcuPlaceholderOp` の文字の部品になり（extract\_i18n\_messages.ts 160 行目）、実行時に ICU の case の HTML として解析されます。

**Q. i18nNormalizeLineEndingsInICUs を true にすると何が変わりますか？**

外部のテンプレートで、ICU の切り替えの式の `\r\n` が `\n` になります（lexer.ts 1174〜1176 行目）。それで変わるのは legacy ID の 1 つ目（sha1）だけで、ゴールデンの 5・8 行目のとおり、10 進の ID と新しい ID は変わりません。

## 読み終えて

- 文の途中の ICU はパーサーでプレースホルダー `ICU` とサブメッセージに分かれ、サブメッセージの中で切り替えの式に `VAR_種類` の名前が付く（内側が先）。
- ICU の本体は `$localize` の文字の部品 1 つで、中のプレースホルダーは `{NAME}` の文字。実行時の `ɵɵi18nPostprocess` の表が値を入れる。
- パイプラインでは、i18n の外の ICU を包み、サブメッセージにだけ入れ物を作り、ルートのメッセージの `subMessages` につなぎ、文はサブメッセージから先に書く。
- 親の `:ICU@@id:` は `{$NAME}` の形の文字列から数えるので、中にプレースホルダーのある ICU では本当の ID とずれる（#53089）。

---

← 前: [出力に $localize を書く：i18n の定数と goog.getMsg](06-loc-const-collection.md)  
次: [コンパイラの i18n の設定と古い抽出](08-loc-compiler-options.md) →
