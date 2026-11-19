[目次](../README.md) › [application builder の読み残し：options の正規化・結果の形・BundlerContext・キャッシュ・小さなプラグインを行で埋める](README.md) › 第 5 回 / 全 6 回

# 小さなプラグインと検査：外部パッケージ・仮想モジュール・wasm・CommonJS・ライセンス

> tools/esbuild の external-packages・virtual-module・rxjs-esm-resolution・loader-import-attribute・wasm・sourcemap-ignorelist・server-bundle-metadata・localize-init-warning の各プラグインが何を拾い何を返すかと、global-scripts・commonjs-checker・license-extractor。本物の esbuild に 1 つずつ差して録る。

angular/angular-cli · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/abl-plugins)

---

application builder の esbuild には、Angular のコンパイラのプラグインのほかに、数十行の小さなプラグインがいくつも差さっています。この章では、そのそれぞれが **どの import やファイルを onResolve / onLoad / onEnd で拾い、何を返すか**を 1 節ずつ読みます。後半は、束ねたあとの esbuild の metafile（入力と出力の対応表）を読む 2 つの検査、CommonJS の警告と 3rdpartylicenses.txt の作り方です。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/tools/esbuild/` の `external-packages-plugin.ts`・`virtual-module-plugin.ts`・`rxjs-esm-resolution-plugin.ts`・`loader-import-attribute-plugin.ts`・`wasm-plugin.ts`・`sourcemap-ignorelist-plugin.ts`・`server-bundle-metadata-plugin.ts`・`angular-localize-init-warning-plugin.ts`・`global-scripts.ts`・`commonjs-checker.ts`・`license-extractor.ts` と、プラグインを並べる `application-code-bundle.ts` の数行です。この 11 個のファイルは、サイトの依存の 22.2.7 でも 44129f66a3 と 1 行も違いません（git diff で確かめました）。esbuild のプラグインの仕組み（onResolve と onLoad の受け渡し）は [application builder の章](../boot/04-boot-application-build.md)、2 つの検査を呼ぶ行（execute-build.ts）は [ng build の段取り](../cli/02-build.md)で読みました。

1. [1. normalizeOptions](01-abl-options.md)
2. [2. ビルドの結果の形](02-abl-results.md)
3. [3. BundlerContext と後処理の残り](03-abl-context-post.md)
4. [4. ディスクに残るキャッシュ](04-abl-cache.md)
5. **5. 小さなプラグインと検査**（この章）
6. [6. spec と issue](06-abl-tests-issues.md)

## 0. どこに差さっているか

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L595–607 （▶ の行: 603–605）

```ts
595 │   // Append custom conditions if present
596 │   if (customConditions) {
597 │     conditions.push(...customConditions);
598 │   } else {
599 │     // Include default conditions
600 │     conditions.push('module', optimizationOptions.scripts ? 'production' : 'development');
601 │   }
602 │ 
603 ▶   const plugins: Plugin[] = [
604 ▶     createLoaderImportAttributePlugin(),
605 ▶     createSourcemapIgnorelistPlugin(),
606 │   ];
607 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/application-code-bundle.ts` L294–310 （▶ の行: 296–297, 307–308）

```ts
294 │     buildOptions.plugins ??= [];
295 │     buildOptions.plugins.push(
296 ▶       createWasmPlugin({ allowAsync: zoneless, cache: loadResultCache }),
297 ▶       createAngularLocalizeInitWarningPlugin(),
298 │       createCompilerPlugin(
299 │         // JS/TS options
300 │         pluginOptions,
301 │         angularCompilationContext,
302 │         // Component stylesheet bundler
303 │         stylesheetBundler,
304 │       ),
305 │     );
306 │ 
307 ▶     if (!externalPackages) {
308 ▶       buildOptions.plugins.push(createRxjsEsmResolutionPlugin());
309 │     }
310 │ 
```

603〜605 行目は、ブラウザとサーバーのアプリ本体の束に共通の設定を作る関数の中です。どの束でも、最初の 2 つは import 属性の loader と、ソースマップの無視リストです。このすぐあとで外部パッケージのプラグインを条件つきで足す所は [dev-server の設定](../vds/01-vds-config.md)の章で読みました。296〜297 行目はサーバーの main の束で、wasm と localize の警告を足し、307〜308 行目で `externalPackages` でないときだけ rxjs のプラグインを足します。ブラウザの束でも、296〜297 行目と同じ 2 つを足しています（[application builder の章](../boot/04-boot-application-build.md)で読んだ行）。

| プラグイン | フック | 拾うもの（filter） | 返すもの |
| --- | --- | --- | --- |
| angular-external-packages | onResolve | `/^[^./]/`（パッケージ名の import） | `{ external: true }` か、解決の結果そのまま |
| （名前空間から作る） | onResolve・onLoad | `^angular:polyfills` などの名前空間 | 生成したコード |
| angular-rxjs-resolution | onResolve | `/^rxjs/` | パスの `dist/cjs` を `dist/esm` に変えた結果 |
| angular-loader-import-attributes | onLoad | `/./`（すべて）のうち `with { loader }` つき | ファイルの中身と loader |
| angular-wasm | onResolve・onLoad × 2 | `/\.wasm$/` | 初期化のコード、wasm の中身 |
| angular-sourcemap-ignorelist | onEnd | 出力の `.map` | x\_google\_ignoreList を足した .map |
| angular-server-bundle-metadata | onEnd | metafile | metafile に 2 つの印 |
| angular-localize-init-warning | onResolve | `/^@angular\/localize\/init/` | 解決の結果 + 警告 |

## 1. external-packages-plugin：node\_modules を束ねない

📄 `angular-cli/packages/angular/build/src/tools/esbuild/external-packages-plugin.ts` L12–50 （▶ の行: 15–17, 22, 26–29, 35–36, 39–40, 43–44, 46, 49）

```ts
12 │ const EXTERNAL_PACKAGE_RESOLUTION = Symbol('EXTERNAL_PACKAGE_RESOLUTION');
13 │ 
14 │ /**
15 ▶  * Creates a plugin that marks any resolved path as external if it is within a node modules directory.
16 ▶  * This is used instead of the esbuild `packages` option to avoid marking files that should be loaded
17 ▶  * via customized loaders. This is necessary to prevent Vite development server pre-bundling errors.
18 │  *
19 │  * @returns An esbuild plugin.
20 │  */
21 │ export function createExternalPackagesPlugin(options?: { exclude?: string[] }): Plugin {
22 ▶   const exclusions = new Set<string>(options?.exclude);
23 │   // Similar to esbuild, --external:@foo/bar automatically implies --external:@foo/bar/*,
24 │   // which matches import paths like @foo/bar/baz.
25 │   // This means all paths within the @foo/bar package are also marked as external.
26 ▶   const exclusionsPrefixes = options?.exclude?.map((exclusion) => exclusion + '/') ?? [];
27 ▶   const seenExclusions: Set<string> = new Set();
28 ▶   const seenExternals = new Set<string>();
29 ▶   const seenNonExclusions: Set<string> = new Set();
30 │ 
31 │   return {
32 │     name: 'angular-external-packages',
33 │     setup(build) {
34 │       // Find all loader keys that are not using the 'file' loader.
35 ▶       // The 'file' loader is automatically handled by Vite and does not need exclusion.
36 ▶       const loaderOptionKeys =
37 │         build.initialOptions.loader &&
38 │         Object.entries(build.initialOptions.loader)
39 ▶           .filter(([, value]) => value !== 'file')
40 ▶           .map(([key]) => key);
41 │ 
42 │       // Safe to use native packages external option if no loader options or exclusions present
43 ▶       if (!exclusions.size && !loaderOptionKeys?.length) {
44 ▶         build.initialOptions.packages = 'external';
45 │ 
46 ▶         return;
47 │       }
48 │ 
49 ▶       const loaderFileExtensions = new Set(loaderOptionKeys);
50 │ 
```

ng serve は、node\_modules の中身を Vite の事前バンドル（依存をまとめて先に束ねておく仕組み）に任せ、アプリの束には入れません。esbuild には `packages: 'external'`（パッケージ名の import を全部外に出す）という設定がありますが、15〜17 行目のコメントのとおり、それだと angular.json の `loader` で読み方を変えたファイル（node\_modules の .svg を text で読む、など）まで外に出てしまいます。

だから 36〜40 行目で `loader` のうち `file` 以外の拡張子を集め、43〜46 行目で「それも exclude も無い」なら esbuild の `packages = 'external'` を立てて終わります。プラグイン自身は何もしません。`file` を除くのは、35 行目のコメントのとおり Vite が `file` の loader を自分で扱うからです（bc47fa1585）。どちらかがあれば 49 行目からの onResolve を登録します。26 行目、exclude の名前には `/` を足した接頭辞も作ります。`@foo/bar` を外すと `@foo/bar/baz` も外れる、esbuild の external と同じ規則です（f0dd60be1e）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/external-packages-plugin.ts` L51–87 （▶ の行: 52–54, 57–58, 61–62, 65, 67–68, 74, 78, 80）

```ts
51 │       // Only attempt resolve of non-relative and non-absolute paths
52 ▶       build.onResolve({ filter: /^[^./]/ }, async (args) => {
53 ▶         if (args.pluginData?.[EXTERNAL_PACKAGE_RESOLUTION]) {
54 ▶           return null;
55 │         }
56 │ 
57 ▶         if (seenExternals.has(args.path)) {
58 ▶           return { external: true };
59 │         }
60 │ 
61 ▶         if (exclusions.has(args.path) || seenExclusions.has(args.path)) {
62 ▶           return null;
63 │         }
64 │ 
65 ▶         if (!seenNonExclusions.has(args.path)) {
66 │           for (const exclusion of exclusionsPrefixes) {
67 ▶             if (args.path.startsWith(exclusion)) {
68 ▶               seenExclusions.add(args.path);
69 │ 
70 │               return null;
71 │             }
72 │           }
73 │ 
74 ▶           seenNonExclusions.add(args.path);
75 │         }
76 │ 
77 │         const { importer, kind, resolveDir, namespace, pluginData = {} } = args;
78 ▶         pluginData[EXTERNAL_PACKAGE_RESOLUTION] = true;
79 │ 
80 ▶         const result = await build.resolve(args.path, {
81 │           importer,
82 │           kind,
83 │           namespace,
84 │           pluginData,
85 │           resolveDir,
86 │         });
87 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/external-packages-plugin.ts` L88–117 （▶ の行: 89–90, 94–96, 101–102, 106–108, 113）

```ts
 88 │         // Return result if unable to resolve
 89 ▶         if (!result.path) {
 90 ▶           return result;
 91 │         }
 92 │ 
 93 │         // Return if explicitly marked external (externalDependencies option)
 94 ▶         if (result.external) {
 95 ▶           seenExternals.add(args.path);
 96 ▶ 
 97 │           return { external: true };
 98 │         }
 99 │ 
100 │         // Allow customized loaders to run against configured paths regardless of location
101 ▶         if (loaderFileExtensions.has(extname(result.path))) {
102 ▶           return result;
103 │         }
104 │ 
105 │         // Mark paths from a node modules directory as external
106 ▶         if (/[\\/]node_modules[\\/]/.test(result.path)) {
107 ▶           seenExternals.add(args.path);
108 ▶ 
109 │           return { external: true };
110 │         }
111 │ 
112 │         // Otherwise return original result
113 ▶         return result;
114 │       });
115 │     },
116 │   };
117 │ }
```

1. **パッケージ名の import だけ拾う**

   52 行目の filter は「. でも / でも始まらない」。相対・絶対パスは素通しです。53〜54 行目、自分が 80 行目で呼んだ解決からの再入は null で抜けます。
2. **前に外にしたものは、すぐ外に**

   57〜58 行目。鍵は import の文字列（`args.path`）だけで、どのファイルからの import かは見ません。
3. **exclude に当たれば null**

   61〜62 行目、65〜68 行目。null は「このプラグインは何もしない」で、esbuild のふつうの解決に進み、束に入ります。74 行目、当たらなかった名前は覚えて、次から接頭辞の比較を省きます。
4. **自分で解決してみる**

   78 行目で再入の印を付け、80 行目の `build.resolve` で esbuild に本当の場所を聞きます。
5. **結果で決める**

   89〜90 行目、解決できなければその結果（エラー）を返します。94〜96 行目、`externalDependencies` で外にしたものは外。101〜102 行目、loader の拡張子なら束に入れて loader を効かせます。106〜108 行目、パスに node\_modules が入っていれば外。それ以外（tsconfig の paths で自分のソースを指すもの）は 113 行目で結果のまま。

この道に入ると、パッケージ名ごとに 1 回 `build.resolve` が走ります。デモの「loader: { '.txt': 'text' }」では、3 つのパッケージ名の import に 3 回でした。開いている issue #27116 は、`"loader": { ".svg": "text" }` を足すだけで再ビルドが 0.8 秒から 6 秒になる、と報告していて、この 43 行目の分岐がその条件です（6 回目の表にも載せます）。

## 2. virtual-module-plugin：名前空間からコードを作る

📄 `angular-cli/packages/angular/build/src/tools/esbuild/virtual-module-plugin.ts` L16–52 （▶ の行: 18, 21, 24, 27, 33, 36, 51）

```ts
16 │ export interface VirtualModulePluginOptions {
17 │   /** Namespace. Example: `angular:polyfills`. */
18 ▶   namespace: string;
19 │ 
20 │   /** If the generated module should be marked as external. */
21 ▶   external?: boolean;
22 │ 
23 │   /** Method to transform the onResolve path. */
24 ▶   transformPath?: (path: string) => string;
25 │ 
26 │   /** Method to provide the module content. */
27 ▶   loadContent: (
28 │     args: OnLoadArgs,
29 │     build: PluginBuild,
30 │   ) => ReturnType<Parameters<PluginBuild['onLoad']>[1]>;
31 │ 
32 │   /** Restrict to only entry points. Defaults to `true`. */
33 ▶   entryPointOnly?: boolean;
34 │ 
35 │   /** Load results cache. */
36 ▶   cache?: LoadResultCache;
37 │ }
38 │ 
39 │ /**
40 │  * Creates an esbuild plugin that generated virtual modules.
41 │  *
42 │  * @returns An esbuild plugin.
43 │  */
44 │ export function createVirtualModulePlugin(options: VirtualModulePluginOptions): Plugin {
45 │   const {
46 │     namespace,
47 │     external,
48 │     transformPath: pathTransformer,
49 │     loadContent,
50 │     cache,
51 ▶     entryPointOnly = true,
52 │   } = options;
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/virtual-module-plugin.ts` L54–83 （▶ の行: 55, 57–59, 62–64, 68–69, 72, 77–79）

```ts
54 │   return {
55 ▶     name: namespace.replace(/[/:]/g, '-'),
56 │     setup(build): void {
57 ▶       build.onResolve({ filter: new RegExp('^' + namespace) }, ({ kind, path }) => {
58 ▶         if (entryPointOnly && kind !== 'entry-point') {
59 ▶           return null;
60 │         }
61 │ 
62 ▶         return {
63 ▶           path: pathTransformer?.(path) ?? path,
64 ▶           namespace,
65 │         };
66 │       });
67 │ 
68 ▶       if (external) {
69 ▶         build.onResolve({ filter: /./, namespace }, ({ path }) => {
70 │           return {
71 │             path,
72 ▶             external: true,
73 │           };
74 │         });
75 │       }
76 │ 
77 ▶       build.onLoad(
78 ▶         { filter: /./, namespace },
79 ▶         createCachedLoad(cache, (args) => loadContent(args, build)),
80 │       );
81 │     },
82 │   };
83 │ }
```

ディスクに無いモジュール（polyfills をまとめた入口、SSR のマニフェストを差し込む入口、グローバルの scripts など）を作るための部品です。57 行目、`'^' + namespace` の正規表現で import の文字列の頭を見ます。58〜59 行目、既定（51 行目の `entryPointOnly = true`）では入口（entry-point）だけを拾い、ファイルの中の `import 'angular:…'` は拾いません。デモの「ファイルから import（entryPointOnly: true）」は esbuild の「Could not resolve」になりました。62〜64 行目、拾ったら名前空間を付けて返し、77〜79 行目の onLoad が `loadContent` でコードを作ります。79 行目で [前の章](04-abl-cache.md)の `createCachedLoad` に包むので、同じ名前空間とパスの結果は覚えておけます。68〜72 行目、`external: true` なら、その名前空間のモジュールの中の import を全部外に出します（8 節の scripts が使います）。55 行目、プラグインの名前は名前空間の `/` と `:` を `-` にしたものです（`angular:script/global` → `angular-script-global`）。

## 3. rxjs-esm-resolution-plugin：サーバーの束で rxjs を ESM に向ける

📄 `angular-cli/packages/angular/build/src/tools/esbuild/rxjs-esm-resolution-plugin.ts` L11–48 （▶ の行: 14–16, 18, 26–27, 32, 34, 42）

```ts
11 │ const RXJS_ESM_RESOLUTION = Symbol('RXJS_ESM_RESOLUTION');
12 │ 
13 │ /**
14 ▶  * Creates a plugin that forces ESM resolution of rxjs.
15 ▶  * This is needed as when targeting node, the CJS version is used to the current package conditional exports.
16 ▶  * @see: https://github.com/ReactiveX/rxjs/blob/2947583bb33e97f3db9e6d9f6cea70c62a173060/package.json#L19.
17 │  *
18 ▶  * NOTE: This can be removed when and if rxjs adds an import condition that allows ESM usage on Node.js.
19 │  *
20 │  * @returns An esbuild plugin.
21 │  */
22 │ export function createRxjsEsmResolutionPlugin(): Plugin {
23 │   return {
24 │     name: 'angular-rxjs-resolution',
25 │     setup(build) {
26 ▶       build.onResolve({ filter: /^rxjs/ }, async (args) => {
27 ▶         if (args.pluginData?.[RXJS_ESM_RESOLUTION]) {
28 │           return null;
29 │         }
30 │ 
31 │         const { importer, kind, resolveDir, namespace, pluginData = {} } = args;
32 ▶         pluginData[RXJS_ESM_RESOLUTION] = true;
33 │ 
34 ▶         const result = await build.resolve(args.path, {
35 │           importer,
36 │           kind,
37 │           namespace,
38 │           pluginData,
39 │           resolveDir,
40 │         });
41 │ 
42 ▶         result.path = result.path.replace(/([\\/]dist[\\/])cjs([\\/])/, '$1esm$2');
43 │ 
44 │         return result;
45 │       });
46 │     },
47 │   };
48 │ }
```

rxjs 7 の package.json は、Node 向けの条件で CommonJS の `dist/cjs` を指します（15〜16 行目のコメント）。サーバーの束を `platform: 'node'` で作ると CommonJS が入り、木を揺すって使わない所を落とす（tree shaking）ことができません。26 行目で `rxjs` で始まる import を拾い、34 行目でふつうに解決させ、42 行目で結果のパスの `/dist/cjs/` を `/dist/esm/` に書き換えます（区切りは `[\\/]` で Windows も見る、c8909406a5）。デモでは、同じ `of(1)` の入口が、書き換えなしで rxjs の dist/cjs のファイル 223 個・359,634 バイト、書き換えありで dist/esm の 223 個・28,238 バイトになりました。18 行目、rxjs が Node でも ESM を選べる条件を持てば消せる、と書いてあります。

## 4. loader-import-attribute-plugin：with { loader: 'text' }

📄 `angular-cli/packages/angular/build/src/tools/esbuild/loader-import-attribute-plugin.ts` L9–44 （▶ の行: 12, 18–21, 24, 28, 30, 37–39）

```ts
 9 │ import type { Loader, Plugin } from 'esbuild';
10 │ import { readFile } from 'node:fs/promises';
11 │ 
12 ▶ const SUPPORTED_LOADERS: Loader[] = ['base64', 'binary', 'dataurl', 'file', 'text'];
13 │ 
14 │ export function createLoaderImportAttributePlugin(): Plugin {
15 │   return {
16 │     name: 'angular-loader-import-attributes',
17 │     setup(build) {
18 ▶       build.onLoad({ filter: /./ }, async (args) => {
19 ▶         const loader = args.with['loader'] as Loader | undefined;
20 ▶         if (!loader) {
21 ▶           return undefined;
22 │         }
23 │ 
24 ▶         if (!SUPPORTED_LOADERS.includes(loader)) {
25 │           return {
26 │             errors: [
27 │               {
28 ▶                 text: 'Unsupported loader import attribute',
29 │                 notes: [
30 ▶                   { text: 'Attribute value must be one of: ' + SUPPORTED_LOADERS.join(', ') },
31 │                 ],
32 │               },
33 │             ],
34 │           };
35 │         }
36 │ 
37 ▶         return {
38 ▶           contents: await readFile(args.path),
39 ▶           loader,
40 │         };
41 │       });
42 │     },
43 │   };
44 │ }
```

`import note from './note.txt' with { loader: 'text' }` のように、import 属性で読み方を指定できるようにするプラグインです（24aaf1e37f、base64 と dataurl は 8f305ef0ba）。esbuild だけでは、この属性は「Importing with the "loader" attribute is not supported」のエラーです（デモの「プラグインなし」）。18 行目の onLoad はすべてのファイル（`/./`）に登録しますが、19〜21 行目で属性が無ければ `undefined` を返し、次のプラグインに譲ります。0 節の 604 行目でいちばん前に置くのは、属性つきの import をほかの onLoad より先に拾うためです。24〜28 行目、12 行目の 5 つ以外ならエラー。37〜39 行目、ファイルを読んで中身と loader を返し、あとは esbuild の loader が文字列やバイト列にします。

## 5. wasm-plugin：.wasm を ES モジュールとして import する

📄 `angular-cli/packages/angular/build/src/tools/esbuild/wasm-plugin.ts` L21–58 （▶ の行: 22, 29–31, 34, 40, 45, 50, 52, 56）

```ts
21 │ export interface WasmPluginOptions {
22 ▶   /** Allow generation of async (proposal compliant) WASM imports. This requires zoneless to enable async/await. */
23 │   allowAsync?: boolean;
24 │ 
25 │   /** Load results cache. */
26 │   cache?: LoadResultCache;
27 │ }
28 │ 
29 ▶ const WASM_INIT_NAMESPACE = 'angular:wasm:init';
30 ▶ const WASM_CONTENTS_NAMESPACE = 'angular:wasm:contents';
31 ▶ const WASM_RESOLVE_SYMBOL = Symbol('WASM_RESOLVE_SYMBOL');
32 │ 
33 │ // See: https://github.com/tc39/proposal-regexp-unicode-property-escapes/blob/fe6d07fad74cd0192d154966baa1e95e7cda78a1/README.md#other-examples
34 ▶ const ecmaIdentifierNameRegExp = /^(?:[$_\p{ID_Start}])(?:[$_\u200C\u200D\p{ID_Continue}])*$/u;
35 │ 
36 │ /**
37 │  * Creates an esbuild plugin to use WASM files with import statements and expressions.
38 │  * The default behavior follows the WebAssembly/ES mode integration proposal found at
39 │  * https://github.com/WebAssembly/esm-integration/tree/main/proposals/esm-integration.
40 ▶  * This behavior requires top-level await support which is only available in zoneless
41 │  * Angular applications.
42 │  * @returns An esbuild plugin.
43 │  */
44 │ export function createWasmPlugin(options: WasmPluginOptions): Plugin {
45 ▶   const { allowAsync = false, cache } = options;
46 │ 
47 │   return {
48 │     name: 'angular-wasm',
49 │     setup(build): void {
50 ▶       build.onResolve({ filter: /\.wasm$/ }, async (args) => {
51 │         // Skip if already resolving the WASM file to avoid infinite resolution
52 ▶         if (args.pluginData?.[WASM_RESOLVE_SYMBOL]) {
53 │           return;
54 │         }
55 │         // Skip if not an import statement or expression
56 ▶         if (args.kind !== 'import-statement' && args.kind !== 'dynamic-import') {
57 │           return;
58 │         }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/wasm-plugin.ts` L59–96 （▶ の行: 62–66, 71, 76, 78, 81, 83, 86, 91–93）

```ts
59 │ 
60 │         // When in the initialization namespace, the content has already been resolved
61 │         // and only needs to be loaded for use with the initialization code.
62 ▶         if (args.namespace === WASM_INIT_NAMESPACE) {
63 ▶           return {
64 ▶             namespace: WASM_CONTENTS_NAMESPACE,
65 ▶             path: join(args.resolveDir, args.path),
66 ▶             pluginData: args.pluginData,
67 │           };
68 │         }
69 │ 
70 │         // Skip if a custom loader is defined
71 ▶         if (build.initialOptions.loader?.['.wasm'] || args.with['loader']) {
72 │           return;
73 │         }
74 │ 
75 │         // Attempt full resolution of the WASM file
76 ▶         const resolveOptions: ResolveOptions & { path?: string } = {
77 │           ...args,
78 ▶           pluginData: { [WASM_RESOLVE_SYMBOL]: true },
79 │         };
80 │         // The "path" property will cause an error if used in the resolve call
81 ▶         delete resolveOptions.path;
82 │ 
83 ▶         const result = await build.resolve(args.path, resolveOptions);
84 │ 
85 │         // Skip if there are errors, is external, or another plugin resolves to a custom namespace
86 ▶         if (result.errors.length > 0 || result.external || result.namespace !== 'file') {
87 │           // Reuse already resolved result
88 │           return result;
89 │         }
90 │ 
91 ▶         return {
92 ▶           ...result,
93 ▶           namespace: WASM_INIT_NAMESPACE,
94 │         };
95 │       });
96 │ 
```

`import { add } from './add.wasm'` を、WebAssembly と ES モジュールの統合の提案（esm-integration）どおりに動かします（2cb1fb350b）。初期化に top-level await（モジュールの一番外側の await）が要るので、22 行目の `allowAsync` は zoneless のときだけ真です（40 行目のコメント。Zone.js は async/await をそのまま通せないため）。

名前空間を 2 つ使います（29〜30 行目）。56 行目、`import` 文と `import()` 以外は相手にしません。71 行目、`loader` で .wasm の読み方を決めていれば手を引きます。83 行目でふつうに解決し、91〜93 行目で `angular:wasm:init` の名前空間に入れます。初期化のコードの中の `import wasmData from "add.wasm"` は 62〜66 行目に来て、`angular:wasm:contents` に送られます。65 行目のパスは `args.resolveDir`（初期化のコードの `resolveDir`）と、66 行目の `pluginData` は初期化のコードの `pluginData` をそのまま渡します。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/wasm-plugin.ts` L97–136 （▶ の行: 98–99, 101, 105, 116, 118, 121–122, 125–128, 132–133）

```ts
 97 │       build.onLoad(
 98 ▶         { filter: /\.wasm$/, namespace: WASM_INIT_NAMESPACE },
 99 ▶         createCachedLoad(cache, async (args) => {
100 │           // Ensure async mode is supported
101 ▶           if (!allowAsync) {
102 │             return {
103 │               errors: [
104 │                 {
105 ▶                   text: 'WASM/ES module integration imports are not supported with Zone.js applications',
106 │                   notes: [
107 │                     {
108 │                       text: 'Information about zoneless Angular applications can be found here: https://angular.dev/guide/experimental/zoneless',
109 │                     },
110 │                   ],
111 │                 },
112 │               ],
113 │             };
114 │           }
115 │ 
116 ▶           const wasmContents = await readFile(args.path);
117 │           // Inline WASM code less than 10kB
118 ▶           const inlineWasm = wasmContents.byteLength < 10_000;
119 │ 
120 │           // Add import of WASM contents
121 ▶           let initContents = `import ${inlineWasm ? 'wasmData' : 'wasmPath'} from ${JSON.stringify(basename(args.path))}`;
122 ▶           initContents += inlineWasm ? ' with { loader: "binary" };' : ';\n\n';
123 │ 
124 │           // Read from the file system when on Node.js (SSR) and not inline
125 ▶           if (!inlineWasm && build.initialOptions.platform === 'node') {
126 ▶             initContents += 'import { readFile } from "node:fs/promises";\n';
127 ▶             initContents +=
128 ▶               'const wasmData = await readFile(new URL(wasmPath, import.meta.url));\n';
129 │           }
130 │ 
131 │           // Create initialization function
132 ▶           initContents += generateInitHelper(
133 ▶             !inlineWasm && build.initialOptions.platform !== 'node',
134 │             wasmContents,
135 │           );
136 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/wasm-plugin.ts` L137–169 （▶ の行: 140–142, 144, 149, 154–155, 160）

```ts
137 │           // Analyze WASM for imports and exports
138 │           let importModuleNames, exportNames;
139 │           try {
140 ▶             const wasm = await WebAssembly.compile(wasmContents);
141 ▶             importModuleNames = new Set(
142 ▶               WebAssembly.Module.imports(wasm).map((value) => value.module),
143 │             );
144 ▶             exportNames = WebAssembly.Module.exports(wasm).map((value) => value.name);
145 │           } catch (error) {
146 │             assertIsError(error);
147 │ 
148 │             return {
149 ▶               errors: [{ text: 'Unable to analyze WASM file', notes: [{ text: error.message }] }],
150 │             };
151 │           }
152 │ 
153 │           // Ensure export names are valid JavaScript identifiers
154 ▶           const invalidExportNames = exportNames.filter(
155 ▶             (name) => !ecmaIdentifierNameRegExp.test(name),
156 │           );
157 │           if (invalidExportNames.length > 0) {
158 │             return {
159 │               errors: invalidExportNames.map((name) => ({
160 ▶                 text: 'WASM export names must be valid JavaScript identifiers',
161 │                 notes: [
162 │                   {
163 │                     text: `The export "${name}" is not valid. The WASM file should be updated to remove this error.`,
164 │                   },
165 │                 ],
166 │               })),
167 │             };
168 │           }
169 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/wasm-plugin.ts` L170–196 （▶ の行: 171, 173, 175, 177, 181, 185–186, 189–193）

```ts
170 │           // Add import statements and setup import object
171 ▶           initContents += 'const importObject = Object.create(null);\n';
172 │           let importIndex = 0;
173 ▶           for (const moduleName of importModuleNames) {
174 │             // Add a namespace import for each module name
175 ▶             initContents += `import * as wasm_import_${++importIndex} from ${JSON.stringify(moduleName)};\n`;
176 │             // Add the namespace object to the import object
177 ▶             initContents += `importObject[${JSON.stringify(moduleName)}] = wasm_import_${importIndex};\n`;
178 │           }
179 │ 
180 │           // Instantiate the module
181 ▶           initContents += 'const instance = await init(importObject);\n';
182 │ 
183 │           // Add exports
184 │           const exportNameList = exportNames.join(', ');
185 ▶           initContents += `const { ${exportNameList} } = instance.exports;\n`;
186 ▶           initContents += `export { ${exportNameList} }\n`;
187 │ 
188 │           return {
189 ▶             contents: initContents,
190 ▶             loader: 'js',
191 ▶             resolveDir: dirname(args.path),
192 ▶             pluginData: { wasmContents },
193 ▶             watchFiles: [args.path],
194 │           };
195 │         }),
196 │       );
```

1. **Zone.js のアプリならエラー**

   101〜105 行目。デモの「allowAsync: false」がこの文です。
2. **10,000 バイト未満なら中に埋める**

   118 行目。121〜122 行目、埋めるなら `with { loader: "binary" }` でバイト列として、埋めないなら別ファイル（`file` の loader）のパスとして import します。
3. **Node で埋めないなら readFile**

   125〜128 行目。SSR では fetch でなく、出力の隣のファイルを読みます（fee575e126）。
4. **中身を調べる**

   140〜144 行目、ビルドの最中に `WebAssembly.compile` して、import する モジュール名と export の名前を取ります。154〜160 行目、export の名前が JavaScript の識別子でなければエラー。
5. **初期化のコードを足していく**

   173〜177 行目、wasm が import するモジュールごとに `import * as wasm_import_N` を足し、181 行目で初期化、185〜186 行目で export。
6. **resolveDir と pluginData を付けて返す**

   191 行目、初期化のコードの中の相対 import（`"./env.js"` など）を wasm のフォルダから解決させます。192 行目、読んだ wasm のバイト列を `pluginData` で次の onLoad に渡します。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/wasm-plugin.ts` L197–218 （▶ の行: 198–199, 201–202, 207, 210–212）

```ts
197 │ 
198 ▶       build.onLoad({ filter: /\.wasm$/, namespace: WASM_CONTENTS_NAMESPACE }, async (args) => {
199 ▶         const contents = args.pluginData.wasmContents ?? (await readFile(args.path));
200 │ 
201 ▶         let loader: 'binary' | 'file' = 'file';
202 ▶         if (args.with.loader) {
203 │           assert(
204 │             args.with.loader === 'binary' || args.with.loader === 'file',
205 │             'WASM loader type should only be binary or file.',
206 │           );
207 ▶           loader = args.with.loader;
208 │         }
209 │ 
210 ▶         return {
211 ▶           contents,
212 ▶           loader,
213 │           watchFiles: [args.path],
214 │         };
215 │       });
216 │     },
217 │   };
218 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/wasm-plugin.ts` L220–257 （▶ の行: 232, 234, 236–237, 239, 245–246, 249–250）

```ts
220 │ /**
221 │  * Generates the string content of the WASM initialization helper function.
222 │  * This function supports both file fetching and inline byte data depending on
223 │  * the preferred option for the WASM file. When fetching, an integrity hash is
224 │  * also generated and used with the fetch action.
225 │  *
226 │  * @param streaming Uses fetch and WebAssembly.instantiateStreaming.
227 │  * @param wasmContents The binary contents to generate an integrity hash.
228 │  * @returns A string containing the initialization function.
229 │  */
230 │ function generateInitHelper(streaming: boolean, wasmContents: Uint8Array) {
231 │   let resultContents;
232 ▶   if (streaming) {
233 │     const fetchOptions = {
234 ▶       integrity: 'sha256-' + createHash('sha256').update(wasmContents).digest('base64'),
235 │     };
236 ▶     const fetchContents = `fetch(new URL(wasmPath, import.meta.url), ${JSON.stringify(fetchOptions)})`;
237 ▶     resultContents = `await WebAssembly.instantiateStreaming(${fetchContents}, imports)`;
238 │   } else {
239 ▶     resultContents = 'await WebAssembly.instantiate(wasmData, imports)';
240 │   }
241 │ 
242 │   const contents = `
243 │ let mod;
244 │ async function init(imports) {
245 ▶   if (mod) {
246 ▶     return await WebAssembly.instantiate(mod, imports);
247 │   }
248 │ 
249 ▶   const result = ${resultContents};
250 ▶   mod = result.module;
251 │ 
252 │   return result.instance;
253 │ }
254 │ `;
255 │ 
256 │   return contents;
257 │ }
```

199 行目、`args.pluginData.wasmContents` があれば読み直しません。201〜207 行目、loader は `binary`（埋める）か `file`（別ファイル）。232〜237 行目、ブラウザで埋めないときは `fetch` に sha256 の integrity（中身のハッシュが合わなければ読まない、という指定）を付け、`instantiateStreaming` します。245〜246 行目、2 回目からは 250 行目で覚えたモジュールを使い回します。

> [!WARNING]
> **ハマりどころ**
>
> 199 行目は `args.pluginData` が必ずある前提で書かれています（`?.` が無い）。初期化のコードの onLoad は 99 行目で `createCachedLoad(cache, …)` に包まれているので、cache が [前の章](04-abl-cache.md)の `PersistentLoadResultCache` になって L2 から結果が戻ると、`resolveDir` と `pluginData` が無い結果が返ります。デモの「5b. wasm × L2 のキャッシュ」は、その組み合わせを本物の esbuild で 2 回束ねた記録です。1 回目は通り、2 回目は「Cannot read properties of undefined (reading 'wasmContents')」と、resolveDir が無いことによる「Could not resolve "./env.js"」の 2 つのエラーになりました。いまの application builder は wasm に `MemoryLoadResultCache` しか渡さないので、ng build でこのエラーは出ません。

## 6. sourcemap-ignorelist-plugin：node\_modules をデバッガーで飛ばす

📄 `angular-cli/packages/angular/build/src/tools/esbuild/sourcemap-ignorelist-plugin.ts` L11–41 （▶ の行: 16, 22, 27, 32）

```ts
11 │ /**
12 │  * The field identifier for the sourcemap Chrome Devtools ignore list extension.
13 │  *
14 │  * Following the naming conventions from https://sourcemaps.info/spec.html#h.ghqpj1ytqjbm
15 │  */
16 ▶ const IGNORE_LIST_ID = 'x_google_ignoreList';
17 │ 
18 │ /**
19 │  * The UTF-8 bytes for the node modules check text used to avoid unnecessary parsing
20 │  * of a full source map if not present in the source map data.
21 │  */
22 ▶ const NODE_MODULE_BYTES = Buffer.from('node_modules/', 'utf-8');
23 │ 
24 │ /**
25 │  * The UTF-8 bytes for the "sources" property key used to locate the sources array.
26 │  */
27 ▶ const SOURCES_KEY_BYTES = Buffer.from('"sources"', 'utf-8');
28 │ 
29 │ /**
30 │  * The UTF-8 bytes for the ignore list identifier to check if already present.
31 │  */
32 ▶ const IGNORE_LIST_BYTES = Buffer.from(`"${IGNORE_LIST_ID}"`, 'utf-8');
33 │ 
34 │ /**
35 │  * Minimal sourcemap object required to create the ignore list.
36 │  */
37 │ interface SourceMap {
38 │   sources: string[];
39 │   [IGNORE_LIST_ID]?: number[];
40 │ }
41 │ 
```

Chrome の DevTools は、ソースマップの `x_google_ignoreList`（16 行目）に書かれた番号の元ファイルを、ステップ実行やスタックトレースで飛ばします。このプラグインは、node\_modules から来た元ファイルの番号をそこに書きます。22・27・32 行目、探す文字列はあらかじめバイト列にしておきます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/sourcemap-ignorelist-plugin.ts` L127–157 （▶ の行: 131–132, 135–136, 142, 147–148, 154–155）

```ts
127 │ export function createSourcemapIgnorelistPlugin(): Plugin {
128 │   return {
129 │     name: 'angular-sourcemap-ignorelist',
130 │     setup(build): void {
131 ▶       if (!build.initialOptions.sourcemap) {
132 ▶         return;
133 │       }
134 │ 
135 ▶       build.onEnd((result) => {
136 ▶         if (!result.outputFiles) {
137 │           return;
138 │         }
139 │ 
140 │         for (const file of result.outputFiles) {
141 │           // Only process sourcemap files
142 ▶           if (!file.path.endsWith('.map')) {
143 │             continue;
144 │           }
145 │ 
146 │           // Create a Buffer object that shares the memory of the output file contents
147 ▶           const contents = Buffer.from(
148 ▶             file.contents.buffer,
149 │             file.contents.byteOffset,
150 │             file.contents.byteLength,
151 │           );
152 │ 
153 │           // Avoid parsing sourcemaps that have no node modules references
154 ▶           if (!contents.includes(NODE_MODULE_BYTES)) {
155 ▶             continue;
156 │           }
157 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/sourcemap-ignorelist-plugin.ts` L158–185 （▶ の行: 159–160, 164–166, 170, 174, 176–177）

```ts
158 │           let fastPathSuccess = false;
159 ▶           if (!contents.includes(IGNORE_LIST_BYTES)) {
160 ▶             const sources = extractSources(contents);
161 │             if (sources) {
162 │               const ignoreList: number[] = [];
163 │               for (let index = 0; index < sources.length; ++index) {
164 ▶                 const location = sources[index].indexOf('node_modules/');
165 ▶                 if (location === 0 || (location > 0 && sources[index][location - 1] === '/')) {
166 ▶                   ignoreList.push(index);
167 │                 }
168 │               }
169 │ 
170 ▶               if (ignoreList.length === 0) {
171 │                 continue;
172 │               }
173 │ 
174 ▶               const updated = updateSourcemapFast(contents, ignoreList);
175 │               if (updated) {
176 ▶                 file.contents = updated;
177 ▶                 fastPathSuccess = true;
178 │               }
179 │             }
180 │           }
181 │ 
182 │           if (fastPathSuccess) {
183 │             continue;
184 │           }
185 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/sourcemap-ignorelist-plugin.ts` L42–65 （▶ の行: 43, 49–50, 53, 58–59, 62）

```ts
42 │ function extractSources(contents: Buffer): string[] | undefined {
43 ▶   const sourcesKeyIndex = contents.indexOf(SOURCES_KEY_BYTES);
44 │   if (sourcesKeyIndex === -1) {
45 │     return undefined;
46 │   }
47 │ 
48 │   // Find the ':' after "sources"
49 ▶   let colonIndex = sourcesKeyIndex + SOURCES_KEY_BYTES.length;
50 ▶   while (colonIndex < contents.length && contents[colonIndex] <= 0x20) {
51 │     colonIndex++;
52 │   }
53 ▶   if (contents[colonIndex] !== 0x3a /* : */) {
54 │     return undefined;
55 │   }
56 │ 
57 │   // Find the '[' for the array
58 ▶   let arrayStartIndex = colonIndex + 1;
59 ▶   while (arrayStartIndex < contents.length && contents[arrayStartIndex] <= 0x20) {
60 │     arrayStartIndex++;
61 │   }
62 ▶   if (contents[arrayStartIndex] !== 0x5b /* [ */) {
63 │     return undefined;
64 │   }
65 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/sourcemap-ignorelist-plugin.ts` L66–99 （▶ の行: 71–74, 77, 79, 81, 83, 85–86, 88）

```ts
66 │   // Scan until matching ']'
67 │   let depth = 0;
68 │   let inString = false;
69 │   for (let i = arrayStartIndex; i < contents.length; i++) {
70 │     const byte = contents[i];
71 ▶     if (inString) {
72 ▶       if (byte === 0x5c /* \ */) {
73 ▶         i++; // skip escaped character
74 ▶       } else if (byte === 0x22 /* " */) {
75 │         inString = false;
76 │       }
77 ▶     } else if (byte === 0x22 /* " */) {
78 │       inString = true;
79 ▶     } else if (byte === 0x5b /* [ */) {
80 │       depth++;
81 ▶     } else if (byte === 0x5d /* ] */) {
82 │       depth--;
83 ▶       if (depth === 0) {
84 │         try {
85 ▶           const slice = contents.toString('utf-8', arrayStartIndex, i + 1);
86 ▶           const parsed = JSON.parse(slice);
87 │ 
88 ▶           return Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')
89 │             ? (parsed as string[])
90 │             : undefined;
91 │         } catch {
92 │           return undefined;
93 │         }
94 │       }
95 │     }
96 │   }
97 │ 
98 │   return undefined;
99 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/sourcemap-ignorelist-plugin.ts` L101–117 （▶ の行: 103, 106, 110, 112–115）

```ts
101 │ function updateSourcemapFast(contents: Buffer, ignoreList: readonly number[]): Buffer | undefined {
102 │   let braceIndex = 0;
103 ▶   while (braceIndex < contents.length && contents[braceIndex] <= 0x20) {
104 │     braceIndex++;
105 │   }
106 ▶   if (contents[braceIndex] !== 0x7b /* { */) {
107 │     return undefined;
108 │   }
109 │ 
110 ▶   const injection = Buffer.from(`"${IGNORE_LIST_ID}":${JSON.stringify(ignoreList)},`, 'utf-8');
111 │ 
112 ▶   return Buffer.concat([
113 ▶     contents.subarray(0, braceIndex + 1),
114 ▶     injection,
115 ▶     contents.subarray(braceIndex + 1),
116 │   ]);
117 │ }
```

1. **ソースマップを作らない設定なら何もしない**

   131〜132 行目。フックも登録しません。
2. **束ね終わった出力の .map だけ**

   135 行目の onEnd で、142 行目、名前が .map のものだけ。147〜148 行目、出力のメモリをそのまま `Buffer` として見ます（写さない）。
3. **node\_modules の文字が無ければ飛ばす**

   154〜155 行目。バイト列の検索だけで、JSON を読みません。
4. **sources の配列だけを切り出す**

   160 行目の `extractSources`。43 行目で `"sources"` の位置を探し、49〜62 行目で空白を飛ばして `:` と `[` を確かめ、71〜83 行目で文字列の中の `\` と `"` を数えながら対応する `]` まで進み、85〜86 行目でその範囲だけを JSON.parse します。
5. **番号を集める**

   164〜166 行目、`node_modules/` が先頭にあるか、`/` の直後にあるものだけ。`my_node_modules/` のような名前は入りません。
6. **先頭に差し込む**

   174 行目の `updateSourcemapFast`。103〜106 行目で最初の `{` を探し、110〜115 行目でその直後に `"x_google_ignoreList":[…],` を差し込みます。デモの「プラグインあり」の .map の頭がこの形です。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/sourcemap-ignorelist-plugin.ts` L186–214 （▶ の行: 187–189, 195, 197, 203, 208–209）

```ts
186 │           // Fallback to full JSON parse/stringify if fast scanning or splicing fails
187 ▶           const map = JSON.parse(contents.toString('utf-8')) as SourceMap;
188 ▶           if (map[IGNORE_LIST_ID]) {
189 ▶             continue;
190 │           }
191 │ 
192 │           const ignoreList = [];
193 │ 
194 │           // Check and store the index of each source originating from a node modules directory
195 ▶           for (let index = 0; index < map.sources.length; ++index) {
196 │             const location = map.sources[index].indexOf('node_modules/');
197 ▶             if (location === 0 || (location > 0 && map.sources[index][location - 1] === '/')) {
198 │               ignoreList.push(index);
199 │             }
200 │           }
201 │ 
202 │           // Avoid regenerating the source map if nothing changed
203 ▶           if (ignoreList.length === 0) {
204 │             continue;
205 │           }
206 │ 
207 │           // Update the sourcemap in the output file
208 ▶           map[IGNORE_LIST_ID] = ignoreList;
209 ▶           file.contents = Buffer.from(JSON.stringify(map), 'utf-8');
210 │         }
211 │       });
212 │     },
213 │   };
214 │ }
```

切り出しに失敗したとき（`"sources"` が無い、形が違う）と、159 行目で無視リストがすでに書いてあるときは、187 行目からの元のやり方（全体を JSON.parse して stringify）に落ちます。数 MB のソースマップを毎回 parse し直すのをやめるために、コミット「avoid full JSON parsing when updating sourcemap ignore list」（5a0d226b7c、2026-09-08）で 2〜6 のステップの速い道が入りました。

## 7. server-bundle-metadata と localize-init-warning

📄 `angular-cli/packages/angular/build/src/tools/esbuild/server-bundle-metadata-plugin.ts` L11–36 （▶ の行: 18–19, 26, 29–31）

```ts
11 │ /**
12 │  * Generates an esbuild plugin that appends metadata to the output bundle,
13 │  * marking it with server-side rendering (SSR) details for Angular SSR scenarios.
14 │  *
15 │  * @param options Optional configuration object.
16 │  * - `ssrEntryBundle`: If `true`, marks the bundle as an SSR entry point.
17 │  *
18 ▶  * @remarks We can't rely on `platform: node` or `platform: neutral`, as the latter
19 ▶  *       is used for non-SSR-related code too (e.g., global scripts).
20 │  * @returns An esbuild plugin that injects SSR metadata into the build result's metafile.
21 │  */
22 │ export function createServerBundleMetadata(options?: { ssrEntryBundle?: boolean }): Plugin {
23 │   return {
24 │     name: 'angular-server-bundle-metadata',
25 │     setup(build) {
26 ▶       build.onEnd((result) => {
27 │         // eslint-disable-next-line @typescript-eslint/no-explicit-any
28 │         const metafile = result.metafile as any;
29 ▶         if (metafile) {
30 ▶           metafile['ng-ssr-entry-bundle'] = !!options?.ssrEntryBundle;
31 ▶           metafile['ng-platform-server'] = true;
32 │         }
33 │       });
34 │     },
35 │   };
36 │ }
```

26 行目の onEnd で、metafile に 30〜31 行目の 2 つの印を書くだけのプラグインです。18〜19 行目のとおり、`platform: 'neutral'` はグローバルの scripts でも使うので、platform では「サーバーの束か」を見分けられません。読む側は bundler-context.ts の結果の作り方で、[BundlerContext と後処理の残り](03-abl-context-post.md)の章で読みます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular-localize-init-warning-plugin.ts` L20–57 （▶ の行: 24–25, 29–30, 34, 36, 44, 46, 49–50）

```ts
20 │ export function createAngularLocalizeInitWarningPlugin(): Plugin {
21 │   return {
22 │     name: 'angular-localize-init-warning',
23 │     setup(build) {
24 ▶       build.onResolve({ filter: /^@angular\/localize\/init/ }, async (args) => {
25 ▶         if (args.pluginData?.[NG_LOCALIZE_RESOLUTION]) {
26 │           return null;
27 │         }
28 │ 
29 ▶         if (args.namespace?.startsWith('angular:')) {
30 ▶           return null;
31 │         }
32 │ 
33 │         const { importer, kind, resolveDir, namespace, pluginData = {} } = args;
34 ▶         pluginData[NG_LOCALIZE_RESOLUTION] = true;
35 │ 
36 ▶         const result = await build.resolve(args.path, {
37 │           importer,
38 │           kind,
39 │           namespace,
40 │           pluginData,
41 │           resolveDir,
42 │         });
43 │ 
44 ▶         return {
45 │           ...result,
46 ▶           warnings: [
47 │             ...result.warnings,
48 │             {
49 ▶               text: `Direct import of '@angular/localize/init' detected. This may lead to undefined behavior.`,
50 ▶               notes: [{ text: `Include '@angular/localize/init' as a polyfill instead.` }],
51 │             },
52 │           ],
53 │         };
54 │       });
55 │     },
56 │   };
57 │ }
```

`@angular/localize/init` をアプリのコードで直接 import すると、`$localize` がアプリより先に用意される保証がなく、動きが定まりません（bfe9ee36cc のメッセージが 3 つの issue を挙げています）。24 行目でその import を拾い、29〜30 行目、`angular:` の名前空間（polyfills の入口）からの import は正しい使い方なので見逃します。36 行目でふつうに解決し、44〜50 行目で結果に警告を 1 つ足して返します。エラーではないのでビルドは通ります（デモの 7 の 3 つめ）。

## 8. global-scripts：angular.json の scripts をつなげる

📄 `angular-cli/packages/angular/build/src/tools/esbuild/global-scripts.ts` L26–56 （▶ の行: 29, 42, 45–46, 48, 53–54）

```ts
26 │ export function createGlobalScriptsBundleOptions(
27 │   options: NormalizedApplicationBuildOptions,
28 │   target: string[],
29 ▶   initial: boolean,
30 │ ): BundlerOptionsFactory | undefined {
31 │   const {
32 │     globalScripts,
33 │     optimizationOptions,
34 │     outputNames,
35 │     preserveSymlinks,
36 │     sourcemapOptions,
37 │     jsonLogs,
38 │     workspaceRoot,
39 │     define,
40 │   } = options;
41 │ 
42 ▶   const namespace = 'angular:script/global';
43 │   const entryPoints: Record<string, string> = {};
44 │   let found = false;
45 ▶   for (const script of globalScripts) {
46 ▶     if (script.initial === initial) {
47 │       found = true;
48 ▶       entryPoints[script.name] = `${namespace}:${script.name}`;
49 │     }
50 │   }
51 │ 
52 │   // Skip if there are no entry points for the style loading type
53 ▶   if (found === false) {
54 ▶     return;
55 │   }
56 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/global-scripts.ts` L57–91 （▶ の行: 57, 60, 63, 65–66, 74, 77, 79, 82, 84, 86–88）

```ts
57 ▶   return (loadCache) => {
58 │     return {
59 │       absWorkingDir: workspaceRoot,
60 ▶       bundle: false,
61 │       splitting: false,
62 │       entryPoints,
63 ▶       entryNames: initial ? outputNames.bundles : '[name]',
64 │       assetNames: outputNames.media,
65 ▶       mainFields: ['script', 'browser', 'main'],
66 ▶       conditions: ['script', optimizationOptions.scripts ? 'production' : 'development'],
67 │       resolveExtensions: ['.mjs', '.js', '.cjs'],
68 │       logLevel: options.verbose && !jsonLogs ? 'debug' : 'silent',
69 │       metafile: true,
70 │       minify: optimizationOptions.scripts,
71 │       outdir: workspaceRoot,
72 │       sourcemap: sourcemapOptions.scripts && (sourcemapOptions.hidden ? 'external' : true),
73 │       write: false,
74 ▶       platform: 'neutral',
75 │       target,
76 │       preserveSymlinks,
77 ▶       define,
78 │       plugins: [
79 ▶         createSourcemapIgnorelistPlugin(),
80 │         createVirtualModulePlugin({
81 │           namespace,
82 ▶           external: true,
83 │           // Add the `js` extension here so that esbuild generates an output file with the extension
84 ▶           transformPath: (path) => path.slice(namespace.length + 1) + '.js',
85 │           loadContent: (args, build) =>
86 ▶             createCachedLoad(loadCache, async (args) => {
87 ▶               const files = globalScripts.find(
88 ▶                 ({ name }) => name === args.path.slice(0, -3),
89 │               )?.files;
90 │               assert(files, `Invalid operation: global scripts name not found [${args.path}]`);
91 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/global-scripts.ts` L92–127 （▶ の行: 92–93, 99–101, 104, 109–111, 117, 119, 125–126）

```ts
 92 ▶               // Global scripts are concatenated using magic-string instead of bundled via esbuild.
 93 ▶               const bundleContent = new Bundle();
 94 │               const watchFiles = [];
 95 │               for (const filename of files) {
 96 │                 let fileContent;
 97 │                 try {
 98 │                   // Attempt to read as a relative path from the workspace root
 99 ▶                   const fullPath = path.join(workspaceRoot, filename);
100 ▶                   fileContent = await readFile(fullPath, 'utf-8');
101 ▶                   watchFiles.push(fullPath);
102 │                 } catch (e) {
103 │                   assertIsError(e);
104 ▶                   if (e.code !== 'ENOENT') {
105 │                     throw e;
106 │                   }
107 │ 
108 │                   // If not found, attempt to resolve as a module specifier
109 ▶                   const resolveResult = await build.resolve(filename, {
110 ▶                     kind: 'entry-point',
111 ▶                     resolveDir: workspaceRoot,
112 │                   });
113 │ 
114 │                   if (resolveResult.errors.length) {
115 │                     // Remove resolution failure notes about marking as external since it doesn't apply
116 │                     // to global scripts.
117 ▶                     resolveResult.errors.forEach((error) => (error.notes = []));
118 │ 
119 ▶                     return {
120 │                       errors: resolveResult.errors,
121 │                       warnings: resolveResult.warnings,
122 │                     };
123 │                   }
124 │ 
125 ▶                   watchFiles.push(resolveResult.path);
126 ▶                   fileContent = await readFile(resolveResult.path, 'utf-8');
127 │                 }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/global-scripts.ts` L128–142 （▶ の行: 129, 133–135, 137）

```ts
128 │ 
129 ▶                 bundleContent.addSource(new MagicString(fileContent, { filename }));
130 │               }
131 │ 
132 │               return {
133 ▶                 contents: bundleContent.toString(),
134 ▶                 loader: 'js',
135 ▶                 watchFiles,
136 │               };
137 ▶             }).call(build, args),
138 │         }),
139 │       ],
140 │     };
141 │   };
142 │ }
```

angular.json の `scripts` に並べた .js は、import でつながったモジュールではなく、`<script>` でそのまま読むファイルです。だから esbuild に束ねさせず、文字列としてつなげます。

1. **入口を名前ごとに 1 つ**

   45〜48 行目、`scripts`（bundleName ごとに 1 つ）のうち 29 行目の `initial`（index.html に入れるか）が合うものを `angular:script/global:scripts` の形の入口にします。53〜54 行目、無ければ束そのものを作りません。
2. **束ねない esbuild**

   60 行目 `bundle: false`、74 行目 `platform: 'neutral'`。65〜66 行目、パッケージ名で指定したときは package.json の `script` の項目と条件を先に見ます。77 行目で `define` も効かせます（5bd937b86e）。
3. **2 節の virtual-module で入口を作る**

   82 行目 `external: true`、84 行目でパスに .js を足して、出力の名前を scripts.js にします。
4. **ファイルを順に読む**

   99〜101 行目、まず workspace からの相対パスとして読みます。104 行目、無い（ENOENT）以外のエラーは投げ直し、109〜111 行目、無ければパッケージ名として esbuild に解決させます。それも失敗すれば 117〜119 行目、esbuild の「external にすれば消えます」の注を消してエラーを返します（デモの scripts の 2 つめ）。
5. **magic-string でつなぐ**

   93 行目の `Bundle` に、129 行目でファイルごとの `MagicString` を足し、133 行目で 1 つの文字列にします。ソースマップの元の対応も magic-string が持ちます。

86 行目、onLoad は 1 回目の呼び出しのたびに `createCachedLoad` で包み、137 行目で `call` して呼びます。読んだファイルは 135 行目の `watchFiles` に入るので、scripts のファイルを保存すると再ビルドされます。ただし、esbuild の metafile の入力に出るのは仮想のパス `angular:script/global:scripts.js` だけです（デモの scripts の入力）。これが 10 節で効いてきます。

## 9. checkCommonJSModules：CommonJS の警告

📄 `angular-cli/packages/angular/build/src/tools/esbuild/commonjs-checker.ts` L30–56 （▶ の行: 35, 37–38, 42, 46, 50, 54–55）

```ts
30 │ export function checkCommonJSModules(
31 │   metafile: Metafile,
32 │   allowedCommonJsDependencies?: string[],
33 │ ): PartialMessage[] {
34 │   const messages: PartialMessage[] = [];
35 ▶   const allowedRequests = new Set(allowedCommonJsDependencies);
36 │ 
37 ▶   if (allowedRequests.has('*')) {
38 ▶     return messages;
39 │   }
40 │ 
41 │   // Ignore Angular locale definitions which are currently UMD
42 ▶   allowedRequests.add('@angular/common/locales');
43 │ 
44 │   // Ignore zone.js due to it currently being built with a UMD like structure.
45 │   // Once the build output is updated to be fully ESM, this can be removed.
46 ▶   allowedRequests.add('zone.js');
47 │ 
48 │   // Used by '@angular/platform-server' and is in a seperate chunk that is unused when
49 │   // using `provideHttpClient(withFetch())`.
50 ▶   allowedRequests.add('xhr2');
51 │ 
52 │   // Packages used by @angular/ssr.
53 │   // While beasties is ESM it has a number of direct and transtive CJS deps.
54 ▶   allowedRequests.add('express');
55 ▶   allowedRequests.add('beasties');
56 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/commonjs-checker.ts` L57–96 （▶ の行: 59, 63, 67, 72, 76–77, 79, 81, 85, 88, 93）

```ts
57 │   // Find all entry points that contain code (JS/TS)
58 │   const files: string[] = [];
59 ▶   for (const { entryPoint } of Object.values(metafile.outputs)) {
60 │     if (!entryPoint) {
61 │       continue;
62 │     }
63 ▶     if (!isPathCode(entryPoint)) {
64 │       continue;
65 │     }
66 │ 
67 ▶     files.push(entryPoint);
68 │   }
69 │ 
70 │   // Track seen files so they are only analyzed once.
71 │   // Bundler runtime code is also ignored since it cannot be actionable.
72 ▶   const seenFiles = new Set<string>(['<runtime>']);
73 │ 
74 │   // Analyze the files present by walking the import graph
75 │   let currentFile: string | undefined;
76 ▶   while ((currentFile = files.shift())) {
77 ▶     const input = metafile.inputs[currentFile];
78 │ 
79 ▶     for (const imported of input.imports) {
80 │       // Ignore imports that were already seen or not originally in the code (bundler injected)
81 ▶       if (!imported.original || seenFiles.has(imported.path)) {
82 │         continue;
83 │       }
84 │ 
85 ▶       seenFiles.add(imported.path);
86 │ 
87 │       // If the dependency is allowed ignore all other checks
88 ▶       if (allowedRequests.has(imported.original)) {
89 │         continue;
90 │       }
91 │ 
92 │       // Only check actual code files
93 ▶       if (!isPathCode(imported.path)) {
94 │         continue;
95 │       }
96 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/commonjs-checker.ts` L97–132 （▶ の行: 99–100, 105, 109–110, 117, 119, 122–123, 127）

```ts
 97 │       // Check if non-relative import is ESM format and issue a diagnostic if the file is not allowed
 98 │       if (
 99 ▶         !isPotentialRelative(imported.original) &&
100 ▶         metafile.inputs[imported.path].format !== 'esm'
101 │       ) {
102 │         const request = imported.original;
103 │ 
104 │         let notAllowed = true;
105 ▶         if (allowedRequests.has(request)) {
106 │           notAllowed = false;
107 │         } else {
108 │           // Check for deep imports of allowed requests
109 ▶           for (const allowed of allowedRequests) {
110 ▶             if (request.startsWith(allowed + '/')) {
111 │               notAllowed = false;
112 │               break;
113 │             }
114 │           }
115 │         }
116 │ 
117 ▶         if (notAllowed) {
118 │           // Issue a diagnostic message for CommonJS module
119 ▶           messages.push(createCommonJSModuleError(request, currentFile));
120 │         }
121 │ 
122 ▶         // Skip all descendants since they are also most likely not ESM but solved by addressing this import
123 ▶         continue;
124 │       }
125 │ 
126 │       // Add the path so that its imports can be checked
127 ▶       files.push(imported.path);
128 │     }
129 │   }
130 │ 
131 │   return messages;
132 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/commonjs-checker.ts` L141–178 （▶ の行: 142, 155, 167, 171–172）

```ts
141 │ function isPathCode(name: string): boolean {
142 ▶   return /\.[cm]?[jt]sx?$/.test(name);
143 │ }
144 │ 
145 │ /**
146 │  * Test an import module specifier to determine if the string potentially references a relative file.
147 │  * npm packages should not start with a period so if the first character is a period than it is not a
148 │  * package. While this is sufficient for the use case in the CommmonJS checker, only checking the
149 │  * first character does not definitely indicate the specifier is a relative path.
150 │  *
151 │  * @param specifier An import module specifier.
152 │  * @returns True, if specifier is potentially relative; false, otherwise.
153 │  */
154 │ function isPotentialRelative(specifier: string): boolean {
155 ▶   return specifier[0] === '.';
156 │ }
157 │ 
158 │ /**
159 │  * Creates an esbuild diagnostic message for a given non-ESM module request.
160 │  *
161 │  * @param request The requested non-ESM module name.
162 │  * @param importer The path of the file containing the import.
163 │  * @returns A message representing the diagnostic.
164 │  */
165 │ function createCommonJSModuleError(request: string, importer: string): PartialMessage {
166 │   const error = {
167 ▶     text: `Module '${request}' used by '${importer}' is not ESM`,
168 │     notes: [
169 │       {
170 │         text:
171 ▶           'CommonJS or AMD dependencies can cause optimization bailouts.\n' +
172 ▶           'For more information see: https://angular.dev/tools/cli/build#configuring-commonjs-dependencies',
173 │       },
174 │     ],
175 │   };
176 │ 
177 │   return error;
178 │ }
```

呼ばれるのは本番の最適化（`optimization.scripts`）のときだけで、ブラウザの束の metafile を受け取ります（[ng build の段取り](../cli/02-build.md)）。37〜38 行目、`'*'` なら何も調べません。42〜55 行目、ロケールのデータ・zone.js・xhr2・express・beasties は最初から許します。

1. **入口から始める**

   59〜67 行目、出力ごとの `entryPoint` のうち、142 行目の正規表現で JS / TS のものだけ。72 行目、esbuild が足した `<runtime>` は最初から見たことにします。
2. **import を幅優先でたどる**

   76 行目で列から 1 つ取り、79 行目でその import を順に見ます。81 行目、元のコードに無い import（`original` が無い）と、見たことのあるファイルは飛ばします。
3. **許されたものは子も見ない**

   88 行目で `continue` し、127 行目の「子を列に足す」を通りません。
4. **パッケージ名の import で ESM でなければ警告**

   99〜100 行目。155 行目、`.` で始まらなければパッケージ名とみなします。109〜110 行目、許されたものの深い import（`cjs-pkg/sub`）も許します。
5. **警告したら子は見ない**

   123 行目。CommonJS の子もたいてい CommonJS で、親を直せば消えるからです（122 行目のコメント）。

デモでは、main.js が import する `cjs-pkg`（中で `cjs-dep` を require）と `cjs-pkg/sub` の 2 つに警告が出て、`cjs-dep` には出ませんでした（5 のステップ）。`['cjs-pkg']` を許すと 2 つとも消えます（4 のステップ）。

## 10. extractLicenses：3rdpartylicenses.txt

📄 `angular-cli/packages/angular/build/src/tools/esbuild/license-extractor.ts` L13–45 （▶ の行: 16, 30, 35, 40, 45）

````ts
13 │ /**
14 │  * The path segment used to signify that a file is part of a package.
15 │  */
16 ▶ const NODE_MODULE_SEGMENT = 'node_modules';
17 │ 
18 │ /**
19 │  * String constant for the NPM recommended custom license wording.
20 │  *
21 │  * See: https://docs.npmjs.com/cli/v9/configuring-npm/package-json#license
22 │  *
23 │  * Example:
24 │  * ```
25 │  * {
26 │  *   "license" : "SEE LICENSE IN <filename>"
27 │  * }
28 │  * ```
29 │  */
30 ▶ const CUSTOM_LICENSE_TEXT = 'SEE LICENSE IN ';
31 │ 
32 │ /**
33 │  * A regular expression for commonly named license files found within packages.
34 │  */
35 ▶ const LICENSE_FILE_REGEXP = /^(?:mit-)?licen[cs]e(?:$|[-._])/i;
36 │ 
37 │ /**
38 │  * Header text that will be added to the top of the output license extraction file.
39 │  */
40 ▶ const EXTRACTION_FILE_HEADER = '';
41 │ 
42 │ /**
43 │  * The package entry separator to use within the output license extraction file.
44 │  */
45 ▶ const EXTRACTION_FILE_SEPARATOR = '-'.repeat(80) + '\n';
````

📄 `angular-cli/packages/angular/build/src/tools/esbuild/license-extractor.ts` L92–122 （▶ の行: 93, 96–98, 103–105, 109, 113, 116, 118）

```ts
 92 │         // Extract the package name from the path
 93 ▶         let baseDirectory = path.join(rootDirectory, inputPath);
 94 │         let nameOrScope, nameOrFile;
 95 │         let found = false;
 96 ▶         while (baseDirectory !== path.dirname(baseDirectory)) {
 97 ▶           const segment = path.basename(baseDirectory);
 98 ▶           if (segment === NODE_MODULE_SEGMENT) {
 99 │             found = true;
100 │             break;
101 │           }
102 │ 
103 ▶           nameOrFile = nameOrScope;
104 ▶           nameOrScope = segment;
105 ▶           baseDirectory = path.dirname(baseDirectory);
106 │         }
107 │ 
108 │         // Skip non-package path edge cases that are not caught in the includes check above
109 ▶         if (!found || !nameOrScope) {
110 │           continue;
111 │         }
112 │ 
113 ▶         const packageName = nameOrScope.startsWith('@')
114 │           ? `${nameOrScope}/${nameOrFile}`
115 │           : nameOrScope;
116 ▶         const packageDirectory = path.join(baseDirectory, packageName);
117 │ 
118 ▶         if (seenPackageDirectories.has(packageDirectory)) {
119 │           continue;
120 │         }
121 │         seenPackageDirectories.add(packageDirectory);
122 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/license-extractor.ts` L123–152 （▶ の行: 139–140, 147–149, 152）

```ts
123 │         // Load the package's metadata to find the package's name, version, and license type
124 │         const packageJsonPath = path.join(packageDirectory, 'package.json');
125 │         let packageJson;
126 │         try {
127 │           packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
128 │             name: string;
129 │             version: string;
130 │             // The object form is deprecated and should only be present in old packages
131 │             license?: string | { type: string };
132 │           };
133 │         } catch {
134 │           // Invalid package
135 │           continue;
136 │         }
137 │ 
138 │         // Skip already processed packages
139 ▶         const packageId = `${packageName}@${packageJson.version}`;
140 ▶         if (seenPackages.has(packageId)) {
141 │           continue;
142 │         }
143 │         seenPackages.add(packageId);
144 │ 
145 │         // Attempt to find license text inside package
146 │         let licenseText = '';
147 ▶         if (
148 ▶           typeof packageJson.license === 'string' &&
149 ▶           packageJson.license.toUpperCase().startsWith(CUSTOM_LICENSE_TEXT)
150 │         ) {
151 │           // Attempt to load the package's custom license
152 ▶           let customLicensePath;
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/license-extractor.ts` L153–182 （▶ の行: 153–154, 156, 158, 160, 162, 167, 171–172, 176）

```ts
153 ▶           const customLicenseFile = path.normalize(
154 ▶             packageJson.license.slice(CUSTOM_LICENSE_TEXT.length).trim(),
155 │           );
156 ▶           if (customLicenseFile.startsWith('..') || path.isAbsolute(customLicenseFile)) {
157 │             // Path is attempting to access files outside of the package
158 ▶             // TODO: Issue warning?
159 │           } else {
160 ▶             customLicensePath = path.join(packageDirectory, customLicenseFile);
161 │             try {
162 ▶               licenseText = await readFile(customLicensePath, 'utf-8');
163 │             } catch {}
164 │           }
165 │         } else {
166 │           // Search for a license file within the root of the package
167 ▶           const entries = await readdir(packageDirectory, { withFileTypes: true }).catch(() => []);
168 │ 
169 │           for (const entry of entries) {
170 │             if (
171 ▶               (entry.isFile() || entry.isSymbolicLink()) &&
172 ▶               LICENSE_FILE_REGEXP.test(entry.name)
173 │             ) {
174 │               const packageLicensePath = path.join(packageDirectory, entry.name);
175 │               try {
176 ▶                 licenseText = await readFile(packageLicensePath, 'utf-8');
177 │                 break;
178 │               } catch {}
179 │             }
180 │           }
181 │         }
182 │ 
```

出力に 1 バイト以上入った入力のパス（この引用の手前の行、[ng build の段取り](../cli/02-build.md)で読みました）のうち、`node_modules` を含むものだけを見ます。

1. **パッケージの場所を探す**

   93 行目で workspace からの絶対パスにし、96〜105 行目でフォルダを 1 つずつ上がり、最初の `node_modules` の直下で止まります。103〜104 行目、直前の 2 つの区切りを覚えておき、113 行目、`@` で始まればスコープつきの名前にします。
2. **同じフォルダ・同じ版は 1 回**

   118 行目のフォルダの Set と、139〜140 行目の `名前@版` の Set。
3. **package.json の license**

   124〜127 行目で読み、147〜149 行目、`SEE LICENSE IN <ファイル>` ならそのファイル（156 行目、パッケージの外を指すなら読まない。158 行目に「警告を出すか」の TODO）。
4. **無ければ LICENSE のファイルを探す**

   167 行目でパッケージのフォルダを読み、171〜172 行目、35 行目の正規表現（`LICENSE`・`license`・`LICENCE.md`・`MIT-LICENSE.txt` など、大文字と小文字を区別しない）に合う最初のファイル。e1c7193dce（#33741）で、決め打ちの名前の一覧からこの形になりました。

> [!WARNING]
> **ハマりどころ**
>
> 8 節のとおり、scripts の束の metafile の入力は `angular:script/global:scripts.js` だけで、node\_modules のパスが出てきません。だから scripts に入れたパッケージは、引用の手前の `inputPath.includes(NODE_MODULE_SEGMENT)` の判定で飛ばされ、93 行目からのパッケージ探しに入りません。記録では、カウンターのアプリの angular.json に `"scripts": ["node_modules/tslib/tslib.js"]` を足して `ng build --extract-licenses --optimization` したところ、scripts.js（12686 バイト）には tslib のコードが入り（`__awaiter` がある：true）、3rdpartylicenses.txt の Package は @angular/core・rxjs・@angular/common・@angular/platform-browser の 4 つで、tslib は出ませんでした（false）。tslib.js の頭の著作権のコメントも、最小化で scripts.js から消えています（false）。gh で angular/angular-cli の issue を「3rdpartylicenses」で探しても、この組み合わせの報告は見つかりませんでした。

> **🧪 DEMO — 本物の esbuild 0.28.2 にプラグインを 1 つずつ差した記録**
>
> 上の段でプラグインを、下の段で条件を選びます。値は下のスクリプトが書き出した JSON そのままです（パスは &lt;work&gt; と &lt;node\_modules&gt; に置き換え）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/abl-plugins)

## 11. どう録ったか

スクリプトは scratchpad に置き、作業用のフォルダに小さな入口と、偽のパッケージ（ESM の esm-pkg、CommonJS の cjs-pkg と cjs-dep、それぞれ LICENSE か license の欄つき）を書き、rxjs・tslib・@angular/localize はサイトの node\_modules を symlink で借りました。wasm は 63 バイトの小さなモジュール（`./env.js` の log を import し、add を export）と、そこに 12,000 バイトのカスタムセクションを足した版を、スクリプトの中でバイト列から作っています。esbuild はサイトの node\_modules の 0.28.2、プラグインは @angular/build 22.2.7 の dist の .js を絶対パスで require して、1 つずつ `plugins` に差しました。wasm の初期化のコードは、`build.onLoad` を包んで戻り値を横から記録しています。10 節のカウンターのアプリの記録は 2 つめのスクリプトです。

📄 `記録のスクリプト（record-plugins.mjs）`

```
// 本物の esbuild と @angular/build 22.2.7 のプラグインを 1 つずつ差して束ね、出力と警告を記録する。
// 使い方: node record-plugins.mjs <site-node_modules> <work-dir> > plugins-record.json
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [nm, work] = process.argv.slice(2);
const require = createRequire(join(nm, 'x.js'));
const esbuild = require('esbuild');
const B = join(nm, '@angular/build/src/tools/esbuild');
const P = (f) => require(join(B, f));
const { createExternalPackagesPlugin } = P('external-packages-plugin.js');
const { createVirtualModulePlugin } = P('virtual-module-plugin.js');
const { createRxjsEsmResolutionPlugin } = P('rxjs-esm-resolution-plugin.js');
const { createLoaderImportAttributePlugin } = P('loader-import-attribute-plugin.js');
const { createWasmPlugin } = P('wasm-plugin.js');
const { createSourcemapIgnorelistPlugin } = P('sourcemap-ignorelist-plugin.js');
const { createServerBundleMetadata } = P('server-bundle-metadata-plugin.js');
const { createAngularLocalizeInitWarningPlugin } = P('angular-localize-init-warning-plugin.js');
const { createGlobalScriptsBundleOptions } = P('global-scripts.js');
const { checkCommonJSModules } = P('commonjs-checker.js');
const { extractLicenses } = P('license-extractor.js');

rmSync(work, { recursive: true, force: true });
const files = {
  'src/main.js': `import { greet } from 'esm-pkg';\nimport legacy from 'cjs-pkg';\nimport deep from 'cjs-pkg/sub';\nimport { local } from './local.js';\nconsole.log(greet(), legacy, deep, local);\n`,
  'src/local.js': `export const local = 'local';\n`,
  'src/note.txt': `hello from a text file\n`,
  'src/text-main.js': `import note from './note.txt' with { loader: 'text' };\nimport bad from './note.txt' with { loader: 'css' };\nconsole.log(note, bad);\n`,
  'src/text-ok.js': `import note from './note.txt' with { loader: 'text' };\nconsole.log(note);\n`,
  'src/rx.js': `import { of } from 'rxjs';\nof(1).subscribe(console.log);\n`,
  'src/localize.js': `import '@angular/localize/init';\nconsole.log($localize\`hi\`);\n`,
  'src/env.js': `export function log(v) { console.log('wasm says', v); }\n`,
  'src/wasm-main.js': `import { add } from './add.wasm';\nconsole.log(add(1, 2));\n`,
  'src/virtual-user.js': `import x from 'angular:demo-virtual';\nconsole.log(x);\n`,
  'scripts/a.js': `window.a = 1;\n`,
  'scripts/b.js': `window.b = 2;\n`,
  'node_modules/esm-pkg/package.json': JSON.stringify({ name: 'esm-pkg', version: '1.0.0', type: 'module', main: 'index.js', license: 'MIT' }),
  'node_modules/esm-pkg/index.js': `export function greet() { return 'hi'; }\n`,
  'node_modules/esm-pkg/LICENSE': `MIT License (esm-pkg)\n`,
  'node_modules/cjs-pkg/package.json': JSON.stringify({ name: 'cjs-pkg', version: '2.0.0', main: 'index.js', license: 'SEE LICENSE IN terms.txt' }),
  'node_modules/cjs-pkg/index.js': `const dep = require('cjs-dep');\nmodule.exports = 'legacy:' + dep;\n`,
  'node_modules/cjs-pkg/sub.js': `module.exports = 'deep';\n`,
  'node_modules/cjs-pkg/terms.txt': `Custom terms for cjs-pkg\n`,
  'node_modules/cjs-dep/package.json': JSON.stringify({ name: 'cjs-dep', version: '0.1.0', main: 'index.js', license: 'ISC' }),
  'node_modules/cjs-dep/index.js': `module.exports = 'dep';\n`,
  'node_modules/cjs-dep/LICENCE.md': `ISC (cjs-dep)\n`,
};
for (const [p, c] of Object.entries(files)) {
  mkdirSync(dirname(join(work, p)), { recursive: true });
  writeFileSync(join(work, p), c);
}
// (func (import "./env.js" "log") (param i32)) (func (export "add") (param i32 i32) (result i32))
const wasm = Uint8Array.from(
  ('0061736d01000000' + '010b0260027f7f017f60017f00' + '0210010' + '82e2f656e762e6a73036c6f670001' +
    '03020100' + '070701036164640001' + '0a09010700200020016a0b')
    .match(/../g)
    .map((h) => parseInt(h, 16)),
);
await WebAssembly.compile(wasm);
writeFileSync(join(work, 'src/add.wasm'), wasm);
symlinkSync(join(nm, 'rxjs'), join(work, 'node_modules/rxjs'));
symlinkSync(join(nm, 'tslib'), join(work, 'node_modules/tslib'));
// 10kB を超える版：名前 "pad" のカスタムセクション（id 0）に 12,000 バイトを足す
{
  const pad = 12000;
  const name = [3, 0x70, 0x61, 0x64];
  const leb = (n) => { const o = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n); return o; };
  const body = [...name, ...new Array(pad).fill(0)];
  const big = Uint8Array.from([...wasm, 0, ...leb(body.length), ...body]);
  await WebAssembly.compile(big);
  writeFileSync(join(work, 'src/big.wasm'), big);
  writeFileSync(join(work, 'src/big-main.js'), `import { add } from './big.wasm';\nconsole.log(add(1, 2));\n`);
}
mkdirSync(join(work, 'node_modules/@angular'), { recursive: true });
symlinkSync(join(nm, '@angular/localize'), join(work, 'node_modules/@angular/localize'));
symlinkSync(join(nm, '@angular/compiler'), join(work, 'node_modules/@angular/compiler'));

const hide = (s) => s.split(work).join('<work>').split(nm).join('<node_modules>').replace(/(\.\.\/)+(\.\.)?<node_modules>/g, '<node_modules>');
const fmt = (m) => ({ text: m.text, notes: (m.notes ?? []).map((n) => n.text), file: m.location?.file ?? null });
const base = {
  absWorkingDir: work,
  bundle: true,
  write: false,
  metafile: true,
  format: 'esm',
  logLevel: 'silent',
  outdir: join(work, 'out'),
  preserveSymlinks: true,
};
const run = async (opts) => {
  try {
    const r = await esbuild.build({ ...base, ...opts });
    return { ok: true, r };
  } catch (e) {
    return { ok: false, errors: e.errors.map(fmt), warnings: e.warnings.map(fmt) };
  }
};
const summary = (res, { showCode = false, maxLines = 30, pick } = {}) => {
  if (!res.ok) return { errors: res.errors, warnings: res.warnings, outputs: [], inputs: [] };
  const { r } = res;
  const outs = r.outputFiles.map((f) => {
    const name = hide(f.path).replace('<work>/out/', '');
    let text = f.text;
    if (pick) text = pick(name, text);
    return { name, bytes: f.contents.byteLength, code: showCode ? hide(text).split('\n').slice(0, maxLines).join('\n') : undefined };
  });
  return {
    errors: r.errors.map(fmt),
    warnings: r.warnings.map(fmt),
    inputs: Object.keys(r.metafile.inputs).map(hide),
    externals: [...new Set(Object.values(r.metafile.outputs).flatMap((o) => o.imports.filter((i) => i.external).map((i) => i.path)))],
    outputs: outs,
  };
};

const cases = [];

// 1. external-packages
{
  let seenPackages;
  const spy = { name: 'spy', setup(b) { seenPackages = b.initialOptions.packages ?? '(未設定)'; } };
  const a = await run({ entryPoints: ['src/main.js'], plugins: [createExternalPackagesPlugin(), spy] });
  const pkgA = seenPackages;
  const b = await run({ entryPoints: ['src/main.js'], plugins: [createExternalPackagesPlugin({ exclude: ['cjs-pkg'] }), spy] });
  const pkgB = seenPackages;
  // loader に file 以外があると、プラグインが自分で build.resolve を呼ぶ道に入る。その回数を数える
  let resolveCalls = 0;
  const counter = {
    name: 'count-resolve',
    setup(b) {
      const orig = b.resolve.bind(b);
      b.resolve = (...args) => {
        resolveCalls++;
        return orig(...args);
      };
      createExternalPackagesPlugin().setup(b);
    },
  };
  const c = await run({ entryPoints: ['src/main.js'], loader: { '.txt': 'text' }, plugins: [counter, spy] });
  const pkgC = seenPackages;
  cases.push({
    id: 'external',
    variants: [
      { label: 'オプションなし', packagesOption: pkgA, ...summary(a) },
      { label: "exclude: ['cjs-pkg']", packagesOption: pkgB, ...summary(b) },
      { label: "loader: { '.txt': 'text' }", packagesOption: pkgC, resolveCalls, ...summary(c) },
    ],
  });
}

// 2. virtual-module
{
  const plugin = (entryPointOnly) =>
    createVirtualModulePlugin({
      namespace: 'angular:demo-virtual',
      entryPointOnly,
      loadContent: async (args) => ({
        contents: `import { local } from './local.js';\nexport default 'virtual:' + local + ' (' + ${JSON.stringify(args.path)} + ')';\n`,
        loader: 'js',
        resolveDir: join(work, 'src'),
      }),
    });
  const a = await run({ entryPoints: { virtual: 'angular:demo-virtual' }, plugins: [plugin(true)] });
  const b = await run({ entryPoints: ['src/virtual-user.js'], plugins: [plugin(true)] });
  const c = await run({ entryPoints: ['src/virtual-user.js'], plugins: [plugin(false)] });
  cases.push({
    id: 'virtual',
    variants: [
      { label: '入口に angular:demo-virtual', ...summary(a, { showCode: true }) },
      { label: 'ファイルから import（entryPointOnly: true）', ...summary(b) },
      { label: 'ファイルから import（entryPointOnly: false）', ...summary(c) },
    ],
  });
}

// 3. rxjs-esm-resolution
{
  const opts = { entryPoints: ['src/rx.js'], platform: 'node' };
  const a = await run({ ...opts, plugins: [] });
  const b = await run({ ...opts, plugins: [createRxjsEsmResolutionPlugin()] });
  const firstRx = (s) => {
    const list = s.inputs.filter((i) => i.includes('node_modules/rxjs/'));
    return { count: list.length, first: list.slice(0, 3) };
  };
  const sa = summary(a);
  const sb = summary(b);
  cases.push({
    id: 'rxjs',
    variants: [
      { label: 'プラグインなし（platform: node）', rxjsInputs: firstRx(sa), errors: sa.errors, warnings: sa.warnings, outputs: sa.outputs },
      { label: 'プラグインあり', rxjsInputs: firstRx(sb), errors: sb.errors, warnings: sb.warnings, outputs: sb.outputs },
    ],
  });
}

// 4. loader-import-attribute
{
  const a = await run({ entryPoints: ['src/text-ok.js'], plugins: [] });
  const b = await run({ entryPoints: ['src/text-ok.js'], plugins: [createLoaderImportAttributePlugin()] });
  const c = await run({ entryPoints: ['src/text-main.js'], plugins: [createLoaderImportAttributePlugin()] });
  cases.push({
    id: 'loader',
    variants: [
      { label: 'プラグインなし', ...summary(a, { showCode: true }) },
      { label: "with { loader: 'text' }", ...summary(b, { showCode: true }) },
      { label: "with { loader: 'css' } も混ぜる", ...summary(c) },
    ],
  });
}

// 5. wasm
{
  const opts = { entryPoints: ['src/wasm-main.js'], supported: { 'top-level-await': true } };
  const a = await run({ ...opts, plugins: [createWasmPlugin({ allowAsync: false })] });
  // 生成された初期化コードを記録する（プラグインの onLoad の戻り値を横から見る）
  const recording = (holder) => {
    const wp = createWasmPlugin({ allowAsync: true });
    return {
      name: 'record-init',
      setup(build) {
        const origOnLoad = build.onLoad.bind(build);
        build.onLoad = (o, cb) =>
          origOnLoad(o, async (args) => {
            const r = await cb(args);
            if (o.namespace === 'angular:wasm:init' && r?.contents) holder.src = hide(r.contents);
            return r;
          });
        wp.setup(build);
      },
    };
  };
  const hb = {}, hc = {}, hd = {};
  const b = await run({ ...opts, plugins: [recording(hb)] });
  const c = await run({ ...opts, entryPoints: ['src/big-main.js'], plugins: [recording(hc)] });
  const d = await run({ ...opts, entryPoints: ['src/big-main.js'], platform: 'node', plugins: [recording(hd)] });
  cases.push({
    id: 'wasm',
    variants: [
      { label: 'allowAsync: false（Zone.js のアプリ）', ...summary(a) },
      { label: 'allowAsync: true・小さい wasm（63 バイト）', initSource: hb.src, ...summary(b) },
      { label: 'allowAsync: true・大きい wasm（12,070 バイト）・browser', initSource: hc.src, ...summary(c) },
      { label: "allowAsync: true・大きい wasm・platform: 'node'", initSource: hd.src, ...summary(d) },
    ],
  });
}

// 5b. wasm の onLoad を、まだ使われていない PersistentLoadResultCache（L2 は SQLite）で包んだら
{
  const { initializeHash } = require(join(nm, '@angular/build/src/utils/hash.js'));
  await initializeHash();
  const { PersistentLoadResultCache } = P('persistent-load-result-cache.js');
  const { SqliteCacheStore } = require(join(nm, '@angular/build/src/utils/cache/sqlite-cache-store.js'));
  const dbPath = join(work, 'l2.db');
  const once = async (label) => {
    const store = new SqliteCacheStore(dbPath);
    const cache = new PersistentLoadResultCache(store.createCache('load'), 'cfg');
    const res = await run({ entryPoints: ['src/wasm-main.js'], supported: { 'top-level-await': true }, plugins: [createWasmPlugin({ allowAsync: true, cache })] });
    store.close();
    return { label, ...summary(res) };
  };
  const first = await once('1 回目（L2 は空）');
  const second = await once('2 回目（新しいインスタンス・L2 から読む）');
  cases.push({ id: 'wasm-l2', variants: [first, second] });
}

// 6. sourcemap-ignorelist
{
  const opts = { entryPoints: ['src/main.js'], sourcemap: true };
  const pickMap = (name, text) => {
    if (!name.endsWith('.map')) return '';
    const m = JSON.parse(text);
    return JSON.stringify({ sources: m.sources, x_google_ignoreList: m.x_google_ignoreList ?? '(なし)' }, null, 1);
  };
  const a = await run({ ...opts, plugins: [] });
  const b = await run({ ...opts, plugins: [createSourcemapIgnorelistPlugin()] });
  const firstBytes = b.ok ? new TextDecoder().decode(b.r.outputFiles.find((f) => f.path.endsWith('.map')).contents.slice(0, 60)) : '';
  cases.push({
    id: 'ignorelist',
    variants: [
      { label: 'プラグインなし', ...summary(a, { showCode: true, pick: pickMap }) },
      { label: 'プラグインあり', mapHead: firstBytes, ...summary(b, { showCode: true, pick: pickMap }) },
    ],
  });
}

// 7. server-bundle-metadata と localize-init-warning
{
  const a = await run({ entryPoints: ['src/local.js'], plugins: [createServerBundleMetadata()] });
  const b = await run({ entryPoints: ['src/local.js'], plugins: [createServerBundleMetadata({ ssrEntryBundle: true })] });
  const keys = (res) => Object.fromEntries(Object.entries(res.r.metafile).filter(([k]) => k.startsWith('ng-')));
  const c = await run({ entryPoints: ['src/localize.js'], plugins: [createAngularLocalizeInitWarningPlugin()] });
  cases.push({
    id: 'metadata',
    variants: [
      { label: 'createServerBundleMetadata()', metafileKeys: keys(a), ...summary(a) },
      { label: 'createServerBundleMetadata({ ssrEntryBundle: true })', metafileKeys: keys(b), ...summary(b) },
      { label: "import '@angular/localize/init'（警告のプラグイン）", ...summary(c) },
    ],
  });
}

// 8. global-scripts
{
  const options = {
    globalScripts: [
      { name: 'scripts', files: ['scripts/a.js', 'scripts/b.js'], initial: true },
      { name: 'lazy', files: ['scripts/b.js'], initial: false },
    ],
    optimizationOptions: { scripts: false },
    outputNames: { bundles: '[name]', media: 'media/[name]' },
    preserveSymlinks: false,
    sourcemapOptions: { scripts: false },
    jsonLogs: false,
    workspaceRoot: work,
    define: undefined,
    verbose: false,
  };
  const factory = createGlobalScriptsBundleOptions(options, ['es2022'], true);
  const built = factory(undefined);
  const shown = {
    entryPoints: built.entryPoints,
    bundle: built.bundle,
    platform: built.platform,
    mainFields: built.mainFields,
    conditions: built.conditions,
    plugins: built.plugins.map((p) => p.name),
  };
  const res = await esbuild.build(built).then((r) => ({ ok: true, r }), (e) => ({ ok: false, errors: e.errors.map(fmt), warnings: [] }));
  const missing = createGlobalScriptsBundleOptions(
    { ...options, globalScripts: [{ name: 'scripts', files: ['scripts/nope.js'], initial: true }] },
    ['es2022'],
    true,
  )(undefined);
  const res2 = await esbuild.build(missing).then((r) => ({ ok: true, r }), (e) => ({ ok: false, errors: e.errors.map(fmt), warnings: [] }));
  // node_modules のファイルを scripts に入れ、その metafile にライセンスの抽出を当てる
  const withPkg = createGlobalScriptsBundleOptions(
    { ...options, globalScripts: [{ name: 'scripts', files: ['scripts/a.js', 'node_modules/esm-pkg/index.js'], initial: true }] },
    ['es2022'],
    true,
  )(undefined);
  const res3 = await esbuild.build(withPkg);
  const scriptsLicense = {
    inputs: Object.keys(res3.metafile.inputs).map(hide),
    watchFiles: '(onLoad の watchFiles は metafile に出ない)',
    license: hide(await extractLicenses([res3.metafile], work)),
    contains: res3.outputFiles[0].text.includes('greet'),
  };
  cases.push({
    id: 'scripts',
    options: shown,
    lazyFactory: createGlobalScriptsBundleOptions(options, ['es2022'], false) ? 'あり' : 'なし',
    scriptsLicense,
    variants: [
      { label: "scripts: ['scripts/a.js', 'scripts/b.js']", ...summary(res, { showCode: true }) },
      { label: "scripts: ['scripts/nope.js']（存在しない）", ...summary(res2) },
    ],
  });
}

// 9. checkCommonJSModules と extractLicenses は本物の metafile に当てる
{
  const res = await run({ entryPoints: ['src/main.js'], plugins: [] });
  const mf = res.r.metafile;
  const msgs = (allowed) => checkCommonJSModules(mf, allowed).map(fmt);
  const graph = Object.fromEntries(
    Object.entries(mf.inputs).map(([k, v]) => [k, { format: v.format ?? '(なし)', imports: v.imports.map((i) => `${i.original ?? '(注入)'} → ${i.path}`) }]),
  );
  const lic = await extractLicenses([mf], work);
  cases.push({
    id: 'commonjs',
    graph,
    variants: [
      { label: 'allowedCommonJsDependencies なし', messages: msgs(undefined) },
      { label: "allowedCommonJsDependencies: ['cjs-pkg']", messages: msgs(['cjs-pkg']) },
      { label: "allowedCommonJsDependencies: ['*']", messages: msgs(['*']) },
    ],
  });
  cases.push({ id: 'licenses', text: hide(lic) });
}

console.log(hide(JSON.stringify({ esbuild: esbuild.version, cases }, null, 2)));

```

📄 `記録のスクリプト（record-scripts-license.mjs）`

```
// angular.json の scripts に node_modules/tslib/tslib.js を入れたカウンターを本番の最適化つきで ng build し、
// scripts.js に tslib が入るか・3rdpartylicenses.txt に tslib が出るかを記録する。
// 使い方: node record-scripts-license.mjs <counter-lic-dir> > scripts-license.json
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const [app] = process.argv.slice(2);
rmSync(join(app, 'dist'), { recursive: true, force: true });
execFileSync(process.execPath, [join(app, 'node_modules/@angular/cli/bin/ng.js'), 'build', '--extract-licenses', '--optimization'], {
  cwd: app, env: { ...process.env, NG_CLI_ANALYTICS: 'false' }, stdio: 'ignore',
});
const out = join(app, 'dist/demo');
const scripts = readdirSync(join(out, 'browser')).find((f) => /^scripts.*\.js$/.test(f));
const js = readFileSync(join(out, 'browser', scripts), 'utf-8');
const lic = readFileSync(join(out, '3rdpartylicenses.txt'), 'utf-8');
console.log(JSON.stringify({
  scriptsOption: JSON.parse(readFileSync(join(app, 'angular.json'), 'utf-8')).projects.demo.architect.build.options.scripts,
  scriptsFile: scripts,
  scriptsBytes: Buffer.byteLength(js),
  hasTslibCode: js.includes('__awaiter'),
  hasCopyright: /Copyright|0BSD/.test(js),
  packages: [...lic.matchAll(/^Package: (.+)$/gm)].map((m) => m[1]),
  mentionsTslib: lic.includes('tslib'),
}, null, 2));

```

## ここまでの呼び出し

- `getEsBuildCommonOptions → plugins: [loaderImportAttribute, sourcemapIgnorelist]` — application-code-bundle.ts L603-606
  - `+ createExternalPackagesPlugin(…)` — application-code-bundle.ts L617-621 — *loader か exclude があるときだけ*
- `createBrowserCodeBundleOptions / createServerMainCodeBundleOptions` — application-code-bundle.ts
  - `createWasmPlugin({ allowAsync: zoneless, cache })・createAngularLocalizeInitWarningPlugin()` — L84-85・L296-297
  - `createRxjsEsmResolutionPlugin()・createServerBundleMetadata()・createVirtualModulePlugin(…)` — L308・L323-343 — *サーバーの束*
- `createGlobalScriptsBundleOptions(options, target, initial)` — global-scripts.ts L26 — *setup-bundling.ts から*
- `esbuild の build / rebuild` — bundler-context.ts
  - `onResolve → onLoad → onEnd（ignorelist・server-bundle-metadata）`
- `checkCommonJSModules(browserMetafile, allowed)` — execute-build.ts L325 — *optimization.scripts のとき*
- `extractLicenses(metafiles, workspaceRoot)` — execute-build.ts L338 — *3rdpartylicenses.txt*

## テストと直し方

この章のファイルには、tools/esbuild の下の単体の spec が 1 つもありません。固めているのは builders/application/tests の、builder を丸ごと動かす spec です。

| spec（builders/application/tests/） | describe / it と行 | この章のどこ |
| --- | --- | --- |
| behavior/loader-import-attribute\_spec.ts | describe Behavior: "loader import attribute"（13 行目、9 件）。text（20 行目）・binary（36 行目）・base64（54 行目）・dataurl（72 行目）・file（89 行目）、不正な値のエラー（159 行目） | 4 節 |
| behavior/wasm-esm\_spec.ts | describe Behavior: "Supports WASM/ES module integration"（54 行目、7 件）。初期化のコード（55 行目）、import の解決（112・153 行目）、10kB 未満は埋める（190 行目）、壊れた wasm（216 行目）、Zone.js でエラー（244 行目） | 5 節。platform: 'node' の readFile の枝と、export の名前のエラーの it はありません |
| options/allowed-common-js-dependencies\_spec.ts | describe Option: "allowedCommonJsDependencies"（19 行目、AOT / JIT の 2 件を含め 8 件）。子の CommonJS に警告しない（22 行目の it の 41〜45 行目）、'\*'（70 行目）、zone.js（91 行目）、相対の import（158 行目） | 9 節 |
| options/extract-licenses\_spec.ts | describe Option: "extractLicenses"（13 行目、7 件）。小文字の license（59 行目）、MIT-LICENCE.txt（88 行目）、SEE LICENSE IN（120 行目） | 10 節。scripts に入れたパッケージの it はありません |
| options/scripts\_spec.ts | describe Option: "scripts"（13 行目、20 件）。順番を保つ（90・282 行目）、無いファイルのエラー（117 行目） | 8 節 |
| options/external-dependencies\_spec.ts | describe Option: "externalDependencies"（13 行目、4 件） | 1 節の 94〜96 行目の手前（esbuild の external）。プラグインの onResolve の道は dev-server の spec 側です |
| options/sourcemap\_spec.ts | describe Option: "sourceMap"（13 行目、19 の it と 324 行目の 3 つの拡張子の繰り返しで 21 件） | 6 節 |

走らせたのは ../angular-cli で `pnpm bazel test //packages/angular/build:application_integration_tests --nocache_test_results --test_output=all "--test_arg=--filter=(Option: .extractLicenses.|Option: .allowedCommonJsDependencies.|Behavior: .loader import attribute.|Behavior: .Supports WASM/ES module integration.|Option: .scripts.|Option: .externalDependencies.|Option: .sourceMap.)"` です。target は BUILD.bazel の `jasmine_test(name = "application_integration_tests", shard_count = 25, flaky = True)` で、describe の名前は setup の `describeBuilder` が「(Suite: N)」を前に付けるので、頭の `^` を付けずに絞りました。25 の shard の「Ran N」を足して 76 件、0 failures、PASSED（14.2 秒）でした。上の表の件数（9 + 7 + 8 + 7 + 20 + 4 + 21）と同じです。

直すとしたら、ファイルと関数は次のとおりです。

- scripts のライセンス：`global-scripts.ts` の onLoad（92〜137 行目）が読んだ node\_modules のファイルは `watchFiles` には入りますが、metafile には出ません。`extractLicenses` の引数に scripts の束の `watchFiles` を足すか、scripts の束を作る所で読んだパスを別に返すかのどちらかです。it は options/extract-licenses\_spec.ts に、`scripts: ['node_modules/…']` を足して 3rdpartylicenses.txt にそのパッケージが出ることを確かめる形で書けます。
- wasm の pluginData：`wasm-plugin.ts` の 199 行目を `args.pluginData?.wasmContents` にすれば、pluginData が無くても 199 行目の `readFile` の道で読めます。resolveDir の側は [前の章](04-abl-cache.md)の `PersistentLoadResultCache` が持ち越す形にする話です。

## 聞かれそうな質問

**Q. angular.json に loader を足したら ng serve が遅くなりました。**

`file` 以外の loader（text など）があると、1 節 43 行目の近道（esbuild の `packages = 'external'`）を使えず、52 行目の onResolve がパッケージ名の import ごとに 80 行目の `build.resolve` を呼びます。開いている issue #27116 がこの遅さの報告です。`file` だけなら 39 行目で除かれるので近道のままです。

**Q. CommonJS の警告が出たパッケージの、依存の警告が出ないのはなぜですか？**

9 節 123 行目で、警告を出したモジュールの子は列に足さないからです。親を ESM に替えれば子も外れることが多いので、手を打てない警告を並べない作りです（122 行目のコメント）。deep import は 109〜110 行目で、許した名前に `/` を足した接頭辞で許します。

**Q. .wasm を import したら「not supported with Zone.js applications」と出ました。**

5 節 101〜105 行目です。初期化のコードが top-level await を使うので、`allowAsync`（zoneless のときだけ真）が偽だとエラーにします。zoneless にするか、`loader` で .wasm の読み方を決めれば（71 行目で手を引く）通ります。

**Q. DevTools で node\_modules の中にステップインしないのはなぜですか？**

6 節のプラグインが、出力の .map に `x_google_ignoreList` を書くからです。164〜166 行目で `node_modules/` を含む元ファイルの番号を集め、174 行目で .map の先頭に差し込みます。ソースマップを作らない設定なら 131〜132 行目で何もしません。

**Q. 3rdpartylicenses.txt には何が入りますか？**

出力に 1 バイト以上入った node\_modules のパッケージごとに、package.json の name と license、それに LICENSE のファイル（35 行目の正規表現）か SEE LICENSE IN のファイルの中身です（10 節）。metafile の入力のパスから探すので、scripts に入れたパッケージは入りません（10 節の警告の箱）。

## 読み終えて

- 小さなプラグインは「filter で拾い、null や undefined で譲り、拾ったら結果を返す」。再入は pluginData の Symbol で防ぐ（external・rxjs・wasm・localize）。
- external-packages は loader と exclude が無ければ esbuild の packages: 'external' に任せ、あれば import ごとに build.resolve する。
- wasm は init と contents の 2 つの名前空間で、10kB 未満は埋め、ブラウザは integrity つきの fetch、Node は readFile。resolveDir と pluginData に頼る。
- ignorelist は sources の配列だけを切り出して x\_google\_ignoreList を先頭に差し込む。scripts は束ねずに magic-string でつなぐ。
- CommonJS の警告とライセンスは、束ねたあとの metafile を読む。だから metafile に出ない scripts の中身はライセンスの対象から漏れる。

---

← 前: [ディスクに残るキャッシュ：Cache・NamespacedCacheStore・SQLite と LMDB・読み込み結果のキャッシュ](04-abl-cache.md)  
次: [spec と issue を読む：application builder の読み残しを固めているテスト](06-abl-tests-issues.md) →
