[目次](../README.md) › [Angular DevTools の内側](README.md) › 第 19 回 / 全 20 回

# DevTools のテストとビルド：zoneless\_web\_test\_suite と demo のアプリ

> devtools の spec を Chromium と Firefox で走らせる zoneless\_web\_test\_suite（wtr\_test が 1 つの :test を 2 つにする）、バックエンドの spec がアプリを作らずに window.ng の偽物と DOM で木を作る書き方、パネルの spec の TestBed と MessageBus の偽物、開発用のサーバー（devtools:devserver）と拡張のビルド（prodapp・flag\_browser）、CI の cypress の e2e、DevTools の不具合を spec の形で再現するときの手順とどの spec に足すかの表。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-test-build)

---

第 1〜18 回の終わりでは、毎回 `pnpm bazel test //devtools/…:test` を走らせてきました。この章では、その `:test` がどこで定義され、なぜ 1 つが Chromium と Firefox の 2 つになるのか、spec がアプリを作らずに何を偽物にしているのか、開発用のサーバーと拡張のビルドが何をするのかを、BUILD の行で追います。最後に、DevTools の不具合を spec の形で手元で再現するときの手順と、どのファイルに足すかの目安を表にします。

読む対象は `devtools/tools/defaults.bzl`・`tools/bazel/web_test.bzl`・各ディレクトリの `BUILD.bazel`・spec のいくつか・`devtools/src/BUILD.bazel`・`devtools/projects/shell-browser/src/BUILD.bazel`・`devtools/cypress/`・`../angular/package.json` の `devtools:*`・`.github/workflows/pr.yml` です。bazel そのものの読み方は [contrib-bazel](../contrib/04-contrib-bazel.md)、テストの走らせ方の一般は [contrib-run-tests](../contrib/05-contrib-run-tests.md) にあります。

1. [1. 全体像](01-devtools-overview.md)
2. [2. Angular を見つける](02-devtools-detect.md)
3. [3. メッセージの道](03-devtools-messaging.md)
4. [4. プロトコル](04-devtools-protocol.md)
5. [5. コンポーネントの木](05-devtools-component-tree.md)
6. [6. 制御フローの塊](06-devtools-control-flow.md)
7. [7. 同じノードを見分ける](07-devtools-identity.md)
8. [8. パネルの木](08-devtools-forest-ui.md)
9. [9. プロパティの直列化](09-devtools-state-serializer.md)
10. [10. 入れ子を開く](10-devtools-property-resolver.md)
11. [11. 値を書き換える](11-devtools-property-mutation.md)
12. [12. 選ぶ・光らせる](12-devtools-inspector-highlight.md)
13. [13. プロファイラーの記録](13-devtools-profiler-capture.md)
14. [14. 記録を描く](14-devtools-profiler-formatters.md)
15. [15. 変更検知を見張る](15-devtools-cd-analyzer.md)
16. [16. 注入器の木](16-devtools-injector-tree.md)
17. [17. signal のグラフ](17-devtools-signal-graph.md)
18. [18. ルーター・TransferState](18-devtools-router-transfer.md)
19. **19. テストとビルド**（この章）
20. [20. issue と PR を読む](20-devtools-issues.md)

## 1. 3 つの確かめ方：単体の spec・拡張のビルド・e2e

📄 `angular/package.json` L35–39 （▶ の行: 35–36, 38–39）

```json
35 ▶     "devtools:devserver": "ibazel run //devtools/src:devserver",
36 ▶     "devtools:test:e2e": "cypress run --project ./devtools/cypress",
37 │     "devtools:e2e:open": "cypress open --project ./devtools/cypress",
38 ▶     "devtools:build:chrome": "bazelisk build --//devtools/projects/shell-browser/src:flag_browser=chrome //devtools/projects/shell-browser/src:prodapp",
39 ▶     "devtools:build:firefox": "bazelisk build --config snapshot-build-firefox --//devtools/projects/shell-browser/src:flag_browser=firefox //devtools/projects/shell-browser/src:prodapp",
```

📄 `angular/package.json` L44–45 （▶ の行: 44–45）

```json
44 ▶     "devtools:test": "bazelisk test --//devtools/projects/shell-browser/src:flag_browser=chrome -- //devtools/...",
45 ▶     "devtools:test:unit": "bazelisk test -- //devtools/...",
```

📄 `angular/.github/workflows/pr.yml` L46–70 （▶ の行: 46, 60, 62, 64, 66–68）

```yaml
46 ▶   devtools:
47 │     runs-on: ubuntu-latest
48 │     steps:
49 │       - name: Initialize environment
50 │         uses: angular/dev-infra/github-actions/npm/checkout-and-setup-node@183403ae13b785698eaf13c819dda55b9fed430b # main
51 │         with:
52 │           disable-package-manager-cache: true
53 │       - name: Setup Bazel
54 │         uses: angular/dev-infra/github-actions/bazel/setup@183403ae13b785698eaf13c819dda55b9fed430b # main
55 │       - name: Setup Bazel RBE
56 │         uses: angular/dev-infra/github-actions/bazel/configure-remote@183403ae13b785698eaf13c819dda55b9fed430b # main
57 │       - name: Install node modules
58 │         run: pnpm install --frozen-lockfile
59 │       - name: Run unit tests
60 ▶         run: pnpm devtools:test
61 │       - name: Test build
62 ▶         run: pnpm devtools:build:chrome
63 │       - name: Cypress run
64 ▶         uses: cypress-io/github-action@09090944bd8aaa2a517cefb6e38bf1aae336b42b # v7.4.3
65 │         with:
66 ▶           command: pnpm devtools:test:e2e
67 ▶           start: pnpm bazel run //devtools/src:devserver
68 ▶           wait-on: 'http://localhost:4200'
69 │           wait-on-timeout: 300
70 │           install: false
```

PR ごとに走る CI の `devtools` の仕事は 3 段です。60 行目の `pnpm devtools:test`（44 行目、`//devtools/...` の bazel のテスト全部）、62 行目の `pnpm devtools:build:chrome`（38 行目、Chrome 版の拡張を作る）、そして 64〜70 行目の cypress の e2e です。e2e は 67 行目で開発用のサーバー（4 節）を立て、68 行目でポート 4200 が開くのを待ってから、36 行目の `cypress run` を走らせます。**cypress の e2e はいまも PR ごとに使われています**。44 行目と 45 行目の違いは `flag_browser=chrome` を付けるかどうかで、付けると 5 節の拡張の中身も Chrome 版で作られます（既定も chrome）。

## 2. :test の正体：zoneless\_web\_test\_suite

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/transfer-state/BUILD.bazel` L38–59 （▶ の行: 38–39, 41, 47, 54–55, 57）

```python
38 ▶ ts_test_library(
39 ▶     name = "transfer_state_test",
40 │     srcs = [
41 ▶         "transfer-state.component.spec.ts",
42 │     ],
43 │     visibility = [
44 │         "//visibility:private",
45 │     ],
46 │     deps = [
47 ▶         ":transfer-state",
48 │         "//:node_modules/@angular/cdk",
49 │         "//:node_modules/@angular/core",
50 │         "//devtools/projects/protocol",
51 │     ],
52 │ )
53 │ 
54 ▶ zoneless_web_test_suite(
55 ▶     name = "test",
56 │     deps = [
57 ▶         ":transfer_state_test",
58 │     ],
59 │ )
```

ディレクトリごとの BUILD は 2 つで 1 組です。38〜52 行目の `ts_test_library` で spec をコンパイルし、54〜59 行目の `zoneless_web_test_suite` がそれを束ねてブラウザで走らせます。この 55 行目の `name = "test"` が、いつも走らせている `:test` です。

📄 `angular/devtools/tools/defaults.bzl` L91–100 （▶ の行: 94–95, 97）

```python
 91 │ def ts_test_library(name, deps = [], **kwargs):
 92 │     _ts_project(
 93 │         name = name,
 94 ▶         tsconfig = "//devtools:tsconfig_test",
 95 ▶         testonly = 1,
 96 │         deps = deps + [
 97 ▶             "//:node_modules/@types/jasmine",
 98 │         ],
 99 │         **kwargs
100 │     )
```

📄 `angular/devtools/tools/defaults.bzl` L57–68 （▶ の行: 58–62, 64, 66）

```python
57 │ def zoneless_web_test_suite(deps = [], **kwargs):
58 ▶     # Provide required modules for the imports in //tools/testing/browser_tests.init.mts
59 ▶     deps = deps + [
60 ▶         "//:node_modules/@angular/compiler",
61 ▶         "//:node_modules/@angular/core",
62 ▶         "//:node_modules/@angular/platform-browser",
63 │     ]
64 ▶     _zoneless_web_test_suite(
65 │         deps = deps,
66 ▶         tsconfig = "//devtools:tsconfig_test",
67 │         **kwargs
68 │     )
```

📄 `angular/tools/bazel/web_test.bzl` L38–44 （▶ の行: 38–39, 42）

```python
38 ▶ def zoneless_web_test_suite(deps = [], bootstrap = [], **kwargs):
39 ▶     web_test(
40 │         deps = deps,
41 │         bootstrap = [
42 ▶             "//tools/testing:browser_zoneless",
43 │         ] + bootstrap,
44 │         **kwargs
```

1. **devtools の defaults.bzl の 59〜66 行目：@angular の 3 つを足し、tsconfig を devtools のものにして、リポジトリ共通の規則を呼ぶ**

   58 行目のコメントのとおり、テストの初めに読む `browser_tests.init.mts` が import するものを足しています。ここの `//:node_modules/@angular/core` は、`../angular/package.json` の依存で `"@angular/core": "workspace:*"`、つまり**この木の `packages/core` から作ったもの（22.2.0-next.7）**です。このサイトのデモが動かす 22.1.6 とは違います。
2. **tools/bazel/web\_test.bzl の 38〜42 行目：初めに読むファイルに `browser_zoneless` を入れる**

   残りの `web_test`（spec を 1 つのファイルに束ねる `spec_bundle` と、ブラウザで走らせる `wtr_test`）は [contrib-bazel](../contrib/04-contrib-bazel.md) で読みました。

📄 `angular/tools/testing/browser_zoneless_tests.init.mts` L18–24 （▶ の行: 19, 23–24）

```ts
18 │ @NgModule({
19 ▶   providers: [provideZonelessChangeDetection()],
20 │ })
21 │ export class TestModule {}
22 │ 
23 ▶ TestBed.initTestEnvironment(
24 ▶   [BrowserTestingModule, NoopAnimationsModule, TestModule],
```

初めに読むファイルは、TestBed（テスト用の注入器と部品の土台）を 19 行目の `provideZonelessChangeDetection()` 入りで用意します。だから devtools の spec はすべて zone.js 無しで走ります（ファイルの全体は [contrib-run-tests](../contrib/05-contrib-run-tests.md)）。

1 つの `:test` が 2 つになるのは、`wtr_test` の定義によります。これは bazel の外部の取り込み（rules\_browsers）にあり、../angular のリポジトリの中ではないので、cuts を通さずに写しを置きます。

📄 `rules_browsers の wtr/index.bzl 60〜77 行目（bazel の external の中。読むだけ）`

```
def wtr_test(name, deps, firefox = True, chromium = True, **kwargs):
    tests = []
    if firefox:
        _base_wtr_test("%s_firefox" % name, deps = deps, mode = "firefox", **kwargs)
        tests.append(":%s_firefox" % name)
    if chromium:
        _base_wtr_test("%s_chromium" % name, deps = deps, mode = "chromium", **kwargs)
        tests.append(":%s_chromium" % name)

    _base_wtr_test("%s_debug" % name, deps = deps, mode = "manual", **kwargs)

    if len(tests) == 0:
        fail("A least one of `chromium` or `firefox` must be enabled")

    native.test_suite(
        name = name,
        tests = tests,
    )
```

- `firefox` と `chromium` が既定で両方 `True` なので、`_firefox` と `_chromium` の 2 つのテストを作り、`native.test_suite` で `:test` という名前に束ねます。`:test` を走らせると 2 つが走り、出力も 2 つ出ます。
- 3 つめの `_debug` は手で開いたブラウザで見るためのもので、`manual` の印が付くので `//devtools/...` には含まれません。
- 同じ定義の前半（`_base_wtr_test`）は、ブラウザごとに Firefox か Chrome headless shell の実行ファイルを渡し、`no-sandbox` の印を付けます。テストのファイルは、そのパッケージの `**/*.spec.js` と `**/*_spec.js` です（`tab_manager_spec.ts` のように `_spec` の名前でも拾われる）。

📄 `ターミナル（2026-11-05 に実行。# の行は出力）`

```
cd ~/angular-research/angular
pnpm bazel query 'tests(//devtools/...)' --output=label_kind | awk '{print $1}' | sort | uniq -c
#  215 _strict_deps_test
#  147 js_test          ← 49 個の zoneless_web_test_suite × 3（_chromium・_firefox・_debug）
pnpm bazel query 'attr(tags, "manual", tests(//devtools/...))' | wc -l
#   49                 ← _debug は manual なので //devtools/... に含まれない
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/BUILD.bazel` L20–39 （▶ の行: 21, 28, 30, 33）

```python
20 │ zoneless_web_test_suite(
21 ▶     name = "client_event_subscribers_test",
22 │     deps = [
23 │         ":client_event_subscribers_test_lib",
24 │     ],
25 │ )
26 │ 
27 │ ts_test_library(
28 ▶     name = "client_event_subscribers_test_lib",
29 │     srcs = [
30 ▶         "client-event-subscribers.spec.ts",
31 │     ],
32 │     deps = [
33 ▶         ":client_event_subscribers",
34 │         "//devtools/projects/ng-devtools-backend/src/lib/directive-forest/identity-tracker",
35 │         "//devtools/projects/ng-devtools-backend/src/lib/profiling/profiler",
36 │         "//devtools/projects/protocol",
37 │         "//devtools/projects/shared-utils",
38 │     ],
39 │ )
```

名前が `:test` でないものもあります。バックエンドの lib の直下は 21 行目の `client_event_subscribers_test`、shell-browser は `tab_manager_test` などファイルごとです。全部の名前は 7 節のデモの「`//devtools/...` 全部」で見られます（49 個）。

## 3. spec はアプリを作らない：window.ng の偽物

バックエンドは `window.ng` の関数しか呼びません（[第 1 回](01-devtools-overview.md)）。だからバックエンドの spec の多くは、Angular のアプリを起動せず、`window.ng` を手で作ったオブジェクトに差し替えます。LView を組み立てる spec はありません（`grep` で、spec の中に `LView` の語は 1 つもありませんでした）。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.spec.ts` L56–66 （▶ の行: 57–59, 62–63）

```ts
56 │ function mockAngular() {
57 ▶   const appNode = document.createElement('app');
58 ▶   appNode.setAttribute('ng-version', '17.0.0');
59 ▶   (appNode as any).__ngContext__ = true;
60 │   document.body.appendChild(appNode);
61 │ 
62 ▶   (window as any).ng = {
63 ▶     getComponent: () => {},
64 │   };
65 │   return appNode;
66 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.spec.ts` L15–29 （▶ の行: 21, 23–27）

```ts
15 │ describe('ClientEventSubscriber', () => {
16 │   let messageBusMock: MessageBus<Events>;
17 │   let appNode: HTMLElement | null = null;
18 │ 
19 │   beforeEach(() => {
20 │     // mock isAngular et al
21 ▶     appNode = mockAngular();
22 │ 
23 ▶     messageBusMock = jasmine.createSpyObj<MessageBus<Events>>('messageBus', [
24 ▶       'on',
25 ▶       'once',
26 ▶       'emit',
27 ▶       'destroy',
28 │     ]);
29 │   });
```

1. **57〜60 行目：「Angular のページらしさ」を DOM で作る**

   58 行目の `ng-version` 属性と 59 行目の `__ngContext__` は、`shared-utils` の `appIsAngular` などが見る印です（[第 2 回](02-devtools-detect.md)）。`__ngContext__` は本物なら LView を指す数ですが、ここでは `true` で足ります。
2. **62〜64 行目：`window.ng` は要る関数だけ**
3. **23〜28 行目：MessageBus は jasmine の spy**

   `on`・`once`・`emit`・`destroy` の 4 つの口（[第 4 回](04-devtools-protocol.md)の約束）を、呼ばれたかを覚えるだけの関数にします。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/tree-strategies/render-tree.spec.ts` L25–48 （▶ の行: 27–30, 32, 36–37, 39, 45, 48）

```ts
25 │   beforeEach(() => {
26 │     treeStrategy = new RTreeStrategy();
27 ▶     directiveMap = new Map();
28 ▶     componentMap = new Map();
29 ▶     directiveMetadataMap = new Map();
30 ▶     controlFlowBlocksMap = new Map();
31 │ 
32 ▶     (window as any).ng = {
33 │       getDirectiveMetadata(dir: any): DirectiveDebugMetadata | null {
34 │         return directiveMetadataMap.get(dir) ?? null;
35 │       },
36 ▶       getComponent(element: Element): any {
37 ▶         return componentMap.get(element);
38 │       },
39 ▶       getDirectives(node: Node): any {
40 │         return directiveMap.get(node) || [];
41 │       },
42 │       ɵgetControlFlowBlocks(node: Node): ControlFlowBlock[] {
43 │         return (controlFlowBlocksMap.get(node) as ControlFlowBlock[]) || [];
44 │       },
45 ▶     } satisfies Partial<FrameworkAgnosticGlobalUtils>;
46 │   });
47 │ 
48 ▶   afterEach(() => delete (window as any).ng);
```

木を集める spec は、要素 → コンポーネント、要素 → ディレクティブの `Map` を 27〜30 行目で作り、32〜45 行目の偽の `window.ng` がその `Map` を引くだけにします。45 行目の `satisfies Partial<FrameworkAgnosticGlobalUtils>` で、偽物の関数の形が core の型と合っているかを TypeScript に確かめさせます。48 行目で毎回消します。この準備で、あとの it は `document.createElement` で DOM を組み、`Map` に入れ、`build` を呼ぶだけになります（it の中身は[第 5 回](05-devtools-component-tree.md)）。

### パネルの spec：TestBed と MessageBus の偽物

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/transfer-state/transfer-state.component.spec.ts` L15–34 （▶ の行: 15–16, 21–23, 27–28）

```ts
15 ▶ class MessageBusMock implements Pick<MessageBus<Events>, 'on' | 'emit' | 'once' | 'destroy'> {
16 ▶   readonly emit = jasmine.createSpy('emit');
17 │   readonly once = jasmine.createSpy('once');
18 │   readonly destroy = jasmine.createSpy('destroy');
19 │   private listeners = new Map<keyof Events, Set<Function>>();
20 │ 
21 ▶   on = jasmine.createSpy('on').and.callFake((topic: keyof Events, cb: Function) => {
22 ▶     if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
23 ▶     this.listeners.get(topic)!.add(cb);
24 │     return () => this.listeners.get(topic)!.delete(cb);
25 │   });
26 │ 
27 ▶   emitToListener(topic: keyof Events, ...args: unknown[]): void {
28 ▶     this.listeners.get(topic)?.forEach((cb) => cb(...args));
29 │   }
30 │ 
31 │   hasListener(topic: keyof Events): boolean {
32 │     return (this.listeners.get(topic)?.size ?? 0) > 0;
33 │   }
34 │ }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/transfer-state/transfer-state.component.spec.ts` L70–88 （▶ の行: 71, 73, 86–87）

```ts
70 │     TestBed.configureTestingModule({
71 ▶       imports: [TransferStateComponent],
72 │       providers: [
73 ▶         {provide: MessageBus, useValue: messageBus},
74 │         {provide: Clipboard, useValue: clipboardSpy},
75 │       ],
76 │     });
77 │   });
78 │ 
79 │   afterEach(() => {
80 │     window.setTimeout = originalSetTimeout;
81 │   });
82 │ 
83 │   it('creates the component and emits getTransferState on init', async () => {
84 │     await createComponent();
85 │     expect(component).toBeTruthy();
86 ▶     expect(messageBus.emit).toHaveBeenCalledWith('getTransferState');
87 ▶     expect(messageBus.hasListener('transferStateData')).toBe(true);
88 │   });
```

パネルは画面の部品なので、spec は TestBed で本物のコンポーネントを作ります。外とのつながりは MessageBus だけなので、73 行目でそれを偽物に差し替えます。偽物の `on` は 21〜25 行目で購読を覚え、27〜28 行目の `emitToListener` で「バックエンドから届いた」ことにします。86〜87 行目のように、送ったメッセージと購読の両方を確かめられます。[第 18 回](18-devtools-router-transfer.md)の Transfer State の spec がこの形です。

## 4. 開発用のサーバー：devtools:devserver

📄 `angular/devtools/src/BUILD.bazel` L77–85 （▶ の行: 78, 80–81, 83）

```python
77 │ http_server(
78 ▶     name = "devserver",
79 │     srcs = [":dev_app_static_files"],
80 ▶     port = 4200,
81 ▶     tags = ["manual"],
82 │     deps = [
83 ▶         ":bundle",
84 │     ],
85 │ )
```

`pnpm devtools:devserver` は `ibazel run //devtools/src:devserver` で、ファイルを書き換えるたびに作り直して、80 行目のポート 4200 で配ります。81 行目の `manual` により `//devtools/...` のテストやビルドには入りません。中身は拡張ではなく、1 つのページの中で、`/` に DevTools のパネルの画面（`devtools/src/app/devtools-app`）を出し、その中の iframe に `/demo-app` のデモのアプリ（バックエンド入り）を読み込んで、`IFrameMessageBus` でつなぐものです。Chrome の拡張の仕組み（[第 3 回](03-devtools-messaging.md)の content script・background）を通らないので、パネルとバックエンドの話だけを手早く確かめられます。1 節の e2e もこのページを相手にします。

## 5. 拡張のビルド：prodapp と flag\_browser

📄 `angular/devtools/projects/shell-browser/src/BUILD.bazel` L105–132 （▶ の行: 106–107, 115–116, 120, 126–128）

```python
105 │ string_flag(
106 ▶     name = "flag_browser",
107 ▶     build_setting_default = "chrome",
108 │     values = [
109 │         "chrome",
110 │         "firefox",
111 │     ],
112 │ )
113 │ 
114 │ config_setting(
115 ▶     name = "browser_chrome",
116 ▶     flag_values = {":flag_browser": "chrome"},
117 │ )
118 │ 
119 │ config_setting(
120 ▶     name = "browser_firefox",
121 │     flag_values = {":flag_browser": "firefox"},
122 │ )
123 │ 
124 │ genrule(
125 │     name = "copy_manifest",
126 ▶     srcs = select({
127 ▶         ":browser_chrome": ["//devtools/projects/shell-browser/src/manifest:manifest.chrome.json"],
128 ▶         ":browser_firefox": ["//devtools/projects/shell-browser/src/manifest:manifest.firefox.json"],
129 │     }),
130 │     outs = ["manifest.json"],
131 │     cmd = "cp $< $@",
132 │ )
```

📄 `angular/devtools/projects/shell-browser/src/BUILD.bazel` L134–151 （▶ の行: 135, 138–139, 142–145）

```python
134 │ extension_package(
135 ▶     name = "prodapp",
136 │     srcs = [
137 │         ":bundle",
138 ▶         ":copy_manifest",
139 ▶         ":devtools_bundle",
140 │         ":prod_app_static_files",
141 │         "//devtools/projects/shell-browser/src:devtools.html",
142 ▶         "//devtools/projects/shell-browser/src/app:backend_bundle",
143 ▶         "//devtools/projects/shell-browser/src/app:background_bundle",
144 ▶         "//devtools/projects/shell-browser/src/app:content_script_bundle",
145 ▶         "//devtools/projects/shell-browser/src/app:detect_angular_bundle",
146 │         "//devtools/projects/shell-browser/src/app:devtools_connected_flag_bundle",
147 │         "//devtools/projects/shell-browser/src/app:ng_validate_bundle",
148 │         "//devtools/projects/shell-browser/src/assets",
149 │         "//devtools/projects/shell-browser/src/popups",
150 │     ],
151 │ )
```

📄 `angular/devtools/tools/defaults.bzl` L27–37 （▶ の行: 29–31, 33, 35）

```python
27 │ def esbuild(minify = None, **kwargs):
28 │     _esbuild(
29 ▶         minify = minify if minify != None else select({
30 ▶             "//devtools:debug_build": False,
31 ▶             "//conditions:default": True,
32 │         }),
33 ▶         # Do not change this as otherwise the sourcemaps will cause the build not to be reproducable and firefox will not publish the extension.
34 │         # NB: Do not use `select` here either as this option is not configurable and bazel doesn't resolve to a value.
35 ▶         sourcemap = False,
36 │         **kwargs
37 │     )
```

1. **105〜122 行目：`--//devtools/projects/shell-browser/src:flag_browser=chrome|firefox` の旗で、Chrome か Firefox かを選ぶ**
2. **124〜132 行目：旗で manifest を選んで `manifest.json` にする**
3. **134〜151 行目：パネル・background・content script・バックエンドなどの束ねたファイルを 1 つのディレクトリに集める**

   142〜147 行目の 6 つの `*_bundle` が、拡張の各場所で動く JavaScript です（[第 1 回](01-devtools-overview.md)）。
4. **29〜32 行目：`--//devtools:debug` を付けなければ最小化する。33〜35 行目：source map は作らない**

   コメントのとおり、source map があるとビルドが同じにならず、Firefox に出せなくなるからです。`devtools:build:chrome:debug`（package.json）はこの旗を付けます。

## 6. cypress の e2e

📄 `angular/devtools/cypress/cypress.config.js` L9–17 （▶ の行: 13, 15）

```js
 9 │ module.exports = {
10 │   defaultCommandTimeout: 10000, // Increase the default command timeout to 10 seconds
11 │   viewportHeight: 2160,
12 │   e2e: {
13 ▶     specPattern: 'integration/*.e2e.js',
14 │     supportFile: 'support/index.js',
15 ▶     baseUrl: 'http://localhost:4200',
16 │   },
17 │ };
```

📄 `angular/devtools/cypress/integration/track-state.e2e.js` L9–24 （▶ の行: 10–11, 17–18, 22）

```js
 9 │ function goToTransferStateTab() {
10 ▶   cy.get('a[mat-tab-link]:contains("Transfer State")').click();
11 ▶   cy.get('ng-transfer-state').should('exist');
12 │   cy.get('ng-transfer-state').should('be.visible');
13 │ }
14 │ 
15 │ describe('transfer state tab', () => {
16 │   beforeEach(() => {
17 ▶     cy.visit('/');
18 ▶     goToTransferStateTab();
19 │   });
20 │ 
21 │   it('shows summary stats with Keys and Size labels', () => {
22 ▶     cy.get('ng-transfer-state .summary-stats .stat-label').contains('Keys');
23 │     cy.get('ng-transfer-state .summary-stats .stat-label').contains('Size');
24 │   });
```

e2e は `devtools/cypress/integration/*.e2e.js` の 10 ファイルで、15 行目のとおり 4 節の開発用のサーバーを開きます。17〜18 行目で `/` を開いてタブを押し、22 行目のように画面の文字を確かめます。最近も 06db706238b（Transfer State のタブ、track-state.e2e.js を書き換え）や f48d2769db3（HTML だけの塊の静的なノード）で手が入っています。この章では cypress を手元で走らせていません（ブラウザと開発用のサーバーを立てる準備が要るため）。

## 7. DEMO：走らせた bazel の結果

> **🧪 DEMO — ターゲットごとのブラウザ・件数・時間（記録の再生）**
>
> これは記録です。2026-11-05 に ../angular（8576f161ae4）で bazel を走らせたログ（scratchpad/devtools-logs/e-\*.log）から、下の parse-bazel.mjs がターゲットごとの行だけを JSON に切り出しました。数は手で書いていません。「件数」と「テストの時間」は web test runner の出力（`N passed, M failed`・`Finished running tests in`）、「PASSED in」は bazel の要約の行です。「`//devtools/...` 全部」は `--test_output=errors` で走らせたので、件数の欄は空です。
>
> 回のボタンを押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-test-build)

記録から読み取れることです。

1. **同じ spec が 2 回走り、件数は同じ**

   どの回でも、`_chromium` と `_firefox` の件数は同じです（たとえば signal-graph は 26 と 26）。spec は 1 つのファイルに束ねてから両方のブラウザで走ります。
2. **Firefox は毎回遅い**

   テストの時間は Chromium で 0.3〜0.7 秒、Firefox で 1.3〜3.3 秒でした。全部の回では、PASSED in の和が Chromium の約 2.7 倍です。
3. **乱数の種は毎回変わる**

   jasmine は it の順を毎回入れ替えます（`Jasmine randomize seed`）。「絞り込みと乱数の種を試す」の回では、`--test_env=JASMINE_RANDOM_SEED=12345` で種を固定でき、出力の種が 12345 になりました。順に依る失敗を手元で繰り返すときに使えます。
4. **`--test_arg=--grep=…` では絞れない**

   同じ回で `--test_arg=--grep=cluster` を渡しても、件数は 26 のままでした。このシリーズでは、ターゲット全体を走らせています（1 つの it だけを走らせたいときは spec を `fit` に書き換える方法がありますが、../angular を変えないので試していません）。
5. **拡張のビルドは、テストのあとならキャッシュに当たる**

   「Chrome 版の拡張をビルドする」の回は 1.5 秒で、すべての作業がキャッシュに当たりました（その前に `//devtools/...` のテストを走らせたとき、同じものが作られていた）。できたものは `.bazelrc` の `--symlink_prefix=dist/` のため `bazel-bin` ではなく `dist/bin/devtools/projects/shell-browser/src/prodapp` にあり、2.4 MB、manifest の `permissions` に `debugger`（[第 17 回](17-devtools-signal-graph.md)のブレークポイント）が入っていました。

📄 `scratchpad の記録スクリプト（run-bazel.sh。第 17〜19 回のターゲットを走らせる）`

```
#!/bin/zsh
# 第 17〜19 回で使う spec のターゲットを走らせ、ログを scratchpad/devtools-logs/e-*.log に残す。
S=<scratchpad>
cd ~/angular-research/angular
P=//devtools/projects
run() { local name=$1; shift; { date; echo "+ pnpm bazel test $* --nocache_test_results --test_output=all"; /usr/bin/time -p pnpm bazel test "$@" --nocache_test_results --test_output=all; echo "exit=$?"; } > $S/devtools-logs/e-$name.log 2>&1; }
run signal-graph $P/ng-devtools/src/lib/shared/signal-graph:test $P/ng-devtools/src/lib/shared/signals-visualizer:test $P/ng-devtools/src/lib/devtools-tabs/directive-explorer/signal-graph-manager:test $P/ng-devtools-backend/src/lib/shared/utils:test
run router-transfer $P/ng-devtools-backend/src/lib/router-tree:test $P/ng-devtools/src/lib/devtools-tabs/router-tree:test $P/ng-devtools/src/lib/devtools-tabs/router-tree/router-details-row:test $P/ng-devtools/src/lib/devtools-tabs/transfer-state:test
run test-build $P/ng-devtools-backend/src/lib:client_event_subscribers_test $P/ng-devtools-backend/src/lib/directive-forest/component-tree:test $P/shell-browser/src/app:tab_manager_test $P/protocol:test

```

📄 `scratchpad の記録スクリプト（parse-bazel.mjs。ログから JSON を作る）`

```
// 第 19 回 devtools-test-build の記録。bazel のログ（scratchpad/devtools-logs/e-*.log）から、
// ターゲットごとの「ブラウザ・件数・テストの時間・PASSED in」と、走らせたコマンド・全体の時間だけを JSON にする。
// 使い方: node parse-bazel.mjs <ログのディレクトリ> <出力.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [dir, out] = process.argv.slice(2);
const RUNS = [
  { id: 'signal-graph', title: '第 17 回（signal のグラフ）', file: 'e-signal-graph.log' },
  { id: 'router-transfer', title: '第 18 回（ルーター・TransferState）', file: 'e-router-transfer.log' },
  { id: 'test-build', title: '第 19 回（バックエンド・殻・プロトコル）', file: 'e-test-build.log' },
  { id: 'all', title: '//devtools/... 全部', file: 'e-all.log' },
  { id: 'filter', title: '絞り込みと乱数の種を試す', file: 'e-filter.log' },
  { id: 'build-chrome', title: 'Chrome 版の拡張をビルドする', file: 'e-build-chrome.log' },
];
// 色の制御文字を外す
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

const runs = RUNS.map(({ id, title, file }) => {
  const lines = plain(readFileSync(`${dir}/${file}`, 'utf8')).split('\n');
  const commands = lines.filter((l) => l.startsWith('+ ')).map((l) => l.slice(2));
  const outputs = [];
  let cur = null;
  for (const l of lines) {
    let m = l.match(/^=+ Test output for (\/\/\S+):$/);
    if (m) {
      cur = { target: m[1], browser: m[1].endsWith('_firefox') ? 'Firefox' : 'Chromium', passed: null, failed: null, finishedIn: null, seed: null };
      outputs.push(cur);
      continue;
    }
    if (!cur) continue;
    m = l.match(/(Chromium|Firefox): .*(\d+)\/(\d+) test files \| (\d+) passed, (\d+) failed/);
    if (m && m[2] === m[3]) {
      cur.passed = Number(m[4]);
      cur.failed = Number(m[5]);
    }
    m = l.match(/Finished running tests in ([\d.]+s)/);
    if (m) cur.finishedIn = m[1];
    m = l.match(/Jasmine randomize seed: (\d+)/);
    if (m) cur.seed = m[1];
    if (/^=+$/.test(l.trim())) cur = null;
  }
  const summary = lines
    .map((l) => l.match(/^(\/\/\S+)\s+(PASSED|FAILED|NO STATUS)\s+in\s+([\d.]+s)/))
    .filter(Boolean)
    .map((m) => ({ target: m[1], status: m[2], time: m[3] }));
  const elapsed = lines.map((l) => l.match(/INFO: Elapsed time: ([\d.]+s)/)).filter(Boolean).map((m) => m[1]);
  const executed = lines.map((l) => l.match(/^Executed (\d+) out of (\d+) tests?: (.*)$/)).filter(Boolean).map((m) => m[0]);
  const wall = lines.map((l) => l.match(/^real ([\d.]+)$/)).filter(Boolean).map((m) => m[1] + 's');
  const date = lines.find((l) => /^[A-Z][a-z]{2} [A-Z][a-z]{2} /.test(l)) ?? null;
  // ビルドの回は、進み具合の行を除いた残り（できたものの場所と中身）をそのまま残す
  const rest =
    id === 'build-chrome'
      ? lines.filter((l) => l.trim() && !/^(Computing|Loading|Analyzing|real|user|sys|exit=|\+ |[A-Z][a-z]{2} [A-Z][a-z]{2} )/.test(l))
      : undefined;
  return { id, title, date, commands, outputs, summary, elapsed, executed, wall, rest };
});

// //devtools/... の全部の回は --test_output=errors なので、件数の代わりにターゲットの種類で数える
const all = runs.find((r) => r.id === 'all');
all.kinds = {
  browser: all.summary.filter((s) => /_(chromium|firefox)$/.test(s.target)).length,
  strictDeps: all.summary.filter((s) => s.target.endsWith('_deps')).length,
  other: all.summary.filter((s) => !/_(chromium|firefox)$/.test(s.target) && !s.target.endsWith('_deps')).length,
};
all.summary = all.summary.filter((s) => /_(chromium|firefox)$/.test(s.target));

writeFileSync(out, JSON.stringify({ runs }, null, 2) + '\n');

```

## 8. 不具合を spec の形で手元で再現する

1. **どの場所の話かを決める**

   ページの中のバックエンド（`ng-devtools-backend`）か、パネル（`ng-devtools`）か、拡張の殻（`shell-browser`）か、core の窓口（`packages/core` の `window.ng`）かです。第 17・18 回のデモのように、バックエンドに届いたものとパネルに渡したものを並べると決めやすくなります。
2. **版を確かめる**

   bazel の spec は木の core（22.2.0-next.7）で走ります（2 節）。報告が古い版の Angular なら、`window.ng` の関数が無い・違うことがあります（[第 2 回](02-devtools-detect.md)の `supportedApis`、第 17 回の `linkedSignal`）。
3. **下の表の spec に、3 節の形で it を足して走らせる**

   バックエンドなら `window.ng` の偽物と DOM、パネルなら TestBed と MessageBus の偽物、ただの関数（パネルの `*-fns.ts` やフォーマッタ）なら入力のオブジェクトを手で書くだけです。
4. **落ちることを確かめる。種を固定して繰り返す**

   `--test_env=JASMINE_RANDOM_SEED=…`（7 節）。画面の形の話なら、4 節の開発用のサーバーで目で見ます。
5. **本家には出さない**

   このシリーズでは、手元で再現して「どの章のどの行の話か」をメモにするところまでにします（[第 20 回](20-devtools-issues.md)）。手元の木の行が main で同じかも `git diff HEAD origin/main -- devtools/…` で確かめます。第 17・18 回で見たとおり、main だけで直っているものがあります。

| 章 | 直すファイル（主なもの） | 足す spec | bazel のターゲット（//devtools/projects/ を略） |
| --- | --- | --- | --- |
| [2. 見つける](02-devtools-detect.md) | shared-utils の angular-check・バックエンドの ng-debug-api | angular-check.spec.ts・ng-debug-api.spec.ts・supported-apis.spec.ts | `shared-utils:test`・`ng-devtools-backend/src/lib/shared/ng-debug-api:ng-debug-api_test` |
| [3. メッセージの道](03-devtools-messaging.md) | shell-browser の tab\_manager・comm-utils、パネルの frame\_manager | tab\_manager\_spec.ts・comm-utils.spec.ts・frame\_manager\_spec.ts | `shell-browser/src/app:tab_manager_test`・`…:comm_utils_test`・`ng-devtools/src/lib/application-services:test_application_services` |
| [4. プロトコル](04-devtools-protocol.md) | protocol の priority-aware-message-bus | priority-aware-message-bus.spec.ts | `protocol:test` |
| [5. 木を集める](05-devtools-component-tree.md)・[6. 塊](06-devtools-control-flow.md) | component-tree・get-roots・render-tree | component-tree.spec.ts・get-roots.spec.ts・render-tree.spec.ts | `…/directive-forest/component-tree:test`・`…/directive-forest/tree-strategies:test` |
| [7. 見分ける](07-devtools-identity.md) | identity-tracker | identity-tracker.spec.ts | `…/directive-forest/identity-tracker:test` |
| [8. パネルの木](08-devtools-forest-ui.md) | directive-forest の data source・diffing・絞り込み | component-data-source.spec.ts・diffing.spec.ts・directive-forest-filter-fn-generator.spec.ts・tree-node.component.spec.ts | `…/directive-explorer/directive-forest:test` ほか同じ下の 4 つ |
| [9. 直列化](09-devtools-state-serializer.md) | state-serializer | state-serializer.spec.ts・prop-type.spec.ts | `…/shared/state-serializer:test` |
| [10. 入れ子](10-devtools-property-resolver.md) | パネルの property-resolver・object-tree-explorer | directive-property-resolver.spec.ts・property-data-source.spec.ts・object-tree-explorer.spec.ts | `…/directive-explorer/property-resolver:test`・`ng-devtools/src/lib/shared/object-tree-explorer:test` |
| [11. 書き換え](11-devtools-property-mutation.md) | property-mutation | property-mutation.spec.ts | `…/directive-forest/property-mutation:test` |
| [12. 選ぶ・光らせる](12-devtools-inspector-highlight.md) | component-inspector・highlighter | component-inspector.spec.ts・highlighter.spec.ts・highlights.spec.ts | `…/component-inspector:test`・`…/shared/highlighter:test` |
| [13. プロファイラー](13-devtools-profiler-capture.md) | profiling の capture・profiler | （capture.ts と profiler/ の spec は無い）performance-track.spec.ts | `ng-devtools-backend/src/lib/profiling:performance_track_test` |
| [14. 記録を描く](14-devtools-profiler-formatters.md) | record-formatter の各フォーマッタ | record-formatter.spec.ts・flamegraph-formatter.spec.ts・tree-map-formatter.spec.ts・frame-merger.spec.ts | `…/recording-timeline/record-formatter:test` ほか |
| [15. CD analyzer](15-devtools-cd-analyzer.md) | cd-analyzer | analyzer.spec.ts | `…/profiling/cd-analyzer:test` |
| [16. 注入器の木](16-devtools-injector-tree.md) | パネルの injector-tree-fns | injector-tree-fns.spec.ts | `ng-devtools/src/lib/devtools-tabs/injector-tree:test` |
| [17. signal のグラフ](17-devtools-signal-graph.md) | devtools-signal-graph・utils・signal-graph-ref | devtools-signal-graph.spec.ts・utils.spec.ts・signal-graph-ref.spec.ts（breakpoint\_manager の spec は main にだけある） | `ng-devtools/src/lib/shared/signal-graph:test`・`…/shared/utils:test` |
| [18. ルーター・TransferState](18-devtools-router-transfer.md) | router-tree・serialization・transfer-state のタブ | router-tree.spec.ts・serialization.spec.ts・transfer-state.component.spec.ts（hydration-overlays の spec は無い） | `…/router-tree:test`・`…/devtools-tabs/transfer-state:test` |

ターゲットの名前は、7 節の「`//devtools/...` 全部」の回で bazel が出した 49 個の名前から写しました。

## テストと直し方

- この章の話（BUILD・規則・CI）を変える直しは、spec ではなく `bazel query` とビルドの結果で確かめます。2 節の `tests(//devtools/...)` の数（`js_test` 147 = 49 × 3）は、規則を変えたときの見張りになります。
- テストの規則の側の直しは、devtools だけなら `devtools/tools/defaults.bzl`、リポジトリ全体なら `tools/bazel/web_test.bzl` です。`wtr_test` そのものは外部の rules\_browsers で、この木の中にはありません。
- 最近の変更では、main の 29f9dd5e778（2026-09-10、refactor）が `devtools/tools/angular-optimization` のプラグインを新しい API に合わせました。手元の木にはまだありません（`git log HEAD..origin/main -- devtools` は 30 個）。
- 本家に PR を出すことは勧めません。spec を足して試すのは手元の写しの上だけにし、../angular を元に戻せるようにしておきます。

## 聞かれそうな質問

**Q. `bazel test …:test` の出力が 2 つ出るのはなぜですか？**

`zoneless_web_test_suite` が最後に呼ぶ `wtr_test` が、`_firefox` と `_chromium` の 2 つのテストを作り、`native.test_suite` で `:test` に束ねるからです（rules\_browsers の wtr/index.bzl の 60〜77 行目）。3 つめの `_debug` は `manual` で、ふつうは走りません。

**Q. devtools の spec は Angular のアプリを起動していますか？**

バックエンドの spec はほとんどしません。`window.ng` を手で作ったオブジェクトに差し替え（client-event-subscribers.spec.ts の 62〜64 行目、render-tree.spec.ts の 32〜45 行目）、DOM の要素と `Map` で木を作ります。パネルの spec は TestBed で本物のコンポーネントを作り、MessageBus を偽物にします（transfer-state.component.spec.ts の 73 行目）。どちらも TestBed は zoneless で用意されます（browser\_zoneless\_tests.init.mts の 19 行目）。

**Q. spec はどの版の Angular で走りますか？**

この木の `packages/core` から作ったもの（22.2.0-next.7）です。devtools の defaults.bzl の 60〜62 行目が足す `//:node_modules/@angular/core` は、package.json の `workspace:*` でこの木を指します。このサイトのデモは 22.1.6 なので、版で違う動きはデモと spec で食い違うことがあります。

**Q. 拡張を手元で作って Chrome に入れるには？**

`pnpm devtools:build:chrome`（package.json の 38 行目）で `prodapp` を作り、`dist/bin/devtools/projects/shell-browser/src/prodapp` を Chrome の「パッケージ化されていない拡張機能を読み込む」で読み込みます。最小化を外したいなら `:debug` の付いたスクリプト（defaults.bzl の 29〜32 行目の旗）です。

**Q. cypress の e2e はもう使われていないのでは？**

使われています。pr.yml の 63〜70 行目で、PR ごとに開発用のサーバーを立てて `pnpm devtools:test:e2e` を走らせます。e2e の spec は 10 ファイルで、2026 年にも Transfer State のタブなどで書き換えられています。

## 読み終えて

- devtools の `:test` は `ts_test_library` と `zoneless_web_test_suite` の組で、`wtr_test` が Chromium と Firefox の 2 つを作ります。
- spec は木の core で走り、バックエンドは `window.ng` の偽物と DOM、パネルは TestBed と MessageBus の偽物で書かれています。
- CI は単体の spec・Chrome 版のビルド・cypress の e2e の 3 段で、開発用のサーバーはパネルとデモのアプリを iframe でつないだ 1 枚のページです。
- it の絞り込みは `--test_arg` では効かず、乱数の種は `--test_env=JASMINE_RANDOM_SEED` で固定できます。
- 不具合を再現するときは、場所と版を決めてから、表の spec に it を足して手元で落とします。

---

← 前: [ルーターの木・TransferState・ハイドレーションの重ね表示](18-devtools-router-transfer.md)  
次: [issue と PR を読む：DevTools の今](20-devtools-issues.md) →
