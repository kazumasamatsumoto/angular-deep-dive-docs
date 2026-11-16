[目次](../README.md) › [@angular/upgrade の内側：AngularJS と 1 つのページを分け合う](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：upgrade を固めているテスト

> src/common/test と static/test/integration と static/testing の spec の地図、withEachNg1Version が AngularJS 1.5〜1.8 を読み替えて 4 回走らせる仕組みと ng\_web\_test\_suite、手元での走らせ方と結果（38・626・12）、createAngularTestingModule・createAngularJSTestingModule の中身と #34670、保守モードの注（be7ee3a68b2）、$locationShim と #67153、area: upgrade の issue と PR の表。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/upg-tests-issues)

---

シリーズの最後に、第 1〜5 回の約束を固めている spec が、どのファイルのどの describe にあり、どの Bazel の target で、AngularJS のどの版で走るかを地図にします。手元で全部走らせた数を書き、`static/testing` の 2 つの関数と、`packages/common/upgrade` の `$locationShim` を 1 節ずつ読み、area: upgrade の issue と PR を章ごとに振り分けます。

読む対象は `packages/upgrade/src/common/test/helpers/common_test_helpers.ts`・`static/test/integration/static_test_helpers.ts`・`static/test/BUILD.bazel`・`static/testing/src/` の 2 つのファイルと、`packages/common/upgrade/src/` の `location_shim.ts`・`location_upgrade_module.ts` です。BUILD.bazel の読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. 全体と起動](01-upg-bootstrap.md)
2. [2. downgradeComponent](02-upg-downgrade-component.md)
3. [3. UpgradeComponent](03-upg-upgrade-component.md)
4. [4. 注入器と変更検知](04-upg-injection-cd.md)
5. [5. downgradeModule](05-upg-downgrade-module.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

パスは `packages/upgrade/` から、行番号は 8576f161ae4 で `grep -n` したもの、「it」は AngularJS の 1 つの版での it の数です。「4 版」の列が「はい」のファイルは、次の 2 節の `withEachNg1Version` で包まれていて、1.5・1.6・1.7・1.8 の 4 回走ります。

| ファイル | describe（行） | it | 4 版 | 走る数 | target | 章 |
| --- | --- | --- | --- | --- | --- | --- |
| `src/common/test/component_info_spec.ts` | PropertyBinding（11） | 2 | ― | 2 | `//packages/upgrade/src/common/test:test` | [第 2 回](02-upg-downgrade-component.md) |
| `src/common/test/downgrade_component_adapter_spec.ts` | DowngradeComponentAdapter（17） | 6 | はい | 24 | `//packages/upgrade/src/common/test:test` | [第 2 回](02-upg-downgrade-component.md) |
| `src/common/test/downgrade_injectable_spec.ts` | downgradeInjectable（15） | 3 | ― | 3 | `//packages/upgrade/src/common/test:test` | [第 4 回](04-upg-injection-cd.md) |
| `src/common/test/promise_util_spec.ts` | isThenable()（11）・SyncPromise（39）・.all()（88） | 9 | ― | 9 | `//packages/upgrade/src/common/test:test` | [第 5 回](05-upg-downgrade-module.md) |
| `static/test/angular1_providers_spec.ts` | upgrade angular1\_providers（18） | 6 | ― | 6 | `//packages/upgrade/static/test:test` | [第 1 回](01-upg-bootstrap.md)・[第 4 回](04-upg-injection-cd.md) |
| `static/test/integration/upgrade_module_spec.ts` | UpgradeModule（22）の $injector・injector・ngZone・bootstrap() | 6 | はい | 24 | `//packages/upgrade/static/test:test` | [第 1 回](01-upg-bootstrap.md) |
| `static/test/integration/examples_spec.ts` | examples（33） | 2 | はい | 8 | `//packages/upgrade/static/test:test` | [第 1 回](01-upg-bootstrap.md) |
| `static/test/integration/downgrade_component_spec.ts` | downgrade ng2 component（45）・standalone（1178） | 22 | はい | 88 | `//packages/upgrade/static/test:test` | [第 2 回](02-upg-downgrade-component.md) |
| `static/test/integration/content_projection_spec.ts` | content projection（33） | 4 | はい | 16 | `//packages/upgrade/static/test:test` | [第 2 回](02-upg-downgrade-component.md) |
| `static/test/integration/upgrade_component_spec.ts` | upgrade ng1 component（40）。xit 2 つと xdescribe の中の it 1 つを含む | 62 | はい | 248 | `//packages/upgrade/static/test:test` | [第 3 回](03-upg-upgrade-component.md) |
| `static/test/integration/injection_spec.ts` | injection（27） | 4 | はい | 16 | `//packages/upgrade/static/test:test` | [第 4 回](04-upg-injection-cd.md) |
| `static/test/integration/change_detection_spec.ts` | change-detection（33） | 3 | はい | 12 | `//packages/upgrade/static/test:test` | [第 4 回](04-upg-injection-cd.md) |
| `static/test/integration/testability_spec.ts` | testability（27） | 4 | はい | 16 | `//packages/upgrade/static/test:test` | [第 4 回](04-upg-injection-cd.md) |
| `static/test/integration/downgrade_module_spec.ts` | lazy-load ng2 module（59）の 21 と (common error)（1612）の 3。58 行目の \[true, false\].forEach で 2 回 | 48 | はい | 192 | `//packages/upgrade/static/test:test` | [第 5 回](05-upg-downgrade-module.md) |
| `static/testing/test/create_angular_testing_module_spec.ts` | Angular entry point（19） | 2 | はい | 8 | `//packages/upgrade/static/testing/test:test` | [第 6 回](06-upg-tests-issues.md) |
| `static/testing/test/create_angularjs_testing_module_spec.ts` | AngularJS entry point（16） | 1 | はい | 4 | `//packages/upgrade/static/testing/test:test` | [第 6 回](06-upg-tests-issues.md) |

足すと、`src/common/test` が 38、`static/test` が 626、`static/testing/test` が 12 です。3 節で走らせた数（38、614 + 12 skipped = 626、12）と一致します。`static/test` の 12 skipped は、upgrade\_component\_spec.ts の `xit` 2 つ（350・405 行目、`templateUrl` をサーバーから取る）と `xdescribe('in pre-/post-link')`（1835 行目）の中の it 1 つが、4 つの版で 3 × 4 = 12 です。

## 2. AngularJS の 4 つの版で走らせる仕組み

📄 `angular/packages/upgrade/src/common/test/helpers/common_test_helpers.ts` L15–38 （▶ の行: 15, 17–18, 29–30, 35–38）

```ts
15 ▶ const ng1Versions = [
16 │   {
17 ▶     label: '1.5',
18 ▶     files: [`angular-1.5/${ANGULARJS_FILENAME}`, 'angular-mocks-1.5/angular-mocks.js'],
19 │   },
20 │   {
21 │     label: '1.6',
22 │     files: [`angular-1.6/${ANGULARJS_FILENAME}`, 'angular-mocks-1.6/angular-mocks.js'],
23 │   },
24 │   {
25 │     label: '1.7',
26 │     files: [`angular-1.7/${ANGULARJS_FILENAME}`, 'angular-mocks-1.7/angular-mocks.js'],
27 │   },
28 │   {
29 ▶     label: '1.8',
30 ▶     files: [`angular-1.8/${ANGULARJS_FILENAME}`, 'angular-mocks-1.8/angular-mocks.js'],
31 │   },
32 │ ];
33 │ 
34 │ let counter = 0;
35 ▶ export function createWithEachNg1VersionFn(setNg1: typeof setAngularJSGlobal) {
36 ▶   return (specSuite: () => void) =>
37 ▶     ng1Versions.forEach(({label, files}) => {
38 ▶       describe(`[AngularJS v${label}] ${counter++}`, () => {
```

15〜32 行目の 4 つの版はそれぞれ、`angular.min.js` と `angular-mocks.js` の 2 つのファイルの組です（ファイルの上の `TEST_MINIFIED` を false にすると、圧縮していない `angular.js` に切り替わる）。35 行目の `createWithEachNg1VersionFn` は、spec の本体（`specSuite`）を受け取り、37 行目で版ごとに 38 行目の `describe('[AngularJS v1.5] 0', …)` を作ります。名前の後ろの数（34 行目の `counter`）は、同じ版の describe が何度も作られても名前が重ならないためです。

📄 `angular/packages/upgrade/src/common/test/helpers/common_test_helpers.ts` L94–122 （▶ の行: 94, 98–99, 103–104, 115–117, 122）

```ts
 94 ▶             script.onload = () => {
 95 │               script.remove();
 96 │               resolve();
 97 │             };
 98 ▶             script.src = `/node_modules/${scriptUrl}`;
 99 ▶             document.body.appendChild(script);
100 │           });
101 │         }
102 │ 
103 ▶         beforeAll((done) => {
104 ▶           const restoreJasmineMethods = patchJasmineMethods();
105 │           const onSuccess = () => {
106 │             restoreJasmineMethods();
107 │             done();
108 │           };
109 │           const onError = (err: any) => {
110 │             restoreJasmineMethods();
111 │             done.fail(err);
112 │           };
113 │ 
114 │           // Load AngularJS before running tests.
115 ▶           files
116 ▶             .reduce((prev, file) => prev.then(() => loadScript(file, 1)), Promise.resolve())
117 ▶             .then(() => setNg1(win.angular))
118 │             .then(onSuccess, onError);
119 │ 
120 │           // When Saucelabs is flaky, some browsers (esp. mobile) take some time to load and execute
121 │           // the AngularJS scripts. Specifying a higher timeout here, reduces flaky-ness.
122 ▶         }, 60000);
```

AngularJS は import せず、98 行目で `/node_modules/angular-1.5/angular.min.js` のような URL の `<script>` を足して、ブラウザに読ませます（だから upgrade の spec はどれもブラウザの suite です）。103 行目の `beforeAll` で 2 つのファイルを順に読み、117 行目で `window.angular` を upgrade の `setAngularJSGlobal` に渡します。104 行目の `patchJasmineMethods` は、`angular-mocks.js` が読み込まれたときに呼ぶ `beforeEach` などを横取りして、あとでこの describe の中で走らせるための細工です（Jasmine 2.9 からは `beforeAll` の中で `beforeEach` を登録できないため、と関数の上のコメントにあります）。

📄 `angular/packages/upgrade/src/common/test/helpers/common_test_helpers.ts` L124–150 （▶ の行: 124, 132, 136–137, 147）

```ts
124 ▶         afterAll(() => {
125 │           // `win.angular` will not be defined if loading the script in `berofeAll()` failed. In that
126 │           // case, avoid causing another error in `afterAll()`, because the reporter only shows the
127 │           // most recent error (thus hiding the original, possibly more informative, error message).
128 │           if (win.angular) {
129 │             // In these tests we are loading different versions of AngularJS on the same window.
130 │             // AngularJS leaves an "expandoId" property on `document`, which can trick subsequent
131 │             // `window.angular` instances into believing an app is already bootstrapped.
132 ▶             win.angular.element.cleanData([document]);
133 │           }
134 │ 
135 │           // Remove AngularJS to leave a clean state for subsequent tests.
136 ▶           setNg1(undefined);
137 ▶           delete win.angular;
138 │         });
139 │ 
140 │         methodsToPatch.forEach((method) =>
141 │           win[method](function (this: unknown) {
142 │             // Run the captured callbacks. (Async callbacks not supported.)
143 │             methodCallbacks[method].forEach((cb) => cb.call(this));
144 │           }),
145 │         );
146 │ 
147 ▶         specSuite();
148 │       });
149 │     });
150 │ }
```

📄 `angular/packages/upgrade/src/common/test/helpers/common_test_helpers.ts` L174–181 （▶ の行: 180–181）

```ts
174 │ export function nodes(html: string) {
175 │   const div = document.createElement('div');
176 │   div.innerHTML = html.trim();
177 │   return Array.prototype.slice.call(div.childNodes);
178 │ }
179 │ 
180 ▶ export const withEachNg1Version: (specSuite: () => void) => void =
181 ▶   createWithEachNg1VersionFn(setAngularJSGlobal);
```

132 行目は、同じ `window` に別の版の AngularJS を読み込むので、`document` に残った印（expandoId）を消します。136〜137 行目で大域の AngularJS を外し、次の版に渡します。spec が使うのは 180〜181 行目の `withEachNg1Version` で、spec のファイルの一番外が `withEachNg1Version(() => { describe(…) })` になっています。

📄 `angular/packages/upgrade/static/test/BUILD.bazel` L1–30 （▶ の行: 3, 6–7, 22–25）

```python
 1 │ load("//tools:defaults.bzl", "ng_web_test_suite", "ts_project")
 2 │ 
 3 ▶ ts_project(
 4 │     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob([
 7 ▶         "**/*.ts",
 8 │     ]),
 9 │     deps = [
10 │         "//packages/core",
11 │         "//packages/core/testing",
12 │         "//packages/platform-browser",
13 │         "//packages/platform-browser-dynamic",
14 │         "//packages/platform-browser/testing",
15 │         "//packages/private/testing",
16 │         "//packages/upgrade/src/common",
17 │         "//packages/upgrade/src/common/test/helpers",
18 │         "//packages/upgrade/static",
19 │     ],
20 │ )
21 │ 
22 ▶ ng_web_test_suite(
23 ▶     name = "test",
24 ▶     data = [
25 ▶         "//:angularjs_scripts",
26 │     ],
27 │     deps = [
28 │         ":test_lib",
29 │     ],
30 │ )
```

📄 `angular/BUILD.bazel` L33–48 （▶ の行: 34–35, 39–41, 46）

```python
33 │ 
34 ▶ copy_to_bin(
35 ▶     name = "angularjs_scripts",
36 │     srcs = [
37 │         # We also declare the unminified AngularJS files since these can be used for
38 │         # local debugging (e.g. see: packages/upgrade/test/common/test_helpers.ts)
39 ▶         "//:node_modules/angular-1.5",
40 ▶         "//:node_modules/angular-1.6",
41 ▶         "//:node_modules/angular-1.7",
42 │         "//:node_modules/angular-mocks-1.5",
43 │         "//:node_modules/angular-mocks-1.6",
44 │         "//:node_modules/angular-mocks-1.7",
45 │         "//:node_modules/angular-mocks-1.8",
46 ▶         "//:node_modules/angular-1.8",
47 │     ],
48 │ )
```

`static/test/BUILD.bazel` の 22 行目の `ng_web_test_suite` は、tools/bazel/web\_test.bzl の規則で、spec を 1 つの bundle にして web-test-runner（`wtr_test`）で走らせます（[Bazel の読み方の章](../contrib/04-contrib-bazel.md)）。名前 `test` から `test_chromium` と `test_firefox` の 2 つの target ができ、`pnpm bazel test //packages/upgrade/static/test:test` は両方を走らせます。24 行目の `data` の `//:angularjs_scripts` は、リポジトリの根の BUILD.bazel の 34 行目の `copy_to_bin` で、`node_modules` の `angular-1.5`〜`angular-1.8` と mocks を出力の木に写したものです。98 行目の URL はこれを読みます。ブラウザの suite なので、`--test_arg=--filter=…` は効きません。

📄 `angular/packages/upgrade/static/test/integration/static_test_helpers.ts` L14–40 （▶ の行: 22–26, 36）

```ts
14 │ export function bootstrap(
15 │   platform: PlatformRef,
16 │   Ng2Module: Type<{}>,
17 │   element: Element,
18 │   ng1Module: angular.IModule,
19 │ ) {
20 │   // We bootstrap the Angular module first; then when it is ready (async) we bootstrap the AngularJS
21 │   // module on the bootstrap element (also ensuring that AngularJS errors will fail the test).
22 ▶   return platform.bootstrapModule(Ng2Module).then((ref) => {
23 ▶     const ngZone = ref.injector.get<NgZone>(NgZone);
24 ▶     const upgrade = ref.injector.get(UpgradeModule);
25 ▶     const failHardModule: any = ($provide: angular.IProvideService) => {
26 ▶       $provide.value($EXCEPTION_HANDLER, (err: any) => {
27 │         throw err;
28 │       });
29 │     };
30 │ 
31 │     // The `bootstrap()` helper is used for convenience in tests, so that we don't have to inject
32 │     // and call `upgrade.bootstrap()` on every Angular module.
33 │     // In order to closer emulate what happens in real application, ensure AngularJS is bootstrapped
34 │     // inside the Angular zone.
35 │     //
36 ▶     ngZone.run(() => upgrade.bootstrap(element, [failHardModule, ng1Module.name]));
37 │ 
38 │     return upgrade;
39 │   });
40 │ }
```

integration の spec の多くは、この `bootstrap` で混在アプリを起こします。22 行目で Angular の NgModule を起動し、25〜29 行目で AngularJS の `$exceptionHandler` を「投げ直す」ものに替え、36 行目で `ngZone.run` の中から `upgrade.bootstrap` を呼びます。AngularJS の中で起きたエラーが、`$log` に出るだけで済まずに spec を落とすようにするためです（20〜21 行目のコメント）。

## 3. 手元で走らせた結果

8576f161ae4 の ../angular で、次のコマンドを走らせました（2026-11-16）。

📄 `走らせたコマンド`

```
cd ~/angular-research/angular
pnpm bazel test //packages/upgrade/src/common/test:test --nocache_test_results --test_output=all
pnpm bazel test //packages/upgrade/static/test:test //packages/upgrade/static/testing/test:test \
  --nocache_test_results --test_output=all
pnpm bazel test //packages/common/upgrade/test:test --nocache_test_results --test_output=all
```

| target | 結果 |
| --- | --- |
| `//packages/upgrade/src/common/test:test_chromium` | 38 passed, 0 failed |
| `//packages/upgrade/src/common/test:test_firefox` | 38 passed, 0 failed |
| `//packages/upgrade/static/test:test_chromium` | 614 passed, 0 failed, 12 skipped |
| `//packages/upgrade/static/test:test_firefox` | 614 passed, 0 failed, 12 skipped |
| `//packages/upgrade/static/testing/test:test_chromium` | 12 passed, 0 failed |
| `//packages/upgrade/static/testing/test:test_firefox` | 12 passed, 0 failed |
| `//packages/common/upgrade/test:test（Node の jasmine）` | 64 specs, 0 failures |
| `同上 --test_arg=--filter="New URL Parsing with appBaseHref"` | Ran 1 of 64 specs |

- どの suite のブラウザのログにも `NG0914`（zoneless なのに Zone.js を読み込んでいる）が出ます。tools/testing の browser の準備が zone.js を読み込み、spec の多くが `provideZoneChangeDetection()` を自分で書かずに NgModule を起動するからです。
- `static/test` のログには「A digest was triggered while one was already in progress.」が 8 回出ました。change\_detection\_spec.ts の 1 つの it がわざと起こす警告で、4 つの版 × 2 つのブラウザです（[第 4 回](04-upg-injection-cd.md)）。
- 作業木で 2 か所を 1 つずつ変えて `//packages/upgrade/static/test:test_chromium` を走らせ、どちらも 614 passed のままでした。upgrade\_module.ts の zoneless の枝（[第 4 回](04-upg-injection-cd.md)）と、downgrade\_module.ts の `applicationProviders` の zone（[第 5 回](05-upg-downgrade-module.md)）です。作業木は終わってから消しました。

### 新しい本家との違い

angular-main（74961c66242）では、8576f161ae4 から先に packages/upgrade を触ったコミットが 7 つあり、そのうち spec を大きく変えたのは ecbc89b465c（2026-10-06、「modernize unit tests across all packages」）です。testability\_spec.ts などの `fakeAsync` と `tick` が、`async` の it と `@angular/private/testing` の `timeout` に書き換わり、integration の spec の差分は 3000 行ほどになりました。実装の側の違いは、b2d3ba9f5f0（[第 2 回](02-upg-downgrade-component.md)）と、文書のリンクの直し（d7044fbc14d・f825c9bc7cc）と、次の保守モードの注です。

## 4. static/testing の 2 つの関数

📄 `angular/packages/upgrade/static/testing/src/create_angular_testing_module.ts` L14–26 （▶ の行: 14–15, 17–18, 21, 23–24）

```ts
14 ▶ let $injector: angular.IInjectorService | null = null;
15 ▶ let injector: Injector;
16 │ 
17 ▶ export function $injectorFactory() {
18 ▶   return $injector;
19 │ }
20 │ 
21 ▶ @NgModule({providers: [{provide: ɵconstants.$INJECTOR, useFactory: $injectorFactory}]})
22 │ export class AngularTestingModule {
23 ▶   constructor(i: Injector) {
24 ▶     injector = i;
25 │   }
26 │ }
```

📄 `angular/packages/upgrade/static/testing/src/create_angular_testing_module.ts` L93–103 （▶ の行: 97–102）

```ts
 93 │ export function createAngularTestingModule(
 94 │   angularJSModules: string[],
 95 │   strictDi?: boolean,
 96 │ ): Type<any> {
 97 ▶   angular
 98 ▶     .module_('$$angularJSTestingModule', angularJSModules)
 99 ▶     .constant(ɵconstants.UPGRADE_APP_TYPE_KEY, UpgradeAppType.Static)
100 ▶     .factory(ɵconstants.INJECTOR_KEY, () => injector);
101 ▶   $injector = angular.injector(['ng', '$$angularJSTestingModule'], strictDi);
102 ▶   return AngularTestingModule;
103 │ }
```

`createAngularTestingModule(['app'])` は、混在アプリを起動せずに、Angular のサービスの単体テストから AngularJS のサービスを使えるようにします。98 行目で `'$$angularJSTestingModule'` という AngularJS のモジュールを作り、99 行目でアプリの種類を `Static`、100 行目で `'$$angularInjector'` を 15 行目のモジュールの変数 `injector` にします。101 行目で `angular.injector`（AngularJS の注入器だけを作る関数）を呼んで 14 行目の変数に入れ、Angular の側には 21 行目の `AngularTestingModule` を返します。この NgModule は `'$injector'` を 17 行目の `$injectorFactory` で provide し、23〜24 行目の constructor で Angular の注入器を 15 行目の変数に入れます。2 つの注入器が、モジュールの変数を通して互いを指す形です。

📄 `angular/packages/upgrade/static/testing/src/create_angularjs_testing_module.ts` L80–94 （▶ の行: 80, 82–84, 87–89, 91, 93）

```ts
80 ▶ export function createAngularJSTestingModule(angularModules: any[]): string {
81 │   return ng
82 ▶     .module_('$$angularJSTestingModule', [])
83 ▶     .constant(ɵconstants.UPGRADE_APP_TYPE_KEY, UpgradeAppType.Static)
84 ▶     .factory(ɵconstants.INJECTOR_KEY, [
85 │       ɵconstants.$INJECTOR,
86 │       ($injector: ng.IInjectorService) => {
87 ▶         TestBed.configureTestingModule({
88 ▶           imports: angularModules,
89 ▶           providers: [{provide: ɵconstants.$INJECTOR, useValue: $injector}],
90 │         });
91 ▶         return TestBed.inject(Injector);
92 │       },
93 ▶     ]).name;
94 │ }
```

逆向きの `createAngularJSTestingModule([AppModule])` は AngularJS のモジュールの名前を返し、利用者はそれを `angular.mock.module` に渡します。84 行目の `'$$angularInjector'` の factory が、AngularJS の注入器が初めてそれを要るときに `TestBed.configureTestingModule` を呼び（87 行目）、89 行目で AngularJS の `$injector` を Angular の側に渡して、91 行目で `TestBed.inject(Injector)` を返します。

どちらも 82 行目・98 行目で同じ名前 `'$$angularJSTestingModule'` の AngularJS のモジュールを作ります。AngularJS の `angular.module(name, requires)` は、同じ名前で呼ぶと前の定義を置き換えます。#34670（2020-01 に開かれた）は、別々の spec のファイルが describe の中（it の外）でこの関数を呼ぶと、jasmine が先に全部の describe を走らせるので、最後に呼んだファイルの `angularModules` だけが残る、という報告です。メンバーのコメントで「呼ぶたびに違う名前にする」案に賛成が付き、報告者が PR を書くと言ったまま止まり、2026-09-22 に保守モードを理由に閉じられました。2 つの関数の説明のコメントは「1 つの spec で 1 回だけ呼ぶ」「2 つを同じ spec で使わない」と書いています。

📄 `angular/packages/upgrade/static/testing/test/create_angular_testing_module_spec.ts` L28–46 （▶ の行: 30, 38–39, 44–45）

```ts
28 │     it('should create new injectors when we re-use the helper', () => {
29 │       defineAppModule();
30 ▶       TestBed.configureTestingModule({imports: [createAngularTestingModule(['app']), AppModule]});
31 │       // Check that the injectors are wired up correctly
32 │       TestBed.inject(Inventory);
33 │ 
34 │       // Grab references to the current injectors
35 │       const injector = TestBed.inject(Injector);
36 │       const $injector = TestBed.inject($INJECTOR as any);
37 │ 
38 ▶       TestBed.resetTestingModule();
39 ▶       TestBed.configureTestingModule({imports: [createAngularTestingModule(['app']), AppModule]});
40 │       // Check that the injectors are wired up correctly
41 │       TestBed.inject(Inventory);
42 │ 
43 │       // Check that the new injectors are different to the previous ones.
44 ▶       expect(TestBed.inject(Injector)).not.toBe(injector);
45 ▶       expect(TestBed.inject($INJECTOR as any)).not.toBe($injector);
46 │     });
```

spec は、同じ it の中で `TestBed.resetTestingModule()` を挟んで 2 回呼ぶと、2 つの注入器がどちらも新しくなることを 44〜45 行目で見ます。別々のファイルから呼ぶ場合（#34670 の形）を確かめる it はありません。

## 5. 保守モードの注

be7ee3a68b2（2026-09-22、PR #70875「docs(upgrade): add maintenance mode note」、angular-main だけ）は、`packages/upgrade/PACKAGE.md`・`static/PACKAGE.md`・`static/testing/PACKAGE.md` と新しい `README.md` の頭に 「IMPORTANT: The `@angular/upgrade` package is in maintenance mode. We will not be accepting any new features or bug fixes other than security fixes.」を足しました。本文は「`@angular/service-worker` や zone.js と同じ」です。

同じ日に、area: upgrade の 8 件の issue（#67153・#34670・#34596・#25613・#24846・#17490・#16685・#14081）と、PR #67157 が、同じ文面（「AngularJS が EOL に達し、このパッケージは移行のためだけにある。#70875 のとおり、セキュリティの修正のほかは新しい機能も不具合の修正も受け付けない」）で閉じられました。そのあと 2026-10 に入った b2d3ba9f5f0（#71441）は、この注の「security fixes」に当たる修正で、22.2.X・21.2.X・20.3.X に backport されています（[第 2 回](02-upg-downgrade-component.md)）。

## 6. packages/common/upgrade の $locationShim

`@angular/common/upgrade` は、AngularJS の `$location` を Angular の `Location` の上に作り直す「Unified Angular Location Service」です。`@angular/upgrade` ではなく `@angular/common` の副エントリですが、UpgradeModule に依存します。

📄 `angular/packages/common/upgrade/src/location_upgrade_module.ts` L126–136 （▶ の行: 126, 128, 135）

```ts
126 ▶ function provide$location() {
127 │   const $locationProvider = new $locationShimProvider(
128 ▶     inject(UpgradeModule),
129 │     inject(Location),
130 │     inject(PlatformLocation),
131 │     inject(UrlCodec),
132 │     inject(LocationStrategy),
133 │   );
134 │ 
135 ▶   return $locationProvider.$get();
136 │ }
```

`LocationUpgradeModule.config()` が provide する `$locationShim` の factory は、128 行目で `inject(UpgradeModule)` します。135 行目の `$get()` が、UpgradeModule の `$injector` を `$locationShim` の constructor に渡すためです。#46211・#36877 の「'$locationShim': Not a valid '@angular/upgrade' application.」は、[第 4 回](04-upg-injection-cd.md)の `validateInjectionKey` の default の枝の文言です。

📄 `angular/packages/common/upgrade/src/location_shim.ts` L80–93 （▶ の行: 85–86, 89–90, 92）

```ts
80 │ 
81 │     this.$$parseLinkUrl(initialUrl, initialUrl);
82 │     this.cacheState();
83 │     this.$$state = this.browserState();
84 │ 
85 ▶     this.removeOnUrlChangeFn = this.location.onUrlChange((newUrl, newState) => {
86 ▶       this.urlChanges.next({newUrl, newState});
87 │     });
88 │ 
89 ▶     if (isPromise($injector)) {
90 ▶       $injector.then(($i) => this.initialize($i));
91 │     } else {
92 ▶       this.initialize($injector);
93 │     }
```

📄 `angular/packages/common/upgrade/src/location_shim.ts` L145–160 （▶ の行: 147–148, 150–151, 153）

```ts
145 │     });
146 │ 
147 ▶     this.urlChanges.subscribe(({newUrl, newState}) => {
148 ▶       const oldUrl = this.absUrl();
149 │       const oldState = this.$$state;
150 ▶       this.$$parse(newUrl);
151 ▶       newUrl = this.absUrl();
152 │       this.$$state = newState;
153 ▶       const defaultPrevented = $rootScope.$broadcast(
154 │         '$locationChangeStart',
155 │         newUrl,
156 │         oldUrl,
157 │         newState,
158 │         oldState,
159 │       ).defaultPrevented;
160 │ 
```

85〜86 行目で、Angular の `Location.onUrlChange` から来た URL を、そのまま `urlChanges` に流します。147 行目の購読が 150 行目の `$$parse(newUrl)` で、それを AngularJS の `$location` の「アプリの中の URL」として読み直します。`Location.go(path)` が `onUrlChange` に渡すのは `prepareExternalUrl(path)`、つまり APP\_BASE\_HREF を前に付けた外の URL です（[Location の章](../cmn/17-cmn-location.md)）。#67153（2026-02 に開かれた）は、この食い違いで `$locationShim.$$path` に APP\_BASE\_HREF が重なって入る、という報告です。PR #67157 は 86 行目の前で `this.location.normalize(url)` を通して APP\_BASE\_HREF を外し、upgrade.spec.ts に it を 2 つ足す内容でしたが、保守モードを理由に merge されずに閉じられ、issue も not planned で閉じられました。手元の `//packages/common/upgrade/test:test` は 64 specs が通り、`New URL Parsing with appBaseHref` の describe の it は 1 つ（`should prepend path with basePath`）で、`Location.go` から入る道は通りません。

## 7. issue と PR の表

gh で area: upgrade の issue を読みました（2026-11-16、読むだけ）。開いている issue は 0 件、閉じた issue は 75 件で、閉じた理由は COMPLETED 51・NOT\_PLANNED 23・DUPLICATE 1 です。下の表は、このシリーズの章に関係する 25 件を選び、章に振り分けたものです（題は日本語に要約）。

| # | 閉じた日 | 理由 | 題 | 章 | メモ |
| --- | --- | --- | --- | --- | --- |
| #71441 | 2026-10-25 | 完了 | downgradeComponent() が、AngularJS のディレクティブが要素に書き込んだ中身までコンパイルする | [第 2 回](02-upg-downgrade-component.md) | b2d3ba9f5f0（PR #71442）。22.2.X・21.2.X・20.3.X に backport（#71614・#71610・#71611） |
| #67153 | 2026-09-22 | 予定なし | $locationShim の中で APP\_BASE\_HREF が重なる | [第 6 回](06-upg-tests-issues.md) | 保守モードを理由に閉じた。PR #67157 も同じ日に閉じた（6 節） |
| #34670 | 2026-09-22 | 予定なし | createAngularJSTestingModule() を別々の spec のファイルで使うと壊れる | [第 6 回](06-upg-tests-issues.md) | 2020 年に「呼ぶたびに違う名前にする」案が出たまま、保守モードで閉じた（4 節） |
| #34596 | 2026-09-22 | 予定なし | Unified Angular Location Service で useHash のパスの先頭の / が消える | [第 6 回](06-upg-tests-issues.md) | common/upgrade |
| #25613 | 2026-09-22 | 予定なし | downgrade したコンポーネントのエラーが $exceptionHandler に届かない | [第 2 回](02-upg-downgrade-component.md) | 保守モード |
| #24846 | 2026-09-22 | 予定なし | require で別の upgrade したコンポーネントを求めると親のコントローラが見つからない | [第 3 回](03-upg-upgrade-component.md) | 保守モード |
| #17490 | 2026-09-22 | 予定なし | UpgradeModule は遅延読み込みの混在のバンドルに対応すべき | [第 1 回](01-upg-bootstrap.md)[第 4 回](04-upg-injection-cd.md) | 保守モード |
| #31882 | 2026-09-02 | 予定なし | LocationUpgradeModule が useHash のとき初期化で Unhandled Navigation Error | [第 6 回](06-upg-tests-issues.md) | common/upgrade |
| #60599 | 2026-06-24 | 完了 | downgradeComponent で signal の model() に対応する | [第 2 回](02-upg-downgrade-component.md) | 8d31b82116c（PR #68760） |
| #67368 | 2026-02-28 | 予定なし | UpgradeModule を import すると Angular のゾーンが複数できる | [第 4 回](04-upg-injection-cd.md) | 「根の注入器に置くもの」と返答。遅延読み込みの NgModule の問いは未回答のまま lock（第 4 回の 6 節） |
| #34600 | 2026-01-02 | 重複 | Unified Angular Location Service が useHash で最初の URL を読み違える | [第 6 回](06-upg-tests-issues.md) | common/upgrade |
| #46946 | 2025-09-23 | 予定なし | Unified Angular Location Service の使い方への意見 | [第 6 回](06-upg-tests-issues.md) | common/upgrade |
| #29026 | 2025-09-16 | 予定なし | ng-if の下で upgrade したコンポーネントの transclusion が壊れる | [第 3 回](03-upg-upgrade-component.md) |   |
| #62537 | 2025-07-13 | 予定なし | v19 の混在アプリで signal の input が動かない | [第 2 回](02-upg-downgrade-component.md) |   |
| #61640 | 2025-06-19 | 完了 | zoneless の混在アプリで変更検知が走らない | [第 4 回](04-upg-injection-cd.md) | 900cd37f68c（PR #61660） |
| #60366 | 2025-03-13 | 完了 | output emitter（output()）が混在アプリで動かない | [第 2 回](02-upg-downgrade-component.md) | cd7c170763b（PR #60369） |
| #56860 | 2024-09-26 | 完了 | signal の input が upgrade で動かない | [第 2 回](02-upg-downgrade-component.md) | 5f56a658375（PR #57020） |
| #48032 | 2023-07-11 | 完了 | DowngradeComponentAdapter.subscribeToOutput の購読が漏れる | [第 2 回](02-upg-downgrade-component.md) | 253d7564647（PR #50901） |
| #39935 | 2020-12-10 | 完了 | HMR で UpgradeModule が何度も起動する | [第 1 回](01-upg-bootstrap.md)[第 5 回](05-upg-downgrade-module.md) | b4b21bdff4b。PlatformRef.onDestroy で destroyApp（第 5 回の 432 行目） |
| #37579 | 2020-09-10 | 完了 | 「Trying to get the Angular injector before bootstrapping」に注入器の名前を入れて | [第 5 回](05-upg-downgrade-module.md) |   |
| #30330 | 2019-08-01 | 完了 | $compile のあと、downgrade したコンポーネントがテストで描かれない | [第 5 回](05-upg-downgrade-module.md) | c1ae6124c83（SyncPromise.all、第 5 回の 4 節） |
| #28932 | 2022-03-14 | 完了 | ngUpgrade lite で downgradeInjectable を使うと分かりにくいエラー | [第 4 回](04-upg-injection-cd.md)[第 5 回](05-upg-downgrade-module.md) |   |
| #25846 | 2020-05-27 | 完了 | 混在アプリの単体テスト | [第 6 回](06-upg-tests-issues.md) |   |
| #24369 | 2024-03-23 | 予定なし | AngularJS のコンポーネントを含む混在アプリのテストの仕方を文書に | [第 6 回](06-upg-tests-issues.md) |   |
| #46211 | 2022-06-03 | 完了 | '$locationShim': Not a valid '@angular/upgrade' application. | [第 4 回](04-upg-injection-cd.md)[第 6 回](06-upg-tests-issues.md) | util.ts の validateInjectionKey の default の文言（第 4 回の 1 節の関数） |

PR は area: upgrade と「upgrade」を題に持つものから 20 件を選び、コミットを照らし合わせました（「作った日」は PR を開いた日）。

| # | 状態 | 作った日 | 題 | コミット | 章 |
| --- | --- | --- | --- | --- | --- |
| #71442 | merge | 2026-10-20 | `fix(upgrade): only compile the template contents of a downgraded component` | b2d3ba9f5f0（angular-main） | [第 2 回](02-upg-downgrade-component.md) |
| #70881 | merge | 2026-09-23 | `docs(upgrade): drop the missing providedIn anchor from downgradeModule` | d7044fbc14d | [第 5 回](05-upg-downgrade-module.md) |
| #70875 | merge | 2026-09-22 | `docs(upgrade): add maintenance mode note` | be7ee3a68b2 | [第 6 回](06-upg-tests-issues.md) |
| #70494 | 閉 | 2026-08-31 | `fix(upgrade): delay linking projected AngularJS nodes` | （入っていない） | [第 3 回](03-upg-upgrade-component.md) |
| #69919 | 閉 | 2026-07-23 | `feat(upgrade): add option to initialize inputs synchronously` | （入っていない） | [第 2 回](02-upg-downgrade-component.md) |
| #69402 | 閉 | 2026-06-17 | `fix(upgrade): guard window.angular access against DOM clobbering` | （入っていない） | [第 1 回](01-upg-bootstrap.md) |
| #68760 | merge | 2026-05-16 | `fix(upgrade): support model() signals in downgradeComponent` | 8d31b82116c | [第 2 回](02-upg-downgrade-component.md) |
| #67265 | merge | 2026-02-25 | `refactor(upgrade): remove getAngularLib/setAngularLib` | 01a179577b5 | [第 1 回](01-upg-bootstrap.md) |
| #67157 | 閉 | 2026-02-19 | `fix(upgrade): prevent APP_BASE_HREF duplication in locationShim.path` | （入っていない） | [第 6 回](06-upg-tests-issues.md) |
| #65918 | merge | 2025-12-08 | `refactor(upgrade): deprecate VERSION export` | 75fe8f8af94 | [第 1 回](01-upg-bootstrap.md) |
| #63814 | 閉 | 2025-09-15 | `refactor(upgrade): downgradeModule uses zone-based change detection by default` | 412d5af92cc・0bb68a81877・d9e597f3418 | [第 4 回](04-upg-injection-cd.md)[第 5 回](05-upg-downgrade-module.md) |
| #61660 | 閉 | 2025-05-23 | `fix(upgrade): Make zoneless work with hybrid apps` | 900cd37f68c | [第 4 回](04-upg-injection-cd.md) |
| #61659 | 閉 | 2025-05-23 | `fix(upgrade): Remove deprecated UpgradeAdapter` | f86846555bb | [第 1 回](01-upg-bootstrap.md) |
| #60369 | 閉 | 2025-03-13 | `fix(upgrade): handle output emitters when downgrading a component` | cd7c170763b | [第 2 回](02-upg-downgrade-component.md) |
| #57454 | 閉 | 2024-08-19 | `fix(upgrade): Address Trusted Types violations in @angular/upgrade` | c9d90786d0a | [第 4 回](04-upg-injection-cd.md) |
| #57020 | 閉 | 2024-07-17 | `fix(upgrade): support input signal bindings` | 5f56a658375 | [第 2 回](02-upg-downgrade-component.md) |
| #56837 | 閉 | 2024-07-03 | `fix(upgrade): fixes downgrade issue for signal based inputs` | （入っていない。#57020 が入った） | [第 2 回](02-upg-downgrade-component.md) |
| #50901 | 閉 | 2023-06-30 | `fix(upgrade): Use takeUntil on leaky subscription.` | 253d7564647 | [第 2 回](02-upg-downgrade-component.md) |
| #43973 | 閉 | 2021-10-28 | `feat(upgrade): support NgModule class as an argument of the downgradeModule function` | 34f990986ca | [第 5 回](05-upg-downgrade-module.md) |
| #46214 | 閉 | 2022-06-01 | `feat(upgrade): more closely align UpgradeModule#bootstrap() with angular.bootstrap()` | e9cb0454dce | [第 1 回](01-upg-bootstrap.md) |

### 数で見る傾向

- 閉じた 75 件のうち 2025 年からの 20 件は、NOT\_PLANNED 14・COMPLETED 5・DUPLICATE 1 です。COMPLETED の 5 件（#71441・#60599・#61640・#25002・#60366）のうち 3 件は新しい core の機能（model()・zoneless・output()）に合わせる直しで、1 件（#71441）はセキュリティの直しです。
- NOT\_PLANNED の 14 件のうち 8 件は 2026-09-22 の 1 日に、保守モードの同じ文面で閉じられました。#14081 のような古い番号から #67153 までが、一度に閉じています。
- 表の PR 20 件は merge 6・閉 14 です。閉じた 14 件のうち 9 件は、コミットの本文の `PR Close #…` で中身が入っています（2025 年までの merge の仕方）。状態が MERGED の 6 件（2025-12 から）は、コミットに PR の番号がありません（題で照らし合わせた）。
- 中身が入らずに閉じた PR は、2026 年の 4 件（#70494 投影した AngularJS のノードのリンクを遅らせる・#69919 input を同期で初期化する選択肢・#69402 DOM clobbering・#67157 APP\_BASE\_HREF）と、#56837（同じ問題を #57020 が直した）です。#69402 はセキュリティの見出しですが merge されていません。悪用の手順はここには書きません。
- #63814 は 3 つのコミットが同じ日に入った PR で、状態は「閉」です（[第 5 回](05-upg-downgrade-module.md)の 1 節）。PR を読むときは、状態ではなくコミットの側で中身が入ったかを確かめます。

## このシリーズで見つけたもの

第 1〜5 回を書いている途中で、投影の番号の並べ方や、downgrade した input が transform を通らないこと、zoneless の枝を固める spec が無いことなどが見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、Node の上で動かした @angular/upgrade 22.1.6 と AngularJS 1.8.3（jsdom 26）を使いました。spec の穴は、作業木で行を変えて static/test の 614 の it が通るままかで確かめました。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| AngularJS の側から投影した要素が、セレクタに合う ng-content のうち番号の小さい方ではなく、文字列として先に来る方に入る（\[2\] と \[10\] の両方に合うと \[10\] に入る）。Angular のテンプレートから同じものを投影すると \[2\] に入る | upgrade の src/common/src/downgrade\_component\_adapter.ts 396 行目（`ngContentIndices.sort()` に比べる関数が無い） | ng-content が 12 個のコンポーネントの記録。配布物の写しで `(a, b) => a - b` にすると \[2\] に入る | [第 2 回](02-upg-downgrade-component.md) |
| downgrade したコンポーネントの input に `transform`（例: `booleanAttribute`）があっても、AngularJS の属性から入る値は transform を通らない（空の文字列が `''` のまま。`ComponentRef.setInput` なら `true`） | 同じファイルの `updateInput`（319〜348 行目）。transform を走らせるのは core の write\_to\_directive\_input.ts 57〜61 行目で、この道を通らない | デコレーターの input と signal の input の両方の記録。5f56a658375 のコミットの本文に、setInput への書き換えを先送りした理由が書かれている | [第 2 回](02-upg-downgrade-component.md) |
| AngularJS の起動より前に Angular の側で `$injector` に頼るものを引くと最初は分かりやすいエラーになるが、それを受け止めて起動を続けると、後の bootstrap が `NG0200: Circular dependency detected for $injector` で止まり、元の原因がメッセージに出ない | upgrade の static/src/angular1\_providers.ts 21 行目が投げ、core の di/r3\_injector.ts 530 行目で入れた CIRCULAR の印が戻されないまま残る（upgrade に限らない注入器のふるまい）。upgrade\_module.ts 291 行目で表に出る | Node の記録（3 つ目の場面） | [第 1 回](01-upg-bootstrap.md) |
| zoneless の混在アプリで `$digest` を呼ぶ枝を消しても、spec が 1 つも落ちない。この枝を入れたコミットの本文は afterEveryRender だが、入ったコードは内部の `afterTick` を `as any` で購読している | upgrade の static/src/upgrade\_module.ts 328〜329 行目（900cd37f68c、spec の追加なし） | 作業木で 328 行目を `false && …` にしても static/test は 614 passed | [第 4 回](04-upg-injection-cd.md) |
| downgradeModule に NgModule のクラスを渡すと zone の変更検知が足されるが、起動の関数を渡すと足されず、v22 では NoopNgZone のまま動く。クラスの形で足す provider を消しても spec が落ちない | upgrade の static/src/downgrade\_module.ts 388 行目と 396〜398 行目（2a7a5de53fd からこの差がある） | 作業木で 388 行目を `applicationProviders: []` にしても 614 passed。3 つの形の記録 | [第 5 回](05-upg-downgrade-module.md) |
| 遅延読み込みの NgModule や standalone のコンポーネントの imports に UpgradeModule を置くと、根とは別の NgZone ができる（根の NgModule や bootstrapApplication の providers に置けば同じ）。閉じた #67368 の続きの問いに当たる | upgrade の static/src/upgrade\_module.ts 149 行目（UpgradeModule の providers の zone の変更検知、d9e597f3418） | 置き場所ごとに NgZone が根と同じかを比べた記録 | [第 4 回](04-upg-injection-cd.md) |
| zoneless のとき、AngularJS の側の whenStable の callback が Angular のタイマーを待たずにその場で呼ばれる | upgrade の static/src/upgrade\_module.ts 203〜230 行目（Testability の橋） | NoopNgZone の記録。仕様の範囲かどうかはソースとコミットからは決められない | [第 4 回](04-upg-injection-cd.md) |

ほかに、UpgradeHelper の `$httpBackend` の枝（upgrade\_helper.ts 110〜119 行目）は UpgradeAdapter が消えた後どこからも呼ばれていないこと、getAngularLib は export から外れただけで angular1.ts に残っていることを、[第 3 回](03-upg-upgrade-component.md)と[第 1 回](01-upg-bootstrap.md)に書きました。

## 聞かれそうな質問

**Q. upgrade の spec を 1 本だけ走らせられますか？**

Bazel の `--test_arg=--filter` は効きません。どれも `ng_web_test_suite`（web-test-runner）で、filter を受け取らないからです（2 節）。手元で絞るなら、spec の中を一時的に `fit` / `fdescribe` にします（[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)）。`packages/common/upgrade/test` だけは Node の jasmine なので filter が効き、`Ran 1 of 64 specs` になりました。

**Q. なぜ static/test の数が 626 になるのですか？**

integration の 9 つの spec の it が 1 つの版で 155（downgrade\_module\_spec.ts は `[true, false].forEach` で 24 × 2 = 48）、それが `withEachNg1Version` で 4 版 = 620、包まれていない angular1\_providers\_spec.ts の 6 を足して 626 です。うち 12 が `xit` と `xdescribe` で skipped です（1 節）。

**Q. AngularJS の版はどこで決まっていますか？**

common\_test\_helpers.ts の 15〜32 行目の `ng1Versions` と、根の BUILD.bazel の `angularjs_scripts`（39〜46 行目）です。版を足すなら、package.json の `angular-1.x` の依存と、この 2 か所を合わせて足します。

**Q. createAngularTestingModule でコンポーネントもテストできますか？**

できません。関数の説明のコメントのとおりサービスのためのもので、コンポーネントは混在アプリを起動してテストします。また、`$digest` を zone につながないので（4 節の 98〜101 行目に、第 4 回の橋に当たる行が無い）、AngularJS の側の非同期の処理は利用者が `$rootScope.$apply` を呼びます。

**Q. 保守モードのパッケージに、今どんな変更が入っていますか？**

be7ee3a68b2 のあとに angular-main に入った実装の変更は、セキュリティの直しの b2d3ba9f5f0（#71441）だけです（3 節と 5 節）。それより前は、signal の input・output()・zoneless・model() と、core の新しい機能に合わせる直しが続いていました（7 節の表）。

## 読み終えて

- upgrade の spec はすべてブラウザの suite で、Chromium と Firefox の 2 つの target。手元で 38・626（12 skipped）・12 本がすべて通った
- `withEachNg1Version` が AngularJS 1.5〜1.8 を `<script>` で読み替えながら、同じ describe を 4 回走らせる
- static/testing の 2 つの関数は、モジュールの変数と同じ名前の AngularJS のモジュールで 2 つの注入器をつなぐ。#34670 はその名前が固定であることから来ている
- 2026-09-22 の保守モードの注で、セキュリティ以外の issue と PR は閉じられた。$locationShim の #67153 もその 1 つ

---

← 前: [downgradeModule：Angular の側を後から起こす](05-upg-downgrade-module.md)  
次: [FormField の全体：1 つのディレクティブが相手を見分けるまで](../sfd/01-sfd-form-field.md) →
