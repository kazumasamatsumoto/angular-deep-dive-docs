[目次](../README.md) › [common の内側](README.md) › 第 7 回 / 全 20 回

# 小さな pipe たち：JsonPipe・SlicePipe・大文字小文字・I18nSelectPipe

> JsonPipe が pure: false である理由と JSON.stringify の引数、SlicePipe が配列と文字列だけを受け取る行（supports）、TitleCasePipe の単語の切り方の正規表現、UpperCasePipe・LowerCasePipe、I18nSelectPipe が Object.hasOwn で mapping を引く行（2026 年 6 月の修正 311aff05aa2）と other への戻り方。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-simple-pipes)

---

`json`・`slice`・`uppercase`・`lowercase`・`titlecase`・`i18nSelect` は、どれも transform が 10 行に満たない小さな pipe です。小さいぶん、「なぜ `pure: false` なのか」「何を受け取ると throw するのか」「単語をどこで切るのか」がそのまま 1〜2 行に書いてあります。この章では 6 つの transform を 1 行ずつ読み、日本語や記号、`"constructor"` のような値を渡したときに何が返るかを、行で言えるようにします。

読む対象は `packages/common/src/pipes/` の `json_pipe.ts`・`slice_pipe.ts`・`case_conversion_pipes.ts`・`i18n_select_pipe.ts` と、それぞれの spec です。pipe が実行時にどう呼ばれるか（pure の比べ、impure が毎回呼ばれる理由）は[第 6 回](06-cmn-pipe-mechanism.md)で読みました。

1. [1. 全体像](01-cmn-overview.md)
2. [2. NgClass と NgStyle](02-cmn-ng-class-style.md)
3. [3. NgForOf](03-cmn-ng-for-of.md)
4. [4. NgIf と NgSwitch](04-cmn-ng-if-switch.md)
5. [5. outlet](05-cmn-outlets.md)
6. [6. pipe の仕組み](06-cmn-pipe-mechanism.md)
7. **7. 小さな pipe**（この章）
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

| pipe | pure | 受け取らない値（throw） | null / undefined |
| --- | --- | --- | --- |
| `JsonPipe` | **false** | なし（`JSON.stringify` 自身が throw することはある） | `'null'` / `undefined` |
| `SlicePipe` | **false** | 文字列と配列以外 | `null` |
| `LowerCasePipe`・`UpperCasePipe`・`TitleCasePipe` | true | 文字列以外 | `null` |
| `I18nSelectPipe` | true | mapping がオブジェクトでない、value が文字列でない | `''` |

表の中身は、以下の節で 1 行ずつ確かめます。throw するときのエラーは、どれも `invalidPipeArgumentError`（コード NG02100。[第 6 回](06-cmn-pipe-mechanism.md)の 7 節）です。

## 1. JsonPipe：pure: false と JSON.stringify(value, null, 2)

📄 `angular/packages/common/src/pipes/json_pipe.ts` L29–42 （▶ の行: 31, 37–38, 40）

```ts
29 │ @Pipe({
30 │   name: 'json',
31 ▶   pure: false,
32 │ })
33 │ export class JsonPipe implements PipeTransform {
34 │   /**
35 │    * @param value A value of any type to convert into a JSON-format string.
36 │    */
37 ▶   transform(value: unknown): string {
38 ▶     ngDevMode && warnIfSignal('JsonPipe', value);
39 │ 
40 ▶     return JSON.stringify(value, null, 2);
41 │   }
42 │ }
```

1. **38 行目：signal なら警告**

   開発モードだけ、signal を渡されたら `console.warn`（[第 6 回](06-cmn-pipe-mechanism.md)の `warnIfSignal`、0d652ba4da6）。signal は関数なので、そのまま 40 行目に行くと `undefined` になります。
2. **40 行目：JSON.stringify(value, null, 2)**

   2 つ目の `null` は replacer（値を書き換える関数）を使わない、3 つ目の `2` は「2 つの空白で字下げする」です。だから出力はいつも複数行で、`<pre>` の中で使うと読めます。`JSON.stringify` の決まりがそのまま出ます：`undefined` と関数のプロパティは消える、`Map` は `{}`、`Date` は `toJSON()` の ISO 文字列、自分を指すオブジェクトは `TypeError`。
3. **37 行目の戻り値の型は string だが**

   `JSON.stringify(undefined)` と `JSON.stringify(() => 1)` は文字列ではなく `undefined` を返すので、transform も `undefined` を返します（DEMO で `typeof` を見られます）。補間 `{{ }}` は `undefined` を空文字として描くので、画面には何も出ません。
4. **31 行目：pure: false**

   デバッグで「オブジェクトの今の中身を見たい」ための pipe なので、同じオブジェクトの中身を書き換えても表示が追いつく必要があります。pure だと参照が同じ限り transform が呼ばれません（第 6 回の 376 行目）。この振る舞いは spec の it `should work with mutable objects` が決めています（テストと直し方）。代わりに、**そのビューが変更検知されるたびに `JSON.stringify` が走ります**。大きなオブジェクトに付けっぱなしにすると遅くなる理由です。

## 2. SlicePipe：配列と文字列だけ

📄 `angular/packages/common/src/pipes/slice_pipe.ts` L50–54 （▶ の行: 52）

```ts
50 │ @Pipe({
51 │   name: 'slice',
52 ▶   pure: false,
53 │ })
54 │ export class SlicePipe implements PipeTransform {
```

📄 `angular/packages/common/src/pipes/slice_pipe.ts` L79–94 （▶ の行: 84, 86, 88–89, 92）

```ts
79 │   transform<T>(
80 │     value: ReadonlyArray<T> | string | null | undefined,
81 │     start: number,
82 │     end?: number,
83 │   ): Array<T> | string | null {
84 ▶     if (value == null) return null;
85 │ 
86 ▶     const supports = typeof value === 'string' || Array.isArray(value);
87 │ 
88 ▶     if (!supports) {
89 ▶       throw invalidPipeArgumentError(SlicePipe, value);
90 │     }
91 │ 
92 ▶     return value.slice(start, end);
93 │   }
94 │ }
```

1. **84 行目：`== null` なら null**

   `undefined` も `null` も `null` を返します（`==` なので両方に当たる）。`@for` に渡すと 0 件になります。
2. **86 行目：supports は 1 行**

   `typeof value === 'string' || Array.isArray(value)`。`length` を持つだけのオブジェクト（array-like）、`Set`、型付き配列（`Uint8Array`）は入りません。
3. **88〜90 行目：それ以外は throw**

   89 行目の `invalidPipeArgumentError(SlicePipe, value)`。開発モードの文は `NG02100: InvalidPipeArgument: '[object Object]' for pipe 'SlicePipe'` のように、値を文字列にしたものとクラスの名前が入ります（このサイトの DEMO では、バンドラがクラスの名前を変えるので `'_SlicePipe'` と出ます）。本番ビルドでは `NG02100` だけです。
4. **92 行目：あとは JavaScript の slice**

   `Array.prototype.slice` か `String.prototype.slice` を呼ぶだけなので、負の数（後ろから数える）、`end` の省略、範囲外の扱いは標準の slice と同じです。配列はいつも**新しい配列**を返します（中身が全部でも）。文字列は UTF-16 の単位で切るので、絵文字のような 2 単位の文字の途中で切れます（DEMO の `"😀ab"`）。

52 行目の `pure: false` は、同じ配列に `push` したときに切り出し直すためです（spec の it `should work with mutable arrays`）。その代わり、`@for (x of items | slice:0:10)` と書くと、変更検知のたびに新しい配列ができます。`@for` の差分の計算（[for-track の章](../template/01-for-track.md)）は track で同じ項目を見分けるので、新しい配列でも DOM は作り直されませんが、毎回の配列のコピーは残ります。

## 3. LowerCasePipe と UpperCasePipe

📄 `angular/packages/common/src/pipes/case_conversion_pipes.ts` L30–45 （▶ の行: 30–31, 37–38, 41–43）

```ts
30 ▶ @Pipe({
31 ▶   name: 'lowercase',
32 │ })
33 │ export class LowerCasePipe implements PipeTransform {
34 │   /**
35 │    * @param value The string to transform to lower case.
36 │    */
37 ▶   transform(value: string): string;
38 ▶   transform(value: null | undefined): null;
39 │   transform(value: string | null | undefined): string | null;
40 │   transform(value: string | null | undefined): string | null {
41 ▶     if (value == null) return null;
42 ▶     assertPipeArgument(LowerCasePipe, value);
43 ▶     return value.toLowerCase();
44 │   }
45 │ }
```

📄 `angular/packages/common/src/pipes/case_conversion_pipes.ts` L108–129 （▶ の行: 119–121, 125–127）

```ts
108 │ @Pipe({
109 │   name: 'uppercase',
110 │ })
111 │ export class UpperCasePipe implements PipeTransform {
112 │   /**
113 │    * @param value The string to transform to upper case.
114 │    */
115 │   transform(value: string): string;
116 │   transform(value: null | undefined): null;
117 │   transform(value: string | null | undefined): string | null;
118 │   transform(value: string | null | undefined): string | null {
119 ▶     if (value == null) return null;
120 ▶     assertPipeArgument(UpperCasePipe, value);
121 ▶     return value.toUpperCase();
122 │   }
123 │ }
124 │ 
125 ▶ function assertPipeArgument(pipe: Type<any>, value: Object): void {
126 ▶   if (typeof value !== 'string') {
127 ▶     throw invalidPipeArgumentError(pipe, value);
128 │   }
129 │ }
```

- 30〜32 行目と 108〜110 行目：`pure` を書いていないので pure です。
- 41・119 行目：`null` と `undefined` は `null`。42・120 行目：125〜129 行目の `assertPipeArgument` が、文字列でなければ throw します（数を渡しても throw。spec の it `should not support numbers`）。`assertPipeArgument` は 2026 年 2 月の 66e8385b6ae で 3 つの pipe から切り出されました。
- 43・121 行目：`toLowerCase()` / `toUpperCase()`。**`toLocaleUpperCase()` ではない**ので、`LOCALE_ID` に関係なく同じ結果です（トルコ語の `i` → `İ` のような言語ごとの規則は使わない）。`'ß'.toUpperCase()` は `'SS'` で、文字数が変わります。
- 37〜39 行目の overload（同じ関数の型の書き分け）は、`string` なら `string`、`null | undefined` なら `null` を返す、という型の約束です。

## 4. TitleCasePipe：単語の切り方

📄 `angular/packages/common/src/pipes/case_conversion_pipes.ts` L47–57 （▶ の行: 48–49, 56–57）

```ts
47 │ //
48 ▶ // Regex below matches any Unicode word and number compatible with ES5. In ES2018 the same result
49 ▶ // can be achieved by using /[0-9\p{L}]\S*/gu and also known as Unicode Property Escapes
50 │ // (https://2ality.com/2017/07/regexp-unicode-property-escapes.html). Since there is no
51 │ // transpilation of this functionality down to ES5 without external tool, the only solution is
52 │ // to use already transpiled form. Example can be found here -
53 │ // https://mothereff.in/regexpu#input=var+regex+%3D+%2F%5B0-9%5Cp%7BL%7D%5D%5CS*%2Fgu%3B%0A%0A&unicodePropertyEscape=1
54 │ //
55 │ 
56 ▶ const unicodeWordMatch =
57 ▶   /(?:[0-9A-Za-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u0870-\u0887\u0889-\u088E\u08A0-\u08C9\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C5D\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D04-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16F1-\u16F8\u1700-\u1711\u171F-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4C\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u31A0-\u31BF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA7CA\uA7D0\uA7D1\uA7D3\uA7D5-\uA7D9\uA7F2-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB69\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF2D-\uDF40\uDF42-\uDF49\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF]|\uD801[\uDC00-\uDC9D\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDD70-\uDD7A\uDD7C-\uDD8A\uDD8C-\uDD92\uDD94\uDD95\uDD97-\uDDA1\uDDA3-\uDDB1\uDDB3-\uDDB9\uDDBB\uDDBC\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67\uDF80-\uDF85\uDF87-\uDFB0\uDFB2-\uDFBA]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE35\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2\uDD00-\uDD23\uDE80-\uDEA9\uDEB0\uDEB1\uDF00-\uDF1C\uDF27\uDF30-\uDF45\uDF70-\uDF81\uDFB0-\uDFC4\uDFE0-\uDFF6]|\uD804[\uDC03-\uDC37\uDC71\uDC72\uDC75\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD44\uDD47\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC00-\uDC34\uDC47-\uDC4A\uDC5F-\uDC61\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE80-\uDEAA\uDEB8\uDF00-\uDF1A\uDF40-\uDF46]|\uD806[\uDC00-\uDC2B\uDCA0-\uDCDF\uDCFF-\uDD06\uDD09\uDD0C-\uDD13\uDD15\uDD16\uDD18-\uDD2F\uDD3F\uDD41\uDDA0-\uDDA7\uDDAA-\uDDD0\uDDE1\uDDE3\uDE00\uDE0B-\uDE32\uDE3A\uDE50\uDE5C-\uDE89\uDE9D\uDEB0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC2E\uDC40\uDC72-\uDC8F\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD30\uDD46\uDD60-\uDD65\uDD67\uDD68\uDD6A-\uDD89\uDD98\uDEE0-\uDEF2\uDFB0]|\uD808[\uDC00-\uDF99]|\uD809[\uDC80-\uDD43]|\uD80B[\uDF90-\uDFF0]|[\uD80C\uD81C-\uD820\uD822\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879\uD880-\uD883][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE70-\uDEBE\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDE40-\uDE7F\uDF00-\uDF4A\uDF50\uDF93-\uDF9F\uDFE0\uDFE1\uDFE3]|\uD821[\uDC00-\uDFF7]|\uD823[\uDC00-\uDCD5\uDD00-\uDD08]|\uD82B[\uDFF0-\uDFF3\uDFF5-\uDFFB\uDFFD\uDFFE]|\uD82C[\uDC00-\uDD22\uDD50-\uDD52\uDD64-\uDD67\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD837[\uDF00-\uDF1E]|\uD838[\uDD00-\uDD2C\uDD37-\uDD3D\uDD4E\uDE90-\uDEAD\uDEC0-\uDEEB]|\uD839[\uDFE0-\uDFE6\uDFE8-\uDFEB\uDFED\uDFEE\uDFF0-\uDFFE]|\uD83A[\uDC00-\uDCC4\uDD00-\uDD43\uDD4B]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDEDF\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF38\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]|\uD884[\uDC00-\uDF4A])\S*/g;
```

57 行目は 1 行で約 1 万文字の正規表現です（横に送ると最後まで読めます）。48〜49 行目のコメントのとおり、これは `/[0-9\p{L}]\S*/gu`（`\p{L}` は Unicode の「文字」全部）を、ES5 で書ける形に展開したものです。読み方は**「数字か文字で始まり、空白でない文字が続くところまで」**。最後の `\S*/g` が「空白（スペース・タブ・改行・全角スペース）が来るまで」です。

📄 `angular/packages/common/src/pipes/case_conversion_pipes.ts` L78–97 （▶ の行: 89–90, 92–94）

```ts
78 │ @Pipe({
79 │   name: 'titlecase',
80 │ })
81 │ export class TitleCasePipe implements PipeTransform {
82 │   /**
83 │    * @param value The string to transform to title case.
84 │    */
85 │   transform(value: string): string;
86 │   transform(value: null | undefined): null;
87 │   transform(value: string | null | undefined): string | null;
88 │   transform(value: string | null | undefined): string | null {
89 ▶     if (value == null) return null;
90 ▶     assertPipeArgument(TitleCasePipe, value);
91 │ 
92 ▶     return value.replace(
93 ▶       unicodeWordMatch,
94 ▶       (txt) => txt[0].toUpperCase() + txt.slice(1).toLowerCase(),
95 │     );
96 │   }
97 │ }
```

1. **92〜93 行目：当たったところを全部置き換える**

   `g` 付きの正規表現なので、文字列の中の「単語」の 1 つずつに 94 行目の関数が呼ばれます。
2. **94 行目：頭を大文字、残りを小文字**

   `txt[0].toUpperCase() + txt.slice(1).toLowerCase()`。`'hello wORLD'` は `'Hello World'` です。

この 2 行から、次の振る舞いがそのまま決まります（DEMO で全部試せます）。

- **空白でしか切らない**：`foo-bar`・`baz_qux`・`one,two` は 1 語。`"it's o'neil"` は `"It's O'neil"`（`'` の後ろは大文字にならない）。
- **頭の記号は飛ばす**：`(angular)` は `(` が「数字か文字」ではないので、当たりは `angular)` から始まり `(Angular)`。
- **数字で始まる語**：`1ST` は当たりが `1` から始まり、`'1'.toUpperCase()` は `'1'` のまま、残りが小文字で `1st`（spec の it `should handle numbers at the beginning of words`）。
- **日本語**：ひらがな・カタカナ・漢字も 57 行目の範囲（`ぁ-ゖ`、`一-ꒌ` など）に入っているので「単語」になりますが、大文字が無いので変わりません。`angular の内側` は `Angular の内側`。全角の英字（`ｈｅｌｌｏ`）は大文字の全角になり、全角スペースも `\S` の外なので語を切ります。
- **1 文字が 2 文字になる**：`ß` で始まる語は `SS…`。`ǆ`（1 文字の dž）は `toUpperCase` で `Ǆ`（全部大文字の形）になり、Unicode の「タイトルケースの形」`ǅ` にはなりません。

## 5. I18nSelectPipe：mapping を Object.hasOwn で引く

📄 `angular/packages/common/src/pipes/i18n_select_pipe.ts` L32–58 （▶ の行: 33, 41–42, 44–45, 48–49, 52–53, 56）

```ts
32 │ @Pipe({
33 ▶   name: 'i18nSelect',
34 │ })
35 │ export class I18nSelectPipe implements PipeTransform {
36 │   /**
37 │    * @param value a string to be internationalized.
38 │    * @param mapping an object that indicates the text that should be displayed
39 │    * for different values of the provided `value`.
40 │    */
41 ▶   transform(value: string | null | undefined, mapping: {[key: string]: string}): string {
42 ▶     if (value == null) return '';
43 │ 
44 ▶     if (typeof mapping !== 'object' || typeof value !== 'string') {
45 ▶       throw invalidPipeArgumentError(I18nSelectPipe, mapping);
46 │     }
47 │ 
48 ▶     if (Object.hasOwn(mapping, value)) {
49 ▶       return mapping[value];
50 │     }
51 │ 
52 ▶     if (Object.hasOwn(mapping, 'other')) {
53 ▶       return mapping['other'];
54 │     }
55 │ 
56 ▶     return '';
57 │   }
58 │ }
```

1. **42 行目：value が無ければ空文字**

   `null` と `undefined` は `''`。ほかの pipe の `null` と違い、空の文字列です。
2. **44〜46 行目：型を確かめる**

   mapping がオブジェクトでないか、value が文字列でなければ throw。`typeof null === 'object'` なので、mapping に `null` を渡すとここは通り、48 行目の `Object.hasOwn(null, …)` が `TypeError` を投げます。
3. **48〜50 行目：value と同じ名前の「自分の」プロパティがあれば、それ**

   `Object.hasOwn(obj, key)` は、プロトタイプ（継承元）をたどらず、そのオブジェクト自身が持つプロパティかだけを答えます。
4. **52〜54 行目：無ければ `other`**

   ICU（翻訳の文の中の場合分け）の `select` と同じく、`other` が受け皿です。
5. **56 行目：`other` も無ければ空文字**

33 行目に `pure` が無いので pure です。同じ mapping のオブジェクトに鍵を足しても、value が同じなら transform は呼ばれません（mapping は新しいオブジェクトにして渡す）。

### 2026 年 6 月の修正 311aff05aa2

📄 `git -C ../angular show 311aff05aa2 -- packages/common/src/pipes/i18n_select_pipe.ts`

```ts
-    if (mapping.hasOwnProperty(value)) {
+    if (Object.hasOwn(mapping, value)) {
       return mapping[value];
     }

-    if (mapping.hasOwnProperty('other')) {
+    if (Object.hasOwn(mapping, 'other')) {
       return mapping['other'];
     }
```

修正の前は `mapping.hasOwnProperty(value)` でした。コミットの本文が挙げる 2 つの場合に壊れます。

- **`Object.create(null)` で作った mapping**：プロトタイプが無いので `hasOwnProperty` というメソッド自体が無く、`TypeError: mapping.hasOwnProperty is not a function`。
- **鍵の名前が `hasOwnProperty`**：mapping の値（文字列や関数）がメソッドを隠してしまい、呼べないか、間違った答えを黙って返す。

`Object.hasOwn(mapping, value)` は `Object` の静的メソッドなので、mapping が何を持っていても同じに動きます。一方、`"constructor"`・`"toString"` のような**継承した名前**は、前の `hasOwnProperty` でも「自分のものではない」と判定されていたので、修正の前も後も `other` に行きます。`JSON.parse` で作った mapping に `"__proto__"` という鍵があれば、それは自分のプロパティなので、その値が返ります（DEMO）。同じコミットで spec に it が 2 つ足されました（テストと直し方）。v22.1.0 から入っていて、このサイトの 22.1.6 にもあります。

## 6. DEMO：本物の pipe に通す

> **🧪 DEMO — このサイトの本物の pipe のクラスを new して transform を呼ぶ**
>
> `new TitleCasePipe()` のように、このサイトの本物の `@angular/common` 22.1.6 の pipe を作り、ボタンを押したときに transform を直接呼びます（テンプレートの変更検知は通さないので、pure かどうかは関係ありません）。throw したら捕まえて、エラーの名前と文を表に出します。I18nSelectPipe の表の「修正前の判定」は、311aff05aa2 の前の 1 行をこの章で移植したものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-simple-pipes)

- TitleCasePipe：`'(angular) "pipes"'` は `'(Angular) "Pipes"'`、`'ß straße'` は `'SS Straße'`、`'one\ttwo'` はタブでも切れて `'One\tTwo'`。
- SlicePipe：`"😀ab"` を 0, 1 で切ると、長さ 1 の壊れた半分（U+D83D）。オブジェクトや数は 89 行目の throw。
- I18nSelectPipe：`constructor`・`toString` は `other`。`__proto__` は JSON の鍵があるのでその値。checkbox で `Object.create(null)` にすると、本物の pipe は答えを返し、「修正前の判定」だけが `TypeError` になります。
- JsonPipe：`undefined` と関数は戻り値の typeof が `undefined`。自分を指すオブジェクトは `TypeError: Converting circular structure to JSON`。

## 7. ここまでを 1 本に

- 👤 `{{ items | slice:-2 }}` — あなたのテンプレート
- `ɵɵpipeBind2(…, items, -2)` — 第 6 回 — *pure: false なのでそのまま呼ぶ*
  - `SlicePipe.transform(items, -2)` — slice\_pipe.ts L79
    - `value == null` → `null` — L84
    - `typeof value === 'string' || Array.isArray(value)` — L86 — *違えば invalidPipeArgumentError（L89）*
    - `value.slice(-2, undefined)` — L92 — *新しい配列*
- 👤 `{{ name | titlecase }}` — あなたのテンプレート
  - `TitleCasePipe.transform(name)` → `name.replace(unicodeWordMatch, txt => txt[0].toUpperCase() + txt.slice(1).toLowerCase())` — case\_conversion\_pipes.ts L92-95
- 👤 `{{ g | i18nSelect: map }}` — あなたのテンプレート
  - `Object.hasOwn(map, g)` → `map[g]`、だめなら `Object.hasOwn(map, 'other')` → `map.other`、だめなら `''` — i18n\_select\_pipe.ts L48-56

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| common/test/pipes/json\_pipe\_spec.ts | describe `JsonPipe`（15 行目）。`should return JSON-formatted string`（40）・`should work with mutable objects`（68） | `//packages/common/test:test`（Node。どの spec にも `isBrowser` で止める行は無い） |
| common/test/pipes/slice\_pipe\_spec.ts | describe `SlicePipe`（15 行目）の `supports`（26）・`transform`（43）・`integration`（93）。`should not support other objects`（37）・`should work with mutable arrays`（104） |   |
| common/test/pipes/case\_conversion\_pipes\_spec.ts | describe `LowerCasePipe`（13 行目）・`TitleCasePipe`（61）・`UpperCasePipe`（152）。`should not treat non-space character as a separator`（93）・`should work properly for non-latin alphabet`（105） |   |
| common/test/pipes/i18n\_select\_pipe\_spec.ts | describe `I18nSelectPipe`（13 行目）。`should work with null-prototype mappings (Object.create(null))`（41）・`should work when hasOwnProperty is shadowed by a mapping key`（49） |   |

📄 `angular/packages/common/test/pipes/json_pipe_spec.ts` L68–79 （▶ の行: 70, 73, 75–76, 78）

```ts
68 │     it('should work with mutable objects', async () => {
69 │       const fixture = TestBed.createComponent(TestComp);
70 ▶       const mutable: number[] = [1];
71 │       fixture.componentInstance.data = mutable;
72 │       await fixture.whenStable();
73 ▶       expect(fixture.nativeElement).toHaveText('[\n  1\n]');
74 │ 
75 ▶       mutable.push(2);
76 ▶       fixture.changeDetectorRef.markForCheck();
77 │       await fixture.whenStable();
78 ▶       expect(fixture.nativeElement).toHaveText('[\n  1,\n  2\n]');
79 │     });
```

75 行目で同じ配列に `push` し、78 行目で表示が追いついています。31 行目の `pure: false` が無ければ、この it は落ちます（参照が同じなので transform が呼ばれない）。

📄 `angular/packages/common/test/pipes/slice_pipe_spec.ts` L104–115 （▶ の行: 106, 111, 114）

```ts
104 │     it('should work with mutable arrays', async () => {
105 │       const fixture = TestBed.createComponent(TestComp);
106 ▶       const mutable: number[] = [1, 2];
107 │       fixture.componentInstance.data = mutable;
108 │       await fixture.whenStable();
109 │       expect(fixture.nativeElement).toHaveText('2');
110 │ 
111 ▶       mutable.push(3);
112 │       fixture.changeDetectorRef.markForCheck();
113 │       await fixture.whenStable();
114 ▶       expect(fixture.nativeElement).toHaveText('2,3');
115 │     });
```

SlicePipe も同じ形で、52 行目の `pure: false` を決めている it です。

📄 `angular/packages/common/test/pipes/case_conversion_pipes_spec.ts` L89–117 （▶ の行: 90, 94–96, 100, 102, 106, 108, 115）

```ts
 89 │   it('should not capitalize letter after the quotes', () => {
 90 ▶     expect(pipe.transform("it's complicated")).toEqual("It's Complicated");
 91 │   });
 92 │ 
 93 │   it('should not treat non-space character as a separator', () => {
 94 ▶     expect(pipe.transform('one,two,three')).toEqual('One,two,three');
 95 ▶     expect(pipe.transform('true|false')).toEqual('True|false');
 96 ▶     expect(pipe.transform('foo-vs-bar')).toEqual('Foo-vs-bar');
 97 │   });
 98 │ 
 99 │   it('should support support all whitespace characters', () => {
100 ▶     expect(pipe.transform('one\ttwo')).toEqual('One\tTwo');
101 │     expect(pipe.transform('three\rfour')).toEqual('Three\rFour');
102 ▶     expect(pipe.transform('five\nsix')).toEqual('Five\nSix');
103 │   });
104 │ 
105 │   it('should work properly for non-latin alphabet', () => {
106 ▶     expect(pipe.transform('føderation')).toEqual('Føderation');
107 │     expect(pipe.transform('poniedziałek')).toEqual('Poniedziałek');
108 ▶     expect(pipe.transform('éric')).toEqual('Éric');
109 │   });
110 │ 
111 │   it('should handle numbers at the beginning of words', () => {
112 │     expect(pipe.transform('frodo was 1st and bilbo was 2nd')).toEqual(
113 │       'Frodo Was 1st And Bilbo Was 2nd',
114 │     );
115 ▶     expect(pipe.transform('1ST')).toEqual('1st');
116 │   });
117 │ 
```

94〜96 行目が「空白でしか切らない」（57 行目の `\S*`）、100〜102 行目が「タブ・CR・改行も空白」、106〜108 行目が「ラテン文字以外も文字」（57 行目の範囲）、115 行目が「数字で始まる語」です。

📄 `angular/packages/common/test/pipes/i18n_select_pipe_spec.ts` L41–55 （▶ の行: 42, 46, 51, 54）

```ts
41 │     it('should work with null-prototype mappings (Object.create(null))', () => {
42 ▶       const nullProtoMapping = Object.assign(Object.create(null), {
43 │         greeting: 'hello',
44 │         other: 'fallback',
45 │       }) as {[key: string]: string};
46 ▶       expect(pipe.transform('greeting', nullProtoMapping)).toEqual('hello');
47 │     });
48 │ 
49 │     it('should work when hasOwnProperty is shadowed by a mapping key', () => {
50 │       const shadowedMapping = {
51 ▶         hasOwnProperty: () => false,
52 │         greeting: 'hello',
53 │       } as unknown as {[key: string]: string};
54 ▶       expect(pipe.transform('greeting', shadowedMapping)).toEqual('hello');
55 │     });
```

311aff05aa2 で足した 2 つの it です。コミットの本文のとおり、修正の前のコードでは 46 行目が `TypeError`、54 行目が 51 行目の偽の `hasOwnProperty` のせいで `''` になり、落ちます。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/common/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=JsonPipe|SlicePipe|LowerCasePipe|UpperCasePipe|TitleCasePipe|I18nSelectPipe'
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/cmn-logs/b-simple.log）`

```
Ran 58 of 667 specs
58 specs, 0 failures
Finished in 0.059 seconds
//packages/common/test:test                                              PASSED in 0.8s
INFO: Elapsed time: 8.269s
```

- 58 件 = 6 つの describe の it の合計（JsonPipe 5・SlicePipe 16・LowerCasePipe 7・TitleCasePipe 15・UpperCasePipe 7・I18nSelectPipe 8）。

### 直すとしたら

- どれも transform の数行がすべてです：JsonPipe は json\_pipe.ts 40 行目、SlicePipe は 84〜92 行目、大文字小文字は 41〜43・89〜95・119〜121 行目と `assertPipeArgument`、I18nSelectPipe は 42〜56 行目。
- it は各 spec の describe `transform` の形（`new XxxPipe()` して `expect(pipe.transform(…)).toEqual(…)`）で足せます。DI も TestBed も要りません。
- 最近の修正：311aff05aa2（2026-06、I18nSelectPipe の `Object.hasOwn`）、66e8385b6ae（2026-02、`assertPipeArgument` の切り出し）、0d652ba4da6（2026-02、JsonPipe の signal の警告）、c5da47f63f8（2026-03、`any` を厳しい型に。JsonPipe の引数が `unknown` になった）。
- 本家に PR を出すことは勧めません。この pipe たちの issue を読むときは、まず「JavaScript の標準の関数（`JSON.stringify`・`slice`・`toUpperCase`）の決まりそのものか、pipe の数行の判定か」を分けます（[第 20 回](20-cmn-issues.md)）。

## 聞かれそうな質問

**Q. JsonPipe と SlicePipe は、なぜ pure: false なのですか？**

同じオブジェクト・配列の中身を書き換えても表示を追いつかせるためです（31 行目・52 行目）。pure だと第 6 回の 376 行目が参照を `Object.is` で比べ、同じなら呼ばないので、`push` が反映されません。spec の it `should work with mutable objects`・`should work with mutable arrays` がこれを確かめています。

**Q. titlecase で "foo-bar" が "Foo-Bar" になりません。**

57 行目の正規表現が「文字か数字で始まり、空白でない文字が続く」で 1 語なので、`-` では切りません。`foo-bar` は 1 語で、94 行目が頭だけ大文字にして残りを小文字にします。ハイフンで切りたいなら自分の pipe を書きます。

**Q. uppercase は LOCALE\_ID で変わりますか？**

変わりません。121 行目は `toUpperCase()` で、`toLocaleUpperCase()` ではないからです。DatePipe などと違い、コンストラクタで `LOCALE_ID` も受け取っていません。

**Q. slice に Set や array-like を渡すとどうなりますか？**

86 行目の supports が `typeof value === 'string' || Array.isArray(value)` だけなので、89 行目で NG02100 を投げます。`Array.from(set)` にしてから渡します。`null` と `undefined` は 84 行目で `null` です。

**Q. i18nSelect に "constructor" を渡すと、Object のコンストラクタが返りませんか？**

返りません。48 行目の `Object.hasOwn` は継承したプロパティを見ないので、`other` に行きます。修正 311aff05aa2 の前の `hasOwnProperty` でも同じでした。修正が直したのは `Object.create(null)` の mapping と、`hasOwnProperty` という鍵の場合です。

## 読み終えて

- JsonPipe は `JSON.stringify(value, null, 2)` の 1 行で、`pure: false`。`undefined` を返すことがある。
- SlicePipe は文字列と配列だけを受け取り（86 行目）、あとは標準の slice。`pure: false` で毎回新しい配列を返す。
- 大文字小文字は `toUpperCase`・`toLowerCase` で、ロケールに関係ない。TitleCasePipe は「文字か数字で始まり空白まで」を 1 語にして、頭だけ大文字にする。
- I18nSelectPipe は `Object.hasOwn` で自分のプロパティだけを引き、無ければ `other`、それも無ければ空文字。

---

← 前: [pipe の仕組み：ɵɵpipeBind と pure pipe のキャッシュ](06-cmn-pipe-mechanism.md)  
次: [KeyValuePipe：オブジェクトと Map を並べる](08-cmn-keyvalue-pipe.md) →
