[目次](../README.md) › [tools/esbuild の読み残し：束ね方の設定・JS の後処理・watch・i18n の差し込み・スタイル・コンパイラプラグインの残りを行で埋める](README.md) › 第 2 回 / 全 7 回

# JavaScriptTransformer：esbuild に渡す前の JS をワーカーで書き換える

> tools/esbuild/javascript-transformer.ts と javascript-transformer-worker.ts の未読の行：最適化の候補の Buffer の見分け、TransformOptions、同時に走らせる数のセマフォ、キャッシュへの書き込みと close、ワーカー側の依存の遅延読み込み・カバレッジの計装・ソースマップのコメントの切り落としと、何も変わらなかったときに元のバイト列を返す道。

angular/angular-cli · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/esb-js-transformer)

---

esbuild が読み込む JavaScript は、束ねられる前に `JavaScriptTransformer` を通ります。ほとんどのファイルはワーカーに送られずにそのまま返り、ライブラリのリンクや本番の書き換えが要るものだけが Babel や oxc のワーカーに届きます。この章では、[JavaScriptTransformer の章](../cli/05-cli-javascript-transformer.md)で読まなかった残り、つまり**送るか送らないかの判定の Buffer の道、同時に走らせる数の制限、キャッシュと close、ワーカーの入口でのソースマップのコメントの扱い**を読みます。デモでは、本物の JavaScriptTransformer に 20 ほどの入力を当て、どれがワーカーに届いたかを記録します。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/tools/esbuild/javascript-transformer.ts` と `javascript-transformer-worker.ts` です。全体の流れ、文字列の判定（47〜64 行目）、キャッシュの鍵、oxc の 4 つの書き換えは [JavaScriptTransformer の章](../cli/05-cli-javascript-transformer.md)、`requiresLinking`（88〜111 行目）と Babel のリンカー（182〜220 行目）は [リンカーの章](../cli/06-cli-linker.md)、oxc の 1 回の木の歩き方は [oxc の変換の章](../oxc/01-oxc-transform-pass.md)で読みました。22.2.7 と新しい本家では、この 2 つのファイルは `tools/javascript-transformer/` に移り（e7ebbcdc25）、同時に走らせる数の作りが変わっています（4 節）。

1. [1. 束ね方の設定を作る関数](01-esb-code-bundle.md)
2. **2. JavaScriptTransformer**（この章）
3. [3. watcher](03-esb-watcher.md)
4. [4. I18nInliner](04-esb-i18n-inliner.md)
5. [5. スタイルのプラグイン](05-esb-styles.md)
6. [6. compiler-plugin の残り](06-esb-compiler-rest.md)
7. [7. spec と issue](07-esb-tests-issues.md)

## 1. 先頭：宣言の接頭辞をバイト列で持つ

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L9–18 （▶ の行: 10–14, 16–17）

```ts
 9 │ import { readFile } from 'node:fs/promises';
10 ▶ import { createContentHash } from '../../utils/hash';
11 ▶ import { IMPORT_EXEC_ARGV } from '../../utils/server-rendering/esm-in-memory-loader/utils';
12 ▶ import { removeSourceMappingURL } from '../../utils/source-map';
13 ▶ import { WorkerPool, WorkerPoolOptions } from '../../utils/worker-pool';
14 ▶ import { Cache } from './cache';
15 │ 
16 ▶ const LINKER_DECLARATION_PREFIX = 'ɵɵngDeclare';
17 ▶ const LINKER_DECLARATION_PREFIX_BYTES = Buffer.from(LINKER_DECLARATION_PREFIX, 'utf-8');
18 │ 
```

16〜17 行目、部分コンパイルの宣言の接頭辞 `ɵɵngDeclare` を、文字列と UTF-8 のバイト列の 2 つで持ちます（7112b75ce9）。ファイルは `readFile` で Buffer のまま読むので、文字列に直さずに `Buffer.includes` で探せるようにするためです。11 行目の `IMPORT_EXEC_ARGV` は 3 節で、12 行目の `removeSourceMappingURL` は 5 節と 7 節で使います。14 行目の `Cache` は 22.2.7 では `utils/cache` から読みます。

## 2. 最適化の候補の見分け：Buffer の道

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L37–46 （▶ の行: 39–40, 44–45）

```ts
37 │ 
38 │ /**
39 ▶  * Determines whether JavaScript code contains potential candidate constructs for advanced optimizations.
40 ▶  * When false, advanced optimizations can be bypassed without worker dispatch or AST parsing.
41 │  *
42 │  * @param filename The full path to the file.
43 │  * @param data The data (string or Buffer) of the file.
44 ▶  * @param sideEffects An optional lazy resolver callback that returns whether the file is considered side-effect free.
45 ▶  * @returns True if the code may contain constructs that advanced optimizations can mutate.
46 │  */
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L65–87 （▶ の行: 66–68, 70–73, 75, 79–81, 85）

```ts
65 │ 
66 ▶   const dataBuffer = Buffer.isBuffer(data)
67 ▶     ? data
68 ▶     : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
69 │ 
70 ▶   for (const tokenBytes of DECORATOR_TOKEN_BYTES) {
71 ▶     if (dataBuffer.includes(tokenBytes)) {
72 ▶       if ((await sideEffects?.()) === false) {
73 ▶         return true;
74 │       }
75 ▶       break;
76 │     }
77 │   }
78 │ 
79 ▶   for (const tokenBytes of ADVANCED_OPTIMIZATION_TOKEN_BYTES) {
80 ▶     if (dataBuffer.includes(tokenBytes)) {
81 ▶       return true;
82 │     }
83 │   }
84 │ 
85 ▶   return false;
86 │ }
87 │ 
```

`hasAdvancedOptimizationCandidates` は、本番の書き換え（advancedOptimizations）が「何か変えうるか」を、木を作らずに文字の並びだけで決めます（6ee559ca9d）。偽ならワーカーに送りません（39〜40 行目）。文字列の道（57〜64 行目）は [前の章](../cli/05-cli-javascript-transformer.md)で読みました。ここは Buffer か Uint8Array で来たときの道です。

1. **Buffer にそろえる**

   66〜68 行目。Uint8Array なら、同じメモリを指す Buffer を作るだけで、写しません。
2. **デコレーターの語が先**

   70〜77 行目。`__decorate` か `__esDecorate` があれば、そこで初めて `sideEffects` を聞き、package.json が `"sideEffects": false` なら真。75 行目の `break` で、2 つめの語は探しません。
3. **主な語**

   79〜83 行目。`ɵ`・`InjectionToken`・`INJECTOR_KEY`・`ctorParameters`・`decorators`・`propDecorators` のどれかが含まれれば真。コメントや文字列の中でも当たります。
4. **どれも無ければ偽**

   85 行目。

44〜45 行目の `sideEffects` は「呼ばれたら package.json を調べる関数」で、値そのものではありません（83264c247c）。調べるのは esbuild の `build.resolve` で、ファイルごとに走るので、要らないなら呼ばないようにしています。デモの「本番の設定」の「\_\_decorate、sideEffects なし」はワーカーに届かず、「\_\_decorate、sideEffects: false」は届いて、出力でクラスが `/*#__PURE__*/ (() => { … })()` に包まれます。

## 3. TransformOptions とクラスのフィールド

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L112–139 （▶ の行: 116–120, 126, 128, 134, 137）

```ts
112 │ 
113 │ /**
114 │  * Transformation options that should apply to all transformed files and data.
115 │  */
116 ▶ export interface JavaScriptTransformerOptions {
117 ▶   sourcemap: boolean;
118 ▶   thirdPartySourcemaps?: boolean;
119 ▶   advancedOptimizations?: boolean;
120 ▶   jit?: boolean;
121 │ }
122 │ 
123 │ /**
124 │  * Transformation options for an individual file or data transform request.
125 │  */
126 ▶ export interface TransformOptions {
127 │   /** If true, bypass all Angular linker processing; if false, attempt linking. */
128 ▶   skipLinker?: boolean;
129 │ 
130 │   /**
131 │    * An optional lazy resolver callback that returns whether the file has side-effects.
132 │    * If it resolves to false, top-level pure function annotations and decorator wrapping may be applied.
133 │    */
134 ▶   sideEffects?: () => Promise<boolean | undefined>;
135 │ 
136 │   /** If true, instrument the code for test coverage. */
137 ▶   instrumentForCoverage?: boolean;
138 │ }
139 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L140–160 （▶ の行: 148–150, 153, 156, 159）

```ts
140 │ /**
141 │  * A class that performs transformation of JavaScript files and raw data.
142 │  * A worker pool is used to distribute the transformation actions and allow
143 │  * parallel processing. Transformation behavior is based on the filename and
144 │  * data. Transformations may include: async downleveling, Angular linking,
145 │  * and advanced optimizations.
146 │  */
147 │ export class JavaScriptTransformer {
148 ▶   #workerPool: WorkerPool | undefined;
149 ▶   #commonOptions: Required<JavaScriptTransformerOptions>;
150 ▶   #fileCacheKeyBase: Uint8Array;
151 │ 
152 │   /** Queue of pending transformation tasks waiting for an active concurrency slot. */
153 ▶   #pendingTasks: { resolve: () => void; reject: (reason: Error) => void }[] = [];
154 │ 
155 │   /** Current count of actively executing transformation tasks. */
156 ▶   #activeTasks = 0;
157 │ 
158 │   /** Maximum number of transformation tasks allowed to execute concurrently. */
159 ▶   #maxConcurrent: number;
160 │ 
```

116〜121 行目の `JavaScriptTransformerOptions` は、インスタンスを作るときに決まり、ワーカーにも `workerData` で渡る 4 つです。126〜138 行目の `TransformOptions` はファイルごとの 3 つで、ワーカーへの依頼に載ります。150 行目の `#fileCacheKeyBase` は、4 つの共通の options を JSON にしたバイト列で、キャッシュの鍵の最後に足します（[前の章](../cli/05-cli-javascript-transformer.md)の 302〜305 行目）。153・156・159 行目は 4 節の、同時に走らせる数を数えるための 3 つです（583736a4de）。

## 4. 同時に走らせる数の制限（セマフォ）

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L184–211 （▶ の行: 191–194, 197, 201, 203–205, 207）

```ts
184 │ 
185 │   /**
186 │    * Executes a transformation action using a semaphore-based backpressure throttle.
187 │    * Prevents libuv thread pool saturation and excessive V8 heap accumulation.
188 │    * @param action A callback that produces a promise for the transformation result.
189 │    * @returns A promise resolving to the transformation result.
190 │    */
191 ▶   async #runWithThrottle<T>(action: () => Promise<T>): Promise<T> {
192 ▶     if (this.#activeTasks >= this.#maxConcurrent) {
193 ▶       await new Promise<void>((resolve, reject) => {
194 ▶         this.#pendingTasks.push({ resolve, reject });
195 │       });
196 │     } else {
197 ▶       this.#activeTasks++;
198 │     }
199 │ 
200 │     try {
201 ▶       return await action();
202 │     } finally {
203 ▶       const next = this.#pendingTasks.shift();
204 ▶       if (next) {
205 ▶         next.resolve();
206 │       } else {
207 ▶         this.#activeTasks--;
208 │       }
209 │     }
210 │   }
211 │ 
```

セマフォ（決まった数の「席」を配って、空くまで待たせる仕組み）です。席の数は 167 行目の `Math.max(1, maxThreads * 2)`（[前の章](../cli/05-cli-javascript-transformer.md)の引用の中）で、ワーカー 1 つあたり 2 つです。

1. **席が空いていれば座る**

   196〜198 行目、`#activeTasks` を 1 増やして進む。
2. **満席なら列に並ぶ**

   192〜195 行目、resolve と reject を `#pendingTasks` に積んで待つ。
3. **終わったら次の人に席を渡す**

   203〜205 行目、列の先頭がいれば、数を減らさずにその人の resolve を呼びます。席をそのまま渡すので、終わった瞬間に別の呼び出しが割り込む隙がありません。列が空なら 207 行目で 1 減らします。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L234–257 （▶ の行: 242–244, 246, 251–253）

```ts
234 │ 
235 │   /**
236 │    * Performs JavaScript transformations on a file from the filesystem.
237 │    * If no transformations are required, the data for the original file will be returned.
238 │    * @param filename The full path to the file.
239 │    * @param options Transformation options specific to this file.
240 │    * @returns A promise that resolves to a UTF-8 encoded Uint8Array containing the result.
241 │    */
242 ▶   async transformFile(filename: string, options?: TransformOptions): Promise<Uint8Array> {
243 ▶     return this.#runWithThrottle(async () => {
244 ▶       const data = await readFile(filename);
245 │ 
246 ▶       return this.transformData(filename, data, options);
247 │     });
248 │   }
249 │ 
250 │   /**
251 ▶    * Performs JavaScript transformations on the provided data of a file. The file does not need
252 ▶    * to exist on the filesystem.
253 ▶    * @param filename The full path of the file represented by the data.
254 │    * @param data The data of the file that should be transformed.
255 │    * @param options Transformation options specific to this file data.
256 │    * @returns A promise that resolves to a UTF-8 encoded Uint8Array containing the result.
257 │    */
```

44129f66a3 で 243 行目のセマフォを通るのは `transformFile` だけです。251〜253 行目の説明のとおりファイルが無くても呼べる `transformData`（258 行目から、[前の章](../cli/05-cli-javascript-transformer.md)の引用）は、中で `#runWithThrottle` を呼びません。`transformFile` の中の 246 行目は席に座ったまま `transformData` を呼ぶので二重には数えませんが、外から直接 `transformData` を呼ぶ道（compiler-plugin.ts の 529 行目、TypeScript の出力の後処理）は数に入りません。

> **🧪 DEMO — 部分コンパイル済みのファイルを 8 回同時に変換したときの、ワーカーで同時に走った数**
>
> 数は Piscina の `run` を包んで、入ってから戻るまでの数を数えました。44129f66a3 は作業木の .ts を esbuild で .js にした物です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/esb-js-transformer)

44129f66a3 では、`transformFile` は席の数の 2 で止まり、`transformData` は 8 つ全部が同時にワーカーに入りました。22.2.7 では、席の数を options の `maxConcurrency` で渡す形になり（d14bf8fe57）、`transformData` もセマフォを通り（d1b7119ff4）、compiler-plugin.ts は `maxConcurrency` に CPU の数から決めた値（`maxTransformWorkers`）を渡します（4d3c63604e）。記録の 22.2.7 は、どちらの呼び方でも 1 でした。

> [!NOTE]
> **ポイント**
>
> `NG_BUILD_MAX_WORKERS` を指定しないとき、44129f66a3 の compiler-plugin.ts は 108 行目で `Math.min(4, maxWorkers)` をワーカーの数にします（[6 回目](06-esb-compiler-rest.md)）。esbuild 自身も Go で全部のコアを使うので、変換のワーカーを 4 つまでにして取り合いを減らす、と 105〜107 行目のコメントにあります。

## 5. キャッシュへの書き込みと close

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L341–372 （▶ の行: 342, 344–346, 350, 357–361, 364, 366, 368）

```ts
341 │ 
342 ▶     if (this.cache && cacheKey) {
343 │       try {
344 ▶         await this.cache.put(cacheKey, result);
345 ▶       } catch {
346 ▶         // Failure to store the value in the cache should not fail the transform
347 │       }
348 │     }
349 │ 
350 ▶     return result;
351 │   }
352 │ 
353 │   /**
354 │    * Stops all active transformation tasks and shuts down all workers.
355 │    * @returns A void promise that resolves when closing is complete.
356 │    */
357 ▶   async close(): Promise<void> {
358 ▶     const pending = this.#pendingTasks;
359 ▶     this.#pendingTasks = [];
360 ▶     for (const task of pending) {
361 ▶       task.reject(new Error('JavaScriptTransformer closed.'));
362 │     }
363 │ 
364 ▶     if (this.#workerPool) {
365 │       try {
366 ▶         await this.#workerPool.destroy();
367 │       } finally {
368 ▶         this.#workerPool = undefined;
369 │       }
370 │     }
371 │   }
372 │ }
```

342〜348 行目、ワーカーの結果をキャッシュに書きます。書けなくても変換は失敗にしません（346 行目のコメント）。読むときも 313〜315 行目で同じく握りつぶします。デモの「MemoryCache を渡したとき」では、2 回目は鍵が同じでワーカーに届かず 0.2 ms、3 回目は `sideEffects` の答えだけを `undefined` に変えると鍵が変わってワーカーに届きました。鍵の頭の文字列（302 行目）が `resolvedSideEffects === false` を含むからです。

357〜371 行目の `close` は、まず 358〜362 行目で列に並んでいる呼び出しを全部「JavaScriptTransformer closed.」で失敗させ、そのあとワーカーのプールを壊します（583736a4de）。並んだまま close されると、その呼び出しの Promise が永久に決まらなくなるのを防ぐためです。368 行目でプールを `undefined` に戻すので、close のあとにまた変換を頼むと、329 行目の `#ensureWorkerPool()` がプールを作り直します。

## 6. ワーカーの側：依存の遅延読み込みとカバレッジ

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer-worker.ts` L44–57 （▶ の行: 45–46, 48–50, 53, 55–56）

```ts
44 │ 
45 ▶ let babelLinkerDeps:
46 ▶   | Promise<
47 │       [
48 ▶         typeof import('@angular/compiler-cli/linker/babel'),
49 ▶         typeof import('@angular/compiler-cli'),
50 ▶         typeof import('@babel/core'),
51 │       ]
52 │     >
53 ▶   | undefined;
54 │ 
55 ▶ const textDecoder = new TextDecoder();
56 ▶ const textEncoder = new TextEncoder();
57 │ 
```

ワーカーは Piscina（Node の worker\_threads のプール）が別のスレッドで読み込むファイルです。38〜43 行目（[前の章](../cli/05-cli-javascript-transformer.md)の引用）で `workerData` から 4 つの共通の options を読みます。45〜53 行目、Babel のリンカーの 3 つのモジュールは、Promise を 1 つだけ覚えておき、初めて要るときに読みます（989abb3299）。既定は oxc のリンカーで、Babel は `NG_BUILD_BABEL_LINKER` のときだけ要るからです（[リンカーの章](../cli/06-cli-linker.md)）。55〜56 行目、TextDecoder と TextEncoder は 1 つずつ作って使い回します。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer-worker.ts` L58–79 （▶ の行: 58, 64, 66–67, 72–73, 75–77）

```ts
58 ▶ async function instrumentCoverage(
59 │   filename: string,
60 │   data: string,
61 │   useInputSourcemap: boolean,
62 │ ): Promise<{ code: string; map?: EncodedSourceMap }> {
63 │   try {
64 ▶     let resolvedPath = 'istanbul-lib-instrument';
65 │     try {
66 ▶       const requireFn = createRequire(filename);
67 ▶       resolvedPath = requireFn.resolve('istanbul-lib-instrument');
68 │     } catch {
69 │       // Fallback to pool worker import traversal
70 │     }
71 │ 
72 ▶     const { createInstrumenter } = (await import(
73 ▶       resolvedPath
74 │     )) as typeof import('istanbul-lib-instrument');
75 ▶     const instrumenter = createInstrumenter({
76 ▶       produceSourceMap: useInputSourcemap,
77 ▶       esModules: true,
78 │     });
79 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer-worker.ts` L80–101 （▶ の行: 80–81, 86–87, 90–91, 95–97）

```ts
 80 ▶     const inputSourceMap = useInputSourcemap ? loadInputSourceMap(filename, data) : undefined;
 81 ▶     const instrumentedCode = instrumenter.instrumentSync(
 82 │       data,
 83 │       filename,
 84 │       inputSourceMap as Parameters<typeof instrumenter.instrumentSync>[2],
 85 │     );
 86 ▶     const lastMap = useInputSourcemap
 87 ▶       ? (instrumenter.lastSourceMap() as EncodedSourceMap)
 88 │       : undefined;
 89 │ 
 90 ▶     return {
 91 ▶       code: instrumentedCode,
 92 │       map: lastMap ?? undefined,
 93 │     };
 94 │   } catch (error) {
 95 ▶     throw new Error(
 96 ▶       `The 'istanbul-lib-instrument' package is required for code coverage but was not found. Please install the package.`,
 97 ▶       { cause: error },
 98 │     );
 99 │   }
100 │ }
101 │ 
```

ng test のカバレッジでだけ通る道です（f9a7d52f66）。66〜67 行目、`istanbul-lib-instrument` を、@angular/build からではなく**変換するファイルの場所から**探します。アプリの node\_modules に入れたものを使うためで、見つからなければ 64 行目の名前のまま、ワーカー自身からの import に任せます。80〜85 行目で入力のソースマップを渡して計装し、86〜88 行目で計装の後のソースマップを取ります。95〜98 行目、パッケージが無ければこの文で投げ直します。デモの「instrumentForCoverage: true」は、サイトの node\_modules に istanbul-lib-instrument が無いので、まさにこの文で失敗しました。

## 7. ワーカーの入口：ソースマップのコメントを先に切る

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer-worker.ts` L102–131 （▶ の行: 105, 107–108, 112, 114–116, 118–123, 126–127, 130）

```ts
102 │ export default async function transformJavaScript(
103 │   request: JavaScriptTransformRequest,
104 │ ): Promise<unknown> {
105 ▶   const { filename, data, ...options } = request;
106 │ 
107 ▶   const useInputSourcemap =
108 ▶     sourcemap && (!!thirdPartySourcemaps || !/[\\/]node_modules[\\/]/.test(filename));
109 │ 
110 │   let textData: string;
111 │   let inputSourceMap: EncodedSourceMap | undefined;
112 ▶   let isAlreadyStripped = false;
113 │ 
114 ▶   if (typeof data !== 'string') {
115 ▶     const trailing = findTrailingSourceMapComment(data);
116 ▶     if (trailing === null) {
117 │       // 0 comments: fast path, no sourcemap to load or strip
118 ▶       textData = textDecoder.decode(data);
119 ▶       isAlreadyStripped = true;
120 ▶     } else if (trailing !== undefined) {
121 ▶       if (useInputSourcemap) {
122 ▶         inputSourceMap = loadInputSourceMapFromUrl(filename, trailing.urlLine);
123 ▶         if (inputSourceMap !== undefined) {
124 │           // Valid trailing sourcemap comment confirmed: safe to slice code buffer for transformation passes.
125 │           // Note: If no passes modify the code, the untouched original `data` buffer is returned below.
126 ▶           textData = textDecoder.decode(trailing.code);
127 ▶           isAlreadyStripped = true;
128 │         } else {
129 │           // Not a valid trailing sourcemap (e.g. inside template literal): fallback to full decode
130 ▶           textData = textDecoder.decode(data);
131 │         }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer-worker.ts` L132–161 （▶ の行: 132, 134–135, 138, 142, 145, 148, 151, 156–158, 160）

```ts
132 ▶       } else if (isTrailingSourceMapComment(trailing.urlLine)) {
133 │         // Valid trailing sourcemap comment confirmed: safe to slice code buffer
134 ▶         textData = textDecoder.decode(trailing.code);
135 ▶         isAlreadyStripped = true;
136 │       } else {
137 │         // Fallback to full decode and state-machine stripping
138 ▶         textData = textDecoder.decode(data);
139 │       }
140 │     } else {
141 │       // Multiple comments or comment not at line start: fall back to full decode and string parser
142 ▶       textData = textDecoder.decode(data);
143 │     }
144 │   } else {
145 ▶     textData = data;
146 │   }
147 │ 
148 ▶   const transformedData = await transformJavaScriptImpl(filename, textData, {
149 │     ...options,
150 │     inputSourceMap,
151 ▶     isAlreadyStripped,
152 │   });
153 │ 
154 │   // If no transformations modified the code, return the original untouched data buffer via `move`.
155 │   // This preserves any original trailing sourcemap comment and avoids re-encoding.
156 ▶   if (transformedData === textData && typeof data !== 'string') {
157 ▶     return Piscina.move(data);
158 ▶   }
159 │ 
160 ▶   return Piscina.move(textEncoder.encode(transformedData));
161 │ }
```

入口の `transformJavaScript` は、受け取ったバイト列の最後の `//# sourceMappingURL=` のコメント（ソースマップの場所を書いた 1 行）を、文字列に直す**前に**切り落とします（1c00edce02、6a21ad683e）。`findTrailingSourceMapComment`（utils/source-map.ts）は、コメントが無ければ `null`、行頭に 1 つだけなら `{ code, urlLine }`、2 つ以上か行の途中なら `undefined` を返します。

| コメント | ソースマップを使うか（107〜108 行目） | textData | isAlreadyStripped | 行 |
| --- | --- | --- | --- | --- |
| 無い（null） | どちらでも | 全部をデコード | true | 116〜119 |
| 行頭に 1 つ | 使う、読めた | コメントの前まで | true（読んだマップを 150 行目で渡す） | 121〜127 |
| 行頭に 1 つ | 使う、読めない | 全部をデコード | false | 128〜131 |
| 行頭に 1 つ | 使わない、正しいコメント | コメントの前まで | true | 132〜135 |
| 行頭に 1 つ | 使わない、正しくない | 全部をデコード | false | 136〜139 |
| 2 つ以上か行の途中（undefined） | どちらでも | 全部をデコード | false | 140〜143 |

107〜108 行目の「ソースマップを使う」は、`sourcemap` が真で、node\_modules の外か `thirdPartySourcemaps` が真のときです。angular.json の `sourceMap.vendor` が偽（既定）なら、node\_modules のファイルの入力のソースマップは使いません。そして 156〜158 行目、変換が何も変えなければ、文字列に直した物ではなく**受け取ったバイト列そのもの**を返します（5ee54207e2）。154〜155 行目のコメントのとおり、元の末尾のコメントもそのまま残ります。

> [!WARNING]
> **ハマりどころ**
>
> 表の 4 行目（使わないのに、正しいコメントを 134〜135 行目で切った）と 156〜158 行目が重なると、134〜135 行目で切ったコメントが、バイト列ごと戻ります。デモの「本番でソースマップあり」の 1 行目がそれで、文字列の中に `ɵ` があるだけの node\_modules のファイルは 2 節の判定でワーカーに送られ、oxc は何も変えず、出力の 61 バイトに `//# sourceMappingURL=index.js.map` が残りました。同じ中身を文字列で渡すと（145 行目の道）、コメントは消えます。ワーカーに送られない道（前の章の 293 行目）でも消えます。
>
> esbuild は、onLoad が返した中身の `sourceMappingURL` をたどって元のソースマップを読みます。node\_modules に偽のパッケージ（`export const label = "ɵ-demo";` とソースマップ）を置いたカウンターのアプリで `ng build --optimization --source-map` を走らせると、main.js.map の sources に `node_modules/demo-lib/original-lib-source.ts`（パッケージのソースマップの中の名前）が入りました。文字列の `ɵ` を `x` に変えると `node_modules/demo-lib/index.js` になります。`sourceMap.vendor` が偽でも、条件に当たったパッケージだけ元のソースが出る、ということです。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer-worker.ts` L162–181 （▶ の行: 163, 168–170, 172–174, 176–179）

```ts
162 │ 
163 ▶ async function transformJavaScriptImpl(
164 │   filename: string,
165 │   data: string,
166 │   options: TransformOptions,
167 │ ): Promise<string> {
168 ▶   const shouldLink = !options.skipLinker;
169 ▶   const useInputSourcemap =
170 ▶     sourcemap && (!!thirdPartySourcemaps || !/[\\/]node_modules[\\/]/.test(filename));
171 │ 
172 ▶   let code = data;
173 ▶   const maps: (DecodedSourceMap | EncodedSourceMap)[] = [];
174 ▶   let coverageMap: EncodedSourceMap | undefined;
175 │ 
176 ▶   if (options.instrumentForCoverage) {
177 ▶     const result = await instrumentCoverage(filename, code, useInputSourcemap);
178 ▶     code = result.code;
179 ▶     coverageMap = result.map;
180 │   }
181 │ 
```

`transformJavaScriptImpl` の頭です。168 行目、メインのスレッドが決めた `skipLinker` の逆がリンクの要否です。173 行目の `maps` に、変換ごとのソースマップを積んで、最後に 250〜256 行目でつなぎ直します（[oxc の変換の章](../oxc/01-oxc-transform-pass.md)）。176〜180 行目、カバレッジの計装は**リンクより先**で、計装の後のソースマップは `coverageMap` として別に持ち、245 行目で入力のソースマップの代わりに鎖の根に置きます。

## 8. デモ：本物の JavaScriptTransformer に入力を当てる

> **🧪 DEMO — @angular/build 22.2.7 の transformData / transformFile（記録）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/esb-js-transformer)

「開発の設定」では、部分コンパイル済みの `@angular/common` のファイルだけがワーカーに届き、宣言 15 個が 0 個になりました。同じ中身でも、`skipLinker: true`、`@angular/core` の中のパス、`.ts` のパス（リンカーの章の 98 行目）は届きません。node\_modules のパスでは `sourceMappingURL` が 1 → 0 になり、ワークスペースの中のパスでは 1 → 1 のまま残ります（前の章の 285〜287 行目）。`async` と `for await` は、どの設定でも届きません。Zone.js のための async/await の書き換えは、このクラスではなく esbuild の `supported` がします（[1 回目](01-esb-code-bundle.md)）。時間を見ると、インスタンスごとに最初にワーカーに届いた変換だけが 50〜70 ms で、2 回目からは 0.3〜5 ms でした。

## 9. どう録ったか

スクリプトは `<work>/esb-demo/a/` に置き、Node v24.22.1 で、サイトの node\_modules の @angular/build 22.2.7 の `tools/javascript-transformer/javascript-transformer.js` を require しました。ワーカーへの依頼は、Piscina の `prototype.run` を包んで記録しています。比べるための 44129f66a3 は、作業木の 2 つの .ts を esbuild で .js にしてから同じ物に当てました。7 節の ng build は、サイトの node\_modules を 1 つずつ symlink した node\_modules に偽のパッケージを足した、カウンターのアプリのコピーで走らせています。

📄 `記録のスクリプト（rec-transform.mjs）`

```
// 本物の JavaScriptTransformer（サイトの node_modules の @angular/build 22.2.7）に、いくつかの入力を当てて記録する。
// 比べるために、作業木（44129f66a3）の javascript-transformer.ts と -worker.ts を esbuild で .js にした物も同じように動かす。
// 使い方: node rec-transform.mjs <サイトのディレクトリ> <44129f66a3 の作業木> <出力 JSON>
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [site, wt, out] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const app = path.join(here, 'app');
const require = createRequire(path.join(site, 'package.json'));
const B = path.join(site, 'node_modules/@angular/build/src');
const esbuild = require('esbuild');
const { Piscina } = require('piscina');
const hide = (s) => s.replaceAll(app, '<app>').replaceAll(site, '~/angular-research/angular-deep-dive');

// 1. 44129f66a3 の 2 つのファイルを .js にする（パッケージは外に出し、app/node_modules から読む）
const t44 = path.join(app, '.t44');
mkdirSync(t44, { recursive: true });
const src = path.join(wt, 'packages/angular/build/src/tools/esbuild');
await esbuild.build({
  entryPoints: { 'javascript-transformer': path.join(src, 'javascript-transformer.ts'), 'javascript-transformer-worker': path.join(src, 'javascript-transformer-worker.ts') },
  outdir: t44, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'error',
  plugins: [{ name: 'keep-worker-separate', setup(b) {
    b.onResolve({ filter: /^\.\/javascript-transformer$/ }, () => ({ path: './javascript-transformer.js', external: true }));
  } }],
});

// 2. ワーカーへの依頼を横から記録する（どちらの版も node_modules の piscina を使う）
let calls = [];
let active = 0, peak = 0;
const origRun = Piscina.prototype.run;
Piscina.prototype.run = async function (task, opts) {
  active++; peak = Math.max(peak, active);
  calls.push({ filename: hide(task.filename), skipLinker: task.skipLinker, sideEffects: task.sideEffects ?? null, instrumentForCoverage: task.instrumentForCoverage ?? null, dataType: typeof task.data === 'string' ? 'string' : 'Uint8Array', transfer: !!opts?.transferList });
  try { return await origRun.call(this, task, opts); } finally { active--; }
};

const T22 = require(path.join(B, 'tools/javascript-transformer/javascript-transformer.js')).JavaScriptTransformer;
const T44 = require(path.join(t44, 'javascript-transformer.js')).JavaScriptTransformer;
const { MemoryCache } = require(path.join(B, 'utils/cache/cache.js'));
await require(path.join(B, 'utils/hash.js')).initializeHash();

const nm = path.join(site, 'node_modules');
const linkFile = path.join(nm, '@angular/common/fesm2022/_location-chunk.mjs');
const linkText = readFileSync(linkFile, 'utf8');
const files = {
  plain: path.join(app, 'src/t/plain.js'),
  asyncFn: path.join(app, 'src/t/async.js'),
  token: path.join(app, 'src/t/token.js'),
  decorate: path.join(app, 'src/t/decorate.js'),
};
const texts = {
  plain: 'export function add(a, b) {\n  return a + b;\n}\n//# sourceMappingURL=plain.js.map\n',
  asyncFn: 'export async function load() {\n  const r = await fetch("/data.json");\n  for await (const c of r.body) console.log(c);\n}\n',
  token: 'import { InjectionToken } from "@angular/core";\nexport const API = new InjectionToken("API");\nexport function f() { return 1; }\n',
  decorate: 'import { __decorate } from "tslib";\nlet A = class A {};\nA = __decorate([Dec()], A);\nexport { A };\nfunction Dec() { return (c) => c; }\n',
};
for (const k of Object.keys(files)) writeFileSync(files[k], texts[k]);
writeFileSync(path.join(app, 'src/t/plain.js.map'), JSON.stringify({ version: 3, sources: ['plain.ts'], names: [], mappings: 'AAAA' }));

const decoder = new TextDecoder();
async function one(t, label, kind, filename, data, options, note) {
  calls = [];
  const t0 = performance.now();
  let result, error;
  try {
    result = kind === 'file' ? await t.transformFile(filename, options) : await t.transformData(filename, data, options);
  } catch (e) {
    error = e.message;
  }
  const ms = performance.now() - t0;
  const input = kind === 'file' ? readFileSync(filename, 'utf8') : typeof data === 'string' ? data : decoder.decode(data);
  const text = result ? decoder.decode(result) : '';
  const count = (s, x) => s.split(x).length - 1;
  return {
    label, kind, filename: hide(filename), note: note ?? null,
    options: options ? Object.fromEntries(Object.entries(options).map(([k, v]) => [k, typeof v === 'function' ? 'async () => ' + v.toString().split('=> ').pop() : v])) : null,
    worker: calls, ms: +ms.toFixed(1), error: error ? hide(error) : null,
    sameObject: kind === 'data' && result === data,
    inBytes: Buffer.byteLength(input), outBytes: result ? result.byteLength : 0,
    declIn: count(input, 'ɵɵngDeclare'), declOut: count(text, 'ɵɵngDeclare'),
    pureOut: count(text, '@__PURE__'), mapIn: count(input, 'sourceMappingURL'), mapOut: count(text, 'sourceMappingURL'),
    head: hide(text.slice(0, 600)),
  };
}

const sets = [];
{ // A: 開発（advancedOptimizations なし、sourcemap あり）
  const t = new T22({ sourcemap: true, thirdPartySourcemaps: false, advancedOptimizations: false, jit: false, maxConcurrency: 2 });
  const r = [];
  r.push(await one(t, 'node_modules の部分コンパイル済み（transformFile）', 'file', linkFile, null, undefined));
  r.push(await one(t, '同じファイル、skipLinker: true', 'file', linkFile, null, { skipLinker: true }));
  r.push(await one(t, '@angular/core の中のパス（中身は同じ）', 'data', path.join(nm, '@angular/core/fesm2022/_fake.mjs'), linkText, undefined));
  r.push(await one(t, '.ts のパス（中身は同じ）', 'data', path.join(app, 'src/t/fake.ts'), linkText, undefined));
  r.push(await one(t, 'ふつうの ES（sourceMappingURL つき）', 'data', files.plain, texts.plain, undefined));
  r.push(await one(t, '同じ中身を node_modules のパスで', 'data', path.join(nm, 'demo-pkg/plain.js'), texts.plain, undefined));
  r.push(await one(t, 'async と for await', 'data', files.asyncFn, texts.asyncFn, undefined));
  r.push(await one(t, 'instrumentForCoverage: true', 'data', files.plain, texts.plain, { instrumentForCoverage: true }));
  await t.close();
  sets.push({ id: 'dev', label: '開発の設定（sourcemap: true, advancedOptimizations: false）', rows: r });
}
{ // B: 本番（advancedOptimizations あり、sourcemap なし）
  const t = new T22({ sourcemap: false, advancedOptimizations: true, jit: false, maxConcurrency: 2 });
  const r = [];
  r.push(await one(t, 'ふつうの ES（候補の語なし）', 'data', files.plain, texts.plain, undefined));
  r.push(await one(t, 'async と for await', 'data', files.asyncFn, texts.asyncFn, undefined));
  r.push(await one(t, 'InjectionToken を含む', 'data', files.token, texts.token, undefined));
  r.push(await one(t, '__decorate、sideEffects なし', 'data', files.decorate, texts.decorate, undefined));
  r.push(await one(t, '__decorate、sideEffects: false', 'data', files.decorate, texts.decorate, { sideEffects: async () => false }));
  r.push(await one(t, '@angular/ の中、sideEffects: false（Uint8Array）', 'data', path.join(nm, '@angular/demo/plain.mjs'), Buffer.from(texts.plain), { sideEffects: async () => false }));
  r.push(await one(t, 'node_modules の部分コンパイル済み、sideEffects: false', 'file', linkFile, null, { sideEffects: async () => false }));
  await t.close();
  sets.push({ id: 'prod', label: '本番の設定（sourcemap: false, advancedOptimizations: true）', rows: r });
}
{ // B2: 本番でソースマップあり（thirdPartySourcemaps は既定の false）
  const t = new T22({ sourcemap: true, thirdPartySourcemaps: false, advancedOptimizations: true, jit: false, maxConcurrency: 2 });
  const r = [];
  const lib = 'export const label = "ɵ";\n//# sourceMappingURL=index.js.map\n';
  r.push(await one(t, 'node_modules の候補の語つき（何も変わらない）', 'data', path.join(nm, 'demo-lib/index.js'), Buffer.from(lib), undefined, '「ɵ」は文字列の中だけ'));
  r.push(await one(t, '同じ中身、候補の語なし', 'data', path.join(nm, 'demo-lib/index.js'), Buffer.from(lib.replace('ɵ', 'x')), undefined));
  r.push(await one(t, '同じ中身を文字列で渡す', 'data', path.join(nm, 'demo-lib/index.js'), lib, undefined));
  await t.close();
  sets.push({ id: 'prodmap', label: '本番でソースマップあり（sourcemap: true, thirdPartySourcemaps: false, advancedOptimizations: true）', rows: r });
}
{ // C: キャッシュ
  const cache = new MemoryCache();
  const t = new T22({ sourcemap: false, advancedOptimizations: true, jit: false, maxConcurrency: 2 }, cache);
  const r = [];
  r.push(await one(t, '1 回目（キャッシュなし）', 'file', linkFile, null, { sideEffects: async () => false }));
  r.push(await one(t, '2 回目（同じ中身と同じ options）', 'file', linkFile, null, { sideEffects: async () => false }));
  r.push(await one(t, '3 回目（sideEffects だけ undefined に）', 'file', linkFile, null, { sideEffects: async () => undefined }));
  await t.close();
  sets.push({ id: 'cache', label: 'MemoryCache を渡したとき', rows: r, cacheSize: cache.store?.size ?? null });
}
// D: 同時に走る数
const conc = [];
for (const [ver, make] of [
  ['22.2.7（maxConcurrency: 1）', () => new T22({ sourcemap: false, advancedOptimizations: false, jit: false, maxConcurrency: 1 })],
  ['44129f66a3（maxThreads: 1）', () => new T44({ sourcemap: false, advancedOptimizations: false, jit: false }, 1)],
]) {
  for (const kind of ['transformFile', 'transformData']) {
    const t = make();
    active = 0; peak = 0; calls = [];
    const t0 = performance.now();
    await Promise.all(Array.from({ length: 8 }, () => (kind === 'transformFile' ? t.transformFile(linkFile) : t.transformData(linkFile, linkText))));
    conc.push({ ver, kind, requests: 8, workerRuns: calls.length, peak, ms: +(performance.now() - t0).toFixed(0) });
    await t.close();
  }
}
Piscina.prototype.run = origRun;
writeFileSync(out, JSON.stringify({ version: require(path.join(B, '../package.json')).version, node: process.version, linkFile: hide(linkFile), sets, conc }, null, 1));
console.log('ok');

```

## ここまでの呼び出し

- `build.onLoad({ filter: /\.[cm]?js$/ })` — angular/compiler-plugin.ts 558
  - `javascriptTransformer.transformFile(request, { skipLinker, sideEffects })` — javascript-transformer.ts 242
    - `#runWithThrottle(…)` — 191 — *席の数は maxThreads × 2*
      - `readFile(filename)` → `transformData(filename, data, options)` — 244 → 258
        - `requiresLinking`・`hasAdvancedOptimizationCandidates` — 95・47 — *どちらも偽なら 284 行目で返す*
        - `cache.get(cacheKey)` — 309
        - `workerPool.run({ filename, data, skipLinker, sideEffects, instrumentForCoverage })` — 329
          - `transformJavaScript(request)` — javascript-transformer-worker.ts 102
            - `findTrailingSourceMapComment(data)` — 115
            - `transformJavaScriptImpl(filename, textData, options)` — 163 — *計装 → Babel か oxc → ソースマップ*
            - `Piscina.move(data | encode(transformed))` — 157・160
        - `cache.put(cacheKey, result)` — 344

## テストと直し方

| spec | describe / it と行 | この章のどこ |
| --- | --- | --- |
| tools/esbuild/javascript-transformer\_spec.ts | describe JavaScriptTransformer sourcemaps（11 行目、it 27 件）。Uint8Array の受け付け（233 行目）、fast-path でコメントを切る（253 行目）、コメントが無ければそのまま（273 行目）、@angular/core と .ts を送らない（305・323 行目） | 2・7 節。ワーカーが何も変えなかったときのコメントの it はありません |
| 同じファイル | describe advanced optimizations fast-path pre-filter（372 行目）。候補の語が無ければ送らない（373 行目）、sideEffects を聞かない（525・548 行目）、@angular/ なら聞く（571 行目）、Buffer で両方の語（652 行目） | 2 節 |
| （無い） | セマフォ・close・カバレッジの道 | 4〜6 節。22.2.7 の spec には maxConcurrency の it が足されています |

../angular-cli で、この章と次の章・6 回目の unit の spec をまとめて `pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all "--test_arg=--filter=(JavaScriptTransformer|Watcher|compilation-state|SourceFileCache)"` で走らせました。4 つの shard の「Ran N」は 20・19・18・18 で 75 件（JavaScriptTransformer 27・Watcher 33・compilation-state 14・SourceFileCache 1）、0 failures、PASSED です。

練習用の作業木（44129f66a3）で 7 節を固めてみました。javascript-transformer\_spec.ts の 273 行目の前に、次の it を足しました。`sourcemap: true`・`advancedOptimizations: true` のインスタンスに、`/project/node_modules/my-lib/index.js` として `export const label = "ɵ-demo";` と `//# sourceMappingURL=index.js.map` の Buffer を `transformData` で渡し、出力に `sourceMappingURL` が無いことを期待します。結果は「Expected 'export const label = "ɵ-demo"; //# sourceMappingURL=index.js.map' not to contain 'sourceMappingURL'」で落ちました。

直し方は、javascript-transformer-worker.ts の `transformJavaScript` に「134〜135 行目でコメントを切った」印を 1 つ足し、156 行目の条件に「その印が立っていない」を加える形です。これで、この it と、JavaScriptTransformer の 27 件が通りました（28 件）。unit の全部（4 shard × 154 件）を走らせると、失敗は 1 件で、Google Fonts をネットから取る InlineFontsProcessor の it（socket hang up）でした。この直しとは関係しません。

> [!TIP]
> **新卒エンジニアへ**
>
> パスを `node_modules/my-lib/…`（先頭の `/` なし）で書くと、107〜108 行目の `/[\\/]node_modules[\\/]/` に当たらず「ワークスペースのファイル」として扱われ、ソースマップを使う道に入ります。既存の it の多くはこの形で、`sourcemap: false` にして道をそろえています。node\_modules の扱いを確かめる it は、先頭に `/` を付けたパスで書きます。

## 聞かれそうな質問

**Q. node\_modules の JavaScript は全部ワーカーで Babel を通るのですか？**

通りません。リンクが要る（`ɵɵngDeclare` を含み、@angular/core と compiler でも .ts でもない）か、本番の書き換えの候補（2 節）があるか、カバレッジのときだけワーカーに送ります。それ以外は前の章の 284〜294 行目で、メインのスレッドがそのまま（node\_modules ならソースマップのコメントだけ切って）返します。リンカーも既定は Babel ではなく oxc です（45〜53 行目は遅延読み込み）。

**Q. 大きなアプリで、変換のワーカーが CPU を食い尽くさないのはなぜですか？**

ワーカーの数（compiler-plugin.ts の 108 行目で既定は最大 4）と、191〜210 行目のセマフォで同時の依頼を「ワーカー × 2」に抑えるからです。ただし 44129f66a3 では `transformData` を直接呼ぶ道はセマフォを通らず、デモでは 8 つが同時に入りました。22.2.7 で直っています。

**Q. カバレッジを取ると「istanbul-lib-instrument が要る」と言われます。**

66〜67 行目で、変換するファイルの場所から `istanbul-lib-instrument` を探し、72 行目の動的 import が失敗すると 95〜98 行目の文で投げ直すからです。アプリの devDependencies に入れれば見つかります。

**Q. `sourceMap.vendor` を偽にしているのに、ライブラリの元のソースが main.js.map に出ます。**

7 節の重なりに当たると、そうなります。条件は、そのファイルが 2 節の判定でワーカーに送られ（`ɵ` などの語を含む）、何も変わらずに 156〜158 行目で元のバイト列が返ると、134〜135 行目で切った `sourceMappingURL` が出力に残り、esbuild がそれをたどることです。

**Q. close したあとに変換を頼むとどうなりますか？**

368 行目でプールを `undefined` にしているので、329 行目の `#ensureWorkerPool()` が新しいプールを作って動きます。close の時点で列に並んでいた呼び出しだけが、361 行目の「JavaScriptTransformer closed.」で失敗します。

## 読み終えて

- ワーカーに送るかは、リンクの要否とバイト列の中の語だけで決まり、木を作らない。Buffer の道は文字列に直さずに `includes` で探す。
- sideEffects は関数で渡され、@angular/ のパスかデコレーターの語があるときだけ package.json を調べる。
- 同時に走らせる数はセマフォで「ワーカー × 2」。終わった人は席を次の人に直接渡す。44129f66a3 の transformData はセマフォを通らない（22.2.7 で直った）。
- ワーカーは入口でソースマップのコメントをバイト列のまま切り、何も変わらなければ受け取ったバイト列を返す。その組み合わせで、使わない設定のソースマップのコメントが戻る。

---

← 前: [束ね方の設定を作る関数：ブラウザ・polyfills・サーバー・SSR の入口の esbuild オプション](01-esb-code-bundle.md)  
次: [watcher：ファイルの変更を拾って ChangedFiles にまとめるまで](03-esb-watcher.md) →
