[目次](../README.md) › [common の内側](README.md) › 第 3 回 / 全 20 回

# NgForOf と IterableDiffer：一覧の差分をビューに当てる

> NgForOf の ngDoCheck が IterableDiffers で differ を選び、diff の結果を \_applyChanges の forEachOperation で ViewContainerRef の createEmbeddedView・move・remove に直す行、trackBy と NgForOfContext（index・count・first・last・even・odd）、core の DefaultIterableDiffer の仕組み。@for との違い。ページの上で、本物の differ に一覧を渡して操作の列を見るデモ。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-ng-for-of)

---

`*ngFor` は、一覧が変わるたびに「どのビューを作り、どれを消し、どれを動かすか」を決めて `ViewContainerRef` に頼むディレクティブです。決めるのは NgForOf 自身ではなく、core の **`IterableDiffer`** です。この章では、NgForOf が `ngDoCheck` で differ を作って `diff` させ、返ってきた操作の列（`forEachOperation`）を `createEmbeddedView`・`move`・`remove` に直す行と、`DefaultIterableDiffer` が前と次の一覧を突き合わせる手順を、spec と同じ例で 1 手ずつ追います。最後に、本物の differ に一覧を渡して操作の列を表にします。

読む対象は `packages/common/src/directives/ng_for_of.ts` と、core の `packages/core/src/change_detection/differs/iterable_differs.ts`・`default_iterable_differ.ts` です（../angular、22.2.0-next.7、8576f161ae4）。`@for` が使う別の差分の取り方は [for-track](../template/01-for-track.md)、`ViewContainerRef` の中は [view-container](../template/04-view-container.md) で読みました。

1. [1. 全体像](01-cmn-overview.md)
2. [2. NgClass と NgStyle](02-cmn-ng-class-style.md)
3. **3. NgForOf**（この章）
4. [4. NgIf と NgSwitch](04-cmn-ng-if-switch.md)
5. [5. outlet](05-cmn-outlets.md)
6. [6. pipe の仕組み](06-cmn-pipe-mechanism.md)
7. [7. 小さな pipe](07-cmn-simple-pipes.md)
8. [8. KeyValuePipe](08-cmn-keyvalue-pipe.md)
9. [9. DatePipe](09-cmn-date-pipe.md)
10. [10. 日付の書式](10-cmn-format-date.md)
11. [11. 日付の部品](11-cmn-date-getters.md)
12. [12. 数の書式](12-cmn-format-number.md)
13. [13. NgOptimizedImage](13-cmn-image-overview.md)
14. [14. srcset と sizes](14-cmn-image-srcset.md)
15. [15. 画像のローダー](15-cmn-image-loaders.md)
16. [16. LCP と preload](16-cmn-image-lcp-preload.md)
17. [17. Location](17-cmn-location.md)
18. [18. テスト用の Location](18-cmn-location-testing.md)
19. [19. ViewportScroller](19-cmn-viewport-scroller.md)
20. [20. issue と PR を読む](20-cmn-issues.md)

## 1. 入力：値を覚えて「汚れた」印を立てるだけ

📄 `angular/packages/common/src/directives/ng_for_of.ts` L174–187 （▶ の行: 175, 184–186）

```ts
174 │ @Directive({
175 ▶   selector: '[ngFor][ngForOf]',
176 │ })
177 │ export class NgForOf<T, U extends NgIterable<T> = NgIterable<T>> implements DoCheck {
178 │   /**
179 │    * The value of the iterable expression, which can be used as a
180 │    * [template input variable](guide/directives/structural-directives#structural-directive-shorthand).
181 │    * @deprecated The `ngFor` directive is deprecated. Use the `@for` block instead.
182 │    */
183 │   @Input()
184 ▶   set ngForOf(ngForOf: (U & NgIterable<T>) | undefined | null) {
185 ▶     this._ngForOf = ngForOf;
186 ▶     this._ngForOfDirty = true;
187 │   }
```

175 行目のセレクタ `[ngFor][ngForOf]` は、`*ngFor="let x of items"` がコンパイラに `<ng-template ngFor let-x [ngForOf]="items">` と書き換えられたあとの形に当たります。185〜186 行目、`ngForOf` の setter は値を覚えて `_ngForOfDirty` を立てるだけです。この時点ではビューを作りません。

📄 `angular/packages/common/src/directives/ng_for_of.ts` L207–233 （▶ の行: 209–210, 215, 222–224, 230–232）

```ts
207 │   @Input()
208 │   set ngForTrackBy(fn: TrackByFunction<T>) {
209 ▶     if ((typeof ngDevMode === 'undefined' || ngDevMode) && fn != null && typeof fn !== 'function') {
210 ▶       console.warn(
211 │         `trackBy must be a function, but received ${JSON.stringify(fn)}. ` +
212 │           `See https://angular.dev/api/common/NgForOf#change-propagation for more information.`,
213 │       );
214 │     }
215 ▶     this._trackByFn = fn;
216 │   }
217 │ 
218 │   get ngForTrackBy(): TrackByFunction<T> {
219 │     return this._trackByFn;
220 │   }
221 │ 
222 ▶   private _ngForOf: U | undefined | null = null;
223 ▶   private _ngForOfDirty: boolean = true;
224 ▶   private _differ: IterableDiffer<T> | null = null;
225 │   // waiting for microsoft/typescript#43662 to allow the return type `TrackByFunction|undefined` for
226 │   // the getter
227 │   private _trackByFn!: TrackByFunction<T>;
228 │ 
229 │   constructor(
230 ▶     private _viewContainer: ViewContainerRef,
231 ▶     private _template: TemplateRef<NgForOfContext<T, U>>,
232 ▶     private _differs: IterableDiffers,
233 │   ) {}
```

209〜214 行目、開発モードでは `trackBy` に関数でないものを渡すと `console.warn` を出します（例外ではありません）。`null` と `undefined` は 209 行目の `fn != null` で警告の外です。230〜232 行目、コンストラクタで受け取るのは、ビューを入れる場所の `ViewContainerRef`、繰り返すテンプレートの `TemplateRef`、差分を取る道具の一覧 `IterableDiffers` の 3 つです。

## 2. ngDoCheck：differ は最初の 1 回だけ作る

📄 `angular/packages/common/src/directives/ng_for_of.ts` L253–284 （▶ の行: 254–255, 258, 263, 269, 271, 280–282）

```ts
253 │   ngDoCheck(): void {
254 ▶     if (this._ngForOfDirty) {
255 ▶       this._ngForOfDirty = false;
256 │       // React on ngForOf changes only once all inputs have been initialized
257 │       const value = this._ngForOf;
258 ▶       if (!this._differ && value) {
259 │         if (typeof ngDevMode === 'undefined' || ngDevMode) {
260 │           try {
261 │             // CAUTION: this logic is duplicated for production mode below, as the try-catch
262 │             // is only present in development builds.
263 ▶             this._differ = this._differs.find(value).create(this.ngForTrackBy);
264 │           } catch {
265 │             let errorMessage =
266 │               `Cannot find a differ supporting object '${value}' of type '` +
267 │               `${getTypeName(value)}'. NgFor only supports binding to Iterables, such as Arrays.`;
268 │             if (typeof value === 'object') {
269 ▶               errorMessage += ' Did you mean to use the keyvalue pipe?';
270 │             }
271 ▶             throw new RuntimeError(RuntimeErrorCode.NG_FOR_MISSING_DIFFER, errorMessage);
272 │           }
273 │         } else {
274 │           // CAUTION: this logic is duplicated for development mode above, as the try-catch
275 │           // is only present in development builds.
276 │           this._differ = this._differs.find(value).create(this.ngForTrackBy);
277 │         }
278 │       }
279 │     }
280 ▶     if (this._differ) {
281 ▶       const changes = this._differ.diff(this._ngForOf);
282 ▶       if (changes) this._applyChanges(changes);
283 │     }
284 │   }
```

1. **254〜255 行目：入力が変わったときだけ**

   setter が立てた印を見て、下ろします。256 行目のコメントのとおり、全部の入力が入ったあと（`ngDoCheck` の時点）で動くためです。
2. **258 行目：differ がまだなく、値があるとき**

   263 行目で `this._differs.find(value).create(this.ngForTrackBy)`。**trackBy はここで 1 回だけ differ に渡します**。あとから `ngForTrackBy` を変えても、作り済みの differ は前の関数のままです。
3. **264〜272 行目：扱えない値**

   開発モードでは `find` の例外を捕まえて言い直し、オブジェクトなら 269 行目で「keyvalue pipe のつもりでは？」を足して、271 行目で `NG_FOR_MISSING_DIFFER`（-2200）を投げます。
4. **280〜283 行目：毎回 diff**

   入力が変わっていなくても、differ があれば毎回 `diff` します。配列の中身を `push` で書き換えても、ここで拾えます。変化がなければ `null` が返り、何もしません。

📄 `angular/packages/core/src/change_detection/differs/iterable_differs.ts` L185–211 （▶ の行: 186, 198–199, 204, 207）

```ts
185 │ export function defaultIterableDiffersFactory() {
186 ▶   return new IterableDiffers([new DefaultIterableDifferFactory()]);
187 │ }
188 │ 
189 │ /**
190 │  * A repository of different iterable diffing strategies used by NgFor, NgClass, and others.
191 │  *
192 │  * @publicApi
193 │  */
194 │ export class IterableDiffers {
195 │   /** @nocollapse */
196 │   static ɵprov = /** @pureOrBreakMyCode */ /* @__PURE__ */ ɵɵdefineInjectable({
197 │     token: IterableDiffers,
198 ▶     providedIn: 'root',
199 ▶     factory: defaultIterableDiffersFactory,
200 │   });
201 │ 
202 │   constructor(private factories: IterableDifferFactory[]) {}
203 │ 
204 ▶   static create(factories: IterableDifferFactory[], parent?: IterableDiffers): IterableDiffers {
205 │     if (parent != null) {
206 │       const copied = parent.factories.slice();
207 ▶       factories = factories.concat(copied);
208 │     }
209 │ 
210 │     return new IterableDiffers(factories);
211 │   }
```

📄 `angular/packages/core/src/change_detection/differs/iterable_differs.ts` L246–260 （▶ の行: 247, 251）

```ts
246 │   find(iterable: any): IterableDifferFactory {
247 ▶     const factory = this.factories.find((f) => f.supports(iterable));
248 │     if (factory != null) {
249 │       return factory;
250 │     } else {
251 ▶       throw new RuntimeError(
252 │         RuntimeErrorCode.NO_SUPPORTING_DIFFER_FACTORY,
253 │         ngDevMode &&
254 │           `Cannot find a differ supporting object '${iterable}' of type '${getTypeNameForDebugging(
255 │             iterable,
256 │           )}'`,
257 │       );
258 │     }
259 │   }
260 │ }
```

198 行目、`IterableDiffers` も `providedIn: 'root'` で、既定は 186 行目の `DefaultIterableDifferFactory` 1 つです（NgStyle の `KeyValueDiffers` と同じ形。[第 2 回](02-cmn-ng-class-style.md)）。204〜211 行目の `create` は、親の一覧の前に自分の工場を足した新しい一覧を作ります。247 行目、前から順に `supports` を聞きます。

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L23–63 （▶ の行: 25, 33, 44, 46, 62）

```ts
23 │ export class DefaultIterableDifferFactory implements IterableDifferFactory {
24 │   supports(obj: Object | null | undefined): boolean {
25 ▶     return isListLikeIterable(obj);
26 │   }
27 │ 
28 │   create<V>(trackByFn?: TrackByFunction<V>): DefaultIterableDiffer<V> {
29 │     return new DefaultIterableDiffer<V>(trackByFn);
30 │   }
31 │ }
32 │ 
33 ▶ const trackByIdentity = (index: number, item: any) => item;
34 │ 
35 │ /**
36 │  * @deprecated v4.0.0 - Should not be part of public API.
37 │  * @publicApi
38 │  */
39 │ export class DefaultIterableDiffer<V> implements IterableDiffer<V>, IterableChanges<V> {
40 │   public readonly length: number = 0;
41 │   // TODO: confirm the usage of `collection` as it's unused, readonly and on a non public API.
42 │   public readonly collection!: V[] | Iterable<V> | null;
43 │   // Keeps track of the used records at any point in time (during & across `_check()` calls)
44 ▶   private _linkedRecords: _DuplicateMap<V> | null = null;
45 │   // Keeps track of the removed records at any point in time during `_check()` calls.
46 ▶   private _unlinkedRecords: _DuplicateMap<V> | null = null;
47 │   private _previousItHead: IterableChangeRecord_<V> | null = null;
48 │   private _itHead: IterableChangeRecord_<V> | null = null;
49 │   private _itTail: IterableChangeRecord_<V> | null = null;
50 │   private _additionsHead: IterableChangeRecord_<V> | null = null;
51 │   private _additionsTail: IterableChangeRecord_<V> | null = null;
52 │   private _movesHead: IterableChangeRecord_<V> | null = null;
53 │   private _movesTail: IterableChangeRecord_<V> | null = null;
54 │   private _removalsHead: IterableChangeRecord_<V> | null = null;
55 │   private _removalsTail: IterableChangeRecord_<V> | null = null;
56 │   // Keeps track of records where custom track by is the same, but item identity has changed
57 │   private _identityChangesHead: IterableChangeRecord_<V> | null = null;
58 │   private _identityChangesTail: IterableChangeRecord_<V> | null = null;
59 │   private _trackByFn: TrackByFunction<V>;
60 │ 
61 │   constructor(trackByFn?: TrackByFunction<V>) {
62 ▶     this._trackByFn = trackByFn || trackByIdentity;
63 │   }
```

25 行目の `isListLikeIterable` は「配列か、`Symbol.iterator` を持つオブジェクト（ただし `Map` は除く）」です（core の util/iterable.ts）。文字列はオブジェクトでないので扱えず、`Map` も外されます。`*ngFor` に `Map` を渡すと 2 節の「keyvalue pipe のつもりでは？」になるのはこのためです。33 行目、trackBy を渡さなければ `trackByIdentity`（要素そのものを鍵にする）です。44 行目の `_linkedRecords` と 46 行目の `_unlinkedRecords` は、鍵から記録を引く表で、同じ鍵の記録を何個でも持てます（4 節）。

## 3. diff と check：前の記録の列を、次の一覧で頭から直す

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L163–178 （▶ の行: 164–165, 173–174, 176）

```ts
163 │   diff(collection: NgIterable<V> | null | undefined): DefaultIterableDiffer<V> | null {
164 ▶     if (collection == null) collection = [];
165 ▶     if (!isListLikeIterable(collection)) {
166 │       throw new RuntimeError(
167 │         RuntimeErrorCode.INVALID_DIFFER_INPUT,
168 │         ngDevMode &&
169 │           `Error trying to diff '${stringify(collection)}'. Only arrays and iterables are allowed`,
170 │       );
171 │     }
172 │ 
173 ▶     if (this.check(collection)) {
174 ▶       return this;
175 │     } else {
176 ▶       return null;
177 │     }
178 │   }
```

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L182–208 （▶ の行: 183, 185, 195–198, 200, 202, 204, 207）

```ts
182 │   check(collection: NgIterable<V>): boolean {
183 ▶     this._reset();
184 │ 
185 ▶     let record: IterableChangeRecord_<V> | null = this._itHead;
186 │     let mayBeDirty: boolean = false;
187 │     let index: number;
188 │     let item: V;
189 │     let itemTrackBy: any;
190 │     if (Array.isArray(collection)) {
191 │       (this as Writable<this>).length = collection.length;
192 │ 
193 │       for (let index = 0; index < this.length; index++) {
194 │         item = collection[index];
195 ▶         itemTrackBy = this._trackByFn(index, item);
196 ▶         if (record === null || !Object.is(record.trackById, itemTrackBy)) {
197 ▶           record = this._mismatch(record, item, itemTrackBy, index);
198 ▶           mayBeDirty = true;
199 │         } else {
200 ▶           if (mayBeDirty) {
201 │             // TODO(misko): can we limit this to duplicates only?
202 ▶             record = this._verifyReinsertion(record, item, itemTrackBy, index);
203 │           }
204 ▶           if (!Object.is(record.item, item)) this._addIdentityChange(record, item);
205 │         }
206 │ 
207 ▶         record = record._next;
208 │       }
```

> [!TIP]
> **新卒エンジニアへ**
>
> 「記録」（`IterableChangeRecord_`）は、一覧の要素 1 つにつき 1 つある小さなオブジェクトで、要素・鍵（`trackById`）・前の位置（`previousIndex`）・今の位置（`currentIndex`）と、いくつもの連結リストのポインタを持ちます。differ は前回の記録を捨てずに使い回し、「今回どう変わったか」をポインタのつなぎ替えで表します。

164 行目、`null` は空の配列として扱います（全部消える）。`check` は「前回の記録の連結リスト」（`_itHead` から）を、次の一覧で頭から 1 つずつ直していきます。

1. **183 行目：前回の変化を片付ける**

   `_reset` で、前回の追加・移動の `currentIndex` を `previousIndex` に写し、リストを空にします。
2. **195 行目：鍵を出す**

   `trackBy(index, item)`。既定なら要素そのものです。
3. **196〜198 行目：その位置の記録と鍵が違う**

   `_mismatch`（4 節）で、その位置に正しい記録を持ってきます。一度でも食い違ったら `mayBeDirty` を立てます。
4. **200〜203 行目：鍵は合っているが、前で食い違いがあった**

   `_verifyReinsertion` で、重複した鍵の取り違えと、位置のずれを直します（4 節）。
5. **204 行目：鍵は同じだが要素が別のオブジェクト**

   trackBy で追っているときに起きます。`_addIdentityChange` で「同じ記録、新しい要素」として印を付けます。

## 4. \_mismatch：消した記録・後ろの記録・新しい記録

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L296–334 （▶ の行: 298–299, 301, 303, 307, 313, 316, 323, 326）

```ts
296 │     let previousRecord: IterableChangeRecord_<V> | null;
297 │ 
298 ▶     if (record === null) {
299 ▶       previousRecord = this._itTail;
300 │     } else {
301 ▶       previousRecord = record._prev;
302 │       // Remove the record from the collection since we know it does not match the item.
303 ▶       this._remove(record);
304 │     }
305 │ 
306 │     // See if we have evicted the item, which used to be at some anterior position of _itHead list.
307 ▶     record = this._unlinkedRecords === null ? null : this._unlinkedRecords.get(itemTrackBy, null);
308 │     if (record !== null) {
309 │       // It is an item which we have evicted earlier: reinsert it back into the list.
310 │       // But first we need to check if identity changed, so we can update in view if necessary.
311 │       if (!Object.is(record.item, item)) this._addIdentityChange(record, item);
312 │ 
313 ▶       this._reinsertAfter(record, previousRecord, index);
314 │     } else {
315 │       // Attempt to see if the item is at some posterior position of _itHead list.
316 ▶       record = this._linkedRecords === null ? null : this._linkedRecords.get(itemTrackBy, index);
317 │       if (record !== null) {
318 │         // We have the item in _itHead at/after `index` position. We need to move it forward in the
319 │         // collection.
320 │         // But first we need to check if identity changed, so we can update in view if necessary.
321 │         if (!Object.is(record.item, item)) this._addIdentityChange(record, item);
322 │ 
323 ▶         this._moveAfter(record, previousRecord, index);
324 │       } else {
325 │         // It is a new item: add it.
326 ▶         record = this._addAfter(
327 │           new IterableChangeRecord_<V>(item, itemTrackBy),
328 │           previousRecord,
329 │           index,
330 │         );
331 │       }
332 │     }
333 │     return record;
334 │   }
```

1. **298〜304 行目：その位置にあった記録をいったん外す**

   303 行目の `_remove` は、記録を連結リストから外して「消した」リストと `_unlinkedRecords` に入れます。この時点では「消える候補」です。
2. **307〜313 行目：前に外した記録の中にあるか**

   `_unlinkedRecords.get(鍵, null)` で見つかれば、313 行目の `_reinsertAfter` で今の位置に戻します（「消した」リストからも抜けます）。
3. **316〜323 行目：後ろにまだ残っている記録か**

   `_linkedRecords.get(鍵, index)` は「今の位置かそれより後ろ」にある同じ鍵の記録を探します。見つかれば 323 行目の `_moveAfter` で前に引っ張ってきます。
4. **326〜330 行目：どこにもない**

   新しい記録を作って「足した」リストに入れます。

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L662–675 （▶ の行: 664, 668–669）

```ts
662 │   // Returns a IterableChangeRecord_ having IterableChangeRecord_.trackById == trackById and
663 │   // IterableChangeRecord_.currentIndex >= atOrAfterIndex
664 ▶   get(trackById: any, atOrAfterIndex: number | null): IterableChangeRecord_<V> | null {
665 │     let record: IterableChangeRecord_<V> | null;
666 │     for (record = this._head; record !== null; record = record._nextDup) {
667 │       if (
668 ▶         (atOrAfterIndex === null || atOrAfterIndex <= record.currentIndex!) &&
669 ▶         Object.is(record.trackById, trackById)
670 │       ) {
671 │         return record;
672 │       }
673 │     }
674 │     return null;
675 │   }
```

同じ鍵の記録は、鍵ごとの小さな連結リスト（`_DuplicateItemRecordList`）に入っています。668 行目、`atOrAfterIndex` より前にある記録は「もう使った」とみなして飛ばします。`['a', 'b', 'a']` のような重複を正しく扱うための仕組みです。

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L363–396 （▶ の行: 369, 372–375, 387, 389, 391, 395）

```ts
363 │   _verifyReinsertion(
364 │     record: IterableChangeRecord_<V>,
365 │     item: V,
366 │     itemTrackBy: any,
367 │     index: number,
368 │   ): IterableChangeRecord_<V> {
369 ▶     let reinsertRecord: IterableChangeRecord_<V> | null =
370 │       this._unlinkedRecords === null ? null : this._unlinkedRecords.get(itemTrackBy, null);
371 │     if (reinsertRecord !== null) {
372 ▶       record = this._reinsertAfter(reinsertRecord, record._prev!, index);
373 ▶     } else if (record.currentIndex != index) {
374 ▶       record.currentIndex = index;
375 ▶       this._addToMoves(record, index);
376 │     }
377 │     return record;
378 │   }
379 │ 
380 │   /**
381 │    * Get rid of any excess {@link IterableChangeRecord_}s from the previous collection
382 │    *
383 │    * - `record` The first excess {@link IterableChangeRecord_}.
384 │    *
385 │    * @internal
386 │    */
387 ▶   _truncate(record: IterableChangeRecord_<V> | null) {
388 │     // Anything after that needs to be removed;
389 ▶     while (record !== null) {
390 │       const nextRecord: IterableChangeRecord_<V> | null = record._next;
391 ▶       this._addToRemovals(this._unlink(record));
392 │       record = nextRecord;
393 │     }
394 │     if (this._unlinkedRecords !== null) {
395 ▶       this._unlinkedRecords.clear();
396 │     }
```

`_verifyReinsertion` は、鍵が合っていても、同じ鍵の記録が先に外されていたら（369 行目）そちらを戻し、位置がずれていれば（373 行目）「移動」に入れます。このメソッドの上のコメントにある `[a, a] → [b, a, a]` が典型で、デモの「重複」のボタンで「b を作る」1 手だけになるのを見られます。387 行目からの `_truncate` は、次の一覧をなめ終えたあとに残った記録を全部「消した」に入れ（391 行目）、395 行目で `_unlinkedRecords` を空にします。ここで初めて「消える候補」が「消える」に決まります。

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L547–566 （▶ の行: 551–552, 555, 562）

```ts
547 │   _addToMoves(record: IterableChangeRecord_<V>, toIndex: number): IterableChangeRecord_<V> {
548 │     // TODO(vicb):
549 │     // assert(record._nextMoved === null);
550 │ 
551 ▶     if (record.previousIndex === toIndex) {
552 ▶       return record;
553 │     }
554 │ 
555 ▶     if (this._movesTail === null) {
556 │       // TODO(vicb):
557 │       // assert(_movesHead === null);
558 │       this._movesTail = this._movesHead = record;
559 │     } else {
560 │       // TODO(vicb):
561 │       // assert(_movesTail._nextMoved === null);
562 ▶       this._movesTail = this._movesTail._nextMoved = record;
563 │     }
564 │ 
565 │     return record;
566 │   }
```

551〜553 行目、戻した位置が前回と同じなら「移動」には入れません。

### spec と同じ例を 1 手ずつ

前の一覧 `[0, 1, 2, 3, 4, 5]`、次の一覧 `[6, 2, 7, 0, 4, 8]` を、trackBy なしで `check` したときの動きです（7 節の spec と同じ例。デモの最初のボタン）。

| index | 次の要素 | その位置の記録 | 何が起きたか |
| --- | --- | --- | --- |
| 0 | 6 | 0 | 食い違い。0 を外す（候補）。6 はどこにもない → 足す |
| 1 | 2 | 1 | 食い違い。1 を外す。2 は後ろにある → `_moveAfter` で index 1 へ |
| 2 | 7 | 3 | 食い違い。3 を外す。7 は新しい → 足す |
| 3 | 0 | 4 | 食い違い。4 を外す。0 は外した中にある → `_reinsertAfter` で index 3 へ（移動） |
| 4 | 4 | 5 | 食い違い。5 を外す。4 は外した中にある → index 4 へ戻す（前回も 4 なので 551 行目で移動にしない） |
| 5 | 8 | なし | 新しい → 足す |
| 終わり |   |   | `_truncate`。外したまま戻らなかった 1・3・5 が「消した」に決まる |

結果は、足した 6・7・8、移動 2（2 → 1）と 0（0 → 3）、消した 1・3・5 です。

## 5. forEachOperation：記録を「その場の index」に直す

📄 `angular/packages/core/src/change_detection/differs/iterable_differs.ts` L52–74 （▶ の行: 56–58, 61–63, 65–66）

```ts
52 │   /**
53 │    * Iterate over a set of operations which when applied to the original `Iterable` will produce the
54 │    * new `Iterable`.
55 │    *
56 ▶    * NOTE: These are not necessarily the actual operations which were applied to the original
57 ▶    * `Iterable`, rather these are a set of computed operations which may not be the same as the
58 ▶    * ones applied.
59 │    *
60 │    * @param record A change which needs to be applied
61 ▶    * @param previousIndex The `IterableChangeRecord#previousIndex` of the `record` refers to the
62 ▶    *        original `Iterable` location, where as `previousIndex` refers to the transient location
63 ▶    *        of the item, after applying the operations up to this point.
64 │    * @param currentIndex The `IterableChangeRecord#currentIndex` of the `record` refers to the
65 ▶    *        original `Iterable` location, where as `currentIndex` refers to the transient location
66 ▶    *        of the item, after applying the operations up to this point.
67 │    */
68 │   forEachOperation(
69 │     fn: (
70 │       record: IterableChangeRecord<V>,
71 │       previousIndex: number | null,
72 │       currentIndex: number | null,
73 │     ) => void,
74 │   ): void;
```

56〜58 行目のとおり、ここで渡す操作は「実際に起きた操作」ではなく、**前の一覧に順に当てていくと次の一覧になる**操作の列です。61〜66 行目、渡す `previousIndex` と `currentIndex` は、記録が持つ「前の一覧での位置」「次の一覧での位置」ではなく、**それまでの操作を当てたあとの、その場の位置**です。ビューを 1 つずつ動かす `ViewContainerRef` にとって必要なのは、この「その場の位置」です。

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L79–101 （▶ の行: 79–82, 85–87, 89, 92, 96–98, 101）

```ts
 79 ▶     let nextIt = this._itHead;
 80 ▶     let nextRemove = this._removalsHead;
 81 ▶     let addRemoveOffset = 0;
 82 ▶     let moveOffsets: number[] | null = null;
 83 │     while (nextIt || nextRemove) {
 84 │       // Figure out which is the next record to process
 85 ▶       // Order: remove, add, move
 86 ▶       const record: IterableChangeRecord<V> =
 87 ▶         !nextRemove ||
 88 │         (nextIt &&
 89 ▶           nextIt.currentIndex! < getPreviousIndex(nextRemove, addRemoveOffset, moveOffsets))
 90 │           ? nextIt!
 91 │           : nextRemove;
 92 ▶       const adjPreviousIndex = getPreviousIndex(record, addRemoveOffset, moveOffsets);
 93 │       const currentIndex = record.currentIndex;
 94 │ 
 95 │       // consume the item, and adjust the addRemoveOffset and update moveDistance if necessary
 96 ▶       if (record === nextRemove) {
 97 ▶         addRemoveOffset--;
 98 ▶         nextRemove = nextRemove._nextRemoved;
 99 │       } else {
100 │         nextIt = nextIt!._next;
101 ▶         if (record.previousIndex == null) {
```

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L102–126 （▶ の行: 102, 104, 106–107, 112–113, 117, 122–123）

```ts
102 ▶           addRemoveOffset++;
103 │         } else {
104 ▶           // INVARIANT:  currentIndex < previousIndex
105 │           if (!moveOffsets) moveOffsets = [];
106 ▶           const localMovePreviousIndex = adjPreviousIndex - addRemoveOffset;
107 ▶           const localCurrentIndex = currentIndex! - addRemoveOffset;
108 │           if (localMovePreviousIndex != localCurrentIndex) {
109 │             for (let i = 0; i < localMovePreviousIndex; i++) {
110 │               const offset = i < moveOffsets.length ? moveOffsets[i] : (moveOffsets[i] = 0);
111 │               const index = offset + i;
112 ▶               if (localCurrentIndex <= index && index < localMovePreviousIndex) {
113 ▶                 moveOffsets[i] = offset + 1;
114 │               }
115 │             }
116 │             const previousIndex = record.previousIndex;
117 ▶             moveOffsets[previousIndex] = localCurrentIndex - localMovePreviousIndex;
118 │           }
119 │         }
120 │       }
121 │ 
122 ▶       if (adjPreviousIndex !== currentIndex) {
123 ▶         fn(record, adjPreviousIndex, currentIndex);
124 │       }
125 │     }
126 │   }
```

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L759–771 （▶ の行: 765, 767–768, 770）

```ts
759 │ function getPreviousIndex(
760 │   item: any,
761 │   addRemoveOffset: number,
762 │   moveOffsets: number[] | null,
763 │ ): number {
764 │   const previousIndex = item.previousIndex;
765 ▶   if (previousIndex === null) return previousIndex;
766 │   let moveOffset = 0;
767 ▶   if (moveOffsets && previousIndex < moveOffsets.length) {
768 ▶     moveOffset = moveOffsets[previousIndex];
769 │   }
770 ▶   return previousIndex + addRemoveOffset + moveOffset;
771 │ }
```

1. **79〜80 行目：2 本の列を同時に読む**

   `_itHead` から始まる「次の一覧の並び」と、`_removalsHead` から始まる「消した」列です。
2. **81〜82 行目：2 つの補正**

   `addRemoveOffset` はここまでに足した数から消した数を引いたもの、`moveOffsets` は移動でずれた分を、前の一覧の位置ごとに覚える配列です。
3. **86〜91 行目：次にどちらを出すか**

   次の並びの記録の `currentIndex` が、消す記録の「その場の位置」より小さければ並びの記録、そうでなければ消す記録を先にします。85 行目のコメントの「remove, add, move」の順になります。
4. **92 行目と 770 行目：その場の位置**

   `getPreviousIndex` は「前の位置 + addRemoveOffset + その位置の moveOffset」です。足した記録は 765 行目で `null`。
5. **96〜98 行目：消すなら**

   この先の位置が 1 つ前にずれるので `addRemoveOffset--`。
6. **101〜102 行目：足すなら**

   `addRemoveOffset++`。
7. **104〜118 行目：動かすなら**

   104 行目のコメントのとおり、移動は必ず「後ろから前へ」です。動いた範囲にある前の位置の `moveOffsets` を 1 ずつ増やし（112〜113 行目）、動いた記録自身の分を 117 行目で覚えます。
8. **122〜124 行目：位置が変わらなければ呼ばない**

   その場の位置と次の位置が同じなら、操作として出しません。上の例の 0 は「移動」に入っていますが、2 を前に、7 を足し、1・3 を消したあとでは、その場の位置がもう 3 なので、ここで飛ばされます。

## 6. \_applyChanges：操作をビューの出し入れに直す

📄 `angular/packages/common/src/directives/ng_for_of.ts` L286–325 （▶ の行: 288, 294, 298, 300–301, 303–308, 313, 316–318, 321, 323）

```ts
286 │   private _applyChanges(changes: IterableChanges<T>) {
287 │     const viewContainer = this._viewContainer;
288 ▶     changes.forEachOperation(
289 │       (
290 │         item: IterableChangeRecord<T>,
291 │         adjustedPreviousIndex: number | null,
292 │         currentIndex: number | null,
293 │       ) => {
294 ▶         if (item.previousIndex == null) {
295 │           // NgForOf is never "null" or "undefined" here because the differ detected
296 │           // that a new item needs to be inserted from the iterable. This implies that
297 │           // there is an iterable value for "_ngForOf".
298 ▶           viewContainer.createEmbeddedView(
299 │             this._template,
300 ▶             new NgForOfContext<T, U>(item.item, this._ngForOf!, -1, -1),
301 ▶             currentIndex === null ? undefined : currentIndex,
302 │           );
303 ▶         } else if (currentIndex == null) {
304 ▶           viewContainer.remove(adjustedPreviousIndex === null ? undefined : adjustedPreviousIndex);
305 ▶         } else if (adjustedPreviousIndex !== null) {
306 ▶           const view = viewContainer.get(adjustedPreviousIndex)!;
307 ▶           viewContainer.move(view, currentIndex);
308 ▶           applyViewChange(view as EmbeddedViewRef<NgForOfContext<T, U>>, item);
309 │         }
310 │       },
311 │     );
312 │ 
313 ▶     for (let i = 0, ilen = viewContainer.length; i < ilen; i++) {
314 │       const viewRef = <EmbeddedViewRef<NgForOfContext<T, U>>>viewContainer.get(i);
315 │       const context = viewRef.context;
316 ▶       context.index = i;
317 ▶       context.count = ilen;
318 ▶       context.ngForOf = this._ngForOf!;
319 │     }
320 │ 
321 ▶     changes.forEachIdentityChange((record: any) => {
322 │       const viewRef = <EmbeddedViewRef<NgForOfContext<T, U>>>viewContainer.get(record.currentIndex);
323 ▶       applyViewChange(viewRef, record);
324 │     });
325 │   }
```

1. **294〜302 行目：previousIndex が null なら作る**

   記録の `previousIndex`（前の一覧にいなかった）を見て、`createEmbeddedView` でテンプレートからビューを作り、その場の位置 `currentIndex` に入れます。300 行目、文脈の `index` と `count` はひとまず `-1` です。
2. **303〜304 行目：currentIndex が null なら消す**

   その場の位置 `adjustedPreviousIndex` のビューを `remove` します（ビューは破棄されます）。
3. **305〜308 行目：どちらでもなければ動かす**

   その場の位置のビューを取り出して `move` し、308 行目で文脈の `$implicit` を新しい要素にします。ビューは作り直しません。
4. **313〜319 行目：全部のビューの文脈を直す**

   操作が 1 つでもあれば、全部のビューの `index`・`count`・`ngForOf` を書き直します。`first`・`last` などは 7 節の getter なので、ここで決まります。
5. **321〜324 行目：identity change**

   鍵は同じで要素だけ別のオブジェクトになった記録は、操作の列に出ないことがあるので、ここで `$implicit` を差し替えます。trackBy でビューを残したまま中身だけ新しくできるのはこの行のおかげです。

📄 `angular/packages/common/src/directives/ng_for_of.ts` L341–355 （▶ の行: 344, 350）

```ts
341 │ // Also export the `NgForOf` class as `NgFor` to improve the DX for
342 │ // cases when the directive is used as standalone, so the class name
343 │ // matches the CSS selector (*ngFor).
344 ▶ export {NgForOf as NgFor};
345 │ 
346 │ function applyViewChange<T>(
347 │   view: EmbeddedViewRef<NgForOfContext<T>>,
348 │   record: IterableChangeRecord<T>,
349 │ ) {
350 ▶   view.context.$implicit = record.item;
351 │ }
352 │ 
353 │ function getTypeName(type: any): string {
354 │   return type['name'] || typeof type;
355 │ }
```

350 行目、ビューに対してするのは文脈の `$implicit` の差し替えだけです。344 行目が [第 1 回](01-cmn-overview.md)で見た `NgFor` という別名です。

## 7. NgForOfContext：index と count から決まる getter

📄 `angular/packages/common/src/directives/ng_for_of.ts` L33–71 （▶ の行: 36, 43, 46, 49, 54, 59, 64, 69）

```ts
33 │ export class NgForOfContext<T, U extends NgIterable<T> = NgIterable<T>> {
34 │   constructor(
35 │     /** Reference to the current item from the collection. */
36 ▶     public $implicit: T,
37 │ 
38 │     /**
39 │      * The value of the iterable expression. Useful when the expression is
40 │      * more complex then a property access, for example when using the async pipe
41 │      * (`userStreams | async`).
42 │      */
43 ▶     public ngForOf: U,
44 │ 
45 │     /** Returns an index of the current item in the collection. */
46 ▶     public index: number,
47 │ 
48 │     /** Returns total amount of items in the collection. */
49 ▶     public count: number,
50 │   ) {}
51 │ 
52 │   // Indicates whether this is the first item in the collection.
53 │   get first(): boolean {
54 ▶     return this.index === 0;
55 │   }
56 │ 
57 │   // Indicates whether this is the last item in the collection.
58 │   get last(): boolean {
59 ▶     return this.index === this.count - 1;
60 │   }
61 │ 
62 │   // Indicates whether an index of this item in the collection is even.
63 │   get even(): boolean {
64 ▶     return this.index % 2 === 0;
65 │   }
66 │ 
67 │   // Indicates whether an index of this item in the collection is odd.
68 │   get odd(): boolean {
69 ▶     return !this.even;
70 │   }
71 │ }
```

テンプレートの `let item` は 36 行目の `$implicit`、`let i = index` は 46 行目、`let n = count` は 49 行目を読みます。`first`（54 行目）・`last`（59 行目）・`even`（64 行目）・`odd`（69 行目）はフィールドではなく getter で、6 節の 316〜317 行目で書いた `index` と `count` から毎回計算します。テンプレートの型の検査で文脈がこの型になる仕組み（`ngTemplateContextGuard`）は [typecheck-template-guards](../typecheck/14-typecheck-template-guards.md) で読みました。

## 8. @for との違い

`@for (item of items; track item.id)` は NgForOf を使いません。コンパイラが `ɵɵrepeater` の命令にし、core の `list_reconciliation.ts` が両端から詰める別の方法で差を取ります（[for-track](../template/01-for-track.md)）。違いを並べます。

|   | `*ngFor`（NgForOf） | `@for` |
| --- | --- | --- |
| 差を取るもの | `IterableDiffers` から作る `DefaultIterableDiffer`（差し替えられる） | core の `reconcile`（差し替えられない） |
| 鍵 | `trackBy` は任意。なければ要素そのもの | `track` は必須 |
| いつ | 毎回の `ngDoCheck` で `diff`（中身の書き換えも拾う） | 式の値が変わったとき |
| 文脈 | `NgForOfContext`（`index`・`count` を全部書き直す） | `$index`・`$count` などの組み込みの変数 |
| 状態 | v20 から deprecated（`NgForOfContext` と `NgForOf` の doc コメントに `@deprecated 20.0`） | 推奨 |

deprecated の文言は 2026-04 の commit 28d38b582cc（refactor(common): update deprecation message）で「v22 で消す予定」から「将来のメジャーで消す予定」に変わりました。v22 ではまだ消えません。書き換えのマイグレーションは [mig-control-flow](../mig/12-mig-control-flow.md) です。

## 9. 動かして確かめる

> **🧪 DEMO — 本物の IterableDiffer が出す操作の列**
>
> このページの本物の `IterableDiffers`（`@angular/core` 22.1.6）から `find(前の一覧).create(trackBy)` で differ を作り、前の一覧と次の一覧を順に `diff` させて、`forEachOperation` が渡す値を表にします。「画面の並び」の列は、`NgForOf._applyChanges` と同じ分け方（作る・消す・動かす）で配列を 1 手ずつ書き換えたものです（この部分はデモのための移植です）。要素は空白かカンマで区切ります。「: の前」で追うと `1:red` の `1` を鍵にします。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-ng-for-of)

デモで確かめられることです（2026-11-05 に headless Chrome で、開発ビルドで記録）。

1. **spec と同じ例**

   作る 6 → 動かす 2（その場の 3 → 1）→ 作る 7 → 消す 1（4）→ 消す 3（4）→ 消す 5（5）→ 作る 8 の 7 手で、spec の 402〜410 行目の期待とまったく同じです。記録の `previousIndex` が 2 の「2」を、その場の位置 3 から動かしている（先頭に 6 が入ったぶん 1 つずれた）のが見えます。
2. **先頭に足す**

   「作る x」の 1 手だけ。後ろの a・b・c は動きません。
3. **最後を先頭へ**

   「動かす d（3 → 0）」の 1 手だけ。
4. **先頭を最後へ**

   「動かす b」「動かす c」「動かす d」の 3 手になります。4 節の `_mismatch` は「後ろにある記録を前に引っ張る」（316〜323 行目）ので、a を後ろへ 1 回動かす代わりに、b・c・d を 1 つずつ前に動かします。
5. **重複（a a → b a a）**

   「作る b」の 1 手だけ。`_verifyReinsertion` が無いと、a の入れ替えに見えてしまう場合です。
6. **key で追う**

   `1:red 2:blue` → `2:green 1:red` は「動かす 2:green」の 1 手と、`forEachIdentityChange` の 2:green です。ビューは作り直さず、`$implicit` だけが新しい文字列になります。
7. **key なし**

   同じ一覧を要素そのもので追うと、`2:blue` と `2:green` は別物なので「作る 2:green」「消す 2:blue」になり、ビューが作り直されます。
8. **index で追う**

   `a b c d` → `e f h` は「消す d」の 1 手と、identity change の e・f・h です。位置で追うと、要素が全部変わってもビューは作り直しません（spec の `should handle added and removed items properly when tracking by index` と同じ形）。

## ここまでの呼び出し

- 👤 `*ngFor="let item of items; trackBy: fn"`
  - `NgForOf.ngForOf = items` — ng\_for\_of.ts L184 — *\_ngForOfDirty = true*
  - `NgForOf.ngDoCheck()` — ng\_for\_of.ts L253
    - `IterableDiffers.find(items).create(trackBy)` — iterable\_differs.ts L246 / default\_iterable\_differ.ts L28 — *最初の 1 回だけ*
    - `DefaultIterableDiffer.diff(items) → check` — default\_iterable\_differ.ts L163 / L182
      - `_mismatch / _verifyReinsertion / _truncate` — L296 / L363 / L387 — *足す・動かす・消すの記録*
    - `NgForOf._applyChanges(changes)` — ng\_for\_of.ts L286
      - `changes.forEachOperation(...)` — default\_iterable\_differ.ts L79 — *その場の位置に直して渡す*
        - `viewContainer.createEmbeddedView / remove / move` — ng\_for\_of.ts L298 / L304 / L307 — *[view-container](../template/04-view-container.md)*
      - `context.index / count / ngForOf を全部書き直す` — ng\_for\_of.ts L313
      - `forEachIdentityChange → applyViewChange` — ng\_for\_of.ts L321 / L346

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| common/test/directives/ng\_for\_spec.ts | describe `ngFor`（18 行目、it 34）。中に describe `track by`（310）。`should reflect a mix of all changes (additions/removals/moves)`（70）・`should works with duplicates`（145）・`should console.warn if trackBy is not a function`（311）など | `//packages/common/test:test`（Node） |
| core/test/change\_detection/differs/default\_iterable\_differ\_spec.ts・iterable\_differs\_spec.ts | describe `iterable differ`（37 行目）の `DefaultIterableDiffer`（38）・`forEachOperation`（348）・`diff`（533）・`trackBy function by id`（559）・`trackBy function by index`（733）。describe `IterableDiffers`（iterable\_differs\_spec.ts 19 行目） | `//packages/core/test:test`（Node、4 つの shard） |

📄 `angular/packages/core/test/change_detection/differs/default_iterable_differ_spec.ts` L389–413 （▶ の行: 390–391, 393–394, 397–398, 402, 404, 412）

```ts
389 │       it('should trigger a series of insert/move/remove changes for inputs that have been diffed', () => {
390 ▶         const startData = [0, 1, 2, 3, 4, 5];
391 ▶         const endData = [6, 2, 7, 0, 4, 8];
392 │ 
393 ▶         differ = differ.diff(startData)!;
394 ▶         differ = differ.diff(endData)!;
395 │ 
396 │         const operations: string[] = [];
397 ▶         differ.forEachOperation((item: any, prev: number | null, next: number | null) => {
398 ▶           const value = modifyArrayUsingOperation(startData, endData, prev, next);
399 │           operations.push(stringifyItemChange(item, prev, next, item.previousIndex));
400 │         });
401 │ 
402 ▶         expect(operations).toEqual([
403 │           'INSERT 6 (VOID -> 0)',
404 ▶           'MOVE 2 (3 -> 1) [o=2]',
405 │           'INSERT 7 (VOID -> 2)',
406 │           'REMOVE 1 (4 -> VOID) [o=1]',
407 │           'REMOVE 3 (4 -> VOID) [o=3]',
408 │           'REMOVE 5 (5 -> VOID) [o=5]',
409 │           'INSERT 8 (VOID -> 5)',
410 │         ]);
411 │ 
412 ▶         expect(startData).toEqual(endData);
413 │       });
```

393〜394 行目で 2 回 `diff` し、397〜400 行目で操作を 1 つずつ前の配列に当て（`modifyArrayUsingOperation` は NgForOf の 3 つの分かれ道と同じ `splice` をする spec の中の関数）、412 行目で「当て終えたら次の一覧と同じ」を確かめています。デモの「画面の並び」の列は、これと同じことをしています。404 行目の `[o=2]` が記録の `previousIndex`、`(3 -> 1)` がその場の位置です。

📄 `angular/packages/common/test/directives/ng_for_spec.ts` L357–383 （▶ の行: 358, 361, 364–365, 378–380, 382）

```ts
357 │     it('should update implicit local variable on view', () => {
358 ▶       const template = `<div *ngFor="let item of items; trackBy: trackById">{{item['color']}}</div>`;
359 │       fixture = createTestComponent(template);
360 │ 
361 ▶       getComponent().items = [{'id': 'a', 'color': 'blue'}];
362 │       detectChangesAndExpectText('blue');
363 │ 
364 ▶       getComponent().items = [{'id': 'a', 'color': 'red'}];
365 ▶       detectChangesAndExpectText('red');
366 │     });
367 │ 
368 │     it('should move items around and keep them updated ', () => {
369 │       const template = `<div *ngFor="let item of items; trackBy: trackById">{{item['color']}}</div>`;
370 │       fixture = createTestComponent(template);
371 │ 
372 │       getComponent().items = [
373 │         {'id': 'a', 'color': 'blue'},
374 │         {'id': 'b', 'color': 'yellow'},
375 │       ];
376 │       detectChangesAndExpectText('blueyellow');
377 │ 
378 ▶       getComponent().items = [
379 ▶         {'id': 'b', 'color': 'orange'},
380 ▶         {'id': 'a', 'color': 'red'},
381 │       ];
382 ▶       detectChangesAndExpectText('orangered');
383 │     });
```

361 行目と 364 行目で同じ `id` の別のオブジェクトを渡し、365 行目で文字が `red` に変わることを見ています。6 節の 321〜324 行目の identity change の確認です。378〜382 行目は、並べ替えと中身の変更を同時にしても正しく出ることを見ています。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/common/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=^ngFor '
pnpm bazel test //packages/core/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=^(iterable differ|IterableDiffers) '
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/cmn-logs/a-ngfor.log・a-it-differ.log）`

```
# common（ng_for_spec.ts の 34 件）
Ran 34 of 667 specs
34 specs, 0 failures
//packages/common/test:test                                              PASSED in 0.9s
# core（4 つの shard。9 + 11 + 9 + 9 = 38 件）
Ran 9 of 1372 specs
Ran 11 of 1374 specs
Ran 9 of 1372 specs
Ran 9 of 1372 specs
//packages/core/test:test                                                PASSED in 1.4s
  Stats over 4 runs: max = 1.4s, min = 1.4s, avg = 1.4s, dev = 0.0s
```

- common の 34 件は `ng_for_spec.ts` の it の数と同じです（Node、0.9 秒）。
- core の 38 件 = `default_iterable_differ_spec.ts` の 33 件 + `IterableDiffers` の 5 件。shard ごとの件数を足しています。

### 直すとしたら

- ビューへの当て方は `NgForOf._applyChanges`（286〜325 行目）で、直したら `ng_for_spec.ts` に it を足します。
- 差の取り方は core の `DefaultIterableDiffer` の `check`・`_mismatch`・`forEachOperation` で、`forEachOperation` を直すなら spec の `modifyArrayUsingOperation` の形（当て終えたら一覧が一致する）で it を足すのが確かめやすい形です。2026 年に入ったのは 0c2efc0d46b（2026-01、空のコンストラクタを消す refactor）だけで、動きは変わっていません。
- NgForOf は v20 から deprecated で、2025 年以降の commit は deprecated の文言と docs だけです（`git log -- packages/common/src/directives/ng_for_of.ts`）。本家に PR を出すことは勧めません。手元で spec とデモを動かし、issue を読むときの手がかりにします（[第 20 回](20-cmn-issues.md)）。

## 聞かれそうな質問

**Q. 配列に `push` しただけで `*ngFor` の表示が増えるのはなぜですか？**

NgForOf の `ngDoCheck` の 280〜283 行目が、入力が変わったかどうかに関係なく毎回 `diff` するからです。`check` は配列を頭から読み直すので、同じ配列への `push` も「足した」になります。ただしビューが変更検知で見直されなければ `ngDoCheck` は呼ばれません。

**Q. あとから `trackBy` の関数を変えると効きますか？**

効きません。trackBy は 263 行目で differ を作るときに 1 回だけ渡され、differ は 258 行目で「まだないとき」だけ作るからです。

**Q. `forEachOperation` の `previousIndex` と、記録の `record.previousIndex` は何が違いますか？**

記録のほうは前の一覧での位置、コールバックに渡るほうは「それまでの操作を当てたあとの、その場の位置」です（iterable\_differs.ts の 61〜63 行目）。`getPreviousIndex` が 770 行目で前の位置に `addRemoveOffset` と `moveOffsets` を足して作ります。NgForOf は `ViewContainerRef` の位置として、その場の位置を使います。

**Q. trackBy を付けると、何が得になりますか？**

同じ鍵のビューを作り直さずに残せます。196 行目で鍵が同じなら食い違いにならず、要素が別のオブジェクトでも 204 行目の identity change になって、NgForOf の 321〜324 行目で `$implicit` を差し替えるだけで済みます。デモの「key で追う」と「key なし」で、作る・消すの数が違うのが見えます。

**Q. `*ngFor` に `Map` や文字列を渡すとどうなりますか？**

differ が見つからず例外になります。`DefaultIterableDifferFactory.supports`（25 行目）の `isListLikeIterable` が `Map` と文字列を外すからです。開発モードでは 264〜272 行目で、オブジェクトなら「keyvalue pipe のつもりでは？」を添えた NG02200 になります。

## 読み終えて

- NgForOf は差を取らない。`IterableDiffers` で作った differ に `diff` させ、返ってきた操作をビューの作成・削除・移動に直すだけ。
- differ は最初の値で 1 回だけ作る。trackBy もそのとき固定される。
- `DefaultIterableDiffer` は前の記録の列を頭から直す。食い違ったら「外した中」→「後ろ」→「新しい」の順に探す。
- `forEachOperation` は記録の位置を「その場の位置」に直して渡す。位置が変わらない移動は出さない。
- `index`・`count` は操作のたびに全部書き直し、`first`・`last`・`even`・`odd` は getter。

---

← 前: [NgClass と NgStyle：DoCheck で差分を取って書く](02-cmn-ng-class-style.md)  
次: [NgIf・NgSwitch・NgPlural：テンプレートを出し入れする](04-cmn-ng-if-switch.md) →
