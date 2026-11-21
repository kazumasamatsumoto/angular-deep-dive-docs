[目次](../README.md) › [common の説明文の読み残し](README.md) › 第 3 回 / 全 9 回

# 日付の書式の説明文：DatePipe と formatDate

> pipes/date\_pipe.ts と i18n/format\_date.ts の未読の行：書式の記号の表の 1 行ずつを本物の formatDate で通す（W・aaaa・B/b・ZZZZ の 10 行が en-US の出力と違う）、Format examples と Usage example、timezone と value の受け付ける形、ISO 週の年と w の無い Y。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-date)

---

`DatePipe` の説明文には、書式の記号を 1 行ずつ並べた大きな表（記号・説明・例の値）と、出力つきの例があります。angular.dev の API リファレンスで一番よく読まれる表の 1 つです。この章は、その表の 1 行ずつと例を本物の `formatDate` / `DatePipe`（このサイトの `@angular/common` 22.2.6）に通し、説明と出力が違う行に印を付けます。63 行（157 行目は extra のデータの有無で 2 回）のうち 10 行が違いました。

読む対象は `packages/common/src/pipes/date_pipe.ts` と `packages/common/src/i18n/format_date.ts`（../angular、8576f161ae4）です。`DatePipe` のトークンと既定値、名前つきの書式の表は[DatePipe の章](../cmn/09-cmn-date-pipe.md)、`formatDate` が書式を部品に割る流れと `toDate` は[日付の書式の章](../cmn/10-cmn-format-date.md)、記号ごとの関数・タイムゾーン・ISO の週番号の計算は[日付の部品の章](../cmn/11-cmn-date-getters.md)にあります。ここではそれらを繰り返さず、説明文の約束と、まだ引いていない行を読みます。

1. [1. NgOptimizedImage](01-cmd-image.md)
2. [2. 画像のローダー](02-cmd-image-loaders.md)
3. **3. 日付の書式**（この章）
4. [4. 数と i18n の pipe](04-cmd-number.md)
5. [5. 構造ディレクティブ](05-cmd-structural.md)
6. [6. NgClass・NgStyle と outlet](06-cmd-attr-outlets.md)
7. [7. AsyncPipe と小さな pipe](07-cmd-pipes.md)
8. [8. Location](08-cmd-location.md)
9. [9. spec と issue](09-cmd-tests-issues.md)

## 1. 書式の記号の表

📄 `angular/packages/common/src/pipes/date_pipe.ts` L109–143 （▶ の行: 112, 114–115, 122, 126, 140, 142）

```ts
109 │  *
110 │  * ### Custom format options
111 │  *
112 ▶  * You can construct a format string using symbols to specify the components
113 │  * of a date-time value, as described in the following table.
114 ▶  * Format details depend on the locale.
115 ▶  * Fields marked with (*) are only available in the extra data set for the given locale.
116 │  *
117 │  *  | Field type              | Format      | Description                                                   | Example Value                                              |
118 │  *  |-------------------------|-------------|---------------------------------------------------------------|------------------------------------------------------------|
119 │  *  | Era                     | G, GG & GGG | Abbreviated                                                   | AD                                                         |
120 │  *  |                         | GGGG        | Wide                                                          | Anno Domini                                                |
121 │  *  |                         | GGGGG       | Narrow                                                        | A                                                          |
122 ▶  *  | Year                    | y           | Numeric: minimum digits                                       | 2, 20, 201, 2017, 20173                                    |
123 │  *  |                         | yy          | Numeric: 2 digits + zero padded                               | 02, 20, 01, 17, 73                                         |
124 │  *  |                         | yyy         | Numeric: 3 digits + zero padded                               | 002, 020, 201, 2017, 20173                                 |
125 │  *  |                         | yyyy        | Numeric: 4 digits or more + zero padded                       | 0002, 0020, 0201, 2017, 20173                              |
126 ▶  *  | ISO Week-numbering year | Y           | Numeric: minimum digits                                       | 2, 20, 201, 2017, 20173                                    |
127 │  *  |                         | YY          | Numeric: 2 digits + zero padded                               | 02, 20, 01, 17, 73                                         |
128 │  *  |                         | YYY         | Numeric: 3 digits + zero padded                               | 002, 020, 201, 2017, 20173                                 |
129 │  *  |                         | YYYY        | Numeric: 4 digits or more + zero padded                       | 0002, 0020, 0201, 2017, 20173                              |
130 │  *  | Month                   | M           | Numeric: 1 digit                                              | 9, 12                                                      |
131 │  *  |                         | MM          | Numeric: 2 digits + zero padded                               | 09, 12                                                     |
132 │  *  |                         | MMM         | Abbreviated                                                   | Sep                                                        |
133 │  *  |                         | MMMM        | Wide                                                          | September                                                  |
134 │  *  |                         | MMMMM       | Narrow                                                        | S                                                          |
135 │  *  | Month standalone        | L           | Numeric: 1 digit                                              | 9, 12                                                      |
136 │  *  |                         | LL          | Numeric: 2 digits + zero padded                               | 09, 12                                                     |
137 │  *  |                         | LLL         | Abbreviated                                                   | Sep                                                        |
138 │  *  |                         | LLLL        | Wide                                                          | September                                                  |
139 │  *  |                         | LLLLL       | Narrow                                                        | S                                                          |
140 ▶  *  | ISO Week of year        | w           | Numeric: minimum digits                                       | 1... 53                                                    |
141 │  *  |                         | ww          | Numeric: 2 digits + zero padded                               | 01... 53                                                   |
142 ▶  *  | Week of month           | W           | Numeric: 1 digit                                              | 1... 5                                                     |
143 │  *  | Day of month            | d           | Numeric: minimum digits                                       | 1                                                          |
```

📄 `angular/packages/common/src/pipes/date_pipe.ts` L144–181 （▶ の行: 149, 155, 157–162, 174, 177, 179）

```ts
144 │  *  |                         | dd          | Numeric: 2 digits + zero padded                               | 01                                                         |
145 │  *  | Week day                | E, EE & EEE | Abbreviated                                                   | Tue                                                        |
146 │  *  |                         | EEEE        | Wide                                                          | Tuesday                                                    |
147 │  *  |                         | EEEEE       | Narrow                                                        | T                                                          |
148 │  *  |                         | EEEEEE      | Short                                                         | Tu                                                         |
149 ▶  *  | Week day standalone     | c, cc       | Numeric: 1 digit                                              | 2                                                          |
150 │  *  |                         | ccc         | Abbreviated                                                   | Tue                                                        |
151 │  *  |                         | cccc        | Wide                                                          | Tuesday                                                    |
152 │  *  |                         | ccccc       | Narrow                                                        | T                                                          |
153 │  *  |                         | cccccc      | Short                                                         | Tu                                                         |
154 │  *  | Period                  | a, aa & aaa | Abbreviated                                                   | am/pm or AM/PM                                             |
155 ▶  *  |                         | aaaa        | Wide (fallback to `a` when missing)                           | ante meridiem/post meridiem                                |
156 │  *  |                         | aaaaa       | Narrow                                                        | a/p                                                        |
157 ▶  *  | Period*                 | B, BB & BBB | Abbreviated                                                   | mid.                                                       |
158 ▶  *  |                         | BBBB        | Wide                                                          | am, pm, midnight, noon, morning, afternoon, evening, night |
159 ▶  *  |                         | BBBBB       | Narrow                                                        | md                                                         |
160 ▶  *  | Period standalone*      | b, bb & bbb | Abbreviated                                                   | mid.                                                       |
161 ▶  *  |                         | bbbb        | Wide                                                          | am, pm, midnight, noon, morning, afternoon, evening, night |
162 ▶  *  |                         | bbbbb       | Narrow                                                        | md                                                         |
163 │  *  | Hour 1-12               | h           | Numeric: minimum digits                                       | 1, 12                                                      |
164 │  *  |                         | hh          | Numeric: 2 digits + zero padded                               | 01, 12                                                     |
165 │  *  | Hour 0-23               | H           | Numeric: minimum digits                                       | 0, 23                                                      |
166 │  *  |                         | HH          | Numeric: 2 digits + zero padded                               | 00, 23                                                     |
167 │  *  | Minute                  | m           | Numeric: minimum digits                                       | 8, 59                                                      |
168 │  *  |                         | mm          | Numeric: 2 digits + zero padded                               | 08, 59                                                     |
169 │  *  | Second                  | s           | Numeric: minimum digits                                       | 0... 59                                                    |
170 │  *  |                         | ss          | Numeric: 2 digits + zero padded                               | 00... 59                                                   |
171 │  *  | Fractional seconds      | S           | Numeric: 1 digit                                              | 0... 9                                                     |
172 │  *  |                         | SS          | Numeric: 2 digits + zero padded                               | 00... 99                                                   |
173 │  *  |                         | SSS         | Numeric: 3 digits + zero padded (= milliseconds)              | 000... 999                                                 |
174 ▶  *  | Zone                    | z, zz & zzz | Short specific non location format (fallback to O)            | GMT-8                                                      |
175 │  *  |                         | zzzz        | Long specific non location format (fallback to OOOO)          | GMT-08:00                                                  |
176 │  *  |                         | Z, ZZ & ZZZ | ISO8601 basic format                                          | -0800                                                      |
177 ▶  *  |                         | ZZZZ        | Long localized GMT format                                     | GMT-8:00                                                   |
178 │  *  |                         | ZZZZZ       | ISO8601 extended format + Z indicator for offset 0 (= XXXXX)  | -08:00                                                     |
179 ▶  *  |                         | O, OO & OOO | Short localized GMT format                                    | GMT-8                                                      |
180 │  *  |                         | OOOO        | Long localized GMT format                                     | GMT-08:00                                                  |
181 │  *
```

114 行目「細かい形はロケールで決まる」、115 行目「(\*) の付いた欄は、そのロケールの extra のデータにだけある」が表の前提です。例の値は en-US で読みます。表の記号を部品に割る正規表現と、記号から関数を選ぶ `getDateFormatter` は[日付の部品の章](../cmn/11-cmn-date-getters.md)の 1 節です。

> **🧪 DEMO — 表の 1 行ずつを本物の formatDate に通す**
>
> 各行の記号を、例の値が出るように選んだ日付（右から 2 つめの列）で `formatDate(date, 記号, 'en-US', '+0000')` に通します。日付は `Date.UTC` で作った瞬間で、タイムゾーンも渡すので、見る人の端末で結果は変わりません（174〜180 行目だけ `'-0800'`）。B・b の行は、en-US のデータを書き換えないよう、この章だけの名前 `'cmd-en-x'` で `locales/en` と `locales/extra/en` を `registerLocaleData` したものを使います。印は `=` 同じ、`≈` 空白の種類だけ違う、`≠` 違う。左の「開発モード（記録）」は同じ demo のファイルを Node で開発モードのまま走らせた記録の再生です。
>
> ⍽ は U+202F（幅の狭い改行しない空白）、␣ は U+00A0（改行しない空白）を目に見えるようにした印です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-date)

違った 10 行を、実装の側から読みます。

### 142 行目 W：月の週は 6 まである

📄 `angular/packages/common/src/i18n/format_date.ts` L657–692 （▶ の行: 680–682, 688–690）

```ts
657 │     // Month of the year (January, ...), string, standalone
658 │     case 'LLL':
659 │       formatter = dateStrGetter(
660 │         TranslationType.Months,
661 │         TranslationWidth.Abbreviated,
662 │         FormStyle.Standalone,
663 │       );
664 │       break;
665 │     case 'LLLL':
666 │       formatter = dateStrGetter(
667 │         TranslationType.Months,
668 │         TranslationWidth.Wide,
669 │         FormStyle.Standalone,
670 │       );
671 │       break;
672 │     case 'LLLLL':
673 │       formatter = dateStrGetter(
674 │         TranslationType.Months,
675 │         TranslationWidth.Narrow,
676 │         FormStyle.Standalone,
677 │       );
678 │       break;
679 │ 
680 ▶     // Week of the year (1, ... 52)
681 ▶     case 'w':
682 ▶       formatter = weekGetter(1);
683 │       break;
684 │     case 'ww':
685 │       formatter = weekGetter(2);
686 │       break;
687 │ 
688 ▶     // Week of the month (1, ...)
689 ▶     case 'W':
690 ▶       formatter = weekGetter(1, true);
691 │       break;
692 │ 
```

689〜690 行目の `W` は `weekGetter(1, true)`、つまり「月の 1 日の曜日からの通しの週」です（式は日付の部品の章の 4 節）。週は日曜で切り替わり、月の 1 日がある週が 1 です。1 日が土曜で 31 日まである月は、最後の 31 日（月曜）が 6 週目になります（DEMO の 2015-08-31）。説明文の `1... 5` は 6 を書いていません。680 行目のコメントの「Week of the year (1, ... 52)」も、2020-12-31 が 53 になる（141 行目の表のほうは `53` と書く）ので古いままです。

### 155・157〜162 行目：aaaa と B・b

📄 `angular/packages/common/src/i18n/format_date.ts` L756–783 （▶ の行: 756–757, 760, 763–764）

```ts
756 ▶     // Extended period of the day (midnight, at night, ...), standalone
757 ▶     case 'b':
758 │     case 'bb':
759 │     case 'bbb':
760 ▶       formatter = dateStrGetter(
761 │         TranslationType.DayPeriods,
762 │         TranslationWidth.Abbreviated,
763 ▶         FormStyle.Standalone,
764 ▶         true,
765 │       );
766 │       break;
767 │     case 'bbbb':
768 │       formatter = dateStrGetter(
769 │         TranslationType.DayPeriods,
770 │         TranslationWidth.Wide,
771 │         FormStyle.Standalone,
772 │         true,
773 │       );
774 │       break;
775 │     case 'bbbbb':
776 │       formatter = dateStrGetter(
777 │         TranslationType.DayPeriods,
778 │         TranslationWidth.Narrow,
779 │         FormStyle.Standalone,
780 │         true,
781 │       );
782 │       break;
783 │ 
```

📄 `angular/packages/common/src/i18n/format_date.ts` L784–811 （▶ の行: 784–785, 788, 791–792）

```ts
784 ▶     // Extended period of the day (midnight, night, ...), standalone
785 ▶     case 'B':
786 │     case 'BB':
787 │     case 'BBB':
788 ▶       formatter = dateStrGetter(
789 │         TranslationType.DayPeriods,
790 │         TranslationWidth.Abbreviated,
791 ▶         FormStyle.Format,
792 ▶         true,
793 │       );
794 │       break;
795 │     case 'BBBB':
796 │       formatter = dateStrGetter(
797 │         TranslationType.DayPeriods,
798 │         TranslationWidth.Wide,
799 │         FormStyle.Format,
800 │         true,
801 │       );
802 │       break;
803 │     case 'BBBBB':
804 │       formatter = dateStrGetter(
805 │         TranslationType.DayPeriods,
806 │         TranslationWidth.Narrow,
807 │         FormStyle.Format,
808 │         true,
809 │       );
810 │       break;
811 │ 
```

1. **155 行目 aaaa**

   例の値は「ante meridiem/post meridiem」ですが、en-US の Wide の day period のデータは `AM`・`PM` なので、出力は `AM/PM` です。en-US で長い形が出ることはありません（spec の `aaaa: 'AM'` も同じ、テストの節）。
2. **157 行目 B は extra が無いと例外**

   en-US のままでは `NG02303: Missing extra locale data` を投げます。115 行目の (\*) の約束どおりです。
3. **B と b の値**

   extra を入れると、0 時は `midnight`、6 時は B が `in the morning`、b が `morning` です。157・160 行目の `mid.`、159・162 行目の `md` は en では出ません（BBBBB は `mi`、bbbbb は `midnight`）。158・161 行目は CLDR の区分の名前を並べたもので、`am`・`pm` は en の extra の区分にありません。
4. **コメントが入れ替わっている**

   764・792 行目の 4 つめの引数 `true` は「extra の区分を使う」です。763 行目の b は `FormStyle.Standalone`、791 行目の B は `FormStyle.Format`。ところが 756 行目（b）のコメントは「midnight, at night」、784 行目（B）は「midnight, night」で、実際の出力（b が `night`、B が `at night`）と入れ替わっています。どちらも「standalone」と書いています。

### 177・179 行目：ZZZZ と、分のあるオフセットの O

📄 `angular/packages/common/src/i18n/format_date.ts` L447–464 （▶ の行: 448–452, 460–463）

```ts
447 │     default:
448 ▶       // This default case is not needed by TypeScript compiler, as the switch is exhaustive.
449 ▶       // However Closure Compiler does not understand that and reports an error in typed mode.
450 ▶       // The `throw new Error` below works around the problem, and the unexpected: never variable
451 ▶       // makes sure tsc still checks this code is unreachable.
452 ▶       const unexpected: never = name;
453 │       throw new RuntimeError(
454 │         RuntimeErrorCode.UNEXPECTED_TRANSLATION_TYPE,
455 │         ngDevMode && `unexpected translation type ${unexpected}`,
456 │       );
457 │   }
458 │ }
459 │ 
460 ▶ /**
461 ▶  * Returns a date formatter that transforms a date and an offset into a timezone with ISO8601 or
462 ▶  * GMT format depending on the width (eg: short = +0430, short:GMT = GMT+4, long = GMT+04:30,
463 ▶  * extended = +04:30)
464 │  */
```

461〜463 行目のコメントは「short = +0430、short:GMT = GMT+4、long = GMT+04:30、extended = +04:30」で、実装とも出力とも合っています。`ZZZZ` は long なので `GMT-08:00` です。説明文の表の 177 行目だけが `GMT-8:00` と書いています（180 行目の `OOOO` は `GMT-08:00`）。462 行目の「GMT+4」は、+04:30 の 30 分を書かない、という意味です。CLDR の short localized GMT は `GMT+4:30` なので、`z`・`O` はインドのような 30 分・45 分のオフセットで分を落とします（4 節の DEMO の `'+0430'`）。

> [!NOTE]
> **さらに深く**
>
> この 2 つを直す PR #69239（2026-06、「fix(common): include minutes in the short GMT timezone format」、177 行目の `GMT-8:00` も `GMT-08:00` に直す）は、レビューで「CLDR はロケールごとに形が違う（fr は UTC+5:30、fi は UTC+5.30）。ちゃんとした日付の i18n には Intl を使ってほしいので、直す価値は低い」とされ、作った人が自分で閉じました（gh で読んだのみ）。表の説明の誤りだけでも、この判断の後で直すかは別の話になります。

448〜452 行目は、到達しない `default` を書く理由です。TypeScript は `switch` が全部を覆うと分かりますが、Closure Compiler の型つきの検査は分からないので、`never` の変数で tsc の検査を残しつつ投げます。同じ形が次の引用にもあります。

📄 `angular/packages/common/src/i18n/format_date.ts` L498–506 （▶ の行: 499–501）

```ts
498 │       default:
499 ▶         throw new RuntimeError(
500 ▶           RuntimeErrorCode.UNKNOWN_ZONE_WIDTH,
501 ▶           ngDevMode && `Unknown zone width "${width}"`,
502 │         );
503 │     }
504 │   };
505 │ }
506 │ 
```

📄 `angular/packages/common/src/i18n/format_date.ts` L344–370 （▶ の行: 345, 348, 350, 360, 362, 364, 366）

```ts
344 │ 
345 ▶ function getDatePart(part: DateType, date: Date): number {
346 │   switch (part) {
347 │     case DateType.FullYear:
348 ▶       return date.getFullYear();
349 │     case DateType.Month:
350 ▶       return date.getMonth();
351 │     case DateType.Date:
352 │       return date.getDate();
353 │     case DateType.Hours:
354 │       return date.getHours();
355 │     case DateType.Minutes:
356 │       return date.getMinutes();
357 │     case DateType.Seconds:
358 │       return date.getSeconds();
359 │     case DateType.FractionalSeconds:
360 ▶       return date.getMilliseconds();
361 │     case DateType.Day:
362 ▶       return date.getDay();
363 │     default:
364 ▶       throw new RuntimeError(
365 │         RuntimeErrorCode.UNKNOWN_DATE_TYPE_VALUE,
366 ▶         ngDevMode && `Unknown DateType value "${part}".`,
367 │       );
368 │   }
369 │ }
370 │ 
```

`getDatePart` は Date の端末の getter を呼ぶだけです（UTC の getter は使わない）。タイムゾーンを渡したときは、先に Date の方をずらしてからこの getter を呼びます（日付の部品の章の 3 節）。350 行目の月は 0 始まりのまま返し、`M` の側で 1 を足します（`dateGetter(DateType.Month, 1, 1)` の 3 つめの引数、日付の部品の章の 1・2 節）。

📄 `angular/packages/common/src/i18n/format_date.ts` L42–66 （▶ の行: 42–46, 49, 60）

```ts
42 ▶ const enum ZoneWidth {
43 ▶   Short,
44 ▶   ShortGMT,
45 ▶   Long,
46 ▶   Extended,
47 │ }
48 │ 
49 ▶ const enum DateType {
50 │   FullYear,
51 │   Month,
52 │   Date,
53 │   Hours,
54 │   Minutes,
55 │   Seconds,
56 │   FractionalSeconds,
57 │   Day,
58 │ }
59 │ 
60 ▶ const enum TranslationType {
61 │   DayPeriods,
62 │   Days,
63 │   Months,
64 │   Eras,
65 │ }
66 │ 
```

42〜47 行目の `ZoneWidth` の 4 つが、上の 461〜463 行目のコメントの 4 つの形です。`const enum` なので、ビルドの後には 0〜3 の数だけが残ります。

## 2. 年・月・曜日の残りの行

📄 `angular/packages/common/src/i18n/format_date.ts` L604–635 （▶ の行: 604–606, 608–610, 618–619, 623–624, 626–628）

```ts
604 ▶     // 2 digit representation of the year, padded (00-99). (e.g. AD 2001 => 01, AD 2010 => 10)
605 ▶     case 'yy':
606 ▶       formatter = dateGetter(DateType.FullYear, 2, 0, true, true);
607 │       break;
608 ▶     // 3 digit representation of the year, padded (000-999). (e.g. AD 2001 => 01, AD 2010 => 10)
609 ▶     case 'yyy':
610 ▶       formatter = dateGetter(DateType.FullYear, 3, 0, false, true);
611 │       break;
612 │     // 4 digit representation of the year (e.g. AD 1 => 0001, AD 2010 => 2010)
613 │     case 'yyyy':
614 │       formatter = dateGetter(DateType.FullYear, 4, 0, false, true);
615 │       break;
616 │ 
617 │     // 1 digit representation of the week-numbering year, e.g. (AD 1 => 1, AD 199 => 199)
618 ▶     case 'Y':
619 ▶       formatter = weekNumberingYearGetter(1);
620 │       break;
621 │     // 2 digit representation of the week-numbering year, padded (00-99). (e.g. AD 2001 => 01, AD
622 │     // 2010 => 10)
623 ▶     case 'YY':
624 ▶       formatter = weekNumberingYearGetter(2, true);
625 │       break;
626 ▶     // 3 digit representation of the week-numbering year, padded (000-999). (e.g. AD 1 => 001, AD
627 ▶     // 2010 => 2010)
628 ▶     case 'YYY':
629 │       formatter = weekNumberingYearGetter(3);
630 │       break;
631 │     // 4 digit representation of the week-numbering year (e.g. AD 1 => 0001, AD 2010 => 2010)
632 │     case 'YYYY':
633 │       formatter = weekNumberingYearGetter(4);
634 │       break;
635 │ 
```

608 行目のコメントは `yyy` の例に「AD 2001 =&gt; 01, AD 2010 =&gt; 10」と書いていますが、これは 604 行目の `yy` の例の写しです。610 行目は `trim` が `false` なので、2001 年は `2001` です（説明文の表の 124 行目の `201, 2017` と合う）。606 行目の `yy` だけが `trim` を `true` にして下 2 桁に切ります。`Y` の側も 624 行目の `YY` だけが `true` です。

📄 `angular/packages/common/src/i18n/format_date.ts` L693–726 （▶ の行: 701–704, 706, 710, 723–724）

```ts
693 │     // Day of the month (1-31)
694 │     case 'd':
695 │       formatter = dateGetter(DateType.Date, 1);
696 │       break;
697 │     case 'dd':
698 │       formatter = dateGetter(DateType.Date, 2);
699 │       break;
700 │ 
701 ▶     // Day of the Week StandAlone (1, 1, Mon, Monday, M, Mo)
702 ▶     case 'c':
703 ▶     case 'cc':
704 ▶       formatter = dateGetter(DateType.Day, 1);
705 │       break;
706 ▶     case 'ccc':
707 │       formatter = dateStrGetter(
708 │         TranslationType.Days,
709 │         TranslationWidth.Abbreviated,
710 ▶         FormStyle.Standalone,
711 │       );
712 │       break;
713 │     case 'cccc':
714 │       formatter = dateStrGetter(TranslationType.Days, TranslationWidth.Wide, FormStyle.Standalone);
715 │       break;
716 │     case 'ccccc':
717 │       formatter = dateStrGetter(
718 │         TranslationType.Days,
719 │         TranslationWidth.Narrow,
720 │         FormStyle.Standalone,
721 │       );
722 │       break;
723 ▶     case 'cccccc':
724 ▶       formatter = dateStrGetter(TranslationType.Days, TranslationWidth.Short, FormStyle.Standalone);
725 │       break;
726 │ 
```

701〜704 行目の `c`・`cc` は `dateGetter(DateType.Day, 1)`、つまり `getDay()` の 0〜6（日曜が 0）をそのまま書きます。149 行目の例の `2` は火曜です。`cc` も 2 桁にはなりません（表の 149 行目も「1 digit」と書いている）。710・724 行目の `FormStyle.Standalone` が、`E`（`Format`）との違いです。en では同じ語ですが、fi のように文の中と単独で語の形が変わる言葉で差が出ます（spec の should support fullDate in finnish、テストの節）。

📄 `angular/packages/common/src/i18n/format_date.ts` L844–855 （▶ の行: 846–847, 852–853）

```ts
844 │ 
845 │     // Fractional second
846 ▶     case 'S':
847 ▶       formatter = dateGetter(DateType.FractionalSeconds, 1);
848 │       break;
849 │     case 'SS':
850 │       formatter = dateGetter(DateType.FractionalSeconds, 2);
851 │       break;
852 ▶     case 'SSS':
853 ▶       formatter = dateGetter(DateType.FractionalSeconds, 3);
854 │       break;
855 │ 
```

`S` は ms を 3 桁にしてから頭の 1 桁を取ります（`formatFractionalSeconds`、日付の部品の章の 2 節）。四捨五入しないので、999 ms の `S` は `9`、`SS` は `99` です（DEMO の 171・172 行目）。

## 3. 名前つきの書式と、例の出力

📄 `angular/packages/common/src/i18n/format_date.ts` L225–236 （▶ の行: 225–226, 231–232）

```ts
225 ▶     case 'shortTime':
226 ▶       formatValue = getLocaleTimeFormat(locale, FormatWidth.Short);
227 │       break;
228 │     case 'mediumTime':
229 │       formatValue = getLocaleTimeFormat(locale, FormatWidth.Medium);
230 │       break;
231 ▶     case 'longTime':
232 ▶       formatValue = getLocaleTimeFormat(locale, FormatWidth.Long);
233 │       break;
234 │     case 'fullTime':
235 │       formatValue = getLocaleTimeFormat(locale, FormatWidth.Full);
236 │       break;
```

📄 `angular/packages/common/src/i18n/format_date.ts` L253–265 （▶ の行: 253–256）

```ts
253 ▶     case 'long':
254 ▶       const longTime = getNamedFormat(locale, 'longTime');
255 ▶       const longDate = getNamedFormat(locale, 'longDate');
256 ▶       formatValue = formatDateTime(getLocaleDateTimeFormat(locale, FormatWidth.Long), [
257 │         longTime,
258 │         longDate,
259 │       ]);
260 │       break;
261 │     case 'full':
262 │       const fullTime = getNamedFormat(locale, 'fullTime');
263 │       const fullDate = getNamedFormat(locale, 'fullDate');
264 │       formatValue = formatDateTime(getLocaleDateTimeFormat(locale, FormatWidth.Full), [
265 │         fullTime,
```

`long` は 254〜256 行目で、`longTime` と `longDate` の書式をロケールの日時の型（en-US では `{1}, {0}`）に差し込みます。名前つきの書式の表の `long`・`full` の例が「at」で、出力が「,」になる話は[DatePipe の章](../cmn/09-cmn-date-pipe.md)の 3 節にあります。

📄 `angular/packages/common/src/pipes/date_pipe.ts` L182–220 （▶ の行: 187–188, 191–195, 202–206）

````ts
182 │  *
183 │  * ### Format examples
184 │  *
185 │  * These examples transform a date into various formats,
186 │  * assuming that `dateObj` is a JavaScript `Date` object for
187 ▶  * year: 2015, month: 6, day: 15, hour: 21, minute: 43, second: 11,
188 ▶  * given in the local time for the `en-US` locale.
189 │  *
190 │  * ```
191 ▶  * {{ dateObj | date }}               // output is 'Jun 15, 2015'
192 ▶  * {{ dateObj | date:'medium' }}      // output is 'Jun 15, 2015, 9:43:11 PM'
193 ▶  * {{ dateObj | date:'shortTime' }}   // output is '9:43 PM'
194 ▶  * {{ dateObj | date:'mm:ss' }}       // output is '43:11'
195 ▶  * {{ dateObj | date:"MMM dd, yyyy 'at' hh:mm a" }}  // output is 'Jun 15, 2015 at 09:43 PM'
196 │  * ```
197 │  *
198 │  * ### Usage example
199 │  *
200 │  * The following component uses a date pipe to display the current date in different formats.
201 │  *
202 ▶  * ```angular-ts
203 ▶  * @Component({
204 ▶  *  selector: 'date-pipe',
205 ▶  *  template: `<div>
206 ▶  *    <p>Today is {{today | date}}</p>
207 │  *    <p>Or if you prefer, {{today | date:'fullDate'}}</p>
208 │  *    <p>The time is {{today | date:'h:mm a z'}}</p>
209 │  *  </div>`
210 │  * })
211 │  * // Get the current date and time as a date-time value.
212 │  * export class DatePipeComponent {
213 │  *   today: number = Date.now();
214 │  * }
215 │  * ```
216 │  *
217 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
218 │  *
219 │  * @publicApi
220 │  */
````

187〜188 行目の「2015 年 6 月 15 日 21:43:11、en-US のローカルの時刻」の Date で、191〜195 行目を本物の `DatePipe` に通します。下の 5 行は、この章の中の小さなコンポーネントのテンプレートに 191〜195 行目と同じ形で書いたものです（`new Date(2015, 5, 15, 21, 43, 11)`。端末の時刻で作って端末の時刻で書くので、どの端末でも同じ文字になります）。

> **🧪 DEMO — 190〜195 行目の例をテンプレートに書く**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-date)

5 つとも文字としては合いますが、`medium` と `shortTime` の `PM` の前は U+202F です（≈ の 2 行）。CLDR 42 から en の時刻の書式が `h:mm a` になったためで、テストで `toBe('9:43 PM')` と書くと落ちます。

202〜215 行目の Usage example は、`imports` に `DatePipe` がありません。今の既定の standalone のコンポーネントとして strict と strictTemplates の ngc にかけると、206〜208 行目の 3 か所が `NG8004: No pipe found with name 'date'` です（テストの節）。`packages/examples/common/pipes/ts/date_pipe.ts` の例のほうは `imports: [DatePipe]` を書いていますが、JSDoc はこのファイルを `{@example}` で引いていません。

📄 `angular/packages/common/src/pipes/date_pipe.ts` L83–91 （▶ の行: 89–91）

```ts
83 │  *
84 │  * @see {@link formatDate}
85 │  *
86 │  *
87 │  * @usageNotes
88 │  *
89 ▶  * The result of this pipe is not reevaluated when the input is mutated. To avoid the need to
90 ▶  * reformat the date on every change-detection cycle, treat the date as an immutable object
91 ▶  * and change the reference when the pipe needs to run again.
```

89〜91 行目は、pure の pipe なので Date を書き換えても出し直さない、の言い換えです（pure の判定は DatePipe の章の 2 節）。

## 4. transform の引数：value と timezone

📄 `angular/packages/common/src/pipes/date_pipe.ts` L231–262 （▶ の行: 232–233, 235–238, 240–243）

```ts
231 │   /**
232 ▶    * @param value The date expression: a `Date` object,  a number
233 ▶    * (milliseconds since UTC epoch), or an ISO string (https://www.w3.org/TR/NOTE-datetime).
234 │    * @param format The date/time components to include, using predefined options or a
235 ▶    * custom format string.  When not provided, the `DatePipe` looks for the value using the
236 ▶    * `DATE_PIPE_DEFAULT_OPTIONS` injection token (and reads the `dateFormat` property).
237 ▶    * If the token is not configured, the `mediumDate` is used as a value.
238 ▶    * @param timezone A timezone offset (such as `'+0430'`). When not provided, the `DatePipe`
239 │    * looks for the value using the `DATE_PIPE_DEFAULT_OPTIONS` injection token (and reads
240 ▶    * the `timezone` property). If the token is not configured, the end-user's local system
241 ▶    * timezone is used as a value.
242 ▶    * @param locale A locale code for the locale format rules to use.
243 ▶    * When not supplied, uses the value of `LOCALE_ID`, which is `en-US` by default.
244 │    * See [Setting your app locale](guide/i18n/locale-id).
245 │    *
246 │    * @see {@link DATE_PIPE_DEFAULT_OPTIONS}
247 │    *
248 │    * @returns A date string in the desired format.
249 │    */
250 │   transform(
251 │     value: Date | string | number,
252 │     format?: string,
253 │     timezone?: string,
254 │     locale?: string,
255 │   ): string | null;
256 │   transform(value: null | undefined, format?: string, timezone?: string, locale?: string): null;
257 │   transform(
258 │     value: Date | string | number | null | undefined,
259 │     format?: string,
260 │     timezone?: string,
261 │     locale?: string,
262 │   ): string | null;
```

📄 `angular/packages/common/src/i18n/format_date.ts` L67–86 （▶ の行: 73–74, 77–78）

```ts
67 │ /**
68 │  * @ngModule CommonModule
69 │  * @description
70 │  *
71 │  * Formats a date according to locale rules.
72 │  *
73 ▶  * @param value The date to format, as a Date, or a number (milliseconds since UTC epoch)
74 ▶  * or an [ISO date-time string](https://www.w3.org/TR/NOTE-datetime).
75 │  * @param format The date-time components to include. See `DatePipe` for details.
76 │  * @param locale A locale code for the locale format rules to use.
77 ▶  * @param timezone The time zone. A time zone offset from GMT (such as `'+0430'`).
78 ▶  * If not specified, uses host system settings.
79 │  *
80 │  * @returns The formatted date string.
81 │  *
82 │  * @see {@link DatePipe}
83 │  * @see [Internationalization (i18n) Guide](guide/i18n)
84 │  *
85 │  * @publicApi
86 │  */
```

232〜233 行目と 73〜74 行目は value を「Date、UTC 起点の ms の数、ISO の日時の文字列」と書きます。238 行目と 77 行目は timezone を「'+0430' のようなオフセット」と書きます。実際に受け付ける形を並べると、説明より広く、しかも読めないと黙って端末の時刻に戻ります（`toDate` と `timezoneToOffset` は日付の書式の章の 6 節・日付の部品の章の 3 節）。

> **🧪 DEMO — value と timezone の形**
>
> 上の「全部を本物で通す」を押すと、このページの列が埋まります。記録は TZ=UTC の Node なので、端末の時刻に戻る行はこのページ（あなたの端末）と記録で違って見えます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-date)

1. **timezone はオフセット以外も読む**

   `'UTC'`・`'GMT'`・`'Z'`・`'GMT+1'`・`'UTC+1'`・`'+1'`・`'EST'` は `Date.parse` が読むので効きます。`'+04:30'` の `:` も消してから読みます。
2. **読めない名前は黙って端末の時刻**

   `'JST'`・`'Asia/Tokyo'` は記録（TZ=UTC）で `12:00 Z`、つまり指定しなかったときと同じです。日本の端末で見ると 21:00 になり、効いているように見えます（issue #48279 の話、日付の部品の章の 3 節）。
3. **value は ISO 以外も読む**

   数の文字列 `'1434369600000'` と、`Date.parse` が読む `'Jun 15, 2015 12:00 GMT'` も通ります。`'2015-06-15'` と `'2015-06'` は「端末の時刻の 0 時」になるので、`'+0000'` で書くと端末によって日付が変わります（記録は TZ=UTC なので 00:00）。
4. **空文字は null、読めない文字列は例外**

   本番ビルドでは例外の文が `NG02100` の番号だけになります（このページの列）。

## 5. ISO の週番号の年と、w の無い Y

> **🧪 DEMO — 年の境目の週**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-date)

ISO 8601 の週は月曜に始まり、1 月 4 日を含む週が第 1 週です。2014-12-29（月）は 2015 年の W01、2016-01-03（日）は 2015 年の W53 です。126〜129 行目の `Y` はこの「週の年」で、`y` の暦の年とは年末年始の数日だけ違います。

だから `'YYYY-MM-dd'` は 2014-12-29 を `2015-12-29` と書いてしまいます。開発モードでは、`Y` があって `w` が無い書式を `NG02300` で止めます（記録の列。`'YYYY'` の 1 文字の部品だけのときは `console.error` だけ。検査の行は日付の書式の章の 5 節）。本番ビルドには検査が無いので、このページの列では `2015-12-29` がそのまま出ます。説明文の表は `Y` を `y` と同じ例の値で並べ、この違いと検査を書いていません。

## 6. ここまでを 1 本に

- 👤 `{{ d | date:'W' }}` — あなたのテンプレート（142 行目の記号）
  - `DatePipe.transform(d, 'W')` — date\_pipe.ts L263 — *timezone が無ければ端末の時刻*
    - `formatDate(d, 'W', locale, tz)` — format\_date.ts L87 — *開発モードなら w の無い Y を止める*
      - `getDateFormatter('W') → weekGetter(1, true)` — L689〜690 — *日曜で切り替わる月の週。最大 6*
      - `getDateFormatter('ZZZZ') → timeZoneGetter(ZoneWidth.Long)` — L461〜463 のコメントの long — *GMT-08:00（表の 177 行目は GMT-8:00）*
      - `getDateFormatter('BBBB') → dateStrGetter(DayPeriods, Wide, Format, true)` — L795〜802 — *extra が無ければ NG02303*

## テストと直し方

| spec | describe / it |
| --- | --- |
| common/test/i18n/format\_date\_spec.ts | describe `formatDate`（66 行目）の should format each component correctly（93 行目）が、記号ごとの出力を表で固めています。そこでは `aaaa: 'AM'`（148 行目）、`BBBBB: 'mi'`（228 行目）、`W: '3'`（120 行目）と、説明文の例ではなく実際の値を期待します。should format with timezones（288 行目）は `ZZZZ` を `/GMT(\+\|-)\d{2}\:30/`（297 行目）で、2 桁の時を期待します。ほかに should throw an error when using YYYY incorrectly（488）・should return correct ISO 8601 week number close to year end/beginning（495）・should support fullDate in finnish, which uses standalone week day（519） |
| common/test/pipes/date\_pipe\_spec.ts | describe `DatePipe`（15 行目）› `supports`（28 行目。should support numeric strings 37・should support ISO string without time 64）・`transform`（73 行目。should take timezone into account with timezone offset 152） |

📄 `手元で走らせたコマンド` L1–3

```
1 │ cd ~/angular-research/angular
2 │ pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
3 │   "--test_arg=--filter=^(DatePipe|Format date)"
```

📄 `結果（2026-11-21）` L1–4

```
1 │ Ran 65 of 667 specs
2 │ 65 specs, 0 failures
3 │ Finished in 0.05 seconds
4 │ //packages/common/test:test                                              PASSED in 0.8s
```

65 件すべて成功です。spec は実際の出力を固めているので、説明文の表の例の値（155・157〜162・177 行目）と spec の期待値は食い違ったまま両方が「正しい」状態です。説明文を直すなら、spec の 93 行目の表の値を写すのが根拠になります。W の 6 を固める it はありません。足すなら describe `formatDate` に「2015-08-31 の W は 6」の 1 行です。

説明文の例は、202〜215 行目を 1 つのファイルにして strict と strictTemplates の ngc にかけ、`NG8004` を 3 件確かめました。直すとしたら、date\_pipe.ts の 142・155・157〜162・177 行目の例の値、203 行目の後ろに `imports: [DatePipe],`、format\_date.ts の 608・680・756・784 行目のコメントです。どれも動きは変わりません。

## 聞かれそうな質問

**Q. date:'aaaa' で「ante meridiem」が出ません。**

en-US の Wide の day period のデータは AM・PM なので、155 行目の例の値は en-US では出ません。spec（format\_date\_spec.ts 148 行目）も `'AM'` を期待しています。

**Q. 'W'（月の週）はいくつまで？**

6 までです。週は日曜で切り替わり、月の 1 日が土曜で 31 日まである月の最終日が 6 週目です（2015-08-31）。142 行目の `1... 5` は足りません。

**Q. 'ZZZZ' と 'OOOO' の違いは？**

どちらも同じ `timeZoneGetter(ZoneWidth.Long)` で、出力は `GMT-08:00` です（日付の部品の章の 1 節）。表の 177 行目の `GMT-8:00` が誤りで、180 行目の `OOOO` の例が正しい形です。

**Q. 'YYYY-MM-dd' が開発では例外、本番では年がずれます。**

`Y` は ISO の週の年です。w の無い `Y` は開発モードの検査が `NG02300` で止めます。本番では検査が無く、2014-12-29 が `2015-12-29` になります。暦の年は `y` です。

**Q. timezone に 'Asia/Tokyo' を渡すと効いているように見えます。**

`Date.parse` が読めない名前は黙って端末のオフセットに戻ります。日本の端末なら日本の時刻が出るので効いて見えるだけで、TZ=UTC の記録では 12:00 Z、つまり無指定と同じでした。

**Q. 'medium' の結果を toBe('Jun 15, 2015, 9:43:11 PM') で比べたら落ちました。**

PM の前が U+202F だからです（3 節）。説明文の例は普通の空白で書いてあります。

## 読み終えて

- 記号の表を通した 63 行のうち、W・aaaa・B/b の 7 行・ZZZZ の 10 行が en-US の出力と違います。spec は実際の値のほうを固めています。
- `z`・`O` は 30 分・45 分のオフセットの分を書きません。直す PR #69239 は「Intl を使ってほしい」で閉じられました。
- timezone と value は説明より多くの形を読み、読めないと黙って端末の時刻に戻ります。
- Usage example は `imports` が無く、今の standalone の既定では `NG8004` です。
- format\_date.ts のコメントにも、608 行目（yyy の例）・680 行目（52 週）・756/784 行目（b と B の入れ替わり）の古い所があります。

---

← 前: [画像のローダーと速さの小道具の説明文](02-cmd-image-loaders.md)  
次: [数と i18n の pipe の説明文：DecimalPipe・PercentPipe・CurrencyPipe・I18nPluralPipe・I18nSelectPipe](04-cmd-number.md) →
