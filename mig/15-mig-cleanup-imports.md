[目次](../README.md) › [マイグレーションの内側](README.md) › 第 15 回 / 全 20 回

# 使っていない import を消す・CommonModule を分ける

> cleanup-unused-imports が NgCompiler の診断（NG8113 使っていない standalone の import）を集めて、imports の配列から消す仕組みと、消したあとに要らなくなった TS の import も消す行。common-to-standalone-migration が CommonModule を NgIf・AsyncPipe など使っているものだけに分ける仕組み。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-cleanup-imports)

---

standalone のコンポーネントの `imports` は、書き足すのは簡単でも、要らなくなったものを消すのは忘れがちです。この章では 2 つの `ng generate` を読みます。`cleanup-unused-imports` は自分では何も判定せず、**コンパイラの診断 NG8113（使っていない standalone の import）をそのまま使って**配列から消し、要らなくなった TypeScript の import 文も消します。`common-to-standalone-migration` は `imports: [CommonModule]` を、テンプレートで使っている `NgIf`・`AsyncPipe` などだけに分けます。こちらはテンプレートを**正規表現**で調べます。

読む対象は `packages/core/schematics/ng-generate/cleanup-unused-imports/`（`index.ts`・`unused_imports_migration.ts`）と `ng-generate/common-to-standalone-migration/`（`index.ts`・`migration.ts`・`util.ts`）、`test/cleanup_unused_imports_migration_spec.ts`・`test/common_to_standalone_migration_spec.ts` です。

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
15. **15. 使っていない import**（この章）
16. [16. ルーティング](16-mig-routing.md)
17. [17. v22（1）既定](17-mig-v22-defaults.md)
18. [18. v22（2）?.](18-mig-v22-safe-navigation.md)
19. [19. テスト](19-mig-testing.md)
20. [20. issue と PR を読む](20-mig-issues.md)

> [!NOTE]
> **ポイント**
>
> NG8113 がどう決まるか（テンプレートを束縛して「使った集合」を作り、`imports` の各要素と比べる `UnusedStandaloneImportsRule`）は [standalone-used-only](../standalone/04-standalone-used-only.md) で読みました。この章はその診断を「受け取って書き換える」側です。

## 1. cleanup-unused-imports の入口：診断を必ず出すプログラム

📄 `angular/packages/core/schematics/ng-generate/cleanup-unused-imports/index.ts` L13–47 （▶ の行: 13, 15–16, 31, 34–35, 37–39）

```ts
13 ▶ export function migrate(): Rule {
14 │   return async (tree, context) => {
15 ▶     await runMigrationInDevkit({
16 ▶       getMigration: () => new UnusedImportsMigration(),
17 │       tree,
18 │       beforeProgramCreation: (tsconfigPath, stage) => {
19 │         if (stage === MigrationStage.Analysis) {
20 │           context.logger.info(`Preparing analysis for: ${tsconfigPath}...`);
21 │         } else {
22 │           context.logger.info(`Running migration for: ${tsconfigPath}...`);
23 │         }
24 │       },
25 │       beforeUnitAnalysis: (tsconfigPath) => {
26 │         context.logger.info(`Scanning for unused imports using ${tsconfigPath}`);
27 │       },
28 │       afterAnalysisFailure: () => {
29 │         context.logger.error('Schematic failed unexpectedly with no analysis data');
30 │       },
31 ▶       whenDone: ({removedImports, changedFiles}) => {
32 │         let statsMessage: string;
33 │ 
34 ▶         if (removedImports === 0) {
35 ▶           statsMessage = 'Schematic could not find unused imports in the project';
36 │         } else {
37 ▶           statsMessage =
38 ▶             `Removed ${removedImports} import${removedImports !== 1 ? 's' : ''} ` +
39 ▶             `in ${changedFiles} file${changedFiles !== 1 ? 's' : ''}`;
40 │         }
41 │ 
42 │         context.logger.info('');
43 │         context.logger.info(statsMessage);
44 │       },
45 │     });
46 │   };
47 │ }
```

13 行目、`migrate()` はオプションを受け取りません（`schema.json` の `properties` も空です）。`path` で絞ることはできず、`angular.json` の全部の tsconfig が対象です。15 行目の `runMigrationInDevkit` は Tsurge の道具で（[第 4 回](04-mig-tsurge.md)）、終わると 31〜44 行目で「Removed 2 imports in 1 file」のような 1 行を出します。spec はこの文字列を確かめます。

📄 `angular/packages/core/schematics/ng-generate/cleanup-unused-imports/unused_imports_migration.ts` L60–76 （▶ の行: 61, 67–70, 72）

```ts
60 │ /** Migration that cleans up unused imports from a project. */
61 ▶ export class UnusedImportsMigration extends TsurgeFunnelMigration<
62 │   CompilationUnitData,
63 │   CompilationUnitData
64 │ > {
65 │   private printer = ts.createPrinter();
66 │ 
67 ▶   override createProgram(tsconfigAbsPath: string, fs: FileSystem): ProgramInfo {
68 ▶     return super.createProgram(tsconfigAbsPath, fs, {
69 ▶       extendedDiagnostics: {
70 ▶         checks: {
71 │           // Ensure that the diagnostic is enabled.
72 ▶           unusedStandaloneImports: DiagnosticCategoryLabel.Warning,
73 │         },
74 │       },
75 │     });
76 │   }
```

67〜76 行目で、プログラムを作る関数を上書きしています。基底の `createProgram` に 3 つ目の引数として Angular のコンパイラのオプションを足し、72 行目で `extendedDiagnostics.checks.unusedStandaloneImports` を `Warning` にします。69〜75 行目のコメントは「Ensure that the diagnostic is enabled.」です。この値は `utils/tsurge/helpers/ngtsc_program.ts` で `{...tsconfig.options, ...既定, ...この値}` と浅く重ねられるので、利用者の tsconfig の `extendedDiagnostics` は丸ごとこの値に置き換わります。NG8113 を `suppress` にしていても診断が出ます。

## 2. analyze：NG8113 の位置を集める

📄 `angular/packages/core/schematics/ng-generate/cleanup-unused-imports/unused_imports_migration.ts` L78–116 （▶ の行: 84, 86–89, 92–93, 96, 99, 103–105, 107–109, 112）

```ts
 78 │   override async analyze(info: ProgramInfo): Promise<Serializable<CompilationUnitData>> {
 79 │     const nodePositions = new Map<ts.SourceFile, Set<string>>();
 80 │     const replacements: Replacement[] = [];
 81 │     let removedImports = 0;
 82 │     let changedFiles = 0;
 83 │ 
 84 ▶     info.ngCompiler?.getDiagnostics().forEach((diag) => {
 85 │       if (
 86 ▶         diag.file !== undefined &&
 87 ▶         diag.start !== undefined &&
 88 ▶         diag.length !== undefined &&
 89 ▶         diag.code === ngErrorCode(ErrorCode.UNUSED_STANDALONE_IMPORTS)
 90 │       ) {
 91 │         // Skip files that aren't owned by this compilation unit.
 92 ▶         if (!info.sourceFiles.includes(diag.file)) {
 93 ▶           return;
 94 │         }
 95 │ 
 96 ▶         if (!nodePositions.has(diag.file)) {
 97 │           nodePositions.set(diag.file, new Set());
 98 │         }
 99 ▶         nodePositions.get(diag.file)!.add(this.getNodeKey(diag.start, diag.length));
100 │       }
101 │     });
102 │ 
103 ▶     nodePositions.forEach((locations, sourceFile) => {
104 ▶       const resolvedLocations = this.resolveRemovalLocations(sourceFile, locations);
105 ▶       const usageAnalysis = this.analyzeUsages(sourceFile, resolvedLocations);
106 │ 
107 ▶       if (resolvedLocations.allRemovedIdentifiers.size > 0) {
108 ▶         removedImports += resolvedLocations.allRemovedIdentifiers.size;
109 ▶         changedFiles++;
110 │       }
111 │ 
112 ▶       this.generateReplacements(sourceFile, resolvedLocations, usageAnalysis, info, replacements);
113 │     });
114 │ 
115 │     return confirmAsSerializable({replacements, removedImports, changedFiles});
116 │   }
```

1. **84 行目：`NgCompiler` の診断を全部取る**

   `getDiagnostics()` はテンプレートの型チェックと拡張診断まで走らせます。マイグレーションの中でいちばん時間がかかる行で、閉じた issue #59813（大きなプロジェクトでメモリが足りなくなる。フォルダで絞りたい）はここに当たります。
2. **85〜89 行目：位置があり、番号が NG8113 のものだけ**

   `ngErrorCode(ErrorCode.UNUSED_STANDALONE_IMPORTS)` は、Angular の番号 8113 を TypeScript の診断の `code` と同じ形の数に直したものです。
3. **92〜94 行目：このコンパイル単位のファイルだけ**

   アプリとテストの tsconfig の両方に入っているファイルは、2 回見つかります。ここで「この単位が持っているファイル」に限ります（spec「should handle a file that is present in multiple projects」L213）。
4. **96〜99 行目：位置を `"start/length"` の文字列にして、ファイルごとの `Set` に入れる**

   診断には AST のノードが付いていないので、位置からノードを探し直します（次の節）。
5. **103〜113 行目：ファイルごとに、ノードを探す → 使われ方を数える → 置き換えを作る**

   107〜110 行目で、消す識別子の数と変えるファイルの数を足し、1 節の表示に使います。

📄 `angular/packages/core/schematics/ng-generate/cleanup-unused-imports/unused_imports_migration.ts` L118–144 （▶ の行: 118–119, 126–129）

```ts
118 ▶   override async migrate(globalData: CompilationUnitData) {
119 ▶     return confirmAsSerializable(globalData);
120 │   }
121 │ 
122 │   override async combine(
123 │     unitA: CompilationUnitData,
124 │     unitB: CompilationUnitData,
125 │   ): Promise<Serializable<CompilationUnitData>> {
126 ▶     return confirmAsSerializable({
127 ▶       replacements: [...unitA.replacements, ...unitB.replacements],
128 ▶       removedImports: unitA.removedImports + unitB.removedImports,
129 ▶       changedFiles: unitA.changedFiles + unitB.changedFiles,
130 │     });
131 │   }
132 │ 
133 │   override async globalMeta(
134 │     combinedData: CompilationUnitData,
135 │   ): Promise<Serializable<CompilationUnitData>> {
136 │     return confirmAsSerializable(combinedData);
137 │   }
138 │ 
139 │   override async stats(globalMetadata: CompilationUnitData) {
140 │     return confirmAsSerializable({
141 │       removedImports: globalMetadata.removedImports,
142 │       changedFiles: globalMetadata.changedFiles,
143 │     });
144 │   }
```

このマイグレーションは `analyze` の中で置き換えまで作ってしまい、`combine` は配列をつなぐだけ、`migrate` は受け取ったものを返すだけです（118〜120 行目）。`TsurgeFunnelMigration` の 4 つの段を使っていますが、単位をまたいで判断することはありません。

## 3. 位置からノードへ：配列ごと消すか、要素だけ消すか

📄 `angular/packages/core/schematics/ng-generate/cleanup-unused-imports/unused_imports_migration.ts` L166–205 （▶ の行: 167–168, 179, 182–185, 187, 190, 193, 197–198）

```ts
166 │     const walk = (node: ts.Node) => {
167 ▶       if (!ts.isIdentifier(node)) {
168 ▶         node.forEachChild(walk);
169 │         return;
170 │       }
171 │ 
172 │       // The TS typings don't reflect that the parent can be undefined.
173 │       const parent = node.parent as ts.Node | undefined;
174 │ 
175 │       if (!parent) {
176 │         return;
177 │       }
178 │ 
179 ▶       if (locations.has(this.getNodeKey(node.getStart(), node.getWidth()))) {
180 │         // When the entire array needs to be cleared, the diagnostic is
181 │         // reported on the property assignment, rather than an array element.
182 ▶         if (
183 ▶           ts.isPropertyAssignment(parent) &&
184 ▶           parent.name === node &&
185 ▶           ts.isArrayLiteralExpression(parent.initializer)
186 │         ) {
187 ▶           result.fullRemovals.add(parent.initializer);
188 │           parent.initializer.elements.forEach((element) => {
189 │             if (ts.isIdentifier(element)) {
190 ▶               result.allRemovedIdentifiers.add(element.text);
191 │             }
192 │           });
193 ▶         } else if (ts.isArrayLiteralExpression(parent)) {
194 │           if (!result.partialRemovals.has(parent)) {
195 │             result.partialRemovals.set(parent, new Set());
196 │           }
197 ▶           result.partialRemovals.get(parent)!.add(node);
198 ▶           result.allRemovedIdentifiers.add(node.text);
199 │         }
200 │       }
201 │     };
202 │ 
203 │     walk(sourceFile);
204 │ 
205 │     return result;
```

167〜170 行目でファイルの中の識別子を全部たどり、179 行目で識別子の位置と幅が診断のキーに一致するものを探します。一致した識別子の親で 2 通りに分かれます。

- **182〜192 行目：親が `imports: [...]` のプロパティで、識別子がその名前**

  180〜181 行目のコメントのとおり、配列の要素が**全部**使われていないとき、NG8113 は要素ではなく `imports` という名前の上に 1 つだけ出ます。この場合は配列ごと `fullRemovals` に入れ、要素の識別子を全部「消した名前」に数えます。
- **193〜199 行目：親が配列**

  要素ごとに `partialRemovals` に入れます。

📄 `angular/packages/core/schematics/ng-generate/cleanup-unused-imports/unused_imports_migration.ts` L282–315 （▶ の行: 288, 292–295, 302–303, 307, 312）

```ts
282 │     const {fullRemovals, partialRemovals, allRemovedIdentifiers} = removalLocations;
283 │     const {importedSymbols, identifierCounts} = usages;
284 │     const importManager = new ImportManager();
285 │     const sourceText = sourceFile.getFullText();
286 │ 
287 │     // Replace full arrays with empty ones. This allows preserves more of the user's formatting.
288 ▶     fullRemovals.forEach((node) => {
289 │       replacements.push(
290 │         new Replacement(
291 │           projectFile(sourceFile, info),
292 ▶           new TextUpdate({
293 ▶             position: node.getStart(),
294 ▶             end: node.getEnd(),
295 ▶             toInsert: '[]',
296 │           }),
297 │         ),
298 │       );
299 │     });
300 │ 
301 │     // Filter out the unused identifiers from an array.
302 ▶     partialRemovals.forEach((toRemove, parent) => {
303 ▶       toRemove.forEach((node) => {
304 │         replacements.push(
305 │           new Replacement(
306 │             projectFile(sourceFile, info),
307 ▶             getArrayElementRemovalUpdate(node, sourceText),
308 │           ),
309 │         );
310 │       });
311 │ 
312 ▶       stripTrailingSameLineCommas(parent, toRemove, sourceText)?.forEach((update) => {
313 │         replacements.push(new Replacement(projectFile(sourceFile, info), update));
314 │       });
315 │     });
```

📄 `angular/packages/core/schematics/ng-generate/cleanup-unused-imports/unused_imports_migration.ts` L338–360 （▶ の行: 339–340, 344, 349–353）

```ts
338 │ function getArrayElementRemovalUpdate(node: ts.Expression, sourceText: string): TextUpdate {
339 ▶   let position = node.getStart();
340 ▶   let end = node.getEnd();
341 │   let toInsert = '';
342 │   const whitespaceOrLineFeed = /\s/;
343 │ 
344 ▶   // Usually the way we'd remove the nodes would be to recreate the `parent` while excluding
345 │   // the nodes that should be removed. The problem with this is that it'll strip out comments
346 │   // inside the array which can have special meaning internally. We work around it by removing
347 │   // only the node's own offsets. This comes with another problem in that it won't remove the commas
348 │   // that separate array elements which in turn can look weird if left in place (e.g.
349 ▶   // `[One, Two, Three, Four]` can turn into `[One,,Four]`). To account for them, we start with the
350 ▶   // node's end offset and then expand it to include trailing commas, whitespace and line breaks.
351 ▶   for (let i = end; i < sourceText.length; i++) {
352 ▶     if (sourceText[i] === ',' || whitespaceOrLineFeed.test(sourceText[i])) {
353 ▶       end++;
354 │     } else {
355 │       break;
356 │     }
357 │   }
358 │ 
359 │   return new TextUpdate({position, end, toInsert});
360 │ }
```

配列ごとのときは 293〜295 行目で配列の範囲を `[]` にします（プロパティ自体は残すので、spec は `imports: [],` を確かめます）。要素だけのときは、配列を作り直して印刷するのではなく、要素の範囲だけを消します。344〜350 行目のコメントのとおり、作り直すと配列の中のコメント（内部で意味を持つことがある）が消えるからです。351〜357 行目で要素の後ろのカンマと空白まで範囲を広げ、`[One,,Four]` のようにならないようにします。最後の要素だけが残ったときの、その要素の後ろの余ったカンマは 312 行目の `stripTrailingSameLineCommas` が、同じ行の中だけ消します。

## 4. TypeScript の import 文も消す

📄 `angular/packages/core/schematics/ng-generate/cleanup-unused-imports/unused_imports_migration.ts` L220–256 （▶ の行: 222, 225–227, 229, 233–234, 237, 243, 248–250, 255）

```ts
220 │     const walk = (node: ts.Node) => {
221 │       if (
222 ▶         ts.isIdentifier(node) &&
223 │         node.parent &&
224 │         // Don't track individual identifiers marked for removal.
225 ▶         (!ts.isArrayLiteralExpression(node.parent) ||
226 ▶           !partialRemovals.has(node.parent) ||
227 ▶           !partialRemovals.get(node.parent)!.has(node))
228 │       ) {
229 ▶         result.identifierCounts.set(node.text, (result.identifierCounts.get(node.text) ?? 0) + 1);
230 │       }
231 │ 
232 │       // Don't track identifiers in array literals that are about to be removed.
233 ▶       if (ts.isArrayLiteralExpression(node) && fullRemovals.has(node)) {
234 ▶         return;
235 │       }
236 │ 
237 ▶       if (ts.isImportDeclaration(node)) {
238 │         const namedBindings = node.importClause?.namedBindings;
239 │         const moduleName = ts.isStringLiteral(node.moduleSpecifier)
240 │           ? node.moduleSpecifier.text
241 │           : null;
242 │ 
243 ▶         if (namedBindings && ts.isNamedImports(namedBindings) && moduleName !== null) {
244 │           namedBindings.elements.forEach((imp) => {
245 │             if (!result.importedSymbols.has(moduleName)) {
246 │               result.importedSymbols.set(moduleName, new Map());
247 │             }
248 ▶             const symbolName = (imp.propertyName || imp.name).text;
249 ▶             const localName = imp.name.text;
250 ▶             result.importedSymbols.get(moduleName)!.set(localName, symbolName);
251 │           });
252 │         }
253 │ 
254 │         // Don't track identifiers in imports.
255 ▶         return;
256 │       }
```

📄 `angular/packages/core/schematics/ng-generate/cleanup-unused-imports/unused_imports_migration.ts` L317–334 （▶ の行: 317–322, 327–328, 333）

```ts
317 ▶     // Attempt to clean up unused import declarations. Note that this isn't foolproof, because we
318 ▶     // do the matching based on identifier text, rather than going through the type checker which
319 ▶     // can be expensive. This should be enough for the vast majority of cases in this schematic
320 ▶     // since we're dealing exclusively with directive/pipe class names which tend to be very
321 ▶     // specific. In the worst case we may end up not removing an import declaration which would
322 ▶     // still be valid code that the user can clean up themselves.
323 │     importedSymbols.forEach((names, moduleName) => {
324 │       names.forEach((symbolName, localName) => {
325 │         // Note that in the `identifierCounts` lookup both zero and undefined
326 │         // are valid and mean that the identifiers isn't being used anymore.
327 ▶         if (allRemovedIdentifiers.has(localName) && !identifierCounts.get(localName)) {
328 ▶           importManager.removeImport(sourceFile, symbolName, moduleName);
329 │         }
330 │       });
331 │     });
332 │ 
333 ▶     applyImportManagerChanges(importManager, replacements, [sourceFile], info);
334 │   }
```

1. **221〜230 行目：ファイルの中の識別子の名前ごとに、出てくる回数を数える**

   ただし、これから消す要素（225〜227 行目）と、これから空にする配列の中（233〜235 行目）は数えません。
2. **237〜256 行目：import 文は数えず、「モジュール → (この名前 → 元の名前)」の表を作る**

   `import {One as Uno}` なら `Uno → One`。255 行目で import 文の中へは降りないので、import 文の名前は回数に入りません。
3. **327〜328 行目：消した名前で、残りの回数が 0 なら import を消す**

   317〜322 行目のコメントのとおり、型チェッカーではなく**名前の文字列**で判定します。同じファイルの別のコンポーネントがまだ `One` を使っていれば回数が残るので import 文も残ります（下の spec）。名前だけで数えるので、関係のない同じ名前の変数があっても回数が残り、import 文が残ります。コメントは「残っても正しいコードのままなので、利用者が消せばよい」としています。

📄 `angular/packages/core/schematics/test/cleanup_unused_imports_migration_spec.ts` L147–175 （▶ の行: 154, 156, 160, 162, 171–173）

```ts
147 │   it('should preserve import declaration if unused import is still used within the file', async () => {
148 │     writeFile(
149 │       'comp.ts',
150 │       `
151 │         import {Component} from '@angular/core';
152 │         import {One} from './directives';
153 │ 
154 ▶         @Component({
155 │           imports: [One],
156 ▶           template: '',
157 │         })
158 │         export class Comp {}
159 │ 
160 ▶         @Component({
161 │           imports: [One],
162 ▶           template: '<div one></div>',
163 │         })
164 │         export class OtherComp {}
165 │       `,
166 │     );
167 │ 
168 │     await runMigration();
169 │     const contents = tree.readContent('comp.ts');
170 │ 
171 ▶     expect(logs.pop()).toBe('Removed 1 import in 1 file');
172 ▶     expect(contents).toContain('imports: [],');
173 ▶     expect(contents).toContain(`import {One} from './directives';`);
174 │   });
175 │ 
```

`Comp` の `imports: [One]` は全部使われていないので配列ごと `[]` に（172 行目）、`OtherComp` が `<div one>` で使っているので import 文は残ります（173 行目）。手元でも bundle を走らせて確かめました。

📄 `試した入力と出力（2026-11-03）`

```
// 入力 /a.ts（/card.ts に Card と Badge の 2 つのコンポーネント）
import {Component} from '@angular/core';
import {Card, Badge} from './card';

@Component({ selector: 'app-a', imports: [Card, Badge], template: '<app-card />' })
export class A {}

@Component({ selector: 'app-b', imports: [Badge], template: '' })
export class B {}

// ng generate @angular/core:cleanup-unused-imports のあと（形を詰めて表示）
import {Component} from '@angular/core';
import {Card} from './card';

@Component({ selector: 'app-a', imports: [Card], template: '<app-card />' })
export class A {}

@Component({ selector: 'app-b', imports: [], template: '' })
export class B {}
```

## 5. common-to-standalone-migration：CommonModule を分ける

📄 `angular/packages/core/schematics/ng-generate/common-to-standalone-migration/index.ts` L19–31 （▶ の行: 23–25, 27–28）

```ts
19 │ export function migrate(options: Options): Rule {
20 │   return async (tree, context) => {
21 │     await runMigrationInDevkit({
22 │       tree,
23 ▶       getMigration: (fs: FileSystem) =>
24 ▶         new CommonToStandaloneMigration({
25 ▶           shouldMigrate: (file) => {
26 │             return (
27 ▶               file.rootRelativePath.startsWith(fs.normalize(options.path)) &&
28 ▶               !/(^|\/)node_modules\//.test(file.rootRelativePath)
29 │             );
30 │           },
31 │         }),
```

📄 `angular/packages/core/schematics/ng-generate/common-to-standalone-migration/migration.ts` L93–132 （▶ の行: 93, 95–96, 99, 101, 107, 109, 111–112, 124–125）

```ts
 93 ▶       const hasComponentDecorator = decorators.some((d) => d.name === 'Component');
 94 │ 
 95 ▶       if (!hasComponentDecorator) {
 96 ▶         return;
 97 │       }
 98 │ 
 99 ▶       const ref = this.analyzeClass(node, typeChecker);
100 │ 
101 ▶       if (!ref) {
102 │         return;
103 │       }
104 │ 
105 │       references.push(ref);
106 │ 
107 ▶       const templateVisitor = new NgComponentTemplateVisitor(typeChecker);
108 │ 
109 ▶       templateVisitor.visitNode(node);
110 │ 
111 ▶       for (const template of templateVisitor.resolvedTemplates) {
112 ▶         processResolvedTemplate(
113 │           template,
114 │           node,
115 │           info,
116 │           typeChecker,
117 │           replacements,
118 │           filesWithNeededImports,
119 │         );
120 │       }
121 │ 
122 │       // Component has CommonModule in imports but no template content to analyze
123 │       // We still need to process these cases to remove unused CommonModule imports
124 ▶       if (templateVisitor.resolvedTemplates.length === 0) {
125 ▶         processResolvedTemplate(
126 │           {content: '', inline: false, filePath: null, start: 0},
127 │           node,
128 │           info,
129 │           typeChecker,
130 │           replacements,
131 │           filesWithNeededImports,
132 │         );
```

こちらも Tsurge の形で、`path` は 25〜30 行目の `shouldMigrate` でファイルを絞ります（`Options` に `analysisDir` もありますが、`schema.json` には無く、どこでも読んでいません）。93〜97 行目、`@Component` のクラスだけを対象にします。クラスのコメント（引用の外）には「standalone のコンポーネントと Angular のモジュール」とありますが、`@NgModule` の `imports` は見ていません。99 行目で `imports` に @angular/common の `CommonModule` があるかを確かめ、107〜109 行目で `NgComponentTemplateVisitor`（[第 6 回](06-mig-templates.md)）にインラインと外部のテンプレートの文字列を集めさせ、111〜120 行目で 1 つずつ処理します。テンプレートが見つからなければ 124〜132 行目で空の文字列として処理し、`CommonModule` だけを消します。

📄 `angular/packages/core/schematics/ng-generate/common-to-standalone-migration/util.ts` L239–257 （▶ の行: 241–243, 251, 254–255）

```ts
239 │   const importsArray = importsProperty.initializer;
240 │ 
241 ▶   return importsArray.elements.some((el) => {
242 ▶     if (!ts.isIdentifier(el)) return false;
243 ▶     return isCommonModuleFromAngularCommon(typeChecker, el);
244 │   });
245 │ }
246 │ 
247 │ function isCommonModuleFromAngularCommon(
248 │   typeChecker: ts.TypeChecker,
249 │   identifier: ts.Identifier,
250 │ ): boolean {
251 ▶   const importInfo = getImportOfIdentifier(typeChecker, identifier);
252 │   return (
253 │     importInfo !== null &&
254 ▶     importInfo.name === commonModuleStr &&
255 ▶     importInfo.importModule === angularCommonStr
256 │   );
257 │ }
```

251 行目の `getImportOfIdentifier` は型チェッカーで識別子の import 文をたどり、**元の名前**が `CommonModule` で、モジュールが `@angular/common` かを見ます。`import {CommonModule as CM}` の `CM` も拾い、自分のライブラリの `CommonModule` は拾いません（spec の `describe('Alias handling')` と `Dont migrate`）。

## 6. テンプレートを正規表現で調べる

📄 `angular/packages/core/schematics/ng-generate/common-to-standalone-migration/util.ts` L23–58 （▶ の行: 25–27, 32, 34–36, 38, 40, 45, 49）

```ts
23 │ const PATTERN_IMPORTS = [
24 │   // Structural directives
25 ▶   {pattern: /\*ngIf\b/g, imports: ['NgIf']},
26 ▶   {pattern: /\*ngFor\b/g, imports: ['NgFor']},
27 ▶   {pattern: /\[ngForOf]\b/g, imports: ['NgForOf']},
28 │   {pattern: /\[ngPlural\]/g, imports: ['NgPlural']},
29 │   // Match ngPluralCase as structural (*ngPluralCase) or attribute (ngPluralCase="value")
30 │   {pattern: /(\*ngPluralCase\b|\s+ngPluralCase\s*=)/g, imports: ['NgPluralCase']},
31 │   // Match ngSwitchCase as structural (*ngSwitchCase) or attribute (ngSwitchCase="value")
32 ▶   {pattern: /(\*ngSwitchCase\b|\s+ngSwitchCase\s*=)/g, imports: ['NgSwitchCase']},
33 │   // Match ngSwitchDefault as structural (*ngSwitchDefault) or standalone attribute (ngSwitchDefault>)
34 ▶   {pattern: /(\*ngSwitchDefault\b|\s+ngSwitchDefault(?=\s*>))/g, imports: ['NgSwitchDefault']},
35 ▶   {pattern: /\[ngClass\]/g, imports: ['NgClass']},
36 ▶   {pattern: /\[ngStyle\]/g, imports: ['NgStyle']},
37 │   // Match ngSwitch as property binding [ngSwitch] or attribute ngSwitch="value"
38 ▶   {pattern: /(\[ngSwitch\]|\s+ngSwitch\s*=)/g, imports: ['NgSwitch']},
39 │   // Match ngTemplateOutlet as structural (*ngTemplateOutlet) or property binding [ngTemplateOutlet]
40 ▶   {pattern: /(\*ngTemplateOutlet\b|\[ngTemplateOutlet\])/g, imports: ['NgTemplateOutlet']},
41 │   // Match ngComponentOutlet as structural (*ngComponentOutlet) or property binding [ngComponentOutlet]
42 │   {pattern: /(\*ngComponentOutlet\b|\[ngComponentOutlet\])/g, imports: ['NgComponentOutlet']},
43 │ 
44 │   // Common pipes
45 ▶   {pattern: /\|\s*async\b/g, imports: ['AsyncPipe']},
46 │   {pattern: /\|\s*json\b/g, imports: ['JsonPipe']},
47 │   {pattern: /\|\s*date\b/g, imports: ['DatePipe']},
48 │   {pattern: /\|\s*currency\b/g, imports: ['CurrencyPipe']},
49 ▶   {pattern: /\|\s*number\b/g, imports: ['DecimalPipe']},
50 │   {pattern: /\|\s*percent\b/g, imports: ['PercentPipe']},
51 │   {pattern: /\|\s*lowercase\b/g, imports: ['LowerCasePipe']},
52 │   {pattern: /\|\s*uppercase\b/g, imports: ['UpperCasePipe']},
53 │   {pattern: /\|\s*titlecase\b/g, imports: ['TitleCasePipe']},
54 │   {pattern: /\|\s*slice\b/g, imports: ['SlicePipe']},
55 │   {pattern: /\|\s*keyvalue\b/g, imports: ['KeyValuePipe']},
56 │   {pattern: /\|\s*i18nPlural\b/g, imports: ['I18nPluralPipe']},
57 │   {pattern: /\|\s*i18nSelect\b/g, imports: ['I18nSelectPipe']},
58 │ ];
```

📄 `angular/packages/core/schematics/ng-generate/common-to-standalone-migration/util.ts` L60–92 （▶ の行: 61, 63–65, 81, 83, 87–90）

```ts
60 │ function analyzeTemplateWithRegex(template: string, neededImports: Set<string>): void {
61 ▶   PATTERN_IMPORTS.forEach(({pattern, imports}) => {
62 │     // Reset regex lastIndex to avoid state issues with global flag
63 ▶     pattern.lastIndex = 0;
64 ▶     if (pattern.test(template)) {
65 ▶       imports.forEach((imp: string) => neededImports.add(imp));
66 │     }
67 │   });
68 │ }
69 │ 
70 │ function migrateCommonModuleUsage(
71 │   template: string,
72 │   componentNode: ts.ClassDeclaration,
73 │   typeChecker: ts.TypeChecker,
74 │ ): {
75 │   migrated: string;
76 │   changed: boolean;
77 │   replacementCount: number;
78 │   canRemoveCommonModule: boolean;
79 │   neededImports: string[];
80 │ } {
81 ▶   const analysis = analyzeTemplateContent(template);
82 │ 
83 ▶   const hasCommonModule = hasCommonModuleInImports(componentNode, typeChecker);
84 │ 
85 │   return {
86 │     migrated: template,
87 ▶     changed: hasCommonModule,
88 ▶     replacementCount: hasCommonModule ? 1 : 0,
89 ▶     canRemoveCommonModule: hasCommonModule,
90 ▶     neededImports: Array.from(analysis.neededImports),
91 │   };
92 │ }
```

テンプレートは解析しません。23〜58 行目の表の正規表現を 1 つずつ、テンプレートの**文字列全体**に `test` し、当たったものの名前を集めます（60〜68 行目）。63 行目の `lastIndex = 0` は、`g` の付いた正規表現を使い回すと前回の位置から探し始めるのを防ぐ行です。`| date` は `DatePipe`、`| number` は `DecimalPipe` のように、名前の違うものは表の側で対応を持っています。87〜89 行目、`changed` はテンプレートの中身ではなく「`imports` に CommonModule があるか」で決まります。

正規表現なので、表に無い書き方は見つかりません。表を読むと次のものが当たりません。

| テンプレート | 必要なもの | 当たらない理由 |
| --- | --- | --- |
| `<ng-template ngFor let-item [ngForOf]="items">` | `NgForOf` | 27 行目の `/\[ngForOf]\b/` は `]` の後ろに単語の境界を求めます。`]` も次の `=` も単語の文字ではないので、`[ngForOf]="…"` では境界になりません |
| `<p ngClass="highlight">`（静的な属性） | `NgClass` | 35 行目は `[ngClass]` だけ。`NgClass` のセレクターは `[ngClass]` なので静的な属性にも当たりますが、表にありません。`ngStyle`（36 行目）も同じです |

この 2 つは手元の実行で確かめました（下の出力）。`CommonModule` は消え、`UpperCasePipe` だけが入ります。`[ngForOf]` は知らないプロパティへのバインディングになるのでコンパイルエラー（NG8002）、静的な `ngClass` はエラーにならずにクラスが付かなくなります。spec の `describe('NgFor directive')`（L166）は `*ngFor` の形だけで、`[ngForOf]` の spec はありません。

📄 `試した入力と出力（2026-11-03）`

```
// 入力 /list.ts
@Component({
  selector: 'app-list',
  imports: [CommonModule],
  template: `
    <ng-template ngFor let-item [ngForOf]="items"><li>{{ item | uppercase }}</li></ng-template>
    <p ngClass="highlight">x</p>
  `,
})

// ng generate @angular/core:common-to-standalone のあと
import {UpperCasePipe} from '@angular/common';

@Component({
  selector: 'app-list',
  imports: [UpperCasePipe],
  template: （変わらない）
})
// ログ: -> Migrated 2 CommonModule references affecting 1 components.
```

> **🧪 デモ：PATTERN\_IMPORTS をテンプレートに当てる**
>
> util.ts の 23〜58 行目の表と 60〜68 行目の `analyzeTemplateWithRegex` を、このページにそのまま写したもの（移植）です。本物はこのあとで `imports` の配列と import 文を書き換えますが、デモは「どの名前が見つかるか」までです。正規表現の中身は本物と同じです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/mig-cleanup-imports)

📄 `angular/packages/core/schematics/ng-generate/common-to-standalone-migration/util.ts` L131–156 （▶ の行: 134, 136, 140, 145–147, 150, 152）

```ts
131 │   const importsArray = importsProperty.initializer;
132 │ 
133 │   const originalElements = importsArray.elements;
134 ▶   const filteredElements = originalElements.filter((el) => {
135 │     if (!ts.isIdentifier(el)) return true;
136 ▶     return !isCommonModuleFromAngularCommon(typeChecker, el);
137 │   });
138 │ 
139 │   // Get existing import names to avoid duplicates
140 ▶   const existingImportNames = new Set(
141 │     filteredElements.filter((el) => ts.isIdentifier(el)).map((el) => el.getText()),
142 │   );
143 │ 
144 │   // Only add imports that don't already exist
145 ▶   const importsToAdd = neededImports
146 ▶     .filter((imp) => !existingImportNames.has(imp))
147 ▶     .sort()
148 │     .map((imp) => ts.factory.createIdentifier(imp));
149 │ 
150 ▶   const newElements = [...filteredElements, ...importsToAdd];
151 │ 
152 ▶   if (newElements.length === originalElements.length && neededImports.length === 0) {
153 │     return null;
154 │   }
155 │ 
156 │   if (newElements.length === 0) {
```

📄 `angular/packages/core/schematics/ng-generate/common-to-standalone-migration/util.ts` L269–307 （▶ の行: 269, 273, 275, 282–283, 286–287, 292, 294, 296–298, 305–306）

```ts
269 ▶   if (result.changed) {
270 │     const sourceFile = componentNode.getSourceFile();
271 │     const file = projectFile(sourceFile, info);
272 │ 
273 ▶     filesWithNeededImports.set(sourceFile.fileName, result.neededImports);
274 │ 
275 ▶     const replacement = createCommonModuleImportsArrayRemoval(
276 │       componentNode,
277 │       file,
278 │       typeChecker,
279 │       result.neededImports,
280 │     );
281 │ 
282 ▶     if (replacement) {
283 ▶       replacements.push(replacement);
284 │     }
285 │ 
286 ▶     const importManager = new ImportManager({
287 ▶       shouldUseSingleQuotes: () => true,
288 │     });
289 │ 
290 │     // Always remove 'CommonModule' regardless of whether it's aliased or not
291 │     // ImportManager handles removing the correct import specifier
292 ▶     importManager.removeImport(sourceFile, commonModuleStr, angularCommonStr);
293 │ 
294 ▶     if (result.neededImports.length > 0) {
295 │       result.neededImports.forEach((importName) => {
296 ▶         importManager.addImport({
297 ▶           exportSymbolName: importName,
298 ▶           exportModuleSpecifier: angularCommonStr,
299 │           requestedFile: sourceFile,
300 │         });
301 │       });
302 │     }
303 │ 
304 │     const importReplacements: Replacement[] = [];
305 ▶     applyImportManagerChanges(importManager, importReplacements, [sourceFile], info);
306 ▶     replacements.push(...importReplacements);
307 │   }
```

134〜137 行目で配列から `CommonModule` を抜き、140〜148 行目で、すでに配列にある名前を除いて、見つかった名前を**アルファベット順**に後ろへ足します（008e20ca56a、重複して足していた問題の修正）。配列は 3 節の cleanup-unused-imports と違い、`updateArrayLiteralExpression` で作り直して印刷します（この関数の後半）。残った要素の前のコメントは印刷にも出ます（spec「should preserve comments in imports arrays」L961 は `/* Essential forms */ FormsModule` が残ることを確かめます）。286〜292 行目で @angular/common の import 文から `CommonModule` を消し、294〜302 行目で見つかった名前を足します。273 行目の `filesWithNeededImports` は `combine` でまとめられますが、`migrate` では使われていません。`stats` の `replacements` は `Replacement` の数（配列 1 つと import 文の変更の数）なので、ログの「Migrated 2 CommonModule references affecting 1 components.」の 2 は CommonModule の数ではありません。

## ここまでの呼び出し

- 👤 `ng generate @angular/core:cleanup-unused-imports`
  - `runMigrationInDevkit` → `UnusedImportsMigration.createProgram` — unused\_imports\_migration.ts — *unusedStandaloneImports: Warning*
    - `analyze` → `ngCompiler.getDiagnostics()` — unused\_imports\_migration.ts — *NG8113 の位置*
      - `resolveRemovalLocations` → `analyzeUsages` → `generateReplacements` — unused\_imports\_migration.ts
- 👤 `ng generate @angular/core:common-to-standalone`
  - `CommonToStandaloneMigration.analyze` → `visitSourceFile` — migration.ts — *@Component だけ*
    - `NgComponentTemplateVisitor` — utils/ng\_component\_template.ts
    - `processResolvedTemplate` → `analyzeTemplateWithRegex` — util.ts — *PATTERN\_IMPORTS*
      - `createCommonModuleImportsArrayRemoval`・`ImportManager` — util.ts

## テストと直し方

| ファイル | 中身 | ターゲット |
| --- | --- | --- |
| `test/cleanup_unused_imports_migration_spec.ts`（333 行） | `describe('cleanup unused imports schematic')`（L16）の 10 件。一部（L78）・全部（L101）・別名（L124）・import 文を残す（L147）・複数プロジェクト（L213）・コメント（L248・L288）・最初以外を全部（L311） | `//packages/core/schematics/test:test`（16 shard） |
| `test/common_to_standalone_migration_spec.ts`（1,758 行） | `describe('Common → standalone imports migration')`（L59）の 46 件。NgIf（L103）・NgFor（L166）・NgSwitch（L202）・Pipes（L575）・Dont migrate（L736）・Alias handling（L1143）・Mixed scenarios（L1234）など |   |

📄 `ターミナル（cd ~/angular-research/angular）`

```
pnpm bazel test //packages/core/schematics/test:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=cleanup unused imports schematic|Common → standalone"
```

📄 `出力（2026-11-03 に実行。抜粋）`

```
==================== Test output for //packages/core/schematics/test:test（16 shard）
（8 の shard）Ran 3 of 465 specs / 3 specs, 0 failures
（8 の shard）Ran 4 of 466 specs / 4 specs, 0 failures
INFO: Elapsed time: 5.613s, Critical Path: 2.35s
//packages/core/schematics/test:test                                     PASSED in 2.0s
```

16 の shard の合計 56 件（10 + 46）、0 failures、PASSED まで 2.0 秒でした。直す場所の入口は、cleanup が `unused_imports_migration.ts` の `resolveRemovalLocations`（位置の対応）と `generateReplacements`（文字列）、common-to-standalone が `util.ts` の `PATTERN_IMPORTS` です。6 節の 2 つは、`PATTERN_IMPORTS` の 27 行目と 35・36 行目の正規表現の話で、spec を足すなら `describe('NgFor directive')`・`describe('NgClass directive')`（L400）の隣です。`gh search issues` で探した範囲では、同じ報告は見つかりませんでした。このマイグレーションのもとになった機能の要望は閉じた issue #60808（CommonModule を個別の import に置き換えるマイグレーション）で、75fc16b261d で入りました。ここでも、まず手元で spec を書いて動きを確かめるところまでにします。

## 聞かれそうな質問

**Q. cleanup-unused-imports は、使っているかどうかを自分で判定していますか？**

していません。unused\_imports\_migration.ts の 84〜89 行目で `NgCompiler` の診断から NG8113 を拾い、その位置の識別子を消すだけです。判定はコンパイラの `UnusedStandaloneImportsRule` で、72 行目で必ず出るように設定しています。

**Q. tsconfig で NG8113 を suppress にしていても動きますか？**

動きます。67〜76 行目の `createProgram` で `unusedStandaloneImports` を `Warning` に上書きしてからプログラムを作ります。

**Q. import 文が消えずに残ることはありますか？**

あります。327 行目は「消した名前が、ファイルの他の場所に名前として 1 回も出てこない」ときだけ import を消します。別のコンポーネントの `imports` や、同じ名前の別の識別子があれば残ります。

**Q. common-to-standalone はテンプレートを解析していますか？**

していません。util.ts の 60〜68 行目で、23〜58 行目の正規表現を文字列全体に当てるだけです。だから `[ngForOf]="…"`（27 行目の `\b`）や静的な `ngClass="…"`（35 行目）は見つからず、必要な import が足されません。

**Q. NgModule の imports の CommonModule も分けますか？**

分けません。migration.ts の 93〜97 行目で `@Component` のクラスだけを対象にしています。

## 読み終えて

- cleanup-unused-imports はコンパイラの NG8113 をそのまま使う。全部が使われていない配列は `imports` の名前の上に 1 つ出るので、配列ごと `[]` にする。
- 要素は範囲だけを消してコメントを残し、import 文は名前の文字列の回数で消すかを決める。
- common-to-standalone は `@Component` の `imports` の CommonModule を、正規表現で見つけた名前に置き換える。
- 正規表現の表に無い書き方（`[ngForOf]="…"`・静的な `ngClass`）は見落とす。手元の実行で確かめた。

---

← 前: [テンプレートの書き換え：自己終了タグ・ngClass・ngStyle](14-mig-template-rewrites.md)  
次: [ルーティングのマイグレーション：遅延読み込みと RouterTestingModule](16-mig-routing.md) →
