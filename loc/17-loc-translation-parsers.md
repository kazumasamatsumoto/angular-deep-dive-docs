[目次](../README.md) › [i18n と $localize の内側](README.md) › 第 17 回 / 全 20 回

# 翻訳ファイルを読む：TranslationLoader と各パーサー

> TranslationLoader が、ファイルごとに並んだパーサーの analyze() に名前と中身を見せ、最初に canParse: true と答えたもので parse() する流れ（拡張子で決めるのは XTB と JSON だけ）。XLIFF 1.2・XLIFF 2・XTB・ARB・JSON のパーサーと、&lt;target&gt; の中身を ICU 込みで読み直して {$NAME} の形の部品に戻す MessageSerializer・TargetMessageRenderer、診断（Diagnostics）の warning と error、同じロケールの複数のファイルの合わせ方。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/loc-translation-parsers)

---

翻訳する人から戻ってきた `messages.fr.xlf` は、そのままでは `$localize` に渡せません。この章では、`@angular/localize/tools` の `TranslationLoader` が 1 つのファイルを読むときに、5 つのパーサーのどれで読むかを `analyze()` で決め、`<target>` の中の `<x id="NAME"/>` を `{$NAME}` の形の `ɵParsedTranslation` に戻すまでを、行を指して追います。読み違えたときに何が warning で何が error になるか（`Diagnostics`）も見ます。

読む対象は `packages/localize/tools/src/translate/translation_files/` の `translation_loader.ts`、`translation_parsers/` の 5 つのパーサーと `translation_utils.ts`・`serialize_translation_message.ts`、`message_serialization/` の `MessageSerializer` と `TargetMessageRenderer`、それに `tools/src/diagnostics.ts` です。

1. [1. 全体像](01-loc-overview.md)
2. [2. 印とメッセージ](02-loc-markup.md)
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
17. **17. 翻訳ファイルを読む**（この章）
18. [18. 差し込み](18-loc-translate-tool.md)
19. [19. テスト](19-loc-testing.md)
20. [20. issue と PR を読む](20-loc-issues.md)

## 0. 全体の流れ

1. **ファイルを読み、パーサーに順に見せる**

   `TranslationLoader.loadBundle` が中身を 1 回だけ読み、パーサーの `analyze()` に順に渡す。最初に「読める」と答えたものだけが `parse()` をする（2 節）。
2. **形式ごとに木を歩く**

   XML の 3 形式（XLIFF 1.2・XLIFF 2.0・XTB）は compiler の `XmlParser` で木にし、`<trans-unit>` などを訪ねる。JSON と ARB は `JSON.parse` の値を `ɵparseTranslation` に渡すだけ（5〜8 節）。
3. **翻訳文を部品とプレースホルダー名に分ける**

   `<target>` の中を `MessageSerializer` が歩き、`TargetMessageRenderer` が `messageParts` と `placeholderNames` を作る（9 節）。
4. **ロケールを決め、複数のファイルを合わせる**

   引数のロケールとファイルの中のロケールを比べ、同じロケールの 2 つ目以降のファイルの翻訳を足す（2・3 節）。

できあがる `TranslationBundle`（ロケールと `{ ID: ɵParsedTranslation }` の表）を使って `$localize` を書き換えるのは[第 18 回](18-loc-translate-tool.md)です。書く側（抽出したメッセージを XLIFF にする `Xliff1TranslationSerializer` など）は[第 16 回](16-loc-serializers.md)で、この章のパーサーはその逆向きです。

## 1. パーサーの約束：analyze と parse

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/translation_parser.ts` L16–42 （▶ の行: 17, 19, 26, 33, 39–41）

```ts
16 │ export interface CanParseAnalysis<Hint> {
17 ▶   canParse: true;
18 │   diagnostics: Diagnostics;
19 ▶   hint: Hint;
20 │ }
21 │ 
22 │ /**
23 │  * Indicates that a parser cannot parse a given file with diagnostics as why this is.
24 │  * */
25 │ export interface CannotParseAnalysis {
26 ▶   canParse: false;
27 │   diagnostics: Diagnostics;
28 │ }
29 │ 
30 │ /**
31 │  * Information about whether a `TranslationParser` can parse a given file.
32 │  */
33 ▶ export type ParseAnalysis<Hint> = CanParseAnalysis<Hint> | CannotParseAnalysis;
34 │ 
35 │ /**
36 │  * An object that holds translations that have been parsed from a translation file.
37 │  */
38 │ export interface ParsedTranslationBundle {
39 ▶   locale: string | undefined;
40 ▶   translations: Record<MessageId, ɵParsedTranslation>;
41 ▶   diagnostics: Diagnostics;
42 │ }
```

`analyze()` の結果は 33 行目の 2 通りです。読めるなら 17 行目の `canParse: true` と 19 行目の `hint`、読めないなら 26 行目の `canParse: false` と理由の `diagnostics`。`hint` は「判定のついでに作ったもの」です。XML のパーサーは判定のために XML を木にするので、その木を `hint` に入れて `parse()` に渡し、2 回 parse しないようにします（5 節）。`parse()` が返すのは 39〜41 行目の 3 つ、ロケール（ファイルに書かれていなければ `undefined`）、ID から翻訳への表、診断です。

📄 `angular/packages/localize/tools/src/translate/index.ts` L97–109 （▶ の行: 101–105, 107–108）

```ts
 97 │   const fs = getFileSystem();
 98 │   const translationLoader = new TranslationLoader(
 99 │     fs,
100 │     [
101 ▶       new Xliff2TranslationParser(),
102 ▶       new Xliff1TranslationParser(),
103 ▶       new XtbTranslationParser(),
104 ▶       new SimpleJsonTranslationParser(),
105 ▶       new ArbTranslationParser(),
106 │     ],
107 ▶     duplicateTranslation,
108 ▶     diagnostics,
109 │   );
```

`localize-translate` の入口の `translateFiles` は、101〜105 行目の順にパーサーを並べてローダーを作ります。この順に意味があるのは、**最初に読めると答えたパーサーで決まる**からです（2 節）。ng build の `localize` は `@angular/localize/tools` から同じ 5 つのパーサーを import しますが、ローダーは CLI が自分で書いたもので、並びも違います（[cli-i18n](../cli/09-cli-i18n.md) の 2 節）。

## 2. TranslationLoader：1 つのファイルを読む

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_loader.ts` L47–64 （▶ の行: 48–49, 51–53, 64）

```ts
47 │   loadBundles(
48 ▶     translationFilePaths: AbsoluteFsPath[][],
49 ▶     translationFileLocales: (string | undefined)[],
50 │   ): TranslationBundle[] {
51 ▶     return translationFilePaths.map((filePaths, index) => {
52 ▶       const providedLocale = translationFileLocales[index];
53 ▶       return this.mergeBundles(filePaths, providedLocale);
54 │     });
55 │   }
56 │ 
57 │   /**
58 │    * Load all the translations from the file at the given `filePath`.
59 │    */
60 │   private loadBundle(
61 │     filePath: AbsoluteFsPath,
62 │     providedLocale: string | undefined,
63 │   ): TranslationBundle {
64 ▶     const fileContents = this.fs.readFile(filePath);
```

48 行目の `translationFilePaths` は「ロケールごとのファイルの配列」の配列です（`[[app.fr.xlf, lib.fr.xlf], [app.de.xlf]]`）。49 行目の `translationFileLocales` は同じ添え字のロケールで、51〜53 行目で 1 つのロケールのファイル群を `mergeBundles` に渡します。64 行目で、1 つのファイルの中身を 1 回だけ読みます。

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_loader.ts` L65–83 （▶ の行: 66–70, 77–80）

```ts
65 │     const unusedParsers = new Map<TranslationParser<any>, ParseAnalysis<any>>();
66 ▶     for (const translationParser of this.translationParsers) {
67 ▶       const result = translationParser.analyze(filePath, fileContents);
68 ▶       if (!result.canParse) {
69 ▶         unusedParsers.set(translationParser, result);
70 ▶         continue;
71 │       }
72 │ 
73 │       const {
74 │         locale: parsedLocale,
75 │         translations,
76 │         diagnostics,
77 ▶       } = translationParser.parse(filePath, fileContents, result.hint);
78 ▶       if (diagnostics.hasErrors) {
79 ▶         throw new Error(
80 ▶           diagnostics.formatDiagnostics(`The translation file "${filePath}" could not be parsed.`),
81 │         );
82 │       }
83 │ 
```

1. **66〜67 行目：並んだ順に analyze**

   拡張子では分けません。どのパーサーにもファイルの名前と中身の両方を見せ、パーサーが自分で判断します（拡張子を見るのは XTB と JSON だけ。7・8 節）。
2. **68〜70 行目：読めなければ理由を取っておく**

   `unusedParsers` に、そのパーサーと「読めない理由」を入れて次へ進みます。どれも読めなかったときのエラー文に使います。
3. **77 行目：読めたものだけが parse**

   `analyze()` が作った `result.hint` をそのまま渡します。
4. **78〜80 行目：error が 1 つでもあれば例外**

   パーサーは例外を投げない約束（`TranslationParser` の `parse()` のコメントに「Note that this method should not throw an error」とある）なので、読み違いは `diagnostics` に入って戻ってきます。`hasErrors` なら、ここで初めて `Error` にしてローダーを止めます。warning だけなら止めません。

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_loader.ts` L84–121 （▶ の行: 84–86, 91–94, 96, 102–103, 106, 117–118）

```ts
 84 ▶       const locale = providedLocale || parsedLocale;
 85 ▶       if (locale === undefined) {
 86 ▶         throw new Error(
 87 │           `The translation file "${filePath}" does not contain a target locale and no explicit locale was provided for this file.`,
 88 │         );
 89 │       }
 90 │ 
 91 ▶       if (
 92 ▶         parsedLocale !== undefined &&
 93 ▶         providedLocale !== undefined &&
 94 ▶         parsedLocale !== providedLocale
 95 │       ) {
 96 ▶         diagnostics.warn(
 97 │           `The provided locale "${providedLocale}" does not match the target locale "${parsedLocale}" found in the translation file "${filePath}".`,
 98 │         );
 99 │       }
100 │ 
101 │       // If we were passed a diagnostics object then copy the messages over to it.
102 ▶       if (this.diagnostics) {
103 ▶         this.diagnostics.merge(diagnostics);
104 │       }
105 │ 
106 ▶       return {locale, translations, diagnostics};
107 │     }
108 │ 
109 │     const diagnosticsMessages: string[] = [];
110 │     for (const [parser, result] of unusedParsers.entries()) {
111 │       diagnosticsMessages.push(
112 │         result.diagnostics.formatDiagnostics(
113 │           `\n${parser.constructor.name} cannot parse translation file.`,
114 │         ),
115 │       );
116 │     }
117 ▶     throw new Error(
118 ▶       `There is no "TranslationParser" that can parse this translation file: ${filePath}.` +
119 │         diagnosticsMessages.join('\n'),
120 │     );
121 │   }
```

84 行目、ロケールは**引数のほうが勝ちます**（CLI の `--target-locales`）。両方とも無ければ 85〜89 行目でエラー。91〜99 行目、両方あって違えば warning を足すだけで、使うのは引数のほうです。102〜103 行目、コンストラクタの 4 つ目の引数に `diagnostics` を渡していれば（`@deprecated` の印が付いていますが、1 節の 108 行目のとおり `translateFiles` は渡しています）、ファイルの診断をそこへ写します。106 行目で `TranslationBundle` を返します。どのパーサーも読めなかったときは 109〜120 行目で、各パーサーの理由を並べたエラーにします。

## 3. 同じロケールの複数のファイルを合わせる

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_loader.ts` L127–158 （▶ の行: 131–132, 135, 141, 146–149, 153）

```ts
127 │   private mergeBundles(
128 │     filePaths: AbsoluteFsPath[],
129 │     providedLocale: string | undefined,
130 │   ): TranslationBundle {
131 ▶     const bundles = filePaths.map((filePath) => this.loadBundle(filePath, providedLocale));
132 ▶     const bundle = bundles[0];
133 │     for (let i = 1; i < bundles.length; i++) {
134 │       const nextBundle = bundles[i];
135 ▶       if (nextBundle.locale !== bundle.locale) {
136 │         if (this.diagnostics) {
137 │           const previousFiles = filePaths
138 │             .slice(0, i)
139 │             .map((f) => `"${f}"`)
140 │             .join(', ');
141 ▶           this.diagnostics.warn(
142 │             `When merging multiple translation files, the target locale "${nextBundle.locale}" found in "${filePaths[i]}" does not match the target locale "${bundle.locale}" found in earlier files [${previousFiles}].`,
143 │           );
144 │         }
145 │       }
146 ▶       Object.keys(nextBundle.translations).forEach((messageId) => {
147 ▶         if (bundle.translations[messageId] !== undefined) {
148 ▶           this.diagnostics?.add(
149 ▶             this.duplicateTranslation,
150 │             `Duplicate translations for message "${messageId}" when merging "${filePaths[i]}".`,
151 │           );
152 │         } else {
153 ▶           bundle.translations[messageId] = nextBundle.translations[messageId];
154 │         }
155 │       });
156 │     }
157 │     return bundle;
158 │   }
```

1. **131〜132 行目：全部読み、1 つ目を土台にする**

   2 つ目以降の翻訳は、1 つ目の bundle の `translations` に直接書き足されます。
2. **135〜144 行目：ロケールが違えば warning**

   それでも合わせるのはやめません。
3. **146〜155 行目：同じ ID は先のファイルが勝つ**

   147 行目で既にあれば 148〜151 行目で `duplicateTranslation`（`'error' | 'warning' | 'ignore'`）の重さで診断を足し、**上書きしません**。無ければ 153 行目で足します。

> [!WARNING]
> **ハマりどころ**
>
> 148 行目は `this.diagnostics?.add(...)` です。コンストラクタに `diagnostics` を渡していないローダーでは、`duplicateTranslation` を `'error'` にしても何も起きません。また、ファイルをまたいだ重複は `duplicateTranslation` の設定で決まりますが、**1 つのファイルの中**の同じ ID は、パーサーが必ず error にします（6 節の 128〜136 行目）。2 節の 78 行目でローダーが止まるので、こちらは設定で緩められません。

## 4. Diagnostics：warning と error を貯める

📄 `angular/packages/localize/tools/src/diagnostics.ts` L12–38 （▶ の行: 12, 21–23, 25–27, 36–37）

```ts
12 ▶ export type DiagnosticHandlingStrategy = 'error' | 'warning' | 'ignore';
13 │ 
14 │ /**
15 │  * This class is used to collect and then report warnings and errors that occur during the execution
16 │  * of the tools.
17 │  *
18 │  * @publicApi used by CLI
19 │  */
20 │ export class Diagnostics {
21 ▶   readonly messages: {type: 'warning' | 'error'; message: string}[] = [];
22 ▶   get hasErrors() {
23 ▶     return this.messages.some((m) => m.type === 'error');
24 │   }
25 ▶   add(type: DiagnosticHandlingStrategy, message: string) {
26 ▶     if (type !== 'ignore') {
27 ▶       this.messages.push({type, message});
28 │     }
29 │   }
30 │   warn(message: string) {
31 │     this.messages.push({type: 'warning', message});
32 │   }
33 │   error(message: string) {
34 │     this.messages.push({type: 'error', message});
35 │   }
36 ▶   merge(other: Diagnostics) {
37 ▶     this.messages.push(...other.messages);
38 │   }
```

12 行目の `DiagnosticHandlingStrategy` は、`missingTranslation`（[第 18 回](18-loc-translate-tool.md)）と `duplicateTranslation` の設定の型です。25〜29 行目の `add(type, message)` は、`'ignore'` なら捨て、それ以外はその重さのまま 21 行目の配列に積みます。22〜24 行目の `hasErrors` は error が 1 つでもあるか。36〜38 行目の `merge` は別の `Diagnostics` の中身を写すだけです。投げも表示もしない、ただの入れ物です。表示するのは呼ぶ側で、`localize-translate` の CLI は最後に全部を `console.warn` し、`hasErrors` なら終了コード 1 にします（[第 18 回](18-loc-translate-tool.md)の 1 節）。

## 5. XML の 3 形式の入口：canParseXml

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/translation_utils.ts` L92–115 （▶ の行: 99–100, 102–104, 106–107, 110, 112–113）

```ts
 92 │ export function canParseXml(
 93 │   filePath: string,
 94 │   contents: string,
 95 │   rootNodeName: string,
 96 │   attributes: Record<string, string>,
 97 │ ): ParseAnalysis<XmlTranslationParserHint> {
 98 │   const diagnostics = new Diagnostics();
 99 ▶   const xmlParser = new XmlParser();
100 ▶   const xml = xmlParser.parse(contents, filePath);
101 │ 
102 ▶   if (
103 ▶     xml.rootNodes.length === 0 ||
104 ▶     xml.errors.some((error) => error.level === ParseErrorLevel.ERROR)
105 │   ) {
106 ▶     xml.errors.forEach((e) => addParseError(diagnostics, e));
107 ▶     return {canParse: false, diagnostics};
108 │   }
109 │ 
110 ▶   const rootElements = xml.rootNodes.filter(isNamedElement(rootNodeName));
111 │   const rootElement = rootElements[0];
112 ▶   if (rootElement === undefined) {
113 ▶     diagnostics.warn(`The XML file does not contain a <${rootNodeName}> root node.`);
114 │     return {canParse: false, diagnostics};
115 │   }
```

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/translation_utils.ts` L116–141 （▶ の行: 117–119, 126, 130–131, 140）

```ts
116 │ 
117 ▶   for (const attrKey of Object.keys(attributes)) {
118 ▶     const attr = rootElement.attrs.find((attr) => attr.name === attrKey);
119 ▶     if (attr === undefined || attr.value !== attributes[attrKey]) {
120 │       addParseDiagnostic(
121 │         diagnostics,
122 │         rootElement.sourceSpan,
123 │         `The <${rootNodeName}> node does not have the required attribute: ${attrKey}="${attributes[attrKey]}".`,
124 │         ParseErrorLevel.WARNING,
125 │       );
126 ▶       return {canParse: false, diagnostics};
127 │     }
128 │   }
129 │ 
130 ▶   if (rootElements.length > 1) {
131 ▶     xml.errors.push(
132 │       new ParseError(
133 │         xml.rootNodes[1].sourceSpan,
134 │         'Unexpected root node. XLIFF 1.2 files should only have a single <xliff> root node.',
135 │         ParseErrorLevel.WARNING,
136 │       ),
137 │     );
138 │   }
139 │ 
140 ▶   return {canParse: true, diagnostics, hint: {element: rootElement, errors: xml.errors}};
141 │ }
```

1. **99〜100 行目：compiler の XmlParser で木にする**

   テンプレートの HTML を読むのと同じ字句解析器の XML 版です（[compiler-html-lexer](../compiler/03-compiler-html-lexer.md)）。
2. **102〜108 行目：木が空か、ERROR があれば読めない**

   JSON のファイルを見せると、中身はただの文字列なので木はできますが、次の段で落ちます。
3. **110〜115 行目：根の要素の名前**

   XLIFF は `xliff`、XTB は `translationbundle`。無ければ warning を付けて読めない。
4. **117〜128 行目：根の属性**

   XLIFF 1.2 と 2.0 を分けるのはここです。どちらも `<xliff>` なので、`version="1.2"` か `version="2.0"` かを見ます。値が違えば読めない。
5. **130〜138 行目：根が 2 つ以上なら warning を足して続ける**

   文は「XLIFF 1.2 files should only have…」ですが、この関数は XLIFF 2.0 と XTB の判定でも使われるので、XTB のファイルでもこの文が出ます。
6. **140 行目：読める。hint に根の要素と、XmlParser のエラーを入れる**

   WARNING の重さのエラーはここまで残り、parse のときに診断に写されます（6 節の 49 行目）。

同じ翻訳を 5 つの形式で書き、5 つのパーサーの `analyze()` に順に見せた結果です（本物を Node で走らせた出力）。

📄 `ターミナル`

```
# scratchpad/build-loc-e/parser-demo.mjs（2026-11-03 に実行）
# サイトの node_modules の @angular/localize/tools 22.1.6 の 5 つのパーサーに、同じ翻訳を 5 つの形式で見せる
node parser-demo.mjs
```

📄 `出力（2026-11-03、抜粋）`

```
/m.xlf
    Xliff2:no(The <xliff> node does not have the required attribute: version="2.0". )
    Xliff1:OK
    Xtb:no(Must have xtb or xmb extension.)
    SimpleJson:no(File does not have .json extension.)
    Arb:no()
    => Xliff1TranslationParser fr {"hello":"Bonjour {$NAME} !"}
/m.xtb
    Xliff2:no(The XML file does not contain a <xliff> root node.)
    Xliff1:no(The XML file does not contain a <xliff> root node.)
    Xtb:OK
    ...
    => XtbTranslationParser fr {"hello":"Bonjour {$NAME} !"}
/m.json
    Xliff2:no(The XML file does not contain a <xliff> root node.)
    Xliff1:no(The XML file does not contain a <xliff> root node.)
    Xtb:no(Must have xtb or xmb extension.)
    SimpleJson:OK
    Arb:no()
    => SimpleJsonTranslationParser fr {"hello":"Bonjour {$NAME} !"}
/m.arb
    ...
    SimpleJson:no(File does not have .json extension.)
    Arb:OK
    => ArbTranslationParser fr {"hello":"Bonjour {$NAME} !"}
/m.txt   （中身は /m.json と同じ）
    Xliff2:no(...) Xliff1:no(...) Xtb:no(...)
    SimpleJson:no(File does not have .json extension.)
    Arb:no()
```

`/m.txt` は中身が正しい JSON でも、拡張子が `.json` でないので SimpleJson は読みません（8 節の 42 行目）。ARB のパーサーは読めない理由を書かない（`Arb:no()`）ので、どれも読めなかったときのエラー文に ARB の行は空で並びます。

## 6. XLIFF 1.2 を読む

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/xliff1_translation_parser.ts` L34–59 （▶ の行: 36, 44, 49, 51, 58）

```ts
34 │ export class Xliff1TranslationParser implements TranslationParser<XmlTranslationParserHint> {
35 │   analyze(filePath: string, contents: string): ParseAnalysis<XmlTranslationParserHint> {
36 ▶     return canParseXml(filePath, contents, 'xliff', {version: '1.2'});
37 │   }
38 │ 
39 │   parse(
40 │     filePath: string,
41 │     contents: string,
42 │     hint: XmlTranslationParserHint,
43 │   ): ParsedTranslationBundle {
44 ▶     return this.extractBundle(hint);
45 │   }
46 │ 
47 │   private extractBundle({element, errors}: XmlTranslationParserHint): ParsedTranslationBundle {
48 │     const diagnostics = new Diagnostics();
49 ▶     errors.forEach((e) => addParseError(diagnostics, e));
50 │ 
51 ▶     if (element.children.length === 0) {
52 │       addParseDiagnostic(
53 │         diagnostics,
54 │         element.sourceSpan,
55 │         'Missing expected <file> element',
56 │         ParseErrorLevel.WARNING,
57 │       );
58 ▶       return {locale: undefined, translations: {}, diagnostics};
59 │     }
```

36 行目、判定は 5 節の `canParseXml` に `'xliff'` と `version: '1.2'` を渡すだけです。44 行目の `parse()` は、`hint`（根の要素とエラー）を受け取るだけで、ファイルの中身（`contents`）を使いません。49 行目で XML の段階のエラーを診断に写し、`<xliff>` の子が無ければ 51〜58 行目で warning を付けて空の bundle を返します。

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/xliff1_translation_parser.ts` L78–102 （▶ の行: 81–82, 84–85, 87, 90, 96）

```ts
 78 │     const bundle: ParsedTranslationBundle = {locale: undefined, translations: {}, diagnostics};
 79 │     const translationVisitor = new XliffTranslationVisitor();
 80 │     const localesFound = new Set<string>();
 81 ▶     for (const file of files) {
 82 ▶       const locale = getAttribute(file, 'target-language');
 83 │       if (locale !== undefined) {
 84 ▶         localesFound.add(locale);
 85 ▶         bundle.locale = locale;
 86 │       }
 87 ▶       visitAll(translationVisitor, file.children, bundle);
 88 │     }
 89 │ 
 90 ▶     if (localesFound.size > 1) {
 91 │       addParseDiagnostic(
 92 │         diagnostics,
 93 │         element.sourceSpan,
 94 │         `More than one locale found in translation file: ${JSON.stringify(
 95 │           Array.from(localesFound),
 96 ▶         )}. Using "${bundle.locale}"`,
 97 │         ParseErrorLevel.WARNING,
 98 │       );
 99 │     }
100 │ 
101 │     return bundle;
102 │   }
```

ロケールは `<file>` の `target-language` 属性です（82 行目）。`<file>` が複数あると、85 行目で毎回上書きするので**最後のもの**が使われ、90〜98 行目で warning（96 行目に使ったロケールが出ます）。87 行目で `<file>` の子を `XliffTranslationVisitor` に歩かせます。`bundle` を文脈として渡すので、訪ねた先で翻訳を書き込めます。

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/xliff1_translation_parser.ts` L105–137 （▶ の行: 107–108, 110, 116–117, 122, 128, 133）

```ts
105 │ class XliffTranslationVisitor extends BaseVisitor {
106 │   override visitElement(element: Element, bundle: ParsedTranslationBundle): void {
107 ▶     if (element.name === 'trans-unit') {
108 ▶       this.visitTransUnitElement(element, bundle);
109 │     } else {
110 ▶       visitAll(this, element.children, bundle);
111 │     }
112 │   }
113 │ 
114 │   private visitTransUnitElement(element: Element, bundle: ParsedTranslationBundle): void {
115 │     // Error if no `id` attribute
116 ▶     const id = getAttribute(element, 'id');
117 ▶     if (id === undefined) {
118 │       addParseDiagnostic(
119 │         bundle.diagnostics,
120 │         element.sourceSpan,
121 │         `Missing required "id" attribute on <trans-unit> element.`,
122 ▶         ParseErrorLevel.ERROR,
123 │       );
124 │       return;
125 │     }
126 │ 
127 │     // Error if there is already a translation with the same id
128 ▶     if (bundle.translations[id] !== undefined) {
129 │       addParseDiagnostic(
130 │         bundle.diagnostics,
131 │         element.sourceSpan,
132 │         `Duplicated translations for message "${id}"`,
133 ▶         ParseErrorLevel.ERROR,
134 │       );
135 │       return;
136 │     }
137 │ 
```

107〜111 行目、`<trans-unit>` 以外の要素（`<body>` や `<group>`）は、子を歩くだけです。だから `<group>` で包んでも読めます。116 行目の `id` が無ければ 122 行目の ERROR、128 行目で同じファイルの中に同じ `id` があれば 133 行目の ERROR です。どちらも `return` でその unit を飛ばします。

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/xliff1_translation_parser.ts` L138–171 （▶ の行: 138–139, 145, 149–150, 156, 162–164, 167, 169–170）

```ts
138 ▶     let targetMessage = element.children.find(isNamedElement('target'));
139 ▶     if (targetMessage === undefined) {
140 │       // Warn if there is no `<target>` child element
141 │       addParseDiagnostic(
142 │         bundle.diagnostics,
143 │         element.sourceSpan,
144 │         'Missing <target> element',
145 ▶         ParseErrorLevel.WARNING,
146 │       );
147 │ 
148 │       // Fallback to the `<source>` element if available.
149 ▶       targetMessage = element.children.find(isNamedElement('source'));
150 ▶       if (targetMessage === undefined) {
151 │         // Error if there is neither `<target>` nor `<source>`.
152 │         addParseDiagnostic(
153 │           bundle.diagnostics,
154 │           element.sourceSpan,
155 │           'Missing required element: one of <target> or <source> is required',
156 ▶           ParseErrorLevel.ERROR,
157 │         );
158 │         return;
159 │       }
160 │     }
161 │ 
162 ▶     const {translation, parseErrors, serializeErrors} = serializeTranslationMessage(targetMessage, {
163 ▶       inlineElements: ['g', 'bx', 'ex', 'bpt', 'ept', 'ph', 'it', 'mrk'],
164 ▶       placeholder: {elementName: 'x', nameAttribute: 'id'},
165 │     });
166 │     if (translation !== null) {
167 ▶       bundle.translations[id] = translation;
168 │     }
169 ▶     addErrorsToBundle(bundle, parseErrors);
170 ▶     addErrorsToBundle(bundle, serializeErrors);
171 │   }
```

1. **138 行目：&lt;target&gt; を探す**

   無ければ 145 行目の WARNING を付け、149 行目で `<source>` を代わりに使います。**翻訳されていない unit は、元の言語の文が「翻訳」として入ります**。両方無ければ 156 行目の ERROR。
2. **162〜165 行目：&lt;target&gt; の中身を翻訳にする**

   XLIFF 1.2 の設定は、163 行目の 8 つの要素（`g`・`bx`・`ex`・`bpt`・`ept`・`ph`・`it`・`mrk`）は中身だけを読み、164 行目の `<x id="…"/>` をプレースホルダーにする、です。中身は 9 節。
3. **167 行目：ID → 翻訳**

   ID は `<trans-unit id>` の値そのままです。`$localize` の側で計算する ID（[第 4 回](04-loc-message-id.md)）と一致しないと「翻訳が無い」になります。
4. **169〜170 行目：エラーを bundle に**

   中身の XML のエラー（`parseErrors`）と、中身を歩いたときのエラー（`serializeErrors`）を、6 節の `addParseError` で写します。

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/translation_utils.ts` L168–187 （▶ の行: 173–174, 176, 184–185）

```ts
168 │ /**
169 │  * Copy the formatted error message from the given `parseError` object into the given `diagnostics`
170 │  * object.
171 │  */
172 │ export function addParseError(diagnostics: Diagnostics, parseError: ParseError): void {
173 ▶   if (parseError.level === ParseErrorLevel.ERROR) {
174 ▶     diagnostics.error(parseError.toString());
175 │   } else {
176 ▶     diagnostics.warn(parseError.toString());
177 │   }
178 │ }
179 │ 
180 │ /**
181 │  * Add the provided `errors` to the `bundle` diagnostics.
182 │  */
183 │ export function addErrorsToBundle(bundle: ParsedTranslationBundle, errors: ParseError[]): void {
184 ▶   for (const error of errors) {
185 ▶     addParseError(bundle.diagnostics, error);
186 │   }
187 │ }
```

173〜177 行目、compiler の `ParseError` の重さ（`ParseErrorLevel.ERROR` か WARNING）が、そのまま `Diagnostics` の error か warning になります。`toString()` は「どのファイルの何行何列か」と前後の文字を付けるので、出力には `[ERROR ->]` の印と `/m.xlf@3:59` のような位置が入ります。

📄 `Xliff1TranslationParser に 10 の例の trans-unit を読ませた出力（scratchpad/build-loc-e/parser-demo.mjs、2026-11-03、抜粋）`

```
== basic locale= fr
   hello "Bonjour {$NAME} !" ["Bonjour "," !"] ["NAME"]
== tags locale= fr
   b "{$START_BOLD_TEXT}gras{$CLOSE_BOLD_TEXT} et {$INTERPOLATION_1}" ["","gras"," et ",""] ["START_BOLD_TEXT","CLOSE_BOLD_TEXT","INTERPOLATION_1"]
== icu locale= fr
   icu "{VAR_PLURAL, plural, =0 {aucun} other {{INTERPOLATION} éléments}}" ["{VAR_PLURAL, plural, =0 {aucun} other {{INTERPOLATION} éléments}}"] []
== dash locale= fr
   d "a {$MY_NAME}" ["a ",""] ["MY_NAME"]
== notarget locale= fr
   nt "Only source {$NAME}" ["Only source ",""] ["NAME"]
    warning Missing <target> element ("...<body>[WARNING ->]<trans-unit id="nt">...): /m.xlf@3:10
== bad locale= fr
    error Invalid element found in message. ("...<target>a [ERROR ->]<span>b</span></target>..."): /m.xlf@3:59
== noid locale= fr
    error Missing required "id" attribute on <trans-unit> element. (...): /m.xlf@3:10
== dup locale= fr
   z "1" ["1"] []
    error Duplicated translations for message "z" (...): /m.xlf@3:78
```

`notarget` は warning だけで、`<source>` の文が翻訳として入っています。`dup` は 1 つ目（`"1"`）が残り、2 つ目は ERROR です。この ERROR があるファイルは 2 節の 78 行目でローダーが止めます。

## 7. XLIFF 2.0 と XTB：違うのは設定と、エラーの重さ

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/xliff2_translation_parser.ts` L160–174 （▶ の行: 161–166, 170）

```ts
160 │     const {translation, parseErrors, serializeErrors} = serializeTranslationMessage(targetMessage, {
161 ▶       inlineElements: ['cp', 'sc', 'ec', 'mrk', 'sm', 'em'],
162 ▶       placeholder: {elementName: 'ph', nameAttribute: 'equiv', bodyAttribute: 'disp'},
163 ▶       placeholderContainer: {
164 ▶         elementName: 'pc',
165 ▶         startAttribute: 'equivStart',
166 ▶         endAttribute: 'equivEnd',
167 │       },
168 │     });
169 │     if (translation !== null) {
170 ▶       bundle.translations[unit] = translation;
171 │     }
172 │     addErrorsToBundle(bundle, parseErrors);
173 │     addErrorsToBundle(bundle, serializeErrors);
174 │   }
```

XLIFF 2.0 の木の歩き方は 1.2 とほぼ同じで（`<unit id>` の下の `<segment>` の `<target>`）、ロケールは根の `trgLang` です。違いは 9 節に渡す設定で、162 行目、プレースホルダーは `<ph equiv="NAME" disp="…"/>` の `equiv`、163〜167 行目、`<pc equivStart="START_BOLD_TEXT" equivEnd="CLOSE_BOLD_TEXT">…</pc>` は開きと閉じの 2 つのプレースホルダーと、その間の中身として読みます。170 行目、翻訳は `<unit>` の ID に入ります。

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/xtb_translation_parser.ts` L33–43 （▶ の行: 35–36, 38, 41）

```ts
33 │ export class XtbTranslationParser implements TranslationParser<XmlTranslationParserHint> {
34 │   analyze(filePath: string, contents: string): ParseAnalysis<XmlTranslationParserHint> {
35 ▶     const extension = extname(filePath);
36 ▶     if (extension !== '.xtb' && extension !== '.xmb') {
37 │       const diagnostics = new Diagnostics();
38 ▶       diagnostics.warn('Must have xtb or xmb extension.');
39 │       return {canParse: false, diagnostics};
40 │     }
41 ▶     return canParseXml(filePath, contents, 'translationbundle', {});
42 │   }
43 │ 
```

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/xtb_translation_parser.ts` L94–107 （▶ の行: 95–96, 98, 101–102, 104）

```ts
 94 │         const {translation, parseErrors, serializeErrors} = serializeTranslationMessage(element, {
 95 ▶           inlineElements: [],
 96 ▶           placeholder: {elementName: 'ph', nameAttribute: 'name'},
 97 │         });
 98 ▶         if (parseErrors.length) {
 99 │           // We only want to warn (not error) if there were problems parsing the translation for
100 │           // XTB formatted files. See https://github.com/angular/angular/issues/14046.
101 ▶           bundle.diagnostics.warn(computeParseWarning(id, parseErrors));
102 ▶         } else if (translation !== null) {
103 │           // Only store the translation if there were no parse errors
104 ▶           bundle.translations[id] = translation;
105 │         }
106 │         addErrorsToBundle(bundle, serializeErrors);
107 │         break;
```

XTB（XMB に対する翻訳の形式）は 35〜40 行目で、拡張子が `.xtb` か `.xmb` でなければ中身を見ずに読めないと答えます。根は `translationbundle` で、属性は問いません（41 行目の `{}`）。95〜96 行目、包む要素は無く（`inlineElements: []`）、プレースホルダーは `<ph name="NAME"/>` です。98〜101 行目が他の 2 つと違うところで、**中身の XML が読めなくても warning にするだけ**で、その翻訳を 104 行目で入れずに先へ進みます（コメントにある #14046 のため）。XLIFF なら同じことが ERROR になり、ファイル全体が読めなくなります。

## 8. JSON と ARB：XML を読まない

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/simple_json_translation_parser.ts` L37–66 （▶ の行: 42–43, 45, 49–50, 54, 58, 62, 66）

```ts
37 │   analyze(filePath: string, contents: string): ParseAnalysis<SimpleJsonFile> {
38 │     const diagnostics = new Diagnostics();
39 │     // For this to be parsable, the extension must be `.json` and the contents must include "locale"
40 │     // and "translations" keys.
41 │     if (
42 ▶       extname(filePath) !== '.json' ||
43 ▶       !(contents.includes('"locale"') && contents.includes('"translations"'))
44 │     ) {
45 ▶       diagnostics.warn('File does not have .json extension.');
46 │       return {canParse: false, diagnostics};
47 │     }
48 │     try {
49 ▶       const json = JSON.parse(contents) as SimpleJsonFile;
50 ▶       if (json.locale === undefined) {
51 │         diagnostics.warn('Required "locale" property missing.');
52 │         return {canParse: false, diagnostics};
53 │       }
54 ▶       if (typeof json.locale !== 'string') {
55 │         diagnostics.warn('The "locale" property is not a string.');
56 │         return {canParse: false, diagnostics};
57 │       }
58 ▶       if (json.translations === undefined) {
59 │         diagnostics.warn('Required "translations" property missing.');
60 │         return {canParse: false, diagnostics};
61 │       }
62 ▶       if (typeof json.translations !== 'object') {
63 │         diagnostics.warn('The "translations" is not an object.');
64 │         return {canParse: false, diagnostics};
65 │       }
66 ▶       return {canParse: true, diagnostics, hint: json};
```

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/simple_json_translation_parser.ts` L73–82 （▶ の行: 74, 76, 78, 80）

```ts
73 │   parse(_filePath: string, contents: string, json?: SimpleJsonFile): ParsedTranslationBundle {
74 ▶     const {locale: parsedLocale, translations} = json || (JSON.parse(contents) as SimpleJsonFile);
75 │     const parsedTranslations: Record<MessageId, ɵParsedTranslation> = {};
76 ▶     for (const messageId in translations) {
77 │       const targetMessage = translations[messageId];
78 ▶       parsedTranslations[messageId] = ɵparseTranslation(targetMessage);
79 │     }
80 ▶     return {locale: parsedLocale, translations: parsedTranslations, diagnostics: new Diagnostics()};
81 │   }
82 │ }
```

42〜43 行目、拡張子が `.json` で、中身に `"locale"` と `"translations"` の文字があることを先に見ます。この 2 つのどちらが欠けても 45 行目の文は「.json の拡張子が無い」なので、拡張子が正しくても同じ文が出ます。49 行目で `JSON.parse` し、50〜65 行目で `locale` が文字列か、`translations` がオブジェクトかを確かめ、66 行目で値そのものを `hint` にします。parse は 76〜78 行目、`translations` の値（`"Bonjour {$NAME} !"`）を 1 つずつ `ɵparseTranslation` に渡すだけです。`ɵparseTranslation` は `{$…}` の印で部品とプレースホルダー名に分ける関数で、中身は[第 14 回](14-loc-runtime-translations.md)です。80 行目の診断は空のままで、JSON のパーサーは翻訳文の中身について何も言いません。

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/arb_translation_parser.ts` L56–90 （▶ の行: 58, 63, 76, 82–83, 87）

```ts
56 │   analyze(_filePath: string, contents: string): ParseAnalysis<ArbJsonObject> {
57 │     const diagnostics = new Diagnostics();
58 ▶     if (!contents.includes('"@@locale"')) {
59 │       return {canParse: false, diagnostics};
60 │     }
61 │     try {
62 │       // We can parse this file if it is valid JSON and contains the `"@@locale"` property.
63 ▶       return {canParse: true, diagnostics, hint: this.tryParseArbFormat(contents)};
64 │     } catch {
65 │       diagnostics.warn('File is not valid JSON.');
66 │       return {canParse: false, diagnostics};
67 │     }
68 │   }
69 │ 
70 │   parse(
71 │     _filePath: string,
72 │     contents: string,
73 │     arb: ArbJsonObject = this.tryParseArbFormat(contents),
74 │   ): ParsedTranslationBundle {
75 │     const bundle: ParsedTranslationBundle = {
76 ▶       locale: arb['@@locale'],
77 │       translations: {},
78 │       diagnostics: new Diagnostics(),
79 │     };
80 │ 
81 │     for (const messageId of Object.keys(arb)) {
82 ▶       if (messageId.startsWith('@')) {
83 ▶         // Skip metadata keys
84 │         continue;
85 │       }
86 │       const targetMessage = arb[messageId] as string;
87 ▶       bundle.translations[messageId] = ɵparseTranslation(targetMessage);
88 │     }
89 │     return bundle;
90 │   }
```

ARB は 58 行目、中身に `"@@locale"` の文字が無ければ理由も書かずに読めないと答えます（5 節の `Arb:no()`）。拡張子は見ません。82〜85 行目、`@` で始まるキー（`@@locale` と、説明を入れる `@message-id`）を飛ばし、残りを 87 行目で `ɵparseTranslation` に渡します。

## 9. &lt;target&gt; の中身を {$NAME} に戻す

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/serialize_translation_message.ts` L22–38 （▶ の行: 30, 32–33, 35–36）

```ts
22 │ export function serializeTranslationMessage(
23 │   element: Element,
24 │   config: MessageSerializerConfig,
25 │ ): {
26 │   translation: ɵParsedTranslation | null;
27 │   parseErrors: ParseError[];
28 │   serializeErrors: ParseError[];
29 │ } {
30 ▶   const {rootNodes, errors: parseErrors} = parseInnerRange(element);
31 │   try {
32 ▶     const serializer = new MessageSerializer(new TargetMessageRenderer(), config);
33 ▶     const translation = serializer.serialize(rootNodes);
34 │     return {translation, parseErrors, serializeErrors: []};
35 ▶   } catch (e) {
36 ▶     return {translation: null, parseErrors, serializeErrors: [e as ParseError]};
37 │   }
38 │ }
```

30 行目、`<target>` の**中身だけ**をもう一度 XML として読み直します。32 行目で `MessageSerializer` と `TargetMessageRenderer` を組み、33 行目で歩かせます。歩いている途中の例外（使えない要素など）は 35〜36 行目で捕まえて `serializeErrors` にし、`translation` は `null` になります（6 節の 166 行目でその unit は入りません）。

📄 `angular/packages/localize/tools/src/translate/translation_files/translation_parsers/translation_utils.ts` L45–68 （▶ の行: 47–48, 50, 60–61, 63）

```ts
45 │ export function parseInnerRange(element: Element): ParseTreeResult {
46 │   const xmlParser = new XmlParser();
47 ▶   const xml = xmlParser.parse(
48 ▶     element.sourceSpan.start.file.content,
49 │     element.sourceSpan.start.file.url,
50 ▶     {tokenizeExpansionForms: true, range: getInnerRange(element)},
51 │   );
52 │   return xml;
53 │ }
54 │ 
55 │ /**
56 │  * Compute a `LexerRange` that contains all the children of the given `element`.
57 │  * @param element The element whose inner range we want to compute.
58 │  */
59 │ function getInnerRange(element: Element): LexerRange {
60 ▶   const start = element.startSourceSpan.end;
61 ▶   const end = element.endSourceSpan!.start;
62 │   return {
63 ▶     startPos: start.offset,
64 │     startLine: start.line,
65 │     startCol: start.col,
66 │     endPos: end.offset,
67 │   };
68 │ }
```

読み直しは、ファイル全体の文字列（48 行目）を、`<target>` の開きタグの終わりから閉じタグの始まりまで（60〜61 行目）に絞って行います。だからエラーの位置は元のファイルの行と列で出ます。50 行目の `tokenizeExpansionForms: true` が大事で、**中身の `{…}` を ICU として読みます**。翻訳文に ICU でない `{title}` のような波括弧があると、ここで ERROR になります（聞かれそうな質問の 3 つ目）。

📄 `angular/packages/localize/tools/src/translate/translation_files/message_serialization/message_serializer.ts` L42–72 （▶ の行: 43–46, 50–51, 55, 57, 62–64, 66, 71）

```ts
42 │   serialize(nodes: Node[]): T {
43 ▶     this.renderer.startRender();
44 ▶     visitAll(this, nodes);
45 ▶     this.renderer.endRender();
46 ▶     return this.renderer.message;
47 │   }
48 │ 
49 │   override visitElement(element: Element): void {
50 ▶     if (this.config.placeholder && element.name === this.config.placeholder.elementName) {
51 ▶       const name = getAttrOrThrow(element, this.config.placeholder.nameAttribute);
52 │       const body =
53 │         this.config.placeholder.bodyAttribute &&
54 │         getAttribute(element, this.config.placeholder.bodyAttribute);
55 ▶       this.visitPlaceholder(name, body);
56 │     } else if (
57 ▶       this.config.placeholderContainer &&
58 │       element.name === this.config.placeholderContainer.elementName
59 │     ) {
60 │       const start = getAttrOrThrow(element, this.config.placeholderContainer.startAttribute);
61 │       const end = getAttrOrThrow(element, this.config.placeholderContainer.endAttribute);
62 ▶       this.visitPlaceholderContainer(start, element.children, end);
63 ▶     } else if (this.config.inlineElements.indexOf(element.name) !== -1) {
64 ▶       visitAll(this, element.children);
65 │     } else {
66 ▶       throw new ParseError(element.sourceSpan, `Invalid element found in message.`);
67 │     }
68 │   }
69 │ 
70 │   override visitText(text: Text): void {
71 ▶     this.renderer.text(text.value);
72 │   }
```

1. **43〜46 行目：始め、歩き、終わり、結果**

   組み立ては全部 renderer に任せます。`MessageSerializer` は「何に出会ったか」を伝えるだけです。
2. **50〜55 行目：プレースホルダーの要素**

   設定の要素名（XLIFF 1.2 なら `x`）なら、名前の属性（`id`）を読みます。無ければ `getAttrOrThrow` が例外。
3. **56〜62 行目：開きと閉じの組（XLIFF 2.0 の `pc`）**

   開きと閉じの名前を読み、間の子を歩きます。
4. **63〜64 行目：包むだけの要素**

   子を歩くだけ。`<g id="1">Lien</g>` は `Lien` になり、`g` そのものは消えます。
5. **66 行目：それ以外は例外**

   `<span>` や `<b>` を翻訳文に書くと、ここで `Invalid element found in message.` です。
6. **70〜72 行目：テキストはそのまま**

   XML の実体参照（`&lt;`）は XmlParser が戻したあとの値です。

📄 `angular/packages/localize/tools/src/translate/translation_files/message_serialization/message_serializer.ts` L74–103 （▶ の行: 75–76, 78, 82, 84, 86）

```ts
 74 │   override visitExpansion(expansion: Expansion): void {
 75 ▶     this.renderer.startIcu();
 76 ▶     this.renderer.text(`${expansion.switchValue}, ${expansion.type},`);
 77 │     visitAll(this, expansion.cases);
 78 ▶     this.renderer.endIcu();
 79 │   }
 80 │ 
 81 │   override visitExpansionCase(expansionCase: ExpansionCase): void {
 82 ▶     this.renderer.text(` ${expansionCase.value} {`);
 83 │     this.renderer.startContainer();
 84 ▶     visitAll(this, expansionCase.expression);
 85 │     this.renderer.closeContainer();
 86 ▶     this.renderer.text(`}`);
 87 │   }
 88 │ 
 89 │   visitContainedNodes(nodes: Node[]): void {
 90 │     this.renderer.startContainer();
 91 │     visitAll(this, nodes);
 92 │     this.renderer.closeContainer();
 93 │   }
 94 │ 
 95 │   visitPlaceholder(name: string, body: string | undefined): void {
 96 │     this.renderer.placeholder(name, body);
 97 │   }
 98 │ 
 99 │   visitPlaceholderContainer(startName: string, children: Node[], closeName: string): void {
100 │     this.renderer.startPlaceholder(startName);
101 │     this.visitContainedNodes(children);
102 │     this.renderer.closePlaceholder(closeName);
103 │   }
```

ICU に出会うと、75 行目で renderer に「ICU の中に入った」と伝え、76 行目で `VAR_PLURAL, plural,` を、82 行目で各 case の `=0 {` を文字として足し、84 行目で case の中身を歩きます。つまり ICU は**文字列として組み直される**だけで、部品とプレースホルダーには分かれません。ICU を実行時に分けるのは core の `i18n_parse.ts` です（[第 11 回](11-loc-runtime-icu.md)）。

📄 `angular/packages/localize/tools/src/translate/translation_files/message_serialization/target_message_renderer.ts` L15–40 （▶ の行: 16, 19–21, 24–25, 27–28, 30–31, 33, 36）

```ts
15 │ export class TargetMessageRenderer implements MessageRenderer<ɵParsedTranslation> {
16 ▶   private current: MessageInfo = {messageParts: [], placeholderNames: [], text: ''};
17 │   private icuDepth = 0;
18 │ 
19 ▶   get message(): ɵParsedTranslation {
20 ▶     const {messageParts, placeholderNames} = this.current;
21 ▶     return ɵmakeParsedTranslation(messageParts, placeholderNames);
22 │   }
23 │   startRender(): void {}
24 ▶   endRender(): void {
25 ▶     this.storeMessagePart();
26 │   }
27 ▶   text(text: string): void {
28 ▶     this.current.text += text;
29 │   }
30 ▶   placeholder(name: string, body: string | undefined): void {
31 ▶     this.renderPlaceholder(name);
32 │   }
33 ▶   startPlaceholder(name: string): void {
34 │     this.renderPlaceholder(name);
35 │   }
36 ▶   closePlaceholder(name: string): void {
37 │     this.renderPlaceholder(name);
38 │   }
39 │   startContainer(): void {}
40 │   closeContainer(): void {}
```

📄 `angular/packages/localize/tools/src/translate/translation_files/message_serialization/target_message_renderer.ts` L41–65 （▶ の行: 42–43, 49–50, 53–55, 57–58, 61–63）

```ts
41 │   startIcu(): void {
42 ▶     this.icuDepth++;
43 ▶     this.text('{');
44 │   }
45 │   endIcu(): void {
46 │     this.icuDepth--;
47 │     this.text('}');
48 │   }
49 ▶   private normalizePlaceholderName(name: string) {
50 ▶     return name.replace(/-/g, '_');
51 │   }
52 │   private renderPlaceholder(name: string) {
53 ▶     name = this.normalizePlaceholderName(name);
54 ▶     if (this.icuDepth > 0) {
55 ▶       this.text(`{${name}}`);
56 │     } else {
57 ▶       this.storeMessagePart();
58 ▶       this.current.placeholderNames.push(name);
59 │     }
60 │   }
61 ▶   private storeMessagePart() {
62 ▶     this.current.messageParts.push(this.current.text);
63 ▶     this.current.text = '';
64 │   }
65 │ }
```

1. **16 行目：今の部品の文字と、部品の列と、名前の列**

   `text` に文字を貯めていきます（27〜29 行目）。
2. **53〜59 行目：ICU の外のプレースホルダー**

   57 行目で今の文字を部品として閉じ（61〜64 行目）、58 行目で名前を足します。`placeholder`・`startPlaceholder`・`closePlaceholder`（30〜38 行目）はどれもここに来るので、開きと閉じも 1 つずつのプレースホルダーです。
3. **54〜55 行目：ICU の中のプレースホルダー**

   42 行目で深さを数えているので、ICU の中なら部品を閉じず、`{INTERPOLATION}` の文字を足します（`$` は付きません）。これは実行時の ICU の中の補間の書き方で、[第 7 回](07-loc-icu-compile.md)の ICU の文字列と同じ形です。
4. **49〜50 行目：名前の - を \_ に**

   `<x id="MY-NAME"/>` は `MY_NAME` になります。
5. **24〜25・19〜21 行目：最後の部品を閉じて、ɵmakeParsedTranslation**

   部品の数はいつもプレースホルダーより 1 つ多く、空の文字列の部品もあります（`["", "gras", " et ", ""]`）。21 行目の `ɵmakeParsedTranslation` は、部品と名前から `text`（`{$NAME}` の形）と `messageParts` を作る `@angular/localize` の関数で、[第 14 回](14-loc-runtime-translations.md)で読みます。

> **🧪 DEMO — XLIFF 1.2 の &lt;target&gt; を読む**
>
> `<target>` の中身を入れて「読む」を押すと、`MessageSerializer` と `TargetMessageRenderer` の動き（50〜66 行目と 52〜60 行目）を**この章の .ts に移植した関数**で部品と名前に分けます。木を作るのは compiler の `XmlParser` ではなくブラウザの `DOMParser` で、ICU の深さは `{` と `}` を数えて決めます（本物は ICU の文字を組み直すので、空白の付き方が違うことがあります）。そのあと、本物の `ɵmakeParsedTranslation`（21 行目と同じ呼び方）と、JSON のパーサーが使う本物の `ɵparseTranslation` をこのページで読み込んで呼び、2 つの結果を並べます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/loc-translation-parsers)

> [!NOTE]
> **ポイント**
>
> 「ICU の中の補間」の例では、2 つとも部品は 1 つで、名前の列は空です。ICU の中の `{INTERPOLATION}` には `$` が無いので、`ɵparseTranslation` もプレースホルダーとして切りません。「使えない要素」の例は 66 行目の文で止まります。本物ではこれが `serializeErrors` の ERROR になり、ファイル全体が読めなくなります。

## ここまでの呼び出し

- `translateFiles()` — translate/index.ts — *5 つのパーサーでローダーを作る*
  - `TranslationLoader.loadBundles()` — translation\_loader.ts — *ロケールごとに*
    - `mergeBundles()` — translation\_loader.ts — *同じ ID は先のファイル*
      - `loadBundle()` — translation\_loader.ts — *analyze を順に、最初の 1 つで parse*
        - `Xliff1TranslationParser.analyze()` → `canParseXml()` — translation\_utils.ts — *XmlParser で木、根の名前と version*
        - `Xliff1TranslationParser.parse()` — xliff1\_translation\_parser.ts — *hint の木を歩く*
          - `XliffTranslationVisitor.visitTransUnitElement()` — xliff1\_translation\_parser.ts — *id・重複・target か source*
            - `serializeTranslationMessage()` → `parseInnerRange()` — serialize\_translation\_message.ts — *中身を ICU 込みで読み直す*
              - `MessageSerializer.serialize()` → `TargetMessageRenderer` — message\_serialization/ — *部品と名前*
                - `ɵmakeParsedTranslation()` — @angular/localize — *{$NAME} の text と messageParts*

## テストと直し方

### spec と describe

| spec（packages/localize/tools/test/translate/translation\_files/） | describe と主な it |
| --- | --- |
| translation\_loader\_spec.ts | `TranslationLoader` &gt; `loadBundles()`。65 行目「should stop at the first parser that can parse each file」、123 行目「should (ignore・warning・error) on duplicate messages when merging multiple translation files」（`forEach` で 3 本）、148 行目「should warn if the provided locales do not match…」、206 行目「should error if none of the parsers can parse the file」。`runInEachFileSystem` で包まれているので、ファイルシステムの種類ごとに同じ it が走る |
| translation\_parsers/xliff1\_translation\_parser\_spec.ts | `Xliff1TranslationParser` &gt; `analyze()`・`parse()`。287 行目「placeholders containing hyphens」、323 行目「simple ICU expressions」、684 行目の `[structure errors]`（685 行目 target が無く source がある、770 行目 重複）、806 行目の `[message errors]`（807 行目 unknown message tags） |
| translation\_parsers/xliff2\_translation\_parser\_spec.ts・xtb\_translation\_parser\_spec.ts | 同じ形で `[structure errors]`（xliff2 600 行目・xtb 355 行目）と `[message errors]`（727 行目・409 行目） |
| translation\_parsers/simple\_json\_spec.ts・arb\_translation\_parser\_spec.ts | `SimpleJsonTranslationParser`・`SimpleArbTranslationParser`（ARB の describe の名前は「Simple」が付いている）の `analyze()` と `parse()` |
| ../../diagnostics\_spec.ts | `Diagnostics` &gt; `formatDiagnostics` の 4 本 |

### 手元で走らせる

📄 `ターミナル`

```
cd ../angular
pnpm bazel test //packages/localize/tools/test:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=TranslationLoader|TranslationParser|SimpleArbTranslationParser|Diagnostics'
```

📄 `出力（2026-11-03。ログは scratchpad/i18n-logs/e-ch17.log）`

```
==================== Test output for //packages/localize/tools/test:test (shard 2 of 4):
Ran 32 of 537 specs
32 specs, 0 failures
...（shard 1・3・4 も Ran 32。合わせて 128 本）
//packages/localize/tools/test:test                                      PASSED in 0.8s
  Stats over 4 runs: max = 0.8s, min = 0.8s, avg = 0.8s, dev = 0.0s
real 1.35
```

`//packages/localize/tools/test:test` は 4 つの shard に分かれていて、フィルタに合う spec を 4 つに分けて走らせます（`formatDiagnostics` の 4 本で絞ると、各 shard が「Ran 1」でした）。だから本数は 4 つの「Ran」を足した 128 本です。フィルタなしで走らせると、4 つの shard で 159・158・158・158、合わせて 633 本でした（e-tools-all.log）。

### 直すとしたら

- どのパーサーで読むかの判定は各パーサーの `analyze()`、XML の 3 形式は `translation_utils.ts` の `canParseXml`。足すなら同じパーサーの spec の `analyze()` の describe に。
- 翻訳文の中身の読み方は `message_serializer.ts` と `target_message_renderer.ts`、形式ごとの設定は各パーサーの `serializeTranslationMessage` の呼び出し（XLIFF 1.2 なら 162〜165 行目）。足すなら各パーサーの spec の `parse()` の it（323 行目の ICU の形をまねる）。
- ファイルをまたぐ重複とロケールは `translation_loader.ts` の `mergeBundles` と `loadBundle`。spec は translation\_loader\_spec.ts。
- ICU でない波括弧の扱いは #60566（開いている、[第 20 回](20-loc-issues.md)）。9 節の 50 行目と、XLIFF ではエラーになり JSON ではならない違いがそのまま issue の内容です。

## 聞かれそうな質問

**Q. ファイルの形式は拡張子で決まるのですか？**

いいえ。`loadBundle` の 66〜67 行目で、並んだパーサーに名前と中身を見せ、最初に `canParse: true` と答えたもので読みます。拡張子を見るのは XTB（35〜36 行目、`.xtb` か `.xmb`）と JSON（42 行目、`.json`）だけで、XLIFF の 1.2 と 2.0 は根の `version` 属性（5 節の 117〜128 行目）、ARB は `"@@locale"` の文字（58 行目）で決まります。

**Q. &lt;target&gt; を書き忘れた trans-unit はどうなりますか？**

XLIFF 1.2 では 138〜149 行目で WARNING を付けて `<source>` を翻訳として使います。だから翻訳漏れは「元の言語のまま出る」だけで、ビルドは止まりません。`<source>` も無ければ 156 行目の ERROR で、ローダーの 78〜80 行目でファイル全体が例外になります。

**Q. 翻訳文に {title} のような波括弧を書いたら、XLIFF では消え、JSON では残りました。**

XLIFF は 9 節の `parseInnerRange` の 50 行目で中身を ICU として読むので、ICU の形でない `{title}` は XmlParser の ERROR になり、そこまでの文だけが残ります（手元で「Hello {title} account」を読ませると text は `"Hello "` で、error が 2 つでした）。JSON は 8 節の 78 行目で文字列を `ɵparseTranslation` に渡すだけなので、そのまま残ります。`localize-translate` なら ERROR でローダーが止まります。ng build では、CLI のローダーが `parse()` の返す診断を受け取らない（[cli-i18n](../cli/09-cli-i18n.md) の 2 節に引用した load-translations.ts の 32 行目で `locale` と `translations` だけを取り、35 行目で自分の空の `diagnostics` を返す）ので、エラーが表に出ません。これが #60566 の「エラーが出ない」の理由です。

**Q. アプリの翻訳とライブラリの翻訳を 2 つのファイルに分けられますか？**

はい。`loadBundles` の 48 行目のとおり、1 つのロケールにファイルの配列を渡せます。3 節の 146〜155 行目で 1 つ目のファイルに書き足し、同じ ID は**先に書いたファイル**が勝ちます。重複を知らせる重さは `duplicateTranslation` で、148 行目でコンストラクタの `diagnostics` に積まれます。

**Q. XTB だけ、読めない翻訳があっても止まらないのはなぜですか？**

xtb\_translation\_parser.ts の 98〜101 行目で、中身の XML が読めなかった翻訳を warning にして飛ばしているからです（コメントの #14046）。XLIFF の 2 つは同じことが `addErrorsToBundle`（6 節の 169 行目）で ERROR になります。

## 読み終えて

- 形式を決めるのは拡張子ではなく、並んだパーサーの `analyze()`。最初に読めると答えたもので `parse()` し、判定で作った XML の木を `hint` で使い回す。
- パーサーは投げずに `Diagnostics` に積み、ローダーが error のときだけ止める。1 つのファイルの中の重複 ID はいつも error、ファイルをまたぐ重複は `duplicateTranslation` の設定。
- XML の 3 形式は `<target>` の中を ICU 込みで読み直し、`MessageSerializer` が歩いて `TargetMessageRenderer` が部品と名前に分ける。形式の違いは「どの要素がプレースホルダーか」の設定だけ。
- JSON と ARB は `{$NAME}` の文字を `ɵparseTranslation` で切るだけで、中身は確かめない。XLIFF から読んでも同じ `ɵParsedTranslation` になる。

---

← 前: [翻訳ファイルを書く：XLIFF・XMB・JSON・ARB](16-loc-serializers.md)  
次: [ビルドのあとに翻訳を差し込む：localize-translate](18-loc-translate-tool.md) →
