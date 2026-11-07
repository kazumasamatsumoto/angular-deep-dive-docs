[目次](../README.md) › [Service Worker の内側](README.md) › 第 19 回 / 全 20 回

# アプリ側のテストとテストの走らせ方

> test/ の comm\_spec.ts・provider\_spec.ts・integration\_spec.ts と testing/mock.ts の MockServiceWorkerContainer、config/test/generator\_spec.ts。service-worker のテストのターゲットの表と、手元で走らせるコマンド、直したいときにどの spec に足すか。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sw-testing-app)

---

`packages/service-worker` のテストは、ワーカー（`worker/test`）・アプリの側（`test/`）・ngsw.json を作る側（`config/test`）の 3 つのフォルダに分かれていて、bazel のターゲットも別々です。この章では、アプリの側の 3 つの spec（`comm_spec.ts`・`provider_spec.ts`・`integration_spec.ts`）と、それを支える `testing/mock.ts` の偽物の `navigator.serviceWorker` を読み、各 `BUILD.bazel` の行から「どのファイルを変えたら、どのターゲットを、どのフィルタで走らせるか」の表を作ります。`provider_spec.ts` が Node では 2 本しか走らない、という落とし穴もここで見ます。

読む対象は `packages/service-worker/**/BUILD.bazel`、`testing/mock.ts`、`test/integration_spec.ts` と、`test/comm_spec.ts`・`test/provider_spec.ts`・`config/test/generator_spec.ts` の describe の並びです。

1. [1. 全体像](01-sw-overview.md)
2. [2. Generator](02-sw-config-generator.md)
3. [3. ビルド](03-sw-cli-build.md)
4. [4. 登録](04-sw-register.md)
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
19. **19. アプリ側のテスト**（この章）
20. [20. issue と PR を読む](20-sw-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> **ターゲット**は `//packages/service-worker/test:test` のような bazel の名前で、`:` の前が `BUILD.bazel` のあるフォルダ、後ろがその中の `name` です。BUILD.bazel の読み方と `jasmine_test`・`ng_web_test_suite` のマクロの中身は[contrib-bazel](../contrib/04-contrib-bazel.md)、1 本だけ走らせる方法は[contrib-run-tests](../contrib/05-contrib-run-tests.md)にあります。この章では service-worker の BUILD.bazel だけを読みます。

## 1. テストのターゲットを全部並べる

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel query 'tests(//packages/service-worker/...)'
```

📄 `出力（2026-11-03。ログは scratchpad/sw-logs/e-query-tests.log）`

```
js_test rule //packages/service-worker:service-worker_api
_strict_deps_test rule //packages/service-worker:service-worker_deps
js_test rule //packages/service-worker:service-worker_errors
_strict_deps_test rule //packages/service-worker/cli:cli_deps
_strict_deps_test rule //packages/service-worker/config:config_deps
jasmine_test rule //packages/service-worker/config/test:test
_strict_deps_test rule //packages/service-worker/config/test:test_lib_deps
_strict_deps_test rule //packages/service-worker/config/testing:testing_deps
jasmine_test rule //packages/service-worker/test:test
_strict_deps_test rule //packages/service-worker/test:test_lib_deps
js_test rule //packages/service-worker/test:test_web_chromium
js_test rule //packages/service-worker/test:test_web_debug
js_test rule //packages/service-worker/test:test_web_firefox
_strict_deps_test rule //packages/service-worker/testing:testing_deps
_strict_deps_test rule //packages/service-worker/worker:main_deps
_strict_deps_test rule //packages/service-worker/worker:worker_deps
jasmine_test rule //packages/service-worker/worker/test:test
_strict_deps_test rule //packages/service-worker/worker/test:test_lib_deps
_strict_deps_test rule //packages/service-worker/worker/testing:testing_deps
```

19 個のうち、spec を走らせるのは `jasmine_test` の 3 つ（`config/test:test`・`test:test`・`worker/test:test`）と、ブラウザで走らせる `js_test` の `test_web_chromium`・`test_web_firefox`・`test_web_debug`、公開 API を比べる `service-worker_api`・`service-worker_errors` です。`_strict_deps_test` の 11 個は、ソースが `deps` に書いていないものを import していないかを見るだけです。`test_web_debug` は `manual` の印が付いていて（`bazel query --output=build` で確かめた）、`//packages/service-worker/...` の一括の実行には入りません。SW-COMMON の基準の実行が「18 ターゲット」だったのはこのためです。

## 2. 3 つのフォルダの BUILD.bazel

📄 `angular/packages/service-worker/worker/test/BUILD.bazel` L1–22 （▶ の行: 6–7, 11–13, 17–18）

```python
 1 │ load("//tools:defaults.bzl", "ts_project", "zoneless_jasmine_test")
 2 │ 
 3 │ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob([
 7 ▶         "**/*.ts",
 8 │     ]),
 9 │     deps = [
10 │         "//packages:types",
11 ▶         "//packages/service-worker/config",
12 ▶         "//packages/service-worker/worker",
13 ▶         "//packages/service-worker/worker/testing",
14 │     ],
15 │ )
16 │ 
17 ▶ zoneless_jasmine_test(
18 ▶     name = "test",
19 │     data = [
20 │         ":test_lib",
21 │     ],
22 │ )
```

📄 `angular/packages/service-worker/worker/testing/BUILD.bazel` L1–15 （▶ の行: 3, 6–7, 10, 13）

```python
 1 │ load("//tools:defaults.bzl", "ts_project")
 2 │ 
 3 ▶ package(default_visibility = ["//visibility:public"])
 4 │ 
 5 │ ts_project(
 6 ▶     name = "testing",
 7 ▶     testonly = True,
 8 │     srcs = glob(["**/*.ts"]),
 9 │     deps = [
10 ▶         "//:node_modules/rxjs",
11 │         "//:node_modules/typescript",
12 │         "//packages:types",
13 ▶         "//packages/service-worker/worker",
14 │     ],
15 │ )
```

ワーカーの spec は 6〜8 行目で `worker/test/` の .ts を全部集め、12〜13 行目でワーカーの本体（`//packages/service-worker/worker`）と偽物（`worker/testing`）に頼ります。11 行目の `config` は、happy\_spec.ts が `processNavigationUrls` を import するためです。17〜22 行目の `zoneless_jasmine_test` が `:test` で、zone.js を読まない Node の jasmine です。`shard_count` は無いので、出力は 1 つです。worker/testing の側は 3 行目で誰からも使えるようにし、6 行目の `testonly` で本番のビルドには入らないようにしています。10 行目の rxjs は clients.ts の `Subject` のためです。

📄 `angular/packages/service-worker/test/BUILD.bazel` L1–33 （▶ の行: 6–7, 12–17, 21–22, 28–29）

```python
 1 │ load("//tools:defaults.bzl", "ng_web_test_suite", "ts_project", "zoneless_jasmine_test")
 2 │ 
 3 │ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob([
 7 ▶         "**/*.ts",
 8 │     ]),
 9 │     deps = [
10 │         "//:node_modules/rxjs",
11 │         "//packages:types",
12 ▶         "//packages/core",
13 ▶         "//packages/core/testing",
14 ▶         "//packages/service-worker",
15 ▶         "//packages/service-worker/testing",
16 ▶         "//packages/service-worker/worker",
17 ▶         "//packages/service-worker/worker/testing",
18 │     ],
19 │ )
20 │ 
21 ▶ zoneless_jasmine_test(
22 ▶     name = "test",
23 │     data = [
24 │         ":test_lib",
25 │     ],
26 │ )
27 │ 
28 ▶ ng_web_test_suite(
29 ▶     name = "test_web",
30 │     deps = [
31 │         ":test_lib",
32 │     ],
33 │ )
```

1. **6〜8・12〜17 行目：アプリの側とワーカーの両方に頼る**

   `test/` の 3 つの spec を 1 つの `test_lib` にし、12〜13 行目で `core` と `core/testing`（TestBed）、14〜15 行目でアプリの側のパッケージと偽物（`testing/`）、16〜17 行目でワーカーの本体と `worker/testing` を足します。16〜17 行目があるのは integration\_spec.ts が本物の `Driver` を動かすからです（5 節）。
2. **21〜26 行目：:test は Node**

   ワーカーと同じ `zoneless_jasmine_test` です。
3. **28〜33 行目：:test\_web は同じ spec をブラウザで**

   `ng_web_test_suite` は spec を 1 つのファイルに束ね（esbuild）、Web Test Runner でブラウザに読ませるマクロで、`test_web` はブラウザごとのターゲット `test_web_chromium`・`test_web_firefox`（と手で走らせる `test_web_debug`）をまとめた `test_suite` です（`bazel query 'kind("rule", //packages/service-worker/test:*)' --output label_kind` で `test_suite rule //packages/service-worker/test:test_web` と出る。ログは e-query-test-pkg.log）。ブラウザの側の初期化は `//tools/testing:browser` で、`import 'zone.js'` のあとに `provideZonelessChangeDetection()` を付けて TestBed を初めます。だからブラウザの出力には NG0914（zoneless なのに Zone.js を読んでいる）の警告が出ます（4 節）。

📄 `angular/packages/service-worker/testing/BUILD.bazel` L1–12 （▶ の行: 5–7, 10）

```python
 1 │ load("//tools:defaults.bzl", "ng_project")
 2 │ 
 3 │ package(default_visibility = ["//visibility:public"])
 4 │ 
 5 ▶ ng_project(
 6 ▶     name = "testing",
 7 ▶     testonly = True,
 8 │     srcs = glob(["**/*.ts"]),
 9 │     deps = [
10 ▶         "//:node_modules/rxjs",
11 │     ],
12 │ )
```

📄 `angular/packages/service-worker/config/test/BUILD.bazel` L1–22 （▶ の行: 10–11, 15, 19–20）

```python
 1 │ load("//tools:defaults.bzl", "ts_project", "zoneless_jasmine_test")
 2 │ 
 3 │ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 │     srcs = glob(
 7 │         ["**/*.ts"],
 8 │     ),
 9 │     deps = [
10 ▶         "//packages/service-worker/config",
11 ▶         "//packages/service-worker/config/testing",
12 │     ],
13 │ )
14 │ 
15 ▶ zoneless_jasmine_test(
16 │     name = "test",
17 │     data = [
18 │         ":test_lib",
19 ▶         "//packages/service-worker/config",
20 ▶         "//packages/service-worker/config/testing",
21 │     ],
22 │ )
```

アプリの側の偽物 `testing/` は `ng_project` で、10 行目のとおり rxjs だけに頼る小さなものです（3 節）。`config/test` は Generator（`config`）と、その偽物のファイルシステム（`config/testing`）だけに頼り、15〜22 行目で同じく Node の jasmine です。generator\_spec.ts の中身は[第 2 回](02-sw-config-generator.md)で引用しています。

📄 `angular/packages/service-worker/BUILD.bazel` L68–94 （▶ の行: 68, 71–72, 74, 86, 89, 92–93）

```python
68 ▶ api_golden_test_npm_package(
69 │     name = "service-worker_api",
70 │     data = [
71 ▶         ":npm_package",
72 ▶         "//goldens:public-api",
73 │     ],
74 ▶     golden_dir = "goldens/public-api/service-worker",
75 │     npm_package = "packages/service-worker/npm_package",
76 │ )
77 │ 
78 │ filegroup(
79 │     name = "files_for_docgen",
80 │     srcs = glob([
81 │         "*.ts",
82 │         "src/**/*.ts",
83 │     ]) + ["PACKAGE.md"],
84 │ )
85 │ 
86 ▶ api_golden_test(
87 │     name = "service-worker_errors",
88 │     data = [
89 ▶         "//goldens:public-api",
90 │         "//packages/service-worker",
91 │     ],
92 ▶     entry_point = "src/errors.d.ts",
93 ▶     golden = "goldens/public-api/service-worker/errors.api.md",
94 │ )
```

spec ではないテストが 2 つあります。68〜76 行目の `service-worker_api` は、作った npm のパッケージ（`:npm_package`）の公開 API を `goldens/public-api/service-worker` の .api.md と比べ、86〜94 行目の `service-worker_errors` は `src/errors.d.ts` を `errors.api.md` と比べます。公開 API やエラーの番号を変えたときだけ落ちるテストで、更新の仕方は[contrib-public-api](../contrib/08-contrib-public-api.md)です。

## 3. testing/mock.ts：偽物の navigator.serviceWorker

📄 `angular/packages/service-worker/testing/mock.ts` L27–63 （▶ の行: 27, 30–33, 35, 37, 39, 51, 55–56, 59–62）

```ts
27 ▶ export class MockServiceWorkerContainer {
28 │   private onControllerChange: Function[] = [];
29 │   private onMessage: Function[] = [];
30 ▶   mockRegistration: MockServiceWorkerRegistration | null = null;
31 ▶   controller: MockServiceWorker | null = null;
32 ▶   messages = new Subject<any>();
33 ▶   notificationClicks = new Subject<{}>();
34 │ 
35 ▶   addEventListener(event: 'controllerchange' | 'message', handler: Function) {
36 │     if (event === 'controllerchange') {
37 ▶       this.onControllerChange.push(handler);
38 │     } else if (event === 'message') {
39 ▶       this.onMessage.push(handler);
40 │     }
41 │   }
42 │ 
43 │   removeEventListener(event: 'controllerchange', handler: Function) {
44 │     if (event === 'controllerchange') {
45 │       this.onControllerChange = this.onControllerChange.filter((h) => h !== handler);
46 │     } else if (event === 'message') {
47 │       this.onMessage = this.onMessage.filter((h) => h !== handler);
48 │     }
49 │   }
50 │ 
51 ▶   async register(url: string): Promise<void> {
52 │     return;
53 │   }
54 │ 
55 ▶   async getRegistration(): Promise<ServiceWorkerRegistration> {
56 ▶     return this.mockRegistration as any;
57 │   }
58 │ 
59 ▶   setupSw(url: string = '/ngsw-worker.js'): void {
60 ▶     this.mockRegistration = new MockServiceWorkerRegistration();
61 ▶     this.controller = new MockServiceWorker(this, url);
62 ▶     this.onControllerChange.forEach((onChange) => onChange(this.controller));
63 │   }
```

1. **27〜33 行目：ServiceWorkerContainer のふり**

   アプリの側の `NgswCommChannel` は、`navigator.serviceWorker`（`ServiceWorkerContainer`）を受け取って、`controller`・`getRegistration()`・`controllerchange` と `message` のイベントを使います（[第 13 回](13-sw-swupdate.md)）。この偽物は、それを 31 行目の `controller`、30 行目の `mockRegistration`、28〜29 行目のハンドラーの配列で持ち、32〜33 行目の 2 つの Subject に「ページからワーカーへ送ったもの」を流します。
2. **35〜41 行目：2 種類のイベントだけ**

   `controllerchange` と `message` 以外の種類は黙って捨てます。
3. **51〜57 行目：register と getRegistration**

   `register` は何もしません（登録の spec は `provider_spec.ts` が本物の `navigator.serviceWorker.register` を `spyOn` する、4 節）。`getRegistration` は `setupSw` の前は `null` で解決します。
4. **59〜63 行目：setupSw で「ワーカーが動き出した」**

   登録と controller を作り、62 行目で `controllerchange` のハンドラーを呼びます。spec は `mock.setupSw()` を呼ぶ前と後で、`NgswCommChannel` が controller を待つ振る舞いを確かめます。

📄 `angular/packages/service-worker/testing/mock.ts` L65–106 （▶ の行: 65–68, 80–81, 86, 92, 96–97, 103）

```ts
 65 ▶   sendMessage(value: Object): void {
 66 ▶     this.onMessage.forEach((onMessage) =>
 67 ▶       onMessage({
 68 ▶         data: value,
 69 │       }),
 70 │     );
 71 │   }
 72 │ }
 73 │ 
 74 │ export class MockServiceWorker {
 75 │   constructor(
 76 │     private mock: MockServiceWorkerContainer,
 77 │     readonly scriptURL: string,
 78 │   ) {}
 79 │ 
 80 ▶   postMessage(value: Object) {
 81 ▶     this.mock.messages.next(value);
 82 │   }
 83 │ }
 84 │ 
 85 │ export class MockServiceWorkerRegistration {
 86 ▶   pushManager: PushManager = new MockPushManager() as any;
 87 │ }
 88 │ 
 89 │ export class MockPushManager {
 90 │   private subscription: PushSubscription | null = null;
 91 │ 
 92 ▶   getSubscription(): Promise<PushSubscription | null> {
 93 │     return Promise.resolve(this.subscription);
 94 │   }
 95 │ 
 96 ▶   subscribe(options?: PushSubscriptionOptionsInit): Promise<PushSubscription> {
 97 ▶     this.subscription = new MockPushSubscription() as any;
 98 │     return Promise.resolve(this.subscription!);
 99 │   }
100 │ }
101 │ 
102 │ export class MockPushSubscription {
103 ▶   unsubscribe(): Promise<boolean> {
104 │     return Promise.resolve(true);
105 │   }
106 │ }
```

向きを整理すると、**ページ → ワーカー**は 80〜81 行目の `MockServiceWorker.postMessage` が `mock.messages` に流し、**ワーカー → ページ**は 65〜71 行目の `sendMessage` が `message` のハンドラーを `{data: value}` で呼びます。86 行目の `pushManager` は 89〜100 行目の `MockPushManager` で、`subscribe` するとそのあとの `getSubscription` が同じ `MockPushSubscription` を返します（[第 16 回](16-sw-push.md)の spec）。

📄 `angular/packages/service-worker/testing/mock.ts` L11–25 （▶ の行: 14, 16, 18–19）

```ts
11 │ export const patchDecodeBase64 = (proto: {decodeBase64: typeof atob}) => {
12 │   let unpatch: () => void = () => undefined;
13 │ 
14 ▶   if (typeof atob === 'undefined' && typeof Buffer === 'function') {
15 │     const oldDecodeBase64 = proto.decodeBase64;
16 ▶     const newDecodeBase64 = (input: string) => Buffer.from(input, 'base64').toString('binary');
17 │ 
18 ▶     proto.decodeBase64 = newDecodeBase64;
19 ▶     unpatch = () => {
20 │       proto.decodeBase64 = oldDecodeBase64;
21 │     };
22 │   }
23 │ 
24 │   return unpatch;
25 │ };
```

`SwPush.requestSubscription` は VAPID の公開鍵を base64 から戻すのに `atob` を使います。14 行目で `atob` が無く `Buffer` がある環境（古い Node）なら、16〜18 行目で `Buffer` で戻す関数に差し替え、19 行目の戻す関数を返します。comm\_spec.ts の `describe('SwPush')` は `beforeAll` でこれを呼び、`afterAll` で戻します。今の Node には `atob` があるので、差し替えは起きません。

## 4. comm\_spec.ts と provider\_spec.ts の並び

中身は第 4・13・16 回で引用しているので、ここでは describe の並びと本数だけを、`grep -n "describe(\|it("` と実行の結果で確かめます。

| ファイル | describe | it | 何を偽物にするか | 章 |
| --- | --- | --- | --- | --- |
| comm\_spec.ts（566 行）<br>一番外は `ServiceWorker library` | `NgswCommsChannel` | 2 | `MockServiceWorkerContainer`（3 節） | [第 13 回](13-sw-swupdate.md) |
| `ngswCommChannelFactory`（と `server`） | 4 | `globalThis.ngServerMode`・`PLATFORM_ID`、`navigator` を消す・差し替える | [第 4 回](04-sw-register.md) |   |
| `SwPush`（requestSubscription・unsubscribe・messages・notificationClicks・notificationCloses・subscription・with no SW） | 18 | `MockPushManager`・`MockPushSubscription`、`patchDecodeBase64` | [第 16 回](16-sw-push.md) |   |
| `SwUpdate`（と with no SW） | 11 | `mock.sendMessage` でワーカーからの知らせを作る | [第 13 回](13-sw-swupdate.md) |   |
| provider\_spec.ts（495 行）<br>`provideServiceWorker` と `ServiceWorkerModule` の 2 回 | `register` | 7 × 2 | 本物の `navigator.serviceWorker.register` を `spyOn`。`registrationStrategy` は `fakeAsync` と `tick` | [第 4 回](04-sw-register.md) |
| `SwRegistrationOptions` | 4 × 2 |   |   |   |
| `registrationStrategy` | 14 × 2 |   |   |   |
| integration\_spec.ts（165 行） | `ngsw + companion lib` | 4 | ページは `MockServiceWorkerContainer`、ワーカーは本物の `Driver` と SwTestHarness | この章の 5 節 |
| config/test/generator\_spec.ts（590 行） | `Generator`（と `processNavigationUrls()`） | 7 + 3 | config/testing の `MockFilesystem`・`HashTrackingMockFilesystem`、`Date.now` を `spyOn` | [第 2 回](02-sw-config-generator.md) |

`provider_spec.ts` は、`forEach` で 2 つの API 名ごとに `describe` を作り、その最初で「`navigator` が無いか `navigator.serviceWorker` が無ければ、`it('should pass')` を 1 本だけ置いて戻る」という書き方をしています（コメントは「Jasmine will throw if there are no tests.」）。Node には `navigator` はあっても `navigator.serviceWorker` は無いので、**Node の `:test` では 50 本の登録の spec が 1 本も走らず、2 本の should pass だけ**になります。走らせて確かめた結果が下です。

📄 `出力（2026-11-03）`

```
# //packages/service-worker/test:test（Node。e-app-all.log と e-app-provider-node.log）
41 specs, 0 failures                       ← フィルタ無し
Ran 2 of 41 specs                          ← --filter='^provideServiceWorker|^ServiceWorkerModule'

# //packages/service-worker/test:test_web_chromium（e-app-chromium.log）
NG0914: The application is using zoneless change detection, but is still loading Zone.js. ...
Chromium: |██████████████████████████████| 1/1 test files | 89 passed, 0 failed
//packages/service-worker/test:test_web_chromium                         PASSED in 0.8s

# //packages/service-worker/test:test_web_firefox（e-app-firefox.log）
Firefox: |██████████████████████████████| 1/1 test files | 89 passed, 0 failed
//packages/service-worker/test:test_web_firefox                          PASSED in 4.4s
```

- Node の 41 本 = comm\_spec 35 + integration 4 + provider の should pass 2。
- ブラウザの 89 本 = comm\_spec 35 + integration 4 + provider 25 × 2。
- だから `provider.ts`・`module.ts` を変えたら、`:test` が PASSED でも何も確かめていません。`:test_web_chromium`（か firefox）を走らせます。`registrationStrategy` の spec が `fakeAsync` を使えるのも、ブラウザの側の初期化が zone.js を読むからです（2 節）。

## 5. integration\_spec.ts：ページとワーカーを 1 本の線でつなぐ

📄 `angular/packages/service-worker/test/integration_spec.ts` L81–117 （▶ の行: 81, 83, 96–99, 101–103, 106–107, 109, 113, 115–116）

```ts
 81 ▶   const server = new MockServerStateBuilder().withStaticFiles(dist).withManifest(manifest).build();
 82 │ 
 83 ▶   const serverUpdate = new MockServerStateBuilder()
 84 │     .withStaticFiles(distUpdate)
 85 │     .withManifest(manifestUpdate)
 86 │     .build();
 87 │ 
 88 │   describe('ngsw + companion lib', () => {
 89 │     let mock: MockServiceWorkerContainer;
 90 │     let comm: NgswCommChannel;
 91 │     let scope: SwTestHarness;
 92 │     let driver: Driver;
 93 │ 
 94 │     beforeEach(async () => {
 95 │       // Fire up the client.
 96 ▶       mock = new MockServiceWorkerContainer();
 97 ▶       comm = new NgswCommChannel(mock as any);
 98 ▶       scope = new SwTestHarnessBuilder().withServerState(server).build();
 99 ▶       driver = new Driver(scope, scope, new CacheDatabase(scope));
100 │ 
101 ▶       scope.clients.add('default', scope.registration.scope);
102 ▶       scope.clients.getMock('default')!.queue.subscribe((msg) => {
103 ▶         mock.sendMessage(msg);
104 │       });
105 │ 
106 ▶       mock.messages.subscribe((msg) => {
107 ▶         scope.handleMessage(msg, 'default');
108 │       });
109 ▶       mock.notificationClicks.subscribe((msg: Object) => {
110 │         scope.handleMessage(msg, 'default');
111 │       });
112 │ 
113 ▶       mock.setupSw();
114 │ 
115 ▶       await Promise.all(scope.handleFetch(new MockRequest('/only.txt'), 'default'));
116 ▶       await driver.initialized;
117 │     });
```

1. **81〜86 行目：v1 と v2 のサーバー**

   ワーカーのハーネスの `MockServerStateBuilder`（[第 18 回](18-sw-testing-harness.md)）で、`/only.txt` だけを持つ 2 つのサーバーを作ります。v1 と v2 は ngsw.json の `appData.version` と中身が違います。
2. **96〜99 行目：ページの側とワーカーの側を作る**

   ページは `MockServiceWorkerContainer` を渡した本物の `NgswCommChannel`、ワーカーは SwTestHarness と本物の `Driver` です。
3. **101〜104 行目：ワーカー → ページ**

   ハーネスのタブ `default` の `queue`（Driver がそのタブに postMessage したもの）を購読し、`mock.sendMessage` でページの側の `message` のハンドラーへ渡します。
4. **106〜111 行目：ページ → ワーカー**

   ページが controller に postMessage したもの（`mock.messages`）を、`scope.handleMessage(msg, 'default')` でワーカーのメッセージのイベントにします。
5. **113〜116 行目：ワーカーを動かして初期化を待つ**

   `setupSw()` で controller を作り、`/only.txt` の fetch を 1 回送って、`driver.initialized` を待ちます。

📄 `angular/packages/service-worker/test/integration_spec.ts` L119–149 （▶ の行: 120–121, 125–126, 128, 130–131, 145）

```ts
119 │     it('communicates back and forth via update check', async () => {
120 ▶       const update = new SwUpdate(comm);
121 ▶       await update.checkForUpdate();
122 │     });
123 │ 
124 │     it('detects an actual update', async () => {
125 ▶       const update = new SwUpdate(comm);
126 ▶       scope.updateServerState(serverUpdate);
127 │ 
128 ▶       const gotUpdateNotice = (async () => await obsToSinglePromise(update.versionUpdates))();
129 │ 
130 ▶       await update.checkForUpdate();
131 ▶       await gotUpdateNotice;
132 │     });
133 │ 
134 │     it('receives push message notifications', async () => {
135 │       const push = new SwPush(comm);
136 │       scope.updateServerState(serverUpdate);
137 │ 
138 │       const gotPushNotice = (async () => {
139 │         const message = await obsToSinglePromise(push.messages);
140 │         expect(message).toEqual({
141 │           test: 'success',
142 │         });
143 │       })();
144 │ 
145 ▶       await scope.handlePush({
146 │         test: 'success',
147 │       });
148 │       await gotPushNotice;
149 │     });
```

120〜121 行目は、本物の `SwUpdate.checkForUpdate()` が nonce 付きの `CHECK_FOR_UPDATES` を送り、ワーカーの `OPERATION_COMPLETED` が返ってきて Promise が解決する、までの往復です。126 行目でサーバーを v2 にすると、130 行目の確認で `versionUpdates` に知らせ（VERSION\_DETECTED）が流れ、128・131 行目でそれを待ちます。145 行目の `handlePush` はワーカーへの push のイベントで、ページの `SwPush.messages` に届きます。4 本とも `expect` はほとんど無く、「待っている Promise が解決すること」自体が確かめです。メッセージの形（msg.ts）をワーカーとアプリの片方だけ変えると、待っている Promise が解決せず、it が終わらなくなります。

## 6. 変えたファイルから、走らせるターゲットを選ぶ

> **🧪 DEMO — 変えたソースから、走らせるコマンドと足す spec を選ぶ**
>
> 2026-11-03 に ../angular（8576f161ae4）で 1 回ずつ走らせた結果を、この章の .ts に持っています（通信はしない）。フィルタは、そのとき使ったものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sw-testing-app)

| ターゲット | 場所 | フィルタ | 本数 | 時間 |
| --- | --- | --- | --- | --- |
| `//packages/service-worker/worker/test:test` | Node（zoneless） | serving ngsw/state\|messageerror events\|unhandledrejection events | Ran 6 of 153 | 0.6s（jasmine 0.008 秒） |
| `//packages/service-worker/worker/test:test` | Node（zoneless） | ^Driver | Ran 117 of 153 | 0.7s（jasmine 0.071 秒） |
| `//packages/service-worker/worker/test:test` | Node（zoneless） | ^(data cache\|prefetch assets\|IdleScheduler) | Ran 26 of 153 | 0.6s（jasmine 0.026 秒） |
| `//packages/service-worker/worker/test:test` | Node（zoneless） | ^isLocalhost | Ran 10 of 153 | 0.7s（jasmine 0.026 秒） |
| `//packages/service-worker/test:test` | Node（zoneless） | ^ServiceWorker library SwUpdate | Ran 11 of 41 | 0.6s（jasmine 0.017 秒） |
| `//packages/service-worker/test:test` | Node（zoneless） | ngsw \\+ companion lib | Ran 4 of 41 | 0.6s（jasmine 0.008 秒） |
| `//packages/service-worker/test:test_web_chromium` | Chromium（zone.js あり） | （なし） | 89 passed | 0.8s（wtr 0.3 秒） |
| `//packages/service-worker/test:test_web_firefox` | Firefox（zone.js あり） | （なし） | 89 passed | 4.4s（wtr 3.8 秒） |
| `//packages/service-worker/config/test:test` | Node（zoneless） | processNavigationUrls | Ran 3 of 10 | 0.6s（jasmine 0.003 秒） |
| `//packages/service-worker:service-worker_api と :service-worker_errors` | Node（golden と比べる） | （なし） | 2 targets PASSED | 1.0s・1.0s |

時間は bazel の「PASSED in」で、ビルド済みのあとの実行です（括弧の中は jasmine や Web Test Runner が自分で数えた時間）。フィルタ無しでは worker/test:test が 153 本 0.084 秒、test:test が 41 本 0.025 秒、config/test:test が 10 本 2.5 秒（PASSED in 3.1s）でした。config では、同時に読むファイルの数の上限を確かめる `doesn't exceed concurrency limit` の 1 本だけで 0.54 秒（e-config-concurrency.log）、`processNavigationUrls` の 3 本だけなら 0.003 秒でした。

- 👤 `pnpm bazel test //packages/service-worker/test:test_web_chromium` — ターミナル
  - `ng_web_test_suite(name = "test_web")` — packages/service-worker/test/BUILD.bazel 28 — *test\_lib を束ねる*
    - `//tools/testing:browser` — tools/testing/browser\_tests.init.mts — *zone.js + zoneless の TestBed*
    - `comm_spec・integration_spec・provider_spec` — packages/service-worker/test/ — *navigator.serviceWorker があるので provider\_spec も全部走る*
      - `MockServiceWorkerContainer` — packages/service-worker/testing/mock.ts 27 — *comm と integration のページの側*
      - `SwTestHarness + Driver` — packages/service-worker/worker/testing/scope.ts — *integration のワーカーの側*

## テストと直し方

- **このパッケージの方針**：packages/service-worker/PACKAGE.md の 1 行目（[第 1 回](01-sw-overview.md)に引用）のとおり、セキュリティの修正以外の新しい機能の PR は受け付けられず、不具合の直しも慎重に扱われます（PR #67918 は「security の脆弱性以外の貢献は受け付けていない」として 2026-04-10 に閉じられた。[第 20 回](20-sw-issues.md)）。「直すとしたら」は、手元で確かめて issue を読むための入口です。
- **アプリの側を直すなら**：`low_level.ts`・`update.ts`・`push.ts` は comm\_spec.ts の該当の describe に足し、`:test` を `--filter` 付きで。`provider.ts`・`module.ts` は provider\_spec.ts に足し、**`:test_web_chromium`** で（Node では走らない、4 節）。
- **ワーカーとアプリの間のメッセージの形を変えるなら**：msg.ts と low\_level.ts の両方を変え、integration\_spec.ts（5 節）を走らせます。片方だけだと 5 節の Promise が解決しません。
- **偽物を直すなら**：testing/mock.ts を使うのは comm\_spec.ts と integration\_spec.ts だけです（`grep -rn "testing/mock"`）。`MockServiceWorkerContainer.removeEventListener` の引数の型は `'controllerchange'` だけですが、46〜47 行目では `'message'` も消せます。
- **関係する issue**：#55975・#44402（checkForUpdate が何もしない）、#54036（VERSION\_READY が余分）、#48702（強制リロードのあと SwPush.subscription が出ない）は、どれもアプリの側の spec の形で確かめる話です。[第 20 回](20-sw-issues.md)の表にまとめました。本家に PR を出すことは勧めません。手元で spec を足して走らせ、issue を読むときの手がかりにします。

## 聞かれそうな質問

**Q. provideServiceWorker を変えて :test を走らせたら PASSED でした。これで大丈夫ですか？**

大丈夫ではありません。provider\_spec.ts は `navigator.serviceWorker` が無い環境では `should pass` の 1 本だけを置いて戻るので、Node の `:test` では 2 本しか走りません（4 節の「Ran 2 of 41」）。`:test_web_chromium` では 50 本が走ります。

**Q. test\_web\_chromium と test\_web\_firefox は何が違いますか？**

同じ `test_lib` を、28〜33 行目の `ng_web_test_suite` がブラウザごとのターゲットにしたものです。spec は同じで、どちらも 89 本でした。手元では Chromium が 0.8 秒、Firefox が 4.4 秒です。`test_web_debug` は `manual` なので一括の実行に入りません。

**Q. アプリの側のテストで、本物のワーカーは動いていますか？**

integration\_spec.ts の 4 本だけが動かしています。96〜99 行目で本物の `NgswCommChannel` と本物の `Driver`（SwTestHarness の上）を作り、101〜111 行目で 2 つの偽物の間のメッセージをつないでいます。comm\_spec.ts はワーカーからの知らせを `mock.sendMessage` で手で作ります。

**Q. 公開 API を変えたら、どのテストが落ちますか？**

68〜76 行目の `service-worker_api`（npm のパッケージの公開 API と goldens の比較）と、エラーの型を変えたなら 86〜94 行目の `service-worker_errors` です。spec ではなく golden のファイルとの差で落ちます（[contrib-public-api](../contrib/08-contrib-public-api.md)）。

## 読み終えて

- spec を走らせるターゲットは 3 つの `jasmine_test`（config/test・test・worker/test）と、test/ をブラウザで走らせる `test_web_chromium`・`test_web_firefox`。ほかは deps の検査と golden。
- アプリの側の偽物は `testing/mock.ts` の `MockServiceWorkerContainer` で、ページ → ワーカーは `messages`、ワーカー → ページは `sendMessage`。
- provider\_spec.ts は Node では 2 本の should pass だけ。provider.ts を変えたらブラウザのターゲットを走らせる。
- integration\_spec.ts は本物の `NgswCommChannel` と本物の `Driver` をつなぐ唯一の spec で、メッセージの形を変えたらここを見る。

---

← 前: [ワーカーのテスト：SwTestHarness と偽物のブラウザ](18-sw-testing-harness.md)  
次: [issue と PR を読む：Service Worker の今](20-sw-issues.md) →
