[目次](../README.md) › [platform の説明文の読み残し](README.md) › 第 1 回 / 全 7 回

# bootstrapApplication と BrowserModule の説明文

> platform-browser/src/browser.ts の未読の説明文：bootstrapApplication の例（selector の無いルートは NG05104）と引数、BootstrapContext（サーバーでは必須で、渡すとブラウザーの platform の provider は足されない）、createApplication（platform は使い回し、あとの platformBrowser() は開発モードだけ NG0400）、provideProtractorTestingSupport の説明に無い option、BrowserModule の古い一文と二重読み込みの例外。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-browser)

---

この章で分かること：`bootstrapApplication` と `createApplication` の説明文（angular.dev の API リファレンスになる JSDoc）が約束していること、3 つ目の引数 `BootstrapContext` が何を差し替えるか、`provideProtractorTestingSupport` が何を置くか、`BrowserModule` の説明が今も合っているかを、本物の `@angular/platform-browser`（22.2.6）を動かして確かめます。結果として、`bootstrapApplication` の最初の例（selector の無いルート）はそのままでは NG05104 で失敗すること、`BrowserModule` の「CLI の new が入れる」が今は違うこと、`bootstrapApplication` や `createApplication` のあとに `platformBrowser()` を呼ぶと開発モードだけ NG0400 になることが、説明文と合いませんでした。

読む対象は `packages/platform-browser/src/browser.ts` の説明文と、`packages/core/src/testability/testability.ts` の 1 つのトークンです（../angular、8576f161ae4）。`bootstrapApplication` の中で動く 3 つの関数は[bootstrapApplication の中身の章](../boot/07-boot-bootstrap-application.md)、`BROWSER_MODULE_PROVIDERS` の 10 個と二重の読み込みを見つける行は[BrowserModule の中身の章](../ngmodule/12-ngmodule-browser-module.md)、platform を作る・壊す決まりは[platform と bootstrap の説明文の章](../cra/02-cra-platform.md)が読んでいるので、ここでは繰り返さずに行だけ指します。

1. **1. bootstrapApplication**（この章）
2. [2. provideClientHydration](02-pbd-hydration.md)
3. [3. レンダラーとイベント](03-pbd-dom.md)
4. [4. Meta・Title・tools](04-pbd-meta-tools.md)
5. [5. platform-server](05-pbd-server.md)
6. [6. platform-browser-dynamic](06-pbd-dynamic.md)
7. [7. spec と issue](07-pbd-tests-issues.md)

platform-browser は「ブラウザーで動かすための部品」の入ったパッケージです。`bootstrapApplication` はページの土台（platform）を用意し、その上にアプリ（環境の注入器と `ApplicationRef`）を 1 つ作って、ルートのコンポーネントを描きます。このシリーズのデモは、ページの上では本物を動かし、開発モードだけで出る例外は Node（domino という DOM の実装の上の JIT）で録った記録で見せます。

## 1. bootstrapApplication の例：selector の無いルートは描けない

📄 `angular/packages/platform-browser/src/browser.ts` L72–101 （▶ の行: 72–73, 75, 77, 80–81, 84, 86, 91–92, 97）

````ts
 72 ▶  * @Component({
 73 ▶  *   template: 'Hello world!'
 74 │  * })
 75 ▶  * class Root {}
 76 │  *
 77 ▶  * const appRef: ApplicationRef = await bootstrapApplication(Root);
 78 │  * ```
 79 │  *
 80 ▶  * You can add the list of providers that should be available in the application injector by
 81 ▶  * specifying the `providers` field in an object passed as the second argument:
 82 │  *
 83 │  * ```ts
 84 ▶  * await bootstrapApplication(Root, {
 85 │  *   providers: [
 86 ▶  *     {provide: BACKEND_URL, useValue: 'https://yourdomain.com/api'}
 87 │  *   ]
 88 │  * });
 89 │  * ```
 90 │  *
 91 ▶  * The `importProvidersFrom` helper method can be used to collect all providers from any
 92 ▶  * existing NgModule (and transitively from all NgModules that it imports):
 93 │  *
 94 │  * ```ts
 95 │  * await bootstrapApplication(Root, {
 96 │  *   providers: [
 97 ▶  *     importProvidersFrom(SomeNgModule)
 98 │  *   ]
 99 │  * });
100 │  * ```
101 │  *
````

72〜75 行目の例のコンポーネントには `selector` がありません。selector の無いコンポーネントの selector は `ng-component` になり、`bootstrapApplication` はルートの要素を `document.querySelector` で探すので（dom\_renderer.ts L378〜386、[DomRendererFactory2 の章](../domr/03-domr-renderer-factory.md)）、文書に `<ng-component>` が無ければ 77 行目は NG05104「The selector "ng-component" did not match any elements」で reject されました（DEMO の「例と JIT」の表）。文書に `<ng-component>` を置けば「Hello world!」が描かれます。例を strict の ngc（strictTemplates）にかけると、エラーは出ません。型は合っていて、動かすと失敗する例です。

この例は 5771b18a989（2022-04-20、feat(core): add the `bootstrapApplication` function (#45674)）から selector が無く、85122cb12d3（2026-01-23、docs: update `bootstrapApplication` docs）で `standalone: true` を消して名前を `Root` にしたときも selector は足されませんでした。新しい本家（origin/main の d201dd76ef2、2026-11-19。以下「新しい本家」）でも同じです。

80〜81 行目「第 2 引数の `providers` がアプリの注入器で使える」は、DEMO の「bootstrapApplication の第 2 引数」の表のとおりで、ルートのコンポーネントの `inject` に第 2 引数の値が届きました。`providers` は `BROWSER_MODULE_PROVIDERS` の後ろに並ぶので（L169）、同じトークンを書けば後ろの利用者の方が勝ちます。91〜92 行目の `importProvidersFrom` の例（97 行目）と 84〜88 行目の例は、`Root`・`BACKEND_URL`・`SomeNgModule` の宣言を足すと strict の ngc に通りました。

同じ表のとおり、`bootstrapApplication` が返す Promise は呼んだ直後にはまだ解決せず、要素の中身は元のままでした。解決した時点で中身は描かれていて、`ng-version` 属性が付いています（解決の順は[bootstrapApplication の中身の章の 4 節](../boot/07-boot-bootstrap-application.md)）。`app.destroy()` のあとは、ルートの要素が文書から外れました。`ComponentRef.destroy` が描いた要素ごと外すためで（[ビューの破棄の章](../ivy/17-ivy-destroy.md)）、説明文はこれを書いていません。

📄 `angular/packages/platform-browser/src/browser.ts` L102–122 （▶ の行: 102–104, 110, 113–114, 116–119）

````ts
102 ▶  * Note: the `bootstrapApplication` method doesn't include [Testability](api/core/Testability) by
103 ▶  * default. You can add [Testability](api/core/Testability) by getting the list of necessary
104 ▶  * providers using `provideProtractorTestingSupport()` function and adding them into the `providers`
105 │  * array, for example:
106 │  *
107 │  * ```ts
108 │  * import {provideProtractorTestingSupport} from '@angular/platform-browser';
109 │  *
110 ▶  * await bootstrapApplication(Root, {providers: [provideProtractorTestingSupport()]});
111 │  * ```
112 │  *
113 ▶  * @param rootComponent A reference to a standalone component that should be rendered.
114 ▶  * @param options Extra configuration for the bootstrap operation, see `ApplicationConfig` for
115 │  *     additional info.
116 ▶  * @param context Optional context object that can be used to provide a pre-existing
117 ▶  *     platform injector. This is useful for advanced use-cases, for example, server-side
118 ▶  *     rendering, where the platform is created for each request.
119 ▶  * @returns A promise that returns an `ApplicationRef` instance once resolved.
120 │  *
121 │  * @publicApi
122 │  */
````

113 行目「standalone のコンポーネントへの参照」は、開発モードでだけ確かめます。`standalone: false` のコンポーネントを渡すと、開発モードの記録は NG0907「… is not marked as standalone …」、本番の記録はそのまま描きました。確かめるのは `internalCreateApplication` の `if (ngDevMode …) assertStandaloneComponentType(rootComponent)`（create\_application.ts L60〜62、[standalone でないコンポーネントを渡したときの章](../standalone/09-standalone-entry-checks.md)）です。

102〜104 行目の Testability の注意は 4 節、116〜118 行目の `context` は 2 節で確かめます。119 行目のとおり、戻り値は `ApplicationRef` を返す Promise です。

## 2. BootstrapContext：platform を外から渡す

📄 `angular/packages/platform-browser/src/browser.ts` L50–62 （▶ の行: 51–52, 56, 60）

```ts
50 │ /**
51 ▶  * A context object that can be passed to `bootstrapApplication` to provide a pre-existing platform
52 ▶  * injector.
53 │  *
54 │  * @publicApi
55 │  */
56 ▶ export interface BootstrapContext {
57 │   /**
58 │    * A reference to a platform.
59 │    */
60 ▶   platformRef: PlatformRef;
61 │ }
62 │ 
```

51〜52 行目は「前からある platform の注入器を渡すための入れ物」と書き、60 行目の中身は `PlatformRef` 1 つです。渡したものは `createProvidersConfig` の `platformRef: context?.platformRef`（L168）を通り、core の `internalCreateApplication` が `platformRef?.injector ?? createOrReusePlatformInjector(platformProviders)`（create\_application.ts L57〜58）で使います。DEMO の「BootstrapContext（ブラウザーの Node）」の表では、`platformBrowser()` で作った platform を渡すと、アプリの `PlatformRef` は渡したものでした。アプリを壊しても platform は残ります。

説明文に無いことが 2 つあります。

1. **サーバーの上では必須**

   116〜118 行目は「省略できる。サーバーで描くときのように、リクエストごとに platform を作る上級の使い方に役立つ」と書きます。実際は `ngServerMode` が true だと、`context` を渡さない `bootstrapApplication` は NG0401「Missing Platform: This may be due to using `bootstrapApplication` on the server without passing a `BootstrapContext`.」で reject されました（create\_application.ts L47〜54）。これは 28926ba92cf（2025-09-08、feat(core): introduce `BootstrapContext` for improved server bootstrapping (#63562)、v21）からで、サーバーの上では「省略できる」ではありません。サーバーの上の `getPlatform()` が null になる理由は[platform と bootstrap の説明文の章の 4 節](../cra/02-cra-platform.md)です。
2. **渡すとブラウザーの platform の provider は足されない**

   L58 の `??` のとおり、`platformRef` があれば `INTERNAL_BROWSER_PLATFORM_PROVIDERS`（L224〜228 の `PLATFORM_ID`・`PLATFORM_INITIALIZER`・`DOCUMENT`）は使われません。`platformCore()` の platform を渡すと、NG0201「No provider found for `InjectionToken DocumentToken`. … Path: RendererFactory2 -&gt; DomRendererFactory2 -&gt; EventManager -&gt; InjectionToken EventManagerPlugins -&gt; InjectionToken DocumentToken」でした。渡す platform は `platformBrowser()` か `platformServer()` のように、自分で `DOCUMENT` を持つものでなければいけません。

## 3. createApplication：コンポーネントを作らずにアプリだけ

📄 `angular/packages/platform-browser/src/browser.ts` L139–158 （▶ の行: 140–144, 146, 148, 155, 158）

```ts
139 │ 
140 ▶ /**
141 ▶  * Create an instance of an Angular application without bootstrapping any components. This is useful
142 ▶  * for the situation where one wants to decouple application environment creation (a platform and
143 ▶  * associated injectors) from rendering components on a screen. Components can be subsequently
144 ▶  * bootstrapped on the returned `ApplicationRef`.
145 │  *
146 ▶  * @param options Extra configuration for the application environment, see `ApplicationConfig` for
147 │  *     additional info.
148 ▶  * @param context Optional context object that can be used to provide a pre-existing
149 │  *     platform injector. This is useful for advanced use-cases, for example, server-side
150 │  *     rendering, where the platform is created for each request.
151 │  * @returns A promise that returns an `ApplicationRef` instance once resolved.
152 │  *
153 │  * @publicApi
154 │  */
155 ▶ export async function createApplication(
156 │   options?: ApplicationConfig,
157 │   context?: BootstrapContext,
158 ▶ ): Promise<ApplicationRef> {
```

140〜144 行目「アプリの環境（platform と注入器）を作ることと、画面に描くことを分ける。コンポーネントはあとで `ApplicationRef` に bootstrap できる」は、DEMO の「createApplication で作って壊す」の表のとおりでした。作った直後は `components`・`componentTypes` とも 0 で、`app.bootstrap(PbdbLate, document.createElement('div'))` で初めて描かれ、146 行目の options の値もコンポーネントに届きました。`bootstrap` の中身は[ApplicationRef.bootstrap の章](../boot/10-boot-application-ref.md)、`componentTypes` と `components` の違いは[ApplicationRef の説明文の章の 1 節](../cra/01-cra-app-ref.md)です。

141〜143 行目は「platform を作る」と書きますが、ページにもう platform があれば作らずに使い回します（`createOrReusePlatformInjector` の 1 行目、platform.ts L172〜175）。表の 3 行目で、`providedIn: 'platform'` のトークンをこのページのアプリと作ったアプリから読むと同じものが返りました。一方、`ErrorHandler` も `RendererFactory2` もアプリごとに別のものでした。L169 がアプリごとに `BROWSER_MODULE_PROVIDERS` を並べ直すからです。壊すと作ったアプリの `destroyed` が true になり、このページのアプリの `destroyed` と `viewCount` は変わりませんでした。

155〜158 行目の引数は `bootstrapApplication` と同じで、`context` は ec9dc94ceeb（2025-11-06、feat(platform-browser): add `context` to `createApplication`）で足されました。

📄 `angular/packages/platform-browser/src/browser.ts` L173–184 （▶ の行: 174, 177, 179, 181）

```ts
173 │ 
174 ▶ /** Attempt to resolve component resources before bootstrapping in JIT mode. */
175 │ async function resolveJitResources(): Promise<void> {
176 │   try {
177 ▶     return await resolveComponentResources(fetch);
178 │   } catch (error) {
179 ▶     // Log, but don't block bootstrapping on error.
180 │     // tslint:disable-next-line:no-console
181 ▶     console.error(error);
182 │   }
183 │ }
184 │ 
```

JIT（ブラウザーでテンプレートをコンパイルする形）のときだけ、2 つの関数は `templateUrl` を先に `fetch` で読みます（L133〜135・L159〜161。AOT のビルドでは `ngJitMode` が false で通りません）。createApplication でも読むようになったのは ab67988d2e5（2025-11-07、feat(platform-browser): resolve JIT resources in `createApplication`）からです。179 行目「記録して、bootstrap は止めない」のとおり、取れない `templateUrl` は 181 行目の `console.error`（記録では「Failed to parse URL from ./pbdr-missing.html」）を出して先へ進みました。ただし先へ進んだあと、ルートを作る所で「Component 'PbdrJit' is not resolved: - templateUrl: ./pbdr-missing.html」で reject されます。止めないのは読み込みだけで、アプリは描けません。

説明文に無い振る舞いがもう 1 つあります。`createApplication` か `bootstrapApplication` で platform ができたあとに `platformBrowser()` を呼ぶと、開発モードは NG0400「A platform with a different configuration has been created. Please destroy it first.」、本番は今の platform を返しました（DEMO の「BootstrapContext（ブラウザーの Node）」の表の 3 行目）。`createOrReusePlatformInjector`（platform.ts L167〜194）は `PlatformRef` を参照しないための関数で、`platformBrowser` の factory が置く印のトークン（L236〜237 の `createPlatformFactory(platformCore, 'browser', …)` が作るもの）を platform に入れないので、factory の `assertPlatform(marker)` が「違う設定の platform」と判断します（[platform と bootstrap の説明文の章の 3・4 節](../cra/02-cra-platform.md)）。逆の順（先に `platformBrowser()`、あとで `bootstrapApplication`）は、spec の should reuse existing platform（bootstrap\_spec.ts L277）のとおり使い回されます。新しい本家でも同じです。

## 4. provideProtractorTestingSupport：既定では入らない Testability

📄 `angular/packages/platform-browser/src/browser.ts` L185–202 （▶ の行: 186–188, 191–192, 197, 199–202）

```ts
185 │ /**
186 ▶  * Returns a set of providers required to setup [Testability](api/core/Testability) for an
187 ▶  * application bootstrapped using the `bootstrapApplication` function. The set of providers is
188 ▶  * needed to support testing an application with Protractor (which relies on the Testability APIs
189 │  * to be present).
190 │  *
191 ▶  * @returns An array of providers required to setup Testability for an application and make it
192 ▶  *     available for testing using Protractor.
193 │  *
194 │  * @publicApi
195 │  */
196 │ export function provideProtractorTestingSupport(
197 ▶   options: {usePendingTasksForStability?: boolean} = {},
198 │ ): Provider[] {
199 ▶   // Return a copy to prevent changes to the original array in case any in-place
200 ▶   // alterations are performed to the `provideProtractorTestingSupport` call results in app
201 ▶   // code.
202 ▶   return [
```

Testability は、Protractor のような外の道具に「アプリが落ち着いたか」を知らせるサービスです（中身は[NgZone・ErrorHandler の説明文の章の 9 節](../cra/07-cra-zone-errors.md)）。102〜103 行目のとおり、`bootstrapApplication` と `createApplication` は既定で入れません。DEMO の「Testability を作る」の表で、何も足さないアプリの `injector.get(Testability, null)` は null でした。

191〜192 行目の「provider の配列」は、DEMO の 3 つ目の表（記録）で 4 つでした。`TESTABILITY_GETTER` → `BrowserGetTestability`、`TESTABILITY` → `Testability`、`Testability` → `Testability`（L249〜264 の `TESTABILITY_PROVIDERS`、[BrowserModule の中身の章の 2 節](../ngmodule/12-ngmodule-browser-module.md)）と、4 つ目は空の配列です。199〜201 行目のコメントのとおり外側の配列は呼ぶたびに新しく、中の provider のオブジェクトは同じものでした。

197 行目の `usePendingTasksForStability` は、説明文に 1 語もありません。渡すと 4 つ目が `{provide: ɵUSE_PENDING_TASKS, useValue}` になります（L204〜205）。

📄 `angular/packages/core/src/testability/testability.ts` L63–72 （▶ の行: 66, 68–70）

```ts
63 │ export const TESTABILITY_GETTER = new InjectionToken<GetTestability>('');
64 │ 
65 │ /**
66 ▶  * Internal injection token to signal whether to use pending tasks for stability.
67 │  */
68 ▶ export const USE_PENDING_TASKS = new InjectionToken<boolean>('USE_PENDING_TASKS', {
69 ▶   providedIn: 'root',
70 ▶   factory: () => typeof Zone === 'undefined',
71 │ });
72 │ 
```

70 行目のとおり、渡さなければ「zone.js が無ければ保留のタスク（`PendingTasks`）で安定を決める」です。記録では zoneless のアプリで `PendingTasks.add()` したあと、渡さない・`true` では `isStable()` が false、`false` を渡すと保留があっても true でした。zoneless で `false` を渡すと、`NoopNgZone` は何も数えないので（testability.ts L172〜178）、いつも「安定」になります。この option は 9f479ae9641（2026-04-13、feat(core): Update Testability to use PendingTasks for stability indicator）で足され、説明文は足されませんでした。

Testability を作ると、最初の 1 つが `window.getAngularTestability` と `getAllAngularTestabilities` を置きます（testability.ts L117〜120、platform-browser の testability.ts L21〜56）。記録では `bootstrap` のあとに置かれ、ルートの要素が登録簿（`TestabilityRegistry`、platform に 1 つ）に 1 つ入り、アプリを壊すと登録簿は 0 に戻りました。`window` の関数は残ります。`window` に関数が残るので、Testability を作る表は Node の記録だけです。

## 5. BrowserModule の説明文：「CLI の new が入れる」は古い

📄 `angular/packages/platform-browser/src/browser.ts` L285–294 （▶ の行: 287–291）

```ts
285 │ 
286 │ /**
287 ▶  * Exports required infrastructure for all Angular apps.
288 ▶  * Included by default in all Angular apps created with the CLI
289 ▶  * `new` command.
290 ▶  * Re-exports `CommonModule` and `ApplicationModule`, making their
291 ▶  * exports and providers available to all apps.
292 │  *
293 │  * @publicApi
294 │  */
```

288〜289 行目「CLI の `new` で作ったすべてのアプリに既定で入る」は、今は違います。angular-cli の application の schematic は `standalone` の既定が true で（schema.json の `"standalone": { …, "default": true }`、ac0db66975 2023-09-21 feat(@schematics/angular): enable standalone by default in new applications から）、`BrowserModule` を書くのは `--standalone=false` のときの `module-files` のテンプレートだけです。この 2 行は 3f55aa609f6（2016-06-30）のときのままで、新しい本家でも同じです。

290〜291 行目「`CommonModule` と `ApplicationModule` を re-export し、その exports と providers を使えるようにする」の、2 つのモジュールが持つ providers は空です（`ApplicationModule` は `ApplicationRef` を早く作るだけ、[BrowserModule の中身の章の 5・6 節](../ngmodule/12-ngmodule-browser-module.md)）。古い書き方ですが、re-export は今も効きます。

2 回読んだときの例外（L300〜315）は、説明文に書いていません。DEMO の「BrowserModule を 2 回読む」の表で、開発モードは次の 3 つの形がどれも NG05100「Providers from the `BrowserModule` have already been loaded. If you need access to common directives such as NgIf and NgFor, import the `CommonModule` instead.」でした。

1. **子の環境の注入器**

   `createEnvironmentInjector([importProvidersFrom(BrowserModule)], app.injector)`。route の `providers` に書いたときと同じ形です。
2. **遅延の NgModule**

   `createNgModule(LazyModule, app.injector)`（[遅延モジュールの章](../ngmodule/15-ngmodule-lazy-module.md)）。
3. **standalone のコンポーネントの imports**

   `@Component({imports: [BrowserModule]})` を `createComponent`。NgModule を import した standalone のコンポーネントは子の環境の注入器を持つので（[standalone が NgModule を import したときの章](../ngmodule/13-ngmodule-standalone-imports.md)）、同じ例外になります。

同じ注入器に `importProvidersFrom(BrowserModule)` を置く形（`bootstrapApplication` の `providers`）は例外になりません。印を `skipSelf` で親から探すので（L302〜305）、親の platform には印が無いからです。本番はどの形も例外なしで、印（L281〜283）も本番では置かれません。文の「NgIf and NgFor」は v17 からの `@if`・`@for` の前の書き方ですが、`CommonModule` を import すれば今もそのまま使えるので、古いだけです。

> **🧪 DEMO — 説明文の約束を本物の platform-browser で試す**
>
> 1 つ目のボタンは、このページで本物を動かします。押すたびに `createApplication` で小さなアプリを 1 つ作り（このページの platform の上、zoneless）、コンポーネントを文書に付けない要素の上に bootstrap して確かめたら destroy します。このページのアプリには何も付けません。  
>  ほかのボタンと「開発モード（記録）」の列は、同じ関数（pbd-browser.demo-bs.ts と、記録だけに使う pbd-browser.demo-rec.ts）を Node（domino の上の JIT）で関数ごとに起動し直して動かした記録です。開発モードの例外や console の行、platform を新しく作る手順は、ページでは出せないか、ページの状態を変えるためです。  
>  2・3 つ目もはじめはページで動かしていましたが、本番ビルドの最初に読む JS（Initial total）が、`provideProtractorTestingSupport` を呼ぶと 486.46 kB から 491.72 kB に（Testability のクラスが最初の chunk に入る）、`bootstrapApplication` を章から呼ぶと 486.47 kB に（main の export が 1 つ増える）なったので、記録にしました。この章の今の形では 486.46 kB のままです。「説明と違う」の行は左に印を付けます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-browser)

## ここまでの呼び出し（createApplication のあとで platformBrowser() を呼んだとき）

- 👤 `await createApplication({providers})`
  - `createProvidersConfig(options, context)` — browser.ts L166〜172 — *platformRef は undefined*
  - `internalCreateApplication(config)` — create\_application.ts L38
    - `createOrReusePlatformInjector(INTERNAL_BROWSER_PLATFORM_PROVIDERS)` — platform.ts L172 — *印のトークンを置かない*
- 👤 `platformBrowser()`
  - `getPlatform() があるので assertPlatform(marker)` — platform.ts L80〜93
    - `開発モード：印が無い → NG0400` — platform.ts L123〜131 — *本番は今の platform を返す*

## テストと直し方

| ファイル（packages/platform-browser/test/browser/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `bootstrap_standalone_spec.ts` | `bootstrapApplication for standalone components`（27）の 7 つの it | 1 節の providers。どれも selector のあるルートで、文書に要素を置いてから呼ぶ |
| `bootstrap_standalone_spec.ts` | `createApplication`（272）› ``creates an `ApplicationRef` which can bootstrap a component``（276）・`… a JIT component with an external resource`（294） | 3 節。294 は Node では `expect().nothing()` で終わる |
| `bootstrap_spec.ts` | `bootstrap factory method`（182）› `bootstrapApplication`（221）› `should reuse existing platform`（277）・`should throw when trying to bootstrap a non-standalone component`（368）、`should throw a descriptive error if BrowserModule is installed again via a lazily loaded module`（666） | 3・1・5 節。ブラウザーの suite だけで動く（Node では L188〜192 の 1 つの it だけ）。277 は platform が先の順だけ |
| `bootstrap_spec.ts` | `providePlatformInitializer`（928）› `should bootstrap with platform initializers`（956） | 2 節。`{platformRef}` を渡す形はここだけ |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/platform-browser/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
（結果は表の下）
```

結果は手元の bazel で、`//packages/platform-browser/test:test`（Node）の絞り込みが `bootstrapApplication for standalone components` で 7 specs、`createApplication` で 2 specs、`providePlatformInitializer` で 3 specs、`bootstrap factory method` で 1 spec（Node では中身を飛ばす it）、どれも 0 failures でした。ブラウザーの suite（`//packages/platform-browser/test:test_web_chromium`、絞り込みは効かない）は全体で 253 passed・0 failed・5 skipped です（2026-11-22）。`provideProtractorTestingSupport` の `usePendingTasksForStability` を渡す it は、platform-browser にも core にもありません（core の testability\_spec.ts は `USE_PENDING_TASKS` を直接 provide する、L137）。

直すとしたら、説明文は browser.ts の 72〜75 行目の例に `selector: 'app-root'` を足し（index.html に `<app-root>` があることを 1 文添える）、116〜118 行目と 148〜150 行目に「サーバーの上（`ngServerMode`）では必須」、191 行目の前に `@param options.usePendingTasksForStability` を足し、288〜289 行目は「NgModule で起動するアプリが import する」に直します。NG0400 は、`createOrReusePlatformInjector`（packages/core/src/platform/platform.ts）が platform を作るとき、`platformBrowser` の factory と同じ印を置ければ消えますが、印のトークンは `createPlatformFactory` の中で作られて外から見えません。spec は bootstrap\_spec.ts の 277 行目の隣に「`bootstrapApplication` のあとの `platformBrowser()` は同じ `PlatformRef` を返す」を足すと、今の実装で落ちる形になります。

## 聞かれそうな質問

**Q. 説明文の最初の例をそのまま main.ts に書いたら、動きますか？**

index.html に `<ng-component>` が無ければ動きません。72〜75 行目のコンポーネントには selector が無く、77 行目は NG05104 で reject されます（DEMO の 6 つ目の表）。型のエラーは出ないので、ビルドは通ります。

**Q. `bootstrapApplication` の 3 つ目の引数は、いつ要りますか？**

サーバーの上で描くときは必須です。`ngServerMode` が true で渡さないと NG0401 です（create\_application.ts L47〜54）。ブラウザーでは、先に作った platform（たとえば `platformBrowser([...])`）の上にアプリを作りたいときに使えます。渡すと L224〜228 のブラウザーの platform の provider は足されません。

**Q. `createApplication` を呼ぶと、ページの platform は新しくなりますか？**

なりません。platform があれば使い回し（platform.ts L172〜175）、新しいのはアプリ（環境の注入器と `ErrorHandler`・`RendererFactory2` などの部品）だけです（DEMO の 1 つ目の表の 3・4 行目）。

**Q. `bootstrapApplication` のアプリで Protractor の `whenStable` を使うには？**

`providers` に `provideProtractorTestingSupport()` を足します。既定では Testability が入りません（102〜103 行目）。zoneless のアプリでは渡さなくても保留のタスクで安定を決めます（testability.ts の 70 行目）。`usePendingTasksForStability: false` を渡すと、zoneless では保留があってもいつも安定になります。

**Q. standalone のコンポーネントの `imports` に `BrowserModule` を書いてもよいですか？**

開発モードでは NG05100 になります。standalone の注入器が子になり、印を `skipSelf` で親から探すと見つかるからです（L302〜312）。テンプレートの部品だけが欲しいなら `CommonModule` か、個々のディレクティブを import します。

## 読み終えて

- `bootstrapApplication` の最初の例は selector が無く、文書に `<ng-component>` が無ければ NG05104 で失敗する。型は通る。
- `BootstrapContext` の `platformRef` は、サーバーの上では必須（NG0401）。渡すとブラウザーの platform の provider は足されない。
- `createApplication` は platform を使い回し、アプリの部品はアプリごとに作る。そのあとの `platformBrowser()` は開発モードだけ NG0400。
- `provideProtractorTestingSupport` は 3 つの provider と、説明文に無い `usePendingTasksForStability` を置く。
- `BrowserModule` の「CLI の new が入れる」は standalone が既定になる前の文。2 回目の NG05100 は子の注入器でだけ、開発モードだけ。

---

← 前: [spec と issue を読む：core の説明文（2）を固めているもの](../cra/10-cra-tests-issues.md)  
次: [provideClientHydration と with\* の説明文](02-pbd-hydration.md) →
