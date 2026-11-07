[目次](../README.md) › [マイグレーションの内側](README.md) › 第 14 回 / 全 20 回

# テンプレートの書き換え：自己終了タグ・ngClass・ngStyle

> self-closing-tags-migration が中身の無い要素を &lt;x /&gt; に変える判定（まだ /&gt; でない・DomElementSchemaRegistry の要素名に無い・中身が無いか空白だけ）と、ngclass-to-class・ngstyle-to-style が \[ngClass\] と \[ngStyle\] をオブジェクトリテラルのときだけ \[class.x\]・\[class\]・\[style.x\]・\[style\] に変える判定、NgClass の import を消してよいかの判定。どれもテンプレート全体を 1 つの置き換えにする。ngStyle の側に残る 2 つの穴（変えられなかった \[ngStyle\] が残っても NgStyle を消す・値の " で属性が壊れる）を本物の bundle で確かめる。ページの上で本物の HtmlParser（parse\_html.ts の parseTemplate と同じオプション）を使った自己終了タグの書き換えのデモ（移植）。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-template-rewrites)

---

テンプレートの文字列だけを見て書き換えるマイグレーションを 3 つ読みます。中身の無い要素を `<x />` にする self-closing-tags、`[ngClass]` を `[class.x]` や `[class]` にする ngclass-to-class、`[ngStyle]` を `[style.x]` や `[style]` にする ngstyle-to-style です。どれも[第 6 回](06-mig-templates.md)の道具でテンプレートを見つけて HTML の AST にし、**どの要素・どの属性を変えてよいか**を判定して、テンプレート全体を 1 つの TextUpdate で置き換えます。この章の中心はその判定の行です。手元で本物の bundles を走らせて見つけた、ngStyle の側に残っている 2 つの穴も示します。

読む対象は `packages/core/schematics/migrations/self-closing-tags-migration/`、`ng-generate/self-closing-tags-migration/index.ts`、`ng-generate/ngclass-to-class-migration/` と `ng-generate/ngstyle-to-style-migration/` の `util.ts` と本体です。

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
14. **14. テンプレートの書き換え**（この章）
15. [15. 使っていない import](15-mig-cleanup-imports.md)
16. [16. ルーティング](16-mig-routing.md)
17. [17. v22（1）既定](17-mig-v22-defaults.md)
18. [18. v22（2）?.](18-mig-v22-safe-navigation.md)
19. [19. テスト](19-mig-testing.md)
20. [20. issue と PR を読む](20-mig-issues.md)

## 1. self-closing-tags：入口と本体の分担

📄 `angular/packages/core/schematics/ng-generate/self-closing-tags-migration/index.ts` L18–30 （▶ の行: 20, 23–24, 26–27）

```ts
18 │ export function migrate(options: Options): Rule {
19 │   return async (tree, context) => {
20 ▶     await runMigrationInDevkit({
21 │       tree,
22 │       getMigration: (fs) =>
23 ▶         new SelfClosingTagsMigration({
24 ▶           shouldMigrate: (file) => {
25 │             return (
26 ▶               file.rootRelativePath.startsWith(fs.normalize(options.path)) &&
27 ▶               !/(^|\/)node_modules\//.test(file.rootRelativePath)
28 │             );
29 │           },
30 │         }),
```

`ng generate @angular/core:self-closing-tag`（collection.json 49〜53 行目の別名）の入口は、ng-generate/ の側のこれだけです。20 行目で `runMigrationInDevkit`（[第 4 回](04-mig-tsurge.md)）に、23 行目で migrations/ の側の `SelfClosingTagsMigration` を渡します。24〜29 行目の `shouldMigrate` が `--path` の絞り込みで、26 行目で `--path` から始まるファイルだけ、27 行目で `node_modules` の中を除きます。判定と書き換えはすべて migrations/ の側にあります。migrations/ の BUILD.bazel の visibility は言語サービスの `//packages/language-service/src/refactorings:__pkg__` にも開いていますが、2026-11-03 の時点で `packages/language-service/` から import している場所はありません。

📄 `angular/packages/core/schematics/migrations/self-closing-tags-migration/self-closing-tags-migration.ts` L56–80 （▶ の行: 57, 59, 63, 65, 69, 71, 74–75, 78）

```ts
56 │     for (const sf of sourceFiles) {
57 ▶       ts.forEachChild(sf, (node: ts.Node) => {
58 │         // Skipping any non component declarations
59 ▶         if (!ts.isClassDeclaration(node)) {
60 │           return;
61 │         }
62 │ 
63 ▶         const file = projectFile(node.getSourceFile(), info);
64 │ 
65 ▶         if (this.config.shouldMigrate && this.config.shouldMigrate(file) === false) {
66 │           return;
67 │         }
68 │ 
69 ▶         const templateVisitor = new NgComponentTemplateVisitor(typeChecker);
70 │ 
71 ▶         templateVisitor.visitNode(node);
72 │ 
73 │         templateVisitor.resolvedTemplates.forEach((template) => {
74 ▶           const {migrated, changed, replacementCount} = migrateTemplateToSelfClosingTags(
75 ▶             template.content,
76 │           );
77 │ 
78 ▶           if (!changed) {
79 │             return;
80 │           }
```

📄 `angular/packages/core/schematics/migrations/self-closing-tags-migration/self-closing-tags-migration.ts` L82–101 （▶ の行: 82–85, 88, 91–92, 99）

```ts
 82 ▶           const fileToMigrate = template.inline
 83 ▶             ? file
 84 ▶             : projectFile(template.filePath as AbsoluteFsPath, info);
 85 ▶           const end = template.start + template.content.length;
 86 │ 
 87 │           const replacements = [
 88 ▶             prepareTextReplacement(fileToMigrate, migrated, template.start, end),
 89 │           ];
 90 │ 
 91 ▶           const fileReplacements = tagReplacements.find(
 92 ▶             (tagReplacement) => tagReplacement.file === file,
 93 │           );
 94 │ 
 95 │           if (fileReplacements) {
 96 │             fileReplacements.replacements.push(...replacements);
 97 │             fileReplacements.replacementCount += replacementCount;
 98 │           } else {
 99 ▶             tagReplacements.push({file, replacements, replacementCount});
100 │           }
101 │         });
```

1. **57〜59 行目：ファイルの一番上のクラスだけ**

   `ts.forEachChild(sf, …)` はファイルの直接の子だけを回します。関数の中で宣言したコンポーネントは、ここでは渡されません。
2. **69〜71 行目：クラスごとに `NgComponentTemplateVisitor` を作る**

   テンプレートの見つけ方は[第 6 回](06-mig-templates.md)。74〜76 行目で文字列 `template.content` だけを `migrateTemplateToSelfClosingTags` に渡します。この関数は TypeScript を知りません。
3. **82〜88 行目：テンプレート全体を 1 つの置き換えに**

   82〜84 行目でインラインなら .ts、外部なら .html を対象にし、85 行目で `end = start + content.length`、88 行目で `start` から `end` を書き換えたテンプレートに置き換えます。テンプレートの中の小さな置き換えを 1 つずつ Replacement にしないので、重なりの心配がありません（[第 5 回](05-mig-replacements.md)の 3 節）。
4. **91〜99 行目：数の集計**

   92 行目の `tagReplacement.file === file` はオブジェクトの同一性の比較です。`file` は 63 行目でクラスごとに `projectFile()` が新しく作るオブジェクトなので、**同じファイルの 2 つ目のクラスでは一致せず、99 行目で別の項目になります**。

📄 `angular/packages/core/schematics/migrations/self-closing-tags-migration/self-closing-tags-migration.ts` L127–142 （▶ の行: 128–130）

```ts
127 │   override async stats(globalMetadata: SelfClosingTagsCompilationUnitData) {
128 ▶     const touchedFilesCount = globalMetadata.tagReplacements.length;
129 ▶     const replacementCount = globalMetadata.tagReplacements.reduce(
130 ▶       (acc, cur) => acc + cur.replacementCount,
131 │       0,
132 │     );
133 │ 
134 │     return confirmAsSerializable({
135 │       touchedFilesCount,
136 │       replacementCount,
137 │     });
138 │   }
139 │ 
140 │   override async migrate(globalData: SelfClosingTagsCompilationUnitData) {
141 │     return {replacements: globalData.tagReplacements.flatMap(({replacements}) => replacements)};
142 │   }
```

128 行目の `touchedFilesCount` はその項目の数なので、実際は「ファイルの数」ではなく「書き換えのあったクラスの数」です。1 つのファイルに 2 つのコンポーネントを書いて本物の bundle を走らせると、ログは `Migrated 2 components to self-closing tags in 2 component files.` になりました（2026-11-03、手元の確認。ng-generate/self-closing-tags-migration/index.ts の `whenDone` が出す文）。書き換えの結果そのものには影響しません。

## 2. self-closing-tags：どの要素を自己終了にするか

📄 `angular/packages/core/schematics/migrations/self-closing-tags-migration/to-self-closing-tags.ts` L81–116 （▶ の行: 81, 92–94, 98–99, 103, 107, 110, 112）

```ts
 81 ▶ const ALL_HTML_TAGS = new DomElementSchemaRegistry().allKnownElementNames();
 82 │ 
 83 │ export class AngularElementCollector extends RecursiveVisitor {
 84 │   readonly elements: ElementToMigrate[] = [];
 85 │ 
 86 │   constructor() {
 87 │     super();
 88 │   }
 89 │ 
 90 │   override visitElement(element: Element) {
 91 │     if (
 92 ▶       !element.isSelfClosing &&
 93 ▶       !ALL_HTML_TAGS.includes(element.name) &&
 94 ▶       this.elementHasNoContent(element)
 95 │     ) {
 96 │       this.elements.push({
 97 │         tagName: element.name,
 98 ▶         start: element.sourceSpan.start.offset,
 99 ▶         end: element.sourceSpan.end.offset,
100 │       });
101 │     }
102 │ 
103 ▶     return super.visitElement(element, null);
104 │   }
105 │ 
106 │   private elementHasNoContent(element: Element) {
107 ▶     if (!element.children?.length) {
108 │       return true;
109 │     }
110 ▶     if (element.children.length === 1) {
111 │       const child = element.children[0];
112 ▶       return child instanceof Text && /^\s*$/.test(child.value);
113 │     }
114 │     return false;
115 │   }
116 │ }
```

1. **92 行目：もう `<x />` の要素は飛ばす**

   `isSelfClosing` は HTML の AST の Element が持つ「`/>` で閉じていたか」です。
2. **93 行目：ブラウザの要素は飛ばす。判定は名前の一覧**

   81 行目で compiler の `DomElementSchemaRegistry`（型チェックで「知っている要素とプロパティ」を持つ表）から全部の要素名を取り、その中に名前があれば飛ばします。`<div></div>` を `<div />` にすると HTML としては閉じていない `<div>` になるので、これを避けます。**コンポーネントかどうかは見ていません**。一覧に無い名前（`app-x`・`ng-container`・`ng-content`・`ng-template` など。手元の 22.1.6 で確かめた）はすべて対象です。
3. **94・106〜115 行目：中身が無いか、空白だけの Text 1 つ**

   107 行目で子が無ければ真、110〜113 行目で子が 1 つでそれが空白だけの `Text` なら真です。コメント `<!-- -->` 1 つだけの要素は `Text` ではないので対象外です。
4. **98〜99・103 行目：範囲を覚えて、子へ降りる**

   `sourceSpan` は開きタグから閉じタグまで全体です。103 行目で子へ降りますが、中身のある親は 94 行目で落ちているので、覚えた範囲同士が入れ子になることはありません。`RecursiveVisitor` なので、`@if` のブロックや ICU の中の要素も見ます。

📄 `angular/packages/core/schematics/migrations/self-closing-tags-migration/to-self-closing-tags.ts` L23–52 （▶ の行: 23–25, 35, 39, 41, 44–46, 51）

```ts
23 ▶   let parsed = parseTemplate(template);
24 ▶   if (parsed.tree === undefined) {
25 ▶     return {migrated: template, changed: false, replacementCount: 0};
26 │   }
27 │ 
28 │   const visitor = new AngularElementCollector();
29 │   visitAll(visitor, parsed.tree.rootNodes);
30 │ 
31 │   let newTemplate = template;
32 │   let changedOffset = 0;
33 │   let replacementCount = 0;
34 │ 
35 ▶   for (let element of visitor.elements) {
36 │     const {start, end, tagName} = element;
37 │ 
38 │     const currentLength = newTemplate.length;
39 ▶     const templatePart = newTemplate.slice(start + changedOffset, end + changedOffset);
40 │ 
41 ▶     const convertedTemplate = replaceWithSelfClosingTag(templatePart, tagName);
42 │ 
43 │     // if the template has changed, replace the original template with the new one
44 ▶     if (convertedTemplate.length !== templatePart.length) {
45 ▶       newTemplate = replaceTemplate(newTemplate, convertedTemplate, start, end, changedOffset);
46 ▶       changedOffset += newTemplate.length - currentLength;
47 │       replacementCount++;
48 │     }
49 │   }
50 │ 
51 ▶   return {migrated: newTemplate, changed: changedOffset !== 0, replacementCount};
52 │ }
```

📄 `angular/packages/core/schematics/migrations/self-closing-tags-migration/to-self-closing-tags.ts` L54–73 （▶ の行: 55–56, 59, 72）

```ts
54 │ function replaceWithSelfClosingTag(html: string, tagName: string) {
55 ▶   const pattern = new RegExp(
56 ▶     `<\\s*${tagName}\\s*([^>]*?(?:"[^"]*"|'[^']*'|[^'">])*)\\s*>([\\s\\S]*?)<\\s*/\\s*${tagName}\\s*>`,
57 │     'gi',
58 │   );
59 ▶   return html.replace(pattern, (_, content) => `<${tagName}${content ? ` ${content}` : ''} />`);
60 │ }
61 │ 
62 │ /**
63 │  * Replace the value in the template with the new value based on the start and end position + offset
64 │  */
65 │ function replaceTemplate(
66 │   template: string,
67 │   replaceValue: string,
68 │   start: number,
69 │   end: number,
70 │   offset: number,
71 │ ) {
72 ▶   return template.slice(0, start + offset) + replaceValue + template.slice(end + offset);
73 │ }
```

1. **23〜26 行目：解析エラーがあれば何もしない**

   parse\_html.ts の `parseTemplate`（[第 6 回](06-mig-templates.md)の 4 節）が `tree: undefined` なら、`changed: false` で返します。
2. **35〜41 行目：覚えた範囲を切り出して、正規表現で書き換える**

   39 行目は「元の範囲 + それまでに縮んだ文字数（`changedOffset`）」で今の文字列から切り出します。範囲を元の位置で覚えて、文字列を順に作り直すやり方です。41 行目の正規表現（56 行目）は `<名前 属性…>中身</名前>` に当たり、59 行目で `<名前 属性… />` にします。属性の部分は引用符の中の `>` を飛ばす形（`"[^"]*"|'[^']*'`）で、改行を含む属性の並びもそのまま残ります。
3. **44 行目：長さが変わったときだけ数える**

   正規表現が当たらなければ文字列はそのままで、数えません。たとえば SVG の中の、一覧に無い要素（`<feDropShadow>` など）は HTML の AST での名前が `:svg:feDropShadow` になり、93 行目は通りますが、56 行目の正規表現が `<:svg:feDropShadow` を探すので当たりません。結果として書き換えられません。

## 3. ngclass-to-class：変えてよい \[ngClass\] の判定

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/util.ts` L264–290 （▶ の行: 274–277, 280–281, 288–289）

```ts
264 │   constructor(
265 │     template: string,
266 │     private componentNode?: ts.ClassDeclaration,
267 │     private typeChecker?: ts.TypeChecker,
268 │   ) {
269 │     super();
270 │     this.originalTemplate = template;
271 │ 
272 │     // If we have enough information, check if NgClass is actually imported.
273 │     // If not, we can confidently disable the migration for this component.
274 ▶     if (componentNode && typeChecker) {
275 ▶       const imports = getImportSpecifiers(componentNode.getSourceFile(), commonModuleStr, [
276 ▶         ngClassStr,
277 ▶         commonModuleImportsStr,
278 │       ]);
279 │ 
280 ▶       if (imports.length === 0) {
281 ▶         this.isNgClassImported = false;
282 │       }
283 │     }
284 │   }
285 │ 
286 │   override visitElement(element: Element, config: MigrationConfig) {
287 │     // If NgClass is not imported, do not attempt to migrate.
288 ▶     if (!this.isNgClassImported) {
289 ▶       return;
290 │     }
```

最初の関門は「そのファイルが `@angular/common` から `NgClass` か `CommonModule` を import しているか」です（275〜278 行目）。どちらも無ければ 281 行目で偽にし、288〜289 行目でその要素から先を何も見ません。`[ngClass]` が別のライブラリの同じ名前の入力かもしれないからです。判定はファイルの import 文だけで、そのコンポーネントの `imports` 配列までは見ていません。

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/util.ts` L292–320 （▶ の行: 293–295, 299, 301–302, 310–311, 315–316, 319）

```ts
292 │     for (const attr of element.attrs) {
293 ▶       if (attr.name === '[ngClass]' && attr.valueSpan) {
294 ▶         const expr = this.originalTemplate.slice(
295 ▶           attr.valueSpan.start.offset,
296 │           attr.valueSpan.end.offset,
297 │         );
298 │ 
299 ▶         const parseResult = tryParseStaticObjectLiteral(expr);
300 │ 
301 ▶         if (parseResult === null) {
302 ▶           this.skippedNgClassCount++;
303 │           continue;
304 │         }
305 │ 
306 │         const {bindings: staticMatch, hasSpaceSeparatedKeys} = parseResult;
307 │ 
308 │         let replacement: string;
309 │ 
310 ▶         if (staticMatch.length === 0) {
311 ▶           replacement = '[class]=""';
312 │         } else if (staticMatch.length === 1) {
313 │           const {key, value} = staticMatch[0];
314 │           // Special case: If the key is an empty string, use [class]=""
315 ▶           if (key === '') {
316 ▶             replacement = '[class]=""';
317 │           } else {
318 │             // Normal single condition: use [class.className]="condition"
319 ▶             replacement = `[class.${key}]="${value}"`;
320 │           }
```

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/util.ts` L373–404 （▶ の行: 379–380, 383–384, 388, 393–394）

```ts
373 │ function tryParseStaticObjectLiteral(expr: string): {
374 │   bindings: {key: string; value: string}[];
375 │   hasSpaceSeparatedKeys: boolean;
376 │ } | null {
377 │   const trimmedExpr = expr.trim();
378 │ 
379 ▶   if (trimmedExpr === '{}' || trimmedExpr === '[]') {
380 ▶     return {bindings: [], hasSpaceSeparatedKeys: false};
381 │   }
382 │ 
383 ▶   if (!isObjectLiteralSyntax(trimmedExpr)) {
384 ▶     return null;
385 │   }
386 │ 
387 │   try {
388 ▶     const objectLiteral = parseAsObjectLiteral(trimmedExpr);
389 │     if (!objectLiteral) {
390 │       return null;
391 │     }
392 │ 
393 ▶     return extractClassBindings(objectLiteral);
394 ▶   } catch {
395 │     return null;
396 │   }
397 │ }
398 │ 
399 │ /**
400 │  * Validates basic object literal syntax
401 │  */
402 │ function isObjectLiteralSyntax(expr: string): boolean {
403 │   return expr.startsWith('{') && expr.endsWith('}');
404 │ }
```

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/util.ts` L452–485 （▶ の行: 453, 455, 459–461, 466, 471–473, 480–481）

```ts
452 │   for (const property of objectLiteral.properties) {
453 ▶     if (ts.isShorthandPropertyAssignment(property)) {
454 │       const key = property.name.getText();
455 ▶       if (key.includes(' ')) {
456 │         return null;
457 │       }
458 │       bindings.push({key, value: key});
459 ▶     } else if (ts.isPropertyAssignment(property)) {
460 ▶       const keyText = extractPropertyKey(property.name);
461 ▶       const valueText = extractPropertyValue(property.initializer);
462 │ 
463 │       if (keyText === '' && valueText) {
464 │         bindings.push({key: '', value: valueText});
465 │       } else {
466 ▶         if (!keyText || !valueText) {
467 │           return null;
468 │         }
469 │ 
470 │         // Handle multiple CSS classes in single key (e.g., 'class1 class2': condition)
471 ▶         const classNames = keyText.split(/\s+/).filter(Boolean);
472 ▶         if (classNames.length > 1) {
473 ▶           hasSpaceSeparatedKeys = true;
474 │         }
475 │ 
476 │         for (const className of classNames) {
477 │           bindings.push({key: className, value: valueText});
478 │         }
479 │       }
480 ▶     } else {
481 ▶       return null;
482 │     }
483 │   }
484 │ 
485 │   return {bindings, hasSpaceSeparatedKeys};
```

1. **293〜297 行目：属性の値を元のテンプレートから切り出す**

   `valueSpan` は引用符の内側の範囲です。`attr.value` ではなく元の文字列を切り出すので、エスケープや改行がそのまま残ります。
2. **379〜385 行目：`{}`・`[]` は空、`{…}` の形でなければ変えない**

   `[ngClass]="cls"`（変数）・`[ngClass]="getCls()"`（呼び出し）・`[ngClass]="['a', 'b']"`（配列）は 383〜385 行目で `null` になり、301〜302 行目で `skippedNgClassCount` が増えます。この数が 6 節の「NgClass を消してよいか」に効きます。
3. **388 行目 → 452〜485 行目：TypeScript のオブジェクトリテラルとして読み、キーと値の組にする**

   `parseAsObjectLiteral` は `const obj = …` を付けて `ts.createSourceFile` で解析します。453〜458 行目の省略形 `{active}` は `active: active` と同じに扱い、460〜461 行目で普通のプロパティのキーと値の文字列を取ります。466〜468 行目、キーが `[expr]`（計算されたキー）なら `extractPropertyKey` が `null` を返すので全体を諦めます。480〜482 行目、`...spread` やメソッドも諦めます。471〜474 行目で `'a b': cond` のような空白区切りのキーを分け、印を立てます。
4. **310〜319 行目：0 個と 1 個**

   0 個なら `[class]=""`、1 個なら `[class.キー]="値"`。1 個でもキーが `''` なら `[class]=""` です。

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/util.ts` L321–357 （▶ の行: 325, 333–335, 337–338, 343, 348, 353–354）

```ts
321 │         } else {
322 │           // Multiple bindings. If any original key contained spaces, [class]="{...}" object
323 │           // syntax cannot be used because [class] does not support space-separated key names
324 │           // (only [ngClass] does). Either expand every binding individually, or skip.
325 ▶           if (hasSpaceSeparatedKeys) {
326 │             // Expanding is only safe if every binding maps to a distinct, non-empty class
327 │             // name that doesn't contain a dot: an empty key would produce the invalid
328 │             // `[class.]` binding, duplicate keys would produce multiple conflicting
329 │             // `[class.foo]` bindings on one element, and a dot in the class name (e.g.
330 │             // 'a.b') would silently bind to the wrong property since `[class.a.b]` is
331 │             // parsed as `[class.a]` — everything after the first dot is discarded.
332 │             const expandedKeys = staticMatch.map(({key}) => key);
333 ▶             const canExpand =
334 ▶               expandedKeys.every((key) => key !== '' && !key.includes('.')) &&
335 ▶               new Set(expandedKeys).size === expandedKeys.length;
336 │ 
337 ▶             if (config.migrateSpaceSeparatedKey && canExpand) {
338 ▶               replacement = staticMatch
339 │                 .map(({key, value}) => `[class.${key}]="${value}"`)
340 │                 .join(' ');
341 │             } else {
342 │               // Cannot produce valid [class]="..." output — leave binding as-is.
343 ▶               this.skippedNgClassCount++;
344 │               continue;
345 │             }
346 │           } else {
347 │             // All keys are single class names: [class]="{'cls1': cond1, 'cls2': cond2}" is valid.
348 ▶             replacement = `[class]="${expr}"`;
349 │           }
350 │         }
351 │ 
352 │         this.replacements.push({
353 ▶           start: attr.sourceSpan.start.offset,
354 ▶           end: attr.sourceSpan.end.offset,
355 │           replacement,
356 │         });
357 │         continue;
```

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/util.ts` L358–370 （▶ の行: 360, 364）

```ts
358 │       }
359 │ 
360 ▶       if (attr.name === 'ngClass' && attr.value) {
361 │         this.replacements.push({
362 │           start: attr.sourceSpan.start.offset,
363 │           end: attr.sourceSpan.end.offset,
364 ▶           replacement: `class="${attr.value}"`,
365 │         });
366 │       }
367 │     }
368 │ 
369 │     return super.visitElement(element, config);
370 │   }
```

1. **2 個以上で、空白区切りのキーが無い：348 行目**

   `[class]` も `{'a': x, 'b': y}` のオブジェクトを受け取れるので、属性の名前だけ変えて値は元の式のままにします。
2. **2 個以上で、空白区切りのキーがある：325〜345 行目（49672c437b4 の修正）**

   `[class]` は `'a b'` のような空白を含むキーを扱えないので、オブジェクトのままにはできません。337 行目、`--migrate-space-separated-key`（schema.json の `migrateSpaceSeparatedKey`）が真で、333〜335 行目の条件（空のキーが無い・`.` を含まない・展開して重複しない）を満たすときだけ、338〜340 行目で `[class.a]="x" [class.b]="x"` と 1 つずつ並べます。そうでなければ 343 行目で `skippedNgClassCount` を増やして元のまま残します。修正の前は「キーが 1 つで値が全部同じ」ときしか展開せず、`{'class1 class2': c, 'class3': c2}` が `[class]="…"` のままの壊れた出力になっていました（#69833、2026-07-21 に閉じた）。
3. **353〜354 行目：属性全体の範囲を置き換える**

   `sourceSpan` は `[ngClass]="…"` の名前から閉じ引用符まで。360〜365 行目、値が静的な `ngClass="a b"` は `class="a b"` にします。

## 4. ngclass-to-class：NgClass の import を消してよいか（223e40279f3 の修正）

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/ngclass-to-class-migration.ts` L71–87 （▶ の行: 72, 74–75, 81, 84）

```ts
71 │     const {migrated, changed, replacementCount, canRemoveNgClass, canRemoveCommonModule} =
72 ▶       migrateNgClassBindings(template.content, this.config, node, typeChecker);
73 │ 
74 ▶     if (!changed) {
75 ▶       // Even when no replacements were made, we must propagate the real `canRemoveNgClass`
76 │       // value. If the template contained [ngClass] bindings that could not be migrated (e.g.
77 │       // dynamic variable or array bindings), the visitor's `skippedNgClassCount` will be > 0
78 │       // and `canRemoveNgClass` will be false. Returning `true` here unconditionally would
79 │       // cause the migration to incorrectly strip `NgClass` from the component's `imports`
80 │       // array and from the top-level import statement.
81 ▶       return {
82 │         replacements: [],
83 │         replacementCount: 0,
84 ▶         canRemoveNgClass,
85 │         canRemoveCommonModule,
86 │       };
87 │     }
```

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/ngclass-to-class-migration.ts` L109–144 （▶ の行: 118, 121, 126–127, 132–133, 137）

```ts
109 │     const templateVisitor = new NgComponentTemplateVisitor(typeChecker);
110 │     templateVisitor.visitNode(node);
111 │ 
112 │     if (templateVisitor.resolvedTemplates.length === 0) {
113 │       return null;
114 │     }
115 │ 
116 │     const replacements: Replacement[] = [];
117 │     let replacementCount = 0;
118 ▶     let canRemoveNgClass = true;
119 │     let canRemoveCommonModule = true;
120 │ 
121 ▶     for (const template of templateVisitor.resolvedTemplates) {
122 │       const result = this.processTemplate(template, node, file, info, typeChecker);
123 │ 
124 │       replacements.push(...result.replacements);
125 │       replacementCount += result.replacementCount;
126 ▶       canRemoveNgClass = canRemoveNgClass && result.canRemoveNgClass;
127 ▶       canRemoveCommonModule = canRemoveCommonModule && result.canRemoveCommonModule;
128 │     }
129 │ 
130 │     // Handle the `@Component({ imports: [...] })` array.
131 │     // Only remove NgClass from this class's own imports array if all of its [ngClass] bindings were migrated.
132 ▶     if (canRemoveNgClass) {
133 ▶       const importsRemoval = createNgClassImportsArrayRemoval(
134 │         node,
135 │         file,
136 │         typeChecker,
137 ▶         canRemoveCommonModule,
138 │       );
139 │       if (importsRemoval) {
140 │         replacements.push(importsRemoval);
141 │       }
142 │     }
143 │ 
144 │     return {replacements, replacementCount, canRemoveNgClass, canRemoveCommonModule};
```

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/ngclass-to-class-migration.ts` L172–191 （▶ の行: 176, 178, 185–186, 188–189）

```ts
172 │       if (classResults.length === 0) {
173 │         continue;
174 │       }
175 │ 
176 ▶       for (const {replacements, replacementCount} of classResults) {
177 │         if (replacements.length > 0) {
178 ▶           ngClassReplacements.push({file, replacementCount, replacements});
179 │         }
180 │       }
181 │ 
182 │       // A single source file may declare multiple classes/components. The top-level
183 │       // `NgClass`/`CommonModule` import statements are shared across all of them, so they can
184 │       // only be removed once every class in the file no longer needs them.
185 ▶       if (classResults.every((result) => result.canRemoveNgClass)) {
186 ▶         filesWithNgClassDeclarations.add(sf);
187 │       }
188 ▶       if (classResults.every((result) => result.canRemoveCommonModule)) {
189 ▶         filesToRemoveCommonModule.add(file.id);
190 │       }
191 │     }
```

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/util.ts` L208–242 （▶ の行: 218, 223, 226–227, 231）

```ts
208 │ export function calculateImportReplacements(
209 │   info: ProgramInfo,
210 │   sourceFiles: Set<ts.SourceFile>,
211 │   filesToRemoveCommonModule: Set<ProjectFileID>,
212 │ ) {
213 │   const importReplacements: Record<
214 │     ProjectFileID,
215 │     {add: Replacement[]; addAndRemove: Replacement[]}
216 │   > = {};
217 │ 
218 ▶   const importManager = new ImportManager();
219 │   for (const sf of sourceFiles) {
220 │     const file = projectFile(sf, info);
221 │ 
222 │     // Always remove NgClass if it's imported directly.
223 ▶     importManager.removeImport(sf, ngClassStr, commonModuleStr);
224 │ 
225 │     // Conditionally remove CommonModule if it's no longer needed.
226 ▶     if (filesToRemoveCommonModule.has(file.id)) {
227 ▶       importManager.removeImport(sf, commonModuleImportsStr, commonModuleStr);
228 │     }
229 │ 
230 │     const addRemove: Replacement[] = [];
231 ▶     applyImportManagerChanges(importManager, addRemove, [sf], info);
232 │ 
233 │     if (addRemove.length > 0) {
234 │       importReplacements[file.id] = {
235 │         add: [],
236 │         addAndRemove: addRemove,
237 │       };
238 │     }
239 │   }
240 │ 
241 │   return importReplacements;
242 │ }
```

1. **テンプレートごと：変えられなかった \[ngClass\] が残るか**

   `migrateNgClassBindings` が返す `canRemoveNgClass` は `visitor.skippedNgClassCount === 0` です（3 節の 301〜302・343 行目で増やした数）。74〜87 行目、テンプレートが変わらなかったときも、その値をそのまま返します。75〜80 行目のコメントのとおり、以前はここで `true` を返していて、変えられない `[ngClass]` だけのコンポーネントから `NgClass` が消えていました（#69844、2026-07-20 に閉じた）。
2. **クラスごと：全部のテンプレートの論理積（121〜128 行目）**

   132 行目で真のときだけ、133 行目で `@Component({imports: [...]})` の配列から `NgClass`（と、要らなくなったなら `CommonModule`）を消す置き換えを作ります。
3. **ファイルごと：全部のクラスの論理積（185〜190 行目）**

   import 文はファイルの全部のクラスが共有するので、1 つでも `NgClass` が要るクラスがあれば消しません。
4. **import 文を消す：223 行目**

   218 行目の `ImportManager` に `removeImport` を頼み、231 行目の `applyImportManagerChanges` で Replacement に直します（[第 5 回](05-mig-replacements.md)の 5 節）。

## 5. ngstyle-to-style：同じ形で、修正が入っていない

📄 `angular/packages/core/schematics/ng-generate/ngstyle-to-style-migration/util.ts` L267–292 （▶ の行: 268, 271, 277, 279–280, 283, 286–287, 291）

```ts
267 │     for (const attr of element.attrs) {
268 ▶       if (attr.name !== '[ngStyle]' && attr.name !== 'ngStyle') {
269 │         continue;
270 │       }
271 ▶       if (attr.name === '[ngStyle]' && attr.valueSpan) {
272 │         const expr = this.originalTemplate.slice(
273 │           attr.valueSpan.start.offset,
274 │           attr.valueSpan.end.offset,
275 │         );
276 │ 
277 ▶         const staticMatch = parseStaticObjectLiteral(expr);
278 │ 
279 ▶         if (staticMatch === null) {
280 ▶           if (config.bestEffortMode && !isObjectLiteralSyntax(expr.trim())) {
281 │             const keyReplacement = this.originalTemplate
282 │               .slice(attr.sourceSpan.start.offset, attr.valueSpan.start.offset)
283 ▶               .replace('[ngStyle]', '[style]');
284 │ 
285 │             this.replacements.push({
286 ▶               start: attr.sourceSpan.start.offset,
287 ▶               end: attr.valueSpan.start.offset,
288 │               replacement: keyReplacement,
289 │             });
290 │           }
291 ▶           continue;
292 │         }
```

📄 `angular/packages/core/schematics/ng-generate/ngstyle-to-style-migration/util.ts` L294–317 （▶ の行: 296–297, 305, 308, 312–313）

```ts
294 │         let replacement: string;
295 │ 
296 ▶         if (staticMatch.length === 0) {
297 ▶           replacement = '';
298 │         } else if (staticMatch.length === 1) {
299 │           const {key, value} = staticMatch[0];
300 │           // Special case: If the key is an empty string, use [style]=""
301 │           if (key === '') {
302 │             replacement = '';
303 │           } else {
304 │             // Normal single condition: use [style.styleName]="condition"
305 ▶             replacement = `[style.${key}]="${value}"`;
306 │           }
307 │         } else {
308 ▶           replacement = `[style]="${expr}"`;
309 │         }
310 │ 
311 │         this.replacements.push({
312 ▶           start: attr.sourceSpan.start.offset,
313 ▶           end: attr.sourceSpan.end.offset,
314 │           replacement,
315 │         });
316 │         continue;
317 │       }
```

1. **形はほぼ ngClass と同じ**

   0 個なら 297 行目で属性を消し（`[style]=""` ではなく空文字）、1 個なら 305 行目で `[style.キー]="値"`、2 個以上なら 308 行目で `[style]="元の式"` です。`{'width.px': w}` は `[style.width.px]="w"` になり、これは単位付きのスタイルの書き方として正しい形です。
2. **279〜291 行目：変えられないとき、数えない**

   `--best-effort-mode` なら、オブジェクトリテラルでない式（変数など）について 283 行目で属性の名前の部分だけを `[style]` に変えます（`[style]` も `{key: value}` のオブジェクトを受け取るので）。そうでなければ 291 行目で飛ばすだけで、ngClass の `skippedNgClassCount` にあたる数がありません。

📄 `angular/packages/core/schematics/ng-generate/ngstyle-to-style-migration/ngstyle-to-style-migration.ts` L105–142 （▶ の行: 107, 120–121, 126–127, 130, 141）

```ts
105 │         const replacementsForStyle: Replacement[] = [];
106 │         let replacementCountForStyle = 0;
107 ▶         let canRemoveCommonModuleForFile = true;
108 │ 
109 │         for (const template of templateVisitor.resolvedTemplates) {
110 │           const result = this.processTemplate(template, node, file, info, typeChecker);
111 │           if (result) {
112 │             replacementsForStyle.push(...result.replacements);
113 │             replacementCountForStyle += result.replacementCount;
114 │             if (!result.canRemoveCommonModule) {
115 │               canRemoveCommonModuleForFile = false;
116 │             }
117 │           }
118 │         }
119 │ 
120 ▶         if (replacementsForStyle.length > 0) {
121 ▶           if (canRemoveCommonModuleForFile) {
122 │             filesToRemoveCommonModule.add(file.id);
123 │           }
124 │ 
125 │           // Handle the `@Component({ imports: [...] })` array.
126 ▶           const importsRemoval = createNgStyleImportsArrayRemoval(
127 ▶             node,
128 │             file,
129 │             typeChecker,
130 ▶             canRemoveCommonModuleForFile,
131 │           );
132 │           if (importsRemoval) {
133 │             replacementsForStyle.push(importsRemoval);
134 │           }
135 │ 
136 │           ngStyleReplacements.push({
137 │             file,
138 │             replacementCount: replacementCountForStyle,
139 │             replacements: replacementsForStyle,
140 │           });
141 ▶           filesWithNgStyleDeclarations.add(sf);
142 │         }
```

120 行目、テンプレートが 1 か所でも変われば、126〜131 行目で `imports` 配列から `NgStyle` を消す置き換えを作り、141 行目でファイルを「NgStyle の import 文を消す」側に入れます（util.ts の `calculateImportReplacements` が、ngclass の 223 行目と同じく無条件に `removeImport`）。**変えられずに残った `[ngStyle]` があるかは見ていません**。ngClass の 4 節の修正（223e40279f3）にあたるものが入っていない形です。

> [!WARNING]
> **ハマりどころ**
>
> **手元の確認（2026-11-03、本物の bundle を SchematicTestRunner で。../angular は変更していない）**： `imports: [NgStyle]` で、テンプレートが `<div [ngStyle]="{'color': 'red'}"></div><p [ngStyle]="dynamic"></p>` のコンポーネントに `ngstyle-to-style` を当てると、1 つ目は `[style.color]="'red'"` になり、2 つ目の `[ngStyle]="dynamic"` は残ったまま、`imports` 配列と `import {NgStyle}` の両方が消えました。`[ngStyle]` を束ねるディレクティブが無くなるので、このテンプレートはビルドでエラーになります。同じ形を `ngclass-to-class` に当てると、`NgClass` は残りました（4 節のとおり）。main（2026-11-03 に `gh api` で読んだ）でも ngstyle-to-style-migration.ts と util.ts はスナップショットと同じで、`gh search issues` で同じ報告は見つかりませんでした。
>
> もう 1 つ、**値に `"` を含む式**も壊れます。`[ngStyle]='{"font-family": font === "a" ? "serif" : "sans-serif"}'` は `[style.font-family]="font === "a" ? "serif" : "sans-serif""` になりました。305 行目が値を `"` で囲むだけだからです。ngClass の側も、このスナップショットの 319・348 行目は同じ形で `[class.a]="mode === "x""` を出しましたが、main では PR #70818（2026-10-26 に merge）の `buildAttribute` が、値に `"` があれば `'` で囲むようになっています。ngStyle の側にはまだありません。

## 6. デモ：自己終了タグの判定と書き換え

> **🧪 DEMO — self-closing-tags の判定の簡略版（移植）を、このページの @angular/compiler 22.1.6 で動かす**
>
> 「判定して書き換える」を押すと、`parseMigHtml`（parse\_html.ts と同じオプションの `HtmlParser`）でテンプレートを解析し、すべての要素について 2 節の 92〜94 行目の 3 つの条件を表にします。「知っている HTML の要素か」は本物の `DomElementSchemaRegistry` で調べます。対象の要素には 56 行目と同じ正規表現を当て、長さが変わったものだけを `applyTextUpdates` で当てます。これは to-self-closing-tags.ts の **移植**で、本物は 35〜49 行目のように `changedOffset` を足しながら文字列を順に作り直します。対象の要素同士は入れ子にならないので、結果は同じです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/mig-template-rewrites)

最初の例では `app-header`・空白だけの `app-card`・`@if` の中の `app-badge` の 3 つが書き換わり、`本文` のある `app-card`、`div`、もう `/>` の `app-icon` は残ります。SVG の `circle` は AST の名前が `:svg:circle` で、一覧にあるので飛ばされます。同じテンプレートを外部の .html にして本物の bundle を走らせた結果と、書き換えたあとの文字列が一致することを手元で確かめました（ログは `Migrated 3 components … in 1 component files.`）。

## ここまでの呼び出し

- 👤 `ng generate @angular/core:self-closing-tag` — collection.json 49
  - `migrate(options)` → `runMigrationInDevkit({getMigration})` — ng-generate/self-closing-tags-migration/index.ts 18・20
    - `SelfClosingTagsMigration.analyze(info)` — self-closing-tags-migration.ts 49
      - `NgComponentTemplateVisitor.visitNode(node)` — 第 6 回
      - `migrateTemplateToSelfClosingTags(content)` — to-self-closing-tags.ts 18
        - `parseTemplate()` → `visitAll(new AngularElementCollector())` — to-self-closing-tags.ts 23・29 — *92〜94 行目の 3 条件*
        - `replaceWithSelfClosingTag(part, tagName)` — to-self-closing-tags.ts 54
      - `new Replacement(file, new TextUpdate({position: start, end}))` — self-closing-tags-migration.ts 88・145 — *テンプレート全体を 1 つ*
    - `migrate()` → recorder に当てる — 第 5 回

## テストと直し方

### spec と describe

| spec | 形 | bazel のターゲット | 件数 |
| --- | --- | --- | --- |
| migrations/self-closing-tags-migration/self-closing-tags-migration.spec.ts（describe `self-closing tags` &gt; `self-closing tags migration`） | `runTsurgeMigration` で本体だけ | `//packages/core/schematics/migrations/self-closing-tags-migration:test` | 11 |
| test/self\_closing\_tags\_migration\_spec.ts（describe `self-closing-tags migration`） | SchematicTestRunner で bundle とログの文 | `//packages/core/schematics/test:test` | 2 |
| test/ngstyle\_to\_style\_migration\_spec.ts（describe `NgStyle migration` と `NgStyle migration bestEffortMode option`） | SchematicTestRunner | `//packages/core/schematics/test:test` | 19（うち bestEffort 3） |
| ng-generate/ngclass-to-class-migration/ngclass\_to\_class\_migration\_spec.ts（describe `NgClass migration` と `migrateSpaceSeparatedKey option`） | SchematicTestRunner。49672c437b4 で test/ からここへ移った | `//packages/core/schematics/ng-generate/ngclass-to-class-migration:test` | 47（37 + 10） |

📄 `angular/packages/core/schematics/migrations/self-closing-tags-migration/self-closing-tags-migration.spec.ts` L245–269 （▶ の行: 245, 247–248, 252–253, 257, 268）

```ts
245 ▶ async function verifyDeclaration(testCase: {before: string; after: string}) {
246 │   await verify({
247 ▶     before: populateDeclarationTestCase(testCase.before.trim()),
248 ▶     after: populateExpectedResult(testCase.after.trim()),
249 │   });
250 │ }
251 │ 
252 ▶ async function verifyDeclarationNoChange(beforeAndAfter: string) {
253 ▶   await verifyDeclaration({before: beforeAndAfter, after: beforeAndAfter});
254 │ }
255 │ 
256 │ async function verify(testCase: {before: string; after: string}) {
257 ▶   const {fs} = await runTsurgeMigration(new SelfClosingTagsMigration(), [
258 │     {
259 │       name: absoluteFrom('/app.component.ts'),
260 │       isProgramRootFile: true,
261 │       contents: testCase.before,
262 │     },
263 │   ]);
264 │ 
265 │   const actual = fs.readFile(absoluteFrom('/app.component.ts')).trim();
266 │   const expected = testCase.after.trim();
267 │ 
268 ▶   expect(actual).withContext(diffText(expected, actual)).toEqual(expected);
269 │ }
```

本体だけの spec は、テンプレート 1 つを 247 行目でコンポーネントの .ts に埋め、257 行目の `runTsurgeMigration`（[第 19 回](19-mig-testing.md)）に通して、268 行目で書き換えたあとの全文を比べます。「変わらない」の it は 252〜253 行目で前と後を同じにするだけです。判定を 1 つ足すなら、この形の it を 1 本足すのがいちばん小さい。

📄 `angular/packages/core/schematics/ng-generate/ngclass-to-class-migration/ngclass_to_class_migration_spec.ts` L105–135 （▶ の行: 114–115, 129, 131, 133–134）

```ts
105 │   it('should preserve NgClass import when unconverted [ngClass] bindings remain', async () => {
106 │     writeFile(
107 │       '/app.component.ts',
108 │       `
109 │         import {Component} from '@angular/core';
110 │         import {NgClass} from '@angular/common';
111 │         @Component({
112 │           imports: [NgClass],
113 │           template: \`
114 ▶             <div [ngClass]="{ active: isActive }">migrated</div>
115 ▶             <div [ngClass]="['class-a', condition ? 'class-b' : '']">skipped (array)</div>
116 │           \`,
117 │         })
118 │         export class App {
119 │           isActive = true;
120 │           condition = true;
121 │         }
122 │       `,
123 │     );
124 │ 
125 │     await runMigration();
126 │ 
127 │     const content = tree.readContent('/app.component.ts');
128 │ 
129 ▶     expect(content).toContain('[class.active]="isActive"');
130 │     // The array binding should remain as [ngClass].
131 ▶     expect(content).toContain("[ngClass]=\"['class-a', condition ? 'class-b' : '']\"");
132 │     // NgClass import must be preserved since [ngClass] still exists in the template.
133 ▶     expect(content).toContain("import {NgClass} from '@angular/common';");
134 ▶     expect(content).toContain('imports: [NgClass]');
135 │   });
```

223e40279f3 で足された it です。114 行目は変えられる、115 行目は配列なので変えられない `[ngClass]` で、133〜134 行目で import と `imports` 配列が残ることを確かめます。ngstyle の spec（test/ngstyle\_to\_style\_migration\_spec.ts）にはこの形の it がありません。5 節の確認は、この it の `ngClass` を `ngStyle` に置き換えたものです。

### 手元で走らせた結果

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/schematics/migrations/self-closing-tags-migration:test \
  --nocache_test_results --test_output=all
pnpm bazel test //packages/core/schematics/test:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=self-closing-tags migration"
pnpm bazel test //packages/core/schematics/test:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=NgStyle migration"
pnpm bazel test //packages/core/schematics/ng-generate/ngclass-to-class-migration:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=NgClass migration"
```

📄 `出力（2026-11-03 に実行。抜粋。ログは scratchpad/mig-logs/b-selfclosing-mig.log・b-selfclosing-test.log・b-ngstyle-test.log・b-ngclass.log）`

```
//packages/core/schematics/migrations/self-closing-tags-migration:test
11 specs, 0 failures                         PASSED in 0.7s
//packages/core/schematics/test:test（filter=self-closing-tags migration）
Ran 0 of 516 specs ×14 shard、Ran 1 of 517 specs ×2 shard   PASSED in 1.0s
//packages/core/schematics/test:test（filter=NgStyle migration）
Ran 1 of 500 specs ×13 shard、Ran 2 of 501 specs ×3 shard   PASSED in 1.8s
//packages/core/schematics/ng-generate/ngclass-to-class-migration:test（filter=NgClass migration）
Ran 37 of 47 specs, 37 specs, 0 failures      PASSED in 0.8s
```

- 本体の spec は 11 本で、it の数と一致しました（0.7 秒）。
- test:test を `self-closing-tags migration` で絞ると、16 の shard のうち 2 つに 1 本ずつ、合計 2 本（1.0 秒）。**14 の shard は「Ran 0 of 516 specs」でも PASSED**なので、必ず合計を数えます。
- `NgStyle migration` で絞ると 13 × 1 + 3 × 2 = 19 本（1.8 秒）。`NgStyle migration bestEffortMode option` の 3 本も、名前に `NgStyle migration` を含むので一緒に走ります（filter は正規表現の部分一致）。
- ngclass は `NgClass migration` で 37 of 47（0.8 秒）。絞らずに走らせると 47 本です（b-ngclass-all.log）。

### 直すとしたら

- ngStyle が NgStyle を消しすぎる：`ng-generate/ngstyle-to-style-migration/util.ts` の `NgStyleCollector` に、ngclass の `skippedNgClassCount` にあたる数を足し、`ngstyle-to-style-migration.ts` の 120〜141 行目を ngclass の `processClass`（109〜144 行目）と 185〜190 行目の形にするのが入口です。spec は test/ngstyle\_to\_style\_migration\_spec.ts に、上の 105〜135 行目と同じ形の it を足します（ターゲットは `//packages/core/schematics/test:test`）。
- 値の `"`：ngStyle の util.ts 305・308 行目。main の ngclass の `buildAttribute`（#70818）が手本です。
- `touchedFilesCount` がクラスの数になる：self-closing-tags-migration.ts 91〜93 行目の `===`。比べるなら `file.id` どうしです。ngclass と ngstyle の `stats` も同じ数え方です。
- どれも本家に PR を出すことは勧めません。手元で spec を足して落ちることを確かめ、issue を探すとき・読むときの手がかりにします（[第 20 回](20-mig-issues.md)）。

## 聞かれそうな質問

**Q. self-closing-tags は、コンポーネントかどうかをどうやって判断していますか？**

判断していません。to-self-closing-tags.ts の 93 行目は「`DomElementSchemaRegistry` の要素名の一覧に無い」ことだけを見ます。だから `app-x` のようなコンポーネントのほか、`ng-container`・`ng-content`・`ng-template`、未知のカスタム要素も、中身が無ければ `/>` になります。`<div></div>` は一覧にあるので変わりません。

**Q. 中身が改行と空白だけの要素は自己終了になりますか？コメントだけなら？**

改行と空白だけなら、なります（110〜112 行目：子が 1 つで、空白だけの `Text`）。コメントだけの要素は、子が `Comment` なので 112 行目が偽になり、変わりません。本体の spec の it `should migrate multiple cases of spacing` に空白の形の例が並んでいます。

**Q. \[ngClass\]="cls" のような変数は、なぜ変えないのですか？**

util.ts の 383〜385 行目で `{…}` の形でなければ `null` にし、301〜302 行目で飛ばします。変数の中身が文字列か配列かオブジェクトかは、テンプレートの文字列だけでは分からないからです（このマイグレーションは型を見ません）。飛ばした数は `skippedNgClassCount` に入り、1 つでもあればそのクラスの `NgClass` の import は残ります（ngclass-to-class-migration.ts 132 行目）。

**Q. {'a b': x, c: y} は移行されますか？**

既定では移行されません。空白区切りのキーがあると `[class]="…"` にできないので、`--migrate-space-separated-key` を付けて、333〜335 行目の条件を満たすときだけ `[class.a]="x" [class.b]="x" [class.c]="y"` に展開します（338〜340 行目）。それ以外は 343 行目で元のまま残します（49672c437b4、#69833）。

**Q. ngStyle の移行のあとでビルドが通らなくなりました。何が起きていますか？**

変えられなかった `[ngStyle]`（変数や呼び出しの式）が同じコンポーネントに残っているのに、`NgStyle` の import が消えた可能性があります。ngstyle-to-style-migration.ts の 120〜141 行目は「1 か所でも変わったら消す」で、残りを数えていません（5 節の確認）。もう 1 つは値に `"` を含む式で、util.ts 305・308 行目が `"` で囲むだけなので属性が壊れます。どちらもこのスナップショットと main で同じです。

## 読み終えて

- 3 つとも「テンプレートを HTML の AST にして判定し、テンプレート全体を 1 つの TextUpdate で置き換える」。中の小さな置き換えは文字列の上で順に作り直す。
- self-closing-tags の判定は 3 つ：まだ `/>` でない・知っている HTML の要素名でない・中身が無いか空白だけ。コンポーネントかは見ない。
- ngclass-to-class は `{…}` のオブジェクトリテラルだけを TypeScript で読み、0 個・1 個・複数・空白区切りのキーで出し方を変える。変えられなかった数で import を消すかを決める。
- ngstyle-to-style は同じ形だが、その数が無く、値の `"` の扱いも直っていない。手元で本物の bundle を走らせて確かめた。

---

← 前: [inject() への移行と @Service](13-mig-inject.md)  
次: [使っていない import を消す・CommonModule を分ける](15-mig-cleanup-imports.md) →
