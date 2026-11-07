[目次](../README.md) › [CLI とビルド](README.md) › 第 10 回 / 全 16 回

# 再ビルド：watcher とキャッシュで、変わった所だけをやり直す

> ng serve や --watch で createWatcher（Parcel watcher か chokidar）が ChangedFiles を渡し、build-action が再ビルドを回す行。SourceFileCache と各 BundlerContext が、変わったファイルを読んだ結果だけを捨てる行、.angular/cache の永続キャッシュ（既定は LMDB、予備に SQLite の CacheStore）、esbuild の incremental な rebuild。どこまでが再利用されるか。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cli-cache-watch)

---

`ng serve` や `ng build --watch` でファイルを保存すると、数百ミリ秒で再ビルドが終わります。この章では、保存が `ChangedFiles` という 3 つの集合になってビルドに届くまでと、届いた集合を使って 「どのキャッシュを捨て、どれを残すか」を決める行を順に読みます。最後に `.angular/cache` に何が書かれるかを見ます。

読む対象は angular-cli リポジトリの `packages/angular/build/src/` の `tools/esbuild/watcher.ts`・`builders/application/build-action.ts`・`execute-build.ts`・`tools/esbuild/bundler-context.ts`・`angular/source-file-cache.ts`・`load-result-cache.ts`・`cache.ts`・`lmdb-cache-store.ts`・`sqlite-cache-store.ts`・`utils/normalize-cache.ts` です。

1. [1. 概観](01-cli-overview.md)
2. [2. ng build の段取り](02-build.md)
3. [3. AotCompilation](03-cli-angular-compilation.md)
4. [4. コンポーネントのスタイル](04-cli-component-styles.md)
5. [5. oxc の変換](05-cli-javascript-transformer.md)
6. [6. リンカー](06-cli-linker.md)
7. [7. 遅延チャンク](07-cli-code-splitting.md)
8. [8. budgets](08-cli-budgets.md)
9. [9. i18n](09-cli-i18n.md)
10. **10. 再ビルドとキャッシュ**（この章）
11. [11. HMR](11-cli-hmr.md)
12. [12. unit-test と Vitest](12-cli-unit-test.md)
13. [13. Tree と sink](13-schematics.md)
14. [14. Rule の組み立て](14-schematics-rules.md)
15. [15. ng generate component](15-schematics-component.md)
16. [16. ng add と ng update](16-cli-add-update.md)

> [!WARNING]
> **ハマりどころ**
>
> 読むソースは 22.2.0-next.6 です。このサイトに入っている `@angular/build` 22.1.7 の `watcher.js` は、まだ `watchpack` を使う古い実装です （`node_modules/@angular/build/src/tools/esbuild/watcher.js` の冒頭が `require("watchpack")`）。angular-cli のコミット「replace watchpack with @parcel/watcher and chokidar」で 1 節の形になりました。2 節以降の流れ（`ChangedFiles` を渡してからの処理）は同じです。

## 0. 全体の流れ

1. **保存**

   エディタがファイルを書き込む。OS の通知を `@parcel/watcher`（または chokidar）が受け取る（1 節）。
2. **ChangedFiles に溜める**

   監視対象のファイルだけを `added` / `modified` / `removed` の Set に入れ、100ms 待って 1 回にまとめる（2 節）。
3. **再ビルドのループ**

   `runEsBuildBuildAction` の `for await` が受け取り、前回の結果から `RebuildState` を作って `executeBuild` を呼び直す（3 節）。
4. **捨てるキャッシュを決める**

   esbuild の context ごとに「変わったファイルを読んだか」を調べ、読んでいない context は前回の結果をそのまま返す（4 節）。
5. **TypeScript 側の再利用**

   `SourceFileCache` から変わったファイルだけ消し、`AotCompilation` が前回の program を土台に作り直す（5 節）。
6. **esbuild の rebuild**

   残した context で `rebuild()`。出力のハッシュを前回と比べ、変わったファイルだけを dev-server に渡す（3 節の後半）。
7. **ディスクに残すもの**

   次に `ng serve` を起動し直したときのために、`.angular/cache/<版>/<プロジェクト>/` に `.tsbuildinfo` と変換結果の DB を書く（6 節）。

## 1. watcher を作る：Parcel か chokidar か

watch モードの入口は [application builder の章](../boot/04-boot-application-build.md)で読んだ `runEsBuildBuildAction` です。1 回目のビルドが終わると、watcher を作ります。

📄 `angular-cli/packages/angular/build/src/builders/application/build-action.ts` L118–145 （▶ の行: 119–120, 122, 124, 126, 136–137, 139）

```ts
118 │       const normalizedOutputBase = toPosixPath(outputOptions.base);
119 ▶       const normalizedCacheBase = toPosixPath(cacheOptions.basePath);
120 ▶       const ignored: string[] = [
121 │         // Ignore the output and cache paths to avoid infinite rebuild cycles
122 ▶         normalizedOutputBase,
123 │         `${normalizedOutputBase}/**`,
124 ▶         normalizedCacheBase,
125 │         `${normalizedCacheBase}/**`,
126 ▶         `${toPosixPath(workspaceRoot)}/**/.*/**`,
127 │       ];
128 │ 
129 │       if (cacheOptions.localBasePath && cacheOptions.localBasePath !== cacheOptions.basePath) {
130 │         const normalizedLocalCacheBase = toPosixPath(cacheOptions.localBasePath);
131 │         ignored.push(normalizedLocalCacheBase, `${normalizedLocalCacheBase}/**`);
132 │       }
133 │ 
134 │       // Setup a watcher
135 │       const { createWatcher } = await import('../../tools/esbuild/watcher');
136 ▶       watcher = await createWatcher({
137 ▶         polling: typeof poll === 'number',
138 │         interval: poll,
139 ▶         followSymlinks: preserveSymlinks,
140 │         ignored,
141 │         cwd: workspaceRoot,
142 │       });
143 │ 
144 │       // Setup abort support
145 │       options.signal?.addEventListener('abort', () => void watcher?.close());
```

120〜127 行目で、出力先（`dist/…`）と キャッシュ（`.angular/cache`）と、ドットで始まるフォルダ（`.git` など）を監視から外します。出力を書いたら再ビルド、が無限に続かないようにするためです。137 行目、`polling` は「`--poll` に数値を渡したか」だけで決まります。139 行目、`followSymlinks` は `preserveSymlinks` と同じ値です。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L254–266 （▶ の行: 255–256, 260, 262–264）

```ts
254 │ export async function createWatcher(options?: WatcherOptions): Promise<BuildWatcher> {
255 ▶   if (options?.polling || options?.followSymlinks) {
256 ▶     return createChokidarWatcher(options);
257 │   }
258 │ 
259 │   try {
260 ▶     const parcelWatcher = await import('@parcel/watcher');
261 │ 
262 ▶     return await createParcelWatcher(options, parcelWatcher);
263 ▶   } catch {
264 ▶     return createChokidarWatcher(options);
265 │   }
266 │ }
```

1. **polling か symlink の追跡が要る → chokidar**

   255〜257 行目。`@parcel/watcher` は OS の通知（macOS の FSEvents、Linux の inotify など）だけを使うので、一定間隔でファイルを見に行く方式も、symlink の先を追う方式も持っていません。
2. **それ以外 → Parcel**

   260 行目でネイティブのモジュールを動的に import し、262 行目でフォルダ全体を 1 回の `subscribe` で監視します。
3. **Parcel が読み込めない → chokidar**

   263〜264 行目。ネイティブのバイナリが無い環境でも watch は動きます。

## 2. イベントを ChangedFiles に溜める

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L424–456 （▶ の行: 424, 433–434, 438, 443, 448–449, 454）

```ts
424 ▶   const isCaseSensitive = isFileSystemCaseSensitive(options?.cwd);
425 │   const rootDirPosix = toPosixPathNormalized(options?.cwd ?? process.cwd());
426 │   const rootDirLookupKey = toLookupKey(rootDirPosix, isCaseSensitive);
427 │   const initTime = Date.now();
428 │ 
429 │   const handleEvents = (events: ParcelWatcher.Event[]) => {
430 │     const changes: { type: 'added' | 'modified' | 'removed'; file: string }[] = [];
431 │     for (const event of events) {
432 │       const posixPath = toPosixPathNormalized(event.path);
433 ▶       const lookupKey = toLookupKey(posixPath, isCaseSensitive);
434 ▶       if (!isPathWatched(lookupKey, watchedFiles)) {
435 │         continue;
436 │       }
437 │ 
438 ▶       if (event.type !== 'delete') {
439 │         const stat = fs.statSync(event.path, { throwIfNoEntry: false });
440 │         // Ignore historical events from before watcher initialization, but allow a 1000 ms window
441 │         // to account for coarse filesystem timestamp resolution (e.g., ext4/overlayfs integer second
442 │         // mtime truncation on Linux) where files modified during startup may have truncated .000 ms mtimes.
443 ▶         if (stat && stat.mtimeMs < initTime - 1000) {
444 │           continue;
445 │         }
446 │       }
447 │ 
448 ▶       const type =
449 ▶         event.type === 'create' ? 'added' : event.type === 'delete' ? 'removed' : 'modified';
450 │       changes.push({ type, file: event.path });
451 │     }
452 │ 
453 │     if (changes.length > 0) {
454 ▶       queue.addChanges(changes);
455 │     }
456 │   };
```

1. **パスを比較用の鍵にする**

   433 行目の `toLookupKey` は、大文字と小文字を区別しないファイルシステムでは小文字にします。区別するかどうかは 424 行目で 1 回だけ調べます（下の引用）。
2. **監視対象でなければ捨てる**

   434 行目。Parcel はフォルダ全体を見ていますが、ビルドが読んだファイル（とその親フォルダ）以外は無視します。`README.md` を保存しても再ビルドしないのはこのためです。
3. **古いイベントを捨てる**

   438〜445 行目。更新時刻が watcher の起動より 1 秒以上前なら捨てます。1 秒の幅は、秒単位でしか時刻を持たないファイルシステムのためです（コメント 440〜442 行目）。
4. **種類を 3 つに寄せる**

   448〜449 行目。`create` → `added`、`delete` → `removed`、それ以外 → `modified`。454 行目でキューに渡します。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L53–78 （▶ の行: 57, 61–62, 72, 76）

```ts
53 │ function isFileSystemCaseSensitive(targetDir: string = process.cwd()): boolean {
54 │   try {
55 │     const resolved = path.resolve(targetDir);
56 │     if (!fs.existsSync(resolved)) {
57 ▶       return process.platform !== 'win32' && process.platform !== 'darwin';
58 │     }
59 │ 
60 │     // Invert the casing of the target directory path.
61 ▶     const altCase =
62 ▶       resolved === resolved.toLowerCase() ? resolved.toUpperCase() : resolved.toLowerCase();
63 │ 
64 │     // If the path contains no alphabetic characters (e.g. root '/'), invert-casing
65 │     // produces the exact same string. Fall back to platform-specific defaults in this case.
66 │     if (resolved === altCase) {
67 │       return process.platform !== 'win32' && process.platform !== 'darwin';
68 │     }
69 │ 
70 │     // If both the original path and the inverted-casing path exist on disk,
71 │     // the filesystem is case-insensitive (returns false).
72 ▶     return !fs.existsSync(altCase);
73 │   } catch {
74 │     // If an error occurs (e.g., permission denied), default to the platform-specific
75 │     // behavior (case-insensitive on Windows/macOS, sensitive on Linux/Unix).
76 ▶     return process.platform !== 'win32' && process.platform !== 'darwin';
77 │   }
78 │ }
```

61〜62 行目で作業フォルダのパスの大文字・小文字を反転し、72 行目で「反転したパスが存在しない」なら区別する、と判定します。実際にディスクに問い合わせるので、macOS でも大文字・小文字を区別するボリュームなら区別します。調べられないときだけ 57・76 行目の OS ごとの既定（Windows と macOS は区別しない）に倒します。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L16–34 （▶ の行: 17–19, 22）

```ts
16 │ export class ChangedFiles {
17 ▶   readonly added = new Set<string>();
18 ▶   readonly modified = new Set<string>();
19 ▶   readonly removed = new Set<string>();
20 │ 
21 │   get all(): string[] {
22 ▶     return Array.from(new Set([...this.added, ...this.modified, ...this.removed]));
23 │   }
24 │ 
25 │   toDebugString(): string {
26 │     const content = {
27 │       added: Array.from(this.added),
28 │       modified: Array.from(this.modified),
29 │       removed: Array.from(this.removed),
30 │     };
31 │ 
32 │     return JSON.stringify(content, null, 2);
33 │   }
34 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L156–191 （▶ の行: 156–158, 177, 183–185, 187）

```ts
156 ▶     const changedFiles = (this.currentChangedFiles ??= new ChangedFiles());
157 ▶     changedFiles[type].add(file);
158 ▶     this.scheduleFlush();
159 │   }
160 │ 
161 │   addChanges(
162 │     changes: ReadonlyArray<{ type: 'added' | 'modified' | 'removed'; file: string }>,
163 │   ): void {
164 │     if (this.isClosed || changes.length === 0) {
165 │       return;
166 │     }
167 │ 
168 │     const changedFiles = (this.currentChangedFiles ??= new ChangedFiles());
169 │     for (const { type, file } of changes) {
170 │       changedFiles[type].add(file);
171 │     }
172 │     this.scheduleFlush();
173 │   }
174 │ 
175 │   private scheduleFlush(): void {
176 │     const now = Date.now();
177 ▶     const firstChangeTime = (this.firstChangeTime ??= now);
178 │ 
179 │     if (this.timeoutId) {
180 │       clearTimeout(this.timeoutId);
181 │     }
182 │ 
183 ▶     const elapsed = now - firstChangeTime;
184 ▶     const remainingMaxWait = Math.max(0, this.maxWaitMs - elapsed);
185 ▶     const delay = Math.min(this.debounceMs, remainingMaxWait);
186 │ 
187 ▶     this.timeoutId = setTimeout(() => {
188 │       this.timeoutId = undefined;
189 │       this.flush();
190 │     }, delay);
191 │   }
```

156〜157 行目、変更は種類ごとの Set に足すだけです。**同じファイルが add → modify → remove と続いても打ち消し合いません**。3 つの Set の全部に入り、22 行目の `all` では 1 回だけ数えられます。183〜185 行目が待ち時間の計算です。変更が来るたびに 100ms（`debounceMs`）待ち直しますが、最初の変更から 500ms（`maxWaitMs`）を超えては待ちません。保存を連打しても 0.5 秒に 1 回は再ビルドが始まります。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L531–562 （▶ の行: 532–535, 556, 560–561）

```ts
531 │   let queue: WatcherQueue;
532 ▶   if (options?.polling) {
533 ▶     const pollingInterval = options.interval ?? 100;
534 ▶     const debounceMs = Math.min(250, Math.max(100, Math.ceil(pollingInterval * 1.5)));
535 ▶     const maxWaitMs = Math.max(500, debounceMs * 3);
536 │     queue = new WatcherQueue(debounceMs, maxWaitMs);
537 │   } else {
538 │     queue = new WatcherQueue();
539 │   }
540 │ 
541 │   const rootDir = options?.cwd ?? process.cwd();
542 │   const isCaseSensitive = isFileSystemCaseSensitive(rootDir);
543 │   const rootDirPosix = toPosixPathNormalized(rootDir);
544 │   const rootDirLookupKey = toLookupKey(rootDirPosix, isCaseSensitive);
545 │ 
546 │   const ignored = options?.ignored?.map((pattern) => {
547 │     if (/[*?[\]{}()]/.test(pattern)) {
548 │       const isMatch = picomatch(pattern, { dot: true });
549 │ 
550 │       return (filePath: string) => isMatch(toPosixPathNormalized(filePath));
551 │     }
552 │ 
553 │     return { path: toPosixPathNormalized(pattern), recursive: true };
554 │   });
555 │ 
556 ▶   const watcher = chokidar.watch(rootDir, {
557 │     ignoreInitial: true,
558 │     ignored,
559 │     followSymlinks: options?.followSymlinks,
560 ▶     usePolling: !!options?.polling,
561 ▶     interval: options?.interval,
562 │   });
```

polling のときは待ち時間を間隔に合わせます。534 行目は「間隔の 1.5 倍を 100〜250ms に収める」、535 行目は「その 3 倍か 500ms の大きい方」。`--poll 2000` なら debounce は 250ms、maxWait は 750ms です。560 行目で chokidar に `usePolling` を渡します。

> **🧪 DEMO — WatcherQueue に変更を入れる**
>
> 156〜191 行目の規則をこのページで再現した自作の関数です（実物の watcher ではありません）。受け手の `for await` は常に待っている前提です。ファイル名を変えながらボタンを押すと、0.1 秒後（連打なら最大 0.5 秒後）に 1 つの `ChangedFiles` として届きます。
>
> 溜まっている変更：  なし
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cli-cache-watch)

## 3. 再ビルドのループ

📄 `angular-cli/packages/angular/build/src/builders/application/build-action.ts` L196–222 （▶ の行: 197, 199, 209–210, 214, 216, 218–219）

```ts
196 │   // Wait for changes and rebuild as needed
197 ▶   const currentWatchFiles = new Set(result.watchFiles);
198 │   try {
199 ▶     for await (const changes of watcher) {
200 │       if (options.signal?.aborted) {
201 │         break;
202 │       }
203 │ 
204 │       if (clearScreen) {
205 │         // eslint-disable-next-line no-console
206 │         console.clear();
207 │       }
208 │ 
209 ▶       if (verbose) {
210 ▶         logger.info(changes.toDebugString());
211 │       }
212 │ 
213 │       // Clear removed files from current watch files
214 ▶       changes.removed.forEach((removedPath) => currentWatchFiles.delete(removedPath));
215 │ 
216 ▶       resetSassWorkerPoolCaches();
217 │ 
218 ▶       const rebuildState = result.createRebuildState(changes);
219 ▶       result = await withProgress('Changes detected. Rebuilding...', () => action(rebuildState));
220 │ 
221 │       // Log all diagnostic (error/warning/logs) messages
222 │       await logMessages(logger, result, colors, jsonLogs);
```

1. **受け取る**

   199 行目の `for await` が、2 節のキューの `next()` を待ちます。ビルド中に来た変更は次の `ChangedFiles` に溜まります。
2. **消えたファイルを監視から外す**

   214 行目。`removed` だけを使います。
3. **前回の状態を引き継ぐ**

   218 行目の `createRebuildState(changes)` は、前回の結果が持っていた esbuild の context・`SourceFileCache`・`ComponentStylesheetBundler` に、今回の `changes` を添えたものです。
4. **ビルドし直す**

   219 行目、1 回目と同じ `action`（`executeBuild`）に `rebuildState` を渡します。`ng serve --verbose` なら 209〜210 行目で `ChangedFiles` の中身が JSON で出ます。

📄 `angular-cli/packages/angular/build/src/builders/application/build-action.ts` L224–257 （▶ の行: 227, 229, 231, 236, 239–240, 246, 249–250）

```ts
224 │       // Update watched locations provided by the new build result.
225 │       // Keep watching all previous files if there are any errors; otherwise consider all
226 │       // files stale until confirmed present in the new result's watch files.
227 ▶       const staleWatchFiles = result.errors.length > 0 ? undefined : new Set(currentWatchFiles);
228 │       for (const watchFile of result.watchFiles) {
229 ▶         if (!currentWatchFiles.has(watchFile)) {
230 │           // Add new watch location
231 ▶           watcher.add(watchFile);
232 │           currentWatchFiles.add(watchFile);
233 │         }
234 │ 
235 │         // Present so remove from stale locations
236 ▶         staleWatchFiles?.delete(watchFile);
237 │       }
238 │       // Remove any stale locations if the build was successful
239 ▶       if (staleWatchFiles?.size) {
240 ▶         watcher.remove([...staleWatchFiles]);
241 │         for (const staleFile of staleWatchFiles) {
242 │           currentWatchFiles.delete(staleFile);
243 │         }
244 │       }
245 │ 
246 ▶       for (const outputResult of emitOutputResults(
247 │         result,
248 │         outputOptions,
249 ▶         changes,
250 ▶         incrementalResults && !hasInitialErrors ? rebuildState : undefined,
251 │       )) {
252 │         yield outputResult;
253 │       }
254 │ 
255 │       // Clear initial build errors flag if no errors are now present
256 │       hasInitialErrors &&= result.errors.length > 0;
257 │     }
```

227〜244 行目で監視対象を入れ替えます。新しく読んだファイル（新しい import 先など）を足し、もう読まなくなったファイルを外します。227 行目、エラーのときは外しません。import を書きかけで壊したときに、元のファイルの監視が消えないようにするためです。246〜253 行目の `emitOutputResults` は、出力ファイルのハッシュを前回と比べて「足した・変えた・消した」だけを並べた結果（`Incremental`）を作り、dev-server へ渡します。そこでテンプレートだけの変更なら HMR に分かれます。続きは[第 11 回](11-cli-hmr.md)です。

## 4. どの esbuild の context をやり直すか

📄 `angular-cli/packages/angular/build/src/builders/application/execute-build.ts` L86–119 （▶ の行: 87–90, 100, 104–106, 111, 114–115）

```ts
 86 │     if (rebuildState) {
 87 ▶       bundlerContexts = rebuildState.rebuildContexts;
 88 ▶       componentStyleBundler = rebuildState.componentStyleBundler;
 89 ▶       codeBundleCache = rebuildState.codeBundleCache;
 90 ▶       templateUpdates = rebuildState.templateUpdates;
 91 │       executionResult = new ExecutionResult(
 92 │         bundlerContexts,
 93 │         componentStyleBundler,
 94 │         codeBundleCache,
 95 │         templateUpdates,
 96 │       );
 97 │       // Reset template updates for new rebuild
 98 │       templateUpdates?.clear();
 99 │ 
100 ▶       const allFileChanges = rebuildState.fileChanges.all;
101 │ 
102 │       // Bundle all contexts that do not require TypeScript changed file checks.
103 │       // These will automatically use cached results based on the changed files.
104 ▶       bundlingIndividualResults = await BundlerContext.bundleAll(
105 ▶         bundlerContexts.otherContexts,
106 ▶         allFileChanges,
107 │       );
108 │ 
109 │       // Check the TypeScript code bundling cache for changes. If invalid, force a rebundle of
110 │       // all TypeScript related contexts.
111 ▶       const forceTypeScriptRebuild = codeBundleCache?.invalidate(allFileChanges);
112 │       const typescriptResults: BundleContextResult[] = [];
113 │       for (const typescriptContext of bundlerContexts.typescriptContexts) {
114 ▶         typescriptContext.invalidate(allFileChanges);
115 ▶         const result = await typescriptContext.bundle(forceTypeScriptRebuild);
116 │         typescriptResults.push(result);
117 │       }
118 │ 
119 │       bundlingIndividualResults.push(...typescriptResults);
```

87〜90 行目、2 回目以降は context も キャッシュも作らず、前回のものを使います（1 回目に作る所はこの引用のすぐ下の `else` の枝で、[application builder の章](../boot/04-boot-application-build.md)で読みました）。context は 2 組あります。`otherContexts`（グローバルの `styles.scss` や `polyfills` など TypeScript を通さない束）と、`typescriptContexts`（アプリ本体。Angular のコンパイラを持つ束）です。

1. **TypeScript を通さない束**

   104〜107 行目。`bundleAll` が各 context の `invalidate(changes)` を呼んでから `bundle()` します。
2. **TypeScript の束**

   111 行目で先に `SourceFileCache` を無効化し、その戻り値（`forceTypeScriptRebuild`）を 115 行目の `bundle(force)` に渡します。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/bundler-context.ts` L528–558 （▶ の行: 530–531, 536, 538, 545, 553–554）

```ts
528 │     let invalid = false;
529 │     for (const file of candidateFiles) {
530 ▶       if (this.#loadCache?.invalidate(file)) {
531 ▶         invalid = true;
532 │       }
533 │     }
534 │ 
535 │     if (!invalid) {
536 ▶       if (this.watchFiles.size < candidateFiles.size) {
537 │         for (const file of this.watchFiles) {
538 ▶           if (candidateFiles.has(file)) {
539 │             invalid = true;
540 │             break;
541 │           }
542 │         }
543 │       } else {
544 │         for (const file of candidateFiles) {
545 ▶           if (this.watchFiles.has(file)) {
546 │             invalid = true;
547 │             break;
548 │           }
549 │         }
550 │       }
551 │     }
552 │ 
553 ▶     if (invalid) {
554 ▶       this.#esbuildResult = undefined;
555 │     }
556 │ 
557 │     return invalid;
558 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/bundler-context.ts` L195–232 （▶ の行: 197–198）

```ts
195 │   async bundle(force?: boolean): Promise<BundleContextResult> {
196 │     // Return existing result if present
197 ▶     if (!force && this.#esbuildResult) {
198 ▶       return this.#esbuildResult;
199 │     }
200 │ 
201 │     if (!force && this.#activeBundlePromise) {
202 │       return this.#activeBundlePromise;
203 │     }
204 │ 
205 │     const bundlePromise = this.#performBundle().finally(() => {
206 │       if (this.#activeBundlePromise === bundlePromise) {
207 │         this.#activeBundlePromise = undefined;
208 │       }
209 │     });
210 │     this.#activeBundlePromise = bundlePromise;
211 │ 
212 │     const result = await bundlePromise;
213 │     if (this.#shouldCacheResult) {
214 │       this.#esbuildResult = result;
215 │     }
216 │ 
217 │     return result;
218 │   }
219 │ 
220 │   // eslint-disable-next-line max-lines-per-function
221 │   async #performBundle(): Promise<BundleContextResult> {
222 │     // Create esbuild options if not present
223 │     if (this.#esbuildOptions === undefined) {
224 │       if (this.incremental && !this.#loadCache) {
225 │         this.#loadCache = new MemoryLoadResultCache();
226 │       }
227 │       this.#esbuildOptions = this.#optionsFactory(this.#loadCache);
228 │     }
229 │ 
230 │     if (this.incremental) {
231 │       this.watchFiles.clear();
232 │     }
```

`invalidate` は 2 段で判定します。530 行目、変わったファイルの読み込み結果をキャッシュ（`LoadResultCache`）が持っていれば無効。無ければ 536〜550 行目、前回この context が読んだファイル（`watchFiles`）に含まれていれば無効。どちらでもなければ 554 行目を通らず、`#esbuildResult` が残ります。すると `bundle()` の 197〜198 行目が**esbuild を動かさずに前回の結果を返します**。無効なら `#performBundle` に進み、作ってあった esbuild の context の `rebuild()` を呼びます（その行は [application builder の章](../boot/04-boot-application-build.md)で読みました）。esbuild の `rebuild()` は、前回のビルドの状態を context に持ったまま組み直す、esbuild 自身の incremental なビルドです。

## 5. TypeScript 側で捨てるもの・残すもの

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular/source-file-cache.ts` L12–50 （▶ の行: 13–15, 19, 33, 38, 43–45, 48）

```ts
12 │ export class SourceFileCache {
13 ▶   readonly modifiedFiles = new Set<string>();
14 ▶   readonly typeScriptFileCache = new Map<string, string | Uint8Array>();
15 ▶   readonly loadResultCache = new MemoryLoadResultCache();
16 │ 
17 │   referencedFiles?: readonly string[];
18 │ 
19 ▶   constructor(readonly persistentCachePath?: string) {}
20 │ 
21 │   /**
22 │    * Releases all cached content. The cached data is only needed for incremental
23 │    * rebuilds and can include the emitted contents of every TypeScript file in the
24 │    * program. The cache is repopulated if a build is performed after this is called.
25 │    */
26 │   clear(): void {
27 │     this.modifiedFiles.clear();
28 │     this.typeScriptFileCache.clear();
29 │     this.loadResultCache.clear();
30 │     this.referencedFiles = undefined;
31 │   }
32 │ 
33 ▶   invalidate(files: Iterable<string>): boolean {
34 │     if (files !== this.modifiedFiles) {
35 │       this.modifiedFiles.clear();
36 │     }
37 │ 
38 ▶     const extraWatchFiles = new Set(this.referencedFiles?.map(path.normalize));
39 │ 
40 │     let invalid = false;
41 │     for (let file of files) {
42 │       file = path.normalize(file);
43 ▶       invalid = this.loadResultCache.invalidate(file) || invalid;
44 ▶       invalid = extraWatchFiles.has(file) || invalid;
45 ▶       this.modifiedFiles.add(file);
46 │     }
47 │ 
48 ▶     return invalid;
49 │   }
50 │ }
```

`SourceFileCache` はメモリ上の 3 つの入れ物をまとめたものです。13 行目の `modifiedFiles`（今回変わったファイル）、14 行目の `typeScriptFileCache`（ファイル名 → コンパイル後の JS）、15 行目の `loadResultCache`（esbuild の `onLoad` の結果）。`invalidate` は 45 行目で変わったファイルを覚え、43 行目で読み込み結果を捨てます。48 行目の戻り値が真になるのは、43 行目で何か捨てたか、44 行目でテンプレートや CSS など「コンパイラが読んだ資源」が変わったときです。これが 4 節 115 行目の `force` になります。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/load-result-cache.ts` L19–49 （▶ の行: 28–29, 31–32, 39–40, 43）

```ts
19 │ export function createCachedLoad(
20 │   cache: LoadResultCache | undefined,
21 │   callback: Parameters<PluginBuild['onLoad']>[1],
22 │ ): Parameters<PluginBuild['onLoad']>[1] {
23 │   if (cache === undefined) {
24 │     return callback;
25 │   }
26 │ 
27 │   return async (args) => {
28 ▶     const loadCacheKey = `${args.namespace}:${args.path}`;
29 ▶     let result: OnLoadResult | null | undefined = await cache.get(loadCacheKey);
30 │ 
31 ▶     if (result === undefined) {
32 ▶       result = await callback(args);
33 │ 
34 │       // Do not cache null or undefined
35 │       if (result) {
36 │         // Ensure requested path is included if it was a resolved file
37 │         if (args.namespace === 'file') {
38 │           result.watchFiles ??= [];
39 ▶           if (!result.watchFiles.includes(args.path)) {
40 ▶             result.watchFiles.push(args.path);
41 │           }
42 │         }
43 ▶         await cache.put(loadCacheKey, result);
44 │       }
45 │     }
46 │ 
47 │     return result;
48 │   };
49 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/load-result-cache.ts` L95–121 （▶ の行: 100, 105, 111, 116–117）

```ts
 95 │     this.#loadResults.set(path, result);
 96 │     if (result.watchFiles) {
 97 │       for (const watchFile of result.watchFiles) {
 98 │         // Normalize the watch file path to ensure OS consistent paths
 99 │         const normalizedWatchFile = normalize(watchFile);
100 ▶         let affected = this.#fileDependencies.get(normalizedWatchFile);
101 │         if (affected === undefined) {
102 │           affected = new Set();
103 │           this.#fileDependencies.set(normalizedWatchFile, affected);
104 │         }
105 ▶         affected.add(path);
106 │       }
107 │     }
108 │   }
109 │ 
110 │   invalidate(path: string): boolean {
111 ▶     const affectedPaths = this.#fileDependencies.get(path);
112 │     if (!affectedPaths) {
113 │       return false;
114 │     }
115 │ 
116 ▶     for (const affected of affectedPaths) {
117 ▶       this.#loadResults.delete(affected);
118 │     }
119 │ 
120 │     return true;
121 │   }
```

esbuild のプラグインの `onLoad` は `createCachedLoad` で包まれています。28 行目の鍵は「名前空間:パス」、29 行目で当たれば読み込み処理を飛ばします。43 行目で保存するとき、`MemoryLoadResultCache.put` は 100〜105 行目で「この結果はどのファイルに依存するか」の逆引き表を作ります。111〜117 行目、あるファイルが変わったら、それに依存する結果をすべて消します。Sass の `@use` 先が変わったとき、それを読んだスタイルの結果も消えるのはこの表のおかげです。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular/compiler-plugin.ts` L179–202 （▶ の行: 181, 187, 189–190, 194, 197, 200–201）

```ts
179 │ 
180 │         // Reset debug performance tracking
181 ▶         resetCumulativeDurations();
182 │ 
183 │         // Update the reference tracker and generate a full set of modified files for the
184 │         // Angular compiler which does not have direct knowledge of transitive resource
185 │         // dependencies or web worker processing.
186 │         let modifiedFiles;
187 ▶         if (pluginOptions.sourceFileCache?.modifiedFiles.size) {
188 │           // TODO: Differentiate between changed input files and stale output files
189 ▶           modifiedFiles = referencedFileTracker.update(pluginOptions.sourceFileCache.modifiedFiles);
190 ▶           pluginOptions.sourceFileCache.invalidate(modifiedFiles);
191 │           // External runtime styles are invalidated and rebuilt at the beginning of a rebuild to avoid
192 │           // the need to execute the application bundler for component style only changes.
193 │           if (!pluginOptions.externalRuntimeStyles) {
194 ▶             stylesheetBundler.invalidate(modifiedFiles);
195 │           }
196 │           // Remove any stale additional results based on modified files
197 ▶           modifiedFiles.forEach((file) => additionalResults.delete(file));
198 │         }
199 │ 
200 ▶         if (compilation.update && pluginOptions.sourceFileCache?.modifiedFiles.size) {
201 ▶           await compilation.update(modifiedFiles ?? pluginOptions.sourceFileCache.modifiedFiles);
202 │         }
```

esbuild が `rebuild()` を始めると、Angular のプラグインの `onStart` が呼ばれます。189 行目、`referencedFileTracker` が間接の依存を足して変更の集合を広げます。たとえば Sass の `@use` 先の部分ファイルが変わったら、それを読んだコンポーネントのスタイルファイルとコンポーネントのファイルも「変わった」に入れます。Angular のコンパイラは `@use` 先までは知らないからです。194 行目でコンポーネントのスタイルの結果を捨て（中身は[第 4 回](04-cli-component-styles.md)）、201 行目で `AotCompilation` に変更を伝えます。

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/typescript-compilation.ts` L78–88 （▶ の行: 78, 82, 86–87）

```ts
78 ▶   protected readonly sourceFiles = new Map<string, ts.SourceFile>();
79 │ 
80 │   protected invalidateFiles(files: Iterable<string>): void {
81 │     for (const file of files) {
82 ▶       this.sourceFiles.delete(toPosixPath(file));
83 │     }
84 │   }
85 │ 
86 ▶   override async update(files: Set<string>): Promise<void> {
87 ▶     this.invalidateFiles(files);
88 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/angular/angular-host.ts` L56–84 （▶ の行: 65–66, 69, 79）

```ts
56 │ function augmentHostWithCaching(host: ts.CompilerHost, cache: Map<string, ts.SourceFile>): void {
57 │   const baseGetSourceFile = host.getSourceFile;
58 │   host.getSourceFile = function (
59 │     fileName,
60 │     languageVersion,
61 │     onError,
62 │     shouldCreateNewSourceFile,
63 │     ...parameters
64 │   ) {
65 ▶     if (!shouldCreateNewSourceFile && cache.has(fileName)) {
66 ▶       return cache.get(fileName);
67 │     }
68 │ 
69 ▶     const file = baseGetSourceFile.call(
70 │       host,
71 │       fileName,
72 │       languageVersion,
73 │       onError,
74 │       true,
75 │       ...parameters,
76 │     );
77 │ 
78 │     if (file) {
79 ▶       cache.set(fileName, file);
80 │     }
81 │ 
82 │     return file;
83 │   };
84 │ }
```

TypeScript の構文木（`ts.SourceFile`）もメモリに残します。78 行目の Map がその入れ物で、82 行目で変わったファイルだけ消します。コンパイラホストの `getSourceFile` は 65〜66 行目で Map に当たればそれを返すので、変わっていない数百のファイルは解析し直しません。この構文木と前回の program を土台に、`AotCompilation.initialize` が新しい program を作る所は[第 3 回](03-cli-angular-compilation.md)で読みます。

## 6. ディスクに残すキャッシュ：.angular/cache

ここまではすべてメモリの話で、`ng serve` を止めると消えます。次の起動を速くするためにディスクにも書きます。置き場所を決めるのがこの関数です。

📄 `angular-cli/packages/angular/build/src/utils/normalize-cache.ts` L95–131 （▶ の行: 99, 103–105, 107, 111–113, 115–116, 121, 127）

```ts
 95 │ export function normalizeCacheOptions(
 96 │   projectMetadata: unknown,
 97 │   workspaceRoot: string,
 98 │ ): NormalizedCachedOptions {
 99 ▶   const cacheMetadata = hasCacheMetadata(projectMetadata) ? projectMetadata.cli.cache : {};
100 │ 
101 │   const {
102 │     // Webcontainers do not currently benefit from persistent disk caching and can lead to increased browser memory usage
103 ▶     enabled = !process.versions.webcontainer,
104 ▶     environment = 'local',
105 ▶     path = '.angular/cache',
106 │   } = cacheMetadata;
107 ▶   const isCI = process.env['CI'] === '1' || process.env['CI']?.toLowerCase() === 'true';
108 │ 
109 │   let cacheEnabled = enabled;
110 │   if (cacheEnabled) {
111 ▶     switch (environment) {
112 ▶       case 'ci':
113 ▶         cacheEnabled = isCI;
114 │         break;
115 ▶       case 'local':
116 ▶         cacheEnabled = !isCI;
117 │         break;
118 │     }
119 │   }
120 │ 
121 ▶   const cacheBasePath = getCacheBasePath(workspaceRoot, path);
122 │   const localCacheBasePath = isAbsolute(path) ? path : resolve(workspaceRoot, path);
123 │ 
124 │   return {
125 │     enabled: cacheEnabled,
126 │     basePath: cacheBasePath,
127 ▶     path: join(cacheBasePath, VERSION),
128 │     localBasePath: localCacheBasePath,
129 │     localPath: join(localCacheBasePath, VERSION),
130 │   };
131 │ }
```

1. **設定を読む**

   99 行目。`angular.json` の `cli.cache`（プロジェクトの設定）です。無ければ 103〜105 行目の既定：有効・`environment: "local"`・`.angular/cache`。
2. **CI かどうかで切る**

   107 行目、環境変数 `CI` が `1` か `true` なら CI。`local` は CI では切り、`ci` は CI でだけ使い、`all` は両方で使います（111〜118 行目）。
3. **場所を決める**

   121 行目。相対パスなら git のルートを探し、git worktree の中なら本体のリポジトリ側の `.angular/cache` を使います（worktree ごとに冷えたキャッシュから始めないため）。127 行目で版の番号のフォルダを足します。application builder はさらにプロジェクト名のフォルダを足します。

このサイトのリポジトリで実際に見ると `.angular/cache/22.1.7/angular-deep-dive/` の中に `.tsbuildinfo`（約 310kB）・`angular-compiler.db`（約 4.9MB）と `angular-compiler.db-lock`・Vite の事前バンドル用の `vite/`（`deps` と `deps_ssr`）がありました。前の 2 つを書くのが次の 2 か所です。

📄 `angular-cli/packages/angular/build/src/tools/angular/compilation/compiler-options.ts` L68–75 （▶ の行: 69–70, 72）

```ts
68 │   // Enable incremental compilation by default if caching is enabled and incremental is not explicitly disabled
69 ▶   if (compilerOptions.incremental !== false && overrides?.cachePath) {
70 ▶     compilerOptions.incremental = true;
71 │     // Set the build info file location to the configured cache directory
72 ▶     compilerOptions.tsBuildInfoFile = path.join(overrides.cachePath, '.tsbuildinfo');
73 │   } else {
74 │     compilerOptions.incremental = false;
75 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular/compiler-plugin.ts` L83–104 （▶ の行: 84, 86–87, 90, 99）

```ts
 83 │       let cacheStore: PersistentCacheStore | undefined;
 84 ▶       if (pluginOptions.sourceFileCache?.persistentCachePath && !process.versions.webcontainer) {
 85 │         try {
 86 ▶           cacheStore = await createPersistentCacheStore(
 87 ▶             path.join(pluginOptions.sourceFileCache.persistentCachePath, 'angular-compiler'),
 88 │           );
 89 │         } catch (e) {
 90 ▶           setupWarnings.push({
 91 │             text: 'Unable to initialize JavaScript cache storage.',
 92 │             location: null,
 93 │             notes: [
 94 │               ...(e as Error).message
 95 │                 .split('\n')
 96 │                 .slice(1)
 97 │                 .map((text) => ({ text })),
 98 │               {
 99 ▶                 text: 'This will not affect the build output content but may result in slower builds.',
100 │               },
101 │             ],
102 │           });
103 │         }
104 │       }
```

72 行目、キャッシュが有効なら TypeScript の incremental ビルドを強制的に有効にし、型の情報を `.tsbuildinfo` に書かせます。次の起動では、前回の program がメモリに無いので、この `.tsbuildinfo` を読んで「変わっていないファイルの型チェックを省く」ことができます。86〜87 行目は `angular-compiler` という名前で永続の store を開きます。失敗しても 90〜102 行目の警告を出すだけで、ビルドは続きます（99 行目「出力の中身には影響しない」）。この store から `createCache('jstransformer')` で切り出した Cache を、[第 5 回](05-cli-javascript-transformer.md)の `JavaScriptTransformer` が使います。鍵はファイルの中身と変換の設定から作ったハッシュ、値は変換後の JS です。

📄 `angular-cli/packages/angular/build/src/utils/environment-options.ts` L224–238 （▶ の行: 226, 229, 233）

```ts
224 │ /**
225 │  * The persistent cache store configuration to use.
226 ▶  * Managed by the `NG_BUILD_CACHE_STORE` environment variable.
227 │  * - 'lmdb': Forces the use of LMDB.
228 │  * - 'sqlite': Forces the use of SQLite.
229 ▶  * - undefined / 'auto' / other: Automatically uses LMDB and falls back to SQLite.
230 │  */
231 │ export const persistentCacheStoreSetting = (() => {
232 │   const env = process.env['NG_BUILD_CACHE_STORE']?.trim().toLowerCase();
233 ▶   if (env === 'lmdb' || env === 'sqlite') {
234 │     return env;
235 │   }
236 │ 
237 │   return undefined;
238 │ })();
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/cache.ts` L299–336 （▶ の行: 301, 316–317, 319–320, 322, 324）

```ts
299 │   }
300 │ 
301 ▶   if (persistentCacheStoreSetting === 'lmdb') {
302 │     try {
303 │       const { LmdbCacheStore } = await import('./lmdb-cache-store');
304 │ 
305 │       return new LmdbCacheStore(baseCachePath + '.db');
306 │     } catch (err) {
307 │       assertIsError(err);
308 │ 
309 │       throw new Error(
310 │         'Unable to initialize JavaScript cache storage.\n' + `LMDB error: ${err.message}`,
311 │         { cause: err },
312 │       );
313 │     }
314 │   }
315 │ 
316 ▶   try {
317 ▶     const { LmdbCacheStore } = await import('./lmdb-cache-store');
318 │ 
319 ▶     return new LmdbCacheStore(baseCachePath + '.db');
320 ▶   } catch (lmdbError) {
321 │     try {
322 ▶       const { SqliteCacheStore } = await import('./sqlite-cache-store');
323 │ 
324 ▶       return new SqliteCacheStore(baseCachePath + '-sqlite.db');
325 │     } catch (sqliteError) {
326 │       assertIsError(lmdbError);
327 │       assertIsError(sqliteError);
328 │ 
329 │       throw new Error(
330 │         'Unable to initialize JavaScript cache storage.\n' +
331 │           `LMDB error: ${lmdbError.message.split('\n')[0]}\n` +
332 │           `SQLite error: ${sqliteError.message.split('\n')[0]}`,
333 │         { cause: sqliteError },
334 │       );
335 │     }
336 │   }
```

既定は LMDB です（316〜319 行目）。`lmdb` は optionalDependencies なので、ネイティブのバイナリが入らない環境では import に失敗し、320〜324 行目で Node 組み込みの `node:sqlite` を使う SQLite の store に落ちます。`NG_BUILD_CACHE_STORE=lmdb` / `sqlite` で固定できます（233 行目。`sqlite` を指定したときの分岐はこの引用のすぐ上にあり、LMDB を試さずに SQLite を開きます）。このサイトの `angular-compiler.db` は LMDB のファイルです（SQLite なら名前が `angular-compiler-sqlite.db` になります）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/cache.ts` L59–85 （▶ の行: 66, 70）

```ts
59 │ export class NamespacedCacheStore<V> implements CacheStore<V> {
60 │   readonly #prefix: string;
61 │ 
62 │   constructor(
63 │     private readonly store: CacheStore<V>,
64 │     readonly namespace: string,
65 │   ) {
66 ▶     this.#prefix = `${namespace.length}:${namespace}:`;
67 │   }
68 │ 
69 │   get(key: string): V | undefined | Promise<V | undefined> {
70 ▶     return this.store.get(this.#prefix + key);
71 │   }
72 │ 
73 │   has(key: string): boolean | Promise<boolean> {
74 │     return this.store.has(this.#prefix + key);
75 │   }
76 │ 
77 │   set(key: string, value: V): this | Promise<this> {
78 │     const result = this.store.set(this.#prefix + key, value);
79 │     if (result instanceof Promise) {
80 │       return result.then(() => this);
81 │     }
82 │ 
83 │     return this;
84 │   }
85 │ }
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/lmdb-cache-store.ts` L16–50 （▶ の行: 21–23, 43, 49）

```ts
16 │   constructor(readonly cachePath: string) {
17 │     this.#cacheFileUrl = cachePath;
18 │   }
19 │ 
20 │   #ensureCacheFile(): RootDatabase {
21 ▶     this.#db ??= open({
22 ▶       path: this.#cacheFileUrl,
23 ▶       compression: true,
24 │     });
25 │ 
26 │     return this.#db;
27 │   }
28 │ 
29 │   // eslint-disable-next-line @typescript-eslint/no-explicit-any
30 │   async get(key: string): Promise<any> {
31 │     const db = this.#ensureCacheFile();
32 │     const value = db.get(key);
33 │ 
34 │     return value;
35 │   }
36 │ 
37 │   has(key: string): boolean {
38 │     return this.#ensureCacheFile().doesExist(key);
39 │   }
40 │ 
41 │   async set(key: string, value: unknown): Promise<this> {
42 │     const db = this.#ensureCacheFile();
43 ▶     await db.put(key, value);
44 │ 
45 │     return this;
46 │   }
47 │ 
48 │   createCache<V = unknown>(namespace: string): Cache<V> {
49 ▶     return new Cache<V>(new NamespacedCacheStore<V>(this, namespace));
50 │   }
```

1 つの DB を複数の用途で分け合うので、鍵に名前空間を付けます。66 行目、`"13:jstransformer:"` のように長さを前に付けるので、名前空間や鍵にコロンが入っていても衝突しません。LMDB の store は 21〜23 行目で圧縮付きで開き、43 行目でそのまま書きます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/sqlite-cache-store.ts` L321–356 （▶ の行: 329–331, 342, 345）

```ts
321 │   close(): void {
322 │     this.#flushAccessUpdates();
323 │ 
324 │     if (this.#db) {
325 │       try {
326 │         this.#db.exec('BEGIN IMMEDIATE TRANSACTION;');
327 │         try {
328 │           // 1. Delete items older than N days
329 ▶           this.#db
330 ▶             .prepare("DELETE FROM cache WHERE last_accessed < unixepoch('now', ?);")
331 ▶             .run(`-${this.ttlDays} days`);
332 │ 
333 │           // 2. Prune oldest items if payload exceeds maxPayloadSize
334 │           // Skip the expensive window aggregate query if total database size is below maxPayloadSize
335 │           const sizeResult = this.#db
336 │             .prepare(
337 │               'SELECT (page_count - freelist_count) * page_size AS total_size ' +
338 │                 'FROM pragma_page_count(), pragma_freelist_count(), pragma_page_size();',
339 │             )
340 │             .get() as { total_size?: number } | undefined;
341 │ 
342 ▶           if ((sizeResult?.total_size ?? 0) > this.maxPayloadSize) {
343 │             this.#db
344 │               .prepare(
345 ▶                 `DELETE FROM cache WHERE key IN (
346 │                   SELECT key FROM (
347 │                     SELECT key,
348 │                            sum(length(key) + length(value)) OVER (ORDER BY last_accessed DESC, key DESC) as running_size
349 │                     FROM cache
350 │                   ) WHERE running_size > ?
351 │                 );`,
352 │               )
353 │               .run(this.maxPayloadSize);
354 │           }
355 │ 
356 │           this.#db.exec('COMMIT;');
```

SQLite の store は閉じるときに掃除します。329〜331 行目で 14 日（コンストラクタの `ttlDays`）使っていない行を消し、342〜353 行目で 1GiB を超えた分を古い順に消します。

### キャッシュの層

| 層 | 入れ物 | 何を覚えるか | いつ捨てるか |
| --- | --- | --- | --- |
| メモリ | esbuild の context（`BundlerContext`） | 束ごとの前回の結果と、esbuild 内部の解決結果 | 読んだファイルが変わったとき（4 節 553〜555 行目） |
| メモリ | `MemoryLoadResultCache` | `onLoad` の結果と、その依存ファイル | 依存ファイルが変わったとき（5 節 111〜117 行目） |
| メモリ | `typeScriptFileCache` | ファイル → コンパイル後の JS | コンパイラが出し直したファイルだけ上書き |
| メモリ | `sourceFiles`（構文木） | `ts.SourceFile` | そのファイルが変わったとき（5 節 82 行目） |
| メモリ | 前回の `NgtscProgram` と builder program | Angular の解析結果・型チェックの結果 | 毎回作り直すが、前回を土台にする（第 3 回） |
| ディスク | `.tsbuildinfo` | TypeScript の incremental 情報 | TypeScript が毎回書き直す |
| ディスク | `angular-compiler.db`（LMDB / SQLite） | JS 変換の結果（`jstransformer`） | 鍵が中身のハッシュなので消さない。SQLite は 14 日・1GiB で掃除 |
| ディスク | `vite/` | dev-server の依存の事前バンドル（[dev-server の章](../boot/03-boot-dev-server.md)） | Vite が依存の変化で作り直す |

## 7. 古いキャッシュを消す所

📄 `angular-cli/packages/angular/build/src/utils/purge-cache.ts` L31–57 （▶ の行: 31, 45, 51, 54–55）

```ts
31 ▶   const basePaths = new Set([basePath]);
32 │   if (localBasePath) {
33 │     basePaths.add(localBasePath);
34 │   }
35 │ 
36 │   for (const base of basePaths) {
37 │     let baseEntries;
38 │     try {
39 │       baseEntries = await readdir(base, { withFileTypes: true });
40 │     } catch {
41 │       // No purging possible if base path does not exist or cannot otherwise be accessed
42 │       continue;
43 │     }
44 │ 
45 ▶     const currentPath = base === localBasePath ? localPath : path;
46 │     if (!currentPath) {
47 │       // Avoid purging if current path is unavailable to prevent deleting the active cache
48 │       continue;
49 │     }
50 │ 
51 ▶     const entriesToDelete = baseEntries
52 │       .filter((d) => d.isDirectory())
53 │       .map((d) => join(base, d.name))
54 ▶       .filter((cachePath) => cachePath !== currentPath)
55 ▶       .map((stalePath) => rm(stalePath, { force: true, recursive: true, maxRetries: 3 }));
56 │ 
57 │     await Promise.allSettled(entriesToDelete);
```

application builder と dev-server は、起動のたびに `purgeStaleBuildCache` を呼びます。54 行目、今の版のフォルダ（`22.1.7`）**以外**を消します。`ng update` で版が上がると、古い版のキャッシュは次のビルドで消えます。

📄 `angular-cli/packages/angular/cli/src/commands/cache/clean/cli.ts` L18–37 （▶ の行: 29, 31）

```ts
18 │ export class CacheCleanModule extends CommandModule implements CommandModuleImplementation {
19 │   command = 'clean';
20 │   describe = 'Deletes persistent disk cache from disk.';
21 │   longDescriptionPath: string | undefined;
22 │   override scope = CommandScope.In;
23 │ 
24 │   builder(localYargs: Argv): Argv {
25 │     return localYargs.strict();
26 │   }
27 │ 
28 │   run(): Promise<void> {
29 ▶     const { path } = getCacheConfig(this.context.workspace);
30 │ 
31 ▶     return rm(path, {
32 │       force: true,
33 │       recursive: true,
34 │       maxRetries: 3,
35 │     });
36 │   }
37 │ }
```

## ここまでの呼び出し

- 👤 `保存` — エディタ — *OS の通知*
  - `handleEvents` — watcher.ts L429 — *監視対象だけ・種類を 3 つに*
    - `WatcherQueue.addChanges → scheduleFlush → flush` — watcher.ts L161-207 — *100ms / 最大 500ms でまとめる*
  - `for await (const changes of watcher)` — build-action.ts L199
    - `result.createRebuildState(changes)` — build-action.ts L218
    - `executeBuild(…, rebuildState)` — execute-build.ts L86-119
      - `BundlerContext.invalidate / bundle` — bundler-context.ts L485, L195 — *読んでいなければ前回の結果*
      - `SourceFileCache.invalidate` — source-file-cache.ts L33
        - `esbuildContext.rebuild()` — bundler-context.ts L238
          - `onStart → compilation.update / initialize` — compiler-plugin.ts L160- — *第 3 回*
    - `emitOutputResults` — build-action.ts L266 — *ハッシュの差だけ dev-server へ・HMR は第 11 回*

## 聞かれそうな質問

**Q. `.angular/cache` は消してよいですか？git に入れるべきですか？**

消してかまいません。6 節 99 行目の警告文にあるとおり、ディスクのキャッシュは出力の中身に影響せず、遅くなるだけです。中身は 72 行目の `.tsbuildinfo` と、中身のハッシュを鍵にした変換結果なので、無ければ作り直されます。消すなら `ng cache clean`（31 行目でフォルダごと `rm`）。版が上がったときは 54 行目で古い版のフォルダが自動で消えます。マシンや OS ごとの内容（LMDB のファイル）なので git には入れません。`ng new` の `.gitignore` にも入っています。

**Q. CI でもキャッシュを効かせたいです。**

既定の `environment: "local"` は、107 行目で `CI=true` を見ると 116 行目でキャッシュを切ります。`angular.json` の `cli.cache.environment` を `"all"`（または `"ci"`）にし、CI の仕組みで `.angular/cache` を保存・復元します。`ng cache enable` / `disable` が書き換えるのは `enabled` だけなので、`environment` は `angular.json` を直接書きます。LMDB のネイティブのバイナリが入らない CI イメージでは、6 節 320〜324 行目で SQLite の store に落ちます。

**Q. ネットワークドライブや Docker のマウントで、保存しても再ビルドされません。**

Parcel も chokidar の通常モードも OS の通知を待つ方式で、ネットワークドライブや一部のコンテナのマウントでは通知が届きません。`ng serve --poll 1000` のように数値を渡すと、1 節 137 行目で `polling: true` になり、255〜256 行目で chokidar の polling（560 行目 `usePolling`）に切り替わります。その分 CPU を使い、待ち時間も 534〜535 行目の式で長くなります。

**Q. 1 文字変えただけなのに、全部ビルドし直しているように見えます。**

ログの「Changes detected. Rebuilding...」（3 節 219 行目）は毎回出ますが、中でやり直すのは 4 節で無効になった context だけです。アプリ本体の TypeScript の束は、`.ts` を変えれば必ずやり直しますが、Angular のコンパイラは変わったファイルと、その影響を受けるファイルだけを出し直します（第 3 回）。どこに時間がかかっているかは `NG_BUILD_DEBUG_PERF=1` で段ごとの時間が出ます（5 節 181 行目の `resetCumulativeDurations` がその計測のリセット）。

**Q. `node_modules` の中のファイルを直接書き換えたのに反映されません。**

監視するのは 3 節の `watchFiles`、つまり esbuild が読んだファイルだけです（2 節 434 行目）。`node_modules` のファイルも読んでいれば入りますが、Vite が事前バンドルしたものは dev-server 側の `vite/` のキャッシュから配られます。`npm install` し直したときは `ng serve` を起動し直すのが確実です。

## 読み終えて

- 保存は Parcel（polling や symlink なら chokidar）で受け、ビルドが読んだファイルだけを `added` / `modified` / `removed` の Set に溜める。100ms 待ち、最大 500ms でまとめる。
- `runEsBuildBuildAction` の `for await` が受け取り、前回の context とキャッシュを `RebuildState` にして `executeBuild` を呼び直す。
- context は「変わったファイルを読んだか」で判定し、読んでいなければ esbuild を動かさず前回の結果を返す。読んでいれば esbuild の `rebuild()`。
- メモリには onLoad の結果・コンパイル後の JS・構文木・前回の program が残り、変わった所だけ捨てる。
- ディスクの `.angular/cache/<版>/<プロジェクト>/` には `.tsbuildinfo` と JS 変換の結果（既定 LMDB、無理なら SQLite）。消しても遅くなるだけ。

---

← 前: [i18n：1 回ビルドして、ロケールごとに翻訳を差し込む](09-cli-i18n.md)  
次: [コンポーネントの HMR：画面を保ったままテンプレートとスタイルを差し替える](11-cli-hmr.md) →
