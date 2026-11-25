[目次](../README.md) › [@angular-devkit の内側](README.md) › 第 2 回 / 全 12 回

# 仮想ファイルシステムの host：memory・scoped・alias・sync・record

> core/src/virtual-fs/host/\*・core/node/host.ts：Host の約束（Observable で返す読み書き）、メモリの host、別のフォルダに見せる scoped と alias、同期の包み、変更を記録してあとで流す record、Node の本物のファイルシステムへのつなぎ。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-host)

---

この章で分かること：schematic の `Tree` や `ng` のワークスペースの読み書きの下にある「仮想ファイルシステムの host」が、どんな約束（Observable で返す 10 個のメソッド）で動くか。メモリの上の `SimpleMemoryHost`、道を付け替える `ScopedHost`・`AliasHost`、Observable を同期の値にする `SyncDelegateHost`、変更を記録してあとで流す `CordHost`、本物のディスクにつなぐ `NodeJsSyncHost`・`NodeJsAsyncHost` を、本物の dist を Node から呼んだ記録で確かめます。

読む対象は `packages/angular_devkit/core/src/virtual-fs/host/` の `interface.ts`・`memory.ts`・`resolver.ts`・`scoped.ts`・`alias.ts`・`sync.ts`・`record.ts`・`safe.ts` と、`core/node/host.ts` です（../angular-cli、44129f66a3）。`HostTree` が `CordHost` をどう使うか（`create`・`overwrite` と `records()` の並び）は[schematics の章](../cli/13-schematics.md)の 1・2・4 節が読んでいるので、この章はそこで引かれていない `write`・`delete`・`rename`・`commit` を読みます。host に渡す `Path`（印の付いた文字列）と `normalize`・`join` は[第 1 回](01-dvk-path.md)です。

1. [1. パスと文字列](01-dvk-path.md)
2. **2. 仮想ファイルシステムの host**（この章）
3. [3. JSON schema の検査](03-dvk-schema.md)
4. [4. angular.json の読み書き](04-dvk-workspace.md)
5. [5. logger と小さな道具](05-dvk-logger.md)
6. [6. Tree](06-dvk-tree.md)
7. [7. エンジンと規則](07-dvk-engine.md)
8. [8. ワークフローと engine host](08-dvk-workflow.md)
9. [9. architect の jobs](09-dvk-jobs.md)
10. [10. Architect が builder を呼ぶまで](10-dvk-architect.md)
11. [11. テストの道具](11-dvk-testing.md)
12. [12. spec と issue](12-dvk-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> Observable（RxJS）は「購読（`subscribe`）したときに動き、値を 0 個以上 `next` で渡し、最後に `complete` か `error` で終わる」ものです。host のメソッドはどれも Observable を返すので、呼んだだけでは何も起きません。DEMO の記録は、ローカルの `@angular/cli` 22.2.7 が持つ `@angular-devkit/core`・`@angular-devkit/schematics` 22.2.7 の dist を記録のスクリプトから呼んで取りました。`virtual-fs` と `node/host.ts` は 44129f66a3 と 22.2.7 で差分が無く、同じスクリプトを 44129f66a3 と同じソースの公開版 22.2.0-next.7 で走らせた結果も 1 文字違わず同じでした。origin/main（2026-11-26）にもこの範囲の変更はありません。

## 1. Host の約束：Observable で返す 10 個のメソッド

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/interface.ts` L45–71 （▶ の行: 46, 49, 52, 54, 56, 61, 64–67, 70）

```ts
45 │ export interface HostCapabilities {
46 ▶   synchronous: boolean;
47 │ }
48 │ 
49 ▶ export interface ReadonlyHost<StatsT extends object = {}> {
50 │   readonly capabilities: HostCapabilities;
51 │ 
52 ▶   read(path: Path): Observable<FileBuffer>;
53 │ 
54 ▶   list(path: Path): Observable<PathFragment[]>;
55 │ 
56 ▶   exists(path: Path): Observable<boolean>;
57 │   isDirectory(path: Path): Observable<boolean>;
58 │   isFile(path: Path): Observable<boolean>;
59 │ 
60 │   // Some hosts may not support stats.
61 ▶   stat(path: Path): Observable<Stats<StatsT> | null> | null;
62 │ }
63 │ 
64 ▶ export interface Host<StatsT extends object = {}> extends ReadonlyHost<StatsT> {
65 ▶   write(path: Path, content: FileBufferLike): Observable<void>;
66 ▶   delete(path: Path): Observable<void>;
67 ▶   rename(from: Path, to: Path): Observable<void>;
68 │ 
69 │   // Some hosts may not support watching.
70 ▶   watch(path: Path, options?: HostWatchOptions): Observable<HostWatchEvent> | null;
71 │ }
```

読むだけの `ReadonlyHost`（49〜62 行目）と、書ける `Host`（64〜71 行目）の 2 段です。どのメソッドも Observable を返します。例外は 61 行目の `stat` と 70 行目の `watch` で、「できない host」は Observable の代わりに `null` を返してよいと型に書いてあります。46 行目の `capabilities.synchronous` は「この host の Observable は購読したその場で終わる」という申告で、4 節の `SyncDelegateHost` がこれを見ます。ファイルの中身（`FileBuffer`）は L12 で `ArrayBuffer` と決めてあり、文字列ではありません。記録のスクリプトも `TextEncoder` で作った `ArrayBuffer` を渡しています。

実際の使われ方は 3 通りです。schematic の実行では、ワークスペースのフォルダを `ScopedHost(NodeJsSyncHost, root)` で見せ、`HostTree` がそれを `SafeReadonlyHost` → `CordHost` → `SyncDelegateHost` と包みます（下の「ここまでの呼び出し」）。`architect` の CLI は `NodeJsSyncHost` を `workspaces.createWorkspaceHost` に渡して `angular.json` を読みます（[第 4 回](04-dvk-workspace.md)）。テストの道具は `SimpleMemoryHost` を土台にします（[第 11 回](11-dvk-testing.md)）。

## 2. SimpleMemoryHost：1 つの Map でできたファイルシステム

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/memory.ts` L94–101 （▶ の行: 95, 98–99）

```ts
 94 │   constructor() {
 95 ▶     this._cache.set(normalize('/'), this._newDirStats());
 96 │   }
 97 │ 
 98 ▶   protected _toAbsolute(path: Path): Path {
 99 ▶     return isAbsolute(path) ? path : normalize('/' + path);
100 │   }
101 │ 
```

中身は L43 の `_cache: Map<Path, Stats>` 1 つです。鍵は絶対パスの文字列で、値は「directory の印」か「file の中身つきの stats」です。95 行目で `/` を directory として入れ、98〜99 行目の `_toAbsolute` で、`b.ts` のような相対の path は `/b.ts` に直します（記録：`write('b.ts')` のあと `exists('/b.ts')` は true）。

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/memory.ts` L155–181 （▶ の行: 156, 158–159, 162–163, 165–167, 169–170, 173, 178–180）

```ts
155 │   protected _write(path: Path, content: FileBuffer): void {
156 ▶     path = this._toAbsolute(path);
157 │     const old = this._cache.get(path);
158 ▶     if (old && old.isDirectory()) {
159 ▶       throw new PathIsDirectoryException(path);
160 │     }
161 │ 
162 ▶     // Update all directories. If we find a file we know it's an invalid write.
163 ▶     const fragments = split(path);
164 │     let curr: Path = normalize('/');
165 ▶     for (const fr of fragments) {
166 ▶       curr = join(curr, fr);
167 ▶       const maybeStats = this._cache.get(fr);
168 │       if (maybeStats) {
169 ▶         if (maybeStats.isFile()) {
170 ▶           throw new PathIsFileException(curr);
171 │         }
172 │       } else {
173 ▶         this._cache.set(curr, this._newDirStats());
174 │       }
175 │     }
176 │ 
177 │     // Create the stats.
178 ▶     const stats: Stats<SimpleMemoryHostStats> = this._newFileStats(content, old);
179 ▶     this._cache.set(path, stats);
180 ▶     this._updateWatchers(path, old ? HostWatchEventType.Changed : HostWatchEventType.Created);
181 │   }
```

1. **158〜160 行目：directory には書けない**

   記録の `write('/src', …)` は「Path "/src" is a directory.」でした。
2. **163〜175 行目：親の directory を作る**

   path を `split` で区切り、166 行目で `/src`・`/src/app`…と 1 段ずつ伸ばして、無ければ 173 行目で directory の印を入れます。だから `/src/app/a.ts` を書くと、鍵は `/ /src/ /src/app/ /src/app/a.ts` の 4 つになりました。
3. **167 行目：親が file なら止める、という形**

   コメント（162 行目）は「途中に file があれば不正な書き込み」と言いますが、167 行目が引いているのは伸ばした `curr` ではなく区切った 1 片の `fr`（`f` のような相対の名前）です。鍵は全部 `/` で始まるので見つかることは無く、170 行目の例外は決して投げられません。
4. **178〜180 行目：stats を作り、watch に知らせる**

   前の stats があれば `Changed`、無ければ `Created` です（3 節）。

167 行目の結果を記録で見ると、`/f` に file を書いてから `write('/f/g')` をすると例外は出ず、173 行目が `/f` を directory の印で上書きしました。鍵は `/ /f/ /f/g`、`isFile('/f')` は false、`read('/f')` は「Path "/f" is a directory.」で、`/f` の中身 `F` は消えました。

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/memory.ts` L182–207 （▶ の行: 185–188, 197–200, 204, 206）

```ts
182 │   protected _read(path: Path): FileBuffer {
183 │     path = this._toAbsolute(path);
184 │     const maybeStats = this._cache.get(path);
185 ▶     if (!maybeStats) {
186 ▶       throw new FileDoesNotExistException(path);
187 ▶     } else if (maybeStats.isDirectory()) {
188 ▶       throw new PathIsDirectoryException(path);
189 │     } else if (!maybeStats.content) {
190 │       throw new PathIsDirectoryException(path);
191 │     } else {
192 │       return maybeStats.content;
193 │     }
194 │   }
195 │   protected _delete(path: Path): void {
196 │     path = this._toAbsolute(path);
197 ▶     if (this._isDirectory(path)) {
198 ▶       for (const [cachePath] of this._cache.entries()) {
199 ▶         if (cachePath.startsWith(path + NormalizedSep) || cachePath === path) {
200 ▶           this._cache.delete(cachePath);
201 │         }
202 │       }
203 │     } else {
204 ▶       this._cache.delete(path);
205 │     }
206 ▶     this._updateWatchers(path, HostWatchEventType.Deleted);
207 │   }
```

`_read` は無ければ 186 行目、directory なら 188 行目の例外です。`_delete` は、directory なら 198〜201 行目で「その path か、その path + `/` で始まる鍵」を全部消し、file なら 204 行目で 1 つ消します。無い path の delete は例外にならず、記録でも `delete('/nope')` は普通に終わりました。

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/memory.ts` L208–226 （▶ の行: 211–214, 217–219, 223）

```ts
208 │   protected _rename(from: Path, to: Path): void {
209 │     from = this._toAbsolute(from);
210 │     to = this._toAbsolute(to);
211 ▶     if (!this._cache.has(from)) {
212 ▶       throw new FileDoesNotExistException(from);
213 ▶     } else if (this._cache.has(to)) {
214 ▶       throw new FileAlreadyExistException(to);
215 │     }
216 │ 
217 ▶     if (this._isDirectory(from)) {
218 ▶       for (const path of this._cache.keys()) {
219 ▶         if (path.startsWith(from + NormalizedSep)) {
220 │           const content = this._cache.get(path);
221 │           if (content) {
222 │             // We don't need to clone or extract the content, since we're moving files.
223 ▶             this._cache.set(join(to, NormalizedSep, path.slice(from.length)), content);
224 │           }
225 │         }
226 │       }
```

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/memory.ts` L227–253 （▶ の行: 230, 233, 235, 237–238, 241, 245, 247–248, 252）

```ts
227 │     } else {
228 │       const content = this._cache.get(from);
229 │       if (content) {
230 ▶         const fragments = split(to);
231 │         const newDirectories: Path[] = [];
232 │         let curr: Path = normalize('/');
233 ▶         for (const fr of fragments) {
234 │           curr = join(curr, fr);
235 ▶           const maybeStats = this._cache.get(fr);
236 │           if (maybeStats) {
237 ▶             if (maybeStats.isFile()) {
238 ▶               throw new PathIsFileException(curr);
239 │             }
240 │           } else {
241 ▶             newDirectories.push(curr);
242 │           }
243 │         }
244 │         for (const newDirectory of newDirectories) {
245 ▶           this._cache.set(newDirectory, this._newDirStats());
246 │         }
247 ▶         this._cache.delete(from);
248 ▶         this._cache.set(to, content);
249 │       }
250 │     }
251 │ 
252 ▶     this._updateWatchers(from, HostWatchEventType.Renamed);
253 │   }
```

file の rename（227〜249 行目）は、`_write` と同じ形で先の親を作り（245 行目）、247〜248 行目で鍵を付け替えます。235 行目も 167 行目と同じく `fr` を引くので、先の途中に file があっても止まりません。記録では `/src/y`（file）の下へ `rename('/z', '/src/y/z')` が通り、`/src/y` が directory の印になって中身が消えました。この 235 行目は f6f0c80d8d（2018-06、`ensure full path is renamed for memory host`）が 167 行目を写して足したものです。

directory の rename（217〜226 行目）は、219 行目で `from/` で始まる鍵を探し、223 行目で `to` の下に **写すだけ**です。元の鍵を消す行も、`to` 自身に directory の印を入れる行もありません。記録の `rename('/src', '/lib')` のあと、鍵は `/src/ /src/a.ts /src/sub/ /src/sub/b.ts /lib/a.ts /lib/sub/ /lib/sub/b.ts` で、`exists('/src/a.ts')` は true のまま、`isDirectory('/lib')` は false でした。252 行目、watch に知らせるのは `from` の `Renamed` だけで、`to` の `Created` は出ません。

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/memory.ts` L319–334 （▶ の行: 320–323, 328–329）

```ts
319 │   write(path: Path, content: FileBuffer): Observable<void> {
320 ▶     return new Observable<void>((obs) => {
321 ▶       this._write(path, content);
322 ▶       obs.next();
323 ▶       obs.complete();
324 │     });
325 │   }
326 │ 
327 │   read(path: Path): Observable<FileBuffer> {
328 ▶     return new Observable<FileBuffer>((obs) => {
329 ▶       const content = this._read(path);
330 │       obs.next(content);
331 │       obs.complete();
332 │     });
333 │   }
334 │ 
```

外から呼ぶ `write`・`read` は、`_write`・`_read` を `new Observable` で包むだけです。321 行目は購読したときに走るので、`read('/nope')` を購読せずに呼んでも例外は出ません（記録）。購読すれば同じ呼び出しの中で `next` と `complete` まで進むので、1 節の `synchronous: true`（L147〜149）は正しい申告です。

### watch：親をたどって知らせる

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/memory.ts` L102–123 （▶ の行: 107, 112–113, 116, 118–120）

```ts
102 │   protected _updateWatchers(path: Path, type: HostWatchEventType): void {
103 │     const time = new Date();
104 │     let currentPath = path;
105 │     let parent: Path | null = null;
106 │ 
107 ▶     if (this._watchers.size == 0) {
108 │       // Nothing to do if there's no watchers.
109 │       return;
110 │     }
111 │ 
112 ▶     const maybeWatcher = this._watchers.get(currentPath);
113 ▶     if (maybeWatcher) {
114 │       maybeWatcher.forEach((watcher) => {
115 │         const [options, subject] = watcher;
116 ▶         subject.next({ path, time, type });
117 │ 
118 ▶         if (!options.persistent && type == HostWatchEventType.Deleted) {
119 ▶           subject.complete();
120 ▶           this._watchers.delete(currentPath);
121 │         }
122 │       });
123 │     }
```

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/memory.ts` L124–145 （▶ の行: 125–127, 129, 133, 136, 138, 140, 144）

```ts
124 │ 
125 ▶     do {
126 ▶       currentPath = parent !== null ? parent : currentPath;
127 ▶       parent = dirname(currentPath);
128 │ 
129 ▶       const maybeWatcher = this._watchers.get(currentPath);
130 │       if (maybeWatcher) {
131 │         maybeWatcher.forEach((watcher) => {
132 │           const [options, subject] = watcher;
133 ▶           if (!options.recursive) {
134 │             return;
135 │           }
136 ▶           subject.next({ path, time, type });
137 │ 
138 ▶           if (!options.persistent && type == HostWatchEventType.Deleted) {
139 │             subject.complete();
140 ▶             this._watchers.delete(currentPath);
141 │           }
142 │         });
143 │       }
144 ▶     } while (parent != currentPath);
145 │   }
```

112〜123 行目は「変わった path そのもの」を見ている watcher に、125〜144 行目は親を 1 段ずつたどって、`recursive` の watcher にだけ（133 行目）知らせます。`persistent` でない watcher は、`Deleted` を受けたら終わります（118〜121 行目、138〜141 行目）。記録で 2 つの形を見つけました。

- **同じ path を `recursive` で見ると 2 回届く。**125 行目のループの 1 回目は `parent` が `null` なので 126 行目で `currentPath` は `path` のままで、112 行目と同じ watcher をもう一度見ます。記録の `watch('/a.ts', { recursive: true })` は、`write('/a.ts')` 1 回で `Created` を 2 回受けました。
- **1 つが終わると、同じ path の watcher が全部消える。**120・140 行目の `this._watchers.delete(currentPath)` は、終わった 1 つではなく、その path の配列ごと消します。記録では `/src` に既定（`persistent` なし）と `recursive`・`persistent: true` の 2 つを付け、`delete('/src')` のあと `/src/d.ts` を書くと、`persistent: true` の方にも通知は来ませんでした（complete もされません）。

## 3. 道を付け替える host：ResolverHost・ScopedHost・AliasHost

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/resolver.ts` L20–48 （▶ の行: 24–25, 27, 29–30, 33–34, 42–43）

```ts
20 │ /**
21 │  * A Host that runs a method before calling its delegate. This is an abstract class and its actual
22 │  * behaviour is entirely dependant of the subclass.
23 │  */
24 ▶ export abstract class ResolverHost<T extends object> implements Host<T> {
25 ▶   protected abstract _resolve(path: Path): Path;
26 │ 
27 ▶   constructor(protected _delegate: Host<T>) {}
28 │ 
29 ▶   get capabilities(): HostCapabilities {
30 ▶     return this._delegate.capabilities;
31 │   }
32 │ 
33 ▶   write(path: Path, content: FileBuffer): Observable<void> {
34 ▶     return this._delegate.write(this._resolve(path), content);
35 │   }
36 │   read(path: Path): Observable<FileBuffer> {
37 │     return this._delegate.read(this._resolve(path));
38 │   }
39 │   delete(path: Path): Observable<void> {
40 │     return this._delegate.delete(this._resolve(path));
41 │   }
42 ▶   rename(from: Path, to: Path): Observable<void> {
43 ▶     return this._delegate.rename(this._resolve(from), this._resolve(to));
44 │   }
45 │ 
46 │   list(path: Path): Observable<PathFragment[]> {
47 │     return this._delegate.list(this._resolve(path));
48 │   }
```

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/resolver.ts` L60–69 （▶ の行: 62, 66–67）

```ts
60 │   // Some hosts may not support stat.
61 │   stat(path: Path): Observable<Stats<T> | null> | null {
62 ▶     return this._delegate.stat(this._resolve(path));
63 │   }
64 │ 
65 │   // Some hosts may not support watching.
66 ▶   watch(path: Path, options?: HostWatchOptions): Observable<HostWatchEvent> | null {
67 ▶     return this._delegate.watch(this._resolve(path), options);
68 │   }
69 │ }
```

`ResolverHost` は、どのメソッドでも 25 行目の `_resolve(path)` で path を変えてから 27 行目の `_delegate` に渡すだけの抽象クラスです。43 行目の `rename` は両方の path を変えます。29〜31 行目、`capabilities` は中の host のものをそのまま返すので、同期かどうかも中の host で決まります。67 行目の `watch` は path を変えて渡しますが、届いた通知の path は戻しません。記録では `ScopedHost(mem, '/root')` の `watch('/')` に届いた path は `/root/w.ts` でした。

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/scoped.ts` L13–24 （▶ の行: 16, 21–22）

```ts
13 │ export class ScopedHost<T extends object> extends ResolverHost<T> {
14 │   constructor(
15 │     delegate: Host<T>,
16 ▶     protected _root: Path = NormalizedRoot,
17 │   ) {
18 │     super(delegate);
19 │   }
20 │ 
21 ▶   protected _resolve(path: Path): Path {
22 ▶     return join(this._root, path);
23 │   }
24 │ }
```

`ScopedHost` の `_resolve` は 22 行目の `join(this._root, path)` 1 行です。`join` は[第 1 回](01-dvk-path.md)のとおり結果を `normalize` するので、記録では `'/a.ts'`・`'b.ts'`・`'dir/c.ts'` は `/root` の下に入りましたが、`'../escape.ts'` は `/root/../escape.ts` → `/escape.ts` と、**root の外**に書かれました。`'/../../up.ts'` は `normalize` の時点で「is invalid.」です。`ScopedHost` は「root の外を見せない」囲いではなく、「path の頭に root を付ける」だけです。

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/alias.ts` L12–26 （▶ の行: 15–16, 18, 21–22, 25）

````ts
12 │ /**
13 │  * A Virtual Host that allow to alias some paths to other paths.
14 │  *
15 ▶  * This does not verify, when setting an alias, that the target or source exist. Neither does it
16 ▶  * check whether it's a file or a directory. Please not that directories are also renamed/replaced.
17 │  *
18 ▶  * No recursion is done on the resolution, which means the following is perfectly valid then:
19 │  *
20 │  * ```
21 ▶  *     host.aliases.set(normalize('/file/a'), normalize('/file/b'));
22 ▶  *     host.aliases.set(normalize('/file/b'), normalize('/file/a'));
23 │  * ```
24 │  *
25 ▶  * This will result in a proper swap of two files for each others.
26 │  *
````

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/alias.ts` L58–81 （▶ の行: 62, 69–71, 73–74, 77, 80）

```ts
58 │ export class AliasHost<StatsT extends object = {}> extends ResolverHost<StatsT> {
59 │   protected _aliases: Map<Path, Path> = new Map();
60 │ 
61 │   protected _resolve(path: Path): Path {
62 ▶     let maybeAlias = this._aliases.get(path);
63 │     const sp = split(path);
64 │     const remaining: PathFragment[] = [];
65 │ 
66 │     // Also resolve all parents of the requested files, only picking the first one that matches.
67 │     // This can have surprising behaviour when aliases are inside another alias. It will always
68 │     // use the closest one to the file.
69 ▶     while (!maybeAlias && sp.length > 0) {
70 ▶       const p = join(NormalizedRoot, ...sp);
71 ▶       maybeAlias = this._aliases.get(p);
72 │ 
73 ▶       if (maybeAlias) {
74 ▶         maybeAlias = join(maybeAlias, ...remaining);
75 │       }
76 │       // Allow non-null-operator because we know sp.length > 0 (condition on while).
77 ▶       remaining.unshift(sp.pop()!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
78 │     }
79 │ 
80 ▶     return maybeAlias || path;
81 │   }
```

1. **62 行目：まず path そのもの**

   説明文の 21〜22 行目のとおり `/file/a → /file/b`・`/file/b → /file/a` を登録すると、`read('/file/a')` は `B`、`read('/file/b')` は `A` でした（25 行目の「入れ替え」）。
2. **69〜78 行目：親を長い方から**

   70 行目で今の `sp` から path を作り、見つかれば 74 行目で残りの片を付け足します。77 行目で末尾を 1 つ `remaining` に移して、短い親へ進みます。`/some → /other` と `/some/folder → /file` の両方があると、`/some/folder/a` は近い方の `/file/a` でした。
3. **80 行目：1 回だけ**

   置き換えた先をもう一度引くことはしません（18 行目）。記録の `/x → /some` で `read('/x/folder/file')` は `/some/folder/file` の中身 `S` で、`/some → /other` はたどりませんでした。

同じ `ResolverHost` の子に `PatternMatchingHost`（`pattern.ts`）があり、glob に合う path を関数で置き換えます。spec の名前は `works for NativeScript`（pattern\_spec.ts L14）で、packages の中で `new` している所は spec のほかにありません。

## 4. SyncDelegateHost：Observable を同期の値にする

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/sync.ts` L28–62 （▶ の行: 32–34, 38, 42–47, 50–51, 53–54, 61）

```ts
28 │ /**
29 │  * Implement a synchronous-only host interface (remove the Observable parts).
30 │  */
31 │ export class SyncDelegateHost<T extends object = {}> {
32 ▶   constructor(protected _delegate: Host<T>) {
33 ▶     if (!_delegate.capabilities.synchronous) {
34 ▶       throw new SynchronousDelegateExpectedException();
35 │     }
36 │   }
37 │ 
38 ▶   protected _doSyncCall<ResultT>(observable: Observable<ResultT>): ResultT {
39 │     let completed = false;
40 │     let result: ResultT | undefined = undefined;
41 │     let errorResult: Error | undefined = undefined;
42 ▶     // Perf note: this is not using an observer object to avoid a performance penalty in RxJS.
43 ▶     // See https://github.com/ReactiveX/rxjs/pull/5646 for details.
44 ▶     observable.subscribe(
45 ▶       (x: ResultT) => (result = x),
46 ▶       (err: Error) => (errorResult = err),
47 ▶       () => (completed = true),
48 │     );
49 │ 
50 ▶     if (errorResult !== undefined) {
51 ▶       throw errorResult;
52 │     }
53 ▶     if (!completed) {
54 ▶       throw new SynchronousDelegateExpectedException();
55 │     }
56 │ 
57 │     // The non-null operation is to work around `void` type. We don't allow to return undefined
58 │     // but ResultT could be void, which is undefined in JavaScript, so this doesn't change the
59 │     // behaviour.
60 │     // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
61 ▶     return result!;
62 │   }
```

1. **33〜35 行目：作るときに申告を見る**

   `capabilities.synchronous` が false なら作れません。記録の `new SyncDelegateHost(new NodeJsAsyncHost())` は「Expected a synchronous delegate but got an asynchronous one.」でした。
2. **44〜48 行目：購読して、その場で値を取る**

   3 つの関数を渡す形の `subscribe` で、最後の値・エラー・完了を変数に入れます（42〜43 行目のコメントは RxJS の性能のため）。
3. **50〜52 行目：エラーは投げ直す**

   Observable の `error` が普通の `throw` になります。記録の `s.read('/nope')` は `FileDoesNotExistException` を投げました。
4. **53〜55 行目：終わっていなければ例外**

   申告が嘘のとき、ここで分かります。記録では `synchronous: true` と言いながら `setTimeout` で返す host も、`next` だけ同期で `complete` を遅らせる host も、同じ例外でした。値が届いていても `complete` が無ければ使いません。

5 節の `CordHost` の `capabilities` は後ろの host の申告をそのまま返す（record.ts L84〜89）ので、`CordHost(NodeJsAsyncHost)` を `SyncDelegateHost` で包むことはできません（記録）。`HostTree` が `SyncDelegateHost(this._record)` を作れるのは、schematic の後ろの host が `NodeJsSyncHost`（申告 true）か `Empty`（`empty.ts`、申告 true）だからです。

## 5. CordHost：記録する host の write・read・delete

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/record.ts` L60–89 （▶ の行: 64–65, 67–68, 70–75, 77, 87）

```ts
60 │ /**
61 │  * A Host that records changes to the underlying Host, while keeping a record of Create, Overwrite,
62 │  * Rename and Delete of files.
63 │  *
64 ▶  * This is fully compatible with Host, but will keep a staging of every changes asked. That staging
65 ▶  * follows the principle of the Tree (e.g. can create a file that already exists).
66 │  *
67 ▶  * Using `create()` and `overwrite()` will force those operations, but using `write` will add
68 ▶  * the create/overwrite records IIF the files does/doesn't already exist.
69 │  */
70 ▶ export class CordHost extends SimpleMemoryHost {
71 ▶   protected _filesToCreate: Set<Path> = new Set();
72 ▶   protected _filesToRename: Map<Path, Path> = new Map();
73 ▶   protected _filesToRenameRevert: Map<Path, Path> = new Map();
74 ▶   protected _filesToDelete: Set<Path> = new Set();
75 ▶   protected _filesToOverwrite: Set<Path> = new Set();
76 │ 
77 ▶   constructor(protected _back: ReadonlyHost) {
78 │     super();
79 │   }
80 │ 
81 │   get backend(): ReadonlyHost {
82 │     return this._back;
83 │   }
84 │   override get capabilities(): HostCapabilities {
85 │     // Our own host is always Synchronous, but the backend might not be.
86 │     return {
87 ▶       synchronous: this._back.capabilities.synchronous,
88 │     };
89 │   }
```

`CordHost` は 70 行目で `SimpleMemoryHost` を継承し、変更はメモリ（2 節の `_cache`）に書き、71〜75 行目の 5 つの集合に「何をしたか」を覚えます。77 行目の `_back` は読むだけの host で、`CordHost` は後ろには書きません。`create` と `overwrite`（L195〜231）と `records()`（L152〜186）は[schematics の章](../cli/13-schematics.md)の 1・4 節です。67〜68 行目の説明文のとおり、`write` はあるかないかで `create` と `overwrite` を選びます。

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/record.ts` L233–256 （▶ の行: 234, 236, 238–239, 241, 244, 251–252, 255）

```ts
233 │   override write(path: Path, content: FileBuffer): Observable<void> {
234 ▶     return this.exists(path).pipe(
235 │       switchMap((exists) => {
236 ▶         if (exists) {
237 │           // It exists, but might be being renamed or deleted. In that case we want to create it.
238 ▶           if (this.willRename(path) || this.willDelete(path)) {
239 ▶             return this.create(path, content);
240 │           } else {
241 ▶             return this.overwrite(path, content);
242 │           }
243 │         } else {
244 ▶           return this.create(path, content);
245 │         }
246 │       }),
247 │     );
248 │   }
249 │ 
250 │   override read(path: Path): Observable<FileBuffer> {
251 ▶     if (this._exists(path)) {
252 ▶       return super.read(path);
253 │     }
254 │ 
255 ▶     return this._back.read(path);
256 │   }
```

234 行目の `this.exists` は 6 節の最後に引く上書き版で、メモリになければ後ろを見ます。238 行目、あっても rename か delete の予定なら `create` にします。記録の「rename a→x → write a」は `rename /a.txt→/x.txt` と `create /a.txt "new"` の 2 つになりました。`read` は 251 行目でメモリにあればメモリ、無ければ 255 行目で後ろを読みます。

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/record.ts` L258–292 （▶ の行: 259–264, 266, 269–270, 272, 278, 280, 283, 285, 287）

```ts
258 │   override delete(path: Path): Observable<void> {
259 ▶     if (this._exists(path)) {
260 ▶       if (this._filesToCreate.has(path)) {
261 ▶         this._filesToCreate.delete(path);
262 ▶       } else if (this._filesToOverwrite.has(path)) {
263 ▶         this._filesToOverwrite.delete(path);
264 ▶         this._filesToDelete.add(path);
265 │       } else {
266 ▶         const maybeOrigin = this._filesToRenameRevert.get(path);
267 │         if (maybeOrigin) {
268 │           this._filesToRenameRevert.delete(path);
269 ▶           this._filesToRename.delete(maybeOrigin);
270 ▶           this._filesToDelete.add(maybeOrigin);
271 │         } else {
272 ▶           return throwError(
273 │             new UnknownException(`This should never happen. Path: ${JSON.stringify(path)}.`),
274 │           );
275 │         }
276 │       }
277 │ 
278 ▶       return super.delete(path);
279 │     } else {
280 ▶       return this._back.exists(path).pipe(
281 │         switchMap((exists) => {
282 │           if (exists) {
283 ▶             this._filesToDelete.add(path);
284 │ 
285 ▶             return of<void>();
286 │           } else {
287 ▶             return throwError(new FileDoesNotExistException(path));
288 │           }
289 │         }),
290 │       );
291 │     }
292 │   }
```

1. **260〜261 行目：作ったものを消す**

   記録の「create → delete」は records が空になり、後ろには何も起きません。
2. **262〜264 行目：上書きしたものを消す**

   上書きを忘れて `delete` にします（記録「overwrite → delete」は `delete /a.txt` だけ）。
3. **266〜270 行目：rename の先を消す**

   rename を取り消して元を消します（記録「rename a→x → delete x」は `delete /a.txt`）。
4. **280〜290 行目：後ろにだけあるもの**

   283 行目で集合に入れるだけです。285 行目の `of<void>()` は値を 1 つも出さずに終わるので、記録の `c.delete('/c.txt')` は「next 0 回・complete」でした。メモリにあった場合（278 行目、2 節の `delete`）は next が 1 回なので、同じメソッドで出す値の数が場合によって違います。

## 6. CordHost の rename：重ねた rename とメモリのずれ

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/record.ts` L294–328 （▶ の行: 295, 298, 301–302, 305, 310–312, 314, 316–317, 321–322, 324）

```ts
294 │   override rename(from: Path, to: Path): Observable<void> {
295 ▶     return concat(this.exists(to), this.exists(from)).pipe(
296 │       toArray(),
297 │       switchMap(([existTo, existFrom]) => {
298 ▶         if (!existFrom) {
299 │           return throwError(new FileDoesNotExistException(from));
300 │         }
301 ▶         if (from === to) {
302 ▶           return EMPTY;
303 │         }
304 │ 
305 ▶         if (existTo) {
306 │           return throwError(new FileAlreadyExistException(to));
307 │         }
308 │ 
309 │         // If we're renaming a file that's been created, shortcircuit to creating the `to` path.
310 ▶         if (this._filesToCreate.has(from)) {
311 ▶           this._filesToCreate.delete(from);
312 ▶           this._filesToCreate.add(to);
313 │ 
314 ▶           return super.rename(from, to);
315 │         }
316 ▶         if (this._filesToOverwrite.has(from)) {
317 ▶           this._filesToOverwrite.delete(from);
318 │ 
319 │           // Recursively call this function. This is so we don't repeat the bottom logic. This
320 │           // if will be by-passed because we just deleted the `from` path from files to overwrite.
321 ▶           return concat(
322 ▶             this.rename(from, to),
323 │             new Observable<never>((x) => {
324 ▶               this._filesToOverwrite.add(to);
325 │               x.complete();
326 │             }),
327 │           );
328 │         }
```

295 行目で `to` と `from` がそれぞれあるかを順に調べ、301〜303 行目、同じ path なら何もしません。310〜315 行目、作ったばかりのファイルの rename は「作る先を変える」だけです（記録「create → rename」は `create /m.txt` だけ）。316〜327 行目、上書きしたものは、上書きの印を外して自分を呼び直し、終わったら 324 行目で `to` に上書きの印を付けます（記録「overwrite → rename」は `rename /a.txt→/z.txt` と `overwrite /z.txt`）。

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/record.ts` L329–359 （▶ の行: 329–332, 335, 338–339, 342–344, 347–348, 351–352, 355）

```ts
329 ▶         if (this._filesToDelete.has(to)) {
330 ▶           this._filesToDelete.delete(to);
331 ▶           this._filesToDelete.add(from);
332 ▶           this._filesToOverwrite.add(to);
333 │ 
334 │           // We need to delete the original and write the new one.
335 ▶           return this.read(from).pipe(map((content) => this._write(to, content)));
336 │         }
337 │ 
338 ▶         const maybeTo1 = this._filesToRenameRevert.get(from);
339 ▶         if (maybeTo1) {
340 │           // We already renamed to this file (A => from), let's rename the former to the new
341 │           // path (A => to).
342 ▶           this._filesToRename.delete(maybeTo1);
343 ▶           this._filesToRenameRevert.delete(from);
344 ▶           from = maybeTo1;
345 │         }
346 │ 
347 ▶         this._filesToRename.set(from, to);
348 ▶         this._filesToRenameRevert.set(to, from);
349 │ 
350 │         // If the file is part of our data, just rename it internally.
351 ▶         if (this._exists(from)) {
352 ▶           return super.rename(from, to);
353 │         } else {
354 │           // Create a file with the same content.
355 ▶           return this._back.read(from).pipe(switchMap((content) => super.write(to, content)));
356 │         }
357 │       }),
358 │     );
359 │   }
```

329〜336 行目、消す予定の path へ rename するなら、「元を消して先を上書き」に変えます（記録「delete b → rename a→b」は `delete /a.txt` と `overwrite /b.txt "A"`）。338〜345 行目は「A → from と rename 済みの from を、さらに to へ」で、記録 `a → x → y` の `records()` は `rename /a.txt→/y.txt` 1 つにまとまりました。

ただしメモリの方はまとまりません。1 回目の `a → x` は、`a` が後ろにしか無いので 355 行目で中身を読んで **メモリに `x` を書きます**。2 回目は 344 行目で `from` を `a` に置き換えてから 351 行目で `this._exists(from)`（`a` はメモリに無い）を見るので、また 355 行目で `y` を書きます。メモリの `x` を消す行はありません。`HostTree`（中は `CordHost`）で同じことをした記録では、`tree.rename('/a.txt', '/x.txt')`・`tree.rename('/x.txt', '/y.txt')` のあと、actions は `r /a.txt→/y.txt` だけなのに、`tree.exists('/x.txt')` は true、`tree.read('/x.txt')` は `A` でした。

よくある「入れ替え」（`a → t`、`b → a`、`t → b`）では、3 回目に 344 行目で `from` が `a` になり、そのときメモリの `a` には 2 回目で書いた `B` が入っているので、352 行目がそれを `b` へ動かします。記録の `HostTree` は `read('/a.txt')` が null、`read('/b.txt')` が `B`、`read('/t.txt')` が `A` でした。records は `rename /b.txt→/a.txt`、`rename /a.txt→/b.txt` の順で、7 節の `commit` も `HostSink` も 1 つ目で「Path "/a.txt" already exist.」になり、後ろは変わりませんでした。この行は 2018 年に devkit をこの repo に移した 44086c60ff からあり、main も同じです。

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/record.ts` L361–388 （▶ の行: 362, 373, 375, 377, 380, 383, 385）

```ts
361 │   override list(path: Path): Observable<PathFragment[]> {
362 ▶     return concat(super.list(path), this._back.list(path)).pipe(
363 │       reduce((list: Set<PathFragment>, curr: PathFragment[]) => {
364 │         curr.forEach((elem) => list.add(elem));
365 │ 
366 │         return list;
367 │       }, new Set<PathFragment>()),
368 │       map((set) => [...set]),
369 │     );
370 │   }
371 │ 
372 │   override exists(path: Path): Observable<boolean> {
373 ▶     return this._exists(path)
374 │       ? of(true)
375 ▶       : this.willDelete(path) || this.willRename(path)
376 │         ? of(false)
377 ▶         : this._back.exists(path);
378 │   }
379 │   override isDirectory(path: Path): Observable<boolean> {
380 ▶     return this._exists(path) ? super.isDirectory(path) : this._back.isDirectory(path);
381 │   }
382 │   override isFile(path: Path): Observable<boolean> {
383 ▶     return this._exists(path)
384 │       ? super.isFile(path)
385 ▶       : this.willDelete(path) || this.willRename(path)
386 │         ? of(false)
387 │         : this._back.isFile(path);
388 │   }
```

373〜377 行目の `exists` は、メモリにあれば true、消す・rename の予定なら false、それ以外は後ろに聞きます。一方 362 行目の `list` は、メモリと後ろの一覧を合わせるだけで予定を見ません。記録の `c.list('/')` には、rename した `b.txt` と消した `c.txt` も入っていました。`HostTree` の `DirEntry` は一覧を `isFile`（383〜387 行目、予定を見る）で絞るので、Tree からは見えません。380 行目の `isDirectory` は予定を見ません。

## 7. commit：記録を流す順と衝突

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/record.ts` L117–150 （▶ の行: 117, 119–120, 122–123, 125, 127, 129–130, 132, 137, 139–140, 148）

```ts
117 ▶   commit(host: Host, force = false): Observable<void> {
118 │     // Really commit everything to the actual host.
119 ▶     return observableFrom(this.records()).pipe(
120 ▶       concatMap((record) => {
121 │         switch (record.kind) {
122 ▶           case 'delete':
123 ▶             return host.delete(record.path);
124 │           case 'rename':
125 ▶             return host.rename(record.from, record.to);
126 │           case 'create':
127 ▶             return host.exists(record.path).pipe(
128 │               switchMap((exists) => {
129 ▶                 if (exists && !force) {
130 ▶                   return throwError(new FileAlreadyExistException(record.path));
131 │                 } else {
132 ▶                   return host.write(record.path, record.content);
133 │                 }
134 │               }),
135 │             );
136 │           case 'overwrite':
137 ▶             return host.exists(record.path).pipe(
138 │               switchMap((exists) => {
139 ▶                 if (!exists && !force) {
140 ▶                   return throwError(new FileDoesNotExistException(record.path));
141 │                 } else {
142 │                   return host.write(record.path, record.content);
143 │                 }
144 │               }),
145 │             );
146 │         }
147 │       }),
148 ▶       reduce(() => {}),
149 │     );
150 │   }
```

119 行目、流すのは `records()` の順（delete → rename → create → overwrite、[schematics の章](../cli/13-schematics.md)の 4 節）で、120 行目の `concatMap` で 1 つずつ終わるのを待ちます。delete と rename はそのまま渡し、create は 129 行目で「もうある」なら、overwrite は 139 行目で「無い」なら止めます。`force`（117 行目の 2 つ目の引数、説明は L112〜113）はこの 2 つの確かめを飛ばします。148 行目の `reduce` で、全部終わったら 1 回だけ値を出します。

記録の衝突は 4 つです。（1）記録したあと後ろに同じ path ができると、`create` は「already exist.」で止まり、`force=true` なら上書きしました。（2）overwrite を記録したあと後ろから消えると「does not exist.」。（3）後ろにある `/a.txt` を `c.create` すると、L196 はメモリしか見ないので通り、`commit` で初めて「already exist.」になりました（schematics の章の 1 節と同じ）。（4）6 節の入れ替えは、1 つ目の rename で止まります。止まったときは、それより前に流した記録は後ろに残ります。`concatMap` で順に流すだけで、まとめて取り消す仕組みは無いからです。

📄 `angular-cli/packages/angular_devkit/core/src/virtual-fs/host/safe.ts` L13–41 （▶ の行: 13–15, 29, 32–33, 36, 39）

```ts
13 ▶ /**
14 ▶  * A Host that filters out errors. The only exception is `read()` which will still error out if
15 ▶  * the delegate returned an error (e.g. NodeJS will error out if the file doesn't exist).
16 │  */
17 │ export class SafeReadonlyHost<StatsT extends object = {}> implements ReadonlyHost<StatsT> {
18 │   constructor(private _delegate: ReadonlyHost<StatsT>) {}
19 │ 
20 │   get capabilities(): HostCapabilities {
21 │     return this._delegate.capabilities;
22 │   }
23 │ 
24 │   read(path: Path): Observable<FileBuffer> {
25 │     return this._delegate.read(path);
26 │   }
27 │ 
28 │   list(path: Path): Observable<PathFragment[]> {
29 ▶     return this._delegate.list(path).pipe(catchError(() => of([])));
30 │   }
31 │ 
32 ▶   exists(path: Path): Observable<boolean> {
33 ▶     return this._delegate.exists(path);
34 │   }
35 │   isDirectory(path: Path): Observable<boolean> {
36 ▶     return this._delegate.isDirectory(path).pipe(catchError(() => of(false)));
37 │   }
38 │   isFile(path: Path): Observable<boolean> {
39 ▶     return this._delegate.isFile(path).pipe(catchError(() => of(false)));
40 │   }
41 │ 
```

`HostTree` は後ろの host を `SafeReadonlyHost` で包んでから `CordHost` に渡します（schematics の章の 1 節）。説明文（13〜15 行目）は「エラーを全部捨てる。例外は `read()` だけ」と言いますが、32〜34 行目の `exists` もエラーをそのまま通します。`NodeJsSyncHost` の `exists` は `existsSync`（エラーを投げない）なので、ふだんの実行では違いは表に出ません。

## 8. Node のディスクへ：NodeJsSyncHost と NodeJsAsyncHost

📄 `angular-cli/packages/angular_devkit/core/node/host.ts` L60–89 （▶ の行: 66, 70–71, 82–84, 87–88）

```ts
60 │ /**
61 │  * An implementation of the Virtual FS using Node as the background. There are two versions; one
62 │  * synchronous and one asynchronous.
63 │  */
64 │ export class NodeJsAsyncHost implements virtualFs.Host<Stats> {
65 │   get capabilities(): virtualFs.HostCapabilities {
66 ▶     return { synchronous: false };
67 │   }
68 │ 
69 │   write(path: Path, content: virtualFs.FileBuffer): Observable<void> {
70 ▶     return observableFrom(fsPromises.mkdir(getSystemPath(dirname(path)), { recursive: true })).pipe(
71 ▶       mergeMap(() => fsPromises.writeFile(getSystemPath(path), new Uint8Array(content))),
72 │     );
73 │   }
74 │ 
75 │   read(path: Path): Observable<virtualFs.FileBuffer> {
76 │     return observableFrom(fsPromises.readFile(getSystemPath(path))).pipe(
77 │       map((buffer) => new Uint8Array(buffer).buffer),
78 │     );
79 │   }
80 │ 
81 │   delete(path: Path): Observable<void> {
82 ▶     return observableFrom(
83 ▶       fsPromises.rm(getSystemPath(path), { force: true, recursive: true, maxRetries: 3 }),
84 ▶     );
85 │   }
86 │ 
87 ▶   rename(from: Path, to: Path): Observable<void> {
88 ▶     return observableFrom(fsPromises.rename(getSystemPath(from), getSystemPath(to)));
89 │   }
```

📄 `angular-cli/packages/angular_devkit/core/node/host.ts` L157–196 （▶ の行: 159, 163–166, 182, 184, 190–192）

```ts
157 │ export class NodeJsSyncHost implements virtualFs.Host<Stats> {
158 │   get capabilities(): virtualFs.HostCapabilities {
159 ▶     return { synchronous: true };
160 │   }
161 │ 
162 │   write(path: Path, content: virtualFs.FileBuffer): Observable<void> {
163 ▶     return new Observable((obs) => {
164 ▶       mkdirSync(getSystemPath(dirname(path)), { recursive: true });
165 ▶       writeFileSync(getSystemPath(path), new Uint8Array(content));
166 ▶       obs.next();
167 │       obs.complete();
168 │     });
169 │   }
170 │ 
171 │   read(path: Path): Observable<virtualFs.FileBuffer> {
172 │     return new Observable((obs) => {
173 │       const buffer = readFileSync(getSystemPath(path));
174 │ 
175 │       obs.next(new Uint8Array(buffer).buffer);
176 │       obs.complete();
177 │     });
178 │   }
179 │ 
180 │   delete(path: Path): Observable<void> {
181 │     return new Observable<void>((obs) => {
182 ▶       rmSync(getSystemPath(path), { force: true, recursive: true, maxRetries: 3 });
183 │ 
184 ▶       obs.complete();
185 │     });
186 │   }
187 │ 
188 │   rename(from: Path, to: Path): Observable<void> {
189 │     return new Observable((obs) => {
190 ▶       const toSystemPath = getSystemPath(to);
191 ▶       mkdirSync(pathDirname(toSystemPath), { recursive: true });
192 ▶       renameSync(getSystemPath(from), toSystemPath);
193 │       obs.next();
194 │       obs.complete();
195 │     });
196 │   }
```

どちらも `getSystemPath`（[第 1 回](01-dvk-path.md)）で OS の path にして `node:fs` を呼びます。同期版は 163 行目の `new Observable` の中で `writeFileSync` などを呼び、166〜167 行目で `next` と `complete` まで進むので、159 行目で `synchronous: true` と申告します。非同期版は 66 行目で false です。書くときは両方とも先に親のフォルダを作ります（70 行目、164 行目）。記録の `write('<work>/node-host/src/deep/a.txt')` は親が無くても通りました。

2 つの版で違うところが 2 つあります。

- **rename の先のフォルダ。**同期版は 191 行目で先の親を作りますが、非同期版の 88 行目は作りません。記録では、同期版の `rename(… → out/x/b.txt)` は通り、非同期版の同じ形は「ENOENT: no such file or directory, rename」でした。191 行目は 54b79ade65（2020-02、`Rename to a non-existing dir`）が同期版にだけ足したものです。
- **delete が出す値。**同期版の 182〜184 行目は `rmSync` のあと `complete` だけで、`next` を出しません。非同期版の 82〜84 行目は Promise から作るので 1 回出します。記録では同期版の delete は 3 回とも「next 0 回・complete」、`await lastValueFrom(host.delete(…))` は `EmptyError`（no elements in sequence）を投げました。同じ形は 2019 年に #14235（`Host.delete() completes but never emits`）として 8fcf9a4401 が `of(undefined)` に直しましたが、Node 12 を落とした 4ebfe03415（2022-03-04）が delete を `rmSync` 1 本に書き直したとき、`obs.next()` が入らずに元に戻りました。

182 行目と 83 行目の `rm` は `force: true` なので、無い path の delete も例外になりません（記録）。`watch`（L229〜266、引用なし）は購読したときに初めて `chokidar` を読み、`change`・`add`・`unlink` の 3 つだけを通知にします。

> **🧪 DEMO — 本物の host を Node から呼んだ記録**
>
> ボタンは、22.2.7 の dist を記録のスクリプトから呼んだ入力と結果を再生します。1 行目が呼んだもの、下の枠が結果です。Observable は 1 回だけ購読し、`next` の回数と値、`complete` したかを書きました。例外とエラーは左に印を付けます。5 の path の `<work>` は作業用の場所です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-host)

### ここまでの呼び出し（schematic の tree.rename がディスクに届くまで）

- `new NodeWorkflow(root)` — schematics/tools/workflow/node-workflow.ts L44 — *ScopedHost(new NodeJsSyncHost(), root)*
  - `new HostTree(backend)` — schematics/src/tree/host-tree.ts L130〜133 — *CordHost(SafeReadonlyHost(backend)) を SyncDelegateHost で包む*
    - 👤 `tree.rename('/a.txt', '/x.txt')` — host-tree.ts L422
      - `SyncDelegateHost.rename` → `_doSyncCall` — sync.ts L80・L38 — *購読してその場で終わらなければ例外*
        - `CordHost.rename(from, to)` — record.ts L294 — *集合に覚え、メモリに書く（L347・L355）*
          - `SafeReadonlyHost.read` → `ScopedHost.read` → `NodeJsSyncHost.read` — safe.ts L24・resolver.ts L36・node/host.ts L171 — *join(root, path) して readFileSync*
  - `tree.actions` → sink — host-tree.ts L465 — *records() の順（schematics の章）*
    - `NodeJsSyncHost.rename` — node/host.ts L188 — *先の親を mkdirSync してから renameSync*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `core/src/virtual-fs/host/memory_spec.ts` | `SimpleMemoryHost`（14）› `can watch`（15）・`can delete directory`（66）・`can rename`（82）・`can list`（96）・`makes every path absolute`（134）ほか 8 個 | 2 節。rename は file だけ。file の下に書く・directory の rename・同じ path の recursive の watch・persistent の混在は無い |
| `core/src/virtual-fs/host/record_spec.ts` | `CordHost`（13）› `works (rename -> rename)`（175）ほか 28 個の `works (…)`、`errors: commit (…)`（434〜493）・`errors (…)`（514〜561） | 5〜7 節。175 行目の it は commit した先しか見ず（187〜194 行目）、`host.exists('/blue')` は確かめない。入れ替えの rename は無い |
| `core/src/virtual-fs/host/alias_spec.ts`・`pattern_spec.ts` | `works as in the example`（14）・`(2)`（34）、`works for NativeScript`（14） | 3 節。`ScopedHost` の spec は無い |
| `core/node/host_spec.ts` | `NodeJsAsyncHost`（22）› `should get correct result for exists`（33）、`NodeJsSyncHost`（71）› `linuxOnlyIt` の 3 つ（L85 ほか、`rename to a non-existing dir` を含む） | 8 節。delete が値を出すかは見ない。18〜20 行目で macOS と Windows では 3 つとも `xit` になる |

📄 `走らせたコマンド（2026-11-26）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular_devkit/core:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=CordHost|SimpleMemoryHost|AliasHost|PatternMatchingHost|TestHost"
$ pnpm bazel test //packages/angular_devkit/core/node:test --nocache_test_results --test_output=all
（結果は下の段落）
```

手元の bazel（macOS）で、名前で絞った core は 38 specs・0 failures、core/node は 4 specs・0 failures・3 pending でした（pending は 18〜20 行目の `xit` で、`rename to a non-existing dir` も含む。macOS では 191 行目の振る舞いを spec は確かめていない）。

直すとしたら、`memory.ts` の 167 行目と 235 行目の `this._cache.get(fr)` を `this._cache.get(curr)` にします（spec は memory\_spec.ts に「file の下に書くと `PathIsFileException`」）。directory の rename は 223 行目のあとで元の鍵を消し、`to` に directory の印を入れます。watch は 120・140 行目を「終わった 1 つだけを配列から外す」にし、125 行目のループを親から始めます。`record.ts` の rename は、338〜345 行目で `from` を置き換える前に、メモリの `from`（中間の path）を `to` へ動かす必要があります（spec は record\_spec.ts の 175 行目の it に ``host.exists(path`/blue`)`` が false の期待と、入れ替えの it を足す）。`node/host.ts` は 184 行目の前に `obs.next()` を足し、88 行目の前に先の親の `mkdir` を足します（spec は host\_spec.ts に、`linuxOnlyIt` でない形で「delete が 1 回値を出す」）。

## 聞かれそうな質問

**Q. host のメソッドを呼んだのに何も起きません。**

Observable を返すだけで、購読するまで動かないからです（memory.ts L320〜321）。同期で使うなら `SyncDelegateHost` で包みます。中の host が `synchronous: true` でなければ作るときに例外です（sync.ts L33〜35）。

**Q. `ScopedHost` で root の外に書けないようにできますか？**

できません。`_resolve` は `join(this._root, path)` だけなので（scoped.ts L22）、`../escape.ts` は root の外の `/escape.ts` になりました（記録）。`normalize` が弾くのは、`/` より上に出る絶対の path だけです。

**Q. `CordHost` の `commit` は途中で失敗したら元に戻りますか？**

戻りません。`concatMap` で 1 つずつ流し（record.ts L120）、失敗した記録より前のものは後ろの host に残ります。create と overwrite の存在の確かめは `force` で飛ばせます（L129・L139）。

**Q. schematic で 2 つのファイルを入れ替える rename をすると何が起きますか？**

22.2.7 でも main でも、Tree の中で `a` が消え、`t` が残り、sink は「Path "/a.txt" already exist.」で止まります（記録）。`CordHost.rename` の 344 行目で `from` を元の path に置き換えたあと、351〜352 行目がメモリの別の中身を動かすからです。

**Q. `NodeJsSyncHost.delete` を `lastValueFrom` で待つと例外になります。**

182〜184 行目が `complete` だけで `next` を出さないからです（記録は `EmptyError`）。`lastValueFrom(obs, { defaultValue: undefined })` にするか、`SyncDelegateHost` を通せば（sync.ts L53 は complete だけを見る）止まりません。

## 読み終えて

- host は Observable で返す 10 個のメソッドの約束で、`capabilities.synchronous` は「購読したその場で終わる」という申告。`SyncDelegateHost` はそれを確かめ、終わらなければ例外にする。
- `SimpleMemoryHost` は 1 つの Map。親が file でも止まらず（L167・L235 が `fr` を引く）、directory の rename は写すだけで元が残り、watch は同じ path に 2 回届いたり、1 つが終わると同じ path の全部が消えたりする。
- `ScopedHost`・`AliasHost` は path を変えて渡すだけ。`ScopedHost` は `..` で外に出られ、watch の path は戻さない。`AliasHost` は近い親を 1 回だけ置き換える。
- `CordHost` は集合とメモリの 2 つで変更を覚え、`records()` の順に流す。重ねた rename では集合はまとまるがメモリがずれ、入れ替えは Tree の中身も commit も壊れる。
- `NodeJsSyncHost` と `NodeJsAsyncHost` は rename の先のフォルダと delete の値の数が違う。同期版の delete が値を出さないのは 2019 年に直した形への後戻り。

---

← 前: [パスと文字列：virtual-fs/path と utils/strings](01-dvk-path.md)  
次: [JSON schema の検査：registry・transforms・visitor](03-dvk-schema.md) →
