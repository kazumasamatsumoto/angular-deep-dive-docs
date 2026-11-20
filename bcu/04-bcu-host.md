[目次](../README.md) › [@angular/build の compilation と utils の読み残し](README.md) › 第 4 回 / 全 10 回

# AngularHost・uri・lazy-routes-transformer：ホストの差し替えと遅延ルートの書き換え

> tools/angular/angular-host.ts・uri.ts・transformers/lazy-routes-transformer.ts の未読の行：SourceFile の version、モジュール解決の包みと fileReplacements、リソースの名前の解決と外部のランタイムのスタイルの ID、JIT の名前空間の URI、loadComponent / loadChildren に ɵentryName を足す相手の探し方。

angular/angular-cli · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-host)

---

AOT と JIT のコンパイルは、TypeScript の素のホスト（ファイルを読む・モジュールを解決する係）をそのまま使わず、`createAngularCompilerHost` で何か所も差し替えた物を使います。この章では、差し替えのうちまだ読んでいない行（SourceFile の version、モジュール解決の包み方と fileReplacements、リソースの名前の解決、変わったリソースの知らせ方）と、JIT の名前空間の URI を作る `uri.ts`、遅延ルートに `ɵentryName` を足す `lazy-routes-transformer.ts` の残りを読みます。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/tools/angular/` の `angular-host.ts`・`uri.ts`・`transformers/lazy-routes-transformer.ts` です。SourceFile のキャッシュ（56〜84 行目）は [再ビルドとキャッシュの章](../cli/10-cli-cache-watch.md)、ホストの作り始めと `readResource`（162〜186 行目）は [AotCompilation と並列ワーカーの章](../cli/03-cli-angular-compilation.md)、スタイルの変換（188〜207 行目）は [コンポーネントのスタイルの章](../cli/04-cli-component-styles.md)、URI を作る関数（37〜57 行目）は [TypeScript の変換の章](../oxc/04-oxc-ts-transformers.md)、遅延ルートの変換の後半（119〜192 行目）は [遅延チャンクの章](../cli/07-cli-code-splitting.md)の 2 節で読みました。名前の似た「ホスト」でも、dev-server の Host ヘッダーの検査（[vds-host-headers](../vds/03-vds-host-headers.md)）とリンカーの AST の host（[oxc-linker-host](../oxc/03-oxc-linker-host.md)）は別の物です。

1. [1. AotCompilation の残り](01-bcu-aot.md)
2. [2. ParallelCompilation](02-bcu-parallel.md)
3. [3. hmr-candidates](03-bcu-hmr.md)
4. **4. AngularHost と遅延ルート**（この章）
5. [5. 予算と出力の表](05-bcu-budget.md)
6. [6. index.html の仕上げ](06-bcu-index.md)
7. [7. 自動 CSP](07-bcu-auto-csp.md)
8. [8. オプションの小道具](08-bcu-options.md)
9. [9. パス・URL・ソースマップ](09-bcu-paths.md)
10. [10. spec と issue](10-bcu-tests-issues.md)

## 1. ホストに渡す 5 つの物

📄 `angular-cli/packages/angular/build/src/tools/angular/angular-host.ts` L9–31 （▶ の行: 13, 15–16, 18–22, 29）

```ts
 9 │ import type * as ng from '@angular/compiler-cli';
10 │ import assert from 'node:assert';
11 │ import nodePath from 'node:path';
12 │ import type ts from 'typescript';
13 ▶ import { calculateHash } from '../../utils/hash';
14 │ 
15 ▶ export type AngularCompilerOptions = ng.CompilerOptions;
16 ▶ export type AngularCompilerHost = ng.CompilerHost;
17 │ 
18 ▶ export interface AngularHostOptions {
19 ▶   fileReplacements?: Record<string, string>;
20 ▶   modifiedFiles?: Set<string>;
21 ▶   externalStylesheets?: Map<string, string>;
22 ▶   transformStylesheet(
23 │     data: string,
24 │     containingFile: string,
25 │     stylesheetFile?: string,
26 │     order?: number,
27 │     className?: string,
28 │   ): Promise<string | null>;
29 ▶   processWebWorker(workerFile: string, containingFile: string): string;
30 │ }
31 │ 
```

18〜30 行目の `AngularHostOptions` は、compiler-plugin の onStart が回ごとに作って `initialize` に渡す物です（[前回](02-bcu-parallel.md)のとおり、並列のときはワーカーの中で偽物が作られる）。19 行目の `fileReplacements` は 3 節、20 行目の `modifiedFiles` は 5 節、21 行目の `externalStylesheets` は 4 節、22〜28 行目の `transformStylesheet` はスタイルの章、29 行目の `processWebWorker` は Web Worker の束ねです。15〜16 行目の 2 つの型は、@angular/compiler-cli の options とホストの別名です。13 行目の `calculateHash` は 2 節と 4 節で使います。

## 2. SourceFile に version を付ける

📄 `angular-cli/packages/angular/build/src/tools/angular/angular-host.ts` L32–55 （▶ の行: 34–35, 38–39, 41–42, 46–48, 52）

```ts
32 │ /**
33 │  * Patches in-place the `getSourceFiles` function on an instance of a TypeScript
34 ▶  * `Program` to ensure that all returned SourceFile instances have a `version`
35 ▶  * field. The `version` field is required when used with a TypeScript BuilderProgram.
36 │  * @param program The TypeScript Program instance to patch.
37 │  */
38 ▶ export function ensureSourceFileVersions(program: ts.Program): void {
39 ▶   const baseGetSourceFiles = program.getSourceFiles;
40 │   // TODO: Update Angular compiler to add versions to all internal files and remove this
41 ▶   program.getSourceFiles = function (...parameters) {
42 ▶     const files: readonly (ts.SourceFile & { version?: string })[] = baseGetSourceFiles(
43 │       ...parameters,
44 │     );
45 │ 
46 ▶     for (const file of files) {
47 ▶       if (file.version === undefined) {
48 ▶         file.version = calculateHash(file.text);
49 │       }
50 │     }
51 │ 
52 ▶     return files;
53 │   };
54 │ }
55 │ 
```

TypeScript の BuilderProgram（差分コンパイルの入れ物）は、SourceFile の `version` を比べて「前回から変わったか」を決めます（34〜35 行目）。ところが @angular/compiler-cli の `NgtscProgram` が作る TypeScript のプログラムには、`version` の無い SourceFile が入ります（40 行目の TODO）。38〜54 行目は、そのプログラムの `getSourceFiles` をその場で包み、41〜53 行目で、呼ばれるたびに `version` が無い物に中身のハッシュ（48 行目）を付けます。[1 回目](01-bcu-aot.md)の AOT は、`NgtscProgram` を作った直後（aot-compilation.ts の 139 行目、[application builder の章](../boot/04-boot-application-build.md)の引用）にこれを呼び、すぐ後の BuilderProgram の作成に渡します。

デモでは、`ts.createProgram` で作ったプログラムの 65 個の SourceFile のうち、`version` の無い物は 65 個（全部）でした。包んだあとの `getSourceFiles` で、ワークスペースのファイルに 16 桁の 16 進のハッシュが付きました。ハッシュは xxhash（cda8830710）なので、[1 回目](01-bcu-aot.md)の 10 節のとおり `initializeHash()` の後でなければ assert で落ちます。

## 3. モジュール解決を包む：fileReplacements

📄 `angular-cli/packages/angular/build/src/tools/angular/angular-host.ts` L85–110 （▶ の行: 86, 89–91, 95–97, 99, 101, 104–105）

```ts
 85 │ 
 86 ▶ function augmentResolveModuleNames(
 87 │   typescript: typeof ts,
 88 │   host: ts.CompilerHost,
 89 ▶   resolvedModuleModifier: (
 90 ▶     resolvedModule: ts.ResolvedModule | undefined,
 91 ▶     moduleName: string,
 92 │   ) => ts.ResolvedModule | undefined,
 93 │   moduleResolutionCache?: ts.ModuleResolutionCache,
 94 │ ): void {
 95 ▶   if (host.resolveModuleNames) {
 96 ▶     const baseResolveModuleNames = host.resolveModuleNames;
 97 ▶     host.resolveModuleNames = function (moduleNames: string[], ...parameters) {
 98 │       return moduleNames.map((name) => {
 99 ▶         const result = baseResolveModuleNames.call(host, [name], ...parameters);
100 │ 
101 ▶         return resolvedModuleModifier(result[0], name);
102 │       });
103 │     };
104 ▶   } else {
105 ▶     host.resolveModuleNames = function (
106 │       moduleNames: string[],
107 │       containingFile: string,
108 │       _reusedNames: string[] | undefined,
109 │       redirectedReference: ts.ResolvedProjectReference | undefined,
110 │       options: ts.CompilerOptions,
```

📄 `angular-cli/packages/angular/build/src/tools/angular/angular-host.ts` L111–131 （▶ の行: 112–113, 118, 120, 122, 128–129）

```ts
111 │     ) {
112 ▶       return moduleNames.map((name) => {
113 ▶         const result = typescript.resolveModuleName(
114 │           name,
115 │           containingFile,
116 │           options,
117 │           host,
118 ▶           moduleResolutionCache,
119 │           redirectedReference,
120 ▶         ).resolvedModule;
121 │ 
122 ▶         return resolvedModuleModifier(result, name);
123 │       });
124 │     };
125 │   }
126 │ }
127 │ 
128 ▶ function normalizePath(path: string): string {
129 ▶   return nodePath.win32.normalize(path).replace(/\\/g, nodePath.posix.sep);
130 │ }
131 │ 
```

1. **もとの解決があれば 1 つずつ包む**

   95〜103 行目。`resolveModuleNames` はまとめて名前を受け取るので、99 行目で 1 つずつ呼び直し、101 行目で結果を差し替え役（89〜92 行目の `resolvedModuleModifier`）に通します。
2. **無ければ作る**

   104〜125 行目。`createIncrementalCompilerHost` のホストは `resolveModuleNames` を持たないので、ふつうはこちらです。113〜120 行目で TypeScript の `resolveModuleName` を、5 節の解決のキャッシュ（118 行目）つきで呼びます。
3. **パスの形を揃える**

   128〜130 行目。Windows の区切りでも POSIX の `/` に揃え、3 つめの段の表のキーと比べられるようにします。

📄 `angular-cli/packages/angular/build/src/tools/angular/angular-host.ts` L132–161 （▶ の行: 138–139, 142–144, 147–149, 151–152, 155, 159）

```ts
132 │ function augmentHostWithReplacements(
133 │   typescript: typeof ts,
134 │   host: ts.CompilerHost,
135 │   replacements: Record<string, string>,
136 │   moduleResolutionCache?: ts.ModuleResolutionCache,
137 │ ): void {
138 ▶   if (Object.keys(replacements).length === 0) {
139 ▶     return;
140 │   }
141 │ 
142 ▶   const normalizedReplacements: Record<string, string> = {};
143 ▶   for (const [key, value] of Object.entries(replacements)) {
144 ▶     normalizedReplacements[normalizePath(key)] = normalizePath(value);
145 │   }
146 │ 
147 ▶   const tryReplace = (resolvedModule: ts.ResolvedModule | undefined) => {
148 ▶     const replacement = resolvedModule && normalizedReplacements[resolvedModule.resolvedFileName];
149 ▶     if (replacement) {
150 │       return {
151 ▶         resolvedFileName: replacement,
152 ▶         isExternalLibraryImport: /[/\\]node_modules[/\\]/.test(replacement),
153 │       };
154 │     } else {
155 ▶       return resolvedModule;
156 │     }
157 │   };
158 │ 
159 ▶   augmentResolveModuleNames(typescript, host, tryReplace, moduleResolutionCache);
160 │ }
161 │ 
```

138〜140 行目、置き換えが空なら何もしません（解決を包まないので、置き換えの無いビルドは素の TypeScript の解決のまま）。142〜145 行目で両側を 128 行目の形にし、147〜157 行目の `tryReplace` は「解決できたファイルが表にあれば、置き換え先のファイル名を返す」だけです。152 行目、置き換え先が `node_modules` の中なら外のライブラリとして扱います。つまり置き換えは「import の文字列」ではなく「解決できたファイル」で決まるので、`./environments/environment` も `../environments/environment` も、同じファイルなら同じく置き換わります。デモで `real.ts → fake.ts` を渡すと、`resolveModuleNames(['./real', '@angular/core'])` は fake.ts と、置き換えの無い core の .d.ts（`isExternalLibraryImport=true`）を返しました。

## 4. リソースの名前をファイルにする

📄 `angular-cli/packages/angular/build/src/tools/angular/angular-host.ts` L208–236 （▶ の行: 209–212, 217–218, 223–224, 228–231, 234）

```ts
208 │ 
209 ▶   host.resourceNameToFileName = function (resourceName, containingFile) {
210 ▶     const resolvedPath = nodePath.join(nodePath.dirname(containingFile), resourceName);
211 ▶     if (!this.fileExists(resolvedPath)) {
212 ▶       return null;
213 │     }
214 │ 
215 │     // Reject TypeScript files used as component resources (e.g., styleUrl pointing to a .ts file).
216 │     // Processing a TypeScript file as a stylesheet or template causes confusing downstream errors.
217 ▶     if (hasTypeScriptExtension(resolvedPath)) {
218 ▶       return null;
219 │     }
220 │ 
221 │     // All resource names that have template file extensions are assumed to be templates
222 │     // TODO: Update compiler to provide the resource type to avoid extension matching here.
223 ▶     if (!hostOptions.externalStylesheets || hasTemplateExtension(resolvedPath)) {
224 ▶       return resolvedPath;
225 │     }
226 │ 
227 │     // For external stylesheets, create a unique identifier and store the mapping
228 ▶     let externalId = hostOptions.externalStylesheets.get(resolvedPath);
229 ▶     if (externalId === undefined) {
230 ▶       externalId = calculateHash(resolvedPath);
231 ▶       hostOptions.externalStylesheets.set(resolvedPath, externalId);
232 │     }
233 │ 
234 ▶     return externalId + '.css';
235 │   };
236 │ 
```

1. **含むファイルの場所からつなぐ**

   210 行目。`templateUrl: './a.html'` は、コンポーネントの .ts のフォルダからの相対です。211〜213 行目、無いファイルは `null`（コンパイラが「見つからない」のエラーにする）。
2. **.ts は断る**

   217〜219 行目。`styleUrl: './x.ts'` のような書き間違いを、スタイルとして処理して分かりにくいエラーになる前に止めます（e2f95fc19a、2026-03）。
3. **ふつうはファイルの場所**

   223〜225 行目。外部のランタイムのスタイルでないか、テンプレートの拡張子（264 行目の `.htm`・`.html`・`.svg`）なら、ファイルの場所をそのまま返します。
4. **外部のランタイムのスタイルは ID にする**

   228〜234 行目。dev-server の HMR でスタイルを別に配るとき、コンパイラには本物の場所ではなく「ハッシュ + `.css`」を渡し、21 行目の Map に「場所 → ID」を覚えます。同じファイルは 228 行目で同じ ID になります。

デモの「外部のランタイムのスタイル」では、`./a.css` は 2 回とも `ea5d061e2c048f99.css` になり、`./b.html` と `./icon.svg` はファイルの場所のまま、`./real.ts` と無いファイルは `null` でした。この ID の付いたスタイルは、コンパイラが `transformResource` に回してはいけない物で、188〜191 行目（スタイルの章の引用）の assert がそれを確かめます。デモで回すと、その assert が `External runtime stylesheets should not be transformed` で投げました。

📄 `angular-cli/packages/angular/build/src/tools/angular/angular-host.ts` L237–262 （▶ の行: 238–239, 243–247, 249, 252–253, 257–258, 261）

```ts
237 │   // Allow the AOT compiler to request the set of changed templates and styles
238 ▶   host.getModifiedResourceFiles = function () {
239 ▶     return hostOptions.modifiedFiles;
240 │   };
241 │ 
242 │   // Provide a resolution cache to ensure package.json lookups are cached
243 ▶   const resolutionCache = typescript.createModuleResolutionCache(
244 ▶     host.getCurrentDirectory(),
245 ▶     host.getCanonicalFileName.bind(host),
246 ▶     compilerOptions,
247 ▶     packageJsonCache,
248 │   );
249 ▶   host.getModuleResolutionCache = () => resolutionCache;
250 │ 
251 │   // Augment TypeScript Host for file replacements option
252 ▶   if (hostOptions.fileReplacements) {
253 ▶     augmentHostWithReplacements(typescript, host, hostOptions.fileReplacements, resolutionCache);
254 │   }
255 │ 
256 │   // Augment TypeScript Host with source file caching if provided
257 ▶   if (sourceFileCache) {
258 ▶     augmentHostWithCaching(host, sourceFileCache);
259 │   }
260 │ 
261 ▶   return host;
262 │ }
```

238〜240 行目の `getModifiedResourceFiles` は、AOT のコンパイラが「前回から変わったテンプレートとスタイル」を聞く口で、1 節の `modifiedFiles` をそのまま返します。コンパイラはこれで、そのリソースを使うコンポーネントだけを解析し直します。243〜249 行目の解決のキャッシュは、4 つめの引数に前回の package.json のキャッシュ（[1 回目](01-bcu-aot.md)の 4 節の 128 行目。JIT は `undefined`）を受け取り、3 節の 118 行目と、6 節の遅延ルートの変換（47 行目）がこのキャッシュを使います。252〜259 行目は、置き換えとキャッシュを、渡されたときだけ足します。

📄 `angular-cli/packages/angular/build/src/tools/angular/angular-host.ts` L263–273 （▶ の行: 264–265, 268, 272）

```ts
263 │ 
264 ▶ const TEMPLATE_EXTENSIONS: ReadonlySet<string> = new Set(['.htm', '.html', '.svg']);
265 ▶ const TYPESCRIPT_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.tsx', '.mts', '.cts']);
266 │ 
267 │ function hasTemplateExtension(file: string): boolean {
268 ▶   return TEMPLATE_EXTENSIONS.has(nodePath.extname(file).toLowerCase());
269 │ }
270 │ 
271 │ function hasTypeScriptExtension(file: string): boolean {
272 ▶   return TYPESCRIPT_EXTENSIONS.has(nodePath.extname(file).toLowerCase());
273 │ }
```

268 行目と 272 行目は、`extname` を小文字にしてから比べるので、`A.HTML` もテンプレートです。

> [!NOTE]
> **ポイント**
>
> 22.2.7 のホストは 2 か所が 44129f66a3 と違います（35702a5986、main の 5691298d03）。`readResource` がテンプレートの拡張子でなければ読まずに `''` を返し（ワーカーで .css を読んでメインに送り、捨てる無駄をやめた）、そのために 194 行目の「空なら変換しない」はインラインのスタイルだけになりました。デモでも `readResource('a.css')` は `""`、中身が空白だけの `styleUrl` のファイルは `transformStylesheet` まで行き、インラインの空のスタイルは `{"content":""}` で止まりました。

## 5. uri.ts：JIT の名前空間

📄 `angular-cli/packages/angular/build/src/tools/angular/uri.ts` L9–36 （▶ の行: 12, 19, 26, 33–34）

```ts
 9 │ /**
10 │  * A string value representing the base namespace for Angular JIT mode related imports.
11 │  */
12 ▶ const JIT_BASE_NAMESPACE = 'angular:jit';
13 │ 
14 │ /**
15 │  * A string value representing the namespace for Angular JIT mode related imports for
16 │  * Component styles. This namespace is used for both inline (`styles`) and external
17 │  * (`styleUrls`) styles.
18 │  */
19 ▶ export const JIT_STYLE_NAMESPACE = `${JIT_BASE_NAMESPACE}:style` as const;
20 │ 
21 │ /**
22 │  * A string value representing the namespace for Angular JIT mode related imports for
23 │  * Component templates. This namespace is currently only used for external (`templateUrl`)
24 │  * templates.
25 │  */
26 ▶ export const JIT_TEMPLATE_NAMESPACE = `${JIT_BASE_NAMESPACE}:template` as const;
27 │ 
28 │ /**
29 │  * A regular expression that can be used to match a Angular JIT mode namespace URI.
30 │  * It contains capture groups for the type (template/style), origin (file/inline), and specifier.
31 │  * The {@link parseJitUri} function can be used to parse and return an object representation of a JIT URI.
32 │  */
33 ▶ export const JIT_NAMESPACE_REGEXP = new RegExp(
34 ▶   `^${JIT_BASE_NAMESPACE}:(template|style):(file|inline);(.*)$`,
35 │ );
36 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/angular/uri.ts` L58–79 （▶ の行: 67–70, 73–77）

```ts
58 │ 
59 │ /**
60 │  * Parses a string containing a JIT namespace URI.
61 │  * JIT namespace URIs are used to encode the information for an Angular component's stylesheets
62 │  * and templates when compiled in JIT mode.
63 │  * @param uri The URI to parse into its underlying components.
64 │  * @returns An object containing the namespace, type, origin, and specifier of the URI;
65 │  * `undefined` if not a JIT namespace URI.
66 │  */
67 ▶ export function parseJitUri(uri: string) {
68 ▶   const matches = JIT_NAMESPACE_REGEXP.exec(uri);
69 ▶   if (!matches) {
70 ▶     return undefined;
71 │   }
72 │ 
73 ▶   return {
74 ▶     namespace: `${JIT_BASE_NAMESPACE}:${matches[1]}`,
75 ▶     type: matches[1] as 'style' | 'template',
76 ▶     origin: matches[2] as 'file' | 'inline',
77 ▶     specifier: matches[3],
78 │   };
79 │ }
```

JIT では、`styleUrl` や `templateUrl` を `import` に書き換え、esbuild の名前空間の onLoad で読ませます（[compiler-plugin の残りの章](../esb/06-esb-compiler-rest.md)の 6 節）。その import の文字列の形を決めるのがこのファイルです。12 行目の `angular:jit` の下に、19 行目のスタイルと 26 行目のテンプレートの名前空間を作り、33〜35 行目の正規表現で「種類（template / style）・出どころ（file / inline）・`;` の後ろ全部」を取り出します。68〜71 行目、当たらなければ `undefined`。74 行目の `namespace` は esbuild の onLoad の `namespace` にそのまま使える形です。

| 呼び出し（22.2.7 の dist） | 結果 |
| --- | --- |
| `generateJitFileUri('./app.css', 'style')` | `angular:jit:style:file;./app.css` |
| `generateJitFileUri('./app.html', 'template')` | `angular:jit:template:file;./app.html` |
| `generateJitInlineUri('h1 { color: red; }', 'style')` | `angular:jit:style:inline;aDEgeyBjb2xvcjogcmVkOyB9` |
| `generateJitInlineUri('a;b', 'style')` | `angular:jit:style:inline;YTti` |
| `parseJitUri('angular:jit:style:file;./app.css')` | { "namespace": "angular:jit:style", "type": "style", "origin": "file", "specifier": "./app.css" } |
| `parseJitUri('angular:jit:style:inline;aDEgeyBjb2xvcjogcmVkOyB9')` | { "namespace": "angular:jit:style", "type": "style", "origin": "inline", "specifier": "aDEgeyBjb2xvcjogcmVkOyB9" } |
| `parseJitUri('angular:jit:style:file;./x;y.css')` | { "namespace": "angular:jit:style", "type": "style", "origin": "file", "specifier": "./x;y.css" } |
| `parseJitUri('angular:jit:template:inline;PHA+aGk8L3A+')` | { "namespace": "angular:jit:template", "type": "template", "origin": "inline", "specifier": "PHA+aGk8L3A+" } |
| `parseJitUri('angular:jit:script:file;./a.js')` | null |
| `parseJitUri('angular:jit:style:file')` | null |

34 行目の `(.*)$` は貪欲なので、`./x;y.css` のように `;` を含むファイル名も、最初の `;` の後ろ全部が specifier になります。インラインの中身は base64 なので `;` が入りません（`'a;b'` は `YTti`）。`script` のような知らない種類と、`;` の無い物は `null`（関数の戻り値は `undefined`）でした。

## 6. lazy-routes-transformer：ɵentryName を足す相手を探す

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/lazy-routes-transformer.ts` L9–42 （▶ の行: 10, 14–15, 27, 37–38）

````ts
 9 │ import assert from 'node:assert';
10 ▶ import { relative } from 'node:path/posix';
11 │ import ts from 'typescript';
12 │ 
13 │ /**
14 ▶  * A transformer factory that adds a property to the lazy-loaded route object.
15 ▶  * This property is used to allow for the retrieval of the module path during SSR.
16 │  *
17 │  * @param compilerOptions The compiler options.
18 │  * @param compilerHost The compiler host.
19 │  * @returns A transformer factory.
20 │  *
21 │  * @example
22 │  * **Before:**
23 │  * ```ts
24 │  * const routes: Routes = [
25 │  *   {
26 │  *     path: 'lazy',
27 ▶  *     loadChildren: () => import('./lazy/lazy.module').then(m => m.LazyModule)
28 │  *   }
29 │  * ];
30 │  * ```
31 │  *
32 │  * **After:**
33 │  * ```ts
34 │  * const routes: Routes = [
35 │  *   {
36 │  *     path: 'lazy',
37 ▶  *     loadChildren: () => import('./lazy/lazy.module').then(m => m.LazyModule),
38 ▶  *     ...(typeof ngServerMode !== "undefined" && ngServerMode ? { ɵentryName: "./lazy/lazy.module.ts" }: {})
39 │  *   }
40 │  * ];
41 │  * ```
42 │  */
````

14〜15 行目のとおり、SSR のときにルートからモジュールの場所を引けるようにする印です。何に使うかは [遅延チャンクの章](../cli/07-cli-code-splitting.md)の 2 節で読みました。10 行目、相対パスは `node:path/posix` で作るので、Windows でも `/` です。

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/lazy-routes-transformer.ts` L43–71 （▶ の行: 47–49, 52, 58, 60, 63, 65–67, 69）

```ts
43 │ export function lazyRoutesTransformer(
44 │   compilerOptions: ts.CompilerOptions,
45 │   compilerHost: ts.CompilerHost,
46 │ ): ts.TransformerFactory<ts.SourceFile> {
47 ▶   const moduleResolutionCache = compilerHost.getModuleResolutionCache?.();
48 ▶   assert(
49 ▶     typeof compilerOptions.basePath === 'string',
50 │     'compilerOptions.basePath should be a string.',
51 │   );
52 ▶   const basePath = compilerOptions.basePath;
53 │ 
54 │   return (context: ts.TransformationContext) => {
55 │     const factory = context.factory;
56 │ 
57 │     const visitor = (node: ts.Node): ts.Node => {
58 ▶       if (!ts.isObjectLiteralExpression(node)) {
59 │         // Not an object literal, so skip it.
60 ▶         return ts.visitEachChild(node, visitor, context);
61 │       }
62 │ 
63 ▶       const loadFunction = getLoadComponentOrChildrenProperty(node)?.initializer;
64 │       // Check if the initializer is an arrow function or a function expression
65 ▶       if (
66 ▶         !loadFunction ||
67 ▶         (!ts.isArrowFunction(loadFunction) && !ts.isFunctionExpression(loadFunction))
68 │       ) {
69 ▶         return ts.visitEachChild(node, visitor, context);
70 │       }
71 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/lazy-routes-transformer.ts` L194–225 （▶ の行: 205, 207–208, 212–216, 219–220, 224）

```ts
194 │ }
195 │ 
196 │ /**
197 │  * Retrieves the property assignment for the `loadComponent` or `loadChildren` property of a route object.
198 │  *
199 │  * @param node The object literal expression to search.
200 │  * @returns The property assignment if found, otherwise `undefined`.
201 │  */
202 │ function getLoadComponentOrChildrenProperty(
203 │   node: ts.ObjectLiteralExpression,
204 │ ): ts.PropertyAssignment | undefined {
205 ▶   let hasPathProperty = false;
206 │   let loadComponentOrChildrenProperty: ts.PropertyAssignment | undefined;
207 ▶   for (const prop of node.properties) {
208 ▶     if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) {
209 │       continue;
210 │     }
211 │ 
212 ▶     const propertyNameText = prop.name.text;
213 ▶     if (propertyNameText === 'path') {
214 ▶       hasPathProperty = true;
215 ▶     } else if (propertyNameText === 'loadComponent' || propertyNameText === 'loadChildren') {
216 ▶       loadComponentOrChildrenProperty = prop;
217 │     }
218 │ 
219 ▶     if (hasPathProperty && loadComponentOrChildrenProperty) {
220 ▶       break;
221 │     }
222 │   }
223 │ 
224 ▶   return loadComponentOrChildrenProperty;
225 │ }
```

1. **basePath が要る**

   48〜52 行目。`compilerOptions.basePath` が文字列でなければ assert で落ちます。`readConfiguration` は tsconfig のフォルダを入れるので、ふつうは通ります。デモで `basePath` を外して呼ぶと「AssertionError: compilerOptions.basePath should be a string.」でした。
2. **オブジェクトのリテラルだけを見る**

   58〜61 行目。それ以外のノードは中へ降りるだけです。
3. **loadComponent か loadChildren のプロパティ**

   202〜225 行目。キーが識別子の「名前: 値」だけを見ます（208 行目）。だから `'loadComponent': …` のように文字列のキーで書くと対象外です（デモの「キーが文字列」）。
4. **path は要らない**

   205 行目の `hasPathProperty` は、219〜221 行目でループを早く終えるためだけに使われ、戻り値には効きません。`path` の無いオブジェクトでも変換されます（デモの「path が無い」）。
5. **値はアロー関数か function 式**

   65〜70 行目。

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/lazy-routes-transformer.ts` L72–103 （▶ の行: 74, 76, 78, 80, 83–86, 88, 90, 92, 94, 96–98, 100–101）

```ts
 72 │       let callExpression: ts.CallExpression | undefined;
 73 │ 
 74 ▶       if (ts.isArrowFunction(loadFunction)) {
 75 │         // Handle arrow functions: body can either be a block or a direct call expression
 76 ▶         const body = loadFunction.body;
 77 │ 
 78 ▶         if (ts.isBlock(body)) {
 79 │           // Arrow function with a block: check the first statement for a return call expression
 80 ▶           const firstStatement = body.statements[0];
 81 │ 
 82 │           if (
 83 ▶             firstStatement &&
 84 ▶             ts.isReturnStatement(firstStatement) &&
 85 ▶             firstStatement.expression &&
 86 ▶             ts.isCallExpression(firstStatement.expression)
 87 │           ) {
 88 ▶             callExpression = firstStatement.expression;
 89 │           }
 90 ▶         } else if (ts.isCallExpression(body)) {
 91 │           // Arrow function with a direct call expression as its body
 92 ▶           callExpression = body;
 93 │         }
 94 ▶       } else if (ts.isFunctionExpression(loadFunction)) {
 95 │         // Handle function expressions: check for a return statement with a call expression
 96 ▶         const returnExpression = loadFunction.body.statements.find(
 97 ▶           ts.isReturnStatement,
 98 ▶         )?.expression;
 99 │ 
100 ▶         if (returnExpression && ts.isCallExpression(returnExpression)) {
101 ▶           callExpression = returnExpression;
102 │         }
103 │       }
```

📄 `angular-cli/packages/angular/build/src/tools/angular/transformers/lazy-routes-transformer.ts` L104–118 （▶ の行: 105–106, 110–114, 116）

```ts
104 │ 
105 ▶       if (!callExpression) {
106 ▶         return ts.visitEachChild(node, visitor, context);
107 │       }
108 │ 
109 │       // Optionally check for the 'then' property access expression
110 ▶       const expression = callExpression.expression;
111 ▶       if (
112 ▶         !ts.isCallExpression(expression) &&
113 ▶         ts.isPropertyAccessExpression(expression) &&
114 ▶         expression.name.text !== 'then'
115 │       ) {
116 ▶         return ts.visitEachChild(node, visitor, context);
117 │       }
118 │ 
```

1. **アロー関数の本体**

   76〜93 行目。式なら 90〜92 行目でその呼び出し、ブロックなら 80〜89 行目で**最初の文**が `return 呼び出し` のときだけです。
2. **function 式の本体**

   94〜103 行目。96〜98 行目の `find` で、**最初に見つかった**`return` を探します。最初の文でなくてもよい、という点がアロー関数と違います。
3. **then なら 1 つ手前へ、ほかのメソッドなら対象外**

   110〜117 行目。呼び出しの先が `.then` 以外のプロパティなら返します。だから `import(…).then(…).catch(…)` は、外側が `.catch` なので対象外です。

> [!WARNING]
> **ハマりどころ**
>
> 同じ `loadComponent` でも、書き方で印が付くかが変わります。デモで、`() => { console.log('lazy'); return import('./lazy/home'); }`（アロー関数のブロックの 2 文目が return）は変わらず、同じ中身の `function () { … }` には `ɵentryName` が付きました。`.then(…).catch(…)` も変わりません。どれも、SSR の `modulepreload` の対応づけ（[遅延チャンクの章](../cli/07-cli-code-splitting.md)）からそのルートが抜けるだけで、アプリは動きます。

## 7. デモ：本物の変換に 13 通りのルートを当てる

> **🧪 DEMO — @angular/build 22.2.7 の lazyRoutesTransformer（記録）**
>
> 各行は、`<app>/src/app/routes.ts` の `export const routes = [ … ]` の 1 つめの要素です。ホストは `ts.createCompilerHost`、解決は `moduleResolution: bundler`・`preserveSymlinks` で、`ts.transform` に本物の変換だけを渡しました。`basePath` の 2 つは、44129f66a3 の compiler-plugin が渡す tsconfig の場所（ここでは `<app>/src` に置いた想定）と、22.2.7 の compiler-plugin が上書きするワークスペースの根（80c7480b4d、main の 1b893ed95b）です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-host)

`basePath` が tsconfig の場所だと `app/lazy/home.ts`、ワークスペースの根だと `src/app/lazy/home.ts` になります。SSR の modulepreload の対応表（`entryPointToBrowserMapping`）のキーはワークスペースの根からの相対なので、tsconfig がワークスペースの根に無いプロジェクトでは 44129f66a3 の形だと引けません。1b893ed95b がそれを直した物です。パッケージの specifier（`import('@angular/router')`）は、型の宣言 `node_modules/@angular/router/types/router.d.ts` に解決され、その .d.ts の相対パスが `ɵentryName` になりました。テンプレート文字列でも、式を含まなければ 133 行目（遅延チャンクの章の引用）の `isStringLiteralLike` に当たるので付きます。

## 8. デモ：createAngularCompilerHost の差し替え

> **🧪 DEMO — @angular/build 22.2.7 の createAngularCompilerHost（記録）**
>
> 含むファイルは `src/app/app.ts`、`fileReplacements` は `real.ts → fake.ts`、`modifiedFiles` は `src/app/a.css` です。`transformStylesheet` は受け取った物の頭に `/* 変換済み */` を付けて返します。
>
> transformStylesheet が受け取った物：`{ "data": "", "containing": "src/app/app.ts", "file": "src/app/a.css", "order": null, "className": null }``{ "data": "a { color: red; }", "containing": "src/app/app.ts", "file": "src/app/a.css", "order": 0, "className": "App" }``{ "data": "b { color: blue; }", "containing": "src/app/app.ts", "file": null, "order": 1, "className": "App" }`
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-host)

## 9. どう録ったか

スクリプトは `<scratchpad>/bcu-demo/a/` に置き、サイトの node\_modules の @angular/build 22.2.7 の `lazy-routes-transformer.js`・`uri.js`・`angular-host.js` を require しました（Node v24.22.1）。作業用のワークスペースの node\_modules はサイトの物への symlink なので、ふつうのプロジェクトと同じパスに見えるよう `preserveSymlinks` にしています。共有の小道具は [1 回目](01-bcu-aot.md)と同じです。

📄 `記録のスクリプト（rec-host.mjs）`

```
// 本物の lazyRoutesTransformer・uri.ts の関数・createAngularCompilerHost（22.2.7 の dist）に小さな入力を当てて記録する。
// 使い方: node rec-host.mjs <出力 JSON>
import { writeFileSync } from 'node:fs';
import { r, ts, makeWorkspace, abs, rel, hide, writeFile, version, cleanup } from './harness.mjs';

const out = process.argv[2];
await r('utils/hash.js').initializeHash();
const { lazyRoutesTransformer } = r('tools/angular/transformers/lazy-routes-transformer.js');
const uri = r('tools/angular/uri.js');
const { createAngularCompilerHost, ensureSourceFileVersions } = r('tools/angular/angular-host.js');

makeWorkspace('host', {
  'src/app/lazy/home.ts': 'export class Home {}\n',
  'src/app/lazy/admin.routes.ts': 'export default [];\n',
  'src/app/a.css': 'a { color: red; }\n',
  'src/app/b.html': '<p>b</p>\n',
  'src/app/icon.svg': '<svg></svg>\n',
  'src/app/real.ts': 'export const v = 1;\n',
  'src/app/fake.ts': 'export const v = 2;\n',
  'src/app/use.ts': "import { v } from './real';\nexport const used = v;\n",
});

// ---- lazyRoutesTransformer ----
const cases = [
  ['arrow-then', 'アロー関数 + then', "{ path: 'home', loadComponent: () => import('./lazy/home').then((m) => m.Home) }"],
  ['arrow-plain', 'アロー関数（then なし）', "{ path: 'home', loadComponent: () => import('./lazy/home') }"],
  ['children', 'loadChildren', "{ path: 'admin', loadChildren: () => import('./lazy/admin.routes') }"],
  ['block-return', 'ブロックの先頭が return', "{ path: 'home', loadComponent: () => { return import('./lazy/home').then((m) => m.Home); } }"],
  ['block-second', 'ブロックの 2 文目が return', "{ path: 'home', loadComponent: () => { console.log('lazy'); return import('./lazy/home'); } }"],
  ['function-second', 'function 式の 2 文目が return', "{ path: 'home', loadComponent: function () { console.log('lazy'); return import('./lazy/home'); } }"],
  ['catch', 'then のあとに catch', "{ path: 'home', loadComponent: () => import('./lazy/home').then((m) => m.Home).catch(() => null) }"],
  ['no-path', 'path が無い', "{ loadComponent: () => import('./lazy/home').then((m) => m.Home) }"],
  ['template', 'テンプレート文字列（式なし）', '{ path: \'home\', loadComponent: () => import(`./lazy/home`) }'],
  ['dynamic', '変数の specifier', "{ path: 'home', loadComponent: () => import(name) }"],
  ['missing', '解決できない specifier', "{ path: 'x', loadComponent: () => import('./lazy/missing') }"],
  ['package', 'パッケージの specifier', "{ path: 'pkg', loadChildren: () => import('@angular/router') }"],
  ['quoted', 'キーが文字列（\'loadComponent\'）', "{ path: 'home', 'loadComponent': () => import('./lazy/home') }"],
];
const program = ts.createProgram([abs('src/app/lazy/home.ts')], { module: ts.ModuleKind.Preserve, target: ts.ScriptTarget.ES2022 });
// 作業用の node_modules は symlink なので、ふつうのプロジェクトと同じ見え方にするため preserveSymlinks にする
const compilerOptions = { module: ts.ModuleKind.Preserve, target: ts.ScriptTarget.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler, preserveSymlinks: true };
const host = ts.createCompilerHost(compilerOptions);
const printer = ts.createPrinter();
const lazy = [];
// 念のため、作業フォルダの外へ長く出る相対パスがあれば途中を省く（preserveSymlinks にしたので今は出ない）
const hideUp = (t) => t.replace(/((?:\.\.\/){4,})[^"]*?node_modules\//g, (_m, dots) => `<../ が ${dots.length / 3} 個>/…/node_modules/`);
for (const [basePathLabel, basePath] of [['tsconfig の場所（44129f66a3）', abs('src')], ['ワークスペースの根（22.2.7 の compiler-plugin）', abs('')]]) {
  for (const [id, label, obj] of cases) {
    const text = `const name = './lazy/home';\nexport const routes = [\n  ${obj},\n];\n`;
    const sf = ts.createSourceFile(abs('src/app/routes.ts'), text, ts.ScriptTarget.ES2022, true);
    const res = ts.transform(sf, [lazyRoutesTransformer({ ...compilerOptions, basePath }, host)], compilerOptions);
    const after = printer.printFile(res.transformed[0]);
    lazy.push({ id, label, base: basePathLabel, before: obj, after: hideUp(after.split('\n').slice(2, -2).join('\n').trim()), changed: res.transformed[0] !== sf, entryName: hideUp(after.match(/ɵentryName: "([^"]+)"/)?.[1] ?? '') || null });
  }
}
// basePath が無いとき
let noBase;
try {
  lazyRoutesTransformer(compilerOptions, host);
  noBase = '（投げない）';
} catch (e) {
  noBase = `${e.name}: ${e.message}`;
}

// ---- uri.ts ----
const uris = [
  ['generateJitFileUri', "generateJitFileUri('./app.css', 'style')", uri.generateJitFileUri('./app.css', 'style')],
  ['generateJitFileUri', "generateJitFileUri('./app.html', 'template')", uri.generateJitFileUri('./app.html', 'template')],
  ['generateJitInlineUri', "generateJitInlineUri('h1 { color: red; }', 'style')", uri.generateJitInlineUri('h1 { color: red; }', 'style')],
  ['generateJitInlineUri', "generateJitInlineUri('a;b', 'style')", uri.generateJitInlineUri('a;b', 'style')],
];
const parsed = [
  uris[0][2],
  uris[2][2],
  'angular:jit:style:file;./x;y.css',
  'angular:jit:template:inline;PHA+aGk8L3A+',
  'angular:jit:script:file;./a.js',
  'angular:jit:style:file',
].map((u) => ({ input: u, output: uri.parseJitUri(u) ?? null }));
const constants = { JIT_STYLE_NAMESPACE: uri.JIT_STYLE_NAMESPACE, JIT_TEMPLATE_NAMESPACE: uri.JIT_TEMPLATE_NAMESPACE, JIT_NAMESPACE_REGEXP: String(uri.JIT_NAMESPACE_REGEXP) };

// ---- createAngularCompilerHost ----
const calls = [];
const hostOptions = (external) => ({
  externalStylesheets: external ? new Map() : undefined,
  modifiedFiles: new Set([abs('src/app/a.css')]),
  fileReplacements: { [abs('src/app/real.ts')]: abs('src/app/fake.ts') },
  transformStylesheet: async (data, containing, file, order, className) => {
    calls.push({ data: data.trim(), containing: rel(containing), file: file ? rel(file) : null, order: order ?? null, className: className ?? null });
    return `/* 変換済み */ ${data.trim()}`;
  },
  processWebWorker: (w) => w,
});
const ngHost = [];
for (const external of [false, true]) {
  const ho = hostOptions(external);
  const h = createAngularCompilerHost(ts, { ...compilerOptions }, ho, undefined, new Map());
  const containing = abs('src/app/app.ts');
  for (const name of ['./a.css', './b.html', './icon.svg', './real.ts', './none.css', './a.css']) {
    ngHost.push({ external, call: `resourceNameToFileName('${name}')`, result: hide(h.resourceNameToFileName(name, containing) ?? 'null') });
  }
  ngHost.push({ external, call: 'getModifiedResourceFiles()', result: [...h.getModifiedResourceFiles()].map(rel).join(', ') });
  if (!external) {
    for (const [label, data, ctx] of [
      ['template', '<p>x</p>', { type: 'template', containingFile: containing, resourceFile: abs('src/app/b.html') }],
      ['空の style（ファイル）', '   \n', { type: 'style', containingFile: containing, resourceFile: abs('src/app/a.css') }],
      ['空の style（インライン）', '   \n', { type: 'style', containingFile: containing, resourceFile: null }],
      ['style（ファイル）', 'a { color: red; }', { type: 'style', containingFile: containing, resourceFile: abs('src/app/a.css'), order: 0, className: 'App' }],
      ['style（インライン）', 'b { color: blue; }', { type: 'style', containingFile: containing, resourceFile: null, order: 1, className: 'App' }],
    ]) {
      const res = await h.transformResource(data, ctx);
      ngHost.push({ external, call: `transformResource(${label})`, result: res === null ? 'null' : JSON.stringify(res) });
    }
    ngHost.push({ external, call: "readResource('b.html')", result: JSON.stringify(await h.readResource(abs('src/app/b.html'))) });
    ngHost.push({ external, call: "readResource('a.css')", result: JSON.stringify(await h.readResource(abs('src/app/a.css'))) });
    ngHost.push({ external, call: "readResource('none.html')", result: JSON.stringify(await h.readResource(abs('src/app/none.html'))) });
    // fileReplacements: use.ts の './real' が fake.ts に解決されるか
    const resolved = h.resolveModuleNames(['./real', '@angular/core'], containing, undefined, undefined, compilerOptions);
    ngHost.push({ external, call: "resolveModuleNames(['./real', '@angular/core'])", result: resolved.map((m) => (m ? `${hide(m.resolvedFileName)}（isExternalLibraryImport=${m.isExternalLibraryImport}）` : 'undefined')).join(' / ') });
    // SourceFile のキャッシュ
    const a1 = h.getSourceFile(abs('src/app/use.ts'), ts.ScriptTarget.ES2022);
    const a2 = h.getSourceFile(abs('src/app/use.ts'), ts.ScriptTarget.ES2022);
    const a3 = h.getSourceFile(abs('src/app/use.ts'), ts.ScriptTarget.ES2022, undefined, true);
    ngHost.push({ external, call: 'getSourceFile を 2 回（3 回目は shouldCreateNewSourceFile）', result: `1 回目と 2 回目は同じ物 = ${a1 === a2}、3 回目は同じ物 = ${a1 === a3}` });
  } else {
    ngHost.push({ external, call: 'externalStylesheets の中身', result: [...ho.externalStylesheets].map(([k, v]) => `${rel(k)} → ${v}`).join(', ') });
    try {
      await h.transformResource('a { color: red; }', { type: 'style', containingFile: abs('src/app/app.ts'), resourceFile: abs('src/app/a.css') });
      ngHost.push({ external, call: 'transformResource(外部のランタイムのスタイル)', result: '（投げない）' });
    } catch (e) {
      ngHost.push({ external, call: 'transformResource(外部のランタイムのスタイル)', result: `${e.name}: ${hide(e.message)}` });
    }
  }
}
// ensureSourceFileVersions
const p2 = ts.createProgram([abs('src/app/use.ts')], compilerOptions);
const before = p2.getSourceFiles().filter((f) => f.version === undefined).length;
ensureSourceFileVersions(p2);
const versions = p2.getSourceFiles().filter((f) => !f.fileName.includes('node_modules')).map((f) => ({ file: rel(f.fileName), version: f.version }));
const ensure = { withoutVersionBefore: before, total: p2.getSourceFiles().length, versions };

const rec = { version, node: process.version, lazy, noBase, uris: uris.map(([fn, call, value]) => ({ fn, call, value })), parsed, constants, ngHost, styleCalls: calls, ensure };
writeFileSync(out, JSON.stringify(rec, null, 1));
cleanup();
console.log(JSON.stringify(rec, null, 1));

```

## ここまでの呼び出し

- `createAngularCompilerHost(ts, compilerOptions, hostOptions, packageJsonCache, sourceFiles)` — angular-host.ts 162
  - `resourceNameToFileName`・`getModifiedResourceFiles` — 209・238
  - `createModuleResolutionCache(…, packageJsonCache)` — 243
  - `augmentHostWithReplacements` → `augmentResolveModuleNames` — 253 → 132 → 86 — *置き換えがあるときだけ*
- `ensureSourceFileVersions(angularTypeScriptProgram)` — aot-compilation.ts 139 → 38
- `lazyRoutesTransformer(compilerOptions, compilerHost)` — aot-compilation.ts 363 → 43 — *browserOnlyBuild でないとき*
  - `visitor` → `getLoadComponentOrChildrenProperty` — 57 → 202
  - `ts.resolveModuleName(…, moduleResolutionCache)` → `relative(basePath, …)` — 138 → 151
- `parseJitUri(path)` — uri.ts 67 — *JIT の onResolve と onLoad*

## テストと直し方

| spec | describe / it と行 | この章のどこ |
| --- | --- | --- |
| tools/angular/transformers/lazy-routes-transformer\_spec.ts | describe lazyRoutesTransformer（12 行目、it 9 件）：空のオブジェクト（54 行目）、アロー関数（65 行目）、ブロックの return（83 行目）、then なし（103 行目）、return と then（121 行目）、function 式（141 行目）、関係ないオブジェクト（159 行目）、import でない（175 行目）、basePath からの相対（191 行目） | 6・7 節 |
| （無い） | angular-host.ts と uri.ts の単体の spec（44129f66a3）。22.2.7 の 35702a5986 は `angular-host_spec.ts` を足した | 1〜5 節 |

[1 回目](01-bcu-aot.md)のテストの節と同じ bazel の 1 回（41 specs、0 failures）の中で、describe lazyRoutesTransformer の 9 件が通りました。spec の 9 件は、デモの 13 通りのうち「ブロックの 2 文目が return」「then のあとに catch」「path が無い」「キーが文字列」「パッケージの specifier」を固めていません。

直すとしたら、ファイルと関数は次のとおりです。

- アロー関数のブロック：`lazy-routes-transformer.ts` の 78〜89 行目を、function 式の 96〜98 行目と同じ `find(ts.isReturnStatement)` にする形です。固める it は spec の 83 行目の隣に、`console.log` の後ろに return を置いたブロックを足します。
- パッケージの specifier：138〜149 行目の解決の結果が `.d.ts` か `isExternalLibraryImport` なら返す形です。

## 聞かれそうな質問

**Q. fileReplacements は import の文字列を書き換えるのですか？**

書き換えません。モジュール解決の結果を差し替えます。147〜157 行目の `tryReplace` は、解決できたファイル名（148 行目の `resolvedFileName`）が表にあれば置き換え先を返すので、どんな書き方の import でも同じファイルなら置き換わります。置き換えが空なら 138〜140 行目で解決を包みもしません。

**Q. テンプレートの .html を変えたことを、AOT のコンパイラはどう知りますか？**

238〜240 行目の `getModifiedResourceFiles` が、compiler-plugin の渡した `modifiedFiles` を返します。コンパイラはそのリソースを使うコンポーネントだけを解析し直します。CLI の側では [1 回目](01-bcu-aot.md)の 5 節の 217〜224 行目が、そのファイルのテンプレートの診断を捨てます。

**Q. dev-server で styleUrl の .css が「ハッシュ.css」になるのはどこですか？**

228〜234 行目です。外部のランタイムのスタイルのときだけ、`resourceNameToFileName` がファイルの場所の代わりに `calculateHash(場所) + '.css'` を返し、21 行目の Map に覚えます。テンプレート（223 行目）はこの扱いになりません。

**Q. loadComponent を書いたのに ɵentryName が付かないのはどんなときですか？**

デモの 13 通りでは、アロー関数のブロックで return が最初の文でないとき（80〜89 行目）、`.then` の後ろにさらにメソッドがあるとき（110〜117 行目）、import の引数が変数のとき、解決できないとき、キーを文字列で書いたとき（208 行目）でした。path の有無は関係ありません。

## 読み終えて

- ensureSourceFileVersions は NgtscProgram のプログラムの getSourceFiles を包み、version の無い SourceFile に中身のハッシュを付けて BuilderProgram の差分を効かせる。
- fileReplacements は解決できたファイル名で置き換える。モジュール解決の包みは、置き換えがあるときだけ足される。
- resourceNameToFileName は、.ts を断り、テンプレートはファイルの場所、外部のランタイムのスタイルは「ハッシュ.css」の ID にする。getModifiedResourceFiles は modifiedFiles をそのままコンパイラに渡す。
- uri.ts は angular:jit:(template|style):(file|inline); の形を作り、最初の ; の後ろ全部を specifier として取り出す。
- lazy-routes-transformer は、識別子のキーの loadComponent / loadChildren で、本体の形がアロー関数と function 式で違う規則に当たるときだけ ɵentryName を足す。path は要らない。

---

← 前: [hmr-candidates と typescript-printer：差し替えてよいコンポーネントを見分ける](03-bcu-hmr.md)  
次: [予算と出力の表：bundle-calculator と stats-table の残り](05-bcu-budget.md) →
