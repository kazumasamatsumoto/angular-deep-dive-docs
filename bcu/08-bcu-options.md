[目次](../README.md) › [@angular/build の compilation と utils の読み残し](README.md) › 第 8 回 / 全 10 回

# オプションの小道具：environment-options・i18n-options・normalize-\*・postcss・proxy

> utils の environment-options.ts・i18n-options.ts・normalize-asset-patterns.ts・normalize-cache.ts・postcss-configuration.ts・load-proxy-config.ts の未読の行：NG\_ で始まる環境変数、ロケールと翻訳ファイルの読み込み、assets とキャッシュの正規化、PostCSS の設定と proxy の設定の探し方。

angular/angular-cli · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-options)

---

ビルダーは angular.json と環境変数をそのまま使わず、utils の小さな関数で形をそろえてから使います。`NG_` で始まる環境変数の読み方、i18n のロケールの表、assets の文字列を `{ glob, input, output }` にする所、キャッシュの置き場、PostCSS と proxy の設定ファイルの探し方です。この章では、ほかの章で読まなかった行を読み、**どの入力がどの結果やエラーの文言になるか**を、本物の関数に 60 の入力を当てた記録で確かめます。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/utils/` の `environment-options.ts`・`i18n-options.ts`・`normalize-asset-patterns.ts`・`normalize-cache.ts`・`postcss-configuration.ts`・`load-proxy-config.ts` です。これらを呼ぶ `normalizeOptions` は [オプションの正規化の章](../abl/01-abl-options.md)、`createI18nOptions` の真ん中（87〜99・140〜149・196〜215 行目）は [i18n の章](../cli/09-cli-i18n.md)、`normalizeCacheOptions` の本体（95〜131 行目）は [再ビルドとキャッシュの章](../cli/10-cli-cache-watch.md)、PostCSS を差し込む条件は [コンポーネントのスタイルの章](../cli/04-cli-component-styles.md)で読みました。22.2.7 では、environment-options・normalize-cache・postcss-configuration・load-proxy-config の 4 つが変わっていて、デモでは違いの出る所を 2 つの版で並べます。

1. [1. AotCompilation の残り](01-bcu-aot.md)
2. [2. ParallelCompilation](02-bcu-parallel.md)
3. [3. hmr-candidates](03-bcu-hmr.md)
4. [4. AngularHost と遅延ルート](04-bcu-host.md)
5. [5. 予算と出力の表](05-bcu-budget.md)
6. [6. index.html の仕上げ](06-bcu-index.md)
7. [7. 自動 CSP](07-bcu-auto-csp.md)
8. **8. オプションの小道具**（この章）
9. [9. パス・URL・ソースマップ](09-bcu-paths.md)
10. [10. spec と issue](10-bcu-tests-issues.md)

## 1. 環境変数を 3 つの値で読む

📄 `angular-cli/packages/angular/build/src/utils/environment-options.ts` L9–24 （▶ の行: 12, 15, 22–23）

```ts
 9 │ import { availableParallelism } from 'node:os';
10 │ 
11 │ /** A set of strings that are considered "truthy" when parsing environment variables. */
12 ▶ const TRUTHY_VALUES = new Set(['1', 'true']);
13 │ 
14 │ /** A set of strings that are considered "falsy" when parsing environment variables. */
15 ▶ const FALSY_VALUES = new Set(['0', 'false']);
16 │ 
17 │ /**
18 │  * Checks if an environment variable is present and has a non-empty value.
19 │  * @param variable The environment variable to check.
20 │  * @returns `true` if the variable is a non-empty string.
21 │  */
22 ▶ function isPresent(variable: string | undefined): variable is string {
23 ▶   return typeof variable === 'string' && variable !== '';
24 │ }
```

📄 `angular-cli/packages/angular/build/src/utils/environment-options.ts` L26–47 （▶ の行: 32–34, 37–39, 41–42, 46）

```ts
26 │ /**
27 │  * Parses an environment variable into a boolean or undefined.
28 │  * @returns `true` if the variable is truthy ('1', 'true').
29 │  * @returns `false` if the variable is falsy ('0', 'false').
30 │  * @returns `undefined` if the variable is not present or has an unknown value.
31 │  */
32 ▶ function parseTristate(variable: string | undefined): boolean | undefined {
33 ▶   if (!isPresent(variable)) {
34 ▶     return undefined;
35 │   }
36 │ 
37 ▶   const value = variable.toLowerCase();
38 ▶   if (TRUTHY_VALUES.has(value)) {
39 ▶     return true;
40 │   }
41 ▶   if (FALSY_VALUES.has(value)) {
42 ▶     return false;
43 │   }
44 │ 
45 │   // TODO: Consider whether a warning is useful in this case of a malformed value
46 ▶   return undefined;
47 │ }
```

`parseTristate` は、環境変数を「真・偽・わからない」の 3 つにします。真は `1` と `true`、偽は `0` と `false` だけで（12・15 行目）、37 行目で小文字にするので `TRUE` も `False` も効きます。空文字は 23 行目で「無い」と同じ、`yes` のような値は 46 行目で `undefined` です（45 行目の TODO のとおり、警告は出ません）。この 3 つめがあるので、使う側は `=== true`（明示したときだけ有効）と `!== false`（明示したときだけ無効）を書き分けられます。

📄 `angular-cli/packages/angular/build/src/utils/environment-options.ts` L49–85 （▶ の行: 50, 52–53, 60–63, 66–67, 70–71, 73, 76, 79）

```ts
49 │ // Optimization and mangling
50 ▶ const debugOptimizeVariable = process.env['NG_BUILD_DEBUG_OPTIMIZE'];
51 │ const debugOptimize = (() => {
52 ▶   if (!isPresent(debugOptimizeVariable) || parseTristate(debugOptimizeVariable) === false) {
53 ▶     return {
54 │       mangle: true,
55 │       minify: true,
56 │       beautify: false,
57 │     };
58 │   }
59 │ 
60 ▶   const debugValue = {
61 ▶     mangle: false,
62 ▶     minify: false,
63 ▶     beautify: true,
64 │   };
65 │ 
66 ▶   if (parseTristate(debugOptimizeVariable) === true) {
67 ▶     return debugValue;
68 │   }
69 │ 
70 ▶   for (const part of debugOptimizeVariable.split(',')) {
71 ▶     switch (part.trim().toLowerCase()) {
72 │       case 'mangle':
73 ▶         debugValue.mangle = true;
74 │         break;
75 │       case 'minify':
76 ▶         debugValue.minify = true;
77 │         break;
78 │       case 'beautify':
79 ▶         debugValue.beautify = true;
80 │         break;
81 │     }
82 │   }
83 │ 
84 │   return debugValue;
85 │ })();
```

1. **無いか偽なら、ふだんの最適化**

   52〜58 行目。mangle（名前を短くする）と minify が真、beautify（整形）が偽です。
2. **真なら、全部をデバッグ向けに**

   60〜68 行目。mangle と minify が偽、beautify が真です。
3. **それ以外は、カンマで区切った名前を 1 つずつ真にする**

   70〜82 行目。始まりは 60〜64 行目のデバッグ向けの値なので、名前を書いたものが「戻る」形です。`minify` と書けば minify だけ戻り、beautify は真のままです。`beautify` と書いても始めから真なので何も変わらず、`yes` のような知らない値は 1 つも当たらず、`1` と同じ結果になります（デモの 3 行）。

📄 `angular-cli/packages/angular/build/src/utils/environment-options.ts` L87–104 （▶ の行: 91, 97, 103）

```ts
 87 │ /**
 88 │  * Allows disabling of code mangling when the `NG_BUILD_MANGLE` environment variable is set to `0` or `false`.
 89 │  * This is useful for debugging build output.
 90 │  */
 91 ▶ export const allowMangle = parseTristate(process.env['NG_BUILD_MANGLE']) ?? debugOptimize.mangle;
 92 │ 
 93 │ /**
 94 │  * Allows beautification of build output when the `NG_BUILD_DEBUG_OPTIMIZE` environment variable is enabled.
 95 │  * This is useful for debugging build output.
 96 │  */
 97 ▶ export const shouldBeautify = debugOptimize.beautify;
 98 │ 
 99 │ /**
100 │  * Allows disabling of code minification when the `NG_BUILD_DEBUG_OPTIMIZE` environment variable is enabled.
101 │  * This is useful for debugging build output.
102 │  */
103 ▶ export const allowMinify = debugOptimize.minify;
104 │ 
```

91 行目、mangle だけは `NG_BUILD_MANGLE` が先に決め、無いときに上の値を使います。デモの「NG\_BUILD\_DEBUG\_OPTIMIZE=1 と NG\_BUILD\_MANGLE=1」は mangle だけ真に戻りました。この 3 つの値は、このファイルを読み込んだときに 1 回だけ決まる定数です。同じプロセスの中で `process.env` を変えても効かないので、デモは環境変数を変えた子プロセスごとに読みました。

📄 `angular-cli/packages/angular/build/src/utils/environment-options.ts` L186–200 （▶ の行: 189, 194, 199）

```ts
186 │ /**
187 │  * When `NG_HMR_CSTYLES` is enabled, component styles will be hot-reloaded.
188 │  */
189 ▶ export const useComponentStyleHmr = parseTristate(process.env['NG_HMR_CSTYLES']) === true;
190 │ 
191 │ /**
192 │  * When `NG_HMR_TEMPLATES` is set to `0` or `false`, component templates will not be hot-reloaded.
193 │  */
194 ▶ export const useComponentTemplateHmr = parseTristate(process.env['NG_HMR_TEMPLATES']) !== false;
195 │ 
196 │ /**
197 │  * When `NG_BUILD_PARTIAL_SSR` is enabled, a partial server-side rendering build will be performed.
198 │  */
199 ▶ export const usePartialSsrBuild = parseTristate(process.env['NG_BUILD_PARTIAL_SSR']) === true;
200 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/environment-options.ts` L208–222 （▶ の行: 213–214, 216–217, 219–221）

```ts
208 │ /**
209 │  * When `NG_BUILD_SASS_EMBEDDED` is set to `0` or `false`, or when running within a
210 │  * WebContainer environment, the native embedded Sass compiler is disabled
211 │  * and the pure-JavaScript Sass compiler is used instead.
212 │  */
213 ▶ export const useSassEmbedded =
214 ▶   !process.versions.webcontainer && parseTristate(process.env['NG_BUILD_SASS_EMBEDDED']) !== false;
215 │ 
216 ▶ const bazelBinDirectory = process.env['BAZEL_BINDIR'];
217 ▶ const bazelExecRoot = process.env['JS_BINARY__EXECROOT'];
218 │ 
219 ▶ export const bazelEsbuildPluginPath =
220 ▶   bazelBinDirectory && bazelExecRoot
221 ▶     ? process.env['NG_INTERNAL_ESBUILD_PLUGINS_DO_NOT_USE']
222 │     : undefined;
```

189 行目の `NG_HMR_CSTYLES` は `=== true`、194 行目の `NG_HMR_TEMPLATES` は `!== false` で、テンプレートの HMR は既定で有効、`useComponentStyleHmr` の方は明示したときだけ真です。199 行目の `NG_BUILD_PARTIAL_SSR` は、プリレンダーとマニフェストの生成を飛ばす内部向けの値です（b5ec679a15）。213〜214 行目、WebContainer（ブラウザの中で Node を動かす環境）の中か、`NG_BUILD_SASS_EMBEDDED` が偽なら、Sass はネイティブの埋め込み版ではなく JavaScript 版を使います。216〜222 行目、`NG_INTERNAL_ESBUILD_PLUGINS_DO_NOT_USE` は、`BAZEL_BINDIR` と `JS_BINARY__EXECROOT` の 2 つがそろった Bazel の中でだけ読みます（ec739d79e0）。デモでも、1 つだけでは `null` で、3 つそろうとパスが返りました。

## 2. i18n：ロケールの表の形と、入れ物の検査

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L9–33 （▶ の行: 14–17, 19, 21–22, 26–28, 30）

```ts
 9 │ import type { ɵParsedTranslation } from '@angular/localize';
10 │ import path from 'node:path';
11 │ import type { TranslationLoader } from './load-translations';
12 │ 
13 │ export interface LocaleDescription {
14 ▶   files: {
15 ▶     path: string;
16 ▶     integrity?: string;
17 ▶     format?: string;
18 │   }[];
19 ▶   translation?: Record<string, ɵParsedTranslation>;
20 │   dataPath?: string;
21 ▶   baseHref?: string;
22 ▶   subPath: string;
23 │ }
24 │ 
25 │ export interface I18nOptions {
26 ▶   inlineLocales: Set<string>;
27 ▶   sourceLocale: string;
28 ▶   locales: Record<string, LocaleDescription>;
29 │   flatOutput?: boolean;
30 ▶   readonly shouldInline: boolean;
31 │   hasDefinedSourceLocale?: boolean;
32 │   localizeVersion?: string;
33 │ }
```

`LocaleDescription` は 1 つのロケールの記述で、14〜18 行目の翻訳ファイルの `integrity` と `format` は 4 節の `loadTranslations` が後から書き込みます。22 行目の `subPath` は出力のフォルダの名前で、baseHref の既定にもなります。26 行目の `inlineLocales` が実際に出力するロケールで、30 行目の `shouldInline` は「1 つ以上あるか」の getter です。

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L35–56 （▶ の行: 40–41, 44–45, 48–50, 52, 55）

```ts
35 │ function normalizeTranslationFileOption(
36 │   option: unknown,
37 │   locale: string,
38 │   expectObjectInError: boolean,
39 │ ): string[] {
40 ▶   if (typeof option === 'string') {
41 ▶     return [option];
42 │   }
43 │ 
44 ▶   if (Array.isArray(option) && option.every((element) => typeof element === 'string')) {
45 ▶     return option;
46 │   }
47 │ 
48 ▶   let errorMessage = `Project i18n locales translation field value for '${locale}' is malformed. `;
49 ▶   if (expectObjectInError) {
50 ▶     errorMessage += 'Expected a string, array of strings, or object.';
51 │   } else {
52 ▶     errorMessage += 'Expected a string or array of strings.';
53 │   }
54 │ 
55 ▶   throw new Error(errorMessage);
56 │ }
```

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L58–86 （▶ の行: 59–60, 65–66, 71, 73, 75, 79, 81, 85）

```ts
58 │ function ensureObject(value: unknown, name: string): asserts value is Record<string, unknown> {
59 ▶   if (!value || typeof value !== 'object' || Array.isArray(value)) {
60 ▶     throw new Error(`Project field '${name}' is malformed. Expected an object.`);
61 │   }
62 │ }
63 │ 
64 │ function ensureString(value: unknown, name: string): asserts value is string {
65 ▶   if (typeof value !== 'string') {
66 ▶     throw new Error(`Project field '${name}' is malformed. Expected a string.`);
67 │   }
68 │ }
69 │ 
70 │ function ensureValidSubPath(value: unknown, name: string): asserts value is string {
71 ▶   ensureString(value, name);
72 │ 
73 ▶   if (!/^[\w-]*$/.test(value)) {
74 │     throw new Error(
75 ▶       `Project field '${name}' is invalid. It can only contain letters, numbers, hyphens, and underscores.`,
76 │     );
77 │   }
78 │ }
79 ▶ export function createI18nOptions(
80 │   projectMetadata: { i18n?: unknown },
81 ▶   inline?: boolean | string[],
82 │   logger?: {
83 │     warn(message: string): void;
84 │   },
85 ▶   ssrEnabled?: boolean,
86 │ ): I18nOptions {
```

40〜46 行目、翻訳ファイルは文字列 1 つか、文字列の配列です。そうでなければ 48〜55 行目の文言で投げます。38 行目の `expectObjectInError` は、文言の最後に「or object」を足すかどうかです。73 行目、`subPath` は英数字・`_`・`-` だけで（81a83dfa31）、`/` を含めると 75 行目の文言です。正規表現が `*` なので、空文字は通ります。81 行目の `inline` は angular.json の `localize` の値（真か、ロケールの配列）、85 行目の `ssrEnabled` は 3 節の警告にだけ使います。

## 3. sourceLocale と locales の読み方

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L100–139 （▶ の行: 104–107, 109, 111, 114, 116–117, 128–129, 133–134）

```ts
100 │ 
101 │   let rawSourceLocale: string | undefined;
102 │   let rawSourceLocaleBaseHref: string | undefined;
103 │   let rawsubPath: string | undefined;
104 ▶   if (typeof metadata.sourceLocale === 'string') {
105 ▶     rawSourceLocale = metadata.sourceLocale;
106 ▶   } else if (metadata.sourceLocale !== undefined) {
107 ▶     ensureObject(metadata.sourceLocale, 'i18n.sourceLocale');
108 │ 
109 ▶     if (metadata.sourceLocale.code !== undefined) {
110 │       ensureString(metadata.sourceLocale.code, 'i18n.sourceLocale.code');
111 ▶       rawSourceLocale = metadata.sourceLocale.code;
112 │     }
113 │ 
114 ▶     if (metadata.sourceLocale.baseHref !== undefined) {
115 │       ensureString(metadata.sourceLocale.baseHref, 'i18n.sourceLocale.baseHref');
116 ▶       if (ssrEnabled) {
117 ▶         logger?.warn(
118 │           `'baseHref' in 'i18n.sourceLocale' may lead to undefined behavior when used with SSR. ` +
119 │             `Consider using 'subPath' instead.\n\n` +
120 │             `Note: 'subPath' specifies the URL segment for the locale, serving as both the HTML base HREF ` +
121 │             `and the output directory name.\nBy default, if not explicitly set, 'subPath' defaults to the locale code.`,
122 │         );
123 │       }
124 │ 
125 │       rawSourceLocaleBaseHref = metadata.sourceLocale.baseHref;
126 │     }
127 │ 
128 ▶     if (metadata.sourceLocale.subPath !== undefined) {
129 ▶       ensureValidSubPath(metadata.sourceLocale.subPath, 'i18n.sourceLocale.subPath');
130 │       rawsubPath = metadata.sourceLocale.subPath;
131 │     }
132 │ 
133 ▶     if (rawsubPath !== undefined && rawSourceLocaleBaseHref !== undefined) {
134 ▶       throw new Error(
135 │         `'i18n.sourceLocale.subPath' and 'i18n.sourceLocale.baseHref' cannot be used together.`,
136 │       );
137 │     }
138 │   }
139 │ 
```

104〜105 行目、`sourceLocale` は文字列でも、106〜138 行目の object（`code`・`baseHref`・`subPath`）でもよく、object の 3 つはどれも省けます。116〜123 行目、SSR のときに `baseHref` を書くと警告だけを出します（8535c11182 で、非推奨の扱いから警告に変わりました）。133〜137 行目、`subPath` と `baseHref` は一緒に書けません。

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L150–175 （▶ の行: 151–152, 154, 159–160, 162–163, 165, 173）

```ts
150 │ 
151 ▶   if (metadata.locales !== undefined) {
152 ▶     ensureObject(metadata.locales, 'i18n locales');
153 │ 
154 ▶     for (const [locale, options] of Object.entries(metadata.locales)) {
155 │       let translationFiles: string[] | undefined;
156 │       let baseHref: string | undefined;
157 │       let subPath: string | undefined;
158 │ 
159 ▶       if (options && typeof options === 'object' && 'translation' in options) {
160 ▶         translationFiles = normalizeTranslationFileOption(options.translation, locale, false);
161 │ 
162 ▶         if ('baseHref' in options) {
163 ▶           ensureString(options.baseHref, `i18n.locales.${locale}.baseHref`);
164 │ 
165 ▶           if (ssrEnabled) {
166 │             logger?.warn(
167 │               `'baseHref' in 'i18n.locales.${locale}' may lead to undefined behavior when used with SSR. ` +
168 │                 `Consider using 'subPath' instead.\n\n` +
169 │                 `Note: 'subPath' specifies the URL segment for the locale, serving as both the HTML base HREF ` +
170 │                 `and the output directory name.\nBy default, if not explicitly set, 'subPath' defaults to the locale code.`,
171 │             );
172 │           }
173 ▶           baseHref = options.baseHref;
174 │         }
175 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L176–195 （▶ の行: 176–177, 181–182, 186–187, 190–192）

```ts
176 ▶         if ('subPath' in options) {
177 ▶           ensureValidSubPath(options.subPath, `i18n.locales.${locale}.subPath`);
178 │           subPath = options.subPath;
179 │         }
180 │ 
181 ▶         if (subPath !== undefined && baseHref !== undefined) {
182 ▶           throw new Error(
183 │             `'i18n.locales.${locale}.subPath' and 'i18n.locales.${locale}.baseHref' cannot be used together.`,
184 │           );
185 │         }
186 ▶       } else {
187 ▶         translationFiles = normalizeTranslationFileOption(options, locale, true);
188 │       }
189 │ 
190 ▶       if (locale === i18n.sourceLocale) {
191 ▶         throw new Error(
192 ▶           `An i18n locale ('${locale}') cannot both be a source locale and provide a translation.`,
193 │         );
194 │       }
195 │ 
```

1. **object の形か**

   159 行目。`translation` の鍵を持つ object なら、160 行目で翻訳ファイルを読み、162〜185 行目で `baseHref` と `subPath` を sourceLocale と同じ規則で調べます。
2. **そうでなければ、値そのものが翻訳ファイル**

   186〜188 行目。ここで 38 行目の引数を `true` にするので、文言は「Expected a string, array of strings, or object.」になります。
3. **sourceLocale と同じ名前は不可**

   190〜194 行目。翻訳を読んだあとで調べるので、翻訳ファイルの形が正しいときだけこの文言になります。

デモの「translation の無い object」（`fr: { baseHref: '/fr/' }`）は object なのに、159 行目に当たらず 187 行目に来て、「Expected a string, array of strings, or object.」の文言になりました。足りないのは `translation` の鍵ですが、文言はそれを言いません。

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L216–237 （▶ の行: 217–219, 222, 225, 228, 230, 236）

```ts
216 │ 
217 ▶   // Check that subPaths are unique only the locales that we are inlining.
218 ▶   const localesData = Object.entries(i18n.locales).filter(([locale]) =>
219 ▶     i18n.inlineLocales.has(locale),
220 │   );
221 │ 
222 ▶   for (let i = 0; i < localesData.length; i++) {
223 │     const [localeA, { subPath: subPathA }] = localesData[i];
224 │ 
225 ▶     for (let j = i + 1; j < localesData.length; j++) {
226 │       const [localeB, { subPath: subPathB }] = localesData[j];
227 │ 
228 ▶       if (subPathA === subPathB) {
229 │         throw new Error(
230 ▶           `Invalid i18n configuration: Locales '${localeA}' and '${localeB}' cannot have the same subPath: '${subPathB}'.`,
231 │         );
232 │       }
233 │     }
234 │   }
235 │ 
236 ▶   return i18n;
237 │ }
```

217〜220 行目、`subPath` が重ならないかは、出力するロケールの中でだけ調べます。デモの「同じ subPath、inline: \[fr\] だけ」は、`fr` と `de` がどちらも `eu` でも、`de` を出力しないので通りました。両方を出力すると 230 行目の文言です。

## 4. 翻訳ファイルを読んで重ねる：loadTranslations

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L239–269 （▶ の行: 246, 249–250, 252–254, 256, 260, 262, 266–268）

```ts
239 │ export function loadTranslations(
240 │   locale: string,
241 │   desc: LocaleDescription,
242 │   workspaceRoot: string,
243 │   loader: TranslationLoader,
244 │   logger: { warn: (message: string) => void; error: (message: string) => void },
245 │   usedFormats?: Set<string>,
246 ▶   duplicateTranslation?: 'ignore' | 'error' | 'warning',
247 │ ) {
248 │   let translations: Record<string, ɵParsedTranslation> | undefined = undefined;
249 ▶   for (const file of desc.files) {
250 ▶     const loadResult = loader(path.join(workspaceRoot, file.path));
251 │ 
252 ▶     for (const diagnostics of loadResult.diagnostics.messages) {
253 ▶       if (diagnostics.type === 'error') {
254 ▶         logger.error(`Error parsing translation file '${file.path}': ${diagnostics.message}`);
255 │       } else {
256 ▶         logger.warn(`WARNING [${file.path}]: ${diagnostics.message}`);
257 │       }
258 │     }
259 │ 
260 ▶     if (loadResult.locale !== undefined && loadResult.locale !== locale) {
261 │       logger.warn(
262 ▶         `WARNING [${file.path}]: File target locale ('${loadResult.locale}') does not match configured locale ('${locale}')`,
263 │       );
264 │     }
265 │ 
266 ▶     usedFormats?.add(loadResult.format);
267 ▶     file.format = loadResult.format;
268 ▶     file.integrity = loadResult.integrity;
269 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/i18n-options.ts` L270–295 （▶ の行: 270, 272–273, 275–276, 278–279, 282–283, 287, 291, 294）

```ts
270 ▶     if (translations) {
271 │       // Merge translations
272 ▶       for (const [id, message] of Object.entries(loadResult.translations)) {
273 ▶         if (translations[id] !== undefined) {
274 │           const duplicateTranslationMessage = `[${file.path}]: Duplicate translations for message '${id}' when merging.`;
275 ▶           switch (duplicateTranslation) {
276 ▶             case 'ignore':
277 │               break;
278 ▶             case 'error':
279 ▶               logger.error(`ERROR ${duplicateTranslationMessage}`);
280 │               break;
281 │             case 'warning':
282 ▶             default:
283 ▶               logger.warn(`WARNING ${duplicateTranslationMessage}`);
284 │               break;
285 │           }
286 │         }
287 ▶         translations[id] = message;
288 │       }
289 │     } else {
290 │       // First or only translation file
291 ▶       translations = loadResult.translations;
292 │     }
293 │   }
294 ▶   desc.translation = translations;
295 │ }
```

1 つのロケールに翻訳ファイルを複数書けます（9cd796b124）。250 行目で 1 つずつ読み、252〜258 行目で読み込みの診断を出し、260〜264 行目でファイルの中のロケールが設定と違えば警告します。267〜268 行目で、2 節の `files` の要素に形式と integrity を書き込みます。2 つめからは 272〜288 行目で重ね、同じ ID は**後のファイルが勝ちます**（287 行目）。重なりは 246 行目の `duplicateTranslation`（angular.json の `i18nDuplicateTranslation`）で、既定は 282〜283 行目の警告です。`'error'` でも 279 行目でログに書くだけで、ここでは投げません。

> **🧪 DEMO — loadTranslations に偽の loader で 2 つのファイルを読ませた記録**
>
> 2 つめのファイルは、偽の警告 1 つ・ロケール fr-CA・`bye` の翻訳を返すようにしました。警告は 3 つで、`bye` は後の「Salut」になっています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-options)

## 5. assets の文字列を glob・input・output にする

📄 `angular-cli/packages/angular/build/src/utils/normalize-asset-patterns.ts` L9–47 （▶ の行: 21, 26–28, 32–34, 38–40, 42, 45）

```ts
 9 │ import assert from 'node:assert';
10 │ import { statSync } from 'node:fs';
11 │ import * as path from 'node:path';
12 │ import { AssetPattern, AssetPatternClass } from '../builders/application/schema';
13 │ import { isSubDirectory } from './path';
14 │ 
15 │ export function normalizeAssetPatterns(
16 │   assetPatterns: AssetPattern[],
17 │   workspaceRoot: string,
18 │   projectRoot: string,
19 │   projectSourceRoot: string | undefined,
20 │ ): (AssetPatternClass & { output: string })[] {
21 ▶   if (assetPatterns.length === 0) {
22 │     return [];
23 │   }
24 │ 
25 │   // When sourceRoot is not available, we default to ${projectRoot}/src.
26 ▶   const sourceRoot = projectSourceRoot || path.join(projectRoot, 'src');
27 ▶   const resolvedSourceRoot = path.resolve(workspaceRoot, sourceRoot);
28 ▶   const resolvedProjectRoot = path.resolve(workspaceRoot, projectRoot);
29 │ 
30 │   return assetPatterns.map((assetPattern) => {
31 │     // Normalize string asset patterns to objects.
32 ▶     if (typeof assetPattern === 'string') {
33 ▶       const assetPath = path.normalize(assetPattern);
34 ▶       const resolvedAssetPath = path.resolve(workspaceRoot, assetPath);
35 │       let root: string;
36 │ 
37 │       // Check if the string asset is within sourceRoot.
38 ▶       if (resolvedAssetPath.startsWith(resolvedSourceRoot)) {
39 ▶         root = resolvedSourceRoot;
40 ▶       } else if (resolvedAssetPath.startsWith(resolvedProjectRoot)) {
41 │         root = resolvedProjectRoot;
42 ▶       } else if (resolvedAssetPath.startsWith(workspaceRoot)) {
43 │         root = workspaceRoot;
44 │       } else {
45 ▶         throw new Error(`The ${assetPattern} asset path must be within the workspace root.`);
46 │       }
47 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/normalize-asset-patterns.ts` L48–72 （▶ の行: 51–54, 57, 59, 61, 64, 66, 70, 72）

```ts
48 │       let glob: string, input: string;
49 │       let isDirectory: boolean;
50 │ 
51 ▶       try {
52 ▶         isDirectory = statSync(resolvedAssetPath).isDirectory();
53 ▶       } catch {
54 ▶         isDirectory = true;
55 │       }
56 │ 
57 ▶       if (isDirectory) {
58 │         // Folders get a recursive star glob.
59 ▶         glob = '**/*';
60 │         // Input directory is their original path.
61 ▶         input = assetPath;
62 │       } else {
63 │         // Files are their own glob.
64 ▶         glob = path.basename(assetPath);
65 │         // Input directory is their original dirname.
66 ▶         input = path.dirname(assetPath);
67 │       }
68 │ 
69 │       // Output directory for both is the relative path from the root to input.
70 ▶       const output = path.relative(root, path.resolve(workspaceRoot, input));
71 │ 
72 ▶       assetPattern = { glob, input, output };
```

1. **根を決める**

   38〜46 行目。文字列のパスが sourceRoot の中なら sourceRoot、プロジェクトの中ならプロジェクト、ワークスペースの中ならワークスペースを根にします（42 行目は b3de0de8cf）。
2. **ファイルかフォルダか**

   51〜55 行目。`statSync` で調べ、無いパスは 54 行目でフォルダとみなします。フォルダは 59 行目で中の全部、ファイルは 64・66 行目で「親のフォルダの中の、その名前だけ」です。
3. **出力の場所**

   70 行目、根から input までの相対パスです。`src/assets` は `assets`、`src/favicon.ico` は空文字（出力の直下）になります。

> [!WARNING]
> **ハマりどころ**
>
> 38・40・42 行目は `startsWith` で、区切りの `/` を見ません。デモの「src と同じ頭の兄弟のフォルダ」（`src-assets`）は、`/…/ws/src-assets` が `/…/ws/src` で始まるので 39 行目で sourceRoot が根になり、70 行目の相対パスが `../src-assets` になって、84 行目の「An asset cannot be written to a location outside of the output path.」で止まりました。22.2.7 も同じ中身で、新しい本家の 58c30c05f6 が、この 3 つを 9 回目で読む `isSubDirectory` に変えています（22.2.x には入っていません）。

📄 `angular-cli/packages/angular/build/src/utils/normalize-asset-patterns.ts` L73–89 （▶ の行: 74–75, 78, 81, 83–84）

```ts
73 │     } else {
74 ▶       if (!isSubDirectory(workspaceRoot, assetPattern.input)) {
75 ▶         throw new Error(`The ${assetPattern.input} asset path must be within the workspace root.`);
76 │       }
77 │ 
78 ▶       assetPattern.output = path.join('.', assetPattern.output ?? '');
79 │     }
80 │ 
81 ▶     assert(assetPattern.output !== undefined);
82 │ 
83 ▶     if (assetPattern.output.startsWith('..')) {
84 ▶       throw new Error('An asset cannot be written to a location outside of the output path.');
85 │     }
86 │ 
87 │     return assetPattern as AssetPatternClass & { output: string };
88 │   });
89 │ }
```

object の形は 74 行目で input がワークスペースの中かだけを調べ、78 行目で `output` を `path.join('.', …)` にします。省くと `'.'` です。この 78 行目は、渡された object そのものに書き込みます。デモの「object、output なし」では、呼んだあとの入力の配列にも `output: "."` が入っていました（新しい本家の c042a66fed で写しを作るように変わりました）。83〜85 行目、どちらの形でも、出力が `..` で始まれば止めます。

## 6. キャッシュの置き場：git の worktree

📄 `angular-cli/packages/angular/build/src/utils/normalize-cache.ts` L9–42 （▶ の行: 13, 17, 20, 23, 29, 35, 39–41）

```ts
 9 │ import { existsSync, readFileSync, statSync } from 'node:fs';
10 │ import { dirname, isAbsolute, join, resolve } from 'node:path';
11 │ 
12 │ /** Version placeholder is replaced during the build process with actual package version */
13 ▶ const VERSION = '0.0.0-PLACEHOLDER';
14 │ 
15 │ export interface NormalizedCachedOptions {
16 │   /** Whether disk cache is enabled. */
17 ▶   enabled: boolean;
18 │ 
19 │   /** Disk cache path. Example: `/.angular/cache/v12.0.0`. */
20 ▶   path: string;
21 │ 
22 │   /** Disk cache base path. Example: `/.angular/cache`. */
23 ▶   basePath: string;
24 │ 
25 │   /**
26 │    * Workspace-local disk cache path. Example: `/.angular/cache/v12.0.0`.
27 │    * Always resolves relative to the current workspace root, even within a Git worktree.
28 │    */
29 ▶   localPath?: string;
30 │ 
31 │   /**
32 │    * Workspace-local disk cache base path. Example: `/.angular/cache`.
33 │    * Always resolves relative to the current workspace root, even within a Git worktree.
34 │    */
35 ▶   localBasePath?: string;
36 │ }
37 │ 
38 │ interface CacheMetadata {
39 ▶   enabled?: boolean;
40 ▶   environment?: 'local' | 'ci' | 'all';
41 ▶   path?: string;
42 │ }
```

📄 `angular-cli/packages/angular/build/src/utils/normalize-cache.ts` L44–53 （▶ の行: 46, 48, 51）

```ts
44 │ function hasCacheMetadata(value: unknown): value is { cli: { cache: CacheMetadata } } {
45 │   return (
46 ▶     !!value &&
47 │     typeof value === 'object' &&
48 ▶     'cli' in value &&
49 │     !!value['cli'] &&
50 │     typeof value['cli'] === 'object' &&
51 ▶     'cache' in value['cli']
52 │   );
53 │ }
```

13 行目の `0.0.0-PLACEHOLDER` は、パッケージを作るときに版の番号に置き換わります（22.2.7 の dist では `22.2.7`）。キャッシュのフォルダは版ごとに分かれます。29・35 行目の `localPath` と `localBasePath` は、worktree の中でも「今のワークスペース」に置く方の場所で、dev-server の Vite のキャッシュに使います（dfa7f03a93）。44〜53 行目は、angular.json の `cli.cache` があるかの型の検査です。

📄 `angular-cli/packages/angular/build/src/utils/normalize-cache.ts` L55–93 （▶ の行: 56–57, 62, 64–65, 67, 69–70, 72–74, 76–77, 79, 84–85, 90, 92）

```ts
55 │ function getCacheBasePath(workspaceRoot: string, cachePathSetting: string): string {
56 ▶   if (isAbsolute(cachePathSetting)) {
57 ▶     return cachePathSetting;
58 │   }
59 │ 
60 │   try {
61 │     // Find the git directory, walking up from workspaceRoot if necessary
62 ▶     let currentDir = workspaceRoot;
63 │     while (true) {
64 ▶       const gitPath = join(currentDir, '.git');
65 ▶       if (existsSync(gitPath)) {
66 │         const stat = statSync(gitPath);
67 ▶         if (stat.isFile()) {
68 │           // Could be a git worktree (or submodule)
69 ▶           const content = readFileSync(gitPath, 'utf8');
70 ▶           const match = /^gitdir:\s*(.+)$/m.exec(content);
71 │           if (match) {
72 ▶             const gitdir = resolve(currentDir, match[1].trim());
73 ▶             const commondirPath = join(gitdir, 'commondir');
74 ▶             if (existsSync(commondirPath)) {
75 │               // It's a git worktree
76 ▶               const commondir = readFileSync(commondirPath, 'utf8').trim();
77 ▶               const commonGitDir = resolve(gitdir, commondir);
78 │ 
79 ▶               return resolve(dirname(commonGitDir), cachePathSetting);
80 │             }
81 │           }
82 │         }
83 │       }
84 ▶       const parentDir = dirname(currentDir);
85 ▶       if (parentDir === currentDir) {
86 │         break;
87 │       }
88 │       currentDir = parentDir;
89 │     }
90 ▶   } catch {}
91 │ 
92 ▶   return resolve(workspaceRoot, cachePathSetting);
93 │ }
```

1. **絶対パスならそのまま**

   56〜58 行目。
2. **上へ .git を探す**

   62〜89 行目。`.git` がファイルなら（67 行目）、worktree か submodule です。中の `gitdir:` の行を読み、その先に `commondir` があれば worktree です（52ae7f862a）。
3. **worktree なら、元のリポジトリの側に置く**

   76〜79 行目。`commondir` から元の `.git` を求め、その親に `.angular/cache` を置きます。worktree を作り直しても、キャッシュを使い回せます。
4. **それ以外はワークスペース**

   92 行目。

44129f66a3 の 79 行目は、ワークスペースが worktree の中のどこにあっても、元のリポジトリの**直下**を返します。デモの「worktree の中の apps/web」で、44129f66a3 は `main/.angular/cache`、22.2.7 は `main/apps/web/.angular/cache` でした。22.2.7 では、ワークスペースの相対の位置を元のリポジトリの側でたどり、そのフォルダが無ければ（「apps/new」）worktree の側に置きます（22.2.x の b198044048、main では aa53b97247）。同じ直しで、`.git` を見つけたらそこで探すのをやめる `break` も足されました。有効かどうかは 95〜131 行目（[キャッシュの章](../cli/10-cli-cache-watch.md)）で、`CI` が `1` か `true` のときだけ CI とみなします。デモの「CI=yes」は CI ではない扱いでした。

## 7. PostCSS の設定ファイルを探して読む

📄 `angular-cli/packages/angular/build/src/utils/postcss-configuration.ts` L9–31 （▶ の行: 13, 17, 20–22, 25, 28–30）

```ts
 9 │ import { readFile, readdir } from 'node:fs/promises';
10 │ import { join } from 'node:path';
11 │ 
12 │ export interface PostcssConfiguration {
13 ▶   plugins: [name: string, options?: object | string][];
14 │ }
15 │ 
16 │ interface RawPostcssConfiguration {
17 ▶   plugins?: Record<string, object | boolean | string> | (string | [string, object])[];
18 │ }
19 │ 
20 ▶ const postcssConfigurationFiles: string[] = ['postcss.config.json', '.postcssrc.json'];
21 ▶ const tailwindConfigFiles: string[] = [
22 ▶   'tailwind.config.js',
23 │   'tailwind.config.cjs',
24 │   'tailwind.config.mjs',
25 ▶   'tailwind.config.ts',
26 │ ];
27 │ 
28 ▶ export interface SearchDirectory {
29 ▶   root: string;
30 ▶   files: Set<string>;
31 │ }
```

📄 `angular-cli/packages/angular/build/src/utils/postcss-configuration.ts` L33–63 （▶ の行: 33, 36, 38, 48–51, 62）

```ts
33 ▶ export async function generateSearchDirectories(roots: string[]): Promise<SearchDirectory[]> {
34 │   return await Promise.all(
35 │     roots.map((root) =>
36 ▶       readdir(root, { withFileTypes: true }).then((entries) => ({
37 │         root,
38 ▶         files: new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name)),
39 │       })),
40 │     ),
41 │   );
42 │ }
43 │ 
44 │ function findFile(
45 │   searchDirectories: SearchDirectory[],
46 │   potentialFiles: string[],
47 │ ): string | undefined {
48 ▶   for (const { root, files } of searchDirectories) {
49 ▶     for (const potential of potentialFiles) {
50 ▶       if (files.has(potential)) {
51 ▶         return join(root, potential);
52 │       }
53 │     }
54 │   }
55 │ 
56 │   return undefined;
57 │ }
58 │ 
59 │ export function findTailwindConfiguration(
60 │   searchDirectories: SearchDirectory[],
61 │ ): string | undefined {
62 ▶   return findFile(searchDirectories, tailwindConfigFiles);
63 │ }
```

20 行目、探すのは `postcss.config.json` と `.postcssrc.json` の 2 つの JSON だけです（7c522aa874）。`postcss.config.js` は読みません（デモの最後の行）。33〜42 行目、探す場所（builders/application/options.ts の 278 行目で、プロジェクトの根、次にワークスペースの根）のファイルの名前を先に 1 回だけ読み、48〜54 行目で「場所の順 → 名前の順」に探します。同じ場所に 2 つあれば `postcss.config.json` が勝ちます（デモの「両方ある」）。21〜26 行目の Tailwind の設定ファイルも同じ探し方で、62 行目です。

📄 `angular-cli/packages/angular/build/src/utils/postcss-configuration.ts` L65–92 （▶ の行: 68–69, 81–82, 86, 89–90）

```ts
65 │ async function readPostcssConfiguration(
66 │   configurationFile: string,
67 │ ): Promise<RawPostcssConfiguration> {
68 ▶   const data = await readFile(configurationFile, 'utf-8');
69 ▶   const config = JSON.parse(data) as RawPostcssConfiguration;
70 │ 
71 │   return config;
72 │ }
73 │ 
74 │ export async function loadPostcssConfiguration(searchDirectories: SearchDirectory[]): Promise<
75 │   | {
76 │       configPath: string;
77 │       config: PostcssConfiguration;
78 │     }
79 │   | undefined
80 │ > {
81 ▶   const configPath = findFile(searchDirectories, postcssConfigurationFiles);
82 ▶   if (!configPath) {
83 │     return undefined;
84 │   }
85 │ 
86 ▶   const raw = await readPostcssConfiguration(configPath);
87 │ 
88 │   // If no plugins are defined, consider it equivalent to no configuration
89 ▶   if (!raw.plugins || typeof raw.plugins !== 'object') {
90 ▶     return undefined;
91 │   }
92 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/postcss-configuration.ts` L93–127 （▶ の行: 94–95, 101–102, 104, 112–113, 118–120, 123）

```ts
 93 │   // Normalize plugin array form
 94 ▶   if (Array.isArray(raw.plugins)) {
 95 ▶     if (raw.plugins.length < 1) {
 96 │       return undefined;
 97 │     }
 98 │ 
 99 │     const config: PostcssConfiguration = { plugins: [] };
100 │     for (const element of raw.plugins) {
101 ▶       if (typeof element === 'string') {
102 ▶         config.plugins.push([element]);
103 │       } else {
104 ▶         config.plugins.push(element);
105 │       }
106 │     }
107 │ 
108 │     return { config, configPath };
109 │   }
110 │ 
111 │   // Normalize plugin object map form
112 ▶   const entries = Object.entries(raw.plugins);
113 ▶   if (entries.length < 1) {
114 │     return undefined;
115 │   }
116 │ 
117 │   const config: PostcssConfiguration = { plugins: [] };
118 ▶   for (const [name, options] of entries) {
119 ▶     if (!options || (typeof options !== 'object' && typeof options !== 'string')) {
120 ▶       continue;
121 │     }
122 │ 
123 ▶     config.plugins.push([name, options]);
124 │   }
125 │ 
126 │   return { config, configPath };
127 │ }
```

69 行目は素の `JSON.parse` なので、コメントや末尾のカンマは書けず、壊れていれば Node の文言のまま投げます（デモの「JSON が壊れている」）。89〜91 行目、`plugins` が無いか object でなければ「設定が無い」と同じです。配列の形は 101〜105 行目で、文字列なら `[名前]`、配列ならそのまま。object の形は 118〜124 行目で、値が偽のもの（`false`）と、object でも文字列でもないもの（`true`）を 120 行目で飛ばします。デモの「object の形」では、`cssnano: false` と `"postcss-y": true` がどちらも消えました。

## 8. proxy の設定を読む

📄 `angular-cli/packages/angular/build/src/utils/load-proxy-config.ts` L9–31 （▶ の行: 13–14, 22–23, 26, 28–29）

```ts
 9 │ import { existsSync } from 'node:fs';
10 │ import { readFile } from 'node:fs/promises';
11 │ import { extname, resolve } from 'node:path';
12 │ import { pathToFileURL } from 'node:url';
13 ▶ import { makeRe as makeRegExpFromGlob } from 'picomatch';
14 ▶ import { isDynamicPattern } from 'tinyglobby';
15 │ import { assertIsError } from './error';
16 │ import { loadEsmModule } from './load-esm';
17 │ 
18 │ export async function loadProxyConfiguration(
19 │   root: string,
20 │   proxyConfig: string | undefined,
21 │ ): Promise<Record<string, object> | undefined> {
22 ▶   if (!proxyConfig) {
23 ▶     return undefined;
24 │   }
25 │ 
26 ▶   const proxyPath = resolve(root, proxyConfig);
27 │ 
28 ▶   if (!existsSync(proxyPath)) {
29 ▶     throw new Error(`Proxy configuration file ${proxyPath} does not exist.`);
30 │   }
31 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/load-proxy-config.ts` L32–51 （▶ の行: 33–34, 37, 39, 41–42, 44–45, 47）

```ts
32 │   let proxyConfiguration;
33 ▶   switch (extname(proxyPath)) {
34 ▶     case '.json': {
35 │       const content = await readFile(proxyPath, 'utf-8');
36 │ 
37 ▶       const { parse, printParseErrorCode } = await import('jsonc-parser');
38 │       const parseErrors: import('jsonc-parser').ParseError[] = [];
39 ▶       proxyConfiguration = parse(content, parseErrors, { allowTrailingComma: true });
40 │ 
41 ▶       if (parseErrors.length > 0) {
42 ▶         let errorMessage = `Proxy configuration file ${proxyPath} contains parse errors:`;
43 │         for (const parseError of parseErrors) {
44 ▶           const { line, column } = getJsonErrorLineColumn(parseError.offset, content);
45 ▶           errorMessage += `\n[${line}, ${column}] ${printParseErrorCode(parseError.error)}`;
46 │         }
47 ▶         throw new Error(errorMessage);
48 │       }
49 │ 
50 │       break;
51 │     }
```

📄 `angular-cli/packages/angular/build/src/utils/load-proxy-config.ts` L52–73 （▶ の行: 54, 57, 61, 68–69, 72）

```ts
52 │     default: {
53 │       try {
54 ▶         proxyConfiguration = await import(proxyPath);
55 │       } catch (e) {
56 │         assertIsError(e);
57 ▶         if (e.code !== 'ERR_REQUIRE_ASYNC_MODULE') {
58 │           throw e;
59 │         }
60 │ 
61 ▶         proxyConfiguration = await loadEsmModule<{ default: unknown }>(pathToFileURL(proxyPath));
62 │       }
63 │ 
64 │       break;
65 │     }
66 │   }
67 │ 
68 ▶   if ('default' in proxyConfiguration) {
69 ▶     proxyConfiguration = proxyConfiguration.default;
70 │   }
71 │ 
72 ▶   return normalizeProxyConfiguration(proxyConfiguration);
73 │ }
```

1. **.json は jsonc-parser**

   37〜39 行目。コメントが書けて、39 行目で末尾のカンマも許します。壊れていれば 41〜47 行目で、167〜187 行目で数えた行と列を付けた文言です（デモの「broken.json」は `[3, 3] CommaExpected`）。
2. **それ以外は import()**

   54 行目。`.js`・`.cjs`・`.mjs` を読みます。トップレベルの `await` を含む ESM を `require` の道で読もうとして `ERR_REQUIRE_ASYNC_MODULE` になったときは、61 行目でファイルの URL にして読み直します（0ae9c1feb1）。
3. **default を剥がす**

   68〜70 行目。`export default` の形でも `module.exports` の形でも同じものになります。

📄 `angular-cli/packages/angular/build/src/utils/load-proxy-config.ts` L75–112 （▶ の行: 86, 88–90, 93–94, 99–102, 106, 110）

```ts
 75 │ /**
 76 │  * Converts glob patterns to regular expressions to support Vite's proxy option.
 77 │  * Also converts the Webpack supported array form to an object form supported by both.
 78 │  *
 79 │  * @param proxy A proxy configuration object.
 80 │  */
 81 │ function normalizeProxyConfiguration(
 82 │   proxy: Record<string, object> | object[],
 83 │ ): Record<string, object> {
 84 │   let normalizedProxy: Record<string, object> | undefined;
 85 │ 
 86 ▶   if (Array.isArray(proxy)) {
 87 │     // Construct an object-form proxy configuration from the array
 88 ▶     normalizedProxy = {};
 89 ▶     for (const proxyEntry of proxy) {
 90 ▶       if (!('context' in proxyEntry)) {
 91 │         continue;
 92 │       }
 93 ▶       if (!Array.isArray(proxyEntry.context)) {
 94 ▶         continue;
 95 │       }
 96 │ 
 97 │       // Array-form entries contain a context string array with the path(s)
 98 │       // to use for the configuration entry.
 99 ▶       const context = proxyEntry.context;
100 ▶       delete proxyEntry.context;
101 ▶       for (const contextEntry of context) {
102 ▶         if (typeof contextEntry !== 'string') {
103 │           continue;
104 │         }
105 │ 
106 ▶         normalizedProxy[contextEntry] = proxyEntry;
107 │       }
108 │     }
109 │   } else {
110 ▶     normalizedProxy = proxy;
111 │   }
112 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/load-proxy-config.ts` L113–148 （▶ の行: 114–118, 126, 135, 138, 143）

```ts
113 │   // TODO: Consider upstreaming glob support
114 ▶   for (const key of Object.keys(normalizedProxy)) {
115 ▶     if (key[0] !== '^' && isDynamicPattern(key)) {
116 ▶       const pattern = makeRegExpFromGlob(key).source;
117 ▶       normalizedProxy[pattern] = normalizedProxy[key];
118 ▶       delete normalizedProxy[key];
119 │     }
120 │   }
121 │ 
122 │   // Replace `pathRewrite` field with a `rewrite` function
123 │   for (const proxyEntry of Object.values(normalizedProxy)) {
124 │     if (
125 │       typeof proxyEntry === 'object' &&
126 ▶       'pathRewrite' in proxyEntry &&
127 │       proxyEntry.pathRewrite &&
128 │       typeof proxyEntry.pathRewrite === 'object'
129 │     ) {
130 │       // Preprocess path rewrite entries
131 │       const pathRewriteEntries: [RegExp, string][] = [];
132 │       for (const [pattern, value] of Object.entries(
133 │         proxyEntry.pathRewrite as Record<string, string>,
134 │       )) {
135 ▶         pathRewriteEntries.push([new RegExp(pattern), value]);
136 │       }
137 │ 
138 ▶       (proxyEntry as Record<string, unknown>).rewrite = pathRewriter.bind(
139 │         undefined,
140 │         pathRewriteEntries,
141 │       );
142 │ 
143 ▶       delete proxyEntry.pathRewrite;
144 │     }
145 │   }
146 │ 
147 │   return normalizedProxy;
148 │ }
```

📄 `angular-cli/packages/angular/build/src/utils/load-proxy-config.ts` L150–187 （▶ の行: 150–154, 168, 178, 186）

```ts
150 ▶ function pathRewriter(pathRewriteEntries: [RegExp, string][], path: string): string {
151 ▶   for (const [pattern, value] of pathRewriteEntries) {
152 ▶     const updated = path.replace(pattern, value);
153 ▶     if (path !== updated) {
154 ▶       return updated;
155 │     }
156 │   }
157 │ 
158 │   return path;
159 │ }
160 │ 
161 │ /**
162 │  * Calculates the line and column for an error offset in the content of a JSON file.
163 │  * @param location The offset error location from the beginning of the content.
164 │  * @param content The full content of the file containing the error.
165 │  * @returns An object containing the line and column
166 │  */
167 │ function getJsonErrorLineColumn(offset: number, content: string) {
168 ▶   if (offset === 0) {
169 │     return { line: 1, column: 1 };
170 │   }
171 │ 
172 │   let line = 0;
173 │   let position = 0;
174 │   // eslint-disable-next-line no-constant-condition
175 │   while (true) {
176 │     ++line;
177 │ 
178 ▶     const nextNewline = content.indexOf('\n', position);
179 │     if (nextNewline === -1 || nextNewline > offset) {
180 │       break;
181 │     }
182 │ 
183 │     position = nextNewline + 1;
184 │   }
185 │ 
186 ▶   return { line, column: offset - position + 1 };
187 │ }
```

1. **配列の形を object に**

   86〜108 行目。webpack の dev-server の書き方（`{ context: [...], target }` の配列）を、Vite の形（パスが鍵の object）にします。100 行目で `context` を消し、同じ object を、context の数だけ鍵に入れます。
2. **glob を正規表現に**

   114〜120 行目。`^` で始まらず `*` などを含む鍵を、picomatch で正規表現の文字列にして鍵を差し替えます（892fcc6892）。
3. **pathRewrite を関数に**

   123〜145 行目。webpack の `pathRewrite` の表を、Vite の `rewrite` 関数にします。150〜159 行目、最初に何かを変えた規則だけを使います。デモの comments.json は `rewrite('/api/users')` が `/users` でした。

> [!WARNING]
> **ハマりどころ**
>
> 44129f66a3 と 22.2.7 で、デモの結果が 3 か所違います。どれも 22.2.x に入った直しです。
>
> - 93〜95 行目、`context` が文字列 1 つの要素を飛ばします。array.js の `context: "/c"` は 44129f66a3 で消え、22.2.7 では残りました（22.2.x の 996e47f809、main では 1e45d4d46a）。
> - 117〜118 行目、変えた鍵を消して足し直すので、glob の鍵は object の最後に回ります。Vite は最初に当たった鍵を使うので、`/api/**` を `/api/special` の前に書いても、44129f66a3 では後ろになりました（22.2.x の 405bfa370a、main では 3871a9da91）。
> - 116 行目の正規表現は、パスだけを相手にする前提で作られます。Vite は `?` 以降を含む URL に当てるので、44129f66a3 の `/static/*.json` は `/static/a.json?v=1` に当たらず、`/static/list?file=data.json` に当たりました（22.2.x の 7d9ba62803、main では f9f3864974）。
>
> もう 1 つ、どちらの版でも、100 行目と 143 行目は読み込んだ設定の object そのものを書き換えます。`.js` の設定は Node のモジュールのキャッシュで同じ object が返るので、同じプロセスでもう 1 回 `loadProxyConfiguration` を呼ぶと、配列の形の要素はどれも `context` が無く、90〜92 行目で全部飛ばされて空になりました（デモの最後の行）。dev-server は起動のときに 1 回だけ呼ぶので、ふだんの `ng serve` では起きません。

## 9. デモ：本物の関数に入力を当てる

> **🧪 DEMO — utils のオプションの小道具（記録、@angular/build 22.2.7）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-options)

environment-options と normalize-cache の「44129f66a3」の欄は、22.2.7 と違うときだけ出します（normalize-cache の版の番号の違いは除きました）。environment-options は、この章で読んだ値については 14 の入力の全部で同じでした。

## 10. どう録ったか

スクリプトは `<work>/bcu-demo/b/` に置き、Node v24.22.1 で、サイトの node\_modules の @angular/build 22.2.7 の `src/utils/` の .js を require しました。44129f66a3 は、../angular-cli の .ts を esbuild の `transformSync` で .js にし、`./xxx` の読み込みを 22.2.7 の dist に、パッケージを @angular/build から解決したパスに書き換えたものです。環境変数は `PATH` と指定した変数だけを渡した子プロセスで読み、ファイルを読む関数には一時のフォルダ（`<tmp>`、終わったら消す）を使いました。

📄 `記録のスクリプト（rec-options.mjs）`

```
// utils のオプションの小道具（サイトの node_modules の @angular/build 22.2.7）に入力を当てて、結果とエラーの文言を記録する。
// 22.2.7 で中身が変わったファイル（environment-options・normalize-cache・load-proxy-config）は、
// ../angular-cli（44129f66a3、読むだけ）の .ts を esbuild で .js にした物にも同じ入力を当てる。
// 使い方: node rec-options.mjs <サイトのディレクトリ> <angular-cli のディレクトリ> <出力 JSON>
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [site, cli, out] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const tmp = path.join(here, '.opt-tmp');
const ws = path.join(tmp, 'ws');
const require = createRequire(path.join(site, 'package.json'));
const U = path.join(site, 'node_modules/@angular/build/src/utils');
const buildRequire = createRequire(path.join(U, 'index.js'));
const esbuild = require('esbuild');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const hide = (s) => String(s).replaceAll(realpathSync(tmp), '<tmp>').replaceAll(tmp, '<tmp>').replaceAll(site, '~/angular-research/angular-deep-dive');

// 44129f66a3 の .ts を .js にする。./xxx は 22.2.7 の dist を、パッケージは @angular/build から解決した物を指す。
function compile44(name) {
  const src = readFileSync(path.join(cli, 'packages/angular/build/src/utils', name + '.ts'), 'utf8');
  let js = esbuild.transformSync(src, { loader: 'ts', format: 'cjs', platform: 'node' }).code;
  js = js.replace(/(require|import)\("([^"]+)"\)/g, (m, fn, spec) => {
    if (spec.startsWith('node:')) return m;
    const target = spec.startsWith('./') ? path.join(U, spec + '.js') : buildRequire.resolve(spec);
    return `${fn}(${JSON.stringify(target)})`;
  });
  const file = path.join(tmp, name + '-44129f66a3.js');
  writeFileSync(file, js);
  return file;
}
const v22 = (name) => path.join(U, name + '.js');

// 1. environment-options: 環境変数を変えた子プロセスで読む
const envFile = { '22.2.7': v22('environment-options'), '44129f66a3': compile44('environment-options') };
const envCases = [
  ['（なし）', {}],
  ['NG_BUILD_DEBUG_OPTIMIZE=1', { NG_BUILD_DEBUG_OPTIMIZE: '1' }],
  ['NG_BUILD_DEBUG_OPTIMIZE=0', { NG_BUILD_DEBUG_OPTIMIZE: '0' }],
  ['NG_BUILD_DEBUG_OPTIMIZE=minify', { NG_BUILD_DEBUG_OPTIMIZE: 'minify' }],
  ['NG_BUILD_DEBUG_OPTIMIZE=mangle, Minify', { NG_BUILD_DEBUG_OPTIMIZE: 'mangle, Minify' }],
  ['NG_BUILD_DEBUG_OPTIMIZE=beautify', { NG_BUILD_DEBUG_OPTIMIZE: 'beautify' }],
  ['NG_BUILD_DEBUG_OPTIMIZE=yes', { NG_BUILD_DEBUG_OPTIMIZE: 'yes' }],
  ['NG_BUILD_DEBUG_OPTIMIZE=1 と NG_BUILD_MANGLE=1', { NG_BUILD_DEBUG_OPTIMIZE: '1', NG_BUILD_MANGLE: '1' }],
  ['NG_BUILD_MANGLE=FALSE', { NG_BUILD_MANGLE: 'FALSE' }],
  ['NG_HMR_TEMPLATES=0 と NG_HMR_CSTYLES=True', { NG_HMR_TEMPLATES: '0', NG_HMR_CSTYLES: 'True' }],
  ['NG_BUILD_PARTIAL_SSR=1 と NG_BUILD_BABEL_LINKER=yes', { NG_BUILD_PARTIAL_SSR: '1', NG_BUILD_BABEL_LINKER: 'yes' }],
  ['NG_BUILD_SASS_EMBEDDED=false', { NG_BUILD_SASS_EMBEDDED: 'false' }],
  ['NG_INTERNAL_ESBUILD_PLUGINS_DO_NOT_USE だけ', { NG_INTERNAL_ESBUILD_PLUGINS_DO_NOT_USE: '/x/plugins.js' }],
  ['同じ + BAZEL_BINDIR と JS_BINARY__EXECROOT', { NG_INTERNAL_ESBUILD_PLUGINS_DO_NOT_USE: '/x/plugins.js', BAZEL_BINDIR: 'bazel-out/bin', JS_BINARY__EXECROOT: '/x' }],
];
const keys = ['allowMangle', 'shouldBeautify', 'allowMinify', 'useComponentStyleHmr', 'useComponentTemplateHmr', 'usePartialSsrBuild', 'useBabelLinker', 'useSassEmbedded', 'bazelEsbuildPluginPath'];
const env = envCases.map(([label, vars]) => {
  const res = {};
  for (const [ver, file] of Object.entries(envFile)) {
    const o = execFileSync(process.execPath, ['-e', `const m = require(${JSON.stringify(file)}); console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(keys)}.map((k) => [k, m[k] ?? null]))))`], { env: { PATH: process.env.PATH, ...vars }, encoding: 'utf8' });
    res[ver] = JSON.parse(o);
  }
  return { label, vars, res };
});

// 2. createI18nOptions と loadTranslations（2 つの版で同じファイル）
const { createI18nOptions, loadTranslations } = require(v22('i18n-options'));
const i18nCases = [
  ['i18n が無い', {}, undefined, false],
  ['sourceLocale: ja、fr と de（inline: true）', { i18n: { sourceLocale: 'ja', locales: { fr: 'src/locale/fr.xlf', de: ['src/locale/de.xlf', 'src/locale/de-extra.xlf'] } } }, true, false],
  ['同じ、inline: [fr]', { i18n: { sourceLocale: 'ja', locales: { fr: 'src/locale/fr.xlf', de: 'src/locale/de.xlf' } } }, ['fr'], false],
  ['inline: [es]（無いロケール）', { i18n: { locales: { fr: 'fr.xlf' } } }, ['es'], false],
  ['sourceLocale の object と baseHref（SSR）', { i18n: { sourceLocale: { code: 'en-GB', baseHref: '/gb/' }, locales: { fr: { translation: 'fr.xlf', baseHref: '/fr/' } } } }, true, true],
  ['subPath と baseHref を両方', { i18n: { locales: { fr: { translation: 'fr.xlf', subPath: 'francais', baseHref: '/fr/' } } } }, true, false],
  ['subPath に / を含む', { i18n: { locales: { fr: { translation: 'fr.xlf', subPath: 'fr/ca' } } } }, true, false],
  ['2 つのロケールの subPath が同じ', { i18n: { locales: { fr: { translation: 'fr.xlf', subPath: 'eu' }, de: { translation: 'de.xlf', subPath: 'eu' } } } }, true, false],
  ['同じ subPath、inline: [fr] だけ', { i18n: { locales: { fr: { translation: 'fr.xlf', subPath: 'eu' }, de: { translation: 'de.xlf', subPath: 'eu' } } } }, ['fr'], false],
  ['translation の無い object', { i18n: { locales: { fr: { baseHref: '/fr/' } } } }, true, false],
  ['translation が数', { i18n: { locales: { fr: 123 } } }, true, false],
  ['sourceLocale と同じロケールに翻訳', { i18n: { sourceLocale: 'fr', locales: { fr: 'fr.xlf' } } }, true, false],
  ['i18n が配列', { i18n: [] }, true, false],
];
const i18n = i18nCases.map(([label, meta, inline, ssr]) => {
  const warns = [];
  try {
    const r = createI18nOptions(meta, inline, { warn: (m) => warns.push(m) }, ssr);
    return { label, meta, inline: inline ?? null, ssr, result: { inlineLocales: [...r.inlineLocales], sourceLocale: r.sourceLocale, hasDefinedSourceLocale: r.hasDefinedSourceLocale ?? null, shouldInline: r.shouldInline, locales: r.locales }, warns };
  } catch (e) {
    return { label, meta, inline: inline ?? null, ssr, error: e.message, warns };
  }
});
const tlog = [];
const desc = { files: [{ path: 'src/locale/fr.xlf' }, { path: 'src/locale/fr-extra.xlf' }], subPath: 'fr' };
const fakeLoader = (p) => p.endsWith('fr.xlf')
  ? { translations: { hello: { text: 'Bonjour' }, bye: { text: 'Au revoir' } }, format: 'xliff', locale: 'fr', diagnostics: { messages: [] }, integrity: 'sha256-a' }
  : { translations: { bye: { text: 'Salut' } }, format: 'json', locale: 'fr-CA', diagnostics: { messages: [{ type: 'warning', message: '偽の警告' }] }, integrity: 'sha256-b' };
const formats = new Set();
loadTranslations('fr', desc, '/ws', fakeLoader, { warn: (m) => tlog.push(['warn', m]), error: (m) => tlog.push(['error', m]) }, formats, undefined);
const translations = { log: tlog, files: desc.files, translation: desc.translation, formats: [...formats] };

// 3. normalizeAssetPatterns（2 つの版で同じファイル）
const { normalizeAssetPatterns } = require(v22('normalize-asset-patterns'));
for (const d of ['src/assets', 'public', 'src-assets/img', 'projects/admin/src/assets']) mkdirSync(path.join(ws, d), { recursive: true });
writeFileSync(path.join(ws, 'src/favicon.ico'), '');
const assetCases = [
  ['src の中のファイル（文字列）', ['src/favicon.ico'], '', 'src'],
  ['src の中のフォルダ（文字列）', ['src/assets'], '', 'src'],
  ['プロジェクトの直下のフォルダ（文字列）', ['public'], '', 'src'],
  ['src と同じ頭の兄弟のフォルダ（文字列）', ['src-assets'], '', 'src'],
  ['無いパス（文字列）', ['src/missing'], '', 'src'],
  ['ワークスペースの外（文字列）', ['../outside'], '', 'src'],
  ['ライブラリのプロジェクト（projectRoot: projects/admin）', ['projects/admin/src/assets'], 'projects/admin', 'projects/admin/src'],
  ['object、output なし', [{ glob: '**/*', input: 'public' }], '', 'src'],
  ['object、output: ../out', [{ glob: '**/*', input: 'public', output: '../out' }], '', 'src'],
  ['object、input が外', [{ glob: '**/*', input: '/etc' }], '', 'src'],
];
const assets = assetCases.map(([label, patterns, projectRoot, sourceRoot]) => {
  const input = JSON.parse(JSON.stringify(patterns));
  try {
    const r = normalizeAssetPatterns(patterns, ws, projectRoot, sourceRoot);
    return { label, input, projectRoot, sourceRoot, result: JSON.parse(hide(JSON.stringify(r))), mutated: JSON.stringify(patterns) !== JSON.stringify(input) ? patterns : null };
  } catch (e) {
    return { label, input, projectRoot, sourceRoot, error: hide(e.message) };
  }
});

// 4. normalizeCacheOptions（getCacheBasePath が変わった）
const cacheFile = { '22.2.7': v22('normalize-cache'), '44129f66a3': compile44('normalize-cache') };
const g = path.join(tmp, 'git');
mkdirSync(path.join(g, 'plain/.git'), { recursive: true });
mkdirSync(path.join(g, 'main/.git/worktrees/wt'), { recursive: true });
mkdirSync(path.join(g, 'main/apps/web'), { recursive: true });
mkdirSync(path.join(g, 'wt/apps/web'), { recursive: true });
mkdirSync(path.join(g, 'wt/apps/new'), { recursive: true });
writeFileSync(path.join(g, 'wt/.git'), `gitdir: ${path.join(g, 'main/.git/worktrees/wt')}\n`);
writeFileSync(path.join(g, 'main/.git/worktrees/wt/commondir'), '../..\n');
const cacheCases = [
  ['普通のリポジトリ', {}, 'plain', {}],
  ['worktree の直下', {}, 'wt', {}],
  ['worktree の中の apps/web（main にもある）', {}, 'wt/apps/web', {}],
  ['worktree の中の apps/new（main に無い）', {}, 'wt/apps/new', {}],
  ['path が絶対パス', { cli: { cache: { path: '/var/cache/ng' } } }, 'wt', {}],
  ['CI=1（environment は既定の local）', {}, 'plain', { CI: '1' }],
  ['CI=true、environment: ci', { cli: { cache: { environment: 'ci' } } }, 'plain', { CI: 'true' }],
  ['CI=yes（CI とみなさない）', {}, 'plain', { CI: 'yes' }],
  ['enabled: false、environment: all', { cli: { cache: { enabled: false, environment: 'all' } } }, 'plain', {}],
];
const cacheMods = Object.fromEntries(Object.entries(cacheFile).map(([v, f]) => [v, require(f)]));
const cache = cacheCases.map(([label, meta, dir, vars]) => {
  const res = {};
  for (const [ver, mod] of Object.entries(cacheMods)) {
    const saved = process.env.CI;
    delete process.env.CI;
    Object.assign(process.env, vars);
    const r = mod.normalizeCacheOptions(meta, path.join(g, dir));
    if (saved === undefined) delete process.env.CI; else process.env.CI = saved;
    res[ver] = JSON.parse(hide(JSON.stringify(r)));
  }
  return { label, meta, dir, vars, res };
});

// 5. loadPostcssConfiguration と findTailwindConfiguration（読む関数は 2 つの版で同じ）
const { generateSearchDirectories, loadPostcssConfiguration, findTailwindConfiguration } = require(v22('postcss-configuration'));
const pc = path.join(tmp, 'pc');
const pcCases = [
  ['配列の形', { 'postcss.config.json': JSON.stringify({ plugins: ['autoprefixer', ['postcss-preset-env', { stage: 1 }]] }) }],
  ['object の形（false と文字列）', { 'postcss.config.json': JSON.stringify({ plugins: { autoprefixer: {}, cssnano: false, 'postcss-x': 'opt', 'postcss-y': true } }) }],
  ['.postcssrc.json だけ', { '.postcssrc.json': JSON.stringify({ plugins: { autoprefixer: {} } }) }],
  ['両方ある', { 'postcss.config.json': JSON.stringify({ plugins: ['a'] }), '.postcssrc.json': JSON.stringify({ plugins: ['b'] }) }],
  ['plugins が空', { 'postcss.config.json': JSON.stringify({ plugins: [] }) }],
  ['JSON が壊れている', { 'postcss.config.json': '{ "plugins": [ "a", ] }' }],
  ['postcss.config.js（読まない）と tailwind.config.ts', { 'postcss.config.js': 'module.exports = {}', 'tailwind.config.ts': 'export default {}' }],
];
const postcss = [];
for (const [i, [label, files]] of pcCases.entries()) {
  const dir = path.join(pc, String(i));
  mkdirSync(dir, { recursive: true });
  for (const [f, c] of Object.entries(files)) writeFileSync(path.join(dir, f), c);
  const dirs = await generateSearchDirectories([dir]);
  try {
    const r = await loadPostcssConfiguration(dirs);
    postcss.push({ label, files, result: r ? JSON.parse(hide(JSON.stringify(r))) : null, tailwind: hide(findTailwindConfiguration(dirs) ?? 'なし') });
  } catch (e) {
    postcss.push({ label, files, error: hide(e.message) });
  }
}

// 6. loadProxyConfiguration
const proxyFile = { '22.2.7': v22('load-proxy-config'), '44129f66a3': compile44('load-proxy-config') };
const px = path.join(tmp, 'px');
const pxFiles = {
  'comments.json': '{\n  // API\n  "/api": { "target": "http://localhost:3000", "pathRewrite": { "^/api": "" } },\n}\n',
  'broken.json': '{\n  "/api": { "target": "http://localhost:3000" }\n  "/b": {}\n}\n',
  'glob-order.json': JSON.stringify({ '/api/**': { target: 'http://b' }, '/api/special': { target: 'http://a' }, '/static/*.json': { target: 'http://c' } }),
  'array.js': 'module.exports = [{ context: ["/a", "/b"], target: "http://x" }, { context: "/c", target: "http://y" }];',
  'esm.mjs': 'export default { "/m": { target: "http://m" } };',
};
// 版ごとに別のフォルダに置く（.js の設定は require のキャッシュで同じ object が返り、1 回目の呼び出しが書き換えるため）
for (const ver of ['22.2.7', '44129f66a3']) {
  mkdirSync(path.join(px, ver), { recursive: true });
  for (const [f, c] of Object.entries(pxFiles)) writeFileSync(path.join(px, ver, f), c);
}
const probes = { '/static/*.json': ['/static/a.json', '/static/a.json?v=1', '/static/list?file=data.json'] };
const proxyMods = Object.fromEntries(Object.entries(proxyFile).map(([v, f]) => [v, require(f)]));
const proxy = [];
for (const f of [...Object.keys(pxFiles), 'missing.json']) {
  const res = {};
  for (const [ver, mod] of Object.entries(proxyMods)) {
    try {
      const r = await mod.loadProxyConfiguration(path.join(px, ver), f);
      const entries = Object.entries(r).map(([k, v]) => {
        const shown = { ...v };
        if (typeof v.rewrite === 'function') shown.rewrite = `function → rewrite('/api/users') = '${v.rewrite('/api/users')}'`;
        const glob = Object.keys(probes).find((p) => JSON.stringify(k) !== JSON.stringify(p) && f === 'glob-order.json' && v.target === 'http://c');
        const tests = glob ? Object.fromEntries(probes[glob].map((u) => [u, new RegExp(k).test(u)])) : null;
        return { key: k, value: shown, tests };
      });
      res[ver] = { entries };
    } catch (e) {
      res[ver] = { error: hide(e.message) };
    }
  }
  proxy.push({ file: f, content: pxFiles[f] ?? null, res });
}

// 同じ版・同じ .js のファイルで、さらに 2 回呼ぶ（上のループで 1 回呼んだ後）
const twice = [];
for (let i = 0; i < 2; i++) twice.push(Object.keys(await proxyMods['22.2.7'].loadProxyConfiguration(path.join(px, '22.2.7'), 'array.js')));
proxy.push({ file: 'array.js を 22.2.7 でもう 2 回', content: null, res: { '22.2.7': { entries: twice[1].map((key) => ({ key, value: {}, tests: null })) }, '44129f66a3': { error: '（2 回目の呼び出しは 22.2.7 だけで記録）' } }, twice });

rmSync(tmp, { recursive: true, force: true });
writeFileSync(out, JSON.stringify({ version: require(path.join(site, 'node_modules/@angular/build/package.json')).version, node: process.version, env, i18n, translations, assets, cache, postcss, proxy }, null, 1));
console.log('env', env.length, 'i18n', i18n.length, 'assets', assets.length, 'cache', cache.length, 'postcss', postcss.length, 'proxy', proxy.length);

```

## ここまでの呼び出し

- `normalizeOptions(context, projectName, options)` — builders/application/options.ts — *オプションの正規化の章*
  - `normalizeCacheOptions(projectMetadata, workspaceRoot)` — normalize-cache.ts 95
    - `getCacheBasePath(workspaceRoot, path)` — 55 — *worktree なら元のリポジトリの側*
  - `createI18nOptions(metadata, localize, logger, ssr)` — i18n-options.ts 79
    - `normalizeTranslationFileOption`・`ensureValidSubPath` — 35・70
  - `normalizeAssetPatterns(assets, workspaceRoot, projectRoot, sourceRoot)` — normalize-asset-patterns.ts 15
  - `generateSearchDirectories` → `loadPostcssConfiguration` — postcss-configuration.ts 33 → 74
- `loadTranslations(locale, desc, …)` — i18n-options.ts 239 — *i18n のビルドの前*
- `setupServer` → `createServerConfig` — dev-server/vite/server.ts 30
  - `loadProxyConfiguration(workspaceRoot, proxyConfig)` — load-proxy-config.ts 18
    - `normalizeProxyConfiguration` → `pathRewriter` — 81 → 150

## テストと直し方

| spec | describe / it と行 | この章のどこ |
| --- | --- | --- |
| utils/environment-options\_spec.ts | describe environment options - maxWorkers（11 行目、it 11 件） | この章で読んだ値の it はありません（`NG_BUILD_MAX_WORKERS` だけ） |
| utils/normalize-cache\_spec.ts | describe normalizeCacheOptions（14 行目）。普通のリポジトリ（25 行目）、worktree（36 行目）、worktree の相対の path（61 行目）、絶対パス（85 行目）、submodule（110 行目）、git なし（130 行目） | 6 節。worktree の中の入れ子のワークスペースの it は、22.2.x の b198044048 で足されました |
| builders/application/tests/options/assets\_spec.ts | ビルダーを通した assets の it | 5 節。`normalizeAssetPatterns` だけの spec はありません |
| builders/dev-server/tests/options/proxy-config\_spec.ts | dev-server を立てて proxy を確かめる it | 8 節 |
| （無い） | i18n-options・postcss-configuration・load-proxy-config の unit の spec | 2〜4・7・8 節 |

environment-options\_spec.ts の 11 件と normalize-cache\_spec.ts の 6 件は、[6 回目](06-bcu-index.md)に書いた bazel の 1 回（`//packages/angular/build:test`、101 件、0 failures）の中で通りました。1 節の `NG_BUILD_DEBUG_OPTIMIZE` を固めるなら、environment-options\_spec.ts の 14〜18 行目の `loadEnvironmentOptions` と同じく、`process.env` を変えてから `delete require.cache` でモジュールを読み直す形にします。値はファイルを読んだときに決まるからです。5 節の兄弟のフォルダは、assets を 1 つ渡す小さな unit の spec を `normalize-asset-patterns_spec.ts` として作り、`src-assets` の output が `src-assets` になることを期待します。直すのは 38・40・42 行目で、新しい本家の 58c30c05f6 と同じ形です。

## 聞かれそうな質問

**Q. NG\_BUILD\_DEBUG\_OPTIMIZE=minify にしたのに、出力が整形されています。**

70〜82 行目は、60〜64 行目のデバッグ向けの値（beautify が真）から始めて、書いた名前だけを真にします。`minify` と書くと minify は戻りますが、beautify は真のままです。beautify を消す書き方はありません。

**Q. NG\_BUILD\_MANGLE=yes が効きません。**

12・15 行目の 4 つの値（大文字小文字は問わない）以外は、`parseTristate` の 46 行目で `undefined` になり、91 行目でデバッグ最適化の値に戻るからです。警告も出ません。

**Q. assets に "src-assets" と書いたら「outside of the output path」と言われました。**

38 行目の `startsWith` が、`src-assets` を sourceRoot の `src` の中とみなし、70 行目の出力が `../src-assets` になるからです。`{ "glob": "**/*", "input": "src-assets", "output": "src-assets" }` の object の形なら 74〜78 行目の道を通ります。新しい本家（58c30c05f6）では直っています。

**Q. worktree で ng build すると、キャッシュが元のリポジトリの側にできます。**

67〜79 行目で `.git` のファイルから元のリポジトリを探し、その側に置くからです（52ae7f862a）。worktree を作り直してもキャッシュを使い回せます。別の場所にしたければ、angular.json の `cli.cache.path` に絶対パスを書けば 56〜58 行目でそのまま使われます。

**Q. proxy の設定に書いた順番が守られません。**

44129f66a3 では 117〜118 行目で glob の鍵を消して足し直すので、glob の鍵が後ろに回ります。22.2.7 では、object を作り直して順番を保つようになりました（405bfa370a）。

## 読み終えて

- 環境変数は `parseTristate` で真・偽・わからないの 3 つ。読み込んだときに 1 回だけ決まる。
- i18n のロケールは文字列か配列か `translation` を持つ object。`subPath` は出力するロケールの中でだけ重なりを調べる。翻訳ファイルは後のものが勝つ。
- assets の文字列は、sourceRoot・プロジェクト・ワークスペースのどれかを根にして output を決める。その判定は `startsWith`（新しい本家で直った）。
- キャッシュは worktree なら元のリポジトリの側に置く。22.2.7 で入れ子のワークスペースの位置もたどるようになった。
- PostCSS は JSON の 2 つの名前だけ、proxy は JSON（jsonc）か import()。proxy の glob は正規表現の鍵になり、22.2.x で順番と `?` の扱いが直った。

---

← 前: [自動 CSP：auto-csp.ts がインラインの script をハッシュとローダーに変える](07-bcu-auto-csp.md)  
次: [パス・URL・ソースマップ・版の小道具：path・url・source-map・hash・version](09-bcu-paths.md) →
