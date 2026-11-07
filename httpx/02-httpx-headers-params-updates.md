[目次](../README.md) › [HttpClient の細部と issue](README.md) › 第 2 回 / 全 6 回

# headers と params の更新の規則：append・set・delete と遅れた適用

> HttpHeaders と HttpParams が append・set・delete を更新の列に積み、読まれたときに 1 つずつ当てる行（a・s・d の分岐）、値を指定した delete と名前だけの delete の違い、配列の値、fromObject と fromString。値の一致を厳密にした修正（f33ee95045a）と、clone を実体化したあとの不変性の修正（ff02a167495）、開いている #44149。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/httpx-headers-params-updates)

---

`HttpHeaders` と `HttpParams` の `append`・`set`・`delete` は、すぐには当てずに「更新の列」に積み、読まれたときに 1 件ずつ当てます。この章では、その 1 件 1 件（`'a'`・`'s'`・`'d'`）が当てられるときの規則の細部を読みます。値つきの `delete` がヘッダーとパラメータで違うこと、空の配列、名前の大文字と小文字、配列とカンマ（#44149）、そして 2026 年 7 月の 2 本の修正（f33ee95045a・ff02a167495）です。

読む対象は `packages/common/http/src/headers.ts` と `params.ts` です。更新の列（`lazyUpdate`・`updates`）を積む仕組みと、読まれたときに写し元から写す `init()` は[不変なリクエストの章](../http/04-http-request-immutable.md)の 5・6 節で読みました。ここでは列の中身の当て方だけを見ます。

1. [1. HttpRequest の options](01-httpx-request-options.md)
2. **2. headers と params の更新**（この章）
3. [3. オーバーロードの型](03-httpx-overload-types.md)
4. [4. httpResource の型](04-httpx-resource-types.md)
5. [5. 転送キャッシュのキー](05-httpx-transfer-cache-key.md)
6. [6. spec と issue](06-httpx-tests-issues.md)

## 1. 更新の 1 件の形

📄 `angular/packages/common/http/src/headers.ts` L9–13 （▶ の行: 10–12）

```ts
 9 │ interface Update {
10 ▶   name: string;
11 ▶   value?: string | string[];
12 ▶   op: 'a' | 's' | 'd';
13 │ }
```

📄 `angular/packages/common/http/src/params.ts` L121–129 （▶ の行: 121–122, 126–128）

```ts
121 ▶ function valueToString(value: string | number | boolean): string {
122 ▶   return `${value}`;
123 │ }
124 │ 
125 │ interface Update {
126 ▶   param: string;
127 ▶   value?: string | number | boolean;
128 ▶   op: 'a' | 'd' | 's';
129 │ }
```

同じ名前の `Update` が 2 つのファイルに別々にあります。headers.ts の 11 行目は値が `string | string[]`（配列を 1 件で積める）、params.ts の 127 行目は `string | number | boolean` の 1 つだけです。params の値は、当てるときに 121〜123 行目の `valueToString` でテンプレート文字列にして文字列にします（`true` は `'true'`、`0` は `'0'`）。

12 行目と 128 行目の `op` は 1 文字です。`'a'` が append、`'s'` が set、`'d'` が delete。`append()`・`set()`・`delete()` はこれを 1 件作って `clone` に渡すだけで、自分は変わりません。

## 2. HttpHeaders の 'a' と 's'：文字列は配列に、空の配列は何もしない

📄 `angular/packages/common/http/src/headers.ts` L213–219 （▶ の行: 213–215, 217–218）

```ts
213 ▶         let value = update.value!;
214 ▶         if (typeof value === 'string') {
215 ▶           value = [value];
216 │         }
217 ▶         if (value.length === 0) {
218 ▶           return;
219 │         }
```

1. **214〜216 行目：文字列なら 1 つだけの配列にする**

   `set('X-A', 'v')` と `set('X-A', ['v'])` は同じ結果です。配列はそのまま使います。
2. **217〜219 行目：配列が空なら、ここで return する**

   `'a'` にも `'s'` にも効きます。`append('X-A', [])` が何もしないのは自然ですが、**`set('X-A', [])` も何もしません**。既に `X-A` があれば、その値が残ります。
3. **その後ろ：'a' は元の配列の写しに足し、's' は空の配列から作る**

   この 4 行は[前の章](../http/04-http-request-immutable.md)の 5 節で読みました（`applyUpdate` の引用）。名前は `toLowerCase()` した `key` で引き、書き方は最初に見たものを残します。

> [!WARNING]
> **ハマりどころ**
>
> **`set(name, [])` は値を置き換えません（本家の不具合らしきもの）。**`set` の doc コメントは「既にあれば、その値は渡した値で置き換えられる」と書いています。しかし 217〜219 行目の return で、空の配列は「置き換える」前に止まります。一方、コンストラクタに `{ 'X-A': [] }` を渡したときは 5 節の `setHeaderEntries` が空の配列をそのまま入れるので、`has` は `true`・`get` は `null` になり、2 つの入口で空の配列の扱いが違います。
>
> 📄 `22.1.6 で確かめた式`
>
> ```
> // 22.1.6 の配布物
> new HttpHeaders({ 'X-A': 'old' }).set('X-A', []).getAll('X-A'); // → ['old']（置き換わらない）
> new HttpHeaders({ 'X-A': [] }).has('X-A');                      // → true
> new HttpHeaders({ 'X-A': [] }).get('X-A');                      // → null
> new HttpHeaders({ 'X-A': [] }).keys();                          // → ['X-A']
> ```
>
> 確かめ方と、既存の issue が見つからなかったことは章末に書きます。

## 3. 'd'：値つきの delete は、ヘッダーとパラメータで数が違う

📄 `angular/packages/common/http/src/headers.ts` L225–246 （▶ の行: 226–229, 231–233, 236–238, 241）

```ts
225 │       case 'd':
226 ▶         const toDelete = update.value;
227 ▶         if (toDelete === undefined) {
228 ▶           this.headers.delete(key);
229 ▶           this.normalizedNames.delete(key);
230 │         } else {
231 ▶           const valuesToDelete = Array.isArray(toDelete) ? toDelete : [toDelete];
232 ▶           let existing = this.headers.get(key);
233 ▶           if (!existing) {
234 │             return;
235 │           }
236 ▶           existing = existing.filter((value) => valuesToDelete.indexOf(value) === -1);
237 ▶           if (existing.length === 0) {
238 ▶             this.headers.delete(key);
239 │             this.normalizedNames.delete(key);
240 │           } else {
241 ▶             this.headers.set(key, existing);
242 │           }
243 │         }
244 │         break;
245 │     }
246 │   }
```

1. **227〜229 行目：値が `undefined` なら名前ごと消す**

   値の配列（`headers`）と書き方の記録（`normalizedNames`）の両方から消します。消したあとに同じ名前を足すと、そのとき使った書き方が新しく記録されます。
2. **231 行目：値は配列にそろえる**

   `delete('X-A', 'v')` も `delete('X-A', ['v', 'w'])` も、「消す値の一覧」になります。
3. **236 行目：一覧に入っている値を *すべて* 取り除く**

   `filter` は条件に合う要素を全部残す（合わない要素を全部捨てる）ので、同じ値が 2 つあれば 2 つとも消えます。`['1', '1', '2']` から `'1'` を消すと `['2']` です。
4. **237〜242 行目：残りが 0 個なら名前ごと消す、残れば入れ直す**

   新しい配列を `set` し直すので、写し元と共有していた配列は書き換わりません。

### f33ee95045a：値の一致を厳密に

📄 `git show f33ee95045a -- packages/common/http/src/headers.ts（抜粋）`

```
@@ -223,16 +223,17 @@ export class HttpHeaders {
       case 'd':
-        const toDelete = update.value as string | undefined;
-        if (!toDelete) {
+        const toDelete = update.value;
+        if (toDelete === undefined) {
           this.headers.delete(key);
           this.normalizedNames.delete(key);
         } else {
+          const valuesToDelete = Array.isArray(toDelete) ? toDelete : [toDelete];
           let existing = this.headers.get(key);
           if (!existing) {
             return;
           }
-          existing = existing.filter((value) => toDelete.indexOf(value) === -1);
+          existing = existing.filter((value) => valuesToDelete.indexOf(value) === -1);
```

2026-07-16 の修正（v22.2.0。22.1.6 の配布物にも入っていることを確かめました）。直す前の 236 行目は `toDelete.indexOf(value)` で、`toDelete` が文字列のとき、これは**配列の検索ではなく文字列の中の部分文字列の検索**でした。`delete('X-Scopes', 'tenant:alpha:archive')` は、`'tenant:alpha'` も `'tenant:alpha:archive'` の中に見つかるので、両方を消していました。コミット本文は「短い値も消していた。送る要求のメタデータを広げてしまうおそれがある」と書いています（権限を表すヘッダーから、残すべき値まで消える）。もう 1 つ、直す前の `if (!toDelete)` は空文字 `''` を「値なし」と見て名前ごと消していました。今は 227 行目の `=== undefined` で、`''` は「空文字という値を消す」になります。

📄 `angular/packages/common/http/src/params.ts` L340–360 （▶ の行: 341–345, 347, 350, 353）

```ts
340 │           case 'd':
341 ▶             if (update.value !== undefined) {
342 ▶               const base = (this.map!.get(update.param) || []).slice();
343 ▶               const idx = base.indexOf(valueToString(update.value));
344 ▶               if (idx !== -1) {
345 ▶                 base.splice(idx, 1);
346 │               }
347 ▶               if (base.length > 0) {
348 │                 this.map!.set(update.param, base);
349 │               } else {
350 ▶                 this.map!.delete(update.param);
351 │               }
352 │             } else {
353 ▶               this.map!.delete(update.param);
354 │               break;
355 │             }
356 │         }
357 │       });
358 │       this.cloneFrom = this.updates = null;
359 │     }
360 │   }
```

params の 'd' は形が違います。342 行目で配列を写し、343 行目の `indexOf` で**最初の 1 つの位置だけ**を見つけ、345 行目の `splice(idx, 1)` で 1 つだけ消します。`tag=1&tag=1&tag=2` から `'1'` を消すと `['1', '2']` が残ります。比べる値は 343 行目の `valueToString` で文字列にするので、`delete('a', 0)` は `'0'` を消します。353 行目、値なしなら名前ごと消します。

|   | HttpHeaders（headers.ts） | HttpParams（params.ts） |
| --- | --- | --- |
| 名前の比べ方 | 小文字にそろえる（`applyUpdate` の先頭の `key`） | そのまま（4 節） |
| 1 件で積める値 | 文字列か文字列の配列（11 行目） | 文字列・数・真偽の 1 つ（127 行目）。配列は `appendAll`（5 節） |
| `set(name, [])` | 何もしない（217〜219 行目） | 型で渡せない |
| 値つきの `delete` | 同じ値を**すべて**消す（236 行目） | 最初の**1 つだけ**消す（343〜345 行目） |
| 値なしの `delete` | 名前ごと（228〜229 行目） | 名前ごと（353 行目） |

params の「1 つだけ」は spec でも確かめられている決まった振る舞いです（章末の params\_spec.ts 165 行目の it）。

## 4. 名前の大文字と小文字

📄 `angular/packages/common/http/src/params.ts` L200–235 （▶ の行: 202, 213–214, 225, 234）

```ts
200 │   has(param: string): boolean {
201 │     this.init();
202 ▶     return this.map!.has(param);
203 │   }
204 │ 
205 │   /**
206 │    * Retrieves the first value for a parameter.
207 │    * @param param The parameter name.
208 │    * @returns The first value of the given parameter,
209 │    * or `null` if the parameter is not present.
210 │    */
211 │   get(param: string): string | null {
212 │     this.init();
213 ▶     const res = this.map!.get(param);
214 ▶     return !!res ? res[0] : null;
215 │   }
216 │ 
217 │   /**
218 │    * Retrieves all values for a  parameter.
219 │    * @param param The parameter name.
220 │    * @returns All values in a string array,
221 │    * or `null` if the parameter not present.
222 │    */
223 │   getAll(param: string): string[] | null {
224 │     this.init();
225 ▶     return this.map!.get(param) || null;
226 │   }
227 │ 
228 │   /**
229 │    * Retrieves all the parameters for this body.
230 │    * @returns The parameter names in a string array.
231 │    */
232 │   keys(): string[] {
233 │     this.init();
234 ▶     return Array.from(this.map!.keys());
235 │   }
```

HttpParams の `has`・`get`・`getAll`・`keys` は、202・213・225・234 行目で名前をそのまま `Map` に渡します。`new HttpParams().set('Tag', 'a').get('tag')` は `null` です。URL のクエリの名前は大文字と小文字を区別するので、これで正しい振る舞いです。

ヘッダーの名前は HTTP の決まりで大文字と小文字を区別しないので、HttpHeaders は書くとき（`applyUpdate` の先頭）も読むときも小文字にそろえます。214 行目、HttpParams の `get` は最初の値を返します（ヘッダーの `get` も最初の値）。全部の値は `getAll` です。

## 5. 初期化の入口と、配列の値

📄 `angular/packages/common/http/src/headers.ts` L248–275 （▶ の行: 248, 250–252, 254, 258–260, 263–264, 270, 272–273）

```ts
248 ▶   private addHeaderEntry(name: string, value: string) {
249 │     const key = name.toLowerCase();
250 ▶     this.maybeSetNormalizedName(name, key);
251 ▶     if (this.headers.has(key)) {
252 ▶       this.headers.get(key)!.push(value);
253 │     } else {
254 ▶       this.headers.set(key, [value]);
255 │     }
256 │   }
257 │ 
258 ▶   private setHeaderEntries(name: string, values: any) {
259 ▶     const headerValues = (Array.isArray(values) ? values : [values]).map((value) =>
260 ▶       value.toString(),
261 │     );
262 │     const key = name.toLowerCase();
263 ▶     this.headers.set(key, headerValues);
264 ▶     this.maybeSetNormalizedName(name, key);
265 │   }
266 │ 
267 │   /**
268 │    * @internal
269 │    */
270 ▶   forEach(fn: (name: string, values: string[]) => void) {
271 │     this.init();
272 ▶     Array.from(this.normalizedNames.keys()).forEach((key) =>
273 ▶       fn(this.normalizedNames.get(key)!, this.headers.get(key)!),
274 │     );
275 │   }
```

1. **248〜256 行目 `addHeaderEntry`：文字列と `Headers` の入口。同じ名前は足していく**

   応答のヘッダーの文字列（`'X-A: 1\nX-A: 2'`）や fetch の `Headers` から作るときに使います。252 行目で既存の配列に push するので、同じ名前の行が 2 つあれば `['1', '2']` になります。
2. **258〜265 行目 `setHeaderEntries`：オブジェクトの入口。同じ名前は後勝ち**

   259〜261 行目で配列にそろえて `toString()` し（数も文字列に）、263 行目で `set` します。`{ foo: 'first', fOo: 'second' }` は小文字にすると同じ `foo` なので、263 行目で後の `['second']` が勝ちます。ところが 264 行目の `maybeSetNormalizedName` は「まだ記録が無いときだけ」書き方を残すので、`keys()` は最初の `'foo'` を返します。値は後の、名前の書き方は先の、です。空の配列もそのまま 263 行目で入ります（2 節の `set` とは違う）。
3. **270〜275 行目 `forEach`：バックエンドが送るときに使う**

   `@internal`（公開の型には出ない）のメソッドです。272 行目で書き方の記録を順に回り、273 行目で「最初の書き方の名前」と「値の配列」を渡します。`FetchBackend` と `HttpXhrBackend` はこれを使い、値の配列を `values.join(',')` で 1 本の文字列にして送ります（[FetchBackend の章](../http/06-http-backend-fetch.md)・[HttpXhrBackend の章](../http/07-http-backend-xhr.md)）。

📄 `angular/packages/common/http/src/params.ts` L252–288 （▶ の行: 252, 258–260, 263, 266, 275, 286）

```ts
252 ▶   appendAll(params: {
253 │     [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean>;
254 │   }): HttpParams {
255 │     const updates: Update[] = [];
256 │     Object.keys(params).forEach((param) => {
257 │       const value = params[param];
258 ▶       if (Array.isArray(value)) {
259 ▶         value.forEach((_value) => {
260 ▶           updates.push({param, value: _value, op: 'a'});
261 │         });
262 │       } else {
263 ▶         updates.push({param, value: value as string | number | boolean, op: 'a'});
264 │       }
265 │     });
266 ▶     return this.clone(updates);
267 │   }
268 │ 
269 │   /**
270 │    * Replaces the value for a parameter.
271 │    * @param param The parameter name.
272 │    * @param value The new value.
273 │    * @return A new body with the new value.
274 │    */
275 ▶   set(param: string, value: string | number | boolean): HttpParams {
276 │     return this.clone({param, value, op: 's'});
277 │   }
278 │ 
279 │   /**
280 │    * Removes a given value or all values from a parameter.
281 │    * @param param The parameter name.
282 │    * @param value The value to remove, if provided.
283 │    * @return A new body with the given value removed, or with all values
284 │    * removed if no value is specified.
285 │    */
286 ▶   delete(param: string, value?: string | number | boolean): HttpParams {
287 │     return this.clone({param, value, op: 'd'});
288 │   }
```

HttpParams で配列を一度に足すのは `appendAll` です。258〜261 行目で配列の要素ごとに `'a'` の更新を 1 件ずつ作り、266 行目で一度の `clone` に全部渡します（`clone` は配列も受け取り、`concat` で列に足します）。275 行目の `set` と 286 行目の `delete` は値を 1 つしか受け取りません。`set('tag', ['a', 'b'])` は型の検査で弾かれ、実行時に通しても `valueToString` で `'a,b'` の 1 つになります。コンストラクタの `fromObject` は配列を受け取り、要素ごとに文字列にします（[前の章](../http/04-http-request-immutable.md)の 6 節）。

## 6. #44149：同じ名前のヘッダーはカンマで分かれない

2021 年から開いている issue です（ラベルは `bug`・`breaking changes`・`P5`）。報告は「`getAll(key)` が `["value1, value2"]` を返す。`["value1", "value2"]` であるべき」です。5 節の 2 つの入口を見ると、どこで 1 本になっているかが分かります。

1. **受け取るとき：fetch の `Headers` が先に 1 本にしている**

   `FetchBackend` は応答の `response.headers`（fetch の `Headers`）から `new HttpHeaders(...)` します。ブラウザの `Headers.forEach` は Fetch の仕様どおり、同じ名前の値を `', '` でつないだ 1 つとして渡すので、252 行目の push は 1 回しか起きません。例外は `Set-Cookie` で、仕様が別々に渡すと決めているため 2 つのままです（spec の headers\_spec.ts 49 行目の it は、`Headers` を直接作ってこれを確かめています）。ただしブラウザの fetch の応答では、`Set-Cookie` は JavaScript から読めないヘッダー（forbidden response header）なので、そもそも `response.headers` に入りません。このデモを作るとき、fetch の `Response` に `Set-Cookie` を 2 回入れて `FetchBackend` に渡したところ、`getAll('Set-Cookie')` は `null` でした。2 つに分かれるのが見えるのは、`Headers` を直接作ったときです。
2. **送るとき：`join(',')` で 1 本にする**

   5 節の `forEach` から `values.join(',')`。`['1', '2']` は `'1,2'` という 1 つのヘッダーとして送られます。値をカンマ区切りの並びとして定めているヘッダーなら、HTTP ではこれは 2 行に分けて送るのと同じ意味です（issue が引いている RFC 7230 の 3.2.2 節）。

つまり HttpHeaders 自身は値を分けも合わせもしません。分けるには「カンマで区切ってよいヘッダーか」を名前ごとに知る必要があり（`Set-Cookie` や日付の入るヘッダーは区切れない）、今の `getAll` の戻り値を変えるので、ラベルに `breaking changes`（既存のコードの動きを変える）が付いています。

## 7. ff02a167495：実体化した写し元を書き換えない

ヘッダー側の 1 行（`applyUpdate` の `slice()`）は[前の章](../http/04-http-request-immutable.md)の 5 節で読みました。同じコミットは params.ts も直しています。

📄 `git show ff02a167495 -- packages/common/http/src/params.ts（抜粋）`

```
@@ -324,18 +324,22 @@ export class HttpParams {
     if (this.cloneFrom !== null) {
       this.cloneFrom.init();
-      this.cloneFrom.keys().forEach((key) => this.map!.set(key, this.cloneFrom!.map!.get(key)!));
+
+      for (const [key, values] of this.cloneFrom.map!.entries()) {
+        this.map!.set(key, values);
+      }
+
       this.updates!.forEach((update) => {
         switch (update.op) {
           case 'a':
           case 's':
-            const base = (update.op === 'a' ? this.map!.get(update.param) : undefined) || [];
+            const base = update.op === 'a' ? (this.map!.get(update.param) || []).slice() : [];
 ...
           case 'd':
             if (update.value !== undefined) {
-              let base = this.map!.get(update.param) || [];
+              const base = (this.map!.get(update.param) || []).slice();
```

`init()` は写し元の `Map` から値の配列を**そのまま**（複製せずに）自分の `Map` に入れます。速くするためです。直す前は、そのあとの `'a'` がその配列に push し、値つきの `'d'` がその配列を `splice` していたので、**先に読まれて実体化していた写し元**の値まで変わりました。修正は「書き換える直前に、その名前の配列だけ `slice()` で写す」です。3 節の 342 行目の `.slice()` がそれで、`'d'` の側の写しです。コミット本文は「不変の API の約束を破り、要求のメタデータが後の要求に漏れていた」と書いています（インターセプタで共通の HttpParams に append すると、次の要求にも残る）。

> [!NOTE]
> **さらに深く**
>
> 新しい本家（../angular-main、74961c66242）では、params.ts の符号化の関数も変わっています（01c883e2b6f、2026-10-12、「harden param encoding against prototype pollution」）。戻す文字の表をただのオブジェクトで引いていたため、`Object.prototype` を汚されると結果が変わりうる、という理由です。
>
> 📄 `git show 01c883e2b6f -- packages/common/http/src/params.ts（../angular-main、抜粋）`
>
> ```
> -const STANDARD_ENCODING_REGEX = /%(\d[a-f0-9])/gi;
> -const STANDARD_ENCODING_REPLACEMENTS: {[x: string]: string} = {
> -  '40': '@',
> -  '3A': ':',
> -  ...（$ , ; = ? / の 6 つ）
> -};
> +const STANDARD_ENCODING_REGEX = /[&+#]/g;
>
>  function standardEncoding(v: string): string {
> -  return encodeURIComponent(v).replace(
> -    STANDARD_ENCODING_REGEX,
> -    (s, t) => STANDARD_ENCODING_REPLACEMENTS[t] ?? s,
> -  );
> +  return encodeURI(v).replace(STANDARD_ENCODING_REGEX, encodeURIComponent);
>  }
> ```
>
> `encodeURI`（URL の区切りの文字を残す）を使ってから `&`・`+`・`#` だけを符号化し直す形です。U+0000〜U+2FFF の 1 文字ずつ（サロゲートを除く）で古い式と新しい式を Node で比べ、結果は全部同じでした。22.2.0-next.7 と 22.1.6 は古い式のままです。

## 8. DEMO：更新を積んで、読む

> **🧪 DEMO — 同じ順で HttpHeaders と HttpParams に積む**
>
> ボタンを押すと、このページで `@angular/common/http` を読み込み、本物の `HttpHeaders` と `HttpParams` を作ります。0 段目は `X-Trace: ['1', '1', '2']` と `tag=1&tag=1&tag=2` で、**先に 1 回読んで実体化**しておきます（ff02a167495 の場面）。ボタンを押すたびに 1 段積み、全部の段を読み直します。ヘッダーの名前は段ごとに `x-trace`・`X-TRACE`・`X-Trace` と書き方を変えています。
>
> 上のボタンを押すと、0 段目と 1 段目が出ます。
>
> 本物の `HttpClient` と `FetchBackend` で `get('/api/wire', { observe: 'response', headers })` を 1 回送ります。`fetch` は[第 1 回](01-httpx-request-options.md)と同じく、その間だけ「記録して決まった応答を返す関数」に替えます。応答の `Headers` には `X-Trace` を 2 回 `append` してあります。下の 2 行は、spec と同じく fetch の `Headers` を直接作って `HttpHeaders` に渡したものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/httpx-headers-params-updates)

押すと分かることです。

1. **「値つき delete」を最初に 2 回押すと、ヘッダーとパラメータで残りが違う**

   ヘッダーは 1 回目で `['2']`（236 行目、同じ値を全部）、パラメータは 1 回目で `['1', '2']`、2 回目で `['2']`（343〜345 行目、1 つずつ）。
2. **「set を積む」のあとの「set(\[\]) を積む」で、ヘッダーの値が変わらない**

   `['9']` のままです（217〜219 行目）。
3. **名前の書き方を変えても同じヘッダーで、keys() は最初の書き方**

   `'x-trace'` で足しても `'X-TRACE'` で set しても、`keys()` は 0 段目の `'X-Trace'` です。名前だけの delete のあとは `[]` になります。
4. **h0 と p0 は、何段積んでも変わらない**

   0 段目は先に読んで実体化してあるので、ff02a167495 の前ならここで値が変わる場面です。
5. **受け取った X-Trace は `["1, 2"]` の 1 つ、Headers から作った Set-Cookie は 2 つ。送ったのは `"1,2,3"`**

   6 節のとおりです。文字列から作ったときだけ `['1', '2']` の 2 つになります。

## ここまでの呼び出し

- 👤 `headers.delete('X-Scopes', 'v')` — あなたのコード
  - `this.clone({ name, value, op: 'd' })` — headers.ts（更新を 1 件積むだけ）
- 👤 `clone.getAll('X-Scopes')`（またはバックエンドの `forEach`） — 読む
  - `init()` — headers.ts — *写し元から値の配列を写す（前の章）*
    - `applyUpdate(update)` — headers.ts 225〜246 — *'d'：値を配列にそろえ、filter で全部消す*
  - `forEach(fn)` — headers.ts 270 — *バックエンドが values.join(',') で送る*

## テストと直し方

### spec と it

| ファイル | describe / it | 行 | この章のどこ |
| --- | --- | --- | --- |
| headers\_spec.ts | `HttpHeaders` › `initialization` › `should keep the last value when initialized from an object` | 40 | 5 節（後勝ち） |
| headers\_spec.ts | `initialization` › `should keep all values when initialized from a Headers object with duplicate headers` | 49 | 6 節（Set-Cookie） |
| headers\_spec.ts | `.delete` › `should delete only the exact matching string value`・`… from an array`・`should treat an empty string as a value to delete` | 158・168・178 | 3 節（f33ee95045a が足した） |
| headers\_spec.ts | `.append` › `should not mutate a materialized source` | 196 | 7 節（ff02a167495 が足した） |
| params\_spec.ts | `HttpUrlEncodedParams` › `lazy mutation` › `should allow deletion of one value of a … parameter`（3 つ） | 144・159・165 | 3 節（1 つだけ消す） |
| params\_spec.ts | `lazy mutation` › `should not mutate a materialized source when appending`・`… when deleting a value` | 75・150 | 7 節（ff02a167495 が足した） |

📄 `angular/packages/common/http/test/headers_spec.ts` L40–57 （▶ の行: 42–43, 46, 50–52, 56）

```ts
40 │     it('should keep the last value when initialized from an object', () => {
41 │       const headers = new HttpHeaders({
42 ▶         'foo': 'first',
43 ▶         'fOo': 'second',
44 │       });
45 │ 
46 ▶       expect(headers.getAll('foo')).toEqual(['second']);
47 │     });
48 │ 
49 │     it('should keep all values when initialized from a Headers object with duplicate headers', () => {
50 ▶       const standardHeaders = new Headers([
51 ▶         ['Set-Cookie', 'cookie1=foo'],
52 ▶         ['Set-Cookie', 'cookie2=bar'],
53 │       ]);
54 │       const headers = new HttpHeaders(standardHeaders);
55 │ 
56 ▶       expect(headers.getAll('Set-Cookie')).toEqual(['cookie1=foo', 'cookie2=bar']);
57 │     });
```

42〜46 行目は 5 節の後勝ちです（`keys()` の書き方までは確かめていません）。50〜56 行目は `Set-Cookie` の 2 つが分かれたまま届くことで、`X-Trace` のような普通のヘッダーで 1 本になる場合（#44149）は it がありません。

📄 `angular/packages/common/http/test/headers_spec.ts` L158–184 （▶ の行: 160, 163, 165, 173, 179, 181, 183）

```ts
158 │     it('should delete only the exact matching string value', () => {
159 │       const headers = new HttpHeaders({
160 ▶         'X-Scopes': ['tenant:alpha', 'tenant:alpha:archive'],
161 │       });
162 │ 
163 ▶       const updated = headers.delete('X-Scopes', 'tenant:alpha:archive');
164 │ 
165 ▶       expect(updated.getAll('X-Scopes')).toEqual(['tenant:alpha']);
166 │     });
167 │ 
168 │     it('should delete only exact matching values from an array', () => {
169 │       const headers = new HttpHeaders({
170 │         'X-Scopes': ['tenant:alpha', 'tenant:alpha:archive'],
171 │       });
172 │ 
173 ▶       const updated = headers.delete('X-Scopes', ['tenant:alpha:archive']);
174 │ 
175 │       expect(updated.getAll('X-Scopes')).toEqual(['tenant:alpha']);
176 │     });
177 │ 
178 │     it('should treat an empty string as a value to delete', () => {
179 ▶       const headers = new HttpHeaders({foo: ['', 'bar']});
180 │ 
181 ▶       const updated = headers.delete('foo', '');
182 │ 
183 ▶       expect(updated.getAll('foo')).toEqual(['bar']);
184 │     });
```

160 行目の `'tenant:alpha'` と `'tenant:alpha:archive'` がコミット本文の場面です。163 行目の文字列の delete で、直す前は 165 行目が `[]`（両方消える）になって落ちます。179〜183 行目は空文字で、直す前は名前ごと消えて `getAll` が `null` でした。

📄 `angular/packages/common/http/test/headers_spec.ts` L196–203 （▶ の行: 197–198, 200, 202）

```ts
196 │     it('should not mutate a materialized source', () => {
197 ▶       const source = new HttpHeaders().set('foo', 'bar');
198 ▶       expect(source.getAll('foo')).toEqual(['bar']);
199 │ 
200 ▶       const clone = source.append('foo', 'baz');
201 │       expect(clone.getAll('foo')).toEqual(['bar', 'baz']);
202 ▶       expect(source.getAll('foo')).toEqual(['bar']);
203 │     });
```

198 行目の `getAll` で写し元を先に実体化しておくのが要点です。これが無いと写し元の配列が共有されないので、直す前でも通ってしまいます。

📄 `angular/packages/common/http/test/params_spec.ts` L144–169 （▶ の行: 146–147, 151, 154, 156, 166–168）

```ts
144 │     it('should allow deletion of one value of a string parameter', () => {
145 │       const body = new HttpParams({fromString: 'a=1&a=2&a=3&a=4&a=5'});
146 ▶       const mutated = body.delete('a', '2').delete('a', '4');
147 ▶       expect(mutated.getAll('a')).toEqual(['1', '3', '5']);
148 │     });
149 │ 
150 │     it('should not mutate a materialized source when deleting a value', () => {
151 ▶       const source = new HttpParams().append('a', '1').append('a', '2');
152 │       expect(source.getAll('a')).toEqual(['1', '2']);
153 │ 
154 ▶       const clone = source.delete('a', '1');
155 │       expect(clone.getAll('a')).toEqual(['2']);
156 ▶       expect(source.getAll('a')).toEqual(['1', '2']);
157 │     });
158 │ 
159 │     it('should allow deletion of one value of a number parameter', () => {
160 │       const body = new HttpParams({fromString: 'a=0&a=1&a=2&a=3&a=4&a=5'});
161 │       const mutated = body.delete('a', 0).delete('a', 4);
162 │       expect(mutated.getAll('a')).toEqual(['1', '2', '3', '5']);
163 │     });
164 │ 
165 │     it('should allow deletion of one value of a boolean parameter', () => {
166 ▶       const body = new HttpParams({fromString: 'a=false&a=true&a=false'});
167 ▶       const mutated = body.delete('a', false);
168 ▶       expect(mutated.getAll('a')).toEqual(['true', 'false']);
169 │     });
```

166〜168 行目が「params の値つき delete は 1 つだけ」を決めている it です。`false` が 2 つあっても、消えるのは最初の 1 つで、`['true', 'false']` が残ります。ヘッダーと揃えたくてここを変えると、この it が落ちます。

### 手元で走らせた結果

../angular で `pnpm bazel test //packages/common/http/test:test --nocache_test_results --test_output=all --test_arg=--filter=HttpHeaders` は「24 specs, 0 failures」（1.2 秒、2026-11-06、scratchpad/httpx-logs/a-filter-headers.log）。headers\_spec.ts の it は 24 個で、ほかのファイルに名前が `HttpHeaders` を含む it はありません。全体（Node・Chromium・Firefox で 410 ずつ）は[第 1 回](01-httpx-request-options.md)のテストの節のとおり全部通りました。

同じ `--test_arg=--filter=HttpHeaders` を `//packages/common/http/test:test_web` に付けると、Chromium も Firefox も「410 passed, 0 failed」で、全部が走りました（4.9 秒、a-web-filter.log）。ブラウザの組（web test runner）には名前の絞り込みが届きません。1 つの it だけ走らせたいときは Node の `:test` を使います。

### 直すとしたら

- 2 節の `set(name, [])`：headers.ts の `applyUpdate` の 217〜219 行目を、`'s'` のときは「名前ごと消す」（または空の配列を入れる）にする形です。どちらにするかで `has` の答えが変わるので、コンストラクタの `{ name: [] }`（5 節）とどちらに揃えるかを決める必要があります。spec は headers\_spec.ts の `.set()`（98 行目の describe）に足します。
- 3 節の delete の数の違いは、spec が両方を決めているので「直す」ではなく振る舞いの変更です。
- #44149 は 6 節のとおり既存の動きを変えるので、ラベルが `breaking changes` です。この章の行だけでは決まらず、どのヘッダーを区切ってよいかの表が要ります。本家に PR や issue を出すことは勧めません。issue の全体は[第 6 回](06-httpx-tests-issues.md)です。

**本番ビルドでデモを動かした結果（2026-11-06）。**ヘッドレスの Chrome（HeadlessChrome/155.0.8043.0）で本番ビルドのこのページを開き、6 つの更新を順に積みました。ヘッダーは append で \['1','1','2','3'\]、set('X-TRACE','9') で \['9'\]、値つき delete で \['9'\]、set('x-trace', \[\]) で \['9'\] のまま、配列の append で \['9','a','b'\]、名前だけの delete で null と keys() が \[\] でした。keys() は名前だけの delete まで \['X-Trace'\] のままです。やり直してから値つき delete を 2 回押すと、ヘッダーは 1 回目で \['2'\]、パラメータは \['1','2'\] → \['2'\] でした。h0 と p0 は最後まで \['1','1','2'\] のままでした。送る形と受け取る形は、送ったヘッダーが {"X-Trace":"1,2,3",…}、受け取った X-Trace が \["1, 2"\]、Headers から作った Set-Cookie が \["a=1","b=2"\]、文字列から作った X-Trace が \["1","2"\] でした。/api/ への通信は 0 件、コンソールの警告とエラーは 0 件です（scratchpad/a-httpx/verify/verify.mjs、prod.json）。

## 聞かれそうな質問

**Q. `headers.delete('X-A', 'v')` と `params.delete('a', 'v')` は同じ動きですか？**

違います。ヘッダーは 236 行目の `filter` で同じ値を全部消し、パラメータは 343〜345 行目の `indexOf` と `splice(idx, 1)` で最初の 1 つだけ消します。どちらも spec で決まっています（headers\_spec.ts 158 行目、params\_spec.ts 165 行目）。

**Q. `delete('X-Scopes', 'tenant:alpha:archive')` で `tenant:alpha` まで消えたのはなぜですか？**

v22.2.0 の前は、文字列の `toDelete.indexOf(value)` が部分文字列の検索だったからです。f33ee95045a で 231 行目の配列にそろえる行が入り、236 行目は配列の中の完全一致になりました。22.1.6 の配布物にも入っています。

**Q. `headers.set('X-A', [])` でヘッダーは消えますか？**

消えません。217〜219 行目で空の配列は何もせずに return するので、前の値が残ります。消すなら `delete('X-A')` です。

**Q. 同じ名前の応答ヘッダーを別々に読めますか？**

fetch と XHR の応答ではできません（#44149）。ブラウザが先に `', '` でつないで渡すので、HttpHeaders には 1 つの値として入ります（5 節の 252 行目は 1 回しか呼ばれない）。`Set-Cookie` だけは仕様で別々ですが、ブラウザの応答では JavaScript から読めません。

**Q. インターセプタで共通の HttpParams に append すると、ほかの要求に残りますか？**

v22.2.0（と 22.1.6）では残りません。ff02a167495 で、読むときに値の配列を書き換える直前に `slice()` で写すようになりました（params.ts 342 行目など）。それより前は、写し元が実体化していると、その配列に push していました。

## 読み終えて

- 更新の 1 件は `{ name, value, op }` で、`op` の `'a'`・`'s'`・`'d'` ごとに当て方が違います。ヘッダーとパラメータは同じ形に見えて、規則は別々に書かれています。
- 値つきの delete はヘッダーが全部、パラメータが 1 つ。名前の大文字と小文字はヘッダーだけ区別しません。
- `set(name, [])` は何もしません。コンストラクタの `{ name: [] }` は空の値を持つヘッダーを作ります。
- 同じ名前のヘッダーは、送るときは `','`、受け取るときはブラウザが `', '` で 1 本にしています（#44149）。
- 2026 年 7 月の 2 本（f33ee95045a・ff02a167495）は、どちらも数行の src と、場面を作る spec の it（実体化してから読む、など）で直されています。

---

← 前: [HttpRequest の options：1 つずつ写す行と、最近の修正](01-httpx-request-options.md)  
次: [オーバーロードの型：observe と responseType で戻り値が決まるしくみ](03-httpx-overload-types.md) →
