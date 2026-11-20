[目次](../README.md) › [tools/esbuild の読み残し：束ね方の設定・JS の後処理・watch・i18n の差し込み・スタイル・コンパイラプラグインの残りを行で埋める](README.md) › 第 3 回 / 全 7 回

# watcher：ファイルの変更を拾って ChangedFiles にまとめるまで

> tools/esbuild/watcher.ts の未読の行：BuildWatcher と options、パスの正規化と照合のキー、変更をまとめて next() で返す WatcherQueue、cwd の外のファイルを購読する ParcelExternalManager、createParcelWatcher と createChokidarWatcher の add・remove・close。

angular/angular-cli · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/esb-watcher)

---

`ng serve` や `ng build --watch` は、最初のビルドが終わると `for await (const changes of watcher)` で待ちます。保存すると `ChangedFiles`（added・modified・removed の 3 つの集合）が 1 つ届き、再ビルドが始まります。この章では、その watcher の中身、つまり**パスをどう正規化して照合し、OS の通知をどう 1 つの ChangedFiles にまとめ、cwd の外のファイルをどう監視するか**を読みます。デモでは、本物の `createWatcher` を一時フォルダに当てて、12 通りの操作で `next()` が返したものを記録して再生します。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/tools/esbuild/watcher.ts` です。watcher を作って再ビルドを回す側（build-action.ts）と、ChangedFiles・大文字小文字の判定・キューの schedule・Parcel のイベントの処理・chokidar の作り方は [キャッシュと watch の章](../cli/10-cli-cache-watch.md)で読みました。このファイルは a6ef9cfbea（2026-07-24）でwatchpack から @parcel/watcher と chokidar に作り替えられたばかりで、22.2.7 では `utils/watcher.ts` に移り、5 節・6 節の作りが大きく変わっています。

1. [1. 束ね方の設定を作る関数](01-esb-code-bundle.md)
2. [2. JavaScriptTransformer](02-esb-js-transformer.md)
3. **3. watcher**（この章）
4. [4. I18nInliner](04-esb-i18n-inliner.md)
5. [5. スタイルのプラグイン](05-esb-styles.md)
6. [6. compiler-plugin の残り](06-esb-compiler-rest.md)
7. [7. spec と issue](07-esb-tests-issues.md)

## 1. 外から見た形

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L35–52 （▶ の行: 36–39, 43–47）

```ts
35 │ 
36 ▶ export interface BuildWatcher extends AsyncIterableIterator<ChangedFiles> {
37 ▶   add(paths: string | readonly string[]): void;
38 ▶   remove(paths: string | readonly string[]): void;
39 ▶   close(): Promise<void>;
40 │ }
41 │ 
42 │ export interface WatcherOptions {
43 ▶   polling?: boolean;
44 ▶   interval?: number;
45 ▶   ignored?: string[];
46 ▶   followSymlinks?: boolean;
47 ▶   cwd?: string;
48 │ }
49 │ 
50 │ /**
51 │  * Probes the filesystem at the specified target directory to determine whether it is case-sensitive.
52 │  */
```

36 行目、`BuildWatcher` は `ChangedFiles` を返す非同期イテレーター（`for await` で回せる物）に、監視するパスを足す・外す・閉じるの 3 つを足した形です。43〜47 行目の options は、build-action.ts が angular.json の `poll`・`preserveSymlinks`、出力先とキャッシュのフォルダ（ignored）、ワークスペースの根（cwd）から作ります。監視するのは「プロジェクト全体」ではなく、最初のビルドの `watchFiles`（esbuild が読んだファイル・tsconfig・スタイルの partial など）を `add` したものだけです。

## 2. パスの正規化と、照合のキー

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L79–115 （▶ の行: 84–87, 96–97, 103–106, 108–110）

```ts
 79 │ 
 80 │ /**
 81 │  * Normalizes a file system path string to POSIX format (forward slashes '/')
 82 │  * and strips trailing slashes (except root '/' or Windows drive root 'C:/').
 83 │  */
 84 ▶ export function toPosixPathNormalized(pathString: string): string {
 85 ▶   let posixPath = toPosixPath(pathString);
 86 ▶   if (posixPath.length > 1 && posixPath.endsWith('/') && !/^[a-zA-Z]:\/$/.test(posixPath)) {
 87 ▶     posixPath = posixPath.slice(0, -1);
 88 │   }
 89 │ 
 90 │   return posixPath;
 91 │ }
 92 │ 
 93 │ /**
 94 │  * Returns a lookup key for set lookups and matching, lowercasing on case-insensitive file systems.
 95 │  */
 96 ▶ function toLookupKey(posixPath: string, isCaseSensitive: boolean): string {
 97 ▶   return isCaseSensitive ? posixPath : posixPath.toLowerCase();
 98 │ }
 99 │ 
100 │ /**
101 │  * Returns the parent directory of a normalized POSIX path, correctly handling Windows drive roots.
102 │  */
103 ▶ export function getDirectoryPath(posixPath: string): string {
104 ▶   const lastSlash = posixPath.lastIndexOf('/');
105 ▶   if (lastSlash === -1) {
106 ▶     return '.';
107 │   }
108 ▶   const dir = posixPath.slice(0, lastSlash);
109 ▶   if (dir === '' || dir.endsWith(':')) {
110 ▶     return dir + '/';
111 │   }
112 │ 
113 │   return dir;
114 │ }
115 │ 
```

同じファイルを指すパスが、esbuild からは `C:\app\src\a.ts`、OS の通知からは `c:/app/src/a.ts` のように違う形で来ても、同じキーになるようにそろえます。

1. **区切りを / に、末尾の / を外す**

   84〜91 行目。ただし根の `/` と、Windows のドライブの根 `C:/` は残します（86 行目）。
2. **大文字小文字を区別しないファイルシステムなら小文字に**

   96〜98 行目。区別するかどうかは、53〜78 行目（[前の章](../cli/10-cli-cache-watch.md)の引用）が cwd の大文字小文字を反転させたパスが存在するかで調べます。
3. **親のフォルダ**

   103〜114 行目。/ が無ければ `.`、親が空か `C:` なら `/` を足して根にします。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L116–138 （▶ の行: 119–120, 124, 126–127, 130–131）

```ts
116 │ /**
117 │  * Determines whether a file path lookup key or any of its parent directories are present in watchedFiles.
118 │  */
119 ▶ function isPathWatched(fileLookupKey: string, watchedFiles: Set<string>): boolean {
120 ▶   if (watchedFiles.has(fileLookupKey)) {
121 │     return true;
122 │   }
123 │ 
124 ▶   let current = fileLookupKey;
125 │   while (true) {
126 ▶     const parent = getDirectoryPath(current);
127 ▶     if (parent === current) {
128 │       break;
129 │     }
130 ▶     if (watchedFiles.has(parent)) {
131 ▶       return true;
132 │     }
133 │     current = parent;
134 │   }
135 │ 
136 │   return false;
137 │ }
138 │ 
```

`isPathWatched` は、通知が来たファイルのキーそのものか、その親のどれかが `add` されていれば真です。126 行目で 1 つずつ親にのぼり、127 行目で根に着いたら（親が自分と同じ）やめます。だから `add` したのがフォルダなら、その下に新しく作られたファイルも拾えます。デモの「追加（フォルダを監視）」がこれです。

## 3. WatcherQueue：通知をまとめて、next() に渡す

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L139–155 （▶ の行: 140–141, 144, 147–148, 151–152）

```ts
139 │ class WatcherQueue {
140 ▶   private readonly nextQueue: ((value?: ChangedFiles) => void)[] = [];
141 ▶   private currentChangedFiles: ChangedFiles | undefined;
142 │   private isClosed = false;
143 │   private timeoutId: NodeJS.Timeout | undefined;
144 ▶   private firstChangeTime: number | undefined;
145 │ 
146 │   constructor(
147 ▶     private readonly debounceMs = 100,
148 ▶     private readonly maxWaitMs = 500,
149 │   ) {}
150 │ 
151 ▶   addChange(type: 'added' | 'modified' | 'removed', file: string): void {
152 ▶     if (this.isClosed) {
153 │       return;
154 │     }
155 │ 
```

OS の通知は 1 回の保存で何回も来ることがあり、エディタはいくつものファイルを続けて書きます。1 つの通知ごとに再ビルドすると無駄なので、キューに溜めてまとめます。147〜148 行目、最後の通知から 100 ms 静かになるか、最初の通知から 500 ms たったら渡します（0ba4d8e29c で 250 ms から縮めました）。156〜157 行目（[前の章](../cli/10-cli-cache-watch.md)の引用）、通知は今の `ChangedFiles` の集合に足すだけなので、同じファイルを何度保存しても 1 つです。タイマーの計算（175〜191 行目）は [前の章](../cli/10-cli-cache-watch.md)で読みました。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L192–231 （▶ の行: 193–194, 196–198, 200, 202–204, 210–214, 216, 222–223, 226–228）

```ts
192 │ 
193 ▶   private flush(): void {
194 ▶     this.firstChangeTime = undefined;
195 │     if (
196 ▶       this.currentChangedFiles &&
197 ▶       this.currentChangedFiles.all.length > 0 &&
198 ▶       this.nextQueue.length > 0
199 │     ) {
200 ▶       const next = this.nextQueue.shift();
201 │       if (next) {
202 ▶         const result = this.currentChangedFiles;
203 ▶         this.currentChangedFiles = undefined;
204 ▶         next(result);
205 │       }
206 │     }
207 │   }
208 │ 
209 │   async next(): Promise<IteratorResult<ChangedFiles>> {
210 ▶     if (
211 ▶       this.currentChangedFiles &&
212 ▶       this.currentChangedFiles.all.length > 0 &&
213 ▶       this.nextQueue.length === 0 &&
214 ▶       !this.timeoutId
215 │     ) {
216 ▶       const result = { value: this.currentChangedFiles };
217 │       this.currentChangedFiles = undefined;
218 │ 
219 │       return result;
220 │     }
221 │ 
222 ▶     if (this.isClosed) {
223 ▶       return { done: true, value: undefined as unknown as ChangedFiles };
224 │     }
225 │ 
226 ▶     return new Promise((resolve) => {
227 ▶       this.nextQueue.push((value) =>
228 ▶         resolve(value ? { value } : { done: true, value: undefined as unknown as ChangedFiles }),
229 │       );
230 │     });
231 │   }
```

1. **待っている人がいれば渡す**

   193〜207 行目の `flush`。196〜198 行目、変化があって、`next()` を呼んで待っている人がいるときだけ、202〜204 行目でその人に渡して空にします。
2. **いなければ溜めたまま**

   再ビルドの最中は誰も待っていません。そのあいだの通知は `currentChangedFiles` に溜まり続け、194 行目でまとめの時計だけ戻します。
3. **次の next() はすぐ返す**

   210〜220 行目。溜まった変化があり、待っている人もタイマーも無ければ（ビルドの最中に溜まって、もう静かになった）、Promise を作らずにすぐ返します。
4. **閉じていれば done**

   222〜224 行目。`for await` はここで抜けます。
5. **まだ無ければ待つ**

   226〜230 行目。resolve を列に積みます。228 行目、値なしで呼ばれたら（close のとき）done にします。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L232–253 （▶ の行: 234, 238–239, 244–245, 248–249）

```ts
232 │ 
233 │   close(): void {
234 ▶     if (this.isClosed) {
235 │       return;
236 │     }
237 │ 
238 ▶     if (this.timeoutId) {
239 ▶       clearTimeout(this.timeoutId);
240 │       this.timeoutId = undefined;
241 │     }
242 │     this.firstChangeTime = undefined;
243 │ 
244 ▶     this.isClosed = true;
245 ▶     this.currentChangedFiles = undefined;
246 │ 
247 │     let next;
248 ▶     while ((next = this.nextQueue.shift()) !== undefined) {
249 ▶       next();
250 │     }
251 │   }
252 │ }
253 │ 
```

close は、タイマーを止め、溜まっていた変化を捨て、248〜250 行目で待っている人を全員「値なし」で起こします。これで build-action.ts の `for await` が終わります。

## 4. cwd の外のファイル：ParcelExternalManager

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L267–298 （▶ の行: 275–277, 280, 282, 286–287, 291, 296）

```ts
267 │ 
268 │ /**
269 │  * Checks whether a file path is located inside a parent directory.
270 │  *
271 │  * Input Expectations:
272 │  * - Both `file` and `dir` must be normalized POSIX-style paths (using forward slashes '/').
273 │  * - Both paths must share the same casing normalization (e.g., lowercased on case-insensitive file systems).
274 │  */
275 ▶ export function isPathInside(file: string, dir: string): boolean {
276 ▶   if (file === dir) {
277 ▶     return false;
278 │   }
279 │ 
280 ▶   const dirWithSlash = dir.endsWith('/') ? dir : dir + '/';
281 │ 
282 ▶   return file.startsWith(dirWithSlash);
283 │ }
284 │ 
285 │ class ParcelExternalManager {
286 ▶   private readonly extraSubscriptions = new Map<string, ParcelWatcher.AsyncSubscription>();
287 ▶   private readonly pendingSubscriptions = new Map<
288 │     string,
289 │     Promise<ParcelWatcher.AsyncSubscription>
290 │   >();
291 ▶   private readonly externalDirFiles = new Map<string, { dirPath: string; files: Set<string> }>();
292 │ 
293 │   constructor(
294 │     private readonly parcelWatcher: typeof ParcelWatcher,
295 │     private readonly options: WatcherOptions | undefined,
296 ▶     private readonly rootDirLookupKey: string,
297 │     private readonly handleEvents: (events: ParcelWatcher.Event[]) => void,
298 │   ) {}
```

@parcel/watcher（OS の通知の仕組みを使う、ネイティブの watcher）は、6 節で cwd（ワークスペースの根）を 1 回だけ再帰的に購読します。npm link したライブラリや monorepo の隣のフォルダのような cwd の外のファイルは、その購読に入りません。それを監視するのが `ParcelExternalManager` で、外のファイルの**親のフォルダ**ごとに購読を 1 つ作ります。275〜283 行目の `isPathInside` は、`dir + '/'` で始まるかで見るので、`/app` と `/app2` を取り違えません。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L299–316 （▶ の行: 301–302, 305–307, 309, 312, 314）

```ts
299 │ 
300 │   async ensureWatched(posixPath: string, lookupKey: string): Promise<void> {
301 ▶     if (isPathInside(lookupKey, this.rootDirLookupKey) || lookupKey === this.rootDirLookupKey) {
302 ▶       return;
303 │     }
304 │ 
305 ▶     const dirPath = getDirectoryPath(posixPath);
306 ▶     const dirKey = getDirectoryPath(lookupKey);
307 ▶     let dirEntry = this.externalDirFiles.get(dirKey);
308 │     if (!dirEntry) {
309 ▶       dirEntry = { dirPath, files: new Set<string>() };
310 │       this.externalDirFiles.set(dirKey, dirEntry);
311 │     }
312 ▶     dirEntry.files.add(lookupKey);
313 │ 
314 ▶     await this.ensureDirWatched(dirPath, dirKey);
315 │   }
316 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L317–342 （▶ の行: 318, 322, 325–328, 331, 333–335）

```ts
317 │   removeFile(lookupKey: string): void {
318 ▶     if (isPathInside(lookupKey, this.rootDirLookupKey) || lookupKey === this.rootDirLookupKey) {
319 │       return;
320 │     }
321 │ 
322 ▶     const dirKey = getDirectoryPath(lookupKey);
323 │     const dirEntry = this.externalDirFiles.get(dirKey);
324 │     if (dirEntry) {
325 ▶       dirEntry.files.delete(lookupKey);
326 ▶       if (dirEntry.files.size === 0) {
327 ▶         this.externalDirFiles.delete(dirKey);
328 ▶         const sub = this.extraSubscriptions.get(dirKey);
329 │         if (sub) {
330 │           this.extraSubscriptions.delete(dirKey);
331 ▶           sub.unsubscribe().catch(() => {});
332 │ 
333 ▶           for (const [remainingDirKey, remainingDirEntry] of this.externalDirFiles.entries()) {
334 ▶             if (!this.isCoveredByExistingExternal(remainingDirKey)) {
335 ▶               this.ensureDirWatched(remainingDirEntry.dirPath, remainingDirKey).catch(() => {});
336 │             }
337 │           }
338 │         }
339 │       }
340 │     }
341 │   }
342 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L343–374 （▶ の行: 345–346, 348, 350, 354–356, 360–362, 366–367）

```ts
343 │   async close(): Promise<void> {
344 │     try {
345 ▶       if (this.pendingSubscriptions.size > 0) {
346 ▶         await Promise.allSettled(Array.from(this.pendingSubscriptions.values()));
347 │       }
348 ▶       if (this.extraSubscriptions.size > 0) {
349 │         await Promise.allSettled(
350 ▶           Array.from(this.extraSubscriptions.values()).map((sub) => sub.unsubscribe()),
351 │         );
352 │       }
353 │     } finally {
354 ▶       this.extraSubscriptions.clear();
355 ▶       this.pendingSubscriptions.clear();
356 ▶       this.externalDirFiles.clear();
357 │     }
358 │   }
359 │ 
360 ▶   private isCoveredByExistingExternal(dirLookupKey: string): boolean {
361 ▶     for (const existingDir of this.extraSubscriptions.keys()) {
362 ▶       if (dirLookupKey === existingDir || isPathInside(dirLookupKey, existingDir)) {
363 │         return true;
364 │       }
365 │     }
366 ▶     for (const pendingDir of this.pendingSubscriptions.keys()) {
367 ▶       if (dirLookupKey === pendingDir || isPathInside(dirLookupKey, pendingDir)) {
368 │         return true;
369 │       }
370 │     }
371 │ 
372 │     return false;
373 │   }
374 │ 
```

1. **cwd の中なら何もしない**

   301〜303 行目。
2. **フォルダごとにファイルを覚える**

   305〜312 行目。`externalDirFiles` の鍵はフォルダのキー、値はそのフォルダで add されたファイルのキーの集合です。
3. **フォルダを購読する**

   314 行目から 5 節の 375 行目へ。
4. **最後のファイルが外れたら購読をやめる**

   325〜331 行目。そのあと 333〜337 行目で、やめた購読に覆われていた子のフォルダを購読し直します。
5. **「もう覆われているか」は、確定した購読と、作りかけの購読の両方を見る**

   360〜373 行目。親のフォルダを購読していれば、子のフォルダは要りません。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L375–399 （▶ の行: 376, 380, 383–384, 388, 392, 395–397）

```ts
375 │   private async ensureDirWatched(dirPath: string, dirKey: string): Promise<void> {
376 ▶     if (this.isCoveredByExistingExternal(dirKey)) {
377 │       return;
378 │     }
379 │ 
380 ▶     const subPromise = this.parcelWatcher.subscribe(
381 │       dirPath,
382 │       (err, events) => {
383 ▶         if (!err) {
384 ▶           this.handleEvents(events);
385 │         }
386 │       },
387 │       {
388 ▶         ignore: this.options?.ignored,
389 │       },
390 │     );
391 │ 
392 ▶     this.pendingSubscriptions.set(dirKey, subPromise);
393 │ 
394 │     try {
395 ▶       const sub = await subPromise;
396 ▶       if (this.externalDirFiles.has(dirKey) && !this.isCoveredByExistingExternal(dirKey)) {
397 ▶         this.extraSubscriptions.set(dirKey, sub);
398 │ 
399 │         // Subsume any nested child subscriptions that are now covered by this parent subscription
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L400–423 （▶ の行: 400–403, 406–407, 409, 411–412）

```ts
400 ▶         for (const [childDir, childSub] of this.extraSubscriptions.entries()) {
401 ▶           if (childDir !== dirKey && isPathInside(childDir, dirKey)) {
402 ▶             this.extraSubscriptions.delete(childDir);
403 ▶             childSub.unsubscribe().catch(() => {});
404 │           }
405 │         }
406 ▶       } else {
407 ▶         sub.unsubscribe().catch(() => {});
408 │       }
409 ▶     } catch {
410 │       // Ignore subscription errors for missing or restricted external directories
411 ▶     } finally {
412 ▶       this.pendingSubscriptions.delete(dirKey);
413 │     }
414 │   }
415 │ }
416 │ 
417 │ async function createParcelWatcher(
418 │   options: WatcherOptions | undefined,
419 │   parcelWatcher: typeof ParcelWatcher,
420 │ ): Promise<BuildWatcher> {
421 │   const watchedFiles = new Set<string>();
422 │   const queue = new WatcherQueue();
423 │ 
```

376 行目、覆われていなければ 380 行目で購読を始め、392 行目でその Promise を `pendingSubscriptions` に入れ、395 行目で待ちます。購読が決まったら、396 行目で「まだ要るか、ほかに覆われていないか」を確かめ、397 行目で確定した購読に移し、400〜405 行目で中に入る子の購読を畳みます。要らなければ 407 行目でやめます。

> [!WARNING]
> **ハマりどころ**
>
> 396 行目の `isCoveredByExistingExternal(dirKey)` は 366〜370 行目で `pendingSubscriptions` も見ますが、自分自身の `dirKey` は 392 行目で入れたまま、412 行目の finally まで消えません。だから 396 行目はいつも偽になり、作ったばかりの購読を 407 行目で必ずやめます。デモの「cwd の外のファイル」で、44129f66a3 の既定（Parcel）だけが何も返さないのはこのためです。polling（chokidar の道）と 22.2.7 は返します。22.2.7 と新しい本家では、e3e893682d（#34187、2026-09-28）が 395 行目の直後で `pendingSubscriptions.delete(dirKey)` を呼ぶように直しています。npm link や monorepo のライブラリを変えても ng serve が再ビルドしない、という報告からの修正です。

## 5. createParcelWatcher の残り

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L457–485 （▶ の行: 458–462, 466, 470–471, 474, 478–479, 482–483）

```ts
457 │ 
458 ▶   const subscription = await parcelWatcher.subscribe(
459 ▶     rootDirPosix,
460 ▶     (err, events) => {
461 ▶       if (!err) {
462 ▶         handleEvents(events);
463 │       }
464 │     },
465 │     {
466 ▶       ignore: options?.ignored,
467 │     },
468 │   );
469 │ 
470 ▶   const externalManager = new ParcelExternalManager(
471 ▶     parcelWatcher,
472 │     options,
473 │     rootDirLookupKey,
474 ▶     handleEvents,
475 │   );
476 │ 
477 │   const buildWatcher: BuildWatcher = {
478 ▶     [Symbol.asyncIterator]() {
479 ▶       return this;
480 │     },
481 │ 
482 ▶     next() {
483 ▶       return queue.next();
484 │     },
485 │ 
```

458〜468 行目、cwd を 1 回だけ購読します。466 行目の `ignore` は、Parcel が OS の側で通知を間引くためのパターンで、出力先・キャッシュ・（`NG_BUILD_WATCH_ROOT` のとき）node\_modules が入ります。届いた通知は 429〜456 行目（[前の章](../cli/10-cli-cache-watch.md)の引用）で、add したパスかを照らし、watcher を作る 1 秒より前の更新時刻のものを捨て、Parcel の `create`・`update`・`delete` を added・modified・removed に読み替えてキューに入れます。470〜475 行目、4 節の外の監視も同じ `handleEvents` に流します。478〜484 行目、イテレーターとしては自分を返し、`next()` はキューに任せます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L486–508 （▶ の行: 487, 489–493, 503–504）

```ts
486 │     add(paths) {
487 ▶       const targets = typeof paths === 'string' ? [paths] : paths;
488 │       for (const file of targets) {
489 ▶         const posixPath = toPosixPathNormalized(file);
490 ▶         const lookupKey = toLookupKey(posixPath, isCaseSensitive);
491 ▶         if (!watchedFiles.has(lookupKey)) {
492 ▶           watchedFiles.add(lookupKey);
493 ▶           void externalManager.ensureWatched(posixPath, lookupKey);
494 │         }
495 │       }
496 │     },
497 │ 
498 │     remove(paths) {
499 │       const targets = typeof paths === 'string' ? [paths] : paths;
500 │       for (const file of targets) {
501 │         const posixPath = toPosixPathNormalized(file);
502 │         const lookupKey = toLookupKey(posixPath, isCaseSensitive);
503 ▶         if (watchedFiles.delete(lookupKey)) {
504 ▶           externalManager.removeFile(lookupKey);
505 │         }
506 │       }
507 │     },
508 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L509–530 （▶ の行: 511–512, 514, 516, 528–529）

```ts
509 │     async close() {
510 │       try {
511 ▶         if (subscription) {
512 ▶           await subscription.unsubscribe();
513 │         }
514 ▶         await externalManager.close();
515 │       } finally {
516 ▶         queue.close();
517 │       }
518 │     },
519 │   };
520 │ 
521 │   return buildWatcher;
522 │ }
523 │ 
524 │ async function createChokidarWatcher(
525 │   options?: WatcherOptions,
526 │   chokidarModule?: typeof Chokidar,
527 │ ): Promise<BuildWatcher> {
528 ▶   const chokidar = chokidarModule ?? (await import('chokidar'));
529 ▶   const watchedFiles = new Set<string>();
530 │ 
```

add は、キーを `watchedFiles` に入れ、初めてのキーなら 493 行目で外の監視に回します（cwd の中なら 301 行目ですぐ戻る）。Promise を待たない（`void`）ので、add した直後の変更は、外のフォルダの購読が決まる前なら拾われません。remove は 503〜504 行目、消せたときだけ外の監視からも外します。close は、根の購読・外の購読をやめ、516 行目の finally でキューを閉じます。

## 6. createChokidarWatcher の残り：polling と preserveSymlinks の道

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L563–588 （▶ の行: 563, 565–568, 572–573, 577, 582, 585–587）

```ts
563 ▶   const initTime = Date.now();
564 │ 
565 ▶   const handleEvent = (type: 'added' | 'modified' | 'removed', rawPath: string) => {
566 ▶     const posixPath = toPosixPathNormalized(rawPath);
567 ▶     const lookupKey = toLookupKey(posixPath, isCaseSensitive);
568 ▶     if (!isPathWatched(lookupKey, watchedFiles)) {
569 │       return;
570 │     }
571 │ 
572 ▶     if (type !== 'removed') {
573 ▶       const stat = fs.statSync(rawPath, { throwIfNoEntry: false });
574 │       // Ignore historical events from before watcher initialization, but allow a 1000 ms window
575 │       // to account for coarse filesystem timestamp resolution (e.g., ext4/overlayfs integer second
576 │       // mtime truncation on Linux) where files modified during startup may have truncated .000 ms mtimes.
577 ▶       if (stat && stat.mtimeMs < initTime - 1000) {
578 │         return;
579 │       }
580 │     }
581 │ 
582 ▶     queue.addChange(type, rawPath);
583 │   };
584 │ 
585 ▶   watcher.on('add', (path) => handleEvent('added', path));
586 ▶   watcher.on('change', (path) => handleEvent('modified', path));
587 ▶   watcher.on('unlink', (path) => handleEvent('removed', path));
588 │ 
```

chokidar（Node の fs.watch や、定期的に stat を取る polling で監視するライブラリ）は、`poll` を指定したときか、`preserveSymlinks` のとき（255 行目、b423bc39cd）に使われます。556〜562 行目（[前の章](../cli/10-cli-cache-watch.md)の引用）で **cwd 全体**を監視し、565〜583 行目で Parcel と同じく、add したパスか・古い更新時刻かを見てからキューに入れます。532〜539 行目、polling のときはキューのまとめ方を polling の間隔から決めます。既定の 100 ms なら、静かになるまで 150 ms、最長 500 ms です。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L589–615 （▶ の行: 601–607, 611–612）

```ts
589 │   const buildWatcher: BuildWatcher = {
590 │     [Symbol.asyncIterator]() {
591 │       return this;
592 │     },
593 │ 
594 │     next() {
595 │       return queue.next();
596 │     },
597 │ 
598 │     add(paths) {
599 │       const targets = typeof paths === 'string' ? [paths] : paths;
600 │       const newPaths: string[] = [];
601 ▶       for (const p of targets) {
602 ▶         const posixPath = toPosixPathNormalized(p);
603 ▶         const lookupKey = toLookupKey(posixPath, isCaseSensitive);
604 ▶         if (!watchedFiles.has(lookupKey)) {
605 ▶           watchedFiles.add(lookupKey);
606 ▶           if (!isPathInside(lookupKey, rootDirLookupKey) && lookupKey !== rootDirLookupKey) {
607 ▶             newPaths.push(posixPath);
608 │           }
609 │         }
610 │       }
611 ▶       if (newPaths.length > 0) {
612 ▶         watcher.add(newPaths);
613 │       }
614 │     },
615 │ 
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/watcher.ts` L616–644 （▶ の行: 622–625, 629–630, 636, 638）

```ts
616 │     remove(paths) {
617 │       const targets = typeof paths === 'string' ? [paths] : paths;
618 │       const removePaths: string[] = [];
619 │       for (const p of targets) {
620 │         const posixPath = toPosixPathNormalized(p);
621 │         const lookupKey = toLookupKey(posixPath, isCaseSensitive);
622 ▶         if (watchedFiles.has(lookupKey)) {
623 ▶           watchedFiles.delete(lookupKey);
624 ▶           if (!isPathInside(lookupKey, rootDirLookupKey) && lookupKey !== rootDirLookupKey) {
625 ▶             removePaths.push(posixPath);
626 │           }
627 │         }
628 │       }
629 ▶       if (removePaths.length > 0) {
630 ▶         watcher.unwatch(removePaths);
631 │       }
632 │     },
633 │ 
634 │     async close() {
635 │       try {
636 ▶         await watcher.close();
637 │       } finally {
638 ▶         queue.close();
639 │       }
640 │     },
641 │   };
642 │ 
643 │   return buildWatcher;
644 │ }
```

606 行目、cwd の中のパスは 556 行目の監視に入っているので、chokidar には何も足さず `watchedFiles` に覚えるだけです。外のパスだけ 612 行目で `watcher.add` します。remove も外のものだけ 630 行目で `unwatch` します。

> [!NOTE]
> **ポイント**
>
> 22.2.7 と新しい本家の chokidar の道は、ここから作りが変わっています。cwd 全体ではなく add したパスだけを監視し（a057239486、macOS で fs.watch の数が上限を超えて EMFILE で落ちる報告 #34312 から）、初めの走査が終わるまで待ってから返し（ee3041325c）、polling で同じ書き込みに 2 回来る change を更新時刻と大きさで捨てます（ec9c0b51c2）。Parcel の道も、外のフォルダをパッケージの根にまとめて購読の数を 256 までに抑えます（c1c4216a68、macOS の FSEvents の上限から）。デモの「大文字で add した名前を…」で、22.2.7 の polling だけが `CASE.TS`（add した名前）を返すのは、chokidar が add したパスそのものを監視するようになったからです。

## 7. デモ：本物の createWatcher に操作を当てる

> **🧪 DEMO — next() が返した ChangedFiles（darwin、Node v24.22.1 での記録）**
>
> add したパス：.。時刻は最初の操作の直前からのミリ秒です。
>
> 同じ操作を 4 通りで比べる：
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/esb-watcher)

- 「同じファイルを 30 ms ごとに 5 回保存」は、polling では 1 つの ChangedFiles（modified に 1 つ）にまとまりました。Parcel は、macOS の FSEvents が通知をまとめて遅れて届けるので、2 つに分かれています。どちらも同じファイルは 1 回しか入りません（157 行目の Set）。
- 「60 ms ごとに 15 回保存」は、polling では 500 ms ごとに 2 つ。静かになるのを待たず、最初の通知から 500 ms で区切る 147〜148 行目と 535 行目のとおりです。
- 「作って 20 ms 後に消す」は、Parcel では 1 つの ChangedFiles の added と removed の**両方**に同じファイルが入りました。キューは種類ごとの集合に足すだけで、打ち消し合いません。
- 「変更」「作って 1.1 秒のファイルを書く」などで、Parcel の記録は modified ではなく added になることがありました。448〜449 行目は Parcel の `event.type` をそのまま読み替えるので、OS が「作成」と報せればそうなります。22.2.7 の build-action.ts は、アセットが added で来ても写し直すようになっています（1931eac4e5）。
- 「監視していないファイル」と「remove() したあとに書く」は、どの組み合わせでも何も返りません（568 行目・434 行目の `isPathWatched`）。

## 8. どう録ったか

スクリプトは `<scratchpad>/esb-demo/a/` に置きました。44129f66a3 の watcher.ts は、練習用の作業木のファイルを esbuild で 1 つの .js にし（@parcel/watcher・chokidar・picomatch はサイトの node\_modules から読む）、22.2.7 はサイトの node\_modules の `utils/watcher.js` をそのまま require しました。操作ごとに新しい一時フォルダを作り、事前に置くファイルは 6 秒前に書き（「作って 1.1 秒」だけ 1.1 秒前）、watcher を作って add し、400 ms 待ってから操作し、1.5 秒後に close しています。

📄 `記録のスクリプト（rec-watch.mjs）`

```
// 本物の createWatcher を一時フォルダに当て、next() が返した ChangedFiles を時刻つきで記録する。
// 44129f66a3 の tools/esbuild/watcher.ts（作業木から esbuild で .js にした物）と、22.2.7 の utils/watcher.js を同じ手順で動かす。
// 使い方: node rec-watch.mjs <サイトのディレクトリ> <44129f66a3 の作業木> <出力 JSON>
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const [site, wt, out] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const app = path.join(here, 'app');
const require = createRequire(path.join(site, 'package.json'));
const esbuild = require('esbuild');
const w44dir = path.join(app, '.w44');
mkdirSync(w44dir, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(wt, 'packages/angular/build/src/tools/esbuild/watcher.ts')],
  outfile: path.join(w44dir, 'watcher.js'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'error',
});
const impls = {
  '44129f66a3': require(path.join(w44dir, 'watcher.js')).createWatcher,
  '22.2.7': require(path.join(site, 'node_modules/@angular/build/src/utils/watcher.js')).createWatcher,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmpRoot = path.join(here, 'wtmp');
mkdirSync(tmpRoot, { recursive: true });

const scenarios = [
  { id: 'add', label: '追加（フォルダを監視）', setup: [], watch: ['.'], act: async (d, log) => { writeFileSync(path.join(d, 'new.ts'), 'x'); log('new.ts を作る'); } },
  { id: 'change', label: '変更', setup: ['a.ts'], watch: ['a.ts'], act: async (d, log) => { writeFileSync(path.join(d, 'a.ts'), 'changed'); log('a.ts を書く'); } },
  { id: 'delete', label: '削除', setup: ['a.ts'], watch: ['a.ts'], act: async (d, log) => { unlinkSync(path.join(d, 'a.ts')); log('a.ts を消す'); } },
  { id: 'burst', label: '同じファイルを 30 ms ごとに 5 回保存', setup: ['a.ts'], watch: ['a.ts'], act: async (d, log) => {
    for (let i = 0; i < 5; i++) { writeFileSync(path.join(d, 'a.ts'), 'v' + i); log(`a.ts を書く（${i + 1} 回目）`); await sleep(30); } } },
  { id: 'typing', label: '60 ms ごとに 15 回保存（打ち続ける）', setup: ['a.ts'], watch: ['a.ts'], act: async (d, log) => {
    for (let i = 0; i < 15; i++) { writeFileSync(path.join(d, 'a.ts'), 'v' + i); if (i % 5 === 0 || i === 14) log(`a.ts を書く（${i + 1} 回目）`); await sleep(60); } } },
  { id: 'case', label: '大文字で add した名前を、小文字のファイルで書く', setup: ['case.ts'], watch: ['CASE.TS'], act: async (d, log) => { writeFileSync(path.join(d, 'case.ts'), 'changed'); log('case.ts を書く（add したのは CASE.TS）'); } },
  { id: 'unwatched', label: '監視していないファイル', setup: ['a.ts', 'b.ts'], watch: ['a.ts'], act: async (d, log) => { writeFileSync(path.join(d, 'b.ts'), 'changed'); log('b.ts を書く（add したのは a.ts だけ）'); } },
  { id: 'addremove', label: '作って 20 ms 後に消す', setup: [], watch: ['.'], act: async (d, log) => {
    writeFileSync(path.join(d, 'tmp.ts'), 'x'); log('tmp.ts を作る'); await sleep(20); unlinkSync(path.join(d, 'tmp.ts')); log('tmp.ts を消す'); } },
  { id: 'removed', label: 'remove() したあとに書く', setup: ['a.ts'], watch: ['a.ts'], unwatch: ['a.ts'], act: async (d, log) => { writeFileSync(path.join(d, 'a.ts'), 'changed'); log('a.ts を書く（remove 済み）'); } },
  { id: 'outside', label: 'cwd の外のファイル（../ext/x.ts）', cwd: 'ws', setup: ['ws/keep.ts', 'ext/x.ts'], watch: ['ext/x.ts'], act: async (d, log) => { writeFileSync(path.join(d, 'ext/x.ts'), 'changed'); log('cwd（ws）の外の ext/x.ts を書く'); } },
  { id: 'fresh', label: '作って 1.1 秒のファイルを書く', setup: ['a.ts'], watch: ['a.ts'], setupWait: 1100, act: async (d, log) => { writeFileSync(path.join(d, 'a.ts'), 'changed'); log('a.ts を書く（作ってから約 1.5 秒）'); } },
  { id: 'early', label: 'createWatcher の直後（待たずに）書く', setup: ['a.ts'], watch: ['a.ts'], settle: 0, act: async (d, log) => { writeFileSync(path.join(d, 'a.ts'), 'changed'); log('a.ts を書く'); } },
];

const records = [];
for (const [ver, createWatcher] of Object.entries(impls)) {
  for (const polling of [false, true]) {
    for (const sc of scenarios) {
      const dir = realpathSync(mkdtempSync(path.join(tmpRoot, sc.id + '-')));
      for (const f of sc.setup) { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), 'initial'); }
      // 事前に作ったファイルを古くしておく。macOS の FSEvents は、作って数秒以内のファイルの変更を「作成」として報せる（fresh で確かめる）
      await sleep(sc.setupWait ?? 6000);
      const actions = [];
      const batches = [];
      const watcher = await createWatcher({ polling, interval: polling ? 100 : undefined, cwd: sc.cwd ? path.join(dir, sc.cwd) : dir });
      watcher.add(sc.watch.map((p) => path.join(dir, p)));
      if (sc.unwatch) watcher.remove(sc.unwatch.map((p) => path.join(dir, p)));
      await sleep(sc.settle ?? 400);
      const t0 = Date.now();
      const rel = (s) => [...s].map((p) => path.relative(dir, p) || '.').sort();
      const loop = (async () => {
        for await (const c of watcher) batches.push({ t: Date.now() - t0, added: rel(c.added), modified: rel(c.modified), removed: rel(c.removed) });
      })();
      await sc.act(dir, (text) => actions.push({ t: Date.now() - t0, text }));
      await sleep(1500);
      await watcher.close();
      await loop;
      records.push({ ver, mode: polling ? 'polling（chokidar、interval 100）' : '既定（@parcel/watcher）', polling, scenario: sc.id, label: sc.label, cwd: sc.cwd ?? '.', watch: sc.watch, unwatch: sc.unwatch ?? [], actions, batches });
      rmSync(dir, { recursive: true, force: true });
      process.stdout.write('.');
    }
  }
}
rmSync(tmpRoot, { recursive: true, force: true });
writeFileSync(out, JSON.stringify({ platform: process.platform, node: process.version, records }, null, 1));
console.log('\nok', records.length);

```

## ここまでの呼び出し

- `createWatcher({ polling, interval, followSymlinks, ignored, cwd })` — watcher.ts 254 — *build-action.ts 136 から*
  - `createParcelWatcher(options, parcelWatcher)` — 417 — *polling でも followSymlinks でもなければ*
    - `parcelWatcher.subscribe(rootDirPosix, cb, { ignore })` — 458
    - `new ParcelExternalManager(…)` — 470
  - `watcher.add(result.watchFiles)` — 486
    - `externalManager.ensureWatched(posixPath, lookupKey)` — 300 — *cwd の外だけ*
      - `ensureDirWatched(dirPath, dirKey)` — 375
  - `OS の通知 → handleEvents(events)` — 429
    - `isPathWatched(lookupKey, watchedFiles)` — 119
    - `queue.addChanges(changes)` → `scheduleFlush()` — 161 → 175
  - `for await (const changes of watcher)` → `queue.next()` — 482 → 209
    - `flush()` — 193 — *100 ms 静か、か 500 ms*
  - `watcher.close()` → `queue.close()` — 509 → 233

## テストと直し方

| spec（tools/esbuild/watcher\_spec.ts） | describe / it と行 | この章のどこ |
| --- | --- | --- |
| toPosixPathNormalized・getDirectoryPath・isPathInside | 23・39・59 行目の describe（it 3・3・7 件） | 2 節・4 節の頭 |
| ChangedFiles | 89 行目（it 3 件）。`all` で重複を除く（99 行目） | （前の章） |
| createWatcher | 120 行目（it 17 件）。polling で変更を拾う（162 行目）、大文字小文字を保つ（185 行目）、cwd の外（230 行目）、外のファイルの同時の add（256 行目）・後片付け（286 行目）・入れ子（309 行目）・畳んだ子の購読し直し（340 行目）、close で終わる（375・386 行目）、古い更新の無視（394 行目）、消して作り直す（421 行目） | 3〜6 節。230 行目の it は `polling: true` で、4 節の Parcel の道は通りません。256〜372 行目の 4 件は、購読の数を見る形です |

../angular-cli で `//packages/angular/build:test` を Watcher に絞った 33 件は、[2 回目](02-esb-js-transformer.md)のテストの節の 75 件の中で通りました。

練習用の作業木（44129f66a3）で 4 節を固めてみました。watcher\_spec.ts の 256 行目の前に、230 行目の it から `polling: true` を外した it（cwd の外の一時フォルダのファイルを add して書き、3 秒以内に `next()` が値を返すことを見る）を足すと、「Expected 'timeout' not to be 'timeout'.」で落ちました。ensureDirWatched の 395 行目の直後に `this.pendingSubscriptions.delete(dirKey);` を足すと、この it と Watcher の 33 件、合わせて 34 件が通りました（22.2.7 の e3e893682d と同じ直し方です）。

ほかに固めるなら、3 節のキューの「added と removed の両方に入る」ことと、ビルドの最中に溜まった変化を次の `next()` がすぐ返すこと（210〜220 行目）は、`createWatcher` を通さずに WatcherQueue だけを試す it が書けます。WatcherQueue は export されていないので、spec から呼ぶには export するか、polling の watcher を通す形になります。

## 聞かれそうな質問

**Q. 保存してから再ビルドが始まるまで、どのくらい待ちますか？**

最後の通知から 100 ms、ただし最初の通知から最長 500 ms です（147〜148 行目）。polling なら間隔の 1.5 倍（100〜250 ms）と、その 3 倍か 500 ms の長いほう（534〜535 行目）。デモでは、1 回の保存から `next()` まで Parcel で約 115 ms、polling で約 155 ms でした。

**Q. 再ビルドの最中に保存した変更は失われませんか？**

失われません。誰も `next()` を待っていないあいだ、196〜198 行目の条件で flush は渡さず、`currentChangedFiles` に溜めます。再ビルドが終わって次の `next()` を呼ぶと、210〜220 行目ですぐ返ります。

**Q. Windows や macOS で、大文字小文字だけ違うパスはどう扱われますか？**

cwd で大文字小文字を区別しないと分かれば、照合のキーを小文字にします（96〜98 行目）。キューに入れるのはキーではなく OS が報せた元のパス（450・582 行目）なので、ChangedFiles には元の書き方が残ります。デモの macOS では、`CASE.TS` を add して `case.ts` を書くと拾われました。

**Q. npm link したライブラリを変えても再ビルドされません。**

44129f66a3 の既定（Parcel）なら、4 節の 396 行目のせいで cwd の外のフォルダの購読が作った直後にやめられます。デモの「cwd の外のファイル」がその再現です。22.2.7 では直っています。`preserveSymlinks` を立てると chokidar の道になり、そちらは外のパスを 612 行目で足すので拾えます。

**Q. ファイルを作ってすぐ消したら、ChangedFiles はどうなりますか？**

1 つのまとまりに入れば、added と removed の両方にそのファイルが入ります（デモの Parcel）。キューは種類ごとの集合に足すだけです。build-action.ts は removed のファイルを監視の一覧から消し（214 行目）、そのうえで再ビルドします。

## 読み終えて

- パスは / にそろえて末尾の / を外し、大文字小文字を区別しないなら小文字のキーで照合する。add したパスか、その親のどれかが add されていれば拾う。
- キューは 100 ms 静かになるか 500 ms で区切り、誰も待っていなければ溜めて、次の next() ですぐ返す。種類ごとの集合に足すだけで打ち消さない。
- Parcel は cwd を 1 回だけ購読し、外のファイルは親のフォルダごとに購読する。44129f66a3 のその購読は、作った直後にやめられる（22.2.7 で直った）。
- chokidar は polling と preserveSymlinks のときの道で、44129f66a3 では cwd 全体を監視する。22.2.7 では add したパスだけになり、準備を待ち、重複の change を捨てる。

---

← 前: [JavaScriptTransformer：esbuild に渡す前の JS をワーカーで書き換える](02-esb-js-transformer.md)  
次: [I18nInliner：ビルドの後で $localize に翻訳を差し込む](04-esb-i18n-inliner.md) →
