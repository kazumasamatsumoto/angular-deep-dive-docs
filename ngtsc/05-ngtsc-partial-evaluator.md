[目次](../README.md) › [ngtsc の内側](README.md) › 第 5 回 / 全 20 回

# 静的な評価：デコレーターの引数を、動かさずに読む

> PartialEvaluator と StaticInterpreter が式をたどって ResolvedValue（数・文字列・Map・配列・Reference・EnumValue・DynamicValue）にする行、別のファイルの const や関数をたどる仕組み、評価できないときの DynamicValue と、その理由を診断に書く traceDynamicValue、組み込みの関数（配列の slice・concat など）と foreign function resolver。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-partial-evaluator)

---

`@Component({ imports: SHARED })` の `SHARED` は、別のファイルの `const` です。ngtsc はアプリを動かさずに、この式が「どのクラスの配列か」を知る必要があります。その仕事をするのが `PartialEvaluator`（部分的な評価器）と、その中身の `StaticInterpreter` です。TypeScript の構文木を 1 つずつたどり、値を `ResolvedValue` にします。分からない部分は捨てずに、`DynamicValue`（「静的には分からない」という印）にして、分からなかった理由を持ち運びます。この章では、式の種類ごとの分岐、識別子を宣言にたどって別のファイルへ移る行、関数の呼び出しを「return 1 文の関数だけ」評価する行、組み込みの関数、そして `DynamicValue` の理由が診断のメッセージになるまでを、1 行ずつ読みます。

読む対象は `packages/compiler-cli/src/ngtsc/partial_evaluator/` の `src/interface.ts`・`src/interpreter.ts`（912 行）・`src/result.ts`・`src/dynamic.ts`・`src/builtin.ts`・`src/diagnostics.ts` と、spec の `test/evaluator_spec.ts`・`test/diagnostics_spec.ts` です。ページの DEMO は、このサイトの node\_modules にある本物の `@angular/compiler-cli` 22.1.6 を Node で動かした記録です。

1. [1. 全体像](01-ngtsc-overview.md)
2. [2. NgtscProgram](02-ngtsc-program.md)
3. [3. NgCompiler とチケット](03-ngtsc-compiler-ticket.md)
4. [4. リフレクション](04-ngtsc-reflection.md)
5. **5. 静的な評価**（この章）
6. [6. 参照と import](06-ngtsc-references-imports.md)
7. [7. 解析](07-ngtsc-trait-analyze.md)
8. [8. 解決と出力](08-ngtsc-trait-resolve-compile.md)
9. [9. @Directive の handler](09-ngtsc-directive-handler.md)
10. [10. メタデータの登録](10-ngtsc-metadata-registry.md)
11. [11. .d.ts を読む](11-ngtsc-dts-metadata.md)
12. [12. JS の書き換え](12-ngtsc-ivy-transform.md)
13. [13. .d.ts の書き換え](13-ngtsc-dts-transform.md)
14. [14. 差分ビルド](14-ngtsc-incremental.md)
15. [15. 意味のグラフ](15-ngtsc-semantic-graph.md)
16. [16. import の循環](16-ngtsc-cycles.md)
17. [17. HMR](17-ngtsc-hmr.md)
18. [18. 診断と性能](18-ngtsc-diagnostics-perf.md)
19. [19. テストを書く](19-ngtsc-test-env.md)
20. [20. issue と PR を読む](20-ngtsc-issues.md)

## 1. 入口：evaluate は式 1 つと「文脈」を渡すだけ

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interface.ts` L19–45 （▶ の行: 19, 35–36, 38–43）

```ts
19 ▶ export type ForeignFunctionResolver = (
20 │   fn: Reference<ts.FunctionDeclaration | ts.MethodDeclaration | ts.FunctionExpression>,
21 │   callExpr: ts.CallExpression,
22 │   resolve: (expr: ts.Expression) => ResolvedValue,
23 │   unresolvable: DynamicValue,
24 │ ) => ResolvedValue;
25 │ 
26 │ export type ForeignTypeResolver = (typeNode: ts.TypeNode) => ts.TypeNode | null;
27 │ 
28 │ export class PartialEvaluator {
29 │   constructor(
30 │     private host: ReflectionHost,
31 │     private checker: ts.TypeChecker,
32 │     private dependencyTracker: DependencyTracker | null,
33 │   ) {}
34 │ 
35 ▶   evaluate(expr: ts.Expression, foreignFunctionResolver?: ForeignFunctionResolver): ResolvedValue {
36 ▶     const interpreter = new StaticInterpreter(this.host, this.checker, this.dependencyTracker);
37 │     const sourceFile = expr.getSourceFile();
38 ▶     return interpreter.visit(expr, {
39 ▶       originatingFile: sourceFile,
40 ▶       absoluteModuleName: null,
41 ▶       resolutionContext: sourceFile.fileName,
42 ▶       scope: new Map<ts.ParameterDeclaration, ResolvedValue>(),
43 ▶       foreignFunctionResolver,
44 │     });
45 │   }
```

handler（@Component などを担当する部品。[第 7 回](07-ngtsc-trait-analyze.md)）は、デコレーターの引数の式を 1 つずつ `evaluate` に渡します。35 行目の引数は式と、任意の `ForeignFunctionResolver`（19〜24 行目。本体を読めない関数の呼び出しを、呼ぶ側の知恵で解く関数。7 節）だけです。

1. **36 行目：呼ぶたびに新しい StaticInterpreter**

   評価器はキャッシュを持ちません。同じ式を 2 回渡せば 2 回たどります。
2. **39 行目：originatingFile**

   評価を始めたファイルです。別のファイルの宣言に移っても変わらず、5 節の「依存の記録」で「このファイルは、あのファイルに依存する」の左側になります。
3. **40〜41 行目：absoluteModuleName と resolutionContext**

   「いま、どのパッケージ名を通ってここに来たか」です。始めは `null`（自分のプロジェクトの中）。`'@angular/common'` から import した名前をたどると、ここが書き換わります（5 節）。
4. **42 行目：scope**

   関数の本体を評価するときの「引数 → 値」の表です。始めは空です（7 節）。

## 2. 答えの形：ResolvedValue

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/result.ts` L24–37 （▶ の行: 30–35, 37）

```ts
24 │ export type ResolvedValue =
25 │   | number
26 │   | boolean
27 │   | string
28 │   | null
29 │   | undefined
30 ▶   | Reference
31 ▶   | EnumValue
32 ▶   | ResolvedValueArray
33 ▶   | ResolvedValueMap
34 ▶   | ResolvedModule
35 ▶   | KnownFn
36 │   | SyntheticValue<unknown>
37 ▶   | DynamicValue<unknown>;
```

| 型 | 何が来るか | 例（この章の DEMO） |
| --- | --- | --- |
| number・boolean・string・null・undefined | JavaScript の値そのもの | `` `${PREFIX}-d` `` → `'app-d'` |
| `Reference`（30 行目） | クラス・関数・宣言だけの変数など「値として持ち運べない宣言」への参照。どこから来たかも覚える（[第 6 回](06-ngtsc-references-imports.md)） | `ButtonCmp` |
| `EnumValue`（31 行目） | enum の 1 つのメンバー。enum への Reference・名前・値 | `Size.Large` |
| `ResolvedValueArray`・`ResolvedValueMap`（32〜33 行目） | 配列と、オブジェクトのリテラル（文字列のキーの `Map`） | `{...BASE, '[class.x]': 'true'}` |
| `ResolvedModule`（34 行目） | `import * as ns` の `ns`。export を求められたときに 1 つずつ評価する | — |
| `KnownFn`（35 行目） | 評価器が中身を知っている関数（配列の `slice`・`concat` など。6 節） | `SHARED.concat` |
| `DynamicValue`（37 行目） | 静的には分からない。理由と、どの構文木の節（node）で分からなくなったかを持つ（9 節） | `complex(LocalCmp)` |

大事なのは、**配列の中の 1 つが分からなくても、配列全体は配列のまま**返ることです。`[A, someCall()]` は「1 つ目が Reference、2 つ目が DynamicValue の配列」になり、handler は分かる部分だけを使えます。これが「部分的な」評価器という名前の意味です。

## 3. visitExpression：式の種類ごとの分岐

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L106–133 （▶ の行: 112, 118, 120, 124–126, 128, 130, 132）

```ts
106 │   visit(node: ts.Expression, context: Context): ResolvedValue {
107 │     return this.visitExpression(node, context);
108 │   }
109 │ 
110 │   private visitExpression(node: ts.Expression, context: Context): ResolvedValue {
111 │     let result: ResolvedValue;
112 ▶     if (node.kind === ts.SyntaxKind.TrueKeyword) {
113 │       return true;
114 │     } else if (node.kind === ts.SyntaxKind.FalseKeyword) {
115 │       return false;
116 │     } else if (node.kind === ts.SyntaxKind.NullKeyword) {
117 │       return null;
118 ▶     } else if (ts.isStringLiteral(node)) {
119 │       return node.text;
120 ▶     } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
121 │       return node.text;
122 │     } else if (ts.isTemplateExpression(node)) {
123 │       result = this.visitTemplateExpression(node, context);
124 ▶     } else if (ts.isNumericLiteral(node)) {
125 ▶       return parseFloat(node.text);
126 ▶     } else if (ts.isObjectLiteralExpression(node)) {
127 │       result = this.visitObjectLiteralExpression(node, context);
128 ▶     } else if (ts.isIdentifier(node)) {
129 │       result = this.visitIdentifier(node, context);
130 ▶     } else if (ts.isPropertyAccessExpression(node)) {
131 │       result = this.visitPropertyAccessExpression(node, context);
132 ▶     } else if (ts.isCallExpression(node)) {
133 │       result = this.visitCallExpression(node, context);
```

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L134–159 （▶ の行: 134, 138, 140, 144, 146, 148, 150, 152–153, 155–156）

```ts
134 ▶     } else if (ts.isConditionalExpression(node)) {
135 │       result = this.visitConditionalExpression(node, context);
136 │     } else if (ts.isPrefixUnaryExpression(node)) {
137 │       result = this.visitPrefixUnaryExpression(node, context);
138 ▶     } else if (ts.isBinaryExpression(node)) {
139 │       result = this.visitBinaryExpression(node, context);
140 ▶     } else if (ts.isArrayLiteralExpression(node)) {
141 │       result = this.visitArrayLiteralExpression(node, context);
142 │     } else if (ts.isParenthesizedExpression(node)) {
143 │       result = this.visitParenthesizedExpression(node, context);
144 ▶     } else if (ts.isElementAccessExpression(node)) {
145 │       result = this.visitElementAccessExpression(node, context);
146 ▶     } else if (ts.isAsExpression(node)) {
147 │       result = this.visitExpression(node.expression, context);
148 ▶     } else if (ts.isNonNullExpression(node)) {
149 │       result = this.visitExpression(node.expression, context);
150 ▶     } else if (this.host.isClass(node)) {
151 │       result = this.visitDeclaration(node, context);
152 ▶     } else {
153 ▶       return DynamicValue.fromUnsupportedSyntax(node);
154 │     }
155 ▶     if (result instanceof DynamicValue && result.node !== node) {
156 ▶       return DynamicValue.fromDynamicInput(node, result);
157 │     }
158 │     return result;
159 │   }
```

1. **112〜125 行目：リテラルはその場で返す**

   `true`・`false`・`null`・文字列・数（125 行目で `parseFloat`）。式の中に何も無いので、DynamicValue にはなりません。
2. **122・126〜145 行目：中に式を持つものは visitXxx へ**

   テンプレートの文字列・オブジェクト・識別子・プロパティの参照・呼び出し・条件・単項・二項・配列・括弧・添字。4〜8 節で 1 つずつ読みます。
3. **146〜149 行目：`as` と `!` は素通り**

   型の注釈は値を変えないので、中の式をそのまま評価します。`42 as any` は 42 です。
4. **152〜153 行目：知らない構文は UNSUPPORTED\_SYNTAX**

   アロー関数・`new`・`typeof x` などです。投げずに DynamicValue を返します。
5. **155〜156 行目：内側の DynamicValue を、この node で包み直す**

   visitXxx が返した DynamicValue の node が自分と違えば、`fromDynamicInput(node, result)` で「この式は、中の式が分からないので分からない」という外側の段を足します。これを繰り返すので、DynamicValue は**外側から内側への連なり**になります（9 節の診断はこの連なりを読みます）。

> **🧪 DEMO — 本物の PartialEvaluator に、デコレーターの引数の式を渡す（記録）**
>
> これは記録です。@angular/compiler-cli 22.1.6（TypeScript 6.0.3）を Node で動かし、下の 2 つのファイルの `class A`〜`class M` の @Component の引数を `reflectObjectLiteral` で取り出して、`new PartialEvaluator(host, checker, null).evaluate(expr)` に渡した結果です。ボタンを押すまで何もしません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-partial-evaluator)

📄 `記録に使った入力 src/shared.ts`

```ts
import {Component} from '@angular/core';

@Component({selector: 'app-button', template: ''})
export class ButtonCmp {}

@Component({selector: 'app-icon', template: ''})
export class IconCmp {}

export const SHARED = [ButtonCmp, IconCmp];
export const PREFIX = 'app';
export enum Size { Small = 1, Large }
export const BASE = {selector: 'app-base', standalone: true};

export function withExtra(extra: unknown) {
  return [...SHARED, extra];
}

export function complex(extra: unknown) {
  const list = [...SHARED, extra];
  return list;
}

```

📄 `記録に使った入力 src/app.ts`

```ts
import {Component, forwardRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {SHARED, PREFIX, Size, BASE, withExtra, complex, ButtonCmp} from './shared';

declare const config: {width: number};

@Component({selector: 'app-local', template: ''})
export class LocalCmp {}

@Component({selector: 'app-a', template: '', imports: SHARED})
export class A {}

@Component({selector: 'app-b', template: '', imports: [...SHARED, LocalCmp]})
export class B {}

@Component({selector: 'app-c', template: '', imports: SHARED.concat([LocalCmp], CommonModule)})
export class C {}

@Component({selector: `${PREFIX}-d`, template: ''})
export class D {}

@Component({selector: Size.Large > 1 ? 'app-large' : 'app-small', template: ''})
export class E {}

@Component({selector: 'app-f', template: '', host: {...BASE, '[class.x]': 'true'}})
export class F {}

@Component({selector: 'app-g', template: '', imports: withExtra(LocalCmp)})
export class G {}

@Component({selector: 'app-h', template: '', imports: complex(LocalCmp)})
export class H {}

@Component({selector: 'app-i', template: '', imports: [forwardRef(() => LocalCmp)]})
export class I {}

@Component({selector: 'app-j', template: '', imports: [CommonModule, ButtonCmp]})
export class J {}

@Component({selector: `app-${config.width}`, template: ''})
export class K {}

@Component({selector: 'app-l', template: '', imports: [SHARED[1], SHARED.length]})
export class L {}

@Component({selector: `app-${Size.Large}`, template: ''})
export class M {}

```

## 4. 配列・spread・オブジェクト・テンプレートの文字列

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L161–175 （▶ の行: 166, 168–169, 171）

```ts
161 │   private visitArrayLiteralExpression(
162 │     node: ts.ArrayLiteralExpression,
163 │     context: Context,
164 │   ): ResolvedValue {
165 │     const array: ResolvedValueArray = [];
166 ▶     for (let i = 0; i < node.elements.length; i++) {
167 │       const element = node.elements[i];
168 ▶       if (ts.isSpreadElement(element)) {
169 ▶         array.push(...this.visitSpreadElement(element, context));
170 │       } else {
171 ▶         array.push(this.visitExpression(element, context));
172 │       }
173 │     }
174 │     return array;
175 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L640–649 （▶ の行: 641–645, 647）

```ts
640 │   private visitSpreadElement(node: ts.SpreadElement, context: Context): ResolvedValueArray {
641 ▶     const spread = this.visitExpression(node.expression, context);
642 ▶     if (spread instanceof DynamicValue) {
643 ▶       return [DynamicValue.fromDynamicInput(node, spread)];
644 ▶     } else if (!Array.isArray(spread)) {
645 ▶       return [DynamicValue.fromInvalidExpressionType(node, spread)];
646 │     } else {
647 ▶       return spread;
648 │     }
649 │   }
```

169 行目の spread（`...SHARED`）は、640 行目の `visitSpreadElement` が配列を返し、それを `push(...)` で平らに入れます。DEMO の B は `[...SHARED, LocalCmp]` が 3 つの Reference の配列になります。中身が分からなければ 643 行目で 1 つの DynamicValue を、配列でなければ 645 行目で INVALID\_EXPRESSION\_TYPE を、**1 要素として**入れます。ここでも配列全体は壊しません。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L181–216 （▶ の行: 184–185, 187–188, 190–191, 198, 202–203, 212–213）

```ts
181 │     const map: ResolvedValueMap = new Map<string, ResolvedValue>();
182 │     for (let i = 0; i < node.properties.length; i++) {
183 │       const property = node.properties[i];
184 ▶       if (ts.isPropertyAssignment(property)) {
185 ▶         const name = this.stringNameFromPropertyName(property.name, context);
186 │         // Check whether the name can be determined statically.
187 ▶         if (name === undefined) {
188 ▶           return DynamicValue.fromDynamicInput(node, DynamicValue.fromDynamicString(property.name));
189 │         }
190 ▶         map.set(name, this.visitExpression(property.initializer, context));
191 ▶       } else if (ts.isShorthandPropertyAssignment(property)) {
192 │         const symbol = this.checker.getShorthandAssignmentValueSymbol(property);
193 │         if (symbol === undefined || symbol.valueDeclaration === undefined) {
194 │           map.set(property.name.text, DynamicValue.fromUnknown(property));
195 │         } else {
196 │           map.set(property.name.text, this.visitDeclaration(symbol.valueDeclaration, context));
197 │         }
198 ▶       } else if (ts.isSpreadAssignment(property)) {
199 │         const spread = this.visitExpression(property.expression, context);
200 │         if (spread instanceof DynamicValue) {
201 │           return DynamicValue.fromDynamicInput(node, spread);
202 ▶         } else if (spread instanceof Map) {
203 ▶           spread.forEach((value, key) => map.set(key, value));
204 │         } else if (spread instanceof ResolvedModule) {
205 │           spread.getExports().forEach((value, key) => map.set(key, value));
206 │         } else {
207 │           return DynamicValue.fromDynamicInput(
208 │             node,
209 │             DynamicValue.fromInvalidExpressionType(property, spread),
210 │           );
211 │         }
212 ▶       } else {
213 ▶         return DynamicValue.fromUnknown(node);
214 │       }
215 │     }
216 │     return map;
```

- 184〜190 行目：`key: value`。185 行目でキーを文字列にし、決まらなければ（`[someVar]: 1` など）188 行目でオブジェクト全体を DynamicValue にします。配列と違い、オブジェクトは 1 つのキーが分からないだけで全体が分からなくなります。
- 191〜197 行目：`{ prop }` の省略形。型チェッカーで値の宣言を探して 5 節の `visitDeclaration` に渡します。
- 198〜211 行目：`...BASE`。Map なら 203 行目でキーを順に写すので、**後に書いたキーが勝ちます**（JavaScript と同じ）。DEMO の F は `BASE` の 2 つと `'[class.x]'` の 3 つの Map になります。
- 212〜213 行目：メソッド・getter など、それ以外の書き方は全体が UNKNOWN です。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L219–232 （▶ の行: 220, 223–224, 226–227, 229）

```ts
219 │   private visitTemplateExpression(node: ts.TemplateExpression, context: Context): ResolvedValue {
220 ▶     const pieces: string[] = [node.head.text];
221 │     for (let i = 0; i < node.templateSpans.length; i++) {
222 │       const span = node.templateSpans[i];
223 ▶       const value = literal(this.visit(span.expression, context), () =>
224 ▶         DynamicValue.fromDynamicString(span.expression),
225 │       );
226 ▶       if (value instanceof DynamicValue) {
227 ▶         return DynamicValue.fromDynamicInput(node, value);
228 │       }
229 ▶       pieces.push(`${value}`, span.literal.text);
230 │     }
231 │     return pieces.join('');
232 │   }
```

テンプレートの文字列は、`${…}` の中を 223 行目で評価し、下の `literal()`（8 節）で「文字列・数・真偽値・null・undefined のどれか」を確かめます。Reference や配列なら 224 行目で DYNAMIC\_STRING です。DEMO の D（`` `${PREFIX}-d` ``）は、別のファイルの `PREFIX = 'app'` をたどって `'app-d'` になります。

## 5. 識別子を宣言にたどる：別のファイル・パッケージへの移り方

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L234–265 （▶ の行: 235–237, 241, 247, 249, 252–253, 258–259, 261–262）

```ts
234 │   private visitIdentifier(node: ts.Identifier, context: Context): ResolvedValue {
235 ▶     const decl = this.host.getDeclarationOfIdentifier(node);
236 ▶     if (decl === null) {
237 ▶       if (ts.identifierToKeywordKind(node) === ts.SyntaxKind.UndefinedKeyword) {
238 │         return undefined;
239 │       } else {
240 │         // Check if the symbol here is imported.
241 ▶         if (this.dependencyTracker !== null && this.host.getImportOfIdentifier(node) !== null) {
242 │           // It was, but no declaration for the node could be found. This means that the dependency
243 │           // graph for the current file cannot be properly updated to account for this (broken)
244 │           // import. Instead, the originating file is reported as failing dependency analysis,
245 │           // ensuring that future compilations will always attempt to re-resolve the previously
246 │           // broken identifier.
247 ▶           this.dependencyTracker.recordDependencyAnalysisFailure(context.originatingFile);
248 │         }
249 ▶         return DynamicValue.fromUnknownIdentifier(node);
250 │       }
251 │     }
252 ▶     const declContext = {...context, ...joinModuleContext(context, node, decl)};
253 ▶     const result = this.visitDeclaration(decl.node, declContext);
254 │     if (result instanceof Reference) {
255 │       // Only record identifiers to non-synthetic references. Synthetic references may not have the
256 │       // same value at runtime as they do at compile time, so it's not legal to refer to them by the
257 │       // identifier here.
258 ▶       if (!result.synthetic) {
259 ▶         result.addIdentifier(node);
260 │       }
261 ▶     } else if (result instanceof DynamicValue) {
262 ▶       return DynamicValue.fromDynamicInput(node, result);
263 │     }
264 │     return result;
265 │   }
```

1. **235 行目：識別子 → 宣言**

   ReflectionHost（TypeScript の型チェッカーを Angular 向けに包んだもの。[第 4 回](04-ngtsc-reflection.md)）が、import をたどった先の本当の宣言を返します。`import {SHARED} from './shared'` の `SHARED` なら、shared.ts の `const SHARED = …` です。
2. **236〜250 行目：宣言が見つからない**

   `undefined` なら 238 行目で `undefined`。それ以外は 249 行目で UNKNOWN\_IDENTIFIER。import しているのに宣言が無いとき（壊れた import）は、247 行目で「このファイルの依存の解析は失敗した」と記録し、次の差分ビルドでも必ず解析し直させます（[第 14 回](14-ngtsc-incremental.md)）。
3. **252 行目：パッケージを通ったら文脈を書き換える**

   下の `joinModuleContext` です。
4. **253 行目：宣言を評価する**

   次の `visitDeclaration` へ。
5. **254〜260 行目：Reference になったら、この識別子を覚えさせる**

   「このファイルでは、この名前で見える」という記録です。第 6 回の `LocalIdentifierStrategy` は、これを使って import を足さずに済ませます。7 節の forwardRef のような合成の参照（synthetic）には覚えさせません（256〜257 行目のコメント）。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L267–288 （▶ の行: 268–269, 271–276, 279, 281, 285–286）

```ts
267 │   private visitDeclaration(node: DeclarationNode, context: Context): ResolvedValue {
268 ▶     if (this.dependencyTracker !== null) {
269 ▶       this.dependencyTracker.addDependency(context.originatingFile, node.getSourceFile());
270 │     }
271 ▶     if (this.host.isClass(node)) {
272 ▶       return this.getReference(node, context);
273 ▶     } else if (ts.isVariableDeclaration(node)) {
274 ▶       return this.visitVariableDeclaration(node, context);
275 ▶     } else if (ts.isParameter(node) && context.scope.has(node)) {
276 ▶       return context.scope.get(node)!;
277 │     } else if (ts.isExportAssignment(node)) {
278 │       return this.visitExpression(node.expression, context);
279 ▶     } else if (ts.isEnumDeclaration(node)) {
280 │       return this.visitEnumDeclaration(node, context);
281 ▶     } else if (ts.isSourceFile(node)) {
282 │       return this.visitSourceFile(node, context);
283 │     } else if (ts.isBindingElement(node)) {
284 │       return this.visitBindingElement(node, context);
285 ▶     } else {
286 ▶       return this.getReference(node, context);
287 │     }
288 │   }
```

- 268〜270 行目：**宣言のあるファイルへの依存を記録します**。shared.ts の `SHARED` を変えれば app.ts を解析し直す、という差分ビルドの判断の材料です（[第 14 回](14-ngtsc-incremental.md)）。
- 271〜272 行目：クラスなら、中は読まずに Reference にします。`imports` に欲しいのは「どのクラスか」だけだからです。
- 273〜274 行目：変数なら、初期値の式を評価します（下）。275〜276 行目：関数の引数なら、7 節の scope から値を取ります。
- 279 行目：enum（8 節）。281 行目：ファイルそのもの（`import * as ns`）は `ResolvedModule`。285〜286 行目：関数の宣言などは Reference です（7 節で呼び出しのときに中を読みます）。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L289–315 （▶ の行: 290–293, 305–306, 311, 313）

```ts
289 │   private visitVariableDeclaration(node: ts.VariableDeclaration, context: Context): ResolvedValue {
290 ▶     const value = this.host.getVariableValue(node);
291 ▶     if (value !== null) {
292 ▶       return this.visitExpression(value, context);
293 ▶     } else if (isVariableDeclarationDeclared(node)) {
294 │       // If the declaration has a literal type that can be statically reduced to a value, resolve to
295 │       // that value. If not, the historical behavior for variable declarations is to return a
296 │       // `Reference` to the variable, as the consumer could use it in a context where knowing its
297 │       // static value is not necessary.
298 │       //
299 │       // Arguably, since the value cannot be statically determined, we should return a
300 │       // `DynamicValue`. This returns a `Reference` because it's the same behavior as before
301 │       // `visitType` was introduced.
302 │       //
303 │       // TODO(zarend): investigate switching to a `DynamicValue` and verify this won't break any
304 │       // use cases, especially in ngcc
305 ▶       if (node.type !== undefined) {
306 ▶         const evaluatedType = this.visitType(node.type, context);
307 │         if (!(evaluatedType instanceof DynamicValue)) {
308 │           return evaluatedType;
309 │         }
310 │       }
311 ▶       return this.getReference(node, context);
312 │     } else {
313 ▶       return undefined;
314 │     }
315 │   }
```

290〜292 行目：`const SHARED = [ButtonCmp, IconCmp]` の右辺を評価し直すので、DEMO の A は `imports: SHARED` と書いても 2 つの Reference の配列になります。293 行目の `declare const config: …`（初期値の無い宣言）は、型がリテラルなら 305〜309 行目で型から値を作り、そうでなければ 311 行目で**変数そのものへの Reference** を返します。DEMO の K の `config.width` が EXTERNAL\_REFERENCE になるのは、この Reference のプロパティを読もうとするからです（6 節の 426〜430 行目）。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L879–912 （▶ の行: 889–892, 895, 899, 904–907, 910）

```ts
879 │ const EMPTY = {};
880 │ 
881 │ function joinModuleContext(
882 │   existing: Context,
883 │   node: ts.Node,
884 │   decl: Declaration,
885 │ ): {
886 │   absoluteModuleName?: string;
887 │   resolutionContext?: string;
888 │ } {
889 ▶   if (typeof decl.viaModule === 'string' && decl.viaModule !== existing.absoluteModuleName) {
890 ▶     return {
891 ▶       absoluteModuleName: decl.viaModule,
892 ▶       resolutionContext: node.getSourceFile().fileName,
893 │     };
894 │   } else {
895 ▶     return EMPTY;
896 │   }
897 │ }
898 │ 
899 ▶ function owningModule(context: Context, override: OwningModule | null = null): OwningModule | null {
900 │   let specifier = context.absoluteModuleName;
901 │   if (override !== null) {
902 │     specifier = override.specifier;
903 │   }
904 ▶   if (specifier !== null) {
905 ▶     return {
906 ▶       specifier,
907 ▶       resolutionContext: context.resolutionContext,
908 │     };
909 │   } else {
910 ▶     return null;
911 │   }
912 │ }
```

889 行目の `decl.viaModule` は「この宣言には、どのパッケージ名の import を通って来たか」です（ReflectionHost が入れます。相対パスの import なら `null`）。`import {CommonModule} from '@angular/common'` なら `'@angular/common'` なので、890〜893 行目で文脈の `absoluteModuleName` を書き換えます。その文脈で作った Reference は、899〜908 行目の `owningModule` で `bestGuessOwningModule: { specifier: '@angular/common', … }` を持ちます。DEMO の J と C で、`CommonModule` だけ bestGuessOwningModule が入り、`ButtonCmp` は `null` なのはこのためです。これが第 6 回で「パッケージから import を書く」ときの手がかりになります。

## 6. プロパティ・添字・組み込みの関数

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L379–407 （▶ の行: 385–386, 392–393, 395–400, 402–403, 405–407）

```ts
379 │   private accessHelper(
380 │     node: ts.Node,
381 │     lhs: ResolvedValue,
382 │     rhs: string | number,
383 │     context: Context,
384 │   ): ResolvedValue {
385 ▶     const strIndex = `${rhs}`;
386 ▶     if (lhs instanceof Map) {
387 │       if (lhs.has(strIndex)) {
388 │         return lhs.get(strIndex)!;
389 │       } else {
390 │         return undefined;
391 │       }
392 ▶     } else if (lhs instanceof ResolvedModule) {
393 ▶       return lhs.getExport(strIndex);
394 │     } else if (Array.isArray(lhs)) {
395 ▶       if (rhs === 'length') {
396 ▶         return lhs.length;
397 ▶       } else if (rhs === 'slice') {
398 ▶         return new ArraySliceBuiltinFn(lhs);
399 ▶       } else if (rhs === 'concat') {
400 ▶         return new ArrayConcatBuiltinFn(lhs);
401 │       }
402 ▶       if (typeof rhs !== 'number' || !Number.isInteger(rhs)) {
403 ▶         return DynamicValue.fromInvalidExpressionType(node, rhs);
404 │       }
405 ▶       return lhs[rhs];
406 ▶     } else if (typeof lhs === 'string' && rhs === 'concat') {
407 ▶       return new StringConcatBuiltinFn(lhs);
```

`a.b` も `a[b]` も、左辺を評価したあとこの `accessHelper` に来ます。386 行目の Map ならキーで引き、無ければ `undefined`。配列は 395〜400 行目の 3 つの名前だけを特別に扱います。`length` は数、`slice` と `concat` は **KnownFn**（中身を知っている関数）を返し、7 節の呼び出しがそれを実行します。それ以外のメソッド（`map`・`filter` など）は 402〜403 行目で INVALID\_EXPRESSION\_TYPE です。DEMO の L は `SHARED[1]` が IconCmp、`SHARED.length` が 2 です。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/builtin.ts` L14–46 （▶ の行: 20–21, 23, 34, 36–39, 41）

```ts
14 │ export class ArraySliceBuiltinFn extends KnownFn {
15 │   constructor(private lhs: ResolvedValueArray) {
16 │     super();
17 │   }
18 │ 
19 │   override evaluate(node: ts.CallExpression, args: ResolvedValueArray): ResolvedValue {
20 ▶     if (args.length === 0) {
21 ▶       return this.lhs;
22 │     } else {
23 ▶       return DynamicValue.fromUnknown(node);
24 │     }
25 │   }
26 │ }
27 │ 
28 │ export class ArrayConcatBuiltinFn extends KnownFn {
29 │   constructor(private lhs: ResolvedValueArray) {
30 │     super();
31 │   }
32 │ 
33 │   override evaluate(node: ts.CallExpression, args: ResolvedValueArray): ResolvedValue {
34 ▶     const result: ResolvedValueArray = [...this.lhs];
35 │     for (const arg of args) {
36 ▶       if (arg instanceof DynamicValue) {
37 ▶         result.push(DynamicValue.fromDynamicInput(node, arg));
38 ▶       } else if (Array.isArray(arg)) {
39 ▶         result.push(...arg);
40 │       } else {
41 ▶         result.push(arg);
42 │       }
43 │     }
44 │     return result;
45 │   }
46 │ }
```

`slice` は引数 0 個（コピー）のときだけ（20〜21 行目）。`concat` は 38〜39 行目で配列を平らにし、配列でない引数はそのまま足します。DEMO の C の `SHARED.concat([LocalCmp], CommonModule)` は 4 つの Reference の配列です。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L408–439 （▶ の行: 410–411, 413–415, 417–420, 426–427, 429, 434–435, 438）

```ts
408 │     } else if (lhs instanceof Reference) {
409 │       const ref = lhs.node;
410 ▶       if (this.host.isClass(ref)) {
411 ▶         const module = owningModule(context, lhs.bestGuessOwningModule);
412 │         let value: ResolvedValue = undefined;
413 ▶         const member = this.host
414 ▶           .getMembersOfClass(ref)
415 ▶           .find((member) => member.isStatic && member.name === strIndex);
416 │         if (member !== undefined) {
417 ▶           if (member.value !== null) {
418 ▶             value = this.visitExpression(member.value, context);
419 ▶           } else if (member.implementation !== null) {
420 ▶             value = new Reference(member.implementation, module);
421 │           } else if (member.node) {
422 │             value = new Reference(member.node, module);
423 │           }
424 │         }
425 │         return value;
426 ▶       } else if (isDeclaration(ref)) {
427 ▶         return DynamicValue.fromDynamicInput(
428 │           node,
429 ▶           DynamicValue.fromExternalReference(ref, lhs as Reference<ts.Declaration>),
430 │         );
431 │       }
432 │     } else if (lhs instanceof DynamicValue) {
433 │       return DynamicValue.fromDynamicInput(node, lhs);
434 ▶     } else if (lhs instanceof SyntheticValue) {
435 ▶       return DynamicValue.fromSyntheticInput(node, lhs);
436 │     }
437 │ 
438 ▶     return DynamicValue.fromUnknown(node);
439 │   }
```

- 410〜425 行目：クラスへの Reference の `.foo` は、**static メンバーだけ**を探します（415 行目）。初期値があれば評価し（418 行目）、static メソッドなら Reference にします（420 行目）。`FooModule.forRoot()` がこの道です。
- 426〜430 行目：クラスでない宣言への Reference（`declare const config` など）のプロパティは EXTERNAL\_REFERENCE。中身を知る手段が無いからです。
- 434〜435 行目：`SyntheticValue`（外部の関数の解決器が作った、それ以上は評価できない値）は SYNTHETIC\_INPUT。

## 7. 関数の呼び出し：return 1 文だけ

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L441–463 （▶ の行: 442–443, 448–449, 452–453, 456–457, 461）

```ts
441 │   private visitCallExpression(node: ts.CallExpression, context: Context): ResolvedValue {
442 ▶     const lhs = this.visitExpression(node.expression, context);
443 ▶     if (lhs instanceof DynamicValue) {
444 │       return DynamicValue.fromDynamicInput(node, lhs);
445 │     }
446 │ 
447 │     // If the call refers to a builtin function, attempt to evaluate the function.
448 ▶     if (lhs instanceof KnownFn) {
449 ▶       return lhs.evaluate(node, this.evaluateFunctionArguments(node, context));
450 │     }
451 │ 
452 ▶     if (!(lhs instanceof Reference)) {
453 ▶       return DynamicValue.fromInvalidExpressionType(node.expression, lhs);
454 │     }
455 │ 
456 ▶     const fn = this.host.getDefinitionOfFunction(lhs.node);
457 ▶     if (fn === null) {
458 │       return DynamicValue.fromInvalidExpressionType(node.expression, lhs);
459 │     }
460 │ 
461 ▶     if (!isFunctionOrMethodReference(lhs)) {
462 │       return DynamicValue.fromInvalidExpressionType(node.expression, lhs);
463 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L488–497 （▶ の行: 490–491, 493, 495）

```ts
488 │     // If the function is foreign (declared through a d.ts file), attempt to resolve it with the
489 │     // foreignFunctionResolver, if one is specified.
490 ▶     if (fn.body === null && context.foreignFunctionResolver !== undefined) {
491 ▶       const unresolvable = DynamicValue.fromDynamicInput(
492 │         node,
493 ▶         DynamicValue.fromExternalReference(node.expression, lhs),
494 │       );
495 ▶       return context.foreignFunctionResolver(lhs, node, resolveFfrExpr, unresolvable);
496 │     }
497 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L528–557 （▶ の行: 533–536, 540–542, 545–546, 548–549, 551, 554–555）

```ts
528 │   private visitFunctionBody(
529 │     node: ts.CallExpression,
530 │     fn: FunctionDefinition,
531 │     context: Context,
532 │   ): ResolvedValue {
533 ▶     if (fn.body === null) {
534 ▶       return DynamicValue.fromUnknown(node);
535 ▶     } else if (fn.body.length !== 1 || !ts.isReturnStatement(fn.body[0])) {
536 ▶       return DynamicValue.fromComplexFunctionCall(node, fn);
537 │     }
538 │     const ret = fn.body[0] as ts.ReturnStatement;
539 │ 
540 ▶     const args = this.evaluateFunctionArguments(node, context);
541 ▶     const newScope: Scope = new Map<ts.ParameterDeclaration, ResolvedValue>();
542 ▶     const calleeContext = {...context, scope: newScope};
543 │     fn.parameters.forEach((param, index) => {
544 │       let arg = args[index];
545 ▶       if (param.node.dotDotDotToken !== undefined) {
546 ▶         arg = args.slice(index);
547 │       }
548 ▶       if (arg === undefined && param.initializer !== null) {
549 ▶         arg = this.visitExpression(param.initializer, calleeContext);
550 │       }
551 ▶       newScope.set(param.node, arg);
552 │     });
553 │ 
554 ▶     return ret.expression !== undefined
555 ▶       ? this.visitExpression(ret.expression, calleeContext)
556 │       : undefined;
557 │   }
```

1. **442〜450 行目：呼ぶものを評価する**

   KnownFn（6 節の `slice`・`concat`）なら、449 行目で引数を評価して実行します。
2. **452〜463 行目：関数への Reference か**

   456 行目の `getDefinitionOfFunction` が、関数の本体の文と引数の一覧を返します。.d.ts の `declare function` は本体が `null` です。
3. **490〜496 行目：本体が無く、解決器があるなら任せる**

   handler が `imports` の評価に渡す `createForwardRefResolver` がこの道です（[standalone-forward-ref の章](../standalone/05-standalone-forward-ref.md)で、この続き（解決器が呼ぶ `visitFfrExpression` と `synthetic = true`）を読みました）。DEMO の I で切り替えられます。
4. **535〜536 行目：本体が「return 1 文」でなければ COMPLEX\_FUNCTION\_CALL**

   評価器は代入・if・ループを実行しません。`const list = …; return list;` の 2 文でも諦めます（DEMO の H）。それを実行するには、変数の書き換えや、終わらないループの扱いまで要るからです。
5. **540〜552 行目：引数を scope に入れて、return の式を評価する**

   呼ぶ側の文脈で引数を評価し（540 行目）、新しい scope（541 行目）に「引数の宣言 → 値」を入れます。`...rest` は 546 行目で残り全部、省略された引数は 549 行目で既定値。554〜555 行目で return の式を評価すると、本体の中の `extra` は 5 節 275〜276 行目で scope から取られます。

DEMO の G（`withExtra(LocalCmp)`、本体は `return [...SHARED, extra];` の 1 文）は 3 つの Reference の配列、H（同じ中身を 2 文で書いた `complex`）は COMPLEX\_FUNCTION\_CALL です。ライブラリの関数（.d.ts にしか無い関数）を呼んだ結果をデコレーターに書けないのも、本体が無く（533〜534 行目の UNKNOWN）、handler が渡す解決器（forwardRef と `ModuleWithProviders` を読むもの）でしか解けないからです。

> [!TIP]
> **新卒エンジニアへ**
>
> 「デコレーターの中で関数を呼ぶとエラーになった」と聞かれたら、まず関数の本体が `return` 1 文かを見ます。`export const SHARED = [...]` のように**関数ではなく const に置く**のがいちばん確実です（290〜292 行目でそのまま評価されます）。

## 8. 条件・二項演算と、enum

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L559–573 （▶ の行: 563–565, 568–569, 571）

```ts
559 │   private visitConditionalExpression(
560 │     node: ts.ConditionalExpression,
561 │     context: Context,
562 │   ): ResolvedValue {
563 ▶     const condition = this.visitExpression(node.condition, context);
564 ▶     if (condition instanceof DynamicValue) {
565 ▶       return DynamicValue.fromDynamicInput(node, condition);
566 │     }
567 │ 
568 ▶     if (condition) {
569 ▶       return this.visitExpression(node.whenTrue, context);
570 │     } else {
571 ▶       return this.visitExpression(node.whenFalse, context);
572 │     }
573 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L593–619 （▶ の行: 595–596, 601–602, 605, 608–609, 612, 614, 617）

```ts
593 │   private visitBinaryExpression(node: ts.BinaryExpression, context: Context): ResolvedValue {
594 │     const tokenKind = node.operatorToken.kind;
595 ▶     if (!this.BINARY_OPERATORS.has(tokenKind)) {
596 ▶       return DynamicValue.fromUnsupportedSyntax(node);
597 │     }
598 │ 
599 │     const opRecord = this.BINARY_OPERATORS.get(tokenKind)!;
600 │     let lhs: ResolvedValue, rhs: ResolvedValue;
601 ▶     if (opRecord.literal) {
602 ▶       lhs = literal(this.visitExpression(node.left, context), (value) =>
603 │         DynamicValue.fromInvalidExpressionType(node.left, value),
604 │       );
605 ▶       rhs = literal(this.visitExpression(node.right, context), (value) =>
606 │         DynamicValue.fromInvalidExpressionType(node.right, value),
607 │       );
608 ▶     } else {
609 ▶       lhs = this.visitExpression(node.left, context);
610 │       rhs = this.visitExpression(node.right, context);
611 │     }
612 ▶     if (lhs instanceof DynamicValue) {
613 │       return DynamicValue.fromDynamicInput(node, lhs);
614 ▶     } else if (rhs instanceof DynamicValue) {
615 │       return DynamicValue.fromDynamicInput(node, rhs);
616 │     } else {
617 ▶       return opRecord.op(lhs, rhs);
618 │     }
619 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L844–862 （▶ の行: 848–849, 851, 859, 861）

```ts
844 │ function literal(
845 │   value: ResolvedValue,
846 │   reject: (value: ResolvedValue) => ResolvedValue,
847 │ ): ResolvedValue {
848 ▶   if (value instanceof EnumValue) {
849 ▶     value = value.resolved;
850 │   }
851 ▶   if (
852 │     value instanceof DynamicValue ||
853 │     value === null ||
854 │     value === undefined ||
855 │     typeof value === 'string' ||
856 │     typeof value === 'number' ||
857 │     typeof value === 'boolean'
858 │   ) {
859 ▶     return value;
860 │   }
861 ▶   return reject(value);
862 │ }
```

条件は 563 行目で条件だけを評価し、選ばれた側だけを評価します（選ばれない側が分からなくても困りません）。二項演算は、クラスの先頭の表 `BINARY_OPERATORS` にある演算子だけで（無ければ 596 行目で UNSUPPORTED\_SYNTAX）、`+`・`>` などは 602・605 行目で `literal()` を通します。`literal()` は 848〜849 行目で **EnumValue をその値（resolved）に開く**ので、`Size.Large > 1` は enum の値で比べます。`&&` と `||` だけは 608〜611 行目で Reference のままでも計算します。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L317–328 （▶ の行: 318, 320–321, 323–324）

```ts
317 │   private visitEnumDeclaration(node: ts.EnumDeclaration, context: Context): ResolvedValue {
318 ▶     const enumRef = this.getReference(node, context);
319 │     const map = new Map<string, EnumValue>();
320 ▶     node.members.forEach((member, index) => {
321 ▶       const name = this.stringNameFromPropertyName(member.name, context);
322 │       if (name !== undefined) {
323 ▶         const resolved = member.initializer ? this.visit(member.initializer, context) : index;
324 ▶         map.set(name, new EnumValue(enumRef, name, resolved));
325 │       }
326 │     });
327 │     return map;
328 │   }
```

enum は、メンバーごとに `EnumValue(enumRef, name, resolved)` の Map になります。323 行目：初期値があれば評価し、**無ければ forEach の添字（index）**です。

> [!WARNING]
> **ハマりどころ**
>
> DEMO の M と E を見てください。`enum Size { Small = 1, Large }` の `Large` は、TypeScript では 2 です（記録の `checker.getConstantValue` も 2）。ところが 323 行目は添字の 1 を入れるので、評価器の答えは `` `app-${Size.Large}` `` → `'app-1'`、`Size.Large > 1` → false です。本物の NgtscProgram で ``@Component({selector: `app-size-${Size.Large}`})`` を emit すると、出力は `selectors: [["app-size-1"]]` でした（記録）。実行時の `Size.Large` は 2 なので、AOT とソースの意味がずれます。前のメンバーに初期値があり、後ろのメンバーに無い enum だけで起きます。spec の it `enum resolution works`（下の「テストと直し方」）は `A, B, C`（初期値なし）しか確かめていません。

📄 `記録に使った入力 src/enum.ts（NgtscProgram で emit した）`

```
import {Component} from '@angular/core';
import {Size} from './shared';

@Component({selector: `app-size-${Size.Large}`, template: ''})
export class SizeCmp {}

```

## 9. DynamicValue：理由の 10 種類

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/dynamic.ts` L94–117 （▶ の行: 98–101, 104–105, 112, 116）

```ts
 94 │ /**
 95 │  * Represents a value which cannot be determined statically.
 96 │  */
 97 │ export class DynamicValue<R = unknown> {
 98 ▶   private constructor(
 99 ▶     readonly node: ts.Node,
100 ▶     readonly reason: R,
101 ▶     private code: DynamicValueReason,
102 │   ) {}
103 │ 
104 ▶   static fromDynamicInput(node: ts.Node, input: DynamicValue): DynamicValue<DynamicValue> {
105 ▶     return new DynamicValue(node, input, DynamicValueReason.DYNAMIC_INPUT);
106 │   }
107 │ 
108 │   static fromDynamicString(node: ts.Node): DynamicValue {
109 │     return new DynamicValue(node, undefined, DynamicValueReason.DYNAMIC_STRING);
110 │   }
111 │ 
112 ▶   static fromExternalReference(
113 │     node: ts.Node,
114 │     ref: Reference<ts.Declaration>,
115 │   ): DynamicValue<Reference<ts.Declaration>> {
116 ▶     return new DynamicValue(node, ref, DynamicValueReason.EXTERNAL_REFERENCE);
117 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/dynamic.ts` L118–151 （▶ の行: 119, 123, 127, 131, 138, 142, 149）

```ts
118 │ 
119 ▶   static fromUnsupportedSyntax(node: ts.Node): DynamicValue {
120 │     return new DynamicValue(node, undefined, DynamicValueReason.UNSUPPORTED_SYNTAX);
121 │   }
122 │ 
123 ▶   static fromUnknownIdentifier(node: ts.Identifier): DynamicValue {
124 │     return new DynamicValue(node, undefined, DynamicValueReason.UNKNOWN_IDENTIFIER);
125 │   }
126 │ 
127 ▶   static fromInvalidExpressionType(node: ts.Node, value: unknown): DynamicValue<unknown> {
128 │     return new DynamicValue(node, value, DynamicValueReason.INVALID_EXPRESSION_TYPE);
129 │   }
130 │ 
131 ▶   static fromComplexFunctionCall(
132 │     node: ts.Node,
133 │     fn: FunctionDefinition,
134 │   ): DynamicValue<FunctionDefinition> {
135 │     return new DynamicValue(node, fn, DynamicValueReason.COMPLEX_FUNCTION_CALL);
136 │   }
137 │ 
138 ▶   static fromDynamicType(node: ts.TypeNode): DynamicValue {
139 │     return new DynamicValue(node, undefined, DynamicValueReason.DYNAMIC_TYPE);
140 │   }
141 │ 
142 ▶   static fromSyntheticInput(
143 │     node: ts.Node,
144 │     value: SyntheticValue<unknown>,
145 │   ): DynamicValue<SyntheticValue<unknown>> {
146 │     return new DynamicValue(node, value, DynamicValueReason.SYNTHETIC_INPUT);
147 │   }
148 │ 
149 ▶   static fromUnknown(node: ts.Node): DynamicValue {
150 │     return new DynamicValue(node, undefined, DynamicValueReason.UNKNOWN);
151 │   }
```

DynamicValue は 3 つのもの（98〜101 行目）を持ちます。`node`（どこで分からなくなったか）、`reason`（理由に付いてくる値）、`code`（理由の種類。private）。作るのは static の関数だけです。

| 作る関数 | 理由 | reason に入るもの | この章で出てくる場所 |
| --- | --- | --- | --- |
| `fromDynamicInput`（104 行目） | DYNAMIC\_INPUT | 内側の DynamicValue | 3 節 155〜156 行目など、ほぼ全部の visitXxx |
| `fromDynamicString`（108 行目） | DYNAMIC\_STRING | — | 4 節 224 行目・188 行目 |
| `fromExternalReference`（112 行目） | EXTERNAL\_REFERENCE | 宣言への Reference | 6 節 429 行目・7 節 493 行目 |
| `fromUnsupportedSyntax`（119 行目） | UNSUPPORTED\_SYNTAX | — | 3 節 153 行目・8 節 596 行目 |
| `fromUnknownIdentifier`（123 行目） | UNKNOWN\_IDENTIFIER | — | 5 節 249 行目 |
| `fromInvalidExpressionType`（127 行目） | INVALID\_EXPRESSION\_TYPE | 型の合わない値 | 6 節 403 行目・7 節 453 行目 |
| `fromComplexFunctionCall`（131 行目） | COMPLEX\_FUNCTION\_CALL | 関数の定義 | 7 節 536 行目 |
| `fromDynamicType`（138 行目） | DYNAMIC\_TYPE | — | .d.ts の型から値を作れないとき（[第 11 回](11-ngtsc-dts-metadata.md)） |
| `fromSyntheticInput`（142 行目） | SYNTHETIC\_INPUT | SyntheticValue | 6 節 435 行目 |
| `fromUnknown`（149 行目） | UNKNOWN | — | 4 節 213 行目・7 節 534 行目 |

![DEMO の K（`app-${config.width}`）の DynamicValue。外側の 2 段は DYNAMIC_INPUT で、いちばん内側に本当の理由（EXTERNAL_REFERENCE）がある。](../assets/ngtsc-partial-evaluator-1.svg)

*DEMO の K（\`app-${config.width}\`）の DynamicValue。外側の 2 段は DYNAMIC\_INPUT で、いちばん内側に本当の理由（EXTERNAL\_REFERENCE）がある。*

## 10. 診断：traceDynamicValue が理由の連なりを読む

handler は、欲しい型でない値を受け取ると `createValueHasWrongTypeError`（annotations/common/src/diagnostics.ts。handler が共通で使う部品）で FatalDiagnosticError を投げます。値が DynamicValue のとき、そこで呼ばれるのが次の `traceDynamicValue` で、戻り値が診断の `relatedInformation`（「関連する場所」の一覧）になります。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/diagnostics.ts` L75–97 （▶ の行: 79, 87–90, 92, 94）

```ts
75 │ export function traceDynamicValue(
76 │   node: ts.Node,
77 │   value: DynamicValue,
78 │ ): ts.DiagnosticRelatedInformation[] {
79 ▶   return value.accept(new TraceDynamicValueVisitor(node));
80 │ }
81 │ 
82 │ class TraceDynamicValueVisitor implements DynamicValueVisitor<ts.DiagnosticRelatedInformation[]> {
83 │   private currentContainerNode: ts.Node | null = null;
84 │ 
85 │   constructor(private node: ts.Node) {}
86 │ 
87 ▶   visitDynamicInput(value: DynamicValue<DynamicValue>): ts.DiagnosticRelatedInformation[] {
88 ▶     const trace = value.reason.accept(this);
89 ▶     if (this.shouldTrace(value.node)) {
90 ▶       const info = makeRelatedInformation(
91 │         value.node,
92 ▶         'Unable to evaluate this expression statically.',
93 │       );
94 ▶       trace.unshift(info);
95 │     }
96 │     return trace;
97 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/diagnostics.ts` L111–146 （▶ の行: 114, 119, 127, 130, 132, 137, 141, 145）

```ts
111 │   visitExternalReference(
112 │     value: DynamicValue<Reference<ts.Declaration>>,
113 │   ): ts.DiagnosticRelatedInformation[] {
114 ▶     const name = value.reason.debugName;
115 │     const description = name !== null ? `'${name}'` : 'an anonymous declaration';
116 │     return [
117 │       makeRelatedInformation(
118 │         value.node,
119 ▶         `A value for ${description} cannot be determined statically, as it is an external declaration.`,
120 │       ),
121 │     ];
122 │   }
123 │ 
124 │   visitComplexFunctionCall(
125 │     value: DynamicValue<FunctionDefinition>,
126 │   ): ts.DiagnosticRelatedInformation[] {
127 ▶     return [
128 │       makeRelatedInformation(
129 │         value.node,
130 ▶         'Unable to evaluate function call of complex function. A function must have exactly one return statement.',
131 │       ),
132 ▶       makeRelatedInformation(value.reason.node, 'Function is declared here.'),
133 │     ];
134 │   }
135 │ 
136 │   visitInvalidExpressionType(value: DynamicValue): ts.DiagnosticRelatedInformation[] {
137 ▶     return [makeRelatedInformation(value.node, 'Unable to evaluate an invalid expression.')];
138 │   }
139 │ 
140 │   visitUnknown(value: DynamicValue): ts.DiagnosticRelatedInformation[] {
141 ▶     return [makeRelatedInformation(value.node, 'Unable to evaluate statically.')];
142 │   }
143 │ 
144 │   visitUnknownIdentifier(value: DynamicValue): ts.DiagnosticRelatedInformation[] {
145 ▶     return [makeRelatedInformation(value.node, 'Unknown reference.')];
146 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/diagnostics.ts` L156–177 （▶ の行: 161, 164, 167–168, 171, 174）

```ts
156 │   /**
157 │    * Determines whether the dynamic value reported for the node should be traced, i.e. if it is not
158 │    * part of the container for which the most recent trace was created.
159 │    */
160 │   private shouldTrace(node: ts.Node): boolean {
161 ▶     if (node === this.node) {
162 │       // Do not include a dynamic value for the origin node, as the main diagnostic is already
163 │       // reported on that node.
164 ▶       return false;
165 │     }
166 │ 
167 ▶     const container = getContainerNode(node);
168 ▶     if (container === this.currentContainerNode) {
169 │       // The node is part of the same container as the previous trace entry, so this dynamic value
170 │       // should not become part of the trace.
171 ▶       return false;
172 │     }
173 │ 
174 ▶     this.currentContainerNode = container;
175 │     return true;
176 │   }
177 │ }
```

1. **79 行目：連なりの外側から visitor を当てる**

   DYNAMIC\_INPUT の段（87 行目）は、88 行目で**先に内側を**たどってから、89 行目の条件を満たせば 94 行目で自分の段を先頭に足します。だから一覧は外側 → 内側の順です。
2. **161〜165 行目：診断の本体と同じ node は書かない**

   エラーの下線がすでにその式に付いているからです。
3. **167〜172 行目：同じ「入れ物」の中は 1 段だけ**

   入れ物は 1 つの文か分割代入の形です（同じファイルの `getContainerNode`）。`a.b.c.d` の 3 段を全部出さず、文ごとに 1 行にします。
4. **114〜146 行目：いちばん内側の理由を、人に読める文にする**

   COMPLEX\_FUNCTION\_CALL だけは 2 件（呼んだ場所と、130〜132 行目の「Function is declared here.」）です。

> **🧪 DEMO — 本物の NgtscProgram が返した診断（記録）**
>
> これは記録です。下の src/diag.ts を本物の NgtscProgram（@angular/compiler-cli 22.1.6）に通し、`getNgSemanticDiagnostics()` が返した診断のメッセージと relatedInformation を写しました。3 つとも code -991010（`ErrorCode.VALUE_HAS_WRONG_TYPE` = 1010 を `ngErrorCode` が -99 を前に付けた数にしたもの）です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-partial-evaluator)

📄 `記録に使った入力 src/diag.ts`

```ts
import {Component} from '@angular/core';
import {complex} from './shared';

declare const config: {width: number};

function pickSelector() {
  const name = 'app-x';
  return name;
}

@Component({selector: pickSelector(), template: ''})
export class X {}

@Component({selector: `app-${config.width}`, template: ''})
export class Y {}

@Component({selector: 'app-z', template: '', imports: complex(X)})
export class Z {}

```

2 つ目（`` `app-${config.width}` ``）の relatedInformation が 2 件なのは、図の 3 段のうち、いちばん外の段が診断の本体と同じ node（161〜165 行目）だからです。3 つ目は、`complex` の宣言が shared.ts にあるので、「Function is declared here.」が**別のファイル**を指しています。

📄 `記録のスクリプト（scratchpad の記録スクリプト pe.mjs。angular-deep-dive を cwd にして node で走らせる）`

```
// 第 5 回（ngtsc-partial-evaluator）の記録。
// 使い方: cd angular-deep-dive && node <このファイル> > pe.json
// このサイトの node_modules にある本物の @angular/compiler-cli 22.1.6 の PartialEvaluator に、
// デコレーターの引数の式を渡し、ResolvedValue の種類と中身、DynamicValue の理由の連なりを JSON にする。
// 後半は NgtscProgram で同じ形の式を含むコンポーネントをコンパイルし、本物の診断（traceDynamicValue の結果）を記録する。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// パッケージは cwd（angular-deep-dive）の node_modules から読む
const req = createRequire(path.join(process.cwd(), 'package.json'));
const load = (id) => import(pathToFileURL(req.resolve(id)).href);
const ts = (await load('typescript')).default;
const {
  PartialEvaluator,
  TypeScriptReflectionHost,
  Reference,
  DynamicValue,
  createForwardRefResolver,
  reflectObjectLiteral,
} = await load('@angular/compiler-cli/private/migrations');
const { NgtscProgram, createCompilerHost, setFileSystem, NodeJSFileSystem } = await load('@angular/compiler-cli');
setFileSystem(new NodeJSFileSystem());

// 入力のファイルは、このスクリプトの隣の一時ディレクトリに書き、最後に消す
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'b-tmp', 'pe');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
// @angular/core と @angular/common を解決できるように、このサイトの node_modules を指す
fs.symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'));

const FILES = {
  'src/shared.ts': `import {Component} from '@angular/core';

@Component({selector: 'app-button', template: ''})
export class ButtonCmp {}

@Component({selector: 'app-icon', template: ''})
export class IconCmp {}

export const SHARED = [ButtonCmp, IconCmp];
export const PREFIX = 'app';
export enum Size { Small = 1, Large }
export const BASE = {selector: 'app-base', standalone: true};

export function withExtra(extra: unknown) {
  return [...SHARED, extra];
}

export function complex(extra: unknown) {
  const list = [...SHARED, extra];
  return list;
}
`,
  'src/app.ts': `import {Component, forwardRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {SHARED, PREFIX, Size, BASE, withExtra, complex, ButtonCmp} from './shared';

declare const config: {width: number};

@Component({selector: 'app-local', template: ''})
export class LocalCmp {}

@Component({selector: 'app-a', template: '', imports: SHARED})
export class A {}

@Component({selector: 'app-b', template: '', imports: [...SHARED, LocalCmp]})
export class B {}

@Component({selector: 'app-c', template: '', imports: SHARED.concat([LocalCmp], CommonModule)})
export class C {}

@Component({selector: \`\${PREFIX}-d\`, template: ''})
export class D {}

@Component({selector: Size.Large > 1 ? 'app-large' : 'app-small', template: ''})
export class E {}

@Component({selector: 'app-f', template: '', host: {...BASE, '[class.x]': 'true'}})
export class F {}

@Component({selector: 'app-g', template: '', imports: withExtra(LocalCmp)})
export class G {}

@Component({selector: 'app-h', template: '', imports: complex(LocalCmp)})
export class H {}

@Component({selector: 'app-i', template: '', imports: [forwardRef(() => LocalCmp)]})
export class I {}

@Component({selector: 'app-j', template: '', imports: [CommonModule, ButtonCmp]})
export class J {}

@Component({selector: \`app-\${config.width}\`, template: ''})
export class K {}

@Component({selector: 'app-l', template: '', imports: [SHARED[1], SHARED.length]})
export class L {}

@Component({selector: \`app-\${Size.Large}\`, template: ''})
export class M {}
`,
};
for (const [name, text] of Object.entries(FILES)) fs.writeFileSync(path.join(root, name), text);

const options = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  experimentalDecorators: false,
  skipLibCheck: true,
  noEmit: true,
};
const rootNames = Object.keys(FILES).map((f) => path.join(root, f));
const program = ts.createProgram(rootNames, options);
const checker = program.getTypeChecker();
const host = new TypeScriptReflectionHost(checker);
const evaluator = new PartialEvaluator(host, checker, /* dependencyTracker */ null);

const rel = (fileName) => {
  const i = fileName.lastIndexOf('node_modules/');
  return i >= 0 ? fileName.slice(i) : path.relative(root, fileName);
};
const where = (node) => {
  const sf = node.getSourceFile();
  return `${rel(sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
};
const textOf = (node) => {
  const sf = node.getSourceFile?.();
  return sf ? node.getText(sf).replace(/\s+/g, ' ').slice(0, 80) : ts.SyntaxKind[node.kind];
};

// DynamicValue の理由は public の isFromXxx() で読む（dynamic.ts の DynamicValueReason の名前）
const REASONS = [
  ['isFromDynamicInput', 'DYNAMIC_INPUT'],
  ['isFromDynamicString', 'DYNAMIC_STRING'],
  ['isFromExternalReference', 'EXTERNAL_REFERENCE'],
  ['isFromUnsupportedSyntax', 'UNSUPPORTED_SYNTAX'],
  ['isFromUnknownIdentifier', 'UNKNOWN_IDENTIFIER'],
  ['isFromInvalidExpressionType', 'INVALID_EXPRESSION_TYPE'],
  ['isFromComplexFunctionCall', 'COMPLEX_FUNCTION_CALL'],
  ['isFromDynamicType', 'DYNAMIC_TYPE'],
  ['isFromUnknown', 'UNKNOWN'],
];
function reasonOf(dv) {
  for (const [m, name] of REASONS) if (dv[m]()) return name;
  return 'SYNTHETIC_INPUT';
}
function describeDynamic(dv) {
  const chain = [];
  let cur = dv;
  while (cur instanceof DynamicValue) {
    const reason = reasonOf(cur);
    const step = { reason, node: textOf(cur.node), nodeKind: ts.SyntaxKind[cur.node.kind] };
    if (reason === 'COMPLEX_FUNCTION_CALL') step.detail = `関数の本体の文の数: ${cur.reason.body?.length ?? 'なし'}`;
    if (reason === 'EXTERNAL_REFERENCE') step.detail = `参照: ${cur.reason.debugName}（${rel(cur.reason.node.getSourceFile().fileName)}）`;
    chain.push(step);
    cur = reason === 'DYNAMIC_INPUT' ? cur.reason : null;
  }
  return chain;
}

function serialize(value, depth = 0) {
  if (value === null) return { kind: 'null' };
  if (value === undefined) return { kind: 'undefined' };
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { kind: typeof value, value };
  }
  if (value instanceof DynamicValue) return { kind: 'DynamicValue', chain: describeDynamic(value) };
  if (value instanceof Reference) {
    return {
      kind: 'Reference',
      name: value.debugName,
      declaredIn: rel(value.node.getSourceFile().fileName),
      bestGuessOwningModule: value.bestGuessOwningModule?.specifier ?? null,
      synthetic: value.synthetic,
      // identifiers は private。Node から読む（どのファイルの識別子で見つかったか）
      identifiersIn: value.identifiers.map(where),
    };
  }
  if (Array.isArray(value)) return { kind: 'array', items: value.map((v) => serialize(v, depth + 1)) };
  if (value instanceof Map) {
    return { kind: 'Map', entries: [...value.entries()].map(([k, v]) => [k, serialize(v, depth + 1)]) };
  }
  const ctor = value.constructor?.name ?? 'unknown';
  if ('enumRef' in value) {
    return { kind: 'EnumValue', ctor, enumName: value.enumRef.debugName, member: value.name, resolved: serialize(value.resolved) };
  }
  return { kind: ctor };
}

const app = program.getSourceFile(path.join(root, 'src/app.ts'));
const PICK = { A: 'imports', B: 'imports', C: 'imports', D: 'selector', E: 'selector', F: 'host', G: 'imports', H: 'imports', I: 'imports', J: 'imports', K: 'selector', L: 'imports', M: 'selector' };
const scenes = [];
for (const stmt of app.statements) {
  if (!ts.isClassDeclaration(stmt) || !(stmt.name.text in PICK)) continue;
  const decorator = host.getDecoratorsOfDeclaration(stmt)[0];
  const props = reflectObjectLiteral(decorator.args[0]);
  const key = PICK[stmt.name.text];
  const expr = props.get(key);
  const without = serialize(evaluator.evaluate(expr));
  const entry = { cls: stmt.name.text, key, expr: textOf(expr), result: without };
  if (stmt.name.text === 'I') {
    // imports の評価で handler が渡すのと同じ解決器（createForwardRefResolver(isCore=false)）を渡す
    entry.withForwardRefResolver = serialize(evaluator.evaluate(expr, createForwardRefResolver(false)));
  }
  scenes.push(entry);
}

// 比べるために、TypeScript 自身が計算した enum の値（checker.getConstantValue）も記録する
const shared = program.getSourceFile(path.join(root, 'src/shared.ts'));
const sizeEnum = shared.statements.find((s) => ts.isEnumDeclaration(s));
const enumByTypeScript = sizeEnum.members.map((m) => ({ member: m.name.getText(shared), value: checker.getConstantValue(m) }));

// 後半: NgtscProgram で、評価できない式を含むコンポーネントをコンパイルし、本物の診断を読む
const diagFile = 'src/diag.ts';
fs.writeFileSync(
  path.join(root, diagFile),
  `import {Component} from '@angular/core';
import {complex} from './shared';

declare const config: {width: number};

function pickSelector() {
  const name = 'app-x';
  return name;
}

@Component({selector: pickSelector(), template: ''})
export class X {}

@Component({selector: \`app-\${config.width}\`, template: ''})
export class Y {}

@Component({selector: 'app-z', template: '', imports: complex(X)})
export class Z {}
`,
);
const ngOptions = { ...options, noEmit: false, outDir: path.join(root, 'out') };
const ngProgram = new NgtscProgram([path.join(root, diagFile)], ngOptions, createCompilerHost({ options: ngOptions }));
const flatten = (m) => (typeof m === 'string' ? [m] : [m.messageText, ...(m.next ?? []).flatMap(flatten)]);
const diagnostics = ngProgram
  .getNgStructuralDiagnostics()
  .concat(ngProgram.getNgSemanticDiagnostics())
  .map((d) => ({
    code: d.code,
    at: d.file ? `${rel(d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1}` : null,
    text: d.file ? d.file.text.slice(d.start, d.start + d.length) : null,
    message: flatten(d.messageText),
    related: (d.relatedInformation ?? []).map((r) => ({
      at: r.file ? `${rel(r.file.fileName)}:${r.file.getLineAndCharacterOfPosition(r.start).line + 1}` : null,
      text: r.file ? r.file.text.slice(r.start, r.start + r.length).replace(/\s+/g, ' ').slice(0, 80) : null,
      message: flatten(r.messageText).join(' '),
    })),
  }));

// 最後に、enum の値の違いが出力に出るかを確かめる: 本物の NgtscProgram で emit し、ɵcmp の selectors を読む
const enumFile = 'src/enum.ts';
fs.writeFileSync(
  path.join(root, enumFile),
  `import {Component} from '@angular/core';
import {Size} from './shared';

@Component({selector: \`app-size-\${Size.Large}\`, template: ''})
export class SizeCmp {}
`,
);
const emitted = {};
const enumHost = createCompilerHost({ options: ngOptions });
enumHost.writeFile = (fileName, text) => {
  emitted[path.relative(ngOptions.outDir, fileName)] = text;
};
new NgtscProgram([path.join(root, enumFile)], ngOptions, enumHost).emit();
const enumJs = emitted['enum.js'] ?? '';
const enumSelectors = (enumJs.match(/selectors: \[\[[^\]]*\]\]/) ?? [null])[0];

const out = {
  compilerCli: JSON.parse(fs.readFileSync('node_modules/@angular/compiler-cli/package.json', 'utf8')).version,
  typescript: ts.version,
  files: { ...FILES, [diagFile]: fs.readFileSync(path.join(root, diagFile), 'utf8') },
  scenes,
  enumByTypeScript,
  enumEmit: { file: enumFile, source: fs.readFileSync(path.join(root, enumFile), 'utf8'), selectors: enumSelectors, emittedFiles: Object.keys(emitted) },
  diagnostics,
};
fs.rmSync(root, { recursive: true, force: true });
process.stdout.write(JSON.stringify(out, null, 2) + '\n');

```

## ここまでの呼び出し

- 👤 `@Component({ imports: SHARED })` — あなたのコード
- `handler の analyze` → `evaluator.evaluate(expr, forwardRefResolver)` — interface.ts L35-44 — *呼ぶたびに StaticInterpreter を作る*
  - `visitExpression` — interpreter.ts L110-159 — *種類で分岐。内側の DynamicValue は L155-156 で包む*
    - `visitIdentifier` → `getDeclarationOfIdentifier` — L234-265 — *パッケージを通ったら L252 で文脈を変える*
      - `visitDeclaration` — L267-288 — *L269 で依存を記録。クラスは Reference*
        - `visitVariableDeclaration` → 初期値の `visitArrayLiteralExpression` — L289-315 / L161-175
    - `visitCallExpression` → `visitFunctionBody` — L441-557 — *return 1 文だけ。本体が無ければ解決器*
- `ResolvedValue`（Reference の配列 / DynamicValue） — result.ts L24-37
  - `createValueHasWrongTypeError` → `traceDynamicValue` — diagnostics.ts L75-97 — *型が違えば診断。理由の連なりを relatedInformation に*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| partial\_evaluator/test/evaluator\_spec.ts | describe `ngtsc metadata`（29 行目）。it `function calls work`（61）・`array spread works`（109）・``array `concat` function works``（189）・`imports work`（464）・`absolute imports work`（491）・`enum resolution works`（650）・`should not attach identifiers to FFR-resolved values`（715）・`should resolve functions with more than one statement to a complex function call`（836）・describe `(visited file tracking)`（851） | `//packages/compiler-cli/src/ngtsc/partial_evaluator/test:test` |
| partial\_evaluator/test/diagnostics\_spec.ts | describe `partial evaluator`（24 行目）の `describeResolvedType()`（25）と `traceDynamicValue()`（114）。it `should reduce the granularity to a single entry per statement`（149）・`should trace complex function invocations`（205） |   |

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/test/evaluator_spec.ts` L836–849 （▶ の行: 837, 842, 845–846）

```ts
836 │     it('should resolve functions with more than one statement to a complex function call', () => {
837 ▶       const value = evaluate(`function foo(bar) { const b = bar; return b; }`, 'foo("test")');
838 │ 
839 │       if (!(value instanceof DynamicValue)) {
840 │         return fail(`Should have resolved to a DynamicValue`);
841 │       }
842 ▶       if (!value.isFromComplexFunctionCall()) {
843 │         return fail('Expected DynamicValue to be from complex function call');
844 │       }
845 ▶       expect((value.node as ts.CallExpression).expression.getText()).toBe('foo');
846 ▶       expect((value.reason.node as ts.FunctionDeclaration).getText()).toContain(
847 │         'const b = bar; return b;',
848 │       );
849 │     });
```

7 節 535〜536 行目そのものです。845 行目で DynamicValue の node が呼び出しの式、846 行目で reason が関数の定義であること（dynamic.ts 131〜136 行目）を確かめています。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/test/diagnostics_spec.ts` L149–176 （▶ の行: 153–155, 158, 161, 165, 169, 172）

```ts
149 │         it('should reduce the granularity to a single entry per statement', () => {
150 │           // Dynamic values exist for each node that has been visited, but only the initial dynamic
151 │           // value within a statement is included in the trace.
152 │           const trace = traceExpression(
153 ▶             `const firstChild = document.body.childNodes[0];
154 ▶              const child = firstChild.firstChild;`,
155 ▶             'child !== undefined',
156 │           );
157 │ 
158 ▶           expect(trace.length).toBe(4);
159 │           expect(trace[0].messageText).toBe('Unable to evaluate this expression statically.');
160 │           expect(absoluteFromSourceFile(trace[0].file!)).toBe(_('/entry.ts'));
161 ▶           expect(getSourceCode(trace[0])).toBe('child');
162 │ 
163 │           expect(trace[1].messageText).toBe('Unable to evaluate this expression statically.');
164 │           expect(absoluteFromSourceFile(trace[1].file!)).toBe(_('/entry.ts'));
165 ▶           expect(getSourceCode(trace[1])).toBe('firstChild');
166 │ 
167 │           expect(trace[2].messageText).toBe('Unable to evaluate this expression statically.');
168 │           expect(absoluteFromSourceFile(trace[2].file!)).toBe(_('/entry.ts'));
169 ▶           expect(getSourceCode(trace[2])).toBe('document.body');
170 │ 
171 │           expect(trace[3].messageText).toBe(
172 ▶             `A value for 'document' cannot be determined statically, as it is an external declaration.`,
173 │           );
174 │           expect(absoluteFromSourceFile(trace[3].file!)).toBe(_('/lib.d.ts'));
175 │           expect(getSourceCode(trace[3])).toBe('document: any');
176 │         });
```

`document.body.childNodes[0]` のように 1 つの文の中で何段も分からなくなっても、158 行目で 4 件だけです。10 節 167〜172 行目の「同じ入れ物の中は 1 段」が、`childNodes[0]` と `.childNodes` の段を落としています。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/test/evaluator_spec.ts` L650–669 （▶ の行: 653–656, 668）

```ts
650 │     it('enum resolution works', () => {
651 │       const result = evaluate(
652 │         `
653 ▶       enum Foo {
654 ▶         A,
655 ▶         B,
656 ▶         C,
657 │       }
658 │ 
659 │       const r = Foo.B;
660 │     `,
661 │         'r',
662 │       );
663 │       if (!(result instanceof EnumValue)) {
664 │         return fail(`result is not an EnumValue`);
665 │       }
666 │       expect((result.enumRef.node as ts.EnumDeclaration).name.text).toBe('Foo');
667 │       expect(result.name).toBe('B');
668 ▶       expect(result.resolved).toBe(1);
669 │     });
```

8 節の enum の spec は、初期値の無い `A, B, C` で `Foo.B` が 1（668 行目）になることだけを確かめています。添字と TypeScript の値が一致する形なので、323 行目の違いはこの spec には出ません。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/partial_evaluator/test:test \
  --nocache_test_results --test_output=all
pnpm bazel test //packages/compiler-cli/src/ngtsc/partial_evaluator/test:test \
  --nocache_test_results --test_output=all '--test_arg=--filter=enum'
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/ngtsc-logs/b-pe-all.log・b-pe-enum.log）`

```
365 specs, 0 failures
//packages/compiler-cli/src/ngtsc/partial_evaluator/test:test            PASSED in 0.7s
INFO: Elapsed time: 1.061s

Ran 16 of 365 specs
16 specs, 0 failures
//packages/compiler-cli/src/ngtsc/partial_evaluator/test:test            PASSED in 0.5s
INFO: Elapsed time: 0.658s
```

- 365 件は、2 つの spec の it が `runInEachFileSystem`（file\_system/testing の test\_helper.ts）で OS/X・Windows・Unix・Native の 4 つの仮のファイルシステムごとに 1 回ずつ走った数です。`--filter=enum` の 16 件も 4 の倍数です。
- 0 件一致でも PASSED になるので、「Ran 16 of 365 specs」の行を必ず見ます。

### 直すとしたら

- 式の種類を増やす・評価の結果を変えるのは interpreter.ts の `visitXxx` です。it は evaluator\_spec.ts の `evaluate(コード, 式)` の形（test/utils.ts の `evaluate`）で足せます。診断の文言は diagnostics.ts の visitor と diagnostics\_spec.ts。
- 最近の修正 f12e160bc10（2025-12-22、fix: support qualified names in \`typeof\` type references、Fixes #65686）：.d.ts の `readonly [typeof ext.External]` のような修飾名を、`visitTypeQuery` が読めずに UNKNOWN にしていました。直したのは次の 3 行で、evaluator\_spec.ts に it `supports declarations of readonly tuples with class references using qualified names`（429 行目）を足しています。前は `node.exprName` が識別子でなければ諦め、後は `QualifiedName` の右側（`External`）で宣言を探します。

📄 `git -C ../angular show f12e160bc10（interpreter.ts の差分の抜粋）`

```
   private visitTypeQuery(node: ts.TypeQueryNode, context: Context): ResolvedValue {
-    if (!ts.isIdentifier(node.exprName)) {
+    const exprName = ts.isQualifiedName(node.exprName) ? node.exprName.right : node.exprName;
+    if (!ts.isIdentifier(exprName)) {
       return DynamicValue.fromUnknown(node);
     }

-    const decl = this.host.getDeclarationOfIdentifier(node.exprName);
+    const decl = this.host.getDeclarationOfIdentifier(exprName);
```

- 開いている issue #48089（Exported array of standalone components cannot be imported、2022 年から open）は、ライブラリが `export const X = [A, B] as const` した配列を `imports` に書くと「Value could not be determined statically」になる、という報告です。ライブラリの .d.ts では、この const は `declare const X: readonly [typeof A, typeof B]` のような型だけの宣言になるので、評価器は 5 節の 293・305〜309 行目で**型から**値を作ります（spec の it `supports declarations of readonly tuples with class references`、evaluator\_spec.ts 395 行目）。2025-01 のコメントでは「standalone のコンポーネントの imports では動く。NgModule の imports でも同じように動くべき、というのがこの issue」と書かれています。評価器の行と handler の行のどちらの話かを分けて読む例です。

- 8 節の enum の違いは、323 行目を「前のメンバーの値 + 1」にするのが入口で、spec は `enum resolution works` の隣に `enum Foo { A = 1, B }` の it を足す形です。2026-11-05 に gh で「enum」と評価器・セレクターの組み合わせを探しましたが、同じ報告は見つかりませんでした。**本家に PR を出すことは勧めません**。issue を読むときに「評価器が値を間違えた話か、評価できなかった話か」を 323 行目と 9 節の表で分ける手がかりにしてください（[第 20 回](20-ngtsc-issues.md)）。

## 聞かれそうな質問

**Q. デコレーターの中で関数を呼ぶと「Value could not be determined statically」になりました。なぜですか？**

評価器は関数の本体が `return` 1 文のときだけ中を評価します（535〜536 行目）。2 文以上なら COMPLEX\_FUNCTION\_CALL、.d.ts の関数は本体が無いので UNKNOWN（533〜534 行目）です。forwardRef のように handler が解決器を渡す関数だけが例外です（490〜496 行目）。

**Q. `imports: SHARED` と別ファイルの const を書いても、なぜ中のクラスが分かるのですか？**

235 行目で識別子を本当の宣言（shared.ts の `const SHARED`）にたどり、290〜292 行目でその初期値の式を評価し直すからです。そのとき 268〜270 行目で「app.ts は shared.ts に依存する」と記録するので、shared.ts を変えると app.ts も解析し直されます。

**Q. 配列の 1 つが評価できないと、配列ごと捨てられますか？**

捨てられません。配列は要素ごとに評価して入れる（166〜173 行目）ので、分からない要素だけが DynamicValue になります。spread の中身が分からないときも 643 行目で 1 要素の DynamicValue です。オブジェクトは逆で、キーが決まらないと 188 行目で全体が DynamicValue になります。

**Q. パッケージから import したクラスと、自分のファイルのクラスは、結果で何が違いますか？**

どちらも Reference ですが、パッケージの名前を通った宣言は 889〜893 行目で文脈が書き換わり、Reference の `bestGuessOwningModule` に `'@angular/common'` などが入ります。相対パスの import なら `null` です。第 6 回で import を書くときに、この違いで strategy が分かれます。

**Q. エラーの「関連する場所」に出る行は、どう決まりますか？**

DynamicValue の連なりを traceDynamicValue が外側から読み（79・88 行目）、診断の本体と同じ node（161〜165 行目）と、同じ文の中の 2 段目以降（167〜172 行目）を落として、残りを relatedInformation にします。いちばん内側の理由の文は 114〜146 行目です。

## 読み終えて

- `evaluate` は式を構文木のまま 1 つずつたどり、ResolvedValue（値・Reference・EnumValue・配列・Map・KnownFn・DynamicValue）にする。呼ぶたびに StaticInterpreter を作る。
- 識別子は宣言にたどって評価し直す。パッケージを通ると文脈が変わり、Reference が持ち主のパッケージ名を覚える。宣言のファイルへの依存も記録する。
- 関数は return 1 文だけ評価する。.d.ts の関数は、handler が渡す解決器（forwardRef など）でだけ解ける。
- 分からない部分は DynamicValue。外側から内側への理由の連なりを traceDynamicValue が relatedInformation にする。
- 初期値の無い enum のメンバーは添字で評価される（323 行目）。前のメンバーに初期値があると TypeScript の値とずれる。

---

← 前: [リフレクション：TypeScript の AST からクラスとデコレーターを読む](04-ngtsc-reflection.md)  
次: [参照と import：クラスへの参照を出力の式にする](06-ngtsc-references-imports.md) →
