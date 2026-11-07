[目次](../README.md) › [ngtsc の内側](README.md) › 第 6 回 / 全 20 回

# 参照と import：クラスへの参照を出力の式にする

> Reference が「どこから見えるか」（bestGuessOwningModule・identifiers）を覚える仕組み、ReferenceEmitter が makeCompilation の並べた strategy（ふつうは LocalIdentifierStrategy → AbsoluteModuleStrategy → RelativePathStrategy、rootDirs があれば 3 つ目が LogicalProjectStrategy、UnifiedModulesHost なら LocalIdentifierStrategy → AliasStrategy → UnifiedModulesStrategy）を前から試して式を作る行、ImportFlags、エクスポートされていないクラスを参照したときのエラー、AliasingHost。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-references-imports)

---

`@Component({ imports: [ButtonCmp] })` をコンパイルすると、出力の `ɵcmp` には `dependencies: [ButtonCmp]` と書かれます。ここで書く `ButtonCmp` は、そのファイルで本当に見える名前でなければなりません。元のファイルに import があればその名前を、無ければ新しい import（`import {ButtonCmp} from './shared'`）を、パッケージのクラスなら `'@angular/common'` からの import を書きます。この章では、その判断に使う `Reference`（宣言への参照と「どこから見えるか」の記録）と、`ReferenceEmitter` が strategy を順に試して出力の式を作る行、各 strategy の判断、`ImportFlags`、エクスポートされていないクラスのエラー、別名の export（AliasingHost）を読みます。

読む対象は `packages/compiler-cli/src/ngtsc/imports/src/` の `references.ts`・`emitter.ts`（562 行）・`find_export.ts`・`alias.ts` と、spec の `imports/test/emitter_spec.ts`・`test/ngtsc/imports_spec.ts` です。`@defer` の import を消す `DeferredSymbolTracker` は [standalone-defer-deps の章](../standalone/11-standalone-defer-deps.md)、`ImportedSymbolsTracker` は [signals-input-compile の章](../signals/12-signals-input-compile.md)で読みました。

1. [1. 全体像](01-ngtsc-overview.md)
2. [2. NgtscProgram](02-ngtsc-program.md)
3. [3. NgCompiler とチケット](03-ngtsc-compiler-ticket.md)
4. [4. リフレクション](04-ngtsc-reflection.md)
5. [5. 静的な評価](05-ngtsc-partial-evaluator.md)
6. **6. 参照と import**（この章）
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

## 1. Reference：宣言と「どこから来たか」

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/references.ts` L15–45 （▶ の行: 15–17, 31, 44）

```ts
15 ▶ export interface OwningModule {
16 ▶   specifier: string;
17 ▶   resolutionContext: string;
18 │ }
19 │ 
20 │ /**
21 │  * A `ts.Node` plus the context in which it was discovered.
22 │  *
23 │  * A `Reference` is a pointer to a `ts.Node` that was extracted from the program somehow. It
24 │  * contains not only the node itself, but the information regarding how the node was located. In
25 │  * particular, it might track different identifiers by which the node is exposed, as well as
26 │  * potentially a module specifier which might expose the node.
27 │  *
28 │  * The Angular compiler uses `Reference`s instead of `ts.Node`s when tracking classes or generating
29 │  * imports.
30 │  */
31 ▶ export class Reference<T extends ts.Node = ts.Node> {
32 │   /**
33 │    * The compiler's best guess at an absolute module specifier which owns this `Reference`.
34 │    *
35 │    * This is usually determined by tracking the import statements which led the compiler to a given
36 │    * node. If any of these imports are absolute, it's an indication that the node being imported
37 │    * might come from that module.
38 │    *
39 │    * It is not _guaranteed_ that the node in question is exported from its `bestGuessOwningModule` -
40 │    * that is mostly a convention that applies in certain package formats.
41 │    *
42 │    * If `bestGuessOwningModule` is `null`, then it's likely the node came from the current program.
43 │    */
44 ▶   readonly bestGuessOwningModule: OwningModule | null;
45 │ 
```

`Reference` は `ts.Node`（宣言）に、その宣言を見つけたときの事情を足したものです。28〜29 行目のコメントのとおり、Angular のコンパイラはクラスを追いかけるときも import を作るときも、`ts.Node` ではなく Reference を使います。44 行目の `bestGuessOwningModule` は「このクラスを持っていそうなパッケージ名」で、15〜18 行目の `specifier`（`'@angular/common'` など）と `resolutionContext`（その名前をどのファイルから解決したか）の組です。これを入れるのは[第 5 回](05-ngtsc-partial-evaluator.md)の評価器で、パッケージの名前の import を通って宣言に着いたときだけです。39〜40 行目のコメントのとおり、あくまで「推測」で、そのパッケージから export されている保証はありません（4 節で確かめます）。

46 行目の `identifiers` と 54 行目の `synthetic` は、[standalone-forward-ref の章](../standalone/05-standalone-forward-ref.md)で引用しました。`synthetic` は forwardRef などの解決器で作られた印です。

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/references.ts` L57–89 （▶ の行: 58, 60, 66–68, 74, 77–78, 82–83）

```ts
57 │ 
58 ▶   readonly isAmbient: boolean;
59 │ 
60 ▶   readonly key: string;
61 │ 
62 │   constructor(
63 │     readonly node: T,
64 │     bestGuessOwningModule: OwningModule | AmbientImport | null = null,
65 │   ) {
66 ▶     if (bestGuessOwningModule === AmbientImport) {
67 ▶       this.isAmbient = true;
68 ▶       this.bestGuessOwningModule = null;
69 │     } else {
70 │       this.isAmbient = false;
71 │       this.bestGuessOwningModule = bestGuessOwningModule as OwningModule | null;
72 │     }
73 │ 
74 ▶     const id = identifierOfNode(node);
75 │     const sourceFile = getSourceFile(node);
76 │ 
77 ▶     if (id !== null) {
78 ▶       this.identifiers.push(id);
79 │     }
80 │ 
81 │     // The source file might not be defined for synthetic nodes.
82 ▶     if (sourceFile) {
83 ▶       this.key = `${sourceFile.fileName}#${node.getStart()}`;
84 │     } else {
85 │       // `getStart` will throw if there's no source file.
86 │       const position = id && id.getSourceFile() ? id.getStart() : null;
87 │       this.key = `${this.bestGuessOwningModule?.specifier}#${id?.text}#${position}`;
88 │     }
89 │   }
```

1. **66〜68 行目：AmbientImport なら isAmbient**

   グローバルに宣言された型（import 無しで見える型）への参照です。持ち主のパッケージは無し（`null`）になります。
2. **74〜79 行目：宣言の名前を、最初の identifier にする**

   `class ButtonCmp` の `ButtonCmp` です。宣言のファイルの中では、この名前でそのまま書けるからです。
3. **82〜83 行目：key は「ファイル名#開始位置」**

   同じ宣言を別々に作った Reference でも、key は同じになります。

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/references.ts` L112–141 （▶ の行: 118–120, 131–132, 139–140）

```ts
112 │   /**
113 │    * A name for the node, if one is available.
114 │    *
115 │    * This is only suited for debugging. Any actual references to this node should be made with
116 │    * `ts.Identifier`s (see `getIdentityIn`).
117 │    */
118 ▶   get debugName(): string | null {
119 ▶     const id = identifierOfNode(this.node);
120 ▶     return id !== null ? id.text : null;
121 │   }
122 │ 
123 │   get alias(): Expression | null {
124 │     return this._alias;
125 │   }
126 │ 
127 │   /**
128 │    * Record a `ts.Identifier` by which it's valid to refer to this node, within the context of this
129 │    * `Reference`.
130 │    */
131 ▶   addIdentifier(identifier: ts.Identifier): void {
132 ▶     this.identifiers.push(identifier);
133 │   }
134 │ 
135 │   /**
136 │    * Get a `ts.Identifier` within this `Reference` that can be used to refer within the context of a
137 │    * given `ts.SourceFile`, if any.
138 │    */
139 ▶   getIdentityIn(context: ts.SourceFile): ts.Identifier | null {
140 ▶     return this.identifiers.find((id) => id.getSourceFile() === context) || null;
141 │   }
```

131〜133 行目の `addIdentifier` は、評価器が識別子をたどって Reference を返すたびに呼びます（第 5 回 5 節）。だから `import {ButtonCmp} from './shared'` がある app.ts で `[ButtonCmp]` を評価すると、identifiers は「shared.ts の宣言の名前」と「app.ts の `ButtonCmp`」の 2 つになります。139〜141 行目の `getIdentityIn(ファイル)` が、そのファイルにある識別子を探します。118〜121 行目の `debugName` は 115〜116 行目のコメントのとおり、エラーのメッセージ用で、出力には使いません。

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/references.ts` L189–207 （▶ の行: 190, 194–195, 199, 205）

```ts
189 │   cloneWithAlias(alias: Expression): Reference<T> {
190 ▶     const ref = new Reference(
191 │       this.node,
192 │       this.isAmbient ? AmbientImport : this.bestGuessOwningModule,
193 │     );
194 ▶     ref.identifiers = [...this.identifiers];
195 ▶     ref._alias = alias;
196 │     return ref;
197 │   }
198 │ 
199 ▶   cloneWithNoIdentifiers(): Reference<T> {
200 │     const ref = new Reference(
201 │       this.node,
202 │       this.isAmbient ? AmbientImport : this.bestGuessOwningModule,
203 │     );
204 │     ref._alias = this._alias;
205 ▶     ref.identifiers = [];
206 │     return ref;
207 │   }
```

`cloneWithAlias` は、identifiers を写して（194 行目）別名の式を付けた（195 行目）複製を作ります。NgModule のスコープを作る側（`scope/src/dependency.ts`、[ngmodule-exports の章](../ngmodule/05-ngmodule-exports.md)）が、別名で import すべきクラスに使います（5 節）。

## 2. ReferenceEmitter：strategy を前から順に試す

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L214–236 （▶ の行: 215, 217–220, 222–225, 229, 233）

```ts
214 │ export class ReferenceEmitter {
215 ▶   constructor(private strategies: ReferenceEmitStrategy[]) {}
216 │ 
217 ▶   emit(
218 ▶     ref: Reference,
219 ▶     context: ts.SourceFile,
220 ▶     importFlags: ImportFlags = ImportFlags.None,
221 │   ): ReferenceEmitResult {
222 ▶     for (const strategy of this.strategies) {
223 ▶       const emitted = strategy.emit(ref, context, importFlags);
224 ▶       if (emitted !== null) {
225 ▶         return emitted;
226 │       }
227 │     }
228 │ 
229 ▶     return {
230 │       kind: ReferenceEmitKind.Failed,
231 │       ref,
232 │       context,
233 ▶       reason: `Unable to write a reference to ${nodeNameForError(ref.node)}.`,
234 │     };
235 │   }
236 │ }
```

1. **215 行目：strategy の並びはコンストラクタで決まる**

   並びを決めるのは `NgCompiler` の `makeCompilation` です（[第 3 回](03-ngtsc-compiler-ticket.md)）。ふつうは `LocalIdentifierStrategy` → `AbsoluteModuleStrategy` → 3 つ目で、tsconfig に `rootDirs` があれば `LogicalProjectStrategy`、無ければ `RelativePathStrategy`。ホストが `UnifiedModulesHost`（`fileNameToModuleName` でファイル名からモジュール名を作れるホスト）を持つときは、`LocalIdentifierStrategy` →（`AliasStrategy`）→ `UnifiedModulesStrategy` です。
2. **217〜220 行目：参照・書き込む先のファイル（context）・フラグ**

   同じ Reference でも、書き込む先のファイルが違えば答えが違います。
3. **222〜227 行目：最初に null 以外を返した strategy の答えを使う**

   null は「自分には書けない。次へ」の意味です。**Failed を返すと、そこで終わります**（後ろの strategy は試しません）。
4. **229〜234 行目：全部が null なら Failed**

   理由は「Unable to write a reference to …」です。

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L103–127 （▶ の行: 103–105, 118, 126）

```ts
103 ▶ export enum ReferenceEmitKind {
104 ▶   Success,
105 ▶   Failed,
106 │ }
107 │ 
108 │ /**
109 │  * Represents the emitted expression of a `Reference` that is valid in the source file it was
110 │  * emitted from.
111 │  */
112 │ export interface EmittedReference {
113 │   kind: ReferenceEmitKind.Success;
114 │ 
115 │   /**
116 │    * The expression that refers to `Reference`.
117 │    */
118 ▶   expression: Expression;
119 │ 
120 │   /**
121 │    * The `ts.SourceFile` that is imported by `expression`. This is not necessarily the source file
122 │    * of the `Reference`'s declaration node, as the reference may have been rewritten through an
123 │    * alias export. It could also be `null` if `expression` is a local identifier, or `'unknown'` if
124 │    * the exact source file that is being imported is not known to the emitter.
125 │    */
126 ▶   importedFile: ImportedFile;
127 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L129–151 （▶ の行: 132, 138, 143, 148, 151）

```ts
129 │ /**
130 │  * Represents a failure to emit a `Reference` into a different source file.
131 │  */
132 ▶ export interface FailedEmitResult {
133 │   kind: ReferenceEmitKind.Failed;
134 │ 
135 │   /**
136 │    * The reference that could not be emitted.
137 │    */
138 ▶   ref: Reference;
139 │ 
140 │   /**
141 │    * The source file into which the reference was requested to be emitted.
142 │    */
143 ▶   context: ts.SourceFile;
144 │ 
145 │   /**
146 │    * Describes why the reference could not be emitted. This may be shown in a diagnostic.
147 │    */
148 ▶   reason: string;
149 │ }
150 │ 
151 ▶ export type ReferenceEmitResult = EmittedReference | FailedEmitResult;
```

成功の 118 行目の `expression` は `@angular/compiler` の出力の式で、識別子をそのまま包む `WrappedNodeExpr` か、「このモジュールのこの名前」を表す `ExternalExpr` です。`ExternalExpr` は、出力のときに `ImportManager` が実際の import の文に変えます（[compiler-reify-emit の章](../compiler/16-compiler-reify-emit.md)）。126 行目の `importedFile` は import の先のファイルで、[第 16 回](16-ngtsc-cycles.md)の循環の検査が、モジュールの解決をやり直さずに使います。

> **🧪 DEMO — 本物の ReferenceEmitter で参照を出力の式にする（記録）**
>
> これは記録です。@angular/compiler-cli 22.1.6 の本物の NgtscProgram を Node で作り、NgCompiler が makeCompilation で組み立てた `compilation.refEmitter` をそのまま使いました。Reference は本物の PartialEvaluator で app.ts の `FROM_APP`・`FROM_SHARED` を評価して作り（最後の 1 つだけ手で作った）、各 strategy の `emit` を「記録してから本物を呼ぶ」関数で包んで、試した順を残しました。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-references-imports)

📄 `記録に使った入力 src/shared.ts`

```ts
import {Component} from '@angular/core';

@Component({selector: 'app-button', template: ''})
export class ButtonCmp {}

@Component({selector: 'app-hidden', template: ''})
class HiddenCmp {}

@Component({selector: 'app-renamed', template: ''})
class RenamedCmp {}
export {RenamedCmp as PublicCmp};

export const ALL = [ButtonCmp, HiddenCmp, RenamedCmp];

```

📄 `記録に使った入力 src/app.ts（src/other.ts は export const nothing = 0; だけ）`

```
import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ButtonCmp, ALL} from './shared';
import {GenCmp} from '../gen/generated';

@Component({selector: 'app-local', template: ''})
export class LocalCmp {}

export const FROM_APP = [LocalCmp, ButtonCmp, CommonModule, GenCmp];
export const FROM_SHARED = ALL;

```

📄 `記録に使った入力 gen/generated.ts`

```ts
import {Component} from '@angular/core';

@Component({selector: 'app-gen', template: ''})
export class GenCmp {}

```

## 3. LocalIdentifierStrategy：そのファイルにある名前を使う

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L242–264 （▶ の行: 244, 248–249, 257–258, 260）

```ts
242 │ export class LocalIdentifierStrategy implements ReferenceEmitStrategy {
243 │   emit(ref: Reference, context: ts.SourceFile, importFlags: ImportFlags): EmittedReference | null {
244 ▶     const refSf = getSourceFile(ref.node);
245 │ 
246 │     // If the emitter has specified ForceNewImport, then LocalIdentifierStrategy should not use a
247 │     // local identifier at all, *except* in the source file where the node is actually declared.
248 ▶     if (importFlags & ImportFlags.ForceNewImport && refSf !== context) {
249 ▶       return null;
250 │     }
251 │ 
252 │     // If referenced node is not an actual TS declaration (e.g. `class Foo` or `function foo() {}`,
253 │     // etc) and it is in the current file then just use it directly.
254 │     // This is important because the reference could be a property access (e.g. `exports.foo`). In
255 │     // such a case, the reference's `identities` property would be `[foo]`, which would result in an
256 │     // invalid emission of a free-standing `foo` identifier, rather than `exports.foo`.
257 ▶     if (!isDeclaration(ref.node) && refSf === context) {
258 ▶       return {
259 │         kind: ReferenceEmitKind.Success,
260 ▶         expression: new WrappedNodeExpr(ref.node),
261 │         importedFile: null,
262 │       };
263 │     }
264 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L265–291 （▶ の行: 266, 271, 281–282, 285, 289）

```ts
265 │     // If the reference is to an ambient type, it can be referenced directly.
266 ▶     if (ref.isAmbient && importFlags & ImportFlags.AllowAmbientReferences) {
267 │       const identifier = identifierOfNode(ref.node);
268 │       if (identifier !== null) {
269 │         return {
270 │           kind: ReferenceEmitKind.Success,
271 ▶           expression: new WrappedNodeExpr(identifier),
272 │           importedFile: null,
273 │         };
274 │       } else {
275 │         return null;
276 │       }
277 │     }
278 │ 
279 │     // A Reference can have multiple identities in different files, so it may already have an
280 │     // Identifier in the requested context file.
281 ▶     const identifier = ref.getIdentityIn(context);
282 ▶     if (identifier !== null) {
283 │       return {
284 │         kind: ReferenceEmitKind.Success,
285 ▶         expression: new WrappedNodeExpr(identifier),
286 │         importedFile: null,
287 │       };
288 │     } else {
289 ▶       return null;
290 │     }
291 │   }
```

1. **248〜250 行目：ForceNewImport なら、宣言のファイル以外では使わない**

   DEMO の「同じ参照 + ForceNewImport」は、app.ts に `ButtonCmp` の識別子があるのに null を返し、次の strategy に回します。
2. **257〜263 行目：宣言でない node が同じファイルにあれば、その node のまま**

   252〜256 行目のコメントの `exports.foo` のような場合です。
3. **281〜287 行目：書き込む先のファイルに識別子があれば、それを使う**

   1 節の `getIdentityIn` です。DEMO の「同じファイルのクラス」「import 済みの別ファイルのクラス」「パッケージのクラス（import 済みのファイルへ）」はここで決まり、`importedFile` は `null`（新しい import は足さない）です。

パッケージのクラスでも、元のファイルに `import {CommonModule} from '@angular/common'` があればここで済みます。**評価器を通って見つけた名前を、そのまま使い回している**わけです。

## 4. AbsoluteModuleStrategy：パッケージ名から import する

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L332–355 （▶ の行: 337, 340–341, 343, 348–349）

```ts
332 │   emit(
333 │     ref: Reference,
334 │     context: ts.SourceFile,
335 │     importFlags: ImportFlags,
336 │   ): ReferenceEmitResult | null {
337 ▶     if (ref.bestGuessOwningModule === null) {
338 │       // There is no module name available for this Reference, meaning it was arrived at via a
339 │       // relative path.
340 ▶       return null;
341 ▶     } else if (!isDeclaration(ref.node)) {
342 │       // It's not possible to import something which isn't a declaration.
343 ▶       throw new Error(
344 │         `Debug assert: unable to import a Reference to non-declaration of type ${
345 │           ts.SyntaxKind[ref.node.kind]
346 │         }.`,
347 │       );
348 ▶     } else if ((importFlags & ImportFlags.AllowTypeImports) === 0 && isTypeDeclaration(ref.node)) {
349 ▶       throw new Error(
350 │         `Importing a type-only declaration of type ${
351 │           ts.SyntaxKind[ref.node.kind]
352 │         } in a value position is not allowed.`,
353 │       );
354 │     }
355 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L356–381 （▶ の行: 357–359, 364, 366, 371, 374, 378–379）

```ts
356 │     // Try to find the exported name of the declaration, if one is available.
357 ▶     const {specifier, resolutionContext} = ref.bestGuessOwningModule;
358 ▶     const exports = this.getExportsOfModule(specifier, resolutionContext);
359 ▶     if (exports.module === null) {
360 │       return {
361 │         kind: ReferenceEmitKind.Failed,
362 │         ref,
363 │         context,
364 ▶         reason: `The module '${specifier}' could not be found.`,
365 │       };
366 ▶     } else if (exports.exportMap === null || !exports.exportMap.has(ref.node)) {
367 │       return {
368 │         kind: ReferenceEmitKind.Failed,
369 │         ref,
370 │         context,
371 ▶         reason: `The symbol is not exported from ${exports.module.fileName} (module '${specifier}').`,
372 │       };
373 │     }
374 ▶     const symbolName = exports.exportMap.get(ref.node)!;
375 │ 
376 │     return {
377 │       kind: ReferenceEmitKind.Success,
378 ▶       expression: new ExternalExpr(new ExternalReference(specifier, symbolName)),
379 ▶       importedFile: exports.module,
380 │     };
381 │   }
```

1. **337〜340 行目：bestGuessOwningModule が無ければ null**

   自分のプロジェクトの中のクラス（相対パスで import したもの）は全部ここを素通りします。
2. **348〜353 行目：型だけの宣言を値の位置に書こうとしたら投げる**

   `interface` や `type` は実行時に存在しないからです。`AllowTypeImports`（6 節）があれば通します。
3. **357〜373 行目：そのパッケージの入口の export を調べる**

   入口のファイルが無ければ 364 行目、export の一覧に無ければ 371 行目の Failed です。**ここで Failed を返すので、後ろの RelativePathStrategy には回りません**。
4. **374〜380 行目：export の名前で ExternalExpr**

   宣言の名前ではなく、入口から export されている名前を使います（下の 403〜413 行目）。

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L383–417 （▶ の行: 384–385, 392, 397, 403, 410–411, 414）

```ts
383 │   private getExportsOfModule(moduleName: string, fromFile: string): ModuleExports {
384 ▶     if (!this.moduleExportsCache.has(moduleName)) {
385 ▶       this.moduleExportsCache.set(moduleName, this.enumerateExportsOfModule(moduleName, fromFile));
386 │     }
387 │     return this.moduleExportsCache.get(moduleName)!;
388 │   }
389 │ 
390 │   protected enumerateExportsOfModule(specifier: string, fromFile: string): ModuleExports {
391 │     // First, resolve the module specifier to its entry point, and get the ts.Symbol for it.
392 ▶     const entryPointFile = this.moduleResolver.resolveModule(specifier, fromFile);
393 │     if (entryPointFile === null) {
394 │       return {module: null, exportMap: null};
395 │     }
396 │ 
397 ▶     const exports = this.reflectionHost.getExportsOfModule(entryPointFile);
398 │     if (exports === null) {
399 │       return {module: entryPointFile, exportMap: null};
400 │     }
401 │     const exportMap = new Map<DeclarationNode, string>();
402 │     for (const [name, declaration] of exports) {
403 ▶       if (exportMap.has(declaration.node)) {
404 │         // An export for this declaration has already been registered. We prefer an export that
405 │         // has the same name as the declared name, i.e. is not an aliased export. This is relevant
406 │         // for partial compilations where emitted references should import symbols using a stable
407 │         // name. This is particularly relevant for declarations inside VE-generated libraries, as
408 │         // such libraries contain private, unstable reexports of symbols.
409 │         const existingExport = exportMap.get(declaration.node)!;
410 ▶         if (isNamedDeclaration(declaration.node) && declaration.node.name.text === existingExport) {
411 ▶           continue;
412 │         }
413 │       }
414 ▶       exportMap.set(declaration.node, name);
415 │     }
416 │     return {module: entryPointFile, exportMap};
417 │   }
```

384〜386 行目：パッケージの export の一覧は、パッケージ名ごとに 1 回だけ作ります（モジュールの解決は重いので）。403〜413 行目：同じクラスが 2 つの名前で export されていたら、**宣言と同じ名前**を選びます。406〜408 行目のコメントのとおり、部分コンパイルのライブラリが安定した名前で import するためです。DEMO の「パッケージのクラス（import していないファイルへ）」は `ExternalExpr { moduleName: '@angular/common', name: 'CommonModule' }` で、`importedFile` は `@angular/common` の入口の .d.ts です。

> [!NOTE]
> **ポイント**
>
> DEMO の「手で作った Reference」は、app.ts の `LocalCmp` に「持ち主は `@angular/core`」という偽の bestGuessOwningModule を付けたものです。366〜372 行目の Failed（The symbol is not exported from … (module '@angular/core')）になり、RelativePathStrategy には回りません。ふだんの評価器はこんな Reference を作りませんが、「パッケージ名を通って見つけたのに、入口からは export されていない」ときの形がこれで、7 節の imports\_spec の 2 つ目の it がこの文言を確かめています。

## 5. 自分のプロジェクトの中：RelativePathStrategy と LogicalProjectStrategy

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L506–532 （▶ の行: 510–513, 515, 517–518, 523, 528）

```ts
506 │ export class RelativePathStrategy implements ReferenceEmitStrategy {
507 │   constructor(private reflector: ReflectionHost) {}
508 │ 
509 │   emit(ref: Reference, context: ts.SourceFile): ReferenceEmitResult | null {
510 ▶     const destSf = getSourceFile(ref.node);
511 ▶     const relativePath = relative(
512 ▶       dirname(absoluteFromSourceFile(context)),
513 ▶       absoluteFromSourceFile(destSf),
514 │     );
515 ▶     const moduleName = toRelativeImport(stripExtension(relativePath));
516 │ 
517 ▶     const name = findExportedNameOfNode(ref.node, destSf, this.reflector);
518 ▶     if (name === null) {
519 │       return {
520 │         kind: ReferenceEmitKind.Failed,
521 │         ref,
522 │         context,
523 ▶         reason: `The symbol is not exported from ${destSf.fileName}.`,
524 │       };
525 │     }
526 │     return {
527 │       kind: ReferenceEmitKind.Success,
528 ▶       expression: new ExternalExpr({moduleName, name}),
529 │       importedFile: destSf,
530 │     };
531 │   }
532 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/find_export.ts` L17–44 （▶ の行: 22, 27, 32, 36, 38, 41, 43）

```ts
17 │ export function findExportedNameOfNode(
18 │   target: ts.Node,
19 │   file: ts.SourceFile,
20 │   reflector: ReflectionHost,
21 │ ): string | null {
22 ▶   const exports = reflector.getExportsOfModule(file);
23 │   if (exports === null) {
24 │     return null;
25 │   }
26 │ 
27 ▶   const declaredName = isNamedDeclaration(target) ? target.name.text : null;
28 │ 
29 │   // Look for the export which declares the node.
30 │   let foundExportName: string | null = null;
31 │   for (const [exportName, declaration] of exports) {
32 ▶     if (declaration.node !== target) {
33 │       continue;
34 │     }
35 │ 
36 ▶     if (exportName === declaredName) {
37 │       // A non-alias export exists which is always preferred, so use that one.
38 ▶       return exportName;
39 │     }
40 │ 
41 ▶     foundExportName = exportName;
42 │   }
43 ▶   return foundExportName;
44 │ }
```

1. **511〜515 行目：ファイルどうしの相対パスから拡張子を落とす**

   app.ts から shared.ts なら `'./shared'`、gen/generated.ts なら `'../gen/generated'` です。
2. **517 行目：そのファイルからの export の名前を探す**

   `findExportedNameOfNode` は、宣言と同じ名前の export を最優先し（36〜38 行目）、無ければ別名の export（41 行目）を返します。DEMO の「別名でエクスポートされたクラス」は `class RenamedCmp` を `export {RenamedCmp as PublicCmp}` しているので、`name: 'PublicCmp'` になります。
3. **518〜524 行目：export されていなければ Failed**

   DEMO の「エクスポートされていないクラス」です。理由は `The symbol is not exported from src/shared.ts.`

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L438–476 （▶ の行: 443, 447–448, 452–453, 458, 462, 466, 474–475）

```ts
438 │   emit(
439 │     ref: Reference,
440 │     context: ts.SourceFile,
441 │     importFlags: ImportFlags,
442 │   ): ReferenceEmitResult | null {
443 ▶     const destSf = getSourceFile(ref.node);
444 │ 
445 │     // Compute the relative path from the importing file to the file being imported. This is done
446 │     // as a logical path computation, because the two files might be in different rootDirs.
447 ▶     const destPath = this.logicalFs.logicalPathOfSf(destSf);
448 ▶     if (destPath === null) {
449 │       // The imported file is not within the logical project filesystem. An import into a
450 │       // declaration file is exempt from `TS6059: File is not under 'rootDir'` so we choose to allow
451 │       // using a filesystem relative path as fallback, if allowed per the provided import flags.
452 ▶       if (destSf.isDeclarationFile && importFlags & ImportFlags.AllowRelativeDtsImports) {
453 ▶         return this.relativePathStrategy.emit(ref, context);
454 │       }
455 │ 
456 │       // Note: this error is analogous to `TS6059: File is not under 'rootDir'` that TypeScript
457 │       // reports.
458 ▶       return {
459 │         kind: ReferenceEmitKind.Failed,
460 │         ref,
461 │         context,
462 ▶         reason: `The file ${destSf.fileName} is outside of the configured 'rootDir'.`,
463 │       };
464 │     }
465 │ 
466 ▶     const originPath = this.logicalFs.logicalPathOfSf(context);
467 │     if (originPath === null) {
468 │       throw new Error(
469 │         `Debug assert: attempt to import from ${context.fileName} but it's outside the program?`,
470 │       );
471 │     }
472 │ 
473 │     // There's no way to emit a relative reference from a file to itself.
474 ▶     if (destPath === originPath) {
475 ▶       return null;
476 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L477–497 （▶ の行: 478–479, 485, 491, 494）

```ts
477 │ 
478 ▶     const name = findExportedNameOfNode(ref.node, destSf, this.reflector);
479 ▶     if (name === null) {
480 │       // The target declaration isn't exported from the file it's declared in. This is an issue!
481 │       return {
482 │         kind: ReferenceEmitKind.Failed,
483 │         ref,
484 │         context,
485 ▶         reason: `The symbol is not exported from ${destSf.fileName}.`,
486 │       };
487 │     }
488 │ 
489 │     // With both files expressed as LogicalProjectPaths, getting the module specifier as a relative
490 │     // path is now straightforward.
491 ▶     const moduleName = LogicalProjectPath.relativePathBetween(originPath, destPath);
492 │     return {
493 │       kind: ReferenceEmitKind.Success,
494 ▶       expression: new ExternalExpr({moduleName, name}),
495 │       importedFile: destSf,
496 │     };
497 │   }
```

`rootDirs`（複数のディレクトリを 1 つのディレクトリのように見せる TypeScript の設定）があると、src/app.ts と gen/generated.ts は「同じ場所の 2 つのファイル」になります。447 行目の `logicalPathOfSf` が rootDirs の中での位置（論理パス）を返し、491 行目でその 2 つから `'./generated'` を作ります。DEMO の設定を「rootDirs: \[src, gen\]」にすると、同じ参照が `'../gen/generated'` ではなく `'./generated'` になります。rootDirs の外のファイルは 458〜463 行目で Failed（「is outside of the configured 'rootDir'」）。.d.ts だけは `AllowRelativeDtsImports` があれば 452〜453 行目で普通の相対パスに戻します。

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L538–562 （▶ の行: 546–548, 551–552）

```ts
538 │ export class UnifiedModulesStrategy implements ReferenceEmitStrategy {
539 │   constructor(
540 │     private reflector: ReflectionHost,
541 │     private unifiedModulesHost: UnifiedModulesHost,
542 │   ) {}
543 │ 
544 │   emit(ref: Reference, context: ts.SourceFile): EmittedReference | null {
545 │     const destSf = getSourceFile(ref.node);
546 ▶     const name = findExportedNameOfNode(ref.node, destSf, this.reflector);
547 ▶     if (name === null) {
548 ▶       return null;
549 │     }
550 │ 
551 ▶     const moduleName = this.unifiedModulesHost.fileNameToModuleName(
552 ▶       destSf.fileName,
553 │       context.fileName,
554 │     );
555 │ 
556 │     return {
557 │       kind: ReferenceEmitKind.Success,
558 │       expression: new ExternalExpr({moduleName, name}),
559 │       importedFile: destSf,
560 │     };
561 │   }
562 │ }
```

`UnifiedModulesStrategy` は、ホストの `fileNameToModuleName` にモジュール名を作らせます（551〜554 行目）。export されていなければ Failed ではなく null（548 行目）を返す点が、ほかの 2 つと違います。

## 6. ImportFlags：同じ参照を、場面に合わせて書き分ける

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L41–70 （▶ の行: 44, 53, 61, 70）

```ts
41 │ /**
42 │  * Flags which alter the imports generated by the `ReferenceEmitter`.
43 │  */
44 ▶ export enum ImportFlags {
45 │   None = 0x00,
46 │ 
47 │   /**
48 │    * Force the generation of a new import when generating a reference, even if an identifier already
49 │    * exists in the target file which could be used instead.
50 │    *
51 │    * This is sometimes required if there's a risk TypeScript might remove imports during emit.
52 │    */
53 ▶   ForceNewImport = 0x01,
54 │ 
55 │   /**
56 │    * Don't make use of any aliasing information when emitting a reference.
57 │    *
58 │    * This is sometimes required if emitting into a context where generated references will be fed
59 │    * into TypeScript and type-checked (such as in template type-checking).
60 │    */
61 ▶   NoAliasing = 0x02,
62 │ 
63 │   /**
64 │    * Indicates that an import to a type-only declaration is allowed.
65 │    *
66 │    * For references that occur in type-positions, the referred declaration may be a type-only
67 │    * declaration that is not retained during emit. Including this flag allows to emit references to
68 │    * type-only declarations as used in e.g. template type-checking.
69 │    */
70 ▶   AllowTypeImports = 0x04,
```

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L71–90 （▶ の行: 84, 89）

```ts
71 │ 
72 │   /**
73 │    * Indicates that importing from a declaration file using a relative import path is allowed.
74 │    *
75 │    * The generated imports should normally use module specifiers that are valid for use in
76 │    * production code, where arbitrary relative imports into e.g. node_modules are not allowed. For
77 │    * template type-checking code it is however acceptable to use relative imports, as such files are
78 │    * never emitted to JS code.
79 │    *
80 │    * Non-declaration files have to be contained within a configured `rootDir` so using relative
81 │    * paths may not be possible for those, hence this flag only applies when importing from a
82 │    * declaration file.
83 │    */
84 ▶   AllowRelativeDtsImports = 0x08,
85 │ 
86 │   /**
87 │    * Indicates that references coming from ambient imports are allowed.
88 │    */
89 ▶   AllowAmbientReferences = 0x010,
90 │ }
```

| フラグ | 効く行 | 誰が付けるか（grep で確かめた呼び出し） |
| --- | --- | --- |
| `ForceNewImport`（53 行目） | 3 節 248〜250 行目 | annotations/common/src/util.ts の `toR3Reference`。値の参照はふつうに、**型の参照**（.d.ts に書く方）は `ForceNewImport \| AllowTypeImports` で作る。51 行目のコメントの「TypeScript が出力で import を消す恐れがある」場合に当たるため |
| `NoAliasing`（61 行目） | 下の `AliasStrategy` の 226 行目 | 型チェックのコード（typecheck/ の tcb\_adapter.ts など）。型チェックに渡すので、別名ではなく本当の名前で書く |
| `AllowTypeImports`（70 行目） | 4 節 348 行目 | `toR3Reference` の型の参照・型チェック・型の翻訳（translator/src/type\_translator.ts） |
| `AllowRelativeDtsImports`（84 行目） | 5 節 452 行目 | 型チェック。型チェックのファイルは JS に出ないので、node\_modules への相対パスでもよい |
| `AllowAmbientReferences`（89 行目） | 3 節 266 行目 | 型の翻訳と、ディレクティブの入力の型（annotations/directive/src/shared.ts） |

## 7. 書けないときのエラー

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/emitter.ts` L160–176 （▶ の行: 165, 169–171, 173–174）

```ts
160 │ export function assertSuccessfulReferenceEmit(
161 │   result: ReferenceEmitResult,
162 │   origin: ts.Node,
163 │   typeKind: string,
164 │ ): asserts result is EmittedReference {
165 ▶   if (result.kind === ReferenceEmitKind.Success) {
166 │     return;
167 │   }
168 │ 
169 ▶   const message = makeDiagnosticChain(
170 ▶     `Unable to import ${typeKind} ${nodeNameForError(result.ref.node)}.`,
171 ▶     [makeDiagnosticChain(result.reason)],
172 │   );
173 ▶   throw new FatalDiagnosticError(ErrorCode.IMPORT_GENERATION_FAILURE, origin, message, [
174 ▶     makeRelatedInformation(result.ref.node, `The ${typeKind} is declared here.`),
175 │   ]);
176 │ }
```

handler は emit の結果をこの `assertSuccessfulReferenceEmit` に通し、Failed なら FatalDiagnosticError を投げます。メッセージは 2 段で、1 段目が 170 行目の「Unable to import &lt;種類&gt; &lt;名前&gt;.」、2 段目が strategy の理由です。173 行目のエラー番号は `IMPORT_GENERATION_FAILURE`（3004）で、出力では -993004 になります。174 行目で、宣言の場所を関連する場所に付けます。

記録のスクリプトの最後で、エクスポートされていない `HiddenCmp` を別のファイルのテンプレートで使いました。本物の NgtscProgram が返した診断（記録）です。

📄 `記録に使った入力 src/uses-hidden.ts`

```ts
import {Component} from '@angular/core';
import {ALL} from './shared';

@Component({selector: 'app-uses-hidden', imports: ALL, template: '<app-hidden />'})
export class UsesHidden {}

```

| code | 場所 | メッセージ | 関連する場所 |
| --- | --- | --- | --- |
| -993004 | src/uses-hidden.ts:5（`UsesHidden`） | Unable to import component HiddenCmp.<br>The symbol is not exported from src/shared.ts. | src/shared.ts:6：The component is declared here. |

下線は `UsesHidden` のクラス名に付きます。component の handler が、テンプレートで使う依存の import を書こうとして、その場で assert しているからです。直すには shared.ts で `HiddenCmp` を export します。

## 8. AliasingHost：別名で re-export する仕組み

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/alias.ts` L46–73 （▶ の行: 46, 53, 68）

```ts
46 ▶ export interface AliasingHost {
47 │   /**
48 │    * Controls whether any alias re-exports are rendered into .d.ts files.
49 │    *
50 │    * This is not always necessary for aliasing to function correctly, so this flag allows an
51 │    * `AliasingHost` to avoid cluttering the .d.ts files if exports are not strictly needed.
52 │    */
53 ▶   readonly aliasExportsInDts: boolean;
54 │ 
55 │   /**
56 │    * Determine a name by which `decl` should be re-exported from `context`, depending on the
57 │    * particular set of aliasing rules in place.
58 │    *
59 │    * `maybeAliasSymbolAs` can return `null`, in which case no alias export should be generated.
60 │    *
61 │    * @param ref a `Reference` to the directive/pipe to consider for aliasing.
62 │    * @param context the `ts.SourceFile` in which the alias re-export might need to be generated.
63 │    * @param ngModuleName the declared name of the `NgModule` within `context` for which the alias
64 │    * would be generated.
65 │    * @param isReExport whether the directive/pipe under consideration is re-exported from another
66 │    * NgModule (as opposed to being declared by it directly).
67 │    */
68 ▶   maybeAliasSymbolAs(
69 │     ref: Reference<ClassDeclaration>,
70 │     context: ts.SourceFile,
71 │     ngModuleName: string,
72 │     isReExport: boolean,
73 │   ): string | null;
```

NgModule の時代の問題です。`import {SomeModule} from 'some-lib/deep/path'` の NgModule が export するディレクティブを、テンプレートで使うとき、コンパイラは 4 節の AbsoluteModuleStrategy で `'some-lib/deep/path'` から import しようとします。そのファイルがディレクティブを export していなければ書けません。`AliasingHost` は、NgModule のファイルに「別名の re-export」を足す（68 行目の `maybeAliasSymbolAs`）か、別名で import する式を返す（`getAliasIn`）部品です。

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/alias.ts` L165–203 （▶ の行: 170, 177, 180, 186, 193–194, 198, 200, 202）

```ts
165 │    * Under private export aliasing, the `AbsoluteModuleStrategy` used for emitting references will
166 │    * will select aliased exports that it finds in the .d.ts file for an NgModule's file. Thus,
167 │    * emitting these exports in .d.ts is a requirement for the `PrivateExportAliasingHost` to
168 │    * function correctly.
169 │    */
170 ▶   readonly aliasExportsInDts = true;
171 │ 
172 │   maybeAliasSymbolAs(
173 │     ref: Reference<ClassDeclaration>,
174 │     context: ts.SourceFile,
175 │     ngModuleName: string,
176 │   ): string | null {
177 ▶     if (ref.hasOwningModuleGuess) {
178 │       // Skip nodes that already have an associated absolute module specifier, since they can be
179 │       // safely imported from that specifier.
180 ▶       return null;
181 │     }
182 │     // Look for a user-provided export of `decl` in `context`. If one exists, then an alias export
183 │     // is not needed.
184 │     // TODO(alxhub): maybe add a host method to check for the existence of an export without going
185 │     // through the entire list of exports.
186 ▶     const exports = this.host.getExportsOfModule(context);
187 │     if (exports === null) {
188 │       // Something went wrong, and no exports were available at all. Bail rather than risk creating
189 │       // re-exports when they're not needed.
190 │       throw new Error(`Could not determine the exports of: ${context.fileName}`);
191 │     }
192 │     let found: boolean = false;
193 ▶     exports.forEach((value) => {
194 ▶       if (value.node === ref.node) {
195 │         found = true;
196 │       }
197 │     });
198 ▶     if (found) {
199 │       // The module exports the declared class directly, no alias is necessary.
200 ▶       return null;
201 │     }
202 ▶     return `ɵngExportɵ${ngModuleName}ɵ${ref.node.name.text}`;
203 │   }
```

- `PrivateExportAliasingHost` は、tsconfig の `generateDeepReexports: true` で、パッケージの入口（flat module の entryPoint）が無いときに使われます（makeCompilation。[第 3 回](03-ngtsc-compiler-ticket.md)）。
- 177〜181 行目：パッケージ名で見つけたクラスは、その名前から import できるので別名は要りません。193〜201 行目：NgModule のファイルがすでに export していれば要りません。
- 202 行目：それ以外は `ɵngExportɵ<NgModule の名前>ɵ<クラス名>` という名前で re-export させます。170 行目の `aliasExportsInDts = true` なので .d.ts にも書かれ、使う側の 4 節 397 行目の export の一覧に入ります。

📄 `angular/packages/compiler-cli/src/ngtsc/imports/src/alias.ts` L224–236 （▶ の行: 226–227, 230, 232–233）

```ts
224 │ export class AliasStrategy implements ReferenceEmitStrategy {
225 │   emit(ref: Reference, context: ts.SourceFile, importMode: ImportFlags): EmittedReference | null {
226 ▶     if (importMode & ImportFlags.NoAliasing || ref.alias === null) {
227 ▶       return null;
228 │     }
229 │ 
230 ▶     return {
231 │       kind: ReferenceEmitKind.Success,
232 ▶       expression: ref.alias,
233 ▶       importedFile: 'unknown',
234 │     };
235 │   }
236 │ }
```

もう 1 つの `UnifiedModulesAliasingHost` は `getAliasIn` で別名の式を返し、スコープの側が 1 節の `cloneWithAlias` で Reference に付けます。それを読むのがこの `AliasStrategy` で、`NoAliasing` が無く、別名が付いていれば、その式をそのまま返します（233 行目の importedFile は 'unknown'）。

📄 `記録のスクリプト（scratchpad の記録スクリプト refs.mjs。angular-deep-dive を cwd にして node で走らせる）`

```
// 第 6 回（ngtsc-references-imports）の記録。
// 使い方: cd angular-deep-dive && node <このファイル> > refs.json
// 本物の NgtscProgram（@angular/compiler-cli 22.1.6）を作り、NgCompiler が makeCompilation で組み立てた
// ReferenceEmitter（compilation.refEmitter）をそのまま使って、いくつかの Reference を出力の式にする。
// 各 strategy の emit を包んで「どの順に試し、どれが答えたか」を記録する（包むだけで、中身は変えない）。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const req = createRequire(path.join(process.cwd(), 'package.json'));
const load = (id) => import(pathToFileURL(req.resolve(id)).href);
const ts = (await load('typescript')).default;
const { PartialEvaluator, Reference } = await load('@angular/compiler-cli/private/migrations');
const { NgtscProgram, createCompilerHost, setFileSystem, NodeJSFileSystem } = await load('@angular/compiler-cli');
setFileSystem(new NodeJSFileSystem());

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'b-tmp', 'refs');
fs.rmSync(root, { recursive: true, force: true });
for (const d of ['src', 'gen']) fs.mkdirSync(path.join(root, d), { recursive: true });
fs.symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'));

const FILES = {
  'src/shared.ts': `import {Component} from '@angular/core';

@Component({selector: 'app-button', template: ''})
export class ButtonCmp {}

@Component({selector: 'app-hidden', template: ''})
class HiddenCmp {}

@Component({selector: 'app-renamed', template: ''})
class RenamedCmp {}
export {RenamedCmp as PublicCmp};

export const ALL = [ButtonCmp, HiddenCmp, RenamedCmp];
`,
  'gen/generated.ts': `import {Component} from '@angular/core';

@Component({selector: 'app-gen', template: ''})
export class GenCmp {}
`,
  'src/app.ts': `import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ButtonCmp, ALL} from './shared';
import {GenCmp} from '../gen/generated';

@Component({selector: 'app-local', template: ''})
export class LocalCmp {}

export const FROM_APP = [LocalCmp, ButtonCmp, CommonModule, GenCmp];
export const FROM_SHARED = ALL;
`,
  'src/other.ts': `export const nothing = 0;
`,
  // 7 番目の場面: エクスポートされていない HiddenCmp を、テンプレートで使う
  'src/uses-hidden.ts': `import {Component} from '@angular/core';
import {ALL} from './shared';

@Component({selector: 'app-uses-hidden', imports: ALL, template: '<app-hidden />'})
export class UsesHidden {}
`,
};
for (const [name, text] of Object.entries(FILES)) fs.writeFileSync(path.join(root, name), text);

const rel = (fileName) => {
  const i = fileName.lastIndexOf('node_modules/');
  return i >= 0 ? fileName.slice(i) : path.relative(root, fileName);
};
const where = (node) => {
  const sf = node.getSourceFile();
  return `${rel(sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
};

function makeProgram(extraOptions, rootFiles) {
  const options = {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    outDir: path.join(root, 'out'),
    ...extraOptions,
  };
  const host = createCompilerHost({ options });
  const program = new NgtscProgram(rootFiles.map((f) => path.join(root, f)), options, host);
  return program;
}

const log = [];
function instrument(refEmitter) {
  // strategies は ReferenceEmitter の private のフィールド（emitter.ts 215 行目）。Node なので読める
  const names = refEmitter.strategies.map((s) => s.constructor.name);
  for (const s of refEmitter.strategies) {
    const orig = s.emit.bind(s);
    s.emit = (ref, context, flags) => {
      const r = orig(ref, context, flags);
      log.push({ strategy: s.constructor.name, result: r === null ? 'null' : r.kind === 0 ? 'Success' : 'Failed' });
      return r;
    };
  }
  return names;
}

function describeExpr(expr) {
  if (expr.constructor.name === 'ExternalExpr') {
    return { kind: 'ExternalExpr', moduleName: expr.value.moduleName, name: expr.value.name };
  }
  if (expr.constructor.name === 'WrappedNodeExpr') {
    return { kind: 'WrappedNodeExpr', text: expr.node.getText(), at: where(expr.node) };
  }
  return { kind: expr.constructor.name };
}

// ImportFlags（emitter.ts 44〜90 行目）の数
const ImportFlags = { None: 0, ForceNewImport: 1, NoAliasing: 2, AllowTypeImports: 4, AllowRelativeDtsImports: 8, AllowAmbientReferences: 16 };

function emitAll(label, program, cases) {
  const compiler = program.compiler;
  // ensureAnalyzed は private。analyze と resolve を済ませ、makeCompilation の結果を返す
  const compilation = compiler.ensureAnalyzed();
  const strategies = instrument(compilation.refEmitter);
  const tsProgram = program.getTsProgram();
  const checker = tsProgram.getTypeChecker();
  const evaluator = new PartialEvaluator(compilation.reflector, checker, null);
  const sf = (f) => tsProgram.getSourceFile(path.join(root, f));
  const valueOf = (file, name) => {
    const decl = sf(file).statements
      .filter(ts.isVariableStatement)
      .flatMap((s) => s.declarationList.declarations)
      .find((d) => d.name.getText() === name);
    return evaluator.evaluate(decl.initializer);
  };
  const results = [];
  for (const c of cases) {
    const ref = c.ref(valueOf);
    log.length = 0;
    const r = compilation.refEmitter.emit(ref, sf(c.context), c.flags ?? 0);
    results.push({
      id: c.id,
      title: c.title,
      refName: ref.debugName,
      declaredIn: rel(ref.node.getSourceFile().fileName),
      bestGuessOwningModule: ref.bestGuessOwningModule?.specifier ?? null,
      identifiersIn: ref.identifiers.map(where),
      context: c.context,
      flags: Object.entries(ImportFlags).filter(([, v]) => v !== 0 && ((c.flags ?? 0) & v)).map(([k]) => k),
      tried: [...log],
      result:
        r.kind === 0
          ? { kind: 'Success', expression: describeExpr(r.expression), importedFile: r.importedFile === null ? null : typeof r.importedFile === 'string' ? r.importedFile : rel(r.importedFile.fileName) }
          : { kind: 'Failed', reason: r.reason.replaceAll(root + '/', '').replaceAll(process.cwd() + '/', '') },
    });
  }
  return { label, strategies, results };
}

const roots = ['src/app.ts', 'src/shared.ts', 'src/other.ts', 'gen/generated.ts'];
const cases = [
  { id: 'same-file', title: '同じファイルのクラス', context: 'src/app.ts', ref: (v) => v('src/app.ts', 'FROM_APP')[0] },
  { id: 'imported', title: 'import 済みの別ファイルのクラス', context: 'src/app.ts', ref: (v) => v('src/app.ts', 'FROM_APP')[1] },
  { id: 'force-new', title: '同じ参照 + ForceNewImport', context: 'src/app.ts', flags: ImportFlags.ForceNewImport, ref: (v) => v('src/app.ts', 'FROM_APP')[1] },
  { id: 'via-shared', title: 'shared.ts の配列を通って見つけたクラス', context: 'src/app.ts', ref: (v) => v('src/app.ts', 'FROM_SHARED')[0] },
  { id: 'package-local', title: 'パッケージのクラス（import 済みのファイルへ）', context: 'src/app.ts', ref: (v) => v('src/app.ts', 'FROM_APP')[2] },
  { id: 'package-other', title: 'パッケージのクラス（import していないファイルへ）', context: 'src/other.ts', ref: (v) => v('src/app.ts', 'FROM_APP')[2] },
  { id: 'not-exported', title: 'エクスポートされていないクラス', context: 'src/app.ts', ref: (v) => v('src/app.ts', 'FROM_SHARED')[1] },
  { id: 'renamed', title: '別名でエクスポートされたクラス', context: 'src/app.ts', ref: (v) => v('src/app.ts', 'FROM_SHARED')[2] },
  { id: 'other-root', title: '別のディレクトリ（gen/）のクラス', context: 'src/other.ts', ref: (v) => v('src/app.ts', 'FROM_APP')[3] },
  {
    id: 'hand-made',
    title: '手で作った Reference（持ち主を @angular/core と偽る）',
    context: 'src/other.ts',
    ref: (v) => {
      const real = v('src/app.ts', 'FROM_APP')[0];
      return new Reference(real.node, { specifier: '@angular/core', resolutionContext: path.join(root, 'src/app.ts') });
    },
  },
];

const plain = emitAll('rootDirs なし', makeProgram({}, roots), cases);
const withRootDirs = emitAll(
  'rootDirs: [src, gen]',
  makeProgram({ rootDirs: [path.join(root, 'src'), path.join(root, 'gen')] }, roots),
  cases.filter((c) => ['other-root', 'via-shared'].includes(c.id)),
);

// エクスポートされていないクラスをテンプレートで使ったときの、本物の診断
const hiddenProgram = makeProgram({}, ['src/uses-hidden.ts']);
const flatten = (m) => (typeof m === 'string' ? [m] : [m.messageText, ...(m.next ?? []).flatMap(flatten)]);
const hiddenDiagnostics = [...hiddenProgram.getNgStructuralDiagnostics(), ...hiddenProgram.getNgSemanticDiagnostics()].map((d) => ({
  code: d.code,
  at: d.file ? where({ getSourceFile: () => d.file, getStart: () => d.start }) : null,
  text: d.file ? d.file.text.slice(d.start, d.start + d.length) : null,
  message: flatten(d.messageText).map((m) => m.replaceAll(root + '/', '')),
  related: (d.relatedInformation ?? []).map((r) => ({
    at: r.file ? where({ getSourceFile: () => r.file, getStart: () => r.start }) : null,
    message: flatten(r.messageText).join(' '),
  })),
}));

const out = {
  compilerCli: JSON.parse(fs.readFileSync('node_modules/@angular/compiler-cli/package.json', 'utf8')).version,
  files: FILES,
  runs: [plain, withRootDirs],
  hiddenDiagnostics,
};
fs.rmSync(root, { recursive: true, force: true });
process.stdout.write(JSON.stringify(out, null, 2) + '\n');

```

## ここまでの呼び出し

- 👤 `@Component({ imports: [ButtonCmp, CommonModule] })` — あなたのコード
- `evaluator.evaluate` → `new Reference(node, owningModule)` と `addIdentifier` — 第 5 回 — *パッケージを通ったら bestGuessOwningModule*
- `handler（resolve や compile）` → `refEmitter.emit(ref, context, flags)` — emitter.ts L217
  - `LocalIdentifierStrategy.emit` → `ref.getIdentityIn(context)` — L281 / references.ts L139 — *あれば WrappedNodeExpr*
  - `AbsoluteModuleStrategy.emit` → `getExportsOfModule` — L337-381 / L383-417 — *持ち主のパッケージの export の名前で ExternalExpr*
  - `RelativePathStrategy.emit`（rootDirs があれば LogicalProjectStrategy） — L506-532 / L438-497 — *相対パス + findExportedNameOfNode*
- `assertSuccessfulReferenceEmit` — L160-176 — *Failed なら IMPORT\_GENERATION\_FAILURE*
- `ImportManager` が ExternalExpr を import の文にする — compiler-reify-emit の章

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| imports/test/emitter\_spec.ts | describe `AbsoluteModuleStrategy`（28 行目）・`LogicalProjectStrategy`（211）・`RelativePathStrategy`（376）・`UnifiedModulesStrategy`（435）。it `should not generate an import for a reference without owning module`（48）・`should prefer non-aliased exports`（72 ほか各 describe）・`should never use relative imports outside of the logical filesystem for source files`（284）・`should drop .tsx extension`（408） | `//packages/compiler-cli/src/ngtsc/imports/test:test` |
| test/ngtsc/imports\_spec.ts | describe `import generation`（19 行目）。it `should report an error when using a directive outside of rootDirs`（34）・`should report an error when a library entry-point does not export the symbol`（78）・``should be possible to use a directive outside of `rootDir` when no `rootDirs` are set.``（136） | `//packages/compiler-cli/test/ngtsc:ngtsc`（NgtscTestEnvironment） |

📄 `angular/packages/compiler-cli/test/ngtsc/imports_spec.ts` L59–76 （▶ の行: 60, 69–70, 72–75）

```ts
59 │       env.write(
60 ▶         '/lib/dir.ts',
61 │         `
62 │         import {Directive} from '@angular/core';
63 │ 
64 │         @Directive({selector: '[external]'})
65 │         export class ExternalDir {}
66 │       `,
67 │       );
68 │ 
69 ▶       const diags = env.driveDiagnostics();
70 ▶       expect(diags.length).toBe(1);
71 │       expect(ts.flattenDiagnosticMessageText(diags[0].messageText, '\n'))
72 ▶         .toEqual(`Unable to import class ExternalDir.
73 ▶   The file ${absoluteFrom('/lib/dir.ts')} is outside of the configured 'rootDir'.`);
74 ▶       expect(diags[0].file!.fileName).toEqual(absoluteFrom('/app/module.ts'));
75 ▶       expect(getDiagnosticSourceCode(diags[0])).toEqual('ExternalDir');
76 │     });
```

beforeEach で tsconfig に `rootDirs: ['/app']` を書いたうえで、その中から /lib/dir.ts のディレクティブを使うと、5 節 458〜463 行目の理由で、7 節の 2 段のメッセージになります。74 行目：エラーは module.ts（NgModule のファイル）に付きます。

📄 `angular/packages/compiler-cli/test/ngtsc/imports_spec.ts` L116–134 （▶ の行: 121, 127, 130–132）

```ts
116 │       env.write(
117 │         '/node_modules/lib/dir.d.ts',
118 │         `
119 │         import {ɵɵDirectiveDeclaration} from '@angular/core';
120 │ 
121 ▶         export class ExternalDir {
122 │           static ɵdir: ɵɵDirectiveDeclaration<ExternalDir, '[external]', never, never, never, never>;
123 │         }
124 │       `,
125 │       );
126 │ 
127 ▶       const diags = env.driveDiagnostics();
128 │       expect(diags.length).toBe(1);
129 │       expect(ts.flattenDiagnosticMessageText(diags[0].messageText, '\n'))
130 ▶         .toEqual(`Unable to import directive ExternalDir.
131 ▶   The symbol is not exported from ${absoluteFrom('/node_modules/lib/index.d.ts')} (module 'lib').`);
132 ▶       expect(diags[0].file!.fileName).toEqual(absoluteFrom('/app/comp.ts'));
133 │       expect(getDiagnosticSourceCode(diags[0])).toEqual('MyComponent');
134 │     });
```

パッケージ `lib` の入口（index.d.ts）が `ExternalDir` を export していないので、4 節 366〜372 行目の Failed です。メッセージの「(module 'lib')」は 371 行目の `specifier` です。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/imports/test:test \
  --nocache_test_results --test_output=all
pnpm bazel test //packages/compiler-cli/src/ngtsc/imports/test:test \
  --nocache_test_results --test_output=all '--test_arg=--filter=RelativePathStrategy'
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc \
  --nocache_test_results --test_output=all '--test_arg=--filter=import generation'
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/ngtsc-logs/b-imports-all.log・b-imports-relative.log・b-ngtsc-imports.log）`

```
64 specs, 0 failures
//packages/compiler-cli/src/ngtsc/imports/test:test                      PASSED in 0.8s

Ran 8 of 64 specs
8 specs, 0 failures
//packages/compiler-cli/src/ngtsc/imports/test:test                      PASSED in 0.4s

（shard 1〜4 の 4 回とも）
Ran 3 of 6745 specs
3 specs, 0 failures
//packages/compiler-cli/test/ngtsc:ngtsc                                 PASSED in 2.3s
INFO: Elapsed time: 2.665s
```

- 単体テストの 64 件は、emitter\_spec.ts と default\_spec.ts の it を `runInEachFileSystem` が 4 つの仮のファイルシステムで 1 回ずつ走らせた数です（RelativePathStrategy の it 2 つ × 4 = 8）。
- 結合テストのターゲットは `shard_count = 4` で、4 つの shard がそれぞれ「Ran 3 of 6745 specs」を出しました。describe `import generation` の it は 3 つで、imports\_spec.ts も 18 行目で `runInEachFileSystem` に包まれています。どの shard がどのファイルシステムの it を走らせたかは、この出力からは分かりません。

### 直すとしたら

- どの strategy が答えるかは emitter.ts の各 `emit`、並びは core/src/compiler.ts の `makeCompilation`、export の名前の選び方は find\_export.ts と 403〜413 行目です。単体の it は emitter\_spec.ts の形（strategy を 1 つ作って `new Reference(decl)` を emit する）、エラーの文言は imports\_spec.ts の形で足します。
- 最近の修正 d94b19a92fe（2026-01-18、fix: drop .tsx extension for generated relative imports、Closes #66262）：.tsx のファイルのクラスを相対パスで import すると、515 行目の `stripExtension` が `.tsx` を落とさず `'./index.tsx'` と書いていました。直したのは file\_system/src/util.ts の正規表現 1 つで、emitter\_spec.ts に it `should drop .tsx extension`（下）を足しています。

📄 `git -C ../angular show d94b19a92fe（file_system/src/util.ts の差分の抜粋）`

```
-const TS_DTS_JS_EXTENSION = /(?:\.d)?\.ts$|\.js$/;
+const TS_DTS_TSX_JS_EXTENSION = /(?:\.d)?\.ts$|\.tsx$|\.js$/;
 …
 export function stripExtension<T extends PathString>(path: T): T {
-  return path.replace(TS_DTS_JS_EXTENSION, '') as T;
+  return path.replace(TS_DTS_TSX_JS_EXTENSION, '') as T;
 }
```

📄 `angular/packages/compiler-cli/src/ngtsc/imports/test/emitter_spec.ts` L408–432 （▶ の行: 411, 420, 423, 430–431）

```ts
408 │     it('should drop .tsx extension', () => {
409 │       const {program} = makeProgram([
410 │         {
411 ▶           name: _('/index.tsx'),
412 │           contents: `export class Foo {}`,
413 │         },
414 │         {
415 │           name: _('/context.ts'),
416 │           contents: `export class Context {}`,
417 │         },
418 │       ]);
419 │       const checker = program.getTypeChecker();
420 ▶       const strategy = new RelativePathStrategy(new TypeScriptReflectionHost(checker));
421 │       const decl = getDeclaration(program, _('/index.tsx'), 'Foo', ts.isClassDeclaration);
422 │       const context = program.getSourceFile(_('/context.ts'))!;
423 ▶       const emitted = strategy.emit(new Reference(decl), context);
424 │       if (emitted === null || emitted.kind !== ReferenceEmitKind.Success) {
425 │         return fail('Reference should be emitted');
426 │       }
427 │       if (!(emitted.expression instanceof ExternalExpr)) {
428 │         return fail('Reference should be emitted as ExternalExpr');
429 │       }
430 ▶       expect(emitted.expression.value.name).toEqual('Foo');
431 ▶       expect(emitted.expression.value.moduleName).toEqual('./index');
432 │     });
```

- 開いている issue の #43271（Provide control over paths of inserted imports in ivy library build、2021 年から open）は、yarn workspaces のモノレポで、ライブラリのビルドが `@scope/pkg` ではなく `../../node_modules/@scope/pkg/src/my.module` のような深い相対パスの import を足す、という報告です。この章で読むと、Reference に bestGuessOwningModule が無いと 4 節 337〜340 行目で AbsoluteModuleStrategy を素通りし、5 節の RelativePathStrategy が 511〜515 行目でファイルどうしの相対パスを書く、という道です。issue を読むときは、このページの DEMO の「試した順」と同じ形で、どの strategy が答えたかを先に決めると、関係する行が 3〜5 節のどれかに絞れます（[第 20 回](20-ngtsc-issues.md)）。本家に PR を出すことは勧めません。

## 聞かれそうな質問

**Q. コンパイラは、新しい import をいつ足しますか？元の import を使い回すのはいつですか？**

書き込む先のファイルに、その宣言を指す識別子が記録されていれば、281〜287 行目で使い回します（新しい import は無し）。記録されるのは、評価器がそのファイルの識別子をたどって Reference を返したときです（references.ts 131〜133 行目）。無ければ、パッケージ名（4 節）か相対パス（5 節）で ExternalExpr を作り、出力のときに import が足されます。

**Q. パッケージのクラスを、深いパスではなくパッケージ名から import するのはなぜですか？**

Reference の `bestGuessOwningModule` に、評価器がたどった import のパッケージ名が入っているからです（4 節 357 行目）。名前はその入口から export されている名前で、2 つあれば宣言と同じ名前を選びます（403〜413 行目）。

**Q. 「Unable to import component X. The symbol is not exported from …」の直し方は？**

X を宣言しているファイルで export します。RelativePathStrategy は、そのファイルから export されている名前しか書けません（517〜524 行目）。パッケージなら、入口から export されていない（366〜372 行目）ので、パッケージ側の問題です。

**Q. rootDirs を使うと、import のパスはどう変わりますか？**

3 つ目の strategy が LogicalProjectStrategy になり、rootDirs の中の論理パスどうしで相対パスを作ります（491 行目）。src/ と gen/ を rootDirs にすれば、src/app.ts から gen/generated.ts は `'./generated'` です。rootDirs の外のファイルは 458〜463 行目でエラーになります。

**Q. ForceNewImport はいつ使われますか？**

`toR3Reference` が型の参照（.d.ts に書く方）を作るときです。3 節 248〜250 行目で、宣言のファイル以外ではローカルの識別子を使わず、必ず import を作ります。元のファイルの import は、値として使われていなければ TypeScript の出力で消されることがあるからです（51 行目のコメント）。

## 読み終えて

- Reference は宣言（node）と、見つけた事情（bestGuessOwningModule・identifiers・synthetic・isAmbient）を持つ。
- ReferenceEmitter は strategy を前から試し、最初に null 以外を返したものを使う。Failed はそこで終わる。
- ふつうの並びは、ローカルの識別子 → パッケージ名（bestGuessOwningModule と入口の export）→ 相対パス（rootDirs なら論理パス）。
- ImportFlags は、型の位置・型チェック・別名の禁止など、場面に合わせて strategy の判断を変える。
- 書けなければ assertSuccessfulReferenceEmit が IMPORT\_GENERATION\_FAILURE（-993004）の 2 段のメッセージにする。

---

← 前: [静的な評価：デコレーターの引数を、動かさずに読む](05-ngtsc-partial-evaluator.md)  
次: [TraitCompiler（1）：デコレーターを見つけて解析する](07-ngtsc-trait-analyze.md) →
