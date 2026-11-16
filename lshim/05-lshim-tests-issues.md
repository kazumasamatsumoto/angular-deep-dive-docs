[目次](../README.md) › [$locationShim の内側：AngularJS の $location を Angular の Location で動かす](README.md) › 第 5 回 / 全 5 回

# spec と issue を読む：$locationShim を固めているテスト

> common/upgrade の upgrade.spec.ts・params.spec.ts と upgrade\_location\_test\_module.ts・$rootScope の作り物が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果（64 specs）、1 行ずつ変えて落ちる spec を確かめた結果、$locationShim の issue と PR の表（#30305・APP\_BASE\_HREF の重複・閉じた外の PR）と、保守モードで入った修正と閉じた修正。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/lshim-tests-issues)

---

シリーズの最後に、第 1〜4 回の約束を固めている spec が、どのファイルのどの describe にあるかを地図にし、spec の土台の作り物（`LocationUpgradeTestModule` と、`$rootScope` の mock）を読みます。手元で走らせた数と、1 行ずつ変えて「どの spec が落ちるか」を確かめた結果を書き、`@angular/common/upgrade` の issue と PR を章に振り分けて、保守モードのパッケージにどんな修正が入り、どんな修正が閉じられたかを並べます。

読む対象は `packages/common/upgrade/test/` の 4 つのファイル（`BUILD.bazel`・`upgrade_location_test_module.ts`・`upgrade.spec.ts`・`params.spec.ts`）です。BUILD.bazel の読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、`MockPlatformLocation` の中身は[テスト用の Location の章](../cmn/18-cmn-location-testing.md)にあります。

1. [1. LocationUpgradeModule](01-lshim-module.md)
2. [2. 初期化と同期](02-lshim-sync.md)
3. [3. url・path・search・hash](03-lshim-api.md)
4. [4. UrlCodec](04-lshim-params.md)
5. **5. spec と issue**（この章）

## 1. spec の地図

行は 8576f161ae4 で `grep -n` したもの、「it」は describe の直下の it の数です（入れ子の describe は別の行）。2 つのファイルで 55 + 9 = 64 です。

| ファイル | describe（行） | it | 固めていること | 章 |
| --- | --- | --- | --- | --- |
| upgrade.spec.ts | `LocationProvider`（78） | 1 | TestBed から `$locationShim` が作れる | [第 1 回](01-lshim-module.md) |
| upgrade.spec.ts | `LocationHtml5Url`（97） | 5 | `appBaseHref: '/pre'` の下の `url()`・`$$parseLinkUrl` の書き直し・`/index.html`・二重のスラッシュ・`state()` | [第 3 回](03-lshim-api.md) |
| upgrade.spec.ts | `NewUrl`（180） | 26 | getter、`path()`・`search()` の 3 通り・`hash()`・`url()`・`replace()`、`$$parse` で前の値が残らない | [第 3 回](03-lshim-api.md) |
| upgrade.spec.ts | `encoding`（415） | 6 | 特別な文字の encode と decode、`%2F`、`+` | [第 4 回](04-lshim-params.md) |
| upgrade.spec.ts | `New URL Parsing with appBaseHref`（474） | 1 | `$$parse` で base を外し、`path()` で付け直す | [第 1 回](01-lshim-module.md) |
| upgrade.spec.ts | `New URL Parsing`（509） | 6 | `$$parse`・先頭の `/`・チェーン・基点の違う URL で投げる | [第 3 回](03-lshim-api.md) |
| upgrade.spec.ts | `state`（568） | 5 | `state()` の setter・チェーン・参照が同じであること | [第 3 回](03-lshim-api.md)・[第 2 回](02-lshim-sync.md) |
| upgrade.spec.ts | `$location.onChange()`（635） | 5 | 積む・呼ぶ値・`$locationChangeSuccess` の後・`err` に渡す | [第 3 回](03-lshim-api.md)・[第 2 回](02-lshim-sync.md) |
| params.spec.ts | `AngularJSUrlCodec` &gt; `parse`（14） | 8 | URL の 8 つの欄・base の有無・投げる文言（#32976） | [第 4 回](04-lshim-params.md) |
| params.spec.ts | `AngularJSUrlCodec` &gt; `decodeSearch`（80） | 1 | `hasOwnProperty` という名前の query（e5c37f21de3） | [第 4 回](04-lshim-params.md) |

地図から分かる穴が 2 つあります。`useHash` はすべての describe で `false` で、`HashLocationStrategy` を通る spec がありません（[第 1 回](01-lshim-module.md)）。また、`$locationChangeStart` の `preventDefault()` で戻す枝、`<a>` のクリックを拾う枝、`Location.onUrlChange` から `$rootScope` へ戻る道（[第 2 回](02-lshim-sync.md)）を通る it もありません。理由は 3 節の作り物にあります。

## 2. BUILD.bazel：Node の jasmine で走る 1 つの target

📄 `angular/packages/common/upgrade/test/BUILD.bazel` L1–22 （▶ の行: 3–4, 6, 13, 17–18, 20）

```python
 1 │ load("//tools:defaults.bzl", "angular_jasmine_test", "ts_project")
 2 │ 
 3 ▶ ts_project(
 4 ▶     name = "test_lib",
 5 │     testonly = True,
 6 ▶     srcs = glob(["**/*.ts"]),
 7 │     deps = [
 8 │         "//packages/common",
 9 │         "//packages/common/testing",
10 │         "//packages/common/upgrade",
11 │         "//packages/core",
12 │         "//packages/core/testing",
13 ▶         "//packages/upgrade/static",
14 │     ],
15 │ )
16 │ 
17 ▶ angular_jasmine_test(
18 ▶     name = "test",
19 │     data = [
20 ▶         ":test_lib",
21 │     ],
22 │ )
```
*ts\_project で test/ の .ts を全部まとめ、angular\_jasmine\_test で走らせる*

3〜15 行目の `ts_project` が、6 行目の `glob(["**/*.ts"])` で test/ の .ts を全部まとめます。13 行目の `//packages/upgrade/static` は、`$locationShim` の constructor が `UpgradeModule` の `$injector` を受け取るためです（[第 1 回](01-lshim-module.md)）。17〜22 行目の `angular_jasmine_test` は、ブラウザではなく Node の jasmine で走る target です。だから target は `//packages/common/upgrade/test:test` の 1 つで、`--test_arg=--filter=…` が効きます。[直前のシリーズの最終回](../upg/06-upg-tests-issues.md)の `packages/upgrade` の spec は web-test-runner の Chromium と Firefox の 2 つの target で、filter が効かないのと違います。

## 3. 作り物：LocationUpgradeTestModule と $rootScope の mock

📄 `angular/packages/common/upgrade/test/upgrade_location_test_module.ts` L50–89 （▶ の行: 50, 56–58, 64–66, 69, 71–73, 83–86）

```ts
50 ▶   static config(
51 │     config?: LocationUpgradeTestingConfig,
52 │   ): ModuleWithProviders<LocationUpgradeTestModule> {
53 │     return {
54 │       ngModule: LocationUpgradeTestModule,
55 │       providers: [
56 ▶         {provide: LOC_UPGRADE_TEST_CONFIG, useValue: config || {}},
57 ▶         {
58 ▶           provide: PlatformLocation,
59 │           useFactory: (appBaseHref?: string) => {
60 │             if (config && config.appBaseHref != null) {
61 │               appBaseHref = config.appBaseHref;
62 │             }
63 │             appBaseHref ??= '';
64 ▶             return new MockPlatformLocation({
65 ▶               startUrl: config && config.startUrl,
66 ▶               appBaseHref: appBaseHref,
67 │             });
68 │           },
69 ▶           deps: [[new Inject(APP_BASE_HREF), new Optional()]],
70 │         },
71 ▶         {
72 ▶           provide: $locationShim,
73 ▶           useFactory: provide$location,
74 │           deps: [
75 │             UpgradeModule,
76 │             Location,
77 │             PlatformLocation,
78 │             UrlCodec,
79 │             LocationStrategy,
80 │             LOC_UPGRADE_TEST_CONFIG,
81 │           ],
82 │         },
83 ▶         LocationUpgradeModule.config({
84 ▶           appBaseHref: config && config.appBaseHref,
85 ▶           useHash: (config && config.useHash) || false,
86 ▶         }).providers!,
87 │       ],
88 │     };
89 │   }
```
*LocationUpgradeTestModule.config: PlatformLocation を MockPlatformLocation に替え、最後に本物の providers を並べる*

1. **設定を token に置く（56 行目）**

   spec の設定（`useHash`・`startUrl`・`appBaseHref` など）を `LOC_UPGRADE_TEST_CONFIG` に置きます。
2. **PlatformLocation を作り物にする（57〜70 行目）**

   `MockPlatformLocation` を `startUrl` と `appBaseHref` で作ります。本物の `history` を使わないので、spec の中で `pushState` しても jasmine のページの URL は変わりません。
3. **$locationShim の provider を置く（71〜82 行目）**

   テスト用の `provide$location` を factory にした provider です。
4. **本物の providers を並べる（83〜86 行目）**

   `LocationUpgradeModule.config({appBaseHref, useHash}).providers` を最後に並べます。本物の providers にも `$locationShim` があるので、同じ token の provider は後に並べた方が勝ち、71〜82 行目の provider は使われません。

> [!TIP]
> **新卒エンジニアへ**
>
> Angular の注入器は、同じ token の provider が 1 つの providers の配列に 2 回出てくると、後に出てきた方を使います。テスト用のモジュールで本物の provider を一部だけ差し替えたいときは、差し替える provider を本物の後ろに置きます。ここでは逆の順で並んでいるので、差し替えが効いていません。

📄 `angular/packages/common/upgrade/test/upgrade_location_test_module.ts` L92–112 （▶ の行: 100, 108–109, 111）

```ts
 92 │ export function provide$location(
 93 │   ngUpgrade: UpgradeModule,
 94 │   location: Location,
 95 │   platformLocation: PlatformLocation,
 96 │   urlCodec: UrlCodec,
 97 │   locationStrategy: LocationStrategy,
 98 │   config?: LocationUpgradeTestingConfig,
 99 │ ) {
100 ▶   const $locationProvider = new $locationShimProvider(
101 │     ngUpgrade,
102 │     location,
103 │     platformLocation,
104 │     urlCodec,
105 │     locationStrategy,
106 │   );
107 │ 
108 ▶   $locationProvider.hashPrefix(config && config.hashPrefix);
109 ▶   $locationProvider.html5Mode(config && !config.useHash);
110 │ 
111 ▶   return $locationProvider.$get();
112 │ }
```
*テスト用の provide$location。108 行目は必ず投げる*

108 行目の `$locationProvider.hashPrefix(...)` は、`$locationShimProvider` の側で必ず「LocationUpgradeModule の config で設定せよ」と投げるメソッドです（[第 1 回](01-lshim-module.md)）。だからこの関数が呼ばれていれば、全部の spec が落ちます。作業木で 72 行目の token を別の名前に替えても 64 の spec がすべて通り、この provider が使われていないことを走らせて確かめました（6 節）。ほかに、ファイルの冒頭の `APP_BASE_HREF_RESOLVED`（テスト用に別に作った token）と、upgrade.spec.ts の `MockUpgradeModule` も、どこからも使われていません（`grep -rn` で 1 か所ずつ）。

📄 `angular/packages/common/upgrade/test/upgrade.spec.ts` L17–41 （▶ の行: 17, 29–32, 34, 36）

```ts
17 ▶ export class MockUpgradeModule {
18 │   $injector = {
19 │     get(key: string) {
20 │       if (key === '$rootScope') {
21 │         return new $rootScopeMock();
22 │       } else {
23 │         throw new Error(`Unsupported mock service requested: ${key}`);
24 │       }
25 │     },
26 │   };
27 │ }
28 │ 
29 ▶ export function injectorFactory() {
30 ▶   const rootScopeMock = new $rootScopeMock();
31 ▶   const rootElementMock = {on: () => undefined};
32 ▶   return function $injectorGet(provider: string) {
33 │     if (provider === '$rootScope') {
34 ▶       return rootScopeMock;
35 │     } else if (provider === '$rootElement') {
36 ▶       return rootElementMock;
37 │     } else {
38 │       throw new Error(`Unsupported injectable mock: ${provider}`);
39 │     }
40 │   };
41 │ }
```
*AngularJS の $injector の作り物。$rootScope と $rootElement だけを返す*

📄 `angular/packages/common/upgrade/test/upgrade.spec.ts` L43–76 （▶ の行: 46–47, 50–51, 54, 57, 60–61, 68, 73–74）

```ts
43 │ export class $rootScopeMock {
44 │   private watchers: any[] = [];
45 │   private events: {[k: string]: any[]} = {};
46 ▶   runWatchers() {
47 ▶     this.watchers.forEach((fn) => fn());
48 │   }
49 │ 
50 ▶   $watch(fn: any) {
51 ▶     this.watchers.push(fn);
52 │   }
53 │ 
54 ▶   $broadcast(evt: string, ...args: any[]) {
55 │     if (this.events[evt]) {
56 │       this.events[evt].forEach((fn) => {
57 ▶         fn.apply(fn, args);
58 │       });
59 │     }
60 ▶     return {
61 ▶       defaultPrevented: false,
62 │       preventDefault() {
63 │         this.defaultPrevented = true;
64 │       },
65 │     };
66 │   }
67 │ 
68 ▶   $on(evt: string, fn: any) {
69 │     this.events[evt] ||= [];
70 │     this.events[evt].push(fn);
71 │   }
72 │ 
73 ▶   $evalAsync(fn: any) {
74 ▶     fn();
75 │   }
76 │ }
```
*$rootScope の作り物。digest も scope の木も無い*

`injectorFactory()` は 30 行目で `$rootScopeMock` を 1 つ作り、32〜40 行目で `$rootScope` と `$rootElement` だけを返す関数を返します。31 行目の `$rootElement` は `on` が何もしない作り物なので、クリックを拾う枝は spec の中で動きません。`$rootScopeMock` の `$watch`（50〜52 行目）は関数を積むだけで、`runWatchers()`（46〜48 行目）を spec が呼んだときに 1 回ずつ呼びます。本物の digest のように「値が落ち着くまで回す」ことはしません。73〜75 行目の `$evalAsync` は渡された関数をその場で呼びます（本物は digest の中の後回しの列に積みます）。

54〜66 行目の `$broadcast` は、57 行目で聞き手に引数だけを渡し、イベントのオブジェクトを渡しません。60〜61 行目で返すオブジェクトはいつも `defaultPrevented: false` です。聞き手が `preventDefault()` を呼ぶ手段が無いので、`$locationChangeStart` を止めて元に戻す枝は、この作り物では通せません。1 節の穴の理由です。

📄 `angular/packages/common/upgrade/test/upgrade.spec.ts` L97–119 （▶ の行: 102, 105–108, 111, 113–114, 117–118）

```ts
 97 │ describe('LocationHtml5Url', function () {
 98 │   let $location: $locationShim;
 99 │   let upgradeModule: UpgradeModule;
100 │ 
101 │   beforeEach(() => {
102 ▶     TestBed.configureTestingModule({
103 │       imports: [
104 │         CommonModule,
105 ▶         LocationUpgradeTestModule.config({
106 ▶           useHash: false,
107 ▶           appBaseHref: '/pre',
108 ▶           startUrl: 'http://server',
109 │         }),
110 │       ],
111 ▶       providers: [UpgradeModule],
112 │     });
113 ▶     upgradeModule = TestBed.inject(UpgradeModule);
114 ▶     upgradeModule.$injector = {get: injectorFactory()};
115 │   });
116 │ 
117 ▶   beforeEach(inject([$locationShim], (loc: $locationShim) => {
118 ▶     $location = loc;
119 │   }));
```
*describe の頭の決まった形。$injector を入れてから $locationShim を inject する*

どの describe も同じ形です。102〜112 行目で TestBed に `LocationUpgradeTestModule.config(…)` と `UpgradeModule` を置き、113 行目で `UpgradeModule` を取り出し、114 行目でその `$injector` を作り物にします。117〜119 行目の 2 つ目の `beforeEach` で初めて `$locationShim` を inject するので、`$get()` が `ngUpgrade.$injector` を読むときには作り物が入っています（順を逆にすると、`$injector` がまだ無い状態で constructor が走ります）。

📄 `angular/packages/common/upgrade/test/upgrade.spec.ts` L705–729 （▶ の行: 705, 713, 715, 717, 723–724, 727–728）

```ts
705 ▶   it('should call changeListeners after $locationChangeSuccess', () => {
706 │     let changeListenerCalled = false;
707 │     let locationChangeSuccessEmitted = false;
708 │ 
709 │     function changeListener(url: string, state: unknown, oldUrl: string, oldState: unknown) {
710 │       changeListenerCalled = true;
711 │     }
712 │ 
713 ▶     $location.onChange(changeListener);
714 │ 
715 ▶     mock$rootScope.$on('$locationChangeSuccess', () => {
716 │       // Ensure that the changeListener hasn't been called yet
717 ▶       expect(changeListenerCalled).toBe(false);
718 │       locationChangeSuccessEmitted = true;
719 │     });
720 │ 
721 │     // Update state and run watchers
722 │     const stateValue = {foo: 'bar'};
723 ▶     $location.state(stateValue);
724 ▶     mock$rootScope.runWatchers();
725 │ 
726 │     // Ensure that change listeners are called and location events are emitted
727 ▶     expect(changeListenerCalled).toBe(true);
728 ▶     expect(locationChangeSuccessEmitted).toBe(true);
729 │   });
```
*作り物で順を確かめる it（#32037）*

705 行目の it は、715 行目で `$rootScopeMock.$on` に `$locationChangeSuccess` の聞き手を置き、その中で 717 行目「`onChange` はまだ呼ばれていない」を確かめます。723 行目で state だけを替えて 724 行目で `runWatchers()` すると、最初の 1 周（初期化）なので `$watch` の中に入り、727〜728 行目で両方が起きたことを確かめます。[第 3 回](03-lshim-api.md)の 7 節のとおり、初期化のあとに state だけを替える道は、この it も通りません。

## 4. 走らせ方と結果

📄 `走らせるコマンド`

```
# 8576f161ae4 の作業木を ../angular-fix から作り、依存を入れる（作業木は使い終えたら消す）
git -C ~/angular-research/angular-fix worktree add --detach <scratchpad>/lshim-wt-b 8576f161ae4
cd <scratchpad>/lshim-wt-b && pnpm install --frozen-lockfile

pnpm bazel test //packages/common/upgrade/test:test --nocache_test_results --test_output=all
pnpm bazel test //packages/common/upgrade/test:test --nocache_test_results --test_output=all \
  --test_arg=--filter=AngularJSUrlCodec
```

📄 `自分で走らせた結果（抜き出し。2026-11-17、作業木 = 8576f161ae4）`

```
INFO: Analyzed target //packages/common/upgrade/test:test (…)
NG0914: The application is using zoneless change detection, but is still loading Zone.js. …
Randomized with seed 62087
Started
................................................................
64 specs, 0 failures
//packages/common/upgrade/test:test                                      PASSED in 1.1s
Executed 1 out of 1 test: 1 test passes.

（--test_arg=--filter=AngularJSUrlCodec を付けたとき）
Ran 9 of 64 specs
9 specs, 0 failures
```

64 の spec がすべて通りました。`NG0914` は「zoneless の変更検知なのに Zone.js を読み込んでいる」という開発モードの警告で、テストの環境が zone.js を読むために出ます。spec の結果には関わりません。`--test_arg=--filter=AngularJSUrlCodec` を付けると `Ran 9 of 64 specs` になり、params.spec.ts の 9 つだけが走りました。

## 5. 書きながら見つけた「spec の無い行」

第 1〜4 回を書きながら、作業木で行を変えたり it を足したりして、spec が固めていない行を確かめました。下の 6 節の表と合わせて、次のとおりです。

- **設定と base href（[第 1 回](01-lshim-module.md)）**: `useHash: true`・APP\_BASE\_HREF の token・`<base href>`・`urlCodec` の設定を通る spec が無い。`hashPrefix` と `serverBaseHref` はそもそも読む行が無い。
- **同期の枝（[第 2 回](02-lshim-sync.md)）**: `preventDefault()` で戻す枝と、クリックの枝は、3 節の作り物では通せない。`urlChanges` の購読・`$destroy` の後片付け・Promise の `$injector` を通る it も無い。port を書かない URL の `port()` を確かめる it も無い（`port()` の it は `:9877` の URL だけ）。
- **getter と setter（[第 3 回](03-lshim-api.md)）**: `search()` の prototype の無いオブジェクト（671 行目、862a0c8ab34 は spec の追加なし）、`url('')` を `'/'` に替える 3 行、`pushState` が投げたときに戻す 2 行は、消しても 64 が通る。初期化のあとに `state()` だけを替える道は、it を足すと今のコードで落ちる。
- **codec（[第 4 回](04-lshim-params.md)）**: `decodeHash` の先頭の `#` を落とす枝は消しても通る。encode の 3 つ・`normalize`・`areEqual` を直接呼ぶ it は無く、`/indexXhtml` の形の it も無い。

## 6. 行を変えて、どの spec が落ちるか

作業木（8576f161ae4）で 1 か所ずつ変えては `//packages/common/upgrade/test:test` を走らせ、元に戻しました。変えるスクリプトの全文は `<scratchpad>/lshim-demo/b/mutate.py` で、ログは 1 つずつ残しています。赤い行が「消しても 1 つも落ちない」行です。

| どこ | 変えたこと | 結果 | 落ちた it |
| --- | --- | --- | --- |
| `params.ts 125` | encodePath の \_stripIndexHtml を外す | 64 specs, 1 failure | LocationHtml5Url should rewrite index URL |
| `params.ts 274` | Object.hasOwn を obj.hasOwnProperty に戻す（e5c37f21de3 の前） | 64 specs, 1 failure | AngularJSUrlCodec decodeSearch should decode a search param named like an Object.prototype member |
| `params.ts 220` | new URL(url, base) に戻す（#32959 の前） | 64 specs, 1 failure | AngularJSUrlCodec parse should ignore an empty base |
| `params.ts 168` | decodeHash の先頭の # を落とす枝を消す | 64 specs, 0 failures | — |
| `location_shim.ts 374〜376` | parseAppUrl の path の先頭に / を足す枝を消す | 64 specs, 6 failures | New URL Parsing should parse new url ほか 5 つ |
| `location_shim.ts 519〜521` | url('') を '/' に替える 3 行を消す | 64 specs, 0 failures | — |
| `location_shim.ts 671` | Object.create(null) を {} にする（862a0c8ab34 の効き目を外す） | 64 specs, 0 failures | — |
| `location_shim.ts 476〜477` | pushState が投げたときに url と state を戻す 2 行を消す | 64 specs, 0 failures | — |
| `location_shim.ts 241〜243` | $watch の中の onChange の通知を消す | 64 specs, 3 failures | $location.onChange() の 'when URL is updated'・'after $locationChangeSuccess'・'forward errors' |
| `upgrade_location_test_module.ts 71〜82` | テスト用の $locationShim の provider の token を別の名前にする | 64 specs, 0 failures | — |

落ちた行は、それを入れたコミットが spec も足したもの（#32976・e5c37f21de3・#32037）か、多くの it が前提にしている行（先頭の `/`）です。落ちなかった行のうち 671 行目は 2026 年の修正の行で、残りは 2019 年の最初の実装からある行です。

## 7. issue と PR の表

2026-11-17 に gh で読んだ（読むだけ）issue と PR から、`@angular/common/upgrade` に関係する 21 件を選び、章に振り分けました（題は日本語に要約）。2019〜2020 年の PR は「PR Close」のコミットで入れる流れだったので、gh の上の状態は「閉」でも中身は入っています。

| # | 種類 | 状態 | 日付 | 題 | 章 | メモ |
| --- | --- | --- | --- | --- | --- | --- |
| #30055 | PR | 入った（PR Close） | 2019-04-24 | $location を真似る LocationUpgradeService を足す（最初の実装） | [第 1 回](01-lshim-module.md) | 152d99eef04・ec455e1cf1a・4277600d5ec など。\_stripIndexHtml もこの時から |
| #30466 | PR | 入った（PR Close） | 2019-05-16 | onChange で AngularJS の URL の更新を Angular の側で聞けるようにする | [第 3 回](03-lshim-api.md) | 1aff524b63f。spec を 81 行足した |
| #30305 | issue | 開いている（P3） | 2019-05-07 | hash のモードで再読み込みすると hash が重なる | [第 3 回](03-lshim-api.md) | 22.1.6 の記録でも再現（第 3 回 9 節） |
| #31882 | issue | 閉（not planned） | 2026-09-02 | useHash で起動すると Unhandled Navigation Error | [第 1 回](01-lshim-module.md) | #70501 のコメントで Won't Fix。第 1 回の記録に同じ文言 |
| #32037 | PR | 入った（PR Close） | 2019-08-13 | onChange を AngularJS のイベントの前に知らせる（題） | [第 3 回](03-lshim-api.md) | 5064dc75acb。入ったコードと spec は $locationChangeSuccess の後 |
| #32874 | issue | 閉（completed） | 2019-10-03 | constructor が parse を 1 引数で呼び、Safari で投げる | [第 4 回](04-lshim-params.md) | #32959 で直った |
| #32959 | PR | 入った（PR Close） | 2019-10-02 | AngularJSUrlCodec を Safari で動かす | [第 4 回](04-lshim-params.md) | 39e8ceb2cd7。params.ts 220 行目 |
| #32976 | PR | 入った（PR Close） | 2019-10-03 | parse の unit test を足す | 第 5 回 | efbce7501b4。params.spec.ts の 8 つの it |
| #34596 | issue | 閉（not planned） | 2026-09-22 | useHash で AngularJS の path の先頭の / が落ちる | [第 1 回](01-lshim-module.md) | 保守モードの注の日に閉じられた 1 件 |
| #34600 | issue | 閉（duplicate） | 2026-01-02 | useHash で最初の URL を正しく読まない | [第 3 回](03-lshim-api.md) | 第 3 回の DEMO の hash の 1 段目と同じ形 |
| #36492 | issue | 閉（completed） | 2020-04-14 | 起動を遅らせたときの redirect で onChange が違う URL を書く | [第 2 回](02-lshim-sync.md) | #36498（0cc53fb3987）で直った |
| #36498 | PR | 入った（PR Close） | 2020-04-14 | 初期化の前の Location の変化を扱う | [第 2 回](02-lshim-sync.md) | 0cc53fb3987。urlChanges の ReplaySubject |
| #43441 | PR | 入った | 2022-02-02 | Angular の Router から二重の遷移を起こさない | ほかの場所 | router/upgrade の setUpLocationSync。common/upgrade ではない |
| #67153 | issue | 閉（not planned） | 2026-09-22 | APP\_BASE\_HREF が $locationShim の path に重なる | [第 1 回](01-lshim-module.md) | 第 1 回の記録で再現 |
| #67157 | PR | 閉（merge されず） | 2026-09-22 | locationShim の path に APP\_BASE\_HREF が重ならないようにする | [第 1 回](01-lshim-module.md) | チームの人の PR。保守モードを理由に閉じた |
| #69023 | PR | 閉（merge されず） | 2026-10-29 | AngularJSUrlCodec で文字どおりの /index.html だけを落とす | [第 4 回](04-lshim-params.md) | 外の人。approve のあと CLA・コンフリクトで止まり、古い PR として閉じた |
| #69061 | PR | 閉（merge されず） | 2026-11-11 | AngularJSUrlCodec で壊れた % を許す | [第 4 回](04-lshim-params.md) | 外の人。Router の #69049 と同じ理由で、作者が同意して閉じた |
| #69259 | PR | 入った | 2026-07-07 | query の解析で安全な hasOwnProperty を使う | [第 4 回](04-lshim-params.md) | e5c37f21de3（外の人）。params.ts 274 行目と Router の url\_tree.ts |
| #70273 | PR | 入った | 2026-08-21 | prototype の衝突を避ける | [第 3 回](03-lshim-api.md) | 862a0c8ab34。search() の 671 行目。spec の追加なし |
| #70501 | PR | 閉（merge されず） | 2026-09-02 | # で始まる URL を $locationShim で読む | [第 3 回](03-lshim-api.md) | 外の人。path のモードのアンカーが path になる、保守モード、の 2 つの理由 |
| #71307 | PR | 入った（angular-main） | 2026-10-14 | 引数と合わない @param の名前を直す | [第 4 回](04-lshim-params.md) | 6e024600e0b。UrlCodec の jsdoc |

## 8. 保守モードのパッケージに、何が入り、何が閉じられたか

`@angular/upgrade` は 2026-09-22 の注（be7ee3a68b2、#70875）で保守モードになり、「セキュリティの修正のほかは、新しい機能も不具合の修正も受け付けない」とされました（[直前のシリーズの最終回](../upg/06-upg-tests-issues.md)）。`@angular/common/upgrade` の PR を、その前後で並べると次のようになります。

- **入ったもの**: query の名前とオブジェクトの組み込みのメンバーがぶつかるのを避ける 2 つ（e5c37f21de3 は外の人、862a0c8ab34 はチームの人）と、jsdoc の `@param` の名前の直し（6e024600e0b、angular-main）です。前の 2 つは、同じ種類の直しを他のパッケージと一緒に入れたもので、e5c37f21de3 は同じコミットで Router の url\_tree.ts を、#70273 は同じ PR の別のコミット（7ba082e08e5）で core の html\_sanitizer.ts を直しています。
- **閉じたもの**: ふるまいを変える直しです。APP\_BASE\_HREF の重なり（#67157、チームの人）と `#` で始まる URL（#70501）は「既存の混在アプリを壊さない」ために、壊れた `%`（#69061）は Router の #69049 と同じ設計の理由で閉じられました。`/index.html`（#69023）は中身ではなく、CLA とコンフリクトで止まったまま古い PR として閉じられました。

📄 `angular/packages/common/upgrade/test/params.spec.ts` L80–87 （▶ の行: 80–84）

```ts
80 ▶   describe('decodeSearch', () => {
81 ▶     it('should decode a search param named like an Object.prototype member', () => {
82 ▶       expect(codec.decodeSearch('hasOwnProperty=foo&bar=baz')).toEqual({
83 ▶         hasOwnProperty: 'foo',
84 ▶         bar: 'baz',
85 │       });
86 │     });
87 │   });
```
*入った修正に付いた it（e5c37f21de3）*

入った外の人の修正（e5c37f21de3）には、80〜87 行目の it が 1 つ付いていて、作業木で修正を戻すとこの it が落ちます（6 節）。閉じた外の人の 3 つの PR のうち 2 つ（#69023・#69061）も params.spec.ts に it を足していました。閉じた理由は spec の有無ではなく、「既存のふるまいを変えるか」と、変えたときに何が壊れうるかでした。

## 9. angular-main の続き

`git -C ../angular-main log 8576f161ae4..HEAD -- packages/common/upgrade` の 3 つのコミットは、どれもふるまいを変えません。

- **ecbc89b465c**（2026-10-06、「modernize unit tests across all packages」）: upgrade.spec.ts の `inject([$locationShim], …)` を `TestBed.inject($locationShim)` に書き換えました（22 行足し 21 行消し）。angular-main では、この章の upgrade.spec.ts の行番号が 90 行目より後で 1 行ずつずれます。
- **6e024600e0b**（2026-10-08、PR #71307）: params.ts の `UrlCodec` の jsdoc の `@param` の名前（[第 4 回](04-lshim-params.md)の 1 節）。行の数は変わりません。
- **9bbb7c9d464**（2026-10-23）: API の文書を作る target を //adev の下へ移し、packages/common/upgrade/BUILD.bazel から 11 行を消しました。test/BUILD.bazel は変わっていません。

## このシリーズで見つけたもの

第 1〜4 回を書いている途中で見つけたものを並べます。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめ、再現には Node の上で動かした `@angular/common/upgrade` 22.1.6 と AngularJS 1.8.3（jsdom 26）を使いました。2026-11-17 に gh で検索した範囲では、「見つからない」と書いた行に当たる issue はありませんでした。

| 何が起きるか | どこ | 確かめ方 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| 初期化のあとに `state()` だけを替えた digest では、ブラウザにも `onChange` にも何も起きない（AngularJS 1.8.3 は history を積む）。替えた state は、次に URL を替えたときに一緒に書かれる | location\_shim.ts 744〜753 行目（`state()` が `updateBrowser` を立てない） | 記録の html5 の 8〜9 段目。作業木に it を足すと 65 specs, 1 failure、`this.updateBrowser = true;` を足すと 65 specs, 0 failures（2 つの作業木で別々に確かめた） | 見つからない | [第 3 回](03-lshim-api.md)・[第 2 回](02-lshim-sync.md) |
| ブラウザの「進む」を `$locationChangeStart` の `preventDefault()` で止めると、`$location` は戻るがブラウザの URL は進んだまま（AngularJS 1.8.3 は書き戻す） | location\_shim.ts の urlChanges の購読（167〜171 行目）と `browserUrl` の 288 行目（`lastBrowserUrl` が popstate でそろわない） | 第 2 回の記録の 7 段目 | 見つからない | [第 2 回](02-lshim-sync.md) |
| port を書かない `http://` の URL で `port()` が 80 ではなく `null` | location\_shim.ts の `DEFAULT_PORTS`（20〜22 行目、キーが `'http:'`）と params.ts 223 行目（protocol の `:` を落とす） | 第 1 回の記録の「protocol() / host() / port()」 | — | [第 2 回](02-lshim-sync.md)・[第 4 回](04-lshim-params.md) |
| `useHash: true` で、開いた URL の hash を `$$hash` と読み、再読み込みのたびに URL の hash が重なって伸びる | location\_shim.ts 359〜371 行目と 484 行目 | 再読み込みを 3 回繰り返す記録。#70501 の差分を写しに当てると伸びないが、path のモードのアンカーが path になる | #30305（開いている）、#70501（閉） | [第 3 回](03-lshim-api.md) |
| `useHash: true` でも `absUrl()` と `$locationChangeStart` に渡る URL に `#` が入らない | location\_shim.ts 485 行目 | 記録の hash のモードの全部の段 | 見つからない | [第 3 回](03-lshim-api.md) |
| `search()` にオブジェクトを渡したあと、`search()` の戻り値に `hasOwnProperty` などのメソッドが無い（AngularJS 1.8.3 の戻り値は普通のオブジェクト） | location\_shim.ts 671 行目（862a0c8ab34） | 記録の 4 段目以降の `typeof search().hasOwnProperty`。671 行目を `{}` に戻しても 64 specs, 0 failures | 見つからない | [第 3 回](03-lshim-api.md) |
| 戻る前と後で hash が違うと、`history.back()` 1 回で `$locationChangeStart` と `$locationChangeSuccess` が 2 回ずつ出る。また戻ったあとの `state()` が、戻った先の `history.state` ではなく最後に書いた state のまま | `Location.onUrlChange` に popstate と hashchange の両方が届く。state は `cacheState` が戻る道で呼ばれないため（どちらも第 2 回の範囲の行） | 記録の 10 段目と、hash が同じ URL の間で戻る比べ（1 回だけ） | 見つからない | [第 3 回](03-lshim-api.md)・[第 2 回](02-lshim-sync.md) |
| `/indexXhtml` のような path も `/index.html` として落とし、`areEqual('/docs', '/docs/indexXhtml')` が true（Angular の `Location` は d109bf90d50 で直っている） | params.ts 238 行目（`.` が escape されていない） | codec の記録と、ページの上の写し | #69023（閉、古い PR として） | [第 4 回](04-lshim-params.md) |
| `hashPrefix` と `serverBaseHref` の設定を読む行が無い。`appBaseHref` も APP\_BASE\_HREF も無いと `<base href>` を読まない | location\_upgrade\_module.ts の `LocationUpgradeConfig` と `provideAppBaseHref` | grep と、設定を変えて起動した記録 | — | [第 1 回](01-lshim-module.md) |
| テスト用の `provide$location` と `APP_BASE_HREF_RESOLVED`、upgrade.spec.ts の `MockUpgradeModule` が使われていない | upgrade\_location\_test\_module.ts 71〜82・92〜112 行目、upgrade.spec.ts 17〜27 行目 | 72 行目の token を替えても 64 specs, 0 failures。`grep -rn` | — | 第 5 回（3 節） |
| 5064dc75acb（#32037）の題と PR の本文は「AngularJS のイベントの前に知らせる」だが、コードと spec は `$locationChangeSuccess` の後 | コミットのメッセージ（location\_shim.ts の `$watch` の中） | `git show 5064dc75acb` と `gh pr view 32037` | — | [第 3 回](03-lshim-api.md) |

## 聞かれそうな質問

**Q. common/upgrade の spec を 1 本だけ走らせられますか？**

走らせられます。BUILD.bazel の 17〜22 行目の `angular_jasmine_test` は Node の jasmine なので、`--test_arg=--filter=<describe か it の名前>` が効きます。`AngularJSUrlCodec` で絞ると `Ran 9 of 64 specs` でした（4 節）。

**Q. spec の中の `$rootScope` は本物ですか？**

作り物です。upgrade.spec.ts の 43〜76 行目の `$rootScopeMock` は、`$watch` を積んで `runWatchers()` で 1 回ずつ呼ぶだけで、`$evalAsync` はその場で呼び、`$broadcast` はいつも `defaultPrevented: false` を返します。digest のくり返しや `preventDefault()` を試すには、本物の AngularJS を読み込む spec が要ります。

**Q. テスト用のモジュールの `provide$location` を直したら、spec のふるまいは変わりますか？**

変わりません。83〜86 行目の本物の providers が同じ `$locationShim` の token を後から置くので、71〜82 行目の provider は使われていません。72 行目の token を替えても 64 の spec がすべて通りました。

**Q. 保守モードの今、どんな修正なら入りますか？**

このパッケージで 2026 年に入ったのは、query の名前と組み込みのメンバーの衝突を避ける 2 つ（e5c37f21de3・862a0c8ab34）と jsdoc の直しで、ふるまいを変える直し（#67157・#70501・#69061）は「既存の混在アプリを壊さない」「設計の理由」で閉じられています（8 節）。

**Q. #30305 は今も開いていますが、なぜ直らないのですか？**

直す形の PR #70501 は、`$$parse` で先頭の `#` を落とすと path のモードのページの中のアンカーまで path として読む、という理由で閉じられ、同じ根の #31882 も not planned になりました（[第 3 回](03-lshim-api.md)の 9 節）。#30305 は開いたままです。

## 読み終えて

- spec は upgrade.spec.ts の 55 と params.spec.ts の 9 の 64 本で、Node の jasmine の 1 つの target。手元で全部通り、`--filter` も効いた
- spec は `MockPlatformLocation` と、digest の無い `$rootScope` の作り物の上で動く。`useHash: true`・`preventDefault()`・クリックを通る spec は無い
- 1 行ずつ変えると、`search()` の 671 行目・`url('')` の 3 行・pushState の失敗の戻し・`decodeHash` の `#` は、消しても 1 つも落ちない
- 保守モードのこのパッケージには、衝突を避ける小さな直しと jsdoc が入り、ふるまいを変える直しは、チームの人のものも外の人のものも閉じられている

---

← 前: [UrlCodec と AngularJSUrlCodec：URL を分けて組み立て直す規則](04-lshim-params.md)  
次: [Vite の設定を組み立てる：server.ts と prebundle と外部の依存](../vds/01-vds-config.md) →
