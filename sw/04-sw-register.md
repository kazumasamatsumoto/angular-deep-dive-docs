[目次](../README.md) › [Service Worker の内側](README.md) › 第 4 回 / 全 20 回

# ワーカーの登録：provideServiceWorker と登録の戦略

> provideServiceWorker と ServiceWorkerModule.register が、アプリの初期化のあとに navigator.serviceWorker.register を呼ぶまで（provider.ts の ngswAppInitializer）。registrationStrategy の registerWhenStable:30000（既定）・registerImmediately・registerWithDelay・Observable、enabled: false や対応しないブラウザのときの NgswCommChannel、SwRegistrationOptions。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sw-register)

---

`provideServiceWorker('ngsw-worker.js', { registrationStrategy: 'registerWhenStable:30000' })` の 1 行で、ブラウザにワーカーが登録されます。この章では、その 1 行が何を provide し、アプリの初期化のどこで、何を待ってから `navigator.serviceWorker.register` を呼ぶのかを、`provider.ts` の行で 1 つずつ確かめます。途中で、タイムアウトを書かない `'registerWhenStable'` が「安定を待たない」理由と、それをテストが見逃した理由も読みます。

読む対象は `packages/service-worker/src/provider.ts`（255 行）・`module.ts` と `test/provider_spec.ts` です（../angular、22.2.0-next.7、8576f161ae4）。

1. [1. 全体像](01-sw-overview.md)
2. [2. Generator](02-sw-config-generator.md)
3. [3. ビルド](03-sw-cli-build.md)
4. **4. 登録**（この章）
5. [5. Driver の起動](05-sw-driver-lifecycle.md)
6. [6. fetch の横取り](06-sw-driver-fetch.md)
7. [7. 版とタブ](07-sw-versions.md)
8. [8. アセット](08-sw-asset-groups.md)
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

## 1. provideServiceWorker が provide する 6 つ

📄 `angular/packages/service-worker/src/provider.ts` L240–255 （▶ の行: 244–248, 250–251, 253）

```ts
240 │ export function provideServiceWorker(
241 │   script: string,
242 │   options: SwRegistrationOptions = {},
243 │ ): EnvironmentProviders {
244 ▶   return makeEnvironmentProviders([
245 ▶     SwPush,
246 ▶     SwUpdate,
247 ▶     {provide: SCRIPT, useValue: script},
248 ▶     {provide: SwRegistrationOptions, useValue: options},
249 │     {
250 ▶       provide: NgswCommChannel,
251 ▶       useFactory: ngswCommChannelFactory,
252 │     },
253 ▶     provideAppInitializer(ngswAppInitializer),
254 │   ]);
255 │ }
```

1. **245〜246 行目：`SwPush` と `SwUpdate`**

   アプリから inject するサービスです。中身は[第 13 回](13-sw-swupdate.md)・[第 16 回](16-sw-push.md)。
2. **247〜248 行目：スクリプトの URL と options を値として**

   `SCRIPT`（下の 28 行目の `InjectionToken`）に `'ngsw-worker.js'` を、`SwRegistrationOptions` に渡した options をそのまま入れます。`SwRegistrationOptions` は抽象クラスで、トークンとしても使われます（あとから別の provider で上書きできる。6 節）。
3. **250〜251 行目：`NgswCommChannel` は factory で**

   ワーカーと話す口です。最初に inject されたときに `ngswCommChannelFactory`（5 節）が作ります。
4. **253 行目：`provideAppInitializer(ngswAppInitializer)`**

   登録の仕事はここだけです。アプリの初期化のときに、インジェクションの文脈の中で `ngswAppInitializer` が 1 回呼ばれます（`runInitializers` の流れは [APP\_INITIALIZER](../boot/09-boot-app-initializer.md)）。244 行目の `makeEnvironmentProviders` で包むので、コンポーネントの `providers` には書けません。

NgModule のアプリ向けの `ServiceWorkerModule.register` は、同じ関数を呼ぶだけです。

📄 `angular/packages/service-worker/src/module.ts` L22–38 （▶ の行: 22, 30, 36）

```ts
22 ▶ @NgModule({providers: [SwPush, SwUpdate]})
23 │ export class ServiceWorkerModule {
24 │   /**
25 │    * Register the given Angular Service Worker script.
26 │    *
27 │    * If `enabled` is set to `false` in the given options, the module will behave as if service
28 │    * workers are not supported by the browser, and the service worker will not be registered.
29 │    */
30 ▶   static register(
31 │     script: string,
32 │     options: SwRegistrationOptions = {},
33 │   ): ModuleWithProviders<ServiceWorkerModule> {
34 │     return {
35 │       ngModule: ServiceWorkerModule,
36 ▶       providers: [provideServiceWorker(script, options)],
37 │     };
38 │   }
```

36 行目のとおり `provideServiceWorker` の結果を `providers` に入れるだけで、22 行目の `SwPush`・`SwUpdate` は重ねて書いてあります。だから以下の話は、`ServiceWorkerModule.register` でも同じです（spec も 2 つの API を同じ `it` で回しています。7 節）。

## 2. ngswAppInitializer：何もしないで帰る 2 つの道

📄 `angular/packages/service-worker/src/provider.ts` L28–45 （▶ の行: 28–29, 33–34, 37, 39–40, 43–45）

```ts
28 ▶ export const SCRIPT = new InjectionToken<string>(
29 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'NGSW_REGISTER_SCRIPT' : '',
30 │ );
31 │ 
32 │ export function ngswAppInitializer(): void {
33 ▶   if (typeof ngServerMode !== 'undefined' && ngServerMode) {
34 ▶     return;
35 │   }
36 │ 
37 ▶   const options = inject(SwRegistrationOptions);
38 │ 
39 ▶   if (!('serviceWorker' in navigator && options.enabled !== false)) {
40 ▶     return;
41 │   }
42 │ 
43 ▶   const script = inject(SCRIPT);
44 ▶   const ngZone = inject(NgZone);
45 ▶   const appRef = inject(ApplicationRef);
```

1. **33〜35 行目：サーバーの中では何もしない**

   `ngServerMode` は、SSR やプリレンダーのビルドで `true` に置き換えられるグローバルの定数です。サーバーには `navigator` がないので、真っ先に帰ります。
2. **39〜41 行目：ワーカーが使えない、または `enabled: false`**

   `'serviceWorker' in navigator` は、Service Worker に対応しないブラウザのほか、**安全でないページ（`localhost` 以外の `http://`）でも `false`** です（`navigator.serviceWorker` は安全な文脈でだけ見える API のため）。`enabled` は `!== false` で見るので、書かなければ有効です。ng add が書く `enabled: !isDevMode()` は、開発のビルドではここで帰ります（[第 3 回](03-sw-cli-build.md)）。
3. **43〜45 行目：残りを inject**

   `inject` が使えるのは、253 行目の `provideAppInitializer` がインジェクションの文脈の中で呼ぶからです。29 行目のトークンの説明文 `'NGSW_REGISTER_SCRIPT'` は開発のビルドだけで、本番では空文字です。

## 3. controllerchange を聞く

📄 `angular/packages/service-worker/src/provider.ts` L47–62 （▶ の行: 50, 54–55, 57, 59–60）

```ts
47 │   // Set up the `controllerchange` event listener outside of
48 │   // the Angular zone to avoid unnecessary change detections,
49 │   // as this event has no impact on view updates.
50 ▶   ngZone.runOutsideAngular(() => {
51 │     // Wait for service worker controller changes, and fire an INITIALIZE action when a new SW
52 │     // becomes active. This allows the SW to initialize itself even if there is no application
53 │     // traffic.
54 ▶     const sw = navigator.serviceWorker;
55 ▶     const onControllerChange = () => sw.controller?.postMessage({action: 'INITIALIZE'});
56 │ 
57 ▶     sw.addEventListener('controllerchange', onControllerChange);
58 │ 
59 ▶     appRef.onDestroy(() => {
60 ▶       sw.removeEventListener('controllerchange', onControllerChange);
61 │     });
62 │   });
```

`controllerchange` は「このページを制御するワーカーが変わった」というブラウザのイベントです。55 行目で、新しい `controller` に `{action: 'INITIALIZE'}` を送ります。コメントのとおり、ページからのリクエストが来なくてもワーカーが初期化を始められるようにするためです（ワーカーの側の受け取りは[第 5 回](05-sw-driver-lifecycle.md)）。50 行目の `runOutsideAngular` は zone.js を使うアプリで変更検知を起こさないため、59〜61 行目は `ApplicationRef` を壊したときに listener を外すためです。**この listener は登録より前に足されます**。登録の戦略に関係なく、2 節を通り抜けたら必ず聞いています。

## 4. registrationStrategy：いつ登録するか

📄 `angular/packages/service-worker/src/provider.ts` L64–93 （▶ の行: 66, 70–71, 73, 76–77, 79–80, 82–83, 85, 87）

```ts
64 │   // Run outside the Angular zone to avoid preventing the app from stabilizing (especially
65 │   // given that some registration strategies wait for the app to stabilize).
66 ▶   ngZone.runOutsideAngular(() => {
67 │     let readyToRegister: Promise<void>;
68 │ 
69 │     const {registrationStrategy} = options;
70 ▶     if (typeof registrationStrategy === 'function') {
71 ▶       readyToRegister = new Promise((resolve) => registrationStrategy().subscribe(() => resolve()));
72 │     } else {
73 ▶       const [strategy, ...args] = (registrationStrategy || 'registerWhenStable:30000').split(':');
74 │ 
75 │       switch (strategy) {
76 ▶         case 'registerImmediately':
77 ▶           readyToRegister = Promise.resolve();
78 │           break;
79 ▶         case 'registerWithDelay':
80 ▶           readyToRegister = delayWithTimeout(+args[0] || 0);
81 │           break;
82 ▶         case 'registerWhenStable':
83 ▶           readyToRegister = Promise.race([appRef.whenStable(), delayWithTimeout(+args[0])]);
84 │           break;
85 ▶         default:
86 │           // Unknown strategy.
87 ▶           throw new RuntimeError(
88 │             RuntimeErrorCode.UNKNOWN_REGISTRATION_STRATEGY,
89 │             (typeof ngDevMode === 'undefined' || ngDevMode) &&
90 │               `Unknown ServiceWorker registration strategy: ${options.registrationStrategy}`,
91 │           );
92 │       }
93 │     }
```

1. **70〜71 行目：関数なら、Observable の最初の値で**

   関数を呼んで返った Observable を購読し、最初の値で `resolve` します。購読は外しません（`resolve` は 2 回目からは何もしないので、登録は 1 回だけ）。
2. **73 行目：文字列を `:` で切る**

   `registrationStrategy` が無いか空文字なら `'registerWhenStable:30000'` です。`'registerWithDelay:5000'` は `strategy = 'registerWithDelay'`、`args = ['5000']` になります。
3. **76〜78 行目：`registerImmediately`**

   `Promise.resolve()` なので、初期化の関数が終わった直後（microtask）に登録します。アプリの最初の描画より前です。
4. **79〜81 行目：`registerWithDelay:<ms>`**

   `+args[0] || 0`。数字でないか省いたときは `NaN || 0` で 0 になり、`setTimeout(resolve, 0)` です。
5. **82〜84 行目：`registerWhenStable:<ms>`**

   `appRef.whenStable()` と `delayWithTimeout(+args[0])` の `Promise.race`、つまり**どちらか早いほう**です。`whenStable()` は `ApplicationRef.isStable` が `true` になったときに resolve する Promise で、zoneless では「`PendingTasks` が空になった」です（[PendingTasks と isStable](../zoneless/09-zoneless-pending-tasks.md)）。HTTP のリクエストやルーターのナビゲーションが残っているあいだは安定しないので、タイムアウトが「それでも遅くともこの時間で」の上限になります。
6. **85〜91 行目：知らない名前は例外**

   `RuntimeError` の 5600 番（`NG05600`）を**同期で**投げます。初期化の関数の中なので、アプリの起動そのものが失敗します（[APP\_INITIALIZER](../boot/09-boot-app-initializer.md) の「失敗したとき」）。66 行目の `runOutsideAngular` は、`setTimeout` などで zone.js のアプリの安定を妨げないためです（コメントの 64〜65 行目）。

### タイムアウトを書かない 'registerWhenStable'

公開 API の説明（このリポジトリの版）は、こう書いています。

📄 `angular/packages/service-worker/src/provider.ts` L186–215 （▶ の行: 198–199, 202–203, 213）

```ts
186 │   /**
187 │    * Defines the ServiceWorker registration strategy, which determines when it will be registered
188 │    * with the browser.
189 │    *
190 │    * The default behavior of registering once the application stabilizes (i.e. as soon as there are
191 │    * no pending micro- and macro-tasks) is designed to register the ServiceWorker as soon as
192 │    * possible but without affecting the application's first time load.
193 │    *
194 │    * Still, there might be cases where you want more control over when the ServiceWorker is
195 │    * registered (for example, there might be a long-running timeout or polling interval, preventing
196 │    * the app from stabilizing). The available option are:
197 │    *
198 ▶    * - `registerWhenStable:<timeout>`: Register as soon as the application stabilizes (no pending
199 ▶    *     micro-/macro-tasks) but no later than `<timeout>` milliseconds. If the app hasn't
200 │    *     stabilized after `<timeout>` milliseconds (for example, due to a recurrent asynchronous
201 │    *     task), the ServiceWorker will be registered anyway.
202 ▶    *     If `<timeout>` is omitted, the ServiceWorker will only be registered once the app
203 ▶    *     stabilizes.
204 │    * - `registerImmediately`: Register immediately.
205 │    * - `registerWithDelay:<timeout>`: Register with a delay of `<timeout>` milliseconds. For
206 │    *     example, use `registerWithDelay:5000` to register the ServiceWorker after 5 seconds. If
207 │    *     `<timeout>` is omitted, is defaults to `0`, which will register the ServiceWorker as soon
208 │    *     as possible but still asynchronously, once all pending micro-tasks are completed.
209 │    * - An Observable factory function: A function that returns an `Observable`.
210 │    *     The function will be used at runtime to obtain and subscribe to the `Observable` and the
211 │    *     ServiceWorker will be registered as soon as the first value is emitted.
212 │    *
213 ▶    * Default: 'registerWhenStable:30000'
214 │    */
215 │   registrationStrategy?: string | (() => Observable<unknown>);
```

202〜203 行目は「`<timeout>` を省くと、アプリが安定したときにだけ登録する」です。ところが 83 行目は `args` を見ずに `delayWithTimeout(+args[0])` を作ります。

1. **`'registerWhenStable'`：`args` は空**

   `+undefined` は `NaN`。125 行目の `setTimeout(resolve, NaN)` を、ブラウザは `setTimeout(resolve, 0)` として扱います（HTML の仕様で、delay を整数に直すときに `NaN` は 0）。
2. **`'registerWhenStable:'`：`args` は `['']`**

   `+''` は 0。こちらは最初から `setTimeout(resolve, 0)` です。
3. **どちらも、ほぼ必ずタイマーが勝つ**

   0 ms のタイマーは、最初の描画や HTTP の応答を待つ `whenStable()` より先に鳴ります。結果として **`registerWithDelay:0` と同じ**、つまり起動の直後に登録します。

これは 2025-04-01 のコミット 59d40f211c7（PR #60657「pull less RxJS symbols」）で入った動きです。それまでの行は `!args[0] ? whenStable$ : merge(whenStable$, delayWithTimeout(+args[0]))` で、タイムアウトが無いときは安定だけを待っていました（`git show 59d40f211c7 -- packages/service-worker/src/provider.ts` で確かめました）。2026-09-28 に直す PR #71018 が出ましたが、「service worker はセキュリティの修正だけ」「タイムアウトを書けば避けられる」として閉じられ、代わりに説明を直す PR #71041（2026-09-29 に main へ）が入りました。main の説明は「`<timeout>` is required. Without it, the ServiceWorker is registered immediately」に変わっています（`gh api` で main の provider.ts を読んで確かめました。この章の引用は 8576f161ae4 なので古い説明のままです）。

> [!TIP]
> **新卒エンジニアへ**
>
> つまり、自分のアプリで「安定してから登録」したいときは、**必ずタイムアウトを書きます**（`'registerWhenStable:30000'`）。ng add が既定と同じ値をわざわざ書くのは、結果としてこの落とし穴を避けています。

## 5. register を呼ぶ、失敗を console に出す

📄 `angular/packages/service-worker/src/provider.ts` L95–126 （▶ の行: 95, 97, 101, 105–109, 111–114, 116, 125）

```ts
 95 ▶     // Don't return anything to avoid blocking the application until the SW is registered.
 96 │     // Catch and log the error if SW registration fails to avoid uncaught rejection warning.
 97 ▶     readyToRegister.then(() => {
 98 │       // If the registration strategy has resolved after the application has
 99 │       // been explicitly destroyed by the user (e.g., by navigating away to
100 │       // another application), we simply should not register the worker.
101 ▶       if (appRef.destroyed) {
102 │         return;
103 │       }
104 │ 
105 ▶       navigator.serviceWorker
106 ▶         .register(script, {
107 ▶           scope: options.scope,
108 ▶           updateViaCache: options.updateViaCache,
109 ▶           type: options.type,
110 │         })
111 ▶         .catch((err) =>
112 ▶           console.error(
113 ▶             formatRuntimeError(
114 ▶               RuntimeErrorCode.SERVICE_WORKER_REGISTRATION_FAILED,
115 │               (typeof ngDevMode === 'undefined' || ngDevMode) &&
116 ▶                 'Service worker registration failed with: ' + err,
117 │             ),
118 │           ),
119 │         );
120 │     });
121 │   });
122 │ }
123 │ 
124 │ function delayWithTimeout(timeout: number): Promise<void> {
125 ▶   return new Promise((resolve) => setTimeout(resolve, timeout));
126 │ }
```

1. **95 行目：初期化の関数は何も返さない**

   Promise を返さないので、`runInitializers` はこの登録を待ちません。**登録が終わらなくてもアプリは起動します**。
2. **101 行目：待っているあいだにアプリが壊されたら登録しない**

   別のアプリへ移るなどで `ApplicationRef.destroy()` されたあとに戦略の Promise が resolve しても、何もしません。
3. **105〜110 行目：`register(script, options)`**

   `scope`・`updateViaCache`・`type` を、そのままブラウザに渡します（書かなければ `undefined` で、ブラウザの既定）。ここから先、ワーカーのスクリプトを取ってきて `install` のイベントを送るのはブラウザです（[第 5 回](05-sw-driver-lifecycle.md)）。
4. **111〜118 行目：失敗は `console.error` だけ**

   `formatRuntimeError` で `NG05604` を頭に付けた文字列を `console.error` に出します。開発のビルドでは 116 行目の `'Service worker registration failed with: ' + err` が続きます。例外にはしないので、**登録に失敗してもアプリは何も知りません**。`ngsw-worker.js` が 404 のときなどは、ブラウザのコンソールでこの 1 行を探します。

## 6. NgswCommChannel と SwRegistrationOptions

📄 `angular/packages/service-worker/src/provider.ts` L128–137 （▶ の行: 129, 131, 133–134）

```ts
128 │ export function ngswCommChannelFactory(): NgswCommChannel {
129 ▶   const opts = inject(SwRegistrationOptions);
130 │   const injector = inject(Injector);
131 ▶   const isBrowser = !(typeof ngServerMode !== 'undefined' && ngServerMode);
132 │ 
133 ▶   return new NgswCommChannel(
134 ▶     isBrowser && opts.enabled !== false ? navigator.serviceWorker : undefined,
135 │     injector,
136 │   );
137 │ }
```

134 行目、サーバーの中か `enabled: false` なら、`NgswCommChannel` に `undefined` を渡します。このとき `SwUpdate.isEnabled` は `false` になり、`checkForUpdate()` などは「無効」のエラーを返します（[第 13 回](13-sw-swupdate.md)）。逆に、ブラウザが Service Worker に対応していなくても `navigator.serviceWorker`（`undefined`）がそのまま渡るので、結果は同じです。

129 行目の `inject(SwRegistrationOptions)` は、2 節の 37 行目と同じトークンです。`providers` の配列で `provideServiceWorker` より後ろに `{ provide: SwRegistrationOptions, useFactory: … }` を書くと、後から来たものが勝つので（`R3Injector` の `records.set`）、options を実行時に決められます。spec の 7 節の mock もこの書き方です。

## 7. デモ：いつ register が呼ばれるか

> **🧪 DEMO — ngswAppInitializer の分かれ（provider.ts 32〜122 行目）の移植**
>
> 本物の `ngswAppInitializer` は動かしません（このサイトに Service Worker を登録しないため）。provider.ts の分かれを写した関数で、「アプリの起動から何 ms 後に `register` が呼ばれるか」を計算します。タイマーの値の直し方だけは、ブラウザの `setTimeout` の仕様（`NaN` は 0、231 以上は 32 ビットで折り返して負なら 0）に合わせています。
>
> 下のボタンは、このブラウザの本物の `setTimeout` に 83 行目と同じ値を渡して、何 ms で呼ばれるかを測ります（Service Worker とは関係なく、タイマーだけ）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sw-register)

2026-11-03 にこのマシンの Chrome（このページの開発ビルド）で「測る」を押すと、`NaN` は 2.5 ms、`0` は 0.0 ms、231 は 4.7 ms、比べるための 50 は 50.8 ms で呼ばれました。`NaN` を渡したタイマーは、ほぼすぐに鳴ります。

例のボタンを順に押すと、次のことが読み取れます（安定する時刻は初期値の 2000 ms）。

1. **`registerWhenStable:30000` と `:1000`**

   前者は安定した 2000 ms、後者はタイマーの 1000 ms で登録します。安定する時刻を空にすると、それぞれ 30000 ms と 1000 ms です。
2. **`registerWhenStable` と `registerWhenStable:`**

   どちらも 0 ms。4 節の落とし穴です。
3. **`registerYesterday`**

   NG05600 の例外。`''`（空）は既定の `registerWhenStable:30000` になります。

## ここまでの呼び出し

- 👤 `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })` — あなたの app.config.ts
  - `makeEnvironmentProviders([SwPush, SwUpdate, SCRIPT, SwRegistrationOptions, NgswCommChannel, provideAppInitializer(ngswAppInitializer)])` — provider.ts L244
- `bootstrapApplication` → `ApplicationInitStatus.runInitializers()` — core — *boot-app-initializer*
  - `ngswAppInitializer()` — provider.ts L32 — *ngServerMode・serviceWorker・enabled を見て帰ることもある*
    - `sw.addEventListener('controllerchange', …)` — provider.ts L57 — *あとで INITIALIZE を送る*
    - `Promise.race([appRef.whenStable(), delayWithTimeout(30000)])` — provider.ts L83 — *zoneless-pending-tasks*
      - `navigator.serviceWorker.register('ngsw-worker.js', { scope, updateViaCache, type })` — provider.ts L105 — *失敗は console.error（NG05604）だけ*
- ブラウザがワーカーを取って `install` を送る — ngsw-worker.js — *第 5 回*

## テストと直し方

### この回の部品を確かめている spec

`test/provider_spec.ts` は冒頭の `forEach` で `['provideServiceWorker', 'ServiceWorkerModule']` の 2 つについて同じ describe を回します（28 行目の `describe(apiFnName, …)`）。中は `'register'`（49 行目、7 つの `it`）、`'SwRegistrationOptions'`（147 行目、4 つ）、`'registrationStrategy'`（232 行目、14 個）で、合わせて 25 個 × 2 です。

📄 `angular/packages/service-worker/test/provider_spec.ts` L28–67 （▶ の行: 28, 30, 32, 44–45, 54–55, 60, 65–66）

```ts
28 ▶   describe(apiFnName, () => {
29 │     // Skip environments that don't support the minimum APIs needed to run these SW tests.
30 ▶     if (typeof navigator === 'undefined' || typeof navigator.serviceWorker === 'undefined') {
31 │       // Jasmine will throw if there are no tests.
32 ▶       it('should pass', () => {});
33 │       return;
34 │     }
35 │ 
36 │     let swRegisterSpy: jasmine.Spy;
37 │ 
38 │     const untilStable = () => {
39 │       return TestBed.inject(ApplicationRef).whenStable();
40 │     };
41 │ 
42 │     beforeEach(
43 │       () =>
44 ▶         (swRegisterSpy = spyOn(navigator.serviceWorker, 'register').and.returnValue(
45 ▶           Promise.resolve(null as any),
46 │         )),
47 │     );
48 │ 
49 │     describe('register', () => {
50 │       const configTestBed = async (options: SwRegistrationOptions) => {
51 │         if (apiFnName === provideServiceWorkerApi) {
52 │           TestBed.configureTestingModule({
53 │             providers: [
54 ▶               provideServiceWorker('sw.js', options),
55 ▶               {provide: PLATFORM_ID, useValue: 'browser'},
56 │             ],
57 │           });
58 │         } else {
59 │           TestBed.configureTestingModule({
60 ▶             imports: [ServiceWorkerModule.register('sw.js', options)],
61 │             providers: [{provide: PLATFORM_ID, useValue: 'browser'}],
62 │           });
63 │         }
64 │ 
65 ▶         await untilStable();
66 ▶         await waitForReadyToRegister();
67 │       };
```

44〜46 行目で本物の `navigator.serviceWorker.register` を spy にし、ブラウザに本当には登録しません。55・61 行目の `PLATFORM_ID` は今の `provider.ts` では読まれていません（2 節は `ngServerMode` で見る）。そして 30〜34 行目で、`navigator.serviceWorker` が無い環境では 32 行目の `'should pass'` の 1 つだけにしています。**Node のターゲットでは中身が 1 つも走りません**。

📄 `angular/packages/service-worker/test/provider_spec.ts` L232–257 （▶ の行: 236, 243, 245–246, 253–254）

```ts
232 │       describe('registrationStrategy', () => {
233 │         const configTestBedWithMockedStability = (
234 │           strategy?: SwRegistrationOptions['registrationStrategy'],
235 │         ) => {
236 ▶           const isStableSub = new Subject<boolean>();
237 │ 
238 │           if (apiFnName === provideServiceWorkerApi) {
239 │             TestBed.configureTestingModule({
240 │               providers: [
241 │                 provideServiceWorker('sw.js'),
242 │                 {
243 ▶                   provide: ApplicationRef,
244 │                   useValue: {
245 ▶                     isStable: isStableSub.asObservable(),
246 ▶                     whenStable: () => isStableSub.pipe(filter(Boolean), take(1)),
247 │                     afterTick: new Subject(),
248 │                     onDestroy: () => {},
249 │                   },
250 │                 },
251 │                 {provide: PLATFORM_ID, useValue: 'browser'},
252 │                 {
253 ▶                   provide: SwRegistrationOptions,
254 ▶                   useFactory: () => ({registrationStrategy: strategy}),
255 │                 },
256 │               ],
257 │             });
```

戦略の spec は `ApplicationRef` を偽物にして、236 行目の `Subject` で安定を操ります。ここで **246 行目の `whenStable` は Promise ではなく Observable を返します**。83 行目の `Promise.race` は、then を持たない値を「すでに resolve したもの」として扱うので、この偽物ではタイマーと関係なく、次の microtask で必ず決まります。

📄 `angular/packages/service-worker/test/provider_spec.ts` L380–396 （▶ の行: 380–381, 386, 388, 390–391）

```ts
380 ▶         it('registers the SW only when the app stabilizes with `registerWhenStable`', fakeAsync(() => {
381 ▶           const isStableSub = configTestBedWithMockedStability('registerWhenStable');
382 │ 
383 │           isStableSub.next(false);
384 │           isStableSub.next(false);
385 │ 
386 ▶           expect(swRegisterSpy).not.toHaveBeenCalled();
387 │ 
388 ▶           isStableSub.next(true);
389 │ 
390 ▶           tick();
391 ▶           expect(swRegisterSpy).toHaveBeenCalledWith('sw.js', {
392 │             scope: undefined,
393 │             updateViaCache: undefined,
394 │             type: undefined,
395 │           });
396 │         }));
```

名前は「安定したときにだけ登録する」ですが、386 行目の「まだ呼ばれていない」は同期の確認で、まだ microtask が回っていないだけです。390 行目の `tick()` で microtask が回れば、安定とは関係なく呼ばれます。だから 4 節の動きがあっても、この spec は通ります（PR #71018 の説明もこの 2 点を指摘しています）。**直すとしたら**、偽物の `whenStable` を `firstValueFrom(…)` のような Promise にし、`tick(60000)` のあとでも呼ばれていないことを確かめる `it` にします。

📄 `ターミナル`

```
cd ~/angular-research/angular
git status --short          # 走らせる前と後で同じか（ソースは変えない）
# Node（navigator.serviceWorker が無い）: provider_spec は 'should pass' の 2 つだけ
# Chromium（本物の navigator.serviceWorker がある）: 中身が全部走る
pnpm bazel test //packages/service-worker/test:test \
  //packages/service-worker/test:test_web_chromium \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=^(provideServiceWorker|ServiceWorkerModule) '
```

2026-11-03 にこのマシンで走らせた結果です（ログは `scratchpad/sw-logs/a-register.log`）。Node の `:test` は **Ran 2 of 41 specs、2 specs, 0 failures、PASSED in 0.8s**（当たったのは 2 つの `'should pass'` だけ）。`:test_web_chromium` は **89 passed, 0 failed、PASSED in 0.9s** で、`--filter` はブラウザの test runner には効かず、comm\_spec（35）・integration\_spec（4）と provider\_spec（25 × 2）の全部が走りました。走らせる前と後で `git status --short` は同じでした。

### 直すとしたら、どこから

- **登録されない**：まずブラウザのコンソールで `NG05604` を探します（5 節の 111〜118 行目）。何も出ていなければ、2 節の 3 つの帰り道（SSR・`serviceWorker` が無い・`enabled`）か、戦略が resolve していない（安定しないのにタイムアウトが無い・Observable が値を出さない）です。
- **早すぎる登録**：タイムアウトの無い `registerWhenStable`（4 節）。直すとしたら `provider.ts` 83 行目と、spec の `configTestBedWithMockedStability`（233 行目）の偽物の `whenStable`。ただし PR #71018 が閉じられた経緯のとおり、受け付けられるのは説明の修正までです。
- **`SwUpdate.isEnabled` が `false`**：6 節の 134 行目。ワーカーとの通信の側は[第 13 回](13-sw-swupdate.md)、テストの偽物の `MockServiceWorkerContainer` は[第 19 回](19-sw-testing-app.md)。
- 「強制リロードのあと」に起きる issue（#44402 `checkForUpdate` が効かない、#48702 `SwPush` が値を出さない）は、登録のあとのページとワーカーの通信の話で、[第 13 回](13-sw-swupdate.md)・[第 16 回](16-sw-push.md)・[第 20 回](20-sw-issues.md)で読みます。

このパッケージでは、PACKAGE.md 1 行目の方針（[第 1 回](01-sw-overview.md)）のとおり新しい機能の PR は受け付けられず、不具合の直しも慎重に扱われます（例：PR #67918・#71018 はこの理由で閉じられた）。上の入口は「手元で確かめる」「issue を読むときの手がかりにする」ために使います。

## 聞かれそうな質問

**Q. Service Worker の登録が終わるまで、アプリの起動は待たされますか？**

待たされません。`ngswAppInitializer` は何も返さないので（95 行目のコメント）、`runInitializers` は待つものが無く、登録は `readyToRegister.then`（97 行目）の中で後から起きます。

**Q. 既定の `registerWhenStable:30000` は、何を待っているのですか？**

`appRef.whenStable()` と 30 秒のタイマーのどちらか早いほうです（83 行目）。zoneless のアプリでは「`PendingTasks` が空になった」ときで、最初の HTTP やナビゲーションが終わるまで待ちます（[PendingTasks と isStable](../zoneless/09-zoneless-pending-tasks.md)）。ポーリングなどで安定しないアプリでも、30 秒で登録されます。

**Q. `registrationStrategy: 'registerWhenStable'` と書いたのに、すぐ登録されます。**

タイムアウトを省くと 83 行目の `delayWithTimeout(+args[0])` が `setTimeout(resolve, NaN)` になり、ブラウザは 0 ms として扱うので、タイマーが先に勝ちます。`'registerWhenStable:30000'` のように必ずタイムアウトを書きます。main の説明（PR #71041）もそう直されました。

**Q. 登録に失敗したことを、アプリのコードで知る方法はありますか？**

`provideServiceWorker` の中にはありません。111〜118 行目は `console.error` に出すだけで、例外にも Observable にもしません。知りたいときは、自分で `navigator.serviceWorker.getRegistration()` などのブラウザの API を見ます。

**Q. `enabled: false` のとき、`SwUpdate` を inject するとエラーになりますか？**

なりません。`SwUpdate` は provide されたまま（245〜246 行目）で、`NgswCommChannel` に `undefined` が渡るだけです（134 行目）。`isEnabled` が `false` になり、メソッドを呼ぶと無効のエラーが返ります（[第 13 回](13-sw-swupdate.md)）。

## 読み終えて

- `provideServiceWorker` は 6 つを provide し、登録の仕事は `provideAppInitializer(ngswAppInitializer)` の 1 つだけ。`ServiceWorkerModule.register` は同じものを包むだけ。
- `ngswAppInitializer` は SSR の中・`serviceWorker` の無いページ・`enabled: false` では何もしない。それ以外では先に `controllerchange` を聞く。
- 既定の戦略は「`whenStable()` と 30 秒のタイマーの早いほう」。タイムアウトを省いた `registerWhenStable` は 0 ms のタイマーが勝ち、すぐ登録する（PR #60657 からの動き）。
- 登録はアプリの起動を待たせず、失敗は `console.error`（NG05604）だけ。
- provider\_spec の中身はブラウザのターゲットでだけ走る。戦略の spec の偽物の `whenStable` は Observable で、タイマーの有無を見分けられない。

---

← 前: [ビルドで ngsw.json を作る：CLI と ngsw-config](03-sw-cli-build.md)  
次: [Driver の起動：install・activate・初期化](05-sw-driver-lifecycle.md) →
