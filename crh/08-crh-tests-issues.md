[目次](../README.md) › [core の説明文の読み残し（3）](README.md) › 第 8 回 / 全 8 回

# spec と issue を読む：core の説明文（3）を固めているもの

> packages/core/test と platform-server の spec が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、area: core・core: hydration・core: defer の issue の表と、このシリーズで見つけた食い違い。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crh-tests-issues)

---

この章で分かること：このシリーズの 7 回で読んだ core の説明文（ハイドレーション・@defer・resource・Renderer2・開発用の小道具）の約束を、本家の spec がどこで固めていて、どこを固めていないか。手元で spec を走らせた結果、開いている issue の表、そしてこのシリーズで見つけた説明と実装の食い違いと不具合の一覧です。

読む対象は `packages/core/test/`（`resource/`・`acceptance/`・`util/`・`bundling/image-directive/`）と `packages/platform-server/test/` の spec と BUILD.bazel です（../angular、8576f161ae4）。走らせ方の全体（Node の jasmine と web の suite の違い、`--test_arg=--filter` の効き方）は[platform の説明文の最終回](../pbd/07-pbd-tests-issues.md)と同じなので、ここでは target と件数だけを書きます。

1. [1. ハイドレーションの公開 API と型](01-crh-hydration-api.md)
2. [2. ngh の書き出し](02-crh-hydration-annotate.md)
3. [3. ノードの探し方と不一致](03-crh-hydration-errors.md)
4. [4. @defer](04-crh-defer.md)
5. [5. resource()](05-crh-resource.md)
6. [6. Renderer2](06-crh-renderer.md)
7. [7. 開発用の小道具](07-crh-dev-utils.md)
8. **8. spec と issue**（この章）

> [!TIP]
> **新卒エンジニアへ**
>
> spec は「この振る舞いを変えたら落ちる」テストのことです。説明文の約束に spec が無ければ、誰かがその振る舞いを変えても気づけません。反対に、spec が説明文と逆のことを固めていることもあります（2 節の resource の reload）。そのときは、spec と実装のどちらが意図なのかを、入れた commit で確かめます。

## 1. 走らせ方と件数

ハイドレーションと @defer のハイドレーションの spec は platform-server の `:test`（Node の jasmine、サーバーで描いてから domino の上でハイドレートする）に、@defer のブラウザーの spec は core の `acceptance` に、resource は core の `resource` に、Renderer2 の実装の spec は platform-browser の web の suite に、画像の警告は core の `bundling/image-directive` の webdriver の e2e にあります。

📄 `走らせたコマンド`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test \
    //packages/core/test/resource:resource \
    //packages/core/test:test \
    //packages/core/test/acceptance:acceptance \
    //packages/platform-server/test:test \
    //packages/platform-server/test:event_replay_test \
    --nocache_test_results --test_output=all
$ pnpm bazel test //packages/platform-browser/test:test_web_chromium \
    //packages/core/test/acceptance:acceptance_web_chromium \
    //packages/core/test/bundling/image-directive:webdriver_tests \
    --nocache_test_results --test_output=all
$ pnpm bazel test <target> --nocache_test_results --test_output=all "--test_arg=--filter=<名前>"   # Node の jasmine だけ効く
$ pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=no hydration info in the TransferState" "--test_arg=--seed=46107"
```

📄 `結果（手元の bazel、2026-11-22）`

```
//packages/core/test/resource:resource                     70 specs, 0 failures
//packages/core/test:test                                 351 + 350 + 350 + 350 = 1401 specs（4 つの shard）, 0 failures, 8 pending
//packages/core/test/acceptance:acceptance               2693 specs, 0 failures, 3 pending specs
//packages/platform-server/test:test                      399 specs, 0 failures
//packages/platform-server/test:event_replay_test         23 specs, 0 failures
Executed 5 out of 5 tests: 5 tests pass.
//packages/platform-browser/test:test_web_chromium        253 passed, 0 failed, 5 skipped
//packages/core/test/acceptance:acceptance_web_chromium   2743 passed, 0 failed, 3 skipped
//packages/core/test/bundling/image-directive:webdriver_tests_chromium   14 specs, 0 failures

# 走る順を決めた 1 本（第 1 回で見つけたもの）
--filter=no hydration info in the TransferState --seed=46107
  2 specs, 1 failure
  Error: NG0401: Missing Platform: This may be due to using `bootstrapApplication` on the server without passing a `BootstrapContext`. …
```

最後の 1 本は、第 1 回で見つけた「走る順で落ちる spec」です（4 節の 7）。`--seed` を変えると通ることもあるので、順を決めて走らせています。

## 2. 説明文の約束を固めている spec と、固めていない所

各回の「テストと直し方」の表を、約束ごとに 1 行にまとめます。「固めていない所」は、このシリーズで食い違いや不具合を見つけた所とほとんど重なります。

| 回 | 約束 | 固めている it（ファイル 行） | 固めていない所 |
| --- | --- | --- | --- |
| 1 | TransferState に ngh が無いときの NG0505、client mode の印 | `should log a warning when there was no hydration info in the TransferState`（full\_app\_hydration\_spec.ts 6988）・`… but a client mode marker is present`（7026） | 7026 の it は走る順で落ちる（下の引用） |
| 1 | (mouseenter) には jsaction が付かない | `should not replay mouse events`（event\_replay\_spec.ts 687） | 「すべての DOM イベント」の説明文（event\_replay.ts 227〜228）の言い過ぎは固めていない |
| 2 | ルートの ViewContainerRef の `\|`、根の数に 2 を足す | `root component as an anchor` の 3 つ（full\_app\_hydration\_spec.ts 1208 ほか） | テキストの印 `ngetn` の空白の扱い（utils.ts 249〜250 と L283） |
| 3 | NG0500 の文の形 | `should handle text node mismatch`（6143）・`should handle element node mismatch`（6215） | 空白を含む属性やテキストの文（stripNewlines が空白を消す）、壊れた ngh の番号の本番の TypeError |
| 4 | 各トリガー・prefetch・minimum と after | `@defer`（defer\_spec.ts 253）の `prefetch`（1735）・`viewport triggers`（4085）ほか | 根がテキストだけのブロックの hydrate on timer ほか（triggering.ts L669〜674）、DevTools の viewport の名前 |
| 5 | `reload()` の直後の状態 | `should synchronously change states`（resource\_spec.ts 662、下の引用） | spec は説明文（api.ts L156〜157）と逆を固めている。`stream` が `undefined` を返す it は無い |
| 6 | `!important` のスタイル | `should set !important on a single property`（styling\_spec.ts 893）・`… on a dash-case property`（932、下の引用） | camelCase の名前の `[style]` の map（dom\_renderer.ts L443 で何も書かれない） |
| 6 | setAttribute の namespace | `setAttribute › with namespace`（dom\_renderer\_spec.ts 35〜62） | URI を渡したとき（`createElement` は通る） |
| 6 | animate.enter の検査 | `Animation`（animation\_spec.ts 49） | `<ng-container animate.enter>` と、queue の中で投げたあと |
| 7 | stringify の補助の関数 | `stringify`（stringify\_spec.ts 10、下の引用） | `truncateMiddle` の長さ |
| 7 | 画像の 2 つの警告 | `should log a warning when a LCP image is loaded lazily`（image-perf-warnings-lazy.e2e-spec.ts 24、下の引用）ほか 2 つ | `object-fit: cover`・`ng-img` を除くこと |
| 7 | SSR の 🅰️ の印 | 無し | ハイドレーション無しで残る 2 つの mark |

📄 `angular/packages/core/test/resource/resource_spec.ts` L662–689 （▶ の行: 662, 672, 674, 683–685）

```ts
662 ▶   it('should synchronously change states', async () => {
663 │     const request = signal<number | undefined>(undefined);
664 │     const backend = new MockEchoBackend();
665 │     const echoResource = resource({
666 │       params: request,
667 │       loader: (params) => backend.fetch(params.params),
668 │       injector: TestBed.inject(Injector),
669 │     });
670 │     // Idle to start.
671 │     expect(echoResource.status()).toBe('idle');
672 ▶     // Switch to loading state should be synchronous.
673 │     request.set(1);
674 ▶     expect(echoResource.status()).toBe('loading');
675 │     // And back to idle.
676 │     request.set(undefined);
677 │     expect(echoResource.status()).toBe('idle');
678 │     // Allow the load to proceed.
679 │     request.set(2);
680 │     TestBed.tick();
681 │     await backend.flush();
682 │     expect(echoResource.status()).toBe('resolved');
683 ▶     // Reload state should be synchronous.
684 ▶     echoResource.reload();
685 ▶     expect(echoResource.status()).toBe('reloading');
686 │     // Back to idle.
687 │     request.set(undefined);
688 │     expect(echoResource.status()).toBe('idle');
689 │   });
```

672〜674 行目は `params` を変えた直後に `loading`、683〜685 行目は `reload()` の直後に `reloading` を期待します。どちらも `TestBed.tick()` の前、つまり `loader` が呼ばれる前です。説明文（api.ts L156〜157）の「要求が出るまで reloading にならない」とは逆で、[第 5 回](05-crh-resource.md)の 3 節のとおり、実装と spec は 01fffdb5477（2024-12-02）で「同期で変わる」に揃いました。説明文の側を直すのが筋です。

📄 `angular/packages/core/test/acceptance/styling_spec.ts` L932–951 （▶ の行: 932, 934, 943, 949）

```ts
932 ▶   it('should set !important on a dash-case property', () => {
933 │     @Component({
934 ▶       template: '<div [style.margin-right]="marginRight"></div>',
935 │ 
936 │       changeDetection: ChangeDetectionStrategy.Eager,
937 │     })
938 │     class Cmp {
939 │       marginRight!: string;
940 │     }
941 │ 
942 │     const fixture = TestBed.createComponent(Cmp);
943 ▶     fixture.componentInstance.marginRight = '5px !important';
944 │     fixture.detectChanges();
945 │     const html = fixture.nativeElement.innerHTML;
946 │ 
947 │     // We have to check the `style` attribute, because `element.style.prop` doesn't include
948 │     // `!important`. Use a regex, because the different renderers produce different whitespace.
949 ▶     expect(html).toMatch(/style=["|']margin-right:\s*5px\s*!important/);
950 │   });
951 │ 
```

`!important` の it は、名前が 1 語（`width`、893）か dash-case（`margin-right`、934 行目）か、文字列の `[style]`（952）です。[第 6 回](06-crh-renderer.md)の 5 節の「map の camelCase の名前に `!important`」は、この 3 つのどれにも入りません。

📄 `angular/packages/core/test/util/stringify_spec.ts` L10–35 （▶ の行: 10, 17, 30–31）

```ts
10 ▶ describe('stringify', () => {
11 │   it('should return string undefined when toString returns undefined', () =>
12 │     expect(stringify({toString: (): any => undefined})).toBe('undefined'));
13 │ 
14 │   it('should return string null when toString returns null', () =>
15 │     expect(stringify({toString: (): any => null})).toBe('null'));
16 │ 
17 ▶   describe('concatStringsWithSpace', () => {
18 │     it('should concat with null', () => {
19 │       expect(concatStringsWithSpace(null, null)).toEqual('');
20 │       expect(concatStringsWithSpace('a', null)).toEqual('a');
21 │       expect(concatStringsWithSpace(null, 'b')).toEqual('b');
22 │     });
23 │ 
24 │     it('should concat when empty', () => {
25 │       expect(concatStringsWithSpace('', '')).toEqual('');
26 │       expect(concatStringsWithSpace('a', '')).toEqual('a');
27 │       expect(concatStringsWithSpace('', 'b')).toEqual('b');
28 │     });
29 │ 
30 ▶     it('should concat when not empty', () => {
31 ▶       expect(concatStringsWithSpace('before', 'after')).toEqual('before after');
32 │     });
33 │   });
34 │ });
35 │ 
```

stringify\_spec.ts の 5 つの it は `stringify` と `concatStringsWithSpace` だけで、同じファイルの `truncateMiddle` の it はありません（[第 7 回](07-crh-dev-utils.md)の 5 節）。

📄 `angular/packages/core/test/bundling/image-directive/e2e/image-perf-warnings-lazy/image-perf-warnings-lazy.e2e-spec.ts` L12–40 （▶ の行: 12, 24, 33, 35, 38, 40）

```ts
12 ▶ describe('Image performance warnings (lazy)', () => {
13 │   let driver: webdriver.WebDriver;
14 │   let baseUrl: string;
15 │ 
16 │   beforeAll(async () => {
17 │     ({driver, baseUrl} = await createWebDriver());
18 │   });
19 │ 
20 │   afterAll(async () => {
21 │     await driver.quit();
22 │   });
23 │ 
24 ▶   it('should log a warning when a LCP image is loaded lazily', async () => {
25 │     await driver.get(`${baseUrl}/e2e/image-perf-warnings-lazy`);
26 │     // Verify that both images were rendered.
27 │     const imgs = await driver.findElements(webdriver.By.css('img'));
28 │     let srcA = await imgs[0].getAttribute('src');
29 │     expect(srcA.endsWith('a.png')).toBe(true);
30 │     let srcB = await imgs[1].getAttribute('src');
31 │     expect(srcB.endsWith('b.png')).toBe(true);
32 │ 
33 ▶     // Make sure that only one LCP performance warning is in the console for image `a.png`,
34 │     // since `b.png` should be below the fold and not treated as an LCP element.
35 ▶     const logs = await waitForBrowserLogs(driver, webdriver.logging.Level.WARNING, 1, 10000, (l) =>
36 │       l.message.includes('NG0913'),
37 │     );
38 ▶     expect(logs.length).toEqual(1);
39 │     // Verify that the error code and the image src are present in the error message.
40 ▶     expect(logs[0].message).toMatch(/NG0913.*?a\.png/);
```

画像の警告の e2e は、本物の Chromium で開いて console の `NG0913` を待ちます（35 行目の `waitForBrowserLogs`、38 行目で 1 つだけ）。手元の実行（14 specs、0 failures）の log にも、[第 7 回](07-crh-dev-utils.md)で見た「see …/NG0913. Find more at …/NG0913」の 2 回続く URL がそのまま出ていました。

📄 `angular/packages/platform-server/test/full_app_hydration_spec.ts` L7026–7050 （▶ の行: 7027–7028, 7036, 7040, 7046）

```ts
7026 │       it(
7027 ▶         'should not log a warning when there was no hydration info in the TransferState, ' +
7028 ▶           'but a client mode marker is present',
7029 │         async () => {
7030 │           @Component({
7031 │             selector: 'app',
7032 │             template: `Hi!`,
7033 │           })
7034 │           class SimpleComponent {}
7035 │ 
7036 ▶           const html = `<html><head></head><body ${CLIENT_RENDER_MODE_FLAG}><app></app></body></html>`;
7037 │ 
7038 │           resetTViewsFor(SimpleComponent);
7039 │ 
7040 ▶           const appRef = await prepareEnvironmentAndHydrate(doc, html, SimpleComponent, {
7041 │             envProviders: [withDebugConsole()],
7042 │           });
7043 │           const compRef = getComponentRef<SimpleComponent>(appRef);
7044 │           appRef.tick();
7045 │ 
7046 ▶           verifyEmptyConsole(appRef);
7047 │ 
7048 │           const clientRootNode = compRef.location.nativeElement;
7049 │           expect(clientRootNode.textContent).toContain('Hi!');
7050 │         },
```

📄 `angular/packages/platform-server/test/integration_spec.ts` L72–82 （▶ の行: 76–77）

```ts
72 │ 
73 │ import {BrowserAnimationsModule, provideAnimations} from '@angular/platform-browser/animations';
74 │ import {renderApplication, SERVER_CONTEXT} from '../src/utils';
75 │ 
76 ▶ const APP_CONFIG: ApplicationConfig = {
77 ▶   providers: [provideServerRendering()],
78 │ };
79 │ 
80 │ function getStandaloneBootstrapFn(
81 │   component: Type<unknown>,
82 │   providers: Array<Provider | EnvironmentProviders> = [],
```

7026 行目の it は、ブラウザーのハイドレーションだけを試す it で、サーバーで描く `ssr()` を呼びません。ところが同じ `:test` の中の integration\_spec.ts は、76〜77 行目（と L468）の定義を読み込んだ時点で `provideServerRendering()` を呼び、provide\_server.ts L35〜37 が `globalThis['ngServerMode'] = true` にしたまま戻しません（[第 1 回](01-crh-hydration-api.md)）。jasmine がこの it を、`ngServerMode` を戻す ssr() の it より先に走らせると、7040 行目の `prepareEnvironmentAndHydrate` の中の `bootstrapApplication` がサーバーのつもりで動いて NG0401 で落ちます。

## 3. issue の表

2026-11-22 に取った `area: core` の開いている 263 件のうち、このシリーズで読んだ所に関わるものと、gh で読んで取り足した 2 件（`area: animations`・`area: compiler`）です。

| # | 題（2026-11-22 に開いている） | ラベル | このシリーズとの関わり |
| --- | --- | --- | --- |
| 56392 | Hydration: detect common mismatch patterns and produce a better error message（2024-06-11） | core: hydration・canonical・open for contributions | 第 3 回の NG0500 の文（空白が消える、注記がいつも付く） |
| 61231 | Components created with createComponent function are not being hydrated properly（2025-05-09） | core: hydration | 第 2 回の「どのビューから書くか」 |
| 68931 | Hydration fails with rxResource + @else inside nested &lt;router-outlet&gt;（2026-05-26） | core: hydration・cross-cutting: resource | 第 2・5 回の間（ハイドレーションと resource の状態） |
| 71929 | Hydration cleanup writes i18nNodes/dehydratedIcuData onto user data stored in @let（2026-11-10） | area: core | 第 3 回の i18n のハイドレーションの片付け |
| 72146 | animate.enter and (animate.enter) replay enter animations on already-rendered DOM during SSR client hydration（2026-11-20） | area: animations | 第 6 回の animate.enter の queue |
| 54389 | Produce an error or warning if not deferrable dependency is used within @defer block（2024-02-12） | core: defer・feature | 第 4 回の警告の説明文 |
| 69369 | Make viewChild(Component) compatible with deferred lazy chunks（2026-06-16） | core: defer・core: queries | 第 4 回 |
| 71585 | resource.reload() while params is in error switches the resource to 'idle' instead of retrying（2026-10-24） | area: core | 第 5 回の reload（[ResourceParamsStatus の章](../resx/01-resx-params-status.md)の 7 節） |
| 71449 | feat(core): Expose the previous resource value to the loader（2026-10-20） | area: core | 第 5 回の `previous`（今は status だけ） |
| 70036 | Add an opt-in lazy option to resource() to defer loading until the first read（2026-07-31） | cross-cutting: resource・action: discuss | 第 5 回の「params が変われば読み込む」 |
| 59712 | extend streaming resource with {status} capability（2025-01-25） | core: reactivity | 第 5 回の `ResourceStreamItem`（value か error だけ） |
| 70021 | Style bindings can write to a clobbered form（2026-07-30） | area: core | 第 6 回の setStyle の道 |
| 37224 | padding-left style binding toggle doesn't work on Ivy（2020-05-20） | core: styling bindings・state: confirmed | 第 6 回の setStyle / removeStyle |
| 66244 | Angular never removes style tags on destroy if any component has (animate.leave) hook（2025-12-24） | core: animations | 第 6 回の animation |
| 71393 | A misspelled animate.enter compiles without an error and runs as a leave animation（2026-10-16） | area: compiler | 第 6 回の「コンパイラーが通す animate」の仲間 |
| 51175 | Provide the ability to remove code needed only in dev mode from the production bundle（2023-07-26） | feature: under consideration | 第 7 回の ngDevMode の define（アプリのコードの側） |
| 59727 | ASSERTION ERROR error during HMR when changing css in module component（2025-01-26） | core: hot module replacement (HMR) | 第 7 回の assert の文 |

4 節の不具合のうち、gh で探して issue も PR も見つからなかったのは 7・11・17・18・22・25・30・34 です（探した言葉は各回の本文にあります）。

## 4. このシリーズで見つけたもの（食い違いと不具合）

「説明・約束」は説明文かコメントの言うこと、「実際」は記録か実装で確かめた振る舞いです。行は 8576f161ae4、「新しい本家」は origin/main（d201dd76ef2、2026-11-20）です。

| # | 回 | ファイルと行 | 説明・約束 | 実際 | 新しい本家 |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | `core/src/hydration/tokens.ts` 76 | `JSACTION_BLOCK_ELEMENT_MAP` は「jsaction の属性を持つ要素をアクションの名前ごとにまとめた Map」 | キーは要素の `ngb`（@defer のブロックの id）、無ければ `''` | 同じ |
| 2 | 1 | `core/src/hydration/event_replay.ts` 227〜228 | テンプレートで付けた「すべての」DOM イベントを集める | `isEarlyEventType` のイベントだけ。(mouseenter)(scroll) には付かない | 同じ |
| 3 | 1 | `core/src/hydration/annotate.ts` L283〜287 | `__nghData__` のキーが無ければ「ブラウザーでエラー」 | 開発モードの `console.warn`（NG0505）だけ。本番は何も出ない | 同じ |
| 4 | 1 | `core/src/hydration/interfaces.ts` L49 | `DEFER_PREFETCH_TRIGGERS = 'pt'` | どこからも読まれない | 直った（b493d767a4b で削除） |
| 5 | 1 | `core/src/hydration/utils.ts` 355〜360 | 名前 `countBlocksSkippedByHydration` | `__nghDeferData__` のキーの数（ハイドレート済みも数える） | 同じ |
| 6 | 1 | `core/src/hydration/skip_hydration.ts` 66 | （親の属性を見る） | 前半の式は 61 行目と同じでいつも false。動きは説明どおり | 同じ |
| 7 | 1 | `platform-server/test/full_app_hydration_spec.ts` 7026 | （spec） | integration\_spec.ts が読み込み時に `ngServerMode = true` にし、走る順で NG0401。`--seed=46107` で落ちる | 同じ |
| 8 | 2 | `core/src/hydration/annotate.ts` L830〜831 | i18n のあるコンポーネントを飛ばすのは「まだ対応していないから」 | `withI18nSupport()` があれば対応している | 同じ |
| 9 | 2 | `core/src/hydration/utils.ts` 249〜250 と L283 | （テキストの印 `ngetn` を拾って戻す） | 拾う側は空白を消し、戻す側は残して比べる。`<!-- ngetn -->` で NG0500 | 同じ |
| 10 | 2 | `core/src/hydration/annotate.ts` 544〜545 | `serializeLView` の `@param` は 2 つ | 3 つ目の `parentDeferBlockId` の説明が無い | 同じ |
| 11 | 3 | `core/src/hydration/error_handling.ts` 469〜477 | `stripNewlines`「改行を全部取り除く」 | 空白とタブも消す。NG0500 の文で `class="btnbtn-primary"` | 同じ |
| 12 | 3 | `error_handling.ts` L111・L437〜455 | 外のスクリプトが DOM を変えたかもしれない、という注記は外から来たノードのとき | 要素どうしの不一致ではいつも付く | 同じ |
| 13 | 3 | `error_handling.ts` 494〜499 | `describeDomNode` は「本番でも安全、本番の道から呼ぶ」 | 呼ぶ 2 か所はどちらも `ngDevMode &&` の中 | 同じ |
| 14 | 3 | `core/src/hydration/utils.ts` L155〜164 | データが無ければエラー。本番でも番号付きの RuntimeError に | 壊れた ngh の番号で、本番は `Cannot read properties of undefined (reading 'd')` | 同じ |
| 15 | 3 | `core/src/hydration/utils.ts` 368〜372 | 文の中の関数名 `markRNodeAsMismatchedByHydration` | 本当の名前は `markRNodeAsHavingHydrationMismatch` | 同じ |
| 16 | 3 | `core/src/hydration/utils.ts` L508〜515 | （`isDisconnectedNode`） | `initDisconnectedNodes` と同じ初期化を重ねて書いている | 同じ |
| 17 | 4 | `core/src/defer/instructions.ts` L771・819 | トリガーの名前は「暗黙の引き金でなければ (&lt;target&gt;)」 | 同じビューの #ref の `on viewport(b)` に &lt;target&gt; が付かない（ad2376435b4 の回帰） | 同じ |
| 18 | 4 | `core/src/defer/triggering.ts` 651〜653・L669〜674 | 「すべてのブロックのトリガーを正しく初期化する」 | 根がテキストだけのブロックには hydrate on timer ほかが仕掛けられず、親ごとハイドレートされない | 同じ |
| 19 | 4 | `core/src/hydration/utils.ts` 419 | `warnIncrementalHydrationNotConfigured` は「例外を投げる」 | `console.warn`（NG0508）をプロセスで 1 回 | 同じ |
| 20 | 4 | `core/src/defer/instructions.ts` 536〜537 | `ɵɵdeferHydrateOnTimer` の delay は「内容を読み込むまで」 | 待つのはハイドレートまで（内容は HTML にある） | 同じ |
| 21 | 5 | `core/src/resource/api.ts` L156〜157 | `reload()` しても要求を出すまで reloading にならない | `reload()` の直後（`loader` の前）に reloading。spec も同期を固めている | 同じ |
| 22 | 5 | `core/src/resource/resource.ts` L580（型は api.ts L207） | `stream` は `undefined` を返してよい | `status()`・`hasValue()`・`isLoading()` が `TypeError: state.stream is not a function` | 同じ（L613） |
| 23 | 5 | `core/src/resource/api.ts` L71 | error のとき `value()` は `undefined` | 投げる（`ResourceValueError`） | 直った（b8622e0fa26） |
| 24 | 5 | `core/src/resource/api.ts` L270〜271 | `stream` は signal の Promise を返す | 4e331062e83 から signal を同期で返す形と `undefined` も許す | 同じ |
| 25 | 6 | `platform-browser/src/dom/dom_renderer.ts` L442〜443 | `RendererStyleFlags2.Important`「important の印」 | `DashCase` 無しの camelCase の名前では何も書かれない。`[style]="{backgroundColor: '… !important'}"` も | 同じ |
| 26 | 6 | `core/src/render/api.ts` 171・179 | `setAttribute` の `@param namespace` | 短い名前だけ。URI で `InvalidCharacterError`（`createElement` は URI も通す） | 同じ |
| 27 | 6 | `core/src/render/api.ts` 153〜155・161〜163・209、L88〜92 | parentNode / nextSibling の「呼ぶ側は null に頼れない」、`???`、createComment「DOM に足す」 | null を返すだけ、作って返すだけ | 同じ |
| 28 | 6 | `core/src/i18n/tokens.ts` 113・116・122〜127・149・152 | 説明文の例のコード | import が足りず strict の tsc で TS2304。`bootstrapModule({providers})` はアプリの注入器に届かない | 同じ |
| 29 | 6 | `core/src/animation/utils.ts` 44〜53 | `assertAnimationTypes`「値が animation の型か確かめる」 | テンプレートの値は getter の関数に包まれて渡るので、何でも通る | 同じ |
| 30 | 6 | `core/src/animation/queue.ts` L93〜98 | （溜めた animation を順に呼んで消す） | 1 つが投げると `clear()` に届かず、後ろの enter が走らず、flush のたびにまた投げる。`<ng-container animate.enter>` で起きる | 同じ |
| 31 | 6 | `core/src/animation/utils.ts` 305・L9 | 「与えたリストのクラスを含むか」 | 1 つでも含めば true。L9 は書きかけのコメント | 同じ |
| 32 | 7 | `core/src/util/assert.ts` 114 | 失敗の文「Expected=&gt; … &lt;=Actual」 | 左右が逆で、`<`・`>` では成り立つ式に読める（`[Expected=> 0 > -1 <=Actual]`） | 同じ |
| 33 | 7 | `core/src/util/stringify.ts` 55・62〜63、41 | `maxLength` は出力の長さ。`@param separator` | 出力は最大 maxLength + 3 文字（4 → 7 文字）。separator という引数は無い | 同じ |
| 34 | 7 | `platform-server/src/utils.ts` L101〜106・`transfer_state.ts` L83〜87 | `startMeasuring` と `stopMeasuring` は対で使う（profiler.ts 15・30 行目） | 早い `return` で `stop` を飛ばし、`start:🅰️:` の mark が描くたびに 2 つ残る | 同じ |
| 35 | 7 | `core/src/image_performance_warning.ts` L27・94、216〜217・228〜229 | Map のコメント、`data:` と `blob:` は「取ってくる資源なので除く」 | Map は無い、理由が逆。警告の文は同じ URL が 2 回 | 同じ |
| 36 | 7 | `core/src/util/ng_dev_mode.ts` 26、`array_utils.ts` 121、`performance.ts` 15〜17 | 型 `null \| NgDevModePerfCounters`、`Array.splice2`、説明の文 | 実際は `false` も入る、そのメソッドは無い、文が切れている | 同じ |

振る舞いの不具合は 7・9・11・14・17・18・22・25・30・34 の 10 個で（7 は spec の不具合、11 と 17 は開発モードの文と DevTools の表示の不具合）、残りは説明文・コメント・名前の食い違いです。新しい本家で直っていたのは 4 と 23 の 2 つだけでした。

## 聞かれそうな質問

**Q. spec が説明文と逆のことを固めているとき、どちらを直しますか？**

入れた commit を読みます。resource の reload は、01fffdb5477 が状態を `linkedSignal` にしたのと同じ commit で、resource\_spec.ts 683〜685 行目の「同期で reloading」の it を足しています。意図は「同期」で、残ったのは最初の版（18d8d44b1f3）の説明文の方です。

**Q. platform-server の spec が手元で 1 つ落ちました。壊れているのは自分の変更ですか？**

7026 行目の it なら、走る順のせいのことがあります。`"--test_arg=--seed=46107"` で落ち、ほかの seed では通ることがあります。integration\_spec.ts の 76〜77 行目が読み込み時に `ngServerMode` を立てたまま戻さないのが原因です（2 節）。

**Q. web の suite に `--test_arg=--filter` を付けても絞れないのはなぜですか？**

web の suite は jasmine の Node の実行器ではなく、ブラウザーの中で全部を走らせるからです（[platform の説明文の最終回](../pbd/07-pbd-tests-issues.md)の 1 節）。絞り込みが 0 件でも PASSED になるので、結果の件数を見ます。

**Q. このシリーズの不具合のうち、本番のアプリで気づきやすいのはどれですか？**

25（`[style]` の map の camelCase に `!important` が効かない）と 30（`ng-container` の animate.enter のあと、アプリのほかの enter の animation が止まる）と 18（テキストだけの `@defer` が hydrate on timer でハイドレートされない）です。どれもエラーにならず、「効かない」だけに見えます。

## 読み終えて

- ハイドレーションの spec は platform-server の `:test`、@defer は core の acceptance、resource は core の resource、Renderer2 の実装は platform-browser の web の suite にある。
- resource の reload は、spec が説明文と逆を固めている。食い違いを見つけたら、まず入れた commit を読む。
- 見つけた 36 のうち、振る舞いの不具合は 10、新しい本家で直っていたのは 2。
- spec が無かった所（camelCase の map の `!important`、animation の queue の中の例外、`stream` の `undefined`、SSR の mark）が、そのまま不具合の場所だった。

---

← 前: [開発用の小道具の説明文：assert・ngDevMode・画像の警告・profiler](07-crh-dev-utils.md)  
次: [trigger・state・style・animate の説明文](../anm/01-anm-trigger-state.md) →
