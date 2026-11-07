[目次](../README.md) › [言語サービスの内側](README.md) › 第 18 回 / 全 20 回

# コード修正：診断から直し方を出す

> codefixes/ の 5 つの修正（存在しないメンバーを足す・\[(x)\] の書き間違い・import の足し忘れ・使っていない standalone の import・必須の入力の欠落）が、エラー番号から CodeActionMeta を選び、修正の編集を作る仕組み。getCodeFixesAtPosition と getCombinedCodeFix、サーバーの handlers/code\_actions.ts。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ls-code-fixes)

---

テンプレートの赤い波線の上で Ctrl+. を押すと「Import BarComponent from './bar' on FooComponent」や「fix invalid banana-in-box」が出ます。この章では、診断の**エラー番号**から修正の部品（`CodeActionMeta`）を選ぶ仕組みと、5 つの修正がそれぞれどの位置にどんな文字列を書き込む編集を作るのかを、codefixes/ の行で 1 つずつ追います。「1 つだけ直す」と「ファイルの中の同じ誤りを全部直す」がどう分かれ、LSP サーバーがそれを VS Code にどう渡すかも見ます。

読む対象は `packages/language-service/src/codefixes/` の 9 ファイル、`utils/ts_utils.ts` の import を足す関数、`language_service.ts` の 3 つのメソッド、`vscode-ng-language-service/server/src/handlers/code_actions.ts` です。

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
18. **18. コード修正**（この章）
19. [19. リファクタリング](19-ls-refactorings.md)
20. [20. issue と PR を読む](20-ls-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> TypeScript の言語サービスでは、修正の 1 件を `ts.CodeFixAction` と呼びます。中身は説明の文（`description`）と、ファイルごとの文字の置き換えの一覧（`changes: FileTextChanges[]`。「何文字目から何文字を、この文字列に」）です。`fixId` と `fixAllDescription` が付いていると、エディタは「同じ種類の誤りを全部直す」も出せます。その全部直す編集は `getCombinedCodeFix(scope, fixId)` で別に聞きます。

## 1. 入口：エラー番号で先に振り落とす

📄 `angular/packages/language-service/src/language_service.ts` L636–673 （▶ の行: 636–637, 652–653, 656–657, 660, 662, 667）

```ts
636 ▶   hasCodeFixesForErrorCode(errorCode: number): boolean {
637 ▶     return this.codeFixes.hasFixForCode(errorCode);
638 │   }
639 │ 
640 │   getCodeFixesAtPosition(
641 │     fileName: string,
642 │     start: number,
643 │     end: number,
644 │     errorCodes: readonly number[],
645 │     formatOptions: ts.FormatCodeSettings,
646 │     preferences: ts.UserPreferences,
647 │   ): readonly ts.CodeFixAction[] {
648 │     return this.withCompilerAndPerfTracing<readonly ts.CodeFixAction[]>(
649 │       PerfPhase.LsCodeFixes,
650 │       (compiler) => {
651 │         // Fast exit if we know no code fix can exist for the given range/and error codes.
652 ▶         if (errorCodes.every((code) => !this.hasCodeFixesForErrorCode(code))) {
653 ▶           return [];
654 │         }
655 │ 
656 ▶         const diags = this.getSemanticDiagnostics(fileName);
657 ▶         if (diags.length === 0) {
658 │           return [];
659 │         }
660 ▶         return this.codeFixes.getCodeFixesAtPosition(
661 │           fileName,
662 ▶           getTypeCheckInfoAtPosition(fileName, start, compiler) ?? null,
663 │           compiler,
664 │           start,
665 │           end,
666 │           errorCodes,
667 ▶           diags,
668 │           formatOptions,
669 │           preferences,
670 │         );
671 │       },
672 │     );
673 │   }
```

1. **636・637 行目：hasCodeFixesForErrorCode**

   エラー番号に修正が登録されているかだけを答えます。このメソッドの JSDoc のコメントのとおり、LSP サーバーが「この番号なら聞く意味があるか」を素早く決めるための口です。
2. **652・653 行目：どの番号にも修正が無ければ、診断を作らずに終わる**

   656 行目の `getSemanticDiagnostics` は型チェックを走らせるので重い処理です。その前に番号だけで振り落とします。
3. **656〜659 行目：ファイルの診断を全部取る**

   修正そのものはカーソルの位置だけで作りますが、「同じ種類の誤りが他にもあるか」（2 節の `isFixAllAvailable`）を数えるために、ファイルの全部の診断が要ります（診断の作り方は[第 8 回](08-ls-diagnostics.md)）。
4. **660〜670 行目：CodeFixes に渡す**

   662 行目の `getTypeCheckInfoAtPosition` は、位置を含むテンプレートの `nodes`（R3 AST）とコンポーネントのクラス（`declaration`）の組を返します。見つからなければ undefined が返り、662 行目の `??` で null にして渡します。

📄 `angular/packages/language-service/src/language_service.ts` L675–698 （▶ の行: 684, 688, 690, 692）

```ts
675 │   getCombinedCodeFix(
676 │     scope: ts.CombinedCodeFixScope,
677 │     fixId: string,
678 │     formatOptions: ts.FormatCodeSettings,
679 │     preferences: ts.UserPreferences,
680 │   ): ts.CombinedCodeActions {
681 │     return this.withCompilerAndPerfTracing<ts.CombinedCodeActions>(
682 │       PerfPhase.LsCodeFixesAll,
683 │       (compiler) => {
684 ▶         const diags = this.getSemanticDiagnostics(scope.fileName);
685 │         if (diags.length === 0) {
686 │           return {changes: []};
687 │         }
688 ▶         return this.codeFixes.getAllCodeActions(
689 │           compiler,
690 ▶           diags,
691 │           scope,
692 ▶           fixId,
693 │           formatOptions,
694 │           preferences,
695 │         );
696 │       },
697 │     );
698 │   }
```

「全部直す」は位置を取りません。684 行目でファイルの診断を全部取り、688 行目で `fixId` と一緒に渡すだけです。

📄 `angular/packages/language-service/src/ts_plugin.ts` L299–303 （▶ の行: 300–302）

```ts
299 │       // If TS could answer the query, then return that result. Otherwise, return from Angular LS.
300 ▶       return tsLsCodeFixes.length > 0
301 ▶         ? tsLsCodeFixes
302 ▶         : ngLS.getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences);
303 │     }
```

tsserver のプラグイン（[第 4 回](04-ls-ts-plugin.md)）では、TS ファイルについて先に TypeScript の修正を聞き、300〜302 行目のとおり**TypeScript が 1 件でも返したらそれだけを返し**、0 件のときだけ Angular の修正を聞きます。.html のとき（と `angularOnly` のとき）は最初から Angular だけです。

## 2. CodeActionMeta と CodeFixes：番号から部品を引く表

📄 `angular/packages/language-service/src/codefixes/utils.ts` L52–57 （▶ の行: 53–56）

```ts
52 │ export interface CodeActionMeta {
53 ▶   errorCodes: Array<number>;
54 ▶   getCodeActions: (context: CodeActionContext) => readonly ts.CodeFixAction[];
55 ▶   fixIds: FixIdForCodeFixesAll[];
56 ▶   getAllCodeActions: (context: CodeFixAllContext) => ts.CombinedCodeActions;
57 │ }
```

1 つの修正の部品は 4 つの欄だけです。53 行目の `errorCodes`（受け持つエラー番号）、54 行目の `getCodeActions`（1 件の修正を作る）、55 行目の `fixIds`（全部直すときの名前）、56 行目の `getAllCodeActions`（全部直す編集を作る）。

📄 `angular/packages/language-service/src/codefixes/all_codefixes_metas.ts` L9–22 （▶ の行: 16–21）

```ts
 9 │ import {fixInvalidBananaInBoxMeta} from './fix_invalid_banana_in_box';
10 │ import {missingImportMeta} from './fix_missing_import';
11 │ import {missingMemberMeta} from './fix_missing_member';
12 │ import {fixUnusedStandaloneImportsMeta} from './fix_unused_standalone_imports';
13 │ import {fixMissingRequiredInput} from './fix_missing_required_inputs';
14 │ import {CodeActionMeta} from './utils';
15 │ 
16 ▶ export const ALL_CODE_FIXES_METAS: CodeActionMeta[] = [
17 ▶   missingMemberMeta,
18 ▶   fixInvalidBananaInBoxMeta,
19 ▶   missingImportMeta,
20 ▶   fixUnusedStandaloneImportsMeta,
21 ▶   fixMissingRequiredInput,
22 │ ];
```

📄 `angular/packages/language-service/src/codefixes/code_fixes.ts` L16–45 （▶ の行: 17–18, 25, 28, 30, 32–33, 36, 38, 44）

```ts
16 │ export class CodeFixes {
17 ▶   private errorCodeToFixes = new Map<number, CodeActionMeta[]>();
18 ▶   private fixIdToRegistration = new Map<FixIdForCodeFixesAll, CodeActionMeta>();
19 │ 
20 │   constructor(
21 │     private readonly tsLS: ts.LanguageService,
22 │     readonly codeActionMetas: CodeActionMeta[],
23 │   ) {
24 │     for (const meta of codeActionMetas) {
25 ▶       for (const err of meta.errorCodes) {
26 │         let errMeta = this.errorCodeToFixes.get(err);
27 │         if (errMeta === undefined) {
28 ▶           this.errorCodeToFixes.set(err, (errMeta = []));
29 │         }
30 ▶         errMeta.push(meta);
31 │       }
32 ▶       for (const fixId of meta.fixIds) {
33 ▶         if (this.fixIdToRegistration.has(fixId)) {
34 │           // https://github.com/microsoft/TypeScript/blob/28dc248e5c500c7be9a8c3a7341d303e026b023f/src/services/codeFixProvider.ts#L28
35 │           // In ts services, only one meta can be registered for a fixId.
36 ▶           continue;
37 │         }
38 ▶         this.fixIdToRegistration.set(fixId, meta);
39 │       }
40 │     }
41 │   }
42 │ 
43 │   hasFixForCode(code: number): boolean {
44 ▶     return this.errorCodeToFixes.has(code);
45 │   }
```

コンストラクタで 2 つの表を作ります。17 行目の `errorCodeToFixes` は「エラー番号 → 部品の配列」、18 行目の `fixIdToRegistration` は「fixId → 部品 1 つ」です。33〜37 行目、同じ fixId が 2 回来たら**先に登録したほうを残します**。34 行目のコメントのとおり、TypeScript の codeFixProvider と同じ決まりです。44 行目の `hasFixForCode` は 1 節の 637 行目が呼ぶもので、表を引くだけです。

| 部品 | 受け持つ番号 | fixIds | 全部直す |
| --- | --- | --- | --- |
| missingMemberMeta | TS2551（〜ではありません。〜のことですか）・TS2339（プロパティがありません） | fixSpelling・fixMissingMember | TypeScript に任せる |
| fixInvalidBananaInBoxMeta | NG8101（-998101） | fixInvalidBananaInBox | あり |
| missingImportMeta | NG8001（-998001、知らない要素）・NG8004（-998004、知らない pipe） | fixMissingImport | 空を返す（TODO） |
| fixUnusedStandaloneImportsMeta | NG8113（-998113） | fixUnusedStandaloneImports | あり |
| fixMissingRequiredInput | NG8008（-998008） | fixMissingRequiredInputs | 空を返す |

NG の番号が負の 6 桁になるのは `ngErrorCode`（compiler-cli の diagnostics/src/util.ts）が `-(99 × 10^桁数 + 番号)` に変えるからです。TypeScript の番号と重ならないようにする印で、表示するときに `TS-99` を `NG` に置き換えます。

### getCodeFixesAtPosition：部品を順に呼び、fixId を付けるか決める

📄 `angular/packages/language-service/src/codefixes/code_fixes.ts` L62–92 （▶ の行: 63–64, 68–69, 80–85）

```ts
62 │     const codeActions: ts.CodeFixAction[] = [];
63 ▶     for (const code of errorCodes) {
64 ▶       const metas = this.errorCodeToFixes.get(code);
65 │       if (metas === undefined) {
66 │         continue;
67 │       }
68 ▶       for (const meta of metas) {
69 ▶         const codeActionsForMeta = meta.getCodeActions({
70 │           fileName,
71 │           typeCheckInfo: typeCheckInfo,
72 │           compiler,
73 │           start,
74 │           end,
75 │           errorCode: code,
76 │           formatOptions,
77 │           preferences,
78 │           tsLs: this.tsLS,
79 │         });
80 ▶         const fixAllAvailable = isFixAllAvailable(meta, diagnostics);
81 ▶         const removeFixIdForCodeActions = codeActionsForMeta.map(
82 ▶           ({fixId, fixAllDescription, ...codeActionForMeta}) => {
83 ▶             return fixAllAvailable
84 ▶               ? {...codeActionForMeta, fixId, fixAllDescription}
85 ▶               : codeActionForMeta;
86 │           },
87 │         );
88 │         codeActions.push(...removeFixIdForCodeActions);
89 │       }
90 │     }
91 │     return codeActions;
92 │   }
```

📄 `angular/packages/language-service/src/codefixes/utils.ts` L120–133 （▶ の行: 124, 128–129）

```ts
120 │ /**
121 │  * 'fix all' is only available when there are multiple diagnostics that the code action meta
122 │  * indicates it can fix.
123 │  */
124 ▶ export function isFixAllAvailable(meta: CodeActionMeta, diagnostics: ts.Diagnostic[]) {
125 │   const errorCodes = meta.errorCodes;
126 │   let maybeFixableDiagnostics = 0;
127 │   for (const diag of diagnostics) {
128 ▶     if (errorCodes.includes(diag.code)) maybeFixableDiagnostics++;
129 ▶     if (maybeFixableDiagnostics > 1) return true;
130 │   }
131 │ 
132 │   return false;
133 │ }
```

1. **63・64 行目：エディタが渡したエラー番号ごとに、表を引く**

   1 つの番号に部品が複数あれば全部呼びます（今は番号と部品が 1 対 1）。
2. **69 行目：部品の getCodeActions を呼ぶ**

   渡すのは位置・型チェックの情報・`NgCompiler`・TypeScript の言語サービス（`tsLs`）などをまとめた `CodeActionContext` です。
3. **80〜87 行目：同じ種類の誤りが 2 つ以上あるときだけ fixId を残す**

   `isFixAllAvailable`（124〜133 行目）は、ファイルの診断のうち部品の番号に当たるものを数え、2 つ目が見つかった時点で true を返します。1 つしかなければ 82 行目で `fixId` と `fixAllDescription` を外すので、エディタに「全部直す」は出ません。

📄 `angular/packages/language-service/src/codefixes/code_fixes.ts` L99–123 （▶ の行: 107–108, 113, 121）

```ts
 99 │   getAllCodeActions(
100 │     compiler: NgCompiler,
101 │     diagnostics: ts.Diagnostic[],
102 │     scope: ts.CombinedCodeFixScope,
103 │     fixId: string,
104 │     formatOptions: ts.FormatCodeSettings,
105 │     preferences: ts.UserPreferences,
106 │   ): ts.CombinedCodeActions {
107 ▶     const meta = this.fixIdToRegistration.get(fixId as FixIdForCodeFixesAll);
108 ▶     if (meta === undefined) {
109 │       return {
110 │         changes: [],
111 │       };
112 │     }
113 ▶     return meta.getAllCodeActions({
114 │       compiler,
115 │       fixId,
116 │       formatOptions,
117 │       preferences,
118 │       tsLs: this.tsLS,
119 │       scope,
120 │       // only pass the diagnostics the `meta` cares about.
121 ▶       diagnostics: diagnostics.filter((diag) => meta.errorCodes.includes(diag.code)),
122 │     });
123 │   }
```

全部直すほうは、107 行目で fixId から部品を 1 つ引き、121 行目でその部品の番号の診断だけに絞って渡します。

📄 `angular/packages/language-service/src/codefixes/utils.ts` L135–142 （▶ の行: 136–137）

```ts
135 │ export enum FixIdForCodeFixesAll {
136 ▶   FIX_SPELLING = 'fixSpelling',
137 ▶   FIX_MISSING_MEMBER = 'fixMissingMember',
138 │   FIX_INVALID_BANANA_IN_BOX = 'fixInvalidBananaInBox',
139 │   FIX_MISSING_IMPORT = 'fixMissingImport',
140 │   FIX_UNUSED_STANDALONE_IMPORTS = 'fixUnusedStandaloneImports',
141 │   FIX_MISSING_REQUIRED_INPUTS = 'fixMissingRequiredInputs',
142 │ }
```

136・137 行目の 2 つは TypeScript 自身の fixId と同じ文字列です。次の節のとおり、存在しないメンバーの修正は TypeScript に作らせるので、全部直すときも TypeScript の fixId で頼みます。

## 3. 存在しないメンバー：TCB の上で TypeScript に直させる

📄 `angular/packages/language-service/src/codefixes/fix_missing_member.ts` L16–19 （▶ の行: 17–18）

```ts
16 │ const errorCodes: number[] = [
17 ▶   2551, // https://github.com/microsoft/TypeScript/blob/8e6e87fea6463e153822e88431720f846c3b8dfa/src/compiler/diagnosticMessages.json#L2493
18 ▶   2339, // https://github.com/microsoft/TypeScript/blob/8e6e87fea6463e153822e88431720f846c3b8dfa/src/compiler/diagnosticMessages.json#L1717
19 │ ];
```

📄 `angular/packages/language-service/src/codefixes/fix_missing_member.ts` L36–69 （▶ の行: 39, 43, 49–52, 54, 66）

```ts
36 │     if (typeCheckInfo === null) {
37 │       return [];
38 │     }
39 ▶     const tcb = compiler.getTemplateTypeChecker().getTypeCheckBlock(typeCheckInfo.declaration);
40 │     if (tcb === null) {
41 │       return [];
42 │     }
43 ▶     const tcbNodesInfo = getTcbNodesOfTemplateAtPosition(typeCheckInfo.nodes, start, tcb);
44 │     if (tcbNodesInfo === null) {
45 │       return [];
46 │     }
47 │ 
48 │     const codeActions: ts.CodeFixAction[] = [];
49 ▶     for (const tcbNode of tcbNodesInfo.nodes) {
50 ▶       const tsLsCodeActions = tsLs.getCodeFixesAtPosition(
51 ▶         tcb.getSourceFile().fileName,
52 ▶         tcbNode.getStart(),
53 │         tcbNode.getEnd(),
54 ▶         [errorCode],
55 │         formatOptions,
56 │         preferences,
57 │       );
58 │       codeActions.push(...tsLsCodeActions);
59 │     }
60 │     return codeActions.map((codeAction) => {
61 │       return {
62 │         fixName: codeAction.fixName,
63 │         fixId: codeAction.fixId,
64 │         fixAllDescription: codeAction.fixAllDescription,
65 │         description: codeAction.description,
66 ▶         changes: convertFileTextChangeInTcb(codeAction.changes, compiler),
67 │         commands: codeAction.commands,
68 │       };
69 │     });
```

1. **39 行目：コンポーネントの TCB を取る**

   `{{ title }}` の `title` がクラスに無いという診断は、TCB（テンプレートを TypeScript に訳した関数。[型チェックのシリーズ](../typecheck/01-typecheck-overview.md)）の `this.title` に TypeScript が出した TS2339 です。
2. **43 行目：テンプレートの位置に対応する TCB のノードを探す**

   `getTcbNodesOfTemplateAtPosition` は、カーソルのあるテンプレートのノードの TCB の中の位置（位置コメント）を探して ts のノードを返します（[第 7 回](07-ls-template-target.md)）。
3. **49〜58 行目：TCB のファイルの上で、TypeScript の getCodeFixesAtPosition を呼ぶ**

   51 行目のファイル名は TCB の入った型チェック用のファイルです。TypeScript は「`title1` のことですか」（綴りの修正）と「クラスに `title: any;` を足す」を、TCB とコンポーネントのファイルへの編集として返します。
4. **66 行目：TCB への編集を、テンプレートへの編集に直す**

   綴りの修正は TCB の `this.title` を書き換える編集なので、そのままでは使えません。次の `convertFileTextChangeInTcb` で位置を戻します。

📄 `angular/packages/language-service/src/codefixes/utils.ts` L68–107 （▶ の行: 69–70, 77–80, 86–89, 96–97, 100–101）

```ts
 68 │   for (const fileTextChange of changes) {
 69 ▶     if (!ttc.isTrackedTypeCheckFile(absoluteFrom(fileTextChange.fileName))) {
 70 ▶       fileTextChanges.push(fileTextChange);
 71 │       continue;
 72 │     }
 73 │     const textChanges: ts.TextChange[] = [];
 74 │     let fileName: string | undefined;
 75 │     const seenTextChangeInTemplate = new Set<string>();
 76 │     for (const textChange of fileTextChange.textChanges) {
 77 ▶       const sourceLocation = ttc.getSourceMappingAtTcbLocation({
 78 ▶         tcbPath: absoluteFrom(fileTextChange.fileName),
 79 ▶         isShimFile: true,
 80 ▶         positionInFile: textChange.span.start,
 81 │       });
 82 │       if (sourceLocation === null) {
 83 │         continue;
 84 │       }
 85 │       const mapping = sourceLocation.sourceMapping;
 86 ▶       if (mapping.type === 'external') {
 87 ▶         fileName = mapping.templateUrl;
 88 ▶       } else if (mapping.type === 'direct') {
 89 ▶         fileName = mapping.node.getSourceFile().fileName;
 90 │       } else {
 91 │         continue;
 92 │       }
 93 │       const start = sourceLocation.span.start.offset;
 94 │       const length = sourceLocation.span.end.offset - sourceLocation.span.start.offset;
 95 │       const changeSpanKey = `${start},${length}`;
 96 ▶       if (seenTextChangeInTemplate.has(changeSpanKey)) {
 97 ▶         continue;
 98 │       }
 99 │       seenTextChangeInTemplate.add(changeSpanKey);
100 ▶       textChanges.push({
101 ▶         newText: textChange.newText,
102 │         span: {
103 │           start,
104 │           length,
105 │         },
106 │       });
107 │     }
```

69・70 行目、型チェック用のファイルでなければ（コンポーネントの .ts に `title: any;` を足す編集など）そのまま通します。TCB への編集は、77〜81 行目の `getSourceMappingAtTcbLocation` で TCB の位置からテンプレートの位置へ戻し（[診断の対応付け](../typecheck/16-typecheck-diagnostics-mapping.md)と同じ仕組み）、外部テンプレートなら .html のファイル名、インラインなら .ts のファイル名に付け替えます（86〜89 行目）。96〜99 行目、同じテンプレートの範囲への編集が 2 つ来たら 1 つにします。TCB では同じ式が 2 か所に出ることがあるからです。

## 4. \[(x)\] の書き間違い：BoundEvent の文字列を組み替える

📄 `angular/packages/language-service/src/codefixes/fix_invalid_banana_in_box.ts` L21–44 （▶ の行: 22, 25, 29, 33, 35, 39）

```ts
21 │ export const fixInvalidBananaInBoxMeta: CodeActionMeta = {
22 ▶   errorCodes: [ngErrorCode(ErrorCode.INVALID_BANANA_IN_BOX)],
23 │   getCodeActions({start, fileName, typeCheckInfo}) {
24 │     const boundEvent =
25 ▶       typeCheckInfo === null ? null : getTheBoundEventAtPosition(typeCheckInfo, start);
26 │     if (boundEvent === null) {
27 │       return [];
28 │     }
29 ▶     const textChanges = convertBoundEventToTsTextChange(boundEvent);
30 │     return [
31 │       {
32 │         fixName: FixIdForCodeFixesAll.FIX_INVALID_BANANA_IN_BOX,
33 ▶         fixId: FixIdForCodeFixesAll.FIX_INVALID_BANANA_IN_BOX,
34 │         fixAllDescription: 'fix all invalid banana-in-box',
35 ▶         description: `fix invalid banana-in-box for '${boundEvent.sourceSpan.toString()}'`,
36 │         changes: [
37 │           {
38 │             fileName,
39 ▶             textChanges,
40 │           },
41 │         ],
42 │       },
43 │     ];
44 │   },
```

📄 `angular/packages/language-service/src/codefixes/fix_invalid_banana_in_box.ts` L97–115 （▶ の行: 97, 102, 108–109, 114）

```ts
 97 ▶   // It's safe to get the bound event at the position `start + 1` because the `start` is at the
 98 │   // start of the diagnostic, and the node outside the attribute key and value spans are skipped by
 99 │   // the function `getTargetAtPosition`.
100 │   // https://github.com/angular/vscode-ng-language-service/blob/8553115972ca40a55602747667c3d11d6f47a6f8/server/src/session.ts#L220
101 │   // https://github.com/angular/angular/blob/4e10a7494130b9bb4772ee8f76b66675867b2145/packages/language-service/src/template_target.ts#L347-L356
102 ▶   const positionDetail = getTargetAtPosition(typeCheckInfo.nodes, start + 1);
103 │   if (positionDetail === null) {
104 │     return null;
105 │   }
106 │ 
107 │   if (
108 ▶     positionDetail.context.kind !== TargetNodeKind.AttributeInKeyContext ||
109 ▶     !(positionDetail.context.node instanceof TmplAstBoundEvent)
110 │   ) {
111 │     return null;
112 │   }
113 │ 
114 ▶   return positionDetail.context.node;
115 │ }
```

📄 `angular/packages/language-service/src/codefixes/fix_invalid_banana_in_box.ts` L117–134 （▶ の行: 121–123, 128–129, 131）

```ts
117 │ /**
118 │  * Flip the invalid "box in a banana" `([thing])` to the correct "banana in a box" `[(thing)]`.
119 │  */
120 │ function convertBoundEventToTsTextChange(node: TmplAstBoundEvent): readonly ts.TextChange[] {
121 ▶   const name = node.name;
122 ▶   const boundSyntax = node.sourceSpan.toString();
123 ▶   const expectedBoundSyntax = boundSyntax.replace(`(${name})`, `[(${name.slice(1, -1)})]`);
124 │ 
125 │   return [
126 │     {
127 │       span: {
128 ▶         start: node.sourceSpan.start.offset,
129 ▶         length: boundSyntax.length,
130 │       },
131 ▶       newText: expectedBoundSyntax,
132 │     },
133 │   ];
134 │ }
```

NG8101 は `([ngModel])="name"` のように括弧の順を逆に書いたときの拡張診断です（[拡張診断の章](../typecheck/18-typecheck-extended.md)）。パーサはこれを「名前が `[ngModel]` の出力（BoundEvent）」として読みます。102 行目で診断の始まりの 1 文字あとの位置からノードを探し（97〜101 行目のコメントのとおり、始まりちょうどだと属性の外と見なされることがある）、108・109 行目で属性の名前の部分にいる `BoundEvent` だけを受け付けます。123 行目、属性の全体の文字列（`([ngModel])="name"`）の中の `(名前)` を `[(名前の両端を落としたもの)]` に置き換え、128〜131 行目で同じ長さの範囲を置き換える 1 つの編集にします。この修正は TCB も TypeScript も使いません。テンプレートの AST だけで決まります。

## 5. import の足し忘れ：候補を探し、2 か所を書き換える

📄 `angular/packages/language-service/src/codefixes/fix_missing_import.ts` L28–46 （▶ の行: 29–30, 40–43）

```ts
28 │ const errorCodes: number[] = [
29 ▶   ngErrorCode(NgCompilerErrorCode.SCHEMA_INVALID_ELEMENT),
30 ▶   ngErrorCode(NgCompilerErrorCode.MISSING_PIPE),
31 │ ];
32 │ 
33 │ /**
34 │  * This code action will generate a new import for an unknown selector.
35 │  */
36 │ export const missingImportMeta: CodeActionMeta = {
37 │   errorCodes,
38 │   getCodeActions,
39 │   fixIds: [FixIdForCodeFixesAll.FIX_MISSING_IMPORT],
40 ▶   // TODO(dylhunn): implement "Fix All"
41 ▶   getAllCodeActions: ({tsLs, scope, fixId, formatOptions, preferences, compiler, diagnostics}) => {
42 ▶     return {
43 ▶       changes: [],
44 │     };
45 │   },
46 │ };
```

受け持つのは NG8001（知らない要素）と NG8004（知らない pipe）です。40〜45 行目、全部直すは TODO のまま空を返し、作る修正にも fixId を付けないので（下の 104 行目）、エディタに「全部直す」は出ません。

📄 `angular/packages/language-service/src/codefixes/fix_missing_import.ts` L53–82 （▶ の行: 55, 62, 65, 69, 72, 74, 77–79）

```ts
53 │   let codeActions: ts.CodeFixAction[] = [];
54 │   const checker = compiler.getTemplateTypeChecker();
55 ▶   const target = getTargetAtPosition(typeCheckInfo.nodes, start);
56 │   if (target === null) {
57 │     return [];
58 │   }
59 │ 
60 │   let matches: Set<PotentialDirective> | Set<PotentialPipe>;
61 │   if (
62 ▶     target.context.kind === TargetNodeKind.ElementInTagContext &&
63 │     target.context.node instanceof TmplAstElement
64 │   ) {
65 ▶     const allPossibleDirectives = checker.getPotentialTemplateDirectives(
66 │       typeCheckInfo.declaration,
67 │       tsLs,
68 │       {
69 ▶         includeExternalModule: preferences.includeCompletionsForModuleExports ?? false,
70 │       },
71 │     );
72 ▶     matches = getDirectiveMatchesForElementTag(target.context.node, allPossibleDirectives);
73 │   } else if (
74 ▶     target.context.kind === TargetNodeKind.RawExpression &&
75 │     target.context.node instanceof ASTWithName
76 │   ) {
77 ▶     const name = (target.context.node as any).name;
78 ▶     const allPossiblePipes = checker.getPotentialPipes(typeCheckInfo.declaration);
79 ▶     matches = new Set(allPossiblePipes.filter((p) => p.name === name));
80 │   } else {
81 │     return [];
82 │   }
```

1. **62〜72 行目：要素のタグの上なら、そのタグで当たるディレクティブ**

   65 行目の `getPotentialTemplateDirectives` は、今のスコープに無いものも含めて import できるディレクティブを集めます。69 行目、`includeCompletionsForModuleExports` が真なら node\_modules の export も含めます。72 行目の `getDirectiveMatchesForElementTag` は「タグ名 + 属性で当たるもの」から「属性だけで当たるもの」を引き、**タグ名があるから当たる**ものだけを残します（8 節のデモ）。
2. **73〜79 行目：pipe の名前の上なら、同じ名前の pipe**

   `{{ x | date }}` の `date` の上なら、`getPotentialPipes` から名前が同じものを選びます。

📄 `angular/packages/language-service/src/codefixes/fix_missing_import.ts` L84–111 （▶ の行: 85–86, 89, 91, 97–98, 104）

```ts
 84 │   // Find all possible importable directives with a matching selector.
 85 ▶   const importOn = standaloneTraitOrNgModule(checker, typeCheckInfo.declaration);
 86 ▶   if (importOn === null) {
 87 │     return [];
 88 │   }
 89 ▶   for (const currMatch of matches.values()) {
 90 │     const currentMatchCodeAction =
 91 ▶       getCodeActionToImportTheDirectiveDeclaration(
 92 │         compiler,
 93 │         typeCheckInfo.declaration,
 94 │         importOn,
 95 │         currMatch,
 96 │         tsLs,
 97 ▶         preferences.includeCompletionsForModuleExports,
 98 ▶         preferences,
 99 │       ) ?? [];
100 │ 
101 │     codeActions.push(
102 │       ...currentMatchCodeAction.map<ts.CodeFixAction>((action) => {
103 │         return {
104 ▶           fixName: FixIdForCodeFixesAll.FIX_MISSING_IMPORT,
105 │           ...action,
106 │         };
107 │       }),
108 │     );
109 │   }
110 │ 
111 │   return codeActions;
```

85 行目の `standaloneTraitOrNgModule` で、import を足す先を決めます。standalone のコンポーネントならそのクラス、NgModule に宣言されていればその NgModule です（どちらでもなければ null で修正なし）。89〜99 行目、候補ごとに `getCodeActionToImportTheDirectiveDeclaration` で 1 件の修正を作ります。98 行目の `preferences` は 0f0d52e9c11（2026-08-19）で足された引数で、下の引用符の好みに使います。

### 書き換える 1 か所目：ファイルの先頭の import 文

📄 `angular/packages/language-service/src/utils/ts_utils.ts` L380–410 （▶ の行: 382–385, 389, 392, 397, 404, 408）

```ts
380 │   // The trait might already be imported, possibly under a different name. If so, determine the
381 │   // local name of the imported trait.
382 ▶   const allImports = findAllMatchingNodes(file, {filter: ts.isImportDeclaration});
383 ▶   const existingImportName: string | null = hasImport(allImports, symbolName, moduleSpecifier);
384 ▶   if (existingImportName !== null) {
385 ▶     return [[], existingImportName];
386 │   }
387 │ 
388 │   // If the trait has not already been imported, we need to insert the new import.
389 ▶   const existingImportDeclaration = allImports.find(
390 │     (decl) => getStringLiteralText(decl.moduleSpecifier) === moduleSpecifier,
391 │   );
392 ▶   const importName = nonCollidingImportName(
393 │     allImports,
394 │     symbolName === 'default' ? declarationName : symbolName,
395 │   );
396 │ 
397 ▶   if (existingImportDeclaration !== undefined) {
398 │     // Update an existing import declaration.
399 │     const importClause = existingImportDeclaration.importClause;
400 │     if (importClause === undefined) {
401 │       return [[], ''];
402 │     }
403 │     let span = {start: importClause.getStart(), length: importClause.getWidth()};
404 ▶     const updatedBindings = updateImport(existingImportDeclaration, symbolName, importName);
405 │     if (updatedBindings === undefined) {
406 │       return [[], ''];
407 │     }
408 ▶     const importString = printNode(updatedBindings, file);
409 │     return [[{span, newText: importString}], importName];
410 │   }
```

1. **382〜386 行目：もう import してあれば、何も足さずにその名前を使う**

   別名で import してあれば、その別名を返します。
2. **389〜410 行目：同じモジュールからの import 文があれば、そこに足す**

   `import {FooComponent} from './foo';` があれば、import の節（`{…}` の部分）だけを印字し直して置き換えます。392 行目の `nonCollidingImportName` は、同じ名前がすでにあれば別の名前を選びます。

📄 `angular/packages/language-service/src/utils/ts_utils.ts` L412–432 （▶ の行: 414–415, 420, 423, 425, 429, 431）

```ts
412 │   // Find the last import in the file.
413 │   let lastImport: ts.ImportDeclaration | null = null;
414 ▶   file.forEachChild((child) => {
415 ▶     if (ts.isImportDeclaration(child)) lastImport = child;
416 │   });
417 │ 
418 │   // Generate a new import declaration, and insert it after the last import declaration, only
419 │   // looking at root nodes in the AST. If no import exists, place it at the start of the file.
420 ▶   let span: ts.TextSpan = {start: 0, length: 0};
421 │   if ((lastImport as any) !== null) {
422 │     // TODO: Why does the compiler insist this is null?
423 ▶     span.start = lastImport!.getStart() + lastImport!.getWidth();
424 │   }
425 ▶   const newImportDeclaration = generateImport(
426 │     symbolName,
427 │     importName,
428 │     moduleSpecifier,
429 ▶     shouldUseSingleQuotes(file, preferences),
430 │   );
431 ▶   const importString = '\n' + printNode(newImportDeclaration, file);
432 │   return [[{span, newText: importString}], importName];
```

無ければ新しい import 文を作ります。414・415 行目で最後の import 文を探し、423 行目でその直後に、import 文が 1 つも無ければ 420 行目の 0 文字目に差し込みます。429 行目の `shouldUseSingleQuotes` が、モジュール名を `'` と `"` のどちらで書くかを決めます。

📄 `angular/packages/language-service/src/utils/ts_utils.ts` L441–457 （▶ の行: 445, 448, 451–453, 456）

```ts
441 │ export function shouldUseSingleQuotes(
442 │   file: ts.SourceFile,
443 │   preferences: ts.UserPreferences | undefined,
444 │ ): boolean {
445 ▶   if (preferences?.quotePreference === 'single') {
446 │     return true;
447 │   }
448 ▶   if (preferences?.quotePreference === 'double') {
449 │     return false;
450 │   }
451 ▶   for (const statement of file.statements) {
452 ▶     if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
453 ▶       return file.text[statement.moduleSpecifier.getStart(file)] === `'`;
454 │     }
455 │   }
456 ▶   return false;
457 │ }
```

445・448 行目、`quotePreference` が `single` か `double` ならそれに従います。それ以外（`auto` か、設定が無い）は、451〜455 行目でファイルの**最初の import 文**のモジュール名の 1 文字目を見ます。import 文が無ければ 456 行目で `"` です。この関数ができる前は、`generateImport` がいつも `"` で書いていました（#67108、[第 20 回](20-ls-issues.md)）。なお LSP サーバーの `defaultPreferences` は `includeCompletionsForModuleExports` しか持たないので（[第 3 回](03-ls-server-session.md)）、VS Code の拡張から使うときは 451 行目からの推測の経路を通ります。

### 書き換える 2 か所目：デコレータの imports の配列

📄 `angular/packages/language-service/src/utils/ts_utils.ts` L493–528 （▶ の行: 493, 495, 497, 501–502, 504, 517, 523, 526, 528）

```ts
493 ▶   const oldImports = decoratorProps.properties.find((prop) => prop.name?.getText() === 'imports');
494 │ 
495 ▶   let updateRequired = true;
496 │   // Update the trait's imports.
497 ▶   const newDecoratorProps = updateObjectValueForKey(
498 │     decoratorProps,
499 │     'imports',
500 │     (oldValue?: ts.Expression) => {
501 ▶       if (oldValue && !ts.isArrayLiteralExpression(oldValue)) {
502 ▶         return oldValue;
503 │       }
504 ▶       const identifier = ts.factory.createIdentifier(importName);
505 │       const expression = forwardRefName
506 │         ? ts.factory.createCallExpression(ts.factory.createIdentifier(forwardRefName), undefined, [
507 │             ts.factory.createArrowFunction(
508 │               undefined,
509 │               undefined,
510 │               [],
511 │               undefined,
512 │               undefined,
513 │               identifier,
514 │             ),
515 │           ])
516 │         : identifier;
517 ▶       const newArr = ensureArrayWithIdentifier(importName, expression, oldValue);
518 │       updateRequired = newArr !== null;
519 │       return newArr!;
520 │     },
521 │   );
522 │ 
523 ▶   if (!updateRequired) {
524 │     return [];
525 │   }
526 ▶   const indentationNumber = guessIndentationInSingleLine(lastProp, lastProp.getSourceFile());
527 │   const indentationString = indentationNumber !== undefined ? ' '.repeat(indentationNumber) : '';
528 ▶   let indentationPrefix = ',\n' + indentationString;
```

📄 `angular/packages/language-service/src/utils/ts_utils.ts` L572–579 （▶ の行: 573–574, 577–578）

```ts
572 │       span: {
573 ▶         start: oldImports !== undefined ? oldImports.getStart() : lastTrailRangePos,
574 ▶         length: oldImports !== undefined ? oldImports.getEnd() - oldImports.getStart() : 0,
575 │       },
576 │       newText:
577 ▶         (oldImports !== undefined ? '' : indentationPrefix) +
578 ▶         printNode(newDecoratorProps, trait.getSourceFile()),
579 │     },
```

1. **493 行目：今の imports を探す**

   デコレータに渡したオブジェクトの中から、名前が `imports` のプロパティを探します。
2. **497〜521 行目：配列に名前を足した imports のプロパティを作る**

   `updateObjectValueForKey` は、コールバックが返した値で `imports: [...]` のプロパティ 1 つを新しく作ります。517 行目の `ensureArrayWithIdentifier` は、配列が無ければ新しく作り、すでに同じ名前があれば null を返して、523 行目で編集なしになります。501・502 行目、`imports` が配列の書き方でなければ（`imports: SHARED` のような変数）元の値をそのまま返します。このとき `updateRequired` は 495 行目の true のままなので、編集は作られ、`imports: SHARED` が同じ文字列で置き換わるだけになります。
3. **526〜528 行目：字下げを真似る**

   `guessIndentationInSingleLine`（utils/format.ts）が、最後のプロパティが行の先頭から何文字目で始まるかを数えます。`imports` を新しく足すときは `,\n` とこの字下げを前に付けます。
4. **573〜578 行目：置き換える範囲**

   `imports` があればその範囲を、無ければ最後のプロパティ（とその後ろの行コメント）の直後の 0 文字を置き換えます。新しい文字列は 578 行目で、上で作った `imports: [...]` のプロパティ 1 つを印字したものです（オブジェクト全体ではありません）。

📄 `angular/packages/language-service/src/utils/ts_utils.ts` L797–818 （▶ の行: 798, 804, 806, 808, 810, 815）

```ts
797 │     // Always update the trait import, although the TS import might already be present.
798 ▶     const traitImportChanges = updateImportsForAngularTrait(
799 │       compiler.getTemplateTypeChecker(),
800 │       importOn,
801 │       importName,
802 │       forwardRefName,
803 │     );
804 ▶     if (traitImportChanges.length === 0) continue;
805 │ 
806 ▶     let description = `Import ${importName}`;
807 │     if (potentialImport.moduleSpecifier !== undefined) {
808 ▶       description += ` from '${potentialImport.moduleSpecifier}' on ${importOn.name!.text}`;
809 │     }
810 ▶     codeActions.push({
811 │       description,
812 │       changes: [
813 │         {
814 │           fileName: importOn.getSourceFile().fileName,
815 ▶           textChanges: [...fileImportChanges, ...traitImportChanges],
816 │         },
817 │       ],
818 │     });
```

最後に 2 つの編集を 1 件の修正にまとめます。815 行目のとおり、import 文の編集とデコレータの編集は**同じファイル（`importOn` のファイル）への編集**として並びます。804 行目、デコレータの編集が作れなかった候補（すでに imports にある、など）は修正にしません。806・808 行目の説明が、エディタに出る「Import BarComponent from './bar' on FooComponent」です。

## 6. 使っていない standalone の import：配列から外す

📄 `angular/packages/language-service/src/codefixes/fix_unused_standalone_imports.ts` L20–59 （▶ の行: 21, 27–29, 31, 37, 50–51, 53）

```ts
20 │   getCodeActions: ({start, fileName, compiler}) => {
21 ▶     const file = compiler.programDriver.getProgram().getSourceFile(fileName) || null;
22 │ 
23 │     if (file === null) {
24 │       return [];
25 │     }
26 │ 
27 ▶     const node = findFirstMatchingNode(file, {
28 ▶       filter: (n): n is tss.Identifier =>
29 ▶         tss.isIdentifier(n) && start >= n.getStart() && start <= n.getEnd(),
30 │     });
31 ▶     const parent = node?.parent || null;
32 │ 
33 │     if (node === null || parent === null) {
34 │       return [];
35 │     }
36 │ 
37 ▶     if (isFullyUnusedArray(node, parent)) {
38 │       return [
39 │         {
40 │           fixName: FixIdForCodeFixesAll.FIX_UNUSED_STANDALONE_IMPORTS,
41 │           fixId: FixIdForCodeFixesAll.FIX_UNUSED_STANDALONE_IMPORTS,
42 │           fixAllDescription: `Remove all unused imports`,
43 │           description: `Remove all unused imports`,
44 │           changes: [
45 │             {
46 │               fileName,
47 │               textChanges: [
48 │                 {
49 │                   span: {
50 ▶                     start: parent.initializer.getStart(),
51 ▶                     length: parent.initializer.getWidth(),
52 │                   },
53 ▶                   newText: '[]',
54 │                 },
55 │               ],
56 │             },
57 │           ],
58 │         },
59 │       ];
```

📄 `angular/packages/language-service/src/codefixes/fix_unused_standalone_imports.ts` L164–174 （▶ の行: 170–172）

```ts
164 │ /** Checks whether a diagnostic was reported on a node where all imports are unused. */
165 │ function isFullyUnusedArray(
166 │   node: tss.Node,
167 │   parent: tss.Node,
168 │ ): parent is tss.PropertyAssignment & {initializer: tss.ArrayLiteralExpression} {
169 │   return (
170 ▶     tss.isPropertyAssignment(parent) &&
171 ▶     parent.name === node &&
172 ▶     tss.isArrayLiteralExpression(parent.initializer)
173 │   );
174 │ }
```

NG8113 の診断は 2 通りの場所に付きます。配列の中の 1 つが使われていなければその要素（`UnusedDirective`）に、全部が使われていなければ `imports` というプロパティ名にです。27〜30 行目でカーソルを含む識別子を探し、37 行目の `isFullyUnusedArray`（170〜172 行目：親がプロパティの代入で、その名前が自分で、値が配列）なら、50〜53 行目で値の全体を `[]` に置き換えます。21 行目、この修正は TCB を使わず、`programDriver` の今のプログラムの .ts ファイルだけを見ます。

📄 `angular/packages/language-service/src/codefixes/fix_unused_standalone_imports.ts` L60–88 （▶ の行: 60–61, 63, 71, 78–79, 81）

```ts
60 ▶     } else if (tss.isArrayLiteralExpression(parent)) {
61 ▶       const newArray = tss.factory.updateArrayLiteralExpression(
62 │         parent,
63 ▶         parent.elements.filter((el) => el !== node),
64 │       );
65 │ 
66 │       return [
67 │         {
68 │           fixName: FixIdForCodeFixesAll.FIX_UNUSED_STANDALONE_IMPORTS,
69 │           fixId: FixIdForCodeFixesAll.FIX_UNUSED_STANDALONE_IMPORTS,
70 │           fixAllDescription: `Remove all unused imports`,
71 ▶           description: `Remove unused import ${node.text}`,
72 │           changes: [
73 │             {
74 │               fileName,
75 │               textChanges: [
76 │                 {
77 │                   span: {
78 ▶                     start: parent.getStart(),
79 ▶                     length: parent.getWidth(),
80 │                   },
81 ▶                   newText: tss.createPrinter().printNode(tss.EmitHint.Unspecified, newArray, file),
82 │                 },
83 │               ],
84 │             },
85 │           ],
86 │         },
87 │       ];
88 │     }
```

要素が 1 つだけ使われていないときは、61〜64 行目でその要素を抜いた配列のノードを作り、81 行目で印字して、配列の全体（78・79 行目）を置き換えます。印字し直すので、配列の中の改行やコメントは TypeScript の printer の形に変わります。

## 7. 必須の入力の欠落：最後の属性のあとに \[名前\]="" を差し込む

📄 `angular/packages/language-service/src/codefixes/fix_missing_required_inputs.ts` L35–70 （▶ の行: 40, 47–49, 52, 66–69）

```ts
35 │   getCodeActions: function ({typeCheckInfo, start, compiler, fileName}: CodeActionContext) {
36 │     if (typeCheckInfo === null) {
37 │       return [];
38 │     }
39 │ 
40 ▶     const positionDetails = getTargetAtPosition(typeCheckInfo.nodes, start);
41 │     if (positionDetails === null) {
42 │       return [];
43 │     }
44 │ 
45 │     // For two-way bindings, we actually only need to be concerned with the bound attribute because
46 │     // the bindings in the template are written with the attribute name, not the event name.
47 ▶     const node =
48 ▶       positionDetails.context.kind === TargetNodeKind.TwoWayBindingContext
49 ▶         ? positionDetails.context.nodes[0]
50 │         : positionDetails.context.node;
51 │ 
52 ▶     if (!(node instanceof TmplAstElement || node instanceof TmplAstTemplate)) {
53 │       return [];
54 │     }
55 │ 
56 │     let tagName: string | null = null;
57 │     if (node instanceof TmplAstElement) {
58 │       tagName = node.name;
59 │     } else {
60 │       tagName = node.tagName;
61 │     }
62 │     if (tagName === null) {
63 │       return [];
64 │     }
65 │ 
66 ▶     let insertPosition = node.startSourceSpan.start.offset + tagName.length + 1;
67 ▶     const lastAttribute = findLastAttributeInTheElement(node);
68 ▶     if (lastAttribute !== null) {
69 ▶       insertPosition = lastAttribute.sourceSpan.end.offset;
70 │     }
```

📄 `angular/packages/language-service/src/codefixes/fix_missing_required_inputs.ts` L193–220 （▶ の行: 207, 210, 213）

```ts
193 │ /**
194 │  * If the last attribute is from the structural directive, it is skipped and returns
195 │  * the previous attribute.
196 │  */
197 │ function findLastAttributeInTheElement(
198 │   element: TmplAstElement | TmplAstTemplate,
199 │ ): TmplAstNode | null {
200 │   let lastAttribute: TmplAstNode | null = null;
201 │ 
202 │   const updateAttribute = (attr: TmplAstNode) => {
203 │     if (lastAttribute === null) {
204 │       lastAttribute = attr;
205 │       return;
206 │     }
207 ▶     if (attr.sourceSpan.end.offset < lastAttribute.sourceSpan.end.offset) {
208 │       return;
209 │     }
210 ▶     lastAttribute = attr;
211 │   };
212 │ 
213 ▶   const attrNodes = [...element.attributes, ...element.inputs, ...element.outputs];
214 │ 
215 │   for (const attr of attrNodes) {
216 │     updateAttribute(attr);
217 │   }
218 │ 
219 │   return lastAttribute;
220 │ }
```

1. **47〜50 行目：\[(x)\] の上でも要素を得る**

   `[(x)]` は入力と出力の 2 つのノードになるので、`TwoWayBindingContext` のときは 1 つ目（入力）を選びます。52 行目、要素か `<ng-template>` の上でなければ修正なしです。
2. **66〜70 行目：差し込む位置**

   属性が無ければ `<` + タグ名の直後。あれば最後の属性の終わりです。「最後」は `findLastAttributeInTheElement` が決め、213 行目で attributes・inputs・outputs を全部並べ、207 行目で**終わりの位置が一番後ろ**のものを選びます（書いた順の最後）。`*ngIf` などの `templateAttrs` は 213 行目の配列に入らないので、その後ろには差し込みません（193〜196 行目のコメント）。

📄 `angular/packages/language-service/src/codefixes/fix_missing_required_inputs.ts` L74–114 （▶ の行: 74, 81–82, 87, 94, 97–98, 103–104, 108）

```ts
 74 ▶     const symbol = ttc.getSymbolOfNode(node, typeCheckInfo.declaration);
 75 │     if (symbol === null) {
 76 │       return [];
 77 │     }
 78 │ 
 79 │     const codeActions: ts.CodeFixAction[] = [];
 80 │ 
 81 ▶     for (const dirSymbol of symbol.directives) {
 82 ▶       const directive = ttc.getTsSymbolOfSymbol(dirSymbol)?.valueDeclaration;
 83 │       if (!directive || !ts.isClassDeclaration(directive)) {
 84 │         continue;
 85 │       }
 86 │ 
 87 ▶       const meta = ttc.getDirectiveMetadata(directive);
 88 │       if (meta === null) {
 89 │         continue;
 90 │       }
 91 │ 
 92 │       const seenRequiredInputs = new Set<string>();
 93 │ 
 94 ▶       const boundAttrs = getBoundAttributes(meta, node);
 95 │       for (const attr of boundAttrs) {
 96 │         for (const {fieldName, required} of attr.inputs) {
 97 ▶           if (required) {
 98 ▶             seenRequiredInputs.add(fieldName);
 99 │           }
100 │         }
101 │       }
102 │ 
103 ▶       for (const input of meta.inputs) {
104 ▶         if (!input.required || seenRequiredInputs.has(input.classPropertyName)) {
105 │           continue;
106 │         }
107 │         const typeCheck = compiler.getCurrentProgram().getTypeChecker();
108 ▶         const memberSymbol = typeCheck.getPropertyOfType(
109 │           ttc.getTypeOfSymbol(dirSymbol)!,
110 │           input.classPropertyName,
111 │         );
112 │         if (memberSymbol === undefined) {
113 │           continue;
114 │         }
```

74 行目、要素の `getSymbolOfNode` で、その要素に当たっているディレクティブを得ます（[TemplateTypeChecker の章](../typecheck/19-typecheck-template-type-checker.md)）。ディレクティブごとに 87 行目でメタデータを取り、94〜101 行目で「もう書いてある必須の入力」を集め、103・104 行目で残りの必須の入力を 1 つずつ修正にします。108〜114 行目、クラスの型に同じ名前のプロパティが見つからない入力は飛ばします。

📄 `angular/packages/language-service/src/codefixes/fix_missing_required_inputs.ts` L116–147 （▶ の行: 119, 122–124, 130–131, 142–143, 145）

```ts
116 │         // As a general solution, always offer a property binding suggestion (e.g., `[inputName]=""`).
117 │         // This is the most versatile way for users to satisfy a required input,
118 │         // allowing them to bind to component properties or provide initial literal values.
119 ▶         const insertBoundText = `[${input.bindingPropertyName}]=""`;
120 │         codeActions.push({
121 │           fixName: FixIdForCodeFixesAll.FIX_MISSING_REQUIRED_INPUTS,
122 ▶           // fixId: FixIdForCodeFixesAll.FIX_MISSING_REQUIRED_INPUTS,
123 ▶           // fixAllDescription: '',
124 ▶           description: `Create ${insertBoundText} attribute for "${tagName}"`,
125 │           changes: [
126 │             {
127 │               fileName,
128 │               textChanges: [
129 │                 {
130 ▶                   span: ts.createTextSpan(insertPosition, 0),
131 ▶                   newText: ' ' + insertBoundText,
132 │                 },
133 │               ],
134 │             },
135 │           ],
136 │         });
137 │       }
138 │     }
139 │ 
140 │     return codeActions;
141 │   },
142 ▶   fixIds: [FixIdForCodeFixesAll.FIX_MISSING_REQUIRED_INPUTS],
143 ▶   getAllCodeActions: function () {
144 │     return {
145 ▶       changes: [],
146 │     };
147 │   },
```

119 行目、差し込む文字列はいつも `[入力名]=""` です。116〜118 行目のコメントのとおり、プロパティバインディングなら定数でもクラスのプロパティでも後から書けるからです。122・123 行目の `fixId` と `fixAllDescription` はコメントアウトされていて、143〜147 行目の全部直すも空を返します。fixIds には 142 行目で登録してあるのに、全部直すは出ません。

## 8. デモ：テンプレートの AST だけで決まる部分を動かす

> **🧪 import の候補・\[(x)\] の組み替え・必須の入力の差し込み位置**
>
> このサイトの @angular/compiler 22.1.6 の `parseTemplate`（共通部品の `parseLsTemplate`）と `CssSelector`・`SelectorMatcher` を使い、テンプレートの最初の要素について 3 つを出します（ボタンを押したときだけ）。import の候補は utils/index.ts の `getDirectiveMatchesForElementTag` の**簡略版**、残りの 2 つは 4 節の 120〜133 行目と 7 節の 66〜70・197〜220 行目の**書き写し**です。本物との違い：本物はディレクティブの一覧を `getPotentialTemplateDirectives` から、必須の入力をディレクティブのメタデータから取り、診断（NG8001・NG8101・NG8008）が出た位置でだけ動きます。ここではどちらも手で入れます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ls-code-fixes)

- 「import 忘れの候補」では、`TooltipDirective` は属性 `[tooltip]` だけで当たるので外れ、`ButtonComponent` と `AddButtonDirective` の 2 つが候補になります。`appAddButton` の属性を消すと `ButtonComponent` だけになります。#68522 のコメントで報告者が「quick fix がうまくいくのは、タグに当たるのがコンポーネントだけだから」と書いているのはこの形です（[第 20 回](20-ls-issues.md)）。
- 「(\[ngModel\]) の書き間違い」では、出力の名前が `[ngModel]` なので、`([ngModel])="name"` の `([ngModel])` の部分が `[(ngModel)]` に置き換わります。
- 「必須の入力を足す位置」では、書いた順の最後の `compact` の直後に ` [size]=""` が入ります。属性が改行されていても、差し込むのは同じ行の最後の属性のすぐ後ろです。

## 9. サーバー：QuickFix と「全部直す」を分けて返す

📄 `angular/vscode-ng-language-service/server/src/handlers/code_actions.ts` L56–85 （▶ の行: 57–59, 64, 68, 70, 75, 77–78, 80, 85）

```ts
56 │   const codeActions: ts.CodeFixAction[] = [];
57 ▶   for (const diagnostic of params.context.diagnostics) {
58 ▶     const errorCode = diagnostic.code;
59 ▶     if (typeof errorCode !== 'number') {
60 │       continue;
61 │     }
62 │     const start = lspPositionToTsPosition(lsInfo.scriptInfo, diagnostic.range.start);
63 │     const end = lspPositionToTsPosition(lsInfo.scriptInfo, diagnostic.range.end);
64 ▶     const codeActionsForDiagnostic = lsInfo.languageService.getCodeFixesAtPosition(
65 │       filePath,
66 │       start,
67 │       end,
68 ▶       [errorCode],
69 │       defaultFormatOptions,
70 ▶       session.defaultPreferences,
71 │     );
72 │     codeActions.push(...codeActionsForDiagnostic);
73 │   }
74 │ 
75 ▶   const individualCodeFixes = codeActions.map<lsp.CodeAction>((codeAction) => {
76 │     return {
77 ▶       title: codeAction.description,
78 ▶       kind: lsp.CodeActionKind.QuickFix,
79 │       diagnostics: params.context.diagnostics,
80 ▶       edit: tsFileTextChangesToLspWorkspaceEdit(codeAction.changes, (path: string) =>
81 │         session.projectService.getScriptInfo(path),
82 │       ),
83 │     };
84 │   });
85 ▶   const codeFixesAll = getCodeFixesAll(codeActions, params.textDocument);
```

1. **57〜73 行目：VS Code が渡した診断を 1 つずつ**

   LSP の `textDocument/codeAction` には、選んでいる範囲に重なる診断が付いてきます。診断ごとにその範囲と番号で `getCodeFixesAtPosition` を呼びます。59 行目、番号が文字列の診断（Angular 以外のもの）は飛ばします。
2. **75〜84 行目：1 件ずつの修正は、編集を中に入れて返す**

   80 行目で TypeScript の `FileTextChanges` を LSP の `WorkspaceEdit` に直します。種類は 78 行目の `QuickFix`。
3. **85 行目：全部直すは、編集を入れずに返す**

   下の `getCodeFixesAll` が、fixId の付いた修正から「全部直す」の項目を 1 つずつ作ります。

📄 `angular/vscode-ng-language-service/server/src/handlers/code_actions.ts` L203–226 （▶ の行: 210–211, 214–216, 220, 222）

```ts
203 │ export function getCodeFixesAll(
204 │   codeActions: readonly ts.CodeFixAction[],
205 │   document: lsp.TextDocumentIdentifier,
206 │ ): lsp.CodeAction[] {
207 │   const seenFixId = new Set<string>();
208 │   const lspCodeActions: lsp.CodeAction[] = [];
209 │   for (const codeAction of codeActions) {
210 ▶     const fixId = codeAction.fixId as string | undefined;
211 ▶     if (fixId === undefined || codeAction.fixAllDescription === undefined || seenFixId.has(fixId)) {
212 │       continue;
213 │     }
214 ▶     seenFixId.add(fixId);
215 ▶     const codeActionResolveData: CodeActionResolveData = {
216 ▶       fixId,
217 │       document,
218 │     };
219 │     lspCodeActions.push({
220 ▶       title: codeAction.fixAllDescription,
221 │       kind: lsp.CodeActionKind.QuickFix,
222 ▶       data: codeActionResolveData,
223 │     });
224 │   }
225 │   return lspCodeActions;
226 │ }
```

211 行目、fixId と fixAllDescription の両方があるものだけ、同じ fixId は 1 回だけです。222 行目、項目には編集（`edit`）が無く、`data` に fixId と文書だけを入れます。押されたときに初めて計算します。

📄 `angular/vscode-ng-language-service/server/src/handlers/code_actions.ts` L157–190 （▶ の行: 165–167, 174–177, 179, 186）

```ts
157 │   /**
158 │    * Now `@angular/language-service` only support quick fix, so the `onCodeAction` will return the
159 │    * `edit` of the `lsp.CodeAction` for the diagnostics in the range that the user selects except
160 │    * the fix all code actions.
161 │    *
162 │    * And the function `getCombinedCodeFix` only cares about the `fixId` and the `document`.
163 │    * https://github.com/microsoft/vscode/blob/8ba9963c2edb08d54f2b7221137d6f1de79ecc09/extensions/typescript-language-features/src/languageFeatures/quickFix.ts#L258
164 │    */
165 ▶   const isCodeFixesAll = codeActionResolve.fixId !== undefined;
166 ▶   if (!isCodeFixesAll) {
167 ▶     return param;
168 │   }
169 │   const filePath = uriToFilePath(codeActionResolve.document.uri);
170 │   const lsInfo = session.getLSAndScriptInfo(codeActionResolve.document);
171 │   if (!lsInfo) {
172 │     return param;
173 │   }
174 ▶   const fixesAllChanges = lsInfo.languageService.getCombinedCodeFix(
175 ▶     {
176 ▶       type: 'file',
177 ▶       fileName: filePath,
178 │     },
179 ▶     codeActionResolve.fixId as {},
180 │     defaultFormatOptions,
181 │     session.defaultPreferences,
182 │   );
183 │ 
184 │   return {
185 │     title: param.title,
186 ▶     edit: tsFileTextChangesToLspWorkspaceEdit(fixesAllChanges.changes, (path) =>
187 │       session.projectService.getScriptInfo(path),
188 │     ),
189 │   };
190 │ }
```

押されると VS Code が `codeAction/resolve` を送ってきます。165〜168 行目、fixId が無いもの（1 件ずつの修正）はもう編集を持っているのでそのまま返します。174〜182 行目、範囲は `type: 'file'`（ファイル全体）で `getCombinedCodeFix` を呼び、186 行目で編集を入れて返します。

📄 `angular/vscode-ng-language-service/server/src/handlers/initialization.ts` L45–55 （▶ の行: 46, 50, 54）

```ts
45 │       codeActionProvider: {
46 ▶         resolveProvider: true,
47 │         // Now the Angular code action provider only supports `QuickFix`. If leave the
48 │         // `codeActionKinds` empty, all action requests will be sent to the Angular language
49 │         // service, especially for the action before saving the file, the Angular code action
50 ▶         // provider will try to fix all errors in the whole file, it's expensive.
51 │         //
52 │         // Find more info
53 │         // [here](https://github.com/angular/vscode-ng-language-service/issues/1828)
54 ▶         codeActionKinds: [lsp.CodeActionKind.QuickFix],
55 │       },
```

54 行目、サーバーは扱う種類を `QuickFix` だけと宣言します。47〜53 行目のコメントのとおり、空にしておくと保存の前の「全部直す」の要求まで Angular の言語サービスに来て重くなったからです（元のリポジトリの issue #1828）。46 行目の `resolveProvider: true` が、上の「押されたときに計算する」を可能にしています。

## ここまでの呼び出し

- 👤 `波線の上で Ctrl+.` — VS Code
  - `onCodeAction(session, params)` — server/src/handlers/code\_actions.ts L36 — *診断ごとに 1 回*
    - `getCodeFixesAtPosition(file, start, end, [code], …)` — ts\_plugin.ts L273 — *TS ファイルなら先に TypeScript*
      - `LanguageService.getCodeFixesAtPosition` — language\_service.ts L640 — *番号で振り落とし → getSemanticDiagnostics*
        - `CodeFixes.getCodeFixesAtPosition` — codefixes/code\_fixes.ts L51 — *errorCodeToFixes を引く*
          - `meta.getCodeActions(context)` — codefixes/fix\_\*.ts — *TCB + TypeScript / AST の組み替え / ts\_utils の import*
          - `isFixAllAvailable(meta, diagnostics)` — codefixes/utils.ts L124 — *2 つ以上なら fixId を残す*
    - `getCodeFixesAll(codeActions, document)` — code\_actions.ts L203 — *編集なしの「全部直す」*
- 👤 `「全部直す」を押す` — VS Code
  - `onCodeActionResolve → getCombinedCodeFix({ type: 'file' }, fixId)` — code\_actions.ts L105・L174
    - `CodeFixes.getAllCodeActions` — code\_fixes.ts L99 — *fixIdToRegistration を引く*

## 10. 新しい修正を足すときに触るファイル

1. **codefixes/fix\_&lt;名前&gt;.ts を作る**

   `CodeActionMeta` の 4 つの欄を持つオブジェクトを export します。テンプレートの AST だけで決まるなら 4 節の形、型が要るなら 3 節（TCB と TypeScript）か 7 節（`getSymbolOfNode`）の形です。
2. **codefixes/utils.ts の FixIdForCodeFixesAll に名前を足す**

   全部直すを出すなら fixId が要ります。出さないなら空を返す `getAllCodeActions` にします（7 節の形）。
3. **codefixes/all\_codefixes\_metas.ts の配列に足す**

   2 節の 16〜22 行目です。ここに入れないと `CodeFixes` の表に載らず、1 節の 652 行目で振り落とされます。
4. **test/code\_fixes\_spec.ts に it を足す**

   下の節の形です。サーバーの `code_actions.ts` は fixId と編集を機械的に運ぶだけなので、普通は触りません。

## テストと直し方

code\_fixes\_spec.ts（1,701 行）は describe が 4 つ（全体の `code fixes` と、その中の `should fix missing required input`・`should fix missing selector imports`・`unused standalone imports`）、it が 35 本です。内訳は、外側に存在しないメンバーと banana-in-box の 6 本、必須の入力 7 本、import 18 本、使っていない import 4 本です。ファイルの最後の 200 行ほどは `actionChangesMatch` などの確かめる関数です。

📄 `angular/packages/language-service/test/code_fixes_spec.ts` L645–678 （▶ の行: 648, 656, 665, 668, 670, 674–675）

```ts
645 │     it('matches the quote style of existing imports for the generated import', () => {
646 │       const standaloneFiles = {
647 │         'foo.ts': `
648 ▶          import {Component} from "@angular/core";
649 │          @Component({
650 │            selector: 'foo',
651 │            template: '<bar></bar>'
652 │          })
653 │          export class FooComponent {}
654 │          `,
655 │         'bar.ts': `
656 ▶          import {Component} from '@angular/core';
657 │          @Component({
658 │            selector: 'bar',
659 │            template: '<div>bar</div>'
660 │          })
661 │          export class BarComponent {}
662 │          `,
663 │       };
664 │ 
665 ▶       const project = createModuleAndProjectWithDeclarations(env, 'test', {}, {}, standaloneFiles);
666 │       const diags = project.getDiagnosticsForFile('foo.ts');
667 │       const fixFile = project.openFile('foo.ts');
668 ▶       fixFile.moveCursorToText('<¦bar>');
669 │ 
670 ▶       const codeActions = project.getCodeFixesAtPosition('foo.ts', fixFile.cursor, fixFile.cursor, [
671 │         diags[0].code,
672 │       ]);
673 │       const actionChanges = allChangesForCodeActions(fixFile.contents, codeActions);
674 ▶       actionChangesMatch(actionChanges, `Import BarComponent from './bar' on FooComponent`, [
675 ▶         [``, `import { BarComponent } from "./bar";`],
676 │         [``, `, imports: [BarComponent]`],
677 │       ]);
678 │     });
```

0f0d52e9c11 で足された 2 本のうちの 1 本です。648 行目、修正を受ける foo.ts は `"` で import しています（bar.ts は `'`）。670 行目では `quotePreference` を渡していないので、5 節の 451〜455 行目の推測の経路を通り、675 行目の期待どおり `"./bar"` になります。668 行目の `moveCursorToText('<¦bar>')` の `¦` がカーソルの位置で、670 行目の `project.getCodeFixesAtPosition` は `includeCompletionsForModuleExports: true` を足して 1 節のメソッドを呼ぶ薄い包み（testing/src/project.ts）です。

### 手元で走らせた結果

📄 `ターミナル（~/angular-research/angular で）`

```
$ pnpm bazel test //packages/language-service/test:test \
    --nocache_test_results --test_output=all '--test_arg=--filter=code fixes'
(shard 1 of 4) Ran 8 of 662 specs / 8 specs, 0 failures
(shard 2 of 4) Ran 9 of 663 specs / 9 specs, 0 failures
(shard 4 of 4) Ran 9 of 663 specs / 9 specs, 0 failures
(shard 3 of 4) Ran 9 of 663 specs / 9 specs, 0 failures
//packages/language-service/test:test                                    PASSED in 3.0s

$ pnpm bazel test //packages/language-service/test:test \
    --nocache_test_results --test_output=all '--test_arg=--filter=quote'
(shard 3 of 4) Ran 0 of 686 specs / 0 specs, 0 failures
(shard 2 of 4) Ran 0 of 686 specs / 0 specs, 0 failures
(shard 1 of 4) Ran 1 of 687 specs / 1 spec, 0 failures
(shard 4 of 4) Ran 2 of 688 specs / 2 specs, 0 failures
//packages/language-service/test:test                                    PASSED in 1.7s
```

- `code fixes`（describe の名前）で 8・9・9・9 本、合計 35 本が通りました（PASSED in 3.0s。ログは scratchpad/ls-logs/e-codefix-all.log）。
- LSP サーバーを通した確かめは、結合テスト `vscode-ng-language-service/integration/lsp/ivy_spec.ts` の最後のほうに it が 4 本あります（「should fix error when property does not exist on type」、選んだ範囲が診断より広い場合、`should work` の中の `fixSpelling` と `fixMissingMember` の「全部直す」の resolve）。このスナップショットではこのターゲットがビルドに失敗するので、手元では走らせていません。
- `quote` で絞ると 3 本でした。code\_fixes\_spec の 2 本に加えて、completions\_spec.ts の「should not include the trailing quote inside the RHS of a two-way binding」も名前に `quote` を含むからです。フィルタは spec の名前の部分一致なので、絞った本数は必ず確かめます。

### 直すとしたら

- 修正の中身：codefixes/fix\_\*.ts のそれぞれの `getCodeActions`。import の文の作り方は utils/ts\_utils.ts の `updateImportsForTypescriptFile`・`updateImportsForAngularTrait`（補完の自動 import と共用なので、completions\_spec も一緒に走らせます）。
- 全部直すが出る・出ない：code\_fixes.ts の 80〜87 行目と、各部品の fixId。spec は外側の describe の「should not show fix all errors when there is only one diagnostic …」の形。
- TCB を経由する修正の位置ずれ：codefixes/utils.ts の `convertFileTextChangeInTcb` と、TCB の位置コメント（[診断の対応付け](../typecheck/16-typecheck-diagnostics-mapping.md)）。
- まだ無いもの：import の全部直す（fix\_missing\_import.ts 40 行目の TODO）と、必須の入力の全部直す（fix\_missing\_required\_inputs.ts 122・123 行目のコメントアウト）。

## 聞かれそうな質問

**Q. TS ファイルの中のインラインのテンプレートで、Angular の修正が出ないことがあるのはなぜですか？**

tsserver のプラグインが、TS ファイルでは先に TypeScript の修正を聞き、1 件でもあればそれだけを返すからです（ts\_plugin.ts 300〜302 行目）。Angular の修正は TypeScript が 0 件のときだけ聞かれます。

**Q. 「全部直す」が出たり出なかったりするのはなぜですか？**

ファイルの中に同じ部品の番号の診断が 2 つ以上あるときだけ、code\_fixes.ts 80〜87 行目で fixId が残るからです（isFixAllAvailable、utils.ts 124〜133 行目）。import の足し忘れと必須の入力は、そもそも修正に fixId を付けていないので、いくつあっても出ません（fix\_missing\_import.ts 104 行目は fixName だけ、fix\_missing\_required\_inputs.ts 122 行目はコメントアウト）。

**Q. `{{ titel }}` を `title` に直す修正は、Angular が綴りを比べているのですか？**

比べていません。fix\_missing\_member.ts 50〜57 行目で、TCB のファイルの上で TypeScript の `getCodeFixesAtPosition` を呼び、TypeScript が出した「〜のことですか」の編集を、utils.ts 77〜89 行目の `getSourceMappingAtTcbLocation` でテンプレートの位置に戻しているだけです。

**Q. import を足す修正は、NgModule のコンポーネントでも使えますか？**

使えます。fix\_missing\_import.ts 85 行目の `standaloneTraitOrNgModule` が、コンポーネントが NgModule に宣言されていればその NgModule を返し、そちらの `imports` に足します。どちらでもないコンポーネントには修正を出しません。

**Q. 足される import の引用符は何で決まりますか？**

ts\_utils.ts の `shouldUseSingleQuotes`（441〜457 行目）です。`quotePreference` が single か double ならそれ、それ以外はファイルの最初の import 文に合わせ、import 文が無ければ `"` です。0f0d52e9c11（#67108）からで、それより前はいつも `"` でした。

**Q. 新しい修正を足したのに出ません。**

all\_codefixes\_metas.ts の配列（16〜22 行目）に入れたかを見ます。入っていないと `CodeFixes` の表に載らず、language\_service.ts 652 行目で番号だけを見て振り落とされます。サーバーは QuickFix の種類しか宣言していない（initialization.ts 54 行目）ので、種類を別にした場合も届きません。

## 読み終えて

- 修正は「エラー番号 → CodeActionMeta」の表で選ばれる。番号の表に無ければ診断も作らずに終わる（language\_service.ts 652 行目）。
- 5 つの修正の作り方は 3 通り。TCB の上で TypeScript に作らせて位置を戻す（存在しないメンバー）、テンプレートの AST の文字列を組み替える（banana-in-box・必須の入力）、TS の AST を作り直して印字する（import の足し忘れ・使っていない import）。
- import の修正は、import 文とデコレータの imports の 2 か所を 1 件の修正にまとめる。引用符はファイルの最初の import に合わせる。
- 「全部直す」は同じ番号の診断が 2 つ以上あり、fixId を付けた部品だけ。サーバーは編集を後から計算する。
- spec は code\_fixes\_spec.ts に 35 本。フィルタの文字列は部分一致なので本数を確かめる。

---

← 前: [文書のシンボルと折りたたみ](17-ls-document-symbols.md)  
次: [リファクタリング：@Input を input() に変える](19-ls-refactorings.md) →
