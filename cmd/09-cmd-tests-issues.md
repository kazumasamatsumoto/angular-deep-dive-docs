[目次](../README.md) › [common の説明文の読み残し](README.md) › 第 9 回 / 全 9 回

# spec と issue を読む：common の説明文を固めているもの

> packages/common/test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか、手元での走らせ方と結果、area: common の開いている issue のうち説明文に当たるものの表と、このシリーズで見つけた食い違い。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-tests-issues)

---

この章で分かること：第 1〜8 回で読んだ `@angular/common` の説明文（angular.dev の API リファレンスになる JSDoc と、`{@example}` が指す `packages/examples/common` の例）の約束を、`packages/common/test` のどの spec が固めているか、固めていないのはどれか。手元で走らせた target と件数。area: common の issue のうち、このシリーズの説明文に当たるもの。そして、このシリーズで見つけた説明と実装の食い違い・不具合の一覧です。

読む対象は `packages/common/test/` の spec と `packages/common/src/errors.ts`（../angular、8576f161ae4）、2026-11-21 に取った area: common の開いている issue 26 件と、docs などの語を含む 150 件です。spec の読み方と 1 本だけ走らせる方法は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、common の issue の地図は[common の issue の章](../cmn/20-cmn-issues.md)にあります。

1. [1. NgOptimizedImage](01-cmd-image.md)
2. [2. 画像のローダー](02-cmd-image-loaders.md)
3. [3. 日付の書式](03-cmd-date.md)
4. [4. 数と i18n の pipe](04-cmd-number.md)
5. [5. 構造ディレクティブ](05-cmd-structural.md)
6. [6. NgClass・NgStyle と outlet](06-cmd-attr-outlets.md)
7. [7. AsyncPipe と小さな pipe](07-cmd-pipes.md)
8. [8. Location](08-cmd-location.md)
9. **9. spec と issue**（この章）

## 1. 走らせ方と件数

packages/common/test/BUILD.bazel は、`glob(["**/*.ts"])` の `test_lib` を Node の `:test`（`zoneless_jasmine_test`）と web の `:test_web`（`zoneless_web_test_suite`、Chromium と Firefox）で走らせます（ファイルの読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)）。../angular で `pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all` は `667 specs, 0 failures`、PASSED でした。web の suite は Chromium・Firefox とも 676 passed・2 failed で、落ちたのはどちらも日付の spec です（2 節）。web の数が 11 本多いのは、`scrollToAnchor` の it のように `isNode` で Node では飛ばす spec があるからです（viewport\_scroller\_spec.ts L52〜58、[ViewportScroller の章](../cmn/19-cmn-viewport-scroller.md)）。

Node の `:test` を `--test_arg=--filter=<名前>` で describe の名前に絞った数は次のとおりで、どれも 0 failures です。filter は正規表現の部分一致なので、`^` で頭に寄せています。

| --filter | 件数 | spec のファイル（packages/common/test/） | 章 |
| --- | --- | --- | --- |
| `^Image directive` | 151 | directives/ng\_optimized\_image\_spec.ts | [1](01-cmd-image.md) |
| `^Built-in image directive loaders` | 53 | image\_loaders/image\_loader\_spec.ts | [2](02-cmd-image-loaders.md) |
| `^(DatePipe\|Format date)` | 65 | pipes/date\_pipe\_spec.ts・i18n/format\_date\_spec.ts | [3](03-cmd-date.md) |
| `^(Number pipes\|Format number\|I18nPluralPipe\|I18nSelectPipe\|l10n)` | 61 | pipes/number\_pipe\_spec.ts ほか | [4](04-cmd-number.md) |
| `^ngIf directive` / `^ngFor ` / `^NgSwitch` / `^ngPlural` | 15 / 34 / 12 / 8 | directives/ng\_if\_spec.ts・ng\_for\_spec.ts・ng\_switch\_spec.ts・ng\_plural\_spec.ts | [5](05-cmd-structural.md) |
| `^binding to CSS class list` / `^NgStyle` | 40 / 15 | directives/ng\_class\_spec.ts・ng\_style\_spec.ts | [6](06-cmd-attr-outlets.md) |
| `^NgTemplateOutlet` / `^insert/remove` / `^inputs ` | 28 / 15 / 3 | directives/ng\_template\_outlet\_spec.ts・ng\_component\_outlet\_spec.ts | [6](06-cmd-attr-outlets.md) |
| `^AsyncPipe` / `^SlicePipe` / `^KeyValuePipe` / `^defaultComparator` | 24 / 16 / 31 / 7 | pipes/async\_pipe\_spec.ts・slice\_pipe\_spec.ts・keyvalue\_pipe\_spec.ts | [7](07-cmd-pipes.md) |
| `^TitleCasePipe` / `^LowerCasePipe` / `^UpperCasePipe` / `^JsonPipe` | 15 / 7 / 7 / 5 | pipes/case\_conversion\_pipes\_spec.ts・json\_pipe\_spec.ts | [7](07-cmd-pipes.md) |
| `^Location Class` / `^BrowserViewportScroller` / `provideLocationMocks` | 22 / 4 / 1 | location/location\_spec.ts・viewport\_scroller\_spec.ts・location/provide\_location\_mocks\_spec.ts | [8](08-cmd-location.md) |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ。2026-11-21
$ pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all
667 specs, 0 failures
//packages/common/test:test                                     PASSED

# 名前で絞る（Node の jasmine。一致が 0 件でも PASSED なので Ran の行を見る）
$ pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<名前>"

# web の suite（Chromium と Firefox）
$ pnpm bazel test //packages/common/test:test_web --nocache_test_results --test_output=errors
Chromium: 676 passed, 2 failed
Firefox:  676 passed, 2 failed
 ❌ Format date > formatDate > should format invalid in IE ISO date
      Expected 'Jan 12, 2017' to equal 'Jan 11, 2017'.
 ❌ DatePipe > transform > should give precedence to the passed in timezone over the default one
      Expected 'Jan 10, 2017' to equal 'Jan 11, 2017'.
//packages/common/test:test_web_chromium                        FAILED
//packages/common/test:test_web_firefox                         FAILED

# --test_env=TZ=UTC を足しても同じ 2 本が落ちる（このマシンの時刻帯は JST、+0900）
```

## 2. web の suite で落ちる 2 本：マシンの時刻帯

📄 `angular/packages/common/test/i18n/format_date_spec.ts` L372–382 （▶ の行: 373–375）

```ts
372 │ 
373 ▶     it('should format invalid in IE ISO date', () =>
374 ▶       expect(formatDate('2017-01-11T12:00:00.014-0500', defaultFormat, ɵDEFAULT_LOCALE_ID)).toEqual(
375 ▶         'Jan 11, 2017',
376 │       ));
377 │ 
378 │     it('should format invalid in Safari ISO date', () =>
379 │       expect(formatDate('2017-01-20T12:00:00+0000', defaultFormat, ɵDEFAULT_LOCALE_ID)).toEqual(
380 │         'Jan 20, 2017',
381 │       ));
382 │ 
```
*web の suite で落ちる 1 本目*

374 行目の `'2017-01-11T12:00:00.014-0500'` は UTC の 17:00 で、時刻帯を指定しない `formatDate` はマシンの時刻帯で日付を出します。このマシン（JST、+0900）では翌日の 02:00 なので `'Jan 12, 2017'` になり、375 行目の `'Jan 11, 2017'` と合いません。もう 1 本の date\_pipe\_spec.ts L169〜171（[DatePipe の章](../cmn/09-cmn-date-pipe.md)が引用）も、オフセットの無い `'2017-01-11T00:00:00'` をマシンの時刻帯で読むので、JST では UTC の前日 15:00 になり、`'+0100'` で出すと `'Jan 10, 2017'` です。Node の `:test` ではこの 2 本も通り（`^(DatePipe|Format date)` の 65 本が 0 failures）、web の suite のブラウザーでだけ落ちます。`--test_env=TZ=UTC` を足しても、2 本とも同じ文で落ちました。どちらの spec も、走らせるマシンの時刻帯が UTC から大きく東にずれていない、という前提に立っています（日付の書式の読み方は[第 3 回](03-cmd-date.md)）。

## 3. 約束と spec の表

📄 `angular/packages/common/test/pipes/slice_pipe_spec.ts` L43–51 （▶ の行: 44–45, 48–49）

```ts
43 │   describe('transform', () => {
44 ▶     it('should return null if the value is null', () => {
45 ▶       expect(pipe.transform(null, 1)).toBe(null);
46 │     });
47 │ 
48 ▶     it('should return null if the value is undefined', () => {
49 ▶       expect(pipe.transform(undefined, 1)).toBe(null);
50 │     });
51 │ 
```
*説明文と逆の向きを固めている spec（第 7 回）*

48〜49 行目は「`undefined` なら `null`」を固めます。`SlicePipe` の説明文の L27 は「blank な値なら blank な値を返す」なので、spec は実装の方に合わせて書かれています。

📄 `angular/packages/common/test/location/location_spec.ts` L252–268 （▶ の行: 252–256, 266）

```ts
252 ▶   describe('location.normalize(url) should return only route', () => {
253 ▶     const basePath = '/en';
254 ▶     const route = '/go/to/there';
255 ▶     const url = basePath + route;
256 ▶     const getBaseHref = (origin: string) => origin + basePath + '/';
257 │ 
258 │     it('in case APP_BASE_HREF starts with http:', () => {
259 │       const origin = 'http://example.com';
260 │       const baseHref = getBaseHref(origin);
261 │ 
262 │       TestBed.configureTestingModule({providers: [{provide: APP_BASE_HREF, useValue: baseHref}]});
263 │ 
264 │       const location = TestBed.inject(Location);
265 │ 
266 ▶       expect(location.normalize(url)).toBe(route);
267 │     });
268 │ 
```
*「route だけを返す」を固める describe（第 8 回）*

252 行目の describe の名前は「`normalize(url)` は route だけを返す」で、255 行目の base path `/en` を外した `/go/to/there` を 266 行目で確かめます。`Location` のクラスの説明（location.ts L39〜44）の「正規化された URL は base href を含む」とは逆です。

📄 `angular/packages/common/test/directives/ng_plural_spec.ts` L48–64 （▶ の行: 48, 52–53, 59, 63）

```ts
48 ▶   it('should display the template according to the exact numeric value', async () => {
49 │     const template =
50 │       '<div>' +
51 │       '<ul [ngPlural]="switchValue">' +
52 ▶       '<ng-template ngPluralCase="0"><li>you have no messages.</li></ng-template>' +
53 ▶       '<ng-template ngPluralCase="1"><li>you have one message.</li></ng-template>' +
54 │       '</ul></div>';
55 │ 
56 │     fixture = createTestComponent(template);
57 │ 
58 │     getComponent().switchValue = 0;
59 ▶     await waitForStableAndExpectText('you have no messages.');
60 │ 
61 │     getComponent().switchValue = 1;
62 │     fixture.changeDetectorRef.markForCheck();
63 ▶     await waitForStableAndExpectText('you have one message.');
64 │   });
```
*説明文に無い形を固めている spec（第 5 回）*

📄 `angular/packages/common/test/pipes/keyvalue_pipe_spec.ts` L212–225 （▶ の行: 212, 216–217, 222–223）

```ts
212 ▶     it('should order by numerical', () => {
213 │       const pipe = new KeyValuePipe(defaultKeyValueDiffers);
214 │       expect(
215 │         pipe.transform(
216 ▶           new Map([
217 ▶             [2, 1],
218 │             [1, 1],
219 │           ]),
220 │         ),
221 │       ).toEqual([
222 ▶         {key: 1, value: 1},
223 ▶         {key: 2, value: 1},
224 │       ]);
225 │     });
```
*数のキーを数の順に並べる spec（第 7 回）*

📄 `angular/packages/common/test/directives/ng_for_spec.ts` L320–330 （▶ の行: 320, 325, 327）

```ts
320 ▶     it('should track by identity when trackBy is to `null` or `undefined`', () => {
321 │       // TODO(vicb): expect no warning message when we have a proper log service
322 │       const template = `<p *ngFor="let item of items; trackBy: value">{{ item }}</p>`;
323 │       fixture = createTestComponent(template);
324 │       fixture.componentInstance.items = ['a', 'b', 'c'];
325 ▶       fixture.componentInstance.value = null;
326 │       detectChangesAndExpectText('abc');
327 ▶       fixture.componentInstance.value = undefined;
328 │       detectChangesAndExpectText('abc');
329 │     });
330 │ 
```
*null の trackBy を許す spec と、入力の型（第 5 回）*

52〜53 行目の `ngPluralCase="0"` は `=` を付けない数で、説明文（ng\_plural.ts L37〜40）は「`=` で始まる値だけが値の一致」と書きます。216〜217 行目と 222〜223 行目は Map の数のキーを `1`・`2` の数の順に並べ、説明文（keyvalue\_pipe.ts L41）の「Unicode の値」とは書き方が違います。325・327 行目は `trackBy` に `null`・`undefined` を渡せることを固めますが、`ngForTrackBy` の入力の型は `TrackByFunction<T>` だけで（ng\_for\_of.ts L208）、strictTemplates では `null` を入れたフィールドを束縛すると TS2322 になりました（第 5 回のデモを作るときにこのサイトの build で）。spec の `value` は型の付かないフィールドです。

次の表は、このシリーズで確かめた説明文の約束と、それを固める spec です。「無い」は、grep と読み比べで見つからなかったものです。

| 章 | 説明文の約束 | spec（packages/common/test/ から） |
| --- | --- | --- |
| [3](03-cmd-date.md) | W（月の中の週）は 1〜5 | 無い（6 になる日の it は無い） |
| [5](05-cmd-structural.md) | `*ngIf` の条件は Boolean に直す | ng\_if\_spec.ts は真偽と配列の長さ。`0`・`''` の it は無い |
| [5](05-cmd-structural.md) | default は最後に置く | ng\_switch\_spec.ts の `should allow defaults before cases`（216）が先頭の default を固める |
| [5](05-cmd-structural.md) | NgPlural の例（other が無い） | 例外は i18n/localization\_spec.ts の 182。説明文の例そのものを描く it は無い |
| [6](06-cmd-attr-outlets.md) | NgStyle の単位 | ng\_style\_spec.ts の 85・224（`px` だけ）。単位を取らないプロパティは無い |
| [6](06-cmd-attr-outlets.md) | `ngComponentOutletInjector` の既定 | 無い（同じ要素の providers を読む it は無い。232 は injector を渡す場合） |
| [6](06-cmd-attr-outlets.md) | `ngTemplateOutletContext` は object | `null`・`undefined` は 128・136。object でない値は無い |
| [7](07-cmd-pipes.md) | AsyncPipe の切り替えと解除 | async\_pipe\_spec.ts の 89・221・257。切り替えた直後の `null` を名指しする it は無い |
| [7](07-cmd-pipes.md) | KeyValuePipe の `null`（入力の順） | keyvalue\_pipe\_spec.ts の 258・273。挿入の順だけが変わった Map（#72114）は無い（PR #72115 が足す） |
| [7](07-cmd-pipes.md) | titlecase の区切り | case\_conversion\_pipes\_spec.ts の 89・93・99・111。頭が記号の語は無い |
| [7](07-cmd-pipes.md) | JsonPipe は JSON の文字列 | json\_pipe\_spec.ts の 50。文字列にならない値は無い |
| [8](08-cmd-location.md) | HashLocationStrategy・末尾のスラッシュの戦略 | packages/common/test には無い（router/test の integration と trailing\_slash\_integration.spec.ts） |
| [8](08-cmd-location.md) | ViewportScroller の name と offset | viewport\_scroller\_spec.ts の 76・131（web の suite だけで走る） |
| 全体 | 説明文の中の ```` ```html ````・```` ```ts ```` の例がコンパイルできること | 無い。`{@example}` の例のファイルは packages/examples の build でコンパイルされる。第 5〜8 回が使った例のファイル 11 個はどれも strictTemplates の ngc に通り、説明文の中の例では ng\_class.ts の L44 だけが通らなかった（第 1 回の Step 1 の例と第 3 回の DatePipe の例も通らない） |

## 4. エラーの番号

📄 `angular/packages/common/src/errors.ts` L46–64 （▶ の行: 46, 52, 54–55, 59, 63–64）

```ts
46 ▶   // Image directive errors
47 │   UNEXPECTED_SRC_ATTR = 2950,
48 │   UNEXPECTED_SRCSET_ATTR = 2951,
49 │   INVALID_INPUT = 2952,
50 │   UNEXPECTED_INPUT_CHANGE = 2953,
51 │   REQUIRED_INPUT_MISSING = 2954,
52 ▶   LCP_IMG_MISSING_PRIORITY = 2955,
53 │   PRIORITY_IMG_MISSING_PRECONNECT_TAG = 2956,
54 ▶   UNEXPECTED_DEV_MODE_CHECK_IN_PROD_MODE = 2958,
55 ▶   INVALID_LOADER_ARGUMENTS = 2959,
56 │   OVERSIZED_IMAGE = 2960,
57 │   TOO_MANY_PRELOADED_IMAGES = 2961,
58 │   MISSING_BUILTIN_LOADER = 2962,
59 ▶   MISSING_NECESSARY_LOADER = 2963,
60 │   LCP_IMG_NGSRC_MODIFIED = 2964,
61 │   OVERSIZED_PLACEHOLDER = 2965,
62 │   TOO_MANY_PRIORITY_ATTRIBUTES = 2966,
63 ▶   PLACEHOLDER_DIMENSION_LIMIT_EXCEEDED = 2967,
64 ▶ }
```

errors.ts の前半（L9〜45、[common の全体像の章](../cmn/01-cmn-overview.md)が引用）には、このシリーズで出会った NG02000（ngSwitch の外のケース）・NG02020（then が TemplateRef でない）・NG02100（pipe に渡せない値）・NG02200（`-2200`、負の番号なので開発モードの文に解説のリンクが付く）・NG02308（複数形のケースが無い）・NG02400（scroll restoration）があります。46〜64 行目は画像のディレクティブの番号で、[第 1 回](01-cmd-image.md)・[第 2 回](02-cmd-image-loaders.md)が開発モードの文を記録しています。54 行目の 2958 の前に 2957 がありません（欠番）。本番では、どの番号も文を `ngDevMode && …` で作るので、番号だけ（`NG02308`）になり、確かめ自体を開発モードだけで行うものは別の例外（NgSwitchCase の `TypeError`、NgForOf の `NG0901`）に変わります（[第 5 回](05-cmd-structural.md)の DEMO 2）。

## 5. issue の表

issues-open.json（area: common の開いている 26 件）と issues-docs.json（docs などの語を含む 150 件、閉じたものも）から、このシリーズの説明文に当たるものを選び、状態は `gh issue view` で読みました（2026-11-21、読むだけ）。

| issue | 状態 | 中身 | 当たる説明文と章 |
| --- | --- | --- | --- |
| #55762 | 開 | Blob と data URL を弾く検査を戻すか、理由を説明文に書いてほしい | ngSrc の検査の説明。[1](01-cmd-image.md) |
| #59495 | 開 | `assertNoComplexSizes` を外したい | sizes の検査。[1](01-cmd-image.md) |
| #69636・#60133 | 開 | fill の画像の NG02952「高さが 0」が、キャッシュやテストで誤って出る | fill の説明と検査。[1](01-cmd-image.md) |
| #57145・#51261 | 開 | 決めた srcset を使いたい、falsy の ngSrcset で既定に戻したい | ngSrcset の説明。[1](01-cmd-image.md) |
| #53309・#50928・#56466 | 開 | 独自のローダーの細かい制御、Observable のローダー、Cloudinary の動画 | ローダーの説明。[2](02-cmd-image-loaders.md) |
| #53277 | 閉 | 組み込みのローダーの説明を足してほしい | ローダーの一覧（第 1 回で見つけた Netlify の抜けとつながる）。[2](02-cmd-image-loaders.md) |
| #48279・#69899 | 開 | IANA の時刻帯の名前、Temporal | timezone に渡せる形。[3](03-cmd-date.md) |
| #54156 | 閉 | ngSwitchCase の説明が「loose equality」のまま | 4a44f732889（#54158）で ng\_switch.ts L195〜196 の `===` を書き足して閉じた。[5](05-cmd-structural.md) |
| #47578 | 閉 | ngSwitchDefault を ngIf で包むと既定がずれる | ng\_switch.ts L94 の「入れ子の例」。[NgSwitch の章](../cmn/04-cmn-ng-if-switch.md)が再現。[5](05-cmd-structural.md) |
| #35650 | 開 | strict では通るのに fullTemplateTypeCheck では通らないテンプレート | 説明文の例を strictTemplates で確かめるとき（5〜8 回） |
| #15360 | 開 | NgComponentOutlet で作ったコンポーネントの output を受けたい | 5 つの選択肢（inputs はあるが outputs は無い）。[6](06-cmd-attr-outlets.md) |
| #24515 | 閉 | 同じ形の context に替えると前の context が書き換わる | context の Proxy。spec 303。[6](06-cmd-attr-outlets.md) |
| #72114 | 開 | `keyvalue: null` で、挿入の順だけ変わった Map の並びが変わらない | keyvalue\_pipe.ts L43「入力の自然な順」。22.2.6 で再現。PR #72115（開、2026-11-19）が transform と spec を直す。[7](07-cmd-pipes.md) |
| #71893 | 閉 | compareFn を null に替えても前の並びが残る | fb705aad90（22.2.6）・622a7c7f29d（main）で直った。[7](07-cmd-pipes.md) |
| #43727・#16982 | 開・閉 | AsyncPipe の最初の値が `null`（型で困る、`undefined` にしたい） | async\_pipe.ts L146 の `_latestValue = null`。[7](07-cmd-pipes.md) |
| #16586 | 閉 | titlecase が `'` の後ろを大文字にする | 直った（spec 89）。case\_conversion\_pipes.ts L63「空白で区切る」の今の形。[7](07-cmd-pipes.md) |
| #20167 | 開 | `Location.go` に外の URL を渡すと黙って失敗する | location.ts L163〜164 の go の説明（URL の正規化）。[8](08-cmd-location.md) |
| #50733 | 開 | `onPopState` を `APP_BASE_HREF` で絞るべきか | `APP_BASE_HREF` の説明（location\_strategy.ts L54〜80）。[8](08-cmd-location.md) |
| #48783 | 閉 | HashLocationStrategy の base href が空 | hash の中に `APP_BASE_HREF` が入る、を説明文が書かない（第 8 回の 6 節）。[8](08-cmd-location.md) |
| #20406 | 閉 | `Location.subscribe` の型と説明が違う | 同じ `subscribe` の `@param` 名の誤りは main の 6e024600e0b で直った。[8](08-cmd-location.md) |
| #55383・#48542・#69979 | 開 | scroll-margin、入れ子の shadow DOM、スクロールの終わりを知りたい | ViewportScroller の説明（#55383 の PR #70509 は 2026-09-02 に閉じた）。[8](08-cmd-location.md) |

このシリーズの食い違いのうち、同じことを書いた issue と PR は、#72114（PR #72115）のほかには見つかりませんでした（GitHub の検索 API を、`ngFor parent cloned templates`・`ngPlural other example`・`font-style.em`・`ngComponentOutlet injector parentInjector`・`normalized URL base href Location docs`・`BrowserPlatformLocation platform-browser`・`SlicePipe undefined null`・`KeyValuePipe Unicode point`・`TitleCasePipe whitespace delimited`・`JsonPipe undefined`・`setHistoryScrollRestoration` などの語で、2026-11-21 に読むだけで実行）。第 3 回の `GMT+4:30` を直す PR #69239 は作者が閉じています。

## 6. このシリーズで見つけたもの（食い違いと不具合）

どれも 8576f161ae4 の行を読み、本物の @angular/common 22.2.6（ページのデモと Node の記録）か、説明文の例をそのまま取り出したファイルの型検査（サイトの compiler-cli、`--strict`・`strictTemplates`）で確かめたものです。「main」は ../angular の origin/main（d201dd76ef2、2026-11-20）で、直っていなければ「main 同じ」と書きました。第 1〜4 回の行は、その章の記録をそのまま並べています。

| 章 | 何が起きるか | 行（8576f161ae4） | 確かめ方と main |
| --- | --- | --- | --- |
| [1](01-cmd-image.md) | （食い違い）「document の head に preconnect の link を自動で作る」。ディレクティブは作らず、作るのは angular-cli の webpack の `browser` ビルダーだけ | directives/ng\_optimized\_image/ng\_optimized\_image.ts 177 | このサイト（application ビルダー）の index.html に link が 0 件。e33a0ff3dd0 から。main 同じ |
| [1](01-cmd-image.md) | （一覧の欠け）組み込みのローダーの一覧が 4 つで Netlify が無い | ng\_optimized\_image.ts 222〜226 | index.ts は provideNetlifyLoader も出す（03c3b3eb79e）。main 同じ |
| [1](01-cmd-image.md) | （例の誤り）独自のローダーの例と Step 3 で、src が `…logo.png-undefined.jpg` になる | ng\_optimized\_image.ts 238〜245・251 | 記録と本物。getRewrittenSrc は width を渡さない。main 同じ |
| [1](01-cmd-image.md) | （例の誤り）ngSrcset の例に width・height が無く、開発 NG02954、本番 `TypeError` | ng\_optimized\_image.ts 306〜307 | 記録と本物。main 同じ |
| [1](01-cmd-image.md) | （説明不足）decoding の既定は auto と書くが、priority では入力を無視して sync | ng\_optimized\_image.ts 330〜339 | 記録。main 同じ |
| [1](01-cmd-image.md) | （文の誤り）「ngSrc は Base64 の文字列」。`data:` で始まるかだけを見る | ng\_optimized\_image.ts 834・840〜841 | 記録。main 同じ（L846〜847） |
| [1](01-cmd-image.md) | （コメントの誤り）placeholder の大きさと書くが、測るのは img の描かれた大きさ | ng\_optimized\_image.ts 1418 | 読み比べ。main 同じ |
| [1](01-cmd-image.md) | （例の誤り）Step 1 の例に template が無く NG2001 | ng\_optimized\_image.ts 197〜202 | strict の ngc。main 同じ |
| [1](01-cmd-image.md) | （spec の名前）it の名前と中身が違う | test/directives/ng\_optimized\_image\_spec.ts 1434 | 読み比べ。main 同じ |
| [2](02-cmd-image-loaders.md) | （食い違い）Cloudflare の path は「ドメイン名」なのに、例外の文はできあがりの URL を見せ、そのとおり渡すと `/cdn-cgi/image/` が二重 | image\_loaders/cloudflare\_loader.ts 20・28 | 記録。main 同じ |
| [2](02-cmd-image-loaders.md) | （不具合）Imgix のローダーが ngSrc の query（`hero.jpg?crop=faces`）を黙って捨てる | image\_loaders/imgix\_loader.ts 71〜72 | 記録と本物。cloudflare・cloudinary は残す。main 同じ |
| [2](02-cmd-image-loaders.md) | （食い違い）preload の link の src・srcset の説明が元の値と書くが、ローダーを通した URL | preload-link-creator.ts 36〜39・47〜48 | 読み比べ（75e6297f090 から）。main 同じ |
| [2](02-cmd-image-loaders.md) | （食い違い）「例外を投げて知らせる」と書くが console.warn | tokens.ts 14 | 読み比べ。main 同じ |
| [2](02-cmd-image-loaders.md) | （名前の誤り）引数名 ngSrc に、LCP の要素の src（ローダーを通した URL）が渡る | lcp\_image\_observer.ts 178〜179・191〜192 | 読み比べ。main 同じ |
| [2](02-cmd-image-loaders.md) | （例の食い違い）ImageKit・Imgix の説明の例と例外の文の例が違う | imagekit\_loader.ts 44、imgix\_loader.ts 42 | 記録。main 同じ |
| [3](03-cmd-date.md) | （例の誤り）W の例 `1... 5`。6 まで出る | pipes/date\_pipe.ts 142 | 記録と本物（2015-08-31 は 6）。main 同じ |
| [3](03-cmd-date.md) | （例の誤り）aaaa の例「ante meridiem」。en-US は AM/PM | date\_pipe.ts 155 | 記録と本物。main 同じ |
| [3](03-cmd-date.md) | （例の誤り）B・b の例の語が出力と違う。extra なしは NG02303 | date\_pipe.ts 157〜162 | 記録と本物。main 同じ |
| [3](03-cmd-date.md) | （例の誤り）ZZZZ の例 `GMT-8:00`。本物は `GMT-08:00` | date\_pipe.ts 177 | 記録と本物。main 同じ |
| [3](03-cmd-date.md) | （不具合）z・O の短い形が `+04:30` の分を落とす（`GMT+4`） | i18n/format\_date.ts 462・875 | 本物。PR #69239 は閉じた。main 同じ |
| [3](03-cmd-date.md) | （例の誤り）Usage の例の imports に DatePipe が無く NG8004 ×3 | date\_pipe.ts 202〜215 | strict の ngc。main 同じ |
| [3](03-cmd-date.md) | （例の差）medium・shortTime の PM の前は U+202F | date\_pipe.ts 191〜195 | 記録と本物。main 同じ |
| [3](03-cmd-date.md) | （説明不足）Y を y と並べるが、w の無い Y は開発で NG02300、年末に年がずれる | date\_pipe.ts 126〜129 | 記録と本物。main 同じ |
| [3](03-cmd-date.md) | （コメントの誤り）yy の写し、「1..52」（53 まで）、b と B の例の入れ替わり | format\_date.ts 608・680・756・784 | 読み比べと本物。main 同じ |
| [4](04-cmd-number.md) | （例のコメントの誤り）`'0 001,35 CA$'`。fr の CAD は `$CA` | packages/examples/common/pipes/ts/currency\_pipe.ts 37 | 記録と本物（e2e も `$CA`）。60935b29fc1 から。main 同じ |
| [4](04-cmd-number.md) | （例の差）fr の出力のコメントが普通の空白。本物は U+202F・U+00A0 | examples の number\_pipe.ts 36・percent\_pipe.ts 28 | 記録と本物。main 同じ |
| [4](04-cmd-number.md) | （説明の中の食い違い）CurrencyPipe の桁の既定を 2 と書き、すぐ下で通貨の桁と書く | pipes/number\_pipe.ts 247〜253 | 記録と本物（JPY 0、KWD 3）。main 同じ |
| [4](04-cmd-number.md) | （不具合）formatCurrency の display に `$&`・`$$` を渡すと置換の記号として読まれる | i18n/format\_number.ts 209 | 記録と本物。main 同じ |
| [4](04-cmd-number.md) | （不具合）I18nSelectPipe に mapping `null` で `TypeError`（I18nPluralPipe は InvalidPipeArgument） | pipes/i18n\_select\_pipe.ts 44 | 記録と本物。main 同じ |
| [5](05-cmd-structural.md) | （食い違い）NgForOf は「置いた要素が複製の親になる」「繰り返すのは要素の中身」と書くが、置いた要素そのものが兄弟として複製される | directives/ng\_for\_of.ts 76〜77・81〜82 | デモ（`<li>a</li><li>b</li><li>c</li><!---->`）。6c3b57a9682（2018）から。main 同じ |
| [5](05-cmd-structural.md) | （例の誤り）NgPlural の例に other が無く、en-US で 0・1 以外は NG02308 | directives/ng\_plural.ts 19〜25 | デモと記録。2016 年の例（9cee8bcc83c）から。main 同じ |
| [5](05-cmd-structural.md) | （説明不足）`ngPluralCase="0"` も値の一致（`=0` と同じ）。spec 48 は固めるが説明文は「= で始まる値だけ」 | ng\_plural.ts 37〜40（実装 114〜115） | デモ。main 同じ |
| [5](05-cmd-structural.md) | （見出しの誤り）「ケースを入れ子にできる例」に入れ子が無い | directives/ng\_switch.ts 94 | 読み比べ。850b86749c2（2018）から。main 同じ |
| [5](05-cmd-structural.md) | （説明不足）NgIf は「false か null で else」と書くが、偽の値すべて（`0`・`''`・`NaN`・`undefined`）で else | directives/ng\_if.ts 24〜26・67 | デモ。main 同じ |
| [5](05-cmd-structural.md) | （型の食い違い）`ngForTrackBy` の入力の型が `null` を受けないが、実装と spec 320 は `null` を許す | ng\_for\_of.ts L208〜215 | このサイトの build（strictTemplates で TS2322）。main 同じ |
| [5](05-cmd-structural.md) | （綴り）「more complex then a property access」（than） | ng\_for\_of.ts 132（と L40） | main 同じ |
| [5](05-cmd-structural.md) | （振る舞い）NgPlural は同じカテゴリのまま値が変わってもビューを壊して作り直す | ng\_plural.ts L64〜69 | デモ（3 → 4 で 1 つ作り直し）。説明文の食い違いではない。main 同じ |
| [6](06-cmd-attr-outlets.md) | （例の誤り）`[ngClass]="stringExp\|arrayExp\|objExp\|Set"` の `\|` が pipe と読まれ NG8004 ×3 | directives/ng\_class.ts 44 | strictTemplates の ngc。d797c5cb94e（2024-12）から。main 同じ |
| [6](06-cmd-attr-outlets.md) | （一覧の欠け）受け取る形の一覧に Set が無い | ng\_class.ts 65〜69 | デモ（Set も受ける）。main 同じ |
| [6](06-cmd-attr-outlets.md) | （例の誤り）単位の例 `'font-style.em'` は `font-style: 2em` になり、ブラウザーに捨てられる | directives/ng\_style.ts 51 | デモ（Chrome で style 属性が付かない）。a84a9ba705e（2019）から。main 同じ |
| [6](06-cmd-attr-outlets.md) | （食い違い）`ngComponentOutletInjector` の既定は「今の view container の injector」と書くが、実装は `parentInjector` で、outlet と同じ要素のディレクティブの providers が見えない | directives/ng\_component\_outlet.ts 41〜42（実装 L159） | デモ（同じ要素で provide した値でなく外側の値）。3ef73c2b194（2017）の文、実装は 8578682dcfc（2016）から。main 同じ |
| [6](06-cmd-attr-outlets.md) | （説明不足）content の配列は `<ng-content>` の順に入り、`select` で振り分けない | ng\_component\_outlet.ts 47〜48 | デモ。main 同じ |
| [6](06-cmd-attr-outlets.md) | （説明の強さ）context は object「であるべき」だが、文字列で `TypeError: Reflect.get called on non-object` | directives/ng\_template\_outlet.ts 29 | デモと記録。main 同じ |
| [6](06-cmd-attr-outlets.md) | （綴り）「will be bind」（bound） | ng\_component\_outlet.ts 38 | 29d358170b0（2023）から。main 同じ |
| [7](07-cmd-pipes.md) | （食い違い）SlicePipe は「blank は blank のまま」と書くが、`undefined` は `null`（spec 48 は実装の側） | pipes/slice\_pipe.ts 27 | デモ。2c42a50fc3b（2016）から。main 同じ |
| [7](07-cmd-pipes.md) | （古い文）「この ngFor の例」「ngFor で回す例」。例は `@for` に変わった | slice\_pipe.ts 31、keyvalue\_pipe.ts 48 | e7608e503f1・e7d0113dad0（2025）で例だけ変わった。main 同じ |
| [7](07-cmd-pipes.md) | （食い違い）KeyValuePipe は「既定は Unicode の値で比べる」と書くが、数のキーは数の大きさ（Map の 9 と 10 は 9 が先） | keyvalue\_pipe.ts 41 | デモと spec 212。2b49bf77afc（2018）から。main 同じ |
| [7](07-cmd-pipes.md) | （不具合）`keyvalue: null` で、挿入の順だけが違う新しい Map を渡しても前の並びのまま | keyvalue\_pipe.ts 43（実装 L131〜146） | デモ（22.2.6 で再現）。#72114、PR #72115（開）。main 同じ |
| [7](07-cmd-pipes.md) | （食い違い）titlecase は「空白で区切る」と書くが、空白の後ろの記号を飛ばして最初の文字を大文字にする（`'(abc)'` → `'(Abc)'`） | pipes/case\_conversion\_pipes.ts 63 | デモ。d244523ae62（2018）から。main 同じ |
| [7](07-cmd-pipes.md) | （型の食い違い）JsonPipe の戻りの型は `string` で「どの値も JSON の文字列に」と書くが、`undefined`・関数は `undefined`、BigInt・循環は `TypeError` | pipes/json\_pipe.ts 16・35・37 | デモ。main 同じ |
| [7](07-cmd-pipes.md) | （説明不足）AsyncPipe は切り替えた直後に前の値ではなく `null` を返す。Promise は「解除」ではなく結果を捨てるだけ | pipes/async\_pipe.ts 116〜120 | デモ。main 同じ |
| [8](08-cmd-location.md) | （食い違い）「正規化された URL は base href を含む」と書くが、`normalize`・`path` は base href を外す（spec 252 も外す方） | location/location.ts 39〜44 | デモ。2015 年の 0366f317af9 からの文。main 同じ |
| [8](08-cmd-location.md) | （例の誤り）見出しは `/foo/bar/`、渡すのは `'foo/bar'`（答えは `'foo/bar'` のまま） | packages/examples/common/location/ts/path\_location\_component.ts・hash\_location\_component.ts 22 | デモ（両方の戦略）。main 同じ |
| [8](08-cmd-location.md) | （食い違い）go は「正規化した URL に変える」と書くが、末尾のスラッシュを残す（`/my/app/foo/`） | location.ts 163〜164 | デモ。main 同じ |
| [8](08-cmd-location.md) | （文の崩れ）stripTrailingSlash の説明の 2 文目 | location.ts 302〜303、location/util.ts 33〜34 | a6809e0e7dd・b25f9253117 から。main 同じ |
| [8](08-cmd-location.md) | （例の食い違い）APP\_BASE\_HREF の例 `'/my/app'` と、すぐ下の「/ で終わるべき」 | location/location\_strategy.ts 71・94〜95 | 読み比べ（Location の読み書きはどちらでも同じ URL）。main 同じ |
| [8](08-cmd-location.md) | （古い文）ブラウザー用の PlatformLocation は platform-browser が持つ、と書く。2019 年から common の BrowserPlatformLocation | location/platform\_location.ts 20〜21 | デモ（instanceof）。1537791f06d（2019）で移った。main 同じ |
| [8](08-cmd-location.md) | （説明不足）ViewportScroller の offset は「上の余白」だが x も引く、anchor は ID だけでなく name も、scroll restoration は止めるだけでなく auto にも戻せる | viewport\_scroller.ts L35〜38・57・63 | デモ（偽物の window と document）。main 同じ |
| [8](08-cmd-location.md) | （名前の誤り、main で直った）`subscribe` の `@param value`・`@param exception` | location.ts L261〜262 | 6e024600e0b（2026-10-08）で `onNext`・`onThrow`・`onReturn` に直った |
| [9](09-cmd-tests-issues.md) | （spec の前提）web の suite の日付の 2 本が、JST のマシンで落ちる（Node では通る。`--test_env=TZ=UTC` でも同じ） | test/i18n/format\_date\_spec.ts 373〜375、test/pipes/date\_pipe\_spec.ts L169〜171 | 2 節。main 同じ（date\_pipe\_spec.ts は main で L167〜169 にずれる） |

第 5〜8 回の説明文で、書いてあるとおりに動いたものも多くありました。NgIf の then・else・as と 1 回の購読、NgForOf の局所変数と trackBy、NgSwitch の「一致したものは全部」と `===`、NgClass の空白の区切り、NgStyle の `null`、NgTemplateOutlet の例、NgComponentOutlet の 2 つの例、SlicePipe・TitleCasePipe・KeyValuePipe の例のファイルの「期待される出力」、PathLocationStrategy と HashLocationStrategy の例の URL、末尾のスラッシュの 2 つの戦略は、どれも説明文のとおりです。

## 聞かれそうな質問

**Q. 説明文の中の例が壊れていても、CI で気付かないのはなぜですか？**

JSDoc の ```` ```html ```` や ```` ```ts ```` の中は文字列で、どの build もコンパイルしないからです。`{@example}` が指す `packages/examples` のファイルはコンパイルされるので、第 5〜8 回の例のファイル 11 個は strictTemplates に通り、説明文の中の NgClass の例（ng\_class.ts L44）だけが通りませんでした。ただし例のファイルでも、コメントや文字に書いた「期待される出力」は検査されません（第 8 回の `/foo/bar/`、第 4 回の `CA$`）。

**Q. common の spec を 1 つの describe だけ走らせるには？**

`pnpm bazel test //packages/common/test:test --test_arg=--filter="^KeyValuePipe"` のように名前で絞ります。一致が 0 件でも PASSED になるので、`Ran 31 of 667 specs` の行を見ます（1 節）。web の suite（`:test_web`）は filter が効かず、全部を走らせます。

**Q. spec が説明文と逆のことを固めている例はありますか？**

あります。`SlicePipe` の `undefined`（spec 48 は `null`、説明は「blank のまま」）、`Location.normalize`（describe 252 は「route だけ」、クラスの説明は「base href を含む」）、`KeyValuePipe` の数のキー（spec 212 は数の順、説明は「Unicode の値」）です。どれも、説明文の方を実装と spec に合わせるのが筋です。

**Q. 手元で web の suite が落ちたら、まず何を疑いますか？**

マシンの時刻帯です。このマシン（JST）では日付の 2 本が、UTC の 17:00 が翌日になる・オフセットの無い時刻が前日になる、という計算で落ちました。Node の `:test` では同じ 2 本が通ります（2 節）。

**Q. このシリーズで、説明文ではなく実装の不具合と言えるものは？**

第 1〜4 回の Imgix の query の捨て方、`GMT+4:30` の分の落ち方、formatCurrency の置換の記号、I18nSelectPipe の `null`。第 5〜8 回では `keyvalue: null` の Map の並び（#72114）です。NgComponentOutlet の既定の injector は、説明文を実装に合わせるか、実装を説明に合わせるかの選び方の問題です。

## 読み終えて

- common の Node の spec は 667 本で全部通る。web の suite は 678 本で、時刻帯に依る日付の 2 本が JST のマシンで落ちる。
- 説明文の約束の多くは spec に固められているが、例のコンパイル、NgForOf の DOM の形、NgComponentOutlet の既定の injector、object でない context、挿入の順だけ変わった Map は固められていない。
- spec が説明文と逆のことを固めている所（slice の `undefined`、`normalize`、keyvalue の数のキー）は、説明文を直すのが筋。
- 見つけたもののうち、ほとんどは説明文と例の 1〜数行の直し。実装の不具合は第 2〜4 回に 4 つ、第 7 回に 1 つ（PR が開いている）。

---

← 前: [Location と LocationStrategy の説明文](08-cmd-location.md)  
次: [@Directive の説明文：selector・inputs・host・providers・exportAs](../crd/01-crd-directive.md) →
