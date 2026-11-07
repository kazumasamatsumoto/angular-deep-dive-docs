[目次](../README.md) › [言語サービスの内側](README.md) › 第 16 回 / 全 20 回

# 色分け：TextMate の文法と意味のトークン

> VS Code のテンプレートの色は、拡張の syntaxes/ にある TextMate の文法（template.json・expression.json・template-blocks.json）で付く。文法を TypeScript で書いて JSON を作る仕組み、bazel の生成と食い違いの検査、スナップショットの spec。言語サービスの semantic\_tokens.ts がコンポーネントの要素名だけを class として返す行と、LSP サーバーにその受け口が無いこと（#60262）。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ls-semantic-tokens)

---

VS Code でテンプレートの `@if` や `{{ … }}` に色が付くのは、言語サービスが動いているからではありません。拡張に入っている **TextMate の文法**（正規表現で文字列に名前を付ける規則）だけで付いています。この章では、その文法を TypeScript で書いて JSON を作る `syntaxes/src/build.ts`、bazel での生成と食い違いの検査、スナップショットの spec を読みます。後半は、言語サービスの側にある `semantic_tokens.ts`（意味のトークン。型の情報を使った色分け）が何に色を付けているか、なぜ issue #60262 が開いたままなのかを、実物の行で確かめます。

読む対象は `vscode-ng-language-service/syntaxes/`（src/ の 9 ファイルと生成された 8 つの JSON、test/）と、`packages/language-service/src/semantic_tokens.ts`（244 行）、`language_service.ts` の `getEncodedSemanticClassifications` です。

1. [1. 全体像](01-ls-overview.md)
2. [2. VS Code クライアント](02-ls-client.md)
3. [3. LSP サーバー](03-ls-server-session.md)
4. [4. tsserver プラグイン](04-ls-ts-plugin.md)
5. [5. CompilerFactory](05-ls-compiler-factory.md)
6. [6. 外部テンプレート](06-ls-external-templates.md)
7. [7. カーソルの位置](07-ls-template-target.md)
8. [8. 診断](08-ls-diagnostics.md)
9. [9. ホバー](09-ls-quick-info.md)
10. [10. 定義へのジャンプ](10-ls-definitions.md)
11. [11. 参照と名前変更](11-ls-references-rename.md)
12. [12. 式の補完](12-ls-completions.md)
13. [13. 要素と属性の補完](13-ls-attribute-completions.md)
14. [14. シグネチャヘルプ](14-ls-signature-help.md)
15. [15. インレイヒント](15-ls-inlay-hints.md)
16. **16. 色分け**（この章）
17. [17. 文書のシンボル](17-ls-document-symbols.md)
18. [18. コード修正](18-ls-code-fixes.md)
19. [19. リファクタリング](19-ls-refactorings.md)
20. [20. issue と PR を読む](20-ls-issues.md)

## 1. 2 種類の色分け

|   | TextMate の文法 | 意味のトークン（semantic tokens） |
| --- | --- | --- |
| 置き場 | `vscode-ng-language-service/syntaxes/*.json` | `packages/language-service/src/semantic_tokens.ts` |
| 動く場所 | VS Code 本体（拡張の package.json の `contributes.grammars` で登録）。サーバーを起動しなくても色が付く | 言語サービス（TypeScript の `getEncodedSemanticClassifications` の形で答える） |
| 知っていること | 文字列の形だけ（正規表現） | コンポーネントかどうか（スコープのディレクティブ） |
| 付けるもの | `@if`・`{{`・式の中の関数名・`template:` の中の HTML など | コンポーネントの要素名だけ（4 節） |

## 2. 文法を TypeScript で書いて JSON を作る

📄 `angular/vscode-ng-language-service/syntaxes/src/types.ts` L9–15 （▶ の行: 10, 14）

```ts
 9 │ export interface GrammarDefinition {
10 ▶   [key: string]: string | RegExp | GrammarDefinition | GrammarDefinition[];
11 │ }
12 │ 
13 │ export interface JsonObject {
14 ▶   [key: string]: string | JsonObject | JsonObject[];
15 │ }
```

📄 `angular/vscode-ng-language-service/syntaxes/src/template.ts` L11–29 （▶ の行: 12–14, 17, 21, 25–26）

```ts
11 │ export const Template: GrammarDefinition = {
12 ▶   scopeName: 'template.ng',
13 ▶   injectionSelector: 'L:text.html -comment -control.block.ng -meta.definition.variable.ng',
14 ▶   patterns: [{include: '#interpolation'}],
15 │   repository: {
16 │     interpolation: {
17 ▶       begin: /{{/,
18 │       beginCaptures: {
19 │         0: {name: 'punctuation.definition.block.ts'},
20 │       },
21 ▶       end: /}}/,
22 │       endCaptures: {
23 │         0: {name: 'punctuation.definition.block.ts'},
24 │       },
25 ▶       contentName: 'expression.ng',
26 ▶       patterns: [{include: 'expression.ng'}],
27 │     },
28 │   },
29 │ };
```

文法の 1 つは、TextMate の JSON と同じ形の TypeScript のオブジェクトです。違いは 10 行目のとおり、値に `RegExp` を書けることです。17 行目の `/{{/` のように、正規表現を JSON の文字列のエスケープを気にせずに書けます。

- 12 行目の `scopeName` がこの文法の名前、13 行目の `injectionSelector` が「どこに差し込むか」です。`L:text.html` は「HTML の文法の中に、HTML の規則より先に（`L:`）差し込む」、`-comment` などは「コメントの中では差し込まない」という意味です。
- 17〜27 行目、`{{` で始まり `}}` で終わる範囲に `expression.ng` という名前を付け、中身は 26 行目で式の文法（`expression.ts` の `expression.ng`、1,032 行）に任せます。

📄 `angular/vscode-ng-language-service/syntaxes/src/template-blocks.ts` L11–34 （▶ の行: 12–13, 22, 27, 33）

```ts
11 │ export const TemplateBlocks: GrammarDefinition = {
12 ▶   scopeName: 'template.blocks.ng',
13 ▶   injectionSelector: 'L:text.html -comment -expression.ng -meta.tag -source.css -source.js',
14 │   patterns: [{include: '#block'}],
15 │   repository: {
16 │     transition: {
17 │       match: '@',
18 │       name: 'keyword.control.block.transition.ng',
19 │     },
20 │ 
21 │     block: {
22 ▶       begin: /(@)(if|else if|else|defer|placeholder|loading|error|switch|for|empty)(?:\s*)/,
23 │       beginCaptures: {
24 │         1: {
25 │           patterns: [{include: '#transition'}],
26 │         },
27 ▶         2: {name: 'keyword.control.block.kind.ng'},
28 │       },
29 │       patterns: [{include: '#blockExpression'}, {include: '#blockBody'}],
30 │       name: 'control.block.ng',
31 │       // The block ends at the close `}` but we don't capture it here because. It's captured instead
32 │       // by the #blockBody.
33 ▶       end: /(?<=\})/,
34 │     },
```

制御フローのブロックは 22 行目の正規表現 1 本で、`@` のあとの名前を並べています。**このスナップショットの並びに `boundary` はありません**。6 節で、これがどうしてそうなったかを git で追います。

📄 `angular/vscode-ng-language-service/syntaxes/src/inline-template.ts` L11–50 （▶ の行: 13, 17, 22, 35, 38, 40, 44–46）

```ts
11 │ export const InlineTemplate: GrammarDefinition = {
12 │   scopeName: 'inline-template.ng',
13 ▶   injectionSelector: 'L:meta.decorator.ts -comment -text.html',
14 │   patterns: [{include: '#inlineTemplate'}],
15 │   repository: {
16 │     inlineTemplate: {
17 ▶       begin: /(template)\s*(:)/,
18 │       beginCaptures: {
19 │         1: {name: 'meta.object-literal.key.ts'},
20 │         2: {name: 'meta.object-literal.key.ts punctuation.separator.key-value.ts'},
21 │       },
22 ▶       end: /(?=,|})/,
23 │       patterns: [{include: '#tsParenExpression'}, {include: '#ngTemplate'}],
24 │     },
25 │ 
26 │     tsParenExpression: {
27 │       begin: /\G\s*(\()/,
28 │       beginCaptures: {1: {name: 'meta.brace.round.ts'}},
29 │       end: /\)/,
30 │       endCaptures: {0: {name: 'meta.brace.round.ts'}},
31 │       patterns: [{include: '#tsParenExpression'}, {include: '#ngTemplate'}],
32 │     },
33 │ 
34 │     ngTemplate: {
35 ▶       begin: /\G\s*([`'"])/,
36 │       beginCaptures: {1: {name: 'string'}},
37 │       // @ts-ignore
38 ▶       end: /\1/,
39 │       endCaptures: {0: {name: 'string'}},
40 ▶       contentName: 'text.html.derivative',
41 │       patterns: [
42 │         // Consume escape sequences first so that an escaped delimiter (e.g. \`)
43 │         // does not terminate the template string prematurely.
44 ▶         {match: /\\[\s\S]/, name: 'constant.character.escape.ts'},
45 ▶         {include: 'text.html.derivative'},
46 ▶         {include: 'template.ng'},
47 │       ],
48 │     },
49 │   },
50 │ };
```

.ts の中の `` template: `…` `` に HTML の色を付けるのがこの文法です。13 行目でデコレータの中（`meta.decorator.ts`）に差し込み、17 行目の `template:` から始めて、35 行目で引用符（`` ` ``・`'`・`"`）を捕まえ、38 行目で同じ引用符（`\1`）で終えます。中身は 40 行目で HTML（`text.html.derivative`）として扱い、45〜46 行目で HTML とテンプレートの文法を入れます。

44 行目は 2026-08-31 の 1d9e445d1a9（aparziale さん、#65493 を閉じた修正）で足された行です。それまでは中身を HTML の文法に渡すだけだったので、テンプレートの中に `` \` ``（エスケープしたバッククォート）があると、38 行目の終わりの規則がそこで当たり、残りのテンプレートが HTML として色付けされなくなっていました。HTML の文法より先に `\\[\s\S]`（バックスラッシュと次の 1 文字）を 1 つのトークンとして食べることで、エスケープした区切りで終わらなくなりました。同じコミットで、35 行目の文字の集合が ``[`|'|"]``（`|` そのものにも当たる）から ``[`'"]`` に直り、inline-styles.ts にも同じ修正が入っています。spec には `test/data/inline-template.ts` に 14 行、スナップショットに 65 行が足されました。

📄 `angular/vscode-ng-language-service/syntaxes/src/build.ts` L23–62 （▶ の行: 26, 28, 30–31, 34, 43, 45, 48, 50, 55, 62）

```ts
23 │ function processGrammar(grammar: GrammarDefinition): JsonObject {
24 │   const processedGrammar: JsonObject = {};
25 │   for (const [key, value] of Object.entries(grammar)) {
26 ▶     if (typeof value === 'string') {
27 │       processedGrammar[key] = value;
28 ▶     } else if (value instanceof RegExp) {
29 │       // Escape backslashes/quote marks and trim the demarcating `/` characters from a regex literal
30 ▶       processedGrammar[key] = value.toString().replace(/^\/|\/$/g, '');
31 ▶     } else if (value instanceof Array) {
32 │       processedGrammar[key] = value.map(processGrammar);
33 │     } else {
34 ▶       processedGrammar[key] = processGrammar(value);
35 │     }
36 │   }
37 │   return processedGrammar;
38 │ }
39 │ 
40 │ // Build a TextMate grammar JSON file from a source TypeScript object
41 │ function build(grammar: GrammarDefinition, filename: string): void {
42 │   const processedGrammar: JsonObject = processGrammar(grammar);
43 ▶   const grammarContent: string = JSON.stringify(processedGrammar, null, '  ') + '\n';
44 │ 
45 ▶   if (!!process.env['JS_BINARY__TARGET']) {
46 │     // Add `_` prefix when running under Bazel so the output filename is different than
47 │     // the source tree to allow for write_source_files targets to refer to both by labels
48 ▶     filename = `_${filename}`;
49 │   }
50 ▶   fs.writeFile(`vscode-ng-language-service/syntaxes/${filename}.json`, grammarContent, (error) => {
51 │     if (error) throw error;
52 │   });
53 │ }
54 │ 
55 ▶ build(Expression, 'expression');
56 │ build(Template, 'template');
57 │ build(InlineTemplate, 'inline-template');
58 │ build(InlineStyles, 'inline-styles');
59 │ build(TemplateBlocks, 'template-blocks');
60 │ build(TemplateTag, 'template-tag');
61 │ build(LetDeclaration, 'let-declaration');
62 ▶ build(HostObjectLiteral, 'host-object-literal');
```

1. **23〜38 行目：`processGrammar`**

   オブジェクトを再帰で歩き、文字列はそのまま（26 行目）、`RegExp` は 30 行目で `toString()` して前後の `/` を消し、配列（31 行目）と入れ子（34 行目）は中へ進みます。
2. **43 行目**

   2 つの空白で字下げした JSON にします。
3. **45〜49 行目**

   bazel の中（`JS_BINARY__TARGET` がある）では、出力の名前の先頭に `_` を付けます。理由は次の BUILD のコメントにあります。
4. **55〜62 行目**

   8 つの文法を 1 つずつ書き出します。

## 3. bazel：生成と「食い違いの検査」

📄 `angular/vscode-ng-language-service/syntaxes/BUILD.bazel` L1–35 （▶ の行: 4, 7–10, 19, 22–24, 30）

```python
 1 │ load("@aspect_rules_js//js:defs.bzl", "js_library", "js_run_binary")
 2 │ load("@bazel_lib//lib:write_source_files.bzl", "write_source_files")
 3 │ 
 4 ▶ js_run_binary(
 5 │     name = "build",
 6 │     outs = [
 7 ▶         # bazel output files names in the output tree are prefixed with `_` so
 8 ▶         # we can refer to both the source files & output files by label in the
 9 ▶         # write_source_files target below.
10 ▶         "_expression.json",
11 │         "_inline-styles.json",
12 │         "_inline-template.json",
13 │         "_template.json",
14 │         "_template-blocks.json",
15 │         "_template-tag.json",
16 │         "_let-declaration.json",
17 │         "_host-object-literal.json",
18 │     ],
19 ▶     tool = "//vscode-ng-language-service/syntaxes/src:build",
20 │ )
21 │ 
22 ▶ write_source_files(
23 ▶     name = "syntaxes",
24 ▶     files = {
25 │         "expression.json": "_expression.json",
26 │         "inline-styles.json": "_inline-styles.json",
27 │         "inline-template.json": "_inline-template.json",
28 │         "template.json": "_template.json",
29 │         "template-blocks.json": "_template-blocks.json",
30 ▶         "template-tag.json": "_template-tag.json",
31 │         "let-declaration.json": "_let-declaration.json",
32 │         "host-object-literal.json": "_host-object-literal.json",
33 │     },
34 │ )
35 │ 
```

1. **4〜20 行目：`js_run_binary(name = "build")`**

   2 節の build.ts を動かし、`_expression.json` などを bazel の出力の木に作ります。7〜9 行目のコメントのとおり、`_` は「ソースの木の JSON」と「出力の木の JSON」を同じディレクトリのラベルで区別するためです。
2. **22〜34 行目：`write_source_files(name = "syntaxes")`**

   `pnpm bazel run //vscode-ng-language-service/syntaxes:syntaxes` で、出力の木の `_x.json` をソースの木の `x.json` に書き写します（syntaxes/README.md の手順）。この規則は同時に、ファイルごとの比較のテスト `syntaxes_0_test` 〜 `syntaxes_7_test` を作ります（`bazel query 'tests(//vscode-ng-language-service/syntaxes/...)'` で確かめました）。たとえば `syntaxes_4_test` は `_template-blocks.json` と `template-blocks.json` を比べます。**src/\*.ts を直したのに JSON を作り直し忘れる、あるいは JSON だけを手で直す、と落ちる**テストです。

## 4. spec：本物の TextMate のエンジンでスナップショットを取る

📄 `angular/vscode-ng-language-service/syntaxes/test/BUILD.bazel` L34–48 （▶ の行: 35–37, 41, 44）

```python
34 │     name = "test",
35 ▶     args = ["syntaxes/test/driver.js"],
36 ▶     chdir = "vscode-ng-language-service",
37 ▶     data = [
38 │         ":data",
39 │         ":dummy",
40 │         ":tests",
41 ▶         "//vscode-ng-language-service:node_modules/vscode-tmgrammar-test",
42 │         "//vscode-ng-language-service:package_json",
43 │         "//vscode-ng-language-service/syntaxes:json",
44 ▶     ],
45 │     node_modules = "//vscode-ng-language-service:node_modules",
46 │     tags = ["unit_test"],
47 │ )
48 │ 
```

📄 `angular/vscode-ng-language-service/syntaxes/test/driver.ts` L39–71 （▶ の行: 40–41, 43, 48–51, 55–56, 59, 64, 66, 68）

```ts
39 │ async function snapshotTest({scopeName, grammarFiles, testFile}: TestCase): Promise<number> {
40 ▶   grammarFiles.push(...DUMMY_GRAMMARS);
41 ▶   const grammarOptions = grammarFiles.reduce((acc, file) => [...acc, '-g', file], [] as string[]);
42 │ 
43 ▶   const resolvedTestFile = process.env.BUILD_WORKSPACE_DIRECTORY
44 │     ? path.join(process.env.BUILD_WORKSPACE_DIRECTORY, 'vscode-ng-language-service', testFile)
45 │     : testFile;
46 │ 
47 │   const options = [
48 ▶     'node_modules/vscode-tmgrammar-test/dist/snapshot.js',
49 ▶     '-s',
50 ▶     scopeName,
51 ▶     ...grammarOptions,
52 │     resolvedTestFile,
53 │   ];
54 │ 
55 ▶   if (process.argv.includes('-u')) {
56 ▶     options.push('-u');
57 │   }
58 │ 
59 ▶   return spawn('node', options, {stdio: 'inherit' /* use parent process IO */}).catch(
60 │     (code) => code,
61 │   );
62 │ }
63 │ 
64 ▶ describe('snapshot tests', () => {
65 │   for (let tc of cases) {
66 ▶     it(`should work for ${tc.name}`, async () => {
67 │       const ec = await snapshotTest(tc);
68 ▶       expect(ec).toBe(0);
69 │     });
70 │   }
71 │ });
```

📄 `angular/vscode-ng-language-service/syntaxes/test/cases.ts` L18–33 （▶ の行: 19–22）

```ts
18 │   {
19 ▶     'name': 'template syntax',
20 ▶     'scopeName': 'template.ng',
21 ▶     'grammarFiles': ['syntaxes/template.json', 'syntaxes/expression.json'],
22 ▶     'testFile': 'syntaxes/test/data/template.html',
23 │   },
24 │   {
25 │     'name': 'block syntax',
26 │     'scopeName': 'template.blocks.ng',
27 │     'grammarFiles': [
28 │       'syntaxes/template-blocks.json',
29 │       'syntaxes/expression.json',
30 │       'syntaxes/template.json',
31 │     ],
32 │     'testFile': 'syntaxes/test/data/template-blocks.html',
33 │   },
```

1. **44 行目**

   spec が読むのは `//vscode-ng-language-service/syntaxes:json`、つまり**ソースの木に置いてある JSON** です。src/\*.ts から作り直した結果ではありません。src と JSON の一致は 3 節の比較のテストの役目です。
2. **48〜53 行目**

   外部の道具 `vscode-tmgrammar-test` の `snapshot.js` を子プロセスで動かします。`-s` が土台の文法の名前、`-g` が読む文法のファイルです。
3. **40 行目**

   HTML や TypeScript の文法の代わりに、`test/dummy/` の「名前だけの文法」（`html.tmLanguage-dummy.json` は `scopeName: "text.html.derivative"` だけ）を足します。だからスナップショットは HTML の部分には名前を付けず、Angular の文法の部分だけを写します。
4. **55〜57 行目**

   `-u` を付けるとスナップショットを書き直します（README の `pnpm bazel run //vscode-ng-language-service/syntaxes/test:test -- -u`）。
5. **64〜70 行目**

   cases.ts の 1 件が jasmine の it 1 本です。8 件あります。

📄 `angular/vscode-ng-language-service/syntaxes/test/data/template.html.snap` L1–21 （▶ の行: 1–3, 5, 7, 20）

```
 1 ▶ ><!-- Interpolation test -->
 2 ▶ #^^^^^^^^^^^^^^^^^^^^^^^^^^^^ template.ng
 3 ▶ ><div>{{ call(1 + 2 + 3) }}</div>
 4 │ #^^^^^ template.ng
 5 ▶ #     ^^ template.ng punctuation.definition.block.ts
 6 │ #       ^ template.ng expression.ng
 7 ▶ #        ^^^^ template.ng expression.ng entity.name.function.ts
 8 │ #            ^ template.ng expression.ng meta.brace.round.ts
 9 │ #             ^ template.ng expression.ng constant.numeric.decimal.ts
10 │ #              ^ template.ng expression.ng
11 │ #               ^ template.ng expression.ng keyword.operator.arithmetic.ts
12 │ #                ^ template.ng expression.ng
13 │ #                 ^ template.ng expression.ng constant.numeric.decimal.ts
14 │ #                  ^ template.ng expression.ng
15 │ #                   ^ template.ng expression.ng keyword.operator.arithmetic.ts
16 │ #                    ^ template.ng expression.ng
17 │ #                     ^ template.ng expression.ng constant.numeric.decimal.ts
18 │ #                      ^ template.ng expression.ng meta.brace.round.ts
19 │ #                       ^ template.ng expression.ng
20 ▶ #                        ^^ template.ng punctuation.definition.block.ts
21 │ #                          ^^^^^^^ template.ng
```

スナップショットの形は、`>` で始まる行がテストのファイルの 1 行、その下の `#` の行が「`^` の列に付いた名前の重なり」です。5 行目は 3 行目の `<div>` の直後の `{{` に `template.ng punctuation.definition.block.ts`、7 行目は `call` に `entity.name.function.ts`（関数名の色）が付いたことを表します。文法を変えたら、このファイルの差分を読めば「どの文字の色が変わるか」がわかります。

## 5. 意味のトークン：semantic\_tokens.ts は何に色を付けるか

📄 `angular/packages/language-service/src/semantic_tokens.ts` L50–88 （▶ の行: 51, 54–55, 63, 71, 74, 82, 87）

```ts
50 │ /**
51 ▶  * see https://github.com/microsoft/TypeScript/blob/c85e626d8e17427a6865521737b45ccbbe9c78ef/src/services/classifier2020.ts#L49
52 │  */
53 │ export const enum TokenEncodingConsts {
54 ▶   typeOffset = 8,
55 ▶   modifierMask = (1 << typeOffset) - 1,
56 │ }
57 │ 
58 │ /**
59 │  * Token types extended from TypeScript
60 │  * see https://github.com/microsoft/TypeScript/blob/c85e626d8e17427a6865521737b45ccbbe9c78ef/src/services/classifier2020.ts#L55
61 │  */
62 │ export const enum TokenType {
63 ▶   class,
64 │   enum,
65 │   interface,
66 │   namespace,
67 │   typeParameter,
68 │   type,
69 │   parameter,
70 │   variable,
71 ▶   enumMember,
72 │   property,
73 │   function,
74 ▶   member,
75 │ }
76 │ 
77 │ /**
78 │  * Token modifiers extended from TypeScript
79 │  * see https://github.com/microsoft/TypeScript/blob/c85e626d8e17427a6865521737b45ccbbe9c78ef/src/services/classifier2020.ts#L71
80 │  */
81 │ export const enum TokenModifier {
82 ▶   declaration,
83 │   static,
84 │   async,
85 │   readonly,
86 │   defaultLibrary,
87 ▶   local,
88 │ }
```

種類（62〜75 行目）と修飾（81〜88 行目）は、51 行目のリンク先の TypeScript の `classifier2020.ts` と同じ並びです。TypeScript の意味のトークンと同じ番号で答えれば、エディタ側は TypeScript のものと同じ表で色を決められるからです。符号化は 54〜55 行目のとおり、下の 8 ビットが修飾のビットの集まり、その上が「種類の番号 + 1」です。

📄 `angular/packages/language-service/src/semantic_tokens.ts` L90–122 （▶ の行: 96, 98–99, 102, 119）

```ts
 90 │ export function getClassificationsForTemplate(
 91 │   compiler: NgCompiler,
 92 │   typeCheckInfo: TypeCheckInfo,
 93 │   range: ts.TextSpan,
 94 │ ): ts.Classifications {
 95 │   const templateTypeChecker = compiler.getTemplateTypeChecker();
 96 ▶   const potentialTags = templateTypeChecker.getElementsInFileScope(typeCheckInfo.declaration);
 97 │ 
 98 ▶   const visitor = new ClassificationVisitor(potentialTags, range);
 99 ▶   visitor.visitAll(typeCheckInfo.nodes);
100 │ 
101 │   return {
102 ▶     spans: visitor.getSpans(),
103 │     endOfLineState: ts.EndOfLineState.None,
104 │   };
105 │ }
106 │ 
107 │ class ClassificationVisitor implements TmplAstVisitor {
108 │   private spans: number[] = [];
109 │   constructor(
110 │     private tags: Map<string, PotentialDirective | null>,
111 │     private range: ts.TextSpan,
112 │   ) {}
113 │ 
114 │   getSpans(): number[] {
115 │     return this.spans;
116 │   }
117 │ 
118 │   visit(node: TmplAstNode | null) {
119 ▶     if (node && this.rangeIntersectsWith(node.sourceSpan)) {
120 │       node.visit(this);
121 │     }
122 │   }
```

📄 `angular/packages/language-service/src/semantic_tokens.ts` L124–159 （▶ の行: 126, 129–130, 132–133, 136, 138–139, 156–158）

```ts
124 │   visitElement(element: TmplAstElement) {
125 │     const tag = element.name;
126 ▶     const potentialDirective = this.tags.get(tag);
127 │     // prevent classification of non-component directives that would be applied
128 │     // to this element due to a matching selector
129 ▶     const isComponent = potentialDirective && potentialDirective.isComponent;
130 ▶     const classification = this.classifyAs(TokenType.class);
131 │ 
132 ▶     if (isComponent && this.rangeIntersectsWith(element.startSourceSpan)) {
133 ▶       this.spans.push(element.startSourceSpan.start.offset + 1, tag.length, classification);
134 │     }
135 │ 
136 ▶     this.visitAll(element.children);
137 │ 
138 ▶     if (isComponent && !element.isSelfClosing && this.rangeIntersectsWith(element.endSourceSpan!)) {
139 ▶       this.spans.push(element.endSourceSpan!.start.offset + 2, tag.length, classification);
140 │     }
141 │   }
142 │ 
143 │   visitContent(content: TmplAstContent) {
144 │     this.visitAll(content.children);
145 │   }
146 │ 
147 │   visitContentBlock(block: TmplAstContentBlock) {
148 │     this.visitAll(block.children);
149 │   }
150 │ 
151 │   visitVariable(variable: TmplAstVariable) {}
152 │   visitReference(reference: TmplAstReference) {}
153 │   visitTextAttribute(attribute: TmplAstTextAttribute) {}
154 │   visitBoundAttribute(attribute: TmplAstBoundAttribute) {}
155 │   visitBoundEvent(attribute: TmplAstBoundEvent) {}
156 ▶   visitText(text: TmplAstText) {}
157 ▶   visitBoundText(text: TmplAstBoundText) {}
158 ▶   visitIcu(icu: TmplAstIcu) {}
159 │ 
```

📄 `angular/packages/language-service/src/semantic_tokens.ts` L226–244 （▶ の行: 226–227, 238, 242）

```ts
226 ▶   visitComponent(component: TmplAstComponent) {}
227 ▶   visitDirective(directive: TmplAstDirective) {}
228 │ 
229 │   visitAll(children: TmplAstNode[]) {
230 │     for (const child of children) {
231 │       this.visit(child);
232 │     }
233 │   }
234 │ 
235 │   private rangeIntersectsWith(span: ParseSourceSpan) {
236 │     const start = span.start.offset;
237 │     const length = span.end.offset - start;
238 ▶     return ts.textSpanIntersectsWith(this.range, start, length);
239 │   }
240 │ 
241 │   private classifyAs(type: TokenType, modifiers: number = 0) {
242 ▶     return ((type + 1) << TokenEncodingConsts.typeOffset) + modifiers;
243 │   }
244 │ }
```

1. **96 行目：スコープの中の要素名の表**

   `getElementsInFileScope`（checker.ts:1317）は、コンポーネントのスコープにあるディレクティブのうち selector に要素名を持つものを「要素名 → ディレクティブ」の表にします（[第 13 回](13-ls-attribute-completions.md)の `getPotentialElementTags` から DOM の要素名とスコープの外の候補を除いたもの）。
2. **126〜133 行目：コンポーネントの開きタグの名前**

   要素名で表を引き、129 行目でそれが**コンポーネント**のときだけ、133 行目で `[開始, 長さ, 符号]` の 3 つの数を配列に足します。開始は `<` の次の文字です。`selector: 'button'` のようなディレクティブは 127〜128 行目のコメントのとおり除きます。
3. **136〜140 行目：子を見てから閉じタグの名前**

   自己終了でなければ閉じタグ（`</` の次）にも同じ種類を付けます。
4. **151〜158 行目・226〜227 行目：見ないもの**

   変数・参照・属性・束縛・補間・ICU・`@let`・selectorless のコンポーネント（`TmplAstComponent`）は空のメソッドです。**色を付けるのは「コンポーネントの要素名を `class` として」の 1 種類だけ**で、`@for` の変数やメンバーには何も付けません。
5. **119・238 行目：要求された範囲と重なる節点だけ**

   242 行目の `classifyAs` は `((type + 1) << 8) + modifiers` で、`class`（0）なら 256 です。

### 言語サービスの入口と、TypeScript への返し方

📄 `angular/packages/language-service/src/language_service.ts` L443–475 （▶ の行: 448, 459–460, 463, 470–472）

```ts
443 │   getEncodedSemanticClassifications(
444 │     fileName: string,
445 │     span: ts.TextSpan,
446 │     format: ts.SemanticClassificationFormat | undefined,
447 │   ): ts.Classifications {
448 ▶     return this.withCompilerAndPerfTracing(PerfPhase.LSSemanticClassification, (compiler) => {
449 │       return this.getEncodedSemanticClassificationsImpl(fileName, span, format, compiler);
450 │     });
451 │   }
452 │ 
453 │   private getEncodedSemanticClassificationsImpl(
454 │     fileName: string,
455 │     span: ts.TextSpan,
456 │     format: ts.SemanticClassificationFormat | undefined,
457 │     compiler: NgCompiler,
458 │   ): ts.Classifications {
459 ▶     if (format == ts.SemanticClassificationFormat.Original) {
460 ▶       return {spans: [], endOfLineState: ts.EndOfLineState.None};
461 │     }
462 │ 
463 ▶     if (isTypeScriptFile(fileName)) {
464 │       const sf = compiler.getCurrentProgram().getSourceFile(fileName);
465 │       if (sf === undefined) {
466 │         return {spans: [], endOfLineState: ts.EndOfLineState.None};
467 │       }
468 │ 
469 │       const classDeclarations: ts.ClassDeclaration[] = [];
470 ▶       sf.forEachChild((node: ts.Node) => {
471 ▶         if (ts.isClassDeclaration(node)) {
472 ▶           classDeclarations.push(node);
473 │         }
474 │       });
475 │ 
```

📄 `angular/packages/language-service/src/language_service.ts` L476–512 （▶ の行: 476, 478, 488, 499, 505, 510）

```ts
476 ▶       const hasInlineTemplate = (classDecl: ts.ClassDeclaration) => {
477 │         const resources = compiler.getDirectiveResources(classDecl);
478 ▶         return resources && resources.template && !isExternalResource(resources.template);
479 │       };
480 │ 
481 │       const typeCheckInfos: TypeCheckInfo[] = [];
482 │       const templateChecker = compiler.getTemplateTypeChecker();
483 │ 
484 │       for (const classDecl of classDeclarations) {
485 │         if (!hasInlineTemplate(classDecl)) {
486 │           continue;
487 │         }
488 ▶         const template = templateChecker.getTemplate(classDecl);
489 │         if (template !== null) {
490 │           typeCheckInfos.push({
491 │             nodes: template,
492 │             declaration: classDecl,
493 │           });
494 │         }
495 │       }
496 │ 
497 │       const spans = [];
498 │       for (const templInfo of typeCheckInfos) {
499 ▶         const classifications = getClassificationsForTemplate(compiler, templInfo, span);
500 │         spans.push(...classifications.spans);
501 │       }
502 │ 
503 │       return {spans, endOfLineState: ts.EndOfLineState.None};
504 │     } else {
505 ▶       const typeCheckInfo = getTypeCheckInfoAtPosition(fileName, span.start, compiler);
506 │       if (typeCheckInfo === undefined) {
507 │         return {spans: [], endOfLineState: ts.EndOfLineState.None};
508 │       }
509 │ 
510 ▶       return getClassificationsForTemplate(compiler, typeCheckInfo, span);
511 │     }
512 │   }
```

📄 `angular/packages/language-service/src/language_service.ts` L514–523 （▶ の行: 515–516, 522）

```ts
514 │   getTokenTypeFromClassification(classification: number): number | undefined {
515 ▶     if (classification > TokenEncodingConsts.modifierMask) {
516 ▶       return (classification >> TokenEncodingConsts.typeOffset) - 1;
517 │     }
518 │     return undefined;
519 │   }
520 │ 
521 │   getTokenModifierFromClassification(classification: number) {
522 ▶     return classification & TokenEncodingConsts.modifierMask;
523 │   }
```

1. **459〜461 行目**

   古い形式（`SemanticClassificationFormat.Original`）には答えません。2020 形式（`TwentyTwenty`）だけです。
2. **463〜503 行目：.ts のファイル**

   470〜474 行目の `sf.forEachChild` はファイルの**一番上の段**のクラスだけを集めます（関数の中で宣言したクラスは見ない）。476〜479 行目で `template:` を直接書いたコンポーネントに絞り、それぞれのテンプレートで 5 節の関数を呼びます。
3. **504〜511 行目：.html のファイル**

   範囲の始まりの位置から、そのテンプレートのコンポーネントを決めて呼びます。
4. **514〜523 行目**

   tsserver は 3 つの数の 3 つ目（符号）を、この 2 つの関数で「種類の番号」と「修飾のビット」に分けて LSP の形にします。256 なら `(256 >> 8) - 1 = 0`（`class`）と修飾 0 です。

> **🧪 DEMO 1 — classifyAs と getTokenTypeFromClassification の計算**
>
> semantic\_tokens.ts の 242 行目と language\_service.ts の 515〜522 行目の式をそのまま書いたものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ls-semantic-tokens)

> **🧪 DEMO 2 — ClassificationVisitor.visitElement の移植 + 本物の parseTemplate（@angular/compiler 22.1.6）**
>
> 本物はスコープのディレクティブから「どの要素名がコンポーネントか」を決めますが（96・129 行目）、ここでは入力欄の名前の一覧で代用します。`button` のようにディレクティブの要素名でも、一覧に入れなければ色は付きません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ls-semantic-tokens)

## 6. issue と git の記録

### #60262 が開いたままの理由

#60262「Add support for semantic tokens in the language service」（2025-03-07、JannikLassahn さん、open）は、本人が同じ日に PR #60260 を出し、2025-06-24 に 20c1f991e63 として main に入りました（GitHub の表示は「closed」で、取り込みの記録はコメントにあります）。PR の説明は「いまはコンポーネントのタグを `class` として色付けするだけ」で、5 節で読んだ実装の範囲と同じです。PR のコメントで本人は「この機能には vscode-ng-language-service の変更が要る」と書き、拡張の側を試したフォークを示しています。

このスナップショット（拡張は angular/angular に移った後）の拡張を見ると、LSP サーバーの側に意味のトークンの入口がありません。`server/src` を `semantic` で grep すると診断の行しか当たらず、サーバーが返す能力の宣言（handlers/initialization.ts:20〜61 の `capabilities`）にも `semanticTokensProvider` がありません。言語サービスの実装に届くのは、tsserver プラグインとして読み込まれ、エディタが tsserver に意味の分類を求めたとき（ts\_plugin.ts:125〜141。.ts なら Angular と TypeScript の結果をつなぐ）だけです。拡張の package.json にも `typescriptServerPlugins` の宣言はありません（grep で 0 件）。つまり言語サービスの部品はあるのに、VS Code の拡張からそれを呼ぶ道がまだ無い、というのが issue が開いている状態と一致する読み方です。issue が求めている「メンバー・変数」の色も、5 節のとおりまだありません。

### #62697：ICU の `{{{` の色

#62697（2025-07-17、open）は、`one {{{count}} Bundle}` のような ICU の式で、3 つ目の波括弧が赤くなり、括弧の対応も崩れるという報告です。atscott さんが「vscode-ng-language-service の #1991 と実質同じ」とコメントしています。TextMate の文法には ICU の規則がありません（`syntaxes/src` を `plural`・`icu` で grep して 0 件）。2 節の template.ts の 17 行目は最初の `{{` で補間を始めるので、Angular のパーサが「ICU の `{` + 補間 `{{count}}`」と読むところを、文法は「補間 `{{` + 式 `{count` + `}}`」と読みます。手元で、リポジトリの `vscode-tmgrammar-test` を scratchpad のファイルに対して動かし（`-s template.ng -g syntaxes/template.json -g syntaxes/expression.json`）、行の先頭を 0 として 6〜7 文字目の `{{` が補間の始まり、8 文字目の `{` が名前の付かない式の中の文字、14〜15 文字目の `}}` が補間の終わりになることを確かめました（ICU の `}` は補間の外に残ります）。意味のトークンの側も 158 行目の `visitIcu` が空なので、ICU の中には何も付けません。直すなら TextMate の文法（template.ts か新しい文法）です。

### @boundary の色が消えた経緯

2026-04-10 の f4a5650ed9c（Alex Rickabaugh さん「add support for @boundary blocks」#70463）は、言語サービスの各所と一緒に `syntaxes/template-blocks.json` を 19 行変えて、22 行目の並びに `boundary` を、式に `when` の規則を足しました。**このとき src/template-blocks.ts は変わっていません**（`git show --stat` で JSON だけ）。その後 2026-08-28 の d470afa8b2f（同じ #70463 の SSR のテストを足すコミット）の差分に template-blocks.json の 19 行が入っていて、`boundary` と `when` の規則が消え、JSON は src から作った形に戻っています。いまの `syntaxes_4_test`（3 節）は src と JSON が一致しているので通りますが（9 節）、`@boundary` には色が付きません。scratchpad で `@boundary { … }` と `@defer { … }` を並べてスナップショットを取ると、`@defer` には `keyword.control.block.kind.ng` が付き、`@boundary` には何も付きませんでした。main では 2026-09-21 の 8c6e6a52896「add syntax highlighting for @boundary block」が**src/template-blocks.ts の側**に `boundary` を足しています（gh で確認。このスナップショットより後）。「JSON は生成物なので src を直す」（syntaxes/README.md の冒頭の太字）を守らないと、次に誰かが作り直したときに消える、という実例です。

## 7. テストと直し方

📄 `angular/packages/language-service/test/semantic_tokens_spec.ts` L164–186 （▶ の行: 166–167, 172, 178, 184）

```ts
164 │   it('should exclude non-component directives', () => {
165 │     const template = `
166 ▶     <button>Test</button>
167 ▶     <button test>Test</button>
168 │     `;
169 │     const {templateFile} = setup(template, '', {
170 │       'ButtonDirective': `
171 │         @Directive({
172 ▶           selector: "button"
173 │         })
174 │         export class ButtonDirective {}
175 │       `,
176 │       'TestDirective': `
177 │         @Directive({
178 ▶           selector: "[test]"
179 │         })
180 │         export class TestDirective {}
181 │       `,
182 │     });
183 │     const actual = templateFile.getEncodedSemanticClassifications();
184 ▶     expectClassifications(templateFile, actual);
185 │   });
186 │ });
```

📄 `angular/packages/language-service/test/semantic_tokens_spec.ts` L276–292 （▶ の行: 281, 285–286, 288–290）

```ts
276 │ function expectClassifications(
277 │   buffer: OpenBuffer,
278 │   actual: ts.Classifications,
279 │   ...expected: TestClassification[]
280 │ ) {
281 ▶   expect(actual.spans.length).toBe(expected.length * 3);
282 │   expect(actual.endOfLineState).toBe(ts.EndOfLineState.None);
283 │ 
284 │   for (const expectedToken of expected) {
285 ▶     const {start, length, type} = findTokenAtPosition(actual.spans, expectedToken.position);
286 ▶     const text = buffer.contents.substring(start, start + length);
287 │ 
288 ▶     expect(start).toBe(expectedToken.position);
289 ▶     expect(text).toBe(expectedToken.text);
290 ▶     expect(type).toBe(expectedToken.type);
291 │   }
292 │ }
```

意味のトークンの spec は `packages/language-service/test/semantic_tokens_spec.ts`（373 行）の `describe('semantic tokens')`（:14、it 5 本）です。5 本は「古い形式なら空」「外部テンプレートで、入れ子・ng-template・ng-content・@defer・@switch・@for・@if の中のコンポーネント」「インラインのテンプレート」「範囲の中だけ」と、上の「コンポーネントでないディレクティブは除く」です。172 行目の `selector: "button"` のディレクティブがあっても、184 行目で 1 つもトークンが無いことを確かめます。確かめ方は 281 行目で「3 つの数 × 期待の数」の長さ、285〜290 行目で位置・文字列・種類の名前です。

TextMate の文法の spec は 4 節の `//vscode-ng-language-service/syntaxes/test:test`（8 本）と、3 節の比較のテスト `syntaxes_0_test`〜`syntaxes_7_test` です。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/language-service/test:test \
  --nocache_test_results --test_output=all "--test_arg=--filter=semantic tokens"
pnpm bazel test //vscode-ng-language-service/syntaxes/test:test \
  //vscode-ng-language-service/syntaxes:syntaxes_4_test \
  --nocache_test_results --test_output=all
```

📄 `出力（抜粋。2026-11-03 に実行。ログは scratchpad/ls-logs/d-semantic.log と d-syntaxes.log）`

```
（semantic tokens）
Ran 1 of 685 specs / Ran 1 of 685 specs / Ran 1 of 685 specs / Ran 2 of 686 specs
//packages/language-service/test:test                                    PASSED in 1.7s

（syntaxes）
==================== Test output for //vscode-ng-language-service/syntaxes/test:test:
Started
✓ syntaxes/test/data/template-tag.html run successfully.
.✓ syntaxes/test/data/inline-styles.ts run successfully.
.✓ syntaxes/test/data/expression.html run successfully.
.✓ syntaxes/test/data/let-declaration.html run successfully.
.✓ syntaxes/test/data/template-blocks.html run successfully.
.grammar not found for "source.ts"
✓ syntaxes/test/data/host-object-literal.ts run successfully.
.✓ syntaxes/test/data/template.html run successfully.
.✓ syntaxes/test/data/inline-template.ts run successfully.
.
8 specs, 0 failures
Finished in 0.82 seconds
//vscode-ng-language-service/syntaxes:syntaxes_4_test                    PASSED in 0.4s
//vscode-ng-language-service/syntaxes/test:test                          PASSED in 1.0s
```

1. **件数**

   意味のトークンは 1 + 1 + 1 + 2 = 5 本でファイルの it と一致。文法は 8 本で cases.ts の 8 件と一致し、`syntaxes_4_test` も通りました。出力の `grammar not found for "source.ts"` は host-object-literal の文法が TypeScript の文法を参照していて、dummy にそれが無いという道具の表示で、テストは通っています。
2. **文法を直すとしたら**

   src/\*.ts を直す → `pnpm bazel run //vscode-ng-language-service/syntaxes:syntaxes` で JSON を作り直す → `test/data/` に例を足して `pnpm bazel run //vscode-ng-language-service/syntaxes/test:test -- -u` でスナップショットを更新し、差分を読む、の順です。1d9e445d1a9 がこの形の手本です（src・JSON・テストのデータ・スナップショットの 4 つが 1 つのコミットに入っている）。
3. **意味のトークンを広げるとしたら**

   `ClassificationVisitor` の空のメソッド（151〜158 行目）に種類を足すのが言語サービスの側の入口で、spec は semantic\_tokens\_spec.ts に it を足します。ただしこの章の 6 節のとおり、VS Code に届けるには LSP サーバーの側（`semanticTokensProvider` の宣言と、`textDocument/semanticTokens` の受け口）が別に要ります。#60262 を読むときは「どの層の話か」を分けて読みます（[第 20 回](20-ls-issues.md)）。

- 👤 `テンプレートを開く` — VS Code
  - `TextMate のエンジン ← syntaxes/*.json（contributes.grammars）` — VS Code 本体 — *サーバー無しで色*
    - `build.ts の processGrammar` — syntaxes/src — *bazel の js\_run\_binary で生成、write\_source\_files で検査*
  - `tsserver の意味の分類 → ts_plugin.getEncodedSemanticClassifications` — language-service/src/ts\_plugin.ts — *プラグインとして読まれたときだけ*
    - `LanguageService.getEncodedSemanticClassificationsImpl` — language\_service.ts
      - `getClassificationsForTemplate → ClassificationVisitor.visitElement` — semantic\_tokens.ts — *コンポーネントの要素名を class に*

## 聞かれそうな質問

**Q. Angular の言語サーバーが起動する前から `@if` に色が付くのはなぜですか？**

色は TextMate の文法で付いていて、VS Code 本体が JSON（syntaxes/\*.json）を読んで正規表現で当てているからです。`@if` の規則は template-blocks.ts の 22 行目です。

**Q. syntaxes/\*.json を直接直してはいけないのはなぜですか？**

生成物だからです。build.ts（23〜62 行目）が src/\*.ts から作り、BUILD.bazel の 22〜34 行目の比較のテストが src と JSON の一致を見ます。JSON だけを直すと、作り直したときに消えます。`@boundary` の色がこの形で消えています（6 節）。

**Q. 言語サービスの意味のトークンは何に色を付けますか？**

スコープにあるコンポーネントの要素名（開きタグと閉じタグ）だけで、種類は `class` です（semantic\_tokens.ts の 129〜139 行目）。`selector` が要素名でもコンポーネントでないディレクティブには付けません（spec の 164〜185 行目）。

**Q. 符号の 256 は何ですか？**

`((TokenType.class + 1) << 8) + 0` です（242 行目）。下の 8 ビットが修飾、上が種類の番号 + 1 で、TypeScript の classifier2020 と同じ符号化です（53〜56 行目）。tsserver は language\_service.ts の 516・522 行目で分け直します。

**Q. #60262 は実装が入ったのに、なぜ開いたままですか？**

言語サービスの部品（20c1f991e63）はありますが、VS Code の拡張の LSP サーバーに意味のトークンの受け口と能力の宣言が無く、拡張から呼ぶ道が無いからです（6 節で grep して確かめた範囲）。実装の範囲もコンポーネントのタグだけで、issue の求めるメンバーや変数の色はまだありません。

## 読み終えて

- テンプレートの色のほとんどは TextMate の文法。src/\*.ts を build.ts で JSON にし、bazel の write\_source\_files が src と JSON の一致をテストする。
- 文法の spec は本物の TextMate のエンジン（vscode-tmgrammar-test）でスナップショットを取る。HTML の文法は dummy なので、写るのは Angular の部分だけ。
- 言語サービスの semantic\_tokens.ts は、コンポーネントの要素名を class として返すだけ。TypeScript と同じ符号化で、tsserver プラグインの道でしか呼ばれない。
- #60262 は「部品はあるが拡張から呼ぶ道が無い」、#62697 は「TextMate に ICU の規則が無い」。どの層の話かを分けて読む。
- JSON だけを直した変更は、作り直しで消える（@boundary）。直すのは常に src。

---

← 前: [インレイヒント：テンプレートに型を薄く書き足す](15-ls-inlay-hints.md)  
次: [文書のシンボルと折りたたみ](17-ls-document-symbols.md) →
