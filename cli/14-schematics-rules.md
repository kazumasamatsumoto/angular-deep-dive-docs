[目次](../README.md) › [CLI とビルド](README.md) › 第 14 回 / 全 16 回

# Rule の組み立て：chain・apply・url・template・mergeWith

> Rule が Tree・Observable・Promise・Rule・void のどれを返してもよく callRule がそろえること、chain が Rule を順に流す行、apply(url("./files"), \[template(), move()\]) が別の Tree を作り、mergeWith が今の Tree に重ねる行、MergeStrategy、template が &lt;%= %&gt; を処理する仕組みと applyTemplates、externalSchematic。

angular/angular-cli · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/schematics-rules)

---

schematic の本体は Rule（Tree を受け取って Tree を返す関数）を組み合わせたものです。この章では、Rule が返してよい値と、それを実行側の `callRule` がどう 1 つの `Observable<Tree>` にそろえるか、`chain` が Rule を順に流す行、`apply(url('./files'), [...])` が**別の Tree** を作り `mergeWith` が今の Tree に重ねる行、`template` が `<%= %>` とファイル名の `__name@dasherize__` を置き換える仕組み、`externalSchematic` までを読みます。

読む対象は angular-cli リポジトリの `packages/angular_devkit/schematics/src/rules/`（`base.ts`・`call.ts`・`url.ts`・`template.ts`・`move.ts`・`schematic.ts`）、`engine/interface.ts`、`tools/file-system-engine-host-base.ts`、テンプレートの実装 `packages/angular_devkit/core/src/utils/template.ts` と名前の変換 `core/src/utils/strings.ts` です。

1. [1. 概観](01-cli-overview.md)
2. [2. ng build の段取り](02-build.md)
3. [3. AotCompilation](03-cli-angular-compilation.md)
4. [4. コンポーネントのスタイル](04-cli-component-styles.md)
5. [5. oxc の変換](05-cli-javascript-transformer.md)
6. [6. リンカー](06-cli-linker.md)
7. [7. 遅延チャンク](07-cli-code-splitting.md)
8. [8. budgets](08-cli-budgets.md)
9. [9. i18n](09-cli-i18n.md)
10. [10. 再ビルドとキャッシュ](10-cli-cache-watch.md)
11. [11. HMR](11-cli-hmr.md)
12. [12. unit-test と Vitest](12-cli-unit-test.md)
13. [13. Tree と sink](13-schematics.md)
14. **14. Rule の組み立て**（この章）
15. [15. ng generate component](15-schematics-component.md)
16. [16. ng add と ng update](16-cli-add-update.md)

## 0. 典型的な schematic の形

[第 15 回](15-schematics-component.md)で読む `component/index.ts` の骨組みは、次の 3 段です。この章はこの 3 段の部品を 1 つずつ開けていきます。

1. **テンプレートの Tree を作る（Source）**

   `apply(url('./files'), [filter(...), applyTemplates({...}), move(path)])`。schematic のパッケージの中の `files/` フォルダを、空の Tree に全部「作成」として読み込み、名前と中身を置き換え、置き場所へ移す（3〜6 節）。
2. **今の Tree に重ねる（Rule）**

   `mergeWith(source)`。テンプレートの Tree の Action を、ワークスペースの Tree に写す（2 節）。
3. **順に流す（Rule）**

   `chain([addDeclarationToNgModule(...), mergeWith(...)])`。前の Rule が返した Tree を次の Rule に渡す（1 節）。

## 1. Rule と Source の型、そして callRule

📄 `angular-cli/packages/angular_devkit/schematics/src/engine/interface.ts` L226–239 （▶ の行: 235–239）

```ts
226 │ /**
227 │  * A source is a function that generates a Tree from a specific context. A rule transforms a tree
228 │  * into another tree from a specific context. In both cases, an Observable can be returned if
229 │  * the source or the rule are asynchronous. Only the last Tree generated in the observable will
230 │  * be used though.
231 │  *
232 │  * We obfuscate the context of Source and Rule because the schematic implementation should not
233 │  * know which types is the schematic or collection metadata, as they are both tooling specific.
234 │  */
235 ▶ export type Source = (context: SchematicContext) => Tree | Observable<Tree>;
236 ▶ export type Rule = (
237 ▶   tree: Tree,
238 ▶   context: SchematicContext,
239 ▶ ) => Tree | Observable<Tree> | Rule | Promise<void | Tree | Rule> | void;
```

235 行目、Source は「context から Tree を作る関数」。236〜239 行目、Rule は「Tree と context を受け取る関数」で、返してよい値が 5 種類あります。`Tree`・`Observable<Tree>`・**別の `Rule`**・`Promise<void | Tree | Rule>`・`void`。Rule を書く人がどれを返しても動くように、実行側が 1 つの形にそろえます。それが `callRule` です。

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/call.ts` L65–98 （▶ の行: 70–71, 73, 78, 80, 82, 85–86, 89–90, 93, 97）

```ts
65 │ export function callRule(
66 │   rule: Rule,
67 │   input: Tree | Observable<Tree>,
68 │   context: SchematicContext,
69 │ ): Observable<Tree> {
70 ▶   if (isObservable(input)) {
71 ▶     return input.pipe(mergeMap((inputTree) => callRuleAsync(rule, inputTree, context)));
72 │   } else {
73 ▶     return defer(() => callRuleAsync(rule, input, context));
74 │   }
75 │ }
76 │ 
77 │ async function callRuleAsync(rule: Rule, tree: Tree, context: SchematicContext): Promise<Tree> {
78 ▶   let result = await rule(tree, context);
79 │ 
80 ▶   while (typeof result === 'function') {
81 │     // This is considered a Rule, chain the rule and return its output.
82 ▶     result = await result(tree, context);
83 │   }
84 │ 
85 ▶   if (typeof result === 'undefined') {
86 ▶     return tree;
87 │   }
88 │ 
89 ▶   if (isObservable(result)) {
90 ▶     result = await lastValueFrom(result.pipe(defaultIfEmpty(tree)));
91 │   }
92 │ 
93 ▶   if (result && TreeSymbol in result) {
94 │     return result;
95 │   }
96 │ 
97 ▶   throw new InvalidRuleResultException(result);
98 │ }
```

1. **入力をそろえる（70〜74 行目）**

   入力が `Observable<Tree>` なら 71 行目で `mergeMap` し、Tree が流れてきてから実行します。Tree そのものなら 73 行目の `defer` で、購読されるまで実行しません。
2. **呼ぶ（78 行目）**

   `await rule(tree, context)`。`Promise` はここで解けます。
3. **関数が返ったら、それも Rule として呼ぶ（80〜83 行目）**

   関数でなくなるまで繰り返します。「設定を読んでから、その結果に応じた Rule を返す」書き方ができるのはこのループのおかげです。
4. **何も返さなければ、入力の Tree（85〜87 行目）**

   「渡された Tree を書き換えて終わり」の Rule は `void` でよい、ということです。
5. **Observable なら最後の値（89〜91 行目）**

   `lastValueFrom`。何も流れずに終わったら `defaultIfEmpty(tree)` で入力の Tree。
6. **Tree であることの確認（93〜97 行目）**

   `TreeSymbol` を持っていなければ `InvalidRuleResultException`。

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/call.ts` L49–63 （▶ の行: 51, 53–54, 57, 61）

```ts
49 │ export function callSource(source: Source, context: SchematicContext): Observable<Tree> {
50 │   return defer(async () => {
51 ▶     let result: Tree | Observable<Tree> | undefined = source(context);
52 │ 
53 ▶     if (isObservable(result)) {
54 ▶       result = await lastValueFrom(result.pipe(defaultIfEmpty(undefined)));
55 │     }
56 │ 
57 ▶     if (result && TreeSymbol in result) {
58 │       return result;
59 │     }
60 │ 
61 ▶     throw new InvalidSourceResultException(result);
62 │   });
63 │ }
```

Source 側も同じ考えで、51 行目で呼び、53〜54 行目で Observable なら最後の値、57 行目で Tree かを確かめます。Source が `void` を返すことは許されません（61 行目）。

### chain と apply

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/base.ts` L32–57 （▶ の行: 35–36, 40, 44, 48, 55–56）

```ts
32 │ /**
33 │  * Chain multiple rules into a single rule.
34 │  */
35 ▶ export function chain(rules: Iterable<Rule> | AsyncIterable<Rule>): Rule {
36 ▶   return async (initialTree, context) => {
37 │     let intermediateTree: Observable<Tree> | undefined;
38 │     if (Symbol.asyncIterator in rules) {
39 │       for await (const rule of rules) {
40 ▶         intermediateTree = callRule(rule, intermediateTree ?? initialTree, context);
41 │       }
42 │     } else {
43 │       for (const rule of rules) {
44 ▶         intermediateTree = callRule(rule, intermediateTree ?? initialTree, context);
45 │       }
46 │     }
47 │ 
48 ▶     return () => intermediateTree;
49 │   };
50 │ }
51 │ 
52 │ /**
53 │  * Apply multiple rules to a source, and returns the source transformed.
54 │  */
55 ▶ export function apply(source: Source, rules: Rule[]): Source {
56 ▶   return (context) => callRule(chain(rules), callSource(source, context), context);
57 │ }
```

44 行目、`chain` は for 文で `callRule(rule, intermediateTree ?? initialTree, context)` を呼び、戻り値の Observable を次の Rule の入力にします。この時点では **Observable を繋いでいるだけで、どの Rule もまだ実行されていません**（上の 71・73 行目のとおり、購読されてから動く）。48 行目で返すのは `() => intermediateTree`、つまり**関数**です。`callRuleAsync` の 80〜83 行目がこれを Rule として呼び、出てきた Observable を 89〜91 行目で最後まで流します。そこで初めて 1 つ目の Rule から順に動きます。

55〜56 行目、`apply(source, rules)` は「Source を呼んで Tree を作り、それに `chain(rules)` をかける」**Source** です。Rule ではありません。だから `apply(...)` の結果は、そのままでは今の Tree に何もしません。重ねるのが次の `mergeWith` です。

## 2. mergeWith・branchAndMerge と MergeStrategy

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/base.ts` L59–96 （▶ の行: 62, 64–66, 71–72, 78, 91–92）

```ts
59 │ /**
60 │  * Merge an input tree with the source passed in.
61 │  */
62 ▶ export function mergeWith(source: Source, strategy: MergeStrategy = MergeStrategy.Default): Rule {
63 │   return (tree, context) => {
64 ▶     return callSource(source, context).pipe(
65 ▶       map((sourceTree) => tree.merge(sourceTree, strategy || context.strategy)),
66 ▶       mapTo(tree),
67 │     );
68 │   };
69 │ }
70 │ 
71 ▶ export function noop(): Rule {
72 ▶   return () => {};
73 │ }
74 │ 
75 │ export function filter(predicate: FilePredicate<boolean>): Rule {
76 │   return (tree: Tree) => {
77 │     if (HostTree.isHostTree(tree)) {
78 ▶       return new FilterHostTree(tree, predicate);
79 │     } else {
80 │       throw new SchematicsException('Tree type is not supported.');
81 │     }
82 │   };
83 │ }
84 │ 
85 │ export function asSource(rule: Rule): Source {
86 │   return (context) => callRule(rule, staticEmpty(), context);
87 │ }
88 │ 
89 │ export function branchAndMerge(rule: Rule, strategy: MergeStrategy = MergeStrategy.Default): Rule {
90 │   return (tree, context) => {
91 ▶     return callRule(rule, tree.branch(), context).pipe(
92 ▶       map((branch) => tree.merge(branch, strategy || context.strategy)),
93 │       mapTo(tree),
94 │     );
95 │   };
96 │ }
```

64 行目で Source を呼んで別の Tree を作り、65 行目で `tree.merge(sourceTree, strategy || context.strategy)`、66 行目で今の Tree を返します。`merge` が相手の Action を 1 つずつ写す中身と、衝突で `MergeConflictException` を投げる条件は[第 13 回](13-schematics.md)の 5 節で読みました。

71〜72 行目の `noop()` は何も返さない Rule です（1 節の 85〜87 行目で入力の Tree になる）。`options.skipTests ? filter(...) : noop()` のように「条件によって何もしない」を書くのに使います。78 行目の `filter` は `FilterHostTree`（条件に合うファイルと Action だけを持つ新しい Tree）を返します。91〜92 行目の `branchAndMerge` は、今の Tree の複製（`branch()`）に Rule をかけてから元に重ね戻します。

📄 `angular-cli/packages/angular_devkit/schematics/src/tree/interface.ts` L12–29 （▶ の行: 13–15, 18, 25, 28）

```ts
12 │ export enum MergeStrategy {
13 ▶   AllowOverwriteConflict = 1 << 1,
14 ▶   AllowCreationConflict = 1 << 2,
15 ▶   AllowDeleteConflict = 1 << 3,
16 │ 
17 │   // Uses the default strategy.
18 ▶   Default = 0,
19 │ 
20 │   // Error out if 2 files have the same path. It is useful to have a different value than
21 │   // Default in this case as the tooling Default might differ.
22 │   Error = 1 << 0,
23 │ 
24 │   // Only content conflicts are overwritten.
25 ▶   ContentOnly = AllowOverwriteConflict,
26 │ 
27 │   // Overwrite everything with the latest change.
28 ▶   Overwrite = AllowOverwriteConflict + AllowCreationConflict + AllowDeleteConflict,
29 │ }
```

MergeStrategy はビットの組み合わせです。13〜15 行目の 3 つのビットが「上書きの衝突を許す」「作成の衝突を許す」「削除の衝突を許す」。18 行目の `Default = 0` はどれも許しません。`mergeWith(source)` の既定はこれで、65 行目の `strategy || context.strategy` で `0` は偽なので context 側の値になり、それも既定では `Default` です。28 行目の `Overwrite` は 3 つ全部を許します。`mergeWith(source, MergeStrategy.Overwrite)` と書けば、既にあるファイルもテンプレートで上書きされます。

### forEach と applyToSubtree

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/base.ts` L127–150 （▶ の行: 129, 133, 137–138, 142–143, 145–146）

```ts
127 │ export function forEach(operator: FileOperator): Rule {
128 │   return (tree: Tree) => {
129 ▶     tree.visit((path, entry) => {
130 │       if (!entry) {
131 │         return;
132 │       }
133 ▶       const newEntry = operator(entry);
134 │       if (newEntry === entry) {
135 │         return;
136 │       }
137 ▶       if (newEntry === null) {
138 ▶         tree.delete(path);
139 │ 
140 │         return;
141 │       }
142 ▶       if (newEntry.path != path) {
143 ▶         tree.rename(path, newEntry.path);
144 │       }
145 ▶       if (!newEntry.content.equals(entry.content)) {
146 ▶         tree.overwrite(newEntry.path, newEntry.content);
147 │       }
148 │     });
149 │   };
150 │ }
```

129 行目で Tree の全ファイルを訪ね、133 行目でファイルごとの関数（`FileOperator`）を呼びます。返った値によって、`null` なら 138 行目で削除、パスが変われば 143 行目で rename、中身が変われば 146 行目で overwrite。この後に出てくる `template`・`applyTemplates` はどちらもこの `forEach` の上に作られています。

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/base.ts` L168–184 （▶ の行: 170, 172, 174, 177）

```ts
168 │ export function applyToSubtree(path: string, rules: Rule[]): Rule {
169 │   return (tree, context) => {
170 ▶     const scoped = new ScopedTree(tree, path);
171 │ 
172 ▶     return callRule(chain(rules), scoped, context).pipe(
173 │       map((result) => {
174 ▶         if (result === scoped) {
175 │           return tree;
176 │         } else {
177 ▶           throw new SchematicsException(
178 │             'Original tree must be returned from all rules when using "applyToSubtree".',
179 │           );
180 │         }
181 │       }),
182 │     );
183 │   };
184 │ }
```

170 行目、`ScopedTree`（`path` を根に見せる Tree）を作って Rule を流します。174〜178 行目、Rule が**渡された scoped な Tree をそのまま返さないと例外**です。別の Tree を返す Rule（`filter` など）はここでは使えません。

## 3. url('./files')：テンプレートのフォルダを Tree にする

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/url.ts` L12–16 （▶ の行: 13, 15）

```ts
12 │ export function url(urlString: string): Source {
13 ▶   const url = parse(urlString);
14 │ 
15 ▶   return (context: SchematicContext) => context.engine.createSourceFromUrl(url, context)(context);
16 │ }
```

📄 `angular-cli/packages/angular_devkit/schematics/tools/file-system-engine-host-base.ts` L278–296 （▶ の行: 280–281, 284, 293, 295）

```ts
278 │   createSourceFromUrl(url: Url): Source | null {
279 │     switch (url.protocol) {
280 ▶       case null:
281 ▶       case 'file:':
282 │         return (context) => {
283 │           // Check if context has necessary FileSystemSchematicContext path property
284 ▶           const fileDescription = context.schematic.description as { path?: string };
285 │           if (fileDescription.path === undefined) {
286 │             throw new Error(
287 │               'Unsupported schematic context. Expected a FileSystemSchematicContext.',
288 │             );
289 │           }
290 │ 
291 │           // Resolve all file:///a/b/c/d from the schematic's own path, and not the current
292 │           // path.
293 ▶           const root = normalize(resolve(fileDescription.path, url.path || ''));
294 │ 
295 ▶           return new HostCreateTree(new virtualFs.ScopedHost(new NodeJsSyncHost(), root));
296 │         };
```

📄 `angular-cli/packages/angular_devkit/schematics/src/tree/host-tree.ts` L478–490 （▶ の行: 480, 482–483, 486）

```ts
478 │ export class HostCreateTree extends HostTree {
479 │   constructor(host: virtualFs.ReadonlyHost) {
480 ▶     super();
481 │ 
482 ▶     const tempHost = new HostTree(host);
483 ▶     tempHost.visit((path) => {
484 │       const content = tempHost.read(path);
485 │       if (content) {
486 ▶         this.create(path, content);
487 │       }
488 │     });
489 │   }
490 │ }
```

1. **URL を読む（url.ts 13 行目）**

   `'./files'` を Node の `url.parse` にかけます。プロトコルが無いので `protocol` は `null`。
2. **engine に作り方を聞く（15 行目）**

   `context.engine.createSourceFromUrl` が、`null:`・`empty:` 以外をエンジンホストに回します。
3. **schematic の置き場所から解く（280〜293 行目）**

   280〜281 行目、プロトコル無しと `file:` は同じ扱い。293 行目、**今いるフォルダではなく、schematic の説明に入っている `path`**（component なら `@schematics/angular/component`）を基準に解きます。
4. **全ファイルを「作成」にする（host-tree.ts 480〜487 行目）**

   `HostCreateTree` は 480 行目で空の Tree として作られ、482〜487 行目でフォルダの全ファイルを `this.create` します。だからテンプレートの Tree の Action は**全部 `c`** で、`mergeWith` では 13 回の 5 節の create の分岐を通ります。

## 4. template と applyTemplates

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/template.ts` L177–204 （▶ の行: 178–179, 183, 188, 190, 192, 194, 198）

```ts
177 │ export function template<T extends object>(options: T): Rule {
178 ▶   return chain([
179 ▶     contentTemplate(options),
180 │     // Force cast to PathTemplateData. We need the type for the actual pathTemplate() call,
181 │     // but in this case we cannot do anything as contentTemplate are more permissive.
182 │     // Since values are coerced to strings in PathTemplates it will be fine in the end.
183 ▶     pathTemplate(options as {} as PathTemplateData),
184 │   ]);
185 │ }
186 │ 
187 │ export function applyTemplates<T extends object>(options: T): Rule {
188 ▶   return forEach(
189 │     when(
190 ▶       (path) => path.endsWith('.template'),
191 │       composeFileOperators([
192 ▶         applyContentTemplate(options),
193 │         // See above for this weird cast.
194 ▶         applyPathTemplate(options as {} as PathTemplateData),
195 │         (entry) => {
196 │           return {
197 │             content: entry.content,
198 ▶             path: entry.path.replace(TEMPLATE_FILENAME_RE, ''),
199 │           } as FileEntry;
200 │         },
201 │       ]),
202 │     ),
203 │   );
204 │ }
```

2 つは似ていますが、違いは 3 つあります。

|   | `template(options)`（177〜185 行目） | `applyTemplates(options)`（187〜204 行目） |
| --- | --- | --- |
| 対象 | Tree の全ファイル | 190 行目、名前が `.template` で終わるファイルだけ |
| 回し方 | 178 行目、中身用とパス用の 2 つの Rule を `chain`（ファイルを 2 回訪ねる） | 188 行目、1 回の `forEach` で中身 → パス → 拡張子の 3 つを続けて適用 |
| `.template` | 外さない（別に `renameTemplateFiles()` が要る） | 198 行目で外す |

`@schematics/angular` の component・service などは `applyTemplates` を使います。テンプレートのファイルに `.template` を付けておけば、それ以外のファイル（画像など）は置き換えずにそのまま写せる、という使い分けです。

### 中身：applyContentTemplate

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/template.ts` L53–81 （▶ の行: 58, 62, 67–68, 71）

```ts
53 │ export function applyContentTemplate<T>(options: T): FileOperator {
54 │   return (entry: FileEntry) => {
55 │     const { path, content } = entry;
56 │ 
57 │     try {
58 ▶       const decodedContent = decoder.decode(content).replace(/\r?\n/g, EOL);
59 │ 
60 │       return {
61 │         path,
62 ▶         content: Buffer.from(templateImpl(decodedContent, {})(options)),
63 │       };
64 │     } catch (e) {
65 │       // The second part should not be needed. But Jest does not support instanceof correctly.
66 │       // See: https://github.com/jestjs/jest/issues/2549
67 ▶       if (
68 ▶         e instanceof TypeError ||
69 │         (e as NodeJS.ErrnoException).code === 'ERR_ENCODING_INVALID_ENCODED_DATA'
70 │       ) {
71 ▶         return entry;
72 │       }
73 │ 
74 │       throw e;
75 │     }
76 │   };
77 │ }
78 │ 
79 │ export function contentTemplate<T>(options: T): Rule {
80 │   return forEach(applyContentTemplate(options));
81 │ }
```

58 行目で UTF-8 として読み、改行を OS の改行（`EOL`）にそろえます。62 行目で core の `template` 関数に中身を渡して関数を作り、すぐ `options` を渡して呼びます。67〜71 行目、UTF-8 として読めないファイル（画像など）は例外を握りつぶして**元のまま**返します。

### core の template：&lt;%= %&gt; の実装

📄 `angular-cli/packages/angular_devkit/core/src/utils/template.ts` L11–20 （▶ の行: 12, 14, 19–20）

```ts
11 │ // Matches <%= expr %>. This does not support structural JavaScript (for/if/...).
12 ▶ const kInterpolateRe = /<%=([\s\S]+?)%>/g;
13 │ // Matches <%# text %>. It's a comment and will be entirely ignored.
14 ▶ const kCommentRe = /<%#([\s\S]+?)%>/g;
15 │ 
16 │ // Used to match template delimiters.
17 │ // <%- expr %>: HTML escape the value.
18 │ // <% ... %>: Structural template code.
19 ▶ const kEscapeRe = /<%-([\s\S]+?)%>/g;
20 ▶ const kEvaluateRe = /<%([\s\S]+?)%>/g;
```

📄 `angular-cli/packages/angular_devkit/core/src/utils/template.ts` L355–373 （▶ の行: 357, 364, 370, 373）

```ts
355 │ export function template<T>(content: string, options?: TemplateOptions): (input: T) => string {
356 │   const sourceUrl = (options && options.sourceURL) || 'ejs';
357 ▶   const ast = templateParser(content, sourceUrl);
358 │ 
359 │   let source: string;
360 │   // If there's no need for source map support, we revert back to the fast implementation.
361 │   if (options && options.sourceMap) {
362 │     source = templateWithSourceMap(ast, options);
363 │   } else {
364 ▶     source = templateFast(ast, options);
365 │   }
366 │ 
367 │   // We pass a dummy module in case the module option is passed. If `module: true` is passed, we
368 │   // need to only use the source, not the function itself. Otherwise expect a module object to be
369 │   // passed, and we use that one.
370 ▶   const fn = Function('module', source);
371 │   const module =
372 │     options && options.module ? (options.module === true ? { exports: {} } : options.module) : null;
373 ▶   const result = fn(module);
```

📄 `angular-cli/packages/angular_devkit/core/src/utils/template.ts` L195–230 （▶ の行: 200, 203, 210, 215, 217, 219, 221）

```ts
195 │ function templateFast(ast: TemplateAst, options?: TemplateOptions): string {
196 │   const module = options && options.module ? 'module.exports.default =' : '';
197 │   const reHtmlEscape = reUnescapedHtml.source.replace(/[']/g, "\\\\\\'");
198 │ 
199 │   return `
200 ▶     return ${module} function(obj) {
201 │       obj || (obj = {});
202 │       let __t;
203 ▶       let __p = '';
204 │       const __escapes = ${JSON.stringify(kHtmlEscapes)};
205 │       const __escapesre = new RegExp('${reHtmlEscape}', 'g');
206 │ 
207 │       const __e = function(s) {
208 │         return s ? s.replace(__escapesre, function(key) { return __escapes[key]; }) : '';
209 │       };
210 ▶       with (obj) {
211 │         ${ast.children
212 │           .map((node) => {
213 │             switch (node.kind) {
214 │               case 'content':
215 ▶                 return `__p += ${JSON.stringify(node.content)};`;
216 │               case 'interpolate':
217 ▶                 return `__p += ((__t = (${node.expression})) == null) ? '' : __t;`;
218 │               case 'escape':
219 ▶                 return `__p += __e(${node.expression});`;
220 │               case 'evaluate':
221 ▶                 return node.expression;
222 │             }
223 │           })
224 │           .join('\n')}
225 │       }
226 │ 
227 │       return __p;
228 │     };
229 │   `;
230 │ }
```

1. **4 種類の区切り（11〜20 行目）**

   12 行目の `<%= 式 %>` は値を埋め込む、14 行目の `<%# %>` はコメント、19 行目の `<%- 式 %>` は HTML エスケープして埋め込む、20 行目の `<% 文 %>` は JavaScript の文をそのまま実行（`if` など）。
2. **テキストを分ける（357 行目）**

   `templateParser` が文字列を区切りで分け、`content` / `interpolate` / `escape` / `comment` / `evaluate` の並びにします。
3. **JavaScript のソースを組み立てる（364 行目 → 195〜230 行目）**

   215 行目、ただの文字列は `__p += "…";`。217 行目、`<%= %>` は `__p += ((__t = (式)) == null) ? '' : __t;`。221 行目、`<% %>` は式の文字列をそのまま貼ります。コメントの節は出力しません。
4. **with で名前を解く（210 行目）**

   全体を `with (obj) { … }` で包むので、テンプレートの中の `name` や `dasherize` は `obj.name`・`obj.dasherize` として解かれます。component の `applyTemplates({ ...strings, ...options, ... })` が文字列の関数と全オプションを 1 つのオブジェクトに混ぜて渡すのはこのためです。
5. **関数にする（370〜373 行目）**

   `Function('module', source)` でソースから関数を作り、呼んで「`obj` を受け取って文字列を返す関数」を得ます。

> [!WARNING]
> **ハマりどころ**
>
> テンプレートの式は本物の JavaScript として実行されます。`<%= name %>` の `name` がオプションに無ければ、`with` の外まで探しに行って `ReferenceError` になります。component/index.ts が `options.type ??= ''` のように「使わない値も空文字で埋める」のはこのためです（[第 15 回](15-schematics-component.md)）。

### パス：applyPathTemplate

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/template.ts` L83–116 （▶ の行: 86–88, 101, 103, 105–106）

```ts
 83 │ export function applyPathTemplate<T extends PathTemplateData>(
 84 │   data: T,
 85 │   options: PathTemplateOptions = {
 86 ▶     interpolationStart: '__',
 87 ▶     interpolationEnd: '__',
 88 ▶     pipeSeparator: '@',
 89 │   },
 90 │ ): FileOperator {
 91 │   const is = options.interpolationStart;
 92 │   const ie = options.interpolationEnd;
 93 │   const isL = is.length;
 94 │   const ieL = ie.length;
 95 │ 
 96 │   return (entry: FileEntry) => {
 97 │     let path = entry.path as string;
 98 │     const content = entry.content;
 99 │     const original = path;
100 │ 
101 ▶     let start = path.indexOf(is);
102 │     // + 1 to have at least a length 1 name. `____` is not valid.
103 ▶     let end = path.indexOf(ie, start + isL + 1);
104 │ 
105 ▶     while (start != -1 && end != -1) {
106 ▶       const match = path.substring(start + isL, end);
107 │       let replacement = data[match];
108 │ 
109 │       if (!options.pipeSeparator) {
110 │         if (typeof replacement == 'function') {
111 │           replacement = replacement.call(data, original);
112 │         }
113 │ 
114 │         if (replacement === undefined) {
115 │           throw new OptionIsNotDefinedException(match);
116 │         }
```

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/template.ts` L117–155 （▶ の行: 118–119, 121–122, 125–126, 129, 133, 142, 146, 148, 150, 153）

```ts
117 │       } else {
118 ▶         const [name, ...pipes] = match.split(options.pipeSeparator);
119 ▶         replacement = data[name];
120 │ 
121 ▶         if (typeof replacement == 'function') {
122 ▶           replacement = replacement.call(data, original);
123 │         }
124 │ 
125 ▶         if (replacement === undefined) {
126 ▶           throw new OptionIsNotDefinedException(name);
127 │         }
128 │ 
129 ▶         replacement = pipes.reduce((acc: string, pipe: string) => {
130 │           if (!pipe) {
131 │             return acc;
132 │           }
133 ▶           if (!(pipe in data)) {
134 │             throw new UnknownPipeException(pipe);
135 │           }
136 │           const pipeFn = data[pipe];
137 │           if (typeof pipeFn != 'function') {
138 │             throw new InvalidPipeException(pipe);
139 │           }
140 │ 
141 │           // Coerce to string.
142 ▶           return '' + pipeFn(acc);
143 │         }, '' + replacement);
144 │       }
145 │ 
146 ▶       path = path.substring(0, start) + replacement + path.substring(end + ieL);
147 │ 
148 ▶       start = path.indexOf(options.interpolationStart);
149 │       // See above.
150 ▶       end = path.indexOf(options.interpolationEnd, start + isL + 1);
151 │     }
152 │ 
153 ▶     return { path: normalize(path), content };
154 │   };
155 │ }
```

1. **区切り（86〜88 行目）**

   始まりも終わりも `__`、パイプは `@`。
2. **最初の `__…__` を探す（101〜103 行目）**

   終わりは「始まり + 2 + 1」文字目から探すので、`____` のような空の名前は取りません。
3. **名前とパイプに割る（118〜119 行目）**

   `name@dasherize@if-flat` → 名前 `name`、パイプ `['dasherize', 'if-flat']`。121〜122 行目、値が関数ならパスを渡して呼びます。125〜126 行目、値が無ければ `OptionIsNotDefinedException`。
4. **パイプを左から（129〜143 行目）**

   133 行目、データに無いパイプは `UnknownPipeException`。142 行目、前の結果を次のパイプに渡し、結果は文字列にします。
5. **置き換えて、先頭から探し直す（146〜150 行目）**

   146 行目で置き換え、148〜150 行目で**文字列の先頭から**次の `__` を探します。
6. **正規化（153 行目）**

   `normalize` で `//` などをまとめます。`if-flat` が空文字を返してフォルダ名が消えたときの `//` はここで 1 つになります。

### 名前の変換：strings.ts

📄 `angular-cli/packages/angular_devkit/core/src/utils/strings.ts` L9–13 （▶ の行: 9–11）

```ts
 9 ▶ const STRING_DASHERIZE_REGEXP = /[ _]/g;
10 ▶ const STRING_DECAMELIZE_REGEXP = /([a-z\d])([A-Z])/g;
11 ▶ const STRING_CAMELIZE_REGEXP = /(-|_|\.|\s)+(.)?/g;
12 │ const STRING_UNDERSCORE_REGEXP_1 = /([a-z\d])([A-Z]+)/g;
13 │ const STRING_UNDERSCORE_REGEXP_2 = /-|\s+/g;
```

📄 `angular-cli/packages/angular_devkit/core/src/utils/strings.ts` L29–31 （▶ の行: 30）

```ts
29 │ export function decamelize(str: string): string {
30 ▶   return str.replace(STRING_DECAMELIZE_REGEXP, '$1_$2').toLowerCase();
31 │ }
```

📄 `angular-cli/packages/angular_devkit/core/src/utils/strings.ts` L47–49 （▶ の行: 48）

```ts
47 │ export function dasherize(str: string): string {
48 ▶   return decamelize(str).replace(STRING_DASHERIZE_REGEXP, '-');
49 │ }
```

📄 `angular-cli/packages/angular_devkit/core/src/utils/strings.ts` L66–72 （▶ の行: 68–69, 71）

```ts
66 │ export function camelize(str: string): string {
67 │   return str
68 ▶     .replace(STRING_CAMELIZE_REGEXP, (_match: string, _separator: string, chr: string) => {
69 ▶       return chr ? chr.toUpperCase() : '';
70 │     })
71 ▶     .replace(/^([A-Z])/, (match: string) => match.toLowerCase());
72 │ }
```

📄 `angular-cli/packages/angular_devkit/core/src/utils/strings.ts` L89–94 （▶ の行: 91–92）

```ts
89 │ export function classify(str: string): string {
90 │   return str
91 ▶     .split('.')
92 ▶     .map((part) => capitalize(camelize(part)))
93 │     .join('');
94 │ }
```

30 行目の `decamelize` は「小文字か数字の直後の大文字」の前に `_` を入れて全部小文字に（`UserCard` → `user_card`）。48 行目の `dasherize` はさらに 9 行目の `[ _]` を `-` に（→ `user-card`）。68〜69 行目の `camelize` は `-`・`_`・`.`・空白の後ろの文字を大文字にして区切りを消し、71 行目で先頭を小文字に。91〜92 行目の `classify` は `.` で割ってそれぞれ camelize してから先頭を大文字にして繋ぎます（`app.component` → `AppComponent`）。

> **🧪 DEMO — 自作の template で置き換える**
>
> 上の `strings.ts` の正規表現と、`applyPathTemplate` の 101〜153 行目の手順をそのまま写した自作の関数です。データは component/index.ts と同じ形（`...strings`・`if-flat`・`ngext`・`name`・`type`）にしました。中身の置き換えは、実物が式を JavaScript として実行するのに対し、このデモは `name` と `関数(name)` の形だけを扱います（`<% if … %>` の文は扱いません）。
>
> `/__name@dasherize@if-flat__/__name@dasherize__.__type@dasherize__.ts.template`
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/schematics-rules)

## 5. move：置き場所へ動かす

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/move.ts` L15–41 （▶ の行: 16, 18, 24–25, 29, 31, 34–35）

```ts
15 │ export function move(from: string, to?: string): Rule {
16 ▶   if (to === undefined) {
17 │     to = from;
18 ▶     from = '/';
19 │   }
20 │ 
21 │   const fromPath = normalize('/' + from);
22 │   const toPath = normalize('/' + to);
23 │ 
24 ▶   if (fromPath === toPath) {
25 ▶     return noop;
26 │   }
27 │ 
28 │   return (tree) => {
29 ▶     if (tree.exists(fromPath)) {
30 │       // fromPath is a file
31 ▶       tree.rename(fromPath, toPath);
32 │     } else {
33 │       // fromPath is a directory
34 ▶       tree.getDir(fromPath).visit((path) => {
35 ▶         tree.rename(path, join(toPath, path.slice(fromPath.length)));
36 │       });
37 │     }
38 │ 
39 │     return tree;
40 │   };
41 │ }
```

16〜19 行目、引数が 1 つなら「Tree の根 `/` 全体を `to` へ」です。component の `move(parsedPath.path)` はこれで、テンプレートの Tree の `/user-card/user-card.ts` が `/src/app/user-card/user-card.ts` になります。24〜25 行目、同じ場所なら `noop`。29〜31 行目、`from` がファイルならそれだけを rename、34〜35 行目、フォルダなら中の全ファイルを 1 つずつ rename します。テンプレートの Tree の中の rename は、`CordHost.rename` が作成予定の集合の中で名前を付け替えるだけなので、`mergeWith` に渡る Action は動かした後のパスの `c` です。

## 6. 他の schematic を呼ぶ：externalSchematic と schematic

📄 `angular-cli/packages/angular_devkit/schematics/src/rules/schematic.ts` L21–43 （▶ の行: 28, 32, 34–35, 37）

```ts
21 │ export function externalSchematic<OptionT extends object>(
22 │   collectionName: string,
23 │   schematicName: string,
24 │   options: OptionT,
25 │   executionOptions?: Partial<ExecutionOptions>,
26 │ ): Rule {
27 │   return (input: Tree, context: SchematicContext) => {
28 ▶     const collection = context.engine.createCollection(
29 │       collectionName,
30 │       context.schematic.collection,
31 │     );
32 ▶     const schematic = collection.createSchematic(schematicName);
33 │ 
34 ▶     return schematic.call(options, observableOf(branch(input)), context, executionOptions).pipe(
35 ▶       last(),
36 │       map((x) => {
37 ▶         input.merge(x, MergeStrategy.AllowOverwriteConflict);
38 │ 
39 │         return input;
40 │       }),
41 │     );
42 │   };
43 │ }
```

1. **コレクションと schematic を探す（28〜32 行目）**

   別パッケージのコレクション（`collection.json`）を engine から作り、名前で schematic を取り出します。
2. **分けた Tree で実行（34 行目）**

   今の Tree をそのまま渡さず、`branch(input)`（複製）を渡して `schematic.call`。呼んだ先の Rule が全部終わるまで、今の Tree は変わりません。
3. **最後の Tree を重ねる（35〜37 行目）**

   `last()` で最後の Tree を取り、`MergeStrategy.AllowOverwriteConflict` で重ね戻します。複製から始めたので、同じファイルの上書きは衝突にせず相手の内容を採ります。

同じコレクションの schematic を呼ぶ `schematic(name, options)` も同じファイルにあり、同じ形です（コレクションを探さずに今のコレクションを使い、private な schematic も呼べるように `createSchematic(name, true)` を使う点だけ違います）。

## ここまでの呼び出し

- `schematic.call(options, of(tree))` — engine/schematic.ts L51 — *第 13 回の execute から*
  - `callRule(this._factory(options), input, context)` — engine/schematic.ts L76
    - `chain([...])` の返す async 関数 — rules/base.ts L36 — *callRule を繋ぐだけ。48 行目で関数を返す*
    - `callRuleAsync` の while — rules/call.ts L80 — *返った関数を Rule として呼ぶ → Observable を流す*
      - `mergeWith(apply(url('./files'), rules))` — rules/base.ts L62
        - `callSource(apply...)` → `url` → `HostCreateTree` — rules/url.ts L15 / host-tree.ts L478 — *全ファイルが c*
        - `chain(rules)`：`filter` → `applyTemplates` → `move` — rules/template.ts L187 / move.ts L15
          - `forEach → applyContentTemplate → template(...)(options)` — core/src/utils/template.ts L355
          - `applyPathTemplate(data)` — rules/template.ts L83
        - `tree.merge(sourceTree, strategy || context.strategy)` — rules/base.ts L65 — *第 13 回の 5 節*

## 聞かれそうな質問

**Q. Rule は Tree を返さないといけませんか？**

いいえ。236〜239 行目のとおり、`void` でも `Promise` でも別の Rule でもかまいません。`callRuleAsync` が 78 行目で `await`、80〜83 行目で関数を呼び直し、85〜87 行目で `undefined` なら入力の Tree、89〜91 行目で Observable なら最後の値にそろえます。渡された Tree を書き換えるだけの Rule は何も返さないのがふつうです。

**Q. `apply(url('./files'), [...])` だけ書いてもファイルができません。**

`apply` は 55〜56 行目のとおり Source（新しい Tree を作るもの）で、今の Tree には触れません。`mergeWith(apply(...))` にすると、64〜65 行目で Source を呼んで作った Tree を、今の Tree に `merge` します。

**Q. 既にあるファイルをテンプレートで上書きしたいときは？**

`mergeWith(source, MergeStrategy.Overwrite)` にします。28 行目の `Overwrite` は作成・上書き・削除の衝突をすべて許すので、`merge` の create の分岐で例外を投げずに上書きに回ります。既定（18 行目の `Default = 0`）のままだと、中身が違えば `MergeConflictException` です。

**Q. `template()` と `applyTemplates()` はどちらを使えばよいですか？**

テンプレートのファイルに `.template` を付けるなら `applyTemplates` です。190 行目で `.template` のファイルだけを置き換え、198 行目でその拡張子を外します。`template()` は 178〜184 行目のとおり全ファイルの中身とパスを置き換え、`.template` は外しません。

**Q. ファイル名の `__name@dasherize@if-flat__` はどの順に効きますか？**

左からです。118 行目で `name` と `['dasherize', 'if-flat']` に割り、129〜143 行目で `dasherize(name)` の結果を `if-flat` に渡します。component の `if-flat` は `--flat` のとき空文字を返す関数なので、フォルダ名ごと消え、153 行目の `normalize` で `//` が 1 つになります。

## 読み終えて

- Rule は Tree・Observable・Promise・Rule・void のどれを返してもよい。`callRuleAsync` が 1 つの Tree にそろえる。
- `chain` は Observable を繋ぐだけで、最後に返す関数が呼ばれて初めて順に動く。
- `apply(url(...), rules)` は別の Tree を作る Source。`url('./files')` は schematic のフォルダを基準に読み、全ファイルを `c` にする。
- `mergeWith` がそれを今の Tree に重ねる。既定の MergeStrategy は衝突を 1 つも許さない。
- `<%= %>` は `with(obj)` の中の本物の JavaScript。パスの `__x@pipe__` は先頭から探し直す置き換えのループ。

---

← 前: [Tree と sink：ng generate はなぜ失敗しても壊れないか](13-schematics.md)  
次: [ng generate component の中身：@schematics/angular の 1 本を読む](15-schematics-component.md) →
