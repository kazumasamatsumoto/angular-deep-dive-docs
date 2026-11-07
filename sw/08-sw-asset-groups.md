[目次](../README.md) › [Service Worker の内側](README.md) › 第 8 回 / 全 20 回

# アセットグループ：prefetch と lazy

> assets.ts の AssetGroup・PrefetchAssetGroup・LazyAssetGroup。installMode（版を入れるときに全部取るか、要るときに取るか）と updateMode（読むのは LazyAssetGroup だけ）、fetchAndCacheOnce が同じ URL を 1 回だけ取る仕組み、前の版のキャッシュからハッシュが同じファイルを写す maybeUpdate、ハッシュの無い patterns の扱い（needToRevalidate と previouslyCachedResources）。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sw-asset-groups)

---

`ngsw-config.json` の `assetGroups` に書いた `installMode` と `updateMode` は、ワーカーの中でどの関数の、どの if になっているのか。この章では `assets.ts` の 3 つのクラス（`AssetGroup`・`PrefetchAssetGroup`・`LazyAssetGroup`）を、「リクエストに答える」「同じ URL を 1 回だけ取る」「版を入れるときに取る」「前の版から写す」の 4 つの仕事に分けて読みます。最後に、モードを切り替えて v1 → v2 の更新でサーバーに何が届くかを、本物のワーカーで比べます。

読む対象は `packages/service-worker/worker/src/assets.ts`（ハッシュを比べる `cacheBustedFetchFromNetwork` は [第 9 回](09-sw-hash-integrity.md)）と、`app-version.ts`・`driver.ts` の「前の版を探す」関数です。

1. [1. 全体像](01-sw-overview.md)
2. [2. Generator](02-sw-config-generator.md)
3. [3. ビルド](03-sw-cli-build.md)
4. [4. 登録](04-sw-register.md)
5. [5. Driver の起動](05-sw-driver-lifecycle.md)
6. [6. fetch の横取り](06-sw-driver-fetch.md)
7. [7. 版とタブ](07-sw-versions.md)
8. **8. アセット**（この章）
9. [9. ハッシュ](09-sw-hash-integrity.md)
10. [10. データ](10-sw-data-groups.md)
11. [11. 小さな DB](11-sw-database.md)
12. [12. 更新の確認](12-sw-update-check.md)
13. [13. SwUpdate](13-sw-swupdate.md)
14. [14. アイドルと掃除](14-sw-idle-cleanup.md)
15. [15. 壊れたとき](15-sw-safe-mode.md)
16. [16. プッシュ](16-sw-push.md)
17. [17. デバッグ](17-sw-debug.md)
18. [18. ワーカーのテスト](18-sw-testing-harness.md)
19. [19. アプリ側のテスト](19-sw-testing-app.md)
20. [20. issue と PR を読む](20-sw-issues.md)

## 1. ngsw.json の 1 グループと、AssetGroup が持つもの

📄 `angular/packages/service-worker/worker/src/manifest.ts` L26–33 （▶ の行: 28–32）

```ts
26 │ export interface AssetGroupConfig {
27 │   name: string;
28 ▶   installMode: 'prefetch' | 'lazy';
29 ▶   updateMode: 'prefetch' | 'lazy';
30 ▶   urls: string[];
31 ▶   patterns: string[];
32 ▶   cacheQueryOptions?: CacheQueryOptions;
33 │ }
```

Generator は `resources.files` の glob をビルドの出力に当てて、具体的な URL の一覧（30 行目の `urls`）にします。`resources.urls`（CDN の URL など、ビルドの出力に無いもの）は 31 行目の `patterns`（正規表現の文字列）になります（[第 2 回](02-sw-config-generator.md)）。**`urls` のファイルには `hashTable` にハッシュがあり、`patterns` で当たるものにはありません**。この違いが 3 節の分かれ道になります。29 行目の `updateMode` を書かなければ、Generator が `installMode` と同じ値を入れます。

📄 `angular/packages/service-worker/worker/src/assets.ts` L19–45 （▶ の行: 29, 34, 39, 45）

```ts
19 │ /**
20 │  * A group of assets that are cached in a `Cache` and managed by a given policy.
21 │  *
22 │  * Concrete classes derive from this base and specify the exact caching policy.
23 │  */
24 │ export abstract class AssetGroup {
25 │   /**
26 │    * A deduplication cache, to make sure the SW never makes two network requests
27 │    * for the same resource at once. Managed by `fetchAndCacheOnce`.
28 │    */
29 ▶   private inFlightRequests = new Map<string, Promise<Response>>();
30 │ 
31 │   /**
32 │    * Normalized resource URLs.
33 │    */
34 ▶   protected urls: NormalizedUrl[] = [];
35 │ 
36 │   /**
37 │    * Regular expression patterns.
38 │    */
39 ▶   protected patterns: RegExp[] = [];
40 │ 
41 │   /**
42 │    * A Promise which resolves to the `Cache` used to back this asset group. This
43 │    * is opened from the constructor.
44 │    */
45 ▶   protected cache: Promise<NamedCache>;
```

📄 `angular/packages/service-worker/worker/src/assets.ts` L57–84 （▶ の行: 62, 69, 72, 76, 80–81）

```ts
57 │   constructor(
58 │     protected scope: ServiceWorkerGlobalScope,
59 │     protected adapter: Adapter,
60 │     protected idle: IdleScheduler,
61 │     protected config: AssetGroupConfig,
62 ▶     protected hashes: Map<string, string>,
63 │     protected db: Database,
64 │     cacheNamePrefix: string,
65 │   ) {
66 │     this.name = config.name;
67 │ 
68 │     // Normalize the config's URLs to take the ServiceWorker's scope into account.
69 ▶     this.urls = config.urls.map((url) => adapter.normalizeUrl(url));
70 │ 
71 │     // Patterns in the config are regular expressions disguised as strings. Breathe life into them.
72 ▶     this.patterns = config.patterns.map((pattern) => new RegExp(pattern));
73 │ 
74 │     // This is the primary cache, which holds all of the cached requests for this group. If a
75 │     // resource isn't in this cache, it hasn't been fetched yet.
76 ▶     this.cache = adapter.caches.open(`${cacheNamePrefix}:${config.name}:cache`);
77 │ 
78 │     // This is the metadata table, which holds specific information for each cached URL, such as
79 │     // the timestamp of when it was added to the cache.
80 ▶     this.metadata = this.db.open(
81 ▶       `${cacheNamePrefix}:${config.name}:meta`,
82 │       config.cacheQueryOptions,
83 │     );
84 │   }
```

1. **69・72 行目：URL を正規化し、pattern を RegExp にする**

   71 行目のコメントのとおり、`patterns` は「文字列に化けた正規表現」です。
2. **62 行目：ハッシュの表は版のものをそのまま受け取る**

   `AppVersion` が作った `hashTable`（[第 7 回](07-sw-versions.md)）です。グループの中では「この URL にハッシュがあるか」だけを見ます。
3. **76 行目と 80〜83 行目：キャッシュが 2 つ**

   中身を入れる `<版のハッシュ>:assets:<グループ名>:cache` と、ハッシュの無い URL の「取った時刻」と「使ったか」を入れる `…:meta` の DB の表です。どちらも開くだけで、ファイルは取りません。
4. **29 行目：`inFlightRequests`**

   いま取りに行っている URL → その Promise。4 節で読みます。

## 2. リクエストに答える：AssetGroup.handleFetch

📄 `angular/packages/service-worker/worker/src/assets.ts` L118–145 （▶ の行: 122, 126, 131, 141, 143）

```ts
118 │   /**
119 │    * Process a request for a given resource and return it, or return null if it's not available.
120 │    */
121 │   async handleFetch(req: Request, _event: ExtendableEvent): Promise<Response | null> {
122 ▶     const url = this.adapter.normalizeUrl(req.url);
123 │     // Either the request matches one of the known resource URLs, one of the patterns for
124 │     // dynamically matched URLs, or neither. Determine which is the case for this request in
125 │     // order to decide how to handle it.
126 ▶     if (this.urls.indexOf(url) !== -1 || this.patterns.some((pattern) => pattern.test(url))) {
127 │       // This URL matches a known resource. Either it's been cached already or it's missing, in
128 │       // which case it needs to be loaded from the network.
129 │ 
130 │       // Open the cache to check whether this resource is present.
131 ▶       const cache = await this.cache;
132 │ 
133 │       // Look for a cached response. If one exists, it can be used to resolve the fetch
134 │       // operation.
135 │       let cachedResponse: Response | undefined;
136 │       try {
137 │         // Safari 16.4/17 is known to sometimes throw an unexpected internal error on cache access
138 │         // This try/catch is here as a workaround to prevent a failure of the handleFetch
139 │         // as the Driver falls back to safeFetch on critical errors.
140 │         // See #50378
141 ▶         cachedResponse = await cache.match(req, this.config.cacheQueryOptions);
142 │       } catch (error) {
143 ▶         throw new SwCriticalError(`Cache is throwing while looking for a match: ${error}`);
144 │       }
145 │ 
```

1. **126 行目：自分の `urls` にあるか、`patterns` のどれかに当たるか**

   どちらでもなければ 174 行目で `null`。`AppVersion` は次のグループに聞きます（[第 7 回](07-sw-versions.md)）。
2. **141 行目：キャッシュを引く**

   Safari の Cache Storage がまれに投げるので（137〜140 行目のコメント、#50378）、143 行目で `SwCriticalError` に包みます。Driver はこれを見て版を壊れたものとして扱い、ネットワークに回します（[第 6 回](06-sw-driver-fetch.md)）。

📄 `angular/packages/service-worker/worker/src/assets.ts` L146–176 （▶ の行: 149, 152, 156–158, 163, 168, 172）

```ts
146 │       if (cachedResponse !== undefined) {
147 │         // A response has already been cached (which presumably matches the hash for this
148 │         // resource). Check whether it's safe to serve this resource from cache.
149 ▶         if (this.hashes.has(url)) {
150 │           // This resource has a hash, and thus is versioned by the manifest. It's safe to return
151 │           // the response.
152 ▶           return cachedResponse;
153 │         } else {
154 │           // This resource has no hash, and yet exists in the cache. Check how old this request is
155 │           // to make sure it's still usable.
156 ▶           if (await this.needToRevalidate(req, cachedResponse)) {
157 ▶             this.idle.schedule(`revalidate(${cache.name}): ${req.url}`, async () => {
158 ▶               await this.fetchAndCacheOnce(req);
159 │             });
160 │           }
161 │ 
162 │           // In either case (revalidation or not), the cached response must be good.
163 ▶           return cachedResponse;
164 │         }
165 │       }
166 │ 
167 │       // No already-cached response exists, so attempt a fetch/cache operation.
168 ▶       const res = await this.fetchAndCacheOnce(this.newRequestWithMetadata(req.url, req));
169 │ 
170 │       // If this is successful, the response needs to be cloned as it might be used to respond to
171 │       // multiple fetch operations at the same time.
172 ▶       return res.clone();
173 │     } else {
174 │       return null;
175 │     }
176 │   }
```

1. **149〜152 行目：キャッシュにあり、ハッシュもある → そのまま返す**

   ハッシュのあるファイルは中身が版で決まっているので、古くなることがありません。
2. **156〜163 行目：キャッシュにあるが、ハッシュが無い → 返しつつ、古ければあとで取り直す**

   `needToRevalidate`（3 節）が true なら、`revalidate(…)` という仕事をアイドルに積み、それでも 163 行目でキャッシュの中身を返します。いわゆる stale-while-revalidate（古いものを返しながら裏で取り直す）です。
3. **168 行目：キャッシュに無い → ネットワークから取ってキャッシュに入れる**

   `fetchAndCacheOnce`（4 節）。`newRequestWithMetadata` は元のリクエストから安全な情報だけを引き継いだ新しいリクエストを作ります（7 節）。172 行目の `clone()` は、同じ Response を複数のリクエストに渡すことがあるからです。lazy のグループのファイルが「使ったときに入る」のはこの行です。

## 3. ハッシュの無いものが古いか：needToRevalidate

📄 `angular/packages/service-worker/worker/src/assets.ts` L183–209 （▶ の行: 188, 203–204, 206, 208）

```ts
183 │   private async needToRevalidate(req: Request, res: Response): Promise<boolean> {
184 │     // Three different strategies apply here:
185 │     // 1) The request has a Cache-Control header, and thus expiration needs to be based on its age.
186 │     // 2) The request has an Expires header, and expiration is based on the current timestamp.
187 │     // 3) The request has no applicable caching headers, and must be revalidated.
188 ▶     if (res.headers.has('Cache-Control')) {
189 │       // Figure out if there is a max-age directive in the Cache-Control header.
190 │       const cacheControl = res.headers.get('Cache-Control')!;
191 │       const cacheDirectives = cacheControl
192 │         // Directives are comma-separated within the Cache-Control header value.
193 │         .split(',')
194 │         // Make sure each directive doesn't have extraneous whitespace.
195 │         .map((v) => v.trim())
196 │         // Some directives have values (like maxage and s-maxage)
197 │         .map((v) => v.split('='));
198 │ 
199 │       // Lowercase all the directive names.
200 │       cacheDirectives.forEach((v) => (v[0] = v[0].toLowerCase()));
201 │ 
202 │       // Find the max-age directive, if one exists.
203 ▶       const maxAgeDirective = cacheDirectives.find((v) => v[0] === 'max-age');
204 ▶       const cacheAge = maxAgeDirective ? maxAgeDirective[1] : undefined;
205 │ 
206 ▶       if (!cacheAge) {
207 │         // No usable TTL defined. Must assume that the response is stale.
208 ▶         return true;
209 │       }
```

📄 `angular/packages/service-worker/worker/src/assets.ts` L210–237 （▶ の行: 211, 221, 224, 228, 230, 232–233）

```ts
210 │       try {
211 ▶         const maxAge = 1000 * parseInt(cacheAge);
212 │ 
213 │         // Determine the origin time of this request. If the SW has metadata on the request (which
214 │         // it
215 │         // should), it will have the time the request was added to the cache. If it doesn't for some
216 │         // reason, the request may have a Date header which will serve the same purpose.
217 │         let ts: number;
218 │         try {
219 │           // Check the metadata table. If a timestamp is there, use it.
220 │           const metaTable = await this.metadata;
221 ▶           ts = (await metaTable.read<UrlMetadata>(req.url)).ts;
222 │         } catch {
223 │           // Otherwise, look for a Date header.
224 ▶           const date = res.headers.get('Date');
225 │           if (date === null) {
226 │             // Unable to determine when this response was created. Assume that it's stale, and
227 │             // revalidate it.
228 ▶             return true;
229 │           }
230 ▶           ts = Date.parse(date);
231 │         }
232 ▶         const age = this.adapter.time - ts;
233 ▶         return age < 0 || age > maxAge;
234 │       } catch {
235 │         // Assume stale.
236 │         return true;
237 │       }
```

📄 `angular/packages/service-worker/worker/src/assets.ts` L238–253 （▶ の行: 238, 244, 251）

```ts
238 ▶     } else if (res.headers.has('Expires')) {
239 │       // Determine if the expiration time has passed.
240 │       const expiresStr = res.headers.get('Expires')!;
241 │       try {
242 │         // The request needs to be revalidated if the current time is later than the expiration
243 │         // time, if it parses correctly.
244 ▶         return this.adapter.time > Date.parse(expiresStr);
245 │       } catch {
246 │         // The expiration date failed to parse, so revalidate as a precaution.
247 │         return true;
248 │       }
249 │     } else {
250 │       // No way to evaluate staleness, so assume the response is already stale.
251 ▶       return true;
252 │     }
253 │   }
```

1. **188〜208 行目：`Cache-Control` があれば `max-age` を探す**

   キャッシュした Response のヘッダーです。`max-age` が無ければ（`no-cache` だけなど）206〜208 行目で「古い」。
2. **211〜233 行目：いつ取ったかと比べる**

   取った時刻は 221 行目で `meta` の表から読みます（4 節の 342 行目で書いたもの）。無ければ 224 行目の `Date` ヘッダー、それも無ければ 228 行目で「古い」。232〜233 行目、経過が負（時計が戻った）か `max-age` を超えていれば「古い」。
3. **238〜251 行目：`Expires` があれば今と比べる。どちらも無ければ「古い」**

   251 行目の既定は「古い」なので、ヘッダーの無いハッシュ無しのファイルは、使うたびに裏で取り直されます。

## 4. 同じ URL を 1 回だけ取る：fetchAndCacheOnce

📄 `angular/packages/service-worker/worker/src/assets.ts` L297–331 （▶ の行: 300, 304, 307, 312, 316, 322, 326–327）

```ts
297 │   /**
298 │    * Fetch the given resource from the network, and cache it if able.
299 │    */
300 ▶   protected async fetchAndCacheOnce(req: Request, used: boolean = true): Promise<Response> {
301 │     // The `inFlightRequests` map holds information about which caching operations are currently
302 │     // underway for known resources. If this request appears there, another "thread" is already
303 │     // in the process of caching it, and this work should not be duplicated.
304 ▶     if (this.inFlightRequests.has(req.url)) {
305 │       // There is a caching operation already in progress for this request. Wait for it to
306 │       // complete, and hopefully it will have yielded a useful response.
307 ▶       return this.inFlightRequests.get(req.url)!;
308 │     }
309 │ 
310 │     // No other caching operation is being attempted for this resource, so it will be owned here.
311 │     // Go to the network and get the correct version.
312 ▶     const fetchOp = this.fetchFromNetwork(req);
313 │ 
314 │     // Save this operation in `inFlightRequests` so any other "thread" attempting to cache it
315 │     // will block on this chain instead of duplicating effort.
316 ▶     this.inFlightRequests.set(req.url, fetchOp);
317 │ 
318 │     // Make sure this attempt is cleaned up properly on failure.
319 │     try {
320 │       // Wait for a response. If this fails, the request will remain in `inFlightRequests`
321 │       // indefinitely.
322 ▶       const res = await fetchOp;
323 │ 
324 │       // It's very important that only successful responses are cached. Unsuccessful responses
325 │       // should never be cached as this can completely break applications.
326 ▶       if (!res.ok) {
327 ▶         throw new Error(
328 │           `Response not Ok (fetchAndCacheOnce): request for ${req.url} returned response ${res.status} ${res.statusText}`,
329 │         );
330 │       }
331 │ 
```

1. **304〜308 行目：取りに行っている最中なら、その Promise を返す**

   先読みの途中でページが同じファイルを要求しても、ネットワークには 1 回しか行きません。比喩でいえば「同じ買い物に 2 人で行かない」ための張り紙で、実物は `Map<URL, Promise<Response>>` です。
2. **312〜316 行目：取り始めて、張り紙を出す**

   `fetchFromNetwork`（下）の Promise を `inFlightRequests` に入れます。
3. **326〜330 行目：成功でなければキャッシュに入れない**

   404 や 500 をキャッシュすると、以後ずっとそれを返して「アプリが壊れる」（324〜325 行目のコメント）ので、投げます。

📄 `angular/packages/service-worker/worker/src/assets.ts` L332–364 （▶ の行: 336, 340, 342, 344, 353, 362）

```ts
332 │       try {
333 │         // This response is safe to cache (as long as it's cloned). Wait until the cache operation
334 │         // is complete.
335 │         const cache = await this.cache;
336 ▶         await cache.put(req, res.clone());
337 │ 
338 │         // If the request is not hashed, update its metadata, especially the timestamp. This is
339 │         // needed for future determination of whether this cached response is stale or not.
340 ▶         if (!this.hashes.has(this.adapter.normalizeUrl(req.url))) {
341 │           // Metadata is tracked for requests that are unhashed.
342 ▶           const meta: UrlMetadata = {ts: this.adapter.time, used};
343 │           const metaTable = await this.metadata;
344 ▶           await metaTable.write(req.url, meta);
345 │         }
346 │ 
347 │         return res;
348 │       } catch (err) {
349 │         // Among other cases, this can happen when the user clears all data through the DevTools,
350 │         // but the SW is still running and serving another tab. In that case, trying to write to the
351 │         // caches throws an `Entry was not found` error.
352 │         // If this happens the SW can no longer work correctly. This situation is unrecoverable.
353 ▶         throw new SwCriticalError(
354 │           `Failed to update the caches for request to '${
355 │             req.url
356 │           }' (fetchAndCacheOnce): ${errorToString(err)}`,
357 │         );
358 │       }
359 │     } finally {
360 │       // Finally, it can be removed from `inFlightRequests`. This might result in a double-remove
361 │       // if some other chain was already making this request too, but that won't hurt anything.
362 ▶       this.inFlightRequests.delete(req.url);
363 │     }
364 │   }
```

1. **336 行目：キャッシュに入れる**

   Response の本文は 1 回しか読めないので、`clone()` を入れて元を返します。
2. **340〜345 行目：ハッシュの無い URL だけ、`meta` に `{ts, used}` を書く**

   `ts` は 3 節の 221 行目が読む時刻。`used` は 300 行目の引数で、ページが要求して取ったなら `true`、先読みで取ったなら `false` です（6 節の 614 行目）。
3. **353 行目：書けなければ `SwCriticalError`**

   DevTools でサイトのデータを消したあとなどに起きます（349〜351 行目のコメント）。
4. **362 行目：成功でも失敗でも張り紙をはがす**

   320〜321 行目のコメントは「失敗すると `inFlightRequests` に残り続ける」と書いていますが、実際は 359 行目の `finally` の中なので、失敗でもはがれます。コメントが古い箇所です。

📄 `angular/packages/service-worker/worker/src/assets.ts` L366–384 （▶ の行: 368, 371, 373, 380）

```ts
366 │   protected async fetchFromNetwork(req: Request, redirectLimit: number = 3): Promise<Response> {
367 │     // Make a cache-busted request for the resource.
368 ▶     const res = await this.cacheBustedFetchFromNetwork(req);
369 │ 
370 │     // Check for redirected responses, and follow the redirects.
371 ▶     if ((res as any)['redirected'] && !!res.url) {
372 │       // If the redirect limit is exhausted, fail with an error.
373 ▶       if (redirectLimit === 0) {
374 │         throw new SwCriticalError(
375 │           `Response hit redirect limit (fetchFromNetwork): request redirected too many times, next is ${res.url}`,
376 │         );
377 │       }
378 │ 
379 │       // Unwrap the redirect directly.
380 ▶       return this.fetchFromNetwork(this.newRequestWithMetadata(res.url, req), redirectLimit - 1);
381 │     }
382 │ 
383 │     return res;
384 │   }
```

368 行目の `cacheBustedFetchFromNetwork` は、ハッシュのあるファイルなら取ってきた中身の SHA-1 を `hashTable` と比べる関数です（[第 9 回](09-sw-hash-integrity.md)）。371 行目、リダイレクトされた応答なら、行き先の URL で 380 行目で取り直します。373 行目、3 回までです。

## 5. 版を入れるとき：AppVersion.initializeFully

📄 `angular/packages/service-worker/worker/src/app-version.ts` L121–144 （▶ の行: 126, 131, 135, 138, 141）

```ts
121 │   /**
122 │    * Fully initialize this version of the application. If this Promise resolves successfully, all
123 │    * required
124 │    * data has been safely downloaded.
125 │    */
126 ▶   async initializeFully(updateFrom?: UpdateSource): Promise<void> {
127 │     try {
128 │       // Fully initialize each asset group, in series. Starts with an empty Promise,
129 │       // and waits for the previous groups to have been initialized before initializing
130 │       // the next one in turn.
131 ▶       await this.assetGroups.reduce<Promise<void>>(async (previous, group) => {
132 │         // Wait for the previous groups to complete initialization. If there is a
133 │         // failure, this will throw, and each subsequent group will throw, until the
134 │         // whole sequence fails.
135 ▶         await previous;
136 │ 
137 │         // Initialize this group.
138 ▶         return group.initializeFully(updateFrom);
139 │       }, Promise.resolve());
140 │     } catch (err) {
141 ▶       this._okay = false;
142 │       throw err;
143 │     }
144 │   }
```

グループを 1 つずつ、前のグループが終わってから（135 行目）138 行目の `group.initializeFully(updateFrom)` を呼びます。どれかが投げたら 141 行目で版を `okay = false` にして投げ直します。126 行目の `updateFrom` は「前の版を探せる相手」で、初めて入れるとき（[第 5 回](05-sw-driver-lifecycle.md)の `scheduleInitialization`）は無し、更新のとき（[第 12 回](12-sw-update-check.md)の `setupUpdate`）は `Driver` 自身が渡されます。

## 6. PrefetchAssetGroup：全部取る。前の版にあれば写す

📄 `angular/packages/service-worker/worker/src/assets.ts` L573–606 （▶ の行: 581, 583, 586, 596, 604–605）

```ts
573 │ export class PrefetchAssetGroup extends AssetGroup {
574 │   override async initializeFully(updateFrom?: UpdateSource): Promise<void> {
575 │     // Open the cache which actually holds requests.
576 │     const cache = await this.cache;
577 │ 
578 │     // Cache all known resources serially. As this reduce proceeds, each Promise waits
579 │     // on the last before starting the fetch/cache operation for the next request. Any
580 │     // errors cause fall-through to the final Promise which rejects.
581 ▶     await this.urls.reduce(async (previous: Promise<void>, url: string) => {
582 │       // Wait on all previous operations to complete.
583 ▶       await previous;
584 │ 
585 │       // Construct the Request for this url.
586 ▶       const req = this.adapter.newRequest(url);
587 │ 
588 │       let alreadyCached = false;
589 │       try {
590 │         // Safari 16.4/17 is known to sometimes throw an unexpected internal error on cache access
591 │         // This try/catch is here as a workaround to prevent a failure of the handleFetch
592 │         // as the Driver falls back to safeFetch on critical errors.
593 │         // See #50378
594 │ 
595 │         // First, check the cache to see if there is already a copy of this resource.
596 ▶         alreadyCached = (await cache.match(req, this.config.cacheQueryOptions)) !== undefined;
597 │       } catch (error) {
598 │         throw new SwCriticalError(
599 │           `Cache is throwing while looking for a match in a PrefetchAssetGroup: ${error}`,
600 │         );
601 │       }
602 │ 
603 │       // If the resource is in the cache already, it can be skipped.
604 ▶       if (alreadyCached) {
605 ▶         return;
606 │       }
```

📄 `angular/packages/service-worker/worker/src/assets.ts` L607–634 （▶ の行: 609–610, 614, 619, 625, 629, 631）

```ts
607 │ 
608 │       // If an update source is available.
609 ▶       if (updateFrom !== undefined && (await this.maybeUpdate(updateFrom, req, cache))) {
610 ▶         return;
611 │       }
612 │ 
613 │       // Otherwise, go to the network and hopefully cache the response (if successful).
614 ▶       await this.fetchAndCacheOnce(req, false);
615 │     }, Promise.resolve());
616 │ 
617 │     // Handle updating of unknown (unhashed) resources. This is only possible if there's
618 │     // a source to update from.
619 ▶     if (updateFrom !== undefined) {
620 │       const metaTable = await this.metadata;
621 │ 
622 │       // Select all of the previously cached resources. These are cached unhashed resources
623 │       // from previous versions of the app, in any asset group.
624 │       await (
625 ▶         await updateFrom.previouslyCachedResources()
626 │       )
627 │         // First, narrow down the set of resources to those which are handled by this group.
628 │         // Either it's a known URL, or it matches a given pattern.
629 ▶         .filter(
630 │           (url) =>
631 ▶             this.urls.indexOf(url) !== -1 || this.patterns.some((pattern) => pattern.test(url)),
632 │         )
633 │         // Finally, process each resource in turn.
634 │         .reduce(async (previous, url) => {
```

1. **581〜583 行目：`urls` を 1 つずつ、順番に**

   並列にしないので、先読みは 1 本ずつネットワークに出ます（デモの「サーバーに届いた」の並び）。
2. **596〜606 行目：もうキャッシュにあれば飛ばす**

   先読みより先にページが要求して入っていた場合や、前回の先読みが途中で止まった場合です。
3. **609 行目：`maybeUpdate` で前の版から写せれば、ネットワークに行かない**

   下の `maybeUpdate` を読みます。
4. **614 行目：写せなければ取る**

   2 つ目の引数 `false` は「ページが使ったわけではない」の印です。
5. **619〜632 行目：ハッシュの無い URL を、前の版から写す**

   625 行目の `previouslyCachedResources` は、前の版（最新の版）のキャッシュにある「ハッシュの無い URL」の一覧です。629〜632 行目で自分の `urls` か `patterns` に当たるものに絞ります。

📄 `angular/packages/service-worker/worker/src/assets.ts` L635–660 （▶ の行: 640, 642, 647–648, 655–656）

```ts
635 │           await previous;
636 │           const req = this.adapter.newRequest(url);
637 │ 
638 │           // It's possible that the resource in question is already cached. If so,
639 │           // continue to the next one.
640 ▶           const alreadyCached =
641 │             (await cache.match(req, this.config.cacheQueryOptions)) !== undefined;
642 ▶           if (alreadyCached) {
643 │             return;
644 │           }
645 │ 
646 │           // Get the most recent old version of the resource.
647 ▶           const res = await updateFrom.lookupResourceWithoutHash(url);
648 ▶           if (res === null || res.metadata === undefined) {
649 │             // Unexpected, but not harmful.
650 │             return;
651 │           }
652 │ 
653 │           // Write it into the cache. It may already be expired, but it can still serve
654 │           // traffic until it's updated (stale-while-revalidate approach).
655 ▶           await cache.put(req, res.response);
656 ▶           await metaTable.write(req.url, {...res.metadata, used: false} as UrlMetadata);
657 │         }, Promise.resolve());
658 │     }
659 │   }
660 │ }
```

647 行目でその URL の Response と `meta` を前の版から取り、655 行目でキャッシュに、656 行目で `meta` を `used: false` にして書きます。653〜654 行目のコメントのとおり、古くなっていてもとりあえず配れるようにする（2 節の 156〜163 行目で裏で取り直される）ためです。

### 前の版から写す：maybeUpdate と、版をまたいで探す関数

📄 `angular/packages/service-worker/worker/src/assets.ts` L469–498 （▶ の行: 479–480, 484, 487, 489, 492, 497）

```ts
469 │   /**
470 │    * Possibly update a resource, if it's expired and needs to be updated. A no-op otherwise.
471 │    */
472 │   protected async maybeUpdate(
473 │     updateFrom: UpdateSource,
474 │     req: Request,
475 │     cache: Cache,
476 │   ): Promise<boolean> {
477 │     const url = this.adapter.normalizeUrl(req.url);
478 │     // Check if this resource is hashed and already exists in the cache of a prior version.
479 ▶     if (this.hashes.has(url)) {
480 ▶       const hash = this.hashes.get(url)!;
481 │ 
482 │       // Check the caches of prior versions, using the hash to ensure the correct version of
483 │       // the resource is loaded.
484 ▶       const res = await updateFrom.lookupResourceWithHash(url, hash);
485 │ 
486 │       // If a previously cached version was available, copy it over to this cache.
487 ▶       if (res !== null) {
488 │         // Copy to this cache.
489 ▶         await cache.put(req, res);
490 │ 
491 │         // No need to do anything further with this resource, it's now cached properly.
492 ▶         return true;
493 │       }
494 │     }
495 │ 
496 │     // No up-to-date version of this resource could be found.
497 ▶     return false;
498 │   }
```

479 行目、**ハッシュのあるファイルだけ**が対象です。484 行目で「この URL で、このハッシュの Response」を `updateFrom`（Driver）に探させ、見つかれば 489 行目でこの版のキャッシュに入れます。ハッシュが同じなら中身も同じなので、ネットワークに行く理由がありません。

📄 `angular/packages/service-worker/worker/src/driver.ts` L1163–1189 （▶ の行: 1167, 1173, 1181, 1186）

```ts
1163 │   /**
1164 │    * Determine if a specific version of the given resource is cached anywhere within the SW,
1165 │    * and fetch it if so.
1166 │    */
1167 ▶   lookupResourceWithHash(url: NormalizedUrl, hash: string): Promise<Response | null> {
1168 │     return (
1169 │       Array
1170 │         // Scan through the set of all cached versions, valid or otherwise. It's safe to do such
1171 │         // lookups even for invalid versions as the cached version of a resource will have the
1172 │         // same hash regardless.
1173 ▶         .from(this.versions.values())
1174 │         // Reduce the set of versions to a single potential result. At any point along the
1175 │         // reduction, if a response has already been identified, then pass it through, as no
1176 │         // future operation could change the response. If no response has been found yet, keep
1177 │         // checking versions until one is or until all versions have been exhausted.
1178 │         .reduce(async (prev, version) => {
1179 │           // First, check the previous result. If a non-null result has been found already, just
1180 │           // return it.
1181 ▶           if ((await prev) !== null) {
1182 │             return prev;
1183 │           }
1184 │ 
1185 │           // No result has been found yet. Try the next `AppVersion`.
1186 ▶           return version.lookupResourceWithHash(url, hash);
1187 │         }, Promise.resolve<Response | null>(null))
1188 │     );
1189 │   }
```

📄 `angular/packages/service-worker/worker/src/app-version.ts` L235–271 （▶ の行: 241, 247, 251, 261, 269）

```ts
235 │   /**
236 │    * Check this version for a given resource with a particular hash.
237 │    */
238 │   async lookupResourceWithHash(url: NormalizedUrl, hash: string): Promise<Response | null> {
239 │     // Verify that this version has the requested resource cached. If not,
240 │     // there's no point in trying.
241 ▶     if (!this.hashTable.has(url)) {
242 │       return null;
243 │     }
244 │ 
245 │     // Next, check whether the resource has the correct hash. If not, any cached
246 │     // response isn't usable.
247 ▶     if (this.hashTable.get(url) !== hash) {
248 │       return null;
249 │     }
250 │ 
251 ▶     const cacheState = await this.lookupResourceWithoutHash(url);
252 │     return cacheState && cacheState.response;
253 │   }
254 │ 
255 │   /**
256 │    * Check this version for a given resource regardless of its hash.
257 │    */
258 │   lookupResourceWithoutHash(url: NormalizedUrl): Promise<CacheState | null> {
259 │     // Limit the search to asset groups, and only scan the cache, don't
260 │     // load resources from the network.
261 ▶     return this.assetGroups.reduce(async (potentialResponse, group) => {
262 │       const resp = await potentialResponse;
263 │       if (resp !== null) {
264 │         return resp;
265 │       }
266 │ 
267 │       // fetchFromCacheOnly() avoids any network fetches, and returns the
268 │       // full set of cache data, not just the Response.
269 ▶       return group.fetchFromCacheOnly(url);
270 │     }, Promise.resolve<CacheState | null>(null));
271 │   }
```

1. **1173 行目：Driver は全部の版を順に聞く**

   1170〜1172 行目のコメントのとおり、壊れた版でも、同じハッシュのファイルなら中身は同じなので使ってよい、という考えです。1181 行目で見つかったらそれを流し、1186 行目で次の版に聞きます。
2. **241〜249 行目：その版の `hashTable` に URL があり、ハッシュが同じか**

   どちらかが違えば `null`。キャッシュを開く前に表だけで判定します。
3. **251 行目と 261〜270 行目：その版のアセットグループのキャッシュだけを見る**

   `fetchFromCacheOnly` はキャッシュを引くだけで、ネットワークには行きません。

📄 `angular/packages/service-worker/worker/src/driver.ts` L1191–1206 （▶ の行: 1193, 1199, 1204）

```ts
1191 │   async lookupResourceWithoutHash(url: NormalizedUrl): Promise<CacheState | null> {
1192 │     await this.initialized;
1193 ▶     const version = this.versions.get(this.latestHash!);
1194 │     return version ? version.lookupResourceWithoutHash(url) : null;
1195 │   }
1196 │ 
1197 │   async previouslyCachedResources(): Promise<NormalizedUrl[]> {
1198 │     await this.initialized;
1199 ▶     const version = this.versions.get(this.latestHash!);
1200 │     return version ? version.previouslyCachedResources() : [];
1201 │   }
1202 │ 
1203 │   async recentCacheStatus(url: string): Promise<UpdateCacheStatus> {
1204 ▶     const version = this.versions.get(this.latestHash!);
1205 │     return version ? version.recentCacheStatus(url) : UpdateCacheStatus.NOT_CACHED;
1206 │   }
```

📄 `angular/packages/service-worker/worker/src/app-version.ts` L273–295 （▶ の行: 276, 278, 289–290, 293）

```ts
273 │   /**
274 │    * List all unhashed resources from all asset groups.
275 │    */
276 ▶   previouslyCachedResources(): Promise<NormalizedUrl[]> {
277 │     return this.assetGroups.reduce(
278 ▶       async (resources, group) => (await resources).concat(await group.unhashedResources()),
279 │       Promise.resolve<NormalizedUrl[]>([]),
280 │     );
281 │   }
282 │ 
283 │   async recentCacheStatus(url: string): Promise<UpdateCacheStatus> {
284 │     return this.assetGroups.reduce(async (current, group) => {
285 │       const status = await current;
286 │       if (status === UpdateCacheStatus.CACHED) {
287 │         return status;
288 │       }
289 ▶       const groupStatus = await group.cacheStatus(url);
290 ▶       if (groupStatus === UpdateCacheStatus.NOT_CACHED) {
291 │         return status;
292 │       }
293 ▶       return groupStatus;
294 │     }, Promise.resolve(UpdateCacheStatus.NOT_CACHED));
295 │   }
```

📄 `angular/packages/service-worker/worker/src/assets.ts` L282–295 （▶ の行: 289, 293）

```ts
282 │   /**
283 │    * Lookup all resources currently stored in the cache which have no associated hash.
284 │    */
285 │   async unhashedResources(): Promise<NormalizedUrl[]> {
286 │     const cache = await this.cache;
287 │     // Start with the set of all cached requests.
288 │     return (
289 ▶       (await cache.keys())
290 │         // Normalize their URLs.
291 │         .map((request) => this.adapter.normalizeUrl(request.url))
292 │         // Exclude the URLs which have hashes.
293 ▶         .filter((url) => !this.hashes.has(url))
294 │     );
295 │   }
```

ハッシュで探す `lookupResourceWithHash` は全部の版を見ますが、ハッシュの無いものを探す 3 つ（1191〜1206 行目）は **`latestHash` の版だけ**を見ます。更新の途中では `latestHash` はまだ前の版を指しているので、「前の版」とはこの版のことです。`previouslyCachedResources` は 276〜281 行目で各グループの `unhashedResources` をつなぎ、それは assets.ts の 289〜294 行目で、キャッシュのキーからハッシュのある URL を除いたものです。

## 7. LazyAssetGroup：取らない。updateMode が prefetch なら、使ったものだけ取り直す

📄 `angular/packages/service-worker/worker/src/assets.ts` L662–700 （▶ の行: 666–667, 674, 689, 697）

```ts
662 │ export class LazyAssetGroup extends AssetGroup {
663 │   override async initializeFully(updateFrom?: UpdateSource): Promise<void> {
664 │     // No action necessary if no update source is available - resources managed in this group
665 │     // are all lazily loaded, so there's nothing to initialize.
666 ▶     if (updateFrom === undefined) {
667 ▶       return;
668 │     }
669 │ 
670 │     // Open the cache which actually holds requests.
671 │     const cache = await this.cache;
672 │ 
673 │     // Loop through the listed resources, caching any which are available.
674 ▶     await this.urls.reduce(async (previous: Promise<void>, url: string) => {
675 │       // Wait on all previous operations to complete.
676 │       await previous;
677 │ 
678 │       // Construct the Request for this url.
679 │       const req = this.adapter.newRequest(url);
680 │ 
681 │       let alreadyCached = false;
682 │       try {
683 │         // Safari 16.4/17 is known to sometimes throw an unexpected internal error on cache access
684 │         // This try/catch is here as a workaround to prevent a failure of the handleFetch
685 │         // as the Driver falls back to safeFetch on critical errors.
686 │         // See #50378
687 │ 
688 │         // First, check the cache to see if there is already a copy of this resource.
689 ▶         alreadyCached = (await cache.match(req, this.config.cacheQueryOptions)) !== undefined;
690 │       } catch (error) {
691 │         throw new SwCriticalError(
692 │           `Cache is throwing while looking for a match in a LazyAssetGroup: ${error}`,
693 │         );
694 │       }
695 │ 
696 │       // If the resource is in the cache already, it can be skipped.
697 ▶       if (alreadyCached) {
698 │         return;
699 │       }
700 │ 
```

📄 `angular/packages/service-worker/worker/src/assets.ts` L701–722 （▶ の行: 701–702, 709, 713–714, 718）

```ts
701 ▶       const updated = await this.maybeUpdate(updateFrom, req, cache);
702 ▶       if (this.config.updateMode === 'prefetch' && !updated) {
703 │         // If the resource was not updated, either it was not cached before or
704 │         // the previously cached version didn't match the updated hash. In that
705 │         // case, prefetch update mode dictates that the resource will be updated,
706 │         // except if it was not previously utilized. Check the status of the
707 │         // cached resource to see.
708 │ 
709 ▶         const cacheStatus = await updateFrom.recentCacheStatus(url);
710 │ 
711 │         // If the resource is not cached, or was cached but unused, then it will be
712 │         // loaded lazily.
713 ▶         if (cacheStatus !== UpdateCacheStatus.CACHED) {
714 ▶           return;
715 │         }
716 │ 
717 │         // Update from the network.
718 ▶         await this.fetchAndCacheOnce(req, false);
719 │       }
720 │     }, Promise.resolve());
721 │   }
722 │ }
```

📄 `angular/packages/service-worker/worker/src/assets.ts` L86–103 （▶ の行: 90, 92, 95–97, 99, 102）

```ts
 86 │   async cacheStatus(url: string): Promise<UpdateCacheStatus> {
 87 │     const cache = await this.cache;
 88 │     const meta = await this.metadata;
 89 │     const req = this.adapter.newRequest(url);
 90 ▶     const res = await cache.match(req, this.config.cacheQueryOptions);
 91 │     if (res === undefined) {
 92 ▶       return UpdateCacheStatus.NOT_CACHED;
 93 │     }
 94 │     try {
 95 ▶       const data = await meta.read<UrlMetadata>(req.url);
 96 ▶       if (!data.used) {
 97 ▶         return UpdateCacheStatus.CACHED_BUT_UNUSED;
 98 │       }
 99 ▶     } catch (_) {
100 │       // Error on the side of safety and assume cached.
101 │     }
102 ▶     return UpdateCacheStatus.CACHED;
103 │   }
```

1. **666〜668 行目：初めて入れるときは何もしない**

   lazy のファイルは 2 節の 168 行目で、使ったときに初めて入ります。
2. **701 行目：更新のときは、まず前の版から写す**

   `maybeUpdate` は 6 節と同じです。ハッシュが同じで前の版のキャッシュにあれば、`updateMode` にかかわらず写します。
3. **702 行目：写せず、`updateMode` が `prefetch` なら**

   709 行目で前の版での状態を聞き、713 行目、`CACHED`（前の版で使われていた）でなければ取りません。`CACHED` なら 718 行目で取ります。つまり **「前の版で使った」かつ「中身が変わった」ファイルだけ**を、版を入れるときに取り直します。`updateMode: 'lazy'` なら 702 行目に入らず、変わったファイルは次に使われるまで取りません。
4. **86〜103 行目：`CACHED` の判定**

   キャッシュに無ければ `NOT_CACHED`。`meta` が読めて `used` が false なら `CACHED_BUT_UNUSED`。ハッシュのあるファイルには `meta` が無いので（4 節の 340 行目）、99〜101 行目の catch を通って `CACHED` になります。

> [!WARNING]
> **ハマりどころ**
>
> **`PrefetchAssetGroup` は `updateMode` を一度も読みません。**`config.updateMode` を見るのは 702 行目の `LazyAssetGroup` だけです。`installMode: 'prefetch'` のグループは、`updateMode` に何を書いても、更新のたびに変わったファイルを全部取ります。デモの「prefetch / lazy」で確かめられます。

## 8. 本物の ngsw-worker.js で、モードごとに更新を比べる

> **🧪 DEMO — installMode と updateMode で、v1 → v2 の更新に何が届くか**
>
> 本物の `ngsw-worker.js`（@angular/service-worker 22.1.6 の配布物）を、偽物のブラウザの上で動かします（偽物にしたものは `sw-sandbox.ts` の先頭のコメント）。グループ app（`/index.html`・`/main.js`、prefetch）と、モードを選べるグループ assets（`/assets/a〜d.svg`）。v1 → v2 で **a と c が変わり、b と d は同じ**です。v1 を入れて 6 秒進めたあと tab-1 が a と b を使い、v2 は tab-1 からの `CHECK_FOR_UPDATES` で入れます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sw-asset-groups)

4 通りを走らせると、assets の行は次のようになります（本物のワーカーで確かめた結果）。

| installMode / updateMode | v1 で届いた | v2 の更新で届いた | v2 のキャッシュ | 決めた行 |
| --- | --- | --- | --- | --- |
| prefetch / prefetch | a b c d | a c | a b c d（b d は写した） | 609・614 |
| prefetch / lazy | a b c d | a c | a b c d（b d は写した） | 同じ。`updateMode` を読まない |
| lazy / prefetch | a b（使ったときに） | a | a b（b は写した） | 701・702・713・718 |
| lazy / lazy | a b（使ったときに） | なし | b（写した） | 701。702 に入らない |

どの組でも、ハッシュが同じ b はネットワークに行かずに写されます（489 行目）。lazy / prefetch で「使っていない c」が取られないのは 713 行目、「使った a」だけが取られるのは 718 行目です。「v1 で tab-1 が a と b を使う」の印を外して lazy / prefetch を走らせると、v2 の更新では何も届かず、v2 のキャッシュは空です。

### ここまでの呼び出し

- `AppVersion.initializeFully(updateFrom?)` — app-version.ts:126 — *グループを順に*
  - `PrefetchAssetGroup.initializeFully` — assets.ts:574
    - `maybeUpdate → Driver.lookupResourceWithHash → AppVersion.lookupResourceWithHash` — assets.ts:484・driver.ts:1186・app-version.ts:238 — *同じハッシュなら写す*
    - `fetchAndCacheOnce(req, false)` — assets.ts:614
    - `previouslyCachedResources → lookupResourceWithoutHash` — assets.ts:625・647 — *ハッシュの無いものを写す*
  - `LazyAssetGroup.initializeFully` — assets.ts:663
    - `maybeUpdate → (updateMode === 'prefetch') recentCacheStatus → fetchAndCacheOnce` — assets.ts:701・709・718
- `AssetGroup.handleFetch(req)` — assets.ts:121 — *リクエストのとき*
  - `cache.match → (無ければ) fetchAndCacheOnce → fetchFromNetwork` — assets.ts:141・168・312

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| worker/test/prefetch\_spec.ts | describe `prefetch assets`（45 行目、it 6）。`PrefetchAssetGroup` を Driver 無しで直接 new する | `//packages/service-worker/worker/test:test` |
| worker/test/happy\_spec.ts | describe `Driver` の it `caches lazy content on-request`（386）・`handles redirected responses`（378）・`prefetches updates to lazy cache when set`（1272）、describe `unhashed requests`（1838、it 6） |   |

📄 `angular/packages/service-worker/worker/test/prefetch_spec.ts` L62–100 （▶ の行: 63, 66, 68, 74, 87, 94, 99）

```ts
 62 │     it('initializes without crashing', async () => {
 63 ▶       await group.initializeFully();
 64 │     });
 65 │     it('fully caches the two files', async () => {
 66 ▶       await group.initializeFully();
 67 │       scope.updateServerState();
 68 ▶       const res1 = await group.handleFetch(scope.newRequest('/foo.txt'), testEvent);
 69 │       const res2 = await group.handleFetch(scope.newRequest('/bar.txt'), testEvent);
 70 │       expect(await res1!.text()).toEqual('this is foo');
 71 │       expect(await res2!.text()).toEqual('this is bar');
 72 │     });
 73 │     it('persists the cache across restarts', async () => {
 74 ▶       await group.initializeFully();
 75 │       const freshScope = new SwTestHarnessBuilder()
 76 │         .withCacheState(scope.caches.original.dehydrate())
 77 │         .build();
 78 │       group = new PrefetchAssetGroup(
 79 │         freshScope,
 80 │         freshScope,
 81 │         idle,
 82 │         manifest.assetGroups![0],
 83 │         tmpHashTable(manifest),
 84 │         new CacheDatabase(freshScope),
 85 │         'test',
 86 │       );
 87 ▶       await group.initializeFully();
 88 │       const res1 = await group.handleFetch(scope.newRequest('/foo.txt'), testEvent);
 89 │       const res2 = await group.handleFetch(scope.newRequest('/bar.txt'), testEvent);
 90 │       expect(await res1!.text()).toEqual('this is foo');
 91 │       expect(await res2!.text()).toEqual('this is bar');
 92 │     });
 93 │     it('caches properly if resources are requested before initialization', async () => {
 94 ▶       const res1 = await group.handleFetch(scope.newRequest('/foo.txt'), testEvent);
 95 │       const res2 = await group.handleFetch(scope.newRequest('/bar.txt'), testEvent);
 96 │       expect(await res1!.text()).toEqual('this is foo');
 97 │       expect(await res2!.text()).toEqual('this is bar');
 98 │       scope.updateServerState();
 99 ▶       await group.initializeFully();
100 │     });
```

66 行目で `initializeFully()`（`updateFrom` 無し）を呼んでから 68 行目で `handleFetch`。67 行目でサーバーを空にしているので、答えはキャッシュからしか来ません。94〜99 行目は、先読みの前にページが要求した場合（6 節の 596〜606 行目で飛ばされる）の確認です。

📄 `angular/packages/service-worker/worker/test/happy_spec.ts` L1272–1292 （▶ の行: 1277–1278, 1285, 1287, 1289, 1291）

```ts
1272 │     it('prefetches updates to lazy cache when set', async () => {
1273 │       expect(await makeRequest(scope, '/foo.txt')).toEqual('this is foo');
1274 │       await driver.initialized;
1275 │ 
1276 │       // Fetch some files from the `lazy_prefetch` asset group.
1277 ▶       expect(await makeRequest(scope, '/quux.txt')).toEqual('this is quux');
1278 ▶       expect(await makeRequest(scope, '/lazy/unchanged1.txt')).toEqual('this is unchanged (1)');
1279 │ 
1280 │       // Install update.
1281 │       scope.updateServerState(serverUpdate);
1282 │       expect(await driver.checkForUpdate()).toBe(true);
1283 │ 
1284 │       // Previously requested and changed: Fetch from network.
1285 ▶       serverUpdate.assertSawRequestFor('/quux.txt');
1286 │       // Never requested and changed: Don't fetch.
1287 ▶       serverUpdate.assertNoRequestFor('/quuux.txt');
1288 │       // Previously requested and unchanged: Fetch from cache.
1289 ▶       serverUpdate.assertNoRequestFor('/lazy/unchanged1.txt');
1290 │       // Never requested and unchanged: Don't fetch.
1291 ▶       serverUpdate.assertNoRequestFor('/lazy/unchanged2.txt');
1292 │ 
```

happy\_spec の `lazy_prefetch` グループ（`installMode: 'lazy'`・`updateMode: 'prefetch'`）で、デモの lazy / prefetch と同じ 4 通りを確かめます。1285 行目「使った・変わった」は取る、1287 行目「使っていない・変わった」は取らない、1289 行目「使った・同じ」は写す、1291 行目「使っていない・同じ」は取らない。

📄 `angular/packages/service-worker/worker/test/happy_spec.ts` L1293–1315 （▶ の行: 1296, 1299, 1303–1304, 1307, 1311）

```ts
1293 │       serverUpdate.clearRequests();
1294 │ 
1295 │       // Update client.
1296 ▶       await driver.updateClient(await scope.clients.get('default'));
1297 │ 
1298 │       // Already cached.
1299 ▶       expect(await makeRequest(scope, '/quux.txt')).toBe('this is quux v2');
1300 │       serverUpdate.assertNoOtherRequests();
1301 │ 
1302 │       // Not cached: Fetch from network.
1303 ▶       expect(await makeRequest(scope, '/quuux.txt')).toBe('this is quuux v2');
1304 ▶       serverUpdate.assertSawRequestFor('/quuux.txt');
1305 │ 
1306 │       // Already cached (copied from old cache).
1307 ▶       expect(await makeRequest(scope, '/lazy/unchanged1.txt')).toBe('this is unchanged (1)');
1308 │       serverUpdate.assertNoOtherRequests();
1309 │ 
1310 │       // Not cached: Fetch from network.
1311 ▶       expect(await makeRequest(scope, '/lazy/unchanged2.txt')).toBe('this is unchanged (2)');
1312 │       serverUpdate.assertSawRequestFor('/lazy/unchanged2.txt');
1313 │ 
1314 │       serverUpdate.assertNoOtherRequests();
1315 │     });
```

1296 行目でタブを新しい版に付け替えたあと、1303・1311 行目の「取らなかったもの」は使ったときに初めて届くことまで見ています。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/service-worker/worker/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=^(prefetch assets|Driver (caches lazy content|prefetches updates to lazy|unhashed requests|handles redirected))'
```

📄 `出力（2026-11-03 に実行。抜粋。ログは scratchpad/sw-logs/b-assets.log）`

```
Ran 15 of 153 specs
15 specs, 0 failures
//packages/service-worker/worker/test:test                               PASSED in 0.7s
```

- 15 件 = prefetch assets 6・unhashed requests 6・caches lazy content 1・prefetches updates to lazy 1・handles redirected 1。

### 直すとしたら

- モードの決まりを変えるなら `PrefetchAssetGroup.initializeFully`（6 節）と `LazyAssetGroup.initializeFully`（7 節）。it は happy\_spec の 1272 行目の形で、`assertSawRequestFor` と `assertNoRequestFor` をファイルごとに並べます。グループ単体なら prefetch\_spec の形です。
- 2026 年にこのファイルに入った修正は、2 節の 168 行目で使った `newRequestWithMetadata` に集まっています（`git log --format='%h %ad %s' --date=short -- packages/service-worker/worker/src/assets.ts`）。redirect の方針（07abfbcc6c5）、`credentials: 'omit'`（5b0e9663e5c）、cache のモード（31399c21710）、別のオリジンへのリダイレクトで機微なヘッダーを消す（47d68dcb262）、referrer（716f9eb032b）と referrerPolicy（6f98f98f1f4）。手本の it は happy\_spec の describe `request metadata` です。

📄 `angular/packages/service-worker/worker/src/assets.ts` L520–549 （▶ の行: 526, 528–530, 533, 540, 544）

```ts
520 │   private newRequestWithMetadata(url: string, options: Request): Request {
521 │     let headers = options.headers;
522 │     const parsedUrl = this.adapter.parseUrl(url, this.adapter.origin);
523 │ 
524 │     const hasHeaders = headers.keys().next().done !== true;
525 │ 
526 ▶     if (hasHeaders && parsedUrl.origin !== this.adapter.origin) {
527 │       headers = this.adapter.newHeaders(options.headers);
528 ▶       headers.delete('Authorization');
529 ▶       headers.delete('Proxy-Authorization');
530 ▶       headers.delete('Cookie');
531 │     }
532 │ 
533 ▶     const init: RequestInit = {
534 │       headers,
535 │       referrer: options.referrer,
536 │       referrerPolicy: options.referrerPolicy,
537 │       redirect: options.redirect,
538 │     };
539 │ 
540 ▶     if (options.credentials === 'omit') {
541 │       init.credentials = 'omit';
542 │     }
543 │ 
544 ▶     if (options.cache !== undefined) {
545 │       init.cache = options.cache;
546 │     }
547 │ 
548 │     return this.adapter.newRequest(url, init);
549 │   }
```

- 526〜531 行目、別のオリジンなら `Authorization`・`Proxy-Authorization`・`Cookie` を消します。533〜538 行目が引き継ぐもの、540 行目の `credentials` は `'omit'` のときだけ、544 行目の `cache` は値があれば。`method` と `body` は引き継がないので、作り直したリクエストはいつも GET です（2 節の 168 行目）。セキュリティの修正以外を受け付けない方針（[第 6 回](06-sw-driver-fetch.md)）のもとで実際に入った修正がこの関数に集まっている、ということ自体が、このパッケージで何が直されるかの手がかりです。issue #45377（先読みのネットワークエラーから戻れない）は [第 9 回](09-sw-hash-integrity.md)と [第 20 回](20-sw-issues.md)で扱います。本家に PR を出すことは勧めません。

## 聞かれそうな質問

**Q. prefetch と lazy の違いは、どの行？**

版を入れるときの `initializeFully` です。`PrefetchAssetGroup` は 581 行目から `urls` を全部、写せなければ 614 行目で取ります。`LazyAssetGroup` は 666〜668 行目で初回は何もせず、ファイルは 168 行目でページが使ったときに入ります。リクエストに答える `handleFetch` はどちらも同じ `AssetGroup` のものです。

**Q. 新しい版を出すと、変わっていないファイルもダウンロードし直す？**

しません。ハッシュのあるファイルは 609 行目（prefetch）と 701 行目（lazy）の `maybeUpdate` が、484 行目で同じハッシュの Response を前の版のキャッシュから探し、489 行目で写します。デモの b と d がこれです。

**Q. `installMode: 'prefetch'` で `updateMode: 'lazy'` にすると、更新のときの通信は減る？**

減りません。`updateMode` を読むのは `LazyAssetGroup` の 702 行目だけで、`PrefetchAssetGroup` は読まないからです。変わったファイルは毎回全部取ります。

**Q. 先読みの最中にページが同じファイルを要求したら、2 回取る？**

取りません。`fetchAndCacheOnce` の 304〜307 行目が、取りに行っている最中の Promise を `inFlightRequests` から返すからです。

**Q. CDN の画像など、ハッシュの無いものはいつ取り直される？**

キャッシュにあればまず返し（163 行目）、`needToRevalidate` が true なら裏で取り直す仕事をアイドルに積みます（157 行目）。true になるのは、`Cache-Control` の `max-age` を過ぎたとき、`Expires` を過ぎたとき、そしてどちらのヘッダーも無いとき（251 行目）です。

## 読み終えて

- `handleFetch` は 3 通り。ハッシュあり・キャッシュあり → 返す。ハッシュ無し・キャッシュあり → 返して古ければ裏で取り直す。キャッシュ無し → `fetchAndCacheOnce`。
- `fetchAndCacheOnce` は `inFlightRequests` で同じ URL を 1 回にし、成功だけをキャッシュし、ハッシュの無いものに `{ts, used}` を書く。
- 版を入れるとき、ハッシュの同じファイルは `maybeUpdate` で前の版から写す。ネットワークに行くのは変わったものだけ。
- `updateMode` を読むのは `LazyAssetGroup` だけ。lazy / prefetch は「前の版で使った・変わった」ファイルだけを取り直す。

---

← 前: [版とタブ：AppVersion とクライアントの割り当て](07-sw-versions.md)  
次: [ハッシュを確かめる：壊れたファイルと回復できない状態](09-sw-hash-integrity.md) →
