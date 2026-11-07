[目次](../README.md) › [マイグレーションの内側](README.md) › 第 17 回 / 全 20 回

# v22 の ng update（1）：既定が変わったものを元に戻す

> v22 で既定が変わった 4 つに、前の動きを残す設定を足すマイグレーション: change-detection-eager（OnPush が既定になったので ChangeDetectionStrategy.Eager を足す）、strict-templates-default（tsconfig に strictTemplates: false）、http-xhr-backend（withXhr）、incremental-hydration（withNoIncrementalHydration）。それぞれが何を見て足し、何があれば足さないか。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-v22-defaults)

---

v22 では、何も書かなかったときの動きが 4 つ変わりました。コンポーネントは OnPush、テンプレートの型チェックは strict、`provideHttpClient()` の通信は fetch、`provideClientHydration()` はインクリメンタルハイドレーションあり、です。`ng update` はこの 4 つそれぞれに「前の動きを書いて残す」マイグレーションを走らせます。この章では、4 つがそれぞれ**何を見て足すか、何があれば足さないか**を行で確かめ、最後に表にまとめます。

読む対象は `packages/core/schematics/migrations/` の change-detection-eager/migration.ts、strict-templates-default/index.ts、http-xhr-backend/migration.ts、incremental-hydration/migration.ts と、それぞれの spec です。

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
16. [16. ルーティング](16-mig-routing.md)
17. **17. v22（1）既定**（この章）
18. [18. v22（2）?.](18-mig-v22-safe-navigation.md)
19. [19. テスト](19-mig-testing.md)
20. [20. issue と PR を読む](20-mig-issues.md)

4 つとも migrations.json の `version` は 22.0.0 で、v21 から上げるときに 1 回ずつ走ります（どれを走らせるかを CLI が決める仕組みは[ng add と ng update の章](../cli/16-cli-add-update.md)、migrations.json と bundles は[第 2 回](02-mig-entry-bundles.md)）。change-detection-eager・http-xhr-backend・incremental-hydration は Tsurge の Funnel（[第 4 回](04-mig-tsurge.md)）、strict-templates-default は TS のファイルを見ない古い形の Rule です。

## 1. change-detection-eager：何も書いていないコンポーネントに Eager を足す

v22 では `changeDetection` を書かないコンポーネントが OnPush になりました（OnPush で何が飛ばされるかは[OnPush と markForCheck の章](../cd/04-cd-onpush-markforcheck.md)）。前と同じく毎回チェックさせたいなら `ChangeDetectionStrategy.Eager`（前の `Default` と同じ値 1）を書きます。マイグレーションはそれを機械的に足します。

📄 `angular/packages/core/schematics/migrations/change-detection-eager/migration.ts` L48–86 （▶ の行: 48, 51, 55–56, 60, 62, 73–74, 80, 84）

```ts
48 ▶     for (const sf of sourceFiles) {
49 │       const file = projectFile(sf, info);
50 │ 
51 ▶       if (this.config.shouldMigrate && !this.config.shouldMigrate(file)) {
52 │         continue;
53 │       }
54 │ 
55 ▶       ts.forEachChild(sf, (node) => {
56 ▶         if (!ts.isClassDeclaration(node)) {
57 │           return;
58 │         }
59 │ 
60 ▶         const decorators = getAngularDecorators(typeChecker, ts.getDecorators(node) || []);
61 │         const componentDecorator = decorators.find(
62 ▶           (d) => d.name === 'Component' && d.moduleName === '@angular/core',
63 │         );
64 │ 
65 │         if (!componentDecorator) {
66 │           return;
67 │         }
68 │ 
69 │         // The helper `getAngularDecorators` guarantees that `node` is `CallExpressionDecorator`.
70 │         // So `componentDecorator.node.expression` is `ts.CallExpression`.
71 │         const callExpression = componentDecorator.node.expression;
72 │         if (
73 ▶           callExpression.arguments.length !== 1 ||
74 ▶           !ts.isObjectLiteralExpression(callExpression.arguments[0])
75 │         ) {
76 │           return;
77 │         }
78 │ 
79 │         const metadata = callExpression.arguments[0] as ts.ObjectLiteralExpression;
80 ▶         const changeDetectionProp = metadata.properties.find(
81 │           (p) =>
82 │             ts.isPropertyAssignment(p) &&
83 │             (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
84 ▶             p.name.text === 'changeDetection',
85 │         ) as ts.PropertyAssignment | undefined;
86 │ 
```

1. **48〜53 行目：Tsurge が渡すファイルを順に**

   index.ts は `new ChangeDetectionEagerMigration()` を設定なしで作るので、51 行目の `shouldMigrate` は無く、build と test の tsconfig に入るすべての .ts を見ます。
2. **55 行目：`ts.forEachChild(sf, ...)` は「ファイルの直下」だけ**

   中で再帰していないので、関数や `describe(...)` の中で宣言したクラスは見ません（下の warn）。
3. **60〜63 行目：`@angular/core` の `@Component` か**

   `getAngularDecorators` は import をたどってデコレーターの出どころを調べる共通部品なので、`import {Component as C}` でも当たります。
4. **72〜77 行目：引数が 1 つのオブジェクトリテラルのときだけ**

   `@Component(SHARED_META)` のような書き方は飛ばします。
5. **80〜85 行目：`changeDetection` のプロパティを探す**

   キーが識別子か文字列（`'changeDetection'`）のどちらでも当たります。

📄 `angular/packages/core/schematics/migrations/change-detection-eager/migration.ts` L87–127 （▶ の行: 87, 90, 97, 107–110, 112–113）

```ts
 87 ▶         if (!changeDetectionProp) {
 88 │           // Property missing. Add it.
 89 │ 
 90 ▶           const changeDetectionStrategyExpr = importManager.addImport({
 91 │             exportModuleSpecifier: '@angular/core',
 92 │             exportSymbolName: 'ChangeDetectionStrategy',
 93 │             requestedFile: sf,
 94 │           });
 95 │ 
 96 │           // Print the identifier
 97 ▶           const exprText = printer.printNode(
 98 │             ts.EmitHint.Unspecified,
 99 │             changeDetectionStrategyExpr,
100 │             sf,
101 │           );
102 │ 
103 │           const properties = metadata.properties;
104 │           let insertPos: number;
105 │           let toInsert: string;
106 │ 
107 ▶           if (properties.length > 0) {
108 ▶             const lastProp = properties[properties.length - 1];
109 ▶             insertPos = lastProp.getStart();
110 ▶             toInsert = `changeDetection: ${exprText}.Eager,\n${getLeadingLineWhitespaceOfNode(lastProp)}`;
111 │           } else {
112 ▶             insertPos = metadata.getStart() + 1;
113 ▶             toInsert = `\n  changeDetection: ${exprText}.Eager\n`;
114 │           }
115 │ 
116 │           replacements.push(
117 │             new Replacement(
118 │               projectFile(sf, info),
119 │               new TextUpdate({
120 │                 position: insertPos,
121 │                 end: insertPos,
122 │                 toInsert: toInsert,
123 │               }),
124 │             ),
125 │           );
126 │           return;
127 │         }
```

87 行目、プロパティが無ければ足します。90〜94 行目で `ChangeDetectionStrategy` の import を頼み、97〜101 行目で返ってきた識別子を印刷します（すでに別名で import していればその名前になる。spec の it「should handle aliased imports when adding property」、:135）。107〜110 行目が「どこに入れるか」です。**最後のプロパティの前**（`lastProp.getStart()`）に `changeDetection: X.Eager,` と改行と、最後のプロパティの行の字下げを入れます。最後のプロパティの後ろに入れると、元に末尾のカンマがあるかを文字列で探す必要があります。TypeScript の AST はカンマを持たないからです。f01901d7668（2026-03-05、crisbeto）がその探し方をやめて、この形にしました。112〜113 行目、`@Component({})` のように空なら `{` の直後に入れます。

📄 `angular/packages/core/schematics/migrations/change-detection-eager/migration.spec.ts` L89–111 （▶ の行: 98–100, 109）

```ts
 89 │   it('should handle existing other properties correctly', async () => {
 90 │     const {fs} = await runTsurgeMigration(new ChangeDetectionEagerMigration(), [
 91 │       {
 92 │         name: absoluteFrom('/index.ts'),
 93 │         isProgramRootFile: true,
 94 │         contents: `
 95 │           import { Component } from '@angular/core';
 96 │ 
 97 │           @Component({
 98 ▶             selector: 'app-test',
 99 ▶             template: '',
100 ▶             standalone: true
101 │           })
102 │           export class TestComponent {}
103 │         `,
104 │       },
105 │     ]);
106 │ 
107 │     const content = fs.readFile(absoluteFrom('/index.ts'));
108 │     expect(content).toMatch(
109 ▶       /template: '',\n\s+changeDetection: ChangeDetectionStrategy\.Eager,\n\s+standalone: true/,
110 │     );
111 │   });
```
*99 行目の template と 100 行目の standalone の間に入る（109 行目の正規表現）*

📄 `angular/packages/core/schematics/migrations/change-detection-eager/migration.ts` L129–174 （▶ の行: 130, 136, 142, 149, 153, 157, 159–160, 169, 171）

```ts
129 │         // Check if explicitly set to Default.
130 ▶         if (!ts.isPropertyAccessExpression(changeDetectionProp.initializer)) {
131 │           return;
132 │         }
133 │ 
134 │         const initializer = changeDetectionProp.initializer;
135 │         // Best effort check for ChangeDetectionStrategy.Default
136 ▶         if (!ts.isIdentifier(initializer.expression) || initializer.name.text !== 'Default') {
137 │           return;
138 │         }
139 │ 
140 │         // Verify it is indeed ChangeDetectionStrategy.
141 │         // We can check if the symbol of the expression is imported from @angular/core and named ChangeDetectionStrategy.
142 ▶         const symbol = typeChecker.getSymbolAtLocation(initializer.expression);
143 │ 
144 │         if (!symbol || !symbol.declarations || symbol.declarations.length === 0) {
145 │           return;
146 │         }
147 │ 
148 │         const declaration = symbol.declarations[0];
149 ▶         if (!ts.isImportSpecifier(declaration)) {
150 │           return;
151 │         }
152 │ 
153 ▶         const propertyName = declaration.propertyName?.text ?? declaration.name.text;
154 │         const importDecl = declaration.parent.parent.parent;
155 │ 
156 │         if (
157 ▶           !ts.isImportDeclaration(importDecl) ||
158 │           !ts.isStringLiteral(importDecl.moduleSpecifier) ||
159 ▶           importDecl.moduleSpecifier.text !== '@angular/core' ||
160 ▶           propertyName !== 'ChangeDetectionStrategy'
161 │         ) {
162 │           return;
163 │         }
164 │ 
165 │         replacements.push(
166 │           new Replacement(
167 │             projectFile(sf, info),
168 │             new TextUpdate({
169 ▶               position: initializer.name.getStart(),
170 │               end: initializer.name.getEnd(),
171 ▶               toInsert: 'Eager',
172 │             }),
173 │           ),
174 │         );
```

プロパティがあるときは、`X.Default` のときだけ `Default` の名前の部分を `Eager` に置き換えます（169〜171 行目）。130 行目でプロパティアクセスでなければ（変数を書いている）、136 行目で名前が `Default` でなければ（`OnPush` や `Eager`）何もしません。142〜163 行目で、`X` が `@angular/core` の `ChangeDetectionStrategy` を import したもの（153 行目で別名を戻す）かを確かめます。

> [!NOTE]
> **ポイント**
>
> このマイグレーションが何度走っても同じ結果になる（冪等）のは、87 行目と 136 行目のおかげです。1 回目で `Eager` を足したコンポーネントは、2 回目はプロパティがあり、名前が `Default` でもないので触りません。同じ理由で、v22 で不要になった `OnPush` の記述を消すマイグレーションはありません。#69220 で JeanMeche は「どのマイグレーションを走らせたかを記録する手段がまだ無く、`OnPush` があることを Eager のマイグレーションの冪等さに使っている」と答えて閉じています（NOT\_PLANNED）。

> [!WARNING]
> **ハマりどころ**
>
> 55 行目がファイルの直下しか見ないので、spec の `describe` の中で宣言したテスト用のホストコンポーネントには `Eager` が足されず、v22 では OnPush になります。本物のバンドル（bazel-bin の change-detection-eager.cjs）を一時ディレクトリで走らせて確かめました。直下の `Top` には足され、`describe` の中の `TestHost` はそのままでした。`gh search issues` では同じ報告は見つかりませんでした（2026-11-03）。

## 2. strict-templates-default：tsconfig に strictTemplates: false を書く

v22 で `strictTemplates` の既定が真になりました（tsconfig の値が TypeCheckingConfig になるまでは[strictTemplates の章](../typecheck/02-typecheck-config.md)）。このマイグレーションは TS のファイルを読まず、tsconfig の JSON だけを書き換えます。

📄 `angular/packages/core/schematics/migrations/strict-templates-default/index.ts` L42–75 （▶ の行: 47–48, 50, 54, 56–57, 59, 64, 66, 70–71）

```ts
42 │ /**
43 │  * Migration that adds `strictTemplates: false` to `tsconfig.json` files.
44 │  */
45 │ export function migrate(): Rule {
46 │   return async (tree) => {
47 ▶     const {buildPaths, testPaths} = await getProjectTsConfigPaths(tree, {
48 ▶       angularBuildersOnly: true,
49 │     });
50 ▶     const allPaths = [...new Set([...buildPaths, ...testPaths])];
51 │ 
52 │     for (const tsconfigPath of allPaths) {
53 │       const json = new JSONFile(tree, tsconfigPath);
54 ▶       const compilerOptions = json.get(['compilerOptions']);
55 │ 
56 ▶       if (
57 ▶         !compilerOptions ||
58 │         typeof compilerOptions !== 'object' ||
59 ▶         Object.keys(compilerOptions).length === 0
60 │       ) {
61 │         continue;
62 │       }
63 │ 
64 ▶       const angularOptions = getResolvedAngularCompilerOptions(tree, tsconfigPath);
65 │ 
66 ▶       if (angularOptions['strictTemplates'] !== undefined) {
67 │         continue;
68 │       }
69 │ 
70 ▶       if (json.get(['angularCompilerOptions', 'strictTemplates']) === undefined) {
71 ▶         json.modify(['angularCompilerOptions', 'strictTemplates'], false);
72 │       }
73 │     }
74 │   };
75 │ }
```

1. **47〜50 行目：angular.json の build と test の tsconfig を集める**

   48 行目の `angularBuildersOnly: true` は f72600eaddf（2026-07-20、#69837）で入りました。Angular のビルダーを使わない Nx のライブラリなどの tsconfig を書き換えないためです（`getProjectTsConfigPaths` は[第 3 回](03-mig-program.md)）。
2. **54〜62 行目：`compilerOptions` が無いか空の tsconfig は飛ばす**

   `files` と `references` だけの solution-style の tsconfig.json などです。
3. **64〜68 行目：extends をたどった結果に `strictTemplates` があれば何もしない**

   真でも偽でも、誰かが書いていれば触りません。
4. **70〜71 行目：そのファイルに `false` を書く**

   `JSONFile.modify` は jsonc-parser で該当の場所だけを書き換えるので、コメントや並びは残ります（spec の it「should handle tsconfig with comments」、:115）。

📄 `angular/packages/core/schematics/migrations/strict-templates-default/index.ts` L15–40 （▶ の行: 16, 18–19, 21, 26, 28, 30, 33–35）

```ts
15 │ function getResolvedAngularCompilerOptions(tree: any, tsconfigPath: string): Record<string, any> {
16 ▶   if (!tree.exists(tsconfigPath)) return {};
17 │ 
18 ▶   const sourceFile = ts.readJsonConfigFile(tsconfigPath, (path) => tree.readText(path));
19 ▶   const config = ts.convertToObject(sourceFile, []);
20 │ 
21 ▶   let angularOptions = config.angularCompilerOptions || {};
22 │ 
23 │   // Manually resolve inheritance for Angular-specific options.
24 │   // Since the TypeScript API doesn't perform a deep merge of custom/non-standard keys
25 │   // during config parsing, we must traverse the inheritance chain manually
26 ▶   if (config.extends) {
27 │     // Management extends property...
28 ▶     const parentPath = join(dirname(tsconfigPath), config.extends);
29 │ 
30 ▶     const parentOptions = getResolvedAngularCompilerOptions(tree, parentPath);
31 │ 
32 │     // Merge: the options of the current file overwrite those of the parent
33 ▶     angularOptions = {
34 ▶       ...parentOptions,
35 ▶       ...angularOptions,
36 │     };
37 │   }
38 │ 
39 │   return angularOptions;
40 │ }
```

23〜25 行目のコメントのとおり、TypeScript の設定の解析は `angularCompilerOptions` のような知らないキーを extends で深くは合わせないので、自分でたどります。18〜19 行目で JSON（コメント可）を読み、26 行目で `extends` があれば 28 行目で `join(dirname(tsconfigPath), config.extends)` の場所を 30 行目で再帰して読み、33〜36 行目で親の上に子を重ねます。

📄 `angular/packages/core/schematics/migrations/strict-templates-default/migration.spec.ts` L134–157 （▶ の行: 139, 147, 156）

```ts
134 │   it('should not add strictTemplates to child tsconfig that inherits it from parent', async () => {
135 │     tree.create(
136 │       '/tsconfig.json',
137 │       JSON.stringify({
138 │         compilerOptions: {target: 'es2020'},
139 ▶         angularCompilerOptions: {strictTemplates: true},
140 │         include: ['src/**/*.d.ts'],
141 │       }),
142 │     );
143 │ 
144 │     tree.create(
145 │       '/tsconfig.app.json',
146 │       JSON.stringify({
147 ▶         extends: './tsconfig.json',
148 │         compilerOptions: {outDir: './out-tsc/app'},
149 │       }),
150 │     );
151 │ 
152 │     await migrate()(tree, {} as any);
153 │ 
154 │     // The child MUST NOT receive strictTemplates because it inherits it
155 │     const childTsconfig = parseConfig(tree, '/tsconfig.app.json');
156 ▶     expect(childTsconfig.angularCompilerOptions).toBeUndefined();
157 │   });
```

> [!WARNING]
> **ハマりどころ**
>
> 28 行目は、tsconfig の `extends` の書き方のうち「拡張子つきの相対パスの文字列」しか想定していません。本物のバンドルで確かめた 2 つの形です（main の 92c7e870caa でもこのファイルは同じ）。
>
> - `"extends": ["./tsconfig.json"]`（TypeScript 5.0 からの配列）：`join` が `The "path" argument must be of type string. Received an instance of Array` を投げ、マイグレーションが止まります。
> - `"extends": "./tsconfig"`（TypeScript は .json を補って読む）：16 行目で Tree に無いと判定して親を `{}` とみなし、親に `strictTemplates: true` があるのに子に `false` を書きます。子の値が勝つので、型チェックが strict でなくなります。
>
> `"extends": "@tsconfig/strictest/tsconfig.json"` のようなパッケージの名前も、相対パスとして `join` されて見つからず `{}` になります（そのパッケージが `angularCompilerOptions` を持つことはまず無いので、結果は変わりません）。

### 動かしてみる：どの tsconfig に false が書かれるか

> **🧪 getResolvedAngularCompilerOptions と migrate の判定（移植）**
>
> index.ts の 15〜75 行目の判定を移植したものです。angular.json の tsConfig は /tsconfig.app.json だけ、とします。本物は TypeScript の `readJsonConfigFile` と `JSONFile` でコメント付きの JSON も読みますが、ここは `JSON.parse` なのでコメントは書けません。`extends` を `["./tsconfig.json"]` や `"./tsconfig"` に変えて試してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/mig-v22-defaults)

## 3. http-xhr-backend：provideHttpClient() に withXhr() を足す

v22 で `provideHttpClient()` の既定の `HttpBackend` が `FetchBackend` になりました（`withFetch()` は deprecated）。XHR の `HttpXhrBackend` にしかできないこと（アップロードの進捗など）は[HttpXhrBackend の章](../http/07-http-backend-xhr.md)にあります。`HttpClientModule` の providers は `provideHttpClient(withInterceptorsFromDi(), withXhr())` と書かれているので、変わるのは `provideHttpClient()` を直接呼んでいるアプリだけです（[provideHttpClient の章](../http/02-http-provide.md)）。

📄 `angular/packages/core/schematics/migrations/http-xhr-backend/migration.ts` L42–79 （▶ の行: 43–44, 59–60, 66, 70, 75, 77–79）

```ts
42 │ /**
43 ▶  * Prior to v22, provideHttpClient() had a Xhr backend by default. In v22, the default was switched to a Fetch backend.
44 ▶  * This migration adds the withXhr() option to any provideHttpClient() calls that do not already have either withFetch() or withXhr() specified,
45 │  * to preserve the Xhr backend behavior.
46 │  */
47 │ export class XhrBackendMigration extends TsurgeFunnelMigration<
48 │   CompilationUnitData,
49 │   CompilationUnitData
50 │ > {
51 │   constructor(private readonly config: MigrationConfig = {}) {
52 │     super();
53 │   }
54 │ 
55 │   override async analyze(info: ProgramInfo): Promise<Serializable<CompilationUnitData>> {
56 │     const replacements: Replacement[] = [];
57 │     const importManager = new ImportManager();
58 │ 
59 ▶     for (const sourceFile of info.sourceFiles) {
60 ▶       const walk = (node: ts.Node): void => {
61 │         const file = projectFile(sourceFile, info);
62 │         if (this.config.shouldMigrate && !this.config.shouldMigrate(file)) {
63 │           return;
64 │         }
65 │ 
66 ▶         const httpImports = getNamedImports(sourceFile, HTTP);
67 │         if (!httpImports) {
68 │           return;
69 │         }
70 ▶         const importSpecifier = getImportSpecifier(sourceFile, HTTP, provideHttpClient);
71 │         if (!importSpecifier) {
72 │           return;
73 │         }
74 │ 
75 ▶         node.forEachChild(walk);
76 │ 
77 ▶         if (!ts.isCallExpression(node)) return;
78 ▶         if (!ts.isIdentifier(node.expression)) return;
79 ▶         if (node.expression.text !== 'provideHttpClient') return;
```

1. **66〜73 行目：`@angular/common/http` から `provideHttpClient` を import しているファイルだけ**

   この検査はノードごとに毎回走りますが、結果はファイルで決まるので、ファイルに import が無ければ最初のノードで終わります。
2. **75 行目：子を先に見る**

   引数の中の呼び出しも同じ `walk` で見ます。
3. **77〜79 行目：識別子 `provideHttpClient` の呼び出し**

   名前の文字列で見ます。`http.provideHttpClient()` のような名前空間 import の形は対象外です。

📄 `angular/packages/core/schematics/migrations/http-xhr-backend/migration.ts` L80–117 （▶ の行: 80, 87, 95, 100, 102, 106, 108）

```ts
 80 ▶         const withFetchNode = node.arguments.find((arg) => {
 81 │           return (
 82 │             ts.isCallExpression(arg) &&
 83 │             ts.isIdentifier(arg.expression) &&
 84 │             arg.expression.text === WITH_FETCH
 85 │           );
 86 │         });
 87 ▶         const withXhrNode = node.arguments.find((arg) => {
 88 │           return (
 89 │             ts.isCallExpression(arg) &&
 90 │             ts.isIdentifier(arg.expression) &&
 91 │             arg.expression.text === WITH_XHR
 92 │           );
 93 │         });
 94 │ 
 95 ▶         if (!withFetchNode && !withXhrNode) {
 96 │           replacements.push(
 97 │             new Replacement(
 98 │               projectFile(sourceFile, info),
 99 │               new TextUpdate({
100 ▶                 position: node.arguments.pos,
101 │                 end: node.arguments.pos,
102 ▶                 toInsert: node.arguments.length ? 'withXhr(), ' : 'withXhr()',
103 │               }),
104 │             ),
105 │           );
106 ▶           importManager.addImport({
107 │             exportModuleSpecifier: HTTP_PACKAGE,
108 ▶             exportSymbolName: WITH_XHR,
109 │             requestedFile: sourceFile,
110 │           });
111 │         }
112 │       };
113 │       sourceFile.forEachChild(walk);
114 │     }
115 │ 
116 │     applyImportManagerChanges(importManager, replacements, info.sourceFiles, info);
117 │     return confirmAsSerializable({replacements});
```

80〜93 行目で引数に `withFetch()` か `withXhr()` の呼び出しがあるかを見て、95 行目で**どちらも無ければ**、100 行目の `node.arguments.pos`（最初の引数の前、`(` の直後）に `withXhr(), `（引数が無ければ `withXhr()`）を入れ、106〜110 行目で import を足します。`withFetch()` がある呼び出しを触らないのは、12b3a1a755d（2026-03-27）が「`withFetch()` を消す」処理を外してからです（同じ commit で「冪等に」と書いています）。

📄 `angular/packages/core/schematics/migrations/http-xhr-backend/http-xhr-backend.spec.ts` L39–60 （▶ の行: 49, 57, 59）

```ts
39 │   it('should update provideHttpClient without withFetch', async () => {
40 │     const {fs} = await runTsurgeMigration(new XhrBackendMigration(), [
41 │       {
42 │         name: absoluteFrom('/index.ts'),
43 │         isProgramRootFile: true,
44 │         contents: `
45 │         import {AppConfig} from '@angular/core';
46 │         import {provideHttpClient, withInterceptorsFromDi, withXsrfConfiguration} from '@angular/common/http';
47 │ 
48 │         const config: AppConfig = [
49 ▶           provideHttpClient(withInterceptorsFromDi(), withXsrfConfiguration({})),
50 │         ]
51 │           `,
52 │       },
53 │     ]);
54 │ 
55 │     const actual = fs.readFile(absoluteFrom('/index.ts'));
56 │     expect(actual).toContain(
57 ▶       'provideHttpClient(withXhr(), withInterceptorsFromDi(), withXsrfConfiguration({}))',
58 │     );
59 ▶     expect(actual).toMatch(/import \{.*withXhr.*\}/);
60 │   });
```

> [!NOTE]
> **ポイント**
>
> migrations.json の説明は「HttpXhrBackend を使っているときに withXhr を足す」ですが、43〜45 行目のコメントと 95 行目のとおり、コードは `HttpXhrBackend` の使用を調べません。`withFetch()` も `withXhr()` も無いすべての `provideHttpClient()` に足します（#68500 の報告者は「とっくに fetch に移ったプロジェクトに withXhr が入った」とも書いています）。

> [!WARNING]
> **ハマりどころ**
>
> 子のインジェクタで `provideHttpClient(withRequestsMadeViaParent())` と書いていると、このマイグレーションは `provideHttpClient(withXhr(), withRequestsMadeViaParent())` にします（本物のバンドルで確認）。ところが bb78286e5e7（2026-07-31）から、`provideHttpClient` は開発モードで `withRequestsMadeViaParent()` と `withFetch()` / `withXhr()` の組を「Configuration error」として投げます（[provideHttpClient の章](../http/02-http-provide.md)の開発モードの検査）。親に要求を回すなら、子で backend を選ぶ意味が無いからです。マイグレーションの 80〜95 行目はこの組み合わせを見ていません。`gh search` で同じ報告は見つかりませんでした（2026-11-03）。

## 4. incremental-hydration：provideClientHydration() に withNoIncrementalHydration() を足す

v22 で `provideClientHydration()` はインクリメンタルハイドレーションを既定で有効にし、`withIncrementalHydration()` は deprecated、外すには `withNoIncrementalHydration()` を書きます（[provideClientHydration の章](../platform/07-hydration-provide.md)、仕組みは[インクリメンタルハイドレーションの章](../platform/15-incremental-hydration.md)）。

📄 `angular/packages/core/schematics/migrations/incremental-hydration/migration.ts` L39–60 （▶ の行: 40, 42–44, 51–52, 55）

```ts
39 │     for (const sf of sourceFiles) {
40 ▶       ts.forEachChild(sf, function visit(node: ts.Node) {
41 │         if (
42 ▶           ts.isCallExpression(node) &&
43 ▶           ts.isIdentifier(node.expression) &&
44 ▶           node.expression.text === 'provideClientHydration'
45 │         ) {
46 │           let hasIncremental = false;
47 │           let hasNoIncremental = false;
48 │           let incrementalArgNode: ts.CallExpression | null = null;
49 │ 
50 │           for (const arg of node.arguments) {
51 ▶             if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression)) {
52 ▶               if (arg.expression.text === 'withIncrementalHydration') {
53 │                 hasIncremental = true;
54 │                 incrementalArgNode = arg;
55 ▶               } else if (arg.expression.text === 'withNoIncrementalHydration') {
56 │                 hasNoIncremental = true;
57 │               }
58 │             }
59 │           }
60 │ 
```

📄 `angular/packages/core/schematics/migrations/incremental-hydration/migration.ts` L61–88 （▶ の行: 61, 63, 69, 71–72, 86）

```ts
61 ▶           if (!hasIncremental && !hasNoIncremental) {
62 │             // Add withNoIncrementalHydration()
63 ▶             const withNoIncrementalExpr = importManager.addImport({
64 │               exportModuleSpecifier: '@angular/platform-browser',
65 │               exportSymbolName: 'withNoIncrementalHydration',
66 │               requestedFile: sf,
67 │             });
68 │ 
69 ▶             const exprText = printer.printNode(ts.EmitHint.Unspecified, withNoIncrementalExpr, sf);
70 │ 
71 ▶             const insertPos = node.arguments.end;
72 ▶             const toInsert = node.arguments.length > 0 ? `, ${exprText}()` : `${exprText}()`;
73 │ 
74 │             replacements.push(
75 │               new Replacement(
76 │                 projectFile(sf, info),
77 │                 new TextUpdate({
78 │                   position: insertPos,
79 │                   end: insertPos,
80 │                   toInsert: toInsert,
81 │                 }),
82 │               ),
83 │             );
84 │           }
85 │         }
86 ▶         ts.forEachChild(node, visit);
87 │       });
88 │     }
```

42〜44 行目、識別子の名前が `provideClientHydration` の呼び出しを、import を確かめずに見つけます。50〜59 行目で引数に `withIncrementalHydration()` か `withNoIncrementalHydration()` があるかを見て、61 行目でどちらも無ければ、71 行目の `node.arguments.end`（最後の引数の後ろ）に `, withNoIncrementalHydration()` を入れます。xhr と違って、こちらは**後ろ**に入れます。

55〜56 行目の `withNoIncrementalHydration` の検査は b723734b72c（2026-05-01、#68500）で足されました。それまでは `withIncrementalHydration` しか見ていなかったので、`ng update --next` で next 版ごとにマイグレーションが走るたびに 1 つずつ増えていました。48 行目の `incrementalArgNode` は代入されるだけで使われていません。

📄 `angular/packages/core/schematics/migrations/incremental-hydration/migration.spec.ts` L55–71 （▶ の行: 63, 69–70）

```ts
55 │   it('should not add withNoIncrementalHydration() if withNoIncrementationHydration is already present', async () => {
56 │     const {fs} = await runTsurgeMigration(new IncrementalHydrationMigration(), [
57 │       {
58 │         name: absoluteFrom('/index.ts'),
59 │         isProgramRootFile: true,
60 │         contents: `
61 │           import { provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';
62 │ 
63 ▶           provideClientHydration(withNoIncrementalHydration());
64 │         `,
65 │       },
66 │     ]);
67 │ 
68 │     const content = fs.readFile(absoluteFrom('/index.ts'));
69 ▶     expect(content).toContain('provideClientHydration(withNoIncrementalHydration())');
70 ▶     expect(content).not.toContain('withIncrementalHydration()');
71 │   });
```
*#68500 を直したときに足された it。すでに withNoIncrementalHydration() があれば足さない*

## 5. 4 つをまとめる

| マイグレーション | 見る場所 | 足す・変える | 足さない | 名前の確かめ方 |
| --- | --- | --- | --- | --- |
| change-detection-eager | build と test の tsconfig の .ts の、**ファイル直下**のクラスの `@Component({...})` | `changeDetection` が無い → 最後のプロパティの前に `X.Eager,`。`X.Default` → `X.Eager` | OnPush・Eager・変数で書いたもの、引数がオブジェクトでないもの、関数や describe の中のクラス | デコレーターと `ChangeDetectionStrategy` の import の出どころを型で確かめる |
| strict-templates-default | Angular のビルダーの build と test の tsconfig（JSON） | extends をたどっても `strictTemplates` が無い → そのファイルに `false` | `compilerOptions` が空・無い tsconfig、どこかに `strictTemplates` がある | —（JSON のキー）。extends は「拡張子つきの相対パスの文字列」だけたどれる |
| http-xhr-backend | `@angular/common/http` から `provideHttpClient` を import したファイル | `withFetch()` も `withXhr()` も無い → 先頭に `withXhr(), ` | `withFetch()` か `withXhr()` がある。`HttpClientModule`（もともと withXhr） | import の名前と呼び出しの識別子の文字列。`withRequestsMadeViaParent()` は見ない |
| incremental-hydration | すべての .ts の `provideClientHydration(...)` | `withIncrementalHydration()` も `withNoIncrementalHydration()` も無い → 末尾に `, withNoIncrementalHydration()` | どちらかがある | 呼び出しの識別子の文字列だけ（import を見ない） |

- 👤 `ng update @angular/core` — 利用者（v21 → v22）
  - `migrations.json の version 22.0.0 の 8 つ` — packages/core/schematics/migrations.json — *CLI が選ぶ*
    - `change-detection-eager.cjs#migrate` → `runMigrationInDevkit` — change-detection-eager/index.ts
      - `ChangeDetectionEagerMigration.analyze()` — migration.ts 38 — *直下のクラスだけ*
    - `strict-templates-default.cjs#migrate` — strict-templates-default/index.ts 45 — *JSONFile.modify*
      - `getResolvedAngularCompilerOptions()` — index.ts 15 — *extends を再帰*
    - `XhrBackendMigration.analyze()` — http-xhr-backend/migration.ts 55 — *先頭に withXhr()*
    - `IncrementalHydrationMigration.analyze()` — incremental-hydration/migration.ts 30 — *末尾に withNoIncrementalHydration()*

## テストと直し方

4 つとも spec はマイグレーションと同じディレクトリにあり、ターゲットは `//packages/core/schematics/migrations/<名前>:test` です。Tsurge の 3 つは `runTsurgeMigration`（仮想のファイルシステム）、strict-templates-default は `UnitTestTree` に JSON を置いて `migrate()(tree, {})` を直接呼びます（[第 19 回](19-mig-testing.md)）。

📄 `ターミナル（../angular で）`

```
cd ../angular
pnpm bazel test //packages/core/schematics/migrations/change-detection-eager:test \
  --nocache_test_results --test_output=all '--test_arg=--filter=ChangeDetectionEager migration'
pnpm bazel test //packages/core/schematics/migrations/strict-templates-default:test \
  --nocache_test_results --test_output=all '--test_arg=--filter=strict-templates-default migration'
pnpm bazel test //packages/core/schematics/migrations/http-xhr-backend:test \
  --nocache_test_results --test_output=all '--test_arg=--filter=http fetch backend migration'
pnpm bazel test //packages/core/schematics/migrations/incremental-hydration:test \
  --nocache_test_results --test_output=all '--test_arg=--filter=IncrementalHydration migration'
# 出力の「N specs, 0 failures」の N を見る（フィルタが 0 件に当たっても PASSED になる）
```

| spec（describe） | it | 結果（2026-11-03） |
| --- | --- | --- |
| change-detection-eager/migration.spec.ts（`'ChangeDetectionEager migration'`、:14） | 6 | 6 specs, 0 failures、PASSED in 1.0s |
| strict-templates-default/migration.spec.ts（`'strict-templates-default migration'`、:17） | 9 | 9 specs, 0 failures、PASSED in 0.4s |
| http-xhr-backend/http-xhr-backend.spec.ts（`'http fetch backend migration'`、:14） | 4 | 4 specs, 0 failures、PASSED in 0.6s（フィルタは `.` で全部） |
| incremental-hydration/migration.spec.ts（`'IncrementalHydration migration'`、:14） | 3 | 3 specs, 0 failures、PASSED in 1.0s（同上） |

直すとしたら、の入口です（手元で確かめるまで。本家に PR は勧めません）。

- describe の中のクラス：change-detection-eager/migration.ts の 55 行目を再帰にする。spec は migration.spec.ts に「関数の中の @Component」を足す。
- extends の配列と拡張子なし：strict-templates-default/index.ts の 26〜31 行目。TypeScript の `ts.getParsedCommandLineOfConfigFile` などが extends を解決する規則に合わせる。spec は migration.spec.ts の :134・:159 の it と同じ形で足す。
- withRequestsMadeViaParent：http-xhr-backend/migration.ts の 80〜95 行目に 3 つ目の検査を足す。spec は http-xhr-backend.spec.ts に足す。

この 4 つに関係する issue（#69220・#68500・#69837、#69174 / #69527 の rootDir）は[第 20 回](20-mig-issues.md)にまとめました。

## 聞かれそうな質問

**Q. ng update のあと、全部のコンポーネントに changeDetection: ChangeDetectionStrategy.Eager が付きました。消していいですか？**

消すと v22 の既定の OnPush になります。マイグレーションは前の動き（毎回チェック）を残すために、87 行目でプロパティが無いものすべてに足しただけです。OnPush にしてよいかはコンポーネントごとに確かめます（[OnPush の章](../cd/04-cd-onpush-markforcheck.md)）。

**Q. もともと OnPush と書いていたコンポーネントは？**

136 行目で名前が `Default` でないので触りません。v22 では OnPush が既定なので、その記述は無くても同じ意味ですが、消すマイグレーションはありません（#69220、1 節の note）。

**Q. strictTemplates: false が tsconfig.app.json と tsconfig.spec.json の両方に書かれたのはなぜ？**

47〜50 行目で build と test の tsconfig をどちらも集め、64〜72 行目で 1 つずつ「extends をたどっても無ければ書く」をしているからです。親の tsconfig.json に 1 つ書けば足りる場合でも、親が angular.json に出てこなければ親には書きません。

**Q. withFetch() を書いていたのに withXhr() が足されることはありますか？**

同じ `provideHttpClient(...)` の引数に `withFetch()` があれば 95 行目で止まります。ただし、80〜86 行目は引数の中の直接の呼び出ししか見ないので、`const features = [withFetch()]; provideHttpClient(...features)` のような書き方には足します。

**Q. 4 つのうち、型チェッカーで名前の出どころを確かめているのはどれ？**

change-detection-eager だけです（60 行目の `getAngularDecorators` と 142〜163 行目）。http-xhr-backend は import の文字列（66〜73 行目）、incremental-hydration は呼び出しの識別子の名前（42〜44 行目）だけで、strict-templates-default は TS を見ません。

## 読み終えて

- 4 つは「v22 の新しい既定に気づかず動きが変わる」のを防ぐため、前の動きを明示的に書き足すマイグレーション。どれも version 22.0.0 で 1 回走る。
- 冪等さは「もう書いてあれば触らない」で作る（Eager は Default 以外、xhr は withFetch / withXhr、hydration は 2 つの with）。#68500 はこの検査が 1 つ足りなかった例。
- 名前の確かめ方は 4 つでばらばら。型で確かめるのは change-detection-eager だけ。
- 本物のバンドルで、describe の中のクラス・extends の配列と拡張子なし・withRequestsMadeViaParent の 3 つの取りこぼしを確かめた。

---

← 前: [ルーティングのマイグレーション：遅延読み込みと RouterTestingModule](16-mig-routing.md)  
次: [v22 の ng update（2）：?. の意味が変わる](18-mig-v22-safe-navigation.md) →
