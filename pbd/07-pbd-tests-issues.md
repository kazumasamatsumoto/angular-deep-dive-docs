[目次](../README.md) › [platform の説明文の読み残し](README.md) › 第 7 回 / 全 7 回

# spec と issue を読む：platform の説明文を固めているもの

> packages/platform-browser・platform-server・platform-browser-dynamic の test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか、手元での走らせ方と結果、issue の表と、このシリーズで見つけた食い違い。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-tests-issues)

---

この章で分かること：このシリーズの 6 回で読んだ `platform-browser`・`platform-server`・`platform-browser-dynamic` の説明文の約束を、本家の spec がどこで固めていて、どこを固めていないか。手元で 3 つのパッケージの spec を走らせた結果、開いている issue の表、そしてこのシリーズで見つけた説明と実装の食い違いと不具合の一覧です。

読む対象は `packages/platform-browser/test/`・`packages/platform-server/test/`・`packages/platform-browser-dynamic/test/` の spec と BUILD.bazel です（../angular、8576f161ae4）。spec の走らせ方の全体は[core の説明文の読み残し（2）の最終回](../cra/10-cra-tests-issues.md)と同じ形なので、ここではこの 3 つのパッケージの target だけを書きます。

1. [1. bootstrapApplication](01-pbd-browser.md)
2. [2. provideClientHydration](02-pbd-hydration.md)
3. [3. レンダラーとイベント](03-pbd-dom.md)
4. [4. Meta・Title・tools](04-pbd-meta-tools.md)
5. [5. platform-server](05-pbd-server.md)
6. [6. platform-browser-dynamic](06-pbd-dynamic.md)
7. **7. spec と issue**（この章）

> [!TIP]
> **新卒エンジニアへ**
>
> spec は「この振る舞いを変えたら落ちる」テストのことです。説明文の約束に spec が無ければ、誰かがその振る舞いを変えても気づけません。食い違いを直すときは、まず「今の振る舞いを固める spec」か「直したあとの振る舞いを固める spec」を足すところから始めます。

## 1. 走らせ方と件数

3 つのパッケージの test の target は、それぞれの `test/BUILD.bazel` にあります。`angular_jasmine_test` の `:test` は Node の上で、`ng_web_test_suite` の `:test_web` は headless の Chromium で走ります（`bazel query 'tests(//packages/platform-browser/test/...)'` で `test_web_chromium`・`test_web_firefox`・`test_web_debug` が出る）。platform-server には web の suite が無く、代わりに zone.js を読まない `zoneless_jasmine_test` の `:event_replay_test` があります。

📄 `走らせたコマンド`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test \
    //packages/platform-browser/test:test \
    //packages/platform-browser/test:test_web_chromium \
    //packages/platform-server/test:test \
    //packages/platform-server/test:event_replay_test \
    //packages/platform-browser-dynamic/test:test \
    //packages/platform-browser-dynamic/test:test_web_chromium \
    --nocache_test_results --test_output=all
$ pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<名前>"         # Node の jasmine だけ効く
```

📄 `結果（手元の bazel、2026-11-22）`

```
//packages/platform-browser/test:test                     159 specs, 0 failures, 3 pending specs
//packages/platform-browser/test:test_web_chromium        253 passed, 0 failed, 5 skipped
//packages/platform-server/test:test                      399 specs, 0 failures
//packages/platform-server/test:event_replay_test         23 specs, 0 failures
//packages/platform-browser-dynamic/test:test             9 specs, 0 failures
//packages/platform-browser-dynamic/test:test_web_chromium 17 passed, 0 failed
Executed 6 out of 6 tests: 6 tests pass.（2026-11-22）
```

Node の suite では、`isBrowser` が偽の spec は describe ごと入りません。platform-browser-dynamic の Node の 9 specs は metadata overrider の 9 つだけで、`ResourceLoaderImpl` の 2 つの it は web の 17 の中にあります。`--test_arg=--filter=<名前>` は Node の jasmine には効き、web の suite には効きません（絞り込みが 0 件でも PASSED になるので、specs の数を見ます）。

## 2. 説明文の約束を固めている spec と、固めていない所

第 1〜4 回（platform-browser）の spec は、それぞれの章の「テストと直し方」に表があります。ここでは、説明文の約束ごとに「固めている it」と「固めていない所」を 1 行にまとめ、第 5・6 回の分は spec の行を引いて読みます。

📄 `angular/packages/platform-server/test/integration_spec.ts` L209–223 （▶ の行: 211, 213, 216, 219, 221）

```ts
209 │ const MultiRenderHookProviders = [
210 │   {
211 ▶     provide: BEFORE_APP_SERIALIZED,
212 │     useFactory: getTitleRenderHook,
213 ▶     multi: true,
214 │     deps: [DOCUMENT],
215 │   },
216 ▶   {provide: BEFORE_APP_SERIALIZED, useValue: exceptionRenderHook, multi: true},
217 │   {
218 │     provide: BEFORE_APP_SERIALIZED,
219 ▶     useFactory: getMetaRenderHook,
220 │     multi: true,
221 ▶     deps: [DOCUMENT],
222 │   },
223 │ ];
```

📄 `angular/packages/platform-server/test/integration_spec.ts` L1148–1170 （▶ の行: 1152, 1157, 1163, 1166–1168）

```ts
1148 │           it(
1149 │             'should call multiple render hooks' +
1150 │               `(standalone:${isStandalone}, zoneless:${zoneless})`,
1151 │             async () => {
1152 ▶               const consoleSpy = spyOn(console, 'error');
1153 │               const options = {document: doc};
1154 │               const bootstrap = isStandalone
1155 │                 ? renderApplication(
1156 │                     getStandaloneBootstrapFn(MyServerAppStandalone, MultiRenderHookProviders),
1157 ▶                     options,
1158 │                   )
1159 │                 : renderModule(MultiRenderHookModule, options);
1160 │               const output = await bootstrap;
1161 │               // title should be added by the render hook.
1162 │               expect(output).toBe(
1163 ▶                 '<html><head><title>RenderHook</title><meta name="description"></head>' +
1164 │                   '<body><app ng-version="0.0.0-PLACEHOLDER" ng-server-context="other">Works!</app></body></html>',
1165 │               );
1166 ▶               // Errors from callbacks are forwarded to ErrorHandler (console.error by default)
1167 ▶               // rather than swallowed silently or thrown.
1168 ▶               expect(consoleSpy).toHaveBeenCalled();
1169 │             },
1170 │           );
```

第 5 回の `BEFORE_APP_SERIALIZED` は、この it が「順に呼ぶ」「1 つが投げても HTML を作る」「投げたものは `ErrorHandler`（既定は console.error）に届く」を固めています。216 行目の `exceptionRenderHook` が投げる役で、1166〜1168 行目のコメントのとおり、`ErrorHandler` に渡すようになったのは 76235803784（2026-04-10）からです。固めていないのは、第 5 回の DEMO で見た「`multi` を付け忘れたときの例外」と「TransferState を書く関数を `provideServerRendering()` の後ろに並べると値が出ない」です。

📄 `angular/packages/platform-server/test/transfer_state_spec.ts` L54–84 （▶ の行: 54, 64, 77, 80–81）

```ts
54 ▶   it('cannot break out of <script> tag in serialized output', async () => {
55 │     const STATE_KEY = makeStateKey<string>('testString');
56 │ 
57 │     @Component({
58 │       selector: 'esc-app',
59 │       template: 'Works!',
60 │       standalone: false,
61 │     })
62 │     class EscapedComponent {
63 │       constructor(private transferStore: TransferState) {
64 ▶         this.transferStore.set(STATE_KEY, '</script><script>alert(\'Hello&\' + "World");');
65 │       }
66 │     }
67 │     @NgModule({
68 │       bootstrap: [EscapedComponent],
69 │       declarations: [EscapedComponent],
70 │       imports: [BrowserModule, ServerModule],
71 │     })
72 │     class EscapedTransferStoreModule {}
73 │ 
74 │     const output = await renderModule(EscapedTransferStoreModule, {
75 │       document: '<esc-app></esc-app>',
76 │     });
77 ▶     expect(output).toBe(
78 │       '<html><head></head><body><esc-app ng-version="0.0.0-PLACEHOLDER" ng-server-context="other">Works!</esc-app>' +
79 │         '<script id="ng-state" type="application/json">' +
80 ▶         `{"testString":"\\u003C\\u002Fscript>\\u003Cscript>alert('Hello&' + \\"World\\");"}` +
81 ▶         '</script></body></html>',
82 │     );
83 │   });
84 │ 
```

TransferState の `<script>` の形と逃がし（`<` と `/` を `\u003C`・`\u002F`）は、80〜81 行目の期待値がそのまま固めています。第 5 回の記録の `<script id="ng-state" type="application/json">` と同じ形です。`ServerModule` と `provideServerRendering()` の両方を置いたときに 2 個できることは、警告の it（integration\_spec.ts の 1499）が警告だけを確かめていて、`<script>` の数は見ていません。

📄 `angular/packages/platform-server/test/platform_location_spec.ts` L35–51 （▶ の行: 36, 38, 41, 47–49）

```ts
35 │     it('is configurable via INITIAL_CONFIG', async () => {
36 ▶       const platform = platformServer([
37 │         {
38 ▶           provide: INITIAL_CONFIG,
39 │           useValue: {
40 │             document: '<app></app>',
41 ▶             url: 'http://test.com/deep/path?query#hash',
42 │           },
43 │         },
44 │       ]);
45 │ 
46 │       const location = platform.injector.get(PlatformLocation);
47 ▶       expect(location.pathname).toBe('/deep/path');
48 ▶       expect(location.search).toBe('?query');
49 ▶       expect(location.hash).toBe('#hash');
50 │     });
51 │ 
```

`INITIAL_CONFIG` の `url` が `PlatformLocation` に入ることは、この it が固めています。`url` を渡さないときに `hostname` などが `'/'` のままになること（第 5 回の 4 節）を確かめる it はありません。

📄 `angular/packages/platform-browser-dynamic/test/resource_loader/resource_loader_impl_spec.ts` L11–37 （▶ の行: 12, 16–17, 23, 25, 30, 32）

```ts
11 │ 
12 ▶ if (isBrowser) {
13 │   describe('ResourceLoaderImpl', () => {
14 │     let resourceLoader: ResourceLoaderImpl;
15 │ 
16 ▶     const url200 = '/packages/platform-browser/test/browser/static_assets/200.html';
17 ▶     const url404 = '/bad/path/404.html';
18 │ 
19 │     beforeEach(() => {
20 │       resourceLoader = new ResourceLoaderImpl();
21 │     });
22 │ 
23 ▶     it('should resolve the Promise with the file content on success', (done) => {
24 │       resourceLoader.get(url200).then((text) => {
25 ▶         expect(text.trim()).toEqual('<p>hey</p>');
26 │         done();
27 │       });
28 │     }, 10000);
29 │ 
30 ▶     it('should reject the Promise on failure', (done) => {
31 │       resourceLoader.get(url404).catch((e) => {
32 ▶         expect(e).toEqual(`Failed to load ${url404}`);
33 │         done();
34 │         return null;
35 │       });
36 │     }, 10000);
37 │   });
```

第 6 回の `ResourceLoaderImpl` は、200 と 404 の 2 つだけです（12 行目のとおりブラウザーでだけ走る）。status 0 と 300 の扱い、`platformBrowserDynamic`・`JitCompilerFactory`・`COMPILER_OPTIONS` を名前で確かめる spec は、このパッケージにはありません。

| 回 | 説明文の約束 | 固めている spec（行） | 固めていない所 |
| --- | --- | --- | --- |
| 1 | bootstrapApplication の例（selector の無い Root）で描ける | platform-browser/test/browser/bootstrap\_standalone\_spec.ts の 7 つの it（27） | どの it も selector のあるルート。例の形（NG05104）は無い |
| 1 | context は省略できる。platformBrowser() は今の platform を返す | bootstrap\_spec.ts `should reuse existing platform`（277、platform が先の順） | bootstrapApplication のあとの platformBrowser()（開発モードの NG0400）。サーバーで context が必須なこと |
| 1 | provideProtractorTestingSupport | なし（core の testability\_spec.ts が USE\_PENDING\_TASKS を直接 provide、L137） | usePendingTasksForStability |
| 2 | with\* の組み合わせ。矛盾は例外 | platform-browser/test/hydration\_spec.ts `provideClientHydration`（31）、`incremental hydration conflicts`（173） | 転送キャッシュの組の例外、本番では黙って片方が勝つこと |
| 2 | withEventReplay で再生が入る | platform-server/test/incremental\_hydration\_spec.ts `hydrate on interaction`（818）ほか | 引数なしの provideClientHydration() でも jsaction が付くこと（event\_replay\_spec.ts に無い） |
| 3 | KeyEventsPlugin のキーの名前と戻り値 | platform-browser/test/dom/events/key\_events\_spec.ts（21・103・234 ほか） | addEventListener の戻り値（外す関数）を呼ぶ it |
| 3 | EVENT\_MANAGER\_PLUGINS で自分のプラグインを足す | events/event\_manager\_spec.ts（45 ほか、web だけ） | 置き場所（コンポーネントの providers では効かない） |
| 3 | addBaseHrefToCssSourceMap | dom\_renderer\_spec.ts（598 の 7 つ、355） | `../` と 2 つ目の map |
| 4 | Meta の selector・updateTag・addTag | platform-browser/test/browser/meta\_spec.ts（23 の it、140・288・318） | バッククォートの selector、name も property も無い定義の addTag |
| 4 | enableDebugTools の timeChangeDetection | browser/tools/tools\_spec.ts（46・50、tick は spy） | 何を測るか（zoneless の本番では 0 回の検査） |
| 5 | renderApplication・renderModule が描いて文字列を返す。document は文字列か Document | integration\_spec.ts `using renderApplication should work`（809）・`should allow passing a document reference`（818） | 説明文の例（utils.ts L316〜326）。bootstrap に渡るものの形。document を省いたときの NG05104 |
| 5 | BEFORE\_APP\_SERIALIZED を文字列にする直前に呼ぶ | integration\_spec.ts `should call render hook`（1129）ほか 4 つ | multi の付け忘れ、TransferState との順、platform に置いた関数 |
| 5 | TransferState を 1 つの script に書く | transfer\_state\_spec.ts（29・54・85）、integration\_spec.ts（950・1499） | 2 重の登録で script が 2 個になること |
| 5 | provideServerRendering の例 | なし | 例が BootstrapContext 無しで NG0401 になること |
| 5 | DominoAdapter.getGlobalEventTarget（「Ivy では使われない」） | なし | Renderer2.listen('window') がサーバーで動くこと |
| 6 | ResourceLoaderImpl が XHR で読む | resource\_loader\_impl\_spec.ts（23・30、web だけ）、testing\_public\_browser\_spec.ts（58・175、web だけ） | status 0・300、onerror |
| 6 | JitCompilerFactory・platformBrowserDynamic | なし | createCompiler の options が効かないこと、引数なしの new |

## 3. issue の表

2026-11-22 に、label が `area: platform-browser`・`area: server`・`core: hydration` の開いている issue を読みました（読むだけ）。`area: platform-browser` の開いている issue は 0 件で、`area: server` が 18 件、`core: hydration` が 8 件です。このシリーズで読んだ行に関係するものを挙げます。

| 番号 | 題 | 状態・label | このシリーズとの関係 |
| --- | --- | --- | --- |
| #71971 | Hydration writes every static attribute and binding again, even when the server rendered t… | 開、area: server（2026-11） | 第 2 回。provideClientHydration のハイドレーションの中身（このシリーズでは機能の組み合わせだけ読んだ） |
| #52477 | Static attributes are not hydrated, causing refetching of external resources | 開、core: hydration | 第 2 回と同じ所 |
| #61231 | Components created with createComponent function are not being hydrated properly | 開、core: hydration | 第 1 回の createApplication で作るアプリと第 2 回のハイドレーション |
| #59144 | Support application-level providers in server rendering utilities | 開、area: server（2024-12） | 第 5 回 2 節。`renderApplication`・`renderModule` の options は platform の provider（`platformProviders`・`extraProviders`）だけ |
| #51549 | Add render timeout to \`renderModule\` and \`renderApplication\` functions | 開、feature: under consideration | 第 5 回 1・3 節。options に時間の上限が無い |
| #33642 | renderModuleFactory does not reject when error is thrown in application | 開、type: bug/fix、P2（2019） | 第 5 回 6 節。BEFORE\_APP\_SERIALIZED の失敗は ErrorHandler に渡り、reject しない（記録のとおり） |
| #67016 | Add support for onRetrive/onSerialize for the whole json on TransferState | 開、area: server | 第 5 回 5 節。`onSerialize` はキーごとで、`toJson` 全体には手を入れられない |
| #69388 | Provide diagnostics when HTTP response bodies approach maxResponseBodySize | 開、area: server・common/http | 第 5 回 7 節の `maxResponseBodySize`（既定 1 MB、0 は無視） |
| #48205 | Log an error when Domino code is in a client bundle | 開、feature: in backlog | 第 5 回 8 節の DominoAdapter |
| #72139 | fix(core): safely handle server platform destruction on aborted SSR requests | 開いている PR（2026-11-21） | utils.ts を変える。第 5 回の `renderApplication` の片付け（L377）の周り |
| #69260 | platformServer().onDestroy resets ngServerMode to undefined after every render… | 閉（2026-06） | 第 5 回 7 節。答えは「ngServerMode はビルドのときの定数」 |

第 5 回・第 6 回で見つけた食い違い（`renderApplication` の例と bootstrap の引数、`provideServerRendering` の例、`getGlobalEventTarget` のコメント、NG05102 の文の `null`、`JitCompilerFactory` の引数なしの new、`ResourceLoaderImpl` の 300）は、`gh search issues` で開いた issue も閉じた issue も見つかりませんでした（2026-11-22）。

## 4. このシリーズで見つけたもの（食い違いと不具合）

どれも 8576f161ae4 の行を読み、本物のパッケージ（サイトの @angular/core・platform-browser・platform-server 22.2.6 と、npm pack で取った platform-browser-dynamic 22.2.6）をページか Node で動かした記録か、説明文の例をそのまま取り出したファイルの型検査（strict の tsc）で確かめたものです。「main」は ../angular の origin/main（d201dd76ef2）で、直っていなければ「main 同じ」と書きました。

| 回 | 何が起きるか | 行（8576f161ae4） | 確かめ方と main |
| --- | --- | --- | --- |
| 1 | （例）例 `@Component({template: 'Hello world!'}) class Root {}; await bootstrapApplication(Root)` で描ける → selector が無いので ng-component を探し NG05104 で reject（Node の記録、dev/prod とも）。strict の ngc は通る。5771b18a989 から selector が無く、85122cb12d3 でも足されなかった | platform-browser/src/browser.ts L72〜77 | main 同じ |
| 1 | （説明）context は「省略できる」、SSR のような上級の使い方に役立つ → ngServerMode では context なしだと NG0401 Missing Platform（create\_application.ts L47〜54、28926ba92cf 以降）。サーバーでは必須 | browser.ts L116〜118・L148〜150 | main 同じ |
| 1 | （実装）（説明なし）platformBrowser() は今の platform を返す → createApplication / bootstrapApplication のあとに platformBrowser() を呼ぶと、開発モードは NG0400「A platform with a different configuration has been created.」、本番は今の platform。createOrReusePlatformInjector が factory の印のトークンを置かないため。逆の順は spec（bootstrap\_spec.ts L277）がある | core/src/platform/platform.ts L172〜194（createOrReusePlatformInjector）と L80〜93・L123〜131 | main 同じ |
| 1 | （説明）provideProtractorTestingSupport の説明に options が無い → `usePendingTasksForStability`（9f479ae9641 で追加）を渡すと 4 つ目が ɵUSE\_PENDING\_TASKS。zoneless で false を渡すと保留があっても isStable() が true。spec は platform-browser に無い | browser.ts L185〜198 | main 同じ |
| 1 | （古い）BrowserModule は「CLI の new で作ったすべてのアプリに既定で入る」→ CLI の application schematic は standalone の既定が true（ac0db66975、2023-09-21）。BrowserModule は --standalone=false のときだけ。3f55aa609f6（2016）のまま | browser.ts L287〜289 | main 同じ |
| 1 | （説明（小））JIT のリソースの失敗は「記録して bootstrap を止めない」→ console.error のあと、ルートを作る所で「Component 'X' is not resolved」で reject（Node の JIT の記録） | browser.ts L179 | main 同じ |
| 2 | （説明（書式））既定の機能の 3 つ目の項目 → 先頭の `*` が無く、Markdown では前の HttpClient の項目に続く（0454d4ced7e で追加） | platform-browser/src/hydration.ts L202 | main 同じ |
| 2 | （説明）withEventReplay は「イベントの再生を有効にする」機能。既定の一覧に再生は無い → 既定のインクリメンタル（L289〜291 の ɵwithIncrementalHydration、core api.ts L337）が withEventReplay を入れる。platform-server の HTML は provideClientHydration() と (withEventReplay()) で 1 字も違わない。効くのは withNoIncrementalHydration と一緒のときだけ | hydration.ts L195〜202・L209・L111〜113 | main 同じ |
| 2 | （実装）（説明なし）矛盾する組み合わせは例外 → 検査は開発モードだけ。本番では NoHttp+Options は Options が、Inc+NoInc は Inc が黙って勝つ（provider の表と platform-server の本番の HTML で確認）。転送キャッシュの組の例外の spec は無い | hydration.ts L262〜278 | main 同じ |
| 2 | （古い）NgModule の例 → v22 の既定の @Component の RootCmp では NG6008・NG6009。standalone: false で通る | hydration.ts L222〜231 | main 同じ |
| 3 | （説明）addEventListener は「登録したキーのイベント」を返す → 外す関数（onAndCancel の戻り値）。ページで typeof が function、呼ぶと鳴らない。23a98b9e513（2018）から | platform-browser/src/dom/events/key\_events.ts L75 | main 同じ |
| 3 | （説明（小））@param doc「キーのイベントを捕まえる文書」→ super(doc) に渡すだけで使われない（event\_manager\_plugin.ts L23〜24 の TODO） | key\_events.ts L53〜54 | main 同じ |
| 3 | （説明（小））@param zone「イベントが起きた zone」→ handler を runGuarded で呼ぶ zone（L191） | key\_events.ts L185 | main 同じ |
| 3 | （例）`(keydown.code.alt.shiftleft)` は Alt と左 Shift に当たる → 鳴らない（shiftKey も true なので code.alt.shift.shiftleft になる。ページの合成イベントで確認） | adev/src/content/guide/templates/event-listeners.md L95〜96 | 直った（2e4e1214cc6、2026-10-26） |
| 3 | （古い）例 `ng.probe` → ng\_probe.ts と exportNgVar('probe') は e57d5db0458（2023-03-02）で削除。今の呼び出し元は enableDebugTools / disableDebugTools だけ | platform-browser/src/dom/util.ts L14〜15 | main 同じ |
| 3 | （説明（不足））（置き場所の説明なし）→ コンポーネントの providers の EVENT\_MANAGER\_PLUGINS は使われない（supports が呼ばれず、名前は DomEventsPlugin がそのまま付ける。例外も警告も無い）。アプリの providers なら効く（ページで確認） | event\_manager.ts L24〜25・event\_manager\_plugin.ts L15〜16 | main 同じ |
| 3 | （説明（不足））baseHref を sourceMappingURL の前に付ける → 開発モードだけ（L581・L664）。../ を解決して pathname を書く（/app/ の外に出る）、L50 の正規表現に g が無く 2 つ目は直さない、/ と https: は飛ばす（説明に無い） | dom\_renderer.ts L115〜159（addBaseHrefToCssSourceMap） | main 同じ |
| 4 | （説明）selector の形 ``"tag_attribute=`value string`"`` → その形の ``meta.getTag('name=`viewport`')`` は Chrome で querySelector の SyntaxError（Meta は捕まえない）。Markdown のコード表示も崩れる。886e3ebcca9（2020-05-18）、同じコミットの L49・L99・L111 は 'value string' | platform-browser/src/browser/meta.ts L124・L143 | main 同じ |
| 4 | （説明（不足））updateTag は「既にある要素を書き換え」「書き換えた要素を返す」→ 無ければ作って返す（L137）。spec の should create meta tag if it does not exist（meta\_spec.ts L140）が固めている | meta.ts L121・L127 | main 同じ |
| 4 | （実装）addTag/addTags は探して、あれば返す → name も property も無い定義（charset・http-equiv・itemprop）は property="undefined" で探して見つからず、毎回作る。このページの本物の head で &lt;meta charset&gt; が 1 → 2 | meta.ts L67〜71・L83〜85、L201〜204（parseSelector） | main 同じ |
| 4 | （説明）timeChangeDetection は今の画面の 1 回の変更検知の平均 → zoneless の本番は何も検査しない tick（200 個の Eager の子の評価 0 回、0.00 ms）、開発モードは checkNoChanges の分だけ（200 回/tick）。zone.js の本番は 200 回/tick で説明どおり（Node の記録）。tools\_spec は tick が spy | browser/tools/common\_tools.ts L31〜34 | main 同じ |
| 4 | （説明（綴り））Enabled Angular debug tools → Enables の綴りの誤り | browser/tools/tools.ts L18 | main 同じ |
| 4 | （説明（補足））特定の文脈で安全な値の印 → 中身の無い interface で、ただの文字列も SafeHtml の型に入る（core の同じ型は cra-sanitize が先に書いた）。区別は実行時の class | security/dom\_sanitization\_service.ts L35〜75 | main 同じ |
| 5 | （例の誤り）`renderApplication` の例が `appConfig` を宣言して `config` を渡す（TS2304）。`renderApplication(bootstrap)` は 2 つ目の引数が無く TS2554。`[...]` は省略の印（TS1109） | platform-server/src/utils.ts 316〜326 | strict の tsc。config は 28926ba92cf（2025-09）から、1 引数は b5278cc115e（2023-02）から。main 同じ |
| 5 | （説明文の誤り）bootstrap の関数は「Injector のインスタンスで呼ぶ」とあるが、渡るのは `{platformRef}`（BootstrapContext） | utils.ts 328〜330（実装は L362） | Node の記録（`instanceof Injector` が false）。28926ba92cf から。main 同じ |
| 5 | （例が動かない）`provideServerRendering` の例が `bootstrapApplication(AppComponent, {providers: [provideServerRendering()]})` で、BootstrapContext が無く NG0401 | platform-server/src/provide\_server.ts 22〜27・35〜37 | Node の記録。CLI のサーバーのビルドでも ngServerMode は true。main 同じ |
| 5 | （古いコメント）`createServerPlatform` の「ngJitMode で JIT 付きかを決める」。その枝は無い | utils.ts 51〜54 | 06452af31fb（2023-04）で枝が消えた。main 同じ |
| 5 | （コメントの誤り）`DominoAdapter.getGlobalEventTarget` の「@deprecated Ivy ではもう使われない。v14 で消す」。`Renderer2.listen('window' \| 'document' \| 'body', …)` が今も呼ぶ | platform-server/src/domino\_adapter.ts 71〜83、platform-browser/src/dom/dom\_renderer.ts 486〜487 | Node の記録（サーバーで listen が動く）。6581a1b48dc（2021-04）の EventManagerPlugin の非推奨との取り違え。main 同じ |
| 5 | （不具合、例外の文）対象が文字列の `Renderer2.listen` で対象が見つからないと、NG05102 が「Unsupported event target null for event …」と、渡した名前でなく `null` を言う | platform-browser/src/dom/dom\_renderer.ts 487〜493 | Node の記録（開発モード）。L487 で target を上書きしてから文を作る。issue なし。main 同じ |
| 5 | （説明不足）`document` を省くと空の文書でルートが無く NG05104。渡した Document は描いたあとルートが外れ、2 回目は NG05104。`platformProviders` の `INITIAL_CONFIG` が `document` より勝つ。url の無い `PlatformLocation` は hostname などが `'/'` | utils.ts 331〜336・L61〜70、tokens.ts 17〜26、location.ts 28〜32 | Node の記録。main 同じ |
| 5 | （説明不足）BEFORE\_APP\_SERIALIZED は multi が要る（無いと「Cannot mix…」か「callbacks is not iterable」）。TransferState を書く関数は provideServerRendering より前に並べないと出ない。platform に置いた関数はアプリにも同じトークンがあると呼ばれない。ServerModule と provideServerRendering の両方で ng-state が 2 個 | tokens.ts 36〜44、utils.ts 208〜211、transfer\_state.ts 54〜68 | Node の記録（開発・本番）。main 同じ |
| 5 | （説明不足）`provideServerRendering()` は呼んだだけで global の ngServerMode を true にし戻さない。`maxResponseBodySize: 0` は無視されて 1 MB。上限を外す null は渡せない | provide\_server.ts 32〜42 | Node の記録。ビルドした JS では ngServerMode は定数（#69260）。main 同じ |
| 6 | （型と実行）`JitCompilerFactory` の .d.ts にコンストラクターが無く `new JitCompilerFactory()` が型検査に通るが、実行は TypeError「defaultOptions is not iterable」 | platform-browser-dynamic/src/compiler\_factory.ts 31〜37 | strict の tsc と Node の記録。main 同じ |
| 6 | （説明のとおり何もしない）`createCompiler` の options（defaultEncapsulation・preserveWhitespaces）は効かない。`CompilerFactory` を inject する行は無い | compiler\_factory.ts 22〜60 | Node の記録。8c71b9fc42e（2021-11）から。main 同じ |
| 6 | （非推奨の文の不足）「代わりに platformBrowser」は、CLI を使わない JIT で templateUrl のある NgModule を bootstrapModule するときだけ同じに動かない（「is not resolved」）。COMPILER\_OPTIONS は bootstrapApplication では読まれない | platform\_providers.ts 21〜39、core の application\_ngmodule\_factory\_compiler.ts 50〜58 | Node の記録。a4e2139620e（2025-04）の文。main 同じ |
| 6 | （説明に無い）`ResourceLoaderImpl` は status 300 を成功、0 で本文ありを成功にする。本番では platformBrowser のあとの platformBrowserDynamic が黙って今の platform を返し、ResourceLoader が置かれない | resource\_loader/resource\_loader\_impl.ts 32〜39 | Node の記録。746f85a621a（2015）から。main 同じ |

## 聞かれそうな質問

**Q. platform-server の spec はブラウザーで走りますか？**

走りません。`angular_jasmine_test` の `:test`（Node、399 specs）と、zone.js を読まない `:event_replay_test`（23 specs）だけで、domino の上で動きます。

**Q. `--test_arg=--filter` で 0 件のとき、PASSED と出たら通ったことになりますか？**

なりません。0 件でも PASSED です。Node の jasmine なら「N specs」の数を見ます。web の suite には filter が効きません。

**Q. platform-browser-dynamic の `ResourceLoaderImpl` の spec が Node の結果に出ないのはなぜですか？**

spec が `if (isBrowser)` の中にあるからです（resource\_loader\_impl\_spec.ts の 12 行目）。`:test_web_chromium` の 17 passed の中で走っています。

**Q. このシリーズで一番多かった食い違いの形は何ですか？**

説明文の例が今の既定で動かないものです。selector の無い bootstrapApplication の例（第 1 回、NG05104）、NgModule の例（第 2 回、NG6008）、renderApplication の例（第 5 回、TS2304・TS2554）、provideServerRendering の例（第 5 回、NG0401）。どれも例を型検査や実行で確かめる spec がありません。

**Q. 開発モードと本番で振る舞いが違ったものは？**

provideClientHydration の矛盾する組み合わせ（第 2 回、本番は黙って片方が勝つ）、bootstrapApplication のあとの platformBrowser()（第 1 回）と platformBrowser のあとの platformBrowserDynamic()（第 6 回、本番は今の platform を返す）、BEFORE\_APP\_SERIALIZED の multi の付け忘れの例外の文（第 5 回）です。

## 読み終えて

- 3 つのパッケージの 6 つの target は、手元の bazel で全部通った（platform-server 399・platform-browser 159 と web 253 ほか）。
- 説明文の例（renderApplication・provideServerRendering ほか）を型検査や実行で確かめる spec は無く、食い違いの多くは例と説明文の文の中にある。
- 開発モードだけの確かめ（assertPlatform・provideClientHydration の組み合わせ）は、本番では黙って進む。説明文はその差を書いていない。
- 見つけた食い違いに、開いている issue は見つからなかった。直すときは、2 節の「固めていない所」に spec を足すところから。

---

← 前: [platform-browser-dynamic の説明文：JIT の platform と ResourceLoader](06-pbd-dynamic.md)
