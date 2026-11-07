[目次](../README.md) › [CLI とビルド](README.md) › 第 9 回 / 全 16 回

# i18n：1 回ビルドして、ロケールごとに翻訳を差し込む

> localize を有効にすると、アプリは 1 回だけビルドされ、出力の $localize の呼び出しに I18nInliner がワーカーでロケールごとの翻訳を差し込む行。翻訳ファイルの読み込み（xlf / json / arb）、ワーカーが polyfills の目印にロケール名とロケールのデータを差し込む行、出力のディレクトリと baseHref、extract-i18n builder がメッセージを取り出す仕組み。

angular/angular-cli · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cli-i18n)

---

`angular.json` の `localize` を有効にすると、アプリは**1 回だけ**ビルドされ、その出力に残った `` $localize`…` `` の呼び出しを、ロケール（言語と地域。`fr` や `ja-JP`）ごとの翻訳の文字列に書き換えて、`dist/…/browser/fr/` のようなフォルダに書き出します。この章では、翻訳ファイル（xlf / json / arb など）の読み込み、`I18nInliner` がワーカーで置き換える行、ロケールのデータを差し込む仕組み、出力のフォルダと `baseHref`、そして `extract-i18n` がメッセージを取り出す仕組みを追います。

読む対象は angular-cli リポジトリの `packages/angular/build/src/` の `utils/i18n-options.ts`・`utils/load-translations.ts`・`builders/application/i18n.ts`・`tools/esbuild/i18n-inliner.ts`・`tools/esbuild/i18n-inliner-worker.ts`・`tools/esbuild/i18n-locale-plugin.ts`・`builders/extract-i18n/` と、angular リポジトリの `packages/localize`・`packages/compiler/src/i18n/digest.ts` です。

1. [1. 概観](01-cli-overview.md)
2. [2. ng build の段取り](02-build.md)
3. [3. AotCompilation](03-cli-angular-compilation.md)
4. [4. コンポーネントのスタイル](04-cli-component-styles.md)
5. [5. oxc の変換](05-cli-javascript-transformer.md)
6. [6. リンカー](06-cli-linker.md)
7. [7. 遅延チャンク](07-cli-code-splitting.md)
8. [8. budgets](08-cli-budgets.md)
9. **9. i18n**（この章）
10. [10. 再ビルドとキャッシュ](10-cli-cache-watch.md)
11. [11. HMR](11-cli-hmr.md)
12. [12. unit-test と Vitest](12-cli-unit-test.md)
13. [13. Tree と sink](13-schematics.md)
14. [14. Rule の組み立て](14-schematics-rules.md)
15. [15. ng generate component](15-schematics-component.md)
16. [16. ng add と ng update](16-cli-add-update.md)

## 0. 全体の流れ

1. **設定を読む**

   `createI18nOptions` が `i18n`（プロジェクトの設定）と `localize`（ビルドの設定）から、どのロケールを出力するかを決める（1 節）。
2. **翻訳ファイルを読む**

   ビルドの前に、各ロケールの翻訳ファイルを形式を自動判定して読み込む（2 節）。
3. **ビルドは 1 回**

   コンパイラは `i18n` 属性のある文を `` $localize`…` `` のタグ付きテンプレートとして出力する。esbuild は普通にバンドルし、出力にはこの呼び出しが残る（3 節）。
4. **ロケールごとに書き換える**

   `I18nInliner` が `$localize` を含むファイルだけをワーカーに渡し、ワーカーが oxc で構文木を作って、呼び出しを翻訳済みの文字列リテラルに置き換える（4〜6 節）。
5. **ロケールごとに後処理して書き出す**

   `index.html` の `lang` と `<base href>`、プリレンダーをロケールごとに行い、`<subPath>/` の下に置く（7 節）。

## 1. どのロケールを出力するか：createI18nOptions

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L185–193 （▶ の行: 188–192）

```ts
185 │   const i18nOptions: I18nOptions & {
186 │     duplicateTranslationBehavior?: I18NTranslation;
187 │     missingTranslationBehavior?: I18NTranslation;
188 ▶   } = createI18nOptions(projectMetadata, options.localize, context.logger, !!options.ssr);
189 ▶   i18nOptions.duplicateTranslationBehavior = options.i18nDuplicateTranslation;
190 ▶   i18nOptions.missingTranslationBehavior = options.i18nMissingTranslation;
191 ▶   if (options.forceI18nFlatOutput) {
192 ▶     i18nOptions.flatOutput = true;
193 │   }
```

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L87–99 （▶ の行: 87, 94, 96–97）

```ts
87 ▶   const { i18n: metadata = {} } = projectMetadata;
88 │ 
89 │   ensureObject(metadata, 'i18n');
90 │ 
91 │   const i18n: I18nOptions = {
92 │     inlineLocales: new Set<string>(),
93 │     // en-US is the default locale added to Angular applications (https://angular.dev/guide/i18n/format-data-locale)
94 ▶     sourceLocale: 'en-US',
95 │     locales: {},
96 ▶     get shouldInline() {
97 ▶       return this.inlineLocales.size > 0;
98 │     },
99 │   };
```

188 行目、`projectMetadata`（`angular.json` のプロジェクトの `i18n`）とビルドの `localize` オプションを渡します。94 行目、何も書かなければ元の言語（sourceLocale）は `en-US`。96〜98 行目の `shouldInline` は「書き換えるロケールが 1 つ以上あるか」で、この章の処理はすべてこの真偽で分かれます。

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L140–149 （▶ の行: 142, 145, 148）

```ts
140 │   if (rawSourceLocale !== undefined) {
141 │     i18n.sourceLocale = rawSourceLocale;
142 ▶     i18n.hasDefinedSourceLocale = true;
143 │   }
144 │ 
145 ▶   i18n.locales[i18n.sourceLocale] = {
146 │     files: [],
147 │     baseHref: rawSourceLocaleBaseHref,
148 ▶     subPath: rawsubPath ?? i18n.sourceLocale,
149 │   };
```

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L196–215 （▶ の行: 197, 199, 204–207, 213）

```ts
196 │       i18n.locales[locale] = {
197 ▶         files: translationFiles.map((file) => ({ path: file })),
198 │         baseHref,
199 ▶         subPath: subPath ?? locale,
200 │       };
201 │     }
202 │   }
203 │ 
204 ▶   if (inline === true) {
205 ▶     i18n.inlineLocales.add(i18n.sourceLocale);
206 ▶     Object.keys(i18n.locales).forEach((locale) => i18n.inlineLocales.add(locale));
207 ▶   } else if (inline) {
208 │     for (const locale of inline) {
209 │       if (!i18n.locales[locale] && i18n.sourceLocale !== locale) {
210 │         throw new Error(`Requested locale '${locale}' is not defined for the project.`);
211 │       }
212 │ 
213 ▶       i18n.inlineLocales.add(locale);
214 │     }
215 │   }
```

145〜149 行目で元の言語を、196〜200 行目で翻訳のあるロケールを `locales` に登録します。どちらも `subPath`（出力のフォルダ名。URL の一部にもなる）の既定は**ロケールの名前そのもの**です（148・199 行目）。204〜206 行目、`localize: true` なら元の言語も含めた全部、207〜214 行目、`localize: ["fr"]` のような配列ならその分だけを `inlineLocales` に入れます。

📄 `angular-cli/packages/angular/build/src/builders/application/schema.json` L415–444 （▶ の行: 415, 418–419, 427, 431, 435）

```json
415 ▶     "i18nMissingTranslation": {
416 │       "type": "string",
417 │       "description": "How to handle missing translations for i18n.",
418 ▶       "enum": ["warning", "error", "ignore"],
419 ▶       "default": "warning"
420 │     },
421 │     "i18nDuplicateTranslation": {
422 │       "type": "string",
423 │       "description": "How to handle duplicate translations for i18n.",
424 │       "enum": ["warning", "error", "ignore"],
425 │       "default": "warning"
426 │     },
427 ▶     "localize": {
428 │       "description": "Translate the bundles in one or more locales.",
429 │       "oneOf": [
430 │         {
431 ▶           "type": "boolean",
432 │           "description": "Translate all locales."
433 │         },
434 │         {
435 ▶           "type": "array",
436 │           "description": "List of locales ID's to translate.",
437 │           "minItems": 1,
438 │           "items": {
439 │             "type": "string",
440 │             "pattern": "^[a-zA-Z]{2,3}(-[a-zA-Z]{4})?(-([a-zA-Z]{2}|[0-9]{3}))?(-[a-zA-Z]{5,8})?(-x(-[a-zA-Z0-9]{1,8})+)?$"
441 │           }
442 │         }
443 │       ]
444 │     },
```

415〜420 行目の `i18nMissingTranslation`（翻訳が無いメッセージの扱い。既定 `warning`）は 6 節で使います。

## 2. 翻訳ファイルを読む：形式は中身から判定する

📄 `angular-cli/packages/angular/build/src/builders/application/i18n.ts` L206–235 （▶ の行: 208–209, 213, 217, 219）

```ts
206 │   // Load locale data and translations (if present)
207 │   let loader;
208 ▶   for (const [locale, desc] of Object.entries(i18n.locales)) {
209 ▶     if (!i18n.inlineLocales.has(locale) && locale !== i18n.sourceLocale) {
210 │       continue;
211 │     }
212 │ 
213 ▶     if (!desc.files.length) {
214 │       continue;
215 │     }
216 │ 
217 ▶     loader ??= await createTranslationLoader();
218 │ 
219 ▶     loadTranslations(
220 │       locale,
221 │       desc,
222 │       context.workspaceRoot,
223 │       loader,
224 │       {
225 │         warn(message) {
226 │           context.logger.warn(message);
227 │         },
228 │         error(message) {
229 │           throw new Error(message);
230 │         },
231 │       },
232 │       undefined,
233 │       i18n.duplicateTranslationBehavior,
234 │     );
235 │   }
```

`loadActiveTranslations` は、ビルドの最初（`executeBuild` の冒頭）で `shouldInline` のときだけ呼ばれます。208〜211 行目、出力するロケール（と元の言語）だけを対象にし、213 行目で翻訳ファイルの無いもの（元の言語はふつう無い）を飛ばします。217 行目でローダーを 1 回だけ作り、219 行目で読みます。

📄 `angular-cli/packages/angular/build/src/utils/load-translations.ts` L57–76 （▶ の行: 64, 67–71, 73）

```ts
57 │     const {
58 │       Diagnostics,
59 │       ArbTranslationParser,
60 │       SimpleJsonTranslationParser,
61 │       Xliff1TranslationParser,
62 │       Xliff2TranslationParser,
63 │       XtbTranslationParser,
64 ▶     } = await import('@angular/localize/tools');
65 │ 
66 │     const diagnostics = new Diagnostics();
67 ▶     const parsers = {
68 ▶       arb: new ArbTranslationParser(),
69 ▶       json: new SimpleJsonTranslationParser(),
70 ▶       xlf: new Xliff1TranslationParser(),
71 ▶       xlf2: new Xliff2TranslationParser(),
72 │       // The name ('xmb') needs to match the AOT compiler option
73 ▶       xmb: new XtbTranslationParser(),
74 │     };
75 │ 
76 │     return { parsers, diagnostics };
```

📄 `angular-cli/packages/angular/build/src/utils/load-translations.ts` L21–50 （▶ の行: 25, 27–29, 32–33, 45）

```ts
21 │ export async function createTranslationLoader(): Promise<TranslationLoader> {
22 │   const { parsers, diagnostics } = await importParsers();
23 │ 
24 │   return (path: string) => {
25 ▶     const content = fs.readFileSync(path, 'utf8');
26 │     const unusedParsers = new Map();
27 ▶     for (const [format, parser] of Object.entries(parsers)) {
28 ▶       const analysis = parser.analyze(path, content);
29 ▶       if (analysis.canParse) {
30 │         // Types don't overlap here so we need to use any.
31 │         // eslint-disable-next-line @typescript-eslint/no-explicit-any
32 ▶         const { locale, translations } = parser.parse(path, content, analysis.hint as any);
33 ▶         const integrity = 'sha256-' + createHash('sha256').update(content).digest('base64');
34 │ 
35 │         return { format, locale, translations, diagnostics, integrity };
36 │       } else {
37 │         unusedParsers.set(parser, analysis);
38 │       }
39 │     }
40 │ 
41 │     const messages: string[] = [];
42 │     for (const [parser, analysis] of unusedParsers.entries()) {
43 │       messages.push(analysis.diagnostics.formatDiagnostics(`*** ${parser.constructor.name} ***`));
44 │     }
45 ▶     throw new Error(
46 │       `Unsupported translation file format in ${path}. The following parsers were tried:\n` +
47 │         messages.join('\n'),
48 │     );
49 │   };
50 │ }
```

パーサー（読み取り器）は `@angular/localize/tools` のもので、67〜74 行目の 5 つ（arb・json・xlf（XLIFF 1.2）・xlf2（XLIFF 2.0）・xmb の翻訳である XTB）です。27〜28 行目、ファイルの拡張子ではなく、**各パーサーに中身を見せて「読めるか」を聞き**、29 行目で最初に読めると答えたもので 32 行目の `parse` をします。33 行目で中身の sha256 を `integrity` として覚えます。これは 3 節のファイル名のハッシュと、4 節のキャッシュの鍵に使われます。どれも読めなければ 45〜48 行目のエラーです。

## 3. ビルドは 1 回：出力に $localize が残る

`i18n` 属性を付けたテンプレートを AOT コンパイルすると、文は `consts` の中の `$localize` のタグ付きテンプレートになります。下は `<p i18n="greeting|挨拶の見出し@@helloTitle">Hello, {{ name }}!</p><p i18n>Bye</p>` を `ngc`（インストール版の `@angular/compiler-cli`）でコンパイルした実際の出力です。テンプレートの中の i18n の命令は[i18n の章](../template/06-i18n.md)です。

📄 `ngc の出力（hello.js の consts。名前を一部省略）`

```
consts: () => {
  let i18n_0;
  if (typeof ngI18nClosureMode !== "undefined" && ngI18nClosureMode) {
    // Closure Compiler 用（goog.getMsg）。通常のビルドでは使われない
    i18n_0 = /* … */ goog.getMsg("Hello, {$interpolation}!", …);
  } else {
    i18n_0 = $localize `:greeting|挨拶の見出し@@helloTitle␟22ca046d6b28007354738d0c39ec1e55c7afeb49␟4180312767903292077:Hello, ${"\uFFFD0\uFFFD"}:INTERPOLATION:!`;
  }
  let i18n_1;
  if (typeof ngI18nClosureMode !== "undefined" && ngI18nClosureMode) {
    i18n_1 = /* … */ goog.getMsg("Bye");
  } else {
    i18n_1 = $localize `:␟d15f33e93be8636bf19a5bf7c20e9b2af4bf37ae␟6753586455780720856:Bye`;
  }
  return [i18n_0, i18n_1];
}
```

先頭の `:…:` がメタデータのブロックで、`意味|説明@@カスタム id` と、`␟` の後ろに古い形式の id（legacy id）が並びます。`${…}:INTERPOLATION:` の `:INTERPOLATION:` は、直前の式のプレースホルダ名です。`ngI18nClosureMode` が真の側は Closure Compiler 用で、通常のビルドでは `else` の `$localize` が使われます。この時点では翻訳されていません。ブラウザで `$localize` を実行時に呼ぶ（`@angular/localize/init`）か、ビルドの最後に書き換えるかのどちらかです。`localize` を有効にしたビルドは後者です。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L699–711 （▶ の行: 701, 703–704, 706–707）

```ts
699 │   // Add Angular's global locale data if i18n options are present.
700 │   let needLocaleDataPlugin = false;
701 ▶   if (i18nOptions.shouldInline) {
702 │     // Remove localize polyfill when i18n inline transformation have been applied to all the packages.
703 ▶     polyfills = polyfills.filter((path) => !path.startsWith('@angular/localize'));
704 ▶   } else if (i18nOptions.hasDefinedSourceLocale) {
705 │     // When not inlining and a source locale is present, use the source locale data directly
706 ▶     polyfills.unshift(`angular:locale/data:${i18nOptions.sourceLocale}`);
707 ▶     needLocaleDataPlugin = true;
708 │   }
709 │   if (needLocaleDataPlugin) {
710 │     buildOptions.plugins.unshift(createAngularLocaleDataPlugin());
711 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L742–752 （▶ の行: 743, 746, 748–749, 751）

```ts
742 │         // Generate module contents with an import statement per defined polyfill
743 ▶         let contents = polyfillPaths.map((file) => `import '${toPosixPath(file)}';`).join('\n');
744 │ 
745 │         // The below should be done after loading `$localize` as otherwise the locale will be overridden.
746 ▶         if (i18nOptions.shouldInline) {
747 │           // When inlining, a placeholder is used to allow the post-processing step to inject the $localize locale identifier.
748 ▶           contents += '(globalThis.$localize ??= {}).locale = "___NG_LOCALE_INSERT___";\n';
749 ▶         } else if (i18nOptions.hasDefinedSourceLocale) {
750 │           // If not inlining translations and source locale is defined, inject the locale specifier.
751 ▶           contents += `(globalThis.$localize ??= {}).locale = "${i18nOptions.sourceLocale}";\n`;
752 │         }
```

polyfills の組み立てです。703 行目、書き換えるときは `@angular/localize` の polyfill（実行時に `$localize` を定義するもの）を外します。書き換えたあとの JS には `$localize` の呼び出しが無いので要りません。748 行目、代わりに `$localize.locale = "___NG_LOCALE_INSERT___"` という目印を polyfills に書きます。ロケールごとの書き換えのときに、この文字列をロケール名に置き換えます（5 節）。書き換えないが元の言語を指定した場合は、706 行目でその言語のロケールのデータを import し、751 行目でロケール名を直接書きます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L565–578 （▶ の行: 570, 572–573, 577）

```ts
565 │   // Ensure unique hashes for i18n translation changes when using post-process inlining.
566 │   // This hash value is added as a footer to each file and ensures that the output file names (with hashes)
567 │   // change when translation files have changed. If this is not done the post processed files may have
568 │   // different content but would retain identical production file names which would lead to browser caching problems.
569 │   let footer;
570 ▶   if (i18nOptions.shouldInline) {
571 │     // Update file hashes to include translation file content
572 ▶     const i18nHash = Object.values(i18nOptions.locales).reduce(
573 ▶       (data, locale) => data + locale.files.map((file) => file.integrity || '').join('|'),
574 │       '',
575 │     );
576 │ 
577 ▶     footer = { js: `/**i18n:${calculateHash(i18nHash)}*/` };
578 │   }
```

565〜568 行目のコメントのとおり、翻訳はビルドのあとに差し込むので、esbuild が付けるファイル名のハッシュは翻訳を知りません。翻訳だけを直すと、中身が違うのに同じ名前のファイルができてしまいます。そこで 572〜575 行目、全ロケールの翻訳ファイルの `integrity`（2 節の sha256）をつないだ文字列のハッシュを、577 行目ですべての JS の末尾にコメント `/**i18n:…*/` として書きます。翻訳が変わればこのコメントが変わり、ハッシュも変わります。

## 4. inlineI18n：ロケールの数だけ書き換えと後処理をする

バンドル・budgets・ライセンスの抽出が終わると、`executeBuild` は `shouldInline` なら `executePostBundleSteps` を直接呼ぶ代わりに `inlineI18n` を呼びます（[第 2 回](02-build.md)）。

📄 `angular-cli/packages/angular/build/src/builders/application/i18n.ts` L35–53 （▶ の行: 48–51）

```ts
35 │ export async function inlineI18n(
36 │   metafile: Metafile,
37 │   options: NormalizedApplicationBuildOptions,
38 │   executionResult: ExecutionResult,
39 │   initialFiles: Map<string, InitialFileRecord>,
40 │ ): Promise<{
41 │   errors: string[];
42 │   warnings: string[];
43 │   prerenderedRoutes: PrerenderedRoutesRecord;
44 │ }> {
45 │   const { i18nOptions, baseHref, cacheOptions } = options;
46 │ 
47 │   // Create the multi-threaded inliner with common options.
48 ▶   const inliner = new I18nInliner({
49 ▶     missingTranslation: i18nOptions.missingTranslationBehavior ?? 'warning',
50 ▶     maxConcurrency: maxWorkers,
51 ▶     persistentCachePath: cacheOptions.enabled ? cacheOptions.path : undefined,
52 │     localizeVersion: i18nOptions.localizeVersion,
53 │   });
```

📄 `angular-cli/packages/angular/build/src/builders/application/i18n.ts` L65–92 （▶ の行: 69–70, 74, 87–88, 92）

```ts
65 │   // For each active locale, use the inliner to process the output files of the build.
66 │   const updatedOutputFiles = [];
67 │   const updatedAssetFiles = [];
68 │   // Root and SSR entry files are not modified.
69 ▶   const unModifiedOutputFiles = executionResult.outputFiles.filter(
70 ▶     ({ type }) => type === BuildOutputFileType.Root || type === BuildOutputFileType.ServerRoot,
71 │   );
72 │ 
73 │   try {
74 ▶     const localesToInline = Array.from(i18nOptions.inlineLocales, (locale) => {
75 │       const localeDescription = i18nOptions.locales[locale];
76 │       let translationIntegrity: string | undefined = '';
77 │       for (const file of localeDescription.files) {
78 │         if (!file.integrity) {
79 │           translationIntegrity = undefined;
80 │           break;
81 │         }
82 │         translationIntegrity += (translationIntegrity ? '|' : '') + file.integrity;
83 │       }
84 │ 
85 │       return {
86 │         locale,
87 ▶         translation: localeDescription.translation,
88 ▶         translationIntegrity,
89 │       };
90 │     });
91 │ 
92 ▶     const inlinedLocales = await inliner.inlineAll(executionResult.outputFiles, localesToInline);
```

48〜53 行目、`I18nInliner` を 1 つ作ります。49 行目の `missingTranslation` は 1 節の `i18nMissingTranslation`、50 行目のワーカー数の上限はプリレンダーと同じ `maxWorkers`（CPU の並列数 − 1。[プリレンダーの章](../platform/06-ssr-prerender.md)）、51 行目はディスクのキャッシュの場所です。69〜71 行目、サーバーの入口などロケールに関係しないファイルはそのまま残します。92 行目で**全ロケールをまとめて**`inlineAll` に渡します。

> [!NOTE]
> **ポイント**
>
> 読んでいるソース（22.2.0-next.6）の `inlineAll` は、全ロケールを一度に受け取り、ファイル × ロケールの組をワーカーに配ります。このサイトにインストールされている 22.1.7 では、ロケールごとに `inlineForLocale` を呼ぶ形でした。置き換えの規則（5〜6 節）は同じです。

### I18nInliner：$localize を含むファイルだけを選ぶ

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-inliner.ts` L41–45 （▶ の行: 45）

```ts
41 │ /**
42 │  * A keyword used to indicate if a JavaScript file may require inlining of translations.
43 │  * This keyword is used to avoid processing files that would not otherwise need i18n processing.
44 │  */
45 ▶ const LOCALIZE_KEYWORD = '$localize';
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-inliner.ts` L228–257 （▶ の行: 229, 236, 241, 243–244, 249, 252, 256）

```ts
228 │     for (const file of files) {
229 ▶       if (file.type === BuildOutputFileType.Root || file.type === BuildOutputFileType.ServerRoot) {
230 │         // Skip also the server entry-point.
231 │         // Skip stats and similar files.
232 │         continue;
233 │       }
234 │ 
235 │       const fileExtension = extname(file.path);
236 ▶       if (fileExtension === '.js' || fileExtension === '.mjs') {
237 │         // Check if localizations are present
238 │         const contentBuffer = Buffer.isBuffer(file.contents)
239 │           ? file.contents
240 │           : Buffer.from(file.contents.buffer, file.contents.byteOffset, file.contents.byteLength);
241 ▶         const hasLocalize = contentBuffer.includes(LOCALIZE_KEYWORD);
242 │ 
243 ▶         if (hasLocalize) {
244 ▶           localizeFiles.set(file.path, file);
245 │           filenames.push(file.path);
246 │ 
247 │           continue;
248 │         }
249 ▶       } else if (fileExtension === '.map') {
250 │         // The related JS file may not have been checked yet. To ensure that map files are not
251 │         // missed, store any pending map files and check them after all output files.
252 ▶         pendingMaps.push(file);
253 │         continue;
254 │       }
255 │ 
256 ▶       unmodifiedFiles.push(file);
257 │     }
```

236 行目、`.js` と `.mjs` だけを見て、241 行目で中身に `$localize` という文字列が**あるかどうかだけ**を調べます。構文は見ません。あれば 244 行目で「書き換え候補」に、なければ 256 行目で「そのまま」に入れます。CSS や画像は書き換えずに各ロケールへ複製されます。文字列の有無だけなので、`typeof $localize` のような参照や、文中の「$localize」という文字でも候補になります（下のデモ）。本当の呼び出しかどうかは、ワーカーが構文木で確かめます（5 節）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-inliner.ts` L508–536 （▶ の行: 509, 511–512, 514–515, 517, 527, 531）

```ts
508 │       let localesPerBatch: number;
509 ▶       if (uncachedByFile.size === 1) {
510 │         // Single file in window: shard across all workers to avoid idle threads
511 ▶         localesPerBatch = Math.max(1, Math.ceil(entries.length / workerCount));
512 ▶       } else if (fileSize < SMALL_FILE_FLOOR_BYTES) {
513 │         // Small chunks (< 100 KB): process all locales in 1 batch to eliminate IPC overhead
514 ▶         localesPerBatch = entries.length;
515 ▶       } else if (fileSize >= maxFileSize * DOMINANT_FILE_RATIO) {
516 │         // Dominant file(s): shard across all workers for maximum multi-core parallelism
517 ▶         localesPerBatch = Math.max(1, Math.ceil(entries.length / workerCount));
518 │       } else {
519 │         // Intermediate files: moderate sharding
520 │         localesPerBatch = Math.max(1, Math.ceil(entries.length / 2));
521 │       }
522 │ 
523 │       const ephemeral = isLastWindow && entries.length <= localesPerBatch;
524 │       for (let i = 0; i < entries.length; i += localesPerBatch) {
525 │         const batchEntries = entries.slice(i, i + localesPerBatch);
526 │         const task = (async () => {
527 ▶           const batchResult = await this.#runWorkerTask('inlineFileBatch', {
528 │             filename,
529 │             code: codeBlob,
530 │             map: mapBlob,
531 ▶             locales: new Map(batchEntries.map((e) => [e.locale, e.translation])),
532 │             missingTranslation: this.options.missingTranslation,
533 │             ephemeral,
534 │             activeLocales,
535 │             generation,
536 │           });
```

候補のファイルは大きい順に並べ（この引用の少し前）、1 ファイルを何ロケールずつワーカーに渡すかを決めます。ファイルが 1 つだけなら全ワーカーに分け（509〜511 行目）、100KB 未満の小さいファイルは全ロケールを 1 回で（512〜514 行目）、いちばん大きいファイルの 70% 以上の大きなファイルは全ワーカーに分けます（515〜517 行目）。527 行目で `inlineFileBatch` という仕事として Piscina のワーカーに投げます。531 行目の `locales` は「ロケール → 翻訳」の表です。

## 5. ワーカー：oxc で $localize の呼び出しを探す

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-inliner-worker.ts` L378–397 （▶ の行: 379, 391–394, 396–397）

```ts
378 │ function extractLocalizeMetadata(filename: string, code: string): FileLocalizeMetadata {
379 ▶   const { program } = parseSync(filename, code, {
380 │     sourceType: 'unambiguous',
381 │   });
382 │ 
383 │   if (!program) {
384 │     throw new Error(`Unknown error occurred parsing file "${filename}" with OXC.`);
385 │   }
386 │ 
387 │   const callSites: LocalizeCallSite[] = [];
388 │   const localeInsertSites: { start: number; end: number }[] = [];
389 │   let diagnostics: string[] | undefined;
390 │ 
391 ▶   traversePostOrder(program, (node) => {
392 ▶     if (node.type === 'Literal') {
393 ▶       if (typeof node.value === 'string' && node.value === '___NG_LOCALE_INSERT___') {
394 ▶         localeInsertSites.push({ start: node.start, end: node.end });
395 │       }
396 ▶     } else if (node.type === 'TaggedTemplateExpression') {
397 ▶       if (node.tag.type === 'Identifier' && node.tag.name === '$localize') {
```

379 行目、ファイルを **oxc** のパーサー（`oxc-parser`）で構文木にします（JavaScript の変換に oxc を使う話は[第 5 回](05-cli-javascript-transformer.md)）。391 行目で木の全ノードを訪ね、392〜394 行目で 3 節の目印 `"___NG_LOCALE_INSERT___"` の文字列リテラルの位置を、396〜397 行目でタグが識別子 `$localize` のタグ付きテンプレートの位置を集めます。`typeof $localize` はタグ付きテンプレートではないので、ここで落ちます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-inliner-worker.ts` L252–264 （▶ の行: 252, 255, 258）

```ts
252 ▶   const { code, metadata } = await loadFileData(request.filename, request.code, !request.ephemeral);
253 │ 
254 │   // Fast path: file has no $localize call sites or locale insert sites
255 ▶   if (metadata.callSites.length === 0 && metadata.localeInsertSites.length === 0) {
256 │     return {
257 │       file: request.filename,
258 ▶       unmodified: true,
259 │       messages: (metadata.diagnostics ?? []).map((message) => ({
260 │         type: 'error' as const,
261 │         message,
262 │       })),
263 │     };
264 │   }
```

252 行目の `loadFileData` は、この解析をファイルごとに 1 回だけ行い、ワーカーの中で覚えます。同じファイルを別のロケールで処理するときは解析し直しません。255 行目、呼び出しも目印も無ければ、258 行目の `unmodified: true` を返し、元のファイルがそのまま各ロケールに使われます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-inliner-worker.ts` L479–495 （▶ の行: 479–480, 488, 491, 493）

```ts
479 ▶   if (metadata.localeInsertSites.length > 0) {
480 ▶     const localeData = await loadLocaleData(locale);
481 │     if (localeData.error) {
482 │       diagnostics.error(localeData.error);
483 │     } else if (localeData.warning) {
484 │       diagnostics.warn(localeData.warning);
485 │     }
486 │     let injected = false;
487 │     for (const site of metadata.localeInsertSites) {
488 ▶       magicString.overwrite(
489 │         site.start,
490 │         site.end,
491 ▶         JSON.stringify(locale) + (localeData.code && !injected ? `;\n${localeData.code}\n;` : ''),
492 │       );
493 ▶       injected = true;
494 │     }
495 │   }
```

目印があれば（polyfills のファイル）、480 行目でそのロケールのデータ（日付や数の書式、複数形の規則）を読み、488〜492 行目で目印を `"fr"` のようなロケール名に書き換え、その直後にロケールのデータのコードを 1 回だけ差し込みます（491・493 行目）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-locale-plugin.ts` L64–93 （▶ の行: 67–68, 71, 73, 79, 85–86, 91）

```ts
64 │   let exact = true;
65 │   while (partialLocaleTag) {
66 │     // Angular embeds the `en`/`en-US` locale into the framework and it does not need to be included again here.
67 ▶     if (partialLocaleTag === 'en' || partialLocaleTag === 'en-US') {
68 ▶       return {};
69 │     }
70 │ 
71 ▶     const potentialPath = `${LOCALE_DATA_BASE_MODULE}/${partialLocaleTag}`;
72 │     try {
73 ▶       const resolvedPath = projectResolve(potentialPath);
74 │       if (resolvedPath) {
75 │         return {
76 │           path: resolvedPath,
77 │           warning: exact
78 │             ? undefined
79 ▶             : `Locale data for '${rawLocaleTag}' cannot be found. Using locale data for '${partialLocaleTag}'.`,
80 │         };
81 │       }
82 │     } catch {}
83 │ 
84 │     // Remove the last subtag and try again with a less specific locale.
85 ▶     const parts = partialLocaleTag.split('-');
86 ▶     partialLocaleTag = parts.slice(0, -1).join('-');
87 │     exact = false;
88 │   }
89 │ 
90 │   return {
91 ▶     warning: `Locale data for '${rawLocaleTag}' cannot be found. No locale data will be included for this locale.`,
92 │   };
93 │ }
```

ロケールのデータのファイルを探すのが `i18n-locale-plugin.ts` の `resolveLocaleDataPath` です。71 行目、`@angular/common/locales/global/<ロケール>` を探し、無ければ 85〜86 行目で末尾の部分を 1 つ削って（`fr-CA` → `fr`）探し直し、79 行目で警告を出します。67〜69 行目、`en` と `en-US` は Angular 本体に入っているので何も足しません。同じファイルの `createAngularLocaleDataPlugin`（esbuild のプラグイン）は、3 節の 706 行目、つまり**書き換えないとき**の import を解決するためのものです。書き換えるときは、ワーカーがこの `loadLocaleData` を直接呼びます。

## 6. 置き換え：翻訳を探して文字列リテラルにする

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-inliner-worker.ts` L497–526 （▶ の行: 497–498, 500–501, 503, 508–509, 511, 518–519, 525）

```ts
497 ▶   for (const callSite of metadata.callSites) {
498 ▶     const [translatedParts, translatedSubstitutions] = translate(
499 │       diagnostics,
500 ▶       translation || {},
501 ▶       callSite.messageParts,
502 │       callSite.expressionIndexes,
503 ▶       translation === undefined ? 'ignore' : missingTranslation,
504 │     );
505 │ 
506 │     // Reconstruct the new template/string literal replacement
507 │     let replacement: string;
508 ▶     if (translatedSubstitutions.length === 0) {
509 ▶       replacement = JSON.stringify(translatedParts[0]);
510 │     } else {
511 ▶       replacement = '`';
512 │       for (let i = 0; i < translatedParts.length; i++) {
513 │         replacement += escapeTemplatePart(translatedParts[i]);
514 │ 
515 │         if (i < translatedSubstitutions.length) {
516 │           const originalIndex = translatedSubstitutions[i];
517 │           const expr = callSite.expressions[originalIndex];
518 ▶           const exprCode = magicString.slice(expr.start, expr.end);
519 ▶           replacement += '${' + exprCode + '}';
520 │         }
521 │       }
522 │       replacement += '`';
523 │     }
524 │ 
525 ▶     magicString.overwrite(callSite.start, callSite.end, replacement);
526 │   }
```

1. **498〜504 行目：翻訳を探す**

   `@angular/localize/tools` の `translate` に、5 節で集めた文の部品（`messageParts`）と、そのロケールの翻訳の表を渡す。503 行目、翻訳の無いロケール（元の言語）では、見つからなくても何も言わない `'ignore'`。
2. **508〜509 行目：式が無ければ普通の文字列**

   `` $localize`:…:Bye` `` は `"Au revoir"` という文字列リテラルになる。
3. **511〜522 行目：式があればテンプレートリテラル**

   翻訳の部品をつなぎ、518 行目で**元のコードの式**をそのまま切り出して `${…}` に入れる。翻訳でプレースホルダの順番が変わっていれば、式の順番も変わる。
4. **525 行目：上書き**

   `MagicString` で、元の `` $localize`…` `` の範囲を置き換える。ソースマップがあれば、このあと元のソースマップとつなぎ直す。

📄 `angular/packages/localize/tools/src/source_file_utils.ts` L420–442 （▶ の行: 428, 430–431, 433–434, 438）

```ts
420 │ export function translate(
421 │   diagnostics: Diagnostics,
422 │   translations: Record<string, ɵParsedTranslation>,
423 │   messageParts: TemplateStringsArray,
424 │   substitutions: readonly any[],
425 │   missingTranslation: DiagnosticHandlingStrategy,
426 │ ): [TemplateStringsArray, readonly any[]] {
427 │   try {
428 ▶     return ɵtranslate(translations, messageParts, substitutions);
429 │   } catch (e: any) {
430 ▶     if (ɵisMissingTranslationError(e)) {
431 ▶       diagnostics.add(missingTranslation, e.message);
432 │       // Return the parsed message because this will have the meta blocks stripped
433 ▶       return [
434 ▶         ɵmakeTemplateObject(e.parsedMessage.messageParts, e.parsedMessage.messageParts),
435 │         substitutions,
436 │       ];
437 │     } else {
438 ▶       diagnostics.error(e.message);
439 │       return [messageParts, substitutions];
440 │     }
441 │   }
442 │ }
```

📄 `angular/packages/localize/src/utils/src/messages.ts` L185–203 （▶ の行: 188, 190–191, 202）

```ts
185 │   for (let i = 1; i < messageParts.length; i++) {
186 │     const {
187 │       messagePart,
188 ▶       placeholderName = computePlaceholderName(i),
189 │       associatedMessageId,
190 ▶     } = parsePlaceholder(messageParts[i], messageParts.raw[i]);
191 ▶     messageString += `{$${placeholderName}}${messagePart}`;
192 │     if (expressions !== undefined) {
193 │       substitutions[placeholderName] = expressions[i - 1];
194 │       substitutionLocations[placeholderName] = expressionLocations[i - 1];
195 │     }
196 │     placeholderNames.push(placeholderName);
197 │     if (associatedMessageId !== undefined) {
198 │       associatedMessageIds[placeholderName] = associatedMessageId;
199 │     }
200 │     cleanedMessageParts.push(messagePart);
201 │   }
202 ▶   const messageId = metadata.customId || computeMsgId(messageString, metadata.meaning || '');
203 │   const legacyIds = metadata.legacyIds ? metadata.legacyIds.filter((id) => id !== messageId) : [];
```

📄 `angular/packages/compiler/src/i18n/digest.ts` L224–237 （▶ の行: 225, 227, 233, 236）

```ts
224 │ export function computeMsgId(msg: string, meaning: string = ''): string {
225 ▶   let msgFingerprint = fingerprint(msg);
226 │ 
227 ▶   if (meaning) {
228 │     // Rotate the 64-bit message fingerprint one bit to the left and then add the meaning
229 │     // fingerprint.
230 │     msgFingerprint =
231 │       BigInt.asUintN(64, msgFingerprint << BigInt(1)) |
232 │       ((msgFingerprint >> BigInt(63)) & BigInt(1));
233 ▶     msgFingerprint += fingerprint(meaning);
234 │   }
235 │ 
236 ▶   return BigInt.asUintN(63, msgFingerprint).toString();
237 │ }
```

428 行目の `ɵtranslate` は、部品から文を組み立て（`parseMessage`）、その id で翻訳の表を引きます。id は 202 行目のとおり、カスタム id（`@@helloTitle`）があればそれ、無ければ 191 行目で組み立てた文（式の位置を `{$INTERPOLATION}` のようなプレースホルダ名にしたもの）と meaning から `computeMsgId` で計算した 63 ビットの数です。名前の無い式は 190 行目で `PH`、`PH_1`… になります。翻訳ファイルの id がこれと一致しないと「翻訳が無い」ことになります。見つからなければ 430〜436 行目、`missingTranslation` の扱い（警告・エラー・無視）で診断を足し、メタデータを外した**元の文**を返します。だから翻訳漏れのメッセージは元の言語のまま表示されます。

> **🧪 DEMO — $localize のメッセージ id を計算し、ワーカーの置き換えを真似る**
>
> この章の `.ts` に、`digest.ts` の `computeMsgId`（と `fingerprint`・`hash32`・`mix`）を書き写し、`parseMessage`（185〜202 行目）とワーカーの 508〜523 行目を簡略化して再現した自作の関数です。`computeMsgId` は本物の `@angular/compiler` と同じ値になることを確かめてあります（「Bye」は 3 節の ngc の出力にある `6753586455780720856`）。上の欄はバッククォートの内側、下の欄は翻訳文（プレースホルダは `{$名前}`。空欄は「翻訳が無い」）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cli-i18n)

## 7. ロケールごとの後処理：lang・baseHref・出力のフォルダ

📄 `angular-cli/packages/angular/build/src/builders/application/i18n.ts` L101–117 （▶ の行: 107, 111, 113, 116）

```ts
101 │       const {
102 │         errors,
103 │         warnings,
104 │         additionalAssets,
105 │         additionalOutputFiles,
106 │         prerenderedRoutes: generatedRoutes,
107 ▶       } = await executePostBundleSteps(
108 │         metafile,
109 │         {
110 │           ...options,
111 ▶           baseHref: getLocaleBaseHref(baseHref, i18nOptions, locale) ?? baseHref,
112 │         },
113 ▶         [...unModifiedOutputFiles, ...localeOutputFiles],
114 │         executionResult.assetFiles,
115 │         initialFiles,
116 ▶         locale,
117 │       );
```

書き換えたファイルを受け取ると、ロケールごとに 107 行目の `executePostBundleSteps`（`index.html` の生成・プリレンダー・Service Worker など）を呼びます。116 行目でロケール名を渡すので、そのロケールの `index.html` の `<html lang="…">` が書き換わります（[index.html の章](../boot/05-boot-index-html.md)の `augmentIndexHtml`）。111 行目の `baseHref` は次の関数で作ります。プリレンダーもロケールの数だけ走ります。

📄 `angular-cli/packages/angular/build/src/builders/application/options.ts` L691–717 （▶ の行: 696–697, 705, 709）

```ts
691 │ export function getLocaleBaseHref(
692 │   baseHref: string | undefined = '',
693 │   i18n: NormalizedApplicationBuildOptions['i18nOptions'],
694 │   locale: string,
695 │ ): string | undefined {
696 ▶   if (i18n.flatOutput) {
697 ▶     return undefined;
698 │   }
699 │ 
700 │   const localeData = i18n.locales[locale];
701 │   if (!localeData) {
702 │     return undefined;
703 │   }
704 │ 
705 ▶   const baseHrefSuffix = localeData.baseHref ?? localeData.subPath + '/';
706 │ 
707 │   let joinedBaseHref: string | undefined;
708 │   if (baseHrefSuffix !== '') {
709 ▶     joinedBaseHref = addTrailingSlash(joinUrlParts(baseHref, baseHrefSuffix));
710 │ 
711 │     if (baseHref && baseHref[0] !== '/') {
712 │       joinedBaseHref = stripLeadingSlash(joinedBaseHref);
713 │     }
714 │   }
715 │ 
716 │   return joinedBaseHref;
717 │ }
```

📄 `angular-cli/packages/angular/build/src/builders/application/i18n.ts` L123–142 （▶ の行: 124–125, 127, 133）

```ts
123 │       // Update directory with locale base or subPath
124 ▶       const subPath = i18nOptions.locales[locale].subPath;
125 ▶       if (i18nOptions.flatOutput !== true) {
126 │         localeOutputFiles.forEach((file) => {
127 ▶           file.path = join(subPath, file.path);
128 │         });
129 │ 
130 │         for (const assetFile of [...executionResult.assetFiles, ...additionalAssets]) {
131 │           updatedAssetFiles.push({
132 │             source: assetFile.source,
133 ▶             destination: join(subPath, assetFile.destination),
134 │           });
135 │         }
136 │       } else {
137 │         executionResult.assetFiles.push(...additionalAssets);
138 │       }
139 │ 
140 │       inlineResult.prerenderedRoutes = { ...inlineResult.prerenderedRoutes, ...generatedRoutes };
141 │       updatedOutputFiles.push(...localeOutputFiles);
142 │     }
```

705 行目、ロケールに `baseHref` が書いてあればそれ、無ければ `subPath + '/'` を、709 行目で元の `baseHref` の後ろにつなぎます。`baseHref: "/"` で `fr` なら `/fr/`。127 行目で出力ファイルのパスの前に `subPath` を付け、133 行目でアセット（`public/` の中身）もロケールごとに複製します。結果は `dist/<プロジェクト>/browser/en-US/` と `browser/fr/` のように並びます。696 行目と 125 行目、`forceI18nFlatOutput`（1 節の 191 行目）なら、フォルダを分けず `baseHref` も変えません。

## 8. extract-i18n：ビルドしてから取り出す

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/application-extraction.ts` L37–55 （▶ の行: 38–39, 42–45, 48, 55）

```ts
37 │   // Setup the build options for the application based on the buildTarget option
38 ▶   const buildOptions = (await context.validateOptions(
39 ▶     await context.getTargetOptions(options.buildTarget),
40 │     builderName,
41 │   )) as unknown as ApplicationBuilderInternalOptions;
42 ▶   buildOptions.optimization = false;
43 ▶   buildOptions.sourceMap = { scripts: true, vendor: true, styles: false };
44 ▶   buildOptions.localize = false;
45 ▶   buildOptions.budgets = undefined;
46 │   buildOptions.index = false;
47 │   buildOptions.serviceWorker = false;
48 ▶   buildOptions.outputMode = OutputMode.Static;
49 │   buildOptions.appShell = undefined;
50 │   buildOptions.ssr = undefined;
51 │   buildOptions.prerender = undefined;
52 │   buildOptions.server = undefined;
53 │ 
54 │   // Build the application with the build options
55 ▶   const builderResult = await first(buildApplicationInternal(buildOptions, context, extensions));
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/application-extraction.ts` L63–75 （▶ の行: 64, 68–69, 73–74）

```ts
63 │     // Setup the localize message extractor based on the in-memory files
64 ▶     const extractor = setupLocalizeExtractor(extractorConstructor, builderResult.files, context);
65 │ 
66 │     // Extract messages from each output JavaScript file.
67 │     // Output files are only present on a successful build.
68 ▶     for (const file of builderResult.files) {
69 ▶       if (!file.path.endsWith('.js')) {
70 │         continue;
71 │       }
72 │ 
73 ▶       const fileMessages = extractor.extractMessages(file.path);
74 ▶       messages.push(...fileMessages);
75 │     }
```

📄 `angular-cli/packages/angular/build/src/builders/extract-i18n/builder.ts` L110–128 （▶ の行: 111, 113, 119, 128）

```ts
110 │   // Serialize all extracted messages
111 ▶   const serializer = await createSerializer(
112 │     localizeToolsModule,
113 ▶     normalizedOptions.format,
114 │     normalizedOptions.i18nOptions.sourceLocale,
115 │     extractionResult.basePath,
116 │     extractionResult.useLegacyIds,
117 │     diagnostics,
118 │   );
119 ▶   const content = serializer.serialize(extractionResult.messages);
120 │ 
121 │   // Ensure directory exists
122 │   const outputPath = path.dirname(normalizedOptions.outFile);
123 │   if (!fs.existsSync(outputPath)) {
124 │     fs.mkdirSync(outputPath, { recursive: true });
125 │   }
126 │ 
127 │   // Write translation file
128 ▶   fs.writeFileSync(normalizedOptions.outFile, content);
```

`ng extract-i18n` は、ソースを直接読むのではなく、**アプリを 1 回ビルド**してから出力の JS を読みます。38〜41 行目で `build` ターゲットの設定を読み、42〜52 行目で最適化・`localize`・budgets・`index.html`・SSR を切り、43 行目でソースマップを有効にしてから、55 行目で application builder を動かします。68〜75 行目、出力の `.js` ごとに `@angular/localize/tools` の `MessageExtractor` で `$localize` の呼び出しを集めます。43 行目でソースマップを有効にしてあるので、メッセージの場所は元の `.ts` / `.html` の位置で記録されます。111〜119 行目で `--format`（xlf・xlf2・json・arb・xmb など）の形に直し、128 行目でファイルに書きます。

> **🧪 DEMO — このサイトの JS に '$localize' はあるか（I18nInliner の 241 行目と同じ判定）**
>
> このサイトは `localize` を使っていないので、`I18nInliner` はそもそも動きません。それでも 241 行目と同じ「文字列があるか」だけで見ると、候補になるファイルがあります。このページで読んだ JS を取り直し、`$localize` を含む位置の前後を表示します。中身は `typeof $localize`（`LOCALE_ID` の既定値を決める Angular 本体のコード）や、この章の本文と引用（ソースの文字列）の文字です。どれも 396〜397 行目のタグ付きテンプレートではないので、ワーカーまで行っても 255 行目で「そのまま」になります。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cli-i18n)

## 呼び出しの流れ

- `createI18nOptions(projectMetadata, options.localize)` — utils/i18n-options.ts L79
- `loadActiveTranslations → createTranslationLoader → parser.analyze / parse` — builders/application/i18n.ts L193, utils/load-translations.ts L21
- `esbuild（polyfills に ___NG_LOCALE_INSERT___、JS に /**i18n:…*/）` — application-code-bundle.ts L748, L577
- `inlineI18n(metafile, options, executionResult, initialFiles)` — builders/application/i18n.ts L35
  - `I18nInliner.inlineAll(outputFiles, locales)` — i18n-inliner.ts L282
    - `#partitionFiles: includes('$localize')` — i18n-inliner.ts L241
    - `WorkerPool.run('inlineFileBatch')` — i18n-inliner.ts L527
      - `extractLocalizeMetadata（oxc-parser）` — i18n-inliner-worker.ts L378
      - `inlineLocalize → translate(...) → MagicString.overwrite` — i18n-inliner-worker.ts L460, L498, L525
  - `executePostBundleSteps(..., baseHref: /fr/, locale: 'fr')` — builders/application/i18n.ts L107
  - `file.path = join(subPath, file.path)` — builders/application/i18n.ts L127

## 聞かれそうな質問

**Q. 実行時に言語を切り替えられますか？**

`localize` を有効にしたビルドではできません。525 行目で `$localize` の呼び出しそのものが翻訳済みの文字列に置き換わり、703 行目で実行時の `$localize` も外されるので、JS に残るのはその言語の文字列だけです。切り替えは「別のフォルダ（`/fr/`）の HTML を開く」ことになります。実行時に翻訳したいなら、`localize` を使わず、`@angular/localize/init` を polyfills に入れ、起動前に `@angular/localize` の `loadTranslations()` で翻訳を渡します。その場合も、一度起動したアプリの文を差し替える仕組みではありません（`consts` の関数は、そのコンポーネントの TView を最初に作るときに 1 回だけ呼ばれます。[TView の章](../ivy/05-ivy-tview.md)）。

**Q. 翻訳が無いメッセージはどうなりますか？**

元の言語の文のまま出力されます（430〜436 行目でメタデータを外した元の部品を返す）。そのとき `i18nMissingTranslation`（既定 `warning`、418〜419 行目）に従って警告かエラーになり、`ignore` なら何も出ません。翻訳ファイルを持たない元の言語は、503 行目で常に `ignore` です。

**Q. 翻訳ファイルの id が合いません。id はどう決まりますか？**

202 行目のとおり、`@@` のカスタム id があればそれ、無ければ文と meaning から `computeMsgId`（225〜236 行目）で計算します。説明（`|` の右）は id に入りませんが、meaning（`|` の左）は入ります。文はプレースホルダ名込みなので、テンプレートの文言や補間の数を変えると id も変わります。変わってほしくない文には `@@id` を付けます。

**Q. ハイドレーションと i18n の関係は？**

ビルドの段階では、ロケールごとに 107 行目の `executePostBundleSteps` が走るので、プリレンダーもロケールごとに、そのロケールの JS で行われます。翻訳で要素の順番が変わる部分をハイドレーションがどう辿るかは、[i18n のハイドレーションの章](../platform/13-hydration-i18n.md)です。

**Q. ロケールが 10 個あるとビルド時間は 10 倍ですか？**

バンドル（TypeScript のコンパイルと esbuild）は 1 回です。ロケールの数だけ増えるのは、241 行目で選ばれたファイルの書き換え（ワーカーで並列。解析は 252 行目でファイルごとに 1 回）と、107 行目の後処理（プリレンダーを含む）です。プリレンダーするルートが多いアプリでは、後処理のほうが重くなります。

## 読み終えて

- コンパイラは i18n の文を `` $localize`:meaning|説明@@id:…` `` として出力し、`localize` を有効にしてもバンドルは 1 回だけ。
- 翻訳ファイルは拡張子でなく中身で形式を判定し（arb・json・xlf・xlf2・xtb）、その sha256 が出力のハッシュとキャッシュの鍵になる。
- `I18nInliner` は `$localize` の文字列を含むファイルだけをワーカーに渡し、ワーカーは oxc の構文木でタグ付きテンプレートを探して、翻訳済みの文字列リテラルに置き換える。
- ロケールのデータは polyfills の目印 `___NG_LOCALE_INSERT___` の位置に、ワーカーがロケール名と一緒に差し込む。
- ロケールごとに `lang`・`baseHref`（既定 `/<subPath>/`）・プリレンダーを行い、`browser/<subPath>/` に書き出す。`extract-i18n` は 1 回ビルドしてから出力の JS からメッセージを集める。

---

← 前: [budgets と出力の表：Initial total が警告になるまで](08-cli-budgets.md)  
次: [再ビルド：watcher とキャッシュで、変わった所だけをやり直す](10-cli-cache-watch.md) →
