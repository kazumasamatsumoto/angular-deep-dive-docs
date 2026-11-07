[目次](../README.md) › [i18n と $localize の内側](README.md) › 第 12 回 / 全 20 回

# ロケールのデータ：LOCALE\_ID・registerLocaleData・CLDR

> LOCALE\_ID・DEFAULT\_CURRENCY\_CODE などのトークン（tokens.ts）と、それが実行時の i18n に届く setLocaleId（i18n\_locale\_id.ts）。registerLocaleData と findLocaleData（locale\_data\_api.ts）、common/locales のファイルを CLDR から作る generate-locales-tool（plural-function.ts など）。formatDate・formatNumber・I18nPluralPipe がロケールのデータを引く行。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/loc-locale-data)

---

「`LOCALE_ID` を provide すれば日付も数も複数形もそのロケールになる」は、半分だけ正しい説明です。実際には **ロケールが 2 か所にあり**（DI のトークン `LOCALE_ID` と、ICU が読むモジュール変数）、**ロケールのデータが 2 つの置き場にあり**（`registerLocaleData` の表と `globalThis.ng.common.locales`）、データそのものは CLDR からビルドのときに作った配列です。この章では、それぞれがどの行で決まり、誰が読むかを追います。

読む対象は `packages/core/src/i18n/`（`tokens.ts`・`locale_data_api.ts`・`localization.ts`）、`core/src/render3/i18n/i18n_locale_id.ts`、`packages/common/src/i18n/`、`packages/common/locales/generate-locales-tool/` です。

1. [1. 全体像](01-loc-overview.md)
2. [2. 印とメッセージ](02-loc-markup.md)
3. [3. プレースホルダー](03-loc-placeholders.md)
4. [4. メッセージ ID](04-loc-message-id.md)
5. [5. コンパイラの段](05-loc-pipeline-phases.md)
6. [6. $localize の出力](06-loc-const-collection.md)
7. [7. ICU のコンパイル](07-loc-icu-compile.md)
8. [8. 設定と古い抽出](08-loc-compiler-options.md)
9. [9. 実行時（1）解析](09-loc-runtime-start.md)
10. [10. 実行時（2）DOM](10-loc-runtime-dom.md)
11. [11. 実行時（3）ICU](11-loc-runtime-icu.md)
12. **12. ロケールのデータ**（この章）
13. [13. $localize](13-loc-localize-tag.md)
14. [14. 実行時の翻訳](14-loc-runtime-translations.md)
15. [15. 抽出](15-loc-extract-tool.md)
16. [16. 翻訳ファイルを書く](16-loc-serializers.md)
17. [17. 翻訳ファイルを読む](17-loc-translation-parsers.md)
18. [18. 差し込み](18-loc-translate-tool.md)
19. [19. テスト](19-loc-testing.md)
20. [20. issue と PR を読む](20-loc-issues.md)

## 1. LOCALE\_ID の既定値はどこから来るか

📄 `angular/packages/core/src/i18n/tokens.ts` L49–87 （▶ の行: 50–52, 64, 82, 85）

````ts
49 │ /**
50 ▶  * Provide this token to set the locale of your application.
51 ▶  * It is used for i18n extraction, by i18n pipes (DatePipe, I18nPluralPipe, CurrencyPipe,
52 ▶  * DecimalPipe and PercentPipe) and by ICU expressions.
53 │  *
54 │  * See the [i18n guide](guide/i18n/locale-id) for more information.
55 │  *
56 │  * @usageNotes
57 │  * ### Example
58 │  * In standalone apps:
59 │  * ```ts
60 │  * import { LOCALE_ID, ApplicationConfig } from '@angular/core';
61 │  * import { AppModule } from './app/app.module';
62 │  *
63 │  * const appConfig: ApplicationConfig = {
64 ▶  *   providers: [{provide: LOCALE_ID, useValue: 'en-US' }]
65 │  * };
66 │  * ```
67 │  *
68 │  * In module based apps:
69 │  * ```ts
70 │  * import { LOCALE_ID } from '@angular/core';
71 │  * import { platformBrowser } from '@angular/platform-browser';
72 │  * import { AppModule } from './app/app.module';
73 │  *
74 │  * platformBrowser().bootstrapModule(AppModule, {
75 │  *   providers: [{provide: LOCALE_ID, useValue: 'en-US' }]
76 │  * });
77 │  * ```
78 │  *
79 │  * @publicApi
80 │  * @see [Import global variants of the locale data](guide/i18n/import-global-variants)
81 │  */
82 ▶ export const LOCALE_ID: InjectionToken<string> = new InjectionToken(
83 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'LocaleId' : '',
84 │   {
85 ▶     factory: () => inject(LOCALE_ID, {optional: true, skipSelf: true}) || getGlobalLocale(),
86 │   },
87 │ );
````

50〜52 行目の説明のとおり、`LOCALE_ID` を読むのは i18n のパイプ（`DatePipe`・`I18nPluralPipe`・`CurrencyPipe`・`DecimalPipe`・`PercentPipe`）と ICU です。85 行目の `factory` が既定値の決め方で、**まず親のインジェクタ（`skipSelf`）に聞き、無ければ `getGlobalLocale()`** です。64 行目のように providers に書けば、この `factory` は使われません。

📄 `angular/packages/core/src/i18n/tokens.ts` L18–47 （▶ の行: 24, 26–29, 31, 34, 36, 39–41, 43–45）

```ts
18 │ /**
19 │  * Work out the locale from the potential global properties.
20 │  *
21 │  * * Closure Compiler: use `goog.LOCALE`.
22 │  * * Ivy enabled: use `$localize.locale`
23 │  */
24 ▶ export function getGlobalLocale(): string {
25 │   if (
26 ▶     typeof ngI18nClosureMode !== 'undefined' &&
27 ▶     ngI18nClosureMode &&
28 ▶     typeof goog !== 'undefined' &&
29 ▶     goog.LOCALE !== 'en'
30 │   ) {
31 ▶     // * The default `goog.LOCALE` value is `en`, while Angular used `en-US`.
32 │     // * In order to preserve backwards compatibility, we use Angular default value over
33 │     //   Closure Compiler's one.
34 ▶     return goog.LOCALE;
35 │   } else {
36 ▶     // KEEP `typeof $localize !== 'undefined' && $localize.locale` IN SYNC WITH THE LOCALIZE
37 │     // COMPILE-TIME INLINER.
38 │     //
39 ▶     // * During compile time inlining of translations the expression will be replaced
40 ▶     //   with a string literal that is the current locale. Other forms of this expression are not
41 ▶     //   guaranteed to be replaced.
42 │     //
43 ▶     // * During runtime translation evaluation, the developer is required to set `$localize.locale`
44 ▶     //   if required, or just to provide their own `LOCALE_ID` provider.
45 ▶     return (typeof $localize !== 'undefined' && $localize.locale) || DEFAULT_LOCALE_ID;
46 │   }
47 │ }
```

1. **25〜34 行目：Closure Compiler の i18n なら `goog.LOCALE`**

   Google の社内向けの道です。31〜33 行目のとおり、`goog.LOCALE` の既定 `en` のときは Angular の既定を優先します。
2. **45 行目：`$localize.locale`、無ければ `DEFAULT_LOCALE_ID`**

   36〜41 行目のコメントが大事です。**この式の形は、ビルドのときの差し込み（inliner）と合わせてある**ので変えてはいけません。`ng build` の localize は、ロケールごとの出力で `(globalThis.$localize ??= {}).locale = "fr"` の 1 行を polyfills に足します（[cli-i18n](../cli/09-cli-i18n.md)）。実行時に翻訳するときは、43〜44 行目のとおり自分で `$localize.locale` を入れるか、`LOCALE_ID` を provide します（[第 14 回](14-loc-runtime-translations.md)）。

📄 `angular/packages/core/src/i18n/localization.ts` L21–31 （▶ の行: 25, 31）

```ts
21 │ 
22 │ /**
23 │  * The locale id that the application is using by default (for translations and ICU expressions).
24 │  */
25 ▶ export const DEFAULT_LOCALE_ID = 'en-US';
26 │ 
27 │ /**
28 │  * USD currency code that the application uses by default for CurrencyPipe when no
29 │  * DEFAULT_CURRENCY_CODE is provided.
30 │  */
31 ▶ export const USD_CURRENCY_CODE = 'USD';
```

どちらも無ければ 25 行目の `'en-US'`。通貨の既定（次の 2 節の `DEFAULT_CURRENCY_CODE`）は 31 行目の `'USD'` です。

## 2. ほかの 4 つのトークン

📄 `angular/packages/core/src/i18n/tokens.ts` L128–137 （▶ の行: 132, 135）

````ts
128 │  * ```
129 │  *
130 │  * @publicApi
131 │  */
132 ▶ export const DEFAULT_CURRENCY_CODE = new InjectionToken<string>(
133 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'DefaultCurrencyCode' : '',
134 │   {
135 ▶     factory: () => USD_CURRENCY_CODE,
136 │   },
137 │ );
````

📄 `angular/packages/core/src/i18n/tokens.ts` L170–208 （▶ の行: 172–173, 206–207）

````ts
170 │  * @publicApi
171 │  */
172 ▶ export const TRANSLATIONS = new InjectionToken<string>(
173 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'Translations' : '',
174 │ );
175 │ 
176 │ /**
177 │  * Provide this token at bootstrap to set the format of your {@link TRANSLATIONS}: `xtb`,
178 │  * `xlf` or `xlf2`.
179 │  *
180 │  * See the [i18n guide](guide/i18n/merge) for more information.
181 │  *
182 │  * @usageNotes
183 │  * ### Example
184 │  * In standalone apps:
185 │  * ```ts
186 │  * import { LOCALE_ID, ApplicationConfig } from '@angular/core';
187 │  *
188 │  * const appConfig: ApplicationConfig = {
189 │  *   providers: [{provide: TRANSLATIONS_FORMAT, useValue: 'xlf' }]
190 │  * };
191 │  * ```
192 │  *
193 │  * In module based apps: *
194 │  * ```ts
195 │  * import { TRANSLATIONS_FORMAT } from '@angular/core';
196 │  * import { platformBrowser } from '@angular/platform-browser';
197 │  * import { AppModule } from './app/app.module';
198 │  *
199 │  * platformBrowser().bootstrapModule(AppModule, {
200 │  *   providers: [{provide: TRANSLATIONS_FORMAT, useValue: 'xlf' }]
201 │  * });
202 │  * ```
203 │  *
204 │  * @publicApi
205 │  */
206 ▶ export const TRANSLATIONS_FORMAT = new InjectionToken<string>(
207 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'TranslationsFormat' : '',
208 │ );
````

📄 `angular/packages/core/src/i18n/tokens.ts` L210–237 （▶ の行: 211–212, 214, 227, 233–236）

````ts
210 │ /**
211 ▶  * Use this enum at bootstrap as an option of `bootstrapModule` to define the strategy
212 ▶  * that the compiler should use in case of missing translations:
213 │  * - Error: throw if you have missing translations.
214 ▶  * - Warning (default): show a warning in the console and/or shell.
215 │  * - Ignore: do nothing.
216 │  *
217 │  * See the [i18n guide](guide/i18n/merge#report-missing-translations) for more information.
218 │  *
219 │  * @usageNotes
220 │  * ### Example
221 │  * ```ts
222 │  * import { MissingTranslationStrategy } from '@angular/core';
223 │  * import { platformBrowser } from '@angular/platform-browser';
224 │  * import { AppModule } from './app/app.module';
225 │  *
226 │  * platformBrowser().bootstrapModule(AppModule, {
227 ▶  *   missingTranslation: MissingTranslationStrategy.Error
228 │  * });
229 │  * ```
230 │  *
231 │  * @publicApi
232 │  */
233 ▶ export enum MissingTranslationStrategy {
234 ▶   Error = 0,
235 ▶   Warning = 1,
236 ▶   Ignore = 2,
237 │ }
````

- 132〜137 行目 `DEFAULT_CURRENCY_CODE`：`CurrencyPipe` が通貨を省略されたときの既定。**ロケールの通貨とは関係なく**（コメントのとおり）、既定は USD です。fr にしても EUR にはなりません。
- 172〜174 行目 `TRANSLATIONS`・206〜208 行目 `TRANSLATIONS_FORMAT`：`factory` がありません。**v22 の packages/core/src を grep すると、この 2 つを inject している行は 0 件**でした（あるのは core.ts の export だけ）。翻訳ファイルの文字列と形式を受け取る作りは、`@angular/compiler` の i18n\_html\_parser.ts（古い JIT の道。[第 8 回](08-loc-compiler-options.md)）の側に残っています。
- 211〜236 行目 `MissingTranslationStrategy`：227 行目の `bootstrapModule` の `missingTranslation` も、core の中で読む行がありません（grep で `missingTranslation` は 227 行目のコメントだけ）。`@angular/compiler` の側に同じ名前の enum があり、古い JIT と抽出の設定で使います。実行時の翻訳で翻訳が無いときの扱いは `$localize` の側にあります（開いている #54672「実行時の翻訳が i18nMissingTranslation を無視する」。[第 14 回](14-loc-runtime-translations.md)）。

## 3. 起動で ICU のロケールが決まる：setLocaleId

📄 `angular/packages/core/src/platform/bootstrap.ts` L141–147 （▶ の行: 141, 146–147）

```ts
141 ▶       initStatus.runInitializers();
142 │ 
143 │       return initStatus.donePromise
144 │         .then(() => {
145 │           // If the `LOCALE_ID` provider is defined at bootstrap then we set the value for ivy
146 ▶           const localeId = envInjector.get(LOCALE_ID, DEFAULT_LOCALE_ID);
147 ▶           setLocaleId(localeId || DEFAULT_LOCALE_ID);
```

`bootstrapApplication` も `bootstrapModule` も通る `bootstrap.ts` で、141 行目の初期化（`APP_INITIALIZER`。[boot-app-initializer](../boot/09-boot-app-initializer.md)）が終わったあと、146 行目で環境インジェクタから `LOCALE_ID` を 1 回だけ読み、147 行目で `setLocaleId` に渡します（前後は [boot-bootstrap-application](../boot/07-boot-bootstrap-application.md)）。

📄 `angular/packages/core/src/render3/i18n/i18n_locale_id.ts` L9–40 （▶ の行: 14–15, 17, 26, 28–29, 38–39）

```ts
 9 │ import {DEFAULT_LOCALE_ID} from '../../i18n/localization';
10 │ import {assertDefined} from '../../util/assert';
11 │ 
12 │ /**
13 │  * The locale id that the application is currently using (for translations and ICU expressions).
14 ▶  * This is the ivy version of `LOCALE_ID` that was defined as an injection token for the view engine
15 ▶  * but is now defined as a global value.
16 │  */
17 ▶ let LOCALE_ID = DEFAULT_LOCALE_ID;
18 │ 
19 │ /**
20 │  * Sets the locale id that will be used for translations and ICU expressions.
21 │  * This is the ivy version of `LOCALE_ID` that was defined as an injection token for the view engine
22 │  * but is now defined as a global value.
23 │  *
24 │  * @param localeId
25 │  */
26 ▶ export function setLocaleId(localeId: string) {
27 │   ngDevMode && assertDefined(localeId, `Expected localeId to be defined`);
28 ▶   if (typeof localeId === 'string') {
29 ▶     LOCALE_ID = localeId.toLowerCase().replace(/_/g, '-');
30 │   }
31 │ }
32 │ 
33 │ /**
34 │  * Gets the locale id that will be used for translations and ICU expressions.
35 │  * This is the ivy version of `LOCALE_ID` that was defined as an injection token for the view engine
36 │  * but is now defined as a global value.
37 │  */
38 ▶ export function getLocaleId(): string {
39 ▶   return LOCALE_ID;
40 │ }
```

1. **17 行目：モジュール変数**

   14〜15 行目のコメントのとおり、昔はトークンだったものを Ivy ではグローバルな値にしました。**インジェクタごとではなく、JS のモジュールに 1 つ**です。
2. **28〜29 行目：文字列のときだけ、小文字にして `_` を `-` に**

   文字列でなければ何もしません。前の値（既定なら `en-US`）のままです。
3. **38〜39 行目：読むのは 1 か所だけ**

   packages/core/src で `getLocaleId()` を呼んでいるのは、[第 11 回](11-loc-runtime-icu.md) 5 節の `getCaseIndex`（i18n\_apply.ts）だけでした。**つまりこの値は ICU の plural の規則にしか効きません。**パイプは `LOCALE_ID` を inject するので、こちらは読みません。`TestBed` もテストのモジュールを作るときに同じく `setLocaleId` を呼びます（[ngmodule-testbed](../ngmodule/17-ngmodule-testbed.md)）。

> [!WARNING]
> **ハマりどころ**
>
> 開いている #47637「動的な `LOCALE_ID`」には、`LOCALE_ID` に `toLowerCase` を持つオブジェクトを渡す回避策が書かれています。パイプの側は 4 節の `normalizeLocale` が `toLowerCase()` を呼ぶだけなので動きますが、28 行目の `typeof localeId === 'string'` で弾かれるので、**ICU の plural は `en-US` のまま**になります。ロケールの値が「起動のときに 1 回だけ読まれるグローバルな値」と「inject された文字列」の 2 つに分かれていることが、この issue の根です。

## 4. registerLocaleData と findLocaleData

📄 `angular/packages/common/src/i18n/locale_data.ts` L9–22 （▶ の行: 9, 20–21）

```ts
 9 ▶ import {ɵregisterLocaleData} from '@angular/core';
10 │ 
11 │ /**
12 │  * Register global data to be used internally by Angular. See the
13 │  * ["I18n guide"](guide/i18n/format-data-locale) to know how to import additional locale
14 │  * data.
15 │  *
16 │  * The signature registerLocaleData(data: any, extraData?: any) is deprecated since v5.1
17 │  *
18 │  * @publicApi
19 │  */
20 ▶ export function registerLocaleData(data: any, localeId?: string | any, extraData?: any): void {
21 ▶   return ɵregisterLocaleData(data, localeId, extraData);
22 │ }
```

公開 API の `registerLocaleData` は common にありますが、21 行目で core の `ɵregisterLocaleData` を呼ぶだけです。表は core にあります。

📄 `angular/packages/core/src/i18n/locale_data_api.ts` L13–40 （▶ の行: 18, 28–30, 33, 35, 37–38）

```ts
13 │ /**
14 │  * This const is used to store the locale data registered with `registerLocaleData`.
15 │  * Use `Object.create(null)` to prevent prototype pollution.
16 │  */
17 │ // tslint:disable-next-line:no-toplevel-property-access
18 ▶ let LOCALE_DATA: {[localeId: string]: any} = /* @__PURE__ */ Object.create(null);
19 │ 
20 │ /**
21 │  * Register locale data to be used internally by Angular. See the
22 │  * ["I18n guide"](guide/i18n/format-data-locale) to know how to import additional locale
23 │  * data.
24 │  *
25 │  * The signature `registerLocaleData(data: any, extraData?: any)` is deprecated since v5.1
26 │  */
27 │ export function registerLocaleData(data: any, localeId?: string | any, extraData?: any): void {
28 ▶   if (typeof localeId !== 'string') {
29 ▶     extraData = localeId;
30 ▶     localeId = data[LocaleDataIndex.LocaleId];
31 │   }
32 │ 
33 ▶   localeId = localeId.toLowerCase().replace(/_/g, '-');
34 │ 
35 ▶   LOCALE_DATA[localeId] = data;
36 │ 
37 ▶   if (extraData) {
38 ▶     LOCALE_DATA[localeId][LocaleDataIndex.ExtraData] = extraData;
39 │   }
40 │ }
```

- 18 行目：表は `Object.create(null)`。`__proto__` のようなロケール名で、オブジェクトの元の性質を書き換えられないようにしています。
- 28〜31 行目：2 つめの引数が文字列でなければ、古い呼び方（`registerLocaleData(data, extraData)`）とみなし、ID はデータの先頭（`LocaleDataIndex.LocaleId`）から取ります。
- 33 行目：小文字にして `_` を `-` に。35 行目で表に入れ、37〜38 行目で `extra`（曜日の時間帯などの追加のデータ）を 21 番目の欄に足します。

📄 `angular/packages/core/src/i18n/locale_data_api.ts` L42–72 （▶ の行: 50, 52, 58–59, 64–65, 68–70）

```ts
42 │ /**
43 │  * Finds the locale data for a given locale.
44 │  *
45 │  * @param locale The locale code.
46 │  * @returns The locale data.
47 │  * @see [Internationalization (i18n) Guide](guide/i18n)
48 │  */
49 │ export function findLocaleData(locale: string): any {
50 ▶   const normalizedLocale = normalizeLocale(locale);
51 │ 
52 ▶   let match = getLocaleData(normalizedLocale);
53 │   if (match) {
54 │     return match;
55 │   }
56 │ 
57 │   // let's try to find a parent locale
58 ▶   const parentLocale = normalizedLocale.split('-')[0];
59 ▶   match = getLocaleData(parentLocale);
60 │   if (match) {
61 │     return match;
62 │   }
63 │ 
64 ▶   if (parentLocale === 'en') {
65 ▶     return localeEn;
66 │   }
67 │ 
68 ▶   throw new RuntimeError(
69 ▶     RuntimeErrorCode.MISSING_LOCALE_DATA,
70 ▶     ngDevMode && `Missing locale data for the locale "${locale}".`,
71 │   );
72 │ }
```

1. **50〜55 行目：正規化した名前で探す**

   `FR_ca` も `fr-ca` になります。
2. **58〜62 行目：親を探す**

   親は `split('-')[0]`、つまり**言語の部分だけ**です。`zh-Hant-HK` のデータが無ければ、`zh-Hant` ではなく `zh` を探します。CLDR の親の決まり（`zh-Hant-HK` → `zh-Hant`）とは違います。
3. **64〜66 行目：親が `en` なら、core に入っている `locale_en`**

   だから `en-US` や `en-NZ` は何も登録しなくても動きます。
4. **68〜71 行目：どれも無ければ `RuntimeError`**

   メッセージは `ngDevMode` のときだけで、本番ではエラーコード（`MISSING_LOCALE_DATA`）だけです。

📄 `angular/packages/core/src/i18n/locale_data_api.ts` L101–123 （▶ の行: 106–112, 117–118, 120, 122）

```ts
101 │ /**
102 │  * Helper function to get the given `normalizedLocale` from `LOCALE_DATA`
103 │  * or from the global `ng.common.locale`.
104 │  */
105 │ export function getLocaleData(normalizedLocale: string): any {
106 ▶   if (!(normalizedLocale in LOCALE_DATA)) {
107 ▶     const globalLocaleData =
108 ▶       global.ng &&
109 ▶       global.ng.common &&
110 ▶       global.ng.common.locales &&
111 ▶       global.ng.common.locales[normalizedLocale];
112 ▶     // Only cache global locale data when an entry is actually found, to avoid
113 │     // caching missing lookups. In SSR this cache is process-wide across requests,
114 │     // so caching `undefined` would retain attacker-controlled locale identifiers
115 │     // indefinitely. It would also make the `in` check above short-circuit on
116 │     // subsequent lookups and skip the global fallback.
117 ▶     if (globalLocaleData !== undefined) {
118 ▶       LOCALE_DATA[normalizedLocale] = globalLocaleData;
119 │     }
120 ▶     return globalLocaleData;
121 │   }
122 ▶   return LOCALE_DATA[normalizedLocale];
123 │ }
```

表に無ければ 107〜111 行目で `globalThis.ng.common.locales` を見ます。ここに入るのは、6 節の `locales/global/*.js` を `<script>` か import で読み込んだときです。112〜116 行目のコメントは 2026-06 の 98f42eaaaee（「見つからないロケールをキャッシュしない」）で足されたもので、SSR では表がプロセス全体で共有されるので、**攻撃者が送った知らないロケール名を `undefined` のまま覚え続けない**よう、117 行目で見つかったときだけ表に入れます。

📄 `angular/packages/core/src/i18n/locale_data_api.ts` L132–160 （▶ の行: 133–135, 137–138, 152–153, 158–159）

```ts
132 │ /**
133 ▶  * Index of each type of locale data from the locale data array.
134 ▶  * Not an enum: TS enums compile to IIFE side-effects and are not tree-shakable,
135 ▶  * even when unused. Using a plain const object with 'as const' instead.
136 │  */
137 ▶ export const LocaleDataIndex = {
138 ▶   LocaleId: 0,
139 │   DayPeriodsFormat: 1,
140 │   DayPeriodsStandalone: 2,
141 │   DaysFormat: 3,
142 │   DaysStandalone: 4,
143 │   MonthsFormat: 5,
144 │   MonthsStandalone: 6,
145 │   Eras: 7,
146 │   FirstDayOfWeek: 8,
147 │   WeekendRange: 9,
148 │   DateFormat: 10,
149 │   TimeFormat: 11,
150 │   DateTimeFormat: 12,
151 │   NumberSymbols: 13,
152 ▶   NumberFormats: 14,
153 ▶   CurrencyCode: 15,
154 │   CurrencySymbol: 16,
155 │   CurrencyName: 17,
156 │   Currencies: 18,
157 │   Directionality: 19,
158 ▶   PluralCase: 20,
159 ▶   ExtraData: 21,
160 │ } as const;
```

ロケールのデータは**ただの配列**で、何番目が何かはこの表で決まります。133〜135 行目のとおり、TypeScript の `enum` は即時関数になって tree-shaking されないので、`as const` のオブジェクトにしてあります。158 行目の `PluralCase`（20 番目）が、[第 11 回](11-loc-runtime-icu.md)の plural 関数です。

📄 `angular/packages/core/src/i18n/locale_data_api.ts` L88–99 （▶ の行: 96–98）

```ts
88 │ /**
89 │  * Retrieves the plural function used by ICU expressions to determine the plural case to use
90 │  * for a given locale.
91 │  * @param locale A locale code for the locale format rules to use.
92 │  * @returns The plural function for the locale.
93 │  * @see {@link NgPlural}
94 │  * @see [Internationalization (i18n) Guide](guide/i18n)
95 │  */
96 ▶ export function getLocalePluralCase(locale: string): (value: number) => number {
97 ▶   const data = findLocaleData(locale);
98 ▶   return data[LocaleDataIndex.PluralCase];
99 │ }
```

> **🧪 DEMO — ロケールのデータを登録して、findLocaleData で探す**
>
> 「登録して探す」を押すと、チェックしたデータを読み込み（fr と fr-CA は `@angular/common/locales/*` を動的 import して本物の `registerLocaleData`、global/de は `@angular/common/locales/global/de` を import するだけ）、入力したロケール名で本物の `ɵfindLocaleData` を呼びます。「どの段」は、返ってきたデータの先頭の名前を入力と親の名前に比べて書いたものです。数は本物の `formatNumber(1234567.891, ロケール)` です。**登録は取り消せない**ので、このページを開いている間は残ります（[第 11 回](11-loc-runtime-icu.md)のデモで登録した fr・ru・ar・ja も残っています）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/loc-locale-data)

## 5. common の側：パイプと format 関数がデータを引く行

📄 `angular/packages/common/src/i18n/format_number.ts` L274–282 （▶ の行: 274–276）

```ts
274 ▶ export function formatNumber(value: number, locale: string, digitsInfo?: string): string {
275 ▶   const format = getLocaleNumberFormat(locale, NumberFormatStyle.Decimal);
276 ▶   const pattern = parseNumberFormat(format, getLocaleNumberSymbol(locale, NumberSymbol.MinusSign));
277 │   return formatNumberToLocaleString(
278 │     value,
279 │     pattern,
280 │     locale,
281 │     NumberSymbol.Group,
282 │     NumberSymbol.Decimal,
```

📄 `angular/packages/common/src/i18n/locale_data_api.ts` L492–500 （▶ の行: 492–494, 496–497）

```ts
492 ▶ export function getLocaleNumberSymbol(locale: string, symbol: NumberSymbol): string {
493 ▶   const data = ɵfindLocaleData(locale);
494 ▶   const res = data[ɵLocaleDataIndex.NumberSymbols][symbol];
495 │   if (typeof res === 'undefined') {
496 ▶     if (symbol === NumberSymbol.CurrencyDecimal) {
497 ▶       return data[ɵLocaleDataIndex.NumberSymbols][NumberSymbol.Decimal];
498 │     } else if (symbol === NumberSymbol.CurrencyGroup) {
499 │       return data[ɵLocaleDataIndex.NumberSymbols][NumberSymbol.Group];
500 │     }
```

`formatNumber` は 275〜276 行目で書式と記号をロケールのデータから引きます。`getLocaleNumberSymbol` は 493 行目の `ɵfindLocaleData`、494 行目で 13 番目の欄（`NumberSymbols`）の配列を読むだけです。`formatDate` も同じく `getLocaleDateFormat` などを通して `ɵfindLocaleData` に行きます。ロケールの文字列はパイプなら inject した `LOCALE_ID`、関数なら引数です。

📄 `angular/packages/common/src/pipes/i18n_plural_pipe.ts` L33–60 （▶ の行: 37, 57, 59）

```ts
33 │ @Pipe({
34 │   name: 'i18nPlural',
35 │ })
36 │ export class I18nPluralPipe implements PipeTransform {
37 ▶   constructor(private _localization: NgLocalization) {}
38 │ 
39 │   /**
40 │    * @param value the number to be formatted
41 │    * @param pluralMap an object that mimics the ICU format, see
42 │    * https://unicode-org.github.io/icu/userguide/format_parse/messages/.
43 │    * @param locale a `string` defining the locale to use (uses the current {@link LOCALE_ID} by
44 │    * default).
45 │    */
46 │   transform(
47 │     value: number | null | undefined,
48 │     pluralMap: {[count: string]: string},
49 │     locale?: string,
50 │   ): string {
51 │     if (value == null) return '';
52 │ 
53 │     if (typeof pluralMap !== 'object' || pluralMap === null) {
54 │       throw invalidPipeArgumentError(I18nPluralPipe, pluralMap);
55 │     }
56 │ 
57 ▶     const key = getPluralCategory(value, Object.keys(pluralMap), this._localization, locale);
58 │ 
59 ▶     return pluralMap[key].replace(_INTERPOLATION_REGEXP, value.toString());
60 │   }
```

📄 `angular/packages/common/src/i18n/localization.ts` L21–60 （▶ の行: 24, 40, 42, 46, 48, 52, 56）

```ts
21 │ /**
22 │  * @publicApi
23 │  */
24 ▶ @Service({factory: () => new NgLocaleLocalization(inject(LOCALE_ID))})
25 │ export abstract class NgLocalization {
26 │   abstract getPluralCategory(value: number, locale?: string): string;
27 │ }
28 │ 
29 │ /**
30 │  * Returns the plural category for a given value.
31 │  * - "=value" when the case exists,
32 │  * - the plural category otherwise
33 │  */
34 │ export function getPluralCategory(
35 │   value: number,
36 │   cases: string[],
37 │   ngLocalization: NgLocalization,
38 │   locale?: string,
39 │ ): string {
40 ▶   let key = `=${value}`;
41 │ 
42 ▶   if (cases.indexOf(key) > -1) {
43 │     return key;
44 │   }
45 │ 
46 ▶   key = ngLocalization.getPluralCategory(value, locale);
47 │ 
48 ▶   if (cases.indexOf(key) > -1) {
49 │     return key;
50 │   }
51 │ 
52 ▶   if (cases.indexOf('other') > -1) {
53 │     return 'other';
54 │   }
55 │ 
56 ▶   throw new RuntimeError(
57 │     RuntimeErrorCode.NO_PLURAL_MESSAGE_FOUND,
58 │     ngDevMode && `No plural message found for value "${value}"`,
59 │   );
60 │ }
```

📄 `angular/packages/common/src/i18n/localization.ts` L62–91 （▶ の行: 69, 74, 76, 87–88）

```ts
62 │ /**
63 │  * Returns the plural case based on the locale
64 │  *
65 │  * @publicApi
66 │  */
67 │ @Injectable()
68 │ export class NgLocaleLocalization extends NgLocalization {
69 ▶   constructor(@Inject(LOCALE_ID) protected locale: string) {
70 │     super();
71 │   }
72 │ 
73 │   override getPluralCategory(value: number, locale?: string): string {
74 ▶     const plural = getLocalePluralCase(locale || this.locale)(value);
75 │ 
76 ▶     switch (plural) {
77 │       case Plural.Zero:
78 │         return 'zero';
79 │       case Plural.One:
80 │         return 'one';
81 │       case Plural.Two:
82 │         return 'two';
83 │       case Plural.Few:
84 │         return 'few';
85 │       case Plural.Many:
86 │         return 'many';
87 ▶       default:
88 ▶         return 'other';
89 │     }
90 │   }
91 │ }
```

1. **57 行目：`I18nPluralPipe` は `getPluralCategory` へ**

   37 行目の `NgLocalization` は、24 行目の `@Service` の `factory` で `new NgLocaleLocalization(inject(LOCALE_ID))` になります。
2. **40〜44 行目：まず `=値` の case**

   ICU（第 11 回 5 節）と同じく、完全一致が先です。
3. **46 行目と 74 行目：ロケールの plural 関数に*数のまま*渡す**

   ICU の `getPluralCase` は `parseInt` してから渡すので、小数では結果が違います（[第 11 回](11-loc-runtime-icu.md)の注意とデモ）。
4. **52〜59 行目：無ければ `other`、それも無ければ投げる**

   ICU は何も出さない（`null`）のに対し、パイプは `NO_PLURAL_MESSAGE_FOUND` を投げます。

## 6. locales/\*.ts は CLDR から作る：generate-locales-tool

リポジトリの packages/common/locales/ には、ロケールごとのファイルはほとんどありません（チェックインされているのは古い ff-CM.ts などと、Google 社内向けの closure-locale.ts）。`fr.ts` などは bazel のビルドのときにこの道具で作られ、npm の `@angular/common/locales/` に入ります。

📄 `angular/packages/common/locales/generate-locales-tool/bin/write-locale-files-to-dist.ts` L20–44 （▶ の行: 25–26, 31, 33–35, 38–40）

```ts
20 │ /**
21 │  * Generates locale files for each available CLDR locale and writes it to the
22 │  * specified directory.
23 │  */
24 │ async function main() {
25 ▶   const cldrData = new CldrData();
26 ▶   const baseLocaleData = cldrData.getLocaleData(BASE_LOCALE)!;
27 │   const baseCurrencies = generateBaseCurrencies(baseLocaleData);
28 │ 
29 │   // Generate locale files for all locales we have data for.
30 │   await Promise.all(
31 ▶     cldrData.availableLocales.flatMap(async (localeData) => {
32 │       const locale = localeData.locale;
33 ▶       const localeFile = generateLocale(locale, localeData, baseCurrencies);
34 ▶       const localeExtraFile = generateLocaleExtra(locale, localeData);
35 ▶       const localeGlobalFile = generateLocaleGlobalFile(locale, localeData, baseCurrencies);
36 │ 
37 │       return [
38 ▶         fs.promises.writeFile(`${locale}.ts`, localeFile),
39 ▶         fs.promises.writeFile(join('extra', `${locale}.ts`), localeExtraFile),
40 ▶         fs.promises.writeFile(join('global', `${locale}.js`), localeGlobalFile),
41 │       ];
42 │     }),
43 │   );
44 │ }
```

CLDR のデータにあるすべてのロケールについて、38〜40 行目で 3 つのファイルを書きます。`<locale>.ts`（`registerLocaleData` に渡す配列を `export default`）、`extra/<locale>.ts`（追加のデータ）、`global/<locale>.js`（読み込むだけで登録される形）です。

📄 `angular/packages/common/locales/generate-locales-tool/locale-file.ts` L20–60 （▶ の行: 29, 31, 44–46, 51, 54, 58）

```ts
20 │ /** Generate contents for the basic locale data file */
21 │ export function generateLocale(
22 │   locale: string,
23 │   localeData: CldrLocaleData,
24 │   baseCurrencies: BaseCurrencies,
25 │ ) {
26 │   return `${fileHeader}
27 │ const u = undefined;
28 │ 
29 ▶ ${getPluralFunction(localeData)}
30 │ 
31 ▶ export default ${generateBasicLocaleString(locale, localeData, baseCurrencies)};
32 │ `;
33 │ }
34 │ 
35 │ /**
36 │  * Collect up the basic locale data [ localeId, dateTime, number, currency, directionality,
37 │  * pluralCase ].
38 │  */
39 │ export function generateBasicLocaleString(
40 │   locale: string,
41 │   localeData: CldrLocaleData,
42 │   baseCurrencies: BaseCurrencies,
43 │ ) {
44 ▶   let data = stringify([
45 ▶     locale,
46 ▶     ...getDateTimeTranslations(localeData),
47 │     ...getDateTimeSettings(localeData),
48 │     ...getNumberSettings(localeData),
49 │     ...getCurrencySettings(locale, localeData),
50 │     generateLocaleCurrencies(localeData, baseCurrencies),
51 ▶     getDirectionality(localeData),
52 │   ])
53 │     // We remove "undefined" added by spreading arrays when there is no value
54 ▶     .replace(/undefined/g, 'u');
55 │ 
56 │   // adding plural function after, because we don't want it as a string. The function named `plural`
57 │   // is expected to be available in the file. See `generateLocale` above.
58 ▶   data = data.replace(/\]$/, ', plural]');
59 │   return data;
60 │ }
```

44〜52 行目が 4 節の表の順番どおりに並べた配列で、54 行目で `undefined` を `u` に縮め、58 行目で最後に `plural`（関数そのもの。文字列ではない）を足します。29 行目でその関数の本体を同じファイルに書きます。npm に入っている fr.js の先頭はこうなっています。

📄 `node_modules/@angular/common/locales/fr.js（22.1.6。読むだけ。配列は途中を省略）`

```
// THIS CODE IS GENERATED - DO NOT MODIFY.
const u = undefined;
function plural(val) {
    const n = val, i = Math.floor(Math.abs(val)), v = val.toString().replace(/^[^.]*\.?/, '').length, e = parseInt(val.toString().replace(/^[^e]*(e([-+]?\d+))?/, '$2')) || 0;
    if (i === 0 || i === 1)
        return 1;
    if (e === 0 && (!(i === 0) && (i % 1000000 === 0 && v === 0)) || !(e >= 0 && e <= 5))
        return 4;
    return 5;
}
export default ["fr", [["AM", "PM"]], u, [["D", "L", "M", "M", "J", "V", "S"], …], …, "EUR", "€", "euro", {…}, "ltr", plural];
```

📄 `angular/packages/common/locales/generate-locales-tool/plural-function.ts` L13–48 （▶ の行: 14, 28–29, 33, 36–37, 39–40, 42, 47）

```ts
13 │ // Load once to avoid re-parsing CLDR XML data on every invocation.
14 ▶ const cldr = createCldr(
15 │   dirname(
16 │     resolve(process.env['JS_BINARY__RUNFILES']!, process.env['CLDR_XML_DATA_RUNFILES_PATH']!),
17 │   ),
18 │ );
19 │ 
20 │ /**
21 │  * Returns the plural function for a locale.
22 │  */
23 │ export function getPluralFunction(localeData: CldrLocaleData, withTypes = true) {
24 │   // We use the resolved bundle for extracting the plural function. This matches with the
25 │   // lookup logic used by other extractions in the tool (using `cldrjs`), and also ensures
26 │   // we follow the CLDR-specified bundle lookup algorithm. A language does not necessarily
27 │   // resolve directly to a bundle CLDR provides data for.
28 ▶   const bundleName = localeData.attributes.bundle;
29 ▶   let fn = cldr.extractPluralRuleFunction(bundleName, 'cardinal').toString();
30 │ 
31 │   const numberType = withTypes ? ': number' : '';
32 │   fn = fn
33 ▶     .replace(/function anonymous\(val[^)]+\)/g, `function plural(val${numberType})${numberType}`)
34 │     // Since our generated plural functions only take numbers, we can eliminate some of
35 │     // the logic generated by the `cldr` package (to reduce payload size).
36 ▶     .replace(/n\s+=\s+Number\(val\)/, 'n = val')
37 ▶     .replace(/if\s+\(isNaN\(n\)\)\s+throw Error\([^)]+\);/, '');
38 │ 
39 ▶   // The replacement values must match the `Plural` enum from common.
40 ▶   // We do not use the enum directly to avoid depending on that package.
41 │   return fn
42 ▶     .replace(/["']zero["']/, '0')
43 │     .replace(/["']one["']/, '1')
44 │     .replace(/["']two["']/, '2')
45 │     .replace(/["']few["']/, '3')
46 │     .replace(/["']many["']/, '4')
47 ▶     .replace(/["']other["']/, '5');
48 │ }
```

1. **14 行目と 29 行目：npm の `cldr` パッケージに、CLDR の XML から plural の規則を JS の関数にしてもらう**
2. **33〜37 行目：名前を `plural` にし、文字列を受ける部分を削る**

   「数しか受け取らない」前提で、`Number(val)` と `isNaN` の確認を消して小さくします。
3. **42〜47 行目：`'one'` などの文字列を 0〜5 の数に置き換える**

   39〜40 行目のとおり、common の `Plural` の enum と同じ数です。第 11 回 5 節の `pluralMapping` が 0〜4 だけで 5 を `other` にするのは、この数を名前に戻すためです。

📄 `angular/packages/common/locales/generate-locales-tool/locale-global-file.ts` L16–37 （▶ の行: 26, 28–29, 31, 33–35）

```ts
16 │ /**
17 │  * Generated the contents for the global locale file
18 │  */
19 │ export function generateLocaleGlobalFile(
20 │   locale: string,
21 │   localeData: CldrLocaleData,
22 │   baseCurrencies: BaseCurrencies,
23 │ ) {
24 │   const basicLocaleData = generateBasicLocaleString(locale, localeData, baseCurrencies);
25 │   const extraLocaleData = generateLocaleExtraDataArrayCode(locale, localeData);
26 ▶   const data = basicLocaleData.replace(/\]$/, `, ${extraLocaleData}]`);
27 │   return `${fileHeader}
28 ▶   (function(global) {
29 ▶     global.ng ??= {};
30 │     global.ng.common ??= {};
31 ▶     global.ng.common.locales ??= {};
32 │     const u = undefined;
33 ▶     ${getPluralFunction(localeData, false)}
34 ▶     global.ng.common.locales['${normalizeLocale(locale)}'] = ${data};
35 ▶   })(globalThis);
36 │     `;
37 │ }
```

global の形は、28〜35 行目のとおり即時関数で `globalThis.ng.common.locales['fr'] = […]` を書くだけです。4 節の `getLocaleData` の 107〜111 行目がここを読みます。`registerLocaleData` を呼ぶコードが要らないので、ロケールのファイルを `<script>` で読み込むだけで使えます。

> [!NOTE]
> **ポイント**
>
> 開いている #63591「グローバルのロケールデータを遅延読み込みできない」は、`import('@angular/common/locales/global/pt')` が TypeScript のエラーになるという報告です。npm の package.json の `exports` は `./locales/global/*` に `default` しか無く（`./locales/*` には `types` がある）、global/ には .d.ts がありません（このページの node\_modules で確かめました）。上のデモの `import('@angular/common/locales/global/de')` も、このサイトのビルドで実際に `TS7016: Could not find a declaration file for module '@angular/common/locales/global/de'` になりました（`strict` を有効にしていないこのサイトでも）。そこでデモでは、その 1 行に `// @ts-expect-error` を付けています。issue のコメントの回避策は、`declare module '@angular/common/locales/global/pt';` の .d.ts を自分で置くことです。

### sr-Latn の plural が「いつも other」になる（#63378）

📄 `angular/packages/common/locales/closure-locale.ts` L1190–1194 （▶ の行: 1190, 1193）

```ts
1190 ▶ function plural_locale_sr_Latn(val: number): number {
1191 │ const n = val;
1192 │ 
1193 ▶ return 5;
1194 │ }
```

📄 `angular/packages/common/locales/closure-locale.ts` L1266–1274 （▶ の行: 1266, 1269–1273）

```ts
1266 ▶ function plural_locale_sr(val: number): number {
1267 │ const n = val, i = Math.floor(Math.abs(val)), v = val.toString().replace(/^[^.]*\.?/, '').length, f = parseInt(val.toString().replace(/^[^.]*\.?/, ''), 10) || 0;
1268 │ 
1269 ▶ if (v === 0 && (i % 10 === 1 && !(i % 100 === 11)) || f % 10 === 1 && !(f % 100 === 11))
1270 ▶     return 1;
1271 ▶ if (v === 0 && (i % 10 === Math.floor(i % 10) && (i % 10 >= 2 && i % 10 <= 4) && !(i % 100 >= 12 && i % 100 <= 14)) || f % 10 === Math.floor(f % 10) && (f % 10 >= 2 && f % 10 <= 4) && !(f % 100 >= 12 && f % 100 <= 14))
1272 ▶     return 3;
1273 ▶ return 5;
1274 │ }
```

closure-locale.ts は同じ道具が作ってチェックインしているファイルで、npm の sr-Latn.js の plural も同じく 1193 行目の `return 5` だけです（このページの node\_modules で確かめました）。sr（キリル文字）は 1269〜1273 行目の規則を持つのに、ラテン文字の sr-Latn は持ちません。issue のコメントでは、原因を上の 29 行目の `cldr` パッケージ（papandreou/node-cldr の issue 183）にあると調べ、ラベルは「state: blocked on upstream」です。[第 11 回](11-loc-runtime-icu.md)のデモに sr-Latn は入れていませんが、`Intl.PluralRules('sr-Latn').select(1)` は `one` を返します。

## 7. Intl との関係（#54470）

common の `getLocale…` の関数の多くは `@deprecated 18.0` になっていて、たとえば `getLocalePluralCase` は 619〜620 行目で「`Intl.PluralRules` を使う」と書き、622〜623 行目で core の関数をそのまま公開しているだけです。

📄 `angular/packages/common/src/i18n/locale_data_api.ts` L615–623 （▶ の行: 618–620, 622–623）

```ts
615 │ /**
616 │  * @publicApi
617 │  *
618 ▶  * @deprecated 18.0
619 ▶  * Angular recommends relying on the `Intl` API for i18n.
620 ▶  * Use `Intl.PluralRules` instead
621 │  */
622 ▶ export const getLocalePluralCase: (locale: string) => (value: number) => Plural =
623 ▶   ɵgetLocalePluralCase;
```

開いている #54470「Angular の i18n で `Intl` を使う」は、ロケールのファイルをやめて `Intl` に寄せる提案で、実装の PR #55283 は 2026-04-17 に閉じられました（マージされていない）。v22 の時点では、この章で読んだ CLDR から作った配列が、パイプと ICU の両方で使われています。

## 8. ここまでを 1 本に

- 👤 `providers: [{provide: LOCALE_ID, useValue: 'fr'}]` ／ `registerLocaleData(localeFr)` — あなたのアプリ
  - `LOCALE_ID の factory → getGlobalLocale()` — tokens.ts L85・L24 — *provide しなければ $localize.locale か en-US*
  - `ɵregisterLocaleData` — core locale\_data\_api.ts L27 — *正規化した名前で表に入れる*
- `bootstrap → runInitializers → envInjector.get(LOCALE_ID)` — platform/bootstrap.ts L141-146
  - `setLocaleId` — i18n\_locale\_id.ts L26 — *ICU が読むグローバルな値*
- `{count, plural, …} の更新 → getCaseIndex → getPluralCase(値, getLocaleId())` — i18n\_apply.ts・localization.ts — *第 11 回*
- `i18nPlural・date・number パイプ` — common — *inject した LOCALE\_ID*
  - `ɵfindLocaleData(locale)` — core locale\_data\_api.ts L49 — *そのまま → 親（言語だけ）→ en → 投げる*
    - `getLocaleData` — core locale\_data\_api.ts L105 — *表 → globalThis.ng.common.locales*
  - `data[LocaleDataIndex.…]` — core locale\_data\_api.ts L137 — *配列の欄を読む*
- `locales/fr.ts・extra/fr.ts・global/fr.js` — generate-locales-tool（ビルドのとき） — *CLDR → cldr パッケージ → 配列と plural 関数*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット | 件数 |
| --- | --- | --- | --- |
| core/test/i18n/locale\_data\_api\_spec.ts | `locale data api`（17 行目）&gt; `findLocaleData`（54）・`getLocaleCurrencyCode()`（107） | `//packages/core/test:test`（shard 4） | 12（3 × 4） |
| common/test/i18n/localization\_spec.ts | `l10n`（17）&gt; `NgLocalization`（27）・`NgLocaleLocalization`（77）・`getPluralCategory`（156） | `//packages/common/test:test` | 26（3 つの spec の合計） |
| common/test/pipes/i18n\_plural\_pipe\_spec.ts・i18n\_select\_pipe\_spec.ts | `I18nPluralPipe`（13）・`I18nSelectPipe` |   |   |

📄 `angular/packages/core/test/i18n/locale_data_api_spec.ts` L54–71 （▶ の行: 56, 62, 66, 70）

```ts
54 │   describe('findLocaleData', () => {
55 │     it('should throw if the LOCALE_DATA for the chosen locale or its parent locale is not available', () => {
56 ▶       expect(() => findLocaleData('pt-AO')).toThrowError(
57 │         /Missing locale data for the locale "pt-AO"/,
58 │       );
59 │     });
60 │ 
61 │     it('should return english data if the locale is en-US', () => {
62 ▶       expect(findLocaleData('en-US')).toEqual(localeEn);
63 │     });
64 │ 
65 │     it('should return the exact LOCALE_DATA if it is available', () => {
66 ▶       expect(findLocaleData('fr-CA')).toEqual(localeFrCA);
67 │     });
68 │ 
69 │     it('should return the parent LOCALE_DATA if it exists and exact locale is not available', () => {
70 ▶       expect(findLocaleData('fr-BE')).toEqual(localeFr);
71 │     });
```

📄 `angular/packages/core/test/i18n/locale_data_api_spec.ts` L84–104 （▶ の行: 85, 88, 91, 93, 95, 99, 103）

```ts
 84 │     it('should find the exact LOCALE_DATA if the locale is on the global object', () => {
 85 ▶       expect(findLocaleData('de-CH')).toEqual(localeDeCH);
 86 │     });
 87 │ 
 88 ▶     it('should not cache missing global locale data lookups', () => {
 89 │       const localeEnNZ: any[] = ['en-NZ'];
 90 │ 
 91 ▶       expect(findLocaleData('en-NZ')).toEqual(localeEn);
 92 │ 
 93 ▶       global.ng.common.locales['en-nz'] = localeEnNZ;
 94 │ 
 95 ▶       expect(findLocaleData('en-NZ')).toBe(localeEnNZ);
 96 │     });
 97 │ 
 98 │     it('should find the parent LOCALE_DATA if the exact locale is not available and the parent locale is on the global object', () => {
 99 ▶       expect(findLocaleData('de-BE')).toEqual(localeDe);
100 │     });
101 │ 
102 │     it('should find the registered LOCALE_DATA even if the same locale is on the global object', () => {
103 ▶       expect(findLocaleData('fr')).not.toBe(fakeGlobalFr);
104 │     });
```

4 節の 3 つの段（そのまま・親・en）と、getLocaleData の global の道を、この 2 つの範囲で確かめています。88〜96 行目が 98f42eaaaee で足された it で、1 回目に en に落ちたあとで global に en-nz を置くと、2 回目は 95 行目でそれが返る（`undefined` を覚えていない）ことを見ます。

📄 `angular/packages/common/test/i18n/localization_spec.ts` L98–113 （▶ の行: 99, 101, 103–104, 107）

```ts
 98 │     it('should return the correct values for the "sr" locale', () => {
 99 ▶       const l10n = new NgLocaleLocalization('sr');
100 │ 
101 ▶       expect(l10n.getPluralCategory(1)).toEqual('one');
102 │       expect(l10n.getPluralCategory(31)).toEqual('one');
103 ▶       expect(l10n.getPluralCategory(0.1)).toEqual('one');
104 ▶       expect(l10n.getPluralCategory(1.1)).toEqual('one');
105 │       expect(l10n.getPluralCategory(2.1)).toEqual('one');
106 │ 
107 ▶       expect(l10n.getPluralCategory(3)).toEqual('few');
108 │       expect(l10n.getPluralCategory(33)).toEqual('few');
109 │       expect(l10n.getPluralCategory(0.2)).toEqual('few');
110 │       expect(l10n.getPluralCategory(0.3)).toEqual('few');
111 │       expect(l10n.getPluralCategory(0.4)).toEqual('few');
112 │       expect(l10n.getPluralCategory(2.2)).toEqual('few');
113 │ 
```

common の spec は bazel が作った `../../locales/sr` を読み、`NgLocaleLocalization` で plural を確かめます。103〜104 行目のように**小数も数のまま**渡しています（ICU の道とは違う）。sr-Latn の it はありません。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all '--test_arg=--filter=locale data api'
pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all '--test_arg=--filter=l10n|I18nPluralPipe|I18nSelectPipe'
```

📄 `出力（2026-11-03 に実行。抜粋。ログは scratchpad/i18n-logs/c-core-locale.log・c-common-l10n.log）`

```
# core（locale data api）。shard 4 つ
Ran 3 of 1392 specs
3 specs, 0 failures
Ran 3 of 1392 specs
3 specs, 0 failures
Ran 3 of 1392 specs
3 specs, 0 failures
Ran 3 of 1392 specs
3 specs, 0 failures
//packages/core/test:test                                                PASSED in 1.5s
# common（l10n|I18nPluralPipe|I18nSelectPipe）
Ran 26 of 667 specs
26 specs, 0 failures
//packages/common/test:test                                              PASSED in 1.1s
```

- `//packages/core/test:test` は shard が 4 つあり、どれも「Ran 3 of 1392 specs」で合計 12 本（1.5 秒）。spec の it の数と一致します。
- `//packages/common/test:test` は `l10n|I18nPluralPipe|I18nSelectPipe`（正規表現の「または」）で 26 of 667（1.1 秒）。

### 直すとしたら

- sr-Latn（#63378）：Angular の側で直すなら `generate-locales-tool/plural-function.ts` の 28〜29 行目（どの bundle の規則を取るか）ですが、issue はアップストリームの修正待ちです。確かめる it は common の localization\_spec.ts に、98 行目の形で `'sr-Latn'` を足します（今は落ちるはず、を手元で確かめる）。
- 親のロケールの探し方：`core/src/i18n/locale_data_api.ts` の 58 行目。it は core の locale\_data\_api\_spec.ts の 69〜71 行目の形です。CLDR の parentLocales を持つにはデータが要るので、6 節の道具に手を入れることになります。
- global/ の型（#63591）：.d.ts を出すなら packages/common/locales/BUILD.bazel の `npm_package` の `srcs`（今は `global/%s.js` だけ）と package.json の `exports` の両方です。
- どれも本家に PR を出すことは勧めません。issue を読むとき（[第 20 回](20-loc-issues.md)）の手がかりにします。

## 聞かれそうな質問

**Q. コンポーネントの providers で `LOCALE_ID` を変えると、その中の ICU の複数形も変わりますか？**

変わりません。ICU が読むのは i18n\_locale\_id.ts の 17 行目のモジュール変数で、それを書くのは起動のときの bootstrap.ts 147 行目（と TestBed）だけです。その中の `DatePipe` や `I18nPluralPipe` は inject した `LOCALE_ID` を使うので、パイプだけが変わります。

**Q. `registerLocaleData` を忘れると、どうなりますか？**

パイプや `formatDate` が `findLocaleData` を呼んだときに 68〜71 行目で `RuntimeError` になります。ただし `en` の仲間（`en-GB` など）は 64〜65 行目で `locale_en` に落ちるので、エラーにならず英語（US）の書式で出ます。ICU の plural も、`=0` のような完全一致の case に当たらなかったときは同じ `findLocaleData` を通るので、`LOCALE_ID` が fr でデータが無ければ ICU の更新で投げます。

**Q. `fr-CA` だけ登録したら、`fr` でも使えますか？**

使えません。親への fallback は「子のデータが無いとき、親を探す」方向だけです（58〜62 行目）。`fr-CA` を探せば `fr-CA`、`fr` を探せば `fr` を探して、無ければ投げます。デモで `fr` のチェックを外して試せます（ただし一度登録したものは残ります）。

**Q. ロケールのデータはどこから来ていて、誰が作っていますか？**

CLDR です。generate-locales-tool が bazel のビルドのときに npm の `cldr` パッケージで XML を読み、38〜40 行目でロケールごとに 3 つのファイルを書きます。plural の規則も 29 行目でそのパッケージに JS の関数にしてもらい、42〜47 行目で数に置き換えたものです。

**Q. `TRANSLATIONS` トークンに翻訳ファイルを渡せば、実行時に翻訳されますか？**

されません。core の中でこのトークンを inject する行はありません。実行時に翻訳するなら `@angular/localize` の `loadTranslations` を起動の前に呼びます（[第 14 回](14-loc-runtime-translations.md)、[第 10 回](10-loc-runtime-dom.md)のデモ）。

## 読み終えて

- `LOCALE_ID` の既定は「親のインジェクタ → `$localize.locale` → `en-US`」。ビルドの localize は `$localize.locale` を書き、この既定を通してアプリに届きます。
- ICU の plural だけは、起動のときに `setLocaleId` で入るモジュール変数を読みます。パイプは inject した `LOCALE_ID` です。
- ロケールのデータは「表（`registerLocaleData`）→ `globalThis.ng.common.locales`」の順に探され、無ければ言語だけの親、`en` なら core の `locale_en`、それも無ければ投げます。
- データは CLDR から generate-locales-tool がビルドのときに作る配列で、plural の規則は `cldr` パッケージが作った関数です。sr-Latn（#63378）のようなデータの誤りは、この道具の上流に原因があることがあります。

---

← 前: [実行時（3）：ICU の切り替え](11-loc-runtime-icu.md)  
次: [$localize のタグ関数と @angular/localize/init](13-loc-localize-tag.md) →
