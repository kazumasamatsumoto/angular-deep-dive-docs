[目次](../README.md) › [マイグレーションの内側](README.md) › 第 10 回 / 全 20 回

# signal クエリへの移行：@ViewChild を viewChild() に

> signal-queries-migration が @ViewChild・@ViewChildren・@ContentChild・@ContentChildren を見つけ、signal-migration と同じ参照の仕組みで書き換える流れ。QueryList の toArray()・first・last・get() を配列の操作に直す書き換え（fn\_\*.ts）、QueryList の changes を使うと移行できない理由。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-signal-queries)

---

`ng generate @angular/core:signal-queries-migration` は、`@ViewChild`・`@ViewChildren`・`@ContentChild`・`@ContentChildren` のフィールドを `viewChild()` などの signal のクエリに書き換えます。この章では、クエリを見つけて（`identify_queries.ts`）、signal input の移行の部品（参照の解決・参照の書き換え・継承の判定・TODO）を**どれだけ使い回しているか**を import から確かめ、`QueryList` の `toArray()`・`get()`・`first`・`last` を配列の操作に直す書き換え（`fn_*.ts`）、`changes` などを使うと移行できない理由、そして開いている issue #71147（2 回以上書き換えられる）の原因の行までを読みます。

読む対象は `packages/core/schematics/migrations/signal-queries-migration/`（`migration.ts`・`identify_queries.ts`・`field_tracking.ts`・`known_queries.ts`・`convert_query_property.ts`・`fn_*.ts`・`incompatible_query_list_fns.ts`・`property_accesses.ts`・`query_list_type.ts`・`incompatibility.ts`）と、`ng-generate/signal-queries-migration/index.ts` です。

1. [1. 全体像](01-mig-overview.md)
2. [2. 入口と配布物](02-mig-entry-bundles.md)
3. [3. プログラムを作る](03-mig-program.md)
4. [4. Tsurge](04-mig-tsurge.md)
5. [5. 置き換え](05-mig-replacements.md)
6. [6. テンプレート](06-mig-templates.md)
7. [7. signal input の段階](07-mig-signal-input-passes.md)
8. [8. 参照の書き換え](08-mig-signal-input-references.md)
9. [9. 移行できない入力](09-mig-signal-input-incompatible.md)
10. **10. signal クエリ**（この章）
11. [11. output()](11-mig-output.md)
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
> signal のクエリ（`viewChild()` など）が実行時にどう動くかは、この章では扱いません。この章は「`@ViewChild` から書き換える」道具の側です。言語サービスの電球から同じ移行を 1 つずつ走らせる入口は[ls-refactorings](../ls/19-ls-refactorings.md)の 2 節の表の「クエリの 4 つ」です。

## 1. 入口：ng-generate/signal-queries-migration/index.ts

📄 `angular/packages/core/schematics/ng-generate/signal-queries-migration/index.ts` L20–34 （▶ の行: 22, 25–28, 30–31）

```ts
20 │ export function migrate(options: Options): Rule {
21 │   return async (tree, context) => {
22 ▶     await runMigrationInDevkit({
23 │       tree,
24 │       getMigration: (fs) =>
25 ▶         new SignalQueriesMigration({
26 ▶           bestEffortMode: options.bestEffortMode,
27 ▶           insertTodosForSkippedFields: options.insertTodos,
28 ▶           shouldMigrateQuery: (_query, file) => {
29 │             return (
30 ▶               file.rootRelativePath.startsWith(fs.normalize(options.path)) &&
31 ▶               !/(^|\/)node_modules\//.test(file.rootRelativePath)
32 │             );
33 │           },
34 │         }),
```

22 行目、signal input と同じ `runMigrationInDevkit`（Tsurge の devkit 用の入口。[第 4 回](04-mig-tsurge.md)）に、25 行目の `SignalQueriesMigration` を渡します。26・27 行目の 2 つの設定は `--best-effort-mode` と `--insert-todos` から、28〜33 行目の `shouldMigrateQuery` は「`--path` の下で、`node_modules` の中ではないファイルのクエリだけ」を移行する判定です。

📄 `angular/packages/core/schematics/ng-generate/signal-queries-migration/index.ts` L64–77 （▶ の行: 66, 68, 71–72, 74, 76）

```ts
64 │       whenDone: ({queriesCount, incompatibleQueries}) => {
65 │         context.logger.info('');
66 ▶         context.logger.info(`Successfully migrated to signal queries 🎉`);
67 │ 
68 ▶         const migratedQueries = queriesCount - incompatibleQueries;
69 │ 
70 │         context.logger.info('');
71 ▶         context.logger.info(`Successfully migrated to signal queries 🎉`);
72 ▶         context.logger.info(`  -> Migrated ${migratedQueries}/${queriesCount} queries.`);
73 │ 
74 ▶         if (incompatibleQueries > 0 && !options.insertTodos) {
75 │           context.logger.warn(`To see why ${incompatibleQueries} queries couldn't be migrated`);
76 ▶           context.logger.warn(`consider re-running with "--insert-todos" or "--best-effort-mode".`);
77 │         }
```

終わったときの表示です。68 行目、移行できた数は「クエリの数 − 移行できないクエリの数」。72 行目がテストで確かめる「Migrated N/M queries.」の行です。66 行目と 71 行目は同じ文で、利用者には「Successfully migrated to signal queries」が 2 回出ます（表示だけの違いで、移行の結果には影響しません）。

## 2. signal input の部品を、どれだけ使い回しているか

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L31–67 （▶ の行: 31–36, 38, 50–51, 66–67）

```ts
31 ▶ } from '../signal-migration/src';
32 ▶ import {checkIncompatiblePatterns} from '../signal-migration/src/passes/problematic_patterns/common_incompatible_patterns';
33 ▶ import {migrateHostBindings} from '../signal-migration/src/passes/reference_migration/migrate_host_bindings';
34 ▶ import {migrateTemplateReferences} from '../signal-migration/src/passes/reference_migration/migrate_template_references';
35 ▶ import {migrateTypeScriptReferences} from '../signal-migration/src/passes/reference_migration/migrate_ts_references';
36 ▶ import {migrateTypeScriptTypeReferences} from '../signal-migration/src/passes/reference_migration/migrate_ts_type_references';
37 │ import {ReferenceMigrationHost} from '../signal-migration/src/passes/reference_migration/reference_migration_host';
38 ▶ import {createFindAllSourceFileReferencesVisitor} from '../signal-migration/src/passes/reference_resolution';
39 │ import {
40 │   ClassFieldUniqueKey,
41 │   KnownFields,
42 │ } from '../signal-migration/src/passes/reference_resolution/known_fields';
43 │ import {
44 │   isHostBindingReference,
45 │   isTemplateReference,
46 │   isTsReference,
47 │   Reference,
48 │ } from '../signal-migration/src/passes/reference_resolution/reference_kinds';
49 │ import {ReferenceResult} from '../signal-migration/src/passes/reference_resolution/reference_result';
50 ▶ import {GroupedTsAstVisitor} from '../signal-migration/src/utils/grouped_ts_ast_visitor';
51 ▶ import {InheritanceGraph} from '../signal-migration/src/utils/inheritance_graph';
52 │ import {computeReplacementsToMigrateQuery} from './convert_query_property';
53 │ import {getClassFieldDescriptorForSymbol, getUniqueIDForClassProperty} from './field_tracking';
54 │ import {ExtractedQuery, extractSourceQueryDefinition} from './identify_queries';
55 │ import {KnownQueries} from './known_queries';
56 │ import {queryFunctionNameToDecorator} from './query_api_names';
57 │ import {removeQueryListToArrayCall} from './fn_to_array_removal';
58 │ import {replaceQueryListGetCall} from './fn_get_replacement';
59 │ import {checkForIncompatibleQueryListAccesses} from './incompatible_query_list_fns';
60 │ import {replaceQueryListFirstAndLastReferences} from './fn_first_last_replacement';
61 │ import {MigrationConfig} from './migration_config';
62 │ import {
63 │   filterBestEffortIncompatibilities,
64 │   markFieldIncompatibleInMetadata,
65 │ } from './incompatibility';
66 ▶ import {insertTodoForIncompatibility} from '../signal-migration/src/passes/problematic_patterns/incompatibility_todos';
67 ▶ import {checkInheritanceOfKnownFields} from '../signal-migration/src/passes/problematic_patterns/check_inheritance';
```

| 使い回すもの（../signal-migration/src/） | 行 | 何に使うか | 読んだ回 |
| --- | --- | --- | --- |
| `FieldIncompatibilityReason` ほか（`index.ts` 経由） | 31 | 理由の値（11・12 はクエリ専用）と「無視できない 5 つ」 | [第 9 回](09-mig-signal-input-incompatible.md) |
| `checkIncompatiblePatterns` | 32 | `new`・`spyOn`・フィールドからの参照 | 第 9 回の 4 節 |
| `migrateTemplateReferences` ほか 4 つ | 33〜36 | TS・テンプレート・ホスト・型の参照の書き換え（`reference_migration/` の側） | [第 8 回](08-mig-signal-input-references.md) |
| `createFindAllSourceFileReferencesVisitor` | 38 | 参照を集める訪問関数そのもの | 第 8 回の 2 節 |
| `GroupedTsAstVisitor`・`InheritanceGraph` | 50・51 | 1 回の巡回・継承の図 | [第 7 回](07-mig-signal-input-passes.md) |
| `insertTodoForIncompatibility`・`checkInheritanceOfKnownFields` | 66・67 | TODO の文・継承の判定 | 第 9 回の 5・6 節 |

使い回さないのは、入力に固有の部分です。`KnownInputs` の代わりに `KnownQueries`（55 行目）、鍵は `field_tracking.ts`（53 行目）、単位のデータの形と merge の仕方は自分で持ちます（3 節）。参照の書き換えは passes/ の pass 7・8 ではなく `reference_migration/` の側を使うので、2 つの組に同じ処理が残っていることに気をつけます（第 8 回の 5 節の囲み）。

## 3. 単位のデータと、TsurgeComplexMigration

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L69–100 （▶ の行: 70, 74, 80, 83, 88, 97–99）

```ts
 69 │ export interface CompilationUnitData {
 70 ▶   knownQueryFields: Record<ClassFieldUniqueKey, {fieldName: string; isMulti: boolean}>;
 71 │ 
 72 │   // Potential queries problematic. We don't know what fields are queries during
 73 │   // analysis, so this is very eagerly tracking all potential problematic "class fields".
 74 ▶   potentialProblematicQueries: GlobalUnitData['problematicQueries'];
 75 │ 
 76 │   // Potential multi queries problematic. We don't know what fields are queries, or which
 77 │   // ones are "multi" queries during analysis, so this is very eagerly tracking all
 78 │   // potential problematic "class fields", but noting for later that those only would be
 79 │   // problematic if they end up being multi-result queries.
 80 ▶   potentialProblematicReferenceForMultiQueries: Record<ClassFieldUniqueKey, true>;
 81 │ 
 82 │   // NOTE: Not serializable — ONLY works when we know it's not running in batch mode!
 83 ▶   reusableAnalysisReferences: Reference<ClassFieldDescriptor>[] | null;
 84 │ }
 85 │ 
 86 │ export interface GlobalUnitData {
 87 │   knownQueryFields: Record<ClassFieldUniqueKey, {fieldName: string; isMulti: boolean}>;
 88 ▶   problematicQueries: Record<
 89 │     ClassFieldUniqueKey,
 90 │     {classReason: ClassIncompatibilityReason | null; fieldReason: FieldIncompatibilityReason | null}
 91 │   >;
 92 │ 
 93 │   // NOTE: Not serializable — ONLY works when we know it's not running in batch mode!
 94 │   reusableAnalysisReferences: Reference<ClassFieldDescriptor>[] | null;
 95 │ }
 96 │ 
 97 ▶ export class SignalQueriesMigration extends TsurgeComplexMigration<
 98 ▶   CompilationUnitData,
 99 ▶   GlobalUnitData
100 │ > {
```

1. **70 行目：見つけたクエリ**

   鍵ごとにフィールドの名前と、複数の結果を返すクエリ（`@ViewChildren`・`@ContentChildren`）かどうか。
2. **74・80 行目：「クエリかもしれない」フィールドの理由を、先に集めておく**

   72・73 行目と 76〜79 行目のコメントのとおり、`analyze` の時点では、別の単位の `.d.ts` のフィールドがクエリかどうか分かりません。そこで、クエリかどうかに関係なく、問題のありそうなフィールドの理由を鍵ごとに集め、あとで「クエリだったもの」だけを使います。80 行目は「`changes` などを使っている。複数の結果のクエリなら問題」という保留の印です（6 節）。
3. **83 行目：分割しないときだけ使える、参照の使い回し**

   参照は TS のノードを持つので JSON にできません。言語サービスのように単位が 1 つと分かっているときだけ、`analyze` で集めた参照を `migrate` に持ち越します。
4. **97〜100 行目：Complex で、単位のデータと全体のデータの形が違う**

   signal input は両方 `CompilationUnitData` でしたが（第 7 回の 1 節）、こちらは `globalMeta` で `GlobalUnitData`（88 行目の `problematicQueries` を持つ形）に変えます。

## 4. クエリを見つける：identify\_queries.ts と鍵

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/identify_queries.ts` L44–76 （▶ の行: 45–47, 54, 58, 60, 66–67）

```ts
44 │   if (
45 ▶     (!ts.isPropertyDeclaration(node) && !ts.isAccessor(node)) ||
46 ▶     !ts.isClassDeclaration(node.parent) ||
47 ▶     node.parent.name === undefined ||
48 │     !ts.isIdentifier(node.name)
49 │   ) {
50 │     return null;
51 │   }
52 │ 
53 │   const decorators = reflector.getDecoratorsOfDeclaration(node) ?? [];
54 ▶   const ngDecorators = getAngularDecorators(decorators, queryDecoratorNames, /* isCore */ false);
55 │   if (ngDecorators.length === 0) {
56 │     return null;
57 │   }
58 ▶   const decorator = ngDecorators[0];
59 │ 
60 ▶   const id = getUniqueIDForClassProperty(node, info);
61 │   if (id === null) {
62 │     return null;
63 │   }
64 │ 
65 │   let kind: ExtractedQuery['kind'];
66 ▶   if (decorator.name === 'ViewChild') {
67 ▶     kind = 'viewChild';
68 │   } else if (decorator.name === 'ViewChildren') {
69 │     kind = 'viewChildren';
70 │   } else if (decorator.name === 'ContentChild') {
71 │     kind = 'contentChild';
72 │   } else if (decorator.name === 'ContentChildren') {
73 │     kind = 'contentChildren';
74 │   } else {
75 │     throw new Error('Unexpected query decorator detected.');
76 │   }
```

45〜51 行目、名前のあるクラスの、プロパティか get / set だけが候補です。54 行目、`queryDecoratorNames`（compiler-cli の 4 つのデコレータ名）の `@angular/core` のデコレータが付いていればクエリで、60 行目で鍵を作り、65〜76 行目で 4 種類のどれかを決めます。この続きで、compiler-cli がコンパイルのときに使うのと同じ `extractDecoratorQueryMetadata` で、`read`・`descendants`・`first`（1 つの結果か）などのメタデータを取り出します。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/field_tracking.ts` L48–67 （▶ の行: 52, 58, 66）

```ts
48 │ export function getUniqueIDForClassProperty(
49 │   property: ts.ClassElement,
50 │   info: ProgramInfo,
51 │ ): ClassFieldUniqueKey | null {
52 ▶   if (!ts.isClassDeclaration(property.parent) || property.parent.name === undefined) {
53 │     return null;
54 │   }
55 │   if (property.name === undefined) {
56 │     return null;
57 │   }
58 ▶   const id = projectFile(property.getSourceFile(), info).id.replace(/\.d\.ts$/, '.ts');
59 │ 
60 │   // Note: If a class is nested, there could be an ID clash.
61 │   // This is highly unlikely though, and this is not a problem because
62 │   // in such cases, there is even less chance there are any references to
63 │   // a non-exported classes; in which case, cross-compilation unit references
64 │   // likely can't exist anyway.
65 │ 
66 ▶   return `${id}-${property.parent.name.text}-${property.name.getText()}` as ClassFieldUniqueKey;
67 │ }
```

鍵の作り方は signal input（第 7 回の 4 節）と同じ考え方で、58 行目で `.d.ts` を `.ts` に直し、66 行目で `id-クラス名-フィールド名` を **`-` でつなぎます**（signal input は `@@`）。この関数はクエリに限らず、どのクラスのフィールドにも鍵を作れます。3 節の「クエリかもしれないフィールド」を集めるのに使うためです。第 7 回のデモで 2 つの鍵を並べて見られます。

## 5. analyze：クエリと参照と、問題のありそうな使い方を集める

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L132–165 （▶ の行: 133, 144–146, 148, 154, 156, 159, 163）

```ts
132 │     const findQueryDefinitionsVisitor = (node: ts.Node) => {
133 ▶       const extractedQuery = extractSourceQueryDefinition(node, reflector, evaluator, info);
134 │       if (extractedQuery !== null) {
135 │         const queryNode = extractedQuery.node;
136 │         const descriptor = {
137 │           key: extractedQuery.id,
138 │           node: queryNode,
139 │         };
140 │         const containingFile = projectFile(queryNode.getSourceFile(), info);
141 │ 
142 │         // If we have a config filter function, use it here for later
143 │         // perf-boosted reference lookups. Useful in non-batch mode.
144 ▶         if (
145 ▶           this.config.shouldMigrateQuery === undefined ||
146 ▶           this.config.shouldMigrateQuery(descriptor, containingFile)
147 │         ) {
148 ▶           classesWithFilteredQueries.add(queryNode.parent);
149 │           filteredQueriesForCompilationUnit.set(extractedQuery.id, {
150 │             fieldName: extractedQuery.queryInfo.propertyName,
151 │           });
152 │         }
153 │ 
154 ▶         res.knownQueryFields[extractedQuery.id] = {
155 │           fieldName: extractedQuery.queryInfo.propertyName,
156 ▶           isMulti: extractedQuery.queryInfo.first === false,
157 │         };
158 │ 
159 ▶         if (ts.isAccessor(queryNode)) {
160 │           markFieldIncompatibleInMetadata(
161 │             res.potentialProblematicQueries,
162 │             extractedQuery.id,
163 ▶             FieldIncompatibilityReason.Accessor,
164 │           );
165 │         }
```

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L167–198 （▶ の行: 171–172, 174–175, 180, 186, 191, 195）

```ts
167 │         // Detect queries with union types that are uncommon to be
168 │         // automatically migrate-able. E.g. `refs: ElementRef|null`,
169 │         // or `ElementRef|SomeOtherType`.
170 │         if (
171 ▶           queryNode.type !== undefined &&
172 ▶           ts.isUnionTypeNode(queryNode.type) &&
173 │           // Either too large union, or doesn't match `T|undefined`.
174 ▶           (queryNode.type.types.length > 2 ||
175 ▶             !queryNode.type.types.some((t) => t.kind === ts.SyntaxKind.UndefinedKeyword))
176 │         ) {
177 │           markFieldIncompatibleInMetadata(
178 │             res.potentialProblematicQueries,
179 │             extractedQuery.id,
180 ▶             FieldIncompatibilityReason.SignalQueries__IncompatibleMultiUnionType,
181 │           );
182 │         }
183 │ 
184 │         // Migrating fields with `@HostBinding` is incompatible as
185 │         // the host binding decorator does not invoke the signal.
186 ▶         const hostBindingDecorators = getAngularDecorators(
187 │           extractedQuery.fieldDecorators,
188 │           ['HostBinding'],
189 │           /* isCore */ false,
190 │         );
191 ▶         if (hostBindingDecorators.length > 0) {
192 │           markFieldIncompatibleInMetadata(
193 │             res.potentialProblematicQueries,
194 │             extractedQuery.id,
195 ▶             FieldIncompatibilityReason.SignalIncompatibleWithHostBinding,
196 │           );
197 │         }
198 │       }
```

1. **144〜152 行目：config で選んだクエリのクラスと名前を覚える**

   あとで参照を探すときの絞り込み（名前）と、型の参照を追うクラスに使います。
2. **154〜157 行目：全部のクエリを単位のデータに**

   156 行目、`first === false`（複数の結果）なら `isMulti`。
3. **159〜198 行目：宣言だけで分かる 3 つの理由**

   get / set なら `Accessor`（163 行目）。型が共用体（`A | B`）で、3 つ以上か、2 つでも片方が `undefined` でなければ `SignalQueries__IncompatibleMultiUnionType`（171〜181 行目。`ElementRef | null` もここに入る）。`@HostBinding` も付いていれば `SignalIncompatibleWithHostBinding`（186〜196 行目）。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L205–244 （▶ の行: 208–210, 216–217, 219, 227, 232, 243–244）

```ts
205 │     const allFieldsOrKnownQueries: KnownFields<ClassFieldDescriptor> = {
206 │       // Note: We don't support cross-target migration of `Partial<T>` usages.
207 │       // This is an acceptable limitation for performance reasons.
208 ▶       shouldTrackClassReference: (node) => classesWithFilteredQueries.has(node),
209 ▶       attemptRetrieveDescriptorFromSymbol: (s) => {
210 ▶         const descriptor = getClassFieldDescriptorForSymbol(s, info);
211 │ 
212 │         // If we are executing in upgraded analysis phase mode, we know all
213 │         // of the queries since there aren't any other compilation units.
214 │         // Ignore references to non-query class fields.
215 │         if (
216 ▶           this.config.assumeNonBatch &&
217 ▶           (descriptor === null || !filteredQueriesForCompilationUnit.has(descriptor.key))
218 │         ) {
219 ▶           return null;
220 │         }
221 │ 
222 │         // In batch mode, we eagerly, rather expensively, track all references.
223 │         // We don't know yet if something refers to a different query or not, so we
224 │         // eagerly detect such and later filter those problematic references that
225 │         // turned out to refer to queries (once we have the global metadata).
226 │ 
227 ▶         return descriptor;
228 │       },
229 │     };
230 │ 
231 │     groupedAstVisitor.register(
232 ▶       createFindAllSourceFileReferencesVisitor(
233 │         info,
234 │         checker,
235 │         reflector,
236 │         resourceLoader,
237 │         evaluator,
238 │         templateTypeChecker,
239 │         allFieldsOrKnownQueries,
240 │         // In non-batch mode, we know what inputs exist and can optimize the reference
241 │         // resolution significantly (for e.g. VSCode integration)— as we know what
242 │         // field names may be used to reference potential queries.
243 ▶         this.config.assumeNonBatch
244 ▶           ? new Set(Array.from(filteredQueriesForCompilationUnit.values()).map((f) => f.fieldName))
```

参照を集めるのは signal input と同じ `createFindAllSourceFileReferencesVisitor`（232 行目）ですが、「このフィールドを知っているか」の答え方が違います。216〜220 行目、分割しないと分かっているとき（`assumeNonBatch`。言語サービス）は、この単位のクエリだけを答えます。そうでなければ 227 行目で**どのクラスのフィールドにも鍵を返し**、全部の参照を集めます。別の単位のクエリへの参照かもしれないからで、221〜225 行目のコメントのとおり重い処理です。243・244 行目、名前の絞り込みも `assumeNonBatch` のときだけで、それ以外は次の行の `null`（全部の識別子を調べる）です。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L282–311 （▶ の行: 285, 289, 292, 301, 305, 310）

```ts
282 │     // Determine incompatible queries based on problematic references
283 │     // we saw in TS code, templates or host bindings.
284 │     for (const ref of referenceResult.references) {
285 ▶       if (isTsReference(ref) && ref.from.isWrite) {
286 │         markFieldIncompatibleInMetadata(
287 │           res.potentialProblematicQueries,
288 │           ref.target.key,
289 ▶           FieldIncompatibilityReason.WriteAssignment,
290 │         );
291 │       }
292 ▶       if ((isTemplateReference(ref) || isHostBindingReference(ref)) && ref.from.isWrite) {
293 │         markFieldIncompatibleInMetadata(
294 │           res.potentialProblematicQueries,
295 │           ref.target.key,
296 │           FieldIncompatibilityReason.WriteAssignment,
297 │         );
298 │       }
299 │       // TODO: Remove this when we support signal narrowing in templates.
300 │       // https://github.com/angular/angular/pull/55456.
301 ▶       if (isTemplateReference(ref) && ref.from.isLikelyPartOfNarrowing) {
302 │         markFieldIncompatibleInMetadata(
303 │           res.potentialProblematicQueries,
304 │           ref.target.key,
305 ▶           FieldIncompatibilityReason.PotentiallyNarrowedInTemplateButNoSupportYet,
306 │         );
307 │       }
308 │ 
309 │       // Check for other incompatible query list accesses.
310 ▶       checkForIncompatibleQueryListAccesses(ref, res);
311 │     }
```

284〜307 行目は、signal input の phase\_analysis.ts の最後（第 9 回の 3 節）と同じ判定で、書き込みとテンプレートの絞り込みに理由を付けます。違うのは 310 行目で、`QueryList` にしかない使い方を調べます（6 節）。

## 6. QueryList にしかない使い方：移行できないもの

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/incompatible_query_list_fns.ts` L19–51 （▶ の行: 19–25, 33–34, 36, 43–44, 46）

```ts
19 ▶ const problematicQueryListMethods = [
20 ▶   'dirty',
21 ▶   'changes',
22 ▶   'setDirty',
23 ▶   'reset',
24 ▶   'notifyOnChanges',
25 ▶   'destroy',
26 │ ];
27 │ 
28 │ export function checkForIncompatibleQueryListAccesses(
29 │   ref: Reference<ClassFieldDescriptor>,
30 │   result: CompilationUnitData,
31 │ ) {
32 │   if (isTsReference(ref)) {
33 ▶     for (const problematicFn of problematicQueryListMethods) {
34 ▶       const access = checkTsReferenceAccessesField(ref, problematicFn);
35 │       if (access !== null) {
36 ▶         result.potentialProblematicReferenceForMultiQueries[ref.target.key] = true;
37 │         return;
38 │       }
39 │     }
40 │   }
41 │ 
42 │   if (isHostBindingReference(ref) || isTemplateReference(ref)) {
43 ▶     for (const problematicFn of problematicQueryListMethods) {
44 ▶       const access = checkNonTsReferenceAccessesField(ref, problematicFn);
45 │       if (access !== null) {
46 ▶         result.potentialProblematicReferenceForMultiQueries[ref.target.key] = true;
47 │         return;
48 │       }
49 │     }
50 │   }
51 │ }
```

`viewChildren()` は `QueryList` ではなく、読み取り専用の配列を返す signal です。だから 19〜26 行目の 6 つ（`dirty`・`changes`・`setDirty`・`reset`・`notifyOnChanges`・`destroy`）は、配列には無く、機械的には書き換えられません。34 行目と 44 行目で「参照の直後にこの名前のプロパティアクセスがあるか」を調べ、あれば 36 行目と 46 行目で保留の印を付けます。ここでは理由を付けず、印だけです。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/property_accesses.ts` L29–44 （▶ の行: 29, 33–34, 40, 44）

```ts
29 ▶   const accessNode = traverseAccess(ref.from.node);
30 │ 
31 │   // Check if the reference is part of a property access.
32 │   if (
33 ▶     !ts.isPropertyAccessExpression(accessNode.parent) ||
34 ▶     !ts.isIdentifier(accessNode.parent.name)
35 │   ) {
36 │     return null;
37 │   }
38 │ 
39 │   // Check if the reference is refers to the given field name.
40 ▶   if (accessNode.parent.name.text !== fieldName) {
41 │     return null;
42 │   }
43 │ 
44 ▶   return accessNode.parent as ReturnType<typeof checkTsReferenceAccessesField>;
```

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/property_accesses.ts` L53–68 （▶ の行: 57–58, 60, 63, 67）

```ts
53 │ export function checkNonTsReferenceAccessesField(
54 │   ref: HostBindingReference<ClassFieldDescriptor> | TemplateReference<ClassFieldDescriptor>,
55 │   fieldName: string,
56 │ ): PropertyRead | null {
57 ▶   const readFromPath = ref.from.readAstPath.at(-1) as PropertyRead | AST | undefined;
58 ▶   const parentRead = ref.from.readAstPath.at(-2) as PropertyRead | AST | undefined;
59 │ 
60 ▶   if (ref.from.read !== readFromPath) {
61 │     return null;
62 │   }
63 ▶   if (!(parentRead instanceof PropertyRead) || parentRead.name !== fieldName) {
64 │     return null;
65 │   }
66 │ 
67 ▶   return parentRead;
68 │ }
```

TS の側は、29 行目で `this.labels` の全体（`traverseAccess`）に上がり、その親が `.changes` のようなプロパティアクセスかを見ます。テンプレートとホストの側は、第 8 回の 1 節の `readAstPath` を使います。57 行目の最後の要素が読み出しそのもの、58 行目の 1 つ前が親で、63 行目でその親が同じ名前の `PropertyRead` かを見ます。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L363–398 （▶ の行: 364–366, 369, 381, 383, 387–388, 392）

```ts
363 │     for (const unit of [unitA, unitB]) {
364 ▶       for (const id of Object.keys(unit.potentialProblematicReferenceForMultiQueries)) {
365 ▶         if (combined.knownQueryFields[id as ClassFieldUniqueKey]?.isMulti) {
366 ▶           markFieldIncompatibleInMetadata(
367 │             combined.potentialProblematicQueries,
368 │             id as ClassFieldUniqueKey,
369 ▶             FieldIncompatibilityReason.SignalQueries__QueryListProblematicFieldAccessed,
370 │           );
371 │         }
372 │       }
373 │     }
374 │ 
375 │     return confirmAsSerializable(combined);
376 │   }
377 │ 
378 │   override async globalMeta(
379 │     combinedData: CompilationUnitData,
380 │   ): Promise<Serializable<GlobalUnitData>> {
381 ▶     const globalUnitData: GlobalUnitData = {
382 │       knownQueryFields: combinedData.knownQueryFields,
383 ▶       problematicQueries: combinedData.potentialProblematicQueries,
384 │       reusableAnalysisReferences: combinedData.reusableAnalysisReferences,
385 │     };
386 │ 
387 ▶     for (const id of Object.keys(combinedData.potentialProblematicReferenceForMultiQueries)) {
388 ▶       if (combinedData.knownQueryFields[id as ClassFieldUniqueKey]?.isMulti) {
389 │         markFieldIncompatibleInMetadata(
390 │           globalUnitData.problematicQueries,
391 │           id as ClassFieldUniqueKey,
392 ▶           FieldIncompatibilityReason.SignalQueries__QueryListProblematicFieldAccessed,
393 │         );
394 │       }
395 │     }
396 │ 
397 │     return confirmAsSerializable(globalUnitData);
398 │   }
```

保留の印は、単位を合わせたあとで解決します。365 行目と 388 行目、その鍵が**複数の結果のクエリ**だと分かったときだけ、`SignalQueries__QueryListProblematicFieldAccessed` を付けます。1 つの結果のクエリ（`@ViewChild`）の `.changes` は、その要素の型のプロパティなので問題ありません（it の名前「should migrate a single-result query that accesses a \`.changes\` field, unrelated to QueryList」）。`combine`（363〜373 行目）と `globalMeta`（387〜395 行目）の両方で同じことをするのは、単位が 1 つのときは `combine` が呼ばれないからです（第 7 回の 6 節）。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/incompatibility.ts` L18–48 （▶ の行: 18, 25, 29, 32, 39, 42–43, 45）

```ts
18 ▶ export function markFieldIncompatibleInMetadata(
19 │   data: GlobalUnitData['problematicQueries'],
20 │   id: ClassFieldUniqueKey,
21 │   reason: FieldIncompatibilityReason,
22 │ ) {
23 │   const existing = data[id as ClassFieldUniqueKey];
24 │   if (existing === undefined) {
25 ▶     data[id as ClassFieldUniqueKey] = {
26 │       fieldReason: reason,
27 │       classReason: null,
28 │     };
29 ▶   } else if (existing.fieldReason === null) {
30 │     existing.fieldReason = reason;
31 │   } else {
32 ▶     existing.fieldReason = pickFieldIncompatibility(
33 │       {reason, context: null},
34 │       {reason: existing.fieldReason, context: null},
35 │     ).reason;
36 │   }
37 │ }
38 │ 
39 ▶ export function filterBestEffortIncompatibilities(knownQueries: KnownQueries) {
40 │   for (const query of Object.values(knownQueries.globalMetadata.problematicQueries)) {
41 │     if (
42 ▶       query.fieldReason !== null &&
43 ▶       !nonIgnorableFieldIncompatibilities.includes(query.fieldReason)
44 │     ) {
45 ▶       query.fieldReason = null;
46 │     }
47 │   }
48 │ }
```

理由の付け方は、鍵ごとの JSON にそのまま書く形です（signal input は `DirectiveInfo` に書きました）。32〜35 行目で重いほうを残すのは同じ `pickFieldIncompatibility` です。39〜48 行目の best effort は、無視できない 5 つ以外の入力の理由を消します。クラスの理由（`classReason`）はここでは消しません。

## 7. migrate：宣言・参照・QueryList の書き換え

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L425–464 （▶ の行: 427–430, 435, 440–441, 452–453, 456, 462–463）

```ts
425 │     const queryWholeProgramVisitor = (node: ts.Node) => {
426 │       // Detect all SOURCE queries and migrate them, if possible.
427 ▶       const extractedQuery = extractSourceQueryDefinition(node, reflector, evaluator, info);
428 ▶       if (extractedQuery !== null) {
429 ▶         knownQueries.registerQueryField(extractedQuery.node, extractedQuery.id);
430 ▶         sourceQueries.push(extractedQuery);
431 │         return;
432 │       }
433 │ 
434 │       // Detect OTHER queries, inside `.d.ts`. Needed for reference resolution below.
435 ▶       if (
436 │         ts.isPropertyDeclaration(node) ||
437 │         (ts.isAccessor(node) && ts.isClassDeclaration(node.parent))
438 │       ) {
439 │         const classFieldID = getUniqueIDForClassProperty(node, info);
440 ▶         if (classFieldID !== null && globalMetadata.knownQueryFields[classFieldID] !== undefined) {
441 ▶           knownQueries.registerQueryField(
442 │             node as typeof node & {parent: ts.ClassDeclaration},
443 │             classFieldID,
444 │           );
445 │           return;
446 │         }
447 │       }
448 │ 
449 │       // Detect potential usages of `QueryList` outside of queries or imports.
450 │       // Those prevent us from removing the import later.
451 │       if (
452 ▶         ts.isIdentifier(node) &&
453 ▶         node.text === 'QueryList' &&
454 │         ts.findAncestor(node, ts.isImportDeclaration) === undefined
455 │       ) {
456 ▶         filesWithQueryListOutsideOfDeclarations.add(node.getSourceFile());
457 │       }
458 │ 
459 │       ts.forEachChild(node, queryWholeProgramVisitor);
460 │     };
461 │ 
462 ▶     for (const sf of info.fullProgramSourceFiles) {
463 ▶       ts.forEachChild(sf, queryWholeProgramVisitor);
464 │     }
```

1. **427〜432 行目：ソースのクエリを見つけたら、登録して、書き換えの対象に入れる**

   `registerQueryField` は `KnownQueries` に登録し、430 行目で `sourceQueries`（宣言を書き換える一覧）に入れます。
2. **435〜447 行目：`.d.ts` のクエリは、全体のデータで分かる**

   440 行目、フィールドの鍵が `globalMetadata.knownQueryFields` にあれば、別の単位で見つけたクエリです。参照を解決するために登録だけします。
3. **451〜457 行目：宣言以外で `QueryList` を使っているファイル**

   そのファイルでは `QueryList` の import を消せません（9 節の最後）。
4. **462〜464 行目：歩くのは `fullProgramSourceFiles`**

   プログラムの全部のファイル（この単位が持っていないファイルも）です。これが 8 節の #71147 につながります。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L495–510 （▶ の行: 496–498, 500, 508–509）

```ts
495 │     // Check inheritance.
496 ▶     // NOTE: Inheritance is only checked in the migrate stage as we cannot reliably
497 ▶     // check during analyze— where we don't know what fields from foreign `.d.ts`
498 ▶     // files refer to queries or not.
499 │     const inheritanceGraph = new InheritanceGraph(checker).expensivePopulate(info.sourceFiles);
500 ▶     checkInheritanceOfKnownFields(inheritanceGraph, metaReader, knownQueries, {
501 │       getFieldsForClass: (n) => knownQueries.getQueryFieldsOfClass(n) ?? [],
502 │       isClassWithKnownFields: (clazz) => knownQueries.getQueryFieldsOfClass(clazz) !== undefined,
503 │     });
504 │ 
505 │     this.config.reportProgressFn?.(80, 'Checking inheritance..');
506 │     groupedAstVisitor.execute();
507 │ 
508 ▶     if (this.config.bestEffortMode) {
509 ▶       filterBestEffortIncompatibilities(knownQueries);
510 │     }
```

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/known_queries.ts` L113–139 （▶ の行: 117, 125–128, 133–134, 136）

```ts
113 │   captureKnownFieldInheritanceRelationship(
114 │     derived: ClassFieldDescriptor,
115 │     parent: ClassFieldDescriptor,
116 │   ): void {
117 ▶     // Note: The edge problematic pattern recognition is not as good as the one
118 │     // we have in the signal input migration. That is because we couldn't trivially
119 │     // build up an inheritance graph during analyze phase where we DON'T know what
120 │     // fields refer to queries. Usually we'd use the graph to smartly propagate
121 │     // incompatibilities using topological sort. This doesn't work here and is
122 │     // unnecessarily complex, so we try our best at detecting direct edge
123 │     // incompatibilities (which are quite order dependent).
124 │ 
125 ▶     if (this.isFieldIncompatible(parent) && !this.isFieldIncompatible(derived)) {
126 ▶       this.markFieldIncompatible(derived, {
127 ▶         context: null,
128 ▶         reason: FieldIncompatibilityReason.ParentIsIncompatible,
129 │       });
130 │       return;
131 │     }
132 │ 
133 ▶     if (this.isFieldIncompatible(derived) && !this.isFieldIncompatible(parent)) {
134 ▶       this.markFieldIncompatible(parent, {
135 │         context: null,
136 ▶         reason: FieldIncompatibilityReason.DerivedIsIncompatible,
137 │       });
138 │     }
139 │   }
```

継承は `migrate` で初めて調べます（496〜498 行目のコメント。`analyze` ではどのフィールドがクエリか分からないから）。500 行目は signal input と同じ `checkInheritanceOfKnownFields`（第 9 回の 5 節）で、関係が見つかったときの扱いが `KnownQueries` の側で違います。125〜131 行目で親の理由を子に（`ParentIsIncompatible`）、133〜138 行目で**子の理由を親に**（`DerivedIsIncompatible`）付けます。117〜123 行目のコメントのとおり、signal input のようにトポロジカルソートで伝えるのではなく、直接の親子だけを見る「順番に左右される」やり方です。子から親への向きは signal input の側には無いもので、第 9 回の 5 節の囲みの壊れ方は、クエリでは起きない形になっています。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L514–549 （▶ の行: 515, 519, 521, 523, 525, 527, 534, 539）

```ts
514 │     // Migrate declarations.
515 ▶     for (const extractedQuery of sourceQueries) {
516 │       const node = extractedQuery.node;
517 │       const sf = node.getSourceFile();
518 │       const descriptor = {key: extractedQuery.id, node: extractedQuery.node};
519 ▶       const incompatibility = knownQueries.getIncompatibilityForField(descriptor);
520 │ 
521 ▶       updateFileState(filesWithSourceQueries, sf, extractedQuery.kind);
522 │ 
523 ▶       if (incompatibility !== null) {
524 │         // Add a TODO for the incompatible query, if desired.
525 ▶         if (this.config.insertTodosForSkippedFields) {
526 │           replacements.push(
527 ▶             ...insertTodoForIncompatibility(node, info, incompatibility, {
528 │               single: 'query',
529 │               plural: 'queries',
530 │             }),
531 │           );
532 │         }
533 │ 
534 ▶         updateFileState(filesWithIncompleteMigration, sf, extractedQuery.kind);
535 │         continue;
536 │       }
537 │ 
538 │       replacements.push(
539 ▶         ...computeReplacementsToMigrateQuery(
540 │           node as ts.PropertyDeclaration,
541 │           extractedQuery,
542 │           importManager,
543 │           info,
544 │           printer,
545 │           info.userOptions,
546 │           checker,
547 │         ),
548 │       );
549 │     }
```

515 行目、427〜432 行目で集めた `sourceQueries` を 1 つずつ書き換えます。理由があれば 525〜532 行目で TODO（第 9 回の 6 節と同じ関数に「query」「queries」を渡す）を足して飛ばし、無ければ 539 行目の `computeReplacementsToMigrateQuery` で宣言を置き換えます。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/convert_query_property.ts` L55–90 （▶ の行: 56, 59, 65–67, 69, 73, 76, 79）

```ts
55 │   // The default value for descendants is `true`, except for `ContentChildren`.
56 ▶   const defaultDescendants = metadata.kind !== 'contentChildren';
57 │   const optionProperties: ts.PropertyAssignment[] = [];
58 │   const args: ts.Expression[] = [
59 ▶     metadata.args[0], // Locator.
60 │   ];
61 │   let type = node.type;
62 │ 
63 │   // For multi queries, attempt to unwrap `QueryList` types, or infer the
64 │   // type from the initializer, if possible.
65 ▶   if (!metadata.queryInfo.first) {
66 ▶     if (type === undefined && node.initializer !== undefined) {
67 ▶       type = extractQueryListType(node.initializer);
68 │     } else if (type !== undefined) {
69 ▶       type = extractQueryListType(type);
70 │     }
71 │   }
72 │ 
73 ▶   if (metadata.queryInfo.read !== null) {
74 │     assert(metadata.queryInfo.read instanceof WrappedNodeExpr);
75 │     optionProperties.push(
76 ▶       ts.factory.createPropertyAssignment('read', metadata.queryInfo.read.node),
77 │     );
78 │   }
79 ▶   if (metadata.queryInfo.descendants !== defaultDescendants) {
80 │     optionProperties.push(
81 │       ts.factory.createPropertyAssignment(
82 │         'descendants',
83 │         metadata.queryInfo.descendants ? ts.factory.createTrue() : ts.factory.createFalse(),
84 │       ),
85 │     );
86 │   }
87 │ 
88 │   if (optionProperties.length > 0) {
89 │     args.push(ts.factory.createObjectLiteralExpression(optionProperties));
90 │   }
```

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/query_list_type.ts` L14–34 （▶ の行: 17, 21, 26, 30）

```ts
14 │ export function extractQueryListType(node: ts.TypeNode | ts.Expression): ts.TypeNode | undefined {
15 │   // Initializer variant of `new QueryList<T>()`.
16 │   if (
17 ▶     ts.isNewExpression(node) &&
18 │     ts.isIdentifier(node.expression) &&
19 │     node.expression.text === 'QueryList'
20 │   ) {
21 ▶     return node.typeArguments?.[0];
22 │   }
23 │ 
24 │   // Type variant of `: QueryList<T>`.
25 │   if (
26 ▶     ts.isTypeReferenceNode(node) &&
27 │     ts.isIdentifier(node.typeName) &&
28 │     node.typeName.text === 'QueryList'
29 │   ) {
30 ▶     return node.typeArguments?.[0];
31 │   }
32 │ 
33 │   return undefined;
34 │ }
```

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/convert_query_property.ts` L115–152 （▶ の行: 115, 118, 123–124, 134, 140, 142, 150）

```ts
115 ▶   if (isRequired && metadata.queryInfo.first) {
116 │     // If the query is required already via some indicators, and this is a "single"
117 │     // query, use the available `.required` method.
118 ▶     newQueryFn = ts.factory.createPropertyAccessExpression(newQueryFn, 'required');
119 │   }
120 │ 
121 │   // If this query is still nullable (i.e. not required), attempt to remove
122 │   // explicit `undefined` types if possible.
123 ▶   if (!isRequired && type !== undefined && ts.isUnionTypeNode(type)) {
124 ▶     type = removeFromUnionIfPossible(type, (v) => v.kind !== ts.SyntaxKind.UndefinedKeyword);
125 │   }
126 │ 
127 │   let locatorType = Array.isArray(metadata.queryInfo.predicate)
128 │     ? null
129 │     : metadata.queryInfo.predicate.expression;
130 │   let resolvedReadType = metadata.queryInfo.read ?? locatorType;
131 │ 
132 │   // If the original property type and the read type are matching, we can rely
133 │   // on the TS inference, instead of repeating types, like in `viewChild<Button>(Button)`.
134 ▶   if (
135 │     type !== undefined &&
136 │     resolvedReadType instanceof WrappedNodeExpr &&
137 │     ts.isIdentifier(resolvedReadType.node) &&
138 │     ts.isTypeReferenceNode(type) &&
139 │     ts.isIdentifier(type.typeName) &&
140 ▶     type.typeName.text === resolvedReadType.node.text
141 │   ) {
142 ▶     locatorType = null;
143 │   }
144 │ 
145 │   const call = ts.factory.createCallExpression(
146 │     newQueryFn,
147 │     // If there is no resolved `ReadT` (e.g. string predicate), we use the
148 │     // original type explicitly as generic. Otherwise, query API is smart
149 │     // enough to always infer.
150 ▶     resolvedReadType === null && type !== undefined ? [type] : undefined,
151 │     args,
152 │   );
```

1. **convert\_query\_property.ts の 59 行目と 73〜86 行目：引数は「探すもの」と、必要な設定だけ**

   `read` はそのまま残し、`descendants` は既定と違うときだけ書きます（56 行目、既定は `contentChildren` だけ偽）。関数の上のコメント（引用の外）のとおり、`static` と `emitDistinctChangesOnly` は新しい API に無いので落とします。
2. **65〜71 行目と query\_list\_type.ts：複数の結果なら `QueryList<T>` の T を取り出す**

   `labels = new QueryList<ElementRef>()`（17〜21 行目）でも `labels: QueryList<ElementRef>`（26〜30 行目）でも、型の引数の `ElementRef` を取り出します。
3. **115〜119 行目：`!` 付きの 1 つの結果なら `.required`**

   `@ViewChild(MyButton) button!: MyButton` は `viewChild.required(MyButton)` です。123〜125 行目、必須でなければ型から `| undefined` を外します（`viewChild()` の型が自分で `undefined` を含むので）。
4. **134〜143 行目と 150 行目：型の引数を書くか**

   探すものがクラス（`viewChild(MyButton)`）で型と同じなら、型の引数を書かずに推論に任せます。`'label'` のような文字列で探すときは、150 行目で `viewChildren<ElementRef>('label')` のように型を書きます。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L551–576 （▶ の行: 555–557, 561–564, 573–575）

```ts
551 │     // Migrate references.
552 │     const referenceMigrationHost: ReferenceMigrationHost<ClassFieldDescriptor> = {
553 │       printer,
554 │       replacements,
555 ▶       shouldMigrateReferencesToField: (field) => !knownQueries.isFieldIncompatible(field),
556 ▶       shouldMigrateReferencesToClass: (clazz) =>
557 ▶         !!knownQueries
558 │           .getQueryFieldsOfClass(clazz)
559 │           ?.some((q) => !knownQueries.isFieldIncompatible(q)),
560 │     };
561 ▶     migrateTypeScriptReferences(referenceMigrationHost, referenceResult.references, checker, info);
562 ▶     migrateTemplateReferences(referenceMigrationHost, referenceResult.references);
563 ▶     migrateHostBindings(referenceMigrationHost, referenceResult.references, info);
564 ▶     migrateTypeScriptTypeReferences(
565 │       referenceMigrationHost,
566 │       referenceResult.references,
567 │       importManager,
568 │       info,
569 │     );
570 │ 
571 │     // Fix problematic calls, like `QueryList#toArray`, or `QueryList#get`.
572 │     for (const ref of referenceResult.references) {
573 ▶       removeQueryListToArrayCall(ref, info, globalMetadata, knownQueries, replacements);
574 ▶       replaceQueryListGetCall(ref, info, globalMetadata, knownQueries, replacements);
575 ▶       replaceQueryListFirstAndLastReferences(ref, info, globalMetadata, knownQueries, replacements);
576 │     }
```

555〜560 行目、`ReferenceMigrationHost`（第 7 回の 5 節）をクエリ用の判定で作り、561〜569 行目で signal input と同じ 4 つの書き換えを呼びます。これで `this.labels` は `this.labels()` になります。572〜576 行目、そのあとで参照ごとに `QueryList` のメソッドの書き換えを 3 つ試します。

### QueryList のメソッドを配列の操作に

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/fn_to_array_removal.ts` L39–58 （▶ の行: 40–41, 45, 52–54）

```ts
39 │   // TS references.
40 ▶   if (isTsReference(ref)) {
41 ▶     const toArrayCallExpr = checkTsReferenceCallsField(ref, 'toArray');
42 │     if (toArrayCallExpr === null) {
43 │       return;
44 │     }
45 ▶     const toArrayExpr = toArrayCallExpr.expression;
46 │ 
47 │     replacements.push(
48 │       new Replacement(
49 │         projectFile(toArrayExpr.getSourceFile(), info),
50 │         new TextUpdate({
51 │           // Delete from expression end to call end. E.g. `.toArray(<..>)`.
52 ▶           position: toArrayExpr.expression.getEnd(),
53 ▶           end: toArrayCallExpr.getEnd(),
54 ▶           toInsert: '',
55 │         }),
56 │       ),
57 │     );
58 │     return;
```

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/fn_to_array_removal.ts` L61–80 （▶ の行: 62, 67–68, 75–76）

```ts
61 │   // Template and host binding references.
62 ▶   const callExpr = checkNonTsReferenceCallsField(ref, 'toArray');
63 │   if (callExpr === null) {
64 │     return;
65 │   }
66 │ 
67 ▶   const file = isHostBindingReference(ref) ? ref.from.file : ref.from.templateFile;
68 ▶   const offset = isHostBindingReference(ref) ? ref.from.hostPropertyNode.getStart() + 1 : 0;
69 │ 
70 │   replacements.push(
71 │     new Replacement(
72 │       file,
73 │       new TextUpdate({
74 │         // Delete from expression end to call end. E.g. `.toArray(<..>)`.
75 ▶         position: offset + callExpr.receiver.receiver.sourceSpan.end,
76 ▶         end: offset + callExpr.sourceSpan.end,
77 │         toInsert: '',
78 │       }),
79 │     ),
80 │   );
```

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/fn_get_replacement.ts` L39–56 （▶ の行: 40, 44, 50–52）

```ts
39 │   if (isTsReference(ref)) {
40 ▶     const getCallExpr = checkTsReferenceCallsField(ref, 'get');
41 │     if (getCallExpr === null) {
42 │       return;
43 │     }
44 ▶     const getExpr = getCallExpr.expression;
45 │ 
46 │     replacements.push(
47 │       new Replacement(
48 │         projectFile(getExpr.getSourceFile(), info),
49 │         new TextUpdate({
50 ▶           position: getExpr.name.getStart(),
51 ▶           end: getExpr.name.getEnd(),
52 ▶           toInsert: 'at',
53 │         }),
54 │       ),
55 │     );
56 │     return;
```

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/fn_first_last_replacement.ts` L21–60 （▶ の行: 21–23, 37, 40, 46, 55–57）

```ts
21 ▶ const mapping = new Map([
22 ▶   ['first', 'at(0)!'],
23 ▶   ['last', 'at(-1)!'],
24 │ ]);
25 │ 
26 │ export function replaceQueryListFirstAndLastReferences(
27 │   ref: Reference<ClassFieldDescriptor>,
28 │   info: ProgramInfo,
29 │   globalMetadata: GlobalUnitData,
30 │   knownQueries: KnownQueries,
31 │   replacements: Replacement[],
32 │ ): void {
33 │   if (!isHostBindingReference(ref) && !isTemplateReference(ref) && !isTsReference(ref)) {
34 │     return;
35 │   }
36 │ 
37 ▶   if (knownQueries.isFieldIncompatible(ref.target)) {
38 │     return;
39 │   }
40 ▶   if (!globalMetadata.knownQueryFields[ref.target.key]?.isMulti) {
41 │     return;
42 │   }
43 │ 
44 │   if (isTsReference(ref)) {
45 │     const expr =
46 ▶       checkTsReferenceAccessesField(ref, 'first') ?? checkTsReferenceAccessesField(ref, 'last');
47 │     if (expr === null) {
48 │       return;
49 │     }
50 │ 
51 │     replacements.push(
52 │       new Replacement(
53 │         projectFile(expr.getSourceFile(), info),
54 │         new TextUpdate({
55 ▶           position: expr.name.getStart(),
56 ▶           end: expr.name.getEnd(),
57 ▶           toInsert: mapping.get(expr.name.text)!,
58 │         }),
59 │       ),
60 │     );
```

1. **`toArray()` は消す**

   signal の値はもう配列なので、fn\_to\_array\_removal.ts の 52・53 行目で、`this.labels` の終わりから `.toArray()` の呼び出しの終わりまでを空文字に置き換えます。参照の書き換えの `()` は `this.labels` の終わりに**足す**だけの置き換えなので、2 つの置き換えの範囲は重なりません。結果は `this.labels()` です。テンプレートとホストの側（61〜80 行目）も同じで、68 行目の `offset` は第 8 回の 5 節の pass 8 と同じ「引用符の 1 文字」です。
2. **`get(i)` は `at(i)` に**

   fn\_get\_replacement.ts の 50〜52 行目、メソッドの名前の範囲だけを `at` に置き換えます。
3. **`first` と `last` は `at(0)!` と `at(-1)!` に**

   fn\_first\_last\_replacement.ts の 21〜24 行目の対応表です。`at()` は範囲の外で `undefined` を返す型なので、`QueryList#first` と同じ型にするために `!`（null でないと言い切る演算子）を付けます。
4. **どれも「複数の結果のクエリ」で「理由が無い」ときだけ**

   3 つの関数はどれも最初に、`isFieldIncompatible` なら何もせず、`isMulti` でなければ何もしません（fn\_first\_last\_replacement.ts の引用では 37〜42 行目）。1 つの結果のクエリの `first` は、その要素のプロパティだからです。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.ts` L578–596 （▶ の行: 586–589, 593–594）

```ts
578 │     // Remove imports if possible.
579 │     for (const [file, types] of filesWithSourceQueries) {
580 │       let seenIncompatibleMultiQuery = false;
581 │ 
582 │       for (const type of types) {
583 │         const incompatibleQueryTypesForFile = filesWithIncompleteMigration.get(file);
584 │ 
585 │         // Query type is fully migrated. No incompatible queries in file.
586 ▶         if (!incompatibleQueryTypesForFile?.has(type)) {
587 ▶           importManager.removeImport(file, queryFunctionNameToDecorator(type), '@angular/core');
588 ▶         } else if (type === 'viewChildren' || type === 'contentChildren') {
589 ▶           seenIncompatibleMultiQuery = true;
590 │         }
591 │       }
592 │ 
593 ▶       if (!seenIncompatibleMultiQuery && !filesWithQueryListOutsideOfDeclarations.has(file)) {
594 ▶         importManager.removeImport(file, 'QueryList', '@angular/core');
595 │       }
596 │     }
```

最後に import です。586・587 行目、そのファイルで、ある種類（たとえば `viewChildren`）のクエリが全部移行できたら、その種類のデコレータ（`ViewChildren`）の import を消します。588〜590 行目、複数の結果のクエリで移行できないものが残ったファイルと、宣言以外で `QueryList` を使っているファイル（7 節の最初）では、593〜595 行目の `QueryList` の import を残します。

## 8. #71147：signal クエリの移行が 2 回以上走る

#71147（2026-10-02 に開いた。ラベル `area: migrations`）は、22.2.1 で `signal-queries-migration` を走らせると、宣言と import が重複するという報告です。報告者は、signal input で同じことが起きた #61337（閉じている）と同じ問題だと書いています。第 7 回の「テストと直し方」で見たとおり、#61337 のあと Tsurge は 1 つのファイルを 1 つの単位の `sourceFiles` にだけ入れるようになりました（4a3d39cd5a9）。signal input は、そのうえで pass 1 が「この単位の `sourceFiles` にある入力」だけを書き換えの対象にします（第 7 回の 3 節）。

signal クエリの `migrate` は、7 節の 462〜464 行目で `fullProgramSourceFiles` を歩き、427〜431 行目で見つけたソースのクエリを**全部**`sourceQueries` に入れます。`sourceFiles` で絞る条件がありません。だから `tsconfig.app.json` と `tsconfig.spec.json` の両方のプログラムに入っているファイルのクエリは、2 つの単位の `migrate` で 1 回ずつ、同じ置き換えが作られます。

これを直す PR #71151（2026-10-03 に開いた。2026-11-03 の時点で開いたまま）は、`migrate` に「この単位の `sourceFiles` にあるクエリだけ `sourceQueries` に入れる」条件を足し、`analyze` でクエリを探すファイルを `fullProgramSourceFiles` から `.d.ts` と shim を除いたものに広げています（別の単位のファイルのクエリでも、この単位の spec が `new` している、などを見落とさないため）。spec は test/queries\_migration\_spec.ts に、angular.json に build と test の 2 つの tsconfig を書いた it を 3 つ足す形です（gh で差分を読んだだけで、手元では走らせていません）。結論：**#71147 は、この章の 7 節の 427〜431 行目と 462〜464 行目が原因の、この移行そのものの問題です**。報告にある ngstyle-to-style の側は別の移行で、この章では読んでいません（[第 20 回](20-mig-issues.md)）。

### ここまでの呼び出しを 1 本に

- 👤 `ng generate @angular/core:signal-queries-migration` — ng-generate/signal-queries-migration/index.ts
  - `runMigrationInDevkit()` — utils/tsurge/helpers/angular\_devkit/run\_in\_devkit.ts
    - `SignalQueriesMigration.analyze(info)` — migration.ts — *tsconfig ごとに*
      - `extractSourceQueryDefinition()` — identify\_queries.ts
      - `createFindAllSourceFileReferencesVisitor()` — ../signal-migration/src/passes/reference\_resolution/index.ts — *全部のフィールドの参照*
      - `checkForIncompatibleQueryListAccesses()` — incompatible\_query\_list\_fns.ts — *保留の印*
    - `combine()` / `globalMeta()` — migration.ts — *複数の結果なら印を理由に*
    - `SignalQueriesMigration.migrate(globalMeta, info)` — migration.ts — *tsconfig ごとに*
      - `checkInheritanceOfKnownFields()` — ../signal-migration/src/passes/problematic\_patterns/check\_inheritance.ts — *KnownQueries は親 ⇄ 子*
      - `computeReplacementsToMigrateQuery()` — convert\_query\_property.ts
      - `migrateTypeScriptReferences()` ほか 3 つ — ../signal-migration/src/passes/reference\_migration/
      - `removeQueryListToArrayCall()` / `replaceQueryListGetCall()` / `replaceQueryListFirstAndLastReferences()` — fn\_\*.ts
      - `applyImportManagerChanges()` — utils/tsurge/helpers/apply\_import\_manager.ts

## テストと直し方

spec は 2 か所です。1 つは `migrations/signal-queries-migration/migration.spec.ts` の `describe('signal queries migration')`（229 行目）で、`runTsurgeMigration` でメモリの中のファイルに直接走らせます。宣言の書き換えを 1 行ずつ確かめる `describe('declaration test cases')`（235 行目。表 `declarationTestCases` の 1 行が 1 つの it になる）、`describe('inheritance')`（549 行目）、`describe('--best-effort-mode')`（1397 行目）、`describe('--insert-todos-for-skipped-fields')`（1471 行目）があります。もう 1 つは test/queries\_migration\_spec.ts の `describe('signal queries migration')`（16 行目）で、it は 3 つ（56・74・106 行目）。ビルドした `.cjs` を `ng generate` と同じ経路で走らせます。

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.spec.ts` L706–743 （▶ の行: 706, 718, 721, 730, 736, 739）

```ts
706 ▶   it('should remove `toArray` function calls for multi queries', async () => {
707 │     const {fs} = await runTsurgeMigration(new SignalQueriesMigration(), [
708 │       {
709 │         name: absoluteFrom('/app.component.ts'),
710 │         isProgramRootFile: true,
711 │         contents: dedent`
712 │           import {ViewChildren, QueryList, ElementRef, Component} from '@angular/core';
713 │ 
714 │           @Component({
715 │             template: ''
716 │           })
717 │           class MyComp {
718 ▶             @ViewChildren('label') labels = new QueryList<ElementRef>();
719 │ 
720 │             click() {
721 ▶               this.labels.toArray().some(bla);
722 │             }
723 │           }
724 │         `,
725 │       },
726 │     ]);
727 │ 
728 │     const actual = fs.readFile(absoluteFrom('/app.component.ts'));
729 │     expect(actual).toMatchWithDiff(`
730 ▶       import {ElementRef, Component, viewChildren} from '@angular/core';
731 │ 
732 │       @Component({
733 │         template: ''
734 │       })
735 │       class MyComp {
736 ▶         readonly labels = viewChildren<ElementRef>('label');
737 │ 
738 │         click() {
739 ▶           this.labels().some(bla);
740 │         }
741 │       }
742 │     `);
743 │   });
```

📄 `angular/packages/core/schematics/migrations/signal-queries-migration/migration.spec.ts` L948–985 （▶ の行: 948, 960, 963, 972, 978, 981）

```ts
948 ▶   it('should not migrate a query relying on QueryList#changes', async () => {
949 │     const {fs} = await runTsurgeMigration(new SignalQueriesMigration(), [
950 │       {
951 │         name: absoluteFrom('/app.component.ts'),
952 │         isProgramRootFile: true,
953 │         contents: dedent`
954 │           import {ContentChildren, QueryList, ElementRef, Component} from '@angular/core';
955 │ 
956 │           @Component({
957 │             template: '',
958 │           })
959 │           class MyComp {
960 ▶             @ContentChildren('label') labels = new QueryList<ElementRef>();
961 │ 
962 │             ngOnInit() {
963 ▶               this.labels.changes.subscribe(() => {});
964 │             }
965 │           }
966 │         `,
967 │       },
968 │     ]);
969 │ 
970 │     const actual = fs.readFile(absoluteFrom('/app.component.ts'));
971 │     expect(actual).toMatchWithDiff(`
972 ▶       import {ContentChildren, QueryList, ElementRef, Component} from '@angular/core';
973 │ 
974 │       @Component({
975 │         template: '',
976 │       })
977 │       class MyComp {
978 ▶         @ContentChildren('label') labels = new QueryList<ElementRef>();
979 │ 
980 │         ngOnInit() {
981 ▶           this.labels.changes.subscribe(() => {});
982 │         }
983 │       }
984 │     `);
985 │   });
```

706 行目の it では、721 行目の `this.labels.toArray().some(bla)` が 739 行目の `this.labels().some(bla)` になり、736 行目の宣言は文字列で探すので型の引数付き、730 行目で `QueryList` と `ViewChildren` の import が消えています。948 行目の it では、963 行目の `.changes` のせいで、972〜983 行目のとおり何も変わりません。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/schematics/migrations/signal-queries-migration:test \
  --nocache_test_results --test_output=all "--test_arg=--filter=QueryList"
pnpm bazel test //packages/core/schematics/migrations/signal-queries-migration:test \
  --nocache_test_results --test_output=all
pnpm bazel test //packages/core/schematics/test:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=signal queries migration"
```

📄 `出力（2026-11-03 に実行。抜粋）`

```
==================== Test output for //packages/core/schematics/migrations/signal-queries-migration:test:
Ran 13 of 75 specs
13 specs, 0 failures
INFO: Elapsed time: 1.099s, Critical Path: 0.85s
//packages/core/schematics/migrations/signal-queries-migration:test      PASSED in 0.8s

==================== Test output for //packages/core/schematics/migrations/signal-queries-migration:test:
75 specs, 0 failures
INFO: Elapsed time: 1.233s, Critical Path: 0.97s
//packages/core/schematics/migrations/signal-queries-migration:test      PASSED in 0.9s

==================== Test output for //packages/core/schematics/test:test (shard 8 of 16):
Ran 1 of 516 specs
1 spec, 0 failures
（shard 9・10 も Ran 1 of 516。ほかの 13 の shard は Ran 0 of 515）
INFO: Elapsed time: 2.253s, Critical Path: 2.02s
//packages/core/schematics/test:test                                     PASSED in 1.8s
```

1. **1 本目：「QueryList」で絞ると 13 本**

   名前に「QueryList」を含む it は 12 個（601・632・667・948・987・1026・1065・1104・1143・1217・1260・1472 行目）と、名前が 2 行に分かれた 1174 行目の「...unrelated to QueryList」で 13。出力の「Ran 13 of 75」と一致しました。0.8 秒。
2. **2 本目：全部で 75 本、0.9 秒**

   it が 38 個と、`declarationTestCases` の 37 行で 75 です。
3. **3 本目：schematics の spec は 3 本**

   16 の shard のうち 8・9・10 が「Ran 1」で 3 本。2.3 秒。
4. **直すとしたらどこか**

   #71147 なら `migration.ts` の `migrate` の `queryWholeProgramVisitor`（7 節）。`QueryList` のメソッドの書き換えを足すなら `fn_*.ts` を足して 7 節の 572〜576 行目の並びに入れ、移行できないメソッドを足すなら `incompatible_query_list_fns.ts` の表。宣言の形なら `convert_query_property.ts`。1 つの単位で確かめられるものは migration.spec.ts（宣言だけなら `declarationTestCases` に 1 行）、tsconfig が 2 つ要るものは test/queries\_migration\_spec.ts に足します（PR #71151 の形）。1 節の「2 回出る表示」は `ng-generate/signal-queries-migration/index.ts` の `whenDone` で、表示を確かめている spec は 74 行目の `'should report correct statistics'` です。本家に PR を出すことはこのシリーズでは勧めません。#71151 の差分を手元で読み、上の spec を走らせて、issue を読むときの手がかりにします（[第 20 回](20-mig-issues.md)）。

## 聞かれそうな質問

**Q. signal クエリの移行は、signal input の移行と何が同じで何が違いますか？**

参照を集める訪問関数（migration.ts の 38 行目の import）、参照の書き換え 4 つ（33〜36 行目）、`new` や `spyOn` の判定（32 行目）、継承の判定と TODO（66・67 行目）は同じものです。違うのは、鍵（`-` でつなぐ）、単位のデータ（69〜95 行目）、継承を `migrate` で調べて子の理由を親にも伝えること（known\_queries.ts の 133〜138 行目）、それに `QueryList` に固有の書き換えと理由です。

**Q. `this.items.changes.subscribe(...)` を使っていると、なぜ移行されないのですか？**

`viewChildren()` の値は配列で、`changes` が無いからです。incompatible\_query\_list\_fns.ts の 19〜26 行目の 6 つの名前のどれかに参照の直後でアクセスしていると、36 行目で保留の印を付け、migration.ts の 365・388 行目で複数の結果のクエリだと分かったときに `SignalQueries__QueryListProblematicFieldAccessed` になります。best effort なら消せる理由なので移行されますが、`.changes` のところは利用者が書き直します。

**Q. `this.items.first` は何に変わりますか？**

`this.items().at(0)!` です。参照の書き換えで `this.items` の後ろに `()` が付き、fn\_first\_last\_replacement.ts の 21〜24 行目の表と 55〜57 行目で、`first` の名前の範囲が `at(0)!` に置き換わります。`last` は `at(-1)!`、`get(i)` は `at(i)`、`toArray()` は消えます。

**Q. `@ViewChild('ref') el: ElementRef | null = null;` は移行されますか？**

されません。migration.ts の 171〜176 行目で、共用体の型が `T | undefined` の形でない（`null` を含む）ので `SignalQueries__IncompatibleMultiUnionType` になります。`el?: ElementRef` か `ElementRef | undefined` と書いてあれば移行されます。

**Q. #71147 の重複は、なぜ signal input では起きないのですか？**

signal input は pass 1（1\_identify\_inputs.ts）で、書き換える宣言を「この単位の `sourceFiles` にある入力」に限っているからです（第 7 回の 3 節）。signal クエリの `migrate` は migration.ts の 462〜464 行目で全部のファイルを歩き、427〜431 行目でそのまま書き換えの対象に入れます。この条件を足すのが PR #71151 です。

## 読み終えて

- signal クエリの移行は、参照の集め方・書き換え・パターンの判定・継承・TODO を signal input の部品から借り、鍵・単位のデータ・`QueryList` の扱いを自分で持つ。
- `analyze` ではどのフィールドがクエリか分からないので、全部のフィールドの参照と「問題のありそうな使い方」を集め、`combine` / `globalMeta` で複数の結果のクエリだったものだけを理由にする。
- `toArray()` は消す、`get(i)` は `at(i)`、`first` / `last` は `at(0)!` / `at(-1)!`。`changes`・`dirty` など 6 つは移行できない。
- 継承は `migrate` で調べ、子の理由を親にも伝える（signal input には無い向き）。
- #71147 の原因は、`migrate` が `fullProgramSourceFiles` のクエリを全部書き換えの対象にしていること。直す PR #71151 が開いている。

---

← 前: [移行できない入力：理由の判定と TODO](09-mig-signal-input-incompatible.md)  
次: [output() への移行と signals のまとめ役](11-mig-output.md) →
