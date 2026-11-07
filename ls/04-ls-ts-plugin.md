[目次](../README.md) › [言語サービスの内側](README.md) › 第 4 回 / 全 20 回

# tsserver プラグイン：TypeScript の言語サービスに Angular を重ねる

> TypeScript がプラグインの factory を自分自身を渡して呼び、create の戻り値で言語サービスを置き換えるまで。ts\_plugin.ts の create が TypeScript の LanguageService と Angular の LanguageService を並べ、メソッドごとに組み合わせる仕組み（withFallback、TS の結果と Angular の結果を足すもの・どちらかを選ぶもの）。NgLanguageService の型（api.ts）、TypeScript を外から受け取る AMD の束、angularOnly などのプラグインの設定と使われていない項目、配られていない override\_rename\_ts\_plugin と今の名前変更の扱い。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ls-ts-plugin)

---

tsserver のプラグインは「TypeScript の言語サービスを受け取り、同じ形の言語サービスを返す関数」です。Angular のプラグインは、受け取った TypeScript の言語サービスと自分の `LanguageService` を並べて持ち、メソッドごとに「TS の結果に Angular の結果を足す」「Angular だけ」「TS に尋ねて無ければ Angular」のどれかを選んだ新しい言語サービスを返します。この章では、TypeScript がプラグインを読み込んで差し替えるまでの順番、`ts_plugin.ts` の `create` の全部のメソッドの振り分け、`NgLanguageService` の型、TypeScript のモジュールを外から受け取る仕組み、プラグインの設定（使われていない項目も含めて）、名前変更を Angular に回す `override_rename_ts_plugin.ts` を読みます。

読む対象は `packages/language-service/` の `index.js`・`plugin-factory.ts`・`api.ts`・`override_rename_ts_plugin.ts`・`README.md`・`bundles/`、`src/ts_plugin.ts`、サーバーの `session.ts` のプラグインの設定、テスト `test/legacy/ts_plugin_spec.ts` です。

1. [1. 全体像](01-ls-overview.md)
2. [2. VS Code クライアント](02-ls-client.md)
3. [3. LSP サーバー](03-ls-server-session.md)
4. **4. tsserver プラグイン**（この章）
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
19. [19. リファクタリング](19-ls-refactorings.md)
20. [20. issue と PR を読む](20-ls-issues.md)

## 1. TypeScript がプラグインを読み込むまで

[第 3 回](03-ls-server-session.md)で、サーバーは `ProjectService` に `globalPlugins: ['@angular/language-service']` を渡し、ServerHost の `require` がこのパッケージだけを読み込むのを見ました。パッケージの入口から順に読みます。

📄 `angular/packages/language-service/index.js` L9–13 （▶ の行: 9, 11–13）

```js
 9 ▶ const {factory} = require('./factory_bundle');
10 │ 
11 ▶ // Tsserver expects `@angular/language-service` to provide a factory function
12 ▶ // as the default export of the package.
13 ▶ module.exports = factory;
```

📄 `angular/packages/language-service/plugin-factory.ts` L9–18 （▶ の行: 9–10, 12–15, 17）

```ts
 9 ▶ // Note: use a type-only import to prevent TypeScript from being bundled in.
10 ▶ import type ts from 'typescript';
11 │ 
12 ▶ export const factory: ts.server.PluginModuleFactory = (mod) => {
13 ▶   const {initialize}: {initialize: ts.server.PluginModuleFactory} = require(
14 ▶     `@angular/language-service/bundles/language-service.js`,
15 ▶   )(mod);
16 │ 
17 ▶   return initialize(mod);
18 │ };
```

1. **index.js 13 行目：パッケージそのものが「factory 関数」**

   11〜12 行目のコメントのとおり、tsserver はプラグインのパッケージの既定の export に factory 関数を期待します。TypeScript の型では `ts.server.PluginModuleFactory` で、`(mod: {typescript}) => PluginModule`、つまり**TypeScript のモジュールを受け取り、`create` を持つオブジェクトを返す**関数です。
2. **plugin-factory.ts 12〜15 行目：本体の束を読み、受け取った TypeScript を渡す**

   13〜14 行目で本体（`bundles/language-service.js`）を require し、それを 15 行目の `(mod)` で呼び出します。本体の束は「TypeScript を渡すと中身が返る関数」になっているからです（2 節）。17 行目、返ってきた `initialize`（ts\_plugin.ts の最後）にもう一度 `mod` を渡します。9〜10 行目、この小さな入口は TypeScript を型だけ import して、TypeScript の本体を束に入れないようにしています。

📄 `angular/packages/language-service/src/ts_plugin.ts` L409–440 （▶ の行: 409, 416, 420, 422, 428, 435, 437–438）

```ts
409 ▶ function getExternalFiles(tsModule: typeof ts, project: ts.server.Project): string[] {
410 │   if (!project.hasRoots()) {
411 │     return []; // project has not been initialized
412 │   }
413 │   const typecheckFiles: string[] = [];
414 │   const resourceFiles: string[] = [];
415 │   for (const scriptInfo of project.getScriptInfos()) {
416 ▶     if (scriptInfo.scriptKind === tsModule.ScriptKind.External) {
417 │       // script info for typecheck file is marked as external, see
418 │       // getOrCreateTypeCheckScriptInfo() in
419 │       // packages/language-service/src/language_service.ts
420 ▶       typecheckFiles.push(scriptInfo.fileName);
421 │     }
422 ▶     if (scriptInfo.scriptKind === tsModule.ScriptKind.Unknown) {
423 │       // script info for resource file is marked as unknown.
424 │       // Including these as external files is necessary because otherwise they will get removed from
425 │       // the project when `updateNonInferredProjectFiles` is called as part of the
426 │       // `updateProjectIfDirty` cycle.
427 │       // https://sourcegraph.com/github.com/microsoft/TypeScript@c300fea3250abd7f75920d95a58d9e742ac730ee/-/blob/src/server/editorServices.ts?L2363
428 ▶       resourceFiles.push(scriptInfo.fileName);
429 │     }
430 │   }
431 │   return [...typecheckFiles, ...resourceFiles];
432 │ }
433 │ 
434 │ /** Implementation of a ts.server.PluginModuleFactory */
435 ▶ export function initialize(mod: {typescript: typeof ts}): ts.server.PluginModule {
436 │   return {
437 ▶     create,
438 ▶     getExternalFiles: getExternalFiles.bind(undefined, mod.typescript),
439 │   };
440 │ }
```

435〜439 行目、プラグインのモジュールは `create`（3 節）と `getExternalFiles` の 2 つを持ちます。`getExternalFiles` は「tsconfig.json には無いが、このプロジェクトに含めてほしいファイル」を TypeScript に教える口で、416 行目で型チェック用のファイル（`ScriptKind.External`）を、422 行目でテンプレートなどのリソース（`ScriptKind.Unknown`）を集めます。425〜427 行目のコメントのとおり、返さないとプロジェクトの更新のたびに tsserver がそれらをプロジェクトから外します（外部テンプレートの扱いは[第 6 回](06-ls-external-templates.md)）。438 行目で `mod.typescript` を先に結びつけておくので、`getExternalFiles` は `ScriptKind` の値も受け取った TypeScript のものを使います。

ここから先は TypeScript の側です（このリポジトリの外。`node_modules/typescript/lib/typescript.js` 6.0.3 の `Project.enableProxy`）。TypeScript は factory を `{ typescript: 自分自身 }` で呼び、返った `create` に `info`（プロジェクト・今の言語サービス・設定 `config` など）を渡し、戻り値に足りないメソッドがあれば元の言語サービスのもので補ったうえで、**プロジェクトの言語サービスをその戻り値に置き換えます**。サーバーが `project.getLanguageService()` で Angular のものを受け取れるのはこのためです（[第 1 回](01-ls-overview.md)の 1 節）。`config` には、サーバーが `configurePlugin` で渡した設定（5 節）が入ります。

## 2. TypeScript を外から受け取る束の作り方

📄 `angular/packages/language-service/bundles/BUILD.bazel` L3–26 （▶ の行: 4, 7, 11–12, 19, 21–22）

```python
 3 │ rollup.rollup(
 4 ▶     name = "language-service",
 5 │     srcs = [
 6 │         "rollup.config.js",
 7 ▶         "//:node_modules/@angular/compiler-cli",
 8 │         "//:node_modules/@rollup/plugin-commonjs",
 9 │         "//:node_modules/@rollup/plugin-node-resolve",
10 │         "//packages/language-service:tsconfig_build",
11 ▶         "//packages/language-service/src",
12 ▶         "//packages/language-service/src:ts_plugin.js",
13 │         "//tools/bazel/rollup:path-plugin",
14 │     ],
15 │     outs = [
16 │         "language-service.js",
17 │     ],
18 │     args = [
19 ▶         "--format=amd",
20 │         "--config=$(rootpath rollup.config.js)",
21 ▶         "--input=packages/language-service/src/ts_plugin.js",
22 ▶         "--file=packages/language-service/bundles/language-service.js",
23 │         "--sourcemap=inline",
24 │     ],
25 │     visibility = ["//packages/language-service:__pkg__"],
26 │ )
```

📄 `angular/packages/language-service/bundles/rollup.config.js` L13–47 （▶ の行: 13–15, 23–25, 27–28, 33, 37–38, 40, 42, 47）

```js
13 ▶ // This is a custom AMD file header that patches the AMD `define` call generated
14 ▶ // by rollup so that the bundle exposes a CJS-exported function which takes an
15 ▶ // instance of the TypeScript module. More details in `/language-service/index.ts`.
16 │ const amdFileHeader = `
17 │ /**
18 │  * @license Angular v0.0.0-PLACEHOLDER
19 │  * Copyright Google LLC All Rights Reserved.
20 │  * License: MIT
21 │  */
22 │ 
23 ▶ let $deferred;
24 ▶ function define(modules, callback) {
25 ▶   $deferred = {modules, callback};
26 │ }
27 ▶ module.exports = function(provided) {
28 ▶   const ts = provided['typescript'];
29 │   if (!ts) {
30 │     throw new Error('Caller does not provide typescript module');
31 │   }
32 │   const results = {};
33 ▶   const resolvedModules = $deferred.modules.map(m => {
34 │     if (m === 'exports') {
35 │       return results;
36 │     }
37 ▶     if (m === 'typescript') {
38 ▶       return ts;
39 │     }
40 ▶     return require(m);
41 │   });
42 ▶   $deferred.callback(...resolvedModules);
43 │   return results;
44 │ };
45 │ `;
46 │ 
47 ▶ const external = ['os', 'fs', 'path', 'typescript'];
```

1. **BUILD.bazel 19〜22 行目：ts\_plugin.js を入口に、AMD 形式で 1 本に束ねる**

   7 行目のとおり compiler-cli も材料に入っていて、**ngtsc のコンパイラはこの束の中に入ります**。束の外に残すのは rollup.config.js の 47 行目の `os`・`fs`・`path`・`typescript` だけです。AMD（`define([依存の名前…], 本体の関数)` の形のモジュール）にするのは、rollup.config.js の 13〜15 行目のコメントのとおり、`define` の呼び出しを差し替えて「TypeScript のモジュールを受け取る関数」を CJS で export するためです。
2. **rollup.config.js 23〜26 行目：define を呼ばれても実行せず、覚えておく**

   束の先頭に貼る文字列（banner）の中で、自前の `define` を定義します。束の本体が `define(…)` を呼ぶと、依存の名前と本体の関数を覚えるだけです。
3. **27〜44 行目：束の module.exports は「TypeScript を受け取る関数」**

   28 行目で呼び手から `typescript` を受け取り（無ければ 29〜31 行目で例外）、33〜41 行目で依存を 1 つずつ解決します。37〜38 行目、**`typescript` だけは呼び手が渡したもの**、それ以外は 40 行目の普通の `require` です。42 行目で覚えておいた本体の関数を実行します。plugin-factory.ts の 15 行目の `(mod)` がこの関数の呼び出しです。

こうすると、束の中の `import ts from 'typescript'`（language\_service.ts などの値としての import）は全部、**プラグインを読み込んだ側の TypeScript**を指します。サーバーの場合は[第 3 回](03-ls-server-session.md)の banner で決まった `tsserverlibrary.js` です。ts\_plugin.ts 自身も 2026-02-03 の 03e1a95c267（「decouple TypeScript dependency in ts\_plugin」）で `import type` に変え、`ScriptKind` などの値を 438 行目で渡された `mod.typescript` から取るようにしました。コミットの説明は「プラグインの中の TypeScript と、ホストが使う TypeScript の版の食い違いによる問題を防ぐ」です。

## 3. create：2 つの言語サービスを並べる

📄 `angular/packages/language-service/src/ts_plugin.ts` L29–46 （▶ の行: 30–34, 36, 38, 42–43, 45）

```ts
29 │ export function create(info: ts.server.PluginCreateInfo): NgLanguageService {
30 ▶   const {project, languageService, config} = info;
31 ▶   const tsLS = isNgLanguageService(languageService)
32 ▶     ? languageService.getTypescriptLanguageService()
33 ▶     : languageService;
34 ▶   const angularOnly = config?.angularOnly === true;
35 │ 
36 ▶   const ngLS = new LanguageService(project, tsLS, config);
37 │ 
38 ▶   function withFallback<Result>(
39 │     fileName: string,
40 │     cb: (ls: ts.LanguageService | LanguageService) => Result | undefined,
41 │   ): Result | undefined {
42 ▶     if (angularOnly || !isTypeScriptFile(fileName)) {
43 ▶       return cb(ngLS);
44 │     }
45 ▶     return cb(tsLS) ?? cb(ngLS);
46 │   }
```

1. **30 行目：TypeScript が渡す info**

   `project`（tsserver のプロジェクト）、`languageService`（今のプロジェクトの言語サービス）、`config`（5 節の設定）を取り出します。
2. **31〜33 行目：渡された言語サービスが既に Angular のものなら、中の TypeScript のものを取り出す**

   判定は 4 節の `isNgLanguageService`、取り出しは `getTypescriptLanguageService()` です。こうして `tsLS` は常に TypeScript そのものの言語サービスになります。
3. **34 行目：angularOnly**

   真なら TypeScript の結果を混ぜません。VS Code の拡張のサーバーは常に真を渡します（5 節）。
4. **36 行目：Angular の LanguageService を作る**

   プロジェクトごとに 1 つ。中で `CompilerFactory` を作ります（[第 5 回](05-ls-compiler-factory.md)）。
5. **38〜46 行目：withFallback**

   42 行目、`angularOnly` か、TS のファイルでない（外部テンプレートの .html など）なら Angular だけに尋ねます。45 行目、それ以外（angularOnly が偽で TS のファイル）なら**先に TypeScript**に尋ね、`undefined` のときだけ Angular に尋ねます。この関数は 2026-01-27 の 7bb241f7b67 で、同じ形の分岐を 1 か所にまとめたものです。

### 全部のメソッドの振り分け

📄 `angular/packages/language-service/src/ts_plugin.ts` L48–78 （▶ の行: 49–50, 55, 60–61, 63, 69–70, 72, 77）

```ts
48 │   function getSyntacticDiagnostics(fileName: string): ts.DiagnosticWithLocation[] {
49 ▶     if (!angularOnly && isTypeScriptFile(fileName)) {
50 ▶       return tsLS.getSyntacticDiagnostics(fileName);
51 │     }
52 │ 
53 │     // Template files do not currently produce separate syntactic diagnostics and
54 │     // are instead produced during the semantic diagnostic analysis.
55 ▶     return [];
56 │   }
57 │ 
58 │   function getSuggestionDiagnostics(fileName: string): ts.DiagnosticWithLocation[] {
59 │     const diagnostics: ts.DiagnosticWithLocation[] = [];
60 ▶     if (!angularOnly && isTypeScriptFile(fileName)) {
61 ▶       diagnostics.push(...tsLS.getSuggestionDiagnostics(fileName));
62 │     }
63 ▶     diagnostics.push(...ngLS.getSuggestionDiagnostics(fileName));
64 │     return diagnostics;
65 │   }
66 │ 
67 │   function getSemanticDiagnostics(fileName: string): ts.Diagnostic[] {
68 │     const diagnostics: ts.Diagnostic[] = [];
69 ▶     if (!angularOnly && isTypeScriptFile(fileName)) {
70 ▶       diagnostics.push(...tsLS.getSemanticDiagnostics(fileName));
71 │     }
72 ▶     diagnostics.push(...ngLS.getSemanticDiagnostics(fileName));
73 │     return diagnostics;
74 │   }
75 │ 
76 │   function getQuickInfoAtPosition(fileName: string, position: number): ts.QuickInfo | undefined {
77 ▶     return withFallback(fileName, (ls) => ls.getQuickInfoAtPosition(fileName, position));
78 │   }
```

📄 `angular/packages/language-service/src/ts_plugin.ts` L80–106 （▶ の行: 84, 91, 98, 105）

```ts
 80 │   function getTypeDefinitionAtPosition(
 81 │     fileName: string,
 82 │     position: number,
 83 │   ): readonly ts.DefinitionInfo[] | undefined {
 84 ▶     return withFallback(fileName, (ls) => ls.getTypeDefinitionAtPosition(fileName, position));
 85 │   }
 86 │ 
 87 │   function getDefinitionAndBoundSpan(
 88 │     fileName: string,
 89 │     position: number,
 90 │   ): ts.DefinitionInfoAndBoundSpan | undefined {
 91 ▶     return withFallback(fileName, (ls) => ls.getDefinitionAndBoundSpan(fileName, position));
 92 │   }
 93 │ 
 94 │   function getDefinitionAtPosition(
 95 │     fileName: string,
 96 │     position: number,
 97 │   ): readonly ts.DefinitionInfo[] | undefined {
 98 ▶     return getDefinitionAndBoundSpan(fileName, position)?.definitions;
 99 │   }
100 │ 
101 │   function getReferencesAtPosition(
102 │     fileName: string,
103 │     position: number,
104 │   ): ts.ReferenceEntry[] | undefined {
105 ▶     return ngLS.getReferencesAtPosition(fileName, position);
106 │   }
```

📄 `angular/packages/language-service/src/ts_plugin.ts` L108–123 （▶ の行: 112–116, 122）

```ts
108 │   function findRenameLocations(
109 │     fileName: string,
110 │     position: number,
111 │   ): readonly ts.RenameLocation[] | undefined {
112 ▶     // Most operations combine results from all extensions. However, rename locations are exclusive
113 ▶     // (results from only one extension are used) so our rename locations are a superset of the TS
114 ▶     // rename locations. As a result, we do not check the `angularOnly` flag here because we always
115 ▶     // want to include results at TS locations as well as locations in templates.
116 ▶     return ngLS.findRenameLocations(fileName, position);
117 │   }
118 │ 
119 │   function getRenameInfo(fileName: string, position: number): ts.RenameInfo {
120 │     // See the comment in `findRenameLocations` explaining why we don't check the `angularOnly`
121 │     // flag.
122 ▶     return ngLS.getRenameInfo(fileName, position);
123 │   }
```

📄 `angular/packages/language-service/src/ts_plugin.ts` L125–148 （▶ の行: 130–131, 133–135, 138, 144, 147）

```ts
125 │   function getEncodedSemanticClassifications(
126 │     fileName: string,
127 │     span: ts.TextSpan,
128 │     format?: ts.SemanticClassificationFormat,
129 │   ): ts.Classifications {
130 ▶     if (angularOnly || !isTypeScriptFile(fileName)) {
131 ▶       return ngLS.getEncodedSemanticClassifications(fileName, span, format);
132 │     } else {
133 ▶       const ngClassifications = ngLS.getEncodedSemanticClassifications(fileName, span, format);
134 ▶       const tsClassifications = tsLS.getEncodedSemanticClassifications(fileName, span, format);
135 ▶       const spans = [...ngClassifications.spans, ...tsClassifications.spans];
136 │       return {
137 │         spans,
138 ▶         endOfLineState: tsClassifications.endOfLineState,
139 │       };
140 │     }
141 │   }
142 │ 
143 │   function getTokenTypeFromClassification(classification: number): number | undefined {
144 ▶     return ngLS.getTokenTypeFromClassification(classification);
145 │   }
146 │   function getTokenModifierFromClassification(classification: number): number {
147 ▶     return ngLS.getTokenModifierFromClassification(classification);
148 │   }
```

📄 `angular/packages/language-service/src/ts_plugin.ts` L150–188 （▶ の行: 155, 167–169, 179）

```ts
150 │   function getCompletionsAtPosition(
151 │     fileName: string,
152 │     position: number,
153 │     options: ts.GetCompletionsAtPositionOptions,
154 │   ): ts.WithMetadata<ts.CompletionInfo> | undefined {
155 ▶     return withFallback(fileName, (ls) => ls.getCompletionsAtPosition(fileName, position, options));
156 │   }
157 │ 
158 │   function getCompletionEntryDetails(
159 │     fileName: string,
160 │     position: number,
161 │     entryName: string,
162 │     formatOptions: ts.FormatCodeOptions | ts.FormatCodeSettings | undefined,
163 │     source: string | undefined,
164 │     preferences: ts.UserPreferences | undefined,
165 │     data: ts.CompletionEntryData | undefined,
166 │   ): ts.CompletionEntryDetails | undefined {
167 ▶     return withFallback(fileName, (ls) => {
168 ▶       if (ls === tsLS) {
169 ▶         return tsLS.getCompletionEntryDetails(
170 │           fileName,
171 │           position,
172 │           entryName,
173 │           formatOptions,
174 │           source,
175 │           preferences,
176 │           data,
177 │         );
178 │       }
179 ▶       return ngLS.getCompletionEntryDetails(
180 │         fileName,
181 │         position,
182 │         entryName,
183 │         formatOptions,
184 │         preferences,
185 │         data,
186 │       );
187 │     });
188 │   }
```

📄 `angular/packages/language-service/src/ts_plugin.ts` L190–229 （▶ の行: 196, 200, 208–209, 211, 220, 224, 228）

```ts
190 │   function getCompletionEntrySymbol(
191 │     fileName: string,
192 │     position: number,
193 │     name: string,
194 │     source: string | undefined,
195 │   ): ts.Symbol | undefined {
196 ▶     return withFallback(fileName, (ls) => {
197 │       if (ls === tsLS) {
198 │         return tsLS.getCompletionEntrySymbol(fileName, position, name, source);
199 │       }
200 ▶       return ngLS.getCompletionEntrySymbol(fileName, position, name);
201 │     });
202 │   }
203 │   /**
204 │    * Gets global diagnostics related to the program configuration and compiler options.
205 │    */
206 │   function getCompilerOptionsDiagnostics(): ts.Diagnostic[] {
207 │     const diagnostics: ts.Diagnostic[] = [];
208 ▶     if (!angularOnly) {
209 ▶       diagnostics.push(...tsLS.getCompilerOptionsDiagnostics());
210 │     }
211 ▶     diagnostics.push(...ngLS.getCompilerOptionsDiagnostics());
212 │     return diagnostics;
213 │   }
214 │ 
215 │   function getSignatureHelpItems(
216 │     fileName: string,
217 │     position: number,
218 │     options: ts.SignatureHelpItemsOptions,
219 │   ): ts.SignatureHelpItems | undefined {
220 ▶     return withFallback(fileName, (ls) => ls.getSignatureHelpItems(fileName, position, options));
221 │   }
222 │ 
223 │   function getOutliningSpans(fileName: string): ts.OutliningSpan[] {
224 ▶     return withFallback(fileName, (ls) => ls.getOutliningSpans(fileName)) ?? [];
225 │   }
226 │ 
227 │   function getTcb(fileName: string, position: number): GetTcbResponse | undefined {
228 ▶     return ngLS.getTcb(fileName, position);
229 │   }
```

📄 `angular/packages/language-service/src/ts_plugin.ts` L251–271 （▶ の行: 255–257, 261, 270）

```ts
251 │   function getApplicableRefactors(
252 │     fileName: string,
253 │     positionOrRange: number | ts.TextRange,
254 │   ): ts.ApplicableRefactorInfo[] {
255 ▶     // We never forward to TS for refactors because those are not handled
256 ▶     // properly by the LSP server implementation of the extension. The extension
257 ▶     // will only take care of refactorings from Angular language service.
258 │     // Code actions are tied to their provider, so this is unproblematic and will
259 │     // not hide built-in TypeScript refactorings:
260 │     // https://github.com/microsoft/vscode/blob/ea4d99921cc790d49194e897021faee02a1847f7/src/vs/editor/contrib/codeAction/codeAction.ts#L30-L31
261 ▶     return ngLS.getPossibleRefactorings(fileName, positionOrRange);
262 │   }
263 │ 
264 │   function applyRefactoring(
265 │     fileName: string,
266 │     positionOrRange: number | ts.TextRange,
267 │     refactorName: string,
268 │     reportProgress: ApplyRefactoringProgressFn,
269 │   ): Promise<ApplyRefactoringResult | undefined> {
270 ▶     return ngLS.applyRefactoring(fileName, positionOrRange, refactorName, reportProgress);
271 │   }
```

📄 `angular/packages/language-service/src/ts_plugin.ts` L280–304 （▶ の行: 281–282, 291, 299–302）

```ts
280 │   ): readonly ts.CodeFixAction[] {
281 ▶     if (angularOnly || !isTypeScriptFile(fileName)) {
282 ▶       return ngLS.getCodeFixesAtPosition(
283 │         fileName,
284 │         start,
285 │         end,
286 │         errorCodes,
287 │         formatOptions,
288 │         preferences,
289 │       );
290 │     } else {
291 ▶       const tsLsCodeFixes = tsLS.getCodeFixesAtPosition(
292 │         fileName,
293 │         start,
294 │         end,
295 │         errorCodes,
296 │         formatOptions,
297 │         preferences,
298 │       );
299 ▶       // If TS could answer the query, then return that result. Otherwise, return from Angular LS.
300 ▶       return tsLsCodeFixes.length > 0
301 ▶         ? tsLsCodeFixes
302 ▶         : ngLS.getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences);
303 │     }
304 │   }
```

📄 `angular/packages/language-service/src/ts_plugin.ts` L306–321 （▶ の行: 312–313, 315, 317–319）

```ts
306 │   function getCombinedCodeFix(
307 │     scope: ts.CombinedCodeFixScope,
308 │     fixId: string,
309 │     formatOptions: ts.FormatCodeSettings,
310 │     preferences: ts.UserPreferences,
311 │   ): ts.CombinedCodeActions {
312 ▶     if (angularOnly) {
313 ▶       return ngLS.getCombinedCodeFix(scope, fixId, formatOptions, preferences);
314 │     } else {
315 ▶       const tsLsCombinedCodeFix = tsLS.getCombinedCodeFix(scope, fixId, formatOptions, preferences);
316 │       // If TS could answer the query, then return that result. Otherwise, return from Angular LS.
317 ▶       return tsLsCombinedCodeFix.changes.length > 0
318 ▶         ? tsLsCombinedCodeFix
319 ▶         : ngLS.getCombinedCodeFix(scope, fixId, formatOptions, preferences);
320 │     }
321 │   }
```

📄 `angular/packages/language-service/src/ts_plugin.ts` L327–351 （▶ の行: 334–335, 339–340, 345–346）

```ts
327 │   function getLinkedEditingRangeAtPosition(
328 │     fileName: string,
329 │     position: number,
330 │   ): LinkedEditingRanges | undefined {
331 │     // Only handle inline templates in TypeScript files.
332 │     // For external HTML template files, VS Code's built-in HTML language support
333 │     // provides linked editing, so we don't need to handle them here.
334 ▶     if (!isTypeScriptFile(fileName)) {
335 ▶       return undefined;
336 │     }
337 │ 
338 │     // Try Angular's implementation first for inline templates
339 ▶     const ngResult = ngLS.getLinkedEditingRangeAtPosition(fileName, position);
340 ▶     if (ngResult) {
341 │       return ngResult;
342 │     }
343 │ 
344 │     // Fall back to TypeScript for JSX/TSX files
345 ▶     if (!angularOnly) {
346 ▶       const tsResult = tsLS.getLinkedEditingRangeAtPosition(fileName, position);
347 │       return tsResult ?? undefined;
348 │     }
349 │ 
350 │     return undefined;
351 │   }
```

📄 `angular/packages/language-service/src/ts_plugin.ts` L372–407 （▶ の行: 373–374, 391, 398, 401）

```ts
372 │   return {
373 ▶     ...tsLS,
374 ▶     ensureProjectAnalyzed,
375 │     getSyntacticDiagnostics,
376 │     getSemanticDiagnostics,
377 │     getSuggestionDiagnostics,
378 │     getTypeDefinitionAtPosition,
379 │     getQuickInfoAtPosition,
380 │     getDefinitionAtPosition,
381 │     getDefinitionAndBoundSpan,
382 │     getReferencesAtPosition,
383 │     findRenameLocations,
384 │     getRenameInfo,
385 │     getEncodedSemanticClassifications,
386 │     getTokenTypeFromClassification,
387 │     getTokenModifierFromClassification,
388 │     getCompletionsAtPosition,
389 │     getCompletionEntryDetails,
390 │     getCompletionEntrySymbol,
391 ▶     getTcb,
392 │     getCompilerOptionsDiagnostics,
393 │     getComponentLocationsForTemplate,
394 │     getSignatureHelpItems,
395 │     getOutliningSpans,
396 │     getTemplateLocationForComponent,
397 │     getTemplateDocumentSymbols,
398 ▶     hasCodeFixesForErrorCode: ngLS.hasCodeFixesForErrorCode.bind(ngLS),
399 │     getCodeFixesAtPosition,
400 │     getCombinedCodeFix,
401 ▶     getTypescriptLanguageService,
402 │     getApplicableRefactors,
403 │     applyRefactoring,
404 │     getLinkedEditingRangeAtPosition,
405 │     getAngularInlayHints,
406 │   };
407 │ }
```

上の引用を、メソッドごとに表にします（「TS の .ts で」は angularOnly が偽で TS のファイルのとき）。

| 型 | メソッド（行） | angularOnly か .html のとき | TS の .ts で |
| --- | --- | --- | --- |
| **足す** | `getSemanticDiagnostics`（67）・`getSuggestionDiagnostics`（58） | Angular だけ | TS の配列の後ろに Angular の配列 |
| `getCompilerOptionsDiagnostics`（206） | Angular だけ（ファイルによらず angularOnly だけで決まる） | TS + Angular |   |
| `getEncodedSemanticClassifications`（125） | Angular だけ | Angular の spans の後ろに TS の spans。`endOfLineState` は TS（138 行目） |   |
| **TS が先、無ければ Angular** | `withFallback` を使うもの：`getQuickInfoAtPosition`（76）・`getTypeDefinitionAtPosition`（80）・`getDefinitionAndBoundSpan`（87）・`getCompletionsAtPosition`（150）・`getCompletionEntryDetails`（158）・`getCompletionEntrySymbol`（190）・`getSignatureHelpItems`（215）・`getOutliningSpans`（223） | Angular だけ | TS が `undefined` なら Angular |
| `getCodeFixesAtPosition`（280〜303）・`getCombinedCodeFix`（306） | Angular だけ（`getCombinedCodeFix` は angularOnly だけで決まる） | TS の結果が空（長さ 0）なら Angular |   |
| **Angular が先** | `getLinkedEditingRangeAtPosition`（327） | .html では何もしない（334〜336 行目）。.ts では Angular だけ | Angular が無ければ TS |
| **Angular だけ** | `getReferencesAtPosition`（101）・`findRenameLocations`（108）・`getRenameInfo`（119）・`getApplicableRefactors`（251） | angularOnly によらず Angular だけ |   |
| Angular 独自：`getTcb`・`getComponentLocationsForTemplate`・`getTemplateLocationForComponent`・`applyRefactoring`・`ensureProjectAnalyzed`・`getAngularInlayHints`・`getTemplateDocumentSymbols`・`hasCodeFixesForErrorCode`・`getTokenTypeFromClassification` など | Angular だけ（TS には無いメソッド） |   |   |
| **TS だけ** | `getSyntacticDiagnostics`（48） | 空の配列（53〜54 行目：テンプレートの構文エラーは意味の診断のほうで出す） | TS |
| **そのまま** | 上に無い全部（373 行目の `...tsLS`） | TypeScript の言語サービスのメソッドがそのまま使われる |   |

1. **参照と名前変更だけは、angularOnly を見ない（108〜123 行目）**

   112〜115 行目のコメントのとおり、エディタは名前変更の結果を 1 つの提供者からしか使いません。だから Angular の答えは「TS のファイルの中の場所」も含んだ上位集合にしてあり、TS の結果を混ぜる必要がありません。参照の検索（105 行目）も Angular の答えだけを返します（TS のファイルからの検索も Angular が TS に尋ねて組み立てる。[第 11 回](11-ls-references-rename.md)）。
2. **補完の詳細は、どちらに尋ねたかで引数が違う（167〜187 行目）**

   168 行目で `ls === tsLS` を比べ、TS なら `source` を含む 7 つの引数、Angular なら 179 行目の `source` の無い形で呼びます。`LanguageService` の側のメソッドの形が TS と少し違うからです。
3. **リファクタリングは TS に回さない（255〜261 行目）**

   コメントの理由は「拡張の LSP サーバーが TS のリファクタリングを正しく扱えないため」。TS の組み込みのリファクタリングは VS Code の組み込みの TypeScript 拡張が出すので、隠れることはない、と書いています（[第 19 回](19-ls-refactorings.md)）。
4. **コード修正は「TS が何か返せば TS」（299〜302 行目）**

   `withFallback` と違い、`undefined` ではなく「長さ 0」で判定します。`getCodeFixesAtPosition` の戻り値の型は `readonly ts.CodeFixAction[]` で、「答えが無い」は空の配列で表されるからです（[第 18 回](18-ls-code-fixes.md)）。
5. **戻り値の組み立て（372〜406 行目）**

   373 行目で TypeScript の言語サービスの全部のメソッドを広げてから、374〜405 行目で上書きします。398 行目の `hasCodeFixesForErrorCode` だけは関数を作らず、`bind` で `ngLS` のメソッドをそのまま渡しています。

## 4. NgLanguageService の型

📄 `angular/packages/language-service/api.ts` L415–428 （▶ の行: 417, 419, 426, 428）

```ts
415 │ /**
416 │  * `NgLanguageService` describes an instance of an Angular language service,
417 ▶  * whose API surface is a strict superset of TypeScript's language service.
418 │  */
419 ▶ export interface NgLanguageService extends ts.LanguageService {
420 │   /**
421 │    * Triggers the Angular compiler's analysis pipeline without performing
422 │    * per-file type checking. This is a lighter alternative to calling
423 │    * `getSemanticDiagnostics()` when the goal is only to ensure that the
424 │    * Angular project has been analyzed (e.g. during project initialization).
425 │    */
426 ▶   ensureProjectAnalyzed(): void;
427 │ 
428 ▶   getTcb(fileName: string, position: number): GetTcbResponse | undefined;
```

📄 `angular/packages/language-service/api.ts` L485–502 （▶ の行: 485, 492, 494–495, 498–501）

```ts
485 ▶   applyRefactoring(
486 │     fileName: string,
487 │     positionOrRange: number | ts.TextRange,
488 │     refactorName: string,
489 │     reportProgress: ApplyRefactoringProgressFn,
490 │   ): Promise<ApplyRefactoringResult | undefined>;
491 │ 
492 ▶   hasCodeFixesForErrorCode(errorCode: number): boolean;
493 │ 
494 ▶   getTokenTypeFromClassification(classification: number): number | undefined;
495 ▶   getTokenModifierFromClassification(classification: number): number;
496 │ }
497 │ 
498 ▶ export function isNgLanguageService(
499 ▶   ls: ts.LanguageService | NgLanguageService,
500 ▶ ): ls is NgLanguageService {
501 ▶   return 'getTcb' in ls;
502 │ }
```

417 行目のコメントのとおり、`NgLanguageService` は TypeScript の言語サービスの「真の上位集合」で、419 行目で `ts.LanguageService` を継承し、Angular 独自のメソッドを足しています。足しているのは `ensureProjectAnalyzed`（426 行目）・`getTcb`（428 行目、[第 2 回](02-ls-client.md)）・`getLinkedEditingRangeAtPosition`（TS にもあるが Angular の答えの型で上書き）・`getComponentLocationsForTemplate`・`getTemplateLocationForComponent`・`getTypescriptLanguageService`・ `getAngularInlayHints`・`getTemplateDocumentSymbols`・`applyRefactoring`（485 行目）・`hasCodeFixesForErrorCode`（492 行目）・`getTokenTypeFromClassification`・`getTokenModifierFromClassification`（494〜495 行目）です。498〜502 行目の `isNgLanguageService` は、`getTcb` という名前のメソッドを持つかだけで判定します。`NgLanguageService` は interface なので実行時に `instanceof` では調べられず、メソッドの有無で見分けます。サーバーはこの関数を `@angular/language-service/api` から import して使います（[第 1 回](01-ls-overview.md)の 1 節）。

## 5. プラグインの設定と、使われていない 2 つの項目

📄 `angular/vscode-ng-language-service/server/src/session.ts` L211–238 （▶ の行: 211–212, 214–215, 217–218, 220–221, 224, 227, 232–234）

```ts
211 ▶     const pluginConfig: PluginConfig = {
212 ▶       angularOnly: true,
213 │     };
214 ▶     if (options.forceStrictTemplates) {
215 ▶       pluginConfig.forceStrictTemplates = true;
216 │     }
217 ▶     if (options.disableLetSyntax) {
218 ▶       pluginConfig.enableLetSyntax = false;
219 │     }
220 ▶     if (options.angularCoreVersion !== null) {
221 ▶       pluginConfig.angularCoreVersion = options.angularCoreVersion;
222 │     }
223 │     if (options.suppressAngularDiagnosticCodes !== null) {
224 ▶       const parsedDiagnosticCodes = options.suppressAngularDiagnosticCodes
225 │         .split(',')
226 │         .map((c) => parseInt(c));
227 ▶       pluginConfig.suppressAngularDiagnosticCodes = [
228 │         ...alwaysSuppressDiagnostics,
229 │         ...parsedDiagnosticCodes,
230 │       ];
231 │     }
232 ▶     projSvc.configurePlugin({
233 ▶       pluginName: options.ngPlugin,
234 ▶       configuration: pluginConfig,
235 │     });
236 │ 
237 │     return projSvc;
238 │   }
```

📄 `angular/packages/language-service/api.ts` L17–54 （▶ の行: 22, 27, 33, 38, 43, 48, 53）

```ts
17 │ export interface PluginConfig {
18 │   /**
19 │    * If true, return only Angular results. Otherwise, return Angular + TypeScript
20 │    * results.
21 │    */
22 ▶   angularOnly: boolean;
23 │   /**
24 │    * If true, enable `strictTemplates` in Angular compiler options regardless
25 │    * of its value in tsconfig.json.
26 │    */
27 ▶   forceStrictTemplates?: true;
28 │ 
29 │   /**
30 │    * If false, disables parsing control flow blocks in the compiler. Should be used only when older
31 │    * versions of Angular that do not support blocks (pre-v17) used with the language service.
32 │    */
33 ▶   enableBlockSyntax?: false;
34 │ 
35 │   /**
36 │    * Version of `@angular/core` that was detected in the user's workspace.
37 │    */
38 ▶   angularCoreVersion?: string;
39 │ 
40 │   /**
41 │    * If false, disables parsing of `@let` declarations in the compiler.
42 │    */
43 ▶   enableLetSyntax?: false;
44 │ 
45 │   /**
46 │    * Whether selectorless is enabled.
47 │    */
48 ▶   enableSelectorless?: true;
49 │ 
50 │   /**
51 │    * A list of diagnostic codes that should be supressed in the language service.
52 │    */
53 ▶   suppressAngularDiagnosticCodes?: number[];
54 │ }
```

サーバーは `ProjectService` を作った直後に、232〜235 行目の `configurePlugin` でプラグインの設定を渡します。これが 3 節の `info.config` になります。212 行目、**`angularOnly` は常に `true`**です。だから VS Code の拡張のサーバーでは、3 節の表の右の列（TS の結果を混ぜる経路）は使われません。TS の普通の結果は VS Code 組み込みの TypeScript 拡張が出します。214〜216 行目の `forceStrictTemplates`、220〜222 行目の `angularCoreVersion`、223〜231 行目の黙らせるエラー番号（カンマ区切りを数の配列に）は、`LanguageService` がコンパイラの設定を読むときに使います（[第 5 回](05-ls-compiler-factory.md)・[第 8 回](08-ls-diagnostics.md)）。

残る 2 つは、たどると行き止まりです。217〜219 行目は `--disableLetSyntax` のとき `enableLetSyntax = false` を設定しますが、api.ts の 33 行目の `enableBlockSyntax` と 43 行目の `enableLetSyntax` を読む行は、`git grep` で探した範囲（packages と vscode-ng-language-service）では**どこにもありません**。`--disableBlockSyntax` のほうは、サーバーの `SessionOptions` まで届きますが、この関数は読んでいません。読んでいた行は 2025-09-13 の 7fd3db04232（「remove internal syntax-related flags」、#63787）で消え、コンパイラは代わりに Angular の版から決めるようになりました。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L469–474 （▶ の行: 469–474）

```ts
469 ▶     this.enableBlockSyntax =
470 ▶       this.angularCoreVersion === null ||
471 ▶       coreVersionSupportsFeature(this.angularCoreVersion, '>= 17.0.0');
472 ▶     this.enableLetSyntax =
473 ▶       this.angularCoreVersion === null ||
474 ▶       coreVersionSupportsFeature(this.angularCoreVersion, '>= 18.1.0');
```

469〜474 行目、`NgCompiler` はブロックの構文を「Angular の版が分からないか 17.0.0 以上」、`@let` を「分からないか 18.1.0 以上」で有効にします。言語サービスでの版は 220〜222 行目の `angularCoreVersion` と、プロジェクトの `@angular/core` から検出した版です（第 5 回）。つまり[第 2 回](02-ls-client.md)の 3 節で拡張が計算していた `--disableBlockSyntax`・`--disableLetSyntax` は、このスナップショットでは解析に効いていません。同じ判断は版からされているので、振る舞いの違いにはなりません。

## 6. 名前変更を Angular に回す：override\_rename\_ts\_plugin.ts

📄 `angular/packages/language-service/README.md` L1–13 （▶ の行: 3, 5, 7, 9）

```md
 1 │ ## Override Rename Ts Plugin
 2 │ 
 3 ▶ When the user wants to rename a symbol in the ts file VSCode will ask the rename providers for the answer in turn. If the first extension returns the result, the VSCode will break the loop and apply the result. If the first extension cannot rename the symbol, VSCode will ask the second extension in the list (built-in TS/JS extension, Angular LS extension, etc.). In other words, VSCode takes the result from only one rename provider and the order depends on registration timing, scoring.
 4 │ 
 5 ▶ Because the built-in ts extension and Angular extension have the same high score, if the built-in ts extension is the first(depends on the time the extension was registered), the result will be provided by the built-in extension. We want Angular to provide it, so this plugin will delegate rename requests and reject the request for the built-in ts server.
 6 │ 
 7 ▶ The Angular LS only provides the rename info when working within an Angular project. If we cannot locate Angular sources in the project files, the built-in extension should provide the rename info.
 8 │ 
 9 ▶ This plugin will apply to the built-in TS/JS extension and delegate rename requests to the Angular LS. It provides the rename info only when it is an Angular project. Otherwise, it will return info by the default built-in ts server rename provider.
10 │ 
11 │ See [here][1] for more info.
12 │ 
13 │ [1]: https://github.com/microsoft/vscode/issues/115354
```

📄 `angular/packages/language-service/override_rename_ts_plugin.ts` L23–58 （▶ の行: 27, 29–30, 35–36, 41, 44, 46–47, 50）

```ts
23 │ /**
24 │  * This factory is used to disable the built-in rename provider,
25 │  * see `packages/language-service/README.md#override-rename-ts-plugin` for more info.
26 │  */
27 ▶ const factory: ts.server.PluginModuleFactory = (): ts.server.PluginModule => {
28 │   return {
29 ▶     create(info: ts.server.PluginCreateInfo): ts.LanguageService {
30 ▶       const {project, languageService} = info;
31 │       /** A map that indicates whether Angular could be found in the file's project. */
32 │       const fileToIsInAngularProjectMap = new Map<string, boolean>();
33 │ 
34 │       return {
35 ▶         ...languageService,
36 ▶         getRenameInfo: (fileName, position) => {
37 │           let isInAngular: boolean;
38 │           if (fileToIsInAngularProjectMap.has(fileName)) {
39 │             isInAngular = fileToIsInAngularProjectMap.get(fileName)!;
40 │           } else {
41 ▶             isInAngular = project.getFileNames().some(isAngularCore);
42 │             fileToIsInAngularProjectMap.set(fileName, isInAngular);
43 │           }
44 ▶           if (isInAngular) {
45 │             return {
46 ▶               canRename: false,
47 ▶               localizedErrorMessage: 'Delegating rename to the Angular Language Service.',
48 │             };
49 │           } else {
50 ▶             return languageService.getRenameInfo(fileName, position);
51 │           }
52 │         },
53 │       };
54 │     },
55 │   };
56 │ };
57 │ 
58 │ export {factory};
```

README の 3 行目、VS Code は名前変更の提供者に順に尋ね、**最初に答えた 1 つの結果だけ**を使います。5 行目、組み込みの TypeScript 拡張と Angular の拡張は同じ高い点数なので、登録の早いほうが勝ち、組み込みが先だと Angular の答え（テンプレートの中も変える）が使われません。そこで 9 行目、**組み込みの TypeScript 拡張の tsserver に入れる**別のプラグインを用意しました。それが override\_rename\_ts\_plugin.ts で、35 行目で元の言語サービスを広げ、36 行目の `getRenameInfo` だけを差し替えます。41 行目でプロジェクトのファイルに `@angular/core` の `.d.ts` があれば、44〜48 行目で「名前変更できない（Angular に任せる）」と答え、無ければ 50 行目で TypeScript の答えを返します。

📄 `angular/packages/language-service/BUILD.bazel` L78–97 （▶ の行: 79–81, 85, 89）

```python
78 │ npm_package(
79 ▶     srcs = [
80 ▶         "index.d.ts",
81 ▶         "index.js",
82 │         "package.json",
83 │         ":api_bundle",
84 │         ":api_types",
85 ▶         ":factory_bundle",
86 │         ":factory_lib_types",
87 │         ":private_bundle",
88 │         ":private_type_definitions",
89 ▶         "//packages/language-service/bundles:language-service.js",
90 │     ],
91 │     package = "@angular/language-service",
92 │     tags = [
93 │         "release-with-framework",
94 │     ],
95 │     # Do not add more to this list.
96 │     # Dependencies on the full npm_package cause long re-builds.
97 │     visibility = [],
```

ただし、このスナップショットではこのプラグインは配られていません。79〜90 行目の npm のパッケージの材料に override\_rename\_ts\_plugin.ts から作るものは無く、BUILD.bazel のどのターゲットの `srcs` にもありません。`git grep override_rename` で見つかるのはファイル自身のコメントだけで、拡張の package.json にも組み込みの TS 拡張にプラグインを入れる項目（`typescriptServerPlugins`）はありません。履歴をたどると、2022-01-12 の 9d4af65e343（#44696）で足され、2022-12-14 の acf98268f80（#48521、ESM への移行）で BUILD の `api` ターゲットの `srcs` から外れています。今の拡張は、名前変更の優先を別の方法で扱っています。

📄 `angular/vscode-ng-language-service/client/src/client.ts` L117–137 （▶ の行: 123–133, 135）

```ts
117 │         prepareRename: async (
118 │           document: vscode.TextDocument,
119 │           position: vscode.Position,
120 │           token: vscode.CancellationToken,
121 │           next: lsp.PrepareRenameSignature,
122 │         ) => {
123 ▶           // We are able to provide renames for many types of string literals: template strings,
124 ▶           // pipe names, and hopefully in the future selectors and input/output aliases. Because
125 ▶           // TypeScript isn't able to provide renames for these, we can more or less
126 ▶           // guarantee that the Angular Language service will be called for the rename as the
127 ▶           // fallback. We specifically do not provide renames outside of string literals
128 ▶           // because we cannot ensure our extension is prioritized for renames in TS files (see
129 ▶           // https://github.com/microsoft/vscode/issues/115354) we disable renaming completely so we
130 ▶           // can provide consistent expectations.
131 ▶           if (
132 ▶             (await this.isInAngularProject(document)) &&
133 ▶             isInsideStringLiteral(document, position)
134 │           ) {
135 ▶             return next(document, position, token);
136 │           }
137 │         },
```

拡張の `prepareRename` の middleware は、123〜130 行目のコメントのとおり「TypeScript が名前変更できない文字列リテラル（テンプレート・pipe の名前など）の中」だけで Angular に名前変更を許します。文字列の中なら TypeScript は名前変更できないので、VS Code が次に Angular の提供者に尋ねることを、コメントは「ほぼ保証できる（more or less guarantee）」と書いています。文字列の外（TS のクラスのプロパティなど）では、131〜136 行目の条件を満たさず、Angular の拡張は名前変更に答えません。名前変更の中身は[第 11 回](11-ls-references-rename.md)で読みます。

## テストと直し方

📄 `angular/packages/language-service/test/legacy/ts_plugin_spec.ts` L16–33 （▶ の行: 16, 19, 21, 24, 26–27, 29, 31–32）

```ts
16 ▶ describe('getExternalFiles()', () => {
17 │   it('should return all typecheck files', () => {
18 │     const {project, tsLS} = setup();
19 ▶     const plugin = initialize({typescript: ts});
20 │ 
21 ▶     let externalFiles = plugin.getExternalFiles?.(project, ts.ProgramUpdateLevel.Full);
22 │     // Initially there are no external files because Ivy compiler hasn't done
23 │     // a global analysis
24 ▶     expect(externalFiles).toEqual([]);
25 │     // Trigger global analysis
26 ▶     const ngLS = new LanguageService(project, tsLS, {});
27 ▶     ngLS.getSemanticDiagnostics(APP_COMPONENT);
28 │     // Now that global analysis is run, we should have all the typecheck files
29 ▶     externalFiles = plugin.getExternalFiles?.(project, ts.ProgramUpdateLevel.Full);
30 │     // Includes 1 typecheck file, 1 template, and 1 css files
31 ▶     expect(externalFiles?.length).toBe(3);
32 ▶     expect(externalFiles?.[0].endsWith('app.component.ngtypecheck.ts')).toBeTrue();
33 │   });
```

ts\_plugin.ts を import している spec は、`test/legacy/ts_plugin_spec.ts` の 1 本だけです（`git grep "ts_plugin'"`）。describe('getExternalFiles()')（16 行目）の it 2 本は、19 行目で `initialize({typescript: ts})` を呼んでプラグインのモジュールを作り、21 行目の `getExternalFiles` が、24 行目でまだ解析していなければ空、26〜27 行目で `LanguageService` に診断を求めたあとは、31〜32 行目で型チェック用のファイル・テンプレート・CSS の 3 つを返すことを確かめます。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/language-service/test/legacy:legacy \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=getExternalFiles"
```

📄 `出力（2026-11-03 に実行。抜粋）`

```
==================== Test output for //packages/language-service/test/legacy:legacy (shard 3 of 4):
Ran 0 of 229 specs
0 specs, 0 failures
==================== Test output for //packages/language-service/test/legacy:legacy (shard 4 of 4):
Ran 0 of 229 specs
0 specs, 0 failures
==================== Test output for //packages/language-service/test/legacy:legacy (shard 1 of 4):
Ran 1 of 230 specs
1 spec, 0 failures
==================== Test output for //packages/language-service/test/legacy:legacy (shard 2 of 4):
Ran 1 of 230 specs
1 spec, 0 failures
INFO: Elapsed time: 2.170s, Critical Path: 1.86s
//packages/language-service/test/legacy:legacy                           PASSED in 1.3s
```

1. **件数**

   4 つの shard のうち 2 つに 1 本ずつ、計 2 本（ファイルの it の数と一致）。残りの 2 つの shard は「Ran 0」でも PASSED です。2.2 秒でした。
2. **spec が無いところ**

   `create` の振り分け（3 節の表）を確かめる spec はありません。`test/` の spec は `LanguageService` を直接作るので（[第 1 回](01-ls-overview.md)）通らず、LSP の往復を見る ivy\_spec.ts は angularOnly が真のサーバーを通すので、表の右の列は通りません。つまり「angularOnly が偽のとき、TS の .ts で TS が先」という経路（他のエディタが tsserver に直接このプラグインを入れる使い方）は、手元の spec では確かめられていません。
3. **直すとしたら**

   メソッドの振り分けを変えるなら ts\_plugin.ts の該当の関数で、spec は ts\_plugin\_spec.ts に、mock\_host.ts の `setup()` で作ったプロジェクトに `create({project, languageService: tsLS, config: {angularOnly: false}} as any)` のような形で足すことになります（今はこの形の spec はありません）。5 節の使われていない項目や override\_rename\_ts\_plugin.ts は、消すか使うかの判断が要る変更なので、手元では「どこからも読まれていない」ことを `git grep` で確かめるまでにします。関係する閉じた issue：#42715（2021 年、プラグインが `findRenameLocations` を上書きするのに実装していない）。一覧は[第 20 回](20-ls-issues.md)。

## 聞かれそうな質問

**Q. TS のファイルのホバーで、普通の TypeScript の型と Angular の型が両方出ることはありますか？**

VS Code の拡張のサーバーでは、1 つの提供者の答えに TS と Angular を混ぜることはしません。session.ts の 212 行目で `angularOnly: true` なので、ts\_plugin.ts の 42 行目で Angular だけに尋ねます。TS の普通のホバーは、組み込みの TypeScript 拡張が別の提供者として答えます。Angular の拡張は、デコレータの文字列の外では要求自体を送りません（[第 2 回](02-ls-client.md)の 5 節）。

**Q. なぜ plugin-factory は TypeScript のモジュールを受け取るのですか？import すればよいのでは？**

プラグインを読み込んだ側（tsserver やサーバー）と同じ TypeScript を使うためです。rollup.config.js の 28 行目で呼び手の `typescript` を受け取り、37〜38 行目で束の中の `typescript` の依存を全部それにします。import すると、プラグインの近くにある別の版の TypeScript が読まれ、`ts.Node` や `ScriptKind` の値がホストのものと食い違います（03e1a95c267 の説明）。

**Q. angularOnly が偽だと、どちらの答えが優先されますか？**

メソッドによります。`withFallback` を使うもの（ホバー・定義・補完など）は TS が先で、TS が `undefined` のときだけ Angular です（45 行目）。診断は両方を足し（69〜72 行目）、参照と名前変更は angularOnly によらず Angular だけ（105・116・122 行目）、リンクした編集は Angular が先です（339〜342 行目）。

**Q. override\_rename\_ts\_plugin は今も VS Code で動いていますか？**

このスナップショットでは配られていません。packages/language-service/BUILD.bazel の 79〜90 行目の npm のパッケージの材料に含まれず、どのビルドのターゲットにもありません（acf98268f80 で外れた）。今の拡張は、client.ts の 131〜136 行目で「文字列リテラルの中だけ Angular に名前変更させる」ことで、組み込みの TS 拡張との競合を避けています。

**Q. プラグインの設定で @let の解析を止められますか？**

できません。session.ts の 218 行目で `enableLetSyntax = false` を渡しても、それを読む行がありません（7fd3db04232 で消えた）。`@let` を解析するかは compiler.ts の 472〜474 行目のとおり Angular の版で決まります。

## 読み終えて

- パッケージの既定の export は factory 関数で、TypeScript は自分自身を渡してそれを呼び、`create` の戻り値でプロジェクトの言語サービスを置き換える。
- 本体の束は AMD の形で、`typescript` の依存だけを呼び手から受け取る。compiler-cli はこの束の中に入る。
- `create` は TS と Angular の 2 つの言語サービスを並べ、メソッドごとに「足す」「TS が先」「Angular が先」「Angular だけ」を選ぶ。VS Code のサーバーは `angularOnly: true` なので、実際には Angular だけに尋ねる。
- `NgLanguageService` は `ts.LanguageService` の上位集合で、`getTcb` を持つかで見分ける。
- プラグインの設定の `enableBlockSyntax`・`enableLetSyntax` と override\_rename\_ts\_plugin.ts は、このスナップショットではどこからも使われていない。

---

← 前: [LSP サーバーと Session：tsserver をライブラリとして動かす](03-ls-server-session.md)  
次: [CompilerFactory：NgCompiler を作り直さずに使い回す](05-ls-compiler-factory.md) →
