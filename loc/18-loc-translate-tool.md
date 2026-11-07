[目次](../README.md) › [i18n と $localize の内側](README.md) › 第 18 回 / 全 20 回

# ビルドのあとに翻訳を差し込む：localize-translate

> Translator がファイルごとにハンドラーを選び、SourceFileTranslationHandler が Babel のプラグイン（es2015\_translate\_plugin・es5\_translate\_plugin・locale\_plugin）で $localize の呼び出しを翻訳した文字列に置き換える流れ。$localize.locale を文字列にする locale\_plugin、翻訳が無いときの missingTranslation の設定、出力のパス（output\_path.ts）。CLI の I18nInliner との関係は cli-i18n へ。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/loc-translate-tool)

---

`localize-translate` は、ビルドが終わった JS の `` $localize`…` `` を、ロケールごとに翻訳済みの文字列の連結へ書き換えて、`dist/fr/` のようなフォルダに書き出す CLI です。この章では、`Translator` がファイルごとにハンドラーを選び、`SourceFileTranslationHandler` が Babel のプラグイン 3 つで `$localize` の呼び出しと `$localize.locale` を置き換え、出力のパスを決めるまでを、行を指して追います。翻訳が無いときの `missingTranslation` の 3 つの重さも、本物を Node で走らせて確かめます。

読む対象は `packages/localize/tools/src/translate/` の `cli.ts`・`index.ts`・`translator.ts`・`output_path.ts`・`source_files/`（ハンドラーと 3 つのプラグイン）・`asset_files/` と、`tools/src/source_file_utils.ts` の `buildLocalizeReplacement` などです。

1. [1. 全体像](01-loc-overview.md)
2. [2. 印とメッセージ](02-loc-markup.md)
3. [3. プレースホルダー](03-loc-placeholders.md)
4. [4. メッセージ ID](04-loc-message-id.md)
5. [5. コンパイラの段](05-loc-pipeline-phases.md)
6. [6. $localize の出力](06-loc-const-collection.md)
7. [7. ICU のコンパイル](07-loc-icu-compile.md)
8. [8. 設定と古い抽出](08-loc-compiler-options.md)
9. [9. 実行時（1）解析](09-loc-runtime-start.md)
10. [10. 実行時（2）DOM](10-loc-runtime-dom.md)
11. [11. 実行時（3）ICU](11-loc-runtime-icu.md)
12. [12. ロケールのデータ](12-loc-locale-data.md)
13. [13. $localize](13-loc-localize-tag.md)
14. [14. 実行時の翻訳](14-loc-runtime-translations.md)
15. [15. 抽出](15-loc-extract-tool.md)
16. [16. 翻訳ファイルを書く](16-loc-serializers.md)
17. [17. 翻訳ファイルを読む](17-loc-translation-parsers.md)
18. **18. 差し込み**（この章）
19. [19. テスト](19-loc-testing.md)
20. [20. issue と PR を読む](20-loc-issues.md)

## 0. 本物を 1 回走らせる

先に結果を見ます。`$localize` を 2 つと `$localize.locale` を 1 つ含む 4 行の JS と、1 つしか翻訳の無い XLIFF 1.2 を用意し、サイトの `node_modules` にある本物の CLI を走らせました。

📄 `ターミナル`

```
# scratchpad/build-loc-e/run1（2026-11-03）
$ cat src/main.js
const name = 'Kazu';
document.title = $localize`:site header|greeting@@hello:Hello ${name}:NAME:!`;
const msg = $localize`Bye ${name}:NAME: and ${3}:COUNT:`;
const lang = typeof $localize !== "undefined" && $localize.locale;

$ grep target locales/messages.fr.xlf
  <file source-language="en" target-language="fr" datatype="plaintext" original="ng2.template">
        <target>Bonjour <x id="NAME"/> !</target>

# サイトの node_modules の本物の CLI（@angular/localize 22.1.6 の bin の localize-translate）
$ node node_modules/@angular/localize/tools/bundles/src/translate/cli.js \
    -r src -s '**/*.js' -t locales/messages.fr.xlf -o 'out/{{LOCALE}}' -l en
```

📄 `出力`

```
warning: No translation found for "7498623041215131075" ("Bye {$NAME} and {$COUNT}").
（終了コード 0）

== out/en/main.js
const name="Kazu";document.title="Hello "+name+"!";const msg="Bye "+name+" and "+3+"";const lang="en";
== out/fr/main.js
const name="Kazu";document.title="Bonjour "+name+" !";const msg="Bye "+name+" and "+3+"";const lang="fr";
```

- `` $localize`…` `` は消え、`"Bonjour "+name+" !"` のような**文字列の + の連結**になりました。`:site header|greeting@@hello:` のメタデータも、`:NAME:` の名前も残りません。
- 2 つ目の `$localize` は翻訳が無いので warning が出て、元の文（`"Bye "+name+" and "+3+""`）になりました。最後の `+""` は 6 節の 77 行目が必ず足す空の部品です。
- `typeof $localize !== "undefined" && $localize.locale` は `"fr"` の 1 語になりました（7 節）。
- `-l en`（元の言語）を付けたので、翻訳を使わずに `$localize` だけを外した `out/en/` もできました（4 節）。

## 1. CLI：引数を組んで translateFiles を呼ぶ

📄 `angular/packages/localize/tools/src/translate/cli.ts` L63–91 （▶ の行: 63, 69, 73–74, 76–77, 81–82, 84–85, 89）

```ts
63 ▶   .option('o', {
64 │     alias: 'outputPath',
65 │     required: true,
66 │     describe:
67 │       'A output path pattern to where the translated files will be written.\n' +
68 │       'The path must be either absolute or relative to the current working directory.\n' +
69 ▶       'The marker `{{LOCALE}}` will be replaced with the target locale. E.g. `dist/{{LOCALE}}`.',
70 │     type: 'string',
71 │   })
72 │ 
73 ▶   .option('m', {
74 ▶     alias: 'missingTranslation',
75 │     describe: 'How to handle missing translations.',
76 ▶     choices: ['error', 'warning', 'ignore'],
77 ▶     default: 'warning',
78 │     type: 'string',
79 │   })
80 │ 
81 ▶   .option('d', {
82 ▶     alias: 'duplicateTranslation',
83 │     describe: 'How to handle duplicate translations.',
84 ▶     choices: ['error', 'warning', 'ignore'],
85 ▶     default: 'warning',
86 │     type: 'string',
87 │   })
88 │ 
89 ▶   .strict()
90 │   .help()
91 │   .parseSync();
```

63〜71 行目の `-o` は出力のパスの型で、`{{LOCALE}}` の印がロケールに置き換わります（9 節）。73〜79 行目の `-m`（`missingTranslation`）と 81〜87 行目の `-d`（`duplicateTranslation`）は、どちらも 76・84 行目の 3 択で、**CLI の既定は 77・85 行目の `'warning'`** です。89 行目の `strict()` で、知らない引数はエラーになります。

📄 `angular/packages/localize/tools/src/translate/cli.ts` L93–119 （▶ の行: 93–94, 97–100, 104, 106, 118–119）

```ts
 93 ▶ const fs = new NodeJSFileSystem();
 94 ▶ setFileSystem(fs);
 95 │ 
 96 │ const sourceRootPath = options.r;
 97 ▶ const sourceFilePaths = globSync(options.s, {cwd: sourceRootPath, onlyFiles: true});
 98 ▶ const translationFilePaths: (string | string[])[] = convertArraysFromArgs(options.t);
 99 ▶ const outputPathFn = getOutputPathFn(fs, fs.resolve(options.o));
100 ▶ const diagnostics = new Diagnostics();
101 │ const missingTranslation = options.m as DiagnosticHandlingStrategy;
102 │ const duplicateTranslation = options.d as DiagnosticHandlingStrategy;
103 │ const sourceLocale: string | undefined = options.l;
104 ▶ const translationFileLocales: string[] = options['target-locales'] || [];
105 │ 
106 ▶ translateFiles({
107 │   sourceRootPath,
108 │   sourceFilePaths,
109 │   translationFilePaths,
110 │   translationFileLocales,
111 │   outputPathFn,
112 │   diagnostics,
113 │   missingTranslation,
114 │   duplicateTranslation,
115 │   sourceLocale,
116 │ });
117 │ 
118 ▶ diagnostics.messages.forEach((m) => console.warn(`${m.type}: ${m.message}`));
119 ▶ process.exit(diagnostics.hasErrors ? 1 : 0);
```

1. **93〜94 行目：本物のファイルシステムを置く**

   `@angular/compiler-cli` のファイルシステムの抽象を Node の実装にします。spec ではここが偽物になります（[第 19 回](19-loc-testing.md)）。
2. **97 行目：-s のグロブを -r の下で展開**

   `tinyglobby` の `globSync` で、ファイルだけ（`onlyFiles`）を集めます。JS 以外（画像や `index.html`）も入ります。
3. **98 行目：-t の「\[a, b\]」を配列に**

   下の 126〜135 行目。角括弧で囲んだ引数だけを、カンマで分けて 1 つのロケールのファイル群にします。
4. **99〜104 行目：出力のパスの関数・診断・設定**

   104 行目、`--target-locales` を付けなければ空の配列で、ロケールはファイルの中から読みます（[第 17 回](17-loc-translation-parsers.md)の 2 節の 84 行目）。
5. **106〜116 行目：translateFiles**

   2 節へ。
6. **118〜119 行目：診断を全部出して、error があれば 1 で終わる**

   warning だけなら終了コードは 0 です。0 節の実行がそれでした。

📄 `angular/packages/localize/tools/src/translate/cli.ts` L121–135 （▶ の行: 128, 130–132）

```ts
121 │ /**
122 │  * Parse each of the given string `args` and convert it to an array if it is of the form
123 │  * `[abc, def, ghi]`, i.e. it is enclosed in square brackets with comma delimited items.
124 │  * @param args The string to potentially convert to arrays.
125 │  */
126 │ function convertArraysFromArgs(args: string[]): (string | string[])[] {
127 │   return args.map((arg) =>
128 ▶     arg.startsWith('[') && arg.endsWith(']')
129 │       ? arg
130 ▶           .slice(1, -1)
131 ▶           .split(',')
132 ▶           .map((arg) => arg.trim())
133 │       : arg,
134 │   );
135 │ }
```

## 2. translateFiles：読んでから、全ファイルを回す

📄 `angular/packages/localize/tools/src/translate/index.ts` L110–134 （▶ の行: 111, 113, 118–119, 122–124, 127, 131–132）

```ts
110 │ 
111 ▶   const resourceProcessor = new Translator(
112 │     fs,
113 ▶     [new SourceFileTranslationHandler(fs, {missingTranslation}), new AssetTranslationHandler(fs)],
114 │     diagnostics,
115 │   );
116 │ 
117 │   // Convert all the `translationFilePaths` elements to arrays.
118 ▶   const translationFilePathsArrays = translationFilePaths.map((filePaths) =>
119 ▶     Array.isArray(filePaths) ? filePaths.map((p) => fs.resolve(p)) : [fs.resolve(filePaths)],
120 │   );
121 │ 
122 ▶   const translations = translationLoader.loadBundles(
123 ▶     translationFilePathsArrays,
124 ▶     translationFileLocales,
125 │   );
126 │   sourceRootPath = fs.resolve(sourceRootPath);
127 ▶   resourceProcessor.translateFiles(
128 │     sourceFilePaths.map(relativeFrom),
129 │     fs.resolve(sourceRootPath),
130 │     outputPathFn,
131 ▶     translations,
132 ▶     sourceLocale,
133 │   );
134 │ }
```

パーサーを並べてローダーを作る直前の行（97〜109 行目）は[第 17 回](17-loc-translation-parsers.md)の 1 節で読みました。111〜115 行目、ハンドラーは 113 行目の 2 つで、**順番が大事**です（3 節）。`SourceFileTranslationHandler` だけが `missingTranslation` を受け取ります。118〜120 行目で、1 つのパスも配列にそろえます。122〜125 行目で**全ロケールの翻訳を先に全部読み**、127〜133 行目でファイルを回します。131 行目の `translations` は全ロケールの `TranslationBundle` の配列なので、1 つのファイルは 1 回読まれ、ロケールの数だけ書き出されます。

## 3. Translator：最初に「扱える」と答えたハンドラー

📄 `angular/packages/localize/tools/src/translate/translator.ts` L74–107 （▶ の行: 88–94, 105）

```ts
 74 │ export class Translator {
 75 │   constructor(
 76 │     private fs: ReadonlyFileSystem,
 77 │     private resourceHandlers: TranslationHandler[],
 78 │     private diagnostics: Diagnostics,
 79 │   ) {}
 80 │ 
 81 │   translateFiles(
 82 │     inputPaths: PathSegment[],
 83 │     rootPath: AbsoluteFsPath,
 84 │     outputPathFn: OutputPathFn,
 85 │     translations: TranslationBundle[],
 86 │     sourceLocale?: string,
 87 │   ): void {
 88 ▶     inputPaths.forEach((inputPath) => {
 89 ▶       const absInputPath = this.fs.resolve(rootPath, inputPath);
 90 ▶       const contents = this.fs.readFileBuffer(absInputPath);
 91 ▶       const relativePath = this.fs.relative(rootPath, absInputPath);
 92 ▶       for (const resourceHandler of this.resourceHandlers) {
 93 ▶         if (resourceHandler.canTranslate(relativePath, contents)) {
 94 ▶           return resourceHandler.translate(
 95 │             this.diagnostics,
 96 │             rootPath,
 97 │             relativePath,
 98 │             contents,
 99 │             outputPathFn,
100 │             translations,
101 │             sourceLocale,
102 │           );
103 │         }
104 │       }
105 ▶       this.diagnostics.error(`Unable to handle resource file: ${inputPath}`);
106 │     });
107 │   }
```

89〜91 行目で絶対パスにしてバイト列で読み、92〜93 行目で並んだハンドラーに `canTranslate` を聞きます。最初に true と答えたもので 94 行目の `translate` をして、そのファイルは終わりです。105 行目は、どのハンドラーも扱えなかったときの error です。ただし 2 節の 113 行目の 2 つ目の `AssetTranslationHandler` は何にでも true を返す（8 節）ので、`translateFiles` から使う限り 105 行目には来ません。第 17 回のローダーが「最初に読めると答えたパーサー」だったのと同じ形です。

## 4. SourceFileTranslationHandler：.js を Babel で書き換える

📄 `angular/packages/localize/tools/src/translate/source_files/source_file_translation_handler.ts` L29–44 （▶ の行: 34, 36–38, 42–43）

```ts
29 │ export class SourceFileTranslationHandler implements TranslationHandler {
30 │   private sourceLocaleOptions: TranslatePluginOptions;
31 │ 
32 │   constructor(
33 │     private fs: FileSystem,
34 ▶     private translationOptions: TranslatePluginOptions = {},
35 │   ) {
36 ▶     this.sourceLocaleOptions = {
37 ▶       ...this.translationOptions,
38 ▶       missingTranslation: 'ignore',
39 │     };
40 │   }
41 │ 
42 ▶   canTranslate(relativeFilePath: PathSegment | AbsoluteFsPath, _contents: Uint8Array): boolean {
43 ▶     return this.fs.extname(relativeFilePath) === '.js';
44 │   }
```

42〜44 行目、扱うのは拡張子が `.js` のファイルだけです（`.mjs` は扱いません。8 節のハンドラーがそのまま写します）。36〜39 行目、元の言語用の設定として、受け取った設定の `missingTranslation` だけを `'ignore'` にしたものを作っておきます。元の言語には翻訳が 1 つも無いので、warning にすると全部のメッセージで出てしまうからです。

📄 `angular/packages/localize/tools/src/translate/source_files/source_file_translation_handler.ts` L54–78 （▶ の行: 55, 58–60, 68–69, 72–74）

```ts
54 │   ): void {
55 ▶     const sourceCode = Buffer.from(contents).toString('utf8');
56 │     // A short-circuit check to avoid parsing the file into an AST if it does not contain any
57 │     // `$localize` identifiers.
58 ▶     if (!sourceCode.includes('$localize')) {
59 ▶       for (const translation of translations) {
60 ▶         this.writeSourceFile(
61 │           diagnostics,
62 │           outputPathFn,
63 │           translation.locale,
64 │           relativeFilePath,
65 │           contents,
66 │         );
67 │       }
68 ▶       if (sourceLocale !== undefined) {
69 ▶         this.writeSourceFile(diagnostics, outputPathFn, sourceLocale, relativeFilePath, contents);
70 │       }
71 │     } else {
72 ▶       const ast = parseSync(sourceCode, {sourceRoot, filename: relativeFilePath});
73 ▶       if (!ast) {
74 ▶         diagnostics.error(
75 │           `Unable to parse source file: ${this.fs.join(sourceRoot, relativeFilePath)}`,
76 │         );
77 │         return;
78 │       }
```

1. **58 行目：文字列 $localize が無ければ、構文木を作らない**

   59〜67 行目で各ロケールの出力先にそのまま写し、68〜70 行目で元の言語にも写します。ライブラリのチャンクのほとんどはここを通るので、Babel の parse を省けます。
2. **72 行目：あれば 1 回だけ parse**

   Babel の `parseSync` で構文木（AST）を作ります。読めなければ 73〜77 行目の error で、そのファイルは書き出されません。

📄 `angular/packages/localize/tools/src/translate/source_files/source_file_translation_handler.ts` L79–105 （▶ の行: 80–81, 83–84, 88, 91, 94, 97, 101）

```ts
 79 │       // Output a translated copy of the file for each locale.
 80 ▶       for (const translationBundle of translations) {
 81 ▶         this.translateFile(
 82 │           diagnostics,
 83 ▶           ast,
 84 ▶           translationBundle,
 85 │           sourceRoot,
 86 │           relativeFilePath,
 87 │           outputPathFn,
 88 ▶           this.translationOptions,
 89 │         );
 90 │       }
 91 ▶       if (sourceLocale !== undefined) {
 92 │         // Also output a copy of the file for the source locale.
 93 │         // There will be no translations - by definition - so we "ignore" `missingTranslations`.
 94 ▶         this.translateFile(
 95 │           diagnostics,
 96 │           ast,
 97 ▶           {locale: sourceLocale, translations: {}},
 98 │           sourceRoot,
 99 │           relativeFilePath,
100 │           outputPathFn,
101 ▶           this.sourceLocaleOptions,
102 │         );
103 │       }
104 │     }
105 │   }
```

80〜90 行目、**同じ構文木**をロケールの数だけ `translateFile` に渡します。91〜103 行目、元の言語があれば、97 行目の空の翻訳と 101 行目の ignore の設定で、もう 1 回変換します。結果は「メタデータを外しただけ」の文になります（0 節の `out/en/`）。

📄 `angular/packages/localize/tools/src/translate/source_files/source_file_translation_handler.ts` L107–143 （▶ の行: 116–118, 120–123, 128–129, 136–138, 140）

```ts
107 │   private translateFile(
108 │     diagnostics: Diagnostics,
109 │     ast: t.File | t.Program,
110 │     translationBundle: TranslationBundle,
111 │     sourceRoot: AbsoluteFsPath,
112 │     filename: PathSegment,
113 │     outputPathFn: OutputPathFn,
114 │     options: TranslatePluginOptions,
115 │   ) {
116 ▶     const translated = transformFromAstSync(ast, '', {
117 ▶       compact: true,
118 ▶       generatorOpts: {minified: true},
119 │       plugins: [
120 ▶         () => makeLocalePlugin(translationBundle.locale),
121 ▶         () =>
122 ▶           makeEs2015TranslatePlugin(diagnostics, translationBundle.translations, options, this.fs),
123 ▶         () => makeEs5TranslatePlugin(diagnostics, translationBundle.translations, options, this.fs),
124 │       ],
125 │       cwd: sourceRoot,
126 │       filename,
127 │     });
128 ▶     if (translated && translated.code) {
129 ▶       this.writeSourceFile(
130 │         diagnostics,
131 │         outputPathFn,
132 │         translationBundle.locale,
133 │         filename,
134 │         translated.code,
135 │       );
136 ▶       const outputPath = absoluteFrom(outputPathFn(translationBundle.locale, filename));
137 ▶       this.fs.ensureDir(this.fs.dirname(outputPath));
138 ▶       this.fs.writeFile(outputPath, translated.code);
139 │     } else {
140 ▶       diagnostics.error(`Unable to translate source file: ${this.fs.join(sourceRoot, filename)}`);
141 │       return;
142 │     }
143 │   }
```

1. **116 行目：構文木から変換する**

   `transformFromAstSync` は元の構文木を書き換えずに変換するので、80 行目のループで同じ木を何度も使えます。第 2 引数の元のコードは `''` です。
2. **117〜118 行目：圧縮した形で書く**

   出力は改行も空白も無い 1 行になります（0 節の出力）。入力が既にビルド済みの JS だからです。
3. **119〜124 行目：3 つのプラグイン**

   120 行目が `$localize.locale`（7 節）、121〜122 行目がタグ付きテンプレートの `` $localize`…` ``、123 行目が ES5 の形の `$localize(__makeTemplateObject(…), …)` です（5 節）。
4. **128〜135 行目：書き出す**

   次の `writeSourceFile` です。
5. **136〜138 行目：もう一度、同じパスに書く**

   129〜135 行目の `writeSourceFile` の中身（下の 153〜155 行目）と同じことを、`try` の外でもう一度しています。git blame では 129 行目と 136〜138 行目はどちらも 2020-04-28 の 141fcb95a4f3 から同じ形です。普段は同じ中身を 2 回書くだけですが、9 節のように出力のパスの関数が投げると、ここで例外がそのまま上がります（9 節の実行）。

📄 `angular/packages/localize/tools/src/translate/source_files/source_file_translation_handler.ts` L145–160 （▶ の行: 152–157）

```ts
145 │   private writeSourceFile(
146 │     diagnostics: Diagnostics,
147 │     outputPathFn: OutputPathFn,
148 │     locale: string,
149 │     relativeFilePath: PathSegment,
150 │     contents: string | Uint8Array,
151 │   ): void {
152 ▶     try {
153 ▶       const outputPath = absoluteFrom(outputPathFn(locale, relativeFilePath));
154 ▶       this.fs.ensureDir(this.fs.dirname(outputPath));
155 ▶       this.fs.writeFile(outputPath, contents);
156 ▶     } catch (e) {
157 ▶       diagnostics.error((e as Error).message);
158 │     }
159 │   }
160 │ }
```

152〜158 行目、パスを計算してフォルダを作り、書きます。投げたら 157 行目で `diagnostics.error` にするだけで、処理は続きます。

## 5. Babel のプラグイン：$localize を見つけて置き換える

📄 `angular/packages/localize/tools/src/translate/source_files/es2015_translate_plugin.ts` L29–53 （▶ の行: 32, 37, 40–41, 45–50, 52）

```ts
29 │ export function makeEs2015TranslatePlugin(
30 │   diagnostics: Diagnostics,
31 │   translations: Record<string, ɵParsedTranslation>,
32 ▶   {missingTranslation = 'error', localizeName = '$localize'}: TranslatePluginOptions = {},
33 │   fs: PathManipulation = getFileSystem(),
34 │ ): PluginObject {
35 │   return {
36 │     visitor: {
37 ▶       TaggedTemplateExpression(path: NodePath<t.TaggedTemplateExpression>, state) {
38 │         try {
39 │           const tag = path.get('tag');
40 ▶           if (isLocalize(tag, localizeName)) {
41 ▶             const [messageParts] = unwrapMessagePartsFromTemplateLiteral(
42 │               path.get('quasi').get('quasis'),
43 │               fs,
44 │             );
45 ▶             const translated = translate(
46 ▶               diagnostics,
47 ▶               translations,
48 ▶               messageParts,
49 ▶               path.node.quasi.expressions,
50 ▶               missingTranslation,
51 │             );
52 ▶             path.replaceWith(buildLocalizeReplacement(translated[0], translated[1]));
53 │           }
```

1. **32 行目：プラグインの既定は error**

   `missingTranslation` を渡さなければ `'error'` です。1 節の CLI の既定（`'warning'`）とは違います。`translateFiles` は CLI の値を必ず渡すので、CLI から使うときは CLI の既定が効きます。
2. **37 行目：タグ付きテンプレートのノードを訪ねる**

   Babel が木を歩き、`` tag`…` `` の形に出会うたびにここが呼ばれます。
3. **40 行目：タグが本物の $localize か**

   `isLocalize` は、名前が `$localize` で、ローカルの変数で隠されていない（グローバルの）識別子かを見ます。中身は抽出の側と同じ関数で、[第 15 回](15-loc-extract-tool.md)です。
4. **41〜44 行目：文の部品を取り出す**

   テンプレートの文字の部分（`quasis`）から、cooked と raw の 2 つの文字列の配列を作ります（これも第 15 回）。
5. **45〜51 行目：翻訳を探す**

   `translate` は、部品からメッセージの ID を計算して翻訳の表を引き、翻訳の部品と、**並べ替えた式**を返します。無ければ `missingTranslation` の重さで診断を足して元の部品を返します。中身は [cli-i18n](../cli/09-cli-i18n.md) の 6 節に引用した 420〜442 行目です。49 行目の式は Babel のノードのまま渡すので、並べ替えでもノードが動くだけです。
6. **52 行目：ノードを置き換える**

   6 節の `buildLocalizeReplacement` で作った式に差し替えます。

📄 `angular/packages/localize/tools/src/translate/source_files/es2015_translate_plugin.ts` L54–67 （▶ の行: 55, 59, 61）

```ts
54 │         } catch (e) {
55 ▶           if (isBabelParseError(e)) {
56 │             // If we get a BabelParseError here then something went wrong with Babel itself
57 │             // since there must be something wrong with the structure of the AST generated
58 │             // by Babel parsing a TaggedTemplateExpression.
59 ▶             throw buildCodeFrameError(fs, path, state.file, e);
60 │           } else {
61 ▶             throw e;
62 │           }
63 │         }
64 │       },
65 │     },
66 │   };
67 │ }
```

📄 `angular/packages/localize/tools/src/translate/source_files/es5_translate_plugin.ts` L30–62 （▶ の行: 38, 41–43, 51, 54–55）

```ts
30 │ export function makeEs5TranslatePlugin(
31 │   diagnostics: Diagnostics,
32 │   translations: Record<string, ɵParsedTranslation>,
33 │   {missingTranslation = 'error', localizeName = '$localize'}: TranslatePluginOptions = {},
34 │   fs: PathManipulation = getFileSystem(),
35 │ ): PluginObject {
36 │   return {
37 │     visitor: {
38 ▶       CallExpression(callPath: NodePath<t.CallExpression>, state) {
39 │         try {
40 │           const calleePath = callPath.get('callee');
41 ▶           if (isLocalize(calleePath, localizeName)) {
42 ▶             const [messageParts] = unwrapMessagePartsFromLocalizeCall(callPath, fs);
43 ▶             const [expressions] = unwrapSubstitutionsFromLocalizeCall(callPath, fs);
44 │             const translated = translate(
45 │               diagnostics,
46 │               translations,
47 │               messageParts,
48 │               expressions,
49 │               missingTranslation,
50 │             );
51 ▶             callPath.replaceWith(buildLocalizeReplacement(translated[0], translated[1]));
52 │           }
53 │         } catch (e) {
54 ▶           if (isBabelParseError(e)) {
55 ▶             diagnostics.error(buildCodeFrameError(fs, callPath, state.file, e));
56 │           } else {
57 │             throw e;
58 │           }
59 │         }
60 │       },
61 │     },
62 │   };
```

ES5 の形は 38 行目、関数の呼び出し `$localize(…)` を訪ねます。42 行目で `__makeTemplateObject([…], […])` から部品を、43 行目で残りの引数から式を取り出し、あとは ES2015 と同じです。違うのは例外の扱いで、部品を取り出せない形（`BabelParseError`）に出会うと、ES2015 は 59 行目で **投げ**、ES5 は 55 行目で **診断に積んで続けます**。59 行目が投げるのは、6 節の 476 行目が返す**文字列**で、`Error` ではありません。

## 6. 置き換えの式：buildLocalizeReplacement

📄 `angular/packages/localize/tools/src/source_file_utils.ts` L60–80 （▶ の行: 66–68, 70–73, 75, 77, 79）

```ts
60 │ /**
61 │  * Build a translated expression to replace the call to `$localize`.
62 │  * @param messageParts The static parts of the message.
63 │  * @param substitutions The expressions to substitute into the message.
64 │  * @publicApi used by CLI
65 │  */
66 ▶ export function buildLocalizeReplacement(
67 ▶   messageParts: TemplateStringsArray,
68 ▶   substitutions: readonly t.Expression[],
69 │ ): t.Expression {
70 ▶   let mappedString: t.Expression = t.stringLiteral(messageParts[0]);
71 ▶   for (let i = 1; i < messageParts.length; i++) {
72 ▶     mappedString = t.binaryExpression(
73 ▶       '+',
74 │       mappedString,
75 ▶       wrapInParensIfNecessary(substitutions[i - 1]),
76 │     );
77 ▶     mappedString = t.binaryExpression('+', mappedString, t.stringLiteral(messageParts[i]));
78 │   }
79 ▶   return mappedString;
80 │ }
```

📄 `angular/packages/localize/tools/src/source_file_utils.ts` L256–269 （▶ の行: 264–265, 267）

```ts
256 │ /**
257 │  * Wrap the given `expression` in parentheses if it is a binary expression.
258 │  *
259 │  * This ensures that this expression is evaluated correctly if it is embedded in another expression.
260 │  *
261 │  * @param expression The expression to potentially wrap.
262 │  */
263 │ export function wrapInParensIfNecessary(expression: t.Expression): t.Expression {
264 ▶   if (t.isBinaryExpression(expression)) {
265 ▶     return t.parenthesizedExpression(expression);
266 │   } else {
267 ▶     return expression;
268 │   }
269 │ }
```

1. **70 行目：最初の部品の文字列リテラル**

   翻訳の部品が `["", " nouveaux, ", ""]` なら `""` です。
2. **71〜78 行目：式と次の部品を + でつなぐ**

   72〜76 行目で `… + 式`、77 行目で `… + "次の部品"`。部品はいつも式より 1 つ多いので、**最後はいつも文字列リテラル**で終わり、空の部品なら `+""` が残ります。
3. **75 行目・264〜265 行目：二項演算の式は括弧で包む**

   `${n + 1}` の式を `"a" + n + 1` とつなぐと、文字列の連結になって意味が変わります。だから `"a" + (n + 1)` にします。
4. **テンプレートリテラルにはしない**

   この関数の結果は `+` の連結です。ng build（esbuild）の `I18nInliner` は、同じ `translate` を使いながら、置き換えの文字列を自分で組んで**テンプレートリテラル**にします（[cli-i18n](../cli/09-cli-i18n.md) の 6 節）。

📄 `ターミナル`

```
# scratchpad/build-loc-e/plugin-demo.mjs（2026-11-03）
# @angular/localize/tools の makeEs2015TranslatePlugin を @babel/core 8.0.1 の transformSync に渡す
code      = 'const s = $localize`:@@hello:Hello ${user.name}:NAME:, you have ${n + 1}:COUNT: new`;'
翻訳      = { hello: ɵparseTranslation('{$COUNT} nouveaux, {$NAME}') }
各 missingTranslation（error / warning / ignore）で、翻訳あり・翻訳なしの 2 回ずつ
```

📄 `出力（2026-11-03）`

```
[error] const s=""+(n+1)+" nouveaux, "+user.name+"";
[error, 翻訳なし] const s="Hello "+user.name+", you have "+(n+1)+" new";
    error: No translation found for "hello" ("Hello {$NAME}, you have {$COUNT} new").
[warning] const s=""+(n+1)+" nouveaux, "+user.name+"";
[warning, 翻訳なし] const s="Hello "+user.name+", you have "+(n+1)+" new";
    warning: No translation found for "hello" ("Hello {$NAME}, you have {$COUNT} new").
[ignore] const s=""+(n+1)+" nouveaux, "+user.name+"";
[ignore, 翻訳なし] const s="Hello "+user.name+", you have "+(n+1)+" new";
[es5] var s=""+(n+1)+" nouveaux, "+user.name+"";
[locale] const a = $localize.locale; => const a="fr";
[locale] const a = typeof $localize !== "undefined" && $localize.locale; => const a="fr";
[locale] const a = x && typeof $localize !== "undefined" && $localize.locale; => const a=x&&"fr";
[locale] const a = $localize.locale || "en"; => const a="fr"||"en";
[locale] $localize.locale = "de"; => $localize.locale="de";
```

翻訳がある 3 行は、`missingTranslation` が何でも同じ出力です。翻訳の語順で `(n+1)` が先、`user.name` が後に並び替わり、`(n+1)` は括弧付きです。翻訳が無いと、error と warning は同じ文の診断をその重さで積み、ignore は何も積みません。**error でも出力は書かれます**。止めるのは CLI の 119 行目の終了コードだけです。

> **🧪 DEMO — $localize を連結の式に置き換える**
>
> テンプレートリテラルの中身と翻訳を入れて「置き換える」を押すと、このページで本物の `ɵparseMessage`（ID の計算）・`ɵparseTranslation`・`ɵtranslate` を呼び、翻訳が無ければ `translate`（[cli-i18n](../cli/09-cli-i18n.md) の 6 節に引用した 430〜436 行目）と同じように元の部品に戻し、最後に 70〜79 行目を**この章の .ts に移植した関数**で連結の式にします。式は Babel のノードではなく文字列のまま扱い、括弧を付けるかは「括弧の外に演算子があるか」の文字で決める簡略版です（本物は 264 行目の `t.isBinaryExpression`）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/loc-translate-tool)

📄 `angular/packages/localize/tools/src/source_file_utils.ts` L444–477 （▶ の行: 445, 454–455, 464, 470, 475–476）

```ts
444 │ export class BabelParseError extends Error {
445 ▶   private readonly type = 'BabelParseError';
446 │   constructor(
447 │     public node: t.Node,
448 │     message: string,
449 │   ) {
450 │     super(message);
451 │   }
452 │ }
453 │ 
454 ▶ export function isBabelParseError(e: any): e is BabelParseError {
455 ▶   return e.type === 'BabelParseError';
456 │ }
457 │ 
458 │ export function buildCodeFrameError(
459 │   fs: PathManipulation,
460 │   path: NodePath,
461 │   file: File,
462 │   e: BabelParseError,
463 │ ): string {
464 ▶   let filename = file.opts.filename;
465 │   if (filename) {
466 │     filename = fs.resolve(filename);
467 │     let cwd = file.opts.cwd;
468 │     if (cwd) {
469 │       cwd = fs.resolve(cwd);
470 ▶       filename = fs.relative(cwd, filename);
471 │     }
472 │   } else {
473 │     filename = '(unknown file)';
474 │   }
475 ▶   const {message} = file.hub.buildError(e.node, e.message, Error);
476 ▶   return `${filename}: ${message}`;
477 │ }
```

`BabelParseError` は 445 行目の `type` の文字で見分けます（454〜456 行目、`instanceof` ではありません）。`buildCodeFrameError` は 464〜471 行目でファイル名を作業フォルダからの相対パスにし、475 行目で Babel に「そのノードの位置の前後のコードを付けたエラー文」を作らせ、476 行目で `ファイル名: 文` の文字列を返します。

## 7. $localize.locale を文字列にする：locale\_plugin

📄 `angular/packages/localize/tools/src/translate/source_files/locale_plugin.ts` L25–45 （▶ の行: 31–33, 36–37, 40–42, 44）

```ts
25 │ export function makeLocalePlugin(
26 │   locale: string,
27 │   {localizeName = '$localize'}: TranslatePluginOptions = {},
28 │ ): PluginObject {
29 │   return {
30 │     visitor: {
31 ▶       MemberExpression(expression: NodePath<t.MemberExpression>) {
32 ▶         const obj = expression.get('object');
33 ▶         if (!isLocalize(obj, localizeName)) {
34 │           return;
35 │         }
36 ▶         const property = expression.get('property') as NodePath;
37 ▶         if (!property.isIdentifier({name: 'locale'})) {
38 │           return;
39 │         }
40 ▶         if (
41 ▶           expression.parentPath.isAssignmentExpression() &&
42 ▶           expression.parentPath.get('left') === expression
43 │         ) {
44 ▶           return;
45 │         }
```

📄 `angular/packages/localize/tools/src/translate/source_files/locale_plugin.ts` L46–70 （▶ の行: 48–49, 51, 54–57, 62, 66）

```ts
46 │         // Check for the `$localize.locale` being guarded by a check on the existence of
47 │         // `$localize`.
48 ▶         const parent = expression.parentPath;
49 ▶         if (parent.isLogicalExpression({operator: '&&'}) && parent.get('right') === expression) {
50 │           const left = parent.get('left');
51 ▶           if (isLocalizeGuard(left, localizeName)) {
52 │             // Replace `typeof $localize !== "undefined" && $localize.locale` with
53 │             // `$localize.locale`
54 ▶             parent.replaceWith(expression);
55 ▶           } else if (
56 ▶             left.isLogicalExpression({operator: '&&'}) &&
57 ▶             isLocalizeGuard(left.get('right'), localizeName)
58 │           ) {
59 │             // The `$localize` is part of a preceding logical AND.
60 │             // Replace XXX && typeof $localize !== "undefined" && $localize.locale` with `XXX &&
61 │             // $localize.locale`
62 ▶             left.replaceWith(left.get('left'));
63 │           }
64 │         }
65 │         // Replace the `$localize.locale` with the string literal
66 ▶         expression.replaceWith(t.stringLiteral(locale));
67 │       },
68 │     },
69 │   };
70 │ }
```

📄 `angular/packages/localize/tools/src/translate/source_files/locale_plugin.ts` L82–100 （▶ の行: 84–85, 93–98）

```ts
 82 │ function isLocalizeGuard(expression: NodePath, localizeName: string): boolean {
 83 │   if (
 84 ▶     !expression.isBinaryExpression() ||
 85 ▶     !(expression.node.operator === '!==' || expression.node.operator === '!=')
 86 │   ) {
 87 │     return false;
 88 │   }
 89 │   const left = expression.get('left');
 90 │   const right = expression.get('right');
 91 │ 
 92 │   return (
 93 ▶     (left.isUnaryExpression({operator: 'typeof'}) &&
 94 ▶       isLocalize(left.get('argument'), localizeName) &&
 95 ▶       right.isStringLiteral({value: 'undefined'})) ||
 96 ▶     (right.isUnaryExpression({operator: 'typeof'}) &&
 97 ▶       isLocalize(right.get('argument'), localizeName) &&
 98 ▶       left.isStringLiteral({value: 'undefined'}))
 99 │   );
100 │ }
```

1. **31〜39 行目：`$localize.locale` の形か**

   メンバーの参照（`a.b`）を訪ね、左が本物の `$localize`（33 行目）で、右が `locale`（37 行目）のものだけを残します。
2. **40〜45 行目：代入の左辺は触らない**

   `$localize.locale = "de"` は書き換えません（6 節の出力の最後の行）。
3. **49〜54 行目：守りの `typeof` ごと消す**

   親が `&&` で、自分がその右なら、左が 84〜98 行目の形（`typeof $localize !== "undefined"`、`!=` や左右を逆にしたものも含む 4 通り）かを見ます。そうなら 54 行目で親の `&&` 全体を自分に置き換えます。
4. **55〜63 行目：`x && typeof … && $localize.locale`**

   `&&` は左から結合するので、守りは左の `&&` の右にあります。62 行目でその左の `&&` を `x` だけにします。
5. **66 行目：文字列リテラルにする**

   最後に `$localize.locale` を `"fr"` にします。`$localize.locale || "en"` は `"fr"||"en"` のままで、`||` は消しません（6 節の出力）。

この `typeof … && $localize.locale` の形は、`@angular/core` がロケールの既定を決めるところに書かれている形です（`LOCALE_ID` の既定は[第 12 回](12-loc-locale-data.md)）。だからビルドのあとに差し込むと、`LOCALE_ID` の既定もそのロケールになります。

## 8. JS 以外のファイル：AssetTranslationHandler

📄 `angular/packages/localize/tools/src/translate/asset_files/asset_translation_handler.ts` L22–50 （▶ の行: 25–26, 38–39, 47–48）

```ts
22 │ export class AssetTranslationHandler implements TranslationHandler {
23 │   constructor(private fs: FileSystem) {}
24 │ 
25 ▶   canTranslate(_relativeFilePath: PathSegment | AbsoluteFsPath, _contents: Uint8Array): boolean {
26 ▶     return true;
27 │   }
28 │ 
29 │   translate(
30 │     diagnostics: Diagnostics,
31 │     _sourceRoot: AbsoluteFsPath,
32 │     relativeFilePath: PathSegment | AbsoluteFsPath,
33 │     contents: Uint8Array,
34 │     outputPathFn: OutputPathFn,
35 │     translations: TranslationBundle[],
36 │     sourceLocale?: string,
37 │   ): void {
38 ▶     for (const translation of translations) {
39 ▶       this.writeAssetFile(
40 │         diagnostics,
41 │         outputPathFn,
42 │         translation.locale,
43 │         relativeFilePath,
44 │         contents,
45 │       );
46 │     }
47 ▶     if (sourceLocale !== undefined) {
48 ▶       this.writeAssetFile(diagnostics, outputPathFn, sourceLocale, relativeFilePath, contents);
49 │     }
50 │   }
```

25〜27 行目、何にでも true を返します。38〜46 行目で各ロケールのフォルダに、47〜49 行目で元の言語のフォルダに、中身をそのまま写します。`index.html` の `lang` 属性もそのままなので、ロケールごとに書き換えるのは CLI の側の仕事です（[cli-i18n](../cli/09-cli-i18n.md) の 7 節）。

## 9. 出力のパス：getOutputPathFn

📄 `angular/packages/localize/tools/src/translate/output_path.ts` L25–44 （▶ の行: 26–28, 30–31, 34–36, 38–39）

```ts
25 │ export function getOutputPathFn(fs: PathManipulation, outputFolder: AbsoluteFsPath): OutputPathFn {
26 ▶   const [pre, post] = outputFolder.split('{{LOCALE}}');
27 ▶   return post === undefined
28 ▶     ? (_locale, relativePath) => fs.join(pre, relativePath)
29 │     : (locale, relativePath) => {
30 ▶         if (/[\/\\]|\.\./.test(locale)) {
31 ▶           throw new Error(`Invalid Locale: '${locale}' is not a valid locale.`);
32 │         }
33 │ 
34 ▶         const outputPath = fs.join(pre + locale + post, relativePath);
35 ▶         const resolvedOutputPath = fs.resolve(outputPath);
36 ▶         const resolvedPre = fs.resolve(pre);
37 │ 
38 ▶         if (!resolvedOutputPath.startsWith(resolvedPre)) {
39 ▶           throw new Error(`Invalid Locale: '${locale}' would cause path traversal.`);
40 │         }
41 │ 
42 │         return outputPath;
43 │       };
44 │ }
```

1. **26 行目：印の前と後に分ける**

   `dist/{{LOCALE}}/app` なら `pre` は `dist/`、`post` は `/app`。
2. **27〜28 行目：印が無ければ全部同じフォルダ**

   ロケールの数だけ同じパスに上書きすることになります。
3. **30〜32 行目：ロケールに / \\ .. があれば投げる**

   ロケールは翻訳ファイルの `target-language` から来ることがあります。2026-03-27 の 78710938225（#67906、[第 20 回](20-loc-issues.md)）で、出力のフォルダの外に書かせる値を止めるために足されました。
4. **34〜40 行目：つないだ結果が pre の下にあるか**

   念のため、解決したパスが `pre` で始まるかも確かめます。

この関数が投げたとき、どうなるかを本物で確かめました。

📄 `出力（scratchpad/build-loc-e/run2、2026-11-03。スタックは抜粋）`

```
# run2: target-language="../evil" の XLIFF を、3 つのファイル（$localize を含む main.js・含まない plain.js・a.txt）に
$ node .../cli.js -r src -s '**/*' -t locales/bad.xlf -o 'out/{{LOCALE}}'
Error: Invalid Locale: '../evil' is not a valid locale.
    at .../translate/cli.js:30:13
    at SourceFileTranslationHandler.translateFile (.../translate/cli.js:129:40)
    at SourceFileTranslationHandler.translate (.../translate/cli.js:108:14)
    at Translator.translateFiles (.../translate/cli.js:261:16)
（終了コード 1。診断の一覧は表示されずに止まる）

# $localize を含まないファイルだけにすると
$ node .../cli.js -r src -s '{a.txt,plain.js}' -t locales/bad.xlf -o 'out/{{LOCALE}}'
error: Invalid Locale: '../evil' is not a valid locale.
error: Invalid Locale: '../evil' is not a valid locale.
（終了コード 1。どちらの場合も out/ の外にファイルは作られない）
```

`$localize` を含まないファイルと JS 以外のファイルは、4 節の 152〜158 行目と 8 節の `writeAssetFile` が投げたものを捕まえて `error:` の行になります。`$localize` を含む JS だけは、4 節の 129 行目の `writeSourceFile` が捕まえたあと、136 行目で同じ関数を `try` の外でもう一度呼ぶので、例外が CLI の外まで上がり、残りのファイルも診断の表示もされずに止まります。どちらも外にファイルは書かれず、終了コードは 1 です。同じ報告は `gh search issues` では見つかりませんでした（2026-11-03）。

> [!NOTE]
> **ポイント**
>
> ng build の `localize` は `localize-translate` を使いません。esbuild の `I18nInliner` は、この章の `translate`（cli-i18n の 420〜442 行目）だけを使い、構文木は oxc で作り、置き換えの文字列は自分で組みます（[cli-i18n](../cli/09-cli-i18n.md) の 4〜6 節）。Babel のプラグイン（`makeEs2015TranslatePlugin` と `makeLocalePlugin`）を使っているのは、webpack の古いビルダー（`@angular-devkit/build-angular` の `tools/babel/presets/application.ts` と `utils/process-bundle.ts`）です。

## ここまでの呼び出し

- 👤 `localize-translate -r … -s … -t … -o …` — translate/cli.ts — *引数を組む*
  - `translateFiles()` — translate/index.ts — *ローダーとハンドラー 2 つ*
    - `TranslationLoader.loadBundles()` — 第 17 回 — *全ロケールを先に読む*
    - `Translator.translateFiles()` — translator.ts — *ファイルごとに最初のハンドラー*
      - `SourceFileTranslationHandler.translate()` — source\_file\_translation\_handler.ts — *$localize が無ければ写すだけ。あれば parseSync 1 回*
        - `translateFile()` → `transformFromAstSync()` — source\_file\_translation\_handler.ts — *ロケールごと*
          - `makeLocalePlugin` — locale\_plugin.ts — *$localize.locale → "fr"*
          - `makeEs2015TranslatePlugin` / `makeEs5TranslatePlugin` — source\_files/ — *部品を取り出す*
            - `translate()` → `ɵtranslate()` — source\_file\_utils.ts — *ID で引き、式を並べ替える*
            - `buildLocalizeReplacement()` — source\_file\_utils.ts — *"…" + 式 + "…"*
        - `writeSourceFile()` → `getOutputPathFn()` — output\_path.ts — *{{LOCALE}} を置き換えて書く*
      - `AssetTranslationHandler.translate()` — asset\_translation\_handler.ts — *JS 以外を各ロケールに写す*

## テストと直し方

### spec と describe（packages/localize/tools/test/）

| spec | describe と主な it |
| --- | --- |
| translate/translator\_spec.ts | `Translator` &gt; `translateFiles()`。85 行目「should stop at the first handler that can handle each file」、105 行目「should error if none of the handlers can handle the file」 |
| translate/source\_files/source\_file\_translation\_handler\_spec.ts | `SourceFileTranslationHandler`。51 行目（`$localize` の無いファイルは写すだけ）、89 行目「should transform each $localize template tag」、136 行目（`$localize.locale`）、162 行目「should error if the file is not valid JS」。書き込みの回数を数える it は無い |
| translate/source\_files/es2015\_translate\_plugin\_spec.ts・es5\_translate\_plugin\_spec.ts | `makeEs2015Plugin`・`makeEs5Plugin` &gt; `(no translations)`・`(with translations)`。ES2015 は 15 本、ES5 は 29 本 |
| translate/source\_files/locale\_plugin\_spec.ts | `makeLocalePlugin` の 12 本（守りの 4 通りと、代入の左辺） |
| translate/output\_path\_spec.ts | `getOutputPathFn()`。46 行目「should throw if the locale contains path traversal characters」（78710938225 で足された） |
| source\_file\_utils\_spec.ts | 76 行目 `buildLocalizeReplacement`（「should interleave…」と「should wrap "binary expression" substitutions in parentheses」）、345 行目 `wrapInParensIfNecessary` |
| translate/integration/main\_spec.ts（別ターゲット） | `translateFiles()` を本物のファイルで。89 行目「should translate and copy source-code files to the destination folders」、166 行目（翻訳ファイルを合わせる） |

### 手元で走らせる

📄 `ターミナル`

```
cd ../angular
pnpm bazel test //packages/localize/tools/test:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=Translator|SourceFileTranslationHandler|AssetTranslationHandler|makeEs2015Plugin|makeEs5Plugin|makeLocalePlugin|getOutputPathFn|buildLocalizeReplacement|wrapInParensIfNecessary'
pnpm bazel test //packages/localize/tools/test/translate/integration:integration --nocache_test_results --test_output=all
```

📄 `出力（2026-11-03。ログは scratchpad/i18n-logs/e-ch18.log・e-ch18int.log）`

```
Ran 33 of 530 specs / Ran 33 of 530 specs / Ran 35 of 532 specs / Ran 35 of 532 specs   （4 shard、合わせて 136 本）
//packages/localize/tools/test:test                                      PASSED in 1.0s
  Stats over 4 runs: max = 1.0s, min = 0.9s, avg = 1.0s, dev = 0.0s
5 specs, 0 failures
//packages/localize/tools/test/translate/integration:integration         PASSED in 0.6s
```

### 直すとしたら

- 置き換えの形は `source_file_utils.ts` の `buildLocalizeReplacement`、spec は source\_file\_utils\_spec.ts の 76 行目の describe。
- 9 節の「JS のときだけ例外が上がる」は `source_file_translation_handler.ts` の `translateFile` の 136〜138 行目。足すなら source\_file\_translation\_handler\_spec.ts に、`outputPathFn` が投げるときに `diagnostics` に積まれて止まらないことを確かめる it（今は無い）。
- `$localize.locale` の形を足すなら `locale_plugin.ts` と locale\_plugin\_spec.ts。
- 翻訳が無いときの振る舞いは `translate`（cli-i18n の 420〜442 行目）。実行時の側（`loadTranslations`）が `i18nMissingTranslation` を見ない件は #54672（[第 20 回](20-loc-issues.md)）。

## 聞かれそうな質問

**Q. 翻訳漏れがあるとビルドは失敗しますか？**

`localize-translate` の既定は 1 節の 77 行目の `'warning'` なので、警告を出して元の文で書き出し、終了コードは 0 です（0 節の実行）。`-m error` にすると診断は error になり、119 行目で終了コードが 1 になりますが、ファイルは書き出されています（6 節の出力）。

**Q. 翻訳で語順が変わったら、式の評価の順も変わりますか？**

変わります。`translate` が翻訳のプレースホルダーの順に式を並べ替え、`buildLocalizeReplacement` が 71〜78 行目でその順に `+` でつなぐので、`"" + (n+1) + " nouveaux, " + user.name` のように、元のコードとは違う順に式が評価されます。式に副作用があると、ロケールによって結果が変わります。

**Q. $localize が入っていないチャンクも Babel で読み直すのですか？**

いいえ。4 節の 58 行目で文字列 `$localize` が無ければ構文木を作らず、59〜70 行目で各ロケールにそのまま写します。あれば 72 行目で 1 回だけ parse し、同じ木をロケールの数だけ `transformFromAstSync` に渡します。

**Q. $localize.locale はどう変わりますか？**

7 節の 66 行目で `"fr"` のような文字列リテラルになります。`typeof $localize !== "undefined" &&` の守りは 54 行目で一緒に消え、代入の左辺は 40〜45 行目で残します。

**Q. ng build --localize はこの CLI を呼んでいますか？**

呼んでいません。esbuild の `I18nInliner` は `@angular/localize/tools` から `translate` と `Diagnostics`、パーサーを import するだけで、構文木は oxc、置き換えはテンプレートリテラルです（[cli-i18n](../cli/09-cli-i18n.md)）。この章の Babel のプラグインは webpack の古いビルダーが使います。

## 読み終えて

- 翻訳は先に全ロケール分を読み、ファイルは 1 回読んで、最初に扱えると答えたハンドラーがロケールの数だけ書き出す。
- `.js` は `$localize` を含むときだけ Babel で 1 回 parse し、3 つのプラグイン（locale・ES2015・ES5）で変換する。JS 以外と `$localize` の無い JS は写すだけ。
- 置き換えは `"部品" + 式 + "部品"` の連結で、二項演算の式は括弧で包み、最後はいつも文字列で終わる。翻訳の語順に式が並び替わる。
- `missingTranslation` は診断の重さを決めるだけで、出力は必ず書かれる。CLI の既定は warning、プラグインの既定は error。
- 出力のパスはロケールの `/ \ ..` を拒む（#67906）。ただし `$localize` を含む JS では 2 回目の書き込みが `try` の外にあり、そのとき例外が上がる。

---

← 前: [翻訳ファイルを読む：TranslationLoader と各パーサー](17-loc-translation-parsers.md)  
次: [i18n のテスト：spec の場所と走らせ方](19-loc-testing.md) →
