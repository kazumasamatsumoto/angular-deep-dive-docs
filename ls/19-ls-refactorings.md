[目次](../README.md) › [言語サービスの内側](README.md) › 第 19 回 / 全 20 回

# リファクタリング：@Input を input() に変える

> refactorings/ が、@Input と @ViewChild などのクエリを signal の input() や viewChild() に変えるリファクタリングを、core のマイグレーション（signal-migration）を使って言語サービスの中で動かす仕組み。getPossibleRefactorings と applyRefactoring、1 つだけ変えるかクラス全体を変えるか、変えられないときの理由。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ls-refactorings)

---

`@Input() name = ''` の上で電球を開くと「Convert this @Input() to a signal input (safe)」が出て、押すと `readonly name = input('')` に変わり、テンプレートの `name` も `name()` になります。この章では、その 8 つのリファクタリングが**どんなときに候補に出るか**（isApplicable）と、**押したときに何が走るか**（core の signal-migration を言語サービスの中で丸ごと動かす）を行で追い、変えられないときの理由がどこで決まり、どんな文になって VS Code に出るかまでを見ます。

読む対象は `packages/language-service/src/refactorings/` の 9 ファイル、`language_service.ts` の 2 つのメソッド、`packages/core/schematics/migrations/signal-migration/src/` の入口（`migration.ts`・`migration_config.ts`・`best_effort_mode.ts`・`passes/problematic_patterns/incompatibility.ts`）、`vscode-ng-language-service/server/src/handlers/code_actions.ts` です。

1. [1. 全体像](01-ls-overview.md)
2. [2. VS Code クライアント](02-ls-client.md)
3. [3. LSP サーバー](03-ls-server-session.md)
4. [4. tsserver プラグイン](04-ls-ts-plugin.md)
5. [5. CompilerFactory](05-ls-compiler-factory.md)
6. [6. 外部テンプレート](06-ls-external-templates.md)
7. [7. カーソルの位置](07-ls-template-target.md)
8. [8. 診断](08-ls-diagnostics.md)
9. [9. ホバー](09-ls-quick-info.md)
10. [10. 定義へのジャンプ](10-ls-definitions.md)
11. [11. 参照と名前変更](11-ls-references-rename.md)
12. [12. 式の補完](12-ls-completions.md)
13. [13. 要素と属性の補完](13-ls-attribute-completions.md)
14. [14. シグネチャヘルプ](14-ls-signature-help.md)
15. [15. インレイヒント](15-ls-inlay-hints.md)
16. [16. 色分け](16-ls-semantic-tokens.md)
17. [17. 文書のシンボル](17-ls-document-symbols.md)
18. [18. コード修正](18-ls-code-fixes.md)
19. **19. リファクタリング**（この章）
20. [20. issue と PR を読む](20-ls-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> [第 18 回](18-ls-code-fixes.md)のコード修正は「診断があって、それを直す」もので、編集をその場で作ります。リファクタリング（refactor）は診断が無くても出る「書き換えの提案」で、候補を出す段と、押されてから編集を計算する段が分かれています。signal の `input()` が何で、コンパイラがどう扱うかは[signals-input-compile](../signals/12-signals-input-compile.md)で読みます。この章は「`@Input` から書き換える」道具の側です。

## 1. 入口：候補を出す段と、編集を作る段

📄 `angular/packages/language-service/src/language_service.ts` L805–817 （▶ の行: 812–814）

```ts
805 │   getPossibleRefactorings(
806 │     fileName: string,
807 │     positionOrRange: number | ts.TextRange,
808 │   ): ts.ApplicableRefactorInfo[] {
809 │     return this.withCompilerAndPerfTracing(
810 │       PerfPhase.LSComputeApplicableRefactorings,
811 │       (compiler) => {
812 ▶         return allRefactorings
813 ▶           .filter((r) => r.isApplicable(compiler, fileName, positionOrRange))
814 ▶           .map((r) => ({name: r.id, description: r.description, actions: []}));
815 │       },
816 │     );
817 │   }
```

812〜814 行目、8 つのリファクタリングのクラスの `isApplicable` を順に呼び、真のものだけを `{name: id, description, actions: []}` にして返します。**この段では編集を作りません。**

📄 `angular/packages/language-service/src/language_service.ts` L819–858 （▶ の行: 822, 825, 828, 833, 839, 845–846, 848, 850）

```ts
819 │   /**
820 │    * Computes edits for applying the specified refactoring.
821 │    *
822 ▶    * VSCode explicitly split code actions into two stages:
823 │    *
824 │    *  - 1) what actions are active?
825 ▶    *  - 2) what are the edits? <- if the user presses the button
826 │    *
827 │    * The latter stage may take longer to compute complex edits, perform
828 ▶    * analysis. This stage is currently implemented via our non-LSP standard
829 │    * `applyRefactoring` method. We implemented it in a way to support asynchronous
830 │    * computation, so that it can easily integrate with migrations that aren't
831 │    * synchronous/or compute edits in parallel.
832 │    */
833 ▶   async applyRefactoring(
834 │     fileName: string,
835 │     positionOrRange: number | ts.TextRange,
836 │     refactorName: string,
837 │     reportProgress: ApplyRefactoringProgressFn,
838 │   ): Promise<ApplyRefactoringResult | undefined> {
839 ▶     const matchingRefactoring = allRefactorings.find((r) => r.id === refactorName);
840 │     if (matchingRefactoring === undefined) {
841 │       return undefined;
842 │     }
843 │ 
844 │     return this.withCompilerAndPerfTracing(PerfPhase.LSApplyRefactoring, (compiler) => {
845 ▶       if (!this.activeRefactorings.has(refactorName)) {
846 ▶         this.activeRefactorings.set(refactorName, new matchingRefactoring(this.project));
847 │       }
848 ▶       const activeRefactoring = this.activeRefactorings.get(refactorName)!;
849 │ 
850 ▶       return activeRefactoring.computeEditsForFix(
851 │         compiler,
852 │         this.options,
853 │         fileName,
854 │         positionOrRange,
855 │         reportProgress,
856 │       );
857 │     });
858 │   }
```

1. **822〜831 行目：VS Code が 2 段に分けている**

   「どの操作が出せるか」と「押されたら編集は何か」。後者は時間がかかってよいので、TypeScript の標準の口ではなく、Angular の独自のメソッド `applyRefactoring` を `async` で用意した、とコメントにあります。
2. **839 行目：id でクラスを探す**

   見つからなければ undefined です。
3. **845〜848 行目：インスタンスは名前ごとに 1 つ作って使い回す**

   `activeRefactorings` の Map に入れておきます。108a88ca61c（2024-09-03）の説明は「言語サービスの起動を速くし、あとで解析の結果を使い回せるようにするため」です。今の 8 つのクラスが持っているのはコンストラクタで受け取る `project` だけで、解析の結果は持っていません（3 節）。
4. **850 行目：computeEditsForFix を呼んで Promise を返す**

   中で core のマイグレーションを `await` します（4 節）。

> [!NOTE]
> **さらに深く**
>
> 計測は `withCompilerAndPerfTracing`（[第 5 回](05-ls-compiler-factory.md)）が、コールバックが返るまでの時間を `LSApplyRefactoring` の区切りとして測ります。`applyRefactoring` のコールバックは Promise を返した時点で返るので、この区切りに入るのは `await` の前までの同期の部分です。

📄 `angular/packages/language-service/src/ts_plugin.ts` L255–261 （▶ の行: 255–258, 261）

```ts
255 ▶     // We never forward to TS for refactors because those are not handled
256 ▶     // properly by the LSP server implementation of the extension. The extension
257 ▶     // will only take care of refactorings from Angular language service.
258 ▶     // Code actions are tied to their provider, so this is unproblematic and will
259 │     // not hide built-in TypeScript refactorings:
260 │     // https://github.com/microsoft/vscode/blob/ea4d99921cc790d49194e897021faee02a1847f7/src/vs/editor/contrib/codeAction/codeAction.ts#L30-L31
261 ▶     return ngLS.getPossibleRefactorings(fileName, positionOrRange);
```

tsserver のプラグインでは、255〜260 行目のコメントのとおり、リファクタリングは TypeScript に回さず Angular のものだけを返します。拡張の LSP サーバーが TypeScript のリファクタリングをうまく扱えないからで、TypeScript 自身のリファクタリングは VS Code の TypeScript の拡張が別に出します（[第 4 回](04-ls-ts-plugin.md)）。

## 2. Refactoring の形と 8 つのクラス

📄 `angular/packages/language-service/src/refactorings/refactoring.ts` L43–76 （▶ の行: 44, 47, 50, 53, 67, 69, 75）

```ts
43 │ export interface Refactoring {
44 ▶   new (project: ts.server.Project): ActiveRefactoring;
45 │ 
46 │   /** Unique id of the refactoring. */
47 ▶   id: string;
48 │ 
49 │   /** Description of the refactoring. Shown in e.g. VSCode as the code action. */
50 ▶   description: string;
51 │ 
52 │   /** Whether the refactoring is applicable at the given location. */
53 ▶   isApplicable(
54 │     compiler: NgCompiler,
55 │     fileName: string,
56 │     positionOrRange: number | ts.TextRange,
57 │   ): boolean;
58 │ }
59 │ 
60 │ /**
61 │  * Interface that describes an active refactoring instance. A
62 │  * refactoring may be lazily instantiated whenever the refactoring
63 │  * is requested to be applied.
64 │  *
65 │  * More information can be found in {@link Refactoring}
66 │  */
67 ▶ export interface ActiveRefactoring {
68 │   /** Computes the edits for the refactoring. */
69 ▶   computeEditsForFix(
70 │     compiler: NgCompiler,
71 │     compilerOptions: CompilerOptions,
72 │     fileName: string,
73 │     positionOrRange: number | ts.TextRange,
74 │     reportProgress: ApplyRefactoringProgressFn,
75 ▶   ): Promise<ApplyRefactoringResult>;
76 │ }
```

`Refactoring` はクラスそのもの（static の欄とコンストラクタ）の形です。44 行目の `new (project)`、47 行目の `id`、50 行目の `description`（電球に出る文）、53 行目の `isApplicable` の 4 つ。インスタンスの形は 67 行目の `ActiveRefactoring` で、75 行目のとおり `computeEditsForFix` が `Promise<ApplyRefactoringResult>` を返します。`ApplyRefactoringResult`（api.ts）は TypeScript の `RefactorEditInfo` の `edits` に `errorMessage` と `warningMessage` を足したものです。

📄 `angular/packages/language-service/src/refactorings/refactoring.ts` L78–89 （▶ の行: 80–83, 85–88）

```ts
78 │ export const allRefactorings: Refactoring[] = [
79 │   // Signal Input migration
80 ▶   ConvertFieldToSignalInputRefactoring,
81 ▶   ConvertFieldToSignalInputBestEffortRefactoring,
82 ▶   ConvertFullClassToSignalInputsRefactoring,
83 ▶   ConvertFullClassToSignalInputsBestEffortRefactoring,
84 │   // Queries migration
85 ▶   ConvertFieldToSignalQueryRefactoring,
86 ▶   ConvertFieldToSignalQueryBestEffortRefactoring,
87 ▶   ConvertFullClassToSignalQueriesRefactoring,
88 ▶   ConvertFullClassToSignalQueriesBestEffortRefactoring,
89 │ ];
```

| id | 単位 | config |
| --- | --- | --- |
| convert-field-to-signal-input-safe-mode | 1 つの @Input | `{}` |
| convert-field-to-signal-input-best-effort-mode | 1 つの @Input | `{bestEffortMode: true}` |
| convert-full-class-to-signal-inputs-safe-mode | クラスの全部の @Input | `{}` |
| convert-full-class-to-signal-inputs-best-effort-mode | クラスの全部の @Input | `{bestEffortMode: true}` |
| （クエリの 4 つ） | @ViewChild・@ViewChildren・@ContentChild・@ContentChildren | 同じ 2 × 2 |

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_input/individual_input_refactoring.ts` L111–120 （▶ の行: 112–114, 117, 119）

```ts
111 │ export class ConvertFieldToSignalInputRefactoring extends BaseConvertFieldToSignalInputRefactoring {
112 ▶   static id = 'convert-field-to-signal-input-safe-mode';
113 ▶   static description = 'Convert this @Input() to a signal input (safe)';
114 ▶   override config: MigrationConfig = {};
115 │ }
116 │ export class ConvertFieldToSignalInputBestEffortRefactoring extends BaseConvertFieldToSignalInputRefactoring {
117 ▶   static id = 'convert-field-to-signal-input-best-effort-mode';
118 │   static description = 'Convert this @Input() to a signal input (forcibly, ignoring errors)';
119 ▶   override config: MigrationConfig = {bestEffortMode: true};
120 │ }
```

safe と best-effort の違いは 114 行目と 119 行目の `config` の 1 欄だけで、残りは基底クラスの同じコードです。

## 3. isApplicable：カーソルが @Input のフィールドの上にあるか

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_input/individual_input_refactoring.ts` L37–74 （▶ の行: 42, 51–52, 57, 62–63, 67, 69, 73）

```ts
37 │   static isApplicable(
38 │     compiler: NgCompiler,
39 │     fileName: string,
40 │     positionOrRange: number | ts.TextRange,
41 │   ): boolean {
42 ▶     if (!isTypeScriptFile(fileName)) {
43 │       return false;
44 │     }
45 │ 
46 │     const sf = compiler.getCurrentProgram().getSourceFile(fileName);
47 │     if (sf === undefined) {
48 │       return false;
49 │     }
50 │ 
51 ▶     const start = typeof positionOrRange === 'number' ? positionOrRange : positionOrRange.pos;
52 ▶     const node = findTightestNode(sf, start);
53 │     if (node === undefined) {
54 │       return false;
55 │     }
56 │ 
57 ▶     const classDecl = getParentClassDeclaration(node);
58 │     if (classDecl === undefined) {
59 │       return false;
60 │     }
61 │ 
62 ▶     const {reflector} = compiler['ensureAnalyzed']();
63 ▶     if (!isDirectiveOrComponent(classDecl, reflector)) {
64 │       return false;
65 │     }
66 │ 
67 ▶     const parentClassElement = ts.findAncestor(node, (n) => ts.isClassElement(n) || ts.isBlock(n));
68 │     // If we are inside a body of e.g. an accessor, this action should not show up.
69 ▶     if (parentClassElement === undefined || ts.isBlock(parentClassElement)) {
70 │       return false;
71 │     }
72 │ 
73 ▶     return isDecoratorInputClassField(parentClassElement, reflector);
74 │   }
```

1. **42 行目：TS ファイルだけ**

   テンプレートの中からは出ません。
2. **51・52 行目：範囲なら始まりの位置で、一番内側のノードを探す**

   `findTightestNode`（utils/ts\_utils.ts）は、位置を含む子へ子へと降りていきます。
3. **57〜65 行目：その親のクラスが @Directive か @Component か**

   62 行目の `compiler['ensureAnalyzed']()` は NgCompiler の private なメソッドを角括弧で呼んで、解析に使った `reflector`（デコレータを読む部品）を取り出しています。
4. **67〜71 行目：クラスのメンバーの中にいるか、メソッドの本体の中か**

   祖先をたどって、先にクラスのメンバーに当たればそのメンバー、先に `{ }`（Block）に当たればメソッドや get の本体の中なので候補を出しません。
5. **73 行目：そのメンバーに @Input が付いているか**

   すでに `input()` のフィールドにはデコレータが無いので出ません（spec の「should not support refactoring a signal input property」）。

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_input/decorators.ts` L14–33 （▶ の行: 18, 22, 29, 32）

```ts
14 │ export function isDecoratorInputClassField(
15 │   node: ts.ClassElement,
16 │   reflector: ReflectionHost,
17 │ ): boolean {
18 ▶   const decorators = reflector.getDecoratorsOfDeclaration(node);
19 │   if (decorators === null) {
20 │     return false;
21 │   }
22 ▶   return getAngularDecorators(decorators, ['Input'], /* isCore */ false).length > 0;
23 │ }
24 │ 
25 │ export function isDirectiveOrComponentWithInputs(
26 │   node: ts.ClassDeclaration,
27 │   reflector: ReflectionHost,
28 │ ): boolean {
29 ▶   if (!isDirectiveOrComponent(node, reflector)) {
30 │     return false;
31 │   }
32 ▶   return node.members.some((m) => isDecoratorInputClassField(m, reflector));
33 │ }
```

22 行目、`getAngularDecorators(decorators, ['Input'], false)` の 3 つ目の引数は「@angular/core そのものをコンパイルしているか」で、false なら `@angular/core` から import した `Input` だけを数えます。クラス単位のほうは 29〜32 行目の `isDirectiveOrComponentWithInputs` で「@Input のメンバーが 1 つでもあるか」を見ます。

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_input/full_class_input_refactoring.ts` L52–70 （▶ の行: 57, 61–63, 66, 69）

```ts
52 │     const classDecl = getParentClassDeclaration(node);
53 │     if (classDecl === undefined) {
54 │       return false;
55 │     }
56 │     const {reflector} = compiler['ensureAnalyzed']();
57 ▶     if (!isDirectiveOrComponentWithInputs(classDecl, reflector)) {
58 │       return false;
59 │     }
60 │ 
61 ▶     const parentClassElement = ts.findAncestor(node, (n) => ts.isClassElement(n) || ts.isBlock(n));
62 ▶     if (parentClassElement === undefined) {
63 ▶       return true;
64 │     }
65 │     // If we are inside a body of e.g. an accessor, this action should not show up.
66 ▶     if (ts.isBlock(parentClassElement)) {
67 │       return false;
68 │     }
69 ▶     return isDecoratorInputClassField(parentClassElement, reflector);
70 │   }
```

クラス単位の違いは 61〜64 行目です。祖先にメンバーも Block も無い、つまりカーソルがクラスの名前やデコレータの上にあるときは true を返します。メンバーの上なら、それが @Input のときだけ true です。だから @Input の上では 4 つ全部が、クラスの名前の上ではクラス単位の 2 つだけが出ます（テストの節）。

## 4. computeEditsForFix：core のマイグレーションに「どれを変えるか」を渡す

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_input/individual_input_refactoring.ts` L83–108 （▶ の行: 89, 94–96, 99, 105–106）

```ts
 83 │     const sf = compiler.getCurrentProgram().getSourceFile(fileName);
 84 │     if (sf === undefined) {
 85 │       return {edits: []};
 86 │     }
 87 │ 
 88 │     const start = typeof positionOrRange === 'number' ? positionOrRange : positionOrRange.pos;
 89 ▶     const node = findTightestNode(sf, start);
 90 │     if (node === undefined) {
 91 │       return {edits: []};
 92 │     }
 93 │ 
 94 ▶     const containingClassElement = ts.findAncestor(node, ts.isClassElement);
 95 ▶     if (containingClassElement === undefined || !isInputContainerNode(containingClassElement)) {
 96 ▶       return {edits: [], errorMessage: 'Selected node does not belong to an input.'};
 97 │     }
 98 │ 
 99 ▶     return await applySignalInputRefactoring(
100 │       compiler,
101 │       compilerOptions,
102 │       this.config,
103 │       this.project,
104 │       reportProgress,
105 ▶       (input) => input.descriptor.node === containingClassElement,
106 ▶       /** allowPartialMigration */ false,
107 │     );
108 │   }
```

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_input/full_class_input_refactoring.ts` L84–104 （▶ の行: 90–92, 101–102）

```ts
 84 │     const start = typeof positionOrRange === 'number' ? positionOrRange : positionOrRange.pos;
 85 │     const node = findTightestNode(sf, start);
 86 │     if (node === undefined) {
 87 │       return {edits: []};
 88 │     }
 89 │ 
 90 ▶     const containingClass = getParentClassDeclaration(node);
 91 ▶     if (containingClass === null) {
 92 ▶       return {edits: [], errorMessage: 'Could not find a class for the refactoring.'};
 93 │     }
 94 │ 
 95 │     return await applySignalInputRefactoring(
 96 │       compiler,
 97 │       compilerOptions,
 98 │       this.config,
 99 │       this.project,
100 │       reportProgress,
101 ▶       (input) => input.descriptor.node.parent === containingClass,
102 ▶       /** allowPartialMigration */ true,
103 │     );
104 │   }
```

どちらも同じ `applySignalInputRefactoring` を呼び、違うのは最後の 2 つの引数だけです。1 つずつは 105 行目で「宣言のノードがカーソルのメンバーと同じ入力」だけを選び、106 行目で `multiMode` を false にします。クラス単位は 101 行目で「宣言の親がこのクラスの入力」を全部選び、102 行目で true にします。

91 行目は `=== null` で比べていますが、`getParentClassDeclaration` は見つからないとき `undefined` を返す関数です（ts\_utils.ts の宣言の戻り値は `ts.ClassDeclaration | undefined`）。なので 92 行目の「Could not find a class for the refactoring.」には来ません。同じ位置で先に 3 節の isApplicable が通っているので、ふつうはクラスが見つかります。

### applySignalInputRefactoring：マイグレーションを 1 回、丸ごと走らせる

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_input/apply_input_refactoring.ts` L25–64 （▶ の行: 31–32, 34, 37, 39–41, 44, 46–47, 53, 57, 64）

```ts
25 │ export async function applySignalInputRefactoring(
26 │   compiler: NgCompiler,
27 │   compilerOptions: CompilerOptions,
28 │   config: MigrationConfig,
29 │   project: ts.server.Project,
30 │   reportProgress: ApplyRefactoringProgressFn,
31 ▶   shouldMigrateInput: (input: KnownInputInfo) => boolean,
32 ▶   multiMode: boolean,
33 │ ): Promise<ApplyRefactoringResult> {
34 ▶   reportProgress(0, 'Starting input migration. Analyzing..');
35 │ 
36 │   const fs = getFileSystem();
37 ▶   const migration = new SignalInputMigration({
38 │     ...config,
39 ▶     upgradeAnalysisPhaseToAvoidBatch: true,
40 ▶     reportProgressFn: reportProgress,
41 ▶     shouldMigrateInput: shouldMigrateInput,
42 │   });
43 │ 
44 ▶   await migration.analyze(
45 │     getProgramInfoFromBaseInfo({
46 ▶       ngCompiler: compiler,
47 ▶       program: compiler.getCurrentProgram(),
48 │       userOptions: compilerOptions,
49 │       host: {
50 │         getCanonicalFileName: (file) => project.projectService.toCanonicalFileName(file),
51 │         getCurrentDirectory: () => project.getCurrentDirectory(),
52 │       },
53 ▶       __programAbsoluteRootFileNames: [],
54 │     }),
55 │   );
56 │ 
57 ▶   if (migration.upgradedAnalysisPhaseResults === null) {
58 │     return {
59 │       edits: [],
60 │       errorMessage: 'Unexpected error. No analysis result is available.',
61 │     };
62 │   }
63 │ 
64 ▶   const {knownInputs, replacements, projectRoot} = migration.upgradedAnalysisPhaseResults;
```

1. **37〜42 行目：SignalInputMigration を作る**

   `ng generate @angular/core:signal-input-migration` が使うのと同じクラスです。39 行目の `upgradeAnalysisPhaseToAvoidBatch` で「解析の段のついでに書き換えまで済ませる」形にし、40 行目で進み具合の通知を、41 行目で「どの入力を変えるか」を渡します。
2. **44〜55 行目：言語サービスの今のプログラムを、そのまま渡す**

   46・47 行目、`NgCompiler` と `getCurrentProgram()` を渡すので、マイグレーションが自分で tsconfig を読んでプログラムを作り直すことはありません。53 行目の `__programAbsoluteRootFileNames` は空です。
3. **57〜64 行目：結果を受け取る**

   `knownInputs`（見つけた入力と、それぞれの移行できない理由）、`replacements`（書き換え）、`projectRoot` の 3 つです。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/migration_config.ts` L11–50 （▶ の行: 16, 22, 37, 49）

```ts
11 │ export interface MigrationConfig {
12 │   /**
13 │    * Whether to migrate as much as possible, even if certain inputs would otherwise
14 │    * be marked as incompatible for migration.
15 │    */
16 ▶   bestEffortMode?: boolean;
17 │ 
18 │   /**
19 │    * Whether to insert TODOs for skipped fields, and reasons on why they
20 │    * were skipped.
21 │    */
22 ▶   insertTodosForSkippedFields?: boolean;
23 │ 
24 │   /**
25 │    * Whether the given input should be migrated. With batch execution, this
26 │    * callback fires for foreign inputs from other compilation units too.
27 │    *
28 │    * Treating an input as non-migrated means that no references to it are
29 │    * migrated, nor the actual declaration (if it's part of the sources).
30 │    *
31 │    * If no function is specified here, the migration will migrate all
32 │    * inputs and references it discovers in compilation units. This is the
33 │    * running assumption for batch mode and LSC mode where the migration
34 │    * assumes all seen inputs (even those in `.d.ts`) are intended to be
35 │    * migrated.
36 │    */
37 ▶   shouldMigrateInput?: (input: KnownInputInfo) => boolean;
38 │ 
39 │   /**
40 │    * Whether to upgrade analysis phase to avoid batch execution.
41 │    *
42 │    * This is useful when not running against multiple compilation units.
43 │    * The analysis phase will re-use the same program and information, without
44 │    * re-analyzing in the `migrate` phase.
45 │    *
46 │    * Results will be available as {@link SignalInputMigration#upgradedAnalysisPhaseResults}
47 │    * after executing the analyze stage.
48 │    */
49 ▶   upgradeAnalysisPhaseToAvoidBatch?: boolean;
50 │ 
```

📄 `angular/packages/core/schematics/migrations/signal-migration/src/migration.ts` L95–122 （▶ の行: 98–99, 103–104, 109, 113–114, 118–119）

```ts
 95 │   override async analyze(info: ProgramInfo) {
 96 │     info = this._prepareProgram(info);
 97 │ 
 98 ▶     const analysisDeps = this.prepareAnalysisDeps(info);
 99 ▶     const knownInputs = new KnownInputs(info, this.config);
100 │     const result = new MigrationResult();
101 │     const host = createMigrationHost(info, this.config);
102 │ 
103 ▶     this.config.reportProgressFn?.(10, 'Analyzing project (input usages)..');
104 ▶     const {inheritanceGraph} = executeAnalysisPhase(host, knownInputs, result, analysisDeps);
105 │ 
106 │     // Mark filtered inputs before checking inheritance. This ensures filtered
107 │     // inputs properly influence e.g. inherited or derived inputs that now wouldn't
108 │     // be safe either (BUT can still be skipped via best effort mode later).
109 ▶     filterInputsViaConfig(result, knownInputs, this.config);
110 │ 
111 │     // Analyze inheritance, track edges etc. and later propagate incompatibilities in
112 │     // the merge stage.
113 ▶     this.config.reportProgressFn?.(40, 'Checking inheritance..');
114 ▶     pass4__checkInheritanceOfInputs(inheritanceGraph, analysisDeps.metaRegistry, knownInputs);
115 │ 
116 │     // Filter best effort incompatibilities, so that the new filtered ones can
117 │     // be accordingly respected in the merge phase.
118 ▶     if (this.config.bestEffortMode) {
119 ▶       filterIncompatibilitiesForBestEffortMode(knownInputs);
120 │     }
121 │ 
122 │     const unitData = getCompilationUnitMetadata(knownInputs);
```

📄 `angular/packages/core/schematics/migrations/signal-migration/src/migration.ts` L124–143 （▶ の行: 125–127, 133, 136–137, 139）

```ts
124 │     // Non-batch mode!
125 ▶     if (this.config.upgradeAnalysisPhaseToAvoidBatch) {
126 ▶       const globalMeta = await this.globalMeta(unitData);
127 ▶       const {replacements} = await this.migrate(globalMeta, info, {
128 │         knownInputs,
129 │         result,
130 │         host,
131 │         analysisDeps,
132 │       });
133 ▶       this.config.reportProgressFn?.(100, 'Completed migration.');
134 │ 
135 │       // Expose the upgraded analysis stage results.
136 ▶       this.upgradedAnalysisPhaseResults = {
137 ▶         replacements,
138 │         projectRoot: info.projectRoot,
139 ▶         knownInputs,
140 │       };
141 │     }
142 │     return confirmAsSerializable(unitData);
143 │   }
```

core の側は 4 つの手順です。104 行目で全部のソースから入力とその使われ方を集め（TS の中の読み出しもテンプレートの中の読み出しも）、109 行目で config の `shouldMigrateInput` に当たらない入力に理由を付け、113・114 行目で継承を見て、118〜120 行目で best-effort なら無視できる理由を消します。125〜141 行目が言語サービスのための分かれ道で、本来はバッチで別々に走る `globalMeta` と `migrate` をその場で続けて呼び、結果を `upgradedAnalysisPhaseResults` に置きます。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/migration.ts` L252–273 （▶ の行: 257, 265, 267–269）

```ts
252 │ function filterInputsViaConfig(
253 │   result: MigrationResult,
254 │   knownInputs: KnownInputs,
255 │   config: MigrationConfig,
256 │ ) {
257 ▶   if (config.shouldMigrateInput === undefined) {
258 │     return;
259 │   }
260 │ 
261 │   const skippedInputs = new Set<ClassFieldUniqueKey>();
262 │ 
263 │   // Mark all skipped inputs as incompatible for migration.
264 │   for (const input of knownInputs.knownInputIds.values()) {
265 ▶     if (!config.shouldMigrateInput(input)) {
266 │       skippedInputs.add(input.descriptor.key);
267 ▶       knownInputs.markFieldIncompatible(input.descriptor, {
268 ▶         context: null,
269 ▶         reason: FieldIncompatibilityReason.SkippedViaConfigFilter,
270 │       });
271 │     }
272 │   }
273 │ }
```

1 つだけ変えるとき、選ばなかった入力は 265〜270 行目で `SkippedViaConfigFilter` の理由を付けられ、書き換えの対象から外れます。この理由は 5 節の「無視できない理由」に入っているので、best-effort でも消えません。

## 5. 変えられないときの理由と、出る文

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/problematic_patterns/incompatibility.ts` L17–47 （▶ の行: 18, 23, 25, 30–33, 37, 39, 41, 43, 45–46）

```ts
17 │ export enum FieldIncompatibilityReason {
18 ▶   OverriddenByDerivedClass = 1,
19 │   RedeclaredViaDerivedClassInputsArray = 2,
20 │   TypeConflictWithBaseClass = 3,
21 │   ParentIsIncompatible = 4,
22 │   DerivedIsIncompatible = 5,
23 ▶   SpyOnThatOverwritesField = 6,
24 │   PotentiallyNarrowedInTemplateButNoSupportYet = 7,
25 ▶   SignalIncompatibleWithHostBinding = 8,
26 │   SignalInput__RequiredButNoGoodExplicitTypeExtractable = 9,
27 │   SignalInput__QuestionMarkButNoGoodExplicitTypeExtractable = 10,
28 │   SignalQueries__QueryListProblematicFieldAccessed = 11,
29 │   SignalQueries__IncompatibleMultiUnionType = 12,
30 ▶   WriteAssignment = 13,
31 ▶   Accessor = 14,
32 ▶   OutsideOfMigrationScope = 15,
33 ▶   SkippedViaConfigFilter = 16,
34 │ }
35 │ 
36 │ /** Field reasons that cannot be ignored. */
37 ▶ export const nonIgnorableFieldIncompatibilities: FieldIncompatibilityReason[] = [
38 │   // Outside of scope fields should not be migrated. E.g. references to inputs in `node_modules/`.
39 ▶   FieldIncompatibilityReason.OutsideOfMigrationScope,
40 │   // Explicitly filtered fields cannot be skipped via best effort mode.
41 ▶   FieldIncompatibilityReason.SkippedViaConfigFilter,
42 │   // There is no good output for accessor fields.
43 ▶   FieldIncompatibilityReason.Accessor,
44 │   // There is no good output for such inputs. We can't perform "conversion".
45 ▶   FieldIncompatibilityReason.SignalInput__RequiredButNoGoodExplicitTypeExtractable,
46 ▶   FieldIncompatibilityReason.SignalInput__QuestionMarkButNoGoodExplicitTypeExtractable,
47 │ ];
```

理由は 16 個の数で、列挙の上のコメントのとおり数が大きいほど重い理由です（重い理由が軽い理由を上書きする）。37〜47 行目の 5 つは**無視できない**理由で、best-effort でも消えません。プロジェクトの外の入力（39 行目）、config で外した入力（41 行目）、get / set の入力（43 行目）、必須や `?` なのに型を決められない入力（45・46 行目）です。

📄 `angular/packages/core/schematics/migrations/signal-migration/src/best_effort_mode.ts` L12–24 （▶ の行: 16, 18–20）

```ts
12 │ /** Filters ignorable input incompatibilities when best effort mode is enabled. */
13 │ export function filterIncompatibilitiesForBestEffortMode(knownInputs: KnownInputs) {
14 │   knownInputs.knownInputIds.forEach(({container: c}) => {
15 │     // All class incompatibilities are "filterable" right now.
16 ▶     c.incompatible = null;
17 │ 
18 ▶     for (const [key, i] of c.memberIncompatibility.entries()) {
19 ▶       if (!nonIgnorableFieldIncompatibilities.includes(i.reason)) {
20 ▶         c.memberIncompatibility.delete(key);
21 │       }
22 │     }
23 │   });
24 │ }
```

best-effort は 16 行目でクラス単位の理由を全部消し、18〜22 行目でメンバーの理由のうち無視できるものを消すだけです。消えた入力は、ふつうの移行できる入力と同じに書き換えられます。

### 言語サービスに戻って：理由を集め、文を作る

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_input/apply_input_refactoring.ts` L65–100 （▶ の行: 65, 67, 77, 79–80, 82–83, 87–88, 92–93, 97）

```ts
 65 ▶   const targetInputs = Array.from(knownInputs.knownInputIds.values()).filter(shouldMigrateInput);
 66 │ 
 67 ▶   if (targetInputs.length === 0) {
 68 │     return {
 69 │       edits: [],
 70 │       errorMessage: 'Unexpected error. Could not find target inputs in registry.',
 71 │     };
 72 │   }
 73 │ 
 74 │   const incompatibilityMessages = new Map<string, string>();
 75 │   const incompatibilityReasons = new Set<FieldIncompatibilityReason>();
 76 │ 
 77 ▶   for (const incompatibleInput of targetInputs.filter((i) => i.isIncompatible())) {
 78 │     const {container, descriptor} = incompatibleInput;
 79 ▶     const memberIncompatibility = container.memberIncompatibility.get(descriptor.key);
 80 ▶     const classIncompatibility = container.incompatible;
 81 │ 
 82 ▶     if (memberIncompatibility !== undefined) {
 83 ▶       const {short, extra} = getMessageForFieldIncompatibility(memberIncompatibility.reason, {
 84 │         single: 'input',
 85 │         plural: 'inputs',
 86 │       });
 87 ▶       incompatibilityMessages.set(descriptor.node.name.text, `${short}\n${extra}`);
 88 ▶       incompatibilityReasons.add(memberIncompatibility.reason);
 89 │       continue;
 90 │     }
 91 │ 
 92 ▶     if (classIncompatibility !== null) {
 93 ▶       const {short, extra} = getMessageForClassIncompatibility(classIncompatibility, {
 94 │         single: 'input',
 95 │         plural: 'inputs',
 96 │       });
 97 ▶       incompatibilityMessages.set(descriptor.node.name.text, `${short}\n${extra}`);
 98 │       continue;
 99 │     }
100 │ 
```

📄 `angular/packages/core/schematics/migrations/signal-migration/src/passes/problematic_patterns/incompatibility_human.ts` L111–120 （▶ の行: 111, 113–114）

```ts
111 ▶     case FieldIncompatibilityReason.WriteAssignment:
112 │       return {
113 ▶         short: `Your application code writes to the ${fieldName.single}. This prevents migration.`,
114 ▶         extra: `Signal ${fieldName.plural} are readonly, so migrating would break your build.`,
115 │       };
116 │     case FieldIncompatibilityReason.OutsideOfMigrationScope:
117 │       return {
118 │         short: `This ${fieldName.single} is not part of any source files in your project.`,
119 │         extra: `The migration excludes ${fieldName.plural} if no source file declaring them was seen.`,
120 │       };
```

65 行目で 4 節の `shouldMigrateInput` に当たる入力だけを対象にし、77 行目でそのうち移行できないものを回ります。メンバーの理由があれば 83 行目の `getMessageForFieldIncompatibility` で short と extra の 2 文（incompatibility\_human.ts。例えば書き込みなら 113・114 行目）を作り、88 行目で理由を覚えます。クラスの理由なら 93 行目で別の関数から文を作ります。どちらも無いのに移行できないときは、このあとの行で「Consider reporting a bug to the Angular team.」というエラーを返します。

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_input/apply_input_refactoring.ts` L109–135 （▶ の行: 111, 113–114, 116–117, 122, 125–126, 130–131, 133）

```ts
109 │   let message: string | undefined = undefined;
110 │ 
111 ▶   if (!multiMode && incompatibilityMessages.size === 1) {
112 │     const [inputName, reason] = incompatibilityMessages.entries().next().value!;
113 ▶     message = `Input field "${inputName}" could not be migrated. ${reason}\n`;
114 ▶   } else if (incompatibilityMessages.size > 0) {
115 │     const inputPlural = incompatibilityMessages.size === 1 ? 'input' : `inputs`;
116 ▶     message = `${incompatibilityMessages.size} ${inputPlural} could not be migrated.\n`;
117 ▶     message += `For more details, click on the skipped inputs and try to migrate individually.\n`;
118 │   }
119 │ 
120 │   // Only suggest the "force ignoring" option if there are actually
121 │   // ignorable incompatibilities.
122 ▶   const canBeForciblyIgnored = Array.from(incompatibilityReasons).some(
123 │     (r) => !nonIgnorableFieldIncompatibilities.includes(r),
124 │   );
125 ▶   if (!config.bestEffortMode && canBeForciblyIgnored) {
126 ▶     message += `Use the "(forcibly, ignoring errors)" action to forcibly convert.\n`;
127 │   }
128 │ 
129 │   // In multi mode, partial migration is allowed.
130 ▶   if (!multiMode && incompatibilityMessages.size > 0) {
131 ▶     return {
132 │       edits: [],
133 ▶       errorMessage: message,
134 │     };
135 │   }
```

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_input/apply_input_refactoring.ts` L137–158 （▶ の行: 137, 140, 143–144, 151, 155–156）

```ts
137 ▶   const fileUpdates = Array.from(groupReplacementsByFile(replacements).entries());
138 │   const edits: ts.FileTextChanges[] = fileUpdates.map(([relativePath, changes]) => {
139 │     return {
140 ▶       fileName: fs.join(projectRoot, relativePath),
141 │       textChanges: changes.map((c) => ({
142 │         newText: c.data.toInsert,
143 ▶         span: {
144 ▶           start: c.data.position,
145 │           length: c.data.end - c.data.position,
146 │         },
147 │       })),
148 │     };
149 │   });
150 │ 
151 ▶   const allInputsIncompatible = incompatibilityMessages.size === targetInputs.length;
152 │ 
153 │   // Depending on whether all inputs were incompatible, the message is either
154 │   // an error, or just a warning (in case of partial migration still succeeding).
155 ▶   const errorMessage = allInputsIncompatible ? message : undefined;
156 ▶   const warningMessage = allInputsIncompatible ? undefined : message;
157 │ 
158 │   return {edits, warningMessage, errorMessage};
```

1. **111〜118 行目：文の 2 通り**

   1 つずつで理由が 1 つなら「Input field "x" could not be migrated. 理由」。クラス単位なら「N inputs could not be migrated.」と「1 つずつ試すと詳しい理由が出る」の 2 行です。
2. **122〜127 行目：「forcibly」を勧めるのは、無視できる理由があるときだけ**

   今が safe で、集めた理由に 5 節の 5 つ以外が 1 つでもあれば、「(forcibly, ignoring errors) を使え」を足します。get / set だけが理由なら勧めません。
3. **130〜135 行目：1 つずつなら、1 つでも駄目なら何も変えない**

   編集を空にして、文をエラーとして返します。
4. **137〜149 行目：書き換えを TypeScript の FileTextChanges に**

   core の `Replacement` をファイルごとに束ね、143・144 行目で「何文字目から何文字を何に」の形にします。テンプレートの中の `name` の後ろに `()` を差し込む書き換え（core の passes/7\_migrate\_template\_references.ts が、テンプレートのファイルに対して作る）も同じ一覧に入ります。
5. **151〜156 行目：エラーか警告か**

   クラス単位で、全部駄目ならエラー、一部でも変えられたら警告です。警告のときは編集も一緒に返ります。

## 6. クエリのほうの違い

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_queries/decorators.ts` L14–29 （▶ の行: 25）

```ts
14 │ export function isDecoratorQueryClassField(
15 │   node: ts.ClassElement,
16 │   reflector: ReflectionHost,
17 │ ): boolean {
18 │   const decorators = reflector.getDecoratorsOfDeclaration(node);
19 │   if (decorators === null) {
20 │     return false;
21 │   }
22 │   return (
23 │     getAngularDecorators(
24 │       decorators,
25 ▶       ['ViewChild', 'ViewChildren', 'ContentChild', 'ContentChildren'],
26 │       /* isCore */ false,
27 │     ).length > 0
28 │   );
29 │ }
```

📄 `angular/packages/language-service/src/refactorings/convert_to_signal_queries/apply_query_refactoring.ts` L37–62 （▶ の行: 38, 40, 56–58, 60–61）

```ts
37 │   const fs = getFileSystem();
38 ▶   const migration = new SignalQueriesMigration({
39 │     ...config,
40 ▶     assumeNonBatch: true,
41 │     reportProgressFn: reportProgress,
42 │     shouldMigrateQuery,
43 │   });
44 │ 
45 │   const programInfo = getProgramInfoFromBaseInfo({
46 │     ngCompiler: compiler,
47 │     program: compiler.getCurrentProgram(),
48 │     userOptions: compilerOptions,
49 │     host: {
50 │       getCanonicalFileName: (file) => project.projectService.toCanonicalFileName(file),
51 │       getCurrentDirectory: () => project.getCurrentDirectory(),
52 │     },
53 │     __programAbsoluteRootFileNames: [],
54 │   });
55 │ 
56 ▶   const unitData = await migration.analyze(programInfo);
57 ▶   const globalMeta = await migration.globalMeta(unitData);
58 ▶   const {replacements, knownQueries} = await migration.migrate(globalMeta, programInfo);
59 │ 
60 ▶   const targetQueries = Array.from(knownQueries.knownQueryIDs.values()).filter((descriptor) =>
61 ▶     shouldMigrateQuery(descriptor, projectFile(descriptor.node.getSourceFile(), programInfo)),
62 │   );
```

クエリの 4 つは、25 行目の 4 つのデコレータを見るほかは入力と同じ形です。違いは core の呼び方で、`SignalQueriesMigration` には「解析のついでに書き換える」口が無いので、40 行目の `assumeNonBatch` を渡したうえで、56〜58 行目で `analyze` → `globalMeta` → `migrate` を言語サービスの側で順に呼びます。理由の文はクエリの登録簿（`knownQueries`）の `getIncompatibilityTextForField` から取り、その先の文の組み立てとエラー・警告の分け方は入力と同じ行の並びです。

## 7. サーバー：Refactor の項目と、押したときの進み具合

📄 `angular/vscode-ng-language-service/server/src/handlers/code_actions.ts` L46–55 （▶ の行: 46–48, 50）

```ts
46 ▶   const refactorRange = {
47 ▶     pos: lspPositionToTsPosition(lsInfo.scriptInfo, params.range.start),
48 ▶     end: lspPositionToTsPosition(lsInfo.scriptInfo, params.range.end),
49 │   };
50 ▶   const applicableRefactors = lsInfo.languageService.getApplicableRefactors(
51 │     filePath,
52 │     refactorRange,
53 │     session.defaultPreferences,
54 │   );
55 │ 
```

📄 `angular/vscode-ng-language-service/server/src/handlers/code_actions.ts` L86–103 （▶ の行: 89, 92–98）

```ts
 86 │   return [
 87 │     ...individualCodeFixes,
 88 │     ...codeFixesAll,
 89 ▶     ...applicableRefactors.map(
 90 │       (r) =>
 91 │         ({
 92 ▶           title: r.description,
 93 ▶           kind: lsp.CodeActionKind.Refactor,
 94 ▶           data: {
 95 ▶             refactor: true,
 96 ▶             name: r.name,
 97 ▶             range: refactorRange,
 98 ▶             document: params.textDocument,
 99 │           } as CodeActionResolveData,
100 │         }) as lsp.CodeAction,
101 │     ),
102 │   ];
103 │ }
```

`textDocument/codeAction` が来るたびに、46〜49 行目で選んでいる範囲を TS の位置に直し、50 行目で 1 節の候補を聞きます。89〜101 行目、候補は種類 `Refactor` の項目になり、編集は持たず、`data` に id と範囲と文書だけを入れます。

📄 `angular/vscode-ng-language-service/server/src/handlers/code_actions.ts` L109–137 （▶ の行: 112, 119–120, 124, 128–129, 133–134, 136）

```ts
109 │   const codeActionResolve = param.data as unknown as CodeActionResolveData;
110 │ 
111 │   // This is a refactoring action; not a code fix.
112 ▶   if (codeActionResolve.refactor === true) {
113 │     const filePath = uriToFilePath(codeActionResolve.document.uri);
114 │     const lsInfo = session.getLSAndScriptInfo(codeActionResolve.document);
115 │     if (!lsInfo) {
116 │       return param;
117 │     }
118 │ 
119 ▶     const progress = await session.connection.window.createWorkDoneProgress();
120 ▶     progress.begin('Refactoring', 0);
121 │ 
122 │     let edits: ApplyRefactoringResult | undefined = undefined;
123 │     try {
124 ▶       edits = await lsInfo.languageService.applyRefactoring(
125 │         filePath,
126 │         codeActionResolve.range,
127 │         codeActionResolve.name,
128 ▶         (percentage, updateMessage) => {
129 ▶           progress.report(percentage, updateMessage);
130 │         },
131 │       );
132 │     } catch (e: unknown) {
133 ▶       console.error(e);
134 ▶       session.connection.window.showErrorMessage(`Refactor failed with unexpected error: ${e}`);
135 │     } finally {
136 ▶       progress.done();
137 │     }
```

📄 `angular/vscode-ng-language-service/server/src/handlers/code_actions.ts` L139–155 （▶ の行: 139–140, 142–143, 145–146, 149, 151）

```ts
139 ▶     if (edits?.warningMessage !== undefined) {
140 ▶       session.connection.window.showWarningMessage(edits.warningMessage);
141 │     }
142 ▶     if (edits?.errorMessage !== undefined) {
143 ▶       session.connection.window.showErrorMessage(edits.errorMessage);
144 │     }
145 ▶     if (!edits) {
146 ▶       return param;
147 │     }
148 │ 
149 ▶     return {
150 │       ...param,
151 ▶       edit: tsFileTextChangesToLspWorkspaceEdit(edits.edits, (path) =>
152 │         session.projectService.getScriptInfo(path),
153 │       ),
154 │     };
155 │   }
```

1. **119・120 行目：進み具合の表示を始める**

   LSP の work done progress で、VS Code の右下に「Refactoring」の通知が出ます。
2. **124〜131 行目：applyRefactoring を await し、進み具合を中継する**

   4 節の `reportProgress(0, 'Starting input migration…')` や core の 10・40・100 の通知が、128・129 行目でそのまま VS Code に流れます。
3. **139〜144 行目：警告とエラーは、メッセージの窓で出す**

   5 節の文はここで `showWarningMessage` / `showErrorMessage` になります。145〜147 行目で何も足さずに返すのは、例外で `edits` が undefined のときだけです。エラーで編集が空のときも、151 行目で空の編集を入れて返します。

## 8. デモ：理由と設定で、結果がどう変わるか

> **🧪 apply\_input\_refactoring.ts の判断を書き写したもの**
>
> 3 つの @Input に「移行できない理由」を手で付け、1 つずつ / クラス単位、safe / best-effort を選ぶと、5 節の 74〜158 行目と best\_effort\_mode.ts の 13〜24 行目の判断で結果を出します。本物は理由を `SignalInputMigration` が TS のプログラムを解析して決めます。ここでは解析は動かしておらず、クラス単位の理由も扱っていません。文は incompatibility\_human.ts の英文のままです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ls-refactorings)

- 最初の状態（count に書き込み、カーソルは count、safe）はエラーで、文の最後に「forcibly」を勧める 1 行が付きます。best-effort にすると書き込みの理由が消え、count が書き換わります。
- カーソルを mode（get / set）にすると、best-effort でもエラーのままで、「forcibly」を勧める行も出ません。spec の「should show an error if the input is incompatible, but cannot be ignored」の形です。
- クラス単位にすると title だけが書き換わり、残りの 2 つは警告の文にまとまります。全部に理由を付けると警告ではなくエラーになり、書き換えはありません。

## 9. #63903：マイグレーションの GUI がほしい

#63903（2025-09-18、ラベル `area: language-service` と `area: vscode-extension`、コメント 7）は、VS Code の拡張に「Migrations」のタブを足し、プロジェクトで使えるマイグレーションを並べ、プロジェクト全体・フォルダ・ファイルの単位で当て、エディタの中でも quick fix のように 1 クリックで当てられるようにしたい、という要望です。最後のコメント（2025-09-19）では報告者が、`constructor` から `inject()` への書き換えなども、コードの一部を選んで当てられるとよい、と画像つきで書いています。

- メンバー（JeanMeche）のコメントは「そういう機能のためにほかの依存（Nx）を足す必要があるべきではない。フレームワークが持つ価値があると思う」の 1 つで、PR は付いていません（`gh pr list --search 63903` は 0 件、2026-11-03）。
- 今の言語サービスから当てられるのは、この章の 2 つ（入力とクエリ）だけです。refactorings/ が import している core の schematics は `signal-migration`・`signal-queries-migration` と、共通の部品の `tsurge` だけで、core/schematics には migrations/ に 12 個、ng-generate/ に 15 個のディレクトリがあります。
- 単位は「1 つのフィールド」か「1 つのクラス」で、ファイルやフォルダの単位はありません（4 節の 105・101 行目の選び方）。
- 新しいマイグレーションを足すなら、2 節の `Refactoring` の形でクラスを作り、`allRefactorings` に入れる、という入口はできています。core のマイグレーションが tsurge の形（analyze・globalMeta・migrate）で書かれていれば、6 節のクエリと同じ呼び方で動かせます。

## ここまでの呼び出し

- 👤 `@Input の上で電球を開く` — VS Code
  - `onCodeAction(session, params)` — server/src/handlers/code\_actions.ts L36
    - `getApplicableRefactors → getPossibleRefactorings` — ts\_plugin.ts L251 → language\_service.ts L805 — *8 つの isApplicable*
- 👤 `「Convert this @Input() to a signal input (safe)」を押す` — VS Code
  - `onCodeActionResolve(session, param)` — code\_actions.ts L105 — *work done progress を始める*
    - `applyRefactoring(file, range, id, reportProgress)` — ts\_plugin.ts L264 → language\_service.ts L833 — *activeRefactorings から取り出す*
      - `computeEditsForFix(compiler, options, file, range, reportProgress)` — individual\_input\_refactoring.ts L76
        - `applySignalInputRefactoring(…, shouldMigrateInput, multiMode)` — apply\_input\_refactoring.ts L25
          - `new SignalInputMigration({ upgradeAnalysisPhaseToAvoidBatch: true, … }).analyze(programInfo)` — core/schematics/…/signal-migration/src/migration.ts L95 — *解析 → 理由 → globalMeta → migrate*
        - `理由を集めて文を作る → FileTextChanges` — apply\_input\_refactoring.ts L74〜L158
  - `showErrorMessage / showWarningMessage と edit` — code\_actions.ts L139〜L154

## テストと直し方

signal\_input\_refactoring\_action\_spec.ts（466 行）は describe が 3 つ（全体と `individual fields`・`full class`）、it が 13 本（7 + 6）です。クエリの signal\_queries\_refactoring\_action\_spec.ts（525 行）は同じ並びに best-effort の it が 1 本多い 14 本です。

📄 `angular/packages/language-service/test/signal_input_refactoring_action_spec.ts` L128–164 （▶ の行: 135, 138, 146, 155, 158, 161–163）

```ts
128 │     it('should show an error if the input is incompatible', async () => {
129 │       const files = {
130 │         'app.ts': `
131 │           import {Directive, Input} from '@angular/core';
132 │ 
133 │           @Directive({})
134 │           export class AppComponent {
135 ▶             @Input() bla = true;
136 │ 
137 │             click() {
138 ▶               this.bla = false;
139 │             }
140 │           }
141 │      `,
142 │       };
143 │ 
144 │       const project = createModuleAndProjectWithDeclarations(env, 'test', files);
145 │       const appFile = project.openFile('app.ts');
146 ▶       appFile.moveCursorToText('bl¦a = true');
147 │ 
148 │       const refactorings = project.getRefactoringsAtPosition('app.ts', appFile.cursor);
149 │       expect(refactorings.length).toBe(4);
150 │       expect(refactorings[0].name).toBe('convert-field-to-signal-input-safe-mode');
151 │       expect(refactorings[1].name).toBe('convert-field-to-signal-input-best-effort-mode');
152 │       expect(refactorings[2].name).toBe('convert-full-class-to-signal-inputs-safe-mode');
153 │       expect(refactorings[3].name).toBe('convert-full-class-to-signal-inputs-best-effort-mode');
154 │ 
155 ▶       const edits = await project.applyRefactoring(
156 │         'app.ts',
157 │         appFile.cursor,
158 ▶         refactorings[0].name,
159 │         () => {},
160 │       );
161 ▶       expect(edits?.errorMessage).toContain(`Input field "bla" could not be migrated`);
162 ▶       expect(edits?.errorMessage).toContain(`to forcibly convert.`);
163 ▶       expect(edits?.edits).toEqual([]);
164 │     });
```

138 行目の `this.bla = false` が書き込み（`WriteAssignment`）の理由になり、158 行目で safe の 1 つずつを当てると、161 行目のとおり 5 節の 113 行目の文、162 行目のとおり 126 行目の「forcibly」の行が出て、163 行目のとおり編集は空です。8 節のデモの最初の状態と同じです。

📄 `angular/packages/language-service/test/signal_input_refactoring_action_spec.ts` L344–381 （▶ の行: 346, 349–351, 361, 365–366, 373, 377）

```ts
344 │       const project = createModuleAndProjectWithDeclarations(env, 'test', files);
345 │       const appFile = project.openFile('app.ts');
346 ▶       appFile.moveCursorToText('App¦Component');
347 │       const refactorings = project.getRefactoringsAtPosition('app.ts', appFile.cursor);
348 │ 
349 ▶       expect(refactorings.length).toBe(2);
350 ▶       expect(refactorings[0].name).toBe('convert-full-class-to-signal-inputs-safe-mode');
351 ▶       expect(refactorings[1].name).toBe('convert-full-class-to-signal-inputs-best-effort-mode');
352 │ 
353 │       const result = await project.applyRefactoring(
354 │         'app.ts',
355 │         appFile.cursor,
356 │         refactorings[0].name,
357 │         () => {},
358 │       );
359 │ 
360 │       expect(result).toBeDefined();
361 ▶       expect(result?.warningMessage).toContain('1 input could not be migrated.');
362 │       expect(result?.warningMessage).toContain(
363 │         'click on the skipped inputs and try to migrate individually.',
364 │       );
365 ▶       expect(result?.warningMessage).toContain('action to forcibly convert.');
366 ▶       expect(result?.errorMessage).toBe(undefined);
367 │       expect(result?.edits).toEqual([
368 │         {
369 │           fileName: project.getAbsFileName('app.ts'),
370 │           textChanges: [
371 │             // Input declarations.
372 │             {
373 ▶               newText: 'readonly bla = input(true);',
374 │               span: {start: 135, length: '@Input() bla = true;'.length},
375 │             },
376 │             // Import (since there is just a single input).
377 ▶             {newText: '{Directive, Input, input}', span: {start: 18, length: 18}},
378 │           ],
379 │         },
380 │       ]);
381 │     });
```

346 行目でカーソルをクラスの名前に置くと、349〜351 行目のとおりクラス単位の 2 つだけが出ます（3 節の 61〜64 行目）。当てると 361 行目の警告で、366 行目のとおりエラーは無く、373 行目で `bla` だけが書き換わります。377 行目の import の書き換えが `{Directive, Input, input}` なのは、まだ `bla2` が `Input` を使っているからです（入力が 1 つだけの it「should compute edits for migration」では、`Input` が要らなくなるので `{Directive, input}`）。

### 手元で走らせた結果

📄 `ターミナル（~/angular-research/angular で）`

```
$ pnpm bazel test //packages/language-service/test:test \
    --nocache_test_results --test_output=all '--test_arg=--filter=Signal input refactoring action'
(shard 3 of 4) Ran 3 of 679 specs / 3 specs, 0 failures
(shard 4 of 4) Ran 3 of 679 specs / 3 specs, 0 failures
(shard 1 of 4) Ran 3 of 679 specs / 3 specs, 0 failures
(shard 2 of 4) Ran 4 of 680 specs / 4 specs, 0 failures
//packages/language-service/test:test                                    PASSED in 2.0s
  Stats over 4 runs: max = 2.0s, min = 1.9s, avg = 1.9s, dev = 0.1s
```

- describe の名前 `Signal input refactoring action` で 3・3・3・4 本、合計 13 本が通りました（PASSED in 2.0s。ログは scratchpad/ls-logs/e-signal-input.log）。この spec は本物の `SignalInputMigration` を言語サービスのテスト用の仮想のプロジェクトの上で走らせています。
- core のマイグレーションそのものの spec は packages/core/schematics の側にあります。言語サービスの spec が確かめているのは、候補の出方・文・編集の形です。

### 直すとしたら

- 候補が出る・出ない：individual\_input\_refactoring.ts・full\_class\_input\_refactoring.ts の `isApplicable`（クエリは同じ名前の queries 側）。spec は `getRefactoringsAtPosition` の数と名前を見る it。
- 理由の文・エラーか警告か：apply\_input\_refactoring.ts 74〜158 行目（クエリは apply\_query\_refactoring.ts）。文そのものは core の incompatibility\_human.ts で、CLI のマイグレーションと共用です。
- 何を移行できないと判断するか：core の signal-migration の passes/ で、言語サービスではありません。直したら core の spec と、この 2 つの spec の両方を走らせます。
- 4 節の 91 行目の `=== null`：`getParentClassDeclaration` の戻り値とは合っていません。届かない分岐なので振る舞いは変わりませんが、issue や PR を探しても見つからなかった（2026-11-03、`gh search` で「Could not find a class for the refactoring」）ので、読むときの注意として書いておきます。

## 聞かれそうな質問

**Q. リファクタリングの候補を出すだけで、マイグレーションが走りますか？**

走りません。候補の段（language\_service.ts 812〜814 行目）は 8 つの `isApplicable` を呼ぶだけで、AST とデコレータを見るだけです。マイグレーションは押されたあと、サーバーの `onCodeActionResolve`（code\_actions.ts 124 行目）から `applyRefactoring` を経て初めて走ります。

**Q. safe と「forcibly, ignoring errors」は何が違いますか？**

config の `bestEffortMode` だけです（individual\_input\_refactoring.ts 114・119 行目）。best-effort では core の `filterIncompatibilitiesForBestEffortMode`（best\_effort\_mode.ts 16〜22 行目）がクラス単位の理由と、無視できるメンバーの理由を消します。get / set の入力などの 5 つ（incompatibility.ts 37〜47 行目）は消えないので、forcibly でも変わりません。

**Q. 1 つだけ変えるとき、テンプレートの読み出しも直りますか？**

直ります。core のマイグレーションはテンプレートの中の参照も集めて書き換えるので、`replacements` にはテンプレートの編集も入り、apply\_input\_refactoring.ts 137〜149 行目でファイルごとの編集になります。言語サービスはプログラムを作り直さず、今の `NgCompiler` を渡しています（46・47 行目）。

**Q. クラス単位で一部だけ変えられなかったら、どうなりますか？**

変えられたものは編集され、変えられなかったものは警告にまとまります（apply\_input\_refactoring.ts 151〜156 行目）。1 つずつのときは 130〜135 行目で、1 つでも駄目なら編集は空になりエラーです。spec の 361〜380 行目がクラス単位の形です。

**Q. ほかのマイグレーション（inject など）も電球から使えますか？**

今は使えません。`allRefactorings`（refactoring.ts 78〜89 行目）にあるのは入力とクエリの 8 つだけです。それを広げたいという要望が #63903 で、PR はまだありません（9 節）。

## 読み終えて

- リファクタリングは「候補を出す」と「押されたら編集を作る」の 2 段。候補は `isApplicable` で AST とデコレータだけを見る。
- 押されると、CLI のマイグレーションと同じ `SignalInputMigration` を、言語サービスの今の `NgCompiler` とプログラムの上で 1 回走らせる。違いは `shouldMigrateInput` で「どれを変えるか」を絞ることだけ。
- 移行できない理由は core の 16 個の列挙で決まり、5 つは best-effort でも消えない。文は core の incompatibility\_human.ts のもの。
- 1 つずつは全か無か（エラー）、クラス単位は一部だけでも進む（警告）。サーバーは進み具合を流し、文をメッセージの窓に出す。
- 電球から使えるマイグレーションは入力とクエリの 2 種類だけ。広げる要望が #63903。

---

← 前: [コード修正：診断から直し方を出す](18-ls-code-fixes.md)  
次: [issue と PR を読む：言語サービスの今](20-ls-issues.md) →
