[目次](../README.md) › [core の説明文の読み残し（3）](README.md) › 第 5 回 / 全 8 回

# resource() の説明文：状態・params・reload・stream

> resource/api.ts・resource.ts の未読の行：ResourceStatus の各値、params が undefined のとき、reload と abort、set と update でローカルになる約束、stream の形、hasValue と error。本物の resource で状態の表を作り、reload の説明文と stream の undefined の食い違いを見る。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crh-resource)

---

この章で分かること：`resource()` の説明文（API リファレンスに載る JSDoc）が約束していること（6 つの状態、`params` が `undefined` のとき、`reload()` と abort、`set()` と `update()` で `local` になること、`stream` の形、`error` のときの `value()` と `hasValue()`）を、このページの上の本物の `resource()` で 1 つずつ確かめます。ほとんどは説明文のとおりに動きました。合わなかったのは 2 つで、`reload()` の「実際の読み込みが始まるまで `reloading` にならない」（api.ts L156〜157）と、型が許している「`stream` が `undefined` を返す」で `status()` が `TypeError` を投げることです。

読む対象は `packages/core/src/resource/` の `api.ts`・`resource.ts`・`from_snapshots.ts`（../angular、8576f161ae4）のうち、まだどの章も引いていない行です。実装の中心（`ResourceImpl` の 3 つの signal と `loadEffect`）は[resource の章](../signals/15-resource.md)、`params` から状態を返す仕組みは[ResourceParamsStatus と chain() の章](../resx/01-resx-params-status.md)、エラーの包み方は[エラーの包み方の章](../resx/03-resx-errors.md)、abort と後片付けは[後片付けと漏れの章](../resx/05-resx-cleanup-leaks.md)、`id` と TransferState は[SSR と resource の章](../resx/04-resx-ssr-cache.md)にあります。`httpResource` はこの章では扱いません（[httpResource と rxResource の章](../signals/16-signals-http-resource.md)）。

1. [1. ハイドレーションの公開 API と型](01-crh-hydration-api.md)
2. [2. ngh の書き出し](02-crh-hydration-annotate.md)
3. [3. ノードの探し方と不一致](03-crh-hydration-errors.md)
4. [4. @defer](04-crh-defer.md)
5. **5. resource()**（この章）
6. [6. Renderer2](06-crh-renderer.md)
7. [7. 開発用の小道具](07-crh-dev-utils.md)
8. [8. spec と issue](08-crh-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> `resource()` は「signal の値（`params`）が変わるたびに非同期の読み込み（`loader`）を走らせ、結果を signal で見せる」物です。説明文の約束を確かめるときは、「同期で読んだとき」と「effect（読み込みを始める係）が走った後」を分けて見ます。`params` を変えた直後に状態はもう変わっていますが、`loader` が呼ばれるのは effect が走ったときだからです。この章の表には、その 2 つを別の行で書いています。

## 1. resource()：読み取り用、止めるのは AbortSignal で

📄 `angular/packages/core/src/resource/resource.ts` L52–67 （▶ の行: 60–62, 67）

```ts
52 │ export function resource<T, R>(
53 │   options: ResourceOptions<T, R> & {defaultValue: NoInfer<T>},
54 │ ): ResourceRef<T>;
55 │ 
56 │ /**
57 │  * Constructs a `Resource` that projects a reactive request to an asynchronous operation defined by
58 │  * a loader function, which exposes the result of the loading operation via signals.
59 │  *
60 ▶  * Note that `resource` is intended for _read_ operations, not operations which perform mutations.
61 ▶  * `resource` will cancel in-progress loads via the `AbortSignal` when destroyed or when a new
62 ▶  * request object becomes available, which could prematurely abort mutations.
63 │  *
64 │  * @publicApi 22.0
65 │  * @see [Async reactivity with resources](guide/signals/resource)
66 │  */
67 ▶ export function resource<T, R>(options: ResourceOptions<T, R>): ResourceRef<T | undefined>;
```

`defaultValue` を渡さない方の宣言（67 行目、戻りの型は `ResourceRef<T | undefined>`）の説明です。`defaultValue` を渡す方（L52〜54）の説明（L40〜51）は[httpResource の章](../signals/16-signals-http-resource.md)が引いていて、文は同じです。60〜62 行目は「`resource` は読み取り用。破棄されたときと、新しい request が来たときに、読み込み中の物を `AbortSignal` で止めるので、書き込み（mutation）を途中で止めてしまうことがある」と言います。

止める所は 3 か所です。新しい読み込みの前（resource.ts L428、`loadEffect` の中）、`destroy()`（L401）、`set()`（L382）。説明文は前の 2 つを挙げ、`set()` は挙げていません。DEMO の 2 では、`'a'` の読み込み中に `params` を `'b'` にすると、effect が走った時点で `'a'` に abort が届き（理由は `AbortError`）、`'a'` の Promise が後で解決しても値は `'B'` のままでした（L480 の `shouldDiscard`）。`'c'` の読み込み中の `set()` と、`'d'` の読み込み中の `destroy()` でも、その場で abort が届きました。3 つの実装は[resource の章](../signals/15-resource.md)の 5〜6 節にあります。

## 2. Resource と WritableResource：value は WritableSignal、set は local へ

📄 `angular/packages/core/src/resource/api.ts` L80–89 （▶ の行: 82, 85–86）

```ts
80 │ 
81 │ /**
82 ▶  * A Resource is an asynchronous dependency (for example, the results of an API call) that is
83 │  * managed and delivered through signals.
84 │  *
85 ▶  * The usual way of creating a `Resource` is through the `resource` function, but various other APIs
86 ▶  * may present `Resource` instances to describe their own concepts.
87 │  *
88 │  * @publicApi 22.0
89 │  */
```

📄 `angular/packages/core/src/resource/api.ts` L126–133 （▶ の行: 128, 130）

```ts
126 │ 
127 │ /**
128 ▶  * A `Resource` with a mutable value.
129 │  *
130 ▶  * Overwriting the value of a resource sets it to the 'local' state.
131 │  *
132 │  * @publicApi 22.0
133 │  */
```

📄 `angular/packages/core/src/resource/api.ts` L142–162 （▶ の行: 143, 145, 148, 150–151）

```ts
142 │   /**
143 ▶    * Convenience wrapper for `value.set`.
144 │    */
145 ▶   set(value: T): void;
146 │ 
147 │   /**
148 ▶    * Convenience wrapper for `value.update`.
149 │    */
150 ▶   update(updater: (value: T) => T): void;
151 ▶   asReadonly(): Resource<T>;
152 │ 
153 │   /**
154 │    * Instructs the resource to re-load any asynchronous dependency it may have.
155 │    *
156 │    * Note that the resource will not enter its reloading state until the actual backend request is
157 │    * made.
158 │    *
159 │    * @returns true if a reload was initiated, false if a reload was unnecessary or unsupported
160 │    */
161 │   reload(): boolean;
162 │ }
```

85〜86 行目「`Resource` は `resource` 関数のほか、いろいろな API が自分の概念を表すのに使う」は、`httpResource`・`rxResource`・`debounced`・`resourceFromSnapshots` がどれも `Resource` を返すことを指しています。130 行目「値を上書きすると `local` になる」と、143・148 行目「`set` と `update` は `value.set` と `value.update` の便利な包み」は、実装では向きが逆です。

📄 `angular/packages/core/src/resource/resource.ts` L112–136 （▶ の行: 114, 126–129, 131–132）

```ts
112 │ 
113 │ /**
114 ▶  * Base class which implements `.value` as a `WritableSignal` by delegating `.set` and `.update`.
115 │  */
116 │ abstract class BaseWritableResource<T> implements WritableResource<T> {
117 │   readonly value: WritableSignal<T>;
118 │   abstract readonly status: Signal<ResourceStatus>;
119 │   abstract readonly error: Signal<Error | undefined>;
120 │ 
121 │   abstract reload(): boolean;
122 │ 
123 │   readonly isLoading: Signal<boolean>;
124 │ 
125 │   constructor(value: Signal<T>, debugName: string | undefined) {
126 ▶     this.value = value as WritableSignal<T>;
127 ▶     this.value.set = this.set.bind(this);
128 ▶     this.value.update = this.update.bind(this);
129 ▶     this.value.asReadonly = signalAsReadonlyFn;
130 │ 
131 ▶     this.isLoading = computed(
132 ▶       () => this.status() === 'loading' || this.status() === 'reloading',
133 │       ngDevMode ? createDebugNameObject(debugName, 'isLoading') : undefined,
134 │     );
135 │   }
136 │ 
```

`value` はもともと `computed`（読むだけの signal）で、126〜129 行目でその関数に `set`・`update`・`asReadonly` を後から取り付けて `WritableSignal` の形にします。127 行目のとおり `value.set` の中身は `ResourceImpl.set` なので、「`set` が `value.set` を包む」のではなく「`value.set` が `set` を呼ぶ」です。どちらを呼んでも同じ所に着くので、約束としては合っています（DEMO の 3、`value.set('value.set で')` の行も `local`）。131〜132 行目の `isLoading` は `loading` と `reloading` のときだけ `true` で、108 行目（[resource の章](../signals/15-resource.md)の引用）の「新しい値を読み込み中（または読み込み直し中）」のとおりです。

📄 `angular/packages/core/src/resource/resource.ts` L171–194 （▶ の行: 172–173, 178, 189–190, 192）

```ts
171 │ 
172 ▶   asReadonly(): Resource<T> {
173 ▶     return this;
174 │   }
175 │ }
176 │ 
177 │ /**
178 ▶  * Implementation for `resource()` which uses a `linkedSignal` to manage the resource's state.
179 │  */
180 │ export class ResourceImpl<T, R> extends BaseWritableResource<T> implements ResourceRef<T> {
181 │   private readonly pendingTasks: PendingTasks;
182 │ 
183 │   /**
184 │    * The current state of the resource. Status, value, and error are derived from this.
185 │    */
186 │   private readonly state: WritableSignal<ResourceState<T>>;
187 │ 
188 │   /**
189 ▶    * Combines the current request with a reload counter which allows the resource to be reloaded on
190 ▶    * imperative command.
191 │    */
192 ▶   protected readonly extRequest: WritableSignal<WrappedRequest>;
193 │   private readonly effectRef: EffectRef;
194 │ 
```

151 行目の `asReadonly()` は、172〜173 行目のとおり**自分自身を返すだけ**です。読み取り専用にするのは型（`Resource<T>`）だけで、返った物に `set` はまだ付いています。spec の `should convert writable resource to its read-only version`（resource\_spec.ts 646）も `@ts-expect-error` で型の上だけを確かめています。189〜192 行目の `extRequest` は「今の request と reload の回数を 1 つにまとめた物」で、3 節の `reload()` はこの回数を 1 増やすだけです。

## 3. reload()：「読み込みが始まるまで reloading にならない」は今は違う

もう一度 2 節の 154〜161 行目を見ます。156〜157 行目は「実際のバックエンドへの要求が出るまで、resource は reloading の状態に入らない」、159 行目は「読み込み直しを始めたら `true`、不要か未対応なら `false`」です。DEMO の 1 の記録（ページでも Node でも同じ）は次のとおりでした。

| 操作 | 戻り値 | その直後の status() | loader の呼び出し |
| --- | --- | --- | --- |
| resolved のときに `reload()` | `true` | `reloading`（value は前の `"A"`） | まだ 1 回（呼ばれていない） |
| 続けてもう一度 `reload()` | `false` | `reloading` | まだ 1 回 |
| effect が走った後 |   | `reloading` | 2 回目（`previous.status="resolved"`） |
| idle のときに `reload()` | `false` | `idle` | 呼ばれない |
| local・error のときに `reload()`（DEMO の 3・4） | `true` | `reloading` | effect の後に呼ばれる |

`reload()` を呼んだその場で、`loader` が呼ばれる前に `reloading` になっています。`reload()`（resource.ts L385〜395）は `extRequest` の回数を増やすだけで、それを source にした `state` の `linkedSignal` が次に読まれたとき同期で計算し直し、`projectStatusOfState`（L578）が「loading で回数が 0 でない」を `reloading` と見せるからです（[resource の章](../signals/15-resource.md)の 3・6 節）。

156〜157 行目は 18d8d44b1f3（2024-10-12、``feat(core): experimental `resource()` API for async dependencies (#58255)``）の最初の版からある文です。そのころの `reload()` は回数の signal を増やすだけで、状態を `Reloading` に変えるのは effect の中の `loadEffect` でした。だから「要求を出すまで reloading にならない」は当時は正しい文でした。01fffdb5477（2024-12-02、`refactor(core): port resource() to linkedSignal() (#59024)`）で状態が `linkedSignal` になり、同じ commit で spec に `should synchronously change states`（resource\_spec.ts 662）が足されました。その it は L683〜685 で `// Reload state should be synchronous.` と書き、`reload()` の直後に `reloading` を期待しています。実装と spec は「同期で変わる」に揃い、説明文だけが残りました。新しい本家（origin/main の d201dd76ef2、2026-11-20）の api.ts L157 も同じ文です。

159 行目の `false` の条件は、実装では「内部の状態が `idle` か `loading`」（L388）です。内部の `loading` には `reloading` も含まれるので、読み込み直し中の `reload()` も `false` でした。「未対応」の `false` を返す実装は `ResourceImpl` にはありません。

## 4. ResourceRef.destroy() と ResourceLoaderParams

📄 `angular/packages/core/src/resource/api.ts` L163–184 （▶ の行: 165, 174, 176, 180–181）

```ts
163 │ 
164 │ /**
165 ▶  * A `WritableResource` created through the `resource` function.
166 │  *
167 │  * @publicApi 22.0
168 │  */
169 │ export interface ResourceRef<T> extends WritableResource<T> {
170 │   hasValue(this: T extends undefined ? this : never): this is ResourceRef<Exclude<T, undefined>>;
171 │ 
172 │   hasValue(): boolean;
173 │   /**
174 ▶    * Manually destroy the resource, which cancels pending requests and returns it to `idle` state.
175 │    */
176 ▶   destroy(): void;
177 │ }
178 │ 
179 │ /**
180 ▶  * Parameter to a `ResourceLoader` which gives the request and other options for the current loading
181 ▶  * operation.
182 │  *
183 │  * @publicApi 22.0
184 │  */
```

174 行目「手で破棄する。読み込み中の要求を止め、`idle` に戻す」は、DEMO の 2 の `destroy()` の行のとおりでした（その場で abort、`idle`、値は `defaultValue`）。そのあとの `set()` は何もしません（resource.ts L352 の `destroyed`）。説明文に書かれていない約束ですが、破棄した resource を `local` に戻せないのは実装の決まりです。180〜181 行目の「今の読み込みの request と、ほかのオプション」の中身（L185〜191、`params`・`abortSignal`・`previous.status`）は[resource の章](../signals/15-resource.md)が引いています。記録で `loader` に届いた `previous.status` は、最初が `idle`、resolved からの reload が `resolved`、読み込み中に `params` を変えたときが `loading`、`set()` の後が `local`、失敗の後の reload が `error` でした。

## 5. params・defaultValue・equal

📄 `angular/packages/core/src/resource/api.ts` L208–233 （▶ の行: 216–217, 219, 224–225, 230）

```ts
208 │ 
209 │ /**
210 │  * Options to the `resource` function, for creating a resource.
211 │  *
212 │  * @publicApi 22.0
213 │  */
214 │ export interface BaseResourceOptions<T, R> {
215 │   /**
216 ▶    * A reactive function which determines the request to be made. Whenever the request changes, the
217 ▶    * loader will be triggered to fetch a new value for the resource.
218 │    *
219 ▶    * If a params function isn't provided, the loader won't rerun unless the resource is reloaded.
220 │    */
221 │   params?: (ctx: ResourceParamsContext) => R;
222 │ 
223 │   /**
224 ▶    * The value which will be returned from the resource when a server value is unavailable, such as
225 ▶    * when the resource is still loading.
226 │    */
227 │   defaultValue?: NoInfer<T>;
228 │ 
229 │   /**
230 ▶    * Equality function used to compare the return value of the loader.
231 │    */
232 │   equal?: ValueEqualityFn<T>;
233 │ 
```

219 行目「`params` を渡さなければ、reload しない限り `loader` は走り直さない」は、`resource()` の L76 の `options.params ?? oldNameForParams ?? (() => null!)` の結果です。`null` は `undefined` ではないので 1 回は読み込み、どの signal も読まないので 2 回目は来ません（DEMO の 6 は `params: () => undefined` にして読み込ませていません）。224〜225 行目の `defaultValue` は「サーバーの値が無いとき（読み込み中など）に返す値」です。記録では `idle`・`loading`・`destroy()` の後に `"(既定)"` が返り、`error` のときだけは返さずに投げました（6 節の表）。

📄 `angular/packages/core/src/resource/resource.ts` L538–545 （▶ の行: 540, 543）

```ts
538 │ 
539 │ /**
540 ▶  * Wraps an equality function to handle either value being `undefined`.
541 │  */
542 │ function wrapEqualityFn<T>(equal: ValueEqualityFn<T>): ValueEqualityFn<T | undefined> {
543 ▶   return (a, b) => (a === undefined || b === undefined ? a === b : equal(a, b));
544 │ }
545 │ 
```

230 行目の `equal` は「`loader` の戻り値を比べる関数」とだけ書かれています。実装では 543 行目で「どちらかが `undefined` なら `===`、そうでなければ `equal`」に包まれて `value` の `computed` に渡され（L240）、`set()` の「`local` のときに同じ値なら何もしない」（L361〜365）にも使われます。DEMO の 3 では大文字小文字を区別しない `equal` を渡しました。resolved の `"A"` に `set('A')` すると、比べずに `local` へ移り（`snapshot()` は別の物）、local の `"A"` に `set('a')` すると何も変わりませんでした（`snapshot()` は同じ物、値も `"A"` のまま）。`set()` で比べるのは `local` のときだけです。

## 6. loader と stream：stream が undefined を返すと status() が投げる

📄 `angular/packages/core/src/resource/api.ts` L246–279 （▶ の行: 253, 258, 260, 270–271, 273, 276, 278）

```ts
246 │ /**
247 │  * Options to the `resource` function, for creating a resource.
248 │  *
249 │  * @publicApi 22.0
250 │  */
251 │ export interface PromiseResourceOptions<T, R> extends BaseResourceOptions<T, R> {
252 │   /**
253 ▶    * Loading function which returns a `Promise` of the resource's value for a given request.
254 │    */
255 │   loader: ResourceLoader<T, R>;
256 │ 
257 │   /**
258 ▶    * Cannot specify `stream` and `loader` at the same time.
259 │    */
260 ▶   stream?: never;
261 │ }
262 │ 
263 │ /**
264 │  * Options to the `resource` function, for creating a resource.
265 │  *
266 │  * @publicApi 22.0
267 │  */
268 │ export interface StreamingResourceOptions<T, R> extends BaseResourceOptions<T, R> {
269 │   /**
270 ▶    * Loading function which returns a `Promise` of a signal of the resource's value for a given
271 ▶    * request, which can change over time as new values are received from a stream.
272 │    */
273 ▶   stream: ResourceStreamingLoader<T, R>;
274 │ 
275 │   /**
276 ▶    * Cannot specify `stream` and `loader` at the same time.
277 │    */
278 ▶   loader?: never;
279 │ }
```

📄 `angular/packages/core/src/resource/resource.ts` L565–574 （▶ の行: 569）

```ts
565 │ 
566 │ function isStreamingResourceOptions<T, R>(
567 │   options: ResourceOptions<T, R>,
568 │ ): options is StreamingResourceOptions<T, R> {
569 ▶   return !!(options as StreamingResourceOptions<T, R>).stream;
570 │ }
571 │ 
572 │ /**
573 │  * Project from a state with `ResourceInternalStatus` to the user-facing `ResourceStatus`
574 │  */
```

258・276 行目「`stream` と `loader` は同時に指定できない」は、260・278 行目の `never` で型が止めます。型を外して両方渡すと、569 行目は `stream` があるかだけを見るので `stream` が使われます。270〜271 行目は `stream` を「値の signal の `Promise` を返す関数」と書きますが、273 行目の `ResourceStreamingLoader`（L205〜207）は 4e331062e83（2026-03-02、`feat(core): allow synchronous values for stream Resources`）から「signal をそのまま返す」と「`undefined` を返す」も許しています。DEMO の 5 の記録は次のとおりでした。

| stream が返す物 | effect が走った後 | そのあと |
| --- | --- | --- |
| `Promise<Signal>`（20 ms 後） | `loading`、値 `undefined` | 解決で `resolved`・`1`。signal に `{value: 2}` で `2`（loading を通らない）、`{error}` で `error`、`{value: 3}` で `resolved` に戻る。`destroy()` で abort が届く |
| `Signal`（同期） | `resolved`・`10`（L462〜472、`await` を挟まない） |   |
| `undefined` | `status()`・`hasValue()`・`isLoading()` が `TypeError: state.stream is not a function` を投げる（このページの本番ビルドでは変数の名前が縮められて `e.stream is not a function`）。`value()` は `undefined` |   |

`undefined` の行が 2 つ目の食い違いです。`loadEffect` は `await undefined` のあと、`stream: undefined` のまま `status: 'resolved'` を書きます（L484〜489。L492 は `resolvedStream` が無いときを考えて `undefined` にしています）。ところが `projectStatusOfState` の `resolved` の枝（L580）は `state.stream!()` と、stream があると決めつけて呼ぶので、`status` の `computed` が投げ、それを読む `isLoading`・`isError`（→ `hasValue`）も投げます。`value` の `computed`（L223〜227）は `stream?.()` と書いてあるので `defaultValue` を返します。型（L207）が許していて、実装の半分（L492）も備えているのに、状態の投影だけが備えていない、という形です。origin/main の resource.ts でも同じ行（L613）が `state.stream!()` のままでした。gh で「stream undefined」「state.stream is not a function」を探しても、issue も PR も見当たりません。

## 7. debugName・ResourceStreamItem・ResourceSnapshot

📄 `angular/packages/core/src/resource/api.ts` L281–310 （▶ の行: 289, 291, 297, 300, 306–309）

```ts
281 │ /**
282 │  * @publicApi 22.0
283 │  */
284 │ export type ResourceOptions<T, R> = (
285 │   | PromiseResourceOptions<T, R>
286 │   | StreamingResourceOptions<T, R>
287 │ ) & {
288 │   /**
289 ▶    * A debug name for the reactive node. Used in Angular DevTools to identify the node.
290 │    */
291 ▶   debugName?: string;
292 │ };
293 │ 
294 │ /**
295 │  * @publicApi 22.0
296 │  */
297 ▶ export type ResourceStreamItem<T> = {value: T} | {error: Error};
298 │ 
299 │ /**
300 ▶  * An explicit representation of a resource's state.
301 │  *
302 │  * @publicApi 22.0
303 │  * @see [Resource composition with snapshots](guide/signals/resource#resource-composition-with-snapshots)
304 │  */
305 │ export type ResourceSnapshot<T> =
306 ▶   | {readonly status: 'idle'; readonly value: T}
307 ▶   | {readonly status: 'loading' | 'reloading'; readonly value: T}
308 ▶   | {readonly status: 'resolved' | 'local'; readonly value: T}
309 ▶   | {readonly status: 'error'; readonly error: Error};
310 │ 
```

📄 `angular/packages/core/src/resource/resource.ts` L589–601 （▶ の行: 593, 598）

```ts
589 │ 
590 │ /**
591 │  * Creates a debug name object for an internal signal.
592 │  */
593 ▶ function createDebugNameObject(
594 │   resourceDebugName: string | undefined,
595 │   internalSignalDebugName: string,
596 │ ): {debugName?: string} {
597 │   return {
598 ▶     debugName: `Resource${resourceDebugName ? '#' + resourceDebugName : ''}.${internalSignalDebugName}`,
599 │   };
600 │ }
601 │ 
```

289 行目「Angular DevTools でノードを見分けるための名前」の `debugName` は、598 行目で `Resource#<名前>.<中の signal の名前>` になります。呼ぶ側は全部 `ngDevMode ? createDebugNameObject(...) : undefined` の形（例えば L133・L240）なので、本番では付きません。DEMO の 6 は、Node の開発モードの記録で `value: "Resource#user.value"`・`status: "Resource#user.status"` ほか、このページ（本番ビルド）では全部 `undefined` でした。この関数は 63180067aa3（2025-09-29）で入り、fc65107506e（2025-10-14）でいったん戻され、3ae452e64f8（同じ題）でもう一度入りました。

297 行目の `ResourceStreamItem` は `{value}` か `{error}` のどちらかで、6 節の stream の signal に入れた物です。306〜309 行目の `ResourceSnapshot` は、`error` のときだけ `value` を持ちません。DEMO の 4 で `snapshot()` を読むと `status="error"`、`'value' in snapshot` は `false` でした（`snapshot` の実装 L157〜165 は[resource の章](../signals/15-resource.md)の 8 節）。

📄 `angular/packages/core/src/resource/from_snapshots.ts` L13–20 （▶ の行: 14, 18）

```ts
13 │ 
14 ▶ /**
15 │  * Creates a `Resource` driven by a source of `ResourceSnapshot`s.
16 │  *
17 │  * @see [Resource composition with snapshots](guide/signals/resource#resource-composition-with-snapshots)
18 ▶  *
19 │  * @experimental
20 │  */
```

📄 `angular/packages/core/src/resource/from_snapshots.ts` L47–54 （▶ の行: 47–48）

```ts
47 ▶ 
48 ▶   hasValue(this: T extends undefined ? this : never): this is Resource<Exclude<T, undefined>>;
49 │   hasValue(): boolean;
50 │   hasValue(): boolean {
51 │     return this.isValueDefined();
52 │   }
53 │ }
54 │ 
```

`resourceFromSnapshots`（14 行目「`ResourceSnapshot` の流れから `Resource` を作る」、18 行目で `@experimental`）の `hasValue` は、47〜48 行目で「`error` でなく、値が `undefined` でない」です。`ResourceImpl` の `isValueDefined`（L147〜154、先に `isError` を見る）と同じ決め方なので、どちらの `Resource` でも `error` のときの `hasValue()` は投げずに `false` です。

## 8. 6 つの状態の説明文と、記録の照らし合わせ

`ResourceStatus` の説明（api.ts L56〜79）は[resource の章](../signals/15-resource.md)の 1 節が引いています。その各行と、DEMO の記録を並べます。

| 状態 | 説明文（L56〜79） | 記録の value() | hasValue() | 合っているか |
| --- | --- | --- | --- | --- |
| `idle` | request が無く、読み込まない。`value()` は `undefined`（L61〜62） | `defaultValue`（無ければ `undefined`）。`loader` は 0 回 | `defaultValue` があれば `true` | 合う（`defaultValue` の場合は L224〜225 が言う） |
| `loading` | 依存が変わって新しい値を読み込み中。`value()` は `undefined`（L64〜65） | 同上 | 同上 | 合う（同上） |
| `reloading` | 同じ依存で読み込み直し中。前の値を返し続ける（L67〜69） | 前の値（local の後なら local の値）。error の後の reload では `defaultValue`（L229〜231） | `true` | 合う。ただし「いつ入るか」は 3 節 |
| `error` | 失敗した。`value()` は `undefined`（L71） | **投げる**（`ResourceValueError`、cause が元のエラー） | `false`（投げない） | 合わない。L92 は「投げる」と書く。origin/main の b8622e0fa26（2026-10-23）で直った |
| `resolved` | 読み込みが終わり、`loader` の値を持つ（L73） | `loader` の値 | 値が `undefined` でなければ `true` | 合う |
| `local` | `set()` か `update()` で値を入れた（L75） | 入れた値 | 同上 | 合う |

`error` のときの `value()` の文は、このページ（本番）では `読めない: bad` だけ（クラスの名前も縮められるので、表では「Error のサブクラス」と出します）、Node の開発モードでは `ResourceValueError` で `Resource is currently in an error state (see Error.cause for details): 読めない: bad` でした（L612〜616 の `ngDevMode` の枝、[エラーの包み方の章](../resx/03-resx-errors.md)）。b8622e0fa26 は L71 を「`value()` を読むと投げる。先に `hasValue()` か `error()` で確かめる」に書き換えた commit で、まだサイトの 22.2.6 には入っていません。

> **🧪 DEMO — 本物の resource() の状態の移り変わり**
>
> 押すと、このページの `EnvironmentInjector` を `injector` に渡して `resource()` を作り、`params` を変える・`reload()`・`set()`・`destroy()` などをしながら、操作のたびに `status()`・`value()`・`hasValue()`・`isLoading()`・`error()` を読んで表にします。時刻は作ってからの ms です。`loader` はこのページの中の `setTimeout` で解決する Promise で、外への通信はしません。どの resource も最後に `destroy()` します。「Node の記録」は、同じ関数を Node（domino の上の JIT、開発モード）で動かした記録の再生で、開発モードだけの文（`ResourceValueError` の前置きと `debugName`）を見比べられます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crh-resource)

## ここまでの呼び出し

- 👤 `res.reload()`
  - `ResourceImpl.reload()` — resource.ts L385〜395 — *内部の status が idle / loading なら false*
    - `extRequest.update({request, reload: reload + 1})` — L393
- 👤 `res.status()`（同じ同期の中で）
  - `state`（linkedSignal）の computation
    - `request が同じなので前の stream を引き継ぐ、status = 'loading'` — L306〜309
  - `projectStatusOfState → 'reloading'` — L578 — *loader はまだ呼ばれていない（L156〜157 と違う）*
- `（変更検知の中で）loadEffect` — L412〜
  - `abortInProgressLoad → loaderFn({params, abortSignal, previous})` — L428・L449
  - `state.set({status: 'resolved', stream})` — L484〜489 — *stream が undefined だと、次の status() が L580 で投げる*

## テストと直し方

| ファイル（packages/core/test/resource/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `resource_spec.ts` | `resource`（87）› `should synchronously change states`（662） | 3 節：reload の直後に `reloading`（L683〜685）。説明文 L156〜157 と反対のことを固めている |
| `resource_spec.ts` | `should allow re-fetching data`（594） | 3 節：`reloading` の間は前の値、続けての reload で要求は増えない |
| `resource_spec.ts` | `should _not_ load if the request resolves to undefined`（414） | 8 節の `idle` |
| `resource_spec.ts` | `should cancel pending requests before starting a new one`（432）・`should cancel pending requests when the resource is manually destroyed`（497）・`set() should abort a pending load`（690） | 1 節の 3 か所の abort |
| `resource_spec.ts` | `should allow setting local state`（556）・`should respect provided equality function for the results signal`（628） | 2・5 節の `local` と `equal` |
| `resource_spec.ts` | `should convert writable resource to its read-only version`（646） | 2 節の `asReadonly`（型だけ） |
| `resource_spec.ts` | `should allow streaming`（752）・`should allow async streaming`（780）・`should transition across streamed states`（887） | 6 節の stream。`undefined` を返す it は無い |
| `resource_spec.ts` | `should throw an error when getting a value even when provided with a default value`（382）・`should return default value when getting a value after reloading in the error state`（993） | 8 節の `error` と、error からの reload |
| `resource_spec.ts` | `should report idle status as the previous status on first run`（121） | 4 節の最初の `previous.status` |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test/resource:resource --nocache_test_results --test_output=errors
//packages/core/test/resource:resource   PASSED（70 specs, 0 failures）

# 記録（Node、domino の上の JIT、@angular/core 22.2.6）
$ node record.mjs <angular-deep-dive> crh-resource.demo-res.ts <関数名> '[["$ENV"]]' [prod]
#   "$ENV" は platform-browser の createApplication（provideZonelessChangeDetection）で作った EnvironmentInjector
```

直すとしたら、説明文は api.ts の 156〜157 行目を「`reload()` を呼ぶとすぐ `reloading` になり、`loader` は次の effect で呼ばれる」の向きにするか消すのが 1 行の変更です。`stream` の `undefined` は、resource.ts の `projectStatusOfState`（L580）を「stream が無ければ `resolved`」にするのが小さな直し方で、spec は resource\_spec.ts の `should allow streaming`（752）の隣に「`stream: () => undefined` で `status()` が投げない」を足します。直し方の向き（`undefined` を「値が `undefined` の resolved」と見るか、`idle` と見るか）は 4e331062e83 の意図（SSR で同期に値を決める）しだいで、型の説明（L270〜271）もあわせて書き足すことになります。

## 聞かれそうな質問

**Q. `reload()` を呼んだら、すぐ `isLoading()` は `true` になりますか？**

なります。`reload()`（L393）が回数を増やした直後に `state` の linkedSignal が計算し直され、`status()` は `reloading`、`isLoading()` は `true` です。`loader` はまだ呼ばれていません。説明文 L156〜157 の「要求を出すまで reloading にならない」は 2024-12 の書き換えより前の話です。

**Q. `error` のときに `value()` を読むとどうなりますか？**

`ResourceValueError` を投げます（L234〜235）。`defaultValue` を渡していても投げます。`hasValue()` は投げずに `false` を返すので、テンプレートでは `hasValue()` で守ってから読みます。L71 の「`undefined`」は origin/main で直りました。

**Q. `set()` した後に `params` が変わったら？**

新しい request で読み込み直します。`local` は `state` を手で書いただけなので、`extRequest` が変われば linkedSignal が `loading` に計算し直します。`local` の間に `reload()` しても読み込み、その間は local の値を返します（DEMO の 3）。

**Q. `asReadonly()` で渡せば、受け取った側は `set` できませんか？**

型の上ではできません。実体は同じ物（L172〜173）なので、型を外せば `set` は動きます。

**Q. `stream` で `undefined` を返してよいですか？**

型（L207）は許していますが、8576f161ae4 でも 22.2.6 でも origin/main でも、`status()`・`hasValue()`・`isLoading()` が `TypeError` を投げます（L580）。値が無いことを伝えるなら、`signal({value: undefined})` を返します。

## 読み終えて

- `resource()` が読み込みを止める所は 3 つ（新しい request・`destroy()`・`set()`）。説明文は前の 2 つを挙げる。
- `value.set` は `ResourceImpl.set` を呼ぶ。`asReadonly()` は自分を返し、型だけで隠す。
- `reload()` は同期で `reloading` にする。L156〜157 は最初の版の文で、spec は反対を固めている。
- `equal` は値の computed と、`local` のときの `set()` の両方で使われる。
- `stream` が `undefined` を返すと、`status()` が L580 で投げる。`debugName` は開発モードだけ。

---

← 前: [@defer の実装のコメントと説明文](04-crh-defer.md)  
次: [Renderer2 の各メソッドと、i18n の token・animation の検査の説明文](06-crh-renderer.md) →
