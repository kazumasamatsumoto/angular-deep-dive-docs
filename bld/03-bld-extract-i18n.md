[目次](../README.md) › [@angular/build の読み残し（sass・i18n・dev-server・unit-test）](README.md) › 第 3 回 / 全 9 回

# メッセージを取り出す：extract-i18n の builder

> builders/extract-i18n/builder.ts・options.ts・application-extraction.ts：ビルドの前に確かめること、format の別名と出力のパスの正規化、重複メッセージの扱いと schema.json の説明、6 つの書き手の作り方、MessageExtractor に見せる仮のファイルシステム、AOT を強制していなかったこと。

angular/angular-cli · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bld-extract-i18n)

---

この章で分かること：`ng extract-i18n` の builder が、ビルドを始める前に何を確かめ、オプション（`format`・`outFile`・`outputPath`・`i18nDuplicateTranslation`）をどう正規化し、取り出したメッセージの重複をどう扱い、6 つの書き手のどれをどんな引数で作るか。そして、ビルドの出力を `MessageExtractor` に見せる「仮のファイルシステム」が何をしているか。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/src/builders/extract-i18n/` の `builder.ts`・`options.ts`・`application-extraction.ts`・`index.ts`・`schema.json` の残りです。build ターゲットの設定を書き換えてビルドし、出力の .js を 1 つずつ `MessageExtractor` に渡し、書いたものをファイルにする 3 か所は [cli-i18n の章](../cli/09-cli-i18n.md)の 8 節で、`MessageExtractor` と `checkDuplicateMessages` の中身は [loc-extract-tool の章](../loc/15-loc-extract-tool.md)で、6 つの書き手の出力の形は [loc-serializers の章](../loc/16-loc-serializers.md)で読んだので繰り返しません。

1. [1. sass の url を書き換える](01-bld-sass-rebase.md)
2. [2. sass を常駐のコンパイラで動かす](02-bld-sass-service.md)
3. **3. メッセージを取り出す**（この章）
4. [4. 翻訳を差し込む](04-bld-i18n-inline.md)
5. [5. チャンクを束ね直す](05-bld-chunk-optimizer.md)
6. [6. ng serve の入口の残り](06-bld-dev-server-rest.md)
7. [7. Vite の middleware の残り](07-bld-vite-middlewares.md)
8. [8. unit-test と ng-packagr](08-bld-unit-test-packagr.md)
9. [9. spec と issue](09-bld-tests-issues.md)

> [!NOTE]
> **ポイント**
>
> 記録はサイトの `@angular/build` 22.2.7（`@angular/localize` 22.2.6）です。v22.2.7 と 44129f66a3 の違いは 2 つで、どちらも 44129f66a3 の後に main に入って 22.2.x にも入ったものです。`application-extraction.ts` の `buildOptions.aot = true`（22.2.7 にはある。13923047f6 / fbe208f839、6 節）と、`schema.json` の `i18nDuplicateTranslation` の説明と既定値（d53890b349 / 8957028821、3 節）です。

## 0. 全体の流れ

1. **入口で 3 つを確かめる**

   ターゲットがあるか、プロジェクトが application か、Angular の版が合うか。そして `@angular/localize/tools` を読めるか（1 節）。
2. **オプションを正規化する**

   build ターゲット・i18n の設定・format の別名・出力のパスを決める（2 節）。
3. **ビルドして取り出す**

   build ターゲットの設定を書き換えて application builder を 1 回動かし、出力の .js から `$localize` を集める（cli-i18n の章の 8 節、ここでは 5 節の仮のファイルシステム）。
4. **重複を調べる**

   同じ ID で文の違うメッセージを、warning・error・ignore のどれで扱うか（3 節）。
5. **書き手を選んで書く**

   format から 6 つの書き手の 1 つを作り、`outFile` に書く（4 節）。

## 1. 入口：builder の登録と、ビルドの前に確かめること

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/index.ts` L9–18 （▶ の行: 13, 15–16, 18）

```ts
 9 │ import { Builder, createBuilder } from '@angular-devkit/architect';
10 │ import { execute } from './builder';
11 │ import type { Schema as ExtractI18nBuilderOptions } from './schema';
12 │ 
13 ▶ export { ExtractI18nBuilderOptions, execute };
14 │ 
15 ▶ const builder: Builder<ExtractI18nBuilderOptions> =
16 ▶   createBuilder<ExtractI18nBuilderOptions>(execute);
17 │ 
18 ▶ export default builder;
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/builder.ts` L9–45 （▶ の行: 9, 19, 21, 24, 27–29, 34, 37–38, 40）

```ts
 9 ▶ import type { Diagnostics } from '@angular/localize/tools';
10 │ import type { BuilderContext, BuilderOutput } from '@angular-devkit/architect';
11 │ import fs from 'node:fs';
12 │ import path from 'node:path';
13 │ import { assertCompatibleAngularVersion } from '../../utils/version';
14 │ import type { ApplicationBuilderExtensions } from '../application/options';
15 │ import { normalizeOptions } from './options';
16 │ import { Schema as ExtractI18nBuilderOptions, Format } from './schema';
17 │ 
18 │ /**
19 ▶  * @experimental Direct usage of this function is considered experimental.
20 │  */
21 ▶ export async function execute(
22 │   options: ExtractI18nBuilderOptions,
23 │   context: BuilderContext,
24 ▶   extensions?: ApplicationBuilderExtensions,
25 │ ): Promise<BuilderOutput> {
26 │   // Determine project name from builder context target
27 ▶   const projectName = context.target?.project;
28 ▶   if (!projectName) {
29 ▶     context.logger.error(`The 'extract-i18n' builder requires a target to be specified.`);
30 │ 
31 │     return { success: false };
32 │   }
33 │ 
34 ▶   const { projectType } = (await context.getProjectMetadata(projectName)) as {
35 │     projectType?: string;
36 │   };
37 ▶   if (projectType !== 'application') {
38 ▶     context.logger.error(
39 │       `Tried to extract from ${projectName} with 'projectType' ${projectType}, which is not supported.` +
40 ▶         ` The 'extract-i18n' builder can only extract from applications.`,
41 │     );
42 │ 
43 │     return { success: false };
44 │   }
45 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/builder.ts` L46–80 （▶ の行: 47, 51, 53, 55, 58–59, 64–65, 68–69, 73, 77–78）

```ts
46 │   // Check Angular version.
47 ▶   assertCompatibleAngularVersion(context.workspaceRoot);
48 │ 
49 │   // Load the Angular localize package.
50 │   // The package is a peer dependency and might not be present
51 ▶   let localizeToolsModule;
52 │   try {
53 ▶     localizeToolsModule = await import('@angular/localize/tools');
54 │   } catch {
55 ▶     return {
56 │       success: false,
57 │       error:
58 ▶         `i18n extraction requires the '@angular/localize' package.` +
59 ▶         ` You can add it by using 'ng add @angular/localize'.`,
60 │     };
61 │   }
62 │ 
63 │   // Normalize options
64 ▶   const normalizedOptions = await normalizeOptions(context, projectName, options);
65 ▶   const builderName = await context.getBuilderNameForTarget(normalizedOptions.buildTarget);
66 │ 
67 │   // Extract messages based on configured builder
68 ▶   const { extractMessages } = await import('./application-extraction');
69 ▶   const extractionResult = await extractMessages(
70 │     normalizedOptions,
71 │     builderName,
72 │     context,
73 ▶     localizeToolsModule.MessageExtractor,
74 │     extensions,
75 │   );
76 │ 
77 ▶   if (!extractionResult.success) {
78 ▶     return { success: false };
79 │   }
80 │ 
```

1. **index.ts の 15〜16 行目：createBuilder**

   `execute` を architect の builder にする。13 行目で `execute` そのものも出しているので、19 行目の `@experimental` のとおり、ほかのツールが直接呼べる。そのときだけ 24 行目の `extensions`（application builder に足すプラグイン）を渡せる。
2. **27〜44 行目：ターゲットとプロジェクトの種類**

   `ng run` でなく関数として呼ばれてターゲットが無いとき、または angular.json の `projectType` が application でないときは、ログに出して失敗を返す。ライブラリからは取り出せない。
3. **47 行目：Angular の版**

   ワークスペースの `@angular/core` がこの builder と合う版かを見る。
4. **51〜61 行目：`@angular/localize/tools` を読む**

   localize は peer dependency（入れるのは利用者）なので、無ければ「`ng add @angular/localize` で足せる」と言って失敗する。9 行目は型だけの import。
5. **64〜75 行目：正規化してから、ビルドを読む**

   65 行目で build ターゲットの builder の名前を聞き、68 行目で `application-extraction.ts` を `import()` で読む。73 行目で localize の `MessageExtractor` の class を渡す（このファイルは localize を型でしか知らない）。

## 2. options.ts：オプションを 1 つの形に

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/options.ts` L9–46 （▶ の行: 16, 33, 35, 38–40, 43–44）

```ts
 9 │ import { type DiagnosticHandlingStrategy } from '@angular/localize/tools';
10 │ import { BuilderContext, targetFromTargetString } from '@angular-devkit/architect';
11 │ import { fail } from 'node:assert';
12 │ import path from 'node:path';
13 │ import { type I18nOptions, createI18nOptions } from '../../utils/i18n-options';
14 │ import { Schema as ExtractI18nOptions, Format } from './schema';
15 │ 
16 ▶ export type NormalizedExtractI18nOptions = Awaited<ReturnType<typeof normalizeOptions>>;
17 │ 
18 │ /**
19 │  * Normalize the user provided options by creating full paths for all path based options
20 │  * and converting multi-form options into a single form that can be directly used
21 │  * by the build process.
22 │  *
23 │  * @param context The context for current builder execution.
24 │  * @param projectName The name of the project for the current execution.
25 │  * @param options An object containing the options to use for the build.
26 │  * @returns An object containing normalized options required to perform the build.
27 │  */
28 │ export async function normalizeOptions(
29 │   context: BuilderContext,
30 │   projectName: string,
31 │   options: ExtractI18nOptions,
32 │ ) {
33 ▶   const workspaceRoot = context.workspaceRoot;
34 │   const projectMetadata = await context.getProjectMetadata(projectName);
35 ▶   const projectRoot = path.join(workspaceRoot, (projectMetadata.root as string | undefined) ?? '');
36 │ 
37 │   // Target specifier defaults to the current project's build target with no specified configuration
38 ▶   const buildTargetSpecifier = options.buildTarget ?? ':';
39 ▶   const buildTarget = targetFromTargetString(buildTargetSpecifier, projectName, 'build');
40 ▶   const i18nOptions: I18nOptions & {
41 │     duplicateTranslationBehavior: DiagnosticHandlingStrategy;
42 │   } = {
43 ▶     ...createI18nOptions(projectMetadata, /** inline */ false, context.logger),
44 ▶     duplicateTranslationBehavior: options.i18nDuplicateTranslation || 'warning',
45 │   };
46 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/options.ts` L47–78 （▶ の行: 48, 51–55, 57–59, 63–65, 67, 71, 76）

```ts
47 │   // Normalize xliff format extensions
48 ▶   let format = options.format;
49 │   switch (format) {
50 │     // Default format is xliff1
51 ▶     case undefined:
52 ▶     case Format.Xlf:
53 ▶     case Format.Xlif:
54 ▶     case Format.Xliff:
55 ▶       format = Format.Xliff;
56 │       break;
57 ▶     case Format.Xlf2:
58 ▶     case Format.Xliff2:
59 ▶       format = Format.Xliff2;
60 │       break;
61 │   }
62 │ 
63 ▶   let outFile = options.outFile || getDefaultOutFile(format);
64 ▶   if (options.outputPath) {
65 ▶     outFile = path.join(options.outputPath, outFile);
66 │   }
67 ▶   outFile = path.resolve(context.workspaceRoot, outFile);
68 │ 
69 │   return {
70 │     workspaceRoot,
71 ▶     projectRoot,
72 │     buildTarget,
73 │     i18nOptions,
74 │     format,
75 │     outFile,
76 ▶     progress: options.progress ?? true,
77 │   };
78 │ }
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/options.ts` L80–95 （▶ の行: 82–83, 86, 89, 91, 93）

```ts
80 │ function getDefaultOutFile(format: Format) {
81 │   switch (format) {
82 ▶     case Format.Xmb:
83 ▶       return 'messages.xmb';
84 │     case Format.Xliff:
85 │     case Format.Xliff2:
86 ▶       return 'messages.xlf';
87 │     case Format.Json:
88 │     case Format.LegacyMigrate:
89 ▶       return 'messages.json';
90 │     case Format.Arb:
91 ▶       return 'messages.arb';
92 │     default:
93 ▶       fail(`Invalid Format enum value: ${format as unknown}`);
94 │   }
95 │ }
```

1. **38〜39 行目：build ターゲット**

   書かなければ `':'`。`targetFromTargetString` は空の部分を今のプロジェクトと `build` で埋めるので、「このプロジェクトの build、構成なし」になる。
2. **40〜45 行目：i18n の設定**

   angular.json の `i18n`（sourceLocale と locales）を、43 行目の 2 番目の引数を偽（ロケールごとに書き換えない）にして読む。44 行目、重複の扱いは書かなければ `'warning'`。
3. **48〜61 行目：format の別名を 2 つに畳む**

   無し・`xlf`・`xlif`・`xliff` は `xliff`、`xlf2`・`xliff2` は `xliff2`。`xmb`・`json`・`arb`・`legacy-migrate` はそのまま。
4. **63〜67 行目：出力のパス**

   `outFile` が無ければ 80〜95 行目の既定の名前、`outputPath` があればその下に `path.join` でつなぎ、67 行目でワークスペースの根からの絶対パスにする。
5. **80〜95 行目：既定の名前**

   xliff と xliff2 はどちらも `messages.xlf`、json と legacy-migrate はどちらも `messages.json`。同じフォルダで format だけ変えて走らせると、前のファイルを上書きする。

71 行目の `projectRoot` は返しますが、`builder.ts` と `application-extraction.ts` のどちらも読みません。出力のパスの基準は 67 行目のとおりワークスペースの根で、プロジェクトの根ではありません。76 行目の `progress`（3 節で引く schema.json の 20 行目は「進み具合をコンソールに出す」）は、4 節の 130 行目の 1 行だけに効きます。中で動くビルドの「Building...」は build ターゲットの設定のまま出ます（デモの「--progress false」）。

> [!WARNING]
> **ハマりどころ**
>
> 64〜65 行目の `path.join` は、`outFile` が絶対パスでも前に `outputPath` を付けます。`--output-path out --out-file <app>/abs.xlf` では、`out/<app>/abs.xlf` という深いフォルダができました（デモ）。schema.json の 29 行目の `outFile` の説明は「出力するファイルの名前」なので、絶対パスを渡すのは想定の外とも読めますが、検査はありません。新しい本家（1e4b0960d8）も同じ行です。

## 3. 重複の扱いと、schema.json の説明

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/builder.ts` L81–109 （▶ の行: 82, 86–87, 91–92, 95–96, 98, 100–102, 104, 106）

```ts
 81 │   // Perform duplicate message checks
 82 ▶   const { checkDuplicateMessages } = localizeToolsModule;
 83 │ 
 84 │   // The filesystem is used to create a relative path for each file
 85 │   // from the basePath.  This relative path is then used in the error message.
 86 ▶   const checkFileSystem = {
 87 ▶     relative(from: string, to: string): string {
 88 │       return path.relative(from, to);
 89 │     },
 90 │   };
 91 ▶   const duplicateTranslationBehavior = normalizedOptions.i18nOptions.duplicateTranslationBehavior;
 92 ▶   const diagnostics = checkDuplicateMessages(
 93 │     // eslint-disable-next-line @typescript-eslint/no-explicit-any
 94 │     checkFileSystem as any,
 95 ▶     extractionResult.messages,
 96 ▶     duplicateTranslationBehavior,
 97 │     // eslint-disable-next-line @typescript-eslint/no-explicit-any
 98 ▶     extractionResult.basePath as any,
 99 │   );
100 ▶   if (diagnostics.messages.length > 0 && duplicateTranslationBehavior !== 'ignore') {
101 ▶     if (duplicateTranslationBehavior === 'error') {
102 ▶       context.logger.error(`Extraction Failed: ${diagnostics.formatDiagnostics('')}`);
103 │ 
104 ▶       return { success: false };
105 │     } else {
106 ▶       context.logger.warn(diagnostics.formatDiagnostics(''));
107 │     }
108 │   }
109 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/schema.json` L1–38 （▶ の行: 20, 29, 31, 33–34）

```json
 1 │ {
 2 │   "$schema": "http://json-schema.org/draft-07/schema",
 3 │   "title": "Extract i18n Target",
 4 │   "description": "Extract i18n target options for Build Facade.",
 5 │   "type": "object",
 6 │   "properties": {
 7 │     "buildTarget": {
 8 │       "type": "string",
 9 │       "description": "A builder target to extract i18n messages in the format of `project:target[:configuration]`. You can also pass in more than one configuration name as a comma-separated list. Example: `project:target:production,staging`.",
10 │       "pattern": "^[^:\\s]*:[^:\\s]*(:[^\\s]+)?$"
11 │     },
12 │     "format": {
13 │       "type": "string",
14 │       "description": "Output format for the generated file.",
15 │       "default": "xlf",
16 │       "enum": ["xmb", "xlf", "xlif", "xliff", "xlf2", "xliff2", "json", "arb", "legacy-migrate"]
17 │     },
18 │     "progress": {
19 │       "type": "boolean",
20 ▶       "description": "Log progress to the console.",
21 │       "default": true
22 │     },
23 │     "outputPath": {
24 │       "type": "string",
25 │       "description": "Path where output will be placed."
26 │     },
27 │     "outFile": {
28 │       "type": "string",
29 ▶       "description": "Name of the file to output."
30 │     },
31 ▶     "i18nDuplicateTranslation": {
32 │       "type": "string",
33 ▶       "description": "How to handle duplicate translations.",
34 ▶       "enum": ["error", "warning", "ignore"]
35 │     }
36 │   },
37 │   "additionalProperties": false
38 │ }
```

1. **86〜90 行目：relative だけのファイルシステム**

   `checkDuplicateMessages` は、診断に出すファイルの名前を根からの相対にするのに `relative` しか使わない。
2. **92〜99 行目：調べる**

   中身は loc-extract-tool の章の 5 節。比べるのは文だけで、同じ ID・同じ文で説明（description）だけ違うものは重複と見なさない（デモの「Save」）。
3. **100〜108 行目：error なら止める、warning なら出して続ける**

   102 行目の「Extraction Failed:」の後ろに診断を付けて失敗を返す。warning は 106 行目でログに出し、ファイルは書く。

schema.json の 33 行目の説明は「How to handle duplicate translations.」で、34 行目に既定値がありません。でもこのオプションが扱うのは翻訳ではなく抽出のときのメッセージの重複で、既定は options.ts の 44 行目の `'warning'` です。新しい本家では d53890b349 で「How to handle duplicate messages found during extraction.」と `"default": "warning"` に直りました（コミットの説明は「build のときの、翻訳ファイルを合わせるオプションの説明を写したもの」）。サイトの 22.2.7 の schema.json も直った形です。

## 4. 書き手を選んで、書く

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/builder.ts` L129–153 （▶ の行: 130–131, 134, 137, 139–143）

```ts
129 │ 
130 ▶   if (normalizedOptions.progress) {
131 ▶     context.logger.info(`Extraction Complete. (Messages: ${extractionResult.messages.length})`);
132 │   }
133 │ 
134 ▶   return { success: true, outputPath: normalizedOptions.outFile };
135 │ }
136 │ 
137 ▶ async function createSerializer(
138 │   localizeToolsModule: typeof import('@angular/localize/tools'),
139 ▶   format: Format,
140 ▶   sourceLocale: string,
141 ▶   basePath: string,
142 ▶   useLegacyIds: boolean,
143 ▶   diagnostics: Diagnostics,
144 │ ) {
145 │   const {
146 │     XmbTranslationSerializer,
147 │     LegacyMessageIdMigrationSerializer,
148 │     ArbTranslationSerializer,
149 │     Xliff1TranslationSerializer,
150 │     Xliff2TranslationSerializer,
151 │     SimpleJsonTranslationSerializer,
152 │   } = localizeToolsModule;
153 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/builder.ts` L154–184 （▶ の行: 154–155, 157–158, 162–163, 166, 168–172, 177）

```ts
154 ▶   switch (format) {
155 ▶     case Format.Xmb:
156 │       // eslint-disable-next-line @typescript-eslint/no-explicit-any
157 ▶       return new XmbTranslationSerializer(basePath as any, useLegacyIds);
158 ▶     case Format.Xlf:
159 │     case Format.Xlif:
160 │     case Format.Xliff:
161 │       // eslint-disable-next-line @typescript-eslint/no-explicit-any
162 ▶       return new Xliff1TranslationSerializer(sourceLocale, basePath as any, useLegacyIds, {});
163 ▶     case Format.Xlf2:
164 │     case Format.Xliff2:
165 │       // eslint-disable-next-line @typescript-eslint/no-explicit-any
166 ▶       return new Xliff2TranslationSerializer(sourceLocale, basePath as any, useLegacyIds, {});
167 │     case Format.Json:
168 ▶       return new SimpleJsonTranslationSerializer(sourceLocale);
169 ▶     case Format.LegacyMigrate:
170 ▶       return new LegacyMessageIdMigrationSerializer(diagnostics);
171 ▶     case Format.Arb:
172 ▶       return new ArbTranslationSerializer(
173 │         sourceLocale,
174 │         // eslint-disable-next-line @typescript-eslint/no-explicit-any
175 │         basePath as any,
176 │         {
177 ▶           relative(from: string, to: string): string {
178 │             return path.relative(from, to);
179 │           },
180 │           // eslint-disable-next-line @typescript-eslint/no-explicit-any
181 │         } as any,
182 │       );
183 │   }
184 │ }
```

書き手を作る引数は、format ごとに違います。157 行目の XMB と 162・166 行目の XLIFF は `basePath`（場所を相対にする基準）と `useLegacyIds`、XLIFF はさらに元の言語（`sourceLocale`）と空の `formatOptions` です。168 行目の JSON は元の言語だけで、場所を書きません。171〜182 行目の ARB は、場所を書くのに `relative` を持つファイルシステムを要ります。170 行目の legacy-migrate だけが、3 節の 92 行目の `diagnostics` を受け取ります。localize の `LegacyMessageIdMigrationSerializer` は、同じ古い ID が 2 回出たとき（「Detected duplicate legacy ID …」）と、古い ID が 1 つも無いとき（「Could not find any legacy message IDs …」）に、ここへ警告を足します。ところが 119 行目の `serialize` の後に、`diagnostics` をログに出す行がありません。デモのアプリでは「Save」が 2 か所にあり、どちらも同じ古い ID（`52c9a103…`）を持ちます。同じ 2 つを同じ書き手に Node から直接渡すと 1 つ目の警告が足されましたが（デモの「legacy-migrate の警告」）、`ng extract-i18n --format legacy-migrate` の出力にはどちらの文も出ませんでした。

131 行目の「Extraction Complete. (Messages: 10)」の数は、重複をまとめる前の数です。デモのアプリは同じ ID を 2 か所に書いたものが 2 組あるので、xlf の `trans-unit` は 8 個でした。134 行目、architect には書いたファイルのパスを `outputPath` として返します。legacy-migrate の出力に古い ID（40 桁の 16 進や、古い 10 進）から今の ID への表が出るのは、`extractMessages` が返す `useLegacyIds: false`（loc-compiler-options の章で引いた 84〜85 行目）が「書き手が古い ID を主の ID に使うか」だけを決め、メッセージ自体は古い ID を持っているからです（cli-i18n の章の 3 節の `␟` の後ろ）。

## 5. MessageExtractor に見せる仮のファイルシステム

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/application-extraction.ts` L9–36 （▶ の行: 14, 19–20, 23, 27–28, 32–33）

```ts
 9 │ import type { ɵParsedMessage as LocalizeMessage } from '@angular/localize';
10 │ import type { MessageExtractor } from '@angular/localize/tools';
11 │ import type { BuilderContext } from '@angular-devkit/architect';
12 │ import { readFileSync } from 'node:fs';
13 │ import nodePath from 'node:path';
14 ▶ import { buildApplicationInternal } from '../application';
15 │ import type {
16 │   ApplicationBuilderExtensions,
17 │   ApplicationBuilderInternalOptions,
18 │ } from '../application/options';
19 ▶ import { ResultFile, ResultKind } from '../application/results';
20 ▶ import { OutputMode } from '../application/schema';
21 │ import type { NormalizedExtractI18nOptions } from './options';
22 │ 
23 ▶ export async function extractMessages(
24 │   options: NormalizedExtractI18nOptions,
25 │   builderName: string,
26 │   context: BuilderContext,
27 ▶   extractorConstructor: typeof MessageExtractor,
28 ▶   extensions?: ApplicationBuilderExtensions,
29 │ ): Promise<{
30 │   success: boolean;
31 │   basePath: string;
32 ▶   messages: LocalizeMessage[];
33 ▶   useLegacyIds: boolean;
34 │ }> {
35 │   const messages: LocalizeMessage[] = [];
36 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/application-extraction.ts` L54–62 （▶ の行: 55, 57–61）

```ts
54 │   // Build the application with the build options
55 ▶   const builderResult = await first(buildApplicationInternal(buildOptions, context, extensions));
56 │ 
57 ▶   let success = false;
58 ▶   if (!builderResult || builderResult.kind === ResultKind.Failure) {
59 ▶     context.logger.error('Application build failed.');
60 ▶   } else if (builderResult.kind !== ResultKind.Full) {
61 ▶     context.logger.error('Application build did not provide a full output.');
62 │   } else {
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/application-extraction.ts` L89–122 （▶ の行: 94–95, 99–100, 102, 104, 106–109, 111–112, 117, 120）

```ts
 89 │ function setupLocalizeExtractor(
 90 │   extractorConstructor: typeof MessageExtractor,
 91 │   files: readonly ResultFile[],
 92 │   context: BuilderContext,
 93 │ ): MessageExtractor {
 94 ▶   const fileMap = new Map(files.map((file) => [file.path, file]));
 95 ▶   const textDecoder = new TextDecoder();
 96 │   // Setup a virtual file system instance for the extractor
 97 │   // * MessageExtractor itself uses readFile, relative and resolve
 98 │   // * Internal SourceFileLoader (sourcemap support) uses dirname, exists, readFile, and resolve
 99 ▶   const filesystem = {
100 ▶     readFile(path: string): string {
101 │       // Output files are stored as relative to the workspace root
102 ▶       const requestedPath = nodePath.relative(context.workspaceRoot, path);
103 │ 
104 ▶       const file = fileMap.get(requestedPath);
105 │       let content;
106 ▶       if (file?.origin === 'memory') {
107 ▶         content = textDecoder.decode(file.contents);
108 ▶       } else if (file?.origin === 'disk') {
109 ▶         content = readFileSync(file.inputPath, 'utf-8');
110 │       }
111 ▶       if (content === undefined) {
112 ▶         throw new Error('Unknown file requested: ' + requestedPath);
113 │       }
114 │ 
115 │       return content;
116 │     },
117 ▶     relative(from: string, to: string): string {
118 │       return nodePath.relative(from, to);
119 │     },
120 ▶     resolve(...paths: string[]): string {
121 │       return nodePath.resolve(...paths);
122 │     },
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/application-extraction.ts` L123–156 （▶ の行: 123, 125, 127, 134, 136–137, 139, 144, 153, 155–156）

```ts
123 ▶     exists(path: string): boolean {
124 │       // Output files are stored as relative to the workspace root
125 ▶       const requestedPath = nodePath.relative(context.workspaceRoot, path);
126 │ 
127 ▶       return fileMap.has(requestedPath);
128 │     },
129 │     dirname(path: string): string {
130 │       return nodePath.dirname(path);
131 │     },
132 │   };
133 │ 
134 ▶   const logger = {
135 │     // level 2 is warnings
136 ▶     level: 2,
137 ▶     debug(...args: string[]): void {
138 │       // eslint-disable-next-line no-console
139 ▶       console.debug(...args);
140 │     },
141 │     info(...args: string[]): void {
142 │       context.logger.info(args.join(''));
143 │     },
144 ▶     warn(...args: string[]): void {
145 │       context.logger.warn(args.join(''));
146 │     },
147 │     error(...args: string[]): void {
148 │       context.logger.error(args.join(''));
149 │     },
150 │   };
151 │ 
152 │   // eslint-disable-next-line @typescript-eslint/no-explicit-any
153 ▶   const extractor = new extractorConstructor(filesystem as any, logger, {
154 │     // eslint-disable-next-line @typescript-eslint/no-explicit-any
155 ▶     basePath: context.workspaceRoot as any,
156 ▶     useSourceMaps: true,
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/application-extraction.ts` L157–166 （▶ の行: 162–164）

```ts
157 │   });
158 │ 
159 │   return extractor;
160 │ }
161 │ 
162 ▶ async function first<T>(iterable: AsyncIterable<T>): Promise<T | undefined> {
163 ▶   for await (const value of iterable) {
164 ▶     return value;
165 │   }
166 │ }
```

1. **23〜34 行目：返す形**

   成功したか・場所の基準（`basePath`）・localize の `ɵParsedMessage` の配列・古い ID を使うか、の 4 つ。14 行目、ビルドは `buildApplicationInternal`（ng build の中身と同じ関数）を直接呼ぶ。
2. **55〜62 行目：最初の結果だけ**

   162〜166 行目の `first` は、ビルドの非同期の列から最初の 1 つを取って `return` する。`for await` の中の `return` で列の `return()` が呼ばれ、ビルドの列はそこで終わる。57〜61 行目、失敗か、全部でない結果（watch の差分）ならログに出す。
3. **94 行目：出力の表**

   ビルドの出力はメモリの上にある。パスはワークスペースの根からの相対（101 行目のコメント）。
4. **99〜116 行目：readFile**

   MessageExtractor は絶対パスで聞くので、102 行目で相対に戻して表を引く。106 行目、メモリの上のものは `TextDecoder` で文字にし、108〜109 行目、ディスクの上のもの（コピーするだけのアセットなど）は元のファイルを読む。無ければ 112 行目の「Unknown file requested」。
5. **123〜128 行目：exists**

   ソースマップの読み手（98 行目のコメントの `SourceFileLoader`）が、`main.js.map` のようなファイルがあるかを聞く。表にあるかだけを返す。
6. **134〜150 行目：logger**

   136 行目の `level: 2` は警告まで。`debug` だけは architect の logger でなく 139 行目の `console.debug` に出す。
7. **153〜157 行目：作る**

   155 行目の `basePath` はワークスペースの根、156 行目でソースマップをたどる。

## 6. AOT を強制していなかった（44129f66a3）

cli-i18n の章の 8 節で読んだ 42〜52 行目は、最適化・ソースマップ・localize・budgets・index.html・Service Worker・SSR を書き換えますが、44129f66a3 では `aot` に触りません。build ターゲットが `aot: false`（JIT。テンプレートをブラウザでコンパイルする）だと、テンプレートの `i18n` は出力の JS に `$localize` として出ないので、取り出せるのは .ts に書いた `$localize` だけです。

これを 22.2.7 で確かめるのに、22.2.7 の `@angular/build` を写し、`application-extraction.js` の `buildOptions.aot = true;` の 1 行だけを消した node\_modules を作りました（ほかの包みはサイトのものへの symlink）。その写しで `aot: false` の構成（`demo:build:jit`）から取り出すと「Messages: 1」で、ID は `statusLine`（.ts の `$localize`）だけでした。22.2.7 そのままでは同じ構成から 10 件です（デモの「AOT の強制」）。

直したのは 13923047f6（2026-10-10、main）と、22.2.x の fbe208f839 で、どちらも 42 行目の前に `buildOptions.aot = true;` を 1 行足しました。コミットの説明は「webpack の抽出はすでに AOT を強制していた。application の抽出も同じにする」です。固めたのは e2e の `tests/e2e/tests/i18n/extract-ivy.ts` に足した数行（angular.json の `aot` を偽にして、もう一度 `Hello world` が出ることを見る）で、`@angular/build` の spec ではありません。

## 7. デモ：本物の ng extract-i18n を走らせる

> **🧪 DEMO — 22.2.7 の ng extract-i18n の記録**
>
> アプリは 2 つのコンポーネントです。`@@sharedId` を 2 か所に違う文で、「Save」を 2 か所に違う説明（`i18n="first place"` と `"second place"`。`|` が無いので meaning でなく説明）で書き、.ts に `$localize` を 1 つ置きました。
>
> 引数：`ng extract-i18n `（1494 ms、終了コード 0）
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bld-extract-i18n)

## 呼び出しの連なり

- `ng extract-i18n → architect → builder（index.ts L15）` — extract-i18n/index.ts
  - `execute(options, context)` — builder.ts L21
    - `assertCompatibleAngularVersion / import('@angular/localize/tools')` — L47、L53
    - `normalizeOptions → createI18nOptions(…, false)` — options.ts L28、L43
    - `extractMessages → first(buildApplicationInternal(…))` — application-extraction.ts L23、L55、L162
      - `setupLocalizeExtractor → new MessageExtractor(filesystem, logger, …)` — L89、L153
    - `checkDuplicateMessages(…, duplicateTranslationBehavior)` — builder.ts L92
    - `createSerializer(format) → serialize → writeFileSync(outFile)` — L137、L119、L128

## テストと直し方

44129f66a3 の `packages/angular/build` には、extract-i18n の builder の spec がありません（`src/builders/extract-i18n/` に `*_spec.ts` も `tests/` も無く、BUILD.bazel にも extract-i18n の integration の target がない）。固めているのは e2e の `tests/e2e/tests/i18n/` の 3 つ（`extract-ivy.ts`・`extract-ivy-disk-cache.ts`・`extract-ivy-libraries.ts`）です。

📄 `angular-cli/tests/e2e/tests/i18n/extract-ivy.ts` L29–56 （▶ の行: 30, 33–34, 45, 48–49, 53）

```ts
29 │   // Ensure localize package is not present initially
30 ▶   await uninstallPackage('@angular/localize');
31 │ 
32 │   // Should fail if `@angular/localize` is missing
33 ▶   const { message: message1 } = await expectToFail(() => ng('extract-i18n'));
34 ▶   if (!message1.includes(`i18n extraction requires the '@angular/localize' package.`)) {
35 │     throw new Error('Expected localize package error message when missing');
36 │   }
37 │ 
38 │   // Install correct version
39 │   let localizeVersion = '@angular/localize@' + readNgVersion();
40 │   if (getGlobalVariable('argv')['ng-snapshots']) {
41 │     // The snapshots job won't work correctly because 'ng add' doesn't support github URLs
42 │     // localizeVersion = require('../../ng-snapshot/package.json').dependencies['@angular/localize'];
43 │     return;
44 │   }
45 ▶   await ng('add', localizeVersion, '--skip-confirmation');
46 │ 
47 │   // Should not show any warnings when extracting
48 ▶   const { stderr: message5 } = await ng('extract-i18n');
49 ▶   if (message5.includes('WARNING')) {
50 │     throw new Error('Expected no warnings to be shown. STDERR:\n' + message5);
51 │   }
52 │ 
53 ▶   await expectFileToMatch('messages.xlf', 'Hello world');
54 │ 
55 │   await uninstallPackage('@angular/localize');
56 │ }
```

33〜36 行目で localize が無いときの文（1 節の 58 行目）、48〜51 行目で警告が出ないこと、53 行目で出力に文があることを見ます。e2e は npm のパッケージを作って仮のプロジェクトに入れて走らせるもので、手元では走らせていません。format ごとの出力・重複・`outFile` と `outputPath` の組み合わせは、どの spec も見ていません。

直すなら：

- 絶対パスの `outFile`（2 節）：options.ts の 64 行目を `if (options.outputPath && !path.isAbsolute(outFile))` にするか、67 行目を `path.resolve(workspaceRoot, options.outputPath ?? '', outFile)` にする（`resolve` は絶対パスが来るとそこからやり直す）。
- legacy-migrate の警告（4 節）：builder.ts の 119 行目の後で、`diagnostics.messages` のうち 3 節で出していない分（`warning`）を `context.logger.warn` に出す。3 節の 106 行目で出した重複の警告と二重にならないよう、serialize の前の数を覚えておいて、その後ろだけを出す。
- spec を置く場所：`builders/application/tests/setup.ts` と同じ `describeBuilder` の仕組みで `builders/extract-i18n/tests/` を作り、BUILD.bazel に dev-server と同じ形の integration の target を足す。format ごとの拡張子、`i18nDuplicateTranslation: 'error'` で失敗すること、`aot: false` の build ターゲットからテンプレートの文が取れることを 1 件ずつ置ける。

## 聞かれそうな質問

**Q. ng extract-i18n は、ソースを直接読みますか？**

読みません。build ターゲットの設定を書き換えて application builder で 1 回ビルドし（cli-i18n の章の 8 節）、メモリの上の出力の .js を 99〜116 行目の仮のファイルシステム越しに MessageExtractor に読ませます。元の .ts・.html の場所は、ビルドの前に有効にしたソースマップ（cli-i18n の章の 43 行目）をたどって出します。

**Q. format に `xliff` と `xlf` の違いはありますか？**

ありません。options.ts の 51〜56 行目で `xlf`・`xlif`・`xliff`（と指定なし）はどれも `xliff` になり、162 行目の同じ `Xliff1TranslationSerializer` を作ります。`xlf2` と `xliff2` も同じです。

**Q. 同じ `@@id` を違う文で 2 か所に書くと、どうなりますか？**

既定（44 行目の warning）では 106 行目で警告を出し、ファイルには最初の 1 つの文だけが書かれます（デモの `sharedId`）。`--i18n-duplicate-translation error` なら 102 行目で失敗し、ファイルは書きません。`ignore` なら黙って書きます。

**Q. 出力のファイルはどこにできますか？**

ワークスペースの根からです（67 行目）。`--output-path src/locale` なら `src/locale/messages.xlf`。`--out-file` にフォルダを含めてもよく、無いフォルダは builder.ts の 122〜125 行目（cli-i18n の章で引いた範囲）で作られます。

**Q. `aot: false` のプロジェクトで、テンプレートの文が取れません。**

44129f66a3（と、それより前の版）では、抽出が build ターゲットの `aot` をそのまま使うからです（6 節）。13923047f6 / fbe208f839 の入った版（サイトの 22.2.7 も）では、抽出のときだけ AOT になります。

## 読み終えて

- 入口でターゲット・プロジェクトの種類・Angular の版・localize の有無を確かめ、localize の道具は `import()` で読む。
- format の別名は 2 つに畳み、出力のパスは `outputPath` と `outFile` を `path.join` してワークスペースの根から解く（絶対パスの `outFile` も前に付けてしまう）。
- 重複は文だけを比べ、error なら止め、warning なら出して最初の文を書く。
- 書き手は format ごとに違う引数で作り、legacy-migrate だけが診断を受け取る。
- 44129f66a3 は抽出で AOT を強制しておらず、JIT の build ターゲットからはテンプレートの文が取れなかった（後に直った）。

---

← 前: [sass を常駐のコンパイラで動かす：sass-service](02-bld-sass-service.md)  
次: [翻訳を差し込む：i18n-locale-plugin と翻訳の読み込み](04-bld-i18n-inline.md) →
