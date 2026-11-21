[目次](../README.md) › [platform の説明文の読み残し](README.md) › 第 5 回 / 全 7 回

# platform-server の説明文：renderApplication・provideServerRendering・INITIAL\_CONFIG

> platform-server/src の utils.ts・provide\_server.ts・transfer\_state.ts・domino\_adapter.ts・location.ts の未読の行：renderApplication と renderModule の説明文と例、document・url・platformProviders と INITIAL\_CONFIG、TransferState の書き出しと BEFORE\_APP\_SERIALIZED の順、provideServerRendering の例、DominoAdapter の残り。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-server)

---

この章で分かること：`renderApplication`・`renderModule`・`provideServerRendering` の説明文（JSDoc）と、`INITIAL_CONFIG`・`BEFORE_APP_SERIALIZED`・TransferState の書き出し・`DominoAdapter` の残りの行が約束していることと、それが本物の `@angular/platform-server` 22.2.6 でそのとおりに動くか。結果として、`renderApplication` の例は 3 か所で型検査に通らず、`bootstrap` に渡るのは説明文の言う `Injector` ではなく `{platformRef}` でした。`provideServerRendering` の例は、そのまま動かすと NG0401 です。`DominoAdapter.getGlobalEventTarget` の「Ivy ではもう使われない」は、`Renderer2.listen('window', …)` が今も呼んでいました。

読む対象は `packages/platform-server/src/` の `utils.ts`・`provide_server.ts`・`transfer_state.ts`・`domino_adapter.ts`・`location.ts`・`http.ts` の、まだどの章も引いていない行です（../angular、8576f161ae4）。`renderApplication` の 6 段の手順は[renderApplication の章](../platform/02-ssr-render-application.md)、`platformServer`・`_document`・domino・`ServerModule` は[platformServer の章](../platform/03-ssr-platform-server.md)、`allowedHosts` と URL の検査は[document と location の初期化の章](../ssrx/02-ssrx-location-allowed-hosts.md)が読んでいるので、ここでは繰り返さずに行だけ指します。

1. [1. bootstrapApplication](01-pbd-browser.md)
2. [2. provideClientHydration](02-pbd-hydration.md)
3. [3. レンダラーとイベント](03-pbd-dom.md)
4. [4. Meta・Title・tools](04-pbd-meta-tools.md)
5. **5. platform-server**（この章）
6. [6. platform-browser-dynamic](06-pbd-dynamic.md)
7. [7. spec と issue](07-pbd-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> SSR（サーバーサイドレンダリング）は、サーバーでアプリを一度動かして HTML の文字列を作り、それをブラウザーに返すしくみです。`@angular/platform-server` はその「サーバーで動かす土台」で、DOM の代わりに domino という JavaScript だけで書かれた DOM を使います。このページの上では platform-server を動かせないので（初めに読む JS が増えるうえ、ページは本物のブラウザーの DOM を使っている）、この章の DEMO はすべて、Node で本物の platform-server を動かした記録の再生です。

## 1. renderApplication の説明文：例と bootstrap の引数

📄 `angular/packages/platform-server/src/utils.ts` L311–347 （▶ の行: 316, 322–326, 328–332, 334–336, 338, 343–345）

````ts
311 │ /**
312 │  * Bootstraps an instance of an Angular application and renders it to a string.
313 │  *
314 │  * @usageNotes
315 │  *
316 ▶  * ```ts
317 │  * import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
318 │  * import { renderApplication } from '@angular/platform-server';
319 │  * import { ApplicationConfig } from '@angular/core';
320 │  * import { AppComponent } from './app.component';
321 │  *
322 ▶  * const appConfig: ApplicationConfig = { providers: [...] };
323 ▶  * const bootstrap = (context: BootstrapContext) =>
324 ▶  *   bootstrapApplication(AppComponent, config, context);
325 ▶  * const output = await renderApplication(bootstrap);
326 ▶  * ```
327 │  *
328 ▶  * @param bootstrap A method that when invoked returns a promise that returns an `ApplicationRef`
329 ▶  *     instance once resolved. The method is invoked with an `Injector` instance that
330 ▶  *     provides access to the platform-level dependency injection context.
331 ▶  * @param options Additional configuration for the render operation:
332 ▶  *  - `document` - the document of the page to render, either as an HTML string or
333 │  *                 as a reference to the `document` instance.
334 ▶  *  - `url` - the URL for the current render request.
335 ▶  *  - `platformProviders` - the platform level providers for the current render request.
336 ▶  *  - `allowedHosts` - the allowed hosts list for host validation in server-side rendering.
337 │  *
338 ▶  * @returns A Promise, that returns serialized (to a string) rendered page, once resolved.
339 │  *
340 │  * @publicApi
341 │  */
342 │ export async function renderApplication(
343 ▶   bootstrap: (context: BootstrapContext) => Promise<ApplicationRef>,
344 ▶   options: {
345 ▶     document?: string | Document;
346 │     url?: string;
347 │     platformProviders?: Provider[];
````

316〜326 行目の例は、そのままでは型検査に通りません。手元で strict の tsc（サイトの TypeScript 6.0.3）にかけると、322 行目の `providers: [...]` が TS1109「Expression expected.」で止まります。`...` は「ここに自分の provider を書く」という省略の印です。`[]` に直すと、次の 2 つが出ました。324 行目の `config` は TS2304「Cannot find name 'config'.」（322 行目で宣言したのは `appConfig`）、325 行目の `renderApplication(bootstrap)` は TS2554「Expected 2 arguments, but got 1.」（344 行目の `options` は省略できない引数）です。`config` を `appConfig` に、325 行目を `renderApplication(bootstrap, {})` にすると 0 件でした。

📄 `例の型検査（手元の記録、2026-11-22）`

```
# utils.ts L317〜325 の例をそのまま（AppComponent は空のコンポーネントを置いた）
ex-render.ts(6,55): error TS1109: Expression expected.          # providers: [...]
# [...] を [] にすると
ex-render2.ts(8,38): error TS2304: Cannot find name 'config'.
ex-render2.ts(9,22): error TS2554: Expected 2 arguments, but got 1.
# config → appConfig、renderApplication(bootstrap, {}) にすると 0 件
# provide_server.ts L24〜26 の例（import を足しただけ）は 0 件
```

`config` の取り違えは、`BootstrapContext` を入れた 28926ba92cf（2025-09-08、``feat(core): introduce `BootstrapContext` for improved server bootstrapping (#63562)``）で例を書き直したときからです。その前の例も `renderApplication(bootstrap)` と 1 引数で、`options` は b5278cc115e（2023-02-28）で bootstrap 関数を受け付けるようにしたときから省略できない引数でした。

328〜330 行目は「bootstrap の関数は、platform の DI の文脈に触れる `Injector` のインスタンスで呼ばれる」と書きます。これも 28926ba92cf で足された文です。ところが同じコミットで実装は `bootstrap({platformRef})`（L362）になり、343 行目の型も `(context: BootstrapContext) => …` です。DEMO の「1. bootstrap の引数」で、渡ってきたものの `Object.keys` は `["platformRef"]`、`context instanceof Injector` は `false` でした。Injector を持っているのは中の `platformRef.injector` です。`BootstrapContext` は `bootstrapApplication` の 3 つ目の引数にそのまま渡すもので（[第 1 回](01-pbd-browser.md)）、渡し忘れると `bootstrapApplication` は NG0401「Missing Platform: This may be due to using \`bootstrapApplication\` on the server without passing a \`BootstrapContext\`.」を投げました。

338 行目「描いたページを文字列にして返す Promise」は合っていました。描いたあと platform は L377 で壊れるので、同じ `renderApplication` を 2 回呼んでも 2 回目は新しい platform です。

## 2. options：document・url・platformProviders と、古いコメント

📄 `angular/packages/platform-server/src/utils.ts` L45–54 （▶ の行: 46–49, 52–53）

```ts
45 │ 
46 ▶ interface PlatformOptions extends Omit<PlatformConfig, 'document'> {
47 ▶   document?: string | Document;
48 ▶   platformProviders?: Provider[];
49 ▶ }
50 │ 
51 │ /**
52 ▶  * Creates an instance of a server platform (with or without JIT compiler support
53 ▶  * depending on the `ngJitMode` global const value), using provided options.
54 │  */
```

331〜336 行目の 4 つの option のうち、`document`・`url`・`platformProviders` は 46〜49 行目の `PlatformOptions` の形で `createServerPlatform`（L55〜74）に渡り、`document` と `url` は `INITIAL_CONFIG` の値に、`platformProviders` はそのあとに並ぶ platform の provider になります（L61〜70）。52〜53 行目のコメント「`ngJitMode` の値によって JIT のコンパイラ付きかどうかを決める」は古い文です。そう分ける枝（`platformDynamicServer` と `platformServer` の使い分け）は 744f7ffb618（2023-04-25）で入り、3 日後の 06452af31fb（2023-04-28、``fix(platform-server): remove dependency on `@angular/platform-browser-dynamic` (#50064)``）で消えました。今の L55〜74 は `ngJitMode` を読みません。公開の API ではない関数のコメントです。

DEMO の「2. options」の表で確かめたこと：

1. **document が文字列、url が道だけ**

   `url: '/a/b?q=1'` は `http://localhost` を前に付けて読まれ（server.ts L106〜108）、ページの中の `document.location.href` は `http://localhost/a/b?q=1`、`PlatformLocation.pathname` は `/a/b` でした。332〜334 行目のとおりです。
2. **document を渡さない**

   NG05104「The selector "pbd-srv-root" did not match any elements.」で描けませんでした。`document` が無いと `<title>fakeTitle</title>` だけの空の文書（domino\_adapter.ts L53〜55）になり、ルートのコンポーネントの要素がありません。説明文は省略できるように書きますが（345 行目の `?`）、`renderApplication` では事実上いります。
3. **document が Document**

   domino で作った `Document` を渡すと、その文書の上に描きました（server.ts L111 がそのまま使う）。描いたあと、渡した `Document` の `body` は空でした。L377 の片付けでアプリが壊れ、ルートの要素ごと外れるからです。同じ `Document` でもう一度呼ぶと、ルートの要素が無いので NG05104 でした。`url` を一緒に渡しても、その文書の `location.href` は文書を作ったときのまま（`PlatformLocation.pathname` だけが `url` から）でした。どれも説明文には書いてありません。
4. **platformProviders**

   platform の注入器に入り、ページのコンポーネントの `inject` で読めました（335 行目のとおり）。`INITIAL_CONFIG` を `platformProviders` に入れると、L69 の並びで後ろになるので、`document` の option より勝ちました（title が「上書き」）。
5. **url がホストを含む**

   `allowedHosts` を渡さないと NG05706「Host https://example.com/a is not allowed.」、`['example.com']` を渡すと描けました。検査の手順は[document と location の初期化の章](../ssrx/02-ssrx-location-allowed-hosts.md)のとおりです。

## 3. renderModule の説明文

📄 `angular/packages/platform-server/src/utils.ts` L271–289 （▶ の行: 272, 274, 279, 284, 288）

```ts
271 │ /**
272 ▶  * Bootstraps an application using provided NgModule and serializes the page content to string.
273 │  *
274 ▶  * @param moduleType A reference to an NgModule that should be used for bootstrap.
275 │  * @param options Additional configuration for the render operation:
276 │  *  - `document` - the document of the page to render, either as an HTML string or
277 │  *                 as a reference to the `document` instance.
278 │  *  - `url` - the URL for the current render request.
279 ▶  *  - `extraProviders` - set of platform level providers for the current render request.
280 │  *  - `allowedHosts` - the allowed hosts list for host validation in server-side rendering.
281 │  * @publicApi
282 │  */
283 │ export async function renderModule<T>(
284 ▶   moduleType: Type<T>,
285 │   options: {
286 │     document?: string | Document;
287 │     url?: string;
288 ▶     extraProviders?: StaticProvider[];
289 │     allowedHosts?: Readonly<string>[];
```

272 行目「NgModule で起動して、ページの中身を文字列にする」、279 行目「`extraProviders` はこのリクエストの platform の provider」は、どちらも合っていました。`BrowserModule` と `ServerModule` を読んだモジュールで、`extraProviders` の値がコンポーネントから読め、`url: '/m'` が `pathname` になりました。`renderApplication` では `platformProviders`、`renderModule` では `extraProviders` と名前が違うだけで、中では同じ `platformProviders` に入れ直しています（L292）。`renderModule` と `renderApplication` の手順の違いは[renderApplication の章](../platform/02-ssr-render-application.md)の 10 節です。

説明文は `ServerModule` を読む必要があるとは書きません。`BrowserModule` だけのモジュールでも描けましたが、TransferState に書いた値の `<script>` は 0 個でした（`ServerModule` を読むと 1 個）。TransferState を書き出す provider は `ServerModule` の `providers`（server.ts L75〜82）にあるからです。5 節の `provideServerRendering` を置かない `renderApplication` も同じでした。

## 4. INITIAL\_CONFIG と PlatformConfig：url が無いときの location

`PlatformConfig` と `INITIAL_CONFIG` の説明文（tokens.ts L11〜34）は[platformServer の章](../platform/03-ssr-platform-server.md)が引いています。約束は「`document` は起動に使う初めの DOM、既定は Domino で新しく作る」（L17〜21）と「`url` で platform の location の `protocol`・`hostname`・`port` を初期化する」（L22〜26）です。DEMO の「4. INITIAL\_CONFIG」は、`renderApplication` を通さずに `platformServer([{provide: INITIAL_CONFIG, useValue: …}])` を作り、platform の注入器の `DOCUMENT` と `PlatformLocation` を読んだ記録です。

📄 `angular/packages/platform-server/src/location.ts` L19–32 （▶ の行: 22–23, 28–32）

```ts
19 │ import {INITIAL_CONFIG} from './tokens';
20 │ import {resolveUrl} from './url';
21 │ 
22 ▶ /**
23 ▶  * Server-side implementation of URL state. Implements `pathname`, `search`, and `hash`
24 │  * but not the state stack.
25 │  */
26 │ @Injectable()
27 │ export class ServerPlatformLocation implements PlatformLocation {
28 ▶   public readonly href: string = '/';
29 ▶   public readonly hostname: string = '/';
30 ▶   public readonly protocol: string = '/';
31 ▶   public readonly port: string = '/';
32 ▶   public readonly pathname: string = '/';
```

絶対の URL（`https://example.com:8443/a/b?q=1#h`）では、`protocol`・`hostname`・`port` に加えて `pathname`・`search`・`hash` も入りました。22〜23 行目「`pathname`・`search`・`hash` は持つが、状態の積み重ね（履歴）は持たない」のとおりで、`back()`・`forward()` は `Not implemented` を投げる（L113〜119）だけです。`url` を渡さないと、`PlatformLocation` の `protocol`・`hostname`・`port`・`pathname` は 28〜32 行目の初期値の `'/'` のまま、文書の `location.href` も `/` でした。`hostname` が `'/'` という値は URL としてはありえない形ですが、説明文はこの場合を書いていません。

`INITIAL_CONFIG` を置かないと、文書は title が `fakeTitle` の空の文書でした。L19 の `@default` のとおりです。また L21 は `document?: string` と書きますが、`Document` を入れてもそのまま使われ（`===` で同じもの）、`url` は `PlatformLocation` にだけ効きました。`renderApplication` の `PlatformOptions`（47 行目）が `string | Document` に広げているのは、この振る舞いに合わせたものです。

## 5. TransferState の書き出し

📄 `angular/packages/platform-server/src/transfer_state.ts` L39–52 （▶ の行: 39, 45–48）

```ts
39 ▶ /** TODO: Move this to a utils folder and convert to use SafeValues. */
40 │ export function createScript(
41 │   doc: Document,
42 │   textContent: string,
43 │   nonce: string | null,
44 │ ): HTMLScriptElement {
45 ▶   const script = doc.createElement('script');
46 ▶   script.textContent = textContent;
47 ▶   if (nonce) {
48 ▶     script.setAttribute('nonce', nonce);
49 │   }
50 │ 
51 │   return script;
52 │ }
```

📄 `angular/packages/platform-server/src/transfer_state.ts` L53–75 （▶ の行: 54, 57–59, 61–63, 67, 70–73）

```ts
53 │ 
54 ▶ function warnIfStateTransferHappened(injector: Injector): void {
55 │   const transferStateStatus = injector.get(TRANSFER_STATE_STATUS);
56 │ 
57 ▶   if (transferStateStatus.serialized) {
58 ▶     console.warn(
59 ▶       `Angular detected an incompatible configuration, which causes duplicate serialization of the server-side application state.\n\n` +
60 │         `This can happen if the server providers have been provided more than once using different mechanisms. For example:\n\n` +
61 ▶         `  imports: [ServerModule], // Registers server providers\n` +
62 ▶         `  providers: [provideServerRendering()] // Also registers server providers\n\n` +
63 ▶         `To fix this, ensure that the \`provideServerRendering()\` function is the only provider used and remove the other(s).`,
64 │     );
65 │   }
66 │ 
67 ▶   transferStateStatus.serialized = true;
68 │ }
69 │ 
70 ▶ function serializeTransferStateFactory() {
71 ▶   const doc = inject(DOCUMENT);
72 ▶   const appId = inject(APP_ID);
73 ▶   const transferStore = inject(TransferState);
74 │   const injector = inject(Injector);
75 │ 
```

TransferState は、サーバーで取った値をブラウザーへ渡す入れ物です（中身の使われ方は[SSR の転送キャッシュの章](../http/11-http-transfer-cache.md)）。書き出す関数の後半（L76〜108）は転送キャッシュの章が読んでいます。ここでは前半を読みます。45〜49 行目の `createScript` は、`textContent` に文字列を入れた `<script>` を作るだけです。39 行目の TODO のとおり、Trusted Types の SafeValue は使っていません。逃がし（エスケープ）は core の `TransferState.toJson()` が `<` と `/` を `\u003C`・`\u002F` にする形でしています。

DEMO の「5. TransferState」で、`{msg: '</script><b>&'}` を書くと、`<script id="ng-state" type="application/json">{"greet":{"msg":"\u003C\u002Fscript>\u003Cb>&"}}</script>` が `body` の最後の子として出ました。`APP_ID` を `'pbd'` にすると id は `pbd-state`、何も書かなければ `<script>` は 0 個でした（L102・L83〜87）。`onSerialize` で登録した関数は、書き出すときに 1 回だけ呼ばれました。

57〜67 行目は「同じリクエストで 2 回書き出したら警告する」しくみです。61〜62 行目の例どおり `importProvidersFrom(ServerModule)` と `provideServerRendering()` の両方を置くと、開発モードは 59 行目の警告を 1 回出しました。警告のあとも止めないので、`ng-state` の `<script>` は 2 個できました（本番も 2 個、警告は無し）。ブラウザーは `getElementById` で 1 つ目だけを読みます。

## 6. BEFORE\_APP\_SERIALIZED：いつ、どの注入器から、どの順で

📄 `angular/packages/platform-server/src/utils.ts` L188–200 （▶ の行: 189, 191, 197–199）

```ts
188 │ /**
189 ▶  * Renders an Angular application to a string.
190 │  *
191 ▶  * @private
192 │  *
193 │  * @param platformRef - Reference to the Angular platform.
194 │  * @param applicationRef - Reference to the Angular application.
195 │  * @returns A promise that resolves to the rendered string.
196 │  */
197 ▶ export async function renderInternal(
198 ▶   platformRef: PlatformRef,
199 ▶   applicationRef: ApplicationRef,
200 │ ): Promise<string> {
```

`BEFORE_APP_SERIALIZED` の説明文（tokens.ts L36〜44）は「`renderApplication` か `renderModule` を呼んだとき、platform の状態を文字列にする直前に実行する関数」です。呼ぶのは 197 行目からの `renderInternal` の L208〜231 で、その手順は[renderApplication の章](../platform/02-ssr-render-application.md)の 4 節と 7 節が読んでいます。191 行目の `@private` のとおり `renderInternal` は公開 API ではありませんが、`ɵrenderInternal` の名前で `@angular/ssr` が直接呼ぶので（private\_export.ts）、`AngularAppEngine` の描画でも同じ関数が呼ばれます。説明文は `renderApplication` と `renderModule` の 2 つしか挙げていません。

DEMO の「6. BEFORE\_APP\_SERIALIZED」で確かめたこと：

1. **順と DOM**

   `multi: true` の 2 つは provider の順に呼ばれ、それぞれが `body` に足した要素は出力に入りました。Promise を返す関数は待ってから文字列にしました（L224〜230）。
2. **失敗**

   同期で投げても、Promise が reject しても、アプリの `ErrorHandler` に 2 つとも届き、HTML は作られました（L217〜221・L226〜228）。`ErrorHandler` に渡すのは 76235803784（2026-04-10、`fix(platform-server): forward BEFORE_APP_SERIALIZED errors to ErrorHandler`）からで、それまでは console に書くだけでした。説明文は失敗の扱いを書いていません。
3. **multi を付け忘れる**

   `provideServerRendering()` と一緒だと、開発モードは「Cannot mix multi providers and regular providers」、本番は「callbacks is not iterable」で `renderApplication` が reject しました。ほかに無いときは両方とも「callbacks is not iterable」です。L208 で読んだ値を L211 の `for … of` で配列として回すからです。
4. **TransferState に書く関数の順**

   自分の関数で TransferState に値を書くと、`providers: [provideServerRendering(), 自分]` の順では `<script>` が出ませんでした。5 節の書き出しも同じトークンの関数で、先に書き出してしまうからです。`[自分, provideServerRendering()]` の順なら値が入りました。
5. **platformProviders に置く**

   L208 は `applicationRef.injector`（アプリの環境の注入器）から読むので、platform に置いた関数は、アプリに同じトークンが無いときだけ親をたどって見つかりました。アプリに `provideServerRendering()` があると、platform の関数は呼ばれませんでした。

## 7. provideServerRendering の説明文：例は NG0401

📄 `angular/packages/platform-server/src/provide_server.ts` L14–37 （▶ の行: 15, 17–18, 22, 24–26, 35–37）

````ts
14 │ /**
15 ▶  * Sets up providers necessary to enable server rendering functionality for the application.
16 │  *
17 ▶  * @param options An object to configure the server providers. Currently supports the following options:
18 ▶  * - `maxResponseBodySize`: The maximum allowed response body size when using the Fetch API.
19 │  *
20 │  * @usageNotes
21 │  *
22 ▶  * Basic example of how you can add server support to your application:
23 │  * ```ts
24 ▶  * bootstrapApplication(AppComponent, {
25 ▶  *   providers: [provideServerRendering()]
26 ▶  * });
27 │  * ```
28 │  *
29 │  * @publicApi
30 │  * @returns A set of providers to setup the server.
31 │  */
32 │ export function provideServerRendering(options?: {
33 │   maxResponseBodySize: number;
34 │ }): EnvironmentProviders {
35 ▶   if (typeof ngServerMode === 'undefined') {
36 ▶     globalThis['ngServerMode'] = true;
37 ▶   }
````

22〜27 行目の例は strict の tsc に通りました（import を足しただけ）。ところが、そのまま Node で動かすと NG0401「Missing Platform」でした。35〜36 行目が `ngServerMode` を `true` にし、`bootstrapApplication` は `ngServerMode` が `true` なのに `BootstrapContext` が無いと投げるからです（create\_application.ts L47〜54、1 節）。サーバーでは 1 節の形で `renderApplication` などが渡す `context` を 3 つ目の引数に渡します。この例は `BootstrapContext` が入る前の形のままです。CLI が作るサーバーの設定は `@angular/ssr` の `provideServerRendering(withRoutes(…))` を使い、2 つの `provideServerRendering` の関係は[platformServer の章](../platform/03-ssr-platform-server.md)の 8 節にあります。

35〜37 行目は説明文に無い振る舞いです。`provideServerRendering()` を呼んだだけで `globalThis.ngServerMode` は `undefined` から `true` になり、描き終えて platform が壊れたあとも `true` のままでした。`platformServer` が自分で立てたときは platform の `onDestroy` で `undefined` に戻します（server.ts L142〜146）。DEMO の「7. provideServerRendering」の最後の行は、`provideServerRendering` を呼ばない新しいプロセスで、描く前も後も `undefined` でした。ただし CLI でビルドしたサーバーの JS では、`ngServerMode` はビルドのときに `true` に置き換わる定数です（@angular/build の application-code-bundle.js が esbuild の `define` に置き、JS の頭にも `globalThis['ngServerMode'] = true` を足す）。#69260（「platformServer の onDestroy が ngServerMode を戻す」、閉）への答えも「ビルドのときの定数で、実行のときの global は主に単体テストのため」でした。global が効くのは、この記録のようにビルドせずに Node で動かすときです。説明文の例が NG0401 になるのは、CLI のサーバーのビルドでも同じです（`ngServerMode` がはじめから `true`）。

17〜18 行目の `maxResponseBodySize` は、`1234` を渡すと `HTTP_FETCH_MAX_RESPONSE_SIZE` が `1234` になりました。`0` を渡すと L40 の真偽の確かめで無視され、既定の 1 MB（`1048576`、common/http の fetch.ts L41〜42）のままです。トークンの説明文は「`null` で上限を外す」と書きますが、この option の型は `number` なので、ここからは外せません。

## 8. DominoAdapter の残り：getGlobalEventTarget と getBaseHref

📄 `angular/packages/platform-server/src/domino_adapter.ts` L70–104 （▶ の行: 71–74, 79–80, 82–83, 85, 88–89, 97–99, 103–104）

```ts
 70 │ 
 71 ▶   /** @deprecated No longer being used in Ivy code. To be removed in version 14. */
 72 ▶   override getGlobalEventTarget(doc: Document, target: string): EventTarget | null {
 73 ▶     if (target === 'window') {
 74 ▶       return doc.defaultView;
 75 │     }
 76 │     if (target === 'document') {
 77 │       return doc;
 78 │     }
 79 ▶     if (target === 'body') {
 80 ▶       return doc.body;
 81 │     }
 82 ▶     return null;
 83 ▶   }
 84 │ 
 85 ▶   override getBaseHref(doc: Document): string {
 86 │     const length = doc.head.children.length;
 87 │ 
 88 ▶     // The `<base>` can only be a direct child of `<head>` so we can save some
 89 ▶     // execution time by looking through them directly instead of querying for it.
 90 │     // See: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/base
 91 │     // Note that we can't cache the `href` value itself, because this method gets called with a
 92 │     // different document every time which means that in theory the value can be different too.
 93 │     for (let i = 0; i < length; i++) {
 94 │       const child = doc.head.children[i];
 95 │ 
 96 │       // Tag names are always uppercase for HTML nodes.
 97 ▶       if (child.tagName === 'BASE') {
 98 ▶         // TODO(alxhub): Need relative path logic from BrowserDomAdapter here?
 99 ▶         return child.getAttribute('href') || '';
100 │       }
101 │     }
102 │ 
103 ▶     return '';
104 ▶   }
```

71 行目は「Ivy のコードではもう使われない。v14 で消す」です。v22 の今も残っていて、しかも使われています。platform-browser の `DefaultDomRenderer2.listen` は、対象が文字列のとき `getDOM().getGlobalEventTarget(this.doc, target)` を呼びます（dom\_renderer.ts L486〜487、[第 3 回](03-pbd-dom.md)のファイル）。サーバーでは `getDOM()` が `DominoAdapter` なので、この 72〜83 行目に来ます。DEMO の「8. DominoAdapter」で、サーバーで描くコンポーネントの中から `Renderer2.listen('window' | 'document' | 'body', …)` を呼ぶと、3 つとも外す関数を返し、`window` と `body` に送ったイベントで呼ばれました。82 行目の `null` になる `'foo'` は NG05102 です。

このコメントは 6581a1b48dc（2021-04-29、`perf(core): minor improvements to listener instructions (#41807)`）で付きました。そのコミットが非推奨にしたのは `EventManagerPlugin.getGlobalEventTarget` で、テンプレートの `(window:resize)` などの listener が文字列で対象を渡さなくなったことを指します。`Renderer2.listen` に文字列を渡す道は残り、DomAdapter の同じ名前のメソッドは今も呼ばれます。新しい本家（origin/main の d201dd76ef2）でも同じ行です。

NG05102 の文は「Unsupported event target null for event pbdping」でした。dom\_renderer.ts L487 で `target` を `getGlobalEventTarget` の戻り値（`null`）で上書きしてから文を作るので、渡した `'foo'` ではなく `null` と言います。ブラウザーでも同じ行を通ります。

85〜104 行目の `getBaseHref` は、88〜89 行目のとおり `<head>` の直下だけを見ます。`<base href="/app/">` は `/app/`、`<body>` の中に置いた `<base>` は `''` でした。`href` が `https://cdn.example.com/app/` のような絶対の URL だと、99 行目は属性の文字をそのまま返しました。ブラウザーの `BrowserDomAdapter.getBaseHref` は `relativePath(href)` で道の部分（`/app/`）だけにします（browser\_adapter.ts L72〜75）。98 行目の TODO はこの違いを指しています。

📄 `angular/packages/platform-server/src/http.ts` L20–35 （▶ の行: 22, 24–27, 29）

```ts
20 │ import {HTTP_OR_HTTPS_NO_AUTHORITY_REGEXP, resolveUrl} from './url';
21 │ 
22 ▶ @Injectable()
23 │ /**
24 ▶  * @deprecated Use the HttpClient fetch backend instead. Intent to remove in Angular 23.
25 ▶  * XHR support in `@angular/platform-server` is deprecated because the underlying `xhr2`
26 ▶  * library does not safely handle redirects (e.g. it can forward `Authorization` headers
27 ▶  * on cross-origin redirects and is susceptible to denial-of-service (DoS) via redirect loops).
28 │  */
29 ▶ export class ServerXhr implements XhrFactory {
30 │   private xhrImpl: typeof import('xhr2') | undefined;
31 │ 
32 │   // The `xhr2` dependency has a side-effect of accessing and modifying a
33 │   // global scope. Loading `xhr2` dynamically allows us to delay the loading
34 │   // and start the process once the global scope is established by the underlying
35 │   // server platform (via shims, etc).
```

同じ持ち場の公開されないクラスの説明文です。24 行目のとおり `ServerXhr`（サーバーで `HttpClient` の XHR の道を動かすための `XhrFactory`）は非推奨で、v23 で消す予定です。`@deprecated` の注釈が 22 行目の `@Injectable()` とクラスの間にあります。使ったときの開発モードの警告（L38〜46）は[XHR のバックエンドの章](../http/07-http-backend-xhr.md)が読んでいます。

> **🧪 DEMO — 本物の platform-server を Node で動かした記録**
>
> ボタンは、pbd-server.demo-srv.ts の関数を、Node（@angular/platform-server・core・platform-browser・compiler 22.2.6、JIT）で関数ごとに起動し直し、開発モードと本番（`ngDevMode = false`）で動かした記録を再生します。ページは platform-server を import しません。「説明と違う」の行は左に印を付けます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-server)

## ここまでの呼び出し（renderApplication で TransferState を書き出すまで）

- 👤 `renderApplication(bootstrap, {document, url, platformProviders})` — utils.ts L342
  - `createServerPlatform(options)` — L359 → L55 — *INITIAL\_CONFIG の後ろに platformProviders（L61〜70）*
  - 👤 `bootstrap({platformRef})` — L362 — *Injector ではない（328〜330 行目と違う）*
    - `bootstrapApplication(Root, {providers: [provideServerRendering()]}, context)` — provide\_server.ts L32 — *ngServerMode = true（L35〜37）*
  - `renderInternal(platformRef, applicationRef)` — utils.ts L197
    - `environmentInjector.get(BEFORE_APP_SERIALIZED, null)` — L208 — *アプリの注入器から。multi でないと回せない*
      - `serializeTransferStateFactory() の関数` — transfer\_state.ts L76 — *provider の順で、後ろの関数の書き込みは入らない*
        - `createScript(doc, transferStore.toJson(), null)` — L93 → L40 — *id は appId + '-state'、body の最後*
    - `platformState.renderToString()` — utils.ts L233
  - `asyncDestroyPlatform(platformRef)` — L377 — *渡した Document からもルートが外れる*

## テストと直し方

| ファイル（packages/platform-server/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `integration_spec.ts` | `platform-server integration`（649）› `render`（753）› `using renderApplication should work`（809）・`should allow passing a document reference`（818〜820） | 1・2 節。818 は `Document` を渡す形だが、描いたあとの文書の中身は確かめない（finally で自分で外す、L837〜839） |
| `integration_spec.ts` | `should call render hook`（1129）・`should call multiple render hooks`（1148）・`should call async render hooks`（1172）・`should call multiple async and sync render hooks`（1191） | 6 節の順・Promise・失敗（`consoleSpy` で ErrorHandler の出力を見る）。multi の付け忘れと TransferState との順は無い |
| `integration_spec.ts` | `should serialize transfer state only once`（950）、`HttpClient`（1434）› `detecting state being transferred twice`（1498）› `shows a warning when server providers has been provided twice`（1499） | 5 節の 2 回の書き出しの警告 |
| `transfer_state_spec.ts` | `transfer_state`（25）› `adds transfer script tag when using renderModule`（29）・`cannot break out of <script> tag in serialized output`（54）・`adds transfer script tag when setting state during onSerialize`（85） | 5 節の script の形と逃がし |
| `platform_location_spec.ts` | `PlatformLocation`（17）› `is configurable via INITIAL_CONFIG`（35）・`parses component pieces of a URL`（52）・`handles empty search and hash portions of the url`（72） | 4 節。`url` を渡さないときの `'/'` を確かめる it は無い |
| `utils_spec.ts` | `allowedHosts validation in renderApplication`（45）・`allowedHosts validation in renderModule`（120） | 2 節の url と allowedHosts |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
$ pnpm bazel test //packages/platform-server/test:event_replay_test --nocache_test_results --test_output=all
（結果は表の下）
```

結果は手元の bazel で、`//packages/platform-server/test:test` が 399 specs・0 failures、`:event_replay_test` が 23 specs・0 failures でした。名前で絞ると、`render hook` 16、`transfer` 13、`PlatformLocation` 12、`document reference` 4、`renderApplication should work` 2、`renderModule should work` 2 で、どれも 0 failures です（zone と zoneless で同じ it を 2 回ずつ走らせる）。説明文の例（utils.ts L316〜326・provide\_server.ts L22〜27）を型検査や実行で確かめるものはありません。`getGlobalEventTarget` を名前で確かめる it も platform-server の test にはありません。

直すとしたら、utils.ts の `renderApplication` の説明文で、324 行目を `appConfig` に、325 行目を `renderApplication(bootstrap, {document})` のように 2 引数にし、328〜330 行目を「`BootstrapContext`（`platformRef` を持つ）で呼ばれ、それを `bootstrapApplication` の 3 つ目の引数に渡す」にします。52〜53 行目のコメントは「`platformServer` を作る」だけにします。provide\_server.ts の例は `(context: BootstrapContext) => bootstrapApplication(AppComponent, {providers: [provideServerRendering()]}, context)` の形にします。domino\_adapter.ts の 71 行目は `@deprecated` を外し、「`Renderer2.listen` に文字列の対象を渡したときに使う」と書きます。NG05102 の文は platform-browser の dom\_renderer.ts の `listen` で、上書きする前の `target` を別の変数に取っておけば直ります。spec は platform-server の integration\_spec.ts に「`Renderer2.listen('window', …)` がサーバーで外す関数を返す」と、platform-browser の dom\_renderer の spec に「NG05102 の文が渡した名前を言う」を足します。

## 聞かれそうな質問

**Q. `renderApplication` の bootstrap 関数には何が渡りますか？**

`{platformRef}` だけの `BootstrapContext` です（L362）。説明文の 328〜330 行目は `Injector` と書きますが、記録では `instanceof Injector` は `false` でした。これをそのまま `bootstrapApplication` の 3 つ目に渡します。渡し忘れると NG0401 です。

**Q. `document` を渡さないとどうなりますか？**

`fakeTitle` だけの空の文書になり、ルートのコンポーネントの要素が無いので NG05104 で描けません。`renderApplication` では index.html の文字列を渡します。`Document` を渡すと、その文書の上で描き、描いたあとルートの要素は外れます。

**Q. 自分の `BEFORE_APP_SERIALIZED` で TransferState に書いたのに、ブラウザーで読めません。**

TransferState の書き出しも同じトークンの関数で、provider の順に呼ばれます（L211）。自分の関数を `provideServerRendering()` より前に並べると入りました。`multi: true` も必要です（無いと「callbacks is not iterable」など）。

**Q. `provideServerRendering()` を置けば、サーバーで `bootstrapApplication(App, config)` と書けますか？**

書けません。`provideServerRendering()` が `ngServerMode` を `true` にするので、`context` の無い `bootstrapApplication` は NG0401 です（説明文の例もこうなる）。`renderApplication` などが渡す `context` を 3 つ目に渡します。

**Q. `DominoAdapter.getGlobalEventTarget` は非推奨なので消してよいですか？**

消せません。`Renderer2.listen('window' | 'document' | 'body', …)` がサーバーでこのメソッドを呼びます（dom\_renderer.ts L487）。71 行目のコメントが、別の `EventManagerPlugin.getGlobalEventTarget` の非推奨と取り違えています。

## 読み終えて

- `renderApplication` の例は TS1109・TS2304・TS2554 で通らず、bootstrap の引数の説明（Injector）は実装（`{platformRef}`）と違う。
- `document` は省略できる型だが、省くとルートの要素が無く NG05104。渡した `Document` は描いたあと中身が外れる。
- TransferState の `<script>` は `BEFORE_APP_SERIALIZED` の 1 つで、provider の順と `ServerModule`／`provideServerRendering` の有無で、出る・出ない・2 個になるが決まる。
- `provideServerRendering` は呼んだだけで `ngServerMode` を `true` にして戻さない。説明文の例は `BootstrapContext` が無く NG0401。
- `getGlobalEventTarget` の「Ivy では使われない」は誤りで、`Renderer2.listen` の文字列の対象が今も使う。

---

← 前: [Meta・Title・enableDebugTools・Safe\* の説明文](04-pbd-meta-tools.md)  
次: [platform-browser-dynamic の説明文：JIT の platform と ResourceLoader](06-pbd-dynamic.md) →
