[目次](../README.md) › [@angular/build の読み残し（sass・i18n・dev-server・unit-test）](README.md) › 第 4 回 / 全 9 回

# 翻訳を差し込む：i18n-locale-plugin と翻訳の読み込み

> tools/esbuild/i18n-locale-plugin.ts・builders/application/i18n.ts・i18n-translation-reader.ts：ロケールのデータを探す起点（プラグインはワークスペースの根、ワーカーは作業フォルダ）、書き換えないビルドのプラグイン、inlineI18n の結果の集め方と並べ直し、読めない翻訳ファイルのときの文、ワーカーの辞書を読む側の残り。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bld-i18n-inline)

---

この章で分かること：`localize` を有効にしたビルドで、ロケールのデータ（日付や数の書式、複数形の規則。`@angular/common/locales/global/fr.js` のようなファイル）を、誰が・どの場所を起点に探して差し込むか。書き換えないビルドで元の言語のデータを入れる esbuild のプラグインが、見つからないときに何を返すか。`inlineI18n` がロケールごとの結果をどう集め、出力とアセットを並べ直すか。そして、翻訳ファイルの形式が分からないとき・壊れているときに、ビルドが何を言うか。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/src/` の `tools/esbuild/i18n-locale-plugin.ts`・`builders/application/i18n.ts`・`tools/esbuild/i18n-translation-reader.ts` の残りです。出力のフォルダと baseHref の決め方、ロケールごとの後処理、翻訳ファイルの形式を中身で見分ける `load-translations.ts`、ロケールのデータの探し方の本体（64〜93 行目）は [cli-i18n の章](../cli/09-cli-i18n.md)の 2・5・7 節で、ワーカーが翻訳を置き換える仕組みと `SharedArrayBuffer` の辞書の作り方は [esb-i18n-inliner の章](../esb/04-esb-i18n-inliner.md)で読んだので繰り返しません。

1. [1. sass の url を書き換える](01-bld-sass-rebase.md)
2. [2. sass を常駐のコンパイラで動かす](02-bld-sass-service.md)
3. [3. メッセージを取り出す](03-bld-extract-i18n.md)
4. **4. 翻訳を差し込む**（この章）
5. [5. チャンクを束ね直す](05-bld-chunk-optimizer.md)
6. [6. ng serve の入口の残り](06-bld-dev-server-rest.md)
7. [7. Vite の middleware の残り](07-bld-vite-middlewares.md)
8. [8. unit-test と ng-packagr](08-bld-unit-test-packagr.md)
9. [9. spec と issue](09-bld-tests-issues.md)

> [!NOTE]
> **ポイント**
>
> 記録はサイトの `@angular/build` 22.2.7 です。22.2.7 ではファイルの置き場が違い、ロケールのデータの関数は `tools/i18n/locale-data.js`、辞書を読む側は `tools/i18n/i18n-translation-reader.js` にあります（e7ebbcdc25 の移動。44129f66a3 の後の main では eb1edeb514）。関数の中身は 44129f66a3 と同じです。`i18n.ts` は、22.2.7 では `inlineI18n` が 5 番目の引数に外のワーカーのプールを受け取れ、ワーカーの数の上限が `maxInlinerWorkers`（8 まで）である点が違います（df444c093a・c76b2d58a9）。

## 0. 全体の流れ

1. **翻訳を読む**

   ビルドの最初に、出力するロケールの翻訳ファイルを読む（cli-i18n の章の 2 節）。その前に `@angular/localize` の版を覚える（5 節）。
2. **書き換えないビルド**

   `localize` を使わず `sourceLocale` だけを書いたときは、polyfills に `angular:locale/data:<ロケール>` を import させ、3 節のプラグインがそれを解決する。
3. **書き換えるビルド**

   1 回束ねた後、`inlineI18n` が `I18nInliner` に全ロケールを渡す。ワーカーは polyfills の目印の所に、2 節の `loadLocaleData` で読んだデータを差し込む（cli-i18n の章の 5 節の 480 行目）。
4. **ロケールごとに後処理して並べる**

   結果をロケールごとに受け取り、警告とエラーを集め、出力とアセットを `<subPath>/` の下に並べ直す（4 節）。

## 1. ロケールの名前を検める：resolveLocaleDataPath の頭

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-locale-plugin.ts` L9–42 （▶ の行: 10–11, 16, 21, 26–29, 35, 41）

```ts
 9 │ import type { Plugin } from 'esbuild';
10 ▶ import { readFile } from 'node:fs/promises';
11 ▶ import { createProjectResolver } from '../../utils/resolve-project';
12 │ 
13 │ /**
14 │  * The internal namespace used by generated locale import statements and Angular locale data plugin.
15 │  */
16 ▶ export const LOCALE_DATA_NAMESPACE = 'angular:locale/data';
17 │ 
18 │ /**
19 │  * The base module location used to search for locale specific data.
20 │  */
21 ▶ export const LOCALE_DATA_BASE_MODULE = '@angular/common/locales/global';
22 │ 
23 │ /**
24 │  * Result of resolving locale data for a given locale tag.
25 │  */
26 ▶ export interface LocaleDataResolution {
27 ▶   path?: string;
28 ▶   warning?: string;
29 ▶   error?: string;
30 │ }
31 │ 
32 │ /**
33 │  * Result of loading locale data for a given locale tag.
34 │  */
35 ▶ export interface LoadedLocaleData {
36 │   code?: string;
37 │   warning?: string;
38 │   error?: string;
39 │ }
40 │ 
41 ▶ const localeDataCache = new Map<string, Promise<LoadedLocaleData>>();
42 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-locale-plugin.ts` L43–63 （▶ の行: 47, 50, 52, 55–60）

```ts
43 │ /**
44 │  * Resolves the path to the Angular locale data file for a given locale tag.
45 │  *
46 │  * @param rawLocaleTag The raw locale identifier (e.g. "fr-CA", "de", "en-US").
47 ▶  * @param projectResolve A function that attempts to resolve a path string to an absolute file path.
48 │  * @returns Resolution result with file path, or warning/error diagnostics if applicable.
49 │  */
50 ▶ export function resolveLocaleDataPath(
51 │   rawLocaleTag: string,
52 ▶   projectResolve: (potentialPath: string) => string | undefined,
53 │ ): LocaleDataResolution {
54 │   let partialLocaleTag: string;
55 ▶   try {
56 ▶     const locale = new Intl.Locale(rawLocaleTag);
57 ▶     partialLocaleTag = locale.baseName;
58 ▶   } catch {
59 ▶     return {
60 ▶       error: `Invalid or unsupported locale provided in configuration: "${rawLocaleTag}"`,
61 │     };
62 │   }
63 │ 
```

16 行目の `angular:locale/data` は、3 節のプラグインが受け持つ import の名前の頭（esbuild の名前空間）、21 行目はデータを探すパッケージの場所です。26〜30 行目と 35〜39 行目、結果は「パス・警告・エラー」か「中身・警告・エラー」で、例外を投げずに値で返します。

52 行目、パッケージを探す関数は呼ぶ側から渡されます（2・3 節で、渡す関数の起点が違う）。56〜57 行目、`Intl.Locale` にロケールの名前を渡して `baseName`（言語・文字・地域だけの形。`-u-` の拡張などを外したもの）を取り、BCP 47 の名前でなければ 60 行目のエラーです。デモの `fr_FR!` と `de_DE!` はここで「Invalid or unsupported locale provided in configuration」になりました。この先、`en`・`en-US` なら何もしない、無ければ後ろを 1 つずつ削る、は cli-i18n の章の 5 節です。

## 2. loadLocaleData：ワーカーが呼ぶ方と、探す起点

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-locale-plugin.ts` L95–121 （▶ の行: 99, 102, 104, 106–110, 112–114, 118–119）

```ts
 95 │ /**
 96 │  * Loads the Angular global locale data script for a specified locale tag.
 97 │  *
 98 │  * @param rawLocaleTag The raw locale identifier (e.g. "fr-CA", "de", "en-US").
 99 ▶  * @param projectRoot Optional project root for module resolution.
100 │  * @returns A promise resolving to the loaded locale data script code and any diagnostic warnings.
101 │  */
102 ▶ export function loadLocaleData(
103 │   rawLocaleTag: string,
104 ▶   projectRoot?: string,
105 │ ): Promise<LoadedLocaleData> {
106 ▶   let cached = localeDataCache.get(rawLocaleTag);
107 ▶   if (!cached) {
108 ▶     cached = (async () => {
109 ▶       const projectResolve = createProjectResolver(projectRoot ?? process.cwd());
110 ▶       const resolution = resolveLocaleDataPath(rawLocaleTag, (potentialPath) => {
111 │         try {
112 ▶           return projectResolve(potentialPath);
113 ▶         } catch {
114 ▶           return undefined;
115 │         }
116 │       });
117 │ 
118 ▶       if (resolution.error) {
119 ▶         return { error: resolution.error };
120 │       }
121 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-locale-plugin.ts` L122–139 （▶ の行: 122, 124, 126, 128, 132, 135, 138）

```ts
122 ▶       if (resolution.path) {
123 │         try {
124 ▶           const code = await readFile(resolution.path, 'utf8');
125 │ 
126 ▶           return { code, warning: resolution.warning };
127 │         } catch (e) {
128 ▶           return { error: `Failed to read locale data file: ${(e as Error).message}` };
129 │         }
130 │       }
131 │ 
132 ▶       return { warning: resolution.warning };
133 │     })();
134 │ 
135 ▶     localeDataCache.set(rawLocaleTag, cached);
136 │   }
137 │ 
138 ▶   return cached;
139 │ }
```

1. **106〜107 行目：ロケールの名前で覚える**

   41 行目の表は、ロケールの名前だけを鍵にした promise の表。同じプロセス（同じワーカー）の中で、同じロケールは 1 回しか探さない。
2. **109 行目：起点**

   `projectRoot` を渡されなければ `process.cwd()`。そこから `createProjectResolver`（その場所の package.json を起点にした `require.resolve`）を作る。
3. **110〜116 行目：探す**

   1 節の関数に、例外を `undefined` に変えた探し方を渡す。
4. **122〜132 行目：読む**

   見つかれば中身を文字として読み、警告（`fr-XX` → `fr` のような近い言語で代えたとき）と一緒に返す。見つからなければ警告だけ。

> [!WARNING]
> **ハマりどころ**
>
> このファイルの中で `loadLocaleData` を呼ぶのはワーカーで、そこでは `loadLocaleData(locale)` と 1 つの引数だけです（cli-i18n の章で引いた `i18n-inliner-worker.ts` の 480 行目）。だから 109 行目の起点は、いつも `process.cwd()` です。architect の API で同じ build ターゲットを、作業フォルダだけを node\_modules の無い場所に変えて動かすと、ビルドは成功し翻訳も入りましたが、fr の polyfills.js にロケールのデータが入らず（2907 バイト → 198 バイト）、警告は「Locale data for 'fr' cannot be found. No locale data will be included for this locale.」の 1 行だけでした（デモの「作業フォルダ」）。3 節のプラグインは同じ探し方を `absWorkingDir`（ワークスペースの根）から始めるので、書き換えないビルドではこうなりません。
>
> 記録を録るとき、前のビルドの `.angular/cache` が残っていると、作業フォルダを変えてもデータが入りました。I18nInliner のディスクのキャッシュの鍵（ロケール・翻訳・`missingTranslation`・localize の版。esb-i18n-inliner の章の 4 節）に起点が入っていないので、前の結果が当たるからです。2 回とも `.angular` を消してから録っています。新しい本家（1e4b0960d8）でも、`tools/i18n/locale-data.ts` と `i18n-inliner-worker.ts` の呼び方は同じです。

## 3. 書き換えないビルドのプラグイン：createAngularLocaleDataPlugin

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-locale-plugin.ts` L141–171 （▶ の行: 148, 150–153, 155–156, 158, 164–168）

```ts
141 │ /**
142 │  * Creates an esbuild plugin that resolves Angular locale data files from `@angular/common`.
143 │  *
144 │  * @returns An esbuild plugin.
145 │  */
146 │ export function createAngularLocaleDataPlugin(): Plugin {
147 │   return {
148 ▶     name: 'angular-locale-data',
149 │     setup(build): void {
150 ▶       build.onResolve({ filter: /^angular:locale\/data:/ }, async ({ path }) => {
151 ▶         const rawLocaleTag = path.split(':', 3)[2];
152 ▶         const { absWorkingDir } = build.initialOptions;
153 ▶         let projectResolve: ((packageName: string) => string) | undefined;
154 │ 
155 ▶         const resolution = resolveLocaleDataPath(rawLocaleTag, (potentialPath) => {
156 ▶           projectResolve ??= createProjectResolver(absWorkingDir ?? process.cwd());
157 │           try {
158 ▶             return projectResolve(potentialPath);
159 │           } catch {
160 │             return undefined;
161 │           }
162 │         });
163 │ 
164 ▶         if (resolution.error) {
165 ▶           return {
166 ▶             path: rawLocaleTag,
167 ▶             namespace: LOCALE_DATA_NAMESPACE,
168 ▶             errors: [{ text: resolution.error }],
169 │           };
170 │         }
171 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-locale-plugin.ts` L172–195 （▶ の行: 172, 174–177, 182–184, 188–191）

```ts
172 ▶         if (!resolution.path) {
173 │           return {
174 ▶             path: rawLocaleTag,
175 ▶             namespace: LOCALE_DATA_NAMESPACE,
176 ▶             warnings: resolution.warning
177 ▶               ? [{ location: null, text: resolution.warning }]
178 │               : undefined,
179 │           };
180 │         }
181 │ 
182 ▶         return {
183 ▶           path: resolution.path,
184 ▶           warnings: resolution.warning ? [{ location: null, text: resolution.warning }] : undefined,
185 │         };
186 │       });
187 │ 
188 ▶       // Locales that cannot be found or are en/en-US will be loaded as empty content
189 ▶       build.onLoad({ filter: /./, namespace: LOCALE_DATA_NAMESPACE }, () => ({
190 ▶         contents: '',
191 ▶         loader: 'empty',
192 │       }));
193 │     },
194 │   };
195 │ }
```

polyfills の組み立て（cli-i18n の章の 3 節の 706 行目）が、`localize` を使わず `sourceLocale` を書いたときに `import "angular:locale/data:de-XX"` を足し、このプラグインを esbuild のプラグインの先頭に入れます。

1. **150〜151 行目：名前を取り出す**

   `angular:locale/data:` で始まる import だけを受け、`:` で 3 つに割った 3 つ目をロケールの名前にする。
2. **152〜162 行目：ワークスペースの根から探す**

   esbuild の `absWorkingDir` を起点にする。153・156 行目、探す関数は初めて要るときに 1 回だけ作る（`en-US` なら作らない）。
3. **164〜170 行目：名前がおかしい**

   名前空間を自分のものにして、esbuild のエラーを返す。デモの `de_DE!` は「\[plugin angular-locale-data\]」の付いたエラーになり、ビルドが失敗した。
4. **172〜180 行目：データが無い**

   `en`・`en-US` か、どこまで削っても無いとき。自分の名前空間に入れ、あれば警告を付ける。
5. **182〜185 行目：見つかった**

   名前空間を付けずに実際のパスを返すので、esbuild はふつうの JS として読む。代えたときの警告はここで出る（デモの `de-XX` は「Using locale data for 'de'」と、import の行を指した警告）。
6. **188〜192 行目：自分の名前空間は空**

   `loader: 'empty'`（中身の無いモジュール）で読む。

ユーザーが `@angular/common` を外部（`externalDependencies`）にしても、ここで足した import は束ねに残ります。外部の判定の `isExplicitExternal` が、21 行目の場所で始まる import を先に外すからです（[abl-context-post の章](../abl/03-abl-context-post.md)で引いた `execute-build.ts` の 254〜258 行目）。

## 4. inlineI18n の残り：結果の集め方と並べ直し

📄 `angular-cli/packages/angular/build/src/builders/application/i18n.ts` L9–34 （▶ の行: 19–25, 28–29）

```ts
 9 │ import { BuilderContext } from '@angular-devkit/architect';
10 │ import type { Metafile } from 'esbuild';
11 │ import assert from 'node:assert';
12 │ import { readFile } from 'node:fs/promises';
13 │ import { join } from 'node:path';
14 │ import {
15 │   ExecutionResult,
16 │   PrerenderedRoutesRecord,
17 │ } from '../../tools/esbuild/bundler-execution-result';
18 │ import { BuildOutputFileType, InitialFileRecord } from '../../tools/esbuild/bundler-files';
19 ▶ import { I18nInliner } from '../../tools/esbuild/i18n-inliner';
20 ▶ import { maxWorkers } from '../../utils/environment-options';
21 ▶ import { loadTranslations } from '../../utils/i18n-options';
22 ▶ import { createTranslationLoader } from '../../utils/load-translations';
23 ▶ import { createProjectResolver } from '../../utils/resolve-project';
24 ▶ import { executePostBundleSteps } from './execute-post-bundle';
25 ▶ import { NormalizedApplicationBuildOptions, getLocaleBaseHref } from './options';
26 │ 
27 │ /**
28 ▶  * Inlines all active locales as specified by the application build options into all
29 ▶  * application JavaScript files created during the build.
30 │  * @param metafile An esbuild metafile object.
31 │  * @param options The normalized application builder options used to create the build.
32 │  * @param executionResult The result of an executed build.
33 │  * @param initialFiles A map containing initial file information for the executed build.
34 │  */
```

📄 `angular-cli/packages/angular/build/src/builders/application/i18n.ts` L54–64 （▶ の行: 55–58, 60–62）

```ts
54 │ 
55 ▶   const inlineResult: {
56 ▶     errors: string[];
57 ▶     warnings: string[];
58 ▶     prerenderedRoutes: PrerenderedRoutesRecord;
59 │   } = {
60 ▶     errors: [],
61 ▶     warnings: [],
62 ▶     prerenderedRoutes: {},
63 │   };
64 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/application/i18n.ts` L93–100 （▶ の行: 94–99）

```ts
 93 │ 
 94 ▶     for (const locale of i18nOptions.inlineLocales) {
 95 ▶       const localeInlineResult = inlinedLocales.get(locale);
 96 ▶       assert(localeInlineResult !== undefined, 'Inlined result must exist for locale: ' + locale);
 97 ▶       const localeOutputFiles = localeInlineResult.outputFiles;
 98 ▶       inlineResult.errors.push(...localeInlineResult.errors);
 99 ▶       inlineResult.warnings.push(...localeInlineResult.warnings);
100 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/application/i18n.ts` L143–156 （▶ の行: 145, 147, 149, 153–154）

```ts
143 │ 
144 │     // Update the result with all localized files.
145 ▶     executionResult.outputFiles = [
146 │       // Root and SSR entry files are not modified.
147 ▶       ...unModifiedOutputFiles,
148 │       // Updated files for each locale.
149 ▶       ...updatedOutputFiles,
150 │     ];
151 │ 
152 │     // Assets are only changed if not using the flat output option
153 ▶     if (!i18nOptions.flatOutput) {
154 ▶       executionResult.assetFiles = updatedAssetFiles;
155 │     }
156 │ 
```

19〜25 行目の import が、この関数の使う部品の全部です。`I18nInliner`（ワーカーで置き換える）、20 行目のワーカーの数の上限、21〜22 行目の翻訳の読み込み（5 節）、23 行目の探す関数、24 行目のロケールごとの後処理、25 行目の baseHref の決め方。28〜29 行目のコメントのとおり、この関数は「出力の全部の JS に、出力する全部のロケールを差し込む」入口です。

1. **55〜63 行目：返すもの**

   文字の配列の errors と warnings、プリレンダーしたルートの表の 3 つ。ロケールごとには分けない。
2. **94〜99 行目：ロケールの順に受け取る**

   92 行目（cli-i18n の章）の `inlineAll` が返した表から、ロケールの結果を 1 つずつ取る。96 行目、無ければ assert で止める。98〜99 行目、ワーカーの警告とエラーを**そのまま**足す。
3. **145〜150 行目：出力を作り直す**

   サーバーの入口など書き換えないファイル（cli-i18n の章の 69〜71 行目）の後ろに、全ロケールの出力（`<subPath>/` を付けたもの）を並べる。
4. **153〜155 行目：アセット**

   flat でなければ、ロケールごとに複製したアセットの表に差し替える。`public/robots.txt` がロケールの数だけ並ぶ（デモ）。

98〜99 行目でロケールの名前を付けないので、同じ翻訳が 2 つのロケールで欠けていると、全く同じ文の警告が 2 行並びます。デモの「localize: true」は、`"Add"` の警告が fr の分と ja の分で 2 行あり、どちらがどのロケールかは文からは分かりません。ワーカーの結果を受ける側（esb-i18n-inliner の章で引いた `i18n-inliner.ts` の 449〜455 行目）も `message.message` をそのまま入れるので、ファイルの名前も付きません。

## 5. 翻訳を読む前に：localize の版を覚える

📄 `angular-cli/packages/angular/build/src/builders/application/i18n.ts` L187–205 （▶ の行: 193, 197, 199–203）

```ts
187 │ 
188 │ /**
189 │  * Loads all active translations using the translation loaders from the `@angular/localize` package.
190 │  * @param context The architect builder context for the current build.
191 │  * @param i18n The normalized i18n options to use.
192 │  */
193 ▶ export async function loadActiveTranslations(
194 │   context: BuilderContext,
195 │   i18n: NormalizedApplicationBuildOptions['i18nOptions'],
196 │ ) {
197 ▶   if (!i18n.localizeVersion) {
198 │     try {
199 ▶       const projectResolve = createProjectResolver(context.workspaceRoot);
200 ▶       const manifestPath = projectResolve('@angular/localize/package.json');
201 ▶       const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as { version?: string };
202 ▶       i18n.localizeVersion = manifest.version;
203 ▶     } catch {}
204 │   }
205 │ 
```

197〜204 行目、まだ知らなければ、ワークスペースの根から `@angular/localize/package.json` を探して版を覚えます。この版は I18nInliner のディスクのキャッシュの鍵に入り（esb-i18n-inliner の章の 4 節）、localize を上げたら前の置き換えの結果を使わないようにします。203 行目、見つからなくても黙って進みます（そのときは鍵に版が入らない）。この先の翻訳ファイルの読み込み（206〜235 行目）は cli-i18n の章の 2 節です。

## 6. デモ：ロケールを足して ng build

> **🧪 DEMO — 22.2.7 の ng build（localize）の記録**
>
> 前の回と同じアプリに、fr（XLIFF 1.2。`"Add"` だけ無い）と ja（JSON。`"Add"` と `statusLine` が無い、`baseHref: "/nihongo/"`）の翻訳を置きました。行ごとに angular.json の i18n か build のオプションを 1 つ変えています。「翻訳された文」は、そのロケールの main.js に入っていた文です（元の言語の文は、翻訳の無いメッセージの分）。
>
> `ng build --localize`：終了コード （1204 ms）
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bld-i18n-inline)

## 7. 翻訳ファイルが読めないとき

形式の見分けは拡張子でなく中身で、5 つの読み手に順に聞きます（cli-i18n の章の 2 節の `load-translations.ts`）。デモの 2 つの壊れた入力の結果です。

| de の翻訳ファイル | ng build の結果 |
| --- | --- |
| `messages.de.txt`（ただの文） | 終了コード 127。「An unhandled exception occurred: Unsupported translation file format in &lt;app&gt;/src/locale/messages.de.txt. The following parsers were tried:」の後に、5 つの読み手ごとの理由（「File does not have .json extension.」「The XML file does not contain a &lt;xliff&gt; root node.」「Must have xtb or xmb extension.」） |
| `messages.broken.xlf`（`<target>` を閉じずに終わる） | 終了コード 127。「An unhandled exception occurred: Cannot read properties of null (reading 'start')」だけで、ファイルの名前も無い |

2 つ目は、XLIFF 1.2 の読み手が「読める」と答えた後の `parse` の中で落ちています。エラーのログのスタックは `getInnerRange` → `serializeTranslationMessage` → `XliffTranslationVisitor.visitTransUnitElement` で、angular（8576f161ae4）の `packages/localize/tools/src/translate/translation_files/translation_parsers/translation_utils.ts` の 61 行目 `element.endSourceSpan!.start` です。閉じていない要素は `endSourceSpan` が null なので、`!` で null を通した先で落ちます。`load-translations.ts` の側は `parse` を `try` で包まないので、どのファイルかが出ないまま architect まで上がります。gh で angular/angular を「getInnerRange」「unclosed target xliff」で探しましたが、当たる issue は見つかりませんでした。

## 8. 辞書を読む側の残り

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-translation-reader.ts` L12–46 （▶ の行: 15, 19–20, 22, 28–29, 32, 34, 36, 40）

```ts
12 │ /**
13 │  * Sentinel value used to cache non-existent message key lookups in lazyCache.
14 │  */
15 ▶ const NOT_FOUND = Symbol('NOT_FOUND');
16 │ 
17 │ /**
18 │  * Compares a target key's UTF-8 byte array against a byte sequence in the string pool.
19 ▶  * Lexicographical byte comparison of UTF-8 sequences matches UTF-16 code-unit string comparison
20 ▶  * used when encoding the sorted index table.
21 │  */
22 ▶ function compareBytes(
23 │   target: Uint8Array,
24 │   pool: Uint8Array,
25 │   poolOffset: number,
26 │   keyLen: number,
27 │ ): number {
28 ▶   if (poolOffset < 0 || poolOffset + keyLen > pool.length) {
29 ▶     return 1;
30 │   }
31 │ 
32 ▶   const minLen = Math.min(target.length, keyLen);
33 │   for (let i = 0; i < minLen; i++) {
34 ▶     const diff = target[i] - pool[poolOffset + i];
35 │     if (diff !== 0) {
36 ▶       return diff;
37 │     }
38 │   }
39 │ 
40 ▶   return target.length - keyLen;
41 │ }
42 │ 
43 │ /**
44 │  * A zero-copy reader that queries translation messages directly from a SharedArrayBuffer
45 │  * using binary search over a sorted key index.
46 │  */
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-translation-reader.ts` L82–99 （▶ の行: 90–93, 96–98）

```ts
82 │ 
83 │   /**
84 │    * Looks up a translation message by key.
85 │    * Performs a binary search over the index table if not previously cached in the lazy cache.
86 │    *
87 │    * @param targetKey The message key ID to search for.
88 │    * @returns The parsed translation message, or undefined if not found.
89 │    */
90 ▶   get(targetKey: string): T | undefined {
91 ▶     const cached = this.lazyCache.get(targetKey);
92 ▶     if (cached !== undefined) {
93 ▶       return cached === NOT_FOUND ? undefined : cached;
94 │     }
95 │ 
96 ▶     const targetBytes = this.encoder.encode(targetKey);
97 ▶     let low = 0;
98 ▶     let high = this.entryCount - 1;
99 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-translation-reader.ts` L136–153 （▶ の行: 137, 139, 147–149）

```ts
136 │ 
137 ▶     this.lazyCache.set(targetKey, NOT_FOUND);
138 │ 
139 ▶     return undefined;
140 │   }
141 │ }
142 │ 
143 │ /**
144 │  * Creates a JavaScript object Proxy wrapping a SharedTranslationDictionary so it can be passed
145 │  * directly to `@angular/localize` inliner functions as a standard translation Record.
146 │  *
147 ▶  * Traps `get`, `has`, and `getOwnPropertyDescriptor` to fulfill all `@angular/localize` `translate()`
148 ▶  * lookup requirements (`translations[id]`, `translations[legacyId]`, `Object.hasOwn(translations, id)`).
149 ▶  * The `ownKeys` trap is intentionally omitted so keys are not eagerly decoded upfront upon reflection.
150 │  *
151 │  * @param buffer The SharedArrayBuffer containing binary encoded translation catalog.
152 │  * @returns A Proxy object that intercepts property reads and queries the SharedTranslationDictionary.
153 │  */
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-translation-reader.ts` L179–196 （▶ の行: 179, 181–182, 184–187, 192）

```ts
179 ▶       getOwnPropertyDescriptor(target, prop: string | symbol) {
180 │         if (typeof prop === 'string') {
181 ▶           const val = dictionary.get(prop);
182 ▶           if (val !== undefined) {
183 │             return {
184 ▶               enumerable: true,
185 ▶               configurable: true,
186 ▶               writable: false,
187 ▶               value: val,
188 │             };
189 │           }
190 │         }
191 │ 
192 ▶         return Reflect.getOwnPropertyDescriptor(target, prop);
193 │       },
194 │     },
195 │   );
196 │ }
```

ワーカーの中で、翻訳の表は `SharedArrayBuffer` に詰められて届きます（esb-i18n-inliner の章の 3 節）。この章の題の「翻訳の読み込み」は、ファイルを読むことではなく、この詰めたものから 1 件ずつ読むことです。22〜41 行目の `compareBytes` は、探す ID の UTF-8 のバイト列と置き場のバイト列を前から比べます。28〜30 行目、索引の位置が置き場の外を指していれば「大きい」として探索を進め、壊れた索引で範囲の外を読みません。19〜20 行目のコメントと実際の比べ方の違い（UTF-16 の順と UTF-8 の順）は esb-tests-issues の章の表にあります。

90〜95 行目、一度引いた ID は 53 行目（esb-i18n-inliner の章）の表で覚え、137 行目、無かった ID も `NOT_FOUND` の印で覚えます。2 度目からは 2 分探索をしません。147〜149 行目のコメントのとおり、`Proxy` は `get`・`has`・`getOwnPropertyDescriptor` の 3 つだけを持ち、`ownKeys`（全部の鍵の一覧）は持ちません。一覧を取ると全部の鍵を UTF-8 から戻すことになるからです。179〜189 行目、見つかった ID は「書き換えられない・列挙できる」値として見せるので、localize の `translate` が使う `Object.hasOwn(translations, id)` が真になります。

## 呼び出しの連なり

- `executeBuild → loadActiveTranslations(context, i18nOptions)` — builders/application/i18n.ts L193
  - `projectResolve('@angular/localize/package.json') → localizeVersion` — L199〜202
- `（書き換えない）import "angular:locale/data:de-XX" → onResolve` — i18n-locale-plugin.ts L150
  - `resolveLocaleDataPath(tag, absWorkingDir から探す関数)` — L155、L50
- `（書き換える）inlineI18n → inliner.inlineAll` — i18n.ts L35、L92
  - `ワーカー：loadLocaleData(locale) → process.cwd() から探す` — worker L480、i18n-locale-plugin.ts L102、L109
  - `ワーカー：createSharedTranslationProxy → dictionary.get(id) → compareBytes` — reader L154、L90、L22
  - `for (locale of inlineLocales)：errors / warnings を足す → executePostBundleSteps` — i18n.ts L94〜99、L107
  - `executionResult.outputFiles / assetFiles を差し替える` — L145、L153

## テストと直し方

| spec | describe / it と行 | この章のどこ |
| --- | --- | --- |
| builders/application/tests/options/i18n-missing-translation\_spec.ts | describe Option: "i18nMissingTranslation"（13 行目、it 6 件）。既定と warning は警告（31・58 行目）、error は失敗（86 行目）、ignore は何も出ない（114 行目）、全部あれば何も出ない（137・160 行目） | 4 節の 98〜99 行目に集まるもの |
| tools/esbuild/i18n-inliner\_spec.ts | describe I18nInliner（58 行目）。目印をロケールの名前に置き換える（173 行目）など | ワーカーの側（esb-i18n-inliner の章） |
| tools/esbuild/i18n-translation-encoder\_spec.ts | describe SharedArrayBuffer Translation Encoder & Reader（15 行目、it 8 件） | 8 節 |

i18nMissingTranslation の 6 件は、第 1 回の url の 16 件・第 2 回の 11 件と一緒に `:application_integration_tests` を filter 付きで走らせ、計 33 件、0 failures、PASSED でした。`i18n-locale-plugin.ts` には unit の spec がありません。ロケールのデータの差し込みと代えたときの警告は、e2e の `tests/e2e/tests/i18n/ivy-localize-locale-data.ts`（`fr-Abcd` で「Using locale data for 'fr'」を見る）が固めています。作業フォルダを変えたときの道は、どこも見ていません。

直すなら：

- 作業フォルダ（2 節）：`I18nInliner` の設定にワークスペースの根を足し、ワーカーへの頼み（`inlineFileBatch`）に載せて `loadLocaleData(locale, workspaceRoot)` と呼ぶ。41 行目の表の鍵にも起点を入れる。i18n.ts の 48〜53 行目で `options.workspaceRoot` を渡す。spec は i18n-inliner\_spec.ts に、`process.cwd()` を空のフォルダにした（`spyOn(process, 'cwd')`）状態で目印を置き換え、ロケールのデータが入ることを見る it を足す（ワーカーの中の `process.cwd` には spy が効かないので、ワーカーに渡る引数で見る形になる）。
- 警告のロケール（4 節）：98〜99 行目で `` `[${locale}] ${message}` `` のように頭を付ける。i18n-missing-translation\_spec.ts の 31・58 行目の it は文の一部（`No translation found for`）で見ているので、頭を付けても通る。
- 閉じていない XLIFF（7 節）：localize の 61 行目で `endSourceSpan` が無ければ診断のエラーにするか、`load-translations.ts` の `parse` を `try` で包んでファイルの名前を付けて投げ直す。後者なら angular-cli の側だけで直せる。

## 聞かれそうな質問

**Q. 翻訳ファイルの形式は、拡張子で決まりますか？**

中身で決まります（cli-i18n の章の 2 節）。ただし読み手によっては拡張子も見ます。デモの .txt には、JSON の読み手が「.json の拡張子が無い」、XTB の読み手が「xtb か xmb の拡張子が要る」と答えました。中身が XML でも `<xliff>` が根に無ければ XLIFF の読み手は断ります。

**Q. `fr-XX` のように、データの無い地域を書くとどうなりますか？**

書き換えるビルドでは、ワーカーが 1 節の関数で後ろを削って `fr` のデータを入れ、「Using locale data for 'fr'」の警告を出します。出力のフォルダと `lang` は `fr-XX` のままです（デモ）。言語そのものが無い `tlh` は、データ無しで警告になり、`dir` 属性も付きません。

**Q. localize を使わずに元の言語だけ変えると、ロケールのデータはどう入りますか？**

polyfills に `import "angular:locale/data:<sourceLocale>"` が足され、3 節のプラグインがワークスペースの根から `@angular/common/locales/global/<名前>` を解決します。ふつうのモジュールとして束ねられ、出力は `browser/` の直下で `<base href="/">` のままです（デモの `de-XX`）。

**Q. 翻訳が足りないとき、警告がどのロケールのものか分かりますか？**

分かりません。4 節の 98〜99 行目がロケールの名前を付けずに足すので、2 つのロケールで同じメッセージが欠けると、同じ文が 2 行出ます。ロケールを 1 つずつ（`localize: ["fr"]`）ビルドすれば分けられます。

**Q. CI でワークスペースの外から builder を動かしています。気を付けることは？**

書き換えるビルドのロケールのデータは、作業フォルダから探されます（2 節の 109 行目）。作業フォルダから `@angular/common` が見つからないと、警告 1 行だけでデータの無い出力になります。ワークスペースの根を作業フォルダにして動かします。

## 読み終えて

- ロケールの名前は `Intl.Locale` で検め、BCP 47 でなければエラー。データは `@angular/common/locales/global` から、無ければ後ろを削って探す。
- 書き換えないビルドは esbuild のプラグインがワークスペースの根から、書き換えるビルドはワーカーが `process.cwd()` から探す。起点が違う。
- `inlineI18n` はロケールの結果を名前を付けずに 1 つの配列に集め、出力とアセットを `<subPath>/` の下に並べ直す。
- 形式の分からない翻訳ファイルは読み手ごとの理由を並べて止まるが、閉じていない XLIFF は localize の中の TypeError で、ファイルの名前も出ない。
- ワーカーの辞書は 2 分探索の結果を覚え、`Proxy` は `ownKeys` を持たない。

---

← 前: [メッセージを取り出す：extract-i18n の builder](03-bld-extract-i18n.md)  
次: [チャンクを束ね直す：chunk-optimizer と esbuild の小道具](05-bld-chunk-optimizer.md) →
