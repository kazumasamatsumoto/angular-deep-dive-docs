[目次](../README.md) › [マイグレーションの内側](README.md) › 第 3 回 / 全 20 回

# tsconfig を探してプログラムを作る

> project\_tsconfig\_paths.ts が angular.json の全ターゲットの tsConfig を集め、名前に test を含むかで build と test に分ける行（58efd86c78f・f72600eaddf の 2 つの修正）、Tsurge の createProgram が NgtscProgram（Angular のコンパイラ込み）か素の TS プログラムを作る分かれ目（create\_program.ts・ngtsc\_program.ts）と ProgramInfo の各フィールド（rootDir の修正 26b0c719eff）。DevkitMigrationFilesystem が schematics の Tree を compiler-cli の FileSystem に見せる仕組み。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-program)

---

マイグレーションが「このプロジェクトの TypeScript」を読むには、まず tsconfig を探し、それぞれから TypeScript のプログラム（`ts.Program`：ファイルの集まりと型の情報）を作る必要があります。この章では、`angular.json` から tsconfig を集める `getProjectTsConfigPaths`、Tsurge の `createProgram` が Angular のコンパイラ込みの `NgtscProgram` と素の TS プログラムのどちらを作るかの分かれ目、できたプログラムを包む `ProgramInfo` の各フィールド、そして schematics の `Tree` を compiler-cli のファイルシステムに見せる `DevkitMigrationFilesystem` を、1 行ずつ読みます。

読む対象は `packages/core/schematics/utils/project_tsconfig_paths.ts` と `utils/tsurge/` の `base_migration.ts`・`helpers/create_program.ts`・`ngtsc_program.ts`・`ts_program.ts`・`program_info.ts`・`helpers/angular_devkit/devkit_filesystem.ts` です。

1. [1. 全体像](01-mig-overview.md)
2. [2. 入口と配布物](02-mig-entry-bundles.md)
3. **3. プログラムを作る**（この章）
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
17. [17. v22（1）既定](17-mig-v22-defaults.md)
18. [18. v22（2）?.](18-mig-v22-safe-navigation.md)
19. [19. テスト](19-mig-testing.md)
20. [20. issue と PR を読む](20-mig-issues.md)

## 1. getProjectTsConfigPaths：angular.json から tsconfig を集める

Tsurge でも古い形でも、最初に呼ぶのはこの関数です（呼んでいるのは `run_in_devkit.ts` と、古い形の 5 つ・JSON だけの 2 つ。grep で 8 か所）。

📄 `angular/packages/core/schematics/utils/project_tsconfig_paths.ts` L20–56 （▶ の行: 22, 26–27, 29–32, 36–37, 39, 43–44, 46）

```ts
20 │ export async function getProjectTsConfigPaths(
21 │   tree: Tree,
22 ▶   {angularBuildersOnly = false}: {angularBuildersOnly?: boolean} = {},
23 │ ): Promise<{buildPaths: string[]; testPaths: string[]}> {
24 │   // Start with some tsconfig paths that are generally used within CLI projects. Note
25 │   // that we are not interested in IDE-specific tsconfig files (e.g. /tsconfig.json)
26 ▶   const buildPaths = new Set<string>();
27 ▶   const testPaths = new Set<string>();
28 │ 
29 ▶   const workspace = await getWorkspace(tree);
30 ▶   for (const [, project] of workspace.projects) {
31 ▶     for (const [name, target] of project.targets) {
32 ▶       if (angularBuildersOnly && !isAngularBuilder(target.builder)) {
33 │         continue;
34 │       }
35 │ 
36 ▶       for (const [, options] of allTargetOptions(target)) {
37 ▶         const tsConfig = options['tsConfig'];
38 │         // Filter out tsconfig files that don't exist in the CLI project.
39 ▶         if (typeof tsConfig !== 'string' || !tree.exists(tsConfig)) {
40 │           continue;
41 │         }
42 │ 
43 ▶         if (name === 'test' || name.includes('test')) {
44 ▶           testPaths.add(normalize(tsConfig));
45 │         } else {
46 ▶           buildPaths.add(normalize(tsConfig));
47 │         }
48 │       }
49 │     }
50 │   }
51 │ 
52 │   return {
53 │     buildPaths: [...buildPaths],
54 │     testPaths: [...testPaths],
55 │   };
56 │ }
```

1. **29 行目：ワークスペースを読む**

   `getWorkspace(tree)` は Tree を `workspaces.WorkspaceHost` に見せて、`@angular-devkit/core` の `readWorkspace('/')` を呼びます（下の 119〜124 行目）。`angular.json` でも `.angular.json` でも読めて、コメント入りの JSON も読めます（spec に両方の `it` がある）。
2. **30〜31 行目：全プロジェクト × 全ターゲット**

   アプリもライブラリも、`build` も `serve` も `test` も、全部回ります。
3. **32 行目：Angular の builder だけに絞る（任意）**

   22 行目の `angularBuildersOnly` が `true` のときだけ、builder の名前が下の 59〜65 行目の前置きで始まらないターゲットを飛ばします。既定は `false`。
4. **36〜41 行目：`options` と全 `configurations` の `tsConfig`**

   `allTargetOptions`（75〜91 行目）が `options` を 1 回、`configurations` の production・development などを 1 回ずつ返します。39 行目で、`tsConfig` が文字列でないか **Tree に存在しないファイル**なら捨てます。
5. **43〜47 行目：test か build か**

   ターゲットの名前が `test` か、`test` を含めば `testPaths`、それ以外は全部 `buildPaths` です。26〜27 行目が `Set` なので、同じ側に同じパスが 2 回来ても 1 つになります。**build 側と test 側の両方に同じパスが来たときは、両方に 1 つずつ残ります**（[第 4 回](04-mig-tsurge.md)でこれが効きます）。

📄 `angular/packages/core/schematics/utils/project_tsconfig_paths.ts` L58–91 （▶ の行: 60–64, 70, 78–79, 86–88）

```ts
58 │ /** Prefixes of Angular builders, including common community builders (e.g. Nx). */
59 │ const angularBuilderPrefixes = [
60 ▶   '@angular-devkit/build-angular:',
61 ▶   '@angular/build:',
62 ▶   '@nx/angular:',
63 ▶   '@angular-builders/',
64 ▶   'ngx-build-plus:',
65 │ ];
66 │ 
67 │ /** Whether the given builder is a recognized Angular builder. */
68 │ function isAngularBuilder(builder: string | undefined): boolean {
69 │   return (
70 ▶     builder !== undefined && angularBuilderPrefixes.some((prefix) => builder.startsWith(prefix))
71 │   );
72 │ }
73 │ 
74 │ /** Get options for all configurations for the passed builder target. */
75 │ function* allTargetOptions(
76 │   target: workspaces.TargetDefinition,
77 │ ): Iterable<[string | undefined, Record<string, json.JsonValue | undefined>]> {
78 ▶   if (target.options) {
79 ▶     yield [undefined, target.options];
80 │   }
81 │ 
82 │   if (!target.configurations) {
83 │     return;
84 │   }
85 │ 
86 ▶   for (const [name, options] of Object.entries(target.configurations)) {
87 ▶     if (options) {
88 ▶       yield [name, options];
89 │     }
90 │   }
91 │ }
```

📄 `angular/packages/core/schematics/utils/project_tsconfig_paths.ts` L93–124 （▶ の行: 96, 111, 119, 121）

```ts
 93 │ function createHost(tree: Tree): workspaces.WorkspaceHost {
 94 │   return {
 95 │     async readFile(path: string): Promise<string> {
 96 ▶       const data = tree.read(path) as unknown as virtualFs.FileBuffer;
 97 │       if (!data) {
 98 │         throw new Error('File not found.');
 99 │       }
100 │ 
101 │       return virtualFs.fileBufferToString(data);
102 │     },
103 │     async writeFile(path: string, data: string): Promise<void> {
104 │       return tree.overwrite(path, data);
105 │     },
106 │     async isDirectory(path: string): Promise<boolean> {
107 │       // Approximate a directory check.
108 │       // We don't need to consider empty directories and hence this is a good enough approach.
109 │       // This is also per documentation, see:
110 │       // https://angular.dev/tools/cli/schematics-for-libraries#get-the-project-configuration
111 ▶       return !tree.exists(path) && tree.getDir(path).subfiles.length > 0;
112 │     },
113 │     async isFile(path: string): Promise<boolean> {
114 │       return tree.exists(path);
115 │     },
116 │   };
117 │ }
118 │ 
119 ▶ async function getWorkspace(tree: Tree): Promise<workspaces.WorkspaceDefinition> {
120 │   const host = createHost(tree);
121 ▶   const {workspace} = await workspaces.readWorkspace('/', host);
122 │ 
123 │   return workspace;
124 │ }
```

### 2 つの修正：何が変わったか

この関数は 2026 年に 2 回直されています（`git log -- packages/core/schematics/utils/project_tsconfig_paths.ts`）。

📄 `git show 58efd86c78f（2026-06-11、Fixes #66865）`

```
@@ -24,10 +24,6 @@ export async function getProjectTsConfigPaths(
   const workspace = await getWorkspace(tree);
   for (const [, project] of workspace.projects) {
     for (const [name, target] of project.targets) {
-      if (name !== 'build' && name !== 'test') {
-        continue;
-      }
-
       for (const [, options] of allTargetOptions(target)) {
         const tsConfig = options['tsConfig'];
         // Filter out tsconfig files that don't exist in the CLI project.
@@ -35,10 +31,10 @@ export async function getProjectTsConfigPaths(
           continue;
         }

-        if (name === 'build') {
-          buildPaths.add(normalize(tsConfig));
-        } else {
+        if (name === 'test' || name.includes('test')) {
           testPaths.add(normalize(tsConfig));
+        } else {
+          buildPaths.add(normalize(tsConfig));
         }
       }
     }
```

以前は `build` と `test` という名前のターゲット**だけ**を見ていました。ターゲットの名前を変えているワークスペース（#66865 は「inject migration が tsconfig を見つけられない」）では 1 つも見つからず、古い形のマイグレーションは「Could not find any tsconfig file」で止まっていました。直したあとは、名前に関係なく `tsConfig` を持つターゲットを全部集め、名前に `test` を含むかどうかだけで振り分けます（今の 43〜47 行目）。

もう 1 つは f72600eaddf（2026-07-20、Fixes #69837「non-Angular の tsconfig.json まで書き換える」）で、22 行目の `angularBuildersOnly` と 59〜72 行目を足しました。これを `true` で呼ぶのは `strict-templates-default` と `strict-safe-navigation-narrow` の 2 つだけです（同じ commit でこの 2 つの `index.ts` を変えている）。**Tsurge の `runMigrationInDevkit` は引数なしで呼ぶので、Nx などの混ざったワークスペースでは Angular でないプロジェクトの tsconfig も解析します**。

📄 `angular/packages/core/schematics/test/project_tsconfig_paths_spec.ts` L132–157 （▶ の行: 135, 142, 151–155）

```ts
132 │           node_lib: {
133 │             root: '',
134 │             architect: {
135 ▶               build: {builder: '@nx/js:tsc', options: {tsConfig: './tsconfig.lib.json'}},
136 │             },
137 │           },
138 │           ngx_build_plus_app: {
139 │             root: '',
140 │             architect: {
141 │               build: {
142 ▶                 builder: 'ngx-build-plus:browser',
143 │                 options: {tsConfig: './tsconfig.ngx-build-plus.json'},
144 │               },
145 │             },
146 │           },
147 │         },
148 │       }),
149 │     );
150 │ 
151 ▶     const {buildPaths} = await getProjectTsConfigPaths(testTree, {angularBuildersOnly: true});
152 ▶     expect(buildPaths).toEqual([
153 ▶       'tsconfig.app.json',
154 ▶       'tsconfig.nx.json',
155 ▶       'tsconfig.ngx-build-plus.json',
156 │     ]);
157 │   });
```

spec の 135 行目、`@nx/js:tsc` の `node_lib` だけが 152〜156 行目の結果から抜けています。142 行目の `ngx-build-plus:browser` は 64 行目の前置きに当たるので残ります。

## 2. createProgram：tsconfig 1 つから ProgramInfo を作る

Tsurge のマイグレーションは、tsconfig 1 つごとに基底クラスの `createProgram` を呼びます（誰がいつ呼ぶかは[第 4 回](04-mig-tsurge.md)）。

📄 `angular/packages/core/schematics/utils/tsurge/base_migration.ts` L32–45 （▶ の行: 36–37, 39–42, 44）

```ts
32 │   /**
33 │    * Creates the TypeScript program for a given compilation unit.
34 │    *
35 │    * By default:
36 ▶    *  - In 3P: Ngtsc programs are being created.
37 ▶    *  - In 1P: Ngtsc or TS programs are created based on the Blaze target.
38 │    */
39 ▶   createProgram(
40 ▶     tsconfigAbsPath: string,
41 ▶     fs: FileSystem,
42 ▶     optionsOverride?: NgCompilerOptions,
43 │   ): ProgramInfo {
44 ▶     return getProgramInfoFromBaseInfo(createBaseProgramInfo(tsconfigAbsPath, fs, optionsOverride));
45 │   }
```

44 行目、`createBaseProgramInfo` で土台を作り、`getProgramInfoFromBaseInfo` で `ProgramInfo` に仕上げる 2 段です。36〜37 行目のコメントが分かれ目を言っています。「3P（Google の外、CLI のプロジェクト）では Ngtsc のプログラム、1P（Google の中）では Blaze のターゲットによって Ngtsc か TS か」。メソッドなので、マイグレーションのクラスが上書きすることもできます。

📄 `angular/packages/core/schematics/utils/tsurge/helpers/create_program.ts` L24–58 （▶ の行: 33, 35–36, 40–42, 44, 50–51, 57）

```ts
24 │ /** Creates the base program info for the given tsconfig path. */
25 │ export function createBaseProgramInfo(
26 │   absoluteTsconfigPath: string,
27 │   fs: FileSystem,
28 │   optionOverrides: NgCompilerOptions = {},
29 │ ): BaseProgramInfo {
30 │   // Make sure the FS becomes globally available. Some code paths
31 │   // of the Angular compiler, or tsconfig parsing aren't leveraging
32 │   // the specified file system.
33 ▶   setFileSystem(fs);
34 │ 
35 ▶   const tsconfig = parseTsconfigOrDie(absoluteTsconfigPath, fs);
36 ▶   const tsHost = new NgtscCompilerHost(fs, tsconfig.options);
37 │ 
38 │   // When enabled, use a plain TS program if we are sure it's not
39 │   // an Angular project based on the `tsconfig.json`.
40 ▶   if (
41 ▶     google3UsePlainTsProgramIfNoKnownAngularOption() &&
42 ▶     tsconfig.options['_useHostForImportGeneration'] === undefined
43 │   ) {
44 ▶     return createPlainTsProgram(tsHost, tsconfig, optionOverrides);
45 │   }
46 │ 
47 │   // The Angular program may try to emit references during analysis or migration.
48 │   // To replicate the Google3 import emission here, ensure the unified module resolution
49 │   // can be enabled by the compiler.
50 ▶   if (isGoogle3() && tsconfig.options.rootDirs) {
51 ▶     (tsHost as Partial<UnifiedModulesHost>).fileNameToModuleName = fileNameToModuleNameFactory(
52 │       tsconfig.options.rootDirs,
53 │       /* workspaceName*/ 'google3',
54 │     );
55 │   }
56 │ 
57 ▶   return createNgtscProgram(tsHost, tsconfig, optionOverrides);
58 │ }
```

1. **33 行目：`setFileSystem(fs)`**

   compiler-cli には「今のファイルシステム」を 1 つ持つ大域変数があります。コメントのとおり、渡した `fs` を使わずにその大域を見るコードがあるので、ここで差し替えます。CLI から来たときの `fs` は 5 節の `DevkitMigrationFilesystem` です。
2. **35 行目：tsconfig を読む**

   `parseTsconfigOrDie`（下）は compiler-cli の `readConfiguration` で、`extends` や `angularCompilerOptions` まで解いた設定にします。
3. **36 行目：`NgtscCompilerHost`**

   TypeScript がファイルを読むときの窓口（`ts.CompilerHost`）を、`fs` の上に作ります。`getCurrentDirectory()` は `fs.pwd()` を返します。
4. **40〜45 行目：素の TS にする条件**

   `google3UsePlainTsProgramIfNoKnownAngularOption()` が真で、しかも `angularCompilerOptions._useHostForImportGeneration` が無いときだけ、44 行目で `createPlainTsProgram` に行きます。その関数は下の detection.ts のとおり、環境変数 `GOOGLE3_TSURGE` が `'1'` かどうかだけを見ます。
5. **50〜55 行目：google3 の import の名前**

   Google の中で `rootDirs` があるときは、import を書くときの名前を `google3/…` の形にする関数を host に足します。CLI では通りません。
6. **57 行目：それ以外は全部 `createNgtscProgram`**

   つまり **`ng update` / `ng generate` から走るときは、必ず Angular のコンパイラ込みのプログラム**になります。

📄 `angular/packages/core/schematics/utils/tsurge/helpers/ts_parse_config.ts` L12–33 （▶ の行: 13, 20, 24, 26–27）

```ts
12 │ /** Code of the error raised by TypeScript when a tsconfig doesn't match any files. */
13 ▶ const NO_INPUTS_ERROR_CODE = 18003;
14 │ 
15 │ /** Parses the given tsconfig file, supporting Angular compiler options. */
16 │ export function parseTsconfigOrDie(
17 │   absoluteTsconfigPath: string,
18 │   fs: FileSystem,
19 │ ): ParsedConfiguration {
20 ▶   const tsconfig = readConfiguration(absoluteTsconfigPath, {}, fs);
21 │ 
22 │   // Skip the "No inputs found..." error since we don't want to interrupt the migration if a
23 │   // tsconfig doesn't match a file. This will result in an empty `Program` which is still valid.
24 ▶   const errors = tsconfig.errors.filter((diag) => diag.code !== NO_INPUTS_ERROR_CODE);
25 │ 
26 ▶   if (errors.length) {
27 ▶     throw new Error(
28 │       `Tsconfig could not be parsed or is invalid:\n\n` + `${errors.map((e) => e.messageText)}`,
29 │     );
30 │   }
31 │ 
32 │   return tsconfig;
33 │ }
```

24 行目、TypeScript のエラー 18003（13 行目、「No inputs were found」）だけは捨てます。`include` に当たるファイルが 1 つも無い tsconfig（テストを書いていない `tsconfig.spec.json` など）でも、空のプログラムとして先へ進めるためです。それ以外のエラーが 1 つでもあれば 27 行目で例外にして、マイグレーション全体が止まります。

📄 `angular/packages/core/schematics/utils/tsurge/helpers/google3/detection.ts` L9–26 （▶ の行: 11, 20–22, 25）

```ts
 9 │ /** Whether we are executing inside Google */
10 │ export function isGoogle3() {
11 ▶   return process.env['GOOGLE3_TSURGE'] === '1';
12 │ }
13 │ 
14 │ /**
15 │  * By default, Tsurge will always create an Angular compiler program
16 │  * for projects analyzed and migrated. This works perfectly fine in
17 │  * third-party where Tsurge migrations run in Angular CLI projects.
18 │  *
19 │  * In first party, when running against full Google3, creating an Angular
20 ▶  * program for e.g. plain `ts_library` targets is overly expensive and
21 ▶  * can result in out of memory issues for large TS targets. In 1P we can
22 ▶  * reliably distinguish between TS and Angular targets via the `angularCompilerOptions`.
23 │  */
24 │ export function google3UsePlainTsProgramIfNoKnownAngularOption() {
25 ▶   return process.env['GOOGLE3_TSURGE'] === '1';
26 │ }
```

## 3. 2 つのプログラム：NgtscProgram と素の TS

📄 `angular/packages/core/schematics/utils/tsurge/helpers/ngtsc_program.ts` L15–48 （▶ の行: 24–25, 27–29, 35, 42–44）

```ts
15 │ /**
16 │  * Parses the configuration of the given TypeScript project and creates
17 │  * an instance of the Angular compiler for the project.
18 │  */
19 │ export function createNgtscProgram(
20 │   tsHost: ts.CompilerHost,
21 │   tsconfig: ParsedConfiguration,
22 │   optionOverrides: NgCompilerOptions,
23 │ ): BaseProgramInfo {
24 ▶   const ngtscProgram = new NgtscProgram(
25 ▶     tsconfig.rootNames,
26 │     {
27 ▶       ...tsconfig.options,
28 ▶       ...defaultMigrationTsOptions,
29 ▶       ...optionOverrides,
30 │     },
31 │     tsHost,
32 │   );
33 │ 
34 │   // Expose an easy way to debug-print ng semantic diagnostics.
35 ▶   if (process.env['DEBUG_NG_SEMANTIC_DIAGNOSTICS'] === '1') {
36 │     console.error(
37 │       ts.formatDiagnosticsWithColorAndContext(ngtscProgram.getNgSemanticDiagnostics(), tsHost),
38 │     );
39 │   }
40 │ 
41 │   return {
42 ▶     ngCompiler: ngtscProgram.compiler,
43 ▶     program: ngtscProgram.getTsProgram(),
44 ▶     userOptions: tsconfig.options,
45 │     __programAbsoluteRootFileNames: tsconfig.rootNames,
46 │     host: tsHost,
47 │   };
48 │ }
```

📄 `angular/packages/core/schematics/utils/tsurge/helpers/ts_program.ts` L14–48 （▶ の行: 17–19, 21, 32, 42）

```ts
14 │ /** Options that are good defaults for Tsurge migrations. */
15 │ export const defaultMigrationTsOptions: Partial<ts.CompilerOptions> = {
16 │   // Avoid checking libraries to speed up migrations.
17 ▶   skipLibCheck: true,
18 ▶   skipDefaultLibCheck: true,
19 ▶   noEmit: true,
20 │   // Does not apply to g3 and externally is enforced when the app is built by the compiler.
21 ▶   disableTypeScriptVersionCheck: true,
22 │ };
23 │ 
24 │ /**
25 │  * Creates an instance of a TypeScript program for the given project.
26 │  */
27 │ export function createPlainTsProgram(
28 │   tsHost: ts.CompilerHost,
29 │   tsconfig: ParsedConfiguration,
30 │   optionOverrides: NgCompilerOptions,
31 │ ): BaseProgramInfo {
32 ▶   const program = ts.createProgram({
33 │     rootNames: tsconfig.rootNames,
34 │     options: {
35 │       ...tsconfig.options,
36 │       ...defaultMigrationTsOptions,
37 │       ...optionOverrides,
38 │     },
39 │   });
40 │ 
41 │   return {
42 ▶     ngCompiler: null,
43 │     program,
44 │     userOptions: tsconfig.options,
45 │     __programAbsoluteRootFileNames: tsconfig.rootNames,
46 │     host: tsHost,
47 │   };
48 │ }
```

|   | `createNgtscProgram` | `createPlainTsProgram` |
| --- | --- | --- |
| 作るもの | 24 行目 `new NgtscProgram(rootNames, options, tsHost)` | 32 行目 `ts.createProgram({ rootNames, options })` |
| `ngCompiler` | 42 行目 `ngtscProgram.compiler`（`NgCompiler`） | 42 行目 `null` |
| `program` | 43 行目 `getTsProgram()`（型チェック用の shim を含む TS のプログラム） | そのまま |
| オプション | 27〜29 行目 / 35〜37 行目、どちらも `tsconfig の設定 → defaultMigrationTsOptions → 呼び出し側の上書き` の順に重ねる（後が勝つ） |   |
| 使われるとき | CLI から走るときは常に | Google の中で、Angular のオプションが無い tsconfig のとき |

`defaultMigrationTsOptions`（ts\_program.ts 15〜22 行目）は、ライブラリの型チェックを飛ばし（17〜18 行目）、出力をせず（19 行目）、TypeScript の版のチェックを外す（21 行目）設定です。マイグレーションは読むだけなので、出力も `.d.ts` の検査も要りません。

`ngCompiler` があると、テンプレートの型チェッカー（`TemplateTypeChecker`）やメタデータの読み取りが使えます。signal input のマイグレーションがテンプレートの中の参照まで追えるのはこのためです（[第 8 回](08-mig-signal-input-references.md)）。ただし NgCompiler は**作っただけでは解析しません**。解析が要るマイグレーションは自分で `ensureAnalyzed()` などを呼びます。

なお、古い形のマイグレーションはこの道を通らず、`utils/typescript/compiler_host.ts` の `createMigrationProgram(tree, tsconfigPath, basePath)` で自分でプログラムを作ります（[第 12 回](12-mig-control-flow.md)・[第 13 回](13-mig-inject.md)）。

📄 `angular/packages/core/schematics/utils/tsurge/test/g3_target_detection.spec.ts` L38–76 （▶ の行: 40, 46, 57, 60, 67, 74）

```ts
38 │   describe('1P', () => {
39 │     beforeEach(() => {
40 ▶       process.env['GOOGLE3_TSURGE'] = '1';
41 │     });
42 │     afterEach(() => {
43 │       process.env['GOOGLE3_TSURGE'] = undefined;
44 │     });
45 │ 
46 ▶     it('should create plain TS programs if there are no Angular options', async () => {
47 │       const tsconfigPath = absoluteFrom('/tsconfig.json');
48 │       fs.writeFile(
49 │         tsconfigPath,
50 │         JSON.stringify({
51 │           compilerOptions: {},
52 │         }),
53 │       );
54 │ 
55 │       const migration = new OutputMigration();
56 │       const baseInfo = migration.createProgram(tsconfigPath, fs);
57 ▶       expect(baseInfo.ngCompiler).toBeFalsy();
58 │     });
59 │ 
60 ▶     it('should create an Angular program if there is a known Angular option', async () => {
61 │       const tsconfigPath = absoluteFrom('/tsconfig.json');
62 │       fs.writeFile(
63 │         tsconfigPath,
64 │         JSON.stringify({
65 │           compilerOptions: {},
66 │           angularCompilerOptions: {
67 ▶             _useHostForImportGeneration: true,
68 │           },
69 │         }),
70 │       );
71 │ 
72 │       const migration = new OutputMigration();
73 │       const baseInfo = migration.createProgram(tsconfigPath, fs);
74 ▶       expect(baseInfo.ngCompiler).toBeTruthy();
75 │     });
76 │   });
```

分かれ目を確かめている spec です。40 行目で `GOOGLE3_TSURGE=1` にし、`angularCompilerOptions` の無い tsconfig では 57 行目で `ngCompiler` が無いこと、67 行目の `_useHostForImportGeneration` があれば 74 行目で `ngCompiler` があることを見ます（3P の場合は同じファイルの上のほうの `it`）。

## 4. ProgramInfo：マイグレーションが受け取るもの

📄 `angular/packages/core/schematics/utils/tsurge/program_info.ts` L13–25 （▶ の行: 18–21, 24）

```ts
13 │ /**
14 │  * Base information for a TypeScript project, including an instantiated
15 │  * TypeScript program.
16 │  */
17 │ export interface BaseProgramInfo {
18 ▶   ngCompiler: NgCompiler | null;
19 ▶   program: ts.Program;
20 ▶   userOptions: NgCompilerOptions;
21 ▶   host: Pick<ts.CompilerHost, 'getCanonicalFileName' | 'getCurrentDirectory'>;
22 │ 
23 │   // Legacy field that shouldn't be used in the new migrations.
24 ▶   __programAbsoluteRootFileNames: string[];
25 │ }
```

📄 `angular/packages/core/schematics/utils/tsurge/program_info.ts` L27–63 （▶ の行: 42, 50, 56, 62）

```ts
27 │ /**
28 │  * Full program information for a TypeScript project.
29 │  */
30 │ export interface ProgramInfo extends BaseProgramInfo {
31 │   /**
32 │    * All source files owned by this program / compilation unit.
33 │    *
34 │    * These are the files owned by the compilation unit and the migration
35 │    * can make modifications to.
36 │    *
37 │    * *Note for 3P*: It intentionally might be that more files would technically be
38 │    * part of this program, but aren't listed here. This can happen when Tsurge
39 │    * detects an overlap of multiple programs (e.g. tsconfig.build and tsconfig.test)
40 │    * and smartly coordinates which compilation unit should own the source file.
41 │    */
42 ▶   sourceFiles: ts.SourceFile[];
43 │ 
44 │   /**
45 │    * All source files in the program, including transitively loaded `.d.ts`.
46 │    *
47 │    * Use {@link sourceFiles} for a convenient way to finding source files that
48 │    * can be migrated. This field is useful when full program analysis is performed.
49 │    */
50 ▶   fullProgramSourceFiles: readonly ts.SourceFile[];
51 │ 
52 │   /**
53 │    * Root directories of the project.
54 │    * Sorted longest first for easy lookups.
55 │    */
56 ▶   sortedRootDirs: AbsoluteFsPath[];
57 │ 
58 │   /**
59 │    * Primary root directory.
60 │    * This is the shortest root directory, including all others.
61 │    */
62 ▶   projectRoot: AbsoluteFsPath;
63 │ }
```

📄 `angular/packages/core/schematics/utils/tsurge/helpers/create_program.ts` L60–96 （▶ の行: 68–69, 71, 73–74, 79–80, 85–86, 92–94）

```ts
60 │ /**
61 │  * Creates the {@link ProgramInfo} from the given base information.
62 │  *
63 │  * This function purely exists to support custom programs that are
64 │  * intended to be injected into Tsurge migrations. e.g. for language
65 │  * service refactorings.
66 │  */
67 │ export function getProgramInfoFromBaseInfo(baseInfo: BaseProgramInfo): ProgramInfo {
68 ▶   const fullProgramSourceFiles = [...baseInfo.program.getSourceFiles()];
69 ▶   const sourceFiles = fullProgramSourceFiles.filter(
70 │     (f) =>
71 ▶       !f.isDeclarationFile &&
72 │       // Note `isShim` will work for the initial program, but for TCB programs, the shims are no longer annotated.
73 ▶       !isShim(f) &&
74 ▶       !f.fileName.endsWith('.ngtypecheck.ts'),
75 │   );
76 │ 
77 │   // Sort it by length in reverse order (longest first). This speeds up lookups,
78 │   // since there's no need to keep going through the array once a match is found.
79 ▶   const sortedRootDirs = getRootDirs(baseInfo.host, baseInfo.userOptions).sort(
80 ▶     (a, b) => b.length - a.length,
81 │   );
82 │ 
83 │   // TODO: Consider also following TS's logic here, finding the common source root.
84 │   // See: Program#getCommonSourceDirectory.
85 ▶   const primaryRoot = absoluteFrom(
86 ▶     baseInfo.userOptions.rootDir ?? sortedRootDirs.at(-1) ?? baseInfo.program.getCurrentDirectory(),
87 │   );
88 │ 
89 │   return {
90 │     ...baseInfo,
91 │     sourceFiles,
92 ▶     fullProgramSourceFiles,
93 ▶     sortedRootDirs,
94 ▶     projectRoot: primaryRoot,
95 │   };
96 │ }
```

1. **`fullProgramSourceFiles`（68 行目）**

   プログラムに入っている全ファイル。`node_modules` の `.d.ts` も、NgtscProgram が足した型チェック用の shim も入ります。
2. **`sourceFiles`（69〜75 行目）**

   そこから `.d.ts`（71 行目）、shim（73 行目）、`.ngtypecheck.ts`（74 行目）を除いたもの。つまり「利用者が書いた .ts」で、**マイグレーションが書き換えてよいのはこちら**です（program\_info.ts 32〜41 行目のコメント）。39〜40 行目のコメントにある「build と test の tsconfig が重なるときの持ち主の調整」は、第 4 回の `modifyProgramInfoToEnsureNonOverlappingFiles` が**この配列だけ**を書き換えることを言っています。
3. **`sortedRootDirs`（79〜81 行目）**

   compiler-cli の `getRootDirs` は tsconfig の `rootDirs`、無ければ `rootDir`、それも無ければ現在のディレクトリを返します。それを**長い順**に並べます。ファイルの ID（`projectFile` の `id`）を「いちばん深い root からの相対パス」にするためで、ID の話は第 4 回でします。
4. **`projectRoot`（85〜87 行目と 94 行目）**

   `userOptions.rootDir` → いちばん短い root dir → `program.getCurrentDirectory()` の順に最初にあるもの。`rootRelativePath`（Tree に書くときのパス）はここからの相対になります。
5. **`userOptions`（BaseProgramInfo 20 行目）**

   tsconfig から読んだ設定そのもので、`defaultMigrationTsOptions` や上書きを重ねる前のものです（ngtsc\_program.ts 44 行目）。

### 26b0c719eff：rootDir があると壊れていた

86 行目のとおり、tsconfig に `"rootDir": "./src"` があると `projectRoot` は `/src` になります。すると `src/app/app.ts` の `rootRelativePath` は `app/app.ts` になり、Tree にそのパスは無いので書き込みで落ちます。#69174・#69527（「Path "app/components/…" does not exist」、スタックは `HostTree.beginUpdate` ← `runMigrationInDevkit`）がこれでした。直し方は CLI 用の入口のほうで上書きすることです。

📄 `git show 26b0c719eff（2026-06-08、PR #69194。migrate の段にも同じ 3 行）`

```
@@ -79,6 +79,9 @@ export async function runMigrationInDevkit<Stats>(
   for (const tsconfigPath of tsconfigPaths) {
     config.beforeProgramCreation?.(tsconfigPath, MigrationStage.Analysis);
     const info = migration.createProgram(tsconfigPath, fs);
+    // Devkit tree updates need workspace-relative paths. Keep `sortedRootDirs`
+    // intact for logical file IDs, but make `rootRelativePath` resolve from `/`.
+    info.projectRoot = absoluteFrom(info.program.getCurrentDirectory());

     modifyProgramInfoToEnsureNonOverlappingFiles(tsconfigPath, info, compilationUnitAssignments);
 
```

`info.program.getCurrentDirectory()` は NgtscCompilerHost の `fs.pwd()` で、`DevkitMigrationFilesystem` では常に `'/'`（次の節の 83〜85 行目）。だから CLI から走るときの `projectRoot` はいつもワークスペースの根になり、`rootRelativePath` は Tree のパスと一致します。`sortedRootDirs` はそのままなので、ID は rootDir からの相対のままです（コメントの「Keep sortedRootDirs intact for logical file IDs」）。このときに足された spec がこれです。

📄 `angular/packages/core/schematics/utils/tsurge/helpers/angular_devkit/run_in_devkit.spec.ts` L116–155 （▶ の行: 116, 139, 147, 149, 154）

```ts
116 ▶   it('applies replacements to workspace-relative paths when tsconfig rootDir is narrower', async () => {
117 │     tree.create(
118 │       '/angular.json',
119 │       JSON.stringify({
120 │         version: 1,
121 │         projects: {
122 │           app: {
123 │             root: '',
124 │             architect: {
125 │               build: {
126 │                 options: {
127 │                   tsConfig: './tsconfig.app.json',
128 │                 },
129 │               },
130 │             },
131 │           },
132 │         },
133 │       }),
134 │     );
135 │     tree.create(
136 │       '/tsconfig.app.json',
137 │       JSON.stringify({
138 │         compilerOptions: {
139 ▶           rootDir: './src',
140 │           module: 'preserve',
141 │           target: 'ES2022',
142 │           noLib: true,
143 │         },
144 │         include: ['src/**/*.ts'],
145 │       }),
146 │     );
147 ▶     tree.create('/src/app/app.ts', `export const value = 'before';\n`);
148 │ 
149 ▶     await runMigrationInDevkit({
150 │       tree,
151 │       getMigration: () => new TestMigration(),
152 │     });
153 │ 
154 ▶     expect(tree.readContent('/src/app/app.ts')).toContain(`'after'`);
155 │   });
```

## 5. DevkitMigrationFilesystem：Tree を FileSystem に見せる

compiler-cli は、ファイルの読み書きを `FileSystem` というインターフェイス越しに行います（ふだんはディスクを読む `NodeJSFileSystem`）。schematics の中では、ディスクではなく Tree（変更を記録する仮想のファイルツリー。[Tree と sink](../cli/13-schematics.md)）を読まなければなりません。その橋渡しがこのクラスです。

📄 `angular/packages/core/schematics/utils/tsurge/helpers/angular_devkit/devkit_filesystem.ts` L70–105 （▶ の行: 75, 77, 79, 84, 88, 92, 96, 100）

```ts
 70 │   normalize<T extends PathString>(path: T): T {
 71 │     return normalize(path as string) as string as T;
 72 │   }
 73 │ 
 74 │   resolve(...paths: string[]): AbsoluteFsPath {
 75 ▶     const normalizedPaths = paths.map((p) => normalize(p));
 76 │     // In dev-kit, the NodeJS working directory should never be
 77 ▶     // considered, so `/` is the last resort over `cwd`.
 78 │     return this.normalize(
 79 ▶       posixPath.resolve(normalize('/'), ...normalizedPaths),
 80 │     ) as string as AbsoluteFsPath;
 81 │   }
 82 │ 
 83 │   pwd(): AbsoluteFsPath {
 84 ▶     return '/' as AbsoluteFsPath;
 85 │   }
 86 │ 
 87 │   isCaseSensitive(): boolean {
 88 ▶     return true;
 89 │   }
 90 │ 
 91 │   exists(path: AbsoluteFsPath): boolean {
 92 ▶     return statPath(this.tree, path) !== null;
 93 │   }
 94 │ 
 95 │   readFile(path: AbsoluteFsPath): string {
 96 ▶     return this.tree.readText(path);
 97 │   }
 98 │ 
 99 │   readFileBuffer(path: AbsoluteFsPath): Uint8Array {
100 ▶     const buffer = this.tree.read(path);
101 │     if (buffer === null) {
102 │       throw new Error(`File does not exist: ${path}`);
103 │     }
104 │     return buffer;
105 │   }
```

1. **74〜81 行目：`resolve` の基準は `/`**

   77 行目のコメントのとおり、Node の作業ディレクトリは見ません。Tree の根（= ワークスペースの根）がいつも `/` です。
2. **83〜85 行目：`pwd()` は `'/'`**

   4 節の `projectRoot` の上書きが `/` になるのはここから来ます。
3. **87〜89 行目：大文字小文字を区別する**

   Tree のパスは区別するので、Windows でもそれに合わせます。
4. **91〜105 行目：読むのは Tree から**

   `exists` は下の `statPath`、`readFile` は `tree.readText`、`readFileBuffer` は `tree.read`。**同じ実行の中で前のマイグレーションが Tree に書いた内容**も、ここで読めます。

📄 `angular/packages/core/schematics/utils/tsurge/helpers/angular_devkit/devkit_filesystem.ts` L130–166 （▶ の行: 131, 135, 139–140, 145）

```ts
130 │   realpath(filePath: AbsoluteFsPath): AbsoluteFsPath {
131 ▶     return filePath;
132 │   }
133 │ 
134 │   getDefaultLibLocation(): AbsoluteFsPath {
135 ▶     return 'node_modules/typescript/lib' as AbsoluteFsPath;
136 │   }
137 │ 
138 │   ensureDir(path: AbsoluteFsPath): void {
139 ▶     // Migrations should compute replacements and not write directly.
140 ▶     throw new Error('DevkitFilesystem#ensureDir is not supported.');
141 │   }
142 │ 
143 │   writeFile(path: AbsoluteFsPath, data: string | Uint8Array): void {
144 │     // Migrations should compute replacements and not write directly.
145 ▶     throw new Error('DevkitFilesystem#writeFile is not supported.');
146 │   }
147 │ 
148 │   removeFile(path: AbsoluteFsPath): void {
149 │     // Migrations should compute replacements and not write directly.
150 │     throw new Error('DevkitFilesystem#removeFile is not supported.');
151 │   }
152 │ 
153 │   copyFile(from: AbsoluteFsPath, to: AbsoluteFsPath): void {
154 │     // Migrations should compute replacements and not write directly.
155 │     throw new Error('DevkitFilesystem#copyFile is not supported.');
156 │   }
157 │ 
158 │   moveFile(from: AbsoluteFsPath, to: AbsoluteFsPath): void {
159 │     // Migrations should compute replacements and not write directly.
160 │     throw new Error('DevkitFilesystem#moveFile is not supported.');
161 │   }
162 │ 
163 │   removeDeep(path: AbsoluteFsPath): void {
164 │     // Migrations should compute replacements and not write directly.
165 │     throw new Error('DevkitFilesystem#removeDeep is not supported.');
166 │   }
```

135 行目、TypeScript の lib（`lib.es2022.d.ts` など）の場所は `node_modules/typescript/lib` で、Tree の上ではワークスペースの `node_modules` を読みます。138〜166 行目の書く操作は**すべて例外**です。139 行目のコメント「Migrations should compute replacements and not write directly.」のとおり、マイグレーションは `FileSystem` に書かず、置き換え（`Replacement`）を返して最後に Tree に当てます（[第 5 回](05-mig-replacements.md)）。

📄 `angular/packages/core/schematics/utils/tsurge/helpers/angular_devkit/devkit_filesystem.ts` L177–199 （▶ の行: 182, 184–185, 193–194）

```ts
177 │ /** Stats the given path in the virtual tree. */
178 │ function statPath(tree: Tree, path: AbsoluteFsPath): FileStats | null {
179 │   let fileInfo: FileEntry | null = null;
180 │   let dirInfo: DirEntry | null = null;
181 │   try {
182 ▶     fileInfo = tree.get(path);
183 │   } catch (e) {
184 ▶     if ((e as any).constructor.name === 'PathIsDirectoryException') {
185 ▶       dirInfo = tree.getDir(path);
186 │     } else {
187 │       throw e;
188 │     }
189 │   }
190 │ 
191 │   if (fileInfo !== null || dirInfo !== null) {
192 │     return {
193 ▶       isDirectory: () => dirInfo !== null,
194 ▶       isFile: () => fileInfo !== null,
195 │       isSymbolicLink: () => false,
196 │     };
197 │   }
198 │   return null;
199 │ }
```

Tree にはディレクトリを直接調べる API が無いので、182 行目で `tree.get` を試し、184 行目の `PathIsDirectoryException` が出たらディレクトリとみなして `getDir` します。

## ここまでの呼び出し

- `runMigrationInDevkit(config)` — run\_in\_devkit.ts — *第 4 回*
  - `getProjectTsConfigPaths(tree)` — project\_tsconfig\_paths.ts L20 — *buildPaths と testPaths*
    - `readWorkspace('/', createHost(tree))` — L119–124
  - `new DevkitMigrationFilesystem(tree)` → `setFileSystem(fs)` — devkit\_filesystem.ts
  - `migration.createProgram(tsconfigPath, fs)` — base\_migration.ts L39 — *tsconfig ごとに*
    - `createBaseProgramInfo` — create\_program.ts L25
      - `parseTsconfigOrDie` → `readConfiguration` — ts\_parse\_config.ts L16
      - `new NgtscCompilerHost(fs, options)` — create\_program.ts L36
      - `createNgtscProgram` → `new NgtscProgram(…)` — ngtsc\_program.ts L19 — *CLI では常にこちら*
    - `getProgramInfoFromBaseInfo` — create\_program.ts L67 — *sourceFiles・sortedRootDirs・projectRoot*
  - `info.projectRoot = absoluteFrom(program.getCurrentDirectory())` — run\_in\_devkit.ts — *26b0c719eff。常に '/'*

## テストと直し方

### 走らせたもの

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/schematics/test:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=project tsconfig paths"
pnpm bazel test //packages/core/schematics/utils/tsurge/helpers/angular_devkit:test \
  --nocache_test_results --test_output=all
pnpm bazel test //packages/core/schematics/utils/tsurge/test:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=google3 target detection"
```

📄 `出力（2026-11-03 に実行。抜粋）`

```
# 1 本目: 16 shard のうち 6 つが 1 spec ずつ
Ran 1 of 513 specs
1 spec, 0 failures
…
INFO: Elapsed time: 2.037s, Critical Path: 1.20s
//packages/core/schematics/test:test                                     PASSED in 0.9s

# 2 本目
2 specs, 0 failures
Finished in 0.017 seconds
//packages/core/schematics/utils/tsurge/helpers/angular_devkit:test      PASSED in 0.8s

# 3 本目
3 specs, 0 failures
INFO: Elapsed time: 0.819s, Critical Path: 0.63s
//packages/core/schematics/utils/tsurge/test:test                        PASSED in 0.6s
```

- `project tsconfig paths`（`test/project_tsconfig_paths_spec.ts`）：16 shard のうち 6 つが 1 spec ずつ、**6 specs・0 failures、2.0 秒**。spec のファイルの `it` も 6 個です。
- `runMigrationInDevkit`（`run_in_devkit.spec.ts`）：**2 specs、0.8 秒**。rootDir なしの `it` と、上で見た rootDir ありの `it`（116 行目）。
- `google3 target detection`（`g3_target_detection.spec.ts`）：**3 specs、0.8 秒**。同じターゲットの残り 3 つは `output_migration.spec.ts`（[第 19 回](19-mig-testing.md)）。

### 直すとしたら

- **「Could not find any tsconfig file」**：`getProjectTsConfigPaths`（20〜56 行目）。39 行目の `tree.exists` はワークスペースの根からのパスで見るので、`tsConfig` の書き方（`./` の有無、プロジェクトの `root` からの相対で書いていないか）を先に確かめる。spec は `test/project_tsconfig_paths_spec.ts` に `it` を足す形（angular.json と空の tsconfig を `testTree.create` するだけで書ける）。
- **「Path "…" does not exist」で落ちる**：パスの計算。`projectRoot`（create\_program.ts 85〜87 行目と run\_in\_devkit.ts の上書き）と `projectFile`（第 4 回）。spec は `run_in_devkit.spec.ts` の 116 行目の形で、tsconfig の設定を変えて 1 本足す。
- **tsconfig の読み込みで落ちる**：`parseTsconfigOrDie` の 24 行目。18003 以外のエラーはすべて止まる。
- **Angular でないプロジェクトまで解析して遅い・落ちる**：`runMigrationInDevkit` は `getProjectTsConfigPaths(config.tree)` と引数なしで呼んでいて、`angularBuildersOnly` を渡していない（第 4 回）。#69837 を直した f72600eaddf は JSON を書く 2 つだけに効かせています。
- 関係する issue：#66865（58efd86c78f で閉じた）、#69837（f72600eaddf）、#69174・#69527（26b0c719eff、PR #69194）。[第 20 回](20-mig-issues.md)で他の issue と並べます。

## 聞かれそうな質問

**Q. マイグレーションはどの tsconfig を見ますか？`tsconfig.json` は見ますか？**

`angular.json` の全プロジェクト・全ターゲットの `options` と `configurations` にある `tsConfig` のうち、Tree に存在するものです（30〜41 行目）。ルートの `tsconfig.json` は、どれかのターゲットの `tsConfig` に書かれていなければ見ません（24〜25 行目のコメント「IDE 用の tsconfig には興味がない」）。

**Q. `e2e` や `storybook` のターゲットの tsconfig も入りますか？**

入ります。58efd86c78f からは名前で絞らないので、`tsConfig` を持つターゲットは全部入り、43 行目で名前に `test` を含まなければ build 側になります。JSON を書く 2 つ以外は builder でも絞らない（32 行目の条件は `angularBuildersOnly` のときだけ）ので、Angular でない builder のものも入ります。

**Q. マイグレーションは Angular のコンパイラを使いますか？**

CLI から走る Tsurge のマイグレーションは必ず使います。`createBaseProgramInfo` が素の TS に行くのは環境変数 `GOOGLE3_TSURGE=1` のときだけで（create\_program.ts 40〜45 行目、detection.ts 25 行目）、それ以外は 57 行目で `NgtscProgram` です。ただし NgCompiler の解析は作っただけでは走らず、要るマイグレーションが自分で呼びます。

**Q. `sourceFiles` と `fullProgramSourceFiles` はどう使い分けますか？**

書き換えてよいのは `sourceFiles`（.d.ts・shim・.ngtypecheck.ts を除き、さらに tsconfig の重なりを調整したもの）、参照を探すなど全体を見たいときは `fullProgramSourceFiles` です（program\_info.ts 32〜50 行目）。重なりの調整は `sourceFiles` にしか効きません。開いている PR #71151 は、signal-queries のマイグレーションが `fullProgramSourceFiles` から書き換えの対象を拾っていることを #71147（同じクエリが 2 回書き換わる）の原因として直そうとしています（第 4 回）。

**Q. tsconfig に `rootDir` があると、なぜ壊れていたのですか？**

`projectRoot` が 86 行目で `rootDir`（例 `/src`）になり、Tree に当てるパスがそこからの相対（`app/app.ts`）になっていたからです。26b0c719eff で、CLI 用の入口が `projectRoot` を `program.getCurrentDirectory()`（devkit の FS では常に `/`）に上書きするようにしました。spec は run\_in\_devkit.spec.ts 116〜155 行目。

## 読み終えて

- `getProjectTsConfigPaths` は angular.json の全ターゲットの `tsConfig` を集め、名前に `test` を含むかで 2 つに分ける。builder で絞るのは JSON を書く 2 つだけ。
- `createProgram` → `createBaseProgramInfo` → CLI では必ず `NgtscProgram`。素の TS は google3 の環境変数のときだけ。
- `ProgramInfo` は `sourceFiles`（書き換えてよい）・`fullProgramSourceFiles`（全部）・`sortedRootDirs`（ID 用）・`projectRoot`（Tree のパス用）。
- `DevkitMigrationFilesystem` は Tree を読むだけの FileSystem。根は `/`、書く操作は全部例外。
- 2026 年の 3 つの修正（58efd86c78f・f72600eaddf・26b0c719eff）は、どれもこの章の範囲。spec は 6 + 2 + 3 本。

---

← 前: [入口と配布物：migrations.json から bundles/\*.cjs まで](02-mig-entry-bundles.md)  
次: [Tsurge：分析・合流・移行の 3 段階](04-mig-tsurge.md) →
