[目次](../README.md) › [マイグレーションの内側](README.md) › 第 11 回 / 全 20 回

# output() への移行と signals のまとめ役

> output-migration が @Output() と new EventEmitter() を output() に変え、.next() を .emit() に、文として単独の .complete() を消し、引数のない emit() に TODO を入れる仕組み。移行をやめる書き方（静的でない別名・式の中の .complete()・テスト以外の .pipe()。.subscribe() は調べない）と、置き換えを出力の ID ごとに採るか捨てる migrate。3 つの signal 系のマイグレーションを名前順に chain する ng-generate/signals。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-output)

---

`@Output() saved = new EventEmitter<string>();` を `readonly saved = output<string>();` に変える `output-migration` は、宣言を書き換えるだけではありません。同じプロジェクトの中の `.next()` を `.emit()` に直し、`.complete()` の文を消し、`.pipe()` のように `EventEmitter`（RxJS の `Subject`）にしか無い使い方を見つけたら、その出力ごと移行をやめます。この章では、その判断がどの関数のどの行で行われるかを 1 つずつ追い、最後に 3 つの signal 系マイグレーションを 1 回で走らせる `ng-generate/signals` を読みます。

読む対象は `packages/core/schematics/` の `migrations/output-migration/`（`output-migration.ts`・`output_helpers.ts`・`output-replacements.ts`・`output-migration.spec.ts`）、`ng-generate/output-migration/index.ts`、`ng-generate/signals/` です。

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
11. **11. output()**（この章）
12. [12. 制御フロー](12-mig-control-flow.md)
13. [13. inject()](13-mig-inject.md)
14. [14. テンプレートの書き換え](14-mig-template-rewrites.md)
15. [15. 使っていない import](15-mig-cleanup-imports.md)
16. [16. ルーティング](16-mig-routing.md)
17. [17. v22（1）既定](17-mig-v22-defaults.md)
18. [18. v22（2）?.](18-mig-v22-safe-navigation.md)
19. [19. テスト](19-mig-testing.md)
20. [20. issue と PR を読む](20-mig-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> `output()` が返すのは `OutputEmitterRef` で、持っているのは `emit()` と `subscribe()` だけです。`EventEmitter` は RxJS の `Subject` を継承しているので `next()`・`complete()`・`pipe()` なども使えました。マイグレーションの仕事の半分は「この差を埋められるか」の判定です。

## 1. 入口：Tsurge の「漏斗型」マイグレーション

`ng generate @angular/core:output-migration`（`collection.json` の別名は `outputs`）で呼ばれるのはこの関数です。

📄 `angular/packages/core/schematics/ng-generate/output-migration/index.ts` L18–48 （▶ の行: 20, 23–24, 26–27, 38, 42–44）

```ts
18 │ export function migrate(options: Options): Rule {
19 │   return async (tree, context) => {
20 ▶     await runMigrationInDevkit({
21 │       tree,
22 │       getMigration: (fs) =>
23 ▶         new OutputMigration({
24 ▶           shouldMigrate: (_, file) => {
25 │             return (
26 ▶               file.rootRelativePath.startsWith(fs.normalize(options.path)) &&
27 ▶               !/(^|\/)node_modules\//.test(file.rootRelativePath)
28 │             );
29 │           },
30 │         }),
31 │       beforeProgramCreation: (tsconfigPath, stage) => {
32 │         if (stage === MigrationStage.Analysis) {
33 │           context.logger.info(`Preparing analysis for: ${tsconfigPath}...`);
34 │         } else {
35 │           context.logger.info(`Running migration for: ${tsconfigPath}...`);
36 │         }
37 │       },
38 ▶       afterProgramCreation: (info, fs) => {
39 │         const analysisPath = fs.resolve(options.analysisDir);
40 │ 
41 │         // Support restricting the analysis to subfolders for larger projects.
42 ▶         if (analysisPath !== '/') {
43 ▶           info.sourceFiles = info.sourceFiles.filter((sf) => sf.fileName.startsWith(analysisPath));
44 ▶           info.fullProgramSourceFiles = info.fullProgramSourceFiles.filter((sf) =>
45 │             sf.fileName.startsWith(analysisPath),
46 │           );
47 │         }
48 │       },
```

20 行目の `runMigrationInDevkit` が、tsconfig ごとにプログラムを作って解析し、結果をまとめて `Tree` に書き戻す共通の道具です（[第 4 回](04-mig-tsurge.md)）。この章に関係するのは 2 つのオプションです。

- **`path`**：23〜29 行目の `shouldMigrate` で使います。宣言のあるファイルの、ワークスペースの根からの相対パスが `path` で始まり、`node_modules/` を含まないときだけ宣言を書き換えます。
- **`analysisDir`**：38〜47 行目。プログラムを作ったあとで `sourceFiles` を `analysisDir` の下のものだけに絞ります。`path` と違い、こちらは「どこまで読むか」です。読まなかったファイルの中の `.next()` や `.pipe()` は見つからないので、大きなプロジェクトで速くするかわりに見落としが出ます（`schema.json` の説明にも「Useful for larger projects」とあります）。

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.ts` L85–111 （▶ の行: 85, 89, 93, 101–105, 109）

```ts
 85 ▶ export class OutputMigration extends TsurgeFunnelMigration<
 86 │   CompilationUnitData,
 87 │   CompilationUnitData
 88 │ > {
 89 ▶   constructor(private readonly config: MigrationConfig = {}) {
 90 │     super();
 91 │   }
 92 │ 
 93 ▶   override async analyze(info: ProgramInfo): Promise<Serializable<CompilationUnitData>> {
 94 │     const {sourceFiles, program} = info;
 95 │     const outputFieldReplacements: Record<ClassFieldUniqueKey, OutputMigrationData> = {};
 96 │     const problematicUsages: Record<ClassFieldUniqueKey, true> = {};
 97 │     let problematicDeclarationCount = 0;
 98 │ 
 99 │     const filesWithOutputDeclarations = new Set<ts.SourceFile>();
100 │ 
101 ▶     const checker = program.getTypeChecker();
102 ▶     const reflector = new TypeScriptReflectionHost(checker);
103 ▶     const dtsReader = new DtsMetadataReader(checker, reflector);
104 ▶     const evaluator = new PartialEvaluator(reflector, checker, null);
105 ▶     const resourceLoader = info.ngCompiler?.['resourceManager'] ?? null;
106 │ 
107 │     // Pre-analyze the program and get access to the template type checker.
108 │     // If we are processing a non-Angular target, there is no template info.
109 ▶     const {templateTypeChecker} = info.ngCompiler?.['ensureAnalyzed']() ?? {
110 │       templateTypeChecker: null,
111 │     };
```

85 行目、`OutputMigration` は `TsurgeFunnelMigration` を継承します。`analyze`（コンパイル単位ごと）→ `combine`（2 つずつまとめる）→ `globalMeta` → `migrate` の順に呼ばれる形で、型引数の 2 つがどちらも `CompilationUnitData` なのは「単位ごとのデータ」と「全体のデータ」が同じ形だからです。101〜104 行目で TypeScript の型チェッカーと、compiler-cli の部品（デコレーターを読む `TypeScriptReflectionHost`、`.d.ts` のメタデータを読む `DtsMetadataReader`、式を評価する `PartialEvaluator`）を作ります。109 行目で `NgCompiler` の private な `ensureAnalyzed()` を角括弧で呼んで `templateTypeChecker` を取り出します。テンプレートの中の参照を探すのに使います（7 節）。

## 2. 宣言を見つける：「new EventEmitter で初期化した @Output」だけ

📄 `angular/packages/core/schematics/migrations/output-migration/output_helpers.ts` L36–67 （▶ の行: 38–41, 47–49, 51）

```ts
36 │ export function isOutputDeclarationEligibleForMigration(node: ts.PropertyDeclaration) {
37 │   return (
38 ▶     node.initializer !== undefined &&
39 ▶     ts.isNewExpression(node.initializer) &&
40 ▶     ts.isIdentifier(node.initializer.expression) &&
41 ▶     node.initializer.expression.text === 'EventEmitter'
42 │   );
43 │ }
44 │ 
45 │ function isPotentialOutputCallUsage(node: ts.Node, name: string): node is ts.CallExpression {
46 │   if (
47 ▶     ts.isCallExpression(node) &&
48 ▶     ts.isPropertyAccessExpression(node.expression) &&
49 ▶     ts.isIdentifier(node.expression.name)
50 │   ) {
51 ▶     return node.expression?.name.text === name;
52 │   } else {
53 │     return false;
54 │   }
55 │ }
56 │ 
57 │ export function isPotentialPipeCallUsage(node: ts.Node): node is ts.CallExpression {
58 │   return isPotentialOutputCallUsage(node, 'pipe');
59 │ }
60 │ 
61 │ export function isPotentialNextCallUsage(node: ts.Node): node is ts.CallExpression {
62 │   return isPotentialOutputCallUsage(node, 'next');
63 │ }
64 │ 
65 │ export function isPotentialCompleteCallUsage(node: ts.Node): node is ts.CallExpression {
66 │   return isPotentialOutputCallUsage(node, 'complete');
67 │ }
```

38〜41 行目が「移行してよい宣言」の条件の全部です。初期化子があり、それが `new` 式で、`new` の後ろが識別子で、その名前の文字列が `EventEmitter`。型チェッカーは使っていないので、`import {EventEmitter as E}` と別名にした `new E()` は対象外になり、逆に自分で作った同じ名前のクラスは対象になります。45〜55 行目の `isPotentialOutputCallUsage` も同じく構文だけで、「`x.名前(…)` の形の呼び出し」かどうかを見ます。それが本当に出力かは呼んだ側が確かめます（4 節）。

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.ts` L136–175 （▶ の行: 136–137, 139, 141–142, 146–147, 156, 158–160, 164, 167–168, 171–172）

```ts
136 ▶       if (ts.isPropertyDeclaration(node)) {
137 ▶         const outputDecorator = getOutputDecorator(node, reflector);
138 │         if (outputDecorator !== null) {
139 ▶           if (isOutputDeclarationEligibleForMigration(node)) {
140 │             const outputDef = {
141 ▶               id: getUniqueIdForProperty(info, node),
142 ▶               aliasParam: outputDecorator.args?.at(0),
143 │             };
144 │             const outputFile = projectFile(node.getSourceFile(), info);
145 │             if (
146 ▶               this.config.shouldMigrate === undefined ||
147 ▶               this.config.shouldMigrate(
148 │                 {
149 │                   key: outputDef.id,
150 │                   node: node,
151 │                 },
152 │                 outputFile,
153 │               )
154 │             ) {
155 │               const aliasParam = outputDef.aliasParam;
156 ▶               const aliasOptionValue = aliasParam ? evaluator.evaluate(aliasParam) : undefined;
157 │ 
158 ▶               if (aliasOptionValue == undefined || typeof aliasOptionValue === 'string') {
159 ▶                 filesWithOutputDeclarations.add(node.getSourceFile());
160 ▶                 addOutputReplacement(
161 │                   outputFieldReplacements,
162 │                   outputDef.id,
163 │                   outputFile,
164 ▶                   calculateDeclarationReplacement(info, node, aliasOptionValue?.toString()),
165 │                 );
166 │               } else {
167 ▶                 problematicUsages[outputDef.id] = true;
168 ▶                 problematicDeclarationCount++;
169 │               }
170 │             }
171 ▶           } else {
172 ▶             problematicDeclarationCount++;
173 │           }
174 │         }
175 │       }
```

1. **136〜137 行目：プロパティで、@angular/core の @Output が付いているか**

   `getOutputDecorator` は `getAngularDecorators(decorators, ['Output'], false)` で、@angular/core から import した `Output` だけを数えます（[言語サービス第 19 回](../ls/19-ls-refactorings.md)の `@Input` と同じ形）。
2. **139 行目：EventEmitter で初期化しているか**

   違えば 171〜172 行目で `problematicDeclarationCount` を 1 増やすだけです。`new Subject()` の `@Output` は書き換えず、統計の「移行できなかった数」に入ります。
3. **141〜142 行目：ID と別名の引数**

   ID は下の `getUniqueIdForProperty` で作る文字列です。別名は `@Output('alias')` の 1 つ目の引数。
4. **146〜153 行目：`shouldMigrate` に聞く**

   1 節の `path` の判定です。`shouldMigrate` が無い（テストや言語サービスから呼ぶとき）は全部が対象です。
5. **156〜158 行目：別名を評価して、文字列か無しなら書き換える**

   `PartialEvaluator` で評価するので、`const ALIAS = 'x'` を渡していても文字列になります。159 行目でこのファイルを「宣言のあるファイル」に入れ（import を直す対象。8 節）、160〜165 行目で宣言の置き換えを登録します。
6. **166〜169 行目：別名が静的な文字列にならない**

   その出力を `problematicUsages` に入れ、さらに `problematicDeclarationCount` も増やします。この「両方に数える」は 8 節の統計に効きます。

📄 `angular/packages/core/schematics/migrations/output-migration/output_helpers.ts` L136–152 （▶ の行: 141–143, 148–149）

```ts
136 │ /** Computes an unique ID for a given Angular `@Output` property. */
137 │ export function getUniqueIdForProperty(
138 │   info: ProgramInfo,
139 │   prop: ts.PropertyDeclaration,
140 │ ): ClassFieldUniqueKey {
141 ▶   const {id} = projectFile(prop.getSourceFile(), info);
142 ▶   id.replace(/\.d\.ts$/, '.ts');
143 ▶   return `${id}@@${prop.parent.name ?? 'unknown-class'}@@${prop.name.getText()}` as ClassFieldUniqueKey;
144 │ }
145 │ 
146 │ export function isTestRunnerImport(node: ts.Node) {
147 │   if (ts.isImportDeclaration(node)) {
148 ▶     const moduleSpecifier = node.moduleSpecifier.getText();
149 ▶     return moduleSpecifier.includes('jasmine') || moduleSpecifier.includes('catalyst');
150 │   }
151 │   return false;
152 │ }
```

143 行目、ID は「ファイルの ID `@@` クラス名 `@@` プロパティ名」です。コンパイル単位（tsconfig）が違っても同じ宣言なら同じ文字列になるので、`combine` で突き合わせられます。142 行目の `id.replace(/\.d\.ts$/, '.ts')` は戻り値を捨てているので何も変えません（文字列は書き換えられないため）。今の動作では、`.d.ts` の宣言の ID は `.d.ts` のパスのままです。146〜152 行目の `isTestRunnerImport` は 6 節で使います。

## 3. 宣言を output() に書き換える

📄 `angular/packages/core/schematics/migrations/output-migration/output-replacements.ts` L25–56 （▶ の行: 34–37, 40–43, 47, 49）

```ts
25 │ export function calculateDeclarationReplacement(
26 │   info: ProgramInfo,
27 │   node: ts.PropertyDeclaration,
28 │   aliasParam?: string,
29 │ ): Replacement {
30 │   const sf = node.getSourceFile();
31 │ 
32 │   let payloadTypes: ts.NodeArray<ts.TypeNode> | undefined;
33 │ 
34 ▶   if (node.initializer && ts.isNewExpression(node.initializer) && node.initializer.typeArguments) {
35 ▶     payloadTypes = node.initializer.typeArguments;
36 ▶   } else if (node.type && ts.isTypeReferenceNode(node.type) && node.type.typeArguments) {
37 ▶     payloadTypes = ts.factory.createNodeArray(node.type.typeArguments);
38 │   }
39 │ 
40 ▶   const outputCall = ts.factory.createCallExpression(
41 ▶     ts.factory.createIdentifier('output'),
42 ▶     payloadTypes,
43 ▶     aliasParam !== undefined
44 │       ? [
45 │           ts.factory.createObjectLiteralExpression(
46 │             [
47 ▶               ts.factory.createPropertyAssignment(
48 │                 'alias',
49 ▶                 ts.factory.createStringLiteral(aliasParam, true),
50 │               ),
51 │             ],
52 │             false,
53 │           ),
54 │         ]
55 │       : [],
56 │   );
```

📄 `angular/packages/core/schematics/migrations/output-migration/output-replacements.ts` L58–79 （▶ の行: 58–59, 64–66, 68–71, 74, 77）

```ts
58 ▶   const existingModifiers = (node.modifiers ?? []).filter(
59 ▶     (modifier) => !ts.isDecorator(modifier) && modifier.kind !== ts.SyntaxKind.ReadonlyKeyword,
60 │   );
61 │ 
62 │   const updatedOutputDeclaration = ts.factory.createPropertyDeclaration(
63 │     // Think: this logic of dealing with modifiers is applicable to all signal-based migrations
64 ▶     ts.factory.createNodeArray([
65 ▶       ...existingModifiers,
66 ▶       ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword),
67 │     ]),
68 ▶     node.name,
69 ▶     undefined,
70 ▶     undefined,
71 ▶     outputCall,
72 │   );
73 │ 
74 ▶   return prepareTextReplacementForNode(
75 │     info,
76 │     node,
77 ▶     printer.printNode(ts.EmitHint.Unspecified, updatedOutputDeclaration, sf),
78 │   );
79 │ }
```

1. **34〜38 行目：型引数をどこから取るか**

   `new EventEmitter<string>()` の型引数を先に見て、無ければ型注釈 `: EventEmitter<string>` の型引数を使います。後者は issue #59248（型が消える）の修正 cdbc6e8ec1e で入りました。
2. **40〜56 行目：`output<T>({alias: '…'})` の呼び出しを作る**

   49 行目の `createStringLiteral(aliasParam, true)` の `true` は単引用符にする指定です。
3. **58〜60 行目：デコレーターと readonly を外す**

   `private`・`protected` などは残します。
4. **62〜72 行目：プロパティを作り直す**

   66 行目で `readonly` を最後に付け直します。69〜70 行目の 2 つの `undefined` は `?` と型注釈で、**型注釈は捨てます**（型は `output<T>()` の型引数に移したので）。
5. **74〜78 行目：印刷した文字列で、元のプロパティの範囲を置き換える**

   `prepareTextReplacementForNode` は `node.getStart()` から `node.getEnd()` までの `TextUpdate` を作ります。`getStart()` は前のコメントを含まないので、JSDoc はそのまま残ります（spec の「should preserve multiline JSdoc comments」）。`Replacement` と `TextUpdate` の形は[第 5 回](05-mig-replacements.md)。

## 4. .next() を .emit() に：受け手が出力かを型チェッカーで確かめる

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.ts` L177–195 （▶ の行: 178–180, 185–186, 188, 192）

```ts
177 │       // detect .next usages that should be migrated to .emit
178 ▶       if (isPotentialNextCallUsage(node) && ts.isPropertyAccessExpression(node.expression)) {
179 ▶         const propertyDeclaration = isTargetOutputDeclaration(
180 ▶           node.expression.expression,
181 │           checker,
182 │           reflector,
183 │           dtsReader,
184 │         );
185 ▶         if (propertyDeclaration !== null) {
186 ▶           const id = getUniqueIdForProperty(info, propertyDeclaration);
187 │           const outputFile = projectFile(node.getSourceFile(), info);
188 ▶           addOutputReplacement(
189 │             outputFieldReplacements,
190 │             id,
191 │             outputFile,
192 ▶             calculateNextFnReplacement(info, node.expression.name),
193 │           );
194 │         }
195 │       }
```

📄 `angular/packages/core/schematics/migrations/output-migration/output_helpers.ts` L75–111 （▶ の行: 75, 77, 80, 95, 104–106, 110）

```ts
 75 ▶   const targetSymbol = checker.getSymbolAtLocation(node);
 76 │   if (targetSymbol !== undefined) {
 77 ▶     const propertyDeclaration = getTargetPropertyDeclaration(targetSymbol);
 78 │     if (
 79 │       propertyDeclaration !== null &&
 80 ▶       isOutputDeclaration(propertyDeclaration, reflector, dtsReader)
 81 │     ) {
 82 │       return propertyDeclaration;
 83 │     }
 84 │   }
 85 │   return null;
 86 │ }
 87 │ 
 88 │ /** Gets whether the given property is an Angular `@Output`. */
 89 │ function isOutputDeclaration(
 90 │   node: ts.PropertyDeclaration,
 91 │   reflector: ReflectionHost,
 92 │   dtsReader: DtsMetadataReader,
 93 │ ): boolean {
 94 │   // `.d.ts` file, so we check the `static ecmp` metadata on the `declare class`.
 95 ▶   if (node.getSourceFile().isDeclarationFile) {
 96 │     if (
 97 │       !ts.isIdentifier(node.name) ||
 98 │       !ts.isClassDeclaration(node.parent) ||
 99 │       node.parent.name === undefined
100 │     ) {
101 │       return false;
102 │     }
103 │ 
104 ▶     const ref = new Reference(node.parent as ClassDeclaration);
105 ▶     const directiveMeta = dtsReader.getDirectiveMetadata(ref);
106 ▶     return !!directiveMeta?.outputs.getByClassPropertyName(node.name.text);
107 │   }
108 │ 
109 │   // `.ts` file, so we check for the `@Output()` decorator.
110 ▶   return getOutputDecorator(node, reflector) !== null;
111 │ }
```

178 行目で「`何か.next(…)` の呼び出し」を構文で拾い、179〜184 行目で受け手（`this.saved.next()` なら `this.saved`）を `isTargetOutputDeclaration` に渡します。75 行目で型チェッカーからシンボルを引き、77 行目でその宣言がクラスのプロパティかを見て、80 行目で `@Output` かを確かめます。95〜107 行目は宣言が `.d.ts` にあるとき（ライブラリのコンポーネントの出力）で、デコレーターは消えているので `DtsMetadataReader` で `ɵdir` の型から出力の一覧を読みます。ここでは宣言が `EventEmitter` で初期化されているかを見ていません。192 行目の置き換えは、その出力の ID の下に入ります。188〜193 行目の `addOutputReplacement` は、ID の項目がまだ無ければ作るので、2 節で宣言を登録しなかった `@Output() s = new Subject()` の `.next()` でも項目ができます。そして 8 節の `migrate` は `outputFields` の項目を全部回るので、この `.next()` は `.emit()` に書き換わります（テスト節で手元で確かめた結果を載せます）。テンプレートの側には同じことを防ぐ条件があります（7 節の 288 行目）。

📄 `angular/packages/core/schematics/migrations/output-migration/output-replacements.ts` L114–138 （▶ の行: 115, 122, 130, 137）

```ts
114 │ export function calculateNextFnReplacement(info: ProgramInfo, node: ts.MemberName): Replacement {
115 ▶   return prepareTextReplacementForNode(info, node, 'emit');
116 │ }
117 │ 
118 │ export function calculateNextFnReplacementInTemplate(
119 │   file: ProjectFile,
120 │   span: AbsoluteSourceSpan,
121 │ ): Replacement {
122 ▶   return prepareTextReplacement(file, 'emit', span.start, span.end);
123 │ }
124 │ 
125 │ export function calculateNextFnReplacementInHostBinding(
126 │   file: ProjectFile,
127 │   offset: number,
128 │   span: AbsoluteSourceSpan,
129 │ ): Replacement {
130 ▶   return prepareTextReplacement(file, 'emit', offset + span.start, offset + span.end);
131 │ }
132 │ 
133 │ export function calculateCompleteCallReplacement(
134 │   info: ProgramInfo,
135 │   node: ts.ExpressionStatement,
136 │ ): Replacement {
137 ▶   return prepareTextReplacementForNode(info, node, '', node.getFullStart());
138 │ }
```

115 行目、`.next` の置き換えは名前の部分（`node.expression.name`）だけを `emit` に変えます。引数や前後の空白には触りません。

## 5. .complete() の文を消す、引数のない emit() に TODO を入れる

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.ts` L197–226 （▶ の行: 198–199, 208, 213, 215–216, 221, 224–225）

```ts
197 │       // detect .complete usages that should be removed
198 ▶       if (isPotentialCompleteCallUsage(node) && ts.isPropertyAccessExpression(node.expression)) {
199 ▶         const propertyDeclaration = isTargetOutputDeclaration(
200 │           node.expression.expression,
201 │           checker,
202 │           reflector,
203 │           dtsReader,
204 │         );
205 │         if (propertyDeclaration !== null) {
206 │           const id = getUniqueIdForProperty(info, propertyDeclaration);
207 │           const outputFile = projectFile(node.getSourceFile(), info);
208 ▶           if (ts.isExpressionStatement(node.parent)) {
209 │             addOutputReplacement(
210 │               outputFieldReplacements,
211 │               id,
212 │               outputFile,
213 ▶               calculateCompleteCallReplacement(info, node.parent),
214 │             );
215 ▶           } else {
216 ▶             problematicUsages[id] = true;
217 │           }
218 │         }
219 │       }
220 │ 
221 ▶       addCommentForEmptyEmit(node, info, checker, reflector, dtsReader, outputFieldReplacements);
222 │ 
223 │       // detect imports of test runners
224 ▶       if (isTestRunnerImport(node)) {
225 ▶         isTestFile = true;
226 │       }
```

`OutputEmitterRef` には `complete()` がありません。そのかわりコンストラクタで持ち主の `DestroyRef` に `onDestroy` を登録し、壊れるときに購読者を全部外します（`packages/core/src/authoring/output/output_emitter_ref.ts`）。208 行目、**文として単独で書かれた**`this.saved.complete();` だけを消します（213 行目）。137 行目（上の引用）で消す範囲の始まりを `getFullStart()` にしているので、文の前の空白とコメントも一緒に消えます（spec の「should remove .complete usage with comments」）。`(this.saved.complete())` のように式の一部なら 215〜217 行目でその出力を「問題あり」にし、出力ごと移行しません。

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.ts` L463–492 （▶ の行: 463, 471, 479–480, 485–488）

```ts
463 ▶   if (!isEmptyEmitCall(node)) return;
464 │ 
465 │   const propertyAccess = getPropertyAccess(node);
466 │   if (!propertyAccess) return;
467 │ 
468 │   const symbol = checker.getSymbolAtLocation(propertyAccess.name);
469 │   if (!symbol || !symbol.declarations?.length) return;
470 │ 
471 ▶   const propertyDeclaration = isTargetOutputDeclaration(
472 │     propertyAccess,
473 │     checker,
474 │     reflector,
475 │     dtsReader,
476 │   );
477 │   if (!propertyDeclaration) return;
478 │ 
479 ▶   const eventEmitterType = getEventEmitterArgumentType(propertyDeclaration);
480 ▶   if (!eventEmitterType || eventEmitterType === 'void') return;
481 │ 
482 │   const id = getUniqueIdForProperty(info, propertyDeclaration);
483 │   const file = projectFile(node.getSourceFile(), info);
484 │   const formatter = getFormatterText(node);
485 ▶   const todoReplacement: TextUpdate = new TextUpdate({
486 ▶     toInsert: `${formatter.indent}// TODO: The 'emit' function requires a mandatory ${eventEmitterType} argument\n`,
487 ▶     end: formatter.lineStartPos,
488 ▶     position: formatter.lineStartPos,
489 │   });
490 │ 
491 │   addOutputReplacement(outputFieldReplacements, id, file, new Replacement(file, todoReplacement));
492 │ }
```

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.ts` L508–519 （▶ の行: 510, 512–513, 517–518）

```ts
508 │ function getEventEmitterArgumentType(propertyDeclaration: ts.PropertyDeclaration): string | null {
509 │   const initializer = propertyDeclaration.initializer;
510 ▶   if (!initializer || !ts.isNewExpression(initializer)) return null;
511 │ 
512 ▶   const isEventEmitter =
513 ▶     ts.isIdentifier(initializer.expression) && initializer.expression.getText() === 'EventEmitter';
514 │ 
515 │   if (!isEventEmitter) return null;
516 │ 
517 ▶   const [typeArg] = initializer.typeArguments ?? [];
518 ▶   return typeArg ? typeArg.getText() : null;
519 │ }
```

221 行目の `addCommentForEmptyEmit` は、`EventEmitter<T>.emit()` は引数を省けたのに `OutputEmitterRef<T>.emit(value: T)` は省けない、という差を埋めます。463 行目で引数 0 個の `.emit()` を拾い、479 行目で宣言の `new EventEmitter<T>()` の `T` の文字列を取り、485〜489 行目でその行の先頭に `// TODO: The 'emit' function requires a mandatory string argument` を入れます。書き換えではなく、人に直してもらうための印です。

- この TODO は issue #58650（引数のない `emit()` が型エラーになる）への対応 39a4e004644 で入りました。
- 480 行目の `eventEmitterType === 'void'` は 16fe27bfefa（2026-05-18）で足されました。`output<void>()` の `emit()` は引数なしで呼べるので、TODO は要りません。
- 517 行目は `new` 式の型引数しか見ません。`@Output() x: EventEmitter<string> = new EventEmitter();` のように型を注釈にだけ書いた宣言では `null` が返り、480 行目で抜けます。宣言の書き換え（3 節の 36〜37 行目）は注釈からも型を取るので、`output<string>()` にはなるのに、引数のない `emit()` に TODO が付きません。

## 6. 移行できない書き方：.pipe()

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.ts` L228–259 （▶ の行: 229, 238, 240, 244, 246–247, 252, 256–258）

```ts
228 │       // detect unsafe access of the output property
229 ▶       if (isPotentialPipeCallUsage(node) && ts.isPropertyAccessExpression(node.expression)) {
230 │         const propertyDeclaration = isTargetOutputDeclaration(
231 │           node.expression.expression,
232 │           checker,
233 │           reflector,
234 │           dtsReader,
235 │         );
236 │         if (propertyDeclaration !== null) {
237 │           const id = getUniqueIdForProperty(info, propertyDeclaration);
238 ▶           if (isTestFile) {
239 │             const outputFile = projectFile(node.getSourceFile(), info);
240 ▶             addOutputReplacement(
241 │               outputFieldReplacements,
242 │               id,
243 │               outputFile,
244 ▶               ...calculatePipeCallReplacement(info, node),
245 │             );
246 ▶           } else {
247 ▶             problematicUsages[id] = true;
248 │           }
249 │         }
250 │       }
251 │ 
252 ▶       ts.forEachChild(node, outputMigrationVisitor);
253 │     };
254 │ 
255 │     // calculate output migration replacements
256 ▶     for (const sf of sourceFiles) {
257 ▶       isTestFile = false;
258 ▶       ts.forEachChild(sf, outputMigrationVisitor);
259 │     }
```

229 行目で `何か.pipe(…)` を拾い、受け手が出力なら 2 つに分かれます。238 行目、そのファイルが**テストファイル**なら 244 行目で書き換え、そうでなければ 247 行目で「問題あり」にして出力ごと移行をやめます。テストファイルかどうかは 224〜225 行目（5 節の引用）で、import の文字列に `jasmine` か `catalyst` が入っているかで決めます。256〜258 行目、ファイルごとに `false` に戻します。

📄 `angular/packages/core/schematics/migrations/output-migration/output-replacements.ts` L144–178 （▶ の行: 148, 150–151, 153–154, 156, 161, 172, 176）

```ts
144 │   if (ts.isPropertyAccessExpression(node.expression)) {
145 │     const sf = node.getSourceFile();
146 │     const importManager = new ImportManager();
147 │ 
148 ▶     const outputToObservableIdent = importManager.addImport({
149 │       requestedFile: sf,
150 ▶       exportModuleSpecifier: '@angular/core/rxjs-interop',
151 ▶       exportSymbolName: 'outputToObservable',
152 │     });
153 ▶     const toObsCallExp = ts.factory.createCallExpression(outputToObservableIdent, undefined, [
154 ▶       node.expression.expression,
155 │     ]);
156 ▶     const pipePropAccessExp = ts.factory.updatePropertyAccessExpression(
157 │       node.expression,
158 │       toObsCallExp,
159 │       node.expression.name,
160 │     );
161 ▶     const pipeCallExp = ts.factory.updateCallExpression(
162 │       node,
163 │       pipePropAccessExp,
164 │       [],
165 │       node.arguments,
166 │     );
167 │ 
168 │     const replacements = [
169 │       prepareTextReplacementForNode(
170 │         info,
171 │         node,
172 ▶         printer.printNode(ts.EmitHint.Unspecified, pipeCallExp, sf),
173 │       ),
174 │     ];
175 │ 
176 ▶     applyImportManagerChanges(importManager, replacements, [sf], info);
177 │ 
178 │     return replacements;
```

テストファイルでは `this.saved.pipe(map(…))` を `outputToObservable(this.saved).pipe(map(…))` にします。148〜152 行目で `@angular/core/rxjs-interop` の `outputToObservable` の import を足し、153〜166 行目で受け手を包んだ呼び出しを作り直します。228 行目のコメントは「出力のプロパティへの安全でないアクセスを見つける」で、アプリのコードでは移行をやめ、テストファイルでだけこの書き換えをします。なぜテストだけなのかは、コードにもコミットにも書かれていません。

この関数が「問題あり」にするのは、読んだ範囲で次の 3 つだけです。

| 書き方 | 行 | 結果 |
| --- | --- | --- |
| `@Output('…')` の別名が静的な文字列にならない | 166〜169 | 宣言を書き換えない |
| `.complete()` が式の一部 | 215〜217 | 出力ごと移行しない |
| テスト以外のファイルの `.pipe()` | 246〜248 | 出力ごと移行しない |

`.subscribe()` は調べていません。`OutputEmitterRef` にも `subscribe()` があるので呼び出しはそのまま型が合います（戻り値は RxJS の `Subscription` ではなく `OutputRefSubscription` になります）。`.asObservable()` や `.observed` のように `OutputEmitterRef` に無いメンバーも調べていないので、書き換えたあとに型エラーとして出ます。

## 7. テンプレートと host の .next()

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.ts` L262–278 （▶ の行: 263, 269–270, 276–277）

```ts
262 │     const referenceResult: ReferenceResult<ClassFieldDescriptor> = {references: []};
263 ▶     const {visitor: templateHostRefVisitor} = createFindAllSourceFileReferencesVisitor(
264 │       info,
265 │       checker,
266 │       reflector,
267 │       resourceLoader,
268 │       evaluator,
269 ▶       templateTypeChecker,
270 ▶       knownFields,
271 │       null, // TODO: capture known output names as an optimization
272 │       referenceResult,
273 │     );
274 │ 
275 │     // calculate template / host binding replacements
276 ▶     for (const sf of sourceFiles) {
277 ▶       ts.forEachChild(sf, templateHostRefVisitor);
278 │     }
```

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.ts` L280–311 （▶ の行: 282–283, 288, 293, 296–297, 305）

```ts
280 │     for (const ref of referenceResult.references) {
281 │       // detect .next usages that should be migrated to .emit in template and host binding expressions
282 ▶       if (ref.kind === ReferenceKind.InTemplate) {
283 ▶         const callExpr = checkNonTsReferenceCallsField(ref, 'next');
284 │         // TODO: here and below for host bindings, we should ideally filter in the global meta stage
285 │         // (instead of using the `outputFieldReplacements` map)
286 │         //  as technically, the call expression could refer to an output
287 │         //  from a whole different compilation unit (e.g. tsconfig.json).
288 ▶         if (callExpr !== null && outputFieldReplacements[ref.target.key] !== undefined) {
289 │           addOutputReplacement(
290 │             outputFieldReplacements,
291 │             ref.target.key,
292 │             ref.from.templateFile,
293 ▶             calculateNextFnReplacementInTemplate(ref.from.templateFile, callExpr.nameSpan),
294 │           );
295 │         }
296 ▶       } else if (ref.kind === ReferenceKind.InHostBinding) {
297 ▶         const callExpr = checkNonTsReferenceCallsField(ref, 'next');
298 │         if (callExpr !== null && outputFieldReplacements[ref.target.key] !== undefined) {
299 │           addOutputReplacement(
300 │             outputFieldReplacements,
301 │             ref.target.key,
302 │             ref.from.file,
303 │             calculateNextFnReplacementInHostBinding(
304 │               ref.from.file,
305 ▶               ref.from.hostPropertyNode.getStart() + 1,
306 │               callExpr.nameSpan,
307 │             ),
308 │           );
309 │         }
310 │       }
311 │     }
```

テンプレートの `(click)="saved.next()"` は TypeScript のノードではないので、2 回目の走査で探します。263 行目の `createFindAllSourceFileReferencesVisitor` は signal-migration の参照探し（[第 8 回](08-mig-signal-input-references.md)）をそのまま借りたもので、270 行目の `knownFields`（同じ `analyze` の前のほうで、プロパティの宣言を 2 節の ID に変える関数を入れて作ったもの）で「どのフィールドへの参照か」を答えます。283 行目の `checkNonTsReferenceCallsField(ref, 'next')` は、参照の 1 つ外側の AST が名前 `next` の `PropertyRead` かを見ます。288 行目の条件 `outputFieldReplacements[ref.target.key] !== undefined` で、この単位で宣言を登録した出力だけに限ります（2eb4afe2b39 の修正。`Subject` の `.next()` をテンプレートで書き換えていた issue #58630）。284〜287 行目の TODO のとおり、別の tsconfig にある出力のテンプレートはここでは拾えません。host バインディング（`host: {'(click)': 'saved.next()'}`）は 305 行目で、文字列の開きの引用符の分の `+ 1` を足した位置で置き換えます。

## 8. まとめて書く：import・globalMeta・stats・migrate

📄 `angular/packages/core/schematics/migrations/output-migration/output-replacements.ts` L81–112 （▶ の行: 94–97, 99, 101–103, 105–107）

```ts
 81 │ export function calculateImportReplacements(info: ProgramInfo, sourceFiles: Set<ts.SourceFile>) {
 82 │   const importReplacements: Record<
 83 │     ProjectFileID,
 84 │     {add: Replacement[]; addAndRemove: Replacement[]}
 85 │   > = {};
 86 │ 
 87 │   for (const sf of sourceFiles) {
 88 │     const importManager = new ImportManager();
 89 │ 
 90 │     const addOnly: Replacement[] = [];
 91 │     const addRemove: Replacement[] = [];
 92 │     const file = projectFile(sf, info);
 93 │ 
 94 ▶     importManager.addImport({
 95 ▶       requestedFile: sf,
 96 ▶       exportModuleSpecifier: '@angular/core',
 97 ▶       exportSymbolName: 'output',
 98 │     });
 99 ▶     applyImportManagerChanges(importManager, addOnly, [sf], info);
100 │ 
101 ▶     importManager.removeImport(sf, 'Output', '@angular/core');
102 ▶     importManager.removeImport(sf, 'EventEmitter', '@angular/core');
103 ▶     applyImportManagerChanges(importManager, addRemove, [sf], info);
104 │ 
105 ▶     importReplacements[file.id] = {
106 ▶       add: addOnly,
107 ▶       addAndRemove: addRemove,
108 │     };
109 │   }
110 │ 
111 │   return importReplacements;
112 │ }
```

宣言のあるファイルごとに、import の直し方を 2 通り用意しておきます。94〜99 行目で `output` を足しただけのもの（`add`）、続けて 101〜103 行目で `Output` と `EventEmitter` を消したもの（`addAndRemove`）。どちらを使うかは、全部の単位を見たあとでないと決められないからです。

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.ts` L406–436 （▶ の行: 411, 415–417, 419, 425, 427–428, 430）

```ts
406 │   override async migrate(globalData: CompilationUnitData) {
407 │     const migratedFiles = new Set<ProjectFileID>();
408 │     const problematicFiles = new Set<ProjectFileID>();
409 │ 
410 │     const replacements: Replacement[] = [];
411 ▶     for (const declIdStr of Object.keys(globalData.outputFields)) {
412 │       const declId = declIdStr as ClassFieldUniqueKey;
413 │       const outputField = globalData.outputFields[declId];
414 │ 
415 ▶       if (!globalData.problematicUsages[declId]) {
416 ▶         replacements.push(...outputField.replacements);
417 ▶         migratedFiles.add(outputField.file.id);
418 │       } else {
419 ▶         problematicFiles.add(outputField.file.id);
420 │       }
421 │     }
422 │ 
423 │     for (const fileIDStr of Object.keys(globalData.importReplacements)) {
424 │       const fileID = fileIDStr as ProjectFileID;
425 ▶       if (migratedFiles.has(fileID)) {
426 │         const importReplacements = globalData.importReplacements[fileID];
427 ▶         if (problematicFiles.has(fileID)) {
428 ▶           replacements.push(...importReplacements.add);
429 │         } else {
430 ▶           replacements.push(...importReplacements.addAndRemove);
431 │         }
432 │       }
433 │     }
434 │ 
435 │     return {replacements};
436 │   }
```

1. **411〜421 行目：出力ごとに、問題が無ければ置き換えを全部採る**

   宣言・`.next`・`.complete`・TODO・テンプレートの置き換えは、どれも 1 つの ID の下に入っています。415 行目で 1 つでも問題があればまとめて捨てるので、「宣言だけ変わって `.pipe()` が残る」ことは起きません。
2. **425 行目：書き換えた出力のあるファイルだけ import を直す**
3. **427〜431 行目：同じファイルに移行しなかった出力があれば `add`**

   残った `@Output() x = new EventEmitter()` のために `Output` と `EventEmitter` の import を残します。

419 行目で `problematicFiles` に入るのは、`problematicUsages` にある出力だけです。2 節の 171〜172 行目で数だけ増やした `@Output() s = new Subject()` は `outputFields` にも `problematicUsages` にも入らないので、同じファイルに書き換えた出力が 1 つでもあれば 430 行目の `addAndRemove` が選ばれ、まだ `@Output()` が残っているのに `Output` の import が消えます（テスト節の実行結果）。

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.ts` L366–404 （▶ の行: 369, 376, 379–380, 385, 389–391, 393–397）

```ts
366 │   override async globalMeta(
367 │     combinedData: CompilationUnitData,
368 │   ): Promise<Serializable<CompilationUnitData>> {
369 ▶     const globalMeta: CompilationUnitData = {
370 │       importReplacements: combinedData.importReplacements,
371 │       outputFields: combinedData.outputFields,
372 │       problematicDeclarationCount: combinedData.problematicDeclarationCount,
373 │       problematicUsages: {},
374 │     };
375 │ 
376 ▶     for (const keyStr of Object.keys(combinedData.problematicUsages)) {
377 │       const key = keyStr as ClassFieldUniqueKey;
378 │       // it might happen that a problematic usage is detected but we didn't see the declaration - skipping those
379 ▶       if (globalMeta.outputFields[key] !== undefined) {
380 ▶         globalMeta.problematicUsages[key] = true;
381 │       }
382 │     }
383 │ 
384 │     // Noop here as we don't have any form of special global metadata.
385 ▶     return confirmAsSerializable(combinedData);
386 │   }
387 │ 
388 │   override async stats(globalMetadata: CompilationUnitData) {
389 ▶     const detectedOutputs =
390 ▶       new Set(Object.keys(globalMetadata.outputFields)).size +
391 ▶       globalMetadata.problematicDeclarationCount;
392 │ 
393 ▶     const problematicOutputs =
394 ▶       new Set(Object.keys(globalMetadata.problematicUsages)).size +
395 ▶       globalMetadata.problematicDeclarationCount;
396 ▶     const successRate =
397 ▶       detectedOutputs > 0 ? (detectedOutputs - problematicOutputs) / detectedOutputs : 1;
398 │ 
399 │     return confirmAsSerializable({
400 │       detectedOutputs,
401 │       problematicOutputs,
402 │       successRate,
403 │     });
404 │   }
```

369〜382 行目で、宣言を見ていない出力の「問題あり」を外した `globalMeta` を作りますが、385 行目で返しているのは引数の `combinedData` です。作った `globalMeta` は使われません。`migrate` は `outputFields` の ID から回るので書き換えの結果には影響しませんが、`stats` には影響します。2 節の 166〜169 行目（別名が静的でない出力）は、`outputFields` に入らず、`problematicUsages` と `problematicDeclarationCount` の両方に入ります。その出力が 1 つだけのプロジェクトなら、389〜391 行目の `detectedOutputs` は 0 + 1 = 1、393〜395 行目の `problematicOutputs` は 1 + 1 = 2、396〜397 行目の `successRate` は (1 − 2) / 1 = −1 です。`ng-generate/output-migration/index.ts` の `whenDone` はこの値で「Migrated -1 out of 1 detected outputs (-100.00 %)」と表示する計算になります。385 行目が `globalMeta` を返していれば、`problematicUsages` から外れて 1 / 1 で 0 % になります。

## 9. ng-generate/signals：3 つを順に chain する

📄 `angular/packages/core/schematics/ng-generate/signals/index.ts` L20–54 （▶ の行: 31, 34, 37, 41, 45, 49, 53）

```ts
20 │ interface Options {
21 │   path: string;
22 │   migrations: SupportedMigrations[];
23 │   analysisDir: string;
24 │   bestEffortMode?: boolean;
25 │   insertTodos?: boolean;
26 │ }
27 │ 
28 │ export function migrate(options: Options): Rule {
29 │   // The migrations are independent so we can run them in any order, but we sort them here
30 │   // alphabetically so we get a consistent execution order in case of issue reports.
31 ▶   const migrations = options.migrations.slice().sort();
32 │   const rules: Rule[] = [];
33 │ 
34 ▶   for (const migration of migrations) {
35 │     switch (migration) {
36 │       case SupportedMigrations.inputs:
37 ▶         rules.push(toSignalInputs(options));
38 │         break;
39 │ 
40 │       case SupportedMigrations.outputs:
41 ▶         rules.push(toInitializerOutputs(options));
42 │         break;
43 │ 
44 │       case SupportedMigrations.queries:
45 ▶         rules.push(toSignalQueries(options));
46 │         break;
47 │ 
48 │       default:
49 ▶         throw new SchematicsException(`Unsupported migration "${migration}"`);
50 │     }
51 │   }
52 │ 
53 ▶   return chain(rules);
54 │ }
```

📄 `angular/packages/core/schematics/ng-generate/signals/schema.json` L43–65 （▶ の行: 44, 49, 54, 58, 60, 63）

```json
43 │     "path": {
44 ▶       "type": "string",
45 │       "description": "Path to the directory that should be migrated.",
46 │       "x-prompt": "Which directory do you want to migrate?",
47 │       "default": "./"
48 │     },
49 ▶     "analysisDir": {
50 │       "type": "string",
51 │       "description": "Path to the directory that should be analyzed. Useful for larger projects if the analysis takes too long and the analysis scope can be narrowed.",
52 │       "default": "./"
53 │     },
54 ▶     "bestEffortMode": {
55 │       "type": "boolean",
56 │       "description": "Whether to eagerly migrate as much as possible, ignoring problematic patterns that would otherwise prevent migration.",
57 │       "x-prompt": "Do you want to migrate as much as possible, even if it may break your build?",
58 ▶       "default": false
59 │     },
60 ▶     "insertTodos": {
61 │       "type": "boolean",
62 │       "description": "Whether the migration should add TODOs for code that could not be migrated",
63 ▶       "default": false
64 │     }
65 │   }
```

`ng generate @angular/core:signals` は、選んだマイグレーションの `Rule` を並べて 53 行目の `chain` で順に走らせるだけです。31 行目で名前を **アルファベット順**に並べ替えるので、順は常に inputs → outputs → queries です。コメントには「互いに独立だが、issue の報告で順が揃うように」とあります。37・41・45 行目で同じ `options` を 3 つにそのまま渡します。`bestEffortMode`（58 行目、既定 false）と `insertTodos`（63 行目、既定 false）を読むのは inputs と queries で、output-migration の入口が読むのは `path`（1 節の 26 行目）と `analysisDir`（39 行目）だけです。3 つはそれぞれ自分で `runMigrationInDevkit` を呼ぶので、プログラムは 3 回作られます（`chain` の前の `Rule` が書いた `Tree` を次が読みます）。

## ここまでの呼び出し

- 👤 `ng generate @angular/core:output-migration` — collection.json — *または signals から chain*
  - `migrate(options)` — ng-generate/output-migration/index.ts — *shouldMigrate・analysisDir*
    - `runMigrationInDevkit` — utils/tsurge/helpers/angular\_devkit
      - `OutputMigration.analyze(info)` — output-migration.ts — *tsconfig ごと*
        - `outputMigrationVisitor` — output-migration.ts — *宣言・next・complete・emit()・pipe*
          - `calculateDeclarationReplacement` ほか — output-replacements.ts
        - `createFindAllSourceFileReferencesVisitor` — signal-migration/src/passes/reference\_resolution — *テンプレートと host*
        - `calculateImportReplacements` — output-replacements.ts — *add / addAndRemove*
      - `combine` → `globalMeta` → `stats`
      - `migrate(globalData)` — output-migration.ts — *問題のある出力を ID ごと捨てる*

## テストと直し方

### spec の置き場

| ファイル | 形 | ターゲット | 件数（2026-11-03） |
| --- | --- | --- | --- |
| `migrations/output-migration/output-migration.spec.ts`（827 行） | `runTsurgeMigration(new OutputMigration(), [...])` でメモリの中のファイルに直接かける。`describe('outputs')` の下に `outputs migration`・`.next migration`・`.complete migration`・`.pipe migration`・`statistics`・`non-regression` | `//packages/core/schematics/migrations/output-migration:test` | 36 specs、0.7 秒 |
| `test/output_migration_spec.ts`（L56 `it('should work')`）・`test/signals_migration_spec.ts`（L60・L94） | 本物の bundle を `SchematicTestRunner` で走らせる（[第 19 回](19-mig-testing.md)） | `//packages/core/schematics/test:test`（16 shard） | フィルタで 3 specs |

📄 `ターミナル（cd ~/angular-research/angular）`

```
pnpm bazel test //packages/core/schematics/migrations/output-migration:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=.next migration"

pnpm bazel test //packages/core/schematics/test:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=output migration|combined signals migration"
```

📄 `出力（2026-11-03 に実行。抜粋）`

```
==================== Test output for //packages/core/schematics/migrations/output-migration:test:
Ran 8 of 36 specs
8 specs, 0 failures
Finished in 0.068 seconds
INFO: Elapsed time: 1.251s, Critical Path: 0.74s
//packages/core/schematics/migrations/output-migration:test              PASSED in 0.7s

==================== Test output for //packages/core/schematics/test:test (16 shard):
（13 の shard）Ran 0 of 515 specs / 0 specs, 0 failures
（3 の shard） Ran 1 of 516 specs / 1 spec, 0 failures
INFO: Elapsed time: 4.569s, Critical Path: 1.95s
//packages/core/schematics/test:test                                     PASSED in 1.7s
```

1 本目は `.next migration` の describe の 8 件だけを選びました。2 本目は 16 の shard のうち 13 が「Ran 0」、3 つが「Ran 1」で、合計 3 件です（output\_migration\_spec.ts の 1 件と signals\_migration\_spec.ts の 2 件）。0 件の shard も PASSED になるので、件数を足して確かめます。

### void の TODO を確かめている spec

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.spec.ts` L201–228 （▶ の行: 201–202, 208, 211, 219, 223）

```ts
201 ▶       it('should not insert a TODO comment for emit function with void type', async () => {
202 ▶         await verify({
203 │           before: `
204 │               import {Directive, Output, EventEmitter} from '@angular/core';
205 │ 
206 │               @Directive()
207 │               export class TestDir {
208 ▶                 @Output() someChange = new EventEmitter<void>();
209 │ 
210 │                 someMethod(): void {
211 ▶                   this.someChange.emit();
212 │                 }
213 │               }
214 │             `,
215 │           after: `
216 │               import {Directive, output} from '@angular/core';
217 │ 
218 │               @Directive()
219 ▶               export class TestDir {
220 │                 readonly someChange = output<void>();
221 │ 
222 │                 someMethod(): void {
223 ▶                   this.someChange.emit();
224 │                 }
225 │               }
226 │             `,
227 │         });
228 │       });
```

16fe27bfefa で足された spec です。208 行目の `EventEmitter<void>` に対して、223 行目の後ろに TODO が入らないことを確かめます。

### 読んでいて気付いた点と、手元で確かめた結果

spec を足さずに動きを見るため、bazel が作った本物の bundle（`dist/bin/packages/core/schematics/bundles/output-migration.cjs`）を、`test/output_migration_spec.ts` と同じ `SchematicTestRunner` の手順で走らせる小さなスクリプトを手元（リポジトリの外）に書いて試しました。結果は次のとおりです（2026-11-03、22.2.0-next.7）。

📄 `試した入力と出力 1：Subject の @Output と EventEmitter の @Output が同じファイル`

```
// 入力 /dir.ts
import {Directive, Output, EventEmitter} from '@angular/core';
import {Subject} from 'rxjs';

@Directive({})
export class SomeDirective {
  @Output() s = new Subject<number>();
  @Output() alias = new EventEmitter<string>();

  fire() {
    this.s.next(1);
  }
}

// ng generate @angular/core:output-migration のあと
import {Directive, output} from '@angular/core';
import {Subject} from 'rxjs';

@Directive({})
export class SomeDirective {
  @Output() s = new Subject<number>();
  readonly alias = output<string>();

  fire() {
    this.s.emit(1);
  }
}
// ログ: -> Migrated 2 out of 3 detected outputs (66.67 %).
```

📄 `試した入力と出力 2：別名が静的でない @Output だけ`

```
// 入力 /dir.ts（ファイルは変わらない）
import {Directive, Output, EventEmitter} from '@angular/core';

declare function getAlias(): string;

@Directive({})
export class SomeDirective {
  @Output(getAlias()) x = new EventEmitter<string>();
}
// ログ: -> Migrated -1 out of 1 detected outputs (-100.00 %).
```

📄 `試した入力と出力 3：型を注釈にだけ書いた EventEmitter`

```
// 入力 /dir.ts
@Directive({})
export class SomeDirective {
  @Output() x: EventEmitter<string> = new EventEmitter();

  fire() {
    this.x.emit();
  }
}

// あと（TODO は入らない）
@Directive({})
export class SomeDirective {
  readonly x = output<string>();

  fire() {
    this.x.emit();
  }
}
```

- 出力 1：`this.s.next(1)` が `this.s.emit(1)` になり（4 節）、`@Output() s` が残ったまま `Output` の import が消えました（8 節）。どちらもコンパイルエラーです。
- 出力 2：統計が「Migrated -1 out of 1 detected outputs (-100.00 %)」でした（8 節の 385 行目）。
- 出力 3：引数のない `emit()` に TODO が付かず、`output<string>()` の `emit()` を引数なしで呼ぶ形が残りました（5 節の 517 行目）。

`gh search issues` で「output migration」「Subject」「import」などを組み合わせて探した範囲では、同じ報告は見つかりませんでした（テンプレートの側の #58630 は閉じています）。

📄 `angular/packages/core/schematics/migrations/output-migration/output-migration.spec.ts` L647–678 （▶ の行: 648–649, 663–664）

```ts
647 │       describe('declarations _with_ problematic access patterns', () => {
648 ▶         it('should _not_ migrate outputs that are used with .pipe', () => {
649 ▶           verifyNoChange(`
650 │               import {Directive, Output, EventEmitter} from '@angular/core';
651 │ 
652 │               @Directive()
653 │               export class TestDir {
654 │                 @Output() someChange = new EventEmitter();
655 │ 
656 │                 someMethod() {
657 │                   this.someChange.pipe();
658 │                 }
659 │               }
660 │             `);
661 │         });
662 │ 
663 ▶         it('should _not_ migrate outputs that are used with .pipe outside of a component class', () => {
664 ▶           verifyNoChange(`
665 │               import {Directive, Output, EventEmitter} from '@angular/core';
666 │ 
667 │               @Directive()
668 │               export class TestDir {
669 │                 @Output() someChange = new EventEmitter();
670 │               }
671 │ 
672 │               let instance: TestDir;
673 │ 
674 │               instance.someChange.pipe();
675 │             `);
676 │         });
677 │       });
678 │     });
```

- 648 行目と 663 行目の `it` は `async` ではなく、649・664 行目の `verifyNoChange(...)` の Promise を `await` も `return` もしていません。jasmine はコールバックが戻った時点でこの spec を終わりにするので、`verify` の中の `expect` はこの 2 つの `it` の合否に入りません。同じ describe の他の spec は `await` しています（例：L322）。
- 2 節の 142 行目（`replace` の戻り値を捨てている）。今は動作に出ていません。

spec を足すなら、出力 1 は `describe('declarations other than EventEmitter')`（L681）、出力 2 は `describe('statistics')`（L690）、出力 3 は L230「should insert a TODO comment for emit function with type」の隣です。

直す場所の入口は、判定が `output-migration.ts` の `outputMigrationVisitor`（2・4〜6 節の引用）、置き換えの文字列が `output-replacements.ts`、統計が `stats` です。spec はどれも `output-migration.spec.ts` の `verify`（before / after の文字列を比べる）に 1 件足す形になります。関係する閉じた issue は #58650・#59248・#58630 で、どれも上の行に修正が入っています。開いている `area: migrations` の issue のうち #71147（signal queries と style の schematics が 2 回以上走る）は `ng-generate/signals` の近くの話で、[第 20 回](20-mig-issues.md)で読みます。ここに挙げた点も、本家に PR を出す前に、まず手元で spec を書いて動きを確かめ、既存の issue を探すところまでにします。

## 聞かれそうな質問

**Q. @Output() x = new Subject() は移行されますか？**

宣言は移行されません。output\_helpers.ts の 38〜41 行目は初期化子が `new EventEmitter` のときだけ真で、それ以外は output-migration.ts の 171〜172 行目で「移行できなかった数」に入るだけです（spec「should \_not\_ migrate outputs that are initialized with sth else than EventEmitter」）。ただし同じプロジェクトにその出力の `.next()` があると、188〜193 行目で置き換えが登録されて `.emit()` に変わり、同じファイルに移行した出力があると `Output` の import も消えます（テスト節の出力 1）。

**Q. 1 か所でも .pipe() を使っていると、その出力の .next() の書き換えも止まりますか？**

止まります。置き換えは出力の ID ごとに 1 つのリストに入っていて（addOutputReplacement）、migrate の 415 行目で `problematicUsages` に ID があればリストごと捨てます。テストファイルの `.pipe()` だけは 238〜245 行目で `outputToObservable` に書き換えるので止まりません。

**Q. .complete() を消して大丈夫なのですか？**

マイグレーションが消すのは、文として単独の呼び出しだけです（208 行目）。`OutputEmitterRef` には `complete()` が無いので残すと型エラーになります。式の一部なら 215〜217 行目で出力ごと移行をやめます。

**Q. emit() の上に TODO が入ったのはなぜですか？**

元の宣言が `new EventEmitter<T>()` で、`T` が void 以外なのに引数なしで呼んでいたからです（463・479・480 行目）。`output<T>()` の `emit` は引数が必須なので、型エラーの場所を人に知らせます。型を注釈にだけ書いた宣言では 517 行目が `null` を返すので、TODO は入りません。

**Q. ng generate @angular/core:signals で bestEffortMode を付けると output にも効きますか？**

効きません。signals/index.ts の 41 行目で同じ options を渡しますが、output-migration の入口が読むのは `path` と `analysisDir` だけです（ng-generate/output-migration/index.ts の 26・39 行目）。

## 読み終えて

- 対象は「@angular/core の `@Output` で、初期化子が `new EventEmitter`」の宣言だけ。判定は構文で、別名の import は数えない。
- `.next` → `.emit`・`.complete()` の削除・TODO・テンプレートの置き換えは、すべて出力の ID の下に集め、`migrate` で ID ごとに採るか捨てる。
- 移行をやめる理由は、静的でない別名・式の中の `.complete()`・テスト以外の `.pipe()` の 3 つ。`.subscribe()` は調べない。
- `ng-generate/signals` は 3 つの `Rule` を名前順に `chain` するだけで、プログラムは 3 回作られる。
- `new Subject()` の `@Output` の `.next()` が書き換わる・import が消える・統計が負になる、の 3 つは手元の実行で確かめた。spec の 648・663 行目の `await` 抜けも合わせて、issue を読むときの手がかりにする。

---

← 前: [signal クエリへの移行：@ViewChild を viewChild() に](10-mig-signal-queries.md)  
次: [制御フローへの移行：\*ngIf を @if に](12-mig-control-flow.md) →
