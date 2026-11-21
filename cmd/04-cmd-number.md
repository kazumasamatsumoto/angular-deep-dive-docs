[目次](../README.md) › [common の説明文の読み残し](README.md) › 第 4 回 / 全 9 回

# 数と i18n の pipe の説明文：DecimalPipe・PercentPipe・CurrencyPipe・I18nPluralPipe・I18nSelectPipe

> pipes/number\_pipe.ts・i18n/format\_number.ts・currencies.ts・pipes/i18n\_plural\_pipe.ts・i18n\_select\_pipe.ts と、説明文が引く packages/examples の例：例のテンプレートを本物で描いてコメントの output と並べる（fr の通貨は CA$ ではなく $CA）、digitsInfo の形と丸め、currency の display と桁、複数形の選び方と mapping の null。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-number)

---

`DecimalPipe`・`PercentPipe`・`CurrencyPipe`・`I18nPluralPipe`・`I18nSelectPipe` の説明文は、例を `{@example}` で `packages/examples/common/pipes/ts/` から引き、例の中のコメントに「output」を書いています。この章は、その例のテンプレートをそのまま本物の pipe（このサイトの `@angular/common` 22.2.6）で描き、コメントの output と並べます。あわせて、説明文が書く `digitsInfo` の既定、通貨の `display` の値、丸めを関数で通します。

読む対象は `packages/common/src/pipes/number_pipe.ts`・`i18n_plural_pipe.ts`・`i18n_select_pipe.ts`、`packages/common/src/i18n/format_number.ts`・`currencies.ts` と、例の `packages/examples/common/pipes/ts/`（../angular、8576f161ae4）です。3 つの数の pipe の入口・`parseNumberFormat`・丸めの計算は[数の書式の章](../cmn/12-cmn-format-number.md)、`LOCALE_ID` と `registerLocaleData`・`NgLocalization` は[ロケールのデータの章](../loc/12-loc-locale-data.md)、`I18nSelectPipe` の `transform` は[小さな pipe の章](../cmn/07-cmn-simple-pipes.md)にあります。

1. [1. NgOptimizedImage](01-cmd-image.md)
2. [2. 画像のローダー](02-cmd-image-loaders.md)
3. [3. 日付の書式](03-cmd-date.md)
4. **4. 数と i18n の pipe**（この章）
5. [5. 構造ディレクティブ](05-cmd-structural.md)
6. [6. NgClass・NgStyle と outlet](06-cmd-attr-outlets.md)
7. [7. AsyncPipe と小さな pipe](07-cmd-pipes.md)
8. [8. Location](08-cmd-location.md)
9. [9. spec と issue](09-cmd-tests-issues.md)

## 1. 説明文が引く例

📄 `angular/packages/common/src/pipes/number_pipe.ts` L66–88 （▶ の行: 69–71, 73, 79–81, 83）

```ts
66 │  *
67 │  * ### locale
68 │  *
69 ▶  * `locale` will format a value according to locale rules.
70 ▶  * Locale determines group sizing and separator,
71 ▶  * decimal point character, and other locale-specific configurations.
72 │  *
73 ▶  * When not supplied, uses the value of `LOCALE_ID`, which is `en-US` by default.
74 │  *
75 │  * See [Setting your app locale](guide/i18n/locale-id).
76 │  *
77 │  * ### Example
78 │  *
79 ▶  * The following code shows how the pipe transforms values
80 ▶  * according to various format specifications,
81 ▶  * where the caller's default locale is `en-US`.
82 │  *
83 ▶  * {@example common/pipes/ts/number_pipe.ts region='NumberPipe'}
84 │  *
85 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
86 │  *
87 │  * @publicApi
88 │  */
```

83 行目の `{@example common/pipes/ts/number_pipe.ts region='NumberPipe'}` が、angular.dev では下の examples のファイルの `#docregion NumberPipe` の中身に置き換わります。79〜81 行目は「呼び出し側の既定のロケールは en-US」と前置きします。PercentPipe（143 行目）、CurrencyPipe（211 行目）、I18nPluralPipe・I18nSelectPipe（27・26 行目）も同じ形です。

📄 `angular/packages/examples/common/pipes/ts/number_pipe.ts` L16–43 （▶ の行: 23–24, 29–30, 35–36）

```ts
16 │ // #docregion NumberPipe
17 │ @Component({
18 │   selector: 'number-pipe',
19 │   imports: [DecimalPipe],
20 │   template: `<div>
21 │     <p>
22 │       No specified formatting:
23 ▶       {{ pi | number }}
24 ▶       <!--output: '3.142'-->
25 │     </p>
26 │ 
27 │     <p>
28 │       With digitsInfo parameter specified:
29 ▶       {{ pi | number: '4.1-5' }}
30 ▶       <!--output: '0,003.14159'-->
31 │     </p>
32 │ 
33 │     <p>
34 │       With digitsInfo and locale parameters specified:
35 ▶       {{ pi | number: '4.1-5' : 'fr' }}
36 ▶       <!--output: '0 003,14159'-->
37 │     </p>
38 │   </div>`,
39 │ })
40 │ export class NumberPipeComponent {
41 │   pi: number = 3.14159265359;
42 │ }
43 │ // #enddocregion
```

📄 `angular/packages/examples/common/pipes/ts/percent_pipe.ts` L14–36 （▶ の行: 15, 22–23, 25–26, 28–29）

```ts
14 │ // registering french data
15 ▶ registerLocaleData(localeFr);
16 │ 
17 │ // #docregion PercentPipe
18 │ @Component({
19 │   selector: 'percent-pipe',
20 │   imports: [PercentPipe],
21 │   template: `<div>
22 ▶     <!--output '26%'-->
23 ▶     <p>A: {{ a | percent }}</p>
24 │ 
25 ▶     <!--output '0,134.950%'-->
26 ▶     <p>B: {{ b | percent: '4.3-5' }}</p>
27 │ 
28 ▶     <!--output '0 134,950 %'-->
29 ▶     <p>B: {{ b | percent: '4.3-5' : 'fr' }}</p>
30 │   </div>`,
31 │ })
32 │ export class PercentPipeComponent {
33 │   a: number = 0.259;
34 │   b: number = 1.3495;
35 │ }
36 │ // #enddocregion
```

📄 `angular/packages/examples/common/pipes/ts/currency_pipe.ts` L14–48 （▶ の行: 22, 25, 28, 31, 34, 37–38, 40–41）

```ts
14 │ // registering french data
15 │ registerLocaleData(localeFr);
16 │ 
17 │ // #docregion CurrencyPipe
18 │ @Component({
19 │   selector: 'currency-pipe',
20 │   imports: [CurrencyPipe],
21 │   template: `<div>
22 ▶     <!--output '$0.26'-->
23 │     <p>A: {{ a | currency }}</p>
24 │ 
25 ▶     <!--output 'CA$0.26'-->
26 │     <p>A: {{ a | currency: 'CAD' }}</p>
27 │ 
28 ▶     <!--output 'CAD0.26'-->
29 │     <p>A: {{ a | currency: 'CAD' : 'code' }}</p>
30 │ 
31 ▶     <!--output 'CA$0,001.35'-->
32 │     <p>B: {{ b | currency: 'CAD' : 'symbol' : '4.2-2' }}</p>
33 │ 
34 ▶     <!--output '$0,001.35'-->
35 │     <p>B: {{ b | currency: 'CAD' : 'symbol-narrow' : '4.2-2' }}</p>
36 │ 
37 ▶     <!--output '0 001,35 CA$'-->
38 ▶     <p>B: {{ b | currency: 'CAD' : 'symbol' : '4.2-2' : 'fr' }}</p>
39 │ 
40 ▶     <!--output 'CLP1' because CLP has no cents-->
41 ▶     <p>B: {{ b | currency: 'CLP' }}</p>
42 │   </div>`,
43 │ })
44 │ export class CurrencyPipeComponent {
45 │   a: number = 0.259;
46 │   b: number = 1.3495;
47 │ }
48 │ // #enddocregion
```

📄 `angular/packages/examples/common/pipes/ts/i18n_pipe.ts` L12–38 （▶ の行: 16, 20–23, 32, 36）

```ts
12 │ // #docregion I18nPluralPipeComponent
13 │ @Component({
14 │   selector: 'i18n-plural-pipe',
15 │   imports: [I18nPluralPipe],
16 ▶   template: `<div>{{ messages.length | i18nPlural: messageMapping }}</div>`,
17 │ })
18 │ export class I18nPluralPipeComponent {
19 │   messages: any[] = ['Message 1'];
20 ▶   messageMapping: {[k: string]: string} = {
21 ▶     '=0': 'No messages.',
22 ▶     '=1': 'One message.',
23 ▶     'other': '# messages.',
24 │   };
25 │ }
26 │ // #enddocregion
27 │ 
28 │ // #docregion I18nSelectPipeComponent
29 │ @Component({
30 │   selector: 'i18n-select-pipe',
31 │   imports: [I18nSelectPipe],
32 ▶   template: `<div>{{ gender | i18nSelect: inviteMap }}</div>`,
33 │ })
34 │ export class I18nSelectPipeComponent {
35 │   gender: string = 'male';
36 ▶   inviteMap: any = {'male': 'Invite him.', 'female': 'Invite her.', 'other': 'Invite them.'};
37 │ }
38 │ //#enddocregion
```

この 4 つのファイルは、strict と strictTemplates の ngc にそのまま通ります（テストと直し方の節）。fr のデータは、number\_pipe.ts は `registerLocaleData(localeFr, 'fr')`、percent・currency は 15 行目の `registerLocaleData(localeFr)` で入れます。2 つめの引数を省くと、データの先頭の `'fr'` が名前になるので同じです。

> **🧪 DEMO — 例のテンプレートを本物の pipe で描く**
>
> 下は、4 つの例のテンプレートの `<p>` を、この章の中の 1 つのコンポーネントにそのまま写したものです（値も例と同じ `pi = 3.14159265359`・`a = 0.259`・`b = 1.3495`）。fr のデータは例と同じく `registerLocaleData(localeFr, 'fr')` で入れています。  
> ただし pipe の引数が 2 つ以上の 6 行（number\_pipe.ts の 35 行目、percent\_pipe.ts の 29 行目、currency\_pipe.ts の 29・32・35・38 行目）は、同じ引数で pipe の `transform` を呼んだ値を出しています。引数が 2・3・4 つの pipe はテンプレートで `ɵɵpipeBind3`・`ɵɵpipeBind4`・`ɵɵpipeBindV` にコンパイルされ、このサイトのほかの章のテンプレートはどれも使っていないので、core のその関数が初期の JS（どのページでも最初に読む分）に入って 0.75 kB 増えたためです（本番ビルドで測りました）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-number)

並べると、通貨の fr の行（currency\_pipe.ts の 37〜38 行目）だけが文字が違います。コメントは `'0 001,35 CA$'`、出力は `0 001,35 $CA` です。fr のデータでは CAD の記号が `$CA` で、examples に同梱の locale-fr.ts の中でも CAD は `'$CA'` です。このコメントは例を足した 60935b29fc1（2017-08、#18935）から変わっていません（`git log -L37,38`、後は prettier の 2024-01 の整形だけ）。fr の行は、ほかに空白の種類も違います。桁の区切りは U+202F、`%` と `$CA` の前は U+00A0 で、コメントは普通の空白です。

📄 `angular/packages/examples/common/pipes/ts/e2e_test/pipe_spec.ts` L82–118 （▶ の行: 86, 88, 91, 100–102, 113–116）

```ts
 82 │   describe('number', () => {
 83 │     it('should work properly', async () => {
 84 │       await loadPage();
 85 │       const examples = await driver.findElements(webdriver.By.css('number-pipe p'));
 86 ▶       expect(await examples[0].getText()).toEqual('No specified formatting: 3.142');
 87 │       expect(await examples[1].getText()).toEqual(
 88 ▶         'With digitsInfo parameter specified: 0,003.14159',
 89 │       );
 90 │       expect(await examples[2].getText()).toEqual(
 91 ▶         'With digitsInfo and locale parameters specified: 0\u202f003,14159',
 92 │       );
 93 │     });
 94 │   });
 95 │ 
 96 │   describe('percent', () => {
 97 │     it('should work properly', async () => {
 98 │       await loadPage();
 99 │       const examples = await driver.findElements(webdriver.By.css('percent-pipe p'));
100 ▶       expect(await examples[0].getText()).toEqual('A: 26%');
101 ▶       expect(await examples[1].getText()).toEqual('B: 0,134.950%');
102 ▶       expect(await examples[2].getText()).toEqual('B: 0\u202f134,950 %');
103 │     });
104 │   });
105 │ 
106 │   describe('currency', () => {
107 │     it('should work properly', async () => {
108 │       await loadPage();
109 │       const examples = await driver.findElements(webdriver.By.css('currency-pipe p'));
110 │       expect(await examples[0].getText()).toEqual('A: $0.26');
111 │       expect(await examples[1].getText()).toEqual('A: CA$0.26');
112 │       expect(await examples[2].getText()).toEqual('A: CAD0.26');
113 ▶       expect(await examples[3].getText()).toEqual('B: CA$0,001.35');
114 ▶       expect(await examples[4].getText()).toEqual('B: $0,001.35');
115 ▶       expect(await examples[5].getText()).toEqual('B: 0\u202f001,35 $CA');
116 ▶       expect(await examples[6].getText()).toEqual('B: CLP1');
117 │     });
118 │   });
```

examples には WebDriver の e2e があり、115 行目は `'B: 0\u202f001,35 $CA'`、つまり本当の出力を期待しています。91・102 行目も桁の区切りを `\u202f` で書き、U+00A0 の所（102 行目の `%` の前、115 行目の `$CA` の前）は普通の空白で書いています。WebDriver の `getText()` が U+00A0 を空白にして返し、U+202F は残すからです。e2e は正しく、angular.dev に載るコメントだけが古いまま、という形です。

## 2. digitsInfo と丸め

`digitsInfo` の書式（`{minIntegerDigits}.{minFractionDigits}-{maxFractionDigits}`）と丸めの例（`3.6` と `-3.6`）は[数の書式の章](../cmn/12-cmn-format-number.md)で引いた行です。ここでは説明文の約束を、表の値で確かめます（DEMO の表の「丸め」「digitsInfo の形」）。

1. **丸めは 10 進の桁の上で、5 は 0 から遠い方へ**

   2.5 は 3、-2.5 は -3、0.125 を 2 桁にすると 0.13。数を文字列にしてから桁の配列で丸める（数の書式の章の 6・7 節）ので、`(1.005).toFixed(2)` が `'1.00'` になるのと違い、`1.005 | number:'1.0-2'` は `1.01` です。説明文の「to-nearest」は、同点のときの向きを書いていません。
2. **書式の欠け**

   `'.2'` は最小の整数の桁を既定のまま、小数を 2 桁にして `1.00`。`'1.'` も通ります。`'3'`（`.` が無い）と `'1.3-1'`（min が max より大きい）は例外です。`'1.4'` は max を書かないので、既定の 3 より大きい 4 に揃えます。
3. **上限**

   どの欄も 100 を超えると例外です（`'101.0-0'`。DoS を防ぐ 2026 年の修正、数の書式の章）。
4. **文字列の value**

   `'1234.5'`・`' 12 '`・`'1e3'` に加え、`'0x10'` も `Number()` が読むので 16 になります。`'12abc'` は例外です（`strToNumber`、数の書式の章の 3 節）。

## 3. PercentPipe と CurrencyPipe の説明文

📄 `angular/packages/common/src/pipes/number_pipe.ts` L126–148 （▶ の行: 131–133, 143）

```ts
126 │ 
127 │ /**
128 │  * @ngModule CommonModule
129 │  * @description
130 │  *
131 ▶  * Transforms a number to a percentage
132 ▶  * string, formatted according to locale rules that determine group sizing and
133 ▶  * separator, decimal-point character, and other locale-specific
134 │  * configurations.
135 │  *
136 │  * @see {@link formatPercent}
137 │  *
138 │  * @usageNotes
139 │  * The following code shows how the pipe transforms numbers
140 │  * into text strings, according to various format specifications,
141 │  * where the caller's default locale is `en-US`.
142 │  *
143 ▶  * {@example common/pipes/ts/percent_pipe.ts region='PercentPipe'}
144 │  *
145 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
146 │  *
147 │  * @publicApi
148 │  */
```

📄 `angular/packages/common/src/pipes/number_pipe.ts` L149–177 （▶ の行: 167, 169, 171, 173）

```ts
149 │ @Pipe({
150 │   name: 'percent',
151 │ })
152 │ export class PercentPipe implements PipeTransform {
153 │   constructor(@Inject(LOCALE_ID) private _locale: string) {}
154 │ 
155 │   transform(value: number | string, digitsInfo?: string, locale?: string): string | null;
156 │   transform(value: null | undefined, digitsInfo?: string, locale?: string): null;
157 │   transform(
158 │     value: number | string | null | undefined,
159 │     digitsInfo?: string,
160 │     locale?: string,
161 │   ): string | null;
162 │   /**
163 │    *
164 │    * @param value The number to be formatted as a percentage.
165 │    * @param digitsInfo Decimal representation options, specified by a string
166 │    * in the following format:<br>
167 ▶    * <code>{minIntegerDigits}.{minFractionDigits}-{maxFractionDigits}</code>.
168 │    *   - `minIntegerDigits`: The minimum number of integer digits before the decimal point.
169 ▶    * Default is `1`.
170 │    *   - `minFractionDigits`: The minimum number of digits after the decimal point.
171 ▶    * Default is `0`.
172 │    *   - `maxFractionDigits`: The maximum number of digits after the decimal point.
173 ▶    * Default is `0`.
174 │    * @param locale A locale code for the locale format rules to use.
175 │    * When not supplied, uses the value of `LOCALE_ID`, which is `en-US` by default.
176 │    * See [Setting your app locale](guide/i18n/locale-id).
177 │    */
```

173 行目の「maxFractionDigits の既定は 0」は、en-US の percent の書式 `#,##0%` に小数が無いことから来ます（`parseNumberFormat`）。`0.12345 | percent` は `12%` です。ロケールの書式が小数を持てば、この既定も変わります。

📄 `angular/packages/common/src/pipes/number_pipe.ts` L178–216 （▶ の行: 183–184, 186–187, 189, 198–199, 203–204）

```ts
178 │   transform(
179 │     value: number | string | null | undefined,
180 │     digitsInfo?: string,
181 │     locale?: string,
182 │   ): string | null {
183 ▶     if (!isValue(value)) return null;
184 ▶     locale ||= this._locale;
185 │     try {
186 ▶       const num = strToNumber(value);
187 ▶       return formatPercent(num, locale, digitsInfo);
188 │     } catch (error) {
189 ▶       throw invalidPipeArgumentError(PercentPipe, (error as Error).message);
190 │     }
191 │   }
192 │ }
193 │ 
194 │ /**
195 │  * @ngModule CommonModule
196 │  * @description
197 │  *
198 ▶  * Transforms a number to a currency string, formatted according to locale rules
199 ▶  * that determine group sizing and separator, decimal-point character,
200 │  * and other locale-specific configurations.
201 │  *
202 │  *
203 ▶  * @see {@link getCurrencySymbol}
204 ▶  * @see {@link formatCurrency}
205 │  *
206 │  * @usageNotes
207 │  * The following code shows how the pipe transforms numbers
208 │  * into text strings, according to various format specifications,
209 │  * where the caller's default locale is `en-US`.
210 │  *
211 │  * {@example common/pipes/ts/currency_pipe.ts region='CurrencyPipe'}
212 │  *
213 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
214 │  *
215 │  * @publicApi
216 │  */
```

📄 `angular/packages/common/src/pipes/number_pipe.ts` L225–257 （▶ の行: 228–230, 232–234, 236–240, 247–253）

```ts
225 │   /**
226 │    *
227 │    * @param value The number to be formatted as currency.
228 ▶    * @param currencyCode The [ISO 4217](https://en.wikipedia.org/wiki/ISO_4217) currency code,
229 ▶    * such as `USD` for the US dollar and `EUR` for the euro. The default currency code can be
230 ▶    * configured using the `DEFAULT_CURRENCY_CODE` injection token.
231 │    * @param display The format for the currency indicator. One of the following:
232 ▶    *   - `code`: Show the code (such as `USD`).
233 ▶    *   - `symbol`(default): Show the symbol (such as `$`).
234 ▶    *   - `symbol-narrow`: Use the narrow symbol for locales that have two symbols for their
235 │    * currency.
236 ▶    * For example, the Canadian dollar CAD has the symbol `CA$` and the symbol-narrow `$`. If the
237 ▶    * locale has no narrow symbol, uses the standard symbol for the locale.
238 ▶    *   - String: Use the given string value instead of a code or a symbol.
239 ▶    * For example, an empty string will suppress the currency & symbol.
240 ▶    *   - Boolean (marked deprecated in v5): `true` for symbol and false for `code`.
241 │    *
242 │    * @param digitsInfo Decimal representation options, specified by a string
243 │    * in the following format:<br>
244 │    * <code>{minIntegerDigits}.{minFractionDigits}-{maxFractionDigits}</code>.
245 │    *   - `minIntegerDigits`: The minimum number of integer digits before the decimal point.
246 │    * Default is `1`.
247 ▶    *   - `minFractionDigits`: The minimum number of digits after the decimal point.
248 ▶    * Default is `2`.
249 ▶    *   - `maxFractionDigits`: The maximum number of digits after the decimal point.
250 ▶    * Default is `2`.
251 ▶    * If not provided, the number will be formatted with the proper amount of digits,
252 ▶    * depending on what the [ISO 4217](https://en.wikipedia.org/wiki/ISO_4217) specifies.
253 ▶    * For example, the Canadian dollar has 2 digits, whereas the Chilean peso has none.
254 │    * @param locale A locale code for the locale format rules to use.
255 │    * When not supplied, uses the value of `LOCALE_ID`, which is `en-US` by default.
256 │    * See [Setting your app locale](guide/i18n/locale-id).
257 │    */
```

display の値を 1 つずつ通した結果です（DEMO の表の「display」）。

| 行 | display | 約束 | 本物（1234.5, 'EUR'） |
| --- | --- | --- | --- |
| 232 | `'code'` | コードを出す | `EUR1,234.50` |
| 233 | `'symbol'`（既定） | 記号 | `€1,234.50` |
| 234〜237 | `'symbol-narrow'` | 狭い記号。無ければ普通の記号 | EUR は狭い記号が同じ `€`。CAD なら `$`（例の 34 行目） |
| 238〜239 | 任意の文字列 | その文字列。空文字で記号を消す | `''` は `1,234.50`、`'EUR '` は `EUR 1,234.50` |
| 240 | `true`・`false`（v5 で非推奨） | true は symbol、false は code | そのとおり。開発モードでは 1 回ごとに `console.warn`（記録の列） |
| 238 | `'$&'` | その文字列 | `1,234.50`（消える）。`'$$'` は `$` 1 つになる |

最後の行は、`formatCurrency` が記号の位置の `¤` を `String.prototype.replace(CURRENCY_CHAR, currency)` で置き換えるからです（数の書式の章の 8 節の行）。置き換える側の文字列の中の `$&`（一致した文字そのもの）や `$$`（`$` 1 つ）は、`replace` の特別な並びとして読まれます。`$&` は `¤` に戻り、次の `.replace(CURRENCY_CHAR, '')` で消えます。実在の通貨の記号に `$&` や `$$` は無いので、display に自分の文字列を渡したときだけ起きます。

247〜250 行目は「min も max も既定は 2」と書き、すぐ後の 251〜253 行目で「省くと ISO 4217 の桁」と言い直します。実際は後者で、JPY は 0 桁（`¥1,235`）、KWD は 3 桁（`KWD1,234.500`）、表に無いコードは 2 桁です。桁の表は次の currencies.ts の 3 つめの値です。

📄 `angular/packages/common/src/i18n/currencies.ts` L9–13 （▶ の行: 9–10, 12–13）

```ts
 9 ▶ // THIS CODE IS GENERATED - DO NOT MODIFY.
10 ▶ export type CurrenciesSymbols = [string] | [string | undefined, string];
11 │ 
12 ▶ /** @internal */
13 ▶ export const CURRENCIES_EN: {[code: string]: CurrenciesSymbols | [string | undefined, string | undefined, number]} = {"ADP":[undefined,undefined,0],"AFN":[undefined,"؋",0],"ALL":[undefined,undefined,0],"AMD":[undefined,"֏",2],"AOA":[undefined,"Kz"],"ARS":[undefined,"$"],"AUD":["A$","$"],"AZN":[undefined,"₼"],"BAM":[undefined,"KM"],"BBD":[undefined,"$"],"BDT":[undefined,"৳"],"BHD":[undefined,undefined,3],"BIF":[undefined,undefined,0],"BMD":[undefined,"$"],"BND":[undefined,"$"],"BOB":[undefined,"Bs"],"BRL":["R$"],"BSD":[undefined,"$"],"BWP":[undefined,"P"],"BYN":[undefined,undefined,2],"BYR":[undefined,undefined,0],"BZD":[undefined,"$"],"CAD":["CA$","$",2],"CHF":[undefined,undefined,2],"CLF":[undefined,undefined,4],"CLP":[undefined,"$",0],"CNY":["CN¥","¥"],"COP":[undefined,"$",2],"CRC":[undefined,"₡",2],"CUC":[undefined,"$"],"CUP":[undefined,"$"],"CZK":[undefined,"Kč",2],"DJF":[undefined,undefined,0],"DKK":[undefined,"kr",2],"DOP":[undefined,"$"],"EGP":[undefined,"E£"],"ESP":[undefined,"₧",0],"EUR":["€"],"FJD":[undefined,"$"],"FKP":[undefined,"£"],"GBP":["£"],"GEL":[undefined,"₾"],"GHS":[undefined,"GH₵"],"GIP":[undefined,"£"],"GNF":[undefined,"FG",0],"GTQ":[undefined,"Q"],"GYD":[undefined,"$",2],"HKD":["HK$","$"],"HNL":[undefined,"L"],"HRK":[undefined,"kn"],"HUF":[undefined,"Ft",2],"IDR":[undefined,"Rp",2],"ILS":["₪"],"INR":["₹"],"IQD":[undefined,undefined,0],"IRR":[undefined,undefined,0],"ISK":[undefined,"kr",0],"ITL":[undefined,undefined,0],"JMD":[undefined,"$"],"JOD":[undefined,undefined,3],"JPY":["¥",undefined,0],"KGS":[undefined,"⃀"],"KHR":[undefined,"៛"],"KMF":[undefined,"CF",0],"KPW":[undefined,"₩",0],"KRW":["₩",undefined,0],"KWD":[undefined,undefined,3],"KYD":[undefined,"$"],"KZT":[undefined,"₸"],"LAK":[undefined,"₭",0],"LBP":[undefined,"L£",0],"LKR":[undefined,"Rs"],"LRD":[undefined,"$"],"LTL":[undefined,"Lt"],"LUF":[undefined,undefined,0],"LVL":[undefined,"Ls"],"LYD":[undefined,undefined,3],"MGA":[undefined,"Ar",0],"MGF":[undefined,undefined,0],"MMK":[undefined,"K",0],"MNT":[undefined,"₮",2],"MRO":[undefined,undefined,0],"MUR":[undefined,"Rs",2],"MXN":["MX$","$"],"MYR":[undefined,"RM"],"NAD":[undefined,"$"],"NGN":[undefined,"₦"],"NIO":[undefined,"C$"],"NOK":[undefined,"kr",2],"NPR":[undefined,"Rs"],"NZD":["NZ$","$"],"OMR":[undefined,undefined,3],"PHP":["₱"],"PKR":[undefined,"Rs",2],"PLN":[undefined,"zł"],"PYG":[undefined,"₲",0],"RON":[undefined,"lei"],"RSD":[undefined,undefined,0],"RUB":[undefined,"₽"],"RWF":[undefined,"RF",0],"SBD":[undefined,"$"],"SEK":[undefined,"kr",2],"SGD":[undefined,"$"],"SHP":[undefined,"£"],"SLE":[undefined,undefined,2],"SLL":[undefined,undefined,0],"SOS":[undefined,undefined,0],"SRD":[undefined,"$"],"SSP":[undefined,"£"],"STD":[undefined,undefined,0],"STN":[undefined,"Db"],"SYP":[undefined,"£",0],"THB":[undefined,"฿"],"TMM":[undefined,undefined,0],"TND":[undefined,undefined,3],"TOP":[undefined,"T$"],"TRL":[undefined,undefined,0],"TRY":[undefined,"₺"],"TTD":[undefined,"$"],"TWD":["NT$","$",2],"TZS":[undefined,undefined,2],"UAH":[undefined,"₴"],"UGX":[undefined,undefined,0],"USD":["$"],"UYI":[undefined,undefined,0],"UYU":[undefined,"$"],"UYW":[undefined,undefined,4],"UZS":[undefined,undefined,2],"VEF":[undefined,"Bs",2],"VND":["₫",undefined,0],"VUV":[undefined,undefined,0],"XAF":["FCFA",undefined,0],"XCD":["EC$","$"],"XCG":["Cg."],"XOF":["F CFA",undefined,0],"XPF":["CFPF",undefined,0],"XXX":["¤"],"YER":[undefined,undefined,0],"ZAR":[undefined,"R"],"ZMK":[undefined,undefined,0],"ZMW":[undefined,"ZK"],"ZWD":[undefined,undefined,0]};
```

9 行目のとおり CLDR から作るファイルで、13 行目の 1 行に全部の通貨が入っています。`"CAD":["CA$","$",2]` は「記号・狭い記号・桁」、`"JPY":["¥",undefined,0]`、`"KWD":[undefined,undefined,3]` のように、桁が 2 のときは 3 つめを省きます。en 以外のロケールの記号は、ロケールのデータの側の表が先に引かれます（`getCurrencySymbol`、数の書式の章の 2 節）。

📄 `angular/packages/common/src/pipes/number_pipe.ts` L258–278 （▶ の行: 261, 268, 275）

```ts
258 │   transform(
259 │     value: number | string,
260 │     currencyCode?: string,
261 ▶     display?: 'code' | 'symbol' | 'symbol-narrow' | string | boolean,
262 │     digitsInfo?: string,
263 │     locale?: string,
264 │   ): string | null;
265 │   transform(
266 │     value: null | undefined,
267 │     currencyCode?: string,
268 ▶     display?: 'code' | 'symbol' | 'symbol-narrow' | string | boolean,
269 │     digitsInfo?: string,
270 │     locale?: string,
271 │   ): null;
272 │   transform(
273 │     value: number | string | null | undefined,
274 │     currencyCode?: string,
275 ▶     display?: 'code' | 'symbol' | 'symbol-narrow' | string | boolean,
276 │     digitsInfo?: string,
277 │     locale?: string,
278 │   ): string | null;
```

261 行目の display の型 `'code' | 'symbol' | 'symbol-narrow' | string | boolean` は、TypeScript では `string | boolean` と同じです（文字列の型に 3 つの文字列が吸い込まれる）。`'simbol'` と書き間違えても型の誤りにはならず、その文字列が記号として出ます。

## 4. format 関数の説明文と、中の型

📄 `angular/packages/common/src/i18n/format_number.ts` L160–185 （▶ の行: 169–174, 176）

```ts
160 │ 
161 │ /**
162 │  * @ngModule CommonModule
163 │  * @description
164 │  *
165 │  * Formats a number as currency using locale rules.
166 │  *
167 │  * @param value The number to format.
168 │  * @param locale A locale code for the locale format rules to use.
169 ▶  * @param currency A string containing the currency symbol or its name,
170 ▶  * such as "$" or "Canadian Dollar". Used in output string, but does not affect the operation
171 ▶  * of the function.
172 ▶  * @param currencyCode The [ISO 4217](https://en.wikipedia.org/wiki/ISO_4217)
173 ▶  * currency code, such as `USD` for the US dollar and `EUR` for the euro.
174 ▶  * Used to determine the number of digits in the decimal part.
175 │  * @param digitsInfo Decimal representation options, specified by a string in the following format:
176 ▶  * `{minIntegerDigits}.{minFractionDigits}-{maxFractionDigits}`. See `DecimalPipe` for more details.
177 │  *
178 │  * @returns The formatted currency value.
179 │  *
180 │  * @see {@link formatNumber}
181 │  * @see {@link DecimalPipe}
182 │  * @see [Internationalization (i18n) Guide](guide/i18n)
183 │  *
184 │  * @publicApi
185 │  */
```

169〜171 行目の「currency は出力の文字に使うだけで、処理には効かない」と、172〜174 行目の「currencyCode は小数の桁を決めるのに使う」が、`formatCurrency` の 2 つの引数の分担です。`CurrencyPipe` は display から currency を作り、currencyCode はそのまま渡します（`transform` の本体、数の書式の章の 1 節）。3 節の `'$&'` は、169〜171 行目の「効かない」の例外です。

📄 `angular/packages/common/src/i18n/format_number.ts` L219–238 （▶ の行: 224, 228–229）

```ts
219 │ 
220 │ /**
221 │  * @ngModule CommonModule
222 │  * @description
223 │  *
224 ▶  * Formats a number as a percentage according to locale rules.
225 │  *
226 │  * @param value The number to format.
227 │  * @param locale A locale code for the locale format rules to use.
228 ▶  * @param digitsInfo Decimal representation options, specified by a string in the following format:
229 ▶  * `{minIntegerDigits}.{minFractionDigits}-{maxFractionDigits}`. See `DecimalPipe` for more details.
230 │  *
231 │  * @returns The formatted percentage value.
232 │  *
233 │  * @see {@link formatNumber}
234 │  * @see {@link DecimalPipe}
235 │  * @see [Internationalization (i18n) Guide](guide/i18n)
236 │  * @publicApi
237 │  *
238 │  */
```

📄 `angular/packages/common/src/i18n/format_number.ts` L256–273 （▶ の行: 261–262, 266–267）

```ts
256 │ 
257 │ /**
258 │  * @ngModule CommonModule
259 │  * @description
260 │  *
261 ▶  * Formats a number as text, with group sizing, separator, and other
262 ▶  * parameters based on the locale.
263 │  *
264 │  * @param value The number to format.
265 │  * @param locale A locale code for the locale format rules to use.
266 ▶  * @param digitsInfo Decimal representation options, specified by a string in the following format:
267 ▶  * `{minIntegerDigits}.{minFractionDigits}-{maxFractionDigits}`. See `DecimalPipe` for more details.
268 │  *
269 │  * @returns The formatted text string.
270 │  * @see [Internationalization (i18n) Guide](guide/i18n)
271 │  *
272 │  * @publicApi
273 │  */
```

3 つの関数の説明は、どれも digitsInfo を「DecimalPipe を見よ」と送ります。ただし既定は関数ごとに違い、`formatPercent` は percent の書式（小数 0）、`formatCurrency` は通貨の桁、`formatNumber` は decimal の書式（小数 0〜3）です。説明文はこの違いを pipe の側（173・248〜253 行目）にだけ書いています。

📄 `angular/packages/common/src/i18n/format_number.ts` L283–306 （▶ の行: 288, 290, 292, 294, 298, 300, 302, 304）

```ts
283 │     digitsInfo,
284 │   );
285 │ }
286 │ 
287 │ interface ParsedNumberFormat {
288 ▶   minInt: number;
289 │   // the minimum number of digits required in the fraction part of the number
290 ▶   minFrac: number;
291 │   // the maximum number of digits required in the fraction part of the number
292 ▶   maxFrac: number;
293 │   // the prefix for a positive number
294 ▶   posPre: string;
295 │   // the suffix for a positive number
296 │   posSuf: string;
297 │   // the prefix for a negative number (e.g. `-` or `(`))
298 ▶   negPre: string;
299 │   // the suffix for a negative number (e.g. `)`)
300 ▶   negSuf: string;
301 │   // number of digits in each group of separated digits
302 ▶   gSize: number;
303 │   // number of digits in the last group of digits before the decimal separator
304 ▶   lgSize: number;
305 │ }
306 │ 
```

📄 `angular/packages/common/src/i18n/format_number.ts` L364–373 （▶ の行: 367, 369, 371）

```ts
364 │ 
365 │ interface ParsedNumber {
366 │   // an array of digits containing leading zeros as necessary
367 ▶   digits: number[];
368 │   // the exponent for numbers that would need more than `MAX_DIGITS` digits in `d`
369 ▶   exponent: number;
370 │   // the number of the digits in `d` that are to the left of the decimal point
371 ▶   integerLen: number;
372 │ }
373 │ 
```

`ParsedNumberFormat` はロケールの書式（`#,##0.###` など）を読んだ結果、`ParsedNumber` は値を桁の配列にした結果です。298 行目のコメントのとおり負の数の前置きは `-` だけでなく `(` のこともあり（会計の書式）、302・304 行目の 2 つの幅でインドの `1,23,45,678` のような区切りも表せます（数の書式の章の 4 節）。

## 5. I18nPluralPipe と I18nSelectPipe

📄 `angular/packages/common/src/pipes/i18n_plural_pipe.ts` L9–32 （▶ の行: 15, 21, 27）

```ts
 9 │ import {Pipe, PipeTransform} from '@angular/core';
10 │ 
11 │ import {getPluralCategory, NgLocalization} from '../i18n/localization';
12 │ 
13 │ import {invalidPipeArgumentError} from './utils';
14 │ 
15 ▶ const _INTERPOLATION_REGEXP: RegExp = /#/g;
16 │ 
17 │ /**
18 │  * @ngModule CommonModule
19 │  * @description
20 │  *
21 ▶  * Maps a value to a string that pluralizes the value according to locale rules.
22 │  *
23 │  * @usageNotes
24 │  *
25 │  * ### Example
26 │  *
27 ▶  * {@example common/pipes/ts/i18n_pipe.ts region='I18nPluralPipeComponent'}
28 │  *
29 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
30 │  *
31 │  * @publicApi
32 │  */
```

📄 `angular/packages/common/src/pipes/i18n_select_pipe.ts` L9–31 （▶ の行: 17, 19–20, 26）

```ts
 9 │ import {Pipe, PipeTransform} from '@angular/core';
10 │ 
11 │ import {invalidPipeArgumentError} from './utils';
12 │ 
13 │ /**
14 │  * @ngModule CommonModule
15 │  * @description
16 │  *
17 ▶  * Generic selector that displays the string that matches the current value.
18 │  *
19 ▶  * If none of the keys of the `mapping` match the `value`, then the content
20 ▶  * of the `other` key is returned when present, otherwise an empty string is returned.
21 │  *
22 │  * @usageNotes
23 │  *
24 │  * ### Example
25 │  *
26 ▶  * {@example common/pipes/ts/i18n_pipe.ts region='I18nSelectPipeComponent'}
27 │  *
28 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
29 │  *
30 │  * @publicApi
31 │  */
```

I18nPluralPipe の 21 行目は「ロケールの規則で複数形を選ぶ」だけを書きます。選び方は `getPluralCategory` で、`=0` のような値そのもののキー → ロケールの区分（`one`・`few` など）→ `other` の順に探し、どれも無ければ例外です（ロケールのデータの章の 5 節）。15 行目の `#` は値の `toString()` に置き換わります。en では 1 が `one` ですが、fr では 0 も `one` なので、`0 | i18nPlural: {one: '# objet', …} : 'fr'` は `0 objet` です（DEMO の表）。

I18nSelectPipe の 19〜20 行目「どのキーにも合わなければ other、それも無ければ空文字」は、そのとおりでした。ただ、mapping に `null` を渡すと、I18nPluralPipe は `InvalidPipeArgument` で投げ、I18nSelectPipe は `TypeError: Cannot convert undefined or null to object` です。select の検査は `typeof mapping !== 'object'` だけで、`typeof null` は `'object'` なので通り抜け、次の `Object.hasOwn(null, …)` が投げます（小さな pipe の章の 5 節の行）。plural は `pluralMap === null` も見ています（ロケールのデータの章の 5 節で引いた行）。main でも同じです。

## 6. DEMO：説明文の約束を 1 行ずつ

> **🧪 DEMO — 例のコメントの output と、説明文の約束を本物で通す**
>
> 各行は `new DecimalPipe('en-US')` などの本物の pipe か `formatCurrency` を直接呼んだものです。印は `=` 同じ、`≈` 空白の種類だけ違う、`≠` 違う（説明文に output が無い行は空）。⍽ は U+202F、␣ は U+00A0。左の「開発モード（記録）」は同じ demo のファイルを Node で開発モードのまま走らせた記録の再生です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-number)

このページの列は本番ビルドなので、例外の文は `NG02100` などの番号だけになり、boolean の display の `console.warn` も出ません（`transform` の中の `ngDevMode` の分岐。数の書式の章の 1 節）。

## 7. ここまでを 1 本に

- 👤 `{{ b | currency: 'CAD' : 'symbol' : '4.2-2' : 'fr' }}` — currency\_pipe.ts（examples）L38 — *コメントは 0 001,35 CA$*
  - `CurrencyPipe.transform(…)` — number\_pipe.ts L279 — *display が 'symbol' → getCurrencySymbol('CAD', 'wide', 'fr')*
    - `getCurrencySymbol` — locale\_data\_api.ts — *fr のデータの CAD は $CA（currencies.ts L13 の CA$ より先）*
  - `formatCurrency(1.3495, 'fr', '$CA', 'CAD', '4.2-2')` — format\_number.ts L186 — *¤ を '$CA' に replace*
    - `formatNumberToLocaleString` — L33 — *区切りは U+202F、¤ の前は U+00A0*
- `0⍽001,35␣$CA` — 出力 — *e2e の pipe\_spec.ts L115 はこれを期待*

## テストと直し方

| spec | describe / it |
| --- | --- |
| common/test/pipes/number\_pipe\_spec.ts | describe `Number pipes`（19 行目）› `DecimalPipe`（31）・`PercentPipe`（99）・`CurrencyPipe`（151）。should support strings（43）・should support any currency code name（188）・should warn if you are using the v4 signature（221） |
| common/test/pipes/i18n\_plural\_pipe\_spec.ts・i18n\_select\_pipe\_spec.ts | should not support bad arguments（plural 60）・should throw on bad arguments（select 37）。どちらも mapping に文字列 `'hey'` を渡すだけで、`null` の it はありません |
| examples/common/pipes/ts/e2e\_test/pipe\_spec.ts | describe `number`・`percent`・`currency`（82・96・106 行目）。WebDriver の e2e で、例のコメントではなく実際の出力を期待 |

📄 `手元で走らせたコマンド` L1–3

```
1 │ cd ~/angular-research/angular
2 │ pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
3 │   "--test_arg=--filter=^(Number pipes|Format number|I18nPluralPipe|I18nSelectPipe|l10n)"
```

📄 `結果（2026-11-21）` L1–4

```
1 │ Ran 61 of 667 specs
2 │ 61 specs, 0 failures
3 │ Finished in 0.049 seconds
4 │ //packages/common/test:test                                              PASSED in 0.8s
```

61 件すべて成功です（`l10n` を含む）。examples の 4 つのファイルは、手元で strict・`noPropertyAccessFromIndexSignature`・strictTemplates の ngc にかけて、エラー 0 でした。

直すとしたら、examples の currency\_pipe.ts の 37 行目のコメントを e2e の 115 行目に合わせる（`'0 001,35 $CA'`）ことと、number\_pipe.ts の 247〜250 行目を「既定は通貨の桁（多くは 2）」にすることです。I18nSelectPipe の `null` は、検査に `mapping === null` を足すと I18nPluralPipe と同じ `InvalidPipeArgument` になります。spec は i18n\_select\_pipe\_spec.ts の 37 行目の隣に `null` の it を 1 つです。`'$&'` は `replace` の 2 つめの引数を関数（`() => currency`）にすると特別な並びとして読まれなくなります。直す場所は format\_number.ts の `formatCurrency` の最後の `replace` です。

## 聞かれそうな質問

**Q. 説明文の例の fr の通貨が CA$ なのに、画面では $CA と出ます。**

例のコメント（currency\_pipe.ts 37 行目）が古いままです。fr のデータの CAD の記号は `$CA` で、examples の e2e（pipe\_spec.ts 115 行目）も `$CA` を期待しています。

**Q. fr の出力を toBe('0 003,14159') で比べると落ちます。**

桁の区切りが U+202F だからです。e2e の 91 行目のように `\u202f` で書きます。

**Q. currency の小数の桁の既定は 2 ではないのですか？**

通貨の桁です。247〜250 行目は 2 と書きますが、251〜253 行目のとおり ISO 4217 の桁が使われ、JPY は 0、KWD は 3 です（currencies.ts 13 行目の 3 つめの値）。

**Q. display に好きな文字列を渡せますか？**

渡せます（238 行目）。ただし `$&` や `$$` を含むと `replace` の特別な並びとして読まれ、`'$&'` は消え、`'$$'` は `$` になります。

**Q. i18nSelect の mapping が null のときは？**

`TypeError` です。I18nPluralPipe の `InvalidPipeArgument` と違い、select の検査が `typeof null === 'object'` を通すからです（5 節）。値が `null` なら空文字です。

## 読み終えて

- 説明文の例は examples のファイルから入り、通貨の fr の 1 行だけが本物と違います（CA$ と $CA）。e2e は本物のほうを固めています。
- fr の出力の空白は U+202F と U+00A0 で、例のコメントは普通の空白です。
- 丸めは 10 進の桁で、5 は 0 から遠い方へ。`1.005` は `1.01` です。
- currency の桁の既定は通貨ごと、display の文字列の `$&`・`$$` は `replace` に読まれます。
- I18nSelectPipe は mapping の `null` を検査で止めず、`TypeError` になります。

---

← 前: [日付の書式の説明文：DatePipe と formatDate](03-cmd-date.md)  
次: [構造ディレクティブの説明文：NgIf・NgForOf・NgSwitch・NgPlural](05-cmd-structural.md) →
