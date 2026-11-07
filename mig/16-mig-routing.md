[目次](../README.md) › [マイグレーションの内側](README.md) › 第 16 回 / 全 20 回

# ルーティングのマイグレーション：遅延読み込みと RouterTestingModule

> route-lazy-loading が、ルートの component: X を loadComponent: () =&gt; import(...) に変える仕組み（ルートの配列を見つける 5 つの形、standalone のコンポーネントだけ、同じファイルに無いものだけ、NgModule のものだけを報告する）。router-testing-module-migration が .spec.ts の RouterTestingModule を RouterModule（routes があれば RouterModule.forRoot）に変え、SpyLocation.urlChanges を使うときだけ provideLocationMocks() を足す仕組み。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-routing)

---

この章では、ルーティングに関わる 2 つの `ng generate` のマイグレーションを読みます。1 つ目の `route-lazy-loading` は、ルートの `component: X` を `loadComponent: () => import(...)` に変えます。どのルート配列を見つけ、どのルートを変え、どれを黙って飛ばし、どれを「NgModule のコンポーネント」として報告するかを、判定の行の順に追います。2 つ目の `router-testing-module-migration` は、spec の `RouterTestingModule` を `RouterModule` に変えます（説明文には `provideRouter()` と書いてありますが、コードは `provideRouter` を一度も作りません）。

読む対象は `packages/core/schematics/ng-generate/route-lazy-loading/` の index.ts・to-lazy-routes.ts・util.ts と、`ng-generate/router-testing-module-migration/` の index.ts・migration.ts・utils.ts、それに spec の test/standalone\_routes\_spec.ts と test/router-testing-module-migration\_spec.ts です。

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
13. [13. inject()](13-mig-inject.md)
14. [14. テンプレートの書き換え](14-mig-template-rewrites.md)
15. [15. 使っていない import](15-mig-cleanup-imports.md)
16. **16. ルーティング**（この章）
17. [17. v22（1）既定](17-mig-v22-defaults.md)
18. [18. v22（2）?.](18-mig-v22-safe-navigation.md)
19. [19. テスト](19-mig-testing.md)
20. [20. issue と PR を読む](20-mig-issues.md)

## 1. 2 つのマイグレーションの書き方の違い

|   | route-lazy-loading | router-testing-module-migration |
| --- | --- | --- |
| 走らせ方 | `ng generate @angular/core:route-lazy-loading` | `ng generate @angular/core:router-testing-module-migration` |
| 書き方 | 古い形（Tree・`getProjectTsConfigPaths`・`createMigrationProgram`・`ChangeTracker`） | Tsurge（`TsurgeFunnelMigration` と `runMigrationInDevkit`） |
| 見る tsconfig | build の tsconfig だけ（`buildPaths`） | Tsurge が集める build と test の両方。ファイルは `.spec.ts` だけ |
| 型チェッカー | 使う（ルートの型、クラスの宣言、Router の型） | 使わない（名前の文字列だけで判定） |

2 つの書き方の全体の違いは[第 1 回](01-mig-overview.md)、tsconfig を集める `getProjectTsConfigPaths` とプログラムの作り方は[第 3 回](03-mig-program.md)、Tsurge の段階は[第 4 回](04-mig-tsurge.md)です。ここでは「何を見て変えるか」に絞ります。

## 2. route-lazy-loading の入口：tsconfig ごとにプログラムを作る

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/index.ts` L87–113 （▶ の行: 94, 100, 106, 111–112）

```ts
 87 │ function standaloneRoutesMigration(
 88 │   tree: Tree,
 89 │   tsconfigPath: string,
 90 │   basePath: string,
 91 │   pathToMigrate: string,
 92 │   schematicOptions: Options,
 93 │ ): {migratedRoutes: RouteMigrationData[]; skippedRoutes: RouteMigrationData[]} {
 94 ▶   if (schematicOptions.path.startsWith('..')) {
 95 │     throw new SchematicsException(
 96 │       'Cannot run route lazy loading migration outside of the current project.',
 97 │     );
 98 │   }
 99 │ 
100 ▶   if (existsSync(pathToMigrate) && !statSync(pathToMigrate).isDirectory()) {
101 │     throw new SchematicsException(
102 │       `Migration path ${pathToMigrate} has to be a directory. Cannot run the route lazy loading migration.`,
103 │     );
104 │   }
105 │ 
106 ▶   const program = createMigrationProgram(tree, tsconfigPath, basePath);
107 │   const sourceFiles = program
108 │     .getSourceFiles()
109 │     .filter(
110 │       (sourceFile) =>
111 ▶         sourceFile.fileName.startsWith(pathToMigrate) &&
112 ▶         canMigrateFile(basePath, sourceFile, program),
113 │     );
```

1. **94 行目：`--path` が `..` で始まれば止める**

   プロジェクトの外を書き換えないための検査です。spec の it「should throw an error if a path outside of the project is passed in」（standalone\_routes\_spec.ts:99）がこの文を確かめています。
2. **100 行目：`--path` がファイルなら止める**

   ディレクトリだけを受け付けます。`existsSync` と `statSync` は Tree ではなく本物のディスクを見ています。
3. **106 行目：`createMigrationProgram` で TypeScript のプログラムを作る**

   Angular のコンパイラ（NgtscProgram）ではなく、素の `ts.Program` です。型チェッカーは使えますが、テンプレートの型チェックの情報はありません。
4. **111〜112 行目：`--path` の下のファイルで、移行してよいものだけ**

   `canMigrateFile` は .d.ts や node\_modules の中を外す共通部品です（[第 3 回](03-mig-program.md)）。

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/index.ts` L122–142 （▶ の行: 127, 132, 135–136, 138, 141）

```ts
122 │   for (const sourceFile of sourceFiles) {
123 │     const {
124 │       pendingChanges,
125 │       skippedRoutes: skipped,
126 │       migratedRoutes: migrated,
127 ▶     } = migrateFileToLazyRoutes(sourceFile, program);
128 │ 
129 │     skippedRoutes.push(...skipped);
130 │     migratedRoutes.push(...migrated);
131 │ 
132 ▶     const update = tree.beginUpdate(relative(basePath, sourceFile.fileName));
133 │ 
134 │     pendingChanges.forEach((change) => {
135 ▶       if (change.removeLength != null) {
136 ▶         update.remove(change.start, change.removeLength);
137 │       }
138 ▶       update.insertRight(change.start, change.text);
139 │     });
140 │ 
141 ▶     tree.commitUpdate(update);
142 │   }
```

127 行目でファイルごとに `migrateFileToLazyRoutes` を呼び、返ってきた `PendingChange` を 132〜141 行目で Tree に当てます。135〜136 行目で消してから 138 行目で `insertRight` する形は、古い形のマイグレーションに共通です（[第 5 回](05-mig-replacements.md)の ChangeTracker）。

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/index.ts` L53–76 （▶ の行: 53–55, 64, 66, 70）

```ts
53 ▶     if (migratedRoutes.length === 0 && skippedRoutes.length === 0) {
54 ▶       throw new SchematicsException(
55 ▶         `Could not find any files to migrate under the path ${pathToMigrate}.`,
56 │       );
57 │     }
58 │ 
59 │     context.logger.info('🎉 Automated migration step has finished! 🎉');
60 │ 
61 │     context.logger.info(`Number of updated routes: ${migratedRoutes.length}`);
62 │     context.logger.info(`Number of skipped routes: ${skippedRoutes.length}`);
63 │ 
64 ▶     if (skippedRoutes.length > 0) {
65 │       context.logger.info(
66 ▶         `Note: this migration was unable to optimize the following routes, since they use components declared in NgModules:`,
67 │       );
68 │ 
69 │       for (const route of skippedRoutes) {
70 ▶         context.logger.info(`- \`${route.path}\` path at \`${route.file}\``);
71 │       }
72 │ 
73 │       context.logger.info(
74 │         `Consider making those components standalone and run this migration again. More information about standalone migration can be found at https://angular.dev/reference/migrations/standalone`,
75 │       );
76 │     }
```

53〜57 行目に注意してください。変えたルートも飛ばしたルートも 0 なら**例外**にします。だから「同じファイルにコンポーネントがある」だけのプロジェクトでは、何も変わらずに「Could not find any files to migrate」というエラーで終わります（spec の it の名前が「should throw an error if the component is in the same file as the routes declaration」（:129）なのはこのためです）。64〜71 行目は、NgModule に宣言されたコンポーネントのルートを `path` とファイル名で並べる行です。「飛ばした」のはこの 1 種類だけで、ほかの理由で変えなかったルートは数にも一覧にも出ません（4 節）。

## 3. どのルート配列を見つけるか

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/to-lazy-routes.ts` L74–114 （▶ の行: 78, 80–82, 84, 87, 94, 97, 101, 103）

```ts
 74 │ function findRoutesArrayToMigrate(sourceFile: ts.SourceFile, typeChecker: ts.TypeChecker) {
 75 │   const routesArrays: RouteData[] = [];
 76 │ 
 77 │   sourceFile.forEachChild(function walk(node) {
 78 ▶     if (ts.isCallExpression(node)) {
 79 │       if (
 80 ▶         isRouterModuleCallExpression(node, typeChecker) ||
 81 ▶         isRouterCallExpression(node, typeChecker) ||
 82 ▶         isProvideRouterCallExpression(node, typeChecker)
 83 │       ) {
 84 ▶         const arg = node.arguments[0]; // ex: RouterModule.forRoot(routes) or provideRouter(routes)
 85 │         const routeFileImports = sourceFile.statements.filter(ts.isImportDeclaration);
 86 │ 
 87 ▶         if (ts.isArrayLiteralExpression(arg) && arg.elements.length > 0) {
 88 │           // ex: inline routes array: RouterModule.forRoot([{ path: 'test', component: TestComponent }])
 89 │           routesArrays.push({
 90 │             routeFilePath: sourceFile.fileName,
 91 │             array: arg as ts.ArrayLiteralExpression,
 92 │             routeFileImports,
 93 │           });
 94 ▶         } else if (ts.isIdentifier(arg)) {
 95 │           // ex: reference to routes array: RouterModule.forRoot(routes)
 96 │           // RouterModule.forRoot(routes), provideRouter(routes)
 97 ▶           const symbol = typeChecker.getSymbolAtLocation(arg);
 98 │           if (!symbol?.declarations) return;
 99 │ 
100 │           for (const declaration of symbol.declarations) {
101 ▶             if (ts.isVariableDeclaration(declaration)) {
102 │               const initializer = declaration.initializer;
103 ▶               if (initializer && ts.isArrayLiteralExpression(initializer)) {
104 │                 // ex: const routes = [{ path: 'test', component: TestComponent }];
105 │                 routesArrays.push({
106 │                   routeFilePath: sourceFile.fileName,
107 │                   array: initializer,
108 │                   routeFileImports,
109 │                 });
110 │               }
111 │             }
112 │           }
113 │         }
114 │       }
```

1. **78〜83 行目：3 種類の呼び出し**

   `RouterModule.forRoot / forChild`、`router.resetConfig`、`provideRouter` です。判定の中身は下の util.ts で見ます。
2. **84 行目：見るのは最初の引数だけ**

   87 行目、配列リテラルをその場で書いていて、中身が 1 つ以上ならそれを使います。
3. **94〜112 行目：変数を渡しているとき**

   97 行目でシンボルを引き、101〜103 行目で「変数の宣言で、初期値が配列リテラル」のものだけを集めます。`routes` が別のファイルから import した変数なら、宣言はその別のファイルの中にあります。ここで集めた配列は、配列が別のファイルにあっても、今見ているファイル（`sourceFile`）の名前と import の一覧と組にされます。型を書かずに別ファイルに置いたルートを移す spec は `xit` で止めてあります（standalone\_routes\_spec.ts:812）。

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/to-lazy-routes.ts` L115–152 （▶ の行: 116, 120–121, 124, 136, 140, 144, 150）

```ts
115 │     } else if (ts.isVariableDeclaration(node)) {
116 ▶       if (isAngularRoutesArray(node, typeChecker)) {
117 │         const initializer = node.initializer;
118 │         if (
119 │           initializer &&
120 ▶           ts.isArrayLiteralExpression(initializer) &&
121 ▶           initializer.elements.length > 0
122 │         ) {
123 │           // ex: const routes: Routes = [{ path: 'test', component: TestComponent }];
124 ▶           if (routesArrays.find((x) => x.array === initializer)) {
125 │             // already exists
126 │             return;
127 │           }
128 │ 
129 │           routesArrays.push({
130 │             routeFilePath: sourceFile.fileName,
131 │             array: initializer,
132 │             routeFileImports: sourceFile.statements.filter(ts.isImportDeclaration),
133 │           });
134 │         }
135 │       }
136 ▶     } else if (ts.isExportAssignment(node)) {
137 │       // Handles `export default routes`, `export default [...]` and `export default [...] as Routes`
138 │       let expression = node.expression;
139 │ 
140 ▶       if (ts.isAsExpression(expression)) {
141 │         expression = expression.expression;
142 │       }
143 │ 
144 ▶       if (ts.isArrayLiteralExpression(expression)) {
145 │         routesArrays.push({
146 │           routeFilePath: sourceFile.fileName,
147 │           array: expression,
148 │           routeFileImports: sourceFile.statements.filter(ts.isImportDeclaration),
149 │         });
150 ▶       } else if (ts.isIdentifier(expression)) {
151 │         manageRoutesExportedByDefault(routesArrays, typeChecker, expression, sourceFile);
152 │       }
```

116 行目、呼び出しに渡していなくても、型が `Routes` か `Route[]` の変数は集めます。124 行目で同じ配列を 2 回入れないようにしています（呼び出しの側で先に入っていることがあるため）。136〜151 行目は `export default [...]`（140 行目で `as Routes` を外す）と `export default routes` です。`loadChildren` で読まれる子のルートのファイルが、よくこの形です。

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/util.ts` L49–65 （▶ の行: 52, 55, 57, 59）

```ts
49 │ export function isAngularRoutesArray(node: ts.Node, typeChecker: ts.TypeChecker) {
50 │   if (ts.isVariableDeclaration(node)) {
51 │     const type = typeChecker.getTypeAtLocation(node);
52 ▶     if (type && typeChecker.isArrayType(type)) {
53 │       // Route[] is an array type
54 │       const typeArguments = typeChecker.getTypeArguments(type as ts.TypeReference);
55 ▶       const symbol = typeArguments[0]?.getSymbol();
56 │       return (
57 ▶         symbol?.name === 'Route' &&
58 │         symbol?.declarations?.some((decl) => {
59 ▶           return decl.getSourceFile().fileName.includes('@angular/router');
60 │         })
61 │       );
62 │     }
63 │   }
64 │   return false;
65 │ }
```

52 行目で配列の型か調べ、55 行目で要素の型のシンボルを取り、57 行目で名前が `Route`、59 行目で宣言のファイル名に `@angular/router` が入っているかを見ます。`type AppRoutes = Routes` のように別名にしても要素の型は `Route` なので当たります（spec の it「should migrate routes array if the Routes type is aliased」、:662）。

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/util.ts` L85–119 （▶ の行: 93, 98, 100, 114, 116）

```ts
 85 │ /**
 86 │  * Checks whether a node is a call expression to a router method.
 87 │  * Example: this.router.resetConfig(routes)
 88 │  */
 89 │ export function isRouterCallExpression(node: ts.CallExpression, typeChecker: ts.TypeChecker) {
 90 │   if (
 91 │     ts.isCallExpression(node) &&
 92 │     ts.isPropertyAccessExpression(node.expression) &&
 93 ▶     node.expression.name.text === 'resetConfig'
 94 │   ) {
 95 │     const calleeExpression = node.expression.expression;
 96 │     const symbol = typeChecker.getSymbolAtLocation(calleeExpression);
 97 │     if (symbol) {
 98 ▶       const type = typeChecker.getTypeOfSymbolAtLocation(symbol, calleeExpression);
 99 │       // if type of router is Router, then it is a router call expression
100 ▶       return type.aliasSymbol?.escapedName === 'Router';
101 │     }
102 │   }
103 │   return false;
104 │ }
105 │ 
106 │ /**
107 │  * Checks whether a node is a call expression to provideRouter function.
108 │  * Example: provideRouter(routes)
109 │  */
110 │ export function isProvideRouterCallExpression(
111 │   node: ts.CallExpression,
112 │   typeChecker: ts.TypeChecker,
113 │ ) {
114 ▶   if (ts.isIdentifier(node.expression)) {
115 │     const moduleSymbol = typeChecker.getSymbolAtLocation(node.expression);
116 ▶     return moduleSymbol && moduleSymbol.name === 'provideRouter';
117 │   }
118 │   return false;
119 │ }
```

`resetConfig` は 93 行目で名前を見て、98 行目で `this.router` の型を取り、100 行目で `type.aliasSymbol?.escapedName === 'Router'` を比べます。`provideRouter` は 114〜116 行目のとおり、呼び出している識別子のシンボルの名前だけを見ます（どのパッケージから来たかは見ません）。

> [!WARNING]
> **ハマりどころ**
>
> 100 行目の `aliasSymbol` は「型の別名（`type X = ...`）を通して付いた名前」です。本物の `@angular/router` の `Router` は class なので、その型に `aliasSymbol` はありません。bazel-bin の本物のバンドル（route-lazy-loading.cjs）を一時ディレクトリで走らせて確かめると、spec と同じ stub（d.ts に `Router` が無く、型が解決できない）では書き換わり、stub に `export declare class Router { resetConfig(r: Routes): void; }` を足すと「Could not find any files to migrate」で終わりました。spec の it「should support Router.resetConfig」（:363）は、`Router` を宣言していない stub の上で通っています。

## 4. 1 つのルートを変えるか：migrateRoute

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/to-lazy-routes.ts` L227–266 （▶ の行: 227, 230, 235, 242, 252, 256, 263–264）

```ts
227 ▶   const component = findLiteralProperty(element, 'component');
228 │ 
229 │   // this can be empty string or a variable that is not a string, or not present at all
230 ▶   const routePath = findLiteralProperty(element, 'path')?.getText() ?? '';
231 │ 
232 │   const children = findLiteralProperty(element, 'children') as ts.PropertyAssignment | undefined;
233 │ 
234 │   // recursively migrate children routes first if they exist
235 ▶   if (children && ts.isArrayLiteralExpression(children.initializer)) {
236 │     for (const childRoute of children.initializer.elements) {
237 │       if (ts.isObjectLiteralExpression(childRoute)) {
238 │         const {
239 │           migratedRoutes: migrated,
240 │           skippedRoutes: toBeSkipped,
241 │           importsToRemove: toBeRemoved,
242 ▶         } = migrateRoute(childRoute, route, typeChecker, reflector, tracker);
243 │         migratedRoutes.push(...migrated);
244 │         skippedRoutes.push(...toBeSkipped);
245 │         importsToRemove.push(...toBeRemoved);
246 │       }
247 │     }
248 │   }
249 │ 
250 │   const routeMigrationResults = {migratedRoutes, skippedRoutes, importsToRemove};
251 │ 
252 ▶   if (!component) {
253 │     return routeMigrationResults;
254 │   }
255 │ 
256 ▶   const componentDeclaration = findClassDeclaration(component, typeChecker);
257 │ 
258 │   if (!componentDeclaration) {
259 │     return routeMigrationResults;
260 │   }
261 │ 
262 │   // if component is not a standalone component, skip it
263 ▶   if (!isStandaloneComponent(componentDeclaration, reflector)) {
264 ▶     skippedRoutes.push({path: routePath, file: route.routeFilePath});
265 │     return routeMigrationResults;
266 │   }
```

1. **235〜248 行目：先に children を自分と同じ関数で**

   子のルートを先に見てから、自分の `component` を見ます（spec の it「should migrate nested children components」、:513）。`loadChildren` の先は別のファイルなので、そのファイルを見たときに 3 節で集められます。
2. **252 行目：`component` のキーが無ければ何もしない**

   `loadComponent` や `redirectTo` だけのルートはここで終わります。すでに遅延読み込みのルートを変えないのは、この行のおかげです（spec の it「should not migrate already lazy loaded standalone components」、:156）。
3. **256 行目：値の型からクラスの宣言を探す**

   `findClassDeclaration` は `getTypeAtLocation(...).getSymbol()?.declarations?.find(ts.isClassDeclaration)` です。見つからなければ 258〜260 行目で何もせず戻ります。
4. **263〜265 行目：standalone でなければ「飛ばした」に入れる**

   2 節の 64〜71 行目で一覧に出るのは、ここで入れたものです。

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/util.ts` L18–42 （▶ の行: 26–27, 33–34, 37）

```ts
18 │ export function isStandaloneComponent(
19 │   node: ts.ClassDeclaration,
20 │   reflector: ReflectionHost,
21 │ ): boolean {
22 │   const decorators = reflector.getDecoratorsOfDeclaration(node);
23 │   if (decorators === null) {
24 │     return false;
25 │   }
26 ▶   const decorator = findAngularDecorator(decorators, 'Component', false);
27 ▶   if (decorator === undefined || decorator.args === null || decorator.args.length !== 1) {
28 │     return false;
29 │   }
30 │ 
31 │   const arg = decorator.args[0];
32 │   if (ts.isObjectLiteralExpression(arg)) {
33 ▶     const property = findLiteralProperty(arg, 'standalone') as ts.PropertyAssignment;
34 ▶     if (property) {
35 │       return property.initializer.getText() === 'true';
36 │     } else {
37 ▶       return true; // standalone is true by default in v19
38 │     }
39 │   }
40 │ 
41 │   return false;
42 │ }
```

26 行目で `@Component` を探し、27 行目で引数が 1 つのオブジェクトでなければ standalone ではないとみなします。33〜34 行目、`standalone` を書いていればその**文字列**が `'true'` かどうか、37 行目、書いていなければ true です（standalone が既定になった話は[NgModule の章](../ngmodule/18-ngmodule-to-standalone.md)）。文字列で比べるので、`standalone: IS_STANDALONE` のように定数で書くと false 扱いになります。

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/to-lazy-routes.ts` L268–311 （▶ の行: 277–278, 283, 287, 292, 295, 300, 303, 308–309）

```ts
268 │   const componentClassName =
269 │     componentDeclaration.name && ts.isIdentifier(componentDeclaration.name)
270 │       ? componentDeclaration.name.text
271 │       : null;
272 │   if (!componentClassName) {
273 │     return routeMigrationResults;
274 │   }
275 │ 
276 │   // if component is in the same file as the routes array, skip it
277 ▶   if (componentDeclaration.getSourceFile().fileName === route.routeFilePath) {
278 ▶     return routeMigrationResults;
279 │   }
280 │ 
281 │   // Resolve the import that provides this component by exact specifier match
282 │   // Handles default imports, named imports, and aliases (e.g., `import { Foo as Bar }`).
283 ▶   const componentImport = route.routeFileImports.find((importDecl) => {
284 │     const clause = importDecl.importClause;
285 │     if (!clause) return false;
286 │     // Default import: import FooComponent from '...'
287 ▶     if (clause.name && ts.isIdentifier(clause.name) && clause.name.text === componentClassName) {
288 │       return true;
289 │     }
290 │     // Named imports: import { FooComponent } from '...'
291 │     const named = clause.namedBindings;
292 ▶     if (named && ts.isNamedImports(named)) {
293 │       return named.elements.some((el: ts.ImportSpecifier) => {
294 │         // Support alias: import { Foo as Bar }
295 ▶         const importedName = el.propertyName ? el.propertyName.text : el.name.text;
296 │         return importedName === componentClassName;
297 │       });
298 │     }
299 │     return false;
300 ▶   })!;
301 │ 
302 │   // remove single and double quotes from the import path
303 ▶   let componentImportPath = ts.isStringLiteral(componentImport?.moduleSpecifier)
304 │     ? componentImport.moduleSpecifier.text
305 │     : null;
306 │ 
307 │   // if the import path is not a string literal, skip it
308 ▶   if (!componentImportPath) {
309 ▶     skippedRoutes.push({path: routePath, file: route.routeFilePath});
310 │     return routeMigrationResults;
311 │   }
```

1. **277〜279 行目：同じファイルのクラスは変えない**

   同じファイルにあるなら、遅延読み込みにしてもチャンクは分かれないからです。ただし 264 行目と違って「飛ばした」には入れません。
2. **283〜300 行目：そのクラスを持ってくる import 宣言を、名前の一致で探す**

   287 行目で default import、292〜297 行目で名前つき import（295 行目で `{ Foo as Bar }` の `Foo` を使う）。8fa66173523（2025-08-12）より前は文字列の後ろの一致で探していて、`BarComponent` を探すと `FooBarComponent` の import が当たっていました（spec の it「should resolve the correct import when one component name is a suffix of another」、:853）。
3. **303〜311 行目：パスが文字列でなければ「飛ばした」に入れる**

   ところが 300 行目の `!` は「必ず見つかる」という宣言で、見つからないと `componentImport` は `undefined` です。303 行目の `ts.isStringLiteral(undefined)` は `node.kind` を読むので、ここで TypeError になります（下の callout）。

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/to-lazy-routes.ts` L313–331 （▶ の行: 313, 316, 322, 324–325, 327）

```ts
313 ▶   const isDefaultExport =
314 │     componentDeclaration.modifiers?.some((x) => x.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
315 │ 
316 ▶   const loadComponent = createLoadComponentPropertyAssignment(
317 │     componentImportPath,
318 │     componentClassName,
319 │     isDefaultExport,
320 │   );
321 │ 
322 ▶   tracker.replaceNode(component, loadComponent);
323 │   // Add the import statement for the standalone component
324 ▶   if (!importsToRemove.includes(componentImport)) {
325 ▶     importsToRemove.push(componentImport);
326 │   }
327 ▶   migratedRoutes.push({path: routePath, file: route.routeFilePath});
328 │ 
329 │   // the component was migrated, so we return the results
330 │   return routeMigrationResults;
331 │ }
```

313 行目で `export default class` かどうかを見て、316 行目で `loadComponent: () => import('./x').then(m => m.X)`（default なら `.then` 無し）の AST を作り、322 行目で `component: X` の PropertyAssignment を丸ごと置き換えます。324〜326 行目で、その import 宣言を「消すもの」に入れます。

📄 `angular/packages/core/schematics/ng-generate/route-lazy-loading/to-lazy-routes.ts` L176–206 （▶ の行: 187, 193, 196, 201–202）

```ts
176 │ function migrateRoutesArray(
177 │   routesArray: RouteData[],
178 │   typeChecker: ts.TypeChecker,
179 │   reflector: ReflectionHost,
180 │   tracker: ChangeTracker,
181 │ ): {migratedRoutes: RouteMigrationData[]; skippedRoutes: RouteMigrationData[]} {
182 │   const migratedRoutes: RouteMigrationData[] = [];
183 │   const skippedRoutes: RouteMigrationData[] = [];
184 │   const importsToRemove: ts.ImportDeclaration[] = [];
185 │ 
186 │   for (const route of routesArray) {
187 ▶     route.array.elements.forEach((element) => {
188 │       if (ts.isObjectLiteralExpression(element)) {
189 │         const {
190 │           migratedRoutes: migrated,
191 │           skippedRoutes: toBeSkipped,
192 │           importsToRemove: toBeRemoved,
193 ▶         } = migrateRoute(element, route, typeChecker, reflector, tracker);
194 │         migratedRoutes.push(...migrated);
195 │         skippedRoutes.push(...toBeSkipped);
196 ▶         importsToRemove.push(...toBeRemoved);
197 │       }
198 │     });
199 │   }
200 │ 
201 ▶   for (const importToRemove of importsToRemove) {
202 ▶     tracker.removeNode(importToRemove);
203 │   }
204 │ 
205 │   return {migratedRoutes, skippedRoutes};
206 │ }
```

201〜203 行目で、集めた import 宣言を `removeNode` で**宣言ごと**消します。宣言の中にほかの名前があるか、ファイルの中でまだそのクラスを使っているかは見ていません。

> [!WARNING]
> **ハマりどころ**
>
> 本物のバンドルを一時ディレクトリで走らせて確かめた 2 つの形です（../angular の 8576f161ae4 を bazel でビルドしたもの。main の 92c7e870caa でも 283〜311 行目と 201〜203 行目は同じ）。
>
> - `import * as cmps from './cmps'` と `component: cmps.MenuComponent`：287 行目にも 292 行目にも当たらず、303 行目で `Cannot read properties of undefined (reading 'kind')`。spec の末尾（下の引用）は、この形を TODO として残しています。
> - `import {HomeComponent, homeTitle} from './home'` と `title: homeTitle`：ルートは書き換わりますが、202 行目で import 宣言ごと消えるので `homeTitle` が未定義になります。
>
> `gh search issues` で「route-lazy-loading」「lazy loading migration」を探しても、2026-11-03 の時点で同じ報告は見つかりませんでした。

📄 `angular/packages/core/schematics/test/standalone_routes_spec.ts` L904–914 （▶ の行: 906–907, 911）

```ts
904 │   });
905 │ 
906 ▶   // TODO: support multiple imports of components
907 ▶   // ex import * as Components from './components';
908 │   // export const MenuRoutes: Routes = [
909 │   //   {
910 │   //     path: 'menu',
911 ▶   //     component: Components.MenuListComponent
912 │   //   },
913 │   // ];
914 │ });
```

### 動かしてみる：1 つのルートの判定

> **🧪 migrateRoute の分岐（移植）**
>
> to-lazy-routes.ts の 227〜331 行目の分岐だけを移植したものです。本物は型チェッカーでクラスを探し、import 宣言の AST を見ますが、ここでは選んだ答えをそのまま使います。例外になる組み合わせは、本物のバンドルで確かめたものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/mig-routing)

## 5. router-testing-module-migration の入口：.spec.ts だけ

📄 `angular/packages/core/schematics/ng-generate/router-testing-module-migration/index.ts` L19–33 （▶ の行: 21, 27–29）

```ts
19 │ export function migrate(options: Options): Rule {
20 │   return async (tree, context) => {
21 ▶     await runMigrationInDevkit({
22 │       tree,
23 │       getMigration: (fs: FileSystem) =>
24 │         new RouterTestingModuleMigration({
25 │           shouldMigrate: (file) => {
26 │             return (
27 ▶               file.rootRelativePath.startsWith(fs.normalize(options.path)) &&
28 ▶               !/(^|\/)node_modules\//.test(file.rootRelativePath) &&
29 ▶               /\.spec\.ts$/.test(file.rootRelativePath)
30 │             );
31 │           },
32 │         }),
33 │       beforeProgramCreation: (tsconfigPath: string, stage: MigrationStage) => {
```

21 行目で Tsurge の `runMigrationInDevkit` に渡します。`shouldMigrate` は 27 行目で `--path` の下、28 行目で node\_modules の外、29 行目で **名前が `.spec.ts` で終わるファイルだけ**です。`test-helpers.ts` のような共通のテスト用ファイルで `configureTestingModule` を呼んでいても変わりません（spec の it「should not process non-spec files」、router-testing-module-migration\_spec.ts:496）。

📄 `angular/packages/core/schematics/ng-generate/router-testing-module-migration/migration.ts` L46–80 （▶ の行: 50–51, 57, 61, 64, 67, 73）

```ts
46 │   override async analyze(info: ProgramInfo): Promise<Serializable<CompilationUnitData>> {
47 │     const replacements: Replacement[] = [];
48 │     const migratedUsages: RouterTestingModuleUsage[] = [];
49 │     const filesWithLocationMocks = new Map<string, boolean>();
50 ▶     const importManager = new ImportManager({
51 ▶       shouldUseSingleQuotes: () => true,
52 │     });
53 │ 
54 │     for (const sourceFile of info.sourceFiles) {
55 │       const file = projectFile(sourceFile, info);
56 │ 
57 ▶       if (this.config.shouldMigrate && !this.config.shouldMigrate(file)) {
58 │         continue;
59 │       }
60 │ 
61 ▶       const usages = findRouterTestingModuleUsages(sourceFile);
62 │ 
63 │       for (const usage of usages) {
64 ▶         processRouterTestingModuleUsage(usage, sourceFile, info, importManager, replacements);
65 │         migratedUsages.push(usage);
66 │ 
67 ▶         if (usage.usesSpyLocationUrlChanges) {
68 │           filesWithLocationMocks.set(sourceFile.fileName, true);
69 │         }
70 │       }
71 │     }
72 │ 
73 ▶     applyImportManagerChanges(importManager, replacements, info.sourceFiles, info);
74 │ 
75 │     return confirmAsSerializable({
76 │       replacements,
77 │       migratedUsages,
78 │       filesWithLocationMocks,
79 │     });
80 │   }
```

Funnel の形なので、置き換えはすべて analyze の中で作ります。50〜52 行目の `ImportManager` は import を足すときに単一引用符を使う設定です。61 行目でファイルの中の使い方を集め、64 行目で 1 つずつ置き換えを作り、73 行目で足した import を置き換えに変えます（[第 5 回](05-mig-replacements.md)）。

## 6. RouterTestingModule をどこに見つけるか

📄 `angular/packages/core/schematics/ng-generate/router-testing-module-migration/utils.ts` L498–542 （▶ の行: 503, 509, 511, 517, 519, 521, 523, 531, 533, 539）

```ts
498 │ export function findRouterTestingModuleUsages(
499 │   sourceFile: ts.SourceFile,
500 │ ): RouterTestingModuleUsage[] {
501 │   const usages: RouterTestingModuleUsage[] = [];
502 │ 
503 ▶   const hasRouterTestingModule = hasImportFromModule(
504 │     sourceFile,
505 │     ANGULAR_ROUTER_TESTING,
506 │     ROUTER_TESTING_MODULE,
507 │   );
508 │ 
509 ▶   const usesSpyLocationUrlChanges = detectSpyLocationUrlChangesUsage(sourceFile);
510 │ 
511 ▶   if (!hasRouterTestingModule) {
512 │     return usages;
513 │   }
514 │ 
515 │   function walk(node: ts.Node): void {
516 │     if (
517 ▶       ts.isCallExpression(node) &&
518 │       ts.isPropertyAccessExpression(node.expression) &&
519 ▶       node.expression.name.text === CONFIGURE_TESTING_MODULE &&
520 │       ts.isIdentifier(node.expression.expression) &&
521 ▶       node.expression.expression.text === TESTBED_IDENTIFIER &&
522 │       node.arguments.length > 0 &&
523 ▶       ts.isObjectLiteralExpression(node.arguments[0])
524 │     ) {
525 │       const config = node.arguments[0];
526 │       let importsProperty: ts.PropertyAssignment | null = null;
527 │       let providersProperty: ts.PropertyAssignment | null = null;
528 │ 
529 │       for (const prop of config.properties) {
530 │         if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
531 ▶           if (prop.name.text === IMPORTS_PROPERTY) {
532 │             importsProperty = prop;
533 ▶           } else if (prop.name.text === PROVIDERS_PROPERTY) {
534 │             providersProperty = prop;
535 │           }
536 │         }
537 │       }
538 │ 
539 ▶       if (!importsProperty || !ts.isArrayLiteralExpression(importsProperty.initializer)) {
540 │         node.forEachChild(walk);
541 │         return;
542 │       }
```

1. **503〜513 行目：`@angular/router/testing` から `RouterTestingModule` を import していなければ終わり**

   判定は import の名前の文字列です（`hasImportFromModule`）。
2. **516〜523 行目：`TestBed.configureTestingModule({...})` の形だけ**

   521 行目で受け手の識別子が `TestBed` という名前であること、523 行目で引数がオブジェクトリテラルであることを見ます。設定を変数に入れて渡す書き方や、`getTestBed()` 経由は対象外です。
3. **529〜542 行目：`imports` と `providers` のプロパティを覚える**

   539 行目、`imports` が配列リテラルでなければ（`imports: SHARED_IMPORTS` など）その呼び出しは飛ばします。

📄 `angular/packages/core/schematics/ng-generate/router-testing-module-migration/utils.ts` L544–584 （▶ の行: 550, 553, 558, 561–562, 564–565, 571）

```ts
544 │       const importsArray = importsProperty.initializer;
545 │       let routerTestingModuleElement: ts.Expression | null = null;
546 │       let routesNode: ts.Expression | null = null;
547 │       let optionsNode: ts.Expression | null = null;
548 │ 
549 │       for (const element of importsArray.elements) {
550 ▶         if (ts.isIdentifier(element) && element.text === ROUTER_TESTING_MODULE) {
551 │           routerTestingModuleElement = element;
552 │           break;
553 ▶         } else if (
554 │           ts.isCallExpression(element) &&
555 │           ts.isPropertyAccessExpression(element.expression) &&
556 │           ts.isIdentifier(element.expression.expression) &&
557 │           element.expression.expression.text === ROUTER_TESTING_MODULE &&
558 ▶           element.expression.name.text === WITH_ROUTES_STATIC_METHOD
559 │         ) {
560 │           routerTestingModuleElement = element;
561 ▶           if (element.arguments.length > 0) {
562 ▶             routesNode = element.arguments[0];
563 │           }
564 ▶           if (element.arguments.length > 1) {
565 ▶             optionsNode = element.arguments[1];
566 │           }
567 │           break;
568 │         }
569 │       }
570 │ 
571 ▶       if (routerTestingModuleElement) {
572 │         usages.push({
573 │           sourceFile,
574 │           configObject: config,
575 │           importsProperty,
576 │           providersProperty,
577 │           routerTestingModuleElement,
578 │           routesNode,
579 │           optionsNode,
580 │           importsArrayElements: Array.from(importsArray.elements),
581 │           usesSpyLocationUrlChanges,
582 │         });
583 │       }
584 │     }
```

550 行目で裸の `RouterTestingModule`、553〜558 行目で `RouterTestingModule.withRoutes(...)` を探し、561〜566 行目で 1 つ目の引数をルート、2 つ目をオプションとして取っておきます。571 行目で 1 か所を 1 つの「使い方」として記録します。

## 7. 何に置き換えるか：withRoutes の引数の扱い

📄 `angular/packages/core/schematics/ng-generate/router-testing-module-migration/utils.ts` L195–235 （▶ の行: 199–200, 203–204, 207, 216, 219, 224, 234）

```ts
195 │ function getRoutesArgumentForMigration(
196 │   routesNode: ts.Expression | null,
197 │   optionsNode: ts.Expression | null,
198 │ ): ts.Expression | undefined {
199 ▶   if (!routesNode) {
200 ▶     return undefined;
201 │   }
202 │ 
203 ▶   if (!isEmptyArrayExpression(routesNode)) {
204 ▶     return routesNode;
205 │   }
206 │ 
207 ▶   return optionsNode ? routesNode : undefined;
208 │ }
209 │ 
210 │ function createRouterModuleExpression(
211 │   routesArg?: ts.Expression,
212 │   optionsArg?: ts.Expression,
213 │ ): ts.Expression {
214 │   const routerModuleIdentifier = ts.factory.createIdentifier(ROUTER_MODULE);
215 │ 
216 ▶   if (routesArg) {
217 │     // Build args list and include options if present
218 │     const args: ts.Expression[] = [routesArg];
219 ▶     if (optionsArg) {
220 │       args.push(optionsArg);
221 │     }
222 │ 
223 │     // Create RouterModule.forRoot(routes, options?) expression
224 ▶     return ts.factory.createCallExpression(
225 │       ts.factory.createPropertyAccessExpression(
226 │         routerModuleIdentifier,
227 │         ts.factory.createIdentifier('forRoot'),
228 │       ),
229 │       undefined,
230 │       args,
231 │     );
232 │   }
233 │ 
234 ▶   return routerModuleIdentifier;
235 │ }
```

| 元 | getRoutesArgumentForMigration（195 行目） | createRouterModuleExpression（210 行目）の結果 |
| --- | --- | --- |
| `RouterTestingModule` | 199 行目で `undefined` | 234 行目：`RouterModule`（forRoot を付けない） |
| `RouterTestingModule.withRoutes([])` | 空の配列でオプションも無いので 207 行目で `undefined` | `RouterModule` |
| `withRoutes(routes)` | 203 行目で `routes` | 224 行目：`RouterModule.forRoot(routes)` |
| `withRoutes([], opts)` | 207 行目で `[]`（オプションを残すため） | 219 行目で足して `RouterModule.forRoot([], opts)` |

📄 `angular/packages/core/schematics/ng-generate/router-testing-module-migration/utils.ts` L385–421 （▶ の行: 397–398, 400–401, 405, 408, 412, 418）

```ts
385 │ function migrateToRouterModule(
386 │   usage: RouterTestingModuleUsage,
387 │   file: ProjectFile,
388 │   routesNode: ts.Expression | null,
389 │   optionsNode: ts.Expression | null,
390 │   replacements: Replacement[],
391 │ ): void {
392 │   const neededImportsExpressions = new Set<ts.Expression>();
393 │   const neededProvidersExpressions = new Set<ts.Expression>();
394 │ 
395 │   const optionsExpression = optionsNode ? optionsNode : undefined;
396 │   const routesExpression = getRoutesArgumentForMigration(routesNode, optionsNode);
397 ▶   const routerModuleExpression = createRouterModuleExpression(routesExpression, optionsExpression);
398 ▶   neededImportsExpressions.add(routerModuleExpression);
399 │ 
400 ▶   if (usage.usesSpyLocationUrlChanges) {
401 ▶     const provideLocationMocksExpression = createProviderCallExpression(PROVIDE_LOCATION_MOCKS);
402 │     neededProvidersExpressions.add(provideLocationMocksExpression);
403 │   }
404 │ 
405 ▶   if (usage.importsProperty && ts.isArrayLiteralExpression(usage.importsProperty.initializer)) {
406 │     const importsArray = usage.importsProperty.initializer;
407 │ 
408 ▶     const otherImportExpressions = usage.importsArrayElements.filter(
409 │       (el) => el !== usage.routerTestingModuleElement,
410 │     );
411 │ 
412 ▶     const allImportExpressions = [
413 │       ...otherImportExpressions,
414 │       ...Array.from(neededImportsExpressions),
415 │     ];
416 │ 
417 │     replacements.push(
418 ▶       createArrayLiteralReplacement(file, importsArray, allImportExpressions, usage.sourceFile),
419 │     );
420 │   }
421 │ 
```

397〜398 行目で上の式を作り、405〜419 行目で `imports` の配列を**作り直します**。408 行目で元の要素から `RouterTestingModule` の要素だけを除き、412〜415 行目で末尾に `RouterModule…` を足し、418 行目で配列全体を印刷し直した文字列に置き換えます。元の配列のコメントや改行の位置は、TypeScript の printer の出力に変わります。

> [!NOTE]
> **ポイント**
>
> どこにも `provideRouter` は出てきません。collection.json の説明（「Replaces deprecated RouterTestingModule with provideRouter()」）と、下の README の 9 行目は今のコードと違います。README の 15・17・18 行目のファイル名（router\_testing\_module\_migration.ts・router\_testing\_to\_provide\_router\_spec.ts・MIGRATION\_NOTES.md）も存在せず、23 行目の「v21 の ng update で走る」も、今は collection.json（ng generate）にしかありません。

📄 `angular/packages/core/schematics/ng-generate/router-testing-module-migration/README.md` L5–29 （▶ の行: 9, 15, 17–18, 23, 28）

````md
 5 │ ## What it does
 6 │ 
 7 │ - Replaces `RouterTestingModule.withRoutes([...])` with `RouterModule.forRoot([...])` for NgModule tests
 8 │ - Replaces `RouterTestingModule` with `RouterModule.forRoot([])` when no routes are provided
 9 ▶ - For standalone tests (detected by presence of `providers`), moves to `provideRouter([...])` instead
10 │ - Updates import statements to use `@angular/router` instead of `@angular/router/testing`
11 │ - Preserves other imports and test configuration
12 │ 
13 │ ## Files
14 │ 
15 ▶ - `router_testing_module_migration.ts` - Main migration logic using TsurgeFunnelMigration
16 │ - `index.ts` - Entry point for the schematic
17 ▶ - `../../test/router_testing_to_provide_router_spec.ts` - Comprehensive test suite
18 ▶ - `MIGRATION_NOTES.md` - Detailed documentation with examples
19 │ - `BUILD.bazel` - Bazel build configuration
20 │ 
21 │ ## Running the migration
22 │ 
23 ▶ The migration runs automatically as part of `ng update @angular/core` for v21.0.0+.
24 │ 
25 │ To run manually:
26 │ 
27 │ ```bash
28 ▶ ng update @angular/core --migrate-only router-testing-to-provide-router
29 │ ```
````

## 8. provideLocationMocks を足す条件

📄 `angular/packages/core/schematics/ng-generate/router-testing-module-migration/utils.ts` L95–124 （▶ の行: 96–99, 109, 112, 114, 123）

```ts
 95 │ function detectSpyLocationUrlChangesUsage(sourceFile: ts.SourceFile): boolean {
 96 ▶   const hasSpyLocationImport = hasImportFromModule(
 97 ▶     sourceFile,
 98 ▶     ANGULAR_COMMON_TESTING,
 99 ▶     SPY_LOCATION,
100 │   );
101 │ 
102 │   let usesUrlChangesFeature = false;
103 │ 
104 │   function walk(node: ts.Node): void {
105 │     if (usesUrlChangesFeature) {
106 │       return;
107 │     }
108 │ 
109 ▶     if (
110 │       ts.isPropertyAccessExpression(node) &&
111 │       ts.isIdentifier(node.name) &&
112 ▶       node.name.text === 'urlChanges'
113 │     ) {
114 ▶       usesUrlChangesFeature = true;
115 │       return;
116 │     }
117 │ 
118 │     node.forEachChild(walk);
119 │   }
120 │ 
121 │   walk(sourceFile);
122 │ 
123 ▶   return hasSpyLocationImport && usesUrlChangesFeature;
124 │ }
```

96〜100 行目で `@angular/common/testing` から `SpyLocation` を import しているか、109〜116 行目でファイルのどこかに `.urlChanges` という名前のプロパティアクセスがあるかを見て、123 行目で両方なら真です。`SpyLocation.urlChanges` は、`RouterTestingModule` が `Location` を `SpyLocation` にしていたから使えた機能なので、`RouterModule` にしたあとも `provideLocationMocks()` で同じ差し替えを残します。`.urlChanges` の受け手が何の型かは見ていません。

📄 `angular/packages/core/schematics/ng-generate/router-testing-module-migration/utils.ts` L422–465 （▶ の行: 427, 429–431, 443, 452, 459）

```ts
422 │   if (neededProvidersExpressions.size > 0) {
423 │     if (
424 │       usage.providersProperty &&
425 │       ts.isArrayLiteralExpression(usage.providersProperty.initializer)
426 │     ) {
427 ▶       const existingProvidersArray = usage.providersProperty.initializer;
428 │ 
429 ▶       const allProviderExpressions = [
430 ▶         ...existingProvidersArray.elements,
431 ▶         ...Array.from(neededProvidersExpressions),
432 │       ];
433 │ 
434 │       replacements.push(
435 │         createArrayLiteralReplacement(
436 │           file,
437 │           existingProvidersArray,
438 │           allProviderExpressions,
439 │           usage.sourceFile,
440 │         ),
441 │       );
442 │     } else {
443 ▶       const providersArray = createArrayLiteralFromExpressions(neededProvidersExpressions);
444 │ 
445 │       const printer = ts.createPrinter();
446 │       const providersText = printer.printNode(
447 │         ts.EmitHint.Unspecified,
448 │         providersArray,
449 │         usage.sourceFile,
450 │       );
451 │ 
452 ▶       const insertPosition = usage.importsProperty!.getEnd();
453 │       replacements.push(
454 │         new Replacement(
455 │           file,
456 │           new TextUpdate({
457 │             position: insertPosition,
458 │             end: insertPosition,
459 ▶             toInsert: `,\n  ${PROVIDERS_PROPERTY}: ${providersText}`,
460 │           }),
461 │         ),
462 │       );
463 │     }
464 │   }
465 │ }
```

`providers` の配列があれば 429〜432 行目で**元の要素の後ろに足し**、無ければ 452〜459 行目で `imports` のプロパティの直後に `,\n providers: [...]` を差し込みます。元の配列にもう `provideLocationMocks()` があるかは見ていません。utils.ts:482 のコメント（analyzeRouterTestingModuleUsage の中）には「3. provideLocationMocks() is not already present」と書いてありますが、その検査は実装されていません。

> [!WARNING]
> **ハマりどころ**
>
> 本物のバンドルで、`imports: [RouterTestingModule], providers: [provideLocationMocks()]` と `spy.urlChanges` を持つ spec を走らせると、結果は `providers: [provideLocationMocks(), provideLocationMocks()]` でした。spec の it「should not add provideLocationMocks again if it is already present and \`SpyLocation.urlChanges\` is used」（:782）は、元のファイルに `RouterTestingModule` が無いので 511 行目で早く終わり、この検査を通っていません。

📄 `angular/packages/core/schematics/ng-generate/router-testing-module-migration/utils.ts` L593–623 （▶ の行: 604, 606, 608, 614–615, 622）

```ts
593 │ export function processRouterTestingModuleUsage(
594 │   usage: RouterTestingModuleUsage,
595 │   sourceFile: ts.SourceFile,
596 │   info: ProgramInfo,
597 │   importManager: ImportManager,
598 │   replacements: Replacement[],
599 │ ): void {
600 │   const file = projectFile(sourceFile, info);
601 │   const routesNode = usage.routesNode;
602 │   const optionsNode = usage.optionsNode;
603 │ 
604 ▶   const analysis = analyzeRouterTestingModuleUsage(usage);
605 │ 
606 ▶   migrateToRouterModule(usage, file, routesNode, optionsNode, replacements);
607 │ 
608 ▶   importManager.addImport({
609 │     exportModuleSpecifier: ANGULAR_ROUTER,
610 │     exportSymbolName: ROUTER_MODULE,
611 │     requestedFile: sourceFile,
612 │   });
613 │ 
614 ▶   if (analysis.hasLocationMocks) {
615 ▶     importManager.addImport({
616 │       exportModuleSpecifier: ANGULAR_COMMON_TESTING,
617 │       exportSymbolName: PROVIDE_LOCATION_MOCKS,
618 │       requestedFile: sourceFile,
619 │     });
620 │   }
621 │ 
622 ▶   removeRouterTestingModuleImport(sourceFile, file, replacements);
623 │ }
```

1 つの使い方の処理は、606 行目で配列を作り直し、608 行目で `RouterModule` の import を足し、614〜620 行目で必要なら `provideLocationMocks` の import を足し、622 行目で `RouterTestingModule` の import を消す、の順です。604 行目の `analyzeRouterTestingModuleUsage` の結果のうち使っているのは 614 行目の `hasLocationMocks` だけで、`neededImports` などは使われていません。

## 9. ここまでの流れ

- 👤 `ng generate @angular/core:route-lazy-loading --path src/app` — 利用者
  - `migrate(options)` — route-lazy-loading/index.ts — *build の tsconfig ごと*
    - `standaloneRoutesMigration()` — index.ts 87 — *createMigrationProgram*
      - `migrateFileToLazyRoutes(sourceFile)` — to-lazy-routes.ts 40
        - `findRoutesArrayToMigrate()` — to-lazy-routes.ts 74 — *forRoot・resetConfig・provideRouter・Routes 型・export default*
        - `migrateRoutesArray()` → `migrateRoute()` — to-lazy-routes.ts 176・212 — *children を先に*
          - `tracker.replaceNode(component, loadComponent)` — to-lazy-routes.ts 322
        - `tracker.removeNode(import)` — to-lazy-routes.ts 202 — *宣言ごと*
    - `tree.beginUpdate → remove / insertRight → commitUpdate` — index.ts 132〜141
- 👤 `ng generate @angular/core:router-testing-module-migration` — 利用者
  - `runMigrationInDevkit()` — router-testing-module-migration/index.ts 21 — *.spec.ts だけ*
    - `RouterTestingModuleMigration.analyze()` — migration.ts 46
      - `findRouterTestingModuleUsages()` — utils.ts 498 — *TestBed.configureTestingModule の imports*
      - `processRouterTestingModuleUsage()` — utils.ts 593 — *RouterModule・provideLocationMocks*

## テストと直し方

spec はどちらも test/ にあり、`SchematicTestRunner` で bundles の本物の .cjs を走らせる形です（[第 19 回](19-mig-testing.md)）。

- test/standalone\_routes\_spec.ts：`describe('route lazy loading migration')`（:16）。it が 18 本と、`xit`（:812）（型を書かずに別ファイルに置いたルート。止めてある）が 1 本。stub の d.ts（:58〜70）には `Route`・`Routes` しか無く、`RouterModule` も `Router` も `provideRouter` も宣言されていません。
- test/router-testing-module-migration\_spec.ts：`describe('Router testing migration')`（:16）、その中の `describe('RouterTestingModule')`（:94）・`'Multiple TestBed calls'`（:382）・`'No-op scenarios'`（:473）・`'provideLocationMocks support'`（:512）。it は 19 本です。

📄 `angular/packages/core/schematics/test/router-testing-module-migration_spec.ts` L137–174 （▶ の行: 147, 154, 158, 168）

```ts
137 │     it('should migrate RouterTestingModule without routes to RouterModule', async () => {
138 │       writeFile(
139 │         '/app.component.spec.ts',
140 │         `
141 │           import { TestBed } from '@angular/core/testing';
142 │           import { RouterTestingModule } from '@angular/router/testing';
143 │ 
144 │           describe('AppComponent', () => {
145 │             beforeEach(() => {
146 │               TestBed.configureTestingModule({
147 ▶                 imports: [RouterTestingModule]
148 │               });
149 │             });
150 │           });
151 │         `,
152 │       );
153 │ 
154 ▶       await runMigration();
155 │ 
156 │       const content = tree.readContent('/app.component.spec.ts');
157 │ 
158 ▶       expect(content).not.toContain('RouterTestingModule');
159 │ 
160 │       expect(stripWhitespace(content)).toContain(
161 │         stripWhitespace(`
162 │           import { RouterModule } from '@angular/router';
163 │           import { TestBed } from '@angular/core/testing';
164 │ 
165 │           describe('AppComponent', () => {
166 │             beforeEach(() => {
167 │               TestBed.configureTestingModule({
168 ▶                 imports: [RouterModule]
169 │               });
170 │             });
171 │           });
172 │         `),
173 │       );
174 │     });
```
*147 行目の RouterTestingModule が 168 行目で forRoot の無い RouterModule になる（7 節の表の 1 行目）*

📄 `ターミナル（../angular で）`

```
cd ../angular
# route-lazy-loading（test/standalone_routes_spec.ts）
pnpm bazel test //packages/core/schematics/test:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=route lazy loading migration'
# router-testing-module-migration（test/router-testing-module-migration_spec.ts）
pnpm bazel test //packages/core/schematics/test:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=Router testing migration'
# 16 shard に分かれるので、出力の「Ran N of M specs」の N を全部足す（0 件でも PASSED になる）
```

| ターゲット | フィルタ | 結果（2026-11-03） |
| --- | --- | --- |
| //packages/core/schematics/test:test | route lazy loading migration | 16 shard の Ran の合計 19（18 passed、1 pending = xit）、PASSED in 2.0s |
| //packages/core/schematics/test:test | Router testing migration | Ran の合計 19、0 failures、PASSED in 1.7s |

直すとしたら、の入口です（本家に PR を出すことは勧めません。手元のブランチで確かめるところまで）。

- 名前空間 import の例外：to-lazy-routes.ts の `migrateRoute` の 300〜311 行目。`componentImport` が見つからないときに「飛ばした」に入れる形にし、spec の 906〜913 行目の TODO を it にする。
- import 宣言ごと消える：`migrateRoutesArray` の 201〜203 行目。消す前に宣言の中のほかの名前と、ファイルの中の残りの参照を見る。spec は standalone\_routes\_spec.ts に「同じ import に別の名前がある」形を足す。
- resetConfig：util.ts の `isRouterCallExpression` の 100 行目。spec の stub に `export declare class Router` を足すと、今の it「should support Router.resetConfig」（:363）が落ちる形になります（上のとおり、本物のバンドルではそうなりました）。
- provideLocationMocks の重複：utils.ts の `migrateToRouterModule` の 427〜432 行目。spec は :782 の it に `RouterTestingModule` を足した形を新しく置く。

route-lazy-loading と router-testing-module-migration には、2026-11-03 の時点で開いている issue はありません（[第 20 回](20-mig-issues.md)）。最近の修正は 8fa66173523（import を名前の完全一致で探す。tomer953）と 4133b08d935（aparziale）です。

## 聞かれそうな質問

**Q. route-lazy-loading を走らせたのに「Could not find any files to migrate」と言われました。ファイルはあるのに？**

index.ts の 53〜57 行目は、変えたルートと飛ばしたルートが両方 0 のときに例外にします。同じファイルのコンポーネント（to-lazy-routes.ts 277 行目）、もう `loadComponent` のルート（252 行目）、クラスが見つからないもの（258 行目）は、どちらにも数えません。ルートの配列が見つからない場合（たとえば `resetConfig` を本物の `Router` の型で呼んでいる場合、3 節）も同じ文になります。

**Q. NgModule に宣言したコンポーネントのルートはどうなりますか？**

to-lazy-routes.ts の 263〜265 行目で「飛ばした」に入り、index.ts の 64〜71 行目で `path` とファイル名が一覧に出ます。standalone にしてからもう一度走らせるよう案内が出ます（73〜75 行目）。

**Q. loadComponent の `.then(m => m.X)` が付かないことがあるのはなぜ？**

313 行目でクラスに `export default` が付いているかを見て、付いていれば `import('./x')` だけにします。Router の `loadComponent` は default export をそのまま受け取れるからです。

**Q. RouterTestingModule のマイグレーションは provideRouter にしてくれますか？**

しません。utils.ts の 210〜235 行目のとおり、作るのは `RouterModule` か `RouterModule.forRoot(routes, options)` で、`imports` の配列に入れます（405〜419 行目）。collection.json の説明と README の 9 行目は provideRouter と書いていますが、コードと合っていません。

**Q. spec ではないテスト用のヘルパーに RouterTestingModule が残りました。**

index.ts の 29 行目で `.spec.ts` で終わるファイルだけを対象にしているからです。また utils.ts の 539 行目で、`imports` が配列リテラルでない呼び出しも飛ばします。

## 読み終えて

- route-lazy-loading は古い形。ルートの配列を 5 つの形で集め、ルートごとに「component がある → クラスが見つかる → standalone → 別ファイル → import が見つかる」の順に判定し、報告するのは NgModule のものだけ。
- import は名前の完全一致で探し、見つけた import 宣言を丸ごと消す。名前空間 import は例外、ほかの名前が同じ宣言にあると壊れる（本物のバンドルで確認）。
- router-testing-module-migration は Tsurge の Funnel。.spec.ts の `TestBed.configureTestingModule` の `imports` の配列だけを見て、`RouterModule`（routes があれば `forRoot`）に作り直す。
- `provideLocationMocks()` は `SpyLocation` の import と `.urlChanges` の両方があるときだけ足す。すでにあるかは見ていない。
- spec の stub が本物の型と違う（Router が無い）と、本物では通らない分岐が spec では通ることがある。

---

← 前: [使っていない import を消す・CommonModule を分ける](15-mig-cleanup-imports.md)  
次: [v22 の ng update（1）：既定が変わったものを元に戻す](17-mig-v22-defaults.md) →
