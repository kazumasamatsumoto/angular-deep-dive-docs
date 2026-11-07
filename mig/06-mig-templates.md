[目次](../README.md) › [マイグレーションの内側](README.md) › 第 6 回 / 全 20 回

# テンプレートを見つけて解析する

> マイグレーションがコンポーネントのテンプレートを見つける仕組み（インラインの template の文字列と templateUrl の .html）、ng\_component\_template.ts・parse\_html.ts・template\_ast\_visitor.ts。テンプレートの中の位置をファイルの中の位置に直す計算と、行と列に直す line\_mappings.ts。NgCompiler の TemplateTypeChecker を使うマイグレーションとの違い。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-templates)

---

テンプレートを書き換えるマイグレーションは、まずコンポーネントのテンプレートを見つけ、文字列として取り出し、解析してノードの範囲を得ます。この章では、`@Component` の `template` と `templateUrl` から文字列と「その文字列がファイルの何文字目から始まるか」を取り出す `NgComponentTemplateVisitor`、HTML の AST を作る `parseTemplate`、位置を行と列に直す `line_mappings.ts` を 1 ステップずつ読みます。最後に、コンパイラの `TemplateTypeChecker` からテンプレートを受け取る signal-migration との違いを確かめます。

読む対象は `packages/core/schematics/utils/` の `ng_component_template.ts`・`extract_metadata.ts`・`ng_decorators.ts`・`typescript/imports.ts`・`parse_html.ts`・`template_ast_visitor.ts`・`line_mappings.ts` です。

1. [1. 全体像](01-mig-overview.md)
2. [2. 入口と配布物](02-mig-entry-bundles.md)
3. [3. プログラムを作る](03-mig-program.md)
4. [4. Tsurge](04-mig-tsurge.md)
5. [5. 置き換え](05-mig-replacements.md)
6. **6. テンプレート**（この章）
7. [7. signal input の段階](07-mig-signal-input-passes.md)
8. [8. 参照の書き換え](08-mig-signal-input-references.md)
9. [9. 移行できない入力](09-mig-signal-input-incompatible.md)
10. [10. signal クエリ](10-mig-signal-queries.md)
11. [11. output()](11-mig-output.md)
12. [12. 制御フロー](12-mig-control-flow.md)
13. [13. inject()](13-mig-inject.md)
14. [14. テンプレートの書き換え](14-mig-template-rewrites.md)
15. [15. 使っていない import](15-mig-cleanup-imports.md)
16. [16. ルーティング](16-mig-routing.md)
17. [17. v22（1）既定](17-mig-v22-defaults.md)
18. [18. v22（2）?.](18-mig-v22-safe-navigation.md)
19. [19. テスト](19-mig-testing.md)
20. [20. issue と PR を読む](20-mig-issues.md)

## 1. 見つけた結果の形：ResolvedTemplate

📄 `angular/packages/core/schematics/utils/ng_component_template.ts` L16–36 （▶ の行: 18, 20, 22, 24, 26, 32）

```ts
16 │ export interface ResolvedTemplate {
17 │   /** Class declaration that contains this template. */
18 ▶   container: ts.ClassDeclaration;
19 │   /** File content of the given template. */
20 ▶   content: string;
21 │   /** Start offset of the template content (e.g. in the inline source file) */
22 ▶   start: number;
23 │   /** Whether the given template is inline or not. */
24 ▶   inline: boolean;
25 │   /** Path to the file that contains this template. */
26 ▶   filePath: string | AbsoluteFsPath;
27 │   /**
28 │    * Gets the character and line of a given position index in the template.
29 │    * If the template is declared inline within a TypeScript source file, the line and
30 │    * character are based on the full source file content.
31 │    */
32 ▶   getCharacterAndLineOfPosition: (pos: number) => {
33 │     character: number;
34 │     line: number;
35 │   };
36 │ }
```

1 つのテンプレートについて、20 行目の `content`（テンプレートの文字列そのもの）と 22 行目の `start`（その文字列が、26 行目の `filePath` のファイルの何文字目から始まるか）を持ちます。この 2 つがこの章の中心です。**テンプレートの中の位置 + `start` = ファイルの中の位置**になります（4 節）。18 行目の `container` はテンプレートを持つクラス、24 行目の `inline` は .ts の中に書かれたものかどうかです。32 行目の `getCharacterAndLineOfPosition` は行と列を返す関数ですが、2026-11-03 のスナップショットでは `packages/` の中に呼んでいる場所がありません（`grep -rn getCharacterAndLineOfPosition packages` は定義の 3 か所だけ）。

## 2. クラスを探し、@Component かを確かめる

📄 `angular/packages/core/schematics/utils/ng_component_template.ts` L42–61 （▶ の行: 47, 50–51, 54, 58–59）

```ts
42 │ export class NgComponentTemplateVisitor {
43 │   resolvedTemplates: ResolvedTemplate[] = [];
44 │ 
45 │   private fs = getFileSystem();
46 │ 
47 ▶   constructor(public typeChecker: ts.TypeChecker) {}
48 │ 
49 │   visitNode(node: ts.Node) {
50 ▶     if (node.kind === ts.SyntaxKind.ClassDeclaration) {
51 ▶       this.visitClassDeclaration(node as ts.ClassDeclaration);
52 │     }
53 │ 
54 ▶     ts.forEachChild(node, (n) => this.visitNode(n));
55 │   }
56 │ 
57 │   private visitClassDeclaration(node: ts.ClassDeclaration) {
58 ▶     const metadata = extractAngularClassMetadata(this.typeChecker, node);
59 ▶     if (metadata === null || metadata.type !== 'component') {
60 │       return;
61 │     }
```

47 行目で `ts.TypeChecker` を受け取ります。`visitNode` は 50 行目でクラスの宣言なら調べ、54 行目でその子も全部たどります。58 行目で `@Component` か `@Directive` の中身を取り出し、59 行目でコンポーネントでなければ終わります。その「Angular のデコレーターか」の判定は、名前ではなく **import 元**で決めます。

📄 `angular/packages/core/schematics/utils/extract_metadata.ts` L20–59 （▶ の行: 25, 31–32, 34, 44, 48, 51, 56）

```ts
20 │ /** Extracts `@Directive` or `@Component` metadata from the given class. */
21 │ export function extractAngularClassMetadata(
22 │   typeChecker: ts.TypeChecker,
23 │   node: ts.ClassDeclaration,
24 │ ): AngularClassMetadata | null {
25 ▶   const decorators = ts.getDecorators(node);
26 │ 
27 │   if (!decorators || !decorators.length) {
28 │     return null;
29 │   }
30 │ 
31 ▶   const ngDecorators = getAngularDecorators(typeChecker, decorators);
32 ▶   const componentDecorator = ngDecorators.find((dec) => dec.name === 'Component');
33 │   const directiveDecorator = ngDecorators.find((dec) => dec.name === 'Directive');
34 ▶   const decorator = componentDecorator ?? directiveDecorator;
35 │ 
36 │   // In case no decorator could be found on the current class, skip.
37 │   if (!decorator) {
38 │     return null;
39 │   }
40 │ 
41 │   const decoratorCall = decorator.node.expression;
42 │ 
43 │   // In case the decorator call is not valid, skip this class declaration.
44 ▶   if (decoratorCall.arguments.length !== 1) {
45 │     return null;
46 │   }
47 │ 
48 ▶   const metadata = unwrapExpression(decoratorCall.arguments[0]);
49 │ 
50 │   // Ensure that the metadata is an object literal expression.
51 ▶   if (!ts.isObjectLiteralExpression(metadata)) {
52 │     return null;
53 │   }
54 │ 
55 │   return {
56 ▶     type: componentDecorator ? 'component' : 'directive',
57 │     node: metadata,
58 │   };
59 │ }
```

📄 `angular/packages/core/schematics/utils/ng_decorators.ts` L23–40 （▶ の行: 32–33）

```ts
23 │ /**
24 │  * Gets all decorators which are imported from an Angular package (e.g. "@angular/core")
25 │  * from a list of decorators.
26 │  */
27 │ export function getAngularDecorators(
28 │   typeChecker: ts.TypeChecker,
29 │   decorators: ReadonlyArray<ts.Decorator>,
30 │ ): NgDecorator[] {
31 │   return decorators
32 ▶     .map((node) => ({node, importData: getCallDecoratorImport(typeChecker, node)}))
33 ▶     .filter(({importData}) => importData && importData.importModule.startsWith('@angular/'))
34 │     .map(({node, importData}) => ({
35 │       node: node as CallExpressionDecorator,
36 │       name: importData!.name,
37 │       moduleName: importData!.importModule,
38 │       importNode: importData!.node,
39 │     }));
40 │ }
```

📄 `angular/packages/core/schematics/utils/typescript/imports.ts` L18–46 （▶ の行: 22, 28, 30, 34, 42–43）

```ts
18 │ export function getImportOfIdentifier(
19 │   typeChecker: ts.TypeChecker,
20 │   node: ts.Identifier,
21 │ ): Import | null {
22 ▶   const symbol = typeChecker.getSymbolAtLocation(node);
23 │ 
24 │   if (!symbol || symbol.declarations === undefined || !symbol.declarations.length) {
25 │     return null;
26 │   }
27 │ 
28 ▶   const decl = symbol.declarations[0];
29 │ 
30 ▶   if (!ts.isImportSpecifier(decl)) {
31 │     return null;
32 │   }
33 │ 
34 ▶   const importDecl = decl.parent.parent.parent;
35 │ 
36 │   if (!ts.isImportDeclaration(importDecl) || !ts.isStringLiteral(importDecl.moduleSpecifier)) {
37 │     return null;
38 │   }
39 │ 
40 │   return {
41 │     // Handles aliased imports: e.g. "import {Component as myComp} from ...";
42 ▶     name: decl.propertyName ? decl.propertyName.text : decl.name.text,
43 ▶     importModule: importDecl.moduleSpecifier.text,
44 │     node: importDecl,
45 │   };
46 │ }
```

1. **extract\_metadata.ts 31 行目 → ng\_decorators.ts 32 行目：デコレーターごとに import を調べる**

   `getCallDecoratorImport`（typescript/decorators.ts）は `@Component(…)` の `Component` という識別子を取り出し、imports.ts の `getImportOfIdentifier` に渡します。
2. **imports.ts 22〜34 行目：識別子の宣言が import 指定子なら、その import 文を返す**

   22 行目で型チェッカーに記号を聞き、28〜30 行目で最初の宣言が `import {Component}` の指定子かを見て、34 行目で 3 つ上の親（import 文）まで上ります。42 行目のとおり `import {Component as Cmp}` でも元の名前 `Component` を返します。**import 先のモジュールが解決できなくても記号は取れる**ので、spec が `node_modules` を用意しなくても動きます（[第 19 回](19-mig-testing.md)）。
3. **ng\_decorators.ts 33 行目：`@angular/` から import したものだけ残す**

   自分で作った `Component` という名前のデコレーターは、ここで落ちます。
4. **extract\_metadata.ts 32〜56 行目：引数が 1 つのオブジェクトリテラルのときだけ**

   34 行目で `Component` を優先し、44 行目で引数が 1 つか、48 行目で括弧や `as` を外し、51 行目でオブジェクトリテラルかを見ます。`@Component(config)` のように変数を渡したクラスは、ここで `null` になり、テンプレートは見つかりません。

## 3. template と templateUrl の 2 つの道

📄 `angular/packages/core/schematics/utils/ng_component_template.ts` L66–98 （▶ の行: 68–69, 73, 77, 87–88, 95–96）

```ts
66 │     // Walk through all component metadata properties and determine the referenced
67 │     // HTML templates (either external or inline)
68 ▶     metadata.node.properties.forEach((property) => {
69 ▶       if (!ts.isPropertyAssignment(property)) {
70 │         return;
71 │       }
72 │ 
73 ▶       const propertyName = getPropertyNameText(property.name);
74 │ 
75 │       // In case there is an inline template specified, ensure that the value is statically
76 │       // analyzable by checking if the initializer is a string literal-like node.
77 ▶       if (propertyName === 'template' && ts.isStringLiteralLike(property.initializer)) {
78 │         // Need to add an offset of one to the start because the template quotes are
79 │         // not part of the template content.
80 │         // The `getText()` method gives us the original raw text.
81 │         // We could have used the `text` property, but if the template is defined as a backtick
82 │         // string then the `text` property contains a "cooked" version of the string. Such cooked
83 │         // strings will have converted CRLF characters to only LF. This messes up string
84 │         // replacements in template migrations.
85 │         // The raw text returned by `getText()` includes the enclosing quotes so we change the
86 │         // `content` and `start` values accordingly.
87 ▶         const content = property.initializer.getText().slice(1, -1);
88 ▶         const start = property.initializer.getStart() + 1;
89 │         this.resolvedTemplates.push({
90 │           filePath: sourceFileName,
91 │           container: node,
92 │           content,
93 │           inline: true,
94 │           start: start,
95 ▶           getCharacterAndLineOfPosition: (pos) =>
96 ▶             ts.getLineAndCharacterOfPosition(sourceFile, pos + start),
97 │         });
98 │       }
```

1. **68〜73 行目：メタデータのプロパティを 1 つずつ見る**

   69 行目で `key: value` の形だけを残します（`template,` のような省略形や `...spread` は飛ばす）。
2. **77 行目：`template` の値が文字列リテラルのときだけ**

   `isStringLiteralLike` は `'…'`・`"…"`・置換の無い `` `…` `` が真です。`template: TEMPLATE`（定数）や `` `${a}…` ``（置換を含むテンプレート文字列）、`'a' + 'b'`（連結）は対象外で、黙って飛ばされます。
3. **87〜88 行目：`text` ではなく `getText()` を使い、引用符の 1 文字ずつを外す**

   78〜86 行目のコメントのとおり、`text` はエスケープを戻した「料理済み」の文字列で、バッククォートの文字列では CRLF が LF に変わります。それでは文字数が元のファイルと合わず、置き換えの位置がずれます。`getText()` は元のファイルの文字そのままなので、87 行目で両端の引用符を外せば `content` の 1 文字目はファイルの `start` 文字目と一致します。88 行目の `+ 1` は開きの引用符の分です。
4. **95〜96 行目：インラインの行と列は TypeScript に聞く**

   テンプレートの中の位置に `start` を足して、.ts のファイル全体の中の行と列を `ts.getLineAndCharacterOfPosition` で出します。

📄 `angular/packages/core/schematics/utils/ng_component_template.ts` L99–122 （▶ の行: 99–102, 104–105, 108–109, 116, 118）

```ts
 99 ▶       if (propertyName === 'templateUrl' && ts.isStringLiteralLike(property.initializer)) {
100 ▶         const absolutePath = this.fs.resolve(
101 ▶           this.fs.dirname(sourceFileName),
102 ▶           property.initializer.text,
103 │         );
104 ▶         if (!this.fs.exists(absolutePath)) {
105 ▶           return;
106 │         }
107 │ 
108 ▶         const fileContent = this.fs.readFile(absolutePath);
109 ▶         const lineStartsMap = computeLineStartsMap(fileContent);
110 │ 
111 │         this.resolvedTemplates.push({
112 │           filePath: absolutePath,
113 │           container: node,
114 │           content: fileContent,
115 │           inline: false,
116 ▶           start: 0,
117 │           getCharacterAndLineOfPosition: (pos) =>
118 ▶             getLineAndCharacterFromPosition(lineStartsMap, pos),
119 │         });
120 │       }
121 │     });
122 │   }
```

1. **100〜103 行目：.ts のあるディレクトリから相対で解決**

   使うファイルシステムは 45 行目の `getFileSystem()` で、`ng generate` のときは `runMigrationInDevkit` が差し込んだ devkit の `Tree` の上のもの（[第 4 回](04-mig-tsurge.md)）、spec では `MockFileSystem` です。
2. **104〜106 行目：無ければ黙って飛ばす**

   エラーにも警告にもなりません。`templateUrl` の書き間違いがあると、そのコンポーネントは移行されずに終わります。
3. **108〜118 行目：.html を丸ごと読み、`start: 0`**

   外部のテンプレートはファイル全体がテンプレートなので、テンプレートの中の位置がそのままファイルの中の位置です。行と列は TypeScript の `SourceFile` が無いので、109 行目で自前の行頭の表を作って 118 行目で引きます（5 節）。

## 4. 解析する：HtmlParser を使う理由

📄 `angular/packages/core/schematics/utils/parse_html.ts` L53–81 （▶ の行: 59–64, 66–69, 73, 75）

```ts
53 │ /**
54 │  * parses the template string into the Html AST
55 │  */
56 │ export function parseTemplate(template: string): ParseResult {
57 │   let parsed: ParseTreeResult;
58 │   try {
59 ▶     // Note: we use the HtmlParser here, instead of the `parseTemplate` function, because the
60 ▶     // latter returns an Ivy AST, not an HTML AST. The HTML AST has the advantage of preserving
61 ▶     // interpolated text as text nodes containing a mixture of interpolation tokens and text tokens,
62 ▶     // rather than turning them into `BoundText` nodes like the Ivy AST does. This allows us to
63 ▶     // easily get the text-only ranges without having to reconstruct the original text.
64 ▶     parsed = new HtmlParser().parse(template, '', {
65 │       // Allows for ICUs to be parsed.
66 ▶       tokenizeExpansionForms: true,
67 ▶       // Explicitly disable blocks so that their characters are treated as plain text.
68 ▶       tokenizeBlocks: true,
69 ▶       preserveLineEndings: true,
70 │     });
71 │ 
72 │     // Don't migrate invalid templates.
73 ▶     if (parsed.errors && parsed.errors.length > 0) {
74 │       const errors = parsed.errors.map((e) => ({type: 'parse', error: e}));
75 ▶       return {tree: undefined, errors};
76 │     }
77 │   } catch (e: any) {
78 │     return {tree: undefined, errors: [{type: 'parse', error: e}]};
79 │   }
80 │   return {tree: parsed, errors: []};
81 │ }
```

1. **59〜64 行目：Ivy の AST ではなく HTML の AST**

   コンパイラの `parseTemplate` 関数は Ivy の AST（`TmplAstBoundText` など）を返し、`{{ x }}` を式に変えてしまいます。64 行目の `HtmlParser` の HTML の AST では、補間は `Text` ノードの中の文字のままです。書き換えたいのは「元の文字列の範囲」なので、元の形に近いほうが扱いやすい、というのがコメントの説明です。
2. **66〜69 行目：3 つのオプション**

   66 行目で ICU（`{n, plural, …}`）を `Expansion` ノードにし、68 行目で `@if` などを `Block` ノードにし、69 行目で改行を `\r\n` のまま残します（位置がずれないように）。**67 行目のコメントは「ブロックを明示的に無効にする」と書いていますが、68 行目の値は `true`（有効）です**。コメントが古く、振る舞いは 68 行目のとおりブロックを解析します（下のデモで `Block` が出ることで確かめられます）。
3. **73〜76 行目：解析エラーが 1 つでもあれば移行しない**

   `tree: undefined` を返し、呼ぶ側（self-closing・ngclass・ngstyle・control-flow）はそのテンプレートを飛ばします。閉じていないタグがあるテンプレートは、どれも移行されません。

📄 `angular/packages/core/schematics/utils/parse_html.ts` L34–51 （▶ の行: 44–45, 49）

```ts
34 │ /**
35 │  * Parses the given HTML content using the Angular compiler. In case the parsing
36 │  * fails, null is being returned.
37 │  */
38 │ export function parseHtmlGracefully(
39 │   htmlContent: string,
40 │   filePath: string,
41 │   compilerModule: typeof import('@angular/compiler'),
42 │ ): TmplAstNode[] | null {
43 │   try {
44 ▶     return compilerModule.parseTemplate(htmlContent, filePath).nodes;
45 ▶   } catch {
46 │     // Do nothing if the template couldn't be parsed. We don't want to throw any
47 │     // exception if a template is syntactically not valid. e.g. template could be
48 │     // using preprocessor syntax.
49 ▶     return null;
50 │   }
51 │ }
```

📄 `angular/packages/core/schematics/utils/template_ast_visitor.ts` L45–67 （▶ の行: 47–48, 52, 57, 65）

```ts
45 │ /**
46 │  * A base class that can be used to implement a Render3 Template AST visitor.
47 ▶  * Schematics are also currently required to be CommonJS to support execution within the Angular
48 ▶  * CLI. As a result, the ESM `@angular/compiler` package must be loaded via a native dynamic import.
49 │  * Using a dynamic import makes classes extending from classes present in `@angular/compiler`
50 │  * complicated due to the class not being present at module evaluation time. The classes using a
51 │  * base class found within `@angular/compiler` must be wrapped in a factory to allow the class value
52 ▶  * to be accessible at runtime after the dynamic import has completed. This class implements the
53 │  * interface of the `TmplAstRecursiveVisitor` class (but does not extend) as the
54 │  * `TmplAstRecursiveVisitor` as an interface provides the required set of visit methods. The base
55 │  * interface `Visitor<T>` is not exported.
56 │  */
57 ▶ export class TemplateAstVisitor implements TmplAstRecursiveVisitor {
58 │   /**
59 │    * Creates a new Render3 Template AST visitor using an instance of the `@angular/compiler`
60 │    * package. Passing in the compiler is required due to the need to dynamically import the
61 │    * ESM `@angular/compiler` into a CommonJS schematic.
62 │    *
63 │    * @param compilerModule The compiler instance that should be used within the visitor.
64 │    */
65 ▶   constructor(protected readonly compilerModule: typeof import('@angular/compiler')) {}
66 │ 
67 │   visitElement(element: TmplAstElement): void {}
```

📄 `angular/packages/core/schematics/utils/template_ast_visitor.ts` L99–112 （▶ の行: 107–109）

```ts
 99 │   /**
100 │    * Visits all the provided nodes in order using this Visitor's visit methods.
101 │    * This is a simplified variant of the `visitAll` function found inside of (but not
102 │    * exported from) the `@angular/compiler` that does not support returning a value
103 │    * since the migrations do not directly transform the nodes.
104 │    *
105 │    * @param nodes An iterable of nodes to visit using this visitor.
106 │    */
107 ▶   visitAll(nodes: Iterable<TmplAstNode>): void {
108 ▶     for (const node of nodes) {
109 ▶       node.visit(this);
110 │     }
111 │   }
112 │ }
```

同じディレクトリに、Ivy の AST の側の道具も残っています。`parseHtmlGracefully` は 44 行目でコンパイラの `parseTemplate` を呼んで Ivy のノードを返し、例外なら 49 行目で `null` にします。`TemplateAstVisitor` は 57 行目のとおり `TmplAstRecursiveVisitor` を継承せず「形だけ実装する」クラスで、47〜52 行目のコメントは 「schematics は CommonJS で、ESM の `@angular/compiler` は動的 import でしか読めないので、compiler のクラスを継承できない」と理由を書いています。

> [!NOTE]
> **ポイント**
>
> 2026-11-03 のスナップショットでは、`parseHtmlGracefully` と `TemplateAstVisitor` を import している場所は `packages/` にありません。また今の bundles は `require('@angular/compiler')` を直接呼び（`dist/bin/packages/core/schematics/bundles/self-closing-tags-migration.cjs` など 11 本）、to-self-closing-tags.ts は 83 行目で compiler の `RecursiveVisitor` を普通に継承しています（[第 14 回](14-mig-template-rewrites.md)）。47〜52 行目のコメントは、今の書き方の説明ではありません。bundles の作り方は[第 2 回](02-mig-entry-bundles.md)。

## 5. 位置を行と列に直す：line\_mappings.ts

📄 `angular/packages/core/schematics/utils/line_mappings.ts` L14–42 （▶ の行: 16–17, 25, 31–32, 35–36, 40）

```ts
14 │ /** Gets the line and character for the given position from the line starts map. */
15 │ export function getLineAndCharacterFromPosition(lineStartsMap: number[], position: number) {
16 ▶   const lineIndex = findClosestLineStartPosition(lineStartsMap, position);
17 ▶   return {character: position - lineStartsMap[lineIndex], line: lineIndex};
18 │ }
19 │ 
20 │ /**
21 │  * Computes the line start map of the given text. This can be used in order to
22 │  * retrieve the line and character of a given text position index.
23 │  */
24 │ export function computeLineStartsMap(text: string): number[] {
25 ▶   const result: number[] = [0];
26 │   let pos = 0;
27 │   while (pos < text.length) {
28 │     const char = text.charCodeAt(pos++);
29 │     // Handles the "CRLF" line break. In that case we peek the character
30 │     // after the "CR" and check if it is a line feed.
31 ▶     if (char === CR_CHAR) {
32 ▶       if (text.charCodeAt(pos) === LF_CHAR) {
33 │         pos++;
34 │       }
35 ▶       result.push(pos);
36 ▶     } else if (char === LF_CHAR || char === LINE_SEP_CHAR || char === PARAGRAPH_CHAR) {
37 │       result.push(pos);
38 │     }
39 │   }
40 ▶   result.push(pos);
41 │   return result;
42 │ }
```

📄 `angular/packages/core/schematics/utils/line_mappings.ts` L44–67 （▶ の行: 51–52, 55, 57, 60, 66）

```ts
44 │ /** Finds the closest line start for the given position. */
45 │ function findClosestLineStartPosition<T>(
46 │   linesMap: T[],
47 │   position: T,
48 │   low = 0,
49 │   high = linesMap.length - 1,
50 │ ) {
51 ▶   while (low <= high) {
52 ▶     const pivotIdx = Math.floor((low + high) / 2);
53 │     const pivotEl = linesMap[pivotIdx];
54 │ 
55 ▶     if (pivotEl === position) {
56 │       return pivotIdx;
57 ▶     } else if (position > pivotEl) {
58 │       low = pivotIdx + 1;
59 │     } else {
60 ▶       high = pivotIdx - 1;
61 │     }
62 │   }
63 │ 
64 │   // In case there was no exact match, return the closest "lower" line index. We also
65 │   // subtract the index by one because want the index of the previous line start.
66 ▶   return low - 1;
67 │ }
```

1. **24〜42 行目：行の先頭の位置の表を作る**

   25 行目で 0 から始め、改行の直後の位置を 1 つずつ足します。31〜35 行目で `\r\n` を 1 つの改行に数え、`\r` だけも改行にします。36 行目の 8232・8233 は Unicode の行区切りと段落区切りです。40 行目で最後に文字列の長さも足します。
2. **45〜67 行目：二分探索で「その位置を含む行」を探す**

   51〜62 行目でちょうど行頭なら、その行の番号を返します。見つからなければ 66 行目で「探索が止まった位置の 1 つ前」、つまり位置より小さい最後の行頭を返します。16〜17 行目で、列は「位置 − 行頭」です。行も列も 0 始まりです。

## 6. 「テンプレートの位置 + start」を使う側

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/ngclass-to-class-migration.ts` L89–99 （▶ の行: 89–92, 95）

```ts
89 ▶     const fileToMigrate = template.inline
90 ▶       ? file
91 ▶       : projectFile(template.filePath as AbsoluteFsPath, info);
92 ▶     const end = template.start + template.content.length;
93 │ 
94 │     return {
95 ▶       replacements: [prepareTextReplacement(fileToMigrate, migrated, template.start, end)],
96 │       replacementCount,
97 │       canRemoveNgClass,
98 │       canRemoveCommonModule,
99 │     };
```
*ngclass-to-class の processTemplate の後半。テンプレート全体を 1 つの置き換えにする*

89〜91 行目、インラインならテンプレートを持つ .ts を、外部なら .html を置き換えの対象にします。92 行目で `end = start + content.length`、95 行目でその範囲をまるごと書き換えたテンプレートに置き換えます。インラインなら `start` は引用符の次の位置、外部なら 0 です。self-closing-tags と ngstyle-to-style も同じ形です（[第 14 回](14-mig-template-rewrites.md)）。

ノード 1 つずつの位置で置き換える例は safe-optional-chaining（[第 18 回](18-mig-v22-safe-navigation.md)）です。その migration.ts の 112 行目で `new ExpressionMigrator(file, template.start)` と `start` を渡し、489〜498 行目で `position: this.templateStart + endArg` のように、式の中の位置に `start` を足して TextUpdate にしています。こちらは 102 行目でコンパイラの `parseTemplate`（Ivy の AST）を使う点も違います。

### signal-migration との違い

signal input の移行（[第 8 回](08-mig-signal-input-references.md)）は、この章の道具を使いません。`NgCompiler` を作って解析させ、`passes/reference_resolution/identify_template_references.ts` の 48 行目で `templateTypeChecker.getTemplate(node, OptimizeFor.WholeProgram)` からコンパイラが解析済みの Ivy のノードを受け取ります。ノードは自分の `sourceSpan` に「どのファイルか」（72 行目の `sourceSpan.start.file.url`）を持っているので、`start` を足す計算が要りません。代わりに、文字列の連結で作ったテンプレートは url が空になり、78 行目から先で移行を諦めます。signal-migration のゴールデンテストを走らせると、`template_concat_string.ts` についてこの理由の行が出ます（[第 19 回](19-mig-testing.md)）。型の情報（その `name` がどのクラスのどの入力か）が要る移行は `TemplateTypeChecker`、文字列の形だけで決まる移行はこの章の `NgComponentTemplateVisitor` + `HtmlParser`、という分担です。

## 7. デモ：テンプレートを解析して、ノードの範囲を見る

> **🧪 DEMO — このページの @angular/compiler 22.1.6 の HtmlParser で、ノードの種類と範囲を出す**
>
> テンプレートを入れて「解析する」を押すと、`parse_html.ts` の `parseTemplate` と同じ 3 つのオプション（66〜69 行目）で `HtmlParser` を呼び、ノードを外側から順に表にします。「テンプレートの開始位置」は `ResolvedTemplate.start` のつもりの数です（外部テンプレートなら 0）。表の「ファイルの中」は、テンプレートの中の位置にこれを足したものです。行と列は `line_mappings.ts` の **移植**で、テンプレートの中の行と列です（インラインのときの本物は 95〜96 行目のとおり .ts 全体の行と列を TypeScript に聞きます）。Attribute と BlockParameter は親の子として 1 段下げて出します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/mig-templates)

最初の例では、`div` の Element が 0 から始まり、その下に `*ngIf` の Attribute、さらに `user-card` の Element とその `[ngClass]` の Attribute が並びます。`@if` は `Block`（名前 `@if`）になり、その下に `items.length` の BlockParameter が出ます。`{{ items.length }} 件` は 1 つの `Text` のままで、補間が式のノードに分かれないことが分かります（4 節の 59〜63 行目のコメント）。要素と要素の間の改行も `Text` になります。閉じタグを 1 つ消すと解析エラーになり、本物ならそのテンプレートは移行されません。

## ここまでの呼び出し

- 👤 `new NgComponentTemplateVisitor(typeChecker).visitNode(node)` — 各マイグレーションの analyze
  - `visitClassDeclaration(node)` — ng\_component\_template.ts 57
    - `extractAngularClassMetadata()` — extract\_metadata.ts 21 — *@Component のオブジェクトリテラル*
      - `getAngularDecorators() → getCallDecoratorImport() → getImportOfIdentifier()` — ng\_decorators.ts 27・imports.ts 18 — *import 元が @angular/ か*
    - `resolvedTemplates.push({content, start, …})` — ng\_component\_template.ts 89 / 111 — *インラインは getStart() + 1、外部は 0*
- 👤 `parseTemplate(template.content)` — parse\_html.ts 56 — *HtmlParser。エラーがあれば tree: undefined*
- 👤 `new TextUpdate({position: start, end: start + content.length, …})` — 例：ngclass-to-class-migration.ts 92・95

## テストと直し方

### この章の部品を確かめる spec

- `ng_component_template.ts`・`parse_html.ts`・`line_mappings.ts` だけを直接見る spec はありません（2026-11-03、`grep -rln "NgComponentTemplateVisitor\|computeLineStartsMap" --include='*spec.ts' packages/core/schematics` は 0 件）。
- インラインと外部の 2 つの道を両方通る spec は、migrations/self-closing-tags-migration/self-closing-tags-migration.spec.ts の it `should migrate an external template file`（191 行目）と、インラインの it 10 本です。外部の it は 236 行目で「.ts は変わらない」、238〜240 行目で「.html だけが変わる」を確かめます。
- `templateUrl` を使う spec は、ほかに test/common\_to\_standalone\_migration\_spec.ts・test/control\_flow\_migration\_spec.ts・migrations/output-migration と migrations/safe-optional-chaining の spec です。ngclass-to-class と ngstyle-to-style の spec には `templateUrl` の it がありません。

### 手元で走らせた結果

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/schematics/migrations/self-closing-tags-migration:test \
  --nocache_test_results --test_output=all
```

11 specs, 0 failures、PASSED in 0.7s（Elapsed 0.909s、2026-11-03。ログは scratchpad/mig-logs/b-selfclosing-mig.log）。spec のファイルの it 11 本と一致しました。

### 直すとしたら

- テンプレートが見つからない（定数の `template`、変数で渡したメタデータ、`@Component` を別名の再 export から import している、など）：`ng_component_template.ts` の 77・99 行目の条件と `extract_metadata.ts` の 44〜53 行目、`typescript/imports.ts` の 30〜38 行目。spec は使っているマイグレーションの spec に「見つかる／見つからない」の it を足します。
- 位置がずれる（CRLF・エスケープ）：87〜88 行目の `getText()` と、`parse_html.ts` 69 行目の `preserveLineEndings`。spec は CRLF を含むインラインのテンプレートの it を、self-closing の spec に足すのがいちばん小さい。
- 67 行目のコメントと 68 行目の値の食い違いは、振る舞いには影響しません。issue を探す前に、手元で「ブロックの中の要素も移行される」ことを self-closing の spec で確かめられます。本家に PR を出すことは勧めません。

## 聞かれそうな質問

**Q. インラインのテンプレートで、置き換えの位置が 1 文字ずれないのはなぜですか？**

ng\_component\_template.ts の 87 行目で `getText()`（元のファイルの文字そのまま）の両端の引用符を外して `content` にし、88 行目で `start = getStart() + 1` と開きの引用符の分を足しているからです。`content` の i 文字目はファイルの `start + i` 文字目と一致します。`text` を使わないのは、エスケープや CRLF が戻されて文字数が変わるからです（78〜86 行目のコメント）。

**Q. `template: MY_TEMPLATE` と定数で書いたコンポーネントは移行されますか？**

この章の道具を使うマイグレーション（self-closing・ngclass・ngstyle など）では移行されません。77 行目の `ts.isStringLiteralLike(property.initializer)` が偽なので、テンプレートとして登録されず、警告も出ません。コンパイラの `TemplateTypeChecker` を使う signal-migration は、コンパイラが定数を評価して解析したテンプレートを受け取るので、別の結果になります（6 節）。

**Q. なぜコンパイラの parseTemplate ではなく HtmlParser を使うのですか？**

parse\_html.ts の 59〜63 行目のコメントのとおり、`parseTemplate` は Ivy の AST を返し、補間を `BoundText` の式に変えてしまうからです。`HtmlParser` の HTML の AST では補間が `Text` の文字のまま残り、要素や属性の範囲（`sourceSpan`・`valueSpan`）を元の文字列の位置で取れます。式の中まで見る移行（safe-optional-chaining）は Ivy の AST を使います。

**Q. templateUrl のファイルが見つからないと、エラーになりますか？**

なりません。104〜106 行目で `fs.exists` が偽なら `return` するだけで、そのコンポーネントの外部テンプレートは結果に入りません。ログにも出ないので、「移行されなかったコンポーネントがある」ときは、まず `templateUrl` の相対パス（100〜103 行目で .ts のディレクトリから解決）を疑います。

**Q. テンプレートに閉じていないタグがあると、どうなりますか？**

parse\_html.ts の 73〜76 行目で、解析エラーが 1 つでもあれば `tree: undefined` を返し、呼ぶ側はそのテンプレート全体を飛ばします。一部だけ移行することはありません。デモで閉じタグを消すと、そのエラーの文が出ます。

## 読み終えて

- `NgComponentTemplateVisitor` は、import 元が `@angular/` の `@Component` から、文字列リテラルの `template` と、存在する `templateUrl` の .html だけを拾う。
- インラインは `getText()` の引用符を外して `start = getStart() + 1`、外部は `start = 0`。テンプレートの中の位置 + start がファイルの中の位置。
- 解析は HTML の AST（`HtmlParser`、ICU・ブロック・CRLF を保つ）。エラーがあればテンプレートごと移行しない。67 行目のコメントは値と食い違っている。
- 型の情報が要る signal-migration は `TemplateTypeChecker` から、ファイルの url を持つ Ivy のノードを受け取るので、start を足さない。

---

← 前: [置き換えを集めて書く：Replacement・TextUpdate・ImportManager](05-mig-replacements.md)  
次: [signal input への移行：10 の段階](07-mig-signal-input-passes.md) →
