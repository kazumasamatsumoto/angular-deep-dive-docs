[目次](../README.md) › [ngtsc の内側](README.md) › 第 4 回 / 全 20 回

# リフレクション：TypeScript の AST からクラスとデコレーターを読む

> ReflectionHost の約束（getDecoratorsOfDeclaration・getMembersOfClass・getConstructorParameters・getImportOfIdentifier・getDeclarationOfIdentifier）と TypeScriptReflectionHost の実装、コンストラクタの引数の型を値に戻す typeToValue（import type だと注入できない理由）、ClassMember の種類。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-reflection)

---

ngtsc はデコレーターを実行しません。TypeScript の AST（構文木）と型チェッカーから「このクラスにはどのデコレーターが、どんな引数で付いているか」「コンストラクタの引数の型は、どの import の何か」を読み取ります。その窓口が `ReflectionHost` という約束（interface）と、その実装の `TypeScriptReflectionHost` です。この章では、約束の形と実装の行、そしてコンストラクタの引数の「型」を「値」の参照に戻す `typeToValue` が、`import type` や interface のときに諦める行を追います。

読む対象は `packages/compiler-cli/src/ngtsc/reflection/src/host.ts`・`typescript.ts`・`type_to_value.ts` です。

1. [1. 全体像](01-ngtsc-overview.md)
2. [2. NgtscProgram](02-ngtsc-program.md)
3. [3. NgCompiler とチケット](03-ngtsc-compiler-ticket.md)
4. **4. リフレクション**（この章）
5. [5. 静的な評価](05-ngtsc-partial-evaluator.md)
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

## 1. ReflectionHost の約束

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/host.ts` L556–582 （▶ の行: 556, 568, 573–574, 580, 582）

```ts
556 ▶   getDecoratorsOfDeclaration(declaration: DeclarationNode): Decorator[] | null;
557 │ 
558 │   /**
559 │    * Examine a declaration which should be of a class, and return metadata about the members of the
560 │    * class.
561 │    *
562 │    * @param clazz a `ClassDeclaration` representing the class over which to reflect.
563 │    *
564 │    * @returns an array of `ClassMember` metadata representing the members of the class.
565 │    *
566 │    * @throws if `declaration` does not resolve to a class declaration.
567 │    */
568 ▶   getMembersOfClass(clazz: ClassDeclaration): ClassMember[];
569 │ 
570 │   /**
571 │    * Reflect over the constructor of a class and return metadata about its parameters.
572 │    *
573 ▶    * This method only looks at the constructor of a class directly and not at any inherited
574 ▶    * constructors.
575 │    *
576 │    * @param clazz a `ClassDeclaration` representing the class over which to reflect.
577 │    *
578 │    * @returns an array of `Parameter` metadata representing the parameters of the constructor, if
579 │    * a constructor exists. If the constructor exists and has 0 parameters, this array will be empty.
580 ▶    * If the class has no constructor, this method returns `null`.
581 │    */
582 ▶   getConstructorParameters(clazz: ClassDeclaration): CtorParameter[] | null;
```

クラスについて聞く 3 つの関数です。556 行目がデコレーター、568 行目がメンバー、582 行目がコンストラクタの引数。573〜574 行目のとおり、`getConstructorParameters` は**そのクラス自身のコンストラクタだけ**を見て、親クラスのものはたどりません。580 行目、コンストラクタが無ければ `null`、引数 0 個なら空の配列です（この違いで「親のコンストラクタを継ぐ」かどうかが決まります。[di-factory の章](../di/04-di-factory.md)の 6 節）。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/host.ts` L617–649 （▶ の行: 620–621, 624, 640–642, 649）

````ts
617 │   /**
618 │    * Trace an identifier to its declaration, if possible.
619 │    *
620 ▶    * This method attempts to resolve the declaration of the given identifier, tracing back through
621 ▶    * imports and re-exports until the original declaration statement is found. A `Declaration`
622 │    * object is returned if the original declaration is found, or `null` is returned otherwise.
623 │    *
624 ▶    * If the declaration is in a different module, and that module is imported via an absolute path,
625 │    * this method also returns the absolute path of the imported module. For example, if the code is:
626 │    *
627 │    * ```ts
628 │    * import {RouterModule} from '@angular/core';
629 │    *
630 │    * export const ROUTES = RouterModule.forRoot([...]);
631 │    * ```
632 │    *
633 │    * and if `getDeclarationOfIdentifier` is called on `RouterModule` in the `ROUTES` expression,
634 │    * then it would trace `RouterModule` via its import from `@angular/core`, and note that the
635 │    * definition was imported from `@angular/core` into the application where it was referenced.
636 │    *
637 │    * If the definition is re-exported several times from different absolute module names, only
638 │    * the first one (the one by which the application refers to the module) is returned.
639 │    *
640 ▶    * This module name is returned in the `viaModule` field of the `Declaration`. If The declaration
641 ▶    * is relative to the application itself and there was no import through an absolute path, then
642 ▶    * `viaModule` is `null`.
643 │    *
644 │    * @param id a TypeScript `ts.Identifier` to trace back to a declaration.
645 │    *
646 │    * @returns metadata about the `Declaration` if the original declaration is found, or `null`
647 │    * otherwise.
648 │    */
649 ▶   getDeclarationOfIdentifier(id: ts.Identifier): Declaration | null;
````

識別子（名前）について聞く関数のうち、`getDeclarationOfIdentifier` は 620〜621 行目のとおり import や再 export をたどって元の宣言まで行きます。624 行目と 640〜642 行目、途中で `@angular/core` のような**絶対のモジュール名**を通ったら、その名前を `viaModule` に残します。これが、のちに出力のファイルで「どこから import すればよいか」を決める手がかりになります（[第 6 回](06-ngtsc-references-imports.md)）。

host.ts の `ClassDeclaration` の型のコメント（引用の外）は、ES5 のコードではクラスが IIFE（その場で呼ぶ関数）の結果を入れる変数の宣言になる、と書いています。この約束は、そうした TypeScript 以外の形のコードも同じ問いで読めるように作られています。いまの実装は `TypeScriptReflectionHost` 1 つで、[第 3 回](03-ngtsc-compiler-ticket.md)の `makeCompilation` が最初に作る部品です。

## 2. 返ってくる形：Decorator・ClassMember・CtorParameter・Import・Declaration

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/host.ts` L14–44 （▶ の行: 21, 26, 32, 37, 43）

```ts
14 │ export interface Decorator {
15 │   /**
16 │    * Name by which the decorator was invoked in the user's code.
17 │    *
18 │    * This is distinct from the name by which the decorator was imported (though in practice they
19 │    * will usually be the same).
20 │    */
21 ▶   name: string;
22 │ 
23 │   /**
24 │    * Identifier which refers to the decorator in the user's code.
25 │    */
26 ▶   identifier: DecoratorIdentifier;
27 │ 
28 │   /**
29 │    * `Import` by which the decorator was brought into the module in which it was invoked, or `null`
30 │    * if the decorator was declared in the same module and not imported.
31 │    */
32 ▶   import: Import | null;
33 │ 
34 │   /**
35 │    * TypeScript reference to the decorator itself.
36 │    */
37 ▶   node: ts.Node;
38 │ 
39 │   /**
40 │    * Arguments of the invocation of the decorator, if the decorator is invoked, or `null`
41 │    * otherwise.
42 │    */
43 ▶   args: ts.Expression[] | null;
44 │ }
```

21 行目の `name` は**利用者のコードでの呼び名**、32 行目の `import` は「どのモジュールの、何という名前で export されたものか」です。`import {Component as C} from '@angular/core'` と書くと、`name` は `C`、`import.name` は `Component` になります。handler は `import.name` と `import.from` で「これは本物の Angular の `@Component` か」を判定します。43 行目の `args` は引数の**式の AST** で、値ではありません。値にするのは [第 5 回](05-ngtsc-partial-evaluator.md)の `PartialEvaluator` です。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/host.ts` L83–101 （▶ の行: 86–91, 95, 100）

```ts
 83 │ /**
 84 │  * An enumeration of possible kinds of class members.
 85 │  */
 86 ▶ export enum ClassMemberKind {
 87 ▶   Constructor,
 88 ▶   Getter,
 89 ▶   Setter,
 90 ▶   Property,
 91 ▶   Method,
 92 │ }
 93 │ 
 94 │ /** Possible access levels of a class member. */
 95 ▶ export enum ClassMemberAccessLevel {
 96 │   PublicWritable,
 97 │   PublicReadonly,
 98 │   Protected,
 99 │   Private,
100 ▶   EcmaScriptPrivate,
101 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/host.ts` L106–130 （▶ の行: 110, 115, 118, 124, 129）

```ts
106 │ export interface ClassMember {
107 │   /**
108 │    * TypeScript reference to the class member itself, or null if it is not applicable.
109 │    */
110 ▶   node: ts.Node | null;
111 │ 
112 │   /**
113 │    * Indication of which type of member this is (property, method, etc).
114 │    */
115 ▶   kind: ClassMemberKind;
116 │ 
117 │   /** Access level describing the class member modifiers. */
118 ▶   accessLevel: ClassMemberAccessLevel;
119 │ 
120 │   /**
121 │    * TypeScript `ts.TypeNode` representing the type of the member, or `null` if not present or
122 │    * applicable.
123 │    */
124 ▶   type: ts.TypeNode | null;
125 │ 
126 │   /**
127 │    * Name of the class member.
128 │    */
129 ▶   name: string;
130 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/host.ts` L191–202 （▶ の行: 191, 196, 201）

```ts
191 ▶   implementation: ts.Declaration | null;
192 │ 
193 │   /**
194 │    * Whether the member is static or not.
195 │    */
196 ▶   isStatic: boolean;
197 │ 
198 │   /**
199 │    * Any `Decorator`s which are present on the member, or `null` if none are present.
200 │    */
201 ▶   decorators: Decorator[] | null;
202 │ }
```

メンバーの種類は 87〜91 行目の 5 つ、見える範囲は 96〜100 行目の 5 つです。100 行目の `EcmaScriptPrivate` は `#name` の形の本物の private です。191 行目の `implementation` は、ES5 に下げたコードで「値を作っている関数」を指すための欄で、TypeScript のコードでは `node` と同じものが入ります（4 節）。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/host.ts` L368–407 （▶ の行: 375, 392, 401, 406）

```ts
368 │ export interface CtorParameter {
369 │   /**
370 │    * Name of the parameter, if available.
371 │    *
372 │    * Some parameters don't have a simple string name (for example, parameters which are destructured
373 │    * into multiple variables). In these cases, `name` can be `null`.
374 │    */
375 ▶   name: string | null;
376 │ 
377 │   /**
378 │    * TypeScript `ts.BindingName` representing the name of the parameter.
379 │    *
380 │    * The `nameNode` is useful in writing references to this member that will be correctly source-
381 │    * mapped back to the original file.
382 │    */
383 │   nameNode: ts.BindingName;
384 │ 
385 │   /**
386 │    * Reference to the value of the parameter's type annotation, if it's possible to refer to the
387 │    * parameter's type as a value.
388 │    *
389 │    * This can either be a reference to a local value, a reference to an imported value, or no
390 │    * value if no is present or cannot be represented as an expression.
391 │    */
392 ▶   typeValueReference: TypeValueReference;
393 │ 
394 │   /**
395 │    * TypeScript `ts.TypeNode` representing the type node found in the type position.
396 │    *
397 │    * This field can be used for diagnostics reporting if `typeValueReference` is `null`.
398 │    *
399 │    * Can be null, if the param has no type declared.
400 │    */
401 ▶   typeNode: ts.TypeNode | null;
402 │ 
403 │   /**
404 │    * Any `Decorator`s which are present on the parameter, or `null` if none are present.
405 │    */
406 ▶   decorators: Decorator[] | null;
407 │ }
```

コンストラクタの引数の欄で大事なのは 392 行目の `typeValueReference` です。`constructor(private greeter: Greeter)` の `Greeter` は**型**の位置にありますが、出力の `ɵfac` では `ɵɵdirectiveInject(Greeter)` のように**値**として書く必要があります。その「値として書くならこう」が `typeValueReference` で、401 行目の `typeNode` は元の型の AST（診断の位置に使う）です。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/host.ts` L204–228 （▶ の行: 205–207, 220, 227）

```ts
204 │ export const enum TypeValueReferenceKind {
205 ▶   LOCAL,
206 ▶   IMPORTED,
207 ▶   UNAVAILABLE,
208 │ }
209 │ 
210 │ /**
211 │  * A type reference that refers to any type via a `ts.Expression` that's valid within the local file
212 │  * where the type was referenced.
213 │  */
214 │ export interface LocalTypeValueReference {
215 │   kind: TypeValueReferenceKind.LOCAL;
216 │ 
217 │   /**
218 │    * The synthesized expression to reference the type in a value position.
219 │    */
220 ▶   expression: ts.Expression;
221 │ 
222 │   /**
223 │    * If the type originates from a default import, the import statement is captured here to be able
224 │    * to track its usages, preventing the import from being elided if it was originally only used in
225 │    * a type-position. See `DefaultImportTracker` for details.
226 │    */
227 ▶   defaultImportStatement: ts.ImportDeclaration | null;
228 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/host.ts` L272–306 （▶ の行: 279, 284, 290, 295, 300, 305）

```ts
272 │ /**
273 │  * The various reasons why the compiler may be unable to synthesize a value from a type reference.
274 │  */
275 │ export const enum ValueUnavailableKind {
276 │   /**
277 │    * No type node was available.
278 │    */
279 ▶   MISSING_TYPE,
280 │ 
281 │   /**
282 │    * The type does not have a value declaration, e.g. an interface.
283 │    */
284 ▶   NO_VALUE_DECLARATION,
285 │ 
286 │   /**
287 │    * The type is imported using a type-only imports, so it is not suitable to be used in a
288 │    * value-position.
289 │    */
290 ▶   TYPE_ONLY_IMPORT,
291 │ 
292 │   /**
293 │    * The type reference could not be resolved to a declaration.
294 │    */
295 ▶   UNKNOWN_REFERENCE,
296 │ 
297 │   /**
298 │    * The type corresponds with a namespace.
299 │    */
300 ▶   NAMESPACE,
301 │ 
302 │   /**
303 │    * The type is not supported in the compiler, for example union types.
304 │    */
305 ▶   UNSUPPORTED,
306 │ }
```

値への戻し方は 205〜207 行目の 3 通りです。`LOCAL` はその場で書ける式（220 行目）、`IMPORTED` は「どのモジュールの何を import すればよいか」、`UNAVAILABLE` は戻せない、です。戻せない理由は 279〜305 行目の 6 つで、それぞれ 3 節で出てくる行に対応します。227 行目の `defaultImportStatement` は、`import Store from './store'` のように default import で入ってきた型を値として使うとき、TypeScript が「型にしか使っていない import」として消してしまわないように覚えておく欄です。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/host.ts` L478–499 （▶ の行: 486, 493, 498）

```ts
478 │ /**
479 │  * The source of an imported symbol, including the original symbol name and the module from which it
480 │  * was imported.
481 │  */
482 │ export interface Import {
483 │   /**
484 │    * The name of the imported symbol under which it was exported (not imported).
485 │    */
486 ▶   name: string;
487 │ 
488 │   /**
489 │    * The module from which the symbol was imported.
490 │    *
491 │    * This could either be an absolute module name (@angular/core for example) or a relative path.
492 │    */
493 ▶   from: string;
494 │ 
495 │   /**
496 │    * TypeScript node that represents this import.
497 │    */
498 ▶   node: ts.ImportDeclaration;
499 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/host.ts` L513–529 （▶ の行: 523, 528）

```ts
513 │ /**
514 │  * The declaration of a symbol, along with information about how it was imported into the
515 │  * application.
516 │  */
517 │ export interface Declaration<T extends ts.Declaration = ts.Declaration> {
518 │   /**
519 │    * The absolute module path from which the symbol was imported into the application, if the symbol
520 │    * was imported via an absolute module (even through a chain of re-exports). If the symbol is part
521 │    * of the application and was not imported from an absolute path, this will be `null`.
522 │    */
523 ▶   viaModule: string | AmbientImport | null;
524 │ 
525 │   /**
526 │    * TypeScript reference to the declaration itself, if one exists.
527 │    */
528 ▶   node: T;
529 │ }
```

識別子についての答えの形です。`Import` の 486 行目の `name` は「export されたときの名前（import した名前ではない）」、493 行目の `from` は import の文に書いた文字列そのもの（相対パスもありうる）です。`Declaration` は宣言のノード（528 行目）と、絶対のモジュールを通ってきたならその名前（523 行目の `viaModule`）の組です。

## 3. typeToValue：型の位置の参照を、値の参照に戻す

まず `getConstructorParameters` の本体です。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L73–100 （▶ の行: 76, 81, 83, 85–86, 89, 91, 93, 98）

```ts
 73 │   getConstructorParameters(clazz: ClassDeclaration): CtorParameter[] | null {
 74 │     const tsClazz = castDeclarationToClassOrDie(clazz);
 75 │ 
 76 ▶     const isDeclaration = tsClazz.getSourceFile().isDeclarationFile;
 77 │     // For non-declaration files, we want to find the constructor with a `body`. The constructors
 78 │     // without a `body` are overloads whereas we want the implementation since it's the one that'll
 79 │     // be executed and which can have decorators. For declaration files, we take the first one that
 80 │     // we get.
 81 ▶     const ctor = tsClazz.members.find(
 82 │       (member): member is ts.ConstructorDeclaration =>
 83 ▶         ts.isConstructorDeclaration(member) && (isDeclaration || member.body !== undefined),
 84 │     );
 85 ▶     if (ctor === undefined) {
 86 ▶       return null;
 87 │     }
 88 │ 
 89 ▶     return ctor.parameters.map((node) => {
 90 │       // The name of the parameter is easy.
 91 ▶       const name = parameterName(node.name);
 92 │ 
 93 ▶       const decorators = this.getDecoratorsOfDeclaration(node);
 94 │ 
 95 │       // It may or may not be possible to write an expression that refers to the value side of the
 96 │       // type named for the parameter.
 97 │ 
 98 ▶       let originalTypeNode = node.type || null;
 99 │       let typeNode = originalTypeNode;
100 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L101–129 （▶ の行: 105–106, 110, 114–115, 119, 125）

```ts
101 │       // Check if we are dealing with a simple nullable union type e.g. `foo: Foo|null`
102 │       // and extract the type. More complex union types e.g. `foo: Foo|Bar` are not supported.
103 │       // We also don't need to support `foo: Foo|undefined` because Angular's DI injects `null` for
104 │       // optional tokes that don't have providers.
105 ▶       if (typeNode && ts.isUnionTypeNode(typeNode)) {
106 ▶         let childTypeNodes = typeNode.types.filter(
107 │           (childTypeNode) =>
108 │             !(
109 │               ts.isLiteralTypeNode(childTypeNode) &&
110 ▶               childTypeNode.literal.kind === ts.SyntaxKind.NullKeyword
111 │             ),
112 │         );
113 │ 
114 ▶         if (childTypeNodes.length === 1) {
115 ▶           typeNode = childTypeNodes[0];
116 │         }
117 │       }
118 │ 
119 ▶       const typeValueReference = typeToValue(typeNode, this.checker, this.isLocalCompilation);
120 │ 
121 │       return {
122 │         name,
123 │         nameNode: node.name,
124 │         typeValueReference,
125 ▶         typeNode: originalTypeNode,
126 │         decorators,
127 │       };
128 │     });
129 │   }
```

1. **81〜84 行目：`body` のあるコンストラクタを選ぶ**

   オーバーロード（本体の無い宣言）が並んでいても、実行される本体つきのものを読みます。76 行目、.d.ts のときは本体が無いので最初の 1 つです。
2. **93 行目：引数のデコレーター（`@Inject`・`@Optional` など）も読む**
3. **105〜117 行目：`Foo | null` から `null` を外す**

   101〜104 行目のコメントのとおり、`Foo | null` だけは `Foo` とみなします。`Foo | Bar` は外しても 2 つ残るので、そのまま（次の関数で `UNSUPPORTED`）。
4. **119 行目：`typeToValue` に渡す**

   125 行目、結果に残す `typeNode` は null を外す前の元の型です。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/type_to_value.ts` L25–45 （▶ の行: 31–32, 35–36, 39, 41, 44）

```ts
25 │ export function typeToValue(
26 │   typeNode: ts.TypeNode | null,
27 │   checker: ts.TypeChecker,
28 │   isLocalCompilation: boolean,
29 │ ): TypeValueReference {
30 │   // It's not possible to get a value expression if the parameter doesn't even have a type.
31 ▶   if (typeNode === null) {
32 ▶     return missingType();
33 │   }
34 │ 
35 ▶   if (!ts.isTypeReferenceNode(typeNode)) {
36 ▶     return unsupportedType(typeNode);
37 │   }
38 │ 
39 ▶   const symbols = resolveTypeSymbols(typeNode, checker);
40 │   if (symbols === null) {
41 ▶     return unknownReference(typeNode);
42 │   }
43 │ 
44 ▶   const {local, decl} = symbols;
45 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/type_to_value.ts` L46–68 （▶ の行: 49, 57–58, 66）

```ts
46 │   // It's only valid to convert a type reference to a value reference if the type actually
47 │   // has a value declaration associated with it. Note that const enums are an exception,
48 │   // because while they do have a value declaration, they don't exist at runtime.
49 ▶   if (decl.valueDeclaration === undefined || decl.flags & ts.SymbolFlags.ConstEnum) {
50 │     let typeOnlyDecl: ts.Declaration | null = null;
51 │     if (decl.declarations !== undefined && decl.declarations.length > 0) {
52 │       typeOnlyDecl = decl.declarations[0];
53 │     }
54 │ 
55 │     // In local compilation mode a declaration is considered invalid only if it is a type related
56 │     // declaration.
57 ▶     if (
58 ▶       !isLocalCompilation ||
59 │       (typeOnlyDecl &&
60 │         [
61 │           ts.SyntaxKind.TypeParameter,
62 │           ts.SyntaxKind.TypeAliasDeclaration,
63 │           ts.SyntaxKind.InterfaceDeclaration,
64 │         ].includes(typeOnlyDecl.kind))
65 │     ) {
66 ▶       return noValueDeclaration(typeNode, typeOnlyDecl);
67 │     }
68 │   }
```

1. **31〜33 行目：型が書いてない → `MISSING_TYPE`**
2. **35〜37 行目：`Foo` の形（型の参照）でない → `UNSUPPORTED`**

   `string`・`Foo | Bar`・`Foo[]` などです。`@Inject(TOKEN) url: string` の `string` もここに来ますが、handler は `@Inject` の引数を優先するので困りません（[di-factory の章](../di/04-di-factory.md)の 2 節）。
3. **39〜42 行目：名前を記号（`ts.Symbol`）に解けない → `UNKNOWN_REFERENCE`**
4. **49 行目：値の宣言が無い → `NO_VALUE_DECLARATION`**

   interface や type の別名は型の世界にしか無く、実行時に値がありません。const enum も値の宣言はあるのに実行時には消えるので、ここで同じ扱いです。57〜65 行目、ローカルコンパイルのときだけは、型の宣言と確かに分かる場合（型引数・type・interface）に絞ります。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/type_to_value.ts` L73–111 （▶ の行: 75, 77, 81, 83, 90–91, 93, 95, 101, 103, 106, 109）

```ts
 73 │   // Look at the local `ts.Symbol`'s declarations and see if it comes from an import
 74 │   // statement. If so, extract the module specifier and the name of the imported type.
 75 ▶   const firstDecl = local.declarations && local.declarations[0];
 76 │   if (firstDecl !== undefined) {
 77 ▶     if (ts.isImportClause(firstDecl) && firstDecl.name !== undefined) {
 78 │       // This is a default import.
 79 │       //   import Foo from 'foo';
 80 │ 
 81 ▶       if (firstDecl.phaseModifier === ts.SyntaxKind.TypeKeyword) {
 82 │         // Type-only imports cannot be represented as value.
 83 ▶         return typeOnlyImport(typeNode, firstDecl);
 84 │       }
 85 │ 
 86 │       if (!ts.isImportDeclaration(firstDecl.parent)) {
 87 │         return unsupportedType(typeNode);
 88 │       }
 89 │ 
 90 ▶       return {
 91 ▶         kind: TypeValueReferenceKind.LOCAL,
 92 │         expression: firstDecl.name,
 93 ▶         defaultImportStatement: firstDecl.parent,
 94 │       };
 95 ▶     } else if (ts.isImportSpecifier(firstDecl)) {
 96 │       // The symbol was imported by name
 97 │       //   import {Foo} from 'foo';
 98 │       // or
 99 │       //   import {Foo as Bar} from 'foo';
100 │ 
101 ▶       if (firstDecl.isTypeOnly) {
102 │         // The import specifier can't be type-only (e.g. `import {type Foo} from '...')`.
103 ▶         return typeOnlyImport(typeNode, firstDecl);
104 │       }
105 │ 
106 ▶       if (firstDecl.parent.parent.phaseModifier === ts.SyntaxKind.TypeKeyword) {
107 │         // The import specifier can't be inside a type-only import clause
108 │         // (e.g. `import type {Foo} from '...')`.
109 ▶         return typeOnlyImport(typeNode, firstDecl.parent.parent);
110 │       }
111 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/type_to_value.ts` L112–132 （▶ の行: 114, 118, 125, 127, 129–130）

```ts
112 │       // Determine the name to import (`Foo`) from the import specifier, as the symbol names of
113 │       // the imported type could refer to a local alias (like `Bar` in the example above).
114 ▶       const importedName = (firstDecl.propertyName || firstDecl.name).text;
115 │ 
116 │       // The first symbol name refers to the local name, which is replaced by `importedName` above.
117 │       // Any remaining symbol names make up the complete path to the value.
118 ▶       const [_localName, ...nestedPath] = symbols.symbolNames;
119 │       const importDeclaration = firstDecl.parent.parent.parent;
120 │ 
121 │       if (!ts.isImportDeclaration(importDeclaration)) {
122 │         return unsupportedType(typeNode);
123 │       }
124 │ 
125 ▶       const moduleName = extractModuleName(importDeclaration);
126 │       return {
127 ▶         kind: TypeValueReferenceKind.IMPORTED,
128 │         valueDeclaration: decl.valueDeclaration ?? null,
129 ▶         moduleName,
130 ▶         importedName,
131 │         nestedPath,
132 │       };
```

値の宣言があるとき、75 行目で「この名前がこのファイルでどう宣言されたか」（`local` の記号の最初の宣言）を見ます。

- **77〜94 行目：default import**。81 行目、`import type Foo from …` なら `TYPE_ONLY_IMPORT`。そうでなければ 90〜94 行目で `LOCAL`（その名前をそのまま使う）とし、93 行目で import の文を覚えます（2 節の 227 行目）。
- **95〜131 行目：名前つきの import**。101 行目、`import {type Foo}` の `type` 修飾子なら `TYPE_ONLY_IMPORT`。106 行目、`import type {Foo}` の文全体の `type` でも `TYPE_ONLY_IMPORT`。そうでなければ 114 行目で**export 側の名前**（`import {Foo as Bar}` の `Foo`）を取り、127〜131 行目で `IMPORTED` にします。
- 名前空間の import（`import * as ns`）の枝も同じ規則です（引用の外）。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/type_to_value.ts` L166–179 （▶ の行: 169, 171–172, 177）

```ts
166 │   }
167 │ 
168 │   // If the type is not imported, the type reference can be converted into an expression as is.
169 ▶   const expression = typeNodeToValueExpr(typeNode);
170 │   if (expression !== null) {
171 ▶     return {
172 ▶       kind: TypeValueReferenceKind.LOCAL,
173 │       expression,
174 │       defaultImportStatement: null,
175 │     };
176 │   } else {
177 ▶     return unsupportedType(typeNode);
178 │   }
179 │ }
```

import でなければ（同じファイルで宣言したクラスなど）、169 行目で型の名前をそのまま式に写して `LOCAL` にします。

> [!NOTE]
> **ポイント**
>
> **`import type` だと注入できない理由**は、81・101・106 行目の 3 つの判定です。型だけの import は TypeScript が出力から消すので、`ɵfac` に `ɵɵdirectiveInject(Greeter)` と書いても、実行時に `Greeter` という値が存在しません。だから `TYPE_ONLY_IMPORT` を返し、handler（`annotations/common/src/di.ts`）がそれを「Consider changing the type-only import to a regular import, or use the @Inject decorator…」の診断にします（[di-factory の章](../di/04-di-factory.md)の 5 節）。interface が注入できないのは 49 行目の `NO_VALUE_DECLARATION` です。

## 4. TypeScriptReflectionHost：デコレーターとメンバー

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L33–43 （▶ の行: 35–37, 40–42）

```ts
33 │ export class TypeScriptReflectionHost implements ReflectionHost {
34 │   /**
35 ▶    * @param skipPrivateValueDeclarationTypes Avoids using a value declaration that is considered private (using a ɵ-prefix),
36 ▶    * instead using the first available declaration. This is needed for the {@link FormControl} API of
37 ▶    * which the type declaration documents the type and the value declaration corresponds with an implementation detail.
38 │    */
39 │   constructor(
40 ▶     protected checker: ts.TypeChecker,
41 ▶     private readonly isLocalCompilation = false,
42 ▶     private readonly skipPrivateValueDeclarationTypes = false,
43 │   ) {}
```

実装が持つのは TypeScript の型チェッカー（40 行目）だけです。41 行目のローカルコンパイルの印は 3 節の 57〜65 行目に、42 行目の印は 35〜37 行目のとおり `ɵ` で始まる非公開の値の宣言を避けたいとき（`FormControl` の型）に使います。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L45–71 （▶ の行: 46–47, 50, 52–54, 58, 61, 67, 70）

```ts
45 │   getDecoratorsOfDeclaration(declaration: DeclarationNode): Decorator[] | null {
46 ▶     const decorators = ts.canHaveDecorators(declaration)
47 ▶       ? ts.getDecorators(declaration)
48 │       : undefined;
49 │ 
50 ▶     return decorators !== undefined && decorators.length
51 │       ? decorators
52 ▶           .map((decorator) => this._reflectDecorator(decorator))
53 ▶           .filter((dec): dec is Decorator => dec !== null)
54 ▶       : null;
55 │   }
56 │ 
57 │   getMembersOfClass(clazz: ClassDeclaration): ClassMember[] {
58 ▶     const tsClazz = castDeclarationToClassOrDie(clazz);
59 │     return tsClazz.members
60 │       .map((member) => {
61 ▶         const result = reflectClassMember(member);
62 │         if (result === null) {
63 │           return null;
64 │         }
65 │         return {
66 │           ...result,
67 ▶           decorators: this.getDecoratorsOfDeclaration(member),
68 │         };
69 │       })
70 ▶       .filter((member): member is NonNullable<typeof member> => member !== null);
71 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L427–456 （▶ の行: 435–437, 442–443, 446–447）

```ts
427 │   private _reflectDecorator(node: ts.Decorator): Decorator | null {
428 │     // Attempt to resolve the decorator expression into a reference to a concrete Identifier. The
429 │     // expression may contain a call to a function which returns the decorator function, in which
430 │     // case we want to return the arguments.
431 │     let decoratorExpr: ts.Expression = node.expression;
432 │     let args: ts.Expression[] | null = null;
433 │ 
434 │     // Check for call expressions.
435 ▶     if (ts.isCallExpression(decoratorExpr)) {
436 ▶       args = Array.from(decoratorExpr.arguments);
437 ▶       decoratorExpr = decoratorExpr.expression;
438 │     }
439 │ 
440 │     // The final resolved decorator should be a `ts.Identifier` - if it's not, then something is
441 │     // wrong and the decorator can't be resolved statically.
442 ▶     if (!isDecoratorIdentifier(decoratorExpr)) {
443 ▶       return null;
444 │     }
445 │ 
446 ▶     const decoratorIdentifier = ts.isIdentifier(decoratorExpr) ? decoratorExpr : decoratorExpr.name;
447 ▶     const importDecl = this.getImportOfIdentifier(decoratorIdentifier);
448 │ 
449 │     return {
450 │       name: decoratorIdentifier.text,
451 │       identifier: decoratorExpr,
452 │       import: importDecl,
453 │       node,
454 │       args,
455 │     };
456 │   }
```

1. **46〜47 行目：TypeScript の `ts.getDecorators` で AST のデコレーターを取る**

   デコレーターの無いクラスは 54 行目で `null`（空の配列ではない）です。
2. **435〜438 行目：`@Foo(…)` なら引数を取り、呼ばれている側の式に進む**

   `@Foo`（呼ばない形）なら `args` は `null` のままです。
3. **442〜444 行目：`Foo` か `ns.Foo` の形でなければ捨てる**

   `@decorators[0]` のような式は読みません。53 行目の `filter` で配列から外れます。
4. **446〜447 行目：名前の部分（`ns.Foo` なら `Foo`）の import を調べる**

   中身は 5 節の `getImportOfIdentifier` です。
5. **58〜70 行目：メンバーごとに `reflectClassMember` し、デコレーターを足す**

   61 行目で形を読み、67 行目でメンバーのデコレーター（`@Input()` など）を同じ関数で読みます。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L689–725 （▶ の行: 695, 698, 700, 702, 704, 706–707, 711–712, 715, 718, 722, 725）

```ts
689 │ export function reflectClassMember(node: ts.ClassElement): Omit<ClassMember, 'decorators'> | null {
690 │   let kind: ClassMemberKind | null = null;
691 │   let value: ts.Expression | null = null;
692 │   let name: string | null = null;
693 │   let nameNode: ts.Identifier | ts.PrivateIdentifier | ts.StringLiteral | null = null;
694 │ 
695 ▶   if (ts.isPropertyDeclaration(node)) {
696 │     kind = ClassMemberKind.Property;
697 │     value = node.initializer || null;
698 ▶   } else if (ts.isGetAccessorDeclaration(node)) {
699 │     kind = ClassMemberKind.Getter;
700 ▶   } else if (ts.isSetAccessorDeclaration(node)) {
701 │     kind = ClassMemberKind.Setter;
702 ▶   } else if (ts.isMethodDeclaration(node)) {
703 │     kind = ClassMemberKind.Method;
704 ▶   } else if (ts.isConstructorDeclaration(node)) {
705 │     kind = ClassMemberKind.Constructor;
706 ▶   } else {
707 ▶     return null;
708 │   }
709 │ 
710 │   if (ts.isConstructorDeclaration(node)) {
711 ▶     name = 'constructor';
712 ▶   } else if (ts.isIdentifier(node.name)) {
713 │     name = node.name.text;
714 │     nameNode = node.name;
715 ▶   } else if (ts.isStringLiteral(node.name)) {
716 │     name = node.name.text;
717 │     nameNode = node.name;
718 ▶   } else if (ts.isPrivateIdentifier(node.name)) {
719 │     name = node.name.text;
720 │     nameNode = node.name;
721 │   } else {
722 ▶     return null;
723 │   }
724 │ 
725 ▶   const {accessLevel, isStatic} = extractModifiersOfMember(node);
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L648–680 （▶ の行: 656, 659, 662, 665, 672–673, 675–676）

```ts
648 │   const modifiers = ts.getModifiers(node);
649 │   let isStatic = false;
650 │   let isReadonly = false;
651 │   let accessLevel = ClassMemberAccessLevel.PublicWritable;
652 │ 
653 │   if (modifiers !== undefined) {
654 │     for (const modifier of modifiers) {
655 │       switch (modifier.kind) {
656 ▶         case ts.SyntaxKind.StaticKeyword:
657 │           isStatic = true;
658 │           break;
659 ▶         case ts.SyntaxKind.PrivateKeyword:
660 │           accessLevel = ClassMemberAccessLevel.Private;
661 │           break;
662 ▶         case ts.SyntaxKind.ProtectedKeyword:
663 │           accessLevel = ClassMemberAccessLevel.Protected;
664 │           break;
665 ▶         case ts.SyntaxKind.ReadonlyKeyword:
666 │           isReadonly = true;
667 │           break;
668 │       }
669 │     }
670 │   }
671 │ 
672 ▶   if (isReadonly && accessLevel === ClassMemberAccessLevel.PublicWritable) {
673 ▶     accessLevel = ClassMemberAccessLevel.PublicReadonly;
674 │   }
675 ▶   if (node.name !== undefined && ts.isPrivateIdentifier(node.name)) {
676 ▶     accessLevel = ClassMemberAccessLevel.EcmaScriptPrivate;
677 │   }
678 │ 
679 │   return {accessLevel, isStatic};
680 │ }
```

695〜705 行目で 5 つの種類に振り分け、どれでもない要素（index signature や `static { … }` のブロック）は 706〜707 行目で `null` にして捨てます。名前は 711 行目（`constructor`）・712 行目（ふつうの名前）・715 行目（`'quoted-name'` のような文字列）・718 行目（`#name`）の 4 通りで、`[key]` のような計算された名前は 722 行目で捨てます。見える範囲は修飾子から決めます。672〜674 行目のとおり `readonly` が `PublicReadonly` になるのは public のときだけで、`protected readonly` は `Protected` です。675〜677 行目、`#name` は修飾子に関係なく `EcmaScriptPrivate` です。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L168–196 （▶ の行: 171, 185–186, 191, 195）

```ts
168 │   isClass(node: ts.Node): node is ClassDeclaration {
169 │     // For our purposes, classes are "named" ts.ClassDeclarations;
170 │     // (`node.name` can be undefined in unnamed default exports: `default export class { ... }`).
171 ▶     return isNamedClassDeclaration(node);
172 │   }
173 │ 
174 │   hasBaseClass(clazz: ClassDeclaration): boolean {
175 │     return this.getBaseClassExpression(clazz) !== null;
176 │   }
177 │ 
178 │   getBaseClassExpression(clazz: ClassDeclaration): ts.Expression | null {
179 │     if (
180 │       !(ts.isClassDeclaration(clazz) || ts.isClassExpression(clazz)) ||
181 │       clazz.heritageClauses === undefined
182 │     ) {
183 │       return null;
184 │     }
185 ▶     const extendsClause = clazz.heritageClauses.find(
186 ▶       (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
187 │     );
188 │     if (extendsClause === undefined) {
189 │       return null;
190 │     }
191 ▶     const extendsType = extendsClause.types[0];
192 │     if (extendsType === undefined) {
193 │       return null;
194 │     }
195 ▶     return extendsType.expression;
196 │   }
```

171 行目、`isClass` は「名前のある `class` 宣言」だけを true にします（`export default class {}` は名前が無いので false）。`getBaseClassExpression` は 185〜186 行目で `extends` の節を探し、195 行目でその式を返します。式なので、`extends mixin(Base)` のように関数の呼び出しが返ることもあります。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L748–764 （▶ の行: 751–752, 756–760）

```ts
748 │ export function reflectObjectLiteral(node: ts.ObjectLiteralExpression): Map<string, ts.Expression> {
749 │   const map = new Map<string, ts.Expression>();
750 │   node.properties.forEach((prop) => {
751 ▶     if (ts.isPropertyAssignment(prop)) {
752 ▶       const name = propertyNameToString(prop.name);
753 │       if (name === null) {
754 │         return;
755 │       }
756 ▶       map.set(name, prop.initializer);
757 ▶     } else if (ts.isShorthandPropertyAssignment(prop)) {
758 ▶       map.set(prop.name.text, prop.name);
759 ▶     } else {
760 ▶       return;
761 │     }
762 │   });
763 │   return map;
764 │ }
```

`reflectObjectLiteral` は、`@Component({ selector: …, template: … })` の引数のオブジェクトを「キー → 値の式」の Map にする小さな関数です。751〜756 行目の `key: value` と、757〜758 行目の `{ template }`（省略形）だけを拾い、**それ以外（`...spread` やメソッドの形）は 759〜760 行目で黙って飛ばします**。handler は値の式を `PartialEvaluator` に渡して値にします。

## 5. 識別子から import と宣言をたどる

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L131–142 （▶ の行: 132, 135–138）

```ts
131 │   getImportOfIdentifier(id: ts.Identifier): Import | null {
132 ▶     const directImport = this.getDirectImportOfIdentifier(id);
133 │     if (directImport !== null) {
134 │       return directImport;
135 ▶     } else if (ts.isQualifiedName(id.parent) && id.parent.right === id) {
136 ▶       return this.getImportOfNamespacedIdentifier(id, getQualifiedNameRoot(id.parent));
137 ▶     } else if (ts.isPropertyAccessExpression(id.parent) && id.parent.name === id) {
138 ▶       return this.getImportOfNamespacedIdentifier(id, getFarLeftIdentifier(id.parent));
139 │     } else {
140 │       return null;
141 │     }
142 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L285–315 （▶ の行: 286, 291, 297, 300–301, 311–312）

```ts
285 │   protected getDirectImportOfIdentifier(id: ts.Identifier): Import | null {
286 ▶     const symbol = this.checker.getSymbolAtLocation(id);
287 │ 
288 │     if (
289 │       symbol === undefined ||
290 │       symbol.declarations === undefined ||
291 ▶       symbol.declarations.length !== 1
292 │     ) {
293 │       return null;
294 │     }
295 │ 
296 │     const decl = symbol.declarations[0];
297 ▶     const importDecl = getContainingImportDeclaration(decl);
298 │ 
299 │     // Ignore declarations that are defined locally (not imported).
300 ▶     if (importDecl === null) {
301 ▶       return null;
302 │     }
303 │ 
304 │     // The module specifier is guaranteed to be a string literal, so this should always pass.
305 │     if (!ts.isStringLiteral(importDecl.moduleSpecifier)) {
306 │       // Not allowed to happen in TypeScript ASTs.
307 │       return null;
308 │     }
309 │ 
310 │     return {
311 ▶       from: importDecl.moduleSpecifier.text,
312 ▶       name: getExportedName(decl, id),
313 │       node: importDecl,
314 │     };
315 │   }
```

`getImportOfIdentifier` は、132 行目でまず「その名前が直接 import されたか」を見ます。297 行目で記号の宣言を親へたどって `import` の文を探し、300〜302 行目、同じファイルで宣言した名前なら `null` です。312 行目の `getExportedName` は `import {Foo as Bar}` の `Foo` の方を返すので、2 節の `Import.name` は export 側の名前になります。直接でなければ、135〜138 行目で `core.Directive` のような名前空間つきの形を左端の名前からたどります。

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L198–205 （▶ の行: 200, 204）

```ts
198 │   getDeclarationOfIdentifier(id: ts.Identifier): Declaration | null {
199 │     // Resolve the identifier to a Symbol, and return the declaration of that.
200 ▶     let symbol: ts.Symbol | undefined = this.checker.getSymbolAtLocation(id);
201 │     if (symbol === undefined) {
202 │       return null;
203 │     }
204 ▶     return this.getDeclarationOfSymbol(symbol, id);
205 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L400–425 （▶ の行: 400, 403–404, 410, 414–415, 419）

```ts
400 ▶     const importInfo = originalId && this.getImportOfIdentifier(originalId);
401 │ 
402 │     // Now, resolve the Symbol to its declaration by following any and all aliases.
403 ▶     while (symbol.flags & ts.SymbolFlags.Alias) {
404 ▶       symbol = this.checker.getAliasedSymbol(symbol);
405 │     }
406 │ 
407 │     // Look at the resolved Symbol's declarations and pick one of them to return.
408 │     // Value declarations are given precedence over type declarations if not specified otherwise
409 │     if (
410 ▶       symbol.valueDeclaration !== undefined &&
411 │       (!this.skipPrivateValueDeclarationTypes || !isPrivateSymbol(this.checker, symbol))
412 │     ) {
413 │       return {
414 ▶         node: symbol.valueDeclaration,
415 ▶         viaModule: this._viaModule(symbol.valueDeclaration, originalId, importInfo),
416 │       };
417 │     } else if (symbol.declarations !== undefined && symbol.declarations.length > 0) {
418 │       return {
419 ▶         node: symbol.declarations[0],
420 │         viaModule: this._viaModule(symbol.declarations[0], originalId, importInfo),
421 │       };
422 │     } else {
423 │       return null;
424 │     }
425 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/src/typescript.ts` L510–526 （▶ の行: 516–518, 520, 523–524）

```ts
510 │   private _viaModule(
511 │     declaration: ts.Declaration,
512 │     originalId: ts.Identifier | null,
513 │     importInfo: Import | null,
514 │   ): string | AmbientImport | null {
515 │     if (
516 ▶       importInfo === null &&
517 ▶       originalId !== null &&
518 ▶       declaration.getSourceFile() !== originalId.getSourceFile()
519 │     ) {
520 ▶       return AmbientImport;
521 │     }
522 │ 
523 ▶     return importInfo !== null && importInfo.from !== null && !importInfo.from.startsWith('.')
524 ▶       ? importInfo.from
525 │       : null;
526 │   }
```

`getDeclarationOfIdentifier` は型チェッカーで記号を取り（200 行目）、400 行目で import の情報を先に取ってから、403〜405 行目で別名（import・再 export）を本体までほどきます。`viaModule` は 523〜525 行目、import の `from` が `.` で始まらない（＝絶対のモジュール名）ときだけその名前、相対パスなら `null` です。516〜520 行目は、import が無いのに別のファイルの宣言に解けた場合（グローバルな型など）で、`AmbientImport` という印を返します。

## 6. DEMO：本物の TypeScriptReflectionHost にクラスを読ませる

> **🧪 DEMO — getDecoratorsOfDeclaration・getMembersOfClass・getConstructorParameters（記録の再生）**
>
> これは記録です。@angular/compiler-cli 22.1.6 を Node で動かした結果です（@angular/compiler-cli 22.1.6 / TypeScript 6.0.3）。`@angular/compiler-cli/private/migrations` が export している本物の `TypeScriptReflectionHost` を `new TypeScriptReflectionHost(program.getTypeChecker())` で作り、場面ごとのクラスを読ませました。種類の名前（`Property`・`IMPORTED` など）は、数で返る enum を host.ts の並びで名前に戻したものです。
>
> 場面のボタンを押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-reflection)

記録から読み取れることです。

1. **デコレーター付き：`@core.Output()` も `Output` from `@angular/core` になる**

   名前空間の import でも、5 節の 137〜138 行目の道で `import.name` が `Output`、`from` が `@angular/core` になります。`@Component` の宣言は `@angular/core` の .d.ts の中の変数の宣言で、`viaModule` は `@angular/core` です。`reflectObjectLiteral` の値は式の文字列のままで、`host` も `{class: 'card'}` という式です。
2. **コンストラクタの引数：4 つの戻り方**

   `Greeter` は `IMPORTED`（`./services` の `Greeter`）。`Logger | null` も 105〜117 行目で null が外れて `IMPORTED`。`string` は `UNSUPPORTED` ですが `@Inject(API_URL)` が付いています。default import の `Store` は `LOCAL` で、import の文が覚えられています（90〜94 行目）。
3. **値に戻せない引数：理由が 4 種類**

   `import type`（106 行目）と `{type Logger}`（101 行目）は `TYPE_ONLY_IMPORT`、interface の `Config` は `NO_VALUE_DECLARATION`（49 行目）、`G2 | L2` は `UNSUPPORTED`（35 行目）、型の無い `e` は `MISSING_TYPE`（31 行目）です。`@Injectable()` のクラスでこれを ngc に通すと、`strictInjectionParameters` によってエラーか `ɵɵinvalidFactory` になります（[di-injectable-compile の章](../di/05-di-injectable-compile.md)）。
4. **メンバー：getter と setter は 2 つの別のメンバー**

   同じ名前 `label` が `Getter`（型 `string`）と `Setter` の 2 行になります。`protected readonly id` は `Protected`（672 行目）、`#hidden` は `EcmaScriptPrivate`、`'quoted-name'` は文字列の名前（715 行目）です。コンストラクタもメンバーの 1 つとして出てきます。引数の無いコンストラクタなので、`getConstructorParameters` は `null` ではなく `[]` です。

📄 `scratchpad の記録スクリプト（reflection.mjs、angular-deep-dive を cwd にして node で実行）`

```
// ngtsc-reflection の記録: 本物の TypeScriptReflectionHost に、いくつかのクラスを読ませる。
// 使い方: cd angular-deep-dive && node <このファイル> > reflection.json
import {mkdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const req = createRequire(join(process.cwd(), 'package.json'));
const load = (id) => import(pathToFileURL(req.resolve(id)).href);
const {TypeScriptReflectionHost, reflectObjectLiteral} = await load(
  '@angular/compiler-cli/private/migrations',
);
const {VERSION} = await load('@angular/compiler-cli');
const ts = (await load('typescript')).default;

// reflection/src/host.ts の enum の並び（JS では数になる）
const MEMBER_KIND = ['Constructor', 'Getter', 'Setter', 'Property', 'Method']; // 86-92 行目
const ACCESS = ['PublicWritable', 'PublicReadonly', 'Protected', 'Private', 'EcmaScriptPrivate']; // 95-101 行目
const TVR_KIND = ['LOCAL', 'IMPORTED', 'UNAVAILABLE']; // 204-208 行目
const UNAVAILABLE = ['MISSING_TYPE', 'NO_VALUE_DECLARATION', 'TYPE_ONLY_IMPORT', 'UNKNOWN_REFERENCE', 'NAMESPACE', 'UNSUPPORTED']; // 275-306 行目

const tmp = join(dirname(fileURLToPath(import.meta.url)), 'tmp-reflection');
rmSync(tmp, {recursive: true, force: true});
mkdirSync(join(tmp, 'src'), {recursive: true});
symlinkSync(join(process.cwd(), 'node_modules'), join(tmp, 'node_modules'), 'dir');

const shared = {
  'src/services.ts': `import {InjectionToken} from '@angular/core';
export class Greeter {}
export class Logger {}
export interface Config { debug: boolean; }
export const API_URL = new InjectionToken<string>('API_URL');
export default class Store {}
`,
};
const scenes = [
  {
    id: 'decorated',
    title: 'デコレーター付きのクラス',
    className: 'Card',
    code: `import {Component, Input, HostListener} from '@angular/core';
import * as core from '@angular/core';

@Component({selector: 'app-card', template: '<ng-content />', host: {class: 'card'}})
export class Card {
  @Input() title = '';
  @core.Output() closed = new core.EventEmitter<void>();

  @HostListener('click', ['$event'])
  onClick(e: MouseEvent) {}
}
`,
  },
  {
    id: 'ctor',
    title: 'コンストラクタの引数（ふつうの import・default import・@Inject・null との union）',
    className: 'Panel',
    code: `import {Directive, Inject, Optional} from '@angular/core';
import {Greeter, Logger, API_URL} from './services';
import Store from './services';

@Directive({selector: '[appPanel]'})
export class Panel {
  constructor(
    private greeter: Greeter,
    @Optional() logger: Logger | null,
    @Inject(API_URL) url: string,
    store: Store,
  ) {}
}
`,
  },
  {
    id: 'typeonly',
    title: '値に戻せない引数（import type・type 修飾子・interface・Greeter | Logger）',
    className: 'Broken',
    code: `import {Injectable} from '@angular/core';
import type {Greeter} from './services';
import {type Logger, Config, Greeter as G2, Logger as L2} from './services';

@Injectable()
export class Broken {
  constructor(a: Greeter, b: Logger, c: Config, d: G2 | L2, e) {}
}
`,
  },
  {
    id: 'members',
    title: 'getter・setter・static・private・#private・extends',
    className: 'Child',
    code: `class Base {}

export class Child extends Base {
  static count = 0;
  static create() { return new Child(); }
  protected readonly id = 1;
  private secret = 'x';
  #hidden = true;
  'quoted-name' = 2;
  get label(): string { return 'a'; }
  set label(v: string) {}
  constructor() { super(); }
}
`,
  },
];

for (const [name, text] of Object.entries(shared)) writeFileSync(join(tmp, name), text);
for (const s of scenes) writeFileSync(join(tmp, `src/${s.id}.ts`), s.code);

const options = {
  strict: false,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  experimentalDecorators: true,
  skipLibCheck: true,
  noEmit: true,
};
const program = ts.createProgram(
  scenes.map((s) => join(tmp, `src/${s.id}.ts`)),
  options,
);
const checker = program.getTypeChecker();
const host = new TypeScriptReflectionHost(checker);

const text = (node) => (node ? node.getText() : null);
const decoratorRow = (d) => {
  const identifierName = ts.isIdentifier(d.identifier) ? d.identifier : d.identifier.name;
  const decl = host.getDeclarationOfIdentifier(identifierName);
  return {
    name: d.name,
    identifier: d.identifier.getText(),
    import: d.import && {name: d.import.name, from: d.import.from},
    args: d.args && d.args.map((a) => a.getText()),
    declaration: decl && {
      file: decl.node.getSourceFile().fileName.replace(/.*node_modules\//, 'node_modules/'),
      kind: ts.SyntaxKind[decl.node.kind],
      viaModule: typeof decl.viaModule === 'string' || decl.viaModule === null ? decl.viaModule : 'AmbientImport',
    },
  };
};

const results = scenes.map((s) => {
  const sf = program.getSourceFile(join(tmp, `src/${s.id}.ts`));
  const clazz = sf.statements.find((st) => ts.isClassDeclaration(st) && st.name?.text === s.className);
  const decorators = host.getDecoratorsOfDeclaration(clazz);
  const firstArg = decorators?.[0]?.args?.[0];
  return {
    ...s,
    isClass: host.isClass(clazz),
    baseClass: text(host.getBaseClassExpression(clazz)),
    decorators: decorators && decorators.map(decoratorRow),
    // デコレーターの第 1 引数がオブジェクトリテラルなら reflectObjectLiteral に通す
    firstArgProperties:
      firstArg && ts.isObjectLiteralExpression(firstArg)
        ? [...reflectObjectLiteral(firstArg)].map(([k, v]) => ({key: k, value: v.getText()}))
        : null,
    members: host.getMembersOfClass(clazz).map((m) => ({
      name: m.name,
      kind: MEMBER_KIND[m.kind],
      accessLevel: ACCESS[m.accessLevel],
      isStatic: m.isStatic,
      type: text(m.type),
      value: text(m.value),
      decorators:
        m.decorators &&
        m.decorators.map((d) => ({
          name: d.name,
          identifier: d.identifier.getText(),
          import: d.import && {name: d.import.name, from: d.import.from},
          args: d.args && d.args.map((a) => a.getText()),
        })),
    })),
    // コンストラクタが無いクラスは null（JSON に残すため ?. ではなく明示する）
    ctorParameters: ((params) => params === null ? null : params.map((p) => {
      const r = p.typeValueReference;
      const ref = {kind: TVR_KIND[r.kind]};
      if (r.kind === 0) {
        // typeToValue が作った式（合成されたノード）なので、getText ではなく printer で文字列にする
        ref.expression = ts.createPrinter().printNode(ts.EmitHint.Expression, r.expression, r.expression.getSourceFile?.() ?? undefined);
        ref.defaultImport = r.defaultImportStatement ? r.defaultImportStatement.getText() : null;
      } else if (r.kind === 1) {
        Object.assign(ref, {moduleName: r.moduleName, importedName: r.importedName, nestedPath: r.nestedPath});
      } else {
        ref.reason = UNAVAILABLE[r.reason.kind];
      }
      return {
        name: p.name,
        typeNode: text(p.typeNode),
        typeValueReference: ref,
        decorators: p.decorators && p.decorators.map((d) => ({name: d.name, args: d.args?.map((a) => a.getText()) ?? null})),
      };
    }))(host.getConstructorParameters(clazz)),
  };
});

console.log(
  JSON.stringify({compilerCli: VERSION.full, typescript: ts.version, shared, scenes: results}, null, 2),
);
rmSync(tmp, {recursive: true, force: true});

```

## ここまでの呼び出し

- `new TypeScriptReflectionHost(checker, isLocal)` — core/src/compiler.ts（makeCompilation） — *第 3 回*
- 👤 `handler.detect(node, reflector.getDecoratorsOfDeclaration(node))` — transform/（TraitCompiler） — *第 7 回*
  - `_reflectDecorator(decorator)` — reflection/src/typescript.ts 427
    - `getImportOfIdentifier(id)` → `getDirectImportOfIdentifier(id)` — typescript.ts 131・285
- 👤 `getConstructorDependencies(clazz, reflector, …)` — annotations/common/src/di.ts — *di-factory の章*
  - `reflector.getConstructorParameters(clazz)` — typescript.ts 73
    - `typeToValue(typeNode, checker, isLocal)` — type\_to\_value.ts 25 — *LOCAL・IMPORTED・UNAVAILABLE（6 つの理由）*
- 👤 `reflector.getMembersOfClass(clazz)` — typescript.ts 57 — *@Input・@HostListener などを handler が探す*
  - `reflectClassMember(member)` ＋ `extractModifiersOfMember` — typescript.ts 689

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| src/ngtsc/reflection/test/ts\_host\_spec.ts | describe `reflector`（32 行目）の中の `getConstructorParameters()`（37 行目、it 9 件）・`getImportOfIdentifier()`（283）・`getDeclarationOfIdentifier()`（351）・`getExportsOfModule()`（474）・`getMembersOfClass()`（538、it 5 件） | `//packages/compiler-cli/src/ngtsc/reflection/test:test` |
| test/ngtsc/ngtsc\_spec.ts | describe `compiling invalid @Injectables`（3755 行目）の中の it `should report an error when using a symbol from a type-only import clause as injection token`（3807）・`… type-only import specifier …`（3843） | `//packages/compiler-cli/test/ngtsc:ngtsc` |

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/test/ts_host_spec.ts` L37–57 （▶ の行: 39, 51, 53–54, 56）

```ts
37 │     describe('getConstructorParameters()', () => {
38 │       it('should reflect a single argument', () => {
39 ▶         const {program} = makeProgram([
40 │           {
41 │             name: _('/entry.ts'),
42 │             contents: `
43 │             class Bar {}
44 │ 
45 │             class Foo {
46 │               constructor(bar: Bar) {}
47 │             }
48 │         `,
49 │           },
50 │         ]);
51 ▶         const clazz = getDeclaration(program, _('/entry.ts'), 'Foo', isNamedClassDeclaration);
52 │         const checker = program.getTypeChecker();
53 ▶         const host = new TypeScriptReflectionHost(checker);
54 ▶         const args = host.getConstructorParameters(clazz)!;
55 │         expect(args.length).toBe(1);
56 ▶         expectParameter(args[0], 'bar', 'Bar');
57 │       });
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/test/ts_host_spec.ts` L218–229 （▶ の行: 220, 223–224, 228）

```ts
218 │         const clazz = getDeclaration(program, _('/entry.ts'), 'Foo', isNamedClassDeclaration);
219 │         const checker = program.getTypeChecker();
220 ▶         const host = new TypeScriptReflectionHost(checker);
221 │         const args = host.getConstructorParameters(clazz)!;
222 │         expect(args.length).toBe(1);
223 ▶         const param = args[0].typeValueReference;
224 ▶         if (param === null || param.kind !== TypeValueReferenceKind.LOCAL) {
225 │           return fail('Expected local parameter');
226 │         }
227 │         expect(param).not.toBeNull();
228 ▶         expect(param.defaultImportStatement).not.toBeNull();
229 │       });
```

📄 `angular/packages/compiler-cli/src/ngtsc/reflection/test/ts_host_spec.ts` L638–662 （▶ の行: 646–647, 649–650, 653, 658）

```ts
638 │   function expectParameter(
639 │     param: CtorParameter,
640 │     name: string,
641 │     type?: string | {name: string; moduleName: string},
642 │     decorator?: string,
643 │     decoratorFrom?: string,
644 │   ): void {
645 │     expect(param.name!).toEqual(name);
646 ▶     if (type === undefined) {
647 ▶       expect(param.typeValueReference).toBeNull();
648 │     } else {
649 ▶       if (param.typeValueReference.kind === TypeValueReferenceKind.UNAVAILABLE) {
650 ▶         return fail(`Expected parameter ${name} to have a typeValueReference`);
651 │       }
652 │       if (
653 ▶         param.typeValueReference.kind === TypeValueReferenceKind.LOCAL &&
654 │         typeof type === 'string'
655 │       ) {
656 │         expect(argExpressionToString(param.typeValueReference.expression)).toEqual(type);
657 │       } else if (
658 ▶         param.typeValueReference.kind === TypeValueReferenceKind.IMPORTED &&
659 │         typeof type !== 'string'
660 │       ) {
661 │         expect(param.typeValueReference.moduleName).toEqual(type.moduleName);
662 │         expect(param.typeValueReference.importedName).toEqual(type.name);
```

単体テストの形は、39 行目で `makeProgram`（テスト用の `ts.Program` を作る関数）、53 行目でデモと同じ `new TypeScriptReflectionHost(checker)`、54 行目で呼んで 56 行目の `expectParameter` で確かめる、の 4 段です。default import の it は 224 行目で `LOCAL` を、228 行目で 2 節の `defaultImportStatement` が入っていることを見ます。なお 646〜647 行目、`expectParameter` に型を渡さないと「`typeValueReference` が `null`」を期待しますが、いまの `typeToValue` は `null` を返さず必ず 3 つのどれかを返します（3 節）。この枝を通る呼び出しは spec の中に無く、**`UNAVAILABLE` の 6 つの理由を確かめる単体テストもありません**（grep で確かめました）。その確かめは結合テストの側にあります。

📄 `angular/packages/compiler-cli/test/ngtsc/ngtsc_spec.ts` L3807–3841 （▶ の行: 3808, 3819, 3823, 3828–3829, 3831, 3835, 3839）

```ts
3807 │         it('should report an error when using a symbol from a type-only import clause as injection token', () => {
3808 ▶           env.tsconfig({strictInjectionParameters: true});
3809 │           env.write(
3810 │             `types.ts`,
3811 │             `
3812 │               export class TypeOnly {}
3813 │             `,
3814 │           );
3815 │           env.write(
3816 │             `test.ts`,
3817 │             `
3818 │               import {Injectable} from '@angular/core';
3819 ▶               import type {TypeOnly} from './types';
3820 │ 
3821 │               @Injectable()
3822 │               export class MyService {
3823 ▶                 constructor(param: TypeOnly) {}
3824 │               }
3825 │             `,
3826 │           );
3827 │ 
3828 ▶           const diags = env.driveDiagnostics();
3829 ▶           expect(diags.length).toBe(1);
3830 │           expect(ts.flattenDiagnosticMessageText(diags[0].messageText, '\n')).toMatch(
3831 ▶             /No suitable injection token for parameter 'param' of class 'MyService'\. Find more at .*\n  Consider changing the type-only import to a regular import, or use the @Inject decorator to specify an injection token\./,
3832 │           );
3833 │           expect(diags[0].relatedInformation!.length).toBe(2);
3834 │           expect(diags[0].relatedInformation![0].messageText).toBe(
3835 ▶             'This type is imported using a type-only import, ' +
3836 │               'which prevents it from being usable as an injection token.',
3837 │           );
3838 │           expect(diags[0].relatedInformation![1].messageText).toBe(
3839 ▶             'The type-only import occurs here.',
3840 │           );
3841 │         });
```

3819 行目の `import type` を 3823 行目で注入に使い、3808 行目の `strictInjectionParameters: true` のもとで 3829 行目の診断 1 件、3831 行目の文言、3835〜3839 行目の関連情報 2 つを確かめます。3 節の 106 行目の `TYPE_ONLY_IMPORT` が、ここまで届いた形です。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/reflection/test:test --nocache_test_results --test_output=all
pnpm bazel test //packages/compiler-cli/src/ngtsc/reflection/test:test '--test_arg=--filter=getConstructorParameters' --nocache_test_results --test_output=all
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc '--test_arg=--filter=from a type-only import (clause|specifier) as injection token' --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/ngtsc-logs/a-units.log・a-reflection-ctor.log・a-ngtsc-typeonly2.log）`

```
//packages/compiler-cli/src/ngtsc/reflection/test:test   84 specs, 0 failures   PASSED in 0.5s
getConstructorParameters: Ran 36 of 84 specs / 36 specs, 0 failures   Elapsed 0.516s

type-only import（4 つの shard）
Ran 1 of 6747 specs / Ran 2 of 6748 specs / Ran 3 of 6749 specs / Ran 2 of 6748 specs
INFO: Elapsed time: 2.719s
//packages/compiler-cli/test/ngtsc:ngtsc   PASSED in 2.2s
```

- reflection の 84 件は it 21 件 × 4 つのファイルシステム、`getConstructorParameters` で絞ると it 9 件 × 4 = 36 件です。
- type-only の 2 件の it は、4 つの shard の `Ran` の合計が 1 + 2 + 3 + 2 = 8 件（2 件 × 4 つのファイルシステム）でした。フィルタは正規表現なので、`(clause|specifier)` の形で 2 つを 1 回で選べます。単に `type-only import` で絞ると、ほかの spec の it も混ざって 32 件になりました（a-ngtsc-typeonly.log）。

### 直すとしたら

- 「注入できる型なのにエラーになる／注入できない型なのに通る」という不具合は、`type_to_value.ts` の `typeToValue` と `resolveTypeSymbols` が入口です。単体の it は `ts_host_spec.ts` の `getConstructorParameters()` の形で、`UNAVAILABLE` の理由（`typeValueReference.reason.kind`）を見る it を足すのが自然です（いまは無い）。
- デコレーターが認識されない（別名・名前空間・再 export）は、`_reflectDecorator` → `getImportOfIdentifier` の 2 つです。
- 最近の変更では、e10a63453d4（2026-02-12、refactor）が 3 節の 81・106 行目と名前空間の枝の 3 か所で、TypeScript で非推奨になった `isTypeOnly` を `phaseModifier === ts.SyntaxKind.TypeKeyword` に置き換えました（TypeScript の .d.ts では `ImportClause.isTypeOnly` に「`phaseModifier` を使え」という非推奨の印が付いています）。前と後で振る舞いは同じで、101 行目の `import {type Foo}`（指定子の `isTypeOnly`）は置き換えの対象外です。spec の追加はありません。このコミットで変わったファイルは cycles・hmr・imports・translator などの 8 つです。
- 本家に PR を出すことは勧めません。DI の「No suitable injection token」の issue を読むときは、まず `typeValueReference` の 6 つの理由のどれかを、デモと同じ書き方で手元で確かめます（[第 20 回](20-ngtsc-issues.md)）。

## 聞かれそうな質問

**Q. ngtsc はデコレーターの関数を実行して、引数を受け取っているのですか？**

実行しません。`getDecoratorsOfDeclaration` は 46〜47 行目で AST のデコレーターを取り、`args` には引数の式の AST（43 行目）をそのまま入れます。値にするのは `PartialEvaluator` で、それも実行ではなく AST をたどる評価です（[第 5 回](05-ngtsc-partial-evaluator.md)）。

**Q. `import type { Foo }` の Foo をコンストラクタで注入できないのはなぜですか？**

`typeToValue` の 106 行目が `TYPE_ONLY_IMPORT` を返すからです。型だけの import は出力の JS から消えるので、`ɵfac` に書くべき値が実行時にありません。ふつうの import にするか、`@Inject(Foo)` でトークンを値で渡します。

**Q. `constructor(a: Foo | null)` は注入できますか？`Foo | Bar` は？**

`Foo | null` はできます。105〜117 行目で `null` を外すと 1 つ残るからです。`Foo | Bar` は 2 つ残るので外さず、35〜37 行目で `UNSUPPORTED` になります。`Foo | undefined` も、101〜104 行目のコメントのとおり対象外です。

**Q. 親クラスのコンストラクタの引数も読みますか？**

読みません。573〜574 行目の約束のとおり、そのクラス自身のコンストラクタだけです。コンストラクタが無いクラスは `null` が返り、handler は親の factory を使う形（`ɵɵgetInheritedFactory`）にします（[di-factory の章](../di/04-di-factory.md)）。親のクラスを知りたいときは `getBaseClassExpression`（195 行目）を使います。

**Q. `@Component({ ...base, selector: 'x' })` のように spread で設定を書くと、どうなりますか？**

`reflectObjectLiteral` は 759〜760 行目で spread を黙って飛ばすので、その Map には `selector` だけが入ります。handler はこの Map のキーで設定を読むので、spread の中身は見ません。

## 読み終えて

- `ReflectionHost` は「クラスのデコレーター・メンバー・コンストラクタの引数」と「識別子の import と宣言」を答える約束で、実装は `TypeScriptReflectionHost` 1 つです。
- デコレーターの `name` は呼び名、`import.name` は export 側の名前。`args` は値ではなく式の AST です。
- コンストラクタの引数の型は `typeToValue` で `LOCAL`・`IMPORTED`・`UNAVAILABLE` に分かれ、`import type`・interface・union・型なしは理由つきで `UNAVAILABLE` です。
- `Foo | null` だけは null を外して読みます。
- `reflectObjectLiteral` は `key: value` と省略形だけを拾い、spread は飛ばします。

---

← 前: [NgCompiler とチケット：新しく作るか、前の結果から作るか](03-ngtsc-compiler-ticket.md)  
次: [静的な評価：デコレーターの引数を、動かさずに読む](05-ngtsc-partial-evaluator.md) →
