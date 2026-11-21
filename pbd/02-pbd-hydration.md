[目次](../README.md) › [platform の説明文の読み残し](README.md) › 第 2 回 / 全 7 回

# provideClientHydration と with\* の説明文

> platform-browser/src/hydration.ts の未読の説明文：既定の機能の一覧（202 行目の書式の抜けと、既定で入るイベントの再生）、withI18nSupport・withEventReplay の約束を platform-server で描いた HTML と並べ、64 通りの with\* の組み合わせの provider と、開発モードだけの矛盾の例外（本番は片方が黙って勝つ）を確かめる。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-hydration)

---

この章で分かること：`provideClientHydration` と 6 つの `with*` の説明文（angular.dev の API リファレンスになる JSDoc）が約束していることを、返ってくる provider の木と、本物の `@angular/platform-server`（22.2.6）で描いた HTML で確かめます。結果として、v22 では `withEventReplay()` を書かなくてもイベントの再生が入っていて、「イベントの再生を有効にする」と説明する 2 か所（L111〜113・L209）と既定の機能の一覧（L195〜202）が実装と合わないこと、一覧の 202 行目は箇条書きの印が抜けて前の項目に続いていること、矛盾する組み合わせの例外は開発モードだけで、本番では片方が黙って勝つことが分かりました。

読む対象は `packages/platform-browser/src/hydration.ts` の説明文です（../angular、8576f161ae4）。動く行は既存の章が読んでいます。feature の形と既定で入る 3 組は[provideClientHydration の章](../platform/07-hydration-provide.md)、転送キャッシュは[SSR の転送キャッシュの章](../http/11-http-transfer-cache.md)、初期ナビゲーションの検出（L168〜190）は[初期ナビゲーションの章](../router/06-router-initial-navigation.md)、インクリメンタルの中身は[インクリメンタルハイドレーションの章](../platform/15-incremental-hydration.md)、イベントの再生は[イベントの記録と再生の章](../platform/14-event-replay.md)にあるので、ここでは繰り返さずに行だけ指します。

1. [1. bootstrapApplication](01-pbd-browser.md)
2. **2. provideClientHydration**（この章）
3. [3. レンダラーとイベント](03-pbd-dom.md)
4. [4. Meta・Title・tools](04-pbd-meta-tools.md)
5. [5. platform-server](05-pbd-server.md)
6. [6. platform-browser-dynamic](06-pbd-dynamic.md)
7. [7. spec と issue](07-pbd-tests-issues.md)

ハイドレーションは、サーバーが描いた DOM を捨てずに、ブラウザーの Angular がそれを引き取ることです。`provideClientHydration()` はそのための provider を並べた `EnvironmentProviders`（注入器に入れる provider の束）を返します。このサイトもサーバーで先に描いた HTML を配り、`provideClientHydration(withIncrementalHydration())` でハイドレートしています（app.config.ts）。

## 1. provideClientHydration の説明文：既定の機能の一覧

📄 `angular/packages/platform-browser/src/hydration.ts` L191–211 （▶ の行: 195–196, 198–202, 204, 206–210）

```ts
191 │ 
192 │ /**
193 │  * Sets up providers necessary to enable hydration functionality for the application.
194 │  *
195 ▶  * By default, the function enables the recommended set of features for the optimal
196 ▶  * performance for most of the applications. It includes the following features:
197 │  *
198 ▶  * * Reconciling DOM hydration. Learn more about it [here](guide/hydration).
199 ▶  * * [`HttpClient`](api/common/http/HttpClient) response caching while running on the server and
200 ▶  * transferring this cache to the client to avoid extra HTTP requests. Learn more about data caching
201 ▶  * [here](guide/ssr#caching-data-when-using-httpclient).
202 ▶  * Incremental hydration. [Learn more](guide/incremental-hydration).
203 │  *
204 ▶  * These functions allow you to disable some of the default features or enable new ones:
205 │  *
206 ▶  * * {@link withNoHttpTransferCache} to disable HTTP transfer cache
207 ▶  * * {@link withHttpTransferCacheOptions} to configure some HTTP transfer cache options
208 ▶  * * {@link withI18nSupport} to enable hydration support for i18n blocks
209 ▶  * * {@link withEventReplay} to enable support for replaying user events
210 ▶  * * {@link withNoIncrementalHydration} to disable incremental hydration
211 │  *
```

195〜196 行目は「既定で、多くのアプリに勧める機能の組を入れる」と書き、198〜202 行目に 3 つ挙げます。DEMO の「provider の表」で `provideClientHydration()` を呼ぶと、3 つは配列の 2・3・4 番目（L285・L286〜288・L289〜291）にそのとおりありました。

ところが 4 番目の既定のインクリメンタル（core の `ɵwithIncrementalHydration()`）は、中で `withEventReplay()` を呼んでいて（core の hydration/api.ts L337「インクリメンタルを有効にすると、アプリ全体のイベントの再生も有効になる」、[インクリメンタルハイドレーションの章](../platform/15-incremental-hydration.md)）、表の 4 番目にも `IS_EVENT_REPLAY_ENABLED` と再生の `ENVIRONMENT_INITIALIZER`・`APP_BOOTSTRAP_LISTENER` が並びました。つまり v22 では、イベントの再生も既定で入っています。198〜202 行目の一覧はそれを書かず、209 行目は `withEventReplay` を「イベントの再生を有効にする」機能として、既定を外す・新しく足す方の一覧に置いています。

202 行目は先頭に `*` がありません。Markdown では前の項目（199〜201 行目の `HttpClient` の段落）の続きになり、3 つ目の項目として表に出ません。この行は 0454d4ced7e（2026-04-09、refactor(core): deprecate `withIncrementalHydration`、v22.0.0）で足され、新しい本家（origin/main の d201dd76ef2、2026-11-19。以下「新しい本家」）でも同じです。

## 2. withI18nSupport と withEventReplay の説明文

📄 `angular/packages/platform-browser/src/hydration.ts` L100–126 （▶ の行: 102, 104, 107, 111–113, 120–121）

````ts
100 │ 
101 │ /**
102 ▶  * Enables support for hydrating i18n blocks.
103 │  *
104 ▶  * @publicApi 20.0
105 │  */
106 │ export function withI18nSupport(): HydrationFeature<HydrationFeatureKind.I18nSupport> {
107 ▶   return hydrationFeature(HydrationFeatureKind.I18nSupport, ɵwithI18nSupport());
108 │ }
109 │ 
110 │ /**
111 ▶  * Enables support for replaying user events (e.g. `click`s) that happened on a page
112 ▶  * before hydration logic has completed. Once an application is hydrated, all captured
113 ▶  * events are replayed and relevant event listeners are executed.
114 │  *
115 │  * @usageNotes
116 │  *
117 │  * Basic example of how you can enable event replay in your application when
118 │  * `bootstrapApplication` function is used:
119 │  * ```ts
120 ▶  * bootstrapApplication(App, {
121 ▶  *   providers: [provideClientHydration(withEventReplay())]
122 │  * });
123 │  * ```
124 │  * @publicApi
125 │  * @see {@link provideClientHydration}
126 │  */
````

102 行目「i18n のブロックのハイドレーションを有効にする」のとおり、107 行目は core の `ɵwithI18nSupport()` をそのまま足します。表で `withI18nSupport()` を選ぶと、5 番目（L292）に `IS_I18N_HYDRATION_ENABLED` と `ENVIRONMENT_INITIALIZER` の 2 つが入りました（中身は[i18n のハイドレーションの章](../platform/13-hydration-i18n.md)）。104 行目の `@publicApi 20.0` は、公開 API として安定した版です。

111〜113 行目「ハイドレーションが終わる前のユーザーのイベント（クリックなど）を再生できるようにする。ハイドレートし終えたら、捕まえたイベントを全部再生する」を、platform-server で描いた HTML と並べます（DEMO の「platform-server の HTML」の表）。描いたのは、外にボタン a、`@defer (hydrate on interaction)` の中にボタン b を置いたコンポーネントです。

| provideClientHydration の引数 | ボタン a | ボタン b（@defer の中） | 再生の script |
| --- | --- | --- | --- |
| `()` | `jsaction="click:;"` | `jsaction="click:;keydown:;" ngb="d0"` | `["click","keydown"]` |
| `(withEventReplay())` | 1 行目と 1 字も違わない |   |   |
| `(withNoIncrementalHydration())` | 印なし | 描かれない（`@placeholder` の中身） | 無い。event dispatch の script も外される |
| `(withNoIncrementalHydration(), withEventReplay())` | `jsaction="click:;"` | 描かれない | `["click"]` |

`jsaction` は「この要素のこのイベントを捕まえておく」という印で（[jsaction 属性の章](../jsaction/02-jsaction-attribute.md)）、`window.__jsaction_bootstrap(document.body,"ng",[…],[])` の script が、JS が届く前のイベントを貯め始めます（platform-server の utils.ts L157〜186、[早期の契約の章](../jsaction/05-jsaction-early-contract.md)）。既定と `withEventReplay()` は同じ HTML で、`withEventReplay()` が効いて見えるのは `withNoIncrementalHydration()` と一緒に書いたときだけでした。113 行目「ハイドレートし終えたら全部再生する」も、インクリメンタルが既定の今は半分です。`@defer` の中のボタン b のクリックは、アプリのハイドレーションのあとではなく、そのブロックをハイドレートしたあとに再生されます（[hydrate on interaction のイベントの章](../defer/18-defer-hydrate-events.md)）。

120〜121 行目の例と、L138〜142 の `withIncrementalHydration` の例、216〜220 行目の例は、`App` の宣言を足すと strict の ngc に通りました。説明文は 6b239535e8f（2024-09-19、docs: declare Event Replay feature as stable (#57895)、v19）のときのままで、0454d4ced7e がインクリメンタルを既定にしたときに直されませんでした。新しい本家でも同じです。

## 3. 決まりに外れた組み合わせ：開発モードは例外、本番は片方が勝つ

📄 `angular/packages/platform-browser/src/hydration.ts` L212–243 （▶ の行: 214–215, 218, 222–223, 226–228, 239–240）

````ts
212 │  * @usageNotes
213 │  *
214 ▶  * Basic example of how you can enable hydration in your application when
215 ▶  * `bootstrapApplication` function is used:
216 │  * ```ts
217 │  * bootstrapApplication(App, {
218 ▶  *   providers: [provideClientHydration()]
219 │  * });
220 │  * ```
221 │  *
222 ▶  * Alternatively if you are using NgModules, you would add `provideClientHydration`
223 ▶  * to your root app module's provider list.
224 │  * ```ts
225 │  * @NgModule({
226 ▶  *   declarations: [RootCmp],
227 ▶  *   bootstrap: [RootCmp],
228 ▶  *   providers: [provideClientHydration()],
229 │  * })
230 │  * export class AppModule {}
231 │  * ```
232 │  *
233 │  * @see {@link withNoHttpTransferCache}
234 │  * @see {@link withHttpTransferCacheOptions}
235 │  * @see {@link withI18nSupport}
236 │  * @see {@link withEventReplay}
237 │  * @see {@link withNoIncrementalHydration}
238 │  *
239 ▶  * @param features Optional features to configure additional hydration behaviors.
240 ▶  * @returns A set of providers to enable hydration.
241 │  *
242 │  * @publicApi 17.0
243 │  */
````

説明文は組み合わせの決まりを書いていません。決まりは L262〜278 の 2 つの検査で、開発モードだけで動きます（[provideClientHydration の章の 2 節](../platform/07-hydration-provide.md)）。DEMO の「決まりに外れた組み合わせ」の表で、開発モードの記録は次の文でした。

1. **withNoHttpTransferCache() と withHttpTransferCacheOptions()**

   NG05001「Configuration error: found both withHttpTransferCacheOptions() and withNoHttpTransferCache() in the same call to provideClientHydration(), which is a contradiction.」
2. **withIncrementalHydration() と withNoIncrementalHydration()**

   NG05001「Configuration error: found both withIncrementalHydration() and withNoIncrementalHydration() in the same call to provideClientHydration(), which is a contradiction.」

本番は例外にならず、「足す」方が勝ちました。1 つ目は既定のキャッシュ（L286〜288）が外れ、`withHttpTransferCacheOptions` の 3 つの provider が 5 番目に入ってキャッシュは動きます。2 つ目は既定のインクリメンタル（L289〜291）が外れ、`withIncrementalHydration` の 7 つが 5 番目に入ります。platform-server の記録でも、本番で 2 つ目を書くと `ngb="d0"` と再生の script が出て、インクリメンタルは有効でした。「外す」と書いたつもりの設定が、本番だけ黙って無視されることになります。

同じ数字 NG05001（`RuntimeErrorCode.HYDRATION_CONFLICTING_FEATURES`、errors.ts L15）は、もう 1 か所で警告として使われます。

📄 `angular/packages/platform-browser/src/hydration.ts` L160–167 （▶ の行: 163–166）

```ts
160 │   return hydrationFeature(HydrationFeatureKind.NoIncrementalHydration);
161 │ }
162 │ 
163 ▶ /**
164 ▶  * Returns an `ENVIRONMENT_INITIALIZER` token setup with a function
165 ▶  * that verifies whether enabledBlocking initial navigation is used in an application
166 ▶  * and logs a warning in a console if it's not compatible with hydration.
167 │  */
```

163〜166 行目のとおり、ルーターの `withEnabledBlockingInitialNavigation()` と一緒に使うと、開発モードの記録は console.warn に「NG05001: Configuration error: found both hydration and enabledBlocking initial navigation in the same application, which is a contradiction.」を書き、アプリは作れました（L177〜184。本番は L281〜283 で検出の provider ごと外れます）。これは 52b8e07d6e5（2025-08-02、feat(platform-browser): Warns on conflicting hydration and blocking navigation (#62963)）からです。

もう 1 つ、説明文に無い警告があります。`withNoIncrementalHydration()` でインクリメンタルを外したのに、テンプレートに `hydrate` のトリガーがあると、サーバーの上の開発モードで NG0508「Angular has detected that some `@defer` blocks use `hydrate` triggers, but incremental hydration was not enabled. …」が出ました（core の defer/instructions.ts L147〜153）。コンポーネントの最初の作成（`firstCreatePass`）でだけ確かめ、モジュールの変数でプロセスに 1 回しか出しません（hydration/utils.ts L414〜433）。

214〜220 行目の例は strict の ngc に通りました。222〜231 行目の NgModule の例は、v22 の既定のままの `@Component` で `RootCmp` を宣言すると NG6008「Component RootCmp is standalone, and cannot be declared in an NgModule.」と NG6009 で、`standalone: false` を足すと通りました。standalone が既定になる前の書き方なので、古いだけです。239 行目の `@param features` は可変長の引数で、何も渡さなくても既定の 3 組（と、上で見たイベントの再生）が入ります。

## 4. 開発モードだけの 2 つと、このページの HTML

表の 0・1 番目（L281〜284）は、開発モードでだけ provider が入ります。0 番目が 3 節の検出、1 番目が `provideStabilityDebugging()`（9 秒たっても安定しなければ書く、[ApplicationRef の説明文の章の 9 節](../cra/01-cra-app-ref.md)）です。本番の記録で `provideClientHydration()` は 16 個、開発モードの記録では 19 個でした。本番ではトークンの名前も空で、表には「(名前なし)」と出ます（`InjectionToken` の説明を `ngDevMode` のときだけ付けるため）。

DEMO の最後のボタンは、このページの文書に残っている印を数えます。このサイトの HTML は、ビルドのときに platform-server で描いたものです（`outputMode: "static"`）。本番の headless Chrome で開いたこのページでは、`ng-state` の中に `__nghData__` があり、event dispatch の script も残っていて、`ngh`・`ngb`・`jsaction` の属性は 0 でした。`ngh` はハイドレーションが読み終えた要素から外し（core の hydration/utils.ts L187〜195）、`jsaction` と `ngb` もイベントを渡し終えた要素から外すので（core の event\_delegation\_utils.ts L87〜91 の `removeListeners`）、残っているのは読み終えたあとの形です。

> **🧪 DEMO — provideClientHydration の木を数え、platform-server の HTML と並べる**
>
> 1 つ目のボタンは、チェックした `with*` で `provideClientHydration` を呼んだときの、返った `EnvironmentProviders` の中身を配列の位置（hydration.ts L280〜311）ごとに出します。6 つの `with*` の 64 通りを全部、Node（domino の上の JIT）で開発モードと本番（`ngDevMode = false`）の 2 回呼んで記録したものを引きます（pbd-hydration.demo-hy.ts）。注入器には入れていません。  
>  ページで呼ばないのは、本番ビルドの最初に読む JS（Initial total）が増えるからです。6 つの `with*` を章から読むと 486.46 kB から 490.46 kB に増えました。増えた分のうち 3.0 kB は core の \_debug\_node-chunk.mjs（ハイドレーションの実装のある chunk）からでした。この章の今の形では 486.46 kB のままです。  
>  2〜4 つ目は記録の表です。platform-server の表は、`renderApplication` で 2 つのボタンのコンポーネントを描いた HTML の印です（`provideServerRendering()` と、CLI のビルドが入れる event dispatch の script の代わりに空の script を置いた文書）。5 つ目だけは、このページの文書をその場で読みます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-hydration)

## ここまでの呼び出し（本番で withIncrementalHydration() と withNoIncrementalHydration() を両方渡したとき）

- 👤 `provideClientHydration(withIncrementalHydration(), withNoIncrementalHydration())`
  - `for (… of features) featuresKind.add(ɵkind); providers.push(ɵproviders)` — hydration.ts L250〜256 — *with の 7 つを集める*
  - `if (ngDevMode) …` — L262〜278 — *本番は検査ごと無い*
  - `featuresKind.has(NoIncrementalHydration) ? [] : ɵwithIncrementalHydration()` — L289〜291 — *既定の分は外れる*
  - `providers` — L292 — *with の分が残り、インクリメンタルは有効*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `platform-browser/test/hydration_spec.ts` | `provideClientHydration`（31）› `default`（71）・`withNoHttpTransferCache`（103）・`withHttpTransferCacheOptions`（135）の 3 つの it | 1 節の転送キャッシュ |
| `platform-browser/test/hydration_spec.ts` | `incremental hydration conflicts`（173）› `should throw when both withIncrementalHydration and withNoIncrementalHydration are provided`（174） | 3 節の 2 つ目。1 つ目（転送キャッシュ）の例外と、enabledBlocking の警告の it は無い |
| `platform-server/test/incremental_hydration_spec.ts` | `misconfiguration`（3158）› `should log a warning when incremental hydration is disabled in SSR setup`（3159）ほか 1 つ | 3 節の NG0508 |
| `platform-server/test/incremental_hydration_spec.ts` | `triggers`（817）› `hydrate on interaction`（818） | 2 節の `ngb` と、ブロックごとの再生 |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/platform-browser/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
$ pnpm bazel test //packages/platform-browser/test:test_web_chromium --nocache_test_results --test_output=all
（結果は表の下）
```

結果は手元の bazel で、`//packages/platform-browser/test:test` の `provideClientHydration` が 4 specs、`//packages/platform-server/test:test` の `misconfiguration` が 2 specs、`hydrate on interaction` が 2 specs、どれも 0 failures でした（2026-11-22）。既定（引数なし）の HTML に `jsaction` が付くこと、つまり `withEventReplay()` を書かなくても再生が入ることを expect する it は、platform-server の event\_replay\_spec.ts にもありません（23 の it のうち、サーバーで引数なしに描くのは L503 の 1 つだけで、見ているのは `isStable` の流れと console.error）。

直すとしたら、説明文は hydration.ts の 202 行目の先頭に `* ` を足して項目にし、「イベントの再生（インクリメンタルが入れる）」を既定の一覧に足します。209 行目は「`withNoIncrementalHydration` と一緒に使うときにイベントの再生を有効にする」、111〜113 行目は「インクリメンタルが有効なら既定で入る」と添えます。本番の振る舞いを揃えるなら、`provideClientHydration`（L244〜312）の L262〜278 の検査を `ngDevMode` の外に出すか、外す旗（`NoHttpTransferCache`・`NoIncrementalHydration`）がある組では L292 の `providers` から対応する `with*` の分を除きます（後者は本番の振る舞いが変わる）。spec は hydration\_spec.ts の `incremental hydration conflicts` の隣に、転送キャッシュの 2 つの組で例外になる it と、platform-server の event\_replay\_spec.ts に `provideClientHydration()` だけで `jsaction` が付く it を足します。

## 聞かれそうな質問

**Q. v22 で `withEventReplay()` を書く意味はありますか？**

`withNoIncrementalHydration()` を書いていなければありません。既定のインクリメンタル（L289〜291）が中で `withEventReplay()` を入れていて、DEMO の platform-server の表で、既定と `withEventReplay()` の HTML は同じでした。

**Q. `withIncrementalHydration()` と `withNoIncrementalHydration()` を両方書いたら？**

開発モードでは NG05001 の例外です（L269〜277）。本番は検査ごと無いので、既定の分が外れ、`withIncrementalHydration` の分が入って、インクリメンタルは有効になります（DEMO の 3 つ目の表）。

**Q. 本番のアプリで `provideClientHydration()` が置く provider は何個ですか？**

16 個です。開発モードは 0・1 番目の検出と `provideStabilityDebugging` の 3 個が足されて 19 個です（L281〜284）。

**Q. ルーターの `enabledBlocking` と一緒に使うと何が起きますか？**

開発モードだけ、console.warn に NG05001 の警告が出ます（163〜166 行目、L177〜184）。例外ではなく、アプリは作られます。

**Q. API リファレンスの既定の機能の一覧に、インクリメンタルが見当たらないのはなぜですか？**

202 行目に箇条書きの `*` が無く、Markdown では前の `HttpClient` の項目の続きの文になるからです。

## 読み終えて

- v22 の `provideClientHydration()` は、DOM のハイドレーション・転送キャッシュ・インクリメンタルと、インクリメンタルが入れるイベントの再生を既定で並べる。
- `withEventReplay()` の説明（L111〜113・L209）は、インクリメンタルが既定になる前のまま。効くのは `withNoIncrementalHydration()` と一緒のときだけ。
- 既定の一覧の 202 行目は箇条書きの印が抜けていて、前の項目に続いて見える。
- 矛盾する組み合わせの NG05001 は開発モードだけ。本番では「足す」`with*` が黙って勝つ。
- 開発モードだけの provider が 3 個あり（初期ナビゲーションの検出・`provideStabilityDebugging`）、トークンの名前も開発モードだけ付く。

---

← 前: [bootstrapApplication と BrowserModule の説明文](01-pbd-browser.md)  
次: [レンダラーとイベントの説明文：DomRenderer・SharedStylesHost・EventManager・key\_events](03-pbd-dom.md) →
