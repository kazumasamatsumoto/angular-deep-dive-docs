[目次](../README.md) › [SSR とハイドレーション](README.md) › 第 7 回 / 全 15 回

# provideClientHydration：features と withDomHydration が足すもの

> provideClientHydration が features を集め、withDomHydration・転送キャッシュ・インクリメンタルハイドレーション（v22 では既定で有効、withNoIncrementalHydration で外す）を並べる行と、矛盾する組み合わせを開発ビルドで止める行。withDomHydration の IS\_HYDRATION\_DOM\_REUSE\_ENABLED がブラウザでは TransferState に ngh のデータがあるときだけ真になる行、enableHydrationRuntimeSupport が実装を差し替える仕組み、ngcm（クライアント描画）の印、whenStable の後の片付けと 10 秒のタイムアウト警告。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/hydration-provide)

---

ハイドレーション（サーバーが作った DOM を捨てずに、ブラウザの Angular がそれを自分のものとして引き取ること）は、`provideClientHydration()` の 1 行で有効になります。この章では、その 1 行が**どのプロバイダを並べ、どのトークンがいつ true になり、どの関数の実装を差し替えるのか**を、feature（`withEventReplay()` などの引数）の形から、`whenStable` の後の片付けまで順に追います。

読む対象は `packages/platform-browser/src/hydration.ts`、`packages/core/src/hydration/api.ts`、`packages/core/src/hydration/utils.ts` と、CLI 側の `packages/angular/build/src/utils/index-file/ngcm-attribute.ts` です。

1. [1. 概観](01-ssr-overview.md)
2. [2. renderApplication](02-ssr-render-application.md)
3. [3. platformServer と domino](03-ssr-platform-server.md)
4. [4. AngularAppEngine](04-ssr-app-engine.md)
5. [5. サーバールート](05-ssr-server-routes.md)
6. [6. プリレンダー](06-ssr-prerender.md)
7. **7. provideClientHydration**（この章）
8. [8. ngh の書き出し](08-hydration-annotate.md)
9. [9. ノードの道順](09-hydration.md)
10. [10. ノードの確保](10-hydration-claim.md)
11. [11. コンテナと片付け](11-hydration-containers.md)
12. [12. 不一致のエラー](12-hydration-errors.md)
13. [13. i18n](13-hydration-i18n.md)
14. [14. イベントの再生](14-event-replay.md)
15. [15. インクリメンタル](15-incremental-hydration.md)

## 1. feature は「種類」と「プロバイダ」の 2 つ組

`provideClientHydration(withEventReplay(), withNoHttpTransferCache())` のように渡す引数を feature と呼びます。feature の中身はただのオブジェクトです。

📄 `angular/packages/platform-browser/src/hydration.ts` L31–65 （▶ の行: 37, 52–53, 59, 64）

```ts
31 │ /**
32 │  * The list of features as an enum to uniquely type each `HydrationFeature`.
33 │  * @see {@link HydrationFeature}
34 │  *
35 │  * @publicApi
36 │  */
37 ▶ export enum HydrationFeatureKind {
38 │   NoHttpTransferCache,
39 │   HttpTransferCacheOptions,
40 │   I18nSupport,
41 │   EventReplay,
42 │   IncrementalHydration,
43 │   NoIncrementalHydration,
44 │ }
45 │ 
46 │ /**
47 │  * Helper type to represent a Hydration feature.
48 │  *
49 │  * @publicApi
50 │  */
51 │ export interface HydrationFeature<FeatureKind extends HydrationFeatureKind> {
52 ▶   ɵkind: FeatureKind;
53 ▶   ɵproviders: Provider[];
54 │ }
55 │ 
56 │ /**
57 │  * Helper function to create an object that represents a Hydration feature.
58 │  */
59 ▶ function hydrationFeature<FeatureKind extends HydrationFeatureKind>(
60 │   ɵkind: FeatureKind,
61 │   ɵproviders: Provider[] = [],
62 │   ɵoptions: unknown = {},
63 │ ): HydrationFeature<FeatureKind> {
64 ▶   return {ɵkind, ɵproviders};
65 │ }
```

37〜44 行目の `HydrationFeatureKind` が 6 種類の名前です。52〜53 行目、feature は `ɵkind`（どの種類か）と `ɵproviders`（足すプロバイダの配列）だけを持ちます。59 行目の `hydrationFeature` は 64 行目でその 2 つを詰めて返すだけで、3 番目の引数 `ɵoptions` は使われていません。

📄 `angular/packages/platform-browser/src/hydration.ts` L127–161 （▶ の行: 128, 146, 150, 160）

````ts
127 │ export function withEventReplay(): HydrationFeature<HydrationFeatureKind.EventReplay> {
128 ▶   return hydrationFeature(HydrationFeatureKind.EventReplay, ɵwithEventReplay());
129 │ }
130 │ 
131 │ /**
132 │  * Enables support for incremental hydration using the `hydrate` trigger syntax.
133 │  *
134 │  * @usageNotes
135 │  *
136 │  * Basic example of how you can enable incremental hydration in your application when
137 │  * the `bootstrapApplication` function is used:
138 │  * ```ts
139 │  * bootstrapApplication(App, {
140 │  *   providers: [provideClientHydration(withIncrementalHydration())]
141 │  * });
142 │  * ```
143 │  * @publicApi 20.0
144 │  * @see {@link provideClientHydration}
145 │  *
146 ▶  * @deprecated Since v22.0.0, incremental hydration is enabled by default with `provideClientHydration`.
147 │  * Intent to remove in v24.
148 │  */
149 │ export function withIncrementalHydration(): HydrationFeature<HydrationFeatureKind.IncrementalHydration> {
150 ▶   return hydrationFeature(HydrationFeatureKind.IncrementalHydration, ɵwithIncrementalHydration());
151 │ }
152 │ 
153 │ /**
154 │  * Disables support for incremental hydration (which is enabled by default).
155 │  *
156 │  * @publicApi 22.0
157 │  * @see {@link provideClientHydration}
158 │  */
159 │ export function withNoIncrementalHydration(): HydrationFeature<HydrationFeatureKind.NoIncrementalHydration> {
160 ▶   return hydrationFeature(HydrationFeatureKind.NoIncrementalHydration);
161 │ }
````

128 行目、`withEventReplay()` の中身は core の `ɵwithEventReplay()` が返すプロバイダです。150 行目の `withIncrementalHydration()` も同じ形ですが、146 行目で v22 から非推奨になっています（理由は 3 節）。160 行目の `withNoIncrementalHydration()` は**プロバイダを持ちません**。種類だけを伝える旗です。残りの 2 つ（`withNoHttpTransferCache` と `withHttpTransferCacheOptions`）は [転送キャッシュの章](../http/11-http-transfer-cache.md)で読みました。

| feature | ɵproviders | 中で provide されるもの | provideClientHydration での扱い |
| --- | --- | --- | --- |
| `withEventReplay()` | `ɵwithEventReplay()` | `IS_EVENT_REPLAY_ENABLED`、ブラウザでは `ENVIRONMENT_INITIALIZER` と `APP_BOOTSTRAP_LISTENER` | そのまま足す。詳細は [第 14 回](14-event-replay.md) |
| `withIncrementalHydration()` | `ɵwithIncrementalHydration()` | `ɵwithEventReplay()`、`IS_INCREMENTAL_HYDRATION_ENABLED: true`、`DEHYDRATED_BLOCK_REGISTRY`、ブラウザでは `INCREMENTAL_HYDRATION_BOOTSTRAP` と `APP_BOOTSTRAP_LISTENER` | v22 では 291 行目が**既定で同じものを足す**ので不要（非推奨）。[第 15 回](15-incremental-hydration.md) |
| `withNoIncrementalHydration()` | なし | — | 289〜291 行目で既定の `ɵwithIncrementalHydration()` を外す |
| `withI18nSupport()` | `ɵwithI18nSupport()` | `IS_I18N_HYDRATION_ENABLED` と `ENVIRONMENT_INITIALIZER` | そのまま足す。[第 13 回](13-hydration-i18n.md) |
| `withNoHttpTransferCache()` | なし | — | 既定の `ɵwithHttpTransferCache({})` を外す |
| `withHttpTransferCacheOptions(o)` | `ɵwithHttpTransferCache(o)` | `CACHE_OPTIONS`、`HTTP_ROOT_INTERCEPTOR_FNS`、`APP_BOOTSTRAP_LISTENER` | 既定の `ɵwithHttpTransferCache({})` の代わりに入る |

## 2. provideClientHydration：矛盾を止めて、既定の 3 組を並べる

features を Set に集める前半は [転送キャッシュの章](../http/11-http-transfer-cache.md)で読みました。「キャッシュ無し」と「キャッシュのオプション」を同時に渡すとエラーになる検査もそこにあります。その続きです。

📄 `angular/packages/platform-browser/src/hydration.ts` L269–279 （▶ の行: 270–271, 273）

```ts
269 │     if (
270 ▶       featuresKind.has(HydrationFeatureKind.IncrementalHydration) &&
271 ▶       featuresKind.has(HydrationFeatureKind.NoIncrementalHydration)
272 │     ) {
273 ▶       throw new RuntimeError(
274 │         RuntimeErrorCode.HYDRATION_CONFLICTING_FEATURES,
275 │         'Configuration error: found both withIncrementalHydration() and withNoIncrementalHydration() in the same call to provideClientHydration(), which is a contradiction.',
276 │       );
277 │     }
278 │   }
279 │ 
```

270〜271 行目、`withIncrementalHydration()` と `withNoIncrementalHydration()` を同時に渡すと、273 行目で `RuntimeError`（NG5001 `HYDRATION_CONFLICTING_FEATURES`）です。この検査は 278 行目で閉じる `ngDevMode` の if の中にあるので、**開発ビルドでだけ**止まります。本番ビルドでは検査そのものが消えます。

📄 `angular/packages/platform-browser/src/hydration.ts` L285–291 （▶ の行: 285–286, 289–291）

```ts
285 ▶     withDomHydration(),
286 ▶     featuresKind.has(HydrationFeatureKind.NoHttpTransferCache) || hasHttpTransferCacheOptions
287 │       ? []
288 │       : ɵwithHttpTransferCache({}),
289 ▶     featuresKind.has(HydrationFeatureKind.NoIncrementalHydration)
290 ▶       ? []
291 ▶       : ɵwithIncrementalHydration(),
```

戻り値の `makeEnvironmentProviders([...])` に並ぶ順番のうち、既定で入る 3 組がここです。

1. **285 行目：`withDomHydration()`**

   条件なしで必ず入ります。ハイドレーションの本体で、3〜7 節で中身を読みます。
2. **286 行目：`ɵwithHttpTransferCache({})`**

   旗が無ければ入ります。[転送キャッシュの章](../http/11-http-transfer-cache.md)の主題です。
3. **289〜291 行目：`ɵwithIncrementalHydration()`**

   `NoIncrementalHydration` の旗が無ければ入ります。**v22 ではインクリメンタルハイドレーションが既定で有効**なのは、この 3 行のためです。これを確かめたのは v22.2.0-next.7 のソースですが、このサイトが使っている 22.1.6 の配布物（`fesm2022/platform-browser.mjs`）にも同じ 3 項演算子があります。

feature から集めたプロバイダは、この 3 組の後ろに並びます。このサイトの `app.config.ts` は `provideClientHydration(withIncrementalHydration())` と書いているので、`ɵwithIncrementalHydration()` が 291 行目と feature の分とで 2 回並びます。値のトークンは後勝ちで 1 つになり（[R3Injector の章](../di/08-di-r3-injector-get.md)）、2 つ並ぶ `APP_BOOTSTRAP_LISTENER` は中で「もう始めたか」を見て 1 回しか動きません（[第 15 回](15-incremental-hydration.md)）。害はありませんが、v22 では書く必要がありません。

📄 `angular/packages/platform-browser/src/hydration.ts` L297–312 （▶ の行: 298, 305–306）

```ts
297 │     {
298 ▶       provide: APP_BOOTSTRAP_LISTENER,
299 │       multi: true,
300 │       useFactory: () => {
301 │         const appRef = inject(ApplicationRef);
302 │         const cacheState = inject(CACHE_ACTIVE);
303 │ 
304 │         return () => {
305 ▶           appRef.whenStable().then(() => {
306 ▶             cacheState.isActive = false;
307 │           });
308 │         };
309 │       },
310 │     },
311 │   ]);
312 │ }
```

最後の 1 つは転送キャッシュのための `APP_BOOTSTRAP_LISTENER` です。298 行目で登録し、305〜306 行目、アプリが安定したら `cacheState.isActive = false` にしてキャッシュを止めます。「安定したら止める・片付ける」という形は、このあと 7 節の `withDomHydration` でもう一度出てきます。

## 3. withDomHydration ①：IS\_HYDRATION\_DOM\_REUSE\_ENABLED はいつ true か

ここから core の `withDomHydration()` です。最初のプロバイダが、ハイドレーションをするかどうかを決めるトークンです。

📄 `angular/packages/core/src/hydration/api.ts` L193–210 （▶ の行: 198–199, 202–203, 206）

```ts
193 │ export function withDomHydration(): EnvironmentProviders {
194 │   const providers: Provider[] = [
195 │     {
196 │       provide: IS_HYDRATION_DOM_REUSE_ENABLED,
197 │       useFactory: () => {
198 ▶         let isEnabled = true;
199 ▶         if (typeof ngServerMode === 'undefined' || !ngServerMode) {
200 │           // On the client, verify that the server response contains
201 │           // hydration annotations. Otherwise, keep hydration disabled.
202 ▶           const transferState = inject(TransferState, {optional: true});
203 ▶           isEnabled = !!transferState?.get(NGH_DATA_KEY, null);
204 │         }
205 │         if (isEnabled) {
206 ▶           performanceMarkFeature('NgHydration');
207 │         }
208 │         return isEnabled;
209 │       },
210 │     },
```

1. **198 行目：まず `true`**

   サーバー（`ngServerMode` が true）では 199 行目の if に入らないので、**サーバーでは常に true** です。サーバーはこれを見て ngh を書き出します（[第 8 回](08-hydration-annotate.md)）。
2. **199〜203 行目：ブラウザでは TransferState を見る**

   202 行目で `TransferState` を inject し、203 行目で `NGH_DATA_KEY`（キー名 `__nghData__`）を引きます。`TransferState` は最初に inject されたときに `<script id="ng-state">` を `JSON.parse` します（[転送キャッシュの章](../http/11-http-transfer-cache.md)）。サーバーが書いた配列があれば `!!` で true、無ければ `null` なので false です。
3. **206 行目：性能計測の印**

   `performanceMarkFeature('NgHydration')` は、ハイドレーションが使われたことを Performance API の印として残すだけです。

> [!NOTE]
> **ポイント**
>
> つまり「`provideClientHydration` を書いた」ことと「ハイドレーションが起きる」ことは別です。**ブラウザで true になる条件は、届いた HTML に `__nghData__` があること**だけです。同じアプリでも、サーバーで描画されなかったページ（後で出る ngcm のページ）では false になり、普通のクライアント描画になります。

## 4. withDomHydration ②：ENVIRONMENT\_INITIALIZER の分かれ道

📄 `angular/packages/core/src/hydration/api.ts` L211–249 （▶ の行: 216, 218, 223, 227–229, 233, 237）

```ts
211 │     {
212 │       provide: ENVIRONMENT_INITIALIZER,
213 │       useValue: () => {
214 │         // i18n support is enabled by calling withI18nSupport(), but there's
215 │         // no way to turn it off (e.g. for tests), so we turn it off by default.
216 ▶         setIsI18nHydrationSupportEnabled(false);
217 │ 
218 ▶         if (typeof ngServerMode !== 'undefined' && ngServerMode) {
219 │           // Since this function is used across both server and client,
220 │           // make sure that the runtime code is only added when invoked
221 │           // on the client (see the `enableHydrationRuntimeSupport` function
222 │           // call below).
223 ▶           return;
224 │         }
225 │ 
226 │         const doc = inject(DOCUMENT);
227 ▶         if (inject(IS_HYDRATION_DOM_REUSE_ENABLED)) {
228 ▶           verifySsrContentsIntegrity(doc);
229 ▶           enableHydrationRuntimeSupport();
230 │         } else if (
231 │           typeof ngDevMode !== 'undefined' &&
232 │           ngDevMode &&
233 ▶           !isClientRenderModeEnabled(doc)
234 │         ) {
235 │           const console = inject(Console);
236 │           const message = formatRuntimeError(
237 ▶             RuntimeErrorCode.MISSING_HYDRATION_ANNOTATIONS,
238 │             'Angular hydration was requested on the client, but there was no ' +
239 │               'serialized information present in the server response, ' +
240 │               'thus hydration was not enabled. ' +
241 │               'Make sure the `provideClientHydration()` is included into the list ' +
242 │               'of providers in the server part of the application configuration.',
243 │           );
244 │           console.warn(message);
245 │         }
246 │       },
247 │       multi: true,
248 │     },
249 │   ];
```

`ENVIRONMENT_INITIALIZER` は環境インジェクタ（アプリ全体のインジェクタ）が作られた直後に呼ばれる関数です（[インジェクタの章](../boot/08-boot-injectors.md)）。

1. **216 行目：i18n のハイドレーションを既定で切る**

   `withI18nSupport()` を足すと、その初期化子があとで true に戻します（[第 13 回](13-hydration-i18n.md)）。
2. **218〜223 行目：サーバーなら何もしない**

   ここから下はブラウザ専用です。サーバーにハイドレーションの実行コードを入れないための早期 return です。
3. **227〜229 行目：true なら、まず検査、次に実装の差し替え**

   228 行目の `verifySsrContentsIntegrity`（6 節）で HTML が途中で書き換えられていないか確かめ、229 行目の `enableHydrationRuntimeSupport`（5 節）でハイドレーション用の関数を有効にします。
4. **230〜245 行目：false なら、開発ビルドで警告**

   233 行目、body に `ngcm` が付いていない（＝クライアント描画のページとして配られたのではない）ときだけ、237 行目の NG0505 `MISSING_HYDRATION_ANNOTATIONS` を `console.warn` します。「ブラウザでは頼んだのに、サーバーの応答に情報が無い。サーバー側の設定に `provideClientHydration()` を入れたか」という意味です。

## 5. enableHydrationRuntimeSupport：使わないアプリにコードを入れない

📄 `angular/packages/core/src/hydration/api.ts` L81–110 （▶ の行: 85, 99–102, 108）

```ts
 81 │ /**
 82 │  * Defines a period of time that Angular waits for the `ApplicationRef.isStable` to emit `true`.
 83 │  * If there was no event with the `true` value during this time, Angular reports a warning.
 84 │  */
 85 ▶ export const APPLICATION_IS_STABLE_TIMEOUT = 10_000;
 86 │ 
 87 │ /**
 88 │  * Brings the necessary hydration code in tree-shakable manner.
 89 │  * The code is only present when the `provideClientHydration` is
 90 │  * invoked. Otherwise, this code is tree-shaken away during the
 91 │  * build optimization step.
 92 │  *
 93 │  * This technique allows us to swap implementations of methods so
 94 │  * tree shaking works appropriately when hydration is disabled or
 95 │  * enabled. It brings in the appropriate version of the method that
 96 │  * supports hydration only when enabled.
 97 │  */
 98 │ function enableHydrationRuntimeSupport() {
 99 ▶   if (!isHydrationSupportEnabled) {
100 ▶     isHydrationSupportEnabled = true;
101 ▶     enableRetrieveHydrationInfoImpl();
102 ▶     enableLocateOrCreateElementNodeImpl();
103 │     enableLocateOrCreateTextNodeImpl();
104 │     enableLocateOrCreateElementContainerNodeImpl();
105 │     enableLocateOrCreateContainerAnchorImpl();
106 │     enableLocateOrCreateContainerRefImpl();
107 │     enableFindMatchingDehydratedViewImpl();
108 ▶     enableApplyRootElementTransformImpl();
109 │   }
110 │ }
```

99〜100 行目、モジュール変数で 1 回だけに絞り、101〜108 行目で `enable…Impl()` を 8 つ呼びます。どれも中身は同じ形です。命令側の 1 つを見ます。

📄 `angular/packages/core/src/render3/instructions/shared.ts` L193–229 （▶ の行: 193–194, 204, 213, 220, 227–228）

```ts
193 ▶ export function applyRootElementTransform(rootElement: HTMLElement) {
194 ▶   _applyRootElementTransformImpl(rootElement as HTMLElement);
195 │ }
196 │ 
197 │ /**
198 │  * Reference to a function that applies transformations to the root HTML element
199 │  * of an app. When hydration is enabled, this processes any corrupt text nodes
200 │  * so they are properly hydratable on the client.
201 │  *
202 │  * @param rootElement the app root HTML Element
203 │  */
204 ▶ let _applyRootElementTransformImpl: typeof applyRootElementTransformImpl = () => null;
205 │ 
206 │ /**
207 │  * Processes text node markers before hydration begins. This replaces any special comment
208 │  * nodes that were added prior to serialization are swapped out to restore proper text
209 │  * nodes before hydration.
210 │  *
211 │  * @param rootElement the app root HTML Element
212 │  */
213 ▶ export function applyRootElementTransformImpl(rootElement: HTMLElement) {
214 │   if (hasSkipHydrationAttrOnRElement(rootElement)) {
215 │     // Handle a situation when the `ngSkipHydration` attribute is applied
216 │     // to the root node of an application. In this case, we should clear
217 │     // the contents and render everything from scratch.
218 │     clearElementContents(rootElement as RElement);
219 │   } else {
220 ▶     processTextNodeMarkersBeforeHydration(rootElement);
221 │   }
222 │ }
223 │ 
224 │ /**
225 │  * Sets the implementation for the `applyRootElementTransform` function.
226 │  */
227 ▶ export function enableApplyRootElementTransformImpl() {
228 ▶   _applyRootElementTransformImpl = applyRootElementTransformImpl;
229 │ }
```

1. **204 行目：既定は何もしない関数**

   `_applyRootElementTransformImpl` は最初 `() => null` です。
2. **193〜194 行目：呼ぶ側は、いつも変数経由**

   ルート要素を作る処理は `applyRootElementTransform` を呼びますが、中では変数に入っている関数を呼ぶだけです。
3. **227〜228 行目：enable で本物に差し替える**

   `enableApplyRootElementTransformImpl()` が呼ばれたときだけ、変数が 213 行目の本物になります。本物は 220 行目でサーバーが入れたテキストノードの印を戻します（[第 10 回](10-hydration-claim.md)）。

なぜこんな回り道をするのか。87〜97 行目のコメントが理由です。`enable…Impl()` を呼ぶのは `withDomHydration()` の初期化子だけなので、`provideClientHydration` を書かないアプリでは、本物の関数（213 行目など）を参照するコードが 1 つもありません。するとビルドの tree shaking（使われないコードを削る最適化）が本物を丸ごと消します。**ハイドレーションを使わないアプリの main.js には、ハイドレーションの実装が入らない**のです。

## 6. verifySsrContentsIntegrity：nghm の印を探す

📄 `angular/packages/core/src/hydration/utils.ts` L750–781 （▶ の行: 754, 777–779）

```ts
750 │ function isSsrContentsIntegrity(node: ChildNode | null): boolean {
751 │   return (
752 │     !!node &&
753 │     node.nodeType === Node.COMMENT_NODE &&
754 ▶     node.textContent?.trim() === SSR_CONTENT_INTEGRITY_MARKER
755 │   );
756 │ }
757 │ 
758 │ function skipTextNodes(node: ChildNode | null): ChildNode | null {
759 │   // Ignore whitespace. Before the <body>, we shouldn't find text nodes that aren't whitespace.
760 │   while (node && node.nodeType === Node.TEXT_NODE) {
761 │     node = node.previousSibling;
762 │   }
763 │   return node;
764 │ }
765 │ 
766 │ /**
767 │  * Verifies whether the DOM contains a special marker added during SSR time to make sure
768 │  * there is no SSR'ed contents transformations happen after SSR is completed. Typically that
769 │  * happens either by CDN or during the build process as an optimization to remove comment nodes.
770 │  * Hydration process requires comment nodes produced by Angular to locate correct DOM segments.
771 │  * When this special marker is *not* present - throw an error and do not proceed with hydration,
772 │  * since it will not be able to function correctly.
773 │  *
774 │  * Note: this function is invoked only on the client, so it's safe to use DOM APIs.
775 │  */
776 │ export function verifySsrContentsIntegrity(doc: Document): void {
777 ▶   for (const node of doc.body.childNodes) {
778 ▶     if (isSsrContentsIntegrity(node)) {
779 ▶       return;
780 │     }
781 │   }
```

📄 `angular/packages/core/src/hydration/utils.ts` L783–810 （▶ の行: 789, 796, 801–802）

```ts
783 │   // Check if the HTML parser may have moved the marker to just before the <body> tag,
784 │   // e.g. because the body tag was implicit and not present in the markup. An implicit body
785 │   // tag is unlikely to interfer with whitespace/comments inside of the app's root element.
786 │ 
787 │   // Case 1: Implicit body. Example:
788 │   //   <!doctype html><head><title>Hi</title></head><!--nghm--><app-root></app-root>
789 ▶   const beforeBody = skipTextNodes(doc.body.previousSibling);
790 │   if (isSsrContentsIntegrity(beforeBody)) {
791 │     return;
792 │   }
793 │ 
794 │   // Case 2: Implicit body & head. Example:
795 │   //   <!doctype html><head><title>Hi</title><!--nghm--><app-root></app-root>
796 ▶   let endOfHead = skipTextNodes(doc.head.lastChild);
797 │   if (isSsrContentsIntegrity(endOfHead)) {
798 │     return;
799 │   }
800 │ 
801 ▶   throw new RuntimeError(
802 ▶     RuntimeErrorCode.MISSING_SSR_CONTENT_INTEGRITY_MARKER,
803 │     typeof ngDevMode !== 'undefined' &&
804 │       ngDevMode &&
805 │       'Angular hydration logic detected that HTML content of this page was modified after it ' +
806 │         'was produced during server side rendering. Make sure that there are no optimizations ' +
807 │         'that remove comment nodes from HTML enabled on your CDN. Angular hydration ' +
808 │         'relies on HTML produced by the server, including whitespaces and comment nodes.',
809 │   );
810 │ }
```

サーバーは body の先頭に `<!--nghm-->` というコメントを入れます（書く側は [第 8 回](08-hydration-annotate.md)）。777〜779 行目で body の直下の子を回し、754 行目の「中身が `nghm` のコメント」を探します。789 行目と 796 行目は、HTML に `<body>` タグが書かれておらずブラウザが補ったせいで、印が body の手前や head の末尾に移った場合の救済です。どこにも無ければ 801 行目で NG0507 `MISSING_SSR_CONTENT_INTEGRITY_MARKER` を**投げます**（警告ではありません）。

なぜコメント 1 つでそこまでするのか。805〜808 行目のメッセージのとおり、CDN などが「HTML を軽くする」ためにコメントを消すことがあるからです。ハイドレーションは `@if` などの位置を示すコメントを頼りに DOM を辿るので、コメントが消えた HTML では正しく動けません。`nghm` が残っていれば、他のコメントも残っているとみなします。

## 7. ngcm：クライアント描画のページに付く印

📄 `angular/packages/core/src/hydration/api.ts` L166–181 （▶ の行: 171, 178–179）

```ts
166 │ /**
167 │  * Defines a name of an attribute that is added to the <body> tag
168 │  * in the `index.html` file in case a given route was configured
169 │  * with `RenderMode.Client`. 'cm' is an abbreviation for "Client Mode".
170 │  */
171 ▶ export const CLIENT_RENDER_MODE_FLAG = 'ngcm';
172 │ 
173 │ /**
174 │  * Checks whether the `RenderMode.Client` was defined for the current route.
175 │  */
176 │ function isClientRenderModeEnabled(doc: Document): boolean {
177 │   return (
178 ▶     (typeof ngServerMode === 'undefined' || !ngServerMode) &&
179 ▶     doc.body.hasAttribute(CLIENT_RENDER_MODE_FLAG)
180 │   );
181 │ }
```

171 行目の `ngcm` は "Client Mode" の略です。178〜179 行目、ブラウザで body にこの属性があれば true。使われるのは 4 節の 233 行目だけで、**警告を出さないため**の印です。ハイドレーションの有無は 3 節のとおり `__nghData__` で決まります。付けるのは Angular CLI のビルドです。

📄 `angular-cli/packages/angular/build/src/utils/index-file/ngcm-attribute.ts` L11–42 （▶ の行: 18, 27, 32, 35）

```ts
11 │ /**
12 │  * Defines a name of an attribute that is added to the `<body>` tag
13 │  * in the `index.html` file in case a given route was configured
14 │  * with `RenderMode.Client`. 'cm' is an abbreviation for "Client Mode".
15 │  *
16 │  * @see https://github.com/angular/angular/pull/58004
17 │  */
18 ▶ const CLIENT_RENDER_MODE_FLAG = 'ngcm';
19 │ 
20 │ /**
21 │  * Transforms the provided HTML by adding the `ngcm` attribute to the `<body>` tag.
22 │  * This is used in the client-side rendered (CSR) version of `index.html` to prevent hydration warnings.
23 │  *
24 │  * @param html The HTML markup to be transformed.
25 │  * @returns A promise that resolves to the transformed HTML string with the necessary modifications.
26 │  */
27 ▶ export async function addNgcmAttribute(html: string): Promise<string> {
28 │   const { rewriter, transformedContent } = await htmlRewritingStream(html);
29 │ 
30 │   rewriter.on('startTag', (tag) => {
31 │     if (
32 ▶       tag.tagName === 'body' &&
33 │       !tag.attrs.some((attr) => attr.name === CLIENT_RENDER_MODE_FLAG)
34 │     ) {
35 ▶       tag.attrs.push({ name: CLIENT_RENDER_MODE_FLAG, value: '' });
36 │     }
37 │ 
38 │     rewriter.emitStartTag(tag);
39 │   });
40 │ 
41 │   return transformedContent();
42 │ }
```

27 行目の `addNgcmAttribute` は、HTML を流しながら書き換え、32 行目で `<body>` を見つけると 35 行目で `ngcm=""` を足します。これはクライアント描画用の `index.csr.html` を作るときに使われます（`RenderMode.Client` のルートでは、`@angular/ssr` の `AngularServerApp` がこの HTML をそのまま返します。[第 5 回](05-ssr-server-routes.md)）。そのページには `__nghData__` が無いので、ngcm が無ければ毎回 NG0505 の警告が出てしまいます。

## 8. APP\_BOOTSTRAP\_LISTENER：安定したら、使われなかった DOM を片付ける

📄 `angular/packages/core/src/hydration/api.ts` L251–289 （▶ の行: 251, 254, 260, 264, 267, 278, 285, 289）

```ts
251 ▶   if (typeof ngServerMode === 'undefined' || !ngServerMode) {
252 │     providers.push(
253 │       {
254 ▶         provide: PRESERVE_HOST_CONTENT,
255 │         useFactory: () => {
256 │           // Preserve host element content only in a browser
257 │           // environment and when hydration is configured properly.
258 │           // On a server, an application is rendered from scratch,
259 │           // so the host content needs to be empty.
260 ▶           return inject(IS_HYDRATION_DOM_REUSE_ENABLED);
261 │         },
262 │       },
263 │       {
264 ▶         provide: APP_BOOTSTRAP_LISTENER,
265 │         useFactory: () => {
266 │           const scheduler = inject(ChangeDetectionScheduler);
267 ▶           if (inject(IS_HYDRATION_DOM_REUSE_ENABLED)) {
268 │             const appRef = inject(ApplicationRef);
269 │ 
270 │             return () => {
271 │               // Wait until an app becomes stable and cleanup all views that
272 │               // were not claimed during the application bootstrap process.
273 │               // The timing is similar to when we start the serialization process
274 │               // on the server.
275 │               //
276 │               // Note: the cleanup task *MUST* be scheduled within the Angular zone in Zone apps
277 │               // to ensure that change detection is properly run afterward.
278 ▶               whenStableWithTimeout(appRef).then(() => {
279 │                 // Note: we have to check whether the application is destroyed before
280 │                 // performing other operations with the `injector`.
281 │                 // The application may be destroyed **before** it becomes stable, so when
282 │                 // the `whenStableWithTimeout` resolves, the injector might already be in
283 │                 // a destroyed state. Thus, calling `injector.get` would throw an error
284 │                 // indicating that the injector has already been destroyed.
285 ▶                 if (appRef.destroyed) {
286 │                   return;
287 │                 }
288 │ 
289 ▶                 cleanupDehydratedViews(appRef);
```

1. **251 行目：ここからはブラウザだけ**

   サーバーのプロバイダには入りません。
2. **254〜261 行目：PRESERVE\_HOST\_CONTENT**

   ルート要素（`<app-root>`）の中身を消さずに残すかどうか。260 行目で 3 節のトークンと同じ値にします。既定は false で、クライアント描画ではブートストラップ時にルート要素の中身が消されてから描かれます（[ApplicationRef の章](../boot/10-boot-application-ref.md)）。
3. **264〜267 行目：ハイドレーションしたときだけ、リスナーを返す**

   `APP_BOOTSTRAP_LISTENER` はルートコンポーネントを作り終えた直後に呼ばれます。false なら何もしない関数 `() => {}` を返します。
4. **278 行目：`whenStableWithTimeout(appRef)` を待つ**

   アプリが安定する（保留中の作業が無くなる）まで待ちます。サーバーが ngh を書き出したのも同じ「安定した」時点です（274〜275 行目のコメント）。
5. **285 行目：その間にアプリが破棄されていたら何もしない**

   破棄済みのインジェクタに `get` すると例外になるためです（279〜284 行目のコメント）。
6. **289 行目：`cleanupDehydratedViews(appRef)`**

   サーバーにはあったのにブラウザでは誰にも引き取られなかったビュー（たとえば `@if` の分岐がサーバーとブラウザで違ったとき）を DOM から外します。中身は [第 11 回](11-hydration-containers.md)、そのあと描画フックを予約する行は [NotificationSource の章](../zoneless/02-zoneless-notification-source.md)で読みます。

### 10 秒待っても安定しないとき

📄 `angular/packages/core/src/hydration/api.ts` L143–164 （▶ の行: 147–148, 156–157, 160）

```ts
143 │ /**
144 │  * Returns a Promise that is resolved when an application becomes stable.
145 │  */
146 │ function whenStableWithTimeout(appRef: ApplicationRef): Promise<void> {
147 ▶   const whenStablePromise = appRef.whenStable();
148 ▶   if (typeof ngDevMode !== 'undefined' && ngDevMode) {
149 │     const timeoutTime = APPLICATION_IS_STABLE_TIMEOUT;
150 │     const console = appRef.injector.get(Console);
151 │     const ngZone = appRef.injector.get(NgZone);
152 │ 
153 │     // The following call should not and does not prevent the app to become stable
154 │     // We cannot use RxJS timer here because the app would remain unstable.
155 │     // This also avoids an extra change detection cycle.
156 ▶     const timeoutId = ngZone.runOutsideAngular(() => {
157 ▶       return setTimeout(() => logWarningOnStableTimedout(timeoutTime, console), timeoutTime);
158 │     });
159 │ 
160 ▶     whenStablePromise.finally(() => clearTimeout(timeoutId));
161 │   }
162 │ 
163 │   return whenStablePromise;
164 │ }
```

📄 `angular/packages/core/src/hydration/api.ts` L387–398 （▶ の行: 397）

```ts
387 │ /**
388 │  *
389 │  * @param time The time in ms until the stable timedout warning message is logged
390 │  */
391 │ function logWarningOnStableTimedout(time: number, console: Console): void {
392 │   const message =
393 │     `Angular hydration expected the ApplicationRef.isStable() to emit \`true\`, but it ` +
394 │     `didn't happen within ${time}ms. Angular hydration logic depends on the application becoming stable ` +
395 │     `as a signal to complete hydration process.`;
396 │ 
397 ▶   console.warn(formatRuntimeError(RuntimeErrorCode.HYDRATION_STABLE_TIMEDOUT, message));
398 │ }
```

147 行目の `appRef.whenStable()` が本体で、148 行目から下は開発ビルドだけの見張りです。156〜157 行目で `APPLICATION_IS_STABLE_TIMEOUT`（5 節の引用の 85 行目、`10_000` ミリ秒）後に警告するタイマーを置き、160 行目で安定したら消します。10 秒以内に安定しなければ 397 行目の NG0506 `HYDRATION_STABLE_TIMEDOUT` が出ます。タイマーを `runOutsideAngular` で置くのは、このタイマー自体が zone.js のアプリで「保留中の作業」に数えられて安定を邪魔しないためです（153〜155 行目のコメント）。`setInterval` を回し続けるコンポーネントなどで安定しないと、片付けが 10 秒を過ぎても始まりません。何が安定を止めているかは [PendingTasks の章](../zoneless/09-zoneless-pending-tasks.md)で読みます。

## 9. 呼び出しの連なり（ブラウザで起動するとき）

- 👤 `provideClientHydration(withIncrementalHydration())` — src/app/app.config.ts
  - `withDomHydration()` — platform-browser/src/hydration.ts L285
  - `ɵwithHttpTransferCache({})` / `ɵwithIncrementalHydration()` — L286 / L291
- 👤 `bootstrapApplication(App, appConfig)` — src/main.ts
  - `ENVIRONMENT_INITIALIZER` の関数 — core/src/hydration/api.ts L213
    - `inject(IS_HYDRATION_DOM_REUSE_ENABLED)` — L227 — *useFactory が走り、L203 で TransferState の \_\_nghData\_\_ を見る*
    - `verifySsrContentsIntegrity(doc)` — utils.ts L776 — *nghm が無ければ NG0507*
    - `enableHydrationRuntimeSupport()` — api.ts L98 — *8 つの enable…Impl で実装を差し替え*
  - `ApplicationRef.bootstrap(App)` — ルートコンポーネントを作る — *ここで DOM を引き取る（第 9〜11 回）*
  - `APP_BOOTSTRAP_LISTENER` のリスナー — api.ts L270
    - `whenStableWithTimeout(appRef)` — L146 — *開発ビルドでは 10 秒の見張り*
      - `cleanupDehydratedViews(appRef)` — L289 → cleanup.ts — *引き取られなかったビューを外す*

## 10. DEMO：このページはなぜハイドレーションされたのか

> **🧪 DEMO — いまの document とトークンの値を読む**
>
> ボタンを押すと、いま開いている document の body 属性・body 直下のコメント・`<script id="ng-state">` を読み、このサイト本体の環境インジェクタから `ɵIS_HYDRATION_DOM_REUSE_ENABLED` と `ɵIS_INCREMENTAL_HYDRATION_ENABLED` を inject した値を並べます。トークンの値はブートストラップのときに 1 回だけ決まります。サイト内でリンクを辿ってこの章に来た場合、document と ng-state は**最初に開いたページのもの**です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/hydration-provide)

このサイトは全ページをプリレンダーしているので、どのページから入っても `__nghData__` があり、IS\_HYDRATION\_DOM\_REUSE\_ENABLED は true です。`/index.csr.html` はプリレンダーと一緒に出力されるクライアント描画用の HTML で、body に `ngcm=""` が付いています（配っているサーバーなら 2 つめのボタンで見えます）。

## 聞かれそうな質問

**Q. provideClientHydration を書き忘れると、どうなりますか？**

ブラウザ側で書き忘れた場合、4 節の初期化子が無いので 101〜108 行目の差し替えが起きず、5 節の 204 行目の「何もしない関数」のままです。8 節の `PRESERVE_HOST_CONTENT` も既定の false なので、ブートストラップでルート要素の中身が消され、ゼロから描き直されます。エラーは出ません。画面がちらつき、サーバー描画の DOM が無駄になるだけです。サーバー側で書き忘れた場合は ngh が書かれないので、ブラウザでは 3 節の 203 行目が false になり、開発ビルドなら 237 行目の NG0505 が警告されます。

**Q. サーバー側の config にも provideClientHydration が要りますか？**

📄 `angular/packages/core/src/application/application_config.ts` L23–38 （▶ の行: 34）

```ts
23 │ /**
24 │  * Merge multiple application configurations from left to right.
25 │  *
26 │  * @param configs Two or more configurations to be merged.
27 │  * @returns A merged [ApplicationConfig](api/core/ApplicationConfig).
28 │  *
29 │  * @publicApi
30 │  */
31 │ export function mergeApplicationConfig(...configs: ApplicationConfig[]): ApplicationConfig {
32 │   return configs.reduce(
33 │     (prev, curr) => {
34 ▶       return Object.assign(prev, curr, {providers: [...prev.providers, ...curr.providers]});
35 │     },
36 │     {providers: []},
37 │   );
38 │ }
```

要ります。ただし普通は書き足す必要がありません。CLI が作る `app.config.server.ts` は `mergeApplicationConfig(appConfig, serverConfig)` で、34 行目のとおり**ブラウザ用の providers の後ろにサーバー用を連結**するので、`app.config.ts` の `provideClientHydration()` がサーバーにも入ります。サーバーでは 3 節の 198 行目のまま true になり、これを見たサーバーが ngh を書き出します（[第 2 回](02-ssr-render-application.md)の `prepareForHydration`）。ブラウザ用とサーバー用で別々の config を手書きしていると、ここが抜けます。

**Q. v22 でインクリメンタルハイドレーションは既定になったのですか？**

はい。2 節の 289〜291 行目で、`withNoIncrementalHydration()` を渡さない限り `ɵwithIncrementalHydration()` が入ります。v22.2.0-next.7 のソースと、このサイトにインストールされている 22.1.6 の `fesm2022/platform-browser.mjs` の両方で同じ条件式になっていることを確かめました。そのため `withIncrementalHydration()` は 146 行目で非推奨（v24 で削除予定）です。外したいときは 160 行目の `withNoIncrementalHydration()` を渡し、両方を渡すと開発ビルドでは 273 行目のエラーになります。

**Q. CDN で HTML を圧縮したら、ハイドレーションでエラーになりました。**

コメントを消す最適化が有効だと、6 節の 777〜781 行目と 789〜799 行目で `nghm` が見つからず、801 行目で NG0507 が投げられます。ハイドレーションは `@if` や `<ng-container>` の位置を示すコメントを頼りにするので、コメントを残す設定にします。空白の詰め直しも DOM の形を変えるので同様です。

**Q. NG0506（安定しない）の警告が出ました。何が困るのですか？**

8 節の 278 行目で待っている間は、289 行目の片付けが始まりません。サーバーにはあってブラウザでは使われなかった DOM が、画面に残り続けます。警告自体は開発ビルドだけ（148 行目）ですが、本番でも片付けは同じだけ遅れます。

## 読み終えて

- feature は `{ɵkind, ɵproviders}` の 2 つ組。`withNo…()` はプロバイダを持たない旗で、既定の組を外すためだけにある。
- `provideClientHydration` は `withDomHydration()`・転送キャッシュ・インクリメンタルハイドレーションを既定で並べる。v22 ではインクリメンタルも既定。
- `IS_HYDRATION_DOM_REUSE_ENABLED` はサーバーでは常に true、ブラウザでは TransferState に `__nghData__` があるときだけ true。
- ハイドレーションの実装は `enable…Impl()` で関数の変数を差し替えて入る。書かないアプリでは tree shaking で消える。
- ブラウザでは `nghm` で HTML が無傷か確かめ、`whenStable` の後に使われなかったビューを片付ける。`ngcm` は警告を消すための印。

---

← 前: [プリレンダー：ビルド時に全ルートを HTML にする](06-ssr-prerender.md)  
次: [annotateForHydration：サーバーで DOM の形を ngh に書き出す](08-hydration-annotate.md) →
