[目次](../README.md) › [common の内側](README.md) › 第 1 回 / 全 20 回

# common の全体像：ディレクティブ・pipe・i18n・画像・Location

> packages/common/src のディレクトリの分担（directives/・pipes/・i18n/・location/・navigation/・viewport\_scroller.ts・platform\_id.ts・dom\_adapter.ts）と、公開の入口 common.ts、CommonModule と standalone の import の違い、@angular/common/testing と @angular/common/locales の役目。各章へのリンク。ページの上で、1 つの値を本物の pipe と書式の関数に順に通すデモ。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-overview)

---

`@angular/common` は「テンプレートでいつも使うもの」を集めたパッケージです。中身は大きく、**ディレクティブ**（NgClass・NgForOf・NgIf・NgOptimizedImage…）、**pipe**（DatePipe・DecimalPipe…）、**書式とロケール**（formatDate・formatNumber）、**URL と履歴**（Location・ViewportScroller）の 4 つです。この章では、ソースのどのディレクトリが何を受け持ち、公開の入口 `common.ts` が何を外に出し、`@angular/common/testing` などの別の入口がどこで作られるかを、実物の行で確かめます。最後に、1 つの値を本物の pipe に順に通して、シリーズの各章への入口にします。

読む対象は `packages/common/src/common.ts`・`packages/common/package.json`・`packages/common/BUILD.bazel`・`src/platform_id.ts`・`src/errors.ts`・`src/directives/index.ts` です（../angular、22.2.0-next.7、8576f161ae4）。

1. **1. 全体像**（この章）
2. [2. NgClass と NgStyle](02-cmn-ng-class-style.md)
3. [3. NgForOf](03-cmn-ng-for-of.md)
4. [4. NgIf と NgSwitch](04-cmn-ng-if-switch.md)
5. [5. outlet](05-cmn-outlets.md)
6. [6. pipe の仕組み](06-cmn-pipe-mechanism.md)
7. [7. 小さな pipe](07-cmn-simple-pipes.md)
8. [8. KeyValuePipe](08-cmn-keyvalue-pipe.md)
9. [9. DatePipe](09-cmn-date-pipe.md)
10. [10. 日付の書式](10-cmn-format-date.md)
11. [11. 日付の部品](11-cmn-date-getters.md)
12. [12. 数の書式](12-cmn-format-number.md)
13. [13. NgOptimizedImage](13-cmn-image-overview.md)
14. [14. srcset と sizes](14-cmn-image-srcset.md)
15. [15. 画像のローダー](15-cmn-image-loaders.md)
16. [16. LCP と preload](16-cmn-image-lcp-preload.md)
17. [17. Location](17-cmn-location.md)
18. [18. テスト用の Location](18-cmn-location-testing.md)
19. [19. ViewportScroller](19-cmn-viewport-scroller.md)
20. [20. issue と PR を読む](20-cmn-issues.md)

## 1. ディレクトリの分担

`packages/common/src/` を `ls` と `wc -l` で数えた表です（2026-11-05、8576f161ae4）。右の列が、このシリーズでその中身を読む回です。

| 場所 | ファイル数・行数 | 受け持ち | 読む回 |
| --- | --- | --- | --- |
| `directives/` | 9・1766 行 | NgClass・NgStyle・NgForOf・NgIf・NgSwitch・NgPlural・NgTemplateOutlet・NgComponentOutlet と `index.ts` | [2](02-cmn-ng-class-style.md)・[3](03-cmn-ng-for-of.md)・[4](04-cmn-ng-if-switch.md)・[5](05-cmn-outlets.md) |
| `directives/ng_optimized_image/` | 9・2092 行（+ `image_loaders/` 8・589 行） | NgOptimizedImage、srcset の組み立て、LCP の監視、preconnect の検査、preload の link、CDN ごとのローダー | [13](13-cmn-image-overview.md)〜[16](16-cmn-image-lcp-preload.md) |
| `pipes/` | 12・1538 行 | AsyncPipe・DatePipe・数の pipe・KeyValuePipe・SlicePipe・JsonPipe・大文字小文字・I18nPluralPipe・I18nSelectPipe | [6](06-cmn-pipe-mechanism.md)〜[9](09-cmn-date-pipe.md)（AsyncPipe は [async-pipe](../template/08-async-pipe.md)） |
| `i18n/` | 6・2505 行 | `format_date.ts`（1003 行）・`format_number.ts`（544 行）・ロケールのデータを引く `locale_data_api.ts`・通貨の表 `currencies.ts`・`localization.ts` | [10](10-cmn-format-date.md)〜[12](12-cmn-format-number.md)（データの登録は [loc-locale-data](../loc/12-loc-locale-data.md)） |
| `location/` | 7・1036 行 | Location・LocationStrategy（Path と Hash）・PlatformLocation・Navigation API との橋渡し | [17](17-cmn-location.md)（Router の側は [router-browser-url](../router/16-router-browser-url.md)） |
| `navigation/` | 1・68 行 | PlatformNavigation（Navigation API の抽象） | [router-platform-navigation](../router/21-router-platform-navigation.md) |
| `viewport_scroller.ts` | 247 行 | ViewportScroller（スクロール位置とアンカー） | [19](19-cmn-viewport-scroller.md) |
| `platform_id.ts`・`errors.ts` | 26 行・64 行 | `isPlatformBrowser`・`isPlatformServer`、エラーの番号 | この章の 5・6 節 |
| `dom_adapter.ts`・`cookie.ts`・`xhr.ts` | 57・36・29 行 | DomAdapter（`ɵgetDOM`）、cookie の値の読み取り、XhrFactory | [domr-title-meta](../domr/19-domr-title-meta.md)・[http-xsrf](../http/09-http-xsrf.md)・[http-backend-xhr](../http/07-http-backend-xhr.md) |

`src/` の外に、別の入口になる 4 つのディレクトリがあります。`testing/`（`src/` と `src/navigation/` で 795 行）・`upgrade/`（1332 行）・`http/`（`src/` に 19 ファイル）・`locales/`（ロケールのデータ。ほとんどはビルドのときに CLDR から作る）です。どうやって別の入口になるかは 4 節で見ます。

## 2. 公開の入口 common.ts

📄 `angular/packages/common/src/common.ts` L14–51 （▶ の行: 14–20, 51）

```ts
14 ▶ export * from './private_export';
15 ▶ export * from './location/index';
16 ▶ export {formatDate} from './i18n/format_date';
17 ▶ export {formatCurrency, formatNumber, formatPercent} from './i18n/format_number';
18 ▶ export {NgLocaleLocalization, NgLocalization} from './i18n/localization';
19 ▶ export {registerLocaleData} from './i18n/locale_data';
20 ▶ export {PlatformNavigation} from './navigation/platform_navigation';
21 │ export {
22 │   Plural,
23 │   NumberFormatStyle,
24 │   FormStyle,
25 │   Time,
26 │   TranslationWidth,
27 │   FormatWidth,
28 │   NumberSymbol,
29 │   WeekDay,
30 │   getNumberOfCurrencyDigits,
31 │   getCurrencySymbol,
32 │   getLocaleDayPeriods,
33 │   getLocaleDayNames,
34 │   getLocaleMonthNames,
35 │   getLocaleId,
36 │   getLocaleEraNames,
37 │   getLocaleWeekEndRange,
38 │   getLocaleFirstDayOfWeek,
39 │   getLocaleDateFormat,
40 │   getLocaleDateTimeFormat,
41 │   getLocaleExtraDayPeriodRules,
42 │   getLocaleExtraDayPeriods,
43 │   getLocalePluralCase,
44 │   getLocaleTimeFormat,
45 │   getLocaleNumberSymbol,
46 │   getLocaleNumberFormat,
47 │   getLocaleCurrencyCode,
48 │   getLocaleCurrencyName,
49 │   getLocaleCurrencySymbol,
50 │   getLocaleDirection,
51 ▶ } from './i18n/locale_data_api';
```

12 行目のとおり、`@angular/common` と書いて import できるものは、全部このファイルから出ています。14 行目の `private_export` は名前が `ɵ` で始まる非公開の部品（`ɵgetDOM` など）で、platform-browser や router が使います。15 行目で Location まわりを丸ごと、16〜19 行目で書式の関数・`NgLocalization`・`registerLocaleData` を出します。21〜51 行目はロケールのデータを読む `getLocale*` 関数の一覧です（[第 11 回](11-cmn-date-getters.md)・[loc-locale-data](../loc/12-loc-locale-data.md)）。

📄 `angular/packages/common/src/common.ts` L52–88 （▶ の行: 53, 56–57, 71, 86）

```ts
52 │ export {parseCookieValue as ɵparseCookieValue} from './cookie';
53 ▶ export {CommonModule} from './common_module';
54 │ export {
55 │   NgClass,
56 ▶   NgFor,
57 ▶   NgForOf,
58 │   NgForOfContext,
59 │   NgIf,
60 │   NgIfContext,
61 │   NgPlural,
62 │   NgPluralCase,
63 │   NgStyle,
64 │   NgSwitch,
65 │   NgSwitchCase,
66 │   NgSwitchDefault,
67 │   NgTemplateOutlet,
68 │   NgComponentOutlet,
69 │ } from './directives/index';
70 │ export {
71 ▶   AsyncPipe,
72 │   DatePipe,
73 │   DatePipeConfig,
74 │   DATE_PIPE_DEFAULT_TIMEZONE,
75 │   DATE_PIPE_DEFAULT_OPTIONS,
76 │   I18nPluralPipe,
77 │   I18nSelectPipe,
78 │   JsonPipe,
79 │   LowerCasePipe,
80 │   CurrencyPipe,
81 │   DecimalPipe,
82 │   PercentPipe,
83 │   SlicePipe,
84 │   UpperCasePipe,
85 │   TitleCasePipe,
86 ▶   KeyValuePipe,
87 │   KeyValue,
88 │ } from './pipes/index';
```

53 行目が `CommonModule`、54〜69 行目がディレクティブ、70〜88 行目が pipe です。56・57 行目に `NgFor` と `NgForOf` の 2 つの名前がありますが、中身は同じクラスです（3 節）。71 行目の `AsyncPipe` は [async-pipe](../template/08-async-pipe.md) で、86 行目の `KeyValuePipe` は [第 8 回](08-cmn-keyvalue-pipe.md)で読みます。

📄 `angular/packages/common/src/common.ts` L89–116 （▶ の行: 90, 92–93, 96, 104, 113, 116）

```ts
 89 │ export {
 90 ▶   PLATFORM_BROWSER_ID as ɵPLATFORM_BROWSER_ID,
 91 │   PLATFORM_SERVER_ID as ɵPLATFORM_SERVER_ID,
 92 ▶   isPlatformBrowser,
 93 ▶   isPlatformServer,
 94 │ } from './platform_id';
 95 │ export {VERSION} from './version';
 96 ▶ export {ViewportScroller, NullViewportScroller as ɵNullViewportScroller} from './viewport_scroller';
 97 │ export {XhrFactory} from './xhr';
 98 │ export {
 99 │   IMAGE_CONFIG,
100 │   ImageConfig,
101 │   IMAGE_LOADER,
102 │   ImageLoader,
103 │   ImageLoaderConfig,
104 ▶   NgOptimizedImage,
105 │   ImagePlaceholderConfig,
106 │   PRECONNECT_CHECK_BLOCKLIST,
107 │   provideCloudflareLoader,
108 │   provideCloudinaryLoader,
109 │   provideImageKitLoader,
110 │   provideImgixLoader,
111 │   provideNetlifyLoader,
112 │ } from './directives/ng_optimized_image';
113 ▶ export {normalizeQueryParams as ɵnormalizeQueryParams} from './location/util';
114 │ 
115 │ // Backwards compatibility re-export.
116 ▶ export {DOCUMENT} from '@angular/core';
```

90〜91 行目、`'browser'` と `'server'` の文字列は `ɵ` 付きの名前でしか出していません。利用者には 92〜93 行目の関数で比べてもらう、という分け方です（5 節）。96 行目が ViewportScroller、98〜112 行目が NgOptimizedImage と CDN のローダー、113 行目は router が使う `ɵnormalizeQueryParams` です。116 行目、`DOCUMENT` は 2025-04 の commit 7ccec1494f8（feat(core): move DOCUMENT token into core）で core に移り、ここでは古い import を壊さないために core から出し直しているだけです。

## 3. CommonModule と standalone の import

`CommonModule`（`common_module.ts`）は、`COMMON_DIRECTIVES` と `COMMON_PIPES` を imports と exports に並べただけの NgModule です。その中身と、exports がコンパイラにどう読まれるかは [ngmodule-exports](../ngmodule/05-ngmodule-exports.md) で引用して読みました。ここでは、`COMMON_DIRECTIVES` の手前の行を見ます。

📄 `angular/packages/common/src/directives/index.ts` L9–35 （▶ の行: 13, 23–24）

```ts
 9 │ import {Provider} from '@angular/core';
10 │ 
11 │ import {NgClass} from './ng_class';
12 │ import {NgComponentOutlet} from './ng_component_outlet';
13 ▶ import {NgFor, NgForOf, NgForOfContext} from './ng_for_of';
14 │ import {NgIf, NgIfContext} from './ng_if';
15 │ import {NgPlural, NgPluralCase} from './ng_plural';
16 │ import {NgStyle} from './ng_style';
17 │ import {NgSwitch, NgSwitchCase, NgSwitchDefault} from './ng_switch';
18 │ import {NgTemplateOutlet} from './ng_template_outlet';
19 │ 
20 │ export {
21 │   NgClass,
22 │   NgComponentOutlet,
23 ▶   NgFor,
24 ▶   NgForOf,
25 │   NgForOfContext,
26 │   NgIf,
27 │   NgIfContext,
28 │   NgPlural,
29 │   NgPluralCase,
30 │   NgStyle,
31 │   NgSwitch,
32 │   NgSwitchCase,
33 │   NgSwitchDefault,
34 │   NgTemplateOutlet,
35 │ };
```

13 行目、`ng_for_of.ts` から `NgFor` と `NgForOf` の 2 つを import しています。`ng_for_of.ts` の最後で `export {NgForOf as NgFor}` としているので、2 つは同じクラスです（[第 3 回](03-cmn-ng-for-of.md)）。23〜24 行目で両方を外に出しますが、同じファイルの下にある `COMMON_DIRECTIVES`（ngmodule-exports で引用済み）には `NgForOf` だけが入っています。同じクラスを 2 回並べる必要がないからです。

standalone のコンポーネントでは、`imports: [CommonModule]` と書く代わりに `imports: [NgClass, DatePipe]` と 1 つずつ書けます。ディレクティブのソースには `standalone: true` がありません。v19 から standalone が既定なので、2024-11 の commit 9658dd1fe33（refactor(common): remove standalone: true）で消されました。このサイトが使う 22.1.6 の `fesm2022/_common_module-chunk.mjs` では、11 のディレクティブの `ɵɵngDeclareDirective` と 13 の pipe の `ɵɵngDeclarePipe` のどれにも `isStandalone: true` が入っています。1 つずつ書くと、使わないディレクティブと pipe がバンドルに入りません。どちらで書いても、テンプレートの中で何が起きるかは同じです。

## 4. 入口は 1 つではない：package.json と ng\_package

📄 `angular/packages/common/package.json` L10–22 （▶ の行: 10, 14–15, 18）

```json
10 ▶   "locales": "locales",
11 │   "dependencies": {
12 │     "tslib": "^2.3.0"
13 │   },
14 ▶   "exports": {
15 ▶     "./locales/global/*": {
16 │       "default": "./locales/global/*.js"
17 │     },
18 ▶     "./locales/*": {
19 │       "types": "./locales/*.d.ts",
20 │       "default": "./locales/*.js"
21 │     }
22 │   },
```

ソースの `package.json` の `exports` には、14〜22 行目の `./locales/global/*` と `./locales/*` の 2 つしかありません。`@angular/common/testing` や `@angular/common/http` はどこから来るのでしょうか。答えは BUILD.bazel です。

📄 `angular/packages/common/BUILD.bazel` L28–62 （▶ の行: 28, 32–33, 55–60）

```python
28 ▶ ng_package(
29 │     srcs = [
30 │         "package.json",
31 │     ],
32 ▶     nested_packages = ["//packages/common/locales:npm_package"],
33 ▶     package = "@angular/common",
34 │     replace_prefixes = {
35 │         "locales/npm_package": "locales/",
36 │     },
37 │     tags = [
38 │         "release-with-framework",
39 │     ],
40 │     # Do not add more to this list.
41 │     # Dependencies on the full npm_package cause long re-builds.
42 │     visibility = [
43 │         "//adev:__pkg__",
44 │         "//adev/shared-docs:__subpackages__",
45 │         "//integration:__subpackages__",
46 │         "//modules/ssr-benchmarks:__subpackages__",
47 │         "//packages/bazel/test/ng_package:__pkg__",
48 │         "//packages/compiler-cli/integrationtest:__pkg__",
49 │         "//packages/compiler-cli/test:__pkg__",
50 │         "//packages/compiler-cli/test/diagnostics:__pkg__",
51 │         "//packages/compiler-cli/test/transformers:__pkg__",
52 │         "//packages/compiler/test:__pkg__",
53 │         "//packages/language-service/test:__pkg__",
54 │     ],
55 ▶     deps = [
56 ▶         "//packages/common",
57 ▶         "//packages/common/http",
58 ▶         "//packages/common/http/testing",
59 ▶         "//packages/common/testing",
60 ▶         "//packages/common/upgrade",
61 │     ],
62 │ )
```

28 行目の `ng_package` が npm に出す形を作ります。55〜61 行目の deps に並んだ 5 つの `ng_project`（`common`・`common/http`・`common/http/testing`・`common/testing`・`common/upgrade`）が、それぞれ 1 つの入口になります。32 行目でロケールのパッケージを中に入れます。実際にこのサイトの `node_modules/@angular/common/package.json`（22.1.6）の `exports` を見ると、ソースの 2 つに加えて `"."`・`"./http"`・`"./http/testing"`・`"./testing"`・`"./upgrade"`・`"./package.json"` が足されていて、`"."` は `./fesm2022/common.mjs`、`"./testing"` は `./fesm2022/testing.mjs` を指しています。

| 入口 | ソース | 中身 | 読む回 |
| --- | --- | --- | --- |
| `@angular/common` | `src/common.ts` | 2 節のとおり | このシリーズの全部 |
| `@angular/common/testing` | `testing/src/testing.ts` | SpyLocation・MockLocationStrategy・MockPlatformLocation・provideLocationMocks | [18](18-cmn-location-testing.md) |
| `@angular/common/http`・`/http/testing` | `http/` | HttpClient と、テスト用の HttpTestingController | [http シリーズ](../http/01-http-overview.md) |
| `@angular/common/upgrade` | `upgrade/src/index.ts` | AngularJS の `$location` を Angular の Location で動かす `$locationShim`・`LocationUpgradeModule` | このシリーズでは読みません |
| `@angular/common/locales/*` | `locales/` | ロケールごとのデータ（`fr`・`ja`…）。`global/*` は `registerLocaleData` を呼ばずに登録まで済ませる版 | [loc-locale-data](../loc/12-loc-locale-data.md) |

> [!TIP]
> **新卒エンジニアへ**
>
> `@angular/common/http` のように、1 つの npm パッケージの中に入口が複数あるものを「二次エントリポイント」と呼びます。入口ごとに別の `.mjs` になるので、`@angular/common` だけを使うアプリには HttpClient のコードが入りません。

## 5. isPlatformBrowser は文字列を比べるだけ

📄 `angular/packages/common/src/platform_id.ts` L9–26 （▶ の行: 9–10, 16–17, 24–25）

```ts
 9 ▶ export const PLATFORM_BROWSER_ID = 'browser';
10 ▶ export const PLATFORM_SERVER_ID = 'server';
11 │ 
12 │ /**
13 │  * Returns whether a platform id represents a browser platform.
14 │  * @publicApi
15 │  */
16 ▶ export function isPlatformBrowser(platformId: Object): boolean {
17 ▶   return platformId === PLATFORM_BROWSER_ID;
18 │ }
19 │ 
20 │ /**
21 │  * Returns whether a platform id represents a server platform.
22 │  * @publicApi
23 │  */
24 ▶ export function isPlatformServer(platformId: Object): boolean {
25 ▶   return platformId === PLATFORM_SERVER_ID;
26 │ }
```

16〜18 行目、`isPlatformBrowser` は渡された値が 9 行目の `'browser'` と `===` で等しいかを返すだけです。比べる値は、core の `PLATFORM_ID` トークンから `inject(PLATFORM_ID)` で取ってきます。

📄 `angular/packages/core/src/application/application_tokens.ts` L85–95 （▶ の行: 89, 92–93）

```ts
85 │ /**
86 │  * A token that indicates an opaque platform ID.
87 │  * @publicApi
88 │  */
89 ▶ export const PLATFORM_ID = new InjectionToken<Object>(
90 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'Platform ID' : '',
91 │   {
92 ▶     providedIn: 'platform',
93 ▶     factory: () => 'unknown', // set a default platform name, when none set explicitly
94 │   },
95 │ );
```

92 行目、`PLATFORM_ID` はプラットフォームのインジェクタ（アプリより 1 つ上の木）に置かれるトークンで、誰も値を決めないと 93 行目の `'unknown'` になります。ブラウザでは platform-browser の `browser.ts` の `INTERNAL_BROWSER_PLATFORM_PROVIDERS` が `{provide: PLATFORM_ID, useValue: PLATFORM_BROWSER_ID}` を入れ（[boot-injectors](../boot/08-boot-injectors.md)）、サーバーでは platform-server の `server.ts` が `PLATFORM_SERVER_ID` を入れます（[ssr-platform-server](../platform/03-ssr-platform-server.md)）。どちらも値を入れない木では `'unknown'` のままなので、`isPlatformBrowser` も `isPlatformServer` も `false` を返します。「ブラウザでなければサーバー」とは限りません。

このサイトのデモはすべて、ボタンのクリックの中でだけ動きます。プリレンダー（ビルドのときに Node でページを描くこと）の最中は `PLATFORM_ID` が `'server'` なので、`isPlatformBrowser` で分けるか、クリックを待つかのどちらかが要ります。

## 6. エラーの番号

📄 `angular/packages/common/src/errors.ts` L9–45 （▶ の行: 11, 15–16, 19, 22, 25, 44）

```ts
 9 │ /**
10 │  * The list of error codes used in runtime code of the `common` package.
11 ▶  * Reserved error code range: 2000-2999.
12 │  */
13 │ export const enum RuntimeErrorCode {
14 │   // NgSwitch errors
15 ▶   PARENT_NG_SWITCH_NOT_FOUND = 2000,
16 ▶   EQUALITY_NG_SWITCH_DIFFERENCE = 2001,
17 │ 
18 │   // NgIf errors
19 ▶   NG_IF_NOT_A_TEMPLATE_REF = 2020,
20 │ 
21 │   // Pipe errors
22 ▶   INVALID_PIPE_ARGUMENT = 2100,
23 │ 
24 │   // NgForOf errors
25 ▶   NG_FOR_MISSING_DIFFER = -2200,
26 │ 
27 │   // I18n errors
28 │   SUSPICIOUS_DATE_FORMAT = 2300,
29 │   UNKNOWN_DATE_TYPE_VALUE = 2301,
30 │   UNEXPECTED_TRANSLATION_TYPE = 2302,
31 │   MISSING_EXTRA_LOCALE_DATA_FOR_LOCALE = 2303,
32 │   LOCALE_DATA_UNDEFINED = 2304,
33 │   INVALID_INTEGER_LITERAL = 2305,
34 │   INVALID_DIGIT_INFO = 2306,
35 │   INVALID_NUMBER_OF_DIGITS_AFTER_FRACTION = 2307,
36 │   NO_PLURAL_MESSAGE_FOUND = 2308,
37 │   VALUE_NOT_A_NUMBER = 2309,
38 │   UNKNOWN_ZONE_WIDTH = 2310,
39 │   INVALID_TO_DATE_CONVERSION = 2311,
40 │ 
41 │   // Miscellaneous errors
42 │   SCROLL_RESTORATION_UNSUPPORTED = 2400,
43 │ 
44 ▶   // Keep 2800 - 2900 for Http Errors.
45 │ 
```

11 行目、common のエラーの番号は 2000〜2999 です。番号は core の `formatRuntimeErrorCode` で `NG0` を前に付けて表示されるので、22 行目の `INVALID_PIPE_ARGUMENT = 2100` は「NG02100」になります（[contrib-coding-standards](../contrib/13-contrib-coding-standards.md)）。25 行目の `NG_FOR_MISSING_DIFFER = -2200` は負の数です。負の番号は、開発モードのメッセージの後ろに angular.dev のエラーの説明ページへのリンクを足す印です（同じ core の `formatRuntimeError`）。44 行目のとおり 2800〜2900 は HTTP の分として空けてあります。

16 行目の `EQUALITY_NG_SWITCH_DIFFERENCE = 2001` は、今はどこからも使われていません（`grep -rn EQUALITY_NG_SWITCH_DIFFERENCE packages` で errors.ts の 1 件だけ）。これを使っていた警告は 2024-06 の 08f56d980bf で消えました。理由は[第 4 回](04-cmn-ng-if-switch.md)で読みます。

📄 `angular/packages/common/BUILD.bazel` L64–82 （▶ の行: 64, 70, 74, 80–81）

```python
64 ▶ api_golden_test_npm_package(
65 │     name = "common_api",
66 │     data = [
67 │         ":npm_package",
68 │         "//goldens:public-api",
69 │     ],
70 ▶     golden_dir = "goldens/public-api/common",
71 │     npm_package = "packages/common/npm_package",
72 │ )
73 │ 
74 ▶ api_golden_test(
75 │     name = "common_errors",
76 │     data = [
77 │         "//goldens:public-api",
78 │         "//packages/common",
79 │     ],
80 ▶     entry_point = "src/errors.d.ts",
81 ▶     golden = "goldens/public-api/common/errors.api.md",
82 │ )
```

80〜81 行目、`errors.ts` は公開 API と同じように golden（期待するファイル）と比べるテストがあります。`const enum` の値を足したり変えたりすると、`goldens/public-api/common/errors.api.md` も一緒に直さないとこのテストが落ちます。64〜72 行目は npm に出す全部の入口の公開 API を golden と比べるテストです（[contrib-public-api](../contrib/08-contrib-public-api.md)）。

## 7. 1 つの値を、本物の pipe に順に通す

> **🧪 DEMO — 1 つの値と、このサイトの本物の pipe・書式の関数**
>
> このサイトが使っている本物の `@angular/common` 22.1.6 の pipe のクラスを `new` して、`transform` を直接呼びます（テンプレートの `| date` と同じクラスです。ロケールは `'en-US'`）。`KeyValuePipe` には、このページの本物の `KeyValueDiffers` を渡します。例外も、そのまま表に出します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-overview)

デモで確かめられることです（2026-11-05 に headless Chrome で、開発ビルドで記録。ブラウザの時間帯は Asia/Tokyo）。

1. **日付の文字列 `2026-11-05T09:30:00Z`**

   DatePipe はブラウザの時間帯で `"Nov 5, 2026, 6:30:00 PM"`、時間帯に `'UTC'` を渡した formatDate は `"2026-11-05 09:30"`。数の 3 つの pipe は `NG02100: InvalidPipeArgument: 'NG02309: … is not a number'` の例外です。中の NG02309 は、pipe が値を数に直す `strToNumber`（`pipes/number_pipe.ts`）が投げたものを、pipe が NG02100 で包み直したものです。KeyValuePipe はオブジェクトでないので `null`、SlicePipe は `"2026-"`。
2. **数 `1234.5678`**

   DecimalPipe `"1,234.57"`・PercentPipe `"123,457%"`・CurrencyPipe（JPY は小数 0 桁）`"¥1,235"`。DatePipe は数を「1970-01-01 からのミリ秒」として読み `"Jan 1, 1970, 9:00:01 AM"`。SlicePipe・TitleCasePipe・UpperCasePipe は文字列（Slice は配列も）しか受け付けず NG02100 です。
3. **オブジェクト**

   KeyValuePipe は `[{key: "10"}, {key: "2"}, {key: "a"}, {key: "b"}]` の順に並べて返します。`JSON.parse` の結果は `"2"`・`"10"` の順なのに入れ替わるのは、鍵を文字列として比べるからです（[第 8 回](08-cmn-keyvalue-pipe.md)）。JsonPipe は 2 文字の字下げで文字列にします。日付と数の関数は例外です。
4. **文字列**

   SlicePipe `"hello"`・TitleCasePipe `"Hello Angular Common"`・UpperCasePipe が効き、日付は NG02311（日付にできない）、数は NG02309 です。

> [!WARNING]
> **ハマりどころ**
>
> `formatNumber` の行だけは、数でない値を渡しても例外にならず `"∞"` を返します。`formatNumber` の引数の型は `number` で、文字列やオブジェクトはもともと型の外です（このデモは型を越えて渡しています）。中では `!isFinite(value)` のとき無限大の記号を出していて、グローバルの `isFinite` は文字列を数に直してから見るので、数にならない値は全部「有限でない」になります。以前は本物の `NaN` も `"∞"` でしたが、2026-08 の commit 7596548e9b8（fix(common): use locale NaN symbol in number formatting。22.1 系には e8378dfeab3 として 22.1.4 から入っています）で、`Number.isNaN(value)` なら NaN の記号を使うように直りました。このサイトの 22.1.6 にも入っていて、「数」で `abc` と入れると（`Number('abc')` は `NaN`）`"NaN"` になります。`Number.isNaN` は文字列を数に直さないので、文字列を渡すと今も `"∞"` です。中身は[第 12 回](12-cmn-format-number.md)で読みます。

> [!NOTE]
> **ポイント**
>
> テンプレートで `{{ 123 | titlecase }}` と書くと、`TitleCasePipe.transform` の引数の型が `string | null | undefined` なので、型の検査（strictTemplates）で先に止まります。このデモはテンプレートを通さず `transform` を直接呼ぶので、型の検査を越えて実行時に何が起きるかが見えます。pipe が「どこで」呼ばれ、結果がいつ使い回されるかは[第 6 回](06-cmn-pipe-mechanism.md)で読みます。

## テストと直し方

### spec の置き場所

common の spec は、ソースと同じ形に `packages/common/test/` に並んでいます。`test/BUILD.bazel` の 1 つの `ts_project` が全部をまとめ、Node で走らせる `zoneless_jasmine_test`（名前 `test`）と、ブラウザで走らせる `zoneless_web_test_suite`（名前 `test_web`）の 2 つのターゲットに渡しています。

| ディレクトリ | spec |
| --- | --- |
| `test/directives/` | ng\_class・ng\_style・ng\_for・ng\_if・ng\_switch・ng\_plural・ng\_template\_outlet・ng\_component\_outlet・ng\_optimized\_image・non\_bindable の 10 本 |
| `test/pipes/` | async・case\_conversion・date・i18n\_plural・i18n\_select・json・keyvalue・number・slice の 9 本 |
| `test/i18n/` | format\_date・format\_number・locale\_data\_api・localization の 4 本 |
| `test/location/`・`test/navigation/`・`test/image_loaders/` | location・provide\_location\_mocks、navigation、image\_loader |
| `test/` | cookie・viewport\_scroller |

`isPlatformBrowser` を直接確かめる spec は common の test にありません（`grep -rln isPlatformBrowser packages/common/test packages/core/test` で 0 件）。`ng_optimized_image_spec.ts` は `isBrowser` を見て Node では中身を飛ばすので、画像の章では `test_web_chromium` を走らせます。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/cmn-logs/a-common-all.log）`

```
667 specs, 0 failures
INFO: Elapsed time: 8.871s, Critical Path: 1.86s
//packages/common/test:test                                              PASSED in 1.7s
```

Node で 667 件が 1.7 秒で通ります。`--test_arg=--filter=` で describe の名前に絞る方法と、0 件一致でも PASSED になることへの注意は[contrib-run-tests](../contrib/05-contrib-run-tests.md)のとおりです。各章の「テストと直し方」で、その章の describe に絞ったコマンドを書きます。

### 直すとしたら

- 新しい公開の名前を足すなら `common.ts` の export と、`goldens/public-api/common/` の golden です（6 節の 64〜72 行目のテスト）。
- 新しいエラーの番号は `errors.ts` の 2000〜2999 の中で、`errors.api.md` の golden も直します（80〜81 行目）。HTTP の 2800〜2900 には入れません。
- 2026 年に common に入った修正（digitsInfo の上限・日付の書式の長さ・プロトタイプ汚染・ViewportScroller・ngTemplateOutlet の injector など）は、どれも 1 つの関数を直して、同じ名前の spec に it を足す形です。一覧と読み方は[第 20 回](20-cmn-issues.md)にまとめます。本家に PR を出すことは勧めません。手元で spec を走らせ、issue を読むときの手がかりにします。

## 聞かれそうな質問

**Q. `CommonModule` を import するのと、`NgIf` や `DatePipe` を 1 つずつ import するのは何が違いますか？**

テンプレートの中の動きは同じです。`CommonModule` は `COMMON_DIRECTIVES` と `COMMON_PIPES` を exports に並べた NgModule で（[ngmodule-exports](../ngmodule/05-ngmodule-exports.md)）、そのコンポーネントのテンプレートから全部が見えるようになるだけです。1 つずつ書くと、使っていないものがバンドルに入りません。ディレクティブも pipe も standalone なので、どちらの書き方もできます。

**Q. `@angular/common/testing` はソースの `package.json` に書いてありません。どこで作られますか？**

`BUILD.bazel` の `ng_package` の deps（55〜61 行目）に `//packages/common/testing` があり、それが 1 つの入口になって、npm に出す `package.json` の `exports` に `"./testing"` が足されます。ソースの `exports`（14〜22 行目）にあるのはロケールの 2 つだけです。

**Q. `isPlatformBrowser(inject(PLATFORM_ID))` は何を見ていますか？**

`platform_id.ts` の 17 行目で、値が文字列 `'browser'` と `===` で等しいかを見るだけです。値はプラットフォームのインジェクタにある `PLATFORM_ID` で、platform-browser が `'browser'`、platform-server が `'server'` を入れ、どちらも入れなければ `application_tokens.ts` の 93 行目の `'unknown'` です。

**Q. エラーの「NG02100」はどこから来ますか？**

common の `errors.ts` の 22 行目の `INVALID_PIPE_ARGUMENT = 2100` に、core が `NG0` を前に付けたものです。common の番号は 11 行目のとおり 2000〜2999 です。

**Q. `NgFor` と `NgForOf` は別のディレクティブですか？**

同じクラスです。`ng_for_of.ts` が `NgForOf as NgFor` で別名を出し、`directives/index.ts` の 13 行目で両方を import して、23〜24 行目で両方を export します。セレクタ `*ngFor` と名前を揃えたいときに `NgFor` を使います（[第 3 回](03-cmn-ng-for-of.md)）。

## 読み終えて

- `@angular/common` は directives・pipes・i18n・location の 4 つと、ViewportScroller・platform\_id・errors などの小さなファイルでできている。
- 公開の名前は全部 `common.ts` から出る。`ɵ` で始まる名前は他のパッケージ向けの非公開。
- `/testing`・`/http`・`/upgrade` は BUILD の `ng_package` が作る別の入口で、ソースの `package.json` にはロケールしか書いていない。
- `isPlatformBrowser` は `PLATFORM_ID` の文字列を比べるだけ。値はプラットフォームのインジェクタで決まる。
- common のエラーは 2000〜2999。番号と公開 API は golden のテストで守られている。

---

← 前: [issue と PR を読む：レンダラー・スタイル・イベント・セキュリティの今](../domr/20-domr-issues.md)  
次: [NgClass と NgStyle：DoCheck で差分を取って書く](02-cmn-ng-class-style.md) →
