[目次](../README.md) › [core の説明文の読み残し](README.md) › 第 8 回 / 全 10 回

# IterableDiffer と KeyValueDiffer の説明文

> change\_detection/differs/\*（default\_iterable\_differ.ts・default\_keyvalue\_differ.ts・iterable\_differs.ts・keyvalue\_differs.ts）の未読の行：diff の約束、forEach\* の順と添字、TrackByFunction、extend の例。本物の differ に配列と Map を通す。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crd-differs)

---

この章で分かること：`IterableDiffer`・`IterableChanges`・`TrackByFunction`・`IterableDiffers`・`KeyValueDiffer`・`KeyValueDiffers` の説明文が約束していることを、本物の differ に配列と Map を通して確かめます。結果として、`forEachOperation` の引数 `currentIndex` の説明（L64〜66）と、`IterableDiffers`・`KeyValueDiffers` の「NgClass が使う」（L190・L118）の 2 つが実物と合いませんでした。

読む対象は `packages/core/src/change_detection/differs/` の `iterable_differs.ts`・`keyvalue_differs.ts`・`default_iterable_differ.ts`・`default_keyvalue_differ.ts` と `change_detection.ts`（../angular、8576f161ae4）です。`DefaultIterableDiffer` の `check`・`_mismatch`・`forEachOperation` の中身と、`NgForOf` がそれをビューの出し入れに直す `_applyChanges` は[NgForOf と IterableDiffer の章](../cmn/03-cmn-ng-for-of.md)、`DefaultKeyValueDiffer` の `check` と `NgStyle` の使い方は[NgClass と NgStyle の章](../cmn/02-cmn-ng-class-style.md)が読んでいるので、ここでは繰り返さずに行だけ指します。

1. [1. @Directive](01-crd-directive.md)
2. [2. @Component](02-crd-component.md)
3. [3. クエリと @NgModule](03-crd-query-module.md)
4. [4. @Injectable・InjectionToken](04-crd-injectable-token.md)
5. [5. Provider の形](05-crd-provider.md)
6. [6. inject と Injector](06-crd-inject.md)
7. [7. ライフサイクル](07-crd-lifecycle.md)
8. **8. differ**（この章）
9. [9. スケジューラー](09-crd-scheduling.md)
10. [10. spec と issue](10-crd-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> differ（差分を取る物）は、前回の一覧を覚えておき、次の一覧を渡されると「何が足され、消え、動いたか」を記録の列で返します。`@for` はコンパイラーが作る別の仕組み（[NgForOf の章](../cmn/03-cmn-ng-for-of.md)の 8 節）で、differ を使うのは `NgForOf`・`NgStyle`・`KeyValuePipe` と、利用者が `ngDoCheck` で自分で差分を取るときです（[ライフサイクルの章](07-crd-lifecycle.md)の 2 節、DoCheck の説明文 L111〜112）。

## 1. IterableDiffer.diff：戻り値は次の diff まで

📄 `angular/packages/core/src/change_detection/differs/iterable_differs.ts` L15–51 （▶ の行: 20, 23–24, 30, 33–34, 36, 47–48, 50）

```ts
15 │ /**
16 │  * A type describing supported iterable types.
17 │  *
18 │  * @publicApi
19 │  */
20 ▶ export type NgIterable<T> = Array<T> | Iterable<T>;
21 │ 
22 │ /**
23 ▶  * A strategy for tracking changes over time to an iterable. Used by {@link /api/common/NgForOf NgForOf} to
24 ▶  * respond to changes in an iterable by effecting equivalent changes in the DOM.
25 │  *
26 │  * @publicApi
27 │  */
28 │ export interface IterableDiffer<V> {
29 │   /**
30 ▶    * Compute a difference between the previous state and the new `object` state.
31 │    *
32 │    * @param object containing the new value.
33 ▶    * @returns an object describing the difference. The return value is only valid until the next
34 ▶    * `diff()` invocation.
35 │    */
36 ▶   diff(object: NgIterable<V> | undefined | null): IterableChanges<V> | null;
37 │ }
38 │ 
39 │ /**
40 │  * An object describing the changes in the `Iterable` collection since last time
41 │  * `IterableDiffer#diff()` was invoked.
42 │  *
43 │  * @publicApi
44 │  */
45 │ export interface IterableChanges<V> {
46 │   /**
47 ▶    * Iterate over all changes. `IterableChangeRecord` will contain information about changes
48 ▶    * to each item.
49 │    */
50 ▶   forEachItem(fn: (record: IterableChangeRecord<V>) => void): void;
51 │ 
```

33〜34 行目「戻り値は次の `diff()` を呼ぶまでだけ正しい」は、`DefaultIterableDiffer.diff` が変化を自分自身の連結リストに持ち、`return this` するからです（default\_iterable\_differ.ts L173〜174、[NgForOf の章](../cmn/03-cmn-ng-for-of.md)の 3 節）。DEMO 2 で 1 回目の戻り値 `c1` を取っておき、2 回目の `diff` のあとで `c1.forEachAddedItem` を呼ぶと、1 回目の `[a, b]` ではなく 2 回目の `[c]` が出て、`c1 === 2 回目の戻り値` は `true` でした。説明文に無いことが 2 つあります。変化が無ければ `null` を返すこと（L176）と、36 行目の型のとおり `null`・`undefined` は空の配列として扱うこと（L164）です。`diff(null)` で前の 3 つが全部「消えた」になりました。配列でも iterable でもない物は NG0900 です（開発モードの文は「Error trying to diff '\[object Object\]'. Only arrays and iterables are allowed」）。

23〜24 行目は「`NgForOf` が DOM に同じ変化を起こすのに使う」と書きます。差分を DOM に当てるのは `NgForOf._applyChanges` で、differ は記録を返すだけです。

## 2. forEachOperation：currentIndex は「途中の位置」ではない

`forEachOperation` の説明文（iterable\_differs.ts L52〜74）は[NgForOf の章](../cmn/03-cmn-ng-for-of.md)の 5 節が引いているので、ここでは行だけ指します。L61〜63 は「`record.previousIndex` は元の一覧の位置で、引数の `previousIndex` はそこまでの操作を当てた途中の位置」、L64〜66 は `currentIndex` について同じ形で「`record.currentIndex` は元の一覧の位置で、引数の `currentIndex` は途中の位置」と書きます。

L64〜66 は 2 つとも実物と合いません。`record.currentIndex` は新しい一覧の位置（元の位置ではない）で、引数の `currentIndex` は `record.currentIndex` そのものです。実装は L93 で `const currentIndex = record.currentIndex` とし、L123 で `fn(record, adjPreviousIndex, currentIndex)` と渡します。途中の位置に直しているのは `previousIndex`（`getPreviousIndex` で足し引きした `adjPreviousIndex`）だけです。DEMO 1 の表の「record.currentIndex」と「引数 currentIndex」の列は、どの行も同じ数でした。違うのは「record.previousIndex」と「引数 previousIndex」で、`[a, b, c, d] → [b, d, e]` の 2 つ目の操作（c を消す）は record が 2、引数が 1（a を消したあとの位置）、逆順の `[a, b, c, d] → [d, c, b, a]` では c と b の引数が 3（d を先頭に動かしたあと、それぞれ末尾にいる）です。

操作の順で 1 つずつ当てれば新しい一覧になる、という L53〜58 の約束はそのとおりで、`NgForOf` は引数の `previousIndex` で今のビューを取り、`currentIndex` の位置へ動かします。`currentIndex` が途中の位置ではなく最後の位置で足りるのは、操作を新しい一覧の頭から順に並べているからです（L86〜91 で、新しい一覧の記録を頭から順にたどり、その手前で消す記録があれば先に出す）。この 6 行は 8c7e93bebeb（2016-10-27、`fix(core): Add type information to differs`）のころから変わっていません。新しい本家（origin/main の d201dd76ef2、2026-11-19）でも同じです。新しい本家の 6e024600e0b（[inject と Injector の章](06-crd-inject.md)の 3 節の @param の直し）の説明は、この 3 つの @param が「コールバックの引数を書いている」ので名前が合わないまま残した、と書いています。

## 3. forEach\* の 6 つ

📄 `angular/packages/core/src/change_detection/differs/iterable_differs.ts` L75–96 （▶ の行: 77–78, 80, 83, 86, 89, 92–93, 95）

```ts
75 │ 
76 │   /**
77 ▶    * Iterate over changes in the order of original `Iterable` showing where the original items
78 ▶    * have moved.
79 │    */
80 ▶   forEachPreviousItem(fn: (record: IterableChangeRecord<V>) => void): void;
81 │ 
82 │   /** Iterate over all added items. */
83 ▶   forEachAddedItem(fn: (record: IterableChangeRecord<V>) => void): void;
84 │ 
85 │   /** Iterate over all moved items. */
86 ▶   forEachMovedItem(fn: (record: IterableChangeRecord<V>) => void): void;
87 │ 
88 │   /** Iterate over all removed items. */
89 ▶   forEachRemovedItem(fn: (record: IterableChangeRecord<V>) => void): void;
90 │ 
91 │   /**
92 ▶    * Iterate over all items which had their identity (as computed by the `TrackByFunction`)
93 ▶    * changed.
94 │    */
95 ▶   forEachIdentityChange(fn: (record: IterableChangeRecord<V>) => void): void;
96 │ }
```

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L127–162 （▶ の行: 130, 137, 144, 151, 158）

```ts
127 │ 
128 │   forEachPreviousItem(fn: (record: IterableChangeRecord_<V>) => void) {
129 │     let record: IterableChangeRecord_<V> | null;
130 ▶     for (record = this._previousItHead; record !== null; record = record._nextPrevious) {
131 │       fn(record);
132 │     }
133 │   }
134 │ 
135 │   forEachAddedItem(fn: (record: IterableChangeRecord_<V>) => void) {
136 │     let record: IterableChangeRecord_<V> | null;
137 ▶     for (record = this._additionsHead; record !== null; record = record._nextAdded) {
138 │       fn(record);
139 │     }
140 │   }
141 │ 
142 │   forEachMovedItem(fn: (record: IterableChangeRecord_<V>) => void) {
143 │     let record: IterableChangeRecord_<V> | null;
144 ▶     for (record = this._movesHead; record !== null; record = record._nextMoved) {
145 │       fn(record);
146 │     }
147 │   }
148 │ 
149 │   forEachRemovedItem(fn: (record: IterableChangeRecord_<V>) => void) {
150 │     let record: IterableChangeRecord_<V> | null;
151 ▶     for (record = this._removalsHead; record !== null; record = record._nextRemoved) {
152 │       fn(record);
153 │     }
154 │   }
155 │ 
156 │   forEachIdentityChange(fn: (record: IterableChangeRecord_<V>) => void) {
157 │     let record: IterableChangeRecord_<V> | null;
158 ▶     for (record = this._identityChangesHead; record !== null; record = record._nextIdentityChange) {
159 │       fn(record);
160 │     }
161 │   }
162 │ 
```

6 つとも、自分の連結リスト（`_previousItHead`・`_additionsHead`・`_movesHead`・`_removalsHead`・`_identityChangesHead`）を頭からたどるだけです。DEMO 1 の各ケースの下の行に 6 つを並べました。86 行目の「動いた物すべて」は、位置（index）が変わった物すべてという意味で、`forEachOperation` の「動かす」とは数が違います。`[a, b, c, d] → [b, d, e]` では `forEachMovedItem` に b（1→0）と d（3→1）が出ますが、`forEachOperation` には「動かす」が無く、消す 2 つと足す 1 つだけでした。b と d は前が消えて詰まっただけで、当てる操作が要らないからです（L122 の `adjPreviousIndex !== currentIndex` の行で落ちる）。77〜78 行目の `forEachPreviousItem` は「元の一覧の順に、どこへ動いたか」で、消えた a・c も `[0→null]` の形で入っています。

📄 `angular/packages/core/src/change_detection/differs/iterable_differs.ts` L98–115 （▶ の行: 104–105, 107–108, 113–114）

```ts
 98 │ /**
 99 │  * Record representing the item change information.
100 │  *
101 │  * @publicApi
102 │  */
103 │ export interface IterableChangeRecord<V> {
104 ▶   /** Current index of the item in `Iterable` or null if removed. */
105 ▶   readonly currentIndex: number | null;
106 │ 
107 ▶   /** Previous index of the item in `Iterable` or null if added. */
108 ▶   readonly previousIndex: number | null;
109 │ 
110 │   /** The item. */
111 │   readonly item: V;
112 │ 
113 ▶   /** Track by identity as computed by the `TrackByFunction`. */
114 ▶   readonly trackById: any;
115 │ }
```

104〜108 行目「消えたら `currentIndex` が `null`、足されたら `previousIndex` が `null`」も表のとおりです。

## 4. TrackByFunction と forEachIdentityChange

📄 `angular/packages/core/src/change_detection/differs/iterable_differs.ts` L117–150 （▶ の行: 118–119, 121–122, 134–135, 138, 142, 146–148）

````ts
117 │ /**
118 ▶  * A function optionally passed into the `NgForOf` directive to customize how `NgForOf` uniquely
119 ▶  * identifies items in an iterable.
120 │  *
121 ▶  * `NgForOf` needs to uniquely identify items in the iterable to correctly perform DOM updates
122 ▶  * when items in the iterable are reordered, new items are added, or existing items are removed.
123 │  *
124 │  *
125 │  * In all of these scenarios it is usually desirable to only update the DOM elements associated
126 │  * with the items affected by the change. This behavior is important to:
127 │  *
128 │  * - preserve any DOM-specific UI state (like cursor position, focus, text selection) when the
129 │  *   iterable is modified
130 │  * - enable animation of item addition, removal, and iterable reordering
131 │  * - preserve the value of the `<select>` element when nested `<option>` elements are dynamically
132 │  *   populated using `NgForOf` and the bound iterable is updated
133 │  *
134 ▶  * A common use for custom `trackBy` functions is when the model that `NgForOf` iterates over
135 ▶  * contains a property with a unique identifier. For example, given a model:
136 │  *
137 │  * ```ts
138 ▶  * class User {
139 │  *   id: number;
140 │  *   name: string;
141 │  *   ...
142 ▶  * }
143 │  * ```
144 │  * a custom `trackBy` function could look like the following:
145 │  * ```ts
146 ▶  * function userTrackBy(index, user) {
147 ▶  *   return user.id;
148 ▶  * }
149 │  * ```
150 │  *
````

📄 `angular/packages/core/src/change_detection/differs/iterable_differs.ts` L151–184 （▶ の行: 153–156, 162, 166, 172, 181–182）

```ts
151 │  * A custom `trackBy` function must have several properties:
152 │  *
153 ▶  * - be [idempotent](https://en.wikipedia.org/wiki/Idempotence) (be without side effects, and always
154 ▶  * return the same value for a given input)
155 ▶  * - return unique value for all unique inputs
156 ▶  * - be fast
157 │  *
158 │  * @see [`NgForOf#ngForTrackBy`](api/common/NgForOf#ngForTrackBy)
159 │  * @publicApi
160 │  */
161 │ export interface TrackByFunction<T> {
162 ▶   // Note: the type parameter `U` enables more accurate template type checking in case a trackBy
163 │   // function is declared using a base type of the iterated type. The `U` type gives TypeScript
164 │   // additional freedom to infer a narrower type for the `item` parameter type, instead of imposing
165 │   // the trackBy's declared item type as the inferred type for `T`.
166 ▶   // See https://github.com/angular/angular/issues/40125
167 │ 
168 │   /**
169 │    * @param index The index of the item within the iterable.
170 │    * @param item The item in the iterable.
171 │    */
172 ▶   <U extends T>(index: number, item: T & U): any;
173 │ }
174 │ 
175 │ /**
176 │  * Provides a factory for {@link IterableDiffer}.
177 │  *
178 │  * @publicApi
179 │  */
180 │ export interface IterableDifferFactory {
181 ▶   supports(objects: any): boolean;
182 ▶   create<V>(trackByFn?: TrackByFunction<V>): IterableDiffer<V>;
183 │ }
184 │ 
```

`trackBy` の戻り値（`trackById`）が同じなら同じ記録で、項目のオブジェクトが別なら `forEachIdentityChange` に出ます（91〜95 行目）。DEMO 1 の「trackBy で id」で、`{id: 1}` と `{id: 2}` を、同じ id の新しいオブジェクトにして入れ替えると、操作は「動かす」1 つ、`forEachIdentityChange` に 2 つとも出ました。新しいオブジェクトでも記録は作り直されません。「trackBy で index」（`(i) => i`）では、`[a, b, c] → [c, a, b]` の操作は 0 個で、3 つとも identity change でした。位置が鍵なので、どの記録も動かず、中身だけが入れ替わったと読みます。155 行目「異なる入力には異なる値を返す」を破ると重複の扱いになり、`NaN` どうしは `Object.is` で同じと見なします（DEMO 1 の最後のケース、`diff` が `null`）。

146〜148 行目の例 `function userTrackBy(index, user)` は型の注釈が無いので、strict の tsc では `noImplicitAny` の 2 つのエラー（TS7006）になります。138〜142 行目の `class User { id: number; ... }` も `...` のため、そのままでは書けない形です。どちらも説明用の断片で、`NgForOf#ngForTrackBy` の説明を書き直した 14abc68ccf9（2021-05-25、`docs(common): rewrite docs for NgForOf#ngForTrackBy (#42329)`）から変わっていません。172 行目の `<U extends T>` は 162〜166 行目のコメントのとおり、テンプレートの型検査で `item` を狭く推し量るためのものです。

## 5. 重複のある一覧

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L335–362 （▶ の行: 337, 339, 342, 345, 347–351, 356–358）

```ts
335 │ 
336 │   /**
337 ▶    * This check is only needed if an array contains duplicates. (Short circuit of nothing dirty)
338 │    *
339 ▶    * Use case: `[a, a]` => `[b, a, a]`
340 │    *
341 │    * If we did not have this check then the insertion of `b` would:
342 ▶    *   1) evict first `a`
343 │    *   2) insert `b` at `0` index.
344 │    *   3) leave `a` at index `1` as is. <-- this is wrong!
345 ▶    *   3) reinsert `a` at index 2. <-- this is wrong!
346 │    *
347 ▶    * The correct behavior is:
348 ▶    *   1) evict first `a`
349 ▶    *   2) insert `b` at `0` index.
350 ▶    *   3) reinsert `a` at index 1.
351 ▶    *   3) move `a` at from `1` to `2`.
352 │    *
353 │    *
354 │    * Double check that we have not evicted a duplicate item. We need to check if the item type may
355 │    * have already been removed:
356 ▶    * The insertion of b will evict the first 'a'. If we don't reinsert it now it will be reinserted
357 ▶    * at the end. Which will show up as the two 'a's switching position. This is incorrect, since a
358 ▶    * better way to think of it is as insert of 'b' rather then switch 'a' with 'b' and then add 'a'
359 │    * at the end.
360 │    *
361 │    * @internal
362 │    */
```

📄 `angular/packages/core/src/change_detection/differs/default_iterable_differ.ts` L718–734 （▶ の行: 723–724, 726–727, 729）

```ts
718 │     }
719 │     duplicates.add(record);
720 │   }
721 │ 
722 │   /**
723 ▶    * Retrieve the `value` using key. Because the IterableChangeRecord_ value may be one which we
724 ▶    * have already iterated over, we use the `atOrAfterIndex` to pretend it is not there.
725 │    *
726 ▶    * Use case: `[a, b, c, a, a]` if we are at index `3` which is the second `a` then asking if we
727 ▶    * have any more `a`s needs to return the second `a`.
728 │    */
729 ▶   get(trackById: any, atOrAfterIndex: number | null): IterableChangeRecord_<V> | null {
730 │     const key = trackById;
731 │     const recordList = this.map.get(key);
732 │     return recordList ? recordList.get(trackById, atOrAfterIndex) : null;
733 │   }
734 │ 
```

339 行目の例 `[a, a] → [b, a, a]` を本物に通すと、`forEachOperation` は「b を 0 に足す」の 1 つだけで、356〜358 行目の言う「a どうしの入れ替えに見える」ことはありませんでした。347〜351 行目の「正しい振る舞い」は記録の中の手順（最初の a を外す、b を入れる、a を 1 に入れ直す、a を 1 から 2 へ）で、外に見えるのは b の追加だけです。`forEachMovedItem` には位置がずれた 2 つの a（0→1、1→2）が出ます。726 行目の形 `[a, b, c, a, a] → [a, a, b, c, a]` も、操作は「3 番目の a を 1 へ動かす」の 1 つでした。同じ値の記録は `_DuplicateMap` の中で `atOrAfterIndex` 以降から探すので（729 行目）、後ろの a を先に使うことはありません。この 2 つの説明は内部の `@internal` の関数のコメントで、API リファレンスには載りません。342〜345 行目と 348〜351 行目の番号に「3)」が 2 つあり、358 行目の「rather then」は than の誤りです（1bd304e7abc、2014-10-28 から）。

## 6. KeyValueDiffer：Map とオブジェクト

📄 `angular/packages/core/src/change_detection/differs/keyvalue_differs.ts` L14–37 （▶ の行: 15, 24–25, 27, 36）

```ts
14 │ /**
15 ▶  * A differ that tracks changes made to an object over time.
16 │  *
17 │  * @publicApi
18 │  */
19 │ export interface KeyValueDiffer<K, V> {
20 │   /**
21 │    * Compute a difference between the previous state and the new `object` state.
22 │    *
23 │    * @param object containing the new value.
24 ▶    * @returns an object describing the difference. The return value is only valid until the next
25 ▶    * `diff()` invocation.
26 │    */
27 ▶   diff(object: Map<K, V>): KeyValueChanges<K, V> | null;
28 │ 
29 │   /**
30 │    * Compute a difference between the previous state and the new `object` state.
31 │    *
32 │    * @param object containing the new value.
33 │    * @returns an object describing the difference. The return value is only valid until the next
34 │    * `diff()` invocation.
35 │    */
36 ▶   diff(object: {[key: string]: V}): KeyValueChanges<string, V> | null;
37 │ }
```

📄 `angular/packages/core/src/change_detection/differs/keyvalue_differs.ts` L39–72 （▶ の行: 40, 53–54, 59, 64, 69）

```ts
39 │ /**
40 ▶  * An object describing the changes in the `Map` or `{[k:string]: string}` since last time
41 │  * `KeyValueDiffer#diff()` was invoked.
42 │  *
43 │  * @publicApi
44 │  */
45 │ export interface KeyValueChanges<K, V> {
46 │   /**
47 │    * Iterate over all changes. `KeyValueChangeRecord` will contain information about changes
48 │    * to each item.
49 │    */
50 │   forEachItem(fn: (r: KeyValueChangeRecord<K, V>) => void): void;
51 │ 
52 │   /**
53 ▶    * Iterate over changes in the order of original Map showing where the original items
54 ▶    * have moved.
55 │    */
56 │   forEachPreviousItem(fn: (r: KeyValueChangeRecord<K, V>) => void): void;
57 │ 
58 │   /**
59 ▶    * Iterate over all keys for which values have changed.
60 │    */
61 │   forEachChangedItem(fn: (r: KeyValueChangeRecord<K, V>) => void): void;
62 │ 
63 │   /**
64 ▶    * Iterate over all added items.
65 │    */
66 │   forEachAddedItem(fn: (r: KeyValueChangeRecord<K, V>) => void): void;
67 │ 
68 │   /**
69 ▶    * Iterate over all removed items.
70 │    */
71 │   forEachRemovedItem(fn: (r: KeyValueChangeRecord<K, V>) => void): void;
72 │ }
```

📄 `angular/packages/core/src/change_detection/differs/keyvalue_differs.ts` L74–112 （▶ の行: 79, 86, 88, 91, 93–94, 103, 105）

```ts
 74 │ /**
 75 │  * Record representing the item change information.
 76 │  *
 77 │  * @publicApi
 78 │  */
 79 ▶ export interface KeyValueChangeRecord<K, V> {
 80 │   /**
 81 │    * Current key in the Map.
 82 │    */
 83 │   readonly key: K;
 84 │ 
 85 │   /**
 86 ▶    * Current value for the key or `null` if removed.
 87 │    */
 88 ▶   readonly currentValue: V | null;
 89 │ 
 90 │   /**
 91 ▶    * Previous value for the key or `null` if added.
 92 │    */
 93 ▶   readonly previousValue: V | null;
 94 ▶ }
 95 │ 
 96 │ /**
 97 │  * Provides a factory for {@link KeyValueDiffer}.
 98 │  *
 99 │  * @publicApi
100 │  */
101 │ export interface KeyValueDifferFactory {
102 │   /**
103 ▶    * Test to see if the differ knows how to diff this kind of object.
104 │    */
105 ▶   supports(objects: any): boolean;
106 │ 
107 │   /**
108 │    * Create a `KeyValueDiffer`.
109 │    */
110 │   create<K, V>(): KeyValueDiffer<K, V>;
111 │ }
112 │ 
```

DEMO 3 で `Map {a: 1, b: 2} → {b: 3, c: 4}` を通すと、`forEachChangedItem` に `b(2→3)`、`forEachAddedItem` に `c(null→4)`、`forEachRemovedItem` に `a(1→null)` で、86・93 行目「消えたら `currentValue` が `null`、足されたら `previousValue` が `null`」のとおりでした。同じ中身のオブジェクトでも同じ結果です。`forEachPreviousItem`（53〜54 行目「元の Map の順に、どこへ動いたか」）は `a` と `b` を元の順に返しますが、`KeyValueChangeRecord`（79〜94 行目）には位置が無いので、「どこへ動いたか」は分かりません。`IterableChanges` の文（3 節の 77〜78 行目）を写したものです。並びだけ変えた Map は `diff` が `null` でした（spec の `should work regardless key order`、default\_keyvalue\_differ\_spec.ts 134）。

📄 `angular/packages/core/src/change_detection/differs/default_keyvalue_differ.ts` L42–81 （▶ の行: 42–44, 57, 64）

```ts
42 ▶   get isDirty(): boolean {
43 ▶     return (
44 ▶       this._additionsHead !== null || this._changesHead !== null || this._removalsHead !== null
45 │     );
46 │   }
47 │ 
48 │   forEachItem(fn: (r: KeyValueChangeRecord<K, V>) => void) {
49 │     let record: KeyValueChangeRecord_<K, V> | null;
50 │     for (record = this._mapHead; record !== null; record = record._next) {
51 │       fn(record);
52 │     }
53 │   }
54 │ 
55 │   forEachPreviousItem(fn: (r: KeyValueChangeRecord<K, V>) => void) {
56 │     let record: KeyValueChangeRecord_<K, V> | null;
57 ▶     for (record = this._previousMapHead; record !== null; record = record._nextPrevious) {
58 │       fn(record);
59 │     }
60 │   }
61 │ 
62 │   forEachChangedItem(fn: (r: KeyValueChangeRecord<K, V>) => void) {
63 │     let record: KeyValueChangeRecord_<K, V> | null;
64 ▶     for (record = this._changesHead; record !== null; record = record._nextChanged) {
65 │       fn(record);
66 │     }
67 │   }
68 │ 
69 │   forEachAddedItem(fn: (r: KeyValueChangeRecord<K, V>) => void) {
70 │     let record: KeyValueChangeRecord_<K, V> | null;
71 │     for (record = this._additionsHead; record !== null; record = record._nextAdded) {
72 │       fn(record);
73 │     }
74 │   }
75 │ 
76 │   forEachRemovedItem(fn: (r: KeyValueChangeRecord<K, V>) => void) {
77 │     let record: KeyValueChangeRecord_<K, V> | null;
78 │     for (record = this._removalsHead; record !== null; record = record._nextRemoved) {
79 │       fn(record);
80 │     }
81 │   }
```

📄 `angular/packages/core/src/change_detection/differs/default_keyvalue_differ.ts` L212–237 （▶ の行: 218, 225–226, 228–229）

```ts
212 │ 
213 │   /** @internal */
214 │   _reset() {
215 │     if (this.isDirty) {
216 │       let record: KeyValueChangeRecord_<K, V> | null;
217 │       // let `_previousMapHead` contain the state of the map before the changes
218 ▶       this._previousMapHead = this._mapHead;
219 │       for (record = this._previousMapHead; record !== null; record = record._next) {
220 │         record._nextPrevious = record._next;
221 │       }
222 │ 
223 │       // Update `record.previousValue` with the value of the item before the changes
224 │       // We need to update all changed items (that's those which have been added and changed)
225 ▶       for (record = this._changesHead; record !== null; record = record._nextChanged) {
226 ▶         record.previousValue = record.currentValue;
227 │       }
228 ▶       for (record = this._additionsHead; record != null; record = record._nextAdded) {
229 ▶         record.previousValue = record.currentValue;
230 │       }
231 │ 
232 │       this._changesHead = this._changesTail = null;
233 │       this._additionsHead = this._additionsTail = null;
234 │       this._removalsHead = null;
235 │     }
236 │   }
237 │ 
```

次の `diff` の頭の `_reset` で、変わった物と足された物の `previousValue` を `currentValue` に揃えます（225〜229 行目）。そのため 1 回目の `c(null→4)` は、次の回には `previousValue` が 4 から始まります。27・36 行目の型は `Map` とオブジェクトだけですが、実装は `null` も受け付け（default\_keyvalue\_differ.ts L83）、`KeyValueDiffers.find` は配列も「オブジェクト」として受け付けました（DEMO 2。`isJsObject` は `typeof o === 'object'` を見るだけなので配列にも真を返す、util/iterable.ts L49〜51）。文字列は NG0901 です。

## 7. IterableDiffers・KeyValueDiffers と extend

📄 `angular/packages/core/src/change_detection/differs/iterable_differs.ts` L212–245 （▶ の行: 214–216, 222–223, 228, 233, 237, 241）

````ts
212 │ 
213 │   /**
214 ▶    * Takes an array of {@link IterableDifferFactory} and returns a provider used to extend the
215 ▶    * inherited {@link IterableDiffers} instance with the provided factories and return a new
216 ▶    * {@link IterableDiffers} instance.
217 │    *
218 │    * @usageNotes
219 │    * ### Example
220 │    *
221 │    * The following example shows how to extend an existing list of factories,
222 ▶    * which will only be applied to the injector for this component and its children.
223 ▶    * This step is all that's required to make a new {@link IterableDiffer} available.
224 │    *
225 │    * ```ts
226 │    * @Component({
227 │    *   viewProviders: [
228 ▶    *     IterableDiffers.extend([new ImmutableListDiffer()])
229 │    *   ]
230 │    * })
231 │    * ```
232 │    */
233 ▶   static extend(factories: IterableDifferFactory[]): StaticProvider {
234 │     return {
235 │       provide: IterableDiffers,
236 │       useFactory: () => {
237 ▶         const parent = inject(IterableDiffers, {optional: true, skipSelf: true});
238 │         // if parent is null, it means that we are in the root injector and we have just overridden
239 │         // the default injection mechanism for IterableDiffers, in such a case just assume
240 │         // `defaultIterableDiffersFactory`.
241 ▶         return IterableDiffers.create(factories, parent || defaultIterableDiffersFactory());
242 │       },
243 │     };
244 │   }
245 │ 
````

📄 `angular/packages/core/src/change_detection/differs/keyvalue_differs.ts` L144–176 （▶ の行: 145–147, 159, 168, 172）

````ts
144 │   /**
145 ▶    * Takes an array of {@link KeyValueDifferFactory} and returns a provider used to extend the
146 ▶    * inherited {@link KeyValueDiffers} instance with the provided factories and return a new
147 ▶    * {@link KeyValueDiffers} instance.
148 │    *
149 │    * @usageNotes
150 │    * ### Example
151 │    *
152 │    * The following example shows how to extend an existing list of factories,
153 │    * which will only be applied to the injector for this component and its children.
154 │    * This step is all that's required to make a new {@link KeyValueDiffer} available.
155 │    *
156 │    * ```ts
157 │    * @Component({
158 │    *   viewProviders: [
159 ▶    *     KeyValueDiffers.extend([new ImmutableMapDiffer()])
160 │    *   ]
161 │    * })
162 │    * ```
163 │    */
164 │   static extend(factories: KeyValueDifferFactory[]): StaticProvider {
165 │     return {
166 │       provide: KeyValueDiffers,
167 │       useFactory: () => {
168 ▶         const parent = inject(KeyValueDiffers, {optional: true, skipSelf: true});
169 │         // if parent is null, it means that we are in the root injector and we have just overridden
170 │         // the default injection mechanism for KeyValueDiffers, in such a case just assume
171 │         // `defaultKeyValueDiffersFactory`.
172 ▶         return KeyValueDiffers.create(factories, parent || defaultKeyValueDiffersFactory());
173 │       },
174 │     };
175 │   }
176 │ 
````

DEMO 2 の extend の表で、`Injector.create({providers: [IterableDiffers.extend([new CrdListLikeFactory(...)])]})` の注入器から取った `IterableDiffers` は親の物と別のインスタンスで（214〜216 行目）、足した factory も親の `DefaultIterableDifferFactory` も `find` で見つかり、親の注入器の `IterableDiffers` は足した物を知りませんでした（222 行目「この注入器と子だけ」）。237 行目の `{optional: true, skipSelf: true}` が親の物を取り、241 行目で足した factory を前に、親の factory を後ろに並べます（`IterableDiffers.create`、L204〜211）。`find` は前から探すので、足した物が先に当たります。228・159 行目の `ImmutableListDiffer`・`ImmutableMapDiffer` は Angular にはありません（Immutable.js の一覧を想定した名前）。デモでは `{items: [...]}` を配列として扱うだけの factory を代わりに作りました。

合わないのは、`IterableDiffers` の 1 行の説明（L189〜190「NgFor、NgClass ほかが使う」）と `KeyValueDiffers` の説明（keyvalue\_differs.ts L117〜118「NgClass、NgStyle ほかが使う」）です。今の `NgClass` はどちらも使いません。差分は自分の `stateMap` で取り（[NgClass と NgStyle の章](../cmn/02-cmn-ng-class-style.md)の 1〜3 節）、最後まで残っていた 2 つの引数も 1be6b0a58a9（2024-01-08、`fix(common): remove unused parameters from the ngClass constructor (#53831)`）で constructor から外れました。@angular/common の中で使っているのは、`IterableDiffers` が `NgForOf`、`KeyValueDiffers` が `NgStyle` と `KeyValuePipe` です。2 つの文は 392de4af677（2015-07-31）から変わっていません。

📄 `angular/packages/core/src/change_detection/change_detection.ts` L42–55 （▶ の行: 45, 50, 52, 54）

```ts
42 │ /**
43 │  * Structural diffing for `Object`s and `Map`s.
44 │  */
45 ▶ const keyValDiff: KeyValueDifferFactory[] = [new DefaultKeyValueDifferFactory()];
46 │ 
47 │ /**
48 │  * Structural diffing for `Iterable` types such as `Array`s.
49 │  */
50 ▶ const iterableDiff: IterableDifferFactory[] = [new DefaultIterableDifferFactory()];
51 │ 
52 ▶ export const defaultIterableDiffers = new IterableDiffers(iterableDiff);
53 │ 
54 ▶ export const defaultKeyValueDiffers = new KeyValueDiffers(keyValDiff);
55 │ 
```

`change_detection.ts` の 52・54 行目の 2 つは `ɵdefaultIterableDiffers`・`ɵdefaultKeyValueDiffers` として内部向けに出ていますが、packages の中で使うのは common の keyvalue pipe の spec だけです。アプリで使う `IterableDiffers` は `providedIn: 'root'` の `defaultIterableDiffersFactory`（L185〜200）が作る別のインスタンスです。`DefaultIterableDiffer` は default\_iterable\_differ.ts L35〜36 で「v4.0.0 から deprecated、公開 API にあるべきでない」と書かれたまま今も公開 API にあり（goldens/public-api/core/index.api.md）、デモは `IterableDiffers.find(...).create()` から作りました。

> **🧪 DEMO — 本物の differ に配列と Map を通す**
>
> 押すと、このページ（本番ビルド）で章の注入器から `IterableDiffers`・`KeyValueDiffers` を取り、`find(...).create()` で differ を作って、左の一覧を `diff` してから右の一覧を `diff` し、2 回目の変化を書きます。`NgForOf` などの common のクラスは使いません。「開発モード（記録）」の列は、同じ関数（crd-differs.demo-diff.ts）を Node（domino の上の JIT）で開発モードで実行した記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-differs)

この章のデモは本番ビルドの最初に読む JS（Initial total）を増やしませんでした（この章を雛形に戻したビルドと、ほかは同じ中身で続けて 2 回ビルドして比べた値）。`DefaultIterableDiffer`・`DefaultKeyValueDiffer` とその 2 つの `Differs` は、サイトの最初の chunk（core の共有の chunk）にもともと入っていて、ほかの章の遅延 chunk にも渡している物なので、この章が使っても最初の chunk の中身も export の数も変わりませんでした（初期の 4 つの chunk の合計は 2 つのビルドとも 513,395 バイト）。

## ここまでの呼び出し

- 👤 `injector.get(IterableDiffers).find(['a','b','c','d']).create()`
  - `IterableDiffers.find → DefaultIterableDifferFactory.supports（isListLikeIterable）` — iterable\_differs.ts L246〜259
- 👤 `differ.diff(['b','d','e'])`
  - `check → _reset → （記録が合わない位置で）_mismatch → _truncate` — default\_iterable\_differ.ts L182〜232 — *NgForOf の章の 3・4 節*
- 👤 `changes.forEachOperation(fn)`
  - `消す a：fn(a, 0, null)` — L96〜98・L123
  - `消す c：fn(c, 1, null)` — *record.previousIndex は 2、引数は a を消したあとの 1*
  - `足す e：fn(e, null, 2)` — *引数 currentIndex = record.currentIndex（L93）*

## テストと直し方

| ファイル（packages/core/test/change\_detection/differs/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `default_iterable_differ_spec.ts` | `forEachOperation`（348）› `should trigger a series of insert/move/remove changes for inputs that have been diffed`（389）・`should be able to manage operations within a criss/cross of move operations`（437） | 2 節。引数の 2 つの index を並べて期待しているが、`currentIndex` が record と同じことを名指しする it は無い |
| `default_iterable_differ_spec.ts` | `should ignore [NaN] != [NaN]`（228）・`should support duplicates`（280）・`support re-insertion`（331） | 4・5 節 |
| `default_iterable_differ_spec.ts` | `diff`（533）› `should return self when there is a change`（534）・`should return null when there is no change`（538）・`should treat null as an empty list`（543）・`should throw when given an invalid collection`（553） | 1 節 |
| `default_iterable_differ_spec.ts` | `trackBy function by id`（559）› `should treat seen records as identity changes, not additions`（575）、`trackBy function by index`（733） | 4 節 |
| `default_keyvalue_differ_spec.ts` | `should expose previous and current value`（64）・`should not see a NaN value as a change`（124）・`should work regardless key order`（134） | 6 節 |
| `iterable_differs_spec.ts` | `.extend()`（58）› `should extend di-inherited differs`（59）、`should copy over differs from the parent repo`（47） | 7 節 |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
（絞らない）           1401 specs（4 つの shard の合計）, 0 failures, 8 pending
--filter=^iterable differ   Ran 9 + 8 + 8 + 8 = 33 specs、0 failures
--filter=^keyvalue differ   Ran 4 + 4 + 4 + 3 = 15 specs、0 failures
--filter=^IterableDiffers   Ran 1 + 1 + 1 + 2 = 5 specs、0 failures
--filter=^KeyValueDiffers   Ran 0 + 0 + 0 + 1 = 1 spec、0 failures
```

直すとしたら説明文です。iterable\_differs.ts の L64〜66 は「`currentIndex` は `record.currentIndex` と同じで、新しい一覧の位置。操作を順に当てた途中でも、その位置が正しい」に。L189〜190 と keyvalue\_differs.ts の L117〜118 は、`NgClass` を外して `NgForOf`、`NgStyle`・`KeyValuePipe` に。keyvalue\_differs.ts の 53〜54 行目は「元の順に、前の値と今の値」に。固める spec を足すなら default\_iterable\_differ\_spec.ts の `forEachOperation` の describe に、コールバックの 3 つ目の引数がどの操作でも `record.currentIndex` と同じことを確かめる it を足します。

## 聞かれそうな質問

**Q. `forEachOperation` の `currentIndex` と `record.currentIndex` は違いますか？**

同じです。実装は L93 で `record.currentIndex` をそのまま渡します。途中の位置に直されるのは `previousIndex` だけで、説明文の L64〜66 はここが違っています。

**Q. `forEachMovedItem` に出た物は、DOM で動かす必要がありますか？**

ありません。位置が変わった物すべてが出ます。前の物が消えて詰まっただけの物も入り、`forEachOperation` の「動かす」には出ません（DEMO 1 の `[a, b, c, d] → [b, d, e]`）。DOM に当てる操作は `forEachOperation` を使います。

**Q. `diff` の戻り値を取っておいて、あとで読めますか？**

読めません。戻り値は differ 自身で、次の `diff` で中身が入れ替わります（33〜34 行目）。必要な情報は `diff` の直後に写します。

**Q. trackBy で id を返すと、新しいオブジェクトでもビューは作り直されませんか？**

作り直されません。同じ記録のまま `forEachIdentityChange` に出ます。`NgForOf` はそこで `$implicit` を新しいオブジェクトに替えます（[NgForOf の章](../cmn/03-cmn-ng-for-of.md)の 6 節）。

**Q. `NgClass` に独自の differ を足したいときは `KeyValueDiffers.extend` ですか？**

効きません。今の `NgClass` は differ を使いません（1be6b0a58a9 で最後の引数も消えた）。`KeyValueDiffers` を使うのは `NgStyle` と `KeyValuePipe` です。説明文の L117〜118 はここが古いままです。

## 読み終えて

- `diff` は differ 自身か `null` を返し、戻り値は次の `diff` まで。`null` は空の配列として扱う。
- `forEachOperation` の引数のうち途中の位置に直されるのは `previousIndex` だけで、`currentIndex` は `record.currentIndex`。説明文の L64〜66 は違う。
- `forEachMovedItem` は位置が変わった物すべて。DOM に当てる操作とは数が違う。
- trackBy の鍵が同じなら記録は残り、オブジェクトが替われば identity change。`NaN` は `Object.is` で同じ。
- `extend` は親の factory の前に足した factory を並べた新しいインスタンス。`NgClass` はもう differ を使わない。

---

← 前: [ライフサイクルの説明文：OnChanges・DoCheck・AfterView・ChangeDetectorRef](07-crd-lifecycle.md)  
次: [変更検知のスケジューラーの説明文：provideZoneChangeDetection と zoneless](09-crd-scheduling.md) →
