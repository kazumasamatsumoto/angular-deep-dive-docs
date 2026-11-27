[目次](../README.md) › [@angular/build の読み残し（sass・i18n・dev-server・unit-test）](README.md) › 第 2 回 / 全 9 回

# sass を常駐のコンパイラで動かす：sass-service

> tools/sass/sass-service.ts：ワーカーのプールに代わった SassCompiler が sass-embedded（または JavaScript 版）のコンパイラを 1 つだけ作って使い回す仕組み、rebase のときに importer を包み直してロードパスを Sass に渡さない理由、ソースマップのつなぎ方、close と同じ瞬間の compile、pkg: に containingUrl が渡らないこと。

angular/angular-cli · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bld-sass-service)

---

この章で分かること：angular のビルドが Sass をどこで動かしているか。いまの `SassCompiler` は、ワーカーのプールではなく、常駐の Dart Sass のコンパイラ（sass-embedded。別のプロセスで動く）を 1 つだけ作って使い回します。そのコンパイラに、前の回の書き換えの importer をどう包んで渡すか、ソースマップをどうつなぐか、`close` で何が起きるか。そして、包み直すことで Sass から渡らなくなる情報が 1 つあることを、本物を動かして確かめます。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/src/tools/sass/sass-service.ts` の残りと、webpack の側で同じクラスを使う `packages/angular_devkit/build_angular/src/tools/webpack/configs/styles.ts` の 2 か所です。クラスの頭（40〜62 行目。sass-embedded と JavaScript 版の選び方）と、esbuild の側から呼ぶ `sass-language.ts` は [esb-styles の章](../esb/05-esb-styles.md)の 5 節で読んだので繰り返しません。

1. [1. sass の url を書き換える](01-bld-sass-rebase.md)
2. **2. sass を常駐のコンパイラで動かす**（この章）
3. [3. メッセージを取り出す](03-bld-extract-i18n.md)
4. [4. 翻訳を差し込む](04-bld-i18n-inline.md)
5. [5. チャンクを束ね直す](05-bld-chunk-optimizer.md)
6. [6. ng serve の入口の残り](06-bld-dev-server-rest.md)
7. [7. Vite の middleware の残り](07-bld-vite-middlewares.md)
8. [8. unit-test と ng-packagr](08-bld-unit-test-packagr.md)
9. [9. spec と issue](09-bld-tests-issues.md)

> [!WARNING]
> **ハマりどころ**
>
> この章の題が「ワーカー」でなく「常駐のコンパイラ」なのは、44129f66a3 の `tools/sass/` にワーカーのファイルが無いからです。Piscina のワーカーで JavaScript 版の Sass を同期で回し、importer の呼び出しを `MessageChannel` と `Atomics.wait` でメインのスレッドに戻していた形は、ecbcd87b88（2026-08-26、sass-embedded の常駐のコンパイラに切り替え）と fc5a2ecb14（2026-08-27、`sass-worker-implementation.ts` と `worker.ts` を消す）で無くなりました。環境変数も `NG_BUILD_SASS_WORKER` から `NG_BUILD_SASS_EMBEDDED` に変わっています。この章は、いまの形を読みます。サイトの 22.2.7 の dist も同じ形で、v22.2.7 のタグと 44129f66a3 で `sass-service.ts` に違いはありません。

## 0. 全体の流れ

1. **作るのは 1 つ**

   `sass-language.ts` は、最初の Sass のファイルが来たときに `new SassCompiler(true)` を 1 つ作り、ビルドをまたいで持つ（esb-styles の章の 96〜97 行目）。webpack の側は `new SassCompiler(false)`（7 節）。
2. **コンパイラは要るときに 1 回だけ**

   最初の `compileStringAsync` で sass-embedded（または JavaScript 版）の `initAsyncCompiler` を呼び、以後は使い回す（2 節）。
3. **rebase のときは importer を包み直す**

   渡された FileImporter を前の回の 3 つの importer で包み、url の書き換えを必ず通す（3〜4 節）。
4. **ソースマップをつなぐ**

   書き換えた部分ファイルの中間のソースマップを、Sass のソースマップに重ねる（5 節）。
5. **close で子プロセスを止める**

   表を捨て、作りかけのコンパイラを待ってから `dispose` する（6 節）。

## 1. import と、受け付ける importer の型

📄 `angular-cli/packages/angular/build/src/tools/sass/sass-service.ts` L9–39 （▶ の行: 9, 12, 20–21, 23–26, 29, 34, 36–37）

```ts
 9 ▶ import mergeSourceMaps, { type DecodedSourceMap, type RawSourceMap } from '@ampproject/remapping';
10 │ import { dirname } from 'node:path';
11 │ import { fileURLToPath } from 'node:url';
12 ▶ import type {
13 │   AsyncCompiler,
14 │   CanonicalizeContext,
15 │   CompileResult,
16 │   FileImporter,
17 │   Importer,
18 │   NodePackageImporter,
19 │   StringOptions,
20 ▶ } from 'sass-embedded';
21 ▶ import { useSassEmbedded } from '../../utils/environment-options';
22 │ import {
23 ▶   AsyncModuleUrlRebasingImporter,
24 ▶   DirectoryEntry,
25 ▶   LoadPathsUrlRebasingImporter,
26 ▶   RelativeUrlRebasingImporter,
27 │ } from './rebasing-importer';
28 │ 
29 ▶ type Importers =
30 │   | Importer<'sync'>
31 │   | Importer<'async'>
32 │   | FileImporter<'sync'>
33 │   | FileImporter<'async'>
34 ▶   | NodePackageImporter;
35 │ 
36 ▶ function isFileImporter(value: Importers): value is FileImporter {
37 ▶   return 'findFileUrl' in value;
38 │ }
39 │ 
```

12〜20 行目は `import type` なので、このファイルを読んでも sass-embedded は読まれません（実物は 2 節の `#createAsyncCompiler` が `import()` で読む）。9 行目の `@ampproject/remapping` は 5 節でソースマップを重ねるのに使います。23〜26 行目が前の回の 3 つの importer と、フォルダの表の型です。29〜34 行目、Sass の importer には 2 つの種類があります。`canonicalize` と `load` を持つ `Importer`（URL を決めて中身も返す）と、`findFileUrl` だけを持つ `FileImporter`（ファイルの場所だけを返し、読むのは Sass）です。36〜38 行目は後者かどうかを `findFileUrl` の有無で見分けます。

## 2. コンパイラを 1 つだけ作る：#ensureAsyncCompiler

📄 `angular-cli/packages/angular/build/src/tools/sass/sass-service.ts` L63–93 （▶ の行: 64–66, 69, 71–74, 77, 84–85, 91–92）

```ts
63 │ 
64 ▶   async #ensureAsyncCompiler(): Promise<AsyncCompiler> {
65 ▶     if (this.#asyncCompiler) {
66 ▶       return this.#asyncCompiler;
67 │     }
68 │ 
69 ▶     this.#asyncCompilerPromise ??= this.#createAsyncCompiler();
70 │ 
71 ▶     try {
72 ▶       this.#asyncCompiler = await this.#asyncCompilerPromise;
73 ▶     } finally {
74 ▶       this.#asyncCompilerPromise = undefined;
75 │     }
76 │ 
77 ▶     return this.#asyncCompiler;
78 │   }
79 │ 
80 │   /**
81 │    * Provides information about the Sass implementation.
82 │    * This mimics enough of the `sass-embedded` or `sass` value to be used with the `sass-loader`.
83 │    */
84 ▶   get info(): string {
85 ▶     return useSassEmbedded ? 'sass-embedded\tasync-compiler' : 'dart-sass\tasync-compiler';
86 │   }
87 │ 
88 │   /**
89 │    * The synchronous render function is not used by the `sass-loader`.
90 │    */
91 ▶   compileString(): never {
92 ▶     throw new Error('Sass compileString is not supported.');
93 │   }
```

1. **65〜67 行目：あればそれ**

   作り終えたコンパイラは `#asyncCompiler` に入っている。
2. **69 行目：作りかけの promise を分け合う**

   `??=` で、まだ作っていないときだけ `#createAsyncCompiler`（esb-styles の章の 52〜62 行目）を呼ぶ。同時に 8 本の `compileStringAsync` が来ても、同じ promise を待つ（デモの「子プロセスの数」で、立った sass-embedded のプロセスは 1 つ）。
3. **71〜75 行目：待ち終えたら promise を捨てる**

   成功しても失敗しても `finally` で消すので、失敗したら次の呼び出しでもう一度作り直す。
4. **84〜86 行目：info**

   sass-loader（webpack）が実装の名前を読むための値。`sass-embedded\tasync-compiler` か `dart-sass\tasync-compiler`。
5. **91〜93 行目：同期の compileString は投げる**

   89 行目のコメントのとおり、sass-loader は使わない。

## 3. compileStringAsync：rebase しないときと、するときの前半

📄 `angular-cli/packages/angular/build/src/tools/sass/sass-service.ts` L94–130 （▶ の行: 102, 107–108, 111, 113–114, 117, 119, 121–124, 126–128）

```ts
 94 │ 
 95 │   /**
 96 │    * Asynchronously request a Sass stylesheet to be rendered using the native embedded compiler
 97 │    * or the pure-JS async compiler fallback.
 98 │    *
 99 │    * @param source The contents to compile.
100 │    * @param options The `sass` / `sass-embedded` options to use when rendering the stylesheet.
101 │    */
102 ▶   async compileStringAsync(
103 │     source: string,
104 │     options: StringOptions<'async'>,
105 │   ): Promise<CompileResult> {
106 │     // The CLI's configuration does not use or expose the ability to define custom Sass functions
107 ▶     if (options.functions && Object.keys(options.functions).length > 0) {
108 ▶       throw new Error('Sass custom functions are not supported.');
109 │     }
110 │ 
111 ▶     const compiler = await this.#ensureAsyncCompiler();
112 │ 
113 ▶     if (!this.rebase) {
114 ▶       return compiler.compileStringAsync(source, options);
115 │     }
116 │ 
117 ▶     const { functions, importers, importer, url, logger, ...serializableOptions } = options;
118 │ 
119 ▶     let finalImporters:
120 │       (Importer<'async'> | FileImporter<'async'> | NodePackageImporter)[] | undefined;
121 ▶     let loadPaths = options.loadPaths;
122 ▶     const entryDirectory = url ? dirname(fileURLToPath(url)) : process.cwd();
123 ▶     const directoryCache = this.#directoryCache;
124 ▶     const rebaseSourceMaps = options.sourceMap ? new Map<string, DecodedSourceMap>() : undefined;
125 │ 
126 ▶     if (importers?.length) {
127 ▶       if (importers.some((i) => !isFileImporter(i))) {
128 ▶         throw new Error('Only File Importers are supported.');
129 │       }
130 │ 
```

106〜109 行目、Sass の関数（`functions`）を 1 つでも渡すと投げます。CLI の設定に関数を足す口が無いからです（106 行目のコメント）。113〜115 行目、`rebase` が偽（webpack）なら、渡された設定をそのままコンパイラに渡して終わりです。

rebase のときは 117 行目で、Sass に渡し直す設定から `functions`・`importers`・`importer`・`url`・`logger` を外します（117 行目の変数名 `serializableOptions` は、ワーカーに送れる値という、消えた形の頃の名残です）。122 行目、書き換えの基準になる入口のフォルダは `url` から、無ければ `process.cwd()`。123 行目のフォルダの表は、クラスの頭（esb-styles の章で引いた 48 行目）で作った 1 つを、このインスタンスの全部のコンパイルで分け合います（0a137f98d0）。124 行目、ソースマップが要るときだけ中間のソースマップの表を作ります。126〜129 行目、`importers` に FileImporter でないもの（`canonicalize` と `load` を持つ importer）が 1 つでもあると「Only File Importers are supported.」です。rebase が偽ならこの検査は通らないので、同じ importer がそのまま使えます（デモの「エラーと受け付けない入力」）。

## 4. importer を包み直す：パッケージ・ロードパス・相対

📄 `angular-cli/packages/angular/build/src/tools/sass/sass-service.ts` L131–170 （▶ の行: 131–138, 142, 147, 153, 155–156, 160, 163, 166）

```ts
131 ▶       finalImporters = [
132 ▶         new AsyncModuleUrlRebasingImporter(
133 ▶           entryDirectory,
134 ▶           directoryCache,
135 ▶           rebaseSourceMaps,
136 ▶           async (specifier: string, options: CanonicalizeContext): Promise<URL | null> => {
137 ▶             for (const importer of importers) {
138 ▶               const result = await (importer as FileImporter<'async'>).findFileUrl(
139 │                 specifier,
140 │                 options,
141 │               );
142 ▶               if (result) {
143 │                 return result;
144 │               }
145 │             }
146 │ 
147 ▶             return null;
148 │           },
149 │         ),
150 │       ];
151 │     }
152 │ 
153 ▶     if (loadPaths?.length) {
154 │       finalImporters ??= [];
155 ▶       finalImporters.push(
156 ▶         new LoadPathsUrlRebasingImporter(
157 │           entryDirectory,
158 │           directoryCache,
159 │           rebaseSourceMaps,
160 ▶           loadPaths,
161 │         ),
162 │       );
163 ▶       loadPaths = undefined;
164 │     }
165 │ 
166 ▶     const relativeImporter = new RelativeUrlRebasingImporter(
167 │       entryDirectory,
168 │       directoryCache,
169 │       rebaseSourceMaps,
170 │     );
```

1. **131〜150 行目：FileImporter を 1 つの Importer に**

   渡された FileImporter（esbuild の側では、esbuild の解決を呼ぶ 1 つ）を順に試す関数を `finder` にして、前の回の `AsyncModuleUrlRebasingImporter` に渡す。見つかった URL は前の回の 5 節の `canonicalize` にかけ直され、読むのは書き換えの `load`。
2. **153〜164 行目：ロードパスは importer にして、Sass には渡さない**

   `LoadPathsUrlRebasingImporter` を足し、163 行目で `loadPaths` を消す。Sass がロードパスを自分で探すと、そのファイルは書き換えの `load` を通らないから。
3. **166〜170 行目：相対の importer**

   入口からの相対（`@use 'partials/buttons'`）を受ける `RelativeUrlRebasingImporter`。次の 177 行目で、複数形の `importers` でなく単数の `importer`（入口のファイルを読んだ importer として扱われるもの）に置く。

Sass は相対の URL を、まず「その部分ファイルを読んだ importer」に、入口の URL に対する `file:` の URL にして聞きます。だから前の回の 3 つのクラスは、どれも `url.startsWith('file://')` を先に見ます（前の回の 348・378 行目）。相対で見つからなければ、`importers` の 2 つに元の名前で聞きます。

## 5. 呼び出しとソースマップ、表を捨てる

📄 `angular-cli/packages/angular/build/src/tools/sass/sass-service.ts` L171–196 （▶ の行: 172–178, 181–182, 184, 194–195）

```ts
171 │ 
172 ▶     const result = await compiler.compileStringAsync(source, {
173 ▶       ...serializableOptions,
174 ▶       url,
175 ▶       loadPaths,
176 ▶       importers: finalImporters,
177 ▶       importer: relativeImporter,
178 ▶       logger,
179 │     });
180 │ 
181 ▶     if (result.sourceMap && rebaseSourceMaps?.size) {
182 ▶       result.sourceMap = mergeSourceMaps(
183 │         result.sourceMap as unknown as RawSourceMap,
184 ▶         (file, context) => (file !== context.importer ? rebaseSourceMaps.get(file) : null),
185 │       ) as unknown as typeof result.sourceMap;
186 │     }
187 │ 
188 │     return result;
189 │   }
190 │ 
191 │   /**
192 │    * Clear the directory cache.
193 │    */
194 ▶   clearCache(): void {
195 ▶     this.#directoryCache.clear();
196 │   }
```

172〜179 行目で、外した 5 つのうち `url` と `logger` は元のまま、`importers` と `importer` は包み直したもの、`loadPaths` は消したもの（ロードパスがあったとき）を渡します。`logger` は元のままなので、`@warn` と `@debug` は sass-embedded の子プロセスから、呼んだ側の `warn`・`debug` に直接届きます（デモ。`@warn` には位置が付かず、`@debug` には付く）。

181〜186 行目、Sass のソースマップに、前の回の 105 行目で覚えた中間のソースマップを重ねます。184 行目、`remapping` が「このファイルの元は？」と聞くたびに、書き換えた部分ファイルならその中間のマップを返し、`file === context.importer`（同じファイルに戻る）なら null で止めます。これで、書き換えた後の列ではなく、書いたときの列が出ます。194〜196 行目の `clearCache` は 123 行目の表を空にするだけで、ng serve の再ビルドのたびに呼ばれます（esb-styles の章の `resetSassWorkerPoolCaches`）。

## 6. close と、同じ瞬間に来た compile

📄 `angular-cli/packages/angular/build/src/tools/sass/sass-service.ts` L197–219 （▶ の行: 202–203, 205–207, 209, 213–216）

```ts
197 │ 
198 │   /**
199 │    * Shutdown the Sass compiler.
200 │    * @returns A void promise that resolves when closing is complete.
201 │    */
202 ▶   async close(): Promise<void> {
203 ▶     this.clearCache();
204 │ 
205 ▶     if (this.#asyncCompilerPromise) {
206 ▶       try {
207 ▶         await this.#ensureAsyncCompiler();
208 │       } catch {
209 ▶         // Ignore compiler initialization failures on shutdown
210 │       }
211 │     }
212 │ 
213 ▶     if (this.#asyncCompiler) {
214 ▶       const compiler = this.#asyncCompiler;
215 ▶       this.#asyncCompiler = undefined;
216 ▶       await compiler.dispose();
217 │     }
218 │   }
219 │ }
```

205〜211 行目、作りかけのコンパイラがあれば、それを待ってから止めます。待たないと、止めた後に子プロセスが立ってしまうからです。213〜217 行目、`#asyncCompiler` を先に空にしてから `dispose` します。sass-embedded の `dispose` は、走っているコンパイルを待ってから標準入力を閉じます。だから「compile A を投げてすぐ close」でも A は成功します（デモ）。close の後にもう一度 compile すると、新しい子プロセスが立ちます（デモ。pid が変わる）。

> [!WARNING]
> **ハマりどころ**
>
> compile A → close → compile B を同じ瞬間に呼ぶと、B が「Compiler caused error: Async compiler has already been disposed.」で落ちました（JavaScript 版では「Compiler has already been disposed.」）。その次の compile は、新しいコンパイラで成功します。
>
> 1. **A：69 行目**
>
>    作りかけの promise を作り、72 行目で待つ。
> 2. **close：205〜207 行目**
>
>    promise があるので `#ensureAsyncCompiler` で同じ promise を待つ。
> 3. **B：65・69 行目**
>
>    まだ `#asyncCompiler` が無く promise があるので、同じ promise を待つ。待つ順は A・close・B。
> 4. **promise が解けた後**
>
>    A は 111 行目の先へ進み、コンパイルを始める。close は 213〜216 行目で `#asyncCompiler` を空にし、`dispose` で「止めた」印を付ける。B は 111 行目で受け取ったコンパイラ（止めた印の付いたもの）の `compileStringAsync` を呼び、投げられる。
>
> 44129f66a3 と新しい本家（1e4b0960d8）で同じ行です。ふつうのビルドでは、`close` を呼ぶのはビルドの終わり（esb-styles の章の `shutdownSassWorkerPool`）で、その後は新しい `SassCompiler` を作るので、表に出にくい組み合わせです。

## 7. webpack の側：rebase しない使い方

📄 `angular-cli/packages/angular_devkit/build_angular/src/tools/webpack/configs/styles.ts` L69–80 （▶ の行: 69, 73–74, 76–77）

```ts
69 ▶   const sassImplementation = new SassCompiler(false);
70 │ 
71 │   extraPlugins.push({
72 │     apply(compiler) {
73 ▶       compiler.hooks.thisCompilation.tap('sass-service', () => {
74 ▶         sassImplementation.clearCache();
75 │       });
76 ▶       compiler.hooks.shutdown.tap('sass-service', () => {
77 ▶         void sassImplementation.close();
78 │       });
79 │     },
80 │   });
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/tools/webpack/configs/styles.ts` L336–352 （▶ の行: 338, 346–347, 350, 352）

```ts
336 │ function getSassLoaderOptions(
337 │   root: string,
338 ▶   implementation: SassCompiler,
339 │   includePaths: string[],
340 │   indentedSyntax: boolean,
341 │   verbose: boolean,
342 │   preserveSymlinks: boolean,
343 │ ): Record<string, unknown> {
344 │   return {
345 │     sourceMap: true,
346 ▶     api: 'modern',
347 ▶     implementation,
348 │     // Webpack importer is only implemented in the legacy API and we have our own custom Webpack importer.
349 │     // See: https://github.com/webpack-contrib/sass-loader/blob/997f3eb41d86dd00d5fa49c395a1aeb41573108c/src/utils.js#L642-L651
350 ▶     webpackImporter: false,
351 │     sassOptions: (loaderContext: LoaderContext<{}>) => ({
352 ▶       importers: [getSassResolutionImporter(loaderContext, root, preserveSymlinks)],
```

webpack の builder（`@angular-devkit/build-angular:browser` など）は、`@angular/build/private` から `SassCompiler` を読み、69 行目で `rebase` を偽にして作ります。url の書き換えは webpack の側の別の仕組みが受け持つからです。73〜75 行目、コンパイルのたびに表を捨て、76〜78 行目、webpack が止まるときに `close` します。346〜347 行目、sass-loader には modern の API で、実装としてこのインスタンスを渡します。sass-loader が読むのは `compileStringAsync` と 2 節の `info` です。

## 8. デモ：SassCompiler を Node から呼ぶ

> **🧪 DEMO — 22.2.7 の SassCompiler を直接呼んだ記録**
>
> `entry.scss` という名前の文字列（`@use 'tools'`・`@use 'pkg:fake/theme'`・`@warn`・`@debug`）を、FileImporter を 1 つ渡してコンパイルしました。importer はどちらの名前にも `lib/tools` を返します。子プロセスの数は `ps` で、このスクリプトの子を数えたものです。
>
> info：`sass-embedded async-compiler`
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bld-sass-service)

## 9. 包み直すと pkg: の containingUrl が渡らない

デモの「importer と logger」の `findFileUrl に来たもの` を見比べると、`rebase=false` では `pkg:fake/theme` にも containingUrl（その `@use` を書いたファイル）が付きますが、`rebase=true` では null です。sass-embedded の型の説明（`dist/types/importer.d.ts` の `CanonicalizeContext.containingUrl`）のとおり、Sass は `canonicalize` を持つ importer には、URL が相対のとき（`tools` や `pb` もこれ）か、その importer が `nonCanonicalScheme` に挙げたスキームのときだけ containingUrl を渡します。FileImporter にはいつも渡します。`pkg:` はスキームの付いた URL です。131〜150 行目で FileImporter を `AsyncModuleUrlRebasingImporter`（`canonicalize` を持つ側）に包んだので、この規則に当たります。

esbuild の側の FileImporter は、containingUrl が無いと解決の起点を `absWorkingDir`（ワークスペースの根）にします（cli-component-styles の章で引いた `sass-language.ts` の 53〜57 行目）。その結果、デモの「入れ子のパッケージ」のとおり、`node_modules/pa` の中の `@use 'pkg:pb'` は、pa の入れ子の pb 2.0.0 ではなく最上位の pb 1.0.0 になりました。Sass 自身の `NodePackageImporter` は入れ子の 2.0.0 を選びます。`pkg:` を付けない `@use 'pb'` なら、22.2.7 は入れ子の 2.0.0 を選びます（esb-styles の章で読んだ「囲んでいるパッケージごとに覚える」直し、ed52db253f / 040bc21ec3。こちらは containingUrl が渡る）。新しい本家（1e4b0960d8）の `getPackageScope` も containingUrl から起点を決めるので、`pkg:` の側は同じ結果になる形です。gh で「pkg: sass」を探すと、`pkg:` に対応した要望の #29854（閉じている）は出ますが、入れ子のパッケージを取り違える件は見つかりませんでした。

## 呼び出しの連なり

- `sass-language の compileString → new SassCompiler(true)` — sass-language.ts L96〜97
  - `SassCompiler.compileStringAsync(data, options)` — sass-service.ts L102
    - `#ensureAsyncCompiler → #createAsyncCompiler → initAsyncCompiler()` — L64、L52（esb-styles の章） — *1 回だけ。子プロセスが立つ*
    - `new AsyncModuleUrlRebasingImporter(…, finder) / LoadPaths… / Relative…` — L131〜170
    - `compiler.compileStringAsync(source, { importers, importer, logger })` — L172
      - `importer.canonicalize / load（前の回）、logger.warn / debug（呼んだ側）` — rebasing-importer.ts L148、L54
    - `mergeSourceMaps(result.sourceMap, …)` — L181〜186
  - `shutdownSassWorkerPool → close → dispose` — L202、sass-language.ts L36

## テストと直し方

44129f66a3 に `sass-service.ts` を直接呼ぶ spec はありません（`tools/sass/` の spec は `lexer_spec.ts` だけ）。builder を丸ごと動かす次の 2 つが、Sass のコンパイルを通して間接に固めています。

| spec | describe / it と行 | この章のどこ |
| --- | --- | --- |
| builders/application/tests/options/inline-style-language\_spec.ts | describe Option: "inlineStyleLanguage"（14 行目）、scss・sass・less・watch の 4 件を AOT / JIT で 8 件 | 3〜5 節を通る |
| builders/application/tests/options/style-preprocessor-options-sass\_spec.ts | describe Option: "stylePreprocessorOptions.sass"（13 行目、it 3 件） | 5 節の 173 行目の設定 |

../angular-cli で `pnpm bazel test //packages/angular/build:application_integration_tests --nocache_test_results --test_output=all` に、この 2 つと前の回の url の describe・第 4 回の i18nMissingTranslation の filter を付けて走らせ、25 の shard の「Ran N」の和が 33 件（16 + 6 + 8 + 3）、0 failures、PASSED（12.7 秒）でした。新しい本家には `tools/esbuild/stylesheets/sass-language_spec.ts` があり（d97c8857c1 で足された）、47c328d3ef がそこに ZoneAwarePromise の下での importer の it を足しています。

直すなら：

- 同じ瞬間の close（6 節）：`close` の始めで「世代」の数を 1 つ進め、`#ensureAsyncCompiler` は待ち終えたときに自分の世代が古ければ 72 行目の代入をせず、作り直す。spec は `tools/sass/sass-service_spec.ts` を新しく作り、A・close・B を同じ瞬間に呼んで B が成功し、最後に子プロセスが残らないことを確かめる。

  練習用の作業木（44129f66a3）で、`tools/sass/sass-service_spec.ts` を作り、describe SassCompiler に「close を待っている間に来た compile も成功する」it を 1 件置くと、「Compiler caused error: Async compiler has already been disposed.」で落ちました。48 行目（クラスの頭）の後に `#generation` を足し、`close` の頭で 1 つ進めて作りかけの promise と作ったものを手放し（自分で待って `dispose`）、`#ensureAsyncCompiler` は待ち終えたときに世代が変わっていれば作り直し、74 行目の `finally` は自分の promise のときだけ消す形にすると、この it が通りました。unit の全部（4 shard）と、Sass を通る builder の spec 32 件も 0 failures でした。作業木は試したあとに消しました。
- pkg: の containingUrl（9 節）：131〜150 行目の `AsyncModuleUrlRebasingImporter` に `nonCanonicalScheme: 'pkg'` を持たせると、Sass は containingUrl を渡します。ただしそのときは `canonicalize` の返す URL が `pkg:` であってはならない等の規則が付くので、sass-language\_spec.ts（新しい本家）に入れ子の node\_modules の it を足して、1-top / 2-nested の結果と一緒に確かめます。

## 聞かれそうな質問

**Q. Sass のファイルが 100 個あると、Sass のプロセスは何個立ちますか？**

1 個です。69 行目で作りかけの promise を分け合い、65 行目で作ったものを使い回します。デモの同時 8 本でも子プロセスは 1 つでした。並べて処理するのは sass-embedded の Dart の側です。

**Q. sass-embedded と JavaScript 版の sass は、どう切り替わりますか？**

既定は sass-embedded で、`NG_BUILD_SASS_EMBEDDED=0`（または false）か WebContainer の中なら JavaScript 版です（esb-styles の章の 53〜61 行目）。JavaScript 版は同じプロセスで動くので、デモでは子プロセスが 0 個でした。エラーの `sassStack` のパスは、sass-embedded では絶対、JavaScript 版では作業フォルダからの相対でした。

**Q. `stylePreprocessorOptions.includePaths` は、Sass のロードパスとして渡りますか？**

esbuild の側では渡りません。153〜164 行目で `LoadPathsUrlRebasingImporter` にして、163 行目で `loadPaths` を消します。Sass に探させると、そのファイルの url() が書き換わらないからです。webpack の側（rebase が偽）では Sass の `loadPaths` のままです。

**Q. `@warn` の警告は、どこを通って ng build の出力に出ますか？**

177 行目の `logger` は呼んだ側のもののままなので、sass-embedded の子プロセスから直接 `sass-language.ts` の logger に届き、esbuild の警告の形に直されます（esb-styles の章の 5 節）。`@warn` には span が付かないので（デモ）、位置はスタックの文字列から出ます。

**Q. Sass の関数（`functions`）を使えますか？**

使えません。107〜109 行目で「Sass custom functions are not supported.」を投げます。angular.json にも関数を渡す口がありません。

## 読み終えて

- Sass のワーカーのプールは 2026-08 に消え、いまは `SassCompiler` が sass-embedded の常駐のコンパイラ（または JavaScript 版）を 1 つだけ作って使い回す。
- rebase のときは、FileImporter・ロードパス・相対の 3 つを前の回の書き換えの importer に包み直し、ロードパスは Sass に渡さない。
- 書き換えた部分ファイルの中間のソースマップを、最後に Sass のソースマップに重ねる。
- close は作りかけを待ってから止めるが、同じ瞬間に来た compile は止めたコンパイラを受け取って落ちる。
- 包み直したことで、`pkg:` の URL に containingUrl が渡らず、入れ子の node\_modules のパッケージを取り違える。

---

← 前: [sass の url を書き換える：lexer と rebasing-importer](01-bld-sass-rebase.md)  
次: [メッセージを取り出す：extract-i18n の builder](03-bld-extract-i18n.md) →
