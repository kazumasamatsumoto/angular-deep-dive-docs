[目次](../README.md) › [standalone コンポーネントの内側](README.md) › 第 13 回 / 全 14 回

# selectorless（実験的）：imports を書かずに &lt;MyCmp /&gt; と書けるようにする仕組み

> \_enableSelectorless オプションで有効になる実験的機能。テンプレートの &lt;MyCmp&gt; と @MyDir を analyzeTemplateForSelectorless が集め、SelectorlessComponentScopeReader がファイルの import 文から同名の識別子を解決してスコープにする手順。standalone でないと使えない行、imports / deferredImports と併用できない行。セレクタ照合（第 7 章）が不要になる理由。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/standalone-selectorless)

---

> [!WARNING]
> **ハマりどころ**
>
> この章で読む **selectorless は公開 API ではありません**。有効化オプション `_enableSelectorless` は `@internal` で、既定は `false` です。v22 のソースに「実在する形」をそのまま読む回であり、使い方の推奨ではありません。また、コンパイラの最終段（テンプレート関数の生成）には `TODO` が残っています（6 節）。

selectorless は、`imports` を書かずにテンプレートに `<MyCmp />` や `<div @MyDir>` と **クラス名で**書けるようにする仕組みです。このシリーズで追ってきた「`imports` → `dependencies` → セレクタ照合」の 流れのうち、`imports` とセレクタ照合の 2 つが無くなり、**ファイルの `import` 文**がスコープの源になります。この章では、字句解析が大文字始まりのタグを別トークンにする行、`analyzeTemplateForSelectorless` が参照名を集める行、`SelectorlessComponentScopeReader` が `import` 文とクラス宣言から同名の識別子を解決する行、standalone 必須と `imports` 併用不可のエラーが出る行を順に読みます。

読む対象は `packages/compiler-cli/src/ngtsc/core/api/src/options.ts`、`packages/compiler/src/ml_parser/lexer.ts`、`packages/compiler/src/render3/r3_ast.ts`、`packages/compiler-cli/src/ngtsc/annotations/component/src/selectorless.ts` と `handler.ts`、`packages/compiler-cli/src/ngtsc/scope/src/selectorless_scope.ts` です。

1. [1. 概観](01-standalone.md)
2. [2. @Component 実行の瞬間（JIT）](02-standalone-decorator.md)
3. [3. imports の検証（AOT）](03-standalone-imports-check.md)
4. [4. 使った依存だけが残る](04-standalone-used-only.md)
5. [5. forwardRef と自己参照](05-standalone-forward-ref.md)
6. [6. ローカルコンパイル](06-standalone-local-compilation.md)
7. [7. 実行時の依存解決](07-standalone-directive-registry.md)
8. [8. providers の 2 つの行き先](08-standalone-providers-two-injectors.md)
9. [9. 入口の検査](09-standalone-entry-checks.md)
10. [10. hostDirectives](10-standalone-host-directives.md)
11. [11. @defer と imports](11-standalone-defer-deps.md)
12. [12. TestBed の差し替え](12-standalone-testbed-override.md)
13. **13. selectorless（実験的）**（この章）
14. [14. foreignImports（内部向け）](14-standalone-foreign-imports.md)

## 1. 入口は @internal なオプション 1 つ

📄 `angular/packages/compiler-cli/src/ngtsc/core/api/src/options.ts` L108–113 （▶ の行: 111, 113）

```ts
108 │   /**
109 │    * Whether selectorless is enabled.
110 │    *
111 ▶    * @internal
112 │    */
113 ▶   _enableSelectorless?: boolean;
```

111 行目に `@internal`。113 行目の `_enableSelectorless` は先頭がアンダースコアで、公開の `angularCompilerOptions` の型には現れません。これを `NgCompiler` が読むのはここです。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L472–476 （▶ の行: 475）

```ts
472 │     this.enableLetSyntax =
473 │       this.angularCoreVersion === null ||
474 │       coreVersionSupportsFeature(this.angularCoreVersion, '>= 18.1.0');
475 ▶     this.enableSelectorless = options['_enableSelectorless'] ?? false;
476 │     this.enableTemplateSourceLocations = options['enableTemplateSourceLocations'] ?? false;
```

475 行目、`options['_enableSelectorless'] ?? false`。既定は `false` なので、何もしなければこの章の経路は 1 行も実行されません。この `enableSelectorless` は `ComponentDecoratorHandler` のコンストラクタ引数として渡り、2 つの場所で使われます。テンプレートのパース（2 節）と、テンプレート解析（3 節）です。

## 2. 字句解析：大文字で始まるタグと @名前

フラグはまず `parseTemplate` に `enableSelectorless` として渡ります。

📄 `angular/packages/compiler/src/render3/view/template.ts` L144–156 （▶ の行: 146–147, 155）

```ts
144 │ ): ParsedTemplate {
145 │   const {preserveWhitespaces, enableI18nLegacyMessageIdFormat} = options;
146 ▶   const selectorlessEnabled = options.enableSelectorless ?? false;
147 ▶   const bindingParser = makeBindingParser(selectorlessEnabled);
148 │   const htmlParser = new HtmlParser();
149 │   const parseResult = htmlParser.parse(template, templateUrl, {
150 │     leadingTriviaChars: LEADING_TRIVIA_CHARS,
151 │     ...options,
152 │     tokenizeExpansionForms: true,
153 │     tokenizeBlocks: options.enableBlockSyntax ?? true,
154 │     tokenizeLet: options.enableLetSyntax ?? true,
155 ▶     selectorlessEnabled,
156 │   });
```

146 行目でオプションを読み、147 行目で式のパーサに、155 行目で HTML の字句解析器に渡します。147 行目の `makeBindingParser` は次の 1 行です。

📄 `angular/packages/compiler/src/render3/view/template.ts` L283–285 （▶ の行: 284）

```ts
283 │ export function makeBindingParser(selectorlessEnabled = false): BindingParser {
284 ▶   return new BindingParser(new Parser(new Lexer(), selectorlessEnabled), elementRegistry, []);
285 │ }
```

📄 `angular/packages/compiler/src/expression_parser/parser.ts` L102–106 （▶ の行: 105）

```ts
102 │ export class Parser {
103 │   constructor(
104 │     private readonly _lexer: Lexer,
105 ▶     private readonly _supportsDirectPipeReferences = false,
106 │   ) {}
```

284 行目で式パーサ `Parser` の第 2 引数に渡され、105 行目の `_supportsDirectPipeReferences` になります。名前のとおり「パイプを**クラス名で直接**参照できるか」です。パイプ式のノードには 2 種類の参照の仕方が定義されています。

📄 `angular/packages/compiler/src/expression_parser/ast.ts` L156–168 （▶ の行: 161, 167）

```ts
156 │ export enum BindingPipeType {
157 │   /**
158 │    * Pipe is being referenced by its name, for example:
159 │    * `@Pipe({name: 'foo'}) class FooPipe` and `{{123 | foo}}`.
160 │    */
161 ▶   ReferencedByName,
162 │ 
163 │   /**
164 │    * Pipe is being referenced by its class name, for example:
165 │    * `@Pipe() class FooPipe` and `{{123 | FooPipe}}`.
166 │    */
167 ▶   ReferencedDirectly,
168 │ }
```

161 行目の `ReferencedByName` が従来の `{{ x | date }}`（`@Pipe({name: 'date'})` の名前）、167 行目の `ReferencedDirectly` が `{{ x | DatePipe }}`（クラス名）です。3 節の解析器は 167 行目の種類だけを拾います。

### HTML 側：`<` の次が大文字なら COMPONENT\_OPEN\_START

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L891–914 （▶ の行: 892–895, 898, 903, 910）

```ts
891 │     try {
892 ▶       if (this._selectorlessEnabled && isSelectorlessNameStart(this._cursor.peek())) {
893 ▶         openToken = this._consumeComponentOpenStart(start);
894 ▶         [closingTagName, prefix, tagName] = openToken.parts;
895 ▶         if (prefix) {
896 │           closingTagName += `:${prefix}`;
897 │         }
898 ▶         if (tagName) {
899 │           closingTagName += `:${tagName}`;
900 │         }
901 │         this._attemptCharCodeUntilFn(isNotWhitespace);
902 │       } else {
903 ▶         if (!chars.isAsciiLetter(this._cursor.peek())) {
904 │           throw this._createError(
905 │             _unexpectedCharacterErrorMsg(this._cursor.peek()),
906 │             this._cursor.getSpan(start),
907 │           );
908 │         }
909 │ 
910 ▶         openToken = this._consumeTagOpenStart(start);
911 │         prefix = openToken.parts[0];
912 │         tagName = closingTagName = openToken.parts[1];
913 │         this._attemptCharCodeUntilFn(isNotWhitespace);
914 │       }
```

1. **892 行目：フラグ ON かつ名前の先頭文字なら、コンポーネントとして読む**

   📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L1551–1557 （▶ の行: 1552, 1556）

   ```ts
   1551 │ function isSelectorlessNameStart(code: number): boolean {
   1552 ▶   return code === chars.$_ || (code >= chars.$A && code <= chars.$Z);
   1553 │ }
   1554 │ 
   1555 │ function isSelectorlessNameChar(code: number): boolean {
   1556 ▶   return chars.isAsciiLetter(code) || chars.isDigit(code) || code === chars.$_;
   1557 │ }
   ```

   1552 行目、「先頭文字」は `_` か **大文字 A〜Z**。1556 行目、2 文字目以降は英数字と `_`。`<div>` は小文字なので従来どおり 903 行目以降（`_consumeTagOpenStart`、910 行目）です。`<MyCmp>` は 893 行目の `_consumeComponentOpenStart` で `COMPONENT_OPEN_START` トークンになります。
2. **894〜900 行目：`<MyCmp:button>` の形も読む**

   トークンの `parts` は `[componentName, prefix, tagName]` の 3 つで、コロン区切りで「このコンポーネントをどの要素名で描くか」を付けられます。閉じタグ名は 895〜900 行目で `MyCmp:button` のように組み直されます。

📄 `angular/packages/compiler/src/ml_parser/lexer.ts` L928–943 （▶ の行: 932, 937–938, 941）

```ts
928 │         if (isAttributeTerminator(this._cursor.peek())) {
929 │           break;
930 │         }
931 │ 
932 ▶         if (this._selectorlessEnabled && this._cursor.peek() === chars.$AT) {
933 │           const start = this._cursor.clone();
934 │           const nameStart = start.clone();
935 │           nameStart.advance();
936 │ 
937 ▶           if (isSelectorlessNameStart(nameStart.peek())) {
938 ▶             this._consumeDirective(start, nameStart);
939 │           }
940 │         } else {
941 ▶           this._consumeAttribute();
942 │         }
943 │       }
```

属性を読むループの中です。932 行目、フラグ ON で `@` が来たら、937 行目で次の文字が大文字か `_` であることを確かめ、938 行目で `_consumeDirective` に入ります。`<div @MyDir>` や `<div @MyDir(value="x")>` の形です。それ以外は 941 行目の通常の属性です。

### AST：Component ノードと Directive ノード

📄 `angular/packages/compiler/src/render3/r3_ast.ts` L648–668 （▶ の行: 648, 650–651, 656）

```ts
648 ▶ export class Component implements Node {
649 │   constructor(
650 ▶     public componentName: string,
651 ▶     public tagName: string | null,
652 │     public fullName: string,
653 │     public attributes: TextAttribute[],
654 │     public inputs: BoundAttribute[],
655 │     public outputs: BoundEvent[],
656 ▶     public directives: Directive[],
657 │     public children: Node[],
658 │     public references: Reference[],
659 │     public isSelfClosing: boolean,
660 │     public sourceSpan: ParseSourceSpan,
661 │     public startSourceSpan: ParseSourceSpan,
662 │     public endSourceSpan: ParseSourceSpan | null,
663 │     public i18n?: I18nMeta,
664 │   ) {}
665 │   visit<Result>(visitor: Visitor<Result>): Result {
666 │     return visitor.visitComponent(this);
667 │   }
668 │ }
```

📄 `angular/packages/compiler/src/render3/r3_ast.ts` L670–685 （▶ の行: 670, 672）

```ts
670 ▶ export class Directive implements Node {
671 │   constructor(
672 ▶     public name: string,
673 │     public attributes: TextAttribute[],
674 │     public inputs: BoundAttribute[],
675 │     public outputs: BoundEvent[],
676 │     public references: Reference[],
677 │     public sourceSpan: ParseSourceSpan,
678 │     public startSourceSpan: ParseSourceSpan,
679 │     public endSourceSpan: ParseSourceSpan | null,
680 │     public i18n?: I18nMeta,
681 │   ) {}
682 │   visit<Result>(visitor: Visitor<Result>): Result {
683 │     return visitor.visitDirective(this);
684 │   }
685 │ }
```

従来の `Element` とは別に、648 行目の `Component` ノードと 670 行目の `Directive` ノードがあります。650 行目の `componentName` がクラス名、651 行目の `tagName` がコロンの後ろ（無ければ `null`）、656 行目の `directives` がその要素に付いた `@Dir` の配列です。672 行目、`Directive` ノードの `name` がクラス名です。**セレクタという概念がノードに存在しない**ことを確認してください。

## 3. analyzeTemplateForSelectorless：テンプレートが参照しているクラス名を集める

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L827–858 （▶ の行: 830–833, 836–837, 842, 844, 847, 852, 854）

```ts
827 │     let selectorlessEnabled = false;
828 │     let localReferencedSymbols: Set<string> | null = null;
829 │ 
830 ▶     if (this.enableSelectorless) {
831 ▶       const templateAnalysis = analyzeTemplateForSelectorless(template.nodes);
832 ▶       selectorlessEnabled = templateAnalysis.isSelectorless;
833 ▶       localReferencedSymbols = templateAnalysis.localReferencedSymbols;
834 │     }
835 │ 
836 ▶     if (selectorlessEnabled) {
837 ▶       if (!metadata.isStandalone) {
838 │         isPoisoned = true;
839 │         diagnostics ??= [];
840 │         diagnostics.push(
841 │           makeDiagnostic(
842 ▶             ErrorCode.COMPONENT_NOT_STANDALONE,
843 │             component.get('standalone') || node.name,
844 ▶             `Cannot use selectorless with a component that is not standalone`,
845 │           ),
846 │         );
847 ▶       } else if (rawImports || rawDeferredImports) {
848 │         isPoisoned = true;
849 │         diagnostics ??= [];
850 │         diagnostics.push(
851 │           makeDiagnostic(
852 ▶             ErrorCode.UNSUPPORTED_SELECTORLESS_COMPONENT_FIELD,
853 │             (rawImports || rawDeferredImports)!,
854 ▶             `Cannot use the "${rawImports === null ? 'deferredImports' : 'imports'}" field in a selectorless component`,
855 │           ),
856 │         );
857 │       }
858 │     }
```

`ComponentDecoratorHandler.analyze` の中です。830 行目、フラグ ON のときだけ 831 行目で解析器を走らせます。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/selectorless.ts` L24–36 （▶ の行: 28–31）

```ts
24 │ export function analyzeTemplateForSelectorless(template: TmplAstNode[]): {
25 │   isSelectorless: boolean;
26 │   localReferencedSymbols: Set<string> | null;
27 │ } {
28 ▶   const analyzer = new SelectorlessDirectivesAnalyzer();
29 ▶   tmplAstVisitAll(analyzer, template);
30 ▶   const isSelectorless = analyzer.symbols !== null && analyzer.symbols.size > 0;
31 ▶   const localReferencedSymbols = analyzer.symbols;
32 │ 
33 │   // The template is considered selectorless only if there
34 │   // are direct references to directives or pipes.
35 │   return {isSelectorless, localReferencedSymbols};
36 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/selectorless.ts` L42–67 （▶ の行: 46–47, 53–54, 58–59, 64–65）

```ts
42 │ class SelectorlessDirectivesAnalyzer extends CombinedRecursiveAstVisitor {
43 │   symbols: Set<string> | null = null;
44 │ 
45 │   override visit(node: AST | TmplAstNode) {
46 ▶     if (node instanceof BindingPipe && node.type === BindingPipeType.ReferencedDirectly) {
47 ▶       this.trackSymbol(node.name);
48 │     }
49 │ 
50 │     super.visit(node);
51 │   }
52 │ 
53 ▶   override visitComponent(component: TmplAstComponent) {
54 ▶     this.trackSymbol(component.componentName);
55 │     super.visitComponent(component);
56 │   }
57 │ 
58 ▶   override visitDirective(directive: TmplAstDirective) {
59 ▶     this.trackSymbol(directive.name);
60 │     super.visitDirective(directive);
61 │   }
62 │ 
63 │   private trackSymbol(name: string) {
64 ▶     this.symbols ??= new Set();
65 ▶     this.symbols.add(name);
66 │   }
67 │ }
```

1. **29 行目：テンプレート全体を訪問する**

   53〜54 行目、`Component` ノードなら `componentName` を。58〜59 行目、`Directive` ノードなら `name` を。46〜47 行目、パイプ式で `type === ReferencedDirectly`（2 節の 167 行目）なら `node.name`（クラス名）を、64〜65 行目の `Set` に入れます。
2. **30 行目：1 つでも集まれば「このテンプレートは selectorless」**

   フラグが ON でも、`<MyCmp>` も `@Dir` も `| ClassName` も無いテンプレートは `isSelectorless = false` です。その場合は従来どおり `imports` と `StandaloneComponentScopeReader` の経路（5 節）になります。つまり**判定はコンパイラ全体のフラグではなく、テンプレート 1 枚ごと**です。
3. **832〜833 行目：結果を metadata に残す**

   📄 `angular/packages/compiler-cli/src/ngtsc/metadata/src/api.ts` L315–321 （▶ の行: 316, 321）

   ```ts
   315 │   /** Whether selectorless is enabled for the specific component. */
   316 ▶   selectorlessEnabled: boolean;
   317 │ 
   318 │   /**
   319 │    * Names of the symbols within the source file that are referenced directly inside the template.
   320 │    */
   321 ▶   localReferencedSymbols: Set<string> | null;
   ```

   `DirectiveMeta` の 316 行目 `selectorlessEnabled` と 321 行目 `localReferencedSymbols` です。5 節のスコープ計算がこの 2 つを読みます。

## 4. 2 つの検査：standalone 必須、imports と併用不可

3 節の引用（handler.ts 836〜858 行目）に戻ります。`selectorlessEnabled` が `true` のときだけ入る分岐です。

1. **837〜846 行目：standalone でなければ NG2010**

   842 行目の `ErrorCode.COMPONENT_NOT_STANDALONE`（2010）、メッセージは 844 行目 「`Cannot use selectorless with a component that is not standalone`」。5 節で読む `SelectorlessComponentScopeReader` も 35 行目で `isStandalone` を要求しているので、standalone でないコンポーネントには selectorless のスコープ自体が作られません。
2. **847〜856 行目：`imports` か `deferredImports` があれば NG2026**

   📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/error_code.ts` L181–184 （▶ の行: 184）

   ```ts
   181 │   /**
   182 │    * Raised for `@Component` fields that aren't supported in a selectorless context.
   183 │    */
   184 ▶   UNSUPPORTED_SELECTORLESS_COMPONENT_FIELD = 2026,
   ```

   852 行目の `UNSUPPORTED_SELECTORLESS_COMPONENT_FIELD` は 184 行目で 2026 です。854 行目のメッセージは 「`Cannot use the "imports" field in a selectorless component`」（`rawImports` が `null` なら `deferredImports`）。5 節で見るとおり、1 つのコンポーネントのスコープを作る読み手は `imports` 用か selectorless 用のどちらか一方だけです。

どちらの分岐でも 838 / 848 行目で `isPoisoned = true` になり、以降のテンプレート型検査のエラーは抑制されます。

## 5. スコープ：import 文とクラス宣言から同名の識別子を解決する

[第 3 回](03-standalone-imports-check.md)で読んだ `StandaloneComponentScopeReader` は、selectorless のコンポーネントには `null` を返します。

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/standalone.ts` L30–43 （▶ の行: 39, 41–42）

```ts
30 │   getScopeForComponent(clazz: ClassDeclaration): StandaloneScope | null {
31 │     if (!this.cache.has(clazz)) {
32 │       const clazzRef = new Reference(clazz);
33 │       const clazzMeta = this.metaReader.getDirectiveMetadata(clazzRef);
34 │ 
35 │       if (
36 │         clazzMeta === null ||
37 │         !clazzMeta.isComponent ||
38 │         !clazzMeta.isStandalone ||
39 ▶         clazzMeta.selectorlessEnabled
40 │       ) {
41 ▶         this.cache.set(clazz, null);
42 ▶         return null;
43 │       }
```

39 行目、`clazzMeta.selectorlessEnabled` なら 41〜42 行目で `null`。代わりに答えるのが `SelectorlessComponentScopeReader` です。返すスコープの型を先に見ます。

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/api.ts` L79–86 （▶ の行: 81–82）

```ts
79 │ export interface SelectorlessScope {
80 │   kind: ComponentScopeKind.Selectorless;
81 ▶   dependencies: Map<string, DirectiveMeta | PipeMeta>;
82 ▶   dependencyIdentifiers: ts.Identifier[];
83 │   component: ClassDeclaration;
84 │   schemas: SchemaMetadata[];
85 │   isPoisoned: boolean;
86 │ }
```

81 行目、`dependencies` は配列ではなく **`Map<string, DirectiveMeta | PipeMeta>`** です。キーはテンプレートに書いた名前（ファイル内のローカル名）。82 行目の `dependencyIdentifiers` は、その名前が指す `ts.Identifier` の配列で、後で `@defer` 用に使います（6 節）。

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/selectorless_scope.ts` L27–38 （▶ の行: 33, 35–36）

```ts
27 │   getScopeForComponent(node: ClassDeclaration): SelectorlessScope | null {
28 │     if (this.cache.has(node)) {
29 │       return this.cache.get(node)!;
30 │     }
31 │ 
32 │     const clazzRef = new Reference(node);
33 ▶     const meta = this.metaReader.getDirectiveMetadata(clazzRef);
34 │ 
35 ▶     if (meta === null || !meta.isComponent || !meta.isStandalone || !meta.selectorlessEnabled) {
36 ▶       this.cache.set(node, null);
37 │       return null;
38 │     }
```

35 行目、「コンポーネントで、standalone で、selectorlessEnabled」の 3 条件を満たさなければ 36 行目で `null`。`StandaloneComponentScopeReader` の 39 行目と対になっていて、**1 つのコンポーネントにどちらか一方だけ**が答えます。

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/selectorless_scope.ts` L40–73 （▶ の行: 40–41, 45, 50, 52–54, 56–57, 62, 65–66）

```ts
40 ▶     const eligibleIdentifiers = this.getAvailableIdentifiers(node);
41 ▶     const dependencies = new Map<string, DirectiveMeta | PipeMeta>();
42 │     const dependencyIdentifiers: ts.Identifier[] = [];
43 │     let isPoisoned = meta.isPoisoned;
44 │ 
45 ▶     for (const [name, identifier] of eligibleIdentifiers) {
46 │       if (dependencies.has(name)) {
47 │         continue;
48 │       }
49 │ 
50 ▶       const dep = this.getMetaFromIdentifier(meta, name, identifier);
51 │ 
52 ▶       if (dep !== null) {
53 ▶         dependencies.set(name, dep);
54 ▶         dependencyIdentifiers.push(identifier);
55 │ 
56 ▶         if (dep.kind === MetaKind.Directive && dep.isPoisoned) {
57 ▶           isPoisoned = true;
58 │         }
59 │       }
60 │     }
61 │ 
62 ▶     const scope: SelectorlessScope = {
63 │       kind: ComponentScopeKind.Selectorless,
64 │       component: node,
65 ▶       dependencies,
66 ▶       dependencyIdentifiers,
67 │       isPoisoned,
68 │       schemas: meta.schemas ?? [],
69 │     };
70 │ 
71 │     this.cache.set(node, scope);
72 │     return scope;
73 │   }
```

1. **40 行目：ファイル内で見える識別子を全部集める**

   📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/selectorless_scope.ts` L80–121 （▶ の行: 82, 84, 87, 92–94, 99, 101, 104, 106–107, 111–112, 118）

   ```ts
    80 │   private getAvailableIdentifiers(node: ClassDeclaration): Map<string, ts.Identifier> {
    81 │     const result = new Map<string, ts.Identifier>();
    82 ▶     let current = ts.getOriginalNode(node).parent;
    83 │ 
    84 ▶     while (current) {
    85 │       // Note: doesn't account for some cases like function parameters,
    86 │       // but we likely don't want to support those anyways.
    87 ▶       if (!ts.isSourceFile(current) && !ts.isBlock(current)) {
    88 │         current = current.parent;
    89 │         continue;
    90 │       }
    91 │ 
    92 ▶       for (const stmt of current.statements) {
    93 ▶         if (this.reflector.isClass(stmt)) {
    94 ▶           result.set(stmt.name.text, stmt.name);
    95 │           continue;
    96 │         }
    97 │ 
    98 │         if (
    99 ▶           ts.isImportDeclaration(stmt) &&
   100 │           stmt.importClause !== undefined &&
   101 ▶           !(stmt.importClause.phaseModifier === ts.SyntaxKind.TypeKeyword)
   102 │         ) {
   103 │           const clause = stmt.importClause;
   104 ▶           if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
   105 │             for (const element of clause.namedBindings.elements) {
   106 ▶               if (!element.isTypeOnly) {
   107 ▶                 result.set(element.name.text, element.name);
   108 │               }
   109 │             }
   110 │           }
   111 ▶           if (clause.name !== undefined) {
   112 ▶             result.set(clause.name.text, clause.name);
   113 │           }
   114 │           continue;
   115 │         }
   116 │       }
   117 │ 
   118 ▶       current = current.parent;
   119 │     }
   120 │ 
   121 │     return result;
   ```

   82 行目、コンポーネントクラスの親ノードから始めて、84 行目で上へ辿ります。87 行目、見るのは `SourceFile` と `Block`（関数本体など）だけです。92 行目で各文を見て、93〜94 行目、**クラス宣言**なら名前を登録。99〜101 行目、`import type` でない **import 宣言**なら、104〜107 行目で名前付き import（`import {A, B}`、ただし `type` 修飾されていないもの）、111〜112 行目で既定 import（`import X from`）を登録。118 行目で親へ。`result` は `Map<名前, ts.Identifier>` なので、**1 つの名前には 1 つの識別子**しか対応しません。

   `import * as ns` のような名前空間 import は 104 行目の `isNamedImports` に当たらないので登録されません。変数（`const X = Y`）も登録されません。コメント（85〜86 行目）のとおり関数パラメータも対象外です。
2. **45〜50 行目：テンプレートが使った名前だけ、型チェッカーに聞く**

   📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/selectorless_scope.ts` L124–141 （▶ の行: 131–132, 135–136, 139–140）

   ```ts
   124 │   private getMetaFromIdentifier(
   125 │     meta: DirectiveMeta,
   126 │     localName: string,
   127 │     node: ts.Identifier,
   128 │   ): DirectiveMeta | PipeMeta | null {
   129 │     // Consult the set of used names in the template so we don't hit the type checker for every
   130 │     // import in the file. Most likely a subset of imports in the file will be used in the template.
   131 ▶     if (meta.localReferencedSymbols === null || !meta.localReferencedSymbols.has(localName)) {
   132 ▶       return null;
   133 │     }
   134 │ 
   135 ▶     const declaration = this.reflector.getDeclarationOfIdentifier(node);
   136 ▶     if (declaration === null || !this.reflector.isClass(declaration.node)) {
   137 │       return null;
   138 │     }
   139 ▶     const ref = new Reference(declaration.node);
   140 ▶     return this.metaReader.getDirectiveMetadata(ref) ?? this.metaReader.getPipeMetadata(ref);
   141 │   }
   ```

   131〜132 行目、3 節で集めた `localReferencedSymbols` に無い名前は即 `null`。ファイルに 30 個 import があっても、テンプレートが使っていない 27 個のために型チェッカーは呼ばれません。135 行目で識別子の宣言を解決し、136 行目でクラスでなければ `null`。139〜140 行目、そのクラスの `DirectiveMeta`、無ければ `PipeMeta` を返します。`import` 文の識別子から別ファイルのクラス宣言へ辿るのは `reflector.getDeclarationOfIdentifier`（135 行目）の仕事です。
3. **52〜58 行目：Map に積む。依存側が poisoned なら自分も poisoned**

   53 行目で名前 → metadata、54 行目で識別子を配列に。56〜57 行目、依存のディレクティブに解析エラーがあれば自分のスコープも `isPoisoned` です。
4. **62〜69 行目：`kind: Selectorless` のスコープを返す**

   65〜66 行目が 81〜82 行目の 2 つのフィールドです。`schemas` はコンポーネント自身のもの（68 行目）。

> [!NOTE]
> **ポイント**
>
> 「同じ名前のクラスが import とローカル宣言の両方にあったら」は、80〜121 行目の `result.set`（`Map`）で決まります。1 つの名前に残る識別子は 1 つだけです。`Block` → `SourceFile` の順に走査しながら `set` しているので、どの階層の識別子が残るかはこの走査順と `Map.set` の上書きで決まります。ngtsc のテスト `selectorless_spec.ts` には「should pick the dependency closest to the class」という spec があります。

## 6. dependencies と照合：セレクタが要らなくなる理由、そして残っている TODO

スコープができたあと、`ComponentDecoratorHandler.resolve` が `dependencies` を組み立てる部分です。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1872–1898 （▶ の行: 1873, 1881–1882, 1884–1885, 1887, 1893–1894）

```ts
1872 │     const isModuleScope = scope.kind === ComponentScopeKind.NgModule;
1873 ▶     const isSelectorlessScope = scope.kind === ComponentScopeKind.Selectorless;
1874 │     const pipes = new Map<string, PipeMeta>();
1875 │ 
1876 │     // Dependencies from the `@Component.deferredImports` field.
1877 │     const explicitlyDeferredDependencies =
1878 │       scope.kind === ComponentScopeKind.Standalone ? scope.deferredDependencies : null;
1879 │     const dependencies: (DirectiveMeta | PipeMeta | NgModuleMeta)[] = [];
1880 │ 
1881 ▶     if (isSelectorlessScope) {
1882 ▶       for (const [localName, dep] of scope.dependencies) {
1883 │         // In selectorless the pipes are referred to by their local name.
1884 ▶         if (dep.kind === MetaKind.Pipe) {
1885 ▶           pipes.set(localName, dep);
1886 │         }
1887 ▶         dependencies.push(dep);
1888 │       }
1889 │     } else {
1890 │       const scopeDeps = isModuleScope ? scope.compilation.dependencies : scope.dependencies;
1891 │       for (const dep of scopeDeps) {
1892 │         // Outside of selectorless the pipes are referred to by their defined name.
1893 ▶         if (dep.kind === MetaKind.Pipe && dep.name !== null) {
1894 ▶           pipes.set(dep.name, dep);
1895 │         }
1896 │         dependencies.push(dep);
1897 │       }
1898 │     }
```

1873 行目で selectorless かを判定。1881〜1888 行目、selectorless なら `Map` を回し、**1885 行目、パイプは `localName`（クラス名）をキーに**登録します。従来の経路は 1893〜1894 行目のとおり `dep.name`（`@Pipe` の `name`）です。どちらも 1887 / 1896 行目で同じ `dependencies` 配列に積まれるので、ここから先の `eagerDeclarations`（[第 4 回](04-standalone-used-only.md)）と出力は従来の standalone と同じです。ngtsc のテストで出力を確認します。

📄 `angular/packages/compiler-cli/test/ngtsc/selectorless_spec.ts` L981–997 （▶ の行: 985, 987, 995–996）

```ts
981 │       env.write(
982 │         'test.ts',
983 │         `
984 │           import {Component} from '@angular/core';
985 ▶           import {DepComp, DepDir, DepPipe} from './dep';
986 │ 
987 ▶           @Component({template: '<DepComp @DepDir>{{123 | DepPipe}}</DepComp>'})
988 │           export class Comp {}
989 │         `,
990 │       );
991 │ 
992 │       env.driveMain();
993 │ 
994 │       const jsContents = env.getContents('test.js');
995 ▶       expect(jsContents).toContain('import * as i1 from "./dep";');
996 ▶       expect(jsContents).toContain('dependencies: [i1.DepComp, i1.DepDir, i1.DepPipe]');
997 │     });
```

985 行目で 3 つを import し、987 行目のテンプレートは `<DepComp @DepDir>{{123 | DepPipe}}</DepComp>`。`imports` はありません。996 行目、出力は `dependencies: [i1.DepComp, i1.DepDir, i1.DepPipe]`。`ɵcmp.dependencies` の形は[第 1 回](01-standalone.md)と同じです。

### 照合：CSS セレクタではなく名前の Map

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L2794–2808 （▶ の行: 2798–2799, 2801–2803, 2807）

```ts
2794 │ function createMatcherFromScope(
2795 │   scope: ComponentScope,
2796 │   hostDirectivesResolver: HostDirectivesResolver,
2797 │ ): DirectiveMatcher<DirectiveMeta> {
2798 ▶   if (scope.kind === ComponentScopeKind.Selectorless) {
2799 ▶     const registry = new Map<string, DirectiveMeta[]>();
2800 │ 
2801 ▶     for (const [name, dep] of scope.dependencies) {
2802 ▶       if (dep.kind === MetaKind.Directive) {
2803 ▶         registry.set(name, [dep, ...hostDirectivesResolver.resolve(dep)]);
2804 │       }
2805 │     }
2806 │ 
2807 ▶     return new SelectorlessMatcher(registry);
2808 │   }
```

📄 `angular/packages/compiler/src/directive_matching.ts` L476–482 （▶ の行: 477, 479–480）

```ts
476 │ export class SelectorlessMatcher<T = unknown> {
477 ▶   constructor(private registry: Map<string, T[]>) {}
478 │ 
479 ▶   match(name: string): T[] {
480 ▶     return this.registry.has(name) ? this.registry.get(name)! : [];
481 │   }
482 │ }
```

`createMatcherFromScope` はテンプレート型検査に使うマッチャを作ります。2798 行目、selectorless なら 2799〜2805 行目で `名前 → [そのディレクティブ, ...hostDirectives]` の `Map` を作り、2807 行目で `SelectorlessMatcher` に渡します。その `match`（479〜481 行目）は `registry.get(name)` だけ。従来の `SelectorMatcher` が要素名・属性・クラスを CSS セレクタとして照合していたのに対し、**名前の完全一致**です。テンプレートに書いた `<DepComp>` の `componentName` がそのままキーなので、照合という計算が不要になります。これが[第 7 回](07-standalone-directive-registry.md)で読んだ `findDirectiveDefMatches` との違いです。

### @defer との関係

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L2641–2652 （▶ の行: 2642–2644）

```ts
2641 │       // Selectorless references dependencies directly so we register through the identifiers.
2642 ▶       if (scope.kind === ComponentScopeKind.Selectorless) {
2643 ▶         for (const identifier of scope.dependencyIdentifiers) {
2644 ▶           this.registerDeferrableCandidate(
2645 │             componentClassDecl,
2646 │             identifier,
2647 │             false /* isDeferredImport */,
2648 │             allDeferredDecls,
2649 │             eagerlyUsedDecls,
2650 │             resolutionData,
2651 │           );
2652 │         }
```

2642〜2644 行目、selectorless では 5 節の `dependencyIdentifiers`（import 文の識別子）を 1 つずつ `registerDeferrableCandidate` に渡します。[第 11 回](11-standalone-defer-deps.md)の 「`imports` 配列の識別子を候補にする」処理の selectorless 版です。結果は次の spec のとおりです。

📄 `angular/packages/compiler-cli/test/ngtsc/selectorless_spec.ts` L1100–1124 （▶ の行: 1108, 1116, 1120, 1124）

```ts
1100 │       env.write(
1101 │         'test.ts',
1102 │         `
1103 │           import { Component } from '@angular/core';
1104 │           import { DepComp } from './dep-comp';
1105 │           import { DepDir } from './dep-dir';
1106 │           import { DepPipe } from './dep-pipe';
1107 │ 
1108 ▶           @Component({template: '@defer {<DepComp @DepDir>{{123 | DepPipe}}</DepComp>}'})
1109 │           export class Comp {}
1110 │         `,
1111 │       );
1112 │ 
1113 │       env.driveMain();
1114 │ 
1115 │       const jsContents = env.getContents('test.js');
1116 ▶       expect(jsContents).not.toContain('import { DepComp');
1117 │       expect(jsContents).not.toContain('import { DepDir');
1118 │       expect(jsContents).not.toContain('import { DepPipe');
1119 │       expect(cleanNewLines(jsContents)).toContain(
1120 ▶         'const Comp_Defer_1_DepsFn = () => [/* @ts-ignore */ import("./dep-comp").then(m => m.DepComp), ' +
1121 │           '/* @ts-ignore */ import("./dep-dir").then(m => m.DepDir), ' +
1122 │           '/* @ts-ignore */ import("./dep-pipe").then(m => m.DepPipe)];',
1123 │       );
1124 ▶       expect(jsContents).toContain('ɵɵdefer(1, 0, Comp_Defer_1_DepsFn);');
```

1108 行目、`@defer` の中だけで使った 3 つは、1116 行目のとおり静的 import が消え、1120〜1122 行目の `import()` になり、1124 行目で `ɵɵdefer(1, 0, Comp_Defer_1_DepsFn)` に渡ります。

### 残っている TODO：テンプレート関数には Component ノードの命令が出ない

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L309–315 （▶ の行: 311–312）

```ts
309 │     } else if (node instanceof t.BoundaryBlock) {
310 │       ingestBoundaryBlock(unit, node);
311 ▶     } else if (node instanceof t.Component) {
312 ▶       // TODO(crisbeto): account for selectorless nodes.
313 │     } else {
314 │       throw new Error(`Unsupported template node: ${node.constructor.name}`);
315 │     }
```

テンプレート AST を中間表現に変換する `ingestNodes` の分岐です。311 行目、`t.Component` ノードに対する処理は **312 行目の `TODO` コメントだけ**で、命令は 1 つも生成されません。つまり v22.2.0-next.7 の時点では、`dependencies` の出力・型検査・`@defer` 対応はあるが、`<MyCmp>` を実際に描画するテンプレート関数の生成は未実装です。`packages/core/src` にも selectorless という語は出てきません（実行時側の実装はまだ無い）。このため第 7 回の `directiveRegistry` が selectorless でどう使われるかは、ソースからは言えません。

## ここまでの呼び出し

- 👤 `_enableSelectorless: true` — tsconfig の angularCompilerOptions（@internal）
  - `new NgCompiler(...)` — compiler-cli/src/ngtsc/core/src/compiler.ts L475 — *enableSelectorless = options\['\_enableSelectorless'\] ?? false*
  - `ComponentDecoratorHandler.analyze(Cmp)` — annotations/component/src/handler.ts
    - `parseTemplate(tpl, url, {enableSelectorless})` — compiler/src/render3/view/template.ts L140
      - `_Tokenizer._consumeTagOpen()` — compiler/src/ml\_parser/lexer.ts L892 — *大文字始まり → COMPONENT\_OPEN\_START、@Name → \_consumeDirective*
      - `HtmlAstToIvyAst.visitComponent()` — compiler/src/render3/r3\_template\_transform.ts L379 — *new t.Component(componentName, tagName, ...)*
    - `analyzeTemplateForSelectorless(template.nodes)` — component/src/selectorless.ts L24 — *componentName / directive.name / ReferencedDirectly なパイプ名を Set に*
    - standalone 検査 / imports 検査 — handler.ts L837 / L847 — *NG2010 / NG2026 → isPoisoned*
  - `ComponentDecoratorHandler.resolve(Cmp)` — handler.ts
    - `StandaloneComponentScopeReader.getScopeForComponent()` — scope/src/standalone.ts L39 — *selectorlessEnabled → null*
    - `SelectorlessComponentScopeReader.getScopeForComponent()` — scope/src/selectorless\_scope.ts L27
      - `getAvailableIdentifiers(node)` — selectorless\_scope.ts L80 — *Block → SourceFile のクラス宣言と import 文を Map に*
      - `getMetaFromIdentifier(meta, name, id)` × 名前 — selectorless\_scope.ts L124 — *localReferencedSymbols にある名前だけ getDeclarationOfIdentifier*
    - `createMatcherFromScope(scope)` — handler.ts L2794 — *SelectorlessMatcher（名前の Map）で型検査*
    - `dependencies` 組み立て — handler.ts L1881 — *Map を配列へ。パイプは localName*
  - `ingestNodes()` — compiler/src/template/pipeline/src/ingest.ts L311 — *t.Component は TODO（命令なし）*

## 聞かれそうな質問

**Q. 今のプロジェクトで使えますか？**

使えません。オプション `_enableSelectorless` は `@internal`（options.ts 111 行目）で既定は `false`（compiler.ts 475 行目）です。さらに、テンプレート関数の生成で `t.Component` ノードは `TODO` のまま命令を出しません（ingest.ts 311〜312 行目）。「コンパイルが通って `dependencies` が出る」ところまでがソースにある事実で、描画まではまだ繋がっていません。

**Q. imports と併用できないのはなぜですか？**

handler.ts 847〜856 行目で `rawImports` か `rawDeferredImports` があれば `NG2026`（error\_code.ts 184 行目）になり、`isPoisoned` です。selectorless のスコープはファイルの `import` 文（selectorless\_scope.ts 99〜113 行目）から作られ、`imports` のスコープは `StandaloneComponentScopeReader` が作ります。1 つのコンポーネントにスコープの読み手は 1 つだけ （standalone.ts 39 行目と selectorless\_scope.ts 35 行目が互いに排他）なので、両方書いても片方しか使えず、エラーで知らせています。

**Q. テンプレートに &lt;MyCmp&gt; が無いファイルでフラグを ON にしたら？**

何も変わりません。`analyzeTemplateForSelectorless` の 30 行目で `isSelectorless` は 「集めた名前が 1 つ以上あるか」で決まります。無ければ `selectorlessEnabled = false` のまま（handler.ts 827 / 832 行目）で、従来の `imports` 経路です。判定はコンパイラ単位ではなくテンプレート単位です。

**Q. &lt;div&gt; のような小文字のタグはコンポーネントと誤解されませんか？**

されません。lexer.ts 892 行目の `isSelectorlessNameStart`（1551〜1553 行目）は `_` か大文字 A〜Z だけを先頭文字として認め、小文字は 903 行目以降の従来の要素として読まれます。ディレクティブ側も 937 行目で `@` の次が大文字か `_` であることを確かめます。

**Q. パイプはどう書き、どう解決されますか？**

`{{ x | DatePipe }}` とクラス名で書きます。式パーサに `_supportsDirectPipeReferences`（parser.ts 105 行目）が渡っていると `BindingPipeType.ReferencedDirectly`（ast.ts 167 行目）のノードになり、selectorless.ts 46〜47 行目で名前が集められます。`dependencies` を組むとき handler.ts 1885 行目で `localName` をキーにするので、`@Pipe` の `name` は使われません。

**Q. import \* as ns や変数経由の参照はスコープに入りますか？**

入りません。selectorless\_scope.ts 80〜121 行目が登録するのはクラス宣言（93〜94 行目）、名前付き import（104〜107 行目）、既定 import（111〜112 行目）の 3 種類だけです。名前空間 import は 104 行目の `isNamedImports` に当たらず、変数文は分岐自体がありません。

## 読み終えて

- 入口は `@internal` の `_enableSelectorless`（options.ts 113 行目）1 つ。既定 `false`（compiler.ts 475 行目）
- 字句解析は `<` の次が大文字なら `COMPONENT_OPEN_START`（lexer.ts 892 行目）、`@大文字` なら `_consumeDirective`（938 行目）。AST は `Component` / `Directive` ノードで、セレクタを持たない
- `analyzeTemplateForSelectorless` がクラス名を集め、1 つ以上あればそのテンプレートだけ selectorless（selectorless.ts 30 行目）。standalone でなければ NG2010、`imports` があれば NG2026（handler.ts 837 / 847 行目）
- スコープは `SelectorlessComponentScopeReader` がファイルの `import` 文とクラス宣言から `Map<名前, meta>` を作る。テンプレートが使った名前だけ型チェッカーに聞く（selectorless\_scope.ts 131 行目）
- 照合は `SelectorlessMatcher.match(name)` の `Map.get`（directive\_matching.ts 480 行目）。`dependencies` の出力と `@defer` 対応はあるが、テンプレート関数の生成は TODO（ingest.ts 312 行目）

---

← 前: [TestBed.overrideComponent で standalone の imports を差し替えると何が再コンパイルされるか](12-standalone-testbed-override.md)  
次: [foreignImports（内部向け）：他フレームワークのコンポーネントを standalone の依存に並べる](14-standalone-foreign-imports.md) →
