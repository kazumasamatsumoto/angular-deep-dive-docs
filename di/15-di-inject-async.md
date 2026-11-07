[目次](../README.md) › [DI の内側](README.md) › 第 15 回 / 全 16 回

# injectAsync と onIdle：サービスを遅延読み込みする新しい API

> injectAsync(() =&gt; import(...)) は注入コンテキストで inject(Injector) を捕まえ、呼ばれたときに 1 回だけ loader を実行して injector.get する関数を返す。maybeUnwrapDefaultExport による default export の扱い、prefetch オプションと onIdle が IDLE\_SERVICE の requestOnIdle を Promise にする行。@defer の idle トリガーとの関係と、使い所。

angular/angular · 読了 約 10 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/di-inject-async)

---

`injectAsync(() => import('./heavy.service'))` は、サービスのコードを別チャンクに追い出し、使う直前に読み込むための v22 の API です。中身は 36 行で、**注入コンテキストのうちに `inject(Injector)` を捕まえておき**、返した関数が呼ばれたら loader を 1 回だけ実行して `injector.get` するだけです。この章では、その 36 行と、`default export` を外す `maybeUnwrapDefaultExport`、`prefetch: onIdle` が `IDLE_SERVICE` の `requestOnIdle` を Promise にする行を読み、`@defer` の idle トリガーとの関係を確かめます。

読む対象は `packages/core/src/di/inject_async.ts`、`util/default_export.ts`、`defer/idle_service.ts`、`defer/idle_scheduler.ts`、`di/index.ts` です。

1. [1. 概観](01-di-overview.md)
2. [2. inject() の実装](02-di-inject-function.md)
3. [3. 注入コンテキスト](03-di-injection-context.md)
4. [4. ɵfac の生成](04-di-factory.md)
5. [5. @Injectable と @Service](05-di-injectable-compile.md)
6. [6. InjectionToken と特殊トークン](06-di-injection-token.md)
7. [7. provider の 4 つの形](07-di-provider-to-factory.md)
8. [8. R3Injector.get の全手順](08-di-r3-injector-get.md)
9. [9. multi: true](09-di-multi-providers.md)
10. [10. ブルームフィルタ](10-di.md)
11. [11. NodeInjector の探索](11-di-node-injector-lookup.md)
12. [12. self・skipSelf・host・optional](12-di-resolution-flags.md)
13. [13. provider 無しで取れるトークン](13-di-special-tokens.md)
14. [14. DestroyRef と破棄](14-di-destroy.md)
15. **15. injectAsync と onIdle**（この章）
16. [16. DevTools と injector profiler](16-di-debug.md)

## 1. 公開 API で、条件が 1 つある

📄 `angular/packages/core/src/di/index.ts` L15–25 （▶ の行: 20）

```ts
15 │ export {assertInInjectionContext, runInInjectionContext} from './contextual';
16 │ export {forwardRef, ForwardRefFn, resolveForwardRef} from './forward_ref';
17 │ export {HostAttributeToken} from './host_attribute_token';
18 │ export {HOST_TAG_NAME} from './host_tag_name_token';
19 │ export {ENVIRONMENT_INITIALIZER} from './initializer_token';
20 ▶ export {injectAsync, InjectAsyncOptions, onIdle, PrefetchTrigger} from './inject_async';
21 │ export {Injectable, InjectableDecorator, InjectableProvider} from './injectable';
22 │ export {InjectionToken} from './injection_token';
23 │ export {DestroyableInjector, Injector} from './injector';
24 │ export {inject, ɵɵinject, ɵɵinvalidFactoryDep} from './injector_compatibility';
25 │ export {INJECTOR} from './injector_token';
```

20 行目、`injectAsync` と `onIdle` は `di/index.ts` から `@angular/core` の公開 API として出ています。

📄 `angular/packages/core/src/di/inject_async.ts` L19–49 （▶ の行: 23, 34, 42, 48）

````ts
19 │ /**
20 │  * A helper function that allows to inject dependencies asynchronously,
21 │  * which can be useful in cases when the dependency is not needed immediately and can be loaded lazily.
22 │  *
23 ▶  * NOTE: To enable lazy loading, the injected service must be auto-provided. This means it should be decorated with either `@Injectable({providedIn: 'root'})` or `@Service()`.
24 │  *
25 │  * @param loader A function that returns a promise resolving to the injectable service
26 │  * @param options Configuration options for the async injection
27 │  *
28 │  * @returns A function that returns a promise resolving to the requested service instance.
29 │  *
30 │  * @usageNotes
31 │  *
32 │  * ```ts
33 │  * class MyCmp {
34 ▶  *  someSvc = injectAsync(() => import('..'));
35 │  *
36 │  *  async onClick() {
37 │  *    (await this.someSvc()).handleClick();
38 │  *  }
39 │  * }
40 │  *
41 │  * // we can also configure prefetching:
42 ▶  * injectAsync(.., {prefetch: onIdle})
43 │  * ```
44 │  *
45 │  * @see [Lazy loading services](guide/di/lazy-loading-services)
46 │  * @see [Injection context](guide/di/dependency-injection-context)
47 │  *
48 ▶  * @publicApi 22.0
49 │  */
````

48 行目の `@publicApi 22.0` が、v22.0 から安定版の公開 API であることを示します（`@experimental` や `@developerPreview` の印はありません）。23 行目の NOTE が唯一の条件です。「遅延読み込みするサービスは auto-provided、つまり `@Injectable({providedIn: 'root'})` か `@Service()` でなければならない」。理由は 2 節の 84 行目で分かります。

## 2. 本体：inject(Injector) を先に捕まえる

📄 `angular/packages/core/src/di/inject_async.ts` L50–85 （▶ の行: 50, 54, 58, 62–63, 66, 68, 70–71, 73, 76, 78–80, 83–84）

```ts
50 ▶ export function injectAsync<T>(
51 │   loader: () => Promise<ProviderToken<T>>,
52 │   options?: InjectAsyncOptions,
53 │ ): () => Promise<T>;
54 ▶ export function injectAsync<T>(
55 │   loader: () => Promise<DefaultExport<ProviderToken<T>>>,
56 │   options?: InjectAsyncOptions,
57 │ ): () => Promise<T>;
58 ▶ export function injectAsync<T>(
59 │   loader: () => Promise<InjectAsyncLoaderResult<T>>,
60 │   options?: InjectAsyncOptions,
61 │ ): () => Promise<T> {
62 ▶   if (ngDevMode) {
63 ▶     assertInInjectionContext(injectAsync);
64 │   }
65 │ 
66 ▶   const injector = inject(Injector);
67 │ 
68 ▶   let loadedPromise: Promise<InjectAsyncLoaderResult<T>> | null = null;
69 │   const load = () => {
70 ▶     if (!loadedPromise) {
71 ▶       loadedPromise = loader();
72 │     }
73 ▶     return loadedPromise;
74 │   };
75 │ 
76 ▶   if (options?.prefetch) {
77 │     options
78 ▶       .prefetch()
79 ▶       .then(() => load())
80 ▶       .catch(() => {});
81 │   }
82 │ 
83 ▶   // We can't use `inject` later on because of the async nature of the loader
84 ▶   return () => load().then((loadedToken) => injector.get(maybeUnwrapDefaultExport(loadedToken))!);
85 │ }
```

1. **50〜57 行目：overload は 2 つ**

   loader が「トークン（クラス）を resolve する Promise」を返す形（50 行目）と、「`default` にトークンを持つモジュール」を返す形（54 行目）。58 行目の実装はその和集合を受け取ります。`import('./x').then(m => m.Foo)` と `import('./x')`（default export）のどちらでも書けます。
2. **62〜64 行目：開発モードだけ `assertInInjectionContext`**

   フィールド初期化子やコンストラクタの外で呼ぶと、開発モードではここで NG0203 です（判定の中身は [第 3 回](03-di-injection-context.md)）。本番ではこの行が消えますが、次の 66 行目の `inject` が同じ理由で NG0203 を投げます。
3. **66 行目：`const injector = inject(Injector)`**

   **この関数の要はこの 1 行**です。コンポーネントのフィールドで呼べば、[第 13 回](13-di-special-tokens.md)の `createNodeInjector` によりホストの `NodeInjector` が、サービスの中で呼べばそのサービスを作っている `R3Injector` が返り、クロージャに保存されます。
4. **68〜74 行目：`load()` は loader を 1 回しか呼ばない**

   70 行目で `loadedPromise` が空のときだけ 71 行目で `loader()` を呼び、Promise を保存します。2 回目以降は 73 行目で同じ Promise を返すだけです。保存するのは Promise なので、読み込み中に 2 回呼ばれても `import()` は 1 回です。
5. **76〜81 行目：`prefetch` があればすぐ呼ぶ**

   78 行目、`options.prefetch()` は **injectAsync の中で同期的に**呼ばれます。返った Promise が resolve したら 79 行目で `load()`。80 行目の `.catch(() => {})` で、先読みの失敗は握りつぶします（本番の呼び出しで改めて失敗が表に出ます）。
6. **84 行目：返すのは「load して、捕まえた injector で get する」関数**

   `maybeUnwrapDefaultExport`（3 節）でモジュールならその `default` を取り出し、66 行目の `injector` の `get` に渡します。83 行目のコメントどおり、`then` の中は注入コンテキストではないので `inject` は使えません。だから先に捕まえておきます。`get` するトークンはどの `providers` にも書かれていないので、見つかるのは `ɵprov` の `providedIn` で自動的に作られる場合だけです （[ngmodule-provided-in](../ngmodule/10-ngmodule-provided-in.md)）。これが 1 節 23 行目の条件の理由です。

> [!NOTE]
> **ポイント**
>
> `injectAsync` 自身は DI の新しい仕組みを何も足していません。`inject(Injector)` の捕捉、Promise の 1 回化、`injector.get` の 3 つを組み合わせただけで、同じことは自分でも書けます。読み込みを遅らせられるのは、`import()` の先のクラスが**このファイルから静的に参照されない**からで、その分割をするのはビルド（esbuild）です。

## 3. default export を外す

📄 `angular/packages/core/src/util/default_export.ts` L9–37 （▶ の行: 12, 18, 23, 26, 29, 36）

```ts
 9 │ /**
10 │  * An ES Module object with a default export of the given type.
11 │  *
12 ▶  * @see {@link injectAsync}
13 │  * @see [Route#loadComponent](/api/router/Route#loadComponent)
14 │  * @see [LoadChildrenCallback](/api/router/LoadChildrenCallback)
15 │  *
16 │  * @publicApi
17 │  */
18 ▶ export interface DefaultExport<T> {
19 │   /**
20 │    * Default exports are bound under the name `"default"`, per the ES Module spec:
21 │    * https://tc39.es/ecma262/#table-export-forms-mapping-to-exportentry-records
22 │    */
23 ▶   default: T;
24 │ }
25 │ 
26 ▶ export function maybeUnwrapDefaultExport<T>(input: T | DefaultExport<T>): T {
27 │   // As per `isWrappedDefaultExport`, the `default` key here is generated by the browser and not
28 │   // subject to property renaming, so we reference it with bracket access.
29 ▶   return isWrappedDefaultExport(input) ? input['default'] : input;
30 │ }
31 │ 
32 │ function isWrappedDefaultExport<T>(value: T | DefaultExport<T>): value is DefaultExport<T> {
33 │   // We use `in` here with a string key `'default'`, because we expect `DefaultExport` objects to be
34 │   // dynamically imported ES modules with a spec-mandated `default` key. Thus we don't expect that
35 │   // `default` will be a renamed property.
36 ▶   return value && typeof value === 'object' && 'default' in value;
37 │ }
```

36 行目、「オブジェクトで、`'default' in value`」ならモジュールとみなし、29 行目で `input['default']` を返します。クラス（関数）なら 36 行目の `typeof value === 'object'` で外れ、そのまま返ります。27〜28 行目と 33〜35 行目のコメントにあるとおり、`default` は ES Module の仕様で決まる名前なので、プロパティ名の短縮を受けないよう文字列でアクセスしています。同じ関数は Router の `loadComponent` でも使われています（12 行目の `@see`）。

## 4. onIdle：IDLE\_SERVICE を Promise にする

📄 `angular/packages/core/src/di/inject_async.ts` L94–111 （▶ の行: 99, 111）

```ts
 94 │ export interface InjectAsyncOptions {
 95 │   /**
 96 │    * A trigger to eagerly prefetch the lazy-loaded dependency before it is requested.
 97 │    *
 98 │    */
 99 ▶   prefetch?: PrefetchTrigger;
100 │ }
101 │ 
102 │ /**
103 │  * A function that returns a promise which, when resolved, will trigger the prefetching of
104 │  * the lazy-loaded dependency.
105 │  *
106 │  * @see {@link onIdle}
107 │  * @see [Prefetching the dependency](guide/di/lazy-loading-services#prefetching-the-dependency)
108 │  *
109 │  * @publicApi 22.0
110 │  */
111 ▶ export type PrefetchTrigger = () => Promise<void>;
```

111 行目、`prefetch` に渡せるのは「`Promise<void>` を返す関数」なら何でもです。`onIdle` はその 1 つとして用意されたものです。

📄 `angular/packages/core/src/di/inject_async.ts` L113–145 （▶ の行: 117–120, 136–137, 140–142, 144）

````ts
113 │ /**
114 │  * A `PrefetchTrigger` helper function to provide the logic of triggering dependency loading
115 │  * when the browser becomes idle.
116 │  *
117 ▶  * Internally delegates to the configured {@link IdleService}, whose default implementation uses
118 ▶  * [`requestIdleCallback`](https://developer.mozilla.org/docs/Web/API/Window/requestIdleCallback)
119 ▶  * when available and falls back to `setTimeout` otherwise. The default behavior can be replaced
120 ▶  * with `provideIdleServiceWith`.
121 │  *
122 │  * @usageNotes
123 │  *
124 │  * ```ts
125 │  * injectAsync(import(...), {prefetch: onIdle})
126 │  *
127 │  * // or with custom idle options:
128 │  * injectAsync(import(...), {prefetch: () => onIdle({timeout: 100})})
129 │  * ```
130 │  *
131 │  * @see [Prefetching the dependency](guide/di/lazy-loading-services#prefetching-the-dependency)
132 │  *
133 │  * @publicApi 22.0
134 │  */
135 │ export function onIdle(options?: {timeout?: number}): Promise<void> {
136 ▶   if (ngDevMode) {
137 ▶     assertInInjectionContext(onIdle);
138 │   }
139 │ 
140 ▶   const idleService = inject(IDLE_SERVICE);
141 ▶   const {promise, resolve} = promiseWithResolvers<void>();
142 ▶   idleService.requestOnIdle(() => resolve(), options);
143 │ 
144 ▶   return promise;
145 │ }
````

1. **136〜137 行目：`onIdle` も注入コンテキストが要る**

   `{prefetch: onIdle}` と書いて動くのは、2 節 78 行目が `prefetch()` を injectAsync の中で同期的に呼ぶからです。`injectAsync` 自体が注入コンテキストで呼ばれているので、その中の `onIdle()` も注入コンテキストにいます。128 行目の例のように `() => onIdle({timeout: 100})` と包んでも同じ理由で動きます。
2. **140 行目：`inject(IDLE_SERVICE)`**

   `IdleService` インタフェース（`requestOnIdle` / `cancelOnIdle`）を持つ値を取ります。既定値は 5 節。
3. **141〜144 行目：resolve を idle コールバックに渡す**

   `promiseWithResolvers` で Promise とその `resolve` を作り、142 行目で「idle になったら `resolve()`」と登録して、144 行目で Promise を返します。`cancelOnIdle` は呼ばないので、一度登録した先読みは取り消せません。

## 5. IDLE\_SERVICE の既定値は requestIdleCallback

📄 `angular/packages/core/src/defer/idle_service.ts` L54–77 （▶ の行: 54–55, 68, 73–74）

```ts
54 ▶ export const IDLE_SERVICE = new InjectionToken<IdleService>(ngDevMode ? 'IDLE_SERVICE' : '', {
55 ▶   factory: () => new RequestIdleCallbackService(),
56 │ });
57 │ 
58 │ /**
59 │  * Configures Angular to use the given DI token as its `IdleService`.
60 │  *
61 │  * The given token must be available for injection from the root injector, and the injected value
62 │  * must implement the `IdleService` interface.
63 │  *
64 │  * @publicApi
65 │  *
66 │  * @see [Customizing `idle` behavior](guide/templates/defer#customizing-idle-behavior)
67 │  */
68 ▶ export function provideIdleServiceWith(
69 │   useExisting: AbstractType<IdleService> | InjectionToken<IdleService>,
70 │ ): EnvironmentProviders {
71 │   return makeEnvironmentProviders([
72 │     {
73 ▶       provide: IDLE_SERVICE,
74 ▶       useExisting,
75 │     },
76 │   ]);
77 │ }
```

📄 `angular/packages/core/src/defer/idle_service.ts` L83–94 （▶ の行: 84, 87–88）

```ts
83 │ class RequestIdleCallbackService implements IdleService {
84 ▶   private readonly requestIdleCallback = _requestIdleCallback();
85 │   private readonly cancelIdleCallback = _cancelIdleCallback();
86 │ 
87 ▶   requestOnIdle(callback: (deadline?: IdleDeadline) => void, options?: IdleRequestOptions): number {
88 ▶     return this.requestIdleCallback(callback, options);
89 │   }
90 │ 
91 │   cancelOnIdle(id: number): void {
92 │     return this.cancelIdleCallback(id);
93 │   }
94 │ }
```

📄 `angular/packages/core/src/defer/idle_service.ts` L21–30 （▶ の行: 23–26）

```ts
21 │ type RequestIdle = typeof requestIdleCallback;
22 │ 
23 ▶ const _requestIdleCallback = () =>
24 ▶   (typeof requestIdleCallback !== 'undefined'
25 ▶     ? requestIdleCallback
26 ▶     : (cb: VoidFunction) => setTimeout(cb) as unknown as number
27 │   ).bind(globalThis) as RequestIdle;
28 │ 
29 │ const _cancelIdleCallback = () =>
30 │   (typeof requestIdleCallback !== 'undefined' ? cancelIdleCallback : clearTimeout).bind(globalThis);
```

54〜55 行目、`IDLE_SERVICE` は factory 付きの `InjectionToken` で、誰も provide しなければルートで `RequestIdleCallbackService` が作られます （factory 付きトークンの扱いは [第 6 回](06-di-injection-token.md)）。87〜88 行目、`requestOnIdle` はブラウザの `requestIdleCallback` をそのまま呼びます。23〜26 行目、`requestIdleCallback` が無い環境（Node.js、Safari）では `setTimeout(cb)` に置き換わります。68〜74 行目の `provideIdleServiceWith` で別の実装に差し替えると、`onIdle` も `@defer` も同じものを使います。

## 6. @defer (on idle) との関係：同じ IDLE\_SERVICE、間に IdleScheduler

`@defer (on idle)` も最後は同じ `IDLE_SERVICE` に着きますが、間に `IdleScheduler` という**まとめ役**が入ります。

📄 `angular/packages/core/src/defer/idle_scheduler.ts` L53–64 （▶ の行: 53, 61, 64）

```ts
53 ▶ export class IdleScheduler implements OnDestroy {
54 │   // Serialize options rather than using the object reference to ensure
55 │   // that different IdleRequestOptions references with the same values
56 │   // are batched into the same bucket.
57 │   private readonly buckets = new Map<string, IdleBucket>();
58 │ 
59 │   // Lookup from callback to its bucket key.
60 │   private readonly callbackBucket = new Map<VoidFunction, string>();
61 ▶   private readonly applicationRef = inject(ApplicationRef);
62 │ 
63 │   private readonly ngZone = inject(NgZone);
64 ▶   private readonly idleService = inject(IDLE_SERVICE);
```

📄 `angular/packages/core/src/defer/idle_scheduler.ts` L98–135 （▶ の行: 99–100, 106–107, 111, 115, 131–132）

```ts
 98 │   private scheduleBucket(bucket: IdleBucket, options?: IdleRequestOptions) {
 99 ▶     if (bucket.idleId !== null) {
100 ▶       return;
101 │     }
102 │ 
103 │     const key = getIdleRequestKey(options);
104 │     const callback = (deadline?: IdleDeadline) => {
105 │       // Keep idleId set during the drain to prevent re-entrant add() from scheduling redundant callbacks.
106 ▶       for (const cb of bucket.queue) {
107 ▶         cb();
108 │         // _tick here is an optimized change detection check and is safe to call here.
109 │         // We also account for the time it takes to run change detection
110 │         // for the newly-created view as a part of the same idle callback.
111 ▶         this.applicationRef._tick();
112 │         bucket.queue.delete(cb);
113 │         this.callbackBucket.delete(cb);
114 │ 
115 ▶         if (deadline && deadline.timeRemaining() === 0 && !deadline.didTimeout) {
116 │           break;
117 │         }
118 │       }
119 │ 
120 │       bucket.idleId = null;
121 │ 
122 │       if (bucket.queue.size > 0) {
123 │         this.scheduleBucket(bucket, options);
124 │       } else {
125 │         this.buckets.delete(key);
126 │       }
127 │     };
128 │ 
129 │     // Ensure that the callback runs in the NgZone since
130 │     // the `requestIdleCallback` is not currently patched by Zone.js.
131 ▶     bucket.idleId = this.idleService.requestOnIdle(
132 ▶       (deadline) => this.ngZone.run(() => callback(deadline)),
133 │       options,
134 │     );
135 │   }
```

64 行目、`IdleScheduler` も `inject(IDLE_SERVICE)` します。違いは 99〜100 行目と 106〜107 行目です。同じ options の defer ブロックがいくつあっても `requestIdleCallback` は 1 回だけ登録し（99〜100 行目）、idle になったらまとめて回します（106〜107 行目）。1 つ終えるごとに 111 行目で `ApplicationRef._tick()`（新しく出たビューの変更検知）を走らせ、115 行目で残り時間が 0 なら途中でやめて次の idle に回します。131〜132 行目は、129〜130 行目のコメントどおり Zone.js が `requestIdleCallback` をパッチしないので `ngZone.run` で包む処理です。

`onIdle()`（4 節）はこの `IdleScheduler` を通りません。142 行目で `IDLE_SERVICE.requestOnIdle` を直接、1 回ごとに呼びます。resolve した後に動くのは `import()` だけで、ビューは作らないので `_tick` も要りません。「どちらも同じ `IDLE_SERVICE` を使う」は正しく、「同じスケジューラで並ぶ」は正しくありません。`@defer` のトリガー全体は [defer](../template/03-defer.md) の章を見てください。

## 7. DEMO：injectAsync を 2 つ作って呼ぶ

> **🧪 DEMO — 別ファイル di-inject-async.lazy.ts の LazyGreeter を遅延読み込みする**
>
> `LazyGreeter` は `@Injectable({providedIn: 'root'})` で、章の .ts からは `import()` と `import type` でしか参照しません。子コンポーネントは 2 つの `injectAsync` を持ちます。A は `import(...).then(m => m.LazyGreeter)`、B は `import(...)`（default export）で、B だけ `prefetch: () => onIdle({timeout: 2000})` を付けています。「子を作る」を押すたびに子コンポーネントを作り直します（ログの時刻は子の生成からの経過）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/di-inject-async)

- 作った直後：ログは「生成」だけ。idle になると「prefetch: onIdle が resolve」→「loader B を呼んだ」（2 節 79 行目 → 71 行目）
- idle の後に B を押す：loader B はもう呼ばれない（70 行目で `loadedPromise` がある）。A を押す：A は別の `injectAsync` なので loader A が 1 回呼ばれ、2 回目以降は呼ばれない
- 両方押すと `A === B → true`。loader は別でも、84 行目の `injector.get` は同じトークンをルートから取るので同じインスタンス（`#1`）
- 作り直すと loader は再び呼ばれる（新しいクロージャ）。ただしモジュールはブラウザが読み込み済みなのですぐ resolve し、インスタンスは `#1` のまま

> [!NOTE]
> **さらに深く**
>
> 本番ビルド（`npx ng build`）の出力で確かめると、`LazyGreeter` は `main` から `ɵɵdefineInjectable` だけを import する 約 350 バイトの別チャンク（`chunk-*.js`）になっていました。中身は `LazyGreeter` と `export default` だけです。章のチャンクには、loader A と loader B の 2 か所に同じそのチャンクへの `import()` が残ります。チャンク名はビルドごとに変わります。

## ここまでの呼び出し

- 👤 `greeter = injectAsync(() => import('./x'), { prefetch: onIdle })` — あなたのコンポーネントのフィールド
  - `inject(Injector)` — di/inject\_async.ts L66 — *NodeInjector（コンポーネント）か R3Injector（サービス）を捕まえる*
  - `options.prefetch()` = `onIdle()` — inject\_async.ts L78 → L135 — *同期的に呼ぶので注入コンテキストの中*
    - `inject(IDLE_SERVICE).requestOnIdle(() => resolve())` — inject\_async.ts L140-142 — *既定は requestIdleCallback（無ければ setTimeout）*
  - `…idle…` → `load()` → `loader()` — inject\_async.ts L79 → L71 — *import() 開始。Promise を loadedPromise に保存*
- 👤 `await this.greeter()` — あなたのクリックハンドラ
  - `load().then(...)` — inject\_async.ts L84 — *保存済みの Promise を使い回す*
    - `maybeUnwrapDefaultExport(module)` — util/default\_export.ts L29 — *module\['default'\] を取り出す*
    - `injector.get(LazyGreeter)` — inject\_async.ts L84 — *providedIn: 'root' なのでルートで作られる*

## 聞かれそうな質問

**Q. await の後では inject() できないのに、なぜ injectAsync は await の後でサービスを返せるのですか？**

`inject()` を呼ぶのは await の後ではなく、`injectAsync` を呼んだ瞬間（66 行目）だからです。そのとき取った `Injector` をクロージャに持っておき、Promise の後では 84 行目で `injector.get` を呼んでいます。`get` はインジェクタのメソッドなので注入コンテキストを必要としません（R3Injector.get は自分で `setCurrentInjector(this)` します。[第 2 回](02-di-inject-function.md)）。

**Q. providedIn: 'root' でないサービスは injectAsync で取れますか？**

遅延読み込みとしては使えません。84 行目は普通の `injector.get` なので、どこかの `providers` に書いてあれば見つかりますが、`providers` に書くにはそのクラスを静的に import する必要があり、その時点で別チャンクに分かれなくなります。1 節 23 行目の NOTE が「auto-provided（`providedIn: 'root'` か `@Service()`）」を条件にしているのはこのためです。どこにも無ければ `get` は NG0201 を投げ、返した Promise が reject します。

**Q. 返された関数を 2 回呼ぶと 2 回 import されますか？**

されません。70〜73 行目で loader の Promise を保存し、2 回目以降は同じ Promise を返すからです。読み込み中に 2 回呼んでも同じです。別々に `injectAsync` を 2 回書いた場合は loader が 2 回呼ばれますが、`import()` 自体はブラウザのモジュールキャッシュで 1 回の取得になり、インスタンスはルートの 1 つです（DEMO の `A === B → true`）。

**Q. import() が失敗したら、次に呼んだときに再試行されますか？**

されません。71 行目で保存されるのは reject した Promise そのもので、70 行目は「空かどうか」しか見ないので、以後の呼び出しはすべて同じ reject を返します。再試行したいなら、新しく `injectAsync` を呼び直すか、loader の中でリトライを書きます。`prefetch` 側の失敗は 80 行目で握りつぶされるだけで、`loadedPromise` には残ります。

**Q. @defer (on idle) と prefetch: onIdle は同じタイミングで動きますか？**

同じ `IDLE_SERVICE` を使うので「`requestIdleCallback` のコールバックとして呼ばれる」点は同じですが、登録の経路は別で、互いを待ち合わせる仕組みはありません。`@defer` は `IdleScheduler` が同じ options の要求を 1 本の `requestIdleCallback` にまとめ（99〜100 行目）、呼ばれたら 1 ブロックずつ `_tick` を挟んで処理し、時間切れなら次の idle に回します（111・115 行目）。`onIdle()` は呼ぶたびに `requestOnIdle` を 1 つ登録し（142 行目）、呼ばれたら `resolve()` するだけです。

## 読み終えて

- `injectAsync` は 66 行目で `inject(Injector)` を捕まえ、84 行目でそれに `get` させる。await の後に inject しているわけではない
- loader は 70〜73 行目で 1 回だけ。Promise を保存するので並行して呼んでも、失敗しても、同じ Promise が返る
- default export は `maybeUnwrapDefaultExport`（default\_export.ts 29・36 行目）が外す
- `prefetch` は injectAsync の中で同期的に呼ばれるので、`onIdle` は注入コンテキストで `inject(IDLE_SERVICE)` できる。既定は `requestIdleCallback`
- サービスは `providedIn: 'root'` / `@Service()` であること。分割するのはビルドで、DI は普通の `get` をしているだけ

---

← 前: [DestroyRef と破棄：R3Injector.destroy、サービスの ngOnDestroy、NodeInjectorDestroyRef](14-di-destroy.md)  
次: [DevTools が注入器の木を描ける理由：injector profiler と injector\_discovery\_utils](16-di-debug.md) →
