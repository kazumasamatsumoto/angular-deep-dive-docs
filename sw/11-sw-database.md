[目次](../README.md) › [Service Worker の内側](README.md) › 第 11 回 / 全 20 回

# キャッシュの中の小さな DB：CacheDatabase と名前の付け方

> ワーカーが状態（版の一覧・タブの割り当て・最新のハッシュ・LRU の表・取ってきた時刻）を Cache Storage の中に JSON で置く CacheDatabase と CacheTable（db-cache.ts・database.ts）、キャッシュの名前 ngsw:/:db:control などの付け方と、スコープごとに名前を分ける NamedCacheStorage・Adapter（adapter.ts）。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sw-database)

---

ワーカーは、どの版を持っているか・どのタブにどの版を割り当てたか・最新はどれか、を覚えておく必要があります。ワーカーはいつ止められるか分からないので、メモリの中だけでは足りません。ngsw はこれを、ファイルを入れるのと同じ **Cache Storage の中に JSON で**置きます。この章では、その小さな DB（`CacheDatabase` と `CacheTable`）、キャッシュの名前 `ngsw:/:db:control` がどう組み立てられるか（`NamedCacheStorage` と `Adapter`）、`Driver` の 3 つの値を書く `sync` を、行番号を指して追います。

読む対象は `packages/service-worker/worker/src/` の `database.ts`・`db-cache.ts`・`named-cache-storage.ts`・`adapter.ts` と、`driver.ts` の `sync` です。

1. [1. 全体像](01-sw-overview.md)
2. [2. Generator](02-sw-config-generator.md)
3. [3. ビルド](03-sw-cli-build.md)
4. [4. 登録](04-sw-register.md)
5. [5. Driver の起動](05-sw-driver-lifecycle.md)
6. [6. fetch の横取り](06-sw-driver-fetch.md)
7. [7. 版とタブ](07-sw-versions.md)
8. [8. アセット](08-sw-asset-groups.md)
9. [9. ハッシュ](09-sw-hash-integrity.md)
10. [10. データ](10-sw-data-groups.md)
11. **11. 小さな DB**（この章）
12. [12. 更新の確認](12-sw-update-check.md)
13. [13. SwUpdate](13-sw-swupdate.md)
14. [14. アイドルと掃除](14-sw-idle-cleanup.md)
15. [15. 壊れたとき](15-sw-safe-mode.md)
16. [16. プッシュ](16-sw-push.md)
17. [17. デバッグ](17-sw-debug.md)
18. [18. ワーカーのテスト](18-sw-testing-harness.md)
19. [19. アプリ側のテスト](19-sw-testing-app.md)
20. [20. issue と PR を読む](20-sw-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> **Cache Storage** は、ブラウザがオリジンごとに持つ「名前付きのキャッシュの棚」です。`caches.open(名前)` で 1 つの `Cache` を開き、`cache.put(Request, Response)` で「要求 → 応答」の組を入れ、`cache.match(Request)` で取り出します。ページからもワーカーからも同じ棚が見え、DevTools の Application タブの Cache Storage に名前が並びます。ワーカーの入口 `main.ts` が `new Adapter(scope.registration.scope, self.caches)` と `new CacheDatabase(adapter)` を作って `Driver` に渡すところは [第 5 回](05-sw-driver-lifecycle.md)で読みました。

## 1. 表と DB の約束：database.ts

📄 `angular/packages/service-worker/worker/src/database.ts` L9–38 （▶ の行: 12, 16, 21, 26, 31–32, 37）

```ts
 9 │ /**
10 │  * An abstract table, with the ability to read/write objects stored under keys.
11 │  */
12 ▶ export interface Table {
13 │   /**
14 │    * The name of this table in the database.
15 │    */
16 ▶   name: string;
17 │ 
18 │   /**
19 │    * Delete a key from the table.
20 │    */
21 ▶   'delete'(key: string): Promise<boolean>;
22 │ 
23 │   /**
24 │    * List all the keys currently stored in the table.
25 │    */
26 ▶   keys(): Promise<string[]>;
27 │ 
28 │   /**
29 │    * Read a key from a table, either as an Object or with a given type.
30 │    */
31 ▶   read(key: string): Promise<Object>;
32 ▶   read<T>(key: string): Promise<T>;
33 │ 
34 │   /**
35 │    * Write a new value for a key to the table, overwriting any previous value.
36 │    */
37 ▶   write(key: string, value: Object): Promise<void>;
38 │ }
```

`Table` は「キー（文字列）→ オブジェクト」の表で、`delete`・`keys`・`read`・`write` の 4 つだけです。32 行目の `read<T>` は型を付けて読む版で、中身は同じです。

📄 `angular/packages/service-worker/worker/src/database.ts` L40–68 （▶ の行: 43, 47, 52, 57, 63–66）

```ts
40 │ /**
41 │  * An abstract database, consisting of multiple named `Table`s.
42 │  */
43 ▶ export interface Database {
44 │   /**
45 │    * Delete an entire `Table` from the database, by name.
46 │    */
47 ▶   'delete'(table: string): Promise<boolean>;
48 │ 
49 │   /**
50 │    * List all `Table`s by name.
51 │    */
52 ▶   list(): Promise<string[]>;
53 │ 
54 │   /**
55 │    * Open a `Table`.
56 │    */
57 ▶   open(table: string, cacheQueryOptions?: CacheQueryOptions): Promise<Table>;
58 │ }
59 │ 
60 │ /**
61 │  * An error returned in rejected promises if the given key is not found in the table.
62 │  */
63 ▶ export class NotFound {
64 ▶   constructor(
65 ▶     public table: string,
66 ▶     public key: string,
67 │   ) {}
68 │ }
```

`Database` は名前で表を開く・消す・一覧する、の 3 つです。63〜67 行目の `NotFound` は、キーが無いときに `read` が reject で返す値です（`Error` の子ではありません）。`Driver.initialize` はこの reject を `catch` して「初めての起動」とみなし、`ngsw.json` を取りに行きます（第 5 回）。

## 2. Cache Storage の上の実装：CacheDatabase

📄 `angular/packages/service-worker/worker/src/db-cache.ts` L13–48 （▶ の行: 13–15, 18, 27, 31, 33, 37, 41–44）

```ts
13 ▶ /**
14 ▶  * An implementation of a `Database` that uses the `CacheStorage` API to serialize
15 ▶  * state within mock `Response` objects.
16 │  */
17 │ export class CacheDatabase implements Database {
18 ▶   private cacheNamePrefix = 'db';
19 │   private tables = new Map<string, CacheTable>();
20 │ 
21 │   constructor(private adapter: Adapter) {}
22 │ 
23 │   'delete'(name: string): Promise<boolean> {
24 │     if (this.tables.has(name)) {
25 │       this.tables.delete(name);
26 │     }
27 ▶     return this.adapter.caches.delete(`${this.cacheNamePrefix}:${name}`);
28 │   }
29 │ 
30 │   async list(): Promise<string[]> {
31 ▶     const prefix = `${this.cacheNamePrefix}:`;
32 │     const allCacheNames = await this.adapter.caches.keys();
33 ▶     const dbCacheNames = allCacheNames.filter((name) => name.startsWith(prefix));
34 │ 
35 │     // Return the un-prefixed table names, so they can be used with other `CacheDatabase` methods
36 │     // (for example, for opening/deleting a table).
37 ▶     return dbCacheNames.map((name) => name.slice(prefix.length));
38 │   }
39 │ 
40 │   async open(name: string, cacheQueryOptions?: CacheQueryOptions): Promise<Table> {
41 ▶     if (!this.tables.has(name)) {
42 ▶       const cache = await this.adapter.caches.open(`${this.cacheNamePrefix}:${name}`);
43 ▶       const table = new CacheTable(name, cache, this.adapter, cacheQueryOptions);
44 ▶       this.tables.set(name, table);
45 │     }
46 │     return this.tables.get(name)!;
47 │   }
48 │ }
```

1. **18 行目：表の名前の頭は `db`**

   表 `control` は、キャッシュ `db:control` になります。
2. **40〜47 行目：open は 1 回だけ caches.open する**

   42 行目で `adapter.caches.open('db:' + name)` し、43 行目で `CacheTable` に包み、44 行目で覚えておきます。2 回目からは覚えたものを返します。
3. **30〜37 行目：list は `db:` で始まるキャッシュの名前から頭を取る**

   27 行目の `delete` も同じ頭を付けて消します。

ここで使う `this.adapter.caches` は、ブラウザの `caches` そのものではなく、もう 1 つ頭を付ける `NamedCacheStorage` です（4 節）。

## 3. 1 つの値は 1 つの「偽の応答」：CacheTable

📄 `angular/packages/service-worker/worker/src/db-cache.ts` L50–89 （▶ の行: 62, 65–66, 74, 77–78, 80, 82, 86–87）

```ts
50 │ /**
51 │  * A `Table` backed by a `Cache`.
52 │  */
53 │ export class CacheTable implements Table {
54 │   cacheName: string;
55 │ 
56 │   constructor(
57 │     readonly name: string,
58 │     private cache: NamedCache,
59 │     private adapter: Adapter,
60 │     private cacheQueryOptions?: CacheQueryOptions,
61 │   ) {
62 ▶     this.cacheName = this.cache.name;
63 │   }
64 │ 
65 ▶   private request(key: string): Request {
66 ▶     return this.adapter.newRequest('/' + key);
67 │   }
68 │ 
69 │   'delete'(key: string): Promise<boolean> {
70 │     return this.cache.delete(this.request(key), this.cacheQueryOptions);
71 │   }
72 │ 
73 │   keys(): Promise<string[]> {
74 ▶     return this.cache.keys().then((requests) => requests.map((req) => req.url.slice(1)));
75 │   }
76 │ 
77 ▶   read(key: string): Promise<any> {
78 ▶     return this.cache.match(this.request(key), this.cacheQueryOptions).then((res) => {
79 │       if (res === undefined) {
80 ▶         return Promise.reject(new NotFound(this.name, key));
81 │       }
82 ▶       return res.json();
83 │     });
84 │   }
85 │ 
86 ▶   write(key: string, value: Object): Promise<void> {
87 ▶     return this.cache.put(this.request(key), this.adapter.newResponse(JSON.stringify(value)));
88 │   }
89 │ }
```

1. **65〜67 行目：キーを URL にする**

   キー `latest` は `newRequest('/latest')` になります。`Cache` は Request をキーにしか取らないので、キーを「パス」に見立てます。データグループの age の表はキーに完全な URL を使うので、`'/' + 'https://app.example/api/user'` という少し変わったパスになります（デモで見られます）。
2. **86〜88 行目：write は JSON を本文にした Response を put**

   `JSON.stringify(value)` を本文にした `Response` を作って `cache.put` します。14〜15 行目のコメントの「mock の Response の中に状態を直列化する」がこれです。
3. **77〜84 行目：read は match して json()**

   見つからなければ 80 行目で `NotFound` で reject、あれば 82 行目で `res.json()`。
4. **62 行目：cacheName**

   `NamedCache` の `name`（頭を付ける前の名前）を覚えておきます。`Driver` の掃除が「使っているキャッシュの名前の一覧」を作るときに読みます（[第 14 回](14-sw-idle-cleanup.md)）。

> [!NOTE]
> **さらに深く**
>
> 74 行目の `keys()` は `req.url.slice(1)` で先頭の 1 文字を落とします。66 行目の `'/' + key` を戻す意図の行です。ただ本物のブラウザの `Request.url` は `https://` から始まる完全な URL なので、先頭の 1 文字を落とすだけではキーに戻りません（テストの `MockRequest` は `/latest` のようなパスを持ちます）。`worker/src` の中で `Table` の `keys()` を呼んでいる場所はありません（`grep -n "\.keys()" worker/src/*.ts` で、ほかはすべて `caches.keys`・`cache.keys`・`Map` の `keys`）。

## 4. スコープごとに名前を分ける：NamedCacheStorage

📄 `angular/packages/service-worker/worker/src/named-cache-storage.ts` L9–48 （▶ の行: 9–10, 17, 26, 30, 34, 36–37, 40–41, 45–46）

```ts
 9 ▶ export interface NamedCache extends Cache {
10 ▶   readonly name: string;
11 │ }
12 │ 
13 │ /**
14 │  * A wrapper around `CacheStorage` to allow interacting with caches more easily and consistently by:
15 │  * - Adding a `name` property to all opened caches, which can be used to easily perform other
16 │  *   operations that require the cache name.
17 ▶  * - Name-spacing cache names to avoid conflicts with other caches on the same domain.
18 │  */
19 │ export class NamedCacheStorage<T extends CacheStorage> implements CacheStorage {
20 │   constructor(
21 │     readonly original: T,
22 │     private cacheNamePrefix: string,
23 │   ) {}
24 │ 
25 │   delete(cacheName: string): Promise<boolean> {
26 ▶     return this.original.delete(`${this.cacheNamePrefix}:${cacheName}`);
27 │   }
28 │ 
29 │   has(cacheName: string): Promise<boolean> {
30 ▶     return this.original.has(`${this.cacheNamePrefix}:${cacheName}`);
31 │   }
32 │ 
33 │   async keys(): Promise<string[]> {
34 ▶     const prefix = `${this.cacheNamePrefix}:`;
35 │     const allCacheNames = await this.original.keys();
36 ▶     const ownCacheNames = allCacheNames.filter((name) => name.startsWith(prefix));
37 ▶     return ownCacheNames.map((name) => name.slice(prefix.length));
38 │   }
39 │ 
40 ▶   match(request: RequestInfo, options?: MultiCacheQueryOptions): Promise<Response | undefined> {
41 ▶     return this.original.match(request, options);
42 │   }
43 │ 
44 │   async open(cacheName: string): Promise<NamedCache> {
45 ▶     const cache = await this.original.open(`${this.cacheNamePrefix}:${cacheName}`);
46 ▶     return Object.assign(cache, {name: cacheName});
47 │   }
48 │ }
```

1. **26・30・45 行目：どの操作も頭を付ける**

   `delete`・`has`・`open` は、渡された名前の前に `cacheNamePrefix + ':'` を付けて、本物の `CacheStorage` に渡します。
2. **33〜37 行目：keys は自分の頭のものだけを、頭を外して返す**

   同じオリジンの別のスコープのワーカーや、アプリが自分で作ったキャッシュは見えません。
3. **45〜46 行目：open した Cache に name を足す**

   `Object.assign` で、ブラウザの `Cache` オブジェクトに `name`（頭の無い名前）を書き足して返します。9〜11 行目の `NamedCache` 型がそれです。
4. **40〜42 行目：match だけは頭を付けない**

   `caches.match` は名前を指定せずに全部のキャッシュから探す操作なので、そのまま本物に渡します。

## 5. 頭を決めるのは Adapter

📄 `angular/packages/service-worker/worker/src/adapter.ts` L18–56 （▶ の行: 26, 30, 34, 40–41, 47–48, 54–55）

```ts
18 │ export class Adapter<T extends CacheStorage = CacheStorage> {
19 │   readonly caches: NamedCacheStorage<T>;
20 │   readonly origin: string;
21 │ 
22 │   constructor(
23 │     protected readonly scopeUrl: string,
24 │     caches: T,
25 │   ) {
26 ▶     const parsedScopeUrl = this.parseUrl(this.scopeUrl);
27 │ 
28 │     // Determine the origin from the registration scope. This is used to differentiate between
29 │     // relative and absolute URLs.
30 ▶     this.origin = parsedScopeUrl.origin;
31 │ 
32 │     // Use the baseHref in the cache name prefix to avoid clash of cache names for SWs with
33 │     // different scopes on the same domain.
34 ▶     this.caches = new NamedCacheStorage(caches, `ngsw:${parsedScopeUrl.path}`);
35 │   }
36 │ 
37 │   /**
38 │    * Wrapper around the `Request` constructor.
39 │    */
40 ▶   newRequest(input: string | Request, init?: RequestInit): Request {
41 ▶     return new Request(input, init);
42 │   }
43 │ 
44 │   /**
45 │    * Wrapper around the `Response` constructor.
46 │    */
47 ▶   newResponse(body: any, init?: ResponseInit) {
48 ▶     return new Response(body, init);
49 │   }
50 │ 
51 │   /**
52 │    * Wrapper around the `Headers` constructor.
53 │    */
54 ▶   newHeaders(headers: HeadersInit): Headers {
55 ▶     return new Headers(headers);
56 │   }
```

26 行目で登録のスコープ（例 `https://app.example/`）を分解し、30 行目で origin を覚え、**34 行目で頭を `ngsw:` + スコープのパス**にします。スコープが `/` なら `ngsw:/`、`/admin/` なら `ngsw:/admin/` です。32〜33 行目のコメントのとおり、同じドメインで別のスコープのワーカーとキャッシュの名前がぶつからないようにするためです。

ですから表 `control` は、`CacheDatabase` が `db:` を付け、`NamedCacheStorage` が `ngsw:/:` を付けて、**`ngsw:/:db:control`** になります。

40〜56 行目の `newRequest`・`newResponse`・`newHeaders` は、`new Request` などを呼ぶだけの包みです。包んでおくのは、テストで差し替えるためです。SwTestHarness は `Adapter` の子クラスで、`newRequest` を `MockRequest` を作るものに上書きしています（[第 18 回](18-sw-testing-harness.md)）。

📄 `angular/packages/service-worker/worker/src/adapter.ts` L65–108 （▶ の行: 68–69, 84, 86–87, 93, 96–97, 103, 105）

```ts
 65 │   /**
 66 │    * Read the current UNIX time in milliseconds.
 67 │    */
 68 ▶   get time(): number {
 69 ▶     return Date.now();
 70 │   }
 71 │ 
 72 │   /**
 73 │    * Get a normalized representation of a URL such as those found in the ServiceWorker's `ngsw.json`
 74 │    * configuration.
 75 │    *
 76 │    * More specifically:
 77 │    * 1. Resolve the URL relative to the ServiceWorker's scope.
 78 │    * 2. If the URL is relative to the ServiceWorker's own origin, then only return the path part.
 79 │    *    Otherwise, return the full URL.
 80 │    *
 81 │    * @param url The raw request URL.
 82 │    * @return A normalized representation of the URL.
 83 │    */
 84 ▶   normalizeUrl(url: string): NormalizedUrl {
 85 │     // Check the URL's origin against the ServiceWorker's.
 86 ▶     const parsed = this.parseUrl(url, this.scopeUrl);
 87 ▶     return (parsed.origin === this.origin ? parsed.path : url) as NormalizedUrl;
 88 │   }
 89 │ 
 90 │   /**
 91 │    * Parse a URL into its different parts, such as `origin`, `path` and `search`.
 92 │    */
 93 ▶   parseUrl(url: string, relativeTo?: string): {origin: string; path: string; search: string} {
 94 │     // Workaround a Safari bug, see
 95 │     // https://github.com/angular/angular/issues/31061#issuecomment-503637978
 96 ▶     const parsed = !relativeTo ? new URL(url) : new URL(url, relativeTo);
 97 ▶     return {origin: parsed.origin, path: parsed.pathname, search: parsed.search};
 98 │   }
 99 │ 
100 │   /**
101 │    * Wait for a given amount of time before completing a Promise.
102 │    */
103 ▶   timeout(ms: number): Promise<void> {
104 │     return new Promise<void>((resolve) => {
105 ▶       setTimeout(() => resolve(), ms);
106 │     });
107 │   }
108 │ }
```

- **68〜70 行目 `time`**：`Date.now()`。データグループの年齢（第 10 回）、アイドルの時刻、更新の確認の時刻はすべてここを通ります。テストでは仮の時計に差し替わります。
- **84〜88 行目 `normalizeUrl`**：スコープを基準に URL を解決し、同じオリジンならパスだけ、別のオリジンなら元の URL のまま返します。`ngsw.json` の `urls` や `hashTable` のキーはパスなので、比べる前にこれを通します（第 9 回の 390 行目）。
- **93〜98 行目 `parseUrl`**：`new URL` で origin・path・search に分けるだけです。95 行目のコメントは Safari の不具合への対策の issue を指しています。
- **103〜107 行目 `timeout`**：ms 後に解決する Promise。データグループの timeout（第 10 回）とアイドルの待ち時間（第 14 回）が使います。

## 6. Driver の 3 つの値：sync

`Driver` はコンストラクタで `this.db.open('control')` を呼び、表を 1 つ持ちます（[第 5 回](05-sw-driver-lifecycle.md)）。その表に値を書くのが `sync` です。

📄 `angular/packages/service-worker/worker/src/driver.ts` L1091–1118 （▶ の行: 1092, 1095, 1097, 1101, 1103, 1108–1109, 1114–1116）

```ts
1091 │   private async sync(): Promise<void> {
1092 ▶     const table = await this.controlTable;
1093 │ 
1094 │     // Construct a serializable map of hashes to manifests.
1095 ▶     const manifests: ManifestMap = {};
1096 │     this.versions.forEach((version, hash) => {
1097 ▶       manifests[hash] = version.manifest;
1098 │     });
1099 │ 
1100 │     // Construct a serializable map of client ids to version hashes.
1101 ▶     const assignments: ClientAssignments = {};
1102 │     this.clientVersionMap.forEach((hash, clientId) => {
1103 ▶       assignments[clientId] = hash;
1104 │     });
1105 │ 
1106 │     // Record the latest entry. Since this is a sync which is necessarily happening after
1107 │     // initialization, latestHash should always be valid.
1108 ▶     const latest: LatestEntry = {
1109 ▶       latest: this.latestHash!,
1110 │     };
1111 │ 
1112 │     // Synchronize all of these.
1113 │     await Promise.all([
1114 ▶       table.write('manifests', manifests),
1115 ▶       table.write('assignments', assignments),
1116 ▶       table.write('latest', latest),
1117 │     ]);
1118 │   }
```

| キー | 中身 | どこから作るか |
| --- | --- | --- |
| `manifests` | 版のハッシュ → その `ngsw.json` の中身 | 1096〜1098 行目、`versions` の各 `AppVersion.manifest` |
| `assignments` | タブの id → 版のハッシュ | 1102〜1104 行目、`clientVersionMap` |
| `latest` | `{latest: ハッシュ}` | 1108〜1110 行目、`latestHash` |

1113〜1117 行目で 3 つを同時に書きます。`sync` を呼ぶのは、`grep -n "this.sync()" driver.ts` で 5 か所でした。タブを版に割り当てたとき（844・899 行目、第 7 回）、タブを最新に上げたとき（571 行目、第 13 回）、新しい版を取り込んだとき（1045 行目、[第 12 回](12-sw-update-check.md)）、掃除のとき（1149 行目、第 14 回）です。起動して初めてのときは `initialize` が同じ 3 つを直接書き、2 回目からはこの 3 つを読んで `versions` と `clientVersionMap` を作り直します（第 5 回）。

> [!WARNING]
> **ハマりどころ**
>
> **書かれないもの**もあります。`Driver` の状態（`NORMAL`・`EXISTING_CLIENTS_ONLY`・`SAFE_MODE`）とその理由、最後に更新を確認した時刻は、`sync` の 3 つに入っていません。ワーカーが止められて `main.ts` から作り直されると、これらは初期値に戻ります。第 9 回の issue #45377 で「戻るきっかけ」になるのはこのためです。

## 7. キャッシュの名前の一覧

| 名前（スコープ `/`） | 中身 | 作る場所 |
| --- | --- | --- |
| `ngsw:/:db:control` | manifests・assignments・latest | この章の 6 節 |
| `ngsw:/:<版>:assets:<group>:cache` | アセットのファイル | [第 8 回](08-sw-asset-groups.md) |
| `ngsw:/:db:<版>:assets:<group>:meta` | ハッシュの無いファイルの取った時刻と使ったか | 第 8 回 |
| `ngsw:/:<version>:data:<group>:cache` | API の応答 | [第 10 回](10-sw-data-groups.md) |
| `ngsw:/:db:<version>:data:<group>:lru` / `:age` | LRU の順番 / 入れた時刻 | 第 10 回 |

`db:` が付くのは `CacheDatabase` を通した表で、付かないのは `adapter.caches.open` を直接呼んだファイルのキャッシュです。&lt;版&gt; は `ngsw.json` の SHA-1（40 桁）、&lt;version&gt; は `dataGroups` の `version`（既定 1）です。

## 8. 本物のワーカーで確かめる

> **🧪 DEMO — ワーカーを動かしたあとの Cache Storage と、db の表の中身**
>
> 本物の `ngsw-worker.js`（`@angular/service-worker` 22.1.6 の配布物）を、偽物のブラウザ（`sw-sandbox.ts`。Cache Storage・サーバー・タブ・時計をメモリの上の偽物にしたもの）の上で動かします。下の表はその偽物の Cache Storage の中身で、`db:` の付いた表のエントリーを押すと、`cacheEntry(名前, パス)` で本文（JSON）を読みます。このページの本物の Cache Storage には何も書きません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sw-database)

見てほしいところ（2026-11-03 に Node で同じ部品を使って確かめた結果）：

- v1 のあと、名前は 8 つです。`ngsw:/:db:control` には `/manifests`・`/assignments`・`/latest` の 3 つ。`/assignments` は `{"tab1": "<v1 のハッシュ>"}`。
- age の表のエントリーは `/https://app.example/api/user` という名前です（3 節の 66 行目）。本文は `{"age": 時刻}`。
- meta の表は空です。このデモのファイルはどれもハッシュを持つので、時刻を記録しません（第 8 回）。
- v2 に更新すると、v2 のハッシュの名前のアセットのキャッシュが 4 つ増えますが、データの 3 つ（`1:data:api`）は増えません（第 10 回の 8 節）。`/assignments` は tab1 が v1、tab2 が v2、`/latest` は v2 になります。

## ここまでの呼び出し（latest を書くとき）

- `Driver.sync()` — driver.ts:1091
  - `await this.controlTable` ＝ `CacheDatabase.open('control')` — db-cache.ts:40
    - `adapter.caches.open('db:control')` — db-cache.ts:42
      - `NamedCacheStorage.open` → `caches.open('ngsw:/:db:control')` — named-cache-storage.ts:45
  - `table.write('latest', {latest})` — driver.ts:1116
    - `cache.put(newRequest('/latest'), newResponse(JSON.stringify(...)))` — db-cache.ts:87

## テストと直し方

### spec と describe

`db-cache.ts`・`named-cache-storage.ts`・`adapter.ts` だけを確かめる spec はありません（`worker/test/` の 5 つの spec はどれも `Driver` か グループを通して使います）。名前の付け方を確かめているのは次の 2 か所です。

| spec | describe / it（行） |
| --- | --- |
| worker/test/happy\_spec.ts | `Driver` › `cache naming`（1464）› `includes the SW scope in all cache names`（1552）・`does not affect caches from other scopes`（1568）・`updates existing caches for same scope`（1594） |
| worker/test/data\_spec.ts | `data cache` › `in performance mode` › `names the caches correctly`（166） |

📄 `angular/packages/service-worker/worker/test/happy_spec.ts` L1464–1477 （▶ の行: 1469–1471, 1474–1476）

```ts
1464 │     describe('cache naming', () => {
1465 │       let uid: number;
1466 │ 
1467 │       // Helpers
1468 │       const cacheKeysFor = (baseHref: string, manifestHash: string) => [
1469 ▶         `ngsw:${baseHref}:db:control`,
1470 ▶         `ngsw:${baseHref}:${manifestHash}:assets:eager:cache`,
1471 ▶         `ngsw:${baseHref}:db:${manifestHash}:assets:eager:meta`,
1472 │         `ngsw:${baseHref}:${manifestHash}:assets:lazy:cache`,
1473 │         `ngsw:${baseHref}:db:${manifestHash}:assets:lazy:meta`,
1474 ▶         `ngsw:${baseHref}:42:data:api:cache`,
1475 ▶         `ngsw:${baseHref}:db:42:data:api:lru`,
1476 ▶         `ngsw:${baseHref}:db:42:data:api:age`,
1477 │       ];
```

1468〜1477 行目が、7 節の表と同じ 8 つの名前です。データグループの `version` は 42 にしてあります。

📄 `angular/packages/service-worker/worker/test/happy_spec.ts` L1552–1566 （▶ の行: 1554, 1557, 1561, 1564–1565）

```ts
1552 │       it('includes the SW scope in all cache names', async () => {
1553 │         // SW with scope `/`.
1554 ▶         const [rootScope, rootManifestHash] = await initializeSwFor('/');
1555 │         const cacheNames = await rootScope.caches.original.keys();
1556 │ 
1557 ▶         expect(cacheNames).toEqual(cacheKeysFor('/', rootManifestHash));
1558 │         expect(cacheNames.every((name) => name.includes('/'))).toBe(true);
1559 │ 
1560 │         // SW with scope `/foo/`.
1561 ▶         const [fooScope, fooManifestHash] = await initializeSwFor('/foo/');
1562 │         const fooCacheNames = await fooScope.caches.original.keys();
1563 │ 
1564 ▶         expect(fooCacheNames).toEqual(cacheKeysFor('/foo/', fooManifestHash));
1565 ▶         expect(fooCacheNames.every((name) => name.includes('/foo/'))).toBe(true);
1566 │       });
```

スコープ `/` と `/foo/` の 2 つのワーカーで、名前の頭が 5 節の 34 行目どおり `ngsw:/`・`ngsw:/foo/` になることを確かめます。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/service-worker/worker/test:test --nocache_test_results --test_output=all '--test_arg=--filter=cache naming|names the caches correctly'
```

📄 `出力（2026-11-03 に実行。抜粋。ログは scratchpad/sw-logs/c-names.log）`

```
Ran 4 of 153 specs
4 specs, 0 failures
//packages/service-worker/worker/test:test                               PASSED in 0.6s
```

- `cache naming` の 3 件と `names the caches correctly` の 1 件で 4 of 153（0.6 秒）。

### 直すとしたら

- 表の読み書きを変えるなら `db-cache.ts` の `CacheTable`、名前の頭を変えるなら `adapter.ts` の 34 行目と `named-cache-storage.ts`。名前を変えると、既に入っているワーカーのキャッシュが読めなくなる（ユーザーの手元の棚の名前は変わらない）ので、移し替えの仕組みとセットになります。
- 3 節の 74 行目の `keys()` を確かめるなら、`CacheTable` を直接作る小さな spec が要ります。今の SwTestHarness の `MockRequest` は URL をパスで持つので（`testing/scope.ts` の `newRequest`）、本物のブラウザと同じ形にはなりません。偽物の作りは [第 18 回](18-sw-testing-harness.md)です。
- 本家に PR を出すことは勧めません。手元で spec を足して確かめるところまでにします（[第 20 回](20-sw-issues.md)）。
- このパッケージは `PACKAGE.md` の 1 行目で「機能の限られた基本的なキャッシュの道具で、セキュリティの修正以外の新しい機能は受け付けない」と書いています（[第 1 回](01-sw-overview.md)）。新しい機能の PR は受け付けられず、不具合の直しも慎重に扱われます。

## 聞かれそうな質問

**Q. ngsw は IndexedDB を使いますか？**

`worker/src` の DB は `CacheDatabase` だけで、Cache Storage の上に作っています（db-cache.ts 13〜17 行目）。1 つの値を 1 つの `Response`（本文は JSON）として `put` します（87 行目）。

**Q. DevTools に出る ngsw:/:db:control とは？**

`Driver` の表 `control` です。`CacheDatabase` が `db:`（18・42 行目）、`NamedCacheStorage` が `ngsw:/:`（adapter.ts 34 行目、named-cache-storage.ts 45 行目）を付けた名前で、中に manifests・assignments・latest の 3 つがあります（driver.ts 1114〜1116 行目）。

**Q. 同じドメインに 2 つのアプリ（/app1/ と /app2/）があるとキャッシュはぶつかりますか？**

ぶつかりません。adapter.ts 34 行目で名前の頭にスコープのパスが入り（`ngsw:/app1/` と `ngsw:/app2/`）、`NamedCacheStorage.keys` は自分の頭のものだけを返します（33〜37 行目）。spec は happy\_spec の 1568 行目です。

**Q. DevTools で ngsw:/:db:control だけを消したらどうなりますか？**

次に `Driver` が作られて `initialize` が走ったとき、`read` が `NotFound` で reject し（db-cache.ts 80 行目）、`Driver` は初めての起動として `ngsw.json` を取り直します（第 5 回）。今動いている `Driver` は `initialize` を 1 回しか走らせないので、それまではメモリの中の値で動きます。

**Q. Driver の状態（SAFE\_MODE など）は保存されますか？**

されません。`sync` が書くのは 1114〜1116 行目の 3 つだけです。

## 読み終えて

- ngsw の DB は Cache Storage の上にある。表は 1 つのキャッシュ、値は JSON を本文にした 1 つの Response。
- 名前は `ngsw:` + スコープのパス（Adapter）＋ `:db:`（CacheDatabase）＋ 表の名前。
- `Driver` が保存するのは manifests・assignments・latest の 3 つだけで、`sync` が同時に書く。状態は保存しない。
- `Adapter` は時刻・URL・Request の作り方をまとめた差し替え口で、テストはこれを上書きして動かす。

---

← 前: [データグループ：performance と freshness](10-sw-data-groups.md)  
次: [更新の確認：ngsw.json を取り直す](12-sw-update-check.md) →
