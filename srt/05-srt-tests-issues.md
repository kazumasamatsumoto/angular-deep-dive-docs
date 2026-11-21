[目次](../README.md) › [SSR のサーバールートの内側：ルートを取り出し、木で照合し、応答を組み立てる](README.md) › 第 5 回 / 全 5 回

# spec と issue を読む：サーバールートを固めているテスト

> test/ の ng-routes・route-tree・router・app・promise の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で行を変えて見つけた「消しても落ちない行」、サーバールートの issue と PR の表と origin/main の続き。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/srt-tests-issues)

---

この章で分かること: @angular/ssr の `test/` の spec が、このシリーズの第 1〜4 回のどの約束を、どのファイルのどの it で固めているか。手元での走らせ方と結果。作業木で 1 行ずつ変えて「消しても落ちる spec が無い行」を探した結果と、サーバールートの issue と PR の表、44129f66a3 より後の origin/main の続きです。最後に、このシリーズを書きながら見つけたものを 1 つの表にします。

読む対象は angular-cli（44129f66a3）の `packages/angular/ssr/test/` の下の spec と `testing-utils.ts` です。BUILD.bazel の読み方（`spec_bundle` と `flaky = True`）と、`setAngularAppTestingManifest` の前半は[SSR の守りのシリーズの最終回](../ssrx/10-ssrx-tests-issues.md)の 2 節にあるので、ここでは繰り返しません。

1. [1. ルートを取り出す](01-srt-extract.md)
2. [2. プリレンダーのパラメータとリダイレクト](02-srt-prerender-params.md)
3. [3. ルートの木](03-srt-route-tree.md)
4. [4. manifest と renderAngular](04-srt-manifest-render.md)
5. **5. spec と issue**（この章）

## 1. spec の地図

`test/` の下の 12 ファイルの it の行は合わせて 249 で、走る数（249 specs）と同じです。下の表の数は `<work>/srt-demo/b/specmap.py` が数えました（describe は字下げ 4 文字まで、括弧の中は行と it の数）。

| ファイル（test/） | 行 | it | describe | 固めている約束 | 章 |
| --- | --- | --- | --- | --- | --- |
| routes/ng-routes\_spec.ts | 844 | 28 | extractRoutesAndCreateRouteTree（25）・route configuration validation（59、7）・when invokeGetPrerenderParams is true（184、5） | 取り出し・getPrerenderParams・fallback・serverRoutes の検査（\* と getPrerenderParams は 85 行目）・IS\_DISCOVERING\_ROUTES（823 行目） | [1. ルートを取り出す](01-srt-extract.md)<br>[2. プリレンダーのパラメータとリダイレクト](02-srt-prerender-params.md)<br>[3. ルートの木](03-srt-route-tree.md) |
| routes/route-tree\_spec.ts | 289 | 18 | RouteTree（12）・toObject and fromObject（19、4）・match（123、14） | 段の照合の順・\*\* と末尾の /・直列化 | [3. ルートの木](03-srt-route-tree.md) |
| routes/router\_spec.ts | 141 | 6 | ServerRouter（20）・from（47、2）・match（76、4） | manifest から木を作る・同時の from が同じ Promise・/index.html・decode | [3. ルートの木](03-srt-route-tree.md)<br>[4. manifest と renderAngular](04-srt-manifest-render.md) |
| app\_spec.ts | 567 | 36 | AngularServerApp（22）・handle（181）・CSR and SSG pages（190、13）・SSG pages（286、11）・SSR pages（418、11） | RenderMode ごとの応答・abort（225 行目）・自分を壊すアプリ（265 行目）・ストリームの cancel（464 行目） | [4. manifest と renderAngular](04-srt-manifest-render.md) |
| app-engine\_spec.ts | 489 | 29 | AngularAppEngine（107）ほか 5 つ | エンジンの manifest（entryPoints・supportedLocales）・ホストの検査（守りは別のシリーズ） | [4. manifest と renderAngular](04-srt-manifest-render.md) |
| utils/promise\_spec.ts | 36 | 2 | promiseWithAbort（12） | abort で reject・abort しなければ resolve | [4. manifest と renderAngular](04-srt-manifest-render.md) |
| utils/url\_spec.ts | 223 | 38 | URL Utils（20）ほか 8 つ | buildPathWithParams（167、3）・stripMatrixParams（198、6）など | [2. プリレンダーのパラメータとリダイレクト](02-srt-prerender-params.md) |
| utils/redirect\_spec.ts | 67 | 7 | Redirect Utils（11） | createRedirectResponse（リダイレクトと URL の照合の章） | [2. プリレンダーのパラメータとリダイレクト](02-srt-prerender-params.md) |
| utils/validation\_spec.ts・i18n\_spec.ts・hooks\_spec.ts・assets\_spec.ts | 815 | 85 | — | このシリーズの外（SSR の守りのシリーズ） | — |

第 1・2 回の行（ルートの取り出しと `getPrerenderParams`）は、ほぼ全部が `ng-routes_spec.ts` の 1 つの describe（25 行目）に入っています。第 3 回の木は `route-tree_spec.ts` と `router_spec.ts`、第 4 回の描画と片付けは `app_spec.ts` と `promise_spec.ts` です。manifest.ts そのもの（`setAngularAppManifest`・`getAngularAppManifest`）を直接呼ぶ it はなく、どの spec も次の `setAngularAppTestingManifest` を通して使っています。

## 2. ビルドせずにアプリを起動する

📄 `angular-cli/packages/angular/ssr/test/testing-utils.ts` L105–121 （▶ の行: 107–108, 112–115）

```ts
105 │       ...additionalServerAssets,
106 │     },
107 ▶     bootstrap: async () => (context) => {
108 ▶       return bootstrapApplication(
109 │         rootComponent,
110 │         {
111 │           providers: [
112 ▶             provideZonelessChangeDetection(),
113 ▶             provideRouter(routes),
114 ▶             provideServerRendering(withRoutes(serverRoutes)),
115 ▶             ...extraProviders,
116 │           ],
117 │         },
118 │         context,
119 │       );
120 │     },
121 │   });
```

spec の manifest の `bootstrap` です。107 行目は第 4 回の表の「`bootstrap()` が関数を返す」形そのもので、108 行目の `bootstrapApplication` に `context`（`platformRef`）を渡します。112 行目で zoneless にし、113 行目に Router のルート、114 行目に serverRoutes を渡します。部品はどれも JIT で、このシリーズのデモの記録（`record.mjs`）も同じ形でアプリを起動しています。114 行目はいつも `provideServerRendering(withRoutes(…))` なので、`withAppShell` と `ServerRenderingOptions` を渡す形は、この `test/` のどこでも起動されません（5 節の T16）。

## 3. 走らせ方と結果

📄 `走らせ方`

```
# ../angular-cli-fix（44129f66a3、pnpm install 済み）
pnpm bazel test //packages/angular/ssr/test:test --nocache_test_results --test_output=all
# 名前で絞る。jasmine の --filter は正規表現で、一番外の describe の名前から始まる「完全な名前」に当てる
pnpm bazel test //packages/angular/ssr/test:test --nocache_test_results --test_output=all '--test_arg=--filter=^RouteTree '
# 作業木（git -C ../angular-cli-fix worktree add <work>/srt-wt-b 44129f66a3）で 1 か所ずつ変える
python3 <work>/srt-demo/b/mut/mutate.py <work>/srt-wt-b            # T1〜T16
python3 <work>/srt-demo/b/mut/mutate.py <work>/srt-wt-b T17 T18 T19 T20
```

📄 `自分で走らせた結果（2026-11-18）`

```
249 specs, 0 failures   Finished in 0.337 seconds      # 絞らない（作業木の最初の 1 回は 21.7 秒、2 回目からはキャッシュで 1 秒前後）
--filter=^RouteTree                         Ran 18 of 249 specs
--filter=^ServerRouter                      Ran 6 of 249 specs
--filter=^extractRoutesAndCreateRouteTree   Ran 28 of 249 specs
--filter=^AngularServerApp                  Ran 36 of 249 specs
--filter=^promiseWithAbort                  Ran 2 of 249 specs
//packages/angular/ssr/test:test   PASSED
```

`--filter` は効き、絞った数は 1 節の表の it の数と同じでした（`^extractRoutesAndCreateRouteTree ` は 28、`^AngularServerApp ` は 36）。0 件に絞っても `PASSED` になるので、「Ran N of 249 specs」を見ます。作業木は ../angular-cli-fix から作った別の場所なので、bazel の出力の置き場も別になり、最初の 1 回は 21.7 秒かかりました。

## 4. 木と照合の spec を読む

📄 `angular-cli/packages/angular/ssr/test/routes/route-tree_spec.ts` L209–218 （▶ の行: 210–211, 213）

```ts
209 │     it('should prefer exact matches in case of conflicts', () => {
210 ▶       routeTree.insert('/blog/*', { renderMode: RenderMode.Server });
211 ▶       routeTree.insert('/blog/article', { redirectTo: 'blog', renderMode: RenderMode.Server });
212 │ 
213 ▶       expect(routeTree.match('/blog/article')).toEqual({
214 │         route: '/blog/article',
215 │         redirectTo: 'blog',
216 │         renderMode: RenderMode.Server,
217 │       });
218 │     });
```

210 行目で `/blog/*` を先に、211 行目で `/blog/article` をあとに入れ、213 行目で後者が当たることを確かめます。[第 3 回](03-srt-route-tree.md)の「書いた順ではなく完全一致が先」（4df97d1923）を固める it です。

📄 `angular-cli/packages/angular/ssr/test/routes/route-tree_spec.ts` L157–178 （▶ の行: 159–160, 166, 174）

```ts
157 │     it('should handle catch all (double wildcard) segments', () => {
158 │       routeTree.insert('/api/users', { renderMode: RenderMode.Server });
159 ▶       routeTree.insert('/api/*/users/**', { renderMode: RenderMode.Server });
160 ▶       routeTree.insert('/api/**', { renderMode: RenderMode.Server });
161 │ 
162 │       expect(routeTree.match('/api/users')).toEqual({
163 │         route: '/api/users',
164 │         renderMode: RenderMode.Server,
165 │       });
166 ▶       expect(routeTree.match('/api/products')).toEqual({
167 │         route: '/api/**',
168 │         renderMode: RenderMode.Server,
169 │       });
170 │       expect(routeTree.match('/api/info/users/details')).toEqual({
171 │         route: '/api/*/users/**',
172 │         renderMode: RenderMode.Server,
173 │       });
174 ▶       expect(routeTree.match('/api/user/details')).toEqual({
175 │         route: '/api/**',
176 │         renderMode: RenderMode.Server,
177 │       });
178 │     });
```

`/api/*/users/**` と `/api/**` の 2 つの `**` を入れて、174 行目の `/api/user/details` が `/api/**` に戻ることを見ます。`*` の枝（`user`）を降りて外れ、`api` の段の `**` に戻る後戻りです。ただしこの it が見ているのは `*` の枝からの後戻りだけで、完全一致の枝から戻る形（`/api/users/x` のように完全一致の子を降りてから外れる）は、どの it にもありません（5 節の T4）。

📄 `angular-cli/packages/angular/ssr/test/routes/router_spec.ts` L47–75 （▶ の行: 49, 52, 67, 72–74）

```ts
47 │   describe('from', () => {
48 │     it('should build the route tree', async () => {
49 ▶       router = await ServerRouter.from(manifest, new URL('http://localhost'));
50 │ 
51 │       // Check that routes are correctly built
52 ▶       expect(router.match(new URL('http://localhost/home'))).toEqual({
53 │         route: '/home',
54 │         renderMode: RenderMode.Server,
55 │       });
56 │       expect(router.match(new URL('http://localhost/redirect'))).toEqual({
57 │         redirectTo: '/home',
58 │         route: '/redirect',
59 │         renderMode: RenderMode.Server,
60 │         status: 301,
61 │       });
62 │       expect(router.match(new URL('http://localhost/user/123'))).toEqual({
63 │         route: '/user/*',
64 │         renderMode: RenderMode.Server,
65 │       });
66 │     });
67 ▶ 
68 │     it('should return the existing promise if a build from is already in progress', () => {
69 │       const promise1 = ServerRouter.from(manifest, new URL('http://localhost'));
70 │       const promise2 = ServerRouter.from(manifest, new URL('http://localhost'));
71 │ 
72 ▶       expect(promise1).toBe(promise2); // Ensure both promises are the same
73 ▶     });
74 ▶   });
75 │ 
```

`ServerRouter.from` の 2 件です。49 行目は manifest に `routes` が無いので、その場でアプリを起動して取り出す道を通ります（[第 4 回](04-srt-manifest-render.md)のデモの最初の `GET /` と同じ）。67 行目の `/user/123` は `/user/*` です。72〜74 行目は、取り出しの途中に 2 回呼ぶと同じ Promise が返ること（router.ts の `??=`）です。`routes` がある manifest から `fromObject` で作る道を通る it は、`router_spec.ts` にはありません（`route-tree_spec.ts` の `fromObject` の 4 件が木だけを確かめています）。

📄 `angular-cli/packages/angular/ssr/test/routes/ng-routes_spec.ts` L85–103 （▶ の行: 85, 90, 92, 99–101）

```ts
 85 ▶     it("should error when 'getPrerenderParams' is used with a '*' route", async () => {
 86 │       setAngularAppTestingManifest(
 87 │         [{ path: 'invalid/:id', component: DummyComponent }],
 88 │         [
 89 │           {
 90 ▶             path: 'invalid/*',
 91 │             renderMode: RenderMode.Prerender,
 92 ▶             getPrerenderParams() {
 93 │               return Promise.resolve([]);
 94 │             },
 95 │           },
 96 │         ],
 97 │       );
 98 │ 
 99 ▶       const { errors } = await extractRoutesAndCreateRouteTree({ url });
100 ▶       expect(errors[0]).toContain(
101 ▶         "Invalid 'invalid/*' route configuration: 'getPrerenderParams' cannot be used with a '*' route.",
102 │       );
103 │     });
```

serverRoutes の `*` と `getPrerenderParams` の検査は、90 行目の `invalid/*` の 1 件だけで固めています。第 3 回の 6 節で見た、先頭の段の `*`（`'*'`）の形はありません。

## 5. 消しても落ちない行

作業木（44129f66a3）で 1 か所ずつ書き換え、249 件を全部走らせて `git checkout` で戻しました（20 通り、最後に `git status --short` が空）。第 1〜2 回の行（ng-routes.ts）は、第 1 回で試したもの（IS\_DISCOVERING\_ROUTES の provide、`afterPreactivation` の 1 行。どちらも 1 failure）とは別の 4 か所を試しています。

|   | どこ | 変えたこと | 結果 | 章 |
| --- | --- | --- | --- | --- |
| T4 | route-tree.ts 245〜248 | 完全一致の枝が外れても戻らない | 0 failures | [3. ルートの木](03-srt-route-tree.md) |
| T5 | route-tree.ts 254〜257 | \* の枝が外れても戻らない | 3 failures | [3. ルートの木](03-srt-route-tree.md) |
| T1 | route-tree.ts 210 | map(decodeURIComponent) を外す | 6 failures（53b9623b7b の it は通る） | [3. ルートの木](03-srt-route-tree.md) |
| T2 | route-tree.ts 121 | :x を \* にしない | 18 failures | [3. ルートの木](03-srt-route-tree.md) |
| T3 | route-tree.ts 233 | 使い切ったとき \*\* を見ない | 24 failures | [3. ルートの木](03-srt-route-tree.md) |
| T7 | route-tree.ts 194〜200 | toObject を「子が先」に | 8 failures | [3. ルートの木](03-srt-route-tree.md) |
| T8 | ng-routes.ts 589 | \* と getPrerenderParams の検査を消す | 1 failure | [3. ルートの木](03-srt-route-tree.md) |
| T9 | ng-routes.ts 589 | path.split('/').includes('\*') にする（直す案） | 0 failures | [3. ルートの木](03-srt-route-tree.md) |
| T16 | route-config.ts 485 | hasOptions をいつも false | 0 failures | [3. ルートの木](03-srt-route-tree.md) |
| T17 | ng-routes.ts 725 | 同じ経路の 2 件目を捨てない | 1 failure（ng-routes\_spec 757 行目） | [1. ルートを取り出す](01-srt-extract.md) |
| T18 | ng-routes.ts 737 | \*\* で終わる serverRoute も「使われない」検査に | 1 failure（ng-routes\_spec 105 行目） | [1. ルートを取り出す](01-srt-extract.md) |
| T19 | ng-routes.ts 68 | MODULE\_PRELOAD\_MAX を 0 に | 0 failures | [1. ルートを取り出す](01-srt-extract.md) |
| T20 | ng-routes.ts 732 | adev のための setTimeout(0) を消す | 0 failures | [1. ルートを取り出す](01-srt-extract.md) |
| T10 | ng.ts 112〜114 | whenStable のあとの destroyed を見ない | 1 failure（app\_spec 265 行目） | [4. manifest と renderAngular](04-srt-manifest-render.md) |
| T11 | ng.ts 185〜187 | asyncDestroyPlatform の先の確かめを消す | 0 failures | [4. manifest と renderAngular](04-srt-manifest-render.md) |
| T12 | ng.ts 151 | content() のあとに壊さない | 0 failures | [4. manifest と renderAngular](04-srt-manifest-render.md) |
| T13 | ng.ts 160〜162 | 失敗とリダイレクトで壊さない | 0 failures | [4. manifest と renderAngular](04-srt-manifest-render.md) |
| T14 | promise.ts 47 | abort の聞き手を外さない | 0 failures | [4. manifest と renderAngular](04-srt-manifest-render.md) |
| T15 | promise.ts 35〜39 | abort 済みの確かめを消す | 0 failures | [4. manifest と renderAngular](04-srt-manifest-render.md) |

読めることは 3 つです。

1. **木の照合はほぼ固まっている**

   段の分け方・`:x` の置き換え・`**`・直列化の順は、変えると 3〜24 件落ちます。抜けは「完全一致の枝からの後戻り」（T4）と、53b9623b7b の it が decode を見分けないこと（T1 で落ちた 6 件は、非 ASCII のプリレンダーと `encoding url` の 2 種類の入力でした）です。
2. **片付けは固まっていない**

   プラットフォームを壊す行（T11〜T13）と、`promiseWithAbort` の聞き手の行（T14・T15）は、消しても 1 件も落ちません。spec は応答（status・本文・`DOMException`）を見ていて、プラットフォームが残ったかを見ていないからです。下の `promise_spec.ts` の 1 件目もそうです。
3. **取り出しの細部**

   同じ経路の 2 件目（T17）と `**` の扱い（T18）は 1 件ずつの it が見張っています。`MODULE_PRELOAD_MAX`（T19）は、`preload` の数を確かめる it が `test/` に無いので 0 にしても通ります（第 1 回のとおり `appendPreloadToMetadata` を直接呼ぶ it もありません）。

📄 `angular-cli/packages/angular/ssr/test/utils/promise_spec.ts` L12–23 （▶ の行: 15, 17–18, 21）

```ts
12 │ describe('promiseWithAbort', () => {
13 │   it('should reject with an AbortError when the signal is aborted', async () => {
14 │     const abortController = new AbortController();
15 ▶     const promise = promiseWithAbort(setTimeout(500), abortController.signal, 'Test operation');
16 │ 
17 ▶     queueMicrotask(() => {
18 ▶       abortController.abort('Test reason');
19 │     });
20 │ 
21 ▶     await expectAsync(promise).toBeRejectedWithError();
22 │   });
23 │ 
```

15 行目で 500 ms 待つ Promise を包み、17〜19 行目の次のマイクロタスクで abort して、21 行目で reject を確かめます。包んだ `setTimeout(500)` がそのあとも走り続けることは、この it では問いません。[第 4 回](04-srt-manifest-render.md)の 4 節のとおり、それが `promiseWithAbort` の約束どおりの動きです。

## 6. issue と PR

2026-11-18 に gh で読んだ angular/angular-cli の issue（"ssr routes"・getPrerenderParams・serverRoutes・RenderMode・"ssr redirect" で検索した 5 つの一覧）と、"ssr" の PR 80 件から、このシリーズの行に関係するものを選び、本文と回答を読んで章に振り分けました。要約はこの章の書き手が付けたものです。

| 章 | 開いている | 閉じた |
| --- | --- | --- |
| [1. ルートを取り出す](01-srt-extract.md) | 2 | 5 |
| [2. プリレンダーのパラメータとリダイレクト](02-srt-prerender-params.md) | 1 | 10 |
| [3. ルートの木](03-srt-route-tree.md) | 2 | 5 |
| [4. manifest と renderAngular](04-srt-manifest-render.md) | 0 | 8 |
| [5. spec と issue](05-srt-tests-issues.md) | 0 | 1 |

> **🧪 DEMO — サーバールートの issue と PR（34 件、開いているもの 5 件）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/srt-tests-issues)

閉じたものは第 2 回（リダイレクトと `getPrerenderParams`）に集まっていて、2026-10 に issue が 5 件続けて閉じています。開いている issue 4 件のうち 3 件は要望（取り出しを止めたい、Router に無い経路を Prerender にしたい、ルートごとの App Shell）で、残りの 1 件が #33555（照合の食い違い）です。それを直す PR #34091 も開いています。NOT\_PLANNED の #29961 は、[第 3 回](03-srt-route-tree.md)のデモの場面 unused と同じ形（`redirectTo` のルートが `**` の 404 を受け継ぐ）で、「エラーは正しい。そのルートを serverRoutes に書く」という回答でした。

## 7. origin/main の続き

`git log 44129f66a3..origin/main -- packages/angular/ssr`（origin/main は 2026-11-16 の 63a1c6ad57）の fix と refactor に、@angular/build の manifest の 2 本を足した表です。行数は `git show --numstat` の src（@angular/build は manifest.ts）と spec の足した行です。

| コミット | 日付 | 何を | src | spec | 章 |
| --- | --- | --- | --- | --- | --- |
| f2cd8c8cf7 | 10-12 | 相対のリダイレクトでクエリを残す（relativeRedirect） | +18 / −7 | +128 | 2. プリレンダーのパラメータとリダイレクト |
| b3bbada1ef | 10-12 | 相対のリダイレクトを親のルートから解く | +17 / −12 | +130 | 2. プリレンダーのパラメータとリダイレクト |
| 97ed36ec4f | 10-12 | redirectTo の :param を値で埋める | +96 / −11 | +103 | 2. プリレンダーのパラメータとリダイレクト |
| 8aa16b6f9f | 10-12 | redirectTo のクエリの置き場所を埋める | +63 / −2 | +36 | 2. プリレンダーのパラメータとリダイレクト |
| 0b9a52cc95 | 10-13 | 入れ子の空の path でも preload を残す | +61 / −35 | +95 | 1. ルートを取り出す |
| 92033cea10 | 10-23 | リダイレクトの URL の部品を 1 つにまとめ DefaultUrlSerializer を使う | +110 / −196 | +26 | 2. プリレンダーのパラメータとリダイレクト |
| 194b64137e | 10-26 | クエリとフラグメントの末尾の / を残す | +26 / −2 | +62 | 2. プリレンダーのパラメータとリダイレクト |
| 267064ca74 | 10-26 | 経路とリダイレクトの URL を段とクエリに分けて持つ | +292 / −54 | +43 | 2. プリレンダーのパラメータとリダイレクト |
| dd095343a5 | 10-26 | （@angular/build）manifest に埋め込む値を JSON.stringify で書く | +9 / −6 | +65 | 4. manifest と renderAngular |
| 47bc9c3969 | 10-28 | abort で描画中のプラットフォームを壊す | +75 / −23 | +135 | 4. manifest と renderAngular |
| bf1602a916 | 10-30 | getPrerenderParams の値を検査する | +40 / −0 | +97 | 2. プリレンダーのパラメータとリダイレクト |
| 8b28a552b2 | 11-01 | 使われない constructUrl を消す | +0 / −15 | +0 | 2. プリレンダーのパラメータとリダイレクト |
| be9e3a01f3 | 11-16 | （@angular/build）作り置きのページごとに別の chunk を作る | +2 / −1 | +26 | 4. manifest と renderAngular |

13 本のうち 7 本がリダイレクト（第 2 回）で、`redirectTo` の解き方は 267064ca74 で「段とクエリに分けて持つ」形に作り替えられています。fix の 10 本のうち 9 本は、src に足した行より多い spec を足しています（8aa16b6f9f だけが src +63 に spec +36）。第 3 回の木（route-tree.ts）の変化は `relativeRedirect` の 3 行（f2cd8c8cf7）だけで、照合の規則は変わっていません。be9e3a01f3 を除く fix は 22.2.x の枝にも入っていて、このサイトの 22.2.7 にあります（47bc9c3969 は f8f9f48bfa、bf1602a916 は dcd5029bbd、dd095343a5 は db45eed631）。refactor の 267064ca74 は 22.2.7 に入っていません。

## このシリーズで見つけたもの

第 1〜4 回を書く途中で、本家の振る舞いの食い違いと、spec や文書の小さな抜けが見つかりました。どれも Node で本物の @angular/ssr 22.2.7（と、比べるための 22.1.7）を動かすか、作業木で行を変えて bazel で走らせて確かめ、ソースの行（angular-cli 44129f66a3）と照らしています。「既存」の欄は、gh で題と本文を検索した範囲で見つかったものです。

| 何が起きるか | ソースの行 | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| Router に `user/:id` を `user/new` より先に書くと、`/user/new` の応答は、ヘッダーなどの値を `user/new` の serverRoute から取り、本文は Router が選んだ `user/:id` の部品になる | routes/route-tree.ts 243〜261 行目（段ごとに完全一致が先）と、Router の上から順の照合 | 第 3 回の記録 order（`ɵgetOrCreateAngularServerApp().handle`） | 同じ種類の食い違い（URL の文字の読み方）は #33555（開）・PR #34091（開）。並びの順の形は書かれていない | [第 3 回](03-srt-route-tree.md) |
| serverRoute の path が先頭の段の `*`（`'*'`・`'*/x'`）だと、`getPrerenderParams` との組がエラーにならない（`'p/*'` はエラー） | routes/ng-routes.ts 589 行目（8bfcae4c1b で `path.includes('*')` から変わった） | 第 3 回の記録 star。`path.split('/').includes('*')` にすると 249 件はそのまま通る（T9） | 見つからない | [第 3 回](03-srt-route-tree.md) |
| `toObject` → `fromObject` で decode がもう 1 回かかり、`%25` を含む経路は manifest から作り直した木で当たらなくなる | routes/route-tree.ts 175〜181 行目と 210 行目 | 第 3 回の記録（1 往復の前後で match の答えが変わる） | 見つからない | [第 3 回](03-srt-route-tree.md) |
| Router の path に `%` をそのまま書くと（`50%-off`）、取り出しの `insert` が `URIError` を投げる | routes/route-tree.ts 210 行目 | 第 3 回の記録 | リクエストの側の同じ `URIError` は、SSR の守りのシリーズの最終回の表にある。issue は見つからない | [第 3 回](03-srt-route-tree.md) |
| 使われない serverRoute のエラーは、書いた `post/:slug` ではなく正規化した `post/*` で出る | routes/ng-routes.ts の逆向きの検査（serverRoutes の木の `traverse()`）と route-tree.ts 121 行目 | 第 3 回の記録 unused | — | [第 3 回](03-srt-route-tree.md) |
| 44129f66a3（と 22.1.7）では、描画中に request.signal を abort しても描画を続け、保留中のタスクが終わらないとプラットフォームを壊さない | utils/promise.ts 43 行目（待つのをやめるだけ）と utils/ng.ts 54〜59 行目（signal を受け取らない） | 第 4 回の記録 `/hang`（22.1.7 は 600 ms 待っても破棄されない、22.2.7 は 1〜2 ms で破棄） | origin/main の 47bc9c3969（PR #34568）で直っていて、22.2.7 にも入っている | [第 4 回](04-srt-manifest-render.md) |
| （spec）完全一致の枝からの後戻り、プラットフォームを壊す 3 か所、`promiseWithAbort` の聞き手の 2 か所、`hasOptions`、`MODULE_PRELOAD_MAX` は、消しても 249 件が通る。53b9623b7b が足した it は decode を外しても通る。`withAppShell` を起動する it は `test/` に無い | 5 節の表の各行 | 作業木で行を変えて bazel（T1・T4・T11〜T16・T19） | — | 第 1・3・4 回 |
| （文書）`RouteTree.match` の JSDoc は「先に入れたものが勝つ」のままで、4df97d1923 のあとの動き（完全一致が先）と違う。`getPrerenderParams` の JSDoc の例の path は `/` で始まり、そのままだと先頭の `/` の検査で弾かれる | routes/route-tree.ts 141〜143 行目、routes/route-config.ts 156・166 行目 | git show 4df97d1923、第 3 回の記録 bad の 1 つめのエラー | — | [第 3 回](03-srt-route-tree.md) |
| 22.2.7 で `getPrerenderParams` の値が 1 つでも検査に落ちると、その経路の残りの値と fallback の 1 件が出ない（値ごとではなく経路ごとに止まる） | 22.2.7 の ng-routes の展開の行（bf1602a916 で足された検査を、for の外側の try が包む） | 第 2 回の記録（値の表で `/item/first` だけが残る行） | bf1602a916（PR #34570）の spec はエラーが 1 件出ることだけを確かめる | [第 2 回](02-srt-prerender-params.md) |
| `fallback: None` でも、invoke が偽の取り出し（manifest に木が無いときのリクエスト時）では、型の経路が Server で木に入り、サーバーで描かれる | routes/ng-routes.ts の fallback の条件（第 2 回の 5 節） | 第 2 回の記録（5 節の表の右の列） | — | [第 2 回](02-srt-prerender-params.md) |
| （spec）0fdcde5426（正規表現の g の状態）を戻すと落ちる it は、jasmine の並べ替えの seed で入れ替わる。`getPrerenderParams` が投げる場合と、文字列でない値を返す場合の it は 44129f66a3 に無い | test/routes/ng-routes\_spec.ts の describe（184 行目） | 作業用の複製で行を戻して bazel を 3 回（第 2 回） | 0fdcde5426 は spec を足していない（#33154） | [第 2 回](02-srt-prerender-params.md) |
| （型）取り出しの結果の型 `AngularRouterConfigResult` に、どこでも値を入れない `serverRoutesConfig` がある | routes/ng-routes.ts 125 行目 | grep（第 1 回） | — | [第 1 回](01-srt-extract.md) |
| matcher のルートの下のサーバールートは、`親の経路/**` の文字列の前方一致で集めるので、`**` を使わずに書いた serverRoute（`shop/*/sale`）は集められない | routes/ng-routes.ts 274・275 行目 | 第 1 回の記録と ng-routes\_spec.ts 383 行目の it | — | [第 1 回](01-srt-extract.md) |

読み方の目安: 上の 2 つ（並びの順の食い違い、先頭の `*`）は、利用者が普通に書ける設定で起きるので影響がいちばん大きいものです。3・4 つめは `%` を経路に書いたときだけです。片付けの抜けは 22.2.7 では直っていますが、それを見張る spec は 44129f66a3 の `test/` にはありません。

## テストが走るまでの呼び出し

- 👤 `pnpm bazel test //packages/angular/ssr/test:test` — ../angular-cli-fix か作業木
  - `jasmine_test(name = "test", data = [":esm_tests_bundled"], flaky = True)` — test/BUILD.bazel — *落ちると 3 回まで*
    - `spec_bundle(name = "esm_tests_bundled")` — test/BUILD.bazel — *12 ファイル、249 件*
      - `setAngularAppTestingManifest(routes, serverRoutes, …)` — testing-utils.ts L48 — *ビルドの代わりの manifest*
        - `bootstrapApplication(rootComponent, { providers: [provideZonelessChangeDetection(), provideRouter(routes), provideServerRendering(withRoutes(serverRoutes))] }, context)` — testing-utils.ts L108
      - `extractRoutesAndCreateRouteTree` / `ServerRouter.from` / `new AngularServerApp().handle` — 各 spec

## 聞かれそうな質問

**Q. サーバールートの照合を直したら、どの spec を走らせればいいですか？**

`//packages/angular/ssr/test:test` を `--test_arg=--filter=^RouteTree `（18 件）と `^ServerRouter `（6 件）で絞ります。値の写し方まで変えたなら `^extractRoutesAndCreateRouteTree `（28 件）も。全部でも 1 秒前後です（3 節）。

**Q. spec はビルドの出力を使わずに、どうやって manifest を用意していますか？**

`testing-utils.ts` の `setAngularAppTestingManifest` が、HTML のアセットと 107〜120 行目の `bootstrap` を持つ manifest を置きます。`routes` は入れないので、`ServerRouter.from` はその場で取り出す道を通ります（4 節の router\_spec 49 行目）。

**Q. どこに it を足すと、いちばん守りが厚くなりますか？**

5 節の 0 failures の行です。`route-tree_spec.ts` の `describe('match')` に完全一致の枝からの後戻り（`/a/b` と `/*/c` に `/a/c`）、`app_spec.ts` の 225 行目の隣に、終わらない描画を abort して `PlatformRef.prototype.destroy` が呼ばれる it（464 行目の it と同じ `spyOn`）。後者は 22.1.7 の形では落ち、22.2.7 の形では通ります。

**Q. 開いている issue で、このシリーズの行に直接かかわるものは？**

#33555 です。`ServerRouter.match`（第 3 回の木）と Router が URL を別々に読むため、値と描かれるルートが別になる、という報告で、PR #34091 が開いています。第 3 回の並びの順の食い違いも同じ「値と本文が別のルート」の形です。

**Q. 44129f66a3 と、このサイトの 22.2.7 は、どこが違いますか？**

7 節の表の fix のうち be9e3a01f3 以外が 22.2.x に入っています。第 4 回の abort（47bc9c3969）、第 2 回のリダイレクトの直し（refactor の 267064ca74 は入っていない）、値の検査（bf1602a916）、第 1 回の preload（0b9a52cc95）です。第 3 回の木の規則は同じで、`relativeRedirect` が足されただけです。

## 読み終えて

- `test/` の 249 件のうち、このシリーズの行は ng-routes\_spec（28）・route-tree\_spec（18）・router\_spec（6）・app\_spec（36）・promise\_spec（2）にある。
- spec は `setAngularAppTestingManifest` で、ビルドせずに JIT・zoneless のアプリを起動する。`routes` の無い manifest なので、取り出しの道を毎回通る。
- 木の照合はよく固まっていて、抜けは完全一致からの後戻りと decode の it。片付け（プラットフォームを壊す・聞き手を外す）は、消しても落ちない。
- issue はリダイレクトに集まり、origin/main でも作り替えが続いている。開いているのは照合の食い違い（#33555）と要望。
- このシリーズで見つけたものは、並びの順の食い違い、先頭の `*` の検査、`%` と decode の 2 つ、片付けの spec の抜け。

---

← 前: [manifest と renderAngular：ビルドの出力とサーバーの起動をつなぐ](04-srt-manifest-render.md)  
次: [子の作り方：FieldNodeStructure が値から子を作る](../sft/01-sft-structure.md) →
