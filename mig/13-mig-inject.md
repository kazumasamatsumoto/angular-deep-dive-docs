[目次](../README.md) › [マイグレーションの内側](README.md) › 第 13 回 / 全 20 回

# inject() への移行と @Service

> inject-migration がコンストラクタの引数を inject() を使うプロパティに変える仕組み（analysis.ts の調べ方、@Inject・@Optional・@Self などのデコレーターの変換、super() と引数を使うコンストラクタの扱い、backwardsCompatibleConstructors などの設定）。v22 の新しい @Service に @Injectable を変える service-migration。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-inject)

---

`ng generate @angular/core:inject` は、`constructor(private http: HttpClient) {}` を `private http = inject(HttpClient);` に変えます。簡単そうに見えますが、引数をコンストラクタの本体で使っている、`super()` に渡している、`@Inject`・`@Optional` などのデコレーターが付いている、と場合が分かれます。この章では、どのクラスを対象にするか（`analysis.ts`）、引数 1 つをどう変えるか（`migration.ts`）を行で追い、後半で v22 の新しい `@Service` に `@Injectable` を変える `service-migration` を読みます。

読む対象は `packages/core/schematics/ng-generate/inject-migration/` の `index.ts`・`analysis.ts`・`migration.ts`・`schema.json`（`internal.ts` は 1 文だけ）と、`ng-generate/service-migration/migration.ts`、`test/inject_migration_spec.ts`・`test/service_migration_spec.ts` です。

1. [1. 全体像](01-mig-overview.md)
2. [2. 入口と配布物](02-mig-entry-bundles.md)
3. [3. プログラムを作る](03-mig-program.md)
4. [4. Tsurge](04-mig-tsurge.md)
5. [5. 置き換え](05-mig-replacements.md)
6. [6. テンプレート](06-mig-templates.md)
7. [7. signal input の段階](07-mig-signal-input-passes.md)
8. [8. 参照の書き換え](08-mig-signal-input-references.md)
9. [9. 移行できない入力](09-mig-signal-input-incompatible.md)
10. [10. signal クエリ](10-mig-signal-queries.md)
11. [11. output()](11-mig-output.md)
12. [12. 制御フロー](12-mig-control-flow.md)
13. **13. inject()**（この章）
14. [14. テンプレートの書き換え](14-mig-template-rewrites.md)
15. [15. 使っていない import](15-mig-cleanup-imports.md)
16. [16. ルーティング](16-mig-routing.md)
17. [17. v22（1）既定](17-mig-v22-defaults.md)
18. [18. v22（2）?.](18-mig-v22-safe-navigation.md)
19. [19. テスト](19-mig-testing.md)
20. [20. issue と PR を読む](20-mig-issues.md)

まず、手元で走らせた結果を見ておきます（bazel が作った bundle を spec と同じ手順で、`inject-migration` → `service-migration` の順に走らせたもの。2026-11-03）。

📄 `試した入力と出力`

```
// 入力 /user.service.ts
import {Injectable, Inject, Optional, Self} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {API_URL, Logger} from './tokens';

@Injectable({providedIn: 'root'})
export class UserService {
  private readonly base: string;

  constructor(
    private http: HttpClient,
    @Inject(API_URL) apiUrl: string,
    @Optional() @Self() private logger?: Logger,
  ) {
    this.base = apiUrl + '/users';
  }
}

// ng generate @angular/core:inject → ng generate @angular/core:service のあと
import { inject, Service } from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {API_URL, Logger} from './tokens';

@Service()
export class UserService {
  private http = inject(HttpClient);
  private logger = inject(Logger, { optional: true, self: true });

  private readonly base: string;

  constructor() {
    const apiUrl = inject(API_URL);

    this.base = apiUrl + '/users';
  }
}
```

`http` はプロパティに、`apiUrl` はコンストラクタの中の `const` に、`logger` は `{optional: true, self: true}` 付きのプロパティになり、最後に `@Injectable({providedIn: 'root'})` が `@Service()` になりました。この 3 通りの分かれ方を、行で確かめていきます。

## 1. 入口と設定：古い形、ファイルごとの型チェッカー

📄 `angular/packages/core/schematics/ng-generate/inject-migration/index.ts` L66–92 （▶ の行: 74–75, 77–78, 81–82, 84, 87）

```ts
66 │ function runInjectMigration(
67 │   tree: Tree,
68 │   sourceFiles: ts.SourceFile[],
69 │   basePath: string,
70 │   schematicOptions: Options,
71 │ ): number {
72 │   let migratedFiles = 0;
73 │ 
74 ▶   for (const sourceFile of sourceFiles) {
75 ▶     const changes = migrateFile(sourceFile, schematicOptions);
76 │ 
77 ▶     if (changes.length > 0) {
78 ▶       const update = tree.beginUpdate(relative(basePath, sourceFile.fileName));
79 │ 
80 │       for (const change of changes) {
81 ▶         if (change.removeLength != null) {
82 ▶           update.remove(change.start, change.removeLength);
83 │         }
84 ▶         update.insertRight(change.start, change.text);
85 │       }
86 │ 
87 ▶       tree.commitUpdate(update);
88 │       migratedFiles++;
89 │     }
90 │   }
91 │   return migratedFiles;
92 │ }
```

inject-migration は Tsurge ではなく、`Tree` と `ChangeTracker`（変更を記録して最後に位置つきの `PendingChange` の配列にする部品）を使う古い形です。75 行目でファイルごとに `migrateFile` を呼び、81〜84 行目で `remove` と `insertRight` を当てます。tsconfig の集め方と `path` の絞り方は control-flow と同じ形で（[第 12 回](12-mig-control-flow.md)の 1 節）、ここでは `path` を tsconfig ではなく「ファイル名の先頭」として全部の tsconfig のプログラムに当てます（a73b4b7c30a、issue #66074 の修正）。

📄 `angular/packages/core/schematics/ng-generate/inject-migration/schema.json` L6–31 （▶ の行: 7, 13, 17, 19, 23, 25, 29）

```json
 6 │   "properties": {
 7 ▶     "path": {
 8 │       "type": "string",
 9 │       "description": "Path relative to the project root which should be migrated",
10 │       "x-prompt": "Which path in your project should be migrated?",
11 │       "default": "./"
12 │     },
13 ▶     "migrateAbstractClasses": {
14 │       "type": "boolean",
15 │       "description": "Whether abstract classes should be migrated",
16 │       "x-prompt": "Do you want to migrate abstract classes? Abstract classes are not migrated by default, because their parameters aren't guaranteed to be injectable",
17 ▶       "default": false
18 │     },
19 ▶     "backwardsCompatibleConstructors": {
20 │       "type": "boolean",
21 │       "description": "Whether to clean up constructors or keep their signatures backwards compatible",
22 │       "x-prompt": "Do you want to clean up all constructors or keep them backwards compatible? Enabling this option will include an additional signature of `constructor(...args: unknown[]);` that will avoid errors for sub-classes, but will increase the amount of generated code by the migration",
23 ▶       "default": false
24 │     },
25 ▶     "nonNullableOptional": {
26 │       "type": "boolean",
27 │       "description": "Whether to cast the optional inject sites to be non-nullable",
28 │       "x-prompt": "Do you want optional inject calls to be non-nullable? Enable this option if you want the return type to be identical to @Optional(), at the expense of worse type safety",
29 ▶       "default": false
30 │     }
31 │   }
```

| オプション | 既定 | 効く場所（この章の節） |
| --- | --- | --- |
| `path` | `"./"` | index.ts のファイルの絞り込み |
| `migrateAbstractClasses` | false | analysis.ts の 208 行目（2 節） |
| `backwardsCompatibleConstructors` | false | migration.ts の 244 行目と 888 行目（6 節） |
| `nonNullableOptional` | false | migration.ts の 685 行目（5 節） |

このほかに `analysis.ts` の `MigrationOptions` には、`schema.json` に無い内部向けの `_internalCombineMemberInitializers` と `_internalReplaceParameterReferencesInInitializers` があります。コンストラクタの中の `this.foo = this.bar.getValue();` をプロパティの初期化子に移すもので、処理は `internal.ts` にあり、spec では `describe('internal-only behavior')`（L2093）で確かめています。

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L39–55 （▶ の行: 40–46, 48, 53, 55）

```ts
39 │ export function migrateFile(sourceFile: ts.SourceFile, options: MigrationOptions): PendingChange[] {
40 ▶   // Note: even though externally we have access to the full program with a proper type
41 ▶   // checker, we create a new one that is local to the file for a couple of reasons:
42 ▶   // 1. Not having to depend on a program makes running the migration internally faster and easier.
43 ▶   // 2. All the necessary information for this migration is local so using a file-specific type
44 ▶   //    checker should speed up the lookups.
45 ▶   const localTypeChecker = getLocalTypeChecker(sourceFile);
46 ▶   const analysis = analyzeFile(sourceFile, localTypeChecker, options);
47 │ 
48 ▶   if (analysis === null || analysis.classes.length === 0) {
49 │     return [];
50 │   }
51 │ 
52 │   const printer = ts.createPrinter();
53 ▶   const tracker = new ChangeTracker(printer);
54 │ 
55 ▶   analysis.classes.forEach(({node, constructor, superCall}) => {
```

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L804–819 （▶ の行: 809, 811–813, 818）

```ts
804 │ /**
805 │  * Creates a type checker scoped to a specific file.
806 │  * @param sourceFile File for which to create the type checker.
807 │  */
808 │ function getLocalTypeChecker(sourceFile: ts.SourceFile) {
809 ▶   const options: ts.CompilerOptions = {noEmit: true, skipLibCheck: true};
810 │   const host = ts.createCompilerHost(options);
811 ▶   host.getSourceFile = (fileName) => (fileName === sourceFile.fileName ? sourceFile : undefined);
812 ▶   const program = ts.createProgram({
813 ▶     rootNames: [sourceFile.fileName],
814 │     options,
815 │     host,
816 │   });
817 │ 
818 ▶   return program.getTypeChecker();
819 │ }
```

index.ts は tsconfig からプログラムを作っていますが、40〜44 行目のコメントのとおり、`migrateFile` は**そのファイル 1 つだけのプログラム**を作り直して型チェッカーを使います。811 行目で `getSourceFile` がそのファイル以外に `undefined` を返すので、`import {HttpClient} from '@angular/common/http'` の先は解決されません。分かるのは「この識別子はこのファイルのどの import 文から来たか」までで、型の中身は見ません。`getAngularDecorators`（`utils/ng_decorators.ts`）はその範囲で「@angular/core から import した `Component` か」を判定できます。

## 2. analysis.ts：どのクラスを対象にするか

📄 `angular/packages/core/schematics/ng-generate/inject-migration/analysis.ts` L66–94 （▶ の行: 67–68, 72, 76–77, 79, 83, 87, 91, 93）

```ts
66 │ /** Names of decorators that enable DI on a class declaration. */
67 ▶ const DECORATORS_SUPPORTING_DI = new Set([
68 ▶   'Component',
69 │   'Directive',
70 │   'Pipe',
71 │   'NgModule',
72 ▶   'Injectable',
73 │ ]);
74 │ 
75 │ /** Names of symbols used for DI on parameters. */
76 ▶ export const DI_PARAM_SYMBOLS = new Set([
77 ▶   'Inject',
78 │   'Attribute',
79 ▶   'Optional',
80 │   'SkipSelf',
81 │   'Self',
82 │   'Host',
83 ▶   'forwardRef',
84 │ ]);
85 │ 
86 │ /** Kinds of nodes which aren't injectable when set as a type of a parameter. */
87 ▶ const UNINJECTABLE_TYPE_KINDS = new Set([
88 │   ts.SyntaxKind.TrueKeyword,
89 │   ts.SyntaxKind.FalseKeyword,
90 │   ts.SyntaxKind.NumberKeyword,
91 ▶   ts.SyntaxKind.StringKeyword,
92 │   ts.SyntaxKind.NullKeyword,
93 ▶   ts.SyntaxKind.VoidKeyword,
94 │ ]);
```

📄 `angular/packages/core/schematics/ng-generate/inject-migration/analysis.ts` L179–216 （▶ の行: 180–183, 186–187, 193–194, 197–198, 205–208, 213）

```ts
179 │     } else if (ts.isClassDeclaration(node)) {
180 ▶       const decorators = getAngularDecorators(localTypeChecker, ts.getDecorators(node) || []);
181 ▶       const isAbstract = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword);
182 ▶       const supportsDI = decorators.some((dec) => DECORATORS_SUPPORTING_DI.has(dec.name));
183 ▶       const constructorNode = node.members.find(
184 │         (member) =>
185 │           ts.isConstructorDeclaration(member) &&
186 ▶           member.body != null &&
187 ▶           member.parameters.length > 0,
188 │       ) as ts.ConstructorDeclaration | undefined;
189 │ 
190 │       // Basic check to determine if all parameters are injectable. This isn't exhaustive, but it
191 │       // should catch the majority of cases. An exhaustive check would require a full type checker
192 │       // which we don't have in this migration.
193 ▶       const allParamsInjectable = !!constructorNode?.parameters.every((param) => {
194 ▶         if (!param.type || !UNINJECTABLE_TYPE_KINDS.has(param.type.kind)) {
195 │           return true;
196 │         }
197 ▶         return getAngularDecorators(localTypeChecker, ts.getDecorators(param) || []).some(
198 ▶           (dec) => dec.name === 'Inject' || dec.name === 'Attribute',
199 │         );
200 │       });
201 │ 
202 │       // Don't migrate abstract classes by default, because
203 │       // their parameters aren't guaranteed to be injectable.
204 │       if (
205 ▶         supportsDI &&
206 ▶         constructorNode &&
207 ▶         allParamsInjectable &&
208 ▶         (!isAbstract || options.migrateAbstractClasses)
209 │       ) {
210 │         classes.push({
211 │           node,
212 │           constructor: constructorNode,
213 ▶           superCall: node.heritageClauses ? findSuperCall(constructorNode) : null,
214 │         });
215 │       }
216 │     }
```

1. **180〜182 行目：DI ができるデコレーターが付いているか**

   67〜73 行目の `Component`・`Directive`・`Pipe`・`NgModule`・`Injectable` のどれかです。デコレーターの無いクラスや、v22 の `@Service` のクラスは対象外です。
2. **183〜188 行目：本体があり、引数が 1 つ以上のコンストラクタ**

   オーバーロードの宣言（本体が無い）は数えず、実装の 1 つを探します。
3. **193〜200 行目：引数が全部注入できそうか**

   型が 87〜94 行目の `true`・`false`・`number`・`string`・`null`・`void` のどれかで、`@Inject` も `@Attribute` も無い引数が 1 つでもあれば、クラスごと対象外です。190〜192 行目のコメントのとおり、型チェッカーが無いので「網羅的ではない」確かめ方です。
4. **204〜209 行目：abstract のクラスは既定で対象外**

   `migrateAbstractClasses` を付けたときだけ対象です。理由は `schema.json` の 16 行目の説明のとおり「abstract クラスの引数は注入できるとは限らない」からです。
5. **213 行目：継承していれば `super()` の呼び出しを探しておく**

   `findSuperCall` はコンストラクタの中の最初の `super(…)` を返します。

📄 `angular/packages/core/schematics/ng-generate/inject-migration/analysis.ts` L101–126 （▶ の行: 106, 109–110, 119, 121–122）

```ts
101 │ export function analyzeFile(
102 │   sourceFile: ts.SourceFile,
103 │   localTypeChecker: ts.TypeChecker,
104 │   options: MigrationOptions,
105 │ ) {
106 ▶   const coreSpecifiers = getNamedImports(sourceFile, '@angular/core');
107 │ 
108 │   // Exit early if there are no Angular imports.
109 ▶   if (coreSpecifiers === null || coreSpecifiers.elements.length === 0) {
110 ▶     return null;
111 │   }
112 │ 
113 │   const classes: {
114 │     node: ts.ClassDeclaration;
115 │     constructor: ts.ConstructorDeclaration;
116 │     superCall: ts.CallExpression | null;
117 │   }[] = [];
118 │   const nonDecoratorReferences: Record<string, number | undefined> = {};
119 ▶   const importsToSpecifiers = coreSpecifiers.elements.reduce((map, specifier) => {
120 │     const symbolName = (specifier.propertyName || specifier.name).text;
121 ▶     if (DI_PARAM_SYMBOLS.has(symbolName)) {
122 ▶       map.set(symbolName, specifier);
123 │     }
124 │     return map;
125 │   }, new Map<string, ts.ImportSpecifier>());
126 │ 
```

📄 `angular/packages/core/schematics/ng-generate/inject-migration/analysis.ts` L158–178 （▶ の行: 158, 165, 167, 173–174）

```ts
158 ▶     if (ts.isIdentifier(node) && importsToSpecifiers.size > 0) {
159 │       let symbol: ts.Symbol | undefined;
160 │ 
161 │       for (const [name, specifier] of importsToSpecifiers) {
162 │         const localName = (specifier.propertyName || specifier.name).text;
163 │ 
164 │         // Quick exit if the two symbols don't match up.
165 ▶         if (localName === node.text) {
166 │           if (!symbol) {
167 ▶             symbol = localTypeChecker.getSymbolAtLocation(node);
168 │ 
169 │             // If the symbol couldn't be resolved the first time, it won't be resolved the next
170 │             // time either. Stop the loop since we won't be able to get an accurate result.
171 │             if (!symbol || !symbol.declarations) {
172 │               break;
173 ▶             } else if (symbol.declarations.some((decl) => decl === specifier)) {
174 ▶               nonDecoratorReferences[name] = (nonDecoratorReferences[name] || 0) + 1;
175 │             }
176 │           }
177 │         }
178 │       }
```

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L92–102 （▶ の行: 94, 96–97）

```ts
 92 │   });
 93 │ 
 94 ▶   DI_PARAM_SYMBOLS.forEach((name) => {
 95 │     // Both zero and undefined are fine here.
 96 ▶     if (!analysis.nonDecoratorReferences[name]) {
 97 ▶       tracker.removeImport(sourceFile, name, '@angular/core');
 98 │     }
 99 │   });
100 │ 
101 │   return tracker.recordChanges().get(sourceFile) || [];
102 │ }
```

同じ走査で、`Inject`・`Optional` などの import を消してよいかも数えます。119〜125 行目で @angular/core から import した DI のデコレーターの名前を集め、158〜178 行目で「移行するコンストラクタの引数のデコレーター以外」に出てくる回数を `nonDecoratorReferences` に数えます。移行するコンストラクタの引数のデコレーターは、走査の途中（`ts.isParameter` の分岐）で降りないようにしてあるので数に入りません。migration.ts の 94〜99 行目で、回数が 0 の名前だけ import から消します。別のクラスの `@Inject` で使っていれば残ります（spec「should preserve parameter decorators if they are used outside of the migrated class」、L265）。

## 3. 引数ごとに 3 つの問いを立てる

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L139–176 （▶ の行: 139–140, 143–144, 146–147, 151–154）

```ts
139 ▶   const superParameters = superCall
140 ▶     ? getSuperParameters(constructor, superCall, localTypeChecker)
141 │     : null;
142 │   const removedStatementCount = removedStatements.size;
143 ▶   const firstConstructorStatement = constructor.body?.statements.find(
144 ▶     (statement) => !removedStatements.has(statement),
145 │   );
146 ▶   const innerReference = superCall || firstConstructorStatement || constructor;
147 ▶   const innerIndentation = getLeadingLineWhitespaceOfNode(innerReference);
148 │   const prependToConstructor: string[] = [];
149 │   const afterSuper: string[] = [];
150 │ 
151 ▶   for (const param of constructor.parameters) {
152 ▶     const usedInSuper = superParameters !== null && superParameters.has(param);
153 ▶     const usedInConstructor = !unusedParameters.has(param);
154 ▶     const usesOtherParams = parameterReferencesOtherParameters(
155 │       param,
156 │       constructor.parameters,
157 │       localTypeChecker,
158 │     );
159 │ 
160 │     migrateParameter(
161 │       param,
162 │       options,
163 │       localTypeChecker,
164 │       printer,
165 │       tracker,
166 │       superCall,
167 │       usedInSuper,
168 │       usedInConstructor,
169 │       usesOtherParams,
170 │       memberIndentation,
171 │       innerIndentation,
172 │       prependToConstructor,
173 │       prependToClass,
174 │       afterSuper,
175 │     );
176 │   }
```

📄 `angular/packages/core/schematics/ng-generate/inject-migration/analysis.ts` L258–295 （▶ の行: 258, 265, 269–271, 273–274, 282–284, 288, 291–292）

```ts
258 ▶     if (!ts.isIdentifier(node) || !topLevelParameterNames.has(node.text)) {
259 │       node.forEachChild(analyze);
260 │       return;
261 │     }
262 │ 
263 │     // Don't consider `this.<name>` accesses as being references to
264 │     // parameters since they'll be moved to property declarations.
265 ▶     if (isAccessedViaThis(node)) {
266 │       return;
267 │     }
268 │ 
269 ▶     localTypeChecker.getSymbolAtLocation(node)?.declarations?.forEach((decl) => {
270 ▶       if (ts.isParameter(decl) && topLevelParameters.has(decl)) {
271 ▶         accessedTopLevelParameters.add(decl);
272 │       }
273 ▶       if (ts.isShorthandPropertyAssignment(decl)) {
274 ▶         const symbol = localTypeChecker.getShorthandAssignmentValueSymbol(decl);
275 │         if (symbol && symbol.valueDeclaration && ts.isParameter(symbol.valueDeclaration)) {
276 │           accessedTopLevelParameters.add(symbol.valueDeclaration);
277 │         }
278 │       }
279 │     });
280 │   };
281 │ 
282 ▶   declaration.parameters.forEach((param) => {
283 ▶     if (param.initializer) {
284 ▶       analyze(param.initializer);
285 │     }
286 │   });
287 │ 
288 ▶   declaration.body.forEachChild(analyze);
289 │ 
290 │   for (const param of topLevelParameters) {
291 ▶     if (!accessedTopLevelParameters.has(param)) {
292 ▶       unusedParams.add(param);
293 │     }
294 │   }
295 │   return unusedParams;
```

引数 1 つについて、151〜158 行目で次の 3 つを決めます。

1. **usedInSuper：`super(…)` の引数で使っているか**

   `getSuperParameters` は `super` の呼び出しの中の識別子を、型チェッカーでその引数の宣言に結び付けます。コールバックの中までは降りません（そこでは `this` が使えるので）。
2. **usedInConstructor：本体で使っているか**

   上の `getConstructorUnusedParameters` の逆です。265 行目、`this.http` のような `this.` 経由の参照は数えません（プロパティになるので）。273〜278 行目は `{ http }` のような短縮のプロパティ代入です。282〜286 行目で引数の既定値の中も見ます。
3. **usesOtherParams：既定値が別の引数を参照しているか**

   `constructor(a: A, b = a.b)` のような形です（`parameterReferencesOtherParameters`）。

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L358–382 （▶ の行: 362, 369, 372–373, 377–380）

```ts
358 │ function migrateIdentifierParameter(context: ParameterMigrationContext, name: ts.Identifier): void {
359 │   const {node, options, localTypeChecker, printer, tracker, usedInConstructor, usesOtherParams} =
360 │     context;
361 │ 
362 ▶   const replacementCall = createInjectReplacementCall(
363 │     node,
364 │     options,
365 │     localTypeChecker,
366 │     printer,
367 │     tracker,
368 │   );
369 ▶   const declaresProp = parameterDeclaresProperty(node);
370 │ 
371 │   // If the parameter declares a property, we need to declare it (e.g. `private foo: Foo`).
372 ▶   if (declaresProp) {
373 ▶     handlePropertyDeclaration(context, name, replacementCall);
374 │   }
375 │ 
376 │   // If the parameter is referenced within the constructor, we need to declare it as a variable.
377 ▶   if (usedInConstructor) {
378 ▶     handleConstructorUsage(context, name.text, replacementCall, declaresProp);
379 ▶   } else if (usesOtherParams && declaresProp) {
380 ▶     handleParameterWithDependencies(context, name.text, replacementCall);
381 │   }
382 │ }
```

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L384–410 （▶ の行: 391, 395, 399–403, 406）

```ts
384 │ function handlePropertyDeclaration(
385 │   context: ParameterMigrationContext,
386 │   name: ts.Identifier,
387 │   replacementCall: string,
388 │ ): void {
389 │   const {node, memberIndentation, propsToAdd} = context;
390 │ 
391 ▶   const canInitialize = !context.usedInSuper && !context.usesOtherParams;
392 │   const prop = ts.factory.createPropertyDeclaration(
393 │     cloneModifiers(
394 │       node.modifiers?.filter((modifier) => {
395 ▶         return !ts.isDecorator(modifier) && modifier.kind !== ts.SyntaxKind.PublicKeyword;
396 │       }),
397 │     ),
398 │     name,
399 ▶     node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword)
400 ▶       ? undefined
401 ▶       : node.questionToken,
402 ▶     canInitialize ? undefined : node.type,
403 ▶     canInitialize ? ts.factory.createIdentifier(PLACEHOLDER) : undefined,
404 │   );
405 │ 
406 ▶   propsToAdd.push(
407 │     memberIndentation +
408 │       replaceNodePlaceholder(node.getSourceFile(), prop, replacementCall, context.printer),
409 │   );
410 │ }
```

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L412–444 （▶ の行: 420, 423, 425–426, 428, 432, 434–435, 437, 439, 442）

```ts
412 │ function handleConstructorUsage(
413 │   context: ParameterMigrationContext,
414 │   name: string,
415 │   replacementCall: string,
416 │   declaresProp: boolean,
417 │ ): void {
418 │   const {innerIndentation, prependToConstructor, afterSuper, superCall} = context;
419 │ 
420 ▶   if (context.usedInSuper) {
421 │     // Usages of `this` aren't allowed before `super` calls so we need to
422 │     // create a variable which calls `inject()` directly instead...
423 ▶     prependToConstructor.push(`${innerIndentation}const ${name} = ${replacementCall};`);
424 │ 
425 ▶     if (declaresProp) {
426 ▶       afterSuper.push(`${innerIndentation}this.${name} = ${name};`);
427 │     }
428 ▶   } else if (declaresProp) {
429 │     // If the parameter declares a property (`private foo: foo`) and is used inside the class
430 │     // at the same time, we need to ensure that it's initialized to the value from the variable
431 │     // and that we only reference `this` after the `super` call.
432 ▶     const initializer = `${innerIndentation}const ${name} = this.${name};`;
433 │ 
434 ▶     if (superCall === null) {
435 ▶       prependToConstructor.push(initializer);
436 │     } else {
437 ▶       afterSuper.push(initializer);
438 │     }
439 ▶   } else {
440 │     // If the parameter is only referenced in the constructor, we
441 │     // don't need to declare any new properties.
442 ▶     prependToConstructor.push(`${innerIndentation}const ${name} = ${replacementCall};`);
443 │   }
444 │ }
```

| 引数 | できるもの | 行 |
| --- | --- | --- |
| `private http: HttpClient`（本体で使わない） | `private http = inject(HttpClient);` | 372〜374 → 391・403（初期化子つきのプロパティ） |
| `apiUrl: string`（修飾子なし、本体で使う） | 本体の先頭に `const apiUrl = inject(…);` | 377〜378 → 442 |
| `private store: Store`（本体でも使う） | プロパティ `private store = inject(Store);` と、本体の先頭に `const store = this.store;` | 373 → 428〜438 |
| `readonly a: A`（`super(a)` に渡す） | 型だけのプロパティ `readonly a: A;`、`super` の前に `const a = inject(A);`、後に `this.a = a;` | 391・402（初期化できない）→ 420〜427 |

`super` の前では `this` を使えません。だから `super` に渡す引数は、プロパティの初期化子（`this` が使えるのは `super` のあと）にできず、423 行目で `super` の前の `const` にし、426 行目で `super` のあとにプロパティに入れます。spec の例で並べてみます。

📄 `angular/packages/core/schematics/test/inject_migration_spec.ts` L1011–1031 （▶ の行: 1022–1027）

```ts
1011 │   it('should account for super() calls', async () => {
1012 │     writeFile(
1013 │       '/dir.ts',
1014 │       [
1015 │         `import { Directive } from '@angular/core';`,
1016 │         `import { Parent } from './parent';`,
1017 │         `import { A, B, C, D } from './types';`,
1018 │         ``,
1019 │         `@Directive()`,
1020 │         `class MyDir extends Parent {`,
1021 │         `  constructor(`,
1022 ▶         `    readonly usedInSuperAndDeclared: A,`,
1023 ▶         `    protected declaredButNotUsedInSuper: B,`,
1024 ▶         `    usedInSuperUndeclared: C,`,
1025 ▶         `    usedInConstructorUndeclared: D) {`,
1026 ▶         `    super(usedInSuperAndDeclared, usedInSuperUndeclared);`,
1027 ▶         `    console.log(usedInConstructorUndeclared + 1);`,
1028 │         `  }`,
1029 │         `}`,
1030 │       ].join('\n'),
1031 │     );
```

📄 `angular/packages/core/schematics/test/inject_migration_spec.ts` L1033–1057 （▶ の行: 1040–1041, 1044–1046, 1048–1049, 1051）

```ts
1033 │     await runMigration();
1034 │ 
1035 │     expect(tree.readContent('/dir.ts').split('\n')).toEqual([
1036 │       `import { Directive, inject } from '@angular/core';`,
1037 │       `import { Parent } from './parent';`,
1038 │       `import { A, B, C, D } from './types';`,
1039 │       ``,
1040 ▶       `@Directive()`,
1041 ▶       `class MyDir extends Parent {`,
1042 │       `  readonly usedInSuperAndDeclared: A;`,
1043 │       `  protected declaredButNotUsedInSuper = inject(B);`,
1044 ▶       ``,
1045 ▶       `  constructor() {`,
1046 ▶       `    const usedInSuperAndDeclared = inject(A);`,
1047 │       `    const usedInSuperUndeclared = inject(C);`,
1048 ▶       `    const usedInConstructorUndeclared = inject(D);`,
1049 ▶       ``,
1050 │       `    super(usedInSuperAndDeclared, usedInSuperUndeclared);`,
1051 ▶       `    this.usedInSuperAndDeclared = usedInSuperAndDeclared;`,
1052 │       ``,
1053 │       `    console.log(usedInConstructorUndeclared + 1);`,
1054 │       `  }`,
1055 │       `}`,
1056 │     ]);
1057 │   });
```

`declaredButNotUsedInSuper` だけが 1041 行目でふつうのプロパティ（初期化子つき）になり、`super` に渡す 2 つと本体で使う 1 つは 1044〜1046 行目で `super` の前の `const` になります。`usedInSuperAndDeclared` は 1040 行目の型だけのプロパティと 1049 行目の代入に分かれます。399〜401 行目（上の引用）は、`private` の付いた引数のときだけ `?` をプロパティに写さない行です（spec「should not mark private members as optional」、L1697。`private` でなければ写します、L1670）。冒頭の例の `logger` の `?` が消えたのはこの行です。

## 4. createInjectReplacementCall：inject() の呼び出しを作る

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L597–616 （▶ の行: 599, 603, 609–612, 614）

```ts
597 │   const moduleName = '@angular/core';
598 │   const sourceFile = param.getSourceFile();
599 ▶   const decorators = getAngularDecorators(localTypeChecker, ts.getDecorators(param) || []);
600 │   const literalProps = new Set<string>();
601 │   const type = param.type;
602 │   let injectedType = '';
603 ▶   let typeArguments = type && hasGenerics(type) ? [type] : undefined;
604 │   let hasOptionalDecorator = false;
605 │ 
606 │   if (type) {
607 │     // Remove the type arguments from generic type references, because
608 │     // they'll be specified as type arguments to `inject()`.
609 ▶     if (ts.isTypeReferenceNode(type) && type.typeArguments && type.typeArguments.length > 0) {
610 ▶       injectedType = type.typeName.getText();
611 ▶     } else if (ts.isUnionTypeNode(type)) {
612 ▶       injectedType = (type.types.find((t) => !ts.isLiteralTypeNode(t)) || type.types[0]).getText();
613 │     } else {
614 ▶       injectedType = type.getText();
615 │     }
616 │   }
```

まずトークンを決めます。型注釈がそのままトークンです（614 行目）。`Foo<Bar>` のように型引数があれば 610 行目でトークンは `Foo`、603 行目で型全体を `inject<Foo<Bar>>` の型引数にします。`Foo | null` なら 612 行目でリテラルでない最初の型 `Foo` を使います。

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L625–664 （▶ の行: 626, 628–629, 636, 638–639, 643–644, 648–650, 653–654, 657–658, 661–662）

```ts
625 │     switch (decorator.name) {
626 ▶       case 'Inject':
627 │         if (firstArg) {
628 ▶           const injectResult = migrateInjectDecorator(firstArg, type, localTypeChecker);
629 ▶           injectedType = injectResult.injectedType;
630 │           if (injectResult.typeArguments) {
631 │             typeArguments = injectResult.typeArguments;
632 │           }
633 │         }
634 │         break;
635 │ 
636 ▶       case 'Attribute':
637 │         if (firstArg) {
638 ▶           const constructorRef = tracker.addImport(sourceFile, 'HostAttributeToken', moduleName);
639 ▶           const expression = ts.factory.createNewExpression(constructorRef, undefined, [firstArg]);
640 │           injectedType = printer.printNode(ts.EmitHint.Unspecified, expression, sourceFile);
641 │           typeArguments = undefined;
642 │           // @Attribute is implicitly optional.
643 ▶           hasOptionalDecorator = true;
644 ▶           literalProps.add('optional');
645 │         }
646 │         break;
647 │ 
648 ▶       case 'Optional':
649 ▶         hasOptionalDecorator = true;
650 ▶         literalProps.add('optional');
651 │         break;
652 │ 
653 ▶       case 'SkipSelf':
654 ▶         literalProps.add('skipSelf');
655 │         break;
656 │ 
657 ▶       case 'Self':
658 ▶         literalProps.add('self');
659 │         break;
660 │ 
661 ▶       case 'Host':
662 ▶         literalProps.add('host');
663 │         break;
664 │     }
```

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L714–752 （▶ の行: 719, 724–726, 737–740, 747, 750）

```ts
714 │ function migrateInjectDecorator(
715 │   firstArg: ts.Expression,
716 │   type: ts.TypeNode | undefined,
717 │   localTypeChecker: ts.TypeChecker,
718 │ ) {
719 ▶   let injectedType = firstArg.getText();
720 │   let typeArguments: ts.TypeNode[] | null = null;
721 │ 
722 │   // `inject` no longer officially supports string injection so we need
723 │   // to cast to any. We maintain the type by passing it as a generic.
724 ▶   if (ts.isStringLiteralLike(firstArg) || isStringType(firstArg, localTypeChecker)) {
725 ▶     typeArguments = [type || ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)];
726 ▶     injectedType += ' as any';
727 │   } else if (
728 │     ts.isCallExpression(firstArg) &&
729 │     ts.isIdentifier(firstArg.expression) &&
730 │     firstArg.arguments.length === 1
731 │   ) {
732 │     const callImport = getImportOfIdentifier(localTypeChecker, firstArg.expression);
733 │     const arrowFn = firstArg.arguments[0];
734 │ 
735 │     // If the first parameter is a `forwardRef`, unwrap it for a more
736 │     // accurate type and because it's no longer necessary.
737 ▶     if (
738 ▶       callImport !== null &&
739 ▶       callImport.name === 'forwardRef' &&
740 ▶       callImport.importModule === '@angular/core' &&
741 │       ts.isArrowFunction(arrowFn)
742 │     ) {
743 │       if (ts.isBlock(arrowFn.body)) {
744 │         const returnStatement = arrowFn.body.statements.find((stmt) => ts.isReturnStatement(stmt));
745 │ 
746 │         if (returnStatement && returnStatement.expression) {
747 ▶           injectedType = returnStatement.expression.getText();
748 │         }
749 │       } else {
750 ▶         injectedType = arrowFn.body.getText();
751 │       }
752 │     }
```

| デコレーター | inject の形 | 行 |
| --- | --- | --- |
| `@Inject(TOKEN)` | `inject(TOKEN)`。型が参照型などなら `inject<型>(TOKEN)` | 626〜634 → 719（型引数は関数の後半で決める） |
| `@Inject('name')`（文字列） | `inject<型>('name' as any)` | 724〜726 |
| `@Inject(forwardRef(() => Foo))` | `inject(Foo)` | 737〜751 |
| `@Attribute('role')` | `inject(new HostAttributeToken('role'), {optional: true})` | 636〜646 |
| `@Optional()` | `{optional: true}` | 648〜651 |
| `@SkipSelf()`・`@Self()`・`@Host()` | `{skipSelf: true}`・`{self: true}`・`{host: true}` | 653〜663 |

724 行目の `isStringType` は、文字列リテラルだけでなく文字列の定数を渡したときも拾います。`inject` は文字列のトークンを型の上で受け付けないので `as any` を付けます。これは issue #61982（生成したコードがコンパイルできない）に対する 4040a6ba5d7 の修正です。643 行目、`@Attribute` は暗黙に optional という扱いで、0162ceb4272 で入りました。

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L667–705 （▶ の行: 670–671, 673, 676–677, 683, 685–687, 691–692, 697–698, 700, 705）

```ts
667 │   // The injected type might be a `TypeNode` which we can't easily convert into an `Expression`.
668 │   // Since the value gets passed through directly anyway, we generate the call using a placeholder
669 │   // which we then replace with the raw text of the `TypeNode`.
670 ▶   const injectRef = tracker.addImport(param.getSourceFile(), 'inject', moduleName);
671 ▶   const args: ts.Expression[] = [ts.factory.createIdentifier(PLACEHOLDER)];
672 │ 
673 ▶   if (literalProps.size > 0) {
674 │     args.push(
675 │       ts.factory.createObjectLiteralExpression(
676 ▶         Array.from(literalProps, (prop) =>
677 ▶           ts.factory.createPropertyAssignment(prop, ts.factory.createTrue()),
678 │         ),
679 │       ),
680 │     );
681 │   }
682 │ 
683 ▶   let expression: ts.Expression = ts.factory.createCallExpression(injectRef, typeArguments, args);
684 │ 
685 ▶   if (hasOptionalDecorator && options.nonNullableOptional) {
686 ▶     const hasNullableType =
687 ▶       param.questionToken != null || (param.type != null && isNullableType(param.type));
688 │ 
689 │     // Only wrap the expression if the type wasn't already nullable.
690 │     // If it was, the app was likely accounting for it already.
691 ▶     if (!hasNullableType) {
692 ▶       expression = ts.factory.createNonNullExpression(expression);
693 │     }
694 │   }
695 │ 
696 │   // If the parameter is initialized, add the initializer as a fallback.
697 ▶   if (param.initializer) {
698 ▶     expression = ts.factory.createBinaryExpression(
699 │       expression,
700 ▶       ts.SyntaxKind.QuestionQuestionToken,
701 │       param.initializer,
702 │     );
703 │   }
704 │ 
705 ▶   return replaceNodePlaceholder(param.getSourceFile(), expression, injectedType, printer);
```

1. **670〜683 行目：`inject(プレースホルダー, {…: true})` の式を作る**

   トークンは型注釈の文字列なので式のノードにしにくく、671 行目でいったん `ɵɵngGeneratePlaceholderɵɵ` という識別子にしておき、705 行目で印刷した文字列の中を置き換えます（667〜669 行目のコメント）。
2. **685〜694 行目：`nonNullableOptional` なら `!` を付ける**

   `@Optional()` の引数は `Foo` 型として使えましたが、`inject(Foo, {optional: true})` は `Foo | null` を返します。型の差で壊れないように `inject(…)!` にします。元の型がもともと null を許していれば（`?` や `| null`）付けません。
3. **697〜703 行目：引数の既定値は `??` の右に**

   `constructor(@Optional() x = 5)` は `inject(X, {optional: true}) ?? 5` です。

## 5. コンストラクタを残すか消すか、backwardsCompatibleConstructors

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L881–900 （▶ の行: 888–889, 892–893, 897–898）

```ts
881 │ function canRemoveConstructor(
882 │   options: MigrationOptions,
883 │   constructor: ts.ConstructorDeclaration,
884 │   removedStatementCount: number,
885 │   prependToConstructor: string[],
886 │   superCall: ts.CallExpression | null,
887 │ ): boolean {
888 ▶   if (options.backwardsCompatibleConstructors || prependToConstructor.length > 0) {
889 ▶     return false;
890 │   }
891 │ 
892 ▶   const statementCount = constructor.body
893 ▶     ? constructor.body.statements.length - removedStatementCount
894 │     : 0;
895 │ 
896 │   return (
897 ▶     statementCount === 0 ||
898 ▶     (statementCount === 1 && superCall !== null && superCall.arguments.length === 0)
899 │   );
900 │ }
```

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L187–224 （▶ の行: 188, 197–198, 202, 204, 211, 213–214）

```ts
187 │   if (
188 ▶     canRemoveConstructor(
189 │       options,
190 │       constructor,
191 │       removedStatementCount,
192 │       prependToConstructor,
193 │       superCall,
194 │     )
195 │   ) {
196 │     // Drop the constructor if it was empty.
197 ▶     removedMembers.add(constructor);
198 ▶     tracker.removeNode(constructor, true);
199 │   } else {
200 │     // If the constructor contains any statements, only remove the parameters.
201 │     // We always do this no matter what is passed into `backwardsCompatibleConstructors`.
202 ▶     stripConstructorParameters(constructor, tracker);
203 │ 
204 ▶     if (prependToConstructor.length > 0) {
205 │       if (
206 │         firstConstructorStatement ||
207 │         (innerReference !== constructor &&
208 │           innerReference.getStart() >= constructor.getStart() &&
209 │           innerReference.getEnd() <= constructor.getEnd())
210 │       ) {
211 ▶         tracker.insertText(
212 │           sourceFile,
213 ▶           (firstConstructorStatement || innerReference).getFullStart(),
214 ▶           `\n${prependToConstructor.join('\n')}\n`,
215 │         );
216 │       } else {
217 │         tracker.insertText(
218 │           sourceFile,
219 │           constructor.body!.getStart() + 1,
220 │           `\n${prependToConstructor.map((p) => innerIndentation + p).join('\n')}\n${innerIndentation}`,
221 │         );
222 │       }
223 │     }
224 │   }
```

📄 `angular/packages/core/schematics/ng-generate/inject-migration/migration.ts` L226–255 （▶ の行: 226, 231–232, 234, 244–247, 250–251, 253）

```ts
226 ▶   if (afterSuper.length > 0 && superCall !== null) {
227 │     // Note that if we can, we should insert before the next statement after the `super` call,
228 │     // rather than after the end of it. Otherwise the string buffering implementation may drop
229 │     // the text if the statement after the `super` call is being deleted. This appears to be because
230 │     // the full start of the next statement appears to always be the end of the `super` call plus 1.
231 ▶     const nextStatement = getNextPreservedStatement(superCall, removedStatements);
232 ▶     tracker.insertText(
233 │       sourceFile,
234 ▶       nextStatement ? nextStatement.getFullStart() : constructor.getEnd() - 1,
235 │       `\n${afterSuper.join('\n')}\n` + (nextStatement ? '' : memberIndentation),
236 │     );
237 │   }
238 │ 
239 │   // Need to resolve this once all constructor signatures have been removed.
240 │   const memberReference = node.members.find((m) => !removedMembers.has(m)) || node.members[0];
241 │ 
242 │   // If `backwardsCompatibleConstructors` is enabled, we maintain
243 │   // backwards compatibility by adding a catch-all signature.
244 ▶   if (options.backwardsCompatibleConstructors) {
245 ▶     const extraSignature =
246 ▶       `\n${memberIndentation}/** Inserted by Angular inject() migration for backwards compatibility */\n` +
247 ▶       `${memberIndentation}constructor(...args: unknown[]);`;
248 │ 
249 │     // The new signature always has to be right before the constructor implementation.
250 ▶     if (memberReference === constructor) {
251 ▶       prependToClass.push(extraSignature);
252 │     } else {
253 ▶       tracker.insertText(sourceFile, constructor.getFullStart(), '\n' + extraSignature);
254 │     }
255 │   }
```

コンストラクタが消えるのは、本体に文が残らないか、残るのが引数のない `super()` 1 つだけのときです（896〜899 行目）。888 行目、`prependToConstructor`（3 節の `const x = inject(X);`）があれば残します。残すときは 202 行目で引数を全部消し、211〜214 行目で最初の文の前に `const` を並べます。`super` のあとの代入（`this.a = a;`）は 226〜237 行目で、`super` の次に残る文の前に入れます。

`backwardsCompatibleConstructors` を付けると、888 行目でコンストラクタを消さず、245〜247 行目で `constructor(...args: unknown[]);` のオーバーロードを足します。README の説明は「Angular のデコレーターの付いたクラスどうしで継承していると、コンパイルエラーになる場合がある」です。たとえば子が `super(a, b)` と引数を渡していると、親のコンストラクタの引数が消えたあとは引数の数が合わず、TypeScript のエラー（TS2554）になります。`...args: unknown[]` のシグネチャがあれば、その呼び出しはそのまま型が合います。

## 6. service-migration：@Injectable を @Service に

`@Service` は v22 の新しいデコレーターで、定義は `packages/core/src/di/service.ts` にあります。既定で自動的に提供され（`autoProvided` の既定は true）、`{autoProvided: false}` なら利用者が providers に書く必要があります。コンパイラ（`compiler-cli/src/ngtsc/annotations/src/service.ts`）は、`@Service` のクラスや親のクラスがコンストラクタで注入していると「``@Service class cannot use constructor dependency injection. Use the `inject` function instead.``」というエラーにします。だから service-migration は、inject-migration のあとに走らせる前提の作りです。

📄 `angular/packages/core/schematics/ng-generate/service-migration/migration.ts` L14–52 （▶ の行: 24–25, 29–30, 32, 34–35, 39, 47–48）

```ts
14 │ export function migrateFile(
15 │   sourceFile: ts.SourceFile,
16 │   typeChecker: ts.TypeChecker,
17 │ ): PendingChange[] {
18 │   const tracker = new ChangeTracker(ts.createPrinter());
19 │   let totalInjectables = 0;
20 │   let migratedInjectables = 0;
21 │ 
22 │   ts.forEachChild(sourceFile, function visit(node: ts.Node) {
23 │     if (ts.isClassDeclaration(node)) {
24 ▶       const decorator = getAngularDecorators(typeChecker, ts.getDecorators(node) || []).find(
25 ▶         (d) => d.name === 'Injectable' && d.moduleName === '@angular/core',
26 │       );
27 │ 
28 │       if (decorator) {
29 ▶         const analysis = analyzeClass(node, decorator.node.expression.arguments, typeChecker);
30 ▶         totalInjectables++;
31 │ 
32 ▶         if (analysis.canMigrate) {
33 │           migratedInjectables++;
34 ▶           tracker.addImport(sourceFile, 'Service', '@angular/core');
35 ▶           tracker.replaceText(
36 │             sourceFile,
37 │             decorator.node.getStart(),
38 │             decorator.node.getWidth(),
39 ▶             `@Service(${analysis.providedInRoot ? '' : '{ autoProvided: false }'})`,
40 │           );
41 │         }
42 │       }
43 │     }
44 │     ts.forEachChild(node, visit);
45 │   });
46 │ 
47 ▶   if (totalInjectables > 0 && totalInjectables === migratedInjectables) {
48 ▶     tracker.removeImport(sourceFile, 'Injectable', '@angular/core');
49 │   }
50 │ 
51 │   return tracker.recordChanges().get(sourceFile) || [];
52 │ }
```

📄 `angular/packages/core/schematics/ng-generate/service-migration/migration.ts` L64–97 （▶ の行: 65, 67–68, 70, 76–79, 86–87, 90）

```ts
64 │   // We can't migrate if the class is using constructor DI.
65 ▶   if (usesConstructorDI(node, typeChecker)) {
66 │     return analysis;
67 ▶   } else if (decoratorArgs.length === 0) {
68 ▶     analysis.canMigrate = true;
69 │     return analysis;
70 ▶   } else if (decoratorArgs.length !== 1 || !ts.isObjectLiteralExpression(decoratorArgs[0])) {
71 │     return analysis;
72 │   }
73 │ 
74 │   for (const prop of decoratorArgs[0].properties) {
75 │     // We can't migrate if there's any other property than `providedIn`.
76 ▶     if (
77 ▶       !ts.isPropertyAssignment(prop) ||
78 ▶       (!ts.isIdentifier(prop.name) && !ts.isStringLiteralLike(prop.name)) ||
79 ▶       prop.name.text !== 'providedIn'
80 │     ) {
81 │       analysis.canMigrate = false;
82 │       return analysis;
83 │     }
84 │ 
85 │     // We can only migrate if `providedIn` is set to `root`.
86 ▶     if (ts.isStringLiteralLike(prop.initializer) && prop.initializer.text === 'root') {
87 ▶       analysis.providedInRoot = true;
88 │     } else {
89 │       // Otherwise we can't migrate it either.
90 ▶       analysis.canMigrate = false;
91 │       return analysis;
92 │     }
93 │   }
94 │ 
95 │   // If we made it this, it's possible to migrate.
96 │   analysis.canMigrate = true;
97 │   return analysis;
```

📄 `angular/packages/core/schematics/ng-generate/service-migration/migration.ts` L100–116 （▶ の行: 102, 104–105, 107, 110–111）

```ts
100 │ /** Determines whether a class uses constructor-based dependency injection. */
101 │ function usesConstructorDI(node: ts.ClassDeclaration, typeChecker: ts.TypeChecker): boolean {
102 ▶   const baseClasses = [node, ...findBaseClassDeclarations(node, typeChecker).map((c) => c.node)];
103 │ 
104 ▶   for (const current of baseClasses) {
105 ▶     const constructorNode = current.members.find(
106 │       (member): member is ts.ConstructorDeclaration =>
107 ▶         ts.isConstructorDeclaration(member) && !!member.body,
108 │     );
109 │ 
110 ▶     if (constructorNode) {
111 ▶       return constructorNode.parameters.length > 0;
112 │     }
113 │   }
114 │ 
115 │   return false;
116 │ }
```

| 元 | 結果 | 行 |
| --- | --- | --- |
| `@Injectable({providedIn: 'root'})` | `@Service()` | 86〜87 → 39 |
| `@Injectable()`（引数なし） | `@Service({ autoProvided: false })` | 67〜69 → 39 |
| `providedIn: 'platform'` などの root 以外 | 変えない | 88〜92 |
| `useClass`・`useFactory` など `providedIn` 以外のキー | 変えない | 76〜83 |
| 自分か親のクラスがコンストラクタで注入している | 変えない | 65〜66・100〜116 |

`@Injectable()` は「どこかの providers に書かれて初めて使える」ので、`autoProvided: false` にして意味を保ちます。100〜116 行目の `usesConstructorDI` は、自分から親へ順に、**本体のあるコンストラクタを最初に持つクラス**の引数の数で決めます（110〜112 行目で最初に見つけたところで返す）。親が引数を取っていても、自分が引数なしのコンストラクタを書いていれば移行できます（792edaba489、spec「should account for parent class that overrides a grandparent using constructor DI」L198）。47〜49 行目、ファイルの中の `@Injectable` を全部変えられたときだけ `Injectable` の import を消します。`@Injectable` の付いたクラスで `inject()` を使っていても変えますが、`@Component` などには触りません（24〜26 行目で `Injectable` だけを探す）。

## ここまでの呼び出し

- 👤 `ng generate @angular/core:inject` — collection.json の別名
  - `migrate(options)` → `runInjectMigration` — inject-migration/index.ts
    - `migrateFile(sourceFile, options)` — migration.ts — *ファイル 1 つのプログラム*
      - `analyzeFile` — analysis.ts — *対象のクラスと、DI の import の回数*
      - `migrateClass` — migration.ts
        - `getConstructorUnusedParameters`・`getSuperParameters` — analysis.ts
        - `migrateParameter` → `migrateIdentifierParameter` — migration.ts
          - `createInjectReplacementCall` → `migrateInjectDecorator` — migration.ts
          - `handlePropertyDeclaration`・`handleConstructorUsage` — migration.ts
        - `canRemoveConstructor` / `stripConstructorParameters` — migration.ts
      - `tracker.removeImport` → `recordChanges()` — change\_tracker
- 👤 `ng generate @angular/core:service` — service-migration/index.ts — *inject のあとに*

## テストと直し方

| ファイル | 中身 | ターゲット |
| --- | --- | --- |
| `test/inject_migration_spec.ts`（3,098 行） | `describe('inject migration')`（L16）。デコレーターごとの it（L64 は Directive・Component・Pipe・NgModule の 4 つで回す）、`super()`（L1011・L1724・L1860〜2018）、abstract（L1214・L1232）、nonNullableOptional（L1343）、`describe('internal-only behavior')`（L2093） | `//packages/core/schematics/test:test`（16 shard） |
| `test/service_migration_spec.ts`（292 行） | `describe('service migration schematic')`（L16）の 9 件。root（L56）・引数なし（L76）・root 以外（L96）・useClass（L113）・コンストラクタ（L132）・親（L153・L198）・import を残す（L251）・引用符つきのキー（L273） |   |

📄 `ターミナル（cd ~/angular-research/angular）`

```
pnpm bazel test //packages/core/schematics/test:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=inject migration|service migration schematic"
```

📄 `出力（2026-11-03 に実行。抜粋）`

```
==================== Test output for //packages/core/schematics/test:test（16 shard）
（14 の shard）Ran 6 of 430 specs / 6 specs, 0 failures
（2 の shard） Ran 5 of 429 specs / 5 specs, 0 failures
INFO: Elapsed time: 7.729s, Critical Path: 3.98s
//packages/core/schematics/test:test                                     PASSED in 3.7s
```

フィルタは describe の名前 2 つで、16 の shard の合計 94 件（inject 85・service 9）、0 failures、PASSED まで 3.7 秒でした。

直す場所の入口は、対象のクラスの判定が `analysis.ts` の `analyzeFile`、引数の分かれ方が `migration.ts` の `migrateIdentifierParameter` と `handleConstructorUsage`、`inject()` の形が `createInjectReplacementCall` です。spec は `inject_migration_spec.ts` の形（`writeFile` → `runMigration({…オプション})` → `readContent(...).split('\n')` を 1 行ずつ比べる）で 1 件足します。関係する閉じた issue は #66074（複数プロジェクトのワークスペースで `path` を付けると動かない、a73b4b7c30a）・#61982（文字列の定数のトークン、4040a6ba5d7）・#62626（分割代入の引数、06f4fd44563）・#67684・#66865（tsconfig が見つからない）です。[第 20 回](20-mig-issues.md)で、こうした閉じた issue と修正のコミットを並べて読みます。

## 聞かれそうな質問

**Q. abstract クラスのコンストラクタはなぜ変えないのですか？**

analysis.ts の 204〜209 行目で、`migrateAbstractClasses` が無い限り abstract は対象外です。README と schema.json の 16 行目の説明は「abstract クラスの引数は注入できるとは限らない（Angular が確かめていない）ので、既定では移行しない」です。

**Q. 引数をコンストラクタの中で使っていると、どうなりますか？**

修飾子が無ければ本体の先頭に `const x = inject(X);`（migration.ts の 442 行目）、`private` などが付いていればプロパティにしたうえで本体の先頭に `const x = this.x;`（432 行目）です。`super` に渡していれば `super` の前に `const` を置き、あとで `this.x = x;`（423・426 行目）。

**Q. @Optional() を付けていた引数の型はどうなりますか？**

`inject(X, {optional: true})` の戻り値は `X | null` です。`nonNullableOptional` を付けると migration.ts の 685〜694 行目で `!` を付けて元の型に合わせます。元の型がもともと null を許していれば付けません。

**Q. @Injectable() を @Service() にすると何が変わりますか？**

マイグレーションは意味を保つように書き分けます。`providedIn: 'root'` は `@Service()`（自動で提供）、引数なしの `@Injectable()` は `@Service({ autoProvided: false })`（service-migration/migration.ts の 39 行目と 67〜69 行目）です。コンストラクタで注入しているクラスは変えません（65 行目）。

**Q. inject-migration はプロジェクト全体の型を見ていますか？**

見ていません。migration.ts の 808〜819 行目で、ファイル 1 つだけのプログラムの型チェッカーを作ります。import の先は解決されないので、引数の型が本当に注入できるかは、analysis.ts の 193〜200 行目の構文の確かめ（string・number などでないか）だけです。

## 読み終えて

- 対象は DI のデコレーターが付き、本体と引数のあるコンストラクタを持ち、引数がどれも明らかな基本型でないクラス。abstract は既定で外す。
- 引数ごとに「super で使うか」「本体で使うか」「他の引数を参照するか」を決め、プロパティ・`const`・`super` の後の代入に振り分ける。
- デコレーターは `inject` の第 2 引数の `{optional, self, skipSelf, host}` に、`@Attribute` は `HostAttributeToken` に、文字列のトークンは `as any` になる。
- service-migration は `providedIn: 'root'` か引数なしの `@Injectable` だけを変え、コンストラクタで注入するクラスは残す。inject-migration を先に走らせる。

---

← 前: [制御フローへの移行：\*ngIf を @if に](12-mig-control-flow.md)  
次: [テンプレートの書き換え：自己終了タグ・ngClass・ngStyle](14-mig-template-rewrites.md) →
